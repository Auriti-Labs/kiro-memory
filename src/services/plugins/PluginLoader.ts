/**
 * PluginLoader — Discovery automatico e lifecycle management dei plugin.
 *
 * Responsabilità:
 *   1. Discovery automatico: scansiona node_modules/kiro-memory-plugin-*
 *   2. Discovery locale: carica plugin da ~/.contextkit/plugins/<nome>/index.js
 *   3. Discovery da configurazione: legge la chiave "plugins" in config.json
 *   4. Validazione: verifica che ogni modulo implementi IPlugin
 *   5. Hot reload: supporto per ricaricare un singolo plugin a runtime
 *
 * Integrazione worker:
 *   Istanziare dopo la configurazione di Express e chiamare loadAll()
 *   prima di avviare il server.
 *
 * Testabilità:
 *   Il metodo _loadModule(path) è separato e può essere sovrascritta nei test
 *   senza toccare la logica di validazione e lifecycle.
 */

import { existsSync, readdirSync, readFileSync } from 'fs';
import { join, resolve } from 'path';
import { logger } from '../../utils/logger.js';
import { DATA_DIR } from '../../shared/paths.js';
import { readConfig } from '../../cli/cli-utils.js';
import type { IPlugin } from './types.js';

// ── Versione del runtime usata per la verifica minKiroVersion ──
const KIRO_MEMORY_VERSION = '3.0.1';

/**
 * Interfaccia minima del registry necessaria al Loader.
 * Compatibile con PluginRegistry singleton (issue #29).
 */
export interface IPluginRegistry {
  register(plugin: IPlugin): void;
  unregister(name: string): void | Promise<void>;
  /** Restituisce il plugin per nome, o undefined se non registrato */
  get(name: string): IPlugin | undefined;
  /**
   * Alias di get — compatibilità con MockRegistry dei test e con IPlugin.getPlugin.
   * Il PluginLoader usa internamente get(), questo alias è opzionale.
   */
  getPlugin?(name: string): IPlugin | undefined;
}

// ── Funzione separata per il dynamic import (testabile via mock) ──

/**
 * Carica dinamicamente un modulo ESM dal percorso indicato.
 * Funzione separata (non metodo di classe) per consentire il mock nei test.
 */
export async function loadModuleFromPath(modulePath: string): Promise<unknown> {
  return import(modulePath);
}

// ── Configurazione plugin in config.json ──

export interface PluginConfigEntry {
  /** Nome del plugin (pacchetto npm o nome locale) */
  name: string;
  /** Percorso assoluto del modulo (solo per plugin locali) */
  path?: string;
  /** Se false il plugin viene ignorato; default true */
  enabled?: boolean;
}

// ── Risultato di loadAll ──

export interface LoadAllResult {
  /** Nomi dei plugin caricati con successo */
  loaded: string[];
  /** Plugin non caricati con relativo messaggio di errore */
  failed: Array<{ name: string; error: string }>;
}

// ── PluginLoader ──

export class PluginLoader {
  /**
   * Directory locale dove risiedono i plugin installati dall'utente.
   * Struttura: ~/.contextkit/plugins/<nome>/index.js
   */
  protected readonly localPluginsDir: string;

  /**
   * Radice del progetto per la ricerca in node_modules.
   * Default: process.cwd() al momento della costruzione.
   */
  protected readonly projectRoot: string;

  /**
   * Mappa dei moduli caricati per supportare il hot reload.
   * Chiave: nome plugin — Valore: percorso assoluto del modulo.
   */
  protected readonly loadedModulePaths = new Map<string, string>();

