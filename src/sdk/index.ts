/**
 * Kiro Memory SDK for Kiro CLI Integration
 *
 * Provides programmatic access to Kiro Memory system
 */

import { KiroMemoryDatabase } from '../services/sqlite/index.js';
import { getObservationsByProject, createObservation, searchObservations, updateLastAccessed, consolidateObservations as dbConsolidateObservations, isDuplicateObservation } from '../services/sqlite/Observations.js';
import { createHash } from 'crypto';
import { getSummariesByProject, createSummary, searchSummaries } from '../services/sqlite/Summaries.js';
import { getPromptsByProject, createPrompt } from '../services/sqlite/Prompts.js';
import { getSessionByContentId, createSession, completeSession as dbCompleteSession } from '../services/sqlite/Sessions.js';
import { searchObservationsFTS, searchSummariesFiltered, getObservationsByIds as dbGetObservationsByIds, getTimeline as dbGetTimeline, getStaleObservations as dbGetStaleObservations, markObservationsStale as dbMarkObservationsStale } from '../services/sqlite/Search.js';
import { createCheckpoint as dbCreateCheckpoint, getLatestCheckpoint as dbGetLatestCheckpoint, getLatestCheckpointByProject as dbGetLatestCheckpointByProject } from '../services/sqlite/Checkpoints.js';
import { getReportData as dbGetReportData } from '../services/sqlite/Reports.js';
import { getHybridSearch, type SearchResult } from '../services/search/HybridSearch.js';
import { getEmbeddingService } from '../services/search/EmbeddingService.js';
import { getVectorSearch } from '../services/search/VectorSearch.js';
import { logger } from '../utils/logger.js';
import {
  recencyScore,
  projectMatchScore,
  computeCompositeScore,
  knowledgeTypeBoost,
  CONTEXT_WEIGHTS
} from '../services/search/ScoringEngine.js';
import type {
  Observation,
  Summary,
  UserPrompt,
  DBSession,
  DBCheckpoint,
  ContextContext,
  SearchFilters,
  TimelineEntry,
  ScoredItem,
  SmartContext,
  StoreKnowledgeInput,
  KnowledgeType,
  KnowledgeMetadata,
  ReportData
} from '../types/worker-types.js';
import { KNOWLEDGE_TYPES } from '../types/worker-types.js';

export interface KiroMemoryConfig {
  dataDir?: string;
  project?: string;
  /** Salta il migration check per performance (usare nei hook ad alta frequenza) */
  skipMigrations?: boolean;
}

export class KiroMemorySDK {
  private db: KiroMemoryDatabase;
  private project: string;

  constructor(config: KiroMemoryConfig = {}) {
    this.db = new KiroMemoryDatabase(config.dataDir, config.skipMigrations || false);
    this.project = config.project || this.detectProject();
  }

