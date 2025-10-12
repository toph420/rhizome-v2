# PRP: Cached Chunks Table Implementation

**Status:** Ready for Implementation
**Priority:** High (Fixes LOCAL mode resume/reprocessing)
**Estimated Effort:** 10-12 hours
**Created:** 2025-10-11
**Confidence Score:** 9.5/10

---

## Executive Summary

### Problem Statement

**Current Bug:** LOCAL mode processing fails when resuming from review checkpoints or reprocessing documents, falling back to expensive Gemini API calls ($0.50/document).

**Root Cause:** Docling chunks cached in `background_jobs.metadata` (JSONB) have lifecycle mismatch:
- Resume operations query wrong job (`continue-processing` vs `process_document`)
- Jobs pruned after 90 days, losing cached chunks permanently
- Cache is job-level metadata, but chunks are document-level data

**Example Failure:**
```
[ContinueProcessing] Processing mode: LOCAL
[ContinueProcessing] LOCAL mode but no cached Docling chunks found
[ContinueProcessing] Falling back to CLOUD mode for this document
```

### Solution

Create dedicated `cached_chunks` table with document-level persistence:
- Survives job deletion (90-day pruning)
- Enables $0.00 reprocessing months/years later
- Simple document-based queries (no job traversal)
- Supports markdown hash validation for cache invalidation

### Business Value

**Cost Savings:**
- Reprocessing with cache: **$0.00**
- Reprocessing without cache: **$0.50** (500-page book)
- 100 reprocesses: **$50 saved**
- 1000 reprocesses: **$500 saved**

**Workflow Benefits:**
- Zero-cost iterative editing (Obsidian workflow)
- Structural metadata preserved through edits (pages, headings, bboxes)
- 100% recovery guarantee (bulletproof matching never fails)
- No user-facing changes (transparent optimization)

### Scope

**Files Modified:** 7 files
**Files Created:** 2 files
**Code Changes:** ~300 lines

---

## Background & Context

### Current Implementation

Docling chunks cached in job metadata during processing:

**Location:** `worker/processors/pdf-processor.ts` lines 123-135
```typescript
// Phase 2: Cache extraction result in job metadata
this.job.metadata = {
  ...this.job.metadata,
  cached_extraction: {
    markdown: extractionResult.markdown,
    structure: extractionResult.structure,
    doclingChunks: extractionResult.chunks // Required for bulletproof matching
  }
}
```

**Resume Handler:** `worker/handlers/continue-processing.ts` lines 170-189
```typescript
// Get cached extraction from original process_document job
const { data: originalJob } = await supabase
  .from('background_jobs')
  .select('metadata')
  .eq('entity_id', documentId)
  .eq('job_type', 'process_document')  // ⚠️ Wrong job type!
  .order('created_at', { ascending: false })
  .limit(1)
  .single()

cachedDoclingChunks = originalJob?.metadata?.cached_extraction?.doclingChunks
```

### Why Current Approach Fails

**Problem 1: Job Type Mismatch**
- Resume creates `continue-processing` job
- Cache lookup queries `process_document` job
- Result: Cache miss even though data exists

**Problem 2: Job Pruning**
- Jobs deleted after 90 days (standard cleanup)
- Cached chunks lost permanently
- Reprocessing requires expensive Gemini extraction

**Problem 3: Lifecycle Mismatch**
- Chunks are document-level data (permanent)
- Jobs are execution-level metadata (temporary)
- Wrong abstraction layer

### Local Processing Pipeline Overview

**Rhizome V2 Processing Modes:**
- **CLOUD mode:** Gemini for extraction/chunking (~$0.50 per 500-page book)
- **LOCAL mode:** Docling + Ollama + Transformers.js (100% local, $0.00 per book)

**LOCAL Mode Stages:**
1. **Docling Extraction:** PDF/EPUB → HybridChunker → chunks with structural metadata
2. **Ollama Cleanup:** Markdown cleaning (optional, with OOM fallback)
3. **Bulletproof Matching:** 5-layer system remaps chunks to cleaned markdown (100% recovery)
4. **PydanticAI Metadata:** Structured metadata extraction (themes, concepts, importance)
5. **Local Embeddings:** Transformers.js generates 768d vectors

**Key Innovation:** Cached chunks enable zero-cost editing workflow:
```
Initial Processing (ONE TIME): PDF → Docling → Cache chunks ($0.00)
User Edits Document (INFINITE): Edit markdown in Obsidian
Reprocess with Cache (INFINITE): Bulletproof matching → $0.00 cost
```

---

## Requirements

### Functional Requirements

**FR1: Persistent Cache Storage**
- Store Docling extraction results in dedicated `cached_chunks` table
- One cache per document (UNIQUE constraint on `document_id`)
- Cache includes: chunks array, structure, extraction metadata
- Cache survives job deletion (document-level lifecycle)

**FR2: Cache Validation**
- Generate SHA256 hash of source markdown
- Store hash with cached chunks
- Validate hash on cache load (detect markdown changes)
- Return null if hash mismatch (invalidate stale cache)

**FR3: Processor Integration**
- PDF processor saves cache after Docling extraction
- EPUB processor saves cache after Docling extraction
- Cache save is non-fatal (warning logged if fails)
- Processing continues even if cache save fails

**FR4: Handler Integration**
- Continue-processing handler loads cache by document_id
- Reprocess-document handler loads cache by document_id
- Graceful fallback to CLOUD mode if cache missing
- Clear logging of cache hits/misses

**FR5: Bulletproof Matching Integration**
- Pass cached chunks to bulletproofMatch() function
- Preserve all structural metadata (pages, headings, bboxes)
- Track confidence scores (exact, high, medium, synthetic)
- Support progress callbacks for UI updates

### Non-Functional Requirements

**NFR1: Performance**
- Cache lookup: <2 seconds (indexed by document_id)
- Cache write: <1 second (JSONB upsert)
- No impact on existing CLOUD mode performance

**NFR2: Reliability**
- Graceful degradation (fallback if cache unavailable)
- Transaction-safe (no partial states)

**NFR3: Maintainability**
- Clear separation of concerns (cache layer, processing layer)
- Comprehensive logging (cache hits, misses, invalidations)
- Type-safe interfaces (TypeScript types for all operations)

**NFR4: Storage**
- JSONB storage for chunks array (efficient compression)
- Indexes for fast document lookup
- Cascade delete when document deleted (automatic cleanup)

---

## Technical Design

### Database Schema

**Migration File:** `supabase/migrations/046_cached_chunks_table.sql`

