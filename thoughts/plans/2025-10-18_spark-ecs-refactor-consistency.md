# Spark System ECS Refactor for Architectural Consistency

## Overview

Refactor spark system to use consistent ECS 4-component pattern (Spark, Content, Temporal, ChunkRef) matching annotations architecture. Add multiple text selections support, implement dual recovery strategy (selection-based + semantic), integrate Obsidian export, and create proper Zustand stores. Focus on consistency and extensibility for future threading features while keeping implementation simple for personal tool use.

**Why this matters**: Current 2-component pattern (`spark`, `source`) with mixed naming conventions (snake_case vs camelCase) creates architectural inconsistency as codebase grows. Future entities (flashcards, study sessions, threads) need consistent patterns to follow.

## Current State Analysis

Based on comprehensive codebase research across 5 modules:

### What Works ✅

**ECS Foundation** (`src/lib/ecs/`):
- Pure entity-component architecture with 7 public methods
- Annotations use 5-component pattern: Position, Visual, Content, Temporal, ChunkRef (lines 1-106 in `components.ts`)
- AnnotationOperations wrapper class provides type-safe API (lines 62-367 in `annotations.ts`)
- Recovery metadata: `recoveryConfidence`, `recoveryMethod`, `needsReview` (lines 30-44 in `components.ts`)

**Spark Implementation** (`src/app/actions/sparks.ts`, `src/lib/sparks/`):
- Working 2-component pattern: `spark` + `source`
- Direct ECS calls (no operations wrapper)
- Mixed naming: component names lowercase, data fields snake_case
- Storage integration working (`uploadSparkToStorage` at `types.ts:14-41`)
- Cache table with embeddings (`sparks_cache` migration 054/056)

**UI Components**:
- QuickSparkCapture panel (left slide-in, non-blocking)
- Auto-quote selection, Cmd+K trigger, Cmd+Enter submit
- Live tag/chunk extraction with debouncing
- SparksTab timeline with 5s auto-refresh

### What's Missing ❌

**Architectural Consistency**:
- No SparkOperations wrapper (direct ECS calls scatter across codebase)
- Component naming inconsistent (lowercase `spark` vs PascalCase `Position`)
- Data field naming inconsistent (snake_case vs camelCase)
- ChunkRef not reused (custom `source` component instead)

**Multiple Selections Support**:
- Currently auto-appends selected text to textarea
- No separate display for selections vs user thought
- Cannot add multiple selections before typing

**Recovery System**:
- No spark recovery handler (annotations have 4-tier fuzzy matching)
- No recovery metadata fields (confidence, method, needsReview)
- Orphaned sparks after document reprocessing

**Obsidian Integration**:
- Annotations export working (`worker/jobs/export-annotations.ts`)
- Sparks not included in export
- No `.sparks.md` file generation

**Zustand Stores**:
- No dedicated spark-store (server actions called directly from UI)
- No recovery-store (no consolidated recovery UI)
- Missing patterns: optimistic updates, caching, state isolation

### Key Discoveries from Research

**1. Annotation Recovery Pattern** (`worker/handlers/recover-annotations.ts`):
- 4-tier matching: exact → context → chunk_bounded → trigram
- Confidence thresholds: ≥0.85 auto-recover, 0.75-0.85 needs review, <0.75 lost
- Dual component updates: position + annotation components in parallel
- Database schema: `recovery_method`, `recovery_confidence`, `needs_review`, `original_chunk_index`

**2. Storage-First Pattern** (`worker/lib/storage-helpers.ts`):
- Blob wrapper preserves JSON formatting (`type: 'application/json'`)
- Non-fatal errors (logs warning, continues processing)
- Path convention: `{userId}/{type}/{id}/content.json`
- Signed URLs with 1-hour expiry for reads

**3. Cache Table Pattern** (`sparks_cache` migration 054):
- NOT source of truth (Storage is)
- Denormalized fields for fast queries
- Rebuild process: DELETE + re-insert from Storage
- Indexes: timeline, tags, embeddings, full-text search

**4. Obsidian Integration** (`worker/handlers/obsidian-sync.ts`):
- `exportToObsidian()` at lines 141-187
- `exportAnnotations()` at lines 119-140
- YAML frontmatter + markdown content
- URI protocol integration for auto-open

**5. Zustand Store Patterns**:
- Persistence: user preferences always persist, session data never
- Document-keyed state: `Record<documentId, T[]>` pattern
- Optimistic updates: temporary ID (`temp-${Date.now()}`), server confirmation, ID replacement
- Polling lifecycle: auto-start/stop based on active jobs

## Desired End State

Users can:
1. ✅ Press Cmd+K → capture spark with **multiple text selections displayed separately**
2. ✅ Add selections via "Quote This" button (while panel open)
3. ✅ Type thought in clean textarea (not mixed with selections)
4. ✅ Sparks use **consistent 4-component ECS pattern** (Spark, Content, Temporal, ChunkRef)
5. ✅ Component names PascalCase, data fields camelCase (matching annotations)
6. ✅ After document reprocessing, sparks **automatically recover** using dual strategy
7. ✅ Consolidated Recovery UI shows annotations + sparks (filter by type)
8. ✅ Obsidian export includes sparks as `.sparks.md` files
9. ✅ Zustand stores provide: optimistic updates, caching, state isolation

**Architecture Verification**:
- SparkOperations wrapper used (no direct ECS calls in server actions)
- ChunkRef component reused (with optional `documentId` fields)
- Content.note stores spark thought (consistent with annotations)
- Temporal component tracks timestamps (consistent with annotations)

**Performance Targets** (Personal Tool - Realistic):
- Spark creation: <1s (Cmd+K → saved)
- Timeline load: <500ms (50 sparks from cache)
- Recovery: <30s per document (occasional operation)
- Obsidian export: <5s (background job)

## Rhizome Architecture

- **Module**: Both (Main App UI + Worker for recovery/Obsidian)
- **Storage**: Both - Hybrid
  - **Source of Truth**: Storage (`{userId}/sparks/{sparkId}/content.json`)
  - **Queryable Cache**: Database (`sparks_cache` table)
- **Migration**: Yes (057 for component schema updates)
- **Test Tier**: Critical (user-created content, manual work)
- **Pipeline Stages**: N/A (sparks created outside processing pipeline)
- **Engines**: Reads from existing connection system for inheritance

## What We're NOT Doing

Clear scope boundaries:

- ❌ **Backward compatibility** - Refactor cleanly, migrate existing sparks
- ❌ **Spark editing** - Create-only in v1 (editing in future)
- ❌ **Auto-threading sparks** - Deferred to threads feature
- ❌ **Bidirectional Obsidian sync** - Export only (like annotations)
- ❌ **Advanced search filters** - Full-text only, no faceted search
- ❌ **Optimizing for scale** - Personal tool, ~100s of sparks expected
- ❌ **Real-time collaboration** - Single-user tool
- ❌ **Spark connections to annotations** - Future feature for threads
- ❌ **Custom recovery UI per entity type** - Consolidated recovery tab only

## Implementation Approach

**Strategy**: Refactor in place, migrate existing data, maintain Storage-first portability.

**Core Pattern**: Follow AnnotationOperations exactly:

```typescript
// Annotations (existing)
await annotationOps.create({
  documentId, startOffset, endOffset, originalText,
  chunkId, chunkPosition, type, color, note, tags
})

// Sparks (new, consistent)
await sparkOps.create({
  content, selections, tags,
  chunkId, chunkIds, documentId
})
```

**4-Component Structure**:

```typescript
Spark: {
  selections: SparkSelection[],      // Multiple text selections
  connections: SparkConnection[],    // Chunk connections
  recoveryConfidence?: number,       // After reprocessing
  recoveryMethod?: string,           // How recovered
  needsReview?: boolean,            // Manual review flag
  orphaned?: boolean                 // No origin chunk
}

Content: {
  note?: string,     // User's spark thought (reused from annotations!)
  tags: string[]     // Extracted tags (reused from annotations!)
}

Temporal: {
  createdAt: string,
  updatedAt: string,
  lastViewedAt?: string,           // (reused from annotations!)
  lastRecoveredAt?: string          // Track recovery operations
}

ChunkRef: {
  chunkId: string,                   // Primary/origin chunk
  chunk_id: string,                  // ECS filtering duplicate
  chunkIds?: string[],               // All visible chunks (NEW)
  chunkPosition: number,             // 0 for thought-only, offset for selection-based
  documentId?: string,               // Parent document (NEW - for sparks)
  document_id?: string,              // ECS filtering duplicate (NEW)
  hasSelections?: boolean            // Whether Spark.selections exists (NEW)
}
```

**Key Decisions**:

1. **Reuse Content + Temporal** - Maximum consistency with annotations
2. **Extend ChunkRef** - Add optional `documentId`/`document_id` for sparks
3. **Content.note for thought** - Consistent with annotation pattern
4. **Multiple selections** - Array in Spark component, displayed separately
5. **Dual recovery** - Selection-based (like annotations) + semantic (for thought-only)
6. **Consolidated recovery UI** - Single tab, filter by entity type

---

## Phase 1: Extend ECS Components

### Overview

Extend `ChunkRefComponent` with optional document fields, add `SparkComponent` and `SparkEntity` interfaces, create validators and type guards. No database changes yet.

### Changes Required

#### 1. Extend ChunkRefComponent
**File**: `src/lib/ecs/components.ts`
**Changes**: Add optional documentId fields and hasSelections flag (lines 69-80)

```typescript
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
```

#### 2. Add Spark Component Types
**File**: `src/lib/ecs/components.ts`
**Changes**: Add after ChunkRefComponent (new section at ~line 110)

```typescript
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
```

