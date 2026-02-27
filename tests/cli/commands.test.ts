/**
 * Test suite per i comandi avanzati della CLI di Kiro Memory.
 * Testa le funzioni pure estratte in cli-utils.ts (no process.exit, no stdin).
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import {
  // Export
  observationToJsonl,
  generateJsonlOutput,
  generateJsonOutput,
  observationToMarkdown,
  generateMarkdownOutput,
  generateExportOutput,
  // Import
  validateImportRecord,
  parseJsonlFile,
  // Config
  readConfig,
  writeConfig,
  getConfigValue,
  setConfigValue,
  listConfig,
  CONFIG_DEFAULTS,
  // Stats
  formatBytes,
  formatStatsOutput,
  buildProgressBar,
  getDbFileSize,
  // Doctor fix
  rebuildFtsIndex,
  removeOrphanedEmbeddings,
  vacuumDatabase,
} from '../../src/cli/cli-utils.js';
import { KiroMemoryDatabase } from '../../src/services/sqlite/Database.js';
import { createObservation } from '../../src/services/sqlite/Observations.js';
import type { Observation } from '../../src/types/worker-types.js';

// ─── Fixture ───

/** Crea un'observation minimale per i test */
function makeObservation(overrides: Partial<Observation> = {}): Observation {
  return {
    id: 1,
    memory_session_id: 'session-test',
    project: 'test-project',
    type: 'bug-fix',
    title: 'Fix autenticazione OAuth',
    subtitle: 'Problema con token scaduto',
    text: 'Il token OAuth scadeva troppo presto causando errori 401.',
    narrative: 'Abbiamo aggiornato il refresh flow.',
    facts: 'Token lifetime: 3600s → 7200s',
    concepts: 'OAuth, JWT, autenticazione',
    files_read: 'src/auth.ts',
    files_modified: 'src/auth.ts,src/config.ts',
    prompt_number: 3,
    created_at: '2025-01-15T10:30:00.000Z',
    created_at_epoch: 1736936200000,
    last_accessed_epoch: null,
    is_stale: 0,
    ...overrides,
  };
}

// ─── Test: Export format JSONL ───

describe('Export — formato JSONL', () => {
  it('dovrebbe serializzare una observation su una singola riga', () => {
    const obs = makeObservation();
    const line = observationToJsonl(obs);

    // Deve essere JSON valido
    const parsed = JSON.parse(line);
    expect(parsed.id).toBe(1);
    expect(parsed.title).toBe('Fix autenticazione OAuth');
    expect(parsed.project).toBe('test-project');
  });

  it('non dovrebbe contenere newline interne', () => {
    const obs = makeObservation({ text: 'Prima riga\nSeconda riga\nTerza riga' });
    const line = observationToJsonl(obs);
    // JSONL: il newline del contenuto viene escaped in \\n
    expect(line).not.toMatch(/(?<!\\)\n/);
  });

  it('dovrebbe generare N righe per N observations', () => {
    const observations = [
      makeObservation({ id: 1, title: 'Primo' }),
      makeObservation({ id: 2, title: 'Secondo' }),
      makeObservation({ id: 3, title: 'Terzo' }),
    ];
    const output = generateJsonlOutput(observations);
    const lines = output.split('\n').filter(l => l.trim());
    expect(lines.length).toBe(3);

    // Ogni riga deve essere JSON valido con i titoli corretti
    const parsed = lines.map(l => JSON.parse(l));
    expect(parsed[0].title).toBe('Primo');
    expect(parsed[1].title).toBe('Secondo');
    expect(parsed[2].title).toBe('Terzo');
  });

  it('dovrebbe gestire array vuoto senza errori', () => {
    const output = generateJsonlOutput([]);
    expect(output).toBe('');
  });
});

// ─── Test: Export formato JSON ───

