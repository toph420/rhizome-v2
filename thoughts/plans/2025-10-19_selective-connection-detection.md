# Selective Connection Detection - Implementation Plan

**Created**: 2025-10-19
**Status**: Ready for Implementation
**Priority**: High
**Estimated Time**: 30-40 hours

---

## Overview

Transform connection detection from automatic all-or-nothing to flexible, user-driven progressive enhancement. Users can skip detection during upload, detect connections for individual chunks while reading, batch detect multiple chunks, or detect all undetected chunks from Admin Panel.

**Core Philosophy**: Connection detection is expensive (time + compute). Users should control when and what gets detected.

---

## Current State Analysis

### Connection Detection Architecture (worker/)

**Decoupled Jobs** (worker/handlers/process-document.ts:513-556):
- `process-document` creates separate `detect-connections` job after chunking/embedding
- Jobs run asynchronously to prevent timeout during expensive AI operations
- Deduplication check prevents duplicate detection jobs (lines 520-530)

**Orchestrator** (worker/engines/orchestrator.ts:38-157):
- Coordinates all 3 engines sequentially (can parallelize later - line 59 comment)
- Progress: Semantic (25%) → Contradiction (50%) → Thematic (75%) → Save (90%) → Complete (100%)
- Duplicate detection before database insert (lines 108-140)

**All 3 Engines Support Filtering**:
- **Semantic Similarity** (worker/engines/semantic-similarity.ts:74-83, 133-142):
  - `targetDocumentIds?: string[]` - Filter connections to specific target documents
  - `reprocessingBatch?: string` - Query chunks by batch ID instead of `is_current`

- **Contradiction Detection** (worker/engines/contradiction-detection.ts:54-65, 107-112):
  - Same filtering parameters as Semantic

- **Thematic Bridge** (worker/engines/thematic-bridge.ts:62-83, 125-132):
  - Same filtering parameters as Semantic
  - AI call reduction via `targetDocumentIds` (line 125 comment: "CRITICAL: reduces AI calls significantly!")

**NO Per-Chunk Filtering Yet**:
- Engines process ALL chunks in document
- No `sourceChunkIds` parameter exists
- Cannot detect connections for specific chunk selection

### Database Schema

**Chunks Table** (migration 019):
- **NO** `connections_detected` column yet
- **NO** `connections_detected_at` column yet
- 16 columns: id, document_id, content, chunk_index, offsets, metadata, embeddings, etc.

**Background Jobs Table** (migration 052):
- Has pause/resume fields from recent migration
- `input_data` JSONB for job parameters
- `progress` JSONB for status tracking

**Latest Migration**: `052_job_pause_resume.sql` (next is 053)

### Upload Flow

**DocumentPreview** (src/components/upload/DocumentPreview.tsx:334-419):
- Has checkboxes for: cleanMarkdown, extractImages, chunkerType
- **NO** connection detection checkbox yet
- Passes flags to uploadDocument server action

### Discovered Patterns

**Server Actions** (src/app/actions/documents.ts):
- File is 1288 lines - getting large
- Has `reprocessConnections` at line 1020
- Pattern: create background job → return jobId → track in UI

**Card Patterns**:
- **ConnectionCard** (src/components/sidebar/ConnectionCard.tsx): Card + CardHeader + CardContent + border colors + click handlers
- **AnnotationsList** (src/components/sidebar/AnnotationsList.tsx): Card with inline editing + collapsible
- **SparksTab** (src/components/sidebar/SparksTab.tsx): Simpler cards with collapsible context

**Selection Patterns**:
- **ExportTab**: Multi-select with `Set<string>`, checkboxes, batch actions bar
- **ImportTab**: Similar selection pattern with options checkboxes

**State Management**:
- **background-jobs.ts**: Unified job tracking with auto-polling (Map<string, JobStatus>)
- Custom Map serialization for localStorage persistence

---

## Desired End State

### User Workflows

1. **Upload**: Checkbox "Detect connections after processing" (unchecked by default - opt-in)
2. **Reading**: Hover chunk → tooltip shows detection status → "Detect Now" button
3. **Batch from Tooltip**: "Add to Batch" button → selects chunk in Chunks tab
4. **Chunks Tab**: Select multiple chunks → "Detect Connections for 5 Chunks" button
5. **Admin Panel**: "Detect All Undetected Chunks (367)" button with stats

### Database

**Chunks Table** (migration 053):
```sql
ALTER TABLE chunks
  ADD COLUMN connections_detected BOOLEAN DEFAULT false,
  ADD COLUMN connections_detected_at TIMESTAMP WITH TIME ZONE;

CREATE INDEX idx_chunks_connections_detected
  ON chunks(document_id, connections_detected);
```

**Helper Function**:
```sql
CREATE OR REPLACE FUNCTION get_chunk_detection_stats(doc_id uuid)
RETURNS TABLE (
  total bigint,
  detected bigint,
  undetected bigint,
  percentage numeric
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*)::bigint as total,
    COUNT(*) FILTER (WHERE connections_detected = true)::bigint as detected,
    COUNT(*) FILTER (WHERE connections_detected = false)::bigint as undetected,
    CASE
      WHEN COUNT(*) = 0 THEN 0
      ELSE ROUND((COUNT(*) FILTER (WHERE connections_detected = true)::numeric / COUNT(*)::numeric * 100), 1)
    END as percentage
  FROM chunks
  WHERE document_id = doc_id;
END;
$$ LANGUAGE plpgsql;
```

### Worker Architecture

**Orchestrator Extension** (worker/engines/orchestrator.ts):
```typescript
export interface OrchestratorConfig {
  enabledEngines?: ('semantic_similarity' | 'contradiction_detection' | 'thematic_bridge')[];
  sourceChunkIds?: string[];  // NEW: Filter to specific chunks
  targetDocumentIds?: string[];
  reprocessingBatch?: string;
  // ... engine configs
  onProgress?: (percent: number, stage: string, details: string) => Promise<void>;
}
```

**All 3 Engines Updated** to accept `sourceChunkIds`:
```typescript
// Example: semantic-similarity.ts
let sourceQuery = supabase
  .from('chunks')
  .select('id, document_id, embedding, importance_score')
  .eq('document_id', documentId)
  .not('embedding', 'is', null);

// NEW: Filter to specific chunks if provided
if (sourceChunkIds && sourceChunkIds.length > 0) {
  sourceQuery = sourceQuery.in('id', sourceChunkIds);
  console.log(`[Engine] Filtering to ${sourceChunkIds.length} source chunks`);
}
```

**Handler Updates**:
- `detect-connections.ts`: Accept `chunk_ids` from `input_data`, mark chunks as detected after processing
- `process-document.ts`: Accept `detect_connections` flag (default: false), conditionally create detection job

### Frontend Architecture

**New Server Actions** (src/app/actions/connections.ts):
- `detectChunkConnections(documentId, chunkIds[])`
- `detectAllUndetectedChunks(documentId)`
- `getChunkDetectionStats(documentId)`
- `getUndetectedChunkIds(documentId)`
- `getChunksMetadata(documentId)`
- `getChunkContent(chunkId)`

**New Zustand Store** (src/stores/chunk-detection-store.ts):
- Selection state: `selectedChunkIds: Set<string>`
- Document tracking: `currentDocumentId: string | null`
- Actions: toggleChunk, clearSelection, batchDetectConnections

**New UI Components** (src/components/sidebar/):
- `ChunksTab.tsx` - 3 sub-tabs container
- `ChunkStatsOverview.tsx` - Stats cards + batch detect all
- `AllChunksView.tsx` - Virtualized list with Virtuoso
- `ChunkCard.tsx` - ConnectionCard pattern with checkbox
- `BatchActionsBar.tsx` - Floating bar for selections

**Updated Components**:
- `ChunkMetadataIcon.tsx` - Add detection status + action buttons
- `ConnectionsTab.tsx` (Admin) - Add detection stats section
- `RightPanel.tsx` - Replace Quality tab with Chunks tab

---

## Rhizome Architecture

- **Module**: Both (Main App + Worker)
- **Storage**: Database (chunks table + background_jobs)
- **Migration**: Yes - `053_chunk_connection_detection.sql`
- **Test Tier**: Critical (blocks deployment)
- **Pipeline**: Stage 9 (Connection Detection) modifications
- **Engines**: All 3 (Semantic, Contradiction, Thematic)

---

## What We're NOT Doing

- Cost estimation for cloud mode (LOCAL focus)
- Bulk chunk actions beyond detection (merge, split, edit)
- Connection quality scoring/ranking
- Chunk editing from Chunks tab
- Export/import detection status
- Analytics dashboard for connection patterns
- Keyboard shortcuts for chunk navigation
- Smart/progressive detection (ML-based prioritization)

---

## Implementation Approach

**Incremental, Testable Phases**:
1. Database foundation (migration, indexes, helper functions)
2. Worker backend (orchestrator, engines, handlers)
3. Server actions API layer
4. Client state management
5. UI components (Chunks tab, reader tooltip, admin panel)
6. Testing and polish

