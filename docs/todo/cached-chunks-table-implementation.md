# Cached Chunks Table Implementation Plan

**Status:** Ready to implement
**Priority:** High (fixes LOCAL mode resume/reprocessing)
**Estimated Time:** 8-10 hours
**Created:** 2025-10-11

---

## Problem Statement

### Current Issue

**Bug discovered:** LOCAL mode processing fails when resuming from review checkpoints or reprocessing documents.

**Root cause:**
1. Docling extracts chunks with structural metadata (pages, headings, bboxes)
2. Chunks stored in `job.metadata.cached_extraction.doclingChunks` (JSONB)
3. Resume/reprocess handlers try to load cached chunks
4. **Cache miss:** Chunks not found → falls back to Gemini ($0.50 cost)

**Example failure:**
```
[ContinueProcessing] Processing mode: LOCAL
[ContinueProcessing] LOCAL mode but no cached Docling chunks found
[ContinueProcessing] Falling back to CLOUD mode for this document
```

### Why Current Approach Fails

**JSONB storage in `background_jobs.metadata`:**
- ✅ Works for initial processing
- ❌ Fails for resume: Queries wrong job (continue-processing job, not process_document)
- ❌ Fails for reprocessing: Jobs pruned after 90 days
- ❌ Lifecycle mismatch: Chunks belong to document, not job

**Cached chunks need document-level persistence, not job-level.**

---

## Solution: Dedicated `cached_chunks` Table

### Architecture

Create a new table to store original Docling chunks with document-level lifecycle:

```sql
CREATE TABLE cached_chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,

  -- Extraction metadata
  extraction_type text NOT NULL,  -- 'docling_pdf', 'docling_epub'
  extracted_at timestamptz NOT NULL DEFAULT now(),

  -- Cached data
  chunks jsonb NOT NULL,          -- Original DoclingChunk[] from HybridChunker
  structure jsonb,                -- Docling structure (headings, total_pages)

  -- Source tracking
  source_hash text,               -- SHA256 of source file (for invalidation)
  chunk_count integer NOT NULL,   -- Quick reference

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_cached_chunks_document ON cached_chunks(document_id);
CREATE INDEX idx_cached_chunks_type ON cached_chunks(extraction_type);
CREATE UNIQUE INDEX idx_cached_chunks_document_type ON cached_chunks(document_id, extraction_type);
```

### Benefits

**1. Document-level lifecycle:**
- Survives job deletion (90-day pruning)
- Enables reprocessing months/years later
- Cached chunks available as long as document exists

**2. Simplified queries:**
```typescript
// Before (complex, job-dependent)
const { data: job } = await supabase
  .from('background_jobs')
  .select('metadata')
  .eq('entity_id', documentId)
  .eq('job_type', 'process_document')
  .order('created_at', { ascending: false })
  .limit(1)
  .single()
const chunks = job?.metadata?.cached_extraction?.doclingChunks

// After (simple, direct)
const { data } = await supabase
  .from('cached_chunks')
  .select('chunks, structure')
  .eq('document_id', documentId)
  .single()
const chunks = data?.chunks
```

**3. Better semantics:**
- Chunks are document data, not job metadata
- Clear separation of concerns
- Easier to reason about

**4. Future extensibility:**
- Track source file hash for cache invalidation
- Store multiple extraction types per document
- Add statistics, validation metadata
- Query/index cached chunks directly

---

## Key Insight: Bulletproof Editing Workflow

### The Power of Cached Chunks

With cached chunks stored permanently, we unlock a **zero-cost editing workflow**:

```
1. Initial Processing (ONE TIME)
   PDF/EPUB → Docling → Extract chunks with metadata
   ↓
   Cache to database: page numbers, headings, bboxes preserved

2. User Edits Document (INFINITE TIMES)
   Edit markdown in Obsidian (fix typos, add notes, reformat)
   ↓
   Bulletproof matching: Remap cached chunks to edited markdown
   ↓
   Result: $0.00 cost, structural metadata preserved

3. Structural Metadata Survives
   - Page numbers still accurate (anchored to content, not position)
   - Heading hierarchy preserved
   - PDF bboxes maintained for highlighting
   - Annotations stay pinned to correct locations
```

### Use Cases Enabled

**1. Iterative Editing (Your Stories)**
```
Write draft in Obsidian → Process with Docling
Edit 10 times → Reprocess with bulletproof matching (10 × $0.00)
No structural metadata → Just text editing
```

**2. Collaborative Annotation**
```
Process PDF → Share with team → Everyone annotates
Team member edits markdown (fixes OCR errors)
Reprocess → All annotations remapped automatically
Cost: $0.00 for reprocessing
```

