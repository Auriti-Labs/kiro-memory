/**
 * Router Core: health check, SSE events, notify endpoint.
 * Manages the base worker infrastructure.
 */

import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import type { WorkerContext } from '../worker-context.js';
import { getClients, getMaxSSEClients, addClient, removeClient } from '../worker-context.js';
import { logger } from '../../utils/logger.js';
import { VERSION } from '../../index.js';

const ALLOWED_EVENTS = new Set([
  'observation-created',
  'summary-created',
  'prompt-created',
  'session-created'
]);

const startedAt = Date.now();

export function createCoreRouter(ctx: WorkerContext, workerToken: string): Router {
  const router = Router();

  // Error tracking for diagnostics
  const recentErrors: Array<{ category: string; message: string; ts: string }> = [];
  const MAX_RECENT_ERRORS = 20;

  // Allow other modules to push errors via ctx
  (ctx as any)._pushDiagnosticError = (category: string, message: string) => {
    recentErrors.push({ category, message, ts: new Date().toISOString() });
    if (recentErrors.length > MAX_RECENT_ERRORS) recentErrors.shift();
  };

  // Dedicated rate limit for /api/notify (more restrictive)
  const notifyLimiter = rateLimit({
    windowMs: 60_000,
    max: 60,
    standardHeaders: true,
    legacyHeaders: false
  });

  // Notification from hooks → SSE broadcast to dashboard clients
  router.post('/api/notify', notifyLimiter, (req, res) => {
    const token = req.headers['x-worker-token'] as string;
    if (token !== workerToken) {
      res.status(401).json({ error: 'Invalid or missing X-Worker-Token' });
      return;
    }

    const { event, data } = req.body || {};
    if (!event || typeof event !== 'string' || !ALLOWED_EVENTS.has(event)) {
      res.status(400).json({ error: `Event must be one of: ${[...ALLOWED_EVENTS].join(', ')}` });
      return;
    }

    ctx.broadcast(event, data || {});
    res.json({ ok: true });
  });

  // Health check with diagnostics
  router.get('/health', (_req, res) => {
    const uptimeSeconds = Math.floor((Date.now() - startedAt) / 1000);
    const oneHourAgo = new Date(Date.now() - 3_600_000).toISOString();
    const errorsLastHour = recentErrors.filter(e => e.ts >= oneHourAgo).length;

    // Embedding health (lazy, cached for 60s)
    let embeddingHealth: any = null;
    try {
      const row = ctx.db.query(`
        SELECT
          (SELECT COUNT(*) FROM observations) as total,
          (SELECT COUNT(*) FROM observation_embeddings) as embedded,
          (SELECT COUNT(*) FROM observation_embeddings WHERE typeof(embedding) = 'blob') as blob_type,
          (SELECT COUNT(*) FROM observation_embeddings WHERE typeof(embedding) = 'text') as text_type,
          (SELECT COUNT(*) FROM observation_embeddings WHERE length(embedding) = 0) as zero_length
      `).get() as any;
      if (row) embeddingHealth = row;
    } catch { /* ignore — table may not exist */ }

    res.json({
      status: 'ok',
      timestamp: Date.now(),
      version: VERSION,
      uptime_seconds: uptimeSeconds,
      pid: process.pid,
      diagnostics: {
        errors_last_hour: errorsLastHour,
        last_error: recentErrors.length > 0 ? recentErrors[recentErrors.length - 1] : null,
        embedding_health: embeddingHealth
      }
    });
  });

  // SSE endpoint with keepalive and connection limit
  router.get('/events', (req, res) => {
    const clients = getClients();
    if (clients.length >= getMaxSSEClients()) {
      res.status(503).json({ error: 'Too many SSE connections' });
      return;
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    addClient(res);
    logger.info('WORKER', 'SSE client connected', { clients: clients.length });

    // Initial connection event
    res.write(`event: connected\ndata: ${JSON.stringify({ timestamp: Date.now() })}\n\n`);

    // Keepalive every 15 seconds
    const keepaliveInterval = setInterval(() => {
      try {
        res.write(`:keepalive ${Date.now()}\n\n`);
      } catch {
        clearInterval(keepaliveInterval);
      }
    }, 15000);

    req.on('close', () => {
      clearInterval(keepaliveInterval);
      removeClient(res);
      logger.info('WORKER', 'SSE client disconnected', { clients: getClients().length });
    });
  });

  return router;
}
