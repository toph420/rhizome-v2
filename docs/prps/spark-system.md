# PRP: Spark System - Personal Knowledge Capture

**Feature**: Personal knowledge capture system with context preservation, semantic search, and Obsidian integration
**Status**: Ready for Implementation
**Complexity**: High
**Estimated Effort**: 5-7 days
**Confidence Score**: 8.5/10

---

## Executive Summary

The Spark System enables users to capture thoughts while reading, preserving the complete cognitive context (visible chunks, active connections, scroll position, engine weights) for later restoration. Sparks are lightweight entities (~500 chars) that inherit connections from their origin chunks, support semantic search, and sync bidirectionally with Obsidian vaults.

**Key Innovation**: Denormalized connection inheritance creates a snapshot of the user's cognitive state at capture time, enabling context restoration that recreates the exact reading experience.

**Architecture Pattern**: Hybrid storage (Storage for portability + PostgreSQL cache for queries) - identical to existing document pattern.

---

## Business Context

### Problem Statement

Users have insights while reading but lose the contextual web that sparked the thought:
- **Lost Context**: "What was I reading when I thought this?"
- **Broken Trails**: "Which connections led me here?"
- **Cognitive Gaps**: "What engine weights was I using?"

### Target User

Personal knowledge worker reading 10-20 documents/month, creating 5-10 sparks/week, seeking to:
- Capture thoughts without breaking reading flow (Cmd+K)
- Resurface related sparks while writing
- Export knowledge to Obsidian for long-term storage

### Success Metrics

- **Capture Speed**: <2 seconds from Cmd+K to save
- **Context Restoration**: 100% accurate scroll position + visible chunks
- **Search Relevance**: >70% precision for semantic spark search
- **Obsidian Sync**: Bidirectional sync with <5 second latency

---

## Technical Architecture

### Architecture Decisions Summary

Based on comprehensive codebase analysis and user clarifications:

| Decision | Chosen Approach | Rationale |
|----------|----------------|-----------|
| **ECS Integration** | Extend existing singleton at `src/lib/ecs/ecs.ts` | Proven pattern, no parallel systems |
| **Storage Strategy** | Hybrid: Storage (source) + PostgreSQL (cache) | Mirrors documents pattern exactly |
| **Connection Inheritance** | Denormalized snapshot at creation (0.7x weight) | Captures cognitive moment, fast queries |
| **Obsidian Integration** | Extend `worker/handlers/obsidian-sync.ts` | Reuse proven export/import infrastructure |
| **Timeline Performance** | Paginated (50 sparks/page) | Simple, <500ms query time |

### System Components

```
┌─────────────────────────────────────────────────────────┐
│                    Spark System                          │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  ┌──────────────┐      ┌──────────────┐                │
│  │  UI Layer    │      │  Storage     │                │
│  │              │      │  (Source)    │                │
│  │ - Cmd+K      │◄────►│              │                │
│  │ - Timeline   │      │ JSON Files   │                │
│  │ - Search     │      │ {userId}/    │                │
│  └──────────────┘      │  sparks/     │                │
│         │              │  {sparkId}/  │                │
│         │              │  content.json│                │
│         ▼              └──────────────┘                │
│  ┌──────────────┐              ▲                       │
│  │  ECS Layer   │              │                       │
│  │              │              │                       │
│  │ - Entities   │              │                       │
│  │ - Components │              │                       │
│  │   • spark    │              │                       │
│  │   • source   │              │                       │
│  └──────────────┘              │                       │
│         │                      │                       │
│         ▼                      │                       │
│  ┌──────────────┐      ┌──────────────┐               │
│  │  Cache Layer │      │  Obsidian    │               │
│  │              │      │  Vault Sync  │               │
│  │ - sparks     │◄────►│              │               │
│  │   table      │      │ YAML + MD    │               │
│  │ - connections│      │ Sparks/      │               │
│  │   (extended) │      │  YYYY-MM/    │               │
│  └──────────────┘      └──────────────┘               │
│         │                                              │
│         ▼                                              │
│  ┌──────────────┐                                     │
│  │  Search      │                                     │
│  │              │                                     │
│  │ - Embeddings │                                     │
│  │ - pgvector   │                                     │
│  │ - Tag search │                                     │
│  └──────────────┘                                     │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### Data Flow

**Spark Creation Flow**:
```
1. User presses Cmd+K while reading
2. Capture current context:
   - documentId, visibleChunks, scrollY
   - activeConnections (from 3-engine system)
   - engineWeights, navigationTrail
   - optional: selection text + offsets
