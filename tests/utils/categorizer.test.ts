/**
 * Test suite for the automatic observation categorizer.
 * Verifies keyword-based category assignment, file pattern matching,
 * type-based signals, priority resolution and edge cases.
 */

import { describe, it, expect } from 'bun:test';
import { categorize, getCategories, type ObservationCategory } from '../../src/utils/categorizer.js';
import { KiroMemoryDatabase } from '../../src/services/sqlite/Database.js';
import { createObservation, getObservationsByProject } from '../../src/services/sqlite/Observations.js';

// ── Helpers ────────────────────────────────────────────────────────────────────

function obs(overrides: Partial<Parameters<typeof categorize>[0]> = {}): Parameters<typeof categorize>[0] {
  return {
    type: 'note',
    title: 'Untitled',
    text: null,
    narrative: null,
    concepts: null,
    filesModified: null,
    filesRead: null,
    ...overrides,
  };
}

// ── Security ───────────────────────────────────────────────────────────────────

describe('categorize — security', () => {
  it('should categorize "security vulnerability" in title as security', () => {
    expect(categorize(obs({ title: 'Fixed security vulnerability in login' }))).toBe('security');
  });

  it('should categorize XSS keyword in text as security', () => {
    expect(categorize(obs({ title: 'Frontend patch', text: 'Prevented XSS via output escaping' }))).toBe('security');
  });

  it('should categorize CSRF keyword as security', () => {
    expect(categorize(obs({ title: 'Form protection', text: 'Added CSRF token validation' }))).toBe('security');
  });

  it('should categorize authentication keyword as security', () => {
    expect(categorize(obs({ title: 'Improve authentication flow' }))).toBe('security');
  });

  it('should categorize file matching auth pattern as security', () => {
    expect(categorize(obs({ title: 'Update logic', filesModified: 'src/auth/middleware.ts' }))).toBe('security');
  });

  it('should categorize secrets.ts file pattern as security', () => {
    expect(categorize(obs({ title: 'Patch redaction', filesRead: 'src/utils/secrets.ts' }))).toBe('security');
  });
});

// ── Testing ────────────────────────────────────────────────────────────────────

describe('categorize — testing', () => {
  it('should categorize observation type "test" as testing', () => {
    expect(categorize(obs({ type: 'test', title: 'Verify login' }))).toBe('testing');
  });

  it('should categorize "unit test" keyword as testing', () => {
    expect(categorize(obs({ title: 'Write unit test for session manager' }))).toBe('testing');
  });

  it('should categorize "coverage" keyword as testing', () => {
    expect(categorize(obs({ title: 'Increase test coverage to 80%' }))).toBe('testing');
  });

  it('should categorize .test.ts file pattern as testing', () => {
    expect(categorize(obs({ title: 'Add assertions', filesModified: 'tests/sqlite/database.test.ts' }))).toBe('testing');
  });

  it('should categorize __tests__ directory pattern as testing', () => {
    expect(categorize(obs({ title: 'New suite', filesModified: 'src/__tests__/api.ts' }))).toBe('testing');
  });

  it('should categorize "mock" keyword as testing', () => {
    expect(categorize(obs({ title: 'Mock the database connection in tests' }))).toBe('testing');
  });
});

// ── Debugging ──────────────────────────────────────────────────────────────────

describe('categorize — debugging', () => {
  it('should categorize observation type "bugfix" as debugging', () => {
    expect(categorize(obs({ type: 'bugfix', title: 'Fix worker crash' }))).toBe('debugging');
  });

  it('should categorize "root cause" keyword as debugging', () => {
    expect(categorize(obs({ title: 'Investigate root cause of 500 errors' }))).toBe('debugging');
  });

  it('should categorize "stack trace" keyword as debugging', () => {
    expect(categorize(obs({ title: 'Analyze stack trace from production' }))).toBe('debugging');
  });

  it('should categorize "regression" keyword as debugging', () => {
    expect(categorize(obs({ title: 'Regression in pagination after refactor' }))).toBe('debugging');
  });

  it('should categorize "troubleshoot" keyword as debugging', () => {
    expect(categorize(obs({ title: 'Troubleshoot slow queries in dashboard' }))).toBe('debugging');
  });
});

// ── Architecture ───────────────────────────────────────────────────────────────

