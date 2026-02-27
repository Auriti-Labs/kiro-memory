---
title: Architecture
description: System architecture overview — the 5 subsystems, data flow, and how they interact.
---

Kiro Memory is a local-first persistent memory system. All data stays on your machine in a single SQLite database. There are no external API calls required for the core functionality.

## System Overview

```
┌─────────────────────────────────────────────────────────┐
│                    AI Coding Assistant                   │
│              (Kiro, Claude Code, Cursor, etc.)           │
└──────────────────────┬──────────────────────────────────┘
                       │ hooks (stdin/stdout)
                       ▼
┌─────────────────────────────────────────────────────────┐
│                       Hooks Layer                        │
│  agentSpawn  userPromptSubmit  postToolUse  stop         │
└──────────────────────┬──────────────────────────────────┘
                       │ SDK calls (direct SQLite)
                       ▼
┌─────────────────────────────────────────────────────────┐
│                    SQLite Database                       │
│  ~/.contextkit/contextkit.db                            │
│  WAL mode • FTS5 • Embeddings • 11 migrations           │
└────────────────────┬────────────────────────────────────┘
                     │ HTTP API (port 3001)
                     ▼
┌──────────────────────────────────────────────────────────┐
│                    Worker Service                        │
│  Express + 8 modular routers + SSE events                │
└───────────┬────────────────────┬────────────────────────┘
            │ stdio transport    │ REST API
            ▼                   ▼
┌───────────────────┐  ┌────────────────────┐
│    MCP Server     │  │   Web Dashboard    │
│  4 tools (stdio)  │  │  React SPA :3001   │
└───────────────────┘  └────────────────────┘
```

## Subsystem 1: Hooks

**Location:** `src/hooks/`

The primary data ingestion layer. Four Node.js scripts invoked by the editor at specific lifecycle events.

### Lifecycle

```
Session Start
    └─► agentSpawn.ts
           ├─► Ensure worker is running
           ├─► Load smart context (SDK)
           └─► Write context to stdout

User Prompt
    └─► userPromptSubmit.ts
           ├─► Extract prompt text
           ├─► Redact secrets
           └─► Store prompt (SDK)

Tool Use (every tool)
    └─► postToolUse.ts
           ├─► Categorize tool
           ├─► Build observation
           ├─► Deduplicate (SHA256)
           └─► Store observation + async embedding

Session End
    └─► stop.ts
           ├─► Group observations by type
           ├─► Generate structured summary
           ├─► Create checkpoint
           └─► Complete session
```

### Hook-to-Worker Communication

Hooks notify the worker of new data via `POST /api/notify` with the `X-Worker-Token` header. The worker then broadcasts SSE events to connected dashboard clients. This is fire-and-forget — hooks work correctly even if the worker is not running.

## Subsystem 2: SQLite Layer

**Location:** `src/services/sqlite/`

The persistence layer. Uses `bun:sqlite` (shimmed to `better-sqlite3` in Node.js builds).

### Module Structure

| Module | Purpose |
|--------|---------|
| `Database.ts` | `KiroMemoryDatabase` class, migration runner, WAL configuration |
| `Observations.ts` | CRUD for observations, deduplication, stale detection |
| `Sessions.ts` | Session create/complete/query |
| `Summaries.ts` | Summary CRUD |
| `Prompts.ts` | Prompt CRUD |
| `Search.ts` | FTS5 search, timeline queries, project stats |
| `Checkpoints.ts` | Checkpoint create/query |
| `Analytics.ts` | Aggregation queries for dashboard |
| `Reports.ts` | Report data aggregation |

### Design Principles

- **No global singletons**: All functions receive a `Database` instance as the first parameter
- **WAL mode**: Allows concurrent reads from hooks and the worker simultaneously
- **Migrations**: Versioned inline migrations in `Database.ts`, applied atomically via transactions
- **bun:sqlite API**: The same API surface as bun's native SQLite, shimmed to `better-sqlite3` for Node.js production use

## Subsystem 3: Worker Service

**Location:** `src/services/worker-service.ts`

An Express HTTP server running on port 3001. It serves the web dashboard, REST API, and SSE events.

### Architecture

The worker is split into modular routers:

