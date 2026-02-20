# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.6.0] - 2026-02-20

### Security

- **API Authentication**: Token-based auth (`X-Worker-Token`) on `/api/notify` endpoint prevents unauthorized SSE broadcasts
- **Rate Limiting**: Global rate limit (200 req/min) and dedicated limit for notify endpoint (60 req/min) via `express-rate-limit`
- **HTTP Security Headers**: Added `helmet` middleware with Content Security Policy (CSP), X-Frame-Options, and other protective headers
- **CORS Hardening**: Restricted CORS to localhost origins only (previously open to all)
- **Input Validation**: All POST endpoints validate project names, field lengths, and array types before processing
- **Numeric Parameter Validation**: `parseIntSafe()` on all query parameters (offset, limit, anchor, depth) prevents injection via malformed values
- **Batch Endpoint Protection**: `/api/observations/batch` limited to 1-100 positive integer IDs
- **SSE Connection Limit**: Maximum 50 concurrent SSE clients to prevent resource exhaustion
- **Body Size Limit**: JSON request body capped at 1MB
- **Token File Permissions**: Worker token stored with `chmod 600` (owner-only read/write)

### Added

- **Transaction Wrapper**: `KiroMemoryDatabase.withTransaction()` for atomic multi-step database operations with automatic rollback on error
- **30 New Tests**: Comprehensive test suites for Search module (FTS5, LIKE fallback, timeline, stats), SDK (observations, summaries, search, context, sessions), and transaction rollback behavior
- **Event Whitelist**: `/api/notify` only accepts known event types (`observation-created`, `summary-created`, `prompt-created`, `session-created`)

### Changed

- Hook `notifyWorker()` now reads shared token from `~/.kiro-memory/worker.token` and sends it as `X-Worker-Token` header
- Test coverage increased from 10 to 40 tests (+300%)

### Fixed

- Exported `ContextKitDatabase` alias from `Database.ts` for backward compatibility with existing tests

## [1.5.0] - 2026-02-19

### Changed

- **Rebranding**: Full rename from ContextKit to Kiro Memory across SDK, CLI, services, MCP server, hooks, and build scripts
- SDK entry point renamed: `createContextKit` → `createKiroMemory` (backward-compatible aliases preserved)
- CLI binary renamed: `contextkit` → `kiro-memory`
- MCP server references updated
- Hook strings translated to English

### Fixed

- FTS5 query sanitization: terms wrapped in quotes to prevent parser errors from reserved operators (AND, OR, NOT, NEAR)
- SSE keepalive heartbeat (15s interval) prevents proxy/browser disconnections
- SSE reconnection now triggers full data re-fetch to prevent data loss
- Agent config paths corrected from `/home/.../contextkit/` to `/home/.../kiro-memory/`
- Worker health endpoint path matched between CLI doctor and worker (`/health`)
- Backward-compatible data directory: checks for `~/.contextkit` before falling back to `~/.kiro-memory`

### Performance

- Hook `skipMigrations` option: high-frequency hooks skip migration checks, saving ~5-10ms per invocation
- Converted all SDK dynamic imports (`await import(...)`) to static imports for faster startup

## [1.4.1] - 2026-02-19

### Added

- SVG banner for README

## [1.3.0] - 2026-02-19

### Added

- **Dashboard Redesign**: Complete UI overhaul with dark/light theme, project sidebar, spotlight search (Ctrl+K), live SSE feed, and type filters
- **Project Aliases**: Rename projects in the dashboard via `project_aliases` table (migration v3)
- **CLI Install Command**: `kiro-memory install` sets up hooks, MCP server, and agent config automatically
- **CLI Doctor Command**: `kiro-memory doctor` runs environment diagnostics (Node version, paths, worker status, database health)
- **Auto-Fix on Install**: Detects and resolves common environment issues (Windows paths, npm prefix, missing build tools)
- **Windows Compatibility**: Embedded templates, Windows path detection, English error messages

### Fixed

- Prompt capture in `userPromptSubmit` hook now correctly reads from top-level `input.prompt`
- Added lightweight tracking for `read`/`glob`/`grep` tools in `postToolUse` hook
- Real-time notifications from hooks to worker via `POST /api/notify`
- ESM/CJS compatibility with `createRequire` banner in build output

## [1.2.0] - 2026-02-18

### Added

- **CLI Commands**: `install` and `doctor` with full environment diagnostics
- **Interactive Prompts**: Shell alias suggestion during install
- **npm Windows Check**: Detects Windows npm inside WSL and suggests fix

## [1.0.0] - 2026-02-18

### Added

- **Kiro Hooks**: 4 lifecycle hooks (`agentSpawn`, `userPromptSubmit`, `postToolUse`, `stop`) for automatic context capture
- **MCP Server**: 4 tools (`search`, `timeline`, `get_observations`, `get_context`) exposed via Model Context Protocol
- **TypeScript SDK**: Programmatic access to the memory system
- **CLI**: Commands for querying and managing context (`context`, `search`, `observations`, `summaries`, `add-observation`, `add-summary`)
- **SQLite + FTS5**: Persistent storage with full-text search across observations and summaries
- **Worker Service**: Background HTTP API on port 3001 with SSE broadcasting
- **Session Summaries**: Structured summaries generated automatically at session end
- **Web Dashboard**: Real-time viewer at `http://localhost:3001`

[1.6.0]: https://github.com/auriti-web-design/kiro-memory/compare/v1.5.0...v1.6.0
[1.5.0]: https://github.com/auriti-web-design/kiro-memory/compare/v1.3.0...v1.5.0
[1.4.1]: https://github.com/auriti-web-design/kiro-memory/compare/v1.3.0...v1.4.1
[1.3.0]: https://github.com/auriti-web-design/kiro-memory/compare/v1.2.0...v1.3.0
[1.2.0]: https://github.com/auriti-web-design/kiro-memory/compare/v1.0.0...v1.2.0
[1.0.0]: https://github.com/auriti-web-design/kiro-memory/releases/tag/v1.0.0