```sql
-- =====================================================================
-- Migration 046: Cached Chunks Table
-- =====================================================================
-- Purpose: Persistent cache for Docling extraction results
-- Replaces: Temporary storage in background_jobs.metadata
-- Benefits: Document-level persistence, simple queries, zero reprocessing cost
-- Related: Local Processing Pipeline (Phase 2-4)
-- =====================================================================

-- Create cached_chunks table
CREATE TABLE IF NOT EXISTS cached_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,

  -- Extraction metadata
  extraction_mode TEXT NOT NULL CHECK (extraction_mode IN ('pdf', 'epub')),
  markdown_hash TEXT NOT NULL,
  docling_version TEXT,

  -- Cached data (JSONB for full DoclingChunk structure)
  chunks JSONB NOT NULL,
  structure JSONB NOT NULL,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Ensure one cache per document
  UNIQUE(document_id)
);

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_cached_chunks_document ON cached_chunks(document_id);
CREATE INDEX IF NOT EXISTS idx_cached_chunks_mode ON cached_chunks(extraction_mode);
CREATE INDEX IF NOT EXISTS idx_cached_chunks_created ON cached_chunks(created_at);

-- Add updated_at trigger (reuses existing function)
CREATE TRIGGER update_cached_chunks_updated_at
  BEFORE UPDATE ON cached_chunks
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Add comments for documentation
COMMENT ON TABLE cached_chunks IS 'Persistent cache for Docling extraction results. Replaces job.metadata cache. Enables zero-cost reprocessing with bulletproof matching.';
COMMENT ON COLUMN cached_chunks.document_id IS 'Document this cache belongs to (one cache per document)';
COMMENT ON COLUMN cached_chunks.extraction_mode IS 'Document type: pdf or epub (different Docling processing paths)';
COMMENT ON COLUMN cached_chunks.markdown_hash IS 'SHA256 hash of source markdown to detect changes and invalidate stale cache';
COMMENT ON COLUMN cached_chunks.docling_version IS 'Docling library version for compatibility tracking (optional)';
COMMENT ON COLUMN cached_chunks.chunks IS 'Array of DoclingChunk objects with structural metadata (pages, headings, bboxes)';
COMMENT ON COLUMN cached_chunks.structure IS 'DoclingStructure object with headings array and total_pages';
COMMENT ON COLUMN cached_chunks.created_at IS 'When cache was first created (initial extraction)';
COMMENT ON COLUMN cached_chunks.updated_at IS 'When cache was last updated (reprocessing)';

-- Disable RLS for service role operations (single-user personal tool)
ALTER TABLE cached_chunks DISABLE ROW LEVEL SECURITY;

COMMENT ON TABLE cached_chunks IS 'RLS disabled - service role has full access. Enable with: ALTER TABLE cached_chunks ENABLE ROW LEVEL SECURITY';
```

**Schema Rationale:**

| Column | Type | Purpose | Notes |
|--------|------|---------|-------|
| `document_id` | UUID | Primary reference | UNIQUE constraint ensures one cache per document |
| `extraction_mode` | TEXT | Track PDF vs EPUB | Different processing paths, useful for debugging |
| `markdown_hash` | TEXT | Cache invalidation | SHA256 of source markdown, detect edits |
| `docling_version` | TEXT | Compatibility | Track Docling version for future migrations |
| `chunks` | JSONB | DoclingChunk[] | Full structural metadata (pages, headings, bboxes) |
| `structure` | JSONB | DoclingStructure | Headings array, total_pages for TOC |

**Index Strategy:**
- `idx_cached_chunks_document`: Primary lookup (99% of queries)
- `idx_cached_chunks_mode`: Filter by extraction type (analytics)
- `idx_cached_chunks_created`: Cleanup queries (age-based pruning)

### Type Definitions

**File:** `worker/types/cached-chunks.ts` (NEW FILE)

```typescript
import type { DoclingChunk, DoclingStructure } from '../lib/docling-extractor.js'

/**
 * Cached Docling extraction result stored in database.
 * Replaces temporary storage in background_jobs.metadata.
 *
 * Lifecycle: Created once per document, survives job deletion.
 * Invalidation: Markdown hash mismatch triggers cache invalidation.
 */
export interface CachedChunksRow {
  id: string
  document_id: string
  extraction_mode: 'pdf' | 'epub'
  markdown_hash: string
  docling_version: string | null
  chunks: DoclingChunk[]  // Full structural metadata preserved
  structure: DoclingStructure
  created_at: string
  updated_at: string
}

/**
 * Input for creating/updating cached chunks.
 * Used by processors after Docling extraction.
 */
export interface CachedChunksInput {
  document_id: string
  extraction_mode: 'pdf' | 'epub'
  markdown_hash: string
  docling_version?: string
  chunks: DoclingChunk[]
  structure: DoclingStructure
}

/**
 * Result from loading cached chunks.
 * Null if cache doesn't exist or hash mismatch.
 */
export interface CachedChunksResult {
  chunks: DoclingChunk[]
  structure: DoclingStructure
  extraction_mode: 'pdf' | 'epub'
  created_at: string
}
```

**Type Reference: DoclingChunk**

From `worker/lib/docling-extractor.ts` lines 24-54:

```typescript
/**
 * Chunk structure from Docling HybridChunker.
 * Contains content and rich structural metadata.
 */
export interface DoclingChunk {
  /** Chunk index in document (0-based) */
  index: number
  /** Chunk text content */
  content: string
  /** Rich metadata from Docling */
  meta: {
    /** Starting page number (1-based) */
    page_start?: number
    /** Ending page number (1-based) */
    page_end?: number
    /** Heading path (e.g., ["Chapter 1", "Section 1.1"]) */
    heading_path?: string[]
    /** Heading level (depth in TOC) */
    heading_level?: number
    /** Section marker (for EPUB support) */
    section_marker?: string
    /** Bounding boxes for PDF coordinate highlighting */
    bboxes?: Array<{
      page: number
      l: number  // left
      t: number  // top
      r: number  // right
      b: number  // bottom
    }>
  }
}
```

**Type Reference: DoclingStructure**

From `worker/lib/docling-extractor.ts` lines 56-71:

```typescript
/**
 * Document structure extracted from Docling.
 * Provides heading hierarchy for table of contents.
 */
export interface DoclingStructure {
  /** Extracted headings with hierarchy */
  headings: Array<{
    level: number
    text: string
    page: number | null
  }>
  /** Total number of pages in document */
  total_pages: number
  /** Document sections (reserved for future use) */
  sections: any[]
}
```

