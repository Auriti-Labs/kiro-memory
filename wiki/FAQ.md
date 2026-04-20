# Frequently Asked Questions

## What is Total Recall?

Total Recall is a persistent memory system for AI coding assistants. It automatically captures context from your coding sessions — files changed, commands run, decisions made — and provides that context to your AI agent in future sessions. Total Recall acts as cross-session memory so your agent never loses track of what happened before. It works with Claude Code, Cursor, Windsurf, Cline, and any MCP-compatible editor.

## Does Total Recall require an API key or cloud service?

No. Total Recall runs entirely locally on your machine. Vector embeddings are generated locally using ONNX Runtime with the `fast-bge-small-en-v1.5` model — no API keys, no cloud services, no data leaves your machine. All data is stored in a local SQLite database at `~/.totalrecall/totalrecall.db`.

## Which editors does Total Recall support?

Total Recall supports Claude Code, Cursor, Windsurf, Cline, and any editor that supports the Model Context Protocol (MCP). Claude Code gets the deepest integration via 4 hooks that automatically capture events. Other editors use rules files plus the MCP server, which exposes 10 tools for reading and writing memory.

## How do I install Total Recall?

Install Total Recall globally via npm and run the install command for your editor:

```bash
npm install -g totalrecallai
totalrecall install              # Auto-detect editor
totalrecall install --claude-code  # Or specify your editor
```

The worker auto-starts when a session begins. See the [[Installation]] page for detailed per-editor instructions.

## How is Total Recall different from .cursorrules or CLAUDE.md?

Static files like `.cursorrules` or `CLAUDE.md` require manual maintenance and don't capture session history. Total Recall automatically records what happens in each session, builds structured summaries with investigated/completed/learned/next_steps sections, and uses hybrid search (vector + keyword) to surface the most relevant context. It's dynamic, automatic, and searchable.

## Can I use Total Recall with multiple projects?

Yes. Total Recall automatically detects the current project from the git root directory and scopes all observations, summaries, and context per project. The web dashboard includes project filters, and all CLI commands support project-scoped queries. You can also override the project name with the `TOTALRECALL_PROJECT` environment variable.

## How much disk space does Total Recall use?

The SQLite database grows based on usage. A typical project with months of daily use stays under 50 MB. Embeddings add roughly 1.5 KB per observation. The `totalrecall decay` command detects stale observations, and `totalrecall decay consolidate` merges duplicates to manage growth. You can check your database size with `totalrecall stats`.

## How do I back up my Total Recall data?

Total Recall includes automatic backup with rotation and gzip compression:

```bash
totalrecall backup create    # Create a manual backup
totalrecall backup list      # List all backups
totalrecall backup restore <file>  # Restore from backup
```

You can also export data as JSONL for portable backups with `totalrecall export --project myapp --format jsonl`. The database is a single SQLite file at `~/.totalrecall/totalrecall.db` that can be copied directly.

## What happens if the worker crashes?

The worker auto-restarts when a new session begins (triggered by the PreToolUse hook or MCP server startup). Your data is safe in the SQLite database — it's never lost. You can also manually restart with `npm run worker:restart` or register auto-start with `totalrecall service install` to start the worker on boot.

## Can I search my memory from the command line?

Yes. Total Recall provides two search modes from the CLI:

```bash
totalrecall search "authentication flow"          # FTS5 keyword search
totalrecall semantic-search "how did I fix auth"   # Hybrid vector + keyword search
totalrecall search --interactive                   # Interactive REPL mode
```

Both support project filters (`--project=myapp`) and configurable result limits.

## How does the smart ranking work?

Total Recall uses a 4-signal composite scoring system to surface the most relevant context:

1. **Recency** — Newer observations score higher (exponential decay curve)
2. **Frequency** — Frequently accessed items score higher
3. **Semantic similarity** — Vector cosine distance to the search query
4. **Decay** — Stale observations are downranked

Additionally, knowledge entries (decisions, constraints) receive type-based boosts, and project-matching results get a bonus. The scoring engine is implemented in `ScoringEngine.ts`.

## How do I auto-start the worker on boot?

Use the `service install` command:

```bash
totalrecall service install
```

Total Recall uses cascading detection: it prefers systemd user services (creates `~/.config/systemd/user/totalrecall-worker.service` with `Restart=on-failure`), and falls back to crontab `@reboot` entries. Check status or remove with:

```bash
totalrecall service status
totalrecall service uninstall
```

## What is the web dashboard?

Total Recall includes a web dashboard at `http://localhost:3001` that provides a real-time view of your memory system. It features a live feed of observations via Server-Sent Events, a session browser, analytics with activity timeline and type distribution, spotlight search (Ctrl+K), and dark/light theme support. The dashboard is a React SPA served by the worker.

## How do I fix corrupted embeddings?

Run the doctor command with the `--fix` flag:

```bash
totalrecall doctor --fix
```

This removes orphaned embeddings, rebuilds the FTS5 index, and runs VACUUM. To regenerate all embeddings from scratch:

```bash
totalrecall embeddings backfill --all
```

## Is Total Recall open source?

Yes. Total Recall is licensed under AGPL-3.0. The source code is available at [github.com/Auriti-Labs/kiro-memory](https://github.com/Auriti-Labs/kiro-memory). The npm package is [`totalrecallai`](https://www.npmjs.com/package/totalrecallai).

## How do I report a bug or request a feature?

Open an issue at [github.com/Auriti-Labs/kiro-memory/issues](https://github.com/Auriti-Labs/kiro-memory/issues). For security vulnerabilities, use the [private security advisory](https://github.com/Auriti-Labs/kiro-memory/security/advisories/new).
