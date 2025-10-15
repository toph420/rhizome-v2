/**
 * TypeScript interfaces for Storage-First Portability System.
 *
 * These schemas define the JSON structure for exported documents, enabling:
 * - Zero-cost database resets (restore from Storage)
 * - Document portability (export/import)
 * - Intelligent conflict resolution
 * - Connection reprocessing with validation preservation
 *
 * See: docs/prps/storage-first-portability.md
 */

// ============================================================================
// Export Schemas - Saved to Storage during processing
// ============================================================================

/**
 * chunks.json - Enriched chunks with full AI metadata
 *
 * Excludes:
 * - `id` (UUID, regenerated on import)
 * - `document_id` (set during import)
 * - `embedding` (768 dimensions, regenerate in 2-3 seconds)
 */
export interface ChunksExport {
  version: "1.0"
  document_id: string
  processing_mode: "local" | "cloud"
  created_at: string  // ISO timestamp
  chunks: ChunkExportData[]
}

/**
 * Individual chunk data for export.
 * Contains content, position tracking, Docling metadata, and AI-extracted metadata.
 */
export interface ChunkExportData {
  // Core content
  content: string
  chunk_index: number

  // Position tracking
  start_offset?: number
  end_offset?: number
  word_count?: number

  // Chonkie chunking metadata
  chunker_type: "token" | "sentence" | "recursive" | "semantic" | "late" | "code" | "neural" | "slumber" | "table"
  heading_path?: string[] | null
  metadata_overlap_count?: number
  metadata_confidence?: "high" | "medium" | "low"
  metadata_interpolated?: boolean

  // Docling structural metadata (LOCAL mode)
  page_start?: number | null
  page_end?: number | null
  heading_level?: number | null
  section_marker?: string | null
  bboxes?: BBox[] | null
  position_confidence?: "exact" | "high" | "medium" | "synthetic"
  position_method?: string
  position_validated?: boolean

  // AI-extracted metadata
  themes?: string[]
  importance_score?: number
  summary?: string | null

  // Flat JSONB metadata (migration 015)
  emotional_metadata?: EmotionalMetadata
  conceptual_metadata?: ConceptualMetadata
  domain_metadata?: DomainMetadata | null

  metadata_extracted_at?: string | null
}

/**
 * Bounding box for chunk position in original PDF/EPUB
 */
export interface BBox {
  page: number
  l: number  // left
  t: number  // top
  r: number  // right
  b: number  // bottom
}

/**
 * Emotional analysis metadata for chunk
 */
export interface EmotionalMetadata {
  polarity: number
  primaryEmotion: string
  intensity: number
}

/**
 * Conceptual metadata for chunk
 */
export interface ConceptualMetadata {
  concepts: Array<{ text: string; importance: number }>
}

/**
 * Domain classification metadata
 */
export interface DomainMetadata {
  primaryDomain: string
  confidence: number
}

/**
 * cached_chunks.json - Docling extraction for LOCAL mode
 * Enables zero-cost reprocessing with bulletproof matching
 */
export interface CachedChunksExport {
  version: "1.0"
  document_id: string
  extraction_mode: "pdf" | "epub"
  markdown_hash: string  // SHA256 of cleaned markdown
  docling_version: string  // e.g., "2.55.1"
  chunks: unknown[]  // DoclingChunk objects from extraction
  structure: DoclingStructure
  created_at: string
}

/**
 * Docling structure metadata (headings, pages)
 */
export interface DoclingStructure {
  headings: Array<{ level: number; text: string; page: number }>
  total_pages: number
}

/**
 * metadata.json - Document-level metadata
 */
export interface MetadataExport {
  version: "1.0"
  document_id: string
  title: string
  author?: string | null
  source: DocumentSource
  processing_mode: "local" | "cloud"
  word_count: number
  page_count?: number | null
  language?: string | null
  created_at: string
  processed_at: string
}

/**
 * Document source types supported by Rhizome
 */
export type DocumentSource = "pdf" | "epub" | "youtube" | "web" | "markdown" | "text" | "paste"

/**
 * manifest.json - File inventory, costs, and processing times
 */
export interface ManifestExport {
  version: "1.0"
  document_id: string
  created_at: string
  processing_mode: "local" | "cloud"
  files: {
    source: FileInfo
    content: FileInfo
    chunks: FileInfo & { count: number }
    cached_chunks?: FileInfo
    metadata: FileInfo
  }
  processing_cost: {
    extraction: number
    metadata: number
    embeddings: number
    connections: number
    total: number
  }
  processing_time: {
    extraction: number  // seconds
    cleanup: number
    chunking: number
    metadata: number
    embeddings: number
    total: number
  }
}

/**
 * File information in Storage
 */
export interface FileInfo {
  path: string
  size: number
  hash: string
}

// ============================================================================
// Import Conflict Resolution
// ============================================================================

/**
 * Conflict resolution strategies for import
 */
export type ConflictStrategy = "skip" | "replace" | "merge_smart"

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

// ============================================================================
// Connection Reprocessing
// ============================================================================

/**
 * Reprocess modes for connection regeneration
 * - all: Delete all, regenerate from scratch
 * - add_new: Keep existing, add connections to newer documents
 * - smart: Preserve user-validated, update rest intelligently
 */
export type ReprocessMode = "all" | "add_new" | "smart"

/**
 * Connection engine types
 */
export type ConnectionEngine = "semantic_similarity" | "contradiction_detection" | "thematic_bridge"

/**
 * Options for connection reprocessing
 */
export interface ReprocessOptions {
  mode: ReprocessMode
  engines: ConnectionEngine[]
  preserveValidated?: boolean
  backupFirst?: boolean
}
