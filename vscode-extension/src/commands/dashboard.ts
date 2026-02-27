/**
 * Comando kiroMemory.showDashboard — Apre la dashboard in una WebviewPanel.
 *
 * Crea (o riporta in foreground) un pannello WebView che carica
 * la dashboard React del worker (http://127.0.0.1:3001) via iframe.
 *
 * Nota: la WebView con iframe è necessaria perché VS Code non supporta
 * la navigazione diretta verso URL locali nelle WebView semplici.
 */

import * as vscode from 'vscode';
import type { DashboardPanel } from '../views/dashboard-panel';

// Istanza singleton del pannello (per evitare duplicati)
let currentPanel: DashboardPanel | undefined;

/**
 * Apre la dashboard Kiro Memory nel pannello WebView.
 * Se il pannello è già aperto, lo porta in foreground.
 */
export async function showDashboardCommand(
  context: vscode.ExtensionContext,
  workerUrl: string,
  createPanel: (ctx: vscode.ExtensionContext, url: string) => DashboardPanel
): Promise<void> {
  if (currentPanel) {
    // Porta il pannello esistente in foreground
    currentPanel.reveal();
    return;
  }

  // Crea nuovo pannello
  currentPanel = createPanel(context, workerUrl);

  // Pulizia quando il pannello viene chiuso dall'utente
  currentPanel.onDidDispose(() => {
    currentPanel = undefined;
  });
}

/**
 * Restituisce il pannello dashboard corrente (se aperto).
 */
export function getCurrentPanel(): DashboardPanel | undefined {
  return currentPanel;
}

/**
 * Chiude il pannello dashboard (se aperto).
 */
export function closeDashboard(): void {
  if (currentPanel) {
    currentPanel.dispose();
    currentPanel = undefined;
  }
}
