/**
 * Test suite per il modulo Backup.
 *
 * Verifica: creazione backup, elenco, rotazione, ripristino.
 * Utilizza directory temporanee per isolare i test dal filesystem reale.
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, existsSync, writeFileSync, readFileSync, unlinkSync, mkdirSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { KiroMemoryDatabase } from '../../src/services/sqlite/Database.js';
import {
  createBackup,
  listBackups,
  restoreBackup,
  rotateBackups,
} from '../../src/services/sqlite/Backup.js';

// ─── Helpers ───

/**
 * Crea una directory temporanea e ritorna il percorso.
 * Viene rimossa automaticamente da afterEach tramite il cleanup array.
 */
function createTempDir(): string {
  return mkdtempSync(join(tmpdir(), 'kiro-backup-test-'));
}

/**
 * Crea un file DB SQLite temporaneo in una directory specificata,
 * popolato con alcune observations per testare le statistiche.
 */
function createTestDb(dir: string, name = 'test.db'): { dbPath: string; db: KiroMemoryDatabase } {
  const dbPath = join(dir, name);
  const db = new KiroMemoryDatabase(dbPath);

  // Inserisce qualche dato per avere statistiche non nulle
  db.db.run(`
    INSERT INTO sessions (content_session_id, project, user_prompt, started_at, started_at_epoch)
    VALUES ('sess-1', 'test-project', 'test prompt', '2026-02-27T10:00:00Z', 1740650400000)
  `);
  db.db.run(`
    INSERT INTO observations (memory_session_id, project, type, title, prompt_number, created_at, created_at_epoch)
    VALUES ('sess-1', 'test-project', 'test', 'Observation 1', 1, '2026-02-27T10:00:00Z', 1740650400000)
  `);
  db.db.run(`
    INSERT INTO observations (memory_session_id, project, type, title, prompt_number, created_at, created_at_epoch)
    VALUES ('sess-1', 'test-project', 'test', 'Observation 2', 2, '2026-02-27T10:01:00Z', 1740650460000)
  `);

  return { dbPath, db };
}

// ─── Test suite ───