**Key Design Decisions**:
- Chunk-level tracking (not document-level) for granular control
- Unchecked by default (opt-in model, user controls expensive operations)
- All 3 engines modified together (identical pattern, easier maintenance)
- ConnectionCard pattern for consistency with existing UI
- Virtualized list for performance with 500+ chunks

---

## Phase 1: Database & Job System (Foundation)

**Time**: 4-6 hours
**Priority**: Critical

### Overview

Create database schema for chunk-level connection detection tracking and update worker job handlers to support selective detection.

### Changes Required

#### 1. Migration 053: Chunk Connection Detection

**File**: `supabase/migrations/053_chunk_connection_detection.sql` (NEW)

**Changes**: Add detection tracking columns to chunks table

```sql
-- Add detection status columns to chunks table
ALTER TABLE chunks
  ADD COLUMN connections_detected BOOLEAN DEFAULT false,
  ADD COLUMN connections_detected_at TIMESTAMP WITH TIME ZONE;

-- Add comment explaining the columns
COMMENT ON COLUMN chunks.connections_detected IS 'Whether connection detection has been run for this chunk';
COMMENT ON COLUMN chunks.connections_detected_at IS 'Timestamp when connection detection last completed for this chunk';

-- Index for efficient queries (document + detection status)
CREATE INDEX idx_chunks_connections_detected
  ON chunks(document_id, connections_detected);

-- Migration strategy: Mark all existing chunks as undetected
-- This allows users to selectively re-detect if desired
UPDATE chunks SET connections_detected = false WHERE connections_detected IS NULL;

-- Helper function for chunk detection statistics
CREATE OR REPLACE FUNCTION get_chunk_detection_stats(doc_id uuid)
RETURNS TABLE (
  total bigint,
  detected bigint,
  undetected bigint,
  percentage numeric
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*)::bigint as total,
    COUNT(*) FILTER (WHERE connections_detected = true)::bigint as detected,
    COUNT(*) FILTER (WHERE connections_detected = false)::bigint as undetected,
    CASE
      WHEN COUNT(*) = 0 THEN 0
      ELSE ROUND((COUNT(*) FILTER (WHERE connections_detected = true)::numeric / COUNT(*)::numeric * 100), 1)
    END as percentage
  FROM chunks
  WHERE document_id = doc_id;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_chunk_detection_stats IS 'Returns detection statistics for a document: total chunks, detected count, undetected count, completion percentage';
```

#### 2. Orchestrator: Add sourceChunkIds Parameter

**File**: `worker/engines/orchestrator.ts`

**Changes**: Extend OrchestratorConfig interface and pass to engines

```typescript
// Lines 15-23: Extend OrchestratorConfig interface
export interface OrchestratorConfig {
  enabledEngines?: ('semantic_similarity' | 'contradiction_detection' | 'thematic_bridge')[];
  sourceChunkIds?: string[];  // NEW: If provided, only detect for these chunks
  targetDocumentIds?: string[];
  reprocessingBatch?: string;
  semanticSimilarity?: SemanticSimilarityConfig;
  contradictionDetection?: ContradictionDetectionConfig;
  thematicBridge?: ThematicBridgeConfig;
  onProgress?: (percent: number, stage: string, details: string) => Promise<void>;
}

// Lines 38-70: Update processDocument function
export async function processDocument(
  documentId: string,
  config: OrchestratorConfig = {}
): Promise<OrchestratorResult> {
  const { sourceChunkIds, targetDocumentIds, enabledEngines, onProgress } = config;

  console.log(`[Orchestrator] Processing document ${documentId}`);
  if (sourceChunkIds && sourceChunkIds.length > 0) {
    console.log(`[Orchestrator] Detecting for ${sourceChunkIds.length} specific chunk(s)`);
  } else {
    console.log(`[Orchestrator] Detecting for all chunks in document`);
  }

  // Run engines with sourceChunkIds filter
  if (enabledEngines.includes('semantic_similarity')) {
    await onProgress?.(25, 'semantic-similarity', 'Finding semantic similarities');
    const connections = await runSemanticSimilarity(documentId, {
      ...config.semanticSimilarity,
      sourceChunkIds,  // NEW: Pass through
      targetDocumentIds,
      reprocessingBatch: config.reprocessingBatch
    });
    allConnections.push(...connections);
    byEngine.semantic_similarity = connections.length;
  }

  // Similar for contradiction_detection and thematic_bridge...
}
```

#### 3. All 3 Engines: Add sourceChunkIds Filtering

**Pattern applies to**:
- `worker/engines/semantic-similarity.ts`
- `worker/engines/contradiction-detection.ts`
- `worker/engines/thematic-bridge.ts`

**Example** (semantic-similarity.ts):

```typescript
// Lines 31-56: Extend SemanticSimilarityConfig
export interface SemanticSimilarityConfig {
  threshold?: number;
  maxResultsPerChunk?: number;
  importanceWeight?: number;
  crossDocumentOnly?: boolean;
  targetDocumentIds?: string[];
  sourceChunkIds?: string[];  // NEW
  reprocessingBatch?: string;
}

// Lines 74-90: Add sourceChunkIds filtering to source query
export async function runSemanticSimilarity(
  documentId: string,
  config: SemanticSimilarityConfig = {}
): Promise<ChunkConnection[]> {
  const {
    sourceChunkIds,  // NEW
    targetDocumentIds,
    reprocessingBatch,
    threshold = 0.7,
    maxResultsPerChunk = 50,
    crossDocumentOnly = true
  } = config;

  // Get source chunks
  let sourceQuery = supabase
    .from('chunks')
    .select('id, document_id, embedding, importance_score')
    .eq('document_id', documentId)
    .not('embedding', 'is', null);

  // NEW: Filter to specific chunks if provided
  if (sourceChunkIds && sourceChunkIds.length > 0) {
    sourceQuery = sourceQuery.in('id', sourceChunkIds);
    console.log(`[SemanticSimilarity] Filtering to ${sourceChunkIds.length} source chunks`);
  }

  // Existing reprocessing logic
  if (reprocessingBatch) {
    sourceQuery = sourceQuery.eq('reprocessing_batch', reprocessingBatch);
  } else {
    sourceQuery = sourceQuery.eq('is_current', true);
  }

  const { data: sourceChunks } = await sourceQuery;
  console.log(`[SemanticSimilarity] Processing ${sourceChunks?.length || 0} source chunks`);

  // Rest of engine logic...
}
```

**Apply same pattern to**:
- `contradiction-detection.ts` (lines 54-65)
- `thematic-bridge.ts` (lines 62-83)

#### 4. Handler: detect-connections.ts Update

**File**: `worker/handlers/detect-connections.ts`

**Changes**: Accept chunk_ids from input_data, mark chunks as detected after processing

```typescript
// Lines 17-18: Update handler signature
export async function detectConnectionsHandler(supabase: any, job: any): Promise<void> {
  const { document_id, chunk_ids, chunk_count, trigger } = job.input_data;  // NEW: chunk_ids

  console.log(`[DetectConnections] Starting handler`);
  console.log(`  Document: ${document_id}`);
  console.log(`  Chunks: ${chunk_ids ? chunk_ids.length : 'ALL'} (trigger: ${trigger})`);

  async function updateProgress(percent: number, stage: string, details?: string) {
    await supabase
      .from('background_jobs')
      .update({
        progress: {
          percent,
          stage,
          details: details || `${stage}: ${percent}%`
        },
        status: 'processing'
      })
      .eq('id', job.id);
  }

  try {
    await updateProgress(0, 'detect-connections', 'Starting connection detection');

    // Use orchestrator with optional chunk filtering
    const result = await processDocument(document_id, {
      enabledEngines: ['semantic_similarity', 'contradiction_detection', 'thematic_bridge'],
      sourceChunkIds: chunk_ids,  // NEW: undefined = all chunks, array = specific chunks
      onProgress: updateProgress,
      semanticSimilarity: {
        threshold: 0.7,
        maxResultsPerChunk: 50,
        crossDocumentOnly: true
      },
      contradictionDetection: {
        minConceptOverlap: 0.5,
        polarityThreshold: 0.3,
        maxResultsPerChunk: 20,
        crossDocumentOnly: true
      },
      thematicBridge: {
        minImportance: 0.6,
        minStrength: 0.6,
        maxSourceChunks: 50,
        maxCandidatesPerSource: 10,
        batchSize: 5
      }
    });

    console.log(`[DetectConnections] Successfully created ${result.totalConnections} connections`);
    console.log(`[DetectConnections] Breakdown:`, result.byEngine);

    // NEW: Mark chunks as detected
    if (chunk_ids && chunk_ids.length > 0) {
      // Specific chunks
      await supabase
        .from('chunks')
        .update({
          connections_detected: true,
          connections_detected_at: new Date().toISOString()
        })
        .in('id', chunk_ids);

      console.log(`[DetectConnections] Marked ${chunk_ids.length} chunks as detected`);
    } else {
      // All chunks in document
      await supabase
        .from('chunks')
        .update({
          connections_detected: true,
          connections_detected_at: new Date().toISOString()
        })
        .eq('document_id', document_id)
        .eq('is_current', true);

      console.log(`[DetectConnections] Marked all chunks in document as detected`);
    }

    await updateProgress(100, 'complete', `Found ${result.totalConnections} connections`);

    await supabase
      .from('background_jobs')
      .update({
        status: 'completed',
        progress: {
          percent: 100,
          stage: 'complete',
          details: `Found ${result.totalConnections} connections`
        },
        output_data: {
          totalConnections: result.totalConnections,
          byEngine: result.byEngine,
          chunksProcessed: chunk_ids?.length || chunk_count
        },
        completed_at: new Date().toISOString()
      })
      .eq('id', job.id);

  } catch (error: any) {
    console.error('[DetectConnections] Handler error:', error);

    await supabase
      .from('background_jobs')
      .update({
        status: 'failed',
        last_error: error.message,
        completed_at: new Date().toISOString()
      })
      .eq('id', job.id);

    throw error;
  }
}
```