#### 3. Add Spark Validators
**File**: `src/lib/ecs/components.ts`
**Changes**: Add after existing validators (~line 210)

```typescript
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
```

#### 4. Update ChunkRef Validator
**File**: `src/lib/ecs/components.ts`
**Changes**: Update validateChunkRefComponent (lines 199-210)

```typescript
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
```

### Success Criteria

#### Automated Verification:
- [x] Types compile: `npm run type-check`
- [x] No import errors: `npm run build`
- [x] Validators export correctly

#### Manual Verification:
- [x] Can import SparkComponent and SparkEntity in other files
- [x] ChunkRef validator accepts optional documentId
- [x] Spark validators correctly validate component structure

**Implementation Note**: No database changes. Type definitions only.

---

## Phase 2: Create SparkOperations Wrapper

### Overview

Create `src/lib/ecs/sparks.ts` following `annotations.ts` pattern exactly. Provides type-safe CRUD operations for spark entities.

### Changes Required

#### 1. Spark Operations Class
**File**: `src/lib/ecs/sparks.ts`
**Changes**: Create new file

```typescript
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
  /** User's spark thought/note */
  content: string;
  /** Text selections (can be empty array for thought-only sparks) */
  selections?: SparkSelection[];
  /** Tags extracted from content */
  tags?: string[];
  /** Chunk connections */
  connections: SparkConnection[];

  // ChunkRef data
  /** Primary/origin chunk ID */
  chunkId: string;
  /** All visible chunk IDs (includes primary + viewport chunks + selection chunks) */
  chunkIds?: string[];
  /** Document ID */
  documentId: string;

  // For recovery
  /** First 500 chars of origin chunk content */
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

    const entityId = await this.ecs.createEntity(this.userId, {
      Spark: {
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
      ChunkRef: {
        chunkId: input.chunkId,
        chunk_id: input.chunkId, // For ECS filtering
        chunkIds: input.chunkIds || [input.chunkId],
        chunkPosition: hasSelections ? selections[0].startOffset : 0,
        documentId: input.documentId,
        document_id: input.documentId, // For ECS filtering
        hasSelections,
      },
    });

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
```

### Success Criteria

#### Automated Verification:
- [x] Types compile: `npm run type-check`
- [x] No import errors: `npm run build`
- [x] SparkOperations exports correctly

#### Manual Verification:
- [x] Can instantiate SparkOperations with ECS and userId
- [x] create() method builds 4 components correctly
- [x] getByDocument() queries by document_id filter
- [x] updateAfterRecovery() updates all relevant components

**Implementation Note**: No database changes. Operations layer only.

---

## Phase 3: Refactor Server Actions

### Overview

Update `src/app/actions/sparks.ts` to use SparkOperations instead of direct ECS calls. Migrate to camelCase, fix component naming, integrate with cache table.

### Changes Required

#### 1. Update Server Actions
**File**: `src/app/actions/sparks.ts`
**Changes**: Complete rewrite using SparkOperations

```typescript
'use server'

import { revalidatePath } from 'next/cache'
import { getCurrentUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { createECS } from '@/lib/ecs'
import { SparkOperations } from '@/lib/ecs/sparks'
import {
  uploadSparkToStorage,
  buildSparkConnections,
  extractTags,
  extractChunkIds
} from '@/lib/sparks'
import type { SparkContext, SparkStorageJson, SparkSelection } from '@/lib/sparks/types'

interface CreateSparkInput {
  content: string
  selections?: SparkSelection[]  // NEW - multiple selections
  context: SparkContext
}

/**
 * Create a new spark (ECS-native with SparkOperations)
 *
 * Flow:
 * 1. Validate user authentication
 * 2. Extract metadata from content (tags, chunk mentions)
 * 3. Build connection graph (origin + mentions + inherited)
 * 4. Create ECS entity with 4 components via SparkOperations
 * 5. Upload complete data to Storage (source of truth)
 * 6. Update query cache (optional, non-fatal)
 * 7. Revalidate paths for UI refresh
 */
export async function createSpark(input: CreateSparkInput) {
  const user = await getCurrentUser()
  if (!user) throw new Error('Unauthorized')

  const supabase = await createClient()

  // 1. Extract metadata from content
  const tags = extractTags(input.content)
  const connections = await buildSparkConnections(
    input.content,
    input.context.originChunkId,
    user.id
  )

  // 2. Get origin chunk content for recovery
  const { data: originChunk } = await supabase
    .from('chunks')
    .select('content')
    .eq('id', input.context.originChunkId)
    .single()

  // 3. Create ECS entity using SparkOperations (4-component pattern)
  const ecs = createECS()
  const ops = new SparkOperations(ecs, user.id)

  const sparkId = await ops.create({
    content: input.content,
    selections: input.selections || [],
    tags,
    connections,
    chunkId: input.context.originChunkId,
    chunkIds: input.context.visibleChunks,
    documentId: input.context.documentId,
    originChunkContent: originChunk?.content?.slice(0, 500)
  })

  console.log(`[Sparks] ✓ Created ECS entity: ${sparkId}`)

  // 4. Build complete Storage JSON
  const sparkData: SparkStorageJson = {
    entity_id: sparkId,
    user_id: user.id,
    component_type: 'spark',
    data: {
      content: input.content,
      createdAt: new Date().toISOString(),
      tags,
      connections,
      selections: input.selections || []
    },
    context: input.context,
    source: {
      chunk_id: input.context.originChunkId,
      document_id: input.context.documentId
    }
  }

  // 5. Upload to Storage (source of truth)
  try {
    const storagePath = await uploadSparkToStorage(user.id, sparkId, sparkData)
    console.log(`[Sparks] ✓ Uploaded to Storage: ${storagePath}`)
  } catch (error) {
    console.error(`[Sparks] Storage upload failed:`, error)
    // Continue - Storage can be rebuilt from ECS if needed
  }

  // 6. Update query cache (optional, non-fatal)
  try {
    await supabase.from('sparks_cache').insert({
      entity_id: sparkId,
      user_id: user.id,
      content: input.content,
      created_at: new Date().toISOString(),
      origin_chunk_id: input.context.originChunkId,
      document_id: input.context.documentId,
      tags,
      connections,
      embedding: null, // TODO: Generate via background job
      storage_path: `${user.id}/sparks/${sparkId}/content.json`,
      cached_at: new Date().toISOString()
    })
    console.log(`[Sparks] ✓ Updated query cache`)
  } catch (error) {
    console.error(`[Sparks] Cache update failed (non-critical):`, error)
  }

  // 7. Revalidate paths
  revalidatePath('/sparks')
  revalidatePath(`/read/${input.context.documentId}`)

  return { success: true, sparkId }
}

/**
 * Delete spark (cascade delete)
 */
export async function deleteSpark(sparkId: string) {
  const user = await getCurrentUser()
  if (!user) throw new Error('Unauthorized')

  const supabase = await createClient()
  const ecs = createECS()
  const ops = new SparkOperations(ecs, user.id)

  // 1. Delete from Storage
  const storagePath = `${user.id}/sparks/${sparkId}/content.json`
  try {
    await supabase.storage.from('documents').remove([storagePath])
  } catch (error) {
    console.error(`[Sparks] Storage delete failed (non-critical):`, error)
  }

  // 2. Delete ECS entity (cascades to components)
  await ops.delete(sparkId)

  // 3. Delete from cache (optional, non-fatal)
  try {
    await supabase.from('sparks_cache').delete().eq('entity_id', sparkId)
  } catch (error) {
    console.error(`[Sparks] Cache delete failed (non-critical):`, error)
  }

  revalidatePath('/sparks')
  return { success: true }
}

/**
 * Get sparks for timeline (uses cache for performance)
 */
export async function getRecentSparks(limit = 50, offset = 0) {
  const user = await getCurrentUser()
  if (!user) throw new Error('Unauthorized')

  const supabase = await createClient()

  const { data: sparks, error } = await supabase
    .from('sparks_cache')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (error) throw error

  return sparks || []
}

/**
 * Search sparks by content (uses cache for performance)
 */
export async function searchSparks(query: string, limit = 20) {
  const user = await getCurrentUser()
  if (!user) throw new Error('Unauthorized')

  const supabase = await createClient()

  const { data: sparks, error } = await supabase
    .from('sparks_cache')
    .select('*')
    .eq('user_id', user.id)
    .textSearch('content', query)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) throw error

  return sparks || []
}
```

### Success Criteria

#### Automated Verification:
- [x] Types compile: `npm run type-check`
- [x] Server actions build: `npm run build`

#### Manual Verification:
- [x] createSpark uses SparkOperations.create()
- [x] deleteSpark uses SparkOperations.delete()
- [x] No direct ECS calls (all via ops)
- [x] Cache table updated with correct data

**Service Restarts:**
- [x] Next.js: Auto-reload on server action changes

---

## Phase 4: Update UI for Multiple Selections

### Overview

Update QuickSparkCapture to display selections separately from user thought. Add "Quote This" button, clean up selection handling, integrate with Zustand store.

### Changes Required

#### 1. Update QuickSparkCapture Component
**File**: `src/components/reader/QuickSparkCapture.tsx`
**Changes**: Add selections display, separate from textarea (lines 258-302)

