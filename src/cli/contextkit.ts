/**
 * Kiro Memory CLI - Interfaccia a riga di comando
 * (shebang aggiunto automaticamente dal build)
 */

import { createKiroMemory } from '../sdk/index.js';
import { formatReportText, formatReportMarkdown, formatReportJson } from '../services/report-formatter.js';
import { printBanner } from './banner.js';
import { execSync } from 'child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from 'fs';
import { join, dirname } from 'path';
import { homedir, platform, release } from 'os';
import { fileURLToPath } from 'url';
import { createInterface } from 'readline';

const args = process.argv.slice(2);
const command = args[0];

// Rileva il path di dist dal file corrente (bundled da esbuild)
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
// __dirname = .../plugin/dist/cli → risali per ottenere plugin/dist
const DIST_DIR = dirname(__dirname);

// Versione dal package.json (plugin/dist/cli → ../../package.json)
let PKG_VERSION = 'unknown';
try {
  const pkgPath = join(DIST_DIR, '..', '..', 'package.json');
  PKG_VERSION = JSON.parse(readFileSync(pkgPath, 'utf8')).version;
} catch { /* fallback */ }

// ─── Embedded templates (included in the npm package, no external files needed) ───

/** Agent config template — __DIST_DIR__ is replaced at install time */
const AGENT_TEMPLATE = JSON.stringify({
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
    agentSpawn: [{ command: "node __DIST_DIR__/hooks/agentSpawn.js", timeout_ms: 10000 }],
    userPromptSubmit: [{ command: "node __DIST_DIR__/hooks/userPromptSubmit.js", timeout_ms: 5000 }],
    postToolUse: [{ command: "node __DIST_DIR__/hooks/postToolUse.js", matcher: "*", timeout_ms: 5000 }],
    stop: [{ command: "node __DIST_DIR__/hooks/stop.js", timeout_ms: 10000 }]
  },
  resources: ["file://.kiro/steering/kiro-memory.md"]
}, null, 2);

