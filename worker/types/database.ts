/**
 * Database Types for Worker Module
 *
 * Type-safe interfaces for database tables used in document processing.
 * Generated from Supabase schema with Chonkie integration support (migration 050).
 *
 * Key Changes (Migration 050):
 * - chunks.chunker_type: Tracks which Chonkie strategy was used
 * - chunks.metadata_overlap_count: Number of Docling chunks that overlapped
 * - chunks.metadata_confidence: Quality score (high/medium/low)
 * - chunks.metadata_interpolated: True if no overlaps found
 * - documents.chunker_type: User-selected strategy per document
 * - user_preferences.default_chunker_type: User's default preference
 */

import type { ChunkerType } from '../lib/chonkie/types.js'

// ============================================================================
// Core Database Types
// ============================================================================

/**
 * JSON type for flexible metadata storage.
 * Matches PostgreSQL's JSONB type.
 */
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

// ============================================================================
// Chunk Table
// ============================================================================

/**
 * Chunk row from database.
 * Represents a processed text chunk with embeddings and metadata.
 *
 * New fields (migration 050):
 * - chunker_type: Which Chonkie strategy was used (recursive, semantic, etc.)
 * - metadata_overlap_count: How many Docling chunks overlapped (0 = interpolated)
 * - metadata_confidence: Quality score based on overlaps (high/medium/low)
 * - metadata_interpolated: True if metadata came from nearest neighbor
 */
export interface Chunk {
  // Primary fields
  id: string
  document_id: string | null
  content: string
  chunk_index: number
  created_at: string | null

  // Character offsets (from Chonkie)
  start_offset: number | null
  end_offset: number | null
  word_count: number | null

  // Chunker tracking (NEW in migration 050)
  /** Token count from Chonkie chunker (respects chunk_size limit) */
  token_count: number | null

  /** Which Chonkie strategy was used (default: 'hybrid' for backward compatibility) */
  chunker_type: ChunkerType

  // Docling structural metadata (from metadata transfer)
  heading_path: string[] | null
  heading_level: number | null
  page_start: number | null
  page_end: number | null
  page_label: string | null
  section_marker: string | null
  bboxes: Json | null

  // Metadata transfer quality (NEW in migration 050)
  /** Number of Docling chunks that overlapped (0 = interpolated) */
  metadata_overlap_count: number | null

  /** Confidence in metadata transfer (high/medium/low based on overlaps) */
  metadata_confidence: 'high' | 'medium' | 'low' | null

  /** True if metadata was interpolated from neighbors (no overlaps found) */
  metadata_interpolated: boolean | null

  // Chunk validation fields (migration 047)
  position_method: string | null
  position_confidence: string | null
  position_corrected: boolean | null
  position_validated: boolean | null
  overlap_corrected: boolean | null
  validation_warning: string | null
  validation_details: Json | null
  correction_history: Json | null

  // Metadata enrichment (PydanticAI + Ollama)
  themes: Json | null
  importance_score: number | null
  summary: string | null
  emotional_metadata: Json | null
  conceptual_metadata: Json | null
  domain_metadata: Json | null
  metadata_extracted_at: string | null

  // Embeddings (Transformers.js)
  embedding: string | null

  // Reprocessing support
  is_current: boolean
  reprocessing_batch: string | null
}

/**
 * Insert type for chunks table.
 * Most fields are optional with database defaults.
 */
export interface ChunkInsert {
  id?: string
  document_id?: string | null
  content: string
  chunk_index: number
  created_at?: string | null

  start_offset?: number | null
  end_offset?: number | null
  word_count?: number | null

  // Chunker tracking (defaults to 'hybrid')
  token_count?: number | null
  chunker_type?: ChunkerType

  heading_path?: string[] | null
  heading_level?: number | null
  page_start?: number | null
  page_end?: number | null
  page_label?: string | null
  section_marker?: string | null
  bboxes?: Json | null

  // Metadata transfer quality (defaults: 0, 'high', false)
  metadata_overlap_count?: number | null
  metadata_confidence?: 'high' | 'medium' | 'low' | null
  metadata_interpolated?: boolean | null

