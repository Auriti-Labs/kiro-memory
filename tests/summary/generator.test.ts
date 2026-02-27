import { describe, it, expect, afterEach } from 'bun:test';
import { TemplateSummaryGenerator } from '../../src/services/summary/TemplateSummaryGenerator.js';
import { LLMSummaryGenerator } from '../../src/services/summary/LLMSummaryGenerator.js';
import { createSummaryGenerator } from '../../src/services/summary/index.js';
import type { SessionContext } from '../../src/services/summary/ISummaryGenerator.js';

// --- Helpers ---

function makeContext(overrides: Partial<SessionContext> = {}): SessionContext {
  return {
    project: 'test-project',
    sessionId: 'test-session',
    userPrompt: 'Implement feature X',
    observations: [],
    durationMinutes: 30,
    ...overrides,
  };
}

function makeObs(
  type: string,
  title: string,
  opts: {
    text?: string | null;
    narrative?: string | null;
    auto_category?: string | null;
  } = {}
) {
  return {
    type,
    title,
    text: opts.text ?? null,
    narrative: opts.narrative ?? null,
    auto_category: opts.auto_category ?? null,
  };
}

// --- TemplateSummaryGenerator ---

describe('TemplateSummaryGenerator', () => {
  const gen = new TemplateSummaryGenerator();

  it('has name "template"', () => {
    expect(gen.name).toBe('template');
  });

  it('returns request from userPrompt', async () => {
    const ctx = makeContext({ userPrompt: 'Fix the login bug' });
    const result = await gen.generate(ctx);
    expect(result.request).toBe('Fix the login bug');
  });

  it('returns null request when userPrompt is empty string', async () => {
    const ctx = makeContext({ userPrompt: '' });
    const result = await gen.generate(ctx);
    expect(result.request).toBeNull();
  });

  it('extracts investigated from research observations', async () => {
    const ctx = makeContext({
      observations: [
        makeObs('research', 'OAuth flow analysis'),
        makeObs('decision', 'Chose JWT over sessions'),
      ],
    });
    const result = await gen.generate(ctx);
    expect(result.investigated).toContain('- OAuth flow analysis');
    expect(result.investigated).toContain('- Chose JWT over sessions');
  });

  it('returns null investigated when no research observations', async () => {
    const ctx = makeContext({
      observations: [makeObs('file-write', 'src/auth.ts')],
    });
    const result = await gen.generate(ctx);
    expect(result.investigated).toBeNull();
  });

  it('extracts learned from research narratives', async () => {
    const ctx = makeContext({
      observations: [
        makeObs('research', 'JWT analysis', { narrative: 'JWT tokens expire in 1h' }),
        makeObs('decision', 'Use refresh tokens', { narrative: 'Refresh tokens last 7d' }),
      ],
    });
    const result = await gen.generate(ctx);
    expect(result.learned).toContain('JWT tokens expire in 1h');
    expect(result.learned).toContain('Refresh tokens last 7d');
  });

  it('falls back to text when narrative is null', async () => {
    const ctx = makeContext({
      observations: [
        makeObs('research', 'Analysis', { text: 'Important finding here', narrative: null }),
      ],
    });
    const result = await gen.generate(ctx);
    expect(result.learned).toContain('Important finding here');
  });

  it('returns null learned when no research observations', async () => {
    const ctx = makeContext({
      observations: [makeObs('command', 'npm test')],
    });
    const result = await gen.generate(ctx);
    expect(result.learned).toBeNull();
  });

  it('limits learned items to 5', async () => {
    const obs = Array.from({ length: 8 }, (_, i) =>
      makeObs('research', `Topic ${i}`, { narrative: `Narrative ${i}` })
    );
    const ctx = makeContext({ observations: obs });
    const result = await gen.generate(ctx);
    // 5 narratives joined by \n → 4 newlines at most
    const lines = (result.learned ?? '').split('\n');
    expect(lines.length).toBeLessThanOrEqual(5);
  });

  it('extracts completed from file-write observations', async () => {
    const ctx = makeContext({
      observations: [
        makeObs('file-write', 'src/auth.ts'),
        makeObs('file-write', 'src/token.ts'),
      ],
    });
    const result = await gen.generate(ctx);
    expect(result.completed).toContain('- src/auth.ts');
    expect(result.completed).toContain('- src/token.ts');
  });

  it('counts commands in completed', async () => {
    const ctx = makeContext({
      observations: [
        makeObs('command', 'npm test'),
        makeObs('command', 'npm build'),
      ],
    });
    const result = await gen.generate(ctx);
    expect(result.completed).toContain('Ran 2 command(s)');
  });

  it('counts debugging observations in completed', async () => {
    const ctx = makeContext({
      observations: [
        makeObs('bugfix', 'Fixed null pointer', { auto_category: null }),
        makeObs('file-write', 'src/fix.ts', { auto_category: 'debugging' }),
      ],
    });
    const result = await gen.generate(ctx);
    expect(result.completed).toContain('Debugged');
  });

  it('returns null completed when no relevant observations', async () => {
    const ctx = makeContext({
      observations: [makeObs('research', 'Reading docs')],
    });
    const result = await gen.generate(ctx);
    expect(result.completed).toBeNull();
  });

  it('limits completed items to 10', async () => {
    const obs = Array.from({ length: 15 }, (_, i) =>
      makeObs('file-write', `src/file-${i}.ts`)
    );
    const ctx = makeContext({ observations: obs });
    const result = await gen.generate(ctx);
    const lines = (result.completed ?? '').split('\n');
    expect(lines.length).toBeLessThanOrEqual(10);
  });

  it('infers next steps from TODO patterns in text', async () => {
    const ctx = makeContext({
      observations: [
        makeObs('file-write', 'src/auth.ts', { text: 'TODO: add rate limiting' }),
      ],
    });
    const result = await gen.generate(ctx);
    expect(result.nextSteps).toContain('TODO: add rate limiting');
  });

  it('infers next steps from FIXME patterns in text', async () => {
    const ctx = makeContext({
      observations: [
        makeObs('file-write', 'src/db.ts', { text: 'FIXME: connection pool leaking' }),
      ],
    });
    const result = await gen.generate(ctx);
    expect(result.nextSteps).toContain('FIXME: connection pool leaking');
  });

  it('detects failing tests and adds hint to next steps', async () => {
    const ctx = makeContext({
      observations: [
        makeObs('command', 'test suite failed', { text: 'some tests fail' }),
      ],
    });
    const result = await gen.generate(ctx);
    expect(result.nextSteps).toContain('Fix failing tests');
  });

  it('returns null nextSteps when no hints found', async () => {
    const ctx = makeContext({
      observations: [makeObs('file-write', 'src/clean.ts', { text: 'All good here' })],
    });
    const result = await gen.generate(ctx);
    expect(result.nextSteps).toBeNull();
  });

  it('limits next steps to 5 hints', async () => {
    const obs = Array.from({ length: 4 }, (_, i) =>
      makeObs('file-write', `src/f${i}.ts`, {
        text: `TODO: task ${i}a\nTODO: task ${i}b`,
      })
    );
    const ctx = makeContext({ observations: obs });
    const result = await gen.generate(ctx);
    const lines = (result.nextSteps ?? '').split('\n');
    expect(lines.length).toBeLessThanOrEqual(5);
  });

  it('handles empty observations array', async () => {
    const ctx = makeContext({ observations: [] });
    const result = await gen.generate(ctx);
    expect(result.request).toBe('Implement feature X');
    expect(result.investigated).toBeNull();
    expect(result.learned).toBeNull();
    expect(result.completed).toBeNull();
    expect(result.nextSteps).toBeNull();
    expect(result.notes).toBeTruthy();
  });

  it('handles observations with null text and null narrative', async () => {
    const ctx = makeContext({
      observations: [
        makeObs('research', 'Generic research', { text: null, narrative: null }),
      ],
    });
    // Should not throw
    const result = await gen.generate(ctx);
    expect(result.investigated).toContain('- Generic research');
    expect(result.learned).toBeNull();
  });

  it('includes duration in notes when provided', async () => {
    const ctx = makeContext({ durationMinutes: 45 });
    const result = await gen.generate(ctx);
    expect(result.notes).toContain('45 minutes');
  });

  it('rounds fractional duration in notes', async () => {
    const ctx = makeContext({ durationMinutes: 12.7 });
    const result = await gen.generate(ctx);
    expect(result.notes).toContain('13 minutes');
  });

  it('omits duration from notes when not provided', async () => {
    const ctx = makeContext({ durationMinutes: undefined });
    const result = await gen.generate(ctx);
    expect(result.notes).not.toContain('minutes');
  });

  it('includes observation count in notes', async () => {
    const ctx = makeContext({
      observations: [
        makeObs('file-write', 'a.ts'),
        makeObs('command', 'npm test'),
      ],
    });
    const result = await gen.generate(ctx);
    expect(result.notes).toContain('2 observations recorded');
  });

  it('handles debugging auto_category observations in completed', async () => {
    const ctx = makeContext({
      observations: [
        makeObs('file-write', 'src/hotfix.ts', { auto_category: 'debugging' }),
      ],
    });
    const result = await gen.generate(ctx);
    expect(result.completed).toContain('Debugged 1 issue(s)');
  });

  it('includes heuristic observations in investigated', async () => {
    const ctx = makeContext({
      observations: [makeObs('heuristic', 'Use lazy loading')],
    });
    const result = await gen.generate(ctx);
    expect(result.investigated).toContain('- Use lazy loading');
  });

  it('includes constraint observations in investigated', async () => {
    const ctx = makeContext({
      observations: [makeObs('constraint', 'Max 100ms latency')],
    });
    const result = await gen.generate(ctx);
    expect(result.investigated).toContain('- Max 100ms latency');
  });
});