**3. Long-Term Library Management**
```
Process 1000 books today → Cache chunks
5 years later → Decide to clean up all OCR artifacts
Reprocess all 1000 books using cached chunks
Cost: $0.00 (vs $500 for Gemini rechunking)
```

**4. Format Conversion**
```
Process PDF with Docling → Cache chunks
User manually cleans markdown extensively
Bulletproof matching still works (5-layer fallback)
Worst case: Synthetic chunks (flagged for review)
Best case: 85-90% exact matches
```

### Why This Works

**Bulletproof matching is designed for text transformations:**
- Layer 1 (Fuzzy): Handles edits, whitespace changes
- Layer 2 (Embeddings): Handles reordering, paraphrasing
- Layer 3 (LLM): Handles significant rewrites
- Layer 4 (Interpolation): **Never fails** (100% recovery)

**Structural metadata persists through edits:**
- Page numbers anchored to semantic content (chapter/section)
- Not anchored to absolute positions (byte offsets)
- Survives reasonable editing (typos, formatting, additions)

**Cost comparison:**
```
Gemini rechunking:     $0.50 per reprocess
Bulletproof remap:     $0.00 per reprocess
1000 edits:            $500 vs $0
```

---

## Implementation Plan

### Phase 1: Database Migration (1-2 hours)

**File:** `supabase/migrations/046_add_cached_chunks_table.sql`

```sql
-- Create cached_chunks table
CREATE TABLE cached_chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  extraction_type text NOT NULL CHECK (extraction_type IN ('docling_pdf', 'docling_epub')),
  extracted_at timestamptz NOT NULL DEFAULT now(),
  chunks jsonb NOT NULL,
  structure jsonb,
  source_hash text,
  chunk_count integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_cached_chunks_document ON cached_chunks(document_id);
CREATE INDEX idx_cached_chunks_type ON cached_chunks(extraction_type);
CREATE UNIQUE INDEX idx_cached_chunks_document_type ON cached_chunks(document_id, extraction_type);

-- Add trigger for updated_at
CREATE TRIGGER update_cached_chunks_updated_at
  BEFORE UPDATE ON cached_chunks
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Add RLS policies
ALTER TABLE cached_chunks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own cached chunks"
  ON cached_chunks FOR SELECT
  USING (
    document_id IN (
      SELECT id FROM documents WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Service role can manage cached chunks"
  ON cached_chunks FOR ALL
  USING (true)
  WITH CHECK (true);

COMMENT ON TABLE cached_chunks IS 'Stores original Docling chunks for bulletproof matching during reprocessing';
COMMENT ON COLUMN cached_chunks.chunks IS 'Original DoclingChunk[] array with structural metadata (pages, headings, bboxes)';
COMMENT ON COLUMN cached_chunks.structure IS 'Docling structure info (headings array, total_pages)';
COMMENT ON COLUMN cached_chunks.source_hash IS 'SHA256 hash of source PDF/EPUB for cache invalidation';
```

**Validation:**
```bash
npx supabase db reset
# Verify table created
psql -h localhost -p 54322 -U postgres -d postgres -c "\d cached_chunks"
```

### Phase 2: Update PDF Processor (1 hour)

**File:** `worker/processors/pdf-processor.ts`

**Location:** After Docling extraction (around line 126)

**Change:** Replace job metadata caching with table insert

```typescript
// OLD (line 126):
this.job.metadata = {
  ...this.job.metadata,
  cached_extraction: {
    markdown: extractionResult.markdown,
    structure: extractionResult.structure,
    doclingChunks: extractionResult.chunks
  }
}

// NEW:
// Save to cached_chunks table for reprocessing
const { error: cacheError } = await this.supabase
  .from('cached_chunks')
  .upsert({
    document_id: this.job.document_id,
    extraction_type: 'docling_pdf',
    chunks: extractionResult.chunks,
    structure: extractionResult.structure,
    chunk_count: extractionResult.chunks.length,
    extracted_at: new Date().toISOString()
  }, {
    onConflict: 'document_id,extraction_type'
  })

if (cacheError) {
  console.warn('[PDFProcessor] Failed to cache chunks:', cacheError.message)
  // Non-fatal: Continue processing even if caching fails
}

console.log(`[PDFProcessor] Cached ${extractionResult.chunks.length} chunks to database`)
```

### Phase 3: Update EPUB Processor (1 hour)

**File:** `worker/processors/epub-processor.ts`

**Location:** After Docling extraction (around line 116)

**Change:** Same as PDF processor

