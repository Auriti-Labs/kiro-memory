/**
 * Database adapter for Total Recall
 *
 * Auto-detects runtime:
 * - Bun → uses bun:sqlite (native, zero dependencies)
 * - Node.js → uses better-sqlite3
 *
 * Re-exports the Database class so the rest of the codebase
 * imports from '../db' without caring about the runtime.
 */

export type { Database as DatabaseInterface, Statement, RunResult } from './types.js';

// Detect Bun runtime at module level
const isBun = typeof globalThis.Bun !== 'undefined';

// Dynamic re-export based on runtime
let DatabaseClass: any;

if (isBun) {
  // bun:sqlite is always available under Bun
  const mod = await import('./bun-sqlite-adapter.js');
  DatabaseClass = mod.Database;
} else {
  // Node.js: use better-sqlite3
  const mod = await import('./better-sqlite3-adapter.js');
  DatabaseClass = mod.Database;
}

export const Database = DatabaseClass as typeof import('./better-sqlite3-adapter.js').Database;
