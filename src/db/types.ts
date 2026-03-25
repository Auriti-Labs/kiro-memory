/**
 * Database adapter types for Kiro Memory
 *
 * Defines the contract for SQLite database access.
 * The default implementation uses better-sqlite3 (Node.js).
 * Alternative providers (e.g. bun:sqlite) can implement these interfaces.
 */

/** Result of a write operation (INSERT, UPDATE, DELETE). */
export interface RunResult {
  lastInsertRowid: number | bigint;
  changes: number;
}

/** Prepared statement with query/execute methods. */
export interface Statement {
  all(...params: any[]): any[];
  get(...params: any[]): any;
  run(...params: any[]): RunResult;
}

/** SQLite database connection. */
export interface Database {
  run(sql: string, params?: any[]): RunResult;
  query(sql: string): Statement;
  transaction<T>(fn: (...args: any[]) => T): (...args: any[]) => T;
  close(): void;
}
