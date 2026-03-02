import { createRequire } from 'module';const require = createRequire(import.meta.url);

// src/services/sqlite/Backup.ts
import {
  existsSync as existsSync2,
  mkdirSync as mkdirSync2,
  copyFileSync,
  readdirSync,
  statSync,
  unlinkSync,
  readFileSync as readFileSync2,
  writeFileSync
} from "fs";
import { join as join2, basename } from "path";

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

// src/services/sqlite/Backup.ts
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
  const dbSizeBytes = existsSync2(dbPath) ? statSync(dbPath).size : 0;
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
  mkdirSync2(backupDir, { recursive: true });
  const now = /* @__PURE__ */ new Date();
  const ts = formatTimestamp(now);
  const filename = `backup-${ts}.db`;
  const destPath = join2(backupDir, filename);
  const metaFilename = `backup-${ts}.meta.json`;
  const metaPath = join2(backupDir, metaFilename);
  if (!existsSync2(dbPath)) {
    throw new Error(`Database non trovato: ${dbPath}`);
  }
  copyFileSync(dbPath, destPath);
  logger.info("BACKUP", `File DB copiato: ${dbPath} \u2192 ${destPath}`);
  const walPath = `${dbPath}-wal`;
  const shmPath = `${dbPath}-shm`;
  if (existsSync2(walPath)) {
    copyFileSync(walPath, `${destPath}-wal`);
    logger.debug("BACKUP", "File WAL copiato");
  }
  if (existsSync2(shmPath)) {
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
  if (!existsSync2(backupDir)) {
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
    const metaPath = join2(backupDir, metaFile);
    const dbFilename = metaFile.replace(/\.meta\.json$/, ".db");
    const filePath = join2(backupDir, dbFilename);
    let metadata;
    try {
      const raw = readFileSync2(metaPath, "utf8");
      metadata = JSON.parse(raw);
    } catch (err) {
      logger.warn("BACKUP", `Metadata non leggibile: ${metaPath}`, {}, err);
      continue;
    }
    if (!existsSync2(filePath)) {
      logger.warn("BACKUP", `File backup mancante per metadata: ${filePath}`);
      continue;
    }
    entries.push({ filePath, metaPath, metadata });
  }
  entries.sort((a, b) => b.metadata.timestampEpoch - a.metadata.timestampEpoch);
  return entries;
}
function restoreBackup(backupFile, dbPath) {
  if (!existsSync2(backupFile)) {
    throw new Error(`File backup non trovato: ${backupFile}`);
  }
  copyFileSync(backupFile, dbPath);
  logger.info("BACKUP", `Database ripristinato: ${backupFile} \u2192 ${dbPath}`);
  const walBackup = `${backupFile}-wal`;
  const shmBackup = `${backupFile}-shm`;
  const walDest = `${dbPath}-wal`;
  const shmDest = `${dbPath}-shm`;
  if (existsSync2(walBackup)) {
    copyFileSync(walBackup, walDest);
    logger.debug("BACKUP", "File WAL ripristinato");
  } else if (existsSync2(walDest)) {
    unlinkSync(walDest);
    logger.debug("BACKUP", "File WAL corrente rimosso (non presente nel backup)");
  }
  if (existsSync2(shmBackup)) {
    copyFileSync(shmBackup, shmDest);
    logger.debug("BACKUP", "File SHM ripristinato");
  } else if (existsSync2(shmDest)) {
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
      if (existsSync2(entry.filePath)) {
        unlinkSync(entry.filePath);
      }
    } catch (err) {
      logger.warn("BACKUP", `Impossibile eliminare: ${entry.filePath}`, {}, err);
    }
    for (const extra of [`${entry.filePath}-wal`, `${entry.filePath}-shm`]) {
      try {
        if (existsSync2(extra)) unlinkSync(extra);
      } catch {
      }
    }
    try {
      if (existsSync2(entry.metaPath)) {
        unlinkSync(entry.metaPath);
      }
    } catch (err) {
      logger.warn("BACKUP", `Impossibile eliminare metadata: ${entry.metaPath}`, {}, err);
    }
    logger.info("BACKUP", `Backup rimosso (rotazione): ${basename(entry.filePath)}`);
    deleted++;
  }
  logger.info("BACKUP", `Rotazione completata: ${deleted} backup eliminati, ${maxKeep} mantenuti`);
  return deleted;
}
export {
  createBackup,
  listBackups,
  restoreBackup,
  rotateBackups
};
