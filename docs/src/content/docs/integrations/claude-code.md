---
title: Claude Code
description: Set up Kiro Memory with Claude Code for automatic cross-session memory with full hook tracking.
---

Claude Code is the **primary supported integration** for Kiro Memory. It provides the most complete experience with automatic observation tracking via hooks -- every file edit, command, and decision is captured without manual intervention.

## Prerequisites

- **Node.js 18+** (check with `node --version`)
- **npm** (comes with Node.js)
- **Claude Code** installed and working ([installation guide](https://docs.anthropic.com/en/docs/claude-code/overview))

:::tip
On WSL (Windows Subsystem for Linux), make sure you are using a native Linux Node.js installation, not the Windows one mounted via `/mnt/c/`. Run `which node` to verify -- it should show a path like `/usr/bin/node` or `~/.nvm/versions/node/...`, not `/mnt/c/...`.
:::

## Installation

### Option 1: Automatic setup (recommended)

Install the package globally and run the dedicated installer:

```bash
npm install -g kiro-memory
kiro-memory install --claude-code
```

The installer will:

1. Run environment checks (Node.js version, native modules, WSL compatibility)
2. Configure MCP server in `~/.mcp.json`
3. Set up hooks in `~/.claude/settings.json` (SessionStart, UserPromptSubmit, PostToolUse, Stop)
4. Add steering instructions to `~/.claude/CLAUDE.md`
5. Create the data directory at `~/.contextkit/`

### Option 2: Manual configuration

If you prefer manual setup or need project-level configuration, create the following files.

**MCP Server** -- Add to `~/.mcp.json` (global) or `.mcp.json` (project-level):

```json
{
  "mcpServers": {
    "kiro-memory": {
      "command": "npx",
      "args": ["kiro-memory", "mcp"]
    }
  }
}
```

**Hooks** -- Add to `~/.claude/settings.json`:

```json
{
  "SessionStart": [
    {
      "matcher": "",
      "hooks": [
        {
          "type": "command",
          "command": "npx kiro-memory hook agentSpawn",
          "timeout": 10
        }
      ]
    }
  ],
  "UserPromptSubmit": [
    {
      "matcher": "",
      "hooks": [
        {
          "type": "command",
          "command": "npx kiro-memory hook userPromptSubmit",
          "timeout": 5
        }
      ]
    }
  ],
  "PostToolUse": [
    {
      "matcher": "",
      "hooks": [
        {
          "type": "command",
          "command": "npx kiro-memory hook postToolUse",
          "timeout": 5
        }
      ]
    }
  ],
  "Stop": [
    {
      "matcher": "",
      "hooks": [
        {
          "type": "command",
          "command": "npx kiro-memory hook stop",
          "timeout": 10
        }
      ]
    }
  ]
}
```

:::caution
If you already have other hooks in `settings.json`, merge the Kiro Memory entries into the existing arrays rather than replacing them.
:::

## Verify the connection

1. Start a new Claude Code session in any project directory
2. The `SessionStart` hook will auto-start the worker service and inject previous context
3. Ask Claude to use a Kiro Memory tool:

```
Search my memory for "authentication"
```

You should see Claude call the `kiro-memory/search` tool and return results from your observation database.

You can also check the worker is running:

```bash
kiro-memory doctor
```

Or open the web dashboard at [http://localhost:3001](http://localhost:3001).

## How hooks work

Kiro Memory uses four hooks to automatically track your coding sessions:

| Hook | Event | What it does |
|---|---|---|
| `agentSpawn` | Session start | Starts the worker, injects previous session context |
| `userPromptSubmit` | Each prompt | Records the user's prompt |
| `postToolUse` | After each tool | Captures file writes, commands, tool usage |
| `stop` | Session end | Generates a session summary with learnings and next steps |

Hooks read from stdin and write to stdout. They communicate with the worker service over HTTP (port 3001). The worker manages the SQLite database and handles all persistence.

## Using the MCP tools

Once connected, Claude Code can use all 10 Kiro Memory tools. Here are common workflows:

### Search for past context

```
Search my memory for "database migration" in the kiro-memory project
```

This calls `search` with a query and optional project filter.

### Get project context at the start of a session

```
Get the recent context for my "kiro-memory" project
```

This calls `get_context` and returns recent observations, summaries, and prompts.

### Resume a previous session

```
Resume my last session on this project
```

This calls `resume_session` and returns the last checkpoint with task, progress, next steps, and relevant files.

### Save important decisions

```
Store a decision: we chose SQLite over PostgreSQL for local-first storage because it requires no daemon process and supports WAL mode for concurrent reads.
```

This calls `store_knowledge` with `knowledge_type: "decision"` and persists the reasoning.

### Generate an activity report

```
Generate a weekly report for kiro-memory
```

This calls `generate_report` and returns a markdown summary of sessions, learnings, completed tasks, and file hotspots.

## Tips for effective use

1. **Let hooks do the work.** With Claude Code, you rarely need to call `save_memory` manually -- the hooks capture file changes, commands, and tool usage automatically. The `stop` hook generates a summary.

2. **Start sessions with context.** The `agentSpawn` hook injects previous context automatically. For older context, ask Claude to search or get project context.

3. **Store architectural decisions.** When making important choices, ask Claude to store them as knowledge. This boosts their ranking in future searches.

4. **Use semantic search for fuzzy queries.** If keyword search returns nothing, try: "Use semantic search to find observations about caching strategies."

5. **Check the dashboard.** Open [http://localhost:3001](http://localhost:3001) to browse observations, sessions, and search results visually.

## Advanced: project-level configuration

For project-specific MCP configuration, create a `.mcp.json` file in your project root:

```json
{
  "mcpServers": {
    "kiro-memory": {
      "command": "npx",
      "args": ["kiro-memory", "mcp"],
      "env": {
        "KIRO_MEMORY_DATA_DIR": "~/.contextkit"
      }
    }
  }
}
```

This is useful when you want different data directories per project or need to override the worker port.

## Troubleshooting

**Worker not reachable:** If tools return "Worker unreachable", start it manually:

```bash
kiro-memory worker start
```

**Hooks not firing:** Verify hooks are in `~/.claude/settings.json` and that the paths to the hook scripts are correct. Run `kiro-memory doctor` to check.

**Empty context on session start:** The `agentSpawn` hook only injects context if there are previous observations for the detected project. Try saving something first:

```bash
kiro-memory save --project my-project --title "Test" --content "Testing memory"
```

**Permission errors on WSL:** If you see EPERM or EACCES errors, your Node.js or npm may be the Windows version. Run `kiro-memory doctor --fix` for automatic correction.
