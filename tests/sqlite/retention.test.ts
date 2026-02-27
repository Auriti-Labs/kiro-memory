/**
 * Test suite per il modulo Retention.
 *
 * Verifica:
 *   - Record recenti non vengono eliminati
 *   - Record scaduti vengono eliminati per ciascun tipo
 *   - Knowledge con importance >= 4 nel campo facts è preservata
 *   - Dry-run (getRetentionStats) non modifica il database
 *   - buildRetentionConfig restituisce i valori di default corretti
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { KiroMemoryDatabase } from '../../src/services/sqlite/Database.js';
import {
  getRetentionStats,
  applyRetention,
  buildRetentionConfig,
  type RetentionConfig,
} from '../../src/services/sqlite/Retention.js';
import type { Database } from 'bun:sqlite';

// ── Helpers per inserire dati di test ────────────────────────────────────────

/** Inserisce una observation generica direttamente nel DB (senza trigger FTS5) */
function insertObs(
  db: Database,
  type: string,
  title: string,
  createdAtEpoch: number,
  facts: string | null = null
): number {
  const res = db.run(
    `INSERT INTO observations
       (memory_session_id, project, type, title, subtitle, text, narrative,
        facts, concepts, files_read, files_modified, prompt_number, created_at, created_at_epoch)
     VALUES (?, ?, ?, ?, NULL, NULL, NULL, ?, NULL, NULL, NULL, 1, ?, ?)`,
    ['sess-1', 'test-project', type, title, facts,
     new Date(createdAtEpoch).toISOString(), createdAtEpoch]
  );
  return Number(res.lastInsertRowid);
}

/** Inserisce un summary direttamente nel DB */
function insertSummary(db: Database, createdAtEpoch: number): number {
  const res = db.run(
    `INSERT INTO summaries
       (session_id, project, request, investigated, learned, completed,
        next_steps, notes, created_at, created_at_epoch)
     VALUES (?, ?, NULL, NULL, NULL, NULL, NULL, NULL, ?, ?)`,
    ['sess-1', 'test-project', new Date(createdAtEpoch).toISOString(), createdAtEpoch]
  );
  return Number(res.lastInsertRowid);
}

/** Inserisce un prompt direttamente nel DB */
function insertPrompt(db: Database, createdAtEpoch: number): number {
  const res = db.run(
    `INSERT INTO prompts
       (content_session_id, project, prompt_number, prompt_text, created_at, created_at_epoch)
     VALUES (?, ?, 1, ?, ?, ?)`,
    ['sess-1', 'test-project', 'Test prompt', new Date(createdAtEpoch).toISOString(), createdAtEpoch]
  );
  return Number(res.lastInsertRowid);
}

/** Conta i record presenti in una tabella */
function count(db: Database, table: string): number {
  const row = db.query(`SELECT COUNT(*) as c FROM ${table}`).get() as { c: number };
  return row?.c ?? 0;
}

// ── Configurazione di test ────────────────────────────────────────────────────

const NOW = Date.now();
const DAYS_90 = 90 * 86_400_000;
const DAYS_365 = 365 * 86_400_000;
const DAYS_30 = 30 * 86_400_000;

/** Epoca 100 giorni fa — scaduta rispetto a maxAgeDays=90 */
const EXPIRED_EPOCH = NOW - 100 * 86_400_000;
/** Epoca 10 giorni fa — recente, non scaduta */
const RECENT_EPOCH = NOW - 10 * 86_400_000;

// ── Suite principale ─────────────────────────────────────────────────────────

