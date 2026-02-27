/**
 * Scoring engine for intelligent ranking
 *
 * Pure functions with no DB dependencies. Combines 4 signals:
 * - semantic: cosine similarity from embedding
 * - fts5: normalized FTS5 rank
 * - recency: exponential decay based on age
 * - projectMatch: 1 if project matches, 0 otherwise
 */

import type { ScoringWeights } from '../../types/worker-types.js';

/** Weights for search mode (with text query) */
export const SEARCH_WEIGHTS: ScoringWeights = {
  semantic: 0.4,
  fts5: 0.3,
  recency: 0.2,
  projectMatch: 0.1
};

/** Weights for context mode (no query, e.g. agentSpawn) */
export const CONTEXT_WEIGHTS: ScoringWeights = {
  semantic: 0.0,
  fts5: 0.0,
  recency: 0.7,
  projectMatch: 0.3
};

/**
 * Calculate recency score with exponential decay.
 * More recent = higher (close to 1). After halfLifeHours the score is ~0.5.
 *
 * @param createdAtEpoch - Creation timestamp in milliseconds
 * @param halfLifeHours - Half-life in hours (default: 168 = 7 days)
 * @returns Score 0-1
 */
export function recencyScore(createdAtEpoch: number, halfLifeHours: number = 168): number {
  if (!createdAtEpoch || createdAtEpoch <= 0) return 0;

  const nowMs = Date.now();
  const ageMs = nowMs - createdAtEpoch;

  // If timestamp is in the future, maximum score
  if (ageMs <= 0) return 1;

  const ageHours = ageMs / (1000 * 60 * 60);

  // Exponential decay: exp(-age * ln(2) / halfLife)
  return Math.exp(-ageHours * Math.LN2 / halfLifeHours);
}

/**
 * Normalize a raw FTS5 rank into 0-1 range.
 * FTS5 rank is negative: more negative = more relevant.
 * Min-max normalization relative to all ranks in the batch.
 *
 * @param rank - Raw FTS5 rank (negative)
 * @param allRanks - All ranks in the batch for normalization
 * @returns Score 0-1 (1 = most relevant)
 */
export function normalizeFTS5Rank(rank: number, allRanks: number[]): number {
  if (allRanks.length === 0) return 0;
  if (allRanks.length === 1) return 1; // Single result: maximum relevance

  const minRank = Math.min(...allRanks); // Most negative = best
  const maxRank = Math.max(...allRanks); // Least negative = worst

  // If all equal, return 1
  if (minRank === maxRank) return 1;

  // Invert: most negative becomes 1, least negative becomes 0
  return (maxRank - rank) / (maxRank - minRank);
}

/**
 * Binary score for project match.
 *
 * @param itemProject - Project of the item
 * @param targetProject - Target project (e.g. current project)
 * @returns 1 if they match, 0 otherwise
 */
export function projectMatchScore(itemProject: string, targetProject: string): number {
  if (!itemProject || !targetProject) return 0;
  return itemProject.toLowerCase() === targetProject.toLowerCase() ? 1 : 0;
}

/**
 * Calculate weighted composite score combining the 4 signals.
 *
 * @param signals - Values of the 4 signals (each 0-1)
 * @param weights - Weights for each signal
 * @returns Composite score 0-1
 */
export function computeCompositeScore(
  signals: {
    semantic: number;
    fts5: number;
    recency: number;
    projectMatch: number;
  },
  weights: ScoringWeights
): number {
  return (
    signals.semantic * weights.semantic +
    signals.fts5 * weights.fts5 +
    signals.recency * weights.recency +
    signals.projectMatch * weights.projectMatch
  );
}

/**
 * Recency score based on last access (search that found the observation).
 * Uses shorter half-life than recencyScore() because access is more volatile.
 *
 * If the observation was never accessed, returns 0 (maximum penalty).
 *
 * @param lastAccessedEpoch - Last access timestamp in milliseconds (null if never accessed)
 * @param halfLifeHours - Half-life in hours (default: 48 = 2 days)
 * @returns Score 0-1 (1 = recently accessed)
 */
export function accessRecencyScore(lastAccessedEpoch: number | null, halfLifeHours: number = 48): number {
  if (!lastAccessedEpoch || lastAccessedEpoch <= 0) return 0;

  const nowMs = Date.now();
  const ageMs = nowMs - lastAccessedEpoch;

  // If timestamp is in the future, maximum score
  if (ageMs <= 0) return 1;

  const ageHours = ageMs / (1000 * 60 * 60);
  return Math.exp(-ageHours * Math.LN2 / halfLifeHours);
}

/**
 * Penalty for stale observations (files modified after the observation).
 * Returns a multiplier: 1.0 if fresh, 0.5 if stale.
 * Does not remove the observation from ranking but penalizes it significantly.
 *
 * @param isStale - Stale flag (0 = fresh, 1 = stale)
 * @returns Multiplier 0.5-1.0
 */
export function stalenessPenalty(isStale: number): number {
  return isStale === 1 ? 0.5 : 1.0;
}

/**
 * Multiplicative boost for structured knowledge types.
 * Constraint and decision weigh more because they represent critical rules and choices.
 * Non-knowledge types stay at 1.0 (no boost).
 */
export const KNOWLEDGE_TYPE_BOOST: Record<string, number> = {
  constraint: 1.30,
  decision: 1.25,
  heuristic: 1.15,
  rejected: 1.10
};

/**
 * Returns the boost multiplier for the observation type.
 * Knowledge types get a boost, all others stay at 1.0.
 *
 * @param type - Observation type
 * @returns Multiplier >= 1.0
 */
export function knowledgeTypeBoost(type: string): number {
  return KNOWLEDGE_TYPE_BOOST[type] ?? 1.0;
}

/**
 * Approximate token estimation from a string.
 * Uses the rule of thumb: 1 token ≈ 4 characters.
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}
