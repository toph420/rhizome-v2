/**
 * Annotation operations built on top of ECS
 *
 * Provides type-safe CRUD operations for annotation entities.
 * Each annotation is an entity with 5 components: Position, Visual, Content, Temporal, ChunkRef
 */

import { ECS, type Entity, type Component } from './ecs';
import type {
  AnnotationEntity,
  PositionComponent,
  VisualComponent,
  ContentComponent,
  TemporalComponent,
  ChunkRefComponent,
} from './components';

// ============================================
// INPUT TYPES
// ============================================

export interface CreateAnnotationInput {
  /** Document ID */
  documentId: string;
  /** Start character offset */
  startOffset: number;
  /** End character offset */
  endOffset: number;
  /** Original selected text */
  originalText: string;
  /** Array of chunk IDs (multi-chunk support) */
  chunkIds: string[];
  /** Position within the chunk */
  chunkPosition?: number;
  /** Visual type */
  type: VisualComponent['type'];
  /** Highlight color (optional, defaults to yellow) */
  color?: VisualComponent['color'];
  /** User's note (optional) */
  note?: string;
  /** Tags (optional) */
  tags?: string[];
  /** Page label if available (optional) */
  pageLabel?: string;

  // PDF coordinate fields (optional - for PDF annotations)
  /** PDF page number (1-indexed) */
  pdfPageNumber?: number;
  /** Multiple rectangles for multi-line selections */
  pdfRects?: Array<{
    x: number;
    y: number;
    width: number;
    height: number;
    pageNumber: number;
  }>;
  /** Legacy single rect coordinates */
  pdfX?: number;
  /** Y coordinate in PDF coordinate system */
  pdfY?: number;
  /** Selection width in PDF coordinates */
  pdfWidth?: number;
  /** Selection height in PDF coordinates */
  pdfHeight?: number;

  // Recovery metadata
  /** Surrounding text for context-guided fuzzy matching (±100 chars) */
  textContext?: {
    before: string;
    after: string;
  };
  /** Original chunk index for chunk-bounded search */
  originalChunkIndex?: number;

  // PDF ↔ Markdown sync metadata
  /** Confidence score for PDF↔Markdown offset mapping (0.0-1.0) */
  syncConfidence?: number;
  /** Method used to calculate markdown offsets from PDF coordinates */
  syncMethod?: 'exact' | 'fuzzy' | 'bbox' | 'manual';

  // Spark references
  /** Array of spark entity IDs linked to this annotation */
  sparkRefs?: string[];
}

export interface UpdateAnnotationInput {
  /** Update note text */
  note?: string;
  /** Update tags */
  tags?: string[];
  /** Update color */
  color?: VisualComponent['color'];
  /** Update visual type */
  type?: VisualComponent['type'];
}

// ============================================
// ANNOTATION OPERATIONS
// ============================================

export class AnnotationOperations {
  constructor(
    private ecs: ECS,
    private userId: string
  ) {}

  /**
   * Create a new annotation entity.
   *
   * @param input - Annotation creation parameters
   * @returns Entity ID of the created annotation
   *
   * @example
   * ```typescript
   * const id = await ops.create({
   *   documentId: 'doc-123',
   *   startOffset: 100,
   *   endOffset: 200,
   *   originalText: 'Selected text',
   *   chunkId: 'chunk-456',
   *   chunkPosition: 0,
   *   type: 'highlight',
   *   color: 'yellow',
   *   note: 'Important passage',
   *   tags: ['key-concept'],
   *   pageLabel: '42'
   * });
   * ```
   */
  async create(input: CreateAnnotationInput): Promise<string> {
    const now = new Date().toISOString();
    const primaryChunkId = input.chunkIds[0];

    const entityId = await this.ecs.createEntity(this.userId, {
      Position: {
        documentId: input.documentId,
        document_id: input.documentId, // For ECS filtering
        startOffset: input.startOffset,
        endOffset: input.endOffset,
        originalText: input.originalText,
        pageLabel: input.pageLabel,
        textContext: input.textContext,
        originalChunkIndex: input.originalChunkIndex,
        // PDF coordinate fields (optional)
        pdfPageNumber: input.pdfPageNumber ?? null,
        pdfRects: input.pdfRects ?? null, // Multiple rects for multi-line
        pdfX: input.pdfX ?? null,
        pdfY: input.pdfY ?? null,
        pdfWidth: input.pdfWidth ?? null,
        pdfHeight: input.pdfHeight ?? null,
        // Recovery fields initialized
        recoveryConfidence: 1.0,
        recoveryMethod: 'exact',
        needsReview: false,
        // PDF ↔ Markdown sync metadata
        syncConfidence: input.syncConfidence,
        syncMethod: input.syncMethod,
        syncNeedsReview: input.syncConfidence ? input.syncConfidence < 0.85 : false,
      },
      Visual: {
        type: input.type,
        color: input.color || 'yellow',
      },
      Content: {
        note: input.note,
        tags: input.tags || [],
      },
      Temporal: {
        createdAt: now,
        updatedAt: now,
      },
      ChunkRef: {
        chunkId: primaryChunkId,
        chunk_id: primaryChunkId, // For ECS filtering
        chunkIds: input.chunkIds, // Full array for multi-chunk support
        chunkPosition: input.chunkPosition ?? 0,
        documentId: input.documentId,
        document_id: input.documentId, // For ECS filtering
      },
    }, 'annotation');

    return entityId;
  }

