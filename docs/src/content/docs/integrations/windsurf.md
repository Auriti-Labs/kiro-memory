---
title: Windsurf
description: Set up Kiro Memory with Windsurf IDE for persistent cross-session memory via MCP tools.
---

[Windsurf](https://windsurf.com) (by Codeium) is an AI-powered IDE that supports MCP servers. Once connected, the Windsurf AI agent (Cascade) can search, save, and manage cross-session memory through Kiro Memory's MCP tools.

## Prerequisites

- **Node.js 18+** (check with `node --version`)
- **npm** (comes with Node.js)
- **Windsurf** IDE installed ([windsurf.com](https://windsurf.com))

:::tip
On WSL, ensure Node.js is installed natively inside WSL. Run `which node` to verify the path does not start with `/mnt/c/`.
:::

## Installation

### Option 1: Automatic setup (recommended)

```bash
npm install -g kiro-memory
kiro-memory install --windsurf
```

The installer will:

1. Run environment checks
2. Configure MCP server in `~/.codeium/windsurf/mcp_config.json`
3. Create the data directory at `~/.contextkit/`

### Option 2: Manual configuration

Create or edit `~/.codeium/windsurf/mcp_config.json`:

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
The configuration file path is `~/.codeium/windsurf/mcp_config.json`. This is Windsurf's global MCP configuration. Some older versions may use `~/.windsurf/mcp.json` -- check Windsurf's documentation for your version.
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

1. Open Windsurf and start a new Cascade session
2. Check the MCP section in Windsurf settings to confirm `kiro-memory` is listed
3. Ask Cascade to use a memory tool:

```
Search my memory for "database migration"
```

Cascade should call the `kiro-memory/search` tool and return matching observations.

You can also verify the worker at [http://localhost:3001](http://localhost:3001).

## Hook support

Windsurf does not currently support lifecycle hooks for automatic observation capture. This means file edits and commands are not tracked automatically. You can compensate by:

1. **Using `save_memory` to persist important context.** Ask Cascade to save summaries of completed work.
2. **Using `store_knowledge` for decisions.** Record architectural choices and constraints explicitly.
3. **Using a `.windsurfrules` file** to instruct Cascade to interact with Kiro Memory tools proactively.

### Setting up `.windsurfrules`

Create a `.windsurfrules` file in your project root:

```
When starting a new task, search kiro-memory for relevant past context on this project.
After completing a task, save a summary using the kiro-memory save_memory tool.
When making architectural decisions, store them using kiro-memory store_knowledge.
Before proposing changes, check if there are previous decisions or constraints stored in memory.
```

This guides Cascade to use memory tools throughout your session.

## Using the MCP tools

All 10 Kiro Memory tools are available to the Windsurf AI agent. Common patterns:

### Search previous sessions

```
Search my memory for "payment integration" in the my-app project
```

### Get recent project context

```
Get the context for "my-app"
```

### Save observations

```
Save a memory for "my-app": migrated from REST to GraphQL, all endpoints now use Apollo Server with type-safe resolvers
```

### Store decisions

```
Store a decision for "my-app": chose GraphQL over REST because the frontend needs flexible queries and we want to avoid over-fetching
```

### Resume a session

```
Resume my last session on "my-app"
```

### Semantic search

```
Use semantic search to find observations about "caching"
```

### Generate a report

```
Generate a weekly report for "my-app"
```

## Tips for effective use with Windsurf

1. **Create a `.windsurfrules` file.** This is essential for Windsurf since there are no automatic hooks. The rules file tells Cascade when to search and save memory.

2. **Save context at session boundaries.** Before ending a session, ask Cascade to save a summary:

```
Save a memory: completed the user settings page with form validation. Next: add email verification.
```

3. **Use structured knowledge for important decisions.** The `store_knowledge` tool supports types like `constraint`, `decision`, `heuristic`, and `rejected`. These are ranked higher in search results.

4. **Start with context.** Begin each session by asking Cascade to get the project context or resume the last session:

```
Resume my last session, then search for any decisions about the auth system
```

5. **Browse the dashboard.** Open [http://localhost:3001](http://localhost:3001) to see all your observations, sessions, and search results in one place.

## Troubleshooting

**MCP server not visible in Windsurf:** Restart Windsurf after editing the configuration file. Ensure the JSON is valid.

**Tools return "Worker unreachable":** The worker needs to be running. Start it manually:

```bash
kiro-memory worker start
```

Check the worker status:

```bash
kiro-memory doctor
```

**Configuration file location:** If `~/.codeium/windsurf/mcp_config.json` does not work, check Windsurf's settings UI for the correct MCP configuration path. The location may vary by Windsurf version and OS.

**Slow first response:** If using `npx` without a global install, the first tool call downloads the package. Install globally for instant startup:

```bash
npm install -g kiro-memory
```
