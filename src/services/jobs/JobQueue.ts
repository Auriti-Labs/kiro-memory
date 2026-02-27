import { Database } from 'bun:sqlite';
import { logger } from '../../utils/logger.js';

// Job status lifecycle: pending → running → completed | dead
// failed is a transient state used when a job errors but still has retries available
export type JobStatus = 'pending' | 'running' | 'completed' | 'failed' | 'dead';
export type JobType = 'embedding' | 'consolidation' | 'backup';

export interface JobRecord {
  id: number;
  type: JobType;
  status: JobStatus;
  payload: string | null;
  result: string | null;
  error: string | null;
  retry_count: number;
  max_retries: number;
  priority: number;
  created_at: string;
  created_at_epoch: number;
  started_at_epoch: number | null;
  completed_at_epoch: number | null;
}

export interface IJobHandler {
  type: JobType;
  execute(payload: any, db: Database): Promise<any>;
  /** Maximum execution time in milliseconds before the job is timed out */
  timeout: number;
}

/**
 * JobQueue - Async background job processing for Kiro Memory.
 *
 * Supports priority-based scheduling, automatic retries with dead-letter queue,
 * configurable concurrency, and per-type handler registration.
 *
 * Usage:
 *   const queue = new JobQueue(db);
 *   queue.registerHandler(embeddingHandler);
 *   queue.start(5000); // poll every 5 seconds
 *   const jobId = queue.enqueue('embedding', { project: 'myapp' }, 1);
 */
export class JobQueue {
  private db: Database;
  private handlers: Map<JobType, IJobHandler> = new Map();
  private running = false;
  private pollInterval: ReturnType<typeof setInterval> | null = null;
  private concurrency: number;
  private activeJobs = 0;

  /**
   * @param db - SQLite database instance (must have job_queue table from migration 10)
   * @param concurrency - Maximum number of jobs running simultaneously (default: 2)
   */
  constructor(db: Database, concurrency: number = 2) {
    this.db = db;
    this.concurrency = concurrency;
  }

  /** Register a job handler for a specific type. Overwrites any existing handler for that type. */
  registerHandler(handler: IJobHandler): void {
    this.handlers.set(handler.type, handler);
    logger.debug('QUEUE', `Handler registered for type: ${handler.type}`);
  }

  /**
   * Enqueue a new job.
   *
   * @param type - Job type (must have a registered handler to be processed)
   * @param payload - Arbitrary data passed to the handler (JSON-serialized)
   * @param priority - Higher values are processed first (default: 0)
   * @param maxRetries - Maximum retry attempts before moving to dead letter (default: 3)
   * @returns The ID of the created job
   */
  enqueue(type: JobType, payload?: any, priority: number = 0, maxRetries: number = 3): number {
    const now = new Date();
    const result = this.db.run(
      `INSERT INTO job_queue (type, status, payload, priority, max_retries, created_at, created_at_epoch)
       VALUES (?, 'pending', ?, ?, ?, ?, ?)`,
      [type, payload ? JSON.stringify(payload) : null, priority, maxRetries, now.toISOString(), now.getTime()]
    );
    const jobId = Number(result.lastInsertRowid);
    logger.debug('QUEUE', `Job #${jobId} (${type}) enqueued with priority ${priority}`);
    return jobId;
  }

  /**
   * Start polling for pending jobs at the specified interval.
   * Safe to call multiple times — subsequent calls are no-ops.
   *
   * @param intervalMs - Polling interval in milliseconds (default: 5000)
   */
  start(intervalMs: number = 5000): void {
    if (this.running) return;
    this.running = true;
    this.pollInterval = setInterval(() => this.processNext(), intervalMs);
    logger.info('QUEUE', `Job queue started (concurrency=${this.concurrency}, poll=${intervalMs}ms)`);
  }

  /** Stop polling. Active jobs already in-flight continue until completion. */
  stop(): void {
    this.running = false;
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
    logger.info('QUEUE', 'Job queue stopped');
  }

