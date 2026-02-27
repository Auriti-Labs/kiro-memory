/**
 * Test suite for KiroMemory Database
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { KiroMemoryDatabase } from '../../src/services/sqlite/Database.js';
import type { Database } from 'bun:sqlite';

describe('KiroMemory Database', () => {
  let db: KiroMemoryDatabase;

  beforeEach(() => {
    db = new KiroMemoryDatabase(':memory:');
  });

  afterEach(() => {
    db.close();
  });

  it('should initialize with correct schema', () => {
    const tables = db.db.query(
      "SELECT name FROM sqlite_master WHERE type='table'"
    ).all() as { name: string }[];
    
    const tableNames = tables.map(t => t.name);
    
    expect(tableNames).toContain('sessions');
    expect(tableNames).toContain('observations');
    expect(tableNames).toContain('summaries');
    expect(tableNames).toContain('prompts');
    expect(tableNames).toContain('pending_messages');
    expect(tableNames).toContain('schema_versions');
  });
});
