---
title: MCP Server
description: Using Kiro Memory as a Model Context Protocol server — tools, configuration, and examples.
---

Kiro Memory includes a built-in **Model Context Protocol (MCP)** server that exposes your memory database as tools to any MCP-compatible AI assistant.

## Overview

The MCP server uses **stdio transport** — your editor spawns it as a subprocess and communicates via JSON-RPC over stdin/stdout. It exposes 4 tools:

| Tool | Description |
|------|-------------|
| `search` | Full-text and semantic search over observations and summaries |
| `timeline` | Get chronological context around a specific observation |
| `get_observations` | Retrieve full details of observations by ID |
| `get_context` | Get the most relevant recent context for a project |

## Starting the MCP Server

The MCP server binary is included in the npm package:

```bash
# Direct invocation
node node_modules/kiro-memory/plugin/dist/servers/mcp-server.js

# Or if installed globally
kiro-memory mcp
```

## Editor Configuration

### Claude Code

Add to your Claude Code MCP configuration (`.claude/mcp.json` or global settings):

```json
{
  "mcpServers": {
    "kiro-memory": {
      "command": "node",
      "args": ["/path/to/node_modules/kiro-memory/plugin/dist/servers/mcp-server.js"],
      "env": {
        "KIRO_MEMORY_DATA_DIR": "/home/user/.contextkit"
      }
    }
  }
}
```

### Cursor

Add to `.cursor/mcp.json`:

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

### Windsurf / Cline / Other MCP Editors

The configuration format is standard MCP:

```json
{
  "name": "kiro-memory",
  "command": "node",
  "args": ["~/.npm/bin/kiro-memory", "mcp"],
  "transport": "stdio"
}
```

## Tool Reference

### `search`

Search for observations and summaries using a text query.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `query` | string | Yes | Search query (supports FTS5 operators and natural language) |
| `project` | string | No | Filter by project name |
| `limit` | number | No | Maximum results (default: 10, max: 50) |

**Example:**

```json
{
  "name": "search",
  "arguments": {
    "query": "authentication middleware",
    "project": "my-api",
    "limit": 5
  }
}
```

**Response:**

```json
{
  "observations": [
    {
      "id": 142,
      "type": "file-write",
      "title": "Modified auth.ts",
      "narrative": "Added JWT verification middleware to Express routes",
      "project": "my-api",
      "created_at": "2025-03-15T14:30:00.000Z",
      "concepts": "security, api, middleware"
    }
  ],
  "summaries": [
    {
      "id": 23,
      "request": "my-api — authentication implementation",
      "completed": "Modified auth.ts, Modified routes.ts",
      "created_at": "2025-03-15T18:00:00.000Z"
    }
  ]
}
```

### `timeline`

Get chronological context around a specific observation by ID.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `anchor_id` | number | Yes | ID of the anchor observation |
| `depth_before` | number | No | Number of observations before the anchor (default: 5) |
| `depth_after` | number | No | Number of observations after the anchor (default: 5) |

**Example:**

```json
{
  "name": "timeline",
  "arguments": {
    "anchor_id": 142,
    "depth_before": 3,
    "depth_after": 3
  }
}
```

**Response:**

```json
{
  "timeline": [
    { "id": 139, "type": "file-read", "title": "auth.ts", "position": -3 },
    { "id": 140, "type": "command", "title": "npm test", "position": -2 },
    { "id": 141, "type": "file-read", "title": "routes.ts", "position": -1 },
    { "id": 142, "type": "file-write", "title": "Modified auth.ts", "position": 0 },
    { "id": 143, "type": "file-write", "title": "Modified routes.ts", "position": 1 }
  ]
}
```

### `get_observations`

Retrieve full details for one or more observations by their IDs.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `ids` | number[] | Yes | Array of observation IDs (max 50) |

**Example:**

```json
{
  "name": "get_observations",
  "arguments": {
    "ids": [139, 140, 141, 142]
  }
}
```

**Response:**

```json
{
  "observations": [
    {
      "id": 142,
      "type": "file-write",
      "title": "Modified auth.ts",
      "subtitle": "edit src/auth.ts",
      "text": "Input: {\"path\": \"src/auth.ts\"}",
      "narrative": "Modified auth.ts at src/auth.ts — updating 45 lines",
      "facts": "src/auth.ts",
      "concepts": "security, api",
      "files_modified": "src/auth.ts",
      "project": "my-api",
      "created_at": "2025-03-15T14:30:00.000Z",
      "created_at_epoch": 1742043000000
    }
  ]
}
```

### `get_context`

Get a curated context package for a project — recent observations, summaries, and the latest checkpoint.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `project` | string | Yes | Project name (usually the git repository name) |
| `token_budget` | number | No | Token budget for context (default: 2000) |
| `query` | string | No | Optional query to score context by relevance |

**Example:**

```json
{
  "name": "get_context",
  "arguments": {
    "project": "my-api",
    "token_budget": 3000,
    "query": "authentication"
  }
}
```

**Response:**

```json
{
  "project": "my-api",
  "items": [
    {
      "id": 142,
      "title": "Modified auth.ts",
      "content": "Added JWT verification middleware",
      "type": "file-write",
      "score": 0.87,
      "signals": {
        "semantic": 0.72,
        "fts5": 0.85,
        "recency": 0.9,
        "projectMatch": 1.0
      }
    }
  ],
  "summaries": [...],
  "tokenBudget": 3000,
  "tokensUsed": 1847
}
```

## How Context Scoring Works

The `get_context` tool ranks observations using a 4-signal composite score:

1. **Semantic similarity** (if embeddings available): cosine similarity to the query vector
2. **FTS5 relevance**: SQLite full-text search BM25 score
3. **Recency**: exponential decay from the current timestamp (half-life: ~7 days)
4. **Project match**: 1.0 for same project, 0.5 for other projects

Knowledge items (`constraint`, `decision`, `heuristic`, `rejected`) receive a priority boost and always appear at the top of results.
