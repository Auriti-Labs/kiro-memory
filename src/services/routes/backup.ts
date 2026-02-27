/**
 * Router Backup: gestione backup database SQLite.
 *
 * Endpoints:
 *   GET  /api/backup/list    — Elenca backup con metadata
 *   POST /api/backup/create  — Crea backup manuale
 *   POST /api/backup/restore — Ripristina da backup (richiede X-Worker-Token)
 */

import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { join } from 'path';
import type { WorkerContext } from '../worker-context.js';
import { createBackup, listBackups, restoreBackup, rotateBackups } from '../sqlite/Backup.js';
import { getConfigValue } from '../../cli/cli-utils.js';
import { DB_PATH, BACKUPS_DIR } from '../../shared/paths.js';
import { logger } from '../../utils/logger.js';

export function createBackupRouter(ctx: WorkerContext, workerToken?: string): Router {
  const router = Router();

  /** Middleware: richiede X-Worker-Token per operazioni distruttive */
  function requireAuth(
    req: Request,
    res: Response,
    next: NextFunction
  ): void {
    if (!workerToken) { next(); return; }
    const token = req.headers['x-worker-token'] as string;
    if (token !== workerToken) {
      res.status(401).json({ error: 'X-Worker-Token non valido o mancante' });
      return;
    }
    next();
  }

  // ── GET /api/backup/list ──

  /**
   * Elenca i backup presenti nella directory backup.
   * Ritorna array ordinato dal più recente al più vecchio.
   */
  router.get('/api/backup/list', (_req, res) => {
    try {
      const entries = listBackups(BACKUPS_DIR);
      const items = entries.map(e => ({
        filename: e.metadata.filename,
        timestamp: e.metadata.timestamp,
        timestampEpoch: e.metadata.timestampEpoch,
        schemaVersion: e.metadata.schemaVersion,
        stats: e.metadata.stats,
        filePath: e.filePath,
      }));
      res.json({ backups: items, total: items.length, backupDir: BACKUPS_DIR });
    } catch (error) {
      logger.error('BACKUP', 'Elenco backup fallito', {}, error as Error);
      res.status(500).json({ error: 'Impossibile elencare i backup' });
    }
  });

  // ── POST /api/backup/create ──

  /**
   * Crea un backup manuale del database.
   * Esegue automaticamente la rotazione dopo la creazione.
   */
  router.post('/api/backup/create', (_req, res) => {
    try {
      const maxKeep = Number(getConfigValue('backup.maxKeep')) || 7;
      const entry = createBackup(DB_PATH, BACKUPS_DIR, ctx.db.db);

      // Rotazione automatica dopo la creazione
      const deleted = rotateBackups(BACKUPS_DIR, maxKeep);

      logger.info('BACKUP', `Backup manuale creato: ${entry.metadata.filename}`);
      res.json({
        success: true,
        filename: entry.metadata.filename,
        timestamp: entry.metadata.timestamp,
        stats: entry.metadata.stats,
        rotated: deleted,
      });
    } catch (error) {
      logger.error('BACKUP', 'Creazione backup fallita', {}, error as Error);
      res.status(500).json({ error: 'Creazione backup fallita' });
    }
  });

  // ── POST /api/backup/restore ──

  /**
   * Ripristina il database da un file di backup.
   *
   * Body: { "file": "backup-2026-02-27-150000.db" }
   *
   * ATTENZIONE: questa operazione sovrascrive il database corrente.
   * Richiede X-Worker-Token per autorizzazione.
   */
  router.post('/api/backup/restore', requireAuth, (req, res) => {
    const { file } = req.body as { file?: string };

    // Validazione del nome file: solo backup validi
    if (!file || typeof file !== 'string') {
      res.status(400).json({ error: 'Campo "file" obbligatorio' });
      return;
    }

    // Sicurezza: impedisce path traversal — accetta solo nomi backup validi
    const backupFilePattern = /^backup-\d{4}-\d{2}-\d{2}-\d{6}(-\d{3})?\.db$/;
    if (file.includes('/') || file.includes('..') || !backupFilePattern.test(file)) {
      res.status(400).json({ error: 'Nome file non valido (deve essere "backup-YYYY-MM-DD-HHmmss[-mmm].db")' });
      return;
    }

    try {
      // Verifica che il backup esista nell'elenco autorizzato
      const entries = listBackups(BACKUPS_DIR);
      const found = entries.find(e => e.metadata.filename === file);
      if (!found) {
        res.status(404).json({ error: `Backup non trovato: ${file}` });
        return;
      }

      restoreBackup(found.filePath, DB_PATH);

      logger.info('BACKUP', `Database ripristinato da: ${file}`);
      res.json({
        success: true,
        restoredFrom: file,
        timestamp: found.metadata.timestamp,
        message: 'Database ripristinato. Riavviare il worker per applicare le modifiche.',
      });
    } catch (error) {
      logger.error('BACKUP', `Ripristino backup fallito: ${file}`, {}, error as Error);
      res.status(500).json({ error: 'Ripristino backup fallito' });
    }
  });

  return router;
}