3. Extract mentions (/, #) with fuzzy resolution
4. Generate 768d embedding (Gemini)
5. Create entity in ECS (spark + source components)
6. Upload JSON to Storage (source of truth)
7. Insert cache row in sparks table
8. Inherit connections from origin chunk (0.7x weight)
9. Export to Obsidian (if enabled)
```

**Context Restoration Flow**:
```
1. User clicks spark in timeline/search results
2. Load full JSON from Storage
3. Navigate to documentId
4. Scroll to exact scroll_position
5. Highlight visible_chunks
6. Load active_connections in sidebar
7. Restore engine_weights to reader state
8. Optional: highlight selection text
```

---

## Database Schema

### Migration 044: Extend Connections for Entity Support

**Current State** (migration 021):
```sql
-- Connections are chunk-to-chunk only
CREATE TABLE connections (
  source_chunk_id UUID NOT NULL REFERENCES chunks(id),
  target_chunk_id UUID NOT NULL REFERENCES chunks(id),
  -- ... other columns
);
```

**Required Changes**:
```sql
-- Migration 044: Add entity connection support
-- File: supabase/migrations/044_add_entity_connections.sql

-- 1. Make chunk_id columns nullable
ALTER TABLE connections
  ALTER COLUMN source_chunk_id DROP NOT NULL,
  ALTER COLUMN target_chunk_id DROP NOT NULL;

-- 2. Add entity_id columns
ALTER TABLE connections
  ADD COLUMN source_entity_id UUID REFERENCES entities(id) ON DELETE CASCADE,
  ADD COLUMN target_entity_id UUID REFERENCES entities(id) ON DELETE CASCADE;

-- 3. Add check constraints (exactly one source, one target)
ALTER TABLE connections
  ADD CONSTRAINT check_valid_source CHECK (
    (source_chunk_id IS NOT NULL AND source_entity_id IS NULL) OR
    (source_chunk_id IS NULL AND source_entity_id IS NOT NULL)
  ),
  ADD CONSTRAINT check_valid_target CHECK (
    (target_chunk_id IS NOT NULL AND target_entity_id IS NULL) OR
    (target_chunk_id IS NULL AND target_entity_id IS NOT NULL)
  );

-- 4. Extend connection_type enum
ALTER TABLE connections DROP CONSTRAINT connections_connection_type_check;
ALTER TABLE connections ADD CONSTRAINT connections_connection_type_check
  CHECK (connection_type IN (
    'semantic_similarity',
    'contradiction_detection',
    'thematic_bridge',
    'spark_origin',      -- Spark → origin chunk
    'spark_mention',     -- Spark → mentioned chunk
    'spark_inherited'    -- Spark → inherited from origin
  ));

-- 5. Add indexes for entity lookups
CREATE INDEX idx_connections_source_entity ON connections(source_entity_id)
  WHERE source_entity_id IS NOT NULL;
CREATE INDEX idx_connections_target_entity ON connections(target_entity_id)
  WHERE target_entity_id IS NOT NULL;

-- 6. Update comments
COMMENT ON COLUMN connections.source_entity_id IS 'Optional: source is an entity (spark, flashcard) instead of chunk';
COMMENT ON COLUMN connections.target_entity_id IS 'Optional: target is an entity instead of chunk';
COMMENT ON TABLE connections IS 'Connections between chunks and/or entities. Supports chunk-chunk, chunk-entity, entity-chunk relationships.';
```

### Migration 045: Sparks Cache Table

```sql
-- Migration 045: Sparks cache table
-- File: supabase/migrations/045_create_sparks_table.sql

CREATE TABLE sparks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Storage references (source of truth)
  storage_path TEXT NOT NULL, -- '{userId}/sparks/{sparkId}'
  json_path TEXT NOT NULL,    -- '{storage_path}/content.json'

  -- Cache columns for fast queries (rebuildable from Storage)
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ,

  -- Denormalized for queries
  origin_chunk_id UUID REFERENCES chunks(id) ON DELETE SET NULL,
  mentioned_chunk_ids UUID[] DEFAULT '{}',
  tags TEXT[] DEFAULT '{}',

  -- Search optimization
  embedding vector(768),

  -- Context snapshot (JSONB for flexibility)
  context JSONB NOT NULL, -- { documentId, visibleChunks, scrollPosition, engineWeights, navigationTrail }

  -- Metadata
  obsidian_synced_at TIMESTAMPTZ,

  CONSTRAINT sparks_unique_json_path UNIQUE (json_path)
);

-- Indexes for timeline and search
CREATE INDEX idx_sparks_user_created ON sparks(user_id, created_at DESC);
CREATE INDEX idx_sparks_origin_chunk ON sparks(origin_chunk_id) WHERE origin_chunk_id IS NOT NULL;
CREATE INDEX idx_sparks_tags ON sparks USING gin(tags);
CREATE INDEX idx_sparks_embedding ON sparks USING ivfflat(embedding vector_cosine_ops);

-- Full-text search on content
CREATE INDEX idx_sparks_content_fts ON sparks USING gin(to_tsvector('english', content));

-- Enable RLS
ALTER TABLE sparks ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view their own sparks"
  ON sparks FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can create their own sparks"
  ON sparks FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own sparks"
  ON sparks FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "Users can delete their own sparks"
  ON sparks FOR DELETE
  USING (user_id = auth.uid());

-- Comments
COMMENT ON TABLE sparks IS 'Queryable cache for spark entities. Source of truth is in Storage (json_path). Cache is rebuildable.';
COMMENT ON COLUMN sparks.context IS 'Snapshot of reading context: { documentId, visibleChunks, scrollPosition, activeConnections, engineWeights, navigationTrail }';
COMMENT ON COLUMN sparks.embedding IS '768-dimensional embedding for semantic search (Gemini text-embedding-004)';
```

---

## Implementation Blueprint

### Phase 1: Core Infrastructure (Days 1-2)

**1.1 Database Migrations**
```bash
# Create migrations
npx supabase migration new add_entity_connections
npx supabase migration new create_sparks_table

# Apply locally
npx supabase db reset
```

**1.2 Storage Helpers** (`src/lib/sparks/storage.ts`)
```typescript
import { createClient } from '@/lib/supabase/server'

interface SparkJson {
  entity_id: string
  content: string
  created_at: string
  updated_at?: string
  context: {
    documentId: string
    visibleChunks: string[]
    scrollPosition: number
    activeConnections: any[]
    engineWeights: { semantic: number; contradiction: number; bridge: number }
    navigationTrail: any[]
  }
  tags: string[]
  mentioned_chunks: string[]
  origin_chunk_id: string
  selection?: {
    text: string
    chunkId: string
    startOffset: number
    endOffset: number
  }
}

/**
 * Upload spark JSON to Storage (source of truth)
 */
export async function uploadSparkToStorage(
  userId: string,
  sparkId: string,
  sparkData: SparkJson
): Promise<string> {
  const supabase = createClient()

  const storagePath = `${userId}/sparks/${sparkId}`
  const jsonPath = `${storagePath}/content.json`

  const { error } = await supabase.storage
    .from('documents')
    .upload(jsonPath, JSON.stringify(sparkData, null, 2), {
      contentType: 'application/json',
      upsert: true
    })

  if (error) throw new Error(`Failed to upload spark: ${error.message}`)

  return jsonPath
}

/**
 * Download spark JSON from Storage
 */
export async function downloadSparkFromStorage(
  jsonPath: string
): Promise<SparkJson> {
  const supabase = createClient()

  const { data, error } = await supabase.storage
    .from('documents')
    .download(jsonPath)

  if (error) throw new Error(`Failed to download spark: ${error.message}`)

  const text = await data.text()
  return JSON.parse(text)
}

/**
 * Rebuild sparks cache from Storage (integrity check)
 */
