---
title: Quick Start
description: From install to your first session with persistent memory in under 5 minutes.
---

This guide walks you through a complete setup from zero to your first session with persistent memory.

## Step 1: Install Kiro Memory

```bash
npm install -g kiro-memory
```

## Step 2: Run the Setup Wizard

```bash
kiro-memory setup
```

Follow the interactive prompts. The wizard detects your editor and installs hooks automatically.

## Step 3: Verify the Worker is Running

```bash
kiro-memory doctor
```

You should see:

```
[OK] Worker running at http://127.0.0.1:3001
[OK] Database found at ~/.contextkit/contextkit.db
[OK] Hooks installed
```

You can also open the dashboard in your browser: [http://localhost:3001](http://localhost:3001)

## Step 4: Start Your First Session

Open your AI coding assistant in a project directory. Kiro Memory automatically:

1. Injects any previous context from that project at session start
2. Starts recording your prompts, file reads, and file writes
3. Generates a session summary when you close the session

On the very first session there is nothing to inject — this is expected. After you complete a session, the next one will have context.

## Step 5: Search Your Memory

After a few sessions, try the search command:

```bash
kiro-memory search "authentication"
```

This returns relevant observations from all your sessions that match the query.

## Step 6: Open the Dashboard

Visit [http://localhost:3001](http://localhost:3001) to see:

- All observations recorded across sessions
- Session summaries
- Search interface
- Project breakdown
- Activity timeline

## What Gets Recorded

| Event | What is stored |
|-------|---------------|
| File read | Filename, path, extracted concepts |
| File write / edit | Filename, path, change description |
| Shell command | Command, description, output summary |
| Web search | Query string |
| Web fetch | URL, domain |
| Task delegation | Sub-agent type, task description |
| User prompt | Prompt text (secrets redacted) |
| Session end | Summary of all session activity |

## Example: Context Injection

When you start a new session after working on a project, the `agentSpawn` hook injects context like this into the agent's context window:

```
## Previous Session Context — my-project

### Knowledge
- decision: Use SQLite WAL mode for concurrent reads
- constraint: All API endpoints must validate project name format

### Recent Activity
- Modified: src/api/routes.ts — Added authentication middleware
- Modified: src/database/schema.ts — Added indexes for project queries
- Ran: npm test — All 47 tests passed

### Session Summary (2025-03-15)
- Investigated: database schema, authentication flow
- Completed: 3 files modified, 2 commands run
- Next: Continue with rate limiting implementation

> UI available at http://127.0.0.1:3001
```

## Next Steps

- Read the [Configuration guide](/kiro-memory/getting-started/configuration) to customize behavior
- Learn about [Hooks](/kiro-memory/guides/hooks) to understand what gets captured
- Explore the [SDK](/kiro-memory/guides/sdk) if you want programmatic access
- Set up the [MCP Server](/kiro-memory/guides/mcp-server) for non-Kiro editors
