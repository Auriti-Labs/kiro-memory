/**
 * Shared context for all worker routers.
 * Centralizes database, SSE broadcast, cache, and validation helpers.
 */

import type { Response } from 'express';
import { KiroMemoryDatabase } from './sqlite/Database.js';
import { getEmbeddingService } from './search/EmbeddingService.js';
import { getVectorSearch } from './search/VectorSearch.js';
import { logger } from '../utils/logger.js';

// ── Shared context type ──

export interface WorkerContext {
  db: KiroMemoryDatabase;
  broadcast: (event: string, data: any) => void;
  invalidateProjectsCache: () => void;
  generateEmbeddingForObservation: (
    observationId: number,
    title: string,
    content: string | null,
    concepts?: string[]
  ) => Promise<void>;
}

// ── SSE Client Management ──

const MAX_SSE_CLIENTS = 50;
const clients: Response[] = [];

export function getClients(): Response[] {
  return clients;
}

export function getMaxSSEClients(): number {
  return MAX_SSE_CLIENTS;
}

export function addClient(res: Response): void {
  clients.push(res);
}

export function removeClient(res: Response): void {
  const index = clients.indexOf(res);
  if (index > -1) {
    clients.splice(index, 1);
  }
}

/** Broadcast SSE event to all connected clients */
export function broadcast(event: string, data: any): void {
  const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  clients.forEach(client => {
    try {
      client.write(message);
    } catch (err) {
      logger.warn('WORKER', 'Broadcast failed to client', {}, err as Error);
    }
  });
}

// ── Projects cache ──

export let projectsCache: { data: string[]; ts: number } = { data: [], ts: 0 };
export const PROJECTS_CACHE_TTL = 60_000;

export function invalidateProjectsCache(): void {
  projectsCache.ts = 0;
}

// ── Validation helpers (shared across all routers) ──

/** Parse an integer with safe range, returns default if invalid */
export function parseIntSafe(value: string | undefined, defaultVal: number, min: number, max: number): number {
  if (!value) return defaultVal;
  const parsed = parseInt(value, 10);
  if (isNaN(parsed) || parsed < min || parsed > max) return defaultVal;
  return parsed;
}

/** Validate that a project name contains only safe characters */
export function isValidProject(project: unknown): project is string {
  return typeof project === 'string'
    && project.length > 0
    && project.length <= 200
    && /^[\w\-\.\/@ ]+$/.test(project)
    && !project.includes('..');
}

/** Validate a non-empty string with maximum length */
export function isValidString(val: unknown, maxLen: number): val is string {
  return typeof val === 'string' && val.length > 0 && val.length <= maxLen;
}

// ── Embedding helper ──

/** Generate embedding for an observation (fire-and-forget) */
export async function generateEmbeddingForObservation(
  db: KiroMemoryDatabase,
  observationId: number,
  title: string,
  content: string | null,
  concepts?: string[]
): Promise<void> {
  try {
    const embeddingService = getEmbeddingService();
    if (!embeddingService.isAvailable()) return;

    const parts = [title];
    if (content) parts.push(content);
    if (concepts?.length) parts.push(concepts.join(', '));
    const fullText = parts.join(' ').substring(0, 2000);

    const embedding = await embeddingService.embed(fullText);
    if (embedding) {
      const vectorSearch = getVectorSearch();
      await vectorSearch.storeEmbedding(
        db.db,
        observationId,
        embedding,
        embeddingService.getProvider() || 'unknown'
      );
    }
  } catch (error) {
    logger.debug('WORKER', `Embedding generation failed for obs ${observationId}: ${error}`);
  }
}

// ── Context factory ──

export function createWorkerContext(db: KiroMemoryDatabase): WorkerContext {
  return {
    db,
    broadcast,
    invalidateProjectsCache,
    generateEmbeddingForObservation: (id, title, content, concepts) =>
      generateEmbeddingForObservation(db, id, title, content, concepts),
  };
}
