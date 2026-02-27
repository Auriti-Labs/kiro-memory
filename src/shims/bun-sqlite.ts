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
   * Prepare a query with bun:sqlite-compatible interface
   */
  query(sql: string): BunQueryCompat {
    return new BunQueryCompat(this._db, sql);
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

/**
 * Query wrapper compatible with the bun:sqlite Statement API
 */
class BunQueryCompat {
  private _db: BetterSqlite3.Database;
  private _sql: string;

  constructor(db: BetterSqlite3.Database, sql: string) {
    this._db = db;
    this._sql = sql;
  }

  /**
   * Returns all rows
   */
  all(...params: any[]): any[] {
    const stmt = this._db.prepare(this._sql);
    return params.length > 0 ? stmt.all(...params) : stmt.all();
  }

  /**
   * Returns the first row or null
   */
  get(...params: any[]): any {
    const stmt = this._db.prepare(this._sql);
    return params.length > 0 ? stmt.get(...params) : stmt.get();
  }

  /**
   * Execute without results
   */
  run(...params: any[]): { lastInsertRowid: number | bigint; changes: number } {
    const stmt = this._db.prepare(this._sql);
    return params.length > 0 ? stmt.run(...params) : stmt.run();
  }
}

export default { Database };
