---
title: CLI Commands
description: Complete reference for all kiro-memory CLI commands with examples and flags.
---

The `kiro-memory` CLI provides commands for setup, diagnostics, search, data management, and worker control.

## Installation

```bash
npm install -g kiro-memory
```

The binary is available as `kiro-memory` after global installation. With a local install, use `npx kiro-memory`.

---

## setup

Interactive setup wizard for configuring hooks and starting the worker.

```bash
kiro-memory setup [--editor <name>] [--force]
```

**Options:**

| Flag | Description |
|------|-------------|
| `--editor <name>` | Target editor (`kiro`, `claude`, `cursor`, `windsurf`, `cline`) |
| `--force` | Overwrite existing hook files |

**What it does:**
1. Detects your editor if `--editor` is not specified
2. Installs hook files in the appropriate directory
3. Starts the background worker
4. Verifies the database is initialized

**Example:**

```bash
kiro-memory setup
kiro-memory setup --editor claude
kiro-memory setup --editor kiro --force
```

---

## doctor

Diagnose the Kiro Memory installation and report any issues.

```bash
kiro-memory doctor
```

**Checks performed:**
- Worker process is running on the configured port
- Database file exists and is readable
- Hook files are installed and executable
- Schema version is current
- Optional: embedding service availability

**Example output:**

```
[OK] Worker running at http://127.0.0.1:3001
[OK] Database found at ~/.contextkit/contextkit.db
[OK] Hooks installed in ~/.kiro/plugins/kiro-memory/
[OK] Schema version: 11
[--] Embedding service: not available (install fastembed or @huggingface/transformers)
```

---

## search

Search your memory database from the command line.

```bash
kiro-memory search <query> [--project <name>] [--type <type>] [--limit <n>]
```

**Arguments:**

| Argument | Description |
|----------|-------------|
| `query` | Search query (required) |

**Options:**

| Flag | Default | Description |
|------|---------|-------------|
| `--project <name>` | all | Filter by project name |
| `--type <type>` | all | Filter by observation type |
| `--limit <n>` | `10` | Maximum results to show |
| `--json` | — | Output raw JSON instead of formatted text |

**Examples:**

```bash
kiro-memory search "authentication"
kiro-memory search "database migrations" --project my-api
kiro-memory search "npm test" --type command --limit 5
kiro-memory search "JWT" --json
```

**Example output:**

```
Search results for "authentication" (3 found)

[file-write] Modified auth.ts
  Project: my-api | 2025-03-15
  Added JWT verification middleware to Express routes

[decision] Use JWT for API authentication
  Project: my-api | 2025-03-14
  JWT provides stateless authentication suitable for our REST API

[command] npm test
  Project: my-api | 2025-03-15
  Ran npm test — output: 47 tests passed (success)
```

---

## export

Export memory data to a file.

```bash
kiro-memory export [--project <name>] [--format <fmt>] [--days <n>] [--output <file>]
```

**Options:**

| Flag | Default | Description |
|------|---------|-------------|
| `--project <name>` | all | Filter by project |
| `--format <fmt>` | `json` | Output format: `json`, `markdown` |
| `--days <n>` | `30` | Days back to export |
| `--output <file>` | stdout | Write to file instead of stdout |

**Examples:**

```bash
kiro-memory export --format markdown --output memory.md
kiro-memory export --project my-api --days 7 --output my-api-week.json
kiro-memory export --format markdown > session-notes.md
```

---

## import

Import observations from a previously exported JSON file.

```bash
kiro-memory import <file> [--project <name>] [--dry-run]
```

**Arguments:**

| Argument | Description |
|----------|-------------|
| `file` | Path to the JSON export file |

**Options:**

| Flag | Description |
|------|-------------|
| `--project <name>` | Override the project name for all imported observations |
| `--dry-run` | Parse and validate without writing to the database |

**Examples:**

```bash
kiro-memory import memory.json
kiro-memory import memory.json --project new-project
kiro-memory import memory.json --dry-run
```

---

## stats

Show statistics for a project or the entire database.

```bash
kiro-memory stats [--project <name>] [--json]
```

**Options:**

| Flag | Description |
|------|-------------|
| `--project <name>` | Show stats for a specific project |
| `--json` | Output raw JSON |

**Example output:**

```
Kiro Memory Statistics

Total observations: 342
Total sessions:     28
Total summaries:    27

Observations by type:
  file-write   145  (42%)
  file-read     98  (29%)
  command       67  (20%)
  research      32   (9%)

Projects: my-api, kiro-memory, calcfast (3 total)
Most active: my-api (145 observations)

Embeddings: 298/342 (87%)
```

---

## config

Manage configuration settings.

```bash
kiro-memory config [get|set|list] [key] [value]
```

**Subcommands:**

```bash
kiro-memory config list              # Show all current settings
kiro-memory config get <key>         # Get a specific setting
kiro-memory config set <key> <value> # Set a configuration value
```

**Example:**

```bash
kiro-memory config list
kiro-memory config get KIRO_MEMORY_WORKER_PORT
kiro-memory config set KIRO_MEMORY_LOG_LEVEL DEBUG
```

---

## report

Generate an activity report for a project.

```bash
kiro-memory report [--project <name>] [--period <period>] [--format <fmt>]
```

**Options:**

| Flag | Default | Description |
|------|---------|-------------|
| `--project <name>` | current git project | Project to report on |
| `--period <period>` | `weekly` | `weekly` (7 days) or `monthly` (30 days) |
| `--format <fmt>` | `text` | `text` or `markdown` |

**Examples:**

```bash
kiro-memory report
kiro-memory report --period monthly
kiro-memory report --project my-api --format markdown > report.md
```

---

## Worker Commands

Control the background worker service.

### worker:start

```bash
kiro-memory worker:start
```

Starts the worker in the background as a detached process. PID is saved to `~/.contextkit/worker.pid`.

### worker:stop

```bash
kiro-memory worker:stop
```

Sends SIGTERM to the worker process.

### worker:restart

```bash
kiro-memory worker:restart
```

Stops and restarts the worker.

### worker:status

```bash
kiro-memory worker:status
```

Shows whether the worker is running, its PID, and the port it's listening on.

### worker:logs

```bash
kiro-memory worker:logs
```

Shows the last 50 lines from the current day's log file (`~/.contextkit/logs/worker-YYYY-MM-DD.log`).

### worker:tail

```bash
kiro-memory worker:tail
```

Follows the log file in real time (equivalent to `tail -f`).

---

## Global Flags

These flags work with most commands:

| Flag | Description |
|------|-------------|
| `--version` | Show the installed version |
| `--help` | Show help for the command |
| `--data-dir <path>` | Override `KIRO_MEMORY_DATA_DIR` for this command |
| `--port <n>` | Override `KIRO_MEMORY_WORKER_PORT` for this command |
