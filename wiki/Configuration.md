# Configuration

Total Recall is configured through environment variables and a local config file. All data is stored locally in the data directory — no cloud services or API keys required.

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `TOTALRECALL_DATA_DIR` | `~/.totalrecall` | Base directory for all Total Recall data |
| `TOTALRECALL_WORKER_HOST` | `127.0.0.1` | Worker service bind address |
| `TOTALRECALL_WORKER_PORT` | `3001` | Worker service port |
| `TOTALRECALL_LOG_LEVEL` | `INFO` | Log verbosity: `DEBUG`, `INFO`, `WARN`, `ERROR` |
| `TOTALRECALL_PROJECT` | *(auto-detected)* | Override project name (normally detected from git root) |

## Config File

Total Recall supports a local config file for persistent settings. Manage it with the `config` command:

```bash
totalrecall config list               # Show all settings
totalrecall config get worker.port    # Get a single value
totalrecall config set log.level DEBUG  # Set a value
```

## Data Directory Structure

All Total Recall data lives in a single directory (default `~/.totalrecall/`):

```
~/.totalrecall/
├── totalrecall.db       # SQLite database (observations, summaries, embeddings, sessions, knowledge)
├── worker.token         # Authentication token for the notify endpoint (auto-generated)
├── logs/                # Daily log files (totalrecall-YYYY-MM-DD.log)
├── archives/            # Archived/consolidated observations
└── backups/             # Automatic database backups (gzip compressed)
```

To change the data directory:

```bash
export TOTALRECALL_DATA_DIR=/path/to/custom/dir
```

## Worker Configuration

The worker is an Express.js HTTP server that handles observation ingestion, the web dashboard, MCP tool calls, and SSE events. It starts automatically when a session begins and binds to `127.0.0.1:3001` by default.

To change the port:

```bash
export TOTALRECALL_WORKER_PORT=3002
```

### Manual Worker Management

```bash
npm run worker:start     # Start the background worker
npm run worker:stop      # Stop the worker
npm run worker:restart   # Restart after code changes
npm run worker:status    # Check if worker is running
npm run worker:logs      # View recent logs (last 50 lines)
npm run worker:tail      # Follow live log output
```

## Logging

Log files are written to `~/.totalrecall/logs/` with daily rotation. Set the log level:

```bash
export TOTALRECALL_LOG_LEVEL=DEBUG
```

## Retention Policy

The `decay` command manages automatic cleanup of old observations:

```bash
totalrecall decay stats                 # Show decay statistics
totalrecall decay detect-stale          # Detect and mark stale observations
totalrecall decay consolidate --dry-run # Preview consolidation
totalrecall decay consolidate           # Execute consolidation
```

## Backup Configuration

Total Recall includes automatic backup with rotation and gzip compression:

```bash
totalrecall backup create    # Create a manual backup
totalrecall backup list      # List all backups with metadata
totalrecall backup restore <file>  # Restore from a backup
```

## Security Configuration

Total Recall runs locally only and implements multiple layers of protection:

- **Token Authentication**: Shared secret at `~/.totalrecall/worker.token` (auto-generated on first run)
- **Rate Limiting**: 200 req/min global, 60 req/min for the notify endpoint
- **Helmet**: Security headers with Content Security Policy
- **CORS**: Restricted to localhost origins only
- **Bind Address**: `127.0.0.1` only — not accessible from the network
- **Input Validation**: Type checking, length limits, and safe character patterns on all POST endpoints
- **SSE Connection Limit**: Maximum 50 concurrent clients
