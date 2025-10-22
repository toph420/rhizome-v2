# Flexible Connection Detection Implementation Plan

**Created**: 2025-01-22
**Status**: Ready for Implementation
**Priority**: High

## Overview

Transform connection detection from automatic all-or-nothing to flexible, user-driven progressive enhancement. Users can skip detection during upload, detect connections for individual chunks while reading, batch detect multiple chunks, or detect all undetected chunks from Admin Panel.

**Core Philosophy**: Connection detection is expensive (time + compute). Users should control when and what gets detected.

## Current State Analysis

### What Exists

**Automatic Detection** (`worker/lib/managers/document-processing-manager.ts:432-444`):
- Connection detection is **mandatory** at stage 6 of document processing
- Calls `orchestrateConnections()` with all 3 engines automatically
- No option to skip or defer detection
- Errors don't fail the overall job (non-blocking at line 442)

**Orchestrator** (`worker/engines/orchestrator.ts:42-150`):
- Coordinates all 3 engines sequentially
- Already supports `enabledEngines` selection
- Has `targetDocumentIds` for filtering (Add New mode)
- Progress tracking with callbacks
- **Missing**: `sourceChunkIds` parameter for per-chunk detection

**Admin Panel** (`src/components/admin/tabs/ConnectionsTab.tsx`):
- Reprocessing UI with mode selection (all, add_new, smart)
- Engine selection (checkboxes for 3 engines)
- Preservation options for validated connections
- Real-time progress tracking via Zustand store

**Database Schema** (`supabase/migrations/021_convert_connections_to_chunk_based.sql`):
- Chunk-to-chunk connections with `connection_type`
- User validation tracking (`user_validated`)
- Strength scores (0-1)
- **Missing**: Chunk-level detection tracking

### Key Discoveries

1. **Manager Pattern**: Handlers now use manager classes (`DocumentProcessingManager`, `ConnectionDetectionManager`)
2. **Progress Tracking**: Comprehensive via `HandlerJobManager.updateProgress()`
3. **Job System**: Background jobs with pause/resume, retry, real-time updates
4. **Existing Patterns**:
   - Batch selection with checkboxes (ExportTab)
   - Server actions creating jobs (reprocessConnections)
   - Sequential processing with conflict resolution (ImportTab)

### Constraints Discovered

- No `connections_detected` field on chunks table
- DocumentProcessingManager hardcoded to run detection (line 112)
- Orchestrator doesn't support per-chunk filtering yet
- Engines expect document-level processing only

## Desired End State

### User Workflows

**Upload Flow**:
```
User uploads document
→ DocumentPreview shows checkbox: "Detect connections" (unchecked by default)
→ User can opt-in to detection
→ Processing completes → chunks marked as undetected if skipped
→ User can detect later using other workflows
```

**Per-Chunk Detection** (Reader Tooltip):
```
User reading document
→ Hovers over chunk → ChunkMetadataIcon tooltip
→ Shows "Not scanned yet ⚠️" + [Detect Now] button
→ Click button → Single-chunk detection job created
→ ProcessingDock shows progress → Chunk marked detected
```

**Batch Detection** (Chunks Tab):
```
User opens RightPanel → Chunks Tab → All Chunks
→ Virtualized list with checkboxes
→ Select multiple chunks
→ Floating action bar: "Detect Connections for X Chunks"
→ Batch job created → All selected chunks processed
```

**Detect All Undetected** (Admin Panel):
```
Admin Panel → Connections Tab
→ Shows detection stats: "367 Not Scanned Yet"
→ Click "Detect All Undetected Chunks"
→ Job created with all undetected chunk IDs
→ Progress tracking → All chunks marked detected
```

### Verification

**Automated**:
- [ ] Migration applies: `npx supabase db reset`
- [ ] Type check: `npm run type-check`
- [ ] Build succeeds: `npm run build`
- [ ] Worker tests pass: `cd worker && npm test`

**Manual**:
- [ ] Upload with detection unchecked → no detection job
- [ ] Upload with detection checked → detection job created
- [ ] Single chunk detection → job runs for 1 chunk
- [ ] Batch detection → job runs for selected chunks
- [ ] Admin panel detect all → job runs for all undetected
- [ ] Stats update correctly after detection

## Rhizome Architecture

- **Module**: Both (Main App + Worker)
- **Storage**: Database (detection status is queryable metadata)
- **Source of Truth**: Database
- **Migration**: Yes (053_chunk_connection_detection.sql)
- **Test Tier**: Stable (fix when broken)
- **Pipeline Stages**: Stage 6 (Connection Detection) - make optional
- **Processing Mode**: Both LOCAL and CLOUD
- **Engines**: All 3 engines support `sourceChunkIds` filtering

