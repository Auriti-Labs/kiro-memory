/**
 * Comando kiroMemory.showContext — Mostra il contesto del progetto corrente.
 *
 * Rileva il progetto attivo dal workspace folder (usando il nome della
 * cartella radice git, come fa l'hook agentSpawn), poi carica il contesto
 * via GET /api/context/:project e lo apre in un tab editor Markdown.
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as child_process from 'child_process';
import type { KiroMemoryClient, ContextResponse } from '../api-client';

// ── Comando principale ─────────────────────────────────────────────────────

export async function showContextCommand(client: KiroMemoryClient): Promise<void> {
  // Rileva il progetto dal workspace corrente
  const project = await detectCurrentProject();

  if (!project) {
    vscode.window.showWarningMessage(
      'Kiro Memory: impossibile rilevare il progetto corrente. ' +
      'Apri una cartella workspace che sia un repository git.'
    );
    return;
  }

  // Mostra notifica durante il caricamento
  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: `Kiro Memory: caricamento contesto per "${project}"…`,
      cancellable: false
    },
    async () => {
      try {
        const context = await client.getContext(project);
        await openContextInEditor(context, project);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Errore sconosciuto';

        // Se l'errore è 404, il progetto non ha ancora osservazioni
        if (msg.includes('404') || msg.includes('not found')) {
          vscode.window.showInformationMessage(
            `Kiro Memory: nessun contesto trovato per il progetto "${project}". ` +
            'Usa Kiro CLI per creare le prime osservazioni.'
          );
        } else {
          vscode.window.showErrorMessage(
            `Kiro Memory: impossibile caricare il contesto — ${msg}`
          );
        }
      }
    }
  );
}

// ── Rilevamento progetto ───────────────────────────────────────────────────

/**
 * Rileva il nome del progetto corrente usando execFile con git rev-parse
 * (stesso metodo usato dagli hook Kiro Memory in agentSpawn.ts).
 *
 * Utilizza execFile (non exec) per prevenire shell injection.
 * Fallback: nome della cartella workspace root se git non è disponibile.
 */
async function detectCurrentProject(): Promise<string | undefined> {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) {
    return undefined;
  }

  const cwd = workspaceFolder.uri.fsPath;

  // Usa execFile per chiamare git in modo sicuro (no shell injection)
  try {
    const gitRoot = await runGitRevParse(cwd);
    if (gitRoot) {
      return path.basename(gitRoot.trim());
    }
  } catch {
    // git non disponibile o non è un repository: usa fallback
  }

  // Fallback: nome cartella workspace
  return path.basename(cwd);
}

/**
 * Esegue `git rev-parse --show-toplevel` in modo sicuro usando execFile.
 * execFile non invoca la shell, prevenendo qualsiasi shell injection.
 */
function runGitRevParse(cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    // execFile lancia il binario direttamente senza shell interposta
    child_process.execFile(
      'git',
      ['rev-parse', '--show-toplevel'],
      { cwd, timeout: 5000 },
      (err, stdout) => {
        if (err) {
          reject(err);
        } else {
          resolve(stdout);
        }
      }
    );
  });
}

// ── Apertura contesto nell'editor ─────────────────────────────────────────

/**
 * Apre il contesto del progetto in un tab editor formattato come Markdown.
 */
async function openContextInEditor(ctx: ContextResponse, project: string): Promise<void> {
  const content = buildContextMarkdown(ctx, project);
  const doc = await vscode.workspace.openTextDocument({
    content,
    language: 'markdown'
  });
  await vscode.window.showTextDocument(doc, {
    preview: false,
    viewColumn: vscode.ViewColumn.Active
  });
}

/**
 * Costruisce il documento Markdown con il contesto del progetto.
 */
function buildContextMarkdown(ctx: ContextResponse, project: string): string {
  const lines: string[] = [
    `# Contesto Kiro Memory — ${project}`,
    '',
    `_Generato il ${new Date().toLocaleString('it-IT')}_`,
    ''
  ];

  // Statistiche aggregate
  const stats = ctx.stats;
  if (stats) {
    lines.push('## Statistiche', '');
    lines.push(`| Campo | Valore |`);
    lines.push(`|-------|--------|`);
    lines.push(`| **Osservazioni totali** | ${stats.total_observations} |`);
    lines.push(`| **Sessioni totali** | ${stats.total_sessions} |`);
    if (stats.first_seen) {
      lines.push(`| **Prima sessione** | ${new Date(stats.first_seen).toLocaleDateString('it-IT')} |`);
    }
    if (stats.last_seen) {
      lines.push(`| **Ultima sessione** | ${new Date(stats.last_seen).toLocaleDateString('it-IT')} |`);
    }
    lines.push('');

    // Distribuzione per tipo
    if (stats.types && Object.keys(stats.types).length > 0) {
      lines.push('### Distribuzione per tipo', '');
      for (const [type, count] of Object.entries(stats.types).sort((a, b) => b[1] - a[1])) {
        lines.push(`- \`${type}\`: ${count}`);
      }
      lines.push('');
    }
  }

  // Sommario sessione (se disponibile)
  if (ctx.summary) {
    lines.push('## Sommario Ultima Sessione', '', ctx.summary, '');
  }

  // Osservazioni recenti
  if (ctx.observations && ctx.observations.length > 0) {
    lines.push(`## Osservazioni Recenti (${ctx.observations.length})`, '');

    for (const obs of ctx.observations) {
      const data = new Date(obs.created_at).toLocaleString('it-IT');
      lines.push(`### [${obs.type}] ${obs.title || '(senza titolo)'}`);
      lines.push('');
      lines.push(`**Data**: ${data}  `);
      if (obs.file_path) {
        lines.push(`**File**: \`${obs.file_path}\`  `);
      }
      if (obs.concepts) {
        lines.push(`**Concetti**: ${obs.concepts}  `);
      }
      lines.push('');

      if (obs.narrative) {
        lines.push(obs.narrative);
      } else if (obs.content) {
        const preview = obs.content.slice(0, 300);
        lines.push('```');
        lines.push(preview + (obs.content.length > 300 ? '\n… (troncato)' : ''));
        lines.push('```');
      }
      lines.push('');
      lines.push('---');
      lines.push('');
    }
  } else {
    lines.push('_Nessuna osservazione recente per questo progetto._');
  }

  return lines.join('\n');
}
