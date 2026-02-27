import type { ReportData } from '../types/worker-types.js';

/**
 * Report formatters for Kiro Memory.
 * Three outputs: ANSI text (CLI), markdown (file/sharing), JSON (automations).
 */

// ============================================================================
// ANSI text format (for CLI)
// ============================================================================

export function formatReportText(data: ReportData): string {
  const lines: string[] = [];

  // Header
  lines.push('');
  lines.push(`  \x1b[36m═══ Kiro Memory Report — ${data.period.label} ═══\x1b[0m`);
  lines.push(`  \x1b[2m${data.period.start} → ${data.period.end} (${data.period.days} days)\x1b[0m`);
  lines.push('');

  // Overview
  lines.push(`  \x1b[1mOverview\x1b[0m`);
  lines.push(`    Observations:  ${data.overview.observations}`);
  lines.push(`    Summaries:     ${data.overview.summaries}`);
  lines.push(`    Sessions:      ${data.overview.sessions}`);
  lines.push(`    Prompts:       ${data.overview.prompts}`);
  lines.push(`    Knowledge:     ${data.overview.knowledgeCount}`);
  if (data.overview.staleCount > 0) {
    lines.push(`    Stale:         ${data.overview.staleCount}`);
  }
  lines.push('');

  // Session stats
  if (data.sessionStats.total > 0) {
    const completionPct = data.sessionStats.total > 0
      ? Math.round((data.sessionStats.completed / data.sessionStats.total) * 100)
      : 0;
    lines.push(`  \x1b[1mSessions\x1b[0m`);
    lines.push(`    Total: ${data.sessionStats.total} | Completed: ${data.sessionStats.completed} (${completionPct}%)`);
    if (data.sessionStats.avgDurationMinutes > 0) {
      lines.push(`    Avg duration: ${data.sessionStats.avgDurationMinutes} min`);
    }
    lines.push('');
  }

  // Timeline (bar chart ASCII)
  if (data.timeline.length > 0) {
    lines.push(`  \x1b[1mTimeline\x1b[0m`);
    const maxCount = Math.max(...data.timeline.map(t => t.count));
    const maxBarLen = 30;
    for (const entry of data.timeline) {
      const barLen = maxCount > 0 ? Math.round((entry.count / maxCount) * maxBarLen) : 0;
      const bar = '\x1b[32m' + '▓'.repeat(barLen) + '\x1b[0m';
      const dayShort = entry.day.substring(5); // MM-DD
      lines.push(`    ${dayShort}  ${bar} ${entry.count}`);
    }
    lines.push('');
  }

  // Type distribution
  if (data.typeDistribution.length > 0) {
    lines.push(`  \x1b[1mBy Type\x1b[0m`);
    for (const entry of data.typeDistribution) {
      lines.push(`    ${entry.type.padEnd(16)} ${entry.count}`);
    }
    lines.push('');
  }

  // Learnings
  if (data.topLearnings.length > 0) {
    lines.push(`  \x1b[1mKey Learnings\x1b[0m`);
    for (const learning of data.topLearnings) {
      lines.push(`    - ${learning}`);
    }
    lines.push('');
  }

  // Completed tasks
  if (data.completedTasks.length > 0) {
    lines.push(`  \x1b[1mCompleted\x1b[0m`);
    for (const task of data.completedTasks) {
      lines.push(`    - ${task}`);
    }
    lines.push('');
  }

  // Next steps
  if (data.nextSteps.length > 0) {
    lines.push(`  \x1b[1mNext Steps\x1b[0m`);
    for (const step of data.nextSteps) {
      lines.push(`    - ${step}`);
    }
    lines.push('');
  }

  // File hotspots
  if (data.fileHotspots.length > 0) {
    lines.push(`  \x1b[1mFile Hotspots\x1b[0m`);
    for (const entry of data.fileHotspots.slice(0, 10)) {
      lines.push(`    ${entry.file} (${entry.count}x)`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

// ============================================================================
// Markdown format (for file/sharing)
// ============================================================================

export function formatReportMarkdown(data: ReportData): string {
  const lines: string[] = [];

  // Header
  lines.push(`# Kiro Memory Report — ${data.period.label}`);
  lines.push('');
  lines.push(`**Period**: ${data.period.start} → ${data.period.end} (${data.period.days} days)`);
  lines.push('');

  // Overview table
  lines.push('## Overview');
  lines.push('');
  lines.push('| Metric | Count |');
  lines.push('|--------|------:|');
  lines.push(`| Observations | ${data.overview.observations} |`);
  lines.push(`| Summaries | ${data.overview.summaries} |`);
  lines.push(`| Sessions | ${data.overview.sessions} |`);
  lines.push(`| Prompts | ${data.overview.prompts} |`);
  lines.push(`| Knowledge items | ${data.overview.knowledgeCount} |`);
  if (data.overview.staleCount > 0) {
    lines.push(`| Stale observations | ${data.overview.staleCount} |`);
  }
  lines.push('');

  // Sessions
  if (data.sessionStats.total > 0) {
    const completionPct = Math.round((data.sessionStats.completed / data.sessionStats.total) * 100);
    lines.push('## Sessions');
    lines.push('');
    lines.push(`- **Total**: ${data.sessionStats.total}`);
    lines.push(`- **Completed**: ${data.sessionStats.completed} (${completionPct}%)`);
    if (data.sessionStats.avgDurationMinutes > 0) {
      lines.push(`- **Avg duration**: ${data.sessionStats.avgDurationMinutes} min`);
    }
    lines.push('');
  }

  // Timeline
  if (data.timeline.length > 0) {
    lines.push('## Activity Timeline');
    lines.push('');
    lines.push('| Date | Observations |');
    lines.push('|------|------------:|');
    for (const entry of data.timeline) {
      lines.push(`| ${entry.day} | ${entry.count} |`);
    }
    lines.push('');
  }

  // Type distribution
  if (data.typeDistribution.length > 0) {
    lines.push('## Observation Types');
    lines.push('');
    for (const entry of data.typeDistribution) {
      lines.push(`- **${entry.type}**: ${entry.count}`);
    }
    lines.push('');
  }

  // Learnings
  if (data.topLearnings.length > 0) {
    lines.push('## Key Learnings');
    lines.push('');
    for (const learning of data.topLearnings) {
      lines.push(`- ${learning}`);
    }
    lines.push('');
  }

  // Completed
  if (data.completedTasks.length > 0) {
    lines.push('## Completed');
    lines.push('');
    for (const task of data.completedTasks) {
      lines.push(`- ${task}`);
    }
    lines.push('');
  }

  // Next steps
  if (data.nextSteps.length > 0) {
    lines.push('## Next Steps');
    lines.push('');
    for (const step of data.nextSteps) {
      lines.push(`- ${step}`);
    }
    lines.push('');
  }

  // File hotspots
  if (data.fileHotspots.length > 0) {
    lines.push('## File Hotspots');
    lines.push('');
    lines.push('| File | Modifications |');
    lines.push('|------|-------------:|');
    for (const entry of data.fileHotspots.slice(0, 10)) {
      lines.push(`| \`${entry.file}\` | ${entry.count} |`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

// ============================================================================
// JSON format (for automations/webhooks)
// ============================================================================

export function formatReportJson(data: ReportData): string {
  return JSON.stringify(data, null, 2);
}
