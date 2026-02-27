/**
 * Router Observations: CRUD osservazioni, batch, knowledge, memory save.
 */

import { Router } from 'express';
import type { WorkerContext } from '../worker-context.js';
import { isValidProject, isValidString, parseIntSafe } from '../worker-context.js';
import { getObservationsByProject, createObservation } from '../sqlite/Observations.js';
import { getSummariesByProject } from '../sqlite/Summaries.js';
import { getObservationsByIds } from '../sqlite/Search.js';
import { KNOWLEDGE_TYPES } from '../../types/worker-types.js';
import type { KnowledgeMetadata } from '../../types/worker-types.js';
import { logger } from '../../utils/logger.js';

export function createObservationsRouter(ctx: WorkerContext): Router {
  const router = Router();

  // Lista osservazioni paginata
  router.get('/api/observations', (req, res) => {
    const { offset, limit, project } = req.query as { offset?: string; limit?: string; project?: string };
    const _offset = parseIntSafe(offset, 0, 0, 1_000_000);
    const _limit = parseIntSafe(limit, 50, 1, 200);

    try {
      const countSql = project
        ? 'SELECT COUNT(*) as total FROM observations WHERE project = ?'
        : 'SELECT COUNT(*) as total FROM observations';
      const countStmt = ctx.db.db.query(countSql);
      const { total } = (project ? countStmt.get(project) : countStmt.get()) as { total: number };

      const sql = project
        ? 'SELECT * FROM observations WHERE project = ? ORDER BY created_at_epoch DESC LIMIT ? OFFSET ?'
        : 'SELECT * FROM observations ORDER BY created_at_epoch DESC LIMIT ? OFFSET ?';
      const stmt = ctx.db.db.query(sql);
      const rows = project ? stmt.all(project, _limit, _offset) : stmt.all(_limit, _offset);
      res.setHeader('X-Total-Count', total);
      res.json(rows);
    } catch (error) {
      logger.error('WORKER', 'Lista osservazioni fallita', {}, error as Error);
      res.status(500).json({ error: 'Failed to list observations' });
    }
  });

  // Crea osservazione
  router.post('/api/observations', (req, res) => {
    const { memorySessionId, project, type, title, content, concepts, files } = req.body;

    if (!isValidProject(project)) {
      res.status(400).json({ error: 'Invalid or missing "project"' });
      return;
    }
    if (!isValidString(title, 500)) {
      res.status(400).json({ error: 'Invalid or missing "title" (max 500 chars)' });
      return;
    }
    if (content && !isValidString(content, 100_000)) {
      res.status(400).json({ error: '"content" too large (max 100KB)' });
      return;
    }
    if (concepts && !Array.isArray(concepts)) {
      res.status(400).json({ error: '"concepts" must be an array' });
      return;
    }
    if (files && !Array.isArray(files)) {
      res.status(400).json({ error: '"files" must be an array' });
      return;
    }

    try {
      const id = createObservation(
        ctx.db.db,
        memorySessionId || 'api-' + Date.now(),
        project,
        type || 'manual',
        title,
        null,
        content,
        null,
        null,
        concepts?.join(', ') || null,
        files?.join(', ') || null,
        null,
        0
      );

      ctx.broadcast('observation-created', { id, project, title });
      ctx.invalidateProjectsCache();

      // Embedding in background
      ctx.generateEmbeddingForObservation(id, title, content, concepts).catch(() => {});

      res.json({ id, success: true });
    } catch (error) {
      logger.error('WORKER', 'Creazione osservazione fallita', {}, error as Error);
      res.status(500).json({ error: 'Failed to store observation' });
    }
  });

  // Batch fetch osservazioni per ID (max 100)
  router.post('/api/observations/batch', (req, res) => {
    const { ids } = req.body;

    if (!ids || !Array.isArray(ids) || ids.length === 0 || ids.length > 100) {
      res.status(400).json({ error: '"ids" must be an array of 1-100 elements' });
      return;
    }
    if (!ids.every((id: unknown) => typeof id === 'number' && Number.isInteger(id) && id > 0)) {
      res.status(400).json({ error: 'All IDs must be positive integers' });
      return;
    }

    try {
      const observations = getObservationsByIds(ctx.db.db, ids);
      res.json({ observations });
    } catch (error) {
      logger.error('WORKER', 'Batch fetch fallito', { ids }, error as Error);
      res.status(500).json({ error: 'Batch fetch failed' });
    }
  });

  // Store structured knowledge
  router.post('/api/knowledge', (req, res) => {
    const { project, knowledge_type, title, content, concepts, files,
            severity, alternatives, reason, context: metaContext, confidence } = req.body;

    if (!isValidProject(project)) {
      res.status(400).json({ error: 'Invalid or missing "project"' });
      return;
    }
    if (!knowledge_type || !KNOWLEDGE_TYPES.includes(knowledge_type)) {
      res.status(400).json({ error: `Invalid "knowledge_type". Must be one of: ${KNOWLEDGE_TYPES.join(', ')}` });
      return;
    }
    if (!isValidString(title, 500)) {
      res.status(400).json({ error: 'Invalid or missing "title" (max 500 chars)' });
      return;
    }
    if (!isValidString(content, 100_000)) {
      res.status(400).json({ error: 'Invalid or missing "content" (max 100KB)' });
      return;
    }
    if (concepts && !Array.isArray(concepts)) {
      res.status(400).json({ error: '"concepts" must be an array' });
      return;
    }
    if (files && !Array.isArray(files)) {
      res.status(400).json({ error: '"files" must be an array' });
      return;
    }

    try {
      let metadata: KnowledgeMetadata;
      switch (knowledge_type) {
        case 'constraint':
          metadata = { knowledgeType: 'constraint', severity: severity === 'hard' ? 'hard' : 'soft', reason };
          break;
        case 'decision':
          metadata = { knowledgeType: 'decision', alternatives, reason };
          break;
        case 'heuristic':
          metadata = { knowledgeType: 'heuristic', context: metaContext, confidence: ['high', 'medium', 'low'].includes(confidence) ? confidence : undefined };
          break;
        case 'rejected':
          metadata = { knowledgeType: 'rejected', reason: reason || '', alternatives };
          break;
        default:
          res.status(400).json({ error: 'Invalid knowledge_type' });
          return;
      }

      const id = createObservation(
        ctx.db.db,
        'api-' + Date.now(),
        project,
        knowledge_type,
        title,
        null,
        content,
        null,
        JSON.stringify(metadata),
        concepts?.join(', ') || null,
        files?.join(', ') || null,
        null,
        0
      );

      ctx.broadcast('observation-created', { id, project, title, type: knowledge_type });
      ctx.generateEmbeddingForObservation(id, title, content, concepts).catch(() => {});

      res.json({ id, success: true, knowledge_type });
    } catch (error) {
      logger.error('WORKER', 'Salvataggio knowledge fallito', {}, error as Error);
      res.status(500).json({ error: 'Failed to store knowledge' });
    }
  });

  // Save memory (endpoint programmabile)
  router.post('/api/memory/save', (req, res) => {
    const { project, title, content, type, concepts } = req.body;

    if (!isValidProject(project)) {
      res.status(400).json({ error: 'Invalid or missing "project"' });
      return;
    }
    if (!isValidString(title, 500)) {
      res.status(400).json({ error: 'Invalid or missing "title" (max 500 chars)' });
      return;
    }
    if (!isValidString(content, 100_000)) {
      res.status(400).json({ error: 'Invalid or missing "content" (max 100KB)' });
      return;
    }

    const obsType = type || 'research';
    const conceptStr = Array.isArray(concepts) ? concepts.join(', ') : (concepts || null);

    try {
      const id = createObservation(
        ctx.db.db,
        'memory-save-' + Date.now(),
        project,
        obsType,
        title,
        null,
        content,
        content,
        null,
        conceptStr,
        null,
        null,
        0
      );

      ctx.broadcast('observation-created', { id, project, title });
      ctx.invalidateProjectsCache();
      ctx.generateEmbeddingForObservation(id, title, content, Array.isArray(concepts) ? concepts : undefined).catch(() => {});

      res.json({ id, success: true });
    } catch (error) {
      logger.error('WORKER', 'Memory save fallito', {}, error as Error);
      res.status(500).json({ error: 'Failed to save memory' });
    }
  });

  // Contesto per progetto
  router.get('/api/context/:project', (req, res) => {
    const { project } = req.params;

    if (!isValidProject(project)) {
      res.status(400).json({ error: 'Invalid project name' });
      return;
    }

    try {
      const context = {
        project,
        observations: getObservationsByProject(ctx.db.db, project, 20),
        summaries: getSummariesByProject(ctx.db.db, project, 5)
      };
      res.json(context);
    } catch (error) {
      logger.error('WORKER', 'Contesto fallito', { project }, error as Error);
      res.status(500).json({ error: 'Failed to get context' });
    }
  });

  return router;
}
