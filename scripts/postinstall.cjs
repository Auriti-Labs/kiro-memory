#!/usr/bin/env node
/**
 * Messaggio post-installazione Kiro Memory
 * Eseguito automaticamente dopo npm install -g kiro-memory
 * File .cjs per compatibilità con "type": "module" nel package.json
 */

/* Silenzioso in CI o con npm in modalità silenziosa */
if (process.env.CI || process.env.npm_config_loglevel === 'silent') {
  process.exit(0);
}

const { readFileSync } = require('fs');
const { join } = require('path');

let version = '';
try {
  const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf8'));
  version = pkg.version || '';
} catch { /* ignora */ }

/* Rileva supporto colori */
const color = !process.env.NO_COLOR && process.env.TERM !== 'dumb' && (process.stdout.isTTY || false);
const c = (code, text) => color ? `${code}${text}\x1b[0m` : text;
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const UND = '\x1b[4m';
const VIOLET = '\x1b[38;5;135m';
const CYAN = '\x1b[36m';

console.log('');
console.log(`  ${c(VIOLET + BOLD, 'Kiro Memory')} ${version ? `v${version}` : ''} installed!`);
console.log('');
console.log(`  ${c(DIM, 'Get started:')}`);
console.log(`    ${c(BOLD, 'kiro-memory install')}              Auto-detect editor`);
console.log(`    ${c(BOLD, 'kiro-memory install --claude-code')} Claude Code`);
console.log(`    ${c(BOLD, 'kiro-memory install --cursor')}      Cursor`);
console.log(`    ${c(BOLD, 'kiro-memory install --windsurf')}    Windsurf`);
console.log('');
console.log(`  ${c(CYAN, 'Dashboard:')} ${c(UND, 'http://localhost:3001')}`);
console.log(`  ${c(DIM, 'Docs:      ')} ${c(UND, 'https://auritidesign.it/docs/kiro-memory/')}`);
console.log('');
