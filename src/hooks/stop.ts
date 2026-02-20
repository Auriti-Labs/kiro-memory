#!/usr/bin/env node
/**
 * Hook stop per Kiro CLI
 *
 * Trigger: quando l'agente completa la risposta
 * Funzione: genera e salva un sommario della sessione corrente
 */

import { runHook, detectProject, notifyWorker } from './utils.js';
import { createKiroMemory } from '../sdk/index.js';

runHook('stop', async (input) => {
  const project = detectProject(input.cwd);
  const sdk = createKiroMemory({ project, skipMigrations: true });

  try {
    // Recupera le osservazioni recenti della sessione corrente
    const recentObs = await sdk.getRecentObservations(50);

    // Filtra per session_id se disponibile da Kiro, altrimenti finestra temporale di 4 ore
    const sessionId = input.session_id;
    const fourHoursAgo = Date.now() - (4 * 60 * 60 * 1000);
    const sessionObs = sessionId
      ? recentObs.filter(o => o.memory_session_id === sessionId)
      : recentObs.filter(o => o.created_at_epoch > fourHoursAgo);

    if (sessionObs.length === 0) return;

    // Costruisci un sommario automatico basato sulle osservazioni
    const completed = sessionObs
      .map(o => o.title)
      .slice(0, 10)
      .join('; ');

    const filesModified = [...new Set(
      sessionObs
        .filter(o => o.files_modified)
        .map(o => o.files_modified!)
        .flatMap(f => f.split(',').map(s => s.trim()))
    )];

    const learned = sessionObs
      .filter(o => o.type === 'research' || o.type === 'code-intelligence')
      .map(o => o.text?.substring(0, 100))
      .filter(Boolean)
      .slice(0, 5)
      .join('; ');

    await sdk.storeSummary({
      request: `Sessione ${project} - ${new Date().toISOString().split('T')[0]}`,
      completed: completed || undefined,
      learned: learned || undefined,
      nextSteps: filesModified.length > 0
        ? `File modificati: ${filesModified.join(', ')}`
        : undefined
    });

    // Notifica la dashboard in tempo reale
    await notifyWorker('summary-created', { project });
  } finally {
    sdk.close();
  }
});
