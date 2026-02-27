/**
 * Router Summaries: CRUD summary di sessione.
 */

import { Router } from 'express';
import type { WorkerContext } from '../worker-context.js';
import { isValidProject, isValidString, parseIntSafe } from '../worker-context.js';
import { createSummary } from '../sqlite/Summaries.js';
import { logger } from '../../utils/logger.js';

export function createSummariesRouter(ctx: WorkerContext): Router {
  const router = Router();

  // Lista summary paginata
  router.get('/api/summaries', (req, res) => {
    const { offset, limit, project } = req.query as { offset?: string; limit?: string; project?: string };
    const _offset = parseIntSafe(offset, 0, 0, 1_000_000);
    const _limit = parseIntSafe(limit, 20, 1, 200);

    try {
      const countSql = project
        ? 'SELECT COUNT(*) as total FROM summaries WHERE project = ?'
        : 'SELECT COUNT(*) as total FROM summaries';
      const countStmt = ctx.db.db.query(countSql);
      const { total } = (project ? countStmt.get(project) : countStmt.get()) as { total: number };

      const sql = project
        ? 'SELECT * FROM summaries WHERE project = ? ORDER BY created_at_epoch DESC LIMIT ? OFFSET ?'
        : 'SELECT * FROM summaries ORDER BY created_at_epoch DESC LIMIT ? OFFSET ?';
      const stmt = ctx.db.db.query(sql);
      const rows = project ? stmt.all(project, _limit, _offset) : stmt.all(_limit, _offset);
      res.setHeader('X-Total-Count', total);
      res.json(rows);
    } catch (error) {
      logger.error('WORKER', 'Lista summary fallita', {}, error as Error);
      res.status(500).json({ error: 'Failed to list summaries' });
    }
  });

  // Crea summary
  router.post('/api/summaries', (req, res) => {
    const { sessionId, project, request, learned, completed, nextSteps } = req.body;

    if (!isValidProject(project)) {
      res.status(400).json({ error: 'Invalid or missing "project"' });
      return;
    }
    const MAX_FIELD = 50_000;
    if (request && !isValidString(request, MAX_FIELD)) { res.status(400).json({ error: '"request" too large' }); return; }
    if (learned && !isValidString(learned, MAX_FIELD)) { res.status(400).json({ error: '"learned" too large' }); return; }
    if (completed && !isValidString(completed, MAX_FIELD)) { res.status(400).json({ error: '"completed" too large' }); return; }
    if (nextSteps && !isValidString(nextSteps, MAX_FIELD)) { res.status(400).json({ error: '"nextSteps" too large' }); return; }

    try {
      const id = createSummary(
        ctx.db.db,
        sessionId || 'api-' + Date.now(),
        project,
        request || null,
        null,
        learned || null,
        completed || null,
        nextSteps || null,
        null
      );

      ctx.broadcast('summary-created', { id, project });
      res.json({ id, success: true });
    } catch (error) {
      logger.error('WORKER', 'Creazione summary fallita', {}, error as Error);
      res.status(500).json({ error: 'Failed to store summary' });
    }
  });

  return router;
}
