/**
 * Shared types for Kiro Memory Worker Service
 */

import type { Response } from 'express';

// ============================================================================
// Active Session Types
// ============================================================================

/**
 * Conversation message for shared history
 * Used to maintain context across sessions
 */
export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ActiveSession {
  sessionDbId: number;
  contentSessionId: string;      // User's Kiro session being observed
  memorySessionId: string | null; // Memory agent's session ID for resume
  project: string;
  userPrompt: string;
  pendingMessages: PendingMessage[];
  abortController: AbortController;
  generatorPromise: Promise<void> | null;
  lastPromptNumber: number;
  startTime: number;
  cumulativeInputTokens: number;
  cumulativeOutputTokens: number;
  earliestPendingTimestamp: number | null;
  conversationHistory: ConversationMessage[];
  currentProvider: 'kiro' | 'local' | null;
  consecutiveRestarts: number;
  forceInit?: boolean;
  idleTimedOut?: boolean;
  processingMessageIds: number[];
}

export interface PendingMessage {
  type: 'observation' | 'summarize';
  tool_name?: string;
  tool_input?: any;
  tool_response?: any;
  prompt_number?: number;
  cwd?: string;
  last_assistant_message?: string;
}

export interface PendingMessageWithId extends PendingMessage {
  _persistentId: number;
  _originalTimestamp: number;
}

export interface ObservationData {
  tool_name: string;
  tool_input: any;
  tool_response: any;
  prompt_number: number;
  cwd?: string;
}

// ============================================================================
// SSE Types
// ============================================================================

export interface SSEEvent {
  type: string;
  timestamp?: number;
  [key: string]: any;
}

export type SSEClient = Response;

// ============================================================================
// Pagination Types
// ============================================================================

export interface PaginatedResult<T> {
  items: T[];
  hasMore: boolean;
  offset: number;
  limit: number;
}

export interface PaginationParams {
  offset: number;
  limit: number;
  project?: string;
}

// ============================================================================
// Settings Types
// ============================================================================

export interface ViewerSettings {
  sidebarOpen: boolean;
  selectedProject: string | null;
  theme: 'light' | 'dark' | 'system';
}

// ============================================================================
// Database Record Types
// ============================================================================

export interface Observation {
  id: number;
  memory_session_id: string;
  project: string;
  type: string;
  title: string;
  subtitle: string | null;
  text: string | null;
  narrative: string | null;
  facts: string | null;
  concepts: string | null;
  files_read: string | null;
  files_modified: string | null;
  prompt_number: number;
  created_at: string;
  created_at_epoch: number;
}

export interface Summary {
  id: number;
  session_id: string;
  project: string;
  request: string | null;
  investigated: string | null;
  learned: string | null;
  completed: string | null;
  next_steps: string | null;
  notes: string | null;
  created_at: string;
  created_at_epoch: number;
}

export interface UserPrompt {
  id: number;
  content_session_id: string;
  project: string;
  prompt_number: number;
  prompt_text: string;
  created_at: string;
  created_at_epoch: number;
}

export interface DBSession {
  id: number;
  content_session_id: string;
  project: string;
  user_prompt: string;
  memory_session_id: string | null;
  status: 'active' | 'completed' | 'failed';
  started_at: string;
  started_at_epoch: number;
  completed_at: string | null;
  completed_at_epoch: number | null;
}

// ============================================================================
// Parsed Content Types
// ============================================================================

export interface ParsedObservation {
  type: string;
  title: string;
  subtitle: string | null;
  text: string;
  concepts: string[];
  files: string[];
}

export interface ParsedSummary {
  request: string | null;
  investigated: string | null;
  learned: string | null;
  completed: string | null;
  next_steps: string | null;
  notes: string | null;
}

// ============================================================================
// Utility Types
// ============================================================================

export interface DatabaseStats {
  totalObservations: number;
  totalSessions: number;
  totalPrompts: number;
  totalSummaries: number;
  projectCounts: Record<string, {
    observations: number;
    sessions: number;
    prompts: number;
    summaries: number;
  }>;
}

// ============================================================================
// Kiro Integration Types
// ============================================================================

export interface KiroMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp?: number;
}

export interface KiroSession {
  id: string;
  project: string;
  messages: KiroMessage[];
  createdAt: number;
  updatedAt: number;
}

export interface ContextContext {
  project: string;
  relevantObservations: Observation[];
  relevantSummaries: Summary[];
  recentPrompts: UserPrompt[];
}

// ============================================================================
// Kiro CLI Hook Types
// ============================================================================

/**
 * Input JSON ricevuto via stdin dagli hook Kiro CLI / Claude Code
 *
 * Campi comuni a tutti gli hook:
 * - session_id, cwd, hook_event_name
 *
 * Campi specifici per hook:
 * - UserPromptSubmit: prompt (testo dell'utente, top-level)
 * - PostToolUse: tool_name, tool_input, tool_response, tool_use_id
 * - Stop: stop_hook_active, transcript_path
 * - SessionStart/agentSpawn: transcript_path
 */
export interface KiroHookInput {
  hook_event_name: string;
  session_id?: string;
  cwd: string;
  transcript_path?: string;
  permission_mode?: string;

  // UserPromptSubmit: il prompt è top-level, NON in tool_input
  prompt?: string;
  user_prompt?: string;

  // PostToolUse / PreToolUse
  tool_name?: string;
  tool_input?: any;
  tool_response?: any;
  tool_use_id?: string;

  // Stop
  stop_hook_active?: boolean;

  // Catch-all per campi non ancora mappati
  [key: string]: any;
}

// ============================================================================
// Search Types
// ============================================================================

export interface SearchFilters {
  project?: string;
  type?: string;
  dateStart?: number;
  dateEnd?: number;
  limit?: number;
}

export interface SearchResult {
  observations: Observation[];
  summaries: Summary[];
  total: number;
}

export interface TimelineEntry {
  id: number;
  type: 'observation' | 'summary' | 'session';
  title: string;
  content: string | null;
  project: string;
  created_at: string;
  created_at_epoch: number;
}

// ============================================================================
// Smart Ranking Types (Phase 2B)
// ============================================================================

/** Pesi per i 4 segnali di scoring */
export interface ScoringWeights {
  semantic: number;
  fts5: number;
  recency: number;
  projectMatch: number;
}

/** Item con score composito e segnali individuali */
export interface ScoredItem {
  id: number;
  title: string;
  content: string;
  type: string;
  project: string;
  created_at: string;
  created_at_epoch: number;
  score: number;
  signals: {
    semantic: number;
    fts5: number;
    recency: number;
    projectMatch: number;
  };
}

/** Contesto smart con budget token */
export interface SmartContext {
  project: string;
  items: ScoredItem[];
  summaries: Summary[];
  tokenBudget: number;
  tokensUsed: number;
}
