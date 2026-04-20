# Installation

Total Recall installs as a global npm package and configures itself for your editor with a single command. The only requirement is **Node.js >= 18**.

## Install from npm

```bash
npm install -g totalrecallai
```

## Install for Your Editor

### Auto-Detect

The `install` command detects your installed editors and configures Total Recall for each one:

```bash
totalrecall install
```

### Claude Code

```bash
totalrecall install --claude-code
```

The Claude Code installer registers 4 hooks and an MCP server in your Claude Code configuration:

| Hook | Trigger | Purpose |
|------|---------|---------|
| `PreToolUse` | Before any tool runs | Injects previous session context into the AI prompt |
| `PostToolUse` | After a tool completes | Captures file writes, commands, and research observations |
| `Notification` | User sends a prompt | Records user prompts for session continuity |
| `Stop` | Session ends | Generates a structured session summary |

Claude Code gets the deepest integration because hooks capture events automatically without requiring the AI to call MCP tools explicitly.

### Cursor

```bash
totalrecall install --cursor
```

The Cursor installer creates two files:

- `.cursor/rules/totalrecall.mdc` — Rules file that instructs the AI to use Total Recall MCP tools
- `.cursor/mcp.json` — MCP server configuration pointing to the `totalrecall mcp-server` command

### Windsurf

```bash
totalrecall install --windsurf
```

The Windsurf installer creates:

- `.windsurfrules` — Rules file with memory instructions
- `~/.codeium/windsurf/mcp_config.json` — MCP server configuration

### Cline

```bash
totalrecall install --cline
```

The Cline installer creates:

- `.clinerules` — Custom instructions with memory instructions
- MCP server configuration in Cline's VS Code settings

## Install from Source

```bash
git clone https://github.com/Auriti-Labs/kiro-memory.git
cd kiro-memory
npm install && npm run build
npm run install:kiro
```

## Auto-Start on Boot

The `service install` command registers the worker to start automatically when your system boots:

```bash
totalrecall service install
```

Total Recall uses cascading detection to choose the best strategy:

1. **systemd** (preferred) — Creates a user service at `~/.config/systemd/user/totalrecall-worker.service` with automatic restart on failure
2. **crontab** — Adds an `@reboot` entry if systemd is not available

To check status or remove:

```bash
totalrecall service status
totalrecall service uninstall
```

## Updating

```bash
npm update -g totalrecallai
totalrecall --version
```

The worker automatically uses the new version at the next session start. To apply immediately:

```bash
npm run worker:restart
```

## Verify Installation

The `doctor` command checks your environment: Node.js version, database access, worker status, embedding support, and editor configuration.

```bash
totalrecall doctor
```

The `doctor --fix` command auto-repairs detected issues including rebuilding the FTS5 index, removing orphaned embeddings, and running VACUUM:

```bash
totalrecall doctor --fix
```
