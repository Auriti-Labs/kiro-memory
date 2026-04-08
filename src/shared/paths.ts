import { join, dirname, basename } from 'path';
import { homedir } from 'os';
import { existsSync, mkdirSync } from 'fs';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

// Get __dirname that works in both ESM and CJS contexts
function getDirname(): string {
  if (typeof __dirname !== 'undefined') {
    return __dirname;
  }
  return dirname(fileURLToPath(import.meta.url));
}

const _dirname = getDirname();

/**
 * Simple path configuration for Total Recall
 */

// Base directory - canonical Total Recall data location in home directory
// Backward compatibility chain: ~/.totalrecall (canonical) → ~/.contextkit (legacy installs)
const _legacyV1Dir = join(homedir(), '.contextkit');
const _canonicalDir = join(homedir(), '.totalrecall');

function resolveDataDir(): string {
  // Prefer canonical name when present
  if (existsSync(_canonicalDir)) return _canonicalDir;
  // Fall back to legacy installs
  if (existsSync(_legacyV1Dir)) return _legacyV1Dir;
  // Default to canonical name for fresh installs
  return _canonicalDir;
}

export const DATA_DIR = process.env.TOTALRECALL_DATA_DIR || process.env.CONTEXTKIT_DATA_DIR || resolveDataDir();
export const LEGACY_DATA_DIR = _legacyV1Dir;
export const CANONICAL_DATA_DIR = _canonicalDir;

// Kiro config directory (still needed for Claude Code / Kiro CLI integration)
export const KIRO_CONFIG_DIR = process.env.KIRO_CONFIG_DIR || join(homedir(), '.kiro');

// Plugin installation directory
export const PLUGIN_ROOT = join(KIRO_CONFIG_DIR, 'plugins', 'totalrecall');

// Data subdirectories
export const ARCHIVES_DIR = join(DATA_DIR, 'archives');
export const LOGS_DIR = join(DATA_DIR, 'logs');
export const TRASH_DIR = join(DATA_DIR, 'trash');
export const BACKUPS_DIR = join(DATA_DIR, 'backups');
export const MODES_DIR = join(DATA_DIR, 'modes');
export const USER_SETTINGS_PATH = join(DATA_DIR, 'settings.json');
// Backward compat: use existing DB if found under old names
const _legacyDbV1 = join(DATA_DIR, 'contextkit.db');
const _legacyDbV3 = join(DATA_DIR, 'totalrecall.db');
function resolveDbPath(): string {
  if (existsSync(join(DATA_DIR, 'totalrecall.db'))) return join(DATA_DIR, 'totalrecall.db');
  if (existsSync(_legacyDbV3)) return _legacyDbV3;
  if (existsSync(_legacyDbV1)) return _legacyDbV1;
  return join(DATA_DIR, 'totalrecall.db');
}
export const DB_PATH = resolveDbPath();
export const VECTOR_DB_DIR = join(DATA_DIR, 'vector-db');

// Observer sessions directory
export const OBSERVER_SESSIONS_DIR = join(DATA_DIR, 'observer-sessions');

// Kiro integration paths
export const KIRO_SETTINGS_PATH = join(KIRO_CONFIG_DIR, 'settings.json');
export const KIRO_CONTEXT_PATH = join(KIRO_CONFIG_DIR, 'context.md');

/**
 * Get project-specific archive directory
 */
export function getProjectArchiveDir(projectName: string): string {
  return join(ARCHIVES_DIR, projectName);
}

/**
 * Get worker socket path for a session
 */
export function getWorkerSocketPath(sessionId: number): string {
  return join(DATA_DIR, `worker-${sessionId}.sock`);
}

/**
 * Ensure a directory exists
 */
export function ensureDir(dirPath: string): void {
  mkdirSync(dirPath, { recursive: true });
}

/**
 * Ensure all data directories exist
 */
export function ensureAllDataDirs(): void {
  ensureDir(DATA_DIR);
  ensureDir(ARCHIVES_DIR);
  ensureDir(LOGS_DIR);
  ensureDir(TRASH_DIR);
  ensureDir(BACKUPS_DIR);
  ensureDir(MODES_DIR);
}

/**
 * Ensure modes directory exists
 */
export function ensureModesDir(): void {
  ensureDir(MODES_DIR);
}

/**
 * Get current project name from git root or cwd
 */
export function getCurrentProjectName(): string {
  try {
    const gitRoot = execSync('git rev-parse --show-toplevel', {
      cwd: process.cwd(),
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'ignore'],
      windowsHide: true
    }).trim();
    return basename(gitRoot);
  } catch {
    return basename(process.cwd());
  }
}

/**
 * Find package root directory
 */
export function getPackageRoot(): string {
  return join(_dirname, '..');
}

/**
 * Create a timestamped backup filename
 */
export function createBackupFilename(originalPath: string): string {
  const timestamp = new Date()
    .toISOString()
    .replace(/[:.]/g, '-')
    .replace('T', '_')
    .slice(0, 19);

  return `${originalPath}.backup.${timestamp}`;
}