```typescript
// Save to cached_chunks table
const { error: cacheError } = await this.supabase
  .from('cached_chunks')
  .upsert({
    document_id: this.job.document_id,
    extraction_type: 'docling_epub',
    chunks: result.chunks,
    structure: result.structure,
    chunk_count: result.chunks.length,
    extracted_at: new Date().toISOString()
  }, {
    onConflict: 'document_id,extraction_type'
  })

if (cacheError) {
  console.warn('[EPUBProcessor] Failed to cache chunks:', cacheError.message)
}

console.log(`[EPUBProcessor] Cached ${result.chunks.length} chunks to database`)
```

### Phase 4: Update Continue-Processing Handler (2 hours)

**File:** `worker/handlers/continue-processing.ts`

**Location:** Lines 165-189 (cache loading logic)

**Change:** Query cached_chunks table instead of job metadata

```typescript
// OLD (lines 171-189):
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
  // ...
}

// NEW:
if (isLocalMode) {
  const { data: cachedData } = await supabase
    .from('cached_chunks')
    .select('chunks, structure, extraction_type, chunk_count')
    .eq('document_id', documentId)
    .single()

  if (cachedData) {
    cachedDoclingChunks = cachedData.chunks
    console.log(`[ContinueProcessing] Loaded ${cachedData.chunk_count} cached chunks (${cachedData.extraction_type})`)
    console.log(`[ContinueProcessing] Original extraction: ${cachedData.extraction_type}`)
  } else {
    console.warn('[ContinueProcessing] LOCAL mode but no cached chunks found')
    console.warn('[ContinueProcessing] Falling back to CLOUD mode for this document')
  }
}
```

### Phase 5: Update Reprocess-Document Handler (3-4 hours)

**File:** `worker/handlers/reprocess-document.ts`

**Location:** Lines 103-117 (hardcoded Gemini chunking)

**Change:** Add LOCAL mode path with bulletproof matching

```typescript
// Stage 4: Chunking - LOCAL or CLOUD mode
let newChunks: any[]

const isLocalMode = process.env.PROCESSING_MODE === 'local'
console.log(`[ReprocessDocument] Processing mode: ${isLocalMode ? 'LOCAL' : 'CLOUD'}`)

if (isLocalMode) {
  // LOCAL MODE: Bulletproof matching with cached chunks
  console.log('[ReprocessDocument] LOCAL MODE: Attempting bulletproof matching')
  await updateProgress(25, 'Loading cached chunks...')

  const { data: cachedData } = await supabase
    .from('cached_chunks')
    .select('chunks, structure, extraction_type, chunk_count')
    .eq('document_id', documentId)
    .single()

  if (cachedData) {
    console.log(`[ReprocessDocument] Found ${cachedData.chunk_count} cached chunks (${cachedData.extraction_type})`)
    await updateProgress(30, 'Running bulletproof matching...')

    const { bulletproofMatch } = await import('../lib/local/bulletproof-matcher.js')
    const { extractMetadataBatch } = await import('../lib/chunking/pydantic-metadata.js')
    const { generateEmbeddingsLocal } = await import('../lib/local/embeddings-local.js')
    const { generateEmbeddings } = await import('../lib/embeddings.js')

    // Step 1: Bulletproof matching
    const { chunks: rematchedChunks, stats } = await bulletproofMatch(
      newMarkdown,
      cachedData.chunks,
      {
        onProgress: async (layerNum, matched, remaining) => {
          console.log(`[ReprocessDocument] Layer ${layerNum}: ${matched} matched, ${remaining} remaining`)
        }
      }
    )

    console.log(`[ReprocessDocument] Matching stats:`)
    console.log(`  Exact: ${stats.exact}/${stats.total} (${(stats.exact / stats.total * 100).toFixed(1)}%)`)
    console.log(`  Synthetic: ${stats.synthetic}/${stats.total}`)

    await updateProgress(50, `${rematchedChunks.length} chunks matched`)

    // Step 2: Local metadata enrichment (reuse from continue-processing pattern)
    console.log('[ReprocessDocument] Extracting metadata with PydanticAI + Ollama')
    await updateProgress(55, 'Enriching metadata...')

    let enrichedChunks = rematchedChunks.map((result, idx) => ({
      document_id: documentId,
      content: result.chunk.content,
      chunk_index: idx,
      start_offset: result.start_offset,
      end_offset: result.end_offset,
      word_count: result.chunk.content.split(/\s+/).filter(w => w.length > 0).length,
      // Preserve Docling metadata
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
    await updateProgress(73, 'Local processing complete')

  } else {
    console.warn('[ReprocessDocument] No cached chunks found - falling back to CLOUD mode')
    isLocalMode = false  // Fall through to CLOUD mode
  }
}

if (!isLocalMode) {
  // CLOUD MODE: Existing Gemini chunking (lines 106-160)
  console.log('[ReprocessDocument] CLOUD MODE: Using AI semantic chunking')
  // ... existing code ...
}
```

