/**
 * Test suite for Observations module
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { KiroMemoryDatabase } from '../../src/services/sqlite/Database.js';
import {
  createObservation,
  getObservationsBySession,
  getObservationsByProject,
  searchObservations,
  deleteObservation
} from '../../src/services/sqlite/Observations.js';
import type { Database } from 'bun:sqlite';

describe('Observations Module', () => {
  let db: Database;

  beforeEach(() => {
    db = new KiroMemoryDatabase(':memory:').db;
  });

  afterEach(() => {
    db.close();
  });

  describe('createObservation', () => {
    it('should create observation with all fields', () => {
      const id = createObservation(
        db,
        'memory-session-1',
        'test-project',
        'bug-fix',
        'Fixed login bug',
        'Authentication fix',
        'Fixed the OAuth issue',
        null,
        null,
        'OAuth, authentication',
        'src/auth.ts',
        null,
        1
      );

      expect(typeof id).toBe('number');
      expect(id).toBeGreaterThan(0);
    });
  });

  describe('getObservationsBySession', () => {
    it('should return observations for session', () => {
      const memorySessionId = 'memory-session-2';
      
      createObservation(db, memorySessionId, 'project', 'type', 'title', null, 'content', null, null, null, null, null, 1);
      createObservation(db, memorySessionId, 'project', 'type', 'title2', null, 'content2', null, null, null, null, null, 2);
      
      const observations = getObservationsBySession(db, memorySessionId);
      expect(observations.length).toBe(2);
    });
  });

  describe('searchObservations', () => {
    it('should find observations by search term', () => {
      createObservation(db, 'session', 'project', 'type', 'Login Fix', null, 'Fixed authentication', null, null, null, null, null, 1);
      createObservation(db, 'session', 'project', 'type', 'Other', null, 'Something else', null, null, null, null, null, 2);
      
      const results = searchObservations(db, 'authentication');
      expect(results.length).toBe(1);
      expect(results[0].title).toBe('Login Fix');
    });
  });
});
