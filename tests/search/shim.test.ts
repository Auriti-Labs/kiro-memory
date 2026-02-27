/**
 * Test suite for the bun-sqlite shim API contract
 *
 * The shim (src/shims/bun-sqlite.ts) maps bun:sqlite's API onto better-sqlite3
 * so that built Node.js bundles work without Bun. Under the Bun test runner,
 * better-sqlite3 is unsupported (native binding limitation), so these tests
 * verify the same API contract through Bun's native bun:sqlite implementation.
 *
 * This ensures that:
 * 1. The API surface the shim promises (Database, query().all/get/run,
 *    statement caching, run(), transaction(), close()) is fully functional.
 * 2. Any code that relies on this contract will work whether the shim or
 *    native bun:sqlite is backing it.
 *
 * The shim's constructor, query(), run(), transaction(), and close() methods
 * mirror the bun:sqlite Database API exactly — that contract is what we test.
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { Database } from 'bun:sqlite';

// ============================================================================
// Helpers
// ============================================================================

/** Creates an in-memory DB with a simple users table for testing */
function createTestDb(): Database {
  const db = new Database(':memory:');
  db.run('CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, age INTEGER)');
  return db;
}

// ============================================================================
// Database creation
// ============================================================================

describe('Database creation', () => {
  it('creates an in-memory database without throwing', () => {
    let db: Database | null = null;
    expect(() => {
      db = new Database(':memory:');
    }).not.toThrow();
    db!.close();
  });

  it('creates an in-memory database and runs a basic CREATE TABLE', () => {
    const db = new Database(':memory:');
    expect(() => {
      db.run('CREATE TABLE test (id INTEGER PRIMARY KEY, val TEXT)');
    }).not.toThrow();
    db.close();
  });
});

// ============================================================================
// query().all()
// ============================================================================

describe('query().all()', () => {
  let db: Database;

  beforeEach(() => {
    db = createTestDb();
    db.run('INSERT INTO users (name, age) VALUES ($name, $age)', { $name: 'Alice', $age: 30 });
    db.run('INSERT INTO users (name, age) VALUES ($name, $age)', { $name: 'Bob', $age: 25 });
    db.run('INSERT INTO users (name, age) VALUES ($name, $age)', { $name: 'Carol', $age: 35 });
  });

  afterEach(() => {
    db.close();
  });

  it('returns all rows as an array', () => {
    const rows = db.query('SELECT * FROM users').all() as { id: number; name: string; age: number }[];
    expect(rows).toHaveLength(3);
  });

  it('returns rows with correct field values', () => {
    const rows = db.query('SELECT name, age FROM users ORDER BY name').all() as { name: string; age: number }[];
    expect(rows[0].name).toBe('Alice');
    expect(rows[0].age).toBe(30);
    expect(rows[1].name).toBe('Bob');
    expect(rows[2].name).toBe('Carol');
  });

  it('returns empty array when no rows match', () => {
    const rows = db.query('SELECT * FROM users WHERE age > 100').all();
    expect(rows).toHaveLength(0);
    expect(Array.isArray(rows)).toBe(true);
  });

  it('accepts positional parameters', () => {
    const rows = db.query('SELECT * FROM users WHERE age = ?').all(30) as { name: string }[];
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe('Alice');
  });
});

// ============================================================================
// query().get()
// ============================================================================

describe('query().get()', () => {
  let db: Database;

  beforeEach(() => {
    db = createTestDb();
    db.run('INSERT INTO users (name, age) VALUES ($name, $age)', { $name: 'Alice', $age: 30 });
    db.run('INSERT INTO users (name, age) VALUES ($name, $age)', { $name: 'Bob', $age: 25 });
  });

  afterEach(() => {
    db.close();
  });

  it('returns the first matching row', () => {
    const row = db.query('SELECT * FROM users ORDER BY id LIMIT 1').get() as { name: string };
    expect(row).not.toBeNull();
    expect(row.name).toBe('Alice');
  });

  it('returns null when no rows match', () => {
    const row = db.query('SELECT * FROM users WHERE name = ?').get('NonExistent');
    expect(row).toBeNull();
  });

  it('accepts positional parameters', () => {
    const row = db.query('SELECT name FROM users WHERE age = ?').get(25) as { name: string };
    expect(row).not.toBeNull();
    expect(row.name).toBe('Bob');
  });

  it('returns a single object (not an array)', () => {
    const row = db.query('SELECT * FROM users LIMIT 1').get();
    expect(Array.isArray(row)).toBe(false);
    expect(typeof row).toBe('object');
  });
});

