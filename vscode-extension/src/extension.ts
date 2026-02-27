/**
 * Extension entry point — Kiro Memory VS Code Extension.
 *
 * Questo modulo gestisce il ciclo di vita completo dell'estensione:
 * - Attivazione (activate): registra comandi, provider TreeView, status bar
 * - Deattivazione (deactivate): pulizia risorse
 *
 * Architettura:
 *   extension.ts
 *     ├── KiroMemoryClient      (HTTP client verso worker:3001)
 *     ├── ProjectsProvider      (TreeView sidebar — Projects)
 *     ├── ObservationsProvider  (TreeView sidebar — Observations)
 *     ├── SessionsProvider      (TreeView sidebar — Sessions)
 *     ├── StatusBarItem         (barra inferiore — stato connessione)
 *     └── Comandi registrati:
 *           kiroMemory.search, showDashboard, showContext,
 *           refresh, filterByProject, openObservation
 */

import * as vscode from 'vscode';

// Providers TreeView
import { ProjectsProvider }      from './providers/projects-provider';
import { ObservationsProvider }  from './providers/observations-provider';
import { SessionsProvider }      from './providers/sessions-provider';

// Client API worker
import { KiroMemoryClient }      from './api-client';

// Comandi
import { searchCommand, openObservationInEditor } from './commands/search';
import { showDashboardCommand }                   from './commands/dashboard';
import { showContextCommand }                     from './commands/context';

// WebView
import { createDashboardPanel }                   from './views/dashboard-panel';

// ── Costanti ───────────────────────────────────────────────────────────────

const STATUS_BAR_PRIORITY = 100;
const AUTO_REFRESH_INTERVAL_DEFAULT = 30; // secondi

// ── Stato globale (pulito in deactivate) ──────────────────────────────────

let statusBarItem: vscode.StatusBarItem | undefined;
let autoRefreshTimer: NodeJS.Timer | undefined;

// ── Funzione di attivazione ────────────────────────────────────────────────

/**
 * Punto di ingresso principale. Chiamata da VS Code quando l'estensione
 * viene attivata (evento: onStartupFinished).
 */
export async function activate(context: vscode.ExtensionContext): Promise<void> {
  // Leggi configurazione iniziale
  const config = vscode.workspace.getConfiguration('kiroMemory');
  const host   = config.get<string>('workerHost', '127.0.0.1');
  const port   = config.get<number>('workerPort', 3001);
  const maxObs = config.get<number>('maxObservations', 50);

  // URL base del worker
  const workerUrl = `http://${host}:${port}`;

  // Client API
  const client = new KiroMemoryClient(host, port);

  // ── Providers TreeView ───────────────────────────────────────────────────

  const projectsProvider     = new ProjectsProvider(client);
  const observationsProvider = new ObservationsProvider(client, maxObs);
  const sessionsProvider     = new SessionsProvider(client);

  // Registra le TreeView nel sidebar Kiro Memory
  context.subscriptions.push(
    vscode.window.registerTreeDataProvider('kiroMemory.projects',     projectsProvider),
    vscode.window.registerTreeDataProvider('kiroMemory.observations', observationsProvider),
    vscode.window.registerTreeDataProvider('kiroMemory.sessions',     sessionsProvider)
  );

  // ── Status Bar ───────────────────────────────────────────────────────────

  statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    STATUS_BAR_PRIORITY
  );
  statusBarItem.command = 'kiroMemory.showDashboard';
  statusBarItem.tooltip = 'Kiro Memory — Clicca per aprire la dashboard';
  context.subscriptions.push(statusBarItem);

  // Aggiorna status bar in base allo stato connessione
  await updateStatusBar(client, statusBarItem);
  statusBarItem.show();

  // ── Auto-refresh ─────────────────────────────────────────────────────────

  const refreshIntervalSec = config.get<number>('refreshInterval', AUTO_REFRESH_INTERVAL_DEFAULT);
  startAutoRefresh(
    refreshIntervalSec,
    client,
    statusBarItem,
    [projectsProvider, observationsProvider, sessionsProvider]
  );

  // ── Registrazione comandi ────────────────────────────────────────────────

  // kiroMemory.search — Ricerca con QuickPick
  context.subscriptions.push(
    vscode.commands.registerCommand('kiroMemory.search', async () => {
      await searchCommand(client);
    })
  );

  // kiroMemory.showDashboard — Apri dashboard WebView
  context.subscriptions.push(
    vscode.commands.registerCommand('kiroMemory.showDashboard', async () => {
      await showDashboardCommand(context, workerUrl, createDashboardPanel);
    })
  );

  // kiroMemory.showContext — Mostra contesto progetto corrente
  context.subscriptions.push(
    vscode.commands.registerCommand('kiroMemory.showContext', async () => {
      await showContextCommand(client);
    })
  );

  // kiroMemory.refresh — Aggiorna tutte le tree views manualmente
  context.subscriptions.push(
    vscode.commands.registerCommand('kiroMemory.refresh', async () => {
      await updateStatusBar(client, statusBarItem!);
      projectsProvider.refresh();
      observationsProvider.refresh();
      sessionsProvider.refresh();
    })
  );

  // kiroMemory.filterByProject — Filtra Observations e Sessions per progetto
  // Chiamato internamente dai ProjectTreeItem al click
  context.subscriptions.push(
    vscode.commands.registerCommand('kiroMemory.filterByProject', (projectName: string) => {
      observationsProvider.setProjectFilter(projectName);
      sessionsProvider.setProjectFilter(projectName);

      // Mostra notifica contestuale
      vscode.window.setStatusBarMessage(
        `Kiro Memory: filtro attivo per "${projectName}"`,
        3000
      );
    })
  );

  // kiroMemory.openObservation — Apri osservazione in editor (da ObservationsProvider)
  context.subscriptions.push(
    vscode.commands.registerCommand('kiroMemory.openObservation', async (observation) => {
      await openObservationInEditor(observation);
    })
  );

  // kiroMemory.clearFilter — Rimuovi filtro progetto attivo
  context.subscriptions.push(
    vscode.commands.registerCommand('kiroMemory.clearFilter', () => {
      observationsProvider.setProjectFilter(undefined);
      sessionsProvider.setProjectFilter(undefined);
      vscode.window.setStatusBarMessage('Kiro Memory: filtro rimosso', 2000);
    })
  );

  // ── Listener impostazioni ────────────────────────────────────────────────

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (!e.affectsConfiguration('kiroMemory')) {
        return;
      }

      const newConfig = vscode.workspace.getConfiguration('kiroMemory');
      const newHost   = newConfig.get<string>('workerHost', '127.0.0.1');
      const newPort   = newConfig.get<number>('workerPort', 3001);

      // Aggiorna il client con la nuova configurazione
      client.updateConfig(newHost, newPort);

      // Riavvia auto-refresh con il nuovo intervallo
      const newInterval = newConfig.get<number>('refreshInterval', AUTO_REFRESH_INTERVAL_DEFAULT);
      stopAutoRefresh();
      startAutoRefresh(
        newInterval,
        client,
        statusBarItem!,
        [projectsProvider, observationsProvider, sessionsProvider]
      );

      // Refresh immediato dopo cambio configurazione
      vscode.commands.executeCommand('kiroMemory.refresh');
    })
  );

  // Log attivazione
  console.log('Kiro Memory: estensione attivata su', workerUrl);
}

