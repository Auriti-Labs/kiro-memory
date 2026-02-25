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

export type ViewMode = 'feed' | 'analytics';