```typescript
'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Zap, Loader2, X, Tag, Link, Hash, Quote } from 'lucide-react'
import { createSpark } from '@/app/actions/sparks'
import { extractTags, extractChunkIds } from '@/lib/sparks/extractors'
import type { SparkContext, SparkSelection } from '@/lib/sparks/types'
import { motion, AnimatePresence } from 'framer-motion'
import { useUIStore } from '@/stores/ui-store'
import { useTextSelection } from '@/hooks/useTextSelection'

// ... existing interface and setup ...

export function QuickSparkCapture({ /* ... props ... */ }) {
  // ... existing state ...

  // NEW: Selections array state
  const [selections, setSelections] = useState<SparkSelection[]>([])

  // ... existing hooks ...

  // Quote selected text into selections array (not textarea)
  const handleQuoteThis = () => {
    if (!selection) return

    const newSelection: SparkSelection = {
      text: selection.text,
      chunkId: selection.range.chunkIds[0] || currentChunkId,
      startOffset: selection.range.startOffset,
      endOffset: selection.range.endOffset,
      textContext: {
        before: getContextBefore(selection.text, markdown),
        after: getContextAfter(selection.text, markdown)
      }
    }

    setSelections(prev => [...prev, newSelection])
    clearSelection()
  }

  // Remove selection from array
  const handleRemoveSelection = (index: number) => {
    setSelections(prev => prev.filter((_, i) => i !== index))
  }

  const handleSubmit = async () => {
    if (!content.trim() || loading) return

    setLoading(true)
    try {
      // Create spark with selections array
      await createSpark({
        content: content.trim(),
        selections, // Pass selections array
        context: sparkContext
      })

      // Reset
      setContent('')
      setSelections([])
      closeSparkCapture()

      console.log('[Sparks] ✓ Created successfully')
    } catch (error) {
      console.error('[Sparks] Failed to create:', error)
      alert('Failed to create spark. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div /* ... existing animation props ... */>
          <Card className="border shadow-2xl rounded-lg bg-background">
            {/* Header - unchanged */}
            <div className="flex items-center justify-between px-4 py-3 border-b">
              {/* ... existing header ... */}
            </div>

            {/* Content */}
            <div className="p-4 space-y-4">
              {/* Selections Display (NEW) */}
              {selections.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Quote className="w-3 h-3" />
                    <span>{selections.length} selection{selections.length !== 1 ? 's' : ''}</span>
                  </div>
                  {selections.map((sel, i) => (
                    <div
                      key={i}
                      className="p-2 bg-muted/30 rounded border border-muted-foreground/20 text-sm relative group"
                    >
                      <p className="pr-6 italic">
                        &ldquo;{sel.text.length > 150
                          ? sel.text.slice(0, 150) + '...'
                          : sel.text}&rdquo;
                      </p>
                      <Badge variant="outline" className="mt-1 text-xs">
                        {sel.chunkId}
                      </Badge>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="absolute top-1 right-1 h-6 w-6 p-0 opacity-0 group-hover:opacity-100"
                        onClick={() => handleRemoveSelection(i)}
                      >
                        <X className="w-3 h-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              {/* Text Selection Actions (when text is selected) */}
              {selection && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="p-3 bg-muted/50 rounded-lg border border-primary/20"
                >
                  <p className="text-xs text-muted-foreground mb-2">
                    Selected: &ldquo;{selection.text.substring(0, 60)}{selection.text.length > 60 ? '...' : ''}&rdquo;
                  </p>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleQuoteThis}
                      className="text-xs h-7"
                    >
                      <Quote className="w-3 h-3 mr-1" />
                      Quote This
                    </Button>
                    {/* ... existing Create Annotation button ... */}
                  </div>
                </motion.div>
              )}

              {/* User's Thought (Clean Textarea) */}
              <Textarea
                ref={textareaRef}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="What's your thought? Use /chunk_id to link chunks, #tags for organization"
                className="min-h-[120px] resize-none font-mono text-sm"
                disabled={loading}
              />

              {/* ... existing context info and metadata preview ... */}

              {/* Actions */}
              <div className="flex gap-2 justify-end">
                {/* ... existing buttons ... */}
              </div>
            </div>
          </Card>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
```

#### 2. Update Spark Types
**File**: `src/lib/sparks/types.ts`
**Changes**: Update SparkComponent and SparkStorageJson

```typescript
// Update SparkComponent to include selections
export interface SparkComponent {
  content: string
  createdAt: string
  updatedAt?: string
  tags: string[]
  connections: SparkConnection[]
  selections: SparkSelection[]  // NEW
}

// Update SparkStorageJson
export interface SparkStorageJson {
  entity_id: string
  user_id: string
  component_type: 'spark'
  data: SparkComponent
  context: SparkContext
  source: {
    chunk_id: string
    document_id: string
  }
}

// Add SparkSelection interface
export interface SparkSelection {
  text: string
  chunkId: string
  startOffset: number
  endOffset: number
  textContext?: {
    before: string
    after: string
  }
}
```

### Success Criteria

#### Automated Verification:
- [x] Types compile: `npm run type-check`
- [x] Component builds: `npm run build`

#### Manual Verification:
- [x] Selections display separately from textarea
- [x] "Quote This" button adds selection to array
- [x] Selections show chunk ID badge
- [x] Can remove selections individually
- [x] Selections passed to createSpark()
- [x] Textarea remains clean (no auto-appended text)

**Service Restarts:**
- [x] Next.js: Auto-reload on component changes

---

## Phase 5: Implement Dual Recovery Strategy

### Overview

Create `worker/handlers/recover-sparks.ts` following annotation recovery pattern. Implement selection-based recovery (like annotations) and semantic recovery (for thought-only sparks).

### Changes Required

#### 1. Spark Recovery Handler
**File**: `worker/handlers/recover-sparks.ts`
**Changes**: Create new file

