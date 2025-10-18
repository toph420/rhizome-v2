# Spark System Implementation Plan

## Overview
Implement personal knowledge capture system (Sparks) with context preservation, semantic search, and Obsidian integration. Sparks are lightweight entities (~500 chars) that inherit connections from origin chunks and support bidirectional Obsidian sync.

## Current State Analysis
Based on comprehensive codebase research, we have:
- **ECS system** ready to support spark components without modification (`src/lib/ecs/ecs.ts`)
- **Annotation pattern** to follow for entity creation flow (`src/app/actions/annotations.ts`)
- **Storage-first pattern** established for portability (`worker/lib/storage-helpers.ts`)
- **Obsidian integration** ready to extend (`worker/handlers/obsidian-sync.ts:352-412`)
- **Connection system** needs extension for entity support (currently chunk-only)

### Key Discoveries:
- ECS supports arbitrary component types - just use `{ spark: {...} }` pattern (`src/lib/ecs/ecs.ts:36-76`)
- Annotations follow 3-component pattern we can replicate (`src/app/actions/annotations.ts:77-107`)
- Storage helpers handle JSON export/import seamlessly (`worker/lib/storage-helpers.ts`)
- Obsidian export pattern at `worker/handlers/obsidian-sync.ts:352-412` easily extensible
- Connection table needs nullable chunk columns + entity support (`supabase/migrations/021_convert_connections_to_chunk_based.sql`)

## Desired End State
Users can:
1. Press Cmd+K to capture sparks while reading
2. See spark timeline with 50 sparks/page load in <500ms
3. Search sparks semantically with >70% precision
4. Restore exact reading context when clicking a spark
5. Export sparks to Obsidian vault as YAML+markdown files
6. View spark connections inherited from origin chunks

## Rhizome Architecture
- **Module**: Both (Main App UI + Worker for processing/export)
- **Storage**: Both - Hybrid (Storage = source of truth, Database = queryable cache)
- **Migration**: Yes (053 for connections, 054 for sparks table)
- **Test Tier**: Critical (user data, core feature)
- **Pipeline Stages**: N/A (sparks created outside pipeline)
- **Engines**: Extends connection system for entity support

## What We're NOT Doing
- Auto-threading of sparks (deferred to v2)
- Writing mode insertion UI (phase 2)
- Advanced search filters (future enhancement)
- Bidirectional Obsidian sync (manual export only in v1)
- Spark-to-spark connections (only spark-to-chunk initially)

## Implementation Approach
Follow proven patterns from annotations and documents:
1. Extend connections table for entity support (nullable chunk columns)
2. Create sparks cache table following document pattern
3. Use ECS for spark entities (no ECS changes needed)
4. Implement Storage-first with JSON exports
5. Extend Obsidian handler for spark export
6. Create UI components following annotation patterns

## Phase 1: Database Infrastructure

### Overview
Extend connections table for entity support and create sparks cache table.

### Changes Required:

#### 1. Connection Extension Migration
**File**: `supabase/migrations/053_add_entity_connections.sql`
**Changes**: Make chunk columns nullable, add entity columns

```sql
-- Migration 053: Add entity connection support
-- Extends connections table to support entity-chunk relationships

-- 1. Make chunk_id columns nullable (backward compatible)
ALTER TABLE connections
  ALTER COLUMN source_chunk_id DROP NOT NULL,
  ALTER COLUMN target_chunk_id DROP NOT NULL;

-- 2. Add entity_id columns for polymorphic support
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

-- 4. Extend connection_type enum for spark types
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
```

#### 2. Sparks Cache Table Migration
**File**: `supabase/migrations/054_create_sparks_table.sql`
**Changes**: Create sparks table for queryable cache

```sql
-- Migration 054: Sparks cache table
-- Queryable cache for spark entities. Source of truth is in Storage.

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
COMMENT ON TABLE sparks IS 'Queryable cache for spark entities. Source of truth is in Storage (json_path).';
COMMENT ON COLUMN sparks.context IS 'Snapshot of reading context when spark was captured';
```

