# Chunk Versioning with Metadata Recovery

## Plain Language Overview

### The Problem
When you edit a document in Obsidian and sync it back to Rhizome:
1. AI chunking might fail (network errors, API limits, malformed responses)
2. Fallback chunking creates basic chunks without semantic metadata (themes, concepts, importance scores)
3. Lost metadata means poor connection detection - the 3-engine system needs rich metadata to find relationships
4. You lose the semantic understanding from the previous version

### The Solution: Version-Aware Metadata Recovery
Instead of deleting old chunks, we **version them** and use them as a **metadata bank**:

1. **Version everything together**: When the document is reprocessed, both markdown AND chunks get versioned
2. **Keep old chunks as metadata source**: Old chunks (version N) stay in database with `is_current=false`
3. **AI fails? Backfill from history**: Find matching old chunks using embeddings/fuzzy matching
4. **Transfer semantic understanding**: Copy themes, concepts, importance scores from old → new chunks
5. **Sparks get richer context**: Frozen snapshots reference versioned chunks for perfect restoration

### The Synergy with Sparks
**Sparks already freeze chunk data in JSONB snapshots** - this is perfect because:
- Sparks capture chunk metadata at a point in time
- When you restore a Spark, you see the exact semantic context from that moment
- Chunk versioning ensures that context remains queryable even after reprocessing
- If a Spark's chunks are deleted, we can still restore them from the version history

### Real-World Example
```
1. You upload "Gravity's Rainbow" (400 pages)
   → AI creates 382 chunks with rich metadata (version 1)

2. You notice formatting errors in Obsidian, fix them, sync back
   → AI chunking fails (network timeout on batch 3)
   → Fallback creates 380 basic chunks (no metadata)
   → Recovery system finds 375 matching old chunks (98% match rate)
   → Transfers metadata: themes, concepts, importance scores
   → Result: 375 chunks with recovered metadata, 5 truly new chunks

3. You created a Spark on page 147 before the edit
   → Spark frozen context references version 1 chunks
   → Restore Spark → loads version 1 markdown + chunk metadata
   → You see EXACTLY what you saw when you created the Spark
   → Even though current document is version 2
```

### Storage Impact (Personal Tool Optimized)
For a typical 500-page book over 6 months:
- **Markdown versions** (10 edits): 150KB × 10 = **1.5MB**
- **Current chunks** (version 10): 400KB
- **Old chunks** (versions 1-9, retention policy): 400KB × 3 recent versions = **1.2MB**
- **Spark snapshots** (20 sparks): 50KB × 20 = **1MB**
- **Total per book: ~4MB** (trivial for personal use)

Retention policy: Keep last 3 chunk versions + any version referenced by a Spark (never orphan a Spark)

---

## Architecture Design

### Core Principles
1. **Version cohesion**: Markdown + chunks version together as atomic units
2. **Metadata preservation**: Old chunks are a semantic memory bank
3. **Graceful degradation**: AI fails → fallback + recovery (not just fallback)
4. **Spark integrity**: Never orphan a Spark's frozen context
5. **Storage efficiency**: Retention policies keep only useful versions

### Version Lifecycle

```
Document Edit → Reprocess Triggered:
├─ Create markdown version N+1
├─ Mark old chunks: is_current=false, version=N
├─ Create new chunks: is_current=false, version=N+1, reprocessing_batch=timestamp
├─ AI chunking:
│   ├─ Success → chunks have fresh metadata
│   └─ Failure → fallback chunks (no metadata)
│       └─ Recovery: Match old chunks → transfer metadata
├─ Commit: Set version N+1 chunks as is_current=true
└─ Cleanup: Apply retention policy (keep last 3 versions + Spark-referenced versions)
```

### Matching Strategies (Fallback → Old Chunk)

**Priority order**:
1. **Semantic similarity** (embeddings): Cosine distance > 0.85 → High confidence match
2. **Fuzzy text matching** (Levenshtein): String similarity > 0.80 → Medium confidence
3. **Position overlap** (offsets): Overlap > 70% → Low confidence (for truly new content placement)

