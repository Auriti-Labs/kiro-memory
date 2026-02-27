/**
 * Test suite for AnomalyDetector — z-score session anomaly detection.
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { KiroMemoryDatabase } from '../../src/services/sqlite/Database.js';
import { AnomalyDetector, mean, stdDev } from '../../src/services/analytics/AnomalyDetector.js';
import { createSession } from '../../src/services/sqlite/Sessions.js';
import { createObservation } from '../../src/services/sqlite/Observations.js';
import type { Database } from 'bun:sqlite';

// ============================================================================
// Test helpers
// ============================================================================

/**
 * Create a completed session with controlled timestamps.
 * Returns the numeric session row ID.
 */
function createTestSession(
  db: Database,
  project: string,
  contentSessionId: string,
  durationMs: number,
  memorySessionId?: string
): number {
  const id = createSession(db, contentSessionId, project, 'test prompt');
  const endEpoch = Date.now();
  const startEpoch = endEpoch - durationMs;

  // Set a predictable memory_session_id so observations can reference it
  const memId = memorySessionId ?? `mem-${id}`;
  db.run(
    `UPDATE sessions
     SET status = 'completed', started_at_epoch = ?, completed_at_epoch = ?, memory_session_id = ?
     WHERE id = ?`,
    [startEpoch, endEpoch, memId, id]
  );
  return id;
}

/** Retrieve the memory_session_id assigned to a session row. */
function getMemorySessionId(db: Database, sessionId: number): string {
  const row = db.query('SELECT memory_session_id FROM sessions WHERE id = ?').get(sessionId) as {
    memory_session_id: string;
  } | null;
  return row?.memory_session_id ?? `mem-${sessionId}`;
}

/** Insert a minimal observation of the given type for a memory session. */
function addObservation(db: Database, memorySessionId: string, project: string, type: string): number {
  return createObservation(
    db,
    memorySessionId,
    project,
    type,
    `${type} observation`,
    null,
    'content',
    null,
    null,
    null,
    null,
    null,
    1
  );
}

// ============================================================================
// Statistical helper tests
// ============================================================================

describe('Statistical helpers', () => {
  describe('mean()', () => {
    it('returns the arithmetic mean of a non-empty array', () => {
      expect(mean([1, 2, 3])).toBe(2);
    });

    it('returns 0 for an empty array', () => {
      expect(mean([])).toBe(0);
    });

    it('returns the single element for a one-element array', () => {
      expect(mean([42])).toBe(42);
    });

    it('handles negative values correctly', () => {
      expect(mean([-3, 0, 3])).toBe(0);
    });

    it('handles floating-point values', () => {
      expect(mean([1.5, 2.5])).toBe(2);
    });
  });

  describe('stdDev()', () => {
    it('returns 0 when all values are identical (no variance)', () => {
      expect(stdDev([10, 10, 10])).toBe(0);
    });

    it('returns 0 for an empty array', () => {
      expect(stdDev([])).toBe(0);
    });

    it('returns 0 for a single-element array', () => {
      expect(stdDev([5])).toBe(0);
    });

    it('computes sample standard deviation correctly for [1,2,3,4,5]', () => {
      // Sample std dev with Bessel's correction: sqrt(10/4) ≈ 1.5811
      const result = stdDev([1, 2, 3, 4, 5]);
      expect(result).toBeCloseTo(1.5811, 2);
    });

    it('computes std dev for a two-element array', () => {
      // stdDev([0, 10]) = sqrt((25+25)/1) = sqrt(50) ≈ 7.071
      expect(stdDev([0, 10])).toBeCloseTo(7.071, 2);
    });

    it('handles arrays with large values', () => {
      const values = [1000, 2000, 3000];
      expect(stdDev(values)).toBeCloseTo(1000, 0);
    });
  });
});

// ============================================================================
// AnomalyDetector tests
// ============================================================================

