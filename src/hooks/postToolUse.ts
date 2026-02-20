#!/usr/bin/env node
/**
 * Hook postToolUse per Kiro CLI
 *
 * Trigger: dopo l'esecuzione di ogni tool
 * Funzione: salva un'osservazione con nome tool, input e output
 */

import { runHook, detectProject, notifyWorker } from './utils.js';
import { createKiroMemory } from '../sdk/index.js';

runHook('postToolUse', async (input) => {
  if (!input.tool_name) return;

  // Tool completamente ignorati (nessun valore informativo)
  // Include nomi Kiro CLI (lowercase) e Claude Code (PascalCase)
  const ignoredTools = ['introspect', 'thinking', 'todo', 'TodoWrite'];
  if (ignoredTools.includes(input.tool_name)) return;

  // Tool di lettura: traccia in modo leggero (solo file, no contenuto)
  // Include nomi Kiro CLI (lowercase) e Claude Code (PascalCase)
  const readOnlyTools = ['glob', 'grep', 'fs_read', 'read', 'Read', 'Glob', 'Grep'];
  if (readOnlyTools.includes(input.tool_name)) {
    const project = detectProject(input.cwd);
    const sdk = createKiroMemory({ project, skipMigrations: true });
    try {
      const files = extractFiles(input.tool_input, input.tool_response);
      // Crea osservazione leggera solo se ci sono file o è una ricerca significativa
      const query = input.tool_input?.pattern || input.tool_input?.regex || input.tool_input?.query || '';
      const title = input.tool_name === 'grep' || input.tool_name === 'glob'
        ? `Searched: ${query}`.substring(0, 100)
        : `Read: ${files[0] || input.tool_input?.path || input.tool_input?.file_path || 'file'}`;

      await sdk.storeObservation({
        type: 'file-read',
        title,
        content: files.length > 0 ? `Files: ${files.join(', ')}` : `Tool ${input.tool_name} executed`,
        files
      });
      await notifyWorker('observation-created', { project, title, type: 'file-read' });
    } finally {
      sdk.close();
    }
    return;
  }

  const project = detectProject(input.cwd);
  const sdk = createKiroMemory({ project, skipMigrations: true });

  try {
    // Costruisci titolo descrittivo
    const title = buildTitle(input.tool_name, input.tool_input);

    // Costruisci contenuto con input e output riassunti
    const content = buildContent(input.tool_name, input.tool_input, input.tool_response);

    // Determina tipo osservazione
    const type = categorizeToolUse(input.tool_name);

    // Estrai file coinvolti
    const files = extractFiles(input.tool_input, input.tool_response);

    await sdk.storeObservation({
      type,
      title,
      content,
      files
    });

    // Notifica la dashboard in tempo reale
    await notifyWorker('observation-created', { project, title, type });
  } finally {
    sdk.close();
  }
});

function buildTitle(toolName: string, toolInput: any): string {
  if (!toolInput) return `Tool: ${toolName}`;

  switch (toolName) {
    // Kiro CLI + Claude Code: scrittura file
    case 'fs_write':
    case 'write':
    case 'Write':
    case 'Edit':
    case 'NotebookEdit':
      return `Written: ${toolInput.path || toolInput.file_path || toolInput.notebook_path || 'file'}`;
    // Kiro CLI + Claude Code: comandi shell
    case 'execute_bash':
    case 'shell':
    case 'Bash':
      return `Executed: ${(toolInput.command || '').substring(0, 80)}`;
    // Kiro CLI + Claude Code: ricerca web
    case 'web_search':
    case 'WebSearch':
      return `Searched: ${toolInput.query || ''}`;
    case 'web_fetch':
    case 'WebFetch':
      return `Fetch: ${toolInput.url || ''}`;
    // Kiro CLI + Claude Code: delegazione
    case 'delegate':
    case 'use_subagent':
    case 'Task':
      return `Delegated: ${toolInput.task || toolInput.prompt || toolInput.description || ''}`.substring(0, 100);
    default:
      return `${toolName}: ${JSON.stringify(toolInput).substring(0, 80)}`;
  }
}

function buildContent(toolName: string, toolInput: any, toolResponse: any): string {
  let content = '';

  if (toolInput) {
    const inputStr = typeof toolInput === 'string' ? toolInput : JSON.stringify(toolInput);
    content += `Input: ${inputStr.substring(0, 500)}\n`;
  }

  if (toolResponse) {
    const respStr = typeof toolResponse === 'string' ? toolResponse : JSON.stringify(toolResponse);
    content += `Output: ${respStr.substring(0, 500)}`;
  }

  return content || `Tool ${toolName} executed`;
}

function categorizeToolUse(toolName: string): string {
  const categories: Record<string, string> = {
    // Kiro CLI tool names
    'fs_write': 'file-write',
    'write': 'file-write',
    'fs_read': 'file-read',
    'read': 'file-read',
    'glob': 'file-read',
    'grep': 'file-read',
    'execute_bash': 'command',
    'shell': 'command',
    'web_search': 'research',
    'web_fetch': 'research',
    'delegate': 'delegation',
    'use_subagent': 'delegation',
    'use_aws': 'cloud-operation',
    'aws': 'cloud-operation',
    'code': 'code-intelligence',
    // Claude Code tool names (PascalCase)
    'Write': 'file-write',
    'Edit': 'file-write',
    'NotebookEdit': 'file-write',
    'Read': 'file-read',
    'Glob': 'file-read',
    'Grep': 'file-read',
    'Bash': 'command',
    'WebSearch': 'research',
    'WebFetch': 'research',
    'Task': 'delegation'
  };
  return categories[toolName] || 'tool-use';
}

function extractFiles(toolInput: any, toolResponse: any): string[] {
  const files: string[] = [];

  if (toolInput?.path) files.push(toolInput.path);
  if (toolInput?.file_path) files.push(toolInput.file_path);
  if (toolInput?.paths && Array.isArray(toolInput.paths)) {
    files.push(...toolInput.paths);
  }

  return [...new Set(files)]; // Deduplica
}
