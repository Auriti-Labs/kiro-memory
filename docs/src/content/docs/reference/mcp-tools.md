---
title: MCP Tools Reference
description: Detailed reference for the 4 MCP tools exposed by the Kiro Memory MCP server.
---

The Kiro Memory MCP server exposes 4 tools via the Model Context Protocol stdio transport. These tools are available to any MCP-compatible AI editor.

## Tool Overview

| Tool | Purpose |
|------|---------|
| `search` | Full-text and semantic search over observations and summaries |
| `timeline` | Chronological context around a specific observation |
| `get_observations` | Retrieve full details of observations by ID |
| `get_context` | Curated context package for a project within a token budget |

---

## `search`

Search observations and summaries using text queries. Supports both FTS5 keyword search and semantic search if embeddings are available.

### Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `query` | string | Yes | Search query. Supports FTS5 operators (`AND`, `OR`, `NOT`, `"phrase"`, `prefix*`) and natural language for semantic search |
| `project` | string | No | Filter results to a specific project. If omitted, searches across all projects |
| `limit` | number | No | Maximum number of results per category (default: 10, max: 50) |

### Return Value

```typescript
{
  observations: Array<{
    id: number;
    type: string;
    title: string;
    subtitle: string | null;
    text: string | null;
    narrative: string | null;
    facts: string | null;
    concepts: string | null;
    files_read: string | null;
    files_modified: string | null;
    project: string;
    created_at: string;
    created_at_epoch: number;
    is_stale: number;
    discovery_tokens: number;
  }>;
  summaries: Array<{
    id: number;
    session_id: string;
    project: string;
    request: string | null;
    investigated: string | null;
    learned: string | null;
    completed: string | null;
    next_steps: string | null;
    notes: string | null;
    created_at: string;
    created_at_epoch: number;
  }>;
}
```

### Example Call

```json
{
  "name": "search",
  "arguments": {
    "query": "JWT authentication middleware",
    "project": "my-api",
    "limit": 5
  }
}
```

### Example Response

```json
{
  "observations": [
    {
      "id": 142,
      "type": "file-write",
      "title": "Modified auth.ts",
      "subtitle": "edit src/auth.ts",
      "narrative": "Modified auth.ts at src/auth.ts — updating 45 lines",
      "concepts": "security, api, middleware",
      "files_modified": "src/auth.ts",
      "project": "my-api",
      "created_at": "2025-03-15T14:30:00.000Z",
      "created_at_epoch": 1742043000000,
      "is_stale": 0,
      "discovery_tokens": 28
    }
  ],
  "summaries": [
    {
      "id": 23,
      "session_id": "session-abc",
      "project": "my-api",
      "request": "my-api — authentication implementation — 2025-03-15",
      "completed": "Modified auth.ts, Modified routes.ts",
      "created_at": "2025-03-15T18:00:00.000Z",
      "created_at_epoch": 1742058000000
    }
  ]
}
```

### FTS5 Query Examples

```
# Simple keywords
authentication

# Exact phrase
"JWT token validation"

# Boolean AND (both terms required)
authentication AND middleware

# Boolean OR (either term)
authentication OR authorization

# Exclude term
authentication NOT OAuth

# Prefix match (starts with)
authen*

# Column-specific search
title:auth*
concepts:security
```

---

## `timeline`

Retrieve chronological context around a specific observation. Useful for understanding what happened before and after a particular event.

### Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `anchor_id` | number | Yes | ID of the anchor observation. All other observations are returned relative to this one by their `created_at_epoch` position |
| `depth_before` | number | No | Number of observations to return before the anchor (default: 5, max: 50) |
| `depth_after` | number | No | Number of observations to return after the anchor (default: 5, max: 50) |

### Return Value

```typescript
{
  timeline: Array<{
    id: number;
    type: string;
    title: string;
    subtitle: string | null;
    narrative: string | null;
    project: string;
    created_at: string;
    created_at_epoch: number;
    position: number;  // negative = before anchor, 0 = anchor, positive = after
  }>;
}
```

### Example Call

```json
{
  "name": "timeline",
  "arguments": {
    "anchor_id": 142,
    "depth_before": 3,
    "depth_after": 3
  }
}
```

### Example Response

