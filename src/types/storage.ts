/**
 * TypeScript interfaces for Storage-First Portability System.
 * Shared types between worker and main app.
 *
 * See: docs/tasks/storage-first-portability.md
 * Worker types: worker/types/storage.ts
 */

// ============================================================================
// Import Conflict Resolution
// ============================================================================

/**
 * Conflict resolution strategies for import
 */
export type ConflictStrategy = 'skip' | 'replace' | 'merge_smart'

/**
 * Chunk export data structure (from worker/types/storage.ts)
 */
export interface ChunkExportData {
  // Core content
  content: string
  chunk_index: number

  // Position tracking
  start_offset?: number
  end_offset?: number
  word_count?: number

  // Docling structural metadata (LOCAL mode)
  page_start?: number | null
  page_end?: number | null
  heading_level?: number | null
  section_marker?: string | null
  position_confidence?: 'exact' | 'high' | 'medium' | 'synthetic'
  position_method?: string
  position_validated?: boolean

  // AI-extracted metadata
  themes?: string[]
  importance_score?: number
  summary?: string | null

  // Flat JSONB metadata
  emotional_metadata?: {
    polarity: number
    primaryEmotion: string
    intensity: number
  }
  conceptual_metadata?: {
    concepts: Array<{ text: string; importance: number }>
  }
  domain_metadata?: {
    primaryDomain: string
    confidence: number
  } | null

  metadata_extracted_at?: string | null
}

/**
 * Import conflict data structure
 * Used by ConflictResolutionDialog to show side-by-side comparison
 */
export interface ImportConflict {
  documentId: string
  existingChunkCount: number
  importChunkCount: number
  existingProcessedAt: string
  importProcessedAt: string
  sampleChunks: {
    existing: ChunkExportData[]
    import: ChunkExportData[]
  }
}

/**
 * Import options for importFromStorage action
 */
export interface ImportOptions {
  strategy?: ConflictStrategy
  regenerateEmbeddings?: boolean
  reprocessConnections?: boolean
}

/**
 * Import result from importFromStorage action
 */
export interface ImportResult {
  success: boolean
  jobId?: string
  error?: string
  conflict?: ImportConflict
}
