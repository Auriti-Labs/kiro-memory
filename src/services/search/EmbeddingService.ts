/**
 * Servizio di embedding locale per Kiro Memory
 *
 * Provider: fastembed (primario) → @huggingface/transformers (fallback) → null (FTS5 only)
 * Genera embedding vettoriali 384-dim per ricerca semantica.
 * Lazy loading: il modello viene caricato solo al primo utilizzo.
 */

import { logger } from '../../utils/logger.js';

type EmbeddingProvider = 'fastembed' | 'transformers' | null;

export class EmbeddingService {
  private provider: EmbeddingProvider = null;
  private model: any = null;
  private initialized = false;
  private initializing: Promise<boolean> | null = null;

  /**
   * Inizializza il servizio di embedding.
   * Tenta fastembed, poi @huggingface/transformers, poi fallback a null.
   */
  async initialize(): Promise<boolean> {
    if (this.initialized) return this.provider !== null;

    // Evita inizializzazioni concorrenti
    if (this.initializing) return this.initializing;

    this.initializing = this._doInitialize();
    const result = await this.initializing;
    this.initializing = null;
    return result;
  }

  private async _doInitialize(): Promise<boolean> {
    // Tentativo 1: fastembed
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
        logger.info('EMBEDDING', 'Inizializzato con fastembed (BGE-small-en-v1.5)');
        return true;
      }
    } catch (error) {
      logger.debug('EMBEDDING', `fastembed non disponibile: ${error}`);
    }

    // Tentativo 2: @huggingface/transformers
    try {
      const transformers = await import('@huggingface/transformers');
      const pipeline = (transformers as any).pipeline || (transformers as any).default?.pipeline;

      if (pipeline) {
        this.model = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', {
          quantized: true
        } as any);
        this.provider = 'transformers';
        this.initialized = true;
        logger.info('EMBEDDING', 'Inizializzato con @huggingface/transformers (all-MiniLM-L6-v2)');
        return true;
      }
    } catch (error) {
      logger.debug('EMBEDDING', `@huggingface/transformers non disponibile: ${error}`);
    }

    // Nessun provider disponibile
    this.provider = null;
    this.initialized = true;
    logger.warn('EMBEDDING', 'Nessun provider embedding disponibile, ricerca semantica disabilitata');
    return false;
  }

  /**
   * Genera embedding per un singolo testo.
   * Ritorna Float32Array con 384 dimensioni, o null se non disponibile.
   */
  async embed(text: string): Promise<Float32Array | null> {
    if (!this.initialized) await this.initialize();
    if (!this.provider || !this.model) return null;

    try {
      // Tronca testo troppo lungo (max ~512 token ≈ 2000 char)
      const truncated = text.substring(0, 2000);

      if (this.provider === 'fastembed') {
        return await this._embedFastembed(truncated);
      } else if (this.provider === 'transformers') {
        return await this._embedTransformers(truncated);
      }
    } catch (error) {
      logger.error('EMBEDDING', `Errore generazione embedding: ${error}`);
    }

    return null;
  }

  /**
   * Genera embeddings in batch.
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
   * Verifica se il servizio è disponibile.
   */
  isAvailable(): boolean {
    return this.initialized && this.provider !== null;
  }

  /**
   * Nome del provider attivo.
   */
  getProvider(): string | null {
    return this.provider;
  }

  /**
   * Dimensioni del vettore embedding.
   */
  getDimensions(): number {
    return 384;
  }

  // --- Provider specifici ---

  private async _embedFastembed(text: string): Promise<Float32Array | null> {
    const embeddings = this.model.embed([text], 1);
    for await (const batch of embeddings) {
      if (batch && batch.length > 0) {
        // fastembed ritorna array di array
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

    // transformers.js ritorna un Tensor, estraiamo i dati
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
