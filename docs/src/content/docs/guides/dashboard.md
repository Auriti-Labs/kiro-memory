---
title: Dashboard
description: The Kiro Memory web dashboard — real-time memory browser on localhost:3001.
---

The Kiro Memory web dashboard is a React single-page application served by the worker on `http://localhost:3001`. It provides a real-time view of everything your AI assistant has captured.

## Accessing the Dashboard

Once the worker is running, open your browser:

```
http://localhost:3001
```

The worker starts automatically when you open any session with Kiro Memory hooks installed. You can also start it manually:

```bash
kiro-memory worker:start
```

## Features

### Observation Browser

Browse all recorded observations sorted by time (most recent first). Each observation shows:

- **Type badge** — color-coded type (`file-write`, `file-read`, `command`, etc.)
- **Title** — the main identifier (e.g., filename, command)
- **Subtitle** — contextual detail (relative path, program name)
- **Narrative** — human-readable description of what happened
- **Concepts** — extracted concept tags
- **Project** — which project this belongs to
- **Timestamp** — when it was recorded

Filter observations by:
- Project
- Type
- Time range
- Keyword search

### Session View

Browse completed sessions with:

- Session ID and timestamps
- Status (active / completed)
- Associated summary
- Checkpoint for resume

### Summaries

Each completed session generates a structured summary visible in the dashboard:

- **Request** — what was being worked on
- **Investigated** — files read and research performed
- **Completed** — changes made and commands run
- **Learned** — insights from research
- **Next Steps** — suggested continuation

### Search

Full-text search across all observations and summaries. Supports:

- Simple keyword queries
- FTS5 operators (`AND`, `OR`, `NOT`, `"quoted phrases"`)
- Filter by project and type

### Analytics

Activity overview with:

- Total observations, sessions, and summaries
- Observation count by type (pie/bar chart)
- Activity timeline (daily observation count over the last 30 days)
- Session statistics

### Embedding Statistics

When semantic search is enabled, shows:

- Total observations vs. embedded observations
- Coverage percentage
- Active embedding model and provider

## Real-Time Updates

The dashboard uses **Server-Sent Events (SSE)** on `http://localhost:3001/events` for live updates. When a hook fires and records something new, the dashboard refreshes automatically without a page reload.

Events pushed to the dashboard:

| Event | Trigger |
|-------|---------|
| `observation-created` | Any file read, write, or command captured |
| `summary-created` | Session summary generated at session end |
| `prompt-created` | User prompt submitted |
| `session-created` | New session started |

## Project Aliases

You can rename projects in the dashboard for display purposes. For example, a project detected as `kiro-memory` (from the git directory name) can be displayed as "Kiro Memory v2". Aliases are stored in the `project_aliases` table and persist across sessions.

## Health Check

The worker exposes a health check endpoint used internally and by the `doctor` command:

```
GET http://localhost:3001/health
```

Response:

```json
{
  "status": "ok",
  "timestamp": 1742043000000,
  "version": "2.1.0"
}
```

## Ports and Security

The dashboard is **local-only by default** — the worker binds to `127.0.0.1`. It is not accessible from other machines on your network.

If you need remote access (not recommended for production), change the bind address:

```bash
export KIRO_MEMORY_WORKER_HOST=0.0.0.0
kiro-memory worker:restart
```

Note: When exposed on the network, consider adding your own reverse proxy with authentication.

## Worker Management

```bash
kiro-memory worker:start    # Start the background worker
kiro-memory worker:stop     # Stop the worker
kiro-memory worker:restart  # Restart the worker
kiro-memory worker:status   # Check if worker is running
kiro-memory worker:logs     # Show last 50 log lines
kiro-memory worker:tail     # Follow logs in real time
```

The worker PID is stored in `~/.contextkit/worker.pid`.
