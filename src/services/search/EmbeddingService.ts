/**
 * Local embedding service for Kiro Memory
 *
 * Provider: fastembed (primary) → @huggingface/transformers (fallback) → null (FTS5 only)
 * Generates 384-dim vector embeddings for semantic search.
 * Lazy loading: the model is loaded only on first use.
 */

import { logger } from '../../utils/logger.js';

type EmbeddingProvider = 'fastembed' | 'transformers' | null;

export class EmbeddingService {
  private provider: EmbeddingProvider = null;
  private model: any = null;
  private initialized = false;
  private initializing: Promise<boolean> | null = null;

  /**
   * Initialize the embedding service.
   * Tries fastembed, then @huggingface/transformers, then fallback to null.
   */
  async initialize(): Promise<boolean> {
    if (this.initialized) return this.provider !== null;

    // Avoid concurrent initializations
    if (this.initializing) return this.initializing;

    this.initializing = this._doInitialize();
    const result = await this.initializing;
    this.initializing = null;
    return result;
  }

  private async _doInitialize(): Promise<boolean> {
    // Attempt 1: fastembed
    try {
      const fastembed = await import('fastembed');
      const EmbeddingModel = fastembed.EmbeddingModel || fastembed.default?.EmbeddingModel;
      const FlagEmbedding = fastembed.FlagEmbedding || fastembed.default?.FlagEmbedding;

      if (FlagEmbedding && EmbeddingModel) {
        this.model = await FlagEmbedding.init({
          model: EmbeddingModel.BGESmallENV15
        });
        this.provider = 'fastembed';
        this.initialized = true;
        logger.info('EMBEDDING', 'Initialized with fastembed (BGE-small-en-v1.5)');
        return true;
      }
    } catch (error) {
      logger.debug('EMBEDDING', `fastembed not available: ${error}`);
    }

    // Attempt 2: @huggingface/transformers
    try {
      const transformers = await import('@huggingface/transformers');
      const pipeline = (transformers as any).pipeline || (transformers as any).default?.pipeline;

      if (pipeline) {
        this.model = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', {
          quantized: true
        } as any);
        this.provider = 'transformers';
        this.initialized = true;
        logger.info('EMBEDDING', 'Initialized with @huggingface/transformers (all-MiniLM-L6-v2)');
        return true;
      }
    } catch (error) {
      logger.debug('EMBEDDING', `@huggingface/transformers not available: ${error}`);
    }

    // No provider available
    this.provider = null;
    this.initialized = true;
    logger.warn('EMBEDDING', 'No embedding provider available, semantic search disabled');
    return false;
  }

  /**
   * Generate embedding for a single text.
   * Returns Float32Array with 384 dimensions, or null if not available.
   */
  async embed(text: string): Promise<Float32Array | null> {
    if (!this.initialized) await this.initialize();
    if (!this.provider || !this.model) return null;

    try {
      // Truncate text that is too long (max ~512 tokens ≈ 2000 chars)
      const truncated = text.substring(0, 2000);

      if (this.provider === 'fastembed') {
        return await this._embedFastembed(truncated);
      } else if (this.provider === 'transformers') {
        return await this._embedTransformers(truncated);
      }
    } catch (error) {
      logger.error('EMBEDDING', `Error generating embedding: ${error}`);
    }

    return null;
  }

  /**
   * Generate embeddings in batch.
   */
  async embedBatch(texts: string[]): Promise<(Float32Array | null)[]> {
    if (!this.initialized) await this.initialize();
    if (!this.provider || !this.model) return texts.map(() => null);

    const results: (Float32Array | null)[] = [];

    for (const text of texts) {
      try {
        const embedding = await this.embed(text);
        results.push(embedding);
      } catch {
        results.push(null);
      }
    }

    return results;
  }

  /**
   * Check if the service is available.
   */
  isAvailable(): boolean {
    return this.initialized && this.provider !== null;
  }

  /**
   * Name of the active provider.
   */
  getProvider(): string | null {
    return this.provider;
  }

  /**
   * Embedding vector dimensions.
   */
  getDimensions(): number {
    return 384;
  }

  // --- Provider-specific implementations ---

  private async _embedFastembed(text: string): Promise<Float32Array | null> {
    const embeddings = this.model.embed([text], 1);
    for await (const batch of embeddings) {
      if (batch && batch.length > 0) {
        // fastembed returns array of arrays
        const vec = batch[0];
        return vec instanceof Float32Array ? vec : new Float32Array(vec);
      }
    }
    return null;
  }

  private async _embedTransformers(text: string): Promise<Float32Array | null> {
    const output = await this.model(text, {
      pooling: 'mean',
      normalize: true
    });

    // transformers.js returns a Tensor, extract the data
    if (output?.data) {
      return output.data instanceof Float32Array
        ? output.data
        : new Float32Array(output.data);
    }

    return null;
  }
}

// Singleton
let embeddingService: EmbeddingService | null = null;

export function getEmbeddingService(): EmbeddingService {
  if (!embeddingService) {
    embeddingService = new EmbeddingService();
  }
  return embeddingService;
}
