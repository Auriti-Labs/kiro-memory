<p align="center">
  <img src="assets/banner.svg" alt="Kiro Memory" width="480" />
</p>

<p align="center">
  <strong>Persistent cross-session memory for AI coding assistants.</strong><br/>
  <em>Works with <a href="https://docs.anthropic.com/en/docs/agents-and-tools/claude-code/overview">Claude Code</a>, <a href="https://www.cursor.com/">Cursor</a>, <a href="https://codeium.com/windsurf">Windsurf</a>, <a href="https://github.com/cline/cline">Cline</a>, and any MCP-compatible editor.</em>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/kiro-memory"><img src="https://img.shields.io/npm/v/kiro-memory" alt="npm" /></a>
  <img src="https://img.shields.io/badge/license-AGPL--3.0-blue" alt="License" />
  <img src="https://img.shields.io/badge/node-%3E%3D18-green" alt="Node" />
</p>

---

Kiro Memory gives your AI coding assistant memory that persists across sessions. It automatically captures what happened -- files changed, tools used, decisions made -- and feeds relevant context back at the start of the next session. No manual bookkeeping. Your agent picks up exactly where it left off.

Works with **Claude Code** (hooks), **Cursor** (rules + MCP), **Windsurf** (rules + MCP), **Cline** (custom instructions + MCP), and any editor that supports the **Model Context Protocol**.

## What Your Agent Sees

When a new session starts, Kiro Memory automatically injects previous session context:

```
# Kiro Memory: Previous Session Context

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

- **Multi-Editor Support** -- Works with Claude Code, Cursor, Windsurf, Cline, and any MCP-compatible editor
- **Automatic Context Injection** -- Previous session knowledge injected at agent start via hooks
- **Vector Search** -- Local embeddings with semantic similarity search (no API keys required)
- **Smart Ranking** -- 4-signal scoring (recency, frequency, semantic, decay) for relevance ordering
- **Memory Decay** -- Automatic stale detection and consolidation of old observations
- **Structured Knowledge** -- Store architectural decisions, constraints, heuristics, and rejected approaches
- **Session Checkpoint & Resume** -- Checkpoint sessions and resume from where you left off
- **Activity Reports** -- Weekly/monthly digests in text, Markdown, or JSON format
- **Analytics Dashboard** -- Activity timeline, type distribution, session stats, and file hotspots
- **Session Summaries** -- Structured summaries generated when sessions end
- **Web Dashboard** -- Real-time viewer at `http://localhost:3001` with dark/light theme, search, project filters, and live updates via SSE
- **MCP Server** -- 10 tools exposed via Model Context Protocol
- **Full-Text Search** -- SQLite FTS5 for fast, typo-tolerant search across all stored context
- **TypeScript SDK** -- Programmatic access to the entire memory system
- **CLI** -- Query and manage context directly from the terminal

## Quick Start

```bash
# Install globally
npm install -g kiro-memory

# Install for your editor
kiro-memory install              # Auto-detects your editor
kiro-memory install --claude-code  # Claude Code (hooks + MCP)
kiro-memory install --cursor       # Cursor (rules + MCP)
kiro-memory install --windsurf     # Windsurf (rules + MCP)
kiro-memory install --cline        # Cline (instructions + MCP)
```

Or from source:

```bash
git clone https://github.com/auriti-web-design/kiro-memory.git
cd kiro-memory
npm install && npm run build
npm run install:kiro
```

Once installed, the worker auto-starts and the web dashboard is available at `http://localhost:3001`.

## Editor Integration

### Claude Code

Registers **4 hooks** and an **MCP server** automatically via `kiro-memory install --claude-code`:

| Hook | Trigger | Purpose |
|------|---------|---------|
| `PreToolUse` | Before tool runs | Injects session context |
| `PostToolUse` | After tool completes | Captures file writes, commands, research |
| `Notification` | User sends prompt | Records prompts for continuity |
| `Stop` | Session ends | Generates structured session summary |

### Cursor / Windsurf / Cline

For editors without hook support, Kiro Memory uses **rules files** + **MCP server**:

- **Cursor**: `.cursor/rules/kiro-memory.mdc` + MCP config in `.cursor/mcp.json`
- **Windsurf**: `.windsurfrules` + MCP config in `~/.codeium/windsurf/mcp_config.json`
- **Cline**: `.clinerules` + MCP config in Cline settings

The MCP server exposes 10 tools that your AI assistant can use directly.

## Architecture

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
             (~/.kiro-memory/kiro-memory.db)