### Utility Layer

**File:** `worker/lib/cached-chunks.ts` (NEW FILE)

```typescript
import { createClient } from '@supabase/supabase-js'
import { createHash } from 'crypto'
import type { CachedChunksInput, CachedChunksResult } from '../types/cached-chunks.js'
import type { DoclingChunk, DoclingStructure } from './docling-extractor.js'

/**
 * Generate SHA256 hash of markdown for cache validation.
 * Used to detect when source document has changed.
 *
 * @param markdown - Source markdown content
 * @returns Hex-encoded SHA256 hash
 */
export function hashMarkdown(markdown: string): string {
  return createHash('sha256').update(markdown).digest('hex')
}

/**
 * Save Docling extraction results to cache.
 * Upserts on document_id (UNIQUE constraint).
 * Non-fatal: Logs warning if save fails but doesn't throw.
 *
 * @param supabase - Supabase client (service role)
 * @param input - Cached chunks data
 */
export async function saveCachedChunks(
  supabase: ReturnType<typeof createClient>,
  input: CachedChunksInput
): Promise<void> {
  try {
    const { error } = await supabase
      .from('cached_chunks')
      .upsert({
        document_id: input.document_id,
        extraction_mode: input.extraction_mode,
        markdown_hash: input.markdown_hash,
        docling_version: input.docling_version || null,
        chunks: input.chunks,
        structure: input.structure,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'document_id'
      })

    if (error) {
      console.warn(`[CachedChunks] Failed to save cache for ${input.document_id}:`, error.message)
      return // Non-fatal: processing continues even if cache save fails
    }

    console.log(`[CachedChunks] ✓ Saved ${input.chunks.length} chunks for document ${input.document_id}`)
    console.log(`[CachedChunks]   Mode: ${input.extraction_mode}, Hash: ${input.markdown_hash.slice(0, 8)}...`)

  } catch (error) {
    console.warn(`[CachedChunks] Exception saving cache:`, error)
    // Non-fatal: continue processing
  }
}

/**
 * Load cached chunks for document.
 * Validates markdown hash to ensure cache is current.
 * Returns null if cache doesn't exist or hash mismatch.
 *
 * @param supabase - Supabase client (service role)
 * @param documentId - Document UUID
 * @param currentMarkdownHash - Hash of current markdown for validation
 * @returns Cached chunks or null if invalid/missing
 */
export async function loadCachedChunks(
  supabase: ReturnType<typeof createClient>,
  documentId: string,
  currentMarkdownHash: string
): Promise<CachedChunksResult | null> {
  try {
    const { data, error } = await supabase
      .from('cached_chunks')
      .select('*')
      .eq('document_id', documentId)
      .single()

    if (error || !data) {
      console.log(`[CachedChunks] No cache found for document ${documentId}`)
      return null
    }

    // Validate markdown hasn't changed
    if (data.markdown_hash !== currentMarkdownHash) {
      console.warn(`[CachedChunks] ⚠️  Cache invalid (markdown changed) for document ${documentId}`)
      console.warn(`[CachedChunks]   Cached: ${data.markdown_hash.slice(0, 8)}... | Current: ${currentMarkdownHash.slice(0, 8)}...`)
      return null
    }

    console.log(`[CachedChunks] ✓ Loaded ${data.chunks.length} cached chunks for document ${documentId}`)
    console.log(`[CachedChunks]   Mode: ${data.extraction_mode}, Created: ${data.created_at}`)

    return {
      chunks: data.chunks as DoclingChunk[],
      structure: data.structure as DoclingStructure,
      extraction_mode: data.extraction_mode,
      created_at: data.created_at
    }

  } catch (error) {
    console.error(`[CachedChunks] Exception loading cache:`, error)
    return null
  }
}

/**
 * Delete cached chunks for document.
 * Used for manual cache invalidation or cleanup.
 *
 * @param supabase - Supabase client (service role)
 * @param documentId - Document UUID
 */
export async function deleteCachedChunks(
  supabase: ReturnType<typeof createClient>,
  documentId: string
): Promise<void> {
  const { error } = await supabase
    .from('cached_chunks')
    .delete()
    .eq('document_id', documentId)

  if (error) {
    console.warn(`[CachedChunks] Failed to delete cache for ${documentId}:`, error.message)
  } else {
    console.log(`[CachedChunks] ✓ Deleted cache for document ${documentId}`)
  }
}
```

### Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                    Document Processing Flow                      │
└─────────────────────────────────────────────────────────────────┘

Initial Processing (ONE TIME)
┌──────────┐   ┌──────────┐   ┌──────────────┐   ┌──────────────┐
│ PDF/EPUB │──▶│ Docling  │──▶│ HybridChunker│──▶│ 382 chunks   │
└──────────┘   └──────────┘   └──────────────┘   └──────┬───────┘
                                                          │
                                                          ▼
                                              ┌────────────────────┐
                                              │  saveCachedChunks  │
                                              │   (utility layer)  │
                                              └─────────┬──────────┘
                                                        │
                                                        ▼
                                           ┌────────────────────────┐
                                           │  cached_chunks table   │
                                           │  • document_id (PK)    │
                                           │  • chunks (JSONB)      │
                                           │  • structure (JSONB)   │
                                           │  • markdown_hash       │
                                           └────────────┬───────────┘
                                                        │
                                         Persists indefinitely ✓
                                         Survives job deletion ✓

Resume/Reprocess (INFINITE TIMES, $0.00 COST)
┌──────────────┐   ┌──────────────┐   ┌─────────────────┐
│ User edits   │──▶│ Sync/Resume  │──▶│ loadCachedChunks│
│ in Obsidian  │   │ triggered    │   │ (utility layer) │
└──────────────┘   └──────────────┘   └────────┬────────┘
                                                │
                                                ▼
                                   ┌─────────────────────────┐
                                   │  Hash Validation        │
                                   │  markdown_hash match?   │
                                   └───────┬─────────────────┘
                                           │
                            ┌──────────────┴───────────────┐
                            │ YES                          │ NO
                            ▼                              ▼
                  ┌──────────────────┐          ┌──────────────────┐
                  │  Bulletproof     │          │  Fallback to     │
                  │  Matching        │          │  CLOUD mode      │
                  │  $0.00 cost ✓    │          │  $0.50 cost ⚠    │
                  └──────────────────┘          └──────────────────┘
                            │
                            ▼
                  ┌──────────────────────────┐
                  │  5-Layer Recovery        │
                  │  • Exact match (L1)      │
                  │  • Fuzzy match (L1)      │
                  │  • Embeddings (L2)       │
                  │  • LLM assist (L3)       │
                  │  • Interpolation (L4)    │
                  │  100% recovery ✓         │
                  └──────────────────────────┘
                            │
                            ▼
                  ┌──────────────────────────┐
                  │  Structural Metadata     │
                  │  Preserved               │
                  │  • Page numbers ✓        │
                  │  • Headings ✓            │
                  │  • Bboxes ✓              │
                  └──────────────────────────┘
