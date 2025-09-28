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
    chunkId: string
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
  color: 'yellow' | 'green' | 'blue' | 'red' | 'purple'
  range: {
    startOffset: number
    endOffset: number
    chunkId: string
  }
  textContext: TextContext
}

/**
 * Position component data (fuzzy matching metadata).
 */
export interface PositionData {
  chunkId: string
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
  chunk_id: string
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
 * Chunk data structure from database.
 */
export interface Chunk {
  id: string
  content: string
  chunk_index: number
  start_offset?: number
  end_offset?: number
  position_context?: {
    confidence: number
    method: 'exact' | 'fuzzy' | 'approximate'
    context_before: string
    context_after: string
  }
}

/**
 * Synthesis engine types (7 engines from APP_VISION.md).
 */
export type SynthesisEngine =
  | 'semantic'
  | 'thematic'
  | 'structural'
  | 'contradiction'
  | 'emotional'
  | 'methodological'
  | 'temporal'

/**
 * Engine weight configuration (0.0-1.0 per engine).
 */
export interface EngineWeights {
  semantic: number
  thematic: number
  structural: number
  contradiction: number
  emotional: number
  methodological: number
  temporal: number
}

/**
 * Weight preset names.
 */
export type WeightPreset = 'max-friction' | 'thematic-focus' | 'balanced' | 'chaos'

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