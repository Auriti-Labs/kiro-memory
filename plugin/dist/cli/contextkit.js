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

// src/utils/logger.ts
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "fs";
import { join } from "path";
import { homedir } from "os";
var LogLevel, DEFAULT_DATA_DIR, Logger, logger;
var init_logger = __esm({
  "src/utils/logger.ts"() {
    "use strict";
    LogLevel = /* @__PURE__ */ ((LogLevel2) => {
      LogLevel2[LogLevel2["DEBUG"] = 0] = "DEBUG";
      LogLevel2[LogLevel2["INFO"] = 1] = "INFO";
      LogLevel2[LogLevel2["WARN"] = 2] = "WARN";
      LogLevel2[LogLevel2["ERROR"] = 3] = "ERROR";
      LogLevel2[LogLevel2["SILENT"] = 4] = "SILENT";
      return LogLevel2;
    })(LogLevel || {});
    DEFAULT_DATA_DIR = join(homedir(), ".contextkit");
    Logger = class {
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
    logger = new Logger();
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
import { existsSync as existsSync3, statSync } from "fs";
function escapeLikePattern3(input) {
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
  sql += " ORDER BY created_at_epoch DESC, id DESC LIMIT ?";
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
        if (!existsSync3(filepath)) continue;
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

// src/services/sqlite/ImportExport.ts
var ImportExport_exports = {};
__export(ImportExport_exports, {
  JSONL_SCHEMA_VERSION: () => JSONL_SCHEMA_VERSION,
  computeImportHash: () => computeImportHash,
  countExportRecords: () => countExportRecords,
  exportObservationsStreaming: () => exportObservationsStreaming,
  exportPromptsStreaming: () => exportPromptsStreaming,
  exportSummariesStreaming: () => exportSummariesStreaming,
  generateMetaRecord: () => generateMetaRecord,
  hashExistsInObservations: () => hashExistsInObservations,
  importJsonl: () => importJsonl,
  validateJsonlRow: () => validateJsonlRow
});
import { createHash } from "crypto";
function countExportRecords(db, filters) {
  const { fromEpoch, toEpoch } = filtersToEpoch(filters);
  const obsConds = buildConditions({ project: filters.project, type: filters.type, fromEpoch, toEpoch });
  const sumConds = buildConditions({ project: filters.project, fromEpoch, toEpoch });
  const promptConds = buildConditions({ project: filters.project, fromEpoch, toEpoch });
  const obsCount = db.query(
    `SELECT COUNT(*) as c FROM observations WHERE ${obsConds.where}`
  ).get(...obsConds.params).c;
  const sumCount = db.query(
    `SELECT COUNT(*) as c FROM summaries WHERE ${sumConds.where}`
  ).get(...sumConds.params).c;
  const promptCount = db.query(
    `SELECT COUNT(*) as c FROM prompts WHERE ${promptConds.where}`
  ).get(...promptConds.params).c;
  return { observations: obsCount, summaries: sumCount, prompts: promptCount };
}
function generateMetaRecord(db, filters) {
  const counts = countExportRecords(db, filters);
  const meta = {
    _meta: {
      version: JSONL_SCHEMA_VERSION,
      exported_at: (/* @__PURE__ */ new Date()).toISOString(),
      counts,
      filters: Object.keys(filters).length > 0 ? filters : void 0
    }
  };
  return JSON.stringify(meta);
}
function exportObservationsStreaming(db, filters, onRow, batchSize = 200) {
  const { fromEpoch, toEpoch } = filtersToEpoch(filters);
  const conds = buildConditions({ project: filters.project, type: filters.type, fromEpoch, toEpoch });
  let offset = 0;
  let total = 0;
  while (true) {
    const rows = db.query(
      `SELECT id, memory_session_id, project, type, title, subtitle, text, narrative, facts, concepts,
              files_read, files_modified, prompt_number, content_hash, discovery_tokens, auto_category,
              created_at, created_at_epoch
       FROM observations
       WHERE ${conds.where}
       ORDER BY created_at_epoch ASC, id ASC
       LIMIT ? OFFSET ?`
    ).all(...conds.params, batchSize, offset);
    if (rows.length === 0) break;
    for (const row of rows) {
      const record = {
        _type: "observation",
        id: row.id,
        memory_session_id: row.memory_session_id,
        project: row.project,
        type: row.type,
        title: row.title,
        subtitle: row.subtitle,
        text: row.text,
        narrative: row.narrative,
        facts: row.facts,
        concepts: row.concepts,
        files_read: row.files_read,
        files_modified: row.files_modified,
        prompt_number: row.prompt_number,
        content_hash: row.content_hash,
        discovery_tokens: row.discovery_tokens ?? 0,
        auto_category: row.auto_category,
        created_at: row.created_at,
        created_at_epoch: row.created_at_epoch
      };
      onRow(JSON.stringify(record));
      total++;
    }
    offset += rows.length;
    if (rows.length < batchSize) break;
  }
  return total;
}
function exportSummariesStreaming(db, filters, onRow, batchSize = 200) {
  const { fromEpoch, toEpoch } = filtersToEpoch(filters);
  const conds = buildConditions({ project: filters.project, fromEpoch, toEpoch });
  let offset = 0;
  let total = 0;
  while (true) {
    const rows = db.query(
      `SELECT id, session_id, project, request, investigated, learned, completed, next_steps, notes,
              discovery_tokens, created_at, created_at_epoch
       FROM summaries
       WHERE ${conds.where}
       ORDER BY created_at_epoch ASC, id ASC
       LIMIT ? OFFSET ?`
    ).all(...conds.params, batchSize, offset);
    if (rows.length === 0) break;
    for (const row of rows) {
      const record = {
        _type: "summary",
        id: row.id,
        session_id: row.session_id,
        project: row.project,
        request: row.request,
        investigated: row.investigated,
        learned: row.learned,
        completed: row.completed,
        next_steps: row.next_steps,
        notes: row.notes,
        discovery_tokens: row.discovery_tokens ?? 0,
        created_at: row.created_at,
        created_at_epoch: row.created_at_epoch
      };
      onRow(JSON.stringify(record));
      total++;
    }
    offset += rows.length;
    if (rows.length < batchSize) break;
  }
  return total;
}
function exportPromptsStreaming(db, filters, onRow, batchSize = 200) {
  const { fromEpoch, toEpoch } = filtersToEpoch(filters);
  const conds = buildConditions({ project: filters.project, fromEpoch, toEpoch });
  let offset = 0;
  let total = 0;
  while (true) {
    const rows = db.query(
      `SELECT id, content_session_id, project, prompt_number, prompt_text, created_at, created_at_epoch
       FROM prompts
       WHERE ${conds.where}
       ORDER BY created_at_epoch ASC, id ASC
       LIMIT ? OFFSET ?`
    ).all(...conds.params, batchSize, offset);
    if (rows.length === 0) break;
    for (const row of rows) {
      const record = {
        _type: "prompt",
        id: row.id,
        content_session_id: row.content_session_id,
        project: row.project,
        prompt_number: row.prompt_number,
        prompt_text: row.prompt_text,
        created_at: row.created_at,
        created_at_epoch: row.created_at_epoch
      };
      onRow(JSON.stringify(record));
      total++;
    }
    offset += rows.length;
    if (rows.length < batchSize) break;
  }
  return total;
}
function validateJsonlRow(raw) {
  if (!raw || typeof raw !== "object") {
    return "Il record non \xE8 un oggetto JSON valido";
  }
  const rec = raw;
  if ("_meta" in rec) return null;
  const validTypes = ["observation", "summary", "prompt"];
  if (!rec._type || typeof rec._type !== "string" || !validTypes.includes(rec._type)) {
    return `Campo "_type" obbligatorio, uno di: ${validTypes.join(", ")}`;
  }
  if (rec._type === "observation") {
    if (!rec.project || typeof rec.project !== "string") return 'observation: campo "project" obbligatorio';
    if (!rec.type || typeof rec.type !== "string") return 'observation: campo "type" obbligatorio';
    if (!rec.title || typeof rec.title !== "string") return 'observation: campo "title" obbligatorio';
    if (rec.project.length > 200) return 'observation: "project" troppo lungo (max 200)';
    if (rec.title.length > 500) return 'observation: "title" troppo lungo (max 500)';
  } else if (rec._type === "summary") {
    if (!rec.project || typeof rec.project !== "string") return 'summary: campo "project" obbligatorio';
    if (!rec.session_id || typeof rec.session_id !== "string") return 'summary: campo "session_id" obbligatorio';
  } else if (rec._type === "prompt") {
    if (!rec.project || typeof rec.project !== "string") return 'prompt: campo "project" obbligatorio';
    if (!rec.content_session_id || typeof rec.content_session_id !== "string") return 'prompt: campo "content_session_id" obbligatorio';
    if (!rec.prompt_text || typeof rec.prompt_text !== "string") return 'prompt: campo "prompt_text" obbligatorio';
  }
  return null;
}
function computeImportHash(rec) {
  const payload = [
    rec.project ?? "",
    rec.type ?? "",
    rec.title ?? "",
    rec.narrative ?? ""
  ].join("|");
  return createHash("sha256").update(payload).digest("hex");
}
function hashExistsInObservations(db, hash) {
  const result = db.query(
    "SELECT id FROM observations WHERE content_hash = ? LIMIT 1"
  ).get(hash);
  return !!result;
}
function importObservationBatch(db, records, dryRun) {
  let imported = 0;
  let skipped = 0;
  for (let i = 0; i < records.length; i += IMPORT_BATCH_SIZE) {
    const batch = records.slice(i, i + IMPORT_BATCH_SIZE);
    if (dryRun) {
      for (const rec of batch) {
        const hash = rec.content_hash || computeImportHash(rec);
        if (hashExistsInObservations(db, hash)) {
          skipped++;
        } else {
          imported++;
        }
      }
      continue;
    }
    const insertBatch = db.transaction(() => {
      for (const rec of batch) {
        const hash = rec.content_hash || computeImportHash(rec);
        if (hashExistsInObservations(db, hash)) {
          skipped++;
          continue;
        }
        const now = (/* @__PURE__ */ new Date()).toISOString();
        db.run(
          `INSERT INTO observations
           (memory_session_id, project, type, title, subtitle, text, narrative, facts, concepts,
            files_read, files_modified, prompt_number, content_hash, discovery_tokens, auto_category,
            created_at, created_at_epoch)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            rec.memory_session_id || "imported",
            rec.project,
            rec.type,
            rec.title,
            rec.subtitle ?? null,
            rec.text ?? null,
            rec.narrative ?? null,
            rec.facts ?? null,
            rec.concepts ?? null,
            rec.files_read ?? null,
            rec.files_modified ?? null,
            rec.prompt_number ?? 0,
            hash,
            rec.discovery_tokens ?? 0,
            rec.auto_category ?? null,
            rec.created_at || now,
            rec.created_at_epoch || Date.now()
          ]
        );
        imported++;
      }
    });
    insertBatch();
  }
  return { imported, skipped };
}
function importSummaryBatch(db, records, dryRun) {
  let imported = 0;
  let skipped = 0;
  for (let i = 0; i < records.length; i += IMPORT_BATCH_SIZE) {
    const batch = records.slice(i, i + IMPORT_BATCH_SIZE);
    if (dryRun) {
      for (const rec of batch) {
        const exists = db.query(
          "SELECT id FROM summaries WHERE session_id = ? AND project = ? AND created_at_epoch = ? LIMIT 1"
        ).get(rec.session_id, rec.project, rec.created_at_epoch ?? 0);
        if (exists) skipped++;
        else imported++;
      }
      continue;
    }
    const insertBatch = db.transaction(() => {
      for (const rec of batch) {
        const exists = db.query(
          "SELECT id FROM summaries WHERE session_id = ? AND project = ? AND created_at_epoch = ? LIMIT 1"
        ).get(rec.session_id, rec.project, rec.created_at_epoch ?? 0);
        if (exists) {
          skipped++;
          continue;
        }
        const now = (/* @__PURE__ */ new Date()).toISOString();
        db.run(
          `INSERT INTO summaries
           (session_id, project, request, investigated, learned, completed, next_steps, notes,
            discovery_tokens, created_at, created_at_epoch)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            rec.session_id,
            rec.project,
            rec.request ?? null,
            rec.investigated ?? null,
            rec.learned ?? null,
            rec.completed ?? null,
            rec.next_steps ?? null,
            rec.notes ?? null,
            rec.discovery_tokens ?? 0,
            rec.created_at || now,
            rec.created_at_epoch || Date.now()
          ]
        );
        imported++;
      }
    });
    insertBatch();
  }
  return { imported, skipped };
}
function importPromptBatch(db, records, dryRun) {
  let imported = 0;
  let skipped = 0;
  for (let i = 0; i < records.length; i += IMPORT_BATCH_SIZE) {
    const batch = records.slice(i, i + IMPORT_BATCH_SIZE);
    if (dryRun) {
      for (const rec of batch) {
        const exists = db.query(
          "SELECT id FROM prompts WHERE content_session_id = ? AND prompt_number = ? LIMIT 1"
        ).get(rec.content_session_id, rec.prompt_number ?? 0);
        if (exists) skipped++;
        else imported++;
      }
      continue;
    }
    const insertBatch = db.transaction(() => {
      for (const rec of batch) {
        const exists = db.query(
          "SELECT id FROM prompts WHERE content_session_id = ? AND prompt_number = ? LIMIT 1"
        ).get(rec.content_session_id, rec.prompt_number ?? 0);
        if (exists) {
          skipped++;
          continue;
        }
        const now = (/* @__PURE__ */ new Date()).toISOString();
        db.run(
          `INSERT INTO prompts
           (content_session_id, project, prompt_number, prompt_text, created_at, created_at_epoch)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [
            rec.content_session_id,
            rec.project,
            rec.prompt_number ?? 0,
            rec.prompt_text,
            rec.created_at || now,
            rec.created_at_epoch || Date.now()
          ]
        );
        imported++;
      }
    });
    insertBatch();
  }
  return { imported, skipped };
}
function importJsonl(db, content, dryRun = false) {
  const lines = content.split("\n");
  const result = {
    imported: 0,
    skipped: 0,
    errors: 0,
    total: 0,
    errorDetails: []
  };
  const obsBuf = [];
  const sumBuf = [];
  const promptBuf = [];
  const flushBuffers = () => {
    if (obsBuf.length > 0) {
      const r = importObservationBatch(db, obsBuf.splice(0), dryRun);
      result.imported += r.imported;
      result.skipped += r.skipped;
    }
    if (sumBuf.length > 0) {
      const r = importSummaryBatch(db, sumBuf.splice(0), dryRun);
      result.imported += r.imported;
      result.skipped += r.skipped;
    }
    if (promptBuf.length > 0) {
      const r = importPromptBatch(db, promptBuf.splice(0), dryRun);
      result.imported += r.imported;
      result.skipped += r.skipped;
    }
  };
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i].trim();
    if (!raw || raw.startsWith("#")) continue;
    result.total++;
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      result.errors++;
      result.errorDetails.push({ line: i + 1, error: `JSON non valido: ${raw.substring(0, 60)}` });
      continue;
    }
    if (parsed && typeof parsed === "object" && "_meta" in parsed) {
      result.total--;
      continue;
    }
    const validErr = validateJsonlRow(parsed);
    if (validErr) {
      result.errors++;
      result.errorDetails.push({ line: i + 1, error: validErr });
      continue;
    }
    const rec = parsed;
    if (rec._type === "observation") {
      obsBuf.push(rec);
    } else if (rec._type === "summary") {
      sumBuf.push(rec);
    } else if (rec._type === "prompt") {
      promptBuf.push(rec);
    }
    const totalBuf = obsBuf.length + sumBuf.length + promptBuf.length;
    if (totalBuf >= IMPORT_BATCH_SIZE) {
      flushBuffers();
    }
  }
  flushBuffers();
  return result;
}
function filtersToEpoch(filters) {
  return {
    fromEpoch: filters.from ? new Date(filters.from).getTime() : void 0,
    toEpoch: filters.to ? new Date(filters.to).getTime() : void 0
  };
}
function buildConditions(params) {
  const conditions = ["1=1"];
  const values = [];
  if (params.project) {
    conditions.push("project = ?");
    values.push(params.project);
  }
  if (params.type) {
    conditions.push("type = ?");
    values.push(params.type);
  }
  if (params.fromEpoch !== void 0) {
    conditions.push("created_at_epoch >= ?");
    values.push(params.fromEpoch);
  }
  if (params.toEpoch !== void 0) {
    conditions.push("created_at_epoch <= ?");
    values.push(params.toEpoch);
  }
  return { where: conditions.join(" AND "), params: values };
}
var JSONL_SCHEMA_VERSION, IMPORT_BATCH_SIZE;
var init_ImportExport = __esm({
  "src/services/sqlite/ImportExport.ts"() {
    "use strict";
    JSONL_SCHEMA_VERSION = "2.5.0";
    IMPORT_BATCH_SIZE = 100;
  }
});

// src/services/search/EmbeddingService.ts
var EmbeddingService_exports = {};
__export(EmbeddingService_exports, {
  EmbeddingService: () => EmbeddingService,
  getEmbeddingService: () => getEmbeddingService
});
function getEmbeddingService() {
  if (!embeddingService) {
    embeddingService = new EmbeddingService();
  }
  return embeddingService;
}
var MODEL_CONFIGS, FASTEMBED_COMPATIBLE_MODELS, EmbeddingService, embeddingService;
var init_EmbeddingService = __esm({
  "src/services/search/EmbeddingService.ts"() {
    "use strict";
    init_logger();
    MODEL_CONFIGS = {
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
    FASTEMBED_COMPATIBLE_MODELS = /* @__PURE__ */ new Set(["all-MiniLM-L6-v2", "bge-small-en"]);
    EmbeddingService = class {
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
    embeddingService = null;
  }
});

// src/cli/cli-utils.ts
var cli_utils_exports = {};
__export(cli_utils_exports, {
  CONFIG_DEFAULTS: () => CONFIG_DEFAULTS,
  buildProgressBar: () => buildProgressBar,
  checkFtsIntegrity: () => checkFtsIntegrity,
  formatBytes: () => formatBytes,
  formatImportResult: () => formatImportResult,
  formatStatsOutput: () => formatStatsOutput,
  generateExportOutput: () => generateExportOutput,
  generateJsonOutput: () => generateJsonOutput,
  generateJsonlOutput: () => generateJsonlOutput,
  generateMarkdownOutput: () => generateMarkdownOutput,
  getConfigPath: () => getConfigPath,
  getConfigValue: () => getConfigValue,
  getDbFileSize: () => getDbFileSize,
  listConfig: () => listConfig,
  observationToJsonl: () => observationToJsonl,
  observationToMarkdown: () => observationToMarkdown,
  parseJsonlFile: () => parseJsonlFile,
  readConfig: () => readConfig,
  rebuildFtsIndex: () => rebuildFtsIndex,
  removeOrphanedEmbeddings: () => removeOrphanedEmbeddings,
  setConfigValue: () => setConfigValue,
  vacuumDatabase: () => vacuumDatabase,
  validateImportRecord: () => validateImportRecord,
  writeConfig: () => writeConfig
});
import { existsSync as existsSync5, statSync as statSync3, readFileSync as readFileSync3, writeFileSync as writeFileSync2, mkdirSync as mkdirSync4 } from "fs";
import { join as join4 } from "path";
import { homedir as homedir3 } from "os";
function observationToJsonl(obs) {
  return JSON.stringify(obs);
}
function generateJsonlOutput(observations) {
  return observations.map(observationToJsonl).join("\n");
}
function generateJsonOutput(observations) {
  return JSON.stringify(observations, null, 2);
}
function observationToMarkdown(obs) {
  const date = new Date(obs.created_at).toLocaleDateString("it-IT", {
    year: "numeric",
    month: "long",
    day: "numeric"
  });
  const lines = [
    `## ${obs.title}`,
    "",
    `- **Tipo:** ${obs.type}`,
    `- **Progetto:** ${obs.project}`,
    `- **Data:** ${date}`
  ];
  if (obs.subtitle) lines.push(`- **Sottotitolo:** ${obs.subtitle}`);
  if (obs.files_modified) lines.push(`- **File modificati:** ${obs.files_modified}`);
  if (obs.files_read) lines.push(`- **File letti:** ${obs.files_read}`);
  if (obs.text) {
    lines.push("", "### Contenuto", "", obs.text);
  }
  if (obs.narrative) {
    lines.push("", "### Narrativa", "", obs.narrative);
  }
  if (obs.facts) {
    lines.push("", "### Fatti", "", obs.facts);
  }
  lines.push("");
  return lines.join("\n");
}
function generateMarkdownOutput(observations) {
  if (observations.length === 0) return "# Nessuna observation trovata\n";
  const header = [
    "# Kiro Memory \u2014 Export Observations",
    "",
    `> Progetto: ${observations[0].project} | Totale: ${observations.length}`,
    "",
    "---",
    ""
  ].join("\n");
  return header + observations.map(observationToMarkdown).join("\n---\n\n");
}
function generateExportOutput(observations, format) {
  switch (format) {
    case "jsonl":
      return generateJsonlOutput(observations);
    case "json":
      return generateJsonOutput(observations);
    case "md":
      return generateMarkdownOutput(observations);
  }
}
function validateImportRecord(raw) {
  if (!raw || typeof raw !== "object") {
    return "Record non \xE8 un oggetto JSON valido";
  }
  const rec = raw;
  if (!rec.project || typeof rec.project !== "string" || rec.project.trim() === "") {
    return 'Campo "project" obbligatorio (stringa non vuota)';
  }
  if (!rec.type || typeof rec.type !== "string" || rec.type.trim() === "") {
    return 'Campo "type" obbligatorio (stringa non vuota)';
  }
  if (!rec.title || typeof rec.title !== "string" || rec.title.trim() === "") {
    return 'Campo "title" obbligatorio (stringa non vuota)';
  }
  if (rec.project.length > 200) return '"project" troppo lungo (max 200 caratteri)';
  if (rec.type.length > 100) return '"type" troppo lungo (max 100 caratteri)';
  if (rec.title.length > 500) return '"title" troppo lungo (max 500 caratteri)';
  for (const field of ["subtitle", "text", "narrative", "facts", "concepts", "files_read", "files_modified", "content_hash"]) {
    const val = rec[field];
    if (val !== void 0 && val !== null && typeof val !== "string") {
      return `Campo "${field}" deve essere stringa o null`;
    }
  }
  return null;
}
function parseJsonlFile(content) {
  const lines = content.split("\n");
  const results = [];
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i].trim();
    if (!raw || raw.startsWith("#")) continue;
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      results.push({ line: i + 1, error: `JSON non valido: ${raw.substring(0, 50)}` });
      continue;
    }
    const validationError = validateImportRecord(parsed);
    if (validationError) {
      results.push({ line: i + 1, error: validationError });
      continue;
    }
    results.push({ line: i + 1, record: parsed });
  }
  return results;
}
function getConfigPath() {
  const dataDir = process.env.KIRO_MEMORY_DATA_DIR || process.env.CONTEXTKIT_DATA_DIR || join4(homedir3(), ".contextkit");
  return join4(dataDir, "config.json");
}
function readConfig(configPath) {
  const path = configPath || getConfigPath();
  if (!existsSync5(path)) return {};
  try {
    const raw = readFileSync3(path, "utf8");
    const parsed = JSON.parse(raw);
    if (typeof parsed === "object" && parsed !== null) return parsed;
    return {};
  } catch {
    return {};
  }
}
function writeConfig(config, configPath) {
  const path = configPath || getConfigPath();
  const dir = path.substring(0, path.lastIndexOf("/"));
  mkdirSync4(dir, { recursive: true });
  writeFileSync2(path, JSON.stringify(config, null, 2), "utf8");
}
function getConfigValue(key, configPath) {
  const config = readConfig(configPath);
  if (key in config) return config[key];
  if (key in CONFIG_DEFAULTS) return CONFIG_DEFAULTS[key];
  return null;
}
function setConfigValue(key, rawValue, configPath) {
  const config = readConfig(configPath);
  let value = rawValue;
  if (rawValue === "true") value = true;
  else if (rawValue === "false") value = false;
  else {
    const num = Number(rawValue);
    if (!isNaN(num) && rawValue.trim() !== "") value = num;
  }
  config[key] = value;
  writeConfig(config, configPath);
  return value;
}
function listConfig(configPath) {
  const config = readConfig(configPath);
  const merged = { ...CONFIG_DEFAULTS };
  for (const [k, v] of Object.entries(config)) {
    merged[k] = v;
  }
  return merged;
}
function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}
function getDbFileSize(dbPath) {
  try {
    if (!existsSync5(dbPath)) return 0;
    return statSync3(dbPath).size;
  } catch {
    return 0;
  }
}
function formatStatsOutput(stats) {
  const lines = [
    "",
    "=== Kiro Memory \u2014 Statistiche Database ===",
    "",
    `  Observations totali:   ${stats.totalObservations}`,
    `  Sessioni totali:       ${stats.totalSessions}`,
    `  Progetti distinti:     ${stats.totalProjects}`,
    `  Dimensione DB:         ${formatBytes(stats.dbSizeBytes)}`
  ];
  if (stats.mostActiveProject) {
    lines.push(`  Progetto piu' attivo:  ${stats.mostActiveProject}`);
  }
  const coverage = stats.embeddingCoverage;
  const coverageBar = buildProgressBar(coverage, 20);
  lines.push(`  Copertura embeddings:  ${coverageBar} ${coverage}%`);
  lines.push("");
  return lines.join("\n");
}
function buildProgressBar(percent, width = 20) {
  const filled = Math.round(percent / 100 * width);
  const empty = width - filled;
  return `[${"#".repeat(filled)}${"-".repeat(empty)}]`;
}
function formatImportResult(result) {
  const prefix = result.dryRun ? "[DRY RUN] " : "";
  const lines = [
    "",
    `=== ${prefix}Kiro Memory \u2014 Import JSONL ===`,
    "",
    `  Record totali analizzati: ${result.total}`,
    `  Importati:                ${result.imported}`,
    `  Saltati (duplicati):      ${result.skipped}`,
    `  Errori di validazione:    ${result.errors}`
  ];
  if (result.dryRun) {
    lines.push("");
    lines.push("  (Dry run: nessun dato inserito. Rimuovi --dry-run per applicare.)");
  }
  if (result.errorDetails && result.errorDetails.length > 0) {
    lines.push("");
    lines.push("  Errori:");
    for (const err of result.errorDetails.slice(0, 20)) {
      lines.push(`    Riga ${err.line}: ${err.error}`);
    }
    if (result.errorDetails.length > 20) {
      lines.push(`    ... e altri ${result.errorDetails.length - 20} errori`);
    }
  }
  lines.push("");
  return lines.join("\n");
}
function checkFtsIntegrity(db) {
  try {
    db.query("INSERT INTO observations_fts(observations_fts) VALUES('integrity-check')").run();
    return true;
  } catch {
    return false;
  }
}
function rebuildFtsIndex(db) {
  try {
    db.run("INSERT INTO observations_fts(observations_fts) VALUES('rebuild')");
    return true;
  } catch {
    return false;
  }
}
function removeOrphanedEmbeddings(db) {
  try {
    const result = db.run(
      `DELETE FROM observation_embeddings
       WHERE observation_id NOT IN (SELECT id FROM observations)`
    );
    return Number(result.changes);
  } catch {
    return 0;
  }
}
function vacuumDatabase(db) {
  try {
    db.run("VACUUM");
    return true;
  } catch {
    return false;
  }
}
var CONFIG_DEFAULTS;
var init_cli_utils = __esm({
  "src/cli/cli-utils.ts"() {
    "use strict";
    CONFIG_DEFAULTS = {
      "worker.port": 3001,
      "worker.host": "127.0.0.1",
      "log.level": "INFO",
      "search.limit": 20,
      "embeddings.enabled": false,
      "decay.staleThresholdDays": 30,
      // Politiche di retention: età massima in giorni (0 = mai eliminare)
      "retention.observations.maxAgeDays": 90,
      "retention.summaries.maxAgeDays": 365,
      "retention.prompts.maxAgeDays": 30,
      "retention.knowledge.maxAgeDays": 0,
      // Cleanup automatico schedulato
      "retention.autoCleanupEnabled": true,
      "retention.autoCleanupIntervalHours": 24,
      // Backup automatico schedulato
      "backup.enabled": true,
      "backup.intervalHours": 24,
      "backup.maxKeep": 7,
      "backup.compress": false
    };
  }
});

// src/shims/bun-sqlite.ts
import BetterSqlite3 from "better-sqlite3";
var Database = class {
  _db;
  _stmtCache = /* @__PURE__ */ new Map();
  constructor(path, options) {
    this._db = new BetterSqlite3(path, {
      // better-sqlite3 creates the file by default ('create' not needed)
      readonly: options?.readwrite === false ? true : false
    });
  }
  /**
   * Execute a SQL query without results
   */
  run(sql, params) {
    const stmt = this._db.prepare(sql);
    const result = params ? stmt.run(...params) : stmt.run();
    return result;
  }
  /**
   * Prepare a query with bun:sqlite-compatible interface.
   * Returns a cached prepared statement for repeated queries.
   */
  query(sql) {
    let cached = this._stmtCache.get(sql);
    if (!cached) {
      cached = new BunQueryCompat(this._db, sql);
      this._stmtCache.set(sql, cached);
    }
    return cached;
  }
  /**
   * Create a transaction
   */
  transaction(fn) {
    return this._db.transaction(fn);
  }
  /**
   * Close the connection
   */
  close() {
    this._stmtCache.clear();
    this._db.close();
  }
};
var BunQueryCompat = class {
  _stmt;
  constructor(db, sql) {
    this._stmt = db.prepare(sql);
  }
  /**
   * Returns all rows
   */
  all(...params) {
    return params.length > 0 ? this._stmt.all(...params) : this._stmt.all();
  }
  /**
   * Returns the first row or null
   */
  get(...params) {
    return params.length > 0 ? this._stmt.get(...params) : this._stmt.get();
  }
  /**
   * Execute without results
   */
  run(...params) {
    return params.length > 0 ? this._stmt.run(...params) : this._stmt.run();
  }
};

// src/shared/paths.ts
import { join as join2, dirname, basename } from "path";
import { homedir as homedir2 } from "os";
import { existsSync as existsSync2, mkdirSync as mkdirSync2 } from "fs";
init_logger();
import { fileURLToPath } from "url";
function getDirname() {
  if (typeof __dirname !== "undefined") {
    return __dirname;
  }
  return dirname(fileURLToPath(import.meta.url));
}
var _dirname = getDirname();
var _legacyDir = join2(homedir2(), ".contextkit");
var _defaultDir = existsSync2(_legacyDir) ? _legacyDir : join2(homedir2(), ".kiro-memory");
var DATA_DIR = process.env.KIRO_MEMORY_DATA_DIR || process.env.CONTEXTKIT_DATA_DIR || _defaultDir;
var KIRO_CONFIG_DIR = process.env.KIRO_CONFIG_DIR || join2(homedir2(), ".kiro");
var PLUGIN_ROOT = join2(KIRO_CONFIG_DIR, "plugins", "kiro-memory");
var ARCHIVES_DIR = join2(DATA_DIR, "archives");
var LOGS_DIR = join2(DATA_DIR, "logs");
var TRASH_DIR = join2(DATA_DIR, "trash");
var BACKUPS_DIR = join2(DATA_DIR, "backups");
var MODES_DIR = join2(DATA_DIR, "modes");
var USER_SETTINGS_PATH = join2(DATA_DIR, "settings.json");
var _legacyDb = join2(DATA_DIR, "contextkit.db");
var DB_PATH = existsSync2(_legacyDb) ? _legacyDb : join2(DATA_DIR, "kiro-memory.db");
var VECTOR_DB_DIR = join2(DATA_DIR, "vector-db");
var OBSERVER_SESSIONS_DIR = join2(DATA_DIR, "observer-sessions");
var KIRO_SETTINGS_PATH = join2(KIRO_CONFIG_DIR, "settings.json");
var KIRO_CONTEXT_PATH = join2(KIRO_CONFIG_DIR, "context.md");
function ensureDir(dirPath) {
  mkdirSync2(dirPath, { recursive: true });
}

// src/services/sqlite/Database.ts
init_logger();
var SQLITE_MMAP_SIZE_BYTES = 256 * 1024 * 1024;
var SQLITE_CACHE_SIZE_PAGES = 1e4;
var KiroMemoryDatabase = class {
  _db;
  /**
   * Readonly accessor for the underlying Database instance.
   * Prefer using query() and run() proxy methods directly.
   */
  get db() {
    return this._db;
  }
  /**
   * @param dbPath - Path to the SQLite file (default: DB_PATH)
   * @param skipMigrations - If true, skip the migration runner (for high-frequency hooks)
   */
  constructor(dbPath = DB_PATH, skipMigrations = false) {
    if (dbPath !== ":memory:") {
      ensureDir(DATA_DIR);
    }
    this._db = new Database(dbPath, { create: true, readwrite: true });
    this._db.run("PRAGMA journal_mode = WAL");
    this._db.run("PRAGMA busy_timeout = 5000");
    this._db.run("PRAGMA synchronous = NORMAL");
    this._db.run("PRAGMA foreign_keys = ON");
    this._db.run("PRAGMA temp_store = memory");
    this._db.run(`PRAGMA mmap_size = ${SQLITE_MMAP_SIZE_BYTES}`);
    this._db.run(`PRAGMA cache_size = ${SQLITE_CACHE_SIZE_PAGES}`);
    if (!skipMigrations) {
      const migrationRunner = new MigrationRunner(this._db);
      migrationRunner.runAllMigrations();
    }
  }
  /**
   * Prepare a query (delegates to underlying Database).
   * Proxy method to avoid ctx.db.db.query() double access.
   */
  query(sql) {
    return this._db.query(sql);
  }
  /**
   * Execute a SQL statement without results (delegates to underlying Database).
   * Proxy method to avoid ctx.db.db.run() double access.
   */
  run(sql, params) {
    return this._db.run(sql, params);
  }
  /**
   * Executes a function within an atomic transaction.
   * If fn() throws an error, the transaction is automatically rolled back.
   */
  withTransaction(fn) {
    const transaction = this._db.transaction(fn);
    return transaction(this._db);
  }
  /**
   * Close the database connection
   */
  close() {
    this._db.close();
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
      },
      {
        version: 10,
        up: (db) => {
          db.run(`
            CREATE TABLE IF NOT EXISTS job_queue (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              type TEXT NOT NULL,
              status TEXT NOT NULL DEFAULT 'pending',
              payload TEXT,
              result TEXT,
              error TEXT,
              retry_count INTEGER DEFAULT 0,
              max_retries INTEGER DEFAULT 3,
              priority INTEGER DEFAULT 0,
              created_at TEXT NOT NULL,
              created_at_epoch INTEGER NOT NULL,
              started_at_epoch INTEGER,
              completed_at_epoch INTEGER
            )
          `);
          db.run("CREATE INDEX IF NOT EXISTS idx_jobs_status ON job_queue(status)");
          db.run("CREATE INDEX IF NOT EXISTS idx_jobs_type ON job_queue(type)");
          db.run("CREATE INDEX IF NOT EXISTS idx_jobs_priority ON job_queue(status, priority DESC, created_at_epoch ASC)");
        }
      },
      {
        version: 11,
        up: (db) => {
          db.run("ALTER TABLE observations ADD COLUMN auto_category TEXT");
          db.run("CREATE INDEX IF NOT EXISTS idx_observations_category ON observations(auto_category)");
        }
      },
      {
        version: 12,
        up: (db) => {
          db.run(`
            CREATE TABLE IF NOT EXISTS github_links (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              observation_id INTEGER,
              session_id TEXT,
              repo TEXT NOT NULL,
              issue_number INTEGER,
              pr_number INTEGER,
              event_type TEXT NOT NULL,
              action TEXT,
              title TEXT,
              url TEXT,
              author TEXT,
              created_at TEXT NOT NULL,
              created_at_epoch INTEGER NOT NULL,
              FOREIGN KEY (observation_id) REFERENCES observations(id)
            )
          `);
          db.run("CREATE INDEX IF NOT EXISTS idx_github_links_repo ON github_links(repo)");
          db.run("CREATE INDEX IF NOT EXISTS idx_github_links_obs ON github_links(observation_id)");
          db.run("CREATE INDEX IF NOT EXISTS idx_github_links_event ON github_links(event_type)");
          db.run("CREATE INDEX IF NOT EXISTS idx_github_links_repo_issue ON github_links(repo, issue_number)");
          db.run("CREATE INDEX IF NOT EXISTS idx_github_links_repo_pr ON github_links(repo, pr_number)");
        }
      },
      {
        version: 13,
        up: (db) => {
          db.run("CREATE INDEX IF NOT EXISTS idx_observations_keyset ON observations(created_at_epoch DESC, id DESC)");
          db.run("CREATE INDEX IF NOT EXISTS idx_observations_project_keyset ON observations(project, created_at_epoch DESC, id DESC)");
          db.run("CREATE INDEX IF NOT EXISTS idx_summaries_keyset ON summaries(created_at_epoch DESC, id DESC)");
          db.run("CREATE INDEX IF NOT EXISTS idx_summaries_project_keyset ON summaries(project, created_at_epoch DESC, id DESC)");
          db.run("CREATE INDEX IF NOT EXISTS idx_prompts_keyset ON prompts(created_at_epoch DESC, id DESC)");
          db.run("CREATE INDEX IF NOT EXISTS idx_prompts_project_keyset ON prompts(project, created_at_epoch DESC, id DESC)");
        }
      }
    ];
  }
};

// src/services/sqlite/cursor.ts
function encodeCursor(id, epoch) {
  const raw = `${epoch}:${id}`;
  return Buffer.from(raw, "utf8").toString("base64url");
}
function decodeCursor(cursor) {
  try {
    const raw = Buffer.from(cursor, "base64url").toString("utf8");
    const colonIdx = raw.indexOf(":");
    if (colonIdx === -1) return null;
    const epochStr = raw.substring(0, colonIdx);
    const idStr = raw.substring(colonIdx + 1);
    const epoch = parseInt(epochStr, 10);
    const id = parseInt(idStr, 10);
    if (!Number.isInteger(epoch) || epoch <= 0) return null;
    if (!Number.isInteger(id) || id <= 0) return null;
    return { epoch, id };
  } catch {
    return null;
  }
}

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
function createSummary(db, sessionId, project, request2, investigated, learned, completed, nextSteps, notes) {
  const now = /* @__PURE__ */ new Date();
  const result = db.run(
    `INSERT INTO summaries 
     (session_id, project, request, investigated, learned, completed, next_steps, notes, created_at, created_at_epoch)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [sessionId, project, request2, investigated, learned, completed, nextSteps, notes, now.toISOString(), now.getTime()]
  );
  return Number(result.lastInsertRowid);
}
function getSummariesByProject(db, project, limit = 50) {
  const query = db.query(
    "SELECT * FROM summaries WHERE project = ? ORDER BY created_at_epoch DESC, id DESC LIMIT ?"
  );
  return query.all(project, limit);
}
function searchSummaries(db, searchTerm, project) {
  const sql = project ? `SELECT * FROM summaries
       WHERE project = ? AND (request LIKE ? ESCAPE '\\' OR learned LIKE ? ESCAPE '\\' OR completed LIKE ? ESCAPE '\\' OR notes LIKE ? ESCAPE '\\')
       ORDER BY created_at_epoch DESC, id DESC` : `SELECT * FROM summaries
       WHERE request LIKE ? ESCAPE '\\' OR learned LIKE ? ESCAPE '\\' OR completed LIKE ? ESCAPE '\\' OR notes LIKE ? ESCAPE '\\'
       ORDER BY created_at_epoch DESC, id DESC`;
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
    "SELECT * FROM prompts WHERE project = ? ORDER BY created_at_epoch DESC, id DESC LIMIT ?"
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
    "SELECT * FROM checkpoints WHERE session_id = ? ORDER BY created_at_epoch DESC, id DESC LIMIT 1"
  );
  return query.get(sessionId);
}
function getLatestCheckpointByProject(db, project) {
  const query = db.query(
    "SELECT * FROM checkpoints WHERE project = ? ORDER BY created_at_epoch DESC, id DESC LIMIT 1"
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
       ORDER BY created_at_epoch DESC, id DESC` : `SELECT learned, completed, next_steps FROM summaries
       WHERE created_at_epoch >= ? AND created_at_epoch <= ?
       ORDER BY created_at_epoch DESC, id DESC`;
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
init_ImportExport();

// src/types/worker-types.ts
var KNOWLEDGE_TYPES = ["constraint", "decision", "heuristic", "rejected"];

// src/services/sqlite/Retention.ts
var KNOWLEDGE_TYPE_LIST = KNOWLEDGE_TYPES;
var KNOWLEDGE_PLACEHOLDERS = KNOWLEDGE_TYPE_LIST.map(() => "?").join(", ");

// src/services/sqlite/Backup.ts
init_logger();
import {
  existsSync as existsSync4,
  mkdirSync as mkdirSync3,
  copyFileSync,
  readdirSync,
  statSync as statSync2,
  unlinkSync,
  readFileSync as readFileSync2,
  writeFileSync
} from "fs";
import { join as join3, basename as basename2 } from "path";
function formatTimestamp(date) {
  const pad = (n, len = 2) => String(n).padStart(len, "0");
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const mins = pad(date.getMinutes());
  const secs = pad(date.getSeconds());
  const ms = pad(date.getMilliseconds(), 3);
  return `${year}-${month}-${day}-${hours}${mins}${secs}-${ms}`;
}
function collectStats(db, dbPath) {
  const countTable = (table) => {
    try {
      const row = db.query(`SELECT COUNT(*) as c FROM ${table}`).get();
      return row?.c ?? 0;
    } catch {
      return 0;
    }
  };
  const dbSizeBytes = existsSync4(dbPath) ? statSync2(dbPath).size : 0;
  return {
    observations: countTable("observations"),
    sessions: countTable("sessions"),
    summaries: countTable("summaries"),
    prompts: countTable("prompts"),
    dbSizeBytes
  };
}
function getSchemaVersion(db) {
  try {
    const row = db.query("SELECT MAX(version) as v FROM schema_versions").get();
    return row?.v ?? 0;
  } catch {
    return 0;
  }
}
function createBackup(dbPath, backupDir, db) {
  mkdirSync3(backupDir, { recursive: true });
  const now = /* @__PURE__ */ new Date();
  const ts = formatTimestamp(now);
  const filename = `backup-${ts}.db`;
  const destPath = join3(backupDir, filename);
  const metaFilename = `backup-${ts}.meta.json`;
  const metaPath = join3(backupDir, metaFilename);
  if (!existsSync4(dbPath)) {
    throw new Error(`Database non trovato: ${dbPath}`);
  }
  copyFileSync(dbPath, destPath);
  logger.info("BACKUP", `File DB copiato: ${dbPath} \u2192 ${destPath}`);
  const walPath = `${dbPath}-wal`;
  const shmPath = `${dbPath}-shm`;
  if (existsSync4(walPath)) {
    copyFileSync(walPath, `${destPath}-wal`);
    logger.debug("BACKUP", "File WAL copiato");
  }
  if (existsSync4(shmPath)) {
    copyFileSync(shmPath, `${destPath}-shm`);
    logger.debug("BACKUP", "File SHM copiato");
  }
  const stats = collectStats(db, dbPath);
  const schemaVersion = getSchemaVersion(db);
  const metadata = {
    timestamp: now.toISOString(),
    timestampEpoch: now.getTime(),
    schemaVersion,
    stats,
    sourcePath: dbPath,
    filename
  };
  writeFileSync(metaPath, JSON.stringify(metadata, null, 2), "utf8");
  logger.info("BACKUP", `Metadata scritto: ${metaPath}`);
  return {
    filePath: destPath,
    metaPath,
    metadata
  };
}
function listBackups(backupDir) {
  if (!existsSync4(backupDir)) {
    return [];
  }
  const entries = [];
  let files;
  try {
    files = readdirSync(backupDir);
  } catch (err) {
    logger.warn("BACKUP", `Impossibile leggere la directory backup: ${backupDir}`, {}, err);
    return [];
  }
  const metaFiles = files.filter((f) => f.startsWith("backup-") && f.endsWith(".meta.json"));
  for (const metaFile of metaFiles) {
    const metaPath = join3(backupDir, metaFile);
    const dbFilename = metaFile.replace(/\.meta\.json$/, ".db");
    const filePath = join3(backupDir, dbFilename);
    let metadata;
    try {
      const raw = readFileSync2(metaPath, "utf8");
      metadata = JSON.parse(raw);
    } catch (err) {
      logger.warn("BACKUP", `Metadata non leggibile: ${metaPath}`, {}, err);
      continue;
    }
    if (!existsSync4(filePath)) {
      logger.warn("BACKUP", `File backup mancante per metadata: ${filePath}`);
      continue;
    }
    entries.push({ filePath, metaPath, metadata });
  }
  entries.sort((a, b) => b.metadata.timestampEpoch - a.metadata.timestampEpoch);
  return entries;
}
function restoreBackup(backupFile, dbPath) {
  if (!existsSync4(backupFile)) {
    throw new Error(`File backup non trovato: ${backupFile}`);
  }
  copyFileSync(backupFile, dbPath);
  logger.info("BACKUP", `Database ripristinato: ${backupFile} \u2192 ${dbPath}`);
  const walBackup = `${backupFile}-wal`;
  const shmBackup = `${backupFile}-shm`;
  const walDest = `${dbPath}-wal`;
  const shmDest = `${dbPath}-shm`;
  if (existsSync4(walBackup)) {
    copyFileSync(walBackup, walDest);
    logger.debug("BACKUP", "File WAL ripristinato");
  } else if (existsSync4(walDest)) {
    unlinkSync(walDest);
    logger.debug("BACKUP", "File WAL corrente rimosso (non presente nel backup)");
  }
  if (existsSync4(shmBackup)) {
    copyFileSync(shmBackup, shmDest);
    logger.debug("BACKUP", "File SHM ripristinato");
  } else if (existsSync4(shmDest)) {
    unlinkSync(shmDest);
    logger.debug("BACKUP", "File SHM corrente rimosso (non presente nel backup)");
  }
}
function rotateBackups(backupDir, maxKeep) {
  if (maxKeep <= 0) {
    throw new Error(`maxKeep deve essere > 0, ricevuto: ${maxKeep}`);
  }
  const entries = listBackups(backupDir);
  if (entries.length <= maxKeep) {
    logger.debug("BACKUP", `Rotazione non necessaria: ${entries.length}/${maxKeep} backup presenti`);
    return 0;
  }
  const toDelete = entries.slice(maxKeep);
  let deleted = 0;
  for (const entry of toDelete) {
    try {
      if (existsSync4(entry.filePath)) {
        unlinkSync(entry.filePath);
      }
    } catch (err) {
      logger.warn("BACKUP", `Impossibile eliminare: ${entry.filePath}`, {}, err);
    }
    for (const extra of [`${entry.filePath}-wal`, `${entry.filePath}-shm`]) {
      try {
        if (existsSync4(extra)) unlinkSync(extra);
      } catch {
      }
    }
    try {
      if (existsSync4(entry.metaPath)) {
        unlinkSync(entry.metaPath);
      }
    } catch (err) {
      logger.warn("BACKUP", `Impossibile eliminare metadata: ${entry.metaPath}`, {}, err);
    }
    logger.info("BACKUP", `Backup rimosso (rotazione): ${basename2(entry.filePath)}`);
    deleted++;
  }
  logger.info("BACKUP", `Rotazione completata: ${deleted} backup eliminati, ${maxKeep} mantenuti`);
  return deleted;
}

// src/sdk/index.ts
init_Observations();
import { createHash as createHash2 } from "crypto";
init_Search();

// src/services/search/HybridSearch.ts
init_EmbeddingService();

// src/services/search/VectorSearch.ts
init_EmbeddingService();
init_logger();
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
var KNOWLEDGE_TYPE_BOOST = {
  constraint: 1.3,
  decision: 1.25,
  heuristic: 1.15,
  rejected: 1.1
};
function knowledgeTypeBoost(type) {
  return KNOWLEDGE_TYPE_BOOST[type] ?? 1;
}

// src/services/search/HybridSearch.ts
init_logger();
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

// src/sdk/index.ts
init_EmbeddingService();
init_logger();
var KiroMemorySDK = class {
  db;
  project;
  constructor(config = {}) {
    this.db = new KiroMemoryDatabase(config.dataDir, config.skipMigrations || false);
    this.project = config.project || this.detectProject();
  }
  detectProject() {
    try {
      const { execSync: execSync2 } = __require("child_process");
      const gitRoot = execSync2("git rev-parse --show-toplevel", {
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
   * Validate input for storeObservation
   */
  validateObservationInput(data) {
    if (!data.type || typeof data.type !== "string" || data.type.length > 100) {
      throw new Error("type is required (string, max 100 chars)");
    }
    if (!data.title || typeof data.title !== "string" || data.title.length > 500) {
      throw new Error("title is required (string, max 500 chars)");
    }
    if (!data.content || typeof data.content !== "string" || data.content.length > 1e5) {
      throw new Error("content is required (string, max 100KB)");
    }
  }
  /**
   * Validate input for storeSummary
   */
  validateSummaryInput(data) {
    const MAX = 5e4;
    for (const [key, val] of Object.entries(data)) {
      if (val !== void 0 && val !== null) {
        if (typeof val !== "string") throw new Error(`${key} must be a string`);
        if (val.length > MAX) throw new Error(`${key} too large (max 50KB)`);
      }
    }
  }
  /**
   * Generate and store embedding for an observation (fire-and-forget, non-blocking)
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
      logger.debug("SDK", `Embedding generation failed for obs ${observationId}: ${error}`);
    }
  }
  /**
   * Generate SHA256 content hash for content-based deduplication.
   * Uses (project + type + title + narrative) as semantic identity tuple.
   * Does NOT include sessionId since it's unique per invocation.
   */
  generateContentHash(type, title, narrative) {
    const payload = `${this.project}|${type}|${title}|${narrative || ""}`;
    return createHash2("sha256").update(payload).digest("hex");
  }
  /**
   * Deduplication windows per type (ms).
   * Types with many repetitions have wider windows.
   */
  getDeduplicationWindow(type) {
    switch (type) {
      case "file-read":
        return 6e4;
      // 60s — frequent reads on the same files
      case "file-write":
        return 1e4;
      // 10s — rapid consecutive writes
      case "command":
        return 3e4;
      // 30s — standard
      case "research":
        return 12e4;
      // 120s — repeated web search and fetch
      case "delegation":
        return 6e4;
      // 60s — rapid delegations
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
      logger.debug("SDK", `Duplicate observation discarded (${data.type}, ${dedupWindow}ms): ${data.title}`);
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
   * Store structured knowledge (constraint, decision, heuristic, rejected).
   * Uses the `type` field for knowledgeType and `facts` for JSON metadata.
   */
  async storeKnowledge(data) {
    if (!KNOWLEDGE_TYPES.includes(data.knowledgeType)) {
      throw new Error(`Invalid knowledgeType: ${data.knowledgeType}. Allowed values: ${KNOWLEDGE_TYPES.join(", ")}`);
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
    const contentHash = this.generateContentHash(data.knowledgeType, data.title);
    if (isDuplicateObservation(this.db.db, contentHash)) {
      logger.debug("SDK", `Duplicate knowledge discarded: ${data.title}`);
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
      // facts = JSON metadata
      data.concepts?.join(", ") || null,
      data.files?.join(", ") || null,
      null,
      // filesModified: knowledge doesn't modify files
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
   * Hybrid search: vector search + keyword FTS5
   * Requires HybridSearch initialization (embedding service)
   */
  async hybridSearch(query, options = {}) {
    const hybridSearch2 = getHybridSearch();
    return hybridSearch2.search(this.db.db, query, {
      project: this.project,
      limit: options.limit || 10
    });
  }
  /**
   * Semantic-only search (vector search)
   * Returns results based on cosine similarity with embeddings
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
   * Generate embeddings for observations that don't have them yet
   */
  async backfillEmbeddings(batchSize = 50) {
    const vectorSearch2 = getVectorSearch();
    return vectorSearch2.backfillEmbeddings(this.db.db, batchSize);
  }
  /**
   * Embedding statistics in the database
   */
  getEmbeddingStats() {
    const vectorSearch2 = getVectorSearch();
    return vectorSearch2.getStats(this.db.db);
  }
  /**
   * Initialize the embedding service (lazy, call before hybridSearch)
   */
  async initializeEmbeddings() {
    const hybridSearch2 = getHybridSearch();
    await hybridSearch2.initialize();
    return getEmbeddingService().isAvailable();
  }
  /**
   * Smart context with 4-signal ranking and token budget.
   *
   * If query present: uses HybridSearch with SEARCH_WEIGHTS.
   * If no query: ranking by recency + project match (CONTEXT_WEIGHTS).
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
   * Detect stale observations (files modified after creation) and mark them in DB.
   * Returns the number of observations marked as stale.
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
   * Consolidate duplicate observations on the same file and type.
   * Groups by (project, type, files_modified), keeps the most recent.
   */
  async consolidateObservations(options = {}) {
    return consolidateObservations(this.db.db, this.project, options);
  }
  /**
   * Decay statistics: total, stale, never accessed, recently accessed.
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
   * Create a structured checkpoint for session resume.
   * Automatically saves a context_snapshot with the last 10 observations.
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
   * Retrieve the latest checkpoint of a specific session.
   */
  async getCheckpoint(sessionId) {
    return getLatestCheckpoint(this.db.db, sessionId);
  }
  /**
   * Retrieve the latest checkpoint for the current project.
   * Useful for automatic resume without specifying session ID.
   */
  async getLatestProjectCheckpoint() {
    return getLatestCheckpointByProject(this.db.db, this.project);
  }
  /**
   * Generate an activity report for the current project.
   * Aggregates observations, sessions, summaries and files for a time period.
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
   * Lista osservazioni con keyset pagination.
   * Restituisce un oggetto { data, next_cursor, has_more }.
   *
   * Esempio:
   *   const page1 = await sdk.listObservations({ limit: 50 });
   *   const page2 = await sdk.listObservations({ cursor: page1.next_cursor });
   */
  async listObservations(options = {}) {
    const limit = Math.min(Math.max(options.limit ?? 50, 1), 200);
    const project = options.project ?? this.project;
    let rows;
    if (options.cursor) {
      const decoded = decodeCursor(options.cursor);
      if (!decoded) throw new Error("Cursor non valido");
      const sql = project ? `SELECT * FROM observations
           WHERE project = ? AND (created_at_epoch < ? OR (created_at_epoch = ? AND id < ?))
           ORDER BY created_at_epoch DESC, id DESC
           LIMIT ?` : `SELECT * FROM observations
           WHERE (created_at_epoch < ? OR (created_at_epoch = ? AND id < ?))
           ORDER BY created_at_epoch DESC, id DESC
           LIMIT ?`;
      rows = project ? this.db.db.query(sql).all(project, decoded.epoch, decoded.epoch, decoded.id, limit) : this.db.db.query(sql).all(decoded.epoch, decoded.epoch, decoded.id, limit);
    } else {
      const sql = project ? "SELECT * FROM observations WHERE project = ? ORDER BY created_at_epoch DESC, id DESC LIMIT ?" : "SELECT * FROM observations ORDER BY created_at_epoch DESC, id DESC LIMIT ?";
      rows = project ? this.db.db.query(sql).all(project, limit) : this.db.db.query(sql).all(limit);
    }
    const next_cursor = rows.length >= limit ? encodeCursor(rows[rows.length - 1].id, rows[rows.length - 1].created_at_epoch) : null;
    return { data: rows, next_cursor, has_more: next_cursor !== null };
  }
  /**
   * Lista sommari con keyset pagination.
   * Restituisce un oggetto { data, next_cursor, has_more }.
   *
   * Esempio:
   *   const page1 = await sdk.listSummaries({ limit: 20 });
   *   const page2 = await sdk.listSummaries({ cursor: page1.next_cursor });
   */
  async listSummaries(options = {}) {
    const limit = Math.min(Math.max(options.limit ?? 20, 1), 200);
    const project = options.project ?? this.project;
    let rows;
    if (options.cursor) {
      const decoded = decodeCursor(options.cursor);
      if (!decoded) throw new Error("Cursor non valido");
      const sql = project ? `SELECT * FROM summaries
           WHERE project = ? AND (created_at_epoch < ? OR (created_at_epoch = ? AND id < ?))
           ORDER BY created_at_epoch DESC, id DESC
           LIMIT ?` : `SELECT * FROM summaries
           WHERE (created_at_epoch < ? OR (created_at_epoch = ? AND id < ?))
           ORDER BY created_at_epoch DESC, id DESC
           LIMIT ?`;
      rows = project ? this.db.db.query(sql).all(project, decoded.epoch, decoded.epoch, decoded.id, limit) : this.db.db.query(sql).all(decoded.epoch, decoded.epoch, decoded.id, limit);
    } else {
      const sql = project ? "SELECT * FROM summaries WHERE project = ? ORDER BY created_at_epoch DESC, id DESC LIMIT ?" : "SELECT * FROM summaries ORDER BY created_at_epoch DESC, id DESC LIMIT ?";
      rows = project ? this.db.db.query(sql).all(project, limit) : this.db.db.query(sql).all(limit);
    }
    const next_cursor = rows.length >= limit ? encodeCursor(rows[rows.length - 1].id, rows[rows.length - 1].created_at_epoch) : null;
    return { data: rows, next_cursor, has_more: next_cursor !== null };
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

// src/services/report-formatter.ts
function formatReportText(data) {
  const lines = [];
  lines.push("");
  lines.push(`  \x1B[36m\u2550\u2550\u2550 Kiro Memory Report \u2014 ${data.period.label} \u2550\u2550\u2550\x1B[0m`);
  lines.push(`  \x1B[2m${data.period.start} \u2192 ${data.period.end} (${data.period.days} days)\x1B[0m`);
  lines.push("");
  lines.push(`  \x1B[1mOverview\x1B[0m`);
  lines.push(`    Observations:  ${data.overview.observations}`);
  lines.push(`    Summaries:     ${data.overview.summaries}`);
  lines.push(`    Sessions:      ${data.overview.sessions}`);
  lines.push(`    Prompts:       ${data.overview.prompts}`);
  lines.push(`    Knowledge:     ${data.overview.knowledgeCount}`);
  if (data.overview.staleCount > 0) {
    lines.push(`    Stale:         ${data.overview.staleCount}`);
  }
  lines.push("");
  if (data.sessionStats.total > 0) {
    const completionPct = data.sessionStats.total > 0 ? Math.round(data.sessionStats.completed / data.sessionStats.total * 100) : 0;
    lines.push(`  \x1B[1mSessions\x1B[0m`);
    lines.push(`    Total: ${data.sessionStats.total} | Completed: ${data.sessionStats.completed} (${completionPct}%)`);
    if (data.sessionStats.avgDurationMinutes > 0) {
      lines.push(`    Avg duration: ${data.sessionStats.avgDurationMinutes} min`);
    }
    lines.push("");
  }
  if (data.timeline.length > 0) {
    lines.push(`  \x1B[1mTimeline\x1B[0m`);
    const maxCount = Math.max(...data.timeline.map((t) => t.count));
    const maxBarLen = 30;
    for (const entry of data.timeline) {
      const barLen = maxCount > 0 ? Math.round(entry.count / maxCount * maxBarLen) : 0;
      const bar = "\x1B[32m" + "\u2593".repeat(barLen) + "\x1B[0m";
      const dayShort = entry.day.substring(5);
      lines.push(`    ${dayShort}  ${bar} ${entry.count}`);
    }
    lines.push("");
  }
  if (data.typeDistribution.length > 0) {
    lines.push(`  \x1B[1mBy Type\x1B[0m`);
    for (const entry of data.typeDistribution) {
      lines.push(`    ${entry.type.padEnd(16)} ${entry.count}`);
    }
    lines.push("");
  }
  if (data.topLearnings.length > 0) {
    lines.push(`  \x1B[1mKey Learnings\x1B[0m`);
    for (const learning of data.topLearnings) {
      lines.push(`    - ${learning}`);
    }
    lines.push("");
  }
  if (data.completedTasks.length > 0) {
    lines.push(`  \x1B[1mCompleted\x1B[0m`);
    for (const task of data.completedTasks) {
      lines.push(`    - ${task}`);
    }
    lines.push("");
  }
  if (data.nextSteps.length > 0) {
    lines.push(`  \x1B[1mNext Steps\x1B[0m`);
    for (const step of data.nextSteps) {
      lines.push(`    - ${step}`);
    }
    lines.push("");
  }
  if (data.fileHotspots.length > 0) {
    lines.push(`  \x1B[1mFile Hotspots\x1B[0m`);
    for (const entry of data.fileHotspots.slice(0, 10)) {
      lines.push(`    ${entry.file} (${entry.count}x)`);
    }
    lines.push("");
  }
  return lines.join("\n");
}
function formatReportMarkdown(data) {
  const lines = [];
  lines.push(`# Kiro Memory Report \u2014 ${data.period.label}`);
  lines.push("");
  lines.push(`**Period**: ${data.period.start} \u2192 ${data.period.end} (${data.period.days} days)`);
  lines.push("");
  lines.push("## Overview");
  lines.push("");
  lines.push("| Metric | Count |");
  lines.push("|--------|------:|");
  lines.push(`| Observations | ${data.overview.observations} |`);
  lines.push(`| Summaries | ${data.overview.summaries} |`);
  lines.push(`| Sessions | ${data.overview.sessions} |`);
  lines.push(`| Prompts | ${data.overview.prompts} |`);
  lines.push(`| Knowledge items | ${data.overview.knowledgeCount} |`);
  if (data.overview.staleCount > 0) {
    lines.push(`| Stale observations | ${data.overview.staleCount} |`);
  }
  lines.push("");
  if (data.sessionStats.total > 0) {
    const completionPct = Math.round(data.sessionStats.completed / data.sessionStats.total * 100);
    lines.push("## Sessions");
    lines.push("");
    lines.push(`- **Total**: ${data.sessionStats.total}`);
    lines.push(`- **Completed**: ${data.sessionStats.completed} (${completionPct}%)`);
    if (data.sessionStats.avgDurationMinutes > 0) {
      lines.push(`- **Avg duration**: ${data.sessionStats.avgDurationMinutes} min`);
    }
    lines.push("");
  }
  if (data.timeline.length > 0) {
    lines.push("## Activity Timeline");
    lines.push("");
    lines.push("| Date | Observations |");
    lines.push("|------|------------:|");
    for (const entry of data.timeline) {
      lines.push(`| ${entry.day} | ${entry.count} |`);
    }
    lines.push("");
  }
  if (data.typeDistribution.length > 0) {
    lines.push("## Observation Types");
    lines.push("");
    for (const entry of data.typeDistribution) {
      lines.push(`- **${entry.type}**: ${entry.count}`);
    }
    lines.push("");
  }
  if (data.topLearnings.length > 0) {
    lines.push("## Key Learnings");
    lines.push("");
    for (const learning of data.topLearnings) {
      lines.push(`- ${learning}`);
    }
    lines.push("");
  }
  if (data.completedTasks.length > 0) {
    lines.push("## Completed");
    lines.push("");
    for (const task of data.completedTasks) {
      lines.push(`- ${task}`);
    }
    lines.push("");
  }
  if (data.nextSteps.length > 0) {
    lines.push("## Next Steps");
    lines.push("");
    for (const step of data.nextSteps) {
      lines.push(`- ${step}`);
    }
    lines.push("");
  }
  if (data.fileHotspots.length > 0) {
    lines.push("## File Hotspots");
    lines.push("");
    lines.push("| File | Modifications |");
    lines.push("|------|-------------:|");
    for (const entry of data.fileHotspots.slice(0, 10)) {
      lines.push(`| \`${entry.file}\` | ${entry.count} |`);
    }
    lines.push("");
  }
  return lines.join("\n");
}
function formatReportJson(data) {
  return JSON.stringify(data, null, 2);
}

// src/cli/banner.ts
var G = [
  "\x1B[38;5;135m",
  // viola
  "\x1B[38;5;99m",
  // viola-blu
  "\x1B[38;5;63m",
  // indaco
  "\x1B[38;5;33m",
  // blu
  "\x1B[38;5;39m",
  // blu chiaro
  "\x1B[38;5;44m"
  // ciano
];
var R = "\x1B[0m";
var B = "\x1B[1m";
var D = "\x1B[2m";
var U = "\x1B[4m";
var GRN = "\x1B[32m";
var CYN = "\x1B[36m";
var LOGO = [
  " \u2588\u2588\u2557  \u2588\u2588\u2557\u2588\u2588\u2557\u2588\u2588\u2588\u2588\u2588\u2588\u2557  \u2588\u2588\u2588\u2588\u2588\u2588\u2557 ",
  " \u2588\u2588\u2551 \u2588\u2588\u2554\u255D\u2588\u2588\u2551\u2588\u2588\u2554\u2550\u2550\u2588\u2588\u2557\u2588\u2588\u2554\u2550\u2550\u2550\u2588\u2588\u2557",
  " \u2588\u2588\u2588\u2588\u2588\u2554\u255D \u2588\u2588\u2551\u2588\u2588\u2588\u2588\u2588\u2588\u2554\u255D\u2588\u2588\u2551   \u2588\u2588\u2551",
  " \u2588\u2588\u2554\u2550\u2588\u2588\u2557 \u2588\u2588\u2551\u2588\u2588\u2554\u2550\u2550\u2588\u2588\u2557\u2588\u2588\u2551   \u2588\u2588\u2551",
  " \u2588\u2588\u2551  \u2588\u2588\u2557\u2588\u2588\u2551\u2588\u2588\u2551  \u2588\u2588\u2551\u255A\u2588\u2588\u2588\u2588\u2588\u2588\u2554\u255D",
  " \u255A\u2550\u255D  \u255A\u2550\u255D\u255A\u2550\u255D\u255A\u2550\u255D  \u255A\u2550\u255D \u255A\u2550\u2550\u2550\u2550\u2550\u255D"
];
var MEMORY_TAG = "          M E M O R Y";
var LINE = "\u2500".repeat(48);
function supportsColor() {
  if (process.env.NO_COLOR || process.env.TERM === "dumb") return false;
  return process.stdout.isTTY ?? false;
}
function printBanner(opts) {
  const color = supportsColor();
  const c = (code, text) => color ? `${code}${text}${R}` : text;
  console.log("");
  for (let i = 0; i < LOGO.length; i++) {
    console.log(`  ${c(G[i], LOGO[i])}`);
  }
  console.log(`  ${c(`${G[G.length - 1]}${B}`, MEMORY_TAG)}`);
  console.log("");
  console.log(`  ${c(D, LINE)}`);
  console.log("");
  console.log(`  ${c(`${GRN}${B}`, "\u2713 Installation complete!")}  v${opts.version}`);
  console.log(`  ${c(D, `Editor: ${opts.editor}`)}`);
  console.log("");
  console.log(`  ${c(`${CYN}${B}`, "Installed:")}`);
  for (const p of opts.configPaths) {
    console.log(`    ${c(D, "\u2192")} ${p}`);
  }
  console.log(`    ${c(D, "\u2192")} Data: ${opts.dataDir}`);
  console.log("");
  console.log(`  ${c(`${CYN}${B}`, "Dashboard:")}  ${c(U, opts.dashboardUrl)}`);
  console.log(`  ${c(D, "Docs:       https://auritidesign.it/docs/kiro-memory/")}`);
  console.log("");
  console.log(`  ${c(D, LINE)}`);
  console.log(`  ${c(G[2], "Your AI assistant now has persistent memory.")}`);
  console.log(`  ${c(G[3], "Every session builds on the last.")}`);
  console.log(`  ${c(D, LINE)}`);
  console.log("");
}

// src/cli/contextkit.ts
init_cli_utils();
init_Observations();
import { execSync } from "child_process";
import { existsSync as existsSync6, mkdirSync as mkdirSync5, readFileSync as readFileSync4, writeFileSync as writeFileSync3, appendFileSync as appendFileSync2 } from "fs";
import { join as join5, dirname as dirname2 } from "path";
import { homedir as homedir4, platform, release } from "os";
import { fileURLToPath as fileURLToPath2 } from "url";
import { createInterface } from "readline";
import * as http from "http";
var args = process.argv.slice(2);
var command = args[0];
var __filename = fileURLToPath2(import.meta.url);
var __dirname2 = dirname2(__filename);
var DIST_DIR = dirname2(__dirname2);
var PKG_VERSION = "unknown";
try {
  const pkgPath = join5(DIST_DIR, "..", "..", "package.json");
  PKG_VERSION = JSON.parse(readFileSync4(pkgPath, "utf8")).version;
} catch {
}
var AGENT_TEMPLATE = JSON.stringify({
  name: "kiro-memory",
  description: "Agent with persistent cross-session memory. Uses Kiro Memory to remember context from previous sessions and automatically save what it learns.",
  model: "claude-sonnet-4",
  tools: ["read", "write", "shell", "glob", "grep", "web_search", "web_fetch", "@kiro-memory"],
  mcpServers: {
    "kiro-memory": {
      command: "node",
      args: ["__DIST_DIR__/servers/mcp-server.js"]
    }
  },
  hooks: {
    agentSpawn: [{ command: "node __DIST_DIR__/hooks/agentSpawn.js", timeout_ms: 1e4 }],
    userPromptSubmit: [{ command: "node __DIST_DIR__/hooks/userPromptSubmit.js", timeout_ms: 5e3 }],
    postToolUse: [{ command: "node __DIST_DIR__/hooks/postToolUse.js", matcher: "*", timeout_ms: 5e3 }],
    stop: [{ command: "node __DIST_DIR__/hooks/stop.js", timeout_ms: 1e4 }]
  },
  resources: ["file://.kiro/steering/kiro-memory.md"]
}, null, 2);
var STEERING_CONTENT = `# Kiro Memory - Persistent Memory

You have access to Kiro Memory, a persistent cross-session memory system.

## Available MCP Tools

### @kiro-memory/search
Search previous session memory. Use when:
- The user mentions past work
- You need context on previous decisions
- You want to check if a problem was already addressed

### @kiro-memory/get_context
Retrieve recent context for the current project. Use at the start of complex tasks to understand what was done before.

### @kiro-memory/timeline
Show chronological context around an observation. Use to understand the sequence of events.

### @kiro-memory/get_observations
Retrieve full details of specific observations. Use after \`search\` to drill down.

## Behavior

- Previous session context is automatically injected at startup
- Your actions (files written, commands run) are tracked automatically
- A summary is generated at the end of each session
- No manual saving needed: the system is fully automatic
`;
function isWSL() {
  try {
    const rel = release().toLowerCase();
    if (rel.includes("microsoft") || rel.includes("wsl")) return true;
    if (existsSync6("/proc/version")) {
      const proc = readFileSync4("/proc/version", "utf8").toLowerCase();
      return proc.includes("microsoft") || proc.includes("wsl");
    }
    return false;
  } catch {
    return false;
  }
}
function commandExists(cmd) {
  try {
    execSync(`which ${cmd}`, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}
function isWindowsPath(p) {
  return p.startsWith("/mnt/c") || p.startsWith("/mnt/d") || /^[A-Za-z]:[\\\/]/.test(p);
}
function runEnvironmentChecks() {
  const checks = [];
  const wsl = isWSL();
  const os = platform();
  checks.push({
    name: "Operating system",
    ok: os === "linux" || os === "darwin",
    message: os === "linux" ? wsl ? "Linux (WSL)" : "Linux" : os === "darwin" ? "macOS" : `${os} (not officially supported)`
  });
  if (wsl) {
    const nodePath = process.execPath;
    const nodeOnWindows = isWindowsPath(nodePath);
    checks.push({
      name: "WSL: Native Node.js",
      ok: !nodeOnWindows,
      message: nodeOnWindows ? `Node.js points to Windows: ${nodePath}` : `Native Linux Node.js: ${nodePath}`,
      fix: nodeOnWindows ? "Install Node.js inside WSL:\n  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -\n  sudo apt-get install -y nodejs\n  Or use nvm: https://github.com/nvm-sh/nvm" : void 0
    });
    try {
      const npmPrefix = execSync("npm prefix -g", { encoding: "utf8" }).trim();
      const prefixOnWindows = isWindowsPath(npmPrefix);
      checks.push({
        name: "WSL: npm global prefix",
        ok: !prefixOnWindows,
        message: prefixOnWindows ? `npm global prefix points to Windows: ${npmPrefix}` : `npm global prefix: ${npmPrefix}`,
        fix: prefixOnWindows ? `Fix npm prefix:
  mkdir -p ~/.npm-global
  npm config set prefix ~/.npm-global
  echo 'export PATH="$HOME/.npm-global/bin:$PATH"' >> ~/.bashrc
  source ~/.bashrc
  Then reinstall: npm install -g kiro-memory` : void 0
      });
    } catch {
      checks.push({
        name: "WSL: npm global prefix",
        ok: false,
        message: "Unable to determine npm prefix"
      });
    }
    try {
      const npmPath = execSync("which npm", { encoding: "utf8" }).trim();
      const npmOnWindows = isWindowsPath(npmPath);
      checks.push({
        name: "WSL: npm binary",
        ok: !npmOnWindows,
        message: npmOnWindows ? `npm is the Windows version: ${npmPath}` : `Native Linux npm: ${npmPath}`,
        fix: npmOnWindows ? "Your npm binary is the Windows version running inside WSL.\n  This causes EPERM/UNC errors when installing packages.\n  Install Node.js (includes npm) natively in WSL:\n    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash\n    source ~/.bashrc\n    nvm install 22\n  Or:\n    curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -\n    sudo apt-get install -y nodejs" : void 0
      });
    } catch {
    }
  }
  const nodeVersion = parseInt(process.versions.node.split(".")[0]);
  checks.push({
    name: "Node.js >= 18",
    ok: nodeVersion >= 18,
    message: `Node.js v${process.versions.node}`,
    fix: nodeVersion < 18 ? "Upgrade Node.js:\n  nvm install 22 && nvm use 22\n  Or visit: https://nodejs.org/" : void 0
  });
  let sqliteOk = false;
  let sqliteMsg = "";
  try {
    __require("better-sqlite3");
    sqliteOk = true;
    sqliteMsg = "Native module loaded successfully";
  } catch (err) {
    sqliteMsg = err.code === "ERR_DLOPEN_FAILED" ? "Incompatible native binary (invalid ELF header \u2014 likely platform mismatch)" : `Error: ${err.message}`;
  }
  checks.push({
    name: "better-sqlite3",
    ok: sqliteOk,
    message: sqliteMsg,
    fix: !sqliteOk ? wsl ? "In WSL, rebuild the native module:\n  npm rebuild better-sqlite3\n  If that fails, reinstall:\n  npm install -g kiro-memory --build-from-source" : "Rebuild the native module:\n  npm rebuild better-sqlite3" : void 0
  });
  if (os === "linux") {
    const hasMake = commandExists("make");
    const hasGcc = commandExists("g++") || commandExists("gcc");
    const hasPython = commandExists("python3") || commandExists("python");
    const allPresent = hasMake && hasGcc && hasPython;
    const missing = [];
    if (!hasMake || !hasGcc) missing.push("build-essential");
    if (!hasPython) missing.push("python3");
    checks.push({
      name: "Build tools (native modules)",
      ok: allPresent,
      message: allPresent ? "make, g++, python3 available" : `Missing: ${missing.join(", ")}`,
      fix: !allPresent ? `Install required packages:
  sudo apt-get update && sudo apt-get install -y ${missing.join(" ")}
  Then reinstall: npm install -g kiro-memory --build-from-source` : void 0
    });
  }
  return checks;
}
function printChecks(checks) {
  let hasErrors = false;
  console.log("");
  for (const check of checks) {
    const icon = check.ok ? "\x1B[32m\u2713\x1B[0m" : "\x1B[31m\u2717\x1B[0m";
    console.log(`  ${icon} ${check.name}: ${check.message}`);
    if (!check.ok && check.fix) {
      console.log(`    \x1B[33m\u2192 Fix:\x1B[0m`);
      for (const line of check.fix.split("\n")) {
        console.log(`      ${line}`);
      }
    }
    if (!check.ok) hasErrors = true;
  }
  console.log("");
  return { hasErrors };
}
function askUser(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase());
    });
  });
}
function detectShellRc() {
  const shell = process.env.SHELL || "/bin/bash";
  if (shell.includes("zsh")) return { name: "zsh", rcFile: join5(homedir4(), ".zshrc") };
  if (shell.includes("fish")) return { name: "fish", rcFile: join5(homedir4(), ".config/fish/config.fish") };
  return { name: "bash", rcFile: join5(homedir4(), ".bashrc") };
}
var AUTOFIXABLE_CHECKS = /* @__PURE__ */ new Set([
  "WSL: npm global prefix",
  "WSL: npm binary",
  "Build tools (native modules)",
  "better-sqlite3"
]);
async function tryAutoFix(failedChecks) {
  const fixable = failedChecks.filter((c) => !c.ok && AUTOFIXABLE_CHECKS.has(c.name));
  if (fixable.length === 0) return { fixed: false, needsRestart: false };
  const { rcFile } = detectShellRc();
  let anyFixed = false;
  let needsRestart = false;
  console.log(`  \x1B[36mFound ${fixable.length} issue(s) that can be fixed automatically:\x1B[0m
`);
  for (const check of fixable) {
    console.log(`    - ${check.name}: ${check.message}`);
  }
  console.log("");
  const answer = await askUser("  Fix automatically? [Y/n] ");
  if (answer !== "" && answer !== "y" && answer !== "yes") {
    console.log("\n  Skipped auto-fix. Fix manually and run: kiro-memory install\n");
    return { fixed: false, needsRestart: false };
  }
  console.log("");
  const prefixCheck = fixable.find((c) => c.name === "WSL: npm global prefix");
  if (prefixCheck) {
    console.log("  Fixing npm global prefix...");
    try {
      const npmGlobalDir = join5(homedir4(), ".npm-global");
      mkdirSync5(npmGlobalDir, { recursive: true });
      const { spawnSync: spawnNpmConfig } = __require("child_process");
      spawnNpmConfig("npm", ["config", "set", "prefix", npmGlobalDir], { stdio: "ignore" });
      const exportLine = 'export PATH="$HOME/.npm-global/bin:$PATH"';
      let alreadyInRc = false;
      if (existsSync6(rcFile)) {
        const content = readFileSync4(rcFile, "utf8");
        alreadyInRc = content.includes(".npm-global/bin");
      }
      if (!alreadyInRc) {
        appendFileSync2(rcFile, `
# npm global prefix (added by kiro-memory)
${exportLine}
`);
      }
      process.env.PATH = `${npmGlobalDir}/bin:${process.env.PATH}`;
      console.log(`  \x1B[32m\u2713\x1B[0m npm prefix set to ${npmGlobalDir}`);
      console.log(`  \x1B[32m\u2713\x1B[0m PATH updated in ${rcFile}`);
      anyFixed = true;
    } catch (err) {
      console.log(`  \x1B[31m\u2717\x1B[0m Could not fix npm prefix: ${err.message}`);
    }
  }
  const npmBinaryCheck = fixable.find((c) => c.name === "WSL: npm binary");
  if (npmBinaryCheck) {
    console.log("\n  Fixing npm binary (installing nvm + Node.js 22)...");
    const nvmDir = join5(homedir4(), ".nvm");
    try {
      if (existsSync6(nvmDir)) {
        console.log(`  nvm already installed at ${nvmDir}`);
      } else {
        console.log("  Downloading nvm...");
        execSync("curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash", {
          stdio: "inherit",
          timeout: 6e4
        });
        console.log(`  \x1B[32m\u2713\x1B[0m nvm installed`);
      }
      console.log("  Installing Node.js 22 via nvm...");
      execSync('bash -c "source $HOME/.nvm/nvm.sh && nvm install 22"', {
        stdio: "inherit",
        timeout: 12e4
      });
      console.log(`  \x1B[32m\u2713\x1B[0m Node.js 22 installed`);
      anyFixed = true;
      needsRestart = true;
    } catch (err) {
      console.log(`  \x1B[31m\u2717\x1B[0m Could not install nvm/Node: ${err.message}`);
      console.log("  Install manually:");
      console.log("    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash");
      console.log("    source ~/.bashrc");
      console.log("    nvm install 22");
    }
  }
  const buildCheck = fixable.find((c) => c.name === "Build tools (native modules)");
  if (buildCheck) {
    console.log("\n  Fixing build tools (requires sudo)...");
    try {
      execSync("sudo apt-get update -qq && sudo apt-get install -y build-essential python3", {
        stdio: "inherit",
        timeout: 12e4
      });
      console.log(`  \x1B[32m\u2713\x1B[0m Build tools installed`);
      anyFixed = true;
    } catch (err) {
      console.log(`  \x1B[31m\u2717\x1B[0m Could not install build tools: ${err.message}`);
      console.log("  Install manually: sudo apt-get install -y build-essential python3");
    }
  }
  const sqliteCheck = fixable.find((c) => c.name === "better-sqlite3");
  if (sqliteCheck) {
    console.log("\n  Rebuilding better-sqlite3...");
    try {
      const { spawnSync: spawnRebuild } = __require("child_process");
      const globalDirResult = spawnRebuild("npm", ["prefix", "-g"], { encoding: "utf8", stdio: ["pipe", "pipe", "ignore"] });
      const globalDir = (globalDirResult.stdout || "").trim();
      const sqlitePkg = join5(globalDir, "lib", "node_modules", "kiro-memory");
      if (existsSync6(sqlitePkg)) {
        spawnRebuild("npm", ["rebuild", "better-sqlite3"], {
          cwd: sqlitePkg,
          stdio: "inherit",
          timeout: 6e4
        });
      } else {
        spawnRebuild("npm", ["rebuild", "better-sqlite3"], { stdio: "inherit", timeout: 6e4 });
      }
      console.log(`  \x1B[32m\u2713\x1B[0m better-sqlite3 rebuilt`);
      anyFixed = true;
    } catch (err) {
      console.log(`  \x1B[31m\u2717\x1B[0m Could not rebuild: ${err.message}`);
      console.log("  Try: npm install -g kiro-memory --build-from-source");
    }
  }
  console.log("");
  return { fixed: anyFixed, needsRestart };
}
async function installKiro() {
  console.log("\n=== Kiro Memory - Installation ===\n");
  console.log("[1/4] Running environment checks...");
  let checks = runEnvironmentChecks();
  let { hasErrors } = printChecks(checks);
  if (hasErrors) {
    const { fixed, needsRestart } = await tryAutoFix(checks);
    if (needsRestart) {
      console.log("  \x1B[33m\u250C\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2510\x1B[0m");
      console.log("  \x1B[33m\u2502\x1B[0m  Node.js was installed via nvm. To activate it:         \x1B[33m\u2502\x1B[0m");
      console.log("  \x1B[33m\u2502\x1B[0m                                                         \x1B[33m\u2502\x1B[0m");
      console.log("  \x1B[33m\u2502\x1B[0m  1. Close and reopen your terminal                      \x1B[33m\u2502\x1B[0m");
      console.log("  \x1B[33m\u2502\x1B[0m  2. Run: \x1B[1mnpm install -g kiro-memory\x1B[0m                     \x1B[33m\u2502\x1B[0m");
      console.log("  \x1B[33m\u2502\x1B[0m  3. Run: \x1B[1mkiro-memory install\x1B[0m                            \x1B[33m\u2502\x1B[0m");
      console.log("  \x1B[33m\u2514\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2518\x1B[0m\n");
      process.exit(0);
    }
    if (fixed) {
      console.log("  Re-running checks...\n");
      checks = runEnvironmentChecks();
      ({ hasErrors } = printChecks(checks));
    }
    if (hasErrors) {
      console.log("\x1B[31mInstallation aborted.\x1B[0m Fix the remaining issues and retry.");
      console.log("After fixing, run: kiro-memory install\n");
      process.exit(1);
    }
  }
  const distDir = DIST_DIR;
  const kiroDir = process.env.KIRO_CONFIG_DIR || join5(homedir4(), ".kiro");
  const agentsDir = join5(kiroDir, "agents");
  const settingsDir = join5(kiroDir, "settings");
  const steeringDir = join5(kiroDir, "steering");
  const dataDir = process.env.KIRO_MEMORY_DATA_DIR || process.env.CONTEXTKIT_DATA_DIR || join5(homedir4(), ".contextkit");
  console.log("[2/4] Installing Kiro configuration...\n");
  for (const dir of [agentsDir, settingsDir, steeringDir, dataDir]) {
    mkdirSync5(dir, { recursive: true });
  }
  const agentConfig = AGENT_TEMPLATE.replace(/__DIST_DIR__/g, distDir);
  const agentDestPath = join5(agentsDir, "kiro-memory.json");
  writeFileSync3(agentDestPath, agentConfig, "utf8");
  console.log(`  \u2192 Agent config: ${agentDestPath}`);
  const mcpFilePath = join5(settingsDir, "mcp.json");
  let mcpConfig = { mcpServers: {} };
  if (existsSync6(mcpFilePath)) {
    try {
      mcpConfig = JSON.parse(readFileSync4(mcpFilePath, "utf8"));
      if (!mcpConfig.mcpServers) mcpConfig.mcpServers = {};
    } catch {
    }
  }
  mcpConfig.mcpServers["kiro-memory"] = {
    command: "node",
    args: [join5(distDir, "servers", "mcp-server.js")]
  };
  writeFileSync3(mcpFilePath, JSON.stringify(mcpConfig, null, 2), "utf8");
  console.log(`  \u2192 MCP config:   ${mcpFilePath}`);
  const steeringDestPath = join5(steeringDir, "kiro-memory.md");
  writeFileSync3(steeringDestPath, STEERING_CONTENT, "utf8");
  console.log(`  \u2192 Steering:     ${steeringDestPath}`);
  console.log(`  \u2192 Data dir:     ${dataDir}`);
  console.log("\n[3/4] Shell alias setup\n");
  const { rcFile } = detectShellRc();
  const aliasLine = 'alias kiro="kiro-cli --agent kiro-memory"';
  let aliasAlreadySet = false;
  if (existsSync6(rcFile)) {
    const rcContent = readFileSync4(rcFile, "utf8");
    aliasAlreadySet = rcContent.includes("alias kiro=") && rcContent.includes("kiro-memory");
  }
  if (aliasAlreadySet) {
    console.log(`  \x1B[32m\u2713\x1B[0m Alias already configured in ${rcFile}`);
  } else {
    console.log("  \x1B[36m\u250C\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2510\x1B[0m");
    console.log("  \x1B[36m\u2502\x1B[0m  Without an alias, you must type every time:            \x1B[36m\u2502\x1B[0m");
    console.log("  \x1B[36m\u2502\x1B[0m    \x1B[2mkiro-cli --agent kiro-memory\x1B[0m                          \x1B[36m\u2502\x1B[0m");
    console.log("  \x1B[36m\u2502\x1B[0m                                                         \x1B[36m\u2502\x1B[0m");
    console.log("  \x1B[36m\u2502\x1B[0m  With the alias, just type:                              \x1B[36m\u2502\x1B[0m");
    console.log("  \x1B[36m\u2502\x1B[0m    \x1B[1m\x1B[32mkiro\x1B[0m                                                 \x1B[36m\u2502\x1B[0m");
    console.log("  \x1B[36m\u2514\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2518\x1B[0m");
    console.log("");
    const answer = await askUser(`  Add alias to ${rcFile}? [Y/n] `);
    if (answer === "" || answer === "y" || answer === "yes") {
      try {
        appendFileSync2(rcFile, `
# Kiro Memory \u2014 persistent memory alias
${aliasLine}
`);
        console.log(`
  \x1B[32m\u2713\x1B[0m Alias added to ${rcFile}`);
        console.log(`  \x1B[33m\u2192\x1B[0m Run \x1B[1msource ${rcFile}\x1B[0m or open a new terminal to activate it.`);
      } catch (err) {
        console.log(`
  \x1B[31m\u2717\x1B[0m Could not write to ${rcFile}: ${err.message}`);
        console.log(`  \x1B[33m\u2192\x1B[0m Add manually: ${aliasLine}`);
      }
    } else {
      console.log(`
  Skipped. You can add it manually later:`);
      console.log(`    echo '${aliasLine}' >> ${rcFile}`);
    }
  }
  console.log("\n[4/4] Done!\n");
  printBanner({
    editor: "Kiro CLI",
    version: PKG_VERSION,
    dashboardUrl: "http://localhost:3001",
    dataDir,
    configPaths: [
      `Agent:    ${agentDestPath}`,
      `MCP:      ${mcpFilePath}`,
      `Steering: ${steeringDestPath}`
    ]
  });
  console.log("  Start Kiro with memory:");
  if (aliasAlreadySet) {
    console.log("    \x1B[1mkiro\x1B[0m\n");
  } else {
    console.log("    \x1B[1mkiro-cli --agent kiro-memory\x1B[0m\n");
  }
}
var CLAUDE_CODE_STEERING = `# Kiro Memory - Persistent Cross-Session Memory

You have access to Kiro Memory, a persistent cross-session memory system that remembers context across sessions.

## Available MCP Tools

### kiro-memory/search
Search previous session memory. Use when:
- The user mentions past work or previous sessions
- You need context on previous decisions
- You want to check if a problem was already addressed

### kiro-memory/get_context
Retrieve recent context for the current project. Use at the start of complex tasks.

### kiro-memory/timeline
Show chronological context around an observation. Use to understand sequences of events.

### kiro-memory/get_observations
Retrieve full details of specific observations by ID. Use after search to drill down.

## Behavior

- Previous session context is automatically injected at startup via hooks
- Your actions (files written, commands run, searches) are tracked automatically
- A summary is generated at the end of each session
- No manual saving needed: the system is fully automatic
`;
async function installClaudeCode() {
  console.log("\n=== Kiro Memory - Claude Code Installation ===\n");
  console.log("[1/3] Running environment checks...");
  const checks = runEnvironmentChecks();
  const { hasErrors } = printChecks(checks);
  if (hasErrors) {
    const { fixed, needsRestart } = await tryAutoFix(checks);
    if (needsRestart) {
      console.log("  \x1B[33mRestart your terminal and re-run: kiro-memory install --claude-code\x1B[0m\n");
      process.exit(0);
    }
    if (fixed) {
      console.log("  Re-running checks...\n");
      const reChecks = runEnvironmentChecks();
      const reResult = printChecks(reChecks);
      if (reResult.hasErrors) {
        console.log("\x1B[31mInstallation aborted.\x1B[0m Fix the remaining issues and retry.\n");
        process.exit(1);
      }
    } else if (hasErrors) {
      console.log("\x1B[31mInstallation aborted.\x1B[0m Fix the issues and retry.\n");
      process.exit(1);
    }
  }
  const distDir = DIST_DIR;
  const claudeDir = join5(homedir4(), ".claude");
  const dataDir = process.env.KIRO_MEMORY_DATA_DIR || process.env.CONTEXTKIT_DATA_DIR || join5(homedir4(), ".kiro-memory");
  console.log("[2/3] Installing Claude Code configuration...\n");
  mkdirSync5(claudeDir, { recursive: true });
  mkdirSync5(dataDir, { recursive: true });
  const settingsPath = join5(claudeDir, "settings.json");
  let settings = {};
  if (existsSync6(settingsPath)) {
    try {
      settings = JSON.parse(readFileSync4(settingsPath, "utf8"));
    } catch {
    }
  }
  const hookMap = {
    "SessionStart": { script: "hooks/agentSpawn.js", timeout: 10 },
    "UserPromptSubmit": { script: "hooks/userPromptSubmit.js", timeout: 5 },
    "PostToolUse": { script: "hooks/postToolUse.js", timeout: 5 },
    "Stop": { script: "hooks/stop.js", timeout: 10 }
  };
  for (const [event, config] of Object.entries(hookMap)) {
    const hookEntry = {
      matcher: "",
      hooks: [{
        type: "command",
        command: `node ${join5(distDir, config.script)}`,
        timeout: config.timeout
      }]
    };
    if (!settings[event]) {
      settings[event] = [hookEntry];
    } else if (Array.isArray(settings[event])) {
      settings[event] = settings[event].filter(
        (h) => !h.hooks?.some(
          (hk) => hk.command?.includes("kiro-memory") || hk.command?.includes("contextkit")
        )
      );
      settings[event].push(hookEntry);
    }
  }
  writeFileSync3(settingsPath, JSON.stringify(settings, null, 2), "utf8");
  console.log(`  \u2192 Hooks config: ${settingsPath}`);
  const mcpPath = join5(homedir4(), ".mcp.json");
  let mcpConfig = {};
  if (existsSync6(mcpPath)) {
    try {
      mcpConfig = JSON.parse(readFileSync4(mcpPath, "utf8"));
    } catch {
    }
  }
  if (!mcpConfig.mcpServers) mcpConfig.mcpServers = {};
  mcpConfig.mcpServers["kiro-memory"] = {
    command: "node",
    args: [join5(distDir, "servers", "mcp-server.js")]
  };
  writeFileSync3(mcpPath, JSON.stringify(mcpConfig, null, 2), "utf8");
  console.log(`  \u2192 MCP config:   ${mcpPath}`);
  const steeringPath = join5(claudeDir, "CLAUDE.md");
  let existingSteering = "";
  if (existsSync6(steeringPath)) {
    existingSteering = readFileSync4(steeringPath, "utf8");
  }
  if (!existingSteering.includes("Kiro Memory")) {
    const separator = existingSteering.length > 0 ? "\n\n---\n\n" : "";
    writeFileSync3(steeringPath, existingSteering + separator + CLAUDE_CODE_STEERING, "utf8");
    console.log(`  \u2192 Steering:     ${steeringPath}`);
  } else {
    console.log(`  \u2192 Steering:     ${steeringPath} (already configured)`);
  }
  console.log(`  \u2192 Data dir:     ${dataDir}`);
  console.log("\n[3/3] Done!\n");
  printBanner({
    editor: "Claude Code",
    version: PKG_VERSION,
    dashboardUrl: "http://localhost:3001",
    dataDir,
    configPaths: [
      `Hooks:    ${settingsPath}`,
      `MCP:      ${mcpPath}`,
      `Steering: ${steeringPath}`
    ]
  });
}
async function installCursor() {
  console.log("\n=== Kiro Memory - Cursor Installation ===\n");
  console.log("[1/3] Running environment checks...");
  const checks = runEnvironmentChecks();
  const { hasErrors } = printChecks(checks);
  if (hasErrors) {
    const { fixed, needsRestart } = await tryAutoFix(checks);
    if (needsRestart) {
      console.log("  \x1B[33mRestart your terminal and re-run: kiro-memory install --cursor\x1B[0m\n");
      process.exit(0);
    }
    if (fixed) {
      console.log("  Re-running checks...\n");
      const reChecks = runEnvironmentChecks();
      const reResult = printChecks(reChecks);
      if (reResult.hasErrors) {
        console.log("\x1B[31mInstallation aborted.\x1B[0m Fix the remaining issues and retry.\n");
        process.exit(1);
      }
    } else if (hasErrors) {
      console.log("\x1B[31mInstallation aborted.\x1B[0m Fix the issues and retry.\n");
      process.exit(1);
    }
  }
  const distDir = DIST_DIR;
  const cursorDir = join5(homedir4(), ".cursor");
  const dataDir = process.env.KIRO_MEMORY_DATA_DIR || process.env.CONTEXTKIT_DATA_DIR || join5(homedir4(), ".kiro-memory");
  console.log("[2/3] Installing Cursor configuration...\n");
  mkdirSync5(cursorDir, { recursive: true });
  mkdirSync5(dataDir, { recursive: true });
  const hooksPath = join5(cursorDir, "hooks.json");
  let hooksConfig = { version: 1, hooks: {} };
  if (existsSync6(hooksPath)) {
    try {
      hooksConfig = JSON.parse(readFileSync4(hooksPath, "utf8"));
      if (!hooksConfig.hooks) hooksConfig.hooks = {};
      if (!hooksConfig.version) hooksConfig.version = 1;
    } catch {
    }
  }
  const cursorHookMap = {
    "sessionStart": "hooks/agentSpawn.js",
    "beforeSubmitPrompt": "hooks/userPromptSubmit.js",
    "afterFileEdit": "hooks/postToolUse.js",
    "afterShellExecution": "hooks/postToolUse.js",
    "afterMCPExecution": "hooks/postToolUse.js",
    "stop": "hooks/stop.js"
  };
  for (const [event, script] of Object.entries(cursorHookMap)) {
    const hookEntry = {
      command: `node ${join5(distDir, script)}`
    };
    if (!hooksConfig.hooks[event]) {
      hooksConfig.hooks[event] = [hookEntry];
    } else if (Array.isArray(hooksConfig.hooks[event])) {
      hooksConfig.hooks[event] = hooksConfig.hooks[event].filter(
        (h) => !h.command?.includes("kiro-memory") && !h.command?.includes("contextkit")
      );
      hooksConfig.hooks[event].push(hookEntry);
    }
  }
  writeFileSync3(hooksPath, JSON.stringify(hooksConfig, null, 2), "utf8");
  console.log(`  \u2192 Hooks config: ${hooksPath}`);
  const mcpPath = join5(cursorDir, "mcp.json");
  let mcpConfig = {};
  if (existsSync6(mcpPath)) {
    try {
      mcpConfig = JSON.parse(readFileSync4(mcpPath, "utf8"));
    } catch {
    }
  }
  if (!mcpConfig.mcpServers) mcpConfig.mcpServers = {};
  mcpConfig.mcpServers["kiro-memory"] = {
    command: "node",
    args: [join5(distDir, "servers", "mcp-server.js")]
  };
  writeFileSync3(mcpPath, JSON.stringify(mcpConfig, null, 2), "utf8");
  console.log(`  \u2192 MCP config:   ${mcpPath}`);
  console.log(`  \u2192 Data dir:     ${dataDir}`);
  console.log("\n[3/3] Done!\n");
  printBanner({
    editor: "Cursor",
    version: PKG_VERSION,
    dashboardUrl: "http://localhost:3001",
    dataDir,
    configPaths: [
      `Hooks: ${hooksPath}`,
      `MCP:   ${mcpPath}`
    ]
  });
}
async function installWindsurf() {
  console.log("\n=== Kiro Memory - Windsurf Installation ===\n");
  console.log("[1/3] Running environment checks...");
  const checks = runEnvironmentChecks();
  const { hasErrors } = printChecks(checks);
  if (hasErrors) {
    const { fixed, needsRestart } = await tryAutoFix(checks);
    if (needsRestart) {
      console.log("  \x1B[33mRestart your terminal and re-run: kiro-memory install --windsurf\x1B[0m\n");
      process.exit(0);
    }
    if (fixed) {
      console.log("  Re-running checks...\n");
      const reChecks = runEnvironmentChecks();
      const reResult = printChecks(reChecks);
      if (reResult.hasErrors) {
        console.log("\x1B[31mInstallation aborted.\x1B[0m Fix the remaining issues and retry.\n");
        process.exit(1);
      }
    } else if (hasErrors) {
      console.log("\x1B[31mInstallation aborted.\x1B[0m Fix the issues and retry.\n");
      process.exit(1);
    }
  }
  const distDir = DIST_DIR;
  const dataDir = process.env.KIRO_MEMORY_DATA_DIR || process.env.CONTEXTKIT_DATA_DIR || join5(homedir4(), ".kiro-memory");
  console.log("[2/3] Installing Windsurf configuration...\n");
  mkdirSync5(dataDir, { recursive: true });
  const windsurfDir = join5(homedir4(), ".codeium", "windsurf");
  mkdirSync5(windsurfDir, { recursive: true });
  const mcpPath = join5(windsurfDir, "mcp_config.json");
  let mcpConfig = {};
  if (existsSync6(mcpPath)) {
    try {
      mcpConfig = JSON.parse(readFileSync4(mcpPath, "utf8"));
    } catch {
    }
  }
  if (!mcpConfig.mcpServers) mcpConfig.mcpServers = {};
  mcpConfig.mcpServers["kiro-memory"] = {
    command: "node",
    args: [join5(distDir, "servers", "mcp-server.js")]
  };
  writeFileSync3(mcpPath, JSON.stringify(mcpConfig, null, 2), "utf8");
  console.log(`  \u2192 MCP config:   ${mcpPath}`);
  console.log(`  \u2192 Data dir:     ${dataDir}`);
  console.log("\n[3/3] Done!\n");
  printBanner({
    editor: "Windsurf",
    version: PKG_VERSION,
    dashboardUrl: "http://localhost:3001",
    dataDir,
    configPaths: [
      `MCP: ${mcpPath}`
    ]
  });
  console.log("  \x1B[2mTip: Add a .windsurfrules file to your project with instructions");
  console.log("  to use the kiro-memory MCP tools for persistent context.\x1B[0m\n");
}
async function installCline() {
  console.log("\n=== Kiro Memory - Cline Installation ===\n");
  console.log("[1/3] Running environment checks...");
  const checks = runEnvironmentChecks();
  const { hasErrors } = printChecks(checks);
  if (hasErrors) {
    const { fixed, needsRestart } = await tryAutoFix(checks);
    if (needsRestart) {
      console.log("  \x1B[33mRestart your terminal and re-run: kiro-memory install --cline\x1B[0m\n");
      process.exit(0);
    }
    if (fixed) {
      console.log("  Re-running checks...\n");
      const reChecks = runEnvironmentChecks();
      const reResult = printChecks(reChecks);
      if (reResult.hasErrors) {
        console.log("\x1B[31mInstallation aborted.\x1B[0m Fix the remaining issues and retry.\n");
        process.exit(1);
      }
    } else if (hasErrors) {
      console.log("\x1B[31mInstallation aborted.\x1B[0m Fix the issues and retry.\n");
      process.exit(1);
    }
  }
  const distDir = DIST_DIR;
  const dataDir = process.env.KIRO_MEMORY_DATA_DIR || process.env.CONTEXTKIT_DATA_DIR || join5(homedir4(), ".kiro-memory");
  console.log("[2/3] Installing Cline configuration...\n");
  mkdirSync5(dataDir, { recursive: true });
  const platform2 = process.platform;
  let clineSettingsDir;
  if (platform2 === "darwin") {
    clineSettingsDir = join5(homedir4(), "Library", "Application Support", "Code", "User", "globalStorage", "saoudrizwan.claude-dev", "settings");
  } else {
    clineSettingsDir = join5(homedir4(), ".config", "Code", "User", "globalStorage", "saoudrizwan.claude-dev", "settings");
  }
  mkdirSync5(clineSettingsDir, { recursive: true });
  const mcpPath = join5(clineSettingsDir, "cline_mcp_settings.json");
  let mcpConfig = {};
  if (existsSync6(mcpPath)) {
    try {
      mcpConfig = JSON.parse(readFileSync4(mcpPath, "utf8"));
    } catch {
    }
  }
  if (!mcpConfig.mcpServers) mcpConfig.mcpServers = {};
  mcpConfig.mcpServers["kiro-memory"] = {
    command: "node",
    args: [join5(distDir, "servers", "mcp-server.js")]
  };
  writeFileSync3(mcpPath, JSON.stringify(mcpConfig, null, 2), "utf8");
  console.log(`  \u2192 MCP config:   ${mcpPath}`);
  console.log(`  \u2192 Data dir:     ${dataDir}`);
  console.log("\n[3/3] Done!\n");
  printBanner({
    editor: "Cline",
    version: PKG_VERSION,
    dashboardUrl: "http://localhost:3001",
    dataDir,
    configPaths: [
      `MCP: ${mcpPath}`
    ]
  });
  console.log("  \x1B[2mTip: Add a .clinerules file to your project with instructions");
  console.log("  to use the kiro-memory MCP tools for persistent context.\x1B[0m\n");
}
async function runDoctor() {
  console.log("\n=== Kiro Memory - Diagnostics ===");
  const checks = runEnvironmentChecks();
  const kiroDir = process.env.KIRO_CONFIG_DIR || join5(homedir4(), ".kiro");
  const agentPath = join5(kiroDir, "agents", "kiro-memory.json");
  const mcpPath = join5(kiroDir, "settings", "mcp.json");
  const dataDir = process.env.KIRO_MEMORY_DATA_DIR || process.env.CONTEXTKIT_DATA_DIR || join5(homedir4(), ".contextkit");
  checks.push({
    name: "Kiro agent config",
    ok: existsSync6(agentPath),
    message: existsSync6(agentPath) ? agentPath : "Not found",
    fix: !existsSync6(agentPath) ? "Run: kiro-memory install" : void 0
  });
  let mcpOk = false;
  if (existsSync6(mcpPath)) {
    try {
      const mcp = JSON.parse(readFileSync4(mcpPath, "utf8"));
      mcpOk = !!mcp.mcpServers?.["kiro-memory"] || !!mcp.mcpServers?.contextkit;
    } catch {
    }
  }
  checks.push({
    name: "MCP server configured",
    ok: mcpOk,
    message: mcpOk ? "kiro-memory registered in mcp.json" : "Not configured",
    fix: !mcpOk ? "Run: kiro-memory install" : void 0
  });
  checks.push({
    name: "Data directory",
    ok: existsSync6(dataDir),
    message: existsSync6(dataDir) ? dataDir : "Not created (will be created on first use)"
  });
  const claudeDir = join5(homedir4(), ".claude");
  const claudeSettingsPath = join5(claudeDir, "settings.json");
  let claudeHooksOk = false;
  if (existsSync6(claudeSettingsPath)) {
    try {
      const claudeSettings = JSON.parse(readFileSync4(claudeSettingsPath, "utf8"));
      claudeHooksOk = !!(claudeSettings?.SessionStart || claudeSettings?.PostToolUse);
      if (claudeHooksOk) {
        const allSettings = JSON.stringify(claudeSettings);
        claudeHooksOk = allSettings.includes("kiro-memory") || allSettings.includes("agentSpawn");
      }
    } catch {
    }
  }
  const claudeMcpPath = join5(homedir4(), ".mcp.json");
  let claudeMcpOk = false;
  if (existsSync6(claudeMcpPath)) {
    try {
      const claudeMcp = JSON.parse(readFileSync4(claudeMcpPath, "utf8"));
      claudeMcpOk = !!claudeMcp.mcpServers?.["kiro-memory"];
    } catch {
    }
  }
  checks.push({
    name: "Claude Code hooks",
    ok: true,
    // Non-blocking: optional installation
    message: claudeHooksOk ? "Configured in ~/.claude/settings.json" : "Not configured (optional: run kiro-memory install --claude-code)"
  });
  checks.push({
    name: "Claude Code MCP",
    ok: true,
    // Non-blocking: optional installation
    message: claudeMcpOk ? "kiro-memory registered in ~/.mcp.json" : "Not configured (optional: run kiro-memory install --claude-code)"
  });
  const cursorDir = join5(homedir4(), ".cursor");
  const cursorHooksPath = join5(cursorDir, "hooks.json");
  let cursorHooksOk = false;
  if (existsSync6(cursorHooksPath)) {
    try {
      const cursorHooks = JSON.parse(readFileSync4(cursorHooksPath, "utf8"));
      cursorHooksOk = !!(cursorHooks.hooks?.sessionStart || cursorHooks.hooks?.afterFileEdit);
      if (cursorHooksOk) {
        const allHooks = JSON.stringify(cursorHooks.hooks);
        cursorHooksOk = allHooks.includes("kiro-memory") || allHooks.includes("agentSpawn");
      }
    } catch {
    }
  }
  const cursorMcpPath = join5(cursorDir, "mcp.json");
  let cursorMcpOk = false;
  if (existsSync6(cursorMcpPath)) {
    try {
      const cursorMcp = JSON.parse(readFileSync4(cursorMcpPath, "utf8"));
      cursorMcpOk = !!cursorMcp.mcpServers?.["kiro-memory"];
    } catch {
    }
  }
  checks.push({
    name: "Cursor hooks",
    ok: true,
    // Non-blocking: optional installation
    message: cursorHooksOk ? "Configured in ~/.cursor/hooks.json" : "Not configured (optional: run kiro-memory install --cursor)"
  });
  checks.push({
    name: "Cursor MCP",
    ok: true,
    // Non-blocking: optional installation
    message: cursorMcpOk ? "kiro-memory registered in ~/.cursor/mcp.json" : "Not configured (optional: run kiro-memory install --cursor)"
  });
  const windsurfMcpPath = join5(homedir4(), ".codeium", "windsurf", "mcp_config.json");
  let windsurfMcpOk = false;
  if (existsSync6(windsurfMcpPath)) {
    try {
      const windsurfMcp = JSON.parse(readFileSync4(windsurfMcpPath, "utf8"));
      windsurfMcpOk = !!windsurfMcp.mcpServers?.["kiro-memory"];
    } catch {
    }
  }
  checks.push({
    name: "Windsurf MCP",
    ok: true,
    // Non-blocking: optional installation
    message: windsurfMcpOk ? "kiro-memory registered in ~/.codeium/windsurf/mcp_config.json" : "Not configured (optional: run kiro-memory install --windsurf)"
  });
  const clinePlatform = process.platform;
  let clineSettingsBase;
  if (clinePlatform === "darwin") {
    clineSettingsBase = join5(homedir4(), "Library", "Application Support", "Code", "User", "globalStorage", "saoudrizwan.claude-dev", "settings");
  } else {
    clineSettingsBase = join5(homedir4(), ".config", "Code", "User", "globalStorage", "saoudrizwan.claude-dev", "settings");
  }
  const clineMcpPath = join5(clineSettingsBase, "cline_mcp_settings.json");
  let clineMcpOk = false;
  if (existsSync6(clineMcpPath)) {
    try {
      const clineMcp = JSON.parse(readFileSync4(clineMcpPath, "utf8"));
      clineMcpOk = !!clineMcp.mcpServers?.["kiro-memory"];
    } catch {
    }
  }
  checks.push({
    name: "Cline MCP",
    ok: true,
    // Non-blocking: optional installation
    message: clineMcpOk ? `kiro-memory registered in cline_mcp_settings.json` : "Not configured (optional: run kiro-memory install --cline)"
  });
  let workerOk = false;
  try {
    const port = process.env.KIRO_MEMORY_WORKER_PORT || "3001";
    execSync(`curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:${port}/health`, {
      timeout: 2e3,
      encoding: "utf8"
    });
    workerOk = true;
  } catch {
  }
  checks.push({
    name: "Worker service",
    ok: true,
    // Non-blocking: starts automatically with Kiro
    message: workerOk ? "Running on port 3001" : "Not running (starts automatically with Kiro)"
  });
  const { hasErrors } = printChecks(checks);
  if (hasErrors) {
    console.log("Some checks failed. Fix the issues listed above.\n");
    process.exit(1);
  } else {
    console.log("All good! Kiro Memory is ready.\n");
  }
}
async function main() {
  if (command === "install") {
    if (args.includes("--claude-code")) {
      await installClaudeCode();
    } else if (args.includes("--cursor")) {
      await installCursor();
    } else if (args.includes("--windsurf")) {
      await installWindsurf();
    } else if (args.includes("--cline")) {
      await installCline();
    } else {
      await installKiro();
    }
    return;
  }
  if (command === "doctor") {
    if (args.includes("--fix")) {
      await runDoctorFix();
      return;
    }
    await runDoctor();
    return;
  }
  if (command === "export") {
    const sdk2 = createKiroMemory();
    try {
      await exportObservations(sdk2, args.slice(1));
    } finally {
      sdk2.close();
    }
    return;
  }
  if (command === "import") {
    await importObservations(args.slice(1));
    return;
  }
  if (command === "stats") {
    await showStats();
    return;
  }
  if (command === "config") {
    await handleConfig(args.slice(1));
    return;
  }
  if (command === "backup") {
    await handleBackup(args.slice(1));
    return;
  }
  if (command === "plugins") {
    await handlePlugins(args.slice(1));
    return;
  }
  const sdk = createKiroMemory();
  try {
    switch (command) {
      case "context":
      case "ctx":
        await showContext(sdk);
        break;
      case "search":
        if (args.includes("--interactive") || args.includes("-i")) {
          await searchInteractive(sdk, args.slice(1));
        } else {
          await searchContext(sdk, args[1]);
        }
        break;
      case "observations":
      case "obs":
        await showObservations(sdk, parseInt(args[1]) || 10);
        break;
      case "summaries":
      case "sum":
        await showSummaries(sdk, parseInt(args[1]) || 5);
        break;
      case "add-observation":
      case "add-obs":
        await addObservation(sdk, args[1], args.slice(2).join(" "));
        break;
      case "add-summary":
      case "add-sum":
        await addSummary(sdk, args.slice(1).join(" "));
        break;
      case "add-knowledge":
      case "add-k":
        await addKnowledge(sdk, args[1], args[2], args.slice(3).join(" "));
        break;
      case "decay":
        await handleDecay(sdk, args[1]);
        break;
      case "embeddings":
      case "emb":
        await handleEmbeddings(sdk, args[1]);
        break;
      case "semantic-search":
      case "sem":
        await semanticSearchCli(sdk, args[1]);
        break;
      case "resume":
        await resumeSession(sdk, args[1] ? parseInt(args[1]) : void 0);
        break;
      case "report":
        await generateReportCli(sdk, args.slice(1));
        break;
      case "help":
      case "--help":
      case "-h":
        showHelp();
        break;
      default:
        console.log("Kiro Memory CLI\n");
        showHelp();
        process.exit(1);
    }
  } finally {
    sdk.close();
  }
}
async function showContext(sdk) {
  const context = await sdk.getContext();
  console.log(`
\u{1F4C1} Project: ${context.project}
`);
  console.log("\u{1F4DD} Recent Observations:");
  context.relevantObservations.slice(0, 5).forEach((obs, i) => {
    console.log(`  ${i + 1}. ${obs.title} (${new Date(obs.created_at).toLocaleDateString()})`);
    if (obs.text) {
      console.log(`     ${obs.text.substring(0, 100)}${obs.text.length > 100 ? "..." : ""}`);
    }
  });
  console.log("\n\u{1F4CA} Recent Summaries:");
  context.relevantSummaries.slice(0, 3).forEach((sum, i) => {
    console.log(`  ${i + 1}. ${sum.request || "No request"} (${new Date(sum.created_at).toLocaleDateString()})`);
    if (sum.learned) {
      console.log(`     Learned: ${sum.learned.substring(0, 100)}${sum.learned.length > 100 ? "..." : ""}`);
    }
  });
  console.log("");
}
async function searchContext(sdk, query) {
  if (!query) {
    console.error("Error: Please provide a search query");
    process.exit(1);
  }
  const results = await sdk.search(query);
  console.log(`
\u{1F50D} Search results for: "${query}"
`);
  if (results.observations.length > 0) {
    console.log(`\u{1F4CB} Observations (${results.observations.length}):`);
    results.observations.forEach((obs, i) => {
      console.log(`  ${i + 1}. ${obs.title}`);
      if (obs.text) {
        console.log(`     ${obs.text.substring(0, 150)}${obs.text.length > 150 ? "..." : ""}`);
      }
    });
  }
  if (results.summaries.length > 0) {
    console.log(`
\u{1F4CA} Summaries (${results.summaries.length}):`);
    results.summaries.forEach((sum, i) => {
      console.log(`  ${i + 1}. ${sum.request || "No request"}`);
      if (sum.learned) {
        console.log(`     ${sum.learned.substring(0, 150)}${sum.learned.length > 150 ? "..." : ""}`);
      }
    });
  }
  if (results.observations.length === 0 && results.summaries.length === 0) {
    console.log("No results found.\n");
  } else {
    console.log("");
  }
}
async function showObservations(sdk, limit) {
  const observations = await sdk.getRecentObservations(limit);
  console.log(`
\u{1F4CB} Last ${limit} Observations:
`);
  observations.forEach((obs, i) => {
    console.log(`${i + 1}. ${obs.title} [${obs.type}]`);
    console.log(`   Date: ${new Date(obs.created_at).toLocaleString()}`);
    if (obs.text) {
      console.log(`   Content: ${obs.text.substring(0, 200)}${obs.text.length > 200 ? "..." : ""}`);
    }
    console.log("");
  });
}
async function showSummaries(sdk, limit) {
  const summaries = await sdk.getRecentSummaries(limit);
  console.log(`
\u{1F4CA} Last ${limit} Summaries:
`);
  summaries.forEach((sum, i) => {
    console.log(`${i + 1}. ${sum.request || "No request"}`);
    console.log(`   Date: ${new Date(sum.created_at).toLocaleString()}`);
    if (sum.learned) {
      console.log(`   Learned: ${sum.learned}`);
    }
    if (sum.completed) {
      console.log(`   Completed: ${sum.completed}`);
    }
    if (sum.next_steps) {
      console.log(`   Next Steps: ${sum.next_steps}`);
    }
    console.log("");
  });
}
async function addObservation(sdk, title, content) {
  if (!title || !content) {
    console.error("Error: Please provide both title and content");
    process.exit(1);
  }
  const id = await sdk.storeObservation({
    type: "manual",
    title,
    content
  });
  console.log(`\u2705 Observation stored with ID: ${id}
`);
}
async function addSummary(sdk, content) {
  if (!content) {
    console.error("Error: Please provide summary content");
    process.exit(1);
  }
  const id = await sdk.storeSummary({
    learned: content
  });
  console.log(`\u2705 Summary stored with ID: ${id}
`);
}
async function addKnowledge(sdk, knowledgeType, title, content) {
  const validTypes = ["constraint", "decision", "heuristic", "rejected"];
  if (!knowledgeType || !validTypes.includes(knowledgeType)) {
    console.error(`Error: knowledge type must be one of: ${validTypes.join(", ")}`);
    process.exit(1);
  }
  if (!title) {
    console.error("Error: title is required");
    process.exit(1);
  }
  if (!content) {
    console.error("Error: content is required");
    process.exit(1);
  }
  const severity = args.find((a) => a.startsWith("--severity="))?.split("=")[1];
  const alternativesRaw = args.find((a) => a.startsWith("--alternatives="))?.split("=")[1];
  const alternatives = alternativesRaw ? alternativesRaw.split(",").map((s) => s.trim()) : void 0;
  const reason = args.find((a) => a.startsWith("--reason="))?.split("=")[1];
  const context = args.find((a) => a.startsWith("--context="))?.split("=")[1];
  const confidence = args.find((a) => a.startsWith("--confidence="))?.split("=")[1];
  const conceptsRaw = args.find((a) => a.startsWith("--concepts="))?.split("=")[1];
  const concepts = conceptsRaw ? conceptsRaw.split(",").map((s) => s.trim()) : void 0;
  const filesRaw = args.find((a) => a.startsWith("--files="))?.split("=")[1];
  const files = filesRaw ? filesRaw.split(",").map((s) => s.trim()) : void 0;
  const cleanContent = content.split(" ").filter((w) => !w.startsWith("--")).join(" ");
  const id = await sdk.storeKnowledge({
    project: sdk.getProject(),
    knowledgeType,
    title,
    content: cleanContent || content,
    concepts,
    files,
    metadata: { severity, alternatives, reason, context, confidence }
  });
  console.log(`
Knowledge stored successfully.`);
  console.log(`  ID:   ${id}`);
  console.log(`  Type: ${knowledgeType}`);
  console.log(`  Title: ${title}
`);
}
async function handleEmbeddings(sdk, subcommand) {
  switch (subcommand) {
    case "stats": {
      const stats = sdk.getEmbeddingStats();
      console.log("\nEmbedding Statistics:\n");
      console.log(`  Total observations:  ${stats.total}`);
      console.log(`  With embeddings:     ${stats.embedded}`);
      console.log(`  Coverage:            ${stats.percentage}%`);
      await sdk.initializeEmbeddings();
      const { getEmbeddingService: getEmbeddingService2 } = await Promise.resolve().then(() => (init_EmbeddingService(), EmbeddingService_exports));
      const embService = getEmbeddingService2();
      console.log(`  Provider:            ${embService.getProvider() || "none"}`);
      console.log(`  Dimensions:          ${embService.getDimensions()}`);
      console.log(`  Available:           ${embService.isAvailable() ? "yes" : "no"}`);
      if (stats.percentage < 100 && stats.total > 0) {
        console.log(`
  Run 'kiro-memory embeddings backfill' to generate missing embeddings.`);
      }
      console.log("");
      break;
    }
    case "backfill": {
      const batchSize = parseInt(args[2]) || 50;
      console.log(`
Generating embeddings (batch size: ${batchSize})...
`);
      const available = await sdk.initializeEmbeddings();
      if (!available) {
        console.log("  No embedding provider available.");
        console.log("  Install fastembed or @huggingface/transformers:");
        console.log("    npm install fastembed");
        console.log("    npm install @huggingface/transformers\n");
        process.exit(1);
      }
      const count = await sdk.backfillEmbeddings(batchSize);
      console.log(`  Generated ${count} embeddings.
`);
      const stats = sdk.getEmbeddingStats();
      console.log(`  Coverage: ${stats.embedded}/${stats.total} (${stats.percentage}%)
`);
      break;
    }
    default:
      console.log("\nUsage: kiro-memory embeddings <subcommand>\n");
      console.log("Subcommands:");
      console.log("  stats              Show embedding statistics");
      console.log("  backfill [size]    Generate embeddings for observations without them (default: 50)\n");
  }
}
async function semanticSearchCli(sdk, query) {
  if (!query) {
    console.error("Error: Please provide a search query");
    process.exit(1);
  }
  console.log(`
Semantic search: "${query}"...
`);
  await sdk.initializeEmbeddings();
  const results = await sdk.hybridSearch(query, { limit: 10 });
  if (results.length === 0) {
    console.log("No results found.\n");
    return;
  }
  console.log(`Found ${results.length} results:
`);
  results.forEach((r, i) => {
    const scorePercent = Math.round(r.score * 100);
    console.log(`  ${i + 1}. [${r.source}] ${r.title} (score: ${scorePercent}%)`);
    if (r.content) {
      console.log(`     ${r.content.substring(0, 150)}${r.content.length > 150 ? "..." : ""}`);
    }
    console.log("");
  });
}
async function handleDecay(sdk, subcommand) {
  switch (subcommand) {
    case "stats": {
      const stats = await sdk.getDecayStats();
      console.log("\nDecay Statistics:\n");
      console.log(`  Total observations:    ${stats.total}`);
      console.log(`  Stale (file changed):  ${stats.stale}`);
      console.log(`  Never accessed:        ${stats.neverAccessed}`);
      console.log(`  Recently accessed:     ${stats.recentlyAccessed} (last 48h)`);
      if (stats.total > 0) {
        const freshPercent = Math.round((stats.total - stats.stale) / stats.total * 100);
        console.log(`  Freshness:             ${freshPercent}%`);
      }
      console.log("");
      break;
    }
    case "detect-stale": {
      console.log("\nDetecting stale observations...\n");
      const count = await sdk.detectStaleObservations();
      if (count > 0) {
        console.log(`  Found and marked ${count} stale observation(s).`);
        console.log(`  These observations reference files that have been modified since they were recorded.
`);
      } else {
        console.log("  No stale observations found. All observations are fresh.\n");
      }
      break;
    }
    case "consolidate": {
      const dryRun = args.includes("--dry-run");
      console.log(`
${dryRun ? "[DRY RUN] " : ""}Consolidating duplicate observations...
`);
      const result = await sdk.consolidateObservations({ dryRun });
      if (result.merged > 0) {
        console.log(`  Merged ${result.merged} group(s), removed ${result.removed} duplicate(s).`);
        if (dryRun) {
          console.log(`  (Dry run: no changes were made. Remove --dry-run to apply.)`);
        }
      } else {
        console.log("  No duplicate observations found to consolidate.");
      }
      console.log("");
      break;
    }
    default:
      console.log("\nUsage: kiro-memory decay <subcommand>\n");
      console.log("Subcommands:");
      console.log("  stats                Show decay statistics (stale, never accessed, etc.)");
      console.log("  detect-stale         Detect and mark stale observations (files changed)");
      console.log("  consolidate [--dry-run]  Consolidate duplicate observations\n");
  }
}
async function generateReportCli(sdk, cliArgs) {
  const periodArg = cliArgs.find((a) => a.startsWith("--period="))?.split("=")[1];
  const formatArg = cliArgs.find((a) => a.startsWith("--format="))?.split("=")[1];
  const outputArg = cliArgs.find((a) => a.startsWith("--output="))?.split("=")[1];
  const period = periodArg === "monthly" ? "monthly" : "weekly";
  const format = formatArg === "md" || formatArg === "markdown" ? "markdown" : formatArg === "json" ? "json" : "text";
  const data = await sdk.generateReport({ period });
  let output;
  switch (format) {
    case "markdown":
      output = formatReportMarkdown(data);
      break;
    case "json":
      output = formatReportJson(data);
      break;
    default:
      output = formatReportText(data);
  }
  if (outputArg) {
    writeFileSync3(outputArg, output, "utf8");
    console.log(`
  Report saved to: ${outputArg}
`);
  } else {
    console.log(output);
  }
}
async function resumeSession(sdk, sessionId) {
  const checkpoint = sessionId ? await sdk.getCheckpoint(sessionId) : await sdk.getLatestProjectCheckpoint();
  if (!checkpoint) {
    console.log("\n  No checkpoint found.");
    if (sessionId) {
      console.log(`  Session ${sessionId} has no checkpoint.`);
    } else {
      console.log(`  No recent checkpoints for project "${sdk.getProject()}".`);
    }
    console.log("  Checkpoints are created automatically at the end of each session.\n");
    return;
  }
  console.log("");
  console.log(`  \x1B[36m\u2550\u2550\u2550 Session Checkpoint \u2550\u2550\u2550\x1B[0m`);
  console.log(`  \x1B[2mProject: ${checkpoint.project} | Session: ${checkpoint.session_id}\x1B[0m`);
  console.log(`  \x1B[2m${new Date(checkpoint.created_at).toLocaleString()}\x1B[0m`);
  console.log("");
  console.log(`  \x1B[1mTask:\x1B[0m ${checkpoint.task}`);
  if (checkpoint.progress) {
    console.log(`  \x1B[1mProgress:\x1B[0m ${checkpoint.progress}`);
  }
  if (checkpoint.next_steps) {
    console.log(`  \x1B[1mNext Steps:\x1B[0m ${checkpoint.next_steps}`);
  }
  if (checkpoint.open_questions) {
    console.log(`  \x1B[1mOpen Questions:\x1B[0m ${checkpoint.open_questions}`);
  }
  if (checkpoint.relevant_files) {
    console.log(`  \x1B[1mRelevant Files:\x1B[0m`);
    const files = checkpoint.relevant_files.split(",").map((f) => f.trim());
    files.forEach((f) => {
      console.log(`    - ${f}`);
    });
  }
  console.log("");
}
async function searchInteractive(sdk, cliArgs) {
  const projectArg = cliArgs.find((a, i) => cliArgs[i - 1] === "--project") || cliArgs.find((a) => a.startsWith("--project="))?.split("=").slice(1).join("=");
  const isInteractive = cliArgs.includes("--interactive") || cliArgs.includes("-i");
  if (!isInteractive || !process.stdin.isTTY) {
    const queryArg = cliArgs.find((a) => !a.startsWith("-") && a !== "search");
    if (!queryArg) {
      console.error("Errore: fornisci un termine di ricerca o usa --interactive con un TTY");
      process.exit(1);
    }
    const results = projectArg ? await sdk.searchAdvanced(queryArg, { project: projectArg }) : await sdk.search(queryArg);
    const obs = results.observations.slice(0, 20);
    if (obs.length === 0) {
      console.log("\nNessun risultato trovato.\n");
      return;
    }
    console.log(`
Risultati per: "${queryArg}"
`);
    obs.forEach((o, i) => {
      const date = new Date(o.created_at).toLocaleDateString("it-IT");
      console.log(`  ${i + 1}. [${o.type}] ${o.title} \u2014 ${o.project} (${date})`);
    });
    console.log("");
    return;
  }
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const prompt = (question) => new Promise((resolve) => rl.question(question, (answer) => resolve(answer.trim())));
  const useColor = process.stdout.isTTY && !process.env.NO_COLOR;
  const cyan = (s) => useColor ? `\x1B[36m${s}\x1B[0m` : s;
  const bold = (s) => useColor ? `\x1B[1m${s}\x1B[0m` : s;
  const dim = (s) => useColor ? `\x1B[2m${s}\x1B[0m` : s;
  console.log(`
${cyan("=== Kiro Memory \u2014 Ricerca Interattiva ===")}`);
  if (projectArg) console.log(dim(`  Filtro progetto: ${projectArg}`));
  console.log(dim('  Premi Ctrl+C o digita "exit" per uscire.\n'));
  while (true) {
    let query;
    try {
      query = await prompt(cyan("> "));
    } catch {
      break;
    }
    if (!query || query.toLowerCase() === "exit" || query.toLowerCase() === "quit") break;
    const results = projectArg ? await sdk.searchAdvanced(query, { project: projectArg }) : await sdk.search(query);
    const obs = results.observations.slice(0, 20);
    if (obs.length === 0) {
      console.log(dim("\n  Nessun risultato trovato.\n"));
      continue;
    }
    console.log(`
  ${bold(`${obs.length} risultato/i:`)}
`);
    obs.forEach((o, i) => {
      const date = new Date(o.created_at).toLocaleDateString("it-IT");
      console.log(`    ${bold(`${i + 1}.`)} [${o.type}] ${o.title}`);
      console.log(dim(`       ${o.project} \u2014 ${date}`));
    });
    console.log("");
    const selRaw = await prompt(`  Numero per dettagli (Invio per saltare): `);
    const selIdx = parseInt(selRaw) - 1;
    if (!isNaN(selIdx) && selIdx >= 0 && selIdx < obs.length) {
      const o = obs[selIdx];
      console.log("");
      console.log(`  ${bold("Titolo:")}     ${o.title}`);
      console.log(`  ${bold("Tipo:")}       ${o.type}`);
      console.log(`  ${bold("Progetto:")}   ${o.project}`);
      console.log(`  ${bold("Data:")}       ${new Date(o.created_at).toLocaleString("it-IT")}`);
      if (o.text) {
        console.log(`  ${bold("Contenuto:")}`);
        console.log(`    ${o.text.substring(0, 500)}${o.text.length > 500 ? "..." : ""}`);
      }
      if (o.narrative) {
        console.log(`  ${bold("Narrativa:")}`);
        console.log(`    ${o.narrative.substring(0, 300)}${o.narrative.length > 300 ? "..." : ""}`);
      }
      console.log("");
    }
  }
  rl.close();
  console.log("\n  Uscita dalla modalit\xE0 interattiva.\n");
}
async function exportObservations(sdk, cliArgs) {
  const formatArg = cliArgs.find((a) => a.startsWith("--format="))?.split("=").slice(1).join("=") || cliArgs.find((a, i) => cliArgs[i - 1] === "--format");
  const projectArg = cliArgs.find((a) => a.startsWith("--project="))?.split("=").slice(1).join("=") || cliArgs.find((a, i) => cliArgs[i - 1] === "--project");
  const outputArg = cliArgs.find((a) => a.startsWith("-o="))?.split("=").slice(1).join("=") || cliArgs.find((a) => a.startsWith("--output="))?.split("=").slice(1).join("=") || cliArgs.find((a, i) => (cliArgs[i - 1] === "--output" || cliArgs[i - 1] === "-o") && !a.startsWith("-"));
  const fromArg = cliArgs.find((a) => a.startsWith("--from="))?.split("=").slice(1).join("=") || cliArgs.find((a, i) => cliArgs[i - 1] === "--from" && !a.startsWith("-"));
  const toArg = cliArgs.find((a) => a.startsWith("--to="))?.split("=").slice(1).join("=") || cliArgs.find((a, i) => cliArgs[i - 1] === "--to" && !a.startsWith("-"));
  const typeArg = cliArgs.find((a) => a.startsWith("--type="))?.split("=").slice(1).join("=") || cliArgs.find((a, i) => cliArgs[i - 1] === "--type" && !a.startsWith("-"));
  const validFormats = ["jsonl", "json", "md"];
  const format = validFormats.includes(formatArg) ? formatArg : "jsonl";
  if (format === "json" || format === "md") {
    if (!projectArg) {
      console.error("Errore: --project <nome> \xE8 obbligatorio per il formato json/md");
      process.exit(1);
    }
    const kmDb2 = new KiroMemoryDatabase();
    let observations;
    try {
      observations = getObservationsByProject(kmDb2.db, projectArg, 1e4);
    } finally {
      kmDb2.close();
    }
    if (observations.length === 0) {
      console.error(`Nessuna observation trovata per il progetto "${projectArg}"`);
      process.exit(1);
    }
    const output = generateExportOutput(observations, format);
    if (outputArg) {
      writeFileSync3(outputArg, output, "utf8");
      console.error(`
  Esportate ${observations.length} observations in: ${outputArg}
`);
    } else {
      process.stdout.write(output + "\n");
    }
    return;
  }
  const { generateMetaRecord: generateMetaRecord2, exportObservationsStreaming: exportObservationsStreaming2, exportSummariesStreaming: exportSummariesStreaming2, exportPromptsStreaming: exportPromptsStreaming2 } = await Promise.resolve().then(() => (init_ImportExport(), ImportExport_exports));
  const filters = {};
  if (projectArg) filters.project = projectArg;
  if (typeArg) filters.type = typeArg;
  if (fromArg) filters.from = fromArg;
  if (toArg) filters.to = toArg;
  const kmDb = new KiroMemoryDatabase();
  try {
    if (outputArg) {
      const { createWriteStream } = await import("fs");
      const stream = createWriteStream(outputArg, { encoding: "utf8" });
      let obsCount = 0;
      let sumCount = 0;
      let promptCount = 0;
      stream.write(generateMetaRecord2(kmDb.db, filters) + "\n");
      obsCount = exportObservationsStreaming2(kmDb.db, filters, (line) => {
        stream.write(line + "\n");
      });
      sumCount = exportSummariesStreaming2(kmDb.db, filters, (line) => {
        stream.write(line + "\n");
      });
      promptCount = exportPromptsStreaming2(kmDb.db, filters, (line) => {
        stream.write(line + "\n");
      });
      await new Promise((resolve, reject) => {
        stream.end((err) => err ? reject(err) : resolve());
      });
      console.error(`
  Export JSONL completato:`);
      console.error(`    Observations: ${obsCount}`);
      console.error(`    Summaries:    ${sumCount}`);
      console.error(`    Prompts:      ${promptCount}`);
      console.error(`    File:         ${outputArg}
`);
    } else {
      process.stdout.write(generateMetaRecord2(kmDb.db, filters) + "\n");
      exportObservationsStreaming2(kmDb.db, filters, (line) => process.stdout.write(line + "\n"));
      exportSummariesStreaming2(kmDb.db, filters, (line) => process.stdout.write(line + "\n"));
      exportPromptsStreaming2(kmDb.db, filters, (line) => process.stdout.write(line + "\n"));
    }
  } finally {
    kmDb.close();
  }
}
async function importObservations(cliArgs) {
  const filePath = cliArgs.find((a) => !a.startsWith("-"));
  const dryRun = cliArgs.includes("--dry-run");
  if (!filePath) {
    console.error("Errore: specifica il percorso del file JSONL\n  kiro-memory import <file.jsonl> [--dry-run]");
    process.exit(1);
  }
  if (!existsSync6(filePath)) {
    console.error(`Errore: file non trovato: ${filePath}`);
    process.exit(1);
  }
  let content;
  try {
    content = readFileSync4(filePath, "utf8");
  } catch (err) {
    console.error(`Errore lettura file: ${err.message}`);
    process.exit(1);
  }
  if (dryRun) {
    console.log(`
  [DRY RUN] Analisi di "${filePath}"...
`);
  } else {
    console.log(`
  Importazione di "${filePath}"...
`);
  }
  const { importJsonl: importJsonl2 } = await Promise.resolve().then(() => (init_ImportExport(), ImportExport_exports));
  const { formatImportResult: formatImportResult2 } = await Promise.resolve().then(() => (init_cli_utils(), cli_utils_exports));
  const kmDb = new KiroMemoryDatabase();
  let result;
  try {
    result = importJsonl2(kmDb.db, content, dryRun);
  } finally {
    kmDb.close();
  }
  const output = formatImportResult2({
    imported: result.imported,
    skipped: result.skipped,
    errors: result.errors,
    total: result.total,
    dryRun,
    errorDetails: result.errorDetails
  });
  console.log(output);
  if (result.imported === 0 && result.errors > 0 && result.skipped === 0) {
    process.exit(1);
  }
}
async function runDoctorFix() {
  console.log("\n=== Kiro Memory \u2014 Riparazione Database ===\n");
  const kmDb = new KiroMemoryDatabase();
  const db = kmDb.db;
  const messages = [];
  try {
    process.stdout.write("  [1/3] Ricostruzione indice FTS5... ");
    const ftsOk = rebuildFtsIndex(db);
    if (ftsOk) {
      console.log("\x1B[32m\u2713\x1B[0m");
      messages.push("Indice FTS5 ricostruito");
    } else {
      console.log("\x1B[33m~\x1B[0m (FTS non disponibile o gia' integro)");
    }
    process.stdout.write("  [2/3] Rimozione embeddings orfani... ");
    const removed = removeOrphanedEmbeddings(db);
    console.log(`\x1B[32m\u2713\x1B[0m (${removed} rimossi)`);
    if (removed > 0) messages.push(`${removed} embedding/s orfani rimossi`);
    process.stdout.write("  [3/3] VACUUM database...             ");
    const vacuumOk = vacuumDatabase(db);
    if (vacuumOk) {
      console.log("\x1B[32m\u2713\x1B[0m");
      messages.push("VACUUM completato");
    } else {
      console.log("\x1B[31m\u2717\x1B[0m");
    }
  } finally {
    kmDb.close();
  }
  if (messages.length > 0) {
    console.log("\n  Operazioni completate:");
    for (const msg of messages) {
      console.log(`    \x1B[32m\u2713\x1B[0m ${msg}`);
    }
  }
  console.log("");
}
async function showStats() {
  const kmDb = new KiroMemoryDatabase();
  const db = kmDb.db;
  try {
    const obsRow = db.query(
      "SELECT COUNT(*) as total FROM observations"
    ).get();
    const sessRow = db.query(
      "SELECT COUNT(*) as total FROM sessions"
    ).get();
    const projRow = db.query(
      "SELECT COUNT(DISTINCT project) as cnt FROM observations"
    ).get();
    const topProject = db.query(
      `SELECT project, COUNT(*) as cnt
       FROM observations
       GROUP BY project
       ORDER BY cnt DESC
       LIMIT 1`
    ).get();
    let embCoverage = 0;
    try {
      const embStats = db.query(
        `SELECT
           (SELECT COUNT(*) FROM observations) as total,
           COUNT(DISTINCT observation_id) as embedded
         FROM observation_embeddings`
      ).get();
      if (embStats && embStats.total > 0) {
        embCoverage = Math.round(embStats.embedded / embStats.total * 100);
      }
    } catch {
    }
    const dbSize = getDbFileSize(DB_PATH);
    const stats = {
      totalObservations: obsRow?.total || 0,
      totalSessions: sessRow?.total || 0,
      totalProjects: projRow?.cnt || 0,
      dbSizeBytes: dbSize,
      mostActiveProject: topProject?.project || null,
      embeddingCoverage: embCoverage
    };
    console.log(formatStatsOutput(stats));
  } finally {
    kmDb.close();
  }
}
async function handleConfig(subArgs) {
  const subcommand = subArgs[0];
  const configPath = getConfigPath();
  switch (subcommand) {
    case "list": {
      const config = listConfig(configPath);
      console.log("\n=== Configurazione Kiro Memory ===\n");
      console.log(`  File: ${configPath}
`);
      for (const [key, value] of Object.entries(config)) {
        const displayValue = value === null ? "(non impostato)" : String(value);
        console.log(`  ${key.padEnd(35)} ${displayValue}`);
      }
      console.log("");
      break;
    }
    case "get": {
      const key = subArgs[1];
      if (!key) {
        console.error("Errore: specifica una chiave\n  kiro-memory config get <chiave>");
        process.exit(1);
      }
      const val = getConfigValue(key, configPath);
      if (val === null) {
        console.log(`
  "${key}" non impostato (nessun valore di default)
`);
      } else {
        console.log(`
  ${key} = ${val}
`);
      }
      break;
    }
    case "set": {
      const key = subArgs[1];
      const rawValue = subArgs[2];
      if (!key) {
        console.error("Errore: specifica chiave e valore\n  kiro-memory config set <chiave> <valore>");
        process.exit(1);
      }
      if (rawValue === void 0) {
        console.error(`Errore: valore mancante per "${key}"
  kiro-memory config set ${key} <valore>`);
        process.exit(1);
      }
      const saved = setConfigValue(key, rawValue, configPath);
      console.log(`
  Impostato: ${key} = ${saved}
`);
      break;
    }
    default:
      console.log("\nUtilizzo: kiro-memory config <subcommand>\n");
      console.log("Subcommands:");
      console.log("  list                         Mostra tutte le impostazioni");
      console.log("  get <chiave>                 Legge un valore");
      console.log("  set <chiave> <valore>        Imposta un valore\n");
      console.log("Esempio:");
      console.log("  kiro-memory config list");
      console.log("  kiro-memory config get worker.port");
      console.log("  kiro-memory config set log.level DEBUG\n");
  }
}
async function handleBackup(subArgs) {
  const subCommand = subArgs[0];
  if (!subCommand || subCommand === "help") {
    console.log(`
Uso: kiro-memory backup <sottocomando>

Sottocomandi:
  create              Crea un backup manuale del database
  list                Elenca i backup disponibili con metadata
  restore <file>      Ripristina il database da un file backup
`);
    return;
  }
  if (subCommand === "create") {
    const maxKeep = Number(getConfigValue("backup.maxKeep")) || 7;
    const db = new KiroMemoryDatabase(DB_PATH, true);
    try {
      const entry = createBackup(DB_PATH, BACKUPS_DIR, db.db);
      const deleted = rotateBackups(BACKUPS_DIR, maxKeep);
      console.log(`
=== Kiro Memory \u2014 Backup Creato ===
`);
      console.log(`  File:        ${entry.metadata.filename}`);
      console.log(`  Timestamp:   ${entry.metadata.timestamp}`);
      console.log(`  Schema v.:   ${entry.metadata.schemaVersion}`);
      console.log(`  Obs.:        ${entry.metadata.stats.observations}`);
      console.log(`  Sessioni:    ${entry.metadata.stats.sessions}`);
      console.log(`  Dimensione:  ${(entry.metadata.stats.dbSizeBytes / 1024).toFixed(1)} KB`);
      if (deleted > 0) {
        console.log(`  Rotazione:   ${deleted} backup rimossi (max ${maxKeep} mantenuti)`);
      }
      console.log(`
  Directory:  ${BACKUPS_DIR}
`);
    } finally {
      db.close();
    }
    return;
  }
  if (subCommand === "list") {
    const entries = listBackups(BACKUPS_DIR);
    if (entries.length === 0) {
      console.log("\n  Nessun backup trovato in: " + BACKUPS_DIR + "\n");
      return;
    }
    console.log(`
=== Kiro Memory \u2014 Backup Disponibili ===
`);
    console.log(`  Directory: ${BACKUPS_DIR}
`);
    for (let i = 0; i < entries.length; i++) {
      const e = entries[i];
      const size = (e.metadata.stats.dbSizeBytes / 1024).toFixed(1);
      const date = new Date(e.metadata.timestampEpoch).toLocaleString("it-IT");
      console.log(`  ${i + 1}. ${e.metadata.filename}`);
      console.log(`     Data:      ${date}`);
      console.log(`     Schema:    v${e.metadata.schemaVersion}`);
      console.log(`     Obs.:      ${e.metadata.stats.observations} | Sessioni: ${e.metadata.stats.sessions}`);
      console.log(`     Dimensione: ${size} KB`);
      console.log("");
    }
    return;
  }
  if (subCommand === "restore") {
    const file = subArgs[1];
    if (!file) {
      console.error("\n  Errore: specifica il nome del file backup da ripristinare.");
      console.error("  Esempio: kiro-memory backup restore backup-2026-02-27-150000.db\n");
      process.exit(1);
    }
    const backupPattern = /^backup-\d{4}-\d{2}-\d{2}-\d{6}(-\d{3})?\.db$/;
    if (file.includes("/") || file.includes("..") || !backupPattern.test(file)) {
      console.error(`
  Errore: nome file non valido: ${file}`);
      console.error('  Il file deve essere nel formato "backup-YYYY-MM-DD-HHmmss[-mmm].db"\n');
      process.exit(1);
    }
    const entries = listBackups(BACKUPS_DIR);
    const found = entries.find((e) => e.metadata.filename === file);
    if (!found) {
      console.error(`
  Errore: backup non trovato: ${file}`);
      console.error(`  Usa "kiro-memory backup list" per vedere i backup disponibili.
`);
      process.exit(1);
    }
    const date = new Date(found.metadata.timestampEpoch).toLocaleString("it-IT");
    console.log(`
  ATTENZIONE: questa operazione sovrascrive il database corrente!`);
    console.log(`  Backup da ripristinare: ${file}`);
    console.log(`  Data backup:            ${date}`);
    console.log(`  Obs. nel backup:        ${found.metadata.stats.observations}`);
    console.log("");
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const confirmed = await new Promise((resolve) => {
      rl.question('  Confermi il ripristino? (digita "si" per confermare): ', (answer) => {
        rl.close();
        resolve(answer.trim().toLowerCase() === "si");
      });
    });
    if (!confirmed) {
      console.log("\n  Ripristino annullato.\n");
      return;
    }
    restoreBackup(found.filePath, DB_PATH);
    console.log(`
  Database ripristinato da: ${file}`);
    console.log("  Riavvia il worker per applicare le modifiche.\n");
    return;
  }
  console.error(`
  Sottocomando backup non riconosciuto: ${subCommand}`);
  console.error("  Usa: create | list | restore\n");
  process.exit(1);
}
async function handlePlugins(subArgs) {
  const subCommand = subArgs[0];
  const port = process.env.KIRO_MEMORY_WORKER_PORT || process.env.CONTEXTKIT_WORKER_PORT || "3001";
  const baseUrl = `http://127.0.0.1:${port}`;
  async function apiGet(path) {
    return new Promise((resolve, reject) => {
      const req = http.get(`${baseUrl}${path}`, (res) => {
        let body = "";
        res.on("data", (chunk) => {
          body += chunk;
        });
        res.on("end", () => {
          try {
            resolve({ status: res.statusCode, data: JSON.parse(body) });
          } catch {
            reject(new Error(`Risposta non JSON: ${body}`));
          }
        });
      });
      req.on("error", reject);
      req.setTimeout(5e3, () => {
        req.destroy(new Error("Timeout"));
      });
    });
  }
  async function apiPost(path) {
    return new Promise((resolve, reject) => {
      const options = {
        hostname: "127.0.0.1",
        port: parseInt(port, 10),
        path,
        method: "POST",
        headers: { "Content-Type": "application/json", "Content-Length": 0 }
      };
      const req = http.request(options, (res) => {
        let body = "";
        res.on("data", (chunk) => {
          body += chunk;
        });
        res.on("end", () => {
          try {
            resolve({ status: res.statusCode, data: JSON.parse(body) });
          } catch {
            reject(new Error(`Risposta non JSON: ${body}`));
          }
        });
      });
      req.on("error", reject);
      req.setTimeout(1e4, () => {
        req.destroy(new Error("Timeout"));
      });
      req.end();
    });
  }
  if (!subCommand || subCommand === "list") {
    try {
      const result = await apiGet("/api/plugins");
      const { plugins } = result.data;
      console.log("\n=== Kiro Memory \u2014 Plugin ===\n");
      if (!plugins || plugins.length === 0) {
        console.log("  Nessun plugin registrato.\n");
        return;
      }
      for (const p of plugins) {
        const stateColor = p.state === "active" ? "\x1B[32m" : p.state === "error" ? "\x1B[31m" : "\x1B[33m";
        console.log(`  ${p.name}@${p.version}`);
        console.log(`    Stato:    ${stateColor}${p.state}\x1B[0m`);
        if (p.description) console.log(`    Desc.:    ${p.description}`);
        if (p.error) console.log(`    Errore:   \x1B[31m${p.error}\x1B[0m`);
        console.log("");
      }
    } catch {
      console.error("\n  Errore: impossibile contattare il worker. Avvialo con: kiro-memory worker start\n");
      process.exit(1);
    }
    return;
  }
  if (subCommand === "enable") {
    const name = subArgs[1];
    if (!name) {
      console.error("\n  Errore: specifica il nome del plugin.\n  Esempio: kiro-memory plugins enable mio-plugin\n");
      process.exit(1);
    }
    try {
      const result = await apiPost(`/api/plugins/${encodeURIComponent(name)}/enable`);
      if (result.status === 200) {
        console.log(`
  Plugin "${name}" abilitato con successo.`);
        if (result.data.plugin?.state === "error") {
          console.log(`  Attenzione: stato corrente = error: ${result.data.plugin.error}`);
        }
        console.log("");
      } else {
        console.error(`
  Errore: ${result.data.error}
`);
        process.exit(1);
      }
    } catch {
      console.error("\n  Errore: impossibile contattare il worker.\n");
      process.exit(1);
    }
    return;
  }
  if (subCommand === "disable") {
    const name = subArgs[1];
    if (!name) {
      console.error("\n  Errore: specifica il nome del plugin.\n  Esempio: kiro-memory plugins disable mio-plugin\n");
      process.exit(1);
    }
    try {
      const result = await apiPost(`/api/plugins/${encodeURIComponent(name)}/disable`);
      if (result.status === 200) {
        console.log(`
  Plugin "${name}" disabilitato.
`);
      } else {
        console.error(`
  Errore: ${result.data.error}
`);
        process.exit(1);
      }
    } catch {
      console.error("\n  Errore: impossibile contattare il worker.\n");
      process.exit(1);
    }
    return;
  }
  console.error(`
  Sottocomando plugins non riconosciuto: ${subCommand}`);
  console.error("  Usa: list | enable <nome> | disable <nome>\n");
  process.exit(1);
}
function showHelp() {
  console.log(`Usage: kiro-memory <command> [options]

Setup:
  install                   Install for Kiro CLI (default)
  install --claude-code     Install hooks and MCP server for Claude Code
  install --cursor          Install hooks and MCP server for Cursor IDE
  install --windsurf        Install MCP server for Windsurf IDE
  install --cline           Install MCP server for Cline (VS Code)
  doctor                    Run environment diagnostics (checks Node, build tools, WSL, etc.)
  doctor --fix              Auto-repair: rebuild FTS5, remove orphaned embeddings, VACUUM

Commands:
  context, ctx              Show current project context
  resume [session-id]       Resume previous session (shows checkpoint)
  report [options]          Generate activity report
    --period=weekly|monthly   Time period (default: weekly)
    --format=text|md|json     Output format (default: text)
    --output=<file>           Write to file instead of stdout
  stats                     Quick database overview (totals, size, active project, embeddings)
  search <query>            Search across all context (keyword FTS5)
  search --interactive      Interactive REPL search with result selection
    --project <name>          Filter results by project
  semantic-search <query>   Hybrid search: vector + keyword (semantic)
  export --project <name>   Export observations to JSONL/JSON/Markdown
    --format=jsonl|json|md    Output format (default: jsonl)
    --output=<file>           Write to file instead of stdout
  import <file>             Import observations from JSONL file (deduplication by content_hash)
  config list               Show all configuration settings
  config get <key>          Show a single configuration value
  config set <key> <value>  Set a configuration value
  observations [limit]      Show recent observations (default: 10)
  summaries [limit]         Show recent summaries (default: 5)
  add-observation <title> <content>   Add a new observation
  add-summary <content>     Add a new summary
  add-knowledge <type> <title> <content>  Store structured knowledge
    Types: constraint, decision, heuristic, rejected
    Options: --severity=hard|soft  --alternatives=a,b,c  --reason=...
             --context=...  --confidence=high|medium|low
             --concepts=a,b  --files=path1,path2
  embeddings stats          Show embedding statistics
  embeddings backfill [n]   Generate embeddings for unprocessed observations
  decay stats               Show decay statistics (stale, never accessed, etc.)
  decay detect-stale        Detect and mark stale observations
  decay consolidate [--dry-run]  Consolidate duplicate observations
  backup create             Crea un backup manuale del database
  backup list               Elenca tutti i backup disponibili con metadata
  backup restore <file>     Ripristina il database da un backup (con conferma)
  plugins list              Elenca tutti i plugin registrati con stato
  plugins enable <nome>     Abilita un plugin registrato
  plugins disable <nome>    Disabilita un plugin attivo
  help                      Show this help message

Examples:
  kiro-memory install
  kiro-memory doctor
  kiro-memory doctor --fix
  kiro-memory stats
  kiro-memory context
  kiro-memory resume
  kiro-memory resume 42
  kiro-memory report
  kiro-memory report --period=monthly --format=md --output=report.md
  kiro-memory search "authentication"
  kiro-memory search --interactive --project myapp
  kiro-memory semantic-search "how did I fix the auth bug"
  kiro-memory export --project myapp --format jsonl --output backup.jsonl
  kiro-memory export --project myapp --format md > notes.md
  kiro-memory import backup.jsonl
  kiro-memory backup create
  kiro-memory backup list
  kiro-memory backup restore backup-2026-02-27-150000.db
  kiro-memory config list
  kiro-memory config get worker.port
  kiro-memory config set log.level DEBUG
  kiro-memory add-knowledge constraint "No any in TypeScript" "Never use any type" --severity=hard
  kiro-memory add-knowledge decision "PostgreSQL over MongoDB" "Chosen for ACID" --alternatives=MongoDB,DynamoDB
  kiro-memory embeddings stats
  kiro-memory embeddings backfill 100
  kiro-memory decay stats
  kiro-memory decay detect-stale
  kiro-memory decay consolidate --dry-run
  kiro-memory observations 20
`);
}
main().catch(console.error);
