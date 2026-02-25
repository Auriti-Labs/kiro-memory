# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.8.0] - 2026-02-25

### Added

- **Sessions View**: New "Sessions" tab in the dashboard with stats cards (total, active, completed, avg duration), expandable session list with color-coded status indicators, and project filtering
- **Hybrid Search in SearchBar**: Upgraded from FTS5-only to hybrid search (vector + keyword) with source badges (semantic/keyword/hybrid) and relevance scores
- **Save Memory API**: `POST /api/memory/save` endpoint and `save_memory` MCP tool for programmatic observation creation from external tools
- **Export Endpoint**: `GET /api/export` with JSON and Markdown formats, filterable by project, type, and time period
- **Retention Policy**: `POST /api/retention/cleanup` with dry-run mode and configurable age (7-730 days) for automatic data cleanup
- **Stale Badge**: Visual "stale" indicator on observation cards when files have been modified after the observation was created
- **Mobile Sidebar**: Hamburger menu and slide-in drawer for mobile/small screens with responsive layout
- **Concept Extraction from Code**: Analyzes actual code content (React hooks, API calls, SQL, testing patterns, security, performance) to generate richer concept tags
- **Structured Session Summaries**: Stop hook now generates categorized summaries with investigated/completed/learned/next_steps sections instead of flat text
- **Priority Knowledge Injection**: Knowledge items (constraints, decisions, heuristics) are always placed first in context injection, before regular observations
- **Weighted BM25 Search**: FTS5 queries now use column-weighted BM25 scoring (title=10, narrative=5, concepts=3, text=1) for better relevance ranking
- **Type-Specific Deduplication**: Different dedup windows per observation type (file-read=60s, research=120s, file-write=10s, command=30s) to reduce noise
- **Slide-in Animation**: New CSS animation for mobile drawer

### Fixed

- **6 Critical UI Bugs**: `epochSeconds` undefined in timeAgo, SDK deduplication using sessionId instead of content hash, separate pagination offsets for each type, SearchBar Enter key handler, feed items beyond index 8 invisible, ObservationCard redesigned without toggle
- **Accessibility**: Checkbox DOM order in sidebar, ARIA labels on header buttons, combobox roles on search, `aria-live` on feed, improved contrast ratios
- **Theme Cycling**: Dark → Light → System cycle with proper icon for each state

### Changed

- **Dashboard Redesign**: Cleaner ObservationCard without facts/narrative toggle, concept badges with semantic coloring, token economics in sidebar
- **Separate Pagination**: `hasMore` state split per type (observations/summaries/prompts) to avoid unnecessary fetches
- **Rename Feedback**: Visual "Saved"/"Error" indicator after project rename in sidebar
- **storeSummary SDK**: Now accepts `investigated` and `notes` fields

### Performance

- **Composite SQLite Indices**: Migration v9 adds `(project, created_at_epoch DESC)` indices on observations, summaries, and prompts
- **Projects Cache**: In-memory cache with 60s TTL on `/api/projects`, invalidated on new observations
- **Atomic Consolidation**: `consolidateObservations` wrapped in database transaction
- **Input Validation**: Project name validation on `PUT /api/project-aliases`

### Removed

- Dead code: `useSettings.ts`, `lib/utils.ts`, `styles.css`, `tailwind.config.js`
- Unused dependencies: `clsx`, `tailwind-merge`

## [1.7.1] - 2026-02-20

### Fixed

- **Dashboard broken**: CSP (Content Security Policy) blocked Tailwind CDN script, causing no styling and oversized icons on `localhost:3001`

## [1.7.0] - 2026-02-20

### Added

- **Multi-Editor Support**: One-command install for Claude Code, Cursor, Windsurf, and Cline (`kiro-memory install --claude-code|--cursor|--windsurf|--cline`)
- **Local Vector Search (Phase 2A)**: Semantic similarity search using local embeddings (fastembed/transformers.js). No API keys required. CLI: `kiro-memory semantic-search`, `kiro-memory embeddings`
- **Smart Ranking (Phase 2B)**: 4-signal scoring (recency, frequency, semantic similarity, decay) for relevance-ordered search results. SDK: `hybridSearch()`
- **Memory Decay (Phase 2C)**: Automatic stale detection and consolidation of old observations. CLI: `kiro-memory decay`. SDK: `runDecay()`, `consolidateStale()`
- **Analytics Dashboard (Phase 4A)**: Activity timeline, type distribution, session stats, and file hotspots via worker API (`/api/analytics/*`) and web dashboard
- **Structured Knowledge (Phase 5A)**: Store architectural decisions, constraints, heuristics, and rejected approaches. MCP tool: `store_knowledge`. CLI: `kiro-memory add-knowledge`
- **Session Checkpoint & Resume (Phase 6A+6B)**: Save/restore session state with checkpoint data. MCP tool: `resume_session`. CLI: `kiro-memory resume`. SDK: `createCheckpoint()`, `getCheckpoint()`
- **Activity Reports (Phase 4B)**: Weekly/monthly digests with overview, timeline, type distribution, session stats, learnings, completed tasks, next steps, and file hotspots. Three output formats: text (ANSI), Markdown, JSON. MCP tool: `generate_report`. CLI: `kiro-memory report --period=weekly|monthly --format=text|md|json`
- **6 New MCP Tools**: `store_observation`, `store_summary`, `store_knowledge`, `resume_session`, `generate_report`, `get_recent_context` (total: 10 tools)
- **Database Migrations v4-v6**: New tables for embeddings, knowledge, checkpoints; new columns for decay tracking

### Security

- Fixed HIGH/MEDIUM vulnerabilities from security audit (path traversal, input validation, rate limiting improvements)

### Changed

- Updated package description and keywords for multi-editor support
- README rewritten with multi-editor quick start, updated architecture diagram, full MCP tool table, and expanded SDK/CLI reference

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

[1.8.0]: https://github.com/auriti-web-design/kiro-memory/compare/v1.7.1...v1.8.0
[1.7.1]: https://github.com/auriti-web-design/kiro-memory/compare/v1.7.0...v1.7.1
[1.7.0]: https://github.com/auriti-web-design/kiro-memory/compare/v1.6.0...v1.7.0
[1.6.0]: https://github.com/auriti-web-design/kiro-memory/compare/v1.5.0...v1.6.0
[1.5.0]: https://github.com/auriti-web-design/kiro-memory/compare/v1.3.0...v1.5.0
[1.4.1]: https://github.com/auriti-web-design/kiro-memory/compare/v1.3.0...v1.4.1
[1.3.0]: https://github.com/auriti-web-design/kiro-memory/compare/v1.2.0...v1.3.0
[1.2.0]: https://github.com/auriti-web-design/kiro-memory/compare/v1.0.0...v1.2.0
[1.0.0]: https://github.com/auriti-web-design/kiro-memory/releases/tag/v1.0.0