```

> The worker auto-starts when a session begins. No manual setup required.

### MCP Tools

| Tool | Description |
|------|-------------|
| `search` | Full-text search across observations and summaries with project/type filters |
| `timeline` | Chronological context around a specific observation |
| `get_observations` | Retrieve full details of observations by ID |
| `get_context` | Get recent observations, summaries, and prompts for a project |
| `store_observation` | Store a new observation from the AI assistant |
| `store_summary` | Store a session summary |
| `store_knowledge` | Store structured knowledge (decision, constraint, heuristic, rejected) |
| `resume_session` | Get checkpoint data to resume a previous session |
| `generate_report` | Generate weekly/monthly activity report in Markdown |
| `get_recent_context` | Get recent memory context for session injection |

### Storage

| Component | Location |
|-----------|----------|
| Database | `~/.kiro-memory/kiro-memory.db` |
| Logs | `~/.kiro-memory/logs/` |
| Archives | `~/.kiro-memory/archives/` |
| Backups | `~/.kiro-memory/backups/` |

## SDK

The TypeScript SDK provides full programmatic access to the memory system.

```typescript
import { createKiroMemory } from 'kiro-memory';

const ctx = createKiroMemory({ project: 'my-project' });

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

### SDK API Reference

| Method | Returns | Description |
|--------|---------|-------------|
| `getContext()` | `ContextContext` | Recent observations, summaries, and prompts |
| `storeObservation(data)` | `number` | Store an observation, returns its ID |
| `storeSummary(data)` | `number` | Store a session summary, returns its ID |
| `search(query)` | `{ observations, summaries }` | Basic full-text search |
| `searchAdvanced(query, filters)` | `{ observations, summaries }` | FTS5 search with filters |
| `hybridSearch(query, opts)` | `ScoredResult[]` | Vector + FTS5 hybrid search with smart ranking |
| `semanticSearch(query, opts)` | `ScoredResult[]` | Pure vector similarity search |
| `storeKnowledge(data)` | `number` | Store structured knowledge (decision/constraint/heuristic) |
| `getKnowledge(filters)` | `KnowledgeItem[]` | Retrieve knowledge by type |
| `createCheckpoint(sessionId, data)` | `void` | Save session checkpoint for resume |
| `getCheckpoint(sessionId)` | `DBCheckpoint \| null` | Retrieve latest session checkpoint |
| `generateReport(opts)` | `ReportData` | Generate weekly/monthly activity report |
| `runDecay(opts)` | `DecayResult` | Run memory decay and stale detection |
| `consolidateStale(opts)` | `ConsolidateResult` | Consolidate stale observations |
| `getTimeline(anchorId, before, after)` | `TimelineEntry[]` | Chronological context around an observation |
| `getOrCreateSession(id)` | `DBSession` | Get or initialize a session |
| `close()` | `void` | Close the database connection |

## CLI Reference

```bash
kiro-memory <command> [options]
```

| Command | Alias | Description |
|---------|-------|-------------|
| `kiro-memory install` | -- | Install hooks + MCP for your editor |
| `kiro-memory context` | `ctx` | Display current project context |
| `kiro-memory search <query>` | -- | Search across all stored context |
| `kiro-memory semantic-search <query>` | `ss` | Vector similarity search |
| `kiro-memory observations [limit]` | `obs` | Show recent observations |
| `kiro-memory summaries [limit]` | `sum` | Show recent summaries |
| `kiro-memory add-observation <title> <content>` | `add-obs` | Manually add an observation |
| `kiro-memory add-summary <content>` | `add-sum` | Manually add a summary |
| `kiro-memory add-knowledge <type> <title> <content>` | -- | Store structured knowledge |
| `kiro-memory resume [sessionId]` | -- | Resume from last checkpoint |
| `kiro-memory report` | -- | Generate activity report |
| `kiro-memory decay` | -- | Run memory decay detection |
| `kiro-memory embeddings` | -- | Build/rebuild vector index |
| `kiro-memory doctor` | -- | Run environment diagnostics |

### Examples

```bash
# Install for Claude Code
kiro-memory install --claude-code

# Search with vector similarity
kiro-memory semantic-search "authentication flow"

# Generate a weekly report in Markdown
kiro-memory report --period=weekly --format=md --output=report.md

# Store an architectural decision
kiro-memory add-knowledge decision "Use PostgreSQL" "ACID compliance for transactions"

# Resume a previous session
kiro-memory resume

# Run memory decay to clean stale observations
kiro-memory decay --days=30
```

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `KIRO_MEMORY_DATA_DIR` | `~/.kiro-memory` | Base directory for all Kiro Memory data |
| `KIRO_MEMORY_WORKER_HOST` | `127.0.0.1` | Worker service bind address |
| `KIRO_MEMORY_WORKER_PORT` | `3001` | Worker service port |
| `KIRO_MEMORY_LOG_LEVEL` | `INFO` | Log verbosity: `DEBUG`, `INFO`, `WARN`, `ERROR` |
| `KIRO_CONFIG_DIR` | `~/.kiro` | Kiro CLI configuration directory |

