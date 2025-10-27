# Chunk Enrichment Skip Feature - Implementation Plan

## Overview

Enable **optional chunk enrichment** during document upload, mirroring the existing connection detection skip pattern. Users can defer expensive metadata extraction (themes, concepts, emotions) to bulk process later, enabling fast library imports while preserving the ability to enrich on-demand.

**User Workflow:**
1. Upload document → Toggle "Enrich Chunks" OFF → Fast processing (extract + chunk only)
2. Start reading/annotating immediately (full markdown available)
3. Manually trigger enrichment later (per-chunk, batch, or document-level)
4. Optional: "Enrich & Connect" runs both in sequence

**Benefits:**
- Bulk import 200 books in 2 hours instead of 2 days
- Read/annotate while enrichment processes in background
- Zero cost upfront (local Ollama models run on-demand)
- Full control over what gets enriched

## Current State Analysis

### Key Discoveries

**Enrichment is Always On** (`worker/lib/managers/document-processing-manager.ts:358-419`):
- Stage 7-8 of 10-stage pipeline (75-85% progress)
- Uses `bulletproof-metadata.ts` with 6-tier fallback: Ollama 32B → 14B → 7B → Gemini → Regex → Fallback
- Stores in JSONB: `emotional_metadata`, `conceptual_metadata`, `domain_metadata`, `themes`, `importance_score`, `summary`
- No skip option currently exists

**Connection Skip Pattern Exists** (`supabase/migrations/070_chunk_connection_detection.sql`):
- Columns: `connections_detected` (BOOLEAN), `connections_detected_at` (TIMESTAMPTZ), `detection_skipped_reason` (TEXT)
- Manager: `ConnectionDetectionManager.markChunksAsSkipped(documentId, reason)`
- Upload flag: `detectConnections = formData.get('detectConnections') === 'true'`
- Partial index: `WHERE connections_detected = false` for efficient queries
- RPC functions: `get_chunk_detection_stats()`, `get_undetected_chunk_ids()`

**UI Integration Points** (4 locations):
- `src/components/reader/ChunkMetadataIcon.tsx:246-296` - Detection button in hover card
- `src/components/rhizome/chunk-card.tsx:373-400` - Detection section in detailed mode
- `src/components/admin/tabs/ConnectionsTab.tsx` - Batch reprocessing (Smart Mode)
- Document cards in library view

**Dependency Chain:**
- Enrichment provides embeddings required by connection detection
- If enrichment skipped → connections MUST be skipped (no embeddings available)
- Current: `detectConnections !== false` (default ON for backward compatibility)
- Proposed: Auto-skip connections when enrichment disabled

### Constraints

1. **Embeddings Dependency:** Connection detection requires embeddings from enrichment stage
2. **Migration Number:** Next is `072` (latest: `071_add_document_last_viewed.sql`)
3. **Local Processing:** Uses Ollama models (zero API cost, but ~30-60s per document)
4. **Backward Compatibility:** Existing uploads should continue to enrich by default

## Desired End State

**Upload Flow:**
```
User uploads document
→ Switch "Enrich Chunks" OFF (default: ON)
→ Switch "Detect Connections" OFF (auto-disabled if enrichment OFF)
→ Processing: Extract → Clean → Chunk → Save (FAST - no enrichment/connections)
→ Chunks saved with enrichments_detected=false, enrichment_skipped_reason='user_choice'
→ User can read/annotate immediately
```

**Manual Enrichment Triggers:**
```
Per-chunk: ChunkMetadataIcon → "Enrich Chunk" button → Single chunk job
Batch: ChunkCard (multi-select) → "Enrich Selected" → Batch job
Document: Admin Panel → "Enrich All Pending" → Document-level job
Combo: ChunkMetadataIcon → "Enrich & Connect" → Sequential jobs
```

**Verification:**
- Upload with enrichment OFF → Chunks have `enrichments_detected=false`, `enrichment_skipped_reason='user_choice'`
- Trigger enrichment → Job created, chunks updated with metadata, `enrichments_detected=true`
- Connection detection blocked if enrichment skipped
- Admin Panel shows enrichment statistics

## Rhizome Architecture

- **Module**: Both (Main App + Worker)
- **Storage**: Database only (PostgreSQL chunks table JSONB columns)
- **Migration**: Yes (`072_chunk_enrichment_skip.sql`)
- **Test Tier**: Stable (progressive enhancement, fix when broken)
- **Pipeline Stages**: Stage 5 (Enrichment - NEW), Stage 6 (Connections)
- **Processing Mode**: LOCAL (Ollama + PydanticAI, zero cost)
- **Engines**: No direct impact (enrichment provides input data to engines)

## What We're NOT Doing

- ❌ Adding enrichment cost visibility (local models = zero cost)
- ❌ Changing default enrichment behavior (stays ON for single uploads)
- ❌ Modifying enrichment algorithm (bulletproof extraction unchanged)
- ❌ Creating separate enrichment strategies (uses existing 6-tier fallback)
- ❌ Adding enrichment quality scoring (existing metadata confidence unchanged)
- ❌ Batch enrichment prioritization (FIFO job queue)

## Implementation Approach

**Mirror Connection Detection Skip Pattern Exactly:**

1. **Database Schema** - Add 3 tracking columns (same as connections)
2. **Upload Form** - Add `enrichChunks` Switch (default: ON)
3. **Server Actions** - Create `enrichments.ts` with 3 trigger methods
4. **Processing Manager** - Add Stage 5 with conditional enrichment
5. **Enrichment Manager** - Create `ChunkEnrichmentManager` class
6. **Job Handlers** - Create `enrich-chunks.ts` and `enrich-and-connect.ts`
7. **UI Components** - Add enrichment buttons to 4 locations
8. **Admin Panel** - Add enrichment statistics and batch controls

**Auto-Skip Dependency:**
```typescript
// Upload validation
if (!enrichChunks) {
  detectConnections = false
  console.log('[Upload] Auto-skipping connections (enrichment disabled)')
}
```

---

## Phase 1: Database Schema & Migration

### Overview
Add enrichment tracking columns to `chunks` table, create indexes, and RPC functions for statistics. Mirrors connection detection schema exactly.

### Changes Required

#### 1. Migration File
**File**: `supabase/migrations/072_chunk_enrichment_skip.sql`
**Changes**: Create new migration with enrichment tracking

