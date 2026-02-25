import { Database } from 'bun:sqlite';

/**
 * Modulo analytics per Kiro Memory.
 * Query aggregate per dashboard metriche.
 */

// ============================================================================
// Tipi di ritorno
// ============================================================================

export interface TimelineDayEntry {
  day: string;
  count: number;
}

export interface TypeDistributionEntry {
  type: string;
  count: number;
}

export interface SessionStatsResult {
  total: number;
  completed: number;
  avgDurationMinutes: number;
}

export interface TokenEconomicsResult {
  discoveryTokens: number;
  readTokens: number;
  savings: number;
  reductionPct: number;
}

export interface AnalyticsOverviewResult {
  observations: number;
  summaries: number;
  sessions: number;
  prompts: number;
  observationsToday: number;
  observationsThisWeek: number;
  staleCount: number;
  knowledgeCount: number;
  tokenEconomics: TokenEconomicsResult;
}

// ============================================================================
// Funzioni query
// ============================================================================

/**
 * Osservazioni per giorno (ultimi N giorni).
 * Ritorna array ordinato cronologicamente (dal più vecchio al più recente).
 */
export function getObservationsTimeline(
  db: Database,
  project?: string,
  days: number = 30
): TimelineDayEntry[] {
  const cutoffEpoch = Date.now() - (days * 24 * 60 * 60 * 1000);

  const sql = project
    ? `SELECT DATE(datetime(created_at_epoch / 1000, 'unixepoch')) as day, COUNT(*) as count
       FROM observations
       WHERE project = ? AND created_at_epoch >= ?
       GROUP BY day
       ORDER BY day ASC`
    : `SELECT DATE(datetime(created_at_epoch / 1000, 'unixepoch')) as day, COUNT(*) as count
       FROM observations
       WHERE created_at_epoch >= ?
       GROUP BY day
       ORDER BY day ASC`;

  const stmt = db.query(sql);
  const rows = project
    ? stmt.all(project, cutoffEpoch) as TimelineDayEntry[]
    : stmt.all(cutoffEpoch) as TimelineDayEntry[];

  return rows;
}

/**
 * Distribuzione osservazioni per tipo.
 * Ritorna array ordinato per conteggio decrescente.
 */
export function getTypeDistribution(
  db: Database,
  project?: string
): TypeDistributionEntry[] {
  const sql = project
    ? `SELECT type, COUNT(*) as count
       FROM observations
       WHERE project = ?
       GROUP BY type
       ORDER BY count DESC`
    : `SELECT type, COUNT(*) as count
       FROM observations
       GROUP BY type
       ORDER BY count DESC`;

  const stmt = db.query(sql);
  const rows = project
    ? stmt.all(project) as TypeDistributionEntry[]
    : stmt.all() as TypeDistributionEntry[];

  return rows;
}

/**
 * Statistiche sessioni: totale, completate, durata media.
 */
export function getSessionStats(
  db: Database,
  project?: string
): SessionStatsResult {
  const totalSql = project
    ? 'SELECT COUNT(*) as count FROM sessions WHERE project = ?'
    : 'SELECT COUNT(*) as count FROM sessions';
  const totalStmt = db.query(totalSql);
  const total = project
    ? (totalStmt.get(project) as any)?.count || 0
    : (totalStmt.get() as any)?.count || 0;

  const completedSql = project
    ? `SELECT COUNT(*) as count FROM sessions WHERE project = ? AND status = 'completed'`
    : `SELECT COUNT(*) as count FROM sessions WHERE status = 'completed'`;
  const completedStmt = db.query(completedSql);
  const completed = project
    ? (completedStmt.get(project) as any)?.count || 0
    : (completedStmt.get() as any)?.count || 0;

  // Durata media solo per sessioni completate (epoch in millisecondi)
  const avgSql = project
    ? `SELECT AVG((completed_at_epoch - started_at_epoch) / 1000.0 / 60.0) as avg_min
       FROM sessions
       WHERE project = ? AND status = 'completed' AND completed_at_epoch IS NOT NULL AND completed_at_epoch > started_at_epoch`
    : `SELECT AVG((completed_at_epoch - started_at_epoch) / 1000.0 / 60.0) as avg_min
       FROM sessions
       WHERE status = 'completed' AND completed_at_epoch IS NOT NULL AND completed_at_epoch > started_at_epoch`;
  const avgStmt = db.query(avgSql);
  const avgRow = project
    ? avgStmt.get(project) as any
    : avgStmt.get() as any;
  const avgDurationMinutes = Math.round((avgRow?.avg_min || 0) * 10) / 10;

  return { total, completed, avgDurationMinutes };
}

