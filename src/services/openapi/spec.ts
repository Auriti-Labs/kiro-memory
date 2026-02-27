/**
 * Specifica OpenAPI 3.1 per il worker REST di Kiro Memory.
 *
 * Documento hand-written che copre TUTTI gli endpoint dei router modulari:
 *   - core.ts         → /health, /events, POST /api/notify
 *   - observations.ts → GET/POST /api/observations, POST /api/observations/batch,
 *                       POST /api/knowledge, POST /api/memory/save, GET /api/context/:project
 *   - summaries.ts    → GET/POST /api/summaries
 *   - search.ts       → GET /api/search, /api/hybrid-search, /api/timeline
 *   - analytics.ts    → GET /api/analytics/overview|timeline|types|sessions|anomalies
 *   - sessions.ts     → GET /api/sessions, /api/sessions/:id/checkpoint,
 *                       /api/checkpoint, /api/prompts
 *   - projects.ts     → GET /api/projects, GET/PUT /api/project-aliases,
 *                       GET /api/stats/:project
 *   - data.ts         → POST /api/embeddings/backfill, GET /api/embeddings/stats,
 *                       POST /api/retention/cleanup, GET /api/export, GET /api/report
 */

// ── Componenti riutilizzabili ──

/** Schema di errore standard */
const ErrorSchema = {
  type: 'object',
  properties: {
    error: { type: 'string', description: 'Messaggio di errore leggibile' }
  },
  required: ['error']
} as const;

/** Schema osservazione completo (row SQLite) */
const ObservationSchema = {
  type: 'object',
  properties: {
    id:               { type: 'integer' },
    session_id:       { type: 'string' },
    project:          { type: 'string' },
    type:             { type: 'string' },
    title:            { type: 'string' },
    narrative:        { type: ['string', 'null'] },
    content:          { type: ['string', 'null'] },
    summary:          { type: ['string', 'null'] },
    metadata:         { type: ['string', 'null'] },
    concepts:         { type: ['string', 'null'] },
    files:            { type: ['string', 'null'] },
    raw_payload:      { type: ['string', 'null'] },
    discovery_tokens: { type: 'integer' },
    created_at_epoch: { type: 'integer' }
  }
} as const;

/** Schema riassunto sessione */
const SummarySchema = {
  type: 'object',
  properties: {
    id:               { type: 'integer' },
    session_id:       { type: 'string' },
    project:          { type: 'string' },
    request:          { type: ['string', 'null'] },
    learned:          { type: ['string', 'null'] },
    completed:        { type: ['string', 'null'] },
    next_steps:       { type: ['string', 'null'] },
    raw_payload:      { type: ['string', 'null'] },
    created_at_epoch: { type: 'integer' }
  }
} as const;

/** Schema sessione */
const SessionSchema = {
  type: 'object',
  properties: {
    id:               { type: 'integer' },
    session_id:       { type: 'string' },
    project:          { type: 'string' },
    started_at_epoch: { type: 'integer' },
    ended_at_epoch:   { type: ['integer', 'null'] }
  }
} as const;

/** Schema prompt utente */
const PromptSchema = {
  type: 'object',
  properties: {
    id:               { type: 'integer' },
    session_id:       { type: 'string' },
    project:          { type: 'string' },
    prompt:           { type: 'string' },
    created_at_epoch: { type: 'integer' }
  }
} as const;

/** Risposta paginata con header X-Total-Count */
function paginatedResponse(itemSchema: object) {
  return {
    description: 'Lista paginata. Il totale è incluso nell\'header X-Total-Count.',
    headers: {
      'X-Total-Count': {
        schema: { type: 'integer' },
        description: 'Numero totale di record nel database'
      }
    },
    content: {
      'application/json': {
        schema: {
          type: 'array',
          items: itemSchema
        }
      }
    }
  };
}

/** Risposta errore standard */
function errorResponse(description: string) {
  return {
    description,
    content: {
      'application/json': {
        schema: ErrorSchema
      }
    }
  };
}

// ── Specifica OpenAPI 3.1 ──

