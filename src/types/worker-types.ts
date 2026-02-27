/**
 * Shared types for Kiro Memory Worker Service
 */

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
  last_accessed_epoch: number | null;
  is_stale: number; // 0 = fresh, 1 = file modified after the observation
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

export interface DBCheckpoint {
  id: number;
  session_id: number;
  project: string;
  task: string;
  progress: string | null;
  next_steps: string | null;
  open_questions: string | null;
  relevant_files: string | null;
  context_snapshot: string | null;
  created_at: string;
  created_at_epoch: number;
}

// ============================================================================
// Report Types
// ============================================================================

export interface ReportData {
  period: {
    start: string;
    end: string;
    days: number;
    label: string;
  };
  overview: {
    observations: number;
    summaries: number;
    sessions: number;
    prompts: number;
    knowledgeCount: number;
    staleCount: number;
  };
  timeline: Array<{ day: string; count: number }>;
  typeDistribution: Array<{ type: string; count: number }>;
  sessionStats: {
    total: number;
    completed: number;
    avgDurationMinutes: number;
  };
  topLearnings: string[];
  completedTasks: string[];
  nextSteps: string[];
  fileHotspots: Array<{ file: string; count: number }>;
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
 * Input JSON received via stdin from Kiro CLI / Claude Code hooks
 *
 * Fields common to all hooks:
 * - session_id, cwd, hook_event_name
 *
 * Hook-specific fields:
 * - UserPromptSubmit: prompt (user text, top-level)
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

  // UserPromptSubmit: the prompt is top-level, NOT in tool_input
  prompt?: string;
  user_prompt?: string;

  // PostToolUse / PreToolUse
  tool_name?: string;
  tool_input?: any;
  tool_response?: any;
  tool_use_id?: string;

  // Stop
  stop_hook_active?: boolean;

  // Catch-all for fields not yet mapped
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

/** Weights for the 4 scoring signals */
export interface ScoringWeights {
  semantic: number;
  fts5: number;
  recency: number;
  projectMatch: number;
}

/** Item with composite score and individual signals */
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

/** Smart context with token budget */
export interface SmartContext {
  project: string;
  items: ScoredItem[];
  summaries: Summary[];
  tokenBudget: number;
  tokensUsed: number;
}

// ============================================================================
// Structured Knowledge Types (Phase 5A)
// ============================================================================

/** Structured knowledge types */
export type KnowledgeType = 'constraint' | 'decision' | 'heuristic' | 'rejected';

/** Constant for runtime validation */
export const KNOWLEDGE_TYPES: KnowledgeType[] = ['constraint', 'decision', 'heuristic', 'rejected'];

/** Metadata for constraints (hard/soft rules) */
export interface ConstraintMeta {
  knowledgeType: 'constraint';
  severity: 'hard' | 'soft';
  reason?: string;
}

/** Metadata for architectural decisions */
export interface DecisionMeta {
  knowledgeType: 'decision';
  alternatives?: string[];
  reason?: string;
}

/** Metadata for preferences/heuristics */
export interface HeuristicMeta {
  knowledgeType: 'heuristic';
  context?: string;
  confidence?: 'high' | 'medium' | 'low';
}

/** Metadata for rejected solutions */
export interface RejectedMeta {
  knowledgeType: 'rejected';
  reason: string;
  alternatives?: string[];
}

/** Discriminated union for knowledge metadata */
export type KnowledgeMetadata = ConstraintMeta | DecisionMeta | HeuristicMeta | RejectedMeta;

/** Input for storing structured knowledge */
export interface StoreKnowledgeInput {
  project: string;
  knowledgeType: KnowledgeType;
  title: string;
  content: string;
  concepts?: string[];
  files?: string[];
  /** Type-specific metadata (severity, alternatives, reason, context, confidence) */
  metadata?: Partial<Omit<ConstraintMeta, 'knowledgeType'>> &
    Partial<Omit<DecisionMeta, 'knowledgeType'>> &
    Partial<Omit<HeuristicMeta, 'knowledgeType'>> &
    Partial<Omit<RejectedMeta, 'knowledgeType'>>;
}