describe('AnomalyDetector', () => {
  let kiroDb: KiroMemoryDatabase;
  let db: Database;

  beforeEach(() => {
    kiroDb = new KiroMemoryDatabase(':memory:');
    db = kiroDb.db;
  });

  afterEach(() => {
    kiroDb.close();
  });

  // ── Baseline ───────────────────────────────────────────────────────────────

  describe('getBaseline()', () => {
    it('returns null when there are fewer than 3 completed sessions', () => {
      createTestSession(db, 'proj', 'sess-1', 5 * 60_000);
      createTestSession(db, 'proj', 'sess-2', 5 * 60_000);

      const detector = new AnomalyDetector(db);
      expect(detector.getBaseline('proj')).toBeNull();
    });

    it('returns null for a project with no sessions', () => {
      const detector = new AnomalyDetector(db);
      expect(detector.getBaseline('unknown-project')).toBeNull();
    });

    it('returns null when 3 sessions exist but belong to a different project', () => {
      createTestSession(db, 'other-proj', 'sess-1', 5 * 60_000);
      createTestSession(db, 'other-proj', 'sess-2', 5 * 60_000);
      createTestSession(db, 'other-proj', 'sess-3', 5 * 60_000);

      const detector = new AnomalyDetector(db);
      expect(detector.getBaseline('proj')).toBeNull();
    });

    it('computes correct average duration from 3 sessions', () => {
      // Durations: 10, 20, 30 minutes → avg = 20
      createTestSession(db, 'proj', 'sess-1', 10 * 60_000);
      createTestSession(db, 'proj', 'sess-2', 20 * 60_000);
      createTestSession(db, 'proj', 'sess-3', 30 * 60_000);

      const detector = new AnomalyDetector(db);
      const baseline = detector.getBaseline('proj');

      expect(baseline).not.toBeNull();
      expect(baseline!.avgDurationMinutes).toBeCloseTo(20, 0);
      expect(baseline!.sampleSize).toBe(3);
    });

    it('reports the correct sample size when windowSize limits sessions', () => {
      for (let i = 1; i <= 6; i++) {
        createTestSession(db, 'proj', `sess-${i}`, 10 * 60_000);
      }

      const detector = new AnomalyDetector(db, 4 /* windowSize */);
      const baseline = detector.getBaseline('proj');

      expect(baseline!.sampleSize).toBe(4);
    });

    it('ignores active (non-completed) sessions when computing baseline', () => {
      // 2 completed sessions + 1 active → not enough data
      createTestSession(db, 'proj', 'sess-1', 5 * 60_000);
      createTestSession(db, 'proj', 'sess-2', 5 * 60_000);
      createSession(db, 'sess-active', 'proj', 'active prompt'); // stays active

      const detector = new AnomalyDetector(db);
      expect(detector.getBaseline('proj')).toBeNull();
    });

    it('computes correct observation averages from baseline sessions', () => {
      // Session 1: 3 observations (obs-type), Session 2: 5, Session 3: 7 → avg = 5
      for (let i = 1; i <= 3; i++) {
        const id = createTestSession(db, 'proj', `sess-${i}`, 10 * 60_000);
        const memId = getMemorySessionId(db, id);
        const obsCount = i * 2 + 1; // 3, 5, 7
        for (let j = 0; j < obsCount; j++) {
          addObservation(db, memId, 'proj', 'info');
        }
      }

      const detector = new AnomalyDetector(db);
      const baseline = detector.getBaseline('proj');

      expect(baseline).not.toBeNull();
      expect(baseline!.avgObservations).toBeCloseTo(5, 0);
    });
  });

  // ── detectAnomalies ────────────────────────────────────────────────────────

  describe('detectAnomalies()', () => {
    it('returns an empty array when fewer than 3 sessions exist', () => {
      createTestSession(db, 'proj', 'sess-1', 5 * 60_000);
      createTestSession(db, 'proj', 'sess-2', 5 * 60_000);

      const detector = new AnomalyDetector(db);
      expect(detector.detectAnomalies('proj')).toEqual([]);
    });

    it('returns an empty array for an unknown project', () => {
      const detector = new AnomalyDetector(db);
      expect(detector.detectAnomalies('no-such-project')).toEqual([]);
    });

    it('returns no anomalies when all sessions are similar', () => {
      // Create 5 sessions all lasting ~10 minutes with no observations
      for (let i = 1; i <= 5; i++) {
        createTestSession(db, 'proj', `sess-${i}`, 10 * 60_000);
      }

      const detector = new AnomalyDetector(db);
      expect(detector.detectAnomalies('proj')).toEqual([]);
    });

    // ── long-session detection ──────────────────────────────────────────────

    it('detects a long-session anomaly when duration is far above average', () => {
      const project = 'proj-long';

      // Baseline: 10 sessions lasting ~10 minutes each (providing enough sample variance).
      // With 10 sessions at 10 min and 1 at 120 min the z-score ≈ 3.0 (above threshold 2.0).
      for (let i = 1; i <= 10; i++) {
        createTestSession(db, project, `baseline-${i}`, 10 * 60_000);
      }

      // One very long session: 120 minutes (12× the average)
      const longId = createTestSession(db, project, 'long-sess', 120 * 60_000);

      const detector = new AnomalyDetector(db, 20, 2.0);
      const anomalies = detector.detectAnomalies(project);

      const longSessionAnomalies = anomalies.filter(
        a => a.sessionId === longId && a.type === 'long-session'
      );
      expect(longSessionAnomalies.length).toBeGreaterThan(0);
    });

    it('correctly populates all Anomaly fields for a long-session', () => {
      const project = 'proj-fields';

      // Need 10 baselines so the outlier produces a z-score above 2.0
      for (let i = 1; i <= 10; i++) {
        createTestSession(db, project, `baseline-${i}`, 10 * 60_000);
      }
      const longId = createTestSession(db, project, 'long-sess', 120 * 60_000);

      const detector = new AnomalyDetector(db);
      const anomalies = detector.detectAnomalies(project);
      const anomaly = anomalies.find(a => a.sessionId === longId && a.type === 'long-session');

      expect(anomaly).toBeDefined();
      expect(anomaly!.sessionId).toBe(longId);
      expect(anomaly!.contentSessionId).toBe('long-sess');
      expect(anomaly!.project).toBe(project);
      expect(anomaly!.type).toBe('long-session');
      expect(anomaly!.score).toBeGreaterThan(2.0);
      expect(anomaly!.value).toBeGreaterThan(anomaly!.mean);
      expect(anomaly!.stdDev).toBeGreaterThanOrEqual(0);
      expect(typeof anomaly!.description).toBe('string');
      expect(anomaly!.description.length).toBeGreaterThan(0);
    });

    it('does not flag a long-session when std deviation is 0 (identical durations)', () => {
      const project = 'proj-identical';

      // All sessions have exactly the same duration — stdDev = 0, division skipped
      for (let i = 1; i <= 5; i++) {
        createTestSession(db, project, `sess-${i}`, 10 * 60_000);
      }

      const detector = new AnomalyDetector(db);
      const anomalies = detector.detectAnomalies(project);
      expect(anomalies.filter(a => a.type === 'long-session')).toHaveLength(0);
    });

    // ── no-progress detection ───────────────────────────────────────────────

    it('detects no-progress when obs count is above average but no files written', () => {
      const project = 'proj-noprogress';

      // Baseline: 5 sessions with 2 observations each (minimum 3 needed for baseline)
      for (let i = 1; i <= 5; i++) {
        const id = createTestSession(db, project, `baseline-${i}`, 10 * 60_000);
        const memId = getMemorySessionId(db, id);
        addObservation(db, memId, project, 'info');
        addObservation(db, memId, project, 'info');
      }

      // Anomalous session: 10 observations (above avg=2) but no file-writes
      const noProgId = createTestSession(db, project, 'no-progress-sess', 10 * 60_000);
      const noProgMemId = getMemorySessionId(db, noProgId);
      for (let j = 0; j < 10; j++) {
        addObservation(db, noProgMemId, project, 'command'); // not 'file-write'
      }

      const detector = new AnomalyDetector(db);
      const anomalies = detector.detectAnomalies(project);

      const noProgress = anomalies.find(
        a => a.sessionId === noProgId && a.type === 'no-progress'
      );
      expect(noProgress).toBeDefined();
      expect(noProgress!.value).toBe(10);
    });

    it('does not flag no-progress when the session has file-write observations', () => {
      const project = 'proj-progress';

      // Baseline: 5 sessions with 2 observations each
      for (let i = 1; i <= 5; i++) {
        const id = createTestSession(db, project, `baseline-${i}`, 10 * 60_000);
        const memId = getMemorySessionId(db, id);
        addObservation(db, memId, project, 'info');
        addObservation(db, memId, project, 'info');
      }

      // Session with many observations AND file-writes
      const activeId = createTestSession(db, project, 'productive-sess', 10 * 60_000);
      const activeMemId = getMemorySessionId(db, activeId);
      for (let j = 0; j < 8; j++) {
        addObservation(db, activeMemId, project, 'command');
      }
      addObservation(db, activeMemId, project, 'file-write'); // has progress

      const detector = new AnomalyDetector(db);
      const anomalies = detector.detectAnomalies(project);
      const noProgress = anomalies.find(
        a => a.sessionId === activeId && a.type === 'no-progress'
      );
      expect(noProgress).toBeUndefined();
    });

    it('no-progress anomaly has score = 0 (heuristic, not z-score)', () => {
      const project = 'proj-npscore';

      for (let i = 1; i <= 5; i++) {
        const id = createTestSession(db, project, `b-${i}`, 10 * 60_000);
        const memId = getMemorySessionId(db, id);
        addObservation(db, memId, project, 'info');
      }

      const noProgId = createTestSession(db, project, 'no-prog', 10 * 60_000);
      const noProgMemId = getMemorySessionId(db, noProgId);
      for (let j = 0; j < 10; j++) {
        addObservation(db, noProgMemId, project, 'command');
      }

      const detector = new AnomalyDetector(db);
      const anomalies = detector.detectAnomalies(project);
      const noProgress = anomalies.find(a => a.type === 'no-progress');

      expect(noProgress).toBeDefined();
      expect(noProgress!.score).toBe(0);
    });

    // ── repetitive-commands detection ───────────────────────────────────────

    it('detects repetitive-commands when command count and ratio are both high', () => {
      const project = 'proj-cmds';

      // Baseline: 10 sessions with 2 commands and 10 observations each.
      // With 10 sessions at 2 cmds and 1 at 50 cmds, z-score ≈ 3.0 (above threshold 2.0).
      for (let i = 1; i <= 10; i++) {
        const id = createTestSession(db, project, `b-${i}`, 10 * 60_000);
        const memId = getMemorySessionId(db, id);
        for (let j = 0; j < 10; j++) {
          addObservation(db, memId, project, 'info');
        }
        addObservation(db, memId, project, 'command');
        addObservation(db, memId, project, 'command');
      }

      // Anomalous session: 50 commands out of 55 observations (91% ratio, far above baseline)
      const cmdId = createTestSession(db, project, 'cmd-heavy', 10 * 60_000);
      const cmdMemId = getMemorySessionId(db, cmdId);
      for (let k = 0; k < 50; k++) {
        addObservation(db, cmdMemId, project, 'command');
      }
      for (let k = 0; k < 5; k++) {
        addObservation(db, cmdMemId, project, 'info');
      }

      const detector = new AnomalyDetector(db);
      const anomalies = detector.detectAnomalies(project);
      const cmdAnomalies = anomalies.filter(
        a => a.sessionId === cmdId && a.type === 'repetitive-commands'
      );
      expect(cmdAnomalies.length).toBeGreaterThan(0);
    });

    // ── threshold parameter ─────────────────────────────────────────────────

    it('uses the custom threshold to control sensitivity', () => {
      const project = 'proj-threshold';

      // Baseline: 10 sessions lasting 10 minutes.
      // With 10 sessions at 10 min + 1 at 30 min → z-score ≈ 3.02.
      // strict threshold=1.0 → flagged; lenient threshold=4.0 → not flagged.
      for (let i = 1; i <= 10; i++) {
        createTestSession(db, project, `b-${i}`, 10 * 60_000);
      }
      // Slightly longer session: 30 minutes
      const longId = createTestSession(db, project, 'slightly-long', 30 * 60_000);

      // With strict threshold=1.0 this session should be flagged (z ≈ 3.02 > 1.0)
      const strictDetector = new AnomalyDetector(db, 20, 1.0);
      const strictAnomalies = strictDetector.detectAnomalies(project);
      const flaggedStrict = strictAnomalies.some(
        a => a.sessionId === longId && a.type === 'long-session'
      );

      // With lenient threshold=4.0 it should NOT be flagged (z ≈ 3.02 < 4.0)
      const lenientDetector = new AnomalyDetector(db, 20, 4.0);
      const lenientAnomalies = lenientDetector.detectAnomalies(project);
      const flaggedLenient = lenientAnomalies.some(
        a => a.sessionId === longId && a.type === 'long-session'
      );

      expect(flaggedStrict).toBe(true);
      expect(flaggedLenient).toBe(false);
    });

    // ── windowSize parameter ────────────────────────────────────────────────

    it('respects the windowSize parameter when sampling sessions', () => {
      const project = 'proj-window';

      // 20 short sessions form a stable baseline (avg=5 min, small variance).
      // With windowSize=25, the long session is included in a pool dominated by
      // short sessions, producing a high z-score.
      for (let i = 1; i <= 20; i++) {
        createTestSession(db, project, `old-${i}`, 5 * 60_000);
      }
      // 1 very long recent session: 120 minutes (far above average of 5 min)
      const longId = createTestSession(db, project, 'recent-long', 120 * 60_000);

      // With a wide window (25) covering all 21 sessions the outlier is clearly anomalous
      const wideDetector = new AnomalyDetector(db, 25, 2.0);
      const wideAnomalies = wideDetector.detectAnomalies(project);
      expect(wideAnomalies.some(a => a.sessionId === longId && a.type === 'long-session')).toBe(true);
    });

    // ── multiple anomalies in same session ──────────────────────────────────

    it('can return multiple anomaly types for the same session', () => {
      const project = 'proj-multi';

      // Baseline: 10 sessions, 2 observations each, normal duration (10 min).
      // With 10 baselines the z-score for a 120 min session is ≈ 3.0 (above threshold 1.0).
      for (let i = 1; i <= 10; i++) {
        const id = createTestSession(db, project, `b-${i}`, 10 * 60_000);
        const memId = getMemorySessionId(db, id);
        addObservation(db, memId, project, 'info');
        addObservation(db, memId, project, 'info');
      }

      // Session that is very long (120 min) AND has many observations (above avg=2) but no file-writes
      const multiId = createTestSession(db, project, 'multi-anomaly', 120 * 60_000);
      const multiMemId = getMemorySessionId(db, multiId);
      for (let j = 0; j < 20; j++) {
        addObservation(db, multiMemId, project, 'command'); // not 'file-write'
      }

      const detector = new AnomalyDetector(db, 20, 1.0);
      const anomalies = detector.detectAnomalies(project);
      const sessionAnomalies = anomalies.filter(a => a.sessionId === multiId);

      // Should have at least long-session and no-progress
      const types = new Set(sessionAnomalies.map(a => a.type));
      expect(types.has('long-session')).toBe(true);
      expect(types.has('no-progress')).toBe(true);
    });
  });
});
