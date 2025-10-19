# Spark System Implementation Plan (ECS-Native)

## Overview

Implement personal knowledge capture system (Sparks) using **pure ECS architecture**. Sparks are entities with components, not domain tables. Storage-first with optional query cache for timeline/search. Follows annotation pattern exactly.

**Core Vision**: Press Cmd+K while reading to capture thoughts with full context preservation. Sparks inherit connections from origin chunks and support Obsidian export.

## Current State Analysis

Based on comprehensive codebase research:

### What We Have ✅

- **ECS System**: Pure entity-component architecture (`src/lib/ecs/ecs.ts:27-333`)
  - Entities are UUIDs, components are JSONB data bags
  - 7 public methods: createEntity, query, getEntity, updateComponent, deleteEntity, etc.
  - Used successfully by annotations system

- **Annotation Pattern**: 3-component pattern to follow (`src/app/actions/annotations.ts:76-107`)
  - Component 1: `annotation` (user data: text, note, tags, color)
  - Component 2: `position` (location tracking: confidence, method, context)
  - Component 3: `source` (document linking: chunk_id, document_id)

- **Storage-First Infrastructure**: Automatic export to Storage (`worker/lib/storage-helpers.ts`)
  - `saveToStorage()` - JSON export with formatting
  - `readFromStorage()` - Signed URL access
  - Used in all processors for portability

- **Reader UI**: Document reader with context tracking
  - `src/app/read/[id]/page.tsx` - Reader page
  - `QuickSparkModal` component already exists for Cmd+K capture
  - Connection display in RightPanel (6 tabs including SparksTab placeholder)

- **Connection Detection**: 3-engine system orchestrated by `worker/engines/orchestrator.ts`
  - Semantic Similarity (25%)
  - Contradiction Detection (40%)
  - Thematic Bridge (35%)
  - Returns connections as array with scores

### What We're Missing ❌

- Spark entity creation server actions
- Storage export for sparks (JSON format)
- Optional cache table for timeline queries
- Connection inheritance logic
- Obsidian export integration
- Spark timeline UI implementation

### Key Discoveries

From research:

1. **ECS Pattern** (`src/lib/ecs/ecs.ts:36-76`):
   - Two-step creation: entity first, then components
   - Denormalize `chunk_id`/`document_id` for filtering
   - Manual rollback on component insertion failure

2. **Annotation Recovery** (`src/app/actions/annotations.ts:282-466`):
   - Recovery metadata in components table (confidence, method)
   - Chunk-bounded search via `original_chunk_index`
   - 50-75x faster than full-document search

3. **Storage-First Pattern** (`worker/processors/base.ts:395-496`):
   - Automatic export during processing via `saveStageResult()`
   - Non-fatal errors (logs warning, continues)
   - Metadata enrichment (version, timestamp, document_id)

4. **Cache Table Pattern** (`supabase/migrations/046_cached_chunks_table.sql`):
   - Optional queryable cache (NOT source of truth)
   - Hash-based validation for staleness detection
   - Rebuildable from Storage on data loss

## Desired End State

Users can:
1. ✅ Press Cmd+K while reading to capture sparks (~500 chars)
2. ✅ See spark timeline with 50 sparks/page in <500ms
3. ✅ Search sparks semantically with >70% precision
4. ✅ View spark connections inherited from origin chunks
5. ✅ Export sparks to Obsidian vault as YAML+markdown files
6. ✅ Restore sparks from Storage after database reset

**Performance Targets**:
- Spark creation: <1 second (Cmd+K → saved)
- Timeline load: <500ms (50 sparks with metadata)
- Context restoration: <300ms (full reading state)
- Storage export: <100ms (automatic background)

## Rhizome Architecture

- **Module**: Both (Main App UI + Worker for Obsidian export)
- **Storage**: Both - Hybrid (Storage = source of truth, Database = queryable cache)
- **Migration**: Yes (053 for optional cache table only)
- **Test Tier**: Critical (user-created content, manual work)
- **Pipeline Stages**: N/A (sparks created outside processing pipeline)
- **Engines**: Reads from existing connection system for inheritance

## What We're NOT Doing

Clear scope boundaries:

- ❌ **Creating `sparks` domain table** - Use ECS entities + components instead
- ❌ **Creating `spark_connections` table** - Store connections in component JSON
- ❌ **Extending `connections` table** - Keep chunk connections and spark connections separate
- ❌ **Fuzzy mention matching** - Use explicit chunk IDs only (`/chunk_abc123`)
- ❌ **Auto-threading sparks** - Deferred to v2 (connection detection between sparks)
- ❌ **Bidirectional Obsidian sync** - Manual export only in v1
- ❌ **Advanced search filters** - Full-text search only, no faceted search
- ❌ **Spark editing** - Create-only in v1, editing in v2

## Implementation Approach

**Core Pattern**: Follow annotations exactly, but for sparks.

```typescript
// Annotations (existing pattern)
await ecs.createEntity(userId, {
  annotation: { text: "...", note: "...", tags: [...], color: "yellow" },
  position: { chunkIds: [...], confidence: 1.0, method: "exact" },
  source: { chunk_id: "chunk_abc", document_id: "doc_456" }
})

// Sparks (new, similar pattern)
await ecs.createEntity(userId, {
  spark: {
    content: "...",
    tags: [...],
    connections: [
      { chunkId: "chunk_origin", type: "origin", strength: 1.0 },
      { chunkId: "chunk_abc", type: "mention", strength: 0.9 },
      { chunkId: "chunk_xyz", type: "inherited", strength: 0.7 }
    ]
  },
  source: { chunk_id: "chunk_abc", document_id: "doc_456" }
})
```

**Storage Pattern**: Like documents, spark JSON in Storage.

```
storage/users/{userId}/sparks/{sparkId}/
├── content.json          # Complete spark data (source of truth)
```

**Query Pattern**: Optional cache for timeline/search only.

```sql
-- Optional cache table (rebuildable from Storage)
SELECT * FROM sparks_cache
WHERE user_id = ?
ORDER BY created_at DESC
LIMIT 50;
```

---

## Phase 1: Types & Storage Layer

### Overview

Define TypeScript types and Storage helpers. No database changes yet. Pure type definitions and Storage utilities.

### Changes Required

#### 1. Spark Types
**File**: `src/lib/sparks/types.ts`
**Changes**: Create new file with type definitions

```typescript
// Spark component (stored in ECS components table)
export interface SparkComponent {
  content: string
  created_at: string
  updated_at?: string
  tags: string[]
  connections: SparkConnection[]
}

// Connection stored within spark component (NOT connections table)
export interface SparkConnection {
  chunkId: string
  type: 'origin' | 'mention' | 'inherited'
  strength: number
  metadata?: {
    inheritedFrom?: string
    originalStrength?: number
    originalType?: string
    mentionedInContent?: boolean
  }
}

// Reading context snapshot
export interface SparkContext {
  documentId: string
  documentTitle: string
  originChunkId: string
  visibleChunks: string[]
  scrollPosition: number
  activeConnections: any[]
  engineWeights: {
    semantic: number
    contradiction: number
    bridge: number
  }
  selection?: {
    text: string
    chunkId: string
    startOffset: number
    endOffset: number
  }
}

// Complete spark data for Storage export
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

// Cache table row (optional, for queries)
export interface SparkCacheRow {
  entity_id: string
  user_id: string
  content: string
  created_at: string
  updated_at?: string
  origin_chunk_id: string
  document_id: string
  tags: string[]
  embedding?: number[]
  storage_path: string
  cached_at: string
}
```

