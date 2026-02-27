#!/usr/bin/env node
/**
 * Stop hook for Kiro CLI
 *
 * Trigger: when the agent completes its response
 * Function: generates and saves a summary of the current session
 */

import { runHook, detectProject, notifyWorker } from './utils.js';
import { createKiroMemory } from '../sdk/index.js';

runHook('stop', async (input) => {
  const project = detectProject(input.cwd);
  const sdk = createKiroMemory({ project, skipMigrations: true });

  try {
    // Get or create DB session for this content_session_id
    const contentSessionId = input.session_id || `stop-${Date.now()}`;
    const session = await sdk.getOrCreateSession(contentSessionId);

    // Filter observations: use session's started_at_epoch if available,
    // otherwise fallback to 4h window. Fix: content_session_id ≠ memory_session_id
    const recentObs = await sdk.getRecentObservations(50);
    const sessionStart = session.started_at_epoch || (Date.now() - (4 * 60 * 60 * 1000));
    const sessionObs = recentObs.filter(o => o.created_at_epoch >= sessionStart);

    if (sessionObs.length === 0) return;

    // Categorize observations by type
    const byType = new Map<string, typeof sessionObs>();
    for (const obs of sessionObs) {
      const group = byType.get(obs.type) || [];
      group.push(obs);
      byType.set(obs.type, group);
    }

    // Section "investigated": files read and research
    const readFiles = byType.get('file-read') || [];
    const researched = byType.get('research') || [];
    const investigated = [
      ...readFiles.slice(0, 5).map(o => o.narrative || o.title),
      ...researched.slice(0, 3).map(o => o.narrative || o.title),
    ].filter(Boolean).join('; ') || undefined;

    // Section "completed": modified files and executed commands
    const writes = byType.get('file-write') || [];
    const commands = byType.get('command') || [];
    const completed = [
      ...writes.slice(0, 8).map(o => o.narrative || o.title),
      ...commands.slice(0, 3).map(o => o.narrative || o.title),
    ].filter(Boolean).join('; ') || undefined;

    // Section "learned": research content and code-intelligence
    const learned = researched
      .map(o => o.text?.substring(0, 150))
      .filter(Boolean)
      .slice(0, 5)
      .join('; ') || undefined;

    // Unique modified files
    const filesModified = [...new Set(
      sessionObs
        .filter(o => o.files_modified)
        .map(o => o.files_modified!)
        .flatMap(f => f.split(',').map(s => s.trim()))
    )];

    // Unique concepts from the session
    const sessionConcepts = [...new Set(
      sessionObs
        .filter(o => o.concepts)
        .flatMap(o => o.concepts!.split(',').map(c => c.trim()))
    )].slice(0, 10);

    // Section "next_steps": modified files + concepts
    const nextSteps = [
      filesModified.length > 0 ? `Files modified: ${filesModified.slice(0, 10).join(', ')}` : '',
      sessionConcepts.length > 0 ? `Concepts: ${sessionConcepts.join(', ')}` : '',
    ].filter(Boolean).join('. ') || undefined;

    // Title based on main action
    const mainAction = writes.length > 0
      ? `${writes.length} file${writes.length === 1 ? '' : 's'} modified`
      : commands.length > 0
        ? `${commands.length} command${commands.length === 1 ? '' : 's'}`
        : `${sessionObs.length} observation${sessionObs.length === 1 ? '' : 's'}`;

    await sdk.storeSummary({
      request: `${project} — ${mainAction} — ${new Date().toISOString().split('T')[0]}`,
      investigated,
      completed,
      learned,
      nextSteps,
    });

    // Notify dashboard in real-time
    await notifyWorker('summary-created', { project });

    // Create structured checkpoint for future resume (session already retrieved above)
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

    // Complete the session (sets status='completed' and completed_at)
    await sdk.completeSession(session.id);

    await notifyWorker('checkpoint-created', { project });
  } finally {
    sdk.close();
  }
});