/** Steering file content — embedded directly */
const STEERING_CONTENT = `# Kiro Memory - Persistent Memory

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

// ─── Environment diagnostics ───

interface CheckResult {
  name: string;
  ok: boolean;
  message: string;
  fix?: string;
}

/** Detect if running inside WSL */
function isWSL(): boolean {
  try {
    const rel = release().toLowerCase();
    if (rel.includes('microsoft') || rel.includes('wsl')) return true;
    if (existsSync('/proc/version')) {
      const proc = readFileSync('/proc/version', 'utf8').toLowerCase();
      return proc.includes('microsoft') || proc.includes('wsl');
    }
    return false;
  } catch {
    return false;
  }
}

/** Check if a command is available in PATH */
function commandExists(cmd: string): boolean {
  try {
    execSync(`which ${cmd}`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/** Detect if a path points to the Windows filesystem */
function isWindowsPath(p: string): boolean {
  return p.startsWith('/mnt/c') || p.startsWith('/mnt/d')
    || /^[A-Za-z]:[\\\/]/.test(p);
}

/** Run all environment checks and return results */
function runEnvironmentChecks(): CheckResult[] {
  const checks: CheckResult[] = [];
  const wsl = isWSL();

  // 1. OS detection
  const os = platform();
  checks.push({
    name: 'Operating system',
    ok: os === 'linux' || os === 'darwin',
    message: os === 'linux'
      ? (wsl ? 'Linux (WSL)' : 'Linux')
      : os === 'darwin' ? 'macOS' : `${os} (not officially supported)`,
  });

  // 2. WSL: Node must be native Linux (not Windows mounted via /mnt/c/)
  if (wsl) {
    const nodePath = process.execPath;
    const nodeOnWindows = isWindowsPath(nodePath);
    checks.push({
      name: 'WSL: Native Node.js',
      ok: !nodeOnWindows,
      message: nodeOnWindows
        ? `Node.js points to Windows: ${nodePath}`
        : `Native Linux Node.js: ${nodePath}`,
      fix: nodeOnWindows
        ? 'Install Node.js inside WSL:\n  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -\n  sudo apt-get install -y nodejs\n  Or use nvm: https://github.com/nvm-sh/nvm'
        : undefined,
    });

    // 3. WSL: npm global prefix must not point to Windows
    // npm may return paths in Linux format (/mnt/c/...) or Windows format (C:\...)
    try {
      const npmPrefix = execSync('npm prefix -g', { encoding: 'utf8' }).trim();
      const prefixOnWindows = isWindowsPath(npmPrefix);
      checks.push({
        name: 'WSL: npm global prefix',
        ok: !prefixOnWindows,
        message: prefixOnWindows
          ? `npm global prefix points to Windows: ${npmPrefix}`
          : `npm global prefix: ${npmPrefix}`,
        fix: prefixOnWindows
          ? 'Fix npm prefix:\n  mkdir -p ~/.npm-global\n  npm config set prefix ~/.npm-global\n  echo \'export PATH="$HOME/.npm-global/bin:$PATH"\' >> ~/.bashrc\n  source ~/.bashrc\n  Then reinstall: npm install -g kiro-memory'
          : undefined,
      });
    } catch {
      checks.push({
        name: 'WSL: npm global prefix',
        ok: false,
        message: 'Unable to determine npm prefix',
      });
    }

    // 3b. WSL: npm binary must be native Linux (not Windows npm)
    try {
      const npmPath = execSync('which npm', { encoding: 'utf8' }).trim();
      const npmOnWindows = isWindowsPath(npmPath);
      checks.push({
        name: 'WSL: npm binary',
        ok: !npmOnWindows,
        message: npmOnWindows
          ? `npm is the Windows version: ${npmPath}`
          : `Native Linux npm: ${npmPath}`,
        fix: npmOnWindows
          ? 'Your npm binary is the Windows version running inside WSL.\n  This causes EPERM/UNC errors when installing packages.\n  Install Node.js (includes npm) natively in WSL:\n    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash\n    source ~/.bashrc\n    nvm install 22\n  Or:\n    curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -\n    sudo apt-get install -y nodejs'
          : undefined,
      });
    } catch {
      // which npm failed — non-blocking, npm is present if we got here
    }
  }

  // 4. Node.js >= 18
  const nodeVersion = parseInt(process.versions.node.split('.')[0]);
  checks.push({
    name: 'Node.js >= 18',
    ok: nodeVersion >= 18,
    message: `Node.js v${process.versions.node}`,
    fix: nodeVersion < 18
      ? 'Upgrade Node.js:\n  nvm install 22 && nvm use 22\n  Or visit: https://nodejs.org/'
      : undefined,
  });

  // 5. better-sqlite3 loadable
  let sqliteOk = false;
  let sqliteMsg = '';
  try {
    require('better-sqlite3');
    sqliteOk = true;
    sqliteMsg = 'Native module loaded successfully';
  } catch (err: any) {
    sqliteMsg = err.code === 'ERR_DLOPEN_FAILED'
      ? 'Incompatible native binary (invalid ELF header — likely platform mismatch)'
      : `Error: ${err.message}`;
  }
  checks.push({
    name: 'better-sqlite3',
    ok: sqliteOk,
    message: sqliteMsg,
    fix: !sqliteOk
      ? (wsl
        ? 'In WSL, rebuild the native module:\n  npm rebuild better-sqlite3\n  If that fails, reinstall:\n  npm install -g kiro-memory --build-from-source'
        : 'Rebuild the native module:\n  npm rebuild better-sqlite3')
      : undefined,
  });

  // 6. Build tools (Linux/WSL only — needed for native module compilation)
  if (os === 'linux') {
    const hasMake = commandExists('make');
    const hasGcc = commandExists('g++') || commandExists('gcc');
    const hasPython = commandExists('python3') || commandExists('python');
    const allPresent = hasMake && hasGcc && hasPython;
    const missing: string[] = [];
    if (!hasMake || !hasGcc) missing.push('build-essential');
    if (!hasPython) missing.push('python3');

    checks.push({
      name: 'Build tools (native modules)',
      ok: allPresent,
      message: allPresent
        ? 'make, g++, python3 available'
        : `Missing: ${missing.join(', ')}`,
      fix: !allPresent
        ? `Install required packages:\n  sudo apt-get update && sudo apt-get install -y ${missing.join(' ')}\n  Then reinstall: npm install -g kiro-memory --build-from-source`
        : undefined,
    });
  }

  return checks;
}

/** Print check results in a readable format */
function printChecks(checks: CheckResult[]): { hasErrors: boolean } {
  let hasErrors = false;
  console.log('');

  for (const check of checks) {
    const icon = check.ok ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m';
    console.log(`  ${icon} ${check.name}: ${check.message}`);
    if (!check.ok && check.fix) {
      console.log(`    \x1b[33m→ Fix:\x1b[0m`);
      for (const line of check.fix.split('\n')) {
        console.log(`      ${line}`);
      }
    }
    if (!check.ok) hasErrors = true;
  }

  console.log('');
  return { hasErrors };
}

// ─── Helper: prompt interattivo ───

/** Chiede input all'utente via stdin e ritorna la risposta */
function askUser(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase());
    });
  });
}

/** Rileva la shell corrente dell'utente */
function detectShellRc(): { name: string; rcFile: string } {
  const shell = process.env.SHELL || '/bin/bash';
  if (shell.includes('zsh')) return { name: 'zsh', rcFile: join(homedir(), '.zshrc') };
  if (shell.includes('fish')) return { name: 'fish', rcFile: join(homedir(), '.config/fish/config.fish') };
  return { name: 'bash', rcFile: join(homedir(), '.bashrc') };
}

// ─── Auto-fix per problemi rilevati ───

/** Identifica quali check falliti sono auto-fixabili */
const AUTOFIXABLE_CHECKS = new Set([
  'WSL: npm global prefix',
  'WSL: npm binary',
  'Build tools (native modules)',
  'better-sqlite3',
]);

/** Tenta il fix automatico dei problemi rilevati. Ritorna true se qualcosa è stato fixato */
async function tryAutoFix(failedChecks: CheckResult[]): Promise<{ fixed: boolean; needsRestart: boolean }> {
  const fixable = failedChecks.filter(c => !c.ok && AUTOFIXABLE_CHECKS.has(c.name));
  if (fixable.length === 0) return { fixed: false, needsRestart: false };

  const { rcFile } = detectShellRc();
  let anyFixed = false;
  let needsRestart = false;

  console.log(`  \x1b[36mFound ${fixable.length} issue(s) that can be fixed automatically:\x1b[0m\n`);
  for (const check of fixable) {
    console.log(`    - ${check.name}: ${check.message}`);
  }
  console.log('');

  const answer = await askUser('  Fix automatically? [Y/n] ');
  if (answer !== '' && answer !== 'y' && answer !== 'yes') {
    console.log('\n  Skipped auto-fix. Fix manually and run: kiro-memory install\n');
    return { fixed: false, needsRestart: false };
  }

  console.log('');

  // Fix 1: npm global prefix su Windows
  const prefixCheck = fixable.find(c => c.name === 'WSL: npm global prefix');
  if (prefixCheck) {
    console.log('  Fixing npm global prefix...');
    try {
      const npmGlobalDir = join(homedir(), '.npm-global');
      mkdirSync(npmGlobalDir, { recursive: true });
      const { spawnSync: spawnNpmConfig } = require('child_process');
      spawnNpmConfig('npm', ['config', 'set', 'prefix', npmGlobalDir], { stdio: 'ignore' });

      // Aggiorna rcFile se non contiene già il path
      const exportLine = 'export PATH="$HOME/.npm-global/bin:$PATH"';
      let alreadyInRc = false;
      if (existsSync(rcFile)) {
        const content = readFileSync(rcFile, 'utf8');
        alreadyInRc = content.includes('.npm-global/bin');
      }
      if (!alreadyInRc) {
        appendFileSync(rcFile, `\n# npm global prefix (added by kiro-memory)\n${exportLine}\n`);
      }

      // Aggiorna PATH del processo corrente
      process.env.PATH = `${npmGlobalDir}/bin:${process.env.PATH}`;

      console.log(`  \x1b[32m✓\x1b[0m npm prefix set to ${npmGlobalDir}`);
      console.log(`  \x1b[32m✓\x1b[0m PATH updated in ${rcFile}`);
      anyFixed = true;
    } catch (err: any) {
      console.log(`  \x1b[31m✗\x1b[0m Could not fix npm prefix: ${err.message}`);
    }
  }

  // Fix 2: npm binary è Windows → installa nvm + Node 22 (no sudo)
  const npmBinaryCheck = fixable.find(c => c.name === 'WSL: npm binary');
  if (npmBinaryCheck) {
    console.log('\n  Fixing npm binary (installing nvm + Node.js 22)...');
    const nvmDir = join(homedir(), '.nvm');

    try {
      if (existsSync(nvmDir)) {
        console.log(`  nvm already installed at ${nvmDir}`);
      } else {
        console.log('  Downloading nvm...');
        execSync('curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash', {
          stdio: 'inherit',
          timeout: 60000,
        });
        console.log(`  \x1b[32m✓\x1b[0m nvm installed`);
      }

      // Installa Node 22 via nvm (in una subshell che carica nvm)
      console.log('  Installing Node.js 22 via nvm...');
      execSync('bash -c "source $HOME/.nvm/nvm.sh && nvm install 22"', {
        stdio: 'inherit',
        timeout: 120000,
      });
      console.log(`  \x1b[32m✓\x1b[0m Node.js 22 installed`);
      anyFixed = true;
      needsRestart = true; // Il processo corrente usa ancora il vecchio npm
    } catch (err: any) {
      console.log(`  \x1b[31m✗\x1b[0m Could not install nvm/Node: ${err.message}`);
      console.log('  Install manually:');
      console.log('    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash');
      console.log('    source ~/.bashrc');
      console.log('    nvm install 22');
    }
  }

  // Fix 3: build tools mancanti (richiede sudo)
  const buildCheck = fixable.find(c => c.name === 'Build tools (native modules)');
  if (buildCheck) {
    console.log('\n  Fixing build tools (requires sudo)...');
    try {
      execSync('sudo apt-get update -qq && sudo apt-get install -y build-essential python3', {
        stdio: 'inherit',
        timeout: 120000,
      });
      console.log(`  \x1b[32m✓\x1b[0m Build tools installed`);
      anyFixed = true;
    } catch (err: any) {
      console.log(`  \x1b[31m✗\x1b[0m Could not install build tools: ${err.message}`);
      console.log('  Install manually: sudo apt-get install -y build-essential python3');
    }
  }

  // Fix 4: better-sqlite3 ELF error → rebuild
  const sqliteCheck = fixable.find(c => c.name === 'better-sqlite3');
  if (sqliteCheck) {
    console.log('\n  Rebuilding better-sqlite3...');
    try {
      // Trova il path del modulo installato globalmente
      const { spawnSync: spawnRebuild } = require('child_process');
      const globalDirResult = spawnRebuild('npm', ['prefix', '-g'], { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] });
      const globalDir = (globalDirResult.stdout || '').trim();
      const sqlitePkg = join(globalDir, 'lib', 'node_modules', 'kiro-memory');
      if (existsSync(sqlitePkg)) {
        spawnRebuild('npm', ['rebuild', 'better-sqlite3'], {
          cwd: sqlitePkg,
          stdio: 'inherit',
          timeout: 60000,
        });
      } else {
        spawnRebuild('npm', ['rebuild', 'better-sqlite3'], { stdio: 'inherit', timeout: 60000 });
      }
      console.log(`  \x1b[32m✓\x1b[0m better-sqlite3 rebuilt`);
      anyFixed = true;
    } catch (err: any) {
      console.log(`  \x1b[31m✗\x1b[0m Could not rebuild: ${err.message}`);
      console.log('  Try: npm install -g kiro-memory --build-from-source');
    }
  }

  console.log('');
  return { fixed: anyFixed, needsRestart };
}

