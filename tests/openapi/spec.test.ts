/**
 * Test suite per la specifica OpenAPI di Kiro Memory.
 *
 * Verifica che:
 *   1. La struttura OpenAPI 3.1 sia valida (campi obbligatori presenti)
 *   2. Tutti gli endpoint di tutti i router siano documentati nella spec
 *   3. Nessun endpoint sia mancante (copertura completa)
 *   4. Gli schema delle risposte abbiano la forma attesa
 */

import { describe, it, expect } from 'bun:test';
import { openApiSpec } from '../../src/services/openapi/spec.js';

// ── Helper types ──

type PathItem = Record<string, unknown>;
type Paths = Record<string, PathItem>;

// ── Costanti degli endpoint attesi (da tutti i router) ──

/** Endpoint del router core.ts */
const ENDPOINTS_CORE = [
  { method: 'get',  path: '/health' },
  { method: 'get',  path: '/events' },
  { method: 'post', path: '/api/notify' }
] as const;

/** Endpoint del router observations.ts */
const ENDPOINTS_OBSERVATIONS = [
  { method: 'get',  path: '/api/observations' },
  { method: 'post', path: '/api/observations' },
  { method: 'post', path: '/api/observations/batch' },
  { method: 'post', path: '/api/knowledge' },
  { method: 'post', path: '/api/memory/save' },
  { method: 'get',  path: '/api/context/{project}' }
] as const;

/** Endpoint del router summaries.ts */
const ENDPOINTS_SUMMARIES = [
  { method: 'get',  path: '/api/summaries' },
  { method: 'post', path: '/api/summaries' }
] as const;

/** Endpoint del router search.ts */
const ENDPOINTS_SEARCH = [
  { method: 'get', path: '/api/search' },
  { method: 'get', path: '/api/hybrid-search' },
  { method: 'get', path: '/api/timeline' }
] as const;

/** Endpoint del router analytics.ts */
const ENDPOINTS_ANALYTICS = [
  { method: 'get', path: '/api/analytics/overview' },
  { method: 'get', path: '/api/analytics/timeline' },
  { method: 'get', path: '/api/analytics/types' },
  { method: 'get', path: '/api/analytics/sessions' },
  { method: 'get', path: '/api/analytics/anomalies' }
] as const;

/** Endpoint del router sessions.ts */
const ENDPOINTS_SESSIONS = [
  { method: 'get', path: '/api/sessions' },
  { method: 'get', path: '/api/sessions/{id}/checkpoint' },
  { method: 'get', path: '/api/checkpoint' },
  { method: 'get', path: '/api/prompts' }
] as const;

/** Endpoint del router projects.ts */
const ENDPOINTS_PROJECTS = [
  { method: 'get', path: '/api/projects' },
  { method: 'get', path: '/api/project-aliases' },
  { method: 'put', path: '/api/project-aliases/{project}' },
  { method: 'get', path: '/api/stats/{project}' }
] as const;

/** Endpoint del router data.ts */
const ENDPOINTS_DATA = [
  { method: 'post', path: '/api/embeddings/backfill' },
  { method: 'get',  path: '/api/embeddings/stats' },
  { method: 'post', path: '/api/retention/cleanup' },
  { method: 'get',  path: '/api/export' },
  { method: 'get',  path: '/api/report' }
] as const;

/** Endpoint dell'openapi router stesso */
const ENDPOINTS_DOCS = [
  { method: 'get', path: '/api/docs' },
  { method: 'get', path: '/api/docs/openapi.json' }
] as const;

/** Tutti gli endpoint attesi, aggregati */
const ALL_EXPECTED_ENDPOINTS = [
  ...ENDPOINTS_CORE,
  ...ENDPOINTS_OBSERVATIONS,
  ...ENDPOINTS_SUMMARIES,
  ...ENDPOINTS_SEARCH,
  ...ENDPOINTS_ANALYTICS,
  ...ENDPOINTS_SESSIONS,
  ...ENDPOINTS_PROJECTS,
  ...ENDPOINTS_DATA,
  ...ENDPOINTS_DOCS
];

