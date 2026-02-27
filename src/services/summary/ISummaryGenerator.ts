/**
 * Summary generator interface.
 * Pluggable strategy for generating session summaries.
 */

export interface SessionContext {
  project: string;
  sessionId: string;
  userPrompt: string;
  observations: Array<{
    type: string;
    title: string;
    text: string | null;
    narrative: string | null;
    auto_category?: string | null;
  }>;
  durationMinutes?: number;
}

export interface GeneratedSummary {
  request: string | null;
  investigated: string | null;
  learned: string | null;
  completed: string | null;
  nextSteps: string | null;
  notes: string | null;
}

export interface ISummaryGenerator {
  /** Human-readable name of the generator */
  readonly name: string;
  /** Generate a structured summary from session context */
  generate(context: SessionContext): Promise<GeneratedSummary>;
}