```typescript
/**
 * Spark Recovery Handler
 * Recovers user sparks after document edits using dual strategy
 *
 * 2-mode recovery:
 * 1. Selection-based recovery (if spark has selections) - uses 4-tier fuzzy matching
 * 2. Semantic recovery (if thought-only spark) - uses embedding similarity
 */

import { createClient } from '@supabase/supabase-js'
import { findAnnotationMatch } from '../lib/fuzzy-matching.js'
import { embed } from 'ai'
import { google } from '@ai-sdk/google'
import type { SparkEntity, SparkSelection } from '../../src/lib/ecs/components'
import type { Chunk } from '../types/recovery.js'

interface SparkRecoveryResults {
  success: string[]
  needsReview: string[]
  orphaned: string[]
}

/**
 * Recover sparks for a document after reprocessing
 *
 * @param documentId - Document ID to recover sparks for
 * @param newMarkdown - New markdown content after edit
 * @param newChunks - New chunks after reprocessing
 * @returns Recovery results with success, needsReview, and orphaned sparks
 */
export async function recoverSparks(
  documentId: string,
  newMarkdown: string,
  newChunks: Chunk[],
  supabaseClient?: any
): Promise<SparkRecoveryResults> {
  const supabase = supabaseClient || createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  console.log(`[RecoverSparks] Starting recovery for document ${documentId}...`)

  const results: SparkRecoveryResults = {
    success: [],
    needsReview: [],
    orphaned: []
  }

  // 1. Get all spark entity IDs for this document
  const { data: chunkRefComponents } = await supabase
    .from('components')
    .select('entity_id, data')
    .eq('component_type', 'ChunkRef')
    .eq('data->>document_id', documentId)

  if (!chunkRefComponents || chunkRefComponents.length === 0) {
    console.log('[RecoverSparks] No sparks to recover')
    return results
  }

  // Filter to only entities that have Spark component
  const entityIds = chunkRefComponents.map(c => c.entity_id)

  const { data: sparkComponents } = await supabase
    .from('components')
    .select('entity_id, data')
    .eq('component_type', 'Spark')
    .in('entity_id', entityIds)

  if (!sparkComponents || sparkComponents.length === 0) {
    console.log('[RecoverSparks] No spark components found')
    return results
  }

  const sparkEntityIds = new Set(sparkComponents.map(c => c.entity_id))

  console.log(`[RecoverSparks] Found ${sparkEntityIds.size} sparks to recover`)

  // 2. Process each spark
  for (const entityId of sparkEntityIds) {
    try {
      // Get all components for this spark
      const { data: components } = await supabase
        .from('components')
        .select('id, component_type, data')
        .eq('entity_id', entityId)

      if (!components) continue

      const spark = components.find(c => c.component_type === 'Spark')
      const content = components.find(c => c.component_type === 'Content')
      const chunkRef = components.find(c => c.component_type === 'ChunkRef')

      if (!spark || !content || !chunkRef) continue

      // Determine recovery strategy based on selections
      if (spark.data.selections && spark.data.selections.length > 0) {
        // Selection-based recovery (like annotations)
        await recoverSelectionBasedSpark(
          supabase,
          entityId,
          components,
          newMarkdown,
          newChunks,
          results
        )
      } else {
        // Semantic recovery (for thought-only sparks)
        await recoverThoughtBasedSpark(
          supabase,
          entityId,
          components,
          newChunks,
          results
        )
      }
    } catch (error) {
      console.error(`[RecoverSparks] Error recovering spark ${entityId}:`, error)
      results.orphaned.push(entityId)
    }
  }

  console.log(`[RecoverSparks] Results:`)
  console.log(`  ✅ Success: ${results.success.length}`)
  console.log(`  ⚠️  Needs Review: ${results.needsReview.length}`)
  console.log(`  ❌ Orphaned: ${results.orphaned.length}`)

  return results
}

/**
 * Recover selection-based spark using 4-tier fuzzy matching
 * Same strategy as annotations
 */
async function recoverSelectionBasedSpark(
  supabase: any,
  entityId: string,
  components: any[],
  newMarkdown: string,
  newChunks: Chunk[],
  results: SparkRecoveryResults
): Promise<void> {
  const spark = components.find(c => c.component_type === 'Spark')
  const selections = spark.data.selections as SparkSelection[]

  console.log(`[RecoverSparks] Recovering selection-based spark ${entityId} (${selections.length} selections)...`)

  const recoveredSelections: SparkSelection[] = []
  let totalConfidence = 0
  let successCount = 0

  // Try to recover each selection
  for (const selection of selections) {
    const match = findAnnotationMatch(
      {
        text: selection.text,
        textContext: selection.textContext,
        originalChunkIndex: undefined // TODO: Track chunk index in selection
      },
      newMarkdown,
      newChunks
    )

    if (match && match.confidence > 0.7) {
      recoveredSelections.push({
        ...selection,
        chunkId: getChunkIdAtOffset(match.startOffset, newChunks),
        startOffset: match.startOffset,
        endOffset: match.endOffset,
        textContext: {
          before: match.contextBefore || '',
          after: match.contextAfter || ''
        },
        recoveryConfidence: match.confidence,
        recoveryMethod: match.method
      })
      totalConfidence += match.confidence
      successCount++
    }
  }

  // Calculate average confidence
  const avgConfidence = successCount > 0 ? totalConfidence / selections.length : 0

  // Update spark components
  if (successCount > 0) {
    // Update Spark component with recovered selections
    await supabase
      .from('components')
      .update({
        data: {
          ...spark.data,
          selections: recoveredSelections,
          recoveryConfidence: avgConfidence,
          recoveryMethod: 'selections',
          needsReview: avgConfidence < 0.85
        }
      })
      .eq('id', spark.id)

    // Update ChunkRef with new chunk IDs
    const newChunkIds = [...new Set(recoveredSelections.map(s => s.chunkId))]
    const chunkRef = components.find(c => c.component_type === 'ChunkRef')

    await supabase
      .from('components')
      .update({
        data: {
          ...chunkRef.data,
          chunkId: newChunkIds[0],
          chunk_id: newChunkIds[0],
          chunkIds: newChunkIds
        }
      })
      .eq('id', chunkRef.id)

    // Update Temporal.lastRecoveredAt
    const temporal = components.find(c => c.component_type === 'Temporal')
    await supabase
      .from('components')
      .update({
        data: {
          ...temporal.data,
          lastRecoveredAt: new Date().toISOString()
        }
      })
      .eq('id', temporal.id)

    // Classify result
    if (avgConfidence >= 0.85) {
      console.log(`  ✅ Auto-recovered (${(avgConfidence * 100).toFixed(1)}%): ${successCount}/${selections.length} selections`)
      results.success.push(entityId)
    } else {
      console.log(`  ⚠️  Needs review (${(avgConfidence * 100).toFixed(1)}%): ${successCount}/${selections.length} selections`)
      results.needsReview.push(entityId)
    }
  } else {
    // No selections recovered - mark as orphaned
    console.log(`  ❌ Orphaned: 0/${selections.length} selections recovered`)
    await markSparkOrphaned(supabase, components)
    results.orphaned.push(entityId)
  }
}

/**
 * Recover thought-based spark using semantic similarity
 * Matches on Content.note + originalChunkContent
 */
async function recoverThoughtBasedSpark(
  supabase: any,
  entityId: string,
  components: any[],
  newChunks: Chunk[],
  results: SparkRecoveryResults
): Promise<void> {
  const spark = components.find(c => c.component_type === 'Spark')
  const content = components.find(c => c.component_type === 'Content')

  console.log(`[RecoverSparks] Recovering thought-based spark ${entityId}...`)

  // Build context text from thought + original chunk content
  const contextText = [
    content.data.note,
    spark.data.originalChunkContent
  ].filter(Boolean).join(' ')

  // Generate embedding
  const { embedding: sparkEmbedding } = await embed({
    model: google.textEmbeddingModel('text-embedding-004', {
      outputDimensionality: 768
    }),
    value: contextText
  })

  // Get embeddings for new chunks
  const chunkEmbeddings = await Promise.all(
    newChunks.map(async (chunk) => {
      const { data } = await supabase
        .from('chunks')
        .select('embedding')
        .eq('id', chunk.id)
        .single()

      return {
        chunkId: chunk.id,
        embedding: data?.embedding
      }
    })
  )

  // Calculate cosine similarity
  const similarities = chunkEmbeddings
    .filter(c => c.embedding)
    .map(c => ({
      chunkId: c.chunkId,
      score: cosineSimilarity(sparkEmbedding, c.embedding)
    }))
    .sort((a, b) => b.score - a.score)

  const bestMatch = similarities[0]

  if (bestMatch && bestMatch.score > 0.85) {
    // High confidence - auto-recover
    console.log(`  ✅ Auto-recovered (${(bestMatch.score * 100).toFixed(1)}%) to chunk ${bestMatch.chunkId}`)

    await updateSparkAfterRecovery(
      supabase,
      components,
      bestMatch.chunkId,
      similarities.slice(0, 3).map(s => s.chunkId),
      bestMatch.score,
      'semantic',
      false
    )

    results.success.push(entityId)
  } else if (bestMatch && bestMatch.score > 0.70) {
    // Medium confidence - needs review
    console.log(`  ⚠️  Needs review (${(bestMatch.score * 100).toFixed(1)}%) to chunk ${bestMatch.chunkId}`)

    await updateSparkAfterRecovery(
      supabase,
      components,
      bestMatch.chunkId,
      similarities.slice(0, 3).map(s => s.chunkId),
      bestMatch.score,
      'semantic',
      true
    )

    results.needsReview.push(entityId)
  } else {
    // Low confidence - mark as orphaned
    console.log(`  ❌ Orphaned: Low similarity (${bestMatch ? (bestMatch.score * 100).toFixed(1) : '0.0'}%)`)
    await markSparkOrphaned(supabase, components)
    results.orphaned.push(entityId)
  }
}

/**
 * Update spark components after successful recovery
 */
async function updateSparkAfterRecovery(
  supabase: any,
  components: any[],
  newChunkId: string,
  newChunkIds: string[],
  confidence: number,
  method: string,
  needsReview: boolean
): Promise<void> {
  const spark = components.find(c => c.component_type === 'Spark')
  const chunkRef = components.find(c => c.component_type === 'ChunkRef')
  const temporal = components.find(c => c.component_type === 'Temporal')

  // Update Spark component
  await supabase
    .from('components')
    .update({
      data: {
        ...spark.data,
        recoveryConfidence: confidence,
        recoveryMethod: method,
        needsReview
      }
    })
    .eq('id', spark.id)

  // Update ChunkRef component
  await supabase
    .from('components')
    .update({
      data: {
        ...chunkRef.data,
        chunkId: newChunkId,
        chunk_id: newChunkId,
        chunkIds: newChunkIds
      }
    })
    .eq('id', chunkRef.id)

  // Update Temporal component
  await supabase
    .from('components')
    .update({
      data: {
        ...temporal.data,
        lastRecoveredAt: new Date().toISOString()
      }
    })
    .eq('id', temporal.id)
}

/**
 * Mark spark as orphaned (origin chunk no longer exists)
 */
async function markSparkOrphaned(
  supabase: any,
  components: any[]
): Promise<void> {
  const spark = components.find(c => c.component_type === 'Spark')

  await supabase
    .from('components')
    .update({
      data: {
        ...spark.data,
        orphaned: true,
        recoveryMethod: 'orphaned',
        needsReview: true
      }
    })
    .eq('id', spark.id)
}

/**
 * Helper: Get chunk ID at document offset
 */
function getChunkIdAtOffset(offset: number, chunks: Chunk[]): string {
  const chunk = chunks.find(
    c => c.start_offset <= offset && c.end_offset >= offset
  )
  return chunk?.id || chunks[0]?.id || ''
}

/**
 * Helper: Calculate cosine similarity between two vectors
 */
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error('Vectors must have same length')
  }

  let dotProduct = 0
  let normA = 0
  let normB = 0

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB)
  return denominator === 0 ? 0 : dotProduct / denominator
}
```

### Success Criteria

#### Automated Verification:
- [x] Worker builds: `cd worker && npm run build`
- [x] No TypeScript errors

#### Manual Verification:
- [x] Selection-based recovery uses 4-tier fuzzy matching
- [x] Thought-based recovery uses semantic similarity
- [x] Confidence thresholds: ≥0.85 success, 0.70-0.85 review, <0.70 orphaned
- [x] Components updated correctly after recovery
- [x] Orphaned sparks marked properly

**Service Restarts:**
- [x] Worker: Restart via `npm run dev`

---

## Phase 6: Obsidian Integration

### Overview

Extend Obsidian export to include sparks as `.sparks.md` files alongside document markdown. Follow annotation export pattern exactly.

### Changes Required

#### 1. Extend Obsidian Handler
**File**: `worker/handlers/obsidian-sync.ts`
**Changes**: Add exportSparks function after exportAnnotations (around line 140)

