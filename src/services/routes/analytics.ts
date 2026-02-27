/**
 * Router Analytics: overview, timeline, type distribution, sessions, anomalies.
 */

import { Router } from 'express';
import type { WorkerContext } from '../worker-context.js';
import { isValidProject, parseIntSafe } from '../worker-context.js';
import { getObservationsTimeline, getTypeDistribution, getSessionStats, getAnalyticsOverview } from '../sqlite/Analytics.js';
import { AnomalyDetector } from '../analytics/AnomalyDetector.js';
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
      logger.error('WORKER', 'Analytics overview failed', { project }, error as Error);
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
      logger.error('WORKER', 'Analytics timeline failed', { project }, error as Error);
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
      logger.error('WORKER', 'Analytics types failed', { project }, error as Error);
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
      logger.error('WORKER', 'Analytics sessions failed', { project }, error as Error);
      res.status(500).json({ error: 'Analytics sessions failed' });
    }
  });

  // Session anomaly detection using z-score analysis
  router.get('/api/analytics/anomalies', (req, res) => {
    const { project, window: windowParam, threshold: thresholdParam } = req.query as {
      project?: string;
      window?: string;
      threshold?: string;
    };

    if (!project) {
      res.status(400).json({ error: 'project parameter is required' });
      return;
    }
    if (!isValidProject(project)) {
      res.status(400).json({ error: 'Invalid project name' });
      return;
    }

    const windowSize = parseIntSafe(windowParam, 20, 3, 200);
    const threshold = thresholdParam !== undefined
      ? parseFloat(thresholdParam)
      : 2.0;

    if (isNaN(threshold) || threshold <= 0 || threshold > 10) {
      res.status(400).json({ error: 'threshold must be a number between 0 and 10' });
      return;
    }

    try {
      const detector = new AnomalyDetector(ctx.db.db, windowSize, threshold);
      const anomalies = detector.detectAnomalies(project);
      const baseline = detector.getBaseline(project);
      res.json({ anomalies, baseline, project });
    } catch (error) {
      logger.error('WORKER', 'Anomaly detection failed', { project }, error as Error);
      res.status(500).json({ error: 'Anomaly detection failed' });
    }
  });

  return router;
}
