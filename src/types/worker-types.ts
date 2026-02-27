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
  is_stale: number; // 0 = fresh, 1 = file modificato dopo l'osservazione
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

// ============================================================================
// Structured Knowledge Types (Phase 5A)
// ============================================================================

/** Tipi di conoscenza strutturata */
export type KnowledgeType = 'constraint' | 'decision' | 'heuristic' | 'rejected';

/** Costante per validazione runtime */
export const KNOWLEDGE_TYPES: KnowledgeType[] = ['constraint', 'decision', 'heuristic', 'rejected'];

/** Metadati per vincoli (regole hard/soft) */
export interface ConstraintMeta {
  knowledgeType: 'constraint';
  severity: 'hard' | 'soft';
  reason?: string;
}

/** Metadati per decisioni architetturali */
export interface DecisionMeta {
  knowledgeType: 'decision';
  alternatives?: string[];
  reason?: string;
}

/** Metadati per preferenze/euristiche */
export interface HeuristicMeta {
  knowledgeType: 'heuristic';
  context?: string;
  confidence?: 'high' | 'medium' | 'low';
}

/** Metadati per soluzioni scartate */
export interface RejectedMeta {
  knowledgeType: 'rejected';
  reason: string;
  alternatives?: string[];
}

/** Union discriminata per metadati knowledge */
export type KnowledgeMetadata = ConstraintMeta | DecisionMeta | HeuristicMeta | RejectedMeta;

/** Input per salvare conoscenza strutturata */
export interface StoreKnowledgeInput {
  project: string;
  knowledgeType: KnowledgeType;
  title: string;
  content: string;
  concepts?: string[];
  files?: string[];
  /** Metadati specifici per tipo (severity, alternatives, reason, context, confidence) */
  metadata?: Partial<Omit<ConstraintMeta, 'knowledgeType'>> &
    Partial<Omit<DecisionMeta, 'knowledgeType'>> &
    Partial<Omit<HeuristicMeta, 'knowledgeType'>> &
    Partial<Omit<RejectedMeta, 'knowledgeType'>>;
}
