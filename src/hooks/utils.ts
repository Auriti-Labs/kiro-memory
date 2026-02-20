/**
 * Utility condivise per gli hook Kiro CLI
 *
 * Contratto Kiro:
 * - Input: JSON via stdin con { hook_event_name, cwd, tool_name, tool_input, tool_response }
 * - Output: testo su stdout (iniettato nel contesto dell'agente)
 * - Exit code 0 = successo, 2 = blocco (stderr inviato all'LLM)
 */

import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';
import type { KiroHookInput } from '../types/worker-types.js';

// Percorso del token condiviso con il worker
const DATA_DIR = process.env.KIRO_MEMORY_DATA_DIR
  || process.env.CONTEXTKIT_DATA_DIR
  || join(process.env.HOME || '/tmp', '.kiro-memory');
const TOKEN_FILE = join(DATA_DIR, 'worker.token');

/**
 * Logging di debug per gli hook (attivo solo con KIRO_MEMORY_LOG_LEVEL=DEBUG)
 */
export function debugLog(hookName: string, label: string, data: unknown): void {
  if ((process.env.KIRO_MEMORY_LOG_LEVEL || '').toUpperCase() !== 'DEBUG') return;
  try {
    const dataDir = process.env.KIRO_MEMORY_DATA_DIR
      || join(process.env.HOME || '/tmp', '.kiro-memory');
    const logDir = join(dataDir, 'logs');
    if (!existsSync(logDir)) mkdirSync(logDir, { recursive: true });

    const ts = new Date().toISOString();
    const line = `[${ts}] [${hookName}] ${label}: ${JSON.stringify(data)}\n`;
    const logFile = join(logDir, `hooks-${new Date().toISOString().split('T')[0]}.log`);
    writeFileSync(logFile, line, { flag: 'a' });
  } catch {
    // Il logging non deve mai bloccare l'hook
  }
}

/**
 * Legge e parsa JSON da stdin
 */
export async function readStdin(): Promise<KiroHookInput> {
  return new Promise((resolve, reject) => {
    let data = '';

    process.stdin.setEncoding('utf8');
    // Timeout di sicurezza: 5 secondi (cancellato in end/error per evitare leak)
    const safetyTimeout = setTimeout(() => {
      if (!data.trim()) {
        resolve({
          hook_event_name: 'agentSpawn',
          cwd: process.cwd()
        });
      }
    }, 5000);

    process.stdin.on('data', (chunk) => { data += chunk; });
    process.stdin.on('end', () => {
      clearTimeout(safetyTimeout);
      try {
        if (!data.trim()) {
          resolve({
            hook_event_name: 'agentSpawn',
            cwd: process.cwd()
          });
          return;
        }
        resolve(JSON.parse(data));
      } catch (err) {
        reject(new Error(`Errore parsing stdin JSON: ${err}`));
      }
    });
    process.stdin.on('error', (err) => {
      clearTimeout(safetyTimeout);
      reject(err);
    });
  });
}

/**
 * Rileva il nome del progetto dalla cwd
 */
export function detectProject(cwd: string): string {
  try {
    const { execSync } = require('child_process');
    const gitRoot = execSync('git rev-parse --show-toplevel', {
      cwd,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'ignore']
    }).trim();
    return gitRoot.split('/').pop() || 'default';
  } catch {
    // Fallback: ultimo segmento del path
    return cwd.split('/').pop() || 'default';
  }
}

/**
 * Formatta il contesto per l'iniezione in Kiro
 */
export function formatContext(data: {
  observations?: Array<{ title: string; text?: string | null; type?: string; created_at?: string }>;
  summaries?: Array<{ learned?: string | null; completed?: string | null; next_steps?: string | null; created_at?: string }>;
  prompts?: Array<{ prompt_text: string; created_at?: string }>;
}): string {
  let output = '';

  if (data.summaries && data.summaries.length > 0) {
    output += '## Sessioni Precedenti\n\n';
    data.summaries.slice(0, 3).forEach(sum => {
      if (sum.learned) output += `- **Appreso**: ${sum.learned}\n`;
      if (sum.completed) output += `- **Completato**: ${sum.completed}\n`;
      if (sum.next_steps) output += `- **Prossimi passi**: ${sum.next_steps}\n`;
      output += '\n';
    });
  }

  if (data.observations && data.observations.length > 0) {
    output += '## Osservazioni Recenti\n\n';
    data.observations.slice(0, 10).forEach(obs => {
      const text = obs.text ? obs.text.substring(0, 150) : '';
      output += `- **[${obs.type || 'obs'}] ${obs.title}**: ${text}\n`;
    });
    output += '\n';
  }

  return output;
}

/**
 * Notifica il worker che ci sono nuovi dati.
 * Chiama POST /api/notify per triggerare il broadcast SSE ai client della dashboard.
 * Non-bloccante: se il worker non è attivo, ignora silenziosamente.
 */
export async function notifyWorker(event: string, data?: Record<string, unknown>): Promise<void> {
  const host = process.env.KIRO_MEMORY_WORKER_HOST || '127.0.0.1';
  const port = process.env.KIRO_MEMORY_WORKER_PORT || '3001';
  try {
    // Leggi token di autenticazione condiviso con il worker
    let token = '';
    try {
      token = readFileSync(TOKEN_FILE, 'utf-8').trim();
    } catch {
      // Token non trovato: il worker potrebbe non essere attivo
      return;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 1500);
    await fetch(`http://${host}:${port}/api/notify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Worker-Token': token
      },
      body: JSON.stringify({ event, data: data || {} }),
      signal: controller.signal
    });
    clearTimeout(timeout);
  } catch {
    // Worker non attivo — ignora silenziosamente
  }
}

/**
 * Wrapper sicuro per eseguire un hook con gestione errori
 */
export async function runHook(
  name: string,
  handler: (input: KiroHookInput) => Promise<void>
): Promise<void> {
  try {
    const input = await readStdin();
    debugLog(name, 'stdin', input);
    await handler(input);
    debugLog(name, 'completato', { success: true });
    process.exit(0);
  } catch (error) {
    debugLog(name, 'errore', { error: String(error) });
    process.stderr.write(`[kiro-memory:${name}] Errore: ${error}\n`);
    process.exit(0); // Exit 0 per degradazione silenziosa (non bloccare Kiro)
  }
}
