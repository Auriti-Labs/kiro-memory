import { Database } from 'bun:sqlite';
import type { DBCheckpoint } from '../../types/worker-types.js';

/**
 * Checkpoint operations per Kiro Memory database.
 * I checkpoint salvano uno snapshot strutturato della sessione per resume futuro.
 */

export function createCheckpoint(
  db: Database,
  sessionId: number,
  project: string,
  data: {
    task: string;
    progress?: string;
    nextSteps?: string;
    openQuestions?: string;
    relevantFiles?: string;
    contextSnapshot?: string;
  }
): number {
  const now = new Date();
  const result = db.run(
    `INSERT INTO checkpoints (session_id, project, task, progress, next_steps, open_questions, relevant_files, context_snapshot, created_at, created_at_epoch)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      sessionId,
      project,
      data.task,
      data.progress || null,
      data.nextSteps || null,
      data.openQuestions || null,
      data.relevantFiles || null,
      data.contextSnapshot || null,
      now.toISOString(),
      now.getTime()
    ]
  );
  return Number(result.lastInsertRowid);
}

export function getLatestCheckpoint(db: Database, sessionId: number): DBCheckpoint | null {
  const query = db.query(
    'SELECT * FROM checkpoints WHERE session_id = ? ORDER BY created_at_epoch DESC, id DESC LIMIT 1'
  );
  return query.get(sessionId) as DBCheckpoint | null;
}

export function getLatestCheckpointByProject(db: Database, project: string): DBCheckpoint | null {
  const query = db.query(
    'SELECT * FROM checkpoints WHERE project = ? ORDER BY created_at_epoch DESC, id DESC LIMIT 1'
  );
  return query.get(project) as DBCheckpoint | null;
}

export function getCheckpointsBySession(db: Database, sessionId: number): DBCheckpoint[] {
  const query = db.query(
    'SELECT * FROM checkpoints WHERE session_id = ? ORDER BY created_at_epoch DESC, id DESC'
  );
  return query.all(sessionId) as DBCheckpoint[];
}