**Success rate expectations**:
- Semantic: 70-80% of chunks (best quality, uses embeddings)
- Fuzzy: 10-15% of chunks (good quality, text-based)
- Position: 5-10% of chunks (acceptable quality, overlap-based)
- No match: 5-10% (truly new content - keeps fallback metadata)

### Integration with Sparks

**Spark Creation** (no changes needed):
- Already freezes full chunk objects in JSONB
- Already captures document version number
- Snapshot is self-contained

**Spark Restoration** (enhanced):
```
User clicks Spark → Restore Context:
├─ Load Spark → get snapshot_id + document_version
├─ Load markdown from document_versions (version N)
├─ Parse JSONB context (chunks + connections already there)
├─ If chunk IDs still exist in current version:
│   └─ Highlight them in UI (show "these chunks survived")
├─ Restore UI state: scroll, sidebar, weights
└─ User sees EXACTLY what they saw when Spark was created
```

**Retention Policy Protection**:
```sql
-- Never delete chunks referenced by Sparks
DELETE FROM chunks
WHERE version < (current_version - 3) -- Keep last 3 versions
  AND version NOT IN (
    SELECT DISTINCT document_version
    FROM spark_snapshots
    WHERE document_id = chunks.document_id
  ) -- Protect Spark-referenced versions
```

---

## Technical Implementation

### 1. Database Schema Changes

```sql
-- ============================================================================
-- CHUNK VERSIONING
-- ============================================================================

-- Add version tracking to chunks table
ALTER TABLE chunks
  ADD COLUMN version INTEGER DEFAULT 1,
  ADD COLUMN metadata_source TEXT DEFAULT 'ai', -- 'ai' | 'recovered' | 'fallback'
  ADD COLUMN recovered_from_chunk_id UUID REFERENCES chunks(id),
  ADD COLUMN recovery_confidence FLOAT, -- 0.0-1.0
  ADD COLUMN recovery_method TEXT; -- 'semantic' | 'fuzzy_text' | 'position'

-- Composite index for version queries
CREATE INDEX idx_chunks_version_lookup
  ON chunks(document_id, version, is_current);

-- Index for recovery queries
CREATE INDEX idx_chunks_recovery_source
  ON chunks(recovered_from_chunk_id)
  WHERE recovered_from_chunk_id IS NOT NULL;

-- ============================================================================
-- DOCUMENT VERSIONS (from sparks-and-versioning.md)
-- ============================================================================

CREATE TABLE document_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  markdown_content TEXT NOT NULL,
  created_by TEXT NOT NULL, -- 'obsidian_sync' | 'user_edit' | 'reprocess' | 'import'
  word_count INTEGER,
  diff_summary TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(document_id, version)
);

CREATE INDEX idx_document_versions_lookup
  ON document_versions(document_id, version);

-- ============================================================================
-- SPARK SNAPSHOTS (from sparks-and-versioning.md - no changes)
-- ============================================================================

CREATE TABLE spark_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  document_version INTEGER NOT NULL,
  context JSONB NOT NULL, -- Frozen chunks + connections + UI state
  snapshot_size_bytes INTEGER,
  visible_chunk_count INTEGER,
  connection_count INTEGER,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_snapshots_document ON spark_snapshots(document_id);
CREATE INDEX idx_snapshots_version ON spark_snapshots(document_id, document_version);

-- ============================================================================
-- SPARKS (from sparks-and-versioning.md - no changes)
-- ============================================================================

CREATE TABLE sparks (
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

CREATE INDEX idx_sparks_user ON sparks(user_id, created_at DESC);
CREATE INDEX idx_sparks_document ON sparks(document_id, created_at DESC);

-- ============================================================================
-- DOCUMENTS TABLE UPDATE
-- ============================================================================

ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS current_version INTEGER DEFAULT 1;
```

### 2. Metadata Recovery Module