```

### Integration Points

**1. PDF Processor** (`worker/processors/pdf-processor.ts`)

**Location:** Line ~126 (after Docling extraction)

**BEFORE:**
```typescript
// Phase 2: Cache extraction result in job metadata
this.job.metadata = {
  ...this.job.metadata,
  cached_extraction: {
    markdown: extractionResult.markdown,
    structure: extractionResult.structure,
    doclingChunks: extractionResult.chunks
  }
}
```

**AFTER:**
```typescript
// Phase 2: Save extraction to cached_chunks table for reprocessing
await saveCachedChunks(this.supabase, {
  document_id: this.job.document_id!,
  extraction_mode: 'pdf',
  markdown_hash: hashMarkdown(extractionResult.markdown),
  docling_version: '2.55.1',
  chunks: extractionResult.chunks,
  structure: extractionResult.structure
})
```

**Imports to Add:**
```typescript
import { saveCachedChunks, hashMarkdown } from '../lib/cached-chunks.js'
```

**2. EPUB Processor** (`worker/processors/epub-processor.ts`)

**Location:** Line ~118 (after Docling extraction)

**BEFORE:**
```typescript
// Phase 5: Cache extraction result in job metadata
this.job.metadata = {
  ...this.job.metadata,
  cached_extraction: {
    markdown: result.markdown,
    structure: result.structure,
    doclingChunks: result.chunks,
    epubMetadata: result.epubMetadata
  }
}
```

**AFTER:**
```typescript
// Phase 5: Save extraction to cached_chunks table for reprocessing
await saveCachedChunks(this.supabase, {
  document_id: this.job.document_id!,
  extraction_mode: 'epub',
  markdown_hash: hashMarkdown(result.markdown),
  docling_version: '2.55.1',
  chunks: result.chunks,
  structure: result.structure
})
```

**Imports to Add:**
```typescript
import { saveCachedChunks, hashMarkdown } from '../lib/cached-chunks.js'
```

**3. Continue Processing Handler** (`worker/handlers/continue-processing.ts`)

**Location:** Lines 170-189 (cache loading logic)

**BEFORE:**
```typescript
// Get cached extraction from original process_document job
let cachedDoclingChunks = null
if (isLocalMode) {
  const { data: originalJob } = await supabase
    .from('background_jobs')
    .select('metadata')
    .eq('entity_id', documentId)
    .eq('job_type', 'process_document')
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  cachedDoclingChunks = originalJob?.metadata?.cached_extraction?.doclingChunks

  if (!cachedDoclingChunks) {
    console.warn('[ContinueProcessing] LOCAL mode but no cached Docling chunks found')
    console.warn('[ContinueProcessing] Falling back to CLOUD mode for this document')
  } else {
    console.log(`[ContinueProcessing] Loaded ${cachedDoclingChunks.length} cached Docling chunks from original job`)
  }
}
```

**AFTER:**
```typescript
// Load cached chunks from cached_chunks table
let cachedDoclingChunks = null
if (isLocalMode) {
  const markdownHash = hashMarkdown(markdown)
  const cached = await loadCachedChunks(supabase, documentId, markdownHash)

  if (!cached) {
    console.warn('[ContinueProcessing] LOCAL mode but no cached chunks found (or hash mismatch)')
    console.warn('[ContinueProcessing] Falling back to CLOUD mode for this document')
  } else {
    cachedDoclingChunks = cached.chunks
    console.log(`[ContinueProcessing] Loaded ${cachedDoclingChunks.length} cached chunks (${cached.extraction_mode})`)
  }
}
```

**Imports to Add:**
```typescript
import { loadCachedChunks, hashMarkdown } from '../lib/cached-chunks.js'
```

**4. Reprocess Document Handler** (`worker/handlers/reprocess-document.ts`)

**Location:** Lines 103-117 (hardcoded Gemini chunking)

**MODIFICATION:** Add LOCAL mode path before existing CLOUD mode logic

**NEW CODE TO INSERT:**
```typescript
// Stage 4: Chunking - Check for LOCAL mode with cached chunks
let newChunks: any[]

const isLocalMode = process.env.PROCESSING_MODE === 'local'
console.log(`[ReprocessDocument] Processing mode: ${isLocalMode ? 'LOCAL' : 'CLOUD'}`)

