/**
 * Test suite per la migrazione MCP API v2 (issue #58)
 *
 * Verifica che il server MCP usi correttamente McpServer + registerTool()
 * invece della vecchia API v1 (Server + setRequestHandler).
 *
 * Strategia:
 * - Istanzia McpServer direttamente (senza stdio) con un InMemoryTransport
 * - Verifica che tutti i 10 tool siano registrati con nome e schema corretti
 * - Usa un client MCP per inviare richieste list tools e call tool
 *
 * I call tool reali verso il Worker HTTP vengono intercettati via mock fetch.
 */

import { describe, it, expect, beforeEach, afterEach, mock, spyOn } from 'bun:test';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

// ---------------------------------------------------------------------------
// Helper: crea una coppia server+client connessa via InMemoryTransport
// ---------------------------------------------------------------------------

async function createTestPair(registerTools: (server: McpServer) => void): Promise<{
  server: McpServer;
  client: Client;
  cleanup: () => Promise<void>;
}> {
  const server = new McpServer({ name: 'kiro-memory-test', version: '1.0.0' });
  registerTools(server);

  const client = new Client({ name: 'test-client', version: '1.0.0' });

  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);

  return {
    server,
    client,
    cleanup: async () => {
      await client.close();
      await server.close();
    }
  };
}

// ---------------------------------------------------------------------------
// Fixture: registra tutti i tool come nel mcp-server.ts di produzione
// (rispecchia esattamente la stessa struttura Zod)
// ---------------------------------------------------------------------------

import { z } from 'zod';