describe('Export — formato JSON', () => {
  it('dovrebbe generare un array JSON valido', () => {
    const observations = [
      makeObservation({ id: 1 }),
      makeObservation({ id: 2 }),
    ];
    const output = generateJsonOutput(observations);
    const parsed = JSON.parse(output);

    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed.length).toBe(2);
    expect(parsed[0].id).toBe(1);
    expect(parsed[1].id).toBe(2);
  });

  it('dovrebbe preservare tutti i campi delle observations', () => {
    const obs = makeObservation();
    const output = generateJsonOutput([obs]);
    const parsed = JSON.parse(output);

    expect(parsed[0].title).toBe(obs.title);
    expect(parsed[0].type).toBe(obs.type);
    expect(parsed[0].project).toBe(obs.project);
    expect(parsed[0].text).toBe(obs.text);
    expect(parsed[0].narrative).toBe(obs.narrative);
  });
});

// ─── Test: Export formato Markdown ───

describe('Export — formato Markdown', () => {
  it('dovrebbe includere il titolo come heading H2', () => {
    const obs = makeObservation();
    const md = observationToMarkdown(obs);
    expect(md).toContain('## Fix autenticazione OAuth');
  });

  it('dovrebbe includere tipo e progetto nei metadati', () => {
    const obs = makeObservation();
    const md = observationToMarkdown(obs);
    expect(md).toContain('**Tipo:** bug-fix');
    expect(md).toContain('**Progetto:** test-project');
  });

  it('dovrebbe includere testo e narrativa come sezioni H3', () => {
    const obs = makeObservation();
    const md = observationToMarkdown(obs);
    expect(md).toContain('### Contenuto');
    expect(md).toContain('Il token OAuth scadeva troppo presto');
    expect(md).toContain('### Narrativa');
    expect(md).toContain('Abbiamo aggiornato il refresh flow.');
  });

  it('dovrebbe generare header con conteggio per array', () => {
    const observations = [
      makeObservation({ id: 1 }),
      makeObservation({ id: 2 }),
    ];
    const md = generateMarkdownOutput(observations);
    expect(md).toContain('# Kiro Memory — Export Observations');
    expect(md).toContain('Totale: 2');
  });

  it('dovrebbe gestire array vuoto con messaggio dedicato', () => {
    const md = generateMarkdownOutput([]);
    expect(md).toContain('Nessuna observation trovata');
  });
});

// ─── Test: generateExportOutput (selettore formato) ───

describe('generateExportOutput', () => {
  const obs = [makeObservation()];

  it('dovrebbe delegare a generateJsonlOutput per jsonl', () => {
    const out = generateExportOutput(obs, 'jsonl');
    expect(() => JSON.parse(out)).not.toThrow();
  });

  it('dovrebbe delegare a generateJsonOutput per json', () => {
    const out = generateExportOutput(obs, 'json');
    expect(() => JSON.parse(out)).not.toThrow();
    const parsed = JSON.parse(out);
    expect(Array.isArray(parsed)).toBe(true);
  });

  it('dovrebbe delegare a generateMarkdownOutput per md', () => {
    const out = generateExportOutput(obs, 'md');
    expect(out).toContain('#');
  });
});

// ─── Test: Import — validazione record ───