#### 2. Storage Helpers
**File**: `src/lib/sparks/storage.ts`
**Changes**: Create new file with Storage upload/download utilities

```typescript
import { createClient } from '@/lib/supabase/server'
import type { SparkStorageJson } from './types'

/**
 * Upload spark to Storage (source of truth)
 * Path: {userId}/sparks/{sparkId}/content.json
 *
 * Pattern: Like documents, sparks are exported to Storage for portability.
 * Database is queryable cache, Storage is source of truth.
 */
export async function uploadSparkToStorage(
  userId: string,
  sparkId: string,
  sparkData: SparkStorageJson
): Promise<string> {
  const supabase = createClient()
  const jsonPath = `${userId}/sparks/${sparkId}/content.json`

  // Use Blob wrapper to preserve JSON formatting (from storage-helpers pattern)
  const jsonBlob = new Blob([JSON.stringify(sparkData, null, 2)], {
    type: 'application/json'
  })

  const { error } = await supabase.storage
    .from('documents')
    .upload(jsonPath, jsonBlob, {
      contentType: 'application/json',
      upsert: true
    })

  if (error) {
    throw new Error(`Failed to upload spark to Storage: ${error.message}`)
  }

  console.log(`[Sparks] ✓ Uploaded to Storage: ${jsonPath}`)
  return jsonPath
}

/**
 * Download spark from Storage
 * Uses signed URLs with 1-hour expiry (from storage-helpers pattern)
 */
export async function downloadSparkFromStorage(
  userId: string,
  sparkId: string
): Promise<SparkStorageJson> {
  const supabase = createClient()
  const jsonPath = `${userId}/sparks/${sparkId}/content.json`

  // Create signed URL
  const { data: signedUrlData, error: urlError } = await supabase.storage
    .from('documents')
    .createSignedUrl(jsonPath, 3600) // 1 hour

  if (urlError || !signedUrlData?.signedUrl) {
    throw new Error(`Failed to create signed URL for ${jsonPath}`)
  }

  // Fetch and parse JSON
  const response = await fetch(signedUrlData.signedUrl)
  if (!response.ok) {
    throw new Error(`Storage read failed for ${jsonPath}: ${response.statusText}`)
  }

  const data = await response.json()
  console.log(`[Sparks] ✓ Read from Storage: ${jsonPath}`)

  return data as SparkStorageJson
}

/**
 * List all spark files in Storage for a user
 */
export async function listUserSparks(userId: string): Promise<string[]> {
  const supabase = createClient()

  const { data: folders, error } = await supabase.storage
    .from('documents')
    .list(`${userId}/sparks`, {
      limit: 1000,
      offset: 0
    })

  if (error) {
    throw new Error(`Failed to list sparks: ${error.message}`)
  }

  // Return folder names (each folder is a sparkId)
  return (folders || []).map(f => f.name)
}

/**
 * Verify Storage integrity (for diagnostics)
 * Returns true if Storage count matches ECS entity count
 */
export async function verifySparksIntegrity(userId: string): Promise<{
  storageCount: number
  entityCount: number
  matched: boolean
}> {
  const supabase = createClient()

  // Count files in Storage
  const sparkIds = await listUserSparks(userId)
  const storageCount = sparkIds.length

  // Count ECS entities with spark component
  const { data: components } = await supabase
    .from('components')
    .select('entity_id')
    .eq('component_type', 'spark')
    .eq('user_id', userId)

  const entityCount = components?.length || 0

  return {
    storageCount,
    entityCount,
    matched: storageCount === entityCount
  }
}

/**
 * Verify cache freshness (detects stale or missing sparks)
 * Used for health checks and automatic cache repairs
 */
export async function verifyCacheFreshness(userId: string): Promise<{
  stale: string[]
  missing: string[]
}> {
  const supabase = createClient()

  // Get all sparks from Storage
  const storageIds = await listUserSparks(userId)

  // Get all cached sparks
  const { data: cached } = await supabase
    .from('sparks_cache')
    .select('entity_id, cached_at, storage_path')
    .eq('user_id', userId)

  const cachedIds = new Set(cached?.map(c => c.entity_id) || [])

  // Detect missing sparks (in Storage but not cached)
  const missing = storageIds.filter(id => !cachedIds.has(id))

  // Detect stale sparks (cached but updated in Storage)
  const stale: string[] = []
  for (const cache of cached || []) {
    try {
      const sparkData = await downloadSparkFromStorage(userId, cache.entity_id)
      const storageUpdated = new Date(sparkData.data.updated_at || sparkData.data.created_at)
      const cacheUpdated = new Date(cache.cached_at)

      if (storageUpdated > cacheUpdated) {
        stale.push(cache.entity_id)
      }
    } catch (error) {
      // Storage file missing but cache exists - mark as stale
      stale.push(cache.entity_id)
    }
  }

  return { stale, missing }
}
```

### Success Criteria

#### Automated Verification:
- [x] Types compile: `npm run type-check`
- [x] No import errors: `npm run build`
- [x] Storage helpers export correctly

#### Manual Verification:
- [ ] Can import types in other files
- [ ] Storage path format matches pattern (`{userId}/sparks/{sparkId}/content.json`)

**Implementation Note**: No database changes yet. This phase only creates types and utilities.

---

## Phase 2: Optional Cache Table (Database)

### Overview

Create optional cache table for timeline/search queries. **NOT source of truth** - rebuildable from Storage.

**Philosophy**: Storage is source of truth. Cache table is for fast queries only. Loss of cache = zero data loss (rebuild from Storage).

### Changes Required

#### 1. Cache Table Migration
**File**: `supabase/migrations/053_create_sparks_cache.sql`
**Changes**: Create new migration file

```sql
-- Migration 053: Sparks query cache
--
-- CRITICAL: This table is NOT source of truth.
-- Source of truth: Storage JSON files at {userId}/sparks/{sparkId}/content.json
-- This table: Denormalized cache for fast timeline/search queries only
--
-- Rebuild process:
-- 1. DELETE FROM sparks_cache WHERE user_id = ?
-- 2. Read all Storage JSON files
-- 3. INSERT denormalized rows
--
-- Loss of this table = zero data loss (rebuild from Storage)

CREATE TABLE IF NOT EXISTS sparks_cache (
  -- Reference to ECS entity
  entity_id UUID PRIMARY KEY REFERENCES entities(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Denormalized for queries (copied from Storage JSON)
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ,

  -- Origin tracking (for filtering)
  origin_chunk_id UUID REFERENCES chunks(id) ON DELETE SET NULL,
  document_id UUID REFERENCES documents(id) ON DELETE SET NULL,

  -- Search optimization
  tags TEXT[] DEFAULT '{}',
  embedding vector(768),

  -- Storage reference (for integrity checks)
  storage_path TEXT NOT NULL, -- '{userId}/sparks/{sparkId}/content.json'

  -- Timestamps
  cached_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_sparks_cache_user_time
  ON sparks_cache(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_sparks_cache_origin
  ON sparks_cache(origin_chunk_id)
  WHERE origin_chunk_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sparks_cache_document
  ON sparks_cache(document_id)
  WHERE document_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sparks_cache_tags
  ON sparks_cache USING gin(tags);

CREATE INDEX IF NOT EXISTS idx_sparks_cache_embedding
  ON sparks_cache USING ivfflat(embedding vector_cosine_ops)
  WITH (lists = 100);

-- Full-text search on content
CREATE INDEX IF NOT EXISTS idx_sparks_cache_content_fts
  ON sparks_cache USING gin(to_tsvector('english', content));

-- Enable RLS
ALTER TABLE sparks_cache ENABLE ROW LEVEL SECURITY;

-- RLS policies (users see only their sparks)
CREATE POLICY "Users view own sparks cache"
  ON sparks_cache FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users insert own sparks cache"
  ON sparks_cache FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users update own sparks cache"
  ON sparks_cache FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "Users delete own sparks cache"
  ON sparks_cache FOR DELETE
  USING (user_id = auth.uid());

-- Comments
COMMENT ON TABLE sparks_cache IS
  'CACHE ONLY - NOT SOURCE OF TRUTH.

  Source: {userId}/sparks/{sparkId}/content.json in Storage
  Purpose: Fast timeline/search queries only
  Rebuild: DELETE + re-insert from Storage JSON
  Data loss: Zero (fully rebuildable)

  This table can be dropped and rebuilt at any time.';

COMMENT ON COLUMN sparks_cache.entity_id IS
  'References entities table. Spark data in components table with component_type=spark.';

COMMENT ON COLUMN sparks_cache.storage_path IS
  'Path to source JSON in Storage. Used for integrity verification and rebuilds.';

COMMENT ON COLUMN sparks_cache.cached_at IS
  'When this cache row was last rebuilt from Storage.';
```

