import { Database } from 'bun:sqlite';
import { existsSync, statSync } from 'fs';
import type { Observation, Summary, SearchFilters, TimelineEntry } from '../../types/worker-types.js';

/**
 * Advanced search module for Kiro Memory
 * Supports FTS5 full-text search with LIKE fallback
 */

/**
 * BM25 weights for FTS5 columns: title, text, narrative, concepts.
 * Higher values = more relevant column in ranking.
 */
const BM25_WEIGHTS = '10.0, 1.0, 5.0, 3.0';

/** Escape LIKE wildcard characters to prevent pattern injection */
function escapeLikePattern(input: string): string {
  return input.replace(/[%_\\]/g, '\\$&');
}

/**
 * Sanitize a query for FTS5: wraps each term in quotes
 * to prevent reserved operators (AND, OR, NOT, NEAR, *, ^, :)
 * from causing parsing errors. Limits length and term count to prevent ReDoS.
 */
function sanitizeFTS5Query(query: string): string {
  // Limit input length before parsing
  const trimmed = query.length > 10_000 ? query.substring(0, 10_000) : query;

  const terms = trimmed
    .replace(/[""\u0022]/g, '')
    .split(/\s+/)
    .filter(t => t.length > 0)
    .slice(0, 100)
    .map(t => `"${t}"`);

  return terms.join(' ');
}

/**
 * Search observations with FTS5 (full-text) and optional filters.
 * Sanitizes the FTS5 query and falls back to LIKE on error.
 */
export function searchObservationsFTS(
  db: Database,
  query: string,
  filters: SearchFilters = {}
): Observation[] {
  const limit = filters.limit || 50;

  try {
    const safeQuery = sanitizeFTS5Query(query);
    if (!safeQuery) return searchObservationsLIKE(db, query, filters);

    let sql = `
      SELECT o.* FROM observations o
      JOIN observations_fts fts ON o.id = fts.rowid
      WHERE observations_fts MATCH ?
    `;
    const params: (string | number)[] = [safeQuery];

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

    sql += ` ORDER BY bm25(observations_fts, ${BM25_WEIGHTS}) LIMIT ?`;
    params.push(limit);

    const stmt = db.query(sql);
    return stmt.all(...params) as Observation[];
  } catch {
    // Fallback to LIKE if FTS5 is unavailable or query is malformed
    return searchObservationsLIKE(db, query, filters);
  }
}

/**
 * FTS5 search that exposes the raw rank for scoring.
 * The FTS5 rank is negative: more negative = more relevant.
 * Uses sanitizeFTS5Query for safety, falls back to LIKE without rank.
 */
export function searchObservationsFTSWithRank(
  db: Database,
  query: string,
  filters: SearchFilters = {}
): Array<Observation & { fts5_rank: number }> {
  const limit = filters.limit || 50;

  try {
    const safeQuery = sanitizeFTS5Query(query);
    if (!safeQuery) return [];

    let sql = `
      SELECT o.*, bm25(observations_fts, ${BM25_WEIGHTS}) as fts5_rank FROM observations o
      JOIN observations_fts fts ON o.id = fts.rowid
      WHERE observations_fts MATCH ?
    `;
    const params: (string | number)[] = [safeQuery];

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

    sql += ` ORDER BY bm25(observations_fts, ${BM25_WEIGHTS}) LIMIT ?`;
    params.push(limit);

    const stmt = db.query(sql);
    return stmt.all(...params) as Array<Observation & { fts5_rank: number }>;
  } catch {
    // Fallback: no rank available
    return [];
  }
}

/**
 * Fallback: LIKE search on observations
 */
