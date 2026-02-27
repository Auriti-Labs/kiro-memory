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
   * Adatta parametri named da formato bun:sqlite a better-sqlite3.
   * bun:sqlite: chiavi CON prefisso (es. { $todayStart: 123 })
   * better-sqlite3: chiavi SENZA prefisso (es. { todayStart: 123 })
   */
  private _adaptParams(params: any[]): any[] {
    if (params.length !== 1 || typeof params[0] !== 'object' || params[0] === null || Array.isArray(params[0])) {
      return params;
    }
    const obj = params[0];
    const keys = Object.keys(obj);
    if (keys.length === 0) return params;
    // Se nessuna chiave ha prefisso $/@/:, già compatibile con better-sqlite3
    if (!keys[0].startsWith('$') && !keys[0].startsWith('@') && !keys[0].startsWith(':')) {
      return params;
    }
    // Rimuovi il prefisso dalle chiavi
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

export default { Database };
