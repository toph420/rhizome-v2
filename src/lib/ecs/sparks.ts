/**
 * Spark operations built on top of ECS
 *
 * Provides type-safe CRUD operations for spark entities.
 * Each spark is an entity with 4 components: Spark, Content, Temporal, ChunkRef
 *
 * Pattern: Follows src/lib/ecs/annotations.ts exactly
 */

import { ECS, type Entity, type Component } from './ecs';
import type {
  SparkEntity,
  SparkComponent,
  ContentComponent,
  TemporalComponent,
  ChunkRefComponent,
  SparkSelection,
  SparkConnection,
} from './components';
import { createHash } from 'crypto';

// ============================================
// INPUT TYPES
// ============================================

export interface CreateSparkInput {
  /** Spark title (auto-generated if not provided) */
  title?: string;

  /** User's spark thought/note */
  content: string;

  /** Text selections (can be empty array for thought-only sparks) */
  selections?: SparkSelection[];

  /** Tags extracted from content */
  tags?: string[];

  /** Chunk connections */
  connections: SparkConnection[];

  // ALL CONTEXT FIELDS NOW OPTIONAL (sparks can be created without document context)

  /** Primary/origin chunk ID */
  chunkId?: string | null;

  /** All visible chunk IDs (includes primary + viewport chunks + selection chunks) */
  chunkIds?: string[];

  /** Document ID */
  documentId?: string | null;

  /** Document title (denormalized for orphan detection) */
  documentTitle?: string | null;

  /** First 500 chars of origin chunk content (for recovery) */
  originChunkContent?: string;
}

export interface UpdateSparkInput {
  /** Update spark thought */
  content?: string;
  /** Update tags */
  tags?: string[];
}

// ============================================
// SPARK OPERATIONS
// ============================================

export class SparkOperations {
  constructor(
    private ecs: ECS,
    private userId: string
  ) {}

  /**
   * Create a new spark entity.
   *
   * @param input - Spark creation parameters
   * @returns Entity ID of the created spark
   *
   * @example
   * ```typescript
   * const id = await ops.create({
   *   content: 'My thought about privacy...',
   *   selections: [{
   *     text: 'privacy is dead',
   *     chunkId: 'chunk-123',
   *     startOffset: 100,
   *     endOffset: 115,
   *     textContext: { before: '...', after: '...' }
   *   }],
   *   tags: ['privacy', 'surveillance'],
   *   connections: [],
   *   chunkId: 'chunk-123',
   *   chunkIds: ['chunk-123', 'chunk-124'],
   *   documentId: 'doc-456',
   *   originChunkContent: 'First 500 chars...'
   * });
   * ```
   */
  async create(input: CreateSparkInput): Promise<string> {
    const now = new Date().toISOString();
    const selections = input.selections || [];
    const hasSelections = selections.length > 0;

    // Generate hash of origin chunk for recovery
    const chunkHash = input.originChunkContent
      ? createHash('sha256').update(input.originChunkContent).digest('hex')
      : undefined;

    // Build components object
    const components: Record<string, any> = {
      Spark: {
        title: input.title || 'Untitled',
        selections,
        connections: input.connections,
        originalChunkContent: input.originChunkContent?.slice(0, 500),
        originalChunkHash: chunkHash,
      },
      Content: {
        note: input.content,
        tags: input.tags || [],
      },
      Temporal: {
        createdAt: now,
        updatedAt: now,
      },
    };

    // Only add ChunkRef if context provided
    if (input.documentId || input.chunkId) {
      components.ChunkRef = {
        documentId: input.documentId || null,
        document_id: input.documentId || null,
        documentTitle: input.documentTitle || null,
        chunkId: input.chunkId || null,
        chunk_id: input.chunkId || null,
        chunkIds: input.chunkIds || (input.chunkId ? [input.chunkId] : []),
        chunkPosition: hasSelections ? selections[0].startOffset : 0,
        hasSelections,
      };
    }

    const entityId = await this.ecs.createEntity(this.userId, components, 'spark');
    return entityId;
  }

  /**
   * Get all sparks for a document.
   *
   * @param documentId - Document ID to query
   * @returns Array of spark entities
   */
  async getByDocument(documentId: string): Promise<SparkEntity[]> {
    // Query without component type filter to get ALL components
    // We filter by document_id which is on the components table
    const entities = await this.ecs.query(
      [], // Empty array = don't filter by component type
      this.userId,
      { document_id: documentId }
    );

    // Filter to only spark entities (have Spark component)
    const sparkEntities = entities.filter((entity) => {
      return entity.components?.some((c) => c.component_type === 'Spark');
    });

    return sparkEntities.map(this.mapToSpark);
  }

