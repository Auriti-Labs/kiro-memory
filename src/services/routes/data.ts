/**
 * Router Data: embeddings, retention, export, report.
 * Handles heavy data operations and maintenance.
 */

import { Router } from 'express';
import type { WorkerContext } from '../worker-context.js';
import { isValidProject, parseIntSafe } from '../worker-context.js';
import { getEmbeddingService } from '../search/EmbeddingService.js';
import { getVectorSearch } from '../search/VectorSearch.js';
import { getReportData } from '../sqlite/Reports.js';
import { formatReportMarkdown } from '../report-formatter.js';
import { logger } from '../../utils/logger.js';

export function createDataRouter(ctx: WorkerContext, workerToken?: string): Router {
  const router = Router();

  /** Middleware: requires X-Worker-Token for destructive endpoints */
  function requireAuth(req: import('express').Request, res: import('express').Response, next: import('express').NextFunction): void {
    if (!workerToken) { next(); return; } // No token configured, skip
    const token = req.headers['x-worker-token'] as string;
    if (token !== workerToken) {
      res.status(401).json({ error: 'Invalid or missing X-Worker-Token' });
      return;
    }
    next();
  }

  // ── Embeddings ──

  // Backfill embeddings for observations without embeddings
  router.post('/api/embeddings/backfill', requireAuth, async (req, res) => {
    const { batchSize } = req.body || {};

    try {
      const vectorSearch = getVectorSearch();
      const count = await vectorSearch.backfillEmbeddings(
        ctx.db.db,
        parseIntSafe(String(batchSize), 50, 1, 500)
      );
      res.json({ success: true, generated: count });
    } catch (error) {
      logger.error('WORKER', 'Backfill embeddings failed', {}, error as Error);
      res.status(500).json({ error: 'Backfill failed' });
    }
  });

  // Embedding statistics
  router.get('/api/embeddings/stats', (_req, res) => {
    try {
      const vectorSearch = getVectorSearch();
      const stats = vectorSearch.getStats(ctx.db.db);
      const embeddingService = getEmbeddingService();

      res.json({
        ...stats,
        provider: embeddingService.getProvider(),
        dimensions: embeddingService.getDimensions(),
        available: embeddingService.isAvailable()
      });
    } catch (error) {
      logger.error('WORKER', 'Embedding stats failed', {}, error as Error);
      res.status(500).json({ error: 'Stats failed' });
    }
  });

  // ── Retention Policy ──

  router.post('/api/retention/cleanup', requireAuth, (req, res) => {
    const { maxAgeDays, dryRun } = req.body || {};
    const days = parseIntSafe(String(maxAgeDays), 90, 7, 730);
    const threshold = Date.now() - (days * 86_400_000);

    try {
      if (dryRun) {
        const obsCount = (ctx.db.db.query('SELECT COUNT(*) as c FROM observations WHERE created_at_epoch < ?').get(threshold) as { c: number }).c;
        const sumCount = (ctx.db.db.query('SELECT COUNT(*) as c FROM summaries WHERE created_at_epoch < ?').get(threshold) as { c: number }).c;
        const promptCount = (ctx.db.db.query('SELECT COUNT(*) as c FROM prompts WHERE created_at_epoch < ?').get(threshold) as { c: number }).c;
        res.json({ dryRun: true, maxAgeDays: days, wouldDelete: { observations: obsCount, summaries: sumCount, prompts: promptCount } });
        return;
      }

      const cleanup = ctx.db.db.transaction(() => {
        ctx.db.db.run('DELETE FROM observation_embeddings WHERE observation_id IN (SELECT id FROM observations WHERE created_at_epoch < ?)', [threshold]);
        const obsResult = ctx.db.db.run('DELETE FROM observations WHERE created_at_epoch < ?', [threshold]);
        const sumResult = ctx.db.db.run('DELETE FROM summaries WHERE created_at_epoch < ?', [threshold]);
        const promptResult = ctx.db.db.run('DELETE FROM prompts WHERE created_at_epoch < ?', [threshold]);
        return {
          observations: obsResult.changes,
          summaries: sumResult.changes,
          prompts: promptResult.changes,
        };
      });

      const deleted = cleanup();
      ctx.invalidateProjectsCache();

      logger.info('WORKER', `Retention cleanup: deleted ${deleted.observations} obs, ${deleted.summaries} sum, ${deleted.prompts} prompts (> ${days}d)`);
      res.json({ success: true, maxAgeDays: days, deleted });
    } catch (error) {
      logger.error('WORKER', 'Retention cleanup failed', { maxAgeDays: days }, error as Error);
      res.status(500).json({ error: 'Retention cleanup failed' });
    }
  });

  // ── Export ──

  router.get('/api/export', (req, res) => {
    const { project, format: fmt, type, days } = req.query as {
      project?: string; format?: string; type?: string; days?: string;
    };

    if (project && !isValidProject(project)) {
      res.status(400).json({ error: 'Invalid project name' });
      return;
    }

    const daysBack = parseIntSafe(days, 30, 1, 365);
    const threshold = Date.now() - (daysBack * 86_400_000);

    try {
      let sql = 'SELECT * FROM observations WHERE created_at_epoch > ?';
      const params: (string | number)[] = [threshold];
      if (project) { sql += ' AND project = ?'; params.push(project); }
      if (type) { sql += ' AND type = ?'; params.push(type); }
      sql += ' ORDER BY created_at_epoch DESC LIMIT 1000';
      const observations = ctx.db.db.query(sql).all(...params) as any[];

      let sumSql = 'SELECT * FROM summaries WHERE created_at_epoch > ?';
      const sumParams: (string | number)[] = [threshold];
      if (project) { sumSql += ' AND project = ?'; sumParams.push(project); }
      sumSql += ' ORDER BY created_at_epoch DESC LIMIT 100';
      const summaries = ctx.db.db.query(sumSql).all(...sumParams) as any[];

      if (fmt === 'markdown' || fmt === 'md') {
        const lines: string[] = [
          `# Kiro Memory Export`,
          `> Project: ${project || 'All'} | Period: ${daysBack} days | Generated: ${new Date().toISOString()}`,
          '',
          `## Observations (${observations.length})`,
          '',
        ];

        for (const obs of observations) {
          const date = new Date(obs.created_at_epoch).toISOString().split('T')[0];
          lines.push(`### [${obs.type}] ${obs.title}`);
          lines.push(`- **Date**: ${date} | **Project**: ${obs.project} | **ID**: #${obs.id}`);
          if (obs.narrative) lines.push(`- ${obs.narrative}`);
          if (obs.concepts) lines.push(`- **Concepts**: ${obs.concepts}`);
          lines.push('');
        }

        lines.push(`## Summaries (${summaries.length})`, '');
        for (const sum of summaries) {
          const date = new Date(sum.created_at_epoch).toISOString().split('T')[0];
          lines.push(`### Session ${sum.session_id} (${date})`);
          if (sum.request) lines.push(`- **Request**: ${sum.request}`);
          if (sum.completed) lines.push(`- **Completed**: ${sum.completed}`);
          if (sum.next_steps) lines.push(`- **Next steps**: ${sum.next_steps}`);
          lines.push('');
        }

        res.type('text/markdown').send(lines.join('\n'));
      } else {
        res.json({
          meta: { project: project || 'all', daysBack, exportedAt: new Date().toISOString() },
          observations,
          summaries,
        });
      }
    } catch (error) {
      logger.error('WORKER', 'Export failed', { project, fmt }, error as Error);
      res.status(500).json({ error: 'Export failed' });
    }
  });

  // ── Report ──

  router.get('/api/report', (req, res) => {
    const { project, period, format } = req.query as {
      project?: string; period?: string; format?: string;
    };

    if (project && !isValidProject(project)) {
      res.status(400).json({ error: 'Invalid project name' });
      return;
    }

    const validPeriods = ['weekly', 'monthly'];
    const reportPeriod = validPeriods.includes(period || '') ? period : 'weekly';
    const daysBack = reportPeriod === 'monthly' ? 30 : 7;
    const now = Date.now();
    const startEpoch = now - (daysBack * 24 * 60 * 60 * 1000);

    try {
      const data = getReportData(ctx.db.db, project || undefined, startEpoch, now);

      const outputFormat = format || 'json';
      if (outputFormat === 'markdown' || outputFormat === 'md') {
        res.type('text/markdown').send(formatReportMarkdown(data));
      } else if (outputFormat === 'text') {
        res.type('text/plain').send(JSON.stringify(data, null, 2));
      } else {
        res.json(data);
      }
    } catch (error) {
      logger.error('WORKER', 'Report generation failed', { project, period }, error as Error);
      res.status(500).json({ error: 'Report generation failed' });
    }
  });

  return router;
}
