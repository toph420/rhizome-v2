/**
 * Annotation system type definitions.
 * Defines interfaces for text selection, annotation data, and connection synthesis.
 */

/**
 * Text selection captured from Range API.
 */
export interface TextSelection {
  text: string
  range: {
    startOffset: number
    endOffset: number
    chunkIds: string[]  // Array for multi-chunk selections
  }
  rect: DOMRect
}

/**
 * Text context surrounding an annotation (±5 words).
 */
export interface TextContext {
  before: string
  content: string
  after: string
}

/**
 * Annotation component data (stored in ECS).
 */
export interface AnnotationData {
  text: string
  note?: string
  tags?: string[]
  color: 'yellow' | 'green' | 'blue' | 'red' | 'purple' | 'orange' | 'pink'
  range: {
    startOffset: number
    endOffset: number
    chunkIds: string[]  // Array for multi-chunk annotations
  }
  textContext: TextContext
}

/**
 * Position component data (fuzzy matching metadata).
 */
export interface PositionData {
  chunkIds: string[]  // Array for multi-chunk annotations
  startOffset: number
  endOffset: number
  confidence: number // 0.0-1.0
  method: 'exact' | 'fuzzy' | 'approximate'
  textContext: {
    before: string
    after: string
  }
}

/**
 * Source component data (chunk/document linking).
 */
export interface SourceData {
  chunk_ids: string[]  // Array for multi-chunk annotations (connection graph)
  document_id: string
}

/**
 * Complete stored annotation entity from ECS.
 */
export interface StoredAnnotation {
  id: string
  user_id: string
  created_at: string
  updated_at: string
  components: {
    annotation?: AnnotationData
    position?: PositionData
    source?: SourceData
  }
}

/**
 * Optimistic annotation for immediate UI updates.
 * Simpler flat structure for client-side state management.
 */
export interface OptimisticAnnotation {
  id: string // Temp ID: `temp-${Date.now()}` or real UUID
  text: string
  chunk_ids: string[]
  document_id: string
  start_offset: number
  end_offset: number
  color: 'yellow' | 'green' | 'blue' | 'red' | 'purple' | 'orange' | 'pink'
  note?: string
  tags?: string[]
  text_context?: {
    before: string
    content: string
    after: string
  }
  created_at: string
  _deleted?: boolean // Flag for error rollback
}

/**
 * Chunk data structure from database.
 */
export interface Chunk {
  id: string
  content: string
  chunk_index: number
  start_offset: number  // Required for multi-chunk detection
  end_offset: number    // Required for multi-chunk detection

  // AI-extracted metadata (from migration 019)
  themes?: string[]
  summary?: string
  importance_score?: number
  emotional_metadata?: {
    polarity: number
    primaryEmotion: string
    intensity: number
  }
  conceptual_metadata?: {
    concepts: Array<{
      text: string
      importance: number
      frequency?: number
      category?: string
    }>
    relationships?: Array<{
      from: string
      to: string
      type: string
      strength: number
    }>
  }
  domain_metadata?: {
    primaryDomain: string
    confidence?: number
    technicalDepth?: number
  }

  position_context?: {
    confidence: number
    method: 'exact' | 'fuzzy' | 'approximate'
    context_before: string
    context_after: string
  }

  // Local pipeline metadata (from migration 045)
  position_confidence?: 'exact' | 'high' | 'medium' | 'synthetic'
  position_method?: string
  position_validated?: boolean
  page_start?: number | null
  page_end?: number | null
  section_marker?: string | null
}

/**
 * Synthesis engine types (3-engine system matching worker output).
 * Reduced from 7 engines to 3 focused engines for better precision.
 * @see docs/APP_VISION.md - 3-Engine System
 */
export type SynthesisEngine =
  | 'semantic_similarity'      // Embedding-based matching (25% default weight)
  | 'thematic_bridge'          // AI-powered cross-domain connections (35% default weight)
  | 'contradiction_detection'  // Metadata-based conceptual tensions (40% default weight)

/**
 * Engine weight configuration (0.0-1.0 per engine).
 * Weights determine connection priority in the sidebar.
 */
export interface EngineWeights {
  semantic_similarity: number
  thematic_bridge: number
  contradiction_detection: number
}

/**
 * Weight preset names.
 * - max-friction: Prioritizes contradictions (40%)
 * - thematic-focus: Prioritizes cross-domain bridges (60%)
 * - balanced: Equal weights across all engines (33%)
 * - semantic-only: Prioritizes embedding similarity (70%).
 */
export type WeightPreset = 'max-friction' | 'thematic-focus' | 'balanced' | 'semantic-only'

/**
 * Connection type (how the target relates to the source).
 */
export type ConnectionType =
  | 'supports'
  | 'contradicts'
  | 'extends'
  | 'references'
  | 'parallels'
  | 'challenges'

/**
 * Mock connection for testing synthesis UI.
 * Schema matches real connections table (snake_case for DB compatibility).
 */
export interface MockConnection {
  id: string
  source_chunk_id: string
  target_chunk_id: string
  target_document_title: string
  target_snippet: string
  engine_type: SynthesisEngine
  connection_type: ConnectionType
  strength: number // 0.0-1.0
  explanation: string
}

/**
 * Connection validation feedback (captured via hotkeys).
 * Stored in localStorage for MVP (migrate to database in Phase 3).
 */
export interface ConnectionFeedback {
  connection_id: string
  feedback_type: 'validate' | 'reject' | 'star'
  context: {
    time_of_day: string // ISO timestamp
    document_id: string
    mode: string // 'reading' | 'study' | 'research'
  }
}