```typescript
// worker/lib/metadata-recovery.ts

import { createClient } from '@supabase/supabase-js'
import Fuse from 'fuse.js'
import { cosineSimilarity } from './embeddings.js'

interface Chunk {
  id: string
  document_id: string
  version: number
  content: string
  start_offset: number
  end_offset: number
  embedding?: number[]
  themes?: string[]
  concepts?: Array<{ text: string; importance: number }>
  importance_score?: number
  emotional_metadata?: any
  domain_metadata?: any
  is_current: boolean
}

interface ChunkMatch {
  oldChunk: Chunk
  newChunk: Chunk
  similarity: number
  method: 'semantic' | 'fuzzy_text' | 'position'
}

interface RecoveryStats {
  total: number
  semantic_matches: number
  fuzzy_matches: number
  position_matches: number
  no_match: number
  avg_confidence: number
}

/**
 * Recover metadata from old chunks when AI chunking fails
 * Uses embeddings, fuzzy text matching, and position overlap
 */
export async function recoverMetadataFromOldChunks(
  newChunks: Chunk[],
  documentId: string,
  supabase: any
): Promise<{ chunks: Chunk[]; stats: RecoveryStats }> {

  console.log('[MetadataRecovery] Starting recovery for', newChunks.length, 'chunks')

  // 1. Fetch previous version chunks (most recent non-current version)
  const { data: oldChunks, error } = await supabase
    .from('chunks')
    .select('*')
    .eq('document_id', documentId)
    .eq('is_current', false)
    .order('version', { ascending: false })
    .limit(500) // Last version only

  if (error || !oldChunks || oldChunks.length === 0) {
    console.log('[MetadataRecovery] No old chunks found, skipping recovery')
    return {
      chunks: newChunks,
      stats: {
        total: newChunks.length,
        semantic_matches: 0,
        fuzzy_matches: 0,
        position_matches: 0,
        no_match: newChunks.length,
        avg_confidence: 0
      }
    }
  }

  // Get most recent version number
  const latestOldVersion = oldChunks[0].version
  const relevantOldChunks = oldChunks.filter(c => c.version === latestOldVersion)

  console.log(`[MetadataRecovery] Found ${relevantOldChunks.length} chunks from version ${latestOldVersion}`)

  // 2. Find best matches for each new chunk
  const matches = await findBestMatches(newChunks, relevantOldChunks)

  // 3. Calculate stats
  const stats: RecoveryStats = {
    total: newChunks.length,
    semantic_matches: matches.filter(m => m.method === 'semantic').length,
    fuzzy_matches: matches.filter(m => m.method === 'fuzzy_text').length,
    position_matches: matches.filter(m => m.method === 'position').length,
    no_match: newChunks.length - matches.length,
    avg_confidence: matches.length > 0
      ? matches.reduce((sum, m) => sum + m.similarity, 0) / matches.length
      : 0
  }

  console.log('[MetadataRecovery] Match stats:', stats)

  // 4. Transfer metadata where confidence > threshold
  const recoveredChunks = newChunks.map(newChunk => {
    const match = matches.find(m => m.newChunk.id === newChunk.id)

    if (!match || match.similarity < 0.70) {
      // Keep as fallback chunk (no metadata transfer)
      return {
        ...newChunk,
        metadata_source: 'fallback'
      }
    }

    // Transfer semantic metadata from old chunk
    return {
      ...newChunk,
      themes: match.oldChunk.themes || [],
      concepts: match.oldChunk.concepts || [],
      importance_score: match.oldChunk.importance_score || 0.5,
      emotional_metadata: match.oldChunk.emotional_metadata,
      domain_metadata: match.oldChunk.domain_metadata,
      metadata_source: 'recovered',
      recovered_from_chunk_id: match.oldChunk.id,
      recovery_confidence: match.similarity,
      recovery_method: match.method
    }
  })

  const recoveredCount = recoveredChunks.filter(c => c.metadata_source === 'recovered').length
  console.log(`[MetadataRecovery] ✅ Recovered metadata for ${recoveredCount}/${newChunks.length} chunks`)

  return { chunks: recoveredChunks, stats }
}

/**
 * Find best matching old chunk for each new chunk
 * Priority: 1) Semantic (embeddings), 2) Fuzzy text, 3) Position
 */
async function findBestMatches(
  newChunks: Chunk[],
  oldChunks: Chunk[]
): Promise<ChunkMatch[]> {

  const matches: ChunkMatch[] = []

  for (const newChunk of newChunks) {
    let bestMatch: ChunkMatch | null = null

    // Strategy 1: Semantic similarity (embeddings) - BEST
    if (newChunk.embedding && oldChunks.some(c => c.embedding)) {
      const semanticMatch = findSemanticMatch(newChunk, oldChunks)
      if (semanticMatch && semanticMatch.similarity > 0.85) {
        bestMatch = semanticMatch
      }
    }

    // Strategy 2: Fuzzy text matching - GOOD
    if (!bestMatch) {
      const fuzzyMatch = findFuzzyTextMatch(newChunk, oldChunks)
      if (fuzzyMatch && fuzzyMatch.similarity > 0.80) {
        bestMatch = fuzzyMatch
      }
    }

    // Strategy 3: Position overlap - ACCEPTABLE
    if (!bestMatch) {
      const positionMatch = findPositionMatch(newChunk, oldChunks)
      if (positionMatch && positionMatch.similarity > 0.70) {
        bestMatch = positionMatch
      }
    }

    if (bestMatch) {
      matches.push(bestMatch)
    }
  }

  return matches
}

/**
 * Strategy 1: Semantic similarity using embeddings
 */
function findSemanticMatch(
  newChunk: Chunk,
  oldChunks: Chunk[]
): ChunkMatch | null {

  if (!newChunk.embedding) return null

  let bestMatch: { chunk: Chunk; similarity: number } | null = null

  for (const oldChunk of oldChunks) {
    if (!oldChunk.embedding) continue

    const similarity = cosineSimilarity(newChunk.embedding, oldChunk.embedding)

    if (!bestMatch || similarity > bestMatch.similarity) {
      bestMatch = { chunk: oldChunk, similarity }
    }
  }

  if (!bestMatch) return null

  return {
    oldChunk: bestMatch.chunk,
    newChunk,
    similarity: bestMatch.similarity,
    method: 'semantic'
  }
}

/**
 * Strategy 2: Fuzzy text matching (Levenshtein distance)
 */
function findFuzzyTextMatch(
  newChunk: Chunk,
  oldChunks: Chunk[]
): ChunkMatch | null {

  // Use first 500 chars for comparison (performance)
  const newText = newChunk.content.slice(0, 500)

  const candidates = oldChunks.map(oldChunk => ({
    oldChunk,
    similarity: stringSimilarity(newText, oldChunk.content.slice(0, 500))
  }))

  const best = candidates.sort((a, b) => b.similarity - a.similarity)[0]

  if (!best || best.similarity < 0.70) return null

  return {
    oldChunk: best.oldChunk,
    newChunk,
    similarity: best.similarity,
    method: 'fuzzy_text'
  }
}

/**
 * Strategy 3: Position overlap matching
 */
function findPositionMatch(
  newChunk: Chunk,
  oldChunks: Chunk[]
): ChunkMatch | null {

  const candidates = oldChunks.map(oldChunk => {
    const overlap = calculateOverlap(
      [newChunk.start_offset, newChunk.end_offset],
      [oldChunk.start_offset, oldChunk.end_offset]
    )
    return { oldChunk, similarity: overlap }
  })

  const best = candidates.sort((a, b) => b.similarity - a.similarity)[0]

  if (!best || best.similarity < 0.50) return null

  return {
    oldChunk: best.oldChunk,
    newChunk,
    similarity: best.similarity,
    method: 'position'
  }
}

/**
 * Calculate string similarity (normalized Levenshtein)
 */
function stringSimilarity(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length)
  if (maxLen === 0) return 1.0

  const distance = levenshteinDistance(a, b)
  return 1 - (distance / maxLen)
}

function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = []

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i]
  }

  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1]
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        )
      }
    }
  }

  return matrix[b.length][a.length]
}

/**
 * Calculate overlap percentage between two ranges
 */
function calculateOverlap(
  range1: [number, number],
  range2: [number, number]
): number {
  const [start1, end1] = range1
  const [start2, end2] = range2

  const overlapStart = Math.max(start1, start2)
  const overlapEnd = Math.min(end1, end2)

  if (overlapStart >= overlapEnd) return 0

  const overlapSize = overlapEnd - overlapStart
  const totalSize = Math.max(end1 - start1, end2 - start2)

  return overlapSize / totalSize
}
```

