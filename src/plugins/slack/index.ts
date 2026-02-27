/**
 * Plugin Slack per Kiro Memory.
 *
 * Invia notifiche Slack alla fine di ogni sessione usando un webhook.
 *
 * Configurazione (in config.json, chiave plugins.kiro-memory-plugin-slack):
 *   - webhookUrl: URL del webhook Slack (obbligatorio)
 *   - channel: canale destinazione (opzionale, sovrascrive quello del webhook)
 *   - events: array di hook da notificare (default: ["onSessionEnd"])
 *
 * Caratteristiche:
 *   - Rate limiting: max 1 messaggio per sessione (deduplicazione via Set)
 *   - Retry automatico su HTTP 429 con exponential backoff
 *   - Formattazione Block Kit tramite il modulo formatter
 *   - Nessuna dipendenza esterna (usa fetch nativo)
 */

import type { IPlugin, PluginContext, PluginHooks, PluginLogger } from '../../services/plugins/types.js';
import { buildSlackPayload } from './formatter.js';
import type { SlackMessageData } from './formatter.js';

// ── Costanti ────────────────────────────────────────────────────────────────

/** Numero massimo di retry su HTTP 429 */
const MAX_RETRIES = 3;

/** Delay iniziale per exponential backoff (ms) */
const INITIAL_RETRY_DELAY_MS = 1_000;

/** Timeout per la chiamata HTTP al webhook (ms) */
const FETCH_TIMEOUT_MS = 10_000;

// ── Configurazione del plugin ─────────────────────────────────────────────────

export interface SlackPluginConfig {
  /** URL del webhook Slack (obbligatorio) */
  webhookUrl: string;
  /** Canale Slack di destinazione (opzionale) */
  channel?: string;
  /** Hook da notificare (default: ["onSessionEnd"]) */
  events?: string[];
}

// ── Validazione configurazione ──────────────────────────────────────────────

/**
 * Valida e normalizza la configurazione del plugin.
 * Lancia un errore se webhookUrl è mancante o non valida.
 */
export function validateConfig(raw: Record<string, unknown>): SlackPluginConfig {
  const webhookUrl = raw.webhookUrl;

  if (!webhookUrl || typeof webhookUrl !== 'string') {
    throw new Error('Configurazione Slack: "webhookUrl" è obbligatorio e deve essere una stringa');
  }

  // Validazione URL minima
  if (!webhookUrl.startsWith('https://')) {
    throw new Error('Configurazione Slack: "webhookUrl" deve iniziare con https://');
  }

  const channel = typeof raw.channel === 'string' ? raw.channel : undefined;

  const events = Array.isArray(raw.events)
    ? (raw.events as string[]).filter(e => typeof e === 'string')
    : ['onSessionEnd'];

  return { webhookUrl, channel, events };
}

// ── Invio webhook con retry ─────────────────────────────────────────────────

/**
 * Risultato di una chiamata al webhook Slack.
 */
export interface WebhookResult {
  success: boolean;
  statusCode?: number;
  retries: number;
  error?: string;
}

/**
 * Invia un payload al webhook Slack con retry su HTTP 429.
 *
 * Strategia retry:
 *   - Su 429: usa Retry-After header se presente, altrimenti exponential backoff
 *   - Su altri errori HTTP (4xx/5xx): non ritenta
 *   - Su errori di rete: non ritenta (potrebbe essere un problema di configurazione)
 *
 * @param webhookUrl - URL del webhook Slack
 * @param payload - Payload JSON da inviare
 * @param logger - Logger del plugin per il tracciamento
 * @param fetchFn - Funzione fetch iniettabile (per i test)
 */
