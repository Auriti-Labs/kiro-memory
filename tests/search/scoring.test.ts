/**
 * Test suite for ScoringEngine
 *
 * Tests all pure scoring functions: recency decay, FTS5 normalization,
 * project match, composite score, knowledge type boosts and token estimation.
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import {
  recencyScore,
  normalizeFTS5Rank,
  projectMatchScore,
  computeCompositeScore,
  knowledgeTypeBoost,
  estimateTokens,
  accessRecencyScore,
  stalenessPenalty,
  SEARCH_WEIGHTS,
  CONTEXT_WEIGHTS,
  KNOWLEDGE_TYPE_BOOST
} from '../../src/services/search/ScoringEngine.js';
import type { ScoringWeights } from '../../src/types/worker-types.js';

// ============================================================================
// recencyScore
// ============================================================================

describe('recencyScore', () => {
  it('returns 1 for a future timestamp', () => {
    const future = Date.now() + 1000 * 60 * 60; // 1 hour in the future
    expect(recencyScore(future)).toBe(1);
  });

  it('returns exactly 0.5 at the half-life boundary', () => {
    const halfLifeHours = 168; // default: 7 days
    const halfLifeMs = halfLifeHours * 60 * 60 * 1000;
    const timestamp = Date.now() - halfLifeMs;

    const score = recencyScore(timestamp, halfLifeHours);

    // Allow 1% tolerance for the time elapsed during the test call itself
    expect(score).toBeGreaterThan(0.49);
    expect(score).toBeLessThanOrEqual(0.5);
  });

  it('returns higher score for recent items than for old items', () => {
    const oneHourAgo = Date.now() - 1 * 60 * 60 * 1000;
    const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const oneMonthAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;

    const recentScore = recencyScore(oneHourAgo);
    const weekScore = recencyScore(oneWeekAgo);
    const monthScore = recencyScore(oneMonthAgo);

    expect(recentScore).toBeGreaterThan(weekScore);
    expect(weekScore).toBeGreaterThan(monthScore);
  });

  it('returns score strictly between 0 and 1 for any positive past timestamp', () => {
    const tenYearsAgo = Date.now() - 10 * 365 * 24 * 60 * 60 * 1000;
    const score = recencyScore(tenYearsAgo);
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThan(1);
  });

  it('returns 0 for invalid timestamp (zero)', () => {
    expect(recencyScore(0)).toBe(0);
  });

  it('returns 0 for negative timestamp', () => {
    expect(recencyScore(-1)).toBe(0);
  });

  it('uses custom half-life correctly: shorter half-life decays faster', () => {
    const twoHoursAgo = Date.now() - 2 * 60 * 60 * 1000;

    const scoreWith1hHalfLife = recencyScore(twoHoursAgo, 1);   // very fast decay
    const scoreWith168hHalfLife = recencyScore(twoHoursAgo, 168); // slow decay

    expect(scoreWith1hHalfLife).toBeLessThan(scoreWith168hHalfLife);
  });
});

// ============================================================================
// normalizeFTS5Rank
// ============================================================================

describe('normalizeFTS5Rank', () => {
  it('returns 0 for empty rank array', () => {
    expect(normalizeFTS5Rank(-5, [])).toBe(0);
  });

  it('returns 1 for a single-element array', () => {
    expect(normalizeFTS5Rank(-3.7, [-3.7])).toBe(1);
  });

  it('returns 1 when all ranks are equal', () => {
    const ranks = [-2.0, -2.0, -2.0];
    expect(normalizeFTS5Rank(-2.0, ranks)).toBe(1);
  });

  it('returns 1 for the best (most negative) rank', () => {
    const ranks = [-10, -5, -1];
    // -10 is most negative = best match
    expect(normalizeFTS5Rank(-10, ranks)).toBe(1);
  });

  it('returns 0 for the worst (least negative) rank', () => {
    const ranks = [-10, -5, -1];
    // -1 is least negative = worst match
    expect(normalizeFTS5Rank(-1, ranks)).toBe(0);
  });

  it('returns an intermediate score for a mid-range rank', () => {
    const ranks = [-10, -5, 0];
    // -5 is exactly in the middle: (0 - (-5)) / (0 - (-10)) = 5/10 = 0.5
    const score = normalizeFTS5Rank(-5, ranks);
    expect(score).toBeCloseTo(0.5, 5);
  });

  it('scores are monotonically increasing as rank gets more negative', () => {
    const ranks = [-20, -10, -5, -1];
    const scores = ranks.map(r => normalizeFTS5Rank(r, ranks));

    // Most negative first — scores should be descending (first is highest)
    for (let i = 0; i < scores.length - 1; i++) {
      expect(scores[i]).toBeGreaterThan(scores[i + 1]);
    }
  });
});

// ============================================================================
// projectMatchScore
// ============================================================================

describe('projectMatchScore', () => {
  it('returns 1 when projects match exactly', () => {
    expect(projectMatchScore('kiro-memory', 'kiro-memory')).toBe(1);
  });

  it('returns 1 when projects match case-insensitively', () => {
    expect(projectMatchScore('Kiro-Memory', 'kiro-memory')).toBe(1);
    expect(projectMatchScore('kiro-memory', 'KIRO-MEMORY')).toBe(1);
  });

  it('returns 0 when projects differ', () => {
    expect(projectMatchScore('kiro-memory', 'other-project')).toBe(0);
  });

  it('returns 0 when item project is empty string', () => {
    expect(projectMatchScore('', 'kiro-memory')).toBe(0);
  });

  it('returns 0 when target project is empty string', () => {
    expect(projectMatchScore('kiro-memory', '')).toBe(0);
  });

  it('returns 0 when both projects are empty strings', () => {
    expect(projectMatchScore('', '')).toBe(0);
  });
});

// ============================================================================
// computeCompositeScore
// ============================================================================

describe('computeCompositeScore', () => {
  it('returns 0 when all signals are 0', () => {
    const signals = { semantic: 0, fts5: 0, recency: 0, projectMatch: 0 };
    expect(computeCompositeScore(signals, SEARCH_WEIGHTS)).toBe(0);
  });

  it('returns weighted sum equal to sum of weights when all signals are 1', () => {
    const signals = { semantic: 1, fts5: 1, recency: 1, projectMatch: 1 };
    const total = SEARCH_WEIGHTS.semantic + SEARCH_WEIGHTS.fts5 + SEARCH_WEIGHTS.recency + SEARCH_WEIGHTS.projectMatch;
    expect(computeCompositeScore(signals, SEARCH_WEIGHTS)).toBeCloseTo(total, 10);
  });

  it('gives more weight to recency in CONTEXT_WEIGHTS mode', () => {
    const highRecency = { semantic: 0, fts5: 0, recency: 1, projectMatch: 0 };
    const highSemantic = { semantic: 1, fts5: 0, recency: 0, projectMatch: 0 };

    const contextRecency = computeCompositeScore(highRecency, CONTEXT_WEIGHTS);
    const contextSemantic = computeCompositeScore(highSemantic, CONTEXT_WEIGHTS);

    // In context mode semantic weight = 0, so recency dominates
    expect(contextRecency).toBeGreaterThan(contextSemantic);
  });

  it('gives more weight to semantic in SEARCH_WEIGHTS mode', () => {
    const highSemantic = { semantic: 1, fts5: 0, recency: 0, projectMatch: 0 };
    const highRecency = { semantic: 0, fts5: 0, recency: 1, projectMatch: 0 };

    const searchSemantic = computeCompositeScore(highSemantic, SEARCH_WEIGHTS);
    const searchRecency = computeCompositeScore(highRecency, SEARCH_WEIGHTS);

    // SEARCH_WEIGHTS: semantic=0.4, recency=0.2 → semantic wins
    expect(searchSemantic).toBeGreaterThan(searchRecency);
  });

  it('computes exact dot product with custom weights', () => {
    const signals = { semantic: 0.8, fts5: 0.6, recency: 0.4, projectMatch: 1.0 };
    const weights: ScoringWeights = { semantic: 0.4, fts5: 0.3, recency: 0.2, projectMatch: 0.1 };
    // 0.8*0.4 + 0.6*0.3 + 0.4*0.2 + 1.0*0.1 = 0.32 + 0.18 + 0.08 + 0.10 = 0.68
    expect(computeCompositeScore(signals, weights)).toBeCloseTo(0.68, 10);
  });

  it('produces a score in range [0, 1] for normalized signals', () => {
    const signals = { semantic: 0.5, fts5: 0.7, recency: 0.3, projectMatch: 1.0 };
    const score = computeCompositeScore(signals, SEARCH_WEIGHTS);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(1);
  });
});

// ============================================================================
// knowledgeTypeBoost
// ============================================================================

describe('knowledgeTypeBoost', () => {
  it('returns 1.30 for constraint type', () => {
    expect(knowledgeTypeBoost('constraint')).toBe(1.30);
  });

  it('returns 1.25 for decision type', () => {
    expect(knowledgeTypeBoost('decision')).toBe(1.25);
  });

  it('returns 1.15 for heuristic type', () => {
    expect(knowledgeTypeBoost('heuristic')).toBe(1.15);
  });

  it('returns 1.10 for rejected type', () => {
    expect(knowledgeTypeBoost('rejected')).toBe(1.10);
  });

  it('returns 1.0 for unknown types (no boost)', () => {
    expect(knowledgeTypeBoost('bug-fix')).toBe(1.0);
    expect(knowledgeTypeBoost('observation')).toBe(1.0);
    expect(knowledgeTypeBoost('')).toBe(1.0);
    expect(knowledgeTypeBoost('CONSTRAINT')).toBe(1.0); // case-sensitive
  });

  it('constraint has the highest boost among all knowledge types', () => {
    const boosts = Object.values(KNOWLEDGE_TYPE_BOOST);
    const maxBoost = Math.max(...boosts);
    expect(knowledgeTypeBoost('constraint')).toBe(maxBoost);
  });

  it('all knowledge type boosts are strictly greater than 1', () => {
    for (const [type, boost] of Object.entries(KNOWLEDGE_TYPE_BOOST)) {
      expect(boost).toBeGreaterThan(1.0);
    }
  });
});

// ============================================================================
// estimateTokens
// ============================================================================

describe('estimateTokens', () => {
  it('returns 0 for empty string', () => {
    expect(estimateTokens('')).toBe(0);
  });

  it('returns 0 for falsy input', () => {
    // TypeScript signature is string, but test defensive behavior
    expect(estimateTokens(null as unknown as string)).toBe(0);
    expect(estimateTokens(undefined as unknown as string)).toBe(0);
  });

  it('returns 1 for a 4-character string (1 token exactly)', () => {
    expect(estimateTokens('abcd')).toBe(1);
  });

  it('rounds up: 5 characters → 2 tokens', () => {
    expect(estimateTokens('abcde')).toBe(2);
  });

  it('rounds up: 1 character → 1 token', () => {
    expect(estimateTokens('a')).toBe(1);
  });

  it('scales linearly with length', () => {
    const text100 = 'a'.repeat(100);
    const text400 = 'a'.repeat(400);
    expect(estimateTokens(text400)).toBe(estimateTokens(text100) * 4);
  });

  it('gives a reasonable estimate for a typical sentence', () => {
    // "The quick brown fox jumps over the lazy dog" = 43 chars → ceil(43/4) = 11 tokens
    const sentence = 'The quick brown fox jumps over the lazy dog';
    expect(estimateTokens(sentence)).toBe(Math.ceil(sentence.length / 4));
  });

  it('gives a reasonable estimate for a long paragraph', () => {
    const paragraph = 'a'.repeat(2000); // 2000 chars → 500 tokens
    expect(estimateTokens(paragraph)).toBe(500);
  });
});

// ============================================================================
// accessRecencyScore (bonus: validates the second recency variant)
// ============================================================================

describe('accessRecencyScore', () => {
  it('returns 0 for null (never accessed)', () => {
    expect(accessRecencyScore(null)).toBe(0);
  });

  it('returns 0 for 0 (invalid epoch)', () => {
    expect(accessRecencyScore(0)).toBe(0);
  });

  it('returns 1 for a future access timestamp', () => {
    const future = Date.now() + 5000;
    expect(accessRecencyScore(future)).toBe(1);
  });

  it('returns approximately 0.5 at the 48-hour half-life', () => {
    const halfLifeMs = 48 * 60 * 60 * 1000;
    const ts = Date.now() - halfLifeMs;
    const score = accessRecencyScore(ts, 48);
    expect(score).toBeGreaterThan(0.49);
    expect(score).toBeLessThanOrEqual(0.5);
  });

  it('decays faster than recencyScore (shorter default half-life: 48h vs 168h)', () => {
    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
    const accessScore = accessRecencyScore(oneDayAgo); // half-life = 48h
    const creationScore = recencyScore(oneDayAgo);     // half-life = 168h

    // After 1 day: access score (48h half-life) should be lower than creation score (168h half-life)
    expect(accessScore).toBeLessThan(creationScore);
  });
});

// ============================================================================
// stalenessPenalty
// ============================================================================

describe('stalenessPenalty', () => {
  it('returns 0.5 for stale observations (isStale = 1)', () => {
    expect(stalenessPenalty(1)).toBe(0.5);
  });

  it('returns 1.0 for fresh observations (isStale = 0)', () => {
    expect(stalenessPenalty(0)).toBe(1.0);
  });

  it('stale observations are penalized by 50%', () => {
    const fresh = stalenessPenalty(0);
    const stale = stalenessPenalty(1);
    expect(stale).toBe(fresh * 0.5);
  });
});

// ============================================================================
// Exported weight constants
// ============================================================================

describe('SEARCH_WEIGHTS', () => {
  it('all weights sum to 1.0', () => {
    const sum = SEARCH_WEIGHTS.semantic + SEARCH_WEIGHTS.fts5 + SEARCH_WEIGHTS.recency + SEARCH_WEIGHTS.projectMatch;
    expect(sum).toBeCloseTo(1.0, 10);
  });

  it('semantic has the highest weight in search mode', () => {
    expect(SEARCH_WEIGHTS.semantic).toBeGreaterThan(SEARCH_WEIGHTS.fts5);
    expect(SEARCH_WEIGHTS.semantic).toBeGreaterThan(SEARCH_WEIGHTS.recency);
    expect(SEARCH_WEIGHTS.semantic).toBeGreaterThan(SEARCH_WEIGHTS.projectMatch);
  });
});

describe('CONTEXT_WEIGHTS', () => {
  it('all weights sum to 1.0', () => {
    const sum = CONTEXT_WEIGHTS.semantic + CONTEXT_WEIGHTS.fts5 + CONTEXT_WEIGHTS.recency + CONTEXT_WEIGHTS.projectMatch;
    expect(sum).toBeCloseTo(1.0, 10);
  });

  it('recency has the highest weight in context mode', () => {
    expect(CONTEXT_WEIGHTS.recency).toBeGreaterThan(CONTEXT_WEIGHTS.projectMatch);
    expect(CONTEXT_WEIGHTS.recency).toBeGreaterThan(CONTEXT_WEIGHTS.semantic);
    expect(CONTEXT_WEIGHTS.recency).toBeGreaterThan(CONTEXT_WEIGHTS.fts5);
  });

  it('semantic and fts5 are 0 in context mode (no query)', () => {
    expect(CONTEXT_WEIGHTS.semantic).toBe(0);
    expect(CONTEXT_WEIGHTS.fts5).toBe(0);
  });
});