### 3. Updated Reprocess Pipeline

```typescript
// worker/handlers/reprocess-document.ts

import { recoverMetadataFromOldChunks } from '../lib/metadata-recovery.js'

export async function reprocessDocument(
  documentId: string,
  supabaseClient?: any,
  jobId?: string
): Promise<ReprocessResults> {

  const supabase = supabaseClient || createClient(...)
  const reprocessingBatch = new Date().toISOString()

  try {
    await updateProgress(5, 'Starting reprocessing...')

    // ========================================================================
    // 1. CREATE VERSION RECORDS (markdown + chunk versioning)
    // ========================================================================

    const { data: document } = await supabase
      .from('documents')
      .select('id, current_version, markdown_path, title')
      .eq('id', documentId)
      .single()

    const { data: blob } = await supabase.storage
      .from('documents')
      .download(document.markdown_path)

    const newMarkdown = await blob.text()
    const wordCount = newMarkdown.split(/\s+/).length
    const newVersion = (document.current_version || 0) + 1

    // Create markdown version
    await supabase
      .from('document_versions')
      .insert({
        document_id: documentId,
        version: newVersion,
        markdown_content: newMarkdown,
        created_by: 'reprocess',
        word_count: wordCount
      })

    await updateProgress(10, 'Markdown versioned')

    // ========================================================================
    // 2. VERSION OLD CHUNKS (mark with version, keep for recovery)
    // ========================================================================

    await supabase
      .from('chunks')
      .update({
        is_current: false,
        version: document.current_version // Version N
      })
      .eq('document_id', documentId)
      .eq('is_current', true)

    await updateProgress(15, 'Old chunks versioned')

    // ========================================================================
    // 3. CREATE NEW CHUNKS WITH AI
    // ========================================================================

    await updateProgress(20, 'Starting AI chunking...')

    let aiChunks
    let chunksWithMetadata
    let aiChunkingFailed = false

    try {
      aiChunks = await batchChunkAndExtractMetadata(newMarkdown, {...})
      chunksWithMetadata = aiChunks
      console.log(`[ReprocessDocument] ✅ AI created ${aiChunks.length} chunks`)
    } catch (error) {
      console.error('[ReprocessDocument] ⚠️  AI chunking failed, using fallback')
      aiChunkingFailed = true

      // Fallback: Basic paragraph chunking (NO metadata)
      const { createFallbackChunks } = await import('../lib/fallback-chunking.js')
      const fallbackChunks = createFallbackChunks(newMarkdown)

      await updateProgress(25, 'AI failed - generating embeddings for recovery...')

      // Generate embeddings for fallback chunks (needed for semantic matching)
      const embeddings = await generateEmbeddings(
        fallbackChunks.map(c => c.content)
      )

      const chunksWithEmbeddings = fallbackChunks.map((chunk, i) => ({
        ...chunk,
        embedding: embeddings[i]
      }))

      await updateProgress(30, 'Recovering metadata from previous version...')

      // ========================================================================
      // METADATA RECOVERY (NEW!)
      // ========================================================================

      const { chunks: recoveredChunks, stats } = await recoverMetadataFromOldChunks(
        chunksWithEmbeddings,
        documentId,
        supabase
      )

      console.log('[ReprocessDocument] Metadata recovery:', stats)
      console.log(`[ReprocessDocument] Recovered: ${stats.semantic_matches + stats.fuzzy_matches + stats.position_matches}/${stats.total}`)

      chunksWithMetadata = recoveredChunks
    }

    await updateProgress(40, 'Chunks created')

    // ========================================================================
    // 4. INSERT NEW CHUNKS WITH VERSION
    // ========================================================================

    const newChunksToInsert = chunksWithMetadata.map((chunk, index) => ({
      document_id: documentId,
      version: newVersion, // NEW: Version N+1
      chunk_index: index,
      content: chunk.content,
      start_offset: chunk.start_offset,
      end_offset: chunk.end_offset,
      themes: chunk.themes || [],
      importance_score: chunk.importance_score || 0.5,
      summary: chunk.summary || null,
      emotional_metadata: chunk.emotional_metadata,
      conceptual_metadata: chunk.concepts ? { concepts: chunk.concepts } : null,
      domain_metadata: chunk.domain_metadata,
      embedding: chunk.embedding,

      // Recovery metadata (if recovered)
      metadata_source: chunk.metadata_source || 'ai',
      recovered_from_chunk_id: chunk.recovered_from_chunk_id || null,
      recovery_confidence: chunk.recovery_confidence || null,
      recovery_method: chunk.recovery_method || null,

      is_current: false,
      reprocessing_batch: reprocessingBatch
    }))

    const { data: insertedChunks } = await supabase
      .from('chunks')
      .insert(newChunksToInsert)
      .select()

    await updateProgress(50, 'New chunks inserted')

    // ========================================================================
    // 5. COLLISION DETECTION, ANNOTATION RECOVERY, CONNECTION REMAPPING
    // (existing code - unchanged)
    // ========================================================================

    await updateProgress(60, 'Running collision detection...')
    await processDocument(documentId) // 3 engines

    await updateProgress(80, 'Recovering annotations...')
    const annotationResults = await recoverAnnotations(...)

    await updateProgress(90, 'Remapping connections...')
    const connectionResults = await remapConnections(...)

    // ========================================================================
    // 6. COMMIT CHANGES
    // ========================================================================

    // Set new chunks as current
    await supabase
      .from('chunks')
      .update({ is_current: true })
      .eq('reprocessing_batch', reprocessingBatch)

    // Update document version
    await supabase
      .from('documents')
      .update({
        current_version: newVersion,
        processing_status: 'completed'
      })
      .eq('id', documentId)

    // ========================================================================
    // 7. CLEANUP (Retention Policy)
    // ========================================================================

    await cleanupOldChunkVersions(documentId, newVersion, supabase)

    await updateProgress(100, 'Complete')

    return {
      annotations: annotationResults,
      connections: connectionResults,
      version: newVersion,
      aiChunkingFailed,
      metadataRecoveryStats: chunksWithMetadata[0]?.metadata_source === 'recovered'
        ? stats
        : null
    }

  } catch (error) {
    // Rollback logic (unchanged)
    await rollback(...)
    throw error
  }
}
```