export async function rebuildSparksCache(userId: string): Promise<void> {
  const supabase = createClient()

  console.log('[Sparks] Rebuilding cache from Storage...')

  // 1. List all spark files in Storage
  const { data: files, error: listError } = await supabase.storage
    .from('documents')
    .list(`${userId}/sparks`, { limit: 1000 })

  if (listError) throw new Error(`Failed to list sparks: ${listError.message}`)

  // 2. Delete existing cache entries
  await supabase.from('sparks').delete().eq('user_id', userId)

  // 3. Rebuild from Storage
  for (const folder of files) {
    const jsonPath = `${userId}/sparks/${folder.name}/content.json`

    try {
      const sparkData = await downloadSparkFromStorage(jsonPath)

      // Insert cache row
      await supabase.from('sparks').insert({
        id: sparkData.entity_id,
        user_id: userId,
        storage_path: `${userId}/sparks/${sparkData.entity_id}`,
        json_path: jsonPath,
        content: sparkData.content,
        created_at: sparkData.created_at,
        updated_at: sparkData.updated_at,
        origin_chunk_id: sparkData.origin_chunk_id,
        mentioned_chunk_ids: sparkData.mentioned_chunks,
        tags: sparkData.tags,
        context: sparkData.context,
        embedding: null // Will be regenerated if needed
      })

    } catch (error) {
      console.error(`[Sparks] Failed to rebuild ${folder.name}:`, error)
    }
  }

  console.log(`[Sparks] Cache rebuilt: ${files.length} sparks`)
}

/**
 * Verify cache integrity on app startup
 */
export async function verifySparksIntegrity(userId: string): Promise<boolean> {
  const supabase = createClient()

  // Count files in Storage
  const { data: files } = await supabase.storage
    .from('documents')
    .list(`${userId}/sparks`)

  const storageCount = files?.length || 0

  // Count rows in cache
  const { count: cacheCount } = await supabase
    .from('sparks')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)

  if (storageCount !== cacheCount) {
    console.warn(`[Sparks] Cache mismatch: ${storageCount} files, ${cacheCount} cache rows`)
    return false
  }

  return true
}
```

**1.3 ECS Extension** (`src/lib/ecs/ecs.ts` - extend existing)
```typescript
// Add spark component type to existing createEntity usage
// No code changes needed - ECS already supports arbitrary component types!

// Example usage:
const sparkEntityId = await ecs.createEntity(userId, {
  spark: {
    content: 'My thought about paranoia and technology...',
    created_at: new Date().toISOString(),
    tags: ['paranoia', 'technology']
  },
  source: {
    chunk_id: originChunkId,
    document_id: documentId
  }
})
```

### Phase 2: Spark Creation (Days 2-3)

**2.1 Mention Resolution** (`src/lib/sparks/mention-resolver.ts`)
```typescript
import Fuse from 'fuse.js'
import { createClient } from '@/lib/supabase/server'

interface MentionResolution {
  original: string
  resolved: string | null
  type: 'chunk' | 'document' | 'ambiguous' | 'unresolved'
  confidence: number
  candidates?: Array<{ id: string; title: string; score: number }>
}

/**
 * Resolve mention to chunk ID using fuzzy matching
 * Strategies:
 * 1. Exact chunk ID match
 * 2. Fuzzy document title match → first chunk
 * 3. Fuzzy chunk content match (expensive, last resort)
 */
export async function resolveMention(
  mention: string,
  userId: string
): Promise<MentionResolution> {
  const supabase = createClient()
  const normalized = mention.toLowerCase().trim()

  // Strategy 1: Exact chunk ID
  const { data: exactChunk } = await supabase
    .from('chunks')
    .select('id')
    .eq('id', normalized)
    .single()

  if (exactChunk) {
    return {
      original: mention,
      resolved: exactChunk.id,
      type: 'chunk',
      confidence: 1.0
    }
  }

  // Strategy 2: Fuzzy document title
  const { data: documents } = await supabase
    .from('documents')
    .select('id, title')
    .eq('user_id', userId)

  if (documents && documents.length > 0) {
    const fuse = new Fuse(documents, {
      keys: ['title'],
      threshold: 0.4, // Lower = stricter
      includeScore: true
    })

    const results = fuse.search(normalized)

    if (results.length > 0) {
      const topMatch = results[0]
      const confidence = 1 - (topMatch.score || 1)

      if (confidence > 0.85) {
        // High confidence - get first chunk
        const { data: firstChunk } = await supabase
          .from('chunks')
          .select('id')
          .eq('document_id', topMatch.item.id)
          .order('chunk_index', { ascending: true })
          .limit(1)
          .single()

        if (firstChunk) {
          return {
            original: mention,
            resolved: firstChunk.id,
            type: 'document',
            confidence
          }
        }
      }

      // Ambiguous
      if (results.length > 1) {
        return {
          original: mention,
          resolved: null,
          type: 'ambiguous',
          confidence,
          candidates: results.slice(0, 3).map(r => ({
            id: r.item.id,
            title: r.item.title,
            score: 1 - (r.score || 1)
          }))
        }
      }
    }
  }

  // Strategy 3: Fuzzy content match (expensive - only if mention is long)
  if (normalized.length >= 10) {
    const { data: chunks } = await supabase
      .from('chunks')
      .select('id, content')
      .textSearch('content', normalized)
      .limit(5)

    if (chunks && chunks.length > 0) {
      const fuse = new Fuse(chunks, {
        keys: ['content'],
        threshold: 0.3,
        includeScore: true
      })

      const results = fuse.search(normalized)

      if (results.length > 0) {
        const topMatch = results[0]
        const confidence = 1 - (topMatch.score || 1)

        if (confidence > 0.8) {
          return {
            original: mention,
            resolved: topMatch.item.id,
            type: 'chunk',
            confidence
          }
        }
      }
    }
  }

  // Unresolved
  return {
    original: mention,
    resolved: null,
    type: 'unresolved',
    confidence: 0
  }
}

/**
 * Extract and resolve all mentions from text
 */
