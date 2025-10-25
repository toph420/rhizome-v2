# Selective Connection Detection - Final Implementation Plan

**Created**: 2025-10-24
**Status**: IN PROGRESS (Phases 1-4 Complete)
**Priority**: High
**Estimated Time**: 31-43 hours (7 phases)
**Time Spent**: ~14-19 hours (Phases 1-4)
**Remaining**: ~17-24 hours (Phases 5-7)

---

## Overview

Transform connection detection from automatic all-or-nothing to flexible, user-driven progressive enhancement. Users can skip detection during upload, detect connections for individual chunks while reading, batch detect multiple chunks, or detect all undetected chunks from Admin Panel.

**Core Philosophy**: Connection detection is expensive (time + compute). Users should control when and what gets detected, especially with LOCAL mode (zero cost but slow).

**Key Benefits**:
- ✅ Upload documents instantly without waiting for detection (3-5 min → 2-3 min)
- ✅ Selective detection for interesting chunks only while reading
- ✅ Batch operations for efficient bulk detection
- ✅ Visual feedback on detection status per chunk
- ✅ Cost control for cloud mode, time control for local mode

---

## Implementation Progress

**Completed: 2025-10-24**

### ✅ Phase 1: Database Schema (COMPLETE)
- Created migration `070_chunk_connection_detection.sql`
- Added 3 tracking columns: `connections_detected`, `connections_detected_at`, `detection_skipped_reason`
- Created indexes for efficient filtering
- Created RPC functions: `get_chunk_detection_stats()`, `get_undetected_chunk_ids()`
- Updated TypeScript types in worker and frontend

### ✅ Phase 2: Worker Extensions (COMPLETE)
- Extended `ConnectionDetectionManager` with `sourceChunkIds` parameter
- Extended `DocumentProcessingManager` with `detectConnections` flag
- Updated Orchestrator to pass `sourceChunkIds` to all engines
- Updated all 3 engines (Semantic, Contradiction, Thematic) + Qwen variant
- All engines now filter source chunks when `sourceChunkIds` provided

### ✅ Phase 3: Upload Flow (COMPLETE)
- Added checkbox to `UploadZone.tsx` (unchecked by default)
- Added checkbox to `DocumentPreview.tsx` with explanation
- Threaded `detectConnections` flag through all upload paths
- Updated server action to extract and pass flag
- Updated worker handler to respect flag
- Chunks marked with `detection_skipped_reason: 'user_choice'` when unchecked

### ✅ Phase 4: Reader Integration (COMPLETE)
- Extended `ChunkMetadataIcon` to show detection status
- Added "Detect Connections" button for undetected chunks
- Created server action `detectConnectionsForChunks()`
- Updated worker handler to support per-chunk detection
- Integrated with ProcessingDock for job tracking
- Displays detection date and skip reason

### 🚧 Phase 5: Chunks Tab Batch Detection (NOT STARTED)
- Needs: ChunksTab component with virtualized list
- Needs: Checkbox selection system
- Needs: Batch detection action

### ✅ Phase 6: Admin Panel Detect All (COMPLETE)
- Created ChunkStatsOverview component with detection stats
- Added server actions: loadChunkDetectionStats(), detectAllUndetectedChunks()
- Displays detection progress, avg connections, "Detect All" button with estimates

### 🚧 Phase 7: Testing & Documentation (NOT STARTED)
- Needs: Test cases for detection tracking
- Needs: Documentation updates

---

## Current State Analysis

### How Connection Detection Works Today

**Document Upload Flow** (from research):
1. User uploads document → `process_document` job created
2. Handler calls `DocumentProcessingManager.execute()` (lines 71-122)
3. Stage 6 (line 111-112): **Always** calls `detectConnections(documentId)`
4. Manager calls orchestrator with all 3 engines hardcoded (lines 436-441)
5. Orchestrator runs engines sequentially, saves all connections
6. No way to skip detection - it's **mandatory** and **document-level only**

**Key Discoveries**:
- `worker/lib/managers/document-processing-manager.ts:434-446` - Detection always runs, no opt-out
- `worker/engines/orchestrator.ts:42-150` - Accepts `targetDocumentIds` but **NOT** `sourceChunkIds`
- `worker/engines/thematic-bridge.ts:62-76` - Only engine with chunk filtering (importance ≥0.6, max 50 chunks)
- Database: No `connections_detected` tracking on chunks table
- ChunkMetadataIcon exists: `src/components/reader/ChunkMetadataIcon.tsx` (can be extended)

**Existing Patterns to Follow**:
- Batch operations: `ChunkQualityPanel.tsx:120-147` - Uses `Promise.all()` with success/failure counting
- RPC functions: Migration 049 - Efficient aggregations without URL length issues
- Virtualized lists: `VirtualizedReader.tsx:394-429` - Virtuoso with refs for programmatic scrolling
- Server Actions: `chunks.ts:54-111` - Returns `{success, error}` objects

---

## Desired End State

### User Workflows

**Workflow 1: Skip Detection on Upload**
```
User uploads PDF (500 pages)
→ Unchecks "Detect connections after processing"
→ Processing completes in 2-3 min (vs 25 min with detection)
→ All chunks marked connections_detected: false, detection_skipped_reason: 'user_choice'
→ User can read immediately
```

**Workflow 2: Detect Single Chunk While Reading**
```
User reads document, finds interesting passage in Chunk #47
→ Hovers over left margin ChunkMetadataIcon
→ Sees "Not scanned yet" + "Detect Connections" button
→ Clicks button → detect_connections job created with chunk_ids: [chunk_47_id]
→ ProcessingDock shows progress
→ Connections appear in RightPanel after ~10-15 seconds
→ ChunkMetadataIcon updates to green checkmark + connection count
```

**Workflow 3: Batch Detect Multiple Chunks**
```
User opens RightPanel → ChunksTab → All Chunks
→ Clicks "Select Undetected (87)"
→ Reviews selected chunks in virtualized list
→ Clicks "Detect Connections" in floating action bar
→ detect_connections job created with chunk_ids: [87 IDs]
→ ProcessingDock shows "Chunk 23 of 87..."
→ All chunks marked as detected when complete
```

**Workflow 4: Detect All Undetected (Admin Panel)**
```
User opens Admin Panel (Cmd+Shift+A) → ChunksTab → Overview
→ Sees "Detection Progress: 234/500 chunks (46.8%)"
→ Clicks "Detect All Undetected Chunks (266)"
→ Confirms cost/time estimate
→ detect_connections job processes all 266 chunks
→ Detection reaches 100%
```

### Verification Criteria

**Automated Verification** (can be run by execution agents):
- [ ] Migration applies: `npx supabase db reset` ⚠️ **NOT YET RUN**
- [ ] Worker tests pass: `cd worker && npm test` (TO DO)
- [ ] Type check: `npm run type-check` (TO DO)
- [ ] Build succeeds: `npm run build` (TO DO)

**Manual Verification** (requires human testing):
- [x] Upload with detection unchecked → chunks marked as undetected ✅ **Phase 3 Complete**
- [x] ChunkMetadataIcon shows detection status correctly ✅ **Phase 4 Complete**
- [x] Single chunk detection creates job and updates status ✅ **Phase 4 Complete**
- [ ] Batch detection processes all selected chunks ⚠️ **Phase 5 Not Started**
- [ ] Admin Panel "Detect All" processes all undetected chunks ⚠️ **Phase 6 Not Started**
- [x] ProcessingDock shows progress for all detection jobs ✅ **Already exists**
- [ ] Metadata editing works in detailed mode ⚠️ **Phase 5 Not Started**

---

## Rhizome Architecture

**Module**: Both Main App (UI) and Worker (detection logic)

**Storage Strategy**:
- Database: `chunks.connections_detected` flag (queryable cache)
- Database: `connections` table (generated data)
- No Storage component (connections are auto-generated, not source of truth)

**Migration**: Yes - `070_chunk_connection_detection.sql`

**Test Tier**: Stable (fix when broken, not critical for deployment)

**Pipeline Impact**:
- Stage 6 (Connection Detection) - Now optional during upload
- No changes to Stages 1-5 (extraction, markdown, chunks, embeddings, metadata)

**Connection Engines**:
- All 3 engines: Semantic (25%), Contradiction (40%), Thematic (35%)
- New capability: Per-chunk filtering via `sourceChunkIds` parameter

**Background Jobs**:
- Existing: `process_document` (modified to accept `detect_connections: boolean`)
- Existing: `detect_connections` (modified to accept `chunk_ids: string[]`)
- All detection jobs appear in ProcessingDock + Admin Panel Jobs tab

---

## What We're NOT Doing

**Out of Scope** (to prevent scope creep):

1. ❌ **Per-Engine Detection** - No UI to run only Semantic or only Thematic
2. ❌ **Scheduled Detection** - No "detect at night" or time-based triggers
3. ❌ **Smart Detection** - No "detect high-importance chunks first" intelligence
4. ❌ **Cost Estimation UI** - No pre-detection cost calculator (future enhancement)
5. ❌ **Detection History** - No "last detected at" tracking per chunk
6. ❌ **Re-Detection** - No "mark chunk as needing re-scan" workflow
7. ❌ **Bulk Metadata Editing** - Only single-chunk editing in detailed mode
8. ❌ **AI-Assisted Metadata** - No automatic concept extraction during editing
9. ❌ **Parallel Engine Execution** - Orchestrator remains sequential (can optimize later)
10. ❌ **Materialized Views** - Use RPC functions for aggregations (simpler)

