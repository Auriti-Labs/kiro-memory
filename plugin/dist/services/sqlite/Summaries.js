import { createRequire } from 'module';const require = createRequire(import.meta.url);

// src/services/sqlite/Summaries.ts
function escapeLikePattern(input) {
  return input.replace(/[%_\\]/g, "\\$&");
}
function createSummary(db, sessionId, project, request, investigated, learned, completed, nextSteps, notes) {
  const now = /* @__PURE__ */ new Date();
  const result = db.run(
    `INSERT INTO summaries 
     (session_id, project, request, investigated, learned, completed, next_steps, notes, created_at, created_at_epoch)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [sessionId, project, request, investigated, learned, completed, nextSteps, notes, now.toISOString(), now.getTime()]
  );
  return Number(result.lastInsertRowid);
}
function getSummaryBySession(db, sessionId) {
  const query = db.query("SELECT * FROM summaries WHERE session_id = ? ORDER BY created_at_epoch DESC LIMIT 1");
  return query.get(sessionId);
}
function getSummariesByProject(db, project, limit = 50) {
  const query = db.query(
    "SELECT * FROM summaries WHERE project = ? ORDER BY created_at_epoch DESC LIMIT ?"
  );
  return query.all(project, limit);
}
function searchSummaries(db, searchTerm, project) {
  const sql = project ? `SELECT * FROM summaries
       WHERE project = ? AND (request LIKE ? ESCAPE '\\' OR learned LIKE ? ESCAPE '\\' OR completed LIKE ? ESCAPE '\\' OR notes LIKE ? ESCAPE '\\')
       ORDER BY created_at_epoch DESC` : `SELECT * FROM summaries
       WHERE request LIKE ? ESCAPE '\\' OR learned LIKE ? ESCAPE '\\' OR completed LIKE ? ESCAPE '\\' OR notes LIKE ? ESCAPE '\\'
       ORDER BY created_at_epoch DESC`;
  const pattern = `%${escapeLikePattern(searchTerm)}%`;
  const query = db.query(sql);
  if (project) {
    return query.all(project, pattern, pattern, pattern, pattern);
  }
  return query.all(pattern, pattern, pattern, pattern);
}
function deleteSummary(db, id) {
  db.run("DELETE FROM summaries WHERE id = ?", [id]);
}
export {
  createSummary,
  deleteSummary,
  getSummariesByProject,
  getSummaryBySession,
  searchSummaries
};
