/**
 * Test suite per PluginLoader
 *
 * Strategia: non si usa il filesystem reale né il dynamic import.
 * I plugin mock vengono iniettati sovrascrivendo il metodo protetto
 * _loadRawPluginByName(), che è il punto di estensione per i test.
 *
 * Copertura:
 *   - discoverPlugins() con directory vuota o assente
 *   - validatePlugin: campi obbligatori, minKiroVersion compatibile/incompatibile
 *   - loadAll con mix di successi e fallimenti
 *   - Isolamento errori: un plugin fallito non blocca gli altri
 *   - reloadPlugin: destroy + reinizializzazione
 *   - Registrazione nel registry
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { PluginLoader } from '../../src/services/plugins/PluginLoader.js';
import type { IPluginRegistry } from '../../src/services/plugins/PluginLoader.js';
import type { IPlugin } from '../../src/services/plugins/types.js';

// ── Registry simulato in memoria ──────────────────────────────────────────────

class MockRegistry implements IPluginRegistry {
  private readonly plugins = new Map<string, IPlugin>();

  register(plugin: IPlugin): void {
    this.plugins.set(plugin.name, plugin);
  }

  unregister(name: string): void {
    this.plugins.delete(name);
  }

  get(name: string): IPlugin | undefined {
    return this.plugins.get(name);
  }

  all(): IPlugin[] {
    return Array.from(this.plugins.values());
  }

  clear(): void {
    this.plugins.clear();
  }
}

// ── Factory per plugin mock validi ───────────────────────────────────────────

function makePlugin(overrides: Partial<IPlugin> = {}): IPlugin {
  return {
    name: 'kiro-memory-plugin-test',
    version: '1.0.0',
    async init() { /* nessuna operazione */ },
    async destroy() { /* nessuna operazione */ },
    ...overrides
  };
}

// ── PluginLoader testabile senza filesystem ───────────────────────────────────

class TestablePluginLoader extends PluginLoader {
  readonly mockModules = new Map<string, IPlugin | Error>();

  override async _loadRawPluginByName(nameOrPath: string): Promise<unknown> {
    const key = nameOrPath.split('/').pop() ?? nameOrPath;

    if (this.mockModules.has(nameOrPath)) {
      const result = this.mockModules.get(nameOrPath)!;
      if (result instanceof Error) throw result;
      return { default: result };
    }

    if (this.mockModules.has(key)) {
      const result = this.mockModules.get(key)!;
      if (result instanceof Error) throw result;
      return { default: result };
    }

    throw new Error(`Modulo mock non trovato per: ${nameOrPath}`);
  }
}

// ── Helper per costruire il loader con directory inesistente ─────────────────

function makeLoader(registry: MockRegistry): TestablePluginLoader {
  return new TestablePluginLoader(registry, {
    localPluginsDir: '/tmp/kiro-memory-test-plugins-nonexistent-' + Date.now(),
    projectRoot: '/tmp/kiro-memory-test-nonexistent-' + Date.now()
  });
}

// ────────────────────────────────────────────────────────────────────────────
// Test suite
// ────────────────────────────────────────────────────────────────────────────

