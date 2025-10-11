# Complete Versioning Implementation (Snapshot-Based)

## Database Schema

```sql
-- ============================================================================
-- DOCUMENT VERSIONING (markdown only)
-- ============================================================================

CREATE TABLE document_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  
  -- Full markdown snapshot
  markdown_content TEXT NOT NULL,
  
  -- Metadata
  created_by TEXT NOT NULL, -- 'obsidian_sync' | 'user_edit' | 'reprocess' | 'import'
  word_count INTEGER,
  diff_summary TEXT,
  
  created_at TIMESTAMP DEFAULT NOW(),
  
  UNIQUE(document_id, version)
);

CREATE INDEX idx_document_versions_lookup 
  ON document_versions(document_id, version);

-- ============================================================================
-- SPARK SNAPSHOTS (frozen context with full chunk data)
-- ============================================================================

CREATE TABLE spark_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  document_version INTEGER NOT NULL,
  
  -- Frozen context (self-contained - no chunk references)
  context JSONB NOT NULL,
  /* Structure:
  {
    visible_chunks: [
      {
        id: "chunk-123",
        content: "full text...",
        themes: ["theme1", "theme2"],
        concepts: [{ text: "concept", importance: 0.9 }],
        emotional_tone: { polarity: -0.3, primaryEmotion: "anxiety" },
        importance_score: 0.85,
        start_offset: 0,
        end_offset: 2847
      }
    ],
    connections: [
      {
        source_chunk_id: "chunk-123",
        target_chunk_id: "chunk-456",
        target_document_title: "1984",
        type: "contradiction",
        strength: 0.92,
        metadata: { ... }
      }
    ],
    scroll_position: 2847,
    viewport_offsets: { start: 0, end: 3500 },
    engine_weights: {
      semantic: 0.25,
      contradiction: 0.40,
      thematic_bridge: 0.35
    },
    sidebar_state: {
      filter: "all",
      sort: "strength",
      expanded_connection_ids: ["conn-1", "conn-2"]
    }
  }
  */
  
  -- Size tracking
  snapshot_size_bytes INTEGER,
  visible_chunk_count INTEGER,
  connection_count INTEGER,
  
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_snapshots_document ON spark_snapshots(document_id);

-- ============================================================================
-- SPARKS
-- ============================================================================

CREATE TABLE sparks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  
  -- The thought/note
  content TEXT NOT NULL,
  
  -- Reference to frozen context
  snapshot_id UUID NOT NULL REFERENCES spark_snapshots(id) ON DELETE CASCADE,
  
  -- Denormalized for list views
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  document_title TEXT,
  quoted_text TEXT, -- First 200 chars of visible content
  
  -- Threading (future)
  parent_spark_id UUID REFERENCES sparks(id),
  thread_id UUID,
  
  -- Metadata
  tags TEXT[],
  is_archived BOOLEAN DEFAULT false,
  
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_sparks_user ON sparks(user_id, created_at DESC);
CREATE INDEX idx_sparks_document ON sparks(document_id, created_at DESC);
CREATE INDEX idx_sparks_thread ON sparks(thread_id) WHERE thread_id IS NOT NULL;

-- ============================================================================
-- UPDATE DOCUMENTS TABLE
-- ============================================================================

ALTER TABLE documents 
  ADD COLUMN IF NOT EXISTS current_version INTEGER DEFAULT 1;
```

---

## Updated `reprocessDocument.ts`

