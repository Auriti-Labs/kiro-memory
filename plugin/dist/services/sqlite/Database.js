import { createRequire } from 'module';const require = createRequire(import.meta.url);

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
import { join as join2, dirname, basename } from "path";
import { homedir as homedir2 } from "os";
import { existsSync as existsSync2, mkdirSync as mkdirSync2 } from "fs";
import { fileURLToPath } from "url";

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

// src/shared/paths.ts
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
      ensureDir(DATA_DIR);
    }
    this.db = new Database(dbPath, { create: true, readwrite: true });
    this.db.run("PRAGMA journal_mode = WAL");
    this.db.run("PRAGMA busy_timeout = 5000");
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
export {
  Database,
  KiroMemoryDatabase
};