// ── Funzione di deattivazione ──────────────────────────────────────────────

/**
 * Chiamata da VS Code quando l'estensione viene disattivata.
 * Ferma i timer e libera le risorse.
 */
export function deactivate(): void {
  stopAutoRefresh();
  statusBarItem?.dispose();
  statusBarItem = undefined;
  console.log('Kiro Memory: estensione deattivata');
}

// ── Helper: status bar ─────────────────────────────────────────────────────

/**
 * Aggiorna l'icona e il testo della status bar in base allo stato
 * di connessione al worker.
 */
async function updateStatusBar(
  client: KiroMemoryClient,
  item: vscode.StatusBarItem
): Promise<void> {
  try {
    const health = await client.getHealth();
    if (health.status === 'ok') {
      item.text     = '$(brain) Kiro Memory';
      item.color    = undefined; // Colore default VS Code
      item.tooltip  = `Kiro Memory v${health.version} — Worker attivo`;
      item.backgroundColor = undefined;
    } else {
      setStatusBarOffline(item);
    }
  } catch {
    setStatusBarOffline(item);
  }
}

function setStatusBarOffline(item: vscode.StatusBarItem): void {
  item.text            = '$(warning) Kiro Memory';
  item.color           = new vscode.ThemeColor('statusBarItem.warningForeground');
  item.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
  item.tooltip         = 'Kiro Memory — Worker non raggiungibile (porta 3001)';
}

// ── Helper: auto-refresh ───────────────────────────────────────────────────

type Refreshable = { refresh(): void };

function startAutoRefresh(
  intervalSec: number,
  client: KiroMemoryClient,
  item: vscode.StatusBarItem,
  providers: Refreshable[]
): void {
  stopAutoRefresh();

  autoRefreshTimer = setInterval(async () => {
    await updateStatusBar(client, item);
    for (const p of providers) {
      p.refresh();
    }
  }, intervalSec * 1000);
}

function stopAutoRefresh(): void {
  if (autoRefreshTimer !== undefined) {
    clearInterval(autoRefreshTimer as unknown as number);
    autoRefreshTimer = undefined;
  }
}