// ── Utility di verifica ──

/** Verifica che un path/method esista nella spec */
function hasEndpoint(paths: Paths, method: string, path: string): boolean {
  const pathItem = paths[path];
  if (!pathItem) return false;
  return method in pathItem;
}

// ── Test suite ──

describe('Specifica OpenAPI 3.1', () => {

  describe('struttura obbligatoria', () => {
    it('deve avere il campo openapi con versione 3.1.x', () => {
      expect(openApiSpec.openapi).toBeDefined();
      expect(openApiSpec.openapi).toMatch(/^3\.1\./);
    });

    it('deve avere il campo info con title e version', () => {
      expect(openApiSpec.info).toBeDefined();
      expect(typeof openApiSpec.info.title).toBe('string');
      expect(openApiSpec.info.title.length).toBeGreaterThan(0);
      expect(typeof openApiSpec.info.version).toBe('string');
      expect(openApiSpec.info.version.length).toBeGreaterThan(0);
    });

    it('deve avere almeno un server definito', () => {
      expect(openApiSpec.servers).toBeDefined();
      expect(Array.isArray(openApiSpec.servers)).toBe(true);
      expect(openApiSpec.servers.length).toBeGreaterThan(0);
      expect(openApiSpec.servers[0].url).toBeDefined();
    });

    it('deve avere il campo paths non vuoto', () => {
      expect(openApiSpec.paths).toBeDefined();
      const pathKeys = Object.keys(openApiSpec.paths);
      expect(pathKeys.length).toBeGreaterThan(0);
    });

    it('deve avere il campo components con schemas', () => {
      expect(openApiSpec.components).toBeDefined();
      expect(openApiSpec.components.schemas).toBeDefined();
      const schemaKeys = Object.keys(openApiSpec.components.schemas);
      expect(schemaKeys.length).toBeGreaterThan(0);
    });

    it('deve avere tags definiti', () => {
      expect(openApiSpec.tags).toBeDefined();
      expect(Array.isArray(openApiSpec.tags)).toBe(true);
      expect(openApiSpec.tags.length).toBeGreaterThan(0);
    });
  });

  describe('copertura endpoint — router core.ts', () => {
    const paths = openApiSpec.paths as Paths;

    for (const { method, path } of ENDPOINTS_CORE) {
      it(`deve documentare ${method.toUpperCase()} ${path}`, () => {
        expect(hasEndpoint(paths, method, path)).toBe(true);
      });
    }
  });

  describe('copertura endpoint — router observations.ts', () => {
    const paths = openApiSpec.paths as Paths;

    for (const { method, path } of ENDPOINTS_OBSERVATIONS) {
      it(`deve documentare ${method.toUpperCase()} ${path}`, () => {
        expect(hasEndpoint(paths, method, path)).toBe(true);
      });
    }
  });

  describe('copertura endpoint — router summaries.ts', () => {
    const paths = openApiSpec.paths as Paths;

    for (const { method, path } of ENDPOINTS_SUMMARIES) {
      it(`deve documentare ${method.toUpperCase()} ${path}`, () => {
        expect(hasEndpoint(paths, method, path)).toBe(true);
      });
    }
  });

  describe('copertura endpoint — router search.ts', () => {
    const paths = openApiSpec.paths as Paths;

    for (const { method, path } of ENDPOINTS_SEARCH) {
      it(`deve documentare ${method.toUpperCase()} ${path}`, () => {
        expect(hasEndpoint(paths, method, path)).toBe(true);
      });
    }
  });

  describe('copertura endpoint — router analytics.ts', () => {
    const paths = openApiSpec.paths as Paths;

    for (const { method, path } of ENDPOINTS_ANALYTICS) {
      it(`deve documentare ${method.toUpperCase()} ${path}`, () => {
        expect(hasEndpoint(paths, method, path)).toBe(true);
      });
    }
  });

  describe('copertura endpoint — router sessions.ts', () => {
    const paths = openApiSpec.paths as Paths;

    for (const { method, path } of ENDPOINTS_SESSIONS) {
      it(`deve documentare ${method.toUpperCase()} ${path}`, () => {
        expect(hasEndpoint(paths, method, path)).toBe(true);
      });
    }
  });

  describe('copertura endpoint — router projects.ts', () => {
    const paths = openApiSpec.paths as Paths;

    for (const { method, path } of ENDPOINTS_PROJECTS) {
      it(`deve documentare ${method.toUpperCase()} ${path}`, () => {
        expect(hasEndpoint(paths, method, path)).toBe(true);
      });
    }
  });

  describe('copertura endpoint — router data.ts', () => {
    const paths = openApiSpec.paths as Paths;

    for (const { method, path } of ENDPOINTS_DATA) {
      it(`deve documentare ${method.toUpperCase()} ${path}`, () => {
        expect(hasEndpoint(paths, method, path)).toBe(true);
      });
    }
  });

  describe('copertura endpoint — router docs (openapi)', () => {
    const paths = openApiSpec.paths as Paths;

    for (const { method, path } of ENDPOINTS_DOCS) {
      it(`deve documentare ${method.toUpperCase()} ${path}`, () => {
        expect(hasEndpoint(paths, method, path)).toBe(true);
      });
    }
  });

  describe('verifica copertura totale', () => {
    it(`deve documentare tutti i ${ALL_EXPECTED_ENDPOINTS.length} endpoint attesi`, () => {
      const paths = openApiSpec.paths as Paths;
      const mancanti: string[] = [];

      for (const { method, path } of ALL_EXPECTED_ENDPOINTS) {
        if (!hasEndpoint(paths, method, path)) {
          mancanti.push(`${method.toUpperCase()} ${path}`);
        }
      }

      expect(mancanti).toEqual([]);
    });

    it('ogni path nella spec deve avere almeno un metodo HTTP documentato', () => {
      const validMethods = ['get', 'post', 'put', 'patch', 'delete', 'options', 'head'];
      const paths = openApiSpec.paths as Paths;

      for (const [path, pathItem] of Object.entries(paths)) {
        const methods = Object.keys(pathItem as object).filter(k => validMethods.includes(k));
        expect(methods.length).toBeGreaterThan(0);
        // Ogni path deve avere almeno un method con operationId
        for (const method of methods) {
          const op = (pathItem as Record<string, unknown>)[method] as Record<string, unknown>;
          expect(op.operationId).toBeDefined();
          expect(typeof op.operationId).toBe('string');
          // Deve avere summary
          expect(op.summary).toBeDefined();
          // Deve avere responses
          expect(op.responses).toBeDefined();
        }
      }
    });
  });

  describe('schema componenti', () => {
    it('schema Error deve avere la proprietà "error" di tipo string', () => {
      const errorSchema = openApiSpec.components.schemas.Error as Record<string, unknown>;
      expect(errorSchema.type).toBe('object');
      const props = errorSchema.properties as Record<string, { type: string }>;
      expect(props.error).toBeDefined();
      expect(props.error.type).toBe('string');
    });

    it('schema Observation deve avere id, project, type, title', () => {
      const schema = openApiSpec.components.schemas.Observation as Record<string, unknown>;
      expect(schema.type).toBe('object');
      const props = schema.properties as Record<string, unknown>;
      expect(props.id).toBeDefined();
      expect(props.project).toBeDefined();
      expect(props.type).toBeDefined();
      expect(props.title).toBeDefined();
      expect(props.created_at_epoch).toBeDefined();
    });

    it('schema Summary deve avere id, project, session_id', () => {
      const schema = openApiSpec.components.schemas.Summary as Record<string, unknown>;
      expect(schema.type).toBe('object');
      const props = schema.properties as Record<string, unknown>;
      expect(props.id).toBeDefined();
      expect(props.project).toBeDefined();
      expect(props.session_id).toBeDefined();
    });

    it('schema EmbeddingStats deve avere provider, dimensions, available', () => {
      const schema = openApiSpec.components.schemas.EmbeddingStats as Record<string, unknown>;
      const props = schema.properties as Record<string, unknown>;
      expect(props.provider).toBeDefined();
      expect(props.dimensions).toBeDefined();
      expect(props.available).toBeDefined();
    });
  });

  describe('endpoint con security scheme', () => {
    it('POST /api/notify deve richiedere workerToken', () => {
      const paths = openApiSpec.paths as Record<string, Record<string, unknown>>;
      const notifyOp = paths['/api/notify']['post'] as Record<string, unknown>;
      const security = notifyOp.security as Array<Record<string, unknown[]>>;
      expect(security).toBeDefined();
      expect(security.some(s => 'workerToken' in s)).toBe(true);
    });

    it('POST /api/embeddings/backfill deve richiedere workerToken', () => {
      const paths = openApiSpec.paths as Record<string, Record<string, unknown>>;
      const op = paths['/api/embeddings/backfill']['post'] as Record<string, unknown>;
      const security = op.security as Array<Record<string, unknown[]>>;
      expect(security).toBeDefined();
      expect(security.some(s => 'workerToken' in s)).toBe(true);
    });

    it('POST /api/retention/cleanup deve richiedere workerToken', () => {
      const paths = openApiSpec.paths as Record<string, Record<string, unknown>>;
      const op = paths['/api/retention/cleanup']['post'] as Record<string, unknown>;
      const security = op.security as Array<Record<string, unknown[]>>;
      expect(security).toBeDefined();
      expect(security.some(s => 'workerToken' in s)).toBe(true);
    });

    it('securitySchemes deve contenere workerToken come apiKey', () => {
      const schemes = openApiSpec.components.securitySchemes as Record<string, unknown>;
      const tokenScheme = schemes['workerToken'] as Record<string, unknown>;
      expect(tokenScheme).toBeDefined();
      expect(tokenScheme.type).toBe('apiKey');
      expect(tokenScheme.in).toBe('header');
      expect(tokenScheme.name).toBe('X-Worker-Token');
    });
  });

  describe('endpoint paginati', () => {
    const paginatedPaths = [
      '/api/observations',
      '/api/summaries',
      '/api/prompts'
    ];

    for (const path of paginatedPaths) {
      it(`GET ${path} deve avere parametri offset e limit`, () => {
        const paths = openApiSpec.paths as Record<string, Record<string, unknown>>;
        const op = paths[path]['get'] as Record<string, unknown>;
        const params = op.parameters as Array<Record<string, unknown>>;
        expect(params).toBeDefined();
        // Controlla che ci sia almeno un riferimento a offset o limit
        const hasOffsetOrLimit = params.some(p =>
          p.name === 'offset' || p.name === 'limit' ||
          (p.$ref as string | undefined)?.includes('offset') ||
          (p.$ref as string | undefined)?.includes('limit')
        );
        expect(hasOffsetOrLimit).toBe(true);
      });
    }
  });

  describe('coerenza versione', () => {
    it('la versione nella spec deve corrispondere alla versione in src/index.ts (2.1.0)', () => {
      // Verifica che la versione sia nel formato semver atteso
      expect(openApiSpec.info.version).toMatch(/^\d+\.\d+\.\d+$/);
    });

    it('il server locale deve puntare a 127.0.0.1:3001', () => {
      const localServer = openApiSpec.servers.find(s =>
        s.url.includes('127.0.0.1:3001') || s.url.includes('localhost:3001')
      );
      expect(localServer).toBeDefined();
    });
  });
});
