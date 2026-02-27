#!/usr/bin/env node
/**
 * Hook postToolUse for Kiro CLI
 *
 * Trigger: after every tool execution
 * Function: stores a human-readable observation with narrative description
 */

import { runHook, detectProject, notifyWorker } from './utils.js';
import { createKiroMemory } from '../sdk/index.js';

runHook('postToolUse', async (input) => {
  // Cursor event normalization
  if (input.hook_event_name === 'afterFileEdit' && !input.tool_name) {
    input.tool_name = 'Write';
    input.tool_input = { path: input.file_path };
    input.tool_response = { edits: input.edits };
  }
  if (input.hook_event_name === 'afterShellExecution' && !input.tool_name) {
    input.tool_name = 'Bash';
    input.tool_input = { command: input.command };
  }

  if (!input.tool_name) return;

  // Completely ignored tools (no informational value)
  const ignoredTools = ['introspect', 'thinking', 'todo', 'TodoWrite'];
  if (ignoredTools.includes(input.tool_name)) return;

  // Read-only tools: lightweight tracking
  const readOnlyTools = ['glob', 'grep', 'fs_read', 'read', 'Read', 'Glob', 'Grep'];
  if (readOnlyTools.includes(input.tool_name)) {
    const project = detectProject(input.cwd);
    const sdk = createKiroMemory({ project, skipMigrations: true });
    try {
      const files = extractFiles(input.tool_input, input.tool_response);
      const { title, narrative } = buildReadObservation(input.tool_name, input.tool_input, files);
      const subtitle = generateSubtitle('file-read', input.tool_name, input.tool_input, files);
      const concepts = extractConcepts(input.tool_name, input.tool_input, files);

      await sdk.storeObservation({
        type: 'file-read',
        title,
        subtitle,
        content: files.length > 0 ? `Files: ${files.join(', ')}` : `Tool ${input.tool_name} executed`,
        narrative,
        concepts: concepts.length > 0 ? concepts : undefined,
        filesRead: files,
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
    const type = categorizeToolUse(input.tool_name);
    const files = extractFiles(input.tool_input, input.tool_response);
    const { title, narrative, facts } = buildObservation(input.tool_name, input.tool_input, input.tool_response, files);
    const subtitle = generateSubtitle(type, input.tool_name, input.tool_input, files);
    const concepts = extractConcepts(input.tool_name, input.tool_input, files);

    // Content: compact technical reference (per indicizzazione ricerca)
    const content = buildContent(input.tool_name, input.tool_input, input.tool_response);

    // Separate filesRead and filesModified based on type
    const isWrite = type === 'file-write';
    await sdk.storeObservation({
      type,
      title,
      subtitle,
      content,
      narrative,
      facts: facts || undefined,
      concepts: concepts.length > 0 ? concepts : undefined,
      filesRead: isWrite ? undefined : files,
      filesModified: isWrite ? files : undefined,
    });

    await notifyWorker('observation-created', { project, title, type });
  } finally {
    sdk.close();
  }
});

/* ── Human-readable observation builders ── */

function buildReadObservation(toolName: string, toolInput: any, files: string[]): { title: string; narrative: string } {
  const isSearch = toolName === 'grep' || toolName === 'Grep' || toolName === 'glob' || toolName === 'Glob';

  if (isSearch) {
    const query = toolInput?.pattern || toolInput?.regex || toolInput?.query || '';
    const path = toolInput?.path || '';
    const pathHint = path ? ` in ${basename(path)}` : '';
    return {
      title: `Searched for "${query}"${pathHint}`,
      narrative: `Searched codebase for pattern "${query}"${pathHint}.`
    };
  }

  // File read
  const filePath = files[0] || toolInput?.path || toolInput?.file_path || 'file';
  const fileName = basename(filePath);
  return {
    title: fileName,
    narrative: `Read ${fileName} to understand its structure and content.`
  };
}

function buildObservation(
  toolName: string,
  toolInput: any,
  toolResponse: any,
  files: string[]
): { title: string; narrative: string; facts: string | null } {
  if (!toolInput) {
    return { title: `Used ${toolName}`, narrative: `Executed tool ${toolName}.`, facts: null };
  }

  switch (toolName) {
    // File write/edit
    case 'fs_write':
    case 'write':
    case 'Write':
    case 'Edit':
    case 'NotebookEdit': {
      const filePath = toolInput.path || toolInput.file_path || toolInput.notebook_path || '';
      const fileName = basename(filePath);
      const isEdit = toolName === 'Edit' || !!toolInput.old_string;
      const verb = isEdit ? 'Modified' : 'Created';

      // Titolo breve
      const title = `${verb} ${fileName}`;

      // Rich narrative: verb + file + path + change details
      const parts: string[] = [];
      parts.push(`${verb} ${fileName}`);
      if (filePath !== fileName) parts.push(`at ${filePath}`);

      if (isEdit && toolInput.old_string && toolInput.new_string) {
        const linesChanged = toolInput.new_string.split('\n').length;
        const linesRemoved = toolInput.old_string.split('\n').length;
        if (linesChanged !== linesRemoved) {
          parts.push(`replacing ${linesRemoved} lines with ${linesChanged} lines`);
        } else {
          parts.push(`updating ${linesChanged} line${linesChanged > 1 ? 's' : ''}`);
        }
      } else if (!isEdit && toolInput.content) {
        const totalLines = toolInput.content.split('\n').length;
        parts.push(`with ${totalLines} lines of content`);
      }

      if (toolInput.description) {
        parts.push(`— ${toolInput.description}`);
      }

      return { title, narrative: parts.join(' ') + '.', facts: filePath !== fileName ? filePath : null };
    }

    // Shell commands
    case 'execute_bash':
    case 'shell':
    case 'Bash': {
      const cmd = (toolInput.command || '').trim();
      const desc = toolInput.description || '';
      const stdout = toolResponse?.stdout || '';
      const stderr = toolResponse?.stderr || '';
      const success = !toolResponse?.interrupted && !stderr;

      // Titolo breve: description o comando pulito
      const cleanCmd = cmd.split('|')[0].split('2>&1')[0].split('&&')[0].trim();
      const shortCmd = cleanCmd.length > 60 ? cleanCmd.substring(0, 57) + '...' : cleanCmd;
      const title = desc || shortCmd;

      // Narrativa ricca: desc + comando + output + status
      const parts: string[] = [];
      if (desc) parts.push(`${desc}.`);
      parts.push(`Ran \`${shortCmd}\``);

      // Add output summary (last significant lines)
      if (stdout) {
        const lines = stdout.split('\n').map((l: string) => l.trim()).filter((l: string) => l.length > 0);
        const outputLines = lines.slice(-3).join('; '); // Last 3 lines (often the most significant)
        if (outputLines) parts.push(`— output: ${outputLines.substring(0, 150)}`);
      }

      if (!success && stderr) {
        const errLine = stderr.split('\n')[0]?.trim();
        parts.push(`Error: ${errLine ? errLine.substring(0, 100) : 'command failed'}`);
      } else if (success) {
        parts.push('(success)');
      }

      return { title, narrative: parts.join(' '), facts: cmd };
    }

    // Web search
    case 'web_search':
    case 'WebSearch': {
      const query = toolInput.query || '';
      return {
        title: `Searched: ${query}`,
        narrative: `Searched the web for "${query}" to find relevant documentation and resources.`,
        facts: null
      };
    }

    case 'web_fetch':
    case 'WebFetch': {
      const url = toolInput.url || '';
      const domain = url.replace(/^https?:\/\//, '').split('/')[0] || url;
      return {
        title: `Fetched ${domain}`,
        narrative: `Fetched content from ${url} to retrieve documentation or reference material.`,
        facts: url
      };
    }

    // Delegation / sub-agents
    case 'delegate':
    case 'use_subagent':
    case 'Task': {
      const task = toolInput.task || toolInput.prompt || toolInput.description || '';
      const agentType = toolInput.subagent_type || toolInput.agent_type || '';
      const shortTask = task.length > 150 ? task.substring(0, 147) + '...' : task;
      const agentHint = agentType ? ` (${agentType} agent)` : '';
      return {
        title: shortTask || 'Delegated task',
        narrative: `Delegated work to a sub-agent${agentHint}: ${shortTask}`,
        facts: agentType || null
      };
    }

    default: {
      const desc = toolInput.description || toolInput.prompt || toolInput.query || '';
      return {
        title: desc ? desc.substring(0, 100) : `Used ${toolName}`,
        narrative: desc ? `${desc}. Executed via ${toolName}.` : `Executed tool ${toolName}.`,
        facts: null
      };
    }
  }
}

/* ── Technical content (kept for search indexing) ── */
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
    'fs_write': 'file-write', 'write': 'file-write', 'Write': 'file-write', 'Edit': 'file-write', 'NotebookEdit': 'file-write',
    'fs_read': 'file-read', 'read': 'file-read', 'Read': 'file-read', 'glob': 'file-read', 'Glob': 'file-read', 'grep': 'file-read', 'Grep': 'file-read',
    'execute_bash': 'command', 'shell': 'command', 'Bash': 'command',
    'web_search': 'research', 'WebSearch': 'research', 'web_fetch': 'research', 'WebFetch': 'research',
    'delegate': 'delegation', 'use_subagent': 'delegation', 'Task': 'delegation',
  };
  return categories[toolName] || 'tool-use';
}

function extractFiles(toolInput: any, toolResponse: any): string[] {
  const files: string[] = [];
  if (toolInput?.path) files.push(toolInput.path);
  if (toolInput?.file_path) files.push(toolInput.file_path);
  if (toolInput?.paths && Array.isArray(toolInput.paths)) files.push(...toolInput.paths);
  return [...new Set(files)];
}

function basename(filePath: string): string {
  return filePath.split('/').pop() || filePath;
}

/* ── Automatic concept tag extraction from context ── */
function extractConcepts(toolName: string, toolInput: any, files: string[]): string[] {
  const concepts = new Set<string>();

  // Analyze file paths to extract concepts
  for (const file of files) {
    const lower = file.toLowerCase();
    if (lower.includes('test') || lower.includes('spec')) concepts.add('testing');
    if (lower.includes('component') || lower.includes('/ui/') || lower.includes('/viewer/')) concepts.add('ui-component');
    if (lower.includes('hook') || lower.includes('/hooks/')) concepts.add('hooks');
    if (lower.includes('migration') || lower.includes('database') || lower.includes('sqlite') || lower.includes('.sql')) concepts.add('database');
    if (lower.includes('api') || lower.includes('route') || lower.includes('endpoint')) concepts.add('api');
    if (lower.includes('config') || lower.includes('.env') || lower.includes('settings')) concepts.add('configuration');
    if (lower.includes('style') || lower.includes('.css') || lower.includes('tailwind') || lower.includes('theme')) concepts.add('styling');
    if (lower.includes('type') || lower.includes('interface') || lower.includes('.d.ts')) concepts.add('types');
    if (lower.includes('sdk') || lower.includes('lib/')) concepts.add('sdk');
    if (lower.includes('build') || lower.includes('esbuild') || lower.includes('webpack') || lower.includes('vite')) concepts.add('build');
    if (lower.includes('docker') || lower.includes('deploy') || lower.includes('ci') || lower.includes('workflow')) concepts.add('devops');
    if (lower.includes('readme') || lower.includes('docs/') || lower.includes('.md')) concepts.add('documentation');
    if (lower.includes('search') || lower.includes('embedding') || lower.includes('vector')) concepts.add('search');
    if (lower.includes('server') || lower.includes('worker') || lower.includes('service')) concepts.add('backend');
  }

  // Analyze command for additional concepts
  const cmd = toolInput?.command || '';
  if (cmd) {
    const lowerCmd = cmd.toLowerCase();
    if (lowerCmd.includes('npm test') || lowerCmd.includes('bun test') || lowerCmd.includes('jest') || lowerCmd.includes('vitest')) concepts.add('testing');
    if (lowerCmd.includes('npm run build') || lowerCmd.includes('bun build') || lowerCmd.includes('esbuild')) concepts.add('build');
    if (lowerCmd.includes('npm install') || lowerCmd.includes('bun add') || lowerCmd.includes('pnpm add')) concepts.add('dependencies');
    if (lowerCmd.includes('git ')) concepts.add('git');
    if (lowerCmd.includes('docker') || lowerCmd.includes('compose')) concepts.add('devops');
    if (lowerCmd.includes('lint') || lowerCmd.includes('eslint') || lowerCmd.includes('prettier')) concepts.add('code-quality');
    if (lowerCmd.includes('debug') || lowerCmd.includes('inspect') || lowerCmd.includes('strace')) concepts.add('debugging');
    if (lowerCmd.includes('curl') || lowerCmd.includes('fetch') || lowerCmd.includes('wget')) concepts.add('networking');
  }

  // Analyze search patterns (grep/glob)
  const pattern = toolInput?.pattern || toolInput?.regex || toolInput?.query || '';
  if (pattern) {
    const lowerPattern = pattern.toLowerCase();
    if (lowerPattern.includes('error') || lowerPattern.includes('bug') || lowerPattern.includes('fix')) concepts.add('debugging');
    if (lowerPattern.includes('import') || lowerPattern.includes('export') || lowerPattern.includes('require')) concepts.add('module-system');
    if (lowerPattern.includes('todo') || lowerPattern.includes('fixme') || lowerPattern.includes('hack')) concepts.add('tech-debt');
  }

  // Analyze code content (new_string from Edit, content from Write)
  const codeContent = (toolInput?.new_string || toolInput?.content || '').substring(0, 2000).toLowerCase();
  if (codeContent.length > 20) {
    extractConceptsFromCode(codeContent, concepts);
  }

  return [...concepts].slice(0, 5); // Max 5 concepts per observation
}

/** Extract concepts from actual code content */
function extractConceptsFromCode(code: string, concepts: Set<string>): void {
  // React patterns
  if (/\b(usestate|useeffect|usememo|usecallback|useref|usecontext)\b/.test(code)) concepts.add('hooks');
  if (/\b(jsx|tsx|component|<\/?\w+[^>]*>)\b/.test(code)) concepts.add('ui-component');

  // API / networking
  if (/\bfetch\s*\(|\.then\s*\(|async\s+|await\s+|axios|\.get\s*\(|\.post\s*\(/.test(code)) concepts.add('api');

  // Database / SQL
  if (/\b(select|insert|update|delete|create\s+table|alter\s+table|migration)\b/.test(code)) concepts.add('database');
  if (/\b(sqlite|postgres|mysql|prisma|drizzle|knex)\b/.test(code)) concepts.add('database');

  // Testing
  if (/\b(describe|it|test|expect|assert|mock|spy|beforeeach|aftereach)\b/.test(code)) concepts.add('testing');

  // Type system
  if (/\b(interface|type\s+\w+|generic|extends|implements)\b/.test(code)) concepts.add('types');

  // Security
  if (/\b(sanitize|escape|nonce|csrf|xss|inject|auth|permission|token)\b/.test(code)) concepts.add('security');

  // Performance
  if (/\b(cache|memoize|lazy|debounce|throttle|virtualize|index)\b/.test(code)) concepts.add('performance');

  // Error handling
  if (/\btry\s*\{|catch\s*\(|throw\s+new|\.catch\s*\(|onerror/.test(code)) concepts.add('error-handling');
}

/* ── Generate subtitle distinct from title ── */
function generateSubtitle(type: string, toolName: string, toolInput: any, files: string[]): string {
  const filePath = files[0] || toolInput?.path || toolInput?.file_path || '';
  // Relative path: remove home and project name
  const relativePath = filePath.replace(/^\/home\/[^/]+\/[^/]+\//, '');

  switch (type) {
    case 'file-write': {
      const isEdit = toolName === 'Edit' || !!toolInput?.old_string;
      return relativePath ? `${isEdit ? 'edit' : 'new'} ${relativePath}` : isEdit ? 'file edit' : 'new file';
    }
    case 'file-read': {
      const isSearch = ['grep', 'Grep', 'glob', 'Glob'].includes(toolName);
      if (isSearch) {
        const searchPath = toolInput?.path || '';
        const relSearch = searchPath.replace(/^\/home\/[^/]+\/[^/]+\//, '') || '.';
        return `search in ${relSearch}`;
      }
      return relativePath ? relativePath : 'file read';
    }
    case 'command': {
      const cmd = (toolInput?.command || '').trim();
      // Extract the first "program" from the command
      const program = cmd.split(/\s+/)[0]?.replace(/^[./]+/, '') || 'shell';
      return program;
    }
    case 'research': {
      const url = toolInput?.url || '';
      if (url) {
        const domain = url.replace(/^https?:\/\//, '').split('/')[0] || 'web';
        return domain;
      }
      return 'web search';
    }
    case 'delegation': {
      const agentType = toolInput?.subagent_type || toolInput?.agent_type || '';
      return agentType ? `${agentType} agent` : 'sub-agent';
    }
    default:
      return toolName;
  }
}