if (isLocalMode) {
  // LOCAL MODE: Attempt to load cached chunks for bulletproof matching
  console.log('[ReprocessDocument] LOCAL MODE: Attempting to load cached chunks')
  await updateProgress(25, 'Loading cached chunks...')

  const markdownHash = hashMarkdown(newMarkdown)
  const cached = await loadCachedChunks(supabase, documentId, markdownHash)

  if (cached) {
    console.log(`[ReprocessDocument] Found ${cached.chunks.length} cached chunks (${cached.extraction_mode})`)
    await updateProgress(30, 'Running bulletproof matching...')

    // Import bulletproof matching utilities
    const { bulletproofMatch } = await import('../lib/local/bulletproof-matcher.js')
    const { extractMetadataBatch } = await import('../lib/chunking/pydantic-metadata.js')
    const { generateEmbeddingsLocal } = await import('../lib/local/embeddings-local.js')
    const { generateEmbeddings } = await import('../lib/embeddings.js')

    // Step 1: Bulletproof matching (remap cached chunks to new markdown)
    const { chunks: rematchedChunks, stats } = await bulletproofMatch(
      newMarkdown,
      cached.chunks,
      {
        onProgress: async (layerNum, matched, remaining) => {
          console.log(`[ReprocessDocument] Layer ${layerNum}: ${matched} matched, ${remaining} remaining`)
          const percent = 30 + Math.floor((layerNum / 5) * 15)
          await updateProgress(percent, `Matching layer ${layerNum}/5`)
        }
      }
    )

    console.log(`[ReprocessDocument] Matching complete:`)
    console.log(`  Exact: ${stats.exact}/${stats.total} (${(stats.exact / stats.total * 100).toFixed(1)}%)`)
    console.log(`  Synthetic: ${stats.synthetic}/${stats.total}`)

    await updateProgress(50, `${rematchedChunks.length} chunks matched`)

    // Step 2: Metadata enrichment (PydanticAI + Ollama)
    console.log('[ReprocessDocument] Enriching metadata with PydanticAI + Ollama')
    await updateProgress(55, 'Enriching metadata...')

    let enrichedChunks = rematchedChunks.map((result, idx) => ({
      document_id: documentId,
      content: result.chunk.content,
      chunk_index: idx,
      start_offset: result.start_offset,
      end_offset: result.end_offset,
      word_count: result.chunk.content.split(/\s+/).filter(w => w.length > 0).length,
      // Preserve Docling structural metadata
      page_start: result.chunk.meta.page_start || null,
      page_end: result.chunk.meta.page_end || null,
      heading_level: result.chunk.meta.heading_level || null,
      heading_path: result.chunk.meta.heading_path || null,
      section_marker: result.chunk.meta.section_marker || null,
      bboxes: result.chunk.meta.bboxes || null,
      position_confidence: result.confidence,
      position_method: result.method,
      position_validated: false,
      // Default metadata (will be enriched)
      themes: [],
      importance_score: 0.5,
      summary: null,
      emotional_metadata: { polarity: 0, primaryEmotion: 'neutral', intensity: 0 },
      conceptual_metadata: { concepts: [] },
      domain_metadata: null,
      metadata_extracted_at: null
    }))

    // Batch metadata extraction (10 chunks at a time)
    try {
      const BATCH_SIZE = 10
      const enrichedResults = []

      for (let i = 0; i < enrichedChunks.length; i += BATCH_SIZE) {
        const batch = enrichedChunks.slice(i, i + BATCH_SIZE)
        const batchInput = batch.map(chunk => ({
          id: `${documentId}-${chunk.chunk_index}`,
          content: chunk.content
        }))

        const metadataMap = await extractMetadataBatch(batchInput)

        for (const chunk of batch) {
          const chunkId = `${documentId}-${chunk.chunk_index}`
          const metadata = metadataMap.get(chunkId)

          if (metadata) {
            enrichedResults.push({
              ...chunk,
              themes: metadata.themes,
              importance_score: metadata.importance,
              summary: metadata.summary,
              emotional_metadata: {
                polarity: metadata.emotional.polarity,
                primaryEmotion: metadata.emotional.primaryEmotion,
                intensity: metadata.emotional.intensity
              },
              conceptual_metadata: { concepts: metadata.concepts },
              domain_metadata: { primaryDomain: metadata.domain, confidence: 0.8 },
              metadata_extracted_at: new Date().toISOString()
            })
          } else {
            enrichedResults.push(chunk)
          }
        }

        const progress = 55 + Math.floor((i / enrichedChunks.length) * 10)
        await updateProgress(progress, `Enriched ${enrichedResults.length}/${enrichedChunks.length}`)
      }

      enrichedChunks = enrichedResults
      console.log('[ReprocessDocument] Metadata enrichment complete')
      await updateProgress(65, 'Metadata enriched')

    } catch (error) {
      console.error('[ReprocessDocument] Metadata enrichment failed:', error)
      // Continue with default metadata
    }

    // Step 3: Local embeddings
    console.log('[ReprocessDocument] Generating local embeddings')
    await updateProgress(68, 'Generating embeddings...')

    let embeddings
    try {
      const chunkContents = enrichedChunks.map(c => c.content)
      embeddings = await generateEmbeddingsLocal(chunkContents)
      console.log('[ReprocessDocument] Local embeddings complete')
    } catch (error) {
      console.error('[ReprocessDocument] Local embeddings failed, trying Gemini fallback')
      const chunkContents = enrichedChunks.map(c => c.content)
      embeddings = await generateEmbeddings(chunkContents)
    }

    // Prepare for insertion
    newChunks = enrichedChunks.map((chunk, idx) => ({
      ...chunk,
      embedding: embeddings[idx],
      is_current: false,
      reprocessing_batch: reprocessingBatch
    }))

    console.log(`[ReprocessDocument] LOCAL MODE complete: ${newChunks.length} chunks ready`)
    console.log(`[ReprocessDocument] Cost: $0.00 (bulletproof matching used cached chunks)`)
    await updateProgress(73, 'Local processing complete')

  } else {
    console.warn('[ReprocessDocument] No cached chunks found - falling back to CLOUD mode')
    // Fall through to existing CLOUD mode logic below
  }
}

