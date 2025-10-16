/**
 * Chonkie Integration Types
 *
 * Type definitions for the unified Chonkie-based chunking pipeline.
 * Supports 9 chunker strategies with full metadata transfer from Docling.
 *
 * Architecture:
 * - Docling chunks = metadata anchors (heading_path, pages, bboxes)
 * - Chonkie chunks = actual chunks (search, connections, annotations)
 * - Bulletproof matcher = coordinate mapper (for metadata transfer)
 */

// ============================================================================
// Chunker Strategy Types
// ============================================================================

/**
 * Chonkie chunker strategies.
 * Each optimized for different document types and quality/speed trade-offs.
 *
 * Speed ranking (fastest to slowest):
 * token → sentence → recursive → code/table → semantic → late → neural → slumber
 */
export type ChonkieStrategy =
  | 'token'      // Fixed-size chunks, compatibility fallback
  | 'sentence'   // Sentence boundaries, simple and fast
  | 'recursive'  // Hierarchical splitting (recommended default)
  | 'semantic'   // Topic shifts, narrative coherence
  | 'late'       // Contextual embeddings, high quality
  | 'code'       // AST-aware code splitting
  | 'neural'     // BERT-based semantic shifts
  | 'slumber'    // Agentic LLM-powered (highest quality)
  | 'table'      // Markdown table splitting

/**
 * Complete chunker type including legacy HybridChunker.
 * Used for database schema and backward compatibility.
 */
export type ChunkerType =
  | 'hybrid'  // Old HybridChunker (deprecated, for backward compatibility)
  | ChonkieStrategy

// ============================================================================
// Chonkie Configuration
// ============================================================================

/**
 * Configuration for Chonkie chunking.
 * Supports all 9 chunker types with type-specific options.
 */
export interface ChonkieConfig {
  /** Chunker strategy to use */
  chunker_type: ChonkieStrategy

  /** Chunk size in tokens (default: 512, can use 768 for embedding alignment) */
  chunk_size?: number

  /** Tokenizer model name (default: "gpt2") */
  tokenizer?: string

  // ========================================
  // Recursive-specific options
  // ========================================

  /** Custom splitting rules for RecursiveChunker */
  rules?: any[]

  /** Pre-configured rule sets: "markdown" | "default" */
  recipe?: 'markdown' | 'default'

  // ========================================
  // Semantic/Late-specific options
  // ========================================

  /** Embedding model for semantic similarity (default: "all-mpnet-base-v2" - matches final embeddings) */
  embedding_model?: string

  /** Similarity threshold for semantic chunker (default: 0.65, LOWER = larger chunks, HIGHER = smaller chunks) */
  threshold?: number | 'auto'

  /** Chunking mode for late chunker: "sentence" | "paragraph" */
  mode?: 'sentence' | 'paragraph'

  // ========================================
  // Neural-specific options
  // ========================================

  /** BERT model for neural chunker (default: "mirth/chonky_modernbert_base_1") */
  model?: string

  // ========================================
  // Slumber-specific options
  // ========================================

  /** LLM backend for slumber chunker: "gemini" | "openai" */
  genie?: 'gemini' | 'openai'

  // ========================================
  // Code-specific options
  // ========================================

  /** Programming language for AST parsing (e.g., "python", "javascript") */
  language?: string

  /** Include AST nodes in output */
  include_nodes?: boolean

  // ========================================
  // Sentence-specific options
  // ========================================

  /** Minimum sentences per chunk */
  min_sentences?: number

  // ========================================
  // General options
  // ========================================

  /** Timeout in milliseconds (default: varies by chunker, scaled by doc size) */
  timeout?: number
}

// ============================================================================
// Chonkie Output
// ============================================================================

/**
 * Chunk output from Chonkie.
 * Contains text content with guaranteed character offsets for metadata transfer.
 *
 * CRITICAL: start_index and end_index must match cleanedMarkdown.slice(start, end) === text
 */
export interface ChonkieChunk {
  /** Chunk text content */
  text: string

  /** Character offset in original markdown (start, inclusive) */
  start_index: number

  /** Character offset in original markdown (end, exclusive) */
  end_index: number

  /** Token count (respects chunk_size limit) */
  token_count: number

  /** Which chunker was used */
  chunker_type: ChonkieStrategy
}

// ============================================================================
// Metadata Transfer Types
// ============================================================================

/**
 * Metadata transferred from Docling chunks to Chonkie chunks via overlap detection.
 * Includes quality metrics for validation and user review.
 */
export interface ChunkMetadata {
  /** Heading hierarchy path (e.g., ["Chapter 1", "Section 1.1"]) */
  heading_path: string[] | null

  /** Starting page number (1-based) */
  page_start: number | null

  /** Ending page number (1-based) */
  page_end: number | null

  /** Section marker (for EPUBs) */
  section_marker: string | null

  /** Bounding boxes for PDF citation support */
  bboxes: any[] | null

  // ========================================
  // Metadata transfer quality tracking
  // ========================================

  /** Number of Docling chunks that overlapped (0 = interpolated) */
  metadata_overlap_count: number

  /** Confidence in metadata transfer based on overlaps */
  metadata_confidence: 'high' | 'medium' | 'low'

  /** True if metadata was interpolated from neighbors (no overlaps found) */
  metadata_interpolated: boolean
}

/**
 * Complete processed chunk with both Chonkie content and Docling metadata.
 * Ready for database insertion and downstream processing (embeddings, enrichment).
 */
export interface ProcessedChunk extends ChunkMetadata {
  /** Document ID (foreign key) */
  document_id: string

  /** Chunk text content (from Chonkie) */
  content: string

  /** Chunk index in document (0-based) */
  chunk_index: number

  /** Character offset in cleaned markdown (start) */
  start_offset: number

  /** Character offset in cleaned markdown (end) */
  end_offset: number

  /** Word count */
  word_count: number

  /** Token count (from Chonkie) */
  token_count: number

  /** Chonkie chunker strategy used */
  chunker_type: ChunkerType

  // ========================================
  // Metadata enrichment fields (filled in Stage 8)
  // ========================================

  /** Extracted themes from PydanticAI */
  themes: string[]

  /** Importance score (0.0-1.0) */
  importance_score: number

  /** Optional summary */
  summary: string | null

  /** Emotional metadata (polarity, primary emotion, intensity) */
  emotional_metadata: any

  /** Conceptual metadata (concepts, entities) */
  conceptual_metadata: any

  /** Domain-specific metadata */
  domain_metadata: any | null
}
