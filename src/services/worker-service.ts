/**
 * Kiro Memory Worker Service
 *
 * Lightweight worker for processing context operations in background.
 * Manages queue, health checks, and SSE broadcasting.
 */

import express from 'express';
import cors from 'cors';
import { join, dirname } from 'path';
import { homedir } from 'os';
import { existsSync, mkdirSync, writeFileSync, unlinkSync, readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { KiroMemoryDatabase } from './sqlite/Database.js';
import { getObservationsByProject, createObservation } from './sqlite/Observations.js';
import { getSummariesByProject, createSummary } from './sqlite/Summaries.js';
import { searchObservationsFTS, searchSummariesFiltered, getTimeline, getObservationsByIds, getProjectStats } from './sqlite/Search.js';
import { logger } from '../utils/logger.js';
import { DATA_DIR } from '../shared/paths.js';

// Directory del file compilato (per servire asset statici)
const __worker_dirname = dirname(fileURLToPath(import.meta.url));

const PORT = process.env.KIRO_MEMORY_WORKER_PORT || process.env.CONTEXTKIT_WORKER_PORT || 3001;
const HOST = process.env.KIRO_MEMORY_WORKER_HOST || process.env.CONTEXTKIT_WORKER_HOST || '127.0.0.1';
const PID_FILE = join(DATA_DIR, 'worker.pid');

// Ensure data directory exists
if (!existsSync(DATA_DIR)) {
  mkdirSync(DATA_DIR, { recursive: true });
}

// Initialize database
const db = new KiroMemoryDatabase();
logger.info('WORKER', 'Database initialized');

// Express app
const app = express();
app.use(express.json());
app.use(cors());

// SSE clients
const clients: express.Response[] = [];

/**
 * Broadcast event to all connected SSE clients
 */
function broadcast(event: string, data: any): void {
  const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  clients.forEach(client => {
    try {
      client.write(message);
    } catch (err) {
      logger.warn('WORKER', 'Failed to broadcast to client', {}, err as Error);
    }
  });
}

// Endpoint di notifica: gli hook chiamano questo endpoint dopo ogni scrittura in SQLite
// per triggerare il broadcast SSE ai client della dashboard
app.post('/api/notify', (req, res) => {
  const { event, data } = req.body || {};
  if (event && typeof event === 'string') {
    broadcast(event, data || {});
    res.json({ ok: true });
  } else {
    res.status(400).json({ error: 'Campo "event" richiesto' });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: Date.now(),
    version: '1.0.0'
  });
});

// SSE endpoint con keepalive per evitare disconnessioni da proxy/browser
app.get('/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // Disabilita buffering nginx
  res.flushHeaders();

  clients.push(res);
  logger.info('WORKER', 'SSE client connected', { clients: clients.length });

  // Invia evento iniziale di connessione
  res.write(`event: connected\ndata: ${JSON.stringify({ timestamp: Date.now() })}\n\n`);

  // Keepalive ogni 15 secondi per mantenere la connessione aperta
  const keepaliveInterval = setInterval(() => {
    try {
      res.write(`:keepalive ${Date.now()}\n\n`);
    } catch {
      clearInterval(keepaliveInterval);
    }
  }, 15000);

  req.on('close', () => {
    clearInterval(keepaliveInterval);
    const index = clients.indexOf(res);
    if (index > -1) {
      clients.splice(index, 1);
    }
    logger.info('WORKER', 'SSE client disconnected', { clients: clients.length });
  });
});

// Get context for project
app.get('/api/context/:project', (req, res) => {
  const { project } = req.params;
  
  try {
    const context = {
      project,
      observations: getObservationsByProject(db.db, project, 20),
      summaries: getSummariesByProject(db.db, project, 5)
    };
    
    res.json(context);
  } catch (error) {
    logger.error('WORKER', 'Failed to get context', { project }, error as Error);
    res.status(500).json({ error: 'Failed to get context' });
  }
});

