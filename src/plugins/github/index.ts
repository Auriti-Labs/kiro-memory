/**
 * Plugin GitHub per Total Recall.
 *
 * Implementa IPlugin con due hook principali:
 *   - onObservation → rileva riferimenti issue (#123) nel titolo/narrative
 *   - onSessionEnd  → commenta automaticamente sulle issue linkate con il summary della sessione
 *
 * Configurazione (in config.json → plugins.totalrecall-plugin-github):
 *   - token: GitHub Personal Access Token (obbligatorio)
 *   - repo: repository default "owner/repo" (opzionale)
 *   - baseUrl: URL base per GitHub Enterprise (opzionale)
 *
 * Zero dipendenze esterne — usa fetch() nativo.
 */

import type { IPlugin, PluginContext, PluginHooks, PluginLogger } from '../../services/plugins/types.js';
import { GitHubClient } from './github-client.js';
import { parseIssueReferences, type IssueReference } from './issue-parser.js';

// ── Configurazione del plugin ────────────────────────────────────────────────

interface GitHubPluginConfig {
  /** Token GitHub Personal Access Token */
  token: string;
  /** Repository default nel formato "owner/repo" */
  repo?: string;
  /** URL base per GitHub Enterprise (default: https://api.github.com) */
  baseUrl?: string;
  /** Abilita commento automatico su issue a fine sessione (default: true) */
  autoComment?: boolean;
}

// ── Issue linkata durante la sessione ────────────────────────────────────────

interface LinkedIssue {
  /** Numero della issue */
  number: number;
  /** Owner del repo */
  owner: string;
  /** Nome del repo */
  repo: string;
  /** Titoli delle osservazioni che hanno referenziato la issue */
  observationTitles: string[];
  /** Keyword associate (closes, fixes, etc.) */
  keywords: Set<string>;
}

// ── Plugin ───────────────────────────────────────────────────────────────────

export class GitHubPlugin implements IPlugin {
  readonly name = 'totalrecall-plugin-github';
  readonly version = '1.0.0';
  readonly description = 'Integrazione GitHub: rileva issue references e commenta a fine sessione';
  readonly minKiroVersion = '2.0.0';

  /** Client HTTP per le GitHub API */
  private client: GitHubClient | null = null;

  /** Logger iniettato dal registry */
  private logger: PluginLogger | null = null;

  /** Configurazione validata */
  private config: GitHubPluginConfig | null = null;

  /** Mappa issue linkate nella sessione corrente (chiave: "owner/repo#number") */
  private linkedIssues = new Map<string, LinkedIssue>();

  /** Hook esposti al registry */
  readonly hooks: PluginHooks = {
    onObservation: async (obs) => this.handleObservation(obs),
    onSessionEnd: async (session) => this.handleSessionEnd(session),
  };

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  async init(context: PluginContext): Promise<void> {
    this.logger = context.logger;

    // Valida e parsa la configurazione
    this.config = this.parseConfig(context.config);

    if (!this.config.token) {
      throw new Error('Configurazione mancante: "token" è obbligatorio per il plugin GitHub');
    }

    // Inizializza il client HTTP
    this.client = new GitHubClient(
      {
        token: this.config.token,
        baseUrl: this.config.baseUrl,
      },
      this.logger
    );

    this.logger.info('Plugin GitHub inizializzato');
    if (this.config.repo) {
      this.logger.info(`Repository default: ${this.config.repo}`);
    }
  }

  async destroy(): Promise<void> {
    // Pulisci risorse
    this.client?.clearCache();
    this.linkedIssues.clear();
    this.client = null;
    this.config = null;
    this.logger?.info('Plugin GitHub distrutto');
    this.logger = null;
  }

  // ── Hook: onObservation ────────────────────────────────────────────────────

  /**
   * Rileva riferimenti issue nel titolo dell'osservazione.
   * Accumula le issue trovate per il commento a fine sessione.
   */
  private async handleObservation(obs: {
    id: number;
    project: string;
    type: string;
    title: string;
  }): Promise<void> {
    if (!this.client || !this.config) return;

    // Cerca riferimenti nel titolo
    const refs = parseIssueReferences(obs.title);
    if (refs.length === 0) return;

    this.logger?.info(`Trovati ${refs.length} riferimenti issue in osservazione "${obs.title}"`);

    for (const ref of refs) {
      this.trackIssue(ref, obs.title);
    }
  }

  // ── Hook: onSessionEnd ─────────────────────────────────────────────────────

  /**
   * Commenta automaticamente sulle issue linkate con un riepilogo della sessione.
   * Chiamato alla chiusura di ogni sessione.
   */
  private async handleSessionEnd(session: {
    id: string;
    project: string;
    summary: string | null;
  }): Promise<void> {
    if (!this.client || !this.config) return;
    if (this.config.autoComment === false) return;
    if (this.linkedIssues.size === 0) return;
    if (!session.summary) {
      this.logger?.info('Nessun summary di sessione, skip commento su issue');
      return;
    }

    this.logger?.info(`Fine sessione: commento su ${this.linkedIssues.size} issue linkate`);

    // Genera e posta commenti per ogni issue linkata
    const issues = Array.from(this.linkedIssues.values());
    const results = await Promise.allSettled(
      issues.map((issue) => this.commentOnIssue(issue, session))
    );

    // Log dei risultati
    let successi = 0;
    let errori = 0;
    for (const result of results) {
      if (result.status === 'fulfilled') {
        successi++;
      } else {
        errori++;
        this.logger?.warn(`Errore commento su issue: ${result.reason}`);
      }
    }

    this.logger?.info(`Commenti: ${successi} riusciti, ${errori} falliti`);

    // Pulisci le issue linkate per la prossima sessione
    this.linkedIssues.clear();
  }