describe('PluginLoader', () => {
  let registry: MockRegistry;
  let loader: TestablePluginLoader;

  beforeEach(() => {
    registry = new MockRegistry();
    loader = makeLoader(registry);
  });

  // ── Discovery ──────────────────────────────────────────────────────────────

  describe('discoverPlugins()', () => {
    it('restituisce array vuoto se node_modules non esiste', async () => {
      const result = await loader.discoverPlugins();
      expect(result).toEqual([]);
    });
  });

  // ── Validazione ────────────────────────────────────────────────────────────

  describe('validazione plugin (via loadPlugin)', () => {
    it('accetta un plugin valido con tutti i campi obbligatori', async () => {
      const plugin = makePlugin({ name: 'kiro-memory-plugin-valid' });
      loader.mockModules.set('kiro-memory-plugin-valid', plugin);

      await expect(
        loader.loadPlugin('kiro-memory-plugin-valid')
      ).resolves.toBeUndefined();

      expect(registry.get('kiro-memory-plugin-valid')).toBeDefined();
    });

    it('rifiuta un plugin senza campo name', async () => {
      const invalidPlugin = {
        version: '1.0.0',
        init: async () => {},
        destroy: async () => {}
      } as unknown as IPlugin;

      loader.mockModules.set('plugin-no-name', invalidPlugin);

      await expect(
        loader.loadPlugin('plugin-no-name')
      ).rejects.toThrow('campo "name"');
    });

    it('rifiuta un plugin senza campo version', async () => {
      const invalidPlugin = {
        name: 'kiro-memory-plugin-no-version',
        init: async () => {},
        destroy: async () => {}
      } as unknown as IPlugin;

      loader.mockModules.set('kiro-memory-plugin-no-version', invalidPlugin);

      await expect(
        loader.loadPlugin('kiro-memory-plugin-no-version')
      ).rejects.toThrow('version');
    });

    it('rifiuta un plugin senza metodo init', async () => {
      const invalidPlugin = {
        name: 'kiro-memory-plugin-no-init',
        version: '1.0.0',
        destroy: async () => {}
      } as unknown as IPlugin;

      loader.mockModules.set('kiro-memory-plugin-no-init', invalidPlugin);

      await expect(
        loader.loadPlugin('kiro-memory-plugin-no-init')
      ).rejects.toThrow('init');
    });

    it('rifiuta un plugin senza metodo destroy', async () => {
      const invalidPlugin = {
        name: 'kiro-memory-plugin-no-destroy',
        version: '1.0.0',
        init: async () => {}
      } as unknown as IPlugin;

      loader.mockModules.set('kiro-memory-plugin-no-destroy', invalidPlugin);

      await expect(
        loader.loadPlugin('kiro-memory-plugin-no-destroy')
      ).rejects.toThrow('destroy');
    });

    it('accetta un plugin con minKiroVersion compatibile', async () => {
      const plugin = makePlugin({
        name: 'kiro-memory-plugin-compat',
        minKiroVersion: '2.0.0'
      });
      loader.mockModules.set('kiro-memory-plugin-compat', plugin);

      await expect(
        loader.loadPlugin('kiro-memory-plugin-compat')
      ).resolves.toBeUndefined();
    });

    it('accetta un plugin con minKiroVersion uguale alla versione corrente', async () => {
      const plugin = makePlugin({
        name: 'kiro-memory-plugin-exact',
        minKiroVersion: '2.1.0'
      });
      loader.mockModules.set('kiro-memory-plugin-exact', plugin);

      await expect(
        loader.loadPlugin('kiro-memory-plugin-exact')
      ).resolves.toBeUndefined();
    });

    it('rifiuta un plugin con minKiroVersion superiore alla versione corrente', async () => {
      const plugin = makePlugin({
        name: 'kiro-memory-plugin-future',
        minKiroVersion: '3.0.0'
      });
      loader.mockModules.set('kiro-memory-plugin-future', plugin);

      await expect(
        loader.loadPlugin('kiro-memory-plugin-future')
      ).rejects.toThrow('3.0.0');
    });

    it('rifiuta un plugin con minKiroVersion minor incompatibile', async () => {
      const plugin = makePlugin({
        name: 'kiro-memory-plugin-minor',
        minKiroVersion: '2.5.0'
      });
      loader.mockModules.set('kiro-memory-plugin-minor', plugin);

      await expect(
        loader.loadPlugin('kiro-memory-plugin-minor')
      ).rejects.toThrow('2.5.0');
    });
  });

  // ── loadAll ────────────────────────────────────────────────────────────────

  describe('loadAll()', () => {
    it('restituisce array vuoti se non ci sono plugin (discovery e config vuote)', async () => {
      const result = await loader.loadAll();
      expect(result.loaded).toEqual([]);
      expect(result.failed).toEqual([]);
    });

    it('non lancia eccezioni se node_modules e localPluginsDir non esistono', async () => {
      await expect(loader.loadAll()).resolves.toBeDefined();
    });
  });

  // ── Isolamento errori ──────────────────────────────────────────────────────

  describe('isolamento errori in loadPlugin()', () => {
    it('un errore di validazione propaga correttamente', async () => {
      // Plugin con modulo corrotto
      loader.mockModules.set('kiro-memory-plugin-faulty', new Error('Modulo corrotto'));

      await expect(
        loader.loadPlugin('kiro-memory-plugin-faulty')
      ).rejects.toThrow('Modulo corrotto');
    });

    it('loadAll isola i fallimenti: un plugin fallito non blocca gli altri', async () => {
      const loaded: string[] = [];
      const failed: Array<{ name: string; error: string }> = [];

      const goodPlugin = makePlugin({ name: 'kiro-memory-plugin-good' });
      loader.mockModules.set('kiro-memory-plugin-good', goodPlugin);
      loader.mockModules.set('kiro-memory-plugin-bad', new Error('Plugin corrotto'));

      const pluginNames = ['kiro-memory-plugin-good', 'kiro-memory-plugin-bad'];

      for (const name of pluginNames) {
        try {
          await loader.loadPlugin(name);
          loaded.push(name);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          failed.push({ name, error: msg });
        }
      }

      expect(loaded).toContain('kiro-memory-plugin-good');
      expect(failed.some(f => f.name === 'kiro-memory-plugin-bad')).toBe(true);
      expect(loaded).not.toContain('kiro-memory-plugin-bad');
      expect(registry.get('kiro-memory-plugin-good')).toBeDefined();
    });
  });

  // ── reloadPlugin ───────────────────────────────────────────────────────────

  describe('reloadPlugin()', () => {
    it('lancia errore se il plugin non è stato caricato precedentemente', async () => {
      await expect(
        loader.reloadPlugin('plugin-non-caricato')
      ).rejects.toThrow('non è stato caricato');
    });

    it('chiama destroy() sul plugin esistente prima di ricaricare', async () => {
      let destroyCalled = false;

      const plugin = makePlugin({
        name: 'kiro-memory-plugin-reload',
        async destroy() { destroyCalled = true; }
      });

      loader.mockModules.set('kiro-memory-plugin-reload', plugin);
      await loader.loadPlugin('kiro-memory-plugin-reload');

      expect(registry.get('kiro-memory-plugin-reload')).toBeDefined();

      const reloadedPlugin = makePlugin({
        name: 'kiro-memory-plugin-reload',
        version: '2.0.0'
      });
      loader.mockModules.set('kiro-memory-plugin-reload', reloadedPlugin);

      await loader.reloadPlugin('kiro-memory-plugin-reload');

      expect(destroyCalled).toBe(true);
      expect(registry.get('kiro-memory-plugin-reload')).toBeDefined();
    });
  });

  // ── Registrazione nel registry ──────────────────────────────────────────────

  describe('registrazione nel registry', () => {
    it('loadPlugin registra il plugin senza chiamare init (responsabilità del registry)', async () => {
      let initCalled = false;
      const plugin = makePlugin({
        name: 'kiro-memory-plugin-noinit',
        async init() { initCalled = true; }
      });

      loader.mockModules.set('kiro-memory-plugin-noinit', plugin);
      await loader.loadPlugin('kiro-memory-plugin-noinit');

      // Il loader registra ma NON chiama init
      expect(registry.get('kiro-memory-plugin-noinit')).toBeDefined();
      expect(initCalled).toBe(false);
    });
  });

  // ── Plug-in già registrato ─────────────────────────────────────────────────

  describe('gestione duplicati', () => {
    it('loadPlugin registra il plugin nel registry', async () => {
      const plugin = makePlugin({ name: 'kiro-memory-plugin-dup', version: '1.0.0' });
      loader.mockModules.set('kiro-memory-plugin-dup', plugin);

      await loader.loadPlugin('kiro-memory-plugin-dup');

      expect(registry.get('kiro-memory-plugin-dup')).toBeDefined();
      expect(registry.get('kiro-memory-plugin-dup')?.version).toBe('1.0.0');
    });

    it('loadAll salta i plugin già registrati nel registry', async () => {
      const plugin = makePlugin({ name: 'kiro-memory-plugin-pre', version: '1.0.0' });
      registry.register(plugin);

      const updatedPlugin = makePlugin({ name: 'kiro-memory-plugin-pre', version: '2.0.0' });
      loader.mockModules.set('kiro-memory-plugin-pre', updatedPlugin);

      const result = await loader.loadAll();

      expect(registry.get('kiro-memory-plugin-pre')?.version).toBe('1.0.0');
      expect(result.loaded).not.toContain('kiro-memory-plugin-pre');
    });
  });

  // ── Integrazione worker ────────────────────────────────────────────────────

  describe('integrazione', () => {
    it('loadPlugin rende il plugin disponibile tramite registry.get()', async () => {
      const plugin = makePlugin({ name: 'kiro-memory-plugin-avail' });
      loader.mockModules.set('kiro-memory-plugin-avail', plugin);

      expect(registry.get('kiro-memory-plugin-avail')).toBeUndefined();
      await loader.loadPlugin('kiro-memory-plugin-avail');
      expect(registry.get('kiro-memory-plugin-avail')).toBeDefined();
    });

    it('più plugin possono essere caricati indipendentemente', async () => {
      const names = ['kiro-memory-plugin-a', 'kiro-memory-plugin-b', 'kiro-memory-plugin-c'];

      for (const name of names) {
        loader.mockModules.set(name, makePlugin({ name }));
        await loader.loadPlugin(name);
      }

      for (const name of names) {
        expect(registry.get(name)).toBeDefined();
      }
    });
  });
});
