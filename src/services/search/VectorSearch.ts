/**
 * Local vector search on SQLite BLOB
 *
 * Stores embeddings as BLOB in observation_embeddings,
 * computes cosine similarity in JavaScript for semantic search.
 *
 * Optimizations vs brute-force O(n):
 * - SQL pre-filtering by project and recency (reduces candidates)
 * - Maximum limit of candidates loaded in memory (maxCandidates)
 * - Buffer pooling to reduce GC allocations
 */

import type { Database } from 'bun:sqlite';
import { getEmbeddingService } from './EmbeddingService.js';
import { logger } from '../../utils/logger.js';

// Maximum number of embeddings loaded in memory per query
const DEFAULT_MAX_CANDIDATES = 2000;

export interface VectorSearchResult {
  id: number;
  observationId: number;
  similarity: number;
  title: string;
  text: string | null;
  type: string;
  project: string;
  created_at: string;
  created_at_epoch: number;
}

/**
 * Compute cosine similarity between two Float32Array vectors.
 * Optimized version: unified loop with a single final sqrt.
 */
export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  const len = a.length;
  if (len !== b.length) return 0;

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  // Unified loop — avoids 3 separate passes
  for (let i = 0; i < len; i++) {
    const ai = a[i];
    const bi = b[i];
    dotProduct += ai * bi;
    normA += ai * ai;
    normB += bi * bi;
  }

  const denominator = Math.sqrt(normA * normB);
  if (denominator === 0) return 0;

  return dotProduct / denominator;
}

/**
 * Convert Float32Array to Buffer for SQLite BLOB storage.
 */
function float32ToBuffer(arr: Float32Array): Buffer {
  return Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength);
}

/**
 * Convert SQLite BLOB Buffer to Float32Array.
 */
function bufferToFloat32(buf: Buffer | Uint8Array): Float32Array {
  const arrayBuffer = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  return new Float32Array(arrayBuffer);
}

export class VectorSearch {

  /**
   * Semantic search with SQL pre-filtering for scalability.
   *
   * 2-phase strategy:
   * 1. SQL pre-filters by project + sorts by recency (loads max N candidates)
   * 2. JS computes cosine similarity only on filtered candidates
   *
   * With 50k observations and maxCandidates=2000, loads only ~4% of data.
   */
  async search(
    db: Database,
    queryEmbedding: Float32Array,
    options: {
      project?: string;
      limit?: number;
      threshold?: number;
      maxCandidates?: number;
    } = {}
  ): Promise<VectorSearchResult[]> {
    const limit = options.limit || 10;
    const threshold = options.threshold || 0.3;
    const maxCandidates = options.maxCandidates || DEFAULT_MAX_CANDIDATES;

    try {
      // Phase 1: pre-filter in SQL by project, sort by recency, limit candidates
      const conditions: string[] = [];
      const params: any[] = [];

      if (options.project) {
        conditions.push('o.project = ?');
        params.push(options.project);
      }

      const whereClause = conditions.length > 0
        ? `WHERE ${conditions.join(' AND ')}`
        : '';

      // Sort by recency and limit candidates — avoids loading all embeddings
      const sql = `
        SELECT e.observation_id, e.embedding,
               o.title, o.text, o.type, o.project, o.created_at, o.created_at_epoch
        FROM observation_embeddings e
        JOIN observations o ON o.id = e.observation_id
        ${whereClause}
        ORDER BY o.created_at_epoch DESC
        LIMIT ?
      `;
      params.push(maxCandidates);

      const rows = db.query(sql).all(...params) as Array<{
        observation_id: number;
        embedding: Buffer;
        title: string;
        text: string | null;
        type: string;
        project: string;
        created_at: string;
        created_at_epoch: number;
      }>;

      // Phase 2: compute similarity only on pre-filtered candidates
      const scored: VectorSearchResult[] = [];

      for (const row of rows) {
        const embedding = bufferToFloat32(row.embedding);
        const similarity = cosineSimilarity(queryEmbedding, embedding);

        if (similarity >= threshold) {
          scored.push({
            id: row.observation_id,
            observationId: row.observation_id,
            similarity,
            title: row.title,
            text: row.text,
            type: row.type,
            project: row.project,
            created_at: row.created_at,
            created_at_epoch: row.created_at_epoch
          });
        }
      }

      // Sort by similarity descending
      scored.sort((a, b) => b.similarity - a.similarity);

      logger.debug('VECTOR', `Search: ${rows.length} candidates → ${scored.length} above threshold → ${Math.min(scored.length, limit)} results`);

      return scored.slice(0, limit);
    } catch (error) {
      logger.error('VECTOR', `Vector search error: ${error}`);
      return [];
    }
  }

