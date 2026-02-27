/**
 * Router Webhooks GitHub: riceve eventi, valida la firma HMAC-SHA256,
 * persiste i link nella tabella github_links, espone API di query.
 *
 * Endpoints:
 *   POST /api/webhooks/github  — ricevitore eventi GitHub
 *   GET  /api/github/links     — query links (filtri: repo, issue, pr, observation_id, limit)
 *   GET  /api/github/repos     — lista repo con conteggio link
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import crypto from 'crypto';
import rateLimit from 'express-rate-limit';
import type { WorkerContext } from '../worker-context.js';
import { parseIntSafe } from '../worker-context.js';
import {
  createGithubLink,
  getGithubLinksByObservation,
  getGithubLinksByRepo,
  getGithubLinksByIssue,
  getGithubLinksByPR,
  searchGithubLinks,
  listReposWithLinkCount,
} from '../sqlite/GithubLinks.js';
import { logger } from '../../utils/logger.js';

// ── Costanti ──

// Regex per rilevare riferimenti a issue/PR nei messaggi di commit (#NNN)
const ISSUE_REF_REGEX = /#(\d+)/g;

// Tipi di evento supportati
const SUPPORTED_EVENTS = new Set(['issues', 'pull_request', 'push']);

// Azioni supportate per issues
const ISSUE_ACTIONS = new Set(['opened', 'closed', 'reopened', 'labeled']);

// Azioni supportate per pull_request
const PR_ACTIONS = new Set(['opened', 'closed', 'reopened', 'review_requested', 'merged']);

// ── Helpers ──

/**
 * Recupera il segreto webhook dalla configurazione o dalla variabile d'ambiente.
 * Restituisce null se non configurato (webhook non autenticati saranno rifiutati).
 */
function getWebhookSecret(ctx: WorkerContext): string | null {
  // Prova prima dal context config, poi dalla variabile d'ambiente
  try {
    const fromConfig = (ctx as any).getConfig?.('github.webhook_secret');
    if (fromConfig && typeof fromConfig === 'string' && fromConfig.trim().length > 0) {
      return fromConfig.trim();
    }
  } catch {
    // getConfig non disponibile in tutti i contesti, ignora
  }
  return process.env.KIRO_MEMORY_GITHUB_WEBHOOK_SECRET || null;
}

/**
 * Valida la firma HMAC-SHA256 del payload GitHub.
 * GitHub invia l'header X-Hub-Signature-256: sha256=<hex>
 * Usa confronto timing-safe per prevenire timing attacks.
 */
export function validateGithubSignature(
  payload: Buffer,
  signature: string | undefined,
  secret: string
): boolean {
  if (!signature || !signature.startsWith('sha256=')) {
    return false;
  }

  const expectedSignature = 'sha256=' + crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');

  // Confronto timing-safe (evita timing side-channel)
  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature, 'utf-8'),
      Buffer.from(expectedSignature, 'utf-8')
    );
  } catch {
    // Le stringhe hanno lunghezze diverse — firma non valida
    return false;
  }
}

/**
 * Estrae i riferimenti a issue/PR (#NNN) da una stringa di testo.
 * Restituisce un array di numeri interi unici.
 */
export function extractIssueRefs(text: string): number[] {
  const refs = new Set<number>();
  const regex = /#(\d+)/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    const num = parseInt(match[1], 10);
    if (num > 0 && num < 1_000_000) {
      refs.add(num);
    }
  }
  return Array.from(refs);
}

// ── Processori eventi (asincroni, fire-and-forget) ──

/**
 * Processa un evento issues di GitHub.
 * Crea un github_link per ogni azione supported.
 */
function processIssuesEvent(ctx: WorkerContext, payload: any, repo: string): void {
  const { action, issue } = payload;
  if (!ISSUE_ACTIONS.has(action) || !issue) return;

  try {
    createGithubLink(ctx.db.db, {
      repo,
      issue_number: issue.number,
      event_type: 'issues',
      action,
      title: issue.title || null,
      url: issue.html_url || null,
      author: issue.user?.login || null,
    });
    logger.debug('WEBHOOK', `Issue #${issue.number} (${action}) salvato per ${repo}`);
  } catch (err) {
    logger.error('WEBHOOK', `Errore salvataggio issue event per ${repo}`, {}, err as Error);
  }
}

