# Spark System Implementation Plan (ECS-Native)

## Overview
Implement personal knowledge capture system (Sparks) using pure ECS architecture. Sparks are entities with components, not domain tables. Storage-first with optional query cache. No pollution of existing systems.

## Core Architectural Principles

### 1. Pure ECS (No Domain Tables)
- Sparks are entities in `entities` table
- Data stored as components in `components` table
- Follow annotation pattern exactly (`src/app/actions/annotations.ts:77-107`)
- Optional cache table ONLY for search performance

### 2. Storage-First (Source of Truth)
- Complete spark data in Storage JSON
- Database cache rebuilt from Storage on startup
- Connection graph stored in spark component
- Loss of database = zero data loss (restore from Storage)

### 3. Separation of Concerns
- `connections` table = AI-detected chunk-to-chunk only
- Spark connections = stored in spark component JSON
- No polymorphic tables, no nullable columns
- Two connection systems that don't mix

### 4. Cost-Aware Design
- Storage: ~$0.001 per spark (100 bytes)
- Embeddings: ~$0.000001 per spark
- 10,000 sparks = $10 total cost
- Query cache rebuild: <5 seconds for 1000 sparks

## What We're NOT Doing
- âŒ Creating `sparks` domain table (breaks ECS)
- âŒ Creating `spark_connections` table (breaks ECS)
- âŒ Extending `connections` table (keeps systems separate)
- âŒ Fuzzy mention matching (use explicit chunk IDs)
- âŒ Auto-threading sparks (deferred to v2)
- âŒ Bidirectional Obsidian sync (manual export only)

## Implementation Approach

**Core Pattern**: Follow annotations exactly, but for sparks.

```typescript
// Annotations (existing pattern)
await ecs.createEntity(userId, {
  annotation: { text: "...", startOffset: 0, endOffset: 100 },
  source: { chunk_id: "chunk_abc", document_id: "doc_456" }
})

// Sparks (same pattern)
await ecs.createEntity(userId, {
  spark: { content: "...", tags: [...], connections: [...] },
  source: { chunk_id: "chunk_abc", document_id: "doc_456" }
})
```

**Storage Pattern**: Like documents, spark JSON in Storage.

```
storage/users/{userId}/sparks/{sparkId}/
├── content.json          # Complete spark data (source of truth)
```

**Query Pattern**: Optional cache for timeline/search only.

---

## Phase 1: Storage Layer & Types

### Overview
Define TypeScript types and Storage helpers. No database changes yet.

### Changes Required:

#### 1. Spark Types
**File**: `src/lib/sparks/types.ts`
**Changes**: Define spark component structure

```typescript
// Spark component (stored in ECS components table)
export interface SparkComponent {
  content: string
  created_at: string
  updated_at?: string
  tags: string[]
  connections: SparkConnection[]
}

// Connection stored within spark component
export interface SparkConnection {
  chunkId: string
  type: 'origin' | 'mention' | 'inherited'
  strength: number
  metadata?: {
    inheritedFrom?: string
    originalStrength?: number
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

// Complete spark data for Storage
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
```

#### 2. Storage Helpers
**File**: `src/lib/sparks/storage.ts`
**Changes**: Upload/download spark JSON to/from Storage

