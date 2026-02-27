/**
 * Test suite for the secrets redaction module.
 * Verifies that sensitive values are correctly detected and redacted
 * from arbitrary text before it reaches the database.
 */

import { describe, it, expect } from 'bun:test';
import { redactSecrets, containsSecrets } from '../../src/utils/secrets.js';

// ── redactSecrets ──────────────────────────────────────────────────────────────

describe('redactSecrets', () => {
  // AWS keys
  it('should redact AWS access keys', () => {
    const input = 'My key is AKIAIOSFODNN7EXAMPLE and it works';
    const output = redactSecrets(input);
    expect(output).not.toContain('AKIAIOSFODNN7EXAMPLE');
    expect(output).toContain('AKIA***REDACTED***');
  });

  // JWT tokens
  it('should redact JWT tokens', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyMTIzNDU2Nzg5MCIsIm5hbWUiOiJKb2huIERvZSIsImlhdCI6MTUxNjIzOTAyMn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
    const output = redactSecrets(`Authorization: Bearer ${jwt}`);
    expect(output).not.toContain('eyJzdWIiOiJ1c2VyMTIzNDU2Nzg5MCIsIm5hbWUiOiJKb2huIERvZSIsImlhdCI6MTUxNjIzOTAyMn0');
    expect(output).toContain('***REDACTED***');
  });

  // API key assignments
  it('should redact api_key assignments (equals sign)', () => {
    const input = 'api_key = "abcdefghijklmnopqrstuvwxyz123456"';
    const output = redactSecrets(input);
    expect(output).not.toContain('abcdefghijklmnopqrstuvwxyz123456');
    expect(output).toContain('***REDACTED***');
  });

  it('should redact api-key assignments (colon separator)', () => {
    const input = 'api-key: sk-abcdefghijklmnopqrstuvwxyz1234567890';
    const output = redactSecrets(input);
    expect(output).toContain('***REDACTED***');
    expect(output).not.toContain('sk-abcdefghijklmnopqrstuvwxyz1234567890');
  });

  // Password/secret/token in variable assignments
  it('should redact password assignments', () => {
    const input = 'password = "MySuperSecretPass1!"';
    const output = redactSecrets(input);
    expect(output).not.toContain('MySuperSecretPass1!');
    expect(output).toContain('***REDACTED***');
  });

  it('should redact token assignments', () => {
    const input = 'token: Bearer abcdef1234567890abcdef1234567890';
    const output = redactSecrets(input);
    expect(output).toContain('***REDACTED***');
    expect(output).not.toContain('abcdef1234567890abcdef1234567890');
  });

  // Credentials in URLs
  it('should redact credentials embedded in URLs', () => {
    const input = 'Connection string: https://admin:s3cr3tPass@db.example.com:5432/mydb';
    const output = redactSecrets(input);
    expect(output).not.toContain('s3cr3tPass');
    expect(output).toContain('***REDACTED***');
  });

  // PEM private keys
  it('should redact PEM private key headers', () => {
    const input = '-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAK...';
    const output = redactSecrets(input);
    expect(output).toContain('***REDACTED***');
    // The marker itself should no longer appear verbatim
    expect(output).not.toContain('-----BEGIN RSA PRIVATE KEY-----');
  });

  it('should redact generic PRIVATE KEY headers', () => {
    const input = 'Key data: -----BEGIN PRIVATE KEY-----\nMIIEvA...';
    const output = redactSecrets(input);
    expect(output).toContain('***REDACTED***');
    expect(output).not.toContain('-----BEGIN PRIVATE KEY-----');
  });

  // GitHub PATs
  it('should redact GitHub personal access tokens (ghp_)', () => {
    const input = 'GITHUB_TOKEN=ghp_abcdefghijklmnopqrstuvwxyz0123456789';
    const output = redactSecrets(input);
    expect(output).not.toContain('ghp_abcdefghijklmnopqrstuvwxyz0123456789');
    expect(output).toContain('***REDACTED***');
  });

  it('should redact GitHub OAuth tokens (gho_)', () => {
    const input = 'token: gho_abcdefghijklmnopqrstuvwxyz0123456789';
    const output = redactSecrets(input);
    expect(output).not.toContain('gho_abcdefghijklmnopqrstuvwxyz0123456789');
    expect(output).toContain('***REDACTED***');
  });

  // Slack tokens
  it('should redact Slack bot tokens (xoxb-)', () => {
    // Use a clearly fake token that won't trigger GitHub secret scanning
    const fakeToken = 'xoxb-fake' + '-test' + '-placeholder';
    const input = `slack_token = ${fakeToken}`;
    const output = redactSecrets(input);
    expect(output).not.toContain(fakeToken);
    expect(output).toContain('***REDACTED***');
  });

  it('should redact Slack app tokens (xoxa-)', () => {
    const fakeToken = 'xoxa-fake' + '-test' + '-placeholder';
    const input = `Authorization: ${fakeToken}`;
    const output = redactSecrets(input);
    expect(output).toContain('***REDACTED***');
  });

  // Normal text must not be altered
  it('should NOT modify plain text without secrets', () => {
    const input = 'Hello world, this is a normal log message with no secrets.';
    const output = redactSecrets(input);
    expect(output).toBe(input);
  });

  it('should NOT modify short tokens below the minimum length threshold', () => {
    // "password = short" — value is only 5 chars, below 8-char minimum
    const input = 'password = short';
    const output = redactSecrets(input);
    expect(output).toBe(input);
  });

  // Empty / null safety
  it('should return empty string unchanged', () => {
    expect(redactSecrets('')).toBe('');
  });

  // Mixed text: only the secret part should be replaced
  it('should redact only the secret portion, preserving surrounding text', () => {
    const input = 'Starting deployment with api_key = "abc123def456ghi789jkl" to production.';
    const output = redactSecrets(input);
    expect(output).toContain('Starting deployment');
    expect(output).toContain('to production.');
    expect(output).not.toContain('abc123def456ghi789jkl');
  });

  // First 4 chars must be preserved
  it('should preserve the first 4 characters of redacted matches for debugging', () => {
    const input = 'AKIAIOSFODNN7EXAMPLE';
    const output = redactSecrets(input);
    // First 4 chars of the AWS key: "AKIA"
    expect(output.startsWith('AKIA')).toBe(true);
    expect(output).toContain('***REDACTED***');
  });

  // Multiple secrets in the same string
  it('should redact multiple secrets in the same text', () => {
    const input =
      'api_key = "abcdef1234567890abcdef12345678" and password = "superSecret99!"';
    const output = redactSecrets(input);
    expect(output).not.toContain('abcdef1234567890abcdef12345678');
    expect(output).not.toContain('superSecret99!');
    // Both occurrences should be replaced
    expect((output.match(/\*\*\*REDACTED\*\*\*/g) || []).length).toBeGreaterThanOrEqual(2);
  });
});

