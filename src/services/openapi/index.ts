/**
 * Router OpenAPI — serve la specifica e la Swagger UI interattiva.
 *
 * Endpoint esposti:
 *   GET /api/docs              — Swagger UI HTML (CDN, nessuna dipendenza npm aggiuntiva)
 *   GET /api/docs/openapi.json — Specifica OpenAPI 3.1 in formato JSON raw
 */

import { Router } from 'express';
import { openApiSpec } from './spec.js';

// ── Generazione HTML Swagger UI ──

/**
 * Costruisce la pagina HTML con Swagger UI caricata da CDN unpkg.
 * Non richiede dipendenze npm aggiuntive (niente swagger-ui-express).
 */
function buildSwaggerHtml(specUrl: string): string {
  return `<!DOCTYPE html>
<html lang="it">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Kiro Memory API — Documentazione</title>
  <meta name="description" content="Documentazione interattiva dell'API REST di Kiro Memory" />
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css" />
  <style>
    /* Stile minimo per rimuovere il banner Swagger */
    .swagger-ui .topbar { display: none; }
    body { margin: 0; background: #fafafa; }
    #kiro-header {
      background: #1a1a2e;
      color: #e0e0e0;
      padding: 14px 24px;
      font-family: system-ui, sans-serif;
      display: flex;
      align-items: center;
      gap: 12px;
    }
    #kiro-header h1 { margin: 0; font-size: 1.1rem; font-weight: 600; }
    #kiro-header .badge {
      background: #16213e;
      border: 1px solid #0f3460;
      border-radius: 4px;
      padding: 2px 8px;
      font-size: 0.75rem;
      color: #94a3b8;
    }
  </style>
</head>
<body>
  <div id="kiro-header">
    <h1>Kiro Memory REST API</h1>
    <span class="badge">v${openApiSpec.info.version}</span>
    <span class="badge">OpenAPI 3.1</span>
  </div>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
  <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-standalone-preset.js"></script>
  <script>
    window.onload = function () {
      SwaggerUIBundle({
        url: '${specUrl}',
        dom_id: '#swagger-ui',
        deepLinking: true,
        presets: [SwaggerUIBundle.presets.apis, SwaggerUIStandalonePreset],
        layout: 'StandaloneLayout',
        tryItOutEnabled: true,
        requestSnippetsEnabled: true,
        displayRequestDuration: true,
        filter: true,
        defaultModelsExpandDepth: 1,
        defaultModelExpandDepth: 2,
        docExpansion: 'list'
      });
    };
  </script>
</body>
</html>`;
}

// ── Router Factory ──

/**
 * Crea il router Express per la documentazione OpenAPI.
 *
 * @returns Router con le route /api/docs e /api/docs/openapi.json
 */
export function createDocsRouter(): Router {
  const router = Router();

  // Spec JSON raw
  router.get('/api/docs/openapi.json', (_req, res) => {
    res.setHeader('Cache-Control', 'public, max-age=300'); // cache 5 minuti
    res.json(openApiSpec);
  });

  // Swagger UI HTML — importante: dopo il JSON per evitare conflitti di path matching
  router.get('/api/docs', (_req, res) => {
    const html = buildSwaggerHtml('/api/docs/openapi.json');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.send(html);
  });

  return router;
}

// Re-export spec per usi programmatici (es. test, SDK)
export { openApiSpec } from './spec.js';
export type { OpenApiSpec } from './spec.js';