## What We're NOT Doing

- Cost estimation for cloud mode detection
- Bulk chunk operations beyond detection (merge, split, edit)
- Connection quality scoring/ranking
- Chunk editing/merging from Chunks tab
- Export/import detection status
- Analytics dashboard for connection patterns
- Keyboard shortcuts for chunk navigation
- ML-based "smart detection" predictions
- Progressive detection (important chunks first)

## Implementation Approach

**High-level Strategy**:

1. **Database First**: Add chunk-level tracking (`connections_detected`, `connections_detected_at`)
2. **Worker Extension**: Extend orchestrator and engines to support `sourceChunkIds` filtering
3. **Manager Updates**: Make detection optional in `DocumentProcessingManager`
4. **Server Actions**: Create API layer for per-chunk and batch detection
5. **UI Components**: Build Chunks Tab with batch selection and detection controls
6. **Integration**: Wire up upload flow, reader tooltip, and Admin Panel

**Why This Order**: Database schema changes enable all other features. Worker changes are isolated. UI builds on stable backend.

---

## Phase 1: Database Schema & Helper Functions

### Overview
Add chunk-level detection tracking and helper functions for efficient stats queries.

### Changes Required

#### 1. Migration 053
**File**: `supabase/migrations/053_chunk_connection_detection.sql`

```sql
-- Add detection tracking to chunks table
ALTER TABLE chunks
  ADD COLUMN connections_detected BOOLEAN DEFAULT false,
  ADD COLUMN connections_detected_at TIMESTAMPTZ;

-- Index for efficient queries
CREATE INDEX idx_chunks_connections_detected
  ON chunks(document_id, connections_detected);

-- Helper function for chunk detection stats
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
  WHERE document_id = doc_id
  AND is_current = true;
END;
$$ LANGUAGE plpgsql;

-- Migration strategy: Mark all existing chunks as undetected
-- (Allows testing on existing documents)
UPDATE chunks SET connections_detected = false WHERE connections_detected IS NULL;

COMMENT ON COLUMN chunks.connections_detected IS 'Whether connection detection has been run for this chunk';
COMMENT ON COLUMN chunks.connections_detected_at IS 'Timestamp when connection detection completed for this chunk';
COMMENT ON FUNCTION get_chunk_detection_stats IS 'Returns detection statistics for a document (total, detected, undetected, percentage)';
```

#### 2. Type Definitions
**File**: `worker/types/database.ts`

Add to `Chunk` type:
```typescript
export interface Chunk {
  // ... existing fields

  // Connection detection tracking (NEW)
  connections_detected: boolean
  connections_detected_at: string | null
}
```

### Success Criteria

#### Automated Verification:
- [ ] Migration applies: `npx supabase db reset`
- [ ] No migration errors in output
- [ ] Index created: Check with `\d chunks` in psql
- [ ] Function created: Check with `\df get_chunk_detection_stats` in psql
- [ ] Type check passes: `npm run type-check`

#### Manual Verification:
- [ ] All existing chunks have `connections_detected = false`
- [ ] Function returns correct stats for test document
- [ ] Index improves query performance (check EXPLAIN ANALYZE)

### Service Restarts:
- [ ] Supabase: `npx supabase db reset`
- [ ] Worker: Restart via `npm run dev`
- [ ] Next.js: Auto-reload

---

## Phase 2: Worker - Orchestrator & Engine Extensions

### Overview
Extend orchestrator and all 3 engines to support per-chunk detection via `sourceChunkIds` parameter.

### Changes Required

#### 1. Orchestrator Interface Extension
**File**: `worker/engines/orchestrator.ts`

```typescript
// Line 19-27: Extend OrchestratorConfig interface
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

// Line 42-150: Update processDocument function
export async function processDocument(
  documentId: string,
  config: OrchestratorConfig = {}
): Promise<OrchestratorResult> {
  const {
    enabledEngines = ['semantic_similarity', 'contradiction_detection', 'thematic_bridge'],
    sourceChunkIds,  // NEW
    targetDocumentIds,
    reprocessingBatch,
    onProgress
  } = config;

  console.log(`[Orchestrator] Processing document ${documentId}`);
  console.log(`[Orchestrator] Enabled engines: ${enabledEngines.join(', ')}`);

  // NEW: Log chunk filtering
  if (sourceChunkIds && sourceChunkIds.length > 0) {
    console.log(`[Orchestrator] Filtering to ${sourceChunkIds.length} specific chunk(s)`);
  } else {
    console.log(`[Orchestrator] Detecting for all chunks in document`);
  }

  // ... existing orchestrator logic ...

  // Pass sourceChunkIds to each engine (line 84-89)
  const engineConfig: any = {
    targetDocumentIds,
    reprocessingBatch,
    sourceChunkIds,  // NEW: Pass through to engines
    ...DEFAULT_ENGINE_CONFIG[engineName as keyof typeof DEFAULT_ENGINE_CONFIG],
    ...config[engineName as keyof OrchestratorConfig],
  }

  // ... rest of orchestrator logic ...
}
```