```typescript
/**
 * Document Reprocessing Orchestrator
 * CHANGE: Now creates version record before reprocessing
 */

import { createClient } from '@supabase/supabase-js'
import { recoverAnnotations } from './recover-annotations.js'
import { remapConnections } from './remap-connections.js'
import type { ReprocessResults, Chunk } from '../types/recovery.js'

export async function reprocessDocument(
  documentId: string,
  supabaseClient?: any
): Promise<ReprocessResults> {
  const startTime = Date.now()
  const supabase = supabaseClient || createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const reprocessingBatch = new Date().toISOString()

  console.log(`[ReprocessDocument] Starting for document ${documentId}`)

  try {
    // ========================================================================
    // NEW: CREATE VERSION BEFORE REPROCESSING
    // ========================================================================
    
    // 1. Get current document state
    const { data: document } = await supabase
      .from('documents')
      .select('id, current_version, markdown_path, title')
      .eq('id', documentId)
      .single()

    if (!document?.markdown_path) {
      throw new Error('Document markdown_path not found')
    }

    // 2. Download markdown from storage
    const { data: blob } = await supabase.storage
      .from('documents')
      .download(document.markdown_path)

    if (!blob) {
      throw new Error('Failed to download markdown from storage')
    }

    const newMarkdown = await blob.text()
    const wordCount = newMarkdown.split(/\s+/).length
    const newVersion = (document.current_version || 0) + 1

    console.log(`[ReprocessDocument] Creating version ${newVersion}`)

    // 3. Create version record
    const { error: versionError } = await supabase
      .from('document_versions')
      .insert({
        document_id: documentId,
        version: newVersion,
        markdown_content: newMarkdown,
        created_by: 'reprocess',
        word_count: wordCount
      })

    if (versionError) {
      throw new Error(`Failed to create version: ${versionError.message}`)
    }

    // 4. Update document current_version
    await supabase
      .from('documents')
      .update({ 
        current_version: newVersion,
        processing_status: 'reprocessing'
      })
      .eq('id', documentId)

    console.log(`[ReprocessDocument] Created version ${newVersion}`)

    // ========================================================================
    // EXISTING REPROCESSING LOGIC (unchanged)
    // ========================================================================

    // Mark old chunks as not current
    console.log('[ReprocessDocument] Marking old chunks as is_current: false')
    await supabase
      .from('chunks')
      .update({ is_current: false })
      .eq('document_id', documentId)
      .eq('is_current', true)

    // Reprocess markdown to create new chunks
    console.log('[ReprocessDocument] Creating new chunks from edited markdown...')

    const { batchChunkAndExtractMetadata } = await import('../lib/ai-chunking-batch.js')
    const { generateEmbeddings } = await import('../lib/embeddings.js')

    const aiChunks = await batchChunkAndExtractMetadata(
      newMarkdown,
      {
        apiKey: process.env.GOOGLE_AI_API_KEY,
        modelName: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
        enableProgress: false
      }
    )

    console.log(`[ReprocessDocument] Created ${aiChunks.length} chunks via AI`)

    // Generate embeddings
    console.log('[ReprocessDocument] Generating embeddings...')
    const embeddings = await generateEmbeddings(aiChunks.map(c => c.content))

    // Insert new chunks
    const newChunksToInsert = aiChunks.map((chunk, index) => ({
      document_id: documentId,
      chunk_index: index,
      content: chunk.content,
      start_offset: chunk.start_offset,
      end_offset: chunk.end_offset,
      word_count: chunk.content.split(/\s+/).length,
      themes: chunk.metadata?.themes || [],
      importance_score: chunk.metadata?.importance || 0.5,
      summary: chunk.metadata?.summary || null,

      emotional_metadata: chunk.metadata?.emotional ? {
        polarity: chunk.metadata.emotional.polarity,
        primaryEmotion: chunk.metadata.emotional.primaryEmotion,
        intensity: chunk.metadata.emotional.intensity
      } : null,
      conceptual_metadata: chunk.metadata?.concepts ? {
        concepts: chunk.metadata.concepts
      } : null,
      domain_metadata: chunk.metadata?.domain ? {
        primaryDomain: chunk.metadata.domain,
        confidence: 0.8
      } : null,

      metadata_extracted_at: new Date().toISOString(),
      embedding: embeddings[index],
      is_current: false,
      reprocessing_batch: reprocessingBatch
    }))

    const { data: insertedChunks, error: insertError } = await supabase
      .from('chunks')
      .insert(newChunksToInsert)
      .select('id, document_id, chunk_index, start_offset, end_offset, content, embedding, is_current')

    if (insertError || !insertedChunks) {
      throw new Error(`Failed to insert new chunks: ${insertError?.message}`)
    }

    const newChunks = insertedChunks
    console.log(`[ReprocessDocument] Inserted ${newChunks.length} new chunks`)

    // Run collision detection (non-blocking)
    try {
      console.log('[ReprocessDocument] Running 3-engine collision detection...')
      const { processDocument } = await import('../engines/orchestrator.js')
      await processDocument(documentId)
      console.log('[ReprocessDocument] ✅ Collision detection complete')
    } catch (error) {
      console.error('[ReprocessDocument] ⚠️  Collision detection failed:', error)
    }

    // Recover annotations
    console.log('[ReprocessDocument] Starting annotation recovery...')
    const annotationResults = await recoverAnnotations(
      documentId,
      newMarkdown,
      newChunks as Chunk[],
      supabase
    )

    // Remap connections
    let connectionResults
    try {
      console.log('[ReprocessDocument] Starting connection remapping...')
      connectionResults = await remapConnections(
        documentId,
        newChunks as Chunk[],
        supabase
      )
      console.log('[ReprocessDocument] ✅ Connection remapping complete')
    } catch (error) {
      console.error('[ReprocessDocument] ⚠️  Connection remapping failed:', error)
      connectionResults = { success: [], needsReview: [], lost: [] }
    }

    const totalAnnotations = annotationResults.success.length +
      annotationResults.needsReview.length +
      annotationResults.lost.length

    const recoveryRate = totalAnnotations > 0
      ? (annotationResults.success.length + annotationResults.needsReview.length) / totalAnnotations
      : 1.0

    console.log(`[ReprocessDocument] Recovery stats:`)
    console.log(`  - Success: ${annotationResults.success.length}`)
    console.log(`  - Needs review: ${annotationResults.needsReview.length}`)
    console.log(`  - Lost: ${annotationResults.lost.length}`)
    console.log(`  - Rate: ${(recoveryRate * 100).toFixed(1)}%`)

    // Commit changes
    console.log('[ReprocessDocument] ✅ Committing changes')

    // Set new chunks as current
    await supabase
      .from('chunks')
      .update({ is_current: true })
      .eq('reprocessing_batch', reprocessingBatch)

    // Delete old chunks (keep this - we only version markdown, not chunks)
    console.log('[ReprocessDocument] Deleting old chunks...')
    const { error: deleteError } = await supabase
      .from('chunks')
      .delete()
      .eq('document_id', documentId)
      .eq('is_current', false)

    if (deleteError) {
      console.error('[ReprocessDocument] ⚠️  Failed to delete old chunks:', deleteError.message)
    }

    // Update processing status
    await supabase
      .from('documents')
      .update({ processing_status: 'completed' })
      .eq('id', documentId)

    const executionTime = Date.now() - startTime
    console.log(`[ReprocessDocument] ✅ Complete in ${(executionTime / 1000).toFixed(1)}s`)

    return {
      annotations: annotationResults,
      connections: connectionResults,
      executionTime,
      recoveryRate,
      version: newVersion // NEW: Return version info
    }
  } catch (error) {
    console.error('[ReprocessDocument] ❌ Error - rolling back:', error)

    // Rollback: Delete new chunks by batch ID
    await supabase
      .from('chunks')
      .delete()
      .eq('reprocessing_batch', reprocessingBatch)

    // Restore old chunks
    await supabase
      .from('chunks')
      .update({ is_current: true })
      .eq('document_id', documentId)
      .eq('is_current', false)

    await supabase
      .from('documents')
      .update({
        processing_status: 'failed',
        processing_error: error instanceof Error ? error.message : 'Unknown error'
      })
      .eq('id', documentId)

    throw error
  }
}
```

