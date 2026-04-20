/**
 * Service installer for TotalRecall worker auto-start.
 *
 * Strategy (cascading detection):
 * 1. crontab @reboot — works everywhere on Linux/macOS, zero dependencies
 * 2. systemd user service — if systemctl --user is available
 *
 * The worker itself guards against duplicate instances via health check.
 */

import { execSync, spawnSync } from 'child_process';
import { join, dirname } from 'path';
import { existsSync, writeFileSync, mkdirSync, readFileSync, unlinkSync } from 'fs';
import { homedir } from 'os';
import { DATA_DIR } from '../shared/paths.js';

const CRONTAB_MARKER = '# totalrecall-worker-autostart';

export type Strategy = 'crontab' | 'systemd' | 'none';

export interface InstallResult {
  strategy: Strategy;
  success: boolean;
  message: string;
}

/**
 * Resolve the absolute path to the compiled worker-service.js.
 * Works whether running from source (dist/) or installed globally (plugin/dist/).
 */
function resolveWorkerPath(): string {
  // Try plugin/dist first (npm global install)
  const candidates = [
    join(dirname(new URL(import.meta.url).pathname), '..', 'worker-service.js'),
    join(dirname(new URL(import.meta.url).pathname), 'worker-service.js'),
  ];
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  return candidates[0]; // Best guess
}

function getNodePath(): string {
  return process.execPath;
}

// ── Detection ──

