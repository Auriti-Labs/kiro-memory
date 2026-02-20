/**
 * Kiro Memory Worker Service
 *
 * Lightweight worker for processing context operations in background.
 * Manages queue, health checks, and SSE broadcasting.
 */

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import crypto from 'crypto';
import { join, dirname } from 'path';
import { homedir } from 'os';
import { existsSync, mkdirSync, writeFileSync, unlinkSync, readFileSync, chmodSync } from 'fs';
import { fileURLToPath } from 'url';
import { KiroMemoryDatabase } from './sqlite/Database.js';
import { getObservationsByProject, createObservation } from './sqlite/Observations.js';
import { getSummariesByProject, createSummary } from './sqlite/Summaries.js';
import { searchObservationsFTS, searchSummariesFiltered, getTimeline, getObservationsByIds, getProjectStats } from './sqlite/Search.js';
import { getHybridSearch } from './search/HybridSearch.js';
import { getEmbeddingService } from './search/EmbeddingService.js';
import { getVectorSearch } from './search/VectorSearch.js';
import { getObservationsTimeline, getTypeDistribution, getSessionStats, getAnalyticsOverview } from './sqlite/Analytics.js';
import { getLatestCheckpoint, getLatestCheckpointByProject } from './sqlite/Checkpoints.js';
import { getSessionsByProject, getActiveSessions } from './sqlite/Sessions.js';
import { logger } from '../utils/logger.js';
import { DATA_DIR } from '../shared/paths.js';

// Directory del file compilato (per servire asset statici)
const __worker_dirname = dirname(fileURLToPath(import.meta.url));

const PORT = process.env.KIRO_MEMORY_WORKER_PORT || process.env.CONTEXTKIT_WORKER_PORT || 3001;
const HOST = process.env.KIRO_MEMORY_WORKER_HOST || process.env.CONTEXTKIT_WORKER_HOST || '127.0.0.1';
const PID_FILE = join(DATA_DIR, 'worker.pid');
const TOKEN_FILE = join(DATA_DIR, 'worker.token');
const MAX_SSE_CLIENTS = 50;

// Ensure data directory exists
if (!existsSync(DATA_DIR)) {
  mkdirSync(DATA_DIR, { recursive: true });
}

// Genera token di autenticazione per comunicazione hook→worker
const WORKER_TOKEN = crypto.randomBytes(32).toString('hex');
writeFileSync(TOKEN_FILE, WORKER_TOKEN, 'utf-8');
try {
  chmodSync(TOKEN_FILE, 0o600);
} catch (err) {
  // Su Windows chmod non è supportato — ignora. Su Unix è un problema reale.
  if (process.platform !== 'win32') {
    logger.warn('WORKER', `chmod 600 fallito su ${TOKEN_FILE}`, {}, err as Error);
  }
}

// Initialize database
const db = new KiroMemoryDatabase();
logger.info('WORKER', 'Database initialized');

// Inizializza embedding service in background (lazy, non bloccante)
getHybridSearch().initialize().catch(err => {
  logger.warn('WORKER', 'Inizializzazione embedding fallita, ricerca solo FTS5', {}, err as Error);
});

// ── Helpers di validazione ──

/** Parsa un intero con range sicuro, ritorna default se invalido */
function parseIntSafe(value: string | undefined, defaultVal: number, min: number, max: number): number {
  if (!value) return defaultVal;
  const parsed = parseInt(value, 10);
  if (isNaN(parsed) || parsed < min || parsed > max) return defaultVal;
  return parsed;
}

/** Valida che un nome progetto contenga solo caratteri sicuri */
function isValidProject(project: unknown): project is string {
  return typeof project === 'string'
    && project.length > 0
    && project.length <= 200
    && /^[\w\-\.\/@ ]+$/.test(project)
    && !project.includes('..');
}

/** Valida una stringa con lunghezza massima */
function isValidString(val: unknown, maxLen: number): val is string {
  return typeof val === 'string' && val.length <= maxLen;
}