// ─── Install command ───

async function installKiro() {
  console.log('\n=== Kiro Memory - Installation ===\n');
  console.log('[1/4] Running environment checks...');

  let checks = runEnvironmentChecks();
  let { hasErrors } = printChecks(checks);

  // Se ci sono errori, tenta auto-fix
  if (hasErrors) {
    const { fixed, needsRestart } = await tryAutoFix(checks);

    if (needsRestart) {
      // nvm/Node installati — serve nuovo terminale
      console.log('  \x1b[33m┌─────────────────────────────────────────────────────────┐\x1b[0m');
      console.log('  \x1b[33m│\x1b[0m  Node.js was installed via nvm. To activate it:         \x1b[33m│\x1b[0m');
      console.log('  \x1b[33m│\x1b[0m                                                         \x1b[33m│\x1b[0m');
      console.log('  \x1b[33m│\x1b[0m  1. Close and reopen your terminal                      \x1b[33m│\x1b[0m');
      console.log('  \x1b[33m│\x1b[0m  2. Run: \x1b[1mnpm install -g kiro-memory\x1b[0m                     \x1b[33m│\x1b[0m');
      console.log('  \x1b[33m│\x1b[0m  3. Run: \x1b[1mkiro-memory install\x1b[0m                            \x1b[33m│\x1b[0m');
      console.log('  \x1b[33m└─────────────────────────────────────────────────────────┘\x1b[0m\n');
      process.exit(0);
    }

    if (fixed) {
      // Re-run check dopo i fix applicati in-process
      console.log('  Re-running checks...\n');
      checks = runEnvironmentChecks();
      ({ hasErrors } = printChecks(checks));
    }

    if (hasErrors) {
      console.log('\x1b[31mInstallation aborted.\x1b[0m Fix the remaining issues and retry.');
      console.log('After fixing, run: kiro-memory install\n');
      process.exit(1);
    }
  }

  // dist directory (dove risiedono i file compilati)
  const distDir = DIST_DIR;

  // Directory di destinazione
  const kiroDir = process.env.KIRO_CONFIG_DIR || join(homedir(), '.kiro');
  const agentsDir = join(kiroDir, 'agents');
  const settingsDir = join(kiroDir, 'settings');
  const steeringDir = join(kiroDir, 'steering');
  const dataDir = process.env.KIRO_MEMORY_DATA_DIR || process.env.CONTEXTKIT_DATA_DIR || join(homedir(), '.contextkit');

  console.log('[2/4] Installing Kiro configuration...\n');

  // Create directories
  for (const dir of [agentsDir, settingsDir, steeringDir, dataDir]) {
    mkdirSync(dir, { recursive: true });
  }

  // Generate agent config with absolute paths (from embedded template)
  const agentConfig = AGENT_TEMPLATE.replace(/__DIST_DIR__/g, distDir);
  const agentDestPath = join(agentsDir, 'kiro-memory.json');
  writeFileSync(agentDestPath, agentConfig, 'utf8');
  console.log(`  → Agent config: ${agentDestPath}`);

  // Aggiorna/crea mcp.json
  const mcpFilePath = join(settingsDir, 'mcp.json');
  let mcpConfig: any = { mcpServers: {} };

  if (existsSync(mcpFilePath)) {
    try {
      mcpConfig = JSON.parse(readFileSync(mcpFilePath, 'utf8'));
      if (!mcpConfig.mcpServers) mcpConfig.mcpServers = {};
    } catch {
      // File corrotto, sovrascrivi
    }
  }

  mcpConfig.mcpServers['kiro-memory'] = {
    command: 'node',
    args: [join(distDir, 'servers', 'mcp-server.js')]
  };
  writeFileSync(mcpFilePath, JSON.stringify(mcpConfig, null, 2), 'utf8');
  console.log(`  → MCP config:   ${mcpFilePath}`);

  // Scrivi steering file (da contenuto embedded)
  const steeringDestPath = join(steeringDir, 'kiro-memory.md');
  writeFileSync(steeringDestPath, STEERING_CONTENT, 'utf8');
  console.log(`  → Steering:     ${steeringDestPath}`);

  console.log(`  → Data dir:     ${dataDir}`);

  // 3. Prompt per creazione alias
  console.log('\n[3/4] Shell alias setup\n');

  const { rcFile } = detectShellRc();
  const aliasLine = 'alias kiro="kiro-cli --agent kiro-memory"';

  // Check if alias is already set
  let aliasAlreadySet = false;
  if (existsSync(rcFile)) {
    const rcContent = readFileSync(rcFile, 'utf8');
    aliasAlreadySet = rcContent.includes('alias kiro=') && rcContent.includes('kiro-memory');
  }

  if (aliasAlreadySet) {
    console.log(`  \x1b[32m✓\x1b[0m Alias already configured in ${rcFile}`);
  } else {
    // Box evidenziato per l'alias
    console.log('  \x1b[36m┌─────────────────────────────────────────────────────────┐\x1b[0m');
    console.log('  \x1b[36m│\x1b[0m  Without an alias, you must type every time:            \x1b[36m│\x1b[0m');
    console.log('  \x1b[36m│\x1b[0m    \x1b[2mkiro-cli --agent kiro-memory\x1b[0m                          \x1b[36m│\x1b[0m');
    console.log('  \x1b[36m│\x1b[0m                                                         \x1b[36m│\x1b[0m');
    console.log('  \x1b[36m│\x1b[0m  With the alias, just type:                              \x1b[36m│\x1b[0m');
    console.log('  \x1b[36m│\x1b[0m    \x1b[1m\x1b[32mkiro\x1b[0m                                                 \x1b[36m│\x1b[0m');
    console.log('  \x1b[36m└─────────────────────────────────────────────────────────┘\x1b[0m');
    console.log('');

    const answer = await askUser(`  Add alias to ${rcFile}? [Y/n] `);

    if (answer === '' || answer === 'y' || answer === 'yes') {
      try {
        appendFileSync(rcFile, `\n# Kiro Memory — persistent memory alias\n${aliasLine}\n`);
        console.log(`\n  \x1b[32m✓\x1b[0m Alias added to ${rcFile}`);
        console.log(`  \x1b[33m→\x1b[0m Run \x1b[1msource ${rcFile}\x1b[0m or open a new terminal to activate it.`);
      } catch (err: any) {
        console.log(`\n  \x1b[31m✗\x1b[0m Could not write to ${rcFile}: ${err.message}`);
        console.log(`  \x1b[33m→\x1b[0m Add manually: ${aliasLine}`);
      }
    } else {
      console.log(`\n  Skipped. You can add it manually later:`);
      console.log(`    echo '${aliasLine}' >> ${rcFile}`);
    }
  }

  // 4. Banner finale
  console.log('\n[4/4] Done!\n');
  printBanner({
    editor: 'Kiro CLI',
    version: PKG_VERSION,
    dashboardUrl: 'http://localhost:3001',
    dataDir,
    configPaths: [
      `Agent:    ${agentDestPath}`,
      `MCP:      ${mcpFilePath}`,
      `Steering: ${steeringDestPath}`,
    ],
  });
  console.log('  Start Kiro with memory:');
  if (aliasAlreadySet) {
    console.log('    \x1b[1mkiro\x1b[0m\n');
  } else {
    console.log('    \x1b[1mkiro-cli --agent kiro-memory\x1b[0m\n');
  }
}

// ─── Install Claude Code command ───