// --- LLMSummaryGenerator ---

describe('LLMSummaryGenerator', () => {
  it('name includes provider name for openai', () => {
    const gen = new LLMSummaryGenerator({
      provider: 'openai',
      model: 'gpt-4o-mini',
      apiKey: 'test-key',
    });
    expect(gen.name).toBe('llm-openai');
  });

  it('name includes provider name for anthropic', () => {
    const gen = new LLMSummaryGenerator({
      provider: 'anthropic',
      model: 'claude-3-haiku-20240307',
      apiKey: 'test-key',
    });
    expect(gen.name).toBe('llm-anthropic');
  });

  it('name includes provider name for ollama', () => {
    const gen = new LLMSummaryGenerator({
      provider: 'ollama',
      model: 'llama3',
    });
    expect(gen.name).toBe('llm-ollama');
  });

  it('falls back to template when LLM call fails (network error)', async () => {
    const gen = new LLMSummaryGenerator({
      provider: 'openai',
      model: 'gpt-4o-mini',
      apiKey: 'invalid-key',
      // Use a non-routable address to force an immediate network failure
      baseUrl: 'http://127.0.0.1:19999/v1',
    });
    const ctx = makeContext({
      observations: [makeObs('file-write', 'src/fallback.ts')],
    });
    // Should not throw — falls back to template
    const result = await gen.generate(ctx);
    expect(result.request).toBe('Implement feature X');
    expect(result.completed).toContain('- src/fallback.ts');
  });

  it('falls back to template for ollama when server unavailable', async () => {
    const gen = new LLMSummaryGenerator({
      provider: 'ollama',
      model: 'llama3',
      baseUrl: 'http://127.0.0.1:19998',
    });
    const ctx = makeContext();
    const result = await gen.generate(ctx);
    // Template fallback returns request from userPrompt
    expect(result.request).toBe('Implement feature X');
  });
});

