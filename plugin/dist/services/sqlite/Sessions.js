import { createRequire } from 'module';const require = createRequire(import.meta.url);

// src/services/sqlite/Sessions.ts
function createSession(db, contentSessionId, project, userPrompt) {
  const now = /* @__PURE__ */ new Date();
  const result = db.run(
    `INSERT INTO sessions (content_session_id, project, user_prompt, status, started_at, started_at_epoch)
     VALUES (?, ?, ?, 'active', ?, ?)`,
    [contentSessionId, project, userPrompt, now.toISOString(), now.getTime()]
  );
  return Number(result.lastInsertRowid);
}
function getSessionByContentId(db, contentSessionId) {
  const query = db.query("SELECT * FROM sessions WHERE content_session_id = ?");
  return query.get(contentSessionId);
}
function getSessionById(db, id) {
  const query = db.query("SELECT * FROM sessions WHERE id = ?");
  return query.get(id);
}
function updateSessionMemoryId(db, id, memorySessionId) {
  db.run(
    "UPDATE sessions SET memory_session_id = ? WHERE id = ?",
    [memorySessionId, id]
  );
}
function completeSession(db, id) {
  const now = /* @__PURE__ */ new Date();
  db.run(
    `UPDATE sessions 
     SET status = 'completed', completed_at = ?, completed_at_epoch = ?
     WHERE id = ?`,
    [now.toISOString(), now.getTime(), id]
  );
}
function failSession(db, id) {
  const now = /* @__PURE__ */ new Date();
  db.run(
    `UPDATE sessions 
     SET status = 'failed', completed_at = ?, completed_at_epoch = ?
     WHERE id = ?`,
    [now.toISOString(), now.getTime(), id]
  );
}
function getActiveSessions(db) {
  const query = db.query("SELECT * FROM sessions WHERE status = 'active' ORDER BY started_at_epoch DESC");
  return query.all();
}
function getSessionsByProject(db, project, limit = 100) {
  const query = db.query("SELECT * FROM sessions WHERE project = ? ORDER BY started_at_epoch DESC LIMIT ?");
  return query.all(project, limit);
}
export {
  completeSession,
  createSession,
  failSession,
  getActiveSessions,
  getSessionByContentId,
  getSessionById,
  getSessionsByProject,
  updateSessionMemoryId
};