// ── Express app ──
const app = express();

// Sicurezza: header HTTP protettivi
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.tailwindcss.com"],
      imgSrc: ["'self'", "data:"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'", "https://fonts.googleapis.com", "https://fonts.gstatic.com"],
      frameSrc: ["'none'"]
    }
  }
}));

// Sicurezza: CORS limitato a localhost
app.use(cors({
  origin: [
    `http://localhost:${PORT}`,
    `http://127.0.0.1:${PORT}`,
    `http://${HOST}:${PORT}`
  ],
  credentials: true,
  maxAge: 86400
}));

// Limite dimensione body: 1MB
app.use(express.json({ limit: '1mb' }));

// Rate limiting globale: 200 req/min per IP
app.use('/api/', rateLimit({
  windowMs: 60_000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, retry later' }
}));

// SSE clients (con limite massimo)
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
// per triggerare il broadcast SSE ai client della dashboard.
// Protetto da token condiviso per evitare broadcast non autorizzati.
const ALLOWED_EVENTS = new Set(['observation-created', 'summary-created', 'prompt-created', 'session-created']);

// Rate limit dedicato per /api/notify (più restrittivo)
const notifyLimiter = rateLimit({ windowMs: 60_000, max: 60, standardHeaders: true, legacyHeaders: false });

app.post('/api/notify', notifyLimiter, (req, res) => {
  // Verifica token di autenticazione
  const token = req.headers['x-worker-token'] as string;
  if (token !== WORKER_TOKEN) {
    res.status(401).json({ error: 'Invalid or missing X-Worker-Token' });
    return;
  }

  const { event, data } = req.body || {};
  if (!event || typeof event !== 'string' || !ALLOWED_EVENTS.has(event)) {
    res.status(400).json({ error: `Event must be one of: ${[...ALLOWED_EVENTS].join(', ')}` });
    return;
  }

  broadcast(event, data || {});
  res.json({ ok: true });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: Date.now(),
    version: '1.0.0'
  });
});

// SSE endpoint con keepalive e limite connessioni
app.get('/events', (req, res) => {
  if (clients.length >= MAX_SSE_CLIENTS) {
    res.status(503).json({ error: 'Too many SSE connections' });
    return;
  }

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

  if (!isValidProject(project)) {
    res.status(400).json({ error: 'Invalid project name' });
    return;
  }

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

// Store observation (con validazione input)
app.post('/api/observations', (req, res) => {
  const { memorySessionId, project, type, title, content, concepts, files } = req.body;

  // Validazione campi obbligatori
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

    // Genera embedding in background (fire-and-forget)
    generateEmbeddingForObservation(id, title, content, concepts).catch(() => {});

    res.json({ id, success: true });
  } catch (error) {
    logger.error('WORKER', 'Failed to store observation', {}, error as Error);
    res.status(500).json({ error: 'Failed to store observation' });
  }
});

// Store structured knowledge (constraint, decision, heuristic, rejected)
import { KNOWLEDGE_TYPES } from '../types/worker-types.js';
import type { KnowledgeMetadata } from '../types/worker-types.js';

app.post('/api/knowledge', (req, res) => {
  const { project, knowledge_type, title, content, concepts, files,
          severity, alternatives, reason, context: metaContext, confidence } = req.body;

  // Validazione campi obbligatori
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
    // Costruisci metadati JSON in base al tipo
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
      db.db,
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

    broadcast('observation-created', { id, project, title, type: knowledge_type });

    // Genera embedding in background (fire-and-forget)
    generateEmbeddingForObservation(id, title, content, concepts).catch(() => {});

    res.json({ id, success: true, knowledge_type });
  } catch (error) {
    logger.error('WORKER', 'Failed to store knowledge', {}, error as Error);
    res.status(500).json({ error: 'Failed to store knowledge' });
  }
});