/** Contenuto steering per Claude Code (iniettato in ~/.claude/CLAUDE.md) */
const CLAUDE_CODE_STEERING = `# Kiro Memory - Persistent Cross-Session Memory

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
  console.log('\n=== Kiro Memory - Claude Code Installation ===\n');
  console.log('[1/3] Running environment checks...');

  const checks = runEnvironmentChecks();
  const { hasErrors } = printChecks(checks);

  if (hasErrors) {
    const { fixed, needsRestart } = await tryAutoFix(checks);

    if (needsRestart) {
      console.log('  \x1b[33mRestart your terminal and re-run: kiro-memory install --claude-code\x1b[0m\n');
      process.exit(0);
    }

    if (fixed) {
      console.log('  Re-running checks...\n');
      const reChecks = runEnvironmentChecks();
      const reResult = printChecks(reChecks);
      if (reResult.hasErrors) {
        console.log('\x1b[31mInstallation aborted.\x1b[0m Fix the remaining issues and retry.\n');
        process.exit(1);
      }
    } else if (hasErrors) {
      console.log('\x1b[31mInstallation aborted.\x1b[0m Fix the issues and retry.\n');
      process.exit(1);
    }
  }

  const distDir = DIST_DIR;
  const claudeDir = join(homedir(), '.claude');
  const dataDir = process.env.KIRO_MEMORY_DATA_DIR || process.env.CONTEXTKIT_DATA_DIR || join(homedir(), '.kiro-memory');

  console.log('[2/3] Installing Claude Code configuration...\n');

  // Crea directory
  mkdirSync(claudeDir, { recursive: true });
  mkdirSync(dataDir, { recursive: true });

  // --- settings.json con hooks ---
  const settingsPath = join(claudeDir, 'settings.json');
  let settings: any = {};

  if (existsSync(settingsPath)) {
    try {
      settings = JSON.parse(readFileSync(settingsPath, 'utf8'));
    } catch {
      // File corrotto, lo ricreiamo
    }
  }

  // Mappa hook events → script (timeout in secondi per Claude Code)
  const hookMap: Record<string, { script: string; timeout: number }> = {
    'SessionStart': { script: 'hooks/agentSpawn.js', timeout: 10 },
    'UserPromptSubmit': { script: 'hooks/userPromptSubmit.js', timeout: 5 },
    'PostToolUse': { script: 'hooks/postToolUse.js', timeout: 5 },
    'Stop': { script: 'hooks/stop.js', timeout: 10 }
  };

  // Claude Code: eventi sono chiavi TOP-LEVEL in settings.json (no wrapper "hooks")
  // Formato: { matcher: "...", hooks: [{ type, command, timeout }] }
  for (const [event, config] of Object.entries(hookMap)) {
    const hookEntry = {
      matcher: '',
      hooks: [{
        type: 'command' as const,
        command: `node ${join(distDir, config.script)}`,
        timeout: config.timeout
      }]
    };

    if (!settings[event]) {
      settings[event] = [hookEntry];
    } else if (Array.isArray(settings[event])) {
      // Rimuovi eventuali hook kiro-memory precedenti e aggiungi il nuovo
      settings[event] = settings[event].filter(
        (h: any) => !h.hooks?.some((hk: any) =>
          hk.command?.includes('kiro-memory') || hk.command?.includes('contextkit')
        )
      );
      settings[event].push(hookEntry);
    }
  }

  writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf8');
  console.log(`  → Hooks config: ${settingsPath}`);

  // --- .mcp.json nella home (scope globale) ---
  const mcpPath = join(homedir(), '.mcp.json');
  let mcpConfig: any = {};

  if (existsSync(mcpPath)) {
    try {
      mcpConfig = JSON.parse(readFileSync(mcpPath, 'utf8'));
    } catch {
      // File corrotto
    }
  }

  if (!mcpConfig.mcpServers) mcpConfig.mcpServers = {};

  mcpConfig.mcpServers['kiro-memory'] = {
    command: 'node',
    args: [join(distDir, 'servers', 'mcp-server.js')]
  };

  writeFileSync(mcpPath, JSON.stringify(mcpConfig, null, 2), 'utf8');
  console.log(`  → MCP config:   ${mcpPath}`);

  // --- CLAUDE.md steering file ---
  const steeringPath = join(claudeDir, 'CLAUDE.md');
  let existingSteering = '';

  if (existsSync(steeringPath)) {
    existingSteering = readFileSync(steeringPath, 'utf8');
  }

  // Aggiungi steering solo se non è già presente
  if (!existingSteering.includes('Kiro Memory')) {
    const separator = existingSteering.length > 0 ? '\n\n---\n\n' : '';
    writeFileSync(steeringPath, existingSteering + separator + CLAUDE_CODE_STEERING, 'utf8');
    console.log(`  → Steering:     ${steeringPath}`);
  } else {
    console.log(`  → Steering:     ${steeringPath} (already configured)`);
  }

  console.log(`  → Data dir:     ${dataDir}`);

  // 3. Banner finale
  console.log('\n[3/3] Done!\n');
  printBanner({
    editor: 'Claude Code',
    version: PKG_VERSION,
    dashboardUrl: 'http://localhost:3001',
    dataDir,
    configPaths: [
      `Hooks:    ${settingsPath}`,
      `MCP:      ${mcpPath}`,
      `Steering: ${steeringPath}`,
    ],
  });
}

// ─── Install Cursor command ───

async function installCursor() {
  console.log('\n=== Kiro Memory - Cursor Installation ===\n');
  console.log('[1/3] Running environment checks...');

  const checks = runEnvironmentChecks();
  const { hasErrors } = printChecks(checks);

  if (hasErrors) {
    const { fixed, needsRestart } = await tryAutoFix(checks);

    if (needsRestart) {
      console.log('  \x1b[33mRestart your terminal and re-run: kiro-memory install --cursor\x1b[0m\n');
      process.exit(0);
    }

    if (fixed) {
      console.log('  Re-running checks...\n');
      const reChecks = runEnvironmentChecks();
      const reResult = printChecks(reChecks);
      if (reResult.hasErrors) {
        console.log('\x1b[31mInstallation aborted.\x1b[0m Fix the remaining issues and retry.\n');
        process.exit(1);
      }
    } else if (hasErrors) {
      console.log('\x1b[31mInstallation aborted.\x1b[0m Fix the issues and retry.\n');
      process.exit(1);
    }
  }

  const distDir = DIST_DIR;
  const cursorDir = join(homedir(), '.cursor');
  const dataDir = process.env.KIRO_MEMORY_DATA_DIR || process.env.CONTEXTKIT_DATA_DIR || join(homedir(), '.kiro-memory');

  console.log('[2/3] Installing Cursor configuration...\n');

  // Crea directory
  mkdirSync(cursorDir, { recursive: true });
  mkdirSync(dataDir, { recursive: true });

  // --- hooks.json ---
  const hooksPath = join(cursorDir, 'hooks.json');
  let hooksConfig: any = { version: 1, hooks: {} };

  if (existsSync(hooksPath)) {
    try {
      hooksConfig = JSON.parse(readFileSync(hooksPath, 'utf8'));
      if (!hooksConfig.hooks) hooksConfig.hooks = {};
      if (!hooksConfig.version) hooksConfig.version = 1;
    } catch {
      // File corrotto, lo ricreiamo
    }
  }

  // Mappa eventi Cursor → script
  const cursorHookMap: Record<string, string> = {
    'sessionStart': 'hooks/agentSpawn.js',
    'beforeSubmitPrompt': 'hooks/userPromptSubmit.js',
    'afterFileEdit': 'hooks/postToolUse.js',
    'afterShellExecution': 'hooks/postToolUse.js',
    'afterMCPExecution': 'hooks/postToolUse.js',
    'stop': 'hooks/stop.js'
  };

  for (const [event, script] of Object.entries(cursorHookMap)) {
    const hookEntry = {
      command: `node ${join(distDir, script)}`
    };

    if (!hooksConfig.hooks[event]) {
      hooksConfig.hooks[event] = [hookEntry];
    } else if (Array.isArray(hooksConfig.hooks[event])) {
      // Rimuovi hook kiro-memory precedenti, aggiungi il nuovo
      hooksConfig.hooks[event] = hooksConfig.hooks[event].filter(
        (h: any) => !h.command?.includes('kiro-memory') && !h.command?.includes('contextkit')
      );
      hooksConfig.hooks[event].push(hookEntry);
    }
  }

  writeFileSync(hooksPath, JSON.stringify(hooksConfig, null, 2), 'utf8');
  console.log(`  → Hooks config: ${hooksPath}`);

  // --- mcp.json ---
  const mcpPath = join(cursorDir, 'mcp.json');
  let mcpConfig: any = {};

  if (existsSync(mcpPath)) {
    try {
      mcpConfig = JSON.parse(readFileSync(mcpPath, 'utf8'));
    } catch {
      // File corrotto
    }
  }

  if (!mcpConfig.mcpServers) mcpConfig.mcpServers = {};

  mcpConfig.mcpServers['kiro-memory'] = {
    command: 'node',
    args: [join(distDir, 'servers', 'mcp-server.js')]
  };

  writeFileSync(mcpPath, JSON.stringify(mcpConfig, null, 2), 'utf8');
  console.log(`  → MCP config:   ${mcpPath}`);
  console.log(`  → Data dir:     ${dataDir}`);

  // 3. Banner finale
  console.log('\n[3/3] Done!\n');
  printBanner({
    editor: 'Cursor',
    version: PKG_VERSION,
    dashboardUrl: 'http://localhost:3001',
    dataDir,
    configPaths: [
      `Hooks: ${hooksPath}`,
      `MCP:   ${mcpPath}`,
    ],
  });
}

// ─── Install Windsurf command ───

async function installWindsurf() {
  console.log('\n=== Kiro Memory - Windsurf Installation ===\n');
  console.log('[1/3] Running environment checks...');

  const checks = runEnvironmentChecks();
  const { hasErrors } = printChecks(checks);

  if (hasErrors) {
    const { fixed, needsRestart } = await tryAutoFix(checks);

    if (needsRestart) {
      console.log('  \x1b[33mRestart your terminal and re-run: kiro-memory install --windsurf\x1b[0m\n');
      process.exit(0);
    }

    if (fixed) {
      console.log('  Re-running checks...\n');
      const reChecks = runEnvironmentChecks();
      const reResult = printChecks(reChecks);
      if (reResult.hasErrors) {
        console.log('\x1b[31mInstallation aborted.\x1b[0m Fix the remaining issues and retry.\n');
        process.exit(1);
      }
    } else if (hasErrors) {
      console.log('\x1b[31mInstallation aborted.\x1b[0m Fix the issues and retry.\n');
      process.exit(1);
    }
  }

  const distDir = DIST_DIR;
  const dataDir = process.env.KIRO_MEMORY_DATA_DIR || process.env.CONTEXTKIT_DATA_DIR || join(homedir(), '.kiro-memory');

  console.log('[2/3] Installing Windsurf configuration...\n');

  mkdirSync(dataDir, { recursive: true });

  // --- mcp_config.json ---
  const windsurfDir = join(homedir(), '.codeium', 'windsurf');
  mkdirSync(windsurfDir, { recursive: true });

  const mcpPath = join(windsurfDir, 'mcp_config.json');
  let mcpConfig: any = {};

  if (existsSync(mcpPath)) {
    try {
      mcpConfig = JSON.parse(readFileSync(mcpPath, 'utf8'));
    } catch {
      // File corrotto, lo ricreiamo
    }
  }

  if (!mcpConfig.mcpServers) mcpConfig.mcpServers = {};

  mcpConfig.mcpServers['kiro-memory'] = {
    command: 'node',
    args: [join(distDir, 'servers', 'mcp-server.js')]
  };

  writeFileSync(mcpPath, JSON.stringify(mcpConfig, null, 2), 'utf8');
  console.log(`  → MCP config:   ${mcpPath}`);
  console.log(`  → Data dir:     ${dataDir}`);

  // 3. Banner finale
  console.log('\n[3/3] Done!\n');
  printBanner({
    editor: 'Windsurf',
    version: PKG_VERSION,
    dashboardUrl: 'http://localhost:3001',
    dataDir,
    configPaths: [
      `MCP: ${mcpPath}`,
    ],
  });
  console.log('  \x1b[2mTip: Add a .windsurfrules file to your project with instructions');
  console.log('  to use the kiro-memory MCP tools for persistent context.\x1b[0m\n');
}

// ─── Install Cline command ───

async function installCline() {
  console.log('\n=== Kiro Memory - Cline Installation ===\n');
  console.log('[1/3] Running environment checks...');

  const checks = runEnvironmentChecks();
  const { hasErrors } = printChecks(checks);

  if (hasErrors) {
    const { fixed, needsRestart } = await tryAutoFix(checks);

    if (needsRestart) {
      console.log('  \x1b[33mRestart your terminal and re-run: kiro-memory install --cline\x1b[0m\n');
      process.exit(0);
    }

    if (fixed) {
      console.log('  Re-running checks...\n');
      const reChecks = runEnvironmentChecks();
      const reResult = printChecks(reChecks);
      if (reResult.hasErrors) {
        console.log('\x1b[31mInstallation aborted.\x1b[0m Fix the remaining issues and retry.\n');
        process.exit(1);
      }
    } else if (hasErrors) {
      console.log('\x1b[31mInstallation aborted.\x1b[0m Fix the issues and retry.\n');
      process.exit(1);
    }
  }

  const distDir = DIST_DIR;
  const dataDir = process.env.KIRO_MEMORY_DATA_DIR || process.env.CONTEXTKIT_DATA_DIR || join(homedir(), '.kiro-memory');

  console.log('[2/3] Installing Cline configuration...\n');

  mkdirSync(dataDir, { recursive: true });

  // --- cline_mcp_settings.json (path OS-dependent) ---
  const platform = process.platform;
  let clineSettingsDir: string;
  if (platform === 'darwin') {
    clineSettingsDir = join(homedir(), 'Library', 'Application Support', 'Code', 'User', 'globalStorage', 'saoudrizwan.claude-dev', 'settings');
  } else {
    // Linux e WSL
    clineSettingsDir = join(homedir(), '.config', 'Code', 'User', 'globalStorage', 'saoudrizwan.claude-dev', 'settings');
  }

  mkdirSync(clineSettingsDir, { recursive: true });

  const mcpPath = join(clineSettingsDir, 'cline_mcp_settings.json');
  let mcpConfig: any = {};

  if (existsSync(mcpPath)) {
    try {
      mcpConfig = JSON.parse(readFileSync(mcpPath, 'utf8'));
    } catch {
      // File corrotto, lo ricreiamo
    }
  }

  if (!mcpConfig.mcpServers) mcpConfig.mcpServers = {};

  mcpConfig.mcpServers['kiro-memory'] = {
    command: 'node',
    args: [join(distDir, 'servers', 'mcp-server.js')]
  };

  writeFileSync(mcpPath, JSON.stringify(mcpConfig, null, 2), 'utf8');
  console.log(`  → MCP config:   ${mcpPath}`);
  console.log(`  → Data dir:     ${dataDir}`);

  // 3. Banner finale
  console.log('\n[3/3] Done!\n');
  printBanner({
    editor: 'Cline',
    version: PKG_VERSION,
    dashboardUrl: 'http://localhost:3001',
    dataDir,
    configPaths: [
      `MCP: ${mcpPath}`,
    ],
  });
  console.log('  \x1b[2mTip: Add a .clinerules file to your project with instructions');
  console.log('  to use the kiro-memory MCP tools for persistent context.\x1b[0m\n');
}

// ─── Doctor command ───

async function runDoctor() {
  console.log('\n=== Kiro Memory - Diagnostics ===');

  const checks = runEnvironmentChecks();

  // Additional checks on installation status
  const kiroDir = process.env.KIRO_CONFIG_DIR || join(homedir(), '.kiro');
  const agentPath = join(kiroDir, 'agents', 'kiro-memory.json');
  const mcpPath = join(kiroDir, 'settings', 'mcp.json');
  const dataDir = process.env.KIRO_MEMORY_DATA_DIR || process.env.CONTEXTKIT_DATA_DIR || join(homedir(), '.contextkit');

  checks.push({
    name: 'Kiro agent config',
    ok: existsSync(agentPath),
    message: existsSync(agentPath) ? agentPath : 'Not found',
    fix: !existsSync(agentPath) ? 'Run: kiro-memory install' : undefined,
  });

  let mcpOk = false;
  if (existsSync(mcpPath)) {
    try {
      const mcp = JSON.parse(readFileSync(mcpPath, 'utf8'));
      mcpOk = !!mcp.mcpServers?.['kiro-memory'] || !!mcp.mcpServers?.contextkit;
    } catch {}
  }
  checks.push({
    name: 'MCP server configured',
    ok: mcpOk,
    message: mcpOk ? 'kiro-memory registered in mcp.json' : 'Not configured',
    fix: !mcpOk ? 'Run: kiro-memory install' : undefined,
  });

  checks.push({
    name: 'Data directory',
    ok: existsSync(dataDir),
    message: existsSync(dataDir) ? dataDir : 'Not created (will be created on first use)',
  });

  // Claude Code integration check
  const claudeDir = join(homedir(), '.claude');
  const claudeSettingsPath = join(claudeDir, 'settings.json');
  let claudeHooksOk = false;
  if (existsSync(claudeSettingsPath)) {
    try {
      const claudeSettings = JSON.parse(readFileSync(claudeSettingsPath, 'utf8'));
      // Claude Code: eventi sono chiavi top-level in settings.json (no wrapper "hooks")
      claudeHooksOk = !!(claudeSettings?.SessionStart || claudeSettings?.PostToolUse);
      // Verifica che i hook puntino a kiro-memory
      if (claudeHooksOk) {
        const allSettings = JSON.stringify(claudeSettings);
        claudeHooksOk = allSettings.includes('kiro-memory') || allSettings.includes('agentSpawn');
      }
    } catch {}
  }

  const claudeMcpPath = join(homedir(), '.mcp.json');
  let claudeMcpOk = false;
  if (existsSync(claudeMcpPath)) {
    try {
      const claudeMcp = JSON.parse(readFileSync(claudeMcpPath, 'utf8'));
      claudeMcpOk = !!claudeMcp.mcpServers?.['kiro-memory'];
    } catch {}
  }

  checks.push({
    name: 'Claude Code hooks',
    ok: true, // Non-blocking: installazione opzionale
    message: claudeHooksOk
      ? 'Configured in ~/.claude/settings.json'
      : 'Not configured (optional: run kiro-memory install --claude-code)',
  });

  checks.push({
    name: 'Claude Code MCP',
    ok: true, // Non-blocking: installazione opzionale
    message: claudeMcpOk
      ? 'kiro-memory registered in ~/.mcp.json'
      : 'Not configured (optional: run kiro-memory install --claude-code)',
  });

  // Cursor integration check
  const cursorDir = join(homedir(), '.cursor');
  const cursorHooksPath = join(cursorDir, 'hooks.json');
  let cursorHooksOk = false;
  if (existsSync(cursorHooksPath)) {
    try {
      const cursorHooks = JSON.parse(readFileSync(cursorHooksPath, 'utf8'));
      cursorHooksOk = !!(cursorHooks.hooks?.sessionStart || cursorHooks.hooks?.afterFileEdit);
      if (cursorHooksOk) {
        const allHooks = JSON.stringify(cursorHooks.hooks);
        cursorHooksOk = allHooks.includes('kiro-memory') || allHooks.includes('agentSpawn');
      }
    } catch {}
  }

  const cursorMcpPath = join(cursorDir, 'mcp.json');
  let cursorMcpOk = false;
  if (existsSync(cursorMcpPath)) {
    try {
      const cursorMcp = JSON.parse(readFileSync(cursorMcpPath, 'utf8'));
      cursorMcpOk = !!cursorMcp.mcpServers?.['kiro-memory'];
    } catch {}
  }

  checks.push({
    name: 'Cursor hooks',
    ok: true, // Non-blocking: installazione opzionale
    message: cursorHooksOk
      ? 'Configured in ~/.cursor/hooks.json'
      : 'Not configured (optional: run kiro-memory install --cursor)',
  });

  checks.push({
    name: 'Cursor MCP',
    ok: true, // Non-blocking: installazione opzionale
    message: cursorMcpOk
      ? 'kiro-memory registered in ~/.cursor/mcp.json'
      : 'Not configured (optional: run kiro-memory install --cursor)',
  });

  // Windsurf integration check
  const windsurfMcpPath = join(homedir(), '.codeium', 'windsurf', 'mcp_config.json');
  let windsurfMcpOk = false;
  if (existsSync(windsurfMcpPath)) {
    try {
      const windsurfMcp = JSON.parse(readFileSync(windsurfMcpPath, 'utf8'));
      windsurfMcpOk = !!windsurfMcp.mcpServers?.['kiro-memory'];
    } catch {}
  }

  checks.push({
    name: 'Windsurf MCP',
    ok: true, // Non-blocking: installazione opzionale
    message: windsurfMcpOk
      ? 'kiro-memory registered in ~/.codeium/windsurf/mcp_config.json'
      : 'Not configured (optional: run kiro-memory install --windsurf)',
  });

  // Cline integration check
  const clinePlatform = process.platform;
  let clineSettingsBase: string;
  if (clinePlatform === 'darwin') {
    clineSettingsBase = join(homedir(), 'Library', 'Application Support', 'Code', 'User', 'globalStorage', 'saoudrizwan.claude-dev', 'settings');
  } else {
    clineSettingsBase = join(homedir(), '.config', 'Code', 'User', 'globalStorage', 'saoudrizwan.claude-dev', 'settings');
  }
  const clineMcpPath = join(clineSettingsBase, 'cline_mcp_settings.json');
  let clineMcpOk = false;
  if (existsSync(clineMcpPath)) {
    try {
      const clineMcp = JSON.parse(readFileSync(clineMcpPath, 'utf8'));
      clineMcpOk = !!clineMcp.mcpServers?.['kiro-memory'];
    } catch {}
  }

  checks.push({
    name: 'Cline MCP',
    ok: true, // Non-blocking: installazione opzionale
    message: clineMcpOk
      ? `kiro-memory registered in cline_mcp_settings.json`
      : 'Not configured (optional: run kiro-memory install --cline)',
  });

  // Worker status check (informational, non-blocking)
  let workerOk = false;
  try {
    const port = process.env.KIRO_MEMORY_WORKER_PORT || '3001';
    execSync(`curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:${port}/health`, {
      timeout: 2000,
      encoding: 'utf8'
    });
    workerOk = true;
  } catch {}
  checks.push({
    name: 'Worker service',
    ok: true,  // Non-blocking: starts automatically with Kiro
    message: workerOk ? 'Running on port 3001' : 'Not running (starts automatically with Kiro)',
  });

  const { hasErrors } = printChecks(checks);

  if (hasErrors) {
    console.log('Some checks failed. Fix the issues listed above.\n');
    process.exit(1);
  } else {
    console.log('All good! Kiro Memory is ready.\n');
  }
}

// ─── Main ───

async function main() {
  // Comandi che non richiedono database
  if (command === 'install') {
    if (args.includes('--claude-code')) {
      await installClaudeCode();
    } else if (args.includes('--cursor')) {
      await installCursor();
    } else if (args.includes('--windsurf')) {
      await installWindsurf();
    } else if (args.includes('--cline')) {
      await installCline();
    } else {
      await installKiro();
    }
    return;
  }
  if (command === 'doctor') {
    await runDoctor();
    return;
  }

  const sdk = createKiroMemory();

  try {
    switch (command) {
      case 'context':
      case 'ctx':
        await showContext(sdk);
        break;

      case 'search':
        await searchContext(sdk, args[1]);
        break;

      case 'observations':
      case 'obs':
        await showObservations(sdk, parseInt(args[1]) || 10);
        break;

      case 'summaries':
      case 'sum':
        await showSummaries(sdk, parseInt(args[1]) || 5);
        break;

      case 'add-observation':
      case 'add-obs':
        await addObservation(sdk, args[1], args.slice(2).join(' '));
        break;

      case 'add-summary':
      case 'add-sum':
        await addSummary(sdk, args.slice(1).join(' '));
        break;

      case 'add-knowledge':
      case 'add-k':
        await addKnowledge(sdk, args[1], args[2], args.slice(3).join(' '));
        break;

      case 'decay':
        await handleDecay(sdk, args[1]);
        break;

      case 'embeddings':
      case 'emb':
        await handleEmbeddings(sdk, args[1]);
        break;

      case 'semantic-search':
      case 'sem':
        await semanticSearchCli(sdk, args[1]);
        break;

      case 'resume':
        await resumeSession(sdk, args[1] ? parseInt(args[1]) : undefined);
        break;

      case 'report':
        await generateReportCli(sdk, args.slice(1));
        break;

      case 'help':
      case '--help':
      case '-h':
        showHelp();
        break;

      default:
        console.log('Kiro Memory CLI\n');
        showHelp();
        process.exit(1);
    }
  } finally {
    sdk.close();
  }
}

async function showContext(sdk: ReturnType<typeof createKiroMemory>) {
  const context = await sdk.getContext();
  
  console.log(`\n📁 Project: ${context.project}\n`);
  
  console.log('📝 Recent Observations:');
  context.relevantObservations.slice(0, 5).forEach((obs, i) => {
    console.log(`  ${i + 1}. ${obs.title} (${new Date(obs.created_at).toLocaleDateString()})`);
    if (obs.text) {
      console.log(`     ${obs.text.substring(0, 100)}${obs.text.length > 100 ? '...' : ''}`);
    }
  });
  
  console.log('\n📊 Recent Summaries:');
  context.relevantSummaries.slice(0, 3).forEach((sum, i) => {
    console.log(`  ${i + 1}. ${sum.request || 'No request'} (${new Date(sum.created_at).toLocaleDateString()})`);
    if (sum.learned) {
      console.log(`     Learned: ${sum.learned.substring(0, 100)}${sum.learned.length > 100 ? '...' : ''}`);
    }
  });
  
  console.log('');
}

async function searchContext(sdk: ReturnType<typeof createKiroMemory>, query: string) {
  if (!query) {
    console.error('Error: Please provide a search query');
    process.exit(1);
  }
  
  const results = await sdk.search(query);
  
  console.log(`\n🔍 Search results for: "${query}"\n`);
  
  if (results.observations.length > 0) {
    console.log(`📋 Observations (${results.observations.length}):`);
    results.observations.forEach((obs, i) => {
      console.log(`  ${i + 1}. ${obs.title}`);
      if (obs.text) {
        console.log(`     ${obs.text.substring(0, 150)}${obs.text.length > 150 ? '...' : ''}`);
      }
    });
  }
  
  if (results.summaries.length > 0) {
    console.log(`\n📊 Summaries (${results.summaries.length}):`);
    results.summaries.forEach((sum, i) => {
      console.log(`  ${i + 1}. ${sum.request || 'No request'}`);
      if (sum.learned) {
        console.log(`     ${sum.learned.substring(0, 150)}${sum.learned.length > 150 ? '...' : ''}`);
      }
    });
  }
  
  if (results.observations.length === 0 && results.summaries.length === 0) {
    console.log('No results found.\n');
  } else {
    console.log('');
  }
}

async function showObservations(sdk: ReturnType<typeof createKiroMemory>, limit: number) {
  const observations = await sdk.getRecentObservations(limit);
  
  console.log(`\n📋 Last ${limit} Observations:\n`);
  
  observations.forEach((obs, i) => {
    console.log(`${i + 1}. ${obs.title} [${obs.type}]`);
    console.log(`   Date: ${new Date(obs.created_at).toLocaleString()}`);
    if (obs.text) {
      console.log(`   Content: ${obs.text.substring(0, 200)}${obs.text.length > 200 ? '...' : ''}`);
    }
    console.log('');
  });
}

async function showSummaries(sdk: ReturnType<typeof createKiroMemory>, limit: number) {
  const summaries = await sdk.getRecentSummaries(limit);
  
  console.log(`\n📊 Last ${limit} Summaries:\n`);
  
  summaries.forEach((sum, i) => {
    console.log(`${i + 1}. ${sum.request || 'No request'}`);
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
    console.log('');
  });
}

async function addObservation(
  sdk: ReturnType<typeof createKiroMemory>,
  title: string,
  content: string
) {
  if (!title || !content) {
    console.error('Error: Please provide both title and content');
    process.exit(1);
  }
  
  const id = await sdk.storeObservation({
    type: 'manual',
    title,
    content
  });
  
  console.log(`✅ Observation stored with ID: ${id}\n`);
}

async function addSummary(sdk: ReturnType<typeof createKiroMemory>, content: string) {
  if (!content) {
    console.error('Error: Please provide summary content');
    process.exit(1);
  }
  
  const id = await sdk.storeSummary({
    learned: content
  });
  
  console.log(`✅ Summary stored with ID: ${id}\n`);
}

async function addKnowledge(
  sdk: ReturnType<typeof createKiroMemory>,
  knowledgeType: string,
  title: string,
  content: string
) {
  const validTypes = ['constraint', 'decision', 'heuristic', 'rejected'];
  if (!knowledgeType || !validTypes.includes(knowledgeType)) {
    console.error(`Error: knowledge type must be one of: ${validTypes.join(', ')}`);
    process.exit(1);
  }
  if (!title) {
    console.error('Error: title is required');
    process.exit(1);
  }
  if (!content) {
    console.error('Error: content is required');
    process.exit(1);
  }

  // Parse opzioni dal CLI
  const severity = args.find(a => a.startsWith('--severity='))?.split('=')[1] as 'hard' | 'soft' | undefined;
  const alternativesRaw = args.find(a => a.startsWith('--alternatives='))?.split('=')[1];
  const alternatives = alternativesRaw ? alternativesRaw.split(',').map(s => s.trim()) : undefined;
  const reason = args.find(a => a.startsWith('--reason='))?.split('=')[1];
  const context = args.find(a => a.startsWith('--context='))?.split('=')[1];
  const confidence = args.find(a => a.startsWith('--confidence='))?.split('=')[1] as 'high' | 'medium' | 'low' | undefined;
  const conceptsRaw = args.find(a => a.startsWith('--concepts='))?.split('=')[1];
  const concepts = conceptsRaw ? conceptsRaw.split(',').map(s => s.trim()) : undefined;
  const filesRaw = args.find(a => a.startsWith('--files='))?.split('=')[1];
  const files = filesRaw ? filesRaw.split(',').map(s => s.trim()) : undefined;

  // Rimuovi opzioni dal content (le opzioni --key=val non fanno parte del contenuto)
  const cleanContent = content.split(' ').filter(w => !w.startsWith('--')).join(' ');

  const id = await sdk.storeKnowledge({
    project: sdk.getProject(),
    knowledgeType: knowledgeType as any,
    title,
    content: cleanContent || content,
    concepts,
    files,
    metadata: { severity, alternatives, reason, context, confidence }
  });

  console.log(`\nKnowledge stored successfully.`);
  console.log(`  ID:   ${id}`);
  console.log(`  Type: ${knowledgeType}`);
  console.log(`  Title: ${title}\n`);
}

async function handleEmbeddings(sdk: ReturnType<typeof createKiroMemory>, subcommand: string) {
  switch (subcommand) {
    case 'stats': {
      const stats = sdk.getEmbeddingStats();
      console.log('\nEmbedding Statistics:\n');
      console.log(`  Total observations:  ${stats.total}`);
      console.log(`  With embeddings:     ${stats.embedded}`);
      console.log(`  Coverage:            ${stats.percentage}%`);

      // Inizializza per mostrare info provider
      await sdk.initializeEmbeddings();
      const { getEmbeddingService } = await import('../services/search/EmbeddingService.js');
      const embService = getEmbeddingService();
      console.log(`  Provider:            ${embService.getProvider() || 'none'}`);
      console.log(`  Dimensions:          ${embService.getDimensions()}`);
      console.log(`  Available:           ${embService.isAvailable() ? 'yes' : 'no'}`);

      if (stats.percentage < 100 && stats.total > 0) {
        console.log(`\n  Run 'kiro-memory embeddings backfill' to generate missing embeddings.`);
      }
      console.log('');
      break;
    }
    case 'backfill': {
      const batchSize = parseInt(args[2]) || 50;
      console.log(`\nGenerating embeddings (batch size: ${batchSize})...\n`);

      // Inizializza embedding service
      const available = await sdk.initializeEmbeddings();
      if (!available) {
        console.log('  No embedding provider available.');
        console.log('  Install fastembed or @huggingface/transformers:');
        console.log('    npm install fastembed');
        console.log('    npm install @huggingface/transformers\n');
        process.exit(1);
      }

      const count = await sdk.backfillEmbeddings(batchSize);
      console.log(`  Generated ${count} embeddings.\n`);

      const stats = sdk.getEmbeddingStats();
      console.log(`  Coverage: ${stats.embedded}/${stats.total} (${stats.percentage}%)\n`);
      break;
    }
    default:
      console.log('\nUsage: kiro-memory embeddings <subcommand>\n');
      console.log('Subcommands:');
      console.log('  stats              Show embedding statistics');
      console.log('  backfill [size]    Generate embeddings for observations without them (default: 50)\n');
  }
}

async function semanticSearchCli(sdk: ReturnType<typeof createKiroMemory>, query: string) {
  if (!query) {
    console.error('Error: Please provide a search query');
    process.exit(1);
  }

  console.log(`\nSemantic search: "${query}"...\n`);

  // Inizializza embedding service
  await sdk.initializeEmbeddings();

  const results = await sdk.hybridSearch(query, { limit: 10 });

  if (results.length === 0) {
    console.log('No results found.\n');
    return;
  }

  console.log(`Found ${results.length} results:\n`);
  results.forEach((r, i) => {
    const scorePercent = Math.round(r.score * 100);
    console.log(`  ${i + 1}. [${r.source}] ${r.title} (score: ${scorePercent}%)`);
    if (r.content) {
      console.log(`     ${r.content.substring(0, 150)}${r.content.length > 150 ? '...' : ''}`);
    }
    console.log('');
  });
}

async function handleDecay(sdk: ReturnType<typeof createKiroMemory>, subcommand: string) {
  switch (subcommand) {
    case 'stats': {
      const stats = await sdk.getDecayStats();
      console.log('\nDecay Statistics:\n');
      console.log(`  Total observations:    ${stats.total}`);
      console.log(`  Stale (file changed):  ${stats.stale}`);
      console.log(`  Never accessed:        ${stats.neverAccessed}`);
      console.log(`  Recently accessed:     ${stats.recentlyAccessed} (last 48h)`);

      if (stats.total > 0) {
        const freshPercent = Math.round(((stats.total - stats.stale) / stats.total) * 100);
        console.log(`  Freshness:             ${freshPercent}%`);
      }
      console.log('');
      break;
    }
    case 'detect-stale': {
      console.log('\nDetecting stale observations...\n');
      const count = await sdk.detectStaleObservations();
      if (count > 0) {
        console.log(`  Found and marked ${count} stale observation(s).`);
        console.log(`  These observations reference files that have been modified since they were recorded.\n`);
      } else {
        console.log('  No stale observations found. All observations are fresh.\n');
      }
      break;
    }
    case 'consolidate': {
      const dryRun = args.includes('--dry-run');
      console.log(`\n${dryRun ? '[DRY RUN] ' : ''}Consolidating duplicate observations...\n`);
      const result = await sdk.consolidateObservations({ dryRun });
      if (result.merged > 0) {
        console.log(`  Merged ${result.merged} group(s), removed ${result.removed} duplicate(s).`);
        if (dryRun) {
          console.log(`  (Dry run: no changes were made. Remove --dry-run to apply.)`);
        }
      } else {
        console.log('  No duplicate observations found to consolidate.');
      }
      console.log('');
      break;
    }
    default:
      console.log('\nUsage: kiro-memory decay <subcommand>\n');
      console.log('Subcommands:');
      console.log('  stats                Show decay statistics (stale, never accessed, etc.)');
      console.log('  detect-stale         Detect and mark stale observations (files changed)');
      console.log('  consolidate [--dry-run]  Consolidate duplicate observations\n');
  }
}

async function generateReportCli(sdk: ReturnType<typeof createKiroMemory>, cliArgs: string[]) {
  // Parse opzioni
  const periodArg = cliArgs.find(a => a.startsWith('--period='))?.split('=')[1];
  const formatArg = cliArgs.find(a => a.startsWith('--format='))?.split('=')[1];
  const outputArg = cliArgs.find(a => a.startsWith('--output='))?.split('=')[1];

  const period = (periodArg === 'monthly' ? 'monthly' : 'weekly') as 'weekly' | 'monthly';
  const format = formatArg === 'md' || formatArg === 'markdown' ? 'markdown'
    : formatArg === 'json' ? 'json'
    : 'text';

  const data = await sdk.generateReport({ period });

  let output: string;
  switch (format) {
    case 'markdown':
      output = formatReportMarkdown(data);
      break;
    case 'json':
      output = formatReportJson(data);
      break;
    default:
      output = formatReportText(data);
  }

  if (outputArg) {
    writeFileSync(outputArg, output, 'utf8');
    console.log(`\n  Report saved to: ${outputArg}\n`);
  } else {
    console.log(output);
  }
}

async function resumeSession(sdk: ReturnType<typeof createKiroMemory>, sessionId?: number) {
  const checkpoint = sessionId
    ? await sdk.getCheckpoint(sessionId)
    : await sdk.getLatestProjectCheckpoint();

  if (!checkpoint) {
    console.log('\n  No checkpoint found.');
    if (sessionId) {
      console.log(`  Session ${sessionId} has no checkpoint.`);
    } else {
      console.log(`  No recent checkpoints for project "${sdk.getProject()}".`);
    }
    console.log('  Checkpoints are created automatically at the end of each session.\n');
    return;
  }

  // Intestazione con colori ANSI
  console.log('');
  console.log(`  \x1b[36m═══ Session Checkpoint ═══\x1b[0m`);
  console.log(`  \x1b[2mProject: ${checkpoint.project} | Session: ${checkpoint.session_id}\x1b[0m`);
  console.log(`  \x1b[2m${new Date(checkpoint.created_at).toLocaleString()}\x1b[0m`);
  console.log('');

  // Task
  console.log(`  \x1b[1mTask:\x1b[0m ${checkpoint.task}`);

  // Progress
  if (checkpoint.progress) {
    console.log(`  \x1b[1mProgress:\x1b[0m ${checkpoint.progress}`);
  }

  // Next steps
  if (checkpoint.next_steps) {
    console.log(`  \x1b[1mNext Steps:\x1b[0m ${checkpoint.next_steps}`);
  }

  // Open questions
  if (checkpoint.open_questions) {
    console.log(`  \x1b[1mOpen Questions:\x1b[0m ${checkpoint.open_questions}`);
  }

  // Relevant files
  if (checkpoint.relevant_files) {
    console.log(`  \x1b[1mRelevant Files:\x1b[0m`);
    const files = checkpoint.relevant_files.split(',').map(f => f.trim());
    files.forEach(f => {
      console.log(`    - ${f}`);
    });
  }

  console.log('');
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

Commands:
  context, ctx              Show current project context
  resume [session-id]       Resume previous session (shows checkpoint)
  report [options]          Generate activity report
    --period=weekly|monthly   Time period (default: weekly)
    --format=text|md|json     Output format (default: text)
    --output=<file>           Write to file instead of stdout
  search <query>            Search across all context (keyword FTS5)
  semantic-search <query>   Hybrid search: vector + keyword (semantic)
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
  help                      Show this help message

Examples:
  kiro-memory install
  kiro-memory doctor
  kiro-memory context
  kiro-memory resume
  kiro-memory resume 42
  kiro-memory report
  kiro-memory report --period=monthly --format=md --output=report.md
  kiro-memory search "authentication"
  kiro-memory semantic-search "how did I fix the auth bug"
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
