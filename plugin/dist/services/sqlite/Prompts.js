import { createRequire } from 'module';const require = createRequire(import.meta.url);

// src/services/sqlite/Prompts.ts
function createPrompt(db, contentSessionId, project, promptNumber, promptText) {
  const now = /* @__PURE__ */ new Date();
  const result = db.run(
    `INSERT INTO prompts 
     (content_session_id, project, prompt_number, prompt_text, created_at, created_at_epoch)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [contentSessionId, project, promptNumber, promptText, now.toISOString(), now.getTime()]
  );
  return Number(result.lastInsertRowid);
}
function getPromptsBySession(db, contentSessionId) {
  const query = db.query(
    "SELECT * FROM prompts WHERE content_session_id = ? ORDER BY prompt_number ASC"
  );
  return query.all(contentSessionId);
}
function getPromptsByProject(db, project, limit = 100) {
  const query = db.query(
    "SELECT * FROM prompts WHERE project = ? ORDER BY created_at_epoch DESC LIMIT ?"
  );
  return query.all(project, limit);
}
function getLatestPrompt(db, contentSessionId) {
  const query = db.query(
    "SELECT * FROM prompts WHERE content_session_id = ? ORDER BY prompt_number DESC LIMIT 1"
  );
  return query.get(contentSessionId);
}
function deletePrompt(db, id) {
  db.run("DELETE FROM prompts WHERE id = ?", [id]);
}
export {
  createPrompt,
  deletePrompt,
  getLatestPrompt,
  getPromptsByProject,
  getPromptsBySession
};
