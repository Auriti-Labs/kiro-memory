---
title: Development
description: How to set up a development environment, build the project, and contribute to Kiro Memory.
---

## Prerequisites

- **Node.js** 18+ or **Bun** 1.0+
- **Git**
- A code editor with TypeScript support

## Cloning the Repository

```bash
git clone https://github.com/Auriti-Labs/kiro-memory.git
cd kiro-memory
npm install
```

## Project Structure

```
kiro-memory/
├── src/
│   ├── cli/                    # CLI entry point (contextkit.ts)
│   ├── hooks/                  # The 4 lifecycle hooks
│   │   ├── agentSpawn.ts
│   │   ├── userPromptSubmit.ts
│   │   ├── postToolUse.ts
│   │   ├── stop.ts
│   │   └── utils.ts
│   ├── sdk/                    # Public SDK (index.ts)
│   ├── servers/                # MCP server
│   ├── services/
│   │   ├── routes/             # 8 modular Express routers
│   │   ├── sqlite/             # Database layer (11 modules)
│   │   ├── search/             # Embedding + vector + hybrid search
│   │   ├── analytics/          # Anomaly detection
│   │   ├── openapi/            # OpenAPI spec and router
│   │   └── worker-service.ts   # Express orchestrator
│   ├── shared/                 # Shared paths and constants
│   ├── types/                  # TypeScript type definitions
│   ├── ui/                     # React web dashboard
│   │   └── viewer/             # React SPA entry point
│   └── utils/                  # Logger, secrets redaction
├── tests/                      # Bun test suites
│   ├── sqlite/
│   ├── worker/
│   ├── context/
│   ├── server/
│   └── infrastructure/
├── scripts/                    # Build and maintenance scripts
├── plugin/                     # Build output (git-tracked for npm publish)
│   └── dist/
├── docs/                       # This documentation site
└── CLAUDE.md                   # AI coding assistant guidance
```

## Build

```bash
# Build all entry points to plugin/dist/
npm run build

# Build and sync to Kiro CLI + restart worker
npm run dev
```

The build uses **esbuild** (see `scripts/build-plugin.js`). Each entry point is bundled separately with:

- `bun:sqlite` shimmed to `better-sqlite3` for Node.js compatibility
- `createRequire` banner for CJS native module loading
- Tree-shaking and minification

After building, sync to the local Kiro CLI installation:

```bash
npm run sync-kiro
```

This copies `plugin/*` to `~/.kiro/plugins/kiro-memory/`.

## TypeScript

The project targets ESM (`"type": "module"` in `package.json`). All source files use `.ts` with `.js` extensions in imports (required for ESM Node.js).

```bash
# Type-check without building
npm run typecheck
```

TypeScript configuration: `tsconfig.json` — `strict: true`, `moduleResolution: bundler`.

## Adding a New API Endpoint

1. Identify the correct router in `src/services/routes/`
2. Add the route handler following the existing pattern:

```typescript
router.get('/api/my-endpoint', (req, res) => {
  const { project } = req.query as { project?: string };

  if (project && !isValidProject(project)) {
    res.status(400).json({ error: 'Invalid project name' });
    return;
  }

  try {
    const result = doSomething(ctx.db.db, project);
    res.json(result);
  } catch (error) {
    logger.error('WORKER', 'My endpoint failed', { project }, error as Error);
    res.status(500).json({ error: 'My endpoint failed' });
  }
});
```

3. Add the OpenAPI spec entry in `src/services/openapi/spec.ts`
4. Write a test in `tests/server/`
5. Run `npm run build` to verify TypeScript compiles

## Adding a Database Migration

Migrations are defined inline in `src/services/sqlite/Database.ts` in the `getMigrations()` method:

```typescript
{
  version: 12,  // next version number
  up: (db) => {
    db.run('ALTER TABLE observations ADD COLUMN my_new_column TEXT');
    db.run('CREATE INDEX IF NOT EXISTS idx_observations_my_column ON observations(my_new_column)');
  }
}
```

Migrations are applied automatically on the next database open. They run inside a transaction and are idempotent.

Rules:
- Never modify an existing migration — always add a new one
- Use `CREATE TABLE IF NOT EXISTS` and `CREATE INDEX IF NOT EXISTS` for safety
- Use `ALTER TABLE ADD COLUMN` to extend existing tables
- Always add indexes for columns used in WHERE clauses

## Extending the SDK

The SDK is in `src/sdk/index.ts`. New methods follow the existing pattern:

```typescript
/**
 * Clear description of what this method does.
 */
async myNewMethod(param: string): Promise<MyReturnType> {
  // Validate inputs
  if (!param || typeof param !== 'string') {
    throw new Error('param is required');
  }

  // Delegate to SQLite layer
  return doSomethingInDb(this.db.db, this.project, param);
}
```

Export new types from `src/types/worker-types.ts` and re-export them at the bottom of `src/sdk/index.ts`.

## Adding a Hook Feature

Hooks are in `src/hooks/`. They use `runHook()` from `utils.ts` which:
- Reads stdin as JSON
- Provides typed `input` to the callback
- Handles errors gracefully (exit 0 on error, not exit 1)

```typescript
runHook('postToolUse', async (input) => {
  // Your hook logic here
  // Write to stdout to inject content into the agent
  process.stdout.write('Some context...');
});
```

After modifying a hook, rebuild and sync:

```bash
npm run build && npm run sync-kiro
```

## Worker Restart

After any backend changes:

```bash
npm run worker:restart
```

Check the worker is running:

```bash
npm run worker:status
```

## Contributing

1. Fork the repository on GitHub
2. Create a branch: `git checkout -b feat/my-feature`
3. Make your changes following the conventions in `CLAUDE.md`
4. Write tests (see [Testing guide](/kiro-memory/contributing/testing))
5. Build and verify: `npm run build && bun test`
6. Submit a pull request

### Commit Format

```
<type>(<scope>): <description>
```

Types: `feat`, `fix`, `refactor`, `docs`, `perf`, `security`, `test`, `chore`

Examples:
```
feat(sdk): add storeKnowledge method for structured memory
fix(hooks): handle missing tool_name in postToolUse
perf(search): add composite index for project+epoch queries
```

### Code Standards

- TypeScript strict mode — no `any` except in legacy SQL result parsing
- Early returns instead of deep nesting
- All public functions and classes must have JSDoc comments
- No `console.log` — use `logger.info/warn/error/debug` from `src/utils/logger.ts`
- Input validation on all public API surfaces
- Error handling must not leak internal implementation details to API callers

## Release Process

Releases use `np`:

```bash
npm run release:patch  # 2.1.0 → 2.1.1
npm run release:minor  # 2.1.0 → 2.2.0
npm run release:major  # 2.1.0 → 3.0.0
```

The `prepublishOnly` hook runs `npm run build` before publishing to npm.