### Worker & Web Dashboard

The worker starts automatically when a Kiro session begins (via the `agentSpawn` hook). Once running, open `http://localhost:3001` in your browser to access the web dashboard with:

- **Live feed** of observations, summaries, and prompts (via SSE)
- **Project sidebar** with type filters and stats
- **Spotlight search** (Ctrl+K / Cmd+K) with instant results
- **Dark/light theme** toggle

For development, you can also manage the worker manually:

```bash
npm run worker:start     # Start the background worker
npm run worker:stop      # Stop the worker
npm run worker:restart   # Restart after code changes
npm run worker:status    # Check if worker is running
npm run worker:logs      # View recent logs
```

## Requirements

- **Node.js** >= 18
- **Kiro CLI** -- [kiro.dev](https://kiro.dev/)

## Development

```bash
# Install dependencies
npm install

# Build and sync to Kiro
npm run dev

# Run tests
npm test

# Run specific test suites
npm run test:sqlite
npm run test:search
npm run test:context
npm run test:server
```

## Troubleshooting

### `invalid ELF header` (WSL)

```
Error: .../better_sqlite3.node: invalid ELF header
```

This happens when the native module was compiled for Windows but you're running inside WSL (Linux). Common cause: npm installed to the Windows filesystem (`/mnt/c/...`) instead of the Linux one.

**Fix:**

```bash
# Check which node you're using
which node
# If it shows /mnt/c/... you're using Windows Node inside WSL

# Install Node.js natively in WSL
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs

# Or use nvm (recommended)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
nvm install 22

# Verify
which node  # Should be /home/... or /root/.nvm/...

# Reinstall
npm install -g kiro-memory
```

### `npm prefix` pointing to Windows (WSL)

If `npm prefix -g` returns a `/mnt/c/...` path, npm installs global packages on the Windows filesystem, causing native module issues.

**Fix:**

```bash
mkdir -p ~/.npm-global
npm config set prefix ~/.npm-global
echo 'export PATH="$HOME/.npm-global/bin:$PATH"' >> ~/.bashrc
source ~/.bashrc

# Reinstall
npm install -g kiro-memory
```

### Missing build tools (Linux/WSL)

```
gyp ERR! find Python
gyp ERR! stack Error: Could not find any Python installation to use
```

Native modules like `better-sqlite3` need compilation tools.

**Fix:**

```bash
sudo apt-get update && sudo apt-get install -y build-essential python3
npm install -g kiro-memory --build-from-source
```

### `no agent with name kiro-memory found`

The agent configuration was not installed. Run the install command:

```bash
kiro-memory install
```

This creates the agent config at `~/.kiro/agents/kiro-memory.json`. Then start Kiro with:

```bash
kiro-cli --agent kiro-memory
```

### Port 3001 already in use

```bash
# Find what's using the port
lsof -i :3001

# Kill the process
kill -9 <PID>

# Or use a different port
export KIRO_MEMORY_WORKER_PORT=3002
```

### Quick diagnostics

Run the built-in doctor command to check your environment:

```bash
kiro-memory doctor
```

## Security

Kiro Memory runs **locally only** on `127.0.0.1` and implements multiple layers of protection:

- **Token Authentication** on the notify endpoint (shared secret via `~/.kiro-memory/worker.token`)
- **Rate Limiting** on all API endpoints (200 req/min global, 60 req/min for notifications)
- **Helmet** security headers with Content Security Policy
- **CORS** restricted to localhost origins
- **Input Validation** on all POST endpoints (type checking, length limits, safe character patterns)
- **SSE Connection Limit** (max 50 concurrent clients)

To report a security vulnerability, please open a [private security advisory](https://github.com/auriti-web-design/kiro-memory/security/advisories/new).

## Contributing

Contributions are welcome. Please open an issue to discuss proposed changes before submitting a pull request. See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

[AGPL-3.0](https://www.gnu.org/licenses/agpl-3.0.html)

---

Built by [auriti-web-design](https://github.com/auriti-web-design)

---

<p align="center">
  <a href="https://buymeacoffee.com/auritidesign">
    <img src="https://img.shields.io/badge/Buy%20Me%20a%20Coffee-ffdd00?style=for-the-badge&logo=buy-me-a-coffee&logoColor=black" alt="Buy Me a Coffee" />
  </a>
</p>
