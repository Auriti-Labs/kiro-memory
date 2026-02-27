/**
 * Test suite for Sessions module
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { KiroMemoryDatabase } from '../../src/services/sqlite/Database.js';
import {
  createSession,
  getSessionByContentId,
  getSessionById,
  updateSessionMemoryId,
  completeSession,
  failSession,
  getActiveSessions,
  getSessionsByProject
} from '../../src/services/sqlite/Sessions.js';
import type { Database } from 'bun:sqlite';

describe('Sessions Module', () => {
  let db: Database;

  beforeEach(() => {
    db = new KiroMemoryDatabase(':memory:').db;
  });

  afterEach(() => {
    db.close();
  });

  describe('createSession', () => {
    it('should create a new session and return numeric ID', () => {
      const contentSessionId = 'session-123';
      const project = 'test-project';
      const userPrompt = 'Test prompt';

      const sessionId = createSession(db, contentSessionId, project, userPrompt);

      expect(typeof sessionId).toBe('number');
      expect(sessionId).toBeGreaterThan(0);
    });

    it('should store session with correct values', () => {
      const contentSessionId = 'session-456';
      const project = 'my-project';
      const userPrompt = 'Build a feature';

      createSession(db, contentSessionId, project, userPrompt);
      const session = getSessionByContentId(db, contentSessionId);

      expect(session).not.toBeNull();
      expect(session!.content_session_id).toBe(contentSessionId);
      expect(session!.project).toBe(project);
      expect(session!.user_prompt).toBe(userPrompt);
      expect(session!.status).toBe('active');
    });
  });

  describe('updateSessionMemoryId', () => {
    it('should update memory session ID', () => {
      const contentSessionId = 'session-789';
      const memorySessionId = 'memory-abc';
      
      const id = createSession(db, contentSessionId, 'project', 'prompt');
      updateSessionMemoryId(db, id, memorySessionId);
      
      const session = getSessionById(db, id);
      expect(session!.memory_session_id).toBe(memorySessionId);
    });
  });

  describe('completeSession', () => {
    it('should mark session as completed', () => {
      const id = createSession(db, 'session-001', 'project', 'prompt');
      completeSession(db, id);
      
      const session = getSessionById(db, id);
      expect(session!.status).toBe('completed');
      expect(session!.completed_at).not.toBeNull();
    });
  });

  describe('failSession', () => {
    it('should mark session as failed', () => {
      const id = createSession(db, 'session-002', 'project', 'prompt');
      failSession(db, id);
      
      const session = getSessionById(db, id);
      expect(session!.status).toBe('failed');
      expect(session!.completed_at).not.toBeNull();
    });
  });

  describe('getActiveSessions', () => {
    it('should return only active sessions', () => {
      createSession(db, 'active-1', 'project', 'prompt');
      createSession(db, 'active-2', 'project', 'prompt');
      const id = createSession(db, 'completed', 'project', 'prompt');
      completeSession(db, id);
      
      const active = getActiveSessions(db);
      expect(active.length).toBe(2);
    });
  });
});
