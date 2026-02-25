#!/usr/bin/env node
import { createRequire } from 'module';const require = createRequire(import.meta.url);
var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
  get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
}) : x)(function(x) {
  if (typeof require !== "undefined") return require.apply(this, arguments);
  throw Error('Dynamic require of "' + x + '" is not supported');
});
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// src/services/sqlite/Observations.ts
var Observations_exports = {};
__export(Observations_exports, {
  consolidateObservations: () => consolidateObservations,
  createObservation: () => createObservation,
  deleteObservation: () => deleteObservation,
  getObservationsByProject: () => getObservationsByProject,
  getObservationsBySession: () => getObservationsBySession,
  isDuplicateObservation: () => isDuplicateObservation,
  searchObservations: () => searchObservations,
  updateLastAccessed: () => updateLastAccessed
});
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
var init_Observations = __esm({
  "src/services/sqlite/Observations.ts"() {
    "use strict";
  }
});

// src/services/sqlite/Search.ts
var Search_exports = {};
__export(Search_exports, {
  getObservationsByIds: () => getObservationsByIds,
  getProjectStats: () => getProjectStats,
  getStaleObservations: () => getStaleObservations,
  getTimeline: () => getTimeline,
  markObservationsStale: () => markObservationsStale,
  searchObservationsFTS: () => searchObservationsFTS,
  searchObservationsFTSWithRank: () => searchObservationsFTSWithRank,
  searchObservationsLIKE: () => searchObservationsLIKE,
  searchSummariesFiltered: () => searchSummariesFiltered
});
import { existsSync as existsSync4, statSync } from "fs";
function escapeLikePattern3(input) {
  return input.replace(/[%_\\]/g, "\\$&");
}
function sanitizeFTS5Query(query) {
  const trimmed = query.length > 1e4 ? query.substring(0, 1e4) : query;
  const terms = trimmed.replace(/[""]/g, "").split(/\s+/).filter((t) => t.length > 0).slice(0, 100).map((t) => `"${t}"`);
  return terms.join(" ");
}
function searchObservationsFTS(db, query, filters = {}) {
  const limit = filters.limit || 50;
  try {
    const safeQuery = sanitizeFTS5Query(query);
    if (!safeQuery) return searchObservationsLIKE(db, query, filters);
    let sql = `
      SELECT o.* FROM observations o
      JOIN observations_fts fts ON o.id = fts.rowid
      WHERE observations_fts MATCH ?
    `;
    const params = [safeQuery];
    if (filters.project) {
      sql += " AND o.project = ?";
      params.push(filters.project);
    }
    if (filters.type) {
      sql += " AND o.type = ?";
      params.push(filters.type);
    }
    if (filters.dateStart) {
      sql += " AND o.created_at_epoch >= ?";
      params.push(filters.dateStart);
    }
    if (filters.dateEnd) {
      sql += " AND o.created_at_epoch <= ?";
      params.push(filters.dateEnd);
    }
    sql += ` ORDER BY bm25(observations_fts, ${BM25_WEIGHTS}) LIMIT ?`;
    params.push(limit);
    const stmt = db.query(sql);
    return stmt.all(...params);
  } catch {
    return searchObservationsLIKE(db, query, filters);
  }
}
function searchObservationsFTSWithRank(db, query, filters = {}) {
  const limit = filters.limit || 50;
  try {
    const safeQuery = sanitizeFTS5Query(query);
    if (!safeQuery) return [];
    let sql = `
      SELECT o.*, bm25(observations_fts, ${BM25_WEIGHTS}) as fts5_rank FROM observations o
      JOIN observations_fts fts ON o.id = fts.rowid
      WHERE observations_fts MATCH ?
    `;
    const params = [safeQuery];
    if (filters.project) {
      sql += " AND o.project = ?";
      params.push(filters.project);
    }
    if (filters.type) {
      sql += " AND o.type = ?";
      params.push(filters.type);
    }
    if (filters.dateStart) {
      sql += " AND o.created_at_epoch >= ?";
      params.push(filters.dateStart);
    }
    if (filters.dateEnd) {
      sql += " AND o.created_at_epoch <= ?";
      params.push(filters.dateEnd);
    }
    sql += ` ORDER BY bm25(observations_fts, ${BM25_WEIGHTS}) LIMIT ?`;
    params.push(limit);
    const stmt = db.query(sql);
    return stmt.all(...params);
  } catch {
    return [];
  }
}
function searchObservationsLIKE(db, query, filters = {}) {
  const limit = filters.limit || 50;
  const pattern = `%${escapeLikePattern3(query)}%`;
  let sql = `
    SELECT * FROM observations
    WHERE (title LIKE ? ESCAPE '\\' OR text LIKE ? ESCAPE '\\' OR narrative LIKE ? ESCAPE '\\' OR concepts LIKE ? ESCAPE '\\')
  `;
  const params = [pattern, pattern, pattern, pattern];
  if (filters.project) {
    sql += " AND project = ?";
    params.push(filters.project);
  }
  if (filters.type) {
    sql += " AND type = ?";
    params.push(filters.type);
  }
  if (filters.dateStart) {
    sql += " AND created_at_epoch >= ?";
    params.push(filters.dateStart);
  }
  if (filters.dateEnd) {
    sql += " AND created_at_epoch <= ?";
    params.push(filters.dateEnd);
  }
  sql += " ORDER BY created_at_epoch DESC LIMIT ?";
  params.push(limit);
  const stmt = db.query(sql);
  return stmt.all(...params);
}
function searchSummariesFiltered(db, query, filters = {}) {
  const limit = filters.limit || 20;
  const pattern = `%${escapeLikePattern3(query)}%`;
  let sql = `
    SELECT * FROM summaries
    WHERE (request LIKE ? ESCAPE '\\' OR learned LIKE ? ESCAPE '\\' OR completed LIKE ? ESCAPE '\\' OR notes LIKE ? ESCAPE '\\' OR next_steps LIKE ? ESCAPE '\\')
  `;
  const params = [pattern, pattern, pattern, pattern, pattern];
  if (filters.project) {
    sql += " AND project = ?";
    params.push(filters.project);
  }
  if (filters.dateStart) {
    sql += " AND created_at_epoch >= ?";
    params.push(filters.dateStart);
  }
  if (filters.dateEnd) {
    sql += " AND created_at_epoch <= ?";
    params.push(filters.dateEnd);
  }
  sql += " ORDER BY created_at_epoch DESC LIMIT ?";
  params.push(limit);
  const stmt = db.query(sql);
  return stmt.all(...params);
}
function getObservationsByIds(db, ids) {
  if (!Array.isArray(ids) || ids.length === 0) return [];
  const validIds = ids.filter((id) => typeof id === "number" && Number.isInteger(id) && id > 0).slice(0, 500);
  if (validIds.length === 0) return [];
  const placeholders = validIds.map(() => "?").join(",");
  const sql = `SELECT * FROM observations WHERE id IN (${placeholders}) ORDER BY created_at_epoch DESC`;
  const stmt = db.query(sql);
  return stmt.all(...validIds);
}
function getTimeline(db, anchorId, depthBefore = 5, depthAfter = 5) {
  const anchorStmt = db.query("SELECT created_at_epoch FROM observations WHERE id = ?");
  const anchor = anchorStmt.get(anchorId);
  if (!anchor) return [];
  const anchorEpoch = anchor.created_at_epoch;
  const beforeStmt = db.query(`
    SELECT id, 'observation' as type, title, text as content, project, created_at, created_at_epoch
    FROM observations
    WHERE created_at_epoch < ?
    ORDER BY created_at_epoch DESC
    LIMIT ?
  `);
  const before = beforeStmt.all(anchorEpoch, depthBefore).reverse();
  const selfStmt = db.query(`
    SELECT id, 'observation' as type, title, text as content, project, created_at, created_at_epoch
    FROM observations WHERE id = ?
  `);
  const self = selfStmt.all(anchorId);
  const afterStmt = db.query(`
    SELECT id, 'observation' as type, title, text as content, project, created_at, created_at_epoch
    FROM observations
    WHERE created_at_epoch > ?
    ORDER BY created_at_epoch ASC
    LIMIT ?
  `);
  const after = afterStmt.all(anchorEpoch, depthAfter);
  return [...before, ...self, ...after];
}
function getProjectStats(db, project) {
  const obsStmt = db.query("SELECT COUNT(*) as count FROM observations WHERE project = ?");
  const sumStmt = db.query("SELECT COUNT(*) as count FROM summaries WHERE project = ?");
  const sesStmt = db.query("SELECT COUNT(*) as count FROM sessions WHERE project = ?");
  const prmStmt = db.query("SELECT COUNT(*) as count FROM prompts WHERE project = ?");
  const discoveryStmt = db.query(
    "SELECT COALESCE(SUM(discovery_tokens), 0) as total FROM observations WHERE project = ?"
  );
  const discoveryTokens = discoveryStmt.get(project)?.total || 0;
  const readStmt = db.query(
    `SELECT COALESCE(SUM(
      CAST((LENGTH(COALESCE(title, '')) + LENGTH(COALESCE(narrative, ''))) / 4 AS INTEGER)
    ), 0) as total FROM observations WHERE project = ?`
  );
  const readTokens = readStmt.get(project)?.total || 0;
  const savings = Math.max(0, discoveryTokens - readTokens);
  return {
    observations: obsStmt.get(project)?.count || 0,
    summaries: sumStmt.get(project)?.count || 0,
    sessions: sesStmt.get(project)?.count || 0,
    prompts: prmStmt.get(project)?.count || 0,
    tokenEconomics: { discoveryTokens, readTokens, savings }
  };
}
function getStaleObservations(db, project) {
  const rows = db.query(`
    SELECT * FROM observations
    WHERE project = ? AND files_modified IS NOT NULL AND files_modified != ''
    ORDER BY created_at_epoch DESC
    LIMIT 500
  `).all(project);
  const staleObs = [];
  for (const obs of rows) {
    if (!obs.files_modified) continue;
    const files = obs.files_modified.split(",").map((f) => f.trim()).filter(Boolean);
    let isStale = false;
    for (const filepath of files) {
      try {
        if (!existsSync4(filepath)) continue;
        const stat = statSync(filepath);
        if (stat.mtimeMs > obs.created_at_epoch) {
          isStale = true;
          break;
        }
      } catch {
      }
    }
    if (isStale) {
      staleObs.push(obs);
    }
  }
  return staleObs;
}
function markObservationsStale(db, ids, stale) {
  if (!Array.isArray(ids) || ids.length === 0) return;
  const validIds = ids.filter((id) => typeof id === "number" && Number.isInteger(id) && id > 0).slice(0, 500);
  if (validIds.length === 0) return;
  const placeholders = validIds.map(() => "?").join(",");
  db.run(
    `UPDATE observations SET is_stale = ? WHERE id IN (${placeholders})`,
    [stale ? 1 : 0, ...validIds]
  );
}
var BM25_WEIGHTS;
var init_Search = __esm({
  "src/services/sqlite/Search.ts"() {
    "use strict";
    BM25_WEIGHTS = "10.0, 1.0, 5.0, 3.0";
  }
});