#### 5. Handler: process-document.ts Update

**File**: `worker/handlers/process-document.ts`

**Changes**: Accept detect_connections flag, conditionally create detection job

```typescript
// Lines 97-98: Update handler signature
export async function processDocumentHandler(supabase: any, job: any): Promise<void> {
  const { document_id, detect_connections = false } = job.input_data;  // NEW: default false

  // ... existing processing logic (extract, chunk, embed) ...

  // Lines 513-556: After processing completes successfully
  if (detect_connections) {
    console.log(`[ProcessDocument] Auto-triggering connection detection`);

    // Get chunk count for the document
    const { count: chunkCount } = await supabase
      .from('chunks')
      .select('*', { count: 'exact', head: true })
      .eq('document_id', document_id)
      .eq('is_current', true);

    // Create connection detection job
    const { data: detectionJob } = await supabase
      .from('background_jobs')
      .insert({
        user_id: job.user_id,
        job_type: 'detect-connections',
        entity_type: 'document',
        entity_id: document_id,
        status: 'pending',
        input_data: {
          document_id,
          chunk_count: chunkCount,
          trigger: 'upload'
        },
        metadata: {
          documentTitle: job.metadata?.documentTitle,
          displayName: `Detect Connections - All Chunks (${chunkCount})`
        }
      })
      .select()
      .single();

    console.log(`[ProcessDocument] Created detection job ${detectionJob.id}`);
  } else {
    console.log(`[ProcessDocument] Skipping connection detection (user opt-out)`);

    // Mark all chunks as undetected
    await supabase
      .from('chunks')
      .update({ connections_detected: false })
      .eq('document_id', document_id)
      .eq('is_current', true);
  }
}
```

### Success Criteria

#### Automated Verification:
- [ ] Migration applies: `npx supabase db reset`
- [ ] Chunks table has new columns: `psql -c "\d chunks"`
- [ ] Helper function exists: `psql -c "\df get_chunk_detection_stats"`
- [ ] Type check: `cd worker && npm run type-check`

#### Manual Verification:
- [ ] Create test document with 10 chunks
- [ ] Call helper function: returns {total: 10, detected: 0, undetected: 10, percentage: 0}
- [ ] Manually insert detection job with chunk_ids: [chunk1, chunk2]
- [ ] Verify only those 2 chunks marked as detected
- [ ] Call helper function: returns {total: 10, detected: 2, undetected: 8, percentage: 20}

### Service Restarts:
- [ ] Supabase: `npx supabase db reset` (schema changed)
- [ ] Worker: restart via `npm run dev`

---

## Phase 2: Upload Flow (User Control)

**Time**: 3-4 hours
**Priority**: High

### Overview

Add "Detect connections after processing" checkbox to DocumentPreview component and wire up to upload flow.

### Changes Required

#### 1. DocumentPreview: Add Detection Checkbox

**File**: `src/components/upload/DocumentPreview.tsx`

**Changes**: Add checkbox with tooltip, pass flag to parent

```typescript
// Add to interface (around line 20)
interface DocumentPreviewProps {
  // ... existing props
  detectConnections?: boolean
  onDetectConnectionsChange?: (checked: boolean) => void
}

// Add to component (around line 400, in Processing Options section)
export function DocumentPreview({
  // ... existing props
  detectConnections = false,  // Default: unchecked (opt-in)
  onDetectConnectionsChange
}: DocumentPreviewProps) {
  return (
    <div className="w-full max-w-4xl mx-auto p-6 border rounded-lg bg-card">
      {/* ... existing metadata fields ... */}

      {/* Processing Options */}
      <div className="mt-6 pt-4 border-t space-y-4">
        {/* ... existing options (cleanMarkdown, extractImages, chunkerStrategy) ... */}

        {/* NEW: Connection Detection Option */}
        <div className="flex items-center gap-2">
          <Checkbox
            id="detect-connections-preview"
            checked={detectConnections}
            onCheckedChange={(checked) => {
              onDetectConnectionsChange?.(checked as boolean)
            }}
          />
          <label
            htmlFor="detect-connections-preview"
            className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 flex items-center gap-1 cursor-pointer"
          >
            <Sparkles className="h-3 w-3" />
            Detect connections after processing
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="h-3.5 w-3.5 text-muted-foreground ml-1" />
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  <p>
                    Run 3-engine connection detection (Semantic, Contradiction, Thematic) after chunking completes.
                  </p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    You can detect connections later for individual chunks or batch detect from the Chunks tab.
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </label>
        </div>

        {/* Show time estimate if checked */}
        {detectConnections && (
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>
              Connection detection will add approximately <strong>15-30 minutes</strong> of processing time
              in LOCAL mode. You can skip this and detect connections later for specific chunks.
            </AlertDescription>
          </Alert>
        )}
      </div>
    </div>
  )
}
```

#### 2. Upload Action: Pass detectConnections Flag

**File**: `src/app/actions/documents.ts`

**Changes**: Extract flag from FormData, include in job input_data

```typescript
// Lines 60-76: Extract detectConnections flag
export async function uploadDocument(formData: FormData): Promise<{
  success: boolean
  documentId?: string
  jobId?: string
  error?: string
}> {
  try {
    // ... existing extractions ...
    const cleanMarkdownRaw = formData.get('cleanMarkdown')
    const cleanMarkdown = cleanMarkdownRaw !== 'false' // Default to true

    // NEW: Extract detectConnections flag
    const detectConnectionsRaw = formData.get('detectConnections')
    const detectConnections = detectConnectionsRaw === 'true'  // Default to false (opt-in)

    console.log('[uploadDocument] Processing flags DEBUG:', {
      // ... existing flags ...
      detectConnections: { raw: detectConnectionsRaw, parsed: detectConnections }
    });

// Lines 264-286: Include in job input_data
    const { data: job, error: jobError} = await supabase
      .from('background_jobs')
      .insert({
        user_id: user.id,
        job_type: 'process_document',
        entity_type: 'document',
        entity_id: documentId,
        input_data: {
          document_id: documentId,
          storage_path: baseStoragePath,
          source_type: sourceType,
          source_url: sourceUrl,
          processing_requested: processingRequested,
          pasted_content: pastedContent,
          document_type: documentType,
          reviewBeforeChunking: reviewBeforeChunking,
          cleanMarkdown: cleanMarkdown,
          reviewDoclingExtraction: reviewDoclingExtraction,
          extractImages: extractImages,
          chunkerStrategy: chunkerStrategy,
          detectConnections: detectConnections  // NEW
        }
      })
      .select()
      .single()
```

### Success Criteria

#### Automated Verification:
- [ ] Type check: `npm run type-check`
- [ ] Linting: `npm run lint`

#### Manual Verification:
- [ ] Upload form shows checkbox (unchecked by default)
- [ ] Check checkbox → alert shows time estimate
- [ ] Upload with checkbox checked → FormData includes 'detectConnections=true'
- [ ] Upload with checkbox unchecked → FormData includes 'detectConnections=false' (or omitted)
- [ ] ProcessingDock shows job with correct parameters

### Service Restarts:
- [ ] Next.js: auto-reload on file save

---

## Phase 3: Server Actions (API Layer)

**Time**: 3-4 hours
**Priority**: High

### Overview

Create new server actions file for connection-related operations. Keep separate from documents.ts to prevent file bloat.

### Changes Required

#### 1. Create Server Actions File

**File**: `src/app/actions/connections.ts` (NEW)

**Changes**: Create new file with connection detection server actions