```typescript
/**
 * Export sparks to Obsidian vault
 * Creates: document-name.sparks.md with YAML frontmatter + markdown
 *
 * Pattern: Similar to annotation export
 */
async function exportSparks(
  documentId: string,
  vaultFilePath: string
): Promise<void> {
  const supabase = getSupabaseClient()

  // Get all spark entity IDs for this document
  const { data: chunkRefComponents } = await supabase
    .from('components')
    .select('entity_id, data')
    .eq('component_type', 'ChunkRef')
    .eq('data->>document_id', documentId)

  if (!chunkRefComponents || chunkRefComponents.length === 0) {
    console.log(`[Obsidian] No sparks to export for ${documentId}`)
    return // No .sparks.md file needed
  }

  const entityIds = chunkRefComponents.map(c => c.entity_id)

  // Get all components for these entities
  const { data: allComponents } = await supabase
    .from('components')
    .select('entity_id, component_type, data, created_at, updated_at')
    .in('entity_id', entityIds)

  if (!allComponents) {
    console.log(`[Obsidian] No components found for sparks`)
    return
  }

  // Group components by entity_id
  const entityMap = new Map<string, any[]>()
  for (const comp of allComponents) {
    if (!entityMap.has(comp.entity_id)) {
      entityMap.set(comp.entity_id, [])
    }
    entityMap.get(comp.entity_id)!.push(comp)
  }

  // Filter to only complete spark entities (have Spark component)
  const sparkEntities = Array.from(entityMap.entries())
    .filter(([_, comps]) => comps.some(c => c.component_type === 'Spark'))
    .map(([entityId, comps]) => {
      const spark = comps.find(c => c.component_type === 'Spark')
      const content = comps.find(c => c.component_type === 'Content')
      const temporal = comps.find(c => c.component_type === 'Temporal')
      const chunkRef = comps.find(c => c.component_type === 'ChunkRef')

      return {
        id: entityId,
        content: content?.data.note || '',
        tags: content?.data.tags || [],
        selections: spark?.data.selections || [],
        connections: spark?.data.connections || [],
        chunkId: chunkRef?.data.chunkId,
        documentId: chunkRef?.data.documentId,
        createdAt: temporal?.data.createdAt,
        updatedAt: temporal?.data.updatedAt,
        orphaned: spark?.data.orphaned || false,
        needsReview: spark?.data.needsReview || false
      }
    })
    .sort((a, b) => {
      const aTime = new Date(a.createdAt).getTime()
      const bTime = new Date(b.createdAt).getTime()
      return aTime - bTime // Ascending (oldest first)
    })

  if (sparkEntities.length === 0) {
    console.log(`[Obsidian] No complete spark entities to export`)
    return
  }

  // Build markdown content with YAML frontmatter for each spark
  const sparksMarkdown = sparkEntities.map(spark => {
    const frontmatter = {
      id: spark.id,
      created: spark.createdAt,
      updated: spark.updatedAt,
      tags: spark.tags,
      chunk: spark.chunkId,
      document: spark.documentId,
      selections: spark.selections.length,
      connections: spark.connections.length,
      orphaned: spark.orphaned || undefined,
      needsReview: spark.needsReview || undefined
    }

    let markdown = '---\n'
    for (const [key, value] of Object.entries(frontmatter)) {
      if (value !== undefined) {
        if (Array.isArray(value)) {
          markdown += `${key}: [${value.map(v => typeof v === 'string' ? `"${v}"` : v).join(', ')}]\n`
        } else {
          markdown += `${key}: ${typeof value === 'string' ? `"${value}"` : value}\n`
        }
      }
    }
    markdown += '---\n\n'

    // Add selections if any
    if (spark.selections.length > 0) {
      markdown += '## Selections\n\n'
      for (const sel of spark.selections) {
        markdown += `> "${sel.text}"\n`
        markdown += `> — Chunk: ${sel.chunkId}\n\n`
      }
    }

    // Add spark content
    markdown += '## Thought\n\n'
    markdown += spark.content + '\n\n'

    // Add connections summary
    if (spark.connections.length > 0) {
      markdown += '## Connections\n\n'
      markdown += `- ${spark.connections.length} connections to related chunks\n`

      const byType = spark.connections.reduce((acc, conn) => {
        acc[conn.type] = (acc[conn.type] || 0) + 1
        return acc
      }, {} as Record<string, number>)

      for (const [type, count] of Object.entries(byType)) {
        markdown += `  - ${count} ${type}\n`
      }
    }

    return markdown
  }).join('\n---\n\n')

  // Write to .sparks.md file
  const sparksPath = vaultFilePath.replace(/\.md$/, '.sparks.md')

  try {
    await fs.writeFile(sparksPath, sparksMarkdown, 'utf-8')
    console.log(`[Obsidian] ✓ Exported ${sparkEntities.length} sparks to ${sparksPath}`)
  } catch (error) {
    console.error(`[Obsidian] Failed to write sparks file:`, error)
  }
}

// Modify exportToObsidian function
export async function exportToObsidian(
  documentId: string,
  userId: string
): Promise<{ success: boolean; path: string }> {
  // ... existing code ...

  // Export annotations (existing)
  if (obsidianSettings.exportAnnotations !== false) {
    await exportAnnotations(documentId, vaultFilePath)
  }

  // Export sparks (NEW)
  if (obsidianSettings.exportSparks !== false) {
    await exportSparks(documentId, vaultFilePath)
  }

  return { success: true, path: vaultFilePath }
}
```

#### 2. Update Obsidian Settings Type
**File**: `worker/types/recovery.ts`
**Changes**: Add exportSparks flag (around line 201)

```typescript
export interface ObsidianSettings {
  vaultName: string
  vaultPath: string
  exportPath: string
  exportAnnotations: boolean
  exportSparks: boolean // NEW
  syncOnSave: boolean
}
```

### Success Criteria

#### Automated Verification:
- [x] Worker builds: `cd worker && npm run build`
- [x] No TypeScript errors (obsidian-sync.ts compiles cleanly)

#### Manual Verification:
- [x] Sparks export to `.sparks.md` file
- [x] YAML frontmatter includes all metadata
- [x] Selections displayed as quotes
- [x] Connections summarized by type
- [x] Multiple sparks separated by `---`
- [x] Obsidian can read and render files

**Test Flow:**
1. Create 3 sparks for a document (with selections and without)
2. Go to Admin Panel → Integrations tab
3. Click "Export to Obsidian" for document
4. Check vault for `document-name.sparks.md`
5. Verify YAML frontmatter complete
6. Open in Obsidian and verify rendering

**Note**: Formatting improvements deferred to later iteration (YAML frontmatter ordering).

**Service Restarts:**
- [x] Worker: Restart via `npm run dev`

---

## Phase 7: Create Zustand Stores

### Overview

Create `spark-store.ts` for spark CRUD operations and `recovery-store.ts` for consolidated recovery UI. Follow existing store patterns from annotation-store and background-jobs.

### Changes Required

#### 1. Spark Store
**File**: `src/stores/spark-store.ts`
**Changes**: Create new file

```typescript
/**
 * Spark Store
 *
 * Manages spark state, optimistic updates, and server action integration.
 * Pattern: Follows annotation-store.ts
 */

import { create } from 'zustand'
import type { SparkCacheRow } from '@/lib/sparks/types'

interface SparkState {
  // State keyed by documentId for isolation
  sparks: Record<string, SparkCacheRow[]>

  // Loading states
  loading: Record<string, boolean>

  // Actions
  setSparks: (documentId: string, sparks: SparkCacheRow[]) => void
  addSpark: (documentId: string, spark: SparkCacheRow) => void
  updateSpark: (documentId: string, sparkId: string, updates: Partial<SparkCacheRow>) => void
  removeSpark: (documentId: string, sparkId: string) => void
  setLoading: (documentId: string, loading: boolean) => void
}

export const useSparkStore = create<SparkState>((set, get) => ({
  sparks: {},
  loading: {},

  setSparks: (documentId, sparks) =>
    set((state) => ({
      sparks: { ...state.sparks, [documentId]: sparks }
    })),

  addSpark: (documentId, spark) =>
    set((state) => {
      const existing = state.sparks[documentId] || []

      // Duplicate check
      if (existing.some(s => s.entity_id === spark.entity_id)) {
        console.warn(`Duplicate spark prevented: ${spark.entity_id}`)
        return state
      }

      return {
        sparks: {
          ...state.sparks,
          [documentId]: [...existing, spark]
        }
      }
    }),

  updateSpark: (documentId, sparkId, updates) =>
    set((state) => ({
      sparks: {
        ...state.sparks,
        [documentId]: state.sparks[documentId]?.map(s =>
          s.entity_id === sparkId ? { ...s, ...updates } : s
        ) || []
      }
    })),

  removeSpark: (documentId, sparkId) =>
    set((state) => ({
      sparks: {
        ...state.sparks,
        [documentId]: state.sparks[documentId]?.filter(s =>
          s.entity_id !== sparkId
        ) || []
      }
    })),

  setLoading: (documentId, loading) =>
    set((state) => ({
      loading: { ...state.loading, [documentId]: loading }
    })),
}))
```

#### 2. Recovery Store
**File**: `src/stores/recovery-store.ts`
**Changes**: Create new file

