---
title: REST API Reference
description: Complete reference for the 35 REST API endpoints exposed by the Kiro Memory worker on port 3001.
---

The worker exposes a REST API on `http://localhost:3001`. All endpoints return JSON unless otherwise noted.

Interactive documentation is also available at `http://localhost:3001/api/docs` (OpenAPI/Swagger UI).

## Authentication

Most endpoints are **unauthenticated** (localhost-only access). The following endpoints require the `X-Worker-Token` header:

- `POST /api/notify`
- `POST /api/embeddings/backfill`
- `POST /api/retention/cleanup`

The token is generated on each worker start and stored at `~/.contextkit/worker.token`:

```bash
TOKEN=$(cat ~/.contextkit/worker.token)
curl -H "X-Worker-Token: $TOKEN" http://localhost:3001/api/embeddings/backfill
```

---

## Core

### GET /health

Worker health check.

**Response:**
```json
{
  "status": "ok",
  "timestamp": 1742043000000,
  "version": "2.1.0"
}
```

### GET /events

Server-Sent Events stream for real-time dashboard updates.

**Response:** `text/event-stream`

Events: `connected`, `observation-created`, `summary-created`, `prompt-created`, `session-created`

### POST /api/notify

Broadcast an event to all SSE-connected dashboard clients. Requires `X-Worker-Token`.

**Body:**
```json
{
  "event": "observation-created",
  "data": { "project": "my-project", "title": "Modified auth.ts" }
}
```

Allowed events: `observation-created`, `summary-created`, `prompt-created`, `session-created`

---

## Observations

### GET /api/observations

Paginated list of observations.

**Query parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `project` | string | — | Filter by project |
| `offset` | integer | `0` | Pagination offset |
| `limit` | integer | `50` | Page size (max 200) |

**Response headers:** `X-Total-Count: <total>`

**Response:** `Observation[]`

### POST /api/observations

Create a new observation.

**Body:**
```json
{
  "memorySessionId": "session-abc",
  "project": "my-project",
  "type": "file-write",
  "title": "Modified auth.ts",
  "content": "Added JWT middleware",
  "concepts": ["security", "api"],
  "files": ["src/auth.ts"]
}
```

**Response:**
```json
{ "id": 142, "success": true }
```

### POST /api/observations/batch

Batch-retrieve observations by ID array.

**Body:**
```json
{ "ids": [139, 140, 141, 142] }
```

Max 100 IDs per request.

**Response:**
```json
{ "observations": [Observation, ...] }
```

### GET /api/context/:project

Get context for a specific project (most recent observations + summaries).

**Path parameter:** `project` — project name

**Response:**
```json
{
  "project": "my-project",
  "observations": [Observation, ...],
  "summaries": [Summary, ...]
}
```

---

## Knowledge

### POST /api/knowledge

Store structured knowledge.

**Body:**
```json
{
  "project": "my-project",
  "knowledge_type": "decision",
  "title": "Use SQLite WAL mode",
  "content": "SQLite WAL enables concurrent reads...",
  "concepts": ["database", "performance"],
  "reason": "Local-first, zero-dependency setup",
  "alternatives": ["PostgreSQL", "Redis"]
}
```

**knowledge_type values:** `constraint`, `decision`, `heuristic`, `rejected`

**Type-specific body fields:**

| Type | Fields |
|------|--------|
| `constraint` | `severity` ('hard'/'soft'), `reason` |
| `decision` | `alternatives` (string), `reason` |
| `heuristic` | `context` (string), `confidence` ('high'/'medium'/'low') |
| `rejected` | `reason` (required), `alternatives` |

**Response:**
```json
{ "id": 143, "success": true, "knowledge_type": "decision" }
```

---

## Memory Save

### POST /api/memory/save

Simplified endpoint for storing arbitrary memory entries.

**Body:**
```json
{
  "project": "my-project",
  "title": "Important discovery",
  "content": "The API rate limit is 100 req/min per IP",
  "type": "research",
  "concepts": ["api", "networking"]
}
```

**Response:**
```json
{ "id": 144, "success": true }
```

---

## Summaries

### GET /api/summaries

Paginated list of session summaries.

**Query parameters:** `project`, `offset`, `limit` (max 200)

**Response headers:** `X-Total-Count: <total>`

**Response:** `Summary[]`

### POST /api/summaries

Create a session summary.

**Body:**
```json
{
  "sessionId": "session-abc",
  "project": "my-project",
  "request": "Implement authentication",
  "learned": "JWT requires HTTPS in production",
  "completed": "Modified auth.ts, Modified routes.ts",
  "nextSteps": "Add rate limiting"
}
```

All text fields max 50KB each.

---

## Search

### GET /api/search

FTS5 full-text search.

**Query parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `q` | string | Yes | Search query |
| `project` | string | No | Filter by project |
| `type` | string | No | Filter by observation type |
| `limit` | integer | No | Max results (default: 20, max: 100) |

**Response:**
```json
{
  "observations": [Observation, ...],
  "summaries": [Summary, ...]
}
```

### GET /api/hybrid-search

Hybrid search combining FTS5 + vector embeddings.

**Query parameters:** `q` (required), `project`, `limit` (default: 10, max: 100)

**Response:**
```json
{
  "results": [SearchResult, ...],
  "count": 5
}
```

`SearchResult` includes `score` and `signals` (semantic, fts5, recency, projectMatch).

### GET /api/timeline

Get chronological context around an observation.