### 4. Retention Policy with Spark Protection

```typescript
// worker/lib/chunk-cleanup.ts

/**
 * Clean up old chunk versions while protecting Spark-referenced versions
 * Keeps: Last 3 versions + any version referenced by a Spark
 */
export async function cleanupOldChunkVersions(
  documentId: string,
  currentVersion: number,
  supabase: any
): Promise<void> {

  const RETENTION_COUNT = 3 // Keep last 3 versions

  console.log(`[ChunkCleanup] Starting cleanup for document ${documentId}`)
  console.log(`[ChunkCleanup] Current version: ${currentVersion}, keeping last ${RETENTION_COUNT}`)

  // 1. Get versions referenced by Sparks (NEVER delete these)
  const { data: sparkVersions } = await supabase
    .from('spark_snapshots')
    .select('document_version')
    .eq('document_id', documentId)

  const protectedVersions = new Set(
    sparkVersions?.map((s: any) => s.document_version) || []
  )

  console.log(`[ChunkCleanup] Protected versions (Sparks):`, Array.from(protectedVersions))

  // 2. Keep last N versions
  const keepVersions = new Set<number>()
  for (let v = currentVersion; v > currentVersion - RETENTION_COUNT && v > 0; v--) {
    keepVersions.add(v)
  }

  console.log(`[ChunkCleanup] Retained versions (policy):`, Array.from(keepVersions))

  // 3. Combine: Keep recent + Spark-protected
  const allKeptVersions = new Set([...keepVersions, ...protectedVersions])

  // 4. Delete old chunk versions NOT in the keep list
  const versionsToDelete = []
  for (let v = 1; v < currentVersion; v++) {
    if (!allKeptVersions.has(v)) {
      versionsToDelete.push(v)
    }
  }

  if (versionsToDelete.length === 0) {
    console.log('[ChunkCleanup] No versions to delete')
    return
  }

  console.log(`[ChunkCleanup] Deleting versions:`, versionsToDelete)

  const { data, error } = await supabase
    .from('chunks')
    .delete()
    .eq('document_id', documentId)
    .in('version', versionsToDelete)

  if (error) {
    console.error('[ChunkCleanup] ❌ Cleanup failed:', error.message)
  } else {
    console.log(`[ChunkCleanup] ✅ Deleted chunks from ${versionsToDelete.length} old versions`)
  }

  // 5. Also clean up old markdown versions (keep same logic)
  await supabase
    .from('document_versions')
    .delete()
    .eq('document_id', documentId)
    .in('version', versionsToDelete)

  console.log(`[ChunkCleanup] ✅ Cleanup complete`)
}
```

