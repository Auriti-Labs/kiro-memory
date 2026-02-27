/**
 * Punto d'ingresso del modulo plugins.
 * Riesporta i tipi pubblici e le classi principali.
 */

export { PluginRegistry, createPluginLogger } from './PluginRegistry.js';
export { PluginLoader } from './PluginLoader.js';
export type {
  IPlugin,
  PluginContext,
  PluginHooks,
  PluginInfo,
  PluginLogger,
  PluginState,
} from './types.js';
export type { IPluginRegistry, LoadAllResult } from './PluginLoader.js';