export async function sendWebhook(
  webhookUrl: string,
  payload: unknown,
  logger: PluginLogger,
  fetchFn: typeof globalThis.fetch = globalThis.fetch,
): Promise<WebhookResult> {
  let retries = 0;
  let delayMs = INITIAL_RETRY_DELAY_MS;

  while (retries <= MAX_RETRIES) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

      const response = await fetchFn(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      // Successo
      if (response.ok) {
        if (retries > 0) {
          logger.info(`Webhook inviato con successo dopo ${retries} retry`);
        }
        return { success: true, statusCode: response.status, retries };
      }

      // Rate limited: ritenta con backoff
      if (response.status === 429) {
        if (retries >= MAX_RETRIES) {
          logger.warn(`Rate limited (429) dopo ${MAX_RETRIES} retry, rinuncio`);
          return { success: false, statusCode: 429, retries, error: 'Rate limited: superato il numero massimo di retry' };
        }

        // Usa Retry-After se presente
        const retryAfter = response.headers.get('Retry-After');
        const waitMs = retryAfter
          ? Math.min(parseInt(retryAfter, 10) * 1000, 30_000) // Max 30s di attesa
          : delayMs;

        logger.warn(`Rate limited (429), retry ${retries + 1}/${MAX_RETRIES} tra ${waitMs}ms`);

        await sleep(waitMs);
        retries++;
        delayMs *= 2; // Exponential backoff
        continue;
      }

      // Altri errori HTTP: non ritentare
      const errorBody = await response.text().catch(() => '');
      logger.error(`Webhook fallito con status ${response.status}: ${errorBody}`);
      return {
        success: false,
        statusCode: response.status,
        retries,
        error: `HTTP ${response.status}: ${errorBody}`,
      };
    } catch (err) {
      // Errori di rete o timeout: non ritentare
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(`Errore di rete nell'invio webhook: ${msg}`);
      return { success: false, retries, error: `Errore di rete: ${msg}` };
    }
  }

  // Non dovrebbe mai arrivare qui, ma per sicurezza
  return { success: false, retries, error: 'Retry esauriti' };
}

/**
 * Helper sleep per i retry.
 * Funzione separata per consentire mock nei test.
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ── Plugin Slack ─────────────────────────────────────────────────────────────

/**
 * Crea un'istanza del plugin Slack per Kiro Memory.
 *
 * Il plugin è implementato come factory function che restituisce un oggetto IPlugin.
 * Lo stato interno (config, logger, sessioni notificate) è incapsulato nella closure.
 */
export function createSlackPlugin(): IPlugin {
  // Stato interno del plugin
  let pluginConfig: SlackPluginConfig | null = null;
  let pluginLogger: PluginLogger | null = null;

  /**
   * Set delle sessioni già notificate.
   * Garantisce il rate limiting: max 1 messaggio per sessione.
   */
  const notifiedSessions = new Set<string>();

  // ── Hook onSessionEnd ──────────────────────────────────────────────────────

  async function handleSessionEnd(session: {
    id: string;
    project: string;
    summary: string | null;
  }): Promise<void> {
    if (!pluginConfig || !pluginLogger) {
      return; // Plugin non inizializzato
    }

    // Rate limiting: verifica se questa sessione è già stata notificata
    if (notifiedSessions.has(session.id)) {
      pluginLogger.info(`Sessione ${session.id} già notificata, skip`);
      return;
    }

    // Verifica che onSessionEnd sia tra gli eventi abilitati
    if (!pluginConfig.events?.includes('onSessionEnd')) {
      pluginLogger.info('Hook onSessionEnd non abilitato nella configurazione');
      return;
    }

    // Prepara i dati per il messaggio
    const messageData: SlackMessageData = {
      sessionId: session.id,
      project: session.project,
      summary: session.summary,
      channel: pluginConfig.channel,
    };

    // Costruisci e invia il payload
    const payload = buildSlackPayload(messageData);
    const result = await sendWebhook(
      pluginConfig.webhookUrl,
      payload,
      pluginLogger,
    );

    if (result.success) {
      // Registra la sessione come notificata (rate limiting)
      notifiedSessions.add(session.id);
      pluginLogger.info(`Notifica Slack inviata per sessione ${session.id}`);
    } else {
      pluginLogger.error(`Notifica Slack fallita per sessione ${session.id}: ${result.error}`);
    }
  }

  // ── Oggetto IPlugin ──────────────────────────────────────────────────────────

  const plugin: IPlugin = {
    name: 'kiro-memory-plugin-slack',
    version: '1.0.0',
    description: 'Notifiche Slack per sessioni Kiro Memory',
    minKiroVersion: '2.0.0',

    async init(context: PluginContext): Promise<void> {
      pluginLogger = context.logger;

      // Valida la configurazione
      pluginConfig = validateConfig(context.config);

      pluginLogger.info(`Inizializzato — webhook configurato, eventi: [${pluginConfig.events?.join(', ')}]`);
    },

    async destroy(): Promise<void> {
      // Pulisci lo stato interno
      notifiedSessions.clear();
      pluginConfig = null;
      pluginLogger?.info('Plugin Slack distrutto');
      pluginLogger = null;
    },

    hooks: {
      onSessionEnd: handleSessionEnd,
    } satisfies PluginHooks,
  };

  return plugin;
}

// ── Export default ────────────────────────────────────────────────────────────

export default createSlackPlugin;
