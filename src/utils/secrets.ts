/**
 * Secret filtering module.
 * Detects and redacts sensitive values (API keys, tokens, passwords)
 * before they are persisted to the database.
 */

const SECRET_PATTERNS: Array<{ name: string; pattern: RegExp }> = [
  // AWS Access Keys (AKIA, ABIA, ACCA, ASIA prefixes + 16 alphanumeric chars)
  { name: 'aws-key', pattern: /(?:AKIA|ABIA|ACCA|ASIA)[A-Z0-9]{16}/g },
  // JWT tokens (three base64url segments separated by dots)
  { name: 'jwt', pattern: /eyJ[a-zA-Z0-9_-]{10,}\.eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}/g },
  // Generic API keys in key=value or key: value assignments
  { name: 'api-key', pattern: /(?:api[_-]?key|apikey|api[_-]?secret)\s*[:=]\s*['"]?([a-zA-Z0-9_\-]{20,})['"]?/gi },
  // Password/secret/token in variable assignments
  { name: 'credential', pattern: /(?:password|passwd|pwd|secret|token|auth[_-]?token|access[_-]?token|bearer)\s*[:=]\s*['"]?([^\s'"]{8,})['"]?/gi },
  // Credentials embedded in URLs (user:pass@host)
  { name: 'url-credential', pattern: /(?:https?:\/\/)([^:]+):([^@]+)@/g },
  // PEM-encoded private keys (RSA, EC, DSA, OpenSSH)
  { name: 'private-key', pattern: /-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/g },
  // GitHub personal access tokens (ghp_, gho_, ghu_, ghs_, ghr_ prefixes)
  { name: 'github-token', pattern: /gh[pousr]_[a-zA-Z0-9]{36,}/g },
  // Slack bot/user/app tokens
  { name: 'slack-token', pattern: /xox[bpoas]-[a-zA-Z0-9-]{10,}/g },
  // HTTP Authorization Bearer header values
  { name: 'bearer-header', pattern: /\bBearer\s+([a-zA-Z0-9_\-\.]{20,})/g },
  // Generic hex secrets (32+ hex chars after a key/secret/token/password label)
  { name: 'hex-secret', pattern: /(?:key|secret|token|password)\s*[:=]\s*['"]?([0-9a-f]{32,})['"]?/gi },
];

/**
 * Redact detected secrets from text.
 * Preserves the first 4 characters of each match for debugging context,
 * then appends ***REDACTED*** in place of the sensitive portion.
 *
 * @param text - The string to sanitize
 * @returns The sanitized string with secrets replaced
 */
export function redactSecrets(text: string): string {
  if (!text) return text;

  let redacted = text;
  for (const { pattern } of SECRET_PATTERNS) {
    // Reset lastIndex so global regexes work correctly on every call
    pattern.lastIndex = 0;
    redacted = redacted.replace(pattern, (match) => {
      const prefix = match.substring(0, Math.min(4, match.length));
      return `${prefix}***REDACTED***`;
    });
  }
  return redacted;
}

/**
 * Check whether text contains any recognizable secret patterns.
 * Useful as a fast guard before triggering heavier processing.
 *
 * @param text - The string to inspect
 * @returns true if at least one secret pattern is found
 */
export function containsSecrets(text: string): boolean {
  if (!text) return false;

  for (const { pattern } of SECRET_PATTERNS) {
    pattern.lastIndex = 0;
    if (pattern.test(text)) return true;
  }
  return false;
}
