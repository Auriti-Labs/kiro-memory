/**
 * Import/Export JSONL per Kiro Memory.
 *
 * Implementa:
 * - Export streaming senza caricare tutto in memoria
 * - Import con deduplicazione SHA256 e batch insert (100 record/batch)
 * - Validazione per ogni riga
 * - Dry-run mode per import
 */

import { Database } from 'bun:sqlite';
import { createHash } from 'crypto';

// ── Versione schema JSONL ──
export const JSONL_SCHEMA_VERSION = '2.5.0';

// ── Dimensione batch per insert ──
const IMPORT_BATCH_SIZE = 100;

// ── Tipi ──

/** Metadati nel primo record del file JSONL */
export interface JsonlMeta {
  _meta: {
    version: string;
    exported_at: string;
    counts: {
      observations?: number;
      summaries?: number;
      prompts?: number;
    };
    filters?: {
      project?: string;
      type?: string;
      from?: string;
      to?: string;
    };
  };
}

/** Tipo discriminante per ogni record JSONL */
export type JsonlRecordType = 'observation' | 'summary' | 'prompt';

/** Riga JSONL per una observation */
export interface JsonlObservation {
  _type: 'observation';
  id: number;
  memory_session_id: string;
  project: string;
  type: string;
  title: string;
  subtitle: string | null;
  text: string | null;
  narrative: string | null;
  facts: string | null;
  concepts: string | null;
  files_read: string | null;
  files_modified: string | null;
  prompt_number: number;
  content_hash: string | null;
  discovery_tokens: number;
  auto_category: string | null;
  created_at: string;
  created_at_epoch: number;
}

/** Riga JSONL per un summary */
export interface JsonlSummary {
  _type: 'summary';
  id: number;
  session_id: string;
  project: string;
  request: string | null;
  investigated: string | null;
  learned: string | null;
  completed: string | null;
  next_steps: string | null;
  notes: string | null;
  discovery_tokens: number;
  created_at: string;
  created_at_epoch: number;
}

/** Riga JSONL per un prompt */
export interface JsonlPrompt {
  _type: 'prompt';
  id: number;
  content_session_id: string;
  project: string;
  prompt_number: number;
  prompt_text: string;
  created_at: string;
  created_at_epoch: number;
}

/** Unione di tutti i tipi riga */
export type JsonlRecord = JsonlMeta | JsonlObservation | JsonlSummary | JsonlPrompt;

// ── Filtri export ──

export interface ExportFilters {
  project?: string;
  type?: string;        // solo per observations
  from?: string;        // ISO date string
  to?: string;          // ISO date string
}

// ── Risultato import ──

export interface ImportResult {
  imported: number;
  skipped: number;
  errors: number;
  total: number;
  errorDetails: Array<{ line: number; error: string }>;
}

// ── Export ──

/**
 * Conta i record che verranno esportati con i filtri forniti.
 * Usato per popolare il campo _meta.counts.
 */
export function countExportRecords(
  db: Database,
  filters: ExportFilters
): { observations: number; summaries: number; prompts: number } {
  const { fromEpoch, toEpoch } = filtersToEpoch(filters);

  // Costruisce le condizioni SQL
  const obsConds = buildConditions({ project: filters.project, type: filters.type, fromEpoch, toEpoch });
  const sumConds = buildConditions({ project: filters.project, fromEpoch, toEpoch });
  const promptConds = buildConditions({ project: filters.project, fromEpoch, toEpoch });

  const obsCount = (db.query(
    `SELECT COUNT(*) as c FROM observations WHERE ${obsConds.where}`
  ).get(...obsConds.params) as { c: number }).c;

  const sumCount = (db.query(
    `SELECT COUNT(*) as c FROM summaries WHERE ${sumConds.where}`
  ).get(...sumConds.params) as { c: number }).c;

  const promptCount = (db.query(
    `SELECT COUNT(*) as c FROM prompts WHERE ${promptConds.where}`
  ).get(...promptConds.params) as { c: number }).c;

  return { observations: obsCount, summaries: sumCount, prompts: promptCount };
}

/**
 * Genera il record _meta come prima riga del JSONL.
 */
export function generateMetaRecord(
  db: Database,
  filters: ExportFilters
): string {
  const counts = countExportRecords(db, filters);
  const meta: JsonlMeta = {
    _meta: {
      version: JSONL_SCHEMA_VERSION,
      exported_at: new Date().toISOString(),
      counts,
      filters: Object.keys(filters).length > 0 ? filters : undefined,
    }
  };
  return JSON.stringify(meta);
}

