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

export function createCoreRouter(ctx: WorkerContext, workerToken: string): Router {
  const router = Router();

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

  // Health check
  router.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      timestamp: Date.now(),
      version: VERSION
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