describe('Modulo Retention', () => {
  let db: Database;

  beforeEach(() => {
    // Ogni test parte da un DB in-memory pulito con lo schema completo
    db = new KiroMemoryDatabase(':memory:').db;
  });

  afterEach(() => {
    db.close();
  });

  // ── buildRetentionConfig ──────────────────────────────────────────────────

  describe('buildRetentionConfig', () => {
    it('dovrebbe restituire i valori di default se la config è vuota', () => {
      const config = buildRetentionConfig({});

      expect(config.observationsMaxAgeDays).toBe(90);
      expect(config.summariesMaxAgeDays).toBe(365);
      expect(config.promptsMaxAgeDays).toBe(30);
      expect(config.knowledgeMaxAgeDays).toBe(0);
    });

    it('dovrebbe usare i valori personalizzati dalla config', () => {
      const config = buildRetentionConfig({
        'retention.observations.maxAgeDays': 180,
        'retention.summaries.maxAgeDays': 730,
        'retention.prompts.maxAgeDays': 60,
        'retention.knowledge.maxAgeDays': 365,
      });

      expect(config.observationsMaxAgeDays).toBe(180);
      expect(config.summariesMaxAgeDays).toBe(730);
      expect(config.promptsMaxAgeDays).toBe(60);
      expect(config.knowledgeMaxAgeDays).toBe(365);
    });

    it('dovrebbe usare il default per chiavi mancanti parzialmente', () => {
      const config = buildRetentionConfig({
        'retention.observations.maxAgeDays': 45,
      });

      expect(config.observationsMaxAgeDays).toBe(45);
      expect(config.summariesMaxAgeDays).toBe(365); // default
      expect(config.promptsMaxAgeDays).toBe(30);    // default
      expect(config.knowledgeMaxAgeDays).toBe(0);   // default = mai eliminare
    });
  });

  // ── getRetentionStats (dry-run) ───────────────────────────────────────────

  describe('getRetentionStats', () => {
    it('non dovrebbe contare record recenti come da eliminare', () => {
      insertObs(db, 'bug-fix', 'Observation recente', RECENT_EPOCH);
      insertSummary(db, RECENT_EPOCH);
      insertPrompt(db, RECENT_EPOCH);

      const config: RetentionConfig = {
        observationsMaxAgeDays: 90,
        summariesMaxAgeDays: 365,
        promptsMaxAgeDays: 30,
        knowledgeMaxAgeDays: 0,
      };

      const stats = getRetentionStats(db, config);

      expect(stats.observations).toBe(0);
      expect(stats.summaries).toBe(0);
      expect(stats.prompts).toBe(0);
      expect(stats.total).toBe(0);
    });

    it('dovrebbe contare correttamente i record scaduti per tipo', () => {
      // Epoch abbastanza vecchio per scadere con la policy summaries (>365gg)
      const VERY_OLD_SUMMARY = NOW - 400 * 86_400_000;
      // Epoch abbastanza vecchio per scadere con la policy prompts (>30gg)
      const EXPIRED_PROMPT = NOW - 45 * 86_400_000;

      // Obs scadute (>90gg)
      insertObs(db, 'bug-fix', 'Obs scaduta 1', EXPIRED_EPOCH);
      insertObs(db, 'bug-fix', 'Obs scaduta 2', EXPIRED_EPOCH);
      // Summary scaduta (>365gg)
      insertSummary(db, VERY_OLD_SUMMARY);
      // Prompts scaduti (>30gg)
      insertPrompt(db, EXPIRED_PROMPT);
      insertPrompt(db, EXPIRED_PROMPT);
      // Recenti (non devono essere contati)
      insertObs(db, 'bug-fix', 'Obs recente', RECENT_EPOCH);
      insertSummary(db, RECENT_EPOCH);

      const config: RetentionConfig = {
        observationsMaxAgeDays: 90,
        summariesMaxAgeDays: 365,
        promptsMaxAgeDays: 30,
        knowledgeMaxAgeDays: 0,
      };

      const stats = getRetentionStats(db, config);

      expect(stats.observations).toBe(2);
      expect(stats.summaries).toBe(1);
      expect(stats.prompts).toBe(2);
      expect(stats.total).toBe(5);
    });

    it('non dovrebbe modificare il database (vera dry-run)', () => {
      insertObs(db, 'bug-fix', 'Obs scaduta', EXPIRED_EPOCH);
      insertSummary(db, EXPIRED_EPOCH);
      insertPrompt(db, EXPIRED_EPOCH);

      const config: RetentionConfig = {
        observationsMaxAgeDays: 90,
        summariesMaxAgeDays: 365,
        promptsMaxAgeDays: 30,
        knowledgeMaxAgeDays: 0,
      };

      // Esegue dry-run
      getRetentionStats(db, config);

      // Verifica che i dati siano ancora presenti
      expect(count(db, 'observations')).toBe(1);
      expect(count(db, 'summaries')).toBe(1);
      expect(count(db, 'prompts')).toBe(1);
    });

    it('dovrebbe restituire 0 quando maxAgeDays=0 (policy disabilitata)', () => {
      insertObs(db, 'bug-fix', 'Obs scaduta', EXPIRED_EPOCH);
      insertSummary(db, EXPIRED_EPOCH);
      insertPrompt(db, EXPIRED_EPOCH);

      const config: RetentionConfig = {
        observationsMaxAgeDays: 0,  // disabilitato
        summariesMaxAgeDays: 0,     // disabilitato
        promptsMaxAgeDays: 0,       // disabilitato
        knowledgeMaxAgeDays: 0,
      };

      const stats = getRetentionStats(db, config);

      expect(stats.observations).toBe(0);
      expect(stats.summaries).toBe(0);
      expect(stats.prompts).toBe(0);
      expect(stats.total).toBe(0);
    });
  });

  // ── applyRetention ────────────────────────────────────────────────────────

  describe('applyRetention', () => {
    it('dovrebbe eliminare le observation scadute', () => {
      insertObs(db, 'bug-fix', 'Obs scaduta', EXPIRED_EPOCH);
      insertObs(db, 'feature', 'Altra obs scaduta', EXPIRED_EPOCH);
      insertObs(db, 'bug-fix', 'Obs recente', RECENT_EPOCH);

      const config: RetentionConfig = {
        observationsMaxAgeDays: 90,
        summariesMaxAgeDays: 365,
        promptsMaxAgeDays: 30,
        knowledgeMaxAgeDays: 0,
      };

      const result = applyRetention(db, config);

      // Due obs scadute eliminate, una recente rimasta
      expect(result.observations).toBe(2);
      expect(count(db, 'observations')).toBe(1);
    });

    it('dovrebbe eliminare i summary scaduti', () => {
      insertSummary(db, EXPIRED_EPOCH);
      insertSummary(db, EXPIRED_EPOCH);
      insertSummary(db, RECENT_EPOCH);

      const config: RetentionConfig = {
        observationsMaxAgeDays: 90,
        summariesMaxAgeDays: 365,
        promptsMaxAgeDays: 30,
        knowledgeMaxAgeDays: 0,
      };

      const result = applyRetention(db, config);

      // Epoch scaduta = 100 giorni fa, summariesMaxAgeDays = 365 → non scaduti!
      // Per scadere servono > 365 giorni
      expect(result.summaries).toBe(0);
      expect(count(db, 'summaries')).toBe(3);
    });

    it('dovrebbe eliminare i summary oltre 365 giorni', () => {
      const VERY_OLD = NOW - 400 * 86_400_000;  // 400 giorni fa
      insertSummary(db, VERY_OLD);
      insertSummary(db, VERY_OLD);
      insertSummary(db, RECENT_EPOCH);

      const config: RetentionConfig = {
        observationsMaxAgeDays: 90,
        summariesMaxAgeDays: 365,
        promptsMaxAgeDays: 30,
        knowledgeMaxAgeDays: 0,
      };

      const result = applyRetention(db, config);

      expect(result.summaries).toBe(2);
      expect(count(db, 'summaries')).toBe(1);
    });

    it('dovrebbe eliminare i prompts scaduti oltre 30 giorni', () => {
      const EXPIRED_PROMPT = NOW - 45 * 86_400_000;  // 45 giorni fa (oltre maxAge=30)
      insertPrompt(db, EXPIRED_PROMPT);
      insertPrompt(db, EXPIRED_PROMPT);
      insertPrompt(db, RECENT_EPOCH);  // 10 giorni fa — recente

      const config: RetentionConfig = {
        observationsMaxAgeDays: 90,
        summariesMaxAgeDays: 365,
        promptsMaxAgeDays: 30,
        knowledgeMaxAgeDays: 0,
      };

      const result = applyRetention(db, config);

      expect(result.prompts).toBe(2);
      expect(count(db, 'prompts')).toBe(1);
    });

    it('non dovrebbe eliminare record recenti', () => {
      insertObs(db, 'bug-fix', 'Obs recente', RECENT_EPOCH);
      insertSummary(db, RECENT_EPOCH);
      insertPrompt(db, RECENT_EPOCH);

      const config: RetentionConfig = {
        observationsMaxAgeDays: 90,
        summariesMaxAgeDays: 365,
        promptsMaxAgeDays: 30,
        knowledgeMaxAgeDays: 0,
      };

      const result = applyRetention(db, config);

      expect(result.total).toBe(0);
      expect(count(db, 'observations')).toBe(1);
      expect(count(db, 'summaries')).toBe(1);
      expect(count(db, 'prompts')).toBe(1);
    });

    it('non dovrebbe eliminare nulla quando maxAgeDays=0', () => {
      insertObs(db, 'bug-fix', 'Obs scaduta', EXPIRED_EPOCH);
      insertSummary(db, EXPIRED_EPOCH);
      insertPrompt(db, EXPIRED_EPOCH);

      const config: RetentionConfig = {
        observationsMaxAgeDays: 0,  // mai eliminare
        summariesMaxAgeDays: 0,     // mai eliminare
        promptsMaxAgeDays: 0,       // mai eliminare
        knowledgeMaxAgeDays: 0,
      };

      const result = applyRetention(db, config);

      expect(result.total).toBe(0);
      expect(count(db, 'observations')).toBe(1);
      expect(count(db, 'summaries')).toBe(1);
      expect(count(db, 'prompts')).toBe(1);
    });

    it('dovrebbe restituire il timestamp di esecuzione', () => {
      const config: RetentionConfig = {
        observationsMaxAgeDays: 90,
        summariesMaxAgeDays: 365,
        promptsMaxAgeDays: 30,
        knowledgeMaxAgeDays: 0,
      };

      const result = applyRetention(db, config);

      expect(typeof result.executedAt).toBe('string');
      expect(new Date(result.executedAt).getTime()).toBeGreaterThan(0);
    });
  });

  // ── Knowledge: esenzione per tipo e importance ────────────────────────────

  describe('Retention knowledge', () => {
    it('non dovrebbe eliminare knowledge quando knowledgeMaxAgeDays=0 (default)', () => {
      // Inserisce knowledge scaduta
      insertObs(db, 'decision', 'Decisione architetturale', EXPIRED_EPOCH);
      insertObs(db, 'constraint', 'Vincolo di sicurezza', EXPIRED_EPOCH);
      insertObs(db, 'heuristic', 'Pattern preferito', EXPIRED_EPOCH);
      insertObs(db, 'rejected', 'Soluzione scartata', EXPIRED_EPOCH);

      const config: RetentionConfig = {
        observationsMaxAgeDays: 90,
        summariesMaxAgeDays: 365,
        promptsMaxAgeDays: 30,
        knowledgeMaxAgeDays: 0,   // mai eliminare
      };

      const result = applyRetention(db, config);

      // Le knowledge non devono essere eliminate
      expect(result.knowledge).toBe(0);
      expect(count(db, 'observations')).toBe(4);
    });

    it('dovrebbe eliminare knowledge scaduta quando knowledgeMaxAgeDays > 0', () => {
      const VERY_OLD = NOW - 200 * 86_400_000; // 200 giorni fa
      insertObs(db, 'decision', 'Decisione vecchia', VERY_OLD);
      insertObs(db, 'decision', 'Decisione recente', RECENT_EPOCH);

      const config: RetentionConfig = {
        observationsMaxAgeDays: 90,
        summariesMaxAgeDays: 365,
        promptsMaxAgeDays: 30,
        knowledgeMaxAgeDays: 180,  // elimina dopo 180 giorni
      };

      const result = applyRetention(db, config);

      // Solo la decisione vecchia (200gg > 180gg) viene eliminata
      expect(result.knowledge).toBe(1);
      expect(count(db, 'observations')).toBe(1);
    });

    it('dovrebbe preservare knowledge con importance=4 anche se scaduta', () => {
      const VERY_OLD = NOW - 200 * 86_400_000;
      // Knowledge con importance=4 nel campo facts → esentata
      const factsImportant = JSON.stringify({ importance: 4, knowledgeType: 'decision' });
      // Knowledge senza importance → eliminabile
      const factsNormal = JSON.stringify({ knowledgeType: 'decision' });

      insertObs(db, 'decision', 'Decisione critica (imp=4)', VERY_OLD, factsImportant);
      insertObs(db, 'decision', 'Decisione normale', VERY_OLD, factsNormal);

      const config: RetentionConfig = {
        observationsMaxAgeDays: 90,
        summariesMaxAgeDays: 365,
        promptsMaxAgeDays: 30,
        knowledgeMaxAgeDays: 180,
      };

      const result = applyRetention(db, config);

      // Solo la decisione normale viene eliminata; quella con importance=4 è esentata
      expect(result.knowledge).toBe(1);
      expect(count(db, 'observations')).toBe(1);

      // Verifica che sia rimasta la knowledge con importance=4
      const remaining = db.query('SELECT title FROM observations LIMIT 1').get() as { title: string };
      expect(remaining?.title).toBe('Decisione critica (imp=4)');
    });

    it('dovrebbe preservare knowledge con importance=5', () => {
      const VERY_OLD = NOW - 200 * 86_400_000;
      const factsImp5 = JSON.stringify({ importance: 5, knowledgeType: 'constraint' });

      insertObs(db, 'constraint', 'Vincolo critico (imp=5)', VERY_OLD, factsImp5);

      const config: RetentionConfig = {
        observationsMaxAgeDays: 90,
        summariesMaxAgeDays: 365,
        promptsMaxAgeDays: 30,
        knowledgeMaxAgeDays: 90,
      };

      const result = applyRetention(db, config);

      expect(result.knowledge).toBe(0);
      expect(count(db, 'observations')).toBe(1);
    });

    it('dry-run dovrebbe contare le knowledge da eliminare senza modificarle', () => {
      const VERY_OLD = NOW - 200 * 86_400_000;
      insertObs(db, 'decision', 'Decisione vecchia', VERY_OLD);
      insertObs(db, 'decision', 'Decisione recente', RECENT_EPOCH);

      const config: RetentionConfig = {
        observationsMaxAgeDays: 90,
        summariesMaxAgeDays: 365,
        promptsMaxAgeDays: 30,
        knowledgeMaxAgeDays: 180,
      };

      const stats = getRetentionStats(db, config);

      // Stats indica 1 knowledge da eliminare
      expect(stats.knowledge).toBe(1);
      // Ma il DB non è stato modificato
      expect(count(db, 'observations')).toBe(2);
    });

    it('non dovrebbe contare le observation generiche come knowledge', () => {
      // Observation di tipo non-knowledge scaduta
      insertObs(db, 'bug-fix', 'Bug fix scaduto', EXPIRED_EPOCH);
      // Knowledge scaduta (ma knowledgeMaxAgeDays=0 → mai eliminare)
      insertObs(db, 'decision', 'Decisione scaduta', EXPIRED_EPOCH);

      const config: RetentionConfig = {
        observationsMaxAgeDays: 90,
        summariesMaxAgeDays: 365,
        promptsMaxAgeDays: 30,
        knowledgeMaxAgeDays: 0,   // mai eliminare knowledge
      };

      const stats = getRetentionStats(db, config);

      // Solo il bug-fix è contato come observation da eliminare
      expect(stats.observations).toBe(1);
      // La knowledge non è contata (maxAgeDays=0)
      expect(stats.knowledge).toBe(0);
    });
  });

  // ── Integrità transazionale ───────────────────────────────────────────────

  describe('Integrità transazionale', () => {
    it('dovrebbe restituire il totale corretto come somma dei singoli conteggi', () => {
      const EXPIRED_PROMPT = NOW - 45 * 86_400_000;
      insertObs(db, 'bug-fix', 'Obs 1', EXPIRED_EPOCH);
      insertObs(db, 'bug-fix', 'Obs 2', EXPIRED_EPOCH);
      insertPrompt(db, EXPIRED_PROMPT);

      const config: RetentionConfig = {
        observationsMaxAgeDays: 90,
        summariesMaxAgeDays: 365,
        promptsMaxAgeDays: 30,
        knowledgeMaxAgeDays: 0,
      };

      const result = applyRetention(db, config);

      expect(result.total).toBe(result.observations + result.summaries + result.prompts + result.knowledge);
      expect(result.total).toBe(3);
    });
  });
});
