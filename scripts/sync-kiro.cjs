/**
 * Sync ContextKit to Kiro plugins directory
 */

import { join } from 'path';
import { homedir } from 'os';
import { existsSync, mkdirSync, cpSync, rmSync } from 'fs';

const KIRO_DIR = join(homedir(), '.kiro');
const PLUGINS_DIR = join(KIRO_DIR, 'plugins');
const CONTEXTKIT_DIR = join(PLUGINS_DIR, 'totalrecall');
const PLUGIN_SOURCE = join(process.cwd(), 'plugin');

function sync() {
  console.log('Syncing Total Recall to Kiro...\n');
  
  // Ensure directories exist
  if (!existsSync(KIRO_DIR)) {
    console.log('Creating Kiro directory...');
    mkdirSync(KIRO_DIR, { recursive: true });
  }
  
  if (!existsSync(PLUGINS_DIR)) {
    console.log('Creating plugins directory...');
    mkdirSync(PLUGINS_DIR, { recursive: true });
  }
  
  // Remove existing installation if force flag
  if (process.argv.includes('--force') && existsSync(CONTEXTKIT_DIR)) {
    console.log('Removing existing installation...');
    rmSync(CONTEXTKIT_DIR, { recursive: true });
  }
  
  // Copy plugin files
  console.log('Copying plugin files...');
  cpSync(PLUGIN_SOURCE, CONTEXTKIT_DIR, { recursive: true });
  
  // Ensure data directory exists
  const dataDir = join(homedir(), '.contextkit');
  if (!existsSync(dataDir)) {
    console.log('Creating Total Recall data directory...');
    mkdirSync(dataDir, { recursive: true });
    mkdirSync(join(dataDir, 'logs'), { recursive: true });
  }
  
  console.log('\n✅ Total Recall synced successfully!');
  console.log(`Location: ${CONTEXTKIT_DIR}`);
  console.log('\nNext steps:');
  console.log('1. Restart Kiro CLI');
  console.log('2. Total Recall hooks will be available automatically');
}

sync();
