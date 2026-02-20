// Export search components
export { ChromaManager, getChromaManager } from './ChromaManager.js';
export { HybridSearch, getHybridSearch } from './HybridSearch.js';
export type { SearchResult } from './HybridSearch.js';
export {
  recencyScore,
  normalizeFTS5Rank,
  projectMatchScore,
  computeCompositeScore,
  estimateTokens,
  SEARCH_WEIGHTS,
  CONTEXT_WEIGHTS
} from './ScoringEngine.js';