#### 2. Semantic Similarity Engine
**File**: `worker/engines/semantic-similarity.ts`

```typescript
// Add to SemanticConfig interface (around line 20)
export interface SemanticConfig {
  sourceChunkIds?: string[];  // NEW
  targetDocumentIds?: string[];
  reprocessingBatch?: string;
  threshold?: number;
  maxResultsPerChunk?: number;
  crossDocumentOnly?: boolean;
}

// Update runSemanticSimilarity function (around line 50)
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

  // Get source chunks with optional filtering (around line 80)
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

  // ... rest of engine logic unchanged ...
}
```

#### 3. Contradiction Detection Engine
**File**: `worker/engines/contradiction-detection.ts`

Apply same pattern as Semantic Similarity:
```typescript
// Add to ContradictionConfig interface
export interface ContradictionConfig {
  sourceChunkIds?: string[];  // NEW
  targetDocumentIds?: string[];
  reprocessingBatch?: string;
  minConceptOverlap?: number;
  polarityThreshold?: number;
  maxResultsPerChunk?: number;
  crossDocumentOnly?: boolean;
}

// Update runContradictionDetection function
export async function runContradictionDetection(
  documentId: string,
  config: ContradictionConfig = {}
): Promise<ChunkConnection[]> {
  const {
    sourceChunkIds,  // NEW
    // ... existing config destructuring
  } = config;

  // Apply same filtering pattern as semantic-similarity
  let sourceQuery = supabase
    .from('chunks')
    .select('id, document_id, conceptual_metadata, emotional_metadata')
    .eq('document_id', documentId);

  // NEW: Filter to specific chunks
  if (sourceChunkIds && sourceChunkIds.length > 0) {
    sourceQuery = sourceQuery.in('id', sourceChunkIds);
    console.log(`[ContradictionDetection] Filtering to ${sourceChunkIds.length} source chunks`);
  }

  // ... existing reprocessing logic ...
  // ... rest of engine logic unchanged ...
}
```

#### 4. Thematic Bridge Engine
**File**: `worker/engines/thematic-bridge.ts`

Apply same pattern:
```typescript
// Add to ThematicBridgeConfig interface
export interface ThematicBridgeConfig {
  sourceChunkIds?: string[];  // NEW
  targetDocumentIds?: string[];
  reprocessingBatch?: string;
  minImportance?: number;
  minStrength?: number;
  maxSourceChunks?: number;
  maxCandidatesPerSource?: number;
  batchSize?: number;
}

// Update runThematicBridge function
export async function runThematicBridge(
  documentId: string,
  config: ThematicBridgeConfig = {}
): Promise<ChunkConnection[]> {
  const {
    sourceChunkIds,  // NEW
    // ... existing config destructuring
  } = config;

  // Apply same filtering pattern
  let sourceQuery = supabase
    .from('chunks')
    .select('id, document_id, content, themes, importance_score, conceptual_metadata')
    .eq('document_id', documentId);

  // NEW: Filter to specific chunks
  if (sourceChunkIds && sourceChunkIds.length > 0) {
    sourceQuery = sourceQuery.in('id', sourceChunkIds);
    console.log(`[ThematicBridge] Filtering to ${sourceChunkIds.length} source chunks`);
  }

  // ... existing reprocessing logic ...
  // ... rest of engine logic unchanged ...
}
```

#### 5. Thematic Bridge Qwen Variant
**File**: `worker/engines/thematic-bridge-qwen.ts`

Apply same pattern as thematic-bridge.ts (identical structure, different LLM).

### Success Criteria

#### Automated Verification:
- [ ] Type check: `npm run type-check`
- [ ] Worker tests pass: `cd worker && npm run test`
- [ ] Orchestrator test with sourceChunkIds passes
- [ ] Each engine test with sourceChunkIds passes