### Phase 6: Documentation Updates (1 hour)

**File 1:** `docs/PROCESSING_PIPELINE.md`

Add section after "Review Checkpoint Recovery":

```markdown
### Cached Chunks Architecture

**Storage:** `cached_chunks` table (document-level persistence)

**Purpose:** Enable zero-cost reprocessing with bulletproof matching

**Lifecycle:**
```
Initial Processing:
  Docling extraction → HybridChunker → 382 chunks with metadata
  ↓
  Save to cached_chunks table (upsert on document_id + extraction_type)
  ↓
  Continue with cleanup, matching, enrichment

Resume from Review:
  Load cached_chunks by document_id
  ↓
  Bulletproof match to edited markdown
  ↓
  Preserve structural metadata (pages, headings, bboxes)

Reprocessing (after heavy edits):
  Load cached_chunks by document_id
  ↓
  Bulletproof match to heavily edited markdown
  ↓
  5-layer fallback ensures 100% recovery
  ↓
  Cost: $0.00 vs $0.50 for Gemini
```

**Schema:**
```sql
cached_chunks {
  document_id → Original extraction source
  extraction_type → 'docling_pdf' | 'docling_epub'
  chunks → Original DoclingChunk[] array
  structure → Headings, total_pages
  chunk_count → Quick reference
}
```

**Query Pattern:**
```typescript
const { data } = await supabase
  .from('cached_chunks')
  .select('chunks, structure')
  .eq('document_id', documentId)
  .single()
```
```

**File 2:** `docs/ARCHITECTURE.md`

Add to database tables section:

```markdown
### cached_chunks

Stores original Docling extraction results for reprocessing.

**Why needed:**
- LOCAL mode reprocessing needs original chunks for bulletproof matching
- Structural metadata (pages, headings, bboxes) preserved through edits
- Enables zero-cost document editing workflow
- Survives job deletion (90-day pruning)

**Lifecycle:** Created once per document, never updated. Only deleted when document is deleted (CASCADE).
```

### Phase 7: Type Definitions (30 min)

**File:** `worker/types/cached-chunks.ts` (NEW FILE)

```typescript
/**
 * Cached Chunks Types
 *
 * Stores original Docling extraction results for LOCAL mode reprocessing.
 */

export interface CachedChunksRow {
  id: string
  document_id: string
  extraction_type: 'docling_pdf' | 'docling_epub'
  extracted_at: string
  chunks: DoclingChunk[]  // From docling-extractor.ts
  structure: DoclingStructure | null
  source_hash: string | null
  chunk_count: number
  created_at: string
  updated_at: string
}

export interface CachedChunksInsert {
  document_id: string
  extraction_type: 'docling_pdf' | 'docling_epub'
  chunks: DoclingChunk[]
  structure?: DoclingStructure
  source_hash?: string
  chunk_count: number
  extracted_at?: string
}

export interface CachedChunksUpdate {
  chunks?: DoclingChunk[]
  structure?: DoclingStructure
  source_hash?: string
  chunk_count?: number
  updated_at?: string
}

// Type for Supabase client
declare module '@supabase/supabase-js' {
  interface Database {
    public: {
      Tables: {
        cached_chunks: {
          Row: CachedChunksRow
          Insert: CachedChunksInsert
          Update: CachedChunksUpdate
        }
      }
    }
  }
}
```

---

## Testing Plan

### Test 1: Initial Processing with Caching

```bash
# Start with clean database
npx supabase db reset

# Process a test document (LOCAL mode)
# Expected: cached_chunks table populated

# Verify cache
psql -h localhost -p 54322 -U postgres -d postgres -c "
  SELECT document_id, extraction_type, chunk_count, extracted_at
  FROM cached_chunks;
"
```

### Test 2: Resume from Review Checkpoint

```bash
# Process document with reviewDoclingExtraction=true
# Make small edits in Obsidian
# Resume processing

# Expected:
# - Cached chunks loaded successfully
# - Bulletproof matching runs
# - No Gemini API calls
# - Cost: $0.00
```

### Test 3: Reprocessing with Heavy Edits

```bash
# Process document fully
# Make significant edits (30% content change)
# Reprocess document

# Expected:
# - Cached chunks loaded
# - Bulletproof matching runs
# - Some synthetic chunks (flagged)
# - Structural metadata preserved
# - Cost: $0.00
```

