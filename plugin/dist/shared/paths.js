import { createRequire } from 'module';const require = createRequire(import.meta.url);

// src/shared/paths.ts
import { join, dirname, basename } from "path";
import { homedir } from "os";
import { existsSync, mkdirSync, statSync } from "fs";
import { execSync } from "child_process";
import { fileURLToPath } from "url";
function getDirname() {
  if (typeof __dirname !== "undefined") {
    return __dirname;
  }
  return dirname(fileURLToPath(import.meta.url));
}
var _dirname = getDirname();
var _legacyV1Dir = join(homedir(), ".contextkit");
var _canonicalDir = join(homedir(), ".totalrecall");
function getFileSize(path) {
  try {
    return existsSync(path) ? statSync(path).size : -1;
  } catch {
    return -1;
  }
}
function resolveDataDir() {
  const canonicalDb = join(_canonicalDir, "totalrecall.db");
  const legacyCanonicalNamedDb = join(_legacyV1Dir, "totalrecall.db");
  const legacyDb = join(_legacyV1Dir, "contextkit.db");
  const canonicalSize = getFileSize(canonicalDb);
  const legacySize = Math.max(getFileSize(legacyCanonicalNamedDb), getFileSize(legacyDb));
  if (canonicalSize > 0 && legacySize > 0) {
    return legacySize > canonicalSize ? _legacyV1Dir : _canonicalDir;
  }
  if (legacySize > 0) return _legacyV1Dir;
  if (canonicalSize > 0) return _canonicalDir;
  if (existsSync(_canonicalDir)) return _canonicalDir;
  if (existsSync(_legacyV1Dir)) return _legacyV1Dir;
  return _canonicalDir;
}
var DATA_DIR = process.env.TOTALRECALL_DATA_DIR || process.env.CONTEXTKIT_DATA_DIR || resolveDataDir();
var LEGACY_DATA_DIR = _legacyV1Dir;
var CANONICAL_DATA_DIR = _canonicalDir;
var KIRO_CONFIG_DIR = process.env.KIRO_CONFIG_DIR || join(homedir(), ".kiro");
var PLUGIN_ROOT = join(KIRO_CONFIG_DIR, "plugins", "totalrecall");
var ARCHIVES_DIR = join(DATA_DIR, "archives");
var LOGS_DIR = join(DATA_DIR, "logs");
var TRASH_DIR = join(DATA_DIR, "trash");
var BACKUPS_DIR = join(DATA_DIR, "backups");
var MODES_DIR = join(DATA_DIR, "modes");
var USER_SETTINGS_PATH = join(DATA_DIR, "settings.json");
var _legacyDbV1 = join(DATA_DIR, "contextkit.db");
var _legacyDbV3 = join(DATA_DIR, "totalrecall.db");
function resolveDbPath() {
  if (existsSync(join(DATA_DIR, "totalrecall.db"))) return join(DATA_DIR, "totalrecall.db");
  if (existsSync(_legacyDbV3)) return _legacyDbV3;
  if (existsSync(_legacyDbV1)) return _legacyDbV1;
  return join(DATA_DIR, "totalrecall.db");
}
var DB_PATH = resolveDbPath();
var VECTOR_DB_DIR = join(DATA_DIR, "vector-db");
var OBSERVER_SESSIONS_DIR = join(DATA_DIR, "observer-sessions");
var KIRO_SETTINGS_PATH = join(KIRO_CONFIG_DIR, "settings.json");
var KIRO_CONTEXT_PATH = join(KIRO_CONFIG_DIR, "context.md");
function getProjectArchiveDir(projectName) {
  return join(ARCHIVES_DIR, projectName);
}
function getWorkerSocketPath(sessionId) {
  return join(DATA_DIR, `worker-${sessionId}.sock`);
}
function ensureDir(dirPath) {
  mkdirSync(dirPath, { recursive: true });
}
function ensureAllDataDirs() {
  ensureDir(DATA_DIR);
  ensureDir(ARCHIVES_DIR);
  ensureDir(LOGS_DIR);
  ensureDir(TRASH_DIR);
  ensureDir(BACKUPS_DIR);
  ensureDir(MODES_DIR);
}
function ensureModesDir() {
  ensureDir(MODES_DIR);
}
function getCurrentProjectName() {
  try {
    const gitRoot = execSync("git rev-parse --show-toplevel", {
      cwd: process.cwd(),
      encoding: "utf8",
      stdio: ["pipe", "pipe", "ignore"],
      windowsHide: true
    }).trim();
    return basename(gitRoot);
  } catch {
    return basename(process.cwd());
  }
}
function getPackageRoot() {
  return join(_dirname, "..");
}
function createBackupFilename(originalPath) {
  const timestamp = (/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-").replace("T", "_").slice(0, 19);
  return `${originalPath}.backup.${timestamp}`;
}
export {
  ARCHIVES_DIR,
  BACKUPS_DIR,
  CANONICAL_DATA_DIR,
  DATA_DIR,
  DB_PATH,
  KIRO_CONFIG_DIR,
  KIRO_CONTEXT_PATH,
  KIRO_SETTINGS_PATH,
  LEGACY_DATA_DIR,
  LOGS_DIR,
  MODES_DIR,
  OBSERVER_SESSIONS_DIR,
  PLUGIN_ROOT,
  TRASH_DIR,
  USER_SETTINGS_PATH,
  VECTOR_DB_DIR,
  createBackupFilename,
  ensureAllDataDirs,
  ensureDir,
  ensureModesDir,
  getCurrentProjectName,
  getPackageRoot,
  getProjectArchiveDir,
  getWorkerSocketPath
};