// src/hooks/utils.ts
import { writeFileSync, mkdirSync, existsSync, readFileSync } from "fs";
import { join } from "path";

// src/services/search/ScoringEngine.ts
var SEARCH_WEIGHTS = {
  semantic: 0.4,
  fts5: 0.3,
  recency: 0.2,
  projectMatch: 0.1
};
var CONTEXT_WEIGHTS = {
  semantic: 0,
  fts5: 0,
  recency: 0.7,
  projectMatch: 0.3
};
function recencyScore(createdAtEpoch, halfLifeHours = 168) {
  if (!createdAtEpoch || createdAtEpoch <= 0) return 0;
  const nowMs = Date.now();
  const ageMs = nowMs - createdAtEpoch;
  if (ageMs <= 0) return 1;
  const ageHours = ageMs / (1e3 * 60 * 60);
  return Math.exp(-ageHours * Math.LN2 / halfLifeHours);
}
function normalizeFTS5Rank(rank, allRanks) {
  if (allRanks.length === 0) return 0;
  if (allRanks.length === 1) return 1;
  const minRank = Math.min(...allRanks);
  const maxRank = Math.max(...allRanks);
  if (minRank === maxRank) return 1;
  return (maxRank - rank) / (maxRank - minRank);
}
function projectMatchScore(itemProject, targetProject) {
  if (!itemProject || !targetProject) return 0;
  return itemProject.toLowerCase() === targetProject.toLowerCase() ? 1 : 0;
}
function computeCompositeScore(signals, weights) {
  return signals.semantic * weights.semantic + signals.fts5 * weights.fts5 + signals.recency * weights.recency + signals.projectMatch * weights.projectMatch;
}
var KNOWLEDGE_TYPE_BOOST = {
  constraint: 1.3,
  decision: 1.25,
  heuristic: 1.15,
  rejected: 1.1
};
function knowledgeTypeBoost(type) {
  return KNOWLEDGE_TYPE_BOOST[type] ?? 1;
}

// src/hooks/utils.ts
var DATA_DIR = process.env.KIRO_MEMORY_DATA_DIR || process.env.CONTEXTKIT_DATA_DIR || join(process.env.HOME || "/tmp", ".kiro-memory");
var TOKEN_FILE = join(DATA_DIR, "worker.token");
function debugLog(hookName, label, data) {
  if ((process.env.KIRO_MEMORY_LOG_LEVEL || "").toUpperCase() !== "DEBUG") return;
  try {
    const dataDir = process.env.KIRO_MEMORY_DATA_DIR || join(process.env.HOME || "/tmp", ".kiro-memory");
    const logDir = join(dataDir, "logs");
    if (!existsSync(logDir)) mkdirSync(logDir, { recursive: true });
    const ts = (/* @__PURE__ */ new Date()).toISOString();
    const line = `[${ts}] [${hookName}] ${label}: ${JSON.stringify(data)}
`;
    const logFile = join(logDir, `hooks-${(/* @__PURE__ */ new Date()).toISOString().split("T")[0]}.log`);
    writeFileSync(logFile, line, { flag: "a" });
  } catch {
  }
}
async function readStdin() {
  return new Promise((resolve, reject) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    const safetyTimeout = setTimeout(() => {
      if (!data.trim()) {
        resolve({
          hook_event_name: "agentSpawn",
          cwd: process.cwd()
        });
      }
    }, 5e3);
    process.stdin.on("data", (chunk) => {
      data += chunk;
    });
    process.stdin.on("end", () => {
      clearTimeout(safetyTimeout);
      try {
        if (!data.trim()) {
          resolve({
            hook_event_name: "agentSpawn",
            cwd: process.cwd()
          });
          return;
        }
        resolve(JSON.parse(data));
      } catch (err) {
        reject(new Error(`Errore parsing stdin JSON: ${err}`));
      }
    });
    process.stdin.on("error", (err) => {
      clearTimeout(safetyTimeout);
      reject(err);
    });
  });
}
function detectProject(cwd) {
  try {
    const { execSync } = __require("child_process");
    const gitRoot = execSync("git rev-parse --show-toplevel", {
      cwd,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "ignore"]
    }).trim();
    return gitRoot.split("/").pop() || "default";
  } catch {
    return cwd.split("/").pop() || "default";
  }
}
async function notifyWorker(event, data) {
  const host = process.env.KIRO_MEMORY_WORKER_HOST || "127.0.0.1";
  const port = process.env.KIRO_MEMORY_WORKER_PORT || "3001";
  try {
    let token = "";
    try {
      token = readFileSync(TOKEN_FILE, "utf-8").trim();
    } catch {
      return;
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 1500);
    await fetch(`http://${host}:${port}/api/notify`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Worker-Token": token
      },
      body: JSON.stringify({ event, data: data || {} }),
      signal: controller.signal
    });
    clearTimeout(timeout);
  } catch {
  }
}
async function runHook(name, handler) {
  try {
    const input = await readStdin();
    if (!input.cwd && input.workspace_roots?.[0]) {
      input.cwd = input.workspace_roots[0];
    }
    if (!input.session_id && input.conversation_id) {
      input.session_id = input.conversation_id;
    }
    debugLog(name, "stdin", input);
    await handler(input);
    debugLog(name, "completato", { success: true });
    process.exit(0);
  } catch (error) {
    debugLog(name, "errore", { error: String(error) });
    process.stderr.write(`[kiro-memory:${name}] Errore: ${error}
`);
    process.exit(0);
  }
}

// src/shims/bun-sqlite.ts
import BetterSqlite3 from "better-sqlite3";
var Database = class {
  _db;
  constructor(path, options) {
    this._db = new BetterSqlite3(path, {
      // better-sqlite3 crea il file di default (non serve 'create')
      readonly: options?.readwrite === false ? true : false
    });
  }
  /**
   * Esegui una query SQL senza risultati
   */
  run(sql, params) {
    const stmt = this._db.prepare(sql);
    const result = params ? stmt.run(...params) : stmt.run();
    return result;
  }
  /**
   * Prepara una query con interfaccia compatibile bun:sqlite
   */
  query(sql) {
    return new BunQueryCompat(this._db, sql);
  }
  /**
   * Crea una transazione
   */
  transaction(fn) {
    return this._db.transaction(fn);
  }
  /**
   * Chiudi la connessione
   */
  close() {
    this._db.close();
  }
};
var BunQueryCompat = class {
  _db;
  _sql;
  constructor(db, sql) {
    this._db = db;
    this._sql = sql;
  }
  /**
   * Restituisce tutte le righe
   */
  all(...params) {
    const stmt = this._db.prepare(this._sql);
    return params.length > 0 ? stmt.all(...params) : stmt.all();
  }
  /**
   * Restituisce la prima riga o null
   */
  get(...params) {
    const stmt = this._db.prepare(this._sql);
    return params.length > 0 ? stmt.get(...params) : stmt.get();
  }
  /**
   * Esegui senza risultati
   */
  run(...params) {
    const stmt = this._db.prepare(this._sql);
    return params.length > 0 ? stmt.run(...params) : stmt.run();
  }
};

// src/shared/paths.ts
import { join as join3, dirname, basename } from "path";
import { homedir as homedir2 } from "os";
import { existsSync as existsSync3, mkdirSync as mkdirSync3 } from "fs";
import { fileURLToPath } from "url";