```sql
-- =====================================================
-- Migration: 072_chunk_enrichment_skip.sql
-- Purpose: Add enrichment skip tracking (mirrors connection detection pattern)
-- =====================================================

-- Add enrichment tracking columns
ALTER TABLE chunks
  ADD COLUMN enrichments_detected BOOLEAN DEFAULT false,
  ADD COLUMN enrichments_detected_at TIMESTAMPTZ,
  ADD COLUMN enrichment_skipped_reason TEXT;

COMMENT ON COLUMN chunks.enrichments_detected IS 'Whether metadata enrichment has been performed';
COMMENT ON COLUMN chunks.enrichments_detected_at IS 'Timestamp when enrichment completed';
COMMENT ON COLUMN chunks.enrichment_skipped_reason IS 'Reason enrichment was skipped: user_choice, error, manual_skip';

-- Partial index for finding unenriched chunks (efficient filtering)
CREATE INDEX idx_chunks_enrichments_detected
  ON chunks(document_id, enrichments_detected)
  WHERE enrichments_detected = false;

-- Index for enrichment timestamps
CREATE INDEX idx_chunks_enrichments_detected_at
  ON chunks(enrichments_detected_at)
  WHERE enrichments_detected_at IS NOT NULL;

-- Index for skip reasons (analytics)
CREATE INDEX idx_chunks_enrichment_skipped
  ON chunks(enrichment_skipped_reason)
  WHERE enrichment_skipped_reason IS NOT NULL;

-- =====================================================
-- RPC Function: Get enrichment statistics for a document
-- =====================================================
CREATE OR REPLACE FUNCTION get_chunk_enrichment_stats(doc_id UUID)
RETURNS TABLE(
  total_chunks BIGINT,
  enriched_chunks BIGINT,
  skipped_chunks BIGINT,
  pending_chunks BIGINT,
  error_chunks BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*)::BIGINT as total_chunks,
    COUNT(*) FILTER (WHERE enrichments_detected = true)::BIGINT as enriched_chunks,
    COUNT(*) FILTER (WHERE enrichment_skipped_reason = 'user_choice')::BIGINT as skipped_chunks,
    COUNT(*) FILTER (WHERE enrichments_detected = false
                      AND enrichment_skipped_reason IS NULL)::BIGINT as pending_chunks,
    COUNT(*) FILTER (WHERE enrichment_skipped_reason = 'error')::BIGINT as error_chunks
  FROM chunks
  WHERE document_id = doc_id
    AND is_current = true;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_chunk_enrichment_stats IS 'Returns enrichment statistics for a document';

-- =====================================================
-- RPC Function: Get unenriched chunk IDs for batch processing
-- =====================================================
CREATE OR REPLACE FUNCTION get_unenriched_chunk_ids(doc_id UUID)
RETURNS TABLE(chunk_id UUID) AS $$
BEGIN
  RETURN QUERY
  SELECT id
  FROM chunks
  WHERE document_id = doc_id
    AND is_current = true
    AND enrichments_detected = false
    AND enrichment_skipped_reason IS NULL
  ORDER BY chunk_index;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_unenriched_chunk_ids IS 'Returns list of chunk IDs pending enrichment';

-- =====================================================
-- Backfill: Mark existing enriched chunks
-- =====================================================
-- All existing chunks with metadata should be marked as enriched
UPDATE chunks
SET
  enrichments_detected = true,
  enrichments_detected_at = metadata_extracted_at
WHERE metadata_extracted_at IS NOT NULL
  AND enrichments_detected = false;

-- Chunks without metadata are pending (no skip reason)
-- (No update needed - default false is correct)
```

### Success Criteria

#### Automated Verification:
- [ ] Migration applies: `npx supabase db reset`
- [ ] Check columns exist: `psql -c "\d chunks" | grep enrichment`
- [ ] Check indexes: `psql -c "\di" | grep enrichment`
- [ ] Check RPC functions: `psql -c "\df get_chunk_enrichment_stats"`
- [ ] Backfill verification: `psql -c "SELECT COUNT(*) FROM chunks WHERE enrichments_detected = true"`

#### Manual Verification:
- [ ] RPC function returns stats: `SELECT * FROM get_chunk_enrichment_stats('doc-uuid')`
- [ ] RPC function returns IDs: `SELECT * FROM get_unenriched_chunk_ids('doc-uuid')`
- [ ] Existing enriched chunks marked correctly

**Implementation Note:** Pause after automated verification passes for manual SQL testing before proceeding to Phase 2.

### Service Restarts:
- [ ] Supabase: `npx supabase db reset`
- [ ] Worker: Restart not needed (no code changes yet)
- [ ] Next.js: Restart not needed (no code changes yet)

---

## Phase 2: Upload Form & Server Actions

### Overview
Add `enrichChunks` Switch to upload form, extract flag in Server Action, auto-skip connections when enrichment disabled, and create enrichment trigger Server Actions.

### Changes Required

#### 1. Upload Form Component
**File**: `src/components/library/UploadZone.tsx`
**Changes**: Add enrichChunks Switch with auto-disable for connections

```typescript
// Add state for enrichChunks (default: true)
const [enrichChunks, setEnrichChunks] = useState(true)

// Auto-disable connections when enrichment disabled
useEffect(() => {
  if (!enrichChunks && detectConnections) {
    setDetectConnections(false)
    toast.info('Connections auto-disabled (requires enrichment)')
  }
}, [enrichChunks])

// In the form JSX (add before detectConnections Switch)
<div className="flex items-center justify-between">
  <div className="space-y-0.5">
    <Label htmlFor="enrich-chunks">Enrich Chunks</Label>
    <p className="text-xs text-muted-foreground">
      Extract metadata (themes, concepts, emotions) using local Ollama models
    </p>
  </div>
  <Switch
    id="enrich-chunks"
    checked={enrichChunks}
    onCheckedChange={setEnrichChunks}
  />
</div>

<div className="flex items-center justify-between">
  <div className="space-y-0.5">
    <Label htmlFor="detect-connections">Detect Connections</Label>
    <p className="text-xs text-muted-foreground">
      Run 3-engine connection detection (requires enrichment)
    </p>
  </div>
  <Switch
    id="detect-connections"
    checked={detectConnections}
    onCheckedChange={setDetectConnections}
    disabled={!enrichChunks}  // NEW: Disable if enrichment off
  />
</div>

// In FormData construction
formData.append('enrichChunks', enrichChunks.toString())
```

#### 2. Upload Server Action
**File**: `src/app/actions/documents/upload.ts`
**Changes**: Extract enrichChunks flag and pass to background job