// Store summary (con validazione input)
app.post('/api/summaries', (req, res) => {
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
      limit: parseIntSafe(limit, 20, 1, 100)
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

  const anchorId = parseIntSafe(anchor, 0, 1, Number.MAX_SAFE_INTEGER);
  if (anchorId === 0) {
    res.status(400).json({ error: 'Invalid "anchor" (must be positive integer)' });
    return;
  }

  try {
    const timeline = getTimeline(
      db.db,
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

// Batch fetch osservazioni per ID (max 100 elementi)
app.post('/api/observations/batch', (req, res) => {
  const { ids } = req.body;

  if (!ids || !Array.isArray(ids) || ids.length === 0 || ids.length > 100) {
    res.status(400).json({ error: '"ids" must be an array of 1-100 elements' });
    return;
  }
  // Valida che ogni elemento sia un intero positivo
  if (!ids.every((id: unknown) => typeof id === 'number' && Number.isInteger(id) && id > 0)) {
    res.status(400).json({ error: 'All IDs must be positive integers' });
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

  if (!isValidProject(project)) {
    res.status(400).json({ error: 'Invalid project name' });
    return;
  }

  try {
    const stats = getProjectStats(db.db, project);
    res.json(stats);
  } catch (error) {
    logger.error('WORKER', 'Stats fallite', { project }, error as Error);
    res.status(500).json({ error: 'Stats failed' });
  }
});

// ── Embedding e ricerca semantica ──

/** Genera embedding per un'osservazione (fire-and-forget) */
async function generateEmbeddingForObservation(
  observationId: number,
  title: string,
  content: string | null,
  concepts?: string[]
): Promise<void> {
  try {
    const embeddingService = getEmbeddingService();
    if (!embeddingService.isAvailable()) return;

    const parts = [title];
    if (content) parts.push(content);
    if (concepts?.length) parts.push(concepts.join(', '));
    const fullText = parts.join(' ').substring(0, 2000);

    const embedding = await embeddingService.embed(fullText);
    if (embedding) {
      const vectorSearch = getVectorSearch();
      await vectorSearch.storeEmbedding(
        db.db,
        observationId,
        embedding,
        embeddingService.getProvider() || 'unknown'
      );
    }
  } catch (error) {
    logger.debug('WORKER', `Embedding generation fallita per obs ${observationId}: ${error}`);
  }
}

// Ricerca ibrida (vector + keyword)
app.get('/api/hybrid-search', async (req, res) => {
  const { q, project, limit } = req.query as { q: string; project?: string; limit?: string };

  if (!q) {
    res.status(400).json({ error: 'Query parameter "q" is required' });
    return;
  }

  try {
    const hybridSearch = getHybridSearch();
    const results = await hybridSearch.search(db.db, q, {
      project: project || undefined,
      limit: parseIntSafe(limit, 10, 1, 100)
    });

    res.json({ results, count: results.length });
  } catch (error) {
    logger.error('WORKER', 'Ricerca ibrida fallita', { query: q }, error as Error);
    res.status(500).json({ error: 'Hybrid search failed' });
  }
});

// Backfill embeddings per osservazioni senza embedding
app.post('/api/embeddings/backfill', async (req, res) => {
  const { batchSize } = req.body || {};

  try {
    const vectorSearch = getVectorSearch();
    const count = await vectorSearch.backfillEmbeddings(
      db.db,
      parseIntSafe(String(batchSize), 50, 1, 500)
    );

    res.json({ success: true, generated: count });
  } catch (error) {
    logger.error('WORKER', 'Backfill embeddings fallito', {}, error as Error);
    res.status(500).json({ error: 'Backfill failed' });
  }
});

// Statistiche embeddings
app.get('/api/embeddings/stats', (_req, res) => {
  try {
    const vectorSearch = getVectorSearch();
    const stats = vectorSearch.getStats(db.db);
    const embeddingService = getEmbeddingService();

    res.json({
      ...stats,
      provider: embeddingService.getProvider(),
      dimensions: embeddingService.getDimensions(),
      available: embeddingService.isAvailable()
    });
  } catch (error) {
    logger.error('WORKER', 'Embedding stats fallite', {}, error as Error);
    res.status(500).json({ error: 'Stats failed' });
  }
});

// Lista osservazioni paginata
app.get('/api/observations', (req, res) => {
  const { offset, limit, project } = req.query as { offset?: string; limit?: string; project?: string };
  const _offset = parseIntSafe(offset, 0, 0, 1_000_000);
  const _limit = parseIntSafe(limit, 50, 1, 200);

  try {
    const countSql = project
      ? 'SELECT COUNT(*) as total FROM observations WHERE project = ?'
      : 'SELECT COUNT(*) as total FROM observations';
    const countStmt = db.db.query(countSql);
    const { total } = (project ? countStmt.get(project) : countStmt.get()) as { total: number };

    const sql = project
      ? 'SELECT * FROM observations WHERE project = ? ORDER BY created_at_epoch DESC LIMIT ? OFFSET ?'
      : 'SELECT * FROM observations ORDER BY created_at_epoch DESC LIMIT ? OFFSET ?';
    const stmt = db.db.query(sql);
    const rows = project ? stmt.all(project, _limit, _offset) : stmt.all(_limit, _offset);
    res.setHeader('X-Total-Count', total);
    res.json(rows);
  } catch (error) {
    logger.error('WORKER', 'Lista osservazioni fallita', {}, error as Error);
    res.status(500).json({ error: 'Failed to list observations' });
  }
});

// Lista summary paginata
app.get('/api/summaries', (req, res) => {
  const { offset, limit, project } = req.query as { offset?: string; limit?: string; project?: string };
  const _offset = parseIntSafe(offset, 0, 0, 1_000_000);
  const _limit = parseIntSafe(limit, 20, 1, 200);

  try {
    const countSql = project
      ? 'SELECT COUNT(*) as total FROM summaries WHERE project = ?'
      : 'SELECT COUNT(*) as total FROM summaries';
    const countStmt = db.db.query(countSql);
    const { total } = (project ? countStmt.get(project) : countStmt.get()) as { total: number };

    const sql = project
      ? 'SELECT * FROM summaries WHERE project = ? ORDER BY created_at_epoch DESC LIMIT ? OFFSET ?'
      : 'SELECT * FROM summaries ORDER BY created_at_epoch DESC LIMIT ? OFFSET ?';
    const stmt = db.db.query(sql);
    const rows = project ? stmt.all(project, _limit, _offset) : stmt.all(_limit, _offset);
    res.setHeader('X-Total-Count', total);
    res.json(rows);
  } catch (error) {
    logger.error('WORKER', 'Lista summary fallita', {}, error as Error);
    res.status(500).json({ error: 'Failed to list summaries' });
  }
});

// Lista prompt paginata
app.get('/api/prompts', (req, res) => {
  const { offset, limit, project } = req.query as { offset?: string; limit?: string; project?: string };
  const _offset = parseIntSafe(offset, 0, 0, 1_000_000);
  const _limit = parseIntSafe(limit, 20, 1, 200);

  try {
    const countSql = project
      ? 'SELECT COUNT(*) as total FROM prompts WHERE project = ?'
      : 'SELECT COUNT(*) as total FROM prompts';
    const countStmt = db.db.query(countSql);
    const { total } = (project ? countStmt.get(project) : countStmt.get()) as { total: number };

    const sql = project
      ? 'SELECT * FROM prompts WHERE project = ? ORDER BY created_at_epoch DESC LIMIT ? OFFSET ?'
      : 'SELECT * FROM prompts ORDER BY created_at_epoch DESC LIMIT ? OFFSET ?';
    const stmt = db.db.query(sql);
    const rows = project ? stmt.all(project, _limit, _offset) : stmt.all(_limit, _offset);
    res.setHeader('X-Total-Count', total);
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

// ── Analytics endpoints ──

app.get('/api/analytics/overview', (req, res) => {
  const { project } = req.query as { project?: string };

  if (project && !isValidProject(project)) {
    res.status(400).json({ error: 'Invalid project name' });
    return;
  }

  try {
    const overview = getAnalyticsOverview(db.db, project || undefined);
    res.json(overview);
  } catch (error) {
    logger.error('WORKER', 'Analytics overview fallita', { project }, error as Error);
    res.status(500).json({ error: 'Analytics overview failed' });
  }
});

app.get('/api/analytics/timeline', (req, res) => {
  const { project, days } = req.query as { project?: string; days?: string };

  if (project && !isValidProject(project)) {
    res.status(400).json({ error: 'Invalid project name' });
    return;
  }

  try {
    const timeline = getObservationsTimeline(
      db.db,
      project || undefined,
      parseIntSafe(days, 30, 1, 365)
    );
    res.json(timeline);
  } catch (error) {
    logger.error('WORKER', 'Analytics timeline fallita', { project }, error as Error);
    res.status(500).json({ error: 'Analytics timeline failed' });
  }
});

app.get('/api/analytics/types', (req, res) => {
  const { project } = req.query as { project?: string };

  if (project && !isValidProject(project)) {
    res.status(400).json({ error: 'Invalid project name' });
    return;
  }

  try {
    const distribution = getTypeDistribution(db.db, project || undefined);
    res.json(distribution);
  } catch (error) {
    logger.error('WORKER', 'Analytics types fallita', { project }, error as Error);
    res.status(500).json({ error: 'Analytics types failed' });
  }
});

app.get('/api/analytics/sessions', (req, res) => {
  const { project } = req.query as { project?: string };

  if (project && !isValidProject(project)) {
    res.status(400).json({ error: 'Invalid project name' });
    return;
  }

  try {
    const stats = getSessionStats(db.db, project || undefined);
    res.json(stats);
  } catch (error) {
    logger.error('WORKER', 'Analytics sessions fallita', { project }, error as Error);
    res.status(500).json({ error: 'Analytics sessions failed' });
  }
});

// ── Checkpoint & Session Resume endpoints ──

app.get('/api/sessions', (req, res) => {
  const { project } = req.query as { project?: string };

  if (project && !isValidProject(project)) {
    res.status(400).json({ error: 'Invalid project name' });
    return;
  }

  try {
    const sessions = project
      ? getSessionsByProject(db.db, project, 50)
      : getActiveSessions(db.db);
    res.json(sessions);
  } catch (error) {
    logger.error('WORKER', 'Lista sessioni fallita', { project }, error as Error);
    res.status(500).json({ error: 'Sessions list failed' });
  }
});

app.get('/api/sessions/:id/checkpoint', (req, res) => {
  const sessionId = parseInt(req.params.id, 10);

  if (isNaN(sessionId) || sessionId <= 0) {
    res.status(400).json({ error: 'Invalid session ID' });
    return;
  }

  try {
    const checkpoint = getLatestCheckpoint(db.db, sessionId);
    if (!checkpoint) {
      res.status(404).json({ error: 'No checkpoint found for this session' });
      return;
    }
    res.json(checkpoint);
  } catch (error) {
    logger.error('WORKER', 'Checkpoint fetch fallito', { sessionId }, error as Error);
    res.status(500).json({ error: 'Checkpoint fetch failed' });
  }
});

app.get('/api/checkpoint', (req, res) => {
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
    const checkpoint = getLatestCheckpointByProject(db.db, project);
    if (!checkpoint) {
      res.status(404).json({ error: 'No checkpoint found for this project' });
      return;
    }
    res.json(checkpoint);
  } catch (error) {
    logger.error('WORKER', 'Checkpoint per progetto fallito', { project }, error as Error);
    res.status(500).json({ error: 'Project checkpoint fetch failed' });
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
