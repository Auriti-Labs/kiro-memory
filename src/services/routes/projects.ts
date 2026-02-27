/**
 * Router Projects: lista progetti, alias, statistiche progetto.
 */

import { Router } from 'express';
import type { WorkerContext } from '../worker-context.js';
import { isValidProject } from '../worker-context.js';
import { projectsCache, PROJECTS_CACHE_TTL } from '../worker-context.js';
import { getProjectStats } from '../sqlite/Search.js';
import { logger } from '../../utils/logger.js';

export function createProjectsRouter(ctx: WorkerContext): Router {
  const router = Router();

  // Lista progetti distinti (con cache TTL 60s)
  router.get('/api/projects', (_req, res) => {
    try {
      const now = Date.now();
      if (now - projectsCache.ts < PROJECTS_CACHE_TTL && projectsCache.data.length > 0) {
        res.json(projectsCache.data);
        return;
      }

      const stmt = ctx.db.db.query(
        `SELECT DISTINCT project FROM (
          SELECT project FROM observations
          UNION
          SELECT project FROM summaries
          UNION
          SELECT project FROM prompts
        ) ORDER BY project ASC`
      );
      const rows = stmt.all() as { project: string }[];
      projectsCache.data = rows.map(r => r.project);
      projectsCache.ts = now;
      res.json(projectsCache.data);
    } catch (error) {
      logger.error('WORKER', 'Lista progetti fallita', {}, error as Error);
      res.status(500).json({ error: 'Failed to list projects' });
    }
  });

  // GET project aliases
  router.get('/api/project-aliases', (_req, res) => {
    try {
      const stmt = ctx.db.db.query('SELECT project_name, display_name FROM project_aliases');
      const rows = stmt.all() as { project_name: string; display_name: string }[];
      const aliases: Record<string, string> = {};
      for (const row of rows) {
        aliases[row.project_name] = row.display_name;
      }
      res.json(aliases);
    } catch (error) {
      logger.error('WORKER', 'Lista alias fallita', {}, error as Error);
      res.status(500).json({ error: 'Failed to list project aliases' });
    }
  });

  // PUT project alias (crea o aggiorna)
  router.put('/api/project-aliases/:project', (req, res) => {
    const { project } = req.params;
    const { displayName } = req.body;

    if (!isValidProject(project)) {
      res.status(400).json({ error: 'Invalid project name' });
      return;
    }
    if (!displayName || typeof displayName !== 'string' || displayName.trim().length === 0 || displayName.length > 100) {
      res.status(400).json({ error: 'Field "displayName" is required (string, max 100 chars)' });
      return;
    }

    try {
      const now = new Date().toISOString();
      const stmt = ctx.db.db.query(`
        INSERT INTO project_aliases (project_name, display_name, created_at, updated_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(project_name) DO UPDATE SET display_name = excluded.display_name, updated_at = excluded.updated_at
      `);
      stmt.run(project, displayName.trim(), now, now);
      res.json({ ok: true, project_name: project, display_name: displayName.trim() });
    } catch (error) {
      logger.error('WORKER', 'Aggiornamento alias fallito', { project }, error as Error);
      res.status(500).json({ error: 'Failed to update project alias' });
    }
  });

  // Statistiche progetto
  router.get('/api/stats/:project', (req, res) => {
    const { project } = req.params;

    if (!isValidProject(project)) {
      res.status(400).json({ error: 'Invalid project name' });
      return;
    }

    try {
      const stats = getProjectStats(ctx.db.db, project);
      res.json(stats);
    } catch (error) {
      logger.error('WORKER', 'Stats fallite', { project }, error as Error);
      res.status(500).json({ error: 'Stats failed' });
    }
  });

  return router;
}