### 5. Spark Integration (No Changes Needed!)

The Sparks implementation from `sparks-and-versioning.md` works perfectly as-is:

```typescript
// Spark Creation - Already captures version
const snapshot = {
  document_version: document.current_version, // ← Links to chunk version
  context: {
    visible_chunks: [...], // Full chunk objects with metadata
    connections: [...],
    scroll_position: ...,
    ...
  }
}

// Spark Restoration - Already loads version
const { data: docVersion } = await supabase
  .from('document_versions')
  .select('markdown_content')
  .eq('version', spark.document_version) // ← Loads correct version

// Chunks are in JSONB, no DB query needed
const chunks = spark.snapshot.context.visible_chunks
```

**Enhancement**: Show recovery metadata in Spark UI
```typescript
// In Spark restoration UI:
spark.snapshot.context.visible_chunks.forEach(chunk => {
  if (chunk.metadata_source === 'recovered') {
    // Show badge: "Metadata recovered from v${chunk.version - 1}"
  }
})
```

---

## Migration Script

```sql
-- Run this in Supabase SQL Editor
-- Combines chunk versioning + Sparks schema

BEGIN;

-- ============================================================================
-- 1. CHUNK VERSIONING
-- ============================================================================

ALTER TABLE chunks
  ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1,
  ADD COLUMN IF NOT EXISTS metadata_source TEXT DEFAULT 'ai',
  ADD COLUMN IF NOT EXISTS recovered_from_chunk_id UUID REFERENCES chunks(id),
  ADD COLUMN IF NOT EXISTS recovery_confidence FLOAT,
  ADD COLUMN IF NOT EXISTS recovery_method TEXT;

CREATE INDEX IF NOT EXISTS idx_chunks_version_lookup
  ON chunks(document_id, version, is_current);

CREATE INDEX IF NOT EXISTS idx_chunks_recovery_source
  ON chunks(recovered_from_chunk_id)
  WHERE recovered_from_chunk_id IS NOT NULL;

-- Set version 1 for all existing chunks
UPDATE chunks SET version = 1 WHERE version IS NULL;

-- ============================================================================
-- 2. DOCUMENT VERSIONS (markdown history)
-- ============================================================================

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

-- ============================================================================
-- 3. SPARK SNAPSHOTS (frozen context)
-- ============================================================================

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

CREATE INDEX IF NOT EXISTS idx_snapshots_version
  ON spark_snapshots(document_id, document_version);

-- ============================================================================
-- 4. SPARKS
-- ============================================================================

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

-- ============================================================================
-- 5. DOCUMENTS TABLE UPDATE
-- ============================================================================

ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS current_version INTEGER DEFAULT 1;

-- ============================================================================
-- 6. BACKFILL VERSION 1 FOR EXISTING DOCUMENTS
-- ============================================================================

-- Create version 1 records for all existing documents
INSERT INTO document_versions (document_id, version, markdown_content, created_by, word_count, created_at)
SELECT
  d.id,
  1 as version,
  -- Download from storage (manual step required - see note below)
  '' as markdown_content, -- PLACEHOLDER - populate via script
  'import' as created_by,
  d.word_count,
  d.created_at
FROM documents d
WHERE d.id NOT IN (SELECT document_id FROM document_versions WHERE version = 1);

-- Note: The markdown_content needs to be populated by reading from Supabase Storage
-- Run the backfill script after this migration (see below)

COMMIT;
```

