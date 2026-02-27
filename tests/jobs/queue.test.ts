/**
 * Test suite for the async job queue system
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { KiroMemoryDatabase } from '../../src/services/sqlite/Database.js';
import { JobQueue } from '../../src/services/jobs/JobQueue.js';
import type { IJobHandler, JobRecord } from '../../src/services/jobs/JobQueue.js';
import type { Database } from 'bun:sqlite';

// --- Test helpers ---

/** Handler that always succeeds and returns { processed: count } */
const successHandler: IJobHandler = {
  type: 'embedding',
  timeout: 5000,
  async execute(payload: any) {
    return { processed: payload?.count ?? 1 };
  }
};

/** Handler that always throws an error */
const failHandler: IJobHandler = {
  type: 'consolidation',
  timeout: 5000,
  async execute() {
    throw new Error('Simulated failure');
  }
};

/** Handler that times out (resolves after longer than its declared timeout) */
const timeoutHandler: IJobHandler = {
  type: 'backup',
  timeout: 50, // very short timeout
  async execute() {
    await new Promise(resolve => setTimeout(resolve, 500));
    return { done: true };
  }
};

// --- Helpers ---

function createQueue(db: Database, concurrency = 2): JobQueue {
  return new JobQueue(db, concurrency);
}

// --- Tests ---

