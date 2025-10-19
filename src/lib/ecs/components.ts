/**
 * Type-safe annotation component definitions for ECS
 *
 * Each annotation is an entity with 5 components:
 * - Position: Where in the document
 * - Visual: How it's displayed
 * - Content: What the user wrote
 * - Temporal: When it was created/viewed
 * - ChunkRef: Which chunk it relates to
 */

// ============================================
// COMPONENT INTERFACES
// ============================================

export interface PositionComponent {
  /** Document ID for this annotation */
  documentId: string;
  /** Document ID (duplicate for ECS filtering) */
  document_id: string;
  /** Character offset where annotation starts */
  startOffset: number;
  /** Character offset where annotation ends */
  endOffset: number;
  /** Original selected text */
  originalText: string;
  /** Page label if available (e.g., "iv", "42", "A-3") */
  pageLabel?: string;

  // Fuzzy matching fields for annotation recovery (migration 033)
  /** Surrounding text for context-guided fuzzy matching (±100 chars) */
  textContext?: {
    before: string;
    after: string;
  };
  /** Original chunk index for chunk-bounded search (50-75x performance boost) */
  originalChunkIndex?: number;
  /** Fuzzy match confidence (0.0-1.0). >0.85=auto-recovered, 0.75-0.85=needs review, <0.75=lost */
  recoveryConfidence?: number;
  /** Matching tier used: exact, context, chunk_bounded, or lost */
  recoveryMethod?: 'exact' | 'context' | 'chunk_bounded' | 'lost';
  /** True if fuzzy match needs manual review (confidence 0.75-0.85) */
  needsReview?: boolean;
}

export interface VisualComponent {
  /** Visual type of annotation */
  type: 'highlight' | 'underline' | 'margin-note' | 'comment';
  /** Highlight color */
  color: 'yellow' | 'green' | 'blue' | 'red' | 'purple' | 'orange' | 'pink';
}

export interface ContentComponent {
  /** User's note text (optional) */
  note?: string;
  /** User-defined tags */
  tags: string[];
}

export interface TemporalComponent {
  /** When annotation was created */
  createdAt: string;
  /** When annotation was last updated */
  updatedAt: string;
  /** When annotation was last viewed (for analytics) */
  lastViewedAt?: string;
  /** When entity was last recovered after document reprocessing */
  lastRecoveredAt?: string;
}

export interface ChunkRefComponent {
  /** Chunk ID this annotation/spark relates to */
  chunkId: string;
  /** Chunk ID (duplicate for ECS filtering) */
  chunk_id: string;
  /** Position within the chunk */
  chunkPosition: number;

  // Multi-chunk annotation support (migration 030)
  /** Array of chunk IDs for annotations spanning multiple chunks */
  chunkIds?: string[];

  // Document reference (NEW - for sparks and future entities)
  /** Document ID (application use) */
  documentId?: string;
  /** Document ID (duplicate for ECS filtering) */
  document_id?: string;

  // Selection tracking (NEW - for selection-based sparks)
  /** Whether this entity has text selections */
  hasSelections?: boolean;
}

// ============================================
// SPARK COMPONENT INTERFACES
// ============================================

/** Text selection within a spark (multiple selections supported) */
export interface SparkSelection {
  /** Selected text content */
  text: string;
  /** Chunk ID where selection was made */
  chunkId: string;
  /** Start offset within chunk */
  startOffset: number;
  /** End offset within chunk */
  endOffset: number;
  /** Document-level offset (for recovery) */
  documentOffset?: number;

  // Recovery fields (like annotations)
  /** Surrounding text for context-guided fuzzy matching (±100 chars) */
  textContext?: {
    before: string;
    after: string;
  };
  /** Fuzzy match confidence (0.0-1.0). >0.85=auto-recovered, 0.75-0.85=needs review, <0.75=lost */
  recoveryConfidence?: number;
  /** Matching tier used: exact, context, chunk_bounded, or lost */
  recoveryMethod?: 'exact' | 'context' | 'chunk_bounded' | 'semantic' | 'lost';
}

