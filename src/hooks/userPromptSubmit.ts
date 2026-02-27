#!/usr/bin/env node
/**
 * userPromptSubmit hook for Kiro CLI
 *
 * Trigger: when the user submits a prompt
 * Function: saves the prompt in the database for future context
 */

import { runHook, detectProject, notifyWorker } from './utils.js';
import { createKiroMemory } from '../sdk/index.js';
import { redactSecrets } from '../utils/secrets.js';

runHook('userPromptSubmit', async (input) => {
  // The prompt is a top-level field, NOT inside tool_input
  const promptText = input.prompt
    || input.user_prompt
    || input.tool_input?.prompt
    || input.tool_input?.content;

  if (!promptText || typeof promptText !== 'string' || promptText.trim().length === 0) return;

  const project = detectProject(input.cwd);
  const sdk = createKiroMemory({ project, skipMigrations: true });

  try {
    // Use session_id from Kiro if available, otherwise generate one
    const sessionId = input.session_id
      || `kiro-${new Date().toISOString().split('T')[0]}-${project}`;

    // Redact secrets before persisting the prompt text
    const safePromptText = redactSecrets(promptText.trim());
    await sdk.storePrompt(sessionId, Date.now(), safePromptText);

    // Notify the dashboard in real-time
    await notifyWorker('prompt-created', { project });

    // Cursor beforeSubmitPrompt requires JSON output to proceed
    if (input.hook_event_name === 'beforeSubmitPrompt') {
      process.stdout.write(JSON.stringify({ continue: true }));
    }
  } finally {
    sdk.close();
  }
});