  /**
   * Get all annotations for a document.
   *
   * @param documentId - Document ID to query
   * @returns Array of annotation entities
   */
  async getByDocument(documentId: string): Promise<AnnotationEntity[]> {
    // Query for Position component to get only annotations (not sparks)
    // Position component is unique to annotations
    const entities = await this.ecs.query(
      ['Position'], // Filter for Position component (annotations only)
      this.userId,
      { document_id: documentId }
    );

    return entities.map(this.mapToAnnotation);
  }

  /**
   * Get annotations in a specific offset range.
   * Useful for viewport-based queries.
   *
   * @param documentId - Document ID
   * @param startOffset - Start of range
   * @param endOffset - End of range
   * @returns Annotations that overlap with this range
   */
  async getInRange(
    documentId: string,
    startOffset: number,
    endOffset: number
  ): Promise<AnnotationEntity[]> {
    const entities = await this.getByDocument(documentId);

    return entities.filter((ann) => {
      const pos = this.getComponent<PositionComponent>(ann, 'Position');
      // Check if annotation overlaps with the range
      return (
        pos.startOffset < endOffset &&
        pos.endOffset > startOffset
      );
    });
  }

  /**
   * Get annotations on a specific page.
   *
   * @param documentId - Document ID
   * @param pageLabel - Page label to filter by
   * @returns Annotations on this page
   */
  async getByPage(
    documentId: string,
    pageLabel: string
  ): Promise<AnnotationEntity[]> {
    const entities = await this.getByDocument(documentId);

    return entities.filter((ann) => {
      const pos = this.getComponent<PositionComponent>(ann, 'Position');
      return pos.pageLabel === pageLabel;
    });
  }

  /**
   * Update annotation content.
   *
   * @param entityId - Entity ID of the annotation
   * @param updates - Fields to update
   *
   * @example
   * ```typescript
   * await ops.update('ent-123', {
   *   note: 'Updated note',
   *   tags: ['new-tag'],
   *   color: 'blue'
   * });
   * ```
   */
  async update(
    entityId: string,
    updates: UpdateAnnotationInput
  ): Promise<void> {
    const entity = await this.ecs.getEntity(entityId, this.userId);
    if (!entity) {
      throw new Error('Annotation not found');
    }

    const components = this.extractComponents(entity);

    // Update Content component
    if (updates.note !== undefined || updates.tags !== undefined) {
      const contentComponent = components.find(
        (c) => c.component_type === 'Content'
      );
      if (contentComponent) {
        await this.ecs.updateComponent(
          contentComponent.id,
          {
            ...contentComponent.data,
            note: updates.note ?? contentComponent.data.note,
            tags: updates.tags ?? contentComponent.data.tags,
          },
          this.userId
        );
      }
    }

    // Update Visual component
    if (updates.color !== undefined || updates.type !== undefined) {
      const visualComponent = components.find(
        (c) => c.component_type === 'Visual'
      );
      if (visualComponent) {
        await this.ecs.updateComponent(
          visualComponent.id,
          {
            ...visualComponent.data,
            color: updates.color ?? visualComponent.data.color,
            type: updates.type ?? visualComponent.data.type,
          },
          this.userId
        );
      }
    }

    // Update Temporal.updatedAt
    const temporalComponent = components.find(
      (c) => c.component_type === 'Temporal'
    );
    if (temporalComponent) {
      await this.ecs.updateComponent(
        temporalComponent.id,
        {
          ...temporalComponent.data,
          updatedAt: new Date().toISOString(),
        },
        this.userId
      );
    }
  }

  /**
   * Mark annotation as viewed (updates lastViewedAt).
   * Useful for reading analytics.
   *
   * @param entityId - Entity ID of the annotation
   */
  async markViewed(entityId: string): Promise<void> {
    const entity = await this.ecs.getEntity(entityId, this.userId);
    if (!entity) return;

    const components = this.extractComponents(entity);
    const temporalComponent = components.find(
      (c) => c.component_type === 'Temporal'
    );

    if (temporalComponent) {
      await this.ecs.updateComponent(
        temporalComponent.id,
        {
          ...temporalComponent.data,
          lastViewedAt: new Date().toISOString(),
        },
        this.userId
      );
    }
  }

  /**
   * Delete annotation.
   *
   * @param entityId - Entity ID to delete
   */
  async delete(entityId: string): Promise<void> {
    await this.ecs.deleteEntity(entityId, this.userId);
  }

