import { Database } from 'bun:sqlite';
import type { DBSession } from '../../types/worker-types.js';

/**
 * Session operations for Kiro Memory database
 */

export function createSession(
  db: Database,
  contentSessionId: string,
  project: string,
  userPrompt: string
): number {
  const now = new Date();
  const result = db.run(
    `INSERT INTO sessions (content_session_id, project, user_prompt, status, started_at, started_at_epoch)
     VALUES (?, ?, ?, 'active', ?, ?)`,
    [contentSessionId, project, userPrompt, now.toISOString(), now.getTime()]
  );
  return Number(result.lastInsertRowid);
}

export function getSessionByContentId(db: Database, contentSessionId: string): DBSession | null {
  const query = db.query('SELECT * FROM sessions WHERE content_session_id = ?');
  return query.get(contentSessionId) as DBSession | null;
}

export function getSessionById(db: Database, id: number): DBSession | null {
  const query = db.query('SELECT * FROM sessions WHERE id = ?');
  return query.get(id) as DBSession | null;
}

export function updateSessionMemoryId(
  db: Database,
  id: number,
  memorySessionId: string
): void {
  db.run(
    'UPDATE sessions SET memory_session_id = ? WHERE id = ?',
    [memorySessionId, id]
  );
}

export function completeSession(db: Database, id: number): void {
  const now = new Date();
  db.run(
    `UPDATE sessions 
     SET status = 'completed', completed_at = ?, completed_at_epoch = ?
     WHERE id = ?`,
    [now.toISOString(), now.getTime(), id]
  );
}

export function failSession(db: Database, id: number): void {
  const now = new Date();
  db.run(
    `UPDATE sessions 
     SET status = 'failed', completed_at = ?, completed_at_epoch = ?
     WHERE id = ?`,
    [now.toISOString(), now.getTime(), id]
  );
}

export function getActiveSessions(db: Database): DBSession[] {
  const query = db.query('SELECT * FROM sessions WHERE status = \'active\' ORDER BY started_at_epoch DESC');
  return query.all() as DBSession[];
}

export function getAllSessions(db: Database, limit: number = 100): DBSession[] {
  const query = db.query('SELECT * FROM sessions ORDER BY started_at_epoch DESC LIMIT ?');
  return query.all(limit) as DBSession[];
}

export function getSessionsByProject(db: Database, project: string, limit: number = 100): DBSession[] {
  const query = db.query('SELECT * FROM sessions WHERE project = ? ORDER BY started_at_epoch DESC LIMIT ?');
  return query.all(project, limit) as DBSession[];
}
