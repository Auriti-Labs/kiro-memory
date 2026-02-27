import type { Database } from 'bun:sqlite';
import { logger } from '../../utils/logger.js';

/**
 * Session anomaly detection using z-score statistical analysis.
 * Identifies sessions that deviate significantly from the project baseline.
 */

// ============================================================================
// Types
// ============================================================================

export type AnomalyType = 'long-session' | 'high-error-rate' | 'repetitive-commands' | 'no-progress';

export interface Anomaly {
  /** Numeric primary key of the sessions table row */
  sessionId: number;
  /** UUID-style session identifier from the CLI */
  contentSessionId: string;
  /** Git project name */
  project: string;
  /** Category of anomaly detected */
  type: AnomalyType;
  /** Z-score: how many standard deviations from the mean (0 for heuristic checks) */
  score: number;
  /** Actual measured value for the anomalous metric */
  value: number;
  /** Baseline mean for the metric */
  mean: number;
  /** Baseline standard deviation for the metric */
  stdDev: number;
  /** Human-readable description of the anomaly */
  description: string;
}

export interface ProjectBaseline {
  project: string;
  avgDurationMinutes: number;
  stdDurationMinutes: number;
  avgObservations: number;
  stdObservations: number;
  avgCommands: number;
  stdCommands: number;
  /** Number of sessions used to compute the baseline */
  sampleSize: number;
}

// ============================================================================
// Row shapes returned by SQLite queries
// ============================================================================

interface SessionRow {
  id: number;
  content_session_id: string;
  project: string;
  duration_minutes: number | null;
  obs_count: number;
  cmd_count: number;
  write_count: number;
}

// ============================================================================
// AnomalyDetector class
// ============================================================================

/**
 * Anomaly detector using z-score analysis.
 * Compares each session's metrics against the project baseline
 * computed from the last N completed sessions.
 */
export class AnomalyDetector {
  private db: Database;
  private windowSize: number;
  private threshold: number;

  /**
   * @param db         - bun:sqlite Database instance
   * @param windowSize - Number of recent sessions to compute baseline (default: 20)
   * @param threshold  - Z-score threshold for anomaly (default: 2.0 = 2 standard deviations)
   */
  constructor(db: Database, windowSize: number = 20, threshold: number = 2.0) {
    this.db = db;
    this.windowSize = windowSize;
    this.threshold = threshold;
  }

  /**
   * Compute baseline statistics for a project from its most recent completed sessions.
   * Returns null when fewer than 3 sessions are available (insufficient sample).
   */
  getBaseline(project: string): ProjectBaseline | null {
    const sessions = this.db.query(`
      SELECT
        s.id,
        s.content_session_id,
        s.started_at_epoch,
        s.completed_at_epoch,
        CASE
          WHEN s.completed_at_epoch IS NOT NULL AND s.completed_at_epoch > s.started_at_epoch
          THEN (s.completed_at_epoch - s.started_at_epoch) / 1000.0 / 60.0
          ELSE NULL
        END as duration_minutes,
        (SELECT COUNT(*) FROM observations o WHERE o.memory_session_id = s.memory_session_id) as obs_count,
        (SELECT COUNT(*) FROM observations o WHERE o.memory_session_id = s.memory_session_id AND o.type = 'command') as cmd_count
      FROM sessions s
      WHERE s.project = ? AND s.status = 'completed' AND s.completed_at_epoch IS NOT NULL
      ORDER BY s.completed_at_epoch DESC, s.id DESC
      LIMIT ?
    `).all(project, this.windowSize) as Array<{
      id: number;
      content_session_id: string;
      duration_minutes: number | null;
      obs_count: number;
      cmd_count: number;
    }>;

    // Require at least 3 sessions for a meaningful baseline
    if (sessions.length < 3) {
      logger.debug('DB', `Baseline for "${project}": only ${sessions.length} sessions, skipping`);
      return null;
    }

    const durations = sessions
      .filter(s => s.duration_minutes !== null)
      .map(s => s.duration_minutes!);
    const obsCounts = sessions.map(s => s.obs_count);
    const cmdCounts = sessions.map(s => s.cmd_count);

    return {
      project,
      avgDurationMinutes: mean(durations),
      stdDurationMinutes: stdDev(durations),
      avgObservations: mean(obsCounts),
      stdObservations: stdDev(obsCounts),
      avgCommands: mean(cmdCounts),
      stdCommands: stdDev(cmdCounts),
      sampleSize: sessions.length,
    };
  }

