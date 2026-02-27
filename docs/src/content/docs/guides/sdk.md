---
title: SDK
description: Using the KiroMemorySDK class for programmatic access to the memory system.
---

The Kiro Memory SDK provides programmatic access to all memory operations. Use it to build integrations, custom scripts, or extend the default hook behavior.

## Installation

```bash
npm install kiro-memory
```

## Import

```typescript
import { createKiroMemory } from 'kiro-memory/sdk';
// or
import { KiroMemorySDK } from 'kiro-memory/sdk';
```

## Factory Function

### `createKiroMemory(config?)`

Creates a new `KiroMemorySDK` instance.

```typescript
const sdk = createKiroMemory({
  dataDir: '/path/to/data',   // default: ~/.contextkit
  project: 'my-project',      // default: auto-detected from git
  skipMigrations: false        // default: false (set true for high-frequency hooks)
});
```

**Config options:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `dataDir` | string | `~/.contextkit` | Path to the data directory containing the SQLite database |
| `project` | string | auto from `git rev-parse` | Project name used to scope all operations |
| `skipMigrations` | boolean | `false` | Skip migration check on construction (use in high-frequency hooks for performance) |

Always call `sdk.close()` when done to release the database connection.

## Storing Data

### `storeObservation(data)`

Store an observation (a captured event from a development session).

```typescript
const id = await sdk.storeObservation({
  type: 'file-write',
  title: 'Modified auth.ts',
  content: 'Added JWT validation middleware',
  subtitle: 'edit src/auth.ts',
  narrative: 'Modified auth.ts at src/auth.ts — updating 45 lines',
  facts: 'src/auth.ts',
  concepts: ['security', 'api', 'middleware'],
  filesModified: ['src/auth.ts']
});
// Returns observation ID, or -1 if deduplicated
```

**Parameters:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | string | Yes | Observation type (max 100 chars) |
| `title` | string | Yes | Short title (max 500 chars) |
| `content` | string | Yes | Main content (max 100KB) |
| `subtitle` | string | No | Brief descriptor (e.g., file path) |
| `narrative` | string | No | Human-readable description |
| `facts` | string | No | Raw technical data (file path, command, URL) |
| `concepts` | string[] | No | Concept tags for search |
| `filesRead` | string[] | No | Files read during this observation |
| `filesModified` | string[] | No | Files written/modified during this observation |

**Standard observation types:**

- `file-read` — file or directory read
- `file-write` — file created or modified
- `command` — shell command executed
- `research` — web search or URL fetch
- `delegation` — sub-agent task

### `storeKnowledge(data)`

Store structured knowledge (architectural decisions, constraints, heuristics).

```typescript
const id = await sdk.storeKnowledge({
  knowledgeType: 'decision',
  title: 'Use SQLite WAL mode',
  content: 'SQLite WAL mode allows concurrent reads while writing, which is critical for hook + worker concurrency.',
  concepts: ['database', 'performance'],
  metadata: {
    alternatives: ['PostgreSQL', 'file-based storage'],
    reason: 'Local-first, zero-dependency setup, sufficient for single-user use'
  }
});
```

**Knowledge types:**

| Type | Use case | Metadata fields |
|------|----------|-----------------|
| `constraint` | Hard or soft constraints | `severity` ('hard'/'soft'), `reason` |
| `decision` | Architectural decisions | `alternatives`, `reason` |
| `heuristic` | Rules of thumb | `context`, `confidence` ('high'/'medium'/'low') |
| `rejected` | Approaches that were tried and rejected | `reason`, `alternatives` |

Knowledge items are prioritized in context injection — they always appear at the top.

### `storeSummary(data)`

Store a session summary.

```typescript
const id = await sdk.storeSummary({
  request: 'my-project — authentication implementation',
  investigated: 'Read auth.ts, Read JWT docs',
  completed: 'Modified auth.ts, Modified routes.ts, npm test passed',
  learned: 'JWT tokens should be validated before every protected route',
  nextSteps: 'Add rate limiting to /api/auth/login',
  notes: 'Consider using refresh token rotation in the future'
});
```

### `storePrompt(sessionId, promptNumber, text)`

Store a user prompt.

```typescript
await sdk.storePrompt('session-abc123', 1, 'How do I add rate limiting?');
```

## Retrieving Data

### `getContext()`

Get the raw context for the current project.

```typescript
const ctx = await sdk.getContext();
// {
//   project: 'my-project',
//   relevantObservations: Observation[],
//   relevantSummaries: Summary[],
//   recentPrompts: UserPrompt[]
// }
```

### `getSmartContext(options?)`

Get ranked context within a token budget. This is what the `agentSpawn` hook uses.

```typescript
const ctx = await sdk.getSmartContext({
  tokenBudget: 3000,
  query: 'authentication'  // optional: score by relevance
});
// {
//   project: 'my-project',
//   items: ScoredItem[],      // ranked by composite score
//   summaries: Summary[],
//   tokenBudget: 3000,
//   tokensUsed: 1847
// }
```

### `getRecentObservations(limit?)`

Get the most recent observations for the current project.

```typescript
const obs = await sdk.getRecentObservations(20);
```