#### Manual Verification:
- [ ] Test orchestrator with 3 specific chunk IDs → only those 3 processed
- [ ] Test orchestrator with no sourceChunkIds → all chunks processed
- [ ] Verify console logs show correct filtering counts
- [ ] Check connections table → connections only for specified chunks

### Service Restarts:
- [ ] Worker: Restart via `npm run dev`

---

## Phase 3: Worker - Manager & Handler Updates

### Overview
Update `DocumentProcessingManager` to make detection optional, and extend `ConnectionDetectionManager` to mark chunks as detected.

### Changes Required

#### 1. DocumentProcessingManager - Optional Detection
**File**: `worker/lib/managers/document-processing-manager.ts`

```typescript
// Line 28-34: Extend DocumentProcessingOptions interface
interface DocumentProcessingOptions {
  documentId: string
  userId: string
  sourceType: SourceType
  reviewBeforeChunking?: boolean
  reviewDoclingExtraction?: boolean
  detectConnections?: boolean  // NEW: Default false (opt-in)
}

// Line 71-122: Update execute() method
async execute(): Promise<void> {
  const { documentId, userId, sourceType, detectConnections = false } = this.options;  // NEW: default false

  // ... stages 1-5 (extract, save, chunks, metadata) ...

  // Stage 6: Run connection detection (CONDITIONAL)
  if (detectConnections) {
    console.log(`[DocumentProcessing] Auto-triggering connection detection (user opt-in)`);
    await this.updateProgress(90, 'connections', 'Detecting connections');
    await this.detectConnections(documentId);
  } else {
    console.log(`[DocumentProcessing] Skipping connection detection (user opt-out)`);

    // Mark all chunks as undetected
    await this.supabase
      .from('chunks')
      .update({ connections_detected: false })
      .eq('document_id', documentId)
      .eq('is_current', true);

    console.log(`[DocumentProcessing] Marked all chunks as undetected for later processing`);
  }

  // Stage 7: Mark complete
  await this.markComplete({
    documentId,
    chunkCount: result.chunks.length,
    wordCount: result.wordCount
  });
}

// Line 432-444: detectConnections method (UNCHANGED - already handles errors gracefully)
```

#### 2. ConnectionDetectionManager - Mark Chunks Detected
**File**: `worker/lib/managers/connection-detection-manager.ts`

```typescript
// Line 41-63: Update detectConnections method
async detectConnections(options: DetectOptions): Promise<void> {
  const { documentId, chunkCount, trigger, chunkIds } = options;  // NEW: chunkIds parameter

  console.log(`[DetectConnections] Starting for document ${documentId}`);
  console.log(`[DetectConnections] Chunks: ${chunkIds ? chunkIds.length : 'ALL'} (trigger: ${trigger})`);

  await this.updateProgress(0, 'detect-connections', 'Starting connection detection');

  // Run orchestrator with optional chunk filtering
  const result = await processDocument(documentId, {
    enabledEngines: ['semantic_similarity', 'contradiction_detection', 'thematic_bridge'],
    sourceChunkIds: chunkIds,  // NEW: Pass through chunk filtering
    onProgress: (percent, stage, details) => this.updateProgress(percent, stage, details),
    ...DEFAULT_ENGINE_CONFIG
  });

  console.log(`[DetectConnections] Created ${result.totalConnections} connections`);
  console.log(`[DetectConnections] By engine:`, result.byEngine);

  // NEW: Mark chunks as detected
  if (chunkIds && chunkIds.length > 0) {
    // Specific chunks
    await this.supabase
      .from('chunks')
      .update({
        connections_detected: true,
        connections_detected_at: new Date().toISOString()
      })
      .in('id', chunkIds);

    console.log(`[DetectConnections] Marked ${chunkIds.length} chunks as detected`);
  } else {
    // All chunks in document
    await this.supabase
      .from('chunks')
      .update({
        connections_detected: true,
        connections_detected_at: new Date().toISOString()
      })
      .eq('document_id', documentId)
      .eq('is_current', true);

    console.log(`[DetectConnections] Marked all chunks in document as detected`);
  }

  await this.markComplete({
    success: true,
    totalConnections: result.totalConnections,
    byEngine: result.byEngine,
    chunksProcessed: chunkIds?.length || chunkCount
  }, `Found ${result.totalConnections} connections`)
}

// Line 20-37: Update DetectOptions interface
interface DetectOptions {
  documentId: string
  chunkCount: number
  trigger: string
  chunkIds?: string[]  // NEW: Optional chunk filtering
}
```

