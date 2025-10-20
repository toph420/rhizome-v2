# Selective Connection Detection - Complete Implementation Plan V2

**Created**: 2025-10-18
**Status**: Ready for Implementation
**Priority**: High

## Executive Summary

Transform connection detection from automatic all-or-nothing to flexible, user-driven progressive enhancement. Users can:
- Skip connection detection during upload (opt-in via checkbox)
- Detect connections for individual chunks while reading
- Batch detect multiple selected chunks from RightPanel
- Batch detect all undetected chunks from Admin Panel

**Core Philosophy**: Connection detection is expensive (time + compute). Users should control when and what gets detected.

---

## Table of Contents

1. [Problem Statement](#problem-statement)
2. [Solution Overview](#solution-overview)
3. [User Workflows](#user-workflows)
4. [Architecture Changes](#architecture-changes)
5. [Implementation Plan](#implementation-plan)
6. [Testing Strategy](#testing-strategy)

---

## Problem Statement

### Current Issues

**1. Forced Connection Detection**
- Upload document → MUST detect connections for ALL chunks
- No way to skip or defer detection
- Expensive for large documents (500 chunks = 30-60 min in LOCAL mode)

**2. Poor Multi-Document Queue Timing**
```
Upload 3 books
→ Book 1 processes (extract/chunk/embed) - 15 min
→ Book 2 processes (extract/chunk/embed) - 15 min
→ Book 3 processes (extract/chunk/embed) - 15 min
→ WAIT for all 3 to finish
→ THEN detect connections for all 3 together - 45 min

Total: 90 minutes before exploring Book 1's connections
```

**3. No Granular Control**
- Can't choose which chunks get detection
- Can't detect connections while reading (progressive discovery)
- Reprocess existing connections ≠ detect for first time

### Desired State

**1. Optional Connection Detection**
- Upload → Checkbox "Detect connections" (default: unchecked)
- User chooses: detect now, detect later, or never

**2. Per-Document Job Isolation**
```
Upload 3 books
→ Book 1 processes → immediately detect Book 1 connections (if enabled)
→ Book 2 processes → immediately detect Book 2 connections (if enabled)
→ Book 3 processes → immediately detect Book 3 connections (if enabled)

Jobs run in parallel, explore Book 1 while Book 2 still processing
```

**3. Granular Detection Control**
- **Upload**: Opt-in checkbox
- **While Reading**: Single chunk detection from tooltip
- **Batch Selection**: Select multiple chunks, detect together
- **Admin Panel**: Detect all undetected chunks

---

## Solution Overview

### Database Changes

**Migration 053: Chunk-level detection tracking**

```sql
-- Add detection status to chunks table
ALTER TABLE chunks
  ADD COLUMN connections_detected BOOLEAN DEFAULT false,
  ADD COLUMN connections_detected_at TIMESTAMP WITH TIME ZONE;

-- Index for efficient queries
CREATE INDEX idx_chunks_connections_detected
  ON chunks(document_id, connections_detected);

-- Migration strategy: Mark all existing chunks as undetected
UPDATE chunks SET connections_detected = false;

-- Optional: Cached stats on documents table
ALTER TABLE documents
  ADD COLUMN connections_detected_count INTEGER DEFAULT 0,
  ADD COLUMN total_chunks_count INTEGER DEFAULT 0;

-- Trigger to update document stats
CREATE OR REPLACE FUNCTION update_document_chunk_stats()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE documents
  SET
    connections_detected_count = (
      SELECT COUNT(*) FROM chunks
      WHERE document_id = NEW.document_id
      AND connections_detected = true
    ),
    total_chunks_count = (
      SELECT COUNT(*) FROM chunks
      WHERE document_id = NEW.document_id
    )
  WHERE id = NEW.document_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_chunk_stats
AFTER INSERT OR UPDATE OF connections_detected ON chunks
FOR EACH ROW
EXECUTE FUNCTION update_document_chunk_stats();

-- Helper function for chunk stats
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

### Worker Architecture Changes

**1. Orchestrator Extension**

```typescript
// worker/engines/orchestrator.ts

export interface OrchestratorConfig {
  enabledEngines?: ('semantic_similarity' | 'contradiction_detection' | 'thematic_bridge')[];
  sourceChunkIds?: string[];  // NEW: If provided, only detect for these chunks
  targetDocumentIds?: string[];  // Existing: filter target documents
  reprocessingBatch?: string;
  semanticSimilarity?: any;
  contradictionDetection?: any;
  thematicBridge?: any;
  onProgress?: (percent: number, stage: string, details: string) => Promise<void>;
}

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
      reprocessingBatch
    });
    allConnections.push(...connections);
    byEngine.semantic_similarity = connections.length;
  }

  // Similar for contradiction_detection and thematic_bridge...
}
```

**2. Engine Modifications (All 3 Engines)**

Pattern applies to:
- `semantic-similarity.ts`
- `contradiction-detection.ts`
- `thematic-bridge.ts`
- `thematic-bridge-qwen.ts`

```typescript
// Example: worker/engines/semantic-similarity.ts

export async function runSemanticSimilarity(
  documentId: string,
  config: SemanticConfig = {}
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

**3. Handler Updates**

```typescript
// worker/handlers/detect-connections.ts

export async function detectConnectionsHandler(supabase: any, job: any): Promise<void> {
  const { document_id, chunk_ids, chunk_count, trigger } = job.input_data;

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

**4. Process Document Handler Updates**

```typescript
// worker/handlers/process-document.ts

export async function processDocumentHandler(supabase: any, job: any): Promise<void> {
  const { document_id, detect_connections = false } = job.input_data;  // NEW: default false

  // ... existing processing logic (extract, chunk, embed) ...

  // After processing completes successfully
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
          documentTitle: job.metadata.documentTitle,
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

---

## User Workflows

### Workflow 1: Upload with Optional Detection

```
User uploads document
  ↓
DocumentPreview shows metadata form
  ↓
Checkbox: "Detect connections after processing" (unchecked by default)
  ↓
User checks checkbox → opt-in to detection
  ↓
Click "Process Document"
  ↓
Processing job created with detect_connections: true
  ↓
Document processes: Extract → Chunk → Embed
  ↓
Process handler auto-creates detect-connections job
  ↓
Detection job runs, marks all chunks as detected
  ↓
User can explore connections in RightPanel
```

**If checkbox unchecked:**
```
Processing completes → All chunks marked connections_detected: false
User can detect later using other workflows
```

### Workflow 2: Single Chunk Detection (Reader Tooltip)

```
User reading document
  ↓
Hovers over chunk → ChunkMetadataIcon tooltip appears
  ↓
Tooltip shows:
  - "Chunk #42"
  - "Not scanned yet ⚠️" (if connections_detected: false)
  - [Detect Connections] button
  - [Add to Batch] button
  ↓
Click "Detect Connections"
  ↓
Server action creates job with chunk_ids: [chunk-42-id]
  ↓
Job appears in ProcessingDock
  ↓
Detection completes → chunk marked connections_detected: true
  ↓
Tooltip updates to show connection count
  ↓
RightPanel Connections tab shows results
```

### Workflow 3: Batch Detection (Chunks Tab Selection)

```
User opens RightPanel → Chunks Tab → All Chunks sub-tab
  ↓
Sees virtualized list of all chunks with checkboxes
  ↓
Selects multiple chunks (click checkboxes)
  - Chunk #5 [✓] Not scanned
  - Chunk #12 [✓] Not scanned
  - Chunk #28 [✓] Not scanned
  ↓
Floating batch actions bar appears:
  "3 chunks selected - [Detect Connections] [Clear Selection]"
  ↓
Click "Detect Connections"
  ↓
Server action creates job with chunk_ids: [5, 12, 28]
  ↓
Job appears in ProcessingDock: "Detect Connections - 3 Chunks"
  ↓
Detection completes → all 3 chunks marked detected
  ↓
Checkboxes cleared, selection reset
```

### Workflow 4: Add to Batch from Tooltip

```
User reading, hovers chunk → tooltip appears
  ↓
Click "Add to Batch" button in tooltip
  ↓
Chunk checkbox in RightPanel Chunks tab gets marked
  ↓
Subtle toast: "Added to batch (1 chunk selected)"
  ↓
User continues reading, adds more chunks to batch
  ↓
Opens Chunks tab when ready
  ↓
Sees selected chunks with checkboxes marked
  ↓
Clicks "Detect Connections for 5 Chunks"
  ↓
Batch detection job created and runs
```

### Workflow 5: Single Detection from Chunks Tab

```
User in Chunks tab, browsing all chunks
  ↓
Expands accordion for Chunk #42
  ↓
Sees full content and metadata
  ↓
Sees "Detect Connections" button (not detected)
  ↓
Click button (without checking checkbox)
  ↓
Single detection job created for just that chunk
  ↓
Job runs, chunk marked detected
  ↓
Button disappears, connection count shown
```

### Workflow 6: Batch Detect All Undetected (Admin Panel)

```
User opens Admin Panel (Cmd+Shift+A)
  ↓
Goes to Connections tab
  ↓
Sees "Chunk Detection Status" section at top:
  - 120 Chunks Detected
  - 367 Not Scanned Yet
  - 24.6% complete
  ↓
Clicks "Detect All Undetected Chunks" button
  ↓
Job created with chunk_ids: [all 367 undetected chunks]
  ↓
Job appears in ProcessingDock: "Detect Connections - 367 Chunks"
  ↓
Progress updates as chunks are processed
  ↓
Completion → All chunks marked detected
  ↓
Stats update: 487 / 487 (100%)
```

---

## Architecture Changes

### State Management

**New Store: `src/stores/chunk-detection-store.ts`**

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

### Server Actions

**New File: `src/app/actions/connections.ts`**

```typescript
'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

/**
 * Detect connections for specific chunk(s)
 * Handles both single chunk and batch detection
 */
export async function detectChunkConnections(
  documentId: string,
  chunkIds: string[]
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    throw new Error('Not authenticated')
  }

  // Get document title for job metadata
  const { data: doc } = await supabase
    .from('documents')
    .select('title')
    .eq('id', documentId)
    .single()

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
        documentTitle: doc?.title || 'Unknown',
        displayName
      }
    })
    .select()
    .single()

  if (error) {
    console.error('Failed to create detection job:', error)
    throw new Error('Failed to start connection detection')
  }

  revalidatePath(`/read/${documentId}`)

  return {
    success: true,
    jobId: job.id,
    displayName
  }
}

/**
 * Detect connections for all undetected chunks in document
 * Used in Admin Panel Connections tab
 */
export async function detectAllUndetectedChunks(documentId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    throw new Error('Not authenticated')
  }

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
    throw new Error('Failed to create detection job')
  }

  revalidatePath(`/read/${documentId}`)

  return {
    success: true,
    jobId: job.id,
    chunkCount: chunkIds.length
  }
}

/**
 * Get chunk detection statistics for a document
 */
export async function getChunkDetectionStats(documentId: string) {
  const supabase = await createClient()

  const { data: stats } = await supabase
    .rpc('get_chunk_detection_stats', { doc_id: documentId })
    .single()

  return stats || { total: 0, detected: 0, undetected: 0, percentage: 0 }
}

/**
 * Get list of undetected chunk IDs (for "Select All Undetected")
 */
export async function getUndetectedChunkIds(documentId: string) {
  const supabase = await createClient()

  const { data: chunks } = await supabase
    .from('chunks')
    .select('id')
    .eq('document_id', documentId)
    .eq('connections_detected', false)
    .eq('is_current', true)
    .order('sequence_number')

  return chunks?.map(c => c.id) || []
}

/**
 * Get chunks metadata for All Chunks view (lightweight)
 */
export async function getChunksMetadata(documentId: string) {
  const supabase = await createClient()

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
    connections_detected: chunk.connections_detected,
    connections_detected_at: chunk.connections_detected_at,
    heading_path: chunk.heading_path || [],
    word_count: chunk.word_count,
    preview: chunk.content?.slice(0, 150) + '...',
    // Full content loaded on accordion expand
  })) || []
}

/**
 * Get full chunk content (lazy load on expand)
 */
export async function getChunkContent(chunkId: string) {
  const supabase = await createClient()

  const { data: chunk } = await supabase
    .from('chunks')
    .select('content, connections_detected')
    .eq('id', chunkId)
    .single()

  if (!chunk) {
    throw new Error('Chunk not found')
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
    content: chunk.content,
    connections_detected: chunk.connections_detected,
    connection_count: connectionCount
  }
}
```

### UI Components

#### 1. Upload Flow: DocumentPreview Update

**File: `src/components/upload/DocumentPreview.tsx`**

Add new prop and checkbox:

```typescript
interface DocumentPreviewProps {
  // ... existing props
  detectConnections?: boolean
  onDetectConnectionsChange?: (checked: boolean) => void
}

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
        {/* ... existing options (review workflow, chunker, etc.) ... */}

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

        {/* ... existing action buttons ... */}
      </div>
    </div>
  )
}
```

#### 2. Reader Tooltip: ChunkMetadataIcon Update

**File: `src/components/reader/ChunkMetadataIcon.tsx`**

Add detection status and action buttons:

```typescript
import { useChunkDetectionStore } from '@/stores/chunk-detection-store'
import { detectChunkConnections } from '@/app/actions/connections'
import { Sparkles, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useToast } from '@/hooks/use-toast'

export function ChunkMetadataIcon({
  chunk,
  chunkIndex,
  alwaysVisible = false,
  style,
  textOffset
}: ChunkMetadataIconProps) {
  const { toggleChunk, selectedChunkIds } = useChunkDetectionStore()
  const { toast } = useToast()
  const [isDetecting, setIsDetecting] = useState(false)

  const isSelected = selectedChunkIds.has(chunk.id)

  const handleSingleDetect = async () => {
    setIsDetecting(true)
    try {
      const result = await detectChunkConnections(chunk.document_id, [chunk.id])
      toast({
        title: 'Detection Started',
        description: `${result.displayName} - check ProcessingDock for progress`
      })
    } catch (error) {
      toast({
        title: 'Detection Failed',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive'
      })
    } finally {
      setIsDetecting(false)
    }
  }

  const handleAddToBatch = () => {
    toggleChunk(chunk.id)
    toast({
      title: isSelected ? 'Removed from batch' : 'Added to batch',
      description: `${selectedChunkIds.size + (isSelected ? -1 : 1)} chunks selected`
    })
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

#### 3. Chunks Tab: Unified Interface

**File: `src/components/sidebar/chunks-tab.tsx`** (NEW)

```typescript
'use client'

import { useState } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ChunkStatsOverview } from './chunk-stats-overview'
import { AllChunksView } from './all-chunks-view'
import { ChunkQualityMonitoring } from './chunk-quality-monitoring'

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

      {/* All Chunks: Virtualized accordion list with batch selection */}
      <TabsContent value="all-chunks" className="mt-4">
        <AllChunksView
          documentId={documentId}
          currentChunkId={currentChunkId}
        />
      </TabsContent>

      {/* Quality: Chonkie confidence monitoring (existing component moved here) */}
      <TabsContent value="quality" className="mt-4">
        <ChunkQualityMonitoring documentId={documentId} />
      </TabsContent>
    </Tabs>
  )
}
```

#### 4. Chunk Stats Overview

**File: `src/components/sidebar/chunk-stats-overview.tsx`** (NEW)

```typescript
'use client'

import { useQuery } from '@tanstack/react-query'
import { getChunkDetectionStats, detectAllUndetectedChunks } from '@/app/actions/connections'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Sparkles, Loader2 } from 'lucide-react'
import { useState } from 'react'
import { useToast } from '@/hooks/use-toast'