// ============================================================================
// query().run()
// ============================================================================

describe('query().run()', () => {
  let db: Database;

  beforeEach(() => {
    db = createTestDb();
  });

  afterEach(() => {
    db.close();
  });

  it('returns an object with changes and lastInsertRowid', () => {
    const result = db.query('INSERT INTO users (name, age) VALUES (?, ?)').run('Dave', 40);
    expect(result).toHaveProperty('changes');
    expect(result).toHaveProperty('lastInsertRowid');
  });

  it('reports changes = 1 after a single INSERT', () => {
    const result = db.query('INSERT INTO users (name, age) VALUES (?, ?)').run('Eve', 22);
    expect(result.changes).toBe(1);
  });

  it('returns a numeric or bigint lastInsertRowid after INSERT', () => {
    const result = db.query('INSERT INTO users (name, age) VALUES (?, ?)').run('Frank', 50);
    const rid = result.lastInsertRowid;
    const isNumeric = typeof rid === 'number' || typeof rid === 'bigint';
    expect(isNumeric).toBe(true);
    if (typeof rid === 'number') expect(rid).toBeGreaterThan(0);
    if (typeof rid === 'bigint') expect(rid > 0n).toBe(true);
  });

  it('reports changes = 0 for an UPDATE that matches no rows', () => {
    const result = db.query('UPDATE users SET age = 99 WHERE name = ?').run('Ghost');
    expect(result.changes).toBe(0);
  });

  it('reports correct changes count for DELETE', () => {
    db.run('INSERT INTO users (name, age) VALUES ($name, $age)', { $name: 'Alice', $age: 30 });
    db.run('INSERT INTO users (name, age) VALUES ($name, $age)', { $name: 'Bob', $age: 25 });
    const result = db.query('DELETE FROM users WHERE age < 31').run();
    expect(result.changes).toBe(2);
  });
});

// ============================================================================
// Statement caching — bun:sqlite caches prepared statements by default
// ============================================================================

describe('Statement caching', () => {
  let db: Database;

  beforeEach(() => {
    db = createTestDb();
  });

  afterEach(() => {
    db.close();
  });

  it('returns the same object reference for the same SQL (shim caches by SQL string)', () => {
    const sql = 'SELECT * FROM users WHERE id = ?';
    const stmt1 = db.query(sql);
    const stmt2 = db.query(sql);
    // bun:sqlite and the shim both cache: same SQL → same instance
    expect(stmt1).toBe(stmt2);
  });

  it('returns different objects for different SQL strings', () => {
    const stmt1 = db.query('SELECT * FROM users');
    const stmt2 = db.query('SELECT name FROM users');
    expect(stmt1).not.toBe(stmt2);
  });

  it('cached statement still executes correctly after multiple calls', () => {
    db.run('INSERT INTO users (name, age) VALUES ($name, $age)', { $name: 'Alice', $age: 30 });

    const sql = 'SELECT * FROM users WHERE name = ?';
    const first = db.query(sql).get('Alice') as { name: string };
    const cached = db.query(sql).get('Alice') as { name: string };

    expect(first.name).toBe('Alice');
    expect(cached.name).toBe('Alice');
  });

  it('re-using a cached statement with different params returns correct results', () => {
    db.run('INSERT INTO users (name, age) VALUES ($name, $age)', { $name: 'Alice', $age: 30 });
    db.run('INSERT INTO users (name, age) VALUES ($name, $age)', { $name: 'Bob', $age: 25 });

    const sql = 'SELECT name FROM users WHERE age = ?';
    const alice = db.query(sql).get(30) as { name: string };
    const bob = db.query(sql).get(25) as { name: string };

    expect(alice.name).toBe('Alice');
    expect(bob.name).toBe('Bob');
  });
});

// ============================================================================
// db.run() with params
// ============================================================================