#### 3. Detect Connections Handler
**File**: `worker/handlers/detect-connections.ts`

```typescript
// Line 9-24: Update handler to pass chunk_ids
export async function detectConnectionsHandler(supabase: any, job: any): Promise<void> {
  const { document_id, chunk_ids, chunk_count, trigger } = job.input_data;  // NEW: chunk_ids

  const manager = new ConnectionDetectionManager(supabase, job.id);

  try {
    await manager.detectConnections({
      documentId: document_id,
      chunkCount: chunk_count,
      trigger,
      chunkIds: chunk_ids  // NEW: Pass through to manager
    });
  } catch (error: any) {
    await manager.markFailed(error);
    throw error;
  }
}
```

#### 4. Process Document Handler
**File**: `worker/handlers/process-document.ts`

```typescript
// Update handler to pass detectConnections to manager
export async function processDocumentHandler(supabase: any, job: any): Promise<void> {
  const {
    document_id,
    user_id,
    source_type,
    review_before_chunking,
    review_docling_extraction,
    detect_connections = false  // NEW: Default false (opt-in)
  } = job.input_data;

  const manager = new DocumentProcessingManager(supabase, job.id, {
    documentId: document_id,
    userId: user_id,
    sourceType: source_type,
    reviewBeforeChunking: review_before_chunking,
    reviewDoclingExtraction: review_docling_extraction,
    detectConnections: detect_connections  // NEW: Pass through
  });

  try {
    await manager.execute();
  } catch (error: any) {
    await manager.markFailed(error);
    throw error;
  }
}
```

#### 5. Job Schemas - Add Validation
**File**: `worker/types/job-schemas.ts`

```typescript
// Add to ProcessDocumentInputSchema
export const ProcessDocumentInputSchema = z.object({
  document_id: z.string().uuid(),
  user_id: z.string().uuid(),
  source_type: z.number().int(),
  review_before_chunking: z.boolean().optional(),
  review_docling_extraction: z.boolean().optional(),
  detect_connections: z.boolean().optional().default(false)  // NEW
})

// Add DetectConnectionsInputSchema
export const DetectConnectionsInputSchema = z.object({
  document_id: z.string().uuid(),
  chunk_ids: z.array(z.string().uuid()).optional(),  // NEW: Optional chunk filtering
  chunk_count: z.number().int(),
  trigger: z.string()
})

// Add DetectConnectionsOutputSchema
export const DetectConnectionsOutputSchema = z.object({
  success: z.boolean(),
  totalConnections: z.number().int(),
  byEngine: z.record(z.number().int()),
  chunksProcessed: z.number().int()
})
```

### Success Criteria

#### Automated Verification:
- [ ] Type check: `npm run type-check`
- [ ] Worker tests pass: `cd worker && npm run test`
- [ ] Schema validation tests pass

#### Manual Verification:
- [ ] Process document with `detect_connections: false` → chunks marked undetected
- [ ] Process document with `detect_connections: true` → detection job created
- [ ] Detect connections with `chunk_ids` → only those chunks marked detected
- [ ] Detect connections without `chunk_ids` → all chunks marked detected

### Service Restarts:
- [ ] Worker: Restart via `npm run dev`

---

## Phase 4: Main App - Server Actions (API Layer)

### Overview
Create server actions for per-chunk detection, batch detection, and stats retrieval.

### Changes Required

#### 1. Connection Detection Actions
**File**: `src/app/actions/documents/connections.ts` (NEW)

```typescript
'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { createBackgroundJob } from './utils'

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

  // Validate ownership
  const { data: doc } = await supabase
    .from('documents')
    .select('id, user_id, title')
    .eq('id', documentId)
    .single()

  if (!doc || doc.user_id !== user.id) {
    throw new Error('Document not found or not authorized')
  }

  const isSingle = chunkIds.length === 1
  const displayName = isSingle
    ? `Detect Connections - Chunk #${chunkIds[0].slice(-4)}`
    : `Detect Connections - ${chunkIds.length} Chunks`

  // Create background job
  const jobId = await createBackgroundJob(
    user.id,
    'detect_connections',
    documentId,
    {
      document_id: documentId,
      chunk_ids: chunkIds,
      chunk_count: chunkIds.length,
      trigger: isSingle ? 'single-chunk' : 'batch-selection'
    }
  )

  revalidatePath(`/read/${documentId}`)

  return {
    success: true,
    jobId,
    displayName
  }
}