/**
 * Processa un evento pull_request di GitHub.
 * Gestisce lo stato merged distinguendolo da closed.
 */
function processPullRequestEvent(ctx: WorkerContext, payload: any, repo: string): void {
  const { action, pull_request: pr } = payload;
  if (!pr) return;

  // GitHub segnala il merge come action=closed con merged=true
  const effectiveAction = action === 'closed' && pr.merged ? 'merged' : action;
  if (!PR_ACTIONS.has(effectiveAction)) return;

  try {
    createGithubLink(ctx.db.db, {
      repo,
      pr_number: pr.number,
      event_type: 'pull_request',
      action: effectiveAction,
      title: pr.title || null,
      url: pr.html_url || null,
      author: pr.user?.login || null,
    });
    logger.debug('WEBHOOK', `PR #${pr.number} (${effectiveAction}) salvato per ${repo}`);
  } catch (err) {
    logger.error('WEBHOOK', `Errore salvataggio PR event per ${repo}`, {}, err as Error);
  }
}

/**
 * Processa un evento push di GitHub.
 * Scansiona i messaggi di commit alla ricerca di riferimenti #NNN.
 * Per ogni riferimento trovato crea un github_link.
 */
function processPushEvent(ctx: WorkerContext, payload: any, repo: string): void {
  const { commits, pusher, ref } = payload;
  if (!Array.isArray(commits) || commits.length === 0) return;

  const branch = typeof ref === 'string' ? ref.replace('refs/heads/', '') : null;
  const author = pusher?.name || null;

  for (const commit of commits) {
    const message: string = commit.message || '';
    const commitUrl: string = commit.url || null;
    const issueRefs = extractIssueRefs(message);

    for (const issueNumber of issueRefs) {
      try {
        createGithubLink(ctx.db.db, {
          repo,
          issue_number: issueNumber,
          event_type: 'push',
          action: branch ? `push:${branch}` : 'push',
          title: message.split('\n')[0].substring(0, 500) || null,
          url: commitUrl,
          author,
        });
        logger.debug('WEBHOOK', `Riferimento issue #${issueNumber} trovato nel commit di ${repo}`);
      } catch (err) {
        logger.error('WEBHOOK', `Errore salvataggio push ref per ${repo}`, {}, err as Error);
      }
    }
  }
}

// ── Middleware raw body ────────────────────────────────────────────────────────
// Legge il body come Buffer prima che express.json() lo consumi,
// necessario per la validazione HMAC della firma GitHub.

function rawBodyMiddleware(req: Request, _res: Response, next: () => void): void {
  const chunks: Buffer[] = [];

  req.on('data', (chunk: Buffer) => {
    chunks.push(chunk);
  });

  req.on('end', () => {
    const rawBody = Buffer.concat(chunks);
    (req as any).rawBody = rawBody;

    // Parsa il JSON manualmente se il Content-Type lo indica
    const contentType = req.headers['content-type'] || '';
    if (contentType.includes('application/json') && rawBody.length > 0) {
      try {
        req.body = JSON.parse(rawBody.toString('utf-8'));
      } catch {
        req.body = {};
      }
    }

    next();
  });

  req.on('error', () => {
    (req as any).rawBody = Buffer.alloc(0);
    next();
  });
}

// ── Router factory ──

