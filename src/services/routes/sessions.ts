/**
 * Router Sessions: session list, checkpoints, prompts.
 * L'endpoint /api/prompts supporta keyset pagination tramite parametro `cursor`.
 * Il parametro `offset` è mantenuto come fallback deprecato per backward compatibility.
 */

import { Router } from 'express';
import type { WorkerContext } from '../worker-context.js';
import { isValidProject, parseIntSafe } from '../worker-context.js';
import { getSessionsByProject, getAllSessions } from '../sqlite/Sessions.js';
import { getLatestCheckpoint, getLatestCheckpointByProject } from '../sqlite/Checkpoints.js';
import { decodeCursor, buildNextCursor } from '../sqlite/cursor.js';
import { logger } from '../../utils/logger.js';

export function createSessionsRouter(ctx: WorkerContext): Router {
  const router = Router();

  // Session list
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
      logger.error('WORKER', 'Session list failed', { project }, error as Error);
      res.status(500).json({ error: 'Sessions list failed' });
    }
  });

  // Checkpoint by session
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
      logger.error('WORKER', 'Checkpoint fetch failed', { sessionId }, error as Error);
      res.status(500).json({ error: 'Checkpoint fetch failed' });
    }
  });

  // Checkpoint by project
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
      logger.error('WORKER', 'Project checkpoint fetch failed', { project }, error as Error);
      res.status(500).json({ error: 'Project checkpoint fetch failed' });
    }
  });

  // Lista prompt con keyset pagination.
  // Parametri:
  //   cursor  — cursor opaco base64 restituito dall'ultima risposta (prima pagina: assente)
  //   limit   — elementi per pagina (default 20, max 200)
  //   project — filtro opzionale per progetto
  //   offset  — [DEPRECATO] fallback OFFSET-based per compatibilità; ignorato se cursor è presente
  router.get('/api/prompts', (req, res) => {
    const { cursor, offset, limit, project } = req.query as {
      cursor?: string;
      offset?: string;
      limit?: string;
      project?: string;
    };
    const _limit = parseIntSafe(limit, 20, 1, 200);

    try {
      let rows: unknown[];

      if (cursor) {
        // Modalità keyset: WHERE (created_at_epoch, id) < (cursorEpoch, cursorId)
        const decoded = decodeCursor(cursor);
        if (!decoded) {
          res.status(400).json({ error: 'Cursor non valido' });
          return;
        }

        const sql = project
          ? `SELECT * FROM prompts
             WHERE project = ? AND (created_at_epoch < ? OR (created_at_epoch = ? AND id < ?))
             ORDER BY created_at_epoch DESC, id DESC
             LIMIT ?`
          : `SELECT * FROM prompts
             WHERE (created_at_epoch < ? OR (created_at_epoch = ? AND id < ?))
             ORDER BY created_at_epoch DESC, id DESC
             LIMIT ?`;

        rows = project
          ? ctx.db.db.query(sql).all(project, decoded.epoch, decoded.epoch, decoded.id, _limit)
          : ctx.db.db.query(sql).all(decoded.epoch, decoded.epoch, decoded.id, _limit);
      } else if (offset !== undefined) {
        // Modalità fallback OFFSET (deprecata)
        const _offset = parseIntSafe(offset, 0, 0, 1_000_000);
        const sql = project
          ? 'SELECT * FROM prompts WHERE project = ? ORDER BY created_at_epoch DESC, id DESC LIMIT ? OFFSET ?'
          : 'SELECT * FROM prompts ORDER BY created_at_epoch DESC, id DESC LIMIT ? OFFSET ?';
        rows = project
          ? ctx.db.db.query(sql).all(project, _limit, _offset)
          : ctx.db.db.query(sql).all(_limit, _offset);
      } else {
        // Prima pagina senza cursor
        const sql = project
          ? 'SELECT * FROM prompts WHERE project = ? ORDER BY created_at_epoch DESC, id DESC LIMIT ?'
          : 'SELECT * FROM prompts ORDER BY created_at_epoch DESC, id DESC LIMIT ?';
        rows = project
          ? ctx.db.db.query(sql).all(project, _limit)
          : ctx.db.db.query(sql).all(_limit);
      }

      // Costruisce il cursor per la pagina successiva
      const typedRows = rows as Array<{ id: number; created_at_epoch: number }>;
      const next_cursor = buildNextCursor(typedRows, _limit);

      // Header X-Total-Count per backward compatibility (solo in modalità non-cursor)
      if (!cursor) {
        const countSql = project
          ? 'SELECT COUNT(*) as total FROM prompts WHERE project = ?'
          : 'SELECT COUNT(*) as total FROM prompts';
        const { total } = (project
          ? ctx.db.db.query(countSql).get(project)
          : ctx.db.db.query(countSql).get()) as { total: number };
        res.setHeader('X-Total-Count', total);
      }

      res.json({ data: rows, next_cursor, has_more: next_cursor !== null });
    } catch (error) {
      logger.error('WORKER', 'Prompt list failed', {}, error as Error);
      res.status(500).json({ error: 'Failed to list prompts' });
    }
  });

  return router;
}
