/**
 * Router Search: ricerca FTS5, ricerca ibrida, timeline.
 */

import { Router } from 'express';
import type { WorkerContext } from '../worker-context.js';
import { parseIntSafe } from '../worker-context.js';
import { searchObservationsFTS, searchSummariesFiltered, getTimeline } from '../sqlite/Search.js';
import { getHybridSearch } from '../search/HybridSearch.js';
import { logger } from '../../utils/logger.js';

export function createSearchRouter(ctx: WorkerContext): Router {
  const router = Router();

  // Ricerca FTS5 con filtri
  router.get('/api/search', (req, res) => {
    const { q, project, type, limit } = req.query as { q: string; project?: string; type?: string; limit?: string };

    if (!q) {
      res.status(400).json({ error: 'Query parameter "q" is required' });
      return;
    }

    try {
      const filters = {
        project: project || undefined,
        type: type || undefined,
        limit: parseIntSafe(limit, 20, 1, 100)
      };

      const results = {
        observations: searchObservationsFTS(ctx.db.db, q, filters),
        summaries: searchSummariesFiltered(ctx.db.db, q, filters)
      };

      res.json(results);
    } catch (error) {
      logger.error('WORKER', 'Ricerca fallita', { query: q }, error as Error);
      res.status(500).json({ error: 'Search failed' });
    }
  });

  // Ricerca ibrida (vector + keyword)
  router.get('/api/hybrid-search', async (req, res) => {
    const { q, project, limit } = req.query as { q: string; project?: string; limit?: string };

    if (!q) {
      res.status(400).json({ error: 'Query parameter "q" is required' });
      return;
    }

    try {
      const hybridSearch = getHybridSearch();
      const results = await hybridSearch.search(ctx.db.db, q, {
        project: project || undefined,
        limit: parseIntSafe(limit, 10, 1, 100)
      });

      res.json({ results, count: results.length });
    } catch (error) {
      logger.error('WORKER', 'Ricerca ibrida fallita', { query: q }, error as Error);
      res.status(500).json({ error: 'Hybrid search failed' });
    }
  });

  // Timeline: contesto cronologico attorno a un'osservazione
  router.get('/api/timeline', (req, res) => {
    const { anchor, depth_before, depth_after } = req.query as { anchor: string; depth_before?: string; depth_after?: string };

    if (!anchor) {
      res.status(400).json({ error: 'Query parameter "anchor" is required' });
      return;
    }

    const anchorId = parseIntSafe(anchor, 0, 1, Number.MAX_SAFE_INTEGER);
    if (anchorId === 0) {
      res.status(400).json({ error: 'Invalid "anchor" (must be positive integer)' });
      return;
    }

    try {
      const timeline = getTimeline(
        ctx.db.db,
        anchorId,
        parseIntSafe(depth_before, 5, 1, 50),
        parseIntSafe(depth_after, 5, 1, 50)
      );

      res.json({ timeline });
    } catch (error) {
      logger.error('WORKER', 'Timeline fallita', { anchor }, error as Error);
      res.status(500).json({ error: 'Timeline failed' });
    }
  });

  return router;
}
