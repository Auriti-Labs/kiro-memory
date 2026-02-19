/**
 * ChromaDB integration for Kiro Memory
 *
 * Provides vector search capabilities for observations.
 */

import { ChromaClient, Collection } from 'chromadb';
import { join } from 'path';
import { homedir } from 'os';
import { existsSync, mkdirSync } from 'fs';
import { logger } from '../../utils/logger.js';

const VECTOR_DB_DIR = join(homedir(), '.contextkit', 'vector-db');

export class ChromaManager {
  private client: ChromaClient;
  private collection: Collection | null = null;
  private isAvailable: boolean = false;

  constructor() {
    // Ensure vector DB directory exists
    if (!existsSync(VECTOR_DB_DIR)) {
      mkdirSync(VECTOR_DB_DIR, { recursive: true });
    }

    this.client = new ChromaClient({
      path: process.env.CHROMADB_URL || 'http://localhost:8000'
    });
  }

  /**
   * Initialize ChromaDB connection and collection
   */
  async initialize(): Promise<boolean> {
    try {
      // Check if ChromaDB is available
      await this.client.heartbeat();
      
      // Get or create collection
      this.collection = await this.client.getOrCreateCollection({
        name: 'kiro-memory-observations',
        metadata: { description: 'Kiro Memory observation embeddings' }
      });
      
      this.isAvailable = true;
      logger.info('CHROMA', 'ChromaDB initialized successfully');
      return true;
    } catch (error) {
      logger.warn('CHROMA', 'ChromaDB not available, falling back to SQLite search', {}, error as Error);
      this.isAvailable = false;
      return false;
    }
  }

  /**
   * Add observation embedding to ChromaDB
   */
  async addObservation(
    id: string,
    content: string,
    metadata: {
      project: string;
      type: string;
      title: string;
      created_at: string;
    }
  ): Promise<void> {
    if (!this.isAvailable || !this.collection) {
      logger.debug('CHROMA', 'ChromaDB not available, skipping embedding');
      return;
    }

    try {
      await this.collection.add({
        ids: [id],
        documents: [content],
        metadatas: [metadata]
      });
      
      logger.debug('CHROMA', `Added observation ${id} to vector DB`);
    } catch (error) {
      logger.error('CHROMA', `Failed to add observation ${id}`, {}, error as Error);
    }
  }

  /**
   * Search observations by semantic similarity
   */
  async search(
    query: string,
    options: {
      project?: string;
      limit?: number;
    } = {}
  ): Promise<Array<{
    id: string;
    content: string;
    metadata: any;
    distance: number;
  }>> {
    if (!this.isAvailable || !this.collection) {
      logger.debug('CHROMA', 'ChromaDB not available, returning empty results');
      return [];
    }

    try {
      const where = options.project ? { project: options.project } : undefined;
      
      const results = await this.collection.query({
        queryTexts: [query],
        nResults: options.limit || 10,
        where
      });

      const hits: Array<{ id: string; content: string; metadata: any; distance: number }> = [];
      
      if (results.ids && results.ids[0]) {
        for (let i = 0; i < results.ids[0].length; i++) {
          hits.push({
            id: results.ids[0][i],
            content: results.documents?.[0]?.[i] || '',
            metadata: results.metadatas?.[0]?.[i] || {},
            distance: results.distances?.[0]?.[i] || 0
          });
        }
      }

      logger.debug('CHROMA', `Search returned ${hits.length} results`);
      return hits;
    } catch (error) {
      logger.error('CHROMA', 'Search failed', {}, error as Error);
      return [];
    }
  }

  /**
   * Delete observation from ChromaDB
   */
  async deleteObservation(id: string): Promise<void> {
    if (!this.isAvailable || !this.collection) {
      return;
    }

    try {
      await this.collection.delete({ ids: [id] });
      logger.debug('CHROMA', `Deleted observation ${id}`);
    } catch (error) {
      logger.error('CHROMA', `Failed to delete observation ${id}`, {}, error as Error);
    }
  }

  /**
   * Check if ChromaDB is available
   */
  isChromaAvailable(): boolean {
    return this.isAvailable;
  }

  /**
   * Get collection stats
   */
  async getStats(): Promise<{ count: number }> {
    if (!this.isAvailable || !this.collection) {
      return { count: 0 };
    }

    try {
      const count = await this.collection.count();
      return { count };
    } catch (error) {
      logger.error('CHROMA', 'Failed to get stats', {}, error as Error);
      return { count: 0 };
    }
  }
}

// Singleton instance
let chromaManager: ChromaManager | null = null;

export function getChromaManager(): ChromaManager {
  if (!chromaManager) {
    chromaManager = new ChromaManager();
  }
  return chromaManager;
}
