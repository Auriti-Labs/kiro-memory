import { createRequire } from 'module';const require = createRequire(import.meta.url);
var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

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
import { existsSync as existsSync2, statSync } from "fs";
function escapeLikePattern(input) {
  return input.replace(/[%_\\]/g, "\\$&");
}
function sanitizeFTS5Query(query) {
  const trimmed = query.length > 1e4 ? query.substring(0, 1e4) : query;
  const terms = trimmed.replace(/[""\u0022]/g, "").split(/\s+/).filter((t) => t.length > 0).slice(0, 100).map((t) => `"${t}"`);
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
  const pattern = `%${escapeLikePattern(query)}%`;
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
  sql += " ORDER BY created_at_epoch DESC, id DESC LIMIT ?";
  params.push(limit);
  const stmt = db.query(sql);
  return stmt.all(...params);
}
function searchSummariesFiltered(db, query, filters = {}) {
  const limit = filters.limit || 20;
  const pattern = `%${escapeLikePattern(query)}%`;
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
  sql += " ORDER BY created_at_epoch DESC, id DESC LIMIT ?";
  params.push(limit);
  const stmt = db.query(sql);
  return stmt.all(...params);
}
function getObservationsByIds(db, ids) {
  if (!Array.isArray(ids) || ids.length === 0) return [];
  const validIds = ids.filter((id) => typeof id === "number" && Number.isInteger(id) && id > 0).slice(0, 500);
  if (validIds.length === 0) return [];
  const placeholders = validIds.map(() => "?").join(",");
  const sql = `SELECT * FROM observations WHERE id IN (${placeholders}) ORDER BY created_at_epoch DESC, id DESC`;
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
    WHERE (created_at_epoch < ? OR (created_at_epoch = ? AND id < ?))
    ORDER BY created_at_epoch DESC, id DESC
    LIMIT ?
  `);
  const before = beforeStmt.all(anchorEpoch, anchorEpoch, anchorId, depthBefore).reverse();
  const selfStmt = db.query(`
    SELECT id, 'observation' as type, title, text as content, project, created_at, created_at_epoch
    FROM observations WHERE id = ?
  `);
  const self = selfStmt.all(anchorId);
  const afterStmt = db.query(`
    SELECT id, 'observation' as type, title, text as content, project, created_at, created_at_epoch
    FROM observations
    WHERE (created_at_epoch > ? OR (created_at_epoch = ? AND id > ?))
    ORDER BY created_at_epoch ASC, id ASC
    LIMIT ?
  `);
  const after = afterStmt.all(anchorEpoch, anchorEpoch, anchorId, depthAfter);
  return [...before, ...self, ...after];
}
function getProjectStats(db, project) {
  const sql = `
    WITH
      obs_stats AS (
        SELECT
          COUNT(*) as count,
          COALESCE(SUM(discovery_tokens), 0) as discovery_tokens,
          COALESCE(SUM(
            CAST((LENGTH(COALESCE(title, '')) + LENGTH(COALESCE(narrative, ''))) / 4 AS INTEGER)
          ), 0) as read_tokens
        FROM observations WHERE project = ?
      ),
      sum_count AS (SELECT COUNT(*) as count FROM summaries WHERE project = ?),
      ses_count AS (SELECT COUNT(*) as count FROM sessions WHERE project = ?),
      prm_count AS (SELECT COUNT(*) as count FROM prompts WHERE project = ?)
    SELECT
      obs_stats.count as observations,
      obs_stats.discovery_tokens,
      obs_stats.read_tokens,
      sum_count.count as summaries,
      ses_count.count as sessions,
      prm_count.count as prompts
    FROM obs_stats, sum_count, ses_count, prm_count
  `;
  const row = db.query(sql).get(project, project, project, project);
  const discoveryTokens = row?.discovery_tokens || 0;
  const readTokens = row?.read_tokens || 0;
  const savings = Math.max(0, discoveryTokens - readTokens);
  return {
    observations: row?.observations || 0,
    summaries: row?.summaries || 0,
    sessions: row?.sessions || 0,
    prompts: row?.prompts || 0,
    tokenEconomics: { discoveryTokens, readTokens, savings }
  };
}
function getStaleObservations(db, project) {
  const rows = db.query(`
    SELECT * FROM observations
    WHERE project = ? AND files_modified IS NOT NULL AND files_modified != ''
    ORDER BY created_at_epoch DESC, id DESC
    LIMIT 500
  `).all(project);
  const staleObs = [];
  for (const obs of rows) {
    if (!obs.files_modified) continue;
    const files = obs.files_modified.split(",").map((f) => f.trim()).filter(Boolean);
    let isStale = false;
    for (const filepath of files) {
      try {
        if (!existsSync2(filepath)) continue;
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

// src/utils/secrets.ts
function redactSecrets(text) {
  if (!text) return text;
  let redacted = text;
  for (const { pattern } of SECRET_PATTERNS) {
    pattern.lastIndex = 0;
    redacted = redacted.replace(pattern, (match) => {
      const prefix = match.substring(0, Math.min(4, match.length));
      return `${prefix}***REDACTED***`;
    });
  }
  return redacted;
}
var SECRET_PATTERNS;
var init_secrets = __esm({
  "src/utils/secrets.ts"() {
    "use strict";
    SECRET_PATTERNS = [
      // AWS Access Keys (AKIA, ABIA, ACCA, ASIA prefixes + 16 alphanumeric chars)
      { name: "aws-key", pattern: /(?:AKIA|ABIA|ACCA|ASIA)[A-Z0-9]{16}/g },
      // JWT tokens (three base64url segments separated by dots)
      { name: "jwt", pattern: /eyJ[a-zA-Z0-9_-]{10,}\.eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}/g },
      // Generic API keys in key=value or key: value assignments
      { name: "api-key", pattern: /(?:api[_-]?key|apikey|api[_-]?secret)\s*[:=]\s*['"]?([a-zA-Z0-9_\-]{20,})['"]?/gi },
      // Password/secret/token in variable assignments
      { name: "credential", pattern: /(?:password|passwd|pwd|secret|token|auth[_-]?token|access[_-]?token|bearer)\s*[:=]\s*['"]?([^\s'"]{8,})['"]?/gi },
      // Credentials embedded in URLs (user:pass@host)
      { name: "url-credential", pattern: /(?:https?:\/\/)([^:]+):([^@]+)@/g },
      // PEM-encoded private keys (RSA, EC, DSA, OpenSSH)
      { name: "private-key", pattern: /-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/g },
      // GitHub personal access tokens (ghp_, gho_, ghu_, ghs_, ghr_ prefixes)
      { name: "github-token", pattern: /gh[pousr]_[a-zA-Z0-9]{36,}/g },
      // Slack bot/user/app tokens
      { name: "slack-token", pattern: /xox[bpoas]-[a-zA-Z0-9-]{10,}/g },
      // HTTP Authorization Bearer header values
      { name: "bearer-header", pattern: /\bBearer\s+([a-zA-Z0-9_\-\.]{20,})/g },
      // Generic hex secrets (32+ hex chars after a key/secret/token/password label)
      { name: "hex-secret", pattern: /(?:key|secret|token|password)\s*[:=]\s*['"]?([0-9a-f]{32,})['"]?/gi }
    ];
  }
});

// src/utils/categorizer.ts
function categorize(input) {
  const scores = /* @__PURE__ */ new Map();
  const searchText = [
    input.title,
    input.text || "",
    input.narrative || "",
    input.concepts || ""
  ].join(" ").toLowerCase();
  const allFiles = [input.filesModified || "", input.filesRead || ""].join(",");
  for (const rule of CATEGORY_RULES) {
    let score = 0;
    for (const kw of rule.keywords) {
      if (searchText.includes(kw.toLowerCase())) {
        score += rule.weight;
      }
    }
    if (rule.types && rule.types.includes(input.type)) {
      score += rule.weight * 2;
    }
    if (rule.filePatterns && allFiles) {
      for (const pattern of rule.filePatterns) {
        if (pattern.test(allFiles)) {
          score += rule.weight;
        }
      }
    }
    if (score > 0) {
      scores.set(rule.category, (scores.get(rule.category) || 0) + score);
    }
  }
  let bestCategory = "general";
  let bestScore = 0;
  for (const [category, score] of scores) {
    if (score > bestScore) {
      bestScore = score;
      bestCategory = category;
    }
  }
  return bestCategory;
}
var CATEGORY_RULES;
var init_categorizer = __esm({
  "src/utils/categorizer.ts"() {
    "use strict";
    CATEGORY_RULES = [
      {
        category: "security",
        keywords: [
          "security",
          "vulnerability",
          "cve",
          "xss",
          "csrf",
          "injection",
          "sanitize",
          "escape",
          "auth",
          "authentication",
          "authorization",
          "permission",
          "helmet",
          "cors",
          "rate-limit",
          "token",
          "encrypt",
          "decrypt",
          "secret",
          "redact",
          "owasp"
        ],
        filePatterns: [/security/i, /auth/i, /secrets?\.ts/i],
        weight: 10
      },
      {
        category: "testing",
        keywords: [
          "test",
          "spec",
          "expect",
          "assert",
          "mock",
          "stub",
          "fixture",
          "coverage",
          "jest",
          "vitest",
          "bun test",
          "unit test",
          "integration test",
          "e2e"
        ],
        types: ["test"],
        filePatterns: [/\.test\./i, /\.spec\./i, /tests?\//i, /__tests__/i],
        weight: 8
      },
      {
        category: "debugging",
        keywords: [
          "debug",
          "fix",
          "bug",
          "error",
          "crash",
          "stacktrace",
          "stack trace",
          "exception",
          "breakpoint",
          "investigate",
          "root cause",
          "troubleshoot",
          "diagnose",
          "bisect",
          "regression"
        ],
        types: ["bugfix"],
        weight: 8
      },
      {
        category: "architecture",
        keywords: [
          "architect",
          "design",
          "pattern",
          "modular",
          "migration",
          "schema",
          "database",
          "api design",
          "abstract",
          "dependency injection",
          "singleton",
          "factory",
          "observer",
          "middleware",
          "pipeline",
          "microservice",
          "monolith"
        ],
        types: ["decision", "constraint"],
        weight: 7
      },
      {
        category: "refactoring",
        keywords: [
          "refactor",
          "rename",
          "extract",
          "inline",
          "move",
          "split",
          "merge",
          "simplify",
          "cleanup",
          "clean up",
          "dead code",
          "consolidate",
          "reorganize",
          "restructure",
          "decouple"
        ],
        weight: 6
      },
      {
        category: "config",
        keywords: [
          "config",
          "configuration",
          "env",
          "environment",
          "dotenv",
          ".env",
          "settings",
          "tsconfig",
          "eslint",
          "prettier",
          "webpack",
          "vite",
          "esbuild",
          "docker",
          "ci/cd",
          "github actions",
          "deploy",
          "build",
          "bundle",
          "package.json"
        ],
        filePatterns: [
          /\.config\./i,
          /\.env/i,
          /tsconfig/i,
          /\.ya?ml/i,
          /Dockerfile/i,
          /docker-compose/i
        ],
        weight: 5
      },
      {
        category: "docs",
        keywords: [
          "document",
          "readme",
          "changelog",
          "jsdoc",
          "comment",
          "explain",
          "guide",
          "tutorial",
          "api doc",
          "openapi",
          "swagger"
        ],
        types: ["docs"],
        filePatterns: [/\.md$/i, /docs?\//i, /readme/i, /changelog/i],
        weight: 5
      },
      {
        category: "feature-dev",
        keywords: [
          "feature",
          "implement",
          "add",
          "create",
          "new",
          "endpoint",
          "component",
          "module",
          "service",
          "handler",
          "route",
          "hook",
          "plugin",
          "integration"
        ],
        types: ["feature", "file-write"],
        weight: 3
        // lowest — generic catch-all for development
      }
    ];
  }
});

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
function escapeLikePattern2(input) {
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
  const safeTitle = redactSecrets(title);
  const safeText = text ? redactSecrets(text) : text;
  const safeNarrative = narrative ? redactSecrets(narrative) : narrative;
  const autoCategory = categorize({
    type,
    title: safeTitle,
    text: safeText,
    narrative: safeNarrative,
    concepts,
    filesModified,
    filesRead
  });
  const result = db.run(
    `INSERT INTO observations
     (memory_session_id, project, type, title, subtitle, text, narrative, facts, concepts, files_read, files_modified, prompt_number, created_at, created_at_epoch, content_hash, discovery_tokens, auto_category)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [memorySessionId, project, type, safeTitle, subtitle, safeText, safeNarrative, facts, concepts, filesRead, filesModified, promptNumber, now.toISOString(), now.getTime(), contentHash, discoveryTokens, autoCategory]
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
    "SELECT * FROM observations WHERE project = ? ORDER BY created_at_epoch DESC, id DESC LIMIT ?"
  );
  return query.all(project, limit);
}
function searchObservations(db, searchTerm, project) {
  const sql = project ? `SELECT * FROM observations
       WHERE project = ? AND (title LIKE ? ESCAPE '\\' OR text LIKE ? ESCAPE '\\' OR narrative LIKE ? ESCAPE '\\')
       ORDER BY created_at_epoch DESC, id DESC` : `SELECT * FROM observations
       WHERE title LIKE ? ESCAPE '\\' OR text LIKE ? ESCAPE '\\' OR narrative LIKE ? ESCAPE '\\'
       ORDER BY created_at_epoch DESC, id DESC`;
  const pattern = `%${escapeLikePattern2(searchTerm)}%`;
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
  if (options.dryRun) {
    let totalMerged = 0;
    let totalRemoved = 0;
    for (const group of groups) {
      const obsIds = group.ids.split(",").map(Number);
      const placeholders = obsIds.map(() => "?").join(",");
      const count = db.query(
        `SELECT COUNT(*) as cnt FROM observations WHERE id IN (${placeholders})`
      ).get(...obsIds)?.cnt || 0;
      if (count >= minGroupSize) {
        totalMerged += 1;
        totalRemoved += count - 1;
      }
    }
    return { merged: totalMerged, removed: totalRemoved };
  }
  const runConsolidation = db.transaction(() => {
    let merged = 0;
    let removed = 0;
    for (const group of groups) {
      const obsIds = group.ids.split(",").map(Number);
      const placeholders = obsIds.map(() => "?").join(",");
      const observations = db.query(
        `SELECT * FROM observations WHERE id IN (${placeholders}) ORDER BY created_at_epoch DESC, id DESC`
      ).all(...obsIds);
      if (observations.length < minGroupSize) continue;
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
        [consolidatedText, `[consolidated x${observations.length}] ${keeper.title}`, keeper.id]
      );
      const removeIds = others.map((o) => o.id);
      const removePlaceholders = removeIds.map(() => "?").join(",");
      db.run(`DELETE FROM observations WHERE id IN (${removePlaceholders})`, removeIds);
      db.run(`DELETE FROM observation_embeddings WHERE observation_id IN (${removePlaceholders})`, removeIds);
      merged += 1;
      removed += removeIds.length;
    }
    return { merged, removed };
  });
  return runConsolidation();
}
var init_Observations = __esm({
  "src/services/sqlite/Observations.ts"() {
    "use strict";
    init_secrets();
    init_categorizer();
  }
});

