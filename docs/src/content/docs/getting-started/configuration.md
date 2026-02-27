---
title: Configuration
description: All environment variables, config.json settings, and tuning options for Kiro Memory.
---

Kiro Memory is configured through environment variables. There is no required configuration file — sane defaults work out of the box.

## Environment Variables

### Core Settings

| Variable | Default | Description |
|----------|---------|-------------|
| `KIRO_MEMORY_DATA_DIR` | `~/.contextkit` | Base data directory for the SQLite database, PID file, logs, and token file |
| `KIRO_MEMORY_WORKER_HOST` | `127.0.0.1` | Address the worker HTTP server binds to. Use `0.0.0.0` to expose on the network (not recommended) |
| `KIRO_MEMORY_WORKER_PORT` | `3001` | TCP port for the worker HTTP server and web dashboard |
| `KIRO_MEMORY_LOG_LEVEL` | `INFO` | Log verbosity: `DEBUG`, `INFO`, `WARN`, or `ERROR` |

### Search and Embeddings

| Variable | Default | Description |
|----------|---------|-------------|
| `KIRO_MEMORY_EMBEDDING_MODEL` | auto-detected | Embedding model to use. When using `@huggingface/transformers`, set to a model ID like `Xenova/all-MiniLM-L6-v2` |
| `KIRO_MEMORY_CONTEXT_TOKENS` | `2000` | Token budget for context injection in `agentSpawn`. Larger values include more context but use more of the agent's context window |

### Legacy / Compatibility

| Variable | Replaces | Notes |
|----------|---------|-------|
| `CONTEXTKIT_WORKER_HOST` | `KIRO_MEMORY_WORKER_HOST` | Deprecated — will be removed in v3 |
| `CONTEXTKIT_WORKER_PORT` | `KIRO_MEMORY_WORKER_PORT` | Deprecated — will be removed in v3 |

## Setting Environment Variables

### Shell profile (persistent)

Add to your `~/.bashrc`, `~/.zshrc`, or equivalent:

```bash
export KIRO_MEMORY_DATA_DIR="$HOME/.contextkit"
export KIRO_MEMORY_WORKER_PORT="3001"
export KIRO_MEMORY_LOG_LEVEL="INFO"
export KIRO_MEMORY_CONTEXT_TOKENS="3000"
```

### Per-session

```bash
KIRO_MEMORY_CONTEXT_TOKENS=5000 kiro-memory worker:start
```

### In a `.env` file (project-level)

Kiro Memory does not automatically read `.env` files, but you can source one before starting the worker:

```bash
source .env && kiro-memory worker:start
```

## Changing the Data Directory

By default, all data is stored in `~/.contextkit/`. To change this:

```bash
export KIRO_MEMORY_DATA_DIR="/data/my-ai-memory"
kiro-memory setup
```

The directory will be created automatically if it does not exist.

## Token Budget

The `KIRO_MEMORY_CONTEXT_TOKENS` variable controls how much context gets injected at session start. The system uses a 4-character-per-token estimate:

```
discoveryTokens = ceil(content.length / 4)
```

Items are scored by recency, project relevance, and semantic similarity. The highest-scoring items are included until the budget is exhausted. Knowledge items (constraints, decisions, heuristics) always get priority.

Recommended values:

| Context window | Suggested `KIRO_MEMORY_CONTEXT_TOKENS` |
|---------------|----------------------------------------|
| 8K tokens | 1000 |
| 32K tokens | 3000 |
| 128K tokens | 8000 |
| 200K+ tokens | 15000 |

## Changing the Worker Port

If port 3001 is already in use:

```bash
export KIRO_MEMORY_WORKER_PORT=3002
kiro-memory worker:restart
```

The dashboard will be available at [http://localhost:3002](http://localhost:3002).

## Log Levels

```bash
# Minimal output (production)
export KIRO_MEMORY_LOG_LEVEL=WARN

# Normal output
export KIRO_MEMORY_LOG_LEVEL=INFO

# Verbose output (debugging)
export KIRO_MEMORY_LOG_LEVEL=DEBUG
```

Log files are written to `~/.contextkit/logs/worker-YYYY-MM-DD.log`.

View logs:

```bash
kiro-memory worker:logs   # last 50 lines
kiro-memory worker:tail   # follow live
```

## Embedding Models

When semantic search is enabled, the model is auto-detected based on the installed package:

- **fastembed** (if installed): uses `all-MiniLM-L6-v2` — fast, 384 dimensions
- **@huggingface/transformers** (if installed): defaults to `Xenova/all-MiniLM-L6-v2`

To use a different HuggingFace model:

```bash
export KIRO_MEMORY_EMBEDDING_MODEL="Xenova/all-mpnet-base-v2"
```

Note: changing the model after embeddings have been generated will cause a mismatch — run `kiro-memory backfill-embeddings` to regenerate.

## Security Considerations

- The worker binds to `127.0.0.1` by default — it is only accessible locally
- A random authentication token is generated on each worker start and saved to `~/.contextkit/worker.token` (permissions: 600)
- Hooks authenticate with the worker using this token via the `X-Worker-Token` header
- The `/api/notify`, `/api/embeddings/backfill`, and `/api/retention/cleanup` endpoints require this token
- Secrets in prompts and observations are automatically redacted before storage