### Test 4: Cache Miss Fallback

```bash
# Manually delete cached_chunks row
# Try to resume/reprocess

# Expected:
# - Graceful fallback to CLOUD mode
# - Warning logged
# - Processing completes successfully
# - Cost: $0.50 (Gemini)
```

---

## Migration Path for Existing Documents

### Option 1: Reprocess Everything (Recommended)

Existing documents don't have cached chunks. Next time user processes/reprocesses:
- Will use CLOUD mode (no cache)
- Cache will be created during processing
- Future reprocessing will use LOCAL mode

**No action needed.** Gradual migration as documents are reprocessed.

### Option 2: Backfill Script (Optional)

For power users with many existing LOCAL-processed documents:

```typescript
// scripts/backfill-cached-chunks.ts

import { createClient } from '@supabase/supabase-js'

const supabase = createClient(...)

// Find all documents processed in LOCAL mode
const { data: jobs } = await supabase
  .from('background_jobs')
  .select('id, entity_id, metadata')
  .eq('job_type', 'process_document')
  .not('metadata->cached_extraction', 'is', null)

for (const job of jobs) {
  const extraction = job.metadata.cached_extraction

  // Insert into cached_chunks
  await supabase
    .from('cached_chunks')
    .upsert({
      document_id: job.entity_id,
      extraction_type: extraction.epubMetadata ? 'docling_epub' : 'docling_pdf',
      chunks: extraction.doclingChunks,
      structure: extraction.structure,
      chunk_count: extraction.doclingChunks.length,
      extracted_at: job.created_at
    })
}

console.log(`Backfilled ${jobs.length} documents`)
```

---

## Files Modified Summary

### New Files (2)
1. `supabase/migrations/046_add_cached_chunks_table.sql` - Database schema
2. `worker/types/cached-chunks.ts` - TypeScript types

### Modified Files (5)
1. `worker/processors/pdf-processor.ts` - Save to table instead of job metadata
2. `worker/processors/epub-processor.ts` - Save to table instead of job metadata
3. `worker/handlers/continue-processing.ts` - Query table instead of job metadata
4. `worker/handlers/reprocess-document.ts` - Add LOCAL mode path with bulletproof matching
5. `docs/PROCESSING_PIPELINE.md` - Document cached chunks architecture

### Documentation Updates (1)
1. `docs/ARCHITECTURE.md` - Add cached_chunks table description

---

## Risk Assessment

### Low Risk
- **Non-breaking:** Existing code continues to work (graceful fallback)
- **Isolated change:** Only affects LOCAL mode processing
- **Backward compatible:** No impact on CLOUD mode
- **Tested pattern:** Bulletproof matching already proven in continue-processing

### Medium Risk
- **New table:** Need to ensure RLS policies correct
- **Migration:** Need to test on fresh database
- **Cache invalidation:** No logic yet for detecting source file changes

### Mitigation
1. Test migration on local Supabase first
2. Add comprehensive logging for cache hits/misses
3. Ensure graceful fallback if cache missing
4. Document cache invalidation strategy for future

---

## Future Enhancements

### Phase 2 (Not in scope)
1. **Cache invalidation:** Detect when source PDF/EPUB changes (via hash)
2. **Cache statistics:** Track hit/miss rates, cost savings
3. **Cache pruning:** Clean up cached chunks for deleted documents
4. **Multiple extractions:** Support storing both Docling + other extraction methods

### Phase 3 (Long-term)
1. **Distributed caching:** Share cached chunks across users (same ISBN)
2. **Cache prewarming:** Extract chunks immediately on upload
3. **Version tracking:** Store multiple extraction versions (v1, v2, etc.)

---

## Context for New Session

### Summary
Fixed LOCAL mode bug where resume/reprocess operations were falling back to Gemini ($0.50) instead of using bulletproof matching ($0.00). Root cause: cached Docling chunks stored in job metadata (90-day lifecycle) instead of document-level table. Solution: Create `cached_chunks` table with document-level persistence.

### Key Files
- Migration: `supabase/migrations/046_add_cached_chunks_table.sql`
- Processors: `worker/processors/{pdf,epub}-processor.ts`
- Handlers: `worker/handlers/{continue-processing,reprocess-document}.ts`

### Starting Point
1. Read this document fully
2. Create migration file
3. Update processors (save to table)
4. Update handlers (load from table)
5. Test with real document

### Success Criteria
- Resume from review checkpoint uses cached chunks ($0.00)
- Reprocessing uses cached chunks ($0.00)
- Graceful fallback to CLOUD if cache missing
- Bulletproof matching preserves structural metadata

---

**Ready to implement in next session.**