/** Connection stored within spark component (NOT connections table) */
export interface SparkConnection {
  /** Target chunk ID */
  chunkId: string;
  /** Connection type */
  type: 'origin' | 'mention' | 'inherited';
  /** Connection strength (0.0-1.0) */
  strength: number;
  /** Additional metadata */
  metadata?: {
    inheritedFrom?: string;
    originalStrength?: number;
    originalType?: string;
    mentionedInContent?: boolean;
    relationship?: string;
  };
}

/** Spark component data (spark-specific) */
export interface SparkComponent {
  /** Multiple text selections (can be empty for thought-only sparks) */
  selections: SparkSelection[];
  /** Connections to other chunks */
  connections: SparkConnection[];

  // Annotation references (NEW - Phase 6b)
  /** Array of annotation entity IDs linked to this spark */
  annotationRefs?: string[];

  // Recovery metadata
  /** True if origin chunk no longer exists after reprocessing */
  orphaned?: boolean;
  /** Overall recovery confidence after reprocessing */
  recoveryConfidence?: number;
  /** How spark was recovered: 'selections' | 'semantic' | 'context' | 'orphaned' */
  recoveryMethod?: 'selections' | 'semantic' | 'context' | 'orphaned';
  /** True if spark needs manual review after recovery */
  needsReview?: boolean;

  // Original context (for recovery)
  /** First 500 chars of origin chunk (for semantic matching) */
  originalChunkContent?: string;
  /** SHA-256 hash of origin chunk (for exact matching) */
  originalChunkHash?: string;
}

// ============================================
// COMPLETE ANNOTATION ENTITY
// ============================================

/**
 * Complete annotation entity with all components
 */
export interface AnnotationEntity {
  /** Entity ID */
  id: string;
  /** User who owns this annotation */
  user_id: string;
  /** When entity was created */
  created_at: string;
  /** When entity was last updated */
  updated_at: string;
  /** All annotation components */
  components: {
    Position: PositionComponent;
    Visual: VisualComponent;
    Content: ContentComponent;
    Temporal: TemporalComponent;
    ChunkRef: ChunkRefComponent;
  };
}

// ============================================
// COMPLETE SPARK ENTITY
// ============================================

/**
 * Complete spark entity with all components
 * 4-component pattern: Spark, Content, Temporal, ChunkRef
 */
export interface SparkEntity {
  /** Entity ID */
  id: string;
  /** User who owns this spark */
  user_id: string;
  /** When entity was created */
  created_at: string;
  /** When entity was last updated */
  updated_at: string;
  /** All spark components */
  components: {
    Spark: SparkComponent;
    Content: ContentComponent;
    Temporal: TemporalComponent;
    ChunkRef: ChunkRefComponent;
  };
}

// ============================================
// VALIDATION
// ============================================

/**
 * Validates that an object has all required annotation components
 */
export const validateAnnotationComponents = (
  components: Record<string, unknown>
): components is AnnotationEntity['components'] => {
  return (
    components.Position !== undefined &&
    components.Visual !== undefined &&
    components.Content !== undefined &&
    components.Temporal !== undefined &&
    components.ChunkRef !== undefined
  );
};

/**
 * Validates a Position component structure
 */
export const validatePositionComponent = (
  data: unknown
): data is PositionComponent => {
  if (typeof data !== 'object' || data === null) return false;
  const pos = data as Record<string, unknown>;

  return (
    typeof pos.documentId === 'string' &&
    typeof pos.document_id === 'string' &&
    typeof pos.startOffset === 'number' &&
    typeof pos.endOffset === 'number' &&
    typeof pos.originalText === 'string' &&
    (pos.pageLabel === undefined || typeof pos.pageLabel === 'string')
  );
};

/**
 * Validates a Visual component structure
 */
export const validateVisualComponent = (
  data: unknown
): data is VisualComponent => {
  if (typeof data !== 'object' || data === null) return false;
  const vis = data as Record<string, unknown>;

  const validTypes = ['highlight', 'underline', 'margin-note', 'comment'];
  const validColors = ['yellow', 'green', 'blue', 'red', 'purple', 'orange', 'pink'];

  return (
    typeof vis.type === 'string' && validTypes.includes(vis.type) &&
    typeof vis.color === 'string' && validColors.includes(vis.color)
  );
};

/**
 * Validates a Content component structure
 */
