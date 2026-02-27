import type { ISummaryGenerator, SessionContext, GeneratedSummary } from './ISummaryGenerator.js';

/**
 * Template-based summary generator.
 * Extracts structured summary from observations using rules and heuristics.
 * Default provider — no LLM or API keys required.
 */
export class TemplateSummaryGenerator implements ISummaryGenerator {
  readonly name = 'template';

  async generate(context: SessionContext): Promise<GeneratedSummary> {
    const { observations, userPrompt } = context;

    // Group observations by category/type
    const fileWrites = observations.filter(o => o.type === 'file-write');
    const commands = observations.filter(o => o.type === 'command');
    const research = observations.filter(o =>
      ['research', 'decision', 'constraint', 'heuristic'].includes(o.type)
    );
    const debugging = observations.filter(
      o => o.auto_category === 'debugging' || o.type === 'bugfix'
    );

    // Request: use the user prompt
    const request = userPrompt || null;

    // Investigated: from research observations
    const investigated =
      research.length > 0 ? research.map(o => `- ${o.title}`).join('\n') : null;

    // Learned: from research narratives and decisions
    const learnedItems: string[] = [];
    for (const obs of research) {
      if (obs.narrative) learnedItems.push(obs.narrative);
      else if (obs.text) learnedItems.push(obs.text.substring(0, 200));
    }
    const learned =
      learnedItems.length > 0 ? learnedItems.slice(0, 5).join('\n') : null;

    // Completed: from file writes and commands
    const completedItems: string[] = [];
    for (const obs of fileWrites) {
      completedItems.push(`- ${obs.title}`);
    }
    if (commands.length > 0) {
      completedItems.push(`- Ran ${commands.length} command(s)`);
    }
    if (debugging.length > 0) {
      completedItems.push(`- Debugged ${debugging.length} issue(s)`);
    }
    const completed =
      completedItems.length > 0
        ? completedItems.slice(0, 10).join('\n')
        : null;

    // Next steps: inferred from uncompleted patterns
    const nextSteps = this._inferNextSteps(observations);

    // Notes: duration and stats
    const notesParts: string[] = [];
    if (context.durationMinutes) {
      notesParts.push(`Session duration: ${Math.round(context.durationMinutes)} minutes`);
    }
    notesParts.push(`${observations.length} observations recorded`);
    const notes = notesParts.join('. ');

    return { request, investigated, learned, completed, nextSteps, notes };
  }

  private _inferNextSteps(
    observations: Array<{ type: string; title: string; text: string | null }>
  ): string | null {
    const hints: string[] = [];

    // Look for TODO patterns in text
    for (const obs of observations) {
      const text = obs.text || '';
      const todoMatches = text.match(/(?:TODO|FIXME|HACK|XXX)[\s:]+([^\n]+)/gi);
      if (todoMatches) {
        for (const match of todoMatches.slice(0, 3)) {
          hints.push(`- ${match.trim()}`);
        }
      }
    }

    // Look for test failures suggesting follow-up
    const failedTests = observations.filter(
      o =>
        o.title.toLowerCase().includes('fail') ||
        (o.text && o.text.toLowerCase().includes('fail'))
    );
    if (failedTests.length > 0) {
      hints.push('- Fix failing tests');
    }

    return hints.length > 0 ? hints.slice(0, 5).join('\n') : null;
  }
}
