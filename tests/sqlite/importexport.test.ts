/**
 * Test suite per il modulo ImportExport JSONL.
 * Tutti i test usano un database SQLite :memory:.
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { KiroMemoryDatabase } from '../../src/services/sqlite/Database.js';
import { createObservation } from '../../src/services/sqlite/Observations.js';
import { createSummary } from '../../src/services/sqlite/Summaries.js';
import { createPrompt } from '../../src/services/sqlite/Prompts.js';
import {
  countExportRecords,
  generateMetaRecord,
  exportObservationsStreaming,
  exportSummariesStreaming,
  exportPromptsStreaming,
  importJsonl,
  validateJsonlRow,
  computeImportHash,
  hashExistsInObservations,
  JSONL_SCHEMA_VERSION,
  type ExportFilters,
  type JsonlObservation,
} from '../../src/services/sqlite/ImportExport.js';
import type { Database } from 'bun:sqlite';

// ── Helper per creare observations di test ──

function seedObservation(db: Database, project: string, type: string = 'file-write'): number {
  return createObservation(
    db,
    'session-test',
    project,
    type,
    `Titolo test ${Date.now()}`,
    null,
    'Testo di test',
    'Narrativa di test',
    null,
    'TypeScript, test',
    null,
    null,
    1
  );
}

// ── Suite ──

describe('ImportExport — countExportRecords', () => {
  let db: Database;

  beforeEach(() => {
    db = new KiroMemoryDatabase(':memory:').db;
  });

  afterEach(() => {
    db.close();
  });

  it('restituisce zero se il database è vuoto', () => {
    const counts = countExportRecords(db, {});
    expect(counts.observations).toBe(0);
    expect(counts.summaries).toBe(0);
    expect(counts.prompts).toBe(0);
  });

  it('conta correttamente observations inserite', () => {
    seedObservation(db, 'progetto-a');
    seedObservation(db, 'progetto-a');
    seedObservation(db, 'progetto-b');

    const totale = countExportRecords(db, {});
    expect(totale.observations).toBe(3);

    const soloA = countExportRecords(db, { project: 'progetto-a' });
    expect(soloA.observations).toBe(2);

    const soloB = countExportRecords(db, { project: 'progetto-b' });
    expect(soloB.observations).toBe(1);
  });

  it('filtra per tipo observation', () => {
    seedObservation(db, 'progetto', 'file-write');
    seedObservation(db, 'progetto', 'file-write');
    seedObservation(db, 'progetto', 'command');

    const fileWrite = countExportRecords(db, { type: 'file-write' });
    expect(fileWrite.observations).toBe(2);

    const command = countExportRecords(db, { type: 'command' });
    expect(command.observations).toBe(1);
  });
});

describe('ImportExport — generateMetaRecord', () => {
  let db: Database;

  beforeEach(() => {
    db = new KiroMemoryDatabase(':memory:').db;
  });

  afterEach(() => {
    db.close();
  });

  it('produce JSON valido come prima riga', () => {
    const line = generateMetaRecord(db, {});
    const parsed = JSON.parse(line);
    expect(parsed).toBeDefined();
    expect(parsed._meta).toBeDefined();
    expect(parsed._meta.version).toBe(JSONL_SCHEMA_VERSION);
    expect(parsed._meta.exported_at).toBeTypeOf('string');
    expect(parsed._meta.counts).toBeDefined();
  });

  it('include i filtri nel metadato se presenti', () => {
    const filters: ExportFilters = { project: 'myapp', type: 'file-write' };
    const line = generateMetaRecord(db, filters);
    const parsed = JSON.parse(line);
    expect(parsed._meta.filters).toEqual(filters);
  });

  it('non include i filtri se sono tutti assenti', () => {
    const line = generateMetaRecord(db, {});
    const parsed = JSON.parse(line);
    expect(parsed._meta.filters).toBeUndefined();
  });
});

describe('ImportExport — exportObservationsStreaming', () => {
  let db: Database;

  beforeEach(() => {
    db = new KiroMemoryDatabase(':memory:').db;
  });

  afterEach(() => {
    db.close();
  });

  it('emette zero righe se non ci sono observations', () => {
    const rows: string[] = [];
    const total = exportObservationsStreaming(db, {}, (line) => rows.push(line));
    expect(total).toBe(0);
    expect(rows.length).toBe(0);
  });

  it('emette una riga per ogni observation', () => {
    seedObservation(db, 'progetto');
    seedObservation(db, 'progetto');

    const rows: string[] = [];
    const total = exportObservationsStreaming(db, {}, (line) => rows.push(line));
    expect(total).toBe(2);
    expect(rows.length).toBe(2);
  });

  it('ogni riga è JSON valido con _type=observation', () => {
    seedObservation(db, 'progetto');

    const rows: string[] = [];
    exportObservationsStreaming(db, {}, (line) => rows.push(line));

    const parsed = JSON.parse(rows[0]) as JsonlObservation;
    expect(parsed._type).toBe('observation');
    expect(parsed.project).toBe('progetto');
    expect(parsed.id).toBeTypeOf('number');
    expect(parsed.created_at).toBeTypeOf('string');
    expect(parsed.created_at_epoch).toBeTypeOf('number');
  });

  it('filtra per progetto', () => {
    seedObservation(db, 'progetto-a');
    seedObservation(db, 'progetto-b');

    const rowsA: string[] = [];
    exportObservationsStreaming(db, { project: 'progetto-a' }, (l) => rowsA.push(l));
    expect(rowsA.length).toBe(1);

    const rowsAll: string[] = [];
    exportObservationsStreaming(db, {}, (l) => rowsAll.push(l));
    expect(rowsAll.length).toBe(2);
  });

  it('gestisce correttamente batchSize < numero record', () => {
    // Inserisce 5 observations e usa batchSize=2
    for (let i = 0; i < 5; i++) seedObservation(db, 'progetto');

    const rows: string[] = [];
    const total = exportObservationsStreaming(db, {}, (l) => rows.push(l), 2);
    expect(total).toBe(5);
    expect(rows.length).toBe(5);
  });
});

describe('ImportExport — exportSummariesStreaming', () => {
  let db: Database;

  beforeEach(() => {
    db = new KiroMemoryDatabase(':memory:').db;
  });

  afterEach(() => {
    db.close();
  });

  it('emette zero righe se non ci sono summaries', () => {
    const rows: string[] = [];
    exportSummariesStreaming(db, {}, (l) => rows.push(l));
    expect(rows.length).toBe(0);
  });

  it('emette una riga per ogni summary con _type=summary', () => {
    createSummary(db, 'session-1', 'progetto', 'task', null, 'appreso', 'completato', null, null);

    const rows: string[] = [];
    exportSummariesStreaming(db, {}, (l) => rows.push(l));
    expect(rows.length).toBe(1);

    const parsed = JSON.parse(rows[0]);
    expect(parsed._type).toBe('summary');
    expect(parsed.project).toBe('progetto');
  });
});

describe('ImportExport — exportPromptsStreaming', () => {
  let db: Database;

  beforeEach(() => {
    db = new KiroMemoryDatabase(':memory:').db;
  });

  afterEach(() => {
    db.close();
  });

  it('emette zero righe se non ci sono prompts', () => {
    const rows: string[] = [];
    exportPromptsStreaming(db, {}, (l) => rows.push(l));
    expect(rows.length).toBe(0);
  });

  it('emette una riga per ogni prompt con _type=prompt', () => {
    createPrompt(db, 'session-1', 'progetto', 1, 'Testo del prompt di test');

    const rows: string[] = [];
    exportPromptsStreaming(db, {}, (l) => rows.push(l));
    expect(rows.length).toBe(1);

    const parsed = JSON.parse(rows[0]);
    expect(parsed._type).toBe('prompt');
    expect(parsed.project).toBe('progetto');
    expect(parsed.prompt_text).toBe('Testo del prompt di test');
  });
});

describe('ImportExport — validateJsonlRow', () => {
  it('ritorna null per un record _meta valido', () => {
    const rec = { _meta: { version: '1.0', exported_at: new Date().toISOString(), counts: {} } };
    expect(validateJsonlRow(rec)).toBeNull();
  });

  it('ritorna errore se _type mancante', () => {
    const err = validateJsonlRow({ project: 'x', title: 'y' });
    expect(err).not.toBeNull();
    expect(err).toContain('_type');
  });

  it('ritorna errore se _type non è valido', () => {
    const err = validateJsonlRow({ _type: 'unknown' });
    expect(err).not.toBeNull();
  });

  it('accetta una observation valida', () => {
    const rec: JsonlObservation = {
      _type: 'observation',
      id: 1,
      memory_session_id: 'sess-1',
      project: 'mio-progetto',
      type: 'file-write',
      title: 'Test titolo',
      subtitle: null,
      text: null,
      narrative: null,
      facts: null,
      concepts: null,
      files_read: null,
      files_modified: null,
      prompt_number: 1,
      content_hash: null,
      discovery_tokens: 0,
      auto_category: null,
      created_at: new Date().toISOString(),
      created_at_epoch: Date.now(),
    };
    expect(validateJsonlRow(rec)).toBeNull();
  });

  it('ritorna errore se observation manca "title"', () => {
    const err = validateJsonlRow({ _type: 'observation', project: 'p', type: 't' });
    expect(err).not.toBeNull();
    expect(err).toContain('title');
  });

  it('ritorna errore se summary manca "session_id"', () => {
    const err = validateJsonlRow({ _type: 'summary', project: 'p' });
    expect(err).not.toBeNull();
    expect(err).toContain('session_id');
  });

  it('ritorna errore se prompt manca "prompt_text"', () => {
    const err = validateJsonlRow({ _type: 'prompt', project: 'p', content_session_id: 's' });
    expect(err).not.toBeNull();
    expect(err).toContain('prompt_text');
  });
});

describe('ImportExport — computeImportHash', () => {
  it('produce hash deterministico', () => {
    const rec: JsonlObservation = {
      _type: 'observation',
      id: 1,
      memory_session_id: 'sess',
      project: 'progetto',
      type: 'file-write',
      title: 'Titolo',
      subtitle: null,
      text: null,
      narrative: 'testo narrativa',
      facts: null,
      concepts: null,
      files_read: null,
      files_modified: null,
      prompt_number: 1,
      content_hash: null,
      discovery_tokens: 0,
      auto_category: null,
      created_at: new Date().toISOString(),
      created_at_epoch: Date.now(),
    };

    const hash1 = computeImportHash(rec);
    const hash2 = computeImportHash(rec);
    expect(hash1).toBe(hash2);
    expect(hash1.length).toBe(64); // SHA256 hex = 64 caratteri
  });

  it('produce hash diversi per projects diversi', () => {
    const base: JsonlObservation = {
      _type: 'observation',
      id: 1,
      memory_session_id: 'sess',
      project: 'A',
      type: 'file-write',
      title: 'Stesso titolo',
      subtitle: null,
      text: null,
      narrative: null,
      facts: null,
      concepts: null,
      files_read: null,
      files_modified: null,
      prompt_number: 1,
      content_hash: null,
      discovery_tokens: 0,
      auto_category: null,
      created_at: new Date().toISOString(),
      created_at_epoch: Date.now(),
    };

    const recA = { ...base, project: 'A' };
    const recB = { ...base, project: 'B' };
    expect(computeImportHash(recA)).not.toBe(computeImportHash(recB));
  });
});

describe('ImportExport — importJsonl', () => {
  let db: Database;

  beforeEach(() => {
    db = new KiroMemoryDatabase(':memory:').db;
  });

  afterEach(() => {
    db.close();
  });

  it('importa una singola observation da JSONL', () => {
    const rec: JsonlObservation = {
      _type: 'observation',
      id: 99,
      memory_session_id: 'sess-import',
      project: 'progetto-import',
      type: 'file-write',
      title: 'Observation importata',
      subtitle: null,
      text: 'Testo importato',
      narrative: 'Narrativa importata',
      facts: null,
      concepts: 'TypeScript',
      files_read: null,
      files_modified: null,
      prompt_number: 1,
      content_hash: null,
      discovery_tokens: 0,
      auto_category: null,
      created_at: new Date().toISOString(),
      created_at_epoch: Date.now(),
    };

    const content = JSON.stringify(rec);
    const result = importJsonl(db, content);

    expect(result.imported).toBe(1);
    expect(result.skipped).toBe(0);
    expect(result.errors).toBe(0);
    expect(result.total).toBe(1);

    // Verifica che il record sia effettivamente nel DB
    const dbRec = db.query('SELECT * FROM observations WHERE project = ?').get('progetto-import') as any;
    expect(dbRec).toBeDefined();
    expect(dbRec.title).toBe('Observation importata');
  });

  it('deduplication: salta un secondo import dello stesso record', () => {
    const rec: JsonlObservation = {
      _type: 'observation',
      id: 99,
      memory_session_id: 'sess',
      project: 'progetto',
      type: 'file-write',
      title: 'Titolo duplicato',
      subtitle: null,
      text: null,
      narrative: 'Narrativa unica',
      facts: null,
      concepts: null,
      files_read: null,
      files_modified: null,
      prompt_number: 1,
      content_hash: null,
      discovery_tokens: 0,
      auto_category: null,
      created_at: new Date().toISOString(),
      created_at_epoch: Date.now(),
    };

    const content = JSON.stringify(rec);

    // Prima importazione
    const r1 = importJsonl(db, content);
    expect(r1.imported).toBe(1);
    expect(r1.skipped).toBe(0);

    // Seconda importazione dello stesso record
    const r2 = importJsonl(db, content);
    expect(r2.imported).toBe(0);
    expect(r2.skipped).toBe(1);

    // Solo un record nel DB
    const count = (db.query('SELECT COUNT(*) as c FROM observations').get() as { c: number }).c;
    expect(count).toBe(1);
  });

  it('dry-run non inserisce nulla ma conta correttamente', () => {
    const rec: JsonlObservation = {
      _type: 'observation',
      id: 1,
      memory_session_id: 'sess',
      project: 'progetto-dry',
      type: 'file-write',
      title: 'Test dry run',
      subtitle: null,
      text: null,
      narrative: null,
      facts: null,
      concepts: null,
      files_read: null,
      files_modified: null,
      prompt_number: 1,
      content_hash: null,
      discovery_tokens: 0,
      auto_category: null,
      created_at: new Date().toISOString(),
      created_at_epoch: Date.now(),
    };

    const content = JSON.stringify(rec);
    const result = importJsonl(db, content, true); // dry_run = true

    expect(result.imported).toBe(1); // conterebbe 1
    expect(result.errors).toBe(0);

    // Ma il DB deve essere vuoto
    const count = (db.query('SELECT COUNT(*) as c FROM observations').get() as { c: number }).c;
    expect(count).toBe(0);
  });

  it('segnala errore per righe JSON non valide', () => {
    const content = 'non-json-valido\n{"_type":"observation","project":"p","type":"t","title":"ok"}';
    const result = importJsonl(db, content);

    expect(result.errors).toBe(1);
    expect(result.errorDetails.length).toBe(1);
    expect(result.errorDetails[0].line).toBe(1);
  });

  it('salta le righe vuote e il record _meta', () => {
    const meta = JSON.stringify({ _meta: { version: '1.0', exported_at: new Date().toISOString(), counts: {} } });
    const obs: JsonlObservation = {
      _type: 'observation',
      id: 1,
      memory_session_id: 'sess',
      project: 'progetto',
      type: 'file-write',
      title: 'Titolo',
      subtitle: null,
      text: null,
      narrative: null,
      facts: null,
      concepts: null,
      files_read: null,
      files_modified: null,
      prompt_number: 1,
      content_hash: null,
      discovery_tokens: 0,
      auto_category: null,
      created_at: new Date().toISOString(),
      created_at_epoch: Date.now(),
    };

    // Meta + riga vuota + observation
    const content = `${meta}\n\n${JSON.stringify(obs)}`;
    const result = importJsonl(db, content);

    expect(result.imported).toBe(1);
    expect(result.errors).toBe(0);
    // Il totale non conta il record _meta né le righe vuote
    expect(result.total).toBe(1);
  });

  it('importa summaries e prompts in un file misto', () => {
    const obs: JsonlObservation = {
      _type: 'observation',
      id: 1,
      memory_session_id: 'sess',
      project: 'p',
      type: 'file-write',
      title: 'Obs',
      subtitle: null,
      text: null,
      narrative: null,
      facts: null,
      concepts: null,
      files_read: null,
      files_modified: null,
      prompt_number: 1,
      content_hash: null,
      discovery_tokens: 0,
      auto_category: null,
      created_at: new Date().toISOString(),
      created_at_epoch: Date.now(),
    };

    const sum = {
      _type: 'summary',
      id: 1,
      session_id: 'sess-1',
      project: 'p',
      request: 'task',
      investigated: null,
      learned: null,
      completed: null,
      next_steps: null,
      notes: null,
      discovery_tokens: 0,
      created_at: new Date().toISOString(),
      created_at_epoch: Date.now(),
    };

    const prompt = {
      _type: 'prompt',
      id: 1,
      content_session_id: 'sess-1',
      project: 'p',
      prompt_number: 1,
      prompt_text: 'Fai qualcosa',
      created_at: new Date().toISOString(),
      created_at_epoch: Date.now(),
    };

    const content = [obs, sum, prompt].map(r => JSON.stringify(r)).join('\n');
    const result = importJsonl(db, content);

    expect(result.imported).toBe(3);
    expect(result.errors).toBe(0);

    const obsCount = (db.query('SELECT COUNT(*) as c FROM observations').get() as { c: number }).c;
    const sumCount = (db.query('SELECT COUNT(*) as c FROM summaries').get() as { c: number }).c;
    const promptCount = (db.query('SELECT COUNT(*) as c FROM prompts').get() as { c: number }).c;

    expect(obsCount).toBe(1);
    expect(sumCount).toBe(1);
    expect(promptCount).toBe(1);
  });

  it('batch insert: importa piu di 100 observations senza errori', () => {
    const recs = Array.from({ length: 150 }, (_, i): JsonlObservation => ({
      _type: 'observation',
      id: i + 1,
      memory_session_id: 'sess',
      project: 'batch-test',
      type: 'file-write',
      title: `Titolo ${i}`,
      subtitle: null,
      text: null,
      narrative: `Narrativa unica per record ${i}`,
      facts: null,
      concepts: null,
      files_read: null,
      files_modified: null,
      prompt_number: i,
      content_hash: null,
      discovery_tokens: 0,
      auto_category: null,
      created_at: new Date().toISOString(),
      created_at_epoch: Date.now() + i,
    }));

    const content = recs.map(r => JSON.stringify(r)).join('\n');
    const result = importJsonl(db, content);

    expect(result.imported).toBe(150);
    expect(result.errors).toBe(0);
    expect(result.skipped).toBe(0);

    const count = (db.query('SELECT COUNT(*) as c FROM observations').get() as { c: number }).c;
    expect(count).toBe(150);
  });
});

describe('ImportExport — hashExistsInObservations', () => {
  let db: Database;

  beforeEach(() => {
    db = new KiroMemoryDatabase(':memory:').db;
  });

  afterEach(() => {
    db.close();
  });

  it('ritorna false se il hash non esiste', () => {
    const exists = hashExistsInObservations(db, 'hash-non-esistente');
    expect(exists).toBe(false);
  });

  it('ritorna true se il hash esiste', () => {
    // Inserisce manualmente un record con hash noto
    db.run(
      `INSERT INTO observations
       (memory_session_id, project, type, title, prompt_number, created_at, created_at_epoch, content_hash)
       VALUES ('sess', 'p', 't', 'titolo', 1, datetime('now'), ?, 'hash-test-123')`,
      [Date.now()]
    );

    expect(hashExistsInObservations(db, 'hash-test-123')).toBe(true);
    expect(hashExistsInObservations(db, 'hash-diverso')).toBe(false);
  });
});

describe('ImportExport — roundtrip export/import', () => {
  let db: Database;

  beforeEach(() => {
    db = new KiroMemoryDatabase(':memory:').db;
  });

  afterEach(() => {
    db.close();
  });

  it('export + import su DB vuoto produce dati identici', () => {
    // Seed dati
    const id1 = seedObservation(db, 'roundtrip-progetto', 'decision');
    const id2 = seedObservation(db, 'roundtrip-progetto', 'file-write');

    // Export
    const lines: string[] = [];
    lines.push(generateMetaRecord(db, {}));
    exportObservationsStreaming(db, {}, (l) => lines.push(l));
    const jsonlContent = lines.join('\n');

    // Nuovo DB vuoto per l'import
    const db2 = new KiroMemoryDatabase(':memory:').db;
    try {
      const result = importJsonl(db2, jsonlContent);
      expect(result.imported).toBe(2);
      expect(result.errors).toBe(0);

      const count = (db2.query('SELECT COUNT(*) as c FROM observations').get() as { c: number }).c;
      expect(count).toBe(2);

      const rows = db2.query('SELECT project, type FROM observations ORDER BY id ASC').all() as any[];
      expect(rows[0].project).toBe('roundtrip-progetto');
    } finally {
      db2.close();
    }
  });
});