// src/utils/logger.ts
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "fs";
import { join } from "path";
import { homedir } from "os";
var LogLevel = /* @__PURE__ */ ((LogLevel2) => {
  LogLevel2[LogLevel2["DEBUG"] = 0] = "DEBUG";
  LogLevel2[LogLevel2["INFO"] = 1] = "INFO";
  LogLevel2[LogLevel2["WARN"] = 2] = "WARN";
  LogLevel2[LogLevel2["ERROR"] = 3] = "ERROR";
  LogLevel2[LogLevel2["SILENT"] = 4] = "SILENT";
  return LogLevel2;
})(LogLevel || {});
var DEFAULT_DATA_DIR = join(homedir(), ".contextkit");
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
      const logsDir = join(DEFAULT_DATA_DIR, "logs");
      if (!existsSync(logsDir)) {
        mkdirSync(logsDir, { recursive: true });
      }
      const date = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
      this.logFilePath = join(logsDir, `kiro-memory-${date}.log`);
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
        const settingsPath = join(DEFAULT_DATA_DIR, "settings.json");
        if (existsSync(settingsPath)) {
          const settingsData = readFileSync(settingsPath, "utf-8");
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

// src/services/search/EmbeddingService.ts
var MODEL_CONFIGS = {
  "all-MiniLM-L6-v2": {
    modelId: "Xenova/all-MiniLM-L6-v2",
    dimensions: 384
  },
  "jina-code-v2": {
    modelId: "jinaai/jina-embeddings-v2-base-code",
    dimensions: 768
  },
  "bge-small-en": {
    modelId: "BAAI/bge-small-en-v1.5",
    dimensions: 384
  }
};
var FASTEMBED_COMPATIBLE_MODELS = /* @__PURE__ */ new Set(["all-MiniLM-L6-v2", "bge-small-en"]);
var EmbeddingService = class {
  provider = null;
  model = null;
  initialized = false;
  initializing = null;
  config;
  configName;
  constructor() {
    const envModel = process.env.KIRO_MEMORY_EMBEDDING_MODEL || "all-MiniLM-L6-v2";
    this.configName = envModel;
    if (MODEL_CONFIGS[envModel]) {
      this.config = MODEL_CONFIGS[envModel];
    } else if (envModel.includes("/")) {
      const dimensions = parseInt(process.env.KIRO_MEMORY_EMBEDDING_DIMENSIONS || "384", 10);
      this.config = {
        modelId: envModel,
        dimensions: isNaN(dimensions) ? 384 : dimensions
      };
    } else {
      logger.warn("EMBEDDING", `Unknown model name '${envModel}', falling back to 'all-MiniLM-L6-v2'`);
      this.configName = "all-MiniLM-L6-v2";
      this.config = MODEL_CONFIGS["all-MiniLM-L6-v2"];
    }
  }
  /**
   * Initialize the embedding service.
   * Tries fastembed (when compatible), then @huggingface/transformers, then falls back to null.
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
    const fastembedCompatible = FASTEMBED_COMPATIBLE_MODELS.has(this.configName);
    if (fastembedCompatible) {
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
          logger.info("EMBEDDING", `Initialized with fastembed (BGE-small-en-v1.5) for model '${this.configName}'`);
          return true;
        }
      } catch (error) {
        logger.debug("EMBEDDING", `fastembed not available: ${error}`);
      }
    }
    try {
      const transformers = await import("@huggingface/transformers");
      const pipeline = transformers.pipeline || transformers.default?.pipeline;
      if (pipeline) {
        this.model = await pipeline("feature-extraction", this.config.modelId, {
          quantized: true
        });
        this.provider = "transformers";
        this.initialized = true;
        logger.info("EMBEDDING", `Initialized with @huggingface/transformers (${this.config.modelId})`);
        return true;
      }
    } catch (error) {
      logger.debug("EMBEDDING", `@huggingface/transformers not available: ${error}`);
    }
    this.provider = null;
    this.initialized = true;
    logger.warn("EMBEDDING", "No embedding provider available, semantic search disabled");
    return false;
  }
  /**
   * Generate embedding for a single text.
   * Returns Float32Array with configured dimensions, or null if not available.
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
      logger.error("EMBEDDING", `Error generating embedding: ${error}`);
    }
    return null;
  }
  /**
   * Generate embeddings in batch.
   * Uses native batch support when available (fastembed, transformers),
   * falls back to serial processing on batch failure.
   */
  async embedBatch(texts) {
    if (!this.initialized) await this.initialize();
    if (!this.provider || !this.model) return texts.map(() => null);
    if (texts.length === 0) return [];
    const truncated = texts.map((t) => t.substring(0, 2e3));
    try {
      if (this.provider === "fastembed") {
        return await this._embedBatchFastembed(truncated);
      } else if (this.provider === "transformers") {
        return await this._embedBatchTransformers(truncated);
      }
    } catch (error) {
      logger.warn("EMBEDDING", `Batch embedding failed, falling back to serial: ${error}`);
    }
    return this._embedBatchSerial(truncated);
  }
  /**
   * Check if the service is available.
   */
  isAvailable() {
    return this.initialized && this.provider !== null;
  }
  /**
   * Name of the active provider.
   */
  getProvider() {
    return this.provider;
  }
  /**
   * Embedding vector dimensions for the active model configuration.
   */
  getDimensions() {
    return this.config.dimensions;
  }
  /**
   * Human-readable model name used as identifier in the observation_embeddings table.
   * Returns the short name (e.g., 'all-MiniLM-L6-v2') or the full HF model ID for custom models.
   */
  getModelName() {
    return this.configName;
  }
  // --- Batch implementations ---
  /**
   * Native batch embedding with fastembed.
   * FlagEmbedding.embed() accepts string[] and returns an async iterable of batches.
   */
  async _embedBatchFastembed(texts) {
    const results = [];
    const embeddings = this.model.embed(texts, texts.length);
    for await (const batch of embeddings) {
      if (batch) {
        for (const vec of batch) {
          results.push(vec instanceof Float32Array ? vec : new Float32Array(vec));
        }
      }
    }
    while (results.length < texts.length) {
      results.push(null);
    }
    return results;
  }
  /**
   * Batch embedding with @huggingface/transformers pipeline.
   * The pipeline accepts string[] and returns a Tensor with shape [N, dims].
   */
  async _embedBatchTransformers(texts) {
    const output = await this.model(texts, {
      pooling: "mean",
      normalize: true
    });
    if (!output?.data) {
      return texts.map(() => null);
    }
    const dims = this.getDimensions();
    const data = output.data instanceof Float32Array ? output.data : new Float32Array(output.data);
    const results = [];
    for (let i = 0; i < texts.length; i++) {
      const offset = i * dims;
      if (offset + dims <= data.length) {
        results.push(data.slice(offset, offset + dims));
      } else {
        results.push(null);
      }
    }
    return results;
  }
  /**
   * Serial fallback: embed texts one at a time.
   * Used when native batch fails.
   */
  async _embedBatchSerial(texts) {
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
  // --- Single-text provider implementations ---
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
var DEFAULT_MAX_CANDIDATES = 2e3;
function cosineSimilarity(a, b) {
  const len = a.length;
  if (len !== b.length) return 0;
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < len; i++) {
    const ai = a[i];
    const bi = b[i];
    dotProduct += ai * bi;
    normA += ai * ai;
    normB += bi * bi;
  }
  const denominator = Math.sqrt(normA * normB);
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
   * Semantic search with SQL pre-filtering for scalability.
   *
   * 2-phase strategy:
   * 1. SQL pre-filters by project + sorts by recency (loads max N candidates)
   * 2. JS computes cosine similarity only on filtered candidates
   *
   * With 50k observations and maxCandidates=2000, loads only ~4% of data.
   */
  async search(db, queryEmbedding, options = {}) {
    const limit = options.limit || 10;
    const threshold = options.threshold || 0.3;
    const maxCandidates = options.maxCandidates || DEFAULT_MAX_CANDIDATES;
    try {
      const conditions = [];
      const params = [];
      if (options.project) {
        conditions.push("o.project = ?");
        params.push(options.project);
      }
      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
      const sql = `
        SELECT e.observation_id, e.embedding,
               o.title, o.text, o.type, o.project, o.created_at, o.created_at_epoch
        FROM observation_embeddings e
        JOIN observations o ON o.id = e.observation_id
        ${whereClause}
        ORDER BY o.created_at_epoch DESC
        LIMIT ?
      `;
      params.push(maxCandidates);
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
      logger.debug("VECTOR", `Search: ${rows.length} candidates \u2192 ${scored.length} above threshold \u2192 ${Math.min(scored.length, limit)} results`);
      return scored.slice(0, limit);
    } catch (error) {
      logger.error("VECTOR", `Vector search error: ${error}`);
      return [];
    }
  }
  /**
   * Store embedding for an observation.
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
      logger.debug("VECTOR", `Embedding saved for observation ${observationId}`);
    } catch (error) {
      logger.error("VECTOR", `Error saving embedding: ${error}`);
    }
  }
  /**
   * Generate embeddings for observations that don't have them yet.
   */
  async backfillEmbeddings(db, batchSize = 50) {
    const embeddingService2 = getEmbeddingService();
    if (!await embeddingService2.initialize()) {
      logger.warn("VECTOR", "Embedding service not available, backfill skipped");
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
    const model = embeddingService2.getModelName();
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
    logger.info("VECTOR", `Backfill completed: ${count}/${rows.length} embeddings generated`);
    return count;
  }
  /**
   * Embedding statistics.
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
function accessRecencyScore(lastAccessedEpoch, halfLifeHours = 48) {
  if (!lastAccessedEpoch || lastAccessedEpoch <= 0) return 0;
  const nowMs = Date.now();
  const ageMs = nowMs - lastAccessedEpoch;
  if (ageMs <= 0) return 1;
  const ageHours = ageMs / (1e3 * 60 * 60);
  return Math.exp(-ageHours * Math.LN2 / halfLifeHours);
}
function stalenessPenalty(isStale) {
  return isStale === 1 ? 0.5 : 1;
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
function estimateTokens(text) {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

// src/services/search/HybridSearch.ts
var HybridSearch = class {
  embeddingInitialized = false;
  /**
   * Initialize the embedding service (lazy, non-blocking)
   */
  async initialize() {
    try {
      const embeddingService2 = getEmbeddingService();
      await embeddingService2.initialize();
      this.embeddingInitialized = embeddingService2.isAvailable();
      logger.info("SEARCH", `HybridSearch initialized (embedding: ${this.embeddingInitialized ? "active" : "disabled"})`);
    } catch (error) {
      logger.warn("SEARCH", "Embedding initialization failed, using only FTS5", {}, error);
      this.embeddingInitialized = false;
    }
  }
  /**
   * Hybrid search with 4-signal scoring
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
            // Fetch more results for ranking
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
          logger.debug("SEARCH", `Vector search: ${vectorResults.length} results`);
        }
      } catch (error) {
        logger.warn("SEARCH", "Vector search failed, using only keyword", {}, error);
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
      logger.debug("SEARCH", `Keyword search: ${keywordResults.length} results`);
    } catch (error) {
      logger.error("SEARCH", "Keyword search failed", {}, error);
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
        const { updateLastAccessed: updateLastAccessed2 } = await Promise.resolve().then(() => (init_Observations(), Observations_exports));
        const ids = finalResults.map((r) => parseInt(r.id, 10)).filter((id) => id > 0);
        if (ids.length > 0) {
          updateLastAccessed2(db, ids);
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
export {
  CONTEXT_WEIGHTS,
  HybridSearch,
  KNOWLEDGE_TYPE_BOOST,
  SEARCH_WEIGHTS,
  accessRecencyScore,
  computeCompositeScore,
  estimateTokens,
  getHybridSearch,
  knowledgeTypeBoost,
  normalizeFTS5Rank,
  projectMatchScore,
  recencyScore,
  stalenessPenalty
};