  position_method?: string | null
  position_confidence?: string | null
  position_corrected?: boolean | null
  position_validated?: boolean | null
  overlap_corrected?: boolean | null
  validation_warning?: string | null
  validation_details?: Json | null
  correction_history?: Json | null

  themes?: Json | null
  importance_score?: number | null
  summary?: string | null
  emotional_metadata?: Json | null
  conceptual_metadata?: Json | null
  domain_metadata?: Json | null
  metadata_extracted_at?: string | null

  embedding?: string | null

  is_current?: boolean
  reprocessing_batch?: string | null
}

/**
 * Update type for chunks table.
 * All fields are optional.
 */
export interface ChunkUpdate {
  id?: string
  document_id?: string | null
  content?: string
  chunk_index?: number
  created_at?: string | null

  start_offset?: number | null
  end_offset?: number | null
  word_count?: number | null

  token_count?: number | null
  chunker_type?: ChunkerType

  heading_path?: string[] | null
  heading_level?: number | null
  page_start?: number | null
  page_end?: number | null
  page_label?: string | null
  section_marker?: string | null
  bboxes?: Json | null

  metadata_overlap_count?: number | null
  metadata_confidence?: 'high' | 'medium' | 'low' | null
  metadata_interpolated?: boolean | null

  position_method?: string | null
  position_confidence?: string | null
  position_corrected?: boolean | null
  position_validated?: boolean | null
  overlap_corrected?: boolean | null
  validation_warning?: string | null
  validation_details?: Json | null
  correction_history?: Json | null

  themes?: Json | null
  importance_score?: number | null
  summary?: string | null
  emotional_metadata?: Json | null
  conceptual_metadata?: Json | null
  domain_metadata?: Json | null
  metadata_extracted_at?: string | null

  embedding?: string | null

  is_current?: boolean
  reprocessing_batch?: string | null
}

// ============================================================================
// Document Table
// ============================================================================

/**
 * Document row from database.
 * Represents an uploaded document with processing metadata.
 *
 * New fields (migration 050):
 * - chunker_type: User-selected Chonkie strategy for this document
 */
export interface Document {
  // Primary fields
  id: string
  user_id: string
  title: string
  storage_path: string
  created_at: string | null
  updated_at: string | null

  // Document metadata
  author: string | null
  description: string | null
  document_type: string | null
  language: string | null
  page_count: number | null
  word_count: number | null

  // Publishing metadata
  publisher: string | null
  publication_date: string | null
  publication_year: number | null
  isbn: string | null
  doi: string | null

  // Source information
  source_type: string | null
  source_url: string | null
  source_metadata: Json | null
  detected_metadata: Json | null

  // Chunker selection (NEW in migration 050)
  /** User-selected Chonkie strategy (default: 'recursive') */
  chunker_type: ChunkerType | null

  // Processing status
  processing_status: string | null
  processing_stage: string | null
  processing_requested: boolean | null
  processing_started_at: string | null
  processing_completed_at: string | null
  processing_error: string | null

  // Review workflow
  review_stage: string | null

  // Storage paths
  markdown_path: string | null
  markdown_available: boolean | null
  embeddings_available: boolean | null
  cover_image_url: string | null

  // Document structure
  outline: Json | null
  metadata: Json | null

  // Integration
  obsidian_path: string | null
}

/**
 * Insert type for documents table.
 */
export interface DocumentInsert {
  id?: string
  user_id: string
  title: string
  storage_path: string
  created_at?: string | null
  updated_at?: string | null

  author?: string | null
  description?: string | null
  document_type?: string | null
  language?: string | null
  page_count?: number | null
  word_count?: number | null

  publisher?: string | null
  publication_date?: string | null
  publication_year?: number | null
  isbn?: string | null
  doi?: string | null

  source_type?: string | null
  source_url?: string | null
  source_metadata?: Json | null
  detected_metadata?: Json | null

  chunker_type?: ChunkerType | null