/**
 * Detect connections for all undetected chunks in document
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
  const jobId = await createBackgroundJob(
    user.id,
    'detect_connections',
    documentId,
    {
      document_id: documentId,
      chunk_ids: chunkIds,
      chunk_count: chunkIds.length,
      trigger: 'admin-panel'
    }
  )

  revalidatePath(`/read/${documentId}`)

  return {
    success: true,
    jobId,
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
 * Get list of undetected chunk IDs (for batch selection)
 */
export async function getUndetectedChunkIds(documentId: string) {
  const supabase = await createClient()

  const { data: chunks } = await supabase
    .from('chunks')
    .select('id')
    .eq('document_id', documentId)
    .eq('connections_detected', false)
    .eq('is_current', true)
    .order('chunk_index')

  return chunks?.map(c => c.id) || []
}

/**
 * Get chunks metadata for Chunks Tab (lightweight - no full content)
 */
export async function getChunksMetadata(documentId: string) {
  const supabase = await createClient()

  const { data: chunks } = await supabase
    .from('chunks')
    .select(`
      id,
      chunk_index,
      connections_detected,
      connections_detected_at,
      heading_path,
      word_count,
      content
    `)
    .eq('document_id', documentId)
    .eq('is_current', true)
    .order('chunk_index')

  // Transform to lightweight metadata + preview
  return chunks?.map(chunk => ({
    id: chunk.id,
    chunk_index: chunk.chunk_index,
    connections_detected: chunk.connections_detected,
    connections_detected_at: chunk.connections_detected_at,
    heading_path: chunk.heading_path || [],
    word_count: chunk.word_count,
    preview: chunk.content?.slice(0, 150) + '...',
  })) || []
}

/**
 * Get full chunk content (lazy load on accordion expand)
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

#### 2. Update Upload Action
**File**: `src/app/actions/documents/upload.ts`

```typescript
// Add detectConnections parameter to upload function
export async function uploadDocument(
  file: File,
  metadata: DocumentMetadata,
  options: {
    reviewBeforeChunking?: boolean
    reviewDoclingExtraction?: boolean
    chunkerStrategy?: string
    detectConnections?: boolean  // NEW
  } = {}
) {
  // ... existing upload logic ...

  // Create processing job with detectConnections flag
  const jobId = await createBackgroundJob(
    user.id,
    'process_document',
    documentId,
    {
      document_id: documentId,
      user_id: user.id,
      source_type: metadata.source_type,
      review_before_chunking: options.reviewBeforeChunking,
      review_docling_extraction: options.reviewDoclingExtraction,
      detect_connections: options.detectConnections ?? false  // NEW: Default false
    }
  )

  // ... rest of upload logic ...
}
```

### Success Criteria

#### Automated Verification:
- [ ] Type check: `npm run type-check`
- [ ] Build succeeds: `npm run build`

#### Manual Verification:
- [ ] Call `detectChunkConnections` with single ID → job created
- [ ] Call `detectChunkConnections` with multiple IDs → batch job created
- [ ] Call `detectAllUndetectedChunks` → correct chunk count
- [ ] Call `getChunkDetectionStats` → accurate stats
- [ ] Call `getChunksMetadata` → lightweight data returned
- [ ] Call `getChunkContent` → full content + connection count

### Service Restarts:
- [ ] Next.js: Auto-reload

---

## Phase 5: Main App - State Management

### Overview
Create Zustand store for chunk selection and extend reader store for scroll coordination.

### Changes Required

#### 1. Chunk Detection Store
**File**: `src/stores/chunk-detection-store.ts` (NEW)

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
    }),
    { name: 'chunk-detection-store' }
  )
)
```

#### 2. Extend Reader Store
**File**: `src/stores/reader-store.ts`

```typescript
// Add to ReaderState interface
interface ReaderState {
  // ... existing fields

  // Scroll coordination (NEW)
  scrollSource: 'reader' | 'chunks-tab' | null
  setScrollSource: (source: 'reader' | 'chunks-tab' | null) => void
}

// Add to store implementation
export const useReaderStore = create<ReaderState>()(
  devtools(
    (set) => ({
      // ... existing state

      // NEW: Scroll coordination
      scrollSource: null,
      setScrollSource: (source) => set({ scrollSource: source }),
    }),
    { name: 'reader-store' }
  )
)
```

### Success Criteria

#### Automated Verification:
- [ ] Type check: `npm run type-check`
- [ ] Build succeeds: `npm run build`

#### Manual Verification:
- [ ] Toggle chunk selection → state updates
- [ ] Switch documents → selection clears
- [ ] Select all undetected → correct chunks selected
- [ ] Scroll source tracking works correctly

### Service Restarts:
- [ ] Next.js: Auto-reload

---

## Phase 6: Main App - Upload Flow UI

### Overview
Add "Detect connections" checkbox to DocumentPreview component.

### Changes Required

#### 1. DocumentPreview Component
**File**: `src/components/upload/DocumentPreview.tsx`

```typescript
// Add to props interface
interface DocumentPreviewProps {
  // ... existing props
  detectConnections?: boolean
  onDetectConnectionsChange?: (checked: boolean) => void
}

// In component
export function DocumentPreview({
  // ... existing props
  detectConnections = false,  // Default unchecked (opt-in)
  onDetectConnectionsChange
}: DocumentPreviewProps) {
  return (
    <div className="w-full max-w-4xl mx-auto p-6 border rounded-lg bg-card">
      {/* ... existing metadata fields ... */}

      {/* Processing Options */}
      <div className="mt-6 pt-4 border-t space-y-4">
        {/* ... existing options ... */}

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

