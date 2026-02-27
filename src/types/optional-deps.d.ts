/**
 * Type declarations for optional dependencies.
 * These modules may not be installed — they are imported dynamically
 * at runtime with try/catch in EmbeddingService.ts.
 */

declare module 'fastembed' {
  export const EmbeddingModel: any;
  export const FlagEmbedding: any;
}

declare module '@huggingface/transformers' {
  export function pipeline(...args: any[]): Promise<any>;
}