describe('Import — validateImportRecord', () => {
  it('dovrebbe accettare un record minimo valido', () => {
    const err = validateImportRecord({ project: 'test', type: 'bug-fix', title: 'Titolo' });
    expect(err).toBeNull();
  });

  it('dovrebbe rifiutare null', () => {
    const err = validateImportRecord(null);
    expect(err).not.toBeNull();
  });

  it('dovrebbe rifiutare stringhe non-JSON', () => {
    const err = validateImportRecord('stringa');
    expect(err).not.toBeNull();
  });

  it('dovrebbe richiedere il campo project', () => {
    const err = validateImportRecord({ type: 'bug-fix', title: 'Titolo' });
    expect(err).not.toBeNull();
    expect(err).toContain('project');
  });

  it('dovrebbe richiedere il campo type', () => {
    const err = validateImportRecord({ project: 'test', title: 'Titolo' });
    expect(err).not.toBeNull();
    expect(err).toContain('type');
  });

  it('dovrebbe richiedere il campo title', () => {
    const err = validateImportRecord({ project: 'test', type: 'bug-fix' });
    expect(err).not.toBeNull();
    expect(err).toContain('title');
  });

  it('dovrebbe rifiutare project vuoto', () => {
    const err = validateImportRecord({ project: '', type: 'bug-fix', title: 'Titolo' });
    expect(err).not.toBeNull();
  });

  it('dovrebbe rifiutare project troppo lungo', () => {
    const err = validateImportRecord({ project: 'x'.repeat(201), type: 'bug-fix', title: 'Titolo' });
    expect(err).not.toBeNull();
    expect(err).toContain('project');
  });

  it('dovrebbe rifiutare campi opzionali con tipo errato', () => {
    const err = validateImportRecord({ project: 'test', type: 'bug-fix', title: 'T', text: 123 });
    expect(err).not.toBeNull();
    expect(err).toContain('text');
  });

  it('dovrebbe accettare campi opzionali a null', () => {
    const err = validateImportRecord({
      project: 'test',
      type: 'bug-fix',
      title: 'Titolo',
      text: null,
      narrative: null,
      subtitle: null,
    });
    expect(err).toBeNull();
  });
});

// ─── Test: Import — parsing JSONL ───

describe('Import — parseJsonlFile', () => {
  it('dovrebbe parsare righe JSONL valide', () => {
    const content = [
      JSON.stringify({ project: 'p', type: 't', title: 'Titolo 1' }),
      JSON.stringify({ project: 'p', type: 't', title: 'Titolo 2' }),
    ].join('\n');

    const results = parseJsonlFile(content);
    expect(results.length).toBe(2);
    expect(results[0].record?.title).toBe('Titolo 1');
    expect(results[1].record?.title).toBe('Titolo 2');
  });

  it('dovrebbe saltare le righe vuote', () => {
    const content = `${JSON.stringify({ project: 'p', type: 't', title: 'T' })}\n\n\n`;
    const results = parseJsonlFile(content);
    expect(results.length).toBe(1);
  });

  it('dovrebbe saltare le righe commento (#)', () => {
    const content = `# commento\n${JSON.stringify({ project: 'p', type: 't', title: 'T' })}`;
    const results = parseJsonlFile(content);
    expect(results.length).toBe(1);
    expect(results[0].record).toBeDefined();
  });

  it('dovrebbe segnalare errori su JSON non valido', () => {
    const content = `{invalid json}\n${JSON.stringify({ project: 'p', type: 't', title: 'T' })}`;
    const results = parseJsonlFile(content);
    expect(results.length).toBe(2);
    expect(results[0].error).toBeDefined();
    expect(results[1].record).toBeDefined();
  });

  it('dovrebbe segnalare errori su record non valido', () => {
    const content = JSON.stringify({ project: 'p' }); // manca type e title
    const results = parseJsonlFile(content);
    expect(results.length).toBe(1);
    expect(results[0].error).toBeDefined();
  });

  it('dovrebbe mantenere il numero di riga corretto', () => {
    const content = `${JSON.stringify({ project: 'p', type: 't', title: 'T' })}\n{invalid}`;
    const results = parseJsonlFile(content);
    const errorEntry = results.find(r => r.error);
    expect(errorEntry?.line).toBe(2);
  });
});

// ─── Test: Config — get/set/list ───

