/**
 * SQLite adapter using better-sqlite3
 *
 * Default database provider for Kiro Memory.
 * Works on any Node.js >= 18 without requiring Bun.
 *
 * Implements the Database interface defined in ./types.ts.
 */

import BetterSqlite3 from 'better-sqlite3';
import type { Database as IDatabase, Statement, RunResult } from './types.js';

/**
 * SQLite database connection backed by better-sqlite3.
 */
export class Database {
  private _db: BetterSqlite3.Database;
  private _stmtCache: Map<string, PreparedStatement> = new Map();

  constructor(path: string, options?: { create?: boolean; readwrite?: boolean }) {
    this._db = new BetterSqlite3(path, {
      // better-sqlite3 creates the file by default ('create' not needed)
      readonly: options?.readwrite === false ? true : false
    });
  }

  /**
   * Execute a SQL query without results.
   * PRAGMA statements are handled via better-sqlite3's native pragma() method.
   */
  run(sql: string, params?: any[]): { lastInsertRowid: number | bigint; changes: number } {
    // better-sqlite3 handles PRAGMA via .pragma(), not .prepare().run()
    const trimmed = sql.trim();
    if (/^PRAGMA\s+/i.test(trimmed)) {
      // Extract "key = value" from "PRAGMA key = value"
      const pragmaBody = trimmed.replace(/^PRAGMA\s+/i, '').replace(/;$/, '');
      this._db.pragma(pragmaBody);
      return { lastInsertRowid: 0, changes: 0 };
    }
    const stmt = this._db.prepare(sql);
    const result = params ? stmt.run(...params) : stmt.run();
    return result;
  }

  /**
   * Prepare a query and return a cached prepared statement.
   * Returns a cached prepared statement for repeated queries.
   */
  query(sql: string): PreparedStatement {
    let cached = this._stmtCache.get(sql);
    if (!cached) {
      cached = new PreparedStatement(this._db, sql);
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
 * Prepared statement wrapper.
 * Adapts better-sqlite3's parameter format and caches the compiled statement.
 */
class PreparedStatement implements Statement {
  private _stmt: BetterSqlite3.Statement;

  constructor(db: BetterSqlite3.Database, sql: string) {
    this._stmt = db.prepare(sql);
  }

  /**
   * Adapt named parameters from $-prefixed format to plain keys.
   * Input:  { $todayStart: 123 }
   * Output: { todayStart: 123 }
   * (better-sqlite3 expects keys without the $ prefix)
   */
  private _adaptParams(params: any[]): any[] {
    if (params.length !== 1 || typeof params[0] !== 'object' || params[0] === null || Array.isArray(params[0])) {
      return params;
    }
    const obj = params[0];
    const keys = Object.keys(obj);
    if (keys.length === 0) return params;
    // Keys without $/@/: prefix are already compatible
    if (!keys[0].startsWith('$') && !keys[0].startsWith('@') && !keys[0].startsWith(':')) {
      return params;
    }
    // Strip the prefix from keys
    const adapted: Record<string, any> = {};
    for (const key of keys) {
      adapted[key.slice(1)] = obj[key];
    }
    return [adapted];
  }

  /**
   * Returns all rows
   */
  all(...params: any[]): any[] {
    if (params.length === 0) return this._stmt.all();
    return this._stmt.all(...this._adaptParams(params));
  }

  /**
   * Returns the first row or null
   */
  get(...params: any[]): any {
    if (params.length === 0) return this._stmt.get();
    return this._stmt.get(...this._adaptParams(params));
  }

  /**
   * Execute without results
   */
  run(...params: any[]): { lastInsertRowid: number | bigint; changes: number } {
    if (params.length === 0) return this._stmt.run();
    return this._stmt.run(...this._adaptParams(params));
  }
}


