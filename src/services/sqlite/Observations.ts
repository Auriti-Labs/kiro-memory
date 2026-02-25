import { Database } from 'bun:sqlite';
import type { Observation } from '../../types/worker-types.js';

/**
 * Observation operations for Kiro Memory database
 */

/** Escape dei caratteri wildcard LIKE per prevenire pattern injection */
function escapeLikePattern(input: string): string {
  return input.replace(/[%_\\]/g, '\\$&');
}

/**
 * Verifica se esiste un'osservazione con lo stesso content_hash negli ultimi 30 secondi.
 * Ritorna true se è un duplicato (da scartare).
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
  const result = db.run(
    `INSERT INTO observations
     (memory_session_id, project, type, title, subtitle, text, narrative, facts, concepts, files_read, files_modified, prompt_number, created_at, created_at_epoch, content_hash, discovery_tokens)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [memorySessionId, project, type, title, subtitle, text, narrative, facts, concepts, filesRead, filesModified, promptNumber, now.toISOString(), now.getTime(), contentHash, discoveryTokens]
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
    'SELECT * FROM observations WHERE project = ? ORDER BY created_at_epoch DESC LIMIT ?'
  );
  return query.all(project, limit) as Observation[];
}

export function searchObservations(db: Database, searchTerm: string, project?: string): Observation[] {
  const sql = project
    ? `SELECT * FROM observations
       WHERE project = ? AND (title LIKE ? ESCAPE '\\' OR text LIKE ? ESCAPE '\\' OR narrative LIKE ? ESCAPE '\\')
       ORDER BY created_at_epoch DESC`
    : `SELECT * FROM observations
       WHERE title LIKE ? ESCAPE '\\' OR text LIKE ? ESCAPE '\\' OR narrative LIKE ? ESCAPE '\\'
       ORDER BY created_at_epoch DESC`;

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
 * Aggiorna il timestamp di ultimo accesso per le osservazioni trovate in ricerca.
 * Fire-and-forget: non bloccante, ignora errori.
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
 * Consolida osservazioni duplicate sullo stesso file e tipo.
 * Raggruppa per (project, type, files_modified), mantiene la piu recente,
 * concatena contenuti unici, elimina le vecchie.
 */
export function consolidateObservations(
  db: Database,
  project: string,
  options: { dryRun?: boolean; minGroupSize?: number } = {}
): { merged: number; removed: number } {
  const minGroupSize = options.minGroupSize || 3;

  // Trova gruppi di osservazioni con stesso (project, type, files_modified)
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

  let totalMerged = 0;
  let totalRemoved = 0;

  for (const group of groups) {
    const obsIds = group.ids.split(',').map(Number);

    // Carica tutte le osservazioni del gruppo, ordinate per data (piu recente prima)
    const placeholders = obsIds.map(() => '?').join(',');
    const observations = db.query(
      `SELECT * FROM observations WHERE id IN (${placeholders}) ORDER BY created_at_epoch DESC`
    ).all(...obsIds) as Observation[];

    if (observations.length < minGroupSize) continue;

    if (options.dryRun) {
      totalMerged += 1;
      totalRemoved += observations.length - 1;
      continue;
    }

    // Mantieni la piu recente, concatena contenuti unici dalle altre
    const keeper = observations[0];
    const others = observations.slice(1);

    // Raccogli testi unici dalle osservazioni da eliminare
    const uniqueTexts = new Set<string>();
    if (keeper.text) uniqueTexts.add(keeper.text);
    for (const obs of others) {
      if (obs.text && !uniqueTexts.has(obs.text)) {
        uniqueTexts.add(obs.text);
      }
    }

    // Aggiorna il keeper con testo consolidato
    const consolidatedText = Array.from(uniqueTexts).join('\n---\n').substring(0, 100_000);
    db.run(
      'UPDATE observations SET text = ?, title = ? WHERE id = ?',
      [consolidatedText, `[consolidato x${observations.length}] ${keeper.title}`, keeper.id]
    );

    // Elimina le osservazioni vecchie (e i loro embeddings)
    const removeIds = others.map(o => o.id);
    const removePlaceholders = removeIds.map(() => '?').join(',');
    db.run(`DELETE FROM observations WHERE id IN (${removePlaceholders})`, removeIds);
    db.run(`DELETE FROM observation_embeddings WHERE observation_id IN (${removePlaceholders})`, removeIds);

    totalMerged += 1;
    totalRemoved += removeIds.length;
  }

  return { merged: totalMerged, removed: totalRemoved };
}
