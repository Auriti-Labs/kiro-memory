/**
 * Provider TreeView per i progetti Kiro Memory.
 *
 * Mostra la lista dei progetti distinti nel database, con il numero
 * di osservazioni per ognuno. Ogni nodo è cliccabile per filtrare
 * le osservazioni nella view dedicata.
 */

import * as vscode from 'vscode';
import type { KiroMemoryClient, ProjectStats } from '../api-client';

// ── Nodo TreeView progetto ─────────────────────────────────────────────────

export class ProjectTreeItem extends vscode.TreeItem {
  constructor(
    public readonly projectName: string,
    public readonly stats?: ProjectStats
  ) {
    // Etichetta: nome progetto + contatore osservazioni
    super(
      projectName,
      vscode.TreeItemCollapsibleState.None
    );

    // Descrizione inline con totale osservazioni
    this.description = stats
      ? `${stats.total_observations} obs · ${stats.total_sessions} sessioni`
      : '';

    // Tooltip dettagliato
    this.tooltip = this.buildTooltip();

    // Icona contestuale: progetto attivo vs archivio
    this.iconPath = new vscode.ThemeIcon(
      stats && stats.total_observations > 0 ? 'folder-library' : 'folder'
    );

    // Comando eseguito al click: filtra la view Observations per questo progetto
    this.command = {
      command: 'kiroMemory.filterByProject',
      title: 'Filtra per progetto',
      arguments: [projectName]
    };

    // Contesto per menu contestuale
    this.contextValue = 'kiroMemoryProject';
  }

  private buildTooltip(): vscode.MarkdownString {
    const md = new vscode.MarkdownString();
    md.appendMarkdown(`### ${this.projectName}\n\n`);

    if (this.stats) {
      md.appendMarkdown(`- **Osservazioni**: ${this.stats.total_observations}\n`);
      md.appendMarkdown(`- **Sessioni**: ${this.stats.total_sessions}\n`);
      if (this.stats.first_seen) {
        md.appendMarkdown(`- **Prima sessione**: ${new Date(this.stats.first_seen).toLocaleDateString('it-IT')}\n`);
      }
      if (this.stats.last_seen) {
        md.appendMarkdown(`- **Ultima sessione**: ${new Date(this.stats.last_seen).toLocaleDateString('it-IT')}\n`);
      }
    } else {
      md.appendMarkdown('_Dati non disponibili_');
    }

    return md;
  }
}

// ── Provider principale ────────────────────────────────────────────────────

export class ProjectsProvider implements vscode.TreeDataProvider<ProjectTreeItem> {
  /** Emitter per notificare VS Code che i dati sono cambiati */
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<ProjectTreeItem | undefined | null | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  /** Cache locale dei progetti per ridurre le chiamate API */
  private cachedProjects: ProjectTreeItem[] = [];

  constructor(private readonly client: KiroMemoryClient) {}

  /**
   * Aggiorna la tree view ricaricando i dati dal worker.
   * Chiamata da kiroMemory.refresh o da aggiornamento automatico.
   */
  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: ProjectTreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(_element?: ProjectTreeItem): Promise<ProjectTreeItem[]> {
    // I progetti non hanno figli (struttura piatta)
    if (_element) {
      return [];
    }

    // Verifica connessione prima di caricare
    if (!this.client.isConnected) {
      try {
        await this.client.getHealth();
      } catch {
        return [this.buildOfflineItem()];
      }
    }

    try {
      const projects = await this.client.getProjects();

      if (projects.length === 0) {
        return [this.buildEmptyItem()];
      }

      // Carica le statistiche per ogni progetto (in parallelo, con fallback)
      const items = await Promise.all(
        projects.map(async (name) => {
          try {
            const stats = await this.client.getStats(name);
            return new ProjectTreeItem(name, stats);
          } catch {
            // Fallback senza statistiche se la chiamata fails
            return new ProjectTreeItem(name);
          }
        })
      );

      // Ordina per numero di osservazioni decrescente
      items.sort((a, b) => {
        const aCount = a.stats?.total_observations ?? 0;
        const bCount = b.stats?.total_observations ?? 0;
        return bCount - aCount;
      });

      this.cachedProjects = items;
      return items;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Errore sconosciuto';
      vscode.window.showErrorMessage(`Kiro Memory: impossibile caricare i progetti — ${msg}`);
      return this.cachedProjects.length > 0 ? this.cachedProjects : [this.buildOfflineItem()];
    }
  }

  /** Nodo placeholder quando il worker non è raggiungibile */
  private buildOfflineItem(): ProjectTreeItem {
    const item = new ProjectTreeItem('Worker non raggiungibile');
    item.iconPath = new vscode.ThemeIcon('warning');
    item.description = 'Avvia il worker con npm run dev';
    item.command = undefined;
    return item;
  }

  /** Nodo placeholder quando non ci sono progetti */
  private buildEmptyItem(): ProjectTreeItem {
    const item = new ProjectTreeItem('Nessun progetto trovato');
    item.iconPath = new vscode.ThemeIcon('info');
    item.description = 'Usa Kiro CLI per creare osservazioni';
    item.command = undefined;
    return item;
  }
}
