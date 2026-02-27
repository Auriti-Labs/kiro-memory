/**
 * Retention — politiche di pulizia automatica dei dati storici.
 *
 * Espone due funzioni principali:
 *   - getRetentionStats: calcola quanti record verrebbero eliminati (dry-run)
 *   - applyRetention: elimina effettivamente i record scaduti
 *
 * Regole:
 *   - Le observation di tipo knowledge (constraint, decision, heuristic, rejected)
 *     vengono gestite con la policy `retention.knowledge.maxAgeDays` separata.
 *   - maxAgeDays = 0 significa "non eliminare mai" per qualsiasi tipo.
 *   - Le observation knowledge con importance >= 4 (campo `facts` JSON) sono
 *     sempre esentate, indipendentemente dalla configurazione.
 */

import { Database } from 'bun:sqlite';
import { KNOWLEDGE_TYPES } from '../../types/worker-types.js';

// ── Tipi pubblici ──────────────────────────────────────────────────────────────

/** Configurazione retention letta dal file config.json */
export interface RetentionConfig {
  /** Età massima in giorni per le observation generiche (0 = mai eliminare) */
  observationsMaxAgeDays: number;
  /** Età massima in giorni per i summary (0 = mai eliminare) */
  summariesMaxAgeDays: number;
  /** Età massima in giorni per i prompt (0 = mai eliminare) */
  promptsMaxAgeDays: number;
  /** Età massima in giorni per le knowledge (0 = mai eliminare) */
  knowledgeMaxAgeDays: number;
}

/** Conteggio di record da eliminare per tipo (output dry-run) */
export interface RetentionStats {
  observations: number;
  summaries: number;
  prompts: number;
  knowledge: number;
  total: number;
}

/** Conteggio di record effettivamente eliminati (output apply) */
export interface RetentionResult {
  observations: number;
  summaries: number;
  prompts: number;
  knowledge: number;
  total: number;
  executedAt: string;
}

// ── Costanti interne ───────────────────────────────────────────────────────────

/** Tipi observation che rappresentano knowledge strutturata */
const KNOWLEDGE_TYPE_LIST = KNOWLEDGE_TYPES as readonly string[];

/** Placeholder SQL per la lista dei knowledge type */
const KNOWLEDGE_PLACEHOLDERS = KNOWLEDGE_TYPE_LIST.map(() => '?').join(', ');

// ── Helpers ────────────────────────────────────────────────────────────────────

/**
 * Converte giorni in milliseconds epoch threshold.
 * Ritorna null se maxAgeDays === 0 (nessuna eliminazione).
 */
function toEpochThreshold(maxAgeDays: number): number | null {
  if (maxAgeDays <= 0) return null;
  return Date.now() - maxAgeDays * 86_400_000;
}

/**
 * Verifica se un record observation (knowledge) ha importance >= 4 nel campo facts.
 * Il campo facts è una stringa JSON; se contiene `"importance": N` con N >= 4,
 * il record è esente dalla retention.
 *
 * Nota: la verifica è fatta in SQL con LIKE per evitare deserializzazione
 * su milioni di righe — sicura perché il formato del JSON è controllato.
 */
function buildKnowledgeImportanceExemptionClause(): string {
  // Esenzione: facts contiene "importance": 4 o 5 (o più cifre >= 4)
  // Il pattern è conservativo: esclude solo valori >= 4 scritti come intero
  return `AND NOT (
    facts IS NOT NULL AND (
      facts LIKE '%"importance":4%'
      OR facts LIKE '%"importance": 4%'
      OR facts LIKE '%"importance":5%'
      OR facts LIKE '%"importance": 5%'
    )
  )`;
}

// ── Funzioni pubbliche ─────────────────────────────────────────────────────────

/**
 * Calcola quanti record verrebbero eliminati con la configurazione fornita.
 * Non modifica il database — usata per dry-run e preview API.
 *
 * @param db   - Istanza SQLite (better-sqlite3 o bun:sqlite)
 * @param config - Configurazione retention
 * @returns Conteggio per tipo e totale
 */