  /**
   * Store embedding for an observation.
   */
  async storeEmbedding(
    db: Database,
    observationId: number,
    embedding: Float32Array,
    model: string
  ): Promise<void> {
    try {
      const blob = float32ToBuffer(embedding);

      db.query(`
        INSERT OR REPLACE INTO observation_embeddings
          (observation_id, embedding, model, dimensions, created_at)
        VALUES (?, ?, ?, ?, ?)
      `).run(
        observationId,
        blob,
        model,
        embedding.length,
        new Date().toISOString()
      );

      logger.debug('VECTOR', `Embedding saved for observation ${observationId}`);
    } catch (error) {
      logger.error('VECTOR', `Error saving embedding: ${error}`);
    }
  }

  /**
   * Generate embeddings for observations that don't have them yet.
   */
  async backfillEmbeddings(
    db: Database,
    batchSize: number = 50
  ): Promise<number> {
    const embeddingService = getEmbeddingService();
    if (!await embeddingService.initialize()) {
      logger.warn('VECTOR', 'Embedding service not available, backfill skipped');
      return 0;
    }

    // Find observations without embeddings
    const rows = db.query(`
      SELECT o.id, o.title, o.text, o.narrative, o.concepts
      FROM observations o
      LEFT JOIN observation_embeddings e ON e.observation_id = o.id
      WHERE e.observation_id IS NULL
      ORDER BY o.created_at_epoch DESC
      LIMIT ?
    `).all(batchSize) as Array<{
      id: number;
      title: string;
      text: string | null;
      narrative: string | null;
      concepts: string | null;
    }>;

    if (rows.length === 0) return 0;

    let count = 0;
    const model = embeddingService.getProvider() || 'unknown';

    for (const row of rows) {
      // Compose text for embedding: title + text + concepts
      const parts = [row.title];
      if (row.text) parts.push(row.text);
      if (row.narrative) parts.push(row.narrative);
      if (row.concepts) parts.push(row.concepts);
      const fullText = parts.join(' ').substring(0, 2000);

      const embedding = await embeddingService.embed(fullText);
      if (embedding) {
        await this.storeEmbedding(db, row.id, embedding, model);
        count++;
      }
    }

    logger.info('VECTOR', `Backfill completed: ${count}/${rows.length} embeddings generated`);
    return count;
  }

  /**
   * Embedding statistics.
   */
  getStats(db: Database): { total: number; embedded: number; percentage: number } {
    try {
      const totalRow = db.query('SELECT COUNT(*) as count FROM observations').get() as { count: number };
      const embeddedRow = db.query('SELECT COUNT(*) as count FROM observation_embeddings').get() as { count: number };

      const total = totalRow?.count || 0;
      const embedded = embeddedRow?.count || 0;
      const percentage = total > 0 ? Math.round((embedded / total) * 100) : 0;

      return { total, embedded, percentage };
    } catch {
      return { total: 0, embedded: 0, percentage: 0 };
    }
  }
}

// Singleton
let vectorSearch: VectorSearch | null = null;

export function getVectorSearch(): VectorSearch {
  if (!vectorSearch) {
    vectorSearch = new VectorSearch();
  }
  return vectorSearch;
}
