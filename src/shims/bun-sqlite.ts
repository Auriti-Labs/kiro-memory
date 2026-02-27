/**
 * Shim bun:sqlite → better-sqlite3
 *
 * Provides a bun:sqlite-compatible API using better-sqlite3
 * to allow execution on plain Node.js.
 */

import BetterSqlite3 from 'better-sqlite3';

/**
 * bun:sqlite-compatible Database class
 */
export class Database {
  private _db: BetterSqlite3.Database;
  private _stmtCache: Map<string, BunQueryCompat> = new Map();

  constructor(path: string, options?: { create?: boolean; readwrite?: boolean }) {
    this._db = new BetterSqlite3(path, {
      // better-sqlite3 creates the file by default ('create' not needed)
      readonly: options?.readwrite === false ? true : false
    });
  }

  /**
   * Execute a SQL query without results
   */
  run(sql: string, params?: any[]): { lastInsertRowid: number | bigint; changes: number } {
    const stmt = this._db.prepare(sql);
    const result = params ? stmt.run(...params) : stmt.run();
    return result;
  }

  /**
   * Prepare a query with bun:sqlite-compatible interface.
   * Returns a cached prepared statement for repeated queries.
   */
  query(sql: string): BunQueryCompat {
    let cached = this._stmtCache.get(sql);
    if (!cached) {
      cached = new BunQueryCompat(this._db, sql);
      this._stmtCache.set(sql, cached);
    }
    return cached;
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
    this._stmtCache.clear();
    this._db.close();
  }
}

/**
 * Query wrapper compatible with the bun:sqlite Statement API.
 * Prepares the statement once at construction time (cached).
 */
class BunQueryCompat {
  private _stmt: BetterSqlite3.Statement;

  constructor(db: BetterSqlite3.Database, sql: string) {
    this._stmt = db.prepare(sql);
  }

  /**
   * Returns all rows
   */
  all(...params: any[]): any[] {
    return params.length > 0 ? this._stmt.all(...params) : this._stmt.all();
  }

  /**
   * Returns the first row or null
   */
  get(...params: any[]): any {
    return params.length > 0 ? this._stmt.get(...params) : this._stmt.get();
  }

  /**
   * Execute without results
   */
  run(...params: any[]): { lastInsertRowid: number | bigint; changes: number } {
    return params.length > 0 ? this._stmt.run(...params) : this._stmt.run();
  }
}

export default { Database };
