import { Database } from 'bun:sqlite';
import type { Observation, Summary, SearchFilters, TimelineEntry } from '../../types/worker-types.js';

/**
 * Advanced search module for Kiro Memory
 * Supports FTS5 full-text search with LIKE fallback
 */

/** Escape dei caratteri wildcard LIKE per prevenire pattern injection */
function escapeLikePattern(input: string): string {
  return input.replace(/[%_\\]/g, '\\$&');
}

/**
 * Sanitizza una query per FTS5: wrappa ogni termine tra virgolette
 * per evitare che operatori riservati (AND, OR, NOT, NEAR, *, ^, :)
 * causino errori di parsing. Limita lunghezza e numero termini per evitare ReDoS.
 */
function sanitizeFTS5Query(query: string): string {
  // Limita lunghezza input prima del parsing
  const trimmed = query.length > 10_000 ? query.substring(0, 10_000) : query;

  const terms = trimmed
    .replace(/[""]/g, '')
    .split(/\s+/)
    .filter(t => t.length > 0)
    .slice(0, 100)
    .map(t => `"${t}"`);

  return terms.join(' ');
}

/**
 * Ricerca osservazioni con FTS5 (full-text) e filtri opzionali.
 * Sanitizza la query FTS5 e fallback a LIKE in caso di errore.
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

    sql += ' ORDER BY rank LIMIT ?';
    params.push(limit);

    const stmt = db.query(sql);
    return stmt.all(...params) as Observation[];
  } catch {
    // Fallback a LIKE se FTS5 non disponibile o query malformata
    return searchObservationsLIKE(db, query, filters);
  }
}

/**
 * Ricerca FTS5 che espone il rank grezzo per scoring.
 * Il rank FTS5 e negativo: piu negativo = piu rilevante.
 * Usa sanitizeFTS5Query per sicurezza, fallback a LIKE senza rank.
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
      SELECT o.*, rank as fts5_rank FROM observations o
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

    sql += ' ORDER BY rank LIMIT ?';
    params.push(limit);

    const stmt = db.query(sql);
    return stmt.all(...params) as Array<Observation & { fts5_rank: number }>;
  } catch {
    // Fallback: nessun rank disponibile
    return [];
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
 * Ricerca sommari con filtri
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
 * Recupera osservazioni per ID (batch)
 */
export function getObservationsByIds(db: Database, ids: number[]): Observation[] {
  if (!Array.isArray(ids) || ids.length === 0) return [];

  // Valida e filtra: solo interi positivi, max 500 per query
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
