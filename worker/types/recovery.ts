/**
 * Worker-specific recovery types
 *
 * Re-exports shared types from src/types/recovery.ts and adds worker-specific extensions.
 * This maintains dual-module architecture separation while sharing common interfaces.
 */

// Re-export all shared types
export type {
  Annotation,
  AnnotationMatchResult,
  RecoveryResults,
  ReviewItem,
  Chunk,
  Connection,
  ConnectionRecoveryResults,
  ConnectionReviewItem,
  ReprocessResults,
  ReprocessConfig,
  ReadwiseHighlight,
  ReadwiseImportResults,
  ObsidianSettings,
  ObsidianSyncResults,
} from '../../src/types/recovery'

// ============================================================================
// WORKER-SPECIFIC ECS COMPONENT EXTENSIONS
// ============================================================================

/**
 * Extended Position component with fuzzy matching fields (worker-specific)
 */
export interface PositionComponent {
  // Existing fields
  documentId: string
  document_id: string
  startOffset: number
  endOffset: number
  originalText: string
  pageLabel?: string

  // Fuzzy matching fields (migration 033)
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
 * Extended ChunkRef component with multi-chunk support (worker-specific)
 */
export interface ChunkRefComponent {
  // Existing fields
  chunkId: string
  chunk_id: string

  // Multi-chunk support (migration 030)
  chunkIds?: string[]  // Array for annotations spanning multiple chunks
}