// src/utils/logger.ts
import { appendFileSync, existsSync as existsSync2, mkdirSync as mkdirSync2, readFileSync as readFileSync2 } from "fs";
import { join as join2 } from "path";
import { homedir } from "os";
var LogLevel = /* @__PURE__ */ ((LogLevel2) => {
  LogLevel2[LogLevel2["DEBUG"] = 0] = "DEBUG";
  LogLevel2[LogLevel2["INFO"] = 1] = "INFO";
  LogLevel2[LogLevel2["WARN"] = 2] = "WARN";
  LogLevel2[LogLevel2["ERROR"] = 3] = "ERROR";
  LogLevel2[LogLevel2["SILENT"] = 4] = "SILENT";
  return LogLevel2;
})(LogLevel || {});
var DEFAULT_DATA_DIR = join2(homedir(), ".contextkit");
var Logger = class {
  level = null;
  useColor;
  logFilePath = null;
  logFileInitialized = false;
  constructor() {
    this.useColor = process.stdout.isTTY ?? false;
  }
  /**
   * Initialize log file path and ensure directory exists (lazy initialization)
   */
  ensureLogFileInitialized() {
    if (this.logFileInitialized) return;
    this.logFileInitialized = true;
    try {
      const logsDir = join2(DEFAULT_DATA_DIR, "logs");
      if (!existsSync2(logsDir)) {
        mkdirSync2(logsDir, { recursive: true });
      }
      const date = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
      this.logFilePath = join2(logsDir, `kiro-memory-${date}.log`);
    } catch (error) {
      console.error("[LOGGER] Failed to initialize log file:", error);
      this.logFilePath = null;
    }
  }
  /**
   * Lazy-load log level from settings file
   */
  getLevel() {
    if (this.level === null) {
      try {
        const settingsPath = join2(DEFAULT_DATA_DIR, "settings.json");
        if (existsSync2(settingsPath)) {
          const settingsData = readFileSync2(settingsPath, "utf-8");
          const settings = JSON.parse(settingsData);
          const envLevel = (settings.KIRO_MEMORY_LOG_LEVEL || settings.CONTEXTKIT_LOG_LEVEL || "INFO").toUpperCase();
          this.level = LogLevel[envLevel] ?? 1 /* INFO */;
        } else {
          this.level = 1 /* INFO */;
        }
      } catch (error) {
        this.level = 1 /* INFO */;
      }
    }
    return this.level;
  }
  /**
   * Create correlation ID for tracking an observation through the pipeline
   */
  correlationId(sessionId, observationNum) {
    return `obs-${sessionId}-${observationNum}`;
  }
  /**
   * Create session correlation ID
   */
  sessionId(sessionId) {
    return `session-${sessionId}`;
  }
  /**
   * Format data for logging - create compact summaries instead of full dumps
   */
  formatData(data) {
    if (data === null || data === void 0) return "";
    if (typeof data === "string") return data;
    if (typeof data === "number") return data.toString();
    if (typeof data === "boolean") return data.toString();
    if (typeof data === "object") {
      if (data instanceof Error) {
        return this.getLevel() === 0 /* DEBUG */ ? `${data.message}
${data.stack}` : data.message;
      }
      if (Array.isArray(data)) {
        return `[${data.length} items]`;
      }
      const keys = Object.keys(data);
      if (keys.length === 0) return "{}";
      if (keys.length <= 3) {
        return JSON.stringify(data);
      }
      return `{${keys.length} keys: ${keys.slice(0, 3).join(", ")}...}`;
    }
    return String(data);
  }
  /**
   * Format timestamp in local timezone (YYYY-MM-DD HH:MM:SS.mmm)
   */
  formatTimestamp(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");
    const seconds = String(date.getSeconds()).padStart(2, "0");
    const ms = String(date.getMilliseconds()).padStart(3, "0");
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}.${ms}`;
  }
  /**
   * Core logging method
   */
  log(level, component, message, context, data) {
    if (level < this.getLevel()) return;
    this.ensureLogFileInitialized();
    const timestamp = this.formatTimestamp(/* @__PURE__ */ new Date());
    const levelStr = LogLevel[level].padEnd(5);
    const componentStr = component.padEnd(6);
    let correlationStr = "";
    if (context?.correlationId) {
      correlationStr = `[${context.correlationId}] `;
    } else if (context?.sessionId) {
      correlationStr = `[session-${context.sessionId}] `;
    }
    let dataStr = "";
    if (data !== void 0 && data !== null) {
      if (data instanceof Error) {
        dataStr = this.getLevel() === 0 /* DEBUG */ ? `
${data.message}
${data.stack}` : ` ${data.message}`;
      } else if (this.getLevel() === 0 /* DEBUG */ && typeof data === "object") {
        dataStr = "\n" + JSON.stringify(data, null, 2);
      } else {
        dataStr = " " + this.formatData(data);
      }
    }
    let contextStr = "";
    if (context) {
      const { sessionId, memorySessionId, correlationId, ...rest } = context;
      if (Object.keys(rest).length > 0) {
        const pairs = Object.entries(rest).map(([k, v]) => `${k}=${v}`);
        contextStr = ` {${pairs.join(", ")}}`;
      }
    }
    const logLine = `[${timestamp}] [${levelStr}] [${componentStr}] ${correlationStr}${message}${contextStr}${dataStr}`;
    if (this.logFilePath) {
      try {
        appendFileSync(this.logFilePath, logLine + "\n", "utf8");
      } catch (error) {
        process.stderr.write(`[LOGGER] Failed to write to log file: ${error}
`);
      }
    } else {
      process.stderr.write(logLine + "\n");
    }
  }
  // Public logging methods
  debug(component, message, context, data) {
    this.log(0 /* DEBUG */, component, message, context, data);
  }
  info(component, message, context, data) {
    this.log(1 /* INFO */, component, message, context, data);
  }
  warn(component, message, context, data) {
    this.log(2 /* WARN */, component, message, context, data);
  }
  error(component, message, context, data) {
    this.log(3 /* ERROR */, component, message, context, data);
  }
  /**
   * Log data flow: input → processing
   */
  dataIn(component, message, context, data) {
    this.info(component, `\u2192 ${message}`, context, data);
  }
  /**
   * Log data flow: processing → output
   */
  dataOut(component, message, context, data) {
    this.info(component, `\u2190 ${message}`, context, data);
  }
  /**
   * Log successful completion
   */
  success(component, message, context, data) {
    this.info(component, `\u2713 ${message}`, context, data);
  }
  /**
   * Log failure
   */
  failure(component, message, context, data) {
    this.error(component, `\u2717 ${message}`, context, data);
  }
  /**
   * Log timing information
   */
  timing(component, message, durationMs, context) {
    this.info(component, `\u23F1 ${message}`, context, { duration: `${durationMs}ms` });
  }
  /**
   * Happy Path Error - logs when the expected "happy path" fails but we have a fallback
   */
  happyPathError(component, message, context, data, fallback = "") {
    const stack = new Error().stack || "";
    const stackLines = stack.split("\n");
    const callerLine = stackLines[2] || "";
    const callerMatch = callerLine.match(/at\s+(?:.*\s+)?\(?([^:]+):(\d+):(\d+)\)?/);
    const location = callerMatch ? `${callerMatch[1].split("/").pop()}:${callerMatch[2]}` : "unknown";
    const enhancedContext = {
      ...context,
      location
    };
    this.warn(component, `[HAPPY-PATH] ${message}`, enhancedContext, data);
    return fallback;
  }
};
var logger = new Logger();

// src/shared/paths.ts
function getDirname() {
  if (typeof __dirname !== "undefined") {
    return __dirname;
  }
  return dirname(fileURLToPath(import.meta.url));
}
var _dirname = getDirname();
var _legacyDir = join3(homedir2(), ".contextkit");
var _defaultDir = existsSync3(_legacyDir) ? _legacyDir : join3(homedir2(), ".kiro-memory");
var DATA_DIR2 = process.env.KIRO_MEMORY_DATA_DIR || process.env.CONTEXTKIT_DATA_DIR || _defaultDir;
var KIRO_CONFIG_DIR = process.env.KIRO_CONFIG_DIR || join3(homedir2(), ".kiro");
var PLUGIN_ROOT = join3(KIRO_CONFIG_DIR, "plugins", "kiro-memory");
var ARCHIVES_DIR = join3(DATA_DIR2, "archives");
var LOGS_DIR = join3(DATA_DIR2, "logs");
var TRASH_DIR = join3(DATA_DIR2, "trash");
var BACKUPS_DIR = join3(DATA_DIR2, "backups");
var MODES_DIR = join3(DATA_DIR2, "modes");
var USER_SETTINGS_PATH = join3(DATA_DIR2, "settings.json");
var _legacyDb = join3(DATA_DIR2, "contextkit.db");
var DB_PATH = existsSync3(_legacyDb) ? _legacyDb : join3(DATA_DIR2, "kiro-memory.db");
var VECTOR_DB_DIR = join3(DATA_DIR2, "vector-db");
var OBSERVER_SESSIONS_DIR = join3(DATA_DIR2, "observer-sessions");
var KIRO_SETTINGS_PATH = join3(KIRO_CONFIG_DIR, "settings.json");
var KIRO_CONTEXT_PATH = join3(KIRO_CONFIG_DIR, "context.md");
function ensureDir(dirPath) {
  mkdirSync3(dirPath, { recursive: true });
}

// src/services/sqlite/Database.ts
var SQLITE_MMAP_SIZE_BYTES = 256 * 1024 * 1024;
var SQLITE_CACHE_SIZE_PAGES = 1e4;
var KiroMemoryDatabase = class {
  db;
  /**
   * @param dbPath - Percorso al file SQLite (default: DB_PATH)
   * @param skipMigrations - Se true, salta il migration runner (per hook ad alta frequenza)
   */
  constructor(dbPath = DB_PATH, skipMigrations = false) {
    if (dbPath !== ":memory:") {
      ensureDir(DATA_DIR2);
    }
    this.db = new Database(dbPath, { create: true, readwrite: true });
    this.db.run("PRAGMA journal_mode = WAL");
    this.db.run("PRAGMA synchronous = NORMAL");
    this.db.run("PRAGMA foreign_keys = ON");
    this.db.run("PRAGMA temp_store = memory");
    this.db.run(`PRAGMA mmap_size = ${SQLITE_MMAP_SIZE_BYTES}`);
    this.db.run(`PRAGMA cache_size = ${SQLITE_CACHE_SIZE_PAGES}`);
    if (!skipMigrations) {
      const migrationRunner = new MigrationRunner(this.db);
      migrationRunner.runAllMigrations();
    }
  }
  /**
   * Esegue una funzione all'interno di una transazione atomica.
   * Se fn() lancia un errore, la transazione viene annullata automaticamente.
   */
  withTransaction(fn) {
    const transaction = this.db.transaction(fn);
    return transaction(this.db);
  }
  /**
   * Close the database connection
   */
  close() {
    this.db.close();
  }
};
var MigrationRunner = class {
  db;
  constructor(db) {
    this.db = db;
  }
  runAllMigrations() {
    this.db.run(`
      CREATE TABLE IF NOT EXISTS schema_versions (
        id INTEGER PRIMARY KEY,
        version INTEGER UNIQUE NOT NULL,
        applied_at TEXT NOT NULL
      )
    `);
    const versionQuery = this.db.query("SELECT MAX(version) as version FROM schema_versions");
    const result = versionQuery.get();
    const currentVersion = result?.version || 0;
    const migrations = this.getMigrations();
    for (const migration of migrations) {
      if (migration.version > currentVersion) {
        logger.info("DB", `Applying migration ${migration.version}`);
        const transaction = this.db.transaction(() => {
          migration.up(this.db);
          const insert = this.db.query("INSERT INTO schema_versions (version, applied_at) VALUES (?, ?)");
          insert.run(migration.version, (/* @__PURE__ */ new Date()).toISOString());
        });
        transaction();
        logger.info("DB", `Migration ${migration.version} applied successfully`);
      }
    }
  }
  getMigrations() {
    return [
      {
        version: 1,
        up: (db) => {
          db.run(`
            CREATE TABLE IF NOT EXISTS sessions (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              content_session_id TEXT NOT NULL UNIQUE,
              project TEXT NOT NULL,
              user_prompt TEXT NOT NULL,
              memory_session_id TEXT,
              status TEXT DEFAULT 'active',
              started_at TEXT NOT NULL,
              started_at_epoch INTEGER NOT NULL,
              completed_at TEXT,
              completed_at_epoch INTEGER
            )
          `);
          db.run(`
            CREATE TABLE IF NOT EXISTS observations (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              memory_session_id TEXT NOT NULL,
              project TEXT NOT NULL,
              type TEXT NOT NULL,
              title TEXT NOT NULL,
              subtitle TEXT,
              text TEXT,
              narrative TEXT,
              facts TEXT,
              concepts TEXT,
              files_read TEXT,
              files_modified TEXT,
              prompt_number INTEGER NOT NULL,
              created_at TEXT NOT NULL,
              created_at_epoch INTEGER NOT NULL
            )
          `);
          db.run(`
            CREATE TABLE IF NOT EXISTS summaries (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              session_id TEXT NOT NULL,
              project TEXT NOT NULL,
              request TEXT,
              investigated TEXT,
              learned TEXT,
              completed TEXT,
              next_steps TEXT,
              notes TEXT,
              created_at TEXT NOT NULL,
              created_at_epoch INTEGER NOT NULL
            )
          `);
          db.run(`
            CREATE TABLE IF NOT EXISTS prompts (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              content_session_id TEXT NOT NULL,
              project TEXT NOT NULL,
              prompt_number INTEGER NOT NULL,
              prompt_text TEXT NOT NULL,
              created_at TEXT NOT NULL,
              created_at_epoch INTEGER NOT NULL
            )
          `);
          db.run(`
            CREATE TABLE IF NOT EXISTS pending_messages (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              content_session_id TEXT NOT NULL,
              type TEXT NOT NULL,
              data TEXT NOT NULL,
              created_at TEXT NOT NULL,
              created_at_epoch INTEGER NOT NULL
            )
          `);
          db.run("CREATE INDEX IF NOT EXISTS idx_sessions_project ON sessions(project)");
          db.run("CREATE INDEX IF NOT EXISTS idx_observations_project ON observations(project)");
          db.run("CREATE INDEX IF NOT EXISTS idx_observations_session ON observations(memory_session_id)");
          db.run("CREATE INDEX IF NOT EXISTS idx_summaries_session ON summaries(session_id)");
          db.run("CREATE INDEX IF NOT EXISTS idx_prompts_session ON prompts(content_session_id)");
        }
      },
      {
        version: 2,
        up: (db) => {
          db.run(`
            CREATE VIRTUAL TABLE IF NOT EXISTS observations_fts USING fts5(
              title, text, narrative, concepts,
              content='observations',
              content_rowid='id'
            )
          `);
          db.run(`
            CREATE TRIGGER IF NOT EXISTS observations_ai AFTER INSERT ON observations BEGIN
              INSERT INTO observations_fts(rowid, title, text, narrative, concepts)
              VALUES (new.id, new.title, new.text, new.narrative, new.concepts);
            END
          `);
          db.run(`
            CREATE TRIGGER IF NOT EXISTS observations_ad AFTER DELETE ON observations BEGIN
              INSERT INTO observations_fts(observations_fts, rowid, title, text, narrative, concepts)
              VALUES ('delete', old.id, old.title, old.text, old.narrative, old.concepts);
            END
          `);
          db.run(`
            CREATE TRIGGER IF NOT EXISTS observations_au AFTER UPDATE ON observations BEGIN
              INSERT INTO observations_fts(observations_fts, rowid, title, text, narrative, concepts)
              VALUES ('delete', old.id, old.title, old.text, old.narrative, old.concepts);
              INSERT INTO observations_fts(rowid, title, text, narrative, concepts)
              VALUES (new.id, new.title, new.text, new.narrative, new.concepts);
            END
          `);
          db.run(`
            INSERT INTO observations_fts(rowid, title, text, narrative, concepts)
            SELECT id, title, text, narrative, concepts FROM observations
          `);
          db.run("CREATE INDEX IF NOT EXISTS idx_observations_type ON observations(type)");
          db.run("CREATE INDEX IF NOT EXISTS idx_observations_epoch ON observations(created_at_epoch)");
          db.run("CREATE INDEX IF NOT EXISTS idx_summaries_project ON summaries(project)");
          db.run("CREATE INDEX IF NOT EXISTS idx_summaries_epoch ON summaries(created_at_epoch)");
          db.run("CREATE INDEX IF NOT EXISTS idx_prompts_project ON prompts(project)");
        }
      },
      {
        version: 3,
        up: (db) => {
          db.run(`
            CREATE TABLE IF NOT EXISTS project_aliases (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              project_name TEXT NOT NULL UNIQUE,
              display_name TEXT NOT NULL,
              created_at TEXT NOT NULL,
              updated_at TEXT NOT NULL
            )
          `);
          db.run("CREATE UNIQUE INDEX IF NOT EXISTS idx_project_aliases_name ON project_aliases(project_name)");
        }
      },
      {
        version: 4,
        up: (db) => {
          db.run(`
            CREATE TABLE IF NOT EXISTS observation_embeddings (
              observation_id INTEGER PRIMARY KEY,
              embedding BLOB NOT NULL,
              model TEXT NOT NULL,
              dimensions INTEGER NOT NULL,
              created_at TEXT NOT NULL,
              FOREIGN KEY (observation_id) REFERENCES observations(id) ON DELETE CASCADE
            )
          `);
          db.run("CREATE INDEX IF NOT EXISTS idx_embeddings_model ON observation_embeddings(model)");
        }
      },
      {
        version: 5,
        up: (db) => {
          db.run("ALTER TABLE observations ADD COLUMN last_accessed_epoch INTEGER");
          db.run("ALTER TABLE observations ADD COLUMN is_stale INTEGER DEFAULT 0");
          db.run("CREATE INDEX IF NOT EXISTS idx_observations_last_accessed ON observations(last_accessed_epoch)");
          db.run("CREATE INDEX IF NOT EXISTS idx_observations_stale ON observations(is_stale)");
        }
      },
      {
        version: 6,
        up: (db) => {
          db.run(`
            CREATE TABLE IF NOT EXISTS checkpoints (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              session_id INTEGER NOT NULL,
              project TEXT NOT NULL,
              task TEXT NOT NULL,
              progress TEXT,
              next_steps TEXT,
              open_questions TEXT,
              relevant_files TEXT,
              context_snapshot TEXT,
              created_at TEXT NOT NULL,
              created_at_epoch INTEGER NOT NULL,
              FOREIGN KEY (session_id) REFERENCES sessions(id)
            )
          `);
          db.run("CREATE INDEX IF NOT EXISTS idx_checkpoints_session ON checkpoints(session_id)");
          db.run("CREATE INDEX IF NOT EXISTS idx_checkpoints_project ON checkpoints(project)");
          db.run("CREATE INDEX IF NOT EXISTS idx_checkpoints_epoch ON checkpoints(created_at_epoch)");
        }
      },
      {
        version: 7,
        up: (db) => {
          db.run("ALTER TABLE observations ADD COLUMN content_hash TEXT");
          db.run("CREATE INDEX IF NOT EXISTS idx_observations_hash ON observations(content_hash)");
        }
      },
      {
        version: 8,
        up: (db) => {
          db.run("ALTER TABLE observations ADD COLUMN discovery_tokens INTEGER DEFAULT 0");
          db.run("ALTER TABLE summaries ADD COLUMN discovery_tokens INTEGER DEFAULT 0");
        }
      },
      {
        version: 9,
        up: (db) => {
          db.run("CREATE INDEX IF NOT EXISTS idx_observations_project_epoch ON observations(project, created_at_epoch DESC)");
          db.run("CREATE INDEX IF NOT EXISTS idx_observations_project_type ON observations(project, type)");
          db.run("CREATE INDEX IF NOT EXISTS idx_summaries_project_epoch ON summaries(project, created_at_epoch DESC)");
          db.run("CREATE INDEX IF NOT EXISTS idx_prompts_project_epoch ON prompts(project, created_at_epoch DESC)");
        }
      }
    ];
  }
};

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
function completeSession(db, id) {
  const now = /* @__PURE__ */ new Date();
  db.run(
    `UPDATE sessions 
     SET status = 'completed', completed_at = ?, completed_at_epoch = ?
     WHERE id = ?`,
    [now.toISOString(), now.getTime(), id]
  );
}

// src/services/sqlite/index.ts
init_Observations();

// src/services/sqlite/Summaries.ts
function escapeLikePattern2(input) {
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
  const pattern = `%${escapeLikePattern2(searchTerm)}%`;
  const query = db.query(sql);
  if (project) {
    return query.all(project, pattern, pattern, pattern, pattern);
  }
  return query.all(pattern, pattern, pattern, pattern);
}

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
function getPromptsByProject(db, project, limit = 100) {
  const query = db.query(
    "SELECT * FROM prompts WHERE project = ? ORDER BY created_at_epoch DESC LIMIT ?"
  );
  return query.all(project, limit);
}

// src/services/sqlite/Checkpoints.ts
function createCheckpoint(db, sessionId, project, data) {
  const now = /* @__PURE__ */ new Date();
  const result = db.run(
    `INSERT INTO checkpoints (session_id, project, task, progress, next_steps, open_questions, relevant_files, context_snapshot, created_at, created_at_epoch)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      sessionId,
      project,
      data.task,
      data.progress || null,
      data.nextSteps || null,
      data.openQuestions || null,
      data.relevantFiles || null,
      data.contextSnapshot || null,
      now.toISOString(),
      now.getTime()
    ]
  );
  return Number(result.lastInsertRowid);
}
function getLatestCheckpoint(db, sessionId) {
  const query = db.query(
    "SELECT * FROM checkpoints WHERE session_id = ? ORDER BY created_at_epoch DESC LIMIT 1"
  );
  return query.get(sessionId);
}
function getLatestCheckpointByProject(db, project) {
  const query = db.query(
    "SELECT * FROM checkpoints WHERE project = ? ORDER BY created_at_epoch DESC LIMIT 1"
  );
  return query.get(project);
}