```typescript
'use server'

import { getCurrentUser, getSupabaseClient } from '@/lib/auth'
import { revalidatePath } from 'next/cache'

/**
 * Detect connections for specific chunk(s).
 * Handles both single chunk and batch detection.
 */
export async function detectChunkConnections(
  documentId: string,
  chunkIds: string[]
): Promise<{
  success: boolean
  jobId?: string
  displayName?: string
  error?: string
}> {
  try {
    const supabase = getSupabaseClient()
    const user = await getCurrentUser()

    if (!user) {
      return { success: false, error: 'Not authenticated' }
    }

    console.log(`[detectChunkConnections] Starting for ${chunkIds.length} chunks`)

    // Validate inputs
    if (!documentId || !chunkIds || chunkIds.length === 0) {
      return { success: false, error: 'Document ID and chunk IDs required' }
    }

    // Get document title for job metadata
    const { data: doc } = await supabase
      .from('documents')
      .select('title')
      .eq('id', documentId)
      .single()

    if (!doc) {
      return { success: false, error: 'Document not found' }
    }

    const isSingle = chunkIds.length === 1
    const displayName = isSingle
      ? `Detect Connections - Chunk #${chunkIds[0].slice(-4)}`
      : `Detect Connections - ${chunkIds.length} Chunks`

    // Create background job
    const { data: job, error } = await supabase
      .from('background_jobs')
      .insert({
        user_id: user.id,
        job_type: 'detect-connections',
        entity_type: 'document',
        entity_id: documentId,
        status: 'pending',
        input_data: {
          document_id: documentId,
          chunk_ids: chunkIds,
          chunk_count: chunkIds.length,
          trigger: isSingle ? 'single' : 'batch'
        },
        metadata: {
          documentTitle: doc.title,
          displayName
        }
      })
      .select()
      .single()

    if (error) {
      console.error('[detectChunkConnections] Failed to create job:', error)
      return { success: false, error: 'Failed to start connection detection' }
    }

    revalidatePath(`/read/${documentId}`)

    return {
      success: true,
      jobId: job.id,
      displayName
    }
  } catch (error) {
    console.error('[detectChunkConnections] Unexpected error:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

/**
 * Detect connections for all undetected chunks in document.
 * Used in Admin Panel Connections tab.
 */
export async function detectAllUndetectedChunks(
  documentId: string
): Promise<{
  success: boolean
  jobId?: string
  chunkCount?: number
  message?: string
  error?: string
}> {
  try {
    const supabase = getSupabaseClient()
    const user = await getCurrentUser()

    if (!user) {
      return { success: false, error: 'Not authenticated' }
    }

    console.log(`[detectAllUndetectedChunks] Starting for document: ${documentId}`)

    // Get undetected chunks
    const { data: undetectedChunks } = await supabase
      .from('chunks')
      .select('id')
      .eq('document_id', documentId)
      .eq('connections_detected', false)
      .eq('is_current', true)

    if (!undetectedChunks || undetectedChunks.length === 0) {
      return {
        success: true,
        message: 'No undetected chunks found',
        chunkCount: 0
      }
    }

    const chunkIds = undetectedChunks.map(c => c.id)

    // Get document title
    const { data: doc } = await supabase
      .from('documents')
      .select('title')
      .eq('id', documentId)
      .single()

    // Create job
    const { data: job, error } = await supabase
      .from('background_jobs')
      .insert({
        user_id: user.id,
        job_type: 'detect-connections',
        entity_type: 'document',
        entity_id: documentId,
        status: 'pending',
        input_data: {
          document_id: documentId,
          chunk_ids: chunkIds,
          chunk_count: chunkIds.length,
          trigger: 'admin-panel'
        },
        metadata: {
          documentTitle: doc?.title || 'Unknown',
          displayName: `Detect Connections - ${chunkIds.length} Undetected Chunks`
        }
      })
      .select()
      .single()

    if (error) {
      console.error('[detectAllUndetectedChunks] Failed to create job:', error)
      return { success: false, error: 'Failed to create detection job' }
    }

    revalidatePath(`/read/${documentId}`)

    return {
      success: true,
      jobId: job.id,
      chunkCount: chunkIds.length
    }
  } catch (error) {
    console.error('[detectAllUndetectedChunks] Unexpected error:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

/**
 * Get chunk detection statistics for a document.
 */
export async function getChunkDetectionStats(
  documentId: string
): Promise<{
  total: number
  detected: number
  undetected: number
  percentage: number
}> {
  try {
    const supabase = getSupabaseClient()

    const { data: stats } = await supabase
      .rpc('get_chunk_detection_stats', { doc_id: documentId })
      .single()

    return stats || { total: 0, detected: 0, undetected: 0, percentage: 0 }
  } catch (error) {
    console.error('[getChunkDetectionStats] Error:', error)
    return { total: 0, detected: 0, undetected: 0, percentage: 0 }
  }
}

/**
 * Get list of undetected chunk IDs (for "Select All Undetected").
 */
export async function getUndetectedChunkIds(
  documentId: string
): Promise<string[]> {
  try {
    const supabase = getSupabaseClient()

    const { data: chunks } = await supabase
      .from('chunks')
      .select('id')
      .eq('document_id', documentId)
      .eq('connections_detected', false)
      .eq('is_current', true)
      .order('sequence_number')

    return chunks?.map(c => c.id) || []
  } catch (error) {
    console.error('[getUndetectedChunkIds] Error:', error)
    return []
  }
}

/**
 * Get chunks metadata for All Chunks view (lightweight).
 */
export async function getChunksMetadata(
  documentId: string
): Promise<Array<{
  id: string
  sequence_number: number
  connections_detected: boolean
  connections_detected_at: string | null
  heading_path: string[]
  word_count: number
  preview: string
}>> {
  try {
    const supabase = getSupabaseClient()

    const { data: chunks } = await supabase
      .from('chunks')
      .select(`
        id,
        sequence_number,
        connections_detected,
        connections_detected_at,
        heading_path,
        word_count,
        content
      `)
      .eq('document_id', documentId)
      .eq('is_current', true)
      .order('sequence_number')

    // Transform to lightweight metadata + preview
    return chunks?.map(chunk => ({
      id: chunk.id,
      sequence_number: chunk.sequence_number,
      connections_detected: chunk.connections_detected || false,
      connections_detected_at: chunk.connections_detected_at,
      heading_path: chunk.heading_path || [],
      word_count: chunk.word_count || 0,
      preview: chunk.content?.slice(0, 150) + '...' || '',
    })) || []
  } catch (error) {
    console.error('[getChunksMetadata] Error:', error)
    return []
  }
}

/**
 * Get full chunk content (lazy load on expand).
 */
export async function getChunkContent(
  chunkId: string
): Promise<{
  content: string
  connections_detected: boolean
  connection_count: number
} | null> {
  try {
    const supabase = getSupabaseClient()

    const { data: chunk } = await supabase
      .from('chunks')
      .select('content, connections_detected')
      .eq('id', chunkId)
      .single()

    if (!chunk) {
      return null
    }

    // If detected, also get connection count
    let connectionCount = 0
    if (chunk.connections_detected) {
      const { count } = await supabase
        .from('connections')
        .select('*', { count: 'exact', head: true })
        .eq('source_chunk_id', chunkId)

      connectionCount = count || 0
    }

    return {
      content: chunk.content || '',
      connections_detected: chunk.connections_detected || false,
      connection_count: connectionCount
    }
  } catch (error) {
    console.error('[getChunkContent] Error:', error)
    return null
  }
}
```

### Success Criteria

#### Automated Verification:
- [ ] Type check: `npm run type-check`
- [ ] Linting: `npm run lint`

#### Manual Verification:
- [ ] Import and call `detectChunkConnections([chunkId])` → job created
- [ ] Import and call `detectChunkConnections([id1, id2, id3])` → batch job created
- [ ] Import and call `getChunkDetectionStats(docId)` → returns stats object
- [ ] Import and call `getChunksMetadata(docId)` → returns array of chunk metadata

### Service Restarts:
- [ ] Next.js: auto-reload on file save

---

## Phase 4: State Management (Client State)

**Time**: 2-3 hours
**Priority**: High

### Overview

Create Zustand store for chunk selection state and extend reader store for scroll coordination.

### Changes Required

#### 1. Chunk Detection Store

**File**: `src/stores/chunk-detection-store.ts` (NEW)

**Changes**: Create store for selection state

```typescript
import { create } from 'zustand'
import { devtools } from 'zustand/middleware'

interface ChunkDetectionState {
  // Selection state (per document)
  selectedChunkIds: Set<string>
  currentDocumentId: string | null

  // Actions
  setDocument: (documentId: string) => void
  toggleChunk: (chunkId: string) => void
  selectChunks: (chunkIds: string[]) => void
  clearSelection: () => void
  selectAllUndetected: (chunkIds: string[]) => void

  // Batch detection
  batchDetectConnections: (documentId: string, chunkIds: string[]) => Promise<void>
}

export const useChunkDetectionStore = create<ChunkDetectionState>()(
  devtools(
    (set, get) => ({
      selectedChunkIds: new Set(),
      currentDocumentId: null,

      setDocument: (documentId) => {
        const state = get()
        // Clear selection when switching documents
        if (state.currentDocumentId !== documentId) {
          set({
            currentDocumentId: documentId,
            selectedChunkIds: new Set()
          })
        }
      },

      toggleChunk: (chunkId) => {
        set((state) => {
          const newSelected = new Set(state.selectedChunkIds)
          if (newSelected.has(chunkId)) {
            newSelected.delete(chunkId)
          } else {
            newSelected.add(chunkId)
          }
          return { selectedChunkIds: newSelected }
        })
      },

      selectChunks: (chunkIds) => {
        set((state) => {
          const newSelected = new Set(state.selectedChunkIds)
          chunkIds.forEach(id => newSelected.add(id))
          return { selectedChunkIds: newSelected }
        })
      },

      clearSelection: () => {
        set({ selectedChunkIds: new Set() })
      },

      selectAllUndetected: (chunkIds) => {
        set({ selectedChunkIds: new Set(chunkIds) })
      },

      batchDetectConnections: async (documentId, chunkIds) => {
        // Call server action
        const { detectChunkConnections } = await import('@/app/actions/connections')
        await detectChunkConnections(documentId, chunkIds)

        // Clear selection after successful detection
        get().clearSelection()
      }
    }),
    { name: 'chunk-detection-store' }
  )
)
```

#### 2. Extend Reader Store

**File**: `src/stores/reader-store.ts`

**Changes**: Add scrollSource tracking for bidirectional scroll sync

```typescript
// Add to ReaderState interface (around line 10)
interface ReaderState {
  // ... existing fields ...
  scrollSource: 'reader' | 'chunks-tab' | null  // NEW: Track scroll origin

  // ... existing actions ...
  setScrollSource: (source: 'reader' | 'chunks-tab' | null) => void  // NEW
}

// Add to store implementation (around line 50)
export const useReaderStore = create<ReaderState>()(
  devtools(
    (set) => ({
      // ... existing state ...
      scrollSource: null,  // NEW

      // ... existing actions ...

      setScrollSource: (source) => {
        set({ scrollSource: source })
      },
    }),
    { name: 'reader-store' }
  )
)
```

### Success Criteria

#### Automated Verification:
- [ ] Type check: `npm run type-check`
- [ ] Linting: `npm run lint`

#### Manual Verification:
- [ ] Import store: `useChunkDetectionStore()`
- [ ] Call `setDocument(docId)` → currentDocumentId updates
- [ ] Call `toggleChunk(id)` → selectedChunkIds includes id
- [ ] Call `toggleChunk(id)` again → selectedChunkIds excludes id
- [ ] Switch documents → selection clears automatically
- [ ] Reader store has `scrollSource` field

### Service Restarts:
- [ ] Next.js: auto-reload on file save

---

## Phase 5: Chunks Tab (Main UI)

**Time**: 8-10 hours
**Priority**: High

### Overview

Build Chunks tab with 3 sub-tabs following ConnectionCard pattern. Virtualized list for performance with large documents.

### Component Structure

```
ChunksTab (container, 3 sub-tabs)
├── ChunkStatsOverview (stats + batch detect all)
├── AllChunksView (virtualized list)
│   ├── ChunkCard (ConnectionCard pattern + checkbox)
│   └── BatchActionsBar (floating actions)
└── ChunkQualityMonitoring (moved from Quality tab)
```

### Changes Required

#### 1. Chunks Tab Container

**File**: `src/components/sidebar/chunks-tab.tsx` (NEW)

**Changes**: Create tab container

```typescript
'use client'

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ChunkStatsOverview } from './chunk-stats-overview'
import { AllChunksView } from './all-chunks-view'
import { ChunkQualityPanel } from './ChunkQualityPanel'

interface ChunksTabProps {
  documentId: string
  currentChunkId?: string  // For synced scrolling
}

export function ChunksTab({ documentId, currentChunkId }: ChunksTabProps) {
  return (
    <Tabs defaultValue="overview" className="w-full">
      <TabsList className="grid w-full grid-cols-3">
        <TabsTrigger value="overview">Overview</TabsTrigger>
        <TabsTrigger value="all-chunks">All Chunks</TabsTrigger>
        <TabsTrigger value="quality">Quality</TabsTrigger>
      </TabsList>

      {/* Overview: Stats and batch actions */}
      <TabsContent value="overview" className="mt-4">
        <ChunkStatsOverview documentId={documentId} />
      </TabsContent>

      {/* All Chunks: Virtualized card list with batch selection */}
      <TabsContent value="all-chunks" className="mt-4">
        <AllChunksView
          documentId={documentId}
          currentChunkId={currentChunkId}
        />
      </TabsContent>

      {/* Quality: Chonkie confidence monitoring */}
      <TabsContent value="quality" className="mt-4">
        <ChunkQualityPanel documentId={documentId} />
      </TabsContent>
    </Tabs>
  )
}
```

#### 2. Chunk Stats Overview

**File**: `src/components/sidebar/chunk-stats-overview.tsx` (NEW)

**Changes**: Create stats cards with batch detect all button

```typescript
'use client'

import { useQuery } from '@tanstack/react-query'
import { getChunkDetectionStats, detectAllUndetectedChunks } from '@/app/actions/connections'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Sparkles, Loader2, CheckCircle2 } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

export function ChunkStatsOverview({ documentId }: { documentId: string }) {
  const [isDetecting, setIsDetecting] = useState(false)

  const { data: stats, refetch } = useQuery({
    queryKey: ['chunk-detection-stats', documentId],
    queryFn: () => getChunkDetectionStats(documentId),
    refetchInterval: 5000  // Refresh every 5s to show progress
  })

  const handleDetectAll = async () => {
    setIsDetecting(true)
    try {
      const result = await detectAllUndetectedChunks(documentId)

      if (result.chunkCount === 0) {
        toast.info('Already Complete', {
          description: 'All chunks have already been scanned for connections'
        })
      } else {
        toast.success('Detection Started', {
          description: `Detecting connections for ${result.chunkCount} chunks - check ProcessingDock for progress`
        })
      }

      refetch()
    } catch (error) {
      toast.error('Detection Failed', {
        description: error instanceof Error ? error.message : 'Unknown error'
      })
    } finally {
      setIsDetecting(false)
    }
  }

  if (!stats) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-4 p-4">
      {/* Stats Cards */}
      <div className="grid grid-cols-3 gap-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Detected</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {stats.detected}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              chunks scanned
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Undetected</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">
              {stats.undetected}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              not scanned
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Progress</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {stats.percentage}%
            </div>
            <Progress value={stats.percentage} className="mt-2" />
          </CardContent>
        </Card>
      </div>

      {/* Batch Detect All */}
      {stats.undetected > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Batch Detection</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Detect connections for all {stats.undetected} unscanned chunks at once.
            </p>

            <Button
              onClick={handleDetectAll}
              disabled={isDetecting}
              className="w-full"
            >
              {isDetecting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Starting Detection...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4 mr-2" />
                  Detect All Undetected Chunks
                  <Badge variant="secondary" className="ml-2">
                    {stats.undetected}
                  </Badge>
                </>
              )}
            </Button>

            <p className="text-xs text-muted-foreground">
              Estimated time: ~{Math.ceil((stats.undetected * 30) / 60)} minutes in LOCAL mode
            </p>
          </CardContent>
        </Card>
      )}

      {/* All Complete State */}
      {stats.undetected === 0 && (
        <Card className="bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-green-700 dark:text-green-300">
              <CheckCircle2 className="h-5 w-5" />
              <p className="font-medium">All chunks have been scanned for connections</p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
```

#### 3. All Chunks View

**File**: `src/components/sidebar/all-chunks-view.tsx` (NEW)

**Changes**: Virtualized list with chunk cards

```typescript
'use client'

import { useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Virtuoso, type VirtuosoHandle } from 'react-virtuoso'
import { getChunksMetadata } from '@/app/actions/connections'
import { useReaderStore } from '@/stores/reader-store'
import { useChunkDetectionStore } from '@/stores/chunk-detection-store'
import { ChunkCard } from './chunk-card'
import { BatchActionsBar } from './batch-actions-bar'
import { Loader2 } from 'lucide-react'

export function AllChunksView({
  documentId,
  currentChunkId
}: {
  documentId: string
  currentChunkId?: string
}) {
  const virtuosoRef = useRef<VirtuosoHandle>(null)
  const { scrollSource } = useReaderStore()
  const { setDocument, selectedChunkIds } = useChunkDetectionStore()

  // Set current document for selection state
  useEffect(() => {
    setDocument(documentId)
  }, [documentId, setDocument])

  // Load chunks metadata (lightweight)
  const { data: chunksMetadata, isLoading } = useQuery({
    queryKey: ['chunks-metadata', documentId],
    queryFn: () => getChunksMetadata(documentId),
    refetchInterval: 5000  // Refresh to update detection status
  })

  // Synced scrolling: scroll to current chunk when reader scrolls
  useEffect(() => {
    if (scrollSource === 'reader' && currentChunkId && chunksMetadata) {
      const index = chunksMetadata.findIndex(c => c.id === currentChunkId)
      if (index !== -1) {
        virtuosoRef.current?.scrollToIndex({
          index,
          align: 'center',
          behavior: 'smooth'
        })
      }
    }
  }, [currentChunkId, scrollSource, chunksMetadata])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!chunksMetadata || chunksMetadata.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        No chunks found
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Batch Actions Bar (appears when chunks selected) */}
      {selectedChunkIds.size > 0 && (
        <BatchActionsBar
          documentId={documentId}
          selectedCount={selectedChunkIds.size}
        />
      )}

      {/* Virtualized Chunk List */}
      <Virtuoso
        ref={virtuosoRef}
        data={chunksMetadata}
        itemContent={(index, chunk) => (
          <ChunkCard
            key={chunk.id}
            chunk={chunk}
            isActive={chunk.id === currentChunkId}
            documentId={documentId}
          />
        )}
        style={{ height: '600px' }}
      />
    </div>
  )
}
```

#### 4. Chunk Card (ConnectionCard Pattern)

**File**: `src/components/sidebar/chunk-card.tsx` (NEW)

**Changes**: Card following ConnectionCard pattern with checkbox

```typescript
'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import {
  ChevronDown,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  Eye,
  Loader2
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { getChunkContent, detectChunkConnections } from '@/app/actions/connections'
import { useChunkDetectionStore } from '@/stores/chunk-detection-store'
import { useReaderStore } from '@/stores/reader-store'
import { toast } from 'sonner'
import ReactMarkdown from 'react-markdown'

interface ChunkMetadata {
  id: string
  sequence_number: number
  connections_detected: boolean
  connections_detected_at: string | null
  heading_path: string[]
  word_count: number
  preview: string
}

export function ChunkCard({
  chunk,
  isActive,
  documentId
}: {
  chunk: ChunkMetadata
  isActive: boolean
  documentId: string
}) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [isDetecting, setIsDetecting] = useState(false)
  const { toggleChunk, selectedChunkIds } = useChunkDetectionStore()
  const { setCurrentChunkId, setScrollSource } = useReaderStore()

  const isSelected = selectedChunkIds.has(chunk.id)

  // Lazy load full content on expand
  const { data: fullData, isLoading: isLoadingContent } = useQuery({
    queryKey: ['chunk-content', chunk.id],
    queryFn: () => getChunkContent(chunk.id),
    enabled: isExpanded  // Only fetch when expanded
  })

  const handleSingleDetect = async () => {
    setIsDetecting(true)
    try {
      const result = await detectChunkConnections(documentId, [chunk.id])
      toast.success('Detection Started', {
        description: `${result.displayName} - check ProcessingDock for progress`
      })
    } catch (error) {
      toast.error('Detection Failed', {
        description: error instanceof Error ? error.message : 'Unknown error'
      })
    } finally {
      setIsDetecting(false)
    }
  }

  const handleScrollToChunk = () => {
    setCurrentChunkId(chunk.id)
    setScrollSource('chunks-tab')
  }

  // Border color based on selection state (ConnectionCard pattern)
  const borderClass = isSelected
    ? 'border-primary'
    : isActive
    ? 'border-primary/50'
    : 'border-border'

  return (
    <Card
      className={cn(
        "cursor-pointer hover:bg-muted/50 transition-all border-2 mb-2",
        borderClass
      )}
    >
      <CardHeader className="pb-3">
        <div className="flex items-start gap-3">
          {/* Left: Checkbox */}
          <Checkbox
            checked={isSelected}
            onCheckedChange={() => toggleChunk(chunk.id)}
            onClick={(e) => e.stopPropagation()}
            className="mt-1"
          />

          {/* Center: Info */}
          <div className="flex-1 space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="outline" className="text-xs font-mono">
                #{chunk.sequence_number}
              </Badge>

              {/* Detection Status */}
              {chunk.connections_detected ? (
                <Badge variant="secondary" className="text-xs gap-1">
                  <CheckCircle2 className="h-3 w-3" />
                  {fullData?.connection_count || 0} connections
                </Badge>
              ) : (
                <Badge variant="destructive" className="text-xs gap-1">
                  <AlertCircle className="h-3 w-3" />
                  Not scanned
                </Badge>
              )}

              {isActive && (
                <Badge variant="default" className="text-xs">
                  In view
                </Badge>
              )}
            </div>

            {/* Heading Path */}
            {chunk.heading_path.length > 0 && (
              <div className="text-xs text-muted-foreground">
                {chunk.heading_path.join(' › ')}
              </div>
            )}

            {/* Preview */}
            <p className="text-sm line-clamp-2">
              {chunk.preview}
            </p>

            <div className="text-xs text-muted-foreground">
              {chunk.word_count} words
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="pb-3">
        {/* Collapsible for full content */}
        <Collapsible
          open={isExpanded}
          onOpenChange={setIsExpanded}
        >
          <CollapsibleTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start text-xs"
              onClick={(e) => e.stopPropagation()}
            >
              {isExpanded ? (
                <>
                  <ChevronDown className="h-3 w-3 mr-1" />
                  Hide content
                </>
              ) : (
                <>
                  <ChevronDown className="h-3 w-3 mr-1 rotate-[-90deg]" />
                  Show content
                </>
              )}
            </Button>
          </CollapsibleTrigger>

          <CollapsibleContent className="mt-2">
            {isLoadingContent ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="h-4 w-4 animate-spin" />
              </div>
            ) : fullData ? (
              <div className="space-y-3">
                <div className="prose prose-sm dark:prose-invert max-w-none">
                  <ReactMarkdown>{fullData.content}</ReactMarkdown>
                </div>

                {/* Actions */}
                <div className="flex gap-2 pt-2 border-t">
                  {!chunk.connections_detected && (
                    <Button
                      size="sm"
                      onClick={handleSingleDetect}
                      disabled={isDetecting}
                    >
                      {isDetecting ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Detecting...
                        </>
                      ) : (
                        <>
                          <Sparkles className="h-4 w-4 mr-2" />
                          Detect Connections
                        </>
                      )}
                    </Button>
                  )}

                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleScrollToChunk}
                  >
                    <Eye className="h-4 w-4 mr-2" />
                    View in Reader
                  </Button>
                </div>
              </div>
            ) : (
              <div className="text-sm text-muted-foreground">
                Failed to load content
              </div>
            )}
          </CollapsibleContent>
        </Collapsible>
      </CardContent>
    </Card>
  )
}
```

#### 5. Batch Actions Bar

**File**: `src/components/sidebar/batch-actions-bar.tsx` (NEW)

**Changes**: Floating bar for batch operations

```typescript
'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Sparkles, X, CheckSquare, Loader2 } from 'lucide-react'
import { useChunkDetectionStore } from '@/stores/chunk-detection-store'
import { detectChunkConnections, getUndetectedChunkIds } from '@/app/actions/connections'
import { toast } from 'sonner'
import { motion, AnimatePresence } from 'framer-motion'

