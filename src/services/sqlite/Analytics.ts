import { Database } from 'bun:sqlite';

/**
 * Analytics module for Kiro Memory.
 * Aggregate queries for metrics dashboard.
 */

// ============================================================================
// Return types
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
// Query functions
// ============================================================================

/**
 * Observations per day (last N days).
 * Returns array sorted chronologically (oldest to most recent).
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
 * Observation distribution by type.
 * Returns array sorted by count descending.
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
 * Session statistics: total, completed, average duration.
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

  // Average duration only for completed sessions (epoch in milliseconds)
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
 * General overview: base counts + daily/weekly trends.
 * Single CTE query replacing the 10 separate queries (fix N+1).
 */
export function getAnalyticsOverview(
  db: Database,
  project?: string
): AnalyticsOverviewResult {
  const now = Date.now();
  const todayStart = now - (now % (24 * 60 * 60 * 1000)); // Start of day UTC
  const weekStart = now - (7 * 24 * 60 * 60 * 1000);

  // Single CTE query: 10 counts in a single DB roundtrip
  const projectFilter = project ? 'WHERE project = @project' : '';
  const obsProjectFilter = project ? 'WHERE project = @project' : '';

  const sql = `
    WITH
      obs_stats AS (
        SELECT
          COUNT(*) as total,
          COUNT(CASE WHEN created_at_epoch >= @todayStart THEN 1 END) as today,
          COUNT(CASE WHEN created_at_epoch >= @weekStart THEN 1 END) as this_week,
          COUNT(CASE WHEN is_stale = 1 THEN 1 END) as stale,
          COUNT(CASE WHEN type IN ('constraint', 'decision', 'heuristic', 'rejected') THEN 1 END) as knowledge,
          COALESCE(SUM(discovery_tokens), 0) as discovery_tokens,
          COALESCE(SUM(CAST((LENGTH(COALESCE(title, '')) + LENGTH(COALESCE(narrative, ''))) / 4 AS INTEGER)), 0) as read_tokens
        FROM observations
        ${obsProjectFilter}
      ),
      sum_count AS (
        SELECT COUNT(*) as total FROM summaries ${projectFilter}
      ),
      sess_count AS (
        SELECT COUNT(*) as total FROM sessions ${projectFilter}
      ),
      prompt_count AS (
        SELECT COUNT(*) as total FROM prompts ${projectFilter}
      )
    SELECT
      obs_stats.total as observations,
      obs_stats.today as observations_today,
      obs_stats.this_week as observations_this_week,
      obs_stats.stale as stale_count,
      obs_stats.knowledge as knowledge_count,
      obs_stats.discovery_tokens,
      obs_stats.read_tokens,
      sum_count.total as summaries,
      sess_count.total as sessions,
      prompt_count.total as prompts
    FROM obs_stats, sum_count, sess_count, prompt_count
  `;

  const params: Record<string, any> = {
    '@todayStart': todayStart,
    '@weekStart': weekStart
  };
  if (project) {
    params['@project'] = project;
  }

  const row = db.query(sql).get(params) as any;

  const discoveryTokens = row?.discovery_tokens || 0;
  const readTokens = row?.read_tokens || 0;
  const savings = Math.max(0, discoveryTokens - readTokens);
  const reductionPct = discoveryTokens > 0 ? Math.round((1 - readTokens / discoveryTokens) * 100) : 0;

  return {
    observations: row?.observations || 0,
    summaries: row?.summaries || 0,
    sessions: row?.sessions || 0,
    prompts: row?.prompts || 0,
    observationsToday: row?.observations_today || 0,
    observationsThisWeek: row?.observations_this_week || 0,
    staleCount: row?.stale_count || 0,
    knowledgeCount: row?.knowledge_count || 0,
    tokenEconomics: { discoveryTokens, readTokens, savings, reductionPct }
  };
}