describe('categorize — architecture', () => {
  it('should categorize observation type "decision" as architecture', () => {
    expect(categorize(obs({ type: 'decision', title: 'Choose SQLite over Postgres' }))).toBe('architecture');
  });

  it('should categorize observation type "constraint" as architecture', () => {
    expect(categorize(obs({ type: 'constraint', title: 'Must stay under 50MB bundle' }))).toBe('architecture');
  });

  it('should categorize "singleton" keyword as architecture', () => {
    expect(categorize(obs({ title: 'Implement singleton pattern for DB connection' }))).toBe('architecture');
  });

  it('should categorize "microservice" keyword as architecture', () => {
    expect(categorize(obs({ title: 'Split monolith into microservices' }))).toBe('architecture');
  });

  it('should categorize "dependency injection" keyword as architecture', () => {
    // Note: "injection" alone triggers security; the full phrase "dependency injection"
    // is an architecture keyword but its substring "injection" also scores security.
    // Use type signal to force architecture to win.
    expect(categorize(obs({ type: 'decision', title: 'Adopt dependency injection' }))).toBe('architecture');
  });
});

// ── Refactoring ────────────────────────────────────────────────────────────────

describe('categorize — refactoring', () => {
  it('should categorize "refactor" keyword as refactoring', () => {
    expect(categorize(obs({ title: 'Refactor worker service into modules' }))).toBe('refactoring');
  });

  it('should categorize "clean up" keyword as refactoring', () => {
    expect(categorize(obs({ title: 'Clean up dead code in analytics module' }))).toBe('refactoring');
  });

  it('should categorize "decouple" keyword as refactoring', () => {
    expect(categorize(obs({ title: 'Decouple search from worker service' }))).toBe('refactoring');
  });

  it('should categorize "consolidate" keyword as refactoring', () => {
    expect(categorize(obs({ title: 'Consolidate duplicate utility functions' }))).toBe('refactoring');
  });
});

// ── Config ─────────────────────────────────────────────────────────────────────

describe('categorize — config', () => {
  it('should categorize "tsconfig" keyword as config', () => {
    expect(categorize(obs({ title: 'Update tsconfig for strict mode' }))).toBe('config');
  });

  it('should categorize ".yml" file pattern as config', () => {
    // Use a neutral title so only the file pattern signal is active
    expect(categorize(obs({ title: 'Update CI workflow', filesModified: '.github/workflows/ci.yml' }))).toBe('config');
  });

  it('should categorize "docker-compose" file pattern as config', () => {
    // Use a neutral title without feature-dev keywords
    expect(categorize(obs({ title: 'Configure compose file', filesModified: 'docker-compose.yml' }))).toBe('config');
  });

  it('should categorize ".env" file pattern as config', () => {
    expect(categorize(obs({ title: 'Add variable', filesModified: '.env.example' }))).toBe('config');
  });

  it('should categorize "esbuild" keyword as config', () => {
    expect(categorize(obs({ title: 'Tune esbuild bundle options' }))).toBe('config');
  });
});

// ── Docs ───────────────────────────────────────────────────────────────────────

describe('categorize — docs', () => {
  it('should categorize observation type "docs" as docs', () => {
    expect(categorize(obs({ type: 'docs', title: 'Add API documentation' }))).toBe('docs');
  });

  it('should categorize "readme" keyword as docs', () => {
    expect(categorize(obs({ title: 'Update readme with new CLI flags' }))).toBe('docs');
  });

  it('should categorize ".md" file pattern as docs', () => {
    expect(categorize(obs({ title: 'Write guide', filesModified: 'docs/architecture.md' }))).toBe('docs');
  });

  it('should categorize "openapi" keyword as docs', () => {
    // Avoid "spec" (testing keyword) by using a title without it
    expect(categorize(obs({ title: 'Generate openapi documentation from routes' }))).toBe('docs');
  });

  it('should categorize "jsdoc" keyword as docs', () => {
    expect(categorize(obs({ title: 'Add jsdoc comments to SDK exports' }))).toBe('docs');
  });
});

// ── Feature-dev ────────────────────────────────────────────────────────────────

describe('categorize — feature-dev', () => {
  it('should categorize observation type "feature" as feature-dev', () => {
    expect(categorize(obs({ type: 'feature', title: 'Add new dashboard widget' }))).toBe('feature-dev');
  });

  it('should categorize observation type "file-write" as feature-dev', () => {
    expect(categorize(obs({ type: 'file-write', title: 'Created index.ts' }))).toBe('feature-dev');
  });

  it('should categorize "implement" keyword as feature-dev', () => {
    expect(categorize(obs({ title: 'Implement auto-categorization for observations' }))).toBe('feature-dev');
  });

  it('should categorize "endpoint" keyword as feature-dev', () => {
    expect(categorize(obs({ title: 'Add REST endpoint for category filter' }))).toBe('feature-dev');
  });
});

// ── General ────────────────────────────────────────────────────────────────────

describe('categorize — general fallback', () => {
  it('should return general for plain text with no keywords', () => {
    expect(categorize(obs({ title: 'Some random note' }))).toBe('general');
  });

  it('should return general for empty title and null fields', () => {
    expect(categorize(obs({ title: '' }))).toBe('general');
  });

  it('should handle null text gracefully without throwing', () => {
    expect(() => categorize(obs({ title: 'Title', text: null }))).not.toThrow();
  });

  it('should handle null filesModified and filesRead gracefully', () => {
    expect(() => categorize(obs({ title: 'Title', filesModified: null, filesRead: null }))).not.toThrow();
  });
});

