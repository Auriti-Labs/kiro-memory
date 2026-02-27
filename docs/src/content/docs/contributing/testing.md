---
title: Testing
description: Testing strategy, Bun test runner patterns, database tests with in-memory SQLite, and coverage.
---

Kiro Memory uses **Bun's built-in test runner** (not Jest or Vitest). Tests are written in TypeScript and live in the `tests/` directory.

## Running Tests

```bash
# Run all tests
bun test

# Run a specific directory
bun test tests/sqlite/
bun test tests/worker/agents/
bun test tests/worker/search/
bun test tests/context/
bun test tests/infrastructure/
bun test tests/server/

# Run a single file
bun test tests/sqlite/database.test.ts

# With verbose output
bun test --verbose

# Watch mode (re-runs on file change)
bun test --watch
```

The corresponding npm scripts are also available:

```bash
npm run test              # all tests
npm run test:sqlite       # SQLite layer
npm run test:agents       # agent tests
npm run test:search       # search tests
npm run test:context      # context tests
npm run test:infra        # infrastructure tests
npm run test:server       # server tests
```

## Test Structure

```
tests/
├── sqlite/
│   ├── database.test.ts     # KiroMemoryDatabase, migrations, WAL
│   ├── observations.test.ts  # Observation CRUD, deduplication, stale
│   └── sessions.test.ts     # Session lifecycle
├── worker/
│   ├── agents/              # Smart context, scoring, token budget
│   └── search/              # FTS5, hybrid search, vector search
├── context/                 # Context formatting and injection
├── server/                  # REST API endpoint tests
└── infrastructure/          # Build output validation, path resolution
```

## Writing Tests

Kiro Memory uses Bun's test API which mirrors the Jest API:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
```

### Naming Convention

```
<subject>_<scenario>_<expected>

Examples:
storeObservation_withDuplicateHash_returnsNegativeOne
search_withFTS5Query_returnsRankedResults
database_withMigrations_appliesAllVersions
```

### AAA Pattern

Every test follows Arrange, Act, Assert:

```typescript
it('storeObservation_withValidData_returnsPositiveId', async () => {
  // Arrange
  const sdk = createKiroMemory({ dataDir: ':memory:', project: 'test' });

  // Act
  const id = await sdk.storeObservation({
    type: 'file-write',
    title: 'Modified test.ts',
    content: 'Added new function'
  });

  // Assert
  expect(id).toBeGreaterThan(0);

  // Cleanup
  sdk.close();
});
```

## Database Tests with In-Memory SQLite

All database tests use `:memory:` SQLite instances for speed and isolation. **Never use the real `~/.contextkit/contextkit.db` in tests.**

```typescript
import { KiroMemoryDatabase } from '../../src/services/sqlite/Database';

describe('observations', () => {
  let db: KiroMemoryDatabase;

  beforeEach(() => {
    // Each test gets a fresh in-memory database
    db = new KiroMemoryDatabase(':memory:');
  });

  afterEach(() => {
    db.close();
  });

  it('createObservation_withValidInput_persistsToDatabase', () => {
    const id = createObservation(
      db.db,
      'test-session',
      'my-project',
      'file-write',
      'Modified test.ts',
      null,
      'Added authentication',
      null, null, null, null, null, 0
    );

    expect(id).toBeGreaterThan(0);

    const obs = db.db.query('SELECT * FROM observations WHERE id = ?').get(id);
    expect(obs).toBeDefined();
    expect((obs as any).title).toBe('Modified test.ts');
  });
});
```

## SDK Tests

```typescript
import { createKiroMemory } from '../../src/sdk/index';

describe('KiroMemorySDK', () => {
  let sdk: ReturnType<typeof createKiroMemory>;

  beforeEach(() => {
    sdk = createKiroMemory({
      dataDir: ':memory:',
      project: 'test-project'
    });
  });

  afterEach(() => {
    sdk.close();
  });

  it('storeObservation_withDuplicateContent_returnsNegativeOne', async () => {
    const data = {
      type: 'file-write',
      title: 'Modified auth.ts',
      content: 'Added JWT middleware'
    };

    // First store succeeds
    const id1 = await sdk.storeObservation(data);
    expect(id1).toBeGreaterThan(0);

    // Immediate duplicate is rejected (within deduplication window)
    const id2 = await sdk.storeObservation(data);
    expect(id2).toBe(-1);
  });

  it('search_withMatchingQuery_returnsObservations', async () => {
    await sdk.storeObservation({
      type: 'file-write',
      title: 'Modified auth.ts',
      content: 'JWT authentication middleware'
    });

    const results = await sdk.search('authentication');
    expect(results.observations.length).toBeGreaterThan(0);
    expect(results.observations[0].title).toBe('Modified auth.ts');
  });
});
```

## API Endpoint Tests

Use the Express `app` directly (no HTTP server needed):

```typescript
import request from 'supertest';
import { createApp } from '../../src/services/worker-service';

describe('GET /api/observations', () => {
  it('withProjectFilter_returnsFilteredResults', async () => {
    const response = await request(app)
      .get('/api/observations?project=my-api')
      .expect(200);

    expect(Array.isArray(response.body)).toBe(true);
    expect(response.headers['x-total-count']).toBeDefined();
  });

  it('withInvalidProject_returns400', async () => {
    await request(app)
      .get('/api/observations?project=../../../etc/passwd')
      .expect(400);
  });
});
```

## Testing Search Features

FTS5 search tests need actual data inserted:

```typescript
it('searchFTS5_withFuzzyQuery_returnsMatchingObservations', () => {
  // Insert test data
  const obs = createObservation(db.db, 'session', 'project', 'file-write',
    'Modified auth.ts', null, 'Added JWT middleware', null, null,
    'security,api', null, null, 0);

  // Search for a concept
  const results = searchObservationsFTS(db.db, 'JWT', { project: 'project' });
  expect(results.length).toBeGreaterThan(0);
  expect(results[0].id).toBe(obs);
});
```

## What to Test

### Must test (regression prevention):

- Database migration runs without errors for all versions
- Observation deduplication returns -1 within the window and a new ID outside
- FTS5 triggers keep the index in sync with the observations table
- Secret redaction removes API keys and passwords from prompt text
- Project detection falls back to 'default' when not in a git repo
- Session lifecycle: create → active → completed
- Checkpoint creation and retrieval by session and project

### Should test (confidence):

- Hybrid search returns results sorted by composite score
- Token budget truncates items at the correct boundary
- Knowledge type validation rejects invalid types
- API endpoints return 400 for invalid input
- API endpoints return 404 for missing resources

### Nice to have (edge cases):

- Concurrent writes do not corrupt the database
- Large observation content is handled gracefully (100KB limit)
- Unicode in observation titles and content
- Empty search results do not throw

## Test Coverage

Run with coverage:

```bash
bun test --coverage
```

Coverage reports are generated in `coverage/`. Priority areas:

| Priority | Areas |
|----------|-------|
| High | SQLite CRUD, deduplication, migrations |
| High | Context scoring, token budget |
| Medium | API endpoint validation |
| Medium | Hook stdin parsing and output formatting |
| Low | Dashboard UI components |
| Low | Analytics aggregations |
