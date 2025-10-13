# Spark System - Complete Implementation Guide

**Created**: 2025-10-06
**Status**: Ready for Implementation
**Estimated Duration**: 4 weeks
**Cost**: ~$0.13/month for 100 sparks/week

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Architecture Overview](#architecture-overview)
3. [Implementation Phases](#implementation-phases)
4. [File Reference](#file-reference)
5. [Database Migrations](#database-migrations)
6. [Code Patterns](#code-patterns)
7. [Testing Strategy](#testing-strategy)
8. [Performance & Costs](#performance--costs)

---

## Executive Summary

### What Are Sparks?

**Sparks are "cognitive event captures"** that preserve:
- The thought itself (text content)
- Complete app context when thought occurred
- All visible chunks, connections, and navigation state

Think of it as a screenshot of your mind + app state that triggered it.

### The Value Proposition

Unlike traditional notes:
- **Annotations**: Mark specific text (static, location-bound)
- **Sparks**: Capture thoughts WITH context (dynamic, relationship-aware)
- **Threads**: Synthesize sparks into creative output

**Key Innovation**: Sparks know you weren't randomly thinking about capitalism - you were reacting to Deleuze while viewing Pynchon connections at 2:47pm after navigating from Bataille.

### Use Cases

**1. Fiction Writer's Serendipity Machine**
- Write scene about surveillance
- System surfaces 6-month-old spark about "control as modulation"
- Click breadcrumb → restore exact reading context
- Discover forgotten connection to debugging notes
- Scene crystallizes: "surveillance as recursive function"

**2. Researcher's Contradiction Tracker**
- Multiple sparks across texts express opposing views
- System detects conceptual tension (same concepts, opposite polarity)
- Auto-suggests thread: "Freedom-Control Paradox"
- Surfaces when writing about either concept

**3. Temporal Knowledge Graph**
- Sparks about "entropy" across thermodynamics, info theory, software
- System connects via tags + ThematicBridge
- Writing fiction → ALL three domains surface simultaneously

---

## Architecture Overview

### Hybrid File + Index Pattern

```
FILES (Source of Truth)          INDEX (Query Cache)
     ↓                                ↓
Supabase Storage               PostgreSQL
spark_xyz.json           →     spark_index table
     ↓                                ↓
Complete entity data         Fast queries (timeline, search)
     ↓                                ↓
  Rebuildable               ← Sync on every write
```

**Why This Works**:
1. **Portability**: JSON files = git-friendly, verifiable, exportable
2. **Performance**: Index = fast queries without loading files
3. **Integrity**: Files = source of truth, index can rebuild
4. **Evolution**: Add components without schema migrations

### ECS Component Structure

```typescript
Entity: spark_1234567890_abc
Components:
  - Content: {
      text: string
      created_at: string
      updated_at?: string
    }

  - ContextRef: {
      document_id: string
      visible_chunks: string[]
      scroll_position: number
      active_connections: Array<{
        target_chunk: string
        target_doc: string
        type: string
        strength: number
      }>
      engine_weights: {
        semantic: number
        contradiction: number
        bridge: number
      }
      navigation_trail: Array<{
        doc: string
        chunk: string
        timestamp: string
      }>
    }

  - Selection?: {
      text: string
      chunk_id: string
      start_offset: number
      end_offset: number
    }

  - Tags?: { values: string[] }

  - ChunkRefs: {
      mentioned: string[]  // /chunk_id references
      origin: string       // Chunk where created
    }

  - ThreadMembership?: {
      thread_id: string
      position: number
    }

  - SearchVector?: {
      embedding: number[]  // 768-dim
    }
```

### Data Flow

**Capture Flow** (Cmd+K):
```
1. User presses Cmd+K while reading
2. SparkCapture modal opens
3. System snapshots current context:
   - visibleChunkIds from ReaderLayout state
   - scrollPosition from scroll event
   - activeConnections from ConnectionsList
   - engineWeights from user preferences
   - navigationTrail from reader history
4. User types thought, hits Enter
5. Extract mentions (/chunk-ref, #tags)
6. Generate embedding (768-dim, ~200ms)
7. Build SparkEntity with all components
8. Save to file (source of truth)
9. Sync to index (query cache)
10. Create graph connections (origin chunk → spark)
```

**Resurrection Flow**:
```
1. Writing mode: Type keyword → Sidebar updates
2. Search: Cmd+K → Semantic search via vector
3. Timeline: Browse chronologically
4. Graph: Sparks as nodes in chunk connections
5. Click spark → Load full entity from file
6. Click breadcrumb → Restore context:
   - Navigate to document
   - Scroll to exact position
   - Highlight visible chunks
   - Load connections from that moment
   - Show navigation trail
```

---

## Implementation Phases

### Phase 1: Foundation (Week 1)

**Goal**: Set up storage, schemas, and file-based ECS

#### Tasks

**1.1 Database Migrations**

Create `044_extend_connections_for_entities.sql`:
```sql
-- Add entity reference columns (nullable for backwards compatibility)
ALTER TABLE connections ADD COLUMN source_entity_id TEXT;
ALTER TABLE connections ADD COLUMN target_entity_id TEXT;
ALTER TABLE connections ADD COLUMN source_entity_type TEXT
  CHECK (source_entity_type IN ('spark', 'annotation', 'thread'));
ALTER TABLE connections ADD COLUMN target_entity_type TEXT
  CHECK (target_entity_type IN ('spark', 'annotation', 'thread'));

-- Update constraint: require at least one source and target
ALTER TABLE connections DROP CONSTRAINT connections_no_self_reference;
ALTER TABLE connections ADD CONSTRAINT connections_valid_references CHECK (
  (source_chunk_id IS NOT NULL OR source_entity_id IS NOT NULL) AND
  (target_chunk_id IS NOT NULL OR target_entity_id IS NOT NULL)
);

-- New indexes for entity lookups
CREATE INDEX idx_connections_source_entity ON connections(source_entity_id)
  WHERE source_entity_id IS NOT NULL;
CREATE INDEX idx_connections_target_entity ON connections(target_entity_id)
  WHERE target_entity_id IS NOT NULL;

COMMENT ON COLUMN connections.source_entity_id IS 'Entity ID if source is not a chunk (e.g., spark_123)';
COMMENT ON COLUMN connections.target_entity_id IS 'Entity ID if target is not a chunk';
```

Create `045_create_spark_index.sql`:
```sql
-- Minimal index for query performance
-- Files are source of truth, this is rebuildable cache
CREATE TABLE spark_index (
  entity_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,

  -- Searchable content
  content_text TEXT NOT NULL,
  content_vector vector(768),

  -- Timeline fields
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ,

  -- Tag-based queries
  tags TEXT[] DEFAULT '{}',

  -- Graph integration
  origin_chunk_id TEXT NOT NULL,
  mentioned_chunks TEXT[] DEFAULT '{}',

  -- Threading
  thread_id TEXT,
  thread_position INTEGER,

  -- File reference (for verification)
  file_path TEXT NOT NULL
);

-- Indexes for fast queries
CREATE INDEX idx_spark_created ON spark_index(created_at DESC);
CREATE INDEX idx_spark_user ON spark_index(user_id);
CREATE INDEX idx_spark_tags ON spark_index USING gin(tags);
CREATE INDEX idx_spark_thread ON spark_index(thread_id) WHERE thread_id IS NOT NULL;
CREATE INDEX idx_spark_origin ON spark_index(origin_chunk_id);
CREATE INDEX idx_spark_vector ON spark_index USING ivfflat(content_vector vector_cosine_ops);

-- Vector search function
CREATE OR REPLACE FUNCTION match_sparks(
  query_embedding vector(768),
  match_threshold float,
  match_count int,
  filter_user_id text
)
RETURNS TABLE (
  entity_id text,
  content_text text,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    spark_index.entity_id,
    spark_index.content_text,
    1 - (spark_index.content_vector <=> query_embedding) as similarity
  FROM spark_index
  WHERE
    spark_index.user_id = filter_user_id
    AND 1 - (spark_index.content_vector <=> query_embedding) > match_threshold
  ORDER BY spark_index.content_vector <=> query_embedding
  LIMIT match_count;
END;
$$;

COMMENT ON TABLE spark_index IS 'Rebuildable query cache for sparks. Files are source of truth.';
COMMENT ON FUNCTION match_sparks IS 'Vector similarity search for sparks using cosine distance';
```

Create `046_create_thread_suggestions.sql`:
```sql
CREATE TABLE thread_suggestions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  spark_ids TEXT[] NOT NULL,
  suggested_title TEXT NOT NULL,
  strength FLOAT NOT NULL CHECK (strength >= 0 AND strength <= 1),
  reason TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  dismissed BOOLEAN DEFAULT false
);

CREATE INDEX idx_thread_suggestions_user ON thread_suggestions(user_id)
  WHERE dismissed = false;

COMMENT ON TABLE thread_suggestions IS 'Auto-detected thread suggestions from spark clustering';
```

Create `047_disable_spark_index_rls.sql`:
```sql
-- Disable RLS for dev (single user)
ALTER TABLE spark_index DISABLE ROW LEVEL SECURITY;
ALTER TABLE thread_suggestions DISABLE ROW LEVEL SECURITY;
```

**1.2 Storage Bucket**

Via Supabase dashboard or SQL:
```sql
INSERT INTO storage.buckets (id, name, public)
VALUES ('entities', 'entities', false);

CREATE POLICY "Users can access their own entities"
  ON storage.objects FOR ALL
  USING (bucket_id = 'entities' AND auth.uid()::text = (storage.foldername(name))[1]);
```

File structure:
```
entities/
└── dev-user-123/
    ├── sparks/
    │   ├── spark_1234_abc.json
    │   └── spark_5678_def.json
    ├── threads/
    │   └── thread_9012_ghi.json
    └── annotations/  (future)
```

**1.3 File-Based ECS**

Create `src/lib/ecs/file-entity.ts`:
```typescript
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export type EntityType = 'spark' | 'thread' | 'annotation'

export interface Entity<T = any> {
  entity: string
  components: T
}

/**
 * Generate a unique entity ID with type prefix.
 * Format: {type}_{timestamp}_{random}
 */
export function generateEntityId(type: EntityType): string {
  const timestamp = Date.now().toString(36)
  const random = Math.random().toString(36).substring(2, 7)
  return `${type}_${timestamp}_${random}`
}

/**
 * Load an entity from Supabase Storage.
 */
export async function loadEntity<T = any>(
  entityId: string,
  type: EntityType,
  userId: string
): Promise<Entity<T> | null> {
  const filePath = `${userId}/${type}s/${entityId}.json`

  const { data, error } = await supabase.storage
    .from('entities')
    .download(filePath)

  if (error) {
    console.error(`Failed to load entity ${entityId}:`, error)
    return null
  }

  const text = await data.text()
  return JSON.parse(text)
}

/**
 * Save an entity to Supabase Storage.
 * Uses upsert to allow updates.
 */
export async function saveEntity(
  entity: Entity,
  type: EntityType,
  userId: string
): Promise<void> {
  const filePath = `${userId}/${type}s/${entity.entity}.json`

  const { error } = await supabase.storage
    .from('entities')
    .upload(filePath, JSON.stringify(entity, null, 2), {
      upsert: true,
      contentType: 'application/json'
    })

  if (error) {
    throw new Error(`Failed to save entity ${entity.entity}: ${error.message}`)
  }
}

/**
 * Delete an entity from storage.
 */
export async function deleteEntity(
  entityId: string,
  type: EntityType,
  userId: string
): Promise<void> {
  const filePath = `${userId}/${type}s/${entityId}.json`

  const { error } = await supabase.storage
    .from('entities')
    .remove([filePath])

  if (error) {
    throw new Error(`Failed to delete entity ${entityId}: ${error.message}`)
  }
}

/**
 * Query entities from storage with optional predicate.
 * This loads all files - use index for large queries.
 */
export async function queryEntities<T = any>(
  type: EntityType,
  userId: string,
  predicate?: (entity: Entity<T>) => boolean
): Promise<Entity<T>[]> {
  const { data: files, error } = await supabase.storage
    .from('entities')
    .list(`${userId}/${type}s`)

  if (error) {
    throw new Error(`Failed to list entities: ${error.message}`)
  }

  const entities = await Promise.all(
    files.map(f => loadEntity<T>(f.name.replace('.json', ''), type, userId))
  )

  const validEntities = entities.filter((e): e is Entity<T> => e !== null)

  if (predicate) {
    return validEntities.filter(predicate)
  }

  return validEntities
}

/**
 * Add a component to an existing entity.
 */
export async function addComponent<T = any>(
  entityId: string,
  type: EntityType,
  userId: string,
  componentName: string,
  componentData: T
): Promise<void> {
  const entity = await loadEntity(entityId, type, userId)
  if (!entity) {
    throw new Error(`Entity ${entityId} not found`)
  }

  entity.components[componentName] = componentData
  await saveEntity(entity, type, userId)
}

/**
 * Remove a component from an entity.
 */
export async function removeComponent(
  entityId: string,
  type: EntityType,
  userId: string,
  componentName: string
): Promise<void> {
  const entity = await loadEntity(entityId, type, userId)
  if (!entity) {
    throw new Error(`Entity ${entityId} not found`)
  }

  delete entity.components[componentName]
  await saveEntity(entity, type, userId)
}
```

**1.4 Index Sync**

Create `src/lib/ecs/sync.ts`:
```typescript
import { createClient } from '@supabase/supabase-js'
import type { SparkEntity } from '@/types/spark'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

/**
 * Sync a spark entity to the index for fast queries.
 * Files are source of truth, index is rebuildable cache.
 */
export async function syncSparkToIndex(
  spark: SparkEntity,
  userId: string
): Promise<void> {
  const { error } = await supabase
    .from('spark_index')
    .upsert({
      entity_id: spark.entity,
      user_id: userId,
      content_text: spark.components.Content.text,
      content_vector: spark.components.SearchVector?.embedding || null,
      tags: spark.components.Tags?.values || [],
      created_at: spark.components.Content.created_at,
      updated_at: spark.components.Content.updated_at || null,
      origin_chunk_id: spark.components.ChunkRefs.origin,
      mentioned_chunks: spark.components.ChunkRefs.mentioned,
      thread_id: spark.components.ThreadMembership?.thread_id || null,
      thread_position: spark.components.ThreadMembership?.position || null,
      file_path: `${userId}/sparks/${spark.entity}.json`
    })

  if (error) {
    console.error('Failed to sync spark to index:', error)
    throw error
  }
}

/**
 * Delete a spark from the index.
 */
export async function deleteSparkFromIndex(
  entityId: string
): Promise<void> {
  const { error } = await supabase
    .from('spark_index')
    .delete()
    .eq('entity_id', entityId)

  if (error) {
    console.error('Failed to delete spark from index:', error)
    throw error
  }
}

/**
 * Rebuild the entire spark index from files.
 * Use for integrity verification or after major changes.
 */
export async function rebuildSparkIndex(userId: string): Promise<void> {
  console.log('🔄 Rebuilding spark index from files...')

  // Load all spark entities from files
  const { data: files, error: listError } = await supabase.storage
    .from('entities')
    .list(`${userId}/sparks`)

  if (listError) {
    throw new Error(`Failed to list sparks: ${listError.message}`)
  }

  console.log(`Found ${files.length} spark files`)

  // Delete existing index entries for this user
  await supabase
    .from('spark_index')
    .delete()
    .eq('user_id', userId)

  // Load and sync each spark
  for (const file of files) {
    const entityId = file.name.replace('.json', '')
    const { data, error } = await supabase.storage
      .from('entities')
      .download(`${userId}/sparks/${file.name}`)

    if (error) {
      console.error(`Failed to load ${entityId}:`, error)
      continue
    }

    const text = await data.text()
    const spark = JSON.parse(text) as SparkEntity

    await syncSparkToIndex(spark, userId)
  }

  console.log('✅ Index rebuild complete')
}

/**
 * Verify index integrity by comparing file count to index count.
 */
export async function verifyIndexIntegrity(userId: string): Promise<boolean> {
  // Count files
  const { data: files } = await supabase.storage
    .from('entities')
    .list(`${userId}/sparks`)

  const fileCount = files?.length || 0

  // Count index entries
  const { count } = await supabase
    .from('spark_index')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)

  const indexCount = count || 0

  if (fileCount !== indexCount) {
    console.warn(`⚠️ Index mismatch: ${fileCount} files, ${indexCount} index entries`)
    return false
  }

  return true
}
```

**1.5 TypeScript Types**

Create `src/types/spark.ts`:
```typescript
// Component type definitions
export interface ContentComponent {
  text: string
  created_at: string
  updated_at?: string
}

export interface ContextRefComponent {
  document_id: string
  visible_chunks: string[]
  scroll_position: number
  active_connections: Array<{
    target_chunk: string
    target_doc: string
    type: string
    strength: number
  }>
  engine_weights: {
    semantic: number
    contradiction: number
    bridge: number
  }
  navigation_trail: Array<{
    doc: string
    chunk: string
    timestamp: string
  }>
}

export interface SelectionComponent {
  text: string
  chunk_id: string
  start_offset: number
  end_offset: number
}

export interface TagsComponent {
  values: string[]
}

export interface ChunkRefsComponent {
  mentioned: string[]  // Chunks explicitly linked via /
  origin: string       // Chunk where spark was created
}

export interface ThreadMembershipComponent {
  thread_id: string
  position: number
}

export interface SearchVectorComponent {
  embedding: number[]  // 768-dim vector
}

// Spark entity type
export interface SparkEntity {
  entity: string
  components: {
    Content: ContentComponent
    ContextRef: ContextRefComponent
    Selection?: SelectionComponent
    Tags?: TagsComponent
    ChunkRefs: ChunkRefsComponent
    ThreadMembership?: ThreadMembershipComponent
    SearchVector?: SearchVectorComponent
  }
}

// API types
export interface CreateSparkInput {
  content: string
  context: {
    documentId: string
    visibleChunks: string[]
    scrollY: number
    connections: any[]
    engineWeights: any
    navigationTrail: any[]
    selection?: {
      text: string
      chunkId: string
      startOffset: number
      endOffset: number
    }
  }
}

export interface SparkPreview {
  entity_id: string
  preview: string
  created_at: string
  tags: string[]
  thread_id?: string
  origin_chunk_id: string
}

export interface ThreadSuggestion {
  sparks: string[]
  title: string
  strength: number
  reason: string
}
```

---

### Phase 2: Core Capture (Week 2)

**Goal**: Build spark creation system and UI

#### Tasks

**2.1 Create System**

Create `src/lib/systems/createSpark.ts`:
```typescript
import { embed } from 'ai'
import { google } from '@ai-sdk/google'
import type { CreateSparkInput, SparkEntity } from '@/types/spark'
import { generateEntityId, saveEntity } from '@/lib/ecs/file-entity'
import { syncSparkToIndex } from '@/lib/ecs/sync'

/**
 * Extract mentions from spark content.
 * - /chunk_id or /document-name → chunks
 * - #tag-name → tags
 * - @quote or "text" → quotes
 */
function extractMentions(content: string): {
  chunks: string[]
  tags: string[]
  quotes: string[]
} {
  const chunks: string[] = []
  const tags: string[] = []
  const quotes: string[] = []

  // Extract chunk references: /chunk_id or /document-name
  const chunkMatches = content.matchAll(/\/([a-z0-9_-]+)/gi)
  for (const match of chunkMatches) {
    chunks.push(match[1])
  }

  // Extract tags: #tag-name
  const tagMatches = content.matchAll(/#([a-z0-9_-]+)/gi)
  for (const match of tagMatches) {
    tags.push(match[1].toLowerCase())
  }

  // Extract quotes: @quote or text in quotes
  const quoteMatches = content.matchAll(/@quote|"([^"]+)"/gi)
  for (const match of quoteMatches) {
    if (match[1]) quotes.push(match[1])
  }

  return { chunks, tags, quotes }
}

/**
 * Create a new spark entity with full context.
 */
export async function createSpark(
  input: CreateSparkInput,
  userId: string
): Promise<SparkEntity> {
  const entityId = generateEntityId('spark')
  const mentions = extractMentions(input.content)

  // Generate embedding for semantic search
  const { embedding } = await embed({
    model: google.textEmbeddingModel('text-embedding-004', {
      outputDimensionality: 768
    }),
    value: input.content
  })

  // Build spark entity
  const spark: SparkEntity = {
    entity: entityId,
    components: {
      Content: {
        text: input.content,
        created_at: new Date().toISOString()
      },

      ContextRef: {
        document_id: input.context.documentId,
        visible_chunks: input.context.visibleChunks,
        scroll_position: input.context.scrollY,
        active_connections: input.context.connections,
        engine_weights: input.context.engineWeights,
        navigation_trail: input.context.navigationTrail
      },

      ChunkRefs: {
        mentioned: mentions.chunks,
        origin: input.context.visibleChunks[0] || ''
      },

      SearchVector: {
        embedding: embedding
      }
    }
  }

  // Add optional components
  if (input.context.selection) {
    spark.components.Selection = {
      text: input.context.selection.text,
      chunk_id: input.context.selection.chunkId,
      start_offset: input.context.selection.startOffset,
      end_offset: input.context.selection.endOffset
    }
  }

  if (mentions.tags.length > 0) {
    spark.components.Tags = {
      values: mentions.tags
    }
  }

  // Save to file system (source of truth)
  await saveEntity(spark, 'spark', userId)

  // Sync to index (query cache)
  await syncSparkToIndex(spark, userId)

  return spark
}

/**
 * Update an existing spark.
 */
export async function updateSpark(
  entityId: string,
  userId: string,
  updates: Partial<{
    content: string
    tags: string[]
  }>
): Promise<SparkEntity> {
  const { loadEntity } = await import('@/lib/ecs/file-entity')

  const spark = await loadEntity<SparkEntity['components']>(entityId, 'spark', userId)
  if (!spark) {
    throw new Error(`Spark ${entityId} not found`)
  }

  // Update content if provided
  if (updates.content) {
    spark.components.Content.text = updates.content
    spark.components.Content.updated_at = new Date().toISOString()

    // Re-extract mentions
    const mentions = extractMentions(updates.content)
    spark.components.ChunkRefs.mentioned = mentions.chunks

    // Regenerate embedding
    const { embedding } = await embed({
      model: google.textEmbeddingModel('text-embedding-004', {
        outputDimensionality: 768
      }),
      value: updates.content
    })

    if (spark.components.SearchVector) {
      spark.components.SearchVector.embedding = embedding
    }
  }

  // Update tags if provided
  if (updates.tags) {
    spark.components.Tags = {
      values: updates.tags
    }
  }

  // Save and sync
  await saveEntity(spark, 'spark', userId)
  await syncSparkToIndex(spark as SparkEntity, userId)

  return spark as SparkEntity
}
```

**2.2 Enhanced Reader Context**

Create `src/hooks/useReaderContext.ts`:
```typescript
'use client'

import { useState, useCallback, useEffect } from 'react'

export interface ReaderContext {
  documentId: string
  documentTitle: string
  visibleChunks: string[]
  currentChunkIndex: number
  scrollPosition: number
  activeConnections: Array<{
    target_chunk: string
    target_doc: string
    type: string
    strength: number
  }>
  engineWeights: {
    semantic: number
    contradiction: number
    bridge: number
  }
  navigationTrail: Array<{
    doc: string
    chunk: string
    timestamp: string
  }>
  selection: {
    text: string
    chunkId: string
    startOffset: number
    endOffset: number
  } | null
}

/**
 * Hook to track complete reader context for spark capture.
 */
export function useReaderContext(
  documentId: string,
  documentTitle: string,
  chunks: Array<{ id: string }>
) {
  const [context, setContext] = useState<ReaderContext>({
    documentId,
    documentTitle,
    visibleChunks: [],
    currentChunkIndex: 0,
    scrollPosition: 0,
    activeConnections: [],
    engineWeights: {
      semantic: 0.25,
      contradiction: 0.40,
      bridge: 0.35
    },
    navigationTrail: [],
    selection: null
  })

  // Update visible chunks
  const setVisibleChunks = useCallback((chunkIds: string[]) => {
    setContext(prev => ({
      ...prev,
      visibleChunks: chunkIds,
      currentChunkIndex: chunks.findIndex(c => c.id === chunkIds[0])
    }))
  }, [chunks])

  // Track scroll position
  const handleScroll = useCallback((scrollY: number) => {
    setContext(prev => ({ ...prev, scrollPosition: scrollY }))
  }, [])

  // Update active connections
  const setActiveConnections = useCallback((connections: any[]) => {
    setContext(prev => ({ ...prev, activeConnections: connections }))
  }, [])

  // Add to navigation trail
  const addToTrail = useCallback((chunkId: string) => {
    setContext(prev => ({
      ...prev,
      navigationTrail: [
        ...prev.navigationTrail,
        {
          doc: documentId,
          chunk: chunkId,
          timestamp: new Date().toISOString()
        }
      ].slice(-10) // Keep last 10 jumps
    }))
  }, [documentId])

  // Track text selection
  const updateSelection = useCallback(() => {
    const selection = window.getSelection()
    const selectedText = selection?.toString()

    if (selectedText && selectedText.length > 0) {
      // Find which chunk contains the selection
      const range = selection?.getRangeAt(0)
      const container = range?.startContainer
      const chunkElement = container?.parentElement?.closest('[data-chunk-id]')
      const chunkId = chunkElement?.getAttribute('data-chunk-id')

      if (chunkId) {
        setContext(prev => ({
          ...prev,
          selection: {
            text: selectedText,
            chunkId,
            startOffset: range?.startOffset || 0,
            endOffset: range?.endOffset || 0
          }
        }))
      }
    } else {
      setContext(prev => ({ ...prev, selection: null }))
    }
  }, [])

  // Listen for selection changes
  useEffect(() => {
    document.addEventListener('selectionchange', updateSelection)
    return () => document.removeEventListener('selectionchange', updateSelection)
  }, [updateSelection])

  return {
    context,
    setVisibleChunks,
    handleScroll,
    setActiveConnections,
    addToTrail
  }
}
```

Update `src/components/reader/ReaderLayout.tsx`:
```typescript
// Replace visibleChunkIds state with full context
import { useReaderContext } from '@/hooks/useReaderContext'

export function ReaderLayout({ documentId, document, ... }) {
  // Enhanced context tracking
  const {
    context,
    setVisibleChunks,
    handleScroll,
    setActiveConnections,
    addToTrail
  } = useReaderContext(documentId, document.title, chunks)

  // Pass to DocumentViewer
  <DocumentViewer
    onVisibleChunksChange={setVisibleChunks}
    onScroll={handleScroll}
    // ...
  />

  // Pass to RightPanel
  <RightPanel
    visibleChunkIds={context.visibleChunks}
    onConnectionsLoad={setActiveConnections}
    // ...
  />

  // Pass to SparkCapture
  <SparkCapture readerContext={context} />
}
```

**2.3 Spark Capture UI**

Create `src/components/spark/SparkCapture.tsx`:
```typescript
'use client'

import { useState, useEffect } from 'react'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Zap } from 'lucide-react'
import type { ReaderContext } from '@/hooks/useReaderContext'

interface SparkCaptureProps {
  readerContext: ReaderContext
}

export function SparkCapture({ readerContext }: SparkCaptureProps) {
  const [open, setOpen] = useState(false)
  const [content, setContent] = useState('')
  const [saving, setSaving] = useState(false)

  // Cmd+K hotkey
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setOpen(true)

        // Auto-quote selection if exists
        if (readerContext.selection?.text) {
          setContent(`> "${readerContext.selection.text}"\n\n`)
        }
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [readerContext.selection])

  const handleSubmit = async () => {
    if (!content.trim()) return

    setSaving(true)
    try {
      const res = await fetch('/api/sparks', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': 'dev-user-123'
        },
        body: JSON.stringify({
          content,
          context: {
            documentId: readerContext.documentId,
            visibleChunks: readerContext.visibleChunks,
            scrollY: readerContext.scrollPosition,
            connections: readerContext.activeConnections,
            engineWeights: readerContext.engineWeights,
            navigationTrail: readerContext.navigationTrail,
            selection: readerContext.selection
          }
        })
      })

      if (!res.ok) throw new Error('Failed to create spark')

      setContent('')
      setOpen(false)
    } catch (error) {
      console.error('Failed to save spark:', error)
      alert('Failed to save spark')
    } finally {
      setSaving(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      handleSubmit()
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-2xl">
        <div className="flex items-center gap-2 mb-4">
          <Zap className="w-5 h-5 text-yellow-500" />
          <h2 className="text-lg font-semibold">Spark</h2>
          <kbd className="ml-auto text-xs text-muted-foreground">Cmd+K</kbd>
        </div>

        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Capture your thought..."
          className="w-full min-h-[120px] p-3 border rounded-md resize-none focus:outline-none focus:ring-2 focus:ring-yellow-500"
          autoFocus
          disabled={saving}
        />

        <div className="text-sm text-muted-foreground space-y-1">
          <div>
            Context: {readerContext.documentTitle} - Chunk {readerContext.currentChunkIndex}
            {readerContext.activeConnections.length > 0 &&
              ` • ${readerContext.activeConnections.length} connections`}
          </div>

          <div className="flex gap-4 text-xs">
            <span><kbd>/</kbd> link chunk</span>
            <span><kbd>#</kbd> tag</span>
            <span><kbd>@quote</kbd> quote selection</span>
          </div>
        </div>

        <div className="flex gap-2 justify-end">
          <button
            onClick={() => setOpen(false)}
            className="px-4 py-2 text-sm rounded hover:bg-gray-100"
            disabled={saving}
          >
            Cancel <kbd className="ml-2">Esc</kbd>
          </button>
          <button
            onClick={handleSubmit}
            className="px-4 py-2 text-sm bg-yellow-500 text-white rounded hover:bg-yellow-600 disabled:opacity-50"
            disabled={saving}
          >
            {saving ? 'Saving...' : 'Save'} <kbd className="ml-2">⏎</kbd>
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
```

**2.4 API Route**

Create `src/app/api/sparks/route.ts`:
```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createSpark } from '@/lib/systems/createSpark'
import type { CreateSparkInput } from '@/types/spark'

// POST /api/sparks - Create spark
export async function POST(req: NextRequest) {
  const userId = req.headers.get('x-user-id')
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const input: CreateSparkInput = await req.json()

    // Create spark entity
    const spark = await createSpark(input, userId)

    return NextResponse.json({ spark })
  } catch (error) {
    console.error('Failed to create spark:', error)
    return NextResponse.json(
      { error: 'Failed to create spark' },
      { status: 500 }
    )
  }
}
```

**2.5 Integration**

Update `src/components/reader/ReaderLayout.tsx` to include SparkCapture:
```typescript
import { SparkCapture } from '@/components/spark/SparkCapture'

export function ReaderLayout({ ... }) {
  const { context, ... } = useReaderContext(...)

  return (
    <div className="flex h-screen">
      <DocumentViewer ... />
      <RightPanel ... />

      {/* Spark capture - always available via Cmd+K */}
      <SparkCapture readerContext={context} />
    </div>
  )
}
```

---

### Phase 3: Resurrection (Week 3)

**Goal**: Build search, timeline, and context restoration

#### Tasks

**3.1 Search System**

Create `src/lib/systems/searchSparks.ts`:
```typescript
import { embed } from 'ai'
import { google } from '@ai-sdk/google'
import { createClient } from '@supabase/supabase-js'
import type { SparkPreview } from '@/types/spark'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

/**
 * Semantic search for sparks using vector similarity.
 */
export async function searchSparks(
  query: string,
  userId: string,
  options: {
    threshold?: number
    limit?: number
  } = {}
): Promise<SparkPreview[]> {
  const threshold = options.threshold || 0.7
  const limit = options.limit || 20

  // Generate query embedding
  const { embedding } = await embed({
    model: google.textEmbeddingModel('text-embedding-004', {
      outputDimensionality: 768
    }),
    value: query
  })

  // Vector search via index
  const { data, error } = await supabase.rpc('match_sparks', {
    query_embedding: embedding,
    match_threshold: threshold,
    match_count: limit,
    filter_user_id: userId
  })

  if (error) {
    console.error('Search failed:', error)
    throw error
  }

  // Also search by tags (exact match)
  const tagQuery = query.toLowerCase().replace(/^#/, '')
  const { data: tagResults } = await supabase
    .from('spark_index')
    .select('*')
    .eq('user_id', userId)
    .contains('tags', [tagQuery])
    .limit(limit)

  // Merge and dedupe results
  const allResults = new Map<string, SparkPreview>()

  for (const result of data || []) {
    allResults.set(result.entity_id, {
      entity_id: result.entity_id,
      preview: result.content_text.slice(0, 150),
      created_at: result.created_at,
      tags: result.tags || [],
      thread_id: result.thread_id,
      origin_chunk_id: result.origin_chunk_id
    })
  }

  for (const result of tagResults || []) {
    if (!allResults.has(result.entity_id)) {
      allResults.set(result.entity_id, {
        entity_id: result.entity_id,
        preview: result.content_text.slice(0, 150),
        created_at: result.created_at,
        tags: result.tags || [],
        thread_id: result.thread_id,
        origin_chunk_id: result.origin_chunk_id
      })
    }
  }

  return Array.from(allResults.values())
}

/**
 * Get chronological timeline of sparks.
 */
export async function getSparkTimeline(
  userId: string,
  options: {
    limit?: number
    offset?: number
    threadId?: string
  } = {}
): Promise<SparkPreview[]> {
  const limit = options.limit || 50
  const offset = options.offset || 0

  let query = supabase
    .from('spark_index')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (options.threadId) {
    query = query.eq('thread_id', options.threadId)
  }

  const { data, error } = await query

  if (error) {
    console.error('Failed to load timeline:', error)
    throw error
  }

  return data.map(row => ({
    entity_id: row.entity_id,
    preview: row.content_text.slice(0, 150),
    created_at: row.created_at,
    tags: row.tags || [],
    thread_id: row.thread_id,
    origin_chunk_id: row.origin_chunk_id
  }))
}
```

**3.2 Context Restoration**

Create `src/lib/systems/contextRestore.ts`:
```typescript
import type { SparkEntity } from '@/types/spark'
import { loadEntity } from '@/lib/ecs/file-entity'

/**
 * Load spark context for restoration.
 */
export async function restoreSparkContext(
  entityId: string,
  userId: string
): Promise<{
  documentId: string
  scrollPosition: number
  visibleChunks: string[]
  connections: any[]
  engineWeights: any
  selection: any
  navigationTrail: any[]
}> {
  const spark = await loadEntity<SparkEntity['components']>(entityId, 'spark', userId)

  if (!spark) {
    throw new Error(`Spark ${entityId} not found`)
  }

  const ctx = spark.components.ContextRef

  return {
    documentId: ctx.document_id,
    scrollPosition: ctx.scroll_position,
    visibleChunks: ctx.visible_chunks,
    connections: ctx.active_connections,
    engineWeights: ctx.engine_weights,
    selection: spark.components.Selection || null,
    navigationTrail: ctx.navigation_trail
  }
}

/**
 * Build navigation action for frontend.
 */
export function buildRestoreContextAction(sparkEntity: SparkEntity) {
  const ctx = sparkEntity.components.ContextRef

  return {
    type: 'RESTORE_CONTEXT',
    payload: {
      navigate: `/read/${ctx.document_id}`,
      scrollTo: ctx.scroll_position,
      highlightChunks: ctx.visible_chunks,
      loadConnections: ctx.active_connections,
      setEngineWeights: ctx.engine_weights,
      highlightSelection: sparkEntity.components.Selection || null
    }
  }
}
```

**3.3 Timeline UI**

Create `src/components/spark/SparkTimeline.tsx`:
```typescript
'use client'

import { useEffect, useState } from 'react'
import { Zap } from 'lucide-react'
import type { SparkPreview } from '@/types/spark'
import { formatDistanceToNow } from 'date-fns'
import { useRouter } from 'next/navigation'

export function SparkTimeline() {
  const router = useRouter()
  const [sparks, setSparks] = useState<SparkPreview[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadSparks()
  }, [])

  const loadSparks = async () => {
    setLoading(true)
    const res = await fetch('/api/sparks', {
      headers: { 'x-user-id': 'dev-user-123' }
    })
    const { sparks } = await res.json()
    setSparks(sparks)
    setLoading(false)
  }

  const handleRestore = async (entityId: string) => {
    const res = await fetch(`/api/sparks/${entityId}/restore`, {
      headers: { 'x-user-id': 'dev-user-123' }
    })
    const { context } = await res.json()

    // Navigate with restore query param
    router.push(`/read/${context.documentId}?restore=${entityId}`)
  }

  if (loading) {
    return <div className="p-8 text-center">Loading sparks...</div>
  }

  // Group by date
  const groupedSparks = sparks.reduce((acc, spark) => {
    const date = new Date(spark.created_at).toLocaleDateString()
    if (!acc[date]) acc[date] = []
    acc[date].push(spark)
    return acc
  }, {} as Record<string, SparkPreview[]>)

  return (
    <div className="max-w-4xl mx-auto p-8">
      <div className="flex items-center gap-3 mb-8">
        <Zap className="w-6 h-6 text-yellow-500" />
        <h1 className="text-2xl font-bold">Sparks</h1>
        <span className="text-muted-foreground">({sparks.length})</span>
      </div>

      <div className="space-y-8">
        {Object.entries(groupedSparks).map(([date, dateSparks]) => (
          <div key={date}>
            <h2 className="text-sm font-semibold text-muted-foreground mb-4">
              {date === new Date().toLocaleDateString() ? 'Today' : date}
            </h2>

            <div className="space-y-4">
              {dateSparks.map(spark => (
                <div
                  key={spark.entity_id}
                  className="border rounded-lg p-4 hover:border-yellow-500 transition-colors cursor-pointer group"
                  onClick={() => handleRestore(spark.entity_id)}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Zap className="w-4 h-4 text-yellow-500" />
                      <span className="text-sm text-muted-foreground">
                        {formatDistanceToNow(new Date(spark.created_at), { addSuffix: true })}
                      </span>
                    </div>

                    {spark.thread_id && (
                      <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded">
                        🧵 Thread
                      </span>
                    )}
                  </div>

                  <p className="text-sm mb-3">{spark.preview}...</p>

                  {spark.tags.length > 0 && (
                    <div className="flex gap-2">
                      {spark.tags.map(tag => (
                        <span
                          key={tag}
                          className="text-xs bg-gray-100 px-2 py-1 rounded"
                        >
                          #{tag}
                        </span>
                      ))}
                    </div>
                  )}

                  <div className="mt-3 text-xs text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity">
                    Click to restore context ↗
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
```

Create page at `src/app/sparks/page.tsx`:
```typescript
import { SparkTimeline } from '@/components/spark/SparkTimeline'

export default function SparksPage() {
  return <SparkTimeline />
}
```

**3.4 Sidebar Integration**

Create `src/components/spark/SparkSidebar.tsx`:
```typescript
'use client'

import { useEffect, useState } from 'react'
import { Zap } from 'lucide-react'
import type { SparkEntity } from '@/types/spark'

interface Props {
  chunkId: string
}

export function SparkSidebar({ chunkId }: Props) {
  const [sparks, setSparks] = useState<SparkEntity[]>([])

  useEffect(() => {
    loadConnectedSparks()
  }, [chunkId])

  const loadConnectedSparks = async () => {
    const res = await fetch(`/api/sparks/connections/${chunkId}`, {
      headers: { 'x-user-id': 'dev-user-123' }
    })
    const { sparks } = await res.json()
    setSparks(sparks)
  }

  if (sparks.length === 0) return null

  return (
    <div className="border-t pt-4 mt-4">
      <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
        <Zap className="w-4 h-4 text-yellow-500" />
        Your Sparks ({sparks.length})
      </h3>

      <div className="space-y-3">
        {sparks.map(spark => (
          <div
            key={spark.entity}
            className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg cursor-pointer hover:border-yellow-400 transition-colors"
          >
            <p className="text-sm mb-2">
              {spark.components.Content.text.slice(0, 100)}...
            </p>

            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>
                {new Date(spark.components.Content.created_at).toLocaleDateString()}
              </span>
              <span className="text-yellow-600 hover:underline">
                Restore context ↗
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
```

Add to `src/components/sidebar/RightPanel.tsx`:
```typescript
import { SparkSidebar } from '@/components/spark/SparkSidebar'

// Inside the connections tab or as separate tab
<SparkSidebar chunkId={visibleChunkIds[0]} />
```

**3.5 API Routes**

Create `src/app/api/sparks/search/route.ts`:
```typescript
import { NextRequest, NextResponse } from 'next/server'
import { searchSparks } from '@/lib/systems/searchSparks'

export async function GET(req: NextRequest) {
  const userId = req.headers.get('x-user-id')
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const query = req.nextUrl.searchParams.get('q')
  if (!query) {
    return NextResponse.json({ error: 'Query required' }, { status: 400 })
  }

  const threshold = parseFloat(req.nextUrl.searchParams.get('threshold') || '0.7')
  const limit = parseInt(req.nextUrl.searchParams.get('limit') || '20')

  const results = await searchSparks(query, userId, { threshold, limit })

  return NextResponse.json({ results })
}
```

Update `src/app/api/sparks/route.ts` to add GET:
```typescript
// GET /api/sparks - List sparks (timeline)
export async function GET(req: NextRequest) {
  const userId = req.headers.get('x-user-id')
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const searchParams = req.nextUrl.searchParams
  const limit = parseInt(searchParams.get('limit') || '50')
  const offset = parseInt(searchParams.get('offset') || '0')
  const threadId = searchParams.get('threadId') || undefined

  const sparks = await getSparkTimeline(userId, { limit, offset, threadId })

  return NextResponse.json({ sparks })
}
```

Create `src/app/api/sparks/[id]/restore/route.ts`:
```typescript
import { NextRequest, NextResponse } from 'next/server'
import { restoreSparkContext } from '@/lib/systems/contextRestore'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = req.headers.get('x-user-id')
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const context = await restoreSparkContext(id, userId)

  return NextResponse.json({ context })
}
```

---

### Phase 4: Intelligence (Week 4)

**Goal**: Graph integration and auto-threading

#### Tasks

**4.1 Graph Integration**

Create `src/lib/systems/graphIntegration.ts`:
```typescript
import { createClient } from '@supabase/supabase-js'
import type { SparkEntity } from '@/types/spark'
import { loadEntity } from '@/lib/ecs/file-entity'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

/**
 * Create connections between spark and chunks in the graph.
 */
export async function createSparkConnections(
  spark: SparkEntity,
  userId: string
): Promise<void> {
  // Connection 1: Origin chunk → spark
  await supabase.from('connections').insert({
    source_chunk_id: spark.components.ChunkRefs.origin,
    target_entity_id: spark.entity,
    target_entity_type: 'spark',
    connection_type: 'semantic_similarity', // Default type
    strength: 1.0,
    auto_detected: false,
    discovered_at: new Date().toISOString(),
    metadata: {
      spark_created_at: spark.components.Content.created_at,
      had_active_connections: spark.components.ContextRef.active_connections.length
    }
  })

  // Connection 2: Spark → mentioned chunks
  for (const chunkId of spark.components.ChunkRefs.mentioned) {
    await supabase.from('connections').insert({
      source_entity_id: spark.entity,
      source_entity_type: 'spark',
      target_chunk_id: chunkId,
      connection_type: 'thematic_bridge',
      strength: 0.9,
      auto_detected: false,
      discovered_at: new Date().toISOString(),
      metadata: {
        mentioned_in_content: true
      }
    })
  }
}

/**
 * Get all sparks connected to a chunk.
 */
export async function getSparkConnections(
  chunkId: string,
  userId: string
): Promise<{
  sparks: SparkEntity[]
  chunks: any[]
}> {
  // Find connections where chunk is source or target
  const { data: connections } = await supabase
    .from('connections')
    .select('*')
    .or(`source_chunk_id.eq.${chunkId},target_chunk_id.eq.${chunkId}`)
    .or('source_entity_type.eq.spark,target_entity_type.eq.spark')

  if (!connections) {
    return { sparks: [], chunks: [] }
  }

  // Extract spark entity IDs
  const sparkIds = connections
    .filter(c => c.source_entity_type === 'spark' || c.target_entity_type === 'spark')
    .map(c => c.source_entity_id || c.target_entity_id)
    .filter(Boolean)

  // Load spark entities from files
  const sparks = await Promise.all(
    sparkIds.map(id => loadEntity<SparkEntity['components']>(id, 'spark', userId))
  )

  // Extract chunk connections
  const chunkConnections = connections.filter(
    c => !c.source_entity_type && !c.target_entity_type
  )

  return {
    sparks: sparks.filter((s): s is SparkEntity => s !== null),
    chunks: chunkConnections
  }
}
```

Update `src/app/api/sparks/route.ts` POST to create connections:
```typescript
import { createSparkConnections } from '@/lib/systems/graphIntegration'

export async function POST(req: NextRequest) {
  // ... existing code ...

  // Create spark entity
  const spark = await createSpark(input, userId)

  // Create graph connections
  await createSparkConnections(spark, userId)

  return NextResponse.json({ spark })
}
```

**4.2 Thread Detection**

Create `src/lib/systems/threadDetection.ts`:
```typescript
import { createClient } from '@supabase/supabase-js'
import { generateText } from 'ai'
import { google } from '@ai-sdk/google'
import type { ThreadSuggestion, SparkEntity } from '@/types/spark'
import { loadEntity, saveEntity } from '@/lib/ecs/file-entity'
import { syncSparkToIndex } from '@/lib/ecs/sync'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function countOccurrences(items: string[]): Record<string, number> {
  return items.reduce((acc, item) => {
    acc[item] = (acc[item] || 0) + 1
    return acc
  }, {} as Record<string, number>)
}

async function analyzeClusterCoherence(
  sparks: SparkEntity[]
): Promise<{
  coherent: boolean
  strength: number
  title: string
  reason: string
} | null> {
  // Strategy 1: Check for shared tags (cheap)
  const allTags = sparks.flatMap(s => s.components.Tags?.values || [])
  const tagCounts = countOccurrences(allTags)
  const sharedTags = Object.entries(tagCounts)
    .filter(([_, count]) => count >= 2)
    .map(([tag, _]) => tag)

  if (sharedTags.length > 0) {
    return {
      coherent: true,
      strength: 0.9,
      title: sharedTags[0],
      reason: `${sparks.length} sparks share #${sharedTags[0]}`
    }
  }

  // Strategy 2: Check for chunk overlap
  const allChunks = sparks.flatMap(s => [
    s.components.ChunkRefs.origin,
    ...s.components.ChunkRefs.mentioned
  ])
  const chunkCounts = countOccurrences(allChunks)
  const sharedChunks = Object.entries(chunkCounts)
    .filter(([_, count]) => count >= 2)

  if (sharedChunks.length > 0) {
    return {
      coherent: true,
      strength: 0.8,
      title: 'Related thoughts',
      reason: `${sparks.length} sparks reference overlapping chunks`
    }
  }

  // Strategy 3: AI-powered semantic analysis (expensive, last resort)
  if (sparks.length >= 3) {
    const contents = sparks.map(s => s.components.Content.text).join('\n\n')

    try {
      const { text } = await generateText({
        model: google('gemini-2.0-flash-exp'),
        prompt: `Analyze if these ${sparks.length} thoughts form a coherent thread.

${contents}

Return ONLY valid JSON (no markdown):
{
  "coherent": boolean,
  "strength": 0-1,
  "suggestedTitle": string (2-4 words),
  "reason": string (one sentence)
}`
      })

      const analysis = JSON.parse(text)

      if (analysis.coherent && analysis.strength > 0.6) {
        return {
          coherent: true,
          strength: analysis.strength,
          title: analysis.suggestedTitle,
          reason: analysis.reason
        }
      }
    } catch (error) {
      console.error('AI analysis failed:', error)
    }
  }

  return null
}

/**
 * Detect potential thread clusters from recent unthreaded sparks.
 * Runs in background, suggests threads for user approval.
 */
export async function detectThreadClusters(userId: string): Promise<ThreadSuggestion[]> {
  // Get unthreaded sparks from last 7 days
  const { data: unthreaded } = await supabase
    .from('spark_index')
    .select('entity_id, created_at')
    .eq('user_id', userId)
    .is('thread_id', null)
    .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
    .order('created_at', { ascending: true })

  if (!unthreaded || unthreaded.length < 3) {
    return []
  }

  // Group by 30-minute windows
  const WINDOW_MS = 30 * 60 * 1000
  const clusters: string[][] = []
  let currentCluster: string[] = []
  let lastTimestamp = new Date(unthreaded[0].created_at).getTime()

  for (const spark of unthreaded) {
    const timestamp = new Date(spark.created_at).getTime()
    const timeDiff = timestamp - lastTimestamp

    if (timeDiff <= WINDOW_MS) {
      currentCluster.push(spark.entity_id)
    } else {
      if (currentCluster.length >= 3) {
        clusters.push(currentCluster)
      }
      currentCluster = [spark.entity_id]
    }

    lastTimestamp = timestamp
  }

  // Don't forget last cluster
  if (currentCluster.length >= 3) {
    clusters.push(currentCluster)
  }

  // Analyze each cluster
  const suggestions: ThreadSuggestion[] = []

  for (const clusterIds of clusters) {
    // Load full entities
    const sparks = await Promise.all(
      clusterIds.map(id => loadEntity<SparkEntity['components']>(id, 'spark', userId))
    )

    const validSparks = sparks.filter((s): s is SparkEntity => s !== null)

    if (validSparks.length < 3) continue

    // Analyze coherence
    const analysis = await analyzeClusterCoherence(validSparks)

    if (analysis && analysis.coherent && analysis.strength > 0.7) {
      suggestions.push({
        sparks: clusterIds,
        title: analysis.title,
        strength: analysis.strength,
        reason: analysis.reason
      })
    }
  }

  // Save suggestions to database
  for (const suggestion of suggestions) {
    await supabase.from('thread_suggestions').insert({
      id: `suggestion_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      user_id: userId,
      spark_ids: suggestion.sparks,
      suggested_title: suggestion.title,
      strength: suggestion.strength,
      reason: suggestion.reason
    })
  }

  return suggestions
}

/**
 * Create a thread from spark IDs.
 */
export async function createThread(
  sparkIds: string[],
  title: string,
  userId: string
): Promise<string> {
  const threadId = `thread_${Date.now()}_${Math.random().toString(36).slice(2)}`

  // Update each spark with thread membership
  for (let i = 0; i < sparkIds.length; i++) {
    const spark = await loadEntity<SparkEntity['components']>(sparkIds[i], 'spark', userId)
    if (!spark) continue

    spark.components.ThreadMembership = {
      thread_id: threadId,
      position: i
    }

    await saveEntity(spark, 'spark', userId)
    await syncSparkToIndex(spark as SparkEntity, userId)
  }

  return threadId
}
```

**4.3 Cron Job**

Create `worker/jobs/detect-threads.ts`:
```typescript
import { createClient } from '@supabase/supabase-js'
import { detectThreadClusters } from '@/lib/systems/threadDetection'

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

/**
 * Background job to detect thread clusters.
 * Runs hourly via cron.
 */
export async function runThreadDetection() {
  console.log('[Thread Detection] Starting...')

  // For single user, just use dev-user-123
  const userId = 'dev-user-123'

  try {
    const suggestions = await detectThreadClusters(userId)

    console.log(`[Thread Detection] Found ${suggestions.length} suggestions`)

    // Could trigger notification here
    if (suggestions.length > 0) {
      console.log('Suggestions:', suggestions.map(s => s.title))
    }
  } catch (error) {
    console.error('[Thread Detection] Failed:', error)
  }
}

// Run every hour
if (process.env.NODE_ENV === 'production') {
  setInterval(runThreadDetection, 60 * 60 * 1000)
}
```

**4.4 Thread Suggestions UI**

Create `src/components/spark/ThreadSuggestions.tsx`:
```typescript
'use client'

import { useEffect, useState } from 'react'
import { Sparkles, X, Check } from 'lucide-react'

interface ThreadSuggestion {
  id: string
  spark_ids: string[]
  suggested_title: string
  strength: number
  reason: string
}

export function ThreadSuggestions() {
  const [suggestions, setSuggestions] = useState<ThreadSuggestion[]>([])

  useEffect(() => {
    loadSuggestions()
  }, [])

  const loadSuggestions = async () => {
    const res = await fetch('/api/sparks/threads', {
      headers: { 'x-user-id': 'dev-user-123' }
    })
    const { suggestions } = await res.json()
    setSuggestions(suggestions)
  }

  const handleAccept = async (suggestion: ThreadSuggestion) => {
    await fetch('/api/sparks/threads', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': 'dev-user-123'
      },
      body: JSON.stringify({
        sparkIds: suggestion.spark_ids,
        title: suggestion.suggested_title
      })
    })

    // Dismiss suggestion
    await handleDismiss(suggestion.id)
    loadSuggestions()
  }

  const handleDismiss = async (id: string) => {
    await fetch(`/api/sparks/threads/${id}/dismiss`, {
      method: 'POST',
      headers: { 'x-user-id': 'dev-user-123' }
    })

    setSuggestions(prev => prev.filter(s => s.id !== id))
  }

  if (suggestions.length === 0) return null

  return (
    <div className="fixed bottom-4 right-4 w-96 space-y-2">
      {suggestions.map(suggestion => (
        <div
          key={suggestion.id}
          className="bg-white border border-blue-200 rounded-lg p-4 shadow-lg"
        >
          <div className="flex items-start justify-between mb-2">
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-blue-500" />
              <h3 className="font-semibold">{suggestion.suggested_title}</h3>
            </div>
            <button
              onClick={() => handleDismiss(suggestion.id)}
              className="text-gray-400 hover:text-gray-600"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <p className="text-sm text-muted-foreground mb-3">
            {suggestion.reason}
          </p>

          <div className="flex gap-2">
            <button
              onClick={() => handleAccept(suggestion)}
              className="flex-1 px-3 py-2 text-sm bg-blue-500 text-white rounded hover:bg-blue-600 flex items-center justify-center gap-2"
            >
              <Check className="w-4 h-4" />
              Create Thread
            </button>
            <button
              onClick={() => handleDismiss(suggestion.id)}
              className="px-3 py-2 text-sm border rounded hover:bg-gray-50"
            >
              Dismiss
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}
```

Add to layout:
```typescript
// src/app/layout.tsx or ReaderLayout
import { ThreadSuggestions } from '@/components/spark/ThreadSuggestions'

// Inside layout
<ThreadSuggestions />
```

**4.5 Thread API Routes**

Create `src/app/api/sparks/threads/route.ts`:
```typescript
import { NextRequest, NextResponse } from 'next/server'
import { detectThreadClusters, createThread } from '@/lib/systems/threadDetection'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// GET /api/sparks/threads - Get suggestions
export async function GET(req: NextRequest) {
  const userId = req.headers.get('x-user-id')
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: suggestions } = await supabase
    .from('thread_suggestions')
    .select('*')
    .eq('user_id', userId)
    .eq('dismissed', false)
    .order('created_at', { ascending: false })

  return NextResponse.json({ suggestions })
}

// POST /api/sparks/threads - Create thread
export async function POST(req: NextRequest) {
  const userId = req.headers.get('x-user-id')
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { sparkIds, title } = await req.json()

  const threadId = await createThread(sparkIds, title, userId)

  return NextResponse.json({ threadId })
}
```

Create `src/app/api/sparks/threads/detect/route.ts`:
```typescript
import { NextRequest, NextResponse } from 'next/server'
import { detectThreadClusters } from '@/lib/systems/threadDetection'

// POST /api/sparks/threads/detect - Manual trigger
export async function POST(req: NextRequest) {
  const userId = req.headers.get('x-user-id')
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const suggestions = await detectThreadClusters(userId)

  return NextResponse.json({ suggestions })
}
```

---

## File Reference

### New Files to Create

**TypeScript Types**:
- `src/types/spark.ts` - Spark entity and component types

**File-Based ECS**:
- `src/lib/ecs/file-entity.ts` - File operations for entities
- `src/lib/ecs/sync.ts` - Index synchronization

**Systems**:
- `src/lib/systems/createSpark.ts` - Spark creation and updates
- `src/lib/systems/searchSparks.ts` - Search and timeline
- `src/lib/systems/threadDetection.ts` - Auto-threading
- `src/lib/systems/contextRestore.ts` - Context restoration
- `src/lib/systems/graphIntegration.ts` - Connection graph

**Hooks**:
- `src/hooks/useReaderContext.ts` - Enhanced reader context tracking

**Components**:
- `src/components/spark/SparkCapture.tsx` - Cmd+K capture modal
- `src/components/spark/SparkTimeline.tsx` - Timeline view
- `src/components/spark/SparkSidebar.tsx` - In-reader sidebar
- `src/components/spark/ThreadSuggestions.tsx` - Thread notifications

**API Routes**:
- `src/app/api/sparks/route.ts` - CRUD operations
- `src/app/api/sparks/search/route.ts` - Search endpoint
- `src/app/api/sparks/[id]/restore/route.ts` - Context restoration
- `src/app/api/sparks/threads/route.ts` - Thread management
- `src/app/api/sparks/threads/detect/route.ts` - Manual detection
- `src/app/api/sparks/connections/[chunkId]/route.ts` - Chunk connections

**Pages**:
- `src/app/sparks/page.tsx` - Sparks timeline page

**Worker Jobs**:
- `worker/jobs/detect-threads.ts` - Background thread detection

**Database Migrations**:
- `supabase/migrations/044_extend_connections_for_entities.sql`
- `supabase/migrations/045_create_spark_index.sql`
- `supabase/migrations/046_create_thread_suggestions.sql`
- `supabase/migrations/047_disable_spark_index_rls.sql`

### Files to Modify

**Reader Components**:
- `src/components/reader/ReaderLayout.tsx` - Add SparkCapture, use useReaderContext
- `src/components/sidebar/RightPanel.tsx` - Add SparkSidebar tab

**Layout**:
- `src/app/layout.tsx` - Add ThreadSuggestions

---

## Database Migrations

### Migration 044: Extend Connections

**Purpose**: Add entity references to connections table

**Changes**:
- Add `source_entity_id`, `source_entity_type` columns
- Add `target_entity_id`, `target_entity_type` columns
- Update constraints to allow chunk OR entity references
- Add indexes for entity lookups

**Backwards Compatible**: Yes, existing chunk connections unchanged

### Migration 045: Spark Index

**Purpose**: Create rebuildable query cache for sparks

**Tables**:
- `spark_index` - Fast queries (timeline, search, tags)

**Functions**:
- `match_sparks()` - Vector similarity search

**Indexes**:
- Timeline: `created_at DESC`
- Tags: GIN index
- Vector: IVFFlat for cosine similarity
- User isolation: `user_id`

### Migration 046: Thread Suggestions

**Purpose**: Store auto-detected thread clusters

**Tables**:
- `thread_suggestions` - Pending thread suggestions

**Columns**:
- `spark_ids[]` - Cluster members
- `suggested_title` - AI-generated title
- `strength` - Coherence score
- `dismissed` - User decision

### Migration 047: Disable RLS

**Purpose**: Simplify for single-user dev mode

**Changes**:
- Disable RLS on `spark_index`
- Disable RLS on `thread_suggestions`

---

## Code Patterns

### Pattern 1: File-First, Then Sync

**Always save to files first, then sync to index**:
```typescript
// 1. Save to file (source of truth)
await saveEntity(spark, 'spark', userId)

// 2. Sync to index (query cache)
await syncSparkToIndex(spark, userId)
```

**Why**: Files are canonical. Index can be rebuilt.

### Pattern 2: Mention Extraction

**Extract structured references from natural text**:
```typescript
function extractMentions(content: string) {
  // /chunk-id or /document-name
  const chunks = content.matchAll(/\/([a-z0-9_-]+)/gi)

  // #tag-name
  const tags = content.matchAll(/#([a-z0-9_-]+)/gi)

  // @quote or "quoted text"
  const quotes = content.matchAll(/@quote|"([^"]+)"/gi)

  return { chunks, tags, quotes }
}
```

**Usage**: Enables conversational linking without UI complexity.

### Pattern 3: Context Capture

**Snapshot complete app state at moment of insight**:
```typescript
const context: ContextRefComponent = {
  document_id: documentId,
  visible_chunks: visibleChunkIds,
  scroll_position: scrollY,
  active_connections: connectionsBeingViewed,
  engine_weights: userPreferences,
  navigation_trail: recentNavigation
}
```

**Why**: Time machine effect - restore EXACT reading state.

### Pattern 4: Tiered Detection

**Cheap checks first, expensive AI last**:
```typescript
// 1. Check shared tags (metadata, free)
if (sharedTags.length > 0) return { coherent: true }

// 2. Check chunk overlap (database, cheap)
if (sharedChunks.length > 0) return { coherent: true }

// 3. AI semantic analysis (expensive, last resort)
if (sparks.length >= 3) {
  const analysis = await analyzeWithAI(sparks)
}
```

**Result**: ~95% of thread detection avoids AI costs.

### Pattern 5: Index Verification

**Always verify file ↔ index integrity**:
```typescript
export async function verifyIndexIntegrity(userId: string): Promise<boolean> {
  const fileCount = await countFiles(userId, 'sparks')
  const indexCount = await countIndexEntries(userId)

  if (fileCount !== indexCount) {
    console.warn('Index mismatch - rebuilding...')
    await rebuildSparkIndex(userId)
    return false
  }

  return true
}
```

**Use**: Run on app start, after migrations, before critical operations.

---

## Testing Strategy

### Unit Tests

**Test File ECS**:
```typescript
// src/lib/ecs/__tests__/file-entity.test.ts
describe('File Entity Operations', () => {
  test('generates unique entity IDs', () => {
    const id1 = generateEntityId('spark')
    const id2 = generateEntityId('spark')
    expect(id1).not.toBe(id2)
    expect(id1).toMatch(/^spark_/)
  })

  test('saves and loads entities', async () => {
    const entity = {
      entity: 'spark_test_123',
      components: { Content: { text: 'test' } }
    }

    await saveEntity(entity, 'spark', 'dev-user-123')
    const loaded = await loadEntity('spark_test_123', 'spark', 'dev-user-123')

    expect(loaded).toEqual(entity)
  })
})
```

**Test Mention Extraction**:
```typescript
// src/lib/systems/__tests__/createSpark.test.ts
import { extractMentions } from '../createSpark'

test('extracts chunk references', () => {
  const content = 'See /chunk-123 and /another-chunk'
  const { chunks } = extractMentions(content)
  expect(chunks).toEqual(['chunk-123', 'another-chunk'])
})

test('extracts tags', () => {
  const content = 'Thinking about #capitalism and #control'
  const { tags } = extractMentions(content)
  expect(tags).toEqual(['capitalism', 'control'])
})
```

### Integration Tests

**Test Spark Creation Flow**:
```typescript
// src/lib/systems/__tests__/createSpark.integration.test.ts
describe('Spark Creation', () => {
  test('creates spark with full context', async () => {
    const input = {
      content: 'Control as modulation #deleuze',
      context: {
        documentId: 'doc-123',
        visibleChunks: ['chunk-456'],
        scrollY: 1234,
        connections: [],
        engineWeights: { semantic: 0.25, contradiction: 0.40, bridge: 0.35 },
        navigationTrail: []
      }
    }

    const spark = await createSpark(input, 'dev-user-123')

    expect(spark.entity).toMatch(/^spark_/)
    expect(spark.components.Content.text).toBe(input.content)
    expect(spark.components.Tags.values).toContain('deleuze')
    expect(spark.components.SearchVector.embedding).toHaveLength(768)
  })
})
```

**Test Index Sync**:
```typescript
test('syncs spark to index', async () => {
  const spark = { /* ... */ }
  await saveEntity(spark, 'spark', 'dev-user-123')
  await syncSparkToIndex(spark, 'dev-user-123')

  // Verify in index
  const { data } = await supabase
    .from('spark_index')
    .select('*')
    .eq('entity_id', spark.entity)
    .single()

  expect(data).toBeDefined()
  expect(data.content_text).toBe(spark.components.Content.text)
})
```

### E2E Tests

**Test Capture Flow**:
```typescript
// tests/e2e/spark-capture.spec.ts
import { test, expect } from '@playwright/test'

test('captures spark with Cmd+K', async ({ page }) => {
  await page.goto('/read/doc-123')

  // Press Cmd+K
  await page.keyboard.press('Meta+K')

  // Modal should appear
  await expect(page.locator('dialog')).toBeVisible()

  // Type content
  await page.fill('textarea', 'Test spark #tag')

  // Submit with Cmd+Enter
  await page.keyboard.press('Meta+Enter')

  // Modal should close
  await expect(page.locator('dialog')).not.toBeVisible()

  // Verify in database
  // ...
})
```

**Test Context Restoration**:
```typescript
test('restores context from spark', async ({ page }) => {
  // Create spark at known position
  // ...

  // Navigate to sparks timeline
  await page.goto('/sparks')

  // Click spark
  await page.click('[data-spark-id="spark-123"]')

  // Should navigate to document
  await expect(page).toHaveURL(/\/read\/doc-123/)

  // Should scroll to position
  const scrollY = await page.evaluate(() => window.scrollY)
  expect(scrollY).toBeGreaterThan(0)

  // Should highlight chunks
  await expect(page.locator('[data-chunk-id="chunk-456"]')).toHaveClass(/highlight/)
})
```

### Manual Testing Checklist

**Capture Flow**:
- [ ] Cmd+K opens modal while reading
- [ ] Auto-quotes selected text
- [ ] Extracts /chunk-refs and #tags
- [ ] Saves context (visible chunks, scroll, connections)
- [ ] Creates graph connections (origin → spark → mentions)
- [ ] Syncs to index

**Search & Timeline**:
- [ ] Timeline shows chronological sparks
- [ ] Search finds by semantic similarity
- [ ] Tag search works (#tag-name)
- [ ] Preview shows first 150 chars
- [ ] Grouped by date correctly

**Context Restoration**:
- [ ] Click spark navigates to document
- [ ] Scrolls to exact position
- [ ] Highlights visible chunks
- [ ] Shows navigation trail
- [ ] Restores connections in sidebar

**Threading**:
- [ ] Auto-detects clusters (30-min window, 3+ sparks)
- [ ] Suggests coherent threads
- [ ] Accept creates thread
- [ ] Dismiss removes suggestion
- [ ] Thread members linked correctly

---

## Performance & Costs

### Performance Targets

**Capture** (<2 seconds):
- File write: ~5ms
- Embedding: ~200ms
- Index sync: ~10ms
- Graph connections: ~50ms
- **Total**: ~265ms

**Timeline Query** (<100ms):
- Index query: ~30ms
- **Total**: ~30ms

**Semantic Search** (<200ms):
- Query embedding: ~100ms
- Vector search: ~50ms
- **Total**: ~150ms

**Thread Detection** (<5 seconds):
- Clustering: ~500ms
- AI analysis (10 clusters): ~3s
- Save suggestions: ~100ms
- **Total**: ~3.6s

### Cost Breakdown

**Per Spark**:
- Creation: $0.0001 (embedding)
- Search: $0.0001 (query embedding)
- **Total**: ~$0.0002

**Threading** (weekly):
- Clustering: Free (metadata)
- AI analysis: $0.02 (10 clusters × $0.002)
- **Total**: $0.02/week = $0.08/month

**Monthly Costs** (100 sparks/week):
- Creation: 400 × $0.0001 = $0.04
- Search: 50 × $0.0001 = $0.005
- Threading: $0.08
- **Total**: ~$0.13/month

**Extremely affordable for personal tool.**

### Optimization Strategies

**1. Batch Embeddings**:
```typescript
// Instead of: 10 separate calls
for (const spark of sparks) {
  await embed({ value: spark.text })
}

// Do: 1 batched call
await embedMany({ values: sparks.map(s => s.text) })
```

**2. Index First for Queries**:
```typescript
// ✅ Fast: Query index first
const previews = await getSparkTimeline(userId)

// ❌ Slow: Don't load all files
const sparks = await queryEntities('spark', userId)
```

**3. Tiered Detection**:
```typescript
// Cheap → Medium → Expensive
if (sharedTags) return result      // Free
if (sharedChunks) return result    // $0
if (sparks >= 3) analyzeWithAI()   // $0.02
```

---

## Success Metrics

### Capture Metrics

**Friction** (Goal: <2 seconds):
- Time from Cmd+K to save
- Measure: `spark.created_at - modal_open_time`

**Adoption** (Goal: >80% of reading sessions):
- Sessions with ≥1 spark created
- Measure: `sessions_with_sparks / total_sessions`

### Resurrection Metrics

**Discovery Rate** (Goal: 30% within 30 days):
- Sparks clicked within 30 days of creation
- Measure: `clicks_within_30d / total_sparks`

**Fossil Resurrection** (Goal: 5% of 30+ day sparks):
- Old sparks resurfaced and clicked
- Measure: `old_spark_clicks / sparks_over_30d`

**Context Usage** (Goal: 20% use breadcrumb):
- Clicks on "restore context"
- Measure: `breadcrumb_clicks / total_spark_clicks`

### Threading Metrics

**Conversion** (Goal: 5-10%):
- Sparks that join threads
- Measure: `threaded_sparks / total_sparks`

**Suggestion Quality** (Goal: >60% acceptance):
- Thread suggestions accepted vs dismissed
- Measure: `accepted_threads / total_suggestions`

### Quality Metrics

**Search Relevance** (Goal: >70% clicks in top 5):
- Clicks on search results by position
- Measure: `clicks_pos_1_to_5 / total_clicks`

**Index Integrity** (Goal: 100% match):
- File count vs index count
- Measure: `verifyIndexIntegrity()`

---

## Next Steps

After completing all 4 phases:

1. **User Testing**: Use system for 2 weeks, collect feedback
2. **Performance Tuning**: Optimize based on real usage patterns
3. **Feature Enhancement**:
   - Writing mode auto-surfacing
   - Scout reconnaissance (multi-wave search)
   - Character constellation (fiction-specific)
4. **Export System**: ZIP bundles with sparks + threads
5. **Mobile Support**: Responsive UI, touch gestures

---

## References

- **Core Spec**: `docs/todo/spark-system.md`
- **ECS Implementation**: `docs/ECS_IMPLEMENTATION.md`
- **Storage Patterns**: `docs/STORAGE_PATTERNS.md`
- **Connection System**: `supabase/migrations/021_convert_connections_to_chunk_based.sql`
- **Reader Context**: `src/components/reader/ReaderLayout.tsx`

---

**This guide contains everything needed to implement the spark system step by step. Follow the phases sequentially, test thoroughly, and iterate based on real usage.**

**The architecture is sound. The cost model is sustainable. The user experience will be transformative.**

**Ready to build? Start with Phase 1: Foundation.**