```typescript
/**
 * Recovery Store
 *
 * Manages recovery state for all entity types (annotations, sparks, flashcards).
 * Consolidated recovery UI with filtering.
 *
 * Pattern: Follows background-jobs.ts async pattern
 */

import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import { createClient } from '@/lib/supabase/client'

interface RecoveryItem {
  entityId: string
  entityType: 'annotation' | 'spark' | 'flashcard'
  recoveryConfidence: number
  recoveryMethod: string
  needsReview: boolean

  // Type-specific data
  content?: string
  text?: string
  chunkId?: string
  documentId?: string
  tags?: string[]
  selections?: number
}

interface RecoveryState {
  // Data
  items: Map<string, RecoveryItem>

  // Filters
  typeFilter: 'all' | 'annotation' | 'spark' | 'flashcard'
  confidenceFilter: 'all' | 'high' | 'medium' | 'low'

  // Loading
  loading: boolean

  // Computed
  filteredItems: () => RecoveryItem[]

  // Actions
  loadRecoveryItems: (documentId: string) => Promise<void>
  acceptRecovery: (entityId: string) => Promise<void>
  rejectRecovery: (entityId: string) => Promise<void>
  manuallyRelink: (entityId: string, chunkId: string) => Promise<void>
  setTypeFilter: (type: RecoveryState['typeFilter']) => void
  setConfidenceFilter: (level: RecoveryState['confidenceFilter']) => void
}

export const useRecoveryStore = create<RecoveryState>()(
  devtools(
    (set, get) => ({
      items: new Map(),
      typeFilter: 'all',
      confidenceFilter: 'all',
      loading: false,

      filteredItems: () => {
        const { items, typeFilter, confidenceFilter } = get()
        const allItems = Array.from(items.values())

        let filtered = allItems

        // Filter by type
        if (typeFilter !== 'all') {
          filtered = filtered.filter(item => item.entityType === typeFilter)
        }

        // Filter by confidence
        if (confidenceFilter !== 'all') {
          filtered = filtered.filter(item => {
            if (confidenceFilter === 'high') return item.recoveryConfidence >= 0.85
            if (confidenceFilter === 'medium') return item.recoveryConfidence >= 0.70 && item.recoveryConfidence < 0.85
            if (confidenceFilter === 'low') return item.recoveryConfidence < 0.70
            return true
          })
        }

        // Sort by confidence (lowest first - needs most attention)
        return filtered.sort((a, b) => a.recoveryConfidence - b.recoveryConfidence)
      },

      loadRecoveryItems: async (documentId: string) => {
        set({ loading: true })
        const supabase = createClient()

        try {
          // Get annotations needing review
          const { data: annotationComps } = await supabase
            .from('components')
            .select('entity_id, data, recovery_confidence, recovery_method, needs_review')
            .eq('component_type', 'Position')
            .eq('data->>document_id', documentId)
            .eq('needs_review', true)

          // Get sparks needing review
          const { data: sparkComps } = await supabase
            .from('components')
            .select('entity_id, data')
            .eq('component_type', 'Spark')
            .eq('data->>needsReview', true)

          // Build items map
          const newItems = new Map<string, RecoveryItem>()

          // Add annotations
          for (const comp of annotationComps || []) {
            newItems.set(comp.entity_id, {
              entityId: comp.entity_id,
              entityType: 'annotation',
              recoveryConfidence: comp.recovery_confidence || 0,
              recoveryMethod: comp.recovery_method || 'unknown',
              needsReview: comp.needs_review,
              text: comp.data.originalText,
              documentId: comp.data.documentId,
            })
          }

          // Add sparks (need to fetch Content component for text)
          const sparkEntityIds = (sparkComps || []).map(c => c.entity_id)
          if (sparkEntityIds.length > 0) {
            const { data: contentComps } = await supabase
              .from('components')
              .select('entity_id, data')
              .eq('component_type', 'Content')
              .in('entity_id', sparkEntityIds)

            for (const comp of sparkComps || []) {
              const contentComp = contentComps?.find(c => c.entity_id === comp.entity_id)

              newItems.set(comp.entity_id, {
                entityId: comp.entity_id,
                entityType: 'spark',
                recoveryConfidence: comp.data.recoveryConfidence || 0,
                recoveryMethod: comp.data.recoveryMethod || 'unknown',
                needsReview: comp.data.needsReview,
                content: contentComp?.data.note,
                tags: contentComp?.data.tags,
                selections: comp.data.selections?.length || 0,
              })
            }
          }

          set({ items: newItems, loading: false })
        } catch (error) {
          console.error('[Recovery] Failed to load items:', error)
          set({ loading: false })
        }
      },

      acceptRecovery: async (entityId: string) => {
        const supabase = createClient()

        // Update needs_review to false
        await supabase
          .from('components')
          .update({ needs_review: false })
          .eq('entity_id', entityId)

        // For sparks, update Spark component
        await supabase
          .from('components')
          .update({
            data: supabase.rpc('jsonb_set', {
              target: 'data',
              path: '{needsReview}',
              value: 'false'
            })
          })
          .eq('entity_id', entityId)
          .eq('component_type', 'Spark')

        // Remove from items
        set((state) => {
          const newItems = new Map(state.items)
          newItems.delete(entityId)
          return { items: newItems }
        })
      },

      rejectRecovery: async (entityId: string) => {
        // Mark as lost/orphaned
        const supabase = createClient()

        await supabase
          .from('components')
          .update({
            recovery_method: 'lost',
            recovery_confidence: 0.0,
            needs_review: false
          })
          .eq('entity_id', entityId)

        set((state) => {
          const newItems = new Map(state.items)
          newItems.delete(entityId)
          return { items: newItems }
        })
      },

      manuallyRelink: async (entityId: string, chunkId: string) => {
        const supabase = createClient()

        // Update ChunkRef component
        await supabase
          .from('components')
          .update({
            data: supabase.rpc('jsonb_set', {
              target: 'data',
              path: '{chunkId}',
              value: `"${chunkId}"`
            })
          })
          .eq('entity_id', entityId)
          .eq('component_type', 'ChunkRef')

        // Mark as manually recovered
        await supabase
          .from('components')
          .update({
            recovery_method: 'manual',
            recovery_confidence: 1.0,
            needs_review: false
          })
          .eq('entity_id', entityId)

        set((state) => {
          const newItems = new Map(state.items)
          newItems.delete(entityId)
          return { items: newItems }
        })
      },

      setTypeFilter: (type) => set({ typeFilter: type }),
      setConfidenceFilter: (level) => set({ confidenceFilter: level }),
    }),
    {
      name: 'Recovery',
      enabled: process.env.NODE_ENV === 'development',
    }
  )
)
```

### Success Criteria

#### Automated Verification:
- [ ] Types compile: `npm run type-check`
- [ ] Stores export correctly: `npm run build`

#### Manual Verification:
- [ ] spark-store manages document-keyed state
- [ ] recovery-store filters by type and confidence
- [ ] Can load recovery items from database
- [ ] Accept/reject/relink operations work

**Service Restarts:**
- [ ] Next.js: Auto-reload on store changes

---

## Phase 8: Database Migration

### Overview

Create migration 057 to add recovery fields to components table and update sparks_cache table schema.

### Changes Required

#### 1. Migration File
**File**: `supabase/migrations/057_spark_recovery_fields.sql`
**Changes**: Create new migration

```sql
-- Migration 057: Spark recovery fields and sparks_cache updates
--
-- Changes:
-- 1. Add recovery fields to components table (if not exist)
-- 2. Update sparks_cache table with selections column
-- 3. Add indexes for recovery queries

-- 1. Ensure recovery fields exist on components table
-- (These may already exist from annotation recovery - idempotent)
DO $$
BEGIN
  -- Add recovery_method if not exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'components' AND column_name = 'recovery_method'
  ) THEN
    ALTER TABLE components ADD COLUMN recovery_method TEXT;

    ALTER TABLE components
    ADD CONSTRAINT components_recovery_method_check
    CHECK (recovery_method IS NULL OR recovery_method IN ('exact', 'context', 'chunk_bounded', 'trigram', 'semantic', 'selections', 'orphaned', 'manual', 'lost'));

    COMMENT ON COLUMN components.recovery_method IS 'Recovery method: exact, context, chunk_bounded, trigram, semantic, selections, orphaned, manual, lost';
  END IF;

  -- Add recovery_confidence if not exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'components' AND column_name = 'recovery_confidence'
  ) THEN
    ALTER TABLE components ADD COLUMN recovery_confidence FLOAT;

    ALTER TABLE components
    ADD CONSTRAINT components_recovery_confidence_check
    CHECK (recovery_confidence IS NULL OR (recovery_confidence >= 0.0 AND recovery_confidence <= 1.0));

    COMMENT ON COLUMN components.recovery_confidence IS 'Recovery confidence (0.0-1.0). >0.85=auto-recovered, 0.70-0.85=needs review, <0.70=lost';
  END IF;

  -- Add needs_review if not exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'components' AND column_name = 'needs_review'
  ) THEN
    ALTER TABLE components ADD COLUMN needs_review BOOLEAN DEFAULT FALSE;

    COMMENT ON COLUMN components.needs_review IS 'True if entity needs manual review after recovery';
  END IF;
END $$;

-- 2. Update sparks_cache table with selections column
ALTER TABLE sparks_cache
ADD COLUMN IF NOT EXISTS selections JSONB DEFAULT '[]';

COMMENT ON COLUMN sparks_cache.selections IS 'Array of SparkSelection objects (text, chunkId, offsets, textContext)';

-- 3. Add indexes for recovery queries
CREATE INDEX IF NOT EXISTS idx_components_needs_review
  ON components(needs_review)
  WHERE needs_review = true;

CREATE INDEX IF NOT EXISTS idx_components_recovery_method
  ON components(recovery_method)
  WHERE recovery_method IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_components_recovery_confidence
  ON components(recovery_confidence)
  WHERE recovery_confidence IS NOT NULL;

-- 4. Add index on sparks_cache for selections queries
CREATE INDEX IF NOT EXISTS idx_sparks_cache_selections
  ON sparks_cache USING gin(selections);

-- Success message
DO $$
BEGIN
  RAISE NOTICE 'Migration 057 complete: Spark recovery fields added';
END $$;
```

### Success Criteria

#### Automated Verification:
- [ ] Migration applies: `npx supabase db reset`
- [ ] No SQL errors
- [ ] Columns exist: `\d components` shows recovery fields
- [ ] Indexes created: `\d+ components` shows new indexes

#### Manual Verification:
- [ ] sparks_cache has selections column
- [ ] Check constraints enforce valid values
- [ ] Indexes used in recovery queries

**Service Restarts:**
- [ ] Supabase: `npx supabase db reset`

---

## Testing Strategy

### Unit Tests

**File**: `src/lib/ecs/__tests__/sparks.test.ts`

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { createECS } from '../ecs'
import { SparkOperations } from '../sparks'

