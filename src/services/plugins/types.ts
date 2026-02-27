/**
 * Tipi pubblici del sistema plugin di Kiro Memory.
 *
 * IPlugin — contratto che ogni plugin deve rispettare.
 * PluginContext — dipendenze iniettate dal registry al momento dell'init.
 * PluginHooks — hook opzionali su eventi del ciclo di vita delle osservazioni.
 * PluginLogger — logger dedicato con prefisso nome plugin.
 * PluginState — macchina a stati del plugin.
 * PluginInfo — snapshot serializzabile dello stato di un plugin registrato.
 */

import type { KiroMemorySDK } from '../../sdk/index.js';

// ── Contratto plugin ──────────────────────────────────────────────────────────

export interface IPlugin {
  /** Nome univoco del plugin (slug, es. "my-plugin") */
  name: string;

  /** Versione semver del plugin (es. "1.0.0") */
  version: string;

  /** Versione minima di kiro-memory richiesta (semver range) */
  minKiroVersion?: string;

  /** Descrizione leggibile per l'interfaccia utente */
  description?: string;

  /**
   * Inizializzazione — chiamata dal registry al momento dell'abilitazione.
   * Deve completarsi entro il timeout configurato (default 5s).
   */
  init(context: PluginContext): Promise<void>;

  /**
   * Cleanup — chiamata dal registry quando il plugin viene disabilitato o
   * il worker si spegne. Deve rilasciare tutte le risorse.
   */
  destroy(): Promise<void>;

  /** Hook opzionali su eventi del sistema */
  hooks?: PluginHooks;
}

// ── Contesto iniettato ────────────────────────────────────────────────────────

export interface PluginContext {
  /**
   * Accesso al SDK pubblico (non al DB diretto).
   * Il plugin interagisce solo attraverso l'interfaccia pubblica del SDK.
   */
  sdk: KiroMemorySDK;

  /** Logger dedicato con prefisso automatico [PLUGIN:<nome>] */
  logger: PluginLogger;

  /**
   * Configurazione specifica del plugin letta da config.json
   * (chiave: plugins.<nome>).
   * Vuota se non configurata.
   */
  config: Record<string, unknown>;
}

// ── Hook di evento ────────────────────────────────────────────────────────────

export interface PluginHooks {
  /**
   * Invocato dopo la creazione di una nuova osservazione.
   * Riceve i campi essenziali senza il payload completo.
   */
  onObservation?: (obs: {
    id: number;
    project: string;
    type: string;
    title: string;
  }) => Promise<void>;

  /**
   * Invocato dopo la creazione di un nuovo sommario di sessione.
   */
  onSummary?: (sum: {
    id: number;
    project: string;
    request: string | null;
  }) => Promise<void>;

  /**
   * Invocato all'avvio di una nuova sessione (hook agentSpawn).
   */
  onSessionStart?: (session: {
    id: string;
    project: string;
  }) => Promise<void>;

  /**
   * Invocato alla chiusura di una sessione (hook stop).
   */
  onSessionEnd?: (session: {
    id: string;
    project: string;
    summary: string | null;
  }) => Promise<void>;
}

// ── Logger dedicato ───────────────────────────────────────────────────────────

export interface PluginLogger {
  info(msg: string, ...args: unknown[]): void;
  warn(msg: string, ...args: unknown[]): void;
  error(msg: string, ...args: unknown[]): void;
}

// ── Stato del plugin ──────────────────────────────────────────────────────────

/** Macchina a stati del ciclo di vita di un plugin */
export type PluginState =
  | 'registered'    // Registrato ma non ancora inizializzato
  | 'initializing'  // init() in corso
  | 'active'        // Operativo
  | 'error'         // init() o destroy() fallito
  | 'destroyed';    // destroy() completato con successo

// ── Info serializzabile ───────────────────────────────────────────────────────

/** Snapshot serializzabile di un plugin (usato dalla REST API e dalla CLI) */
export interface PluginInfo {
  name: string;
  version: string;
  description?: string;
  state: PluginState;
  /** Messaggio d'errore se state === 'error' */
  error?: string;
}
