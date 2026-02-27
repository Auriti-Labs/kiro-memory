/**
 * Router Analytics: overview, timeline, type distribution, sessions, anomalies.
 */

import { Router } from 'express';
import type { WorkerContext } from '../worker-context.js';
import { isValidProject, parseIntSafe } from '../worker-context.js';
import { getObservationsTimeline, getTypeDistribution, getSessionStats, getAnalyticsOverview, getHeatmapData } from '../sqlite/Analytics.js';
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

  // Dati giornalieri per la heatmap della timeline interattiva
  router.get('/api/analytics/heatmap', (req, res) => {
    const { project, months } = req.query as { project?: string; months?: string };

    if (project && !isValidProject(project)) {
      res.status(400).json({ error: 'Invalid project name' });
      return;
    }

    try {
      const days = getHeatmapData(
        ctx.db.db,
        project || undefined,
        parseIntSafe(months, 6, 1, 24)
      );
      res.json({ days });
    } catch (error) {
      logger.error('WORKER', 'Heatmap data failed', { project }, error as Error);
      res.status(500).json({ error: 'Heatmap data fetch failed' });
    }
  });

  // Concepts più frequenti estratti dal campo observations.concepts (issue #24)
  router.get('/api/concepts', (req, res) => {
    const { project, limit } = req.query as { project?: string; limit?: string };

    if (project && !isValidProject(project)) {
      res.status(400).json({ error: 'Invalid project name' });
      return;
    }

    const _limit = parseIntSafe(limit, 50, 1, 200);

    try {
      // Il campo concepts è una stringa CSV — estrae token, conta occorrenze, ritorna top N
      const sql = project
        ? `SELECT concepts FROM observations WHERE project = ? AND concepts IS NOT NULL AND concepts != ''`
        : `SELECT concepts FROM observations WHERE concepts IS NOT NULL AND concepts != ''`;

      const stmt = ctx.db.db.query(sql);
      const rows = project
        ? stmt.all(project) as Array<{ concepts: string }>
        : stmt.all() as Array<{ concepts: string }>;

      // Conta le occorrenze di ogni singolo concept
      const counts = new Map<string, number>();
      for (const row of rows) {
        const tokens = row.concepts.split(',').map((t: string) => t.trim()).filter(Boolean);
        for (const token of tokens) {
          counts.set(token, (counts.get(token) ?? 0) + 1);
        }
      }

      // Ordina per frequenza decrescente, ritorna i top N
      const result = Array.from(counts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, _limit)
        .map(([concept, count]) => ({ concept, count }));

      res.json(result);
    } catch (error) {
      logger.error('WORKER', 'Concepts fetch failed', { project }, error as Error);
      res.status(500).json({ error: 'Concepts fetch failed' });
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
