# Chunks System - Complete Documentation

**Version**: 2.0 (Selective Connection Detection)
**Created**: 2025-10-25
**Status**: Production Ready

---

## Table of Contents

1. [Overview](#overview)
2. [Chunks Tab UI](#chunks-tab-ui)
3. [User Workflows](#user-workflows)
4. [Metadata Editing](#metadata-editing)
5. [Connection Detection](#connection-detection)
6. [Keyboard Shortcuts](#keyboard-shortcuts)
7. [Technical Architecture](#technical-architecture)
8. [Integration Guide](#integration-guide)

---

## Overview

The Chunks system provides comprehensive management of document chunks with selective connection detection, metadata editing, and quality monitoring. This replaces the previous all-or-nothing connection detection approach with flexible, user-controlled progressive enhancement.

### Core Philosophy

**Connection detection is expensive** (time + compute). Users should control **when** and **what** gets detected, especially with LOCAL mode (zero cost but slow).

### Key Benefits

- ✅ Upload documents instantly without waiting for detection (3-5 min → 2-3 min)
- ✅ Selective detection for interesting chunks only while reading
- ✅ Batch operations for efficient bulk detection
- ✅ Visual feedback on detection status per chunk
- ✅ Inline metadata editing without disrupting reading flow
- ✅ Cost control for cloud mode, time control for local mode

---

## Chunks Tab UI

The Chunks Tab is the **8th tab** in the RightPanel (Database icon), accessible from any document reader view.

### Location

**RightPanel → Chunks Tab (Database icon)**

Position: Fixed right side, below TopNav + DocumentHeader (134px from top)

### Sub-Tabs

The Chunks Tab contains **3 sub-tabs** for different chunk management workflows:

#### 1. Overview Sub-Tab

**Purpose**: High-level detection statistics and bulk operations

**Features**:
- **Detection Progress Card**
  - Shows X/Y chunks detected
  - Progress bar with percentage
  - Visual indication of completion status

- **Average Connections Card**
  - Shows average connections per detected chunk
  - Helps assess document connectivity

- **Detect All Undetected Button**
  - One-click detection for all unprocessed chunks
  - Shows chunk count badge
  - Displays cost/time estimate:
    - LOCAL mode: `~X minutes` (based on 2 sec/chunk for 3 engines)
    - CLOUD mode: `~$X.XX` (based on $0.001/chunk Gemini cost)
  - Disabled when no undetected chunks remain

**Use Cases**:
- Check overall detection progress
- Detect all remaining chunks after selective detection
- Get document-level connectivity insights

#### 2. All Chunks Sub-Tab

**Purpose**: Browse, search, and batch-select chunks for detection

**Features**:

**Search & Filter**:
- **Search bar** - Full-text search across chunk content and indices
- **Filter dropdown** - All | Detected Only | Undetected Only
- **View mode dropdown** - Compact | Detailed

**Stats Display**:
- Total chunks in current filter
- Undetected chunks count (warning badge)
- Selected chunks count (when > 0)

**Quick Actions**:
- **Select All** - Select all filtered chunks
- **Select Undetected (N)** - Select only unscanned chunks, shows count
- **Clear** - Clear current selection (appears when items selected)

**Virtualized Chunk List**:
- Efficient rendering for 100s of chunks
- 5-item overscan for smooth scrolling
- Two view modes:
  - **Compact**: Quick preview, detection status, actions
  - **Detailed**: Full metadata, editing, content preview

**Floating Action Bar** (appears when chunks selected):
- Shows selected count
- **Detect Connections (N)** button
- Launches batch detection job
- Clears selection on success

**Keyboard Navigation**:
- `↑/↓` - Navigate between chunks (sets active)
- `Escape` - Clear active chunk

**Use Cases**:
- Find specific chunks by content or number
- Select interesting chunks for batch detection
- Review undetected chunks before processing
- Edit metadata for individual chunks

#### 3. Quality Sub-Tab

**Purpose**: Monitor chunk quality and validation status

**Integrates**: Existing ChunkQualityPanel component

**Features**:
- Chunk quality indicators (position/metadata confidence)
- Validation workflow for correcting chunk boundaries
- Navigation to specific chunks in reader
- Quality statistics and filtering

**Use Cases**:
- Review chunks flagged for validation
- Correct chunk position errors
- Monitor overall chunk quality

---

## User Workflows

### Workflow 1: Skip Detection on Upload

**Scenario**: User wants to read a 500-page book immediately without waiting 25 minutes

```
1. Upload PDF (500 pages)
2. Uncheck "Detect connections after processing"
3. Processing completes in 2-3 min (vs 25 min with detection)
4. All chunks marked: connections_detected = false
5. User reads immediately
6. Detect connections later for interesting sections
```

**Benefits**:
- Instant access to document content
- Pay detection cost only for valuable chunks
- Flexible progressive enhancement

### Workflow 2: Detect Single Chunk While Reading

**Scenario**: User finds interesting passage in Chunk #47

```
1. User reads document, hovers over left margin ChunkMetadataIcon
2. Sees "Not scanned yet" + "Detect Connections" button
3. Clicks button
4. detect_connections job created with chunk_ids: [chunk_47_id]
5. ProcessingDock shows progress (~10-15 seconds)
6. Connections appear in RightPanel Connections tab
7. ChunkMetadataIcon updates: green checkmark + connection count
```

**Benefits**:
- No disruption to reading flow
- Instant feedback via ProcessingDock
- Connections appear when ready

### Workflow 3: Batch Detect Multiple Chunks

**Scenario**: User wants to detect connections for chapters 3-5 only

```
1. Open RightPanel → Chunks Tab → All Chunks
2. Search "Chapter 3" OR filter by chunk index range
3. Select relevant chunks (checkbox or space bar)
4. Switch search to "Chapter 4", select more chunks
5. Repeat for "Chapter 5"
6. Click "Detect Connections (87)" in floating action bar
7. detect_connections job processes 87 chunks in batch
8. ProcessingDock shows "Chunk 23 of 87..."
9. All chunks marked as detected when complete
```

**Benefits**:
- Efficient batch processing
- Granular control over detection scope
- Visual progress tracking

### Workflow 4: Detect All Undetected (Admin Panel)

**Scenario**: User finished selective detection, wants to complete the document

```
1. Open RightPanel → Chunks Tab → Overview
2. Sees "Detection Progress: 234/500 chunks (46.8%)"
3. Clicks "Detect All Undetected Chunks (266)"
4. Reviews estimate: "LOCAL mode: ~9 minutes"
5. Confirms action
6. detect_connections job processes all 266 chunks
7. Detection reaches 100%
8. Document fully connected
```

**Benefits**:
- One-click completion
- Cost/time transparency
- No chunk left behind

### Workflow 5: Edit Chunk Metadata

**Scenario**: User wants to enhance AI-generated metadata for better organization

```
1. Open RightPanel → Chunks Tab → All Chunks
2. Find chunk (search or scroll)
3. Expand to detailed view (click or press 'e')
4. Click "Edit Metadata" button
5. Metadata editor appears inline:
   - Add/remove theme tags (e.g., "cognitive_science", "memory")
   - Adjust importance slider (0-100%)
   - Set primary domain (e.g., "Neuroscience")
   - Set primary emotion (e.g., "Analytical")
6. Click "Save Changes"
7. Optimistic update (instant UI feedback)
8. Server saves to database
9. Metadata syncs across all views
```

**Benefits**:
- Inline editing without modal disruption
- Immediate visual feedback
- Persistent across sessions

---

## Metadata Editing

### ChunkMetadataEditor Component

**Location**: Appears inline in ChunkCard detailed mode

**Editable Fields**:

#### 1. Themes (Tag System)
- **Type**: Array of strings
- **UI**: Badge list with add/remove
- **Add Flow**:
  1. Type theme name in input
  2. Press Enter or click + button
  3. Theme appears as badge
- **Remove Flow**:
  1. Click X on badge
  2. Theme removed from list
- **Use Cases**:
  - Categorize chunks by topic
  - Filter chunks by theme
  - Track recurring concepts

#### 2. Importance Score
- **Type**: Number (0.0 - 1.0)
- **UI**: Slider with percentage display
- **Default**: 0.5 (50%)
- **Increments**: 5% (0.05)
- **Use Cases**:
  - Prioritize key chunks
  - Filter by importance
  - Sort by significance

#### 3. Primary Domain
- **Type**: String (domain_metadata.primaryDomain)
- **UI**: Text input
- **Examples**: "Computer Science", "Philosophy", "Biology"
- **Use Cases**:
  - Classify chunks by field
  - Cross-domain connection analysis
  - Domain-specific filtering

#### 4. Primary Emotion
- **Type**: String (emotional_metadata.primaryEmotion)
- **UI**: Text input
- **Examples**: "Optimistic", "Critical", "Neutral", "Analytical"
- **Use Cases**:
  - Emotional tone analysis
  - Identify subjective vs objective passages
  - Filter by emotional context

### Save Behavior

**Optimistic Updates**:
1. UI updates immediately (before server confirmation)
2. User sees instant feedback
3. If save fails, UI reverts + error toast

**Server Sync**:
1. Calls `updateChunkMetadata` server action
2. Updates JSONB fields in chunks table
3. Revalidates `/read/[documentId]` path
4. Syncs to reader view

**Error Handling**:
- Network errors: Shows error toast, reverts UI
- Validation errors: Shows specific error message
- Concurrent edits: Last write wins (no conflict resolution yet)

---

## Connection Detection

### Detection Modes

#### 1. Single Chunk Detection

**Trigger**: ChunkMetadataIcon "Detect Connections" button in reader

**Flow**:
```typescript
// Server Action: detectSingleChunkConnections(chunkId)
1. Create background_jobs entry:
   - job_type: 'detect_connections'
   - input_data: { document_id, chunk_ids: [chunkId], trigger: 'user_single' }
   - status: 'pending'
2. Worker picks up job
3. ConnectionDetectionManager.execute()
   - Passes sourceChunkIds to orchestrator
   - Orchestrator runs 3 engines with chunk filter
4. Engines process only specified chunk(s)
5. Connections saved to database
6. Chunk marked: connections_detected = true
7. ProcessingDock shows completion
```

**Performance**: 10-15 seconds for single chunk (LOCAL mode)

#### 2. Batch Chunk Detection

**Trigger**: AllChunksView "Detect Connections" button with selection

**Flow**:
```typescript
// Server Action: detectBatchChunkConnections(documentId, chunkIds[])
1. Create background_jobs entry:
   - job_type: 'detect_connections'
   - input_data: { document_id, chunk_ids: [id1, id2, ...], trigger: 'user_batch' }
   - status: 'pending'
2. Worker processes batch
3. Progress updates: "Chunk 23 of 87..."
4. All selected chunks processed
5. All marked as detected
6. Selection cleared on completion
```

**Performance**: ~2 sec/chunk (LOCAL mode with 3 engines)

#### 3. Detect All Undetected

**Trigger**: ChunkStatsOverview "Detect All Undetected Chunks" button

**Flow**:
```typescript
// Server Action: detectAllUndetectedChunks(documentId)
1. RPC call: get_undetected_chunk_ids(documentId)
2. Returns all undetected chunk IDs (ordered by chunk_index)
3. Create background_jobs entry with all IDs
4. Worker processes entire batch
5. Document reaches 100% detection
```

**Performance**: Full 500-page book (500 chunks) = ~17 minutes (LOCAL mode)

### Detection Tracking

**Database Schema** (chunks table):
```sql
connections_detected BOOLEAN DEFAULT false
connections_detected_at TIMESTAMPTZ
detection_skipped_reason TEXT  -- 'user_choice' | 'error' | 'manual_skip'
```

**Detection Flow**:
1. Upload without detection: `detection_skipped_reason = 'user_choice'`
2. Detect connections: `connections_detected = true`, `connections_detected_at = NOW()`
3. Error during detection: `detection_skipped_reason = 'error'`

**Statistics** (via RPC):
```sql
-- get_chunk_detection_stats(documentId)
RETURNS:
  - total_chunks
  - detected_chunks
  - undetected_chunks
  - detection_rate (percentage)
  - avg_connections_per_chunk
```

### Engine Configuration

**All 3 engines run for every detection**:

1. **Semantic Similarity** (25% weight)
   - Embedding-based similarity
   - Fast, finds "say same thing" connections
   - Filters by sourceChunkIds when provided

2. **Contradiction Detection** (40% weight)
   - Metadata-based conceptual tensions
   - Finds opposing viewpoints
   - Filters by sourceChunkIds when provided

3. **Thematic Bridge** (35% weight)
   - AI-powered cross-domain concept matching
   - Finds deep thematic links
   - Filters by sourceChunkIds when provided

**Orchestrator Integration**:
```typescript
// worker/engines/orchestrator.ts
processDocument(documentId, {
  enabledEngines: ['semantic_similarity', 'contradiction_detection', 'thematic_bridge'],
  sourceChunkIds: chunkIds,  // Filter to specific chunks
  onProgress: (percent, stage, details) => updateProgress(...)
})
```

**Performance Characteristics**:
- **Without filter**: All chunks vs all chunks (N²)
- **With filter**: Specified chunks vs all chunks (N*M where M << N)
- **Aggressive filtering**: <300 AI calls per document

---

## Keyboard Shortcuts

### Global (AllChunksView)

| Key | Action | Context |
|-----|--------|---------|
| `↑` | Navigate up | Chunk list |
| `↓` | Navigate down | Chunk list |
| `Escape` | Clear active | Chunk list |

### ChunkCard (When Active)

| Key | Action | Mode | Condition |
|-----|--------|------|-----------|
| `d` | Detect connections | Both | Not yet detected |
| `Space` | Toggle selection | Both | Selection enabled |
| `Enter` | Toggle selection | Both | Selection enabled |
| `e` | Expand/collapse | Both | Has onToggleMode |

**Notes**:
- Shortcuts disabled when typing in input/textarea
- Only work when chunk is active (isActive = true)
- Visual hints shown in compact mode when active

---

## Technical Architecture

### Component Hierarchy

```
RightPanelV2
└── ChunksTab (8th tab, Database icon)
    ├── Overview Sub-Tab
    │   └── ChunkStatsOverview
    │       ├── Detection Progress Card
    │       ├── Avg Connections Card
    │       └── Detect All Button
    │
    ├── All Chunks Sub-Tab
    │   └── AllChunksView
    │       ├── Search & Filter Bar
    │       ├── Stats Display
    │       ├── Quick Action Buttons
    │       ├── Virtuoso (virtualized list)
    │       │   └── ChunkCard (many)
    │       │       ├── Compact Mode
    │       │       │   ├── Checkbox
    │       │       │   ├── Status Badge
    │       │       │   ├── Preview Text
    │       │       │   └── Quick Actions
    │       │       └── Detailed Mode
    │       │           ├── Metadata Grid
    │       │           ├── Heading Path
    │       │           ├── Themes Display
    │       │           ├── Content Preview
    │       │           ├── Quality Indicators
    │       │           ├── ChunkMetadataEditor (when editing)
    │       │           │   ├── Theme Tags
    │       │           │   ├── Importance Slider
    │       │           │   ├── Domain Input
    │       │           │   ├── Emotion Input
    │       │           │   └── Save/Cancel Actions
    │       │           └── Detect Connections Button
    │       └── Floating Action Bar (when selected > 0)
    │
    └── Quality Sub-Tab
        └── ChunkQualityPanel
            ├── Quality Statistics
            ├── Validation Workflow
            └── Navigate to Chunk
```

### State Management (Zustand)

**ChunkStore** (`src/stores/chunk-store.ts`):

```typescript
interface ChunkStore {
  // Selection State
  selectedChunks: Set<string>
  toggleSelection: (chunkId: string) => void
  selectMultiple: (chunkIds: string[]) => void
  clearSelection: () => void

  // Detection Status (synced from DB)
  detectionStatus: Map<string, boolean>
  markAsDetected: (chunkId: string) => void

  // Lazy Loading
  detailedChunks: Map<string, ChunkDetailed>
  loadingDetailed: Set<string>
  loadDetailedChunk: (chunkId: string) => Promise<void>

  // Metadata Editing
  updateChunkMetadata: (
    chunkId: string,
    metadata: Partial<ChunkMetadata>
  ) => Promise<void>
}
```

**Key Patterns**:
- **Sets/Maps for O(1) lookups**: selectedChunks, detectionStatus, detailedChunks
- **Lazy loading**: Only fetch detailed data when chunk expanded
- **Optimistic updates**: UI updates before server confirmation
- **Singleton instance**: Created per request, not global

### Server Actions

**Location**: `src/app/actions/chunks.ts`

#### 1. loadChunkMetadata(documentId)
```typescript
// Loads lightweight chunk list for AllChunksView
Returns: ChunkListItem[] {
  id, chunk_index, preview, connections_detected
}
Query: Select only needed columns, ordered by chunk_index
Performance: Fast (no connection count, minimal data)
```

#### 2. loadChunkDetails(chunkId)
```typescript
// Loads full chunk data for detailed mode
Returns: ChunkDetailed {
  content, heading_path, metadata, themes,
  connections_detected, connection_count, ...
}
Query: Full chunk + connection count (separate query)
Performance: Lazy (only when user expands chunk)
```

#### 3. updateChunkMetadata(chunkId, metadata)
```typescript
// Updates JSONB metadata fields
Input: {
  themes?, importance_score?,
  domain_metadata?, emotional_metadata?, conceptual_metadata?
}
Updates: Only provided fields (partial update)
Revalidates: /read/[documentId] path
Performance: Fast (single UPDATE query)
```

#### 4. detectBatchChunkConnections(documentId, chunkIds[])
```typescript
// Creates batch detection job
Input: documentId, chunkIds array
Creates: background_jobs entry with input_data.chunk_ids
Returns: { success, jobId, chunkCount }
Performance: Instant (job creation only)
```

**Location**: `src/app/actions/connections.ts`

#### 5. loadChunkDetectionStats(documentId)
```typescript
// Gets detection statistics via RPC
Calls: get_chunk_detection_stats(documentId)
Returns: {
  total_chunks, detected_chunks, undetected_chunks,
  detection_rate, avg_connections_per_chunk
}
Performance: Fast (single RPC call with aggregations)
```

#### 6. detectAllUndetectedChunks(documentId)
```typescript
// Detects all undetected chunks
Calls: get_undetected_chunk_ids(documentId) for chunk list
Creates: background_jobs entry with all undetected IDs
Returns: { success, jobId, chunkCount }
Performance: Fast RPC + job creation
```

### Worker Integration

**Detection Handler** (`worker/handlers/detect-connections.ts`):

```typescript
async function handleDetectConnections(job: BackgroundJob) {
  const { document_id, chunk_ids, trigger } = job.input_data

  // Create manager
  const manager = new ConnectionDetectionManager(supabase, job.id)

  // Execute detection (with optional chunk filtering)
  await manager.detectConnections({
    documentId: document_id,
    chunkIds: chunk_ids,  // Optional: filters to specific chunks
    trigger,
    markAsDetected: true  // Marks chunks after detection
  })
}
```

**Orchestrator** (`worker/engines/orchestrator.ts`):

```typescript
export async function processDocument(
  documentId: string,
  options: {
    enabledEngines: EngineType[]
    sourceChunkIds?: string[]  // NEW: Optional chunk filter
    onProgress?: (percent, stage, details) => void
    ...
  }
) {
  // Fetch source chunks (filtered if sourceChunkIds provided)
  const sourceChunks = await fetchChunks(documentId, {
    chunkIds: options.sourceChunkIds
  })

  // Run each engine with filtered source chunks
  for (const engine of engines) {
    const connections = await engine.detect(sourceChunks, targetChunks)
    await saveConnections(connections)
  }
}
```

**All 3 Engines Support Filtering**:
- `semantic-similarity.ts` - Filters source chunks when sourceChunkIds provided
- `contradiction-detection.ts` - Filters source chunks when sourceChunkIds provided
- `thematic-bridge.ts` - Filters source chunks when sourceChunkIds provided

### Database Schema

**Chunks Table** (migration 070):
```sql
-- Detection tracking columns
ALTER TABLE chunks
  ADD COLUMN connections_detected BOOLEAN DEFAULT false,
  ADD COLUMN connections_detected_at TIMESTAMPTZ,
  ADD COLUMN detection_skipped_reason TEXT;

-- Indexes for efficient filtering
CREATE INDEX idx_chunks_detection_status
  ON chunks(document_id, connections_detected)
  WHERE connections_detected = false;

CREATE INDEX idx_chunks_detected_at
  ON chunks(connections_detected_at)
  WHERE connections_detected_at IS NOT NULL;
```

**RPC Functions**:

```sql
-- Get detection stats for a document
CREATE OR REPLACE FUNCTION get_chunk_detection_stats(doc_id UUID)
RETURNS TABLE (
  total_chunks BIGINT,
  detected_chunks BIGINT,
  undetected_chunks BIGINT,
  detection_rate NUMERIC,
  avg_connections_per_chunk NUMERIC
);

-- Get undetected chunk IDs (ordered by chunk_index)
CREATE OR REPLACE FUNCTION get_undetected_chunk_ids(doc_id UUID)
RETURNS TABLE (chunk_id UUID);
```

**Benefits**:
- Efficient aggregations without URL length issues
- Single query for stats (no N+1)
- Indexed for fast lookups

---

## Integration Guide

### Adding Chunks Tab to New Documents

**1. Ensure RightPanel Integration**:
```typescript
// In document reader page
import { RightPanelV2 } from '@/components/sidebar/RightPanel'

<RightPanelV2
  documentId={documentId}
  onNavigateToChunk={(chunkId) => {
    // Handle navigation to chunk in reader
    scrollToChunk(chunkId)
  }}
/>
```

**2. ChunkMetadataIcon Integration** (reader left margin):
```typescript
// Already integrated in VirtualizedReader
import { ChunkMetadataIcon } from '@/components/reader/ChunkMetadataIcon'

// Shows detection status + "Detect Connections" button
<ChunkMetadataIcon
  chunk={chunk}
  documentId={documentId}
/>
```

### Upload Flow Integration

**UploadZone** (`src/components/upload/UploadZone.tsx`):
```typescript
// Checkbox for skipping detection
<Checkbox
  id="detect-connections"
  checked={detectConnections}
  onCheckedChange={setDetectConnections}
/>
<Label htmlFor="detect-connections">
  Detect connections after processing
</Label>
```

**DocumentPreview** (`src/components/upload/DocumentPreview.tsx`):
```typescript
// Thread detectConnections through upload
const { mutate } = useUploadDocument({
  onSuccess: () => {
    // ...
  }
})

mutate({
  file,
  sourceType,
  detectConnections  // Pass to server action
})
```

**Server Action** (`src/app/actions/documents.ts`):
```typescript
export async function processDocument(data: {
  file: File
  sourceType: SourceType
  detectConnections: boolean  // NEW
}) {
  // Create background_jobs entry
  await supabase.from('background_jobs').insert({
    job_type: 'process_document',
    input_data: {
      document_id,
      detect_connections: data.detectConnections  // Pass to worker
    }
  })
}
```

**Worker Handler** (`worker/handlers/process-document.ts`):
```typescript
// Check detectConnections flag from input_data
const { document_id, detect_connections } = job.input_data

if (!detect_connections) {
  // Skip Stage 6 (Connection Detection)
  await manager.markChunksAsSkipped(document_id, 'user_choice')
  return
}

// Run Stage 6 normally
await manager.detectConnections({ documentId: document_id })
```

### Custom Detection Workflows

**Example: Detect Only High-Importance Chunks**:
```typescript
// In custom admin panel or advanced settings
async function detectImportantChunks(documentId: string) {
  // 1. Query high-importance chunks
  const { data: chunks } = await supabase
    .from('chunks')
    .select('id')
    .eq('document_id', documentId)
    .eq('connections_detected', false)
    .gte('importance_score', 0.7)  // Only important chunks

  const chunkIds = chunks.map(c => c.id)

  // 2. Detect connections for filtered chunks
  await detectBatchChunkConnections(documentId, chunkIds)
}
```

**Example: Detect by Theme**:
```typescript
// Detect only chunks with specific theme
async function detectByTheme(documentId: string, theme: string) {
  const { data: chunks } = await supabase
    .from('chunks')
    .select('id')
    .eq('document_id', documentId)
    .contains('themes', [theme])

  await detectBatchChunkConnections(documentId, chunks.map(c => c.id))
}
```

---

## Performance Characteristics

### Chunk Loading

**AllChunksView Initial Load**:
- Query: `SELECT id, chunk_index, content (preview), connections_detected`
- 500 chunks = ~50KB response
- Virtuoso renders only ~10-15 visible items
- Performance: <200ms for 500 chunks

**Detailed Mode Lazy Loading**:
- Triggered when user expands chunk
- Loads full content + metadata + connection count
- Single chunk = ~5-10KB
- Performance: <100ms per chunk

### Detection Performance

**Single Chunk** (LOCAL mode):
- 3 engines × ~3-5 sec = 10-15 seconds total
- Cost: $0.00 (local processing)

**Batch 100 Chunks** (LOCAL mode):
- ~2 sec/chunk × 100 = ~3.5 minutes
- Progress updates every chunk
- Cost: $0.00 (local processing)

**Full Document 500 Chunks** (LOCAL mode):
- ~2 sec/chunk × 500 = ~17 minutes
- Background job (non-blocking)
- Cost: $0.00 (local processing)

**CLOUD Mode** (Gemini 2.5 Flash):
- Single chunk: ~2-3 seconds
- Batch 100: ~3-4 minutes
- Full 500: ~10-12 minutes
- Cost: ~$0.001/chunk = $0.50 for 500 chunks

### Memory Usage

**ChunkStore**:
- Selected chunks: Set (32 bytes + 8 bytes per ID)
- Detailed chunks: Map (24 bytes + ~5KB per chunk)
- 100 chunks selected + 10 detailed = ~50KB total

**AllChunksView**:
- Chunk list: ~100 bytes per chunk × 500 = ~50KB
- Virtuoso only renders visible items = minimal DOM

**Total Memory** (500-chunk document):
- ~100KB for chunk data
- ~50KB for store state
- ~20KB for DOM (virtualized)
- **Total**: ~170KB (very efficient)

---

## Troubleshooting

### Issue: Chunks Not Appearing in List

**Diagnosis**:
```typescript
// Check if chunks exist
const { data } = await supabase
  .from('chunks')
  .select('id, chunk_index')
  .eq('document_id', documentId)
  .eq('is_current', true)

console.log('Chunk count:', data?.length)
```

**Solutions**:
- Verify document processing completed
- Check `is_current = true` (not old chunks)
- Ensure `loadChunkMetadata()` is called

### Issue: Detection Not Working

**Diagnosis**:
```typescript
// Check background_jobs
const { data } = await supabase
  .from('background_jobs')
  .select('*')
  .eq('job_type', 'detect_connections')
  .order('created_at', { ascending: false })
  .limit(5)

console.log('Recent jobs:', data)
```

**Solutions**:
- Verify worker is running (`npm run dev`)
- Check `/tmp/rhizome-worker.log` for errors
- Ensure `sourceChunkIds` parameter passed correctly
- Verify chunks marked as detected after completion

### Issue: Metadata Not Saving

**Diagnosis**:
```typescript
// Check server action logs
console.log('[updateChunkMetadata] Input:', chunkId, metadata)

// Check database update
const { data, error } = await supabase
  .from('chunks')
  .select('themes, importance_score, domain_metadata')
  .eq('id', chunkId)
  .single()

console.log('Current metadata:', data)
console.log('Error:', error)
```

**Solutions**:
- Verify authentication (getCurrentUser())
- Check JSONB fields exist in schema
- Ensure metadata types match schema
- Check path revalidation working

### Issue: Virtualized List Not Scrolling

**Diagnosis**:
- Check parent container has fixed height
- Verify Virtuoso receives data prop
- Check console for React errors

**Solutions**:
```typescript
// Ensure parent has height
<div className="h-full flex flex-col">
  <Virtuoso
    data={filteredChunks}
    style={{ height: '100%' }}  // Critical!
    itemContent={(index, chunk) => <ChunkCard ... />}
  />
</div>
```

---

## Future Enhancements

### Planned Features

1. **Re-Detection Workflow**
   - Mark chunks as "needs re-scan"
   - Re-run detection with updated engine weights
   - Preserve user-validated connections

2. **Smart Detection**
   - AI-powered importance prediction
   - Detect high-value chunks first
   - Auto-skip low-value content

3. **Scheduled Detection**
   - "Detect at night" time-based triggers
   - Background processing during idle
   - Email notification on completion

4. **Per-Engine Detection**
   - UI to run only Semantic or only Thematic
   - A/B test engine effectiveness
   - Cost optimization for cloud mode

5. **Advanced Metadata**
   - AI-assisted metadata generation
   - Bulk metadata editing
   - Metadata templates and presets

6. **Connection Quality Feedback**
   - Rate connection relevance
   - Train connection ranking
   - Filter low-quality connections

### Not Planned (YAGNI)

- Cost estimation calculator (can add if requested)
- Detection history per chunk (complex, low value)
- Materialized views (RPC functions sufficient)
- Parallel engine execution (sequential is fine)
- Concurrent edit conflict resolution (rare edge case)

---

## Related Documentation

- **Processing Pipeline**: `docs/PROCESSING_PIPELINE.md` - Full 10-stage pipeline
- **Connection Engines**: `worker/engines/README.md` - Engine implementation details
- **ECS System**: `docs/ECS_IMPLEMENTATION.md` - Entity-Component-System architecture
- **Background Jobs**: `docs/JOB_SYSTEM.md` - Job system with pause/resume
- **Storage Patterns**: `docs/STORAGE_PATTERNS.md` - Hybrid storage strategy

---

**End of Documentation**

For questions or issues, check `/tmp/rhizome-worker.log` or review the implementation plan at `thoughts/plans/2025-10-24_selective-connection-detection-final.md`.
