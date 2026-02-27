/**
 * Router Analytics: overview, timeline, distribuzione tipi, sessioni.
 */

import { Router } from 'express';
import type { WorkerContext } from '../worker-context.js';
import { isValidProject, parseIntSafe } from '../worker-context.js';
import { getObservationsTimeline, getTypeDistribution, getSessionStats, getAnalyticsOverview } from '../sqlite/Analytics.js';
import { logger } from '../../utils/logger.js';

export function createAnalyticsRouter(ctx: WorkerContext): Router {
  const router = Router();

  router.get('/api/analytics/overview', (req, res) => {
    const { project } = req.query as { project?: string };

    if (project && !isValidProject(project)) {
      res.status(400).json({ error: 'Invalid project name' });
      return;
    }

    try {
      const overview = getAnalyticsOverview(ctx.db.db, project || undefined);
      res.json(overview);
    } catch (error) {
      logger.error('WORKER', 'Analytics overview fallita', { project }, error as Error);
      res.status(500).json({ error: 'Analytics overview failed' });
    }
  });

  router.get('/api/analytics/timeline', (req, res) => {
    const { project, days } = req.query as { project?: string; days?: string };

    if (project && !isValidProject(project)) {
      res.status(400).json({ error: 'Invalid project name' });
      return;
    }

    try {
      const timeline = getObservationsTimeline(
        ctx.db.db,
        project || undefined,
        parseIntSafe(days, 30, 1, 365)
      );
      res.json(timeline);
    } catch (error) {
      logger.error('WORKER', 'Analytics timeline fallita', { project }, error as Error);
      res.status(500).json({ error: 'Analytics timeline failed' });
    }
  });

  router.get('/api/analytics/types', (req, res) => {
    const { project } = req.query as { project?: string };

    if (project && !isValidProject(project)) {
      res.status(400).json({ error: 'Invalid project name' });
      return;
    }

    try {
      const distribution = getTypeDistribution(ctx.db.db, project || undefined);
      res.json(distribution);
    } catch (error) {
      logger.error('WORKER', 'Analytics types fallita', { project }, error as Error);
      res.status(500).json({ error: 'Analytics types failed' });
    }
  });

  router.get('/api/analytics/sessions', (req, res) => {
    const { project } = req.query as { project?: string };

    if (project && !isValidProject(project)) {
      res.status(400).json({ error: 'Invalid project name' });
      return;
    }

    try {
      const stats = getSessionStats(ctx.db.db, project || undefined);
      res.json(stats);
    } catch (error) {
      logger.error('WORKER', 'Analytics sessions fallita', { project }, error as Error);
      res.status(500).json({ error: 'Analytics sessions failed' });
    }
  });

  return router;
}