### `getRecentSummaries(limit?)`

Get the most recent session summaries.

```typescript
const summaries = await sdk.getRecentSummaries(5);
```

### `getObservationsByIds(ids)`

Batch-retrieve observations by ID.

```typescript
const obs = await sdk.getObservationsByIds([139, 140, 141, 142]);
```

### `getTimeline(anchorId, depthBefore?, depthAfter?)`

Get chronological context around an observation.

```typescript
const timeline = await sdk.getTimeline(142, 5, 5);
// TimelineEntry[] sorted by created_at_epoch
```

## Searching

### `search(query)`

Simple search using SQLite FTS5.

```typescript
const results = await sdk.search('JWT authentication');
// { observations: Observation[], summaries: Summary[] }
```

### `searchAdvanced(query, filters?)`

FTS5 search with filters.

```typescript
const results = await sdk.searchAdvanced('authentication', {
  type: 'file-write',
  project: 'my-api',
  limit: 10
});
```

### `hybridSearch(query, options?)`

Combined vector + keyword search (requires embedding service).

```typescript
const results = await sdk.hybridSearch('JWT token validation', { limit: 10 });
// SearchResult[] with composite score
```

### `semanticSearch(query, options?)`

Vector-only semantic search.

```typescript
const results = await sdk.semanticSearch('session expiration', {
  limit: 10,
  threshold: 0.3   // minimum cosine similarity
});
```

## Sessions and Checkpoints

### `getOrCreateSession(contentSessionId)`

Get or create a session by its editor-provided ID.

```typescript
const session = await sdk.getOrCreateSession('kiro-2025-03-15-my-project');
```

### `completeSession(sessionId)`

Mark a session as completed.

```typescript
await sdk.completeSession(session.id);
```

### `createCheckpoint(sessionId, data)`

Create a structured checkpoint for session resume.

```typescript
const checkpointId = await sdk.createCheckpoint(session.id, {
  task: 'Implement authentication middleware',
  progress: 'JWT validation added, routes updated',
  nextSteps: 'Add rate limiting to login endpoint',
  openQuestions: 'Should we use refresh token rotation?',
  relevantFiles: ['src/auth.ts', 'src/routes.ts']
});
```

### `getCheckpoint(sessionId)`

Get the latest checkpoint for a session.

```typescript
const checkpoint = await sdk.getCheckpoint(session.id);
```

### `getLatestProjectCheckpoint()`

Get the most recent checkpoint for the current project.

```typescript
const checkpoint = await sdk.getLatestProjectCheckpoint();
if (checkpoint) {
  console.log('Resume from:', checkpoint.task);
  console.log('Progress:', checkpoint.progress);
}
```

## Reports and Maintenance

### `generateReport(options?)`

Generate an activity report for the current project.

```typescript
const report = await sdk.generateReport({
  period: 'weekly'   // 'weekly' (7 days) or 'monthly' (30 days)
});
// or with custom date range:
const report = await sdk.generateReport({
  startDate: new Date('2025-03-01'),
  endDate: new Date('2025-03-15')
});
```

### `getDecayStats()`

Get observation health statistics for the current project.

```typescript
const stats = await sdk.getDecayStats();
// { total: 342, stale: 12, neverAccessed: 87, recentlyAccessed: 201 }
```

### `detectStaleObservations()`

Detect and mark observations for files that have changed since the observation was recorded.

```typescript
const markedCount = await sdk.detectStaleObservations();
```

### `consolidateObservations(options?)`

Merge duplicate observations (same project, type, and files).

```typescript
const result = await sdk.consolidateObservations({ dryRun: false });
// { merged: 5, removed: 3 }
```

### `backfillEmbeddings(batchSize?)`

Generate embeddings for observations that don't have them yet.

```typescript
const count = await sdk.backfillEmbeddings(50);
console.log(`Generated ${count} embeddings`);
```

### `getEmbeddingStats()`

Get embedding coverage statistics.

```typescript
const stats = sdk.getEmbeddingStats();
// { total: 342, embedded: 298, percentage: 87.1 }
```

### `initializeEmbeddings()`

Explicitly initialize the embedding service.

```typescript
const available = await sdk.initializeEmbeddings();
if (!available) {
  console.log('Embedding service not available — FTS5 only');
}
```

## Complete Example

```typescript
import { createKiroMemory } from 'kiro-memory/sdk';

const sdk = createKiroMemory({ project: 'my-project' });

try {
  // Store an architectural decision
  await sdk.storeKnowledge({
    knowledgeType: 'decision',
    title: 'Use Express over Fastify',
    content: 'Express has better ecosystem support and simpler middleware model for this use case.',
    metadata: {
      alternatives: ['Fastify', 'Hono', 'Koa'],
      reason: 'Team familiarity and extensive middleware library'
    }
  });

  // Search for related context
  const results = await sdk.search('Express middleware');
  console.log(`Found ${results.observations.length} related observations`);

  // Get smart context for injection
  const ctx = await sdk.getSmartContext({ tokenBudget: 2000 });
  console.log(`Context: ${ctx.tokensUsed}/${ctx.tokenBudget} tokens`);
} finally {
  sdk.close();
}
```