**Query parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `anchor` | integer | Yes | Anchor observation ID |
| `depth_before` | integer | No | Observations before (default: 5, max: 50) |
| `depth_after` | integer | No | Observations after (default: 5, max: 50) |

**Response:**
```json
{
  "timeline": [TimelineEntry, ...]
}
```

---

## Analytics

### GET /api/analytics/overview

Summary statistics for the entire database or a specific project.

**Query parameters:** `project` (optional)

**Response:**
```json
{
  "totalObservations": 342,
  "totalSessions": 28,
  "totalSummaries": 27,
  "observationsByType": {
    "file-write": 145,
    "file-read": 98,
    "command": 67,
    "research": 32
  }
}
```

### GET /api/analytics/timeline

Daily observation counts over time.

**Query parameters:** `project` (optional), `days` (default: 30, max: 365)

**Response:** `Array<{ date: string, count: number }>`

### GET /api/analytics/types

Observation count by type.

**Query parameters:** `project` (optional)

**Response:** `Array<{ type: string, count: number }>`

### GET /api/analytics/sessions

Session statistics.

**Query parameters:** `project` (optional)

### GET /api/analytics/anomalies

Anomaly detection using z-score analysis on session observation counts.

**Query parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `project` | string | Required | Project name |
| `window` | integer | `20` | Rolling window size (min 3, max 200) |
| `threshold` | float | `2.0` | Z-score threshold for anomaly detection |

**Response:**
```json
{
  "anomalies": [{ "sessionId": 5, "zScore": 3.2, "count": 45 }],
  "baseline": { "mean": 12.4, "stddev": 8.7 },
  "project": "my-project"
}
```

---

## Sessions

### GET /api/sessions

Session list.

**Query parameters:** `project` (optional)

Returns up to 50 sessions.

### GET /api/sessions/:id/checkpoint

Get the latest checkpoint for a session by session ID.

**Path parameter:** `id` — session ID

**Response:** `Checkpoint` or `404`

### GET /api/checkpoint

Get the latest checkpoint for a project.

**Query parameters:** `project` (required)

**Response:** `Checkpoint` or `404`

### GET /api/prompts

Paginated list of recorded user prompts.

**Query parameters:** `project`, `offset`, `limit` (max 200)

**Response headers:** `X-Total-Count: <total>`

---

## Projects

### GET /api/projects

List all distinct project names across observations, summaries, and prompts. Cached for 60 seconds.

**Response:** `string[]`

### GET /api/project-aliases

Get all project display name aliases.

**Response:** `{ [projectName: string]: displayName: string }`

### PUT /api/project-aliases/:project

Create or update a project display name alias.

**Path parameter:** `project` — project name

**Body:**
```json
{ "displayName": "My API Service" }
```

### GET /api/stats/:project

Project statistics summary.

**Path parameter:** `project` — project name

**Response:**
```json
{
  "project": "my-api",
  "observationCount": 145,
  "sessionCount": 12,
  "summaryCount": 11,
  "mostActiveType": "file-write",
  "lastActivity": "2025-03-15T18:00:00.000Z"
}
```

---

## Embeddings

### GET /api/embeddings/stats

Embedding coverage statistics.

**Response:**
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

### POST /api/embeddings/backfill

Generate embeddings for observations that don't have them. Requires `X-Worker-Token`.

**Body:**
```json
{ "batchSize": 50 }
```

`batchSize` range: 1–500 (default: 50)

**Response:**
```json
{ "success": true, "generated": 44 }
```

---

## Retention

### POST /api/retention/cleanup

Delete old observations. Requires `X-Worker-Token`.

**Body:**
```json
{
  "maxAgeDays": 90,
  "dryRun": false
}
```

`maxAgeDays` range: 7–730 (default: 90)

**Response (dryRun: true):**
```json
{
  "dryRun": true,
  "maxAgeDays": 90,
  "wouldDelete": { "observations": 12, "summaries": 2, "prompts": 45 }
}
```

**Response (dryRun: false):**
```json
{
  "success": true,
  "maxAgeDays": 90,
  "deleted": { "observations": 12, "summaries": 2, "prompts": 45 }
}
```

---

## Export

### GET /api/export

Export observations and summaries.

**Query parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `project` | string | all | Filter by project |
| `format` | string | `json` | Output format: `json`, `markdown`, `md` |
| `type` | string | all | Filter by observation type |
| `days` | integer | `30` | Days back to export (max 365) |

Max 1000 observations per export.

**Response (JSON):**
```json
{
  "meta": {
    "project": "my-project",
    "daysBack": 30,
    "exportedAt": "2025-03-15T18:00:00.000Z"
  },
  "observations": [...],
  "summaries": [...]
}
```

---

## Report

### GET /api/report

Generate a structured activity report.

**Query parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `project` | string | all | Filter by project |
| `period` | string | `weekly` | `weekly` (7 days) or `monthly` (30 days) |
| `format` | string | `json` | `json`, `markdown`, `md`, or `text` |

**Response (JSON):**
```json
{
  "project": "my-project",
  "period": "weekly",
  "startDate": "2025-03-08T00:00:00.000Z",
  "endDate": "2025-03-15T18:00:00.000Z",
  "summary": {
    "totalObservations": 87,
    "filesModified": ["src/auth.ts", "src/routes.ts"],
    "topConcepts": ["security", "api", "database"]
  }
}
```

---

## OpenAPI Documentation

The full OpenAPI 3.0 specification is available at:

```
http://localhost:3001/api/docs
```

The interactive Swagger UI is available at:

```
http://localhost:3001/api/docs/ui
```