// src/services/sqlite/Reports.ts
function getReportData(db, project, startEpoch, endEpoch) {
  const startDate = new Date(startEpoch);
  const endDate = new Date(endEpoch);
  const days = Math.ceil((endEpoch - startEpoch) / (24 * 60 * 60 * 1e3));
  const label = days <= 7 ? "Weekly" : days <= 31 ? "Monthly" : "Custom";
  const countInRange = (table, epochCol = "created_at_epoch") => {
    const sql = project ? `SELECT COUNT(*) as count FROM ${table} WHERE project = ? AND ${epochCol} >= ? AND ${epochCol} <= ?` : `SELECT COUNT(*) as count FROM ${table} WHERE ${epochCol} >= ? AND ${epochCol} <= ?`;
    const stmt = db.query(sql);
    const row = project ? stmt.get(project, startEpoch, endEpoch) : stmt.get(startEpoch, endEpoch);
    return row?.count || 0;
  };
  const observations = countInRange("observations");
  const summaries = countInRange("summaries");
  const prompts = countInRange("prompts");
  const sessions = countInRange("sessions", "started_at_epoch");
  const timelineSql = project ? `SELECT DATE(datetime(created_at_epoch / 1000, 'unixepoch')) as day, COUNT(*) as count
       FROM observations
       WHERE project = ? AND created_at_epoch >= ? AND created_at_epoch <= ?
       GROUP BY day ORDER BY day ASC` : `SELECT DATE(datetime(created_at_epoch / 1000, 'unixepoch')) as day, COUNT(*) as count
       FROM observations
       WHERE created_at_epoch >= ? AND created_at_epoch <= ?
       GROUP BY day ORDER BY day ASC`;
  const timelineStmt = db.query(timelineSql);
  const timeline = project ? timelineStmt.all(project, startEpoch, endEpoch) : timelineStmt.all(startEpoch, endEpoch);
  const typeSql = project ? `SELECT type, COUNT(*) as count FROM observations
       WHERE project = ? AND created_at_epoch >= ? AND created_at_epoch <= ?
       GROUP BY type ORDER BY count DESC` : `SELECT type, COUNT(*) as count FROM observations
       WHERE created_at_epoch >= ? AND created_at_epoch <= ?
       GROUP BY type ORDER BY count DESC`;
  const typeStmt = db.query(typeSql);
  const typeDistribution = project ? typeStmt.all(project, startEpoch, endEpoch) : typeStmt.all(startEpoch, endEpoch);
  const sessionTotalSql = project ? `SELECT COUNT(*) as count FROM sessions WHERE project = ? AND started_at_epoch >= ? AND started_at_epoch <= ?` : `SELECT COUNT(*) as count FROM sessions WHERE started_at_epoch >= ? AND started_at_epoch <= ?`;
  const sessionTotal = (project ? db.query(sessionTotalSql).get(project, startEpoch, endEpoch)?.count : db.query(sessionTotalSql).get(startEpoch, endEpoch)?.count) || 0;
  const sessionCompletedSql = project ? `SELECT COUNT(*) as count FROM sessions WHERE project = ? AND started_at_epoch >= ? AND started_at_epoch <= ? AND status = 'completed'` : `SELECT COUNT(*) as count FROM sessions WHERE started_at_epoch >= ? AND started_at_epoch <= ? AND status = 'completed'`;
  const sessionCompleted = (project ? db.query(sessionCompletedSql).get(project, startEpoch, endEpoch)?.count : db.query(sessionCompletedSql).get(startEpoch, endEpoch)?.count) || 0;
  const sessionAvgSql = project ? `SELECT AVG((completed_at_epoch - started_at_epoch) / 1000.0 / 60.0) as avg_min
       FROM sessions
       WHERE project = ? AND started_at_epoch >= ? AND started_at_epoch <= ?
         AND status = 'completed' AND completed_at_epoch IS NOT NULL AND completed_at_epoch > started_at_epoch` : `SELECT AVG((completed_at_epoch - started_at_epoch) / 1000.0 / 60.0) as avg_min
       FROM sessions
       WHERE started_at_epoch >= ? AND started_at_epoch <= ?
         AND status = 'completed' AND completed_at_epoch IS NOT NULL AND completed_at_epoch > started_at_epoch`;
  const avgRow = project ? db.query(sessionAvgSql).get(project, startEpoch, endEpoch) : db.query(sessionAvgSql).get(startEpoch, endEpoch);
  const avgDurationMinutes = Math.round((avgRow?.avg_min || 0) * 10) / 10;
  const knowledgeSql = project ? `SELECT COUNT(*) as count FROM observations
       WHERE project = ? AND created_at_epoch >= ? AND created_at_epoch <= ?
         AND type IN ('constraint', 'decision', 'heuristic', 'rejected')` : `SELECT COUNT(*) as count FROM observations
       WHERE created_at_epoch >= ? AND created_at_epoch <= ?
         AND type IN ('constraint', 'decision', 'heuristic', 'rejected')`;
  const knowledgeCount = (project ? db.query(knowledgeSql).get(project, startEpoch, endEpoch)?.count : db.query(knowledgeSql).get(startEpoch, endEpoch)?.count) || 0;
  const staleSql = project ? `SELECT COUNT(*) as count FROM observations
       WHERE project = ? AND created_at_epoch >= ? AND created_at_epoch <= ? AND is_stale = 1` : `SELECT COUNT(*) as count FROM observations
       WHERE created_at_epoch >= ? AND created_at_epoch <= ? AND is_stale = 1`;
  const staleCount = (project ? db.query(staleSql).get(project, startEpoch, endEpoch)?.count : db.query(staleSql).get(startEpoch, endEpoch)?.count) || 0;
  const summarySql = project ? `SELECT learned, completed, next_steps FROM summaries
       WHERE project = ? AND created_at_epoch >= ? AND created_at_epoch <= ?
       ORDER BY created_at_epoch DESC` : `SELECT learned, completed, next_steps FROM summaries
       WHERE created_at_epoch >= ? AND created_at_epoch <= ?
       ORDER BY created_at_epoch DESC`;
  const summaryRows = project ? db.query(summarySql).all(project, startEpoch, endEpoch) : db.query(summarySql).all(startEpoch, endEpoch);
  const topLearnings = [];
  const completedTasks = [];
  const nextStepsArr = [];
  for (const row of summaryRows) {
    if (row.learned) {
      const parts = row.learned.split("; ").filter(Boolean);
      topLearnings.push(...parts);
    }
    if (row.completed) {
      const parts = row.completed.split("; ").filter(Boolean);
      completedTasks.push(...parts);
    }
    if (row.next_steps) {
      const parts = row.next_steps.split("; ").filter(Boolean);
      nextStepsArr.push(...parts);
    }
  }
  const filesSql = project ? `SELECT files_modified FROM observations
       WHERE project = ? AND created_at_epoch >= ? AND created_at_epoch <= ?
         AND files_modified IS NOT NULL AND files_modified != ''` : `SELECT files_modified FROM observations
       WHERE created_at_epoch >= ? AND created_at_epoch <= ?
         AND files_modified IS NOT NULL AND files_modified != ''`;
  const fileRows = project ? db.query(filesSql).all(project, startEpoch, endEpoch) : db.query(filesSql).all(startEpoch, endEpoch);
  const fileCounts = /* @__PURE__ */ new Map();
  for (const row of fileRows) {
    const files = row.files_modified.split(",").map((f) => f.trim()).filter(Boolean);
    for (const file of files) {
      fileCounts.set(file, (fileCounts.get(file) || 0) + 1);
    }
  }
  const fileHotspots = Array.from(fileCounts.entries()).map(([file, count]) => ({ file, count })).sort((a, b) => b.count - a.count).slice(0, 15);
  return {
    period: {
      start: startDate.toISOString().split("T")[0],
      end: endDate.toISOString().split("T")[0],
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

// src/services/sqlite/index.ts
init_Search();

// src/sdk/index.ts
init_Observations();
import { createHash } from "crypto";
init_Search();

// src/services/search/EmbeddingService.ts
var EmbeddingService = class {
  provider = null;
  model = null;
  initialized = false;
  initializing = null;
  /**
   * Inizializza il servizio di embedding.
   * Tenta fastembed, poi @huggingface/transformers, poi fallback a null.
   */
  async initialize() {
    if (this.initialized) return this.provider !== null;
    if (this.initializing) return this.initializing;
    this.initializing = this._doInitialize();
    const result = await this.initializing;
    this.initializing = null;
    return result;
  }
  async _doInitialize() {
    try {
      const fastembed = await import("fastembed");
      const EmbeddingModel = fastembed.EmbeddingModel || fastembed.default?.EmbeddingModel;
      const FlagEmbedding = fastembed.FlagEmbedding || fastembed.default?.FlagEmbedding;
      if (FlagEmbedding && EmbeddingModel) {
        this.model = await FlagEmbedding.init({
          model: EmbeddingModel.BGESmallENV15
        });
        this.provider = "fastembed";
        this.initialized = true;
        logger.info("EMBEDDING", "Inizializzato con fastembed (BGE-small-en-v1.5)");
        return true;
      }
    } catch (error) {
      logger.debug("EMBEDDING", `fastembed non disponibile: ${error}`);
    }
    try {
      const transformers = await import("@huggingface/transformers");
      const pipeline = transformers.pipeline || transformers.default?.pipeline;
      if (pipeline) {
        this.model = await pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2", {
          quantized: true
        });
        this.provider = "transformers";
        this.initialized = true;
        logger.info("EMBEDDING", "Inizializzato con @huggingface/transformers (all-MiniLM-L6-v2)");
        return true;
      }
    } catch (error) {
      logger.debug("EMBEDDING", `@huggingface/transformers non disponibile: ${error}`);
    }
    this.provider = null;
    this.initialized = true;
    logger.warn("EMBEDDING", "Nessun provider embedding disponibile, ricerca semantica disabilitata");
    return false;
  }
  /**
   * Genera embedding per un singolo testo.
   * Ritorna Float32Array con 384 dimensioni, o null se non disponibile.
   */
  async embed(text) {
    if (!this.initialized) await this.initialize();
    if (!this.provider || !this.model) return null;
    try {
      const truncated = text.substring(0, 2e3);
      if (this.provider === "fastembed") {
        return await this._embedFastembed(truncated);
      } else if (this.provider === "transformers") {
        return await this._embedTransformers(truncated);
      }
    } catch (error) {
      logger.error("EMBEDDING", `Errore generazione embedding: ${error}`);
    }
    return null;
  }
  /**
   * Genera embeddings in batch.
   */
  async embedBatch(texts) {
    if (!this.initialized) await this.initialize();
    if (!this.provider || !this.model) return texts.map(() => null);
    const results = [];
    for (const text of texts) {
      try {
        const embedding = await this.embed(text);
        results.push(embedding);
      } catch {
        results.push(null);
      }
    }
    return results;
  }
  /**
   * Verifica se il servizio è disponibile.
   */
  isAvailable() {
    return this.initialized && this.provider !== null;
  }
  /**
   * Nome del provider attivo.
   */
  getProvider() {
    return this.provider;
  }
  /**
   * Dimensioni del vettore embedding.
   */
  getDimensions() {
    return 384;
  }
  // --- Provider specifici ---
  async _embedFastembed(text) {
    const embeddings = this.model.embed([text], 1);
    for await (const batch of embeddings) {
      if (batch && batch.length > 0) {
        const vec = batch[0];
        return vec instanceof Float32Array ? vec : new Float32Array(vec);
      }
    }
    return null;
  }
  async _embedTransformers(text) {
    const output = await this.model(text, {
      pooling: "mean",
      normalize: true
    });
    if (output?.data) {
      return output.data instanceof Float32Array ? output.data : new Float32Array(output.data);
    }
    return null;
  }
};
var embeddingService = null;
function getEmbeddingService() {
  if (!embeddingService) {
    embeddingService = new EmbeddingService();
  }
  return embeddingService;
}

// src/services/search/VectorSearch.ts
function cosineSimilarity(a, b) {
  if (a.length !== b.length) return 0;
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  if (denominator === 0) return 0;
  return dotProduct / denominator;
}
function float32ToBuffer(arr) {
  return Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength);
}
function bufferToFloat32(buf) {
  const arrayBuffer = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  return new Float32Array(arrayBuffer);
}
var VectorSearch = class {
  /**
   * Ricerca semantica: calcola cosine similarity tra query e tutti gli embeddings.
   */
  async search(db, queryEmbedding, options = {}) {
    const limit = options.limit || 10;
    const threshold = options.threshold || 0.3;
    try {
      let sql = `
        SELECT e.observation_id, e.embedding,
               o.title, o.text, o.type, o.project, o.created_at, o.created_at_epoch
        FROM observation_embeddings e
        JOIN observations o ON o.id = e.observation_id
      `;
      const params = [];
      if (options.project) {
        sql += " WHERE o.project = ?";
        params.push(options.project);
      }
      const rows = db.query(sql).all(...params);
      const scored = [];
      for (const row of rows) {
        const embedding = bufferToFloat32(row.embedding);
        const similarity = cosineSimilarity(queryEmbedding, embedding);
        if (similarity >= threshold) {
          scored.push({
            id: row.observation_id,
            observationId: row.observation_id,
            similarity,
            title: row.title,
            text: row.text,
            type: row.type,
            project: row.project,
            created_at: row.created_at,
            created_at_epoch: row.created_at_epoch
          });
        }
      }
      scored.sort((a, b) => b.similarity - a.similarity);
      return scored.slice(0, limit);
    } catch (error) {
      logger.error("VECTOR", `Errore ricerca vettoriale: ${error}`);
      return [];
    }
  }
  /**
   * Salva embedding per un'osservazione.
   */
  async storeEmbedding(db, observationId, embedding, model) {
    try {
      const blob = float32ToBuffer(embedding);
      db.query(`
        INSERT OR REPLACE INTO observation_embeddings
          (observation_id, embedding, model, dimensions, created_at)
        VALUES (?, ?, ?, ?, ?)
      `).run(
        observationId,
        blob,
        model,
        embedding.length,
        (/* @__PURE__ */ new Date()).toISOString()
      );
      logger.debug("VECTOR", `Embedding salvato per osservazione ${observationId}`);
    } catch (error) {
      logger.error("VECTOR", `Errore salvataggio embedding: ${error}`);
    }
  }
  /**
   * Genera embeddings per osservazioni che non li hanno ancora.
   */
  async backfillEmbeddings(db, batchSize = 50) {
    const embeddingService2 = getEmbeddingService();
    if (!await embeddingService2.initialize()) {
      logger.warn("VECTOR", "Embedding service non disponibile, backfill saltato");
      return 0;
    }
    const rows = db.query(`
      SELECT o.id, o.title, o.text, o.narrative, o.concepts
      FROM observations o
      LEFT JOIN observation_embeddings e ON e.observation_id = o.id
      WHERE e.observation_id IS NULL
      ORDER BY o.created_at_epoch DESC
      LIMIT ?
    `).all(batchSize);
    if (rows.length === 0) return 0;
    let count = 0;
    const model = embeddingService2.getProvider() || "unknown";
    for (const row of rows) {
      const parts = [row.title];
      if (row.text) parts.push(row.text);
      if (row.narrative) parts.push(row.narrative);
      if (row.concepts) parts.push(row.concepts);
      const fullText = parts.join(" ").substring(0, 2e3);
      const embedding = await embeddingService2.embed(fullText);
      if (embedding) {
        await this.storeEmbedding(db, row.id, embedding, model);
        count++;
      }
    }
    logger.info("VECTOR", `Backfill completato: ${count}/${rows.length} embeddings generati`);
    return count;
  }
  /**
   * Statistiche sugli embeddings.
   */
  getStats(db) {
    try {
      const totalRow = db.query("SELECT COUNT(*) as count FROM observations").get();
      const embeddedRow = db.query("SELECT COUNT(*) as count FROM observation_embeddings").get();
      const total = totalRow?.count || 0;
      const embedded = embeddedRow?.count || 0;
      const percentage = total > 0 ? Math.round(embedded / total * 100) : 0;
      return { total, embedded, percentage };
    } catch {
      return { total: 0, embedded: 0, percentage: 0 };
    }
  }
};
var vectorSearch = null;
function getVectorSearch() {
  if (!vectorSearch) {
    vectorSearch = new VectorSearch();
  }
  return vectorSearch;
}

