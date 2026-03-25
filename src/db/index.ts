/**
 * Database adapter for Kiro Memory
 *
 * Default implementation: better-sqlite3 (works on any Node.js ≥ 18).
 * No Bun runtime required.
 *
 * Re-exports the Database class and adapter types so the rest of the
 * codebase imports from '@db' (mapped via tsconfig paths) or '../db'.
 */

export type { Database as DatabaseInterface, Statement, RunResult } from './types.js';
export { Database } from './better-sqlite3-adapter.js';