  constructor(
    protected readonly registry: IPluginRegistry,
    options: {
      localPluginsDir?: string;
      projectRoot?: string;
    } = {}
  ) {
    this.localPluginsDir = options.localPluginsDir ?? join(DATA_DIR, 'plugins');
    this.projectRoot = options.projectRoot ?? process.cwd();
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Hook di estensione per i test
  // ────────────────────────────────────────────────────────────────────────────

  /**
   * Carica il modulo grezzo da un percorso.
   * Nei test, sovrascrivere questo metodo per iniettare moduli mock
   * senza toccare il filesystem o il dynamic import.
   */
  protected async _loadModule(modulePath: string): Promise<unknown> {
    return loadModuleFromPath(modulePath);
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Discovery
  // ────────────────────────────────────────────────────────────────────────────

  /**
   * Scansiona node_modules alla ricerca di pacchetti con nome
   * che corrisponde al pattern `kiro-memory-plugin-*`.
   *
   * Ritorna i percorsi assoluti dei pacchetti trovati.
   */
  async discoverPlugins(): Promise<string[]> {
    const nodeModulesDir = join(this.projectRoot, 'node_modules');

    if (!existsSync(nodeModulesDir)) {
      logger.debug('SYSTEM', `PluginLoader: node_modules non trovato in ${nodeModulesDir}`);
      return [];
    }

    const discovered: string[] = [];

    try {
      const entries = readdirSync(nodeModulesDir, { withFileTypes: true });

      for (const entry of entries) {
        // I pacchetti npm con scope sono in sotto-directory che iniziano con "@"
        if (entry.isDirectory() && entry.name.startsWith('@')) {
          const scopeDir = join(nodeModulesDir, entry.name);
          try {
            const scopedEntries = readdirSync(scopeDir, { withFileTypes: true });
            for (const scoped of scopedEntries) {
              if (scoped.isDirectory() && scoped.name.startsWith('kiro-memory-plugin-')) {
                const pkgPath = join(scopeDir, scoped.name);
                if (this.hasValidPackageJson(pkgPath)) {
                  discovered.push(pkgPath);
                }
              }
            }
          } catch {
            // Ignora directory scope non leggibili
          }
          continue;
        }

        // Pacchetti senza scope
        if (entry.isDirectory() && entry.name.startsWith('kiro-memory-plugin-')) {
          const pkgPath = join(nodeModulesDir, entry.name);
          if (this.hasValidPackageJson(pkgPath)) {
            discovered.push(pkgPath);
          }
        }
      }
    } catch (err) {
      logger.warn('SYSTEM', `PluginLoader: errore durante la scansione di node_modules`, {}, err as Error);
    }

    logger.debug('SYSTEM', `PluginLoader: trovati ${discovered.length} plugin in node_modules`);
    return discovered;
  }

  /**
   * Verifica che la directory contenga un package.json valido
   * con il campo `main` o `exports` definito.
   */
  private hasValidPackageJson(pkgDir: string): boolean {
    const pkgJsonPath = join(pkgDir, 'package.json');
    if (!existsSync(pkgJsonPath)) return false;

    try {
      const raw = readFileSync(pkgJsonPath, 'utf-8');
      const pkg = JSON.parse(raw) as Record<string, unknown>;
      return !!(pkg.main || pkg.exports);
    } catch {
      return false;
    }
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Caricamento da percorso
  // ────────────────────────────────────────────────────────────────────────────

  /**
   * Carica un plugin da un percorso assoluto (directory o file .js).
   *
   * Logica di risoluzione:
   *   - Se `pluginPath` è una directory, cerca `index.js` al suo interno
   *   - Altrimenti usa `pluginPath` direttamente come percorso del modulo
   *   - Se la directory è un pacchetto npm, legge `main` da package.json
   *
   * @throws Error se il percorso non esiste o il modulo non è un IPlugin valido
   */
  async loadFromPath(pluginPath: string): Promise<IPlugin> {
    const absolutePath = resolve(pluginPath);

    if (!existsSync(absolutePath)) {
      throw new Error(`Percorso plugin non trovato: ${absolutePath}`);
    }

    // Risolvi l'entry point corretto
    const entryPoint = this.resolveEntryPoint(absolutePath);

    logger.debug('SYSTEM', `PluginLoader: caricamento modulo da ${entryPoint}`);

    // Usa il metodo di caricamento moduli (sovrascrivibile nei test)
    const rawModule = await this._loadModule(entryPoint);

    const plugin = this.extractPlugin(rawModule);
    this.validatePlugin(plugin);

    return plugin;
  }

  /**
   * Risolve l'entry point di un plugin dato un percorso.
   * Gestisce: directory con package.json, directory con index.js, file diretto.
   */
  private resolveEntryPoint(absolutePath: string): string {
    const pkgJsonPath = join(absolutePath, 'package.json');

    if (existsSync(pkgJsonPath)) {
      // Pacchetto npm: usa `main` da package.json
      try {
        const raw = readFileSync(pkgJsonPath, 'utf-8');
        const pkg = JSON.parse(raw) as Record<string, unknown>;
        if (typeof pkg.main === 'string') {
          return resolve(absolutePath, pkg.main);
        }
      } catch {
        // Ignora errori di parsing e ricade su index.js
      }
    }

    // Directory senza package.json: cerca index.js
    const indexPath = join(absolutePath, 'index.js');
    if (existsSync(indexPath)) {
      return indexPath;
    }

    // Percorso diretto (file .js o altro)
    return absolutePath;
  }

  /**
   * Estrae l'oggetto IPlugin dall'export del modulo caricato.
   * Supporta:
   *   - `export default plugin` (oggetto IPlugin)
   *   - `export default factory` (funzione che ritorna IPlugin)
   *   - `module.exports = plugin` (CJS)
   */
  private extractPlugin(rawModule: unknown): unknown {
    if (!rawModule || typeof rawModule !== 'object') {
      throw new Error('Il modulo non ha un export valido');
    }

    const mod = rawModule as Record<string, unknown>;

    // ESM default export
    let candidate = mod.default ?? rawModule;

    // Se è una funzione factory, invocala
    if (typeof candidate === 'function') {
      candidate = (candidate as () => unknown)();
    }

    return candidate;
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Caricamento da configurazione
  // ────────────────────────────────────────────────────────────────────────────

  /**
   * Legge la chiave `plugins` da config.json e carica ogni plugin configurato.
   * I plugin con `enabled: false` vengono saltati silenziosamente.
   */
  async loadFromConfig(): Promise<void> {
    const config = readConfig();
    const rawPlugins = config['plugins'];

    if (!rawPlugins) {
      logger.debug('SYSTEM', 'PluginLoader: nessun plugin configurato in config.json');
      return;
    }

    let entries: PluginConfigEntry[];

    try {
      entries = (typeof rawPlugins === 'string'
        ? JSON.parse(rawPlugins)
        : rawPlugins) as PluginConfigEntry[];

      if (!Array.isArray(entries)) {
        logger.warn('SYSTEM', 'PluginLoader: "plugins" in config.json deve essere un array');
        return;
      }
    } catch (err) {
      logger.warn('SYSTEM', 'PluginLoader: errore parsing "plugins" in config.json', {}, err as Error);
      return;
    }

    for (const entry of entries) {
      // Salta plugin disabilitati esplicitamente
      if (entry.enabled === false) {
        logger.debug('SYSTEM', `PluginLoader: plugin "${entry.name}" disabilitato, skip`);
        continue;
      }

      try {
        const nameOrPath = entry.path ?? entry.name;
        await this.loadPlugin(nameOrPath, entry.name);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.warn('SYSTEM', `PluginLoader: plugin "${entry.name}" non caricato da config: ${msg}`);
      }
    }
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Caricamento singolo plugin
  // ────────────────────────────────────────────────────────────────────────────

  /**
   * Carica, valida e registra un singolo plugin.
   *
   * Il metodo utilizza _loadRawPlugin() per ottenere il modulo grezzo,
   * poi applica la validazione e il lifecycle (init + register).
   *
   * @param nameOrPath - Nome npm (es. "kiro-memory-plugin-slack") o percorso assoluto
   * @param displayName - Nome da mostrare nei log (opzionale, default = nameOrPath)
   */
  async loadPlugin(nameOrPath: string, displayName?: string): Promise<void> {
    const label = displayName ?? nameOrPath;

    // Ottieni il modulo grezzo (bypass loadFromPath per non richiedere il filesystem)
    const rawModule = await this._loadRawPluginByName(nameOrPath);

    const plugin = this.extractPlugin(rawModule);
    this.validatePlugin(plugin as IPlugin);
    const typedPlugin = plugin as IPlugin;

    // Memorizza il percorso per il hot reload usando il nome effettivo del plugin
    this.loadedModulePaths.set(typedPlugin.name, nameOrPath);
    // Registra nel registry (stato: registered). init() è responsabilità di Registry.enable()
    this.registry.register(typedPlugin);

    logger.info('SYSTEM', `PluginLoader: plugin "${label}" (v${typedPlugin.version}) caricato`);
  }

  /**
   * Ottiene il modulo grezzo per un plugin dato il nome o percorso.
   * Questo metodo può essere sovrascritta nei test per iniettare moduli mock.
   *
   * La logica è:
   *   1. Se il nameOrPath è un percorso (assoluto o relativo), usa loadFromPath
   *   2. Se è un nome, risolve il percorso e usa _loadModule
   */
  protected async _loadRawPluginByName(nameOrPath: string): Promise<unknown> {
    // Per percorsi assoluti o relativi, usa loadFromPath che verifica il filesystem
    if (nameOrPath.startsWith('/') || nameOrPath.startsWith('./') || nameOrPath.startsWith('../')) {
      const plugin = await this.loadFromPath(nameOrPath);
      return { default: plugin };
    }

    // Per nomi npm, risolvi e carica
    const modulePath = this.resolveModulePath(nameOrPath);
    return this._loadModule(modulePath);
  }

  /**
   * Risolve il percorso assoluto di un plugin dato il nome o il percorso.
   *
   * - Se è un percorso assoluto: restituisce com'è
   * - Se è un percorso relativo: risolve rispetto a cwd
   * - Se è un nome npm: cerca in node_modules
   * - Se è un nome locale: cerca in ~/.contextkit/plugins/<nome>
   */
  private resolveModulePath(nameOrPath: string): string {
    // Percorso assoluto
    if (nameOrPath.startsWith('/')) {
      return nameOrPath;
    }

    // Percorso relativo
    if (nameOrPath.startsWith('./') || nameOrPath.startsWith('../')) {
      return resolve(this.projectRoot, nameOrPath);
    }

    // Nome npm: cerca in node_modules del progetto
    const nodeModulesPath = join(this.projectRoot, 'node_modules', nameOrPath);
    if (existsSync(nodeModulesPath)) {
      return nodeModulesPath;
    }

    // Plugin locale: cerca in ~/.contextkit/plugins/<nome>
    const localPath = join(this.localPluginsDir, nameOrPath);
    if (existsSync(localPath)) {
      return localPath;
    }

    // Fallback: restituisce il percorso in node_modules (fallirà con errore chiaro)
    return nodeModulesPath;
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Hot reload
  // ────────────────────────────────────────────────────────────────────────────

  /**
   * Ricarica un plugin già caricato: lo distrugge, lo rimuove dal registry
   * e lo reinizializza dal percorso originale.
   *
   * @throws Error se il plugin non è stato caricato precedentemente
   */
  async reloadPlugin(name: string): Promise<void> {
    const modulePath = this.loadedModulePaths.get(name);
    if (!modulePath) {
      throw new Error(`Plugin "${name}" non trovato — non è stato caricato da questo PluginLoader`);
    }

    // Distruggi il plugin esistente se ancora nel registry
    const existing = this.registry.get(name);
    if (existing) {
      try {
        await existing.destroy();
      } catch (err) {
        logger.warn('SYSTEM', `PluginLoader: errore durante destroy() di "${name}"`, {}, err as Error);
      }
      this.registry.unregister(name);
    }

    // Rimuovi il percorso dalla mappa per consentire la ri-registrazione
    this.loadedModulePaths.delete(name);

    // Ricarica dal percorso memorizzato
    logger.info('SYSTEM', `PluginLoader: hot reload di "${name}" da ${modulePath}`);
    await this.loadPlugin(modulePath, name);
  }

  // ────────────────────────────────────────────────────────────────────────────
  // loadAll: discovery + config completa
  // ────────────────────────────────────────────────────────────────────────────

  /**
   * Carica tutti i plugin disponibili:
   *   1. Discovery automatico da node_modules (kiro-memory-plugin-*)
   *   2. Plugin locali in ~/.contextkit/plugins/
   *   3. Plugin configurati in config.json
   *
   * I plugin già registrati non vengono caricati una seconda volta.
   * Ogni errore è isolato: un plugin fallito non blocca gli altri.
   *
   * @returns Oggetto con i nomi dei plugin caricati e quelli falliti con errore.
   */
  async loadAll(): Promise<LoadAllResult> {
    const loaded: string[] = [];
    const failed: Array<{ name: string; error: string }> = [];

    // ── 1. Discovery da node_modules ──
    const discoveredPaths = await this.discoverPlugins();
    for (const pkgPath of discoveredPaths) {
      // Ricava il nome dal package.json (più affidabile di basename)
      const pluginName = this.readPackageName(pkgPath) ?? this.basename(pkgPath);

      if (this.registry.get(pluginName)) {
        logger.debug('SYSTEM', `PluginLoader: "${pluginName}" già registrato, skip`);
        continue;
      }

      try {
        await this.loadPlugin(pkgPath, pluginName);
        loaded.push(pluginName);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.warn('SYSTEM', `PluginLoader: plugin "${pluginName}" fallito (node_modules): ${msg}`);
        failed.push({ name: pluginName, error: msg });
      }
    }

    // ── 2. Discovery locale da ~/.contextkit/plugins/ ──
    const localPlugins = this.discoverLocalPlugins();
    for (const { name, path: localPath } of localPlugins) {
      if (this.registry.get(name)) {
        logger.debug('SYSTEM', `PluginLoader: "${name}" già registrato, skip`);
        continue;
      }

      try {
        await this.loadPlugin(localPath, name);
        loaded.push(name);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.warn('SYSTEM', `PluginLoader: plugin locale "${name}" fallito: ${msg}`);
        failed.push({ name, error: msg });
      }
    }

    // ── 3. Plugin da configurazione ──
    const config = readConfig();
    const rawPlugins = config['plugins'];

    if (rawPlugins) {
      let entries: PluginConfigEntry[] = [];
      try {
        entries = (typeof rawPlugins === 'string'
          ? JSON.parse(rawPlugins)
          : rawPlugins) as PluginConfigEntry[];
      } catch { /* ignora parsing invalido */ }

      for (const entry of Array.isArray(entries) ? entries : []) {
        if (entry.enabled === false) continue;

        const effectiveName = entry.name;
        if (this.registry.get(effectiveName)) {
          logger.debug('SYSTEM', `PluginLoader: "${effectiveName}" già registrato da config, skip`);
          continue;
        }

        try {
          const nameOrPath = entry.path ?? entry.name;
          await this.loadPlugin(nameOrPath, effectiveName);
          loaded.push(effectiveName);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          logger.warn('SYSTEM', `PluginLoader: plugin da config "${effectiveName}" fallito: ${msg}`);
          failed.push({ name: effectiveName, error: msg });
        }
      }
    }

    logger.info('SYSTEM', `PluginLoader: loadAll completato — caricati=${loaded.length} falliti=${failed.length}`);
    return { loaded, failed };
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Helpers privati
  // ────────────────────────────────────────────────────────────────────────────

  /**
   * Legge il campo `name` dal package.json di un pacchetto.
   * Ritorna null se il file non esiste o il campo non è una stringa.
   */
  private readPackageName(pkgDir: string): string | null {
    const pkgJsonPath = join(pkgDir, 'package.json');
    try {
      const raw = readFileSync(pkgJsonPath, 'utf-8');
      const pkg = JSON.parse(raw) as Record<string, unknown>;
      return typeof pkg.name === 'string' ? pkg.name : null;
    } catch {
      return null;
    }
  }

  /**
   * Scansiona la directory locale dei plugin (~/.contextkit/plugins/).
   * Ogni sub-directory con un file index.js è considerata un plugin.
   */
  private discoverLocalPlugins(): Array<{ name: string; path: string }> {
    if (!existsSync(this.localPluginsDir)) {
      return [];
    }

    const result: Array<{ name: string; path: string }> = [];

    try {
      const entries = readdirSync(this.localPluginsDir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;

        const pluginDir = join(this.localPluginsDir, entry.name);
        const indexPath = join(pluginDir, 'index.js');

        if (existsSync(indexPath)) {
          result.push({ name: entry.name, path: pluginDir });
        }
      }
    } catch (err) {
      logger.warn('SYSTEM', `PluginLoader: errore durante la scansione di ${this.localPluginsDir}`, {}, err as Error);
    }

    return result;
  }

  /** Estrae il basename di un percorso (ultimo segmento) */
  private basename(p: string): string {
    return p.split('/').filter(Boolean).pop() ?? p;
  }

  /**
   * Costruisce il contesto da passare al plugin durante l'inizializzazione.
   */

  // ────────────────────────────────────────────────────────────────────────────
  // Validazione
  // ────────────────────────────────────────────────────────────────────────────

  /**
   * Valida che l'oggetto implementi correttamente IPlugin.
   *
   * Controlli:
   *   - Ha i campi obbligatori: name (string), version (string), init (function), destroy (function)
   *   - Se presente, minKiroVersion è compatibile con la versione corrente
   *
   * @throws Error con messaggio descrittivo se la validazione fallisce
   */
  protected validatePlugin(candidate: unknown): asserts candidate is IPlugin {
    if (!candidate || typeof candidate !== 'object') {
      throw new Error('Il plugin deve essere un oggetto non-null');
    }

    const p = candidate as Record<string, unknown>;

    if (!p.name || typeof p.name !== 'string') {
      throw new Error('Il plugin deve avere un campo "name" di tipo stringa');
    }

    if (!p.version || typeof p.version !== 'string') {
      throw new Error(`Plugin "${p.name}": campo "version" mancante o non stringa`);
    }

    if (typeof p.init !== 'function') {
      throw new Error(`Plugin "${p.name}": campo "init" deve essere una funzione`);
    }

    if (typeof p.destroy !== 'function') {
      throw new Error(`Plugin "${p.name}": campo "destroy" deve essere una funzione`);
    }

    // Verifica compatibilità semver semplice (major.minor.patch)
    if (p.minKiroVersion && typeof p.minKiroVersion === 'string') {
      if (!this.isVersionCompatible(KIRO_MEMORY_VERSION, p.minKiroVersion)) {
        throw new Error(
          `Plugin "${p.name}": richiede kiro-memory >= ${p.minKiroVersion}, versione corrente: ${KIRO_MEMORY_VERSION}`
        );
      }
    }
  }

  /**
   * Confronto semver semplice: verifica che `current` >= `required`.
   * Supporta il formato major.minor.patch; ignora pre-release e metadata.
   */
  private isVersionCompatible(current: string, required: string): boolean {
    const toNumbers = (v: string): number[] =>
      v.split('.').map(part => parseInt(part.replace(/[^0-9]/g, ''), 10) || 0);

    const [cMaj, cMin, cPat] = toNumbers(current);
    const [rMaj, rMin, rPat] = toNumbers(required);

    if (cMaj !== rMaj) return cMaj > rMaj;
    if (cMin !== rMin) return cMin > rMin;
    return cPat >= rPat;
  }
}