#### 2. Cache Rebuild Function
**File**: `worker/lib/sparks/rebuild-cache.ts`
**Changes**: Create new file for cache rebuild utility

```typescript
import { createClient } from '@/lib/supabase/server'
import { listUserSparks, downloadSparkFromStorage } from '@/lib/sparks/storage'
import { embed } from 'ai'
import { google } from '@ai-sdk/google'

/**
 * Rebuild sparks cache from Storage
 * Used on startup or after data loss
 *
 * Pattern: Like cached_chunks, this is a rebuildable cache.
 * Storage is source of truth, this function restores queryable cache.
 */
export async function rebuildSparksCache(userId: string): Promise<{
  rebuilt: number
  errors: string[]
  duration: number
}> {
  const startTime = Date.now()
  const supabase = createClient()
  const errors: string[] = []
  let rebuilt = 0

  console.log(`[Sparks] Rebuilding cache for user ${userId}...`)

  // 1. Clear existing cache
  const { error: deleteError } = await supabase
    .from('sparks_cache')
    .delete()
    .eq('user_id', userId)

  if (deleteError) {
    throw new Error(`Failed to clear cache: ${deleteError.message}`)
  }

  // 2. List all spark files in Storage
  const sparkIds = await listUserSparks(userId)
  console.log(`[Sparks] Found ${sparkIds.length} sparks in Storage`)

  // 3. Download and cache each spark (batch in groups of 10 for rate limiting)
  const batchSize = 10
  for (let i = 0; i < sparkIds.length; i += batchSize) {
    const batch = sparkIds.slice(i, i + batchSize)

    await Promise.all(batch.map(async (sparkId) => {
      try {
        const sparkData = await downloadSparkFromStorage(userId, sparkId)

        // Generate embedding for search
        const { embedding } = await embed({
          model: google.textEmbeddingModel('text-embedding-004', {
            outputDimensionality: 768
          }),
          value: sparkData.data.content
        })

        // Insert cache row
        await supabase.from('sparks_cache').insert({
          entity_id: sparkData.entity_id,
          user_id: userId,
          content: sparkData.data.content,
          created_at: sparkData.data.created_at,
          updated_at: sparkData.data.updated_at,
          origin_chunk_id: sparkData.source.chunk_id,
          document_id: sparkData.source.document_id,
          tags: sparkData.data.tags,
          embedding,
          storage_path: `${userId}/sparks/${sparkId}/content.json`
        })

        rebuilt++
      } catch (error) {
        const errorMsg = `Failed to cache spark ${sparkId}: ${error}`
        console.error(`[Sparks] ${errorMsg}`)
        errors.push(errorMsg)
      }
    }))
  }

  const duration = Date.now() - startTime
  console.log(`[Sparks] Cache rebuild complete: ${rebuilt} sparks, ${errors.length} errors, ${duration}ms`)

  return { rebuilt, errors, duration }
}

/**
 * Update single spark in cache
 * Called after creating/updating a spark
 */
export async function updateSparkCache(
  userId: string,
  sparkId: string,
  sparkData: any
): Promise<void> {
  const supabase = createClient()

  // Generate embedding
  const { embedding } = await embed({
    model: google.textEmbeddingModel('text-embedding-004', {
      outputDimensionality: 768
    }),
    value: sparkData.data.content
  })

  // Upsert cache row
  await supabase.from('sparks_cache').upsert({
    entity_id: sparkId,
    user_id: userId,
    content: sparkData.data.content,
    created_at: sparkData.data.created_at,
    updated_at: sparkData.data.updated_at,
    origin_chunk_id: sparkData.source.chunk_id,
    document_id: sparkData.source.document_id,
    tags: sparkData.data.tags,
    embedding,
    storage_path: `${userId}/sparks/${sparkId}/content.json`,
    cached_at: new Date().toISOString()
  })
}
```

### Success Criteria

#### Automated Verification:
- [x] Migration applies: `npx supabase db reset`
- [x] Indexes created successfully: Check with `\d+ sparks_cache` in psql
- [x] RLS policies in place: Check with `\dp sparks_cache` in psql
- [x] Types compile: `npm run type-check`

#### Manual Verification:
- [ ] Can rebuild cache from Storage (empty table → full rebuild)
- [ ] Timeline query <100ms for 1000 sparks
- [ ] Embedding search works

**Service Restarts:**
- [x] Supabase: `npx supabase db reset` (schema changed)
- [x] Next.js: Auto-reload on type changes

---

## Phase 3: Connection Inheritance Logic

### Overview

Implement connection inheritance from origin chunks. Connections stored in spark component JSON, not separate table.

**Pattern**: Read existing chunk connections, inherit top 10 with 0.7x multiplier, store in spark component.

### Changes Required

#### 1. Connection Helpers
**File**: `src/lib/sparks/connections.ts`
**Changes**: Create new file with connection inheritance logic

