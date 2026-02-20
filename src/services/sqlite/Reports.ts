import { Database } from 'bun:sqlite';
import type { ReportData } from '../../types/worker-types.js';

/**
 * Modulo report per Kiro Memory.
 * Aggrega metriche per un range temporale specifico.
 */

/**
 * Genera dati aggregati per un report di attività.
 * Esegue 8 query sul range [startEpoch, endEpoch].
 */
export function getReportData(
  db: Database,
  project: string | undefined,
  startEpoch: number,
  endEpoch: number
): ReportData {
  // Calcola periodo
  const startDate = new Date(startEpoch);
  const endDate = new Date(endEpoch);
  const days = Math.ceil((endEpoch - startEpoch) / (24 * 60 * 60 * 1000));
  const label = days <= 7 ? 'Weekly' : days <= 31 ? 'Monthly' : 'Custom';

  // Helper per query con filtro progetto + range temporale
  const countInRange = (table: string, epochCol: string = 'created_at_epoch'): number => {
    const sql = project
      ? `SELECT COUNT(*) as count FROM ${table} WHERE project = ? AND ${epochCol} >= ? AND ${epochCol} <= ?`
      : `SELECT COUNT(*) as count FROM ${table} WHERE ${epochCol} >= ? AND ${epochCol} <= ?`;
    const stmt = db.query(sql);
    const row = project
      ? stmt.get(project, startEpoch, endEpoch) as any
      : stmt.get(startEpoch, endEpoch) as any;
    return row?.count || 0;
  };

  // 1. Conteggi base nel periodo
  const observations = countInRange('observations');
  const summaries = countInRange('summaries');
  const prompts = countInRange('prompts');
  // Sessioni: usa started_at_epoch come riferimento
  const sessions = countInRange('sessions', 'started_at_epoch');

  // 2. Timeline giornaliera
  const timelineSql = project
    ? `SELECT DATE(datetime(created_at_epoch / 1000, 'unixepoch')) as day, COUNT(*) as count
       FROM observations
       WHERE project = ? AND created_at_epoch >= ? AND created_at_epoch <= ?
       GROUP BY day ORDER BY day ASC`
    : `SELECT DATE(datetime(created_at_epoch / 1000, 'unixepoch')) as day, COUNT(*) as count
       FROM observations
       WHERE created_at_epoch >= ? AND created_at_epoch <= ?
       GROUP BY day ORDER BY day ASC`;
  const timelineStmt = db.query(timelineSql);
  const timeline = (project
    ? timelineStmt.all(project, startEpoch, endEpoch)
    : timelineStmt.all(startEpoch, endEpoch)
  ) as Array<{ day: string; count: number }>;

  // 3. Distribuzione per tipo
  const typeSql = project
    ? `SELECT type, COUNT(*) as count FROM observations
       WHERE project = ? AND created_at_epoch >= ? AND created_at_epoch <= ?
       GROUP BY type ORDER BY count DESC`
    : `SELECT type, COUNT(*) as count FROM observations
       WHERE created_at_epoch >= ? AND created_at_epoch <= ?
       GROUP BY type ORDER BY count DESC`;
  const typeStmt = db.query(typeSql);
  const typeDistribution = (project
    ? typeStmt.all(project, startEpoch, endEpoch)
    : typeStmt.all(startEpoch, endEpoch)
  ) as Array<{ type: string; count: number }>;

  // 4. Session stats nel periodo
  const sessionTotalSql = project
    ? `SELECT COUNT(*) as count FROM sessions WHERE project = ? AND started_at_epoch >= ? AND started_at_epoch <= ?`
    : `SELECT COUNT(*) as count FROM sessions WHERE started_at_epoch >= ? AND started_at_epoch <= ?`;
  const sessionTotal = (project
    ? (db.query(sessionTotalSql).get(project, startEpoch, endEpoch) as any)?.count
    : (db.query(sessionTotalSql).get(startEpoch, endEpoch) as any)?.count
  ) || 0;

  const sessionCompletedSql = project
    ? `SELECT COUNT(*) as count FROM sessions WHERE project = ? AND started_at_epoch >= ? AND started_at_epoch <= ? AND status = 'completed'`
    : `SELECT COUNT(*) as count FROM sessions WHERE started_at_epoch >= ? AND started_at_epoch <= ? AND status = 'completed'`;
  const sessionCompleted = (project
    ? (db.query(sessionCompletedSql).get(project, startEpoch, endEpoch) as any)?.count
    : (db.query(sessionCompletedSql).get(startEpoch, endEpoch) as any)?.count
  ) || 0;

  const sessionAvgSql = project
    ? `SELECT AVG((completed_at_epoch - started_at_epoch) / 1000.0 / 60.0) as avg_min
       FROM sessions
       WHERE project = ? AND started_at_epoch >= ? AND started_at_epoch <= ?
         AND status = 'completed' AND completed_at_epoch IS NOT NULL AND completed_at_epoch > started_at_epoch`
    : `SELECT AVG((completed_at_epoch - started_at_epoch) / 1000.0 / 60.0) as avg_min
       FROM sessions
       WHERE started_at_epoch >= ? AND started_at_epoch <= ?
         AND status = 'completed' AND completed_at_epoch IS NOT NULL AND completed_at_epoch > started_at_epoch`;
  const avgRow = project
    ? db.query(sessionAvgSql).get(project, startEpoch, endEpoch) as any
    : db.query(sessionAvgSql).get(startEpoch, endEpoch) as any;
  const avgDurationMinutes = Math.round((avgRow?.avg_min || 0) * 10) / 10;

  // 5. Knowledge count
  const knowledgeSql = project
    ? `SELECT COUNT(*) as count FROM observations
       WHERE project = ? AND created_at_epoch >= ? AND created_at_epoch <= ?
         AND type IN ('constraint', 'decision', 'heuristic', 'rejected')`
    : `SELECT COUNT(*) as count FROM observations
       WHERE created_at_epoch >= ? AND created_at_epoch <= ?
         AND type IN ('constraint', 'decision', 'heuristic', 'rejected')`;
  const knowledgeCount = (project
    ? (db.query(knowledgeSql).get(project, startEpoch, endEpoch) as any)?.count
    : (db.query(knowledgeSql).get(startEpoch, endEpoch) as any)?.count
  ) || 0;

  // 6. Stale count
  const staleSql = project
    ? `SELECT COUNT(*) as count FROM observations
       WHERE project = ? AND created_at_epoch >= ? AND created_at_epoch <= ? AND is_stale = 1`
    : `SELECT COUNT(*) as count FROM observations
       WHERE created_at_epoch >= ? AND created_at_epoch <= ? AND is_stale = 1`;
  const staleCount = (project
    ? (db.query(staleSql).get(project, startEpoch, endEpoch) as any)?.count
    : (db.query(staleSql).get(startEpoch, endEpoch) as any)?.count
  ) || 0;

  // 7. Contenuto summaries (learnings, completed, next steps)
  const summarySql = project
    ? `SELECT learned, completed, next_steps FROM summaries
       WHERE project = ? AND created_at_epoch >= ? AND created_at_epoch <= ?
       ORDER BY created_at_epoch DESC`
    : `SELECT learned, completed, next_steps FROM summaries
       WHERE created_at_epoch >= ? AND created_at_epoch <= ?
       ORDER BY created_at_epoch DESC`;
  const summaryRows = (project
    ? db.query(summarySql).all(project, startEpoch, endEpoch)
    : db.query(summarySql).all(startEpoch, endEpoch)
  ) as Array<{ learned: string | null; completed: string | null; next_steps: string | null }>;

  const topLearnings: string[] = [];
  const completedTasks: string[] = [];
  const nextStepsArr: string[] = [];

  for (const row of summaryRows) {
    if (row.learned) {
      // Splita per '; ' se sono concatenati (formato hook stop.ts)
      const parts = row.learned.split('; ').filter(Boolean);
      topLearnings.push(...parts);
    }
    if (row.completed) {
      const parts = row.completed.split('; ').filter(Boolean);
      completedTasks.push(...parts);
    }
    if (row.next_steps) {
      const parts = row.next_steps.split('; ').filter(Boolean);
      nextStepsArr.push(...parts);
    }
  }

  // 8. File hotspots (file più modificati nel periodo)
  const filesSql = project
    ? `SELECT files_modified FROM observations
       WHERE project = ? AND created_at_epoch >= ? AND created_at_epoch <= ?
         AND files_modified IS NOT NULL AND files_modified != ''`
    : `SELECT files_modified FROM observations
       WHERE created_at_epoch >= ? AND created_at_epoch <= ?
         AND files_modified IS NOT NULL AND files_modified != ''`;
  const fileRows = (project
    ? db.query(filesSql).all(project, startEpoch, endEpoch)
    : db.query(filesSql).all(startEpoch, endEpoch)
  ) as Array<{ files_modified: string }>;

  const fileCounts = new Map<string, number>();
  for (const row of fileRows) {
    const files = row.files_modified.split(',').map(f => f.trim()).filter(Boolean);
    for (const file of files) {
      fileCounts.set(file, (fileCounts.get(file) || 0) + 1);
    }
  }

  const fileHotspots = Array.from(fileCounts.entries())
    .map(([file, count]) => ({ file, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 15);

  return {
    period: {
      start: startDate.toISOString().split('T')[0],
      end: endDate.toISOString().split('T')[0],
      days,
      label
    },
    overview: {
      observations,
      summaries,
      sessions,
      prompts,
      knowledgeCount,
      staleCount
    },
    timeline,
    typeDistribution,
    sessionStats: {
      total: sessionTotal,
      completed: sessionCompleted,
      avgDurationMinutes
    },
    topLearnings: [...new Set(topLearnings)].slice(0, 10),
    completedTasks: [...new Set(completedTasks)].slice(0, 10),
    nextSteps: [...new Set(nextStepsArr)].slice(0, 10),
    fileHotspots
  };
}
