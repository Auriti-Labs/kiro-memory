import { Database } from 'bun:sqlite';
import type { Observation } from '../../types/worker-types.js';
import { redactSecrets } from '../../utils/secrets.js';

/**
 * Observation operations for Kiro Memory database
 */

/** Escape LIKE wildcard characters to prevent pattern injection */
function escapeLikePattern(input: string): string {
  return input.replace(/[%_\\]/g, '\\$&');
}

/**
 * Check if an observation with the same content_hash exists within the last 30 seconds.
 * Returns true if it is a duplicate (to be discarded).
 */
export function isDuplicateObservation(db: Database, contentHash: string, windowMs: number = 30_000): boolean {
  if (!contentHash) return false;
  const threshold = Date.now() - windowMs;
  const result = db.query(
    'SELECT id FROM observations WHERE content_hash = ? AND created_at_epoch > ? LIMIT 1'
  ).get(contentHash, threshold);
  return !!result;
}

export function createObservation(
  db: Database,
  memorySessionId: string,
  project: string,
  type: string,
  title: string,
  subtitle: string | null,
  text: string | null,
  narrative: string | null,
  facts: string | null,
  concepts: string | null,
  filesRead: string | null,
  filesModified: string | null,
  promptNumber: number,
  contentHash: string | null = null,
  discoveryTokens: number = 0
): number {
  const now = new Date();

  // Safety net: redact any secrets that may have slipped through upstream layers
  const safeTitle = redactSecrets(title);
  const safeText = text ? redactSecrets(text) : text;
  const safeNarrative = narrative ? redactSecrets(narrative) : narrative;

  const result = db.run(
    `INSERT INTO observations
     (memory_session_id, project, type, title, subtitle, text, narrative, facts, concepts, files_read, files_modified, prompt_number, created_at, created_at_epoch, content_hash, discovery_tokens)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [memorySessionId, project, type, safeTitle, subtitle, safeText, safeNarrative, facts, concepts, filesRead, filesModified, promptNumber, now.toISOString(), now.getTime(), contentHash, discoveryTokens]
  );
  return Number(result.lastInsertRowid);
}

export function getObservationsBySession(db: Database, memorySessionId: string): Observation[] {
  const query = db.query(
    'SELECT * FROM observations WHERE memory_session_id = ? ORDER BY prompt_number ASC'
  );
  return query.all(memorySessionId) as Observation[];
}

export function getObservationsByProject(db: Database, project: string, limit: number = 100): Observation[] {
  const query = db.query(
    'SELECT * FROM observations WHERE project = ? ORDER BY created_at_epoch DESC, id DESC LIMIT ?'
  );
  return query.all(project, limit) as Observation[];
}

export function searchObservations(db: Database, searchTerm: string, project?: string): Observation[] {
  const sql = project
    ? `SELECT * FROM observations
       WHERE project = ? AND (title LIKE ? ESCAPE '\\' OR text LIKE ? ESCAPE '\\' OR narrative LIKE ? ESCAPE '\\')
       ORDER BY created_at_epoch DESC, id DESC`
    : `SELECT * FROM observations
       WHERE title LIKE ? ESCAPE '\\' OR text LIKE ? ESCAPE '\\' OR narrative LIKE ? ESCAPE '\\'
       ORDER BY created_at_epoch DESC, id DESC`;

  const pattern = `%${escapeLikePattern(searchTerm)}%`;
  const query = db.query(sql);

  if (project) {
    return query.all(project, pattern, pattern, pattern) as Observation[];
  }
  return query.all(pattern, pattern, pattern) as Observation[];
}

export function deleteObservation(db: Database, id: number): void {
  db.run('DELETE FROM observations WHERE id = ?', [id]);
}

/**
 * Update the last access timestamp for observations found in search.
 * Fire-and-forget: non-blocking, ignores errors.
 */
export function updateLastAccessed(db: Database, ids: number[]): void {
  if (!Array.isArray(ids) || ids.length === 0) return;

  const validIds = ids
    .filter(id => typeof id === 'number' && Number.isInteger(id) && id > 0)
    .slice(0, 500);

  if (validIds.length === 0) return;

  const now = Date.now();
  const placeholders = validIds.map(() => '?').join(',');
  db.run(
    `UPDATE observations SET last_accessed_epoch = ? WHERE id IN (${placeholders})`,
    [now, ...validIds]
  );
}

/**
 * Consolidate duplicate observations on the same file and type.
 * Groups by (project, type, files_modified), keeps the most recent,
 * concatenates unique contents, deletes the old ones.
 *
 * Fix: counts calculated inside the transaction and returned directly,
 * dry-run separated from the transaction to avoid unnecessary locks.
 */
export function consolidateObservations(
  db: Database,
  project: string,
  options: { dryRun?: boolean; minGroupSize?: number } = {}
): { merged: number; removed: number } {
  const minGroupSize = options.minGroupSize || 3;

  // Find groups of observations with the same (project, type, files_modified)
  const groups = db.query(`
    SELECT type, files_modified, COUNT(*) as cnt, GROUP_CONCAT(id) as ids
    FROM observations
    WHERE project = ? AND files_modified IS NOT NULL AND files_modified != ''
    GROUP BY type, files_modified
    HAVING cnt >= ?
    ORDER BY cnt DESC
  `).all(project, minGroupSize) as Array<{
    type: string;
    files_modified: string;
    cnt: number;
    ids: string;
  }>;

  if (groups.length === 0) return { merged: 0, removed: 0 };

  // Dry-run: calculate counts without opening a transaction
  if (options.dryRun) {
    let totalMerged = 0;
    let totalRemoved = 0;

    for (const group of groups) {
      const obsIds = group.ids.split(',').map(Number);
      const placeholders = obsIds.map(() => '?').join(',');
      const count = (db.query(
        `SELECT COUNT(*) as cnt FROM observations WHERE id IN (${placeholders})`
      ).get(...obsIds) as { cnt: number })?.cnt || 0;

      if (count >= minGroupSize) {
        totalMerged += 1;
        totalRemoved += count - 1;
      }
    }

    return { merged: totalMerged, removed: totalRemoved };
  }

  // Execute consolidation in an atomic transaction.
  // Counts are calculated and returned by the transaction itself,
  // so if it fails no partial values remain.
  const runConsolidation = db.transaction(() => {
    let merged = 0;
    let removed = 0;

    for (const group of groups) {
      const obsIds = group.ids.split(',').map(Number);
      const placeholders = obsIds.map(() => '?').join(',');
      const observations = db.query(
        `SELECT * FROM observations WHERE id IN (${placeholders}) ORDER BY created_at_epoch DESC, id DESC`
      ).all(...obsIds) as Observation[];

      if (observations.length < minGroupSize) continue;

      // Keep the most recent, concatenate unique contents from the others
      const keeper = observations[0];
      const others = observations.slice(1);

      const uniqueTexts = new Set<string>();
      if (keeper.text) uniqueTexts.add(keeper.text);
      for (const obs of others) {
        if (obs.text && !uniqueTexts.has(obs.text)) {
          uniqueTexts.add(obs.text);
        }
      }

      // Update the keeper with consolidated text
      const consolidatedText = Array.from(uniqueTexts).join('\n---\n').substring(0, 100_000);
      db.run(
        'UPDATE observations SET text = ?, title = ? WHERE id = ?',
        [consolidatedText, `[consolidated x${observations.length}] ${keeper.title}`, keeper.id]
      );

      // Delete old observations (and their embeddings)
      const removeIds = others.map(o => o.id);
      const removePlaceholders = removeIds.map(() => '?').join(',');
      db.run(`DELETE FROM observations WHERE id IN (${removePlaceholders})`, removeIds);
      db.run(`DELETE FROM observation_embeddings WHERE observation_id IN (${removePlaceholders})`, removeIds);

      merged += 1;
      removed += removeIds.length;
    }

    return { merged, removed };
  });

  return runConsolidation();
}
