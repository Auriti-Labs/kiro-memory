/**
 * SQLite adapter using bun:sqlite
 *
 * Used when running under the Bun runtime (e.g. bun test).
 * Implements the same Database interface as better-sqlite3-adapter.ts
 * so the rest of the codebase is runtime-agnostic.
 */

// @ts-ignore — bun:sqlite is only available under the Bun runtime
import { Database as BunDatabase } from 'bun:sqlite';
import type { Database as IDatabase, Statement, RunResult } from './types.js';

/**
 * SQLite database connection backed by bun:sqlite.
 */
export class Database implements IDatabase {
  private _db: InstanceType<typeof BunDatabase>;

  constructor(path: string, _options?: { create?: boolean; readwrite?: boolean }) {
    this._db = new BunDatabase(path, { create: true, readwrite: true });
  }

  /**
   * Execute a SQL query without results.
   */
  run(sql: string, params?: any[]): RunResult {
    const stmt = this._db.query(sql);
    const result = params ? stmt.run(...params) : stmt.run();
    // bun:sqlite run() returns an object with changes and lastInsertRowid
    return {
      lastInsertRowid: (result as any)?.lastInsertRowid ?? 0,
      changes: (result as any)?.changes ?? 0
    };
  }

  /**
   * Prepare a query and return a statement wrapper.
   */
  query(sql: string): Statement {
    const stmt = this._db.query(sql);
    return {
      all(...params: any[]): any[] {
        if (params.length === 0) return stmt.all();
        return stmt.all(...params);
      },
      get(...params: any[]): any {
        if (params.length === 0) return stmt.get();
        return stmt.get(...params);
      },
      run(...params: any[]): RunResult {
        if (params.length === 0) {
          const r = stmt.run();
          return { lastInsertRowid: (r as any)?.lastInsertRowid ?? 0, changes: (r as any)?.changes ?? 0 };
        }
        const r = stmt.run(...params);
        return { lastInsertRowid: (r as any)?.lastInsertRowid ?? 0, changes: (r as any)?.changes ?? 0 };
      }
    };
  }

  /**
   * Create a transaction
   */
  transaction<T>(fn: (...args: any[]) => T): (...args: any[]) => T {
    return this._db.transaction(fn) as any;
  }

  /**
   * Close the connection
   */
  close(): void {
    this._db.close();
  }
}
