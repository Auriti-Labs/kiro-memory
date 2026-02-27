/**
 * Kiro Memory Viewer Types
 */

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
  is_stale?: number;
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

export interface ProjectAlias {
  project_name: string;
  display_name: string;
}

export type ThemePreference = 'light' | 'dark' | 'system';

// ── Analytics Types ──

export interface TokenEconomics {
  discoveryTokens: number;
  readTokens: number;
  savings: number;
  reductionPct: number;
}

export interface AnalyticsOverview {
  observations: number;
  summaries: number;
  sessions: number;
  prompts: number;
  observationsToday: number;
  observationsThisWeek: number;
  staleCount: number;
  knowledgeCount: number;
  tokenEconomics: TokenEconomics;
}

export interface TimelineEntry {
  day: string;
  count: number;
}

export interface TypeDistributionEntry {
  type: string;
  count: number;
}

export interface SessionStatsData {
  total: number;
  completed: number;
  avgDurationMinutes: number;
}

export type ViewMode = 'feed' | 'analytics' | 'sessions' | 'timeline';

// ── Timeline / Heatmap Types (issue #21) ──

/** Singola voce giornaliera restituita dall'endpoint /api/analytics/heatmap */
export interface HeatmapDayEntry {
  /** Data ISO YYYY-MM-DD */
  date: string;
  /** Numero totale di osservazioni quel giorno */
  count: number;
  /** Progetti attivi quel giorno */
  projects: string[];
}

/** Risposta completa dell'endpoint heatmap */
export interface HeatmapResponse {
  days: HeatmapDayEntry[];
}

/** Livelli di zoom disponibili per la timeline canvas */
export type TimelineZoomLevel = 'day' | 'week' | 'month';

// ── Filter Types (issue #24) ──

/** Intervallo di date per il filtro temporale */
export interface DateRange {
  from: string; // formato YYYY-MM-DD, stringa vuota = nessun limite
  to: string;   // formato YYYY-MM-DD, stringa vuota = nessun limite
}

/** Preset rapidi per il filtro data */
export type DatePreset = 'today' | 'week' | 'month' | 'all';

/** Stato completo dei filtri della sidebar */
export interface FilterState {
  project: string;
  activeTypes: Set<string>;
  dateRange: DateRange;
  activeConcepts: Set<string>;
  searchText: string;
}

/** Azioni disponibili per il reducer dei filtri */
export type FilterAction =
  | { type: 'SET_PROJECT'; payload: string }
  | { type: 'TOGGLE_TYPE'; payload: string }
  | { type: 'SET_DATE_RANGE'; payload: DateRange }
  | { type: 'SET_DATE_PRESET'; payload: DatePreset }
  | { type: 'TOGGLE_CONCEPT'; payload: string }
  | { type: 'SET_SEARCH_TEXT'; payload: string }
  | { type: 'CLEAR_ALL' }
  | { type: 'LOAD_SAVED'; payload: SavedFilter };

/** Filtro salvato in localStorage */
export interface SavedFilter {
  id: string;       // UUID generato al salvataggio
  name: string;     // Nome auto-generato leggibile
  project: string;
  dateRange: DateRange;
  activeTypes: string[];
  activeConcepts: string[];
  savedAt: number;  // timestamp ms
}

/** Concept estratto dalle osservazioni */
export interface ConceptEntry {
  concept: string;
  count: number;
}

// ── Session Types (per la UI) ──

export interface Session {
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