// Existing CLOUD mode logic continues here (lines 106-160)
if (!isLocalMode || !newChunks) {
  console.log('[ReprocessDocument] CLOUD MODE: Using AI semantic chunking')
  // ... existing Gemini chunking code ...
}
```

**Imports to Add:**
```typescript
import { loadCachedChunks, hashMarkdown } from '../lib/cached-chunks.js'
```

---

## Implementation Plan

### Phase 1: Database Foundation (2 hours)

**Task 1.1: Create Migration File**
- File: `supabase/migrations/046_cached_chunks_table.sql`
- Copy SQL from Technical Design section above
- Verify migration number (046 is next after 045)

**Task 1.2: Create Type Definitions**
- File: `worker/types/cached-chunks.ts`
- Copy TypeScript types from Technical Design section
- Import DoclingChunk and DoclingStructure from docling-extractor.ts

**Task 1.3: Validate Migration**
```bash
npx supabase db reset
```

**Validation:**
```bash
psql -h localhost -p 54322 -U postgres -d postgres -c "\d cached_chunks"
# Expected output:
# - Table with 9 columns
# - 3 indexes (idx_cached_chunks_document, idx_cached_chunks_mode, idx_cached_chunks_created)
# - UNIQUE constraint on document_id
# - Trigger: update_cached_chunks_updated_at
```

**Success Criteria:**
- ✅ Migration applies without errors
- ✅ Table structure matches schema
- ✅ Indexes created
- ✅ RLS disabled (confirmed in table metadata)

---

### Phase 2: Utility Layer (1.5 hours)

**Task 2.1: Create Utility Module**
- File: `worker/lib/cached-chunks.ts`
- Copy utility functions from Technical Design section
- Import crypto.createHash for markdown hashing

**Task 2.2: Implement hashMarkdown()**
- Single line: `createHash('sha256').update(markdown).digest('hex')`
- Test with sample markdown, verify consistent output

**Task 2.3: Implement saveCachedChunks()**
- Supabase upsert with `onConflict: 'document_id'`
- Non-fatal error handling (console.warn, continue)
- Comprehensive logging (chunk count, hash prefix)

**Task 2.4: Implement loadCachedChunks()**
- Query by document_id with .single()
- Hash validation (return null if mismatch)
- Type casting for JSONB columns (as DoclingChunk[], as DoclingStructure)

**Task 2.5: Implement deleteCachedChunks()**
- Simple delete query by document_id
- Log success/failure

**Validation:**
```bash
cd worker && npm run build
# Expected: Zero TypeScript errors
```

**Success Criteria:**
- ✅ All functions compile without errors
- ✅ Crypto import works (Node.js built-in)
- ✅ Type imports resolve correctly
- ✅ ESM imports use .js extension

---

### Phase 3: Processor Integration (2 hours)

**Task 3.1: Update PDF Processor**
- File: `worker/processors/pdf-processor.ts`
- Location: Line ~126 (after Docling extraction)
- Replace job.metadata cache with saveCachedChunks() call
- Add imports: `import { saveCachedChunks, hashMarkdown } from '../lib/cached-chunks.js'`

**Task 3.2: Update EPUB Processor**
- File: `worker/processors/epub-processor.ts`
- Location: Line ~118 (after Docling extraction)
- Same replacement as PDF processor
- Add same imports

**Task 3.3: Test Processor Integration**
```bash
# Process test PDF in LOCAL mode
# Verify cached_chunks row created
```

**Validation:**
```bash
cd worker && npm run build
npm run lint
# Expected: Zero errors
```

**Database Validation:**
```bash
psql -h localhost -p 54322 -U postgres -d postgres -c "
  SELECT document_id, extraction_mode, chunk_count,
         LEFT(markdown_hash, 8) as hash_prefix, created_at
  FROM cached_chunks
  ORDER BY created_at DESC
  LIMIT 5;
"
# Expected: Recent rows with correct data
```

**Success Criteria:**
- ✅ PDF processor saves cache after extraction
- ✅ EPUB processor saves cache after extraction
- ✅ Cache save is non-fatal (processing continues if fails)
- ✅ Hash generated correctly
- ✅ Chunk count matches extraction result

---

### Phase 4: Handler Integration (3 hours)

**Task 4.1: Update Continue Processing Handler**
- File: `worker/handlers/continue-processing.ts`
- Location: Lines 170-189 (cache query)
- Replace job metadata query with loadCachedChunks() call
- Add fallback logic (CLOUD mode if cache miss)
- Add imports: `import { loadCachedChunks, hashMarkdown } from '../lib/cached-chunks.js'`

**Task 4.2: Update Reprocess Document Handler**
- File: `worker/handlers/reprocess-document.ts`
- Location: Line ~103 (before Gemini chunking)
- Insert LOCAL mode path with bulletproof matching
- Use complete code from Technical Design section (reprocess integration)
- Add imports: `import { loadCachedChunks, hashMarkdown } from '../lib/cached-chunks.js'`

**Task 4.3: Test Resume Workflow**
```bash
# Process document with reviewDoclingExtraction=true
# Make small edits in markdown
# Resume processing
# Verify: Cache loaded, bulletproof matching runs, $0.00 cost
```

**Task 4.4: Test Reprocess Workflow**
```bash
# Process document fully
# Make heavy edits (30% content change)
# Reprocess document
# Verify: Cache loaded, bulletproof matching runs, structural metadata preserved
```

**Validation:**
```bash
cd worker && npm run test:integration -- local-processing.test.ts
# Expected: All tests pass
```

**Success Criteria:**
- ✅ Resume from checkpoint loads cache successfully
- ✅ Reprocessing loads cache successfully
- ✅ Hash validation works (rejects stale cache)
- ✅ Graceful fallback to CLOUD mode if cache missing
- ✅ Bulletproof matching integration works
- ✅ Structural metadata preserved through reprocessing
- ✅ No Gemini API calls when cache hit

---

### Phase 5: Testing & Documentation (2 hours)

**Task 5.1: Integration Tests**

Create test file: `worker/tests/integration/cached-chunks.test.ts`

```typescript
/**
 * Integration tests for cached chunks table.
 * Validates cache save, load, hash validation, and bulletproof matching integration.
 */

import { describe, test, expect, beforeEach } from '@jest/globals'
import { createClient } from '@supabase/supabase-js'
import { saveCachedChunks, loadCachedChunks, hashMarkdown, deleteCachedChunks } from '../../lib/cached-chunks.js'

describe('Cached Chunks Integration', () => {
  let supabase: any
  const testDocumentId = 'test-doc-123'

  beforeEach(async () => {
    // Initialize Supabase client
    supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // Cleanup any existing test data
    await deleteCachedChunks(supabase, testDocumentId)
  })

  test('should save and load cached chunks', async () => {
    const markdown = '# Test Document\n\nThis is test content.'
    const hash = hashMarkdown(markdown)

    const testChunks = [
      {
        index: 0,
        content: 'Test chunk 1',
        meta: {
          page_start: 1,
          page_end: 1,
          heading_path: ['Introduction'],
          bboxes: []
        }
      }
    ]

    const testStructure = {
      headings: [{ level: 1, text: 'Test Document', page: 1 }],
      total_pages: 1,
      sections: []
    }

    // Save cache
    await saveCachedChunks(supabase, {
      document_id: testDocumentId,
      extraction_mode: 'pdf',
      markdown_hash: hash,
      docling_version: '2.55.1',
      chunks: testChunks,
      structure: testStructure
    })

    // Load cache
    const loaded = await loadCachedChunks(supabase, testDocumentId, hash)

    expect(loaded).not.toBeNull()
    expect(loaded!.chunks).toHaveLength(1)
    expect(loaded!.chunks[0].content).toBe('Test chunk 1')
    expect(loaded!.structure.total_pages).toBe(1)
  })

  test('should return null for hash mismatch', async () => {
    const markdown = '# Original'
    const hash = hashMarkdown(markdown)

    await saveCachedChunks(supabase, {
      document_id: testDocumentId,
      extraction_mode: 'pdf',
      markdown_hash: hash,
      chunks: [],
      structure: { headings: [], total_pages: 1, sections: [] }
    })

    // Try to load with different hash
    const differentHash = hashMarkdown('# Modified')
    const loaded = await loadCachedChunks(supabase, testDocumentId, differentHash)

    expect(loaded).toBeNull()
  })

  test('should handle cache miss gracefully', async () => {
    const hash = hashMarkdown('test')
    const loaded = await loadCachedChunks(supabase, 'nonexistent-doc', hash)

    expect(loaded).toBeNull()
  })
})
```

**Run Tests:**
```bash
cd worker && npm run test:integration -- cached-chunks.test.ts
```

**Task 5.2: Update Documentation**

**File 1:** `docs/PROCESSING_PIPELINE.md`

Add section after "Review Checkpoint Recovery":

```markdown
### Cached Chunks Architecture

