/**
 * Total Recall - Persistent cross-session memory for AI coding assistants
 *
 * @packageDocumentation
 */

// Export SDK
export { TotalRecallSDK, createTotalRecall } from './sdk/index.js';
export type { TotalRecallConfig } from './sdk/index.js';

// Export database
export { TotalRecallDatabase } from './services/sqlite/index.js';

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

import { TOTALRECALL_VERSION } from './shared/version.js';

// Version
export const VERSION = TOTALRECALL_VERSION;
