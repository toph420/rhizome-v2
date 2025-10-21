/**
 * Shared type definitions for document actions
 */

// ============================================================================
// Job Progress
// ============================================================================

/**
 * Job progress structure for tracking processing stages
 */
export interface JobProgress {
  stage?: string
  percent?: number
  stage_data?: Record<string, unknown>
}

// ============================================================================
// Storage Scanner Types
// ============================================================================

/**
 * Document sync state types for Storage Scanner
 */
export type SyncState = 'healthy' | 'missing_from_db' | 'missing_from_storage' | 'out_of_sync'

/**
 * Scan result for a single document
 */
export interface DocumentScanResult {
  documentId: string
  title: string
  storageFiles: string[]
  inDatabase: boolean
  chunkCount: number | null
  syncState: SyncState
  createdAt: string | null
}

/**
 * Result of scanning Storage vs Database
 */
export interface ScanResult {
  success: boolean
  documents: DocumentScanResult[]
  error?: string
}

// ============================================================================
// Import Types
// ============================================================================

/**
 * Chunk export data structure (matches worker/types/storage.ts)
 */
export interface ChunkExportData {
  content: string
  chunk_index: number
  start_offset?: number
  end_offset?: number
  word_count?: number
  page_start?: number | null
  page_end?: number | null
  heading_level?: number | null
  section_marker?: string | null
  themes?: string[]
  importance_score?: number
  summary?: string | null
  metadata_extracted_at?: string | null
}

/**
 * Import conflict data structure for ConflictResolutionDialog
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
 * Conflict resolution strategies for import
 */
export type ConflictStrategy = 'skip' | 'replace' | 'merge_smart'

/**
 * Import options for restoring from Storage
 */
export interface ImportOptions {
  strategy?: ConflictStrategy
  regenerateEmbeddings?: boolean
  reprocessConnections?: boolean
}

/**
 * Result of import operation with conflict detection
 */
export interface ImportResult {
  success: boolean
  jobId?: string
  needsResolution?: boolean
  conflict?: ImportConflict
  error?: string
}

// ============================================================================
// Connection Reprocessing Types
// ============================================================================

/**
 * Reprocessing modes for connections
 */
export type ReprocessMode = 'all' | 'add_new' | 'smart'

/**
 * Valid engine types for connection reprocessing
 */
export type EngineType = 'semantic_similarity' | 'contradiction_detection' | 'thematic_bridge'

/**
 * Options for connection reprocessing
 */
export interface ReprocessOptions {
  mode: ReprocessMode
  engines: EngineType[]
  preserveValidated?: boolean
  backupFirst?: boolean
}

/**
 * Result of reprocess connections operation
 */
export interface ReprocessResult {
  success: boolean
  jobId?: string
  error?: string
}

// ============================================================================
// Export Types
// ============================================================================

/**
 * Export format types for document bundles
 */
export type ExportFormat = 'storage' | 'zip'

/**
 * Options for document export
 */
export interface ExportOptions {
  includeConnections?: boolean
  includeAnnotations?: boolean
  format?: ExportFormat
}

/**
 * Result of export operation
 */
export interface ExportResult {
  success: boolean
  jobId?: string
  error?: string
}
