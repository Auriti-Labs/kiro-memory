/**
 * Dichiarazioni di tipo per il modulo bun:sqlite.
 * In produzione viene shimato a better-sqlite3 dal build plugin esbuild.
 */

declare module 'bun:sqlite' {
  export class Database {
    constructor(path: string, options?: { create?: boolean; readwrite?: boolean });
    run(sql: string, params?: any[]): { lastInsertRowid: number | bigint; changes: number };
    query(sql: string): Statement;
    transaction<T>(fn: (...args: any[]) => T): (...args: any[]) => T;
    close(): void;
  }

  export class Statement {
    all(...params: any[]): any[];
    get(...params: any[]): any;
    run(...params: any[]): { lastInsertRowid: number | bigint; changes: number };
  }

  const _default: { Database: typeof Database };
  export default _default;
}