```typescript
import { createClient } from '@/lib/supabase/server'
import type { SparkConnection } from './types'

/**
 * Extract explicit chunk references from spark content
 * Format: /chunk_abc123 or /chunk-abc-123
 *
 * Pattern: Use explicit IDs only, no fuzzy matching.
 */
export function extractChunkIds(content: string): string[] {
  const matches = content.matchAll(/\/chunk[_-]([a-z0-9_-]+)/gi)
  return Array.from(matches, m => `chunk_${m[1]}`)
}

/**
 * Extract hashtags from content
 * Format: #tagname or #tag-name
 */
export function extractTags(content: string): string[] {
  const matches = content.matchAll(/#([a-z0-9_-]+)/gi)
  return Array.from(matches, m => m[1].toLowerCase())
}

/**
 * Get connections to inherit from origin chunk
 * Returns top 10 connections with 0.7x strength multiplier
 *
 * Pattern: Read from connections table, transform to spark connections.
 * Spark connections stored in component JSON, not connections table.
 */
export async function getInheritedConnections(
  originChunkId: string,
  userId: string
): Promise<SparkConnection[]> {
  const supabase = createClient()

  // Get strong connections from origin chunk (strength >= 0.6)
  const { data: connections, error } = await supabase
    .from('connections')
    .select('target_chunk_id, connection_type, strength, metadata')
    .eq('source_chunk_id', originChunkId)
    .gte('strength', 0.6)
    .order('strength', { ascending: false })
    .limit(10) // Top 10 connections only

  if (error) {
    console.error(`[Sparks] Failed to get connections for ${originChunkId}:`, error)
    return []
  }

  if (!connections || connections.length === 0) {
    return []
  }

  // Map to spark connections with reduced weight
  return connections.map(conn => ({
    chunkId: conn.target_chunk_id,
    type: 'inherited' as const,
    strength: conn.strength * 0.7, // Reduce weight for inherited
    metadata: {
      inheritedFrom: originChunkId,
      originalStrength: conn.strength,
      originalType: conn.connection_type
    }
  }))
}

/**
 * Build complete connection list for a spark
 * Combines: origin + mentions + inherited
 *
 * Pattern: 3 connection types stored in spark component:
 * 1. origin (strength 1.0) - chunk where spark was created
 * 2. mention (strength 0.9) - chunks explicitly referenced in content
 * 3. inherited (strength original * 0.7) - connections from origin chunk
 */
export async function buildSparkConnections(
  content: string,
  originChunkId: string,
  userId: string
): Promise<SparkConnection[]> {
  const connections: SparkConnection[] = []

  // 1. Origin connection (highest strength)
  if (originChunkId) {
    connections.push({
      chunkId: originChunkId,
      type: 'origin',
      strength: 1.0,
      metadata: { relationship: 'origin' }
    })
  } else {
    console.warn('[Sparks] No origin chunk provided - spark will be orphaned')
  }

  // 2. Explicit mentions in content
  const mentions = extractChunkIds(content)
  for (const chunkId of mentions) {
    connections.push({
      chunkId,
      type: 'mention',
      strength: 0.9,
      metadata: { mentionedInContent: true }
    })
  }

  // 3. Inherited from origin chunk (only if origin exists)
  if (originChunkId) {
    const inherited = await getInheritedConnections(originChunkId, userId)
    connections.push(...inherited)
  }

  // Remove duplicates (keep highest strength)
  const uniqueConnections = new Map<string, SparkConnection>()
  for (const conn of connections) {
    const existing = uniqueConnections.get(conn.chunkId)
    if (!existing || conn.strength > existing.strength) {
      uniqueConnections.set(conn.chunkId, conn)
    }
  }

  return Array.from(uniqueConnections.values())
}
```

### Success Criteria

#### Automated Verification:
- [x] Types compile: `npm run type-check`
- [x] Helpers export correctly: `npm run build`

#### Manual Verification:
- [ ] Chunk ID extraction works (`/chunk_abc` → `chunk_abc`)
- [ ] Tag extraction works (`#paranoia` → `paranoia`)
- [ ] Connection inheritance applies 0.7x multiplier
- [ ] Duplicate connections deduplicated (highest strength wins)

**Implementation Note**: No database changes. Pure logic layer.

---

## Phase 4: Server Actions (ECS-Native)

### Overview

Create spark using pure ECS. No domain tables, just entities + components + Storage.

**Pattern**: Follow annotation creation exactly (`src/app/actions/annotations.ts:39-135`).

### Changes Required

#### 1. Spark Server Actions
**File**: `src/app/actions/sparks.ts`
**Changes**: Create new file with CRUD operations

```typescript
'use server'

import { revalidatePath } from 'next/cache'
import { getCurrentUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { ecs } from '@/lib/ecs'
import { uploadSparkToStorage } from '@/lib/sparks/storage'
import { updateSparkCache } from '@/worker/lib/sparks/rebuild-cache'
import {
  buildSparkConnections,
  extractTags
} from '@/lib/sparks/connections'
import type { SparkContext, SparkStorageJson } from '@/lib/sparks/types'

interface CreateSparkInput {
  content: string
  context: SparkContext
}

/**
 * Create a new spark (ECS-native)
 *
 * Flow (follows annotation pattern exactly):
 * 1. Validate user authentication
 * 2. Extract metadata from content (tags, chunk mentions)
 * 3. Build connection graph (origin + mentions + inherited)
 * 4. Create ECS entity with spark + source components
 * 5. Upload complete data to Storage (source of truth)
 * 6. Update query cache (optional, non-fatal)
 * 7. Revalidate paths for UI refresh
 *
 * Pattern: src/app/actions/annotations.ts:39-135
 */
export async function createSpark(input: CreateSparkInput) {
  const user = await getCurrentUser()
  if (!user) throw new Error('Unauthorized')

  const supabase = createClient()

  // 1. Extract metadata from content
  const tags = extractTags(input.content)
  const connections = await buildSparkConnections(
    input.content,
    input.context.originChunkId,
    user.id
  )

  // 2. Create ECS entity (NO domain tables)
  // Pattern: Two-component pattern (spark + source)
  const sparkId = await ecs.createEntity(user.id, {
    spark: {
      content: input.content,
      created_at: new Date().toISOString(),
      tags,
      connections // Complete connection graph stored here
    },
    source: {
      chunk_id: input.context.originChunkId,
      document_id: input.context.documentId
    }
  })

  console.log(`[Sparks] ✓ Created ECS entity: ${sparkId}`)

  // 3. Build complete Storage JSON
  const sparkData: SparkStorageJson = {
    entity_id: sparkId,
    user_id: user.id,
    component_type: 'spark',
    data: {
      content: input.content,
      created_at: new Date().toISOString(),
      tags,
      connections
    },
    context: input.context,
    source: {
      chunk_id: input.context.originChunkId,
      document_id: input.context.documentId
    }
  }

  // 4. Upload to Storage (source of truth)
  const storagePath = await uploadSparkToStorage(user.id, sparkId, sparkData)
  console.log(`[Sparks] ✓ Uploaded to Storage: ${storagePath}`)

  // 5. Update query cache (optional, non-fatal)
  try {
    await updateSparkCache(user.id, sparkId, sparkData)
    console.log(`[Sparks] ✓ Updated query cache`)
  } catch (error) {
    console.error(`[Sparks] Cache update failed (non-critical):`, error)
    // Don't fail the operation - cache is rebuildable
  }

  // 6. Revalidate paths
  revalidatePath('/sparks')
  revalidatePath(`/read/${input.context.documentId}`)

  return { success: true, sparkId }
}

/**
 * Delete spark (cascade delete)
 *
 * Pattern: src/app/actions/annotations.ts:198-221
 */
export async function deleteSpark(sparkId: string) {
  const user = await getCurrentUser()
  if (!user) throw new Error('Unauthorized')

  const supabase = createClient()

  // 1. Delete from Storage
  const storagePath = `${user.id}/sparks/${sparkId}/content.json`
  await supabase.storage.from('documents').remove([storagePath])

  // 2. Delete ECS entity (cascades to components)
  await ecs.deleteEntity(sparkId, user.id)

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
 *
 * Pattern: Query cache table, fallback to ECS if needed
 */
export async function getRecentSparks(limit = 50, offset = 0) {
  const user = await getCurrentUser()
  if (!user) throw new Error('Unauthorized')

  const supabase = createClient()

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
 *
 * Pattern: Full-text search on cache table
 */
export async function searchSparks(query: string, limit = 20) {
  const user = await getCurrentUser()
  if (!user) throw new Error('Unauthorized')

  const supabase = createClient()

  // Full-text search on content
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
- [x] Server actions compile: `npm run build`
- [x] Type checking passes: `npm run type-check`

#### Manual Verification:
- [ ] Spark creates in ECS (check `entities` and `components` tables)
- [ ] Storage JSON uploaded correctly (check `documents` bucket)
- [ ] Cache updated (check `sparks_cache` table) - TODO: implement via background job
- [ ] Connections inherited with 0.7x multiplier
- [ ] Tags extracted correctly

**Test Flow:**
1. Create spark with Cmd+K (via UI)
2. Verify entity in `entities` table (`SELECT * FROM entities WHERE id = ?`)
3. Verify component in `components` table (`SELECT * FROM components WHERE entity_id = ? AND component_type = 'spark'`)
4. Verify JSON in Storage (Admin Panel → Scanner → check for spark folder)
5. Verify cache row in `sparks_cache` (`SELECT * FROM sparks_cache WHERE entity_id = ?`)
6. Verify connections array in component data (3 types: origin, mention, inherited)

---

## Phase 5: UI Components

### Overview

**ACTUAL IMPLEMENTATION**: Created bottom slide-in panel (QuickSparkCapture) instead of modal based on UX feedback.
Non-blocking design that keeps document visible while capturing sparks.

### Changes Required

#### 1. Create QuickSparkCapture (Bottom Slide-In Panel)
**File**: `src/components/reader/QuickSparkCapture.tsx`
**Changes**: NEW component - bottom slide-in panel with Framer Motion animations

```typescript
'use client'