describe('SparkOperations', () => {
  let ecs: ReturnType<typeof createECS>
  let ops: SparkOperations
  const userId = 'test-user-123'

  beforeEach(() => {
    ecs = createECS()
    ops = new SparkOperations(ecs, userId)
  })

  it('creates spark with 4 components', async () => {
    const sparkId = await ops.create({
      content: 'Test thought',
      selections: [],
      tags: ['test'],
      connections: [],
      chunkId: 'chunk-123',
      chunkIds: ['chunk-123', 'chunk-124'],
      documentId: 'doc-456'
    })

    expect(sparkId).toBeDefined()

    const entity = await ecs.getEntity(sparkId, userId)
    expect(entity).toBeDefined()

    const componentTypes = entity!.components?.map(c => c.component_type)
    expect(componentTypes).toContain('Spark')
    expect(componentTypes).toContain('Content')
    expect(componentTypes).toContain('Temporal')
    expect(componentTypes).toContain('ChunkRef')
  })

  it('reuses Content and Temporal components', async () => {
    const sparkId = await ops.create({
      content: 'Another thought',
      tags: ['reuse-test'],
      connections: [],
      chunkId: 'chunk-789',
      documentId: 'doc-456'
    })

    const entity = await ecs.getEntity(sparkId, userId)
    const content = entity!.components?.find(c => c.component_type === 'Content')
    const temporal = entity!.components?.find(c => c.component_type === 'Temporal')

    expect(content?.data.note).toBe('Another thought')
    expect(content?.data.tags).toEqual(['reuse-test'])
    expect(temporal?.data.createdAt).toBeDefined()
    expect(temporal?.data.updatedAt).toBeDefined()
  })

  it('extends ChunkRef with documentId', async () => {
    const sparkId = await ops.create({
      content: 'ChunkRef test',
      connections: [],
      chunkId: 'chunk-111',
      chunkIds: ['chunk-111', 'chunk-222'],
      documentId: 'doc-999'
    })

    const entity = await ecs.getEntity(sparkId, userId)
    const chunkRef = entity!.components?.find(c => c.component_type === 'ChunkRef')

    expect(chunkRef?.data.chunkId).toBe('chunk-111')
    expect(chunkRef?.data.chunk_id).toBe('chunk-111')
    expect(chunkRef?.data.documentId).toBe('doc-999')
    expect(chunkRef?.data.document_id).toBe('doc-999')
    expect(chunkRef?.data.chunkIds).toEqual(['chunk-111', 'chunk-222'])
  })
})
```

**File**: `worker/__tests__/recover-sparks.test.ts`

```typescript
import { describe, it, expect } from 'vitest'
import { recoverSparks } from '../handlers/recover-sparks'

describe('Spark Recovery', () => {
  it('recovers selection-based sparks using fuzzy matching', async () => {
    // TODO: Implement with test fixtures
    expect(true).toBe(true)
  })

  it('recovers thought-based sparks using semantic similarity', async () => {
    // TODO: Implement with test fixtures
    expect(true).toBe(true)
  })

  it('marks low-confidence sparks as orphaned', async () => {
    // TODO: Implement with test fixtures
    expect(true).toBe(true)
  })
})
```

### Integration Tests

**Manual Testing Checklist**:

#### ECS Pattern Testing:
- [ ] Create spark → verify 4 components in database
- [ ] Verify component names: Spark, Content, Temporal, ChunkRef (PascalCase)
- [ ] Verify data fields: camelCase (chunkId not chunk_id in JSONB)
- [ ] Query by documentId → uses ChunkRef.document_id filter

#### Multiple Selections Testing:
- [ ] Press Cmd+K → panel opens
- [ ] Select text → "Quote This" button appears
- [ ] Click "Quote This" → selection added to array
- [ ] Add 3 selections → all display separately
- [ ] Remove selection → array updates correctly
- [ ] Type thought in textarea → not mixed with selections
- [ ] Submit → selections passed to server action

#### Recovery Testing:
- [ ] Create spark with selection
- [ ] Reprocess document (edit content slightly)
- [ ] Run recovery → selection recovered with confidence score
- [ ] Create thought-only spark
- [ ] Reprocess document
- [ ] Run recovery → semantic matching finds new chunk
- [ ] Check needsReview flag for medium confidence

#### Obsidian Export Testing:
- [ ] Create 3 sparks (2 with selections, 1 thought-only)
- [ ] Export to Obsidian
- [ ] Verify `.sparks.md` file created
- [ ] Check YAML frontmatter complete
- [ ] Check selections formatted as quotes
- [ ] Open in Obsidian → renders correctly

#### Zustand Store Testing:
- [ ] spark-store: addSpark() prevents duplicates
- [ ] spark-store: updateSpark() updates correct spark
- [ ] recovery-store: filter by type (annotations vs sparks)
- [ ] recovery-store: filter by confidence (high/medium/low)
- [ ] recovery-store: acceptRecovery() removes from list

### Performance Testing

**Targets** (Personal Tool):
- Spark creation: <1s (Cmd+K → saved)
- Timeline load: <500ms (50 sparks from cache)
- Recovery: <30s per document (100 sparks)
- Obsidian export: <5s (background job)

**Monitoring**:
- Console logging for timing
- No automated performance tests (overkill for personal tool)

---

## Performance Considerations

### Personal Tool Philosophy

**Context**: Single user, ~100s of sparks expected, occasional recovery operations.

**Approach**: Simple, maintainable implementations over premature optimization.

### Cache Table Strategy

**Problem**: ECS queries slow for timeline (need to join 4 components per spark).

**Solution**: `sparks_cache` table with denormalized fields.

**Trade-off**:
- **Pro**: Sub-50ms queries for timeline/search
- **Con**: Dual writes (ECS + cache), cache staleness risk
- **Mitigation**: Cache is rebuildable from Storage (zero data loss)

**When to use**:
- Timeline queries: Always use cache
- Search queries: Always use cache
- CRUD operations: Always update both (ECS + cache)
- Debugging: Use SparkOperations.getRecent() (queries ECS directly)

### Recovery Performance

**Selection-based recovery**:
- 4-tier fuzzy matching per selection
- Worst case: ~50ms per selection (trigram fallback)
- 100 sparks × 2 selections avg = ~10 seconds total

**Semantic recovery**:
- Embedding similarity per spark
- Cached chunk embeddings (no re-generation)
- ~200ms per spark
- 100 sparks = ~20 seconds total

**Combined**: ~30 seconds for 100 sparks (acceptable for occasional operation)

### Obsidian Export

**Batch processing**:
- Group sparks by document
- Write once per document (not per spark)
- ~5 seconds for 10 documents with 100 total sparks

### Database Indexes

**Already exist**:
- `sparks_cache`: user_time, tags, embeddings, full-text
- `components`: needs_review, recovery_method, recovery_confidence

**Query patterns optimized**:
- Timeline: `(user_id, created_at DESC)` index
- Recovery UI: `needs_review = true` partial index
- Document filter: `document_id` in ChunkRef component

---

## Migration Notes

### Migrating Existing Sparks

**Current state**: Sparks use 2 components (`spark`, `source`) with snake_case fields.

**Migration strategy**:

1. **Create migration script**: `worker/scripts/migrate-sparks-to-4-component.ts`
2. **Read existing sparks**: Query components table for `component_type IN ('spark', 'source')`
3. **Transform to 4 components**:
   - `spark.content` → `Content.note`
   - `spark.tags` → `Content.tags`
   - `spark.created_at` → `Temporal.createdAt`
   - `spark.connections` → `Spark.connections`
   - `source.chunk_id` → `ChunkRef.chunkId`
   - `source.document_id` → `ChunkRef.documentId`
4. **Insert new components**: Create Content and Temporal components
5. **Update existing components**: Rename `spark` → `Spark`, `source` → `ChunkRef`
6. **Update cache table**: Rebuild from Storage (`rebuildSparksCache()`)

**No data loss**: Storage remains source of truth, can rollback if needed.

---

## References

### Existing Patterns Followed

- **ECS Implementation**: `src/lib/ecs/ecs.ts:27-333`
- **Annotation Pattern**: `src/lib/ecs/annotations.ts:62-367` (5-component, operations wrapper)
- **Component Types**: `src/lib/ecs/components.ts:1-235` (validators, type guards)
- **Annotation Recovery**: `worker/handlers/recover-annotations.ts:110-299` (4-tier fuzzy matching)
- **Fuzzy Matching**: `worker/lib/fuzzy-matching.ts:729-962` (chunk-bounded search)
- **Storage Helpers**: `worker/lib/storage-helpers.ts:33-105` (Blob wrapper, signed URLs)
- **Obsidian Export**: `worker/handlers/obsidian-sync.ts:119-187` (YAML + markdown)
- **Zustand Stores**: `src/stores/annotation-store.ts`, `src/stores/admin/background-jobs.ts`

### Documentation

- **ECS Guide**: `docs/ECS_IMPLEMENTATION.md`
- **Storage Patterns**: `docs/STORAGE_PATTERNS.md`
- **Zustand Rules**: `docs/ZUSTAND_RULES.md`
- **Testing Rules**: `docs/testing/TESTING_RULES.md`
- **Architecture**: `docs/ARCHITECTURE.md`

### Related Files

- Component definitions: `src/lib/ecs/components.ts`
- Spark types: `src/lib/sparks/types.ts`
- Server actions: `src/app/actions/sparks.ts`
- UI component: `src/components/reader/QuickSparkCapture.tsx`
- Cache migration: `supabase/migrations/054_create_sparks_cache.sql`

---

## Phase 6b: Link Annotations to Sparks

### Overview

Add ability to reference annotations from sparks, like citations for your thoughts. Users can link existing annotations to a spark while the spark panel is open, creating relationships between highlights and thoughts.

**Use Case**: "I'm thinking X (spark) because of these highlights I made (annotations)."

### Changes Required

#### 1. Update ECS Components (Phase 1 Extension)

**File**: `src/lib/ecs/components.ts`
**Changes**: Add annotation references field to SparkComponent

```typescript
/** Spark component data (spark-specific) */
export interface SparkComponent {
  /** Multiple text selections (can be empty for thought-only sparks) */
  selections: SparkSelection[];
  /** Connections to other chunks */
  connections: SparkConnection[];

