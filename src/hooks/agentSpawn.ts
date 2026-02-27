#!/usr/bin/env node
/**
 * agentSpawn hook for Kiro CLI
 *
 * Trigger: when the agent activates
 * Function: starts the worker (if not running) and injects context to stdout
 */

import { runHook, detectProject, formatSmartContext } from './utils.js';
import { createKiroMemory } from '../sdk/index.js';
import { spawn } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __filename_hook = fileURLToPath(import.meta.url);
const __dirname_hook = dirname(__filename_hook);

/**
 * Start the worker in background if not already running
 */
async function ensureWorkerRunning(): Promise<void> {
  const host = process.env.KIRO_MEMORY_WORKER_HOST || '127.0.0.1';
  const port = process.env.KIRO_MEMORY_WORKER_PORT || '3001';
  const healthUrl = `http://${host}:${port}/health`;

  // Check if worker is already running
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 1500);
    const resp = await fetch(healthUrl, { signal: controller.signal });
    clearTimeout(timeout);
    if (resp.ok) return; // Worker already running
  } catch {
    // Worker unreachable, starting it
  }

  // Path to compiled worker (same dist level)
  const workerPath = join(__dirname_hook, '..', 'worker-service.js');

  // Start as detached background process
  const child = spawn('node', [workerPath], {
    detached: true,
    stdio: 'ignore',
    env: { ...process.env }
  });
  child.unref();

  // Wait for worker to be ready (max 3 seconds)
  for (let i = 0; i < 6; i++) {
    await new Promise(r => setTimeout(r, 500));
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 800);
      const resp = await fetch(healthUrl, { signal: controller.signal });
      clearTimeout(timeout);
      if (resp.ok) return;
    } catch {
      // Still starting, retry
    }
  }
  // If no response after 3s, continue anyway (hook works without worker)
}

runHook('agentSpawn', async (input) => {
  // Start worker in background (non-blocking on failure)
  await ensureWorkerRunning().catch(() => {});

  const project = detectProject(input.cwd);
  const sdk = createKiroMemory({ project });

  try {
    const smartCtx = await sdk.getSmartContext();

    // No context available, exit silently
    if (smartCtx.items.length === 0 && smartCtx.summaries.length === 0) {
      return;
    }

    let output = formatSmartContext({
      items: smartCtx.items,
      summaries: smartCtx.summaries,
      project
    });

    output += `> UI available at http://127.0.0.1:${process.env.KIRO_MEMORY_WORKER_PORT || '3001'}\n`;

    // Stdout gets injected into the Kiro agent context
    process.stdout.write(output);
  } finally {
    sdk.close();
  }
});