/**
 * Genera le righe JSONL per le observations con i filtri dati.
 * Usa un cursore (offset/limit) per lo streaming senza caricare tutto in memoria.
 * Callback `onRow` viene chiamata per ogni riga JSON.
 */
export function exportObservationsStreaming(
  db: Database,
  filters: ExportFilters,
  onRow: (line: string) => void,
  batchSize: number = 200
): number {
  const { fromEpoch, toEpoch } = filtersToEpoch(filters);
  const conds = buildConditions({ project: filters.project, type: filters.type, fromEpoch, toEpoch });

  let offset = 0;
  let total = 0;

  while (true) {
    const rows = db.query(
      `SELECT id, memory_session_id, project, type, title, subtitle, text, narrative, facts, concepts,
              files_read, files_modified, prompt_number, content_hash, discovery_tokens, auto_category,
              created_at, created_at_epoch
       FROM observations
       WHERE ${conds.where}
       ORDER BY created_at_epoch ASC, id ASC
       LIMIT ? OFFSET ?`
    ).all(...conds.params, batchSize, offset) as any[];

    if (rows.length === 0) break;

    for (const row of rows) {
      const record: JsonlObservation = {
        _type: 'observation',
        id: row.id,
        memory_session_id: row.memory_session_id,
        project: row.project,
        type: row.type,
        title: row.title,
        subtitle: row.subtitle,
        text: row.text,
        narrative: row.narrative,
        facts: row.facts,
        concepts: row.concepts,
        files_read: row.files_read,
        files_modified: row.files_modified,
        prompt_number: row.prompt_number,
        content_hash: row.content_hash,
        discovery_tokens: row.discovery_tokens ?? 0,
        auto_category: row.auto_category,
        created_at: row.created_at,
        created_at_epoch: row.created_at_epoch,
      };
      onRow(JSON.stringify(record));
      total++;
    }

    offset += rows.length;
    if (rows.length < batchSize) break;
  }

  return total;
}

/**
 * Genera le righe JSONL per i summaries con i filtri dati.
 */
export function exportSummariesStreaming(
  db: Database,
  filters: ExportFilters,
  onRow: (line: string) => void,
  batchSize: number = 200
): number {
  const { fromEpoch, toEpoch } = filtersToEpoch(filters);
  const conds = buildConditions({ project: filters.project, fromEpoch, toEpoch });

  let offset = 0;
  let total = 0;

  while (true) {
    const rows = db.query(
      `SELECT id, session_id, project, request, investigated, learned, completed, next_steps, notes,
              discovery_tokens, created_at, created_at_epoch
       FROM summaries
       WHERE ${conds.where}
       ORDER BY created_at_epoch ASC, id ASC
       LIMIT ? OFFSET ?`
    ).all(...conds.params, batchSize, offset) as any[];

    if (rows.length === 0) break;

    for (const row of rows) {
      const record: JsonlSummary = {
        _type: 'summary',
        id: row.id,
        session_id: row.session_id,
        project: row.project,
        request: row.request,
        investigated: row.investigated,
        learned: row.learned,
        completed: row.completed,
        next_steps: row.next_steps,
        notes: row.notes,
        discovery_tokens: row.discovery_tokens ?? 0,
        created_at: row.created_at,
        created_at_epoch: row.created_at_epoch,
      };
      onRow(JSON.stringify(record));
      total++;
    }

    offset += rows.length;
    if (rows.length < batchSize) break;
  }

  return total;
}

/**
 * Genera le righe JSONL per i prompts con i filtri dati.
 */
export function exportPromptsStreaming(
  db: Database,
  filters: ExportFilters,
  onRow: (line: string) => void,
  batchSize: number = 200
): number {
  const { fromEpoch, toEpoch } = filtersToEpoch(filters);
  const conds = buildConditions({ project: filters.project, fromEpoch, toEpoch });

  let offset = 0;
  let total = 0;

  while (true) {
    const rows = db.query(
      `SELECT id, content_session_id, project, prompt_number, prompt_text, created_at, created_at_epoch
       FROM prompts
       WHERE ${conds.where}
       ORDER BY created_at_epoch ASC, id ASC
       LIMIT ? OFFSET ?`
    ).all(...conds.params, batchSize, offset) as any[];

    if (rows.length === 0) break;

    for (const row of rows) {
      const record: JsonlPrompt = {
        _type: 'prompt',
        id: row.id,
        content_session_id: row.content_session_id,
        project: row.project,
        prompt_number: row.prompt_number,
        prompt_text: row.prompt_text,
        created_at: row.created_at,
        created_at_epoch: row.created_at_epoch,
      };
      onRow(JSON.stringify(record));
      total++;
    }

    offset += rows.length;
    if (rows.length < batchSize) break;
  }

  return total;
}