  /**
   * Get sparks by primary chunk ID.
   *
   * @param chunkId - Chunk ID to filter by
   * @returns Sparks with this as origin chunk
   */
  async getByChunk(chunkId: string): Promise<SparkEntity[]> {
    const entities = await this.ecs.query(
      [],
      this.userId,
      { chunk_id: chunkId }
    );

    const sparkEntities = entities.filter((entity) => {
      return entity.components?.some((c) => c.component_type === 'Spark');
    });

    return sparkEntities.map(this.mapToSpark);
  }

  /**
   * Get recent sparks (for timeline).
   *
   * @param limit - Maximum number of sparks to return
   * @param offset - Offset for pagination
   * @returns Recent sparks sorted by creation time
   */
  async getRecent(limit: number = 50, offset: number = 0): Promise<SparkEntity[]> {
    // NOTE: This queries ECS directly, which is slow for timelines.
    // For production use, query sparks_cache table instead.
    // This method is for fallback/debugging only.

    const entities = await this.ecs.query(
      ['Spark'], // Filter to spark entities only
      this.userId
    );

    const sparkEntities = entities
      .map(this.mapToSpark)
      .sort((a, b) => {
        const aTime = new Date(a.components.Temporal.createdAt).getTime();
        const bTime = new Date(b.components.Temporal.createdAt).getTime();
        return bTime - aTime; // Descending
      })
      .slice(offset, offset + limit);

    return sparkEntities;
  }