import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Zap, Loader2 } from 'lucide-react'
import { createSpark } from '@/app/actions/sparks'
import type { SparkContext } from '@/lib/sparks/types'

interface QuickSparkModalProps {
  documentId: string
  documentTitle: string
  currentChunkId: string
  visibleChunks: string[]
  connections: any[]
  engineWeights: { semantic: number; contradiction: number; bridge: number }
}

export function QuickSparkModal({
  documentId,
  documentTitle,
  currentChunkId,
  visibleChunks,
  connections,
  engineWeights
}: QuickSparkModalProps) {
  const [open, setOpen] = useState(false)
  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(false)

  // Cmd+K hotkey
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setOpen(true)

        // Auto-quote selection if exists
        const selection = window.getSelection()
        const selectedText = selection?.toString().trim()
        if (selectedText) {
          setContent(`> "${selectedText}"\n\n`)
        }
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  const handleSubmit = async () => {
    if (!content.trim() || loading) return

    setLoading(true)
    try {
      // Build context from current reader state
      const sparkContext: SparkContext = {
        documentId,
        documentTitle,
        originChunkId: currentChunkId,
        visibleChunks,
        scrollPosition: window.scrollY,
        activeConnections: connections,
        engineWeights,
        selection: window.getSelection()?.toString() ? {
          text: window.getSelection()!.toString(),
          chunkId: currentChunkId,
          startOffset: 0,
          endOffset: window.getSelection()!.toString().length
        } : undefined
      }

      // Create spark
      await createSpark({
        content: content.trim(),
        context: sparkContext
      })

      // Reset and close
      setContent('')
      setOpen(false)

      console.log('[Sparks] ✓ Created successfully')
    } catch (error) {
      console.error('[Sparks] Failed to create:', error)
      alert('Failed to create spark. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  // Handle Cmd+Enter to submit
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault()
      handleSubmit()
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="w-5 h-5 text-yellow-500" />
            Capture Spark
            <kbd className="ml-auto text-xs text-muted-foreground px-2 py-1 bg-muted rounded">
              ⌘K
            </kbd>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <Textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Capture your thought... Use /chunk_id to link chunks, #tags for organization"
            className="min-h-[150px] resize-none font-mono text-sm"
            autoFocus
            disabled={loading}
          />

          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <div>
              Context: {documentTitle} • {connections.length} connections
            </div>
            <div>
              {content.trim().length} chars • Cmd+Enter to save
            </div>
          </div>

          <div className="flex gap-2 justify-end">
            <Button
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={loading || !content.trim()}
              className="bg-yellow-500 hover:bg-yellow-600"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Zap className="w-4 h-4 mr-2" />
                  Save Spark
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
```

#### 2. Implement SparksTab Timeline
**File**: `src/components/sidebar/SparksTab.tsx`
**Changes**: Replace placeholder with timeline UI

```typescript
'use client'

import { useState, useEffect } from 'react'
import { getRecentSparks } from '@/app/actions/sparks'
import { Zap, Tag, Link } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'

interface Spark {
  entity_id: string
  content: string
  created_at: string
  tags: string[]
  origin_chunk_id: string
}

export function SparksTab() {
  const [sparks, setSparks] = useState<Spark[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    loadSparks()
  }, [])

  const loadSparks = async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await getRecentSparks(50, 0)
      setSparks(data)
    } catch (error) {
      console.error('[Sparks] Failed to load:', error)
      setError('Failed to load sparks. Try refreshing.')
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="p-4 flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" />
        Loading sparks...
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-4">
        <div className="text-sm text-destructive mb-2">{error}</div>
        <Button size="sm" variant="outline" onClick={loadSparks}>
          Retry
        </Button>
      </div>
    )
  }

  if (sparks.length === 0) {
    return (
      <div className="p-4 text-center">
        <Zap className="w-12 h-12 mx-auto mb-2 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">No sparks yet</p>
        <p className="text-xs text-muted-foreground mt-1">Press ⌘K to capture your first thought</p>
      </div>
    )
  }

  return (
    <div className="space-y-3 p-4">
      {sparks.map(spark => (
        <div
          key={spark.entity_id}
          className="p-3 bg-muted/50 rounded-lg hover:bg-muted cursor-pointer transition-colors"
        >
          <p className="text-sm mb-2">{spark.content}</p>

          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>{formatDistanceToNow(new Date(spark.created_at), { addSuffix: true })}</span>

            {spark.tags.length > 0 && (
              <div className="flex items-center gap-1">
                <Tag className="w-3 h-3" />
                {spark.tags.slice(0, 3).map(tag => (
                  <span key={tag} className="px-1.5 py-0.5 bg-primary/10 rounded">
                    #{tag}
                  </span>
                ))}
              </div>
            )}

            {spark.origin_chunk_id && (
              <div className="flex items-center gap-1">
                <Link className="w-3 h-3" />
                <span>Connected</span>
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
```

#### 3. Update ReaderLayout
**File**: `src/components/reader/ReaderLayout.tsx`
**Changes**: Replace QuickSparkModal with QuickSparkCapture

```typescript
// Changed import (line 8)
import { QuickSparkCapture } from './QuickSparkCapture'

// Replaced conditional modal render with always-mounted panel (lines 483-491)
// Component handles own visibility with Cmd+K
<QuickSparkCapture
  documentId={documentId}
  documentTitle={documentTitle}
  currentChunkId={visibleChunks[0]?.id || ''}
  visibleChunks={visibleChunks.map(c => c.id)}
  connections={filteredConnections}
  engineWeights={{ semantic: 0.25, contradiction: 0.40, bridge: 0.35 }}
/>

// Removed: showQuickSpark state, closeQuickCapture handler (no longer needed)
```

### Success Criteria

#### Automated Verification:
- [x] Components compile: `npm run build`
- [x] No TypeScript errors: `npm run type-check`

#### Manual Verification:
- [x] Cmd+K opens slide-in panel in reader
- [x] Auto-quotes selection if text selected
- [x] Spark saves successfully (<1 second)
- [x] Timeline displays sparks in SparksTab (with 5s auto-refresh)
- [x] Tags and connections show correctly (live preview in panel)
- [x] Cmd+Enter submits form
- [x] Panel slides up from bottom (non-blocking)

#### Enhancements Added (Post-Implementation)
- [x] Live tag/chunk ID preview in capture panel
- [x] Chunk ID display in ChunkMetadataIcon hover card
- [x] 5-second auto-refresh for timeline
- [x] Cache update with null embeddings (working, embedding gen deferred)

**Test Flow:**
1. Open document in reader (`/read/[id]`)
2. Press Cmd+K
3. Type content with `#tags` and `/chunk_id`
4. Press Cmd+Enter to save
5. Check SparksTab in RightPanel
6. Verify spark appears in timeline
7. Check Storage for JSON file (Admin Panel → Scanner)

---

## Phase 6: Obsidian Integration

### Overview

Extend Obsidian sync to export sparks alongside documents. Manual export only (no bidirectional sync in v1).

**Pattern**: Follow annotation export pattern from `worker/handlers/obsidian-sync.ts`.

### Changes Required

#### 1. Extend Obsidian Handler
**File**: `worker/handlers/obsidian-sync.ts`
**Changes**: Add exportSparks function

```typescript
import matter from 'gray-matter'
import { promises as fs } from 'fs'

/**
 * Export sparks to Obsidian vault
 * Creates: document-name.sparks.md with YAML frontmatter
 *
 * Pattern: Similar to annotation export
 */
async function exportSparks(
  documentId: string,
  vaultFilePath: string
): Promise<void> {
  const supabase = getSupabaseClient()

  // Get sparks for this document (from cache)
  const { data: sparks, error } = await supabase
    .from('sparks_cache')
    .select('*')
    .eq('document_id', documentId)
    .order('created_at', { ascending: false })

  if (error) {
    console.error(`[Obsidian] Failed to get sparks for ${documentId}:`, error)
    return // Non-fatal, continue export
  }

  if (!sparks || sparks.length === 0) {
    console.log(`[Obsidian] No sparks to export for ${documentId}`)
    // Don't create empty .sparks.md file
    return
  }

  // Build YAML frontmatter + content for each spark
  const sparksContent = sparks.map(spark => {
    const frontmatter = {
      id: spark.entity_id,
      created: spark.created_at,
      updated: spark.updated_at,
      tags: spark.tags || [],
      origin_chunk: spark.origin_chunk_id,
      storage_path: spark.storage_path
    }

    return matter.stringify(spark.content, frontmatter)
  }).join('\n---\n\n')

  // Write to .sparks.md file
  const sparksPath = vaultFilePath.replace(/\.md$/, '.sparks.md')

  try {
    await fs.writeFile(sparksPath, sparksContent, 'utf-8')
    console.log(`[Obsidian] ✓ Exported ${sparks.length} sparks to ${sparksPath}`)
  } catch (error) {
    console.error(`[Obsidian] Failed to write sparks file:`, error)
  }
}

// Modify exportToObsidian function (around line 141)
// Add after annotations export:
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

#### 2. Add Obsidian Settings
**File**: `src/lib/types/obsidian.ts`
**Changes**: Add exportSparks flag

```typescript
export interface ObsidianSettings {
  vaultPath: string
  exportPath: string
  exportAnnotations: boolean
  exportSparks: boolean // NEW
  syncOnSave: boolean
}
```

### Success Criteria

#### Automated Verification:
- [ ] Worker builds: `cd worker && npm run build`
- [ ] No TypeScript errors

#### Manual Verification:
- [ ] Sparks export to `.sparks.md` file
- [ ] YAML frontmatter correct
- [ ] Multiple sparks separated by `---`
- [ ] Obsidian can read files
- [ ] Export respects `exportSparks` setting

**Test Flow:**
1. Create 3 sparks for a document
2. Go to Admin Panel → Integrations tab
3. Click "Export to Obsidian" for document
4. Check vault for `document-name.sparks.md`
5. Verify YAML frontmatter (id, created, tags, origin_chunk)
6. Open in Obsidian and verify rendering

---

## Testing Strategy

### Unit Tests

**File**: `src/lib/sparks/__tests__/connections.test.ts`

```typescript
import { extractChunkIds, extractTags, buildSparkConnections } from '../connections'

describe('Spark Connections', () => {
  test('extracts chunk IDs from content', () => {
    const content = 'See /chunk_abc and /chunk-def-123'
    const ids = extractChunkIds(content)
    expect(ids).toEqual(['chunk_abc', 'chunk_def_123'])
  })

  test('extracts tags from content', () => {
    const content = 'This is about #paranoia and #surveillance-capitalism'
    const tags = extractTags(content)
    expect(tags).toEqual(['paranoia', 'surveillance-capitalism'])
  })

  test('builds complete connection graph', async () => {
    const connections = await buildSparkConnections(
      'Test content /chunk_abc #test',
      'chunk_origin',
      'user_123'
    )

    // Origin connection
    expect(connections).toContainEqual({
      chunkId: 'chunk_origin',
      type: 'origin',
      strength: 1.0
    })

    // Mention connection
    expect(connections).toContainEqual({
      chunkId: 'chunk_abc',
      type: 'mention',
      strength: 0.9
    })

    // Inherited connections (mocked)
    expect(connections.some(c => c.type === 'inherited')).toBe(true)
  })
})
```

### Integration Tests

**File**: `src/app/actions/__tests__/sparks.test.ts`

```typescript
import { createSpark, getRecentSparks } from '../sparks'

describe('Spark Actions', () => {
  test('creates spark with complete flow', async () => {
    const result = await createSpark({
      content: 'Test spark #test',
      context: {
        documentId: 'doc_123',
        documentTitle: 'Test Doc',
        originChunkId: 'chunk_123',
        visibleChunks: ['chunk_123'],
        scrollPosition: 0,
        activeConnections: [],
        engineWeights: { semantic: 0.25, contradiction: 0.4, bridge: 0.35 }
      }
    })

    expect(result.success).toBe(true)
    expect(result.sparkId).toBeDefined()

    // Verify entity created
    const { ecs } = await import('@/lib/ecs')
    const entity = await ecs.getEntity(result.sparkId, 'user_123')

    const sparkComponent = entity.components?.find(c => c.component_type === 'spark')
    expect(sparkComponent.data.content).toBe('Test spark #test')
    expect(sparkComponent.data.tags).toContain('test')
  })

  test('timeline returns recent sparks', async () => {
    const sparks = await getRecentSparks(10, 0)
    expect(Array.isArray(sparks)).toBe(true)
  })
})
```

### Manual Testing Checklist

- [ ] Create spark with Cmd+K
- [ ] Auto-quote selection works
- [ ] Tags extracted correctly (`#tag` → stored in tags array)
- [ ] Chunk mentions resolved (`/chunk_id` → stored in connections)
- [ ] Connections inherited (top 10, 0.7x weight)
- [ ] Storage JSON uploaded (check documents bucket)
- [ ] Cache updated (check sparks_cache table)
- [ ] Timeline shows spark in SparksTab
- [ ] Search finds spark (full-text)
- [ ] Obsidian export works (.sparks.md file created)
- [ ] Cache rebuild from Storage (`rebuildSparksCache()`)
- [ ] Delete spark removes all traces (Storage + ECS + Cache)

---

## Performance Considerations

### Timeline Queries

```sql
-- Fast with index on (user_id, created_at DESC)
-- 50 sparks in <100ms
SELECT * FROM sparks_cache
WHERE user_id = ?
ORDER BY created_at DESC
LIMIT 50 OFFSET 0;
```

**Index**: `idx_sparks_cache_user_time` on `(user_id, created_at DESC)`

### Search Queries

```sql
-- Full-text search with GIN index
-- <200ms for 1000 sparks
SELECT * FROM sparks_cache
WHERE user_id = ?
  AND to_tsvector('english', content) @@ plainto_tsquery('english', ?)
ORDER BY created_at DESC
LIMIT 20;
```

**Index**: `idx_sparks_cache_content_fts` on `to_tsvector('english', content)`

### Cache Rebuild Performance

- 1000 sparks rebuild: ~30 seconds
- Embeddings generation: Rate limited by API (10 req/sec)
- Parallelizable: Batch 10 sparks at once

### Storage Costs

- 100 bytes per spark (compressed JSON)
- 10,000 sparks = 1 MB storage = $0.001/month
- **Negligible cost**

---

## Migration & Rollout Plan

### Phase 1: Foundation (Week 1)
- [ ] Implement types and Storage layer
- [ ] Create cache table migration
- [ ] Build connection helpers
- [ ] Write unit tests

### Phase 2: Core Features (Week 1)
- [ ] Implement server actions
- [ ] Create UI components
- [ ] Test end-to-end flow
- [ ] Deploy to local

### Phase 3: Integration (Week 2)
- [ ] Wire up reader page
- [ ] Implement search
- [ ] Obsidian export
- [ ] Cache rebuild job

### Phase 4: Polish (Week 2)
- [ ] Error handling
- [ ] Loading states
- [ ] Success feedback
- [ ] Documentation

---

## Disaster Recovery

### If Cache Lost (sparks_cache table)

```bash
# Rebuild from Storage (zero data loss)
cd worker
npm run rebuild-sparks-cache -- --user-id=<uuid>
```

Implementation:
```typescript
// worker/scripts/rebuild-cache.ts
import { rebuildSparksCache } from '../lib/sparks/rebuild-cache'

const userId = process.argv[2]
await rebuildSparksCache(userId)
```

### Cache Health Monitoring

Run periodically (e.g., daily cron) to detect and auto-fix cache issues:

```typescript
// Periodic health check
const integrity = await verifySparksIntegrity(userId)
if (!integrity.matched) {
  console.warn(`[Sparks] Integrity check failed: Storage=${integrity.storageCount}, Cache=${integrity.entityCount}`)
  await rebuildSparksCache(userId)
}

// Freshness check with auto-repair
const { stale, missing } = await verifyCacheFreshness(userId)
if (stale.length > 0 || missing.length > 0) {
  console.warn(`[Sparks] Cache stale: ${stale.length}, missing: ${missing.length}`)
  await rebuildSparksCache(userId) // Auto-fix
}
```

### If ECS Lost (entities/components tables)

Storage is source of truth. Restore flow:
1. Read all spark JSONs from Storage
2. Recreate entities + components from JSON
3. Rebuild cache

```typescript
// worker/scripts/restore-sparks-from-storage.ts
const sparkIds = await listUserSparks(userId)

for (const sparkId of sparkIds) {
  const sparkData = await downloadSparkFromStorage(userId, sparkId)

  // Recreate ECS entity
  await ecs.createEntity(userId, {
    spark: sparkData.data,
    source: sparkData.source
  })
}

// Rebuild cache
await rebuildSparksCache(userId)
```

### If Storage Lost

**CRITICAL**: This is source of truth. No automatic recovery.

**Prevention**:
- Enable versioning on Supabase Storage bucket
- Regular exports via Admin Panel (ZIP bundles)
- User backups to Obsidian vault

---

## References

### Existing Patterns

- **ECS Implementation**: `src/lib/ecs/ecs.ts:27-333`
- **Annotation Pattern**: `src/app/actions/annotations.ts:39-135`
- **Storage Helpers**: `worker/lib/storage-helpers.ts:33-105`
- **Obsidian Integration**: `worker/handlers/obsidian-sync.ts`

### Documentation

- **ECS Guide**: `docs/ECS_IMPLEMENTATION.md`
- **Storage Pattern**: `docs/STORAGE_PATTERNS.md`
- **Testing Rules**: `docs/testing/TESTING_RULES.md`
- **Storage-First Guide**: `docs/STORAGE_FIRST_PORTABILITY_GUIDE.md`

---

## Cost Summary

**Per Spark:**
- Storage: $0.001 (100 bytes JSON)
- Embedding: $0.000001 (768d vector)
- Total: ~$0.001

**For 10,000 Sparks:**
- Storage: $10
- Embeddings: $0.01
- Total: ~$10

**Cache Rebuild:**
- API costs: ~$0.10 for 10,000 sparks (embeddings)
- Time: ~30 seconds

**Completely negligible for personal tool.**

---

## Success Metrics

1. **Data Integrity**: Zero data loss on cache rebuild from Storage
2. **Performance**: Timeline loads in <500ms for 1000 sparks
3. **User Experience**: Cmd+K to saved spark in <1 second
4. **Search Quality**: >70% relevant results (full-text search)
5. **Obsidian Export**: All sparks exportable with complete metadata

---

## Next Steps

1. ✅ Review this plan with developer
2. Start with Phase 1 (Types & Storage layer)
3. Test each phase before proceeding
4. Deploy incrementally
5. Monitor performance

**This is the ECS-native approach. No domain tables. Pure entities + components + Storage.**

---

## Implementation Log & Bug Fixes

### Phases 1-5: Core Implementation (COMPLETED ✅)

All planned phases completed successfully:
- Phase 1: Types & Storage helpers
- Phase 2: Cache table schema
- Phase 3: Connection logic
- Phase 4: Server actions (createSpark, deleteSpark, getRecentSparks, searchSparks)
- Phase 5: UI components (QuickSparkCapture panel, SparksTab timeline)

### Post-Implementation Bug Fixes & Improvements

#### Text Selection & UX Issues
**Problem**: Selection conflicts between spark panel and annotation panel, typing lag, UI performance issues
**Root Cause**: Over-engineered selection preservation, aggressive event listeners, synchronous tag extraction

**Fixes Applied**:
1. **Removed aggressive selectionchange listener** - Was causing UI freezing by constantly restoring ranges
2. **Debounced tag/chunk extraction** (300ms) - Prevents typing lag from synchronous regex parsing
3. **Frozen selection data** - Preserves selection info without fighting browser's natural clearing
4. **Fixed sparkCaptureOpen state** - Correctly prevents annotation panel when spark panel owns selection

**Result**: Smooth typing, no performance issues, clean state management

#### Annotation Color Update Issues
**Problem**: Editing annotation color showed toast but didn't update visual immediately
**Root Cause**: Removed unnecessary `revalidatePath` call (server cache layer, not client state layer)

**Fix**: Removed `revalidatePath` import and call - Zustand store handles client updates correctly

**Result**: Instant visual updates on color changes

#### Spark Panel UX Improvements
1. **Moved panel to left side** (`left-0 top-20 bottom-20 w-[400px]`) - Doesn't cover reading area
2. **Fixed scroll position** for "Create Annotation" - Uses `block: 'start'` to show annotation in upper viewport
3. **Added click-to-edit** - Clicking spark in SparksTab opens panel with pre-filled content via `editingSparkContent` in UIStore
4. **Fixed connections capture** - Added fallbacks for `originChunkId` and `activeConnections` to prevent empty context

### Architectural Decisions Made

1. **UIStore for cross-component communication** - Used for spark panel state, pending annotation selection, editing content
2. **Debouncing over synchronous processing** - Better UX than blocking operations
3. **Data preservation over visual persistence** - Accept browser selection clearing, preserve data layer
4. **Simple over complex** - Removed over-engineered solutions, used straightforward Zustand patterns

### Testing Status

**Working**:
- ✅ Spark creation with Cmd+K
- ✅ Auto-quote selection
- ✅ Tag extraction (#tags)
- ✅ Chunk linking (/chunk_id)  
- ✅ Timeline display with 5s refresh
- ✅ Click-to-edit sparks
- ✅ Annotation panel draggable
- ✅ Color updates instant
- ✅ Panel positioning (left side, no blocking)

**Needs Verification**:
- ⚠️ Connections actually being saved and displayed
- ⚠️ Storage JSON completeness
- ⚠️ Cache updates working correctly
- ⚠️ Selection edge cases (multi-chunk, boundaries)
- ⚠️ Performance under load (1000+ sparks)

### Bug Fixes (2025-10-18 - Session 2)

**Issue 1: Typing Lag Fixed ✅**
- **Root Cause**: useEffect with `content.length` dependency (line 119) caused cursor repositioning on every keystroke
- **Fix**: Removed `content.length` from dependency array - only runs when panel opens
- **File**: `src/components/reader/QuickSparkCapture.tsx`
- **Result**: Smooth typing, no lag or weird letter behavior

**Issue 2: Connections Now Displayed ✅**
- **Root Cause**: `sparks_cache` table missing `connections` column
- **Fix**: Created migration 056 to add `connections JSONB` column with GIN index
- **Files Modified**:
  - `supabase/migrations/056_add_connections_to_sparks_cache.sql` - Added connections column
  - `src/lib/sparks/types.ts` - Updated `SparkCacheRow` interface
  - `src/app/actions/sparks.ts` - Save connections to cache on create
  - `src/components/sidebar/SparksTab.tsx` - Display connection counts with breakdown by type
  - `src/components/reader/QuickSparkCapture.tsx` - Improved connection context display
- **Result**: Connections now saved and displayed in UI with full breakdown

**Issue 3: Context Info Display Added ✅**
- **Feature**: Added expandable context info to each spark in sidebar
- **Implementation**: Collapsible section showing origin chunk, connections detail, storage path, timestamps
- **File**: `src/components/sidebar/SparksTab.tsx`
- **Result**: Users can inspect all captured context data per spark

### Bug Fixes (2025-10-18 - Session 3)

**Issue 4: Annotation Color Not Updating ✅**
- **Root Cause**: Stale optimistic annotation overriding updated store data in merge logic
- **Investigation**:
  - Store updated correctly: `purple → pink` ✓
  - BlockRenderer re-rendered ✓
  - But allAnnotations merge logic replaced store (pink) with stale optimistic (purple) ❌
- **Fix**: Clear optimistic annotation from Map after update completes
- **Files Modified**:
  - `src/components/reader/VirtualizedReader.tsx` (lines 314-325) - Remove from optimistic Map after update
  - `src/components/reader/BlockRenderer.tsx` (lines 60-66) - Added debug logging
  - `src/stores/annotation-store.ts` (lines 84-100) - Added debug logging
- **Result**: Annotation color changes appear immediately without duplicates

**Issue 5: Selection Expansion (External Cause) ✅**
- **Root Cause**: Worker log output causing Next.js fast refresh
- **Fix**: External to this implementation
- **Result**: No selection expansion issues

### Known Issues / Future Work

1. ~~**Connection verification**~~ - ✅ FIXED: Connections now saved and displayed
2. ~~**Typing lag**~~ - ✅ FIXED: Smooth typing experience restored
3. ~~**Selection expansion**~~ - ✅ FIXED: External cause (worker logs)
4. ~~**Annotation color update**~~ - ✅ FIXED: Optimistic annotation cleared on update
5. **ECS Consistency** - ⚠️ **CRITICAL**: Sparks use direct ECS calls, annotations use wrapper class
   - Need `src/lib/ecs/sparks.ts` following `annotations.ts` pattern
   - Prevents inconsistency as codebase grows (flashcards, study sessions, etc.)
   - See: Architecture Consistency section below
6. **Edit vs Create mode** - Currently all spark submissions create new sparks; need update/delete functionality
7. **Spark deduplication** - No prevention of duplicate sparks from same content
8. **Search implementation** - searchSparks action exists but no UI for it yet
9. **Obsidian export** - Integration exists for annotations but not sparks (Phase 6)

### Code Quality Notes

**Clean Patterns Used**:
- Zustand for client state (no prop drilling)
- Server Actions for mutations ('use server')
- ECS for flexible data (entities + components)
- Storage-first for portability
- Debouncing for performance

**Avoided Anti-Patterns**:
- ❌ No modals (used slide-in panels)
- ❌ No prop drilling (UIStore)
- ❌ No premature optimization
- ❌ No complex state machines
- ❌ No fighting the browser

**Tech Debt**:
- Some `any` types in selection handling (QuickSparkCapture line 58, 74)
- UI store types could be more specific for `pendingAnnotationSelection`
- Could extract debounce logic to custom hook
- Tag/chunk extraction could be moved to worker for heavy usage

---

## Architecture Consistency Requirements

### ECS Pattern Inconsistency Identified

**Current State:**
- **Annotations**: Use `AnnotationOperations` wrapper class (`src/lib/ecs/annotations.ts`)
  - Type-safe API: `ops.create()`, `ops.update()`, `ops.delete()`
  - 5 components: Position, Visual, Content, Temporal, ChunkRef
  - Clean abstraction layer over raw ECS

- **Sparks**: Use direct ECS calls in server actions (`src/app/actions/sparks.ts`)
  - Direct calls: `ecs.createEntity()`, `ecs.deleteEntity()`
  - 2 components: spark, source
  - No wrapper class, no abstraction layer

**Problem:**
As the codebase grows with flashcards, study sessions, themes, etc., this inconsistency will:
1. Create confusion about which pattern to follow
2. Make refactoring harder (change ECS internals = update 10 places vs 1)
3. Reduce type safety (no validation at ECS entity layer)
4. Harder to test (mocking raw ECS vs mocking operations class)

**Recommendation:**
Create `src/lib/ecs/sparks.ts` following the `annotations.ts` pattern:

```typescript
// src/lib/ecs/sparks.ts
export interface CreateSparkInput {
  content: string
  tags: string[]
  connections: SparkConnection[]
  chunkId: string
  documentId: string
}

export class SparkOperations {
  constructor(private ecs: ECS, private userId: string) {}

  async create(input: CreateSparkInput): Promise<string>
  async update(sparkId: string, updates: UpdateSparkInput): Promise<void>
  async delete(sparkId: string): Promise<void>
  async getRecent(limit: number): Promise<SparkEntity[]>
  async search(query: string): Promise<SparkEntity[]>
}
```

**Benefits:**
1. **Consistency**: All ECS entities follow same pattern
2. **Type Safety**: Input validation at operations layer
3. **Testability**: Mock SparkOperations instead of raw ECS
4. **Discoverability**: Clear API shows available operations
5. **Future-proof**: New entities (flashcards, study) follow this pattern
6. **Maintainability**: Change ECS internals in one place

**Implementation Tasks:**
1. Create `src/lib/ecs/sparks.ts` with SparkOperations class
2. Add SparkComponent types to `src/lib/ecs/components.ts`
3. Update `src/app/actions/sparks.ts` to use SparkOperations
4. Add Zod schemas for component validation
5. Document pattern in ECS_IMPLEMENTATION.md

**Estimated Effort:** 30-45 minutes

---

**Last Updated**: 2025-10-18
**Status**: Core functionality complete, architecture consistency improvements needed