```typescript
// Around line 60 (after detectConnections extraction)
const enrichChunksRaw = formData.get('enrichChunks')
const enrichChunks = enrichChunksRaw === 'true'  // Default: true if missing

// Auto-skip connections if enrichment disabled
let detectConnections = detectConnectionsRaw === 'true'
if (!enrichChunks && detectConnections) {
  console.log('[Upload] Auto-skipping connections (enrichment disabled)')
  detectConnections = false
}

// Update logging (around line 70)
console.log('[extractUploadConfig] Processing flags:', {
  reviewBeforeChunking: { raw: reviewBeforeChunkingRaw, parsed: reviewBeforeChunking },
  cleanMarkdown: { raw: cleanMarkdownRaw, parsed: cleanMarkdown },
  reviewDoclingExtraction: { raw: reviewDoclingExtractionRaw, parsed: reviewDoclingExtraction },
  extractImages: { raw: extractImagesRaw, parsed: extractImages },
  enrichChunks: { raw: enrichChunksRaw, parsed: enrichChunks },  // NEW
  detectConnections: { raw: detectConnectionsRaw, parsed: detectConnections },
  chunkerStrategy
})

// Update background job creation (around line 365)
const jobId = await createBackgroundJob(user.id, 'process_document', documentId, {
  document_id: documentId,
  storage_path: storagePath,
  source_type: config.sourceType,
  source_url: config.sourceUrl,
  processing_requested: config.processingRequested,
  pasted_content: config.pastedContent,
  document_type: config.documentType,
  reviewBeforeChunking: config.reviewBeforeChunking,
  cleanMarkdown: config.cleanMarkdown,
  reviewDoclingExtraction: config.reviewDoclingExtraction,
  extractImages: config.extractImages,
  chunkerStrategy: config.chunkerStrategy,
  enrichChunks: config.enrichChunks,  // NEW
  detectConnections: config.detectConnections
})
```

#### 3. Enrichment Server Actions (NEW FILE)
**File**: `src/app/actions/enrichments.ts`
**Changes**: Create new file with 3 trigger methods (mirrors connections.ts)

```typescript
'use server'

import { createClient } from '@/lib/supabase/server'
import { getCurrentUser } from '@/lib/auth'
import { revalidatePath } from 'next/cache'

/**
 * Trigger enrichment for specific chunks (batch mode).
 * Called from UI components for selected chunks.
 */
export async function enrichChunksForDocument(
  documentId: string,
  chunkIds: string[]
): Promise<{ success: boolean; jobId?: string; error?: string }> {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return { success: false, error: 'Not authenticated' }
    }

    const supabase = await createClient()

    console.log(`[enrichChunksForDocument] Starting for ${chunkIds.length} chunks`)

    // Create background job for enrichment
    const { data: job, error: jobError } = await supabase
      .from('background_jobs')
      .insert({
        job_type: 'enrich_chunks',
        input_data: {
          document_id: documentId,
          chunk_ids: chunkIds
        },
        entity_id: documentId,
        user_id: user.id,
        status: 'pending'
      })
      .select()
      .single()

    if (jobError) {
      return { success: false, error: `Failed to create job: ${jobError.message}` }
    }

    // Revalidate reader page to show enrichment started
    revalidatePath(`/read/${documentId}`)

    return { success: true, jobId: job.id }
  } catch (error) {
    console.error('[enrichChunksForDocument] Error:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

/**
 * Trigger enrichment AND connection detection for specific chunks.
 * Called from "Enrich & Connect" button.
 */
export async function enrichAndConnectChunks(
  documentId: string,
  chunkIds: string[]
): Promise<{ success: boolean; jobId?: string; error?: string }> {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return { success: false, error: 'Not authenticated' }
    }

    const supabase = await createClient()

    console.log(`[enrichAndConnectChunks] Starting for ${chunkIds.length} chunks`)

    // Create background job (handler will run enrichment THEN connections)
    const { data: job, error: jobError } = await supabase
      .from('background_jobs')
      .insert({
        job_type: 'enrich_and_connect',
        input_data: {
          document_id: documentId,
          chunk_ids: chunkIds
        },
        entity_id: documentId,
        user_id: user.id,
        status: 'pending'
      })
      .select()
      .single()

    if (jobError) {
      return { success: false, error: `Failed to create job: ${jobError.message}` }
    }

    revalidatePath(`/read/${documentId}`)

    return { success: true, jobId: job.id }
  } catch (error) {
    console.error('[enrichAndConnectChunks] Error:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

/**
 * Trigger enrichment for all unenriched chunks in a document.
 * Called from Admin Panel batch operations.
 */
export async function enrichAllUnenrichedChunks(
  documentId: string
): Promise<{ success: boolean; jobId?: string; chunkCount?: number; error?: string }> {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return { success: false, error: 'Not authenticated' }
    }

    const supabase = await createClient()

    // Get all unenriched chunk IDs using RPC function
    const { data: chunkIds, error: rpcError } = await supabase
      .rpc('get_unenriched_chunk_ids', { doc_id: documentId })

    if (rpcError) {
      return { success: false, error: `RPC failed: ${rpcError.message}` }
    }

    if (!chunkIds || chunkIds.length === 0) {
      return { success: true, error: 'All chunks already enriched', chunkCount: 0 }
    }

    // Create batch enrichment job
    const { data: job, error: jobError } = await supabase
      .from('background_jobs')
      .insert({
        job_type: 'enrich_chunks',
        input_data: {
          document_id: documentId,
          chunk_ids: chunkIds.map((c: any) => c.chunk_id),
          trigger: 'admin_enrich_all'
        },
        entity_id: documentId,
        user_id: user.id,
        status: 'pending'
      })
      .select()
      .single()

    if (jobError) {
      return { success: false, error: `Failed to create job: ${jobError.message}` }
    }

    revalidatePath(`/read/${documentId}`)

    return { success: true, jobId: job.id, chunkCount: chunkIds.length }
  } catch (error) {
    console.error('[enrichAllUnenrichedChunks] Error:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

/**
 * Load enrichment statistics for a document.
 * Called by UI to show enrichment progress.
 */
export async function loadChunkEnrichmentStats(
  documentId: string
): Promise<{
  total: number
  enriched: number
  skipped: number
  pending: number
  error: number
} | null> {
  try {
    const supabase = await createClient()

    const { data, error } = await supabase
      .rpc('get_chunk_enrichment_stats', { doc_id: documentId })

    if (error) {
      console.error('[loadChunkEnrichmentStats] RPC failed:', error)
      return null
    }

    if (!data || data.length === 0) {
      return null
    }

    const stats = data[0]
    return {
      total: Number(stats.total_chunks),
      enriched: Number(stats.enriched_chunks),
      skipped: Number(stats.skipped_chunks),
      pending: Number(stats.pending_chunks),
      error: Number(stats.error_chunks)
    }
  } catch (error) {
    console.error('[loadChunkEnrichmentStats] Error:', error)
    return null
  }
}
```

### Success Criteria

#### Automated Verification:
- [ ] Type check: `npm run type-check`
- [ ] Build succeeds: `npm run build`
- [ ] Linting: `npm run lint`

#### Manual Verification:
- [ ] Upload form shows "Enrich Chunks" Switch (default: ON)
- [ ] Toggling enrichment OFF disables "Detect Connections" Switch
- [ ] FormData includes `enrichChunks` boolean
- [ ] Server Action extracts flag correctly (check logs)
- [ ] Background job `input_data` includes `enrichChunks` field

