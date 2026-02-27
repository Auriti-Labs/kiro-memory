export type { ISummaryGenerator, SessionContext, GeneratedSummary } from './ISummaryGenerator.js';
export { TemplateSummaryGenerator } from './TemplateSummaryGenerator.js';
export { LLMSummaryGenerator } from './LLMSummaryGenerator.js';
export type { LLMConfig } from './LLMSummaryGenerator.js';

import { TemplateSummaryGenerator } from './TemplateSummaryGenerator.js';
import { LLMSummaryGenerator, type LLMConfig } from './LLMSummaryGenerator.js';
import type { ISummaryGenerator } from './ISummaryGenerator.js';
import { logger } from '../../utils/logger.js';

/**
 * Create a summary generator based on environment configuration.
 *
 * Environment variables:
 * - KIRO_MEMORY_SUMMARY_PROVIDER: 'template' | 'openai' | 'anthropic' | 'ollama' (default: 'template')
 * - KIRO_MEMORY_SUMMARY_MODEL: LLM model name (e.g., 'gpt-4o-mini', 'claude-3-haiku-20240307')
 * - KIRO_MEMORY_SUMMARY_API_KEY: API key for LLM provider
 * - KIRO_MEMORY_SUMMARY_BASE_URL: Custom base URL for LLM API
 */
export function createSummaryGenerator(): ISummaryGenerator {
  const provider = process.env.KIRO_MEMORY_SUMMARY_PROVIDER || 'template';

  if (provider === 'template') {
    return new TemplateSummaryGenerator();
  }

  const validProviders = ['openai', 'anthropic', 'ollama'];
  if (!validProviders.includes(provider)) {
    logger.warn('SYSTEM', `Unknown provider "${provider}", falling back to template`);
    return new TemplateSummaryGenerator();
  }

  const config: LLMConfig = {
    provider: provider as LLMConfig['provider'],
    model: process.env.KIRO_MEMORY_SUMMARY_MODEL || 'gpt-4o-mini',
    apiKey: process.env.KIRO_MEMORY_SUMMARY_API_KEY,
    baseUrl: process.env.KIRO_MEMORY_SUMMARY_BASE_URL,
  };

  logger.info('SYSTEM', `Using LLM summary generator: ${provider} (${config.model})`);
  return new LLMSummaryGenerator(config);
}
