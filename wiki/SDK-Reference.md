# SDK Reference

The Total Recall TypeScript SDK provides full programmatic access to the AI coding assistant memory system. It connects directly to the local SQLite database — no worker required.

## Installation

```bash
npm install totalrecallai
```

## Quick Start

```typescript
import { createTotalRecall } from 'totalrecallai';

const ctx = createTotalRecall({ project: 'my-project' });
const context = await ctx.getContext();
ctx.close();
```

## Configuration

The `createTotalRecall` function accepts a configuration object:

```typescript
interface TotalRecallConfig {
  dataDir?: string;      // Default: ~/.totalrecall
  project?: string;      // Default: auto-detected from git root
  skipMigrations?: boolean; // Skip migration check for performance (use in hooks)
}
```

## Core Methods

### getContext()

The `getContext` method retrieves recent observations, summaries, and prompts for the current project.

```typescript
const context = await ctx.getContext();
// Returns: { project, relevantObservations, relevantSummaries, recentPrompts }
```

### storeObservation(data)

The `storeObservation` method stores a new observation with automatic deduplication (SHA256 content hash) and background embedding generation.

```typescript
const id = await ctx.storeObservation({
  type: 'note',           // Required: file-write, command, research, note, etc.
  title: 'Auth fix',      // Required: max 500 chars
  content: 'Fixed OAuth flow with 5-min token buffer',  // Required: max 100KB
  subtitle: 'OAuth2',     // Optional
  narrative: 'Detailed narrative...',  // Optional
  facts: 'key facts...',  // Optional
  concepts: ['auth', 'oauth'],  // Optional: tags
  filesRead: ['src/auth.ts'],   // Optional
  filesModified: ['src/auth.ts']  // Optional
});
```

Returns the observation ID, or `-1` if deduplicated.

### storeKnowledge(data)

The `storeKnowledge` method stores structured knowledge with type-specific metadata.

```typescript
await ctx.storeKnowledge({
  knowledgeType: 'decision',  // constraint | decision | heuristic | rejected
  title: 'Chose PostgreSQL over MongoDB',
  content: 'ACID compliance required for financial transactions',
  metadata: {
    reason: 'Need strong consistency guarantees',
    alternatives: ['MongoDB', 'DynamoDB']
  }
});
```

### storeSummary(data)

The `storeSummary` method stores a structured session summary.

```typescript
const id = await ctx.storeSummary({
  content: 'Implemented OAuth2 login with Google provider',
  investigated: 'OAuth2 flow, JWT best practices',
  completed: 'Google OAuth provider',
  learned: 'Use 5-min buffer for token refresh',
  nextSteps: 'Add GitHub OAuth provider'
});
```

## Search Methods

### search(query)

The `search` method performs full-text search (FTS5 with BM25 scoring).

```typescript
const results = await ctx.search('authentication');
// Returns: { observations: Observation[], summaries: Summary[] }
```

### searchAdvanced(query, filters)

The `searchAdvanced` method performs FTS5 search with project and type filters.

```typescript
const results = await ctx.searchAdvanced('auth', {
  project: 'my-app',
  type: 'file-write',
  limit: 10
});
```

### hybridSearch(query, options)

The `hybridSearch` method combines vector embeddings and FTS5 keyword search with 4-signal smart ranking.

```typescript
const results = await ctx.hybridSearch('authentication flow', { limit: 10 });
// Returns: SearchResult[] with score, source, id, type, title, content
```

### semanticSearch(query, options)

The `semanticSearch` method performs pure vector similarity search using local embeddings.

```typescript
const results = await ctx.semanticSearch('OAuth token refresh', {
  limit: 5,
  threshold: 0.3  // Minimum cosine similarity
});
```

## Session Methods

### getOrCreateSession(contentSessionId)

The `getOrCreateSession` method gets an existing session or creates a new one.

```typescript
const session = await ctx.getOrCreateSession('session-abc-123');
```

### completeSession(sessionId)

The `completeSession` method marks a session as completed.

```typescript
await ctx.completeSession(session.id);
```

### createCheckpoint(sessionId, data)

The `createCheckpoint` method saves a session checkpoint for later resume. Automatically includes a context snapshot of the last 10 observations.

```typescript
await ctx.createCheckpoint(session.id, {
  task: 'Implement OAuth2 login',
  progress: 'Google provider done, GitHub pending',
  nextSteps: 'Add GitHub OAuth provider',
  openQuestions: 'Should we support SAML?',
  relevantFiles: ['src/auth/oauth.ts', 'src/middleware/auth.ts']
});
```

### getCheckpoint(sessionId) / getLatestProjectCheckpoint()

```typescript
const checkpoint = await ctx.getCheckpoint(session.id);
const latest = await ctx.getLatestProjectCheckpoint();
```

## Conversation Methods

### storePrompt(contentSessionId, promptNumber, text)

```typescript
await ctx.storePrompt('session-abc', 1, 'Fix the authentication bug');
```

### storeConversationMessage(data)

```typescript
await ctx.storeConversationMessage({
  contentSessionId: 'session-abc',
  role: 'user',
  content: 'Fix the authentication bug',
  messageIndex: 0
});
```

### getConversationMessages(contentSessionId)

```typescript
const messages = await ctx.getConversationMessages('session-abc');
```