function isSystemdUserAvailable(): boolean {
  try {
    const result = spawnSync('systemctl', ['--user', 'status'], {
      timeout: 3000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    // "Failed to connect to bus" means D-Bus user session is not available
    const stderr = result.stderr?.toString() || '';
    if (stderr.includes('Failed to connect')) return false;
    // Exit code 0 means systemd user bus is reachable and running
    return result.status === 0 && !result.error;
  } catch {
    return false;
  }
}

function isCrontabAvailable(): boolean {
  try {
    spawnSync('crontab', ['-l'], { timeout: 3000, stdio: ['pipe', 'pipe', 'pipe'] });
    return true; // Even "no crontab for user" means crontab is available
  } catch {
    return false;
  }
}

export function detectStrategy(): Strategy {
  if (isSystemdUserAvailable()) return 'systemd';
  if (isCrontabAvailable()) return 'crontab';
  return 'none';
}

// ── Crontab ──

function getCrontab(): string {
  try {
    return execSync('crontab -l 2>/dev/null', { encoding: 'utf8' });
  } catch {
    return '';
  }
}

function setCrontab(content: string): void {
  const tmp = join(DATA_DIR, '.crontab-tmp');
  writeFileSync(tmp, content, 'utf8');
  try {
    execSync(`crontab "${tmp}"`, { stdio: 'pipe' });
  } finally {
    try { unlinkSync(tmp); } catch { /* ignore */ }
  }
}

function buildCrontabEntry(): string {
  const nodePath = getNodePath();
  const workerPath = resolveWorkerPath();
  const env = `TOTALRECALL_DATA_DIR=${DATA_DIR}`;
  return `@reboot ${env} ${nodePath} ${workerPath} ${CRONTAB_MARKER}`;
}

function installCrontab(): InstallResult {
  const existing = getCrontab();
  if (existing.includes(CRONTAB_MARKER)) {
    return { strategy: 'crontab', success: true, message: 'Already installed (crontab @reboot)' };
  }

  const entry = buildCrontabEntry();
  const newCrontab = existing.trimEnd() + '\n' + entry + '\n';
  setCrontab(newCrontab);

  return { strategy: 'crontab', success: true, message: `Installed crontab @reboot entry. Worker will start on boot.` };
}

function uninstallCrontab(): InstallResult {
  const existing = getCrontab();
  if (!existing.includes(CRONTAB_MARKER)) {
    return { strategy: 'crontab', success: true, message: 'Not installed (crontab)' };
  }

  const filtered = existing
    .split('\n')
    .filter(line => !line.includes(CRONTAB_MARKER))
    .join('\n');
  setCrontab(filtered);

  return { strategy: 'crontab', success: true, message: 'Removed crontab @reboot entry.' };
}

// ── Systemd ──

const SYSTEMD_SERVICE_NAME = 'totalrecall-worker';

function getSystemdDir(): string {
  return join(homedir(), '.config', 'systemd', 'user');
}

function getServiceFilePath(): string {
  return join(getSystemdDir(), `${SYSTEMD_SERVICE_NAME}.service`);
}

function buildServiceFile(): string {
  const nodePath = getNodePath();
  const workerPath = resolveWorkerPath();
  return `[Unit]
Description=TotalRecall Worker — persistent AI memory
After=network.target

[Service]
Type=simple
ExecStart=${nodePath} ${workerPath}
Environment=TOTALRECALL_DATA_DIR=${DATA_DIR}
Restart=on-failure
RestartSec=5
StartLimitIntervalSec=60
StartLimitBurst=3
WorkingDirectory=${homedir()}

[Install]
WantedBy=default.target
`;
}

function installSystemd(): InstallResult {
  const dir = getSystemdDir();
  mkdirSync(dir, { recursive: true });

  const servicePath = getServiceFilePath();
  writeFileSync(servicePath, buildServiceFile(), 'utf8');

  try {
    execSync('systemctl --user daemon-reload', { stdio: 'pipe' });
    execSync(`systemctl --user enable ${SYSTEMD_SERVICE_NAME}`, { stdio: 'pipe' });
    execSync(`systemctl --user start ${SYSTEMD_SERVICE_NAME}`, { stdio: 'pipe' });
  } catch (err) {
    return { strategy: 'systemd', success: false, message: `Service file created but activation failed: ${err}` };
  }

  return { strategy: 'systemd', success: true, message: `Installed and started systemd user service.` };
}

function uninstallSystemd(): InstallResult {
  try {
    execSync(`systemctl --user stop ${SYSTEMD_SERVICE_NAME} 2>/dev/null`, { stdio: 'pipe' });
    execSync(`systemctl --user disable ${SYSTEMD_SERVICE_NAME} 2>/dev/null`, { stdio: 'pipe' });
  } catch { /* may not be running */ }

  const servicePath = getServiceFilePath();
  if (existsSync(servicePath)) {
    unlinkSync(servicePath);
    try { execSync('systemctl --user daemon-reload', { stdio: 'pipe' }); } catch { /* ignore */ }
  }

  return { strategy: 'systemd', success: true, message: 'Removed systemd user service.' };
}

// ── Public API ──

export function install(): InstallResult {
  const strategy = detectStrategy();

  switch (strategy) {
    case 'systemd':
      return installSystemd();
    case 'crontab':
      return installCrontab();
    default:
      return { strategy: 'none', success: false, message: 'No supported service manager found (need crontab or systemd --user).' };
  }
}

export function uninstall(): InstallResult {
  // Remove both to be safe
  const results: InstallResult[] = [];

  if (existsSync(getServiceFilePath())) {
    results.push(uninstallSystemd());
  }

  const crontab = getCrontab();
  if (crontab.includes(CRONTAB_MARKER)) {
    results.push(uninstallCrontab());
  }

  if (results.length === 0) {
    return { strategy: 'none', success: true, message: 'No service installation found.' };
  }

  return results[results.length - 1];
}

export interface ServiceStatus {
  installed: boolean;
  strategy: Strategy;
  running: boolean;
  details: string;
}

export function status(): ServiceStatus {
  // Check systemd first
  if (existsSync(getServiceFilePath())) {
    try {
      const out = execSync(`systemctl --user is-active ${SYSTEMD_SERVICE_NAME} 2>/dev/null`, { encoding: 'utf8' }).trim();
      return { installed: true, strategy: 'systemd', running: out === 'active', details: `systemd: ${out}` };
    } catch {
      return { installed: true, strategy: 'systemd', running: false, details: 'systemd: inactive or bus unavailable' };
    }
  }

  // Check crontab
  const crontab = getCrontab();
  if (crontab.includes(CRONTAB_MARKER)) {
    // crontab doesn't tell us if the process is running — check health
    return { installed: true, strategy: 'crontab', running: false, details: 'crontab @reboot entry present (check worker:status for runtime)' };
  }

  return { installed: false, strategy: 'none', running: false, details: 'No service installed. Run: totalrecall service install' };
}
