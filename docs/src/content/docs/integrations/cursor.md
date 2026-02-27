---
title: Cursor
description: Set up Kiro Memory with Cursor IDE for persistent cross-session memory with MCP tools and hooks.
---

Cursor supports both MCP servers and hooks, making it a strong option for Kiro Memory integration. The AI agent gets access to all memory tools, and hooks can automatically capture file edits, shell commands, and session events.

## Prerequisites

- **Node.js 18+** (check with `node --version`)
- **npm** (comes with Node.js)
- **Cursor** IDE installed ([cursor.com](https://cursor.com))

:::tip
On WSL, ensure you are using a native Linux Node.js. Run `which node` to verify the path does not start with `/mnt/c/`.
:::

## Installation

### Option 1: Automatic setup (recommended)

```bash
npm install -g kiro-memory
kiro-memory install --cursor
```

The installer will:

1. Run environment checks
2. Configure MCP server in `~/.cursor/mcp.json`
3. Set up hooks in `~/.cursor/hooks.json`
4. Create the data directory at `~/.contextkit/`

### Option 2: Manual configuration

**MCP Server** -- Create or edit `~/.cursor/mcp.json`:

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

For project-level configuration, create `.cursor/mcp.json` in your project root with the same structure.

:::note
When using `npx`, Node.js will download and run the latest version of `kiro-memory` if not installed globally. For faster startup, install globally first: `npm install -g kiro-memory`.
:::

**Hooks** -- Create or edit `~/.cursor/hooks.json`:

```json
{
  "version": 1,
  "hooks": {
    "sessionStart": [
      { "command": "npx kiro-memory hook agentSpawn" }
    ],
    "beforeSubmitPrompt": [
      { "command": "npx kiro-memory hook userPromptSubmit" }
    ],
    "afterFileEdit": [
      { "command": "npx kiro-memory hook postToolUse" }
    ],
    "afterShellExecution": [
      { "command": "npx kiro-memory hook postToolUse" }
    ],
    "afterMCPExecution": [
      { "command": "npx kiro-memory hook postToolUse" }
    ],
    "stop": [
      { "command": "npx kiro-memory hook stop" }
    ]
  }
}
```

:::caution
If you already have hooks configured in `hooks.json`, merge the Kiro Memory entries into the existing arrays for each event.
:::

## Verify the connection

1. Open Cursor and start a new AI chat session
2. Open the **MCP panel** in Cursor settings to confirm `kiro-memory` appears as a connected server
3. Ask the AI agent to use a memory tool:

```
Search my memory for "database schema"
```

The agent should call `kiro-memory/search` and return matching observations.

You can also verify the worker is running by opening [http://localhost:3001](http://localhost:3001) in your browser.

## Cursor hook events

Cursor fires the following hook events that Kiro Memory uses:

| Cursor event | Kiro Memory hook | What it captures |
|---|---|---|
| `sessionStart` | `agentSpawn` | Starts worker, injects previous context |
| `beforeSubmitPrompt` | `userPromptSubmit` | Records the user prompt |
| `afterFileEdit` | `postToolUse` | Captures file modifications |
| `afterShellExecution` | `postToolUse` | Captures terminal commands |
| `afterMCPExecution` | `postToolUse` | Captures MCP tool usage |
| `stop` | `stop` | Generates session summary |

## Using the MCP tools

All 10 Kiro Memory tools are available to the Cursor AI agent. Common usage patterns:

### Search previous sessions

```
Search my memory for "API authentication" in the my-app project
```

### Get recent project context

```
Get the context for my "my-app" project
```

### Save a decision

```
Store a decision: we chose Tailwind CSS over styled-components for consistency with the existing component library.
```

### Resume previous work

```
Resume my last session
```

### Generate a report

```
Generate a weekly activity report
```

## Tips for effective use with Cursor

1. **Use Cursor Rules for steering.** Add a `.cursorrules` file to your project with instructions to use Kiro Memory tools:

```
When starting a new task, check kiro-memory for previous context on this project.
When making architectural decisions, store them using the store_knowledge tool.
At the end of complex tasks, save a summary using save_memory.
```

2. **Leverage hooks for automatic tracking.** With hooks configured, file edits and shell commands are captured automatically. You do not need to ask the agent to save every change.

3. **Search before starting.** Begin complex tasks by asking the agent to search for related past work. This prevents re-discovering solutions.

4. **Store knowledge explicitly.** For important decisions, constraints, or patterns, ask the agent to use `store_knowledge`. This structured data is boosted in search rankings.

5. **Check the dashboard.** Browse [http://localhost:3001](http://localhost:3001) for a visual overview of observations, sessions, and search results.

## Troubleshooting

**MCP server not showing in Cursor:** Restart Cursor after editing `mcp.json`. Check that the file is valid JSON.

**Tools return "Worker unreachable":** Start the worker manually:

```bash
kiro-memory worker start
```

Or check its status:

```bash
kiro-memory doctor
```

**Hooks not firing:** Verify `~/.cursor/hooks.json` exists and has the correct structure. Cursor requires the `version: 1` field.

**Slow tool responses:** If using `npx` without a global install, the first call downloads the package. Install globally for instant startup:

```bash
npm install -g kiro-memory
```