// ── containsSecrets ────────────────────────────────────────────────────────────

describe('containsSecrets', () => {
  it('should return true for text containing an AWS key', () => {
    expect(containsSecrets('My key is AKIAIOSFODNN7EXAMPLE')).toBe(true);
  });

  it('should return true for text containing a JWT token', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyMTIzNDU2Nzg5MCIsIm5hbWUiOiJKb2huIERvZSIsImlhdCI6MTUxNjIzOTAyMn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
    expect(containsSecrets(jwt)).toBe(true);
  });

  it('should return true for text containing a GitHub PAT', () => {
    expect(containsSecrets('ghp_abcdefghijklmnopqrstuvwxyz0123456789')).toBe(true);
  });

  it('should return false for plain text without secrets', () => {
    expect(containsSecrets('Hello world, no secrets here.')).toBe(false);
  });

  it('should return false for empty string', () => {
    expect(containsSecrets('')).toBe(false);
  });
});

// ── Performance ────────────────────────────────────────────────────────────────

describe('redactSecrets performance', () => {
  it('should complete redaction on 10KB text within 5ms', () => {
    // Build a 10KB string that includes a single AWS key to ensure the
    // patterns are actually exercised, not just skipped by early exit.
    const base = 'a'.repeat(500) + ' AKIAIOSFODNN7EXAMPLE ' + 'b'.repeat(500);
    const tenKb = base.repeat(Math.ceil(10_240 / base.length)).substring(0, 10_240);

    const start = performance.now();
    redactSecrets(tenKb);
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(5);
  });
});