  // ── Metodi privati ─────────────────────────────────────────────────────────

  /**
   * Traccia una issue reference trovata in un'osservazione.
   * Se la issue è già tracciata, aggiunge il titolo dell'osservazione.
   */
  private trackIssue(ref: IssueReference, observationTitle: string): void {
    // Risolvi owner e repo: usa quelli dal reference, o il default dalla config
    const { owner, repo } = this.resolveOwnerRepo(ref);
    if (!owner || !repo) {
      this.logger?.warn(`Impossibile risolvere owner/repo per issue #${ref.number} — configura "repo" nel plugin`);
      return;
    }

    const key = `${owner}/${repo}#${ref.number}`;

    const existing = this.linkedIssues.get(key);
    if (existing) {
      existing.observationTitles.push(observationTitle);
      if (ref.keyword) existing.keywords.add(ref.keyword);
    } else {
      this.linkedIssues.set(key, {
        number: ref.number,
        owner,
        repo,
        observationTitles: [observationTitle],
        keywords: new Set(ref.keyword ? [ref.keyword] : []),
      });
    }
  }

  /**
   * Risolve owner e repo da un IssueReference.
   * Usa il reference se specifico, altrimenti il default dalla configurazione.
   */
  private resolveOwnerRepo(ref: IssueReference): { owner?: string; repo?: string } {
    if (ref.owner && ref.repo) {
      return { owner: ref.owner, repo: ref.repo };
    }

    // Usa il repo default dalla configurazione
    if (this.config?.repo) {
      const parts = this.config.repo.split('/');
      if (parts.length === 2) {
        return { owner: parts[0], repo: parts[1] };
      }
    }

    return {};
  }

  /**
   * Genera il corpo del commento e lo posta sulla issue.
   */
  private async commentOnIssue(
    issue: LinkedIssue,
    session: { id: string; project: string; summary: string | null }
  ): Promise<void> {
    if (!this.client || !session.summary) return;

    const body = this.formatComment(issue, session);

    await this.client.addComment(
      issue.owner,
      issue.repo,
      issue.number,
      body
    );

    this.logger?.info(`Commento postato su ${issue.owner}/${issue.repo}#${issue.number}`);
  }

  /**
   * Formatta il corpo del commento per una issue.
   */
  private formatComment(
    issue: LinkedIssue,
    session: { id: string; project: string; summary: string | null }
  ): string {
    const lines: string[] = [];

    lines.push(`### 🧠 Total Recall — Sessione \`${session.id}\``);
    lines.push('');
    lines.push(`**Progetto:** ${session.project}`);
    lines.push('');

    // Keywords associate (closes, fixes, etc.)
    if (issue.keywords.size > 0) {
      const keywords = Array.from(issue.keywords).join(', ');
      lines.push(`**Azioni:** ${keywords}`);
      lines.push('');
    }

    // Osservazioni correlate
    if (issue.observationTitles.length > 0) {
      lines.push('**Osservazioni correlate:**');
      for (const title of issue.observationTitles.slice(0, 10)) {
        lines.push(`- ${title}`);
      }
      if (issue.observationTitles.length > 10) {
        lines.push(`- _...e altre ${issue.observationTitles.length - 10}_`);
      }
      lines.push('');
    }

    // Summary della sessione
    lines.push('**Riepilogo sessione:**');
    lines.push(session.summary || '_Nessun riepilogo disponibile_');
    lines.push('');
    lines.push('---');
    lines.push('_Commento generato automaticamente da [totalrecall](https://github.com/Auriti-Labs/totalrecall)_');

    return lines.join('\n');
  }

  /**
   * Parsa la configurazione grezza del plugin.
   * Valida i campi e restituisce un oggetto tipizzato.
   */
  private parseConfig(raw: Record<string, unknown>): GitHubPluginConfig {
    return {
      token: typeof raw['token'] === 'string' ? raw['token'] : '',
      repo: typeof raw['repo'] === 'string' ? raw['repo'] : undefined,
      baseUrl: typeof raw['baseUrl'] === 'string' ? raw['baseUrl'] : undefined,
      autoComment: raw['autoComment'] !== false, // default: true
    };
  }

  // ── Metodi esposti per testing ─────────────────────────────────────────────

  /**
   * Restituisce le issue attualmente tracciate nella sessione.
   * @internal Usato solo nei test.
   */
  _getLinkedIssues(): Map<string, LinkedIssue> {
    return this.linkedIssues;
  }

  /**
   * Restituisce il client HTTP interno.
   * @internal Usato solo nei test.
   */
  _getClient(): GitHubClient | null {
    return this.client;
  }
}

// ── Export default per il PluginLoader ────────────────────────────────────────

export default new GitHubPlugin();
