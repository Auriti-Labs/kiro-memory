/**
 * PluginRegistry — registro singleton dei plugin di Kiro Memory.
 *
 * Responsabilità:
 *   - Registrare / deregistrare plugin
 *   - Gestire il ciclo di vita: registered → initializing → active → destroyed
 *   - Emettere hook verso tutti i plugin attivi con isolamento degli errori
 *   - Applicare timeout su init(), destroy() e sui singoli hook
 *
 * Isolamento errori: un plugin che lancia eccezione non blocca gli altri.
 * I timeout sono implementati con Promise.race + AbortController-free pattern.
 */

import { logger } from '../../utils/logger.js';
import type { IPlugin, PluginContext, PluginHooks, PluginInfo, PluginLogger, PluginState } from './types.js';

// ── Costanti di timeout ───────────────────────────────────────────────────────

const TIMEOUT_INIT_MS = 5_000;    // 5 secondi per init()
const TIMEOUT_DESTROY_MS = 5_000; // 5 secondi per destroy()
const TIMEOUT_HOOK_MS = 10_000;   // 10 secondi per ogni hook

// ── Stato interno per plugin registrato ──────────────────────────────────────

interface PluginEntry {
  plugin: IPlugin;
  state: PluginState;
  error?: string;
}

// ── Helper timeout ────────────────────────────────────────────────────────────

/**
 * Avvolge una Promise con un timeout.
 * Rigetta con un errore descrittivo se la Promise non si risolve entro timeoutMs.
 */
