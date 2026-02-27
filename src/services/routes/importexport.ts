/**
 * Router Import/Export JSONL.
 *
 * Endpoints:
 *   GET  /api/export  — Export streaming JSONL con filtri (project, type, from, to)
 *   POST /api/import  — Import JSONL dal body (con dry-run opzionale)
 */

import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import type { WorkerContext } from '../worker-context.js';
import { isValidProject } from '../worker-context.js';
import {
  generateMetaRecord,
  exportObservationsStreaming,
  exportSummariesStreaming,
  exportPromptsStreaming,
  importJsonl,
  type ExportFilters,
} from '../sqlite/ImportExport.js';
import { logger } from '../../utils/logger.js';

export function createImportExportRouter(ctx: WorkerContext): Router {
  const router = Router();

  // ── GET /api/export ──

  /**
   * Esporta il database in formato JSONL streaming.
   *
   * Query params:
   *   - project: filtra per progetto (opzionale)
   *   - type: filtra per tipo observation (opzionale)
   *   - from: data inizio ISO (opzionale)
   *   - to: data fine ISO (opzionale)
   *
   * Risposta: text/plain con Content-Disposition: attachment
   * Prima riga: record _meta con statistiche e filtri
   * Righe seguenti: observations, summaries, prompts
   */
  router.get('/api/export', (req, res) => {
    const { project, type, from, to } = req.query as {
      project?: string;
      type?: string;
      from?: string;
      to?: string;
    };

    // Validazione progetto
    if (project && !isValidProject(project)) {
      res.status(400).json({ error: 'Nome progetto non valido' });
      return;
    }

    // Validazione date
    if (from && isNaN(new Date(from).getTime())) {
      res.status(400).json({ error: 'Parametro "from" non è una data ISO valida' });
      return;
    }
    if (to && isNaN(new Date(to).getTime())) {
      res.status(400).json({ error: 'Parametro "to" non è una data ISO valida' });
      return;
    }

    const filters: ExportFilters = {};
    if (project) filters.project = project;
    if (type) filters.type = type;
    if (from) filters.from = from;
    if (to) filters.to = to;

    // Nome file per download
    const dateStr = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
    const projectSlug = project ? `_${project.replace(/[^a-z0-9]/gi, '_')}` : '';
    const filename = `kiro-memory${projectSlug}_${dateStr}.jsonl`;

    try {
      // Imposta header per streaming
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Transfer-Encoding', 'chunked');
      res.setHeader('X-Content-Type-Options', 'nosniff');

      const db = ctx.db.db;

      // Prima riga: metadati
      res.write(generateMetaRecord(db, filters) + '\n');

      // Export streaming observations
      exportObservationsStreaming(db, filters, (line) => {
        res.write(line + '\n');
      });

      // Export streaming summaries
      exportSummariesStreaming(db, filters, (line) => {
        res.write(line + '\n');
      });

      // Export streaming prompts
      exportPromptsStreaming(db, filters, (line) => {
        res.write(line + '\n');
      });

      res.end();

      logger.info('WORKER', `Export JSONL completato: project=${project || 'all'}, from=${from || '-'}, to=${to || '-'}`);
    } catch (error) {
      logger.error('WORKER', 'Export JSONL fallito', { project, from, to }, error as Error);
      // Se gli header non sono stati inviati, rispondi con errore JSON
      if (!res.headersSent) {
        res.status(500).json({ error: 'Export JSONL fallito' });
      } else {
        res.end();
      }
    }
  });

  // ── POST /api/import ──

  /**
   * Importa un file JSONL inviato nel body.
   *
   * Body: testo JSONL (Content-Type: text/plain oppure application/json con campo "content")
   *
   * Query params:
   *   - dry_run=true: mostra il conteggio senza inserire
   *
   * Risposta JSON:
   *   { imported, skipped, errors, total, dryRun, errorDetails[] }
   */
  router.post('/api/import', express_text_middleware, (req, res) => {
    const dryRun = req.query.dry_run === 'true' || req.query.dry_run === '1';

    // Recupera il contenuto JSONL dal body
    let content: string;

    if (typeof req.body === 'string') {
      // Content-Type: text/plain
      content = req.body;
    } else if (req.body && typeof req.body === 'object' && typeof req.body.content === 'string') {
      // Content-Type: application/json con campo "content"
      content = req.body.content;
    } else {
      res.status(400).json({ error: 'Body deve essere testo JSONL (text/plain) o JSON con campo "content"' });
      return;
    }

    if (!content || content.trim().length === 0) {
      res.status(400).json({ error: 'Body vuoto: nessun dato da importare' });
      return;
    }

    // Limite dimensione: 50MB
    const MAX_IMPORT_BYTES = 50 * 1024 * 1024;
    if (content.length > MAX_IMPORT_BYTES) {
      res.status(413).json({ error: `File troppo grande: max ${MAX_IMPORT_BYTES / 1024 / 1024}MB` });
      return;
    }

    try {
      const result = importJsonl(ctx.db.db, content, dryRun);

      logger.info('WORKER', `Import JSONL: ${result.imported} importati, ${result.skipped} saltati, ${result.errors} errori (dryRun=${dryRun})`);

      // Invalida cache progetti se abbiamo inserito nuovi record
      if (!dryRun && result.imported > 0) {
        ctx.invalidateProjectsCache();
      }

      res.json({
        success: true,
        dryRun,
        imported: result.imported,
        skipped: result.skipped,
        errors: result.errors,
        total: result.total,
        errorDetails: result.errorDetails.slice(0, 50), // max 50 dettagli di errore
      });
    } catch (error) {
      logger.error('WORKER', 'Import JSONL fallito', { dryRun }, error as Error);
      res.status(500).json({ error: 'Import JSONL fallito' });
    }
  });

  return router;
}

/**
 * Middleware per accettare body text/plain oltre a application/json.
 * Necessario perché Express di default parsa solo JSON.
 */
function express_text_middleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const contentType = req.headers['content-type'] || '';

  // Se il body è già parsato come oggetto (application/json), vai avanti
  if (typeof req.body === 'object' && req.body !== null) {
    next();
    return;
  }

  // Altrimenti, leggi il body come testo
  if (contentType.includes('text/plain') || contentType.includes('application/octet-stream') || !contentType) {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      req.body = Buffer.concat(chunks).toString('utf-8');
      next();
    });
    req.on('error', (err) => {
      res.status(400).json({ error: `Errore lettura body: ${err.message}` });
    });
  } else {
    next();
  }
}
