---
title: IDE Integrations
description: Connect Kiro Memory to your favorite AI coding assistant for persistent cross-session context.
---

Kiro Memory works with any AI coding tool that supports the [Model Context Protocol (MCP)](https://modelcontextprotocol.io/). Once connected, your AI assistant remembers what you worked on across sessions -- decisions made, files changed, problems solved, and context gathered.

## Why cross-IDE memory matters

AI coding assistants lose context when a session ends. Every new conversation starts from scratch. Kiro Memory fixes this by:

- **Capturing** what happens during each session (files changed, commands run, decisions made)
- **Storing** observations in a local SQLite database with full-text search
- **Injecting** relevant context at the start of the next session
- **Sharing** memory across editors -- work in Cursor, pick up in Claude Code

All data stays on your machine at `~/.contextkit/contextkit.db`. Nothing is sent to external servers.

## Supported editors

| Feature | Claude Code | Cursor | Cline | Windsurf |
|---|:---:|:---:|:---:|:---:|
| MCP tools (search, timeline, etc.) | Yes | Yes | Yes | Yes |
| Automatic hook tracking | Yes | Yes | Partial | No |
| One-command setup | Yes | Yes | Yes | Yes |
| Semantic search (vector embeddings) | Yes | Yes | Yes | Yes |
| Knowledge storage (decisions, constraints) | Yes | Yes | Yes | Yes |
| Session resume | Yes | Yes | Yes | Yes |
| Activity reports | Yes | Yes | Yes | Yes |
| Web dashboard | Yes | Yes | Yes | Yes |

**Automatic hook tracking** means the editor can run hooks on events like session start, file edit, and session end to capture observations without any manual action. Editors without full hook support still get access to all MCP tools -- the AI can use `save_memory` to persist important context manually.

## Available MCP tools

Kiro Memory exposes 10 tools through the MCP server:

| Tool | Description |
|---|---|
| `search` | Full-text search across observations and summaries |
| `semantic_search` | Vector-based search by meaning (finds related concepts) |
| `timeline` | Chronological context around a specific observation |
| `get_observations` | Fetch full details of observations by ID |
| `get_context` | Recent observations, summaries, and prompts for a project |
| `save_memory` | Manually save an observation (for learning, decisions, etc.) |
| `store_knowledge` | Store structured knowledge: constraints, decisions, heuristics |
| `resume_session` | Resume a previous session with task, progress, and next steps |
| `generate_report` | Generate a weekly or monthly activity report |
| `embedding_stats` | Show vector embedding coverage statistics |

## Quick start

Install Kiro Memory globally, then run the installer for your editor:

```bash
npm install -g kiro-memory
```

Then pick your editor:

```bash
# Claude Code (recommended -- full hook support)
kiro-memory install --claude-code

# Cursor
kiro-memory install --cursor

# Windsurf
kiro-memory install --windsurf

# Cline
kiro-memory install --cline
```

Each installer runs environment checks, configures MCP, and sets up hooks where supported.

## Integration guides

- [Claude Code](./claude-code/) -- Primary integration with automatic tracking via hooks
- [Cursor](./cursor/) -- Full MCP + hooks support
- [Cline](./cline/) -- MCP tools via VS Code extension
- [Windsurf](./windsurf/) -- MCP tools via Windsurf IDE

## Web dashboard

After installation, the worker service starts automatically and serves a web dashboard at:

```
http://localhost:3001
```

The dashboard shows your observations, sessions, and search results across all projects.

## Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `KIRO_MEMORY_DATA_DIR` | `~/.contextkit` | Base data directory |
| `KIRO_MEMORY_WORKER_HOST` | `127.0.0.1` | Worker bind address |
| `KIRO_MEMORY_WORKER_PORT` | `3001` | Worker port |
| `KIRO_MEMORY_LOG_LEVEL` | `INFO` | Log level (DEBUG, INFO, WARN, ERROR) |

## Troubleshooting

Run the built-in diagnostics tool to check your environment:

```bash
kiro-memory doctor
```

This checks Node.js version, native module compatibility, installation paths, worker status, and more. On WSL, it also verifies that Node.js and npm are native Linux binaries (not Windows mounts).

To attempt automatic fixes for detected issues:

```bash
kiro-memory doctor --fix
```
