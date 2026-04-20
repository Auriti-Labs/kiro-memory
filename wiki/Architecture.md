# Architecture

Total Recall is a local-first persistent memory system for AI coding assistants. It runs entirely on the developer's machine with no cloud dependencies — all data stays local in a single SQLite database.

## System Overview

```
          Claude Code / Cursor / Windsurf / Cline
                        |
          +-------------+-------------+
          |             |             |
       Hooks      MCP Server    Rules Files
   (auto-capture)  (10 tools)  (editor config)
          |             |             |
          +------+------+------+------+
                 |             |
            Worker HTTP    Vector Index
            (port 3001)   (embeddings)
                 |             |
            Web Dashboard     |
          (localhost:3001)    |
                 |            |
                 +------+-----+
                        |
              SQLite + FTS5 + Embeddings
             (~/.totalrecall/totalrecall.db)
```

## Components

### Worker Service

The worker is an Express.js HTTP server bound to `127.0.0.1:3001`. It is the central component that handles:

- Observation ingestion and storage
- Web dashboard serving (React SPA)
- API endpoints for MCP tool calls and CLI commands
- SQLite database management and migrations
- Background jobs (embedding generation, backup rotation)
- SSE event broadcasting to dashboard clients
- Health diagnostics with embedding health checks

The worker auto-starts when a session begins (triggered by the PreToolUse hook or MCP server). It guards against duplicate instances via a health check on startup.

### Hooks (Claude Code)

Four shell scripts that intercept Claude Code editor events:

| Hook | Event | Function |
|------|-------|----------|
| `PreToolUse` | Before any tool runs | Requests context from worker, injects into AI prompt |
| `PostToolUse` | After tool completes | Categorizes the tool use and stores an observation |
| `Notification` | User sends prompt | Records the prompt for session continuity |
| `Stop` | Session ends | Generates a structured summary (investigated/completed/learned/next_steps) |

The `PostToolUse` hook includes a categorizer that classifies tool uses into types (`file-write`, `file-read`, `command`, `research`, `delegation`) and extracts metadata like file paths, concepts, and narrative.

### MCP Server

A lightweight stdio-based proxy that exposes 10 tools via the Model Context Protocol. It translates MCP tool calls into HTTP requests to the worker. This is the primary integration path for Cursor, Windsurf, Cline, and other MCP-compatible editors.

### Storage Layer

**SQLite + FTS5**: A single database file at `~/.totalrecall/totalrecall.db` with tables for:

- `observations` — Individual events (file writes, commands, research, knowledge)
- `summaries` — Structured session summaries
- `user_prompts` — User prompts for session continuity
- `sessions` — Session metadata and lifecycle
- `checkpoints` — Session checkpoints for resume
- `observation_embeddings` — Vector embeddings for semantic search
- `conversation_messages` — Full conversation transcripts
- `github_links` — GitHub issue/PR links from the GitHub plugin

**FTS5 Virtual Tables**: Full-text search indexes on observations and summaries with BM25 scoring.

**Vector Index**: Local embeddings generated via ONNX Runtime using the `fast-bge-small-en-v1.5` model (via fastembed). Embeddings are stored as binary blobs in SQLite. No API keys or cloud services required.

### Search System

Total Recall implements a hybrid search system combining three approaches:

1. **FTS5 (BM25)** — SQLite full-text search with weighted BM25 scoring. Fast keyword matching.
2. **Vector Search** — Cosine similarity on local embeddings. Finds semantically similar content even without keyword overlap.
3. **Smart Ranking** — A 4-signal composite scoring engine:
   - **Recency** — Newer observations score higher (exponential decay)
   - **Frequency** — Frequently accessed items score higher
   - **Semantic similarity** — Vector cosine distance to the query
   - **Decay** — Stale observations are downranked

The `ScoringEngine` also applies knowledge type boosts (decisions and constraints rank higher) and project match bonuses.

### Web Dashboard

A React single-page application served by the worker at `http://localhost:3001`. Features:

- **Live feed** of observations, summaries, and prompts via Server-Sent Events (SSE)
- **Sessions view** with stats cards and expandable session details
- **Analytics dashboard** with activity timeline, type distribution, and session statistics
- **Activity heatmap** with quantile-based color scaling
- **Diff viewer** for comparing observations and summaries
- **Spotlight search** (Ctrl+K / Cmd+K) with hybrid search and source badges
- **Project sidebar** with type filters, stats, and token economics
- **Dark/light/system theme** cycling
- **Mobile-responsive** sidebar drawer

### Plugin System

Auto-discovery plugin architecture with lifecycle management (`init`, `destroy`, hooks). Built-in plugins:

- **Slack** — Posts session summaries to a Slack channel via webhook
- **GitHub** — Tracks issue references in observations, comments on linked issues

Plugins are loaded from configuration and support enable/disable at runtime.

### Service Installer

The `totalrecall service install` command registers the worker for auto-start on boot using cascading detection:

1. **systemd** (preferred) — Creates a user service at `~/.config/systemd/user/totalrecall-worker.service` with `Restart=on-failure`
2. **crontab** (fallback) — Adds an `@reboot` entry

## Data Flow

### Write Path (Observation Ingestion)

1. Editor event triggers a hook (Claude Code) or MCP tool call (Cursor/Windsurf/Cline)
2. Hook/MCP sends HTTP POST to worker at `127.0.0.1:3001`
3. Worker validates input (type checking, length limits, safe character patterns)
4. Observation stored in SQLite with content hash for deduplication
5. Embedding generated asynchronously in background (fire-and-forget)
6. SSE broadcast to all connected dashboard clients

### Read Path (Session Start)

1. `PreToolUse` hook fires on the first tool use in a new session
2. Hook sends HTTP GET to worker requesting context for the current project
3. Worker queries recent observations and summaries with smart ranking
4. Formatted context (Markdown) injected into the AI prompt
5. AI agent receives previous session knowledge automatically

### Search Path

1. Query processed through FTS5 and vector search in parallel
2. FTS5 returns BM25-scored keyword matches
3. Vector search returns cosine-similarity-scored semantic matches
4. Results merged and re-ranked by the 4-signal composite scoring engine
5. Top results returned with relevance scores and source indicators

## Storage Layout

| Component | Location |
|-----------|----------|
| Database | `~/.totalrecall/totalrecall.db` |
| Auth Token | `~/.totalrecall/worker.token` |
| Logs | `~/.totalrecall/logs/` |
| Archives | `~/.totalrecall/archives/` |
| Backups | `~/.totalrecall/backups/` |