```typescript
import { createClient } from '@/lib/supabase/server'
import type { SparkStorageJson } from './types'

/**
 * Upload spark to Storage (source of truth)
 * Path: {userId}/sparks/{sparkId}/content.json
 */
export async function uploadSparkToStorage(
  userId: string,
  sparkId: string,
  sparkData: SparkStorageJson
): Promise<string> {
  const supabase = createClient()
  const jsonPath = `${userId}/sparks/${sparkId}/content.json`

  const { error } = await supabase.storage
    .from('documents')
    .upload(jsonPath, JSON.stringify(sparkData, null, 2), {
      contentType: 'application/json',
      upsert: true
    })

  if (error) {
    throw new Error(`Failed to upload spark to Storage: ${error.message}`)
  }

  console.log(`[Sparks] Uploaded to Storage: ${jsonPath}`)
  return jsonPath
}

/**
 * Download spark from Storage
 */
export async function downloadSparkFromStorage(
  userId: string,
  sparkId: string
): Promise<SparkStorageJson> {
  const supabase = createClient()
  const jsonPath = `${userId}/sparks/${sparkId}/content.json`

  const { data, error } = await supabase.storage
    .from('documents')
    .download(jsonPath)

  if (error) {
    throw new Error(`Failed to download spark from Storage: ${error.message}`)
  }

  const text = await data.text()
  return JSON.parse(text)
}

/**
 * List all spark files in Storage for a user
 */
export async function listUserSparks(userId: string): Promise<string[]> {
  const supabase = createClient()
  const { data: files, error } = await supabase.storage
    .from('documents')
    .list(`${userId}/sparks`, {
      limit: 1000,
      offset: 0
    })

  if (error) {
    throw new Error(`Failed to list sparks: ${error.message}`)
  }

  return files
    ?.filter(f => f.name.endsWith('.json'))
    .map(f => f.name.replace('/content.json', '')) || []
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
  const sparkFiles = await listUserSparks(userId)
  const storageCount = sparkFiles.length

  // Count ECS entities with spark component
  const { data: entities } = await supabase
    .from('components')
    .select('entity_id')
    .eq('component_type', 'spark')
    .eq('user_id', userId)

  const entityCount = entities?.length || 0

  return {
    storageCount,
    entityCount,
    matched: storageCount === entityCount
  }
}
```

### Success Criteria:

#### Automated Verification:
- [ ] Types compile: `npm run type-check`
- [ ] Storage helpers export correctly

#### Manual Verification:
- [ ] Can upload test JSON to Storage
- [ ] Can download and parse JSON
- [ ] Integrity check detects mismatches

**No database changes yet.** Pure Storage layer first.

---

## Phase 2: Optional Query Cache

### Overview
Create optional cache table for timeline/search queries. This is NOT source of truth - rebuilt from Storage on startup.

### Changes Required:

#### 1. Cache Table Migration
**File**: `supabase/migrations/053_create_sparks_cache.sql`
**Changes**: Denormalized query cache (optional, rebuildable)

```sql
-- Migration 053: Sparks query cache
-- 
-- IMPORTANT: This table is NOT source of truth.
-- Source of truth: Storage JSON files
-- This table: Denormalized cache for fast queries only
-- 
-- Rebuild process:
-- 1. DELETE FROM sparks_cache WHERE user_id = ?
-- 2. Read all Storage JSON files
-- 3. INSERT denormalized rows
--
-- Loss of this table = zero data loss (rebuild from Storage)

CREATE TABLE sparks_cache (
  -- Reference to ECS entity
  entity_id UUID PRIMARY KEY REFERENCES entities(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Denormalized for queries (copied from Storage JSON)
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ,

  -- Origin tracking
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
CREATE INDEX idx_sparks_cache_user_time 
  ON sparks_cache(user_id, created_at DESC);

CREATE INDEX idx_sparks_cache_origin 
  ON sparks_cache(origin_chunk_id) 
  WHERE origin_chunk_id IS NOT NULL;

CREATE INDEX idx_sparks_cache_document 
  ON sparks_cache(document_id) 
  WHERE document_id IS NOT NULL;

CREATE INDEX idx_sparks_cache_tags 
  ON sparks_cache USING gin(tags);

CREATE INDEX idx_sparks_cache_embedding 
  ON sparks_cache USING ivfflat(embedding vector_cosine_ops)
  WITH (lists = 100);

-- Full-text search on content
CREATE INDEX idx_sparks_cache_content_fts 
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
  'CACHE ONLY. Source of truth: Storage JSON. Rebuild from Storage on data loss.';

COMMENT ON COLUMN sparks_cache.entity_id IS 
  'References entities table. Spark data in components table.';

COMMENT ON COLUMN sparks_cache.storage_path IS 
  'Path to source JSON in Storage. Used for integrity verification.';

COMMENT ON COLUMN sparks_cache.cached_at IS 
  'When this cache row was last rebuilt from Storage.';
```

#### 2. Cache Rebuild Function
**File**: `worker/lib/sparks/rebuild-cache.ts`
**Changes**: Rebuild cache from Storage (disaster recovery)

