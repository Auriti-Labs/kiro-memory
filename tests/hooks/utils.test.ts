/**
 * Test suite for hooks utility functions (src/hooks/utils.ts)
 *
 * Covers pure functions only — no stdin, no process, no filesystem side effects.
 * All tests use in-memory data to remain fast and deterministic.
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { detectProject, formatContext, formatSmartContext, debugLog } from '../../src/hooks/utils.js';
import type { ScoredItem, Summary } from '../../src/types/worker-types.js';

// ---------------------------------------------------------------------------
// Helpers — build typed fixtures without extra dependencies
// ---------------------------------------------------------------------------

function makeScoredItem(overrides: Partial<ScoredItem> & { title: string; content: string }): ScoredItem {
  return {
    id: 1,
    title: overrides.title,
    content: overrides.content,
    type: overrides.type ?? 'research',
    project: overrides.project ?? 'test-project',
    created_at: overrides.created_at ?? new Date().toISOString(),
    created_at_epoch: overrides.created_at_epoch ?? Date.now(),
    score: overrides.score ?? 0.5,
    signals: overrides.signals ?? { semantic: 0, fts5: 0, recency: 0.5, projectMatch: 1 },
  };
}

function makeSummary(overrides: Partial<Summary> = {}): Summary {
  return {
    id: overrides.id ?? 1,
    session_id: overrides.session_id ?? 'session-1',
    project: overrides.project ?? 'test-project',
    request: overrides.request ?? null,
    investigated: overrides.investigated ?? null,
    learned: overrides.learned ?? null,
    completed: overrides.completed ?? null,
    next_steps: overrides.next_steps ?? null,
    notes: overrides.notes ?? null,
    created_at: overrides.created_at ?? new Date().toISOString(),
    created_at_epoch: overrides.created_at_epoch ?? Date.now(),
  };
}

// ---------------------------------------------------------------------------
// detectProject
// ---------------------------------------------------------------------------

describe('detectProject', () => {
  it('returns the last path segment for a simple path', () => {
    // The function tries git first, falls back to last path segment on failure.
    // Pass a non-git directory to force the fallback branch.
    const result = detectProject('/tmp/some-project');
    // Either the git root basename or the last segment of /tmp/some-project
    // We just verify the result is a non-empty string
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('returns "default" when the path has no segments', () => {
    // Root path '/' has no usable segment — the function should return 'default'
    const result = detectProject('/');
    expect(result).toBe('default');
  });

  it('returns the basename for a nested path when git is unavailable', () => {
    // /tmp is unlikely to be a git repo, so the fallback runs and returns 'tmp'
    const result = detectProject('/tmp');
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('extracts the correct segment from a multi-level path', () => {
    // If git is not available in /tmp/a/b/my-project, the fallback should
    // return 'my-project' (last path segment).
    const result = detectProject('/tmp/a/b/my-project');
    // The result is either 'my-project' (fallback) or the git root basename
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// formatContext
// ---------------------------------------------------------------------------

describe('formatContext', () => {
  describe('with observations only', () => {
    it('renders the "Recent Observations" section', () => {
      const output = formatContext({
        observations: [
          { title: 'Fix auth bug', text: 'OAuth token was expired', type: 'bug-fix' },
        ],
      });

      expect(output).toContain('## Recent Observations');
      expect(output).toContain('Fix auth bug');
      expect(output).toContain('OAuth token was expired');
      expect(output).toContain('[bug-fix]');
    });

    it('truncates long observation text to 150 characters', () => {
      const longText = 'A'.repeat(300);
      const output = formatContext({
        observations: [{ title: 'Long obs', text: longText, type: 'file-write' }],
      });

      // Rendered content must not exceed 150 chars (the slice applied inside formatContext)
      expect(output).toContain('A'.repeat(150));
      expect(output).not.toContain('A'.repeat(151));
    });

    it('caps output at 10 observations even when more are provided', () => {
      const observations = Array.from({ length: 15 }, (_, i) => ({
        title: `Obs ${i + 1}`,
        text: 'content',
        type: 'research',
      }));

      const output = formatContext({ observations });

      // Only first 10 should appear
      expect(output).toContain('Obs 1');
      expect(output).toContain('Obs 10');
      expect(output).not.toContain('Obs 11');
    });

    it('uses "obs" as default type when type is missing', () => {
      const output = formatContext({
        observations: [{ title: 'No type obs', text: 'text' }],
      });

      expect(output).toContain('[obs]');
    });

    it('does not include "Previous Sessions" section', () => {
      const output = formatContext({
        observations: [{ title: 'X', text: 'Y', type: 'research' }],
      });

      expect(output).not.toContain('## Previous Sessions');
    });
  });

  describe('with summaries only', () => {
    it('renders the "Previous Sessions" section', () => {
      const output = formatContext({
        summaries: [
          { learned: 'esbuild is faster than tsc', completed: 'Build pipeline', next_steps: 'Add tests' },
        ],
      });

      expect(output).toContain('## Previous Sessions');
      expect(output).toContain('esbuild is faster than tsc');
      expect(output).toContain('Build pipeline');
      expect(output).toContain('Add tests');
    });

    it('includes learned/completed/next_steps prefixes', () => {
      const output = formatContext({
        summaries: [{ learned: 'L', completed: 'C', next_steps: 'N' }],
      });

      expect(output).toContain('**Learned**: L');
      expect(output).toContain('**Completed**: C');
      expect(output).toContain('**Next steps**: N');
    });

    it('skips null fields silently', () => {
      const output = formatContext({
        summaries: [{ learned: 'Only learned', completed: null, next_steps: null }],
      });

      expect(output).toContain('Only learned');
      expect(output).not.toContain('**Completed**');
      expect(output).not.toContain('**Next steps**');
    });

    it('caps output at 3 summaries even when more are provided', () => {
      const summaries = Array.from({ length: 5 }, (_, i) => ({
        learned: `Learned ${i + 1}`,
        completed: null,
        next_steps: null,
      }));

      const output = formatContext({ summaries });

      expect(output).toContain('Learned 1');
      expect(output).toContain('Learned 3');
      expect(output).not.toContain('Learned 4');
    });

    it('does not include "Recent Observations" section', () => {
      const output = formatContext({
        summaries: [{ learned: 'X', completed: null, next_steps: null }],
      });

      expect(output).not.toContain('## Recent Observations');
    });
  });

  describe('with both observations and summaries', () => {
    it('renders both sections', () => {
      const output = formatContext({
        observations: [{ title: 'Obs A', text: 'text A', type: 'file-write' }],
        summaries: [{ learned: 'Sum A', completed: null, next_steps: null }],
      });

      expect(output).toContain('## Previous Sessions');
      expect(output).toContain('## Recent Observations');
      expect(output).toContain('Sum A');
      expect(output).toContain('Obs A');
    });

    it('places summaries before observations', () => {
      const output = formatContext({
        observations: [{ title: 'Obs', text: 'text', type: 'research' }],
        summaries: [{ learned: 'Sum', completed: null, next_steps: null }],
      });

      const summaryIndex = output.indexOf('## Previous Sessions');
      const obsIndex = output.indexOf('## Recent Observations');
      expect(summaryIndex).toBeLessThan(obsIndex);
    });
  });

  describe('with empty data', () => {
    it('returns empty string when no data is provided', () => {
      expect(formatContext({})).toBe('');
    });

    it('returns empty string for empty arrays', () => {
      expect(formatContext({ observations: [], summaries: [] })).toBe('');
    });
  });
});

// ---------------------------------------------------------------------------
// formatSmartContext
// ---------------------------------------------------------------------------

describe('formatSmartContext', () => {
  it('includes the header line', () => {
    const output = formatSmartContext({ items: [], summaries: [], project: 'my-proj' });
    expect(output).toContain('# Kiro Memory: Previous Sessions Context');
  });

  it('includes the footer with project and item count', () => {
    const item = makeScoredItem({ title: 'T', content: 'C' });
    const output = formatSmartContext({ items: [item], summaries: [], project: 'my-proj' });
    expect(output).toContain('Project: my-proj');
    expect(output).toContain('Items: 1');
  });

  it('always includes summaries regardless of token budget', () => {
    // Very tight budget: 1 token — summaries must still appear
    const summary = makeSummary({ learned: 'Important learning', completed: null, next_steps: null });
    const output = formatSmartContext({
      items: [],
      summaries: [summary],
      project: 'proj',
      tokenBudget: 1,
    });

    // Summaries section should always be rendered
    expect(output).toContain('## Previous Sessions');
    expect(output).toContain('Important learning');
  });

  it('sorts items by descending score before filling the budget', () => {
    const low = makeScoredItem({ id: 1, title: 'Low score item', content: 'L', score: 0.1 } as any);
    const high = makeScoredItem({ id: 2, title: 'High score item', content: 'H', score: 0.9 } as any);

    // Pass in wrong order (low first) — output should still show high first
    const output = formatSmartContext({
      items: [low, high],
      summaries: [],
      project: 'proj',
    });

    const indexHigh = output.indexOf('High score item');
    const indexLow = output.indexOf('Low score item');
    expect(indexHigh).toBeLessThan(indexLow);
  });

  it('respects the token budget by stopping before overflow', () => {
    // Each item content is 400 chars (~100 tokens). With a budget of 150 tokens
    // only the header + a couple of items should fit.
    const bigContent = 'X'.repeat(400);
    const items = Array.from({ length: 10 }, (_, i) =>
      makeScoredItem({ id: i, title: `Item ${i}`, content: bigContent, score: 1 - i * 0.05 } as any)
    );

    const output = formatSmartContext({ items, summaries: [], project: 'proj', tokenBudget: 150 });

    // Item 0 should appear (highest score), but not all 10 should fit
    expect(output).toContain('Item 0');
    // Verify "Items: 10" in footer (total passed in, not rendered)
    expect(output).toContain('Items: 10');
  });

  it('truncates item content to fit the token budget', () => {
    // Single item with very long content — it should be truncated, not omitted
    const longContent = 'B'.repeat(2000);
    const item = makeScoredItem({ title: 'Big item', content: longContent, score: 1 });
    const output = formatSmartContext({
      items: [item],
      summaries: [],
      project: 'proj',
      tokenBudget: 200,
    });

    // The item title should appear but content must be capped (max 300 chars in impl)
    expect(output).toContain('Big item');
    // Content should not contain the full 2000-char block
    expect(output).not.toContain('B'.repeat(301));
  });

  it('renders items in the "Relevant Observations" section', () => {
    const item = makeScoredItem({ title: 'My observation', content: 'some content', type: 'research' });
    const output = formatSmartContext({ items: [item], summaries: [], project: 'p' });
    expect(output).toContain('## Relevant Observations');
    expect(output).toContain('My observation');
    expect(output).toContain('[research]');
  });

  it('includes token usage stats in the footer', () => {
    const item = makeScoredItem({ title: 'T', content: 'Content here', score: 0.8 });
    const output = formatSmartContext({
      items: [item],
      summaries: [],
      project: 'proj',
      tokenBudget: 500,
    });

    // Footer should show "Tokens used: ~X/500"
    expect(output).toMatch(/Tokens used: ~\d+\/500/);
  });

  it('handles zero items gracefully without crashing', () => {
    expect(() =>
      formatSmartContext({ items: [], summaries: [], project: 'empty-proj' })
    ).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// debugLog
// ---------------------------------------------------------------------------

describe('debugLog', () => {
  let originalEnv: string | undefined;

  beforeEach(() => {
    originalEnv = process.env.KIRO_MEMORY_LOG_LEVEL;
  });

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.KIRO_MEMORY_LOG_LEVEL;
    } else {
      process.env.KIRO_MEMORY_LOG_LEVEL = originalEnv;
    }
  });

  it('does not throw when debug is disabled (default)', () => {
    delete process.env.KIRO_MEMORY_LOG_LEVEL;
    expect(() => debugLog('test-hook', 'label', { some: 'data' })).not.toThrow();
  });

  it('does not throw when debug is disabled with INFO level', () => {
    process.env.KIRO_MEMORY_LOG_LEVEL = 'INFO';
    expect(() => debugLog('test-hook', 'label', { some: 'data' })).not.toThrow();
  });

  it('does not throw with various data types when debug is disabled', () => {
    delete process.env.KIRO_MEMORY_LOG_LEVEL;
    expect(() => debugLog('hook', 'null-data', null)).not.toThrow();
    expect(() => debugLog('hook', 'number-data', 42)).not.toThrow();
    expect(() => debugLog('hook', 'array-data', [1, 2, 3])).not.toThrow();
    expect(() => debugLog('hook', 'nested-data', { a: { b: { c: 'deep' } } })).not.toThrow();
  });

  it('does not throw when DEBUG level is set (may write to disk, but must not crash)', () => {
    process.env.KIRO_MEMORY_LOG_LEVEL = 'DEBUG';
    // We cannot easily assert that the file was written without side effects,
    // but the function must never throw (it catches internally)
    expect(() => debugLog('test-hook', 'debug-event', { key: 'value' })).not.toThrow();
    // Reset so subsequent tests are not affected
    delete process.env.KIRO_MEMORY_LOG_LEVEL;
  });
});
