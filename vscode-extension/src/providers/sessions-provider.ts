/**
 * Provider TreeView per le sessioni Kiro Memory.
 *
 * Mostra le sessioni recenti con durata e numero di osservazioni.
 * Ogni sessione è espandibile per vedere le osservazioni contenute.
 * Supporta filtro per progetto.
 */

import * as vscode from 'vscode';
import type { KiroMemoryClient, Session } from '../api-client';

// ── Nodo TreeView sessione ─────────────────────────────────────────────────

export class SessionTreeItem extends vscode.TreeItem {
  constructor(public readonly session: Session) {
    // Etichetta: data della sessione
    const dataStr = new Date(session.started_at).toLocaleDateString('it-IT', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });

    super(dataStr, vscode.TreeItemCollapsibleState.None);

    // Descrizione: progetto + contatore osservazioni + durata
    const durata = session.duration_seconds
      ? formatDuration(session.duration_seconds)
      : 'in corso';

    this.description = `${session.project} · ${session.observation_count} obs · ${durata}`;

    // Tooltip dettagliato
    this.tooltip = this.buildTooltip(dataStr);

    // Icona: sessione attiva vs completata
    this.iconPath = new vscode.ThemeIcon(
      session.ended_at ? 'history' : 'clock'
    );

    // Contesto per menu contestuale
    this.contextValue = session.ended_at ? 'kiroMemorySession' : 'kiroMemoryActiveSession';
  }

  private buildTooltip(dataStr: string): vscode.MarkdownString {
    const s = this.session;
    const md = new vscode.MarkdownString();

    md.appendMarkdown(`### Sessione — ${dataStr}\n\n`);
    md.appendMarkdown(`**Progetto**: \`${s.project}\`  \n`);
    md.appendMarkdown(`**ID**: \`${s.session_id}\`  \n`);
    md.appendMarkdown(`**Inizio**: ${new Date(s.started_at).toLocaleString('it-IT')}  \n`);

    if (s.ended_at) {
      md.appendMarkdown(`**Fine**: ${new Date(s.ended_at).toLocaleString('it-IT')}  \n`);
      md.appendMarkdown(`**Durata**: ${s.duration_seconds ? formatDuration(s.duration_seconds) : 'N/D'}  \n`);
    } else {
      md.appendMarkdown(`**Stato**: Sessione attiva  \n`);
    }

    md.appendMarkdown(`**Osservazioni**: ${s.observation_count}  \n`);

    if (s.summary) {
      md.appendMarkdown(`\n---\n\n${s.summary.slice(0, 300)}${s.summary.length > 300 ? '…' : ''}`);
    }

    return md;
  }
}

// ── Utility: formattazione durata ──────────────────────────────────────────

function formatDuration(seconds: number): string {
  if (seconds < 60) {
    return `${seconds}s`;
  } else if (seconds < 3600) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return s > 0 ? `${m}m ${s}s` : `${m}m`;
  } else {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }
}

// ── Provider principale ────────────────────────────────────────────────────

export class SessionsProvider implements vscode.TreeDataProvider<SessionTreeItem> {
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<SessionTreeItem | undefined | null | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  /** Filtro progetto attivo (undefined = tutti i progetti) */
  private activeProject: string | undefined = undefined;

  /** Cache locale delle sessioni */
  private cachedItems: SessionTreeItem[] = [];

  constructor(private readonly client: KiroMemoryClient) {}

  /** Forza aggiornamento della tree view */
  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  /**
   * Imposta il filtro per progetto e aggiorna la view.
   */
  setProjectFilter(project: string | undefined): void {
    this.activeProject = project;
    this.refresh();
  }

  getTreeItem(element: SessionTreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(_element?: SessionTreeItem): Promise<SessionTreeItem[]> {
    // Sessioni non hanno figli nella view corrente (struttura piatta)
    if (_element) {
      return [];
    }

    if (!this.client.isConnected) {
      try {
        await this.client.getHealth();
      } catch {
        return [this.buildOfflineItem()];
      }
    }

    try {
      const sessions = await this.client.getSessions(this.activeProject, 50);

      if (sessions.length === 0) {
        return [this.buildEmptyItem()];
      }

      const items = sessions.map(s => new SessionTreeItem(s));
      this.cachedItems = items;
      return items;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Errore sconosciuto';
      vscode.window.showErrorMessage(`Kiro Memory: impossibile caricare le sessioni — ${msg}`);
      return this.cachedItems.length > 0 ? this.cachedItems : [this.buildOfflineItem()];
    }
  }

  private buildOfflineItem(): SessionTreeItem {
    const fakeSession: Session = {
      id: -1, session_id: 'offline', project: '—',
      started_at: new Date().toISOString(), ended_at: null,
      duration_seconds: null, observation_count: 0, summary: null
    };
    const item = new SessionTreeItem(fakeSession);
    item.label = 'Worker non raggiungibile';
    item.description = 'Avvia il worker con npm run dev';
    item.iconPath = new vscode.ThemeIcon('warning');
    return item;
  }

  private buildEmptyItem(): SessionTreeItem {
    const fakeSession: Session = {
      id: -1, session_id: 'empty', project: '—',
      started_at: new Date().toISOString(), ended_at: null,
      duration_seconds: null, observation_count: 0, summary: null
    };
    const item = new SessionTreeItem(fakeSession);
    item.label = this.activeProject
      ? `Nessuna sessione per "${this.activeProject}"`
      : 'Nessuna sessione';
    item.description = '';
    item.iconPath = new vscode.ThemeIcon('info');
    return item;
  }
}