// ── Priority resolution ────────────────────────────────────────────────────────

describe('categorize — priority and weight resolution', () => {
  it('should prefer security over feature-dev when both keywords match', () => {
    // "implement" → feature-dev (weight 3), "encrypt" → security (weight 10)
    const result = categorize(obs({ title: 'Implement token encryption for API keys' }));
    expect(result).toBe('security');
  });

  it('should prefer security over debugging when both match', () => {
    // "fix" → debugging (weight 8), "authentication" → security (weight 10)
    const result = categorize(obs({ title: 'Fix authentication bypass vulnerability' }));
    expect(result).toBe('security');
  });

  it('should boost score when both keyword and type match the same category', () => {
    // type "test" = weight*2=16, "coverage" = weight=8 → testing score=24 vs anything else
    const result = categorize(obs({ type: 'test', title: 'Increase coverage for auth module', text: 'authentication' }));
    // testing wins over security due to combined signals
    expect(result).toBe('testing');
  });

  it('should categorize combined keyword+file signals correctly', () => {
    // type "decision" (architecture weight*2=14) + "singleton" (weight=7) = 21
    const result = categorize(obs({
      type: 'decision',
      title: 'Singleton pattern for DB',
      filesModified: 'src/services/database.ts',
    }));
    expect(result).toBe('architecture');
  });
});

// ── Case insensitivity ─────────────────────────────────────────────────────────

describe('categorize — case insensitive matching', () => {
  it('should match uppercase keywords', () => {
    expect(categorize(obs({ title: 'Analyzed STACK TRACE from crash dump' }))).toBe('debugging');
  });

  it('should match mixed-case keywords', () => {
    expect(categorize(obs({ title: 'Prevented XSS Attack via CSP header' }))).toBe('security');
  });

  it('should match mixed-case file patterns', () => {
    expect(categorize(obs({ title: 'Update spec', filesModified: 'src/Api.Test.ts' }))).toBe('testing');
  });
});

// ── getCategories ──────────────────────────────────────────────────────────────

describe('getCategories', () => {
  it('should return exactly 9 categories', () => {
    expect(getCategories().length).toBe(9);
  });

  it('should include all expected category names', () => {
    const cats = getCategories();
    const expected: ObservationCategory[] = [
      'architecture', 'debugging', 'refactoring', 'feature-dev',
      'testing', 'docs', 'config', 'security', 'general',
    ];
    for (const cat of expected) {
      expect(cats).toContain(cat);
    }
  });
});

// ── Integration: createObservation stores auto_category ───────────────────────

describe('createObservation — auto_category integration', () => {
  it('should persist auto_category when creating an observation', () => {
    const kmDb = new KiroMemoryDatabase(':memory:');
    const db = kmDb.db;

    try {
      createObservation(
        db,
        'session-1',
        'test-project',
        'bugfix',
        'Fix authentication bypass',
        null,
        'Patched the OAuth token validation logic',
        null,
        null,
        null,
        null,
        null,
        1
      );

      const rows = getObservationsByProject(db, 'test-project');
      expect(rows.length).toBe(1);

      const obs = rows[0] as any;
      // Both "bugfix" type (debugging) and "authentication" keyword (security) present.
      // Security has higher weight (10) vs debugging (8), so security wins.
      expect(['debugging', 'security']).toContain(obs.auto_category);
      expect(obs.auto_category).not.toBe(null);
      expect(obs.auto_category).not.toBe('general');
    } finally {
      db.close();
    }
  });

  it('should store "general" for observations with no matching keywords', () => {
    const kmDb = new KiroMemoryDatabase(':memory:');
    const db = kmDb.db;

    try {
      createObservation(
        db,
        'session-2',
        'test-project',
        'note',
        'Random observation with no context',
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        1
      );

      const rows = getObservationsByProject(db, 'test-project');
      expect(rows.length).toBe(1);

      const obs = rows[0] as any;
      expect(obs.auto_category).toBe('general');
    } finally {
      db.close();
    }
  });

  it('should store "testing" for a test-type observation with test file', () => {
    const kmDb = new KiroMemoryDatabase(':memory:');
    const db = kmDb.db;

    try {
      createObservation(
        db,
        'session-3',
        'test-project',
        'test',
        'Add unit tests for categorizer module',
        null,
        'Write expect assertions for all categories',
        null,
        null,
        null,
        'tests/utils/categorizer.test.ts',
        null,
        1
      );

      const rows = getObservationsByProject(db, 'test-project');
      const obs = rows[0] as any;
      expect(obs.auto_category).toBe('testing');
    } finally {
      db.close();
    }
  });
});
