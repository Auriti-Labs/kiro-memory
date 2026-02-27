import { Database } from 'bun:sqlite';
import type { IJobHandler } from './JobQueue.js';
import { consolidateObservations } from '../sqlite/Observations.js';
import { logger } from '../../utils/logger.js';

/**
 * Embedding generation handler.
 *
 * Finds observations that do not yet have an embedding and returns their IDs
 * so the caller (or a follow-up stage) can generate the actual vectors.
 * The actual vector computation is handled by EmbeddingService and requires
 * a model to be loaded — this handler only discovers which rows need work.
 */
export const embeddingHandler: IJobHandler = {
  type: 'embedding',
  timeout: 60_000,

  async execute(payload: { observationIds?: number[]; project?: string }, db: Database) {
    let sql: string;
    let params: any[];

    if (payload.observationIds && payload.observationIds.length > 0) {
      // Process a specific list of observation IDs
      const placeholders = payload.observationIds.map(() => '?').join(',');
      sql = `SELECT o.id FROM observations o
             LEFT JOIN observation_embeddings oe ON o.id = oe.observation_id
             WHERE oe.observation_id IS NULL AND o.id IN (${placeholders})
             LIMIT 100`;
      params = payload.observationIds;
    } else if (payload.project) {
      // Process all un-embedded observations for a project
      sql = `SELECT o.id FROM observations o
             LEFT JOIN observation_embeddings oe ON o.id = oe.observation_id
             WHERE oe.observation_id IS NULL AND o.project = ?
             LIMIT 100`;
      params = [payload.project];
    } else {
      // Process any un-embedded observations across all projects
      sql = `SELECT o.id FROM observations o
             LEFT JOIN observation_embeddings oe ON o.id = oe.observation_id
             WHERE oe.observation_id IS NULL
             LIMIT 100`;
      params = [];
    }

    const rows = db.query(sql).all(...params) as Array<{ id: number }>;
    logger.info('QUEUE', `Embedding job: found ${rows.length} observations without embeddings`);

    return { processed: rows.length, ids: rows.map(r => r.id) };
  }
};

/**
 * Observation consolidation handler.
 *
 * Merges duplicate observations for a project (same type + files_modified)
 * when a group reaches a minimum size. Reduces storage and improves search
 * signal-to-noise ratio.
 */
export const consolidationHandler: IJobHandler = {
  type: 'consolidation',
  timeout: 30_000,

  async execute(payload: { project: string; minGroupSize?: number }, db: Database) {
    if (!payload.project) {
      throw new Error('consolidation job requires a project in the payload');
    }

    const result = consolidateObservations(db, payload.project, {
      minGroupSize: payload.minGroupSize || 3
    });

    logger.info('QUEUE', `Consolidation job: ${result.merged} groups merged, ${result.removed} observations removed`);
    return result;
  }
};

/**
 * Database backup handler.
 *
 * Placeholder implementation — the full backup strategy requires access to
 * the file system path of the active database and uses SQLite's VACUUM INTO
 * or an online backup API. This handler logs the intent and returns metadata.
 *
 * Full implementation: use `db.backup(destination)` when the bun:sqlite API
 * exposes it, or shell out to `sqlite3 source ".backup dest"`.
 */
export const backupHandler: IJobHandler = {
  type: 'backup',
  timeout: 120_000,

  async execute(payload: { destination?: string }, _db: Database) {
    const destination = payload.destination || `backup-${Date.now()}.db`;
    logger.info('QUEUE', `Backup job: would write snapshot to ${destination}`);

    // TODO: implement actual backup when Database.backup() is available
    return { destination, timestamp: Date.now() };
  }
};