  /**
   * Update spark content and tags.
   *
   * @param entityId - Entity ID of the spark
   * @param updates - Fields to update
   *
   * @example
   * ```typescript
   * await ops.update('ent-123', {
   *   content: 'Updated thought',
   *   tags: ['new-tag']
   * });
   * ```
   */
  async update(
    entityId: string,
    updates: UpdateSparkInput
  ): Promise<void> {
    const entity = await this.ecs.getEntity(entityId, this.userId);
    if (!entity) {
      throw new Error('Spark not found');
    }

    const components = this.extractComponents(entity);

    // Update Content component
    if (updates.content !== undefined || updates.tags !== undefined) {
      const contentComponent = components.find(
        (c) => c.component_type === 'Content'
      );
      if (contentComponent) {
        await this.ecs.updateComponent(
          contentComponent.id,
          {
            ...contentComponent.data,
            note: updates.content ?? contentComponent.data.note,
            tags: updates.tags ?? contentComponent.data.tags,
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
   * Update spark after recovery.
   * Used by recovery handler to update ChunkRef and Spark components.
   *
   * @param entityId - Entity ID of the spark
   * @param recovery - Recovery result data
   */
  async updateAfterRecovery(
    entityId: string,
    recovery: {
      newChunkId: string;
      newChunkIds?: string[];
      confidence: number;
      method: 'selections' | 'semantic' | 'context' | 'orphaned';
      needsReview: boolean;
      updatedSelections?: SparkSelection[];
    }
  ): Promise<void> {
    const entity = await this.ecs.getEntity(entityId, this.userId);
    if (!entity) {
      throw new Error('Spark not found');
    }

    const components = this.extractComponents(entity);

    // Update ChunkRef component
    const chunkRefComponent = components.find(
      (c) => c.component_type === 'ChunkRef'
    );
    if (chunkRefComponent) {
      await this.ecs.updateComponent(
        chunkRefComponent.id,
        {
          ...chunkRefComponent.data,
          chunkId: recovery.newChunkId,
          chunk_id: recovery.newChunkId,
          chunkIds: recovery.newChunkIds || [recovery.newChunkId],
        },
        this.userId
      );
    }

    // Update Spark component with recovery metadata
    const sparkComponent = components.find(
      (c) => c.component_type === 'Spark'
    );
    if (sparkComponent) {
      await this.ecs.updateComponent(
        sparkComponent.id,
        {
          ...sparkComponent.data,
          selections: recovery.updatedSelections || sparkComponent.data.selections,
          recoveryConfidence: recovery.confidence,
          recoveryMethod: recovery.method,
          needsReview: recovery.needsReview,
          orphaned: recovery.method === 'orphaned',
        },
        this.userId
      );
    }

    // Update Temporal.lastRecoveredAt
    const temporalComponent = components.find(
      (c) => c.component_type === 'Temporal'
    );
    if (temporalComponent) {
      await this.ecs.updateComponent(
        temporalComponent.id,
        {
          ...temporalComponent.data,
          lastRecoveredAt: new Date().toISOString(),
        },
        this.userId
      );
    }
  }

  /**
   * Mark spark as orphaned (origin chunk no longer exists).
   *
   * @param entityId - Entity ID of the spark
   */
  async markOrphaned(entityId: string): Promise<void> {
    const entity = await this.ecs.getEntity(entityId, this.userId);
    if (!entity) return;

    const components = this.extractComponents(entity);
    const sparkComponent = components.find(
      (c) => c.component_type === 'Spark'
    );

    if (sparkComponent) {
      await this.ecs.updateComponent(
        sparkComponent.id,
        {
          ...sparkComponent.data,
          orphaned: true,
          recoveryMethod: 'orphaned',
          needsReview: true,
        },
        this.userId
      );
    }
  }

  /**
   * Add annotation reference to spark.
   *
   * @param sparkId - Entity ID of the spark
   * @param annotationId - Entity ID of the annotation to link
   */
  async addAnnotationRef(
    sparkId: string,
    annotationId: string
  ): Promise<void> {
    const entity = await this.ecs.getEntity(sparkId, this.userId);
    if (!entity) {
      throw new Error('Spark not found');
    }

    const components = this.extractComponents(entity);
    const sparkComponent = components.find(
      (c) => c.component_type === 'Spark'
    );

    if (sparkComponent) {
      const currentRefs = sparkComponent.data.annotationRefs || [];

      // Don't add duplicates
      if (currentRefs.includes(annotationId)) {
        return;
      }

      await this.ecs.updateComponent(
        sparkComponent.id,
        {
          ...sparkComponent.data,
          annotationRefs: [...currentRefs, annotationId],
        },
        this.userId
      );
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
   * Remove annotation reference from spark.
   *
   * @param sparkId - Entity ID of the spark
   * @param annotationId - Entity ID of the annotation to unlink
   */
  async removeAnnotationRef(
    sparkId: string,
    annotationId: string
  ): Promise<void> {
    const entity = await this.ecs.getEntity(sparkId, this.userId);
    if (!entity) {
      throw new Error('Spark not found');
    }

    const components = this.extractComponents(entity);
    const sparkComponent = components.find(
      (c) => c.component_type === 'Spark'
    );

    if (sparkComponent) {
      const currentRefs = sparkComponent.data.annotationRefs || [];
      const updatedRefs = currentRefs.filter((id: string) => id !== annotationId);

      await this.ecs.updateComponent(
        sparkComponent.id,
        {
          ...sparkComponent.data,
          annotationRefs: updatedRefs,
        },
        this.userId
      );
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
   * Delete spark.
   *
   * @param entityId - Entity ID to delete
   */
  async delete(entityId: string): Promise<void> {
    await this.ecs.deleteEntity(entityId, this.userId);
  }

  /**
   * Search sparks by content (in note or tags).
   *
   * @param query - Search query
   * @returns Matching sparks
   */
  async search(query: string): Promise<SparkEntity[]> {
    // NOTE: This queries ECS directly, which is slow for search.
    // For production use, query sparks_cache table with full-text search.
    // This method is for fallback/debugging only.

    const entities = await this.ecs.query(
      ['Spark'],
      this.userId
    );

    const lowerQuery = query.toLowerCase();

    return entities
      .map(this.mapToSpark)
      .filter((spark) => {
        const content = this.getComponent<ContentComponent>(spark, 'Content');
        return (
          content.note?.toLowerCase().includes(lowerQuery) ||
          content.tags.some((tag) => tag.toLowerCase().includes(lowerQuery))
        );
      });
  }

  // ============================================
  // HELPER METHODS
  // ============================================

  /**
   * Maps raw ECS entity to typed SparkEntity
   */
  private mapToSpark = (entity: Entity): SparkEntity => {
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
      components: components as SparkEntity['components'],
    };
  };

  /**
   * Extracts component array from entity
   */
  private extractComponents(entity: Entity): Component[] {
    return entity.components || [];
  }

  /**
   * Gets a specific component from a spark entity
   */
  private getComponent<T>(entity: SparkEntity, type: string): T {
    return (entity.components as Record<string, unknown>)[type] as T;
  }
}