**Implementation Note:** Test upload flow with enrichment ON and OFF before proceeding to Phase 3.

### Service Restarts:
- [ ] Next.js: Auto-reload should work
- [ ] Verify Switch component renders correctly

---

## Phase 3: Worker Processing Manager & Enrichment Manager

### Overview
Add Stage 5 (Enrichment) to DocumentProcessingManager with conditional logic, create ChunkEnrichmentManager class, and update process-document handler to extract enrichChunks flag.

### Changes Required

#### 1. Document Processing Manager Options
**File**: `worker/lib/managers/document-processing-manager.ts`
**Changes**: Add `enrichChunks` option and Stage 5 conditional logic

```typescript
// Update interface (around line 35)
interface DocumentProcessingOptions {
  documentId: string
  userId: string
  sourceType: SourceType
  reviewBeforeChunking?: boolean
  reviewDoclingExtraction?: boolean
  enrichChunks?: boolean          // NEW: Default true
  detectConnections?: boolean
}

// In execute() method - ADD Stage 5 BEFORE connection detection
// (Insert between chunking and connection detection stages)

// Stage 5: Optional Metadata Enrichment (75-85%)
if (this.options.enrichChunks !== false) {
  await this.updateProgress(75, 'enrichment', 'Enriching chunks with metadata')
  await this.enrichChunks(documentId)
} else {
  console.log('[DocumentProcessing] Skipping metadata enrichment (user opted out)')

  // Mark chunks as skipped
  const enrichmentManager = new ChunkEnrichmentManager(this.supabase, this.jobId)
  await enrichmentManager.markChunksAsUnenriched(documentId, 'user_choice')

  // Auto-skip connections if enrichment skipped
  if (this.options.detectConnections !== false) {
    console.log('[DocumentProcessing] Auto-skipping connections (enrichment required)')
    this.options.detectConnections = false
  }
}

// Stage 6: Optional Connection Detection (85-95%) - EXISTING CODE
if (this.options.detectConnections !== false) {
  await this.updateProgress(90, 'connections', 'Detecting connections')
  await this.detectConnections(documentId)
} else {
  console.log('[DocumentProcessing] Skipping connection detection (user opted out)')
  const connectionManager = new ConnectionDetectionManager(this.supabase, this.jobId)
  await connectionManager.markChunksAsSkipped(this.options.documentId, 'user_choice')
}

// Add enrichChunks method (after detectConnections method)
private async enrichChunks(documentId: string): Promise<void> {
  try {
    const enrichmentManager = new ChunkEnrichmentManager(this.supabase, this.jobId)

    await enrichmentManager.enrichChunks({
      documentId,
      onProgress: async (percent, stage, details) => {
        await this.updateProgress(75 + (percent / 10), stage, details)
      }
    })
  } catch (error: any) {
    console.error(`Chunk enrichment failed: ${error.message}`)
    // Non-fatal: Continue to next stage even if enrichment fails
  }
}
```

#### 2. Process Document Handler
**File**: `worker/handlers/process-document.ts`
**Changes**: Extract enrichChunks flag from input_data

```typescript
// Around line where detectConnections is extracted
const enrichChunks = job.input_data.enrichChunks !== false  // Default: true
const detectConnections = job.input_data.detectConnections !== false

console.log(`[ProcessDocument] Processing flags:`, {
  enrichChunks,
  detectConnections
})

// Pass to DocumentProcessingManager
const manager = new DocumentProcessingManager(supabase, job.id, {
  documentId: job.input_data.document_id,
  userId: job.user_id,
  sourceType: job.input_data.source_type,
  reviewBeforeChunking: job.input_data.reviewBeforeChunking,
  reviewDoclingExtraction: job.input_data.reviewDoclingExtraction,
  enrichChunks,          // NEW
  detectConnections
})
```

#### 3. Chunk Enrichment Manager (NEW FILE)
**File**: `worker/lib/managers/chunk-enrichment-manager.ts`
**Changes**: Create new manager class (mirrors ConnectionDetectionManager)

```typescript
import type { SupabaseClient } from '@supabase/supabase-js'

interface EnrichOptions {
  documentId: string
  chunkIds?: string[]  // Optional: for per-chunk enrichment
  onProgress?: (percent: number, stage: string, details?: string) => void
}

export class ChunkEnrichmentManager {
  constructor(
    private supabase: SupabaseClient,
    private jobId?: string
  ) {}

  /**
   * Enrich chunks with metadata using bulletproof extraction.
   */
  async enrichChunks(options: EnrichOptions): Promise<void> {
    const { documentId, chunkIds, onProgress } = options

    console.log(`[EnrichChunks] Starting for document ${documentId}`)
    if (chunkIds) {
      console.log(`[EnrichChunks] Per-chunk mode: ${chunkIds.length} chunks`)
    } else {
      console.log(`[EnrichChunks] Document-level mode: all chunks`)
    }

    // Get chunks to enrich
    const chunksToEnrich = chunkIds || await this.getAllChunkIds(documentId)

    // Fetch chunk content
    const { data: chunks, error: fetchError } = await this.supabase
      .from('chunks')
      .select('id, chunk_index, content')
      .in('id', chunksToEnrich)
      .order('chunk_index')

    if (fetchError || !chunks) {
      throw new Error(`Failed to fetch chunks: ${fetchError?.message}`)
    }

    console.log(`[EnrichChunks] Fetched ${chunks.length} chunks`)

    // Import bulletproof extraction
    const { bulletproofExtractMetadata } = await import('../chunking/bulletproof-metadata.js')

    // Prepare batch input
    const batchInput = chunks.map(chunk => ({
      id: chunk.id,
      content: chunk.content
    }))

    // Extract metadata with progress tracking
    const results = await bulletproofExtractMetadata(batchInput, {
      maxRetries: 5,
      enableGeminiFallback: false,  // Zero cost (Ollama only)
      onProgress: (processed, total, status) => {
        if (onProgress) {
          const percent = Math.floor((processed / total) * 100)
          onProgress(percent, 'enrichment', `Enriching chunk ${processed}/${total} (${status})`)
        }
      }
    })

    // Apply metadata to chunks in database
    for (const chunk of chunks) {
      const result = results.get(chunk.id)

      if (!result) {
        console.warn(`[EnrichChunks] No result for chunk ${chunk.chunk_index}`)
        continue
      }

      const { error: updateError } = await this.supabase
        .from('chunks')
        .update({
          themes: result.metadata.themes,
          importance_score: result.metadata.importance,
          summary: result.metadata.summary,
          emotional_metadata: {
            polarity: result.metadata.emotional.polarity,
            primaryEmotion: result.metadata.emotional.primaryEmotion,
            intensity: result.metadata.emotional.intensity
          },
          conceptual_metadata: {
            concepts: result.metadata.concepts
          },
          domain_metadata: {
            primaryDomain: result.metadata.domain,
            confidence: 0.8
          },
          metadata_extracted_at: new Date().toISOString(),
          enrichments_detected: true,
          enrichments_detected_at: new Date().toISOString()
        })
        .eq('id', chunk.id)

      if (updateError) {
        console.error(`[EnrichChunks] Failed to update chunk ${chunk.chunk_index}:`, updateError)
      }
    }

    // Log quality distribution
    console.log(`[EnrichChunks] Enrichment complete:`)
    console.log(`  Quality distribution:`)
    console.log(`    - Ollama 32B: ${[...results.values()].filter(r => r.source === 'ollama-32b').length}`)
    console.log(`    - Ollama 14B: ${[...results.values()].filter(r => r.source === 'ollama-14b').length}`)
    console.log(`    - Ollama 7B: ${[...results.values()].filter(r => r.source === 'ollama-7b').length}`)
    console.log(`    - Regex: ${[...results.values()].filter(r => r.source === 'regex').length}`)
    console.log(`    - Fallback: ${[...results.values()].filter(r => r.source === 'fallback').length}`)
  }

  /**
   * Mark chunks as unenriched (user chose to skip).
   */
  async markChunksAsUnenriched(
    documentId: string,
    reason: 'user_choice' | 'error' | 'manual_skip'
  ): Promise<void> {
    const { error } = await this.supabase
      .from('chunks')
      .update({
        enrichments_detected: false,
        enrichment_skipped_reason: reason,
        themes: [],
        importance_score: 0.5,
        summary: null,
        emotional_metadata: null,
        conceptual_metadata: null,
        domain_metadata: null,
        metadata_extracted_at: null
      })
      .eq('document_id', documentId)
      .eq('is_current', true)

    if (error) {
      throw new Error(`Failed to mark chunks as unenriched: ${error.message}`)
    }

    console.log(`[ChunkEnrichmentManager] Marked chunks as unenriched (${reason})`)
  }

  /**
   * Get all chunk IDs for a document.
   */
  private async getAllChunkIds(documentId: string): Promise<string[]> {
    const { data, error } = await this.supabase
      .from('chunks')
      .select('id')
      .eq('document_id', documentId)
      .eq('is_current', true)
      .order('chunk_index')

    if (error || !data) {
      throw new Error(`Failed to get chunk IDs: ${error?.message}`)
    }

    return data.map(c => c.id)
  }
}
```

