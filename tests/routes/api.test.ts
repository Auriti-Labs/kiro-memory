/**
 * Test suite for API route-layer database functions.
 *
 * Strategy: test the database functions that route handlers delegate to,
 * using an in-memory SQLite database. This approach keeps the tests
 * fast and hermetic without spinning up an HTTP server.
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { KiroMemoryDatabase } from '../../src/services/sqlite/Database.js';
import {
  createObservation,
  getObservationsByProject,
  isDuplicateObservation,
  consolidateObservations,
} from '../../src/services/sqlite/Observations.js';
import {
  createSummary,
  getSummariesByProject,
  getSummaryBySession,
  searchSummaries,
} from '../../src/services/sqlite/Summaries.js';
import {
  searchObservationsFTS,
  searchObservationsLIKE,
  getObservationsByIds,
  getTimeline,
  getProjectStats,
} from '../../src/services/sqlite/Search.js';
import {
  getAnalyticsOverview,
  getObservationsTimeline,
  getTypeDistribution,
  getSessionStats,
} from '../../src/services/sqlite/Analytics.js';
import {
  createSession,
  completeSession,
} from '../../src/services/sqlite/Sessions.js';
import {
  isValidProject,
  isValidString,
  parseIntSafe,
} from '../../src/services/worker-context.js';
import type { Database } from 'bun:sqlite';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Insert a minimal observation and return its database ID. */
function insertObs(
  db: Database,
  project: string,
  type: string,
  title: string,
  content: string = 'content',
  sessionId: string = 'sess-1',
  promptNumber: number = 1
): number {
  return createObservation(
    db,
    sessionId,
    project,
    type,
    title,
    null,
    content,
    null,
    null,
    null,
    null,
    null,
    promptNumber
  );
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('API route database functions', () => {
  let kmDb: KiroMemoryDatabase;
  let db: Database;

  beforeEach(() => {
    kmDb = new KiroMemoryDatabase(':memory:');
    db = kmDb.db;
  });

  afterEach(() => {
    kmDb.close();
  });

  // -------------------------------------------------------------------------
  // Observations
  // -------------------------------------------------------------------------

  describe('Observations — createObservation / getObservationsByProject', () => {
    it('stores an observation and retrieves it by project', () => {
      const id = insertObs(db, 'proj-a', 'file-write', 'Wrote src/index.ts');

      expect(id).toBeGreaterThan(0);

      const rows = getObservationsByProject(db, 'proj-a');
      expect(rows).toHaveLength(1);
      expect(rows[0].title).toBe('Wrote src/index.ts');
      expect(rows[0].type).toBe('file-write');
      expect(rows[0].project).toBe('proj-a');
    });

    it('respects the limit parameter', () => {
      for (let i = 0; i < 10; i++) {
        insertObs(db, 'proj-limit', 'command', `cmd-${i}`);
      }
      const rows = getObservationsByProject(db, 'proj-limit', 3);
      expect(rows).toHaveLength(3);
    });

    it('returns rows ordered newest-first (DESC by created_at_epoch)', () => {
      insertObs(db, 'proj-order', 'command', 'first');
      insertObs(db, 'proj-order', 'command', 'second');

      const rows = getObservationsByProject(db, 'proj-order');
      // The most recently inserted one should appear first
      expect(rows[0].title).toBe('second');
    });

    it('stores all optional fields when provided', () => {
      const id = createObservation(
        db,
        'sess-full',
        'proj-full',
        'research',
        'Research title',
        'Subtitle here',
        'Full content text',
        'Narrative text',
        'fact1, fact2',
        'concept1, concept2',
        '/src/read.ts',
        '/src/write.ts',
        5,
        'hash-abc',
        200
      );

      const rows = getObservationsByProject(db, 'proj-full');
      expect(rows).toHaveLength(1);
      const obs = rows[0];
      expect(obs.id).toBe(id);
      expect(obs.subtitle).toBe('Subtitle here');
      expect(obs.narrative).toBe('Narrative text');
      expect(obs.facts).toBe('fact1, fact2');
      expect(obs.concepts).toBe('concept1, concept2');
      expect(obs.files_read).toBe('/src/read.ts');
      expect(obs.files_modified).toBe('/src/write.ts');
      expect(obs.prompt_number).toBe(5);
      expect(obs.content_hash).toBe('hash-abc');
      expect(obs.discovery_tokens).toBe(200);
    });
  });

  // -------------------------------------------------------------------------
  // Project isolation
  // -------------------------------------------------------------------------

  describe('Project isolation', () => {
    it('getObservationsByProject only returns rows for the requested project', () => {
      insertObs(db, 'project-alpha', 'command', 'alpha-cmd');
      insertObs(db, 'project-beta', 'command', 'beta-cmd');
      insertObs(db, 'project-alpha', 'file-write', 'alpha-write');

      const alpha = getObservationsByProject(db, 'project-alpha');
      const beta = getObservationsByProject(db, 'project-beta');

      expect(alpha).toHaveLength(2);
      expect(alpha.every(o => o.project === 'project-alpha')).toBe(true);

      expect(beta).toHaveLength(1);
      expect(beta[0].title).toBe('beta-cmd');
    });

    it('getSummariesByProject is scoped per project', () => {
      createSummary(db, 'sess-a', 'project-alpha', 'Request A', null, 'Learned A', null, null, null);
      createSummary(db, 'sess-b', 'project-beta', 'Request B', null, 'Learned B', null, null, null);

      const alphaSum = getSummariesByProject(db, 'project-alpha');
      const betaSum = getSummariesByProject(db, 'project-beta');

      expect(alphaSum).toHaveLength(1);
      expect(alphaSum[0].learned).toBe('Learned A');

      expect(betaSum).toHaveLength(1);
      expect(betaSum[0].learned).toBe('Learned B');
    });
  });

  // -------------------------------------------------------------------------
  // Summaries
  // -------------------------------------------------------------------------

  describe('Summaries — createSummary / getSummaries', () => {
    it('creates a summary and retrieves it by session ID', () => {
      const sessionId = 'session-sum-1';
      const id = createSummary(
        db,
        sessionId,
        'proj-sum',
        'Fix auth',
        'Investigated OAuth',
        'Learned about tokens',
        'Fixed the bug',
        'Write regression test',
        'Noted the RFC'
      );

      expect(id).toBeGreaterThan(0);

      const summary = getSummaryBySession(db, sessionId);
      expect(summary).not.toBeNull();
      expect(summary!.request).toBe('Fix auth');
      expect(summary!.investigated).toBe('Investigated OAuth');
      expect(summary!.learned).toBe('Learned about tokens');
      expect(summary!.completed).toBe('Fixed the bug');
      expect(summary!.next_steps).toBe('Write regression test');
      expect(summary!.notes).toBe('Noted the RFC');
    });

    it('getSummariesByProject returns all summaries for the project', () => {
      createSummary(db, 'sess-1', 'proj-multi', 'First', null, null, null, null, null);
      createSummary(db, 'sess-2', 'proj-multi', 'Second', null, null, null, null, null);

      const rows = getSummariesByProject(db, 'proj-multi');
      expect(rows).toHaveLength(2);

      // Both requests must be present (order is DESC by epoch, but may be
      // identical in fast in-memory runs — only verify set membership)
      const requests = rows.map(r => r.request);
      expect(requests).toContain('First');
      expect(requests).toContain('Second');
    });

    it('searchSummaries finds summaries by keyword in "learned" field', () => {
      createSummary(db, 'sess-x', 'proj-search', 'Req', null, 'TypeScript generics are powerful', null, null, null);
      createSummary(db, 'sess-y', 'proj-search', 'Req', null, 'Python asyncio basics', null, null, null);

      const results = searchSummaries(db, 'generics', 'proj-search');
      expect(results).toHaveLength(1);
      expect(results[0].learned).toContain('generics');
    });
  });

  // -------------------------------------------------------------------------
  // FTS5 search
  // -------------------------------------------------------------------------

  describe('Search — searchObservationsFTS / searchObservationsLIKE', () => {
    it('searchObservationsFTS returns relevant observations', () => {
      insertObs(db, 'proj-fts', 'research', 'SQLite FTS5 tutorial', 'FTS5 supports full-text search');
      insertObs(db, 'proj-fts', 'command', 'Run tests', 'bun test watch');

      const results = searchObservationsFTS(db, 'FTS5', { project: 'proj-fts' });
      expect(results.length).toBeGreaterThan(0);
      expect(results.some(r => r.title === 'SQLite FTS5 tutorial')).toBe(true);
    });

    it('searchObservationsLIKE matches substring in title', () => {
      insertObs(db, 'proj-like', 'file-write', 'Updated README');
      insertObs(db, 'proj-like', 'file-write', 'Updated package.json');
      insertObs(db, 'proj-like', 'command', 'Run linter');

      const results = searchObservationsLIKE(db, 'Updated', { project: 'proj-like' });
      expect(results).toHaveLength(2);
    });

    it('searchObservationsLIKE matches substring in content (text field)', () => {
      insertObs(db, 'proj-like2', 'research', 'Some title', 'esbuild is very fast');
      insertObs(db, 'proj-like2', 'research', 'Other', 'unrelated content');

      const results = searchObservationsLIKE(db, 'esbuild', { project: 'proj-like2' });
      expect(results).toHaveLength(1);
      expect(results[0].text).toContain('esbuild');
    });

    it('searchObservationsFTS respects type filter', () => {
      insertObs(db, 'proj-filter', 'file-write', 'typescript config update');
      insertObs(db, 'proj-filter', 'research', 'typescript documentation');

      const results = searchObservationsFTS(db, 'typescript', {
        project: 'proj-filter',
        type: 'research'
      });

      expect(results.every(r => r.type === 'research')).toBe(true);
    });

    it('searchObservationsLIKE respects limit', () => {
      for (let i = 0; i < 10; i++) {
        insertObs(db, 'proj-lim', 'command', `matching title ${i}`, 'matching content');
      }

      const results = searchObservationsLIKE(db, 'matching', { limit: 4 });
      expect(results).toHaveLength(4);
    });

    it('escapes LIKE special characters to avoid wildcard injection', () => {
      insertObs(db, 'proj-escape', 'command', 'test_underscore', 'content with _under');
      insertObs(db, 'proj-escape', 'command', 'other title', 'other content');

      // Searching for literal underscore should only match the specific row
      const results = searchObservationsLIKE(db, 'test_underscore', { project: 'proj-escape' });
      expect(results).toHaveLength(1);
      expect(results[0].title).toBe('test_underscore');
    });

    it('returns empty array when no observations match', () => {
      insertObs(db, 'proj-empty', 'command', 'unrelated');
      const results = searchObservationsFTS(db, 'zzznomatch', { project: 'proj-empty' });
      expect(results).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // getObservationsByIds (batch fetch used by /api/observations/batch)
  // -------------------------------------------------------------------------

  describe('getObservationsByIds — batch fetch', () => {
    it('returns observations for a set of valid IDs', () => {
      const id1 = insertObs(db, 'proj-batch', 'command', 'cmd-1');
      const id2 = insertObs(db, 'proj-batch', 'command', 'cmd-2');
      insertObs(db, 'proj-batch', 'command', 'cmd-3');

      const rows = getObservationsByIds(db, [id1, id2]);
      expect(rows).toHaveLength(2);
      const titles = rows.map(r => r.title);
      expect(titles).toContain('cmd-1');
      expect(titles).toContain('cmd-2');
    });

    it('returns empty array for an empty ID list', () => {
      const rows = getObservationsByIds(db, []);
      expect(rows).toHaveLength(0);
    });

    it('silently ignores IDs that do not exist', () => {
      const id = insertObs(db, 'proj-batch2', 'command', 'real');
      const rows = getObservationsByIds(db, [id, 99999]);
      expect(rows).toHaveLength(1);
    });
  });

  // -------------------------------------------------------------------------
  // getTimeline
  // -------------------------------------------------------------------------

  describe('getTimeline — chronological context', () => {
    it('returns before, anchor, and after entries in order', () => {
      insertObs(db, 'proj-tl', 'command', 'before-1');
      insertObs(db, 'proj-tl', 'command', 'before-2');
      const anchor = insertObs(db, 'proj-tl', 'command', 'anchor');
      insertObs(db, 'proj-tl', 'command', 'after-1');

      const timeline = getTimeline(db, anchor, 2, 2);
      expect(timeline.length).toBeGreaterThanOrEqual(3);

      const titles = timeline.map(e => e.title);
      const anchorIndex = titles.indexOf('anchor');
      expect(anchorIndex).toBeGreaterThan(-1);
    });

    it('returns empty array for a non-existent anchor ID', () => {
      const timeline = getTimeline(db, 99999);
      expect(timeline).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // Analytics — getAnalyticsOverview
  // -------------------------------------------------------------------------

  describe('getAnalyticsOverview', () => {
    it('returns zero counts for an empty database', () => {
      const overview = getAnalyticsOverview(db);
      expect(overview.observations).toBe(0);
      expect(overview.summaries).toBe(0);
      expect(overview.sessions).toBe(0);
    });

    it('counts observations correctly after insertions', () => {
      insertObs(db, 'proj-ana', 'command', 'obs-1');
      insertObs(db, 'proj-ana', 'file-write', 'obs-2');
      createSummary(db, 'sess-ana', 'proj-ana', 'req', null, null, null, null, null);

      const overview = getAnalyticsOverview(db);
      expect(overview.observations).toBe(2);
      expect(overview.summaries).toBe(1);
    });

    it('scopes counts to a project when project filter is provided', () => {
      insertObs(db, 'proj-x', 'command', 'x-obs');
      insertObs(db, 'proj-y', 'command', 'y-obs');

      const overview = getAnalyticsOverview(db, 'proj-x');
      expect(overview.observations).toBe(1);
    });

    it('identifies knowledge-type observations in knowledgeCount', () => {
      insertObs(db, 'proj-know', 'decision', 'Use ESM modules');
      insertObs(db, 'proj-know', 'constraint', 'Avoid dynamic imports');
      insertObs(db, 'proj-know', 'command', 'npm install');

      const overview = getAnalyticsOverview(db, 'proj-know');
      expect(overview.knowledgeCount).toBe(2);
    });
  });

  // -------------------------------------------------------------------------
  // Analytics — getObservationsTimeline
  // -------------------------------------------------------------------------

  describe('getObservationsTimeline', () => {
    it('returns today in the timeline after inserting observations', () => {
      insertObs(db, 'proj-timeline', 'command', 'today-obs');

      const timeline = getObservationsTimeline(db, 'proj-timeline', 7);
      expect(timeline.length).toBeGreaterThan(0);
      expect(timeline[timeline.length - 1].count).toBeGreaterThanOrEqual(1);
    });

    it('returns an empty array when no observations exist for the project', () => {
      const timeline = getObservationsTimeline(db, 'nonexistent-project', 7);
      expect(timeline).toHaveLength(0);
    });

    it('returns entries sorted chronologically (oldest first)', () => {
      insertObs(db, 'proj-tl-order', 'command', 'obs-a');

      const timeline = getObservationsTimeline(db, 'proj-tl-order', 30);
      for (let i = 1; i < timeline.length; i++) {
        expect(timeline[i].day >= timeline[i - 1].day).toBe(true);
      }
    });
  });

  // -------------------------------------------------------------------------
  // Analytics — getTypeDistribution
  // -------------------------------------------------------------------------

  describe('getTypeDistribution', () => {
    it('returns type counts sorted by frequency descending', () => {
      insertObs(db, 'proj-dist', 'command', 'c1');
      insertObs(db, 'proj-dist', 'command', 'c2');
      insertObs(db, 'proj-dist', 'file-write', 'fw1');

      const dist = getTypeDistribution(db, 'proj-dist');
      expect(dist[0].type).toBe('command');
      expect(dist[0].count).toBe(2);
      expect(dist[1].type).toBe('file-write');
      expect(dist[1].count).toBe(1);
    });

    it('returns an empty array when project has no observations', () => {
      const dist = getTypeDistribution(db, 'empty-proj');
      expect(dist).toHaveLength(0);
    });

    it('includes all types present globally when no project is specified', () => {
      insertObs(db, 'p1', 'command', 'c1');
      insertObs(db, 'p2', 'research', 'r1');

      const dist = getTypeDistribution(db);
      const types = dist.map(d => d.type);
      expect(types).toContain('command');
      expect(types).toContain('research');
    });
  });

  // -------------------------------------------------------------------------
  // Analytics — getSessionStats
  // -------------------------------------------------------------------------

  describe('getSessionStats', () => {
    it('returns zero stats when no sessions exist', () => {
      const stats = getSessionStats(db);
      expect(stats.total).toBe(0);
      expect(stats.completed).toBe(0);
      expect(stats.avgDurationMinutes).toBe(0);
    });

    it('counts total and completed sessions correctly', () => {
      const id1 = createSession(db, 'csid-1', 'proj-stats', 'prompt 1');
      createSession(db, 'csid-2', 'proj-stats', 'prompt 2');
      completeSession(db, id1);

      const stats = getSessionStats(db, 'proj-stats');
      expect(stats.total).toBe(2);
      expect(stats.completed).toBe(1);
    });
  });

  // -------------------------------------------------------------------------
  // getProjectStats (used by /api/stats/:project)
  // -------------------------------------------------------------------------

  describe('getProjectStats', () => {
    it('aggregates counts across observations, summaries, sessions, and prompts', () => {
      insertObs(db, 'proj-pstats', 'command', 'obs-1', 'content', 'sess-ps-1', 1);
      insertObs(db, 'proj-pstats', 'file-write', 'obs-2', 'content', 'sess-ps-1', 2);
      createSummary(db, 'sess-ps-1', 'proj-pstats', 'request', null, null, null, null, null);
      createSession(db, 'csid-pstats', 'proj-pstats', 'prompt');

      const stats = getProjectStats(db, 'proj-pstats');
      expect(stats.observations).toBe(2);
      expect(stats.summaries).toBe(1);
      expect(stats.sessions).toBe(1);
    });

    it('returns token economics with discoveryTokens when observations have tokens set', () => {
      createObservation(
        db, 'sess-tok', 'proj-tokens', 'command', 'Token obs',
        null, 'x'.repeat(400), null, null, null, null, null, 1, null, 100
      );

      const stats = getProjectStats(db, 'proj-tokens');
      expect(stats.tokenEconomics.discoveryTokens).toBe(100);
    });

    it('returns zeros for a project with no data', () => {
      const stats = getProjectStats(db, 'ghost-project');
      expect(stats.observations).toBe(0);
      expect(stats.summaries).toBe(0);
      expect(stats.sessions).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // isDuplicateObservation (deduplication guard used by routes and SDK)
  // -------------------------------------------------------------------------

  describe('isDuplicateObservation', () => {
    it('returns false for a hash that has never been stored', () => {
      expect(isDuplicateObservation(db, 'nonexistent-hash-xyz')).toBe(false);
    });

    it('returns true when the same hash was stored within the window', () => {
      createObservation(
        db, 'sess-dup', 'proj-dup', 'file-write', 'Dup title',
        null, 'content', null, null, null, null, null, 1, 'hash-dup-001'
      );
      expect(isDuplicateObservation(db, 'hash-dup-001', 60_000)).toBe(true);
    });

    it('returns false for an empty hash string', () => {
      expect(isDuplicateObservation(db, '')).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // consolidateObservations (used by the maintenance route)
  // -------------------------------------------------------------------------

  describe('consolidateObservations', () => {
    it('dry-run returns expected merged/removed counts without mutating data', () => {
      // Create 4 observations on the same file to exceed minGroupSize=3
      for (let i = 0; i < 4; i++) {
        createObservation(
          db, `sess-cons-${i}`, 'proj-cons', 'file-write', `Write attempt ${i}`,
          null, `content ${i}`, null, null, null, null, '/src/app.ts', i, null, 0
        );
      }

      const { merged, removed } = consolidateObservations(db, 'proj-cons', { dryRun: true, minGroupSize: 3 });
      expect(merged).toBe(1);
      expect(removed).toBe(3);

      // dry-run must not delete anything
      const remaining = getObservationsByProject(db, 'proj-cons');
      expect(remaining).toHaveLength(4);
    });

    it('actual run reduces observation count', () => {
      for (let i = 0; i < 4; i++) {
        createObservation(
          db, `sess-real-${i}`, 'proj-real', 'file-write', `Write ${i}`,
          null, `text ${i}`, null, null, null, null, '/app/main.ts', i, null, 0
        );
      }

      const { merged, removed } = consolidateObservations(db, 'proj-real', { minGroupSize: 3 });
      expect(merged).toBe(1);
      expect(removed).toBe(3);

      const remaining = getObservationsByProject(db, 'proj-real');
      expect(remaining).toHaveLength(1);
    });
  });

  // -------------------------------------------------------------------------
  // Worker context validation helpers (used by every route handler)
  // -------------------------------------------------------------------------

  describe('Worker context — validation helpers', () => {
    describe('isValidProject', () => {
      it('accepts normal project names', () => {
        expect(isValidProject('my-project')).toBe(true);
        expect(isValidProject('org/repo')).toBe(true);
        expect(isValidProject('user@domain')).toBe(true);
      });

      it('rejects empty strings', () => {
        expect(isValidProject('')).toBe(false);
      });

      it('rejects strings containing ".."', () => {
        expect(isValidProject('../etc/passwd')).toBe(false);
      });

      it('rejects names longer than 200 characters', () => {
        expect(isValidProject('a'.repeat(201))).toBe(false);
      });

      it('rejects non-string values', () => {
        expect(isValidProject(null)).toBe(false);
        expect(isValidProject(42)).toBe(false);
        expect(isValidProject(undefined)).toBe(false);
      });
    });

    describe('isValidString', () => {
      it('accepts a valid string within maxLen', () => {
        expect(isValidString('hello', 100)).toBe(true);
      });

      it('rejects an empty string', () => {
        expect(isValidString('', 100)).toBe(false);
      });

      it('rejects a string exceeding maxLen', () => {
        expect(isValidString('a'.repeat(101), 100)).toBe(false);
      });

      it('rejects non-string values', () => {
        expect(isValidString(123, 100)).toBe(false);
        expect(isValidString(null, 100)).toBe(false);
      });
    });

    describe('parseIntSafe', () => {
      it('returns the parsed integer when in range', () => {
        expect(parseIntSafe('10', 5, 1, 100)).toBe(10);
      });

      it('returns the default value when input is undefined', () => {
        expect(parseIntSafe(undefined, 5, 1, 100)).toBe(5);
      });

      it('returns the default value when input is below min', () => {
        expect(parseIntSafe('0', 5, 1, 100)).toBe(5);
      });

      it('returns the default value when input exceeds max', () => {
        expect(parseIntSafe('200', 5, 1, 100)).toBe(5);
      });

      it('returns the default value for non-numeric input', () => {
        expect(parseIntSafe('abc', 5, 1, 100)).toBe(5);
      });
    });
  });
});
