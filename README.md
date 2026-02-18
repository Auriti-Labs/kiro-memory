# Kiro Memory

**Persistent cross-session memory for [Kiro CLI](https://kiro.dev/).**

![npm](https://img.shields.io/npm/v/kiro-memory)
![License](https://img.shields.io/badge/license-AGPL--3.0-blue)
![Node](https://img.shields.io/badge/node-%3E%3D18-green)

---

Kiro Memory gives your Kiro agent memory that persists across sessions. It automatically captures what happened -- files changed, tools used, decisions made -- and feeds relevant context back at the start of the next session. No manual bookkeeping. Your agent picks up exactly where it left off.

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

- **Automatic Context Injection** -- Previous session knowledge injected at agent start via `agentSpawn` hook
- **Prompt Tracking** -- Every user prompt recorded for continuity (`userPromptSubmit` hook)
- **Tool & File Monitoring** -- File writes, command executions, and tool usage captured in real time (`postToolUse` hook)
- **Session Summaries** -- Structured summaries generated when sessions end (`stop` hook)
- **Web Dashboard** -- Real-time viewer at `http://localhost:3001` with dark/light theme, search, project filters, and live updates via SSE
- **Auto-Start Worker** -- The background worker starts automatically when a Kiro session begins (no manual setup required)
- **MCP Server** -- 4 tools (`search`, `timeline`, `get_observations`, `get_context`) exposed via Model Context Protocol
- **Full-Text Search** -- SQLite FTS5 for fast, typo-tolerant search across all stored context
- **TypeScript SDK** -- Programmatic access to the entire memory system
- **CLI** -- Query and manage context directly from the terminal

## Quick Start

```bash
# Install globally
npm install -g kiro-memory

# Install into Kiro CLI (hooks + MCP server + agent config)
kiro-memory install
```

Or from source:

```bash
git clone https://github.com/auriti-web-design/kiro-memory.git
cd kiro-memory
npm install && npm run build
npm run install:kiro
```

### Start Kiro with memory enabled

Kiro Memory works as a **custom agent**. You must start Kiro with the `--agent` flag:

```bash
kiro-cli --agent kiro-memory
```

> **Why?** Kiro Memory uses hooks (`agentSpawn`, `postToolUse`, `userPromptSubmit`, `stop`) to capture context automatically. Hooks are defined inside the agent configuration, so they only run when the `kiro-memory` agent is active.

To avoid typing the flag every time, add an alias to your shell:

```bash
# Bash
echo 'alias kiro="kiro-cli --agent kiro-memory"' >> ~/.bashrc && source ~/.bashrc

# Zsh
echo 'alias kiro="kiro-cli --agent kiro-memory"' >> ~/.zshrc && source ~/.zshrc
```

Once running, the worker auto-starts and the web dashboard is available at `http://localhost:3001`.

## Kiro Integration

Kiro Memory registers **4 hooks** and an **MCP server** with Kiro CLI via a custom agent. The agent configuration is installed to `~/.kiro/agents/kiro-memory.json` and is activated with `kiro --agent kiro-memory`:

```json
{
  "name": "kiro-memory",
  "tools": ["read", "write", "shell", "glob", "grep", "@kiro-memory"],
  "mcpServers": {
    "kiro-memory": {
      "command": "node",
      "args": ["/path/to/dist/servers/mcp-server.js"]
    }
  },
  "hooks": {
    "agentSpawn": [{ "command": "node /path/to/dist/hooks/agentSpawn.js" }],
    "userPromptSubmit": [{ "command": "node /path/to/dist/hooks/userPromptSubmit.js" }],
    "postToolUse": [{ "command": "node /path/to/dist/hooks/postToolUse.js", "matcher": "*" }],
    "stop": [{ "command": "node /path/to/dist/hooks/stop.js" }]
  }
}
```

The hooks are fully automatic. No changes to your workflow required.

## Architecture

```
                     Kiro CLI
                        |
          +-------------+-------------+
          |             |             |
     agentSpawn   postToolUse      stop
   (inject ctx)  (track tools)  (summarize)
          |             |             |
          +------+------+------+------+
                 |             |
            Worker HTTP    MCP Server
            (port 3001)     (stdio)
                 |             |
            Web Dashboard     |
          (localhost:3001)    |
                 |            |
                 +------+-----+
                        |
                   SQLite + FTS5
               (~/.kiro-memory/kiro-memory.db)
```

> The worker auto-starts when `agentSpawn` fires. No manual setup required.

### Hooks

| Hook | Trigger | Purpose |
|------|---------|---------|
| `agentSpawn` | Session starts | Injects relevant context from previous sessions |
| `userPromptSubmit` | User sends prompt | Records the prompt for session continuity |
| `postToolUse` | Any tool completes | Captures file writes, commands, research actions |
| `stop` | Session ends | Generates and stores a structured session summary |

### MCP Tools

| Tool | Description |
|------|-------------|
| `search` | Full-text search across observations and summaries. Supports project and type filters. |
| `timeline` | Chronological context around a specific observation. Shows what happened before and after. |
| `get_observations` | Retrieve full details of specific observations by ID. Use after `search` to drill down. |
| `get_context` | Get recent observations, summaries, and prompts for a project. |

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
console.log(context.relevantObservations);
console.log(context.relevantSummaries);

// Store an observation
await ctx.storeObservation({
  type: 'note',
  title: 'Auth fix',
  content: 'Fixed OAuth flow -- tokens now refresh with 5-min buffer'
});

// Full-text search with filters
const results = await ctx.searchAdvanced('authentication', {
  type: 'file-write',
  limit: 10
});

// Get chronological timeline around an observation
const timeline = await ctx.getTimeline(42, 5, 5);

// Store a session summary
await ctx.storeSummary({
  request: 'Implement OAuth2 login',
  learned: 'Google OAuth requires PKCE for SPAs',
  completed: 'Login flow with Google provider',
  nextSteps: 'Add refresh token rotation'
});

// Always close when done
ctx.close();
```

### SDK API Reference

| Method | Returns | Description |
|--------|---------|-------------|
| `getContext()` | `ContextContext` | Recent observations, summaries, and prompts for the project |
| `storeObservation(data)` | `number` | Store an observation, returns its ID |
| `storeSummary(data)` | `number` | Store a session summary, returns its ID |
| `search(query)` | `{ observations, summaries }` | Basic full-text search |
| `searchAdvanced(query, filters)` | `{ observations, summaries }` | FTS5 search with project/type/date/limit filters |
| `getTimeline(anchorId, before, after)` | `TimelineEntry[]` | Chronological context around an observation |
| `getRecentObservations(limit)` | `Observation[]` | Most recent observations |
| `getRecentSummaries(limit)` | `Summary[]` | Most recent summaries |
| `getOrCreateSession(id)` | `DBSession` | Get or initialize a session |
| `storePrompt(sessionId, num, text)` | `number` | Store a user prompt |
| `close()` | `void` | Close the database connection |

## CLI Reference

```bash
kiro-memory <command> [options]
```

| Command | Alias | Description |
|---------|-------|-------------|
| `kiro-memory context` | `ctx` | Display current project context |
| `kiro-memory search <query>` | -- | Search across all stored context |
| `kiro-memory observations [limit]` | `obs` | Show recent observations (default: 10) |
| `kiro-memory summaries [limit]` | `sum` | Show recent summaries (default: 5) |
| `kiro-memory add-observation <title> <content>` | `add-obs` | Manually add an observation |
| `kiro-memory add-summary <content>` | `add-sum` | Manually add a summary |

### Examples

```bash
# View what Kiro Memory knows about your project
kiro-memory context

# Search for past work on authentication
kiro-memory search "OAuth token refresh"

# Show the last 20 observations
kiro-memory observations 20

# Manually record a decision
kiro-memory add-observation "Architecture Decision" "Chose PostgreSQL over MongoDB for ACID compliance"
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

This creates the agent config at `~/.kiro/agents/contextkit.json`. Note: the agent name is `contextkit-memory`, so start Kiro with:

```bash
kiro-cli --agent contextkit-memory
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

## Contributing

Contributions are welcome. Please open an issue to discuss proposed changes before submitting a pull request. See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

[AGPL-3.0](https://www.gnu.org/licenses/agpl-3.0.html)

---

Built by [auriti-web-design](https://github.com/auriti-web-design)