/**
 * Overview generale: conteggi base + trend giornaliero/settimanale.
 */
export function getAnalyticsOverview(
  db: Database,
  project?: string
): AnalyticsOverviewResult {
  const now = Date.now();
  const todayStart = now - (now % (24 * 60 * 60 * 1000)); // Inizio giornata UTC
  const weekStart = now - (7 * 24 * 60 * 60 * 1000);

  // Conteggi base
  const countQuery = (table: string) => {
    const sql = project
      ? `SELECT COUNT(*) as count FROM ${table} WHERE project = ?`
      : `SELECT COUNT(*) as count FROM ${table}`;
    const stmt = db.query(sql);
    return project
      ? (stmt.get(project) as any)?.count || 0
      : (stmt.get() as any)?.count || 0;
  };

  const observations = countQuery('observations');
  const summaries = countQuery('summaries');
  const sessions = countQuery('sessions');
  const prompts = countQuery('prompts');

  // Osservazioni oggi
  const todaySql = project
    ? 'SELECT COUNT(*) as count FROM observations WHERE project = ? AND created_at_epoch >= ?'
    : 'SELECT COUNT(*) as count FROM observations WHERE created_at_epoch >= ?';
  const todayStmt = db.query(todaySql);
  const observationsToday = project
    ? (todayStmt.get(project, todayStart) as any)?.count || 0
    : (todayStmt.get(todayStart) as any)?.count || 0;

  // Osservazioni questa settimana
  const weekSql = project
    ? 'SELECT COUNT(*) as count FROM observations WHERE project = ? AND created_at_epoch >= ?'
    : 'SELECT COUNT(*) as count FROM observations WHERE created_at_epoch >= ?';
  const weekStmt = db.query(weekSql);
  const observationsThisWeek = project
    ? (weekStmt.get(project, weekStart) as any)?.count || 0
    : (weekStmt.get(weekStart) as any)?.count || 0;

  // Osservazioni stale
  const staleSql = project
    ? 'SELECT COUNT(*) as count FROM observations WHERE project = ? AND is_stale = 1'
    : 'SELECT COUNT(*) as count FROM observations WHERE is_stale = 1';
  const staleStmt = db.query(staleSql);
  const staleCount = project
    ? (staleStmt.get(project) as any)?.count || 0
    : (staleStmt.get() as any)?.count || 0;

  // Knowledge items (constraint, decision, heuristic, rejected)
  const knowledgeSql = project
    ? `SELECT COUNT(*) as count FROM observations WHERE project = ? AND type IN ('constraint', 'decision', 'heuristic', 'rejected')`
    : `SELECT COUNT(*) as count FROM observations WHERE type IN ('constraint', 'decision', 'heuristic', 'rejected')`;
  const knowledgeStmt = db.query(knowledgeSql);
  const knowledgeCount = project
    ? (knowledgeStmt.get(project) as any)?.count || 0
    : (knowledgeStmt.get() as any)?.count || 0;

  // Token economics: discovery (costo generazione) vs read (costo riutilizzo)
  const discoverySql = project
    ? 'SELECT COALESCE(SUM(discovery_tokens), 0) as total FROM observations WHERE project = ?'
    : 'SELECT COALESCE(SUM(discovery_tokens), 0) as total FROM observations';
  const discoveryStmt = db.query(discoverySql);
  const discoveryTokens = project
    ? (discoveryStmt.get(project) as any)?.total || 0
    : (discoveryStmt.get() as any)?.total || 0;

  const readSql = project
    ? `SELECT COALESCE(SUM(CAST((LENGTH(COALESCE(title, '')) + LENGTH(COALESCE(narrative, ''))) / 4 AS INTEGER)), 0) as total FROM observations WHERE project = ?`
    : `SELECT COALESCE(SUM(CAST((LENGTH(COALESCE(title, '')) + LENGTH(COALESCE(narrative, ''))) / 4 AS INTEGER)), 0) as total FROM observations`;
  const readStmt = db.query(readSql);
  const readTokens = project
    ? (readStmt.get(project) as any)?.total || 0
    : (readStmt.get() as any)?.total || 0;

  const savings = Math.max(0, discoveryTokens - readTokens);
  const reductionPct = discoveryTokens > 0 ? Math.round((1 - readTokens / discoveryTokens) * 100) : 0;

  return {
    observations, summaries, sessions, prompts,
    observationsToday, observationsThisWeek,
    staleCount, knowledgeCount,
    tokenEconomics: { discoveryTokens, readTokens, savings, reductionPct }
  };
}
