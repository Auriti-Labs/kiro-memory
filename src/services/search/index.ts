// Export search components
export { HybridSearch, getHybridSearch } from './HybridSearch.js';
export type { SearchResult } from './HybridSearch.js';
export {
  recencyScore,
  normalizeFTS5Rank,
  projectMatchScore,
  computeCompositeScore,
  estimateTokens,
  accessRecencyScore,
  stalenessPenalty,
  knowledgeTypeBoost,
  SEARCH_WEIGHTS,
  CONTEXT_WEIGHTS,
  KNOWLEDGE_TYPE_BOOST
} from './ScoringEngine.js';