export function createWebhooksRouter(ctx: WorkerContext): Router {
  const router = Router();

  // Rate limit dedicato per il webhook: 30 req/min
  const webhookLimiter = rateLimit({
    windowMs: 60_000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Troppo molte richieste al webhook, riprova tra poco' }
  });

  // ── POST /api/webhooks/github ──────────────────────────────────────────────
  // Ricevitore principale degli eventi GitHub webhook.
  // Risponde 200 immediatamente, processa il payload in background.
  router.post(
    '/api/webhooks/github',
    webhookLimiter,
    rawBodyMiddleware,
    (req: Request, res: Response) => {
      const secret = getWebhookSecret(ctx);

      // Se il segreto è configurato, valida la firma
      if (secret) {
        const signature = req.headers['x-hub-signature-256'] as string | undefined;
        const rawBody: Buffer = (req as any).rawBody;

        if (!rawBody) {
          res.status(400).json({ error: 'Payload non leggibile' });
          return;
        }

        if (!validateGithubSignature(rawBody, signature, secret)) {
          logger.warn('WEBHOOK', 'Firma GitHub non valida', {
            hasSignature: !!signature,
          });
          res.status(401).json({ error: 'Firma non valida o mancante' });
          return;
        }
      }

      const eventType = req.headers['x-github-event'] as string | undefined;

      if (!eventType || !SUPPORTED_EVENTS.has(eventType)) {
        // Accetta silenziosamente gli eventi non gestiti (GitHub li invia comunque)
        res.json({ ok: true, processed: false, reason: 'Evento non gestito' });
        return;
      }

      // Risponde subito con 200 — GitHub si aspetta una risposta rapida
      res.json({ ok: true, processed: true });

      // Elaborazione asincrona del payload (fire-and-forget)
      setImmediate(() => {
        try {
          const payload = req.body;
          if (!payload || typeof payload !== 'object') return;

          // Estrae il nome del repository dal payload
          const repo: string = payload.repository?.full_name
            || payload.repository?.name
            || 'unknown';

          switch (eventType) {
            case 'issues':
              processIssuesEvent(ctx, payload, repo);
              break;
            case 'pull_request':
              processPullRequestEvent(ctx, payload, repo);
              break;
            case 'push':
              processPushEvent(ctx, payload, repo);
              break;
          }
        } catch (err) {
          logger.error('WEBHOOK', 'Errore elaborazione evento webhook', {}, err as Error);
        }
      });
    }
  );

  // ── GET /api/github/links ──────────────────────────────────────────────────
  // Query sui link GitHub con filtri opzionali.
  // Parametri: repo, issue, pr, observation_id, query, limit (default 20, max 200)
  router.get('/api/github/links', (req: Request, res: Response) => {
    const { repo, issue, pr, observation_id, query } = req.query as {
      repo?: string;
      issue?: string;
      pr?: string;
      observation_id?: string;
      query?: string;
    };
    const limit = parseIntSafe(req.query.limit as string | undefined, 20, 1, 200);

    try {
      let links;

      if (observation_id) {
        // Filtro per observation
        const obsId = parseInt(observation_id, 10);
        if (isNaN(obsId) || obsId <= 0) {
          res.status(400).json({ error: '"observation_id" deve essere un intero positivo' });
          return;
        }
        links = getGithubLinksByObservation(ctx.db.db, obsId);
      } else if (repo && issue) {
        // Filtro per repo + issue
        const issueNum = parseInt(issue, 10);
        if (isNaN(issueNum) || issueNum <= 0) {
          res.status(400).json({ error: '"issue" deve essere un intero positivo' });
          return;
        }
        links = getGithubLinksByIssue(ctx.db.db, repo, issueNum);
      } else if (repo && pr) {
        // Filtro per repo + PR
        const prNum = parseInt(pr, 10);
        if (isNaN(prNum) || prNum <= 0) {
          res.status(400).json({ error: '"pr" deve essere un intero positivo' });
          return;
        }
        links = getGithubLinksByPR(ctx.db.db, repo, prNum);
      } else if (repo) {
        // Filtro per repo con limit
        links = getGithubLinksByRepo(ctx.db.db, repo, limit);
      } else {
        // Ricerca testuale generica
        links = searchGithubLinks(ctx.db.db, query || '', { limit });
      }

      res.json({ links, total: links.length });
    } catch (err) {
      logger.error('WORKER', 'Errore query github links', {}, err as Error);
      res.status(500).json({ error: 'Errore nel recupero dei link GitHub' });
    }
  });

  // ── GET /api/github/repos ──────────────────────────────────────────────────
  // Lista i repository che hanno generato eventi webhook,
  // con il conteggio dei link e la data dell'ultimo evento.
  router.get('/api/github/repos', (_req: Request, res: Response) => {
    try {
      const repos = listReposWithLinkCount(ctx.db.db);
      res.json({ repos });
    } catch (err) {
      logger.error('WORKER', 'Errore query github repos', {}, err as Error);
      res.status(500).json({ error: 'Errore nel recupero dei repository' });
    }
  });

  return router;
}