#### 2. Wire Up Upload Flow
**File**: Find component that uses DocumentPreview (likely in upload flow)

```typescript
// Add state for detectConnections
const [detectConnections, setDetectConnections] = useState(false)

// Pass to DocumentPreview
<DocumentPreview
  // ... existing props
  detectConnections={detectConnections}
  onDetectConnectionsChange={setDetectConnections}
/>

// Pass to upload action
const result = await uploadDocument(file, metadata, {
  reviewBeforeChunking,
  reviewDoclingExtraction,
  chunkerStrategy,
  detectConnections  // NEW
})
```

### Success Criteria

#### Automated Verification:
- [ ] Type check: `npm run type-check`
- [ ] Build succeeds: `npm run build`

#### Manual Verification:
- [ ] Checkbox appears in DocumentPreview
- [ ] Tooltip shows explanation
- [ ] Time estimate appears when checked
- [ ] Upload with checked → detection job created
- [ ] Upload with unchecked → no detection job

### Service Restarts:
- [ ] Next.js: Auto-reload

---

## Phase 7: Main App - Chunks Tab UI

### Overview
Create comprehensive Chunks Tab with stats, batch selection, and virtualized chunk list.

### Changes Required

#### 1. Chunks Tab Wrapper
**File**: `src/components/sidebar/ChunksTab.tsx` (NEW)

```typescript
'use client'

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ChunkStatsOverview } from './ChunkStatsOverview'
import { AllChunksView } from './AllChunksView'
import { ChunkQualityMonitoring } from './ChunkQualityMonitoring'

interface ChunksTabProps {
  documentId: string
  currentChunkId?: string
}

export function ChunksTab({ documentId, currentChunkId }: ChunksTabProps) {
  return (
    <Tabs defaultValue="overview" className="w-full">
      <TabsList className="grid w-full grid-cols-3">
        <TabsTrigger value="overview">Overview</TabsTrigger>
        <TabsTrigger value="all-chunks">All Chunks</TabsTrigger>
        <TabsTrigger value="quality">Quality</TabsTrigger>
      </TabsList>

      <TabsContent value="overview" className="mt-4">
        <ChunkStatsOverview documentId={documentId} />
      </TabsContent>

      <TabsContent value="all-chunks" className="mt-4">
        <AllChunksView
          documentId={documentId}
          currentChunkId={currentChunkId}
        />
      </TabsContent>

      <TabsContent value="quality" className="mt-4">
        <ChunkQualityMonitoring documentId={documentId} />
      </TabsContent>
    </Tabs>
  )
}
```

#### 2. Chunk Stats Overview
**File**: `src/components/sidebar/ChunkStatsOverview.tsx` (NEW)