```typescript
import { createClient } from '@/lib/supabase/server'
import { listUserSparks, downloadSparkFromStorage } from '@/lib/sparks/storage'
import { embed } from 'ai'
import { google } from '@ai-sdk/google'

/**
 * Rebuild sparks cache from Storage
 * Used on startup or after data loss
 */
export async function rebuildSparksCache(userId: string): Promise<{
  rebuilt: number
  errors: string[]
}> {
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

  // 3. Download and cache each spark
  for (const sparkId of sparkIds) {
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
  }

  console.log(`[Sparks] Cache rebuild complete: ${rebuilt} sparks, ${errors.length} errors`)

  return { rebuilt, errors }
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

### Success Criteria:

#### Automated Verification:
- [ ] Migration applies: `npx supabase db reset`
- [ ] Indexes created successfully
- [ ] RLS policies in place

#### Manual Verification:
- [ ] Can rebuild cache from Storage
- [ ] Timeline query <100ms for 1000 sparks
- [ ] Embedding search works

**Service Restarts:**
- [x] Supabase: `npx supabase db reset` (schema changed)

---

## Phase 3: Connection Inheritance Logic

### Overview
Implement connection inheritance from origin chunks. Stored in spark component, not separate table.

### Changes Required:

#### 1. Connection Inheritance Helper
**File**: `src/lib/sparks/connections.ts`
**Changes**: Inherit connections from origin chunk (0.7x weight)

```typescript
import { createClient } from '@/lib/supabase/server'
import type { SparkConnection } from './types'

/**
 * Extract explicit chunk references from spark content
 * Format: /chunk_abc123 or /chunk-abc-123
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
 * Returns connections with 0.7x strength multiplier
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
 */
