/**
 * Kiro Memory CLI - Interfaccia a riga di comando
 * (shebang aggiunto automaticamente dal build)
 */

import { createContextKit } from '../sdk/index.js';
import { execSync } from 'child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync } from 'fs';
import { join, dirname } from 'path';
import { homedir, platform, release } from 'os';
import { fileURLToPath } from 'url';

const args = process.argv.slice(2);
const command = args[0];

// Rileva il path di dist dal file corrente (bundled da esbuild)
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
// __dirname = .../plugin/dist/cli → risali per ottenere plugin/dist
const DIST_DIR = dirname(__dirname);
// Risali per ottenere la root del progetto (plugin/dist → plugin → root)
const PROJECT_ROOT = dirname(dirname(DIST_DIR));

// ─── Utilità diagnostica ambiente ───

interface CheckResult {
  name: string;
  ok: boolean;
  message: string;
  fix?: string;
}

/** Rileva se siamo in WSL */
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

/** Verifica se un comando è disponibile nel PATH */
function commandExists(cmd: string): boolean {
  try {
    execSync(`which ${cmd}`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/** Esegue tutti i check di ambiente e restituisce i risultati */
function runEnvironmentChecks(): CheckResult[] {
  const checks: CheckResult[] = [];
  const wsl = isWSL();

  // 1. OS detection
  const os = platform();
  checks.push({
    name: 'Sistema operativo',
    ok: os === 'linux' || os === 'darwin',
    message: os === 'linux'
      ? (wsl ? 'Linux (WSL)' : 'Linux')
      : os === 'darwin' ? 'macOS' : `${os} (non supportato ufficialmente)`,
  });

  // 2. WSL: Node non deve essere quello Windows (/mnt/c/)
  if (wsl) {
    const nodePath = process.execPath;
    const nodeOnWindows = nodePath.startsWith('/mnt/c') || nodePath.startsWith('/mnt/d');
    checks.push({
      name: 'WSL: Node.js nativo',
      ok: !nodeOnWindows,
      message: nodeOnWindows
        ? `Node.js punta a Windows: ${nodePath}`
        : `Node.js nativo Linux: ${nodePath}`,
      fix: nodeOnWindows
        ? 'Installa Node.js dentro WSL:\n  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -\n  sudo apt-get install -y nodejs\n  Oppure usa nvm: https://github.com/nvm-sh/nvm'
        : undefined,
    });

    // 3. WSL: npm prefix non deve puntare a Windows
    try {
      const npmPrefix = execSync('npm prefix -g', { encoding: 'utf8' }).trim();
      const prefixOnWindows = npmPrefix.startsWith('/mnt/c') || npmPrefix.startsWith('/mnt/d');
      checks.push({
        name: 'WSL: npm global prefix',
        ok: !prefixOnWindows,
        message: prefixOnWindows
          ? `npm global prefix punta a Windows: ${npmPrefix}`
          : `npm global prefix: ${npmPrefix}`,
        fix: prefixOnWindows
          ? 'Correggi il prefix npm:\n  mkdir -p ~/.npm-global\n  npm config set prefix ~/.npm-global\n  echo \'export PATH="$HOME/.npm-global/bin:$PATH"\' >> ~/.bashrc\n  source ~/.bashrc\n  Poi reinstalla: npm install -g kiro-memory'
          : undefined,
      });
    } catch {
      checks.push({
        name: 'WSL: npm global prefix',
        ok: false,
        message: 'Impossibile determinare npm prefix',
      });
    }
  }

  // 4. Node.js >= 18
  const nodeVersion = parseInt(process.versions.node.split('.')[0]);
  checks.push({
    name: 'Node.js >= 18',
    ok: nodeVersion >= 18,
    message: `Node.js v${process.versions.node}`,
    fix: nodeVersion < 18
      ? 'Aggiorna Node.js:\n  nvm install 22 && nvm use 22\n  Oppure: https://nodejs.org/'
      : undefined,
  });

  // 5. better-sqlite3 caricabile
  let sqliteOk = false;
  let sqliteMsg = '';
  try {
    require('better-sqlite3');
    sqliteOk = true;
    sqliteMsg = 'Modulo nativo caricato correttamente';
  } catch (err: any) {
    sqliteMsg = err.code === 'ERR_DLOPEN_FAILED'
      ? 'Binario nativo incompatibile (ELF header invalido — probabile mismatch piattaforma)'
      : `Errore: ${err.message}`;
  }
  checks.push({
    name: 'better-sqlite3',
    ok: sqliteOk,
    message: sqliteMsg,
    fix: !sqliteOk
      ? (wsl
        ? 'In WSL, ricompila il modulo nativo:\n  npm rebuild better-sqlite3\n  Se non funziona, reinstalla:\n  npm install -g kiro-memory --build-from-source'
        : 'Reinstalla il modulo nativo:\n  npm rebuild better-sqlite3')
      : undefined,
  });

  // 6. Build tools (solo Linux/WSL — servono per compilare moduli nativi)
  if (os === 'linux') {
    const hasMake = commandExists('make');
    const hasGcc = commandExists('g++') || commandExists('gcc');
    const hasPython = commandExists('python3') || commandExists('python');
    const allPresent = hasMake && hasGcc && hasPython;
    const missing: string[] = [];
    if (!hasMake || !hasGcc) missing.push('build-essential');
    if (!hasPython) missing.push('python3');

    checks.push({
      name: 'Build tools (moduli nativi)',
      ok: allPresent,
      message: allPresent
        ? 'make, g++, python3 disponibili'
        : `Mancanti: ${missing.join(', ')}`,
      fix: !allPresent
        ? `Installa i pacchetti richiesti:\n  sudo apt-get update && sudo apt-get install -y ${missing.join(' ')}\n  Poi reinstalla: npm install -g kiro-memory --build-from-source`
        : undefined,
    });
  }

  return checks;
}

/** Stampa i risultati dei check in formato leggibile */
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

// ─── Comando install ───

async function installKiro() {
  console.log('\n=== Kiro Memory - Installazione ===\n');
  console.log('[1/3] Diagnostica ambiente...');

  const checks = runEnvironmentChecks();
  const { hasErrors } = printChecks(checks);

  if (hasErrors) {
    console.log('\x1b[31mInstallazione annullata.\x1b[0m Risolvi i problemi sopra e riprova.');
    console.log('Dopo aver risolto, esegui: kiro-memory install\n');
    process.exit(1);
  }

  // Rileva la directory dist (dove sono i file compilati)
  const distDir = DIST_DIR;
  const agentTemplatePath = join(PROJECT_ROOT, 'kiro-agent', 'contextkit.json');
  const steeringSourcePath = join(PROJECT_ROOT, 'kiro-agent', 'steering.md');

  // Verifica che i file sorgente esistano
  if (!existsSync(agentTemplatePath)) {
    console.error(`\x1b[31mErrore:\x1b[0m Template agent non trovato: ${agentTemplatePath}`);
    console.error('Prova a reinstallare: npm install -g kiro-memory');
    process.exit(1);
  }

  // Directory di destinazione
  const kiroDir = process.env.KIRO_CONFIG_DIR || join(homedir(), '.kiro');
  const agentsDir = join(kiroDir, 'agents');
  const settingsDir = join(kiroDir, 'settings');
  const steeringDir = join(kiroDir, 'steering');
  const dataDir = process.env.CONTEXTKIT_DATA_DIR || join(homedir(), '.contextkit');

  console.log('[2/3] Installazione configurazione Kiro...\n');

  // Crea directory
  for (const dir of [agentsDir, settingsDir, steeringDir, dataDir]) {
    mkdirSync(dir, { recursive: true });
  }

  // Genera agent config con path assoluti
  const agentTemplate = readFileSync(agentTemplatePath, 'utf8');
  const agentConfig = agentTemplate.replace(/__CONTEXTKIT_DIST__/g, distDir);
  const agentDestPath = join(agentsDir, 'contextkit.json');
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
      // File corrotto, sovrascriviamo
    }
  }

  mcpConfig.mcpServers.contextkit = {
    command: 'node',
    args: [join(distDir, 'servers', 'mcp-server.js')]
  };
  writeFileSync(mcpFilePath, JSON.stringify(mcpConfig, null, 2), 'utf8');
  console.log(`  → MCP config:   ${mcpFilePath}`);

  // Copia steering file
  const steeringDestPath = join(steeringDir, 'contextkit.md');
  if (existsSync(steeringSourcePath)) {
    copyFileSync(steeringSourcePath, steeringDestPath);
    console.log(`  → Steering:     ${steeringDestPath}`);
  }

  console.log(`  → Data dir:     ${dataDir}`);

  // Riepilogo
  console.log('\n[3/3] Installazione completata!\n');
  console.log('Per usare Kiro con memoria persistente:');
  console.log('  kiro-cli --agent contextkit-memory\n');
  console.log('Per creare un alias permanente:');
  console.log('  echo \'alias kiro="kiro-cli --agent contextkit-memory"\' >> ~/.bashrc');
  console.log('  source ~/.bashrc\n');
  console.log('Il worker si avvia automaticamente alla prima sessione.');
  console.log(`Dashboard web: http://localhost:3001\n`);
}

// ─── Comando doctor ───

async function runDoctor() {
  console.log('\n=== Kiro Memory - Diagnostica ===');

  const checks = runEnvironmentChecks();

  // Check aggiuntivi sullo stato installazione
  const kiroDir = process.env.KIRO_CONFIG_DIR || join(homedir(), '.kiro');
  const agentPath = join(kiroDir, 'agents', 'contextkit.json');
  const mcpPath = join(kiroDir, 'settings', 'mcp.json');
  const dataDir = process.env.CONTEXTKIT_DATA_DIR || join(homedir(), '.contextkit');

  checks.push({
    name: 'Agent config Kiro',
    ok: existsSync(agentPath),
    message: existsSync(agentPath) ? agentPath : 'Non trovato',
    fix: !existsSync(agentPath) ? 'Esegui: kiro-memory install' : undefined,
  });

  let mcpOk = false;
  if (existsSync(mcpPath)) {
    try {
      const mcp = JSON.parse(readFileSync(mcpPath, 'utf8'));
      mcpOk = !!mcp.mcpServers?.contextkit;
    } catch {}
  }
  checks.push({
    name: 'MCP server configurato',
    ok: mcpOk,
    message: mcpOk ? 'contextkit registrato in mcp.json' : 'Non configurato',
    fix: !mcpOk ? 'Esegui: kiro-memory install' : undefined,
  });

  checks.push({
    name: 'Data directory',
    ok: existsSync(dataDir),
    message: existsSync(dataDir) ? dataDir : 'Non creata (verrà creata al primo uso)',
  });

  // Verifica porta worker (informativo, non bloccante)
  let workerOk = false;
  try {
    const port = process.env.KIRO_MEMORY_WORKER_PORT || '3001';
    execSync(`curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:${port}/api/health`, {
      timeout: 2000,
      encoding: 'utf8'
    });
    workerOk = true;
  } catch {}
  checks.push({
    name: 'Worker service',
    ok: true,  // Non bloccante: si avvia automaticamente
    message: workerOk ? 'Attivo su porta 3001' : 'Non in esecuzione (si avvia automaticamente con Kiro)',
  });

  const { hasErrors } = printChecks(checks);

  if (hasErrors) {
    console.log('Alcuni check sono falliti. Risolvi i problemi indicati sopra.\n');
    process.exit(1);
  } else {
    console.log('Tutto OK! Kiro Memory è pronto.\n');
  }
}

// ─── Main ───

async function main() {
  // Comandi che non richiedono database
  if (command === 'install') {
    await installKiro();
    return;
  }
  if (command === 'doctor') {
    await runDoctor();
    return;
  }

  const contextkit = createContextKit();

  try {
    switch (command) {
      case 'context':
      case 'ctx':
        await showContext(contextkit);
        break;

      case 'search':
        await searchContext(contextkit, args[1]);
        break;

      case 'observations':
      case 'obs':
        await showObservations(contextkit, parseInt(args[1]) || 10);
        break;

      case 'summaries':
      case 'sum':
        await showSummaries(contextkit, parseInt(args[1]) || 5);
        break;

      case 'add-observation':
      case 'add-obs':
        await addObservation(contextkit, args[1], args.slice(2).join(' '));
        break;

      case 'add-summary':
      case 'add-sum':
        await addSummary(contextkit, args.slice(1).join(' '));
        break;

      case 'help':
      case '--help':
      case '-h':
        showHelp();
        break;

      default:
        console.log('ContextKit CLI\n');
        showHelp();
        process.exit(1);
    }
  } finally {
    contextkit.close();
  }
}

async function showContext(contextkit: ReturnType<typeof createContextKit>) {
  const context = await contextkit.getContext();
  
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

async function searchContext(contextkit: ReturnType<typeof createContextKit>, query: string) {
  if (!query) {
    console.error('Error: Please provide a search query');
    process.exit(1);
  }
  
  const results = await contextkit.search(query);
  
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

async function showObservations(contextkit: ReturnType<typeof createContextKit>, limit: number) {
  const observations = await contextkit.getRecentObservations(limit);
  
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

async function showSummaries(contextkit: ReturnType<typeof createContextKit>, limit: number) {
  const summaries = await contextkit.getRecentSummaries(limit);
  
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
  contextkit: ReturnType<typeof createContextKit>, 
  title: string, 
  content: string
) {
  if (!title || !content) {
    console.error('Error: Please provide both title and content');
    process.exit(1);
  }
  
  const id = await contextkit.storeObservation({
    type: 'manual',
    title,
    content
  });
  
  console.log(`✅ Observation stored with ID: ${id}\n`);
}

async function addSummary(contextkit: ReturnType<typeof createContextKit>, content: string) {
  if (!content) {
    console.error('Error: Please provide summary content');
    process.exit(1);
  }
  
  const id = await contextkit.storeSummary({
    learned: content
  });
  
  console.log(`✅ Summary stored with ID: ${id}\n`);
}

function showHelp() {
  console.log(`Usage: kiro-memory <command> [options]

Setup:
  install                   Install hooks, MCP server, and agent config into Kiro CLI
  doctor                    Run environment diagnostics (checks Node, build tools, WSL, etc.)

Commands:
  context, ctx              Show current project context
  search <query>            Search across all context
  observations [limit]      Show recent observations (default: 10)
  summaries [limit]         Show recent summaries (default: 5)
  add-observation <title> <content>   Add a new observation
  add-summary <content>     Add a new summary
  help                      Show this help message

Examples:
  kiro-memory install
  kiro-memory doctor
  kiro-memory context
  kiro-memory search "authentication"
  kiro-memory observations 20
`);
}

main().catch(console.error);
