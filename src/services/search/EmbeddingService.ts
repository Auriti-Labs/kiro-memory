/**
 * Local embedding service for Kiro Memory
 *
 * Provider: fastembed (primary, only for compatible models) → @huggingface/transformers (fallback) → null (FTS5 only)
 * Generates vector embeddings for semantic search.
 * Lazy loading: the model is loaded only on first use.
 *
 * Configurable via environment variables:
 *   KIRO_MEMORY_EMBEDDING_MODEL       — model name or full HuggingFace ID (default: 'all-MiniLM-L6-v2')
 *   KIRO_MEMORY_EMBEDDING_DIMENSIONS  — fallback dimensions for unknown custom models (default: 384)
 */

import { logger } from '../../utils/logger.js';

type EmbeddingProvider = 'fastembed' | 'transformers' | null;

/** Configuration for an embedding model. */
export interface EmbeddingConfig {
  /** Model ID for @huggingface/transformers (e.g., 'Xenova/all-MiniLM-L6-v2', 'jinaai/jina-embeddings-v2-base-code') */
  modelId: string;
  /** Expected dimensions of the embedding vector */
  dimensions: number;
}

/** Built-in model configurations keyed by short name. */
const MODEL_CONFIGS: Record<string, EmbeddingConfig> = {
  'all-MiniLM-L6-v2': {
    modelId: 'Xenova/all-MiniLM-L6-v2',
    dimensions: 384,
  },
  'jina-code-v2': {
    modelId: 'jinaai/jina-embeddings-v2-base-code',
    dimensions: 768,
  },
  'bge-small-en': {
    modelId: 'BAAI/bge-small-en-v1.5',
    dimensions: 384,
  },
};

/**
 * Models that fastembed supports natively.
 * fastembed only supports BGE-small and all-MiniLM internally; arbitrary HF models are not supported.
 */
const FASTEMBED_COMPATIBLE_MODELS = new Set(['all-MiniLM-L6-v2', 'bge-small-en']);

export class EmbeddingService {
  private provider: EmbeddingProvider = null;
  private model: any = null;
  private initialized = false;
  private initializing: Promise<boolean> | null = null;
  private config: EmbeddingConfig;
  private configName: string;

  constructor() {
    const envModel = process.env.KIRO_MEMORY_EMBEDDING_MODEL || 'all-MiniLM-L6-v2';
    this.configName = envModel;

    if (MODEL_CONFIGS[envModel]) {
      // Known short name — use predefined config
      this.config = MODEL_CONFIGS[envModel];
    } else if (envModel.includes('/')) {
      // Full HuggingFace model ID (e.g., 'custom/my-model') — use directly
      const dimensions = parseInt(process.env.KIRO_MEMORY_EMBEDDING_DIMENSIONS || '384', 10);
      this.config = {
        modelId: envModel,
        dimensions: isNaN(dimensions) ? 384 : dimensions,
      };
    } else {
      // Unknown short name — fall back to default
      logger.warn('EMBEDDING', `Unknown model name '${envModel}', falling back to 'all-MiniLM-L6-v2'`);
      this.configName = 'all-MiniLM-L6-v2';
      this.config = MODEL_CONFIGS['all-MiniLM-L6-v2'];
    }
  }

  /**
   * Initialize the embedding service.
   * Tries fastembed (when compatible), then @huggingface/transformers, then falls back to null.
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
    // Attempt 1: fastembed — only for compatible models (fastembed does not support arbitrary HF models)
    const fastembedCompatible = FASTEMBED_COMPATIBLE_MODELS.has(this.configName);
    if (fastembedCompatible) {
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
          logger.info('EMBEDDING', `Initialized with fastembed (BGE-small-en-v1.5) for model '${this.configName}'`);
          return true;
        }
      } catch (error) {
        logger.debug('EMBEDDING', `fastembed not available: ${error}`);
      }
    }

    // Attempt 2: @huggingface/transformers with the configured model ID
    try {
      const transformers = await import('@huggingface/transformers');
      const pipeline = (transformers as any).pipeline || (transformers as any).default?.pipeline;

      if (pipeline) {
        this.model = await pipeline('feature-extraction', this.config.modelId, {
          quantized: true
        } as any);
        this.provider = 'transformers';
        this.initialized = true;
        logger.info('EMBEDDING', `Initialized with @huggingface/transformers (${this.config.modelId})`);
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
   * Returns Float32Array with configured dimensions, or null if not available.
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
   * Uses native batch support when available (fastembed, transformers),
   * falls back to serial processing on batch failure.
   */
  async embedBatch(texts: string[]): Promise<(Float32Array | null)[]> {
    if (!this.initialized) await this.initialize();
    if (!this.provider || !this.model) return texts.map(() => null);
    if (texts.length === 0) return [];

    // Truncate all texts upfront (max ~512 tokens ≈ 2000 chars)
    const truncated = texts.map(t => t.substring(0, 2000));

    // Try native batch embedding first
    try {
      if (this.provider === 'fastembed') {
        return await this._embedBatchFastembed(truncated);
      } else if (this.provider === 'transformers') {
        return await this._embedBatchTransformers(truncated);
      }
    } catch (error) {
      logger.warn('EMBEDDING', `Batch embedding failed, falling back to serial: ${error}`);
    }

    // Serial fallback: process one at a time
    return this._embedBatchSerial(truncated);
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
   * Embedding vector dimensions for the active model configuration.
   */
  getDimensions(): number {
    return this.config.dimensions;
  }

  /**
   * Human-readable model name used as identifier in the observation_embeddings table.
   * Returns the short name (e.g., 'all-MiniLM-L6-v2') or the full HF model ID for custom models.
   */
  getModelName(): string {
    return this.configName;
  }

  // --- Batch implementations ---

  /**
   * Native batch embedding with fastembed.
   * FlagEmbedding.embed() accepts string[] and returns an async iterable of batches.
   */
  private async _embedBatchFastembed(texts: string[]): Promise<(Float32Array | null)[]> {
    const results: (Float32Array | null)[] = [];
    // Pass entire array at once; second param is internal batch size for chunking
    const embeddings = this.model.embed(texts, texts.length);
    for await (const batch of embeddings) {
      if (batch) {
        for (const vec of batch) {
          results.push(vec instanceof Float32Array ? vec : new Float32Array(vec));
        }
      }
    }
    // Pad with nulls if fastembed returned fewer results than expected
    while (results.length < texts.length) {
      results.push(null);
    }
    return results;
  }

  /**
   * Batch embedding with @huggingface/transformers pipeline.
   * The pipeline accepts string[] and returns a Tensor with shape [N, dims].
   */
  private async _embedBatchTransformers(texts: string[]): Promise<(Float32Array | null)[]> {
    const output = await this.model(texts, {
      pooling: 'mean',
      normalize: true
    });

    if (!output?.data) {
      return texts.map(() => null);
    }

    const dims = this.getDimensions();
    const data = output.data instanceof Float32Array
      ? output.data
      : new Float32Array(output.data);

    // The output tensor is flattened [N * dims], slice into individual vectors
    const results: (Float32Array | null)[] = [];
    for (let i = 0; i < texts.length; i++) {
      const offset = i * dims;
      if (offset + dims <= data.length) {
        results.push(data.slice(offset, offset + dims));
      } else {
        results.push(null);
      }
    }
    return results;
  }

  /**
   * Serial fallback: embed texts one at a time.
   * Used when native batch fails.
   */
  private async _embedBatchSerial(texts: string[]): Promise<(Float32Array | null)[]> {
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

  // --- Single-text provider implementations ---

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