// src/services/search/HybridSearch.ts
var HybridSearch = class {
  embeddingInitialized = false;
  /**
   * Inizializza il servizio di embedding (lazy, non bloccante)
   */
  async initialize() {
    try {
      const embeddingService2 = getEmbeddingService();
      await embeddingService2.initialize();
      this.embeddingInitialized = embeddingService2.isAvailable();
      logger.info("SEARCH", `HybridSearch inizializzato (embedding: ${this.embeddingInitialized ? "attivo" : "disattivato"})`);
    } catch (error) {
      logger.warn("SEARCH", "Inizializzazione embedding fallita, uso solo FTS5", {}, error);
      this.embeddingInitialized = false;
    }
  }
  /**
   * Ricerca ibrida con scoring a 4 segnali
   */
  async search(db, query, options = {}) {
    const limit = options.limit || 10;
    const weights = options.weights || SEARCH_WEIGHTS;
    const targetProject = options.project || "";
    const rawItems = /* @__PURE__ */ new Map();
    if (this.embeddingInitialized) {
      try {
        const embeddingService2 = getEmbeddingService();
        const queryEmbedding = await embeddingService2.embed(query);
        if (queryEmbedding) {
          const vectorSearch2 = getVectorSearch();
          const vectorResults = await vectorSearch2.search(db, queryEmbedding, {
            project: options.project,
            limit: limit * 2,
            // Prendiamo piu risultati per il ranking
            threshold: 0.3
          });
          for (const hit of vectorResults) {
            rawItems.set(String(hit.observationId), {
              id: String(hit.observationId),
              title: hit.title,
              content: hit.text || "",
              type: hit.type,
              project: hit.project,
              created_at: hit.created_at,
              created_at_epoch: hit.created_at_epoch,
              semanticScore: hit.similarity,
              fts5Rank: null,
              source: "vector"
            });
          }
          logger.debug("SEARCH", `Vector search: ${vectorResults.length} risultati`);
        }
      } catch (error) {
        logger.warn("SEARCH", "Ricerca vettoriale fallita, uso solo keyword", {}, error);
      }
    }
    try {
      const { searchObservationsFTSWithRank: searchObservationsFTSWithRank2 } = await Promise.resolve().then(() => (init_Search(), Search_exports));
      const keywordResults = searchObservationsFTSWithRank2(db, query, {
        project: options.project,
        limit: limit * 2
      });
      for (const obs of keywordResults) {
        const id = String(obs.id);
        const existing = rawItems.get(id);
        if (existing) {
          existing.fts5Rank = obs.fts5_rank;
          existing.source = "vector";
        } else {
          rawItems.set(id, {
            id,
            title: obs.title,
            content: obs.text || obs.narrative || "",
            type: obs.type,
            project: obs.project,
            created_at: obs.created_at,
            created_at_epoch: obs.created_at_epoch,
            semanticScore: 0,
            fts5Rank: obs.fts5_rank,
            source: "keyword"
          });
        }
      }
      logger.debug("SEARCH", `Keyword search: ${keywordResults.length} risultati`);
    } catch (error) {
      logger.error("SEARCH", "Ricerca keyword fallita", {}, error);
    }
    if (rawItems.size === 0) return [];
    const allFTS5Ranks = Array.from(rawItems.values()).filter((item) => item.fts5Rank !== null).map((item) => item.fts5Rank);
    const scored = [];
    for (const item of rawItems.values()) {
      const signals = {
        semantic: item.semanticScore,
        fts5: item.fts5Rank !== null ? normalizeFTS5Rank(item.fts5Rank, allFTS5Ranks) : 0,
        recency: recencyScore(item.created_at_epoch),
        projectMatch: targetProject ? projectMatchScore(item.project, targetProject) : 0
      };
      const score = computeCompositeScore(signals, weights);
      const isHybrid = item.semanticScore > 0 && item.fts5Rank !== null;
      const hybridBoost = isHybrid ? 1.15 : 1;
      const finalScore = Math.min(1, score * hybridBoost * knowledgeTypeBoost(item.type));
      scored.push({
        id: item.id,
        title: item.title,
        content: item.content,
        type: item.type,
        project: item.project,
        created_at: item.created_at,
        created_at_epoch: item.created_at_epoch,
        score: finalScore,
        source: isHybrid ? "hybrid" : item.source,
        signals
      });
    }
    scored.sort((a, b) => b.score - a.score);
    const finalResults = scored.slice(0, limit);
    if (finalResults.length > 0) {
      try {
        const { updateLastAccessed: updateLastAccessed3 } = await Promise.resolve().then(() => (init_Observations(), Observations_exports));
        const ids = finalResults.map((r) => parseInt(r.id, 10)).filter((id) => id > 0);
        if (ids.length > 0) {
          updateLastAccessed3(db, ids);
        }
      } catch {
      }
    }
    return finalResults;
  }
};
var hybridSearch = null;
function getHybridSearch() {
  if (!hybridSearch) {
    hybridSearch = new HybridSearch();
  }
  return hybridSearch;
}

