/**
 * Test suite for TotalRecall Database
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { TotalRecallDatabase } from '../../src/services/sqlite/Database.js';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import type { Database } from 'bun:sqlite';

describe('TotalRecall Database', () => {
  let db: TotalRecallDatabase;

  beforeEach(() => {
    db = new TotalRecallDatabase(':memory:');
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
    expect(tableNames).toContain('conversation_messages');
    expect(tableNames).toContain('pending_messages');
    expect(tableNames).toContain('schema_versions');
  });

  it('prefers the legacy data dir when it contains data and the canonical db is empty', () => {
    const tempHome = mkdtempSync(join(tmpdir(), 'totalrecall-paths-'));
    const canonicalDir = join(tempHome, '.totalrecall');
    const legacyDir = join(tempHome, '.contextkit');

    try {
      mkdirSync(canonicalDir, { recursive: true });
      mkdirSync(legacyDir, { recursive: true });
      writeFileSync(join(canonicalDir, 'totalrecall.db'), 'schema-only');
      writeFileSync(join(legacyDir, 'contextkit.db'), 'legacy-data-that-is-larger');

      const script = [
        "import * as paths from './src/shared/paths.ts';",
        "console.log(JSON.stringify({ DATA_DIR: paths.DATA_DIR, DB_PATH: paths.DB_PATH }));",
      ].join('\n');

      const proc = Bun.spawnSync(['bun', '--eval', script], {
        cwd: process.cwd(),
        env: { ...process.env, HOME: tempHome },
        stdout: 'pipe',
        stderr: 'pipe',
      });

      expect(proc.exitCode).toBe(0);
      const output = JSON.parse(new TextDecoder().decode(proc.stdout));

      expect(output.DATA_DIR).toBe(legacyDir);
      expect(output.DB_PATH).toBe(join(legacyDir, 'contextkit.db'));
    } finally {
      rmSync(tempHome, { recursive: true, force: true });
    }
  });
});
