/**
 * DashboardPanel — WebviewPanel che ospita la dashboard Kiro Memory.
 *
 * Carica la dashboard React del worker (http://127.0.0.1:3001) via iframe
 * all'interno di un pannello WebView VS Code. Gestisce il ciclo di vita
 * del pannello (creazione, reveal, dispose) e la comunicazione con il worker.
 */

import * as vscode from 'vscode';

// ── Costanti ───────────────────────────────────────────────────────────────

const PANEL_TITLE = 'Kiro Memory Dashboard';
const VIEW_TYPE   = 'kiroMemoryDashboard';

// ── Classe panel ───────────────────────────────────────────────────────────

export class DashboardPanel {
  private readonly panel: vscode.WebviewPanel;
  private readonly workerUrl: string;
  private disposables: vscode.Disposable[] = [];

  private _onDidDispose = new vscode.EventEmitter<void>();
  /** Evento emesso quando il pannello viene chiuso */
  readonly onDidDispose = this._onDidDispose.event;

  constructor(
    context: vscode.ExtensionContext,
    workerUrl: string,
    column: vscode.ViewColumn = vscode.ViewColumn.Two
  ) {
    this.workerUrl = workerUrl;

    // Crea il pannello WebView
    this.panel = vscode.window.createWebviewPanel(
      VIEW_TYPE,
      PANEL_TITLE,
      column,
      {
        // Abilita script nel WebView (necessario per l'iframe e i messaggi)
        enableScripts: true,
        // Mantieni il panel attivo quando non è visibile (evita reload)
        retainContextWhenHidden: true,
        // Nessuna cartella locale da accedere (tutto via worker HTTP)
        localResourceRoots: []
      }
    );

    // Icona del tab pannello
    this.panel.iconPath = vscode.Uri.joinPath(
      context.extensionUri,
      'resources',
      'icons',
      'kiro-memory.svg'
    );

    // Render HTML iniziale
    this.panel.webview.html = this.buildHtml();

    // Gestione messaggi dal WebView (es. navigazione)
    this.panel.webview.onDidReceiveMessage(
      this.handleMessage.bind(this),
      undefined,
      this.disposables
    );

    // Pulizia quando il pannello viene chiuso
    this.panel.onDidDispose(
      () => this.dispose(),
      undefined,
      this.disposables
    );
  }

  /** Porta il pannello in foreground (tab attivo) */
  reveal(column?: vscode.ViewColumn): void {
    this.panel.reveal(column);
  }

  /** Chiude e distrugge il pannello */
  dispose(): void {
    this.panel.dispose();
    for (const d of this.disposables) {
      d.dispose();
    }
    this.disposables = [];
    this._onDidDispose.fire();
    this._onDidDispose.dispose();
  }

  // ── HTML del WebView ─────────────────────────────────────────────────────