// Store observation
app.post('/api/observations', (req, res) => {
  const { memorySessionId, project, type, title, content, concepts, files } = req.body;
  
  try {
    const id = createObservation(
      db.db,
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
    
    broadcast('observation-created', { id, project, title });
    
    res.json({ id, success: true });
  } catch (error) {
    logger.error('WORKER', 'Failed to store observation', {}, error as Error);
    res.status(500).json({ error: 'Failed to store observation' });
  }
});

// Store summary
app.post('/api/summaries', (req, res) => {
  const { sessionId, project, request, learned, completed, nextSteps } = req.body;
  
  try {
    const id = createSummary(
      db.db,
      sessionId || 'api-' + Date.now(),
      project,
      request || null,
      null,
      learned || null,
      completed || null,
      nextSteps || null,
      null
    );
    
    broadcast('summary-created', { id, project });
    
    res.json({ id, success: true });
  } catch (error) {
    logger.error('WORKER', 'Failed to store summary', {}, error as Error);
    res.status(500).json({ error: 'Failed to store summary' });
  }
});

// Ricerca avanzata con FTS5 e filtri
app.get('/api/search', (req, res) => {
  const { q, project, type, limit } = req.query as { q: string; project?: string; type?: string; limit?: string };

  if (!q) {
    res.status(400).json({ error: 'Query parameter "q" is required' });
    return;
  }

  try {
    const filters = {
      project: project || undefined,
      type: type || undefined,
      limit: limit ? parseInt(limit, 10) : 20
    };

    const results = {
      observations: searchObservationsFTS(db.db, q, filters),
      summaries: searchSummariesFiltered(db.db, q, filters)
    };

    res.json(results);
  } catch (error) {
    logger.error('WORKER', 'Ricerca fallita', { query: q }, error as Error);
    res.status(500).json({ error: 'Search failed' });
  }
});

// Timeline: contesto cronologico attorno a un'osservazione
app.get('/api/timeline', (req, res) => {
  const { anchor, depth_before, depth_after } = req.query as { anchor: string; depth_before?: string; depth_after?: string };

  if (!anchor) {
    res.status(400).json({ error: 'Query parameter "anchor" is required' });
    return;
  }

  try {
    const timeline = getTimeline(
      db.db,
      parseInt(anchor, 10),
      depth_before ? parseInt(depth_before, 10) : 5,
      depth_after ? parseInt(depth_after, 10) : 5
    );

    res.json({ timeline });
  } catch (error) {
    logger.error('WORKER', 'Timeline fallita', { anchor }, error as Error);
    res.status(500).json({ error: 'Timeline failed' });
  }
});

// Batch fetch osservazioni per ID
app.post('/api/observations/batch', (req, res) => {
  const { ids } = req.body;

  if (!ids || !Array.isArray(ids)) {
    res.status(400).json({ error: 'Body parameter "ids" (array) is required' });
    return;
  }

  try {
    const observations = getObservationsByIds(db.db, ids);
    res.json({ observations });
  } catch (error) {
    logger.error('WORKER', 'Batch fetch fallito', { ids }, error as Error);
    res.status(500).json({ error: 'Batch fetch failed' });
  }
});

// Statistiche progetto
app.get('/api/stats/:project', (req, res) => {
  const { project } = req.params;

  try {
    const stats = getProjectStats(db.db, project);
    res.json(stats);
  } catch (error) {
    logger.error('WORKER', 'Stats fallite', { project }, error as Error);
    res.status(500).json({ error: 'Stats failed' });
  }
});

// Lista osservazioni paginata
app.get('/api/observations', (req, res) => {
  const { offset, limit, project } = req.query as { offset?: string; limit?: string; project?: string };
  const _offset = offset ? parseInt(offset, 10) : 0;
  const _limit = limit ? parseInt(limit, 10) : 50;

  try {
    const sql = project
      ? 'SELECT * FROM observations WHERE project = ? ORDER BY created_at_epoch DESC LIMIT ? OFFSET ?'
      : 'SELECT * FROM observations ORDER BY created_at_epoch DESC LIMIT ? OFFSET ?';
    const stmt = db.db.query(sql);
    const rows = project ? stmt.all(project, _limit, _offset) : stmt.all(_limit, _offset);
    res.json(rows);
  } catch (error) {
    logger.error('WORKER', 'Lista osservazioni fallita', {}, error as Error);
    res.status(500).json({ error: 'Failed to list observations' });
  }
});

// Lista summary paginata
app.get('/api/summaries', (req, res) => {
  const { offset, limit, project } = req.query as { offset?: string; limit?: string; project?: string };
  const _offset = offset ? parseInt(offset, 10) : 0;
  const _limit = limit ? parseInt(limit, 10) : 20;

  try {
    const sql = project
      ? 'SELECT * FROM summaries WHERE project = ? ORDER BY created_at_epoch DESC LIMIT ? OFFSET ?'
      : 'SELECT * FROM summaries ORDER BY created_at_epoch DESC LIMIT ? OFFSET ?';
    const stmt = db.db.query(sql);
    const rows = project ? stmt.all(project, _limit, _offset) : stmt.all(_limit, _offset);
    res.json(rows);
  } catch (error) {
    logger.error('WORKER', 'Lista summary fallita', {}, error as Error);
    res.status(500).json({ error: 'Failed to list summaries' });
  }
});

// Lista prompt paginata
app.get('/api/prompts', (req, res) => {
  const { offset, limit, project } = req.query as { offset?: string; limit?: string; project?: string };
  const _offset = offset ? parseInt(offset, 10) : 0;
  const _limit = limit ? parseInt(limit, 10) : 20;

  try {
    const sql = project
      ? 'SELECT * FROM prompts WHERE project = ? ORDER BY created_at_epoch DESC LIMIT ? OFFSET ?'
      : 'SELECT * FROM prompts ORDER BY created_at_epoch DESC LIMIT ? OFFSET ?';
    const stmt = db.db.query(sql);
    const rows = project ? stmt.all(project, _limit, _offset) : stmt.all(_limit, _offset);
    res.json(rows);
  } catch (error) {
    logger.error('WORKER', 'Lista prompt fallita', {}, error as Error);
    res.status(500).json({ error: 'Failed to list prompts' });
  }
});

// GET project aliases
app.get('/api/project-aliases', (_req, res) => {
  try {
    const stmt = db.db.query('SELECT project_name, display_name FROM project_aliases');
    const rows = stmt.all() as { project_name: string; display_name: string }[];
    const aliases: Record<string, string> = {};
    for (const row of rows) {
      aliases[row.project_name] = row.display_name;
    }
    res.json(aliases);
  } catch (error) {
    logger.error('WORKER', 'Failed to list project aliases', {}, error as Error);
    res.status(500).json({ error: 'Failed to list project aliases' });
  }
});

// PUT project alias (crea o aggiorna)
app.put('/api/project-aliases/:project', (req, res) => {
  const { project } = req.params;
  const { displayName } = req.body;

  if (!displayName || typeof displayName !== 'string') {
    res.status(400).json({ error: 'Field "displayName" (string) is required' });
    return;
  }

  try {
    const now = new Date().toISOString();
    const stmt = db.db.query(`
      INSERT INTO project_aliases (project_name, display_name, created_at, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(project_name) DO UPDATE SET display_name = excluded.display_name, updated_at = excluded.updated_at
    `);
    stmt.run(project, displayName.trim(), now, now);
    res.json({ ok: true, project_name: project, display_name: displayName.trim() });
  } catch (error) {
    logger.error('WORKER', 'Failed to update project alias', { project }, error as Error);
    res.status(500).json({ error: 'Failed to update project alias' });
  }
});

// Lista progetti distinti
app.get('/api/projects', (_req, res) => {
  try {
    const stmt = db.db.query(
      `SELECT DISTINCT project FROM (
        SELECT project FROM observations
        UNION
        SELECT project FROM summaries
        UNION
        SELECT project FROM prompts
      ) ORDER BY project ASC`
    );
    const rows = stmt.all() as { project: string }[];
    res.json(rows.map(r => r.project));
  } catch (error) {
    logger.error('WORKER', 'Lista progetti fallita', {}, error as Error);
    res.status(500).json({ error: 'Failed to list projects' });
  }
});

// Servire la UI viewer (file statici dalla directory dist)
app.use(express.static(__worker_dirname, {
  index: false,
  maxAge: '1h'
}));

// Route root → viewer HTML
app.get('/', (_req, res) => {
  const viewerPath = join(__worker_dirname, 'viewer.html');
  if (existsSync(viewerPath)) {
    res.sendFile(viewerPath);
  } else {
    res.status(404).json({ error: 'Viewer not found. Run npm run build first.' });
  }
});

// Start server
const server = app.listen(Number(PORT), HOST, () => {
  logger.info('WORKER', `Kiro Memory worker started on http://${HOST}:${PORT}`);
  
  // Write PID file
  writeFileSync(PID_FILE, String(process.pid), 'utf-8');
});

// Graceful shutdown
function shutdown(signal: string): void {
  logger.info('WORKER', `Received ${signal}, shutting down gracefully...`);
  
  server.close(() => {
    logger.info('WORKER', 'Server closed');
    
    // Remove PID file
    if (existsSync(PID_FILE)) {
      unlinkSync(PID_FILE);
    }
    
    // Close database
    db.close();
    
    process.exit(0);
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  logger.error('WORKER', 'Uncaught exception', {}, error);
  shutdown('uncaughtException');
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('WORKER', 'Unhandled rejection', { reason }, reason as Error);
});