  /**
   * Fetch and process the next highest-priority pending job.
   *
   * Returns true if a job was picked up, false if the queue was empty or
   * the concurrency limit was reached.
   *
   * This method is called automatically by the poll interval but can also
   * be called manually in tests or for immediate processing.
   */
  async processNext(): Promise<boolean> {
    if (this.activeJobs >= this.concurrency) return false;

    // Fetch the highest-priority pending job (priority DESC, then FIFO by epoch and id)
    const job = this.db.query(
      `SELECT * FROM job_queue
       WHERE status = 'pending'
       ORDER BY priority DESC, created_at_epoch ASC, id ASC
       LIMIT 1`
    ).get() as JobRecord | null;

    if (!job) return false;

    const handler = this.handlers.get(job.type as JobType);
    if (!handler) {
      this.markFailed(job.id, `No handler registered for job type: ${job.type}`);
      logger.warn('QUEUE', `Job #${job.id} failed: no handler for type '${job.type}'`);
      return false;
    }

    // Claim the job atomically by marking it as running
    this.db.run(
      `UPDATE job_queue SET status = 'running', started_at_epoch = ? WHERE id = ?`,
      [Date.now(), job.id]
    );
    this.activeJobs++;

    try {
      const payload = job.payload ? JSON.parse(job.payload) : {};

      // Race the handler against a timeout deadline
      const result = await Promise.race([
        handler.execute(payload, this.db),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Job timeout')), handler.timeout)
        )
      ]);

      this.db.run(
        `UPDATE job_queue SET status = 'completed', result = ?, completed_at_epoch = ? WHERE id = ?`,
        [result ? JSON.stringify(result) : null, Date.now(), job.id]
      );
      logger.info('QUEUE', `Job #${job.id} (${job.type}) completed successfully`);
      return true;
    } catch (error: any) {
      const errorMsg = error?.message || String(error);
      const nextRetryCount = job.retry_count + 1;

      if (nextRetryCount >= job.max_retries) {
        // Exhausted retries: move to dead-letter queue
        this.db.run(
          `UPDATE job_queue SET status = 'dead', error = ?, retry_count = ?, completed_at_epoch = ? WHERE id = ?`,
          [errorMsg, nextRetryCount, Date.now(), job.id]
        );
        logger.warn('QUEUE', `Job #${job.id} (${job.type}) moved to dead letter after ${job.max_retries} retries: ${errorMsg}`);
      } else {
        // Re-queue for retry
        this.db.run(
          `UPDATE job_queue SET status = 'pending', error = ?, retry_count = ? WHERE id = ?`,
          [errorMsg, nextRetryCount, job.id]
        );
        logger.warn('QUEUE', `Job #${job.id} (${job.type}) failed, will retry (${nextRetryCount}/${job.max_retries}): ${errorMsg}`);
      }
      return false;
    } finally {
      this.activeJobs--;
    }
  }

  /**
   * Mark a job as permanently failed (used for unrecoverable errors like missing handlers).
   */
  private markFailed(jobId: number, error: string): void {
    this.db.run(
      `UPDATE job_queue SET status = 'failed', error = ?, completed_at_epoch = ? WHERE id = ?`,
      [error, Date.now(), jobId]
    );
  }

  /**
   * Get aggregated counts per status.
   * Useful for monitoring dashboards and health checks.
   */
  getStats(): { pending: number; running: number; completed: number; failed: number; dead: number } {
    const row = this.db.query(`
      SELECT
        COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending,
        COUNT(CASE WHEN status = 'running' THEN 1 END) as running,
        COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed,
        COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed,
        COUNT(CASE WHEN status = 'dead' THEN 1 END) as dead
      FROM job_queue
    `).get() as any;

    return {
      pending: row?.pending || 0,
      running: row?.running || 0,
      completed: row?.completed || 0,
      failed: row?.failed || 0,
      dead: row?.dead || 0
    };
  }

  /**
   * Return the most recently created jobs in descending order.
   *
   * @param limit - Maximum number of records to return (default: 20)
   */
  getRecentJobs(limit: number = 20): JobRecord[] {
    return this.db.query(
      'SELECT * FROM job_queue ORDER BY created_at_epoch DESC, id DESC LIMIT ?'
    ).all(limit) as JobRecord[];
  }

  /**
   * Reset a failed or dead job back to pending so it can be retried.
   * Also clears the error and resets retry_count to 0.
   *
   * @returns true if the job was found and reset, false otherwise
   */
  retryJob(jobId: number): boolean {
    const result = this.db.run(
      `UPDATE job_queue SET status = 'pending', error = NULL, retry_count = 0 WHERE id = ? AND status IN ('failed', 'dead')`,
      [jobId]
    );
    return result.changes > 0;
  }

  /**
   * Remove completed and dead jobs older than maxAgeMs.
   * Call periodically to prevent unbounded table growth.
   *
   * @param maxAgeMs - Age threshold in milliseconds (default: 7 days)
   * @returns Number of deleted records
   */
  cleanup(maxAgeMs: number = 7 * 24 * 60 * 60 * 1000): number {
    const threshold = Date.now() - maxAgeMs;
    const result = this.db.run(
      `DELETE FROM job_queue WHERE status IN ('completed', 'dead') AND created_at_epoch < ?`,
      [threshold]
    );
    logger.debug('QUEUE', `Cleanup removed ${result.changes} old jobs`);
    return result.changes;
  }
}