  processing_status?: string | null
  processing_stage?: string | null
  processing_requested?: boolean | null
  processing_started_at?: string | null
  processing_completed_at?: string | null
  processing_error?: string | null

  review_stage?: string | null

  markdown_path?: string | null
  markdown_available?: boolean | null
  embeddings_available?: boolean | null
  cover_image_url?: string | null

  outline?: Json | null
  metadata?: Json | null

  obsidian_path?: string | null
}

/**
 * Update type for documents table.
 */
export interface DocumentUpdate {
  id?: string
  user_id?: string
  title?: string
  storage_path?: string
  created_at?: string | null
  updated_at?: string | null

  author?: string | null
  description?: string | null
  document_type?: string | null
  language?: string | null
  page_count?: number | null
  word_count?: number | null

  publisher?: string | null
  publication_date?: string | null
  publication_year?: number | null
  isbn?: string | null
  doi?: string | null

  source_type?: string | null
  source_url?: string | null
  source_metadata?: Json | null
  detected_metadata?: Json | null

  chunker_type?: ChunkerType | null

  processing_status?: string | null
  processing_stage?: string | null
  processing_requested?: boolean | null
  processing_started_at?: string | null
  processing_completed_at?: string | null
  processing_error?: string | null

  review_stage?: string | null

  markdown_path?: string | null
  markdown_available?: boolean | null
  embeddings_available?: boolean | null
  cover_image_url?: string | null

  outline?: Json | null
  metadata?: Json | null

  obsidian_path?: string | null
}

// ============================================================================
// User Preferences Table
// ============================================================================

/**
 * User preferences row from database.
 * Stores engine weights and chunker preferences.
 *
 * New fields (migration 050):
 * - default_chunker_type: User's default Chonkie strategy preference
 */
export interface UserPreferences {
  id: string
  user_id: string
  created_at: string
  last_modified: string

  // Engine weights for connection detection
  engine_weights: Json
  normalization_method: string
  preset_name: string | null
  custom_presets: Json | null

  // Default chunker preference (NEW in migration 050)
  /** User's default Chonkie strategy (default: 'recursive') */
  default_chunker_type: ChunkerType | null
}

/**
 * Insert type for user_preferences table.
 */
export interface UserPreferencesInsert {
  id?: string
  user_id: string
  created_at?: string
  last_modified?: string

  engine_weights?: Json
  normalization_method?: string
  preset_name?: string | null
  custom_presets?: Json | null

  default_chunker_type?: ChunkerType | null
}

/**
 * Update type for user_preferences table.
 */
export interface UserPreferencesUpdate {
  id?: string
  user_id?: string
  created_at?: string
  last_modified?: string

  engine_weights?: Json
  normalization_method?: string
  preset_name?: string | null
  custom_presets?: Json | null

  default_chunker_type?: ChunkerType | null
}

// ============================================================================
// Background Jobs Table
// ============================================================================

/**
 * Background job row from database.
 * Tracks async processing jobs.
 */
export interface BackgroundJob {
  id: string
  user_id: string
  job_type: string
  status: string | null
  created_at: string | null
  started_at: string | null
  completed_at: string | null

  entity_id: string | null
  entity_type: string | null

  input_data: Json | null
  output_data: Json | null
  metadata: Json | null
  progress: Json | null

  error_message: string | null
  error_type: string | null
  last_error: string | null

  retry_count: number | null
  max_retries: number | null
  next_retry_at: string | null

  // Pause/Resume fields (added in migration 052)
  paused_at: string | null
  resumed_at: string | null
  pause_reason: string | null
  resume_count: number | null
  last_checkpoint_path: string | null
  last_checkpoint_stage: string | null
  checkpoint_hash: string | null
}

// ============================================================================
// Cached Chunks Table
// ============================================================================

/**
 * Cached chunks row from database.
 * Stores original Docling chunks for zero-cost reprocessing.
 */
export interface CachedChunks {
  id: string
  document_id: string
  created_at: string
  updated_at: string

  chunks: Json
  structure: Json
  markdown_hash: string
  extraction_mode: string
  docling_version: string | null
}
