# Troubleshooting

This page covers all known issues with Total Recall and their solutions. For quick diagnostics, run `totalrecall doctor` or `totalrecall doctor --fix`.

## Installation Issues

### `invalid ELF header` (WSL)

```
Error: .../better_sqlite3.node: invalid ELF header
```

**Cause:** The `better-sqlite3` native module was compiled for Windows but you're running inside WSL (Linux). This happens when npm is installed on the Windows filesystem (`/mnt/c/...`).

**Fix:** Install Node.js natively inside WSL:

```bash
# Check which node you're using
which node
# If it shows /mnt/c/... you're using Windows Node inside WSL

# Install Node.js natively in WSL using nvm (recommended)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
nvm install 22

# Or use NodeSource
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs

# Verify — should show /home/... or /root/.nvm/...
which node

# Reinstall Total Recall
npm install -g totalrecallai
```

### `npm prefix` pointing to Windows (WSL)

**Cause:** If `npm prefix -g` returns a `/mnt/c/...` path, npm installs global packages on the Windows filesystem, which causes binary incompatibility in WSL.

**Fix:**

```bash
mkdir -p ~/.npm-global
npm config set prefix ~/.npm-global
echo 'export PATH="$HOME/.npm-global/bin:$PATH"' >> ~/.bashrc
source ~/.bashrc
npm install -g totalrecallai
```

### Missing build tools (Linux/WSL)

```
gyp ERR! find Python
gyp ERR! stack Error: Could not find any Python installation to use
```

**Cause:** Native modules like `better-sqlite3` require C++ compilation tools.

**Fix:**

```bash
sudo apt-get update && sudo apt-get install -y build-essential python3
npm install -g totalrecallai --build-from-source
```

### macOS: Xcode Command Line Tools

If you see compilation errors on macOS:

```bash
xcode-select --install
npm install -g totalrecallai
```

## Runtime Issues

### `no agent with name totalrecall found`

**Cause:** The editor integration was not installed.

**Fix:**

```bash
totalrecall install
```

### Port 3001 already in use

**Cause:** Another process (or a previous worker instance) is using port 3001.

**Fix:**

```bash
# Find what's using the port
lsof -i :3001

# Kill the process
kill -9 <PID>

# Or use a different port
export TOTALRECALL_WORKER_PORT=3002
```

### Worker not starting

**Diagnosis:**

```bash
# Check if the worker is running
npm run worker:status

# Check logs for errors
npm run worker:logs

# Try restarting
npm run worker:restart
```

If the worker still won't start, check that the data directory exists and is writable:

```bash
ls -la ~/.totalrecall/
```

### Worker crashes on startup

**Cause:** Usually a corrupted database or incompatible native module.

**Fix:**

```bash
# Run diagnostics
totalrecall doctor

# Auto-fix (rebuilds FTS5 index, removes orphaned embeddings, runs VACUUM)
totalrecall doctor --fix
```

If the database is severely corrupted, restore from backup:

```bash
totalrecall backup list
totalrecall backup restore <backup-file>
```

## Embedding Issues

### Embeddings not working

**Cause:** The ONNX Runtime or fastembed module may not be available on your platform.

**Diagnosis:**

```bash
totalrecall doctor
totalrecall embeddings stats
```

**Fix:**

```bash
# Auto-fix corrupted embeddings
totalrecall doctor --fix

# Regenerate all embeddings
totalrecall embeddings backfill --all
```

### Embedding coverage is low

**Cause:** Embeddings are generated asynchronously. If the worker was restarted or crashed, some observations may not have embeddings.

**Fix:**

```bash
# Generate embeddings for unprocessed observations
totalrecall embeddings backfill 100

# Or regenerate all
totalrecall embeddings backfill --all
```

### Corrupted embeddings

**Cause:** Interrupted embedding generation can leave corrupted entries (zero-length blobs or wrong types).

**Fix:**

```bash
totalrecall doctor --fix
```

The `doctor --fix` command specifically removes orphaned embeddings, rebuilds the FTS5 index, and runs VACUUM.

## Database Issues

### Database locked errors

**Cause:** Multiple worker instances are running simultaneously.

**Fix:**

```bash
# Kill all worker instances
pkill -f "worker-service"

# Start a single instance
npm run worker:start
```

### Database file is too large

**Cause:** Accumulated observations over time.

**Fix:**

```bash
# Check database size
totalrecall stats

# Run decay to mark stale observations
totalrecall decay detect-stale

# Consolidate duplicates
totalrecall decay consolidate

# Or use retention policy for automatic cleanup
totalrecall decay consolidate --dry-run  # Preview first
```

## Permission Issues

### Permission denied errors

**Cause:** The data directory or database file is not writable by the current user.

**Fix:**

```bash
ls -la ~/.totalrecall/
chmod -R u+rw ~/.totalrecall/
```

### Cannot write to global npm directory

**Fix:** Use a user-local npm prefix:

```bash
mkdir -p ~/.npm-global
npm config set prefix ~/.npm-global
echo 'export PATH="$HOME/.npm-global/bin:$PATH"' >> ~/.bashrc
source ~/.bashrc
```

## Editor-Specific Issues

### Claude Code: Hooks not firing

**Cause:** Hooks may not be registered correctly.

**Fix:**

```bash
# Reinstall hooks
totalrecall install --claude-code

# Verify hook files exist
ls -la .claude/hooks/
```

### Cursor: MCP server not connecting

**Cause:** MCP configuration may be incorrect.

**Fix:**

```bash
# Reinstall
totalrecall install --cursor

# Verify config files
cat .cursor/mcp.json
cat .cursor/rules/totalrecall.mdc
```

### Windsurf: Rules not loading

**Fix:**

```bash
totalrecall install --windsurf

# Verify files
cat .windsurfrules
cat ~/.codeium/windsurf/mcp_config.json
```

## Quick Diagnostics

The `doctor` command is the fastest way to diagnose issues:

```bash
# Run full diagnostics
totalrecall doctor

# Auto-fix detected issues
totalrecall doctor --fix
```

The doctor checks:
- Node.js version (>= 18 required)
- Build tools availability (build-essential, python3)
- WSL detection and path configuration
- Database access and integrity
- Worker status and health
- Embedding service availability
- Editor configuration
