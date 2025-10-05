/**
 * Type definitions for annotation recovery and connection remapping
 * Used by the fuzzy matching system and reprocessing pipeline
 */

// ============================================================================
// ANNOTATION RECOVERY TYPES
// ============================================================================

/**
 * Annotation to be recovered after document edit
 */
export interface Annotation {
  id: string
  text: string
  startOffset: number
  endOffset: number
  textContext?: {
    before: string  // ±100 chars for context-guided matching
    after: string
  }
  originalChunkIndex?: number  // For chunk-bounded search
}

/**
 * Result of annotation fuzzy matching operation
 * (Renamed from FuzzyMatchResult to avoid collision with fuzzy-matching.ts)
 */
export interface AnnotationMatchResult {
  text: string
  startOffset: number
  endOffset: number
  confidence: number  // 0.0-1.0
  method: 'exact' | 'context' | 'chunk_bounded' | 'trigram'
  contextBefore?: string  // Captured context for verification
  contextAfter?: string
}

/**
 * Aggregated results from annotation recovery
 */
export interface RecoveryResults {
  success: Annotation[]           // >0.85 confidence (auto-recovered)
  needsReview: ReviewItem[]        // 0.75-0.85 confidence (manual review)
  lost: Annotation[]               // <0.75 confidence (unrecoverable)
}

/**
 * Annotation requiring manual review
 */
export interface ReviewItem {
  annotation: Annotation
  suggestedMatch: AnnotationMatchResult
}

// ============================================================================
// CHUNK AND CONNECTION TYPES
// ============================================================================

/**
 * Document chunk with versioning support
 */
export interface Chunk {
  id: string
  document_id: string
  chunk_index: number
  start_offset: number
  end_offset: number
  content: string
  embedding?: number[]
  is_current: boolean  // For transaction-safe rollback
}

/**
 * Cross-chunk or cross-document connection
 */
export interface Connection {
  id: string
  source_chunk_id: string
  target_chunk_id: string
  engine_type: 'semantic_similarity' | 'thematic_bridge' | 'contradiction_detection'
  strength: number
  user_validated: boolean
  metadata?: Record<string, unknown>
  source_chunk?: { id: string; document_id: string; embedding: number[] }
  target_chunk?: { id: string; document_id: string; embedding: number[] }
}

/**
 * Results from connection remapping
 */
export interface ConnectionRecoveryResults {
  success: Connection[]
  needsReview: ConnectionReviewItem[]
  lost: Connection[]
}

/**
 * Connection requiring manual review
 */
export interface ConnectionReviewItem {
  connection: Connection
  sourceMatch: { chunk: Chunk; similarity: number }
  targetMatch: { chunk: Chunk; similarity: number }
}

// ============================================================================
// ECS COMPONENT EXTENSIONS
// ============================================================================

/**
 * Extended Position component with fuzzy matching fields
 */
export interface PositionComponent {
  // Existing fields
  documentId: string
  document_id: string
  startOffset: number
  endOffset: number
  originalText: string
  pageLabel?: string

  // NEW: Fuzzy matching fields (migration 033)
  textContext?: {
    before: string  // 100 chars before annotation
    after: string   // 100 chars after annotation
  }
  originalChunkIndex?: number      // For chunk-bounded search
  recoveryConfidence?: number      // 0.0-1.0
  recoveryMethod?: 'exact' | 'context' | 'chunk_bounded' | 'lost'
  needsReview?: boolean           // True if fuzzy match needs approval
}

/**
 * Extended ChunkRef component with multi-chunk support
 */
export interface ChunkRefComponent {
  // Existing fields
  chunkId: string
  chunk_id: string

  // Multi-chunk support (migration 030)
  chunkIds?: string[]  // Array for annotations spanning multiple chunks
}

// ============================================================================
// REPROCESSING TYPES
// ============================================================================

/**
 * Results from complete reprocessing operation
 */
export interface ReprocessResults {
  annotations: RecoveryResults
  connections: ConnectionRecoveryResults
  executionTime: number
  recoveryRate?: number  // Optional: annotation recovery rate for UI display
}

/**
 * Configuration for reprocessing
 */
export interface ReprocessConfig {
  documentId: string
  userId: string
  onProgress?: (stage: string, percent: number) => Promise<void>
}

// ============================================================================
// READWISE IMPORT TYPES
// ============================================================================

/**
 * Readwise highlight from export
 */
export interface ReadwiseHighlight {
  text: string
  note?: string
  location: number  // Approximate position (0-100)
  highlighted_at: string
  color: 'yellow' | 'blue' | 'red' | 'green' | 'orange'
  tags?: string[]
}

/**
 * Results from Readwise import
 */
export interface ReadwiseImportResults {
  imported: number      // Exact matches created immediately
  needsReview: ReviewItem[]  // Fuzzy matches requiring review
  failed: number        // Could not match at all
}

// ============================================================================
// OBSIDIAN INTEGRATION TYPES
// ============================================================================

/**
 * Obsidian vault settings
 */
export interface ObsidianSettings {
  vaultName: string | null
  vaultPath: string | null
  autoSync: boolean
  syncAnnotations: boolean
  exportPath: string  // Relative path in vault (e.g., "Rhizome/")
}

/**
 * Results from Obsidian sync operation
 */
export interface ObsidianSyncResults {
  changed: boolean
  reprocessResults?: ReprocessResults
}
