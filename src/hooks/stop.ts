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
    // Recupera o crea la sessione DB per questo content_session_id
    const contentSessionId = input.session_id || `stop-${Date.now()}`;
    const session = await sdk.getOrCreateSession(contentSessionId);

    // Filtra osservazioni: usa started_at_epoch della sessione se disponibile,
    // altrimenti fallback a finestra 4h. Fix: content_session_id ≠ memory_session_id
    const recentObs = await sdk.getRecentObservations(50);
    const sessionStart = session.started_at_epoch || (Date.now() - (4 * 60 * 60 * 1000));
    const sessionObs = recentObs.filter(o => o.created_at_epoch >= sessionStart);

    if (sessionObs.length === 0) return;

    // Categorizza osservazioni per tipo
    const byType = new Map<string, typeof sessionObs>();
    for (const obs of sessionObs) {
      const group = byType.get(obs.type) || [];
      group.push(obs);
      byType.set(obs.type, group);
    }

    // Sezione "investigated": file letti e ricerche
    const readFiles = byType.get('file-read') || [];
    const researched = byType.get('research') || [];
    const investigated = [
      ...readFiles.slice(0, 5).map(o => o.narrative || o.title),
      ...researched.slice(0, 3).map(o => o.narrative || o.title),
    ].filter(Boolean).join('; ') || undefined;

    // Sezione "completed": file modificati e comandi eseguiti
    const writes = byType.get('file-write') || [];
    const commands = byType.get('command') || [];
    const completed = [
      ...writes.slice(0, 8).map(o => o.narrative || o.title),
      ...commands.slice(0, 3).map(o => o.narrative || o.title),
    ].filter(Boolean).join('; ') || undefined;

    // Sezione "learned": contenuto ricerca e code-intelligence
    const learned = researched
      .map(o => o.text?.substring(0, 150))
      .filter(Boolean)
      .slice(0, 5)
      .join('; ') || undefined;

    // File modificati unici
    const filesModified = [...new Set(
      sessionObs
        .filter(o => o.files_modified)
        .map(o => o.files_modified!)
        .flatMap(f => f.split(',').map(s => s.trim()))
    )];

    // Concetti unici dalla sessione
    const sessionConcepts = [...new Set(
      sessionObs
        .filter(o => o.concepts)
        .flatMap(o => o.concepts!.split(',').map(c => c.trim()))
    )].slice(0, 10);

    // Sezione "next_steps": file toccati + concetti
    const nextSteps = [
      filesModified.length > 0 ? `Files modified: ${filesModified.slice(0, 10).join(', ')}` : '',
      sessionConcepts.length > 0 ? `Concepts: ${sessionConcepts.join(', ')}` : '',
    ].filter(Boolean).join('. ') || undefined;

    // Titolo basato sull'azione principale
    const mainAction = writes.length > 0
      ? `${writes.length} file modific${writes.length === 1 ? 'ato' : 'ati'}`
      : commands.length > 0
        ? `${commands.length} comand${commands.length === 1 ? 'o' : 'i'}`
        : `${sessionObs.length} osservazion${sessionObs.length === 1 ? 'e' : 'i'}`;

    await sdk.storeSummary({
      request: `${project} — ${mainAction} — ${new Date().toISOString().split('T')[0]}`,
      investigated,
      completed,
      learned,
      nextSteps,
    });

    // Notifica la dashboard in tempo reale
    await notifyWorker('summary-created', { project });

    // Crea checkpoint strutturato per resume futuro (sessione già recuperata sopra)
    const task = sessionObs[0]?.title || `${project} session`;
    const progress = completed || 'No progress recorded';
    const nextStepsCheckpoint = filesModified.length > 0
      ? `Continue work on: ${filesModified.slice(0, 5).join(', ')}`
      : undefined;

    await sdk.createCheckpoint(session.id, {
      task,
      progress,
      nextSteps: nextStepsCheckpoint,
      relevantFiles: filesModified.slice(0, 20)
    });

    // Completa la sessione (imposta status='completed' e completed_at)
    await sdk.completeSession(session.id);

    await notifyWorker('checkpoint-created', { project });
  } finally {
    sdk.close();
  }
});
