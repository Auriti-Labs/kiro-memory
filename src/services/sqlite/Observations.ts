import { Database } from 'bun:sqlite';
import type { Observation } from '../../types/worker-types.js';

/**
 * Observation operations for Kiro Memory database
 */

/** Escape dei caratteri wildcard LIKE per prevenire pattern injection */
function escapeLikePattern(input: string): string {
  return input.replace(/[%_\\]/g, '\\$&');
}

export function createObservation(
  db: Database,
  memorySessionId: string,
  project: string,
  type: string,
  title: string,
  subtitle: string | null,
  text: string | null,
  narrative: string | null,
  facts: string | null,
  concepts: string | null,
  filesRead: string | null,
  filesModified: string | null,
  promptNumber: number
): number {
  const now = new Date();
  const result = db.run(
    `INSERT INTO observations 
     (memory_session_id, project, type, title, subtitle, text, narrative, facts, concepts, files_read, files_modified, prompt_number, created_at, created_at_epoch)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [memorySessionId, project, type, title, subtitle, text, narrative, facts, concepts, filesRead, filesModified, promptNumber, now.toISOString(), now.getTime()]
  );
  return Number(result.lastInsertRowid);
}

export function getObservationsBySession(db: Database, memorySessionId: string): Observation[] {
  const query = db.query(
    'SELECT * FROM observations WHERE memory_session_id = ? ORDER BY prompt_number ASC'
  );
  return query.all(memorySessionId) as Observation[];
}

export function getObservationsByProject(db: Database, project: string, limit: number = 100): Observation[] {
  const query = db.query(
    'SELECT * FROM observations WHERE project = ? ORDER BY created_at_epoch DESC LIMIT ?'
  );
  return query.all(project, limit) as Observation[];
}

export function searchObservations(db: Database, searchTerm: string, project?: string): Observation[] {
  const sql = project
    ? `SELECT * FROM observations
       WHERE project = ? AND (title LIKE ? ESCAPE '\\' OR text LIKE ? ESCAPE '\\' OR narrative LIKE ? ESCAPE '\\')
       ORDER BY created_at_epoch DESC`
    : `SELECT * FROM observations
       WHERE title LIKE ? ESCAPE '\\' OR text LIKE ? ESCAPE '\\' OR narrative LIKE ? ESCAPE '\\'
       ORDER BY created_at_epoch DESC`;

  const pattern = `%${escapeLikePattern(searchTerm)}%`;
  const query = db.query(sql);

  if (project) {
    return query.all(project, pattern, pattern, pattern) as Observation[];
  }
  return query.all(pattern, pattern, pattern) as Observation[];
}

export function deleteObservation(db: Database, id: number): void {
  db.run('DELETE FROM observations WHERE id = ?', [id]);
}
