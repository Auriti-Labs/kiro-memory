---
title: Environment Variables
description: Complete reference for all Kiro Memory environment variables with defaults and descriptions.
---

All Kiro Memory configuration is done through environment variables. No configuration file is required — the defaults work out of the box for most setups.

## Core Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `KIRO_MEMORY_DATA_DIR` | `~/.contextkit` | Base data directory. Contains the SQLite database, PID file, auth token, and log directory. Created automatically if it doesn't exist. |
| `KIRO_MEMORY_WORKER_HOST` | `127.0.0.1` | IP address the worker HTTP server binds to. Use `0.0.0.0` to expose on the local network (not recommended without additional authentication). |
| `KIRO_MEMORY_WORKER_PORT` | `3001` | TCP port for the worker HTTP server and web dashboard. Change if port 3001 is already in use. |
| `KIRO_MEMORY_LOG_LEVEL` | `INFO` | Controls verbosity of worker log output. Values: `DEBUG`, `INFO`, `WARN`, `ERROR`. |

## Search and AI Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `KIRO_MEMORY_CONTEXT_TOKENS` | `2000` | Token budget for context injection in the `agentSpawn` hook. Higher values include more context but consume more of the agent's context window. Uses 4 chars ≈ 1 token estimate. |
| `KIRO_MEMORY_EMBEDDING_MODEL` | auto | Embedding model identifier. When using `@huggingface/transformers`, set to a model ID (e.g., `Xenova/all-MiniLM-L6-v2`). With `fastembed`, model is selected automatically. |
| `KIRO_MEMORY_SUMMARY_PROVIDER` | `local` | Summary generation provider. Currently only `local` (rule-based) is supported. LLM-based summarization is planned for a future release. |

## Kiro CLI Integration Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `KIRO_CONFIG_DIR` | `~/.kiro` | Kiro CLI configuration directory. Used by the setup wizard and sync scripts to find the correct plugin installation path. |

## Deprecated Variables

These variables still work but are deprecated and will be removed in v3:

| Variable | Replaced By | Notes |
|----------|-------------|-------|
| `CONTEXTKIT_WORKER_HOST` | `KIRO_MEMORY_WORKER_HOST` | From the original ContextKit name |
| `CONTEXTKIT_WORKER_PORT` | `KIRO_MEMORY_WORKER_PORT` | From the original ContextKit name |

## File Paths

All paths are derived from `KIRO_MEMORY_DATA_DIR` (`~/.contextkit` by default):

| File | Path | Description |
|------|------|-------------|
| Database | `$DATA_DIR/contextkit.db` | SQLite database (WAL mode) |
| PID file | `$DATA_DIR/worker.pid` | Worker process ID |
| Auth token | `$DATA_DIR/worker.token` | Random 32-byte hex token (chmod 600) |
| Log directory | `$DATA_DIR/logs/` | Daily log files |
| Log file | `$DATA_DIR/logs/worker-YYYY-MM-DD.log` | Worker log for the current day |

## Setting Variables

### Shell profile (persistent)

```bash
# ~/.bashrc or ~/.zshrc
export KIRO_MEMORY_DATA_DIR="$HOME/.contextkit"
export KIRO_MEMORY_WORKER_PORT="3001"
export KIRO_MEMORY_LOG_LEVEL="INFO"
export KIRO_MEMORY_CONTEXT_TOKENS="3000"
```

### Per-command override

```bash
KIRO_MEMORY_WORKER_PORT=3002 kiro-memory worker:start
KIRO_MEMORY_LOG_LEVEL=DEBUG kiro-memory doctor
```

### In a `.env` file

Kiro Memory does not auto-load `.env` files. Source them explicitly:

```bash
# .env
KIRO_MEMORY_CONTEXT_TOKENS=5000
KIRO_MEMORY_LOG_LEVEL=DEBUG
```

```bash
source .env && kiro-memory worker:restart
```

## Recommended Settings by Use Case

### Minimal footprint (low resource usage)

```bash
KIRO_MEMORY_CONTEXT_TOKENS=1000
KIRO_MEMORY_LOG_LEVEL=WARN
```

### Standard setup

```bash
KIRO_MEMORY_CONTEXT_TOKENS=2000
KIRO_MEMORY_LOG_LEVEL=INFO
```

### Rich context (large context window models)

```bash
KIRO_MEMORY_CONTEXT_TOKENS=8000
KIRO_MEMORY_LOG_LEVEL=INFO
```

### Debugging

```bash
KIRO_MEMORY_LOG_LEVEL=DEBUG
```

This outputs detailed logs including embedding generation, search scoring, deduplication decisions, and worker request/response details.

### Custom data directory

```bash
KIRO_MEMORY_DATA_DIR=/data/my-ai-memory
```

Useful when your home directory has limited space or you want to keep the database on a faster drive.