// ── Import ──

/**
 * Valida una riga JSONL decodificata.
 * Ritorna null se valida, altrimenti la descrizione dell'errore.
 */
export function validateJsonlRow(raw: unknown): string | null {
  if (!raw || typeof raw !== 'object') {
    return 'Il record non è un oggetto JSON valido';
  }

  const rec = raw as Record<string, unknown>;

  // Salta il record _meta
  if ('_meta' in rec) return null;

  // Verifica _type
  const validTypes: JsonlRecordType[] = ['observation', 'summary', 'prompt'];
  if (!rec._type || typeof rec._type !== 'string' || !validTypes.includes(rec._type as JsonlRecordType)) {
    return `Campo "_type" obbligatorio, uno di: ${validTypes.join(', ')}`;
  }

  // Validazione per tipo
  if (rec._type === 'observation') {
    if (!rec.project || typeof rec.project !== 'string') return 'observation: campo "project" obbligatorio';
    if (!rec.type || typeof rec.type !== 'string') return 'observation: campo "type" obbligatorio';
    if (!rec.title || typeof rec.title !== 'string') return 'observation: campo "title" obbligatorio';
    if ((rec.project as string).length > 200) return 'observation: "project" troppo lungo (max 200)';
    if ((rec.title as string).length > 500) return 'observation: "title" troppo lungo (max 500)';
  } else if (rec._type === 'summary') {
    if (!rec.project || typeof rec.project !== 'string') return 'summary: campo "project" obbligatorio';
    if (!rec.session_id || typeof rec.session_id !== 'string') return 'summary: campo "session_id" obbligatorio';
  } else if (rec._type === 'prompt') {
    if (!rec.project || typeof rec.project !== 'string') return 'prompt: campo "project" obbligatorio';
    if (!rec.content_session_id || typeof rec.content_session_id !== 'string') return 'prompt: campo "content_session_id" obbligatorio';
    if (!rec.prompt_text || typeof rec.prompt_text !== 'string') return 'prompt: campo "prompt_text" obbligatorio';
  }

  return null;
}

/**
 * Calcola l'hash SHA256 del contenuto di una observation per la deduplicazione.
 * Usa lo stesso schema: project|type|title|narrative (senza sessionId).
 */
export function computeImportHash(rec: JsonlObservation): string {
  const payload = [
    rec.project ?? '',
    rec.type ?? '',
    rec.title ?? '',
    rec.narrative ?? '',
  ].join('|');
  return createHash('sha256').update(payload).digest('hex');
}

/**
 * Verifica se un hash SHA256 esiste già nelle observations.
 */
export function hashExistsInObservations(db: Database, hash: string): boolean {
  const result = db.query(
    'SELECT id FROM observations WHERE content_hash = ? LIMIT 1'
  ).get(hash) as { id: number } | null;
  return !!result;
}

/**
 * Importa osservazioni da un array di record pre-parsati in batch da IMPORT_BATCH_SIZE.
 * Skippa i record già presenti (deduplicazione per hash).
 */