export const validateContentComponent = (
  data: unknown
): data is ContentComponent => {
  if (typeof data !== 'object' || data === null) return false;
  const content = data as Record<string, unknown>;

  return (
    (content.note === undefined || typeof content.note === 'string') &&
    Array.isArray(content.tags) &&
    content.tags.every((tag) => typeof tag === 'string')
  );
};

/**
 * Validates a Temporal component structure
 */
export const validateTemporalComponent = (
  data: unknown
): data is TemporalComponent => {
  if (typeof data !== 'object' || data === null) return false;
  const temporal = data as Record<string, unknown>;

  return (
    typeof temporal.createdAt === 'string' &&
    typeof temporal.updatedAt === 'string' &&
    (temporal.lastViewedAt === undefined || typeof temporal.lastViewedAt === 'string') &&
    (temporal.lastRecoveredAt === undefined || typeof temporal.lastRecoveredAt === 'string')
  );
};

/**
 * Validates a ChunkRef component structure
 */
export const validateChunkRefComponent = (
  data: unknown
): data is ChunkRefComponent => {
  if (typeof data !== 'object' || data === null) return false;
  const ref = data as Record<string, unknown>;

  return (
    typeof ref.chunkId === 'string' &&
    typeof ref.chunk_id === 'string' &&
    typeof ref.chunkPosition === 'number' &&
    // Optional fields
    (ref.chunkIds === undefined || Array.isArray(ref.chunkIds)) &&
    (ref.documentId === undefined || typeof ref.documentId === 'string') &&
    (ref.document_id === undefined || typeof ref.document_id === 'string') &&
    (ref.hasSelections === undefined || typeof ref.hasSelections === 'boolean')
  );
};

/**
 * Validates a Spark component structure
 */
export const validateSparkComponent = (
  data: unknown
): data is SparkComponent => {
  if (typeof data !== 'object' || data === null) return false;
  const spark = data as Record<string, unknown>;

  // selections must be array
  if (!Array.isArray(spark.selections)) return false;

  // connections must be array
  if (!Array.isArray(spark.connections)) return false;

  // Optional fields
  const validMethods = ['selections', 'semantic', 'context', 'orphaned'];
  if (
    spark.recoveryMethod !== undefined &&
    (typeof spark.recoveryMethod !== 'string' || !validMethods.includes(spark.recoveryMethod))
  ) {
    return false;
  }

  // Validate annotationRefs if present (optional array of strings)
  if (
    spark.annotationRefs !== undefined &&
    (!Array.isArray(spark.annotationRefs) || !spark.annotationRefs.every(ref => typeof ref === 'string'))
  ) {
    return false;
  }

  return true;
};

/**
 * Validates that an object has all required spark components
 */
export const validateSparkComponents = (
  components: Record<string, unknown>
): components is SparkEntity['components'] => {
  return (
    components.Spark !== undefined &&
    components.Content !== undefined &&
    components.Temporal !== undefined &&
    components.ChunkRef !== undefined
  );
};

// ============================================
// TYPE GUARDS
// ============================================

/**
 * Type guard for AnnotationEntity
 */
export const isAnnotationEntity = (
  entity: unknown
): entity is AnnotationEntity => {
  if (typeof entity !== 'object' || entity === null) return false;
  const ann = entity as Record<string, unknown>;

  return (
    typeof ann.id === 'string' &&
    typeof ann.user_id === 'string' &&
    typeof ann.created_at === 'string' &&
    typeof ann.updated_at === 'string' &&
    typeof ann.components === 'object' &&
    ann.components !== null &&
    validateAnnotationComponents(ann.components as Record<string, unknown>)
  );
};

/**
 * Type guard for SparkEntity
 */
export const isSparkEntity = (
  entity: unknown
): entity is SparkEntity => {
  if (typeof entity !== 'object' || entity === null) return false;
  const spark = entity as Record<string, unknown>;

  return (
    typeof spark.id === 'string' &&
    typeof spark.user_id === 'string' &&
    typeof spark.created_at === 'string' &&
    typeof spark.updated_at === 'string' &&
    typeof spark.components === 'object' &&
    spark.components !== null &&
    validateSparkComponents(spark.components as Record<string, unknown>)
  );
};