export async function extractAndResolveMentions(
  content: string,
  userId: string
): Promise<{
  resolved: string[]
  unresolved: MentionResolution[]
  ambiguous: MentionResolution[]
}> {
  // Extract mentions: /chunk-id or /document-name
  const rawMentions = Array.from(
    content.matchAll(/\/([a-z0-9_\-\s]+)/gi),
    m => m[1].trim()
  )

  const resolutions = await Promise.all(
    rawMentions.map(m => resolveMention(m, userId))
  )

  return {
    resolved: resolutions
      .filter(r => r.resolved !== null)
      .map(r => r.resolved!),
    unresolved: resolutions.filter(r => r.type === 'unresolved'),
    ambiguous: resolutions.filter(r => r.type === 'ambiguous')
  }
}
```

**2.2 Server Action: Create Spark** (`src/app/actions/sparks.ts`)
```typescript
'use server'

import { revalidatePath } from 'next/cache'
import { embed } from 'ai'
import { google } from '@ai-sdk/google'
import { getCurrentUser, getSupabaseClient } from '@/lib/auth'
import { ecs } from '@/lib/ecs/ecs'
import { uploadSparkToStorage } from '@/lib/sparks/storage'
import { extractAndResolveMentions } from '@/lib/sparks/mention-resolver'

interface CreateSparkInput {
  content: string
  context: {
    documentId: string
    visibleChunks: string[]
    scrollY: number
    connections: any[]
    engineWeights: { semantic: number; contradiction: number; bridge: number }
    navigationTrail: any[]
    selection?: {
      text: string
      chunkId: string
      startOffset: number
      endOffset: number
    }
  }
}

export async function createSpark(input: CreateSparkInput) {
  const user = await getCurrentUser()
  if (!user) throw new Error('Unauthorized')

  const supabase = getSupabaseClient()

  // 1. Extract and resolve mentions
  const { resolved: mentionedChunks, unresolved, ambiguous } =
    await extractAndResolveMentions(input.content, user.id)

  if (unresolved.length > 0) {
    console.warn('[Spark] Unresolved mentions:', unresolved)
  }
  if (ambiguous.length > 0) {
    console.warn('[Spark] Ambiguous mentions:', ambiguous)
  }

  // 2. Extract tags
  const tags = Array.from(
    input.content.matchAll(/#([a-z0-9_-]+)/gi),
    m => m[1].toLowerCase()
  )

  // 3. Generate embedding for semantic search
  const { embedding } = await embed({
    model: google.textEmbeddingModel('text-embedding-004', {
      outputDimensionality: 768
    }),
    value: input.content
  })

  // 4. Create entity in ECS
  const sparkEntityId = await ecs.createEntity(user.id, {
    spark: {
      content: input.content,
      created_at: new Date().toISOString(),
      tags
    },
    source: {
      chunk_id: input.context.visibleChunks[0] || null,
      document_id: input.context.documentId
    }
  })

  // 5. Build spark JSON for Storage
  const sparkJson = {
    entity_id: sparkEntityId,
    content: input.content,
    created_at: new Date().toISOString(),
    context: input.context,
    tags,
    mentioned_chunks: mentionedChunks,
    origin_chunk_id: input.context.visibleChunks[0] || '',
    selection: input.context.selection
  }

  // 6. Upload to Storage (source of truth)
  const jsonPath = await uploadSparkToStorage(user.id, sparkEntityId, sparkJson)

  // 7. Insert cache row
  const { error: cacheError } = await supabase.from('sparks').insert({
    id: sparkEntityId,
    user_id: user.id,
    storage_path: `${user.id}/sparks/${sparkEntityId}`,
    json_path: jsonPath,
    content: input.content,
    created_at: sparkJson.created_at,
    origin_chunk_id: sparkJson.origin_chunk_id,
    mentioned_chunk_ids: mentionedChunks,
    tags,
    context: input.context,
    embedding
  })

  if (cacheError) throw new Error(`Failed to cache spark: ${cacheError.message}`)

  // 8. Inherit connections from origin chunk
  await inheritChunkConnections(sparkEntityId, sparkJson.origin_chunk_id, user.id)

  // 9. Create explicit mention connections
  for (const chunkId of mentionedChunks) {
    await supabase.from('connections').insert({
      source_entity_id: sparkEntityId,
      target_chunk_id: chunkId,
      connection_type: 'spark_mention',
      strength: 0.9,
      auto_detected: false,
      metadata: {
        mentioned_in_content: true,
        relationship: 'explicit_mention'
      }
    })
  }

  // 10. Export to Obsidian (if enabled)
  const { data: settings } = await supabase
    .from('user_settings')
    .select('obsidian_settings')
    .eq('user_id', user.id)
    .single()

  if (settings?.obsidian_settings?.autoSync) {
    // Queue background job for Obsidian export
    // TODO: Implement in Phase 3
  }

  revalidatePath('/sparks')

  return { success: true, sparkId: sparkEntityId }
}

/**
 * Inherit connections from origin chunk (denormalized snapshot)
 */
async function inheritChunkConnections(
  sparkEntityId: string,
  originChunkId: string,
  userId: string
): Promise<void> {
  const supabase = getSupabaseClient()

  // 1. Direct connection: Origin chunk → Spark
  await supabase.from('connections').insert({
    source_chunk_id: originChunkId,
    target_entity_id: sparkEntityId,
    connection_type: 'spark_origin',
    strength: 1.0,
    auto_detected: false,
    metadata: {
      relationship: 'origin',
      created_at: new Date().toISOString()
    }
  })

  // 2. Inherit origin chunk's connections (0.7x weight reduction)
  const { data: originConnections } = await supabase
    .from('connections')
    .select('*')
    .eq('source_chunk_id', originChunkId)
    .gte('strength', 0.6) // Only inherit strong connections

  if (originConnections && originConnections.length > 0) {
    const inheritedConnections = originConnections.map(conn => ({
      source_entity_id: sparkEntityId,
      target_chunk_id: conn.target_chunk_id,
      connection_type: 'spark_inherited',
      strength: conn.strength * 0.7, // Reduce weight
      auto_detected: true,
      metadata: {
        inherited_from: originChunkId,
        original_strength: conn.strength,
        original_connection_id: conn.id,
        inheritance_reason: 'spark_elaborates_origin_chunk'
      }
    }))

    await supabase.from('connections').insert(inheritedConnections)
  }
}
```

### Phase 3: UI Components (Days 3-4)

**3.1 Spark Capture Modal** (`src/components/sparks/SparkCapture.tsx`)
```typescript
'use client'

import { useState, useEffect } from 'react'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Zap } from 'lucide-react'
import { createSpark } from '@/app/actions/sparks'
import { useReaderContext } from '@/hooks/useReaderContext'

