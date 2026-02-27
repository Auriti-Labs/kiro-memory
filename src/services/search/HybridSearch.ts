/**
 * Hybrid search: combines local vector search (SQLite BLOB) with keyword search (FTS5)
 *
 * 4-signal scoring:
 * - semantic: cosine similarity from embedding
 * - fts5: normalized FTS5 rank
 * - recency: exponential decay
 * - projectMatch: project match
 *
 * If the embedding service is not available, falls back to FTS5 only.
 */

import { getEmbeddingService } from './EmbeddingService.js';
import { getVectorSearch } from './VectorSearch.js';
import {
  recencyScore,
  normalizeFTS5Rank,
  projectMatchScore,
  computeCompositeScore,
  knowledgeTypeBoost,
  SEARCH_WEIGHTS
} from './ScoringEngine.js';
import type { Database } from 'bun:sqlite';
import type { ScoringWeights } from '../../types/worker-types.js';
import { logger } from '../../utils/logger.js';

export interface SearchResult {
  id: string;
  title: string;
  content: string;
  type: string;
  project: string;
  created_at: string;
  created_at_epoch: number;
  score: number;
  source: 'vector' | 'keyword' | 'hybrid';
  signals: {
    semantic: number;
    fts5: number;
    recency: number;
    projectMatch: number;
  };
}

export class HybridSearch {
  private embeddingInitialized = false;

  /**
   * Initialize the embedding service (lazy, non-blocking)
   */
  async initialize(): Promise<void> {
    try {
      const embeddingService = getEmbeddingService();
      await embeddingService.initialize();
      this.embeddingInitialized = embeddingService.isAvailable();
      logger.info('SEARCH', `HybridSearch initialized (embedding: ${this.embeddingInitialized ? 'active' : 'disabled'})`);
    } catch (error) {
      logger.warn('SEARCH', 'Embedding initialization failed, using only FTS5', {}, error as Error);
      this.embeddingInitialized = false;
    }
  }

  /**
   * Hybrid search with 4-signal scoring
   */
  async search(
    db: Database,
    query: string,
    options: {
      project?: string;
      limit?: number;
      weights?: ScoringWeights;
    } = {}
  ): Promise<SearchResult[]> {
    const limit = options.limit || 10;
    const weights = options.weights || SEARCH_WEIGHTS;
    const targetProject = options.project || '';

    // Collect raw results from both sources
    const rawItems = new Map<string, {
      id: string;
      title: string;
      content: string;
      type: string;
      project: string;
      created_at: string;
      created_at_epoch: number;
      semanticScore: number;
      fts5Rank: number | null; // raw rank, to be normalized later
      source: 'vector' | 'keyword';
    }>();

    // Vector search (if embedding available)
    if (this.embeddingInitialized) {
      try {
        const embeddingService = getEmbeddingService();
        const queryEmbedding = await embeddingService.embed(query);

        if (queryEmbedding) {
          const vectorSearch = getVectorSearch();
          const vectorResults = await vectorSearch.search(db, queryEmbedding, {
            project: options.project,
            limit: limit * 2, // Fetch more results for ranking
            threshold: 0.3
          });

          for (const hit of vectorResults) {
            rawItems.set(String(hit.observationId), {
              id: String(hit.observationId),
              title: hit.title,
              content: hit.text || '',
              type: hit.type,
              project: hit.project,
              created_at: hit.created_at,
              created_at_epoch: hit.created_at_epoch,
              semanticScore: hit.similarity,
              fts5Rank: null,
              source: 'vector'
            });
          }

          logger.debug('SEARCH', `Vector search: ${vectorResults.length} results`);
        }
      } catch (error) {
        logger.warn('SEARCH', 'Vector search failed, using only keyword', {}, error as Error);
      }
    }

    // Keyword search FTS5 with rank (always active)
    try {
      const { searchObservationsFTSWithRank } = await import('../sqlite/Search.js');
      const keywordResults = searchObservationsFTSWithRank(db, query, {
        project: options.project,
        limit: limit * 2
      });

      for (const obs of keywordResults) {
        const id = String(obs.id);
        const existing = rawItems.get(id);

        if (existing) {
          // Present in both sources: add FTS5 rank
          existing.fts5Rank = obs.fts5_rank;
          existing.source = 'vector'; // Keep vector as primary source
        } else {
          rawItems.set(id, {
            id,
            title: obs.title,
            content: obs.text || obs.narrative || '',
            type: obs.type,
            project: obs.project,
            created_at: obs.created_at,
            created_at_epoch: obs.created_at_epoch,
            semanticScore: 0,
            fts5Rank: obs.fts5_rank,
            source: 'keyword'
          });
        }
      }

      logger.debug('SEARCH', `Keyword search: ${keywordResults.length} results`);
    } catch (error) {
      logger.error('SEARCH', 'Keyword search failed', {}, error as Error);
    }

    // No results
    if (rawItems.size === 0) return [];

    // Normalize FTS5 ranks
    const allFTS5Ranks = Array.from(rawItems.values())
      .filter(item => item.fts5Rank !== null)
      .map(item => item.fts5Rank as number);

    // Compute composite score for each item
    const scored: SearchResult[] = [];

    for (const item of rawItems.values()) {
      const signals = {
        semantic: item.semanticScore,
        fts5: item.fts5Rank !== null ? normalizeFTS5Rank(item.fts5Rank, allFTS5Ranks) : 0,
        recency: recencyScore(item.created_at_epoch),
        projectMatch: targetProject ? projectMatchScore(item.project, targetProject) : 0
      };

      const score = computeCompositeScore(signals, weights);

      // Boost for items present in both sources
      const isHybrid = item.semanticScore > 0 && item.fts5Rank !== null;
      const hybridBoost = isHybrid ? 1.15 : 1.0;
      // Boost for knowledge types (constraint, decision, heuristic, rejected)
      const finalScore = Math.min(1, score * hybridBoost * knowledgeTypeBoost(item.type));

      scored.push({
        id: item.id,
        title: item.title,
        content: item.content,
        type: item.type,
        project: item.project,
        created_at: item.created_at,
        created_at_epoch: item.created_at_epoch,
        score: finalScore,
        source: isHybrid ? 'hybrid' : item.source,
        signals
      });
    }

    // Sort by score descending and limit
    scored.sort((a, b) => b.score - a.score);
    const finalResults = scored.slice(0, limit);

    // Access tracking: update last_accessed_epoch for found results (fire-and-forget)
    if (finalResults.length > 0) {
      try {
        const { updateLastAccessed } = await import('../sqlite/Observations.js');
        const ids = finalResults.map(r => parseInt(r.id, 10)).filter(id => id > 0);
        if (ids.length > 0) {
          updateLastAccessed(db, ids);
        }
      } catch {
        // Don't propagate errors — access tracking is optional
      }
    }

    return finalResults;
  }
}

// Singleton
let hybridSearch: HybridSearch | null = null;

export function getHybridSearch(): HybridSearch {
  if (!hybridSearch) {
    hybridSearch = new HybridSearch();
  }
  return hybridSearch;
}