  /**
   * Costruisce l'HTML del pannello WebView.
   *
   * Usa un iframe per caricare la dashboard React del worker.
   * La Content Security Policy è configurata per consentire solo
   * il worker locale (127.0.0.1:3001).
   */
  private buildHtml(): string {
    const workerHost = new URL(this.workerUrl).hostname;
    const workerPort = new URL(this.workerUrl).port;
    const frameUrl   = this.workerUrl;

    return `<!DOCTYPE html>
<html lang="it">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy"
    content="
      default-src 'none';
      frame-src http://${workerHost}:${workerPort};
      script-src 'unsafe-inline';
      style-src 'unsafe-inline';
      img-src data: http://${workerHost}:${workerPort};
    ">
  <title>${PANEL_TITLE}</title>
  <style>
    /* Reset e layout full-height */
    * { margin: 0; padding: 0; box-sizing: border-box; }

    body {
      background: var(--vscode-editor-background);
      color: var(--vscode-editor-foreground);
      font-family: var(--vscode-font-family);
      height: 100vh;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    /* Barra superiore con URL e pulsanti */
    .toolbar {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 6px 10px;
      background: var(--vscode-titleBar-activeBackground);
      border-bottom: 1px solid var(--vscode-panel-border);
      flex-shrink: 0;
    }

    .toolbar-url {
      flex: 1;
      font-size: 11px;
      color: var(--vscode-titleBar-activeForeground);
      opacity: 0.7;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .toolbar-btn {
      background: none;
      border: 1px solid var(--vscode-button-border, transparent);
      color: var(--vscode-titleBar-activeForeground);
      cursor: pointer;
      padding: 3px 8px;
      border-radius: 3px;
      font-size: 11px;
      opacity: 0.8;
      transition: opacity 0.15s;
    }

    .toolbar-btn:hover { opacity: 1; background: var(--vscode-button-hoverBackground); }

    /* Pannello errore quando il worker non è disponibile */
    .error-panel {
      display: none;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      flex: 1;
      gap: 12px;
      padding: 40px;
      text-align: center;
    }

    .error-panel.visible { display: flex; }

    .error-icon { font-size: 48px; opacity: 0.5; }

    .error-title {
      font-size: 16px;
      font-weight: 600;
      color: var(--vscode-editorWarning-foreground);
    }

    .error-msg {
      font-size: 13px;
      opacity: 0.7;
      max-width: 400px;
      line-height: 1.5;
    }

    .error-url {
      font-family: var(--vscode-editor-font-family, monospace);
      font-size: 12px;
      color: var(--vscode-textLink-foreground);
      background: var(--vscode-textCodeBlock-background);
      padding: 4px 10px;
      border-radius: 4px;
    }

    /* iframe dashboard */
    iframe {
      flex: 1;
      border: none;
      width: 100%;
    }
  </style>
</head>
<body>
  <!-- Barra degli strumenti superiore -->
  <div class="toolbar">
    <span class="toolbar-url">${frameUrl}</span>
    <button class="toolbar-btn" onclick="reloadFrame()" title="Ricarica dashboard">
      ↺ Ricarica
    </button>
    <button class="toolbar-btn" onclick="openExternal()" title="Apri nel browser">
      ↗ Browser
    </button>
  </div>

  <!-- Pannello errore (mostrato se il worker non risponde) -->
  <div class="error-panel" id="errorPanel">
    <div class="error-icon">⚡</div>
    <div class="error-title">Worker non raggiungibile</div>
    <div class="error-msg">
      Il worker Kiro Memory non sembra attivo. Avvialo dal terminale con:
    </div>
    <code class="error-url">npm run dev</code>
    <div class="error-msg">
      poi clicca "Ricarica" per riprovare.
    </div>
  </div>

  <!-- iframe della dashboard React -->
  <iframe
    id="dashFrame"
    src="${frameUrl}"
    title="Kiro Memory Dashboard"
    sandbox="allow-scripts allow-same-origin allow-forms"
    referrerpolicy="no-referrer"
  ></iframe>

  <script>
    const frame = document.getElementById('dashFrame');
    const errPanel = document.getElementById('errorPanel');

    // Gestione caricamento iframe: mostra errore se fallisce
    frame.addEventListener('load', () => {
      try {
        // Se l'iframe è vuoto o la pagina è una pagina di errore del browser
        const frameDoc = frame.contentDocument || frame.contentWindow.document;
        const title = frameDoc.title || '';
        if (title.includes('ERR_') || title.includes('refused') || title === '') {
          showError();
        } else {
          hideError();
        }
      } catch (e) {
        // Cross-origin: il frame è caricato correttamente (no access = successo)
        hideError();
      }
    });

    frame.addEventListener('error', () => showError());

    function showError() {
      frame.style.display = 'none';
      errPanel.classList.add('visible');
    }

    function hideError() {
      frame.style.display = '';
      errPanel.classList.remove('visible');
    }

    function reloadFrame() {
      hideError();
      frame.src = frame.src;
    }

    function openExternal() {
      // Invia messaggio al pannello VS Code per aprire nel browser
      const vscode = acquireVsCodeApi();
      vscode.postMessage({ command: 'openExternal', url: '${frameUrl}' });
    }
  </script>
</body>
</html>`;
  }

  // ── Gestione messaggi WebView → Extension ─────────────────────────────────

  private handleMessage(message: { command: string; url?: string }): void {
    switch (message.command) {
      case 'openExternal':
        if (message.url) {
          vscode.env.openExternal(vscode.Uri.parse(message.url));
        }
        break;
    }
  }
}

// ── Factory ────────────────────────────────────────────────────────────────

/**
 * Factory function per creare un DashboardPanel dalla configurazione VS Code.
 * Usata dall'extension.ts per passare come callback ai comandi.
 */
export function createDashboardPanel(
  context: vscode.ExtensionContext,
  workerUrl: string
): DashboardPanel {
  return new DashboardPanel(context, workerUrl);
}
