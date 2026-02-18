# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-02-18

### Added

- **Kiro Hooks**: 4 lifecycle hooks (`agentSpawn`, `userPromptSubmit`, `postToolUse`, `stop`) for automatic context capture
- **MCP Server**: 4 tools (`search`, `timeline`, `get_observations`, `get_context`) exposed via Model Context Protocol
- **TypeScript SDK**: Programmatic access to the memory system (`createContextKit`)
- **CLI**: Commands for querying and managing context (`context`, `search`, `observations`, `summaries`, `add-observation`, `add-summary`)
- **SQLite + FTS5**: Persistent storage with full-text search across observations and summaries
- **Worker Service**: Background HTTP API on port 3001 for async processing
- **Session Summaries**: Structured summaries generated automatically at session end
- **Kiro Install Script**: One-command setup via `contextkit install` or `npm run install:kiro`

### Changed

- **npm package name**: Published as `kiro-memory` (the name `contextkit` was unavailable on npm registry)

[1.0.0]: https://github.com/auriti-web-design/kiro-memory/releases/tag/v1.0.0
