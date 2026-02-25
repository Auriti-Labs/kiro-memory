# Contributing to ContextKit

Thank you for your interest in contributing to ContextKit! This guide will help you get started.

## Before You Start

- **Open an issue first.** Discuss proposed changes before writing code. This avoids wasted effort on both sides.
- **One change per PR.** Keep pull requests focused on a single concern.

## Development Setup

### Prerequisites

- Node.js >= 18
- [Bun](https://bun.sh/) >= 1.0 (used for tests and worker)

### Getting Started

```bash
git clone https://github.com/Auriti-Labs/kiro-memory.git
cd contextkit
npm install
npm run build
```

### Running Tests

```bash
# All tests
npm test

# Specific suites
npm run test:sqlite
npm run test:search
npm run test:context
npm run test:server
```

### Development Workflow

```bash
# Build, sync to Kiro, and restart worker
npm run dev

# Start/stop the background worker
npm run worker:start
npm run worker:stop
npm run worker:status
```

## Code Style

- **TypeScript strict mode** -- no `any` types.
- **Pure functions** for calculation/logic. Side effects only at boundaries.
- **Meaningful names** -- code should read without comments.
- **No unnecessary abstractions.** Three similar lines are better than a premature helper.

## Pull Request Process

1. Fork the repository and create a branch from `main`.
2. Make your changes. Write tests for new functionality.
3. Run `npm test` and ensure all tests pass.
4. Run `npm run build` and ensure the build succeeds.
5. Submit your PR with:
   - **Summary**: What changed and why (1-3 bullet points).
   - **Test plan**: How you verified the changes work.

## Commit Messages

Use [Conventional Commits](https://www.conventionalcommits.org/):

```
feat(hooks): add retry logic to postToolUse
fix(sqlite): handle concurrent write conflicts
refactor(sdk): simplify search API surface
docs: update CLI reference in README
test(server): add MCP endpoint integration tests
```

Types: `feat`, `fix`, `refactor`, `docs`, `perf`, `security`, `test`, `chore`

## Project Structure

```
src/
  hooks/          # Kiro lifecycle hooks (agentSpawn, postToolUse, stop, etc.)
  services/       # Worker HTTP API, SQLite database layer
  sdk/            # TypeScript SDK for programmatic access
  cli/            # CLI commands
  servers/        # MCP server implementation
  utils/          # Shared utilities
plugin/           # Built plugin artifacts (synced to Kiro)
scripts/          # Build and install scripts
tests/            # Test suites
```

## Reporting Bugs

Open an issue with:

- **What happened** (actual behavior)
- **What you expected** (expected behavior)
- **How to reproduce** (steps, environment, OS)
- **Logs** if available (`~/.contextkit/logs/`)

## Security Issues

Do **not** open a public issue for security vulnerabilities. See [SECURITY.md](SECURITY.md) for responsible disclosure instructions.

## License

By contributing, you agree that your contributions will be licensed under the [AGPL-3.0](LICENSE) license.
