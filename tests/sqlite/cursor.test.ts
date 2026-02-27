/**
 * Test suite per il modulo keyset pagination cursor.
 *
 * Copre:
 * - encodeCursor / decodeCursor (round-trip, casi invalidi)
 * - buildNextCursor (pagina piena vs pagina parziale)
 * - Query SQL end-to-end su DB in-memory
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { KiroMemoryDatabase } from '../../src/services/sqlite/Database.js';
import {
  encodeCursor,
  decodeCursor,
  buildNextCursor,
} from '../../src/services/sqlite/cursor.js';
import { createObservation } from '../../src/services/sqlite/Observations.js';
import type { Database } from 'bun:sqlite';

// ─────────────────────────────────────────────
// Utility per il test: inserisce N osservazioni di test
// ─────────────────────────────────────────────
function seedObservations(db: Database, count: number, project = 'test-project'): void {
  for (let i = 1; i <= count; i++) {
    createObservation(
      db,
      `session-${i}`,
      project,
      'file-write',
      `Observation ${i}`,
      null,
      `Content ${i}`,
      null,
      null,
      null,
      null,
      null,
      i
    );
  }
}

// ─────────────────────────────────────────────
// encodeCursor / decodeCursor
// ─────────────────────────────────────────────
describe('encodeCursor', () => {
  it('produce una stringa base64 non vuota', () => {
    const result = encodeCursor(42, 1700000000000);
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('round-trip: encode → decode restituisce i valori originali', () => {
    const id = 999;
    const epoch = 1700000000123;
    const cursor = encodeCursor(id, epoch);
    const decoded = decodeCursor(cursor);

    expect(decoded).not.toBeNull();
    expect(decoded!.id).toBe(id);
    expect(decoded!.epoch).toBe(epoch);
  });

  it('due cursor diversi per valori diversi', () => {
    const c1 = encodeCursor(1, 1000);
    const c2 = encodeCursor(2, 1000);
    expect(c1).not.toBe(c2);
  });
});

describe('decodeCursor', () => {
  it('restituisce null per una stringa vuota', () => {
    expect(decodeCursor('')).toBeNull();
  });

  it('restituisce null per base64 invalido', () => {
    expect(decodeCursor('non_è_base64!!!!')).toBeNull();
  });

  it('restituisce null se epoch è zero', () => {
    // epoch = 0 non è un intero positivo valido
    const raw = Buffer.from('0:5', 'utf8').toString('base64url');
    expect(decodeCursor(raw)).toBeNull();
  });

  it('restituisce null se id è zero', () => {
    const raw = Buffer.from('1700000000000:0', 'utf8').toString('base64url');
    expect(decodeCursor(raw)).toBeNull();
  });

  it('restituisce null senza separatore', () => {
    const raw = Buffer.from('170000000000042', 'utf8').toString('base64url');
    expect(decodeCursor(raw)).toBeNull();
  });

  it('restituisce null per valori non numerici', () => {
    const raw = Buffer.from('abc:def', 'utf8').toString('base64url');
    expect(decodeCursor(raw)).toBeNull();
  });
});

// ─────────────────────────────────────────────
// buildNextCursor
// ─────────────────────────────────────────────
describe('buildNextCursor', () => {
  it('restituisce null se la lista è vuota', () => {
    expect(buildNextCursor([], 10)).toBeNull();
  });

  it('restituisce null se la pagina è parziale (righe < limit)', () => {
    const rows = [
      { id: 1, created_at_epoch: 1000 },
      { id: 2, created_at_epoch: 900 },
    ];
    // limit = 5, ma ci sono solo 2 righe → ultima pagina
    expect(buildNextCursor(rows, 5)).toBeNull();
  });

  it('restituisce un cursor se la pagina è piena (righe === limit)', () => {
    const rows = [
      { id: 10, created_at_epoch: 2000 },
      { id: 9, created_at_epoch: 1900 },
      { id: 8, created_at_epoch: 1800 },
    ];
    const cursor = buildNextCursor(rows, 3);
    expect(cursor).not.toBeNull();

    // Il cursor deve puntare all'ultimo elemento (id=8, epoch=1800)
    const decoded = decodeCursor(cursor!);
    expect(decoded!.id).toBe(8);
    expect(decoded!.epoch).toBe(1800);
  });
});

// ─────────────────────────────────────────────
// Query SQL end-to-end
// ─────────────────────────────────────────────
describe('Keyset pagination SQL (in-memory)', () => {
  let db: Database;

  beforeEach(() => {
    db = new KiroMemoryDatabase(':memory:').db;
    // Inserisce 15 osservazioni con timestamp decrescenti
    seedObservations(db, 15);
  });

  afterEach(() => {
    db.close();
  });

  it('recupera la prima pagina senza cursor', () => {
    const rows = db.query(
      'SELECT * FROM observations ORDER BY created_at_epoch DESC, id DESC LIMIT ?'
    ).all(5) as Array<{ id: number; created_at_epoch: number; title: string }>;

    expect(rows.length).toBe(5);
    // Deve essere ordinata per created_at_epoch DESC, poi id DESC
    for (let i = 1; i < rows.length; i++) {
      const prev = rows[i - 1];
      const curr = rows[i];
      const isOrdered =
        prev.created_at_epoch > curr.created_at_epoch ||
        (prev.created_at_epoch === curr.created_at_epoch && prev.id > curr.id);
      expect(isOrdered).toBe(true);
    }
  });

  it('il cursor della prima pagina punta all\'ultimo elemento', () => {
    const rows = db.query(
      'SELECT * FROM observations ORDER BY created_at_epoch DESC, id DESC LIMIT ?'
    ).all(5) as Array<{ id: number; created_at_epoch: number }>;

    const cursor = buildNextCursor(rows, 5);
    expect(cursor).not.toBeNull();

    const decoded = decodeCursor(cursor!);
    expect(decoded!.id).toBe(rows[4].id);
    expect(decoded!.epoch).toBe(rows[4].created_at_epoch);
  });

  it('pagina 2 non contiene elementi della pagina 1', () => {
    // Pagina 1
    const page1 = db.query(
      'SELECT * FROM observations ORDER BY created_at_epoch DESC, id DESC LIMIT ?'
    ).all(5) as Array<{ id: number; created_at_epoch: number }>;

    const cursor = buildNextCursor(page1, 5);
    expect(cursor).not.toBeNull();
    const decoded = decodeCursor(cursor!);

    // Pagina 2 tramite keyset
    const page2 = db.query(
      `SELECT * FROM observations
       WHERE (created_at_epoch < ? OR (created_at_epoch = ? AND id < ?))
       ORDER BY created_at_epoch DESC, id DESC
       LIMIT ?`
    ).all(decoded!.epoch, decoded!.epoch, decoded!.id, 5) as Array<{ id: number }>;

    const page1Ids = new Set(page1.map(r => r.id));
    for (const row of page2) {
      expect(page1Ids.has(row.id)).toBe(false);
    }
  });

  it('la paginazione copre tutti i record senza duplicati', () => {
    const allIds = new Set<number>();
    let cursor: string | null = null;
    const pageSize = 4;

    let iterations = 0;
    while (iterations < 10) { // protezione da loop infinito
      let rows: Array<{ id: number; created_at_epoch: number }>;

      if (cursor) {
        const decoded = decodeCursor(cursor)!;
        rows = db.query(
          `SELECT * FROM observations
           WHERE (created_at_epoch < ? OR (created_at_epoch = ? AND id < ?))
           ORDER BY created_at_epoch DESC, id DESC
           LIMIT ?`
        ).all(decoded.epoch, decoded.epoch, decoded.id, pageSize) as Array<{ id: number; created_at_epoch: number }>;
      } else {
        rows = db.query(
          'SELECT * FROM observations ORDER BY created_at_epoch DESC, id DESC LIMIT ?'
        ).all(pageSize) as Array<{ id: number; created_at_epoch: number }>;
      }

      for (const row of rows) {
        // Nessun duplicato tra le pagine
        expect(allIds.has(row.id)).toBe(false);
        allIds.add(row.id);
      }

      cursor = buildNextCursor(rows, pageSize);
      if (!cursor) break;
      iterations++;
    }

    // Tutti i 15 record devono essere stati visitati
    expect(allIds.size).toBe(15);
  });

  it('filtro per project funziona con keyset', () => {
    // Inserisce osservazioni per un secondo progetto
    seedObservations(db, 5, 'other-project');

    const rows = db.query(
      'SELECT * FROM observations WHERE project = ? ORDER BY created_at_epoch DESC, id DESC LIMIT ?'
    ).all('test-project', 10) as Array<{ id: number; created_at_epoch: number; project: string }>;

    // Tutte le righe devono appartenere a test-project
    for (const row of rows) {
      expect(row.project).toBe('test-project');
    }
  });

  it('cursor invalido viene rifiutato correttamente da decodeCursor', () => {
    expect(decodeCursor('cursor_malformato')).toBeNull();
    expect(decodeCursor('')).toBeNull();
  });
});