export function SparkCapture() {
  const [open, setOpen] = useState(false)
  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(false)
  const context = useReaderContext() // Gets current reading state

  // Cmd+K hotkey
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setOpen(true)

        // Auto-quote selection if exists
        const selection = window.getSelection()
        const selectedText = selection?.toString()
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
      const selection = window.getSelection()
      const selectedText = selection?.toString()

      await createSpark({
        content,
        context: {
          ...context,
          selection: selectedText ? {
            text: selectedText,
            chunkId: context.currentChunkId,
            startOffset: context.selectionStart,
            endOffset: context.selectionEnd
          } : undefined
        }
      })

      setContent('')
      setOpen(false)
    } catch (error) {
      console.error('Failed to create spark:', error)
      alert('Failed to create spark. Please try again.')
    } finally {
      setLoading(false)
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
          <h2 className="text-lg font-semibold">Capture Spark</h2>
          <kbd className="ml-auto text-xs text-muted-foreground">Cmd+K</kbd>
        </div>

        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Capture your thought... Use / to link chunks, # for tags"
          className="w-full min-h-[120px] p-3 border rounded-md resize-none focus:outline-none focus:ring-2 focus:ring-yellow-500"
          autoFocus
          disabled={loading}
        />

        <div className="text-sm text-muted-foreground space-y-1">
          <div>
            Context: {context.documentTitle} - {context.currentChunkIndex}/{context.totalChunks}
            {context.connections.length > 0 && ` • ${context.connections.length} connections`}
          </div>

          <div className="flex gap-4 text-xs">
            <span><kbd>/</kbd> link chunk</span>
            <span><kbd>#</kbd> tag</span>
            <span><kbd>Cmd+Enter</kbd> save</span>
          </div>
        </div>

        <div className="flex gap-2 justify-end">
          <button
            onClick={() => setOpen(false)}
            className="px-4 py-2 text-sm rounded hover:bg-gray-100"
            disabled={loading}
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            className="px-4 py-2 text-sm bg-yellow-500 text-white rounded hover:bg-yellow-600 disabled:opacity-50"
            disabled={loading || !content.trim()}
          >
            {loading ? 'Saving...' : 'Save Spark'}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
```

**3.2 Spark Timeline** (`src/components/sparks/SparkTimeline.tsx`)
```typescript
'use client'

import { useState, useEffect } from 'react'
import { Zap } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { getSupabaseClient } from '@/lib/supabase/client'

interface Spark {
  id: string
  content: string
  created_at: string
  tags: string[]
  origin_chunk_id: string
}

export function SparkTimeline() {
  const [sparks, setSparks] = useState<Spark[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(0)
  const LIMIT = 50

  useEffect(() => {
    loadSparks()
  }, [page])

  const loadSparks = async () => {
    setLoading(true)
    const supabase = getSupabaseClient()

    const { data, error } = await supabase
      .from('sparks')
      .select('id, content, created_at, tags, origin_chunk_id')
      .order('created_at', { ascending: false })
      .range(page * LIMIT, (page + 1) * LIMIT - 1)

    if (error) {
      console.error('Failed to load sparks:', error)
    } else {
      setSparks(data || [])
    }

    setLoading(false)
  }

  const handleRestore = async (sparkId: string) => {
    // TODO: Implement context restoration
    console.log('Restore context for:', sparkId)
  }

  if (loading && sparks.length === 0) {
    return <div className="p-8 text-center">Loading sparks...</div>
  }

  // Group by date
  const groupedSparks = sparks.reduce((acc, spark) => {
    const date = new Date(spark.created_at).toLocaleDateString()
    if (!acc[date]) acc[date] = []
    acc[date].push(spark)
    return acc
  }, {} as Record<string, Spark[]>)

  return (
    <div className="max-w-4xl mx-auto p-8">
      <div className="flex items-center gap-3 mb-8">
        <Zap className="w-6 h-6 text-yellow-500" />
        <h1 className="text-2xl font-bold">Your Sparks</h1>
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
                  key={spark.id}
                  className="border rounded-lg p-4 hover:border-yellow-500 transition-colors cursor-pointer"
                  onClick={() => handleRestore(spark.id)}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Zap className="w-4 h-4 text-yellow-500" />
                      <span className="text-sm text-muted-foreground">
                        {formatDistanceToNow(new Date(spark.created_at), { addSuffix: true })}
                      </span>
                    </div>
                  </div>

                  <p className="text-sm mb-3 line-clamp-3">{spark.content}</p>

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
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Pagination */}
      <div className="mt-8 flex justify-center gap-4">
        <button
          onClick={() => setPage(p => Math.max(0, p - 1))}
          disabled={page === 0}
          className="px-4 py-2 border rounded disabled:opacity-50"
        >
          Previous
        </button>
        <span className="px-4 py-2">Page {page + 1}</span>
        <button
          onClick={() => setPage(p => p + 1)}
          disabled={sparks.length < LIMIT}
          className="px-4 py-2 border rounded disabled:opacity-50"
        >
          Next
        </button>
      </div>
    </div>
  )
}
```

### Phase 4: Obsidian Integration (Day 5)

**4.1 Extend Obsidian Sync Handler** (`worker/handlers/obsidian-sync.ts`)
```typescript
// Add to existing file

import matter from 'gray-matter'
import { downloadSparkFromStorage, uploadSparkToStorage } from '../lib/spark-storage.js'

/**
 * Export all sparks to Obsidian vault
 */
export async function exportSparksToObsidian(userId: string): Promise<void> {
  const supabase = getSupabaseClient()

  // Get sparks
  const { data: sparks, error } = await supabase
    .from('sparks')
    .select('*')
    .eq('user_id', userId)

  if (error || !sparks) {
    throw new Error(`Failed to fetch sparks: ${error?.message}`)
  }

  // Get Obsidian settings
  const { data: settings, error: settingsError } = await supabase
    .from('user_settings')
    .select('obsidian_settings')
    .eq('user_id', userId)
    .single()

  if (settingsError || !settings?.obsidian_settings) {
    throw new Error('Obsidian settings not configured')
  }

  const obsidianSettings = settings.obsidian_settings as ObsidianSettings

  // Export each spark
  for (const spark of sparks) {
    await exportSparkToObsidian(spark, userId, obsidianSettings)
  }

  console.log(`[Obsidian] Exported ${sparks.length} sparks`)
}

/**
 * Export single spark to Obsidian vault
 */
async function exportSparkToObsidian(
  spark: any,
  userId: string,
  settings: ObsidianSettings
): Promise<void> {
  // Download full JSON from Storage
  const sparkData = await downloadSparkFromStorage(spark.json_path)

  // Build frontmatter
  const frontmatter = {
    id: spark.id,
    created: spark.created_at,
    updated: spark.updated_at || null,
    tags: spark.tags || [],
    origin_chunk: spark.origin_chunk_id,
    origin_doc: sparkData.context.documentId
  }

  // Build markdown content
  let content = spark.content

  // Add context section if there are connections
  if (sparkData.context.activeConnections?.length > 0) {
    content += '\n\n## Context\n\n'
    content += `Reading at ${Math.round(sparkData.context.scrollPosition * 100)}% when captured.\n\n`
    content += `Active connections (${sparkData.context.activeConnections.length}):\n`

    for (const conn of sparkData.context.activeConnections) {
      content += `- ${conn.type} → strength ${Math.round(conn.strength * 100)}%\n`
    }
  }

  // Combine frontmatter + content
  const markdown = matter.stringify(content, frontmatter)

  // Determine vault path: Sparks/YYYY-MM/spark_id.md
  const yearMonth = new Date(spark.created_at).toISOString().slice(0, 7)
  const vaultPath = path.join(
    settings.vaultPath,
    'Sparks',
    yearMonth,
    `${spark.id}.md`
  )

  // Create directory if needed
  await fs.mkdir(path.dirname(vaultPath), { recursive: true })

  // Write to vault
  await fs.writeFile(vaultPath, markdown, 'utf-8')

  console.log(`[Obsidian] Exported spark to ${vaultPath}`)
}
```

**4.2 Storage Helper for Worker** (`worker/lib/spark-storage.ts`)
```typescript
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function downloadSparkFromStorage(jsonPath: string): Promise<any> {
  const { data, error } = await supabase.storage
    .from('documents')
    .download(jsonPath)

  if (error) throw new Error(`Failed to download spark: ${error.message}`)

  const text = await data.text()
  return JSON.parse(text)
}

export async function uploadSparkToStorage(
  userId: string,
  sparkId: string,
  sparkData: any
): Promise<string> {
  const jsonPath = `${userId}/sparks/${sparkId}/content.json`

  const { error } = await supabase.storage
    .from('documents')
    .upload(jsonPath, JSON.stringify(sparkData, null, 2), {
      contentType: 'application/json',
      upsert: true
    })

  if (error) throw new Error(`Failed to upload spark: ${error.message}`)

  return jsonPath
}
```

### Phase 5: Writing Mode Integration (Day 6)

**5.1 Writing Suggestions Hook** (`src/hooks/useWritingModeSuggestions.ts`)
```typescript
'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { useDebouncedCallback } from 'use-debounce'

interface WritingSuggestion {
  sparkId: string
  content: string
  relevance: number
  reason: string
  tags: string[]
  created_at: string
}

export function useWritingModeSuggestions(
  draftContent: string,
  options: {
    threshold?: number
    limit?: number
    debounceMs?: number
  } = {}
) {
  const threshold = options.threshold || 0.75
  const limit = options.limit || 5
  const debounceMs = options.debounceMs || 1000

  const [suggestions, setSuggestions] = useState<WritingSuggestion[]>([])
  const [loading, setLoading] = useState(false)
  const abortControllerRef = useRef<AbortController | null>(null)

  const searchSparks = useCallback(async (content: string) => {
    if (content.length < 50) {
      setSuggestions([])
      return
    }

    // Cancel previous request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }

    abortControllerRef.current = new AbortController()
    setLoading(true)

    try {
      // Generate embedding for draft content
      const res = await fetch('/api/sparks/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: content,
          threshold,
          limit,
          mode: 'writing'
        }),
        signal: abortControllerRef.current.signal
      })

      if (!res.ok) throw new Error('Search failed')

      const { results } = await res.json()
      setSuggestions(results)
    } catch (error) {
      if (error.name !== 'AbortError') {
        console.error('Writing suggestions failed:', error)
      }
    } finally {
      setLoading(false)
    }
  }, [threshold, limit])

  // Debounced search
  const debouncedSearch = useDebouncedCallback(searchSparks, debounceMs)

  useEffect(() => {
    debouncedSearch(draftContent)
  }, [draftContent, debouncedSearch])

  return { suggestions, loading }
}
```

**5.2 Search API Route** (`src/app/api/sparks/search/route.ts`)
```typescript
import { NextRequest, NextResponse } from 'next/server'
import { embed } from 'ai'
import { google } from '@ai-sdk/google'
import { getCurrentUser, getSupabaseClient } from '@/lib/auth'