```typescript
'use client'

import { useQuery } from '@tanstack/react-query'
import { getChunkDetectionStats, detectAllUndetectedChunks } from '@/app/actions/documents/connections'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Sparkles, Loader2, CheckCircle2 } from 'lucide-react'
import { useState } from 'react'
import { useToast } from '@/hooks/use-toast'

export function ChunkStatsOverview({ documentId }: { documentId: string }) {
  const [isDetecting, setIsDetecting] = useState(false)
  const { toast } = useToast()

  const { data: stats, refetch } = useQuery({
    queryKey: ['chunk-detection-stats', documentId],
    queryFn: () => getChunkDetectionStats(documentId),
    refetchInterval: 5000
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
          description: `Detecting connections for ${result.chunkCount} chunks`
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

Continue with AllChunksView, ChunkAccordionItem, and BatchActionsBar in next phase...

### Success Criteria

#### Automated Verification:
- [ ] Type check: `npm run type-check`
- [ ] Build succeeds: `npm run build`

#### Manual Verification:
- [ ] Chunks Tab renders correctly
- [ ] Stats cards show accurate data
- [ ] Progress bar updates correctly
- [ ] Detect All button creates job
- [ ] All sub-tabs accessible

### Service Restarts:
- [ ] Next.js: Auto-reload

---

## Phase 8: Testing & Polish

### Overview
Comprehensive end-to-end testing, performance validation, and UI polish.

### Testing Strategy

#### Unit Tests
**Worker Engine Tests** (`worker/tests/engines/`):
```typescript
describe('Orchestrator with sourceChunkIds', () => {
  it('should process only specified chunks', async () => {
    const result = await processDocument(documentId, {
      sourceChunkIds: ['chunk-1', 'chunk-2'],
      enabledEngines: ['semantic_similarity']
    })

    expect(result.totalConnections).toBeGreaterThan(0)
  })

  it('should process all chunks when sourceChunkIds not provided', async () => {
    const result = await processDocument(documentId, {
      enabledEngines: ['semantic_similarity']
    })

    expect(result.totalConnections).toBeGreaterThan(0)
  })
})
```

#### Integration Tests
**Upload Flow**:
```typescript
test('upload with detection enabled creates detection job', async () => {
  const documentId = await uploadDocument({
    file: testPdf,
    metadata: { title: 'Test Doc' },
    detectConnections: true
  })

  await waitForJobCompletion('process_document', documentId)

  const detectionJob = await getJobByDocumentId('detect_connections', documentId)
  expect(detectionJob).toBeDefined()
})
```

#### Performance Tests
**Large Document Virtualization**:
```typescript
test('Chunks tab handles 1000+ chunks smoothly', async () => {
  const documentId = await createLargeDocument(1000)
  const { container } = render(<AllChunksView documentId={documentId} />)

  const renderedItems = container.querySelectorAll('[data-chunk-item]')
  expect(renderedItems.length).toBeLessThan(50)  // Only visible items
})
```

### Tasks
- [ ] Write unit tests for orchestrator with sourceChunkIds
- [ ] Write integration tests for upload flow
- [ ] Write performance tests for virtualization
- [ ] End-to-end workflow testing
- [ ] UI polish (loading states, errors, animations)
- [ ] Update documentation

### Success Criteria

#### Automated Verification:
- [ ] All unit tests pass: `cd worker && npm test`
- [ ] All integration tests pass
- [ ] Performance benchmarks meet targets

#### Manual Verification:
- [ ] Upload → skip → per-chunk → batch flow works
- [ ] Large documents (500+ chunks) perform well
- [ ] All edge cases handled gracefully
- [ ] Error messages are clear and helpful

### Service Restarts:
- [ ] None (testing phase)

---

## Performance Considerations

**Virtualization**: Chunks Tab uses react-virtuoso for 500+ chunks - only renders visible items

**Lazy Loading**: Chunk content loaded on accordion expand, not upfront

**Stats Caching**: Detection stats cached with 5-second refetch interval

**Batch Operations**: Selection state uses Set for O(1) add/remove

**Database Queries**: Indexes on `connections_detected` for fast filtering

## Migration Notes

**Existing Documents**: All chunks will be marked `connections_detected = false` after migration. This is intentional to allow testing detection workflows on existing documents.

**Backward Compatibility**: Not a concern (greenfield app, no legacy support needed)

**Rollback Strategy**: Drop columns if needed, restore from backup if connections lost

## References

- Architecture: `docs/ARCHITECTURE.md`
- Pipeline: `docs/PROCESSING_PIPELINE.md`
- Job System: `docs/JOB_SYSTEM.md`
- Testing: `docs/testing/TESTING_RULES.md`
- Existing Plan: `thoughts/ideas/selective-connection-detection-v2.md`
- Manager Pattern: `worker/lib/managers/`
- Admin Panel: `src/components/admin/tabs/ConnectionsTab.tsx`

---

**Total Estimated Time**: 30-40 hours

**Phases**:
1. Database & Functions: 4-6 hours
2. Orchestrator & Engines: 6-8 hours
3. Manager & Handler Updates: 4-6 hours
4. Server Actions: 3-4 hours
5. State Management: 2-3 hours
6. Upload Flow: 2-3 hours
7. Chunks Tab UI: 8-10 hours
8. Testing & Polish: 4-6 hours

---

**Implementation Note**: Pause after each phase for manual verification before proceeding to next phase.
