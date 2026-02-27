import { Database } from 'bun:sqlite';
import type { Summary } from '../../types/worker-types.js';

/**
 * Summary operations for Kiro Memory database
 */

/** Escape dei caratteri wildcard LIKE per prevenire pattern injection */
function escapeLikePattern(input: string): string {
  return input.replace(/[%_\\]/g, '\\$&');
}

export function createSummary(
  db: Database,
  sessionId: string,
  project: string,
  request: string | null,
  investigated: string | null,
  learned: string | null,
  completed: string | null,
  nextSteps: string | null,
  notes: string | null
): number {
  const now = new Date();
  const result = db.run(
    `INSERT INTO summaries 
     (session_id, project, request, investigated, learned, completed, next_steps, notes, created_at, created_at_epoch)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [sessionId, project, request, investigated, learned, completed, nextSteps, notes, now.toISOString(), now.getTime()]
  );
  return Number(result.lastInsertRowid);
}

export function getSummaryBySession(db: Database, sessionId: string): Summary | null {
  const query = db.query('SELECT * FROM summaries WHERE session_id = ? ORDER BY created_at_epoch DESC, id DESC LIMIT 1');
  return query.get(sessionId) as Summary | null;
}

export function getSummariesByProject(db: Database, project: string, limit: number = 50): Summary[] {
  const query = db.query(
    'SELECT * FROM summaries WHERE project = ? ORDER BY created_at_epoch DESC, id DESC LIMIT ?'
  );
  return query.all(project, limit) as Summary[];
}

export function searchSummaries(db: Database, searchTerm: string, project?: string): Summary[] {
  const sql = project
    ? `SELECT * FROM summaries
       WHERE project = ? AND (request LIKE ? ESCAPE '\\' OR learned LIKE ? ESCAPE '\\' OR completed LIKE ? ESCAPE '\\' OR notes LIKE ? ESCAPE '\\')
       ORDER BY created_at_epoch DESC, id DESC`
    : `SELECT * FROM summaries
       WHERE request LIKE ? ESCAPE '\\' OR learned LIKE ? ESCAPE '\\' OR completed LIKE ? ESCAPE '\\' OR notes LIKE ? ESCAPE '\\'
       ORDER BY created_at_epoch DESC, id DESC`;

  const pattern = `%${escapeLikePattern(searchTerm)}%`;
  const query = db.query(sql);

  if (project) {
    return query.all(project, pattern, pattern, pattern, pattern) as Summary[];
  }
  return query.all(pattern, pattern, pattern, pattern) as Summary[];
}

export function deleteSummary(db: Database, id: number): void {
  db.run('DELETE FROM summaries WHERE id = ?', [id]);
}
