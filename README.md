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

Start the worker, then use Kiro as usual -- Kiro Memory runs in the background:

```bash
npm run worker:start
```

## Kiro Integration

Kiro Memory registers **4 hooks** and an **MCP server** with Kiro CLI. The agent configuration is installed to `~/.kiro/agents/kiro-memory.json`:

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
                 +------+------+
                        |
                   SQLite + FTS5
               (~/.kiro-memory/kiro-memory.db)
```

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

### Worker Management

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

## Contributing

Contributions are welcome. Please open an issue to discuss proposed changes before submitting a pull request. See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

[AGPL-3.0](https://www.gnu.org/licenses/agpl-3.0.html)

---

Built by [auriti-web-design](https://github.com/auriti-web-design)
