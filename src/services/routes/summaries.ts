/**
 * Router Summaries: session summary CRUD.
 * Supporta keyset pagination tramite parametro `cursor` (base64 encoded epoch:id).
 * Il parametro `offset` è mantenuto come fallback deprecato per backward compatibility.
 */

import { Router } from 'express';
import type { WorkerContext } from '../worker-context.js';
import { isValidProject, isValidString, parseIntSafe } from '../worker-context.js';
import { createSummary } from '../sqlite/Summaries.js';
import { decodeCursor, buildNextCursor } from '../sqlite/cursor.js';
import { logger } from '../../utils/logger.js';

export function createSummariesRouter(ctx: WorkerContext): Router {
  const router = Router();

  // Lista sommari con keyset pagination.
  // Parametri:
  //   cursor  — cursor opaco base64 restituito dall'ultima risposta (prima pagina: assente)
  //   limit   — elementi per pagina (default 20, max 200)
  //   project — filtro opzionale per progetto
  //   offset  — [DEPRECATO] fallback OFFSET-based per compatibilità; ignorato se cursor è presente
  router.get('/api/summaries', (req, res) => {
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
          ? `SELECT * FROM summaries
             WHERE project = ? AND (created_at_epoch < ? OR (created_at_epoch = ? AND id < ?))
             ORDER BY created_at_epoch DESC, id DESC
             LIMIT ?`
          : `SELECT * FROM summaries
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
          ? 'SELECT * FROM summaries WHERE project = ? ORDER BY created_at_epoch DESC, id DESC LIMIT ? OFFSET ?'
          : 'SELECT * FROM summaries ORDER BY created_at_epoch DESC, id DESC LIMIT ? OFFSET ?';
        rows = project
          ? ctx.db.db.query(sql).all(project, _limit, _offset)
          : ctx.db.db.query(sql).all(_limit, _offset);
      } else {
        // Prima pagina senza cursor
        const sql = project
          ? 'SELECT * FROM summaries WHERE project = ? ORDER BY created_at_epoch DESC, id DESC LIMIT ?'
          : 'SELECT * FROM summaries ORDER BY created_at_epoch DESC, id DESC LIMIT ?';
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
          ? 'SELECT COUNT(*) as total FROM summaries WHERE project = ?'
          : 'SELECT COUNT(*) as total FROM summaries';
        const { total } = (project
          ? ctx.db.db.query(countSql).get(project)
          : ctx.db.db.query(countSql).get()) as { total: number };
        res.setHeader('X-Total-Count', total);
      }

      res.json({ data: rows, next_cursor, has_more: next_cursor !== null });
    } catch (error) {
      logger.error('WORKER', 'Summary list failed', {}, error as Error);
      res.status(500).json({ error: 'Failed to list summaries' });
    }
  });

  // Create summary
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
      logger.error('WORKER', 'Summary creation failed', {}, error as Error);
      res.status(500).json({ error: 'Failed to store summary' });
    }
  });

  return router;
}
