/**
 * Provider TreeView per le osservazioni Kiro Memory.
 *
 * Mostra le osservazioni recenti (filtrabili per progetto) con icone
 * differenziate per tipo (file, comando, decisione, ecc.) e tooltip
 * con il contenuto completo. Supporta paginazione e filtro progetto.
 */

import * as vscode from 'vscode';
import type { KiroMemoryClient, Observation } from '../api-client';

// ── Mappatura tipo → icona ThemeIcon ──────────────────────────────────────

const TYPE_ICONS: Record<string, string> = {
  file_write:  'file-code',
  file_read:   'file',
  command:     'terminal',
  decision:    'lightbulb',
  search:      'search',
  knowledge:   'book',
  summary:     'list-tree',
  manual:      'pencil',
  error:       'error',
  warning:     'warning',
  tool_use:    'tools',
  git:         'source-control',
  prompt:      'comment',
};

function getIconForType(type: string): vscode.ThemeIcon {
  const name = TYPE_ICONS[type] ?? 'circle-outline';
  return new vscode.ThemeIcon(name);
}

// ── Nodo TreeView osservazione ─────────────────────────────────────────────

export class ObservationTreeItem extends vscode.TreeItem {
  constructor(public readonly observation: Observation) {
    super(observation.title || '(senza titolo)', vscode.TreeItemCollapsibleState.None);

    // Tipo + progetto come descrizione secondaria
    this.description = `[${observation.type}] ${observation.project}`;

    // Tooltip con contenuto completo
    this.tooltip = this.buildTooltip();

    // Icona basata sul tipo di osservazione
    this.iconPath = getIconForType(observation.type);

    // Contesto per menu contestuale
    this.contextValue = 'kiroMemoryObservation';

    // Comando al click: apri il contenuto in un editor tab
    this.command = {
      command: 'kiroMemory.openObservation',
      title: 'Apri osservazione',
      arguments: [observation]
    };
  }

  private buildTooltip(): vscode.MarkdownString {
    const obs = this.observation;
    const md = new vscode.MarkdownString('', true);
    md.isTrusted = true;

    md.appendMarkdown(`### ${obs.title || '(senza titolo)'}\n\n`);
    md.appendMarkdown(`**Progetto**: \`${obs.project}\`  \n`);
    md.appendMarkdown(`**Tipo**: \`${obs.type}\`  \n`);
    md.appendMarkdown(`**Data**: ${new Date(obs.created_at).toLocaleString('it-IT')}  \n`);

    if (obs.file_path) {
      md.appendMarkdown(`**File**: \`${obs.file_path}\`  \n`);
    }

    if (obs.concepts) {
      md.appendMarkdown(`**Concetti**: ${obs.concepts}  \n`);
    }

    if (obs.narrative) {
      md.appendMarkdown(`\n---\n\n${obs.narrative.slice(0, 400)}${obs.narrative.length > 400 ? '…' : ''}`);
    } else if (obs.content) {
      md.appendMarkdown(`\n---\n\n\`\`\`\n${obs.content.slice(0, 400)}${obs.content.length > 400 ? '…' : ''}\n\`\`\``);
    }

    return md;
  }
}

// ── Provider principale ────────────────────────────────────────────────────

export class ObservationsProvider implements vscode.TreeDataProvider<ObservationTreeItem> {
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<ObservationTreeItem | undefined | null | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  /** Progetto attivo per il filtro (null = tutti i progetti) */
  private activeProject: string | undefined = undefined;

  /** Cache locale delle osservazioni */
  private cachedItems: ObservationTreeItem[] = [];

  private readonly maxItems: number;

  constructor(
    private readonly client: KiroMemoryClient,
    maxItems: number = 50
  ) {
    this.maxItems = maxItems;
  }

  /** Forza aggiornamento della tree view */
  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  /**
   * Imposta il filtro per progetto e aggiorna la view.
   * Chiamato dal comando kiroMemory.filterByProject.
   */
  setProjectFilter(project: string | undefined): void {
    this.activeProject = project;
    this.refresh();
  }

  /** Restituisce il progetto attualmente filtrato */
  getActiveProject(): string | undefined {
    return this.activeProject;
  }

  getTreeItem(element: ObservationTreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(_element?: ObservationTreeItem): Promise<ObservationTreeItem[]> {
    // Osservazioni non hanno figli (struttura piatta)
    if (_element) {
      return [];
    }

    if (!this.client.isConnected) {
      try {
        await this.client.getHealth();
      } catch {
        return [this.buildOfflineItem()];
      }
    }

    try {
      const observations = await this.client.getObservations(
        this.activeProject,
        this.maxItems,
        0
      );

      if (observations.length === 0) {
        return [this.buildEmptyItem()];
      }

      const items = observations.map(obs => new ObservationTreeItem(obs));
      this.cachedItems = items;
      return items;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Errore sconosciuto';
      vscode.window.showErrorMessage(`Kiro Memory: impossibile caricare le osservazioni — ${msg}`);
      return this.cachedItems.length > 0 ? this.cachedItems : [this.buildOfflineItem()];
    }
  }

  private buildOfflineItem(): ObservationTreeItem {
    const fakeObs: Observation = {
      id: -1, session_id: '', project: '', type: 'warning',
      title: 'Worker non raggiungibile',
      narrative: null, content: 'Avvia il worker con npm run dev', file_path: null,
      tool_name: null, concepts: null, files: null,
      created_at: new Date().toISOString(), created_at_epoch: Date.now(),
      discovery_tokens: 0, hash: null
    };
    const item = new ObservationTreeItem(fakeObs);
    item.command = undefined;
    return item;
  }

  private buildEmptyItem(): ObservationTreeItem {
    const fakeObs: Observation = {
      id: -1, session_id: '', project: '', type: 'info',
      title: this.activeProject
        ? `Nessuna osservazione per "${this.activeProject}"`
        : 'Nessuna osservazione',
      narrative: null, content: null, file_path: null,
      tool_name: null, concepts: null, files: null,
      created_at: new Date().toISOString(), created_at_epoch: Date.now(),
      discovery_tokens: 0, hash: null
    };
    const item = new ObservationTreeItem(fakeObs);
    item.command = undefined;
    return item;
  }
}