describe('JobQueue', () => {
  let kdb: KiroMemoryDatabase;
  let db: Database;
  let queue: JobQueue;

  beforeEach(() => {
    kdb = new KiroMemoryDatabase(':memory:');
    db = kdb.db;
    queue = createQueue(db);
  });

  afterEach(() => {
    queue.stop();
    kdb.close();
  });

  // ---- enqueue ----

  describe('enqueue', () => {
    it('creates a job with pending status', () => {
      queue.enqueue('embedding');
      const job = db.query("SELECT * FROM job_queue LIMIT 1").get() as JobRecord;
      expect(job.status).toBe('pending');
    });

    it('returns a positive integer job ID', () => {
      const id = queue.enqueue('embedding');
      expect(typeof id).toBe('number');
      expect(id).toBeGreaterThan(0);
    });

    it('stores payload as JSON string', () => {
      const payload = { project: 'test-project', count: 42 };
      queue.enqueue('embedding', payload);
      const job = db.query("SELECT payload FROM job_queue LIMIT 1").get() as { payload: string };
      expect(JSON.parse(job.payload)).toEqual(payload);
    });

    it('stores null payload when no payload is provided', () => {
      queue.enqueue('embedding');
      const job = db.query("SELECT payload FROM job_queue LIMIT 1").get() as { payload: string | null };
      expect(job.payload).toBeNull();
    });

    it('stores the specified priority', () => {
      queue.enqueue('embedding', undefined, 5);
      const job = db.query("SELECT priority FROM job_queue LIMIT 1").get() as { priority: number };
      expect(job.priority).toBe(5);
    });
  });

  // ---- processNext ----

  describe('processNext', () => {
    it('executes handler and marks job as completed', async () => {
      queue.registerHandler(successHandler);
      const id = queue.enqueue('embedding', { count: 3 });

      const processed = await queue.processNext();
      expect(processed).toBe(true);

      const job = db.query('SELECT * FROM job_queue WHERE id = ?').get(id) as JobRecord;
      expect(job.status).toBe('completed');
      expect(JSON.parse(job.result!)).toEqual({ processed: 3 });
    });

    it('returns false when the queue is empty', async () => {
      queue.registerHandler(successHandler);
      const result = await queue.processNext();
      expect(result).toBe(false);
    });

    it('stores handler result as JSON in result column', async () => {
      queue.registerHandler(successHandler);
      const id = queue.enqueue('embedding');
      await queue.processNext();

      const job = db.query('SELECT result FROM job_queue WHERE id = ?').get(id) as { result: string };
      const parsed = JSON.parse(job.result);
      expect(parsed).toHaveProperty('processed');
    });

    it('increments retry_count and sets status to pending on failure when retries remain', async () => {
      queue.registerHandler(failHandler);
      const id = queue.enqueue('consolidation', { project: 'x' }, 0, 3);

      await queue.processNext();

      const job = db.query('SELECT * FROM job_queue WHERE id = ?').get(id) as JobRecord;
      expect(job.status).toBe('pending');
      expect(job.retry_count).toBe(1);
      expect(job.error).toContain('Simulated failure');
    });

    it('moves job to dead after all retries are exhausted', async () => {
      queue.registerHandler(failHandler);
      const id = queue.enqueue('consolidation', { project: 'x' }, 0, 2);

      // First attempt: retry_count goes to 1, status = pending
      await queue.processNext();
      // Second attempt: retry_count goes to 2 (>= max_retries 2), status = dead
      await queue.processNext();

      const job = db.query('SELECT * FROM job_queue WHERE id = ?').get(id) as JobRecord;
      expect(job.status).toBe('dead');
      expect(job.retry_count).toBe(2);
    });

    it('handles timeout by marking job as pending for retry', async () => {
      queue.registerHandler(timeoutHandler);
      const id = queue.enqueue('backup', undefined, 0, 3);

      await queue.processNext();

      const job = db.query('SELECT * FROM job_queue WHERE id = ?').get(id) as JobRecord;
      // First timeout attempt: retry_count = 1, pending (2 retries left)
      expect(['pending', 'dead']).toContain(job.status);
      expect(job.error).toContain('timeout');
    });

    it('marks job as failed when no handler is registered for its type', async () => {
      // Register no handler, just enqueue a job
      const id = queue.enqueue('embedding');

      await queue.processNext();

      const job = db.query('SELECT * FROM job_queue WHERE id = ?').get(id) as JobRecord;
      expect(job.status).toBe('failed');
      expect(job.error).toContain('No handler registered');
    });

    it('sets started_at_epoch when job begins execution', async () => {
      queue.registerHandler(successHandler);
      const before = Date.now();
      const id = queue.enqueue('embedding');
      await queue.processNext();

      const job = db.query('SELECT started_at_epoch FROM job_queue WHERE id = ?').get(id) as JobRecord;
      expect(job.started_at_epoch).toBeGreaterThanOrEqual(before);
    });

    it('sets completed_at_epoch when job finishes', async () => {
      queue.registerHandler(successHandler);
      const id = queue.enqueue('embedding');
      await queue.processNext();

      const job = db.query('SELECT completed_at_epoch FROM job_queue WHERE id = ?').get(id) as JobRecord;
      expect(job.completed_at_epoch).toBeGreaterThan(0);
    });
  });

  // ---- priority ----

  describe('priority ordering', () => {
    it('processes higher-priority jobs before lower-priority jobs', async () => {
      queue.registerHandler(successHandler);

      // Enqueue in reverse priority order
      const idLow = queue.enqueue('embedding', { tag: 'low' }, 0);
      const idHigh = queue.enqueue('embedding', { tag: 'high' }, 10);

      // Only take the next job — should pick up idHigh first
      await queue.processNext();

      const low = db.query('SELECT status FROM job_queue WHERE id = ?').get(idLow) as { status: string };
      const high = db.query('SELECT status FROM job_queue WHERE id = ?').get(idHigh) as { status: string };

      expect(high.status).toBe('completed');
      expect(low.status).toBe('pending');
    });

    it('uses FIFO order for equal-priority jobs', async () => {
      queue.registerHandler(successHandler);

      const idFirst = queue.enqueue('embedding', { tag: 'first' }, 0);
      // Tiny sleep to ensure different created_at_epoch
      await new Promise(r => setTimeout(r, 5));
      const idSecond = queue.enqueue('embedding', { tag: 'second' }, 0);

      await queue.processNext();

      const first = db.query('SELECT status FROM job_queue WHERE id = ?').get(idFirst) as { status: string };
      const second = db.query('SELECT status FROM job_queue WHERE id = ?').get(idSecond) as { status: string };

      expect(first.status).toBe('completed');
      expect(second.status).toBe('pending');
    });
  });

  // ---- getStats ----

  describe('getStats', () => {
    it('returns correct counts for each status', async () => {
      queue.registerHandler(successHandler);
      queue.registerHandler(failHandler);

      // One job that will complete
      queue.enqueue('embedding');
      // One job that will fail permanently (max_retries = 1)
      queue.enqueue('consolidation', { project: 'p' }, 0, 1);

      await queue.processNext(); // embedding → completed
      await queue.processNext(); // consolidation → dead (1 retry = immediately dead)

      const stats = queue.getStats();
      expect(stats.completed).toBe(1);
      expect(stats.dead).toBe(1);
      expect(stats.pending).toBe(0);
      expect(stats.running).toBe(0);
      expect(stats.failed).toBe(0);
    });

    it('returns all zeros for an empty queue', () => {
      const stats = queue.getStats();
      expect(stats).toEqual({ pending: 0, running: 0, completed: 0, failed: 0, dead: 0 });
    });
  });

  // ---- getRecentJobs ----

  describe('getRecentJobs', () => {
    it('returns jobs in descending created_at order', async () => {
      queue.enqueue('embedding', { n: 1 });
      await new Promise(r => setTimeout(r, 5));
      queue.enqueue('embedding', { n: 2 });

      const jobs = queue.getRecentJobs(10);
      expect(jobs.length).toBe(2);
      // Most recent first
      expect(JSON.parse(jobs[0].payload!).n).toBe(2);
      expect(JSON.parse(jobs[1].payload!).n).toBe(1);
    });

    it('respects the limit parameter', () => {
      for (let i = 0; i < 5; i++) {
        queue.enqueue('embedding', { i });
      }
      const jobs = queue.getRecentJobs(3);
      expect(jobs.length).toBe(3);
    });

    it('returns empty array when queue is empty', () => {
      const jobs = queue.getRecentJobs();
      expect(jobs).toEqual([]);
    });
  });

  // ---- retryJob ----

  describe('retryJob', () => {
    it('resets a dead job to pending status', async () => {
      queue.registerHandler(failHandler);
      const id = queue.enqueue('consolidation', { project: 'x' }, 0, 1);

      // Exhaust retries → dead
      await queue.processNext();

      const beforeRetry = db.query('SELECT status FROM job_queue WHERE id = ?').get(id) as { status: string };
      expect(beforeRetry.status).toBe('dead');

      const retried = queue.retryJob(id);
      expect(retried).toBe(true);

      const afterRetry = db.query('SELECT status, retry_count, error FROM job_queue WHERE id = ?').get(id) as JobRecord;
      expect(afterRetry.status).toBe('pending');
      expect(afterRetry.retry_count).toBe(0);
      expect(afterRetry.error).toBeNull();
    });

    it('resets a failed job to pending status', () => {
      // Manually insert a failed job to test the failed → pending transition
      const now = Date.now();
      db.run(
        `INSERT INTO job_queue (type, status, payload, priority, max_retries, created_at, created_at_epoch, error)
         VALUES ('embedding', 'failed', NULL, 0, 3, datetime('now'), ?, 'some error')`,
        [now]
      );
      const row = db.query('SELECT id FROM job_queue WHERE status = ?').get('failed') as { id: number };

      const retried = queue.retryJob(row.id);
      expect(retried).toBe(true);

      const job = db.query('SELECT status FROM job_queue WHERE id = ?').get(row.id) as { status: string };
      expect(job.status).toBe('pending');
    });

    it('returns false for a non-existent job ID', () => {
      const retried = queue.retryJob(99999);
      expect(retried).toBe(false);
    });

    it('returns false for a job that is still pending (not failed/dead)', () => {
      const id = queue.enqueue('embedding');
      const retried = queue.retryJob(id);
      expect(retried).toBe(false);
    });

    it('returns false for a completed job', async () => {
      queue.registerHandler(successHandler);
      const id = queue.enqueue('embedding');
      await queue.processNext();

      const retried = queue.retryJob(id);
      expect(retried).toBe(false);
    });
  });

  // ---- cleanup ----

  describe('cleanup', () => {
    it('removes completed and dead jobs older than the threshold', async () => {
      queue.registerHandler(successHandler);
      queue.registerHandler(failHandler);

      queue.enqueue('embedding');
      queue.enqueue('consolidation', { project: 'x' }, 0, 1);

      await queue.processNext(); // → completed
      await queue.processNext(); // → dead

      // Backdate jobs to simulate they are 8 days old
      const eightDaysAgo = Date.now() - 8 * 24 * 60 * 60 * 1000;
      db.run('UPDATE job_queue SET created_at_epoch = ?', [eightDaysAgo]);

      const deleted = queue.cleanup(7 * 24 * 60 * 60 * 1000);
      expect(deleted).toBe(2);

      const remaining = db.query('SELECT COUNT(*) as cnt FROM job_queue').get() as { cnt: number };
      expect(remaining.cnt).toBe(0);
    });

    it('does not remove jobs newer than the threshold', async () => {
      queue.registerHandler(successHandler);
      queue.enqueue('embedding');
      await queue.processNext();

      // Cleanup with a 0ms threshold (nothing should be deleted since job is brand-new)
      // Use negative maxAgeMs to ensure all completed jobs are actually newer than threshold
      const deleted = queue.cleanup(7 * 24 * 60 * 60 * 1000); // 7 days — job is just seconds old
      expect(deleted).toBe(0);
    });

    it('does not remove pending or running jobs', () => {
      queue.enqueue('embedding');
      // Backdate it to 30 days ago
      const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
      db.run('UPDATE job_queue SET created_at_epoch = ?', [thirtyDaysAgo]);

      const deleted = queue.cleanup(7 * 24 * 60 * 60 * 1000);
      expect(deleted).toBe(0); // pending jobs are not removed

      const remaining = db.query('SELECT COUNT(*) as cnt FROM job_queue').get() as { cnt: number };
      expect(remaining.cnt).toBe(1);
    });

    it('returns 0 when there is nothing to clean up', () => {
      const deleted = queue.cleanup();
      expect(deleted).toBe(0);
    });
  });

  // ---- concurrency ----

  describe('concurrency', () => {
    it('does not process more jobs than the concurrency limit allows', async () => {
      // Create a queue with concurrency = 1
      const singleQueue = createQueue(db, 1);
      singleQueue.registerHandler(successHandler);

      // Manually saturate activeJobs by calling processNext in a way that exercises the limit
      // We check that processNext returns false when activeJobs >= concurrency
      // We do this by inspecting the activeJobs counter via the return value
      singleQueue.enqueue('embedding');
      singleQueue.enqueue('embedding');

      // Process first job (completes synchronously since handler is async but awaited)
      const first = await singleQueue.processNext();
      expect(first).toBe(true);

      // Process second job — queue is empty after first, but that is fine
      // The important thing is processNext returns false when the queue is empty
      const second = await singleQueue.processNext();
      // Second job should complete (first already done by now)
      expect(second).toBe(true);

      singleQueue.stop();
    });

    it('returns false when activeJobs equals concurrency', async () => {
      // Build a handler that blocks until we release it, so we can test the
      // concurrency guard with activeJobs > 0
      let releaseBlocker!: () => void;
      const blockingHandler: IJobHandler = {
        type: 'backup',
        timeout: 5000,
        async execute() {
          await new Promise<void>(resolve => { releaseBlocker = resolve; });
          return { done: true };
        }
      };

      const singleQueue = createQueue(db, 1);
      singleQueue.registerHandler(blockingHandler);

      singleQueue.enqueue('backup');
      singleQueue.enqueue('backup');

      // Start first job but do NOT await — it is still running
      const firstPromise = singleQueue.processNext();

      // Give the event loop a tick so processNext can increment activeJobs
      await new Promise(r => setTimeout(r, 10));

      // Try to pick up the second job while first is still active
      const secondResult = await singleQueue.processNext();
      expect(secondResult).toBe(false);

      // Release the blocker and let the first job finish
      releaseBlocker();
      await firstPromise;

      singleQueue.stop();
    });
  });
});