---

## Updated Obsidian Sync Handler

```typescript
/**
 * Obsidian Sync Handler
 * CHANGE: Minimal - reprocessDocument now handles versioning
 */

export async function syncFromObsidian(
  documentId: string,
  userId: string
): Promise<SyncResult> {
  try {
    console.log(`[Obsidian Sync] Starting sync for document ${documentId}`)

    const supabase = getSupabaseClient()

    // 1. Get document and settings
    const { data: document, error: docError } = await supabase
      .from('documents')
      .select('markdown_path, obsidian_path')
      .eq('id', documentId)
      .single()

    if (docError || !document) {
      throw new Error(`Document not found: ${docError?.message}`)
    }

    if (!document.obsidian_path) {
      throw new Error('Document has not been exported to Obsidian yet')
    }

    const { data: settings, error: settingsError } = await supabase
      .from('user_settings')
      .select('obsidian_settings')
      .eq('user_id', userId)
      .single()

    if (settingsError || !settings?.obsidian_settings) {
      throw new Error('Obsidian settings not configured')
    }

    const obsidianSettings = settings.obsidian_settings as ObsidianSettings
    const vaultFilePath = path.join(obsidianSettings.vaultPath, document.obsidian_path)

    // 2. Read edited markdown from vault
    const editedMarkdown = await fs.readFile(vaultFilePath, 'utf-8')

    // 3. Get current storage version for comparison
    const { data: currentBlob, error: downloadError } = await supabase.storage
      .from('documents')
      .download(document.markdown_path)

    if (downloadError || !currentBlob) {
      throw new Error(`Failed to download current markdown: ${downloadError?.message}`)
    }

    const currentMarkdown = await currentBlob.text()

    // 4. Check if content actually changed
    if (editedMarkdown.trim() === currentMarkdown.trim()) {
      console.log(`[Obsidian Sync] No changes detected`)
      return { success: true, changed: false }
    }

    console.log(`[Obsidian Sync] Changes detected, uploading and reprocessing`)

    // 5. Upload edited markdown to storage
    const { error: uploadError } = await supabase.storage
      .from('documents')
      .update(document.markdown_path, new Blob([editedMarkdown], { type: 'text/markdown' }), {
        contentType: 'text/markdown',
        upsert: true
      })

    if (uploadError) {
      throw new Error(`Failed to upload edited markdown: ${uploadError.message}`)
    }

    // 6. Trigger reprocessing (now creates version automatically)
    const recovery = await reprocessDocument(documentId)

    console.log(`[Obsidian Sync] ✅ Sync complete`)
    console.log(`[Obsidian Sync] Version: ${recovery.version}`)
    console.log(`[Obsidian Sync] Recovery stats:`, {
      success: recovery.annotations.success.length,
      needsReview: recovery.annotations.needsReview.length,
      lost: recovery.annotations.lost.length
    })

    return {
      success: true,
      changed: true,
      version: recovery.version,
      recovery: recovery.annotations
    }

  } catch (error) {
    console.error('[Obsidian Sync] ❌ Sync failed:', error)
    return {
      success: false,
      changed: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}
```

