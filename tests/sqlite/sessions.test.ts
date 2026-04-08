/**
 * Test suite for Sessions module
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { TotalRecallDatabase } from '../../src/services/sqlite/Database.js';
import {
  createSession,
  getSessionByContentId,
  getSessionById,
  updateSessionMemoryId,
  updateSessionUserPrompt,
  completeSession,
  failSession,
  getActiveSessions,
  getSessionsByProject
} from '../../src/services/sqlite/Sessions.js';
import {
  createConversationMessage,
  getConversationMessagesBySession,
  getConversationMessageCountBySession
} from '../../src/services/sqlite/ConversationMessages.js';
import type { Database } from 'bun:sqlite';

describe('Sessions Module', () => {
  let db: Database;

  beforeEach(() => {
    db = new TotalRecallDatabase(':memory:').db;
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

  describe('updateSessionUserPrompt', () => {
    it('should update the initial user prompt for a session', () => {
      createSession(db, 'session-prompt', 'project', '');
      updateSessionUserPrompt(db, 'session-prompt', 'Prompt iniziale');

      const session = getSessionByContentId(db, 'session-prompt');
      expect(session!.user_prompt).toBe('Prompt iniziale');
    });
  });

  describe('conversation messages', () => {
    it('should store and retrieve ordered session messages', () => {
      createSession(db, 'session-msg', 'project', 'prompt');
      createConversationMessage(db, 'session-msg', 'project', 'user', 0, 'ciao');
      createConversationMessage(db, 'session-msg', 'project', 'assistant', 1, 'risposta');

      const messages = getConversationMessagesBySession(db, 'session-msg');
      expect(messages).toHaveLength(2);
      expect(messages[0].role).toBe('user');
      expect(messages[0].content).toBe('ciao');
      expect(messages[1].role).toBe('assistant');
      expect(messages[1].content).toBe('risposta');
      expect(getConversationMessageCountBySession(db, 'session-msg')).toBe(2);
    });

    it('should ignore duplicate message_index for the same session', () => {
      createConversationMessage(db, 'session-dedupe', 'project', 'user', 0, 'uno');
      createConversationMessage(db, 'session-dedupe', 'project', 'assistant', 0, 'due');

      const messages = getConversationMessagesBySession(db, 'session-dedupe');
      expect(messages).toHaveLength(1);
      expect(messages[0].content).toBe('uno');
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

  describe('getSessionsByProject', () => {
    it('should return sessions scoped to the requested project', () => {
      createSession(db, 'proj-a-1', 'project-a', 'a1');
      createSession(db, 'proj-b-1', 'project-b', 'b1');
      createSession(db, 'proj-a-2', 'project-a', 'a2');

      const rows = getSessionsByProject(db, 'project-a');
      expect(rows).toHaveLength(2);
      expect(rows.every(row => row.project === 'project-a')).toBe(true);
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