function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Timeout dopo ${timeoutMs}ms: ${label}`));
    }, timeoutMs);

    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (err)   => { clearTimeout(timer); reject(err); }
    );
  });
}

// ── PluginRegistry ────────────────────────────────────────────────────────────

export class PluginRegistry {
  private static _instance: PluginRegistry | null = null;

  /** Mappa nome → entry con stato interno */
  private readonly entries = new Map<string, PluginEntry>();

  private constructor() {}

  /**
   * Singleton: restituisce l'unica istanza del registry.
   * Il registry è condiviso da tutti i moduli del worker.
   */
  static getInstance(): PluginRegistry {
    if (!PluginRegistry._instance) {
      PluginRegistry._instance = new PluginRegistry();
    }
    return PluginRegistry._instance;
  }

  /**
   * Resetta l'istanza singleton — solo per uso nei test.
   * @internal
   */
  static _resetForTests(): void {
    PluginRegistry._instance = null;
  }

  // ── Registrazione ──────────────────────────────────────────────────────────

  /**
   * Registra un plugin. Dopo la registrazione il plugin è in stato 'registered'
   * e non è ancora attivo: chiama enable() per inizializzarlo.
   *
   * Lancia un errore se il nome è già in uso.
   */
  register(plugin: IPlugin): void {
    if (this.entries.has(plugin.name)) {
      throw new Error(`Plugin già registrato: "${plugin.name}"`);
    }

    this.entries.set(plugin.name, {
      plugin,
      state: 'registered',
    });

    logger.info('SYSTEM', `[PluginRegistry] Plugin registrato: ${plugin.name}@${plugin.version}`);
  }

  /**
   * Deregistra un plugin: chiama destroy() se attivo, poi rimuove dal registry.
   * Non lancia errori se il plugin non esiste.
   */
  async unregister(name: string): Promise<void> {
    const entry = this.entries.get(name);
    if (!entry) return;

    if (entry.state === 'active') {
      await this._runDestroy(entry);
    }

    this.entries.delete(name);
    logger.info('SYSTEM', `[PluginRegistry] Plugin rimosso: ${name}`);
  }

  // ── Accesso ────────────────────────────────────────────────────────────────

  /**
   * Restituisce lo snapshot di tutti i plugin registrati con il loro stato.
   */
  getAll(): PluginInfo[] {
    return Array.from(this.entries.values()).map((e) => ({
      name: e.plugin.name,
      version: e.plugin.version,
      description: e.plugin.description,
      state: e.state,
      error: e.error,
    }));
  }

  /**
   * Restituisce il plugin per nome, o undefined se non registrato.
   */
  get(name: string): IPlugin | undefined {
    return this.entries.get(name)?.plugin;
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  /**
   * Abilita un plugin: chiama init(context) con timeout 5s.
   * Imposta lo stato su 'active' in caso di successo, 'error' altrimenti.
   *
   * Non lancia eccezioni verso il chiamante: l'errore è catturato e loggato.
   */
  async enable(name: string, context: PluginContext): Promise<void> {
    const entry = this.entries.get(name);
    if (!entry) {
      throw new Error(`Plugin non trovato: "${name}"`);
    }

    if (entry.state === 'active') {
      logger.info('SYSTEM', `[PluginRegistry] Plugin già attivo: ${name}`);
      return;
    }

    entry.state = 'initializing';
    entry.error = undefined;

    try {
      await withTimeout(
        entry.plugin.init(context),
        TIMEOUT_INIT_MS,
        `${name}.init()`
      );

      entry.state = 'active';
      logger.info('SYSTEM', `[PluginRegistry] Plugin attivato: ${name}`);
    } catch (err) {
      entry.state = 'error';
      entry.error = err instanceof Error ? err.message : String(err);
      logger.error('SYSTEM', `[PluginRegistry] init() fallito per "${name}": ${entry.error}`);
      // Non rilanciamo per non bloccare il worker al bootstrap
    }
  }

  /**
   * Disabilita un plugin: chiama destroy() con timeout 5s.
   * Imposta lo stato su 'destroyed' in caso di successo, 'error' altrimenti.
   */
  async disable(name: string): Promise<void> {
    const entry = this.entries.get(name);
    if (!entry) {
      throw new Error(`Plugin non trovato: "${name}"`);
    }

    if (entry.state !== 'active') {
      logger.info('SYSTEM', `[PluginRegistry] Plugin non attivo, skip destroy: ${name}`);
      return;
    }

    await this._runDestroy(entry);
  }

  // ── Emissione hook ─────────────────────────────────────────────────────────

  /**
   * Emette un hook verso tutti i plugin attivi che lo implementano.
   *
   * Ogni plugin è chiamato in parallelo con isolamento degli errori:
   * se un plugin fallisce o va in timeout, gli altri continuano.
   *
   * @param hookName - Chiave dell'hook in PluginHooks (es. 'onObservation')
   * @param payload  - Payload tipizzato per quell'hook
   */
  async emitHook<K extends keyof PluginHooks>(
    hookName: K,
    payload: Parameters<NonNullable<PluginHooks[K]>>[0]
  ): Promise<void> {
    const activeEntries = Array.from(this.entries.values()).filter(
      (e) => e.state === 'active' && e.plugin.hooks?.[hookName]
    );

    if (activeEntries.length === 0) return;

    // Esecuzione parallela con isolamento errori e timeout per ogni plugin
    await Promise.allSettled(
      activeEntries.map((entry) => {
        const hookFn = entry.plugin.hooks![hookName] as
          | ((p: typeof payload) => Promise<void>)
          | undefined;

        if (!hookFn) return Promise.resolve();

        const hookPromise = hookFn(payload);

        return withTimeout(
          hookPromise,
          TIMEOUT_HOOK_MS,
          `${entry.plugin.name}.hooks.${hookName}()`
        ).catch((err: unknown) => {
          // Isolamento: logga ma non propaga l'errore
          const msg = err instanceof Error ? err.message : String(err);
          logger.warn(
            'SYSTEM',
            `[PluginRegistry] Hook ${hookName} fallito in "${entry.plugin.name}": ${msg}`
          );
        });
      })
    );
  }

  // ── Metodi privati ─────────────────────────────────────────────────────────

  /** Esegue destroy() con timeout e aggiorna lo stato dell'entry. */
  private async _runDestroy(entry: PluginEntry): Promise<void> {
    try {
      await withTimeout(
        entry.plugin.destroy(),
        TIMEOUT_DESTROY_MS,
        `${entry.plugin.name}.destroy()`
      );

      entry.state = 'destroyed';
      logger.info('SYSTEM', `[PluginRegistry] Plugin disabilitato: ${entry.plugin.name}`);
    } catch (err) {
      entry.state = 'error';
      entry.error = err instanceof Error ? err.message : String(err);
      logger.error(
        'SYSTEM',
        `[PluginRegistry] destroy() fallito per "${entry.plugin.name}": ${entry.error}`
      );
    }
  }
}

// ── Factory del logger per plugin ─────────────────────────────────────────────

/**
 * Crea un PluginLogger che scrive sul logger di sistema con prefisso [PLUGIN:<name>].
 */
export function createPluginLogger(pluginName: string): PluginLogger {
  const prefix = `[PLUGIN:${pluginName}]`;
  return {
    info:  (msg, ...args) => logger.info('SYSTEM',  `${prefix} ${msg}`, {}, ...args),
    warn:  (msg, ...args) => logger.warn('SYSTEM',  `${prefix} ${msg}`, {}, ...args),
    error: (msg, ...args) => logger.error('SYSTEM', `${prefix} ${msg}`, {}, ...args),
  };
}

// ── Esportazione del tipo PluginLogger ────────────────────────────────────────

export type { PluginLogger } from './types.js';