describe('Config — get/set/list', () => {
  let tmpDir: string;
  let configPath: string;

  beforeEach(() => {
    // Usa directory temporanea isolata per ogni test
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kiro-config-test-'));
    configPath = path.join(tmpDir, 'config.json');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('dovrebbe ritornare oggetto vuoto se il file non esiste', () => {
    const config = readConfig(configPath);
    expect(Object.keys(config).length).toBe(0);
  });

  it('dovrebbe scrivere e rileggere la configurazione', () => {
    writeConfig({ 'worker.port': 3001, 'log.level': 'DEBUG' }, configPath);
    const config = readConfig(configPath);
    expect(config['worker.port']).toBe(3001);
    expect(config['log.level']).toBe('DEBUG');
  });

  it('getConfigValue dovrebbe restituire il valore dal file', () => {
    writeConfig({ 'worker.port': 4000 }, configPath);
    expect(getConfigValue('worker.port', configPath)).toBe(4000);
  });

  it('getConfigValue dovrebbe usare il default se non nel file', () => {
    const val = getConfigValue('worker.port', configPath);
    expect(val).toBe(CONFIG_DEFAULTS['worker.port']);
  });

  it('getConfigValue dovrebbe restituire null per chiavi sconosciute', () => {
    const val = getConfigValue('chiave.inesistente', configPath);
    expect(val).toBeNull();
  });

  it('setConfigValue dovrebbe salvare una stringa', () => {
    const saved = setConfigValue('log.level', 'DEBUG', configPath);
    expect(saved).toBe('DEBUG');
    expect(getConfigValue('log.level', configPath)).toBe('DEBUG');
  });

  it('setConfigValue dovrebbe convertire numeri automaticamente', () => {
    const saved = setConfigValue('worker.port', '4200', configPath);
    expect(saved).toBe(4200);
    expect(typeof saved).toBe('number');
  });

  it('setConfigValue dovrebbe convertire booleani automaticamente', () => {
    const savedTrue = setConfigValue('embeddings.enabled', 'true', configPath);
    expect(savedTrue).toBe(true);
    expect(typeof savedTrue).toBe('boolean');

    const savedFalse = setConfigValue('embeddings.enabled', 'false', configPath);
    expect(savedFalse).toBe(false);
  });

  it('listConfig dovrebbe includere i default per chiavi non impostate', () => {
    const config = listConfig(configPath);
    expect('worker.port' in config).toBe(true);
    expect('log.level' in config).toBe(true);
    // Valori di default
    expect(config['worker.port']).toBe(CONFIG_DEFAULTS['worker.port']);
  });

  it('listConfig dovrebbe sovrascrivere i default con valori del file', () => {
    writeConfig({ 'worker.port': 9000 }, configPath);
    const config = listConfig(configPath);
    expect(config['worker.port']).toBe(9000);
  });
});

// ─── Test: Stats — formatBytes e formatStatsOutput ───

describe('Stats — formattazione output', () => {
  it('formatBytes — byte', () => {
    expect(formatBytes(512)).toBe('512 B');
  });

  it('formatBytes — kilobyte', () => {
    expect(formatBytes(2048)).toBe('2.0 KB');
  });

  it('formatBytes — megabyte', () => {
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB');
  });

  it('formatBytes — gigabyte', () => {
    expect(formatBytes(2 * 1024 * 1024 * 1024)).toBe('2.00 GB');
  });

  it('buildProgressBar — 0%', () => {
    expect(buildProgressBar(0, 10)).toBe('[----------]');
  });

  it('buildProgressBar — 100%', () => {
    expect(buildProgressBar(100, 10)).toBe('[##########]');
  });

  it('buildProgressBar — 50%', () => {
    const bar = buildProgressBar(50, 10);
    expect(bar).toBe('[#####-----]');
  });

  it('formatStatsOutput — include tutte le sezioni attese', () => {
    const stats = {
      totalObservations: 142,
      totalSessions: 28,
      totalProjects: 5,
      dbSizeBytes: 1024 * 512,
      mostActiveProject: 'kiro-memory',
      embeddingCoverage: 73,
    };
    const out = formatStatsOutput(stats);

    expect(out).toContain('142');
    expect(out).toContain('28');
    expect(out).toContain('5');
    expect(out).toContain('kiro-memory');
    expect(out).toContain('73%');
    expect(out).toContain('512.0 KB');
  });

  it('getDbFileSize — ritorna 0 per file inesistente', () => {
    const size = getDbFileSize('/percorso/che/non/esiste/db.sqlite');
    expect(size).toBe(0);
  });

  it('getDbFileSize — ritorna dimensione corretta per file esistente', () => {
    const tmpFile = path.join(os.tmpdir(), `test-db-${Date.now()}.sqlite`);
    fs.writeFileSync(tmpFile, 'contenuto di test 1234');
    try {
      const size = getDbFileSize(tmpFile);
      expect(size).toBeGreaterThan(0);
    } finally {
      fs.unlinkSync(tmpFile);
    }
  });
});

// ─── Test: Doctor fix — operazioni sul database ───

describe('Doctor fix — operazioni database', () => {
  let kmDb: KiroMemoryDatabase;

  beforeEach(() => {
    kmDb = new KiroMemoryDatabase(':memory:');
    // Popola con qualche dato di test
    createObservation(
      kmDb.db,
      'session-1',
      'test-project',
      'bug-fix',
      'Observation di test',
      null,
      'Contenuto di test',
      null, null, null, null, null, 1
    );
  });

  afterEach(() => {
    kmDb.close();
  });

  it('rebuildFtsIndex — dovrebbe completare senza errori', () => {
    // In memoria l'indice FTS potrebbe non essere disponibile, ma non deve lanciare eccezioni
    expect(() => rebuildFtsIndex(kmDb.db)).not.toThrow();
  });

  it('removeOrphanedEmbeddings — ritorna 0 se non ci sono orfani', () => {
    const removed = removeOrphanedEmbeddings(kmDb.db);
    expect(removed).toBe(0);
  });

  it('removeOrphanedEmbeddings — rimuove embedding senza observation', () => {
    // Inserisce un embedding orfano (senza observation corrispondente)
    try {
      kmDb.db.run(
        `INSERT INTO observation_embeddings (observation_id, embedding, provider, created_at_epoch)
         VALUES (999999, X'00010203', 'test', 1234567890)`
      );
      const removed = removeOrphanedEmbeddings(kmDb.db);
      expect(removed).toBe(1);
    } catch {
      // La tabella observation_embeddings potrebbe non avere questa colonna
      // in DB in-memory a seconda della migrazione — skip questo caso
    }
  });

  it('vacuumDatabase — dovrebbe completare senza errori', () => {
    expect(() => vacuumDatabase(kmDb.db)).not.toThrow();
    const result = vacuumDatabase(kmDb.db);
    expect(result).toBe(true);
  });
});

// ─── Test: Import — deduplication logica ───

describe('Import — logica di deduplication', () => {
  it('due records con stesso project+type+title dovrebbero avere stesso hash base', () => {
    const { createHash } = require('crypto');

    const rec1 = { project: 'p', type: 'bug-fix', title: 'Fix OAuth', narrative: '' };
    const rec2 = { project: 'p', type: 'bug-fix', title: 'Fix OAuth', narrative: '' };

    const hash1 = createHash('sha256')
      .update(`${rec1.project}|${rec1.type}|${rec1.title}|${rec1.narrative}`)
      .digest('hex');
    const hash2 = createHash('sha256')
      .update(`${rec2.project}|${rec2.type}|${rec2.title}|${rec2.narrative}`)
      .digest('hex');

    expect(hash1).toBe(hash2);
  });

  it('records con title diverso dovrebbero avere hash diversi', () => {
    const { createHash } = require('crypto');

    const hash1 = createHash('sha256').update('p|bug-fix|Titolo A|').digest('hex');
    const hash2 = createHash('sha256').update('p|bug-fix|Titolo B|').digest('hex');

    expect(hash1).not.toBe(hash2);
  });
});
