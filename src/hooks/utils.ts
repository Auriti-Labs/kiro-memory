/**
 * Shared utilities for Kiro CLI hooks
 *
 * Kiro contract:
 * - Input: JSON via stdin with { hook_event_name, cwd, tool_name, tool_input, tool_response }
 * - Output: text on stdout (injected into agent context)
 * - Exit code 0 = success, 2 = block (stderr sent to LLM)
 */

import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';
import type { KiroHookInput, ScoredItem, Summary } from '../types/worker-types.js';
import { estimateTokens } from '../services/search/ScoringEngine.js';

// Path to shared authentication token with the worker
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
    // Logging must never block the hook
  }
}

/**
 * Read and parse JSON from stdin
 */
export async function readStdin(): Promise<KiroHookInput> {
  return new Promise((resolve, reject) => {
    let data = '';

    process.stdin.setEncoding('utf8');
    // Safety timeout: 5 seconds (cleared in end/error to prevent leaks)
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
        reject(new Error(`Error parsing stdin JSON: ${err}`));
      }
    });
    process.stdin.on('error', (err) => {
      clearTimeout(safetyTimeout);
      reject(err);
    });
  });
}

/**
 * Detect project name from cwd
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
    // Fallback: last path segment
    return cwd.split('/').pop() || 'default';
  }
}

/**
 * Format context for injection into Kiro
 */
export function formatContext(data: {
  observations?: Array<{ title: string; text?: string | null; type?: string; created_at?: string }>;
  summaries?: Array<{ learned?: string | null; completed?: string | null; next_steps?: string | null; created_at?: string }>;
  prompts?: Array<{ prompt_text: string; created_at?: string }>;
}): string {
  let output = '';

  if (data.summaries && data.summaries.length > 0) {
    output += '## Previous Sessions\n\n';
    data.summaries.slice(0, 3).forEach(sum => {
      if (sum.learned) output += `- **Learned**: ${sum.learned}\n`;
      if (sum.completed) output += `- **Completed**: ${sum.completed}\n`;
      if (sum.next_steps) output += `- **Next steps**: ${sum.next_steps}\n`;
      output += '\n';
    });
  }

  if (data.observations && data.observations.length > 0) {
    output += '## Recent Observations\n\n';
    data.observations.slice(0, 10).forEach(obs => {
      const text = obs.text ? obs.text.substring(0, 150) : '';
      output += `- **[${obs.type || 'obs'}] ${obs.title}**: ${text}\n`;
    });
    output += '\n';
  }

  return output;
}

/**
 * Notify the worker that new data is available.
 * Calls POST /api/notify to trigger SSE broadcast to dashboard clients.
 * Non-blocking: silently ignores if the worker is not running.
 */
export async function notifyWorker(event: string, data?: Record<string, unknown>): Promise<void> {
  const host = process.env.KIRO_MEMORY_WORKER_HOST || '127.0.0.1';
  const port = process.env.KIRO_MEMORY_WORKER_PORT || '3001';
  try {
    // Read shared authentication token with the worker
    let token = '';
    try {
      token = readFileSync(TOKEN_FILE, 'utf-8').trim();
    } catch {
      // Token not found: worker might not be running
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
    // Worker not running — silently ignore
  }
}

/**
 * Format smart context with token budget.
 * Fills the budget with items sorted by descending score.
 * Summaries always included (max 3). Items truncated if needed.
 */
export function formatSmartContext(data: {
  items: ScoredItem[];
  summaries: Summary[];
  project: string;
  tokenBudget?: number;
}): string {
  const budget = data.tokenBudget
    || parseInt(process.env.KIRO_MEMORY_CONTEXT_TOKENS || '0', 10)
    || 2000;

  let output = '';
  let tokensUsed = 0;

  // Header
  const header = '# Kiro Memory: Previous Sessions Context\n\n';
  tokensUsed += estimateTokens(header);
  output += header;

  // Summaries (always included, max 3)
  if (data.summaries && data.summaries.length > 0) {
    let sumSection = '## Previous Sessions\n\n';
    for (const sum of data.summaries.slice(0, 3)) {
      if (sum.learned) sumSection += `- **Learned**: ${sum.learned}\n`;
      if (sum.completed) sumSection += `- **Completed**: ${sum.completed}\n`;
      if (sum.next_steps) sumSection += `- **Next steps**: ${sum.next_steps}\n`;
      sumSection += '\n';
    }
    tokensUsed += estimateTokens(sumSection);
    output += sumSection;
  }

  // Observations sorted by score (greedy filling)
  if (data.items && data.items.length > 0) {
    let obsSection = '## Relevant Observations\n\n';
    tokensUsed += estimateTokens(obsSection);

    // Sort by descending score (should already be sorted, but ensure it)
    const sorted = [...data.items].sort((a, b) => b.score - a.score);

    for (const item of sorted) {
      // Base line: type + title
      const linePrefix = `- **[${item.type}] ${item.title}**: `;
      const linePrefixTokens = estimateTokens(linePrefix);

      // Remaining budget for content
      const remainingTokens = budget - tokensUsed - linePrefixTokens - 1; // 1 per \n

      if (remainingTokens <= 0) break; // Budget exhausted

      // Truncate content to remaining budget
      const maxContentChars = remainingTokens * 4; // 1 token ≈ 4 char
      const content = item.content
        ? item.content.substring(0, Math.min(maxContentChars, 300))
        : '';

      const line = `${linePrefix}${content}\n`;
      tokensUsed += estimateTokens(line);
      obsSection += line;

      // If we exceeded the budget, stop
      if (tokensUsed >= budget) break;
    }

    output += obsSection;
  }

  // Footer with stats
  const footer = `\n> Project: ${data.project} | Items: ${data.items?.length || 0} | Tokens used: ~${tokensUsed}/${budget}\n`;
  output += footer;

  return output;
}

/**
 * Safe wrapper to execute a hook with error handling
 */
export async function runHook(
  name: string,
  handler: (input: KiroHookInput) => Promise<void>
): Promise<void> {
  try {
    const input = await readStdin();

    // Cross-platform normalization: Cursor uses workspace_roots and conversation_id
    if (!input.cwd && input.workspace_roots?.[0]) {
      input.cwd = input.workspace_roots[0];
    }
    if (!input.session_id && input.conversation_id) {
      input.session_id = input.conversation_id;
    }

    debugLog(name, 'stdin', input);
    await handler(input);
    debugLog(name, 'completed', { success: true });
    process.exit(0);
  } catch (error) {
    debugLog(name, 'error', { error: String(error) });
    process.stderr.write(`[kiro-memory:${name}] Error: ${error}\n`);
    process.exit(0); // Exit 0 for silent degradation (don't block Kiro)
  }
}
