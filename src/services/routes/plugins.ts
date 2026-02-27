/**
 * Router Plugins: gestione lifecycle plugin via REST API.
 *
 * Endpoint:
 *   GET  /api/plugins               — lista tutti i plugin con stato
 *   POST /api/plugins/:name/enable  — abilita un plugin registrato
 *   POST /api/plugins/:name/disable — disabilita un plugin attivo
 *
 * La route opera sul PluginRegistry singleton; l'abilitazione richiede
 * un PluginContext con accesso al SDK. Il context viene costruito usando
 * il SDK già inizializzato nel WorkerContext.
 */

import { Router } from 'express';
import { PluginRegistry, createPluginLogger } from '../plugins/PluginRegistry.js';
import { KiroMemorySDK } from '../../sdk/index.js';
import type { WorkerContext } from '../worker-context.js';
import { logger } from '../../utils/logger.js';

export function createPluginsRouter(ctx: WorkerContext): Router {
  const router = Router();
  const registry = PluginRegistry.getInstance();

  // SDK condiviso per il PluginContext (creato una sola volta per il router)
  const sdk = new KiroMemorySDK({ skipMigrations: true });

  // ── GET /api/plugins ──────────────────────────────────────────────────────

  router.get('/api/plugins', (_req, res) => {
    try {
      const plugins = registry.getAll();
      res.json({ plugins, total: plugins.length });
    } catch (err) {
      logger.error('WORKER', 'Recupero lista plugin fallito', {}, err as Error);
      res.status(500).json({ error: 'Impossibile recuperare la lista plugin' });
    }
  });

  // ── POST /api/plugins/:name/enable ───────────────────────────────────────

  router.post('/api/plugins/:name/enable', async (req, res) => {
    const { name } = req.params;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      res.status(400).json({ error: 'Nome plugin non valido' });
      return;
    }

    const plugin = registry.get(name);
    if (!plugin) {
      res.status(404).json({ error: `Plugin non trovato: "${name}"` });
      return;
    }

    try {
      const pluginContext = {
        sdk,
        logger: createPluginLogger(name),
        config: {},  // Configurazione plugin (TODO: leggere da config.json in M3)
      };

      await registry.enable(name, pluginContext);

      const info = registry.getAll().find((p) => p.name === name);
      res.json({ success: true, plugin: info });
    } catch (err) {
      logger.error('WORKER', `Abilitazione plugin "${name}" fallita`, {}, err as Error);
      res.status(500).json({ error: `Impossibile abilitare il plugin "${name}"` });
    }
  });

  // ── POST /api/plugins/:name/disable ──────────────────────────────────────

  router.post('/api/plugins/:name/disable', async (req, res) => {
    const { name } = req.params;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      res.status(400).json({ error: 'Nome plugin non valido' });
      return;
    }

    const plugin = registry.get(name);
    if (!plugin) {
      res.status(404).json({ error: `Plugin non trovato: "${name}"` });
      return;
    }

    try {
      await registry.disable(name);

      const info = registry.getAll().find((p) => p.name === name);
      res.json({ success: true, plugin: info });
    } catch (err) {
      logger.error('WORKER', `Disabilitazione plugin "${name}" fallita`, {}, err as Error);
      res.status(500).json({ error: `Impossibile disabilitare il plugin "${name}"` });
    }
  });

  return router;
}