export async function POST(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { query, threshold, limit, mode } = await req.json()

  // Different thresholds for different modes
  const effectiveThreshold = mode === 'writing'
    ? threshold || 0.75  // Higher for writing (more selective)
    : threshold || 0.7

  const effectiveLimit = mode === 'writing'
    ? limit || 5
    : limit || 20

  // Generate query embedding
  const { embedding } = await embed({
    model: google.textEmbeddingModel('text-embedding-004', {
      outputDimensionality: 768
    }),
    value: query
  })

  const supabase = getSupabaseClient()

  // Vector search
  const { data: results, error } = await supabase.rpc('match_sparks', {
    query_embedding: embedding,
    match_threshold: effectiveThreshold,
    match_count: effectiveLimit,
    filter_user_id: user.id
  })

  if (error) {
    return NextResponse.json({ error: 'Search failed' }, { status: 500 })
  }

  return NextResponse.json({ results })
}
```

**5.3 Vector Search Function** (Add to migration 045)
```sql
-- Vector search function for sparks
CREATE OR REPLACE FUNCTION match_sparks(
  query_embedding vector(768),
  match_threshold float,
  match_count int,
  filter_user_id uuid
)
RETURNS TABLE (
  spark_id uuid,
  content text,
  similarity float,
  tags text[],
  created_at timestamptz
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    sparks.id as spark_id,
    sparks.content,
    1 - (sparks.embedding <=> query_embedding) as similarity,
    sparks.tags,
    sparks.created_at
  FROM sparks
  WHERE
    sparks.user_id = filter_user_id
    AND sparks.embedding IS NOT NULL
    AND 1 - (sparks.embedding <=> query_embedding) > match_threshold
  ORDER BY sparks.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
```

### Phase 6: Polish & Testing (Day 7)

**6.1 Cache Integrity Check on Startup**
```typescript
// Add to src/app/layout.tsx or initialization hook

import { verifySparksIntegrity, rebuildSparksCache } from '@/lib/sparks/storage'
import { getCurrentUser } from '@/lib/auth'

export async function initializeSparks() {
  const user = await getCurrentUser()
  if (!user) return

  const isValid = await verifySparksIntegrity(user.id)

  if (!isValid) {
    console.log('[Sparks] Cache integrity check failed - rebuilding...')
    await rebuildSparksCache(user.id)
  }
}
```

**6.2 Export Functionality** (`src/app/actions/sparks.ts`)
```typescript
'use server'

import JSZip from 'jszip'
import { getCurrentUser, getSupabaseClient } from '@/lib/auth'

/**
 * Export all sparks as ZIP bundle
 */
export async function exportSparksZip() {
  const user = await getCurrentUser()
  if (!user) throw new Error('Unauthorized')

  const supabase = getSupabaseClient()

  // List all spark files
  const { data: files, error } = await supabase.storage
    .from('documents')
    .list(`${user.id}/sparks`)

  if (error) throw new Error(`Failed to list sparks: ${error.message}`)

  const zip = new JSZip()

  // Download each spark JSON
  for (const folder of files) {
    const jsonPath = `${user.id}/sparks/${folder.name}/content.json`

    const { data, error: downloadError } = await supabase.storage
      .from('documents')
      .download(jsonPath)

    if (downloadError) continue

    const text = await data.text()
    zip.file(`${folder.name}.json`, text)
  }

  // Generate ZIP
  const blob = await zip.generateAsync({ type: 'blob' })

  return {
    success: true,
    blob,
    filename: `sparks-export-${new Date().toISOString().split('T')[0]}.zip`
  }
}
```

---

## Testing Strategy

### Unit Tests

**Test: Mention Resolution** (`src/lib/sparks/__tests__/mention-resolver.test.ts`)
```typescript
import { resolveMention } from '../mention-resolver'

describe('Mention Resolution', () => {
  it('should resolve exact chunk ID', async () => {
    const result = await resolveMention('chunk-abc-123', 'user-id')
    expect(result.type).toBe('chunk')
    expect(result.confidence).toBe(1.0)
  })

  it('should fuzzy match document title', async () => {
    const result = await resolveMention('gravity rainbow', 'user-id')
    expect(result.type).toBe('document')
    expect(result.confidence).toBeGreaterThan(0.85)
  })

  it('should handle ambiguous mentions', async () => {
    const result = await resolveMention('the', 'user-id')
    expect(result.type).toBe('ambiguous')
    expect(result.candidates).toBeDefined()
  })
})
```

**Test: Connection Inheritance** (`src/app/actions/__tests__/sparks.test.ts`)
```typescript
import { createSpark } from '../sparks'

describe('Connection Inheritance', () => {
  it('should inherit connections with 0.7x weight', async () => {
    const spark = await createSpark({
      content: 'Test spark',
      context: {
        documentId: 'doc-1',
        visibleChunks: ['chunk-1'],
        scrollY: 0.5,
        connections: [],
        engineWeights: { semantic: 0.25, contradiction: 0.4, bridge: 0.35 },
        navigationTrail: []
      }
    })

    // Verify inherited connections exist with reduced weight
    const connections = await getConnections(spark.sparkId)
    const inherited = connections.filter(c => c.connection_type === 'spark_inherited')

    expect(inherited.length).toBeGreaterThan(0)
    expect(inherited[0].strength).toBeLessThan(0.7) // Original was ~0.8-1.0
  })
})
```

### Integration Tests

**Test: End-to-End Spark Creation**
```typescript
describe('Spark Creation Flow', () => {
  it('should create spark with full context', async () => {
    // 1. Create spark
    const result = await createSpark({
      content: 'Paranoia in /gravity-rainbow connects to #technology',
      context: mockContext
    })

    expect(result.success).toBe(true)

    // 2. Verify Storage upload
    const json = await downloadSparkFromStorage(`user-id/sparks/${result.sparkId}/content.json`)
    expect(json.content).toContain('Paranoia')

    // 3. Verify cache row
    const cached = await supabase.from('sparks').select('*').eq('id', result.sparkId).single()
    expect(cached.data.tags).toContain('technology')

    // 4. Verify connections
    const connections = await getConnections(result.sparkId)
    expect(connections.length).toBeGreaterThan(0)
  })
})
```

### Validation Commands

```bash
# Run all tests
npm test

# Worker tests
cd worker && npm test

# Type checking
npx tsc --noEmit

# Linting
npm run lint

# Database migration validation
npx supabase db reset
npx supabase migration list

# Integration validation
npm run test:integration
```

---

## Deployment Plan

### Pre-Deployment Checklist

- [ ] All migrations tested locally (`npx supabase db reset`)
- [ ] Unit tests passing (`npm test`)
- [ ] Integration tests passing
- [ ] Type checking clean (`npx tsc --noEmit`)
- [ ] Linting clean (`npm run lint`)
- [ ] Cache integrity check implemented
- [ ] Obsidian sync tested with real vault
- [ ] Export functionality tested

### Deployment Steps

1. **Deploy Database Migrations**
   ```bash
   # Production migration
   npx supabase db push
   ```

2. **Deploy Application Code**
   ```bash
   # Deploy via Vercel/hosting platform
   git push origin main
   ```

3. **Post-Deployment Verification**
   - Create test spark via Cmd+K
   - Verify timeline display
   - Test search functionality
   - Verify Obsidian export
   - Check cache integrity

4. **Monitoring**
   - Watch error logs for storage upload failures
   - Monitor embedding generation latency
   - Check connection inheritance accuracy

---

## Performance Considerations

### Expected Performance

| Operation | Target | Notes |
|-----------|--------|-------|
| Spark Creation | <2s | Including embedding generation |
| Timeline Load | <500ms | 50 sparks/page, cached query |
| Search | <1s | pgvector similarity search |
| Context Restoration | <1s | Load from Storage + navigate |
| Obsidian Export | <5s | Per spark, background job |

### Optimization Strategies

**Embedding Generation**:
- Batch embed multiple sparks if creating in quick succession
- Cache embeddings in sparks table for fast search

**Connection Queries**:
- Index on source_entity_id and target_entity_id
- Filter connections by strength >0.6 to reduce noise

**Timeline Pagination**:
- Index on (user_id, created_at DESC)
- Use range queries for efficient pagination

**Storage Access**:
- Lazy load full JSON only when restoring context
- Timeline uses cached content from sparks table

---

## Dependencies

### New NPM Packages

```json
{
  "dependencies": {
    "fuse.js": "^7.0.0",      // Fuzzy matching for mentions
    "gray-matter": "^4.0.3",   // YAML frontmatter parsing (may already exist)
    "use-debounce": "^10.0.0", // Debounced search in writing mode
    "jszip": "^3.10.1"         // Spark export as ZIP
  }
}
```

### Installation

```bash
npm install fuse.js gray-matter use-debounce jszip
```

---

## Risks & Mitigations

### Risk: Cache-Storage Desync

**Scenario**: sparks table cache becomes stale/corrupted
**Impact**: Search returns incorrect results, timeline missing sparks
**Mitigation**:
- Implement `verifySparksIntegrity()` on app startup
- Auto-rebuild cache if mismatch detected
- Storage is source of truth - always rebuildable

**Code**:
```typescript
// Run on startup
const isValid = await verifySparksIntegrity(userId)
if (!isValid) {
  await rebuildSparksCache(userId)
}
```

### Risk: Connection Inheritance Explosion

**Scenario**: Origin chunk has 100+ connections → spark inherits all
**Impact**: connections table bloats, queries slow down
**Mitigation**:
- Filter: only inherit connections with strength ≥0.6
- Limit: cap inherited connections at 50 per spark
- Reduce weight by 0.7x to naturally deprioritize weak connections

**Code**:
```typescript
const { data: originConnections } = await supabase
  .from('connections')
  .select('*')
  .eq('source_chunk_id', originChunkId)
  .gte('strength', 0.6)
  .order('strength', { ascending: false })
  .limit(50) // Cap at 50
```

### Risk: Obsidian Sync Conflicts

**Scenario**: User edits spark in both Rhizome and Obsidian simultaneously
**Impact**: Last write wins, potential data loss
**Mitigation**:
- File watching with debounce (5s)
- Timestamp-based conflict detection
- Phase 1: Manual sync only (user-initiated)
- Phase 2+: Add conflict resolution UI

**Deferred**: Bidirectional auto-sync deferred to Phase 2+

---

## Future Enhancements (Out of Scope)

### Auto-Threading
- Cluster sparks by 30-minute windows + shared tags
- AI analysis for coherence detection
- User review before creating threads
- **Status**: Build logic, disable by default (env flag)

### Writing Mode Insertion
- Insert spark content at cursor position
- Attribution: "— Spark from {date}"
- **Status**: Implement in Phase 5

### Advanced Search
- Combined vector + keyword search
- Filter by date range, tags, origin document
- Search within spark threads
- **Status**: Future enhancement

---

## Success Criteria

### Phase 1 (Core Infrastructure)
- ✅ Database migrations applied without errors
- ✅ Storage upload/download working
- ✅ Cache integrity check functional

### Phase 2 (Spark Creation)
- ✅ Cmd+K captures spark with context
- ✅ Mentions resolved with >80% accuracy
- ✅ Connections inherited with correct weights

### Phase 3 (UI)
- ✅ Timeline displays 50 sparks in <500ms
- ✅ Search returns relevant sparks (>70% precision)
- ✅ Context restoration works accurately

### Phase 4 (Obsidian)
- ✅ Sparks export to vault with YAML frontmatter
- ✅ Vault folder structure: Sparks/YYYY-MM/*.md

### Phase 5 (Writing Mode)
- ✅ Suggestions appear as user types
- ✅ Relevance scoring >75% threshold
- ✅ Insert functionality works

---

## Confidence Score: 8.5/10

**Strengths**:
- Clear architecture aligned with existing patterns
- Hybrid storage matches proven document pattern
- Connection system extends cleanly
- All implementation patterns exist in codebase

**Deductions**:
- -1.0: Connection migration adds complexity (nullable columns + constraints)
- -0.5: New dependency (Fuse.js) requires testing

**One-Pass Implementation Success Probability**: 85%

**Recommended Approach**: Implement phases sequentially. Test cache rebuild after Phase 1. Validate connection inheritance thoroughly in Phase 2 before proceeding.

---

## Appendix: Code Reference Map

| Component | File Path | Purpose |
|-----------|-----------|---------|
| **ECS Singleton** | `src/lib/ecs/ecs.ts` | Entity-Component-System core |
| **Document Storage** | `src/app/actions/documents.ts:126-248` | Storage upload pattern |
| **Obsidian Sync** | `worker/handlers/obsidian-sync.ts` | Export/import infrastructure |
| **Connections Schema** | `supabase/migrations/021_convert_connections_to_chunk_based.sql` | Connection table structure |
| **Auth Pattern** | `src/lib/auth/index.ts` | User authentication |
| **Server Actions** | `src/app/actions/` | Mutation pattern |
| **UI Components** | `src/components/ui/` | shadcn/ui library |

---

**END OF PRP**
