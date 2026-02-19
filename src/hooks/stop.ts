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
  const sdk = createKiroMemory({ project });

  try {
    // Recupera le osservazioni recenti della sessione corrente (ultime ore)
    const recentObs = await sdk.getRecentObservations(20);

    // Se non ci sono osservazioni recenti, non generare un sommario vuoto
    const oneHourAgo = Date.now() - (60 * 60 * 1000);
    const sessionObs = recentObs.filter(o => o.created_at_epoch > oneHourAgo);

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
