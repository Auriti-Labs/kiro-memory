#!/usr/bin/env node
/**
 * Hook agentSpawn per Kiro CLI
 *
 * Trigger: quando l'agente si attiva
 * Funzione: avvia il worker (se non attivo) e inietta contesto su stdout
 */

import { runHook, detectProject, formatContext } from './utils.js';
import { createKiroMemory } from '../sdk/index.js';
import { spawn } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __filename_hook = fileURLToPath(import.meta.url);
const __dirname_hook = dirname(__filename_hook);

/**
 * Avvia il worker in background se non è già attivo
 */
async function ensureWorkerRunning(): Promise<void> {
  const host = process.env.KIRO_MEMORY_WORKER_HOST || '127.0.0.1';
  const port = process.env.KIRO_MEMORY_WORKER_PORT || '3001';
  const healthUrl = `http://${host}:${port}/health`;

  // Controlla se il worker è già attivo
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 1500);
    const resp = await fetch(healthUrl, { signal: controller.signal });
    clearTimeout(timeout);
    if (resp.ok) return; // Worker già attivo
  } catch {
    // Worker non raggiungibile, lo avviamo
  }

  // Percorso al worker compilato (stesso livello dist)
  const workerPath = join(__dirname_hook, '..', 'worker-service.js');

  // Avvia come processo detached in background
  const child = spawn('node', [workerPath], {
    detached: true,
    stdio: 'ignore',
    env: { ...process.env }
  });
  child.unref();

  // Attendi che il worker sia pronto (max 3 secondi)
  for (let i = 0; i < 6; i++) {
    await new Promise(r => setTimeout(r, 500));
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 800);
      const resp = await fetch(healthUrl, { signal: controller.signal });
      clearTimeout(timeout);
      if (resp.ok) return;
    } catch {
      // Ancora in avvio, riprova
    }
  }
  // Se dopo 3s non risponde, proseguiamo comunque (hook funziona senza worker)
}

runHook('agentSpawn', async (input) => {
  // Avvia il worker in background (non blocca se fallisce)
  await ensureWorkerRunning().catch(() => {});

  const project = detectProject(input.cwd);
  const sdk = createKiroMemory({ project });

  try {
    const ctx = await sdk.getContext();

    // Se non c'è contesto, esci silenziosamente
    if (ctx.relevantObservations.length === 0 && ctx.relevantSummaries.length === 0) {
      return;
    }

    let output = '# Kiro Memory: Contesto Sessioni Precedenti\n\n';
    output += formatContext({
      observations: ctx.relevantObservations,
      summaries: ctx.relevantSummaries,
      prompts: ctx.recentPrompts
    });

    output += `\n> Progetto: ${project} | Osservazioni: ${ctx.relevantObservations.length} | Sommari: ${ctx.relevantSummaries.length}\n`;
    output += `> UI disponibile su http://127.0.0.1:${process.env.KIRO_MEMORY_WORKER_PORT || '3001'}\n`;

    // Stdout viene iniettato nel contesto dell'agente Kiro
    process.stdout.write(output);
  } finally {
    sdk.close();
  }
});