export function searchObservationsLIKE(
  db: Database,
  query: string,
  filters: SearchFilters = {}
): Observation[] {
  const limit = filters.limit || 50;
  const pattern = `%${escapeLikePattern(query)}%`;
  let sql = `
    SELECT * FROM observations
    WHERE (title LIKE ? ESCAPE '\\' OR text LIKE ? ESCAPE '\\' OR narrative LIKE ? ESCAPE '\\' OR concepts LIKE ? ESCAPE '\\')
  `;
  const params: (string | number)[] = [pattern, pattern, pattern, pattern];

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
 * Search summaries with filters
 */
export function searchSummariesFiltered(
  db: Database,
  query: string,
  filters: SearchFilters = {}
): Summary[] {
  const limit = filters.limit || 20;
  const pattern = `%${escapeLikePattern(query)}%`;
  let sql = `
    SELECT * FROM summaries
    WHERE (request LIKE ? ESCAPE '\\' OR learned LIKE ? ESCAPE '\\' OR completed LIKE ? ESCAPE '\\' OR notes LIKE ? ESCAPE '\\' OR next_steps LIKE ? ESCAPE '\\')
  `;
  const params: (string | number)[] = [pattern, pattern, pattern, pattern, pattern];

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
 * Retrieve observations by ID (batch)
 */
export function getObservationsByIds(db: Database, ids: number[]): Observation[] {
  if (!Array.isArray(ids) || ids.length === 0) return [];

  // Validate and filter: only positive integers, max 500 per query
  const validIds = ids
    .filter(id => typeof id === 'number' && Number.isInteger(id) && id > 0)
    .slice(0, 500);

  if (validIds.length === 0) return [];

  const placeholders = validIds.map(() => '?').join(',');
  const sql = `SELECT * FROM observations WHERE id IN (${placeholders}) ORDER BY created_at_epoch DESC`;
  const stmt = db.query(sql);
  return stmt.all(...validIds) as Observation[];
}

/**
 * Timeline: chronological context around an observation
 */
export function getTimeline(
  db: Database,
  anchorId: number,
  depthBefore: number = 5,
  depthAfter: number = 5
): TimelineEntry[] {
  // Find the anchor's epoch
  const anchorStmt = db.query('SELECT created_at_epoch FROM observations WHERE id = ?');
  const anchor = anchorStmt.get(anchorId) as { created_at_epoch: number } | null;

  if (!anchor) return [];

  const anchorEpoch = anchor.created_at_epoch;

  // Observations before
  const beforeStmt = db.query(`
    SELECT id, 'observation' as type, title, text as content, project, created_at, created_at_epoch
    FROM observations
    WHERE created_at_epoch < ?
    ORDER BY created_at_epoch DESC
    LIMIT ?
  `);
  const before = (beforeStmt.all(anchorEpoch, depthBefore) as TimelineEntry[]).reverse();

  // The anchor itself
  const selfStmt = db.query(`
    SELECT id, 'observation' as type, title, text as content, project, created_at, created_at_epoch
    FROM observations WHERE id = ?
  `);
  const self = selfStmt.all(anchorId) as TimelineEntry[];

  // Observations after
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
 * Database statistics for a project
 */
export function getProjectStats(db: Database, project: string): {
  observations: number;
  summaries: number;
  sessions: number;
  prompts: number;
  tokenEconomics: { discoveryTokens: number; readTokens: number; savings: number };
} {
  const obsStmt = db.query('SELECT COUNT(*) as count FROM observations WHERE project = ?');
  const sumStmt = db.query('SELECT COUNT(*) as count FROM summaries WHERE project = ?');
  const sesStmt = db.query('SELECT COUNT(*) as count FROM sessions WHERE project = ?');
  const prmStmt = db.query('SELECT COUNT(*) as count FROM prompts WHERE project = ?');

  // Token economics: discovery_tokens (generation cost) vs read_tokens (read cost)
  const discoveryStmt = db.query(
    'SELECT COALESCE(SUM(discovery_tokens), 0) as total FROM observations WHERE project = ?'
  );
  const discoveryTokens = (discoveryStmt.get(project) as any)?.total || 0;

  // read_tokens: estimate based on (title + narrative) / 4 chars per token
  const readStmt = db.query(
    `SELECT COALESCE(SUM(
      CAST((LENGTH(COALESCE(title, '')) + LENGTH(COALESCE(narrative, ''))) / 4 AS INTEGER)
    ), 0) as total FROM observations WHERE project = ?`
  );
  const readTokens = (readStmt.get(project) as any)?.total || 0;

  // Savings: discovery_tokens saved by reusing context instead of rediscovery
  const savings = Math.max(0, discoveryTokens - readTokens);

  return {
    observations: (obsStmt.get(project) as any)?.count || 0,
    summaries: (sumStmt.get(project) as any)?.count || 0,
    sessions: (sesStmt.get(project) as any)?.count || 0,
    prompts: (prmStmt.get(project) as any)?.count || 0,
    tokenEconomics: { discoveryTokens, readTokens, savings },
  };
}

/**
 * Find observations with files modified after the observation was created.
 * Checks the filesystem mtime for each file in files_modified.
 */
export function getStaleObservations(db: Database, project: string): Observation[] {
  // Query observations with non-empty files_modified
  const rows = db.query(`
    SELECT * FROM observations
    WHERE project = ? AND files_modified IS NOT NULL AND files_modified != ''
    ORDER BY created_at_epoch DESC
    LIMIT 500
  `).all(project) as Observation[];

  const staleObs: Observation[] = [];

  for (const obs of rows) {
    if (!obs.files_modified) continue;

    // Parse files_modified (comma-separated)
    const files = obs.files_modified.split(',').map(f => f.trim()).filter(Boolean);

    let isStale = false;
    for (const filepath of files) {
      try {
        if (!existsSync(filepath)) continue; // File removed, cannot verify
        const stat = statSync(filepath);
        if (stat.mtimeMs > obs.created_at_epoch) {
          isStale = true;
          break;
        }
      } catch {
        // File not accessible, skip
      }
    }

    if (isStale) {
      staleObs.push(obs);
    }
  }

  return staleObs;
}

/**
 * Mark observations as stale (1) or fresh (0) in the database.
 */
export function markObservationsStale(db: Database, ids: number[], stale: boolean): void {
  if (!Array.isArray(ids) || ids.length === 0) return;

  const validIds = ids
    .filter(id => typeof id === 'number' && Number.isInteger(id) && id > 0)
    .slice(0, 500);

  if (validIds.length === 0) return;

  const placeholders = validIds.map(() => '?').join(',');
  db.run(
    `UPDATE observations SET is_stale = ? WHERE id IN (${placeholders})`,
    [stale ? 1 : 0, ...validIds]
  );
}
