# MCP Tools

Total Recall exposes 10 tools via the Model Context Protocol (MCP). These tools allow any MCP-compatible AI assistant to read from and write to the persistent memory system. The MCP server is a lightweight proxy that delegates all operations to the worker HTTP service.

## Tool Reference

### search

The `search` tool performs full-text search across observations and summaries using FTS5 with BM25 scoring.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `query` | string | Yes | Text to search for in observations and summaries |
| `project` | string | No | Filter by project name |
| `type` | string | No | Filter by observation type: `file-write`, `command`, `research`, `tool-use`, `constraint`, `decision`, `heuristic`, `rejected` |
| `limit` | number | No | Maximum results (default: 20) |

**Example response:** Returns a formatted table of matching observations and summaries with ID, type, title, and date.

### semantic_search

The `semantic_search` tool performs hybrid search combining vector embeddings and keyword matching. It finds observations by meaning, not just exact words — searching for "authentication fix" also finds "OAuth token refresh".

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `query` | string | Yes | Natural language search query |
| `project` | string | No | Filter by project name |
| `limit` | number | No | Maximum results (default: 10) |

**Example response:** Returns results with relevance score percentage and source indicator (vector/fts5/hybrid).

### timeline

The `timeline` tool shows chronological context around a specific observation. Use it to understand what happened before and after a particular event.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `anchor` | number | Yes | Observation ID as the center point |
| `depth_before` | number | No | Number of observations before (default: 5) |
| `depth_after` | number | No | Number of observations after (default: 5) |

### get_observations

The `get_observations` tool retrieves full details of specific observations by their IDs. Use it after `search` to get complete content for relevant results.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `ids` | number[] | Yes | Array of observation IDs to retrieve |

**Example response:** Returns full observation details including type, project, date, content, narrative, concepts, and files.

### get_context

The `get_context` tool retrieves recent observations, summaries, and prompts for a project. This is the primary tool for session context injection.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `project` | string | Yes | Project name |

### store_knowledge

The `store_knowledge` tool saves structured knowledge: constraints (rules), decisions (architectural choices), heuristics (soft preferences), or rejected approaches (discarded solutions). Knowledge entries receive boosted ranking in search results.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `knowledge_type` | string | Yes | `constraint`, `decision`, `heuristic`, or `rejected` |
| `title` | string | Yes | Short descriptive title |
| `content` | string | Yes | Detailed content |
| `project` | string | Yes | Project name |
| `severity` | string | No | For constraints: `hard` or `soft` |
| `alternatives` | string[] | No | For decisions/rejected: alternatives considered |
| `reason` | string | No | For decisions/rejected: reasoning |
| `context` | string | No | For heuristics: when this preference applies |
| `confidence` | string | No | For heuristics: `high`, `medium`, or `low` |
| `concepts` | string[] | No | Related tags |
| `files` | string[] | No | Related file paths |

### resume_session

The `resume_session` tool retrieves checkpoint data from a previous session. Use it at the start of a new session to continue where you left off.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `project` | string | No | Project name (auto-detected if not provided) |
| `session_id` | number | No | Specific session ID (defaults to latest checkpoint) |

**Example response:** Returns task, progress, next steps, open questions, and relevant files from the checkpoint.

### save_memory

The `save_memory` tool stores a new observation manually. Use it to persist important information, learnings, decisions, or context to remember across sessions.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `project` | string | Yes | Project name |
| `title` | string | Yes | Short descriptive title |
| `content` | string | Yes | Full content to save |
| `type` | string | No | Observation type (default: `research`) |
| `concepts` | string[] | No | Related tags |

### generate_report

The `generate_report` tool generates an activity report with observations, sessions, learnings, completed tasks, and file hotspots for a time period.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `project` | string | No | Project name (auto-detected if not provided) |
| `period` | string | No | `weekly` (default) or `monthly` |

### embedding_stats

The `embedding_stats` tool shows statistics about the vector embedding index: total observations, how many have embeddings, coverage percentage, provider, and dimensions.

**Parameters:** None.

**Example response:** Returns total observations, embedded count, coverage percentage, provider name, dimensions, and availability status.

## Manual MCP Configuration

If you need to configure the MCP server manually (instead of using `totalrecall install`), add this to your editor's MCP configuration:

```json
{
  "mcpServers": {
    "totalrecall": {
      "command": "totalrecall",
      "args": ["mcp-server"]
    }
  }
}
```

### Configuration file locations by editor

| Editor | MCP Config Location |
|--------|-------------------|
| Claude Code | `.claude/mcp.json` or `~/.claude/mcp.json` |
| Cursor | `.cursor/mcp.json` |
| Windsurf | `~/.codeium/windsurf/mcp_config.json` |
| Cline | VS Code settings → Cline MCP configuration |

## How the MCP Server Works

The MCP server is a lightweight stdio-based proxy. It receives tool calls from the editor via the Model Context Protocol, translates them into HTTP requests to the worker service at `http://127.0.0.1:3001`, and returns formatted Markdown responses. The server itself is stateless — all data is managed by the worker.
