# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Kiro Memory is a persistent cross-session memory system for Kiro CLI. It captures context (files changed, tools used, decisions made) via hooks and feeds it back at the start of the next session. Published as an npm package (`kiro-memory`), it integrates with Kiro CLI as a custom agent.

## Build & Development

```bash
npm run build              # Build all (esbuild → plugin/dist/)
npm run dev                # Build + sync to Kiro + restart worker
npm run sync-kiro          # Sync plugin to ~/.kiro/plugins/kiro-memory
npm run worker:restart     # Restart the background worker (port 3001)
npm run worker:status      # Check worker status
```

The build uses **esbuild** (not tsc). The build script is `scripts/build-plugin.js`. It bundles each entry point separately (CLI, SDK, hooks, MCP server, worker, UI) into `plugin/dist/`. A `bun:sqlite` shim plugin replaces `bun:sqlite` imports with `better-sqlite3` for Node.js compatibility.

## Testing

```bash
bun test                       # Run all tests
bun test tests/sqlite/         # SQLite layer tests only
bun test tests/worker/agents/  # Agent tests only
bun test tests/worker/search/  # Search tests only
bun test tests/context/        # Context tests only
bun test tests/server/         # Server tests only
bun test tests/sqlite/database.test.ts  # Single test file
```

Tests use **Bun's built-in test runner** (not Jest/Vitest). Database tests use `:memory:` SQLite instances.

## Architecture

The system has 5 main subsystems that communicate through SQLite and HTTP:

### Hooks (`src/hooks/`)
Four Kiro CLI hooks are the primary data ingestion layer:
- `agentSpawn.ts` — Injects previous session context at session start, auto-starts worker
- `userPromptSubmit.ts` — Records user prompts
- `postToolUse.ts` — Captures file writes, commands, tool usage
- `stop.ts` — Generates session summary at session end

Hooks read JSON from stdin (`readStdin()`) and output text to stdout. Exit code 0 = success, 2 = block. Shared utilities in `src/hooks/utils.ts`.

### Worker Service (`src/services/worker-service.ts`)
Express HTTP server on port 3001. Serves the web dashboard, REST API (`/api/*`), and SSE events for live updates. Auto-started by `agentSpawn` hook.

### SQLite Layer (`src/services/sqlite/`)
- `Database.ts` — `KiroMemoryDatabase` class with WAL mode, FTS5, and versioned migrations
- `Observations.ts`, `Sessions.ts`, `Summaries.ts`, `Prompts.ts` — CRUD per entity
- `Search.ts` — FTS5 full-text search and timeline queries

DB file: `~/.contextkit/contextkit.db` (overridable via `KIRO_MEMORY_DATA_DIR`). Code uses `bun:sqlite` API — the build shim maps it to `better-sqlite3` for Node.js.

### MCP Server (`src/servers/mcp-server.ts`)
Model Context Protocol server (stdio transport) exposing 4 tools: `search`, `timeline`, `get_observations`, `get_context`.

### SDK (`src/sdk/index.ts`)
`KiroMemorySDK` class for programmatic access. Exported as `kiro-memory/sdk`. Factory function: `createKiroMemory()`.

### Web UI (`src/ui/`)
React SPA built for browser target. Entry: `src/ui/viewer/index.tsx`. Served as static files by the worker at `http://localhost:3001`.

## Key Conventions

- **Language**: All code comments, JSDoc, logger messages, and user-facing strings MUST be in English. Commit messages follow conventional commits in Italian (per global CLAUDE.md). GitHub issues and PR descriptions in Italian.
- **Database API**: Uses `bun:sqlite` import (shimmed to `better-sqlite3` in Node.js builds). All DB functions take a `Database` instance as first parameter (no globals).
- **Migrations**: Defined inline in `Database.ts` `MigrationRunner.getMigrations()`. Currently at version 3.
- **Project detection**: Uses `git rev-parse --show-toplevel` basename as project identifier.
- **Paths**: All data paths centralized in `src/shared/paths.ts`. Base dir: `~/.contextkit/`.
- **Logging**: Custom logger in `src/utils/logger.ts` with component-based levels.
- **Backward compatibility**: Old names (`ContextKit*`, `createContextKit`) are exported as deprecated aliases.
- **ESM**: The project is ESM (`"type": "module"`). Build adds `createRequire` banner for CJS native modules.

## Environment Variables

| Variable | Default | Purpose |
|---|---|---|
| `KIRO_MEMORY_DATA_DIR` | `~/.contextkit` | Base data directory |
| `KIRO_MEMORY_WORKER_HOST` | `127.0.0.1` | Worker bind address |
| `KIRO_MEMORY_WORKER_PORT` | `3001` | Worker port |
| `KIRO_MEMORY_LOG_LEVEL` | `INFO` | Log level (DEBUG/INFO/WARN/ERROR) |
| `KIRO_CONFIG_DIR` | `~/.kiro` | Kiro CLI config directory |

## Package Exports

- `kiro-memory` — Main entry: SDK, database, types, hook utilities
- `kiro-memory/sdk` — SDK-only entry point
- `kiro-memory` bin (`kiro-memory` CLI) — `plugin/dist/cli/contextkit.js`