export function getRetentionStats(db: Database, config: RetentionConfig): RetentionStats {
  const obsThreshold = toEpochThreshold(config.observationsMaxAgeDays);
  const sumThreshold = toEpochThreshold(config.summariesMaxAgeDays);
  const promptThreshold = toEpochThreshold(config.promptsMaxAgeDays);
  const knowledgeThreshold = toEpochThreshold(config.knowledgeMaxAgeDays);

  const importanceExemption = buildKnowledgeImportanceExemptionClause();

  // Observation generiche (escluse le knowledge)
  let observations = 0;
  if (obsThreshold !== null) {
    const row = db.query(
      `SELECT COUNT(*) as c FROM observations
       WHERE created_at_epoch < ?
         AND type NOT IN (${KNOWLEDGE_PLACEHOLDERS})`
    ).get(obsThreshold, ...KNOWLEDGE_TYPE_LIST) as { c: number };
    observations = row?.c ?? 0;
  }

  // Summaries
  let summaries = 0;
  if (sumThreshold !== null) {
    const row = db.query(
      'SELECT COUNT(*) as c FROM summaries WHERE created_at_epoch < ?'
    ).get(sumThreshold) as { c: number };
    summaries = row?.c ?? 0;
  }

  // Prompts
  let prompts = 0;
  if (promptThreshold !== null) {
    const row = db.query(
      'SELECT COUNT(*) as c FROM prompts WHERE created_at_epoch < ?'
    ).get(promptThreshold) as { c: number };
    prompts = row?.c ?? 0;
  }

  // Knowledge (con esenzione importance >= 4)
  let knowledge = 0;
  if (knowledgeThreshold !== null) {
    const row = db.query(
      `SELECT COUNT(*) as c FROM observations
       WHERE created_at_epoch < ?
         AND type IN (${KNOWLEDGE_PLACEHOLDERS})
         ${importanceExemption}`
    ).get(knowledgeThreshold, ...KNOWLEDGE_TYPE_LIST) as { c: number };
    knowledge = row?.c ?? 0;
  }

  const total = observations + summaries + prompts + knowledge;
  return { observations, summaries, prompts, knowledge, total };
}

/**
 * Conta i record che corrispondono a una query di retention.
 * Helper interno usato sia per dry-run sia per ottenere il conteggio preciso
 * prima di eseguire un DELETE (i trigger FTS5 falserebbero result.changes).
 */
function countRows(db: Database, sql: string, params: unknown[]): number {
  const row = db.query(sql).get(...params) as { c: number } | null;
  return row?.c ?? 0;
}

/**
 * Elimina i record scaduti secondo la configurazione retention.
 * Usa una transazione atomica per garantire coerenza.
 *
 * Nota implementativa: `result.changes` in bun:sqlite/SQLite include le righe
 * modificate dai trigger (es. FTS5), quindi non riflette il conteggio reale
 * delle righe eliminate dalla tabella principale. Per questo motivo si usa
 * `SELECT COUNT(*)` prima di ogni DELETE per ottenere il valore corretto.
 *
 * Regole:
 *   - maxAgeDays = 0 → tipo saltato completamente
 *   - Knowledge con importance >= 4 nel campo facts → esentate sempre
 *   - Prima di eliminare observation, elimina gli embeddings collegati (FK)
 *
 * @param db   - Istanza SQLite
 * @param config - Configurazione retention
 * @returns Conteggio record eliminati per tipo e totale
 */