### importConversationTranscript(contentSessionId, transcriptPath)

```typescript
const count = await ctx.importConversationTranscript('session-abc', '/path/to/transcript.jsonl');
```

## Context & Ranking Methods

### getSmartContext(options)

The `getSmartContext` method retrieves context ranked by the 4-signal scoring system (recency, frequency, semantic similarity, decay).

```typescript
const smartCtx = await ctx.getSmartContext({
  limit: 20,
  query: 'authentication',  // Optional: boosts semantically similar results
  includeKnowledge: true
});
```

### getRecentObservations(limit) / getRecentSummaries(limit)

```typescript
const obs = await ctx.getRecentObservations(10);
const sums = await ctx.getRecentSummaries(5);
```

### getObservationsByIds(ids)

```typescript
const obs = await ctx.getObservationsByIds([1, 2, 3]);
```

### getTimeline(anchorId, depthBefore, depthAfter)

The `getTimeline` method returns chronological context around a specific observation.

```typescript
const timeline = await ctx.getTimeline(42, 5, 5);
```

## Embedding Methods

### initializeEmbeddings()

```typescript
const available = await ctx.initializeEmbeddings();
```

### backfillEmbeddings(batchSize)

```typescript
const processed = await ctx.backfillEmbeddings(50);
```

### getEmbeddingStats()

```typescript
const stats = ctx.getEmbeddingStats();
// Returns: { total, embedded, percentage }
```

## Memory Maintenance Methods

### detectStaleObservations()

```typescript
const staleCount = await ctx.detectStaleObservations();
```

### consolidateObservations(options)

```typescript
const result = await ctx.consolidateObservations({ dryRun: true });
// Returns: { merged, removed }
```

### getDecayStats()

```typescript
const stats = await ctx.getDecayStats();
// Returns: { total, stale, neverAccessed, recentlyAccessed }
```

## Report Methods

### generateReport(options)

```typescript
const report = await ctx.generateReport({
  period: 'weekly',  // or 'monthly'
  startDate: new Date('2026-04-01'),
  endDate: new Date('2026-04-07')
});
```

## Pagination Methods

### listObservations(options) / listSummaries(options)

Both methods support keyset pagination for efficient traversal of large datasets.

```typescript
const page1 = await ctx.listObservations({ limit: 50 });
const page2 = await ctx.listObservations({ cursor: page1.next_cursor });
// Returns: { data, next_cursor, has_more }
```

## Utility Methods

### getProject()

```typescript
const project = ctx.getProject();
```

### close()

The `close` method closes the database connection. Always call when done.

```typescript
ctx.close();
```

## Full Method Table

| Method | Returns | Description |
|--------|---------|-------------|
| `getContext()` | `ContextContext` | Recent observations, summaries, and prompts |
| `storeObservation(data)` | `number` | Store observation (returns ID, -1 if deduped) |
| `storeKnowledge(data)` | `number` | Store structured knowledge |
| `storeSummary(data)` | `number` | Store session summary |
| `search(query)` | `{ observations, summaries }` | FTS5 full-text search |
| `searchAdvanced(query, filters)` | `{ observations, summaries }` | FTS5 with filters |
| `hybridSearch(query, opts)` | `SearchResult[]` | Vector + FTS5 hybrid search |
| `semanticSearch(query, opts)` | `SearchResult[]` | Pure vector similarity search |
| `getRecentObservations(limit)` | `Observation[]` | Recent observations |
| `getRecentSummaries(limit)` | `Summary[]` | Recent summaries |
| `getObservationsByIds(ids)` | `Observation[]` | Observations by ID |
| `getTimeline(anchor, before, after)` | `TimelineEntry[]` | Chronological context |
| `getOrCreateSession(id)` | `DBSession` | Get or create session |
| `completeSession(sessionId)` | `void` | Mark session completed |
| `storePrompt(sessionId, num, text)` | `number` | Store user prompt |
| `storeConversationMessage(data)` | `number` | Store conversation message |
| `getConversationMessages(sessionId)` | `ConversationMessage[]` | Get conversation messages |
| `importConversationTranscript(id, path)` | `number` | Import transcript |
| `createCheckpoint(sessionId, data)` | `number` | Save session checkpoint |
| `getCheckpoint(sessionId)` | `DBCheckpoint \| null` | Get session checkpoint |
| `getLatestProjectCheckpoint()` | `DBCheckpoint \| null` | Get latest project checkpoint |
| `generateReport(opts)` | `ReportData` | Generate activity report |
| `getSmartContext(opts)` | `SmartContext` | Context with 4-signal ranking |
| `initializeEmbeddings()` | `boolean` | Initialize embedding service |
| `backfillEmbeddings(batchSize)` | `number` | Generate missing embeddings |
| `getEmbeddingStats()` | `{ total, embedded, percentage }` | Embedding coverage stats |
| `detectStaleObservations()` | `number` | Detect and mark stale observations |
| `consolidateObservations(opts)` | `{ merged, removed }` | Consolidate duplicates |
| `getDecayStats()` | `DecayStats` | Memory decay statistics |
| `listObservations(opts)` | `KeysetPageResult<Observation>` | Paginated observations |
| `listSummaries(opts)` | `KeysetPageResult<Summary>` | Paginated summaries |
| `getProject()` | `string` | Current project name |
| `close()` | `void` | Close database connection |
