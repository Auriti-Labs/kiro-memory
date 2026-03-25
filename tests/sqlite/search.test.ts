/**
 * Test suite per il modulo Search (FTS5, LIKE fallback, timeline, stats)
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { TotalRecallDatabase } from '../../src/services/sqlite/Database.js';
import { createObservation } from '../../src/services/sqlite/Observations.js';
import { createSummary } from '../../src/services/sqlite/Summaries.js';
import {
  searchObservationsFTS,
  searchObservationsLIKE,
  searchSummariesFiltered,
  getObservationsByIds,
  getTimeline,
  getProjectStats
} from '../../src/services/sqlite/Search.js';
import type { Database } from 'bun:sqlite';

describe('Search Module', () => {
  let dbInstance: TotalRecallDatabase;
  let db: Database;

  beforeEach(() => {
    dbInstance = new TotalRecallDatabase(':memory:');
    db = dbInstance.db;

    // Seed dati di test
    createObservation(db, 'ses-1', 'project-a', 'bug-fix', 'Fix login OAuth', null, 'Risolto problema autenticazione OAuth2', null, null, 'oauth, login', null, null, 1);
    createObservation(db, 'ses-1', 'project-a', 'feature', 'Aggiunta dashboard', null, 'Nuova pagina dashboard con grafici', null, null, 'react, charts', null, null, 2);
    createObservation(db, 'ses-1', 'project-b', 'research', 'Studio performance DB', null, 'Analisi query lente su PostgreSQL', null, null, 'database, perf', null, null, 1);

    createSummary(db, 'ses-1', 'project-a', 'Implementare auth', null, 'OAuth2 funziona', 'Login completato', 'Aggiungere refresh token', null);
  });

  afterEach(() => {
    dbInstance.close();
  });

  describe('searchObservationsFTS', () => {
    it('dovrebbe trovare osservazioni tramite FTS5', () => {
      const results = searchObservationsFTS(db, 'OAuth');
      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results[0].title).toContain('OAuth');
    });

    it('dovrebbe filtrare per progetto', () => {
      const results = searchObservationsFTS(db, 'dashboard', { project: 'project-a' });
      expect(results.length).toBe(1);
      expect(results[0].project).toBe('project-a');
    });

    it('dovrebbe filtrare per tipo', () => {
      const results = searchObservationsFTS(db, 'dashboard', { type: 'feature' });
      expect(results.length).toBe(1);
    });

    it('dovrebbe rispettare il limite', () => {
      const results = searchObservationsFTS(db, 'OAuth', { limit: 1 });
      expect(results.length).toBeLessThanOrEqual(1);
    });

    it('dovrebbe tornare vuoto per query senza risultati', () => {
      const results = searchObservationsFTS(db, 'inesistente_xyz_123');
      expect(results.length).toBe(0);
    });
  });

  describe('searchObservationsLIKE', () => {
    it('dovrebbe trovare con pattern LIKE', () => {
      const results = searchObservationsLIKE(db, 'PostgreSQL');
      expect(results.length).toBe(1);
      expect(results[0].title).toContain('performance');
    });

    it('dovrebbe filtrare per progetto', () => {
      const results = searchObservationsLIKE(db, 'PostgreSQL', { project: 'project-a' });
      expect(results.length).toBe(0);
    });
  });

  describe('searchSummariesFiltered', () => {
    it('dovrebbe trovare sommari per keyword', () => {
      const results = searchSummariesFiltered(db, 'OAuth2');
      expect(results.length).toBe(1);
    });

    it('dovrebbe filtrare per progetto', () => {
      const results = searchSummariesFiltered(db, 'OAuth2', { project: 'project-b' });
      expect(results.length).toBe(0);
    });
  });

  describe('getObservationsByIds', () => {
    it('dovrebbe recuperare osservazioni per ID', () => {
      const results = getObservationsByIds(db, [1, 2]);
      expect(results.length).toBe(2);
    });

    it('dovrebbe tornare vuoto per array vuoto', () => {
      const results = getObservationsByIds(db, []);
      expect(results.length).toBe(0);
    });

    it('dovrebbe ignorare ID inesistenti', () => {
      const results = getObservationsByIds(db, [999, 1000]);
      expect(results.length).toBe(0);
    });
  });

  describe('getTimeline', () => {
    it('dovrebbe restituire timeline attorno a un\'osservazione', () => {
      const timeline = getTimeline(db, 2, 1, 1);
      // Deve contenere almeno l'ancora (id=2)
      expect(timeline.length).toBeGreaterThanOrEqual(1);
      const anchorEntry = timeline.find(e => e.id === 2);
      expect(anchorEntry).toBeDefined();
    });

    it('dovrebbe tornare vuoto per ID inesistente', () => {
      const timeline = getTimeline(db, 999);
      expect(timeline.length).toBe(0);
    });
  });

  describe('getProjectStats', () => {
    it('dovrebbe calcolare statistiche corrette', () => {
      const stats = getProjectStats(db, 'project-a');
      expect(stats.observations).toBe(2);
      expect(stats.summaries).toBe(1);
      expect(stats.sessions).toBe(0);
      expect(stats.prompts).toBe(0);
    });

    it('dovrebbe tornare zero per progetto vuoto', () => {
      const stats = getProjectStats(db, 'progetto-fantasma');
      expect(stats.observations).toBe(0);
      expect(stats.summaries).toBe(0);
    });
  });
});