**Why These Limitations**:
- Personal tool - YAGNI (You Aren't Gonna Need It)
- Ship MVP first, add features based on actual usage
- Each additional feature adds 3-8 hours to estimate

---

## Implementation Approach

### High-Level Strategy

**Phase 1: Database Foundation**
- Add chunk-level detection tracking (boolean flag + timestamp)
- Add RPC functions for document-level aggregation (stats only)
- Migration: Fresh start, no backward compatibility needed

**Phase 2: Worker Extensions**
- Extend managers to accept chunk filtering parameters
- Update orchestrator to pass `sourceChunkIds` to engines
- Modify engines to filter source chunks when parameter provided
- Add chunk marking methods (detected/skipped)

**Phase 3: Upload Flow**
- Add checkbox (UNCHECKED by default)
- Thread `detectConnections` flag through job system
- Update handler to skip detection when flag is false

**Phase 4: Reader Integration**
- Extend `ChunkMetadataIcon` with detection status display
- Add "Detect Connections" action button
- Create server action for single-chunk detection
- Wire up to ProcessingDock for job tracking

**Phase 5: Chunks Tab (Biggest Phase)**
- Create Zustand store for chunk selection state
- Create `ChunkCard` component (compact/detailed modes)
- Create `AllChunksView` virtualized list
- Create `ChunkMetadataEditor` for metadata editing
- Server actions for lazy loading + batch detection

**Phase 6: Admin Panel Integration**
- Create `ChunkStatsOverview` component
- Add "Detect All Undetected" functionality
- Integration with existing Admin Panel structure

**Phase 7: Testing & Documentation**
- Integration tests for new workflows
- Manual testing guide
- Update documentation

### Key Technical Decisions

**Decision 1: Lazy Load Connection Counts**
- Compact mode (list): Show detection status only (green/amber badge)
- Detailed mode (expanded): Query connection count on-demand
- Rationale: Simpler than RPC, efficient (only query what user views), instant list load

**Decision 2: Chunk Marking Strategy**
- Mark as detected AFTER successful orchestrator run
- Mark as skipped BEFORE skipping detection
- Use `detection_skipped_reason` enum: 'user_choice' | 'error' | 'manual_skip'

**Decision 3: Component Extension Over Replacement**
- Extend existing `ChunkMetadataIcon` (don't create new component)
- Preserve existing metadata display
- Add detection status section conditionally

**Decision 4: Keyboard Shortcuts Only When Active**
- ChunkCard accepts `isActive` prop
- Shortcuts only work when `isActive={true}`
- Prevents conflicts with global shortcuts

---

## Phase 1: Database Schema (2-3 hours)

### Overview
Add chunk-level detection tracking with boolean flags, timestamps, and skip reasons. Create RPC functions for efficient document-level aggregation stats.

### Changes Required

#### 1. Migration File
**File**: `supabase/migrations/070_chunk_connection_detection.sql`
**Purpose**: Add detection tracking to chunks table

```sql
-- Add detection tracking columns to chunks
ALTER TABLE chunks
  ADD COLUMN connections_detected BOOLEAN DEFAULT false,
  ADD COLUMN connections_detected_at TIMESTAMPTZ,
  ADD COLUMN detection_skipped_reason TEXT; -- 'user_choice', 'error', 'manual_skip'

-- Index for efficient filtering queries
CREATE INDEX idx_chunks_detection_status
  ON chunks(document_id, connections_detected)
  WHERE connections_detected = false;

-- Index for document-level stats (used by RPC)
CREATE INDEX idx_chunks_detected_at
  ON chunks(connections_detected_at)
  WHERE connections_detected_at IS NOT NULL;

-- Migration strategy: Fresh start (no existing data to migrate)
-- New chunks will default to connections_detected = false

-- RPC function: Get detection stats for a document
CREATE OR REPLACE FUNCTION get_chunk_detection_stats(doc_id UUID)
RETURNS TABLE (
  total_chunks BIGINT,
  detected_chunks BIGINT,
  undetected_chunks BIGINT,
  detection_rate NUMERIC,
  avg_connections_per_chunk NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*)::BIGINT as total_chunks,
    COUNT(*) FILTER (WHERE connections_detected = true)::BIGINT as detected_chunks,
    COUNT(*) FILTER (WHERE connections_detected = false)::BIGINT as undetected_chunks,
    ROUND(
      COUNT(*) FILTER (WHERE connections_detected = true)::NUMERIC / NULLIF(COUNT(*)::NUMERIC, 0) * 100,
      2
    ) as detection_rate,
    COALESCE(
      (SELECT AVG(conn_count) FROM (
        SELECT COUNT(*) as conn_count
        FROM connections
        WHERE source_chunk_id IN (SELECT id FROM chunks WHERE document_id = doc_id)
        GROUP BY source_chunk_id
      ) subq),
      0
    ) as avg_connections_per_chunk
  FROM chunks
  WHERE document_id = doc_id AND is_current = true;
END;
$$ LANGUAGE plpgsql;

-- RPC function: Get undetected chunk IDs for a document
CREATE OR REPLACE FUNCTION get_undetected_chunk_ids(doc_id UUID)
RETURNS TABLE (chunk_id UUID) AS $$
BEGIN
  RETURN QUERY
  SELECT id
  FROM chunks
  WHERE document_id = doc_id
    AND is_current = true
    AND connections_detected = false
  ORDER BY chunk_index;
END;
$$ LANGUAGE plpgsql;

-- Add comment for documentation
COMMENT ON COLUMN chunks.connections_detected IS 'Whether connection detection has been run for this chunk';
COMMENT ON COLUMN chunks.connections_detected_at IS 'Timestamp when connections were detected';
COMMENT ON COLUMN chunks.detection_skipped_reason IS 'Why detection was skipped: user_choice, error, or manual_skip';
```

#### 2. TypeScript Types Update
**File**: `worker/types/database.ts`
**Purpose**: Update chunks table type definition

```typescript
// Add to Chunk interface (around line 50-100)
export interface Chunk {
  // ... existing fields ...

  // Connection detection tracking (NEW)
  connections_detected: boolean
  connections_detected_at?: string
  detection_skipped_reason?: 'user_choice' | 'error' | 'manual_skip'
}
```

**File**: `src/types/metadata.ts` (frontend types)
**Purpose**: Update frontend chunk types

```typescript
// Add to chunk type (verify location in actual file)
export interface Chunk {
  // ... existing fields ...

  // Connection detection tracking
  connections_detected: boolean
  connections_detected_at?: string
  detection_skipped_reason?: 'user_choice' | 'error' | 'manual_skip'
}
```

### Success Criteria

#### Automated Verification:
- [ ] Migration applies: `npx supabase db reset`
- [ ] No SQL errors in migration output
- [ ] Indexes created: `\d chunks` shows new indexes
- [ ] RPC functions exist: `\df get_chunk_detection_stats`
- [ ] Type check passes: `npm run type-check`

#### Manual Verification:
- [ ] Query RPC function with test document: `SELECT * FROM get_chunk_detection_stats('doc-uuid')`
- [ ] Verify indexes used: `EXPLAIN SELECT * FROM chunks WHERE document_id = 'x' AND connections_detected = false`
- [ ] Test enum constraint: Try inserting invalid `detection_skipped_reason` (should work - no constraint yet)

### Service Restarts:
- [ ] Supabase: `npx supabase db reset` (applies migration)
- [ ] Worker: Restart via `npm run dev` (picks up new types)
- [ ] Next.js: Auto-reload should handle frontend types

---

## Phase 2: Worker Manager Updates (4-5 hours)

### Overview
Extend `ConnectionDetectionManager` and `Orchestrator` to support per-chunk detection. Update all 3 engines to filter source chunks when `sourceChunkIds` provided. Add methods for marking chunks as detected/skipped.

### Changes Required

#### 2A. Extend ConnectionDetectionManager
**File**: `worker/lib/managers/connection-detection-manager.ts`
**Changes**: Add `chunkIds` parameter support and chunk marking methods

```typescript
// Update DetectOptions interface (line 19-23)
interface DetectOptions {
  documentId: string
  chunkIds?: string[]  // NEW: Optional chunk filtering
  chunkCount?: number
  trigger?: string
  markAsDetected?: boolean  // NEW: Mark chunks after detection (default: true)
}

/**
 * Execute initial connection detection for a document.
 * Now supports per-chunk filtering via chunkIds parameter.
 */
async detectConnections(options: DetectOptions): Promise<void> {
  const { documentId, chunkIds, chunkCount, trigger, markAsDetected = true } = options

  console.log(`[DetectConnections] Starting for document ${documentId}`)
  if (chunkIds) {
    console.log(`[DetectConnections] Per-chunk mode: ${chunkIds.length} chunks`)
  } else {
    console.log(`[DetectConnections] Document-level mode: all chunks`)
  }

  await this.updateProgress(0, 'detect-connections', 'Starting connection detection')

  // Run orchestrator with optional chunk filtering
  const result = await processDocument(documentId, {
    enabledEngines: ['semantic_similarity', 'contradiction_detection', 'thematic_bridge'],
    sourceChunkIds: chunkIds,  // NEW: Pass chunk filter to orchestrator
    onProgress: (percent, stage, details) => this.updateProgress(percent, stage, details),
    ...DEFAULT_ENGINE_CONFIG
  })

  console.log(`[DetectConnections] Created ${result.totalConnections} connections`)
  console.log(`[DetectConnections] By engine:`, result.byEngine)

  // Mark chunks as detected (if requested)
  if (markAsDetected) {
    const chunksToMark = chunkIds || await this.getAllChunkIds(documentId)
    await this.markChunksAsDetected(chunksToMark)
    console.log(`[DetectConnections] Marked ${chunksToMark.length} chunks as detected`)
  }

  await this.markComplete({
    success: true,
    totalConnections: result.totalConnections,
    chunksProcessed: chunkIds?.length || result.totalChunksProcessed,
    byEngine: result.byEngine
  }, `Found ${result.totalConnections} connections`)
}

/**
 * Mark chunks as having connections detected
 */
private async markChunksAsDetected(chunkIds: string[]): Promise<void> {
  const { error } = await this.supabase
    .from('chunks')
    .update({
      connections_detected: true,
      connections_detected_at: new Date().toISOString()
    })
    .in('id', chunkIds)

  if (error) {
    console.warn(`[ConnectionDetectionManager] Failed to mark chunks: ${error.message}`)
    // Non-fatal: detection succeeded even if marking failed
  }
}

/**
 * Mark chunks as skipped (user chose not to detect)
 */
async markChunksAsSkipped(
  documentId: string,
  reason: 'user_choice' | 'error' | 'manual_skip'
): Promise<void> {
  const { error } = await this.supabase
    .from('chunks')
    .update({
      connections_detected: false,
      detection_skipped_reason: reason
    })
    .eq('document_id', documentId)
    .eq('is_current', true)

  if (error) {
    throw new Error(`Failed to mark chunks as skipped: ${error.message}`)
  }

  console.log(`[ConnectionDetectionManager] Marked chunks as skipped (${reason})`)
}

/**
 * Get all chunk IDs for a document (helper)
 */
private async getAllChunkIds(documentId: string): Promise<string[]> {
  const { data } = await this.supabase
    .from('chunks')
    .select('id')
    .eq('document_id', documentId)
    .eq('is_current', true)

  return data?.map(c => c.id) || []
}
```

#### 2B. Update DocumentProcessingManager
**File**: `worker/lib/managers/document-processing-manager.ts`
**Changes**: Make connection detection optional

```typescript
// Update DocumentProcessingOptions interface (line 28-34)
interface DocumentProcessingOptions {
  documentId: string
  userId: string
  sourceType: SourceType
  reviewBeforeChunking?: boolean
  reviewDoclingExtraction?: boolean
  detectConnections?: boolean  // NEW: Default true for backward compatibility
}

// Update execute() method (around line 110-112)
async execute(): Promise<void> {
  // ... existing processing stages 1-5 ...

  // Stage 6: Optional connection detection
  if (this.options.detectConnections !== false) {
    await this.updateProgress(90, 'connections', 'Detecting connections')
    await this.detectConnections(documentId)
  } else {
    console.log('[DocumentProcessing] Skipping connection detection (user opted out)')

    // Mark chunks as skipped
    const connectionManager = new ConnectionDetectionManager(this.supabase, this.jobId)
    await connectionManager.markChunksAsSkipped(this.options.documentId, 'user_choice')
  }

  // Stage 7: Mark complete (unchanged)
  await this.markComplete({ ... })
}
```

#### 2C. Update Orchestrator
**File**: `worker/engines/orchestrator.ts`
**Changes**: Add `sourceChunkIds` parameter

```typescript
// Update OrchestratorConfig interface (line 19-27)
export interface OrchestratorConfig {
  enabledEngines?: ('semantic_similarity' | 'contradiction_detection' | 'thematic_bridge')[];
  sourceChunkIds?: string[];  // NEW: Filter connections to these source chunks only
  targetDocumentIds?: string[];
  reprocessingBatch?: string;
  semanticSimilarity?: any;
  contradictionDetection?: any;
  thematicBridge?: any;
  onProgress?: (percent: number, stage: string, details: string) => Promise<void>;
}

// Update processDocument function (line 42-98)
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
  if (sourceChunkIds) {
    console.log(`[Orchestrator] Per-chunk mode: ${sourceChunkIds.length} source chunks`)
  }
  if (targetDocumentIds && targetDocumentIds.length > 0) {
    console.log(`[Orchestrator] Filtering to ${targetDocumentIds.length} target document(s)`)
  }

  // ... existing code ...

  // Run engines in sequence
  for (const engineName of enabledEngines) {
    console.log(`\n[Orchestrator] Running ${engineName}...`)

    const engine = engineRegistry.get(engineName)
    const stage = progressStages[engineName]
    if (stage) {
      await onProgress?.(stage.start, engineName.replace('_', '-'), stage.label)
    }

    // Prepare engine-specific config (UPDATED)
    const engineConfig: any = {
      sourceChunkIds,  // NEW: Engines will filter source chunks
      targetDocumentIds,
      reprocessingBatch,
      ...DEFAULT_ENGINE_CONFIG[engineName as keyof typeof DEFAULT_ENGINE_CONFIG],
      ...config[engineName as keyof OrchestratorConfig],
    }

    // Run engine (unchanged)
    const connections = await engine.run(documentId, engineConfig, onProgress)

    // Aggregate results (unchanged)
    allConnections.push(...connections)
    byEngine[engineName] = connections.length

    console.log(`[Orchestrator] ${engineName}: Found ${connections.length} connections`)
  }

  // ... rest unchanged ...
}
```

#### 2D. Update Semantic Similarity Engine
**File**: `worker/engines/semantic-similarity.ts`
**Changes**: Add chunk filtering to query

```typescript
// Update SemanticSimilarityConfig interface (line 31-37)
export interface SemanticSimilarityConfig {
  threshold?: number;
  maxResultsPerChunk?: number;
  importanceWeight?: number;
  crossDocumentOnly?: boolean;
  sourceChunkIds?: string[];  // NEW: Filter to specific source chunks
  targetDocumentIds?: string[];
}

// Update runSemanticSimilarity function (around line 73-84)
export async function runSemanticSimilarity(
  documentId: string,
  config: SemanticSimilarityConfig
): Promise<ChunkConnection[]> {
  const { sourceChunkIds, targetDocumentIds, threshold, maxResultsPerChunk } = config

  // Build query for source chunks
  let query = supabase
    .from('chunks')
    .select('id, document_id, embedding, importance_score')
    .eq('document_id', documentId)
    .not('embedding', 'is', null);

  // NEW: Filter to specific source chunks if provided
  if (sourceChunkIds && sourceChunkIds.length > 0) {
    query = query.in('id', sourceChunkIds)
  }

  if (config.reprocessingBatch) {
    query = query.eq('reprocessing_batch', config.reprocessingBatch);
  } else {
    query = query.eq('is_current', true);
  }

  const { data: sourceChunks } = await query

  // ... rest unchanged (vector similarity logic)
}
```

#### 2E. Update Contradiction Detection Engine
**File**: `worker/engines/contradiction-detection.ts`
**Changes**: Add chunk filtering to query

```typescript
// Update ContradictionDetectionConfig interface (line 14-20)
export interface ContradictionDetectionConfig {
  minConceptOverlap?: number;
  polarityThreshold?: number;
  maxResultsPerChunk?: number;
  crossDocumentOnly?: boolean;
  sourceChunkIds?: string[];  // NEW
  targetDocumentIds?: string[];
}

// Update runContradictionDetection function (around line 54-65)
export async function runContradictionDetection(
  documentId: string,
  config: ContradictionDetectionConfig
): Promise<ChunkConnection[]> {
  const { sourceChunkIds, targetDocumentIds, minConceptOverlap, polarityThreshold, maxResultsPerChunk } = config

  // Build query for source chunks
  let sourceQuery = supabase
    .from('chunks')
    .select('id, document_id, conceptual_metadata, emotional_metadata, importance_score, content, summary')
    .eq('document_id', documentId)
    .not('conceptual_metadata', 'is', null)
    .not('emotional_metadata', 'is', null);

  // NEW: Filter to specific source chunks if provided
  if (sourceChunkIds && sourceChunkIds.length > 0) {
    sourceQuery = sourceQuery.in('id', sourceChunkIds)
  }

  if (config.reprocessingBatch) {
    sourceQuery = sourceQuery.eq('reprocessing_batch', config.reprocessingBatch);
  } else {
    sourceQuery = sourceQuery.eq('is_current', true);
  }

  const { data: sourceChunks } = await sourceQuery

  // ... rest unchanged (metadata comparison logic)
}
```

#### 2F. Update Thematic Bridge Engine
**File**: `worker/engines/thematic-bridge.ts`
**Changes**: Add chunk filtering to query

```typescript
// Update ThematicBridgeConfig interface (line 17-24)
export interface ThematicBridgeConfig {
  minImportance?: number;
  minStrength?: number;
  maxSourceChunks?: number;
  maxCandidatesPerSource?: number;
  batchSize?: number;
  sourceChunkIds?: string[];  // NEW
  targetDocumentIds?: string[];
}

// Update runThematicBridge function (around line 62-76)
export async function runThematicBridge(
  documentId: string,
  config: ThematicBridgeConfig
): Promise<ChunkConnection[]> {
  const { sourceChunkIds, targetDocumentIds, minImportance, minStrength, maxSourceChunks, maxCandidatesPerSource, batchSize } = config

  // Build query for source chunks
  let sourceQuery = supabase
    .from('chunks')
    .select(`
      id,
      document_id,
      content,
      summary,
      domain_metadata,
      importance_score
    `)
    .eq('document_id', documentId)
    .not('domain_metadata', 'is', null)

  // NEW: Filter to specific source chunks if provided
  if (sourceChunkIds && sourceChunkIds.length > 0) {
    sourceQuery = sourceQuery.in('id', sourceChunkIds)
    // Don't apply importance filter or limit when specific chunks requested
  } else {
    // Original filtering for document-level detection
    sourceQuery = sourceQuery
      .gte('importance_score', minImportance)
      .order('importance_score', { ascending: false })
      .limit(maxSourceChunks)
  }

  const { data: sourceChunks } = await sourceQuery

  // ... rest unchanged (AI-powered bridging logic)
}
```

#### 2G. Update Qwen Thematic Bridge (Local)
**File**: `worker/engines/thematic-bridge-qwen.ts`
**Changes**: Same filtering as main thematic bridge

```typescript
// Same changes as 2F above for Qwen variant
// Update config interface + query filtering
```

### Success Criteria

#### Automated Verification:
- [ ] Type check: `npm run type-check`
- [ ] Worker tests: `cd worker && npm test`
- [ ] Build: `npm run build`

#### Manual Verification:
- [ ] Test orchestrator with `sourceChunkIds`: Pass 3 chunk IDs, verify only those are processed
- [ ] Test `markChunksAsDetected`: Verify database updates after detection
- [ ] Test `markChunksAsSkipped`: Verify `detection_skipped_reason` set correctly
- [ ] Test each engine individually: Confirm chunk filtering works

### Service Restarts:
- [ ] Worker: Restart via `npm run dev` (picks up manager changes)

---

## Phase 3: Upload Flow Checkbox (2-3 hours)

### Overview
Add checkbox to document upload UI (UNCHECKED by default). Thread `detectConnections` flag through job system from UI → Server Action → Handler → Manager.

### Changes Required

#### 3A. Update Upload Component
**File**: `src/components/library/UploadZone.tsx` (or wherever upload UI lives)
**Changes**: Add checkbox and state management

**Note**: First verify the actual upload component location. It might be in:
- `src/components/library/UploadZone.tsx`
- `src/components/upload/DocumentPreview.tsx`
- `src/app/library/page.tsx`

```typescript
'use client'

import { useState } from 'react'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { AlertCircle } from 'lucide-react'

export function UploadZone() {
  const [detectConnections, setDetectConnections] = useState(false)  // UNCHECKED by default

  const handleUpload = async (file: File) => {
    // ... existing upload logic ...

    // Create processing job with detectConnections flag
    await createProcessingJob({
      documentId: document.id,
      sourceType: document.source_type,
      detectConnections  // NEW: Pass to job
    })
  }

  return (
    <div>
      {/* ... existing upload UI ... */}

      {/* Detection Checkbox */}
      <div className="flex items-start gap-3 p-4 border rounded-lg bg-muted/30 mt-4">
        <Checkbox
          id="detect-connections"
          checked={detectConnections}
          onCheckedChange={(checked) => setDetectConnections(!!checked)}
        />
        <div className="flex-1">
          <Label htmlFor="detect-connections" className="text-sm font-medium cursor-pointer">
            Detect connections after processing
          </Label>
          <p className="text-xs text-muted-foreground mt-1">
            Finds semantic similarities, contradictions, and thematic bridges between chunks.
            You can detect connections later for individual chunks or all at once.
          </p>
          {process.env.NEXT_PUBLIC_PROCESSING_MODE === 'local' && (
            <p className="text-xs text-amber-600 mt-1 flex items-center gap-1">
              <AlertCircle className="h-3 w-3" />
              LOCAL mode: Connection detection adds 10-30 seconds per document
            </p>
          )}
        </div>
      </div>

      {/* Upload Button */}
      <Button onClick={handleUpload}>
        Start Processing
      </Button>
    </div>
  )
}
```

#### 3B. Update Server Action
**File**: `src/app/actions/documents.ts` (or appropriate actions file)
**Changes**: Accept and pass `detectConnections` flag

```typescript
'use server'

import { createClient } from '@/lib/supabase/server'
import { getCurrentUser } from '@/lib/auth'
import { revalidatePath } from 'next/cache'

export async function createProcessingJob(params: {
  documentId: string
  sourceType: string
  detectConnections?: boolean  // NEW
}) {
  const supabase = await createClient()
  const user = await getCurrentUser()

  if (!user) {
    throw new Error('Not authenticated')
  }

  const { data: job } = await supabase
    .from('background_jobs')
    .insert({
      job_type: 'process_document',
      input_data: {
        document_id: params.documentId,
        source_type: params.sourceType,
        detect_connections: params.detectConnections ?? false  // NEW: Default false
      },
      entity_id: params.documentId,
      user_id: user.id,
      status: 'pending'
    })
    .select()
    .single()

  revalidatePath('/library')

  return { success: true, jobId: job.id }
}
```

#### 3C. Update Handler
**File**: `worker/handlers/process-document.ts`
**Changes**: Extract flag and pass to manager

```typescript
// Update handler (line 31-61)
export async function processDocumentHandler(supabase: any, job: any): Promise<void> {
  const {
    document_id,
    source_type = 'pdf',
    review_before_chunking,
    review_docling_extraction,
    detect_connections = false  // NEW: Default false for backward compatibility
  } = job.input_data

  // Get document metadata
  const { data: doc, error: docError } = await supabase
    .from('documents')
    .select('user_id')
    .eq('id', document_id)
    .single()

  if (docError || !doc) {
    throw new Error(`Document not found: ${document_id}`)
  }

  // Create manager with all parameters
  const manager = new DocumentProcessingManager(supabase, job.id, {
    documentId: document_id,
    userId: doc.user_id,
    sourceType: source_type as SourceType,
    reviewBeforeChunking: review_before_chunking,
    reviewDoclingExtraction: review_docling_extraction,
    detectConnections: detect_connections  // NEW
  })

  // Execute complete workflow
  try {
    await manager.execute()
  } catch (error: any) {
    await manager.markFailed(error)
    throw error
  }
}
```

### Success Criteria

#### Automated Verification:
- [ ] Type check: `npm run type-check`
- [ ] Build: `npm run build`

#### Manual Verification:
- [ ] Upload document with checkbox UNCHECKED → chunks marked as `connections_detected: false`
- [ ] Upload document with checkbox CHECKED → connections detected normally
- [ ] Verify `detection_skipped_reason: 'user_choice'` set when unchecked
- [ ] ProcessingDock shows "Skipping connection detection" message when unchecked
- [ ] Job completes faster when detection skipped (~2-3 min vs 15-25 min)

### Service Restarts:
- [ ] Worker: Restart via `npm run dev`
- [ ] Next.js: Should auto-reload for frontend changes

---

## Phase 4: Reader Per-Chunk Detection (6-8 hours)

### Overview
Extend existing `ChunkMetadataIcon` component to show detection status and provide "Detect Connections" action button. Create server action for single-chunk detection that appears in ProcessingDock.

### Changes Required

#### 4A. Extend ChunkMetadataIcon Component
**File**: `src/components/reader/ChunkMetadataIcon.tsx`
**Changes**: Add detection status section with action button

```typescript
'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/rhizome/hover-card'
import { Badge } from '@/components/rhizome/badge'
import { Button } from '@/components/ui/button'
import { Info, TrendingUp, CheckCircle, AlertTriangle, AlertCircle, Sparkles, Loader2 } from 'lucide-react'
import { detectSingleChunkConnections } from '@/app/actions/connections'
import { toast } from 'sonner'
import type { Chunk } from '@/types/annotations'

interface ChunkMetadataIconProps {
  chunk: Chunk
  chunkIndex: number
  alwaysVisible?: boolean
  style?: React.CSSProperties
  textOffset?: number
}

export function ChunkMetadataIcon({ chunk, chunkIndex, alwaysVisible = false, style, textOffset }: ChunkMetadataIconProps) {
  const [isDetecting, setIsDetecting] = useState(false)

  // Handler for "Detect Connections" button
  const handleDetectConnections = async () => {
    setIsDetecting(true)
    try {
      const result = await detectSingleChunkConnections(chunk.id)
      if (result.success) {
        toast.success('Connection detection started', {
          description: 'Check ProcessingDock for progress'
        })
      } else {
        toast.error('Failed to start detection', {
          description: result.error || 'Unknown error'
        })
      }
    } catch (error) {
      console.error('[ChunkMetadataIcon] Detection failed:', error)
      toast.error('Failed to start detection')
    } finally {
      setIsDetecting(false)
    }
  }

  // ... existing helper functions (getPolarity, getConfidenceColor) ...

  // Extract metadata (existing code)
  const metadata = {
    themes: chunk.themes || [],
    importanceScore: chunk.importance_score || 0,
    concepts: chunk.conceptual_metadata?.concepts?.slice(0, 5).map(c => c.text) || [],
    emotionalPolarity: getPolarity(chunk.emotional_metadata?.polarity),
    domain: chunk.domain_metadata?.primaryDomain,
    summary: chunk.summary,
    positionConfidence: chunk.position_confidence,
    positionMethod: chunk.position_method,
    positionValidated: chunk.position_validated,
    pageStart: chunk.page_start,
    pageEnd: chunk.page_end,
    sectionMarker: chunk.section_marker,

    // NEW: Detection status
    connectionsDetected: chunk.connections_detected,
    connectionsDetectedAt: chunk.connections_detected_at,
    detectionSkippedReason: chunk.detection_skipped_reason
  }

  const defaultStyle = { top: '0.375em', ...style }

  return (
    <HoverCard openDelay={200}>
      <HoverCardTrigger asChild>
        <motion.button
          className={`absolute left-0 -ml-12 w-6 h-6 rounded-full bg-muted/50 hover:bg-primary/20 transition-colors flex items-center justify-center ${
            alwaysVisible ? 'opacity-70 hover:opacity-100' : 'opacity-0 group-hover:opacity-100'
          }`}
          style={defaultStyle}
          whileHover={{ scale: 1.2 }}
          whileTap={{ scale: 0.95 }}
          transition={{ type: 'spring', stiffness: 400, damping: 25 }}
        >
          <Info className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
        </motion.button>
      </HoverCardTrigger>

      <HoverCardContent side="left" className="w-80">
        <div className="space-y-3">
          {/* Chunk Index & ID (existing) */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Badge variant="outline" className="font-mono text-xs">
                Chunk {chunkIndex}
              </Badge>
              {metadata.importanceScore > 0 && (
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <TrendingUp className="h-3 w-3" />
                  <span>Importance: {Math.round(metadata.importanceScore * 100)}%</span>
                </div>
              )}
            </div>
            <div className="text-xs">
              <span className="text-muted-foreground">ID:</span>{' '}
              <code className="bg-muted px-1.5 py-0.5 rounded font-mono">
                /chunk_{chunk.id.replace('chunk_', '')}
              </code>
            </div>
          </div>

          {/* NEW: Connection Detection Status */}
          <div className="border-t pt-2">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium">Connection Detection</span>
              {metadata.connectionsDetected ? (
                <Badge variant="secondary" className="text-xs gap-1">
                  <CheckCircle className="h-3 w-3" />
                  Detected
                </Badge>
              ) : (
                <Badge variant="outline" className="text-xs gap-1 text-amber-600">
                  <AlertCircle className="h-3 w-3" />
                  Not scanned
                </Badge>
              )}
            </div>

            {/* Detection timestamp (if detected) */}
            {metadata.connectionsDetectedAt && (
              <p className="text-xs text-muted-foreground mb-2">
                Detected: {new Date(metadata.connectionsDetectedAt).toLocaleDateString()}
              </p>
            )}

            {/* Skipped reason (if skipped) */}
            {metadata.detectionSkippedReason && (
              <p className="text-xs text-muted-foreground mb-2">
                Skipped: {metadata.detectionSkippedReason.replace('_', ' ')}
              </p>
            )}

            {/* Action button (if not detected) */}
            {!metadata.connectionsDetected && (
              <Button
                size="sm"
                variant="secondary"
                className="w-full text-xs"
                onClick={handleDetectConnections}
                disabled={isDetecting}
              >
                {isDetecting ? (
                  <>
                    <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                    Detecting...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-3 w-3 mr-1" />
                    Detect Connections
                  </>
                )}
              </Button>
            )}
          </div>

          {/* ... rest of existing metadata sections (Position Confidence, Themes, etc.) ... */}

        </div>
      </HoverCardContent>
    </HoverCard>
  )
}
```

#### 4B. Create Server Action for Single-Chunk Detection
**File**: `src/app/actions/connections.ts` (NEW FILE or add to existing)
**Changes**: Create action for single-chunk detection

```typescript
'use server'

import { createClient } from '@/lib/supabase/server'
import { getCurrentUser } from '@/lib/auth'
import { revalidatePath } from 'next/cache'

/**
 * Detect connections for a single chunk.
 * Creates a detect_connections job with chunk_ids parameter.
 */
export async function detectSingleChunkConnections(chunkId: string) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return { success: false, error: 'Not authenticated' }
    }

    const supabase = await createClient()

    // Get chunk's document
    const { data: chunk, error: chunkError } = await supabase
      .from('chunks')
      .select('document_id')
      .eq('id', chunkId)
      .single()

    if (chunkError || !chunk) {
      return { success: false, error: 'Chunk not found' }
    }

    // Create detect-connections job
    const { data: job, error: jobError } = await supabase
      .from('background_jobs')
      .insert({
        job_type: 'detect_connections',
        input_data: {
          document_id: chunk.document_id,
          chunk_ids: [chunkId],  // Single-chunk mode
          trigger: 'user_reader'
        },
        entity_id: chunk.document_id,
        user_id: user.id,
        status: 'pending'
      })
      .select()
      .single()

    if (jobError) {
      return { success: false, error: `Failed to create job: ${jobError.message}` }
    }

    revalidatePath(`/read/${chunk.document_id}`)

    return { success: true, jobId: job.id }
  } catch (error) {
    console.error('[detectSingleChunkConnections] Error:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}
```

#### 4C. Update Handler to Accept chunk_ids
**File**: `worker/handlers/detect-connections.ts`
**Changes**: Extract and pass `chunk_ids` to manager

```typescript
export async function detectConnectionsHandler(supabase: any, job: any): Promise<void> {
  const {
    document_id,
    chunk_ids,  // NEW: Optional chunk filtering
    chunk_count,
    trigger
  } = job.input_data

  const manager = new ConnectionDetectionManager(supabase, job.id)

  try {
    await manager.detectConnections({
      documentId: document_id,
      chunkIds: chunk_ids,  // NEW: Pass to manager
      chunkCount: chunk_count,
      trigger
    })
  } catch (error: any) {
    await manager.markFailed(error)
    throw error
  }
}
```

### Success Criteria

#### Automated Verification:
- [ ] Type check: `npm run type-check`
- [ ] Build: `npm run build`

#### Manual Verification:
- [ ] ChunkMetadataIcon shows "Not scanned" badge for undetected chunks
- [ ] ChunkMetadataIcon shows "Detected" badge for detected chunks
- [ ] "Detect Connections" button appears only for undetected chunks
- [ ] Clicking button creates job and shows toast notification
- [ ] ProcessingDock shows job progress (should appear immediately)
- [ ] Chunk updates to "Detected" status after job completes
- [ ] Connections appear in RightPanel after detection

### Service Restarts:
- [ ] Worker: Restart via `npm run dev`
- [ ] Next.js: Should auto-reload

---

## Phase 5: Chunks Tab Batch Detection (10-12 hours)

### Overview
Create comprehensive chunks management tab with virtualized list, selection state, lazy loading, and metadata editing. This is the largest phase with the most UI components.

### Changes Required

#### 5A. Create Chunk Zustand Store
**File**: `src/stores/chunk-store.ts` (NEW FILE)
**Purpose**: Manage chunk selection and detailed chunk data with lazy loading

```typescript
import { create } from 'zustand'
import { loadChunkDetails, updateChunkMetadata } from '@/app/actions/chunks'
import { toast } from 'sonner'

// Lightweight chunk for list display
interface ChunkListItem {
  id: string
  chunk_index: number
  preview: string
  connections_detected: boolean
  connection_count?: number
}

// Full chunk details for editing (lazy loaded)
interface ChunkDetailed {
  id: string
  content: string
  heading_path: string[]
  page_start?: number
  page_end?: number
  word_count: number
  token_count: number
  themes?: string[]
  importance_score?: number
  summary?: string

  // Metadata (JSONB fields)
  emotional_metadata?: Record<string, any>
  conceptual_metadata?: Record<string, any>
  domain_metadata?: Record<string, any>

  // Detection info
  connections_detected: boolean
  connections_detected_at?: string
  connection_count: number

  // Quality info
  position_confidence?: string
  metadata_confidence?: string
  chunker_type: string
}

interface ChunkMetadata {
  title?: string
  domain_metadata?: {
    primaryDomain?: string
    subDomains?: string[]
    confidence?: 'high' | 'medium' | 'low'
  }
  emotional_metadata?: {
    primaryEmotion?: string
    polarity?: number
    intensity?: number
  }
  conceptual_metadata?: {
    concepts?: Array<{ text: string; confidence: number }>
  }
  themes?: string[]
  importance_score?: number
}

interface ChunkStore {
  // Selection for batch operations
  selectedChunks: Set<string>
  toggleSelection: (chunkId: string) => void
  selectMultiple: (chunkIds: string[]) => void
  clearSelection: () => void

  // Detection status (synced with DB via parent component)
  detectionStatus: Map<string, boolean>
  markAsDetected: (chunkId: string) => void

  // Detailed chunk data (lazy loaded on demand)
  detailedChunks: Map<string, ChunkDetailed>
  loadingDetailed: Set<string>
  loadDetailedChunk: (chunkId: string) => Promise<void>

  // Metadata editing with optimistic updates
  updateChunkMetadata: (
    chunkId: string,
    metadata: Partial<ChunkMetadata>
  ) => Promise<void>
}

export const useChunkStore = create<ChunkStore>((set, get) => ({
  selectedChunks: new Set(),
  detectionStatus: new Map(),
  detailedChunks: new Map(),
  loadingDetailed: new Set(),

  toggleSelection: (chunkId) => set((state) => {
    const next = new Set(state.selectedChunks)
    if (next.has(chunkId)) {
      next.delete(chunkId)
    } else {
      next.add(chunkId)
    }
    return { selectedChunks: next }
  }),

  selectMultiple: (chunkIds) => set({
    selectedChunks: new Set(chunkIds)
  }),

  clearSelection: () => set({ selectedChunks: new Set() }),

  markAsDetected: (chunkId) => set((state) => {
    const next = new Map(state.detectionStatus)
    next.set(chunkId, true)
    return { detectionStatus: next }
  }),

  loadDetailedChunk: async (chunkId) => {
    const state = get()

    // Skip if already loaded or loading
    if (state.detailedChunks.has(chunkId) || state.loadingDetailed.has(chunkId)) {
      return
    }

    // Mark as loading
    set((state) => ({
      loadingDetailed: new Set(state.loadingDetailed).add(chunkId)
    }))

    try {
      const details = await loadChunkDetails(chunkId)

      set((state) => {
        const nextDetailed = new Map(state.detailedChunks)
        nextDetailed.set(chunkId, details)

        const nextLoading = new Set(state.loadingDetailed)
        nextLoading.delete(chunkId)

        return {
          detailedChunks: nextDetailed,
          loadingDetailed: nextLoading
        }
      })
    } catch (error) {
      console.error('[ChunkStore] Failed to load details:', error)
      toast.error('Failed to load chunk details')

      set((state) => {
        const nextLoading = new Set(state.loadingDetailed)
        nextLoading.delete(chunkId)
        return { loadingDetailed: nextLoading }
      })
    }
  },

  updateChunkMetadata: async (chunkId, metadata) => {
    // Optimistic update
    set((state) => {
      const chunk = state.detailedChunks.get(chunkId)
      if (!chunk) return state

      const nextDetailed = new Map(state.detailedChunks)
      nextDetailed.set(chunkId, {
        ...chunk,
        domain_metadata: metadata.domain_metadata || chunk.domain_metadata,
        emotional_metadata: metadata.emotional_metadata || chunk.emotional_metadata,
        conceptual_metadata: metadata.conceptual_metadata || chunk.conceptual_metadata,
        themes: metadata.themes || chunk.themes,
        importance_score: metadata.importance_score ?? chunk.importance_score
      })

      return { detailedChunks: nextDetailed }
    })

    try {
      await updateChunkMetadata(chunkId, metadata)
      toast.success('Metadata updated')
    } catch (error) {
      console.error('[ChunkStore] Failed to update metadata:', error)
      toast.error('Failed to save metadata')
      // TODO: Revert optimistic update on error
    }
  }
}))
```

#### 5B. Create Server Actions for Chunks
**File**: `src/app/actions/chunks.ts` (extend existing or create new)
**Purpose**: Server actions for chunk loading and metadata updates

```typescript
'use server'

import { createClient } from '@/lib/supabase/server'
import { getCurrentUser } from '@/lib/auth'
import { revalidatePath } from 'next/cache'

/**
 * Load lightweight chunk metadata for list display.
 * Includes detection status and connection count.
 */
export async function loadChunkMetadata(documentId: string) {
  const supabase = await createClient()
  const user = await getCurrentUser()

  if (!user) {
    throw new Error('Not authenticated')
  }

  const { data: chunks, error } = await supabase
    .from('chunks')
    .select(`
      id,
      chunk_index,
      connections_detected,
      heading_path,
      word_count,
      content
    `)
    .eq('document_id', documentId)
    .eq('is_current', true)
    .order('chunk_index')

  if (error) throw error

  // Count connections for each chunk (lazy load approach - only when needed)
  // For now, return without counts (will query in detailed mode)
  return chunks.map(chunk => ({
    id: chunk.id,
    chunk_index: chunk.chunk_index,
    connections_detected: chunk.connections_detected,
    preview: chunk.content.slice(0, 150) + '...',
    connection_count: 0  // Placeholder - will load in detailed mode
  }))
}

/**
 * Load full chunk details for editing (lazy loaded on demand).
 * Includes connection count query.
 */
export async function loadChunkDetails(chunkId: string) {
  const supabase = await createClient()
  const user = await getCurrentUser()

  if (!user) {
    throw new Error('Not authenticated')
  }

  const { data: chunk, error } = await supabase
    .from('chunks')
    .select(`
      id,
      content,
      heading_path,
      page_start,
      page_end,
      word_count,
      token_count,
      themes,
      importance_score,
      summary,

      emotional_metadata,
      conceptual_metadata,
      domain_metadata,

      connections_detected,
      connections_detected_at,

      position_confidence,
      metadata_confidence,
      chunker_type
    `)
    .eq('id', chunkId)
    .single()

  if (error) throw error

  // Count connections (only when loading detailed view)
  const { count: connectionCount } = await supabase
    .from('connections')
    .select('id', { count: 'exact', head: true })
    .eq('source_chunk_id', chunkId)

  return {
    ...chunk,
    connection_count: connectionCount || 0
  }
}

/**
 * Update chunk metadata (JSONB fields and scalar fields).
 * Used by metadata editor in detailed mode.
 */
export async function updateChunkMetadata(
  chunkId: string,
  metadata: {
    title?: string
    domain_metadata?: Record<string, any>
    emotional_metadata?: Record<string, any>
    conceptual_metadata?: Record<string, any>
    themes?: string[]
    importance_score?: number
  }
) {
  const supabase = await createClient()
  const user = await getCurrentUser()

  if (!user) {
    throw new Error('Not authenticated')
  }

  // Build update object for JSONB fields
  const updates: Record<string, any> = {}

  if (metadata.domain_metadata !== undefined) {
    updates.domain_metadata = metadata.domain_metadata
  }
  if (metadata.emotional_metadata !== undefined) {
    updates.emotional_metadata = metadata.emotional_metadata
  }
  if (metadata.conceptual_metadata !== undefined) {
    updates.conceptual_metadata = metadata.conceptual_metadata
  }
  if (metadata.themes !== undefined) {
    updates.themes = metadata.themes
  }
  if (metadata.importance_score !== undefined) {
    updates.importance_score = metadata.importance_score
  }

  const { error } = await supabase
    .from('chunks')
    .update(updates)
    .eq('id', chunkId)

  if (error) throw error

  // Revalidate reader page to show updated metadata
  const { data: chunk } = await supabase
    .from('chunks')
    .select('document_id')
    .eq('id', chunkId)
    .single()

  if (chunk) {
    revalidatePath(`/read/${chunk.document_id}`)
  }

  return { success: true }
}

/**
 * Detect connections for multiple chunks (batch operation).
 */
export async function detectBatchChunkConnections(
  documentId: string,
  chunkIds: string[]
) {
  const user = await getCurrentUser()
  if (!user) {
    throw new Error('Not authenticated')
  }

  const supabase = await createClient()

  // Create batch detection job
  const { data: job, error } = await supabase
    .from('background_jobs')
    .insert({
      job_type: 'detect_connections',
      input_data: {
        document_id: documentId,
        chunk_ids: chunkIds,  // Batch mode
        trigger: 'user_batch'
      },
      entity_id: documentId,
      user_id: user.id,
      status: 'pending'
    })
    .select()
    .single()

  if (error) throw error

  revalidatePath(`/read/${documentId}`)

  return { success: true, jobId: job.id, chunkCount: chunkIds.length }
}
```

#### 5C. Create ChunkCard Component
**File**: `src/components/rhizome/chunk-card.tsx` (NEW FILE)
**Purpose**: Self-contained chunk card with compact/detailed modes

```typescript
'use client'

import { useState, useEffect } from 'react'
import { Card } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/rhizome/badge'
import { CheckCircle2, AlertCircle, Loader2, Sparkles } from 'lucide-react'
import { useChunkStore } from '@/stores/chunk-store'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

interface ChunkCardProps {
  // Always required (lightweight)
  chunkId: string
  chunkIndex: number
  preview: string
  connectionsDetected: boolean
  connectionCount?: number

  // Mode determines feature set
  mode: 'compact' | 'detailed'

  // Optional features (opt-in)
  showSelection?: boolean
  showActions?: boolean
  isActive?: boolean

  // Callbacks
  onNavigate?: () => void
  onDetect?: () => void
}

export function ChunkCard({
  chunkId,
  chunkIndex,
  preview,
  connectionsDetected,
  connectionCount = 0,
  mode,
  showSelection = false,
  showActions = false,
  isActive = false,
  onNavigate,
  onDetect
}: ChunkCardProps) {
  const isSelected = useChunkStore(state => state.selectedChunks.has(chunkId))
  const toggleSelection = useChunkStore(state => state.toggleSelection)
  const detailedChunk = useChunkStore(state => state.detailedChunks.get(chunkId))
  const loadDetailedChunk = useChunkStore(state => state.loadDetailedChunk)
  const isLoading = useChunkStore(state => state.loadingDetailed.has(chunkId))

  const [isDetecting, setIsDetecting] = useState(false)

  // Lazy load when switching to detailed mode
  useEffect(() => {
    if (mode === 'detailed' && !detailedChunk && !isLoading) {
      loadDetailedChunk(chunkId)
    }
  }, [mode, chunkId, detailedChunk, isLoading, loadDetailedChunk])

  // Keyboard shortcuts when active
  useEffect(() => {
    if (!isActive) return

    const handleKeyPress = (e: KeyboardEvent) => {
      // Ignore if typing in input/textarea
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return
      }

      switch(e.key.toLowerCase()) {
        case 'd':
          if (!connectionsDetected && !e.metaKey && !e.ctrlKey) {
            e.preventDefault()
            handleDetect()
          }
          break
        case 'j':
          e.preventDefault()
          onNavigate?.()
          break
        case ' ':
          if (showSelection) {
            e.preventDefault()
            toggleSelection(chunkId)
          }
          break
      }
    }

    window.addEventListener('keydown', handleKeyPress)
    return () => window.removeEventListener('keydown', handleKeyPress)
  }, [isActive, connectionsDetected, chunkId, showSelection, toggleSelection, onNavigate])

  const handleDetect = async () => {
    setIsDetecting(true)
    try {
      await onDetect?.()
      toast.success('Connection detection started')
    } catch (error) {
      toast.error('Failed to start detection')
    } finally {
      setIsDetecting(false)
    }
  }

  if (mode === 'compact') {
    return (
      <Card
        className={cn(
          "p-3 border-b hover:bg-accent/30 cursor-pointer transition-all",
          isSelected && "bg-accent/50 border-l-4 border-l-primary",
          isActive && "border-primary"
        )}
        onClick={() => showSelection && toggleSelection(chunkId)}
      >
        <div className="flex items-start gap-3">
          {showSelection && (
            <Checkbox
              checked={isSelected}
              onCheckedChange={() => toggleSelection(chunkId)}
              onClick={(e) => e.stopPropagation()}
            />
          )}

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <Badge variant="outline" className="text-xs">
                #{chunkIndex}
              </Badge>

              {connectionsDetected ? (
                <Badge variant="secondary" className="text-xs gap-1">
                  <CheckCircle2 className="h-3 w-3" />
                  {connectionCount > 0 ? `${connectionCount} connections` : 'Detected'}
                </Badge>
              ) : (
                <Badge variant="outline" className="text-xs gap-1 text-amber-600">
                  <AlertCircle className="h-3 w-3" />
                  Not scanned
                </Badge>
              )}
            </div>

            <p className="text-sm line-clamp-2">{preview}</p>
          </div>

          {showActions && !connectionsDetected && (
            <Button
              variant="default"
              size="sm"
              onClick={(e) => {
                e.stopPropagation()
                handleDetect()
              }}
              disabled={isDetecting}
            >
              {isDetecting ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Sparkles className="h-3 w-3" />
              )}
            </Button>
          )}
        </div>

        {isActive && (
          <div className="mt-2 pt-2 border-t text-xs text-muted-foreground">
            {showSelection && <><kbd className="px-1 bg-muted rounded">Space</kbd> select · </>}
            {!connectionsDetected && <><kbd className="px-1 bg-muted rounded">d</kbd> detect · </>}
            <kbd className="px-1 bg-muted rounded">j</kbd> jump
          </div>
        )}
      </Card>
    )
  }

  // Detailed mode with full metadata and editing
  return (
    <Card className="p-4">
      {isLoading || !detailedChunk ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : (
        <div className="space-y-4">
          {/* Full content, metadata display, edit controls */}
          <div className="text-sm font-medium">Chunk #{chunkIndex}</div>
          <div className="text-xs text-muted-foreground">
            {detailedChunk.word_count} words · {detailedChunk.token_count} tokens
          </div>

          {/* Metadata editor component would go here */}
          {/* For now, just show detection status */}
          <div>
            {connectionsDetected ? (
              <Badge variant="secondary">
                <CheckCircle2 className="h-3 w-3 mr-1" />
                {detailedChunk.connection_count} connections found
              </Badge>
            ) : (
              <Button onClick={handleDetect} disabled={isDetecting}>
                {isDetecting ? 'Detecting...' : 'Detect Connections'}
              </Button>
            )}
          </div>
        </div>
      )}
    </Card>
  )
}
```

#### 5D. Create AllChunksView Component
**File**: `src/components/sidebar/AllChunksView.tsx` (NEW FILE)
**Purpose**: Virtualized list with selection and batch operations

```typescript
'use client'

import { useState, useEffect } from 'react'
import { Virtuoso } from 'react-virtuoso'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/rhizome/badge'
import { Sparkles, Loader2 } from 'lucide-react'
import { ChunkCard } from '@/components/rhizome/chunk-card'
import { useChunkStore } from '@/stores/chunk-store'
import { loadChunkMetadata, detectBatchChunkConnections } from '@/app/actions/chunks'
import { detectSingleChunkConnections } from '@/app/actions/connections'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'

interface ChunkMetadata {
  id: string
  chunk_index: number
  preview: string
  connections_detected: boolean
  connection_count: number
}

export function AllChunksView({ documentId }: { documentId: string }) {
  const router = useRouter()
  const selectedChunks = useChunkStore(state => state.selectedChunks)
  const selectMultiple = useChunkStore(state => state.selectMultiple)
  const clearSelection = useChunkStore(state => state.clearSelection)

  const [chunks, setChunks] = useState<ChunkMetadata[]>([])
  const [loading, setLoading] = useState(true)
  const [isBatchDetecting, setIsBatchDetecting] = useState(false)

  // Load chunk metadata on mount
  useEffect(() => {
    loadChunkMetadata(documentId)
      .then(setChunks)
      .catch(err => {
        console.error('[AllChunksView] Failed to load chunks:', err)
        toast.error('Failed to load chunks')
      })
      .finally(() => setLoading(false))
  }, [documentId])

  const selectUndetected = () => {
    const undetected = chunks
      .filter(c => !c.connections_detected)
      .map(c => c.id)
    selectMultiple(undetected)
    toast.info(`Selected ${undetected.length} undetected chunks`)
  }

  const handleBatchDetect = async () => {
    const chunkIds = Array.from(selectedChunks)
    if (chunkIds.length === 0) return

    setIsBatchDetecting(true)
    try {
      await detectBatchChunkConnections(documentId, chunkIds)
      clearSelection()
      toast.success(`Started detection for ${chunkIds.length} chunks`, {
        description: 'Check ProcessingDock for progress'
      })
    } catch (error) {
      console.error('[AllChunksView] Batch detection failed:', error)
      toast.error('Failed to start batch detection')
    } finally {
      setIsBatchDetecting(false)
    }
  }

  const handleNavigateToChunk = (chunkId: string) => {
    // Navigate to reader and scroll to chunk
    router.push(`/read/${documentId}?chunk=${chunkId}`)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col">
      {/* Toolbar */}
      <div className="p-3 border-b flex items-center gap-2">
        <Button size="sm" variant="outline" onClick={selectUndetected}>
          Select Undetected ({chunks.filter(c => !c.connections_detected).length})
        </Button>
        <div className="flex-1" />
        <span className="text-xs text-muted-foreground">
          {selectedChunks.size} selected
        </span>
      </div>

      {/* Virtualized List */}
      <Virtuoso
        data={chunks}
        itemContent={(index, chunk) => (
          <ChunkCard
            key={chunk.id}
            mode="compact"
            chunkId={chunk.id}
            chunkIndex={chunk.chunk_index}
            preview={chunk.preview}
            connectionsDetected={chunk.connections_detected}
            connectionCount={chunk.connection_count}
            showSelection={true}
            showActions={true}
            onDetect={() => detectSingleChunkConnections(chunk.id)}
            onNavigate={() => handleNavigateToChunk(chunk.id)}
          />
        )}
        style={{ height: '100%' }}
      />

      {/* Floating Action Bar */}
      {selectedChunks.size > 0 && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 p-3 bg-primary text-primary-foreground rounded-lg shadow-lg flex items-center gap-3">
          <span className="text-sm font-medium">
            {selectedChunks.size} chunks selected
          </span>
          <Button
            size="sm"
            variant="secondary"
            onClick={handleBatchDetect}
            disabled={isBatchDetecting}
          >
            {isBatchDetecting ? (
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
          <Button size="sm" variant="ghost" onClick={clearSelection}>
            Cancel
          </Button>
        </div>
      )}
    </div>
  )
}
```

#### 5E. Create ChunksTab Container
**File**: `src/components/sidebar/ChunksTab.tsx` (NEW FILE or modify existing)
**Purpose**: Tab container with 3 sub-tabs

```typescript
'use client'

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { AllChunksView } from './AllChunksView'
import { ChunkStatsOverview } from './ChunkStatsOverview'  // Phase 6
import { ChunkQualityPanel } from './ChunkQualityPanel'  // Existing component

export function ChunksTab({ documentId }: { documentId: string }) {
  return (
    <Tabs defaultValue="overview" className="h-full flex flex-col">
      <TabsList className="shrink-0">
        <TabsTrigger value="overview">Overview</TabsTrigger>
        <TabsTrigger value="all-chunks">All Chunks</TabsTrigger>
        <TabsTrigger value="quality">Quality</TabsTrigger>
      </TabsList>

      <TabsContent value="overview" className="flex-1 overflow-auto">
        <ChunkStatsOverview documentId={documentId} />
      </TabsContent>

      <TabsContent value="all-chunks" className="flex-1 overflow-hidden">
        <AllChunksView documentId={documentId} />
      </TabsContent>

      <TabsContent value="quality" className="flex-1 overflow-auto">
        <ChunkQualityPanel documentId={documentId} />
      </TabsContent>
    </Tabs>
  )
}
```

### Success Criteria

#### Automated Verification:
- [ ] Type check: `npm run type-check`
- [ ] Build: `npm run build`

#### Manual Verification:
- [ ] AllChunksView loads and displays chunks in virtualized list
- [ ] Selection works (checkbox + Space key)
- [ ] "Select Undetected" button selects only undetected chunks
- [ ] Batch detection creates job with multiple chunk IDs
- [ ] ProcessingDock shows batch detection progress
- [ ] Floating action bar appears when chunks selected
- [ ] ChunkCard keyboard shortcuts work when active
- [ ] Detailed mode lazy loads chunk data
- [ ] Metadata editing updates database (Phase 5F if included)

### Service Restarts:
- [ ] Next.js: Should auto-reload

---

## Phase 6: Admin Panel Detect All (3-4 hours)

### Overview
Create `ChunkStatsOverview` component for Admin Panel with "Detect All Undetected Chunks" functionality. Shows document-level detection statistics using RPC functions.

### Changes Required

#### 6A. Create ChunkStatsOverview Component
**File**: `src/components/sidebar/ChunkStatsOverview.tsx` (NEW FILE)
**Purpose**: Display stats and "Detect All" action

```typescript
'use client'

import { useState, useEffect } from 'react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/rhizome/badge'
import { Progress } from '@/components/ui/progress'
import { Sparkles, Loader2, AlertCircle } from 'lucide-react'
import { loadChunkDetectionStats, detectAllUndetectedChunks } from '@/app/actions/connections'
import { toast } from 'sonner'

interface ChunkDetectionStats {
  total_chunks: number
  detected_chunks: number
  undetected_chunks: number
  detection_rate: number
  avg_connections_per_chunk: number
}

export function ChunkStatsOverview({ documentId }: { documentId: string }) {
  const [stats, setStats] = useState<ChunkDetectionStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [isDetecting, setIsDetecting] = useState(false)

  useEffect(() => {
    loadChunkDetectionStats(documentId)
      .then(setStats)
      .catch(err => {
        console.error('[ChunkStatsOverview] Failed to load stats:', err)
        toast.error('Failed to load detection stats')
      })
      .finally(() => setLoading(false))
  }, [documentId])

  const handleDetectAllUndetected = async () => {
    if (!stats || stats.undetected_chunks === 0) return

    setIsDetecting(true)
    try {
      const result = await detectAllUndetectedChunks(documentId)
      toast.success(`Detection started for ${result.chunkCount} chunks`, {
        description: 'Check ProcessingDock for progress'
      })
    } catch (error) {
      console.error('[ChunkStatsOverview] Detection failed:', error)
      toast.error('Failed to start detection')
    } finally {
      setIsDetecting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    )
  }

  if (!stats) {
    return <div className="p-4 text-sm text-muted-foreground">No stats available</div>
  }

  return (
    <div className="space-y-4 p-4">
      {/* Stats Cards */}
      <div className="grid grid-cols-2 gap-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Detection Progress</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {stats.detected_chunks} / {stats.total_chunks}
            </div>
            <Progress
              value={stats.detection_rate}
              className="mt-2"
            />
            <p className="text-xs text-muted-foreground mt-1">
              {stats.detection_rate.toFixed(1)}% complete
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Avg Connections</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {stats.avg_connections_per_chunk.toFixed(1)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              per detected chunk
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Batch Actions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Batch Actions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button
            onClick={handleDetectAllUndetected}
            disabled={stats.undetected_chunks === 0 || isDetecting}
            className="w-full"
          >
            {isDetecting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Detecting...
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4 mr-2" />
                Detect All Undetected Chunks
                <Badge variant="secondary" className="ml-2">
                  {stats.undetected_chunks}
                </Badge>
              </>
            )}
          </Button>

          <p className="text-xs text-muted-foreground">
            {process.env.NEXT_PUBLIC_PROCESSING_MODE === 'local' ? (
              <>
                <AlertCircle className="h-3 w-3 inline mr-1" />
                LOCAL mode: ~{estimateLocalDetectionTime(stats.undetected_chunks)} minutes
              </>
            ) : (
              <>
                Estimated cost: ~${estimateCloudCost(stats.undetected_chunks).toFixed(2)}
              </>
            )}
          </p>
        </CardContent>
      </Card>
    </div>
  )
}

function estimateLocalDetectionTime(chunkCount: number): number {
  // ~2 seconds per chunk in LOCAL mode (3 engines)
  return Math.ceil((chunkCount * 2) / 60)
}

function estimateCloudCost(chunkCount: number): number {
  // ~$0.001 per chunk for Gemini API calls
  return chunkCount * 0.001
}
```

#### 6B. Create Server Actions for Stats
**File**: `src/app/actions/connections.ts` (extend)
**Purpose**: RPC function wrappers for stats

```typescript
'use server'

import { createClient } from '@/lib/supabase/server'
import { getCurrentUser } from '@/lib/auth'
import { revalidatePath } from 'next/cache'

/**
 * Load chunk detection statistics for a document using RPC function.
 */
export async function loadChunkDetectionStats(documentId: string) {
  const supabase = await createClient()
  const user = await getCurrentUser()

  if (!user) {
    throw new Error('Not authenticated')
  }

  const { data, error } = await supabase
    .rpc('get_chunk_detection_stats', { doc_id: documentId })
    .single()

  if (error) throw error

  return data
}

/**
 * Detect connections for all undetected chunks in a document.
 * Uses RPC function to get chunk IDs efficiently.
 */
export async function detectAllUndetectedChunks(documentId: string) {
  const user = await getCurrentUser()
  if (!user) {
    throw new Error('Not authenticated')
  }

  const supabase = await createClient()

  // Get all undetected chunk IDs using RPC function
  const { data: chunkIds, error: rpcError } = await supabase
    .rpc('get_undetected_chunk_ids', { doc_id: documentId })

  if (rpcError) throw rpcError

  if (!chunkIds || chunkIds.length === 0) {
    return { success: true, message: 'All chunks already detected', chunkCount: 0 }
  }

  // Create batch detection job
  const { data: job, error: jobError } = await supabase
    .from('background_jobs')
    .insert({
      job_type: 'detect_connections',
      input_data: {
        document_id: documentId,
        chunk_ids: chunkIds.map(c => c.chunk_id),
        trigger: 'admin_detect_all'
      },
      entity_id: documentId,
      user_id: user.id,
      status: 'pending'
    })
    .select()
    .single()

  if (jobError) throw jobError

  revalidatePath(`/read/${documentId}`)

  return { success: true, jobId: job.id, chunkCount: chunkIds.length }
}
```

### Success Criteria

#### Automated Verification:
- [ ] Type check: `npm run type-check`
- [ ] Build: `npm run build`

#### Manual Verification:
- [ ] ChunkStatsOverview displays correct detection statistics
- [ ] "Detect All" button shows correct undetected count
- [ ] Clicking "Detect All" creates job with all undetected chunk IDs
- [ ] ProcessingDock shows progress for "Detect All" job
- [ ] Detection rate updates to 100% after completion
- [ ] Cost/time estimate shows correctly based on processing mode

### Service Restarts:
- [ ] Next.js: Should auto-reload

---

## Phase 7: Testing & Polish (4-6 hours)

### Overview
Create integration tests, manual testing guide, and update documentation. Ensure all workflows work end-to-end.

### Changes Required

#### 7A. Integration Tests
**File**: `worker/tests/selective-connection-detection.test.ts` (NEW FILE)
**Purpose**: Integration tests for new workflows

```typescript
import { describe, it, expect, beforeAll, afterAll } from '@jest/globals'
import { createClient } from '@supabase/supabase-js'

describe('Selective Connection Detection', () => {
  let supabase: any

  beforeAll(() => {
    supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
  })

  it('should skip detection when opted out during upload', async () => {
    // Create test document
    const doc = await uploadTestDocument({ detectConnections: false })
    const chunks = await getChunks(doc.id)

    // All chunks should be marked as not detected
    expect(chunks.every(c => c.connections_detected === false)).toBe(true)
    expect(chunks.every(c => c.detection_skipped_reason === 'user_choice')).toBe(true)

    // No connections should exist
    const connections = await getConnections(doc.id)
    expect(connections.length).toBe(0)
  })

  it('should detect connections for single chunk', async () => {
    const doc = await uploadTestDocument({ detectConnections: false })
    const chunks = await getChunks(doc.id)
    const targetChunk = chunks[0]

    await detectSingleChunkConnections(targetChunk.id)

    // Only target chunk should be marked as detected
    const updatedChunks = await getChunks(doc.id)
    expect(updatedChunks.find(c => c.id === targetChunk.id).connections_detected).toBe(true)
    expect(updatedChunks.filter(c => c.connections_detected === true).length).toBe(1)
  })

  it('should detect connections for batch of chunks', async () => {
    const doc = await uploadTestDocument({ detectConnections: false })
    const chunks = await getChunks(doc.id)
    const targetChunks = chunks.slice(0, 5)

    await detectBatchChunkConnections(doc.id, targetChunks.map(c => c.id))

    // Only target chunks should be marked as detected
    const updatedChunks = await getChunks(doc.id)
    const detectedCount = updatedChunks.filter(c => c.connections_detected === true).length
    expect(detectedCount).toBe(5)
  })

  it('should detect all undetected chunks', async () => {
    const doc = await uploadTestDocument({ detectConnections: false })
    const chunks = await getChunks(doc.id)

    await detectAllUndetectedChunks(doc.id)

    // All chunks should now be marked as detected
    const updatedChunks = await getChunks(doc.id)
    expect(updatedChunks.every(c => c.connections_detected === true)).toBe(true)
  })

  it('should handle engine filtering with sourceChunkIds', async () => {
    const doc = await uploadTestDocument()
    const chunks = await getChunks(doc.id)
    const sourceChunks = chunks.slice(0, 3)

    const result = await processDocument(doc.id, {
      enabledEngines: ['semantic_similarity'],
      sourceChunkIds: sourceChunks.map(c => c.id)
    })

    // Connections should only have these source chunks
    const connections = await getConnections(doc.id)
    const allSourcesInFilter = connections.every(conn =>
      sourceChunks.some(c => c.id === conn.source_chunk_id)
    )
    expect(allSourcesInFilter).toBe(true)
  })

  // Helper functions
  async function uploadTestDocument(options: { detectConnections?: boolean } = {}) {
    // ... implement test document upload
  }

  async function getChunks(documentId: string) {
    const { data } = await supabase
      .from('chunks')
      .select('*')
      .eq('document_id', documentId)
    return data
  }

  async function getConnections(documentId: string) {
    const { data } = await supabase
      .from('connections')
      .select('*')
      .eq('source_chunk_id', `(SELECT id FROM chunks WHERE document_id = '${documentId}')`)
    return data
  }
})
```

#### 7B. Manual Testing Guide
**File**: `thoughts/testing/MANUAL_TESTING_GUIDE_SELECTIVE_DETECTION.md` (NEW FILE)
**Purpose**: Comprehensive manual testing checklist

```markdown
# Manual Testing Guide: Selective Connection Detection

## Test 1: Upload with Detection Disabled
1. Upload new PDF document
2. VERIFY checkbox is UNCHECKED by default
3. Leave unchecked, click "Start Processing"
4. Wait for processing to complete
5. Verify:
   - Document appears in reader
   - Chunks show "Not scanned yet" in ChunkMetadataIcon tooltips
   - ChunksTab Overview shows 0% detection rate
   - No connections in Connections tab
   - ProcessingDock showed "Skipping connection detection" message

## Test 2: Upload with Detection Enabled
1. Upload new PDF document
2. CHECK "Detect connections after processing"
3. Wait for processing to complete
4. Verify:
   - All chunks marked as detected
   - Connections visible in RightPanel
   - ChunksTab shows 100% detection rate
   - ProcessingDock showed connection detection progress

## Test 3: Single Chunk Detection
1. Open document from Test 1 (undetected)
2. Hover over any chunk's left margin (ChunkMetadataIcon)
3. Verify tooltip shows:
   - "Not scanned yet" badge
   - "Detect Connections" button
4. Click "Detect Connections"
5. Verify:
   - Toast notification: "Connection detection started"
   - ProcessingDock appears with job progress
   - Chunk marker changes to green after completion
   - Connections appear in RightPanel for that chunk
   - Only that chunk marked as detected in ChunksTab

## Test 4: Batch Chunk Detection
1. Open RightPanel → ChunksTab → All Chunks
2. Verify virtualized list loads smoothly
3. Click "Select Undetected (X)" button
4. Verify 10-20 chunks are selected (or all if fewer)
5. Verify floating action bar appears at bottom
6. Click "Detect Connections" in action bar
7. Verify:
   - Toast notification shows chunk count
   - ProcessingDock shows batch progress ("Chunk X of Y...")
   - Selected chunks marked as detected after completion
   - Connections appear in Connections tab

## Test 5: Detect All Undetected
1. Open ChunksTab → Overview
2. Verify stats show:
   - Total chunks
   - Detected chunks
   - Undetected chunks
   - Detection rate percentage
   - Avg connections per chunk
3. Verify "Detect All Undetected Chunks (X)" button shows correct count
4. Click button
5. Verify:
   - ProcessingDock shows progress with chunk count
   - Detection rate increases to 100%
   - All chunks show green markers in reader
   - Cost/time estimate was shown before starting

## Test 6: Keyboard Shortcuts (ChunkCard)
1. Open All Chunks view
2. Click on a chunk to make it active
3. Verify keyboard shortcuts work:
   - `Space`: Toggles selection
   - `d`: Detects connections (if undetected)
   - `j`: Jumps to chunk in reader
4. Type in search box - verify shortcuts don't trigger while typing

## Test 7: LOCAL Mode Performance
1. Set PROCESSING_MODE=local in .env
2. Upload document with detection disabled
3. Detect single chunk
4. Verify:
   - Detection takes ~2-3 seconds (not instant)
   - No errors in console
   - Ollama logs show activity (if monitoring)
5. Detect batch of 10 chunks
6. Verify total time ~20-30 seconds

## Test 8: Metadata Editing (Detailed Mode)
1. Open All Chunks view
2. Expand a chunk to detailed mode (if implemented)
3. Click "Edit" button
4. Modify metadata fields:
   - Change primary domain
   - Add/remove concepts
   - Adjust themes
   - Change importance score
5. Click "Save"
6. Verify:
   - Optimistic update shows immediately
   - Database update succeeds (no error toast)
   - Reader shows updated metadata in ChunkMetadataIcon

## Edge Cases

### EC1: Detect Already Detected Chunk
- Detect chunk that's already detected
- Verify: Should work without errors (idempotent)

### EC2: Cancel Job Mid-Detection
- Start batch detection
- Cancel job from Admin Panel
- Verify: Chunks processed so far are marked, rest remain undetected

### EC3: Network Error During Detection
- Disconnect network mid-detection
- Verify: Job fails gracefully, shows error in ProcessingDock

### EC4: Select 0 Chunks
- Click batch detect with 0 chunks selected
- Verify: Button disabled or no-op

### EC5: RPC Function Performance
- Upload document with 500+ chunks
- Load ChunksTab Overview
- Verify: Stats load in <2 seconds (RPC is efficient)
```

#### 7C. Documentation Updates
**Files to Update**:
- `CLAUDE.md` - Add section on selective connection detection
- `docs/USER_FLOW.md` - Update connection detection workflow
- `worker/README.md` - Document new orchestrator parameters

**Additions to CLAUDE.md**:
```markdown
### Selective Connection Detection (NEW)

Connection detection is now **optional and user-controlled**:

**Upload Behavior**:
- Checkbox: "Detect connections after processing" (UNCHECKED by default)
- Unchecked → Chunks marked as `connections_detected: false`
- Checked → Full detection (all 3 engines)

**Detection Options**:
1. **Per-Chunk** - Hover chunk icon, click "Detect Connections"
2. **Batch** - RightPanel → ChunksTab → Select chunks → Batch detect
3. **Detect All** - Admin Panel → ChunksTab → "Detect All Undetected"

**Database Tracking**:
- `chunks.connections_detected` - Boolean flag per chunk
- `chunks.connections_detected_at` - Timestamp
- `chunks.detection_skipped_reason` - 'user_choice' | 'error' | 'manual_skip'

**Worker Extensions**:
- `Orchestrator.sourceChunkIds` - Filter detection to specific chunks
- `ConnectionDetectionManager.markChunksAsDetected()` - Mark chunks after detection
- `ConnectionDetectionManager.markChunksAsSkipped()` - Mark chunks when skipped

**UI Components**:
- `ChunkMetadataIcon` - Shows detection status + action button
- `AllChunksView` - Virtualized list with batch selection
- `ChunkStatsOverview` - Document-level stats with "Detect All"

**See**: `thoughts/plans/2025-10-24_selective-connection-detection-final.md`
```

### Success Criteria

#### Automated Verification:
- [ ] Integration tests pass: `cd worker && npm test`
- [ ] Type check: `npm run type-check`
- [ ] Build: `npm run build`

#### Manual Verification:
- [ ] Complete all test cases in manual testing guide
- [ ] All 8 test scenarios pass
- [ ] All 5 edge cases handled correctly
- [ ] Documentation accurate and complete

### Service Restarts:
- None (tests only)

---

## Testing Strategy

### Unit Tests

**Worker Tests** (`worker/tests/`):
- Manager methods (mark as detected, mark as skipped)
- Orchestrator with `sourceChunkIds` parameter
- Engine chunk filtering logic

**Main App Tests** (`tests/`):
- Server actions (chunk loading, batch detection)
- Zustand store (selection, lazy loading)

### Integration Tests

**End-to-End Workflows** (`worker/tests/selective-connection-detection.test.ts`):
- Upload with detection disabled
- Single-chunk detection
- Batch detection
- Detect all undetected
- Engine filtering with `sourceChunkIds`

### Manual Testing

**Use Manual Testing Guide** (`thoughts/testing/MANUAL_TESTING_GUIDE_SELECTIVE_DETECTION.md`):
- 8 primary test scenarios
- 5 edge cases
- Keyboard shortcuts
- LOCAL vs CLOUD mode differences

### Test Data

**Use Real Fixtures**:
- Process actual PDF with 50-100 pages
- Test with documents of varying sizes (small/medium/large)
- Avoid Lorem Ipsum - use real content for meaningful connections

---

## Performance Considerations

**Database Queries**:
- RPC functions for aggregations (avoid URL length limits)
- Indexes on `connections_detected` for efficient filtering
- Lazy loading connection counts (only in detailed mode)

**Virtualized Lists**:
- Virtuoso handles 500+ chunks efficiently
- Overscan=2000 for smooth scrolling
- No performance degradation with large documents

**Worker Processing**:
- Per-chunk mode: ~10-15 seconds per chunk (all 3 engines)
- Batch mode: Sequential processing with progress updates
- Mark chunks AFTER successful detection (transactional safety)

**Cost/Time Estimates**:
- LOCAL mode: ~2 seconds per chunk (zero cost)
- CLOUD mode: ~1 second per chunk (~$0.001 per chunk)
- Thematic Bridge is slowest engine (AI-powered)

---

## Migration Notes

**Fresh Start Strategy**:
- No backward compatibility needed (no production data)
- All new chunks default to `connections_detected: false`
- Existing documents (if any) can be re-detected using "Detect All"

**RPC Functions**:
- `get_chunk_detection_stats()` - Document-level aggregation
- `get_undetected_chunk_ids()` - Efficient chunk ID retrieval

**No Breaking Changes**:
- Default behavior: Detection opt-in (checkbox unchecked)
- Existing `detect_connections` handler extended (not replaced)
- Orchestrator backward compatible (new parameters optional)

---

## References

**Architecture**:
- `docs/ARCHITECTURE.md` - Overall system design
- `docs/PROCESSING_PIPELINE.md` - 10-stage pipeline documentation
- `worker/README.md` - Worker module documentation

**Testing**:
- `docs/testing/TESTING_RULES.md` - Testing philosophy and rules
- `docs/testing/TESTING_README.md` - Quick start guide

**Similar Features**:
- `src/components/reader/ChunkMetadataIcon.tsx` - Existing chunk icon (extended)
- `src/components/sidebar/ChunkQualityPanel.tsx` - Batch operations pattern
- `src/stores/reader-store.ts` - Zustand pattern for viewport tracking

**Job System**:
- `docs/JOB_SYSTEM.md` - Background job reference
- `worker/lib/handler-job-manager.ts` - Base manager pattern

---

## Implementation Checklist

### Pre-Implementation
- [ ] Review plan with user
- [ ] Confirm all decisions (checkbox default, migration strategy, metadata scope)
- [ ] Create implementation branch: `git checkout -b feature/selective-connection-detection`

### Phase 1: Database
- [ ] Create migration 053
- [ ] Update TypeScript types
- [ ] Apply migration: `npx supabase db reset`
- [ ] Verify RPC functions: `\df get_chunk_detection_stats`
- [ ] Manual verification complete

### Phase 2: Worker
- [ ] Extend ConnectionDetectionManager
- [ ] Update DocumentProcessingManager
- [ ] Update Orchestrator
- [ ] Update all 3 engines
- [ ] Worker tests pass
- [ ] Manual orchestrator test

### Phase 3: Upload Flow
- [ ] Add checkbox to upload UI
- [ ] Update server action
- [ ] Update handler
- [ ] Type check passes
- [ ] Manual upload test (both checked/unchecked)

### Phase 4: Reader
- [ ] Extend ChunkMetadataIcon
- [ ] Create server action for single-chunk
- [ ] Update handler
- [ ] Type check passes
- [ ] Manual reader test

### Phase 5: Chunks Tab
- [ ] Create ChunkStore
- [ ] Create server actions for chunks
- [ ] Create ChunkCard component
- [ ] Create AllChunksView
- [ ] Create ChunksTab container
- [ ] Type check passes
- [ ] Manual virtualized list test

### Phase 6: Admin Panel
- [ ] Create ChunkStatsOverview
- [ ] Create server actions for stats
- [ ] Type check passes
- [ ] Manual stats test

### Phase 7: Testing
- [ ] Write integration tests
- [ ] Create manual testing guide
- [ ] Update documentation (CLAUDE.md, USER_FLOW.md, worker/README.md)
- [ ] Run full test suite
- [ ] Complete manual testing checklist

### Post-Implementation
- [ ] Code review (if applicable)
- [ ] Create git commit
- [ ] Update status in this plan file
- [ ] Create follow-up issues for future enhancements (if any)

---

**READY FOR IMPLEMENTATION** ✅

All decisions confirmed. Plan reviewed and approved. Proceed phase by phase with automated + manual verification at each step.
