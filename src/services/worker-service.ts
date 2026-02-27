/**
 * Kiro Memory Worker Service
 *
 * Orchestratore snello: configura Express, monta router modulari,
 * gestisce lifecycle (PID, shutdown, error handling).
 *
 * Route definite in src/services/routes/:
 *   core.ts         — health, SSE, notify
 *   observations.ts — CRUD osservazioni, knowledge, memory save
 *   summaries.ts    — CRUD summary
 *   search.ts       — FTS5, ricerca ibrida, timeline
 *   analytics.ts    — overview, timeline, types, sessions
 *   sessions.ts     — sessioni, checkpoint, prompts
 *   projects.ts     — lista progetti, alias, stats
 *   data.ts         — embeddings, retention, export, report
 */

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import crypto from 'crypto';
import { join, dirname } from 'path';
import { existsSync, mkdirSync, writeFileSync, unlinkSync, chmodSync } from 'fs';
import { fileURLToPath } from 'url';
import { KiroMemoryDatabase } from './sqlite/Database.js';
import { getHybridSearch } from './search/HybridSearch.js';
import { createWorkerContext, getClients } from './worker-context.js';
import { logger } from '../utils/logger.js';
import { DATA_DIR } from '../shared/paths.js';

// Router modulari
import { createCoreRouter } from './routes/core.js';
import { createObservationsRouter } from './routes/observations.js';
import { createSummariesRouter } from './routes/summaries.js';
import { createSearchRouter } from './routes/search.js';
import { createAnalyticsRouter } from './routes/analytics.js';
import { createSessionsRouter } from './routes/sessions.js';
import { createProjectsRouter } from './routes/projects.js';
import { createDataRouter } from './routes/data.js';

// ── Configurazione ──

const __worker_dirname = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.KIRO_MEMORY_WORKER_PORT || process.env.CONTEXTKIT_WORKER_PORT || 3001;
const HOST = process.env.KIRO_MEMORY_WORKER_HOST || process.env.CONTEXTKIT_WORKER_HOST || '127.0.0.1';
const PID_FILE = join(DATA_DIR, 'worker.pid');
const TOKEN_FILE = join(DATA_DIR, 'worker.token');

// ── Inizializzazione ──

if (!existsSync(DATA_DIR)) {
  mkdirSync(DATA_DIR, { recursive: true });
}

// Token autenticazione hook → worker
const WORKER_TOKEN = crypto.randomBytes(32).toString('hex');
writeFileSync(TOKEN_FILE, WORKER_TOKEN, 'utf-8');
try {
  chmodSync(TOKEN_FILE, 0o600);
} catch (err) {
  if (process.platform !== 'win32') {
    logger.warn('WORKER', `chmod 600 fallito su ${TOKEN_FILE}`, {}, err as Error);
  }
}

// Database
const db = new KiroMemoryDatabase();
logger.info('WORKER', 'Database inizializzato');

// Embedding service (lazy, non bloccante)
getHybridSearch().initialize().catch(err => {
  logger.warn('WORKER', 'Inizializzazione embedding fallita, ricerca solo FTS5', {}, err as Error);
});

// Contesto condiviso per tutti i router
const ctx = createWorkerContext(db);

// ── Express app ──

const app = express();

// Sicurezza: header HTTP protettivi
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      imgSrc: ["'self'", "data:"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      frameSrc: ["'none'"]
    }
  }
}));

// CORS limitato a localhost
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

// ── Monta router modulari ──

app.use(createCoreRouter(ctx, WORKER_TOKEN));
app.use(createObservationsRouter(ctx));
app.use(createSummariesRouter(ctx));
app.use(createSearchRouter(ctx));
app.use(createAnalyticsRouter(ctx));
app.use(createSessionsRouter(ctx));
app.use(createProjectsRouter(ctx));
app.use(createDataRouter(ctx, WORKER_TOKEN));

// ── File statici e viewer ──

app.use(express.static(__worker_dirname, {
  index: false,
  maxAge: '1h'
}));

app.get('/', (_req, res) => {
  const viewerPath = join(__worker_dirname, 'viewer.html');
  if (existsSync(viewerPath)) {
    res.sendFile(viewerPath);
  } else {
    res.status(404).json({ error: 'Viewer not found. Run npm run build first.' });
  }
});

// ── Avvio server ──

const server = app.listen(Number(PORT), HOST, () => {
  logger.info('WORKER', `Kiro Memory worker avviato su http://${HOST}:${PORT}`);
  writeFileSync(PID_FILE, String(process.pid), 'utf-8');
});

// ── Graceful shutdown ──

function shutdown(signal: string): void {
  logger.info('WORKER', `Ricevuto ${signal}, arresto in corso...`);

  // Chiudi tutti i client SSE per sbloccare server.close()
  const sseClients = getClients();
  for (const client of sseClients) {
    try { client.end(); } catch { /* ignora errori su client già chiusi */ }
  }

  // Timeout forzato: se server.close() non completa in 5s, forza exit
  const forceTimeout = setTimeout(() => {
    logger.warn('WORKER', 'Shutdown forzato dopo timeout 5s');
    if (existsSync(PID_FILE)) unlinkSync(PID_FILE);
    db.close();
    process.exit(1);
  }, 5000);

  server.close(() => {
    clearTimeout(forceTimeout);
    logger.info('WORKER', 'Server chiuso');

    if (existsSync(PID_FILE)) {
      unlinkSync(PID_FILE);
    }

    db.close();
    process.exit(0);
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

process.on('uncaughtException', (error) => {
  logger.error('WORKER', 'Eccezione non gestita', {}, error);
  shutdown('uncaughtException');
});

process.on('unhandledRejection', (reason) => {
  logger.error('WORKER', 'Promise rejection non gestita', { reason }, reason as Error);
});