// src/types/worker-types.ts
var KNOWLEDGE_TYPES = ["constraint", "decision", "heuristic", "rejected"];

// src/sdk/index.ts
var KiroMemorySDK = class {
  db;
  project;
  constructor(config = {}) {
    this.db = new KiroMemoryDatabase(config.dataDir, config.skipMigrations || false);
    this.project = config.project || this.detectProject();
  }
  detectProject() {
    try {
      const { execSync } = __require("child_process");
      const gitRoot = execSync("git rev-parse --show-toplevel", {
        cwd: process.cwd(),
        encoding: "utf8",
        stdio: ["pipe", "pipe", "ignore"]
      }).trim();
      return gitRoot.split("/").pop() || "default";
    } catch {
      return "default";
    }
  }
  /**
   * Get context for the current project
   */
  async getContext() {
    return {
      project: this.project,
      relevantObservations: getObservationsByProject(this.db.db, this.project, 20),
      relevantSummaries: getSummariesByProject(this.db.db, this.project, 5),
      recentPrompts: getPromptsByProject(this.db.db, this.project, 10)
    };
  }
  /**
   * Valida input per storeObservation
   */
  validateObservationInput(data) {
    if (!data.type || typeof data.type !== "string" || data.type.length > 100) {
      throw new Error("type \xE8 obbligatorio (stringa, max 100 caratteri)");
    }
    if (!data.title || typeof data.title !== "string" || data.title.length > 500) {
      throw new Error("title \xE8 obbligatorio (stringa, max 500 caratteri)");
    }
    if (!data.content || typeof data.content !== "string" || data.content.length > 1e5) {
      throw new Error("content \xE8 obbligatorio (stringa, max 100KB)");
    }
  }
  /**
   * Valida input per storeSummary
   */
  validateSummaryInput(data) {
    const MAX = 5e4;
    for (const [key, val] of Object.entries(data)) {
      if (val !== void 0 && val !== null) {
        if (typeof val !== "string") throw new Error(`${key} deve essere una stringa`);
        if (val.length > MAX) throw new Error(`${key} troppo grande (max 50KB)`);
      }
    }
  }
  /**
   * Genera e salva embedding per un'osservazione (fire-and-forget, non blocca)
   */
  async generateEmbeddingAsync(observationId, title, content, concepts) {
    try {
      const embeddingService2 = getEmbeddingService();
      if (!embeddingService2.isAvailable()) return;
      const parts = [title, content];
      if (concepts?.length) parts.push(concepts.join(", "));
      const fullText = parts.join(" ").substring(0, 2e3);
      const embedding = await embeddingService2.embed(fullText);
      if (embedding) {
        const vectorSearch2 = getVectorSearch();
        await vectorSearch2.storeEmbedding(
          this.db.db,
          observationId,
          embedding,
          embeddingService2.getProvider() || "unknown"
        );
      }
    } catch (error) {
      logger.debug("SDK", `Embedding generation fallita per obs ${observationId}: ${error}`);
    }
  }
  /**
   * Genera content hash SHA256 per deduplicazione basata su contenuto.
   * Usa (project + type + title + narrative) come tupla di identità semantica.
   * NON include sessionId perché è unico ad ogni invocazione.
   */
  generateContentHash(type, title, narrative) {
    const payload = `${this.project}|${type}|${title}|${narrative || ""}`;
    return createHash("sha256").update(payload).digest("hex");
  }
  /**
   * Finestre di deduplicazione per tipo (ms).
   * Tipi con molte ripetizioni hanno finestre più ampie.
   */
  getDeduplicationWindow(type) {
    switch (type) {
      case "file-read":
        return 6e4;
      // 60s — letture frequenti sugli stessi file
      case "file-write":
        return 1e4;
      // 10s — scritture rapide consecutive
      case "command":
        return 3e4;
      // 30s — standard
      case "research":
        return 12e4;
      // 120s — web search e fetch ripetuti
      case "delegation":
        return 6e4;
      // 60s — delegazioni rapide
      default:
        return 3e4;
    }
  }
  /**
   * Store a new observation
   */
  async storeObservation(data) {
    this.validateObservationInput(data);
    const sessionId = "sdk-" + Date.now();
    const contentHash = this.generateContentHash(data.type, data.title, data.narrative);
    const dedupWindow = this.getDeduplicationWindow(data.type);
    if (isDuplicateObservation(this.db.db, contentHash, dedupWindow)) {
      logger.debug("SDK", `Osservazione duplicata scartata (${data.type}, ${dedupWindow}ms): ${data.title}`);
      return -1;
    }
    const filesRead = data.filesRead || (data.type === "file-read" ? data.files : void 0);
    const filesModified = data.filesModified || (data.type === "file-write" ? data.files : void 0);
    const discoveryTokens = Math.ceil(data.content.length / 4);
    const observationId = createObservation(
      this.db.db,
      sessionId,
      this.project,
      data.type,
      data.title,
      data.subtitle || null,
      data.content,
      data.narrative || null,
      data.facts || null,
      data.concepts?.join(", ") || null,
      filesRead?.join(", ") || null,
      filesModified?.join(", ") || null,
      0,
      contentHash,
      discoveryTokens
    );
    this.generateEmbeddingAsync(observationId, data.title, data.content, data.concepts).catch(() => {
    });
    return observationId;
  }
  /**
   * Salva conoscenza strutturata (constraint, decision, heuristic, rejected).
   * Usa il campo `type` per il knowledgeType e `facts` per i metadati JSON.
   */
  async storeKnowledge(data) {
    if (!KNOWLEDGE_TYPES.includes(data.knowledgeType)) {
      throw new Error(`knowledgeType non valido: ${data.knowledgeType}. Valori ammessi: ${KNOWLEDGE_TYPES.join(", ")}`);
    }
    this.validateObservationInput({ type: data.knowledgeType, title: data.title, content: data.content });
    const metadata = (() => {
      switch (data.knowledgeType) {
        case "constraint":
          return {
            knowledgeType: "constraint",
            severity: data.metadata?.severity || "soft",
            reason: data.metadata?.reason
          };
        case "decision":
          return {
            knowledgeType: "decision",
            alternatives: data.metadata?.alternatives,
            reason: data.metadata?.reason
          };
        case "heuristic":
          return {
            knowledgeType: "heuristic",
            context: data.metadata?.context,
            confidence: data.metadata?.confidence
          };
        case "rejected":
          return {
            knowledgeType: "rejected",
            reason: data.metadata?.reason || "",
            alternatives: data.metadata?.alternatives
          };
      }
    })();
    const sessionId = "sdk-" + Date.now();
    const contentHash = this.generateContentHash(data.type, data.title);
    if (isDuplicateObservation(this.db.db, contentHash)) {
      logger.debug("SDK", `Knowledge duplicata scartata: ${data.title}`);
      return -1;
    }
    const discoveryTokens = Math.ceil(data.content.length / 4);
    const observationId = createObservation(
      this.db.db,
      sessionId,
      data.project || this.project,
      data.knowledgeType,
      // type = knowledgeType
      data.title,
      null,
      // subtitle
      data.content,
      null,
      // narrative
      JSON.stringify(metadata),
      // facts = metadati JSON
      data.concepts?.join(", ") || null,
      data.files?.join(", ") || null,
      null,
      // filesModified: knowledge non modifica file
      0,
      // prompt_number
      contentHash,
      discoveryTokens
    );
    this.generateEmbeddingAsync(observationId, data.title, data.content, data.concepts).catch(() => {
    });
    return observationId;
  }
  /**
   * Store a session summary
   */
  async storeSummary(data) {
    this.validateSummaryInput(data);
    return createSummary(
      this.db.db,
      "sdk-" + Date.now(),
      this.project,
      data.request || null,
      data.investigated || null,
      data.learned || null,
      data.completed || null,
      data.nextSteps || null,
      data.notes || null
    );
  }
  /**
   * Search across all stored context
   */
  async search(query) {
    return {
      observations: searchObservations(this.db.db, query, this.project),
      summaries: searchSummaries(this.db.db, query, this.project)
    };
  }
  /**
   * Get recent observations
   */
  async getRecentObservations(limit = 10) {
    return getObservationsByProject(this.db.db, this.project, limit);
  }
  /**
   * Get recent summaries
   */
  async getRecentSummaries(limit = 5) {
    return getSummariesByProject(this.db.db, this.project, limit);
  }
  /**
   * Advanced search with FTS5 and filters
   */
  async searchAdvanced(query, filters = {}) {
    const projectFilters = { ...filters, project: filters.project || this.project };
    return {
      observations: searchObservationsFTS(this.db.db, query, projectFilters),
      summaries: searchSummariesFiltered(this.db.db, query, projectFilters)
    };
  }
  /**
   * Retrieve observations by ID (batch)
   */
  async getObservationsByIds(ids) {
    return getObservationsByIds(this.db.db, ids);
  }
  /**
   * Timeline: chronological context around an observation
   */
  async getTimeline(anchorId, depthBefore = 5, depthAfter = 5) {
    return getTimeline(this.db.db, anchorId, depthBefore, depthAfter);
  }
  /**
   * Create or retrieve a session for the current project
   */
  async getOrCreateSession(contentSessionId) {
    let session = getSessionByContentId(this.db.db, contentSessionId);
    if (!session) {
      const id = createSession(this.db.db, contentSessionId, this.project, "");
      session = {
        id,
        content_session_id: contentSessionId,
        project: this.project,
        user_prompt: "",
        memory_session_id: null,
        status: "active",
        started_at: (/* @__PURE__ */ new Date()).toISOString(),
        started_at_epoch: Date.now(),
        completed_at: null,
        completed_at_epoch: null
      };
    }
    return session;
  }
  /**
   * Store a user prompt
   */
  async storePrompt(contentSessionId, promptNumber, text) {
    return createPrompt(this.db.db, contentSessionId, this.project, promptNumber, text);
  }
  /**
   * Complete a session
   */
  async completeSession(sessionId) {
    completeSession(this.db.db, sessionId);
  }
  /**
   * Getter for current project name
   */
  getProject() {
    return this.project;
  }
  /**
   * Ricerca ibrida: vector search + keyword FTS5
   * Richiede inizializzazione HybridSearch (embedding service)
   */
  async hybridSearch(query, options = {}) {
    const hybridSearch2 = getHybridSearch();
    return hybridSearch2.search(this.db.db, query, {
      project: this.project,
      limit: options.limit || 10
    });
  }
  /**
   * Ricerca solo semantica (vector search)
   * Ritorna risultati basati su similarità coseno con gli embeddings
   */
  async semanticSearch(query, options = {}) {
    const embeddingService2 = getEmbeddingService();
    if (!embeddingService2.isAvailable()) {
      await embeddingService2.initialize();
    }
    if (!embeddingService2.isAvailable()) return [];
    const queryEmbedding = await embeddingService2.embed(query);
    if (!queryEmbedding) return [];
    const vectorSearch2 = getVectorSearch();
    const results = await vectorSearch2.search(this.db.db, queryEmbedding, {
      project: this.project,
      limit: options.limit || 10,
      threshold: options.threshold || 0.3
    });
    return results.map((r) => ({
      id: String(r.observationId),
      title: r.title,
      content: r.text || "",
      type: r.type,
      project: r.project,
      created_at: r.created_at,
      created_at_epoch: r.created_at_epoch,
      score: r.similarity,
      source: "vector",
      signals: {
        semantic: r.similarity,
        fts5: 0,
        recency: recencyScore(r.created_at_epoch),
        projectMatch: projectMatchScore(r.project, this.project)
      }
    }));
  }
  /**
   * Genera embeddings per osservazioni che non li hanno ancora
   */
  async backfillEmbeddings(batchSize = 50) {
    const vectorSearch2 = getVectorSearch();
    return vectorSearch2.backfillEmbeddings(this.db.db, batchSize);
  }
  /**
   * Statistiche sugli embeddings nel database
   */
  getEmbeddingStats() {
    const vectorSearch2 = getVectorSearch();
    return vectorSearch2.getStats(this.db.db);
  }
  /**
   * Inizializza il servizio di embedding (lazy, chiamare prima di hybridSearch)
   */
  async initializeEmbeddings() {
    const hybridSearch2 = getHybridSearch();
    await hybridSearch2.initialize();
    return getEmbeddingService().isAvailable();
  }
  /**
   * Contesto smart con ranking a 4 segnali e budget token.
   *
   * Se query presente: usa HybridSearch con SEARCH_WEIGHTS.
   * Se senza query: ranking per recency + project match (CONTEXT_WEIGHTS).
   */
  async getSmartContext(options = {}) {
    const tokenBudget = options.tokenBudget || parseInt(process.env.KIRO_MEMORY_CONTEXT_TOKENS || "0", 10) || 2e3;
    const summaries = getSummariesByProject(this.db.db, this.project, 5);
    let items;
    if (options.query) {
      const hybridSearch2 = getHybridSearch();
      const results = await hybridSearch2.search(this.db.db, options.query, {
        project: this.project,
        limit: 30
      });
      items = results.map((r) => ({
        id: parseInt(r.id, 10) || 0,
        title: r.title,
        content: r.content,
        type: r.type,
        project: r.project,
        created_at: r.created_at,
        created_at_epoch: r.created_at_epoch,
        score: r.score,
        signals: r.signals
      }));
    } else {
      const observations = getObservationsByProject(this.db.db, this.project, 30);
      const knowledgeTypes = new Set(KNOWLEDGE_TYPES);
      const knowledgeObs = [];
      const normalObs = [];
      for (const obs of observations) {
        if (knowledgeTypes.has(obs.type)) knowledgeObs.push(obs);
        else normalObs.push(obs);
      }
      const scoreObs = (obs) => {
        const signals = {
          semantic: 0,
          fts5: 0,
          recency: recencyScore(obs.created_at_epoch),
          projectMatch: projectMatchScore(obs.project, this.project)
        };
        const baseScore = computeCompositeScore(signals, CONTEXT_WEIGHTS);
        return {
          id: obs.id,
          title: obs.title,
          content: obs.text || obs.narrative || "",
          type: obs.type,
          project: obs.project,
          created_at: obs.created_at,
          created_at_epoch: obs.created_at_epoch,
          score: Math.min(1, baseScore * knowledgeTypeBoost(obs.type)),
          signals
        };
      };
      const scoredKnowledge = knowledgeObs.map(scoreObs).sort((a, b) => b.score - a.score);
      const scoredNormal = normalObs.map(scoreObs).sort((a, b) => b.score - a.score);
      items = [...scoredKnowledge, ...scoredNormal];
    }
    let tokensUsed = 0;
    const budgetItems = [];
    for (const item of items) {
      const itemTokens = Math.ceil((item.title.length + item.content.length) / 4);
      if (tokensUsed + itemTokens > tokenBudget) break;
      tokensUsed += itemTokens;
      budgetItems.push(item);
    }
    items = budgetItems;
    return {
      project: this.project,
      items,
      summaries,
      tokenBudget,
      tokensUsed: Math.min(tokensUsed, tokenBudget)
    };
  }
  /**
   * Rileva osservazioni stale (file modificati dopo la creazione) e le marca nel DB.
   * Ritorna il numero di osservazioni marcate come stale.
   */
  async detectStaleObservations() {
    const staleObs = getStaleObservations(this.db.db, this.project);
    if (staleObs.length > 0) {
      const ids = staleObs.map((o) => o.id);
      markObservationsStale(this.db.db, ids, true);
    }
    return staleObs.length;
  }
  /**
   * Consolida osservazioni duplicate sullo stesso file e tipo.
   * Raggruppa per (project, type, files_modified), mantiene la piu recente.
   */
  async consolidateObservations(options = {}) {
    return consolidateObservations(this.db.db, this.project, options);
  }
  /**
   * Statistiche decay: totale, stale, mai accedute, accedute di recente.
   */
  async getDecayStats() {
    const total = this.db.db.query(
      "SELECT COUNT(*) as count FROM observations WHERE project = ?"
    ).get(this.project)?.count || 0;
    const stale = this.db.db.query(
      "SELECT COUNT(*) as count FROM observations WHERE project = ? AND is_stale = 1"
    ).get(this.project)?.count || 0;
    const neverAccessed = this.db.db.query(
      "SELECT COUNT(*) as count FROM observations WHERE project = ? AND last_accessed_epoch IS NULL"
    ).get(this.project)?.count || 0;
    const recentThreshold = Date.now() - 48 * 60 * 60 * 1e3;
    const recentlyAccessed = this.db.db.query(
      "SELECT COUNT(*) as count FROM observations WHERE project = ? AND last_accessed_epoch > ?"
    ).get(this.project, recentThreshold)?.count || 0;
    return { total, stale, neverAccessed, recentlyAccessed };
  }
  /**
   * Crea un checkpoint strutturato per resume sessione.
   * Salva automaticamente un context_snapshot con le ultime 10 osservazioni.
   */
  async createCheckpoint(sessionId, data) {
    const recentObs = getObservationsByProject(this.db.db, this.project, 10);
    const contextSnapshot = JSON.stringify(
      recentObs.map((o) => ({ id: o.id, type: o.type, title: o.title, text: o.text?.substring(0, 200) }))
    );
    return createCheckpoint(this.db.db, sessionId, this.project, {
      task: data.task,
      progress: data.progress,
      nextSteps: data.nextSteps,
      openQuestions: data.openQuestions,
      relevantFiles: data.relevantFiles?.join(", "),
      contextSnapshot
    });
  }
  /**
   * Recupera l'ultimo checkpoint di una sessione specifica.
   */
  async getCheckpoint(sessionId) {
    return getLatestCheckpoint(this.db.db, sessionId);
  }
  /**
   * Recupera l'ultimo checkpoint per il progetto corrente.
   * Utile per resume automatico senza specificare session ID.
   */
  async getLatestProjectCheckpoint() {
    return getLatestCheckpointByProject(this.db.db, this.project);
  }
  /**
   * Genera un report di attività per il progetto corrente.
   * Aggrega osservazioni, sessioni, summaries e file per un periodo temporale.
   */
  async generateReport(options) {
    const now = /* @__PURE__ */ new Date();
    let startEpoch;
    let endEpoch = now.getTime();
    if (options?.startDate && options?.endDate) {
      startEpoch = options.startDate.getTime();
      endEpoch = options.endDate.getTime();
    } else {
      const period = options?.period || "weekly";
      const daysBack = period === "monthly" ? 30 : 7;
      startEpoch = endEpoch - daysBack * 24 * 60 * 60 * 1e3;
    }
    return getReportData(this.db.db, this.project, startEpoch, endEpoch);
  }
  /**
   * Getter for direct database access (for API routes)
   */
  getDb() {
    return this.db.db;
  }
  /**
   * Close database connection
   */
  close() {
    this.db.close();
  }
};
function createKiroMemory(config) {
  return new KiroMemorySDK(config);
}

// src/hooks/userPromptSubmit.ts
runHook("userPromptSubmit", async (input) => {
  const promptText = input.prompt || input.user_prompt || input.tool_input?.prompt || input.tool_input?.content;
  if (!promptText || typeof promptText !== "string" || promptText.trim().length === 0) return;
  const project = detectProject(input.cwd);
  const sdk = createKiroMemory({ project, skipMigrations: true });
  try {
    const sessionId = input.session_id || `kiro-${(/* @__PURE__ */ new Date()).toISOString().split("T")[0]}-${project}`;
    await sdk.storePrompt(sessionId, Date.now(), promptText.trim());
    await notifyWorker("prompt-created", { project });
    if (input.hook_event_name === "beforeSubmitPrompt") {
      process.stdout.write(JSON.stringify({ continue: true }));
    }
  } finally {
    sdk.close();
  }
});
