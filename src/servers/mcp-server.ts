#!/usr/bin/env node
/**
 * Kiro Memory MCP Server
 *
 * MCP (Model Context Protocol) server exposing memory search tools.
 * Lightweight proxy: delegates all operations to the Worker HTTP (port 3001).
 *
 * Usage: register in ~/.kiro/settings/mcp.json or in the agent config.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema
} from '@modelcontextprotocol/sdk/types.js';

// Redirect console.log to stderr to avoid breaking MCP protocol (uses stdio)
const originalLog = console.log;
console.log = (...args: any[]) => console.error('[kiro-memory-mcp]', ...args);

const WORKER_HOST = process.env.KIRO_MEMORY_WORKER_HOST || '127.0.0.1';
const WORKER_PORT = process.env.KIRO_MEMORY_WORKER_PORT || '3001';
const WORKER_BASE = `http://${WORKER_HOST}:${WORKER_PORT}`;

// ============================================================================
// HTTP helper to communicate with the Worker
// ============================================================================

async function callWorkerGET(endpoint: string, params: Record<string, string> = {}): Promise<any> {
  const url = new URL(endpoint, WORKER_BASE);
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, v);
  });

  const resp = await fetch(url.toString(), { signal: AbortSignal.timeout(10000) });
  if (!resp.ok) throw new Error(`Worker ${resp.status}: ${await resp.text()}`);
  return resp.json();
}

async function callWorkerPOST(endpoint: string, body: any): Promise<any> {
  const url = new URL(endpoint, WORKER_BASE);
  const resp = await fetch(url.toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10000)
  });
  if (!resp.ok) throw new Error(`Worker ${resp.status}: ${await resp.text()}`);
  return resp.json();
}

// ============================================================================
// MCP Tool Definitions
// ============================================================================

const TOOLS = [
  {
    name: 'search',
    description: 'Search Kiro Memory. Returns observations and summaries matching the query. Use this tool to find context from previous sessions.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        query: { type: 'string', description: 'Text to search in observations and summaries' },
        project: { type: 'string', description: 'Filter by project name (optional)' },
        type: { type: 'string', description: 'Filter by observation type: file-write, command, research, tool-use (optional)' },
        limit: { type: 'number', description: 'Max number of results (default: 20)' }
      },
      required: ['query']
    }
  },
  {
    name: 'timeline',
    description: 'Show chronological context around a specific observation. Useful to understand what happened before and after an event.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        anchor: { type: 'number', description: 'Observation ID as reference point' },
        depth_before: { type: 'number', description: 'Number of observations before (default: 5)' },
        depth_after: { type: 'number', description: 'Number of observations after (default: 5)' }
      },
      required: ['anchor']
    }
  },
  {
    name: 'get_observations',
    description: 'Retrieve full details of specific observations by ID. Use after "search" to get the complete content.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        ids: {
          type: 'array',
          items: { type: 'number' },
          description: 'Array of observation IDs to retrieve'
        }
      },
      required: ['ids']
    }
  },
  {
    name: 'get_context',
    description: 'Retrieve recent context for a project: observations, summaries, and recent prompts.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        project: { type: 'string', description: 'Project name' }
      },
      required: ['project']
    }
  }
];

// ============================================================================
// Tool Handlers
// ============================================================================

type ToolHandler = (args: any) => Promise<string>;

const handlers: Record<string, ToolHandler> = {
  async search(args: { query: string; project?: string; type?: string; limit?: number }) {
    const result = await callWorkerGET('/api/search', {
      q: args.query,
      project: args.project || '',
      type: args.type || '',
      limit: String(args.limit || 20)
    });

    const obs = result.observations || [];
    const sums = result.summaries || [];

    if (obs.length === 0 && sums.length === 0) {
      return 'No results found for the query.';
    }

    let output = `## Search Results: "${args.query}"\n\n`;

    if (obs.length > 0) {
      output += `### Observations (${obs.length})\n\n`;
      output += '| ID | Type | Title | Date |\n|---|---|---|---|\n';
      obs.forEach((o: any) => {
        output += `| ${o.id} | ${o.type} | ${o.title} | ${o.created_at?.split('T')[0] || ''} |\n`;
      });
      output += '\n';
    }

    if (sums.length > 0) {
      output += `### Summaries (${sums.length})\n\n`;
      sums.forEach((s: any) => {
        if (s.learned) output += `- **Learned**: ${s.learned}\n`;
        if (s.completed) output += `- **Completed**: ${s.completed}\n`;
      });
    }

    return output;
  },

  async timeline(args: { anchor: number; depth_before?: number; depth_after?: number }) {
    const result = await callWorkerGET('/api/timeline', {
      anchor: String(args.anchor),
      depth_before: String(args.depth_before || 5),
      depth_after: String(args.depth_after || 5)
    });

    const entries = result.timeline || result || [];
    if (!Array.isArray(entries) || entries.length === 0) {
      return `No context found around observation ${args.anchor}.`;
    }

    let output = `## Timeline around observation #${args.anchor}\n\n`;
    entries.forEach((e: any) => {
      const marker = e.id === args.anchor ? '→ ' : '  ';
      output += `${marker}**#${e.id}** [${e.type}] ${e.title} (${e.created_at?.split('T')[0] || ''})\n`;
      if (e.content) output += `  ${e.content.substring(0, 200)}\n`;
      output += '\n';
    });

    return output;
  },

  async get_observations(args: { ids: number[] }) {
    const result = await callWorkerPOST('/api/observations/batch', { ids: args.ids });
    const obs = result.observations || result || [];

    if (!Array.isArray(obs) || obs.length === 0) {
      return 'No observations found for the specified IDs.';
    }

    let output = `## Observation Details\n\n`;
    obs.forEach((o: any) => {
      output += `### #${o.id}: ${o.title}\n`;
      output += `- **Type**: ${o.type}\n`;
      output += `- **Project**: ${o.project}\n`;
      output += `- **Date**: ${o.created_at}\n`;
      if (o.text) output += `- **Content**: ${o.text}\n`;
      if (o.narrative) output += `- **Narrative**: ${o.narrative}\n`;
      if (o.concepts) output += `- **Concepts**: ${o.concepts}\n`;
      if (o.files_read) output += `- **Files read**: ${o.files_read}\n`;
      if (o.files_modified) output += `- **Files modified**: ${o.files_modified}\n`;
      output += '\n';
    });

    return output;
  },

  async get_context(args: { project: string }) {
    const result = await callWorkerGET(`/api/context/${encodeURIComponent(args.project)}`);

    const obs = result.observations || [];
    const sums = result.summaries || [];

    let output = `## Context: ${args.project}\n\n`;

    if (sums.length > 0) {
      output += `### Recent Summaries\n\n`;
      sums.forEach((s: any) => {
        if (s.request) output += `**Request**: ${s.request}\n`;
        if (s.learned) output += `- Learned: ${s.learned}\n`;
        if (s.completed) output += `- Completed: ${s.completed}\n`;
        if (s.next_steps) output += `- Next steps: ${s.next_steps}\n\n`;
      });
    }

    if (obs.length > 0) {
      output += `### Recent Observations (${obs.length})\n\n`;
      obs.slice(0, 10).forEach((o: any) => {
        output += `- **${o.title}** [${o.type}]: ${(o.text || '').substring(0, 100)}\n`;
      });
    }

    return output;
  }
};

// ============================================================================
// MCP Server Setup
// ============================================================================

async function main() {
  const server = new Server(
    { name: 'kiro-memory', version: '1.0.0' },
    { capabilities: { tools: {} } }
  );

  // List available tools
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOLS
  }));

  // Execute tool
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const handler = handlers[name];

    if (!handler) {
      return {
        content: [{ type: 'text', text: `Unknown tool: ${name}` }],
        isError: true
      };
    }

    try {
      const result = await handler(args || {});
      return {
        content: [{ type: 'text', text: result }]
      };
    } catch (error: any) {
      const msg = error?.message || String(error);

      // If the Worker is unreachable, suggest how to start it
      if (msg.includes('ECONNREFUSED') || msg.includes('fetch failed')) {
        return {
          content: [{
            type: 'text',
            text: `Kiro Memory worker unreachable at ${WORKER_BASE}.\nStart the worker with: cd <kiro-memory-dir> && npm run worker:start`
          }],
          isError: true
        };
      }

      return {
        content: [{ type: 'text', text: `Error: ${msg}` }],
        isError: true
      };
    }
  });

  // Start on stdio
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.log('Kiro Memory MCP server started on stdio');
}

main().catch((err) => {
  console.error('MCP server startup error:', err);
  process.exit(1);
});