```json
{
  "timeline": [
    {
      "id": 139,
      "type": "file-read",
      "title": "auth.ts",
      "narrative": "Read auth.ts to understand its structure",
      "project": "my-api",
      "created_at": "2025-03-15T14:20:00.000Z",
      "position": -3
    },
    {
      "id": 140,
      "type": "command",
      "title": "npm test",
      "narrative": "Ran npm test — 47 tests passed (success)",
      "project": "my-api",
      "created_at": "2025-03-15T14:25:00.000Z",
      "position": -2
    },
    {
      "id": 142,
      "type": "file-write",
      "title": "Modified auth.ts",
      "narrative": "Modified auth.ts — updating 45 lines",
      "project": "my-api",
      "created_at": "2025-03-15T14:30:00.000Z",
      "position": 0
    },
    {
      "id": 143,
      "type": "file-write",
      "title": "Modified routes.ts",
      "narrative": "Modified routes.ts — replacing 12 lines with 18 lines",
      "project": "my-api",
      "created_at": "2025-03-15T14:35:00.000Z",
      "position": 1
    }
  ]
}
```

### Use Cases

- Understanding the sequence of events that led to a file change
- Finding related observations for a specific task
- Reconstructing what was done during a session without a summary

---

## `get_observations`

Retrieve full details for one or more observations by their IDs.

### Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `ids` | number[] | Yes | Array of observation IDs to retrieve (max 50 per request) |

### Return Value

```typescript
{
  observations: Array<Observation>;  // Full observation records
}
```

### Example Call

```json
{
  "name": "get_observations",
  "arguments": {
    "ids": [139, 140, 142, 143]
  }
}
```

### Use Cases

- Retrieving full content of observations found via `search`
- Batch-loading observations discovered through `timeline`
- Getting the `facts` field which may contain important raw data (e.g., full file path, shell command, URL)

---

## `get_context`

Get a curated context package for a project. This is the primary tool for injecting historical context into a new session. It uses the same scoring and ranking logic as the `agentSpawn` hook.

### Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `project` | string | Yes | Project name (usually the git repository basename, e.g., `my-api`) |
| `token_budget` | number | No | Maximum token budget for returned items (default: 2000). Each item's token cost is estimated as `ceil(content.length / 4)` |
| `query` | string | No | Optional query to score context by relevance. When provided, uses hybrid search weights. When omitted, uses recency + project match scoring |

### Return Value

```typescript
{
  project: string;
  items: Array<{
    id: number;
    title: string;
    content: string;
    type: string;
    project: string;
    created_at: string;
    created_at_epoch: number;
    score: number;           // composite score 0-1
    signals: {
      semantic: number;      // cosine similarity (0 if no embeddings)
      fts5: number;          // BM25 relevance score (0 if no query)
      recency: number;       // exponential decay from now
      projectMatch: number;  // 1.0 for same project, 0.5 for others
    };
  }>;
  summaries: Array<Summary>;
  tokenBudget: number;
  tokensUsed: number;
}
```

### Example Call

```json
{
  "name": "get_context",
  "arguments": {
    "project": "my-api",
    "token_budget": 4000,
    "query": "authentication rate limiting"
  }
}
```

### Example Response

```json
{
  "project": "my-api",
  "items": [
    {
      "id": 156,
      "title": "Use JWT for API authentication",
      "content": "JWT provides stateless authentication suitable for our REST API. Decision made after comparing session-based vs token-based auth.",
      "type": "decision",
      "project": "my-api",
      "score": 0.94,
      "signals": {
        "semantic": 0.89,
        "fts5": 0.95,
        "recency": 0.87,
        "projectMatch": 1.0
      }
    },
    {
      "id": 142,
      "title": "Modified auth.ts",
      "content": "Added JWT verification middleware",
      "type": "file-write",
      "project": "my-api",
      "score": 0.78,
      "signals": { ... }
    }
  ],
  "summaries": [
    {
      "id": 23,
      "request": "my-api — authentication implementation",
      "completed": "Modified auth.ts, Modified routes.ts",
      ...
    }
  ],
  "tokenBudget": 4000,
  "tokensUsed": 1923
}
```

### Context Scoring Details

Items are ranked using a composite score with two sets of weights:

**With query** (search mode):
- semantic: 45%, fts5: 35%, recency: 10%, projectMatch: 10%

**Without query** (context mode):
- recency: 70%, projectMatch: 30%

Knowledge types (`decision`, `constraint`, `heuristic`, `rejected`) receive a 3.0x multiplier, ensuring architectural decisions and constraints always appear first in the context.

Items are included until the token budget is exhausted. Knowledge items always appear at the top, so they are always within budget.
