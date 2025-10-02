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
}

export interface ChunkRefComponent {
  /** Chunk ID this annotation relates to */
  chunkId: string;
  /** Chunk ID (duplicate for ECS filtering) */
  chunk_id: string;
  /** Position within the chunk */
  chunkPosition: number;
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
    (temporal.lastViewedAt === undefined || typeof temporal.lastViewedAt === 'string')
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
    typeof ref.chunkPosition === 'number'
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
