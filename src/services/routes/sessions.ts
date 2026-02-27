/**
 * Router Sessions: lista sessioni, checkpoint, prompts.
 */

import { Router } from 'express';
import type { WorkerContext } from '../worker-context.js';
import { isValidProject, parseIntSafe } from '../worker-context.js';
import { getSessionsByProject, getAllSessions } from '../sqlite/Sessions.js';
import { getLatestCheckpoint, getLatestCheckpointByProject } from '../sqlite/Checkpoints.js';
import { logger } from '../../utils/logger.js';

export function createSessionsRouter(ctx: WorkerContext): Router {
  const router = Router();

  // Lista sessioni
  router.get('/api/sessions', (req, res) => {
    const { project } = req.query as { project?: string };

    if (project && !isValidProject(project)) {
      res.status(400).json({ error: 'Invalid project name' });
      return;
    }

    try {
      const sessions = project
        ? getSessionsByProject(ctx.db.db, project, 50)
        : getAllSessions(ctx.db.db, 50);
      res.json(sessions);
    } catch (error) {
      logger.error('WORKER', 'Lista sessioni fallita', { project }, error as Error);
      res.status(500).json({ error: 'Sessions list failed' });
    }
  });

  // Checkpoint per sessione
  router.get('/api/sessions/:id/checkpoint', (req, res) => {
    const sessionId = parseInt(req.params.id, 10);

    if (isNaN(sessionId) || sessionId <= 0) {
      res.status(400).json({ error: 'Invalid session ID' });
      return;
    }

    try {
      const checkpoint = getLatestCheckpoint(ctx.db.db, sessionId);
      if (!checkpoint) {
        res.status(404).json({ error: 'No checkpoint found for this session' });
        return;
      }
      res.json(checkpoint);
    } catch (error) {
      logger.error('WORKER', 'Checkpoint fetch fallito', { sessionId }, error as Error);
      res.status(500).json({ error: 'Checkpoint fetch failed' });
    }
  });

  // Checkpoint per progetto
  router.get('/api/checkpoint', (req, res) => {
    const { project } = req.query as { project?: string };

    if (!project) {
      res.status(400).json({ error: 'Project parameter is required' });
      return;
    }
    if (!isValidProject(project)) {
      res.status(400).json({ error: 'Invalid project name' });
      return;
    }

    try {
      const checkpoint = getLatestCheckpointByProject(ctx.db.db, project);
      if (!checkpoint) {
        res.status(404).json({ error: 'No checkpoint found for this project' });
        return;
      }
      res.json(checkpoint);
    } catch (error) {
      logger.error('WORKER', 'Checkpoint per progetto fallito', { project }, error as Error);
      res.status(500).json({ error: 'Project checkpoint fetch failed' });
    }
  });

  // Lista prompt paginata
  router.get('/api/prompts', (req, res) => {
    const { offset, limit, project } = req.query as { offset?: string; limit?: string; project?: string };
    const _offset = parseIntSafe(offset, 0, 0, 1_000_000);
    const _limit = parseIntSafe(limit, 20, 1, 200);

    try {
      const countSql = project
        ? 'SELECT COUNT(*) as total FROM prompts WHERE project = ?'
        : 'SELECT COUNT(*) as total FROM prompts';
      const countStmt = ctx.db.db.query(countSql);
      const { total } = (project ? countStmt.get(project) : countStmt.get()) as { total: number };

      const sql = project
        ? 'SELECT * FROM prompts WHERE project = ? ORDER BY created_at_epoch DESC LIMIT ? OFFSET ?'
        : 'SELECT * FROM prompts ORDER BY created_at_epoch DESC LIMIT ? OFFSET ?';
      const stmt = ctx.db.db.query(sql);
      const rows = project ? stmt.all(project, _limit, _offset) : stmt.all(_limit, _offset);
      res.setHeader('X-Total-Count', total);
      res.json(rows);
    } catch (error) {
      logger.error('WORKER', 'Lista prompt fallita', {}, error as Error);
      res.status(500).json({ error: 'Failed to list prompts' });
    }
  });

  return router;
}
