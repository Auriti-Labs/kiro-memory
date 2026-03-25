---
title: CLI Commands
description: Complete reference for all totalrecall CLI commands with examples and flags.
---

The `totalrecall` CLI provides commands for setup, diagnostics, search, data management, and worker control.

## Installation

```bash
npm install -g totalrecall
```

The binary is available as `totalrecall` after global installation. With a local install, use `npx totalrecall`.

---

## setup

Interactive setup wizard for configuring hooks and starting the worker.

```bash
totalrecall setup [--editor <name>] [--force]
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
totalrecall setup
totalrecall setup --editor claude
totalrecall setup --editor kiro --force
```

---

## doctor

Diagnose the Total Recall installation and report any issues.

```bash
totalrecall doctor
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
[OK] Hooks installed in ~/.kiro/plugins/totalrecall/
[OK] Schema version: 11
[--] Embedding service: not available (install fastembed or @huggingface/transformers)
```

---

## search

Search your memory database from the command line.

```bash
totalrecall search <query> [--project <name>] [--type <type>] [--limit <n>]
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
totalrecall search "authentication"
totalrecall search "database migrations" --project my-api
totalrecall search "npm test" --type command --limit 5
totalrecall search "JWT" --json
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
totalrecall export [--project <name>] [--format <fmt>] [--days <n>] [--output <file>]
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
totalrecall export --format markdown --output memory.md
totalrecall export --project my-api --days 7 --output my-api-week.json
totalrecall export --format markdown > session-notes.md
```

---

## import

Import observations from a previously exported JSON file.

```bash
totalrecall import <file> [--project <name>] [--dry-run]
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
totalrecall import memory.json
totalrecall import memory.json --project new-project
totalrecall import memory.json --dry-run
```

---

## stats

Show statistics for a project or the entire database.

```bash
totalrecall stats [--project <name>] [--json]
```

**Options:**

| Flag | Description |
|------|-------------|
| `--project <name>` | Show stats for a specific project |
| `--json` | Output raw JSON |

**Example output:**

```
Total Recall Statistics

Total observations: 342
Total sessions:     28
Total summaries:    27

Observations by type:
  file-write   145  (42%)
  file-read     98  (29%)
  command       67  (20%)
  research      32   (9%)

Projects: my-api, totalrecall, calcfast (3 total)
Most active: my-api (145 observations)

Embeddings: 298/342 (87%)
```

---

## config

Manage configuration settings.

```bash
totalrecall config [get|set|list] [key] [value]
```

**Subcommands:**

```bash
totalrecall config list              # Show all current settings
totalrecall config get <key>         # Get a specific setting
totalrecall config set <key> <value> # Set a configuration value
```

**Example:**

```bash
totalrecall config list
totalrecall config get TOTALRECALL_WORKER_PORT
totalrecall config set TOTALRECALL_LOG_LEVEL DEBUG
```

---

## report

Generate an activity report for a project.

```bash
totalrecall report [--project <name>] [--period <period>] [--format <fmt>]
```

**Options:**

| Flag | Default | Description |
|------|---------|-------------|
| `--project <name>` | current git project | Project to report on |
| `--period <period>` | `weekly` | `weekly` (7 days) or `monthly` (30 days) |
| `--format <fmt>` | `text` | `text` or `markdown` |

**Examples:**

```bash
totalrecall report
totalrecall report --period monthly
totalrecall report --project my-api --format markdown > report.md
```

---

## Worker Commands

Control the background worker service.

### worker:start

```bash
totalrecall worker:start
```

Starts the worker in the background as a detached process. PID is saved to `~/.contextkit/worker.pid`.

### worker:stop

```bash
totalrecall worker:stop
```

Sends SIGTERM to the worker process.

### worker:restart

```bash
totalrecall worker:restart
```

Stops and restarts the worker.

### worker:status

```bash
totalrecall worker:status
```

Shows whether the worker is running, its PID, and the port it's listening on.

### worker:logs

```bash
totalrecall worker:logs
```

Shows the last 50 lines from the current day's log file (`~/.contextkit/logs/worker-YYYY-MM-DD.log`).

### worker:tail

```bash
totalrecall worker:tail
```

Follows the log file in real time (equivalent to `tail -f`).

---

## Global Flags

These flags work with most commands:

| Flag | Description |
|------|-------------|
| `--version` | Show the installed version |
| `--help` | Show help for the command |
| `--data-dir <path>` | Override `TOTALRECALL_DATA_DIR` for this command |
| `--port <n>` | Override `TOTALRECALL_WORKER_PORT` for this command |