  /**
   * Detect anomalous sessions for a project.
   *
   * Checks performed:
   *   - long-session        : duration z-score > threshold
   *   - repetitive-commands : command count z-score > threshold AND cmd/obs ratio > 80 %
   *   - no-progress         : obs count above average but zero file-writes
   *
   * Returns an empty array when there is not enough baseline data.
   */
  detectAnomalies(project: string): Anomaly[] {
    const baseline = this.getBaseline(project);
    if (!baseline) return [];

    const sessions = this.db.query(`
      SELECT
        s.id,
        s.content_session_id,
        s.project,
        s.started_at_epoch,
        s.completed_at_epoch,
        CASE
          WHEN s.completed_at_epoch IS NOT NULL AND s.completed_at_epoch > s.started_at_epoch
          THEN (s.completed_at_epoch - s.started_at_epoch) / 1000.0 / 60.0
          ELSE NULL
        END as duration_minutes,
        (SELECT COUNT(*) FROM observations o WHERE o.memory_session_id = s.memory_session_id) as obs_count,
        (SELECT COUNT(*) FROM observations o WHERE o.memory_session_id = s.memory_session_id AND o.type = 'command') as cmd_count,
        (SELECT COUNT(*) FROM observations o WHERE o.memory_session_id = s.memory_session_id AND o.type = 'file-write') as write_count
      FROM sessions s
      WHERE s.project = ? AND s.status = 'completed' AND s.completed_at_epoch IS NOT NULL
      ORDER BY s.completed_at_epoch DESC, s.id DESC
      LIMIT ?
    `).all(project, this.windowSize) as SessionRow[];

    const anomalies: Anomaly[] = [];

    for (const session of sessions) {
      // --- Check: long-session ---
      if (session.duration_minutes !== null && baseline.stdDurationMinutes > 0) {
        const zScore = (session.duration_minutes - baseline.avgDurationMinutes) / baseline.stdDurationMinutes;
        if (zScore > this.threshold) {
          anomalies.push({
            sessionId: session.id,
            contentSessionId: session.content_session_id,
            project: session.project,
            type: 'long-session',
            score: Math.round(zScore * 100) / 100,
            value: Math.round(session.duration_minutes * 10) / 10,
            mean: Math.round(baseline.avgDurationMinutes * 10) / 10,
            stdDev: Math.round(baseline.stdDurationMinutes * 10) / 10,
            description: `Session lasted ${Math.round(session.duration_minutes)} minutes (avg: ${Math.round(baseline.avgDurationMinutes)} min)`,
          });
        }
      }

      // --- Check: repetitive-commands ---
      // Triggered when both the raw command count z-score AND the cmd/obs ratio exceed thresholds.
      if (session.obs_count > 0 && baseline.stdCommands > 0) {
        const cmdRatio = session.cmd_count / session.obs_count;
        const zScore = (session.cmd_count - baseline.avgCommands) / baseline.stdCommands;
        if (zScore > this.threshold && cmdRatio > 0.8) {
          anomalies.push({
            sessionId: session.id,
            contentSessionId: session.content_session_id,
            project: session.project,
            type: 'repetitive-commands',
            score: Math.round(zScore * 100) / 100,
            value: session.cmd_count,
            mean: Math.round(baseline.avgCommands * 10) / 10,
            stdDev: Math.round(baseline.stdCommands * 10) / 10,
            description: `${session.cmd_count} commands (${Math.round(cmdRatio * 100)}% of observations, avg: ${Math.round(baseline.avgCommands)})`,
          });
        }
      }

      // --- Check: no-progress ---
      // Heuristic: observation count above baseline average but no files were written.
      if (session.obs_count > baseline.avgObservations && session.write_count === 0) {
        anomalies.push({
          sessionId: session.id,
          contentSessionId: session.content_session_id,
          project: session.project,
          type: 'no-progress',
          score: 0, // Not z-score based
          value: session.obs_count,
          mean: Math.round(baseline.avgObservations * 10) / 10,
          stdDev: Math.round(baseline.stdObservations * 10) / 10,
          description: `${session.obs_count} observations but no files written`,
        });
      }
    }

    return anomalies;
  }
}

// ============================================================================
// Statistical helper functions
// ============================================================================

/** Arithmetic mean of an array of numbers. Returns 0 for empty arrays. */
export function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/**
 * Sample standard deviation (Bessel's correction, divides by N-1).
 * Returns 0 for arrays with fewer than 2 elements.
 */
export function stdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const avg = mean(values);
  const squaredDiffs = values.map(v => (v - avg) ** 2);
  return Math.sqrt(squaredDiffs.reduce((sum, v) => sum + v, 0) / (values.length - 1));
}