export function ChunkStatsOverview({ documentId }: { documentId: string }) {
  const [isDetecting, setIsDetecting] = useState(false)
  const { toast } = useToast()

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
        toast({
          title: 'Already Complete',
          description: 'All chunks have already been scanned for connections'
        })
      } else {
        toast({
          title: 'Detection Started',
          description: `Detecting connections for ${result.chunkCount} chunks - check ProcessingDock for progress`
        })
      }

      refetch()
    } catch (error) {
      toast({
        title: 'Detection Failed',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive'
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
    <div className="space-y-4">
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

#### 5. All Chunks View with Batch Selection

**File: `src/components/sidebar/all-chunks-view.tsx`** (NEW)

```typescript
'use client'

import { useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Virtuoso, type VirtuosoHandle } from 'react-virtuoso'
import { getChunksMetadata } from '@/app/actions/connections'
import { useReaderStore } from '@/stores/reader-store'
import { useChunkDetectionStore } from '@/stores/chunk-detection-store'
import { ChunkAccordionItem } from './chunk-accordion-item'
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
          <ChunkAccordionItem
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

#### 6. Chunk Accordion Item with Checkbox

**File: `src/components/sidebar/chunk-accordion-item.tsx`** (NEW)

```typescript
'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Checkbox } from '@/components/ui/checkbox'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
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
import { useToast } from '@/hooks/use-toast'
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

export function ChunkAccordionItem({
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
  const { toast } = useToast()

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
      toast({
        title: 'Detection Started',
        description: `${result.displayName} - check ProcessingDock for progress`
      })
    } catch (error) {
      toast({
        title: 'Detection Failed',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive'
      })
    } finally {
      setIsDetecting(false)
    }
  }

  const handleScrollToChunk = () => {
    setCurrentChunkId(chunk.id)
    setScrollSource('chunks-tab')
  }

  return (
    <Collapsible
      open={isExpanded}
      onOpenChange={setIsExpanded}
      className={cn(
        "border-b transition-colors",
        isActive && "bg-accent/50 border-l-4 border-l-primary",
        isSelected && "bg-blue-50 dark:bg-blue-950"
      )}
    >
      <CollapsibleTrigger className="w-full p-3 hover:bg-accent/30 transition-colors">
        <div className="flex items-start gap-3">
          {/* Checkbox (left side) */}
          <Checkbox
            checked={isSelected}
            onCheckedChange={(checked) => {
              toggleChunk(chunk.id)
            }}
            onClick={(e) => e.stopPropagation()}  // Prevent accordion toggle
            className="mt-1"
          />

          {/* Chunk Info */}
          <div className="flex-1 text-left">
            <div className="flex items-center gap-2 mb-1">
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
            </div>

            {/* Heading Path */}
            {chunk.heading_path.length > 0 && (
              <div className="text-xs text-muted-foreground mb-1">
                {chunk.heading_path.join(' › ')}
              </div>
            )}

            {/* Preview */}
            <p className="text-sm line-clamp-2">
              {chunk.preview}
            </p>

            <div className="text-xs text-muted-foreground mt-1">
              {chunk.word_count} words
            </div>
          </div>

          {/* Expand Icon */}
          <ChevronDown
            className={cn(
              "h-4 w-4 shrink-0 transition-transform",
              isExpanded && "rotate-180"
            )}
          />
        </div>
      </CollapsibleTrigger>

      <CollapsibleContent className="p-3 pt-0">
        {/* Full Content (lazy loaded) */}
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
  )
}
```

#### 7. Batch Actions Bar

**File: `src/components/sidebar/batch-actions-bar.tsx`** (NEW)

```typescript
'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Sparkles, X, CheckSquare, Loader2 } from 'lucide-react'
import { useChunkDetectionStore } from '@/stores/chunk-detection-store'
import { detectChunkConnections, getUndetectedChunkIds } from '@/app/actions/connections'
import { useToast } from '@/hooks/use-toast'
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
  const { toast } = useToast()

  const handleBatchDetect = async () => {
    const chunkIds = Array.from(selectedChunkIds)

    setIsDetecting(true)
    try {
      const result = await detectChunkConnections(documentId, chunkIds)
      toast({
        title: 'Batch Detection Started',
        description: `${result.displayName} - check ProcessingDock for progress`
      })
      clearSelection()
    } catch (error) {
      toast({
        title: 'Detection Failed',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive'
      })
    } finally {
      setIsDetecting(false)
    }
  }

  const handleSelectAllUndetected = async () => {
    const undetectedIds = await getUndetectedChunkIds(documentId)
    selectAllUndetected(undetectedIds)
    toast({
      title: 'Selection Updated',
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

#### 8. Admin Panel: Connections Tab Update

**File: `src/components/admin/tabs/ConnectionsTab.tsx`**

Add detection stats section ABOVE existing reprocessing UI:

```typescript
export function ConnectionsTab() {
  // ... existing state ...
  const [detectionStats, setDetectionStats] = useState<any>(null)

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
                onClick={async () => {
                  await detectAllUndetectedChunks(selectedDocId!)
                  loadDetectionStats()
                }}
                className="w-full"
              >
                <Sparkles className="mr-2 h-4 w-4" />
                Detect All Undetected Chunks
                <Badge variant="secondary" className="ml-2">
                  {detectionStats.undetected}
                </Badge>
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

#### 9. RightPanel Integration

**File: `src/components/sidebar/right-panel.tsx`**

Replace Quality tab with Chunks tab:

```typescript
import { ChunksTab } from './chunks-tab'

export function RightPanel({ documentId, currentChunkId }: RightPanelProps) {
  return (
    <Tabs defaultValue="connections">
      <TabsList className="grid w-full grid-cols-6">
        <TabsTrigger value="connections">Connections</TabsTrigger>
        <TabsTrigger value="sparks">Sparks</TabsTrigger>
        <TabsTrigger value="flashcards">Flashcards</TabsTrigger>
        <TabsTrigger value="tune">Tune</TabsTrigger>
        <TabsTrigger value="annotations">Annotations</TabsTrigger>
        <TabsTrigger value="chunks">Chunks</TabsTrigger>  {/* Changed from Quality */}
      </TabsList>

      {/* ... other tabs ... */}

      <TabsContent value="chunks">
        <ChunksTab
          documentId={documentId}
          currentChunkId={currentChunkId}
        />
      </TabsContent>
    </Tabs>
  )
}
```

---

## Implementation Plan

### Phase 1: Database & Job System (Foundation)
**Priority**: Critical
**Time**: 4-6 hours

**Tasks:**
- [ ] Create migration 053: Add `connections_detected` columns to chunks table
- [ ] Create helper function: `get_chunk_detection_stats(doc_id)`
- [ ] Run migration, mark all existing chunks as undetected
- [ ] Update `orchestrator.ts`: Add `sourceChunkIds` parameter
- [ ] Update all 3 engines: Add `sourceChunkIds` filtering
  - [ ] `semantic-similarity.ts`
  - [ ] `contradiction-detection.ts`
  - [ ] `thematic-bridge.ts`
  - [ ] `thematic-bridge-qwen.ts`
- [ ] Update `detect-connections.ts` handler:
  - [ ] Accept optional `chunk_ids` from `input_data`
  - [ ] Pass to orchestrator as `sourceChunkIds`
  - [ ] Update `connections_detected` flag after processing
- [ ] Update `process-document.ts` handler:
  - [ ] Accept `detect_connections` parameter (default: false)
  - [ ] Conditionally create connection detection job
  - [ ] Mark chunks as undetected if skipped

**Testing:**
- [ ] Upload document with detection enabled → verify job created
- [ ] Upload document with detection disabled → verify chunks marked undetected
- [ ] Create detection job with specific chunk IDs → verify only those chunks processed
- [ ] Check all chunks marked as detected after job completes

**Files:**
- `supabase/migrations/053_chunk_connection_detection.sql`
- `worker/engines/orchestrator.ts`
- `worker/engines/semantic-similarity.ts`
- `worker/engines/contradiction-detection.ts`
- `worker/engines/thematic-bridge.ts`
- `worker/engines/thematic-bridge-qwen.ts`
- `worker/handlers/detect-connections.ts`
- `worker/handlers/process-document.ts`

---

### Phase 2: Upload Flow (User Control)
**Priority**: High
**Time**: 3-4 hours

**Tasks:**
- [ ] Add checkbox to `DocumentPreview.tsx`:
  - [ ] "Detect connections after processing" (unchecked by default)
  - [ ] Tooltip explaining the option
  - [ ] Time estimate alert when checked
- [ ] Pass `detectConnections` to upload action
- [ ] Update upload action to include in `input_data`

**Testing:**
- [ ] Upload with checkbox checked → verify detection job created
- [ ] Upload with checkbox unchecked → verify no detection job
- [ ] Verify time estimate shows correctly

**Files:**
- `src/components/upload/DocumentPreview.tsx`
- Upload action (wherever `DocumentPreview.onConfirm` is called)

---

### Phase 3: Server Actions (API Layer)
**Priority**: High
**Time**: 3-4 hours

**Tasks:**
- [ ] Create `src/app/actions/connections.ts`:
  - [ ] `detectChunkConnections(documentId, chunkIds[])`
  - [ ] `detectAllUndetectedChunks(documentId)`
  - [ ] `getChunkDetectionStats(documentId)`
  - [ ] `getUndetectedChunkIds(documentId)`
  - [ ] `getChunksMetadata(documentId)`
  - [ ] `getChunkContent(chunkId)`

**Testing:**
- [ ] Call `detectChunkConnections` with single ID → verify job created
- [ ] Call `detectChunkConnections` with multiple IDs → verify batch job
- [ ] Call `detectAllUndetectedChunks` → verify correct chunk count
- [ ] Call `getChunkDetectionStats` → verify stats accuracy
- [ ] Call `getChunksMetadata` → verify lightweight data
- [ ] Call `getChunkContent` → verify full content loaded

**Files:**
- `src/app/actions/connections.ts` (NEW)

---

### Phase 4: State Management (Client State)
**Priority**: High
**Time**: 2-3 hours

**Tasks:**
- [ ] Create `src/stores/chunk-detection-store.ts`:
  - [ ] Selection state (`selectedChunkIds`)
  - [ ] Document tracking (`currentDocumentId`)
  - [ ] Actions (`toggleChunk`, `clearSelection`, `selectAllUndetected`)
- [ ] Extend `src/stores/reader-store.ts`:
  - [ ] Add `scrollSource` tracking
  - [ ] Add `setCurrentChunkId`

**Testing:**
- [ ] Toggle chunk selection → verify state updates
- [ ] Switch documents → verify selection clears
- [ ] Select all undetected → verify correct chunks selected

**Files:**
- `src/stores/chunk-detection-store.ts` (NEW)
- `src/stores/reader-store.ts` (EXTEND)

---

### Phase 5: Chunks Tab (Main UI)
**Priority**: High
**Time**: 8-10 hours

**Tasks:**
- [ ] Create `ChunksTab.tsx` wrapper with 3 sub-tabs
- [ ] Create `ChunkStatsOverview.tsx`:
  - [ ] Stats cards (detected, undetected, progress)
  - [ ] "Detect All Undetected" button
- [ ] Create `AllChunksView.tsx`:
  - [ ] Virtualized list with Virtuoso
  - [ ] Load chunks metadata
  - [ ] Synced scrolling integration
- [ ] Create `ChunkAccordionItem.tsx`:
  - [ ] Checkbox for batch selection
  - [ ] Detection status badge
  - [ ] Lazy load content on expand
  - [ ] "Detect Connections" button
  - [ ] "View in Reader" button
- [ ] Create `BatchActionsBar.tsx`:
  - [ ] Floating bar when chunks selected
  - [ ] "Detect Connections for X Chunks" button
  - [ ] "Select All Undetected" button
  - [ ] "Clear Selection" button
- [ ] Move `ChunkQualityMonitoring` into Chunks tab

**Testing:**
- [ ] Load large document (500+ chunks) → verify smooth scrolling
- [ ] Select multiple chunks → verify batch bar appears
- [ ] Click "Detect Connections" on single chunk → verify job created
- [ ] Click batch detect → verify correct job created
- [ ] Expand chunk → verify content loads lazily
- [ ] Scroll in reader → verify Chunks tab scrolls to match
- [ ] Click "View in Reader" → verify reader scrolls to chunk

**Files:**
- `src/components/sidebar/chunks-tab.tsx` (NEW)
- `src/components/sidebar/chunk-stats-overview.tsx` (NEW)
- `src/components/sidebar/all-chunks-view.tsx` (NEW)
- `src/components/sidebar/chunk-accordion-item.tsx` (NEW)
- `src/components/sidebar/batch-actions-bar.tsx` (NEW)
- `src/components/sidebar/chunk-quality-monitoring.tsx` (MOVE)

---

### Phase 6: Reader Tooltip (Quick Actions)
**Priority**: Medium
**Time**: 3-4 hours

**Tasks:**
- [ ] Update `ChunkMetadataIcon.tsx`:
  - [ ] Add detection status display
  - [ ] Add "Detect Connections" button (single)
  - [ ] Add "Add to Batch" button
  - [ ] Show connection count if detected
  - [ ] Integrate with chunk detection store

**Testing:**
- [ ] Hover over undetected chunk → verify buttons appear
- [ ] Click "Detect Connections" → verify job created
- [ ] Click "Add to Batch" → verify chunk selected in store
- [ ] Click "Add to Batch" again → verify chunk deselected
- [ ] Hover over detected chunk → verify connection count shown

**Files:**
- `src/components/reader/ChunkMetadataIcon.tsx`

---

### Phase 7: Admin Panel Integration
**Priority**: Medium
**Time**: 2-3 hours

**Tasks:**
- [ ] Update `ConnectionsTab.tsx`:
  - [ ] Add detection stats section at top
  - [ ] Add "Detect All Undetected Chunks" button
  - [ ] Add divider between detection and reprocessing
  - [ ] Keep existing reprocessing UI intact

**Testing:**
- [ ] Select document → verify stats load
- [ ] Click "Detect All Undetected" → verify job created with correct chunk count
- [ ] Verify existing reprocessing functionality still works

**Files:**
- `src/components/admin/tabs/ConnectionsTab.tsx`

---

### Phase 8: RightPanel Integration
**Priority**: Medium
**Time**: 1-2 hours

**Tasks:**
- [ ] Update `RightPanel.tsx`:
  - [ ] Replace "Quality" tab with "Chunks" tab
  - [ ] Pass `documentId` and `currentChunkId` props
  - [ ] Update tab grid (6 tabs unchanged)

**Testing:**
- [ ] Verify all 6 tabs render correctly
- [ ] Verify Chunks tab loads without errors
- [ ] Verify synced scrolling works

**Files:**
- `src/components/sidebar/right-panel.tsx`

---

### Phase 9: Testing & Polish
**Priority**: High
**Time**: 4-6 hours

**Tasks:**
- [ ] End-to-end workflow tests:
  - [ ] Upload → skip detection → detect per-chunk → verify results
  - [ ] Upload → enable detection → verify auto-detection
  - [ ] Batch select → detect → verify job completion
  - [ ] Admin panel detect all → verify progress
- [ ] Performance tests:
  - [ ] Large document (500+ chunks) in Chunks tab
  - [ ] Rapid chunk selection/deselection
  - [ ] Synced scrolling with large documents
- [ ] Edge cases:
  - [ ] Empty documents
  - [ ] Single chunk documents
  - [ ] All chunks already detected
  - [ ] Network errors during detection
- [ ] UI polish:
  - [ ] Loading states
  - [ ] Error handling
  - [ ] Toast notifications
  - [ ] Animations
- [ ] Documentation:
  - [ ] Update `CLAUDE.md` with Chunks tab structure
  - [ ] Update `JOB_SYSTEM.md` with detection job details
  - [ ] Add detection workflow diagrams

**Files:**
- Integration tests (create as needed)
- `docs/CLAUDE.md`
- `docs/JOB_SYSTEM.md`

---

## Total Estimated Time: 30-42 hours

---

## Testing Strategy

### Unit Tests

**Worker Engine Tests:**
```typescript
describe('Orchestrator with sourceChunkIds', () => {
  it('should process only specified chunks', async () => {
    const result = await processDocument(documentId, {
      sourceChunkIds: ['chunk-1', 'chunk-2'],
      enabledEngines: ['semantic_similarity']
    })

    expect(result.totalConnections).toBeGreaterThan(0)
    // Verify only chunk-1 and chunk-2 were queried
  })

  it('should process all chunks when sourceChunkIds not provided', async () => {
    const result = await processDocument(documentId, {
      enabledEngines: ['semantic_similarity']
    })

    expect(result.totalConnections).toBeGreaterThan(0)
  })
})
```

**State Management Tests:**
```typescript
describe('ChunkDetectionStore', () => {
  it('should clear selection when switching documents', () => {
    const { result } = renderHook(() => useChunkDetectionStore())

    act(() => {
      result.current.setDocument('doc-1')
      result.current.toggleChunk('chunk-1')
    })

    expect(result.current.selectedChunkIds.size).toBe(1)

    act(() => {
      result.current.setDocument('doc-2')
    })

    expect(result.current.selectedChunkIds.size).toBe(0)
  })
})
```

### Integration Tests

**Upload Flow:**
```typescript
test('upload with detection enabled creates detection job', async () => {
  // Upload document with detectConnections: true
  const documentId = await uploadDocument({
    file: testPdf,
    metadata: { title: 'Test Doc' },
    detectConnections: true
  })

  // Wait for processing to complete
  await waitForJobCompletion('process-document', documentId)

  // Verify detection job was created
  const detectionJob = await getJobByDocumentId('detect-connections', documentId)
  expect(detectionJob).toBeDefined()
  expect(detectionJob.input_data.trigger).toBe('upload')
})
```

**Batch Detection:**
```typescript
test('batch detection creates single job for multiple chunks', async () => {
  const chunkIds = ['chunk-1', 'chunk-2', 'chunk-3']

  const result = await detectChunkConnections(documentId, chunkIds)

  expect(result.success).toBe(true)

  const job = await getJob(result.jobId)
  expect(job.input_data.chunk_ids).toEqual(chunkIds)
  expect(job.input_data.chunk_count).toBe(3)
})
```

### Performance Tests

**Large Document Virtualization:**
```typescript
test('Chunks tab handles 1000+ chunks smoothly', async () => {
  const documentId = await createLargeDocument(1000)

  const { container } = render(<AllChunksView documentId={documentId} />)

  // Verify virtualization is working (only visible items rendered)
  const renderedItems = container.querySelectorAll('[data-chunk-item]')
  expect(renderedItems.length).toBeLessThan(50)  // Only renders visible items

  // Scroll to bottom
  const virtuoso = container.querySelector('[data-test-id=virtuoso-scroller]')
  fireEvent.scroll(virtuoso, { target: { scrollTop: 10000 } })

  // Verify new items rendered, old items unmounted
  await waitFor(() => {
    const newRenderedItems = container.querySelectorAll('[data-chunk-item]')
    expect(newRenderedItems.length).toBeLessThan(50)
  })
})
```

### End-to-End Tests

**Complete Workflow:**
```typescript
test('full detection workflow: skip → per-chunk → batch', async () => {
  // 1. Upload without detection
  const documentId = await uploadDocument({
    file: testPdf,
    detectConnections: false  // Skip detection
  })

  await waitForProcessingComplete(documentId)

  // Verify no connections detected
  let stats = await getChunkDetectionStats(documentId)
  expect(stats.detected).toBe(0)

  // 2. Detect single chunk from tooltip
  const chunks = await getChunksMetadata(documentId)
  await detectChunkConnections(documentId, [chunks[0].id])
  await waitForDetectionComplete()

  stats = await getChunkDetectionStats(documentId)
  expect(stats.detected).toBe(1)

  // 3. Batch detect remaining chunks
  const undetectedIds = await getUndetectedChunkIds(documentId)
  await detectChunkConnections(documentId, undetectedIds)
  await waitForDetectionComplete()

  stats = await getChunkDetectionStats(documentId)
  expect(stats.detected).toBe(stats.total)
  expect(stats.percentage).toBe(100)
})
```

---

## Success Criteria

- [ ] Can upload document WITHOUT detecting connections (opt-in checkbox)
- [ ] Can detect connections for single chunk from reader tooltip
- [ ] Can batch-detect multiple selected chunks from Chunks tab
- [ ] Can detect all undetected chunks from Admin Panel
- [ ] Chunks Tab shows accurate detection stats (detected/undetected counts)
- [ ] All Chunks view loads 500+ chunks smoothly (virtualized)
- [ ] Synced scrolling works bidirectionally (reader ↔ chunks tab)
- [ ] Per-document connection jobs run in parallel after processing
- [ ] No performance regressions in reader or job system
- [ ] Clear visual feedback for detection status everywhere
- [ ] Batch selection state clears when switching documents
- [ ] ProcessingDock shows detection jobs with progress
- [ ] Jobs tab shows detection jobs with clear naming

---

## Future Enhancements (Out of Scope)

- Cost estimation for cloud mode connection detection (currently LOCAL mode focus)
- Bulk chunk actions beyond detection (merge, split, edit)
- Connection quality scoring (rank connections by relevance)
- Chunk editing/merging from Chunks tab
- Export/import connection detection status
- Analytics dashboard for connection patterns
- Keyboard shortcuts for chunk navigation
- "Smart detection" - ML predicts which chunks likely have connections
- Progressive detection - detect most important chunks first

---

## Notes

- **Personal tool philosophy**: Optimize for single-user UX, not multi-tenant scale
- **LOCAL mode is primary**: Cloud mode exists for A/B testing only
- **Existing test documents**: Will show as "undetected" after migration (intentional, allows testing)
- **Synced scrolling**: Should be smooth but doesn't need to be pixel-perfect
- **Focus on responsiveness**: Per-chunk detection should feel immediate, even if job takes time
- **Progressive enhancement**: Users discover chunks worth connecting as they read

---

## Decision Log

| Decision | Rationale | Date |
|----------|-----------|------|
| Chunk-level tracking (not document-level) | Granular control, better analytics, fits per-chunk workflow | 2025-10-18 |
| Merge Quality into Chunks tab | Unified chunk management, both are chunk-level features | 2025-10-18 |
| Virtualized + lazy load for All Chunks | Performance with 500+ chunks, smooth UX | 2025-10-18 |
| LOCAL mode default | Free, privacy-preserving, good enough for per-chunk workflow | 2025-10-18 |
| Synced scrolling reader ↔ chunks tab | Natural UX, user always knows context | 2025-10-18 |
| Checkbox unchecked by default | Opt-in model, user controls expensive operations | 2025-10-18 |
| Batch selection per-document only | Simpler UX, job is per-document anyway | 2025-10-18 |
| Single handler for all detection | Same logic, just different chunk filtering | 2025-10-18 |
| Left-side checkbox in accordion | Follows Gmail/Notion patterns, familiar UX | 2025-10-18 |
| Re-detection hidden (use Reprocess) | Cleaner UX, clear separation of concerns | 2025-10-18 |
| All 3 engines modified together | Identical pattern, easier to maintain consistency | 2025-10-18 |

---

**END OF PLAN**