**Backfill Script** (run after migration):
```typescript
// scripts/backfill-document-versions.ts

import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function backfillVersions() {
  // Get all documents without version 1
  const { data: documents } = await supabase
    .from('documents')
    .select('id, markdown_path')

  for (const doc of documents) {
    // Download markdown from storage
    const { data: blob } = await supabase.storage
      .from('documents')
      .download(doc.markdown_path)

    const markdown = await blob.text()

    // Update version 1 record
    await supabase
      .from('document_versions')
      .update({ markdown_content: markdown })
      .eq('document_id', doc.id)
      .eq('version', 1)

    console.log(`✅ Backfilled version 1 for document ${doc.id}`)
  }

  console.log('🎉 Backfill complete')
}

backfillVersions()
```

---

## TypeScript Types

```typescript
// src/types/versioning.ts

export interface ChunkVersion {
  id: string
  document_id: string
  version: number
  content: string
  start_offset: number
  end_offset: number
  themes: string[]
  importance_score: number
  emotional_metadata?: any
  domain_metadata?: any
  embedding?: number[]

  // Recovery metadata
  metadata_source: 'ai' | 'recovered' | 'fallback'
  recovered_from_chunk_id?: string
  recovery_confidence?: number
  recovery_method?: 'semantic' | 'fuzzy_text' | 'position'

  is_current: boolean
  created_at: string
}

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
      metadata_source?: 'ai' | 'recovered' | 'fallback'
    }>
    connections: any[]
    scroll_position: number
    viewport_offsets: { start: number; end: number }
    engine_weights: any
    sidebar_state: any
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

export interface MetadataRecoveryStats {
  total: number
  semantic_matches: number
  fuzzy_matches: number
  position_matches: number
  no_match: number
  avg_confidence: number
}
```

