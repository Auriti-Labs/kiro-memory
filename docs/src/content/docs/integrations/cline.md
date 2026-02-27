---
title: Cline
description: Set up Kiro Memory with Cline (VS Code extension) for persistent cross-session memory via MCP tools.
---

[Cline](https://github.com/cline/cline) is an autonomous AI coding agent that runs as a VS Code extension. It supports MCP servers, giving you access to all Kiro Memory tools for searching, saving, and managing cross-session context.

## Prerequisites

- **Node.js 18+** (check with `node --version`)
- **npm** (comes with Node.js)
- **VS Code** with the [Cline extension](https://marketplace.visualstudio.com/items?itemName=saoudrizwan.claude-dev) installed

:::tip
On WSL, use the VS Code Remote - WSL extension and ensure Node.js is installed natively inside WSL (not the Windows version). Run `which node` to verify.
:::

## Installation

### Option 1: Automatic setup (recommended)

```bash
npm install -g kiro-memory
kiro-memory install --cline
```

The installer will:

1. Run environment checks
2. Configure MCP server in the Cline settings directory
3. Create the data directory at `~/.contextkit/`

The settings file location depends on your OS:

| OS | Path |
|---|---|
| **Linux / WSL** | `~/.config/Code/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json` |
| **macOS** | `~/Library/Application Support/Code/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json` |

### Option 2: Manual configuration

Locate your Cline MCP settings file (see paths above) and add the `kiro-memory` server:

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

:::note
If the file or directory does not exist, create it. The Cline extension reads this file on startup to discover MCP servers.
:::

For faster startup times, install globally first:

```bash
npm install -g kiro-memory
```

Then reference the installed binary directly:

```json
{
  "mcpServers": {
    "kiro-memory": {
      "command": "kiro-memory",
      "args": ["mcp"]
    }
  }
}
```

## Verify the connection

1. Open VS Code and activate the Cline extension
2. Open the Cline MCP settings panel -- `kiro-memory` should appear as a connected server
3. Ask Cline to use a memory tool:

```
Search my memory for "refactoring"
```

Cline should call the `kiro-memory/search` tool and display results.

You can also open [http://localhost:3001](http://localhost:3001) to verify the worker is running.

## Hook support

Cline does not currently expose lifecycle hooks for automatic observation tracking like Claude Code or Cursor do. However, you can still get comprehensive memory coverage by:

1. **Using `save_memory` explicitly.** Ask Cline to save important observations:

```
Save a memory: we refactored the auth module to use JWT tokens with a 15-minute expiry.
```

2. **Using `store_knowledge` for decisions.** Ask Cline to record architectural choices:

```
Store a decision: chose PostgreSQL over SQLite for the production database because we need concurrent write support.
```

3. **Using `.clinerules` for automatic behavior.** Create a `.clinerules` file in your project root:

```
At the start of each task, search kiro-memory for relevant past context.
After completing a task, save a summary using the save_memory tool.
When making architectural decisions, store them using store_knowledge.
Always check for previous decisions before proposing changes.
```

This instructs Cline to interact with Kiro Memory tools proactively.

## Using the MCP tools

All 10 Kiro Memory tools are available to Cline. Here are the most useful patterns:

### Search for past work

```
Search my memory for "API endpoints" in the my-project project
```

### Get project context

```
Get the recent context for "my-project"
```

### Save learnings

```
Save a memory for project "my-project": the billing API uses Stripe webhooks for payment confirmation, endpoint is /api/webhooks/stripe
```

### Store structured knowledge

```
Store a constraint for "my-project": all API endpoints must validate input with Zod schemas before processing
```

### Resume a session

```
Resume my last session on "my-project"
```

### Semantic search

```
Use semantic search to find observations about "error handling patterns"
```

## Tips for effective use with Cline

1. **Create a `.clinerules` file.** This is the most impactful step. It tells Cline to search memory at the start of tasks and save context at the end. Without hooks, this manual prompting is how you maintain continuity.

2. **Save summaries at the end of tasks.** Before ending a session, ask Cline to save a summary of what was accomplished and what remains.

3. **Use `store_knowledge` for rules.** Constraints and decisions stored this way are boosted in search, making them easier to find later.

4. **Leverage semantic search.** When keyword search does not find what you need, try semantic search. It matches by meaning, so "authentication flow" can find observations about "OAuth token refresh."

5. **Check the dashboard.** Open [http://localhost:3001](http://localhost:3001) to browse and search your observations visually.

## Troubleshooting

**MCP server not visible in Cline:** Restart VS Code after editing the settings file. Verify the JSON is valid.

**Tools return "Worker unreachable":** The worker may not have started. Start it manually:

```bash
kiro-memory worker start
```

**Settings file not found:** The Cline extension must be installed and activated at least once before the `globalStorage` directory is created. Open VS Code, activate Cline, then retry the install.

**Permission errors on Linux/WSL:** Ensure the `globalStorage` directory is owned by your user:

```bash
ls -la ~/.config/Code/User/globalStorage/saoudrizwan.claude-dev/
```

If needed, fix ownership:

```bash
sudo chown -R $USER ~/.config/Code/User/globalStorage/saoudrizwan.claude-dev/
```
