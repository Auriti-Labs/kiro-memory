import { Database } from 'bun:sqlite';
import type { Observation, Summary, SearchFilters, TimelineEntry } from '../../types/worker-types.js';

/**
 * Advanced search module for Kiro Memory
 * Supports FTS5 full-text search with LIKE fallback
 */

/**
 * Ricerca osservazioni con FTS5 (full-text) e filtri opzionali
 */
export function searchObservationsFTS(
  db: Database,
  query: string,
  filters: SearchFilters = {}
): Observation[] {
  const limit = filters.limit || 50;

  try {
    // Prova FTS5
    let sql = `
      SELECT o.* FROM observations o
      JOIN observations_fts fts ON o.id = fts.rowid
      WHERE observations_fts MATCH ?
    `;
    const params: any[] = [query];

    if (filters.project) {
      sql += ' AND o.project = ?';
      params.push(filters.project);
    }
    if (filters.type) {
      sql += ' AND o.type = ?';
      params.push(filters.type);
    }
    if (filters.dateStart) {
      sql += ' AND o.created_at_epoch >= ?';
      params.push(filters.dateStart);
    }
    if (filters.dateEnd) {
      sql += ' AND o.created_at_epoch <= ?';
      params.push(filters.dateEnd);
    }

    sql += ' ORDER BY rank LIMIT ?';
    params.push(limit);

    const stmt = db.query(sql);
    return stmt.all(...params) as Observation[];
  } catch {
    // Fallback a LIKE se FTS5 non disponibile
    return searchObservationsLIKE(db, query, filters);
  }
}

/**
 * Fallback: ricerca LIKE sulle osservazioni
 */
export function searchObservationsLIKE(
  db: Database,
  query: string,
  filters: SearchFilters = {}
): Observation[] {
  const limit = filters.limit || 50;
  const pattern = `%${query}%`;
  let sql = `
    SELECT * FROM observations
    WHERE (title LIKE ? OR text LIKE ? OR narrative LIKE ? OR concepts LIKE ?)
  `;
  const params: any[] = [pattern, pattern, pattern, pattern];

  if (filters.project) {
    sql += ' AND project = ?';
    params.push(filters.project);
  }
  if (filters.type) {
    sql += ' AND type = ?';
    params.push(filters.type);
  }
  if (filters.dateStart) {
    sql += ' AND created_at_epoch >= ?';
    params.push(filters.dateStart);
  }
  if (filters.dateEnd) {
    sql += ' AND created_at_epoch <= ?';
    params.push(filters.dateEnd);
  }

  sql += ' ORDER BY created_at_epoch DESC LIMIT ?';
  params.push(limit);

  const stmt = db.query(sql);
  return stmt.all(...params) as Observation[];
}

/**
 * Ricerca sommari con filtri
 */
export function searchSummariesFiltered(
  db: Database,
  query: string,
  filters: SearchFilters = {}
): Summary[] {
  const limit = filters.limit || 20;
  const pattern = `%${query}%`;
  let sql = `
    SELECT * FROM summaries
    WHERE (request LIKE ? OR learned LIKE ? OR completed LIKE ? OR notes LIKE ? OR next_steps LIKE ?)
  `;
  const params: any[] = [pattern, pattern, pattern, pattern, pattern];

  if (filters.project) {
    sql += ' AND project = ?';
    params.push(filters.project);
  }
  if (filters.dateStart) {
    sql += ' AND created_at_epoch >= ?';
    params.push(filters.dateStart);
  }
  if (filters.dateEnd) {
    sql += ' AND created_at_epoch <= ?';
    params.push(filters.dateEnd);
  }

  sql += ' ORDER BY created_at_epoch DESC LIMIT ?';
  params.push(limit);

  const stmt = db.query(sql);
  return stmt.all(...params) as Summary[];
}

/**
 * Recupera osservazioni per ID (batch)
 */
export function getObservationsByIds(db: Database, ids: number[]): Observation[] {
  if (ids.length === 0) return [];

  const placeholders = ids.map(() => '?').join(',');
  const sql = `SELECT * FROM observations WHERE id IN (${placeholders}) ORDER BY created_at_epoch DESC`;
  const stmt = db.query(sql);
  return stmt.all(...ids) as Observation[];
}

/**
 * Timeline: contesto cronologico attorno a un'osservazione
 */
export function getTimeline(
  db: Database,
  anchorId: number,
  depthBefore: number = 5,
  depthAfter: number = 5
): TimelineEntry[] {
  // Trova l'epoch dell'ancora
  const anchorStmt = db.query('SELECT created_at_epoch FROM observations WHERE id = ?');
  const anchor = anchorStmt.get(anchorId) as { created_at_epoch: number } | null;

  if (!anchor) return [];

  const anchorEpoch = anchor.created_at_epoch;

  // Osservazioni prima
  const beforeStmt = db.query(`
    SELECT id, 'observation' as type, title, text as content, project, created_at, created_at_epoch
    FROM observations
    WHERE created_at_epoch < ?
    ORDER BY created_at_epoch DESC
    LIMIT ?
  `);
  const before = (beforeStmt.all(anchorEpoch, depthBefore) as TimelineEntry[]).reverse();

  // L'ancora stessa
  const selfStmt = db.query(`
    SELECT id, 'observation' as type, title, text as content, project, created_at, created_at_epoch
    FROM observations WHERE id = ?
  `);
  const self = selfStmt.all(anchorId) as TimelineEntry[];

  // Osservazioni dopo
  const afterStmt = db.query(`
    SELECT id, 'observation' as type, title, text as content, project, created_at, created_at_epoch
    FROM observations
    WHERE created_at_epoch > ?
    ORDER BY created_at_epoch ASC
    LIMIT ?
  `);
  const after = afterStmt.all(anchorEpoch, depthAfter) as TimelineEntry[];

  return [...before, ...self, ...after];
}

/**
 * Statistiche database per un progetto
 */
export function getProjectStats(db: Database, project: string): {
  observations: number;
  summaries: number;
  sessions: number;
  prompts: number;
} {
  const obsStmt = db.query('SELECT COUNT(*) as count FROM observations WHERE project = ?');
  const sumStmt = db.query('SELECT COUNT(*) as count FROM summaries WHERE project = ?');
  const sesStmt = db.query('SELECT COUNT(*) as count FROM sessions WHERE project = ?');
  const prmStmt = db.query('SELECT COUNT(*) as count FROM prompts WHERE project = ?');

  return {
    observations: (obsStmt.get(project) as any)?.count || 0,
    summaries: (sumStmt.get(project) as any)?.count || 0,
    sessions: (sesStmt.get(project) as any)?.count || 0,
    prompts: (prmStmt.get(project) as any)?.count || 0,
  };
}