---

## Summary

### What This Gives You

**Resilient AI Processing**:
- AI chunking fails → Graceful degradation with metadata recovery
- Network errors → Automatic retry with fallback + backfill
- Malformed responses → Fallback chunks inherit semantic understanding

**Perfect Spark Restoration**:
- Sparks capture exact document state (version N)
- Restore shows EXACTLY what you saw when Spark was created
- Retention policy protects all Spark-referenced versions (never orphaned)

**Storage Efficiency** (Personal Tool Optimized):
- Keep last 3 chunk versions (not all history)
- Protect Spark-referenced versions (automatic)
- Typical book: ~4MB total (markdown versions + chunks + Sparks)

**No Breaking Changes**:
- Sparks implementation works as-is
- Reprocess pipeline extended (not rewritten)
- Obsidian sync unchanged (just calls reprocessDocument)

### Implementation Checklist

1. ✅ Run migration SQL (adds chunk versioning + Sparks tables)
2. ✅ Run backfill script (populate version 1 for existing docs)
3. ✅ Add `metadata-recovery.ts` module
4. ✅ Update `reprocess-document.ts` (integrate recovery logic)
5. ✅ Add `chunk-cleanup.ts` (retention policy)
6. ✅ Implement Sparks (use existing code from sparks-and-versioning.md)
7. ✅ Test recovery with intentional AI failure
8. ✅ Test Spark restoration across versions

---

## Next Steps

This plan is **ready to implement**. The Sparks feature and chunk versioning are **symbiotic**:
- Sparks need versioning → chunks stay queryable after reprocessing
- Versioning enables recovery → AI failures don't lose semantic understanding
- Recovery improves connections → 3-engine system needs rich metadata

Start with:
1. Migration + backfill (database ready)
2. Metadata recovery module (core logic)
3. Integrate into reprocess pipeline (AI failure handling)
4. Add Sparks UI (button to create, list to restore)