**Purpose:** Enable zero-cost reprocessing with bulletproof matching.

**Storage:** Dedicated `cached_chunks` table with document-level persistence.

**Lifecycle:**
```
Initial Processing (ONE TIME):
  Docling extraction → HybridChunker → 382 chunks with metadata
  ↓
  Save to cached_chunks table (upsert on document_id)
  ↓
  Continue with cleanup, matching, enrichment

Resume from Review:
  Load cached_chunks by document_id
  ↓
  Hash validation (markdown_hash match?)
  ↓
  Bulletproof match to edited markdown
  ↓
  Preserve structural metadata (pages, headings, bboxes)

Reprocessing (after heavy edits):
  Load cached_chunks by document_id
  ↓
  Hash validation
  ↓
  Bulletproof match with 5-layer fallback (100% recovery)
  ↓
  Cost: $0.00 vs $0.50 for Gemini
```

**Query Pattern:**
```typescript
const { data } = await supabase
  .from('cached_chunks')
  .select('chunks, structure')
  .eq('document_id', documentId)
  .single()
```

**Benefits:**
- Survives job deletion (90-day pruning)
- Enables reprocessing months/years later
- Zero API cost for iterative editing
- Structural metadata preserved
```

**File 2:** `docs/ARCHITECTURE.md`

Add to database tables section:

```markdown
### cached_chunks Table

Stores original Docling extraction results for LOCAL mode reprocessing.

**Purpose:**
- Enables zero-cost reprocessing ($0.00 vs $0.50 Gemini)
- Structural metadata preserved through edits (pages, headings, bboxes)
- 100% recovery guarantee via bulletproof matching

**Schema:**
```sql
cached_chunks (
  document_id UUID UNIQUE,       -- One cache per document
  extraction_mode TEXT,          -- 'pdf' | 'epub'
  markdown_hash TEXT,            -- SHA256 for cache validation
  chunks JSONB,                  -- DoclingChunk[] array
  structure JSONB,               -- DoclingStructure object
  docling_version TEXT           -- Compatibility tracking
)
```

**Lifecycle:** Created once per document, never updated (upsert replaces). Only deleted when document is deleted (CASCADE).

**Integration:** Processors save after extraction, handlers load for resume/reprocess.
```

**Task 5.3: Validation Commands**

Add to `worker/package.json` scripts (if not exists):

```json
{
  "scripts": {
    "test:cached-chunks": "NODE_OPTIONS='--experimental-vm-modules' jest --config jest.config.cjs tests/integration/cached-chunks.test.ts"
  }
}
```

**Success Criteria:**
- ✅ All integration tests pass
- ✅ Documentation complete and accurate
- ✅ Validation commands executable
- ✅ No lint errors

---

## Validation Gates

### Gate 1: Migration Success ✅
```bash
npx supabase db reset
psql -h localhost -p 54322 -U postgres -d postgres -c "\d cached_chunks"
```

**Expected Output:**
- Table with 9 columns (id, document_id, extraction_mode, markdown_hash, docling_version, chunks, structure, created_at, updated_at)
- 3 indexes
- UNIQUE constraint on document_id
- Trigger on updated_at

### Gate 2: Type Safety ✅
```bash
cd worker && npm run build
```

**Expected Output:**
- Zero TypeScript errors
- Clean compilation
- All imports resolve

### Gate 3: Lint Check ✅
```bash
cd worker && npm run lint
```

**Expected Output:**
- Zero ESLint errors
- Code follows project conventions

### Gate 4: Unit Tests ✅
```bash
cd worker && npm run test:cached-chunks
```

**Expected Output:**
- All utility function tests pass
- Cache save/load works
- Hash validation works
- Graceful error handling verified

### Gate 5: Integration Tests ✅
```bash
cd worker && npm run test:integration -- local-processing.test.ts
```

**Expected Output:**
- PDF processor integration works
- EPUB processor integration works
- Resume handler loads cache
- Reprocess handler uses bulletproof matching

### Gate 6: End-to-End Validation ✅

**Manual Testing:**

1. **Initial Processing:**
```bash
# Process test PDF (LOCAL mode)
# Verify: cached_chunks row created in database
psql -h localhost -p 54322 -U postgres -d postgres -c "
  SELECT document_id, extraction_mode,
         array_length((chunks::json)::jsonb, 1) as chunk_count,
         LEFT(markdown_hash, 8) as hash
  FROM cached_chunks
  ORDER BY created_at DESC
  LIMIT 1;
"
```

2. **Resume from Checkpoint:**
```bash
# Process with reviewDoclingExtraction=true
# Make small edits in Obsidian
# Resume processing
# Verify: No Gemini API calls, $0.00 cost
# Check logs for: "[CachedChunks] ✓ Loaded N cached chunks"
```

3. **Reprocess with Heavy Edits:**
```bash
# Process document fully
# Make 30% content changes
# Trigger reprocessing
# Verify: Bulletproof matching runs, structural metadata preserved
# Check logs for matching stats (exact, high, medium, synthetic)
```

4. **Cache Miss Fallback:**
```bash
# Manually delete cached_chunks row
psql -h localhost -p 54322 -U postgres -d postgres -c "
  DELETE FROM cached_chunks WHERE document_id = 'test-doc-id';