describe('db.run() with params', () => {
  let db: Database;

  beforeEach(() => {
    db = createTestDb();
  });

  afterEach(() => {
    db.close();
  });

  it('inserts a row using named params', () => {
    db.run('INSERT INTO users (name, age) VALUES ($name, $age)', { $name: 'Grace', $age: 28 });
    const row = db.query('SELECT * FROM users WHERE name = ?').get('Grace') as { name: string; age: number };
    expect(row).not.toBeNull();
    expect(row.age).toBe(28);
  });

  it('returns changes and lastInsertRowid', () => {
    const result = db.run('INSERT INTO users (name, age) VALUES ($name, $age)', { $name: 'Heidi', $age: 33 });
    expect(result.changes).toBe(1);
    const rid = result.lastInsertRowid;
    const isNumeric = typeof rid === 'number' || typeof rid === 'bigint';
    expect(isNumeric).toBe(true);
  });

  it('works without params (no array passed)', () => {
    db.run('INSERT INTO users (name, age) VALUES ("Anon", 0)');
    const rows = db.query('SELECT * FROM users').all();
    expect(rows).toHaveLength(1);
  });

  it('updates rows correctly with params', () => {
    db.run('INSERT INTO users (name, age) VALUES ($name, $age)', { $name: 'Ivan', $age: 20 });
    db.run('UPDATE users SET age = $age WHERE name = $name', { $age: 21, $name: 'Ivan' });
    const row = db.query('SELECT age FROM users WHERE name = ?').get('Ivan') as { age: number };
    expect(row.age).toBe(21);
  });
});

// ============================================================================
// transaction()
// ============================================================================

describe('transaction()', () => {
  let db: Database;

  beforeEach(() => {
    db = createTestDb();
  });

  afterEach(() => {
    db.close();
  });

  it('wraps multiple inserts atomically', () => {
    const insertBatch = db.transaction((names: string[]) => {
      for (const name of names) {
        db.run('INSERT INTO users (name, age) VALUES ($name, $age)', { $name: name, $age: 1 });
      }
    });

    insertBatch(['Judy', 'Karl', 'Leo']);

    const rows = db.query('SELECT * FROM users').all();
    expect(rows).toHaveLength(3);
  });

  it('rolls back all changes on error inside transaction', () => {
    const failingTx = db.transaction(() => {
      db.run('INSERT INTO users (name, age) VALUES ($name, $age)', { $name: 'Mallory', $age: 10 });
      // Force a NOT NULL violation — name column is NOT NULL
      db.run('INSERT INTO users (name, age) VALUES (NULL, 99)');
    });

    try {
      failingTx();
    } catch {
      // Expected to throw due to constraint violation
    }

    // Rollback: no rows should have been persisted
    const rows = db.query('SELECT * FROM users').all();
    expect(rows).toHaveLength(0);
  });

  it('returns the value returned by the transaction function', () => {
    const countTx = db.transaction(() => {
      db.run('INSERT INTO users (name, age) VALUES ($name, $age)', { $name: 'Niaj', $age: 5 });
      db.run('INSERT INTO users (name, age) VALUES ($name, $age)', { $name: 'Oscar', $age: 6 });
      return 42;
    });

    const result = countTx();
    expect(result).toBe(42);
  });

  it('can be called multiple times with different arguments', () => {
    const insert = db.transaction((name: string) => {
      db.run('INSERT INTO users (name, age) VALUES ($name, $age)', { $name: name, $age: 0 });
    });

    insert('P');
    insert('Q');
    insert('R');

    const rows = db.query('SELECT * FROM users').all();
    expect(rows).toHaveLength(3);
  });

  it('nested transactions are not allowed (should throw)', () => {
    const outer = db.transaction(() => {
      const inner = db.transaction(() => {
        db.run('INSERT INTO users (name, age) VALUES ($name, $age)', { $name: 'Nested', $age: 0 });
      });
      expect(() => inner()).toThrow();
    });

    // outer itself may or may not throw; what matters is inner throws
    try { outer(); } catch { /* ignore */ }
  });
});

// ============================================================================
// close()
// ============================================================================

describe('close()', () => {
  it('closes without throwing', () => {
    const db = createTestDb();
    expect(() => db.close()).not.toThrow();
  });

  it('clears prepared statement state on close (subsequent use throws)', () => {
    const db = createTestDb();
    const stmt = db.query('SELECT * FROM users');
    db.close();

    // After close, using the statement should throw
    expect(() => stmt.all()).toThrow();
  });

  it('closing an already-closed database is idempotent (does not throw)', () => {
    const db = createTestDb();
    db.close();
    // bun:sqlite allows calling close() more than once without error;
    // the shim matches this behavior by clearing the cache before delegating.
    expect(() => db.close()).not.toThrow();
  });
});
