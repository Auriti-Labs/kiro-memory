/**
 * Comando kiroMemory.search — Ricerca osservazioni con QuickPick.
 *
 * Apre un QuickPick interattivo che:
 * 1. Richiede la query di ricerca
 * 2. Chiama GET /api/search?q=...
 * 3. Mostra i risultati nel QuickPick
 * 4. All'item selezionato, apre il contenuto in un tab editor
 */

import * as vscode from 'vscode';
import type { KiroMemoryClient, Observation, SummaryResult } from '../api-client';

// ── Tipo item QuickPick ────────────────────────────────────────────────────

interface ObservationQuickPickItem extends vscode.QuickPickItem {
  observation?: Observation;
  summary?: SummaryResult;
}

// ── Comando principale ─────────────────────────────────────────────────────

export async function searchCommand(client: KiroMemoryClient): Promise<void> {
  // Step 1: input query
  const query = await vscode.window.showInputBox({
    placeHolder: 'Cerca nelle osservazioni... (es. "authentication", "bug fix")',
    prompt: 'Kiro Memory — Ricerca FTS5',
    ignoreFocusOut: true,
    validateInput: (value) => {
      if (!value || value.trim().length < 2) {
        return 'Inserisci almeno 2 caratteri';
      }
      return null;
    }
  });

  if (!query || query.trim().length === 0) {
    return; // Utente ha annullato
  }

  // Mostra QuickPick con stato di caricamento
  const qp = vscode.window.createQuickPick<ObservationQuickPickItem>();
  qp.placeholder = `Risultati per "${query}"`;
  qp.busy = true;
  qp.show();

  try {
    const results = await client.search(query.trim());
    const items: ObservationQuickPickItem[] = [];

    // Sezione: osservazioni
    if (results.observations.length > 0) {
      items.push({
        label: '$(file-code) Osservazioni',
        kind: vscode.QuickPickItemKind.Separator
      } as ObservationQuickPickItem);

      for (const obs of results.observations) {
        const data = new Date(obs.created_at).toLocaleDateString('it-IT');
        items.push({
          label: `$(${getIconName(obs.type)}) ${obs.title || '(senza titolo)'}`,
          description: `[${obs.type}] ${obs.project}`,
          detail: obs.narrative
            ? obs.narrative.slice(0, 120) + (obs.narrative.length > 120 ? '…' : '')
            : `${data} · ${obs.discovery_tokens} token`,
          observation: obs
        });
      }
    }

    // Sezione: sommari
    if (results.summaries.length > 0) {
      items.push({
        label: '$(list-tree) Sommari',
        kind: vscode.QuickPickItemKind.Separator
      } as ObservationQuickPickItem);

      for (const sum of results.summaries) {
        const data = new Date(sum.created_at).toLocaleDateString('it-IT');
        items.push({
          label: `$(book) Sommario ${data}`,
          description: sum.project,
          detail: sum.content.slice(0, 120) + (sum.content.length > 120 ? '…' : ''),
          summary: sum
        });
      }
    }

    if (items.length === 0) {
      items.push({
        label: '$(info) Nessun risultato',
        description: `La ricerca per "${query}" non ha trovato risultati`,
        detail: 'Prova termini diversi o verifica che il worker sia attivo'
      });
    }

    qp.items = items;
    qp.busy = false;

    // Gestione selezione
    qp.onDidAccept(async () => {
      const selected = qp.selectedItems[0];
      qp.hide();

      if (!selected) {
        return;
      }

      if (selected.observation) {
        await openObservationInEditor(selected.observation);
      } else if (selected.summary) {
        await openSummaryInEditor(selected.summary);
      }
    });

    qp.onDidHide(() => qp.dispose());

  } catch (err) {
    qp.dispose();
    const msg = err instanceof Error ? err.message : 'Errore sconosciuto';
    vscode.window.showErrorMessage(`Kiro Memory: ricerca fallita — ${msg}`);
  }
}

// ── Helper: apri osservazione in editor ───────────────────────────────────

/**
 * Apre il contenuto di un'osservazione in un tab editor virtuale (untitled).
 * Il contenuto è formattato come Markdown per leggibilità.
 */
export async function openObservationInEditor(obs: Observation): Promise<void> {
  const content = buildObservationMarkdown(obs);
  const doc = await vscode.workspace.openTextDocument({
    content,
    language: 'markdown'
  });
  await vscode.window.showTextDocument(doc, {
    preview: true,
    viewColumn: vscode.ViewColumn.Beside
  });
}

/**
 * Costruisce il Markdown da mostrare per un'osservazione.
 */
function buildObservationMarkdown(obs: Observation): string {
  const lines: string[] = [
    `# ${obs.title || '(senza titolo)'}`,
    '',
    `| Campo | Valore |`,
    `|-------|--------|`,
    `| **Progetto** | \`${obs.project}\` |`,
    `| **Tipo** | \`${obs.type}\` |`,
    `| **Data** | ${new Date(obs.created_at).toLocaleString('it-IT')} |`,
    `| **ID** | ${obs.id} |`,
  ];

  if (obs.file_path) {
    lines.push(`| **File** | \`${obs.file_path}\` |`);
  }
  if (obs.tool_name) {
    lines.push(`| **Tool** | \`${obs.tool_name}\` |`);
  }
  if (obs.concepts) {
    lines.push(`| **Concetti** | ${obs.concepts} |`);
  }

  lines.push('');

  if (obs.narrative) {
    lines.push('## Narrative', '', obs.narrative, '');
  }

  if (obs.content) {
    lines.push('## Contenuto', '', '```', obs.content, '```', '');
  }

  if (obs.files) {
    try {
      const filesArr = JSON.parse(obs.files) as string[];
      if (filesArr.length > 0) {
        lines.push('## File Coinvolti', '');
        for (const f of filesArr) {
          lines.push(`- \`${f}\``);
        }
        lines.push('');
      }
    } catch {
      // obs.files non è JSON valido, ignora
    }
  }

  return lines.join('\n');
}

/**
 * Apre il contenuto di un sommario in un tab editor.
 */
async function openSummaryInEditor(sum: SummaryResult): Promise<void> {
  const data = new Date(sum.created_at).toLocaleString('it-IT');
  const content = [
    `# Sommario — ${sum.project}`,
    '',
    `**Data**: ${data}  `,
    `**Sessione**: \`${sum.session_id}\``,
    '',
    '---',
    '',
    sum.content
  ].join('\n');

  const doc = await vscode.workspace.openTextDocument({
    content,
    language: 'markdown'
  });
  await vscode.window.showTextDocument(doc, {
    preview: true,
    viewColumn: vscode.ViewColumn.Beside
  });
}

// ── Utility icone tipo ─────────────────────────────────────────────────────

function getIconName(type: string): string {
  const map: Record<string, string> = {
    file_write: 'file-code',
    file_read: 'file',
    command: 'terminal',
    decision: 'lightbulb',
    search: 'search',
    knowledge: 'book',
    summary: 'list-tree',
    manual: 'pencil',
    error: 'error',
    tool_use: 'tools',
    git: 'git-commit',
    prompt: 'comment',
  };
  return map[type] ?? 'circle-outline';
}

// Esporta helper per uso in altri comandi
export { openObservationInEditor as openObservation };
export type { Observation, SummaryResult };
