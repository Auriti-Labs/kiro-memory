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

/** Singola voce giornaliera per la heatmap */
export interface HeatmapDayEntry {
  /** Data in formato ISO YYYY-MM-DD */
  date: string;
  /** Numero di osservazioni quel giorno */
  count: number;
  /** Lista progetto che hanno avuto attività quel giorno */
  projects: string[];
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
 * Single query with conditional aggregation replacing 3 separate queries.
 */
export function getSessionStats(
  db: Database,
  project?: string
): SessionStatsResult {
  const projectFilter = project ? 'WHERE project = ?' : '';

  const sql = `
    SELECT
      COUNT(*) as total,
      COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed,
      AVG(CASE
        WHEN status = 'completed' AND completed_at_epoch IS NOT NULL AND completed_at_epoch > started_at_epoch
        THEN (completed_at_epoch - started_at_epoch) / 1000.0 / 60.0
      END) as avg_min
    FROM sessions
    ${projectFilter}
  `;

  const row = project
    ? db.query(sql).get(project) as any
    : db.query(sql).get() as any;

  return {
    total: row?.total || 0,
    completed: row?.completed || 0,
    avgDurationMinutes: Math.round((row?.avg_min || 0) * 10) / 10,
  };
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
  // Usa $param syntax compatibile sia con bun:sqlite che better-sqlite3
  const projectFilter = project ? 'WHERE project = $project' : '';
  const obsProjectFilter = project ? 'WHERE project = $project' : '';

  const sql = `
    WITH
      obs_stats AS (
        SELECT
          COUNT(*) as total,
          COUNT(CASE WHEN created_at_epoch >= $todayStart THEN 1 END) as today,
          COUNT(CASE WHEN created_at_epoch >= $weekStart THEN 1 END) as this_week,
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
    $todayStart: todayStart,
    $weekStart: weekStart
  };
  if (project) {
    params['$project'] = project;
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

/**
 * Dati giornalieri per la heatmap interattiva della timeline.
 * Restituisce un giorno per riga con conteggio osservazioni e lista progetti distinti.
 * Ordinamento cronologico crescente (dal più vecchio al più recente).
 *
 * @param db       Istanza del database SQLite
 * @param project  Filtro opzionale per progetto
 * @param months   Numero di mesi da coprire (default 6, max 24)
 */
export function getHeatmapData(
  db: Database,
  project?: string,
  months: number = 6
): HeatmapDayEntry[] {
  // Calcola la finestra temporale in millisecondi
  const cutoffEpoch = Date.now() - (months * 30 * 24 * 60 * 60 * 1000);

  // Query che raggruppa per giorno e aggrega i progetti con GROUP_CONCAT
  const sql = project
    ? `SELECT
         DATE(datetime(created_at_epoch / 1000, 'unixepoch')) as date,
         COUNT(*) as count,
         GROUP_CONCAT(DISTINCT project) as projects_csv
       FROM observations
       WHERE project = ? AND created_at_epoch >= ?
       GROUP BY date
       ORDER BY date ASC`
    : `SELECT
         DATE(datetime(created_at_epoch / 1000, 'unixepoch')) as date,
         COUNT(*) as count,
         GROUP_CONCAT(DISTINCT project) as projects_csv
       FROM observations
       WHERE created_at_epoch >= ?
       GROUP BY date
       ORDER BY date ASC`;

  const stmt = db.query(sql);
  const rawRows = project
    ? stmt.all(project, cutoffEpoch) as Array<{ date: string; count: number; projects_csv: string | null }>
    : stmt.all(cutoffEpoch) as Array<{ date: string; count: number; projects_csv: string | null }>;

  // Trasforma i risultati: split CSV → array di progetti
  return rawRows.map(row => ({
    date: row.date,
    count: row.count,
    projects: row.projects_csv ? row.projects_csv.split(',').filter(Boolean) : [],
  }));
}
