/**
 * Contesto condiviso tra tutti i router del worker.
 * Centralizza database, SSE broadcast, cache e helper di validazione.
 */

import type { Response } from 'express';
import { KiroMemoryDatabase } from './sqlite/Database.js';
import { getEmbeddingService } from './search/EmbeddingService.js';
import { getVectorSearch } from './search/VectorSearch.js';
import { logger } from '../utils/logger.js';

// ── Tipo contesto condiviso ──

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

/** Broadcast evento SSE a tutti i client connessi */
export function broadcast(event: string, data: any): void {
  const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  clients.forEach(client => {
    try {
      client.write(message);
    } catch (err) {
      logger.warn('WORKER', 'Broadcast fallito verso client', {}, err as Error);
    }
  });
}

// ── Cache progetti ──

export let projectsCache: { data: string[]; ts: number } = { data: [], ts: 0 };
export const PROJECTS_CACHE_TTL = 60_000;

export function invalidateProjectsCache(): void {
  projectsCache.ts = 0;
}

// ── Helper di validazione (condivisi tra tutti i router) ──

/** Parsa un intero con range sicuro, ritorna default se invalido */
export function parseIntSafe(value: string | undefined, defaultVal: number, min: number, max: number): number {
  if (!value) return defaultVal;
  const parsed = parseInt(value, 10);
  if (isNaN(parsed) || parsed < min || parsed > max) return defaultVal;
  return parsed;
}

/** Valida che un nome progetto contenga solo caratteri sicuri */
export function isValidProject(project: unknown): project is string {
  return typeof project === 'string'
    && project.length > 0
    && project.length <= 200
    && /^[\w\-\.\/@ ]+$/.test(project)
    && !project.includes('..');
}

/** Valida una stringa non vuota con lunghezza massima */
export function isValidString(val: unknown, maxLen: number): val is string {
  return typeof val === 'string' && val.length > 0 && val.length <= maxLen;
}

// ── Embedding helper ──

/** Genera embedding per un'osservazione (fire-and-forget) */
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
    logger.debug('WORKER', `Embedding generation fallita per obs ${observationId}: ${error}`);
  }
}

// ── Factory per creare il contesto ──

export function createWorkerContext(db: KiroMemoryDatabase): WorkerContext {
  return {
    db,
    broadcast,
    invalidateProjectsCache,
    generateEmbeddingForObservation: (id, title, content, concepts) =>
      generateEmbeddingForObservation(db, id, title, content, concepts),
  };
}
