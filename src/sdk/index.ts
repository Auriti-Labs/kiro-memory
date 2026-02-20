/**
 * Kiro Memory SDK for Kiro CLI Integration
 *
 * Provides programmatic access to Kiro Memory system
 */

import { KiroMemoryDatabase } from '../services/sqlite/index.js';
import { getObservationsByProject, createObservation, searchObservations } from '../services/sqlite/Observations.js';
import { getSummariesByProject, createSummary, searchSummaries } from '../services/sqlite/Summaries.js';
import { getPromptsByProject, createPrompt } from '../services/sqlite/Prompts.js';
import { getSessionByContentId, createSession, completeSession as dbCompleteSession } from '../services/sqlite/Sessions.js';
import { searchObservationsFTS, searchSummariesFiltered, getObservationsByIds as dbGetObservationsByIds, getTimeline as dbGetTimeline } from '../services/sqlite/Search.js';
import type {
  Observation,
  Summary,
  UserPrompt,
  DBSession,
  ContextContext,
  SearchFilters,
  TimelineEntry
} from '../types/worker-types.js';

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
   * Store a new observation
   */
  async storeObservation(data: {
    type: string;
    title: string;
    content: string;
    concepts?: string[];
    files?: string[];
  }): Promise<number> {
    return createObservation(
      this.db.db,
      'sdk-' + Date.now(),
      this.project,
      data.type,
      data.title,
      null,           // subtitle
      data.content,
      null,           // narrative
      null,           // facts
      data.concepts?.join(', ') || null,
      data.files?.join(', ') || null,  // files_read
      data.files?.join(', ') || null,  // files_modified
      0               // prompt_number
    );
  }

  /**
   * Store a session summary
   */
  async storeSummary(data: {
    request?: string;
    learned?: string;
    completed?: string;
    nextSteps?: string;
  }): Promise<number> {
    return createSummary(
      this.db.db,
      'sdk-' + Date.now(),
      this.project,
      data.request || null,
      null,
      data.learned || null,
      data.completed || null,
      data.nextSteps || null,
      null
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
  ContextContext,
  SearchFilters,
  TimelineEntry
} from '../types/worker-types.js';