### Success Criteria:

#### Automated Verification:
- [ ] Migrations apply: `npx supabase db reset`
- [ ] No constraint violations on existing data
- [ ] Indexes created successfully
- [ ] RLS policies in place

#### Manual Verification:
- [ ] Can insert entity connections
- [ ] Can query sparks by user
- [ ] Full-text search works

**Implementation Note**: Run migrations and verify constraints before proceeding to Phase 2.

### Service Restarts:
- [x] Supabase: `npx supabase db reset` (schema changed)

---

## Phase 2: Storage Layer & ECS Integration

### Overview
Implement Storage helpers and ECS integration for sparks.

### Changes Required:

#### 1. Storage Helper Functions
**File**: `src/lib/sparks/storage.ts`
**Changes**: Create storage utilities for spark JSON management

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

export async function verifySparksIntegrity(userId: string): Promise<boolean> {
  const supabase = createClient()

  const { data: files } = await supabase.storage
    .from('documents')
    .list(`${userId}/sparks`)
  const storageCount = files?.length || 0

  const { count: cacheCount } = await supabase
    .from('sparks')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)

  return storageCount === cacheCount
}
```

#### 2. Mention Resolution
**File**: `src/lib/sparks/mention-resolver.ts`
**Changes**: Fuzzy matching for document/chunk mentions

```typescript
import Fuse from 'fuse.js'
import { createClient } from '@/lib/supabase/server'

interface MentionResolution {
  original: string
  resolved: string | null
  type: 'chunk' | 'document' | 'ambiguous' | 'unresolved'
  confidence: number
}

export async function resolveMention(
  mention: string,
  userId: string
): Promise<MentionResolution> {
  const supabase = createClient()
  const normalized = mention.toLowerCase().trim()

  // Try exact chunk ID match first
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

  // Fuzzy match document titles
  const { data: documents } = await supabase
    .from('documents')
    .select('id, title')
    .eq('user_id', userId)

  if (documents && documents.length > 0) {
    const fuse = new Fuse(documents, {
      keys: ['title'],
      threshold: 0.4,
      includeScore: true
    })

    const results = fuse.search(normalized)
    if (results.length > 0 && results[0].score && results[0].score < 0.15) {
      // High confidence match - get first chunk
      const { data: firstChunk } = await supabase
        .from('chunks')
        .select('id')
        .eq('document_id', results[0].item.id)
        .order('chunk_index')
        .limit(1)
        .single()

      if (firstChunk) {
        return {
          original: mention,
          resolved: firstChunk.id,
          type: 'document',
          confidence: 1 - (results[0].score || 1)
        }
      }
    }
  }

  return {
    original: mention,
    resolved: null,
    type: 'unresolved',
    confidence: 0
  }
}

export async function extractAndResolveMentions(
  content: string,
  userId: string
): Promise<{ resolved: string[]; unresolved: MentionResolution[] }> {
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
    unresolved: resolutions.filter(r => r.type === 'unresolved')
  }
}
```

### Success Criteria:

#### Automated Verification:
- [ ] Type check passes: `npm run type-check`
- [ ] Storage upload/download works in tests
- [ ] Mention resolution returns correct types

#### Manual Verification:
- [ ] Spark JSON uploads to Storage
- [ ] Integrity check detects mismatches
- [ ] Mentions resolve to chunks

---

## Phase 3: Server Actions & Connection Inheritance

### Overview
Implement server actions for spark CRUD and connection inheritance logic.

### Changes Required:

#### 1. Spark Server Actions
**File**: `src/app/actions/sparks.ts`
**Changes**: Create, update, delete sparks with connection inheritance

```typescript
'use server'