export function BatchActionsBar({
  documentId,
  selectedCount
}: {
  documentId: string
  selectedCount: number
}) {
  const [isDetecting, setIsDetecting] = useState(false)
  const { selectedChunkIds, clearSelection, selectAllUndetected } = useChunkDetectionStore()

  const handleBatchDetect = async () => {
    const chunkIds = Array.from(selectedChunkIds)

    setIsDetecting(true)
    try {
      const result = await detectChunkConnections(documentId, chunkIds)
      toast.success('Batch Detection Started', {
        description: `${result.displayName} - check ProcessingDock for progress`
      })
      clearSelection()
    } catch (error) {
      toast.error('Detection Failed', {
        description: error instanceof Error ? error.message : 'Unknown error'
      })
    } finally {
      setIsDetecting(false)
    }
  }

  const handleSelectAllUndetected = async () => {
    const undetectedIds = await getUndetectedChunkIds(documentId)
    selectAllUndetected(undetectedIds)
    toast.info('Selection Updated', {
      description: `Selected ${undetectedIds.length} undetected chunks`
    })
  }

  return (
    <AnimatePresence>
      {selectedCount > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
        >
          <Card className="p-3 bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Badge variant="default" className="font-mono">
                  {selectedCount} selected
                </Badge>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleSelectAllUndetected}
                >
                  <CheckSquare className="h-4 w-4 mr-2" />
                  Select All Undetected
                </Button>

                <Button
                  size="sm"
                  onClick={handleBatchDetect}
                  disabled={isDetecting}
                >
                  {isDetecting ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Starting...
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4 mr-2" />
                      Detect Connections
                    </>
                  )}
                </Button>

                <Button
                  size="sm"
                  variant="ghost"
                  onClick={clearSelection}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </Card>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
```

### Success Criteria

#### Automated Verification:
- [ ] Type check: `npm run type-check`
- [ ] Linting: `npm run lint`
- [ ] Build: `npm run build`

#### Manual Verification:
- [ ] Open Chunks tab → 3 sub-tabs visible
- [ ] Overview tab → stats cards show correct counts
- [ ] Overview tab → "Detect All" button works
- [ ] All Chunks tab → virtualized list scrolls smoothly with 500+ chunks
- [ ] All Chunks tab → checkbox selection works
- [ ] All Chunks tab → batch actions bar appears when chunks selected
- [ ] Card collapsible → full content loads lazily
- [ ] "Detect Connections" button → job created
- [ ] "View in Reader" button → scrolls to chunk
- [ ] Synced scrolling → reader scroll updates chunks tab highlight

### Service Restarts:
- [ ] Next.js: auto-reload on file save

---

## Phase 6: Reader Tooltip (Quick Actions)

**Time**: 3-4 hours
**Priority**: Medium

### Overview

Update ChunkMetadataIcon tooltip to show detection status and action buttons for quick access while reading.

### Changes Required

#### 1. ChunkMetadataIcon Update

**File**: `src/components/reader/ChunkMetadataIcon.tsx`

**Changes**: Add detection status, action buttons

```typescript
import { useChunkDetectionStore } from '@/stores/chunk-detection-store'
import { detectChunkConnections } from '@/app/actions/connections'
import { Sparkles, Plus, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'

export function ChunkMetadataIcon({
  chunk,
  chunkIndex,
  alwaysVisible = false,
  style,
  textOffset
}: ChunkMetadataIconProps) {
  const { toggleChunk, selectedChunkIds } = useChunkDetectionStore()
  const [isDetecting, setIsDetecting] = useState(false)

  const isSelected = selectedChunkIds.has(chunk.id)

  const handleSingleDetect = async () => {
    setIsDetecting(true)
    try {
      const result = await detectChunkConnections(chunk.document_id, [chunk.id])
      toast.success('Detection Started', {
        description: `${result.displayName} - check ProcessingDock for progress`
      })
    } catch (error) {
      toast.error('Detection Failed', {
        description: error instanceof Error ? error.message : 'Unknown error'
      })
    } finally {
      setIsDetecting(false)
    }
  }

  const handleAddToBatch = () => {
    toggleChunk(chunk.id)
    toast.info(
      isSelected ? 'Removed from batch' : 'Added to batch',
      {
        description: `${selectedChunkIds.size + (isSelected ? -1 : 1)} chunks selected`
      }
    )
  }

  return (
    <HoverCard openDelay={200}>
      <HoverCardTrigger asChild>
        {/* ... existing icon ... */}
      </HoverCardTrigger>

      <HoverCardContent side="left" className="w-80">
        <div className="space-y-3">
          {/* ... existing metadata display ... */}

          {/* NEW: Connection Detection Status & Actions */}
          <div className="border-t pt-3">
            {chunk.connections_detected ? (
              <div className="flex items-center gap-2 text-sm">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                <span className="font-medium">Connections Detected</span>
                <Badge variant="secondary" className="ml-auto">
                  {chunk.connection_count || 0} found
                </Badge>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm text-yellow-600">
                  <AlertCircle className="h-4 w-4" />
                  <span className="font-medium">Not scanned yet</span>
                </div>

                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={handleSingleDetect}
                    disabled={isDetecting}
                    className="flex-1"
                  >
                    {isDetecting ? (
                      <>
                        <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                        Detecting...
                      </>
                    ) : (
                      <>
                        <Sparkles className="h-3 w-3 mr-1" />
                        Detect Now
                      </>
                    )}
                  </Button>

                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleAddToBatch}
                  >
                    <Plus className="h-3 w-3 mr-1" />
                    {isSelected ? 'Remove' : 'Add to Batch'}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </HoverCardContent>
    </HoverCard>
  )
}
```

### Success Criteria

#### Automated Verification:
- [ ] Type check: `npm run type-check`
- [ ] Linting: `npm run lint`

#### Manual Verification:
- [ ] Hover over chunk → tooltip shows detection status
- [ ] Undetected chunk → "Detect Now" button visible
- [ ] Click "Detect Now" → job created
- [ ] Click "Add to Batch" → chunk selected in Chunks tab
- [ ] Click "Add to Batch" again → chunk deselected
- [ ] Detected chunk → connection count shown

### Service Restarts:
- [ ] Next.js: auto-reload on file save

---

## Phase 7: Admin Panel Integration

**Time**: 2-3 hours
**Priority**: Medium

### Overview

Add detection stats section to Admin Panel Connections tab above existing reprocessing UI.

### Changes Required

#### 1. ConnectionsTab Update

**File**: `src/components/admin/tabs/ConnectionsTab.tsx`

**Changes**: Add detection stats section at top

```typescript
import { getChunkDetectionStats, detectAllUndetectedChunks } from '@/app/actions/connections'
import { Progress } from '@/components/ui/progress'
import { Sparkles, Loader2 } from 'lucide-react'

export function ConnectionsTab() {
  // ... existing state ...
  const [detectionStats, setDetectionStats] = useState<any>(null)
  const [isDetecting, setIsDetecting] = useState(false)

  // Load detection stats when document selected
  useEffect(() => {
    if (selectedDocId) {
      loadDetectionStats()
    }
  }, [selectedDocId])

  const loadDetectionStats = async () => {
    const stats = await getChunkDetectionStats(selectedDocId!)
    setDetectionStats(stats)
  }

  const handleDetectAllUndetected = async () => {
    setIsDetecting(true)
    try {
      await detectAllUndetectedChunks(selectedDocId!)
      await loadDetectionStats()
      toast.success('Detection started - check ProcessingDock')
    } catch (error) {
      toast.error('Detection failed')
    } finally {
      setIsDetecting(false)
    }
  }

  return (
    <TooltipProvider>
      <div className="space-y-6">
        {/* ... existing header ... */}

        {/* NEW: Chunk Detection Status (ABOVE reprocessing) */}
        {selectedDoc && detectionStats && (
          <div className="border rounded-lg p-6 space-y-4">
            <div>
              <h4 className="text-sm font-semibold">Chunk Detection Status</h4>
              <p className="text-xs text-muted-foreground">
                Connection detection progress for this document
              </p>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="border rounded-lg p-4">
                <div className="text-2xl font-bold text-green-600">
                  {detectionStats.detected}
                </div>
                <div className="text-sm text-muted-foreground">Chunks Detected</div>
              </div>
              <div className="border rounded-lg p-4">
                <div className="text-2xl font-bold text-orange-600">
                  {detectionStats.undetected}
                </div>
                <div className="text-sm text-muted-foreground">Not Scanned</div>
              </div>
              <div className="border rounded-lg p-4">
                <Progress value={detectionStats.percentage} className="mb-2" />
                <div className="text-sm text-muted-foreground">
                  {detectionStats.percentage}% complete
                </div>
              </div>
            </div>

            {/* Detect All Undetected Button */}
            {detectionStats.undetected > 0 && (
              <Button
                onClick={handleDetectAllUndetected}
                disabled={isDetecting}
                className="w-full"
              >
                {isDetecting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Starting...
                  </>
                ) : (
                  <>
                    <Sparkles className="mr-2 h-4 w-4" />
                    Detect All Undetected Chunks
                    <Badge variant="secondary" className="ml-2">
                      {detectionStats.undetected}
                    </Badge>
                  </>
                )}
              </Button>
            )}
          </div>
        )}

        {/* Divider */}
        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-background px-2 text-muted-foreground">
              Or reprocess existing connections
            </span>
          </div>
        </div>

        {/* EXISTING: Reprocess connections UI (unchanged) */}
        {/* ... rest of existing code ... */}
      </div>
    </TooltipProvider>
  )
}
```

### Success Criteria

#### Automated Verification:
- [ ] Type check: `npm run type-check`
- [ ] Linting: `npm run lint`

#### Manual Verification:
- [ ] Open Admin Panel (Cmd+Shift+A) → Connections tab
- [ ] Select document → stats load
- [ ] Stats show correct counts
- [ ] "Detect All Undetected" button visible if undetected > 0
- [ ] Click button → job created
- [ ] Existing reprocessing UI still works

### Service Restarts:
- [ ] Next.js: auto-reload on file save

---

## Phase 8: RightPanel Integration

**Time**: 1-2 hours
**Priority**: Medium

### Overview

Replace "Quality" tab with "Chunks" tab in RightPanel, keeping 7-tab grid layout.

### Changes Required

#### 1. RightPanel Update

**File**: `src/components/sidebar/RightPanel.tsx`

**Changes**: Replace Quality tab with Chunks tab

```typescript
import { ChunksTab } from './chunks-tab'

type TabId = 'connections' | 'annotations' | 'chunks' | 'sparks' | 'cards' | 'review' | 'tune'

interface Tab {
  id: TabId
  icon: typeof Network
  label: string
}

const TABS: Tab[] = [
  { id: 'connections', icon: Network, label: 'Connections' },
  { id: 'annotations', icon: Highlighter, label: 'Annotations' },
  { id: 'chunks', icon: Box, label: 'Chunks' },  // Changed from 'quality'
  { id: 'sparks', icon: Zap, label: 'Sparks' },
  { id: 'cards', icon: Brain, label: 'Cards' },
  { id: 'review', icon: FileQuestion, label: 'Review' },
  { id: 'tune', icon: Sliders, label: 'Tune' }
]

export function RightPanel({ documentId, currentChunkId }: RightPanelProps) {
  const [activeTab, setActiveTab] = useState<TabId>('connections')

  return (
    <motion.div className="fixed right-0 top-14 bottom-0">
      {/* Icon-only tabs (7 columns) */}
      <div className="grid grid-cols-7 border-b p-2 gap-1">
        {TABS.map(tab => {
          // ... existing tab rendering ...
        })}
      </div>

      {/* Tab content */}
      <ScrollArea className="flex-1">
        {activeTab === 'connections' && <ConnectionsList documentId={documentId} />}
        {activeTab === 'annotations' && <AnnotationsList documentId={documentId} />}
        {activeTab === 'chunks' && (
          <ChunksTab
            documentId={documentId}
            currentChunkId={currentChunkId}
          />
        )}
        {activeTab === 'sparks' && <SparksTab documentId={documentId} />}
        {/* ... other tabs ... */}
      </ScrollArea>
    </motion.div>
  )
}
```

### Success Criteria

#### Automated Verification:
- [ ] Type check: `npm run type-check`
- [ ] Linting: `npm run lint`
- [ ] Build: `npm run build`

#### Manual Verification:
- [ ] RightPanel shows 7 tabs (icon-only)
- [ ] Third tab labeled "Chunks" (not "Quality")
- [ ] Click Chunks tab → ChunksTab component renders
- [ ] All 3 sub-tabs work (Overview, All Chunks, Quality moved here)
- [ ] Other tabs still work

### Service Restarts:
- [ ] Next.js: auto-reload on file save

---

## Phase 9: Testing & Polish

**Time**: 4-6 hours
**Priority**: High

### Overview

End-to-end testing, performance validation, edge case handling, and documentation updates.

### Testing Strategy

#### End-to-End Workflow Tests

**Test 1: Upload with Detection**
- [ ] Upload document with checkbox checked
- [ ] Verify process-document job created
- [ ] Wait for processing to complete
- [ ] Verify detect-connections job created automatically
- [ ] Wait for detection to complete
- [ ] Verify all chunks marked as detected
- [ ] Verify connections exist in database

**Test 2: Upload without Detection**
- [ ] Upload document with checkbox unchecked
- [ ] Verify process-document job created
- [ ] Wait for processing to complete
- [ ] Verify NO detect-connections job created
- [ ] Verify all chunks marked as NOT detected
- [ ] Verify Chunks tab shows "0% complete"

**Test 3: Per-Chunk Detection from Tooltip**
- [ ] Open document with undetected chunks
- [ ] Hover over chunk → tooltip shows "Not scanned yet"
- [ ] Click "Detect Now" button
- [ ] Verify job created for single chunk
- [ ] Wait for completion
- [ ] Verify only that chunk marked as detected
- [ ] Verify tooltip updates to show connection count

**Test 4: Batch Detection from Chunks Tab**
- [ ] Open Chunks tab → All Chunks sub-tab
- [ ] Select 5 chunks with checkboxes
- [ ] Verify batch actions bar appears
- [ ] Click "Detect Connections"
- [ ] Verify job created with 5 chunk IDs
- [ ] Wait for completion
- [ ] Verify all 5 chunks marked as detected
- [ ] Verify selection clears

**Test 5: Detect All Undetected from Admin Panel**
- [ ] Open Admin Panel (Cmd+Shift+A) → Connections tab
- [ ] Select document with 100 detected, 200 undetected
- [ ] Verify stats show "200 Not Scanned"
- [ ] Click "Detect All Undetected Chunks"
- [ ] Verify job created with 200 chunk IDs
- [ ] Wait for completion
- [ ] Verify stats update to "300 Chunks Detected (100%)"

#### Performance Tests

**Test 1: Large Document (500+ chunks)**
- [ ] Upload large PDF (500 pages)
- [ ] Process without detection
- [ ] Open Chunks tab → All Chunks
- [ ] Verify virtualized list scrolls smoothly
- [ ] Verify only visible items rendered (check DOM)
- [ ] Scroll to bottom → verify items update
- [ ] Select 100 chunks → verify performance acceptable
- [ ] Batch detect → verify job completes

**Test 2: Rapid Selection**
- [ ] Rapidly click checkboxes on 50 chunks
- [ ] Verify UI remains responsive
- [ ] Verify selection count updates correctly
- [ ] Clear selection → verify instant update

**Test 3: Synced Scrolling**
- [ ] Open document in reader
- [ ] Open Chunks tab side-by-side
- [ ] Scroll in reader → verify Chunks tab highlights current chunk
- [ ] Click "View in Reader" from chunk card → verify reader scrolls
- [ ] Verify no performance degradation

#### Edge Case Tests

**Test 1: Empty Document**
- [ ] Create document with 0 chunks
- [ ] Open Chunks tab
- [ ] Verify "No chunks found" message
- [ ] Verify no errors in console

**Test 2: Single Chunk Document**
- [ ] Create document with 1 chunk
- [ ] Verify stats show "1 total"
- [ ] Detect connections → verify job works
- [ ] Verify stats update to "100%"

**Test 3: All Chunks Already Detected**
- [ ] Open document where all chunks detected
- [ ] Verify stats show "100% complete"
- [ ] Verify green success message shown
- [ ] Verify "Detect All" button hidden

**Test 4: Network Error During Detection**
- [ ] Simulate network failure
- [ ] Attempt detection
- [ ] Verify error toast shown
- [ ] Verify job marked as failed
- [ ] Retry → verify works when network restored

**Test 5: Switch Documents Mid-Selection**
- [ ] Select 10 chunks in document A
- [ ] Switch to document B
- [ ] Verify selection cleared
- [ ] Verify no chunks selected in document B

### UI Polish Checklist

- [ ] Loading states for all async operations
- [ ] Error handling with user-friendly messages
- [ ] Toast notifications for all actions
- [ ] Animations for batch actions bar (framer-motion)
- [ ] Disabled states during processing
- [ ] Proper icon usage (consistent with design)
- [ ] Responsive layout (RightPanel width)
- [ ] Keyboard accessibility (tab navigation)
- [ ] Tooltips for all icon buttons
- [ ] Badge colors consistent with design system

### Documentation Updates

**File**: `CLAUDE.md`

- [ ] Add "Selective Connection Detection" to features list
- [ ] Document opt-in upload checkbox
- [ ] Explain Chunks tab structure (3 sub-tabs)
- [ ] Document server actions in `src/app/actions/connections.ts`

**File**: `docs/JOB_SYSTEM.md`

- [ ] Document detect-connections job input_data schema
- [ ] Document chunk_ids parameter (optional)
- [ ] Document trigger field values (upload, single, batch, admin-panel)
- [ ] Add example job creation snippets

**File**: `docs/ARCHITECTURE.md`

- [ ] Add chunk detection tracking to database schema section
- [ ] Document chunk-detection-store in state management section
- [ ] Add Chunks tab to UI components section

### Success Criteria

#### Automated Verification:
- [ ] All tests pass: `npm test`
- [ ] Type check: `npm run type-check`
- [ ] Linting: `npm run lint`
- [ ] Build succeeds: `npm run build`

#### Manual Verification:
- [ ] All end-to-end workflows complete successfully
- [ ] Performance acceptable with 500+ chunks
- [ ] All edge cases handled gracefully
- [ ] UI polish complete (loading, errors, animations)
- [ ] Documentation updated

### Service Restarts:
- [ ] Full restart: `npm run stop && npm run dev`

---

## References

### Architecture
- **ARCHITECTURE.md**: System architecture overview
- **PROCESSING_PIPELINE.md**: 10-stage processing pipeline
- **JOB_SYSTEM.md**: Background job system documentation

### Testing
- **TESTING_RULES.md**: Testing philosophy and rules
- **TESTING_README.md**: Quick start testing guide

### Similar Implementations
- **ConnectionCard**: `src/components/sidebar/ConnectionCard.tsx` (card pattern)
- **AnnotationsList**: `src/components/sidebar/AnnotationsList.tsx` (card + inline editing)
- **ExportTab**: `src/components/admin/tabs/ExportTab.tsx` (multi-select pattern)
- **background-jobs.ts**: `src/stores/admin/background-jobs.ts` (job tracking)

### Key Files Modified
- `worker/engines/orchestrator.ts:15-70`
- `worker/engines/semantic-similarity.ts:74-90`
- `worker/handlers/detect-connections.ts:17-98`
- `worker/handlers/process-document.ts:97-556`
- `src/components/upload/DocumentPreview.tsx:400-450`
- `src/app/actions/documents.ts:60-286`

---

**END OF PLAN**
