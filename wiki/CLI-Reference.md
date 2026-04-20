# CLI Reference

The `totalrecall` command-line interface provides full access to the Total Recall memory system. All commands operate on the local SQLite database at `~/.totalrecall/totalrecall.db`.

```bash
totalrecall <command> [options]
```

## Setup Commands

### install

The `install` command configures Total Recall for your editor by creating hooks, rules files, and MCP server configuration.

```bash
totalrecall install              # Auto-detect editor
totalrecall install --claude-code  # Claude Code (hooks + MCP)
totalrecall install --cursor       # Cursor (rules + MCP)
totalrecall install --windsurf     # Windsurf (rules + MCP)
totalrecall install --cline        # Cline (instructions + MCP)
```

### doctor

The `doctor` command runs environment diagnostics: Node.js version, build tools, WSL detection, database access, worker status, and embedding support.

```bash
totalrecall doctor        # Run diagnostics
totalrecall doctor --fix  # Auto-repair: rebuild FTS5, remove orphaned embeddings, VACUUM
```

### service

The `service` command manages worker auto-start on boot using crontab or systemd.

```bash
totalrecall service install    # Register auto-start
totalrecall service uninstall  # Remove auto-start
totalrecall service status     # Show auto-start status
```

## Context & Session Commands

### context / ctx

The `context` command displays the current project context including recent observations, summaries, and prompts.

```bash
totalrecall context
totalrecall ctx
```

### resume

The `resume` command retrieves the last session checkpoint for the current project, showing task, progress, next steps, and relevant files.

```bash
totalrecall resume            # Resume latest session
totalrecall resume 42         # Resume specific session by ID
```

### stats

The `stats` command shows a quick database overview: total observations, summaries, sessions, database size, active project, and embedding coverage.

```bash
totalrecall stats
```

## Search Commands

### search

The `search` command performs full-text search (FTS5 with BM25 scoring) across all observations and summaries.

```bash
totalrecall search "authentication flow"
totalrecall search "database migration" --project=my-app
totalrecall search --interactive              # Interactive REPL with result selection
totalrecall search --interactive --project myapp
```

### semantic-search / sem

The `semantic-search` command performs hybrid search combining vector embeddings and keyword matching for semantic similarity.

```bash
totalrecall semantic-search "OAuth token refresh"
totalrecall sem "how did I fix the auth bug"
```

## Observation & Summary Commands

### observations / obs

The `observations` command shows recent observations, newest first.

```bash
totalrecall observations       # Default: 10 most recent
totalrecall obs 20             # Show 20 most recent
```

### summaries / sum

The `summaries` command shows recent session summaries.

```bash
totalrecall summaries          # Default: 5 most recent
totalrecall sum 10             # Show 10 most recent
```

### add-observation / add-obs

The `add-observation` command manually stores a new observation.

```bash
totalrecall add-observation "Auth fix" "Fixed OAuth flow with 5-min token buffer"
```

### add-summary / add-sum

The `add-summary` command manually stores a session summary.

```bash
totalrecall add-summary "Implemented user authentication with OAuth2 and JWT"
```

### add-knowledge / add-k

The `add-knowledge` command stores structured knowledge with type-specific metadata.

```bash
# Store a decision
totalrecall add-knowledge decision "Use PostgreSQL" "ACID compliance for transactions" \
  --alternatives=MongoDB,DynamoDB

# Store a constraint
totalrecall add-knowledge constraint "No any in TypeScript" "Never use any type" \
  --severity=hard

# Store a heuristic
totalrecall add-knowledge heuristic "Prefer composition" "More flexible than inheritance" \
  --confidence=high

# Store a rejected approach
totalrecall add-knowledge rejected "MongoDB" "Lacks ACID compliance" \
  --reason="Need strong consistency"
```

**Knowledge types:** `constraint`, `decision`, `heuristic`, `rejected`

**Options:**
- `--severity=hard|soft` — For constraints
- `--alternatives=a,b,c` — For decisions/rejected
- `--reason=...` — For decisions/rejected
- `--context=...` — For heuristics
- `--confidence=high|medium|low` — For heuristics
- `--concepts=a,b` — Tags
- `--files=path1,path2` — Related files

## Report & Analytics Commands

### report

The `report` command generates an activity report for the current or specified project.

```bash
totalrecall report
totalrecall report --period=weekly --format=md --output=report.md
totalrecall report --period=monthly --format=json
```

**Options:**
- `--period=weekly|monthly` — Time period (default: weekly)
- `--format=text|md|json` — Output format (default: text)
- `--output=<file>` — Write to file instead of stdout

## Embedding Commands

### embeddings

The `embeddings` command manages the vector embedding index used for semantic search.

```bash
totalrecall embeddings stats           # Show embedding statistics
totalrecall embeddings backfill 100    # Generate embeddings for 100 unprocessed observations
totalrecall embeddings backfill --all  # Regenerate all embeddings with progress bar
```

## Memory Maintenance Commands

### decay

The `decay` command manages memory decay — detecting stale observations and consolidating duplicates.

```bash
totalrecall decay stats                    # Show decay statistics
totalrecall decay detect-stale             # Detect and mark stale observations
totalrecall decay consolidate              # Consolidate duplicate observations
totalrecall decay consolidate --dry-run    # Preview consolidation without changes
```

## Import/Export Commands

### export

The `export` command exports observations in JSONL, JSON, or Markdown format.

```bash
totalrecall export --project myapp --format jsonl --output backup.jsonl
totalrecall export --project myapp --format md > notes.md
```

### import

The `import` command imports observations from a JSONL file with SHA256 deduplication.

```bash
totalrecall import backup.jsonl
```

## Backup Commands

### backup

The `backup` command manages database backups with gzip compression and rotation.

```bash
totalrecall backup create                    # Create a manual backup
totalrecall backup list                      # List all backups with metadata
totalrecall backup restore backup-2026-02-27-150000.db  # Restore from backup
```

## Config Commands

### config

The `config` command manages persistent configuration settings.

```bash
totalrecall config list               # Show all settings
totalrecall config get worker.port    # Get a single value
totalrecall config set log.level DEBUG  # Set a value
```

## Plugin Commands

### plugins

The `plugins` command manages the plugin system (Slack, GitHub built-in).

```bash
totalrecall plugins list              # List all registered plugins with status
totalrecall plugins enable <name>     # Enable a plugin
totalrecall plugins disable <name>    # Disable a plugin
```

## Worker Commands

Worker management commands use the `npm run` prefix when running from source, or the `worker:` prefix from the CLI:

```bash
npm run worker:start     # Start the background worker
npm run worker:stop      # Stop the worker
npm run worker:restart   # Restart after code changes
npm run worker:status    # Check worker health and PID
npm run worker:logs      # View recent logs
```
