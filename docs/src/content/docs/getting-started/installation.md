---
title: Installation
description: How to install Kiro Memory — global or project-local, prerequisites, and the setup wizard.
---

## Prerequisites

- **Node.js** 18.0.0 or later (or **Bun** 1.0.0+)
- **npm** 8+ (or pnpm / yarn)
- A supported AI coding assistant (Kiro CLI, Claude Code, Cursor, Windsurf, Cline)
- Git (used to detect the project name automatically)

## Global Installation (Recommended)

Install once and use in every project:

```bash
npm install -g kiro-memory
```

Verify the installation:

```bash
kiro-memory --version
# 2.1.0
```

## Project-Local Installation

If you prefer to keep the dependency scoped to a single project:

```bash
npm install kiro-memory
# or
pnpm add kiro-memory
# or
bun add kiro-memory
```

With a project-local install, use `npx kiro-memory` instead of `kiro-memory` in all CLI commands.

## Running the Setup Wizard

After installing, run the interactive setup wizard:

```bash
kiro-memory setup
```

The wizard will:

1. Detect your editor (Kiro CLI, Claude Code, Cursor, Windsurf)
2. Create hook configuration files in the correct directory
3. Start the background worker service on port 3001
4. Verify the database is initialized at `~/.contextkit/contextkit.db`

### What the Setup Creates

**For Kiro CLI**, hooks are installed in `~/.kiro/plugins/kiro-memory/`:

```
~/.kiro/plugins/kiro-memory/
├── agentSpawn.js          # Context injection at session start
├── userPromptSubmit.js    # Prompt recording
├── postToolUse.js         # Tool usage capture
├── stop.js                # Session summary generation
└── index.js               # Plugin entry point
```

**For all editors**, the worker is started and a PID file is written to `~/.contextkit/worker.pid`.

## Manual Installation (Kiro CLI)

If you prefer to install hooks manually without the wizard:

```bash
# Copy the plugin files
cp -r node_modules/kiro-memory/plugin/* ~/.kiro/plugins/kiro-memory/

# Start the worker
kiro-memory worker:start
```

Or use the npm script included in the package:

```bash
npm run install:kiro
```

## Verifying the Installation

Run the doctor command to check everything is working:

```bash
kiro-memory doctor
```

This checks:
- Worker process is running on port 3001
- Database file exists and is accessible
- Hook files are installed correctly
- Optional: embedding service availability

A healthy installation looks like:

```
[OK] Worker running at http://127.0.0.1:3001
[OK] Database found at ~/.contextkit/contextkit.db
[OK] Hooks installed in ~/.kiro/plugins/kiro-memory/
[OK] Schema version: 11
[--] Embedding service: not available (optional)
```

## Optional: Semantic Search Dependencies

Kiro Memory supports local vector embeddings for semantic search. These are optional — the system works without them using FTS5 keyword search only.

To enable embeddings, install one of the optional backends:

```bash
# Option 1: fastembed (recommended, faster)
npm install fastembed

# Option 2: HuggingFace Transformers (more model choices)
npm install @huggingface/transformers
```

After installing, the embedding service will initialize automatically on next worker start.

## Uninstalling

```bash
# Stop the worker
kiro-memory worker:stop

# Remove hooks (Kiro CLI)
rm -rf ~/.kiro/plugins/kiro-memory/

# Remove data (optional — this deletes your memory database)
rm -rf ~/.contextkit/

# Uninstall the package
npm uninstall -g kiro-memory
```