---

## Spark Creation

```typescript
// src/lib/sparks/createSpark.ts

import { createClient } from '@supabase/supabase-js'

interface CreateSparkInput {
  content: string
  documentId: string
  userId: string
  
  // Current reading context
  visibleChunks: Array<{
    id: string
    content: string
    themes: string[]
    concepts: Array<{ text: string; importance: number }>
    emotional_tone?: { polarity: number; primaryEmotion: string }
    importance_score: number
    start_offset: number
    end_offset: number
  }>
  
  connections: Array<{
    id: string
    source_chunk_id: string
    target_chunk_id: string
    target_document_title?: string
    type: 'semantic' | 'contradiction' | 'thematic_bridge'
    strength: number
    metadata: any
  }>
  
  scrollPosition: number
  viewportOffsets: { start: number; end: number }
  
  engineWeights: {
    semantic: number
    contradiction: number
    thematic_bridge: number
  }
  
  sidebarState: {
    filter: string
    sort: string
    expandedConnectionIds: string[]
  }
}

export async function createSpark(input: CreateSparkInput) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_ANON_KEY!
  )

  console.log('[Sparks] Creating spark with frozen context')
  
  // 1. Get current document version
  const { data: document, error: docError } = await supabase
    .from('documents')
    .select('id, title, current_version')
    .eq('id', input.documentId)
    .single()
  
  if (docError) {
    throw new Error(`Failed to load document: ${docError.message}`)
  }
  
  console.log(`[Sparks] Document "${document.title}" at version ${document.current_version}`)
  
  // 2. Build frozen context snapshot (self-contained, no references)
  const context = {
    visible_chunks: input.visibleChunks.map(chunk => ({
      id: chunk.id,
      content: chunk.content,
      themes: chunk.themes,
      concepts: chunk.concepts,
      emotional_tone: chunk.emotional_tone,
      importance_score: chunk.importance_score,
      start_offset: chunk.start_offset,
      end_offset: chunk.end_offset
    })),
    connections: input.connections.map(conn => ({
      id: conn.id,
      source_chunk_id: conn.source_chunk_id,
      target_chunk_id: conn.target_chunk_id,
      target_document_title: conn.target_document_title,
      type: conn.type,
      strength: conn.strength,
      metadata: conn.metadata
    })),
    scroll_position: input.scrollPosition,
    viewport_offsets: input.viewportOffsets,
    engine_weights: input.engineWeights,
    sidebar_state: input.sidebarState
  }
  
  const contextJson = JSON.stringify(context)
  const snapshotSizeBytes = new Blob([contextJson]).size
  
  console.log(`[Sparks] Snapshot: ${(snapshotSizeBytes / 1024).toFixed(1)}KB, ${input.visibleChunks.length} chunks, ${input.connections.length} connections`)
  
  // 3. Create snapshot
  const { data: snapshot, error: snapshotError } = await supabase
    .from('spark_snapshots')
    .insert({
      document_id: input.documentId,
      document_version: document.current_version,
      context,
      snapshot_size_bytes: snapshotSizeBytes,
      visible_chunk_count: input.visibleChunks.length,
      connection_count: input.connections.length
    })
    .select()
    .single()
  
  if (snapshotError) {
    throw new Error(`Failed to create snapshot: ${snapshotError.message}`)
  }
  
  console.log(`[Sparks] Created snapshot: ${snapshot.id}`)
  
  // 4. Extract quoted text (first 200 chars)
  const quotedText = input.visibleChunks
    .map(c => c.content)
    .join(' ')
    .slice(0, 200)
  
  // 5. Create spark
  const { data: spark, error: sparkError } = await supabase
    .from('sparks')
    .insert({
      user_id: input.userId,
      content: input.content,
      snapshot_id: snapshot.id,
      document_id: input.documentId,
      document_title: document.title,
      quoted_text: quotedText
    })
    .select()
    .single()
  
  if (sparkError) {
    throw new Error(`Failed to create spark: ${sparkError.message}`)
  }
  
  console.log(`[Sparks] Created spark: ${spark.id}`)
  
  return { spark, snapshot, snapshotSize: snapshotSizeBytes }
}
```