| Router | File | Routes |
|--------|------|--------|
| Core | `routes/core.ts` | `GET /health`, `GET /events`, `POST /api/notify` |
| Observations | `routes/observations.ts` | Observation CRUD, knowledge, memory save, context |
| Summaries | `routes/summaries.ts` | Summary CRUD |
| Search | `routes/search.ts` | FTS5, hybrid search, timeline |
| Analytics | `routes/analytics.ts` | Overview, timeline, types, sessions, anomalies |
| Sessions | `routes/sessions.ts` | Sessions, checkpoints, prompts |
| Projects | `routes/projects.ts` | Project list, aliases, stats |
| Data | `routes/data.ts` | Embeddings, retention, export, report |

### Security

- Binds to `127.0.0.1` (localhost only) by default
- `helmet` middleware for protective HTTP headers
- CORS restricted to `localhost` and `127.0.0.1`
- Rate limiting on all API routes (100 req/min general, 60 req/min for `/api/notify`)
- `X-Worker-Token` authentication for destructive and privileged endpoints
- Input validation on all endpoints

### SSE Events

The worker maintains a pool of SSE clients connected to `GET /events`. When hooks call `POST /api/notify`, the worker broadcasts to all connected clients. The React dashboard listens to this stream for real-time updates.

## Subsystem 4: MCP Server

**Location:** `src/servers/mcp-server.ts`

A Model Context Protocol server using stdio transport. Spawned as a subprocess by the editor.

The MCP server connects directly to the SQLite database (bypassing the worker) for low-latency reads. It uses the same `KiroMemoryDatabase` and search modules as the SDK.

See [MCP Tools Reference](/kiro-memory/reference/mcp-tools) for detailed tool documentation.

## Subsystem 5: SDK

**Location:** `src/sdk/index.ts`

The `KiroMemorySDK` class provides the programmatic API used internally by hooks and exported as `kiro-memory/sdk`.

The SDK handles:
- Database connection lifecycle
- Deduplication logic (SHA256 + time windows)
- Background embedding generation (fire-and-forget)
- Smart context assembly with 4-signal scoring
- Knowledge type validation

See [SDK Guide](/kiro-memory/guides/sdk) for full API documentation.

## Data Flow: Observation Lifecycle

```
Editor tool executes
        │
        ▼
postToolUse hook receives stdin JSON
        │
        ├─► Categorize tool (file-read, file-write, command, etc.)
        ├─► Build title + narrative + facts + concepts
        ├─► Redact secrets
        │
        ▼
SDK.storeObservation()
        │
        ├─► Generate content_hash = SHA256(project|type|title|narrative)
        ├─► Check duplicate: isDuplicateObservation(hash, window)
        │     └─► If duplicate: return -1 (discard)
        │
        ├─► INSERT INTO observations ✓
        │
        └─► generateEmbeddingAsync() [background, non-blocking]
              ├─► Compose text: title + content + concepts (max 2000 chars)
              ├─► Call embedding model
              └─► INSERT INTO observation_embeddings
```

## Data Flow: Context Injection

```
New session starts
        │
        ▼
agentSpawn hook fires
        │
        ├─► ensureWorkerRunning() — starts worker if not running
        │
        ▼
SDK.getSmartContext({ tokenBudget: 2000 })
        │
        ├─► getObservationsByProject(project, 30)
        ├─► Separate knowledge items from regular observations
        ├─► Score each item:
        │     recency = exp(-age / halfLife)
        │     projectMatch = 1.0 or 0.5
        │     score = recency*0.7 + projectMatch*0.3
        │     knowledgeBoost = score * 3.0 (for knowledge types)
        │
        ├─► Sort: [knowledge sorted by score] + [regular sorted by score]
        ├─► Fill token budget (ceil(content.length / 4))
        │
        └─► Return SmartContext { items, summaries, tokensUsed }

        ▼
formatSmartContext() → stdout
        │
        ▼
Injected into agent context window
```

## Build System

The project uses **esbuild** (not tsc) for building. The build script is `scripts/build-plugin.js`.

Key build features:
- Each entry point bundled separately (hooks, SDK, worker, MCP server, CLI, UI)
- `bun:sqlite` shimmed to `better-sqlite3` via esbuild plugin
- `createRequire` banner added for CJS native module compatibility
- Output: `plugin/dist/`
- UI entry point (`src/ui/viewer/index.tsx`) targets browser

```
npm run build    →    plugin/dist/
├── cli/contextkit.js
├── sdk/index.js
├── hooks/agentSpawn.js
├── hooks/userPromptSubmit.js
├── hooks/postToolUse.js
├── hooks/stop.js
├── index.js
├── worker-service.js
├── servers/mcp-server.js
└── viewer.html
```
