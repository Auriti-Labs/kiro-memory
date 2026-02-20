#!/usr/bin/env node
/**
 * Hook userPromptSubmit per Kiro CLI
 *
 * Trigger: quando l'utente invia un prompt
 * Funzione: salva il prompt nel database per contesto futuro
 */

import { runHook, detectProject, notifyWorker } from './utils.js';
import { createKiroMemory } from '../sdk/index.js';

runHook('userPromptSubmit', async (input) => {
  // Il prompt è un campo top-level, NON dentro tool_input
  const promptText = input.prompt
    || input.user_prompt
    || input.tool_input?.prompt
    || input.tool_input?.content;

  if (!promptText || typeof promptText !== 'string' || promptText.trim().length === 0) return;

  const project = detectProject(input.cwd);
  const sdk = createKiroMemory({ project, skipMigrations: true });

  try {
    // Usa session_id da Kiro se disponibile, altrimenti genera uno
    const sessionId = input.session_id
      || `kiro-${new Date().toISOString().split('T')[0]}-${project}`;

    await sdk.storePrompt(sessionId, Date.now(), promptText.trim());

    // Notifica la dashboard in tempo reale
    await notifyWorker('prompt-created', { project });
  } finally {
    sdk.close();
  }
});
