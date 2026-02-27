---
title: Hooks
description: The four Kiro Memory hooks — what they capture, when they fire, and how they work.
---

Hooks are the primary data ingestion layer of Kiro Memory. They are small Node.js scripts that the Kiro CLI (or compatible editors) invoke at specific points in the session lifecycle.

## How Hooks Work

Hooks receive a JSON payload on **stdin** and write output to **stdout**. Exit code `0` means success; exit code `2` blocks the operation (used in `userPromptSubmit` to interrupt a prompt if needed).

```
stdin  → [JSON payload]
            ↓
       hook script
            ↓
stdout → [text output or JSON response]
```

For **agentSpawn**, stdout output is injected directly into the agent's context window.

## The Four Hooks

### 1. agentSpawn

**When it fires:** At the start of every agent session, before the user sends a prompt.

**What it does:**
1. Starts the background worker service (if not already running)
2. Detects the current project from `git rev-parse --show-toplevel`
3. Loads previous session context using `getSmartContext()`
4. Writes formatted context to stdout — this gets injected into the agent

**stdout output:**

```
## Previous Session Context — my-project

### Knowledge
- decision: Use SQLite WAL mode for concurrent reads

### Recent Activity
- Modified src/api/routes.ts — Added authentication middleware
- Ran npm test — 47 tests passed

> UI available at http://127.0.0.1:3001
```

**stdin payload:**

```json
{
  "session_id": "abc123",
  "cwd": "/home/user/my-project",
  "hook_event_name": "agentSpawn"
}
```

### 2. userPromptSubmit

**When it fires:** When the user submits a prompt to the AI assistant.

**What it does:**
1. Extracts the prompt text from the payload (handles multiple field name variations for compatibility with Cursor, Windsurf, etc.)
2. Redacts secrets (API keys, passwords, tokens) using pattern matching
3. Stores the prompt in the `prompts` table with a session ID and timestamp
4. Notifies the dashboard via SSE

**Special behavior for Cursor:** When `hook_event_name === 'beforeSubmitPrompt'`, the hook must respond with `{"continue": true}` on stdout to allow the prompt to proceed.

**stdin payload:**

```json
{
  "session_id": "abc123",
  "cwd": "/home/user/my-project",
  "hook_event_name": "userPromptSubmit",
  "prompt": "How do I add authentication to this API?",
  "user_prompt": "How do I add authentication to this API?"
}
```

### 3. postToolUse

**When it fires:** After every tool execution by the AI assistant.

**What it does:**
1. Normalizes the tool name across editors (Cursor uses `afterFileEdit`, `afterShellExecution`)
2. Ignores low-value tools (`thinking`, `todo`, `TodoWrite`)
3. Categorizes the tool use: `file-read`, `file-write`, `command`, `research`, `delegation`
4. Builds a human-readable observation with title, subtitle, narrative, and facts
5. Extracts concept tags from file paths and code content
6. Redacts secrets from all text fields
7. Stores the observation with content-based deduplication (SHA256 hash)
8. Triggers background embedding generation for semantic search

**Tool categories:**

| Tool Name | Category | Description |
|-----------|----------|-------------|
| `Write`, `Edit`, `fs_write` | `file-write` | File creation or modification |
| `Read`, `Glob`, `Grep` | `file-read` | File reading and searching |
| `Bash`, `execute_bash` | `command` | Shell command execution |
| `WebSearch`, `WebFetch` | `research` | Web searches and URL fetches |
| `Task`, `delegate` | `delegation` | Sub-agent task delegation |

**Deduplication windows by type:**

| Type | Window | Reason |
|------|--------|--------|
| `file-read` | 60 seconds | Same file read repeatedly |
| `file-write` | 10 seconds | Rapid consecutive writes |
| `command` | 30 seconds | Standard |
| `research` | 120 seconds | Repeated searches |
| `delegation` | 60 seconds | Rapid delegations |

**stdin payload:**

```json
{
  "session_id": "abc123",
  "cwd": "/home/user/my-project",
  "hook_event_name": "postToolUse",
  "tool_name": "Write",
  "tool_input": {
    "path": "/home/user/my-project/src/auth.ts",
    "content": "..."
  },
  "tool_response": {
    "success": true
  }
}
```

### 4. stop

**When it fires:** When the agent completes its response at the end of a session.

**What it does:**
1. Retrieves all observations from the current session (by `started_at_epoch`)
2. Groups observations by type: files read, files written, commands, research
3. Generates a structured session summary with 5 sections: `request`, `investigated`, `completed`, `learned`, `next_steps`
4. Stores the summary in the `summaries` table
5. Creates a checkpoint for session resume (task, progress, next steps, relevant files)
6. Marks the session as `completed`

**Generated summary structure:**

```json
{
  "request": "my-project — 3 files modified — 2025-03-15",
  "investigated": "Read src/auth.ts; Researched JWT documentation",
  "completed": "Modified src/auth.ts; Modified src/routes.ts; Ran npm test",
  "learned": "JWT tokens should be validated on every request",
  "next_steps": "Files modified: src/auth.ts, src/routes.ts. Concepts: security, api"
}
```

**stdin payload:**

```json
{
  "session_id": "abc123",
  "cwd": "/home/user/my-project",
  "hook_event_name": "stop"
}
```

## Concept Tag Extraction

The `postToolUse` hook automatically extracts up to 5 concept tags per observation by analyzing:

- **File paths**: `hooks/` → `hooks`, `test/` → `testing`, `api/` → `api`, etc.
- **Shell commands**: `npm test` → `testing`, `git` → `git`, `docker` → `devops`
- **Search patterns**: `error` → `debugging`, `import` → `module-system`
- **Code content**: React hooks → `hooks`, SQL keywords → `database`, `async/await` → `api`

These tags appear in the `concepts` column and are indexed by FTS5 for fast retrieval.

## Hook Configuration Files

Hook configuration is stored in `~/.kiro/plugins/kiro-memory/` (Kiro CLI) or in the editor-specific config directory. The `kiro-memory setup` command installs these automatically.

## Testing Hooks Manually

You can test a hook by piping JSON to it:

```bash
echo '{"session_id":"test","cwd":"/home/user/my-project"}' | \
  node ~/.kiro/plugins/kiro-memory/agentSpawn.js
```

Or using the CLI:

```bash
kiro-memory doctor  # checks all hooks are installed and executable
```
