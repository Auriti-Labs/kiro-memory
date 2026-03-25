---
title: Installation
description: How to install Total Recall — global or project-local, prerequisites, and the setup wizard.
---

## Prerequisites

- **Node.js** 18.0.0 or later (or **Bun** 1.0.0+)
- **npm** 8+ (or pnpm / yarn)
- A supported AI coding assistant (Kiro CLI, Claude Code, Cursor, Windsurf, Cline)
- Git (used to detect the project name automatically)

## Global Installation (Recommended)

Install once and use in every project:

```bash
npm install -g totalrecall
```

Verify the installation:

```bash
totalrecall --version
# 2.1.0
```

## Project-Local Installation

If you prefer to keep the dependency scoped to a single project:

```bash
npm install totalrecall
# or
pnpm add totalrecall
# or
bun add totalrecall
```

With a project-local install, use `npx totalrecall` instead of `totalrecall` in all CLI commands.

## Running the Setup Wizard

After installing, run the interactive setup wizard:

```bash
totalrecall setup
```

The wizard will:

1. Detect your editor (Kiro CLI, Claude Code, Cursor, Windsurf)
2. Create hook configuration files in the correct directory
3. Start the background worker service on port 3001
4. Verify the database is initialized at `~/.contextkit/contextkit.db`

### What the Setup Creates

**For Kiro CLI**, hooks are installed in `~/.kiro/plugins/totalrecall/`:

```
~/.kiro/plugins/totalrecall/
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
cp -r node_modules/totalrecall/plugin/* ~/.kiro/plugins/totalrecall/

# Start the worker
totalrecall worker:start
```

Or use the npm script included in the package:

```bash
npm run install:kiro
```

## Verifying the Installation

Run the doctor command to check everything is working:

```bash
totalrecall doctor
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
[OK] Hooks installed in ~/.kiro/plugins/totalrecall/
[OK] Schema version: 11
[--] Embedding service: not available (optional)
```

## Optional: Semantic Search Dependencies

Total Recall supports local vector embeddings for semantic search. These are optional — the system works without them using FTS5 keyword search only.

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
totalrecall worker:stop

# Remove hooks (Kiro CLI)
rm -rf ~/.kiro/plugins/totalrecall/

# Remove data (optional — this deletes your memory database)
rm -rf ~/.contextkit/

# Uninstall the package
npm uninstall -g totalrecall
```
