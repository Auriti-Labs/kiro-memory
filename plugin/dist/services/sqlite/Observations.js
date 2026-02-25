import { createRequire } from 'module';const require = createRequire(import.meta.url);

// src/services/sqlite/Observations.ts
function escapeLikePattern(input) {
  return input.replace(/[%_\\]/g, "\\$&");
}
function isDuplicateObservation(db, contentHash, windowMs = 3e4) {
  if (!contentHash) return false;
  const threshold = Date.now() - windowMs;
  const result = db.query(
    "SELECT id FROM observations WHERE content_hash = ? AND created_at_epoch > ? LIMIT 1"
  ).get(contentHash, threshold);
  return !!result;
}
function createObservation(db, memorySessionId, project, type, title, subtitle, text, narrative, facts, concepts, filesRead, filesModified, promptNumber, contentHash = null, discoveryTokens = 0) {
  const now = /* @__PURE__ */ new Date();
  const result = db.run(
    `INSERT INTO observations
     (memory_session_id, project, type, title, subtitle, text, narrative, facts, concepts, files_read, files_modified, prompt_number, created_at, created_at_epoch, content_hash, discovery_tokens)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [memorySessionId, project, type, title, subtitle, text, narrative, facts, concepts, filesRead, filesModified, promptNumber, now.toISOString(), now.getTime(), contentHash, discoveryTokens]
  );
  return Number(result.lastInsertRowid);
}
function getObservationsBySession(db, memorySessionId) {
  const query = db.query(
    "SELECT * FROM observations WHERE memory_session_id = ? ORDER BY prompt_number ASC"
  );
  return query.all(memorySessionId);
}
function getObservationsByProject(db, project, limit = 100) {
  const query = db.query(
    "SELECT * FROM observations WHERE project = ? ORDER BY created_at_epoch DESC LIMIT ?"
  );
  return query.all(project, limit);
}
function searchObservations(db, searchTerm, project) {
  const sql = project ? `SELECT * FROM observations
       WHERE project = ? AND (title LIKE ? ESCAPE '\\' OR text LIKE ? ESCAPE '\\' OR narrative LIKE ? ESCAPE '\\')
       ORDER BY created_at_epoch DESC` : `SELECT * FROM observations
       WHERE title LIKE ? ESCAPE '\\' OR text LIKE ? ESCAPE '\\' OR narrative LIKE ? ESCAPE '\\'
       ORDER BY created_at_epoch DESC`;
  const pattern = `%${escapeLikePattern(searchTerm)}%`;
  const query = db.query(sql);
  if (project) {
    return query.all(project, pattern, pattern, pattern);
  }
  return query.all(pattern, pattern, pattern);
}
function deleteObservation(db, id) {
  db.run("DELETE FROM observations WHERE id = ?", [id]);
}
function updateLastAccessed(db, ids) {
  if (!Array.isArray(ids) || ids.length === 0) return;
  const validIds = ids.filter((id) => typeof id === "number" && Number.isInteger(id) && id > 0).slice(0, 500);
  if (validIds.length === 0) return;
  const now = Date.now();
  const placeholders = validIds.map(() => "?").join(",");
  db.run(
    `UPDATE observations SET last_accessed_epoch = ? WHERE id IN (${placeholders})`,
    [now, ...validIds]
  );
}
function consolidateObservations(db, project, options = {}) {
  const minGroupSize = options.minGroupSize || 3;
  const groups = db.query(`
    SELECT type, files_modified, COUNT(*) as cnt, GROUP_CONCAT(id) as ids
    FROM observations
    WHERE project = ? AND files_modified IS NOT NULL AND files_modified != ''
    GROUP BY type, files_modified
    HAVING cnt >= ?
    ORDER BY cnt DESC
  `).all(project, minGroupSize);
  if (groups.length === 0) return { merged: 0, removed: 0 };
  let totalMerged = 0;
  let totalRemoved = 0;
  const runConsolidation = db.transaction(() => {
    for (const group of groups) {
      const obsIds = group.ids.split(",").map(Number);
      const placeholders = obsIds.map(() => "?").join(",");
      const observations = db.query(
        `SELECT * FROM observations WHERE id IN (${placeholders}) ORDER BY created_at_epoch DESC`
      ).all(...obsIds);
      if (observations.length < minGroupSize) continue;
      if (options.dryRun) {
        totalMerged += 1;
        totalRemoved += observations.length - 1;
        continue;
      }
      const keeper = observations[0];
      const others = observations.slice(1);
      const uniqueTexts = /* @__PURE__ */ new Set();
      if (keeper.text) uniqueTexts.add(keeper.text);
      for (const obs of others) {
        if (obs.text && !uniqueTexts.has(obs.text)) {
          uniqueTexts.add(obs.text);
        }
      }
      const consolidatedText = Array.from(uniqueTexts).join("\n---\n").substring(0, 1e5);
      db.run(
        "UPDATE observations SET text = ?, title = ? WHERE id = ?",
        [consolidatedText, `[consolidato x${observations.length}] ${keeper.title}`, keeper.id]
      );
      const removeIds = others.map((o) => o.id);
      const removePlaceholders = removeIds.map(() => "?").join(",");
      db.run(`DELETE FROM observations WHERE id IN (${removePlaceholders})`, removeIds);
      db.run(`DELETE FROM observation_embeddings WHERE observation_id IN (${removePlaceholders})`, removeIds);
      totalMerged += 1;
      totalRemoved += removeIds.length;
    }
  });
  runConsolidation();
  return { merged: totalMerged, removed: totalRemoved };
}
export {
  consolidateObservations,
  createObservation,
  deleteObservation,
  getObservationsByProject,
  getObservationsBySession,
  isDuplicateObservation,
  searchObservations,
  updateLastAccessed
};