describe('Backup Module', () => {
  // Directory temporanee create durante i test (per cleanup)
  const tempDirs: string[] = [];

  afterEach(() => {
    // Rimuove ricorsivamente le directory temporanee create
    for (const dir of tempDirs) {
      try {
        // Cleanup manuale: rimuove i file uno ad uno (fs.rm non è disponibile in tutte le versioni)
        const files = existsSync(dir)
          ? (Bun.file(dir) as unknown as { isDirectory?: boolean }, require('fs').readdirSync(dir))
          : [];
        for (const f of files as string[]) {
          const fp = join(dir, f);
          if (existsSync(fp)) unlinkSync(fp);
        }
        require('fs').rmdirSync(dir, { recursive: true });
      } catch { /* ignora errori cleanup */ }
    }
    tempDirs.length = 0;
  });

  // ── createBackup ──

  describe('createBackup', () => {
    it('deve creare il file .db nella directory backup', () => {
      const srcDir = createTempDir();
      const backupDir = createTempDir();
      tempDirs.push(srcDir, backupDir);

      const { dbPath, db } = createTestDb(srcDir);
      try {
        const entry = createBackup(dbPath, backupDir, db.db);

        // Verifica che il file DB backup esista
        expect(existsSync(entry.filePath)).toBe(true);
        // Verifica che il file sia effettivamente un file SQLite (inizia con "SQLite format 3")
        const buf = Buffer.allocUnsafe(16);
        const fh = require('fs').openSync(entry.filePath, 'r');
        require('fs').readSync(fh, buf, 0, 16, 0);
        require('fs').closeSync(fh);
        expect(buf.toString('ascii', 0, 6)).toBe('SQLite');
      } finally {
        db.close();
      }
    });

    it('deve creare il file .meta.json con metadata corretti', () => {
      const srcDir = createTempDir();
      const backupDir = createTempDir();
      tempDirs.push(srcDir, backupDir);

      const { dbPath, db } = createTestDb(srcDir);
      try {
        const entry = createBackup(dbPath, backupDir, db.db);

        // Verifica che il file metadata esista
        expect(existsSync(entry.metaPath)).toBe(true);

        // Verifica contenuto metadata
        const meta = entry.metadata;
        expect(meta.filename).toMatch(/^backup-\d{4}-\d{2}-\d{2}-\d{6}-\d{3}\.db$/);
        expect(meta.sourcePath).toBe(dbPath);
        expect(meta.schemaVersion).toBeGreaterThan(0);
        expect(meta.timestampEpoch).toBeGreaterThan(0);
        expect(typeof meta.timestamp).toBe('string');
      } finally {
        db.close();
      }
    });

    it('deve includere statistiche corrette nel metadata', () => {
      const srcDir = createTempDir();
      const backupDir = createTempDir();
      tempDirs.push(srcDir, backupDir);

      const { dbPath, db } = createTestDb(srcDir);
      try {
        const entry = createBackup(dbPath, backupDir, db.db);

        // 2 observations inserite in createTestDb
        expect(entry.metadata.stats.observations).toBe(2);
        // 1 sessione inserita
        expect(entry.metadata.stats.sessions).toBe(1);
        // 0 summaries e prompts
        expect(entry.metadata.stats.summaries).toBe(0);
        expect(entry.metadata.stats.prompts).toBe(0);
        // Dimensione > 0
        expect(entry.metadata.stats.dbSizeBytes).toBeGreaterThan(0);
      } finally {
        db.close();
      }
    });

    it('deve sollevare errore se il DB sorgente non esiste', () => {
      const backupDir = createTempDir();
      tempDirs.push(backupDir);

      // Crea un DB temporaneo per ottenere l'istanza, poi usa un percorso inesistente
      const srcDir = createTempDir();
      tempDirs.push(srcDir);
      const { db } = createTestDb(srcDir);
      try {
        expect(() => {
          createBackup('/tmp/kiro-test-inesistente-xyz-999.db', backupDir, db.db);
        }).toThrow();
      } finally {
        db.close();
      }
    });

    it('deve creare la directory backup se non esiste', () => {
      const srcDir = createTempDir();
      tempDirs.push(srcDir);

      // Directory backup non ancora creata
      const backupDir = join(srcDir, 'nuova-backup-dir');
      // NON la aggiungiamo a tempDirs perché è dentro srcDir (già incluso)

      const { dbPath, db } = createTestDb(srcDir);
      try {
        expect(existsSync(backupDir)).toBe(false);
        createBackup(dbPath, backupDir, db.db);
        expect(existsSync(backupDir)).toBe(true);
      } finally {
        db.close();
      }
    });
  });

  // ── listBackups ──

  describe('listBackups', () => {
    it('deve ritornare array vuoto se la directory non esiste', () => {
      const result = listBackups('/tmp/kiro-test-inesistente-dir-abc123');
      expect(result).toEqual([]);
    });

    it('deve ritornare array vuoto per directory vuota', () => {
      const backupDir = createTempDir();
      tempDirs.push(backupDir);

      const result = listBackups(backupDir);
      expect(result).toEqual([]);
    });

    it('deve elencare i backup in ordine cronologico discendente', () => {
      const srcDir = createTempDir();
      const backupDir = createTempDir();
      tempDirs.push(srcDir, backupDir);

      const { dbPath, db } = createTestDb(srcDir);
      try {
        // Crea 3 backup in sequenza
        const b1 = createBackup(dbPath, backupDir, db.db);
        // Piccola pausa per garantire timestamp diversi (1ms)
        const now = Date.now();
        while (Date.now() === now) { /* busy wait < 1ms */ }
        const b2 = createBackup(dbPath, backupDir, db.db);
        while (Date.now() === now) { /* busy wait < 1ms */ }
        const b3 = createBackup(dbPath, backupDir, db.db);

        const entries = listBackups(backupDir);

        // Deve trovare esattamente 3 backup
        expect(entries.length).toBe(3);

        // Il primo deve essere il più recente (ordine DESC)
        expect(entries[0].metadata.timestampEpoch).toBeGreaterThanOrEqual(entries[1].metadata.timestampEpoch);
        expect(entries[1].metadata.timestampEpoch).toBeGreaterThanOrEqual(entries[2].metadata.timestampEpoch);
      } finally {
        db.close();
      }
    });

    it('deve includere filePath e metaPath per ogni backup', () => {
      const srcDir = createTempDir();
      const backupDir = createTempDir();
      tempDirs.push(srcDir, backupDir);

      const { dbPath, db } = createTestDb(srcDir);
      try {
        createBackup(dbPath, backupDir, db.db);
        const entries = listBackups(backupDir);

        expect(entries.length).toBe(1);
        expect(existsSync(entries[0].filePath)).toBe(true);
        expect(existsSync(entries[0].metaPath)).toBe(true);
        expect(entries[0].filePath.endsWith('.db')).toBe(true);
        expect(entries[0].metaPath.endsWith('.meta.json')).toBe(true);
      } finally {
        db.close();
      }
    });

    it('deve ignorare file senza metadata .meta.json', () => {
      const backupDir = createTempDir();
      tempDirs.push(backupDir);

      // Crea un file .db senza il corrispondente .meta.json
      writeFileSync(join(backupDir, 'backup-2026-02-27-120000.db'), 'dummy');

      const entries = listBackups(backupDir);
      // Deve ignorarlo perché manca il .meta.json
      expect(entries.length).toBe(0);
    });
  });

  // ── rotateBackups ──

  describe('rotateBackups', () => {
    it('deve non eliminare nulla se il numero di backup è <= maxKeep', () => {
      const srcDir = createTempDir();
      const backupDir = createTempDir();
      tempDirs.push(srcDir, backupDir);

      const { dbPath, db } = createTestDb(srcDir);
      try {
        createBackup(dbPath, backupDir, db.db);
        createBackup(dbPath, backupDir, db.db);

        const deleted = rotateBackups(backupDir, 5); // limite 5, ne abbiamo 2
        expect(deleted).toBe(0);

        // Devono restare tutti i 2 backup
        const remaining = listBackups(backupDir);
        expect(remaining.length).toBe(2);
      } finally {
        db.close();
      }
    });

    it('deve eliminare i backup più vecchi mantenendo gli ultimi N', () => {
      const srcDir = createTempDir();
      const backupDir = createTempDir();
      tempDirs.push(srcDir, backupDir);

      const { dbPath, db } = createTestDb(srcDir);
      try {
        // Crea 5 backup (timestamp distinti tramite loop)
        const created: string[] = [];
        for (let i = 0; i < 5; i++) {
          const entry = createBackup(dbPath, backupDir, db.db);
          created.push(entry.metadata.filename);
          // Attende 1ms per garantire timestamp diversi
          const t = Date.now();
          while (Date.now() === t) { /* busy wait */ }
        }

        // Mantiene solo gli ultimi 3
        const deleted = rotateBackups(backupDir, 3);
        expect(deleted).toBe(2);

        const remaining = listBackups(backupDir);
        expect(remaining.length).toBe(3);

        // I 3 rimasti devono essere i più recenti
        const remainingFiles = remaining.map(e => e.metadata.filename);
        const sortedCreated = [...created].reverse(); // dal più recente
        expect(remainingFiles).toContain(sortedCreated[0]);
        expect(remainingFiles).toContain(sortedCreated[1]);
        expect(remainingFiles).toContain(sortedCreated[2]);
      } finally {
        db.close();
      }
    });

    it('deve eliminare sia il file .db che il .meta.json', () => {
      const srcDir = createTempDir();
      const backupDir = createTempDir();
      tempDirs.push(srcDir, backupDir);

      const { dbPath, db } = createTestDb(srcDir);
      try {
        const entry1 = createBackup(dbPath, backupDir, db.db);
        const t = Date.now();
        while (Date.now() === t) { /* busy wait */ }
        createBackup(dbPath, backupDir, db.db);

        // Mantiene solo 1
        rotateBackups(backupDir, 1);

        // Il primo (più vecchio) deve essere stato eliminato
        expect(existsSync(entry1.filePath)).toBe(false);
        expect(existsSync(entry1.metaPath)).toBe(false);
      } finally {
        db.close();
      }
    });

    it('deve sollevare errore per maxKeep <= 0', () => {
      const backupDir = createTempDir();
      tempDirs.push(backupDir);

      expect(() => rotateBackups(backupDir, 0)).toThrow();
      expect(() => rotateBackups(backupDir, -1)).toThrow();
    });

    it('deve ritornare 0 se la directory non esiste', () => {
      const deleted = rotateBackups('/tmp/kiro-test-inesistente-rotate', 5);
      expect(deleted).toBe(0);
    });
  });

  // ── restoreBackup ──

  describe('restoreBackup', () => {
    it('deve ripristinare il file DB correttamente', () => {
      const srcDir = createTempDir();
      const backupDir = createTempDir();
      const restoreDir = createTempDir();
      tempDirs.push(srcDir, backupDir, restoreDir);

      const { dbPath, db } = createTestDb(srcDir);
      try {
        // Crea il backup
        const entry = createBackup(dbPath, backupDir, db.db);
        db.close();

        // Percorso dove ripristinare
        const restorePath = join(restoreDir, 'restored.db');

        restoreBackup(entry.filePath, restorePath);

        // Verifica che il file esista
        expect(existsSync(restorePath)).toBe(true);

        // Verifica che il DB ripristinato sia apribile e contenga i dati
        const restoredDb = new KiroMemoryDatabase(restorePath, true);
        try {
          const row = restoredDb.db.query('SELECT COUNT(*) as c FROM observations').get() as { c: number };
          expect(row.c).toBe(2);
        } finally {
          restoredDb.close();
        }
      } finally {
        try { db.close(); } catch { /* già chiuso */ }
      }
    });

    it('deve sollevare errore se il file backup non esiste', () => {
      const restoreDir = createTempDir();
      tempDirs.push(restoreDir);

      expect(() => {
        restoreBackup('/tmp/kiro-test-inesistente-backup.db', join(restoreDir, 'dest.db'));
      }).toThrow();
    });

    it('deve sovrascrivere il DB destinazione se già esiste', () => {
      const srcDir = createTempDir();
      const backupDir = createTempDir();
      const destDir = createTempDir();
      tempDirs.push(srcDir, backupDir, destDir);

      const { dbPath, db } = createTestDb(srcDir);
      try {
        const entry = createBackup(dbPath, backupDir, db.db);
        db.close();

        // Crea un file destinazione fittizio
        const destPath = join(destDir, 'existing.db');
        writeFileSync(destPath, 'file esistente da sovrascrivere');
        expect(existsSync(destPath)).toBe(true);

        // Il ripristino deve sovrascriverlo
        restoreBackup(entry.filePath, destPath);

        // Il file deve ora essere un DB SQLite valido
        const buf = Buffer.allocUnsafe(6);
        const fh = require('fs').openSync(destPath, 'r');
        require('fs').readSync(fh, buf, 0, 6, 0);
        require('fs').closeSync(fh);
        expect(buf.toString('ascii')).toBe('SQLite');
      } finally {
        try { db.close(); } catch { /* già chiuso */ }
      }
    });
  });
});
