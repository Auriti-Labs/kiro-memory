import { Database } from 'bun:sqlite';
import type { UserPrompt } from '../../types/worker-types.js';

/**
 * Prompt operations for Kiro Memory database
 */

export function createPrompt(
  db: Database,
  contentSessionId: string,
  project: string,
  promptNumber: number,
  promptText: string
): number {
  const now = new Date();
  const result = db.run(
    `INSERT INTO prompts 
     (content_session_id, project, prompt_number, prompt_text, created_at, created_at_epoch)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [contentSessionId, project, promptNumber, promptText, now.toISOString(), now.getTime()]
  );
  return Number(result.lastInsertRowid);
}

export function getPromptsBySession(db: Database, contentSessionId: string): UserPrompt[] {
  const query = db.query(
    'SELECT * FROM prompts WHERE content_session_id = ? ORDER BY prompt_number ASC'
  );
  return query.all(contentSessionId) as UserPrompt[];
}

export function getPromptsByProject(db: Database, project: string, limit: number = 100): UserPrompt[] {
  const query = db.query(
    'SELECT * FROM prompts WHERE project = ? ORDER BY created_at_epoch DESC LIMIT ?'
  );
  return query.all(project, limit) as UserPrompt[];
}

export function getLatestPrompt(db: Database, contentSessionId: string): UserPrompt | null {
  const query = db.query(
    'SELECT * FROM prompts WHERE content_session_id = ? ORDER BY prompt_number DESC LIMIT 1'
  );
  return query.get(contentSessionId) as UserPrompt | null;
}

export function deletePrompt(db: Database, id: number): void {
  db.run('DELETE FROM prompts WHERE id = ?', [id]);
}