---

## Spark Restoration

```typescript
// src/lib/sparks/restoreSpark.ts

import { createClient } from '@supabase/supabase-js'

interface RestoredContext {
  document: {
    id: string
    title: string
    markdown: string
    version: number
  }
  visibleChunks: any[]
  connections: any[]
  scrollPosition: number
  viewportOffsets: { start: number; end: number }
  engineWeights: {
    semantic: number
    contradiction: number
    thematic_bridge: number
  }
  sidebarState: {
    filter: string
    sort: string
    expandedConnectionIds: string[]
  }
  spark: {
    id: string
    content: string
    created_at: string
  }
}

export async function restoreSpark(sparkId: string): Promise<RestoredContext> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_ANON_KEY!
  )

  console.log(`[Sparks] Restoring spark ${sparkId}`)
  
  // 1. Load spark with snapshot
  const { data: spark, error: sparkError } = await supabase
    .from('sparks')
    .select(`
      id,
      content,
      created_at,
      document_id,
      document_title,
      snapshot:spark_snapshots(
        id,
        document_id,
        document_version,
        context,
        snapshot_size_bytes
      )
    `)
    .eq('id', sparkId)
    .single()
  
  if (sparkError || !spark.snapshot) {
    throw new Error(`Failed to load spark: ${sparkError?.message}`)
  }
  
  console.log(`[Sparks] Loaded snapshot (${(spark.snapshot.snapshot_size_bytes / 1024).toFixed(1)}KB)`)
  
  // 2. Load document version markdown
  const { data: docVersion, error: versionError } = await supabase
    .from('document_versions')
    .select('markdown_content')
    .eq('document_id', spark.snapshot.document_id)
    .eq('version', spark.snapshot.document_version)
    .single()
  
  if (versionError) {
    throw new Error(`Failed to load document version: ${versionError.message}`)
  }
  
  console.log(`[Sparks] Loaded document version ${spark.snapshot.document_version}`)
  
  // 3. Parse frozen context (self-contained, no DB queries needed)
  const context = spark.snapshot.context
  
  // 4. Return everything needed to restore UI state
  return {
    document: {
      id: spark.document_id,
      title: spark.document_title,
      markdown: docVersion.markdown_content,
      version: spark.snapshot.document_version
    },
    visibleChunks: context.visible_chunks,
    connections: context.connections,
    scrollPosition: context.scroll_position,
    viewportOffsets: context.viewport_offsets,
    engineWeights: context.engine_weights,
    sidebarState: context.sidebar_state,
    spark: {
      id: spark.id,
      content: spark.content,
      created_at: spark.created_at
    }
  }
}
```

---

## Migration Script

