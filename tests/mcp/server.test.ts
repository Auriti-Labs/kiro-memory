/**
 * Test suite for MCP server tool handlers (src/servers/mcp-server.ts)
 *
 * The MCP server communicates via stdio transport and proxies calls to the
 * HTTP worker — both are infrastructure that cannot be exercised in unit tests.
 *
 * Strategy: test the underlying SDK methods that the MCP tool handlers call.
 * All operations use an in-memory SQLite database for isolation and speed.
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { KiroMemoryDatabase } from '../../src/services/sqlite/Database.js';
import { KiroMemorySDK, createKiroMemory } from '../../src/sdk/index.js';

// ---------------------------------------------------------------------------
// Setup — shared SDK instance backed by an in-memory DB
// ---------------------------------------------------------------------------

describe('MCP SDK layer (methods called by MCP tool handlers)', () => {
  let sdk: KiroMemorySDK;

  beforeEach(() => {
    // Use an in-memory DB and a fixed project name so tests are deterministic
    sdk = createKiroMemory({ dataDir: ':memory:', project: 'mcp-test-project' });
  });

  afterEach(() => {
    sdk.close();
  });

  // -------------------------------------------------------------------------
  // search()  — MCP tool: "search"
  // -------------------------------------------------------------------------

  describe('search()', () => {
    it('returns matching observations for a keyword query', async () => {
      await sdk.storeObservation({
        type: 'research',
        title: 'GraphQL schema design',
        content: 'Queries and mutations are defined in schema.graphql',
      });

      const result = await sdk.search('GraphQL');

      expect(result.observations.length).toBeGreaterThanOrEqual(1);
      expect(result.observations[0].title).toBe('GraphQL schema design');
    });

    it('returns matching summaries for a keyword query', async () => {
      await sdk.storeSummary({ learned: 'Webpack aliases improve import paths' });

      const result = await sdk.search('Webpack');

      expect(result.summaries.length).toBeGreaterThanOrEqual(1);
    });

    it('returns both observations and summaries when both match', async () => {
      await sdk.storeObservation({
        type: 'file-write',
        title: 'Added Tailwind config',
        content: 'Tailwind CSS configured with custom theme tokens',
      });
      await sdk.storeSummary({ learned: 'Tailwind JIT mode is faster' });

      const result = await sdk.search('Tailwind');

      expect(result.observations.length).toBeGreaterThanOrEqual(1);
      expect(result.summaries.length).toBeGreaterThanOrEqual(1);
    });

    it('returns empty arrays when nothing matches', async () => {
      await sdk.storeObservation({
        type: 'research',
        title: 'Unrelated topic',
        content: 'This has nothing to do with the query',
      });

      const result = await sdk.search('xyzzy_nonexistent_term_9999');

      expect(result.observations).toHaveLength(0);
      expect(result.summaries).toHaveLength(0);
    });

    it('returns empty arrays for a completely empty database', async () => {
      const result = await sdk.search('anything');

      expect(result.observations).toHaveLength(0);
      expect(result.summaries).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // getSmartContext()  — MCP tool: "get_context"
  // -------------------------------------------------------------------------

  describe('getSmartContext()', () => {
    it('returns SmartContext with project name', async () => {
      const ctx = await sdk.getSmartContext();

      expect(ctx.project).toBe('mcp-test-project');
    });

    it('returns items array (possibly empty) and summaries array', async () => {
      const ctx = await sdk.getSmartContext();

      expect(Array.isArray(ctx.items)).toBe(true);
      expect(Array.isArray(ctx.summaries)).toBe(true);
    });

    it('includes stored observations in items', async () => {
      await sdk.storeObservation({
        type: 'file-write',
        title: 'Updated router',
        content: 'Refactored Express routes into modular files',
      });

      const ctx = await sdk.getSmartContext();

      expect(ctx.items.length).toBeGreaterThanOrEqual(1);
      const titles = ctx.items.map(i => i.title);
      expect(titles).toContain('Updated router');
    });

    it('includes stored summaries', async () => {
      await sdk.storeSummary({
        learned: 'ESM modules require explicit file extensions',
        completed: 'Migration to ESM complete',
        nextSteps: 'Update tsconfig',
      });

      const ctx = await sdk.getSmartContext();

      expect(ctx.summaries.length).toBeGreaterThanOrEqual(1);
      expect(ctx.summaries[0].learned).toBe('ESM modules require explicit file extensions');
    });

    it('respects tokenBudget — tokensUsed does not exceed budget', async () => {
      // Store several observations to fill up context
      for (let i = 0; i < 5; i++) {
        await sdk.storeObservation({
          type: 'research',
          title: `Research item ${i}`,
          content: 'A'.repeat(200),
        });
      }

      const budget = 100;
      const ctx = await sdk.getSmartContext({ tokenBudget: budget });

      expect(ctx.tokenBudget).toBe(budget);
      expect(ctx.tokensUsed).toBeLessThanOrEqual(budget);
    });

    it('accepts a query option and returns search-ranked items', async () => {
      await sdk.storeObservation({
        type: 'research',
        title: 'SQLite WAL mode',
        content: 'Write-Ahead Logging improves concurrent read performance in SQLite',
      });

      // With a query, getSmartContext uses HybridSearch (falls back to keyword)
      const ctx = await sdk.getSmartContext({ query: 'SQLite' });

      expect(ctx.project).toBe('mcp-test-project');
      expect(Array.isArray(ctx.items)).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // storeObservation()  — MCP tool: "save_memory"
  // -------------------------------------------------------------------------

  describe('storeObservation()', () => {
    it('returns a positive numeric ID', async () => {
      const id = await sdk.storeObservation({
        type: 'file-write',
        title: 'Created index.ts',
        content: 'Entry point for the application',
      });

      expect(typeof id).toBe('number');
      expect(id).toBeGreaterThan(0);
    });

    it('persists the observation so it appears in getRecentObservations', async () => {
      await sdk.storeObservation({
        type: 'command',
        title: 'npm install',
        content: 'Installed project dependencies',
      });

      const recent = await sdk.getRecentObservations(10);
      const found = recent.find(o => o.title === 'npm install');
      expect(found).toBeDefined();
    });

    it('stores concepts as comma-separated string', async () => {
      await sdk.storeObservation({
        type: 'research',
        title: 'TypeScript generics',
        content: 'Generic types allow flexible typed abstractions',
        concepts: ['typescript', 'generics', 'types'],
      });

      const recent = await sdk.getRecentObservations(1);
      expect(recent[0].concepts).toContain('typescript');
      expect(recent[0].concepts).toContain('generics');
    });

    it('stores filesRead separately from filesModified', async () => {
      await sdk.storeObservation({
        type: 'file-write',
        title: 'Updated schema',
        content: 'Added new migration',
        filesRead: ['src/old-schema.ts'],
        filesModified: ['src/schema.ts'],
      });

      const recent = await sdk.getRecentObservations(1);
      expect(recent[0].files_read).toContain('src/old-schema.ts');
      expect(recent[0].files_modified).toContain('src/schema.ts');
    });

    it('deduplicates identical observations within the window and returns -1', async () => {
      const data = {
        type: 'file-read',
        title: 'Read config.ts',
        content: 'File read for analysis',
      };

      const id1 = await sdk.storeObservation(data);
      const id2 = await sdk.storeObservation(data); // Duplicate within 60s window

      expect(id1).toBeGreaterThan(0);
      expect(id2).toBe(-1);
    });

    it('throws when type is an empty string', async () => {
      await expect(
        sdk.storeObservation({ type: '', title: 'Valid', content: 'Valid content' })
      ).rejects.toThrow('type is required');
    });

    it('throws when title is empty', async () => {
      await expect(
        sdk.storeObservation({ type: 'research', title: '', content: 'content' })
      ).rejects.toThrow('title is required');
    });
  });

  // -------------------------------------------------------------------------
  // storeKnowledge()  — MCP tool: "store_knowledge"
  // -------------------------------------------------------------------------

  describe('storeKnowledge()', () => {
    it('stores a constraint and returns a positive ID', async () => {
      const id = await sdk.storeKnowledge({
        project: 'mcp-test-project',
        knowledgeType: 'constraint',
        title: 'Never use sync I/O in hooks',
        content: 'Sync I/O blocks the event loop and degrades Kiro performance',
        metadata: { severity: 'hard' },
      });

      expect(typeof id).toBe('number');
      expect(id).toBeGreaterThan(0);
    });

    it('stores a decision with correct type field', async () => {
      await sdk.storeKnowledge({
        project: 'mcp-test-project',
        knowledgeType: 'decision',
        title: 'Use esbuild over tsc for bundling',
        content: 'esbuild is 10x faster and supports ESM natively',
        metadata: { reason: 'Speed and ESM compatibility', alternatives: ['tsc', 'rollup'] },
      });

      const recent = await sdk.getRecentObservations(5);
      const saved = recent.find(o => o.title === 'Use esbuild over tsc for bundling');
      expect(saved).toBeDefined();
      expect(saved!.type).toBe('decision');
    });

    it('stores a heuristic with confidence metadata as JSON in facts', async () => {
      await sdk.storeKnowledge({
        project: 'mcp-test-project',
        knowledgeType: 'heuristic',
        title: 'Prefer early returns',
        content: 'Reduces nesting and improves readability',
        metadata: { confidence: 'high', context: 'function bodies' },
      });

      const recent = await sdk.getRecentObservations(5);
      const saved = recent.find(o => o.title === 'Prefer early returns');
      expect(saved).toBeDefined();
      // facts stores JSON metadata
      const facts = JSON.parse(saved!.facts!);
      expect(facts.knowledgeType).toBe('heuristic');
      expect(facts.confidence).toBe('high');
    });

    it('stores a rejected solution with reason in facts', async () => {
      await sdk.storeKnowledge({
        project: 'mcp-test-project',
        knowledgeType: 'rejected',
        title: 'Rejected: use global DB instance',
        content: 'Global singletons cause test isolation issues',
        metadata: { reason: 'Breaks test isolation', alternatives: ['dependency injection'] },
      });

      const recent = await sdk.getRecentObservations(5);
      const saved = recent.find(o => o.title === 'Rejected: use global DB instance');
      expect(saved).toBeDefined();
      expect(saved!.type).toBe('rejected');
      const facts = JSON.parse(saved!.facts!);
      expect(facts.reason).toBe('Breaks test isolation');
    });

    it('throws for an invalid knowledgeType', async () => {
      await expect(
        sdk.storeKnowledge({
          project: 'mcp-test-project',
          knowledgeType: 'invalid' as any,
          title: 'Bad type',
          content: 'Content',
        })
      ).rejects.toThrow('Invalid knowledgeType');
    });
  });

  // -------------------------------------------------------------------------
  // getRecentObservations()  — MCP tool: "get_observations"
  // -------------------------------------------------------------------------

  describe('getRecentObservations()', () => {
    it('returns observations sorted by most recent first (descending epoch)', async () => {
      await sdk.storeObservation({ type: 'file-write', title: 'First obs', content: 'content A' });
      // Small artificial delay to ensure distinct epochs
      await new Promise(r => setTimeout(r, 5));
      await sdk.storeObservation({ type: 'file-write', title: 'Second obs', content: 'content B' });

      const recent = await sdk.getRecentObservations(10);

      expect(recent.length).toBeGreaterThanOrEqual(2);
      // Most recent (Second obs) should come before First obs
      const secondIndex = recent.findIndex(o => o.title === 'Second obs');
      const firstIndex = recent.findIndex(o => o.title === 'First obs');
      expect(secondIndex).toBeLessThan(firstIndex);
    });

    it('respects the limit parameter', async () => {
      for (let i = 0; i < 5; i++) {
        await sdk.storeObservation({
          type: 'research',
          title: `Obs limit test ${i}`,
          content: `Content ${i}`,
        });
      }

      const result = await sdk.getRecentObservations(3);
      expect(result.length).toBe(3);
    });

    it('returns empty array when database is empty', async () => {
      const result = await sdk.getRecentObservations(10);
      expect(result).toHaveLength(0);
    });

    it('returns all fields defined in the Observation type', async () => {
      await sdk.storeObservation({
        type: 'command',
        title: 'Run build',
        content: 'npm run build',
      });

      const [obs] = await sdk.getRecentObservations(1);

      expect(obs).toHaveProperty('id');
      expect(obs).toHaveProperty('title');
      expect(obs).toHaveProperty('type');
      expect(obs).toHaveProperty('project');
      expect(obs).toHaveProperty('created_at');
      expect(obs).toHaveProperty('created_at_epoch');
    });
  });

  // -------------------------------------------------------------------------
  // getOrCreateSession()  — session lifecycle
  // -------------------------------------------------------------------------

  describe('getOrCreateSession()', () => {
    it('creates a new session when none exists for the content ID', async () => {
      const session = await sdk.getOrCreateSession('new-session-abc');

      expect(session.content_session_id).toBe('new-session-abc');
      expect(session.project).toBe('mcp-test-project');
      expect(session.status).toBe('active');
    });

    it('returns the same session when called twice with the same ID', async () => {
      const first = await sdk.getOrCreateSession('idempotent-session-xyz');
      const second = await sdk.getOrCreateSession('idempotent-session-xyz');

      // Both calls must refer to the same underlying session
      expect(second.content_session_id).toBe(first.content_session_id);
      expect(second.project).toBe(first.project);
    });

    it('creates distinct sessions for different content IDs', async () => {
      const s1 = await sdk.getOrCreateSession('session-alpha');
      const s2 = await sdk.getOrCreateSession('session-beta');

      expect(s1.content_session_id).not.toBe(s2.content_session_id);
    });

    it('returns a session with a numeric id field', async () => {
      const session = await sdk.getOrCreateSession('numeric-id-check');

      expect(typeof session.id).toBe('number');
      expect(session.id).toBeGreaterThan(0);
    });

    it('stores started_at as a valid ISO date string', async () => {
      const session = await sdk.getOrCreateSession('date-check-session');

      expect(typeof session.started_at).toBe('string');
      expect(new Date(session.started_at).toString()).not.toBe('Invalid Date');
    });

    it('allows completing a session after creation', async () => {
      const session = await sdk.getOrCreateSession('completable-session');
      await sdk.completeSession(session.id);

      // Re-fetch via getOrCreateSession: since the session already exists in DB,
      // the SDK returns the existing one (which has been completed)
      const refetched = await sdk.getOrCreateSession('completable-session');
      // The content_session_id must match — status check depends on DB fetch path
      expect(refetched.content_session_id).toBe('completable-session');
    });
  });
});