function importObservationBatch(
  db: Database,
  records: JsonlObservation[],
  dryRun: boolean
): { imported: number; skipped: number } {
  let imported = 0;
  let skipped = 0;

  // Raggruppa in batch da IMPORT_BATCH_SIZE
  for (let i = 0; i < records.length; i += IMPORT_BATCH_SIZE) {
    const batch = records.slice(i, i + IMPORT_BATCH_SIZE);

    if (dryRun) {
      // In dry-run: conta senza inserire
      for (const rec of batch) {
        const hash = rec.content_hash || computeImportHash(rec);
        if (hashExistsInObservations(db, hash)) {
          skipped++;
        } else {
          imported++;
        }
      }
      continue;
    }

    // Insert transazionale per il batch
    const insertBatch = db.transaction(() => {
      for (const rec of batch) {
        const hash = rec.content_hash || computeImportHash(rec);

        // Deduplicazione: salta se esiste già
        if (hashExistsInObservations(db, hash)) {
          skipped++;
          continue;
        }

        const now = new Date().toISOString();
        db.run(
          `INSERT INTO observations
           (memory_session_id, project, type, title, subtitle, text, narrative, facts, concepts,
            files_read, files_modified, prompt_number, content_hash, discovery_tokens, auto_category,
            created_at, created_at_epoch)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            rec.memory_session_id || 'imported',
            rec.project,
            rec.type,
            rec.title,
            rec.subtitle ?? null,
            rec.text ?? null,
            rec.narrative ?? null,
            rec.facts ?? null,
            rec.concepts ?? null,
            rec.files_read ?? null,
            rec.files_modified ?? null,
            rec.prompt_number ?? 0,
            hash,
            rec.discovery_tokens ?? 0,
            rec.auto_category ?? null,
            rec.created_at || now,
            rec.created_at_epoch || Date.now(),
          ]
        );
        imported++;
      }
    });

    insertBatch();
  }

  return { imported, skipped };
}

/**
 * Importa summaries da un array di record in batch da IMPORT_BATCH_SIZE.
 * Deduplicazione per (session_id, project, created_at_epoch).
 */
function importSummaryBatch(
  db: Database,
  records: JsonlSummary[],
  dryRun: boolean
): { imported: number; skipped: number } {
  let imported = 0;
  let skipped = 0;

  for (let i = 0; i < records.length; i += IMPORT_BATCH_SIZE) {
    const batch = records.slice(i, i + IMPORT_BATCH_SIZE);

    if (dryRun) {
      for (const rec of batch) {
        const exists = db.query(
          'SELECT id FROM summaries WHERE session_id = ? AND project = ? AND created_at_epoch = ? LIMIT 1'
        ).get(rec.session_id, rec.project, rec.created_at_epoch ?? 0) as { id: number } | null;

        if (exists) skipped++; else imported++;
      }
      continue;
    }

    const insertBatch = db.transaction(() => {
      for (const rec of batch) {
        // Deduplicazione per (session_id, project, epoch)
        const exists = db.query(
          'SELECT id FROM summaries WHERE session_id = ? AND project = ? AND created_at_epoch = ? LIMIT 1'
        ).get(rec.session_id, rec.project, rec.created_at_epoch ?? 0) as { id: number } | null;

        if (exists) { skipped++; continue; }

        const now = new Date().toISOString();
        db.run(
          `INSERT INTO summaries
           (session_id, project, request, investigated, learned, completed, next_steps, notes,
            discovery_tokens, created_at, created_at_epoch)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            rec.session_id,
            rec.project,
            rec.request ?? null,
            rec.investigated ?? null,
            rec.learned ?? null,
            rec.completed ?? null,
            rec.next_steps ?? null,
            rec.notes ?? null,
            rec.discovery_tokens ?? 0,
            rec.created_at || now,
            rec.created_at_epoch || Date.now(),
          ]
        );
        imported++;
      }
    });

    insertBatch();
  }

  return { imported, skipped };
}

/**
 * Importa prompts da un array di record in batch da IMPORT_BATCH_SIZE.
 * Deduplicazione per (content_session_id, prompt_number).
 */
