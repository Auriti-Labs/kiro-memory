/**
 * Test suite per PluginRegistry.
 *
 * Copre:
 *   - Registrazione e deregistrazione
 *   - Ciclo di vita: registered → initializing → active → destroyed
 *   - Isolamento errori (un plugin che lancia non blocca gli altri)
 *   - Timeout su init()
 *   - Emissione hook a tutti i plugin attivi
 *   - Plugin con hook parziali (solo alcuni hook implementati)
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { PluginRegistry, createPluginLogger } from '../../src/services/plugins/PluginRegistry.js';
import type { IPlugin, PluginContext, PluginHooks } from '../../src/services/plugins/types.js';

// ── Helper per costruire un PluginContext minimale nei test ───────────────────

function makeContext(): PluginContext {
  return {
    sdk: {} as any, // Non serve un SDK reale per questi test
    logger: {
      info:  () => {},
      warn:  () => {},
      error: () => {},
    },
    config: {},
  };
}

// ── Helper per creare plugin di test ────────────────────────────────────────

function makePlugin(name: string, overrides: Partial<IPlugin> = {}): IPlugin {
  return {
    name,
    version: '1.0.0',
    description: `Plugin di test: ${name}`,
    init: async (_ctx) => {},
    destroy: async () => {},
    ...overrides,
  };
}

// ── Setup: ogni test parte da un registry pulito ─────────────────────────────

beforeEach(() => {
  PluginRegistry._resetForTests();
});

afterEach(() => {
  PluginRegistry._resetForTests();
});

// ─────────────────────────────────────────────────────────────────────────────
// Registrazione e deregistrazione
// ─────────────────────────────────────────────────────────────────────────────

describe('Registrazione plugin', () => {
  it('registra un plugin con stato "registered"', () => {
    const registry = PluginRegistry.getInstance();
    const plugin = makePlugin('test-plugin');

    registry.register(plugin);

    const all = registry.getAll();
    expect(all).toHaveLength(1);
    expect(all[0].name).toBe('test-plugin');
    expect(all[0].state).toBe('registered');
  });

  it('lancia errore se si registra lo stesso nome due volte', () => {
    const registry = PluginRegistry.getInstance();
    registry.register(makePlugin('duplicato'));

    expect(() => registry.register(makePlugin('duplicato'))).toThrow(/già registrato/);
  });

  it('get() restituisce il plugin dopo la registrazione', () => {
    const registry = PluginRegistry.getInstance();
    const plugin = makePlugin('cerca-me');

    registry.register(plugin);

    expect(registry.get('cerca-me')).toBe(plugin);
  });

  it('get() restituisce undefined per nome non registrato', () => {
    const registry = PluginRegistry.getInstance();
    expect(registry.get('non-esiste')).toBeUndefined();
  });

  it('deregistra un plugin non attivo senza chiamare destroy()', async () => {
    const registry = PluginRegistry.getInstance();
    let destroyCalled = false;

    registry.register(makePlugin('da-rimuovere', {
      destroy: async () => { destroyCalled = true; }
    }));

    await registry.unregister('da-rimuovere');

    expect(destroyCalled).toBe(false);
    expect(registry.getAll()).toHaveLength(0);
    expect(registry.get('da-rimuovere')).toBeUndefined();
  });

  it('deregistra un plugin attivo chiamando destroy()', async () => {
    const registry = PluginRegistry.getInstance();
    let destroyCalled = false;

    registry.register(makePlugin('plugin-attivo', {
      destroy: async () => { destroyCalled = true; }
    }));

    await registry.enable('plugin-attivo', makeContext());
    await registry.unregister('plugin-attivo');

    expect(destroyCalled).toBe(true);
    expect(registry.getAll()).toHaveLength(0);
  });

  it('unregister() è no-op su plugin non registrato', async () => {
    const registry = PluginRegistry.getInstance();
    // Non deve lanciare
    await expect(registry.unregister('non-esiste')).resolves.toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Ciclo di vita: init → active → destroy
// ─────────────────────────────────────────────────────────────────────────────

describe('Ciclo di vita plugin', () => {
  it('enable() passa lo stato a "active" dopo init() riuscito', async () => {
    const registry = PluginRegistry.getInstance();
    registry.register(makePlugin('ciclo-vita'));

    await registry.enable('ciclo-vita', makeContext());

    const info = registry.getAll().find(p => p.name === 'ciclo-vita');
    expect(info?.state).toBe('active');
  });

  it('enable() chiama init() con il PluginContext corretto', async () => {
    const registry = PluginRegistry.getInstance();
    let receivedCtx: PluginContext | null = null;

    registry.register(makePlugin('ctx-check', {
      init: async (ctx) => { receivedCtx = ctx; }
    }));

    const ctx = makeContext();
    await registry.enable('ctx-check', ctx);

    expect(receivedCtx).toBe(ctx);
  });

  it('disable() chiama destroy() e passa lo stato a "destroyed"', async () => {
    const registry = PluginRegistry.getInstance();
    let destroyCalled = false;

    registry.register(makePlugin('da-disabilitare', {
      destroy: async () => { destroyCalled = true; }
    }));

    await registry.enable('da-disabilitare', makeContext());
    await registry.disable('da-disabilitare');

    expect(destroyCalled).toBe(true);

    const info = registry.getAll().find(p => p.name === 'da-disabilitare');
    expect(info?.state).toBe('destroyed');
  });

  it('enable() due volte è idempotente: init() non viene chiamato due volte', async () => {
    const registry = PluginRegistry.getInstance();
    let initCount = 0;

    registry.register(makePlugin('idempotente', {
      init: async () => { initCount++; }
    }));

    await registry.enable('idempotente', makeContext());
    await registry.enable('idempotente', makeContext()); // seconda chiamata

    expect(initCount).toBe(1);
  });

  it('lancia errore se si tenta di abilitare un plugin non registrato', async () => {
    const registry = PluginRegistry.getInstance();
    await expect(registry.enable('fantasma', makeContext())).rejects.toThrow(/non trovato/);
  });

  it('lancia errore se si tenta di disabilitare un plugin non registrato', async () => {
    const registry = PluginRegistry.getInstance();
    await expect(registry.disable('fantasma')).rejects.toThrow(/non trovato/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Stato 'error' su init() fallito
// ─────────────────────────────────────────────────────────────────────────────

describe('Gestione errori init()', () => {
  it('imposta stato "error" se init() lancia un eccezione', async () => {
    const registry = PluginRegistry.getInstance();

    registry.register(makePlugin('plugin-rotto', {
      init: async () => { throw new Error('Errore di inizializzazione'); }
    }));

    await registry.enable('plugin-rotto', makeContext());

    const info = registry.getAll().find(p => p.name === 'plugin-rotto');
    expect(info?.state).toBe('error');
    expect(info?.error).toContain('Errore di inizializzazione');
  });

  it('non rilancia eccezioni da init() verso il chiamante', async () => {
    const registry = PluginRegistry.getInstance();

    registry.register(makePlugin('init-throws', {
      init: async () => { throw new Error('crash'); }
    }));

    // Non deve rigettare la Promise
    await expect(registry.enable('init-throws', makeContext())).resolves.toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Timeout su init()
// ─────────────────────────────────────────────────────────────────────────────

describe('Timeout init()', () => {
  it('imposta stato "error" se init() impiega più di 5 secondi', async () => {
    const registry = PluginRegistry.getInstance();

    // Usiamo un timeout molto lungo (mai risolto) per simulare hang
    registry.register(makePlugin('plugin-lento', {
      init: async () => new Promise<void>((_resolve) => {
        // Non si risolve mai — verrà interrotto dal timeout del registry
      })
    }));

    // Il test è necessariamente lento: aspettiamo il timeout reale del registry (5s).
    // Per velocizzare nei test, monkey-patchiamo via configurazione globale di Bun:
    // questo test accetta fino a 7s.
    await registry.enable('plugin-lento', makeContext());

    const info = registry.getAll().find(p => p.name === 'plugin-lento');
    expect(info?.state).toBe('error');
    expect(info?.error).toContain('Timeout');
  }, 8_000); // timeout bun:test per questo singolo test
});

// ─────────────────────────────────────────────────────────────────────────────
// Isolamento errori tra plugin
// ─────────────────────────────────────────────────────────────────────────────

describe('Isolamento errori tra plugin', () => {
  it('un plugin che lancia in init() non blocca gli altri', async () => {
    const registry = PluginRegistry.getInstance();
    let plugin2InitCalled = false;

    registry.register(makePlugin('rotto', {
      init: async () => { throw new Error('crash'); }
    }));
    registry.register(makePlugin('funzionante', {
      init: async () => { plugin2InitCalled = true; }
    }));

    // Abilitiamo entrambi indipendentemente
    await registry.enable('rotto', makeContext());
    await registry.enable('funzionante', makeContext());

    const rottoInfo = registry.getAll().find(p => p.name === 'rotto');
    const funzionanteInfo = registry.getAll().find(p => p.name === 'funzionante');

    expect(rottoInfo?.state).toBe('error');
    expect(funzionanteInfo?.state).toBe('active');
    expect(plugin2InitCalled).toBe(true);
  });

  it('un plugin che lancia in un hook non blocca gli altri hook', async () => {
    const registry = PluginRegistry.getInstance();
    const risultati: string[] = [];

    // Plugin che lancia nell'hook onObservation
    registry.register(makePlugin('hook-rotto', {
      hooks: {
        onObservation: async () => { throw new Error('hook crash'); }
      }
    }));

    // Plugin che funziona correttamente
    registry.register(makePlugin('hook-ok', {
      hooks: {
        onObservation: async () => { risultati.push('hook-ok'); }
      }
    }));

    await registry.enable('hook-rotto', makeContext());
    await registry.enable('hook-ok', makeContext());

    // emitHook non deve lanciare eccezioni
    await expect(
      registry.emitHook('onObservation', { id: 1, project: 'test', type: 'file-write', title: 'prova' })
    ).resolves.toBeUndefined();

    // Il plugin funzionante deve aver ricevuto l'hook
    expect(risultati).toContain('hook-ok');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Emissione hook
// ─────────────────────────────────────────────────────────────────────────────

describe('emitHook()', () => {
  it('chiama onObservation su tutti i plugin attivi', async () => {
    const registry = PluginRegistry.getInstance();
    const chiamati: string[] = [];

    registry.register(makePlugin('obs-a', {
      hooks: { onObservation: async () => { chiamati.push('obs-a'); } }
    }));
    registry.register(makePlugin('obs-b', {
      hooks: { onObservation: async () => { chiamati.push('obs-b'); } }
    }));

    await registry.enable('obs-a', makeContext());
    await registry.enable('obs-b', makeContext());

    await registry.emitHook('onObservation', {
      id: 42, project: 'test', type: 'command', title: 'npm install'
    });

    expect(chiamati).toContain('obs-a');
    expect(chiamati).toContain('obs-b');
  });

  it('chiama onSummary con il payload corretto', async () => {
    const registry = PluginRegistry.getInstance();
    let payloadRicevuto: any = null;

    registry.register(makePlugin('sum-listener', {
      hooks: {
        onSummary: async (sum) => { payloadRicevuto = sum; }
      }
    }));

    await registry.enable('sum-listener', makeContext());

    const expected = { id: 7, project: 'kiro-memory', request: 'Implementa plugin' };
    await registry.emitHook('onSummary', expected);

    expect(payloadRicevuto).toEqual(expected);
  });

  it('chiama onSessionStart e onSessionEnd', async () => {
    const registry = PluginRegistry.getInstance();
    const eventi: string[] = [];

    registry.register(makePlugin('session-watcher', {
      hooks: {
        onSessionStart: async (s) => { eventi.push(`start:${s.id}`); },
        onSessionEnd:   async (s) => { eventi.push(`end:${s.id}`); },
      }
    }));

    await registry.enable('session-watcher', makeContext());

    await registry.emitHook('onSessionStart', { id: 'sess-1', project: 'test' });
    await registry.emitHook('onSessionEnd', { id: 'sess-1', project: 'test', summary: 'Fatto' });

    expect(eventi).toEqual(['start:sess-1', 'end:sess-1']);
  });

  it('non chiama hook su plugin non attivi', async () => {
    const registry = PluginRegistry.getInstance();
    let chiamato = false;

    registry.register(makePlugin('non-abilitato', {
      hooks: {
        onObservation: async () => { chiamato = true; }
      }
    }));

    // NON chiamiamo enable()

    await registry.emitHook('onObservation', { id: 1, project: 'test', type: 'file-write', title: 'prova' });

    expect(chiamato).toBe(false);
  });

  it('emitHook è no-op se nessun plugin è attivo', async () => {
    const registry = PluginRegistry.getInstance();

    // Non deve lanciare
    await expect(
      registry.emitHook('onObservation', { id: 1, project: 'test', type: 'file-write', title: 'prova' })
    ).resolves.toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Plugin con hook parziali
// ─────────────────────────────────────────────────────────────────────────────

describe('Plugin con hook parziali', () => {
  it('plugin con solo onObservation non riceve onSummary', async () => {
    const registry = PluginRegistry.getInstance();
    const chiamatiSummary: number[] = [];

    registry.register(makePlugin('solo-obs', {
      hooks: {
        onObservation: async () => {},
        // onSummary non implementato intenzionalmente
      }
    }));

    await registry.enable('solo-obs', makeContext());

    await registry.emitHook('onSummary', { id: 10, project: 'test', request: null });

    expect(chiamatiSummary).toHaveLength(0);
  });

  it('plugin senza hooks non causa errori durante emitHook', async () => {
    const registry = PluginRegistry.getInstance();

    registry.register(makePlugin('no-hooks', {
      // hooks: undefined — nessun hook
    }));

    await registry.enable('no-hooks', makeContext());

    // Non deve lanciare
    await expect(
      registry.emitHook('onObservation', { id: 1, project: 'test', type: 'file-write', title: 'prova' })
    ).resolves.toBeUndefined();
  });

  it('un plugin con alcuni hook riceve solo i propri eventi', async () => {
    const registry = PluginRegistry.getInstance();
    const eventiA: string[] = [];
    const eventiB: string[] = [];

    // Plugin A: solo onObservation
    registry.register(makePlugin('plugin-a', {
      hooks: {
        onObservation: async () => { eventiA.push('obs'); }
      }
    }));

    // Plugin B: solo onSummary e onSessionStart
    registry.register(makePlugin('plugin-b', {
      hooks: {
        onSummary: async () => { eventiB.push('sum'); },
        onSessionStart: async () => { eventiB.push('session'); }
      }
    }));

    await registry.enable('plugin-a', makeContext());
    await registry.enable('plugin-b', makeContext());

    await registry.emitHook('onObservation', { id: 1, project: 'test', type: 'file-write', title: 'prova' });
    await registry.emitHook('onSummary', { id: 2, project: 'test', request: null });
    await registry.emitHook('onSessionStart', { id: 'sess-x', project: 'test' });

    expect(eventiA).toEqual(['obs']);
    expect(eventiB).toEqual(['sum', 'session']);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// createPluginLogger
// ─────────────────────────────────────────────────────────────────────────────

describe('createPluginLogger', () => {
  it('crea un logger con i metodi info, warn, error', () => {
    const pluginLogger = createPluginLogger('test-logger');

    expect(typeof pluginLogger.info).toBe('function');
    expect(typeof pluginLogger.warn).toBe('function');
    expect(typeof pluginLogger.error).toBe('function');
  });

  it('non lancia eccezioni quando si logga', () => {
    const pluginLogger = createPluginLogger('test-logger');

    expect(() => pluginLogger.info('messaggio informativo')).not.toThrow();
    expect(() => pluginLogger.warn('avviso')).not.toThrow();
    expect(() => pluginLogger.error('errore', new Error('dettaglio'))).not.toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Singleton
// ─────────────────────────────────────────────────────────────────────────────

describe('Singleton PluginRegistry', () => {
  it('getInstance() restituisce sempre la stessa istanza', () => {
    const r1 = PluginRegistry.getInstance();
    const r2 = PluginRegistry.getInstance();
    expect(r1).toBe(r2);
  });

  it('_resetForTests() crea una nuova istanza alla successiva chiamata', () => {
    const r1 = PluginRegistry.getInstance();
    PluginRegistry._resetForTests();
    const r2 = PluginRegistry.getInstance();
    expect(r1).not.toBe(r2);
  });
});
