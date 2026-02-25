import { createRequire } from 'module';const require = createRequire(import.meta.url);

// src/services/search/ScoringEngine.ts
var SEARCH_WEIGHTS = {
  semantic: 0.4,
  fts5: 0.3,
  recency: 0.2,
  projectMatch: 0.1
};
var CONTEXT_WEIGHTS = {
  semantic: 0,
  fts5: 0,
  recency: 0.7,
  projectMatch: 0.3
};
function recencyScore(createdAtEpoch, halfLifeHours = 168) {
  if (!createdAtEpoch || createdAtEpoch <= 0) return 0;
  const nowMs = Date.now();
  const ageMs = nowMs - createdAtEpoch;
  if (ageMs <= 0) return 1;
  const ageHours = ageMs / (1e3 * 60 * 60);
  return Math.exp(-ageHours * Math.LN2 / halfLifeHours);
}
function normalizeFTS5Rank(rank, allRanks) {
  if (allRanks.length === 0) return 0;
  if (allRanks.length === 1) return 1;
  const minRank = Math.min(...allRanks);
  const maxRank = Math.max(...allRanks);
  if (minRank === maxRank) return 1;
  return (maxRank - rank) / (maxRank - minRank);
}
function projectMatchScore(itemProject, targetProject) {
  if (!itemProject || !targetProject) return 0;
  return itemProject.toLowerCase() === targetProject.toLowerCase() ? 1 : 0;
}
function computeCompositeScore(signals, weights) {
  return signals.semantic * weights.semantic + signals.fts5 * weights.fts5 + signals.recency * weights.recency + signals.projectMatch * weights.projectMatch;
}
function accessRecencyScore(lastAccessedEpoch, halfLifeHours = 48) {
  if (!lastAccessedEpoch || lastAccessedEpoch <= 0) return 0;
  const nowMs = Date.now();
  const ageMs = nowMs - lastAccessedEpoch;
  if (ageMs <= 0) return 1;
  const ageHours = ageMs / (1e3 * 60 * 60);
  return Math.exp(-ageHours * Math.LN2 / halfLifeHours);
}
function stalenessPenalty(isStale) {
  return isStale === 1 ? 0.5 : 1;
}
var KNOWLEDGE_TYPE_BOOST = {
  constraint: 1.3,
  decision: 1.25,
  heuristic: 1.15,
  rejected: 1.1
};
function knowledgeTypeBoost(type) {
  return KNOWLEDGE_TYPE_BOOST[type] ?? 1;
}
function estimateTokens(text) {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}
export {
  CONTEXT_WEIGHTS,
  KNOWLEDGE_TYPE_BOOST,
  SEARCH_WEIGHTS,
  accessRecencyScore,
  computeCompositeScore,
  estimateTokens,
  knowledgeTypeBoost,
  normalizeFTS5Rank,
  projectMatchScore,
  recencyScore,
  stalenessPenalty
};