### Success Criteria

#### Automated Verification:
- [ ] Type check: `npm run type-check` (worker)
- [ ] Build: `cd worker && npm run build`
- [ ] Tests: `cd worker && npm test`

#### Manual Verification:
- [ ] Upload with enrichment OFF → Chunks marked `enrichments_detected=false`, `enrichment_skipped_reason='user_choice'`
- [ ] Upload with enrichment ON → Chunks have metadata, `enrichments_detected=true`
- [ ] Check logs show Stage 5 execution or skip
- [ ] Verify auto-skip: enrichment OFF → connections also skipped

**Implementation Note:** Test complete upload flow with both ON and OFF before proceeding to Phase 4.

### Service Restarts:
- [ ] Worker: Restart via `npm run dev`
- [ ] Supabase: Should still be running from Phase 1

---

## Phase 4: Job Handlers (Enrich Chunks & Enrich+Connect)

### Overview
Create two new job handlers: `enrich-chunks.ts` for manual enrichment and `enrich-and-connect.ts` for combined enrichment+connection workflow.

### Changes Required

#### 1. Enrich Chunks Handler (NEW FILE)
**File**: `worker/handlers/enrich-chunks.ts`
**Changes**: Create handler for manual enrichment trigger

```typescript
import type { BackgroundJob } from '../types/database.js'
import { ChunkEnrichmentManager } from '../lib/managers/chunk-enrichment-manager.js'
import { createClient } from '@/lib/supabase/server'

export async function handleEnrichChunks(job: BackgroundJob): Promise<void> {
  console.log(`[EnrichChunksHandler] Starting job ${job.id}`)

  const supabase = await createClient()
  const { document_id: documentId, chunk_ids: chunkIds } = job.input_data

  // Update job status
  await supabase
    .from('background_jobs')
    .update({
      status: 'processing',
      started_at: new Date().toISOString()
    })
    .eq('id', job.id)

  try {
    const manager = new ChunkEnrichmentManager(supabase, job.id)

    await manager.enrichChunks({
      documentId,
      chunkIds,  // Optional: for per-chunk mode
      onProgress: async (percent, stage, details) => {
        await supabase
          .from('background_jobs')
          .update({
            progress_percentage: percent,
            progress_stage: stage,
            progress_details: details
          })
          .eq('id', job.id)
      }
    })

    // Mark job complete
    await supabase
      .from('background_jobs')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        progress_percentage: 100,
        output_data: {
          success: true,
          chunksEnriched: chunkIds?.length || 'all',
          completedAt: new Date().toISOString()
        }
      })
      .eq('id', job.id)

    console.log(`[EnrichChunksHandler] Job ${job.id} completed successfully`)
  } catch (error: any) {
    console.error(`[EnrichChunksHandler] Job ${job.id} failed:`, error)

    await supabase
      .from('background_jobs')
      .update({
        status: 'failed',
        completed_at: new Date().toISOString(),
        error_message: error.message
      })
      .eq('id', job.id)

    throw error
  }
}
```

#### 2. Enrich and Connect Handler (NEW FILE)
**File**: `worker/handlers/enrich-and-connect.ts`
**Changes**: Sequential enrichment then connection detection

