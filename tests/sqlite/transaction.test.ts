/**
 * Test suite per il wrapper transazionale withTransaction
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { TotalRecallDatabase } from '../../src/services/sqlite/Database.js';
import { createObservation } from '../../src/services/sqlite/Observations.js';

describe('withTransaction', () => {
  let dbInstance: TotalRecallDatabase;

  beforeEach(() => {
    dbInstance = new TotalRecallDatabase(':memory:');
  });

  afterEach(() => {
    dbInstance.close();
  });

  it('dovrebbe committare automaticamente una transazione riuscita', () => {
    dbInstance.withTransaction((db) => {
      createObservation(db, 'ses-tx', 'project', 'type', 'Title A', null, 'Content A', null, null, null, null, null, 1);
      createObservation(db, 'ses-tx', 'project', 'type', 'Title B', null, 'Content B', null, null, null, null, null, 2);
    });

    // Entrambe le osservazioni devono esistere
    const count = (dbInstance.db.query('SELECT COUNT(*) as c FROM observations').get() as any).c;
    expect(count).toBe(2);
  });

  it('dovrebbe fare rollback se la funzione lancia un errore', () => {
    try {
      dbInstance.withTransaction((db) => {
        createObservation(db, 'ses-rollback', 'project', 'type', 'Sarà annullata', null, 'Content', null, null, null, null, null, 1);
        throw new Error('Errore simulato');
      });
    } catch (e: any) {
      expect(e.message).toBe('Errore simulato');
    }

    // Nessuna osservazione deve esistere dopo il rollback
    const count = (dbInstance.db.query('SELECT COUNT(*) as c FROM observations').get() as any).c;
    expect(count).toBe(0);
  });

  it('dovrebbe restituire il valore della funzione', () => {
    const result = dbInstance.withTransaction((db) => {
      createObservation(db, 'ses-ret', 'project', 'type', 'Title', null, 'Content', null, null, null, null, null, 1);
      return 42;
    });

    expect(result).toBe(42);
  });
});