  /**
   * Search annotations by text (in originalText, note, or tags).
   *
   * @param documentId - Document ID to search in
   * @param query - Search query
   * @returns Matching annotations
   */
  async search(
    documentId: string,
    query: string
  ): Promise<AnnotationEntity[]> {
    const entities = await this.getByDocument(documentId);
    const lowerQuery = query.toLowerCase();

    return entities.filter((ann) => {
      const pos = this.getComponent<PositionComponent>(ann, 'Position');
      const content = this.getComponent<ContentComponent>(ann, 'Content');

      return (
        pos.originalText.toLowerCase().includes(lowerQuery) ||
        content.note?.toLowerCase().includes(lowerQuery) ||
        content.tags.some((tag) => tag.toLowerCase().includes(lowerQuery))
      );
    });
  }

  /**
   * Add spark reference to annotation
   */
  async addSparkRef(annotationId: string, sparkId: string): Promise<void> {
    const entity = await this.ecs.getEntity(annotationId, this.userId);
    if (!entity) throw new Error('Annotation not found');

    const components = this.extractComponents(entity);
    const contentComponent = components.find(c => c.component_type === 'Content');

    if (contentComponent) {
      const currentData = contentComponent.data as ContentComponent & { sparkRefs?: string[] };
      const currentRefs = currentData.sparkRefs || [];
      if (currentRefs.includes(sparkId)) return;

      await this.ecs.updateComponent(
        contentComponent.id,
        {
          ...contentComponent.data,
          sparkRefs: [...currentRefs, sparkId],
        },
        this.userId
      );
    }

    // Update Temporal.updatedAt
    const temporalComponent = components.find(c => c.component_type === 'Temporal');
    if (temporalComponent) {
      await this.ecs.updateComponent(
        temporalComponent.id,
        { ...temporalComponent.data, updatedAt: new Date().toISOString() },
        this.userId
      );
    }
  }

  /**
   * Update annotation after recovery process
   */
  async updateAfterRecovery(
    entityId: string,
    chunkId: string,
    confidence: number,
    method: string
  ): Promise<void> {
    const entity = await this.ecs.getEntity(entityId, this.userId);
    if (!entity) throw new Error('Annotation not found');

    const components = this.extractComponents(entity);
    const positionComponent = components.find(c => c.component_type === 'Position');

    if (positionComponent) {
      await this.ecs.updateComponent(
        positionComponent.id,
        {
          ...positionComponent.data,
          recoveryConfidence: confidence,
          recoveryMethod: method,
          needsReview: confidence >= 0.70 && confidence < 0.85,
        },
        this.userId
      );
    }

    // Update ChunkRef if chunk changed
    const chunkRefComponent = components.find(c => c.component_type === 'ChunkRef');
    if (chunkRefComponent && chunkRefComponent.data.chunkId !== chunkId) {
      await this.ecs.updateComponent(
        chunkRefComponent.id,
        {
          ...chunkRefComponent.data,
          chunkId,
          chunk_id: chunkId,
          chunkIds: [chunkId], // Update array too
        },
        this.userId
      );
    }

    // Update Temporal.lastRecoveredAt
    const temporalComponent = components.find(c => c.component_type === 'Temporal');
    if (temporalComponent) {
      await this.ecs.updateComponent(
        temporalComponent.id,
        {
          ...temporalComponent.data,
          lastRecoveredAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        this.userId
      );
    }
  }

  /**
   * Mark annotation as orphaned (recovery failed)
   */
  async markOrphaned(entityId: string): Promise<void> {
    await this.updateAfterRecovery(entityId, '', 0, 'lost');
  }

  /**
   * Get annotations needing review
   */
  async getNeedingReview(documentId: string): Promise<AnnotationEntity[]> {
    const allAnnotations = await this.getByDocument(documentId);

    return allAnnotations.filter(ann => {
      const position = this.getComponent<PositionComponent>(ann, 'Position');
      return position.needsReview === true;
    });
  }

  // ============================================
  // HELPER METHODS
  // ============================================

  /**
   * Maps raw ECS entity to typed AnnotationEntity
   */
  private mapToAnnotation = (entity: Entity): AnnotationEntity => {
    const components: Record<string, unknown> = {};

    if (entity.components) {
      for (const comp of entity.components) {
        components[comp.component_type] = comp.data;
      }
    }

    return {
      id: entity.id,
      user_id: entity.user_id,
      created_at: entity.created_at,
      updated_at: entity.updated_at,
      components: components as AnnotationEntity['components'],
    };
  };

  /**
   * Extracts component array from entity
   */
  private extractComponents(entity: Entity): Component[] {
    return entity.components || [];
  }

  /**
   * Gets a specific component from an annotation entity
   */
  private getComponent<T>(entity: AnnotationEntity, type: string): T {
    return (entity.components as Record<string, unknown>)[type] as T;
  }
}