```typescript
import type { BackgroundJob } from '../types/database.js'
import { ChunkEnrichmentManager } from '../lib/managers/chunk-enrichment-manager.js'
import { ConnectionDetectionManager } from '../lib/managers/connection-detection-manager.js'
import { createClient } from '@/lib/supabase/server'

export async function handleEnrichAndConnect(job: BackgroundJob): Promise<void> {
  console.log(`[EnrichAndConnectHandler] Starting job ${job.id}`)

  const supabase = await createClient()
  const { document_id: documentId, chunk_ids: chunkIds } = job.input_data

  await supabase
    .from('background_jobs')
    .update({
      status: 'processing',
      started_at: new Date().toISOString()
    })
    .eq('id', job.id)

  try {
    // STEP 1: Enrichment (0-50% progress)
    console.log(`[EnrichAndConnect] Step 1: Enriching ${chunkIds?.length || 'all'} chunks`)

    const enrichmentManager = new ChunkEnrichmentManager(supabase, job.id)

    await enrichmentManager.enrichChunks({
      documentId,
      chunkIds,
      onProgress: async (percent, stage, details) => {
        const overallPercent = Math.floor(percent / 2)  // 0-50%
        await supabase
          .from('background_jobs')
          .update({
            progress_percentage: overallPercent,
            progress_stage: `enrichment: ${stage}`,
            progress_details: details
          })
          .eq('id', job.id)
      }
    })

    console.log(`[EnrichAndConnect] Enrichment complete, starting connection detection`)

    // STEP 2: Connection Detection (50-100% progress)
    console.log(`[EnrichAndConnect] Step 2: Detecting connections`)

    const connectionManager = new ConnectionDetectionManager(supabase, job.id)

    await connectionManager.detectConnections({
      documentId,
      chunkIds,
      trigger: 'enrich_and_connect',
      onProgress: async (percent, stage, details) => {
        const overallPercent = 50 + Math.floor(percent / 2)  // 50-100%
        await supabase
          .from('background_jobs')
          .update({
            progress_percentage: overallPercent,
            progress_stage: `connections: ${stage}`,
            progress_details: details
          })
          .eq('id', job.id)
      }
    })

    // Mark job complete
    await supabase
      .from('background_jobs')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        progress_percentage: 100,
        output_data: {
          success: true,
          chunksProcessed: chunkIds?.length || 'all',
          enrichmentComplete: true,
          connectionsComplete: true,
          completedAt: new Date().toISOString()
        }
      })
      .eq('id', job.id)

    console.log(`[EnrichAndConnectHandler] Job ${job.id} completed successfully`)
  } catch (error: any) {
    console.error(`[EnrichAndConnectHandler] Job ${job.id} failed:`, error)

    await supabase
      .from('background_jobs')
      .update({
        status: 'failed',
        completed_at: new Date().toISOString(),
        error_message: error.message
      })
      .eq('id', job.id)

    throw error
  }
}
```

#### 3. Worker Index (Job Routing)
**File**: `worker/index.ts`
**Changes**: Add new job types to router

```typescript
// Import handlers
import { handleEnrichChunks } from './handlers/enrich-chunks.js'
import { handleEnrichAndConnect } from './handlers/enrich-and-connect.js'

// In job router switch statement
switch (job.job_type) {
  case 'process_document':
    await handleProcessDocument(job)
    break

  case 'detect_connections':
    await handleDetectConnections(job)
    break

  case 'enrich_chunks':  // NEW
    await handleEnrichChunks(job)
    break

  case 'enrich_and_connect':  // NEW
    await handleEnrichAndConnect(job)
    break

  // ... other handlers
}
```

#### 4. Job Schemas (Zod Validation)
**File**: `worker/types/job-schemas.ts`
**Changes**: Add output schemas for new job types

```typescript
// Enrich Chunks Output Schema
export const EnrichChunksOutputSchema = z.object({
  success: z.boolean(),
  chunksEnriched: z.union([z.number(), z.literal('all')]),
  completedAt: z.string()
})

// Enrich and Connect Output Schema
export const EnrichAndConnectOutputSchema = z.object({
  success: z.boolean(),
  chunksProcessed: z.union([z.number(), z.literal('all')]),
  enrichmentComplete: z.boolean(),
  connectionsComplete: z.boolean(),
  completedAt: z.string()
})

// ALWAYS validate before saving:
// EnrichChunksOutputSchema.parse(outputData)
```

### Success Criteria

#### Automated Verification:
- [ ] Type check: `npm run type-check` (worker)
- [ ] Build: `cd worker && npm run build`
- [ ] Job routing compiles without errors

#### Manual Verification:
- [ ] Create `enrich_chunks` job manually → Handler executes
- [ ] Create `enrich_and_connect` job manually → Both steps execute in sequence
- [ ] Check ProcessingDock shows progress updates
- [ ] Verify Zod validation passes for output_data

**Implementation Note:** Test job handlers manually via database inserts before adding UI buttons.

### Service Restarts:
- [ ] Worker: Restart via `npm run dev`

---

## Phase 5: UI Components (4 Locations)

### Overview
Add enrichment buttons to ChunkMetadataIcon, chunk-card, Admin Panel, and document cards. Three buttons total: "Enrich Chunk", "Detect Connections" (existing), "Enrich & Connect" (combo).

### Changes Required

#### 1. ChunkMetadataIcon Component
**File**: `src/components/reader/ChunkMetadataIcon.tsx`
**Changes**: Add enrichment status section with 3 buttons

```typescript
// Add state
const [isEnriching, setIsEnriching] = useState(false)

// Add metadata extraction
const metadata = {
  // ... existing fields
  enrichmentsDetected: chunk.enrichments_detected,
  enrichmentsDetectedAt: chunk.enrichments_detected_at,
  enrichmentSkippedReason: chunk.enrichment_skipped_reason
}

// Add handlers
const handleEnrichChunk = async () => {
  setIsEnriching(true)
  try {
    const result = await enrichChunksForDocument(documentId, [chunk.id])
    if (result.success && result.jobId) {
      registerJob(result.jobId, 'enrich_chunks', {
        documentId,
        chunkIds: [chunk.id],
        title: `Chunk ${chunkIndex}`
      })
    }
  } catch (error) {
    console.error('Failed to enrich chunk:', error)
  } finally {
    setIsEnriching(false)
  }
}

const handleEnrichAndConnect = async () => {
  setIsEnriching(true)
  try {
    const result = await enrichAndConnectChunks(documentId, [chunk.id])
    if (result.success && result.jobId) {
      registerJob(result.jobId, 'enrich_and_connect', {
        documentId,
        chunkIds: [chunk.id],
        title: `Chunk ${chunkIndex}`
      })
    }
  } catch (error) {
    console.error('Failed to enrich and connect:', error)
  } finally {
    setIsEnriching(false)
  }
}

// In JSX (BEFORE Connection Detection Status section)
{/* Enrichment Status */}
<div className="border-t pt-3">
  <div className="flex items-center justify-between mb-2">
    <div className="flex items-center gap-2">
      <Sparkles className="h-3 w-3 text-muted-foreground" />
      <span className="text-xs font-medium">Enrichment</span>
    </div>
    {metadata.enrichmentsDetected ? (
      <Badge variant="secondary" className="text-xs">
        <CheckCircle className="h-3 w-3 mr-1" />
        Enriched
      </Badge>
    ) : metadata.enrichmentSkippedReason ? (
      <Badge variant="outline" className="text-xs">
        Skipped ({metadata.enrichmentSkippedReason})
      </Badge>
    ) : (
      <Badge variant="outline" className="text-xs">
        Not enriched
      </Badge>
    )}
  </div>

  {metadata.enrichmentsDetectedAt && (
    <p className="text-xs text-muted-foreground mb-2">
      Enriched {new Date(metadata.enrichmentsDetectedAt).toLocaleDateString()}
    </p>
  )}

  {!metadata.enrichmentsDetected && (
    <div className="space-y-2">
      <Button
        size="sm"
        variant="outline"
        className="w-full text-xs"
        onClick={handleEnrichChunk}
        disabled={isEnriching}
      >
        {isEnriching ? (
          <>
            <Loader2 className="h-3 w-3 mr-1 animate-spin" />
            Enriching...
          </>
        ) : (
          <>
            <Sparkles className="h-3 w-3 mr-1" />
            Enrich Chunk
          </>
        )}
      </Button>

      <Button
        size="sm"
        variant="default"
        className="w-full text-xs"
        onClick={handleEnrichAndConnect}
        disabled={isEnriching}
      >
        {isEnriching ? (
          <>
            <Loader2 className="h-3 w-3 mr-1 animate-spin" />
            Processing...
          </>
        ) : (
          <>
            <Sparkles className="h-3 w-3 mr-1" />
            Enrich & Connect
          </>
        )}
      </Button>
    </div>
  )}
</div>

{/* Connection Detection Status - EXISTING (keep as-is) */}
```