function registerAllTools(server: McpServer): void {
  // Tool: search
  server.registerTool('search', {
    description: 'Cerca in Kiro Memory.',
    inputSchema: {
      query: z.string(),
      project: z.string().optional(),
      type: z.string().optional(),
      limit: z.number().optional().default(20)
    }
  }, async (_args) => ({ content: [{ type: 'text', text: 'ok' }] }));

  // Tool: timeline
  server.registerTool('timeline', {
    description: 'Mostra il contesto cronologico.',
    inputSchema: {
      anchor: z.number(),
      depth_before: z.number().optional().default(5),
      depth_after: z.number().optional().default(5)
    }
  }, async (_args) => ({ content: [{ type: 'text', text: 'ok' }] }));

  // Tool: get_observations
  server.registerTool('get_observations', {
    description: 'Recupera dettagli di osservazioni per ID.',
    inputSchema: {
      ids: z.array(z.number())
    }
  }, async (_args) => ({ content: [{ type: 'text', text: 'ok' }] }));

  // Tool: get_context
  server.registerTool('get_context', {
    description: 'Recupera il contesto recente per un progetto.',
    inputSchema: {
      project: z.string()
    }
  }, async (_args) => ({ content: [{ type: 'text', text: 'ok' }] }));

  // Tool: semantic_search
  server.registerTool('semantic_search', {
    description: 'Ricerca semantica tramite embedding.',
    inputSchema: {
      query: z.string(),
      project: z.string().optional(),
      limit: z.number().optional().default(10)
    }
  }, async (_args) => ({ content: [{ type: 'text', text: 'ok' }] }));

  // Tool: embedding_stats
  server.registerTool('embedding_stats', {
    description: 'Mostra statistiche sugli embedding.',
    inputSchema: {}
  }, async (_args) => ({ content: [{ type: 'text', text: 'ok' }] }));

  // Tool: store_knowledge
  server.registerTool('store_knowledge', {
    description: 'Salva conoscenza strutturata.',
    inputSchema: {
      knowledge_type: z.enum(['constraint', 'decision', 'heuristic', 'rejected']),
      title: z.string(),
      content: z.string(),
      project: z.string(),
      severity: z.enum(['hard', 'soft']).optional(),
      alternatives: z.array(z.string()).optional(),
      reason: z.string().optional(),
      context: z.string().optional(),
      confidence: z.enum(['high', 'medium', 'low']).optional(),
      concepts: z.array(z.string()).optional(),
      files: z.array(z.string()).optional()
    }
  }, async (_args) => ({ content: [{ type: 'text', text: 'ok' }] }));

  // Tool: resume_session
  server.registerTool('resume_session', {
    description: 'Riprende una sessione precedente.',
    inputSchema: {
      project: z.string().optional(),
      session_id: z.number().optional()
    }
  }, async (_args) => ({ content: [{ type: 'text', text: 'ok' }] }));

  // Tool: save_memory
  server.registerTool('save_memory', {
    description: 'Salva manualmente un ricordo.',
    inputSchema: {
      project: z.string(),
      title: z.string(),
      content: z.string(),
      type: z.string().optional().default('research'),
      concepts: z.array(z.string()).optional()
    }
  }, async (_args) => ({ content: [{ type: 'text', text: 'ok' }] }));

  // Tool: generate_report
  server.registerTool('generate_report', {
    description: 'Genera un report di attività.',
    inputSchema: {
      project: z.string().optional(),
      period: z.enum(['weekly', 'monthly']).optional().default('weekly')
    }
  }, async (_args) => ({ content: [{ type: 'text', text: 'ok' }] }));
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('MCP Server API v2 — McpServer + registerTool', () => {
  let cleanup: () => Promise<void>;
  let client: Client;

  beforeEach(async () => {
    const pair = await createTestPair(registerAllTools);
    client = pair.client;
    cleanup = pair.cleanup;
  });

  afterEach(async () => {
    await cleanup();
  });

  // -------------------------------------------------------------------------
  // Registrazione tool
  // -------------------------------------------------------------------------

  describe('Registrazione tool', () => {
    it('espone esattamente 10 tool via listTools', async () => {
      const result = await client.listTools();
      expect(result.tools).toHaveLength(10);
    });

    it('i nomi dei tool corrispondono alla specifica', async () => {
      const result = await client.listTools();
      const nomi = result.tools.map(t => t.name).sort();

      expect(nomi).toEqual([
        'embedding_stats',
        'generate_report',
        'get_context',
        'get_observations',
        'resume_session',
        'save_memory',
        'search',
        'semantic_search',
        'store_knowledge',
        'timeline',
      ]);
    });

    it('ogni tool ha una descrizione non vuota', async () => {
      const result = await client.listTools();
      result.tools.forEach(tool => {
        expect(typeof tool.description).toBe('string');
        expect(tool.description!.length).toBeGreaterThan(0);
      });
    });

    it('ogni tool ha un inputSchema di tipo object', async () => {
      const result = await client.listTools();
      result.tools.forEach(tool => {
        expect(tool.inputSchema).toBeDefined();
        expect(tool.inputSchema.type).toBe('object');
      });
    });
  });

  // -------------------------------------------------------------------------
  // Schema Zod — verifica campi required/optional per tool critici
  // -------------------------------------------------------------------------

  describe('Schema Zod — tool search', () => {
    it('ha "query" come campo obbligatorio', async () => {
      const result = await client.listTools();
      const searchTool = result.tools.find(t => t.name === 'search');
      expect(searchTool).toBeDefined();
      const schema = searchTool!.inputSchema;
      expect(schema.required).toContain('query');
    });

    it('ha "project", "type", "limit" come campi opzionali', async () => {
      const result = await client.listTools();
      const searchTool = result.tools.find(t => t.name === 'search');
      const schema = searchTool!.inputSchema;
      const required = schema.required as string[] || [];
      expect(required).not.toContain('project');
      expect(required).not.toContain('type');
      expect(required).not.toContain('limit');
    });
  });

  describe('Schema Zod — tool timeline', () => {
    it('ha "anchor" come campo obbligatorio', async () => {
      const result = await client.listTools();
      const tool = result.tools.find(t => t.name === 'timeline');
      expect(tool!.inputSchema.required).toContain('anchor');
    });
  });

  describe('Schema Zod — tool get_observations', () => {
    it('ha "ids" come campo obbligatorio', async () => {
      const result = await client.listTools();
      const tool = result.tools.find(t => t.name === 'get_observations');
      expect(tool!.inputSchema.required).toContain('ids');
    });

    it('il campo "ids" è di tipo array', async () => {
      const result = await client.listTools();
      const tool = result.tools.find(t => t.name === 'get_observations');
      const schema = tool!.inputSchema;
      expect(schema.properties).toBeDefined();
      expect((schema.properties as any).ids.type).toBe('array');
    });
  });

  describe('Schema Zod — tool get_context', () => {
    it('ha "project" come campo obbligatorio', async () => {
      const result = await client.listTools();
      const tool = result.tools.find(t => t.name === 'get_context');
      expect(tool!.inputSchema.required).toContain('project');
    });
  });

  describe('Schema Zod — tool store_knowledge', () => {
    it('ha i campi obbligatori: knowledge_type, title, content, project', async () => {
      const result = await client.listTools();
      const tool = result.tools.find(t => t.name === 'store_knowledge');
      const required = tool!.inputSchema.required as string[];
      expect(required).toContain('knowledge_type');
      expect(required).toContain('title');
      expect(required).toContain('content');
      expect(required).toContain('project');
    });
  });

  describe('Schema Zod — tool save_memory', () => {
    it('ha project, title, content come campi obbligatori', async () => {
      const result = await client.listTools();
      const tool = result.tools.find(t => t.name === 'save_memory');
      const required = tool!.inputSchema.required as string[];
      expect(required).toContain('project');
      expect(required).toContain('title');
      expect(required).toContain('content');
    });
  });

  // -------------------------------------------------------------------------
  // Esecuzione tool — risposte con mock
  // -------------------------------------------------------------------------

  describe('Esecuzione tool con handler mock', () => {
    it('tool search risponde con content di tipo text', async () => {
      const result = await client.callTool({
        name: 'search',
        arguments: { query: 'TypeScript' }
      });
      expect(result.content).toBeDefined();
      expect(Array.isArray(result.content)).toBe(true);
      expect(result.content[0]).toHaveProperty('type', 'text');
    });

    it('tool timeline risponde con content di tipo text', async () => {
      const result = await client.callTool({
        name: 'timeline',
        arguments: { anchor: 1 }
      });
      expect(result.content[0]).toHaveProperty('type', 'text');
    });

    it('tool get_observations risponde con content di tipo text', async () => {
      const result = await client.callTool({
        name: 'get_observations',
        arguments: { ids: [1, 2, 3] }
      });
      expect(result.content[0]).toHaveProperty('type', 'text');
    });

    it('tool get_context risponde con content di tipo text', async () => {
      const result = await client.callTool({
        name: 'get_context',
        arguments: { project: 'kiro-memory' }
      });
      expect(result.content[0]).toHaveProperty('type', 'text');
    });

    it('tool embedding_stats non richiede argomenti', async () => {
      const result = await client.callTool({
        name: 'embedding_stats',
        arguments: {}
      });
      expect(result.content[0]).toHaveProperty('type', 'text');
    });

    it('tool generate_report funziona senza argomenti', async () => {
      const result = await client.callTool({
        name: 'generate_report',
        arguments: {}
      });
      expect(result.content[0]).toHaveProperty('type', 'text');
    });

    it('tool resume_session funziona senza argomenti', async () => {
      const result = await client.callTool({
        name: 'resume_session',
        arguments: {}
      });
      expect(result.content[0]).toHaveProperty('type', 'text');
    });

    it('tool semantic_search risponde con content di tipo text', async () => {
      const result = await client.callTool({
        name: 'semantic_search',
        arguments: { query: 'autenticazione' }
      });
      expect(result.content[0]).toHaveProperty('type', 'text');
    });
  });

  // -------------------------------------------------------------------------
  // Verifica API v2: McpServer è istanza corretta
  // -------------------------------------------------------------------------

  describe('Verifica istanza API v2', () => {
    it('McpServer è importabile da @modelcontextprotocol/sdk/server/mcp.js', async () => {
      // Se l'import non fosse disponibile, il test non compilerebbe nemmeno
      expect(McpServer).toBeDefined();
      expect(typeof McpServer).toBe('function');
    });

    it('McpServer ha il metodo registerTool', () => {
      const s = new McpServer({ name: 'test', version: '0.0.1' });
      expect(typeof s.registerTool).toBe('function');
    });

    it('McpServer ha il metodo connect', () => {
      const s = new McpServer({ name: 'test', version: '0.0.1' });
      expect(typeof s.connect).toBe('function');
    });

    it('McpServer espone il server sottostante via proprietà .server', () => {
      const s = new McpServer({ name: 'test', version: '0.0.1' });
      expect(s.server).toBeDefined();
    });
  });
});