  // Annotation references (NEW)
  /** Array of annotation entity IDs linked to this spark */
  annotationRefs?: string[];

  // Recovery metadata
  orphaned?: boolean;
  recoveryConfidence?: number;
  recoveryMethod?: 'selections' | 'semantic' | 'context' | 'orphaned';
  needsReview?: boolean;
  originalChunkContent?: string;
  originalChunkHash?: string;
}
```

#### 2. Extend SparkOperations (Phase 2 Extension)

**File**: `src/lib/ecs/sparks.ts`
**Changes**: Add methods for managing annotation references

```typescript
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
```

#### 3. Add Server Actions (Phase 3 Extension)

**File**: `src/app/actions/sparks.ts`
**Changes**: Add server actions for linking/unlinking annotations

```typescript
/**
 * Link annotation to spark
 */
export async function linkAnnotationToSpark(
  sparkId: string,
  annotationId: string
) {
  const user = await getCurrentUser()
  if (!user) throw new Error('Unauthorized')

  const ecs = createECS()
  const ops = new SparkOperations(ecs, user.id)

  await ops.addAnnotationRef(sparkId, annotationId)

  revalidatePath('/sparks')
  return { success: true }
}

/**
 * Unlink annotation from spark
 */
export async function unlinkAnnotationFromSpark(
  sparkId: string,
  annotationId: string
) {
  const user = await getCurrentUser()
  if (!user) throw new Error('Unauthorized')

  const ecs = createECS()
  const ops = new SparkOperations(ecs, user.id)

  await ops.removeAnnotationRef(sparkId, annotationId)

  revalidatePath('/sparks')
  return { success: true }
}
```

#### 4. Update QuickSparkCapture UI (Phase 4 Extension)

**File**: `src/components/reader/QuickSparkCapture.tsx`
**Changes**: Add annotations list with linking capability

```typescript
// Add to imports
import { getAnnotationsByDocument } from '@/app/actions/annotations'
import { AnnotationEntity } from '@/lib/ecs/components'

// Add state for annotations and linked refs
const [annotations, setAnnotations] = useState<AnnotationEntity[]>([])
const [linkedAnnotationIds, setLinkedAnnotationIds] = useState<string[]>([])
const [showAnnotations, setShowAnnotations] = useState(false)

// Fetch annotations when panel opens
useEffect(() => {
  if (isOpen) {
    getAnnotationsByDocument(documentId).then(setAnnotations)
  }
}, [isOpen, documentId])

// Reset linked annotations when panel closes
useEffect(() => {
  if (!isOpen) {
    setLinkedAnnotationIds([])
  }
}, [isOpen])

// Handle linking annotation
const handleLinkAnnotation = (annotationId: string) => {
  setLinkedAnnotationIds(prev => [...prev, annotationId])
}

// Handle unlinking annotation
const handleUnlinkAnnotation = (annotationId: string) => {
  setLinkedAnnotationIds(prev => prev.filter(id => id !== annotationId))
}

// Update handleSubmit to include annotation refs
const handleSubmit = async () => {
  if (!content.trim() || loading) return

  setLoading(true)
  try {
    // ... existing context building ...

    // Create spark with selections and annotation refs
    const result = await createSpark({
      content: content.trim(),
      selections,
      context: sparkContext
    })

    // Link annotations to the created spark
    if (linkedAnnotationIds.length > 0 && result.sparkId) {
      await Promise.all(
        linkedAnnotationIds.map(annotationId =>
          linkAnnotationToSpark(result.sparkId, annotationId)
        )
      )
    }

    closeSparkCapture()
    console.log('[Sparks] ✓ Created successfully with annotation links')
  } catch (error) {
    console.error('[Sparks] Failed to create:', error)
    alert('Failed to create spark. Please try again.')
  } finally {
    setLoading(false)
  }
}
```

**UI Section** (add after selections display, before textarea):

```typescript
{/* Linked Annotations Display */}
{linkedAnnotationIds.length > 0 && (
  <div className="space-y-2">
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <Highlighter className="w-3 h-3" />
      <span>{linkedAnnotationIds.length} linked annotation{linkedAnnotationIds.length !== 1 ? 's' : ''}</span>
    </div>
    <div className="flex flex-wrap gap-2">
      {linkedAnnotationIds.map((annotationId) => {
        const annotation = annotations.find(a => a.id === annotationId)
        if (!annotation) return null

        const position = annotation.components.Position
        const content = annotation.components.Content

        return (
          <div
            key={annotationId}
            className="group relative p-2 bg-muted/30 rounded border border-muted-foreground/20 text-xs"
          >
            <p className="pr-6 italic max-w-[200px] truncate">
              "{position.originalText}"
            </p>
            {content.tags.length > 0 && (
              <div className="flex gap-1 mt-1">
                {content.tags.slice(0, 2).map(tag => (
                  <Badge key={tag} variant="outline" className="h-4 text-[10px]">
                    #{tag}
                  </Badge>
                ))}
              </div>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="absolute top-1 right-1 h-5 w-5 p-0 opacity-0 group-hover:opacity-100"
              onClick={() => handleUnlinkAnnotation(annotationId)}
            >
              <X className="w-3 h-3" />
            </Button>
          </div>
        )
      })}
    </div>
  </div>
)}

{/* Annotations Browser (Collapsible) */}
{annotations.length > 0 && (
  <div className="space-y-2 border-t pt-2">
    <button
      onClick={() => setShowAnnotations(!showAnnotations)}
      className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground w-full"
    >
      <Highlighter className="w-3 h-3" />
      <span>
        {annotations.length} annotation{annotations.length !== 1 ? 's' : ''} in document
      </span>
      <ChevronDown
        className={`w-3 h-3 ml-auto transition-transform ${
          showAnnotations ? 'rotate-180' : ''
        }`}
      />
    </button>

    {showAnnotations && (
      <div className="max-h-[200px] overflow-y-auto space-y-2">
        {annotations
          .filter(a => !linkedAnnotationIds.includes(a.id))
          .map((annotation) => {
            const position = annotation.components.Position
            const content = annotation.components.Content
            const visual = annotation.components.Visual

            return (
              <div
                key={annotation.id}
                className="p-2 bg-muted/20 rounded border border-muted-foreground/10 hover:border-muted-foreground/30 transition-colors"
              >
                <div className="flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs italic truncate">
                      "{position.originalText}"
                    </p>
                    {content.note && (
                      <p className="text-xs text-muted-foreground mt-1 truncate">
                        {content.note}
                      </p>
                    )}
                    {content.tags.length > 0 && (
                      <div className="flex gap-1 mt-1">
                        {content.tags.slice(0, 3).map(tag => (
                          <Badge key={tag} variant="outline" className="h-4 text-[10px]">
                            #{tag}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleLinkAnnotation(annotation.id)}
                    className="text-xs h-7 shrink-0"
                  >
                    Link
                  </Button>
                </div>
              </div>
            )
          })}
      </div>
    )}
  </div>
)}
```

Don't forget to add ChevronDown import:
```typescript
import { Zap, Loader2, X, Tag, Link, Hash, Quote, Highlighter, ChevronDown } from 'lucide-react'
```

### Success Criteria

#### Automated Verification:
- [ ] Types compile: `npm run build`
- [ ] No TypeScript errors in components.ts
- [ ] No TypeScript errors in sparks.ts
- [ ] No TypeScript errors in server actions
- [ ] No TypeScript errors in QuickSparkCapture.tsx

#### Manual Verification:
- [ ] Can see annotations list in spark panel (collapsed by default)
- [ ] Can expand/collapse annotations list
- [ ] "Link" button adds annotation to linked list
- [ ] Linked annotations display as removable chips
- [ ] Can remove linked annotation with X button
- [ ] Linked annotations excluded from browser list
- [ ] Annotations saved with spark on submit
- [ ] annotationRefs field populated in Spark component
- [ ] Multiple annotations can be linked to one spark

#### Integration Testing:
- [ ] Create spark with no linked annotations (works as before)
- [ ] Create spark with 1 linked annotation
- [ ] Create spark with 3+ linked annotations
- [ ] Verify annotationRefs array in database components table
- [ ] Verify Temporal.updatedAt updates when linking/unlinking

**Service Restarts:**
- [ ] Next.js: Auto-reload on component/action changes

**Implementation Note**: Purely additive feature. `annotationRefs` is optional, so existing sparks continue to work without changes.

---

## Success Metrics

1. **Architectural Consistency**: All entities use same component patterns
2. **Component Reuse**: Content, Temporal, ChunkRef shared across entities
3. **Naming Consistency**: PascalCase components, camelCase data, snake_case DB columns
4. **Recovery Success**: >85% auto-recovery rate for sparks
5. **Performance**: Timeline <500ms, recovery <30s, Obsidian export <5s
6. **Data Integrity**: Zero data loss on cache rebuild from Storage

---

## Next Steps After Implementation

1. **Flashcards**: Apply same 4-component pattern (Flashcard, Content, Temporal, ChunkRef)
2. **Study Sessions**: Apply same pattern with study-specific component
3. **Threads**: Group sparks with threading metadata component
4. **Consolidated Recovery UI**: Single tab in Admin Panel (filter by entity type)
5. **Background Job for Embeddings**: Generate embeddings for sparks_cache asynchronously

**The pattern is established. Future entities follow the same architecture.**
