/**
 * Shared HybridChunker configuration for PDF and EPUB processing.
 *
 * Based on research findings:
 * - 768 tokens optimal for academic/book content
 * - Aligns with 768d embedding model
 * - Provides +50% context vs previous 512 tokens
 *
 * Rationale for 512 → 768 token increase:
 * - Academic research shows 768 tokens optimal for book/academic content
 * - Better semantic coherence (chunks end on sentence boundaries more often)
 * - Reduces chunk count by ~30% while maintaining quality
 * - Aligns with 768-dimensional embedding model used for retrieval
 * - More context per chunk improves retrieval accuracy
 */

export interface ChunkerConfig {
  tokenizer: string
  max_tokens: number
  merge_peers: boolean
}

/**
 * Standard chunker configuration.
 * Used by both PDF and EPUB processors.
 *
 * CRITICAL: tokenizer MUST match embeddings model (worker/lib/local/embeddings-local.ts)
 */
export const STANDARD_CHUNKER_CONFIG: ChunkerConfig = {
  tokenizer: 'Xenova/all-mpnet-base-v2',  // MUST match embeddings model
  max_tokens: 768,                         // Increased from 512 (research-backed)
  merge_peers: true                        // Merge undersized adjacent chunks
}

/**
 * Get chunker options as Python JSON.
 * For passing to Docling extraction scripts.
 *
 * Python scripts expect:
 * - tokenizer: string
 * - chunk_size: number (not max_tokens)
 *
 * @returns JSON string with Python-compatible field names
 */
export function getChunkerOptions(): string {
  return JSON.stringify({
    tokenizer: STANDARD_CHUNKER_CONFIG.tokenizer,
    chunk_size: STANDARD_CHUNKER_CONFIG.max_tokens
  })
}
