/**
 * Kiro Memory - Persistent cross-session memory for Kiro CLI
 *
 * @packageDocumentation
 */

// Export SDK (new names)
export { KiroMemorySDK, createKiroMemory } from './sdk/index.js';
export type { KiroMemoryConfig } from './sdk/index.js';

// Backward-compatible aliases
export { ContextKitSDK, createContextKit } from './sdk/index.js';
export type { ContextKitConfig } from './sdk/index.js';

// Export database
export {
  KiroMemoryDatabase,
  ContextKitDatabase,
  DatabaseManager,
  getDatabase,
  initializeDatabase
} from './services/sqlite/index.js';

// Export advanced search
export {
  searchObservationsFTS,
  searchObservationsLIKE,
  searchSummariesFiltered,
  getObservationsByIds,
  getTimeline,
  getProjectStats
} from './services/sqlite/Search.js';

// Export types
export type {
  Observation,
  Summary,
  UserPrompt,
  DBSession,
  ContextContext,
  KiroMessage,
  KiroSession,
  KiroHookInput,
  SearchFilters,
  SearchResult,
  TimelineEntry
} from './types/worker-types.js';

// Export shared hook utilities
export { readStdin, detectProject, formatContext, runHook } from './hooks/utils.js';

// Export utilities
export { logger, LogLevel } from './utils/logger.js';
export type { Component } from './utils/logger.js';

// Version
export const VERSION = '1.0.0';
