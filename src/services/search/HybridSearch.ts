/**
 * Ricerca ibrida: combina vector search locale (SQLite BLOB) con keyword search (FTS5)
 *
 * Scoring a 4 segnali:
 * - semantic: cosine similarity dall'embedding
 * - fts5: rank FTS5 normalizzato
 * - recency: decadimento esponenziale
 * - projectMatch: corrispondenza progetto
 *
 * Se il servizio di embedding non e disponibile, fallback a solo FTS5.
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
   * Inizializza il servizio di embedding (lazy, non bloccante)
   */
  async initialize(): Promise<void> {
    try {
      const embeddingService = getEmbeddingService();
      await embeddingService.initialize();
      this.embeddingInitialized = embeddingService.isAvailable();
      logger.info('SEARCH', `HybridSearch inizializzato (embedding: ${this.embeddingInitialized ? 'attivo' : 'disattivato'})`);
    } catch (error) {
      logger.warn('SEARCH', 'Inizializzazione embedding fallita, uso solo FTS5', {}, error as Error);
      this.embeddingInitialized = false;
    }
  }

  /**
   * Ricerca ibrida con scoring a 4 segnali
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

    // Raccogliamo risultati grezzi da entrambe le sorgenti
    const rawItems = new Map<string, {
      id: string;
      title: string;
      content: string;
      type: string;
      project: string;
      created_at: string;
      created_at_epoch: number;
      semanticScore: number;
      fts5Rank: number | null; // rank grezzo, da normalizzare dopo
      source: 'vector' | 'keyword';
    }>();

    // Ricerca vettoriale (se embedding disponibile)
    if (this.embeddingInitialized) {
      try {
        const embeddingService = getEmbeddingService();
        const queryEmbedding = await embeddingService.embed(query);

        if (queryEmbedding) {
          const vectorSearch = getVectorSearch();
          const vectorResults = await vectorSearch.search(db, queryEmbedding, {
            project: options.project,
            limit: limit * 2, // Prendiamo piu risultati per il ranking
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

          logger.debug('SEARCH', `Vector search: ${vectorResults.length} risultati`);
        }
      } catch (error) {
        logger.warn('SEARCH', 'Ricerca vettoriale fallita, uso solo keyword', {}, error as Error);
      }
    }

    // Ricerca keyword FTS5 con rank (sempre attiva)
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
          // Presente in entrambe le sorgenti: aggiungi rank FTS5
          existing.fts5Rank = obs.fts5_rank;
          existing.source = 'vector'; // Manteniamo vector come sorgente primaria
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

      logger.debug('SEARCH', `Keyword search: ${keywordResults.length} risultati`);
    } catch (error) {
      logger.error('SEARCH', 'Ricerca keyword fallita', {}, error as Error);
    }

    // Nessun risultato
    if (rawItems.size === 0) return [];

    // Normalizza i rank FTS5
    const allFTS5Ranks = Array.from(rawItems.values())
      .filter(item => item.fts5Rank !== null)
      .map(item => item.fts5Rank as number);

    // Calcola score composito per ogni item
    const scored: SearchResult[] = [];

    for (const item of rawItems.values()) {
      const signals = {
        semantic: item.semanticScore,
        fts5: item.fts5Rank !== null ? normalizeFTS5Rank(item.fts5Rank, allFTS5Ranks) : 0,
        recency: recencyScore(item.created_at_epoch),
        projectMatch: targetProject ? projectMatchScore(item.project, targetProject) : 0
      };

      const score = computeCompositeScore(signals, weights);

      // Boost per item presenti in entrambe le sorgenti
      const isHybrid = item.semanticScore > 0 && item.fts5Rank !== null;
      const hybridBoost = isHybrid ? 1.15 : 1.0;
      // Boost per tipi knowledge (constraint, decision, heuristic, rejected)
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

    // Ordina per score decrescente e limita
    scored.sort((a, b) => b.score - a.score);
    const finalResults = scored.slice(0, limit);

    // Access tracking: aggiorna last_accessed_epoch per i risultati trovati (fire-and-forget)
    if (finalResults.length > 0) {
      try {
        const { updateLastAccessed } = await import('../sqlite/Observations.js');
        const ids = finalResults.map(r => parseInt(r.id, 10)).filter(id => id > 0);
        if (ids.length > 0) {
          updateLastAccessed(db, ids);
        }
      } catch {
        // Non propagare errori — access tracking e opzionale
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