export function applyRetention(db: Database, config: RetentionConfig): RetentionResult {
  const obsThreshold = toEpochThreshold(config.observationsMaxAgeDays);
  const sumThreshold = toEpochThreshold(config.summariesMaxAgeDays);
  const promptThreshold = toEpochThreshold(config.promptsMaxAgeDays);
  const knowledgeThreshold = toEpochThreshold(config.knowledgeMaxAgeDays);

  const importanceExemption = buildKnowledgeImportanceExemptionClause();

  // Esegui tutto in un'unica transazione per atomicità
  const deleteAll = db.transaction(() => {
    let observations = 0;
    let summaries = 0;
    let prompts = 0;
    let knowledge = 0;

    // 1. Elimina observation generiche (non knowledge) scadute
    if (obsThreshold !== null) {
      const obsParams: unknown[] = [obsThreshold, ...KNOWLEDGE_TYPE_LIST];
      const obsWhere = `WHERE created_at_epoch < ? AND type NOT IN (${KNOWLEDGE_PLACEHOLDERS})`;

      // Conta prima del DELETE (result.changes include trigger FTS5 e non è affidabile)
      observations = countRows(db,
        `SELECT COUNT(*) as c FROM observations ${obsWhere}`,
        obsParams
      );

      if (observations > 0) {
        // Elimina embeddings collegati (FK) prima della observation principale
        db.run(
          `DELETE FROM observation_embeddings
           WHERE observation_id IN (
             SELECT id FROM observations ${obsWhere}
           )`,
          obsParams
        );
        db.run(
          `DELETE FROM observations ${obsWhere}`,
          obsParams
        );
      }
    }

    // 2. Elimina summaries scaduti
    if (sumThreshold !== null) {
      summaries = countRows(db,
        'SELECT COUNT(*) as c FROM summaries WHERE created_at_epoch < ?',
        [sumThreshold]
      );
      if (summaries > 0) {
        db.run('DELETE FROM summaries WHERE created_at_epoch < ?', [sumThreshold]);
      }
    }

    // 3. Elimina prompts scaduti
    if (promptThreshold !== null) {
      prompts = countRows(db,
        'SELECT COUNT(*) as c FROM prompts WHERE created_at_epoch < ?',
        [promptThreshold]
      );
      if (prompts > 0) {
        db.run('DELETE FROM prompts WHERE created_at_epoch < ?', [promptThreshold]);
      }
    }

    // 4. Elimina knowledge scadute (con esenzione importance >= 4)
    if (knowledgeThreshold !== null) {
      const kParams: unknown[] = [knowledgeThreshold, ...KNOWLEDGE_TYPE_LIST];
      const kWhere = `WHERE created_at_epoch < ? AND type IN (${KNOWLEDGE_PLACEHOLDERS}) ${importanceExemption}`;

      knowledge = countRows(db,
        `SELECT COUNT(*) as c FROM observations ${kWhere}`,
        kParams
      );

      if (knowledge > 0) {
        // Elimina embeddings collegati prima
        db.run(
          `DELETE FROM observation_embeddings
           WHERE observation_id IN (
             SELECT id FROM observations ${kWhere}
           )`,
          kParams
        );
        db.run(
          `DELETE FROM observations ${kWhere}`,
          kParams
        );
      }
    }

    return { observations, summaries, prompts, knowledge };
  });

  const counts = deleteAll();
  const total = counts.observations + counts.summaries + counts.prompts + counts.knowledge;

  return {
    ...counts,
    total,
    executedAt: new Date().toISOString(),
  };
}

/**
 * Costruisce un RetentionConfig leggendo i valori dalla configurazione applicativa.
 * Usa i valori di default se non presenti.
 *
 * @param config - Record di configurazione letto da readConfig() o listConfig()
 */
export function buildRetentionConfig(
  config: Record<string, string | number | boolean | null>
): RetentionConfig {
  function getNum(key: string, fallback: number): number {
    const v = config[key];
    if (v === null || v === undefined) return fallback;
    const n = Number(v);
    return isNaN(n) ? fallback : n;
  }

  return {
    observationsMaxAgeDays: getNum('retention.observations.maxAgeDays', 90),
    summariesMaxAgeDays:    getNum('retention.summaries.maxAgeDays', 365),
    promptsMaxAgeDays:      getNum('retention.prompts.maxAgeDays', 30),
    knowledgeMaxAgeDays:    getNum('retention.knowledge.maxAgeDays', 0),
  };
}