#### 2. Chunk Card Component
**File**: `src/components/rhizome/chunk-card.tsx`
**Changes**: Add enrichment buttons in detailed mode

```typescript
// Add state
const [isEnriching, setIsEnriching] = useState(false)

// Add handlers (same as ChunkMetadataIcon)
const handleEnrich = useCallback(async (e: React.MouseEvent) => {
  e.stopPropagation()
  setIsEnriching(true)

  try {
    const result = await enrichChunksForDocument(documentId, [chunk.id])
    toast.success('Enrichment started', {
      description: 'Check ProcessingDock for progress'
    })
  } catch (error) {
    console.error('[ChunkCard] Enrichment failed:', error)
    toast.error('Failed to start enrichment')
  } finally {
    setIsEnriching(false)
  }
}, [documentId, chunk.id])

const handleEnrichAndConnect = useCallback(async (e: React.MouseEvent) => {
  e.stopPropagation()
  setIsEnriching(true)

  try {
    const result = await enrichAndConnectChunks(documentId, [chunk.id])
    toast.success('Enrich & Connect started', {
      description: 'Check ProcessingDock for progress'
    })
  } catch (error) {
    console.error('[ChunkCard] Enrich & Connect failed:', error)
    toast.error('Failed to start process')
  } finally {
    setIsEnriching(false)
  }
}, [documentId, chunk.id])

// In detailed mode JSX (BEFORE detection action)
{/* Enrichment action */}
{!chunk.enrichments_detected && (
  <div className="space-y-2">
    <Button
      onClick={handleEnrich}
      disabled={isEnriching}
      variant="outline"
      className="w-full"
      size="sm"
    >
      {isEnriching ? (
        <>
          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          Enriching...
        </>
      ) : (
        <>
          <Sparkles className="h-4 w-4 mr-2" />
          Enrich Chunk
        </>
      )}
    </Button>

    <Button
      onClick={handleEnrichAndConnect}
      disabled={isEnriching}
      className="w-full"
      size="sm"
    >
      {isEnriching ? (
        <>
          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          Processing...
        </>
      ) : (
        <>
          <Sparkles className="h-4 w-4 mr-2" />
          Enrich & Connect
        </>
      )}
    </Button>
  </div>
)}

{/* Enrichment timestamp */}
{detailedChunk.enrichments_detected_at && (
  <p className="text-xs text-muted-foreground text-center">
    Enriched {new Date(detailedChunk.enrichments_detected_at).toLocaleDateString()}
  </p>
)}

{/* Detection action - EXISTING (keep as-is, shows only if enriched) */}
{!chunk.connections_detected && chunk.enrichments_detected && (
  <Button onClick={handleDetect} ...>
    Detect Connections
  </Button>
)}
```

#### 3. Admin Panel - Enrichments Tab (NEW FILE)
**File**: `src/components/admin/tabs/EnrichmentsTab.tsx`
**Changes**: Create new tab for batch enrichment operations

```typescript
'use client'

import { useState } from 'react'
import { Button } from '@/components/rhizome/button'
import { Badge } from '@/components/rhizome/badge'
import { Sparkles, Loader2, CheckCircle2 } from 'lucide-react'
import { enrichAllUnenrichedChunks, loadChunkEnrichmentStats } from '@/app/actions/enrichments'
import { toast } from 'sonner'

export function EnrichmentsTab() {
  const [isEnriching, setIsEnriching] = useState(false)
  const [stats, setStats] = useState<{
    total: number
    enriched: number
    skipped: number
    pending: number
  } | null>(null)

  const handleEnrichAll = async () => {
    // TODO: Get current document ID from context/state
    const documentId = 'current-doc-id'

    setIsEnriching(true)
    try {
      const result = await enrichAllUnenrichedChunks(documentId)

      if (result.success) {
        toast.success(`Enriching ${result.chunkCount} chunks`, {
          description: 'Check ProcessingDock for progress'
        })
      } else {
        toast.info(result.error || 'All chunks already enriched')
      }
    } catch (error) {
      console.error('[EnrichmentsTab] Failed:', error)
      toast.error('Failed to start enrichment')
    } finally {
      setIsEnriching(false)
    }
  }

  const loadStats = async () => {
    // TODO: Get current document ID
    const documentId = 'current-doc-id'
    const data = await loadChunkEnrichmentStats(documentId)
    setStats(data)
  }

  return (
    <div className="space-y-4 p-4">
      <div>
        <h3 className="text-lg font-semibold mb-2">Chunk Enrichment</h3>
        <p className="text-sm text-muted-foreground">
          Enrich chunks with metadata (themes, concepts, emotions) using local Ollama models.
        </p>
      </div>

      {/* Statistics */}
      {stats && (
        <div className="grid grid-cols-4 gap-4">
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Total</p>
            <p className="text-2xl font-bold">{stats.total}</p>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Enriched</p>
            <p className="text-2xl font-bold text-green-600">{stats.enriched}</p>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Pending</p>
            <p className="text-2xl font-bold text-orange-600">{stats.pending}</p>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Skipped</p>
            <p className="text-2xl font-bold text-gray-600">{stats.skipped}</p>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="space-y-2">
        <Button onClick={loadStats} variant="outline" className="w-full">
          Load Statistics
        </Button>

        <Button
          onClick={handleEnrichAll}
          disabled={isEnriching}
          className="w-full"
        >
          {isEnriching ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Enriching...
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4 mr-2" />
              Enrich All Pending
            </>
          )}
        </Button>
      </div>
    </div>
  )
}
```