```sql
-- Run this in Supabase SQL Editor

-- 1. Create document_versions table
CREATE TABLE IF NOT EXISTS document_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  markdown_content TEXT NOT NULL,
  created_by TEXT NOT NULL,
  word_count INTEGER,
  diff_summary TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(document_id, version)
);

CREATE INDEX IF NOT EXISTS idx_document_versions_lookup 
  ON document_versions(document_id, version);

-- 2. Create spark_snapshots table
CREATE TABLE IF NOT EXISTS spark_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  document_version INTEGER NOT NULL,
  context JSONB NOT NULL,
  snapshot_size_bytes INTEGER,
  visible_chunk_count INTEGER,
  connection_count INTEGER,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_snapshots_document 
  ON spark_snapshots(document_id);

-- 3. Create sparks table
CREATE TABLE IF NOT EXISTS sparks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  content TEXT NOT NULL,
  snapshot_id UUID NOT NULL REFERENCES spark_snapshots(id) ON DELETE CASCADE,
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  document_title TEXT,
  quoted_text TEXT,
  parent_spark_id UUID REFERENCES sparks(id),
  thread_id UUID,
  tags TEXT[],
  is_archived BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sparks_user 
  ON sparks(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sparks_document 
  ON sparks(document_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sparks_thread 
  ON sparks(thread_id) WHERE thread_id IS NOT NULL;

-- 4. Add current_version to documents
ALTER TABLE documents 
  ADD COLUMN IF NOT EXISTS current_version INTEGER DEFAULT 1;

-- 5. Create version 1 for all existing documents
INSERT INTO document_versions (document_id, version, markdown_content, created_by, word_count, created_at)
SELECT 
  id,
  1 as version,
  markdown_content,
  'import' as created_by,
  word_count,
  created_at
FROM documents
WHERE id NOT IN (SELECT document_id FROM document_versions WHERE version = 1);

-- 6. Update documents to set current_version = 1
UPDATE documents 
SET current_version = 1 
WHERE current_version IS NULL OR current_version = 0;
```

---

## TypeScript Types

```typescript
// src/types/versioning.ts

export interface DocumentVersion {
  id: string
  document_id: string
  version: number
  markdown_content: string
  created_by: 'obsidian_sync' | 'user_edit' | 'reprocess' | 'import'
  word_count: number
  diff_summary?: string
  created_at: string
}

export interface SparkSnapshot {
  id: string
  document_id: string
  document_version: number
  context: {
    visible_chunks: Array<{
      id: string
      content: string
      themes: string[]
      concepts: Array<{ text: string; importance: number }>
      emotional_tone?: { polarity: number; primaryEmotion: string }
      importance_score: number
      start_offset: number
      end_offset: number
    }>
    connections: Array<{
      id: string
      source_chunk_id: string
      target_chunk_id: string
      target_document_title?: string
      type: 'semantic' | 'contradiction' | 'thematic_bridge'
      strength: number
      metadata: any
    }>
    scroll_position: number
    viewport_offsets: { start: number; end: number }
    engine_weights: {
      semantic: number
      contradiction: number
      thematic_bridge: number
    }
    sidebar_state: {
      filter: string
      sort: string
      expandedConnectionIds: string[]
    }
  }
  snapshot_size_bytes: number
  visible_chunk_count: number
  connection_count: number
  created_at: string
}

export interface Spark {
  id: string
  user_id: string
  content: string
  snapshot_id: string
  document_id: string
  document_title: string
  quoted_text: string
  parent_spark_id?: string
  thread_id?: string
  tags: string[]
  is_archived: boolean
  created_at: string
  updated_at: string
}
```

---

## Summary: What Changed

### **Database (3 new tables)**
- `document_versions` - Store markdown history
- `spark_snapshots` - Store frozen context as JSONB
- `sparks` - Store user thoughts with snapshot reference

### **Code Changes**

**`reprocessDocument.ts`** (+30 lines):
- Create version record before reprocessing
- Update document current_version
- Return version info

**Obsidian sync** (no changes):
- Already calls `reprocessDocument`, which now handles versioning

**New files**:
- `createSpark.ts` - Freeze context in JSONB snapshot
- `restoreSpark.ts` - Load snapshot + version markdown

### **Key Decisions**

✅ **Version markdown only** - Not chunks (avoid duplication)  
✅ **Self-contained snapshots** - Store full chunk objects in JSONB, not references  
✅ **Delete old chunks** - Keep only current (same as before)  
✅ **Minimal changes** - ~30 lines added to existing code  

### **Storage Per Document**

- Versions (10): 150KB × 10 = 1.5MB
- Current chunks: 382 chunks = 400KB
- Spark snapshots (20): 50KB × 20 = 1MB
- **Total: ~3MB**

### **Costs**

- Create spark: $0 (just JSONB insert)
- Restore spark: $0 (just JSONB load)
- Document sync: $0.20 (existing reprocessing cost)

This is ready to ship. Your developer can run the migration SQL, update `reprocessDocument.ts`, and add the spark functions.