export async function buildSparkConnections(
  content: string,
  originChunkId: string,
  userId: string
): Promise<SparkConnection[]> {
  const connections: SparkConnection[] = []

  // 1. Origin connection (highest strength)
  connections.push({
    chunkId: originChunkId,
    type: 'origin',
    strength: 1.0,
    metadata: { relationship: 'origin' }
  })

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

  // 3. Inherited from origin chunk
  const inherited = await getInheritedConnections(originChunkId, userId)
  connections.push(...inherited)

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

### Success Criteria:

#### Automated Verification:
- [ ] Types compile: `npm run type-check`
- [ ] Helpers export correctly

#### Manual Verification:
- [ ] Chunk ID extraction works
- [ ] Tag extraction works
- [ ] Connection inheritance applies 0.7x multiplier

**No database changes.** Pure logic layer.

---

## Phase 4: Server Actions (ECS-Native)

### Overview
Create spark using pure ECS. No domain tables, just entities + components + Storage.

### Changes Required:

#### 1. Spark Server Actions
**File**: `src/app/actions/sparks.ts`
**Changes**: Create/update/delete sparks via ECS

```typescript
'use server'

import { revalidatePath } from 'next/cache'
import { getCurrentUser } from '@/lib/auth'
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
 * Flow:
 * 1. Create ECS entity with spark + source components
 * 2. Build connection graph (origin + mentions + inherited)
 * 3. Upload complete data to Storage (source of truth)
 * 4. Update query cache (optional)
 */
export async function createSpark(input: CreateSparkInput) {
  const user = await getCurrentUser()
  if (!user) throw new Error('Unauthorized')

  // 1. Extract metadata from content
  const tags = extractTags(input.content)
  const connections = await buildSparkConnections(
    input.content,
    input.context.originChunkId,
    user.id
  )

  // 2. Create ECS entity (NO domain tables)
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

  console.log(`[Sparks] Created ECS entity: ${sparkId}`)

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
  console.log(`[Sparks] Uploaded to Storage: ${storagePath}`)

  // 5. Update query cache (optional, for timeline/search)
  try {
    await updateSparkCache(user.id, sparkId, sparkData)
    console.log(`[Sparks] Updated query cache`)
  } catch (error) {
    console.error(`[Sparks] Cache update failed (non-critical):`, error)
    // Don't fail the operation - cache is rebuildable
  }

  revalidatePath('/sparks')
  revalidatePath(`/read/${input.context.documentId}`)

  return { success: true, sparkId }
}

/**
 * Update existing spark
 */
export async function updateSpark(
  sparkId: string,
  content: string
) {
  const user = await getCurrentUser()
  if (!user) throw new Error('Unauthorized')

  // 1. Get existing spark from Storage
  const { downloadSparkFromStorage } = await import('@/lib/sparks/storage')
  const existingSpark = await downloadSparkFromStorage(user.id, sparkId)

  // 2. Rebuild connections (content may have changed)
  const tags = extractTags(content)
  const connections = await buildSparkConnections(
    content,
    existingSpark.source.chunk_id,
    user.id
  )

  // 3. Update ECS component
  await ecs.updateComponent(sparkId, 'spark', {
    ...existingSpark.data,
    content,
    updated_at: new Date().toISOString(),
    tags,
    connections
  })

  // 4. Update Storage
  const updatedData: SparkStorageJson = {
    ...existingSpark,
    data: {
      ...existingSpark.data,
      content,
      updated_at: new Date().toISOString(),
      tags,
      connections
    }
  }

  await uploadSparkToStorage(user.id, sparkId, updatedData)

  // 5. Update cache
  try {
    await updateSparkCache(user.id, sparkId, updatedData)
  } catch (error) {
    console.error(`[Sparks] Cache update failed (non-critical):`, error)
  }

  revalidatePath('/sparks')
  return { success: true }
}

/**
 * Delete spark
 */
export async function deleteSpark(sparkId: string) {
  const user = await getCurrentUser()
  if (!user) throw new Error('Unauthorized')

  const supabase = createClient()

  // 1. Delete from Storage
  const storagePath = `${user.id}/sparks/${sparkId}/content.json`
  await supabase.storage.from('documents').remove([storagePath])

  // 2. Delete ECS entity (cascades to components)
  await ecs.deleteEntity(sparkId)

  // 3. Delete from cache (optional)
  await supabase.from('sparks_cache').delete().eq('entity_id', sparkId)

  revalidatePath('/sparks')
  return { success: true }
}

/**
 * Get sparks for timeline (uses cache for performance)
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

### Success Criteria:

#### Automated Verification:
- [ ] Server actions compile: `npm run build`
- [ ] Type checking passes: `npm run type-check`

#### Manual Verification:
- [ ] Spark creates in ECS (check `entities` and `components` tables)
- [ ] Storage JSON uploaded correctly
- [ ] Cache updated (check `sparks_cache` table)
- [ ] Connections inherited with 0.7x multiplier

**Test Flow:**
1. Create spark with Cmd+K
2. Verify entity in `entities` table
3. Verify component in `components` table (type='spark')
4. Verify JSON in Storage
5. Verify cache row in `sparks_cache`

---

## Phase 5: UI Components

### Overview
Create Cmd+K modal and timeline display. Follow annotation pattern for UI integration.

### Changes Required:

#### 1. Spark Capture Modal
**File**: `src/components/sparks/SparkCapture.tsx`
**Changes**: Cmd+K modal with auto-quote selection

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
import { useReaderContext } from '@/hooks/useReaderContext'

export function SparkCapture() {
  const [open, setOpen] = useState(false)
  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(false)
  const context = useReaderContext()

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
      // Get current reading context
      const sparkContext = {
        documentId: context.documentId,
        documentTitle: context.documentTitle,
        originChunkId: context.currentChunkId,
        visibleChunks: context.visibleChunks,
        scrollPosition: window.scrollY,
        activeConnections: context.connections,
        engineWeights: context.engineWeights,
        selection: window.getSelection()?.toString() ? {
          text: window.getSelection()!.toString(),
          chunkId: context.currentChunkId,
          startOffset: 0,
          endOffset: window.getSelection()!.toString().length
        } : undefined
      }

      await createSpark({
        content: content.trim(),
        context: sparkContext
      })

      // Reset and close
      setContent('')
      setOpen(false)

      // Show success feedback
      console.log('[Sparks] Created successfully')
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
              Context: {context.documentTitle} • {context.connections.length} connections
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

#### 2. Reader Context Hook
**File**: `src/hooks/useReaderContext.ts`
**Changes**: Provide reading context to SparkCapture

```typescript
'use client'

import { createContext, useContext } from 'react'

interface ReaderContext {
  documentId: string
  documentTitle: string
  currentChunkId: string
  visibleChunks: string[]
  connections: any[]
  engineWeights: {
    semantic: number
    contradiction: number
    bridge: number
  }
}

const ReaderContext = createContext<ReaderContext | null>(null)

export function ReaderContextProvider({
  value,
  children
}: {
  value: ReaderContext
  children: React.ReactNode
}) {
  return (
    <ReaderContext.Provider value={value}>
      {children}
    </ReaderContext.Provider>
  )
}

export function useReaderContext() {
  const context = useContext(ReaderContext)
  if (!context) {
    throw new Error('useReaderContext must be used within ReaderContextProvider')
  }
  return context
}
```

#### 3. Add to Reader Layout
**File**: `src/app/read/[id]/page.tsx`
**Changes**: Include SparkCapture in reader page

```typescript
// Add to imports
import { SparkCapture } from '@/components/sparks/SparkCapture'
import { ReaderContextProvider } from '@/hooks/useReaderContext'

// Build context from reader state (around line 50)
const readerContext = {
  documentId: document.id,
  documentTitle: document.title,
  currentChunkId: visibleChunks[0] || '',
  visibleChunks: visibleChunks,
  connections: activeConnections,
  engineWeights: userWeights
}

// Wrap return in context provider (around line 150)
return (
  <ReaderContextProvider value={readerContext}>
    <div className="reader-layout">
      {/* existing reader content */}
      <SparkCapture />
    </div>
  </ReaderContextProvider>
)
```

#### 4. Sparks Timeline Tab
**File**: `src/components/sidebar/SparksTab.tsx`
**Changes**: Timeline view in RightPanel

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

  useEffect(() => {
    loadSparks()
  }, [])

  const loadSparks = async () => {
    setLoading(true)
    try {
      const data = await getRecentSparks(50, 0)
      setSparks(data)
    } catch (error) {
      console.error('[Sparks] Failed to load:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return <div className="p-4 text-sm text-muted-foreground">Loading sparks...</div>
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

### Success Criteria:

#### Automated Verification:
- [ ] Components compile: `npm run build`
- [ ] No TypeScript errors: `npm run type-check`

#### Manual Verification:
- [ ] Cmd+K opens modal
- [ ] Auto-quotes selection
- [ ] Spark saves successfully
- [ ] Timeline displays sparks
- [ ] Tags and connections show

**Test Flow:**
1. Press Cmd+K in reader
2. Type content with #tags and /chunk_id
3. Save spark
4. Verify in RightPanel Sparks tab
5. Check Storage for JSON file

---

## Phase 6: Obsidian Integration

### Overview
Extend Obsidian sync to export sparks alongside documents. Manual export only (no bidirectional sync in v1).

### Changes Required:

#### 1. Extend Obsidian Handler
**File**: `worker/handlers/obsidian-sync.ts`
**Changes**: Add exportSparks function after line 412

```typescript
import matter from 'gray-matter'
import { promises as fs } from 'fs'

/**
 * Export sparks to Obsidian vault
 * Creates: document-name.sparks.md with YAML frontmatter
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
    return
  }

  if (!sparks || sparks.length === 0) {
    console.log(`[Obsidian] No sparks to export for ${documentId}`)
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
    console.log(`[Obsidian] Exported ${sparks.length} sparks to ${sparksPath}`)
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

### Success Criteria:

#### Automated Verification:
- [ ] Worker builds: `cd worker && npm run build`
- [ ] No TypeScript errors

#### Manual Verification:
- [ ] Sparks export to .sparks.md file
- [ ] YAML frontmatter correct
- [ ] Multiple sparks separated by ---
- [ ] Obsidian can read files

**Test Flow:**
1. Create 3 sparks for a document
2. Export to Obsidian via Admin Panel
3. Check vault for `document-name.sparks.md`
4. Verify YAML frontmatter
5. Open in Obsidian

---

## Phase 7: Search & Filters (Optional Enhancement)

### Overview
Add semantic search and tag filtering. Uses cache table for performance.

### Changes Required:

#### 1. Search UI Component
**File**: `src/components/sparks/SparkSearch.tsx`
**Changes**: Search input with tag filters

```typescript
'use client'

import { useState } from 'react'
import { Search, Tag, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { searchSparks } from '@/app/actions/sparks'

export function SparkSearch({
  onResults
}: {
  onResults: (sparks: any[]) => void
}) {
  const [query, setQuery] = useState('')
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [searching, setSearching] = useState(false)

  const handleSearch = async (searchQuery: string) => {
    if (!searchQuery.trim()) {
      onResults([])
      return
    }

    setSearching(true)
    try {
      const results = await searchSparks(searchQuery)
      onResults(results)
    } catch (error) {
      console.error('[Sparks] Search failed:', error)
    } finally {
      setSearching(false)
    }
  }

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            handleSearch(e.target.value)
          }}
          placeholder="Search sparks..."
          className="pl-9"
        />
      </div>

      {selectedTags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {selectedTags.map(tag => (
            <Badge
              key={tag}
              variant="secondary"
              className="cursor-pointer"
              onClick={() => setSelectedTags(prev => prev.filter(t => t !== tag))}
            >
              <Tag className="w-3 h-3 mr-1" />
              {tag}
              <X className="w-3 h-3 ml-1" />
            </Badge>
          ))}
        </div>
      )}
    </div>
  )
}
```

### Success Criteria:

#### Manual Verification:
- [ ] Search returns relevant sparks
- [ ] Tag filtering works
- [ ] Results update in real-time

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

    expect(connections).toContainEqual({
      chunkId: 'chunk_origin',
      type: 'origin',
      strength: 1.0
    })

    expect(connections).toContainEqual({
      chunkId: 'chunk_abc',
      type: 'mention',
      strength: 0.9
    })
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
    const component = await ecs.getComponent(result.sparkId, 'spark')
    expect(component.content).toBe('Test spark #test')
    expect(component.tags).toContain('test')
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
- [ ] Tags extracted correctly
- [ ] Chunk mentions resolved
- [ ] Connections inherited (0.7x weight)
- [ ] Storage JSON uploaded
- [ ] Cache updated
- [ ] Timeline shows spark
- [ ] Search finds spark
- [ ] Obsidian export works
- [ ] Cache rebuild from Storage
- [ ] Delete spark removes all traces

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

### Cache Rebuild
- 1000 sparks rebuild: ~30 seconds
- Embeddings generation: Rate limited by API (10 req/sec)
- Parallelizable: Batch 10 sparks at once

### Storage Costs
- 100 bytes per spark (compressed JSON)
- 10,000 sparks = 1 MB storage = $0.001/month
- Negligible cost

---

## Migration & Rollout Plan

### Phase 1: Foundation (Week 1)
- [ ] Implement Storage layer
- [ ] Create cache table migration
- [ ] Build connection helpers
- [ ] Write unit tests

### Phase 2: Core Features (Week 1)
- [ ] Implement server actions
- [ ] Create UI components
- [ ] Test end-to-end flow
- [ ] Deploy to staging

### Phase 3: Integration (Week 2)
- [ ] Add to reader layout
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

### If ECS Lost (entities/components tables)
```bash
# Restore from Storage
cd worker
npm run restore-ecs-from-storage -- --component-type=spark
```

### If Storage Lost
- **Critical**: This is source of truth
- Must restore from backup
- No automatic recovery

**Prevention**: Enable versioning on Supabase Storage bucket.

---

## References

### Existing Patterns
- **ECS Implementation**: `src/lib/ecs/ecs.ts` (lines 1-200)
- **Annotation Pattern**: `src/app/actions/annotations.ts` (lines 77-107)
- **Storage Helpers**: `worker/lib/storage-helpers.ts`
- **Obsidian Integration**: `worker/handlers/obsidian-sync.ts` (lines 352-412)

### Documentation
- **ECS Guide**: `docs/ECS_IMPLEMENTATION.md`
- **Storage Pattern**: `docs/STORAGE_PATTERNS.md`
- **Testing Rules**: `docs/testing/TESTING_RULES.md`

---

## Cost Summary

**Per Spark:**
- Storage: $0.001 (100 bytes)
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

1. **Data Integrity**: Zero data loss on cache rebuild
2. **Performance**: Timeline loads in <500ms for 1000 sparks
3. **User Experience**: Cmd+K to saved spark in <1 second
4. **Search Quality**: >70% relevant results
5. **Obsidian Export**: All sparks exportable with metadata

---

## Next Steps

1. Review this plan with developer
2. Start with Phase 1 (Storage layer)
3. Test each phase before proceeding
4. Deploy incrementally to production
5. Monitor performance and costs

**This is the ECS-native approach. No domain tables. Pure entities + components + Storage.**