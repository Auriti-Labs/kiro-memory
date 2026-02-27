import type { ISummaryGenerator, SessionContext, GeneratedSummary } from './ISummaryGenerator.js';
import { TemplateSummaryGenerator } from './TemplateSummaryGenerator.js';
import { logger } from '../../utils/logger.js';

export interface LLMConfig {
  provider: 'openai' | 'anthropic' | 'ollama';
  model: string;
  apiKey?: string;
  baseUrl?: string;
  maxTokens?: number;
}

const SUMMARY_PROMPT = `You are a developer session summarizer. Given the following session context, generate a structured summary.

Session project: {project}
User request: {userPrompt}
Duration: {duration} minutes
Observations ({obsCount} total):
{observations}

Generate a JSON response with these fields:
- request: What the user asked for (1 sentence)
- investigated: What was researched/explored (bullet points)
- learned: Key takeaways and learnings (bullet points)
- completed: What was accomplished (bullet points)
- nextSteps: Suggested follow-up actions (bullet points)
- notes: Any additional context

Respond ONLY with valid JSON.`;

/**
 * LLM-backed summary generator.
 * Supports OpenAI, Anthropic, and Ollama backends.
 * Falls back to TemplateSummaryGenerator on failure.
 */
export class LLMSummaryGenerator implements ISummaryGenerator {
  readonly name: string;
  private config: LLMConfig;
  private fallback: TemplateSummaryGenerator;

  constructor(config: LLMConfig) {
    this.config = config;
    this.name = `llm-${config.provider}`;
    this.fallback = new TemplateSummaryGenerator();
  }

  async generate(context: SessionContext): Promise<GeneratedSummary> {
    try {
      const prompt = this._buildPrompt(context);
      const response = await this._callLLM(prompt);
      return this._parseResponse(response);
    } catch (error) {
      logger.warn(
        'SYSTEM',
        `LLM summary generation failed, falling back to template: ${error}`
      );
      return this.fallback.generate(context);
    }
  }

  private _buildPrompt(context: SessionContext): string {
    const obsText = context.observations
      .slice(0, 20) // Limit to avoid token overflow
      .map(
        o =>
          `[${o.type}] ${o.title}${o.text ? ': ' + o.text.substring(0, 100) : ''}`
      )
      .join('\n');

    return SUMMARY_PROMPT
      .replace('{project}', context.project)
      .replace('{userPrompt}', context.userPrompt)
      .replace('{duration}', String(context.durationMinutes || 'unknown'))
      .replace('{obsCount}', String(context.observations.length))
      .replace('{observations}', obsText);
  }

  private async _callLLM(prompt: string): Promise<string> {
    const { provider, model, apiKey, baseUrl, maxTokens } = this.config;

    if (provider === 'ollama') {
      const url = baseUrl || 'http://localhost:11434';
      const res = await fetch(`${url}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, prompt, stream: false }),
      });
      if (!res.ok) throw new Error(`Ollama error: ${res.status}`);
      const data = (await res.json()) as { response: string };
      return data.response;
    }

    if (provider === 'openai') {
      const url = baseUrl || 'https://api.openai.com/v1';
      if (!apiKey) throw new Error('OpenAI API key required');
      const res = await fetch(`${url}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: prompt }],
          max_tokens: maxTokens || 1000,
          temperature: 0.3,
        }),
      });
      if (!res.ok) throw new Error(`OpenAI error: ${res.status}`);
      const data = (await res.json()) as {
        choices: Array<{ message: { content: string } }>;
      };
      return data.choices[0]?.message?.content || '';
    }

    if (provider === 'anthropic') {
      const url = baseUrl || 'https://api.anthropic.com/v1';
      if (!apiKey) throw new Error('Anthropic API key required');
      const res = await fetch(`${url}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: prompt }],
          max_tokens: maxTokens || 1000,
        }),
      });
      if (!res.ok) throw new Error(`Anthropic error: ${res.status}`);
      const data = (await res.json()) as { content: Array<{ text: string }> };
      return data.content[0]?.text || '';
    }

    throw new Error(`Unknown LLM provider: ${provider}`);
  }

  private _parseResponse(response: string): GeneratedSummary {
    // Try to extract JSON from response (may include markdown code blocks)
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in LLM response');
    }

    const parsed = JSON.parse(jsonMatch[0]);
    return {
      request: parsed.request || null,
      investigated: parsed.investigated || null,
      learned: parsed.learned || null,
      completed: parsed.completed || null,
      nextSteps: parsed.nextSteps || parsed.next_steps || null,
      notes: parsed.notes || null,
    };
  }
}
