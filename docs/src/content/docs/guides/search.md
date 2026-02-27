---
title: Search
description: How Kiro Memory search works — FTS5 keyword search, vector embeddings, hybrid search, and scoring.
---

Kiro Memory provides three search modes: FTS5 keyword search, vector semantic search, and hybrid search that combines both.

## Search Architecture

```
Query
  │
  ├─► FTS5 (SQLite full-text search)
  │     BM25 ranking over title, text, narrative, concepts
  │
  ├─► Vector Search (optional)
  │     Cosine similarity over 384-dimension embeddings
  │
  └─► Hybrid Score
        w₁·semantic + w₂·fts5 + w₃·recency + w₄·projectMatch
```

## FTS5 Full-Text Search

FTS5 is the default search backend — it works without any additional dependencies. It provides BM25-ranked full-text search over the following columns:

- `title` — observation title
- `text` — technical content (tool input/output)
- `narrative` — human-readable description
- `concepts` — concept tags

The FTS5 index (`observations_fts`) is kept in sync via INSERT/UPDATE/DELETE triggers.

### FTS5 Query Syntax

```
# Simple keyword search
authentication

# Phrase search
"JWT token validation"

# Boolean operators
authentication AND middleware
authentication OR authorization

# Column-specific search
title:auth*

# Prefix search
authen*
```

### API Example

```bash
curl "http://localhost:3001/api/search?q=authentication&project=my-api&limit=10"
```

```typescript
const results = await sdk.searchAdvanced('authentication middleware', {
  project: 'my-api',
  type: 'file-write',
  limit: 10
});
```

## Vector Search (Semantic)

Vector search uses local embedding models to find semantically similar observations — even when exact keywords don't match.

For example, searching for "user login flow" would match observations about "authentication", "session management", and "JWT" without containing those exact words.

### Prerequisites

Install an optional embedding backend:

```bash
# Option 1: fastembed (recommended)
npm install fastembed

# Option 2: HuggingFace Transformers
npm install @huggingface/transformers
```

After installation, the embedding service initializes automatically when the worker starts.

### How Embeddings Are Generated

When an observation is stored, the SDK generates an embedding asynchronously (fire-and-forget, non-blocking):

```
storeObservation()
  │
  ├─► INSERT into observations (synchronous)
  │
  └─► generateEmbedding() (background)
          │
          ├─► Compose: title + content + concepts (max 2000 chars)
          ├─► Call embedding model
          └─► Store in observation_embeddings (BLOB, 384 floats)
```

Embeddings are stored as raw float32 binary blobs in the `observation_embeddings` table.

### Backfilling Existing Observations

If you enable embeddings after already collecting data, backfill:

```bash
# Via CLI (planned)
kiro-memory backfill-embeddings

# Via API
curl -X POST http://localhost:3001/api/embeddings/backfill \
  -H "X-Worker-Token: $(cat ~/.contextkit/worker.token)" \
  -H "Content-Type: application/json" \
  -d '{"batchSize": 100}'

# Via SDK
const count = await sdk.backfillEmbeddings(100);
```

### Embedding Statistics

```bash
curl http://localhost:3001/api/embeddings/stats
```

```json
{
  "total": 342,
  "embedded": 298,
  "percentage": 87.1,
  "provider": "fastembed",
  "dimensions": 384,
  "available": true
}
```

## Hybrid Search

Hybrid search combines FTS5 and vector results with a composite scoring function.

### Scoring Formula

```
score = w₁·semantic + w₂·fts5 + w₃·recency + w₄·projectMatch
```

**Search mode weights** (when a query is provided):

| Signal | Weight | Description |
|--------|--------|-------------|
| `semantic` | 0.45 | Cosine similarity to query embedding |
| `fts5` | 0.35 | BM25 relevance score |
| `recency` | 0.10 | Exponential decay from now |
| `projectMatch` | 0.10 | 1.0 for same project, 0.5 for others |

**Context mode weights** (used by `agentSpawn` without a query):

| Signal | Weight | Description |
|--------|--------|-------------|
| `semantic` | 0 | Not used (no query vector) |
| `fts5` | 0 | Not used |
| `recency` | 0.70 | Strongly prefer recent observations |
| `projectMatch` | 0.30 | Prefer current project |

### Knowledge Type Boost

Knowledge items (`constraint`, `decision`, `heuristic`, `rejected`) receive a 3.0x score multiplier, ensuring they always appear at the top of context injection results regardless of recency.

### API Example

```bash
curl "http://localhost:3001/api/hybrid-search?q=authentication&project=my-api&limit=10"
```

```json
{
  "results": [
    {
      "id": "142",
      "title": "Modified auth.ts",
      "content": "Added JWT validation middleware",
      "type": "file-write",
      "project": "my-api",
      "score": 0.87,
      "source": "hybrid",
      "signals": {
        "semantic": 0.82,
        "fts5": 0.91,
        "recency": 0.75,
        "projectMatch": 1.0
      }
    }
  ],
  "count": 1
}
```

### SDK Example

```typescript
// Hybrid search (vector + FTS5)
const results = await sdk.hybridSearch('JWT token expiry', { limit: 10 });

// Semantic only
const semantic = await sdk.semanticSearch('session management', {
  limit: 10,
  threshold: 0.3  // minimum similarity
});
```

## Recency Decay

Recency is calculated as an exponential decay:

```
recency = exp(-age_hours / halfLife_hours)
```

Where `halfLife_hours` ≈ 168 hours (7 days). An observation from today scores ~1.0; one from 7 days ago scores ~0.5; one from 30 days ago scores ~0.01.

This means recent context is strongly preferred, but older relevant information is not completely excluded.

## Stale Observation Detection

An observation is marked "stale" when the file it references has been modified after the observation was recorded. The `detectStaleObservations()` method checks `files_read` and `files_modified` columns against the current filesystem state:

```typescript
const count = await sdk.detectStaleObservations();
console.log(`Marked ${count} observations as stale`);
```

Stale observations are still returned in search results but may be visually distinguished in the dashboard.

## Content-Based Deduplication

Before storing an observation, the SDK computes a SHA256 hash of:

```
SHA256(project | type | title | narrative)
```

If an identical hash was stored within the deduplication window for that type, the new observation is discarded and `-1` is returned. This prevents flooding the database with repeated file reads or rapid consecutive writes on the same file.

Deduplication windows:
- `file-read`: 60 seconds
- `file-write`: 10 seconds
- `command`: 30 seconds
- `research`: 120 seconds
- Other: 30 seconds