  private detectProject(): string {
    try {
      const { execSync } = require('child_process');
      const gitRoot = execSync('git rev-parse --show-toplevel', {
        cwd: process.cwd(),
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'ignore']
      }).trim();
      return gitRoot.split('/').pop() || 'default';
    } catch {
      return 'default';
    }
  }

  /**
   * Get context for the current project
   */
  async getContext(): Promise<ContextContext> {
    return {
      project: this.project,
      relevantObservations: getObservationsByProject(this.db.db, this.project, 20),
      relevantSummaries: getSummariesByProject(this.db.db, this.project, 5),
      recentPrompts: getPromptsByProject(this.db.db, this.project, 10)
    };
  }

  /**
   * Valida input per storeObservation
   */
  private validateObservationInput(data: { type: string; title: string; content: string }): void {
    if (!data.type || typeof data.type !== 'string' || data.type.length > 100) {
      throw new Error('type è obbligatorio (stringa, max 100 caratteri)');
    }
    if (!data.title || typeof data.title !== 'string' || data.title.length > 500) {
      throw new Error('title è obbligatorio (stringa, max 500 caratteri)');
    }
    if (!data.content || typeof data.content !== 'string' || data.content.length > 100_000) {
      throw new Error('content è obbligatorio (stringa, max 100KB)');
    }
  }

  /**
   * Valida input per storeSummary
   */
  private validateSummaryInput(data: Record<string, unknown>): void {
    const MAX = 50_000;
    for (const [key, val] of Object.entries(data)) {
      if (val !== undefined && val !== null) {
        if (typeof val !== 'string') throw new Error(`${key} deve essere una stringa`);
        if (val.length > MAX) throw new Error(`${key} troppo grande (max 50KB)`);
      }
    }
  }

  /**
   * Genera e salva embedding per un'osservazione (fire-and-forget, non blocca)
   */
  private async generateEmbeddingAsync(observationId: number, title: string, content: string, concepts?: string[]): Promise<void> {
    try {
      const embeddingService = getEmbeddingService();
      if (!embeddingService.isAvailable()) return;

      // Componi testo per embedding: title + content + concepts
      const parts = [title, content];
      if (concepts?.length) parts.push(concepts.join(', '));
      const fullText = parts.join(' ').substring(0, 2000);

      const embedding = await embeddingService.embed(fullText);
      if (embedding) {
        const vectorSearch = getVectorSearch();
        await vectorSearch.storeEmbedding(
          this.db.db,
          observationId,
          embedding,
          embeddingService.getProvider() || 'unknown'
        );
      }
    } catch (error) {
      // Non propagare errori — embedding è opzionale
      logger.debug('SDK', `Embedding generation fallita per obs ${observationId}: ${error}`);
    }
  }

  /**
   * Genera content hash SHA256 per deduplicazione basata su contenuto.
   * Usa (project + type + title + narrative) come tupla di identità semantica.
   * NON include sessionId perché è unico ad ogni invocazione.
   */
  private generateContentHash(type: string, title: string, narrative?: string): string {
    const payload = `${this.project}|${type}|${title}|${narrative || ''}`;
    return createHash('sha256').update(payload).digest('hex');
  }

  /**
   * Finestre di deduplicazione per tipo (ms).
   * Tipi con molte ripetizioni hanno finestre più ampie.
   */
  private getDeduplicationWindow(type: string): number {
    switch (type) {
      case 'file-read':    return 60_000;  // 60s — letture frequenti sugli stessi file
      case 'file-write':   return 10_000;  // 10s — scritture rapide consecutive
      case 'command':      return 30_000;  // 30s — standard
      case 'research':     return 120_000; // 120s — web search e fetch ripetuti
      case 'delegation':   return 60_000;  // 60s — delegazioni rapide
      default:             return 30_000;  // 30s — default
    }
  }

  /**
   * Store a new observation
   */
  async storeObservation(data: {
    type: string;
    title: string;
    content: string;
    subtitle?: string;
    narrative?: string;
    facts?: string;
    concepts?: string[];
    /** @deprecated Usa filesRead/filesModified per separare i file */
    files?: string[];
    filesRead?: string[];
    filesModified?: string[];
  }): Promise<number> {
    this.validateObservationInput(data);

    const sessionId = 'sdk-' + Date.now();

    // Deduplicazione con content hash (finestra tipo-specifica)
    const contentHash = this.generateContentHash(data.type, data.title, data.narrative);
    const dedupWindow = this.getDeduplicationWindow(data.type);
    if (isDuplicateObservation(this.db.db, contentHash, dedupWindow)) {
      logger.debug('SDK', `Osservazione duplicata scartata (${data.type}, ${dedupWindow}ms): ${data.title}`);
      return -1;
    }

    // Separa filesRead e filesModified (retrocompatibile con files generico)
    const filesRead = data.filesRead || (data.type === 'file-read' ? data.files : undefined);
    const filesModified = data.filesModified || (data.type === 'file-write' ? data.files : undefined);

    // Token economics: stima costo discovery (content completo / 4 chars per token)
    const discoveryTokens = Math.ceil(data.content.length / 4);

    const observationId = createObservation(
      this.db.db,
      sessionId,
      this.project,
      data.type,
      data.title,
      data.subtitle || null,
      data.content,
      data.narrative || null,
      data.facts || null,
      data.concepts?.join(', ') || null,
      filesRead?.join(', ') || null,
      filesModified?.join(', ') || null,
      0,
      contentHash,
      discoveryTokens
    );

    // Genera embedding in background (fire-and-forget, non blocca)
    this.generateEmbeddingAsync(observationId, data.title, data.content, data.concepts)
      .catch(() => {}); // Ignora errori silenziosamente

    return observationId;
  }

  /**
   * Salva conoscenza strutturata (constraint, decision, heuristic, rejected).
   * Usa il campo `type` per il knowledgeType e `facts` per i metadati JSON.
   */
  async storeKnowledge(data: StoreKnowledgeInput): Promise<number> {
    // Valida knowledgeType contro enum
    if (!KNOWLEDGE_TYPES.includes(data.knowledgeType)) {
      throw new Error(`knowledgeType non valido: ${data.knowledgeType}. Valori ammessi: ${KNOWLEDGE_TYPES.join(', ')}`);
    }
    this.validateObservationInput({ type: data.knowledgeType, title: data.title, content: data.content });

    // Costruisci metadati JSON in base al tipo
    const metadata: KnowledgeMetadata = (() => {
      switch (data.knowledgeType) {
        case 'constraint':
          return {
            knowledgeType: 'constraint' as const,
            severity: data.metadata?.severity || 'soft',
            reason: data.metadata?.reason
          };
        case 'decision':
          return {
            knowledgeType: 'decision' as const,
            alternatives: data.metadata?.alternatives,
            reason: data.metadata?.reason
          };
        case 'heuristic':
          return {
            knowledgeType: 'heuristic' as const,
            context: data.metadata?.context,
            confidence: data.metadata?.confidence
          };
        case 'rejected':
          return {
            knowledgeType: 'rejected' as const,
            reason: data.metadata?.reason || '',
            alternatives: data.metadata?.alternatives
          };
      }
    })();

    const sessionId = 'sdk-' + Date.now();
    const contentHash = this.generateContentHash(data.type, data.title);
    if (isDuplicateObservation(this.db.db, contentHash)) {
      logger.debug('SDK', `Knowledge duplicata scartata: ${data.title}`);
      return -1;
    }

    const discoveryTokens = Math.ceil(data.content.length / 4);

    const observationId = createObservation(
      this.db.db,
      sessionId,
      data.project || this.project,
      data.knowledgeType,       // type = knowledgeType
      data.title,
      null,                     // subtitle
      data.content,
      null,                     // narrative
      JSON.stringify(metadata), // facts = metadati JSON
      data.concepts?.join(', ') || null,
      data.files?.join(', ') || null,
      null,                     // filesModified: knowledge non modifica file
      0,                        // prompt_number
      contentHash,
      discoveryTokens
    );

    // Genera embedding in background
    this.generateEmbeddingAsync(observationId, data.title, data.content, data.concepts)
      .catch(() => {});

    return observationId;
  }

  /**
   * Store a session summary
   */
  async storeSummary(data: {
    request?: string;
    investigated?: string;
    learned?: string;
    completed?: string;
    nextSteps?: string;
    notes?: string;
  }): Promise<number> {
    this.validateSummaryInput(data);
    return createSummary(
      this.db.db,
      'sdk-' + Date.now(),
      this.project,
      data.request || null,
      data.investigated || null,
      data.learned || null,
      data.completed || null,
      data.nextSteps || null,
      data.notes || null
    );
  }

  /**
   * Search across all stored context
   */
  async search(query: string): Promise<{
    observations: Observation[];
    summaries: Summary[];
  }> {
    return {
      observations: searchObservations(this.db.db, query, this.project),
      summaries: searchSummaries(this.db.db, query, this.project)
    };
  }

  /**
   * Get recent observations
   */
  async getRecentObservations(limit: number = 10): Promise<Observation[]> {
    return getObservationsByProject(this.db.db, this.project, limit);
  }

  /**
   * Get recent summaries
   */
  async getRecentSummaries(limit: number = 5): Promise<Summary[]> {
    return getSummariesByProject(this.db.db, this.project, limit);
  }

  /**
   * Advanced search with FTS5 and filters
   */
  async searchAdvanced(query: string, filters: SearchFilters = {}): Promise<{
    observations: Observation[];
    summaries: Summary[];
  }> {
    const projectFilters = { ...filters, project: filters.project || this.project };

    return {
      observations: searchObservationsFTS(this.db.db, query, projectFilters),
      summaries: searchSummariesFiltered(this.db.db, query, projectFilters)
    };
  }

  /**
   * Retrieve observations by ID (batch)
   */
  async getObservationsByIds(ids: number[]): Promise<Observation[]> {
    return dbGetObservationsByIds(this.db.db, ids);
  }

  /**
   * Timeline: chronological context around an observation
   */
  async getTimeline(anchorId: number, depthBefore: number = 5, depthAfter: number = 5): Promise<TimelineEntry[]> {
    return dbGetTimeline(this.db.db, anchorId, depthBefore, depthAfter);
  }

  /**
   * Create or retrieve a session for the current project
   */
  async getOrCreateSession(contentSessionId: string): Promise<DBSession> {
    let session = getSessionByContentId(this.db.db, contentSessionId);
    if (!session) {
      const id = createSession(this.db.db, contentSessionId, this.project, '');
      session = {
        id, content_session_id: contentSessionId, project: this.project,
        user_prompt: '', memory_session_id: null, status: 'active',
        started_at: new Date().toISOString(), started_at_epoch: Date.now(),
        completed_at: null, completed_at_epoch: null
      };
    }
    return session;
  }

  /**
   * Store a user prompt
   */
  async storePrompt(contentSessionId: string, promptNumber: number, text: string): Promise<number> {
    return createPrompt(this.db.db, contentSessionId, this.project, promptNumber, text);
  }

  /**
   * Complete a session
   */
  async completeSession(sessionId: number): Promise<void> {
    dbCompleteSession(this.db.db, sessionId);
  }

  /**
   * Getter for current project name
   */
  getProject(): string {
    return this.project;
  }

  /**
   * Ricerca ibrida: vector search + keyword FTS5
   * Richiede inizializzazione HybridSearch (embedding service)
   */
  async hybridSearch(query: string, options: { limit?: number } = {}): Promise<SearchResult[]> {
    const hybridSearch = getHybridSearch();
    return hybridSearch.search(this.db.db, query, {
      project: this.project,
      limit: options.limit || 10
    });
  }

  /**
   * Ricerca solo semantica (vector search)
   * Ritorna risultati basati su similarità coseno con gli embeddings
   */
  async semanticSearch(query: string, options: { limit?: number; threshold?: number } = {}): Promise<SearchResult[]> {
    const embeddingService = getEmbeddingService();
    if (!embeddingService.isAvailable()) {
      await embeddingService.initialize();
    }
    if (!embeddingService.isAvailable()) return [];

    const queryEmbedding = await embeddingService.embed(query);
    if (!queryEmbedding) return [];

    const vectorSearch = getVectorSearch();
    const results = await vectorSearch.search(this.db.db, queryEmbedding, {
      project: this.project,
      limit: options.limit || 10,
      threshold: options.threshold || 0.3
    });

    return results.map(r => ({
      id: String(r.observationId),
      title: r.title,
      content: r.text || '',
      type: r.type,
      project: r.project,
      created_at: r.created_at,
      created_at_epoch: r.created_at_epoch,
      score: r.similarity,
      source: 'vector' as const,
      signals: {
        semantic: r.similarity,
        fts5: 0,
        recency: recencyScore(r.created_at_epoch),
        projectMatch: projectMatchScore(r.project, this.project)
      }
    }));
  }

  /**
   * Genera embeddings per osservazioni che non li hanno ancora
   */
  async backfillEmbeddings(batchSize: number = 50): Promise<number> {
    const vectorSearch = getVectorSearch();
    return vectorSearch.backfillEmbeddings(this.db.db, batchSize);
  }

  /**
   * Statistiche sugli embeddings nel database
   */
  getEmbeddingStats(): { total: number; embedded: number; percentage: number } {
    const vectorSearch = getVectorSearch();
    return vectorSearch.getStats(this.db.db);
  }

  /**
   * Inizializza il servizio di embedding (lazy, chiamare prima di hybridSearch)
   */
  async initializeEmbeddings(): Promise<boolean> {
    const hybridSearch = getHybridSearch();
    await hybridSearch.initialize();
    return getEmbeddingService().isAvailable();
  }

  /**
   * Contesto smart con ranking a 4 segnali e budget token.
   *
   * Se query presente: usa HybridSearch con SEARCH_WEIGHTS.
   * Se senza query: ranking per recency + project match (CONTEXT_WEIGHTS).
   */
  async getSmartContext(options: {
    tokenBudget?: number;
    query?: string;
  } = {}): Promise<SmartContext> {
    const tokenBudget = options.tokenBudget
      || parseInt(process.env.KIRO_MEMORY_CONTEXT_TOKENS || '0', 10)
      || 2000;

    // Sommari sempre inclusi
    const summaries = getSummariesByProject(this.db.db, this.project, 5);

    let items: ScoredItem[];

    if (options.query) {
      // Modalita SEARCH: usa HybridSearch con scoring completo
      const hybridSearch = getHybridSearch();
      const results = await hybridSearch.search(this.db.db, options.query, {
        project: this.project,
        limit: 30
      });

      items = results.map(r => ({
        id: parseInt(r.id, 10) || 0,
        title: r.title,
        content: r.content,
        type: r.type,
        project: r.project,
        created_at: r.created_at,
        created_at_epoch: r.created_at_epoch,
        score: r.score,
        signals: r.signals
      }));
    } else {
      // Modalita CONTEXT: ranking per recency + project match
      const observations = getObservationsByProject(this.db.db, this.project, 30);

      // Separa knowledge items (prioritari) da osservazioni normali
      const knowledgeTypes = new Set(KNOWLEDGE_TYPES as readonly string[]);
      const knowledgeObs: typeof observations = [];
      const normalObs: typeof observations = [];
      for (const obs of observations) {
        if (knowledgeTypes.has(obs.type)) knowledgeObs.push(obs);
        else normalObs.push(obs);
      }

      const scoreObs = (obs: typeof observations[0]) => {
        const signals = {
          semantic: 0,
          fts5: 0,
          recency: recencyScore(obs.created_at_epoch),
          projectMatch: projectMatchScore(obs.project, this.project)
        };
        const baseScore = computeCompositeScore(signals, CONTEXT_WEIGHTS);
        return {
          id: obs.id,
          title: obs.title,
          content: obs.text || obs.narrative || '',
          type: obs.type,
          project: obs.project,
          created_at: obs.created_at,
          created_at_epoch: obs.created_at_epoch,
          score: Math.min(1, baseScore * knowledgeTypeBoost(obs.type)),
          signals
        };
      };

      // Knowledge sempre in cima (ordinati per score), poi osservazioni normali
      const scoredKnowledge = knowledgeObs.map(scoreObs).sort((a, b) => b.score - a.score);
      const scoredNormal = normalObs.map(scoreObs).sort((a, b) => b.score - a.score);
      items = [...scoredKnowledge, ...scoredNormal];
    }

    // Tronca al budget token (knowledge items hanno priorità essendo in cima)
    let tokensUsed = 0;
    const budgetItems: ScoredItem[] = [];
    for (const item of items) {
      const itemTokens = Math.ceil((item.title.length + item.content.length) / 4);
      if (tokensUsed + itemTokens > tokenBudget) break;
      tokensUsed += itemTokens;
      budgetItems.push(item);
    }
    items = budgetItems;

    return {
      project: this.project,
      items,
      summaries,
      tokenBudget,
      tokensUsed: Math.min(tokensUsed, tokenBudget)
    };
  }

  /**
   * Rileva osservazioni stale (file modificati dopo la creazione) e le marca nel DB.
   * Ritorna il numero di osservazioni marcate come stale.
   */
  async detectStaleObservations(): Promise<number> {
    const staleObs = dbGetStaleObservations(this.db.db, this.project);
    if (staleObs.length > 0) {
      const ids = staleObs.map(o => o.id);
      dbMarkObservationsStale(this.db.db, ids, true);
    }
    return staleObs.length;
  }

  /**
   * Consolida osservazioni duplicate sullo stesso file e tipo.
   * Raggruppa per (project, type, files_modified), mantiene la piu recente.
   */
  async consolidateObservations(options: { dryRun?: boolean } = {}): Promise<{ merged: number; removed: number }> {
    return dbConsolidateObservations(this.db.db, this.project, options);
  }

  /**
   * Statistiche decay: totale, stale, mai accedute, accedute di recente.
   */
  async getDecayStats(): Promise<{
    total: number;
    stale: number;
    neverAccessed: number;
    recentlyAccessed: number;
  }> {
    const total = (this.db.db.query(
      'SELECT COUNT(*) as count FROM observations WHERE project = ?'
    ).get(this.project) as any)?.count || 0;

    const stale = (this.db.db.query(
      'SELECT COUNT(*) as count FROM observations WHERE project = ? AND is_stale = 1'
    ).get(this.project) as any)?.count || 0;

    const neverAccessed = (this.db.db.query(
      'SELECT COUNT(*) as count FROM observations WHERE project = ? AND last_accessed_epoch IS NULL'
    ).get(this.project) as any)?.count || 0;

    // "Recentemente accedute" = ultimo accesso nelle ultime 48 ore
    const recentThreshold = Date.now() - (48 * 60 * 60 * 1000);
    const recentlyAccessed = (this.db.db.query(
      'SELECT COUNT(*) as count FROM observations WHERE project = ? AND last_accessed_epoch > ?'
    ).get(this.project, recentThreshold) as any)?.count || 0;

    return { total, stale, neverAccessed, recentlyAccessed };
  }

  /**
   * Crea un checkpoint strutturato per resume sessione.
   * Salva automaticamente un context_snapshot con le ultime 10 osservazioni.
   */
  async createCheckpoint(sessionId: number, data: {
    task: string;
    progress?: string;
    nextSteps?: string;
    openQuestions?: string;
    relevantFiles?: string[];
  }): Promise<number> {
    // Serializza ultime 10 osservazioni della sessione come context snapshot
    const recentObs = getObservationsByProject(this.db.db, this.project, 10);
    const contextSnapshot = JSON.stringify(
      recentObs.map(o => ({ id: o.id, type: o.type, title: o.title, text: o.text?.substring(0, 200) }))
    );

    return dbCreateCheckpoint(this.db.db, sessionId, this.project, {
      task: data.task,
      progress: data.progress,
      nextSteps: data.nextSteps,
      openQuestions: data.openQuestions,
      relevantFiles: data.relevantFiles?.join(', '),
      contextSnapshot
    });
  }

  /**
   * Recupera l'ultimo checkpoint di una sessione specifica.
   */
  async getCheckpoint(sessionId: number): Promise<DBCheckpoint | null> {
    return dbGetLatestCheckpoint(this.db.db, sessionId);
  }

  /**
   * Recupera l'ultimo checkpoint per il progetto corrente.
   * Utile per resume automatico senza specificare session ID.
   */
  async getLatestProjectCheckpoint(): Promise<DBCheckpoint | null> {
    return dbGetLatestCheckpointByProject(this.db.db, this.project);
  }

  /**
   * Genera un report di attività per il progetto corrente.
   * Aggrega osservazioni, sessioni, summaries e file per un periodo temporale.
   */
  async generateReport(options?: {
    period?: 'weekly' | 'monthly';
    startDate?: Date;
    endDate?: Date;
  }): Promise<ReportData> {
    const now = new Date();
    let startEpoch: number;
    let endEpoch: number = now.getTime();

    if (options?.startDate && options?.endDate) {
      startEpoch = options.startDate.getTime();
      endEpoch = options.endDate.getTime();
    } else {
      const period = options?.period || 'weekly';
      const daysBack = period === 'monthly' ? 30 : 7;
      startEpoch = endEpoch - (daysBack * 24 * 60 * 60 * 1000);
    }

    return dbGetReportData(this.db.db, this.project, startEpoch, endEpoch);
  }

  /**
   * Getter for direct database access (for API routes)
   */
  getDb(): any {
    return this.db.db;
  }

  /**
   * Close database connection
   */
  close(): void {
    this.db.close();
  }
}

// Export convenience function
export function createKiroMemory(config?: KiroMemoryConfig): KiroMemorySDK {
  return new KiroMemorySDK(config);
}

// Backward-compatible aliases
/** @deprecated Use KiroMemorySDK instead */
export const ContextKitSDK = KiroMemorySDK;
/** @deprecated Use KiroMemoryConfig instead */
export type ContextKitConfig = KiroMemoryConfig;
/** @deprecated Use createKiroMemory instead */
export const createContextKit = createKiroMemory;

// Re-export types
export type {
  Observation,
  Summary,
  UserPrompt,
  DBSession,
  DBCheckpoint,
  ContextContext,
  SearchFilters,
  TimelineEntry,
  ScoredItem,
  SmartContext,
  ScoringWeights,
  StoreKnowledgeInput,
  KnowledgeType,
  KnowledgeMetadata,
  ReportData
} from '../types/worker-types.js';
export { KNOWLEDGE_TYPES } from '../types/worker-types.js';

export type { SearchResult } from '../services/search/HybridSearch.js';