import { revalidatePath } from 'next/cache'
import { embed } from 'ai'
import { google } from '@ai-sdk/google'
import { getCurrentUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { ecs } from '@/lib/ecs'
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

  const supabase = createClient()

  // Extract mentions and tags
  const { resolved: mentionedChunks } = await extractAndResolveMentions(
    input.content,
    user.id
  )

  const tags = Array.from(
    input.content.matchAll(/#([a-z0-9_-]+)/gi),
    m => m[1].toLowerCase()
  )

  // Generate embedding for search
  const { embedding } = await embed({
    model: google.textEmbeddingModel('text-embedding-004', {
      outputDimensionality: 768
    }),
    value: input.content
  })

  // Create ECS entity with spark component
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

  // Build spark JSON for Storage
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

  // Upload to Storage (source of truth)
  const jsonPath = await uploadSparkToStorage(user.id, sparkEntityId, sparkJson)

  // Insert cache row
  await supabase.from('sparks').insert({
    id: sparkEntityId,
    user_id: user.id,
    storage_path: `${user.id}/sparks/${sparkEntityId}`,
    json_path: jsonPath,
    content: input.content,
    created_at: sparkJson.created_at,
    origin_chunk_id: sparkJson.origin_chunk_id || null,
    mentioned_chunk_ids: mentionedChunks,
    tags,
    context: input.context,
    embedding
  })

  // Inherit connections from origin chunk (0.7x weight)
  await inheritChunkConnections(sparkEntityId, sparkJson.origin_chunk_id, user.id)

  // Create explicit mention connections
  for (const chunkId of mentionedChunks) {
    await supabase.from('connections').insert({
      source_entity_id: sparkEntityId,
      target_chunk_id: chunkId,
      connection_type: 'spark_mention',
      strength: 0.9,
      auto_detected: false,
      metadata: { mentioned_in_content: true }
    })
  }

  revalidatePath('/sparks')
  return { success: true, sparkId: sparkEntityId }
}

async function inheritChunkConnections(
  sparkEntityId: string,
  originChunkId: string,
  userId: string
): Promise<void> {
  const supabase = createClient()

  // Direct connection: Origin chunk → Spark
  await supabase.from('connections').insert({
    source_chunk_id: originChunkId,
    target_entity_id: sparkEntityId,
    connection_type: 'spark_origin',
    strength: 1.0,
    auto_detected: false,
    metadata: { relationship: 'origin' }
  })

  // Inherit origin's connections with reduced weight
  const { data: originConnections } = await supabase
    .from('connections')
    .select('*')
    .eq('source_chunk_id', originChunkId)
    .gte('strength', 0.6)

  if (originConnections && originConnections.length > 0) {
    const inheritedConnections = originConnections.map(conn => ({
      source_entity_id: sparkEntityId,
      target_chunk_id: conn.target_chunk_id,
      connection_type: 'spark_inherited',
      strength: conn.strength * 0.7,
      auto_detected: true,
      metadata: {
        inherited_from: originChunkId,
        original_strength: conn.strength
      }
    }))

    await supabase.from('connections').insert(inheritedConnections)
  }
}
```

### Success Criteria:

#### Automated Verification:
- [ ] Server action compiles: `npm run build`
- [ ] ECS entity creation works
- [ ] Connections insert successfully

#### Manual Verification:
- [ ] Spark creates with all components
- [ ] Connections inherit correctly
- [ ] Mentions resolve and connect

---

## Phase 4: UI Components

### Overview
Create UI components for spark capture and timeline display.

### Changes Required:

#### 1. Spark Capture Modal
**File**: `src/components/sparks/SparkCapture.tsx`
**Changes**: Cmd+K modal for spark creation

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
  const context = useReaderContext()

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
      await createSpark({
        content,
        context: {
          ...context,
          selection: selection?.toString() ? {
            text: selection.toString(),
            chunkId: context.currentChunkId,
            startOffset: 0,
            endOffset: selection.toString().length
          } : undefined
        }
      })

      setContent('')
      setOpen(false)
    } catch (error) {
      console.error('Failed to create spark:', error)
    } finally {
      setLoading(false)
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
          placeholder="Capture your thought... Use / to link chunks, # for tags"
          className="w-full min-h-[120px] p-3 border rounded-md resize-none"
          autoFocus
          disabled={loading}
        />

        <div className="text-sm text-muted-foreground">
          Context: {context.documentTitle} • {context.connections.length} connections
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
            className="px-4 py-2 text-sm bg-yellow-500 text-white rounded"
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

#### 2. Add to Reader Layout
**File**: `src/app/read/[id]/page.tsx`
**Changes**: Include SparkCapture in reader page

```typescript
// Add to imports
import { SparkCapture } from '@/components/sparks/SparkCapture'

// Add to component return (around line 150)
return (
  <ReaderContextProvider value={readerContext}>
    <div className="reader-layout">
      {/* existing content */}
      <SparkCapture />
    </div>
  </ReaderContextProvider>
)
```

### Success Criteria:

#### Automated Verification:
- [ ] Components compile: `npm run build`
- [ ] No TypeScript errors: `npm run type-check`

#### Manual Verification:
- [ ] Cmd+K opens modal
- [ ] Spark saves successfully
- [ ] Context captured correctly

---

## Phase 5: Obsidian Integration

### Overview
Extend Obsidian sync to export sparks alongside documents.

### Changes Required:

#### 1. Extend Obsidian Handler
**File**: `worker/handlers/obsidian-sync.ts`
**Changes**: Add exportSparks function after line 412

```typescript
// Add after line 412
async function exportSparks(
  documentId: string,
  vaultFilePath: string
): Promise<void> {
  const supabase = getSupabaseClient()

  // Get sparks for this document
  const { data: sparks } = await supabase
    .from('sparks')
    .select('*')
    .eq('context->>documentId', documentId)
    .order('created_at', { ascending: false })

  if (!sparks || sparks.length === 0) return

  // Build YAML frontmatter + content
  const sparksContent = sparks.map(spark => {
    const frontmatter = {
      id: spark.id,
      created: spark.created_at,
      tags: spark.tags || [],
      origin_chunk: spark.origin_chunk_id
    }

    return matter.stringify(spark.content, frontmatter)
  }).join('\n---\n\n')

  // Write sparks file
  const sparksPath = vaultFilePath.replace(/\.md$/, '.sparks.md')
  await fs.writeFile(sparksPath, sparksContent, 'utf-8')

  console.log(`[Obsidian] Exported ${sparks.length} sparks to ${sparksPath}`)
}

// Modify exportToObsidian function around line 141
// Add after annotations export:
if (obsidianSettings.exportSparks !== false) {
  await exportSparks(documentId, vaultFilePath)
}
```

### Success Criteria:

#### Automated Verification:
- [ ] Worker builds: `cd worker && npm run build`
- [ ] No TypeScript errors

#### Manual Verification:
- [ ] Sparks export to .sparks.md file
- [ ] YAML frontmatter correct
- [ ] Obsidian can read files

---

## Testing Strategy

### Unit Tests:
- Mention resolution with fuzzy matching
- Connection inheritance weight calculation
- Storage upload/download cycle
- ECS entity creation with spark component

### Integration Tests:
- End-to-end spark creation flow
- Context restoration accuracy
- Obsidian export with multiple sparks
- Search relevance scoring

### Manual Testing:
1. Create spark with Cmd+K
2. Verify Storage upload
3. Check connection inheritance
4. Test context restoration
5. Export to Obsidian
6. Verify timeline pagination

## Performance Considerations
- Paginate timeline queries (50 sparks/page)
- Index on (user_id, created_at DESC) for fast timeline
- Lazy load full JSON only for context restoration
- Batch embed multiple sparks if created quickly
- Cache integrity check on startup only

## Migration Notes
- Run migrations 053 and 054 in order
- Existing connections remain unchanged (backward compatible)
- No data migration needed (greenfield feature)
- Cache rebuild available via `verifySparksIntegrity()`

## References
- ECS Implementation: `src/lib/ecs/ecs.ts`
- Annotation Pattern: `src/app/actions/annotations.ts`
- Storage Helpers: `worker/lib/storage-helpers.ts`
- Connection System: `supabase/migrations/021_convert_connections_to_chunk_based.sql`
- Obsidian Integration: `worker/handlers/obsidian-sync.ts:352-412`