function importPromptBatch(
  db: Database,
  records: JsonlPrompt[],
  dryRun: boolean
): { imported: number; skipped: number } {
  let imported = 0;
  let skipped = 0;

  for (let i = 0; i < records.length; i += IMPORT_BATCH_SIZE) {
    const batch = records.slice(i, i + IMPORT_BATCH_SIZE);

    if (dryRun) {
      for (const rec of batch) {
        const exists = db.query(
          'SELECT id FROM prompts WHERE content_session_id = ? AND prompt_number = ? LIMIT 1'
        ).get(rec.content_session_id, rec.prompt_number ?? 0) as { id: number } | null;

        if (exists) skipped++; else imported++;
      }
      continue;
    }

    const insertBatch = db.transaction(() => {
      for (const rec of batch) {
        const exists = db.query(
          'SELECT id FROM prompts WHERE content_session_id = ? AND prompt_number = ? LIMIT 1'
        ).get(rec.content_session_id, rec.prompt_number ?? 0) as { id: number } | null;

        if (exists) { skipped++; continue; }

        const now = new Date().toISOString();
        db.run(
          `INSERT INTO prompts
           (content_session_id, project, prompt_number, prompt_text, created_at, created_at_epoch)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [
            rec.content_session_id,
            rec.project,
            rec.prompt_number ?? 0,
            rec.prompt_text,
            rec.created_at || now,
            rec.created_at_epoch || Date.now(),
          ]
        );
        imported++;
      }
    });

    insertBatch();
  }

  return { imported, skipped };
}

/**
 * Importa un file JSONL completo dal contenuto stringa.
 * Analizza riga per riga, valida, raggruppa per tipo, inserisce in batch.
 *
 * @param db - Istanza del database
 * @param content - Contenuto JSONL completo come stringa
 * @param dryRun - Se true, mostra i conteggi senza inserire
 */
export function importJsonl(
  db: Database,
  content: string,
  dryRun: boolean = false
): ImportResult {
  const lines = content.split('\n');
  const result: ImportResult = {
    imported: 0,
    skipped: 0,
    errors: 0,
    total: 0,
    errorDetails: [],
  };

  // Buffer per batch insert per tipo
  const obsBuf: JsonlObservation[] = [];
  const sumBuf: JsonlSummary[] = [];
  const promptBuf: JsonlPrompt[] = [];

  // Funzione di flush dei buffer
  const flushBuffers = () => {
    if (obsBuf.length > 0) {
      const r = importObservationBatch(db, obsBuf.splice(0), dryRun);
      result.imported += r.imported;
      result.skipped += r.skipped;
    }
    if (sumBuf.length > 0) {
      const r = importSummaryBatch(db, sumBuf.splice(0), dryRun);
      result.imported += r.imported;
      result.skipped += r.skipped;
    }
    if (promptBuf.length > 0) {
      const r = importPromptBatch(db, promptBuf.splice(0), dryRun);
      result.imported += r.imported;
      result.skipped += r.skipped;
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i].trim();

    // Salta righe vuote e commenti
    if (!raw || raw.startsWith('#')) continue;

    result.total++;

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      result.errors++;
      result.errorDetails.push({ line: i + 1, error: `JSON non valido: ${raw.substring(0, 60)}` });
      continue;
    }

    // Salta il record _meta senza contarlo nel totale
    if (parsed && typeof parsed === 'object' && '_meta' in (parsed as object)) {
      result.total--; // annulla l'incremento precedente
      continue;
    }

    const validErr = validateJsonlRow(parsed);
    if (validErr) {
      result.errors++;
      result.errorDetails.push({ line: i + 1, error: validErr });
      continue;
    }

    const rec = parsed as (JsonlObservation | JsonlSummary | JsonlPrompt);

    // Accoda nel buffer del tipo corretto
    if (rec._type === 'observation') {
      obsBuf.push(rec as JsonlObservation);
    } else if (rec._type === 'summary') {
      sumBuf.push(rec as JsonlSummary);
    } else if (rec._type === 'prompt') {
      promptBuf.push(rec as JsonlPrompt);
    }

    // Flush automatico quando i buffer raggiungono la dimensione massima
    const totalBuf = obsBuf.length + sumBuf.length + promptBuf.length;
    if (totalBuf >= IMPORT_BATCH_SIZE) {
      flushBuffers();
    }
  }

  // Flush finale dei record rimasti nei buffer
  flushBuffers();

  return result;
}

// ── Utility interne ──

/** Converte i filtri da/a in epoch ms */
function filtersToEpoch(filters: ExportFilters): { fromEpoch?: number; toEpoch?: number } {
  return {
    fromEpoch: filters.from ? new Date(filters.from).getTime() : undefined,
    toEpoch: filters.to ? new Date(filters.to).getTime() : undefined,
  };
}

interface ConditionParams {
  project?: string;
  type?: string;
  fromEpoch?: number;
  toEpoch?: number;
}

/** Costruisce la clausola WHERE e i parametri per le query di export */
function buildConditions(params: ConditionParams): { where: string; params: (string | number)[] } {
  const conditions: string[] = ['1=1'];
  const values: (string | number)[] = [];

  if (params.project) {
    conditions.push('project = ?');
    values.push(params.project);
  }
  if (params.type) {
    conditions.push('type = ?');
    values.push(params.type);
  }
  if (params.fromEpoch !== undefined) {
    conditions.push('created_at_epoch >= ?');
    values.push(params.fromEpoch);
  }
  if (params.toEpoch !== undefined) {
    conditions.push('created_at_epoch <= ?');
    values.push(params.toEpoch);
  }

  return { where: conditions.join(' AND '), params: values };
}
