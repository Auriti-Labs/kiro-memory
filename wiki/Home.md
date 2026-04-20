# Total Recall Documentation

Total Recall is a persistent memory system for AI coding assistants. It automatically captures session context — files changed, commands run, decisions made — and provides cross-session memory so your AI agent picks up exactly where it left off.

**npm package:** [`totalrecallai`](https://www.npmjs.com/package/totalrecallai) · **Version:** 4.0.1 · **License:** AGPL-3.0 · **Tests:** 933

## Quick Navigation

| Page | Description |
|------|-------------|
| [[Installation]] | Install Total Recall for Claude Code, Cursor, Windsurf, Cline, or any MCP editor |
| [[Configuration]] | Environment variables, data directory, worker config, security settings |
| [[CLI Reference|CLI-Reference]] | Every command with usage, options, and examples |
| [[SDK Reference|SDK-Reference]] | TypeScript API for programmatic access |
| [[MCP Tools|MCP-Tools]] | All 10 MCP tools with parameters and examples |
| [[Architecture]] | System design, data flow, storage layout |
| [[Troubleshooting]] | Known issues and fixes (WSL, build tools, ports, embeddings) |
| [[FAQ]] | Frequently asked questions |

## Supported Editors

Total Recall works with any editor that supports the Model Context Protocol (MCP):

- **Claude Code** — Deepest integration via 4 hooks (PreToolUse, PostToolUse, Notification, Stop) + MCP server
- **Cursor** — Rules file (`.cursor/rules/totalrecall.mdc`) + MCP server
- **Windsurf** — Rules file (`.windsurfrules`) + MCP server
- **Cline** — Custom instructions (`.clinerules`) + MCP server
- **Any MCP-compatible editor** — Via the MCP server directly

## Key Features

- **AI coding assistant memory** with persistent cross-session context
- Local vector embeddings via ONNX Runtime — no API keys, no cloud, no data leaves your machine
- 4-signal smart ranking: recency, frequency, semantic similarity, decay
- Hybrid search combining FTS5 (BM25) and vector cosine similarity
- Web dashboard at `http://localhost:3001` with live feed, analytics, and spotlight search
- TypeScript SDK for programmatic access
- Structured knowledge storage: decisions, constraints, heuristics, rejected approaches
- Plugin system with auto-discovery (Slack, GitHub built-in)
- Automatic backup with rotation and gzip compression
- Import/export as JSONL with SHA256 deduplication
- Service auto-start on boot via crontab or systemd

## Getting Started

```bash
npm install -g totalrecallai
totalrecall install
```

The worker auto-starts when a session begins. Open `http://localhost:3001` for the web dashboard.

## Project Links

- **Repository:** [github.com/Auriti-Labs/kiro-memory](https://github.com/Auriti-Labs/kiro-memory)
- **npm:** [npmjs.com/package/totalrecallai](https://www.npmjs.com/package/totalrecallai)
- **Issues:** [github.com/Auriti-Labs/kiro-memory/issues](https://github.com/Auriti-Labs/kiro-memory/issues)
- **Security:** [Report a vulnerability](https://github.com/Auriti-Labs/kiro-memory/security/advisories/new)
