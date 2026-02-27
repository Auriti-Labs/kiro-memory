/**
 * Formatter Slack Block Kit per il plugin Slack di Kiro Memory.
 *
 * Genera blocchi compatibili con l'API Slack Block Kit:
 * - Header con titolo sessione
 * - Sezione statistiche (progetto, durata, osservazioni)
 * - Sezione sommario della sessione
 * - Contesto con timestamp
 *
 * Riferimento: https://api.slack.com/block-kit
 */

// ── Tipi Slack Block Kit ─────────────────────────────────────────────────────

/** Tipo generico per un blocco Slack */
export interface SlackBlock {
  type: string;
  [key: string]: unknown;
}

/** Blocco header */
export interface HeaderBlock extends SlackBlock {
  type: 'header';
  text: { type: 'plain_text'; text: string; emoji?: boolean };
}

/** Blocco sezione con testo markdown */
export interface SectionBlock extends SlackBlock {
  type: 'section';
  text: { type: 'mrkdwn'; text: string };
  fields?: Array<{ type: 'mrkdwn'; text: string }>;
}

/** Blocco divider */
export interface DividerBlock extends SlackBlock {
  type: 'divider';
}

/** Blocco contesto (testo piccolo in fondo) */
export interface ContextBlock extends SlackBlock {
  type: 'context';
  elements: Array<{ type: 'mrkdwn'; text: string }>;
}

// ── Dati di input per la formattazione ──────────────────────────────────────

export interface SlackMessageData {
  /** ID sessione Kiro */
  sessionId: string;
  /** Nome del progetto */
  project: string;
  /** Sommario generato a fine sessione (può essere null) */
  summary: string | null;
  /** Canale Slack di destinazione (opzionale, usato nel payload) */
  channel?: string;
}

// ── Payload Slack webhook ─────────────────────────────────────────────────────

export interface SlackPayload {
  /** Canale destinazione (opzionale per webhook con canale predefinito) */
  channel?: string;
  /** Testo di fallback per notifiche (usato quando i blocchi non sono supportati) */
  text: string;
  /** Blocchi Block Kit */
  blocks: SlackBlock[];
}

// ── Funzioni di formattazione ────────────────────────────────────────────────

/**
 * Tronca un testo alla lunghezza massima, aggiungendo "..." se necessario.
 */
export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + '...';
}

/**
 * Crea il blocco header con il titolo della sessione.
 */
export function buildHeaderBlock(project: string): HeaderBlock {
  return {
    type: 'header',
    text: {
      type: 'plain_text',
      text: `Sessione completata: ${project}`,
      emoji: true,
    },
  };
}

/**
 * Crea il blocco sezione con le statistiche della sessione.
 */
export function buildStatsBlock(data: SlackMessageData): SectionBlock {
  return {
    type: 'section',
    fields: [
      {
        type: 'mrkdwn',
        text: `*Progetto:*\n${data.project}`,
      },
      {
        type: 'mrkdwn',
        text: `*Sessione:*\n\`${truncateText(data.sessionId, 12)}\``,
      },
    ],
    text: {
      type: 'mrkdwn',
      text: ' ', // Campo obbligatorio ma non usato quando ci sono fields
    },
  };
}

/**
 * Crea il blocco sezione con il sommario della sessione.
 * Se il sommario è null o vuoto, mostra un messaggio di fallback.
 */
export function buildSummaryBlock(summary: string | null): SectionBlock {
  const displayText = summary && summary.trim().length > 0
    ? truncateText(summary.trim(), 2500) // Limite Slack per testo nei blocchi
    : '_Nessun sommario disponibile per questa sessione._';

  return {
    type: 'section',
    text: {
      type: 'mrkdwn',
      text: `*Sommario:*\n${displayText}`,
    },
  };
}

/**
 * Crea il blocco divider.
 */
export function buildDivider(): DividerBlock {
  return { type: 'divider' };
}

/**
 * Crea il blocco contesto con il timestamp.
 */
export function buildContextBlock(): ContextBlock {
  const timestamp = new Date().toISOString();
  return {
    type: 'context',
    elements: [
      {
        type: 'mrkdwn',
        text: `Kiro Memory | ${timestamp}`,
      },
    ],
  };
}

/**
 * Costruisce il payload completo per il webhook Slack.
 *
 * Struttura dei blocchi:
 *   1. Header — titolo con nome progetto
 *   2. Divider
 *   3. Statistiche — progetto e sessione ID
 *   4. Sommario — testo del sommario o fallback
 *   5. Divider
 *   6. Contesto — timestamp
 */
export function buildSlackPayload(data: SlackMessageData): SlackPayload {
  const blocks: SlackBlock[] = [
    buildHeaderBlock(data.project),
    buildDivider(),
    buildStatsBlock(data),
    buildSummaryBlock(data.summary),
    buildDivider(),
    buildContextBlock(),
  ];

  // Testo di fallback per client che non supportano Block Kit
  const fallback = data.summary
    ? `Sessione ${data.project} completata: ${truncateText(data.summary, 200)}`
    : `Sessione ${data.project} completata.`;

  return {
    ...(data.channel ? { channel: data.channel } : {}),
    text: fallback,
    blocks,
  };
}
