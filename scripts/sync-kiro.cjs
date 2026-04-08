/**
 * Sync Total Recall to the Kiro plugins directory.
 */

import { join } from 'path';
import { homedir } from 'os';
import { existsSync, mkdirSync, cpSync, rmSync } from 'fs';

const KIRO_DIR = join(homedir(), '.kiro');
const PLUGINS_DIR = join(KIRO_DIR, 'plugins');
const TOTALRECALL_PLUGIN_DIR = join(PLUGINS_DIR, 'totalrecall');
const PLUGIN_SOURCE = join(process.cwd(), 'plugin');
const DATA_DIR = process.env.TOTALRECALL_DATA_DIR || process.env.CONTEXTKIT_DATA_DIR || join(homedir(), '.totalrecall');

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
  if (process.argv.includes('--force') && existsSync(TOTALRECALL_PLUGIN_DIR)) {
    console.log('Removing existing installation...');
    rmSync(TOTALRECALL_PLUGIN_DIR, { recursive: true });
  }

  // Copy plugin files
  console.log('Copying plugin files...');
  cpSync(PLUGIN_SOURCE, TOTALRECALL_PLUGIN_DIR, { recursive: true });

  // Ensure data directory exists
  if (!existsSync(DATA_DIR)) {
    console.log('Creating Total Recall data directory...');
    mkdirSync(DATA_DIR, { recursive: true });
    mkdirSync(join(DATA_DIR, 'logs'), { recursive: true });
  }

  console.log('\n✅ Total Recall synced successfully!');
  console.log(`Location: ${TOTALRECALL_PLUGIN_DIR}`);
  console.log(`Data dir: ${DATA_DIR}`);
  console.log('\nNext steps:');
  console.log('1. Restart Kiro CLI');
  console.log('2. Total Recall hooks will be available automatically');
}

sync();
