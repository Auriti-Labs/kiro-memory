/**
 * Integration test suite — full session lifecycle via KiroMemorySDK.
 *
 * Uses an in-memory SQLite database so every test is isolated and fast.
 * Tests cover the complete flow:
 *   getOrCreateSession → storeObservation → storeSummary →
 *   createCheckpoint → completeSession → getSmartContext →
 *   getLatestProjectCheckpoint → search → token economics
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { KiroMemorySDK } from '../../src/sdk/index.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TEST_PROJECT = 'test-integration-project';

/** Create a fresh SDK instance backed by an in-memory database. */
function createSDK(project: string = TEST_PROJECT): KiroMemorySDK {
  return new KiroMemorySDK({ dataDir: ':memory:', project });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Session lifecycle — KiroMemorySDK integration', () => {
  let sdk: KiroMemorySDK;

  beforeEach(() => {
    sdk = createSDK();
  });

  afterEach(() => {
    sdk.close();
  });

  // -------------------------------------------------------------------------
  // 1. getOrCreateSession
  // -------------------------------------------------------------------------

  describe('getOrCreateSession', () => {
    it('creates a new session when the content session ID is unknown', async () => {
      const session = await sdk.getOrCreateSession('content-id-001');

      expect(session.id).toBeGreaterThan(0);
      expect(session.content_session_id).toBe('content-id-001');
      expect(session.project).toBe(TEST_PROJECT);
      expect(session.status).toBe('active');
    });

    it('returns the same session on a second call with the same content session ID', async () => {
      const first = await sdk.getOrCreateSession('content-id-002');
      const second = await sdk.getOrCreateSession('content-id-002');

      expect(second.id).toBe(first.id);
    });

    it('creates independent sessions for different content session IDs', async () => {
      const s1 = await sdk.getOrCreateSession('content-id-A');
      const s2 = await sdk.getOrCreateSession('content-id-B');

      expect(s1.id).not.toBe(s2.id);
    });
  });

  // -------------------------------------------------------------------------
  // 2. storeObservation — multiple types
  // -------------------------------------------------------------------------

  describe('storeObservation', () => {
    it('stores a file-write observation and returns a positive ID', async () => {
      const id = await sdk.storeObservation({
        type: 'file-write',
        title: 'Wrote src/services/Database.ts',
        content: 'Implemented migration runner with 9 versions',
        filesModified: ['src/services/Database.ts'],
      });

      expect(id).toBeGreaterThan(0);
    });

    it('stores a command observation', async () => {
      const id = await sdk.storeObservation({
        type: 'command',
        title: 'bun test',
        content: 'All 42 tests passed',
      });

      expect(id).toBeGreaterThan(0);
    });

    it('stores a research observation with concepts', async () => {
      const id = await sdk.storeObservation({
        type: 'research',
        title: 'SQLite WAL mode research',
        content: 'WAL mode allows concurrent reads and one writer',
        concepts: ['WAL', 'concurrency', 'SQLite'],
        narrative: 'Investigated WAL mode to improve hook + worker concurrency',
      });

      expect(id).toBeGreaterThan(0);
    });

    it('observations are retrievable via getRecentObservations', async () => {
      await sdk.storeObservation({ type: 'file-write', title: 'obs-A', content: 'content A' });
      await sdk.storeObservation({ type: 'command', title: 'obs-B', content: 'content B' });

      const recent = await sdk.getRecentObservations(10);
      expect(recent.length).toBe(2);
    });

    it('deduplication: second identical observation returns -1', async () => {
      await sdk.storeObservation({
        type: 'file-write',
        title: 'Duplicate title',
        content: 'Same content',
      });

      const secondId = await sdk.storeObservation({
        type: 'file-write',
        title: 'Duplicate title',
        content: 'Same content',
      });

      // Deduplication should prevent storing within the same window
      expect(secondId).toBe(-1);
    });

    it('validates: throws when type is empty', async () => {
      await expect(
        sdk.storeObservation({ type: '', title: 'Valid title', content: 'Valid content' })
      ).rejects.toThrow();
    });

    it('validates: throws when title is empty', async () => {
      await expect(
        sdk.storeObservation({ type: 'command', title: '', content: 'Valid content' })
      ).rejects.toThrow();
    });

    it('validates: throws when content is empty', async () => {
      await expect(
        sdk.storeObservation({ type: 'command', title: 'Valid title', content: '' })
      ).rejects.toThrow();
    });

    it('calculates discoveryTokens as ceil(content.length / 4)', async () => {
      const content = 'a'.repeat(400);
      const id = await sdk.storeObservation({
        type: 'research',
        title: 'Token test',
        content,
      });

      const obs = await sdk.getRecentObservations(1);
      expect(obs[0].discovery_tokens).toBe(100); // 400 / 4 = 100
    });
  });

  // -------------------------------------------------------------------------
  // 3. storeSummary
  // -------------------------------------------------------------------------

  describe('storeSummary', () => {
    it('creates a summary and returns a positive ID', async () => {
      const id = await sdk.storeSummary({
        request: 'Implement session lifecycle tests',
        learned: 'Bun test runner works well with in-memory SQLite',
        completed: 'Created tests/integration/session-lifecycle.test.ts',
        nextSteps: 'Run CI and verify coverage report',
        notes: 'No issues encountered',
      });

      expect(id).toBeGreaterThan(0);
    });

    it('summary appears in getRecentSummaries', async () => {
      await sdk.storeSummary({
        request: 'Summary test',
        learned: 'Integration tests are valuable',
      });

      const summaries = await sdk.getRecentSummaries();
      expect(summaries.length).toBeGreaterThanOrEqual(1);
      expect(summaries[0].request).toBe('Summary test');
    });

    it('validates: throws when a field exceeds 50KB', async () => {
      await expect(
        sdk.storeSummary({ learned: 'x'.repeat(50_001) })
      ).rejects.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // 4. createCheckpoint + getCheckpoint
  // -------------------------------------------------------------------------

  describe('createCheckpoint / getCheckpoint', () => {
    it('creates a checkpoint and retrieves it by session ID', async () => {
      const session = await sdk.getOrCreateSession('sess-checkpoint-1');

      const cpId = await sdk.createCheckpoint(session.id, {
        task: 'Implement FTS5 search module',
        progress: 'Search.ts created, triggers added',
        nextSteps: 'Backfill existing observations into FTS5 index',
        openQuestions: 'Should we use contentless FTS table?',
        relevantFiles: ['src/services/sqlite/Search.ts', 'src/services/sqlite/Database.ts'],
      });

      expect(cpId).toBeGreaterThan(0);

      const checkpoint = await sdk.getCheckpoint(session.id);
      expect(checkpoint).not.toBeNull();
      expect(checkpoint!.task).toBe('Implement FTS5 search module');
      expect(checkpoint!.progress).toBe('Search.ts created, triggers added');
      expect(checkpoint!.next_steps).toBe('Backfill existing observations into FTS5 index');
      expect(checkpoint!.open_questions).toBe('Should we use contentless FTS table?');
      expect(checkpoint!.relevant_files).toContain('Search.ts');
    });

    it('checkpoint stores a context_snapshot of recent observations', async () => {
      // Store observations so the snapshot has content
      await sdk.storeObservation({ type: 'file-write', title: 'obs-snap-1', content: 'some content' });

      const session = await sdk.getOrCreateSession('sess-snap');
      await sdk.createCheckpoint(session.id, { task: 'Snapshot test' });

      const cp = await sdk.getCheckpoint(session.id);
      expect(cp).not.toBeNull();
      expect(cp!.context_snapshot).not.toBeNull();

      // context_snapshot must be valid JSON
      const snapshot = JSON.parse(cp!.context_snapshot!);
      expect(Array.isArray(snapshot)).toBe(true);
    });

    it('getLatestProjectCheckpoint returns a checkpoint for the project', async () => {
      const s1 = await sdk.getOrCreateSession('sess-cp-proj-1');
      const s2 = await sdk.getOrCreateSession('sess-cp-proj-2');

      await sdk.createCheckpoint(s1.id, { task: 'First task' });
      await sdk.createCheckpoint(s2.id, { task: 'Second task' });

      // Both checkpoints belong to the same project — we verify the query
      // returns one of them (epoch tie-breaking is implementation-defined
      // when two rows are inserted within the same millisecond in-memory).
      const latest = await sdk.getLatestProjectCheckpoint();
      expect(latest).not.toBeNull();
      expect(['First task', 'Second task']).toContain(latest!.task);
    });

    it('returns null when no checkpoint exists for the session', async () => {
      const session = await sdk.getOrCreateSession('sess-no-cp');
      const cp = await sdk.getCheckpoint(session.id);
      expect(cp).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // 5. completeSession
  // -------------------------------------------------------------------------

  describe('completeSession', () => {
    it('marks a session as completed', async () => {
      const session = await sdk.getOrCreateSession('sess-complete-1');
      expect(session.status).toBe('active');

      await sdk.completeSession(session.id);

      // Verify the status changed in the database via the SDK's getOrCreateSession
      // (it will find the existing record, so status remains completed)
      const raw = sdk.getDb().query(
        'SELECT status FROM sessions WHERE id = ?'
      ).get(session.id) as { status: string } | null;

      expect(raw).not.toBeNull();
      expect(raw!.status).toBe('completed');
    });
  });

  // -------------------------------------------------------------------------
  // 6. getSmartContext
  // -------------------------------------------------------------------------

  describe('getSmartContext', () => {
    it('returns a SmartContext with the stored project name', async () => {
      const ctx = await sdk.getSmartContext();

      expect(ctx.project).toBe(TEST_PROJECT);
      expect(typeof ctx.tokenBudget).toBe('number');
      expect(ctx.tokenBudget).toBeGreaterThan(0);
    });

    it('includes stored observations in items', async () => {
      await sdk.storeObservation({
        type: 'file-write',
        title: 'Created README',
        content: 'Documentation for the project',
      });

      const ctx = await sdk.getSmartContext({ tokenBudget: 5000 });
      expect(ctx.items.length).toBeGreaterThan(0);
      expect(ctx.items.some(i => i.title === 'Created README')).toBe(true);
    });

    it('includes stored summaries in ctx.summaries', async () => {
      await sdk.storeSummary({
        request: 'Context test summary',
        completed: 'Verified smart context',
      });

      const ctx = await sdk.getSmartContext({ tokenBudget: 5000 });
      expect(ctx.summaries.length).toBeGreaterThan(0);
      expect(ctx.summaries[0].request).toBe('Context test summary');
    });

    it('respects the tokenBudget and does not exceed it', async () => {
      // Fill with observations large enough to test budget capping
      for (let i = 0; i < 10; i++) {
        await sdk.storeObservation({
          type: 'research',
          title: `Large observation ${i}`,
          content: 'x'.repeat(200), // 200 chars = ~50 tokens each
        });
      }

      const ctx = await sdk.getSmartContext({ tokenBudget: 100 });
      expect(ctx.tokensUsed).toBeLessThanOrEqual(100);
    });

    it('prioritizes knowledge-type observations over normal observations', async () => {
      await sdk.storeObservation({ type: 'command', title: 'Normal command', content: 'content' });
      await sdk.storeObservation({ type: 'command', title: 'Another command', content: 'content' });
      await sdk.storeObservation({
        type: 'decision',
        title: 'Use WAL mode for SQLite',
        content: 'Decided to use WAL for concurrent access',
      });

      const ctx = await sdk.getSmartContext({ tokenBudget: 5000 });

      // Knowledge items should appear before normal items
      const decisionIndex = ctx.items.findIndex(i => i.type === 'decision');
      const commandIndex = ctx.items.findIndex(i => i.type === 'command');

      if (decisionIndex !== -1 && commandIndex !== -1) {
        expect(decisionIndex).toBeLessThan(commandIndex);
      }
    });
  });

  // -------------------------------------------------------------------------
  // 7. getLatestProjectCheckpoint (resumeSession pattern)
  // -------------------------------------------------------------------------

  describe('resumeSession via getLatestProjectCheckpoint', () => {
    it('returns checkpoint data for continuation', async () => {
      const session = await sdk.getOrCreateSession('sess-resume-1');

      await sdk.storeObservation({
        type: 'file-write',
        title: 'Progress before pause',
        content: 'Partial implementation saved',
      });

      await sdk.createCheckpoint(session.id, {
        task: 'Implement analytics module',
        progress: '3/5 functions done',
        nextSteps: 'Complete getSessionStats and getAnalyticsOverview',
        openQuestions: 'Should we add date filtering?',
        relevantFiles: ['src/services/sqlite/Analytics.ts'],
      });

      // Simulate resuming in a new call
      const latestCp = await sdk.getLatestProjectCheckpoint();

      expect(latestCp).not.toBeNull();
      expect(latestCp!.task).toBe('Implement analytics module');
      expect(latestCp!.progress).toBe('3/5 functions done');
      expect(latestCp!.next_steps).toBe('Complete getSessionStats and getAnalyticsOverview');
    });

    it('returns null when no checkpoints exist for the project', async () => {
      const freshSdk = createSDK('brand-new-project');
      const cp = await freshSdk.getLatestProjectCheckpoint();
      freshSdk.close();
      expect(cp).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // 8. search
  // -------------------------------------------------------------------------

  describe('search', () => {
    it('finds observations by keyword in title', async () => {
      await sdk.storeObservation({
        type: 'research',
        title: 'esbuild bundler configuration',
        content: 'Configured esbuild to handle bun:sqlite shims',
      });

      const results = await sdk.search('esbuild');
      expect(results.observations.length).toBeGreaterThan(0);
      expect(results.observations[0].title).toContain('esbuild');
    });

    it('finds observations by keyword in content', async () => {
      await sdk.storeObservation({
        type: 'command',
        title: 'Run migration',
        content: 'Applied migration version 9 with composite indexes',
      });

      const results = await sdk.search('composite indexes');
      expect(results.observations.length).toBeGreaterThan(0);
    });

    it('finds summaries by keyword', async () => {
      await sdk.storeSummary({
        request: 'Build the vector search module',
        learned: 'Cosine similarity works well for semantic search',
        completed: 'VectorSearch.ts implemented',
      });

      const results = await sdk.search('cosine similarity');
      expect(results.summaries.length).toBeGreaterThan(0);
    });

    it('returns empty arrays when no match is found', async () => {
      await sdk.storeObservation({
        type: 'command',
        title: 'run lint',
        content: 'no issues found',
      });

      const results = await sdk.search('zzznomatch12345');
      expect(results.observations).toHaveLength(0);
      expect(results.summaries).toHaveLength(0);
    });

    it('search is project-scoped and does not leak cross-project data', async () => {
      const sdkA = createSDK('project-alpha-search');
      const sdkB = createSDK('project-beta-search');

      await sdkA.storeObservation({ type: 'research', title: 'alpha secret', content: 'alpha specific content' });
      await sdkB.storeObservation({ type: 'research', title: 'beta secret', content: 'beta specific content' });

      const alphaResults = await sdkA.search('alpha specific');
      const betaResults = await sdkA.search('beta specific');

      // Alpha SDK should find alpha, not beta
      expect(alphaResults.observations.length).toBeGreaterThan(0);
      expect(betaResults.observations).toHaveLength(0);

      sdkA.close();
      sdkB.close();
    });
  });

  // -------------------------------------------------------------------------
  // 9. searchAdvanced (FTS5)
  // -------------------------------------------------------------------------

  describe('searchAdvanced — FTS5', () => {
    it('returns observations matching the FTS5 query', async () => {
      await sdk.storeObservation({
        type: 'research',
        title: 'TypeScript strict mode',
        content: 'Enabling strict mode eliminates implicit any types',
        concepts: ['TypeScript', 'strict', 'type-safety'],
      });

      const results = await sdk.searchAdvanced('TypeScript strict');
      expect(results.observations.length).toBeGreaterThan(0);
    });

    it('filters by type when specified', async () => {
      await sdk.storeObservation({ type: 'command', title: 'build command', content: 'npm run build' });
      await sdk.storeObservation({ type: 'research', title: 'build research', content: 'researched build tools' });

      const results = await sdk.searchAdvanced('build', { type: 'research' });
      expect(results.observations.every(o => o.type === 'research')).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // 10. Token economics
  // -------------------------------------------------------------------------

  describe('Token economics', () => {
    it('discoveryTokens is ceil(content.length / 4)', async () => {
      const content = 'a'.repeat(120); // 120 chars → ceil(120/4) = 30 tokens
      const id = await sdk.storeObservation({
        type: 'research',
        title: 'Token economics test',
        content,
      });

      const obs = await sdk.getObservationsByIds([id]);
      expect(obs).toHaveLength(1);
      expect(obs[0].discovery_tokens).toBe(30);
    });

    it('total discoveryTokens accumulate across observations', async () => {
      const content40 = 'b'.repeat(40);  // 10 tokens
      const content80 = 'c'.repeat(80);  // 20 tokens

      await sdk.storeObservation({ type: 'command', title: 'obs-tok-1', content: content40 });
      await sdk.storeObservation({ type: 'research', title: 'obs-tok-2', content: content80 });

      const obs = await sdk.getRecentObservations(10);
      const totalDiscovery = obs.reduce((sum, o) => sum + (o.discovery_tokens || 0), 0);
      expect(totalDiscovery).toBe(30); // 10 + 20
    });

    it('getSmartContext.tokensUsed reflects actual token consumption', async () => {
      await sdk.storeObservation({
        type: 'file-write',
        title: 'Token test obs',
        content: 'x'.repeat(100),
      });

      const ctx = await sdk.getSmartContext({ tokenBudget: 5000 });
      expect(ctx.tokensUsed).toBeGreaterThan(0);
      expect(ctx.tokensUsed).toBeLessThanOrEqual(ctx.tokenBudget);
    });
  });

  // -------------------------------------------------------------------------
  // 11. Full session lifecycle — end-to-end scenario
  // -------------------------------------------------------------------------

  describe('Full session lifecycle — end-to-end', () => {
    it('completes a session with observations, summary, checkpoint, and search', async () => {
      // Step 1: Create session
      const session = await sdk.getOrCreateSession('e2e-session-001');
      expect(session.id).toBeGreaterThan(0);

      // Step 2: Store observations of different types
      const obsIds: number[] = [];

      obsIds.push(await sdk.storeObservation({
        type: 'file-write',
        title: 'Implemented HybridSearch.ts',
        content: 'Combines FTS5 keyword search with cosine-similarity vector search',
        filesModified: ['src/services/search/HybridSearch.ts'],
        concepts: ['hybrid-search', 'FTS5', 'vector-search'],
      }));

      obsIds.push(await sdk.storeObservation({
        type: 'command',
        title: 'bun test tests/worker/search/',
        content: 'All search tests passed in 1.2s',
      }));

      obsIds.push(await sdk.storeObservation({
        type: 'research',
        title: 'BM25 ranking research',
        content: 'BM25 weights: title=10, text=1, narrative=5, concepts=3',
        narrative: 'Researched optimal BM25 weights for code repository context',
      }));

      expect(obsIds.every(id => id > 0)).toBe(true);

      // Step 3: Store session summary
      const summaryId = await sdk.storeSummary({
        request: 'Implement hybrid search combining FTS5 and vector search',
        investigated: 'BM25 algorithm, cosine similarity, HybridSearch API',
        learned: 'FTS5 BM25 and vector cosine similarity complement each other well',
        completed: 'HybridSearch.ts implemented and all tests passing',
        nextSteps: 'Integrate hybrid search into agentSpawn hook context injection',
        notes: 'BM25 weights tuned for code repositories',
      });
      expect(summaryId).toBeGreaterThan(0);

      // Step 4: Create checkpoint
      const cpId = await sdk.createCheckpoint(session.id, {
        task: 'Hybrid search implementation',
        progress: 'Complete — all tests passing',
        nextSteps: 'Integration into hooks pipeline',
        relevantFiles: ['src/services/search/HybridSearch.ts'],
      });
      expect(cpId).toBeGreaterThan(0);

      // Step 5: Complete the session
      await sdk.completeSession(session.id);

      const sessionRow = sdk.getDb().query(
        'SELECT status FROM sessions WHERE id = ?'
      ).get(session.id) as { status: string } | null;
      expect(sessionRow!.status).toBe('completed');

      // Step 6: Verify smart context contains observations and summaries
      const ctx = await sdk.getSmartContext({ tokenBudget: 10_000 });
      expect(ctx.project).toBe(TEST_PROJECT);
      expect(ctx.items.length).toBeGreaterThan(0);
      expect(ctx.summaries.length).toBeGreaterThan(0);

      // Observations present in context
      const ctxTitles = ctx.items.map(i => i.title);
      expect(ctxTitles).toContain('Implemented HybridSearch.ts');

      // Step 7: Resume via latest checkpoint
      const latestCp = await sdk.getLatestProjectCheckpoint();
      expect(latestCp).not.toBeNull();
      expect(latestCp!.task).toBe('Hybrid search implementation');
      expect(latestCp!.progress).toBe('Complete — all tests passing');

      // Step 8: Verify observations are searchable
      const searchResults = await sdk.search('BM25');
      expect(searchResults.observations.length).toBeGreaterThan(0);

      const ftsResults = await sdk.searchAdvanced('cosine similarity');
      expect(ftsResults.observations.length).toBeGreaterThan(0);
    });
  });

  // -------------------------------------------------------------------------
  // 12. getDecayStats
  // -------------------------------------------------------------------------

  describe('getDecayStats', () => {
    it('returns accurate total count', async () => {
      await sdk.storeObservation({ type: 'command', title: 'decay-obs-1', content: 'content 1' });
      await sdk.storeObservation({ type: 'research', title: 'decay-obs-2', content: 'content 2' });

      const stats = await sdk.getDecayStats();
      expect(stats.total).toBe(2);
    });

    it('neverAccessed equals total when no observations have been accessed', async () => {
      await sdk.storeObservation({ type: 'command', title: 'unaccessed', content: 'content' });

      const stats = await sdk.getDecayStats();
      expect(stats.neverAccessed).toBe(stats.total);
    });

    it('stale count starts at zero', async () => {
      await sdk.storeObservation({ type: 'file-write', title: 'fresh file', content: 'content' });

      const stats = await sdk.getDecayStats();
      expect(stats.stale).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // 13. getObservationsByIds
  // -------------------------------------------------------------------------

  describe('getObservationsByIds', () => {
    it('retrieves observations by a list of IDs', async () => {
      const id1 = await sdk.storeObservation({ type: 'command', title: 'cmd-1', content: 'content 1' });
      const id2 = await sdk.storeObservation({ type: 'research', title: 'res-2', content: 'content 2' });

      const obs = await sdk.getObservationsByIds([id1, id2]);
      expect(obs).toHaveLength(2);

      const titles = obs.map(o => o.title);
      expect(titles).toContain('cmd-1');
      expect(titles).toContain('res-2');
    });

    it('returns empty array for an empty ID list', async () => {
      const obs = await sdk.getObservationsByIds([]);
      expect(obs).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // 14. getTimeline
  // -------------------------------------------------------------------------

  describe('getTimeline', () => {
    it('returns a timeline anchored around a specific observation', async () => {
      await sdk.storeObservation({ type: 'command', title: 'before-1', content: 'content' });
      await sdk.storeObservation({ type: 'command', title: 'before-2', content: 'content' });
      const anchorId = await sdk.storeObservation({ type: 'research', title: 'anchor', content: 'content' });
      await sdk.storeObservation({ type: 'command', title: 'after-1', content: 'content' });

      const timeline = await sdk.getTimeline(anchorId, 2, 2);
      expect(timeline.length).toBeGreaterThanOrEqual(3);

      const titles = timeline.map(e => e.title);
      expect(titles).toContain('anchor');
    });

    it('returns empty array for a non-existent anchor ID', async () => {
      const timeline = await sdk.getTimeline(99999);
      expect(timeline).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // 15. storeKnowledge (structured knowledge types)
  // -------------------------------------------------------------------------

  describe('storeKnowledge', () => {
    it('stores a constraint and returns a positive ID', async () => {
      const id = await sdk.storeKnowledge({
        project: TEST_PROJECT,
        knowledgeType: 'constraint',
        title: 'No dynamic require() in ESM modules',
        content: 'The project uses ESM, dynamic require is forbidden except via createRequire',
        metadata: { severity: 'hard', reason: 'ESM compatibility' },
      });

      expect(id).toBeGreaterThan(0);
    });

    it('stores a decision and appears in getRecentObservations', async () => {
      await sdk.storeKnowledge({
        project: TEST_PROJECT,
        knowledgeType: 'decision',
        title: 'Use esbuild over tsc for bundling',
        content: 'esbuild is 100x faster and supports ESM output',
        metadata: { reason: 'Build performance', alternatives: ['tsc', 'rollup'] },
      });

      const recent = await sdk.getRecentObservations(10);
      const decision = recent.find(o => o.type === 'decision');
      expect(decision).not.toBeUndefined();
      expect(decision!.title).toBe('Use esbuild over tsc for bundling');
    });

    it('stores a heuristic', async () => {
      const id = await sdk.storeKnowledge({
        project: TEST_PROJECT,
        knowledgeType: 'heuristic',
        title: 'Prefer in-memory DB for unit tests',
        content: 'In-memory SQLite is faster and fully isolated',
        metadata: { context: 'testing', confidence: 'high' },
      });

      expect(id).toBeGreaterThan(0);
    });

    it('stores a rejected approach', async () => {
      const id = await sdk.storeKnowledge({
        project: TEST_PROJECT,
        knowledgeType: 'rejected',
        title: 'Rejected: use filesystem DB in tests',
        content: 'File-based DB creates state pollution between test runs',
        metadata: { reason: 'Test isolation', alternatives: [':memory:'] },
      });

      expect(id).toBeGreaterThan(0);
    });

    it('throws for an invalid knowledgeType', async () => {
      await expect(
        sdk.storeKnowledge({
          project: TEST_PROJECT,
          knowledgeType: 'invalid-type' as any,
          title: 'Bad type',
          content: 'Should fail',
        })
      ).rejects.toThrow('Invalid knowledgeType');
    });

    it('knowledge types are prioritized in smart context', async () => {
      // Add normal observations first
      for (let i = 0; i < 3; i++) {
        await sdk.storeObservation({ type: 'command', title: `cmd-${i}`, content: 'content' });
      }

      // Add knowledge observation
      await sdk.storeKnowledge({
        project: TEST_PROJECT,
        knowledgeType: 'decision',
        title: 'Architecture decision',
        content: 'Use SQLite for persistence',
      });

      const ctx = await sdk.getSmartContext({ tokenBudget: 10_000 });
      const firstItem = ctx.items[0];

      // Knowledge items should be at the top due to boost
      expect(firstItem.type).toBe('decision');
    });
  });
});