export const openApiSpec = {
  openapi: '3.1.0',
  info: {
    title: 'Kiro Memory REST API',
    version: '3.0.1',
    description: [
      'API REST del worker Kiro Memory (porta 3001).',
      'Fornisce accesso a osservazioni, sommari, sessioni, ricerca,',
      'analytics, export, embeddings vettoriali e gestione progetti.'
    ].join(' '),
    license: { name: 'MIT' },
    contact: {
      name: 'Auriti-Labs',
      url: 'https://github.com/Auriti-Labs/kiro-memory'
    }
  },
  servers: [
    { url: 'http://127.0.0.1:3001', description: 'Worker locale (default)' }
  ],

  // ── Componenti condivisi ──
  components: {
    schemas: {
      Error:       ErrorSchema,
      Observation: ObservationSchema,
      Summary:     SummarySchema,
      Session:     SessionSchema,
      Prompt:      PromptSchema,
      Checkpoint: {
        type: 'object',
        properties: {
          id:               { type: 'integer' },
          session_id:       { type: 'integer' },
          project:          { type: 'string' },
          content:          { type: 'string' },
          created_at_epoch: { type: 'integer' }
        }
      },
      AnalyticsOverview: {
        type: 'object',
        properties: {
          totalObservations: { type: 'integer' },
          totalSummaries:    { type: 'integer' },
          totalPrompts:      { type: 'integer' },
          totalSessions:     { type: 'integer' },
          projects:          { type: 'array', items: { type: 'string' } }
        }
      },
      TimelineEntry: {
        type: 'object',
        properties: {
          date:  { type: 'string', format: 'date' },
          count: { type: 'integer' }
        }
      },
      TypeDistributionEntry: {
        type: 'object',
        properties: {
          type:  { type: 'string' },
          count: { type: 'integer' }
        }
      },
      SessionStats: {
        type: 'object',
        properties: {
          totalSessions:    { type: 'integer' },
          avgObsPerSession: { type: 'number' },
          avgDurationMs:    { type: 'number' }
        }
      },
      AnomalyEntry: {
        type: 'object',
        properties: {
          sessionId:    { type: 'integer' },
          project:      { type: 'string' },
          obsCount:     { type: 'integer' },
          zScore:       { type: 'number' },
          isAnomaly:    { type: 'boolean' }
        }
      },
      EmbeddingStats: {
        type: 'object',
        properties: {
          total:     { type: 'integer' },
          withEmbed: { type: 'integer' },
          provider:  { type: 'string' },
          dimensions:{ type: 'integer' },
          available: { type: 'boolean' }
        }
      },
      HybridSearchResult: {
        type: 'object',
        properties: {
          id:       { type: 'integer' },
          project:  { type: 'string' },
          type:     { type: 'string' },
          title:    { type: 'string' },
          score:    { type: 'number' },
          source:   { type: 'string', enum: ['vector', 'fts', 'hybrid'] }
        }
      },
      ProjectAlias: {
        type: 'object',
        properties: {
          project_name: { type: 'string' },
          display_name: { type: 'string' }
        }
      },
      ProjectStats: {
        type: 'object',
        properties: {
          project:      { type: 'string' },
          observations: { type: 'integer' },
          summaries:    { type: 'integer' },
          prompts:      { type: 'integer' },
          sessions:     { type: 'integer' },
          lastActivity: { type: 'integer', description: 'epoch ms' }
        }
      },
      ExportData: {
        type: 'object',
        properties: {
          meta: {
            type: 'object',
            properties: {
              project:    { type: 'string' },
              daysBack:   { type: 'integer' },
              exportedAt: { type: 'string', format: 'date-time' }
            }
          },
          observations: { type: 'array', items: ObservationSchema },
          summaries:    { type: 'array', items: SummarySchema }
        }
      }
    },
    securitySchemes: {
      workerToken: {
        type: 'apiKey',
        in: 'header',
        name: 'X-Worker-Token',
        description: 'Token segreto per endpoint riservati (notify, backfill, cleanup)'
      }
    },
    parameters: {
      projectQuery: {
        name: 'project',
        in: 'query',
        schema: { type: 'string' },
        description: 'Filtra per nome progetto'
      },
      offsetQuery: {
        name: 'offset',
        in: 'query',
        schema: { type: 'integer', default: 0, minimum: 0 },
        description: 'Offset paginazione'
      },
      limitQuery: {
        name: 'limit',
        in: 'query',
        schema: { type: 'integer', default: 20, minimum: 1, maximum: 200 },
        description: 'Numero massimo di risultati'
      }
    }
  },

  // ── Path definitions ──
  paths: {

    // ════════════════════════════════════════
    // CORE
    // ════════════════════════════════════════

    '/health': {
      get: {
        tags: ['Core'],
        summary: 'Health check',
        description: 'Verifica che il worker sia attivo e restituisce la versione.',
        operationId: 'getHealth',
        responses: {
          '200': {
            description: 'Worker attivo',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    status:    { type: 'string', example: 'ok' },
                    timestamp: { type: 'integer', description: 'epoch ms' },
                    version:   { type: 'string', example: '2.1.0' }
                  }
                }
              }
            }
          }
        }
      }
    },

    '/events': {
      get: {
        tags: ['Core'],
        summary: 'Server-Sent Events (SSE)',
        description: [
          'Stream SSE per aggiornamenti in tempo reale alla dashboard.',
          'Emette eventi: `connected`, `observation-created`, `summary-created`,',
          '`prompt-created`, `session-created`. Keepalive ogni 15s.',
          'Limite: 50 connessioni simultanee.'
        ].join(' '),
        operationId: 'getEvents',
        responses: {
          '200': {
            description: 'Stream SSE attivo',
            content: { 'text/event-stream': { schema: { type: 'string' } } }
          },
          '503': errorResponse('Troppi client SSE connessi')
        }
      }
    },

    '/api/notify': {
      post: {
        tags: ['Core'],
        summary: 'Notifica interna hook → SSE',
        description: [
          'Endpoint riservato agli hook Kiro. Riceve un evento e lo broadcast',
          'a tutti i client SSE connessi. Richiede `X-Worker-Token`.',
          'Rate limit: 60 richieste/minuto.'
        ].join(' '),
        operationId: 'postNotify',
        security: [{ workerToken: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['event'],
                properties: {
                  event: {
                    type: 'string',
                    enum: ['observation-created', 'summary-created', 'prompt-created', 'session-created']
                  },
                  data: { type: 'object', additionalProperties: true }
                }
              }
            }
          }
        },
        responses: {
          '200': {
            description: 'Evento broadcast con successo',
            content: { 'application/json': { schema: { type: 'object', properties: { ok: { type: 'boolean' } } } } }
          },
          '400': errorResponse('Evento non valido o non consentito'),
          '401': errorResponse('Token mancante o non valido')
        }
      }
    },

    // ════════════════════════════════════════
    // OBSERVATIONS
    // ════════════════════════════════════════

    '/api/observations': {
      get: {
        tags: ['Observations'],
        summary: 'Lista osservazioni paginate',
        operationId: 'listObservations',
        parameters: [
          { $ref: '#/components/parameters/offsetQuery' },
          { $ref: '#/components/parameters/limitQuery' },
          { $ref: '#/components/parameters/projectQuery' }
        ],
        responses: {
          '200': paginatedResponse({ $ref: '#/components/schemas/Observation' }),
          '500': errorResponse('Errore interno')
        }
      },
      post: {
        tags: ['Observations'],
        summary: 'Crea una nuova osservazione',
        operationId: 'createObservation',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['project', 'title'],
                properties: {
                  memorySessionId: { type: 'string' },
                  project:  { type: 'string' },
                  type:     { type: 'string', default: 'manual' },
                  title:    { type: 'string', maxLength: 500 },
                  content:  { type: 'string', maxLength: 100000 },
                  concepts: { type: 'array', items: { type: 'string' } },
                  files:    { type: 'array', items: { type: 'string' } }
                }
              }
            }
          }
        },
        responses: {
          '200': {
            description: 'Osservazione creata',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    id:      { type: 'integer' },
                    success: { type: 'boolean' }
                  }
                }
              }
            }
          },
          '400': errorResponse('Payload non valido'),
          '500': errorResponse('Errore di persistenza')
        }
      }
    },

    '/api/observations/batch': {
      post: {
        tags: ['Observations'],
        summary: 'Recupero batch per ID (max 100)',
        operationId: 'batchGetObservations',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['ids'],
                properties: {
                  ids: {
                    type: 'array',
                    items: { type: 'integer', minimum: 1 },
                    minItems: 1,
                    maxItems: 100
                  }
                }
              }
            }
          }
        },
        responses: {
          '200': {
            description: 'Osservazioni trovate',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    observations: {
                      type: 'array',
                      items: { $ref: '#/components/schemas/Observation' }
                    }
                  }
                }
              }
            }
          },
          '400': errorResponse('Array ids non valido'),
          '500': errorResponse('Errore interno')
        }
      }
    },

    '/api/knowledge': {
      post: {
        tags: ['Observations'],
        summary: 'Salva conoscenza strutturata',
        description: [
          'Crea un\'osservazione di tipo knowledge con metadati tipizzati.',
          'Tipi supportati: `constraint`, `decision`, `heuristic`, `rejected`.'
        ].join(' '),
        operationId: 'createKnowledge',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['project', 'knowledge_type', 'title', 'content'],
                properties: {
                  project:        { type: 'string' },
                  knowledge_type: { type: 'string', enum: ['constraint', 'decision', 'heuristic', 'rejected'] },
                  title:          { type: 'string', maxLength: 500 },
                  content:        { type: 'string', maxLength: 100000 },
                  concepts:       { type: 'array', items: { type: 'string' } },
                  files:          { type: 'array', items: { type: 'string' } },
                  severity:       { type: 'string', enum: ['hard', 'soft'], description: 'Solo per constraint' },
                  alternatives:   { type: 'array', items: { type: 'string' }, description: 'Solo per decision/rejected' },
                  reason:         { type: 'string', description: 'Motivazione (constraint, decision, rejected)' },
                  context:        { type: 'string', description: 'Contesto applicativo (heuristic)' },
                  confidence:     { type: 'string', enum: ['high', 'medium', 'low'], description: 'Solo per heuristic' }
                }
              }
            }
          }
        },
        responses: {
          '200': {
            description: 'Conoscenza salvata',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    id:             { type: 'integer' },
                    success:        { type: 'boolean' },
                    knowledge_type: { type: 'string' }
                  }
                }
              }
            }
          },
          '400': errorResponse('Payload non valido o knowledge_type sconosciuto'),
          '500': errorResponse('Errore di persistenza')
        }
      }
    },

    '/api/memory/save': {
      post: {
        tags: ['Observations'],
        summary: 'Salva una memoria (endpoint programmabile)',
        operationId: 'saveMemory',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['project', 'title', 'content'],
                properties: {
                  project:  { type: 'string' },
                  title:    { type: 'string', maxLength: 500 },
                  content:  { type: 'string', maxLength: 100000 },
                  type:     { type: 'string', default: 'research' },
                  concepts: { type: ['array', 'string'], items: { type: 'string' } }
                }
              }
            }
          }
        },
        responses: {
          '200': {
            description: 'Memoria salvata',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    id:      { type: 'integer' },
                    success: { type: 'boolean' }
                  }
                }
              }
            }
          },
          '400': errorResponse('Campo obbligatorio mancante o non valido'),
          '500': errorResponse('Errore di persistenza')
        }
      }
    },

    '/api/context/{project}': {
      get: {
        tags: ['Observations'],
        summary: 'Contesto progetto (ultime osservazioni + sommari)',
        operationId: 'getProjectContext',
        parameters: [
          {
            name: 'project',
            in: 'path',
            required: true,
            schema: { type: 'string' },
            description: 'Nome del progetto'
          }
        ],
        responses: {
          '200': {
            description: 'Contesto del progetto',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    project:      { type: 'string' },
                    observations: { type: 'array', items: { $ref: '#/components/schemas/Observation' } },
                    summaries:    { type: 'array', items: { $ref: '#/components/schemas/Summary' } }
                  }
                }
              }
            }
          },
          '400': errorResponse('Nome progetto non valido'),
          '500': errorResponse('Errore interno')
        }
      }
    },

    // ════════════════════════════════════════
    // SUMMARIES
    // ════════════════════════════════════════

    '/api/summaries': {
      get: {
        tags: ['Summaries'],
        summary: 'Lista sommari paginata',
        operationId: 'listSummaries',
        parameters: [
          { $ref: '#/components/parameters/offsetQuery' },
          { $ref: '#/components/parameters/limitQuery' },
          { $ref: '#/components/parameters/projectQuery' }
        ],
        responses: {
          '200': paginatedResponse({ $ref: '#/components/schemas/Summary' }),
          '500': errorResponse('Errore interno')
        }
      },
      post: {
        tags: ['Summaries'],
        summary: 'Crea un nuovo sommario di sessione',
        operationId: 'createSummary',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['project'],
                properties: {
                  sessionId:  { type: 'string' },
                  project:    { type: 'string' },
                  request:    { type: 'string', maxLength: 50000 },
                  learned:    { type: 'string', maxLength: 50000 },
                  completed:  { type: 'string', maxLength: 50000 },
                  nextSteps:  { type: 'string', maxLength: 50000 }
                }
              }
            }
          }
        },
        responses: {
          '200': {
            description: 'Sommario creato',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    id:      { type: 'integer' },
                    success: { type: 'boolean' }
                  }
                }
              }
            }
          },
          '400': errorResponse('Payload non valido o campo troppo grande'),
          '500': errorResponse('Errore di persistenza')
        }
      }
    },

    // ════════════════════════════════════════
    // SEARCH
    // ════════════════════════════════════════

    '/api/search': {
      get: {
        tags: ['Search'],
        summary: 'Ricerca full-text FTS5',
        operationId: 'searchFTS',
        parameters: [
          {
            name: 'q',
            in: 'query',
            required: true,
            schema: { type: 'string' },
            description: 'Testo da cercare (SQLite FTS5)'
          },
          { $ref: '#/components/parameters/projectQuery' },
          {
            name: 'type',
            in: 'query',
            schema: { type: 'string' },
            description: 'Filtra per tipo osservazione'
          },
          {
            name: 'limit',
            in: 'query',
            schema: { type: 'integer', default: 20, minimum: 1, maximum: 100 }
          }
        ],
        responses: {
          '200': {
            description: 'Risultati ricerca FTS5',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    observations: { type: 'array', items: { $ref: '#/components/schemas/Observation' } },
                    summaries:    { type: 'array', items: { $ref: '#/components/schemas/Summary' } }
                  }
                }
              }
            }
          },
          '400': errorResponse('Parametro "q" obbligatorio'),
          '500': errorResponse('Ricerca fallita')
        }
      }
    },

    '/api/hybrid-search': {
      get: {
        tags: ['Search'],
        summary: 'Ricerca ibrida (vettoriale + keyword)',
        description: 'Combina embedding vettoriali e FTS5 per una ricerca semantica avanzata.',
        operationId: 'searchHybrid',
        parameters: [
          {
            name: 'q',
            in: 'query',
            required: true,
            schema: { type: 'string' },
            description: 'Testo da cercare'
          },
          { $ref: '#/components/parameters/projectQuery' },
          {
            name: 'limit',
            in: 'query',
            schema: { type: 'integer', default: 10, minimum: 1, maximum: 100 }
          }
        ],
        responses: {
          '200': {
            description: 'Risultati ibridi con score di rilevanza',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    results: { type: 'array', items: { $ref: '#/components/schemas/HybridSearchResult' } },
                    count:   { type: 'integer' }
                  }
                }
              }
            }
          },
          '400': errorResponse('Parametro "q" obbligatorio'),
          '500': errorResponse('Ricerca ibrida fallita')
        }
      }
    },

    '/api/timeline': {
      get: {
        tags: ['Search'],
        summary: 'Timeline cronologica intorno a un\'osservazione',
        operationId: 'getTimeline',
        parameters: [
          {
            name: 'anchor',
            in: 'query',
            required: true,
            schema: { type: 'integer', minimum: 1 },
            description: 'ID dell\'osservazione centrale'
          },
          {
            name: 'depth_before',
            in: 'query',
            schema: { type: 'integer', default: 5, minimum: 1, maximum: 50 },
            description: 'Numero di osservazioni precedenti'
          },
          {
            name: 'depth_after',
            in: 'query',
            schema: { type: 'integer', default: 5, minimum: 1, maximum: 50 },
            description: 'Numero di osservazioni successive'
          }
        ],
        responses: {
          '200': {
            description: 'Timeline restituita',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    timeline: { type: 'array', items: { $ref: '#/components/schemas/Observation' } }
                  }
                }
              }
            }
          },
          '400': errorResponse('Parametro "anchor" mancante o non valido'),
          '500': errorResponse('Timeline fallita')
        }
      }
    },

    // ════════════════════════════════════════
    // ANALYTICS
    // ════════════════════════════════════════

    '/api/analytics/overview': {
      get: {
        tags: ['Analytics'],
        summary: 'Panoramica aggregata delle statistiche',
        operationId: 'getAnalyticsOverview',
        parameters: [{ $ref: '#/components/parameters/projectQuery' }],
        responses: {
          '200': {
            description: 'Overview aggregata',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/AnalyticsOverview' }
              }
            }
          },
          '400': errorResponse('Nome progetto non valido'),
          '500': errorResponse('Analytics overview fallita')
        }
      }
    },

    '/api/analytics/timeline': {
      get: {
        tags: ['Analytics'],
        summary: 'Distribuzione temporale osservazioni per giorno',
        operationId: 'getAnalyticsTimeline',
        parameters: [
          { $ref: '#/components/parameters/projectQuery' },
          {
            name: 'days',
            in: 'query',
            schema: { type: 'integer', default: 30, minimum: 1, maximum: 365 },
            description: 'Finestra temporale in giorni'
          }
        ],
        responses: {
          '200': {
            description: 'Serie temporale giornaliera',
            content: {
              'application/json': {
                schema: { type: 'array', items: { $ref: '#/components/schemas/TimelineEntry' } }
              }
            }
          },
          '400': errorResponse('Nome progetto non valido'),
          '500': errorResponse('Analytics timeline fallita')
        }
      }
    },

    '/api/analytics/types': {
      get: {
        tags: ['Analytics'],
        summary: 'Distribuzione per tipo osservazione',
        operationId: 'getAnalyticsTypes',
        parameters: [{ $ref: '#/components/parameters/projectQuery' }],
        responses: {
          '200': {
            description: 'Distribuzione dei tipi',
            content: {
              'application/json': {
                schema: { type: 'array', items: { $ref: '#/components/schemas/TypeDistributionEntry' } }
              }
            }
          },
          '400': errorResponse('Nome progetto non valido'),
          '500': errorResponse('Analytics types fallita')
        }
      }
    },

    '/api/analytics/sessions': {
      get: {
        tags: ['Analytics'],
        summary: 'Statistiche aggregate delle sessioni',
        operationId: 'getAnalyticsSessions',
        parameters: [{ $ref: '#/components/parameters/projectQuery' }],
        responses: {
          '200': {
            description: 'Statistiche sessioni',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/SessionStats' }
              }
            }
          },
          '400': errorResponse('Nome progetto non valido'),
          '500': errorResponse('Analytics sessions fallita')
        }
      }
    },

    '/api/analytics/anomalies': {
      get: {
        tags: ['Analytics'],
        summary: 'Rilevamento anomalie sessioni tramite z-score',
        operationId: 'getAnomalies',
        parameters: [
          {
            name: 'project',
            in: 'query',
            required: true,
            schema: { type: 'string' },
            description: 'Nome progetto (obbligatorio)'
          },
          {
            name: 'window',
            in: 'query',
            schema: { type: 'integer', default: 20, minimum: 3, maximum: 200 },
            description: 'Dimensione finestra rolling'
          },
          {
            name: 'threshold',
            in: 'query',
            schema: { type: 'number', default: 2.0, minimum: 0.1, maximum: 10 },
            description: 'Soglia z-score per segnalare anomalia'
          }
        ],
        responses: {
          '200': {
            description: 'Anomalie rilevate',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    anomalies: { type: 'array', items: { $ref: '#/components/schemas/AnomalyEntry' } },
                    baseline:  { type: 'number' },
                    project:   { type: 'string' }
                  }
                }
              }
            }
          },
          '400': errorResponse('Parametro project obbligatorio o threshold non valida'),
          '500': errorResponse('Rilevamento anomalie fallito')
        }
      }
    },

    // ════════════════════════════════════════
    // SESSIONS
    // ════════════════════════════════════════

    '/api/sessions': {
      get: {
        tags: ['Sessions'],
        summary: 'Lista sessioni (max 50)',
        operationId: 'listSessions',
        parameters: [{ $ref: '#/components/parameters/projectQuery' }],
        responses: {
          '200': {
            description: 'Lista sessioni',
            content: {
              'application/json': {
                schema: { type: 'array', items: { $ref: '#/components/schemas/Session' } }
              }
            }
          },
          '400': errorResponse('Nome progetto non valido'),
          '500': errorResponse('Errore interno')
        }
      }
    },

    '/api/sessions/{id}/checkpoint': {
      get: {
        tags: ['Sessions'],
        summary: 'Ultimo checkpoint di una sessione',
        operationId: 'getSessionCheckpoint',
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'integer', minimum: 1 },
            description: 'ID numerico della sessione'
          }
        ],
        responses: {
          '200': {
            description: 'Checkpoint trovato',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Checkpoint' }
              }
            }
          },
          '400': errorResponse('ID sessione non valido'),
          '404': errorResponse('Nessun checkpoint trovato per questa sessione'),
          '500': errorResponse('Errore interno')
        }
      }
    },

    '/api/checkpoint': {
      get: {
        tags: ['Sessions'],
        summary: 'Ultimo checkpoint del progetto',
        operationId: 'getProjectCheckpoint',
        parameters: [
          {
            name: 'project',
            in: 'query',
            required: true,
            schema: { type: 'string' },
            description: 'Nome progetto (obbligatorio)'
          }
        ],
        responses: {
          '200': {
            description: 'Checkpoint trovato',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Checkpoint' }
              }
            }
          },
          '400': errorResponse('Parametro project mancante o non valido'),
          '404': errorResponse('Nessun checkpoint trovato per questo progetto'),
          '500': errorResponse('Errore interno')
        }
      }
    },

    '/api/prompts': {
      get: {
        tags: ['Sessions'],
        summary: 'Lista prompt utente paginata',
        operationId: 'listPrompts',
        parameters: [
          { $ref: '#/components/parameters/offsetQuery' },
          {
            name: 'limit',
            in: 'query',
            schema: { type: 'integer', default: 20, minimum: 1, maximum: 200 }
          },
          { $ref: '#/components/parameters/projectQuery' }
        ],
        responses: {
          '200': paginatedResponse({ $ref: '#/components/schemas/Prompt' }),
          '500': errorResponse('Errore interno')
        }
      }
    },

    // ════════════════════════════════════════
    // PROJECTS
    // ════════════════════════════════════════

    '/api/projects': {
      get: {
        tags: ['Projects'],
        summary: 'Lista nomi progetto distinti (cache 60s)',
        operationId: 'listProjects',
        responses: {
          '200': {
            description: 'Array di nomi progetto',
            content: {
              'application/json': {
                schema: { type: 'array', items: { type: 'string' } }
              }
            }
          },
          '500': errorResponse('Errore interno')
        }
      }
    },

    '/api/project-aliases': {
      get: {
        tags: ['Projects'],
        summary: 'Mappa alias → display name',
        operationId: 'getProjectAliases',
        responses: {
          '200': {
            description: 'Oggetto `{ project_name: display_name }`',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  additionalProperties: { type: 'string' }
                }
              }
            }
          },
          '500': errorResponse('Errore interno')
        }
      }
    },

    '/api/project-aliases/{project}': {
      put: {
        tags: ['Projects'],
        summary: 'Crea o aggiorna display name di un progetto',
        operationId: 'upsertProjectAlias',
        parameters: [
          {
            name: 'project',
            in: 'path',
            required: true,
            schema: { type: 'string' },
            description: 'Nome tecnico del progetto'
          }
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['displayName'],
                properties: {
                  displayName: { type: 'string', maxLength: 100 }
                }
              }
            }
          }
        },
        responses: {
          '200': {
            description: 'Alias aggiornato',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    ok:           { type: 'boolean' },
                    project_name: { type: 'string' },
                    display_name: { type: 'string' }
                  }
                }
              }
            }
          },
          '400': errorResponse('Payload non valido o nome progetto non valido'),
          '500': errorResponse('Errore interno')
        }
      }
    },

    '/api/stats/{project}': {
      get: {
        tags: ['Projects'],
        summary: 'Statistiche aggregate per progetto',
        operationId: 'getProjectStats',
        parameters: [
          {
            name: 'project',
            in: 'path',
            required: true,
            schema: { type: 'string' },
            description: 'Nome del progetto'
          }
        ],
        responses: {
          '200': {
            description: 'Statistiche progetto',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ProjectStats' }
              }
            }
          },
          '400': errorResponse('Nome progetto non valido'),
          '500': errorResponse('Errore interno')
        }
      }
    },

    // ════════════════════════════════════════
    // DATA (embeddings, retention, export, report)
    // ════════════════════════════════════════

    '/api/embeddings/backfill': {
      post: {
        tags: ['Data'],
        summary: 'Backfill embedding per osservazioni senza vettore',
        operationId: 'backfillEmbeddings',
        security: [{ workerToken: [] }],
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  batchSize: { type: 'integer', default: 50, minimum: 1, maximum: 500 }
                }
              }
            }
          }
        },
        responses: {
          '200': {
            description: 'Backfill completato',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success:   { type: 'boolean' },
                    generated: { type: 'integer', description: 'Embedding generati' }
                  }
                }
              }
            }
          },
          '401': errorResponse('Token non valido'),
          '500': errorResponse('Backfill fallito')
        }
      }
    },

    '/api/embeddings/stats': {
      get: {
        tags: ['Data'],
        summary: 'Statistiche embedding vettoriali',
        operationId: 'getEmbeddingStats',
        responses: {
          '200': {
            description: 'Statistiche embedding',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/EmbeddingStats' }
              }
            }
          },
          '500': errorResponse('Errore interno')
        }
      }
    },

    '/api/retention/cleanup': {
      post: {
        tags: ['Data'],
        summary: 'Pulizia dati secondo policy di retention',
        description: 'Elimina osservazioni, sommari e prompt più vecchi di `maxAgeDays` giorni. Supporta modalità dry-run.',
        operationId: 'runRetentionCleanup',
        security: [{ workerToken: [] }],
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  maxAgeDays: { type: 'integer', default: 90, minimum: 7, maximum: 730,
                    description: 'Età massima in giorni' },
                  dryRun: { type: 'boolean', default: false,
                    description: 'Se true, simula senza eliminare' }
                }
              }
            }
          }
        },
        responses: {
          '200': {
            description: 'Cleanup eseguito o simulato',
            content: {
              'application/json': {
                schema: {
                  oneOf: [
                    {
                      description: 'Risultato dry-run',
                      type: 'object',
                      properties: {
                        dryRun:      { type: 'boolean' },
                        maxAgeDays:  { type: 'integer' },
                        wouldDelete: {
                          type: 'object',
                          properties: {
                            observations: { type: 'integer' },
                            summaries:    { type: 'integer' },
                            prompts:      { type: 'integer' }
                          }
                        }
                      }
                    },
                    {
                      description: 'Risultato cleanup reale',
                      type: 'object',
                      properties: {
                        success:    { type: 'boolean' },
                        maxAgeDays: { type: 'integer' },
                        deleted: {
                          type: 'object',
                          properties: {
                            observations: { type: 'integer' },
                            summaries:    { type: 'integer' },
                            prompts:      { type: 'integer' }
                          }
                        }
                      }
                    }
                  ]
                }
              }
            }
          },
          '401': errorResponse('Token non valido'),
          '500': errorResponse('Cleanup fallito')
        }
      }
    },

    '/api/export': {
      get: {
        tags: ['Data'],
        summary: 'Esporta osservazioni e sommari',
        description: 'Esporta i dati in formato JSON (default) o Markdown.',
        operationId: 'exportData',
        parameters: [
          { $ref: '#/components/parameters/projectQuery' },
          {
            name: 'format',
            in: 'query',
            schema: { type: 'string', enum: ['json', 'markdown', 'md'], default: 'json' },
            description: 'Formato di output'
          },
          {
            name: 'type',
            in: 'query',
            schema: { type: 'string' },
            description: 'Filtra per tipo osservazione'
          },
          {
            name: 'days',
            in: 'query',
            schema: { type: 'integer', default: 30, minimum: 1, maximum: 365 },
            description: 'Finestra temporale in giorni'
          }
        ],
        responses: {
          '200': {
            description: 'Export in formato selezionato',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/ExportData' } },
              'text/markdown':    { schema: { type: 'string' } }
            }
          },
          '400': errorResponse('Nome progetto non valido'),
          '500': errorResponse('Export fallito')
        }
      }
    },

    '/api/report': {
      get: {
        tags: ['Data'],
        summary: 'Report attività (weekly/monthly)',
        operationId: 'getReport',
        parameters: [
          { $ref: '#/components/parameters/projectQuery' },
          {
            name: 'period',
            in: 'query',
            schema: { type: 'string', enum: ['weekly', 'monthly'], default: 'weekly' },
            description: 'Periodo del report'
          },
          {
            name: 'format',
            in: 'query',
            schema: { type: 'string', enum: ['json', 'markdown', 'md', 'text'], default: 'json' },
            description: 'Formato di output'
          }
        ],
        responses: {
          '200': {
            description: 'Report generato',
            content: {
              'application/json': { schema: { type: 'object', additionalProperties: true } },
              'text/markdown':    { schema: { type: 'string' } },
              'text/plain':       { schema: { type: 'string' } }
            }
          },
          '400': errorResponse('Nome progetto non valido'),
          '500': errorResponse('Generazione report fallita')
        }
      }
    },

    // ════════════════════════════════════════
    // DOCS (auto-referenziale)
    // ════════════════════════════════════════

    '/api/docs': {
      get: {
        tags: ['Docs'],
        summary: 'Swagger UI interattiva',
        operationId: 'getSwaggerUI',
        responses: {
          '200': {
            description: 'Pagina HTML Swagger UI',
            content: { 'text/html': { schema: { type: 'string' } } }
          }
        }
      }
    },

    '/api/docs/openapi.json': {
      get: {
        tags: ['Docs'],
        summary: 'Specifica OpenAPI 3.1 in formato JSON',
        operationId: 'getOpenApiSpec',
        responses: {
          '200': {
            description: 'Specifica OpenAPI 3.1',
            content: {
              'application/json': { schema: { type: 'object', additionalProperties: true } }
            }
          }
        }
      }
    }
  },

  // ── Tags per raggruppamento nella UI ──
  tags: [
    { name: 'Core',         description: 'Health check, SSE, notifiche interne' },
    { name: 'Observations', description: 'CRUD osservazioni, knowledge, memoria' },
    { name: 'Summaries',    description: 'Sommari di sessione' },
    { name: 'Search',       description: 'Ricerca FTS5, vettoriale ibrida, timeline' },
    { name: 'Analytics',    description: 'Overview, distribuzione, anomalie' },
    { name: 'Sessions',     description: 'Sessioni, checkpoint, prompt' },
    { name: 'Projects',     description: 'Lista progetti, alias, statistiche' },
    { name: 'Data',         description: 'Embedding, retention, export, report' },
    { name: 'Docs',         description: 'Documentazione API interattiva' }
  ]
} as const;

export type OpenApiSpec = typeof openApiSpec;
