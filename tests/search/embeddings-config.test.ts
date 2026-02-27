/**
 * Test suite for EmbeddingService configurable model support
 *
 * Tests the configuration system — NOT the actual embedding generation,
 * which requires downloading heavy ML models.
 *
 * Verifies:
 * - Default model selection
 * - KIRO_MEMORY_EMBEDDING_MODEL env var controls model selection
 * - KIRO_MEMORY_EMBEDDING_DIMENSIONS env var controls dimensions for custom models
 * - getDimensions() returns correct values per config
 * - getModelName() returns the configured model identifier
 * - isAvailable() returns false before initialization
 * - Unknown short names fall back to the default model
 * - Custom full HuggingFace model IDs (containing '/') are accepted as-is
 */

import { describe, it, expect, afterEach } from 'bun:test';
import { EmbeddingService } from '../../src/services/search/EmbeddingService.js';

// Clean up env vars after each test to avoid cross-test pollution
afterEach(() => {
  delete process.env.KIRO_MEMORY_EMBEDDING_MODEL;
  delete process.env.KIRO_MEMORY_EMBEDDING_DIMENSIONS;
});

// ============================================================================
// Default model
// ============================================================================

describe('EmbeddingService — default model', () => {
  it('uses all-MiniLM-L6-v2 when no env var is set', () => {
    delete process.env.KIRO_MEMORY_EMBEDDING_MODEL;
    const service = new EmbeddingService();
    expect(service.getModelName()).toBe('all-MiniLM-L6-v2');
  });

  it('returns 384 dimensions for the default model', () => {
    delete process.env.KIRO_MEMORY_EMBEDDING_MODEL;
    const service = new EmbeddingService();
    expect(service.getDimensions()).toBe(384);
  });

  it('isAvailable() returns false before initialization', () => {
    delete process.env.KIRO_MEMORY_EMBEDDING_MODEL;
    const service = new EmbeddingService();
    expect(service.isAvailable()).toBe(false);
  });
});

// ============================================================================
// Built-in named models
// ============================================================================

describe('EmbeddingService — built-in named models', () => {
  it('selects jina-code-v2 with 768 dimensions when env var is set', () => {
    process.env.KIRO_MEMORY_EMBEDDING_MODEL = 'jina-code-v2';
    const service = new EmbeddingService();
    expect(service.getModelName()).toBe('jina-code-v2');
    expect(service.getDimensions()).toBe(768);
  });

  it('selects bge-small-en with 384 dimensions when env var is set', () => {
    process.env.KIRO_MEMORY_EMBEDDING_MODEL = 'bge-small-en';
    const service = new EmbeddingService();
    expect(service.getModelName()).toBe('bge-small-en');
    expect(service.getDimensions()).toBe(384);
  });

  it('selects all-MiniLM-L6-v2 explicitly when env var equals its short name', () => {
    process.env.KIRO_MEMORY_EMBEDDING_MODEL = 'all-MiniLM-L6-v2';
    const service = new EmbeddingService();
    expect(service.getModelName()).toBe('all-MiniLM-L6-v2');
    expect(service.getDimensions()).toBe(384);
  });
});

// ============================================================================
// Custom full HuggingFace model IDs
// ============================================================================

describe('EmbeddingService — custom full model ID', () => {
  it('accepts a custom model ID containing "/" without error', () => {
    process.env.KIRO_MEMORY_EMBEDDING_MODEL = 'custom/my-model';
    expect(() => new EmbeddingService()).not.toThrow();
  });

  it('preserves the full model ID as the model name', () => {
    process.env.KIRO_MEMORY_EMBEDDING_MODEL = 'custom/my-model';
    const service = new EmbeddingService();
    expect(service.getModelName()).toBe('custom/my-model');
  });

  it('defaults to 384 dimensions when KIRO_MEMORY_EMBEDDING_DIMENSIONS is not set', () => {
    process.env.KIRO_MEMORY_EMBEDDING_MODEL = 'custom/my-model';
    delete process.env.KIRO_MEMORY_EMBEDDING_DIMENSIONS;
    const service = new EmbeddingService();
    expect(service.getDimensions()).toBe(384);
  });

  it('reads KIRO_MEMORY_EMBEDDING_DIMENSIONS for custom model ID', () => {
    process.env.KIRO_MEMORY_EMBEDDING_MODEL = 'custom/my-model';
    process.env.KIRO_MEMORY_EMBEDDING_DIMENSIONS = '768';
    const service = new EmbeddingService();
    expect(service.getDimensions()).toBe(768);
  });

  it('falls back to 384 when KIRO_MEMORY_EMBEDDING_DIMENSIONS is not a valid integer', () => {
    process.env.KIRO_MEMORY_EMBEDDING_MODEL = 'custom/my-model';
    process.env.KIRO_MEMORY_EMBEDDING_DIMENSIONS = 'not-a-number';
    const service = new EmbeddingService();
    expect(service.getDimensions()).toBe(384);
  });

  it('accepts a real-looking HuggingFace model ID', () => {
    process.env.KIRO_MEMORY_EMBEDDING_MODEL = 'sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2';
    process.env.KIRO_MEMORY_EMBEDDING_DIMENSIONS = '384';
    const service = new EmbeddingService();
    expect(service.getModelName()).toBe('sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2');
    expect(service.getDimensions()).toBe(384);
  });
});

// ============================================================================
// Unknown short name fallback
// ============================================================================

describe('EmbeddingService — unknown model name fallback', () => {
  it('falls back to all-MiniLM-L6-v2 for an unknown short name (no "/")', () => {
    process.env.KIRO_MEMORY_EMBEDDING_MODEL = 'nonexistent-model';
    const service = new EmbeddingService();
    // Falls back to default
    expect(service.getModelName()).toBe('all-MiniLM-L6-v2');
    expect(service.getDimensions()).toBe(384);
  });
});

// ============================================================================
// getModelName() identity
// ============================================================================

describe('EmbeddingService — getModelName()', () => {
  it('returns the configured short name for built-in models', () => {
    process.env.KIRO_MEMORY_EMBEDDING_MODEL = 'bge-small-en';
    const service = new EmbeddingService();
    expect(service.getModelName()).toBe('bge-small-en');
  });

  it('returns the full HF ID for custom models', () => {
    process.env.KIRO_MEMORY_EMBEDDING_MODEL = 'org/custom-encoder';
    const service = new EmbeddingService();
    expect(service.getModelName()).toBe('org/custom-encoder');
  });
});

// ============================================================================
// isAvailable() before initialization
// ============================================================================

describe('EmbeddingService — isAvailable() before init', () => {
  it('returns false for default model before initialize() is called', () => {
    delete process.env.KIRO_MEMORY_EMBEDDING_MODEL;
    const service = new EmbeddingService();
    expect(service.isAvailable()).toBe(false);
  });

  it('returns false for jina-code-v2 before initialize() is called', () => {
    process.env.KIRO_MEMORY_EMBEDDING_MODEL = 'jina-code-v2';
    const service = new EmbeddingService();
    expect(service.isAvailable()).toBe(false);
  });

  it('returns false for a custom model before initialize() is called', () => {
    process.env.KIRO_MEMORY_EMBEDDING_MODEL = 'custom/model';
    const service = new EmbeddingService();
    expect(service.isAvailable()).toBe(false);
  });
});
