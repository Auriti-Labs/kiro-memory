<p align="center">
  <img src="assets/banner.svg" alt="Total Recall" width="480" />
</p>

<p align="center">
  <strong>Persistent cross-session memory for AI coding assistants.</strong><br/>
  <em>Works with <a href="https://docs.anthropic.com/en/docs/agents-and-tools/claude-code/overview">Claude Code</a>, <a href="https://www.cursor.com/">Cursor</a>, <a href="https://codeium.com/windsurf">Windsurf</a>, <a href="https://github.com/cline/cline">Cline</a>, and any MCP-compatible editor.</em>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/totalrecallai"><img src="https://img.shields.io/npm/v/totalrecallai" alt="npm" /></a>
  <img src="https://img.shields.io/badge/license-AGPL--3.0-blue" alt="License" />
  <img src="https://img.shields.io/badge/node-%3E%3D18-green" alt="Node" />
  <a href="https://github.com/Auriti-Labs/kiro-memory/wiki"><img src="https://img.shields.io/badge/docs-Wiki-00b4d8" alt="Docs" /></a>
</p>

---

Total Recall is an AI coding assistant memory system that gives your agent persistent, cross-session context. It automatically captures what happened during each session — files changed, tools used, decisions made — and feeds relevant context back when the next session starts. No manual bookkeeping. Your agent picks up exactly where it left off.