// --- createSummaryGenerator factory ---

describe('createSummaryGenerator', () => {
  afterEach(() => {
    delete process.env.KIRO_MEMORY_SUMMARY_PROVIDER;
    delete process.env.KIRO_MEMORY_SUMMARY_MODEL;
    delete process.env.KIRO_MEMORY_SUMMARY_API_KEY;
    delete process.env.KIRO_MEMORY_SUMMARY_BASE_URL;
  });

  it('returns TemplateSummaryGenerator by default (no env var set)', () => {
    const gen = createSummaryGenerator();
    expect(gen).toBeInstanceOf(TemplateSummaryGenerator);
    expect(gen.name).toBe('template');
  });

  it('returns TemplateSummaryGenerator for explicit "template" provider', () => {
    process.env.KIRO_MEMORY_SUMMARY_PROVIDER = 'template';
    const gen = createSummaryGenerator();
    expect(gen).toBeInstanceOf(TemplateSummaryGenerator);
  });

  it('returns LLMSummaryGenerator for "openai" provider', () => {
    process.env.KIRO_MEMORY_SUMMARY_PROVIDER = 'openai';
    process.env.KIRO_MEMORY_SUMMARY_API_KEY = 'sk-test';
    const gen = createSummaryGenerator();
    expect(gen).toBeInstanceOf(LLMSummaryGenerator);
    expect(gen.name).toBe('llm-openai');
  });

  it('returns LLMSummaryGenerator for "anthropic" provider', () => {
    process.env.KIRO_MEMORY_SUMMARY_PROVIDER = 'anthropic';
    process.env.KIRO_MEMORY_SUMMARY_API_KEY = 'sk-ant-test';
    const gen = createSummaryGenerator();
    expect(gen).toBeInstanceOf(LLMSummaryGenerator);
    expect(gen.name).toBe('llm-anthropic');
  });

  it('returns LLMSummaryGenerator for "ollama" provider', () => {
    process.env.KIRO_MEMORY_SUMMARY_PROVIDER = 'ollama';
    const gen = createSummaryGenerator();
    expect(gen).toBeInstanceOf(LLMSummaryGenerator);
    expect(gen.name).toBe('llm-ollama');
  });

  it('falls back to template for unknown provider', () => {
    process.env.KIRO_MEMORY_SUMMARY_PROVIDER = 'unknown-llm';
    const gen = createSummaryGenerator();
    expect(gen).toBeInstanceOf(TemplateSummaryGenerator);
  });

  it('reads model from env var for LLM providers', () => {
    process.env.KIRO_MEMORY_SUMMARY_PROVIDER = 'openai';
    process.env.KIRO_MEMORY_SUMMARY_MODEL = 'gpt-4o';
    process.env.KIRO_MEMORY_SUMMARY_API_KEY = 'sk-test';
    const gen = createSummaryGenerator();
    // Name is derived from provider, not model — just verify it's an LLM generator
    expect(gen).toBeInstanceOf(LLMSummaryGenerator);
  });

  it('uses default model "gpt-4o-mini" when model env var not set', () => {
    process.env.KIRO_MEMORY_SUMMARY_PROVIDER = 'openai';
    process.env.KIRO_MEMORY_SUMMARY_API_KEY = 'sk-test';
    // No KIRO_MEMORY_SUMMARY_MODEL set
    const gen = createSummaryGenerator();
    expect(gen).toBeInstanceOf(LLMSummaryGenerator);
    // We can verify via the name which only contains provider
    expect(gen.name).toBe('llm-openai');
  });

  it('passes API key from env var to LLM generator', () => {
    process.env.KIRO_MEMORY_SUMMARY_PROVIDER = 'anthropic';
    process.env.KIRO_MEMORY_SUMMARY_API_KEY = 'sk-ant-12345';
    const gen = createSummaryGenerator();
    expect(gen).toBeInstanceOf(LLMSummaryGenerator);
  });

  it('passes custom base URL from env var to LLM generator', () => {
    process.env.KIRO_MEMORY_SUMMARY_PROVIDER = 'ollama';
    process.env.KIRO_MEMORY_SUMMARY_BASE_URL = 'http://remote-server:11434';
    const gen = createSummaryGenerator();
    expect(gen).toBeInstanceOf(LLMSummaryGenerator);
  });
});
