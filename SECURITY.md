# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| 1.0.x   | Yes       |

## Reporting a Vulnerability

**Do not open a public issue for security vulnerabilities.**

If you discover a security vulnerability in ContextKit, please report it responsibly:

1. **Email**: Send a detailed report to the maintainers via [GitHub Security Advisories](https://github.com/Auriti-Labs/kiro-memory/security/advisories/new).
2. **Include**:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact
   - Suggested fix (if any)

## What to Expect

- **Acknowledgment** within 48 hours of your report.
- **Status update** within 7 days with an assessment and timeline.
- **Fix release** as soon as a patch is ready, typically within 30 days for critical issues.
- **Credit** in the release notes (unless you prefer to remain anonymous).

## Scope

The following are in scope:

- SQLite database access and injection
- Worker HTTP API (port 3001) -- unauthorized access, request forgery
- MCP server input handling
- Hook script injection or privilege escalation
- Sensitive data leakage from stored observations or summaries
- Dependency vulnerabilities with a known exploit

The following are out of scope:

- Issues requiring physical access to the machine
- Social engineering attacks
- Denial of service against the local worker (localhost-only by default)

## Security Design

ContextKit stores data locally by default:

- **Database**: `~/.contextkit/contextkit.db` (local SQLite, no network exposure)
- **Worker**: Binds to `127.0.0.1:3001` (localhost only, not exposed to network)
- **No credentials stored**: ContextKit does not handle authentication tokens or API keys

## Best Practices for Users

- Keep ContextKit updated to the latest version.
- Do not expose the worker port (3001) to external networks.
- Review stored observations if working with sensitive codebases (`contextkit search <query>`).