**[Read the full documentation →](https://github.com/Auriti-Labs/kiro-memory/wiki)**

Total Recall works with **Claude Code** (hooks), **Cursor** (rules + MCP), **Windsurf** (rules + MCP), **Cline** (custom instructions + MCP), and any editor that supports the **Model Context Protocol**. With 933 tests, 10 MCP tools, and a TypeScript SDK, Total Recall is the most complete persistent memory solution for AI coding assistants.

## What Your Agent Sees

When a new session starts, Total Recall automatically injects previous session context:

```
# Total Recall: Previous Session Context

## Previous Sessions

- **Learned**: JWT tokens need refresh logic with 5-minute buffer
- **Completed**: Implemented OAuth2 login flow with Google provider
- **Next steps**: Files modified: src/auth/oauth.ts, src/middleware/auth.ts

## Recent Observations

- **[file-write] Written: src/auth/oauth.ts**: Implemented Google OAuth2 provider
- **[command] Executed: npm test -- --coverage**: All 47 tests passing
- **[research] Searched: JWT refresh token best practices**: Found rotating refresh pattern

> Project: my-app | Observations: 23 | Summaries: 5
```

## Features

### Memory & Search

- **Vector Search** — Local embeddings with semantic similarity search (no API keys required)
- **Smart Ranking** — 4-signal scoring (recency, frequency, semantic, decay) for relevance ordering
- **Full-Text Search** — SQLite FTS5 with weighted BM25 scoring
- **Memory Decay** — Automatic stale detection and consolidation of old observations
- **Structured Knowledge** — Store architectural decisions, constraints, heuristics, and rejected approaches

### Session Management

- **Automatic Context Injection** — Previous session knowledge injected at agent start via hooks
- **Session Checkpoint & Resume** — Checkpoint sessions and resume from where you left off
- **Session Summaries** — Structured summaries with investigated/completed/learned/next_steps sections
- **Session Tracking** — Stats (total, active, completed, avg duration) with expandable details

### Monitoring & Operations

- **Web Dashboard** — Real-time viewer at `http://localhost:3001` with dark/light theme, hybrid search, project filters, and live updates via SSE
- **Analytics Dashboard** — Activity timeline, type distribution, session stats, and file hotspots
- **Activity Reports** — Weekly/monthly digests in text, Markdown, or JSON format
- **Health Diagnostics** — Enhanced `/health` endpoint with system status and embedding health checks
- **Service Auto-Start** — `totalrecall service install` registers the worker to start on boot (crontab/systemd)

### Integrations & Extensibility

- **Multi-Editor Support** — Claude Code, Cursor, Windsurf, Cline, and any MCP-compatible editor
- **MCP Server** — 11 tools exposed via Model Context Protocol
- **TypeScript SDK** — Full programmatic access to the memory system
- **Plugin System** — Extensible architecture with auto-discovery and lifecycle management. Built-in Slack and GitHub plugins
- **Import/Export JSONL** — Streaming import/export with SHA256 deduplication
- **Backup & Restore** — Automatic SQLite backup with rotation, point-in-time restore, gzip compression
- **Secret Filtering** — Automatic redaction of API keys, passwords, and tokens
- **Retention Policy** — Automatic cleanup of old data with configurable age and dry-run mode

## Quick Start

### Requirements

- **Node.js** >= 18

### Install

```bash
# Install globally
npm install -g totalrecallai

# Install for your editor
totalrecall install              # Auto-detects your editor
totalrecall install --claude-code  # Claude Code (hooks + MCP)
totalrecall install --cursor       # Cursor (rules + MCP)
totalrecall install --windsurf     # Windsurf (rules + MCP)
totalrecall install --cline        # Cline (instructions + MCP)
```

Or from source:

```bash
git clone https://github.com/Auriti-Labs/kiro-memory.git
cd kiro-memory
npm install && npm run build
npm run install:kiro
```

Once installed, the worker auto-starts and the web dashboard is available at `http://localhost:3001`.

### Updating

```bash
# Update to the latest version
npm update -g totalrecallai

# Verify the installed version
totalrecall --version
```

The worker automatically uses the new version at the next session start. To apply immediately:

```bash
npm run worker:restart
# or manually:
pkill -f "worker-service" && totalrecall install
```

## Editor Integration

### Claude Code

Registers **4 hooks** and an **MCP server** automatically via `totalrecall install --claude-code`:

| Hook | Trigger | Purpose |
|------|---------|---------|
| `PreToolUse` | Before tool runs | Injects session context |
| `PostToolUse` | After tool completes | Captures file writes, commands, research |
| `Notification` | User sends prompt | Records prompts for continuity |
| `Stop` | Session ends | Generates structured session summary |

### Cursor / Windsurf / Cline

For editors without hook support, Total Recall uses **rules files** + **MCP server**:

- **Cursor**: `.cursor/rules/totalrecall.mdc` + MCP config in `.cursor/mcp.json`
- **Windsurf**: `.windsurfrules` + MCP config in `~/.codeium/windsurf/mcp_config.json`
- **Cline**: `.clinerules` + MCP config in Cline settings

The MCP server exposes 10 tools that your AI assistant can use directly. See the [MCP Tools wiki page](https://github.com/Auriti-Labs/kiro-memory/wiki/MCP-Tools) for details.

## Architecture

```
          Claude Code / Cursor / Windsurf / Cline
                        |
          +-------------+-------------+
          |             |             |
       Hooks      MCP Server    Rules Files
   (auto-capture)  (11 tools)  (editor config)
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

> The worker auto-starts when a session begins. No manual setup required.

### MCP Tools

| Tool | Description |
|------|-------------|
| `search` | Full-text search across observations and summaries with project/type filters |
| `semantic_search` | Hybrid vector + keyword search for semantic similarity |
| `timeline` | Chronological context around a specific observation |
| `get_observations` | Retrieve full details of observations by ID |
| `get_context` | Get recent observations, summaries, and prompts for a project |
| `store_knowledge` | Store structured knowledge (decision, constraint, heuristic, rejected) |
| `resume_session` | Get checkpoint data to resume a previous session |
| `save_memory` | Save a structured observation from the AI assistant |
| `generate_report` | Generate weekly/monthly activity report in Markdown |
| `embedding_stats` | Show vector embedding statistics and coverage |

### Storage

| Component | Location |
|-----------|----------|
| Database | `~/.totalrecall/totalrecall.db` |
| Logs | `~/.totalrecall/logs/` |
| Archives | `~/.totalrecall/archives/` |
| Backups | `~/.totalrecall/backups/` |

## SDK

The TypeScript SDK provides full programmatic access to the AI coding assistant memory system.

```typescript
import { createTotalRecall } from 'totalrecallai';

const ctx = createTotalRecall({ project: 'my-project' });

// Retrieve context for the current project
const context = await ctx.getContext();

// Store an observation
await ctx.storeObservation({
  type: 'note',
  title: 'Auth fix',
  content: 'Fixed OAuth flow -- tokens now refresh with 5-min buffer'
});

// Semantic search with vector embeddings
const results = await ctx.hybridSearch('authentication flow', { limit: 10 });

// Store structured knowledge
await ctx.storeKnowledge({
  knowledgeType: 'decision',
  title: 'Chose PostgreSQL over MongoDB',
  content: 'ACID compliance required for financial transactions',
  reasoning: 'Need strong consistency guarantees'
});

// Session checkpoint & resume
await ctx.createCheckpoint('session-123', { completedSteps: ['auth', 'db'] });
const checkpoint = await ctx.getCheckpoint('session-123');

// Generate activity report
const report = await ctx.generateReport({ period: 'weekly' });

// Always close when done
ctx.close();
```

See the full [SDK Reference](https://github.com/Auriti-Labs/kiro-memory/wiki/SDK-Reference) for all available methods.

## CLI Reference

```bash
totalrecall <command> [options]
```

| Command | Alias | Description |
|---------|-------|-------------|
| `install` | — | Install hooks + MCP for your editor |
| `context` | `ctx` | Display current project context |
| `search <query>` | — | Search across all stored context |
| `semantic-search <query>` | `ss` | Vector similarity search |
| `observations [limit]` | `obs` | Show recent observations |
| `summaries [limit]` | `sum` | Show recent summaries |
| `add-observation <title> <content>` | `add-obs` | Manually add an observation |
| `add-summary <content>` | `add-sum` | Manually add a summary |
| `add-knowledge <type> <title> <content>` | — | Store structured knowledge |
| `resume [sessionId]` | — | Resume from last checkpoint |
| `report` | — | Generate activity report |
| `decay` | — | Run memory decay detection |
| `embeddings` | — | Build/rebuild vector index |
| `embeddings backfill --all` | — | Regenerate all embeddings with progress bar |
| `doctor` | — | Run environment diagnostics |
| `doctor --fix` | — | Auto-fix issues including corrupted embeddings |
| `service install` | — | Register worker to auto-start on boot |
| `service uninstall` | — | Remove auto-start registration |

### Examples

```bash
# Install for Claude Code
totalrecall install --claude-code

# Search with vector similarity
totalrecall semantic-search "authentication flow"

# Generate a weekly report in Markdown
totalrecall report --period=weekly --format=md --output=report.md

# Store an architectural decision
totalrecall add-knowledge decision "Use PostgreSQL" "ACID compliance for transactions"

# Resume a previous session
totalrecall resume

# Run memory decay to clean stale observations
totalrecall decay --days=30

# Regenerate all embeddings
totalrecall embeddings backfill --all

# Auto-start worker on boot
totalrecall service install

# Diagnose and fix environment issues
totalrecall doctor --fix
```

See the full [CLI Reference](https://github.com/Auriti-Labs/kiro-memory/wiki/CLI-Reference) for all commands and options.

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `TOTALRECALL_DATA_DIR` | `~/.totalrecall` | Base directory for all Total Recall data |
| `TOTALRECALL_WORKER_HOST` | `127.0.0.1` | Worker service bind address |
| `TOTALRECALL_WORKER_PORT` | `3001` | Worker service port |
| `TOTALRECALL_LOG_LEVEL` | `INFO` | Log verbosity: `DEBUG`, `INFO`, `WARN`, `ERROR` |

See the full [Configuration guide](https://github.com/Auriti-Labs/kiro-memory/wiki/Configuration) for all options.

### Worker & Web Dashboard

The worker starts automatically when a session begins. Once running, open `http://localhost:3001` to access the web dashboard with:

- **Live feed** of observations, summaries, and prompts (via SSE)
- **Sessions view** with stats cards and expandable session details
- **Analytics dashboard** with timeline charts and type distribution
- **Project sidebar** with type filters, stats, and token economics
- **Spotlight search** (Ctrl+K / Cmd+K) with hybrid search and source badges
- **Dark/light/system theme** cycling
- **Mobile-responsive** sidebar drawer

For development, you can also manage the worker manually:

```bash
npm run worker:start     # Start the background worker
npm run worker:stop      # Stop the worker
npm run worker:restart   # Restart after code changes
npm run worker:status    # Check if worker is running
npm run worker:logs      # View recent logs
```

## Development

```bash
# Install dependencies
npm install

# Build and sync
npm run dev

# Run tests (933 tests)
npm test

# Run specific test suites
npm run test:sqlite
npm run test:search
npm run test:context
npm run test:server
```

## Troubleshooting

### `invalid ELF header` (WSL)

This happens when the native module was compiled for Windows but you're running inside WSL. Fix: install Node.js natively in WSL using `nvm` or NodeSource, then reinstall:

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
nvm install 22
npm install -g totalrecallai
```

### `npm prefix` pointing to Windows (WSL)

If `npm prefix -g` returns a `/mnt/c/...` path:

```bash
mkdir -p ~/.npm-global
npm config set prefix ~/.npm-global
echo 'export PATH="$HOME/.npm-global/bin:$PATH"' >> ~/.bashrc
source ~/.bashrc
npm install -g totalrecallai
```

### Missing build tools (Linux/WSL)

```bash
sudo apt-get update && sudo apt-get install -y build-essential python3
npm install -g totalrecallai --build-from-source
```

### Port 3001 already in use

```bash
lsof -i :3001
kill -9 <PID>
# Or use a different port:
export TOTALRECALL_WORKER_PORT=3002
```

### Quick diagnostics

```bash
totalrecall doctor        # Check your environment
totalrecall doctor --fix  # Auto-fix issues (including corrupted embeddings)
```

See the full [Troubleshooting guide](https://github.com/Auriti-Labs/kiro-memory/wiki/Troubleshooting) for all known issues and fixes.

## Frequently Asked Questions

### What is Total Recall?

Total Recall is a persistent memory system for AI coding assistants. It captures context from your coding sessions — files changed, commands run, decisions made — and automatically provides that context to your AI agent in future sessions. It acts as cross-session memory so your agent never loses track of what happened before.

### Does Total Recall require an API key or cloud service?

No. Total Recall runs entirely locally on your machine. Vector embeddings are generated locally using ONNX Runtime — no API keys, no cloud services, no data leaves your machine. All data is stored in a local SQLite database at `~/.totalrecall/`.

### Which editors does Total Recall support?

Total Recall works with Claude Code, Cursor, Windsurf, Cline, and any editor that supports the Model Context Protocol (MCP). Claude Code gets the deepest integration via hooks; other editors use rules files plus the MCP server.

### How is Total Recall different from .cursorrules or CLAUDE.md?

Static files like `.cursorrules` or `CLAUDE.md` require manual maintenance and don't capture session history. Total Recall automatically records what happens in each session, builds structured summaries, and uses vector search to surface the most relevant context. It's dynamic, automatic, and searchable.

### Can I use Total Recall with multiple projects?

Yes. Total Recall automatically detects the current project and scopes observations, summaries, and context per project. The web dashboard includes project filters, and all CLI commands support project-scoped queries.

### How much disk space does Total Recall use?

The SQLite database grows based on usage. A typical project with months of daily use stays under 50 MB. Embeddings add roughly 1.5 KB per observation. The `totalrecall decay` command and retention policies help manage growth over time.

### How do I back up my Total Recall data?

Total Recall includes automatic backup with rotation and gzip compression. You can also export data as JSONL for portable backups. The database is a single SQLite file at `~/.totalrecall/totalrecall.db` that can be copied directly.

## Security

Total Recall runs **locally only** on `127.0.0.1` and implements multiple layers of protection:

- **Token Authentication** on the notify endpoint (shared secret via `~/.totalrecall/worker.token`)
- **Rate Limiting** on all API endpoints (200 req/min global, 60 req/min for notifications)
- **Helmet** security headers with Content Security Policy
- **CORS** restricted to localhost origins
- **Input Validation** on all POST endpoints (type checking, length limits, safe character patterns)
- **SSE Connection Limit** (max 50 concurrent clients)

To report a security vulnerability, please open a [private security advisory](https://github.com/Auriti-Labs/kiro-memory/security/advisories/new).

## Contributing

Contributions are welcome. Please open an issue to discuss proposed changes before submitting a pull request. See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

[AGPL-3.0](https://www.gnu.org/licenses/agpl-3.0.html)

---

Built by [Auriti Labs](https://github.com/Auriti-Labs)

---

<p align="center">
  <a href="https://buymeacoffee.com/auritidesign">
    <img src="https://img.shields.io/badge/Buy%20Me%20a%20Coffee-ffdd00?style=for-the-badge&logo=buy-me-a-coffee&logoColor=black" alt="Buy Me a Coffee" />
  </a>
</p>
