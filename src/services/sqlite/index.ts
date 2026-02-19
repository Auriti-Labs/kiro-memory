// Export database components
export {
  KiroMemoryDatabase,
  DatabaseManager,
  getDatabase,
  initializeDatabase
} from './Database.js';

// Backward-compatible alias
export { KiroMemoryDatabase as ContextKitDatabase } from './Database.js';

// Export CRUD operations
export * from './Sessions.js';
export * from './Observations.js';
export * from './Summaries.js';
export * from './Prompts.js';

// Export advanced search
export * from './Search.js';