#### 4. Admin Panel Integration
**File**: `src/components/admin/AdminPanel.tsx`
**Changes**: Add EnrichmentsTab to tab list

```typescript
import { EnrichmentsTab } from './tabs/EnrichmentsTab'

// In tabs array
const tabs = [
  { id: 'scanner', label: 'Scanner', component: ScannerTab },
  { id: 'import', label: 'Import', component: ImportTab },
  { id: 'export', label: 'Export', component: ExportTab },
  { id: 'enrichments', label: 'Enrichments', component: EnrichmentsTab },  // NEW
  { id: 'connections', label: 'Connections', component: ConnectionsTab },
  { id: 'integrations', label: 'Integrations', component: IntegrationsTab },
  { id: 'jobs', label: 'Jobs', component: JobsTab }
]
```

#### 5. Document Card (Library View)
**File**: `src/components/library/DocumentList.tsx` (or DocumentCard component)
**Changes**: Add enrichment button to document cards

```typescript
// In DocumentCard component
{doc.enrichmentStats?.pending > 0 && (
  <Button
    size="sm"
    variant="outline"
    onClick={() => enrichAllUnenrichedChunks(doc.id)}
  >
    <Sparkles className="h-3 w-3 mr-1" />
    Enrich ({doc.enrichmentStats.pending} pending)
  </Button>
)}
```

### Success Criteria

#### Automated Verification:
- [ ] Type check: `npm run type-check`
- [ ] Build: `npm run build`
- [ ] Linting: `npm run lint`

#### Manual Verification:
- [ ] ChunkMetadataIcon shows enrichment status section
- [ ] ChunkCard shows enrichment buttons in detailed mode
- [ ] Admin Panel has "Enrichments" tab
- [ ] Document cards show enrichment button when pending chunks exist
- [ ] Buttons trigger Server Actions correctly
- [ ] ProcessingDock shows enrichment progress
- [ ] Toasts appear on success/error

**Implementation Note:** Test each UI location independently before marking complete.

### Service Restarts:
- [ ] Next.js: Auto-reload should work

---

## Testing Strategy

### Unit Tests

**Enrichment Manager** (`worker/lib/managers/__tests__/chunk-enrichment-manager.test.ts`):
```typescript
describe('ChunkEnrichmentManager', () => {
  test('should enrich chunks with metadata', async () => {
    // Mock bulletproof extraction
    // Call enrichChunks()
    // Verify database updates
  })

  test('should mark chunks as unenriched with reason', async () => {
    // Call markChunksAsUnenriched('user_choice')
    // Verify enrichment_skipped_reason set
  })

  test('should handle per-chunk enrichment', async () => {
    // Call with chunkIds array
    // Verify only specified chunks enriched
  })
})
```

**Job Handlers** (`worker/handlers/__tests__/enrich-chunks.test.ts`):
```typescript
describe('EnrichChunks Handler', () => {
  test('should process enrich_chunks job', async () => {
    // Create mock job
    // Call handler
    // Verify job status updated to completed
  })

  test('should handle enrichment failure gracefully', async () => {
    // Mock extraction failure
    // Verify job marked as failed
  })
})
```

### Integration Tests

**Upload Flow with Enrichment Skip** (`tests/e2e/enrichment-skip.spec.ts`):
```typescript
test('upload with enrichment disabled', async ({ page }) => {
  // Navigate to upload
  // Toggle "Enrich Chunks" OFF
  // Verify "Detect Connections" auto-disabled
  // Upload document
  // Verify chunks.enrichment_skipped_reason = 'user_choice'
  // Verify chunks.enrichments_detected = false
})

test('manual enrichment trigger', async ({ page }) => {
  // Upload with enrichment OFF
  // Navigate to chunk card
  // Click "Enrich Chunk"
  // Verify background job created
  // Wait for completion
  // Verify chunks.enrichments_detected = true
})
```

### Manual Testing

1. **Upload Flow:**
   - [ ] Upload with enrichment ON → Chunks enriched, metadata populated
   - [ ] Upload with enrichment OFF → Chunks not enriched, skip reason set
   - [ ] Toggle enrichment OFF → Connections auto-disabled
   - [ ] Try enabling connections with enrichment OFF → Should be disabled

2. **Manual Enrichment:**
   - [ ] ChunkMetadataIcon "Enrich Chunk" → Single chunk enriched
   - [ ] ChunkCard "Enrich Chunk" → Single chunk enriched
   - [ ] Admin Panel "Enrich All Pending" → All unenriched chunks enriched
   - [ ] "Enrich & Connect" → Both stages execute in sequence

3. **UI Feedback:**
   - [ ] ProcessingDock shows enrichment progress
   - [ ] Toasts appear on success/error
   - [ ] Enrichment status badges update correctly
   - [ ] Statistics in Admin Panel reflect current state

4. **Dependency Enforcement:**
   - [ ] Upload with enrichment OFF → Connections auto-skipped
   - [ ] Enrich chunk → Connection detection button becomes available
   - [ ] "Detect Connections" button only shown for enriched chunks

## Performance Considerations

**Enrichment Performance:**
- Local Ollama models: ~30-60s per document (batch of 10 chunks)
- Zero API cost (no Gemini calls)
- Bulletproof extraction ensures metadata for every chunk (6-tier fallback)

**Database Query Optimization:**
- Partial index on `enrichments_detected = false` for fast filtering
- RPC functions handle filtering in-database (no data transfer overhead)
- Batch updates when marking chunks (single query per document)

**UI Performance:**
- Optimistic updates for button states (immediate feedback)
- Progress tracking via ProcessingDock (no page polling)
- Statistics loaded on-demand (Admin Panel tab activation)

## Migration Notes

**Backfill Strategy:**
- Existing chunks with `metadata_extracted_at IS NOT NULL` marked as `enrichments_detected = true`
- Timestamp copied from `metadata_extracted_at` to `enrichments_detected_at`
- Chunks without metadata remain `enrichments_detected = false` (pending state)

**Rollback Plan:**
```sql
-- Rollback migration 072
ALTER TABLE chunks
  DROP COLUMN enrichments_detected,
  DROP COLUMN enrichments_detected_at,
  DROP COLUMN enrichment_skipped_reason;

DROP FUNCTION get_chunk_enrichment_stats;
DROP FUNCTION get_unenriched_chunk_ids;
```

## References

- **Architecture**: `docs/ARCHITECTURE.md`
- **Pipeline**: `docs/PROCESSING_PIPELINE.md`
- **Testing**: `docs/testing/TESTING_RULES.md`
- **Similar Implementation**: Connection detection skip (`supabase/migrations/070_chunk_connection_detection.sql`)
- **Enrichment Logic**: `worker/lib/chunking/bulletproof-metadata.ts`
- **Processing Manager**: `worker/lib/managers/document-processing-manager.ts:358-419`