"
# Try to resume/reprocess
# Verify: Graceful fallback to CLOUD mode
# Check logs for: "No cached chunks found - falling back to CLOUD mode"
```

**Success Criteria:**
- ✅ All 4 scenarios pass
- ✅ Cache hit: $0.00 cost
- ✅ Cache miss: Graceful fallback
- ✅ Structural metadata preserved
- ✅ No breaking changes

---

## Risk Assessment

### Low Risk ✅

**1. Non-Breaking Change**
- Existing CLOUD mode unchanged
- Graceful fallback if cache missing
- No user-facing changes

**Mitigation:** Comprehensive logging ensures cache behavior visible.

**2. Isolated to LOCAL Mode**
- Only affects LOCAL mode processing
- CLOUD mode users unaffected
- Optional feature (env var gated)

**Mitigation:** Clear separation of code paths.

**3. Tested Pattern**
- Bulletproof matching already proven in continue-processing
- Migration pattern well-established (045 examples)
- Type definitions from existing code

**Mitigation:** Integration tests cover all scenarios.

### Medium Risk ⚠️

**1. Hash Invalidation Logic**
- Markdown changes invalidate cache
- Could lead to more CLOUD fallbacks than expected
- Requires user awareness

**Mitigation:**
- Clear logging when hash mismatch occurs
- Documentation explains cache invalidation
- Consider future enhancement: structural-only hashing (ignore whitespace)

**2. JSONB Storage Size**
- Large documents (1000+ chunks) create large JSONB columns
- PostgreSQL limit: 1GB per row (extremely unlikely to hit)
- Potential performance impact on insert/select

**Mitigation:**
- Monitor cache row sizes in production
- Add warning if chunk count > 1000
- Consider compression for future enhancement

**3. Migration Reversibility**
- Adding table is easy (forward migration)
- Removing table requires data migration (backward migration)
- No automated rollback strategy

**Mitigation:**
- Document manual rollback procedure
- Keep migration simple (just table creation)
- CASCADE delete ensures cleanup

### Mitigation Strategies

**1. Comprehensive Logging**
```typescript
// All cache operations log success/failure
console.log('[CachedChunks] ✓ Saved N chunks')
console.warn('[CachedChunks] ⚠️  Cache invalid (hash mismatch)')
console.error('[CachedChunks] Failed to save cache: error')
```

**2. Graceful Degradation**
```typescript
// Cache save fails → Continue processing (non-fatal)
// Cache load fails → Fallback to CLOUD mode
// Hash mismatch → Fallback to CLOUD mode
```

**3. Validation Gates**
- 6 automated validation commands
- Manual E2E testing checklist
- Integration tests for all scenarios

**4. Documentation**
- Clear explanation of cache lifecycle
- Examples of cache hit/miss scenarios
- Troubleshooting guide for common issues

---

## Success Criteria

### Functional Success ✅

1. **Resume from review checkpoint uses cached chunks ($0.00 cost)**
   - Cache loaded successfully
   - Bulletproof matching runs
   - No Gemini API calls
   - Structural metadata preserved

2. **Reprocessing uses cached chunks ($0.00 cost)**
   - Cache loaded successfully
   - Bulletproof matching with heavy edits
   - Synthetic chunks flagged correctly
   - Structural metadata preserved

3. **Graceful fallback to CLOUD mode if cache missing**
   - Clear warning logged
   - CLOUD mode chunking used
   - Processing completes successfully
   - Cost: $0.50 (expected)

4. **Hash validation prevents stale cache usage**
   - Hash mismatch detected
   - Cache invalidated
   - Fallback to CLOUD mode

### Technical Success ✅

5. **All tests pass**
   - Unit tests (utility functions)
   - Integration tests (processors + handlers)
   - E2E validation (4 scenarios)

6. **Zero TypeScript errors**
   - Clean compilation
   - All imports resolve
   - Types correct

7. **No breaking changes**
   - Existing workflows unaffected
   - CLOUD mode unchanged

### Quality Success ✅

8. **Code quality maintained**
   - Zero lint errors
   - Follows project conventions
   - Comprehensive logging
   - Clear error messages

9. **Documentation complete**
   - Architecture diagram
   - Integration examples
   - Troubleshooting guide
   - API reference

---

## Future Enhancements (Not in Scope)

### Phase 2: Cache Management

**1. Cache Statistics Dashboard**
- Track hit/miss rates per document
- Calculate cost savings (cache hits × $0.50)
- Display in UI for user visibility

**2. Automatic Cache Invalidation**
- Detect source file changes (PDF/EPUB hash)
- Trigger reprocessing when source modified
- Update cache with new extraction

**3. Cache Pruning Strategy**
- Delete cache for documents not accessed in 1 year
- User-configurable retention policy
- Archive old caches to cold storage

### Phase 3: Advanced Features

**1. Structural-Only Hashing**
- Ignore whitespace/formatting changes
- Hash based on semantic content only
- Reduce false cache invalidations

**2. Partial Cache Updates**
- Update only changed sections
- Incremental bulletproof matching
- Faster reprocessing for small edits

**3. Distributed Cache Sharing**
- Share cached chunks for same ISBN
- Community-contributed extractions
- Privacy-preserving (hash-based)

---

## Related Documentation

- **Task Breakdown:** `docs/tasks/cached-chunks-table.md` - Detailed implementation tasks
- **Local Processing Pipeline:** `docs/PROCESSING_PIPELINE.md`
- **Architecture Overview:** `docs/ARCHITECTURE.md`
- **Bulletproof Matching:** `worker/lib/local/bulletproof-matcher.ts`
- **Docling Extractor:** `worker/lib/docling-extractor.ts`

## Next Steps

1. **Read Task Breakdown:** See `docs/tasks/cached-chunks-table.md` for detailed implementation steps
2. **Start with Phase 1:** Create migration 046 and type definitions
3. **Follow Validation Gates:** Run each gate command to verify progress
4. **Track Progress:** Update task status as you complete each phase

**Quick Start Command:**
```bash
# Create migration file and begin implementation
npx supabase migration new cached_chunks_table
# Copy SQL from this PRP to the migration file
```

---

## Confidence Score: 9.5/10

**Why High Confidence:**
- ✅ Complete type definitions provided (DoclingChunk, DoclingStructure)
- ✅ Exact code locations with line numbers (3 integration points)
- ✅ Concrete examples from codebase (not generic patterns)
- ✅ Clear validation gates (6 executable commands)
- ✅ All edge cases documented (hash mismatch, cache miss, graceful fallback)
- ✅ Testing strategy comprehensive (unit + integration + E2E)
- ✅ No external dependencies (pure refactoring, crypto is built-in)
- ✅ Migration pattern proven (follows 045 example exactly)
- ✅ Bulletproof matching interface validated (continue-processing usage)

**Why Not 10/10:**
- ⚠️ Minor: Line numbers may shift if codebase changes before implementation
- ⚠️ Minor: Bulletproof matcher interface assumptions validated but not integration-tested

**Recommendation:** **PROCEED with implementation**. This PRP contains all context needed for one-pass implementation success.

---

**Generated:** 2025-10-11
**Next Step:** Generate task breakdown using team-lead-task-breakdown agent
