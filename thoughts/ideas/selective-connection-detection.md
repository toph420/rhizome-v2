# Selective Connection Detection & Unified Chunks Management

**Created**: 2025-10-18
**Status**: Planning
**Priority**: High

## Overview

Transform connection detection from an automatic, all-or-nothing process into a flexible, user-driven progressive enhancement system. Simultaneously unify chunk-level management (quality monitoring + connection detection) into a single comprehensive interface.

## Current State vs. Desired State

### Current (Problematic) Flow
```
User uploads 3 documents
→ Job 1: Process Doc A (extract/chunk/embed)
→ Job 2: Process Doc B (extract/chunk/embed)
→ Job 3: Process Doc C (extract/chunk/embed)
→ [Wait for ALL to complete]
→ Job 4: Detect Connections for A, B, C together (all chunks, no choice)
```

**Problems:**
1. Can't explore Book 1 connections until Books 2 & 3 finish processing
2. Forced to detect connections for ALL chunks (expensive, slow)
3. No granular control over which chunks get connection detection
4. Batch timing creates poor UX for multi-document uploads

### Desired (Flexible) Flow
```
User uploads 3 documents (checkbox: "Detect connections" - default checked)
→ Job 1: Process Doc A → on completion → trigger Job 4 (if enabled)
→ Job 2: Process Doc B → on completion → trigger Job 5 (if enabled)
→ Job 3: Process Doc C → on completion → trigger Job 6 (if enabled)
→ Job 4: Detect Connections for Doc A (all chunks OR skip)
→ Job 5: Detect Connections for Doc B (runs in parallel)
→ Job 6: Detect Connections for Doc C (runs in parallel)

PLUS: User can selectively detect on per-chunk basis while reading
```

**Benefits:**
- Faster initial processing (skip expensive connection detection)
- Explore Book 1 while Book 2 still processing
- Per-document job isolation (failures don't cascade)
- User control: detect all, detect none, or detect selectively
- Natural reading workflow: "this is interesting, what connects?"

## Core Architectural Changes

### 1. Database Schema Changes

**Migration 053: Add chunk-level detection tracking**

```sql
-- Track connection detection status per chunk
ALTER TABLE chunks
  ADD COLUMN connections_detected BOOLEAN DEFAULT false,
  ADD COLUMN connections_detected_at TIMESTAMP WITH TIME ZONE;

-- Create index for efficient queries
CREATE INDEX idx_chunks_connections_detected
  ON chunks(document_id, connections_detected);

-- Migration strategy: Nuclear option (treat all existing as undetected)
-- Existing docs are test data, user can selectively re-detect
UPDATE chunks SET connections_detected = false;

-- Optional: Add cached stats to documents for performance
ALTER TABLE documents
  ADD COLUMN connections_detected_count INTEGER DEFAULT 0,
  ADD COLUMN total_chunks_count INTEGER DEFAULT 0;

-- Function to update document stats (trigger or manual)
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
```

### 2. Job System Changes

**Current Job Flow Issues:**
- Batched connection detection across multiple documents
- No per-document lifecycle
- Poor parallelization

**New Job Flow Architecture:**

```typescript
// worker/handlers/process-document.ts
async function handleProcessDocument(job: BackgroundJob) {
  const { documentId, detectConnections = true } = job.metadata

  // Standard processing: Extract → Chunk → Embed
  await extractDocument(documentId)
  await chunkDocument(documentId)
  await embedChunks(documentId)

  // Mark job complete
  await updateJobStatus(job.id, 'completed')

  // Auto-trigger connection detection if enabled
  if (detectConnections) {
    await createConnectionDetectionJob({
      documentId,
      mode: 'full', // Detect all chunks
      triggeredBy: 'auto'
    })
  }

  // Set all chunks to connections_detected = false if skipped
  if (!detectConnections) {
    await markChunksAsUndetected(documentId)
  }
}

// New job type: detect-connections
async function handleDetectConnections(job: BackgroundJob) {
  const {
    documentId,
    chunkIds = null, // If null, detect all undetected chunks
    mode = 'full' // 'full' | 'selective' | 'single'
  } = job.metadata

  // Get chunks to process
  const chunks = chunkIds
    ? await getChunksByIds(chunkIds)
    : await getUndetectedChunks(documentId)

  // Run orchestrator for each chunk
  for (const chunk of chunks) {
    await orchestrator.processChunk(chunk)

    // Mark as detected
    await updateChunk(chunk.id, {
      connections_detected: true,
      connections_detected_at: new Date()
    })

    // Update progress
    await updateJobProgress(job.id, {
      current: chunks.indexOf(chunk) + 1,
      total: chunks.length,
      details: `Detected connections for chunk ${chunk.sequence_number}`
    })
  }
}
```

**Job Creation Points:**

1. **During Upload** (optional)
   - User checkbox: "Detect connections after processing" (default: checked)
   - Creates processing job with `detectConnections: true/false`

2. **Admin Panel Batch** (manual)
   - Button: "Detect All Undetected Chunks"
   - Creates detect-connections job with `mode: 'full'`

3. **Per-Chunk in Reader** (ad-hoc)
   - Button: "Detect Connections" on individual chunk
   - Creates detect-connections job with `chunkIds: [specificChunkId]`
   - OR runs immediately without job queue for instant feedback

### 3. UI Component Architecture

#### A. Unified Chunks Tab (RightPanel)

**Merge Quality tab into comprehensive Chunks tab**

```typescript
// src/components/sidebar/chunks-tab.tsx
interface ChunksTabProps {
  documentId: string
  currentChunkId?: string // For synced scrolling
}

export function ChunksTab({ documentId, currentChunkId }: ChunksTabProps) {
  return (
    <Tabs defaultValue="overview">
      <TabsList>
        <TabsTrigger value="overview">Overview</TabsTrigger>
        <TabsTrigger value="all-chunks">All Chunks</TabsTrigger>
        <TabsTrigger value="quality">Quality</TabsTrigger>
      </TabsList>

      {/* Overview: Stats and batch actions */}
      <TabsContent value="overview">
        <ChunkStatsOverview documentId={documentId} />
      </TabsContent>

      {/* All Chunks: Virtualized accordion list */}
      <TabsContent value="all-chunks">
        <AllChunksView
          documentId={documentId}
          currentChunkId={currentChunkId}
        />
      </TabsContent>

      {/* Quality: Chonkie confidence monitoring (existing) */}
      <TabsContent value="quality">
        <ChunkQualityMonitoring documentId={documentId} />
      </TabsContent>
    </Tabs>
  )
}
```

#### B. Chunk Stats Overview

```typescript
// src/components/sidebar/chunk-stats-overview.tsx
interface ChunkStats {
  total: number
  detected: number
  undetected: number
  avgConnectionsPerChunk: number
  topConnectedChunk: { id: string; count: number }
}

export function ChunkStatsOverview({ documentId }: { documentId: string }) {
  const { data: stats } = useQuery({
    queryKey: ['chunk-stats', documentId],
    queryFn: () => getChunkStats(documentId)
  })

  return (
    <div className="space-y-4">
      {/* Stats Cards */}
      <div className="grid grid-cols-2 gap-3">
        <Card>
          <CardHeader>
            <CardTitle>Detection Progress</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              {stats.detected} / {stats.total}
            </div>
            <Progress value={(stats.detected / stats.total) * 100} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Avg Connections</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              {stats.avgConnectionsPerChunk.toFixed(1)}
            </div>
            <p className="text-sm text-muted-foreground">per chunk</p>
          </CardContent>
        </Card>
      </div>

      {/* Batch Actions */}
      <Card>
        <CardHeader>
          <CardTitle>Batch Actions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Button
            onClick={() => detectAllUndetected(documentId)}
            disabled={stats.undetected === 0}
            className="w-full"
          >
            Detect All Undetected Chunks
            <Badge variant="secondary" className="ml-2">
              {stats.undetected}
            </Badge>
          </Button>

          <p className="text-xs text-muted-foreground">
            Estimated time: ~{estimateDetectionTime(stats.undetected)}
            {/* LOCAL mode: no cost, just time estimate */}
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
```

#### C. All Chunks View (Virtualized + Lazy Load)

```typescript
// src/components/sidebar/all-chunks-view.tsx
import { Virtuoso } from 'react-virtuoso'

interface ChunkMetadata {
  id: string
  sequence_number: number
  connections_detected: boolean
  connection_count: number
  preview: string // First 100 chars
  heading_path: string[]
  word_count: number
}

export function AllChunksView({
  documentId,
  currentChunkId
}: {
  documentId: string
  currentChunkId?: string
}) {
  const virtuosoRef = useRef<VirtuosoHandle>(null)

  // Load lightweight metadata for all chunks
  const { data: chunksMetadata } = useQuery({
    queryKey: ['chunks-metadata', documentId],
    queryFn: () => getChunksMetadata(documentId)
  })

  // Synced scrolling: scroll to current chunk when it changes
  useEffect(() => {
    if (currentChunkId && chunksMetadata) {
      const index = chunksMetadata.findIndex(c => c.id === currentChunkId)
      if (index !== -1) {
        virtuosoRef.current?.scrollToIndex({
          index,
          align: 'center',
          behavior: 'smooth'
        })
      }
    }
  }, [currentChunkId, chunksMetadata])

  return (
    <Virtuoso
      ref={virtuosoRef}
      data={chunksMetadata}
      itemContent={(index, chunk) => (
        <ChunkAccordionItem
          key={chunk.id}
          chunk={chunk}
          isActive={chunk.id === currentChunkId}
        />
      )}
      style={{ height: '600px' }}
    />
  )
}
```

#### D. Chunk Accordion Item (Lazy Load on Expand)

```typescript
// src/components/sidebar/chunk-accordion-item.tsx
export function ChunkAccordionItem({
  chunk,
  isActive
}: {
  chunk: ChunkMetadata
  isActive: boolean
}) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [fullContent, setFullContent] = useState<string | null>(null)

  // Lazy load full content on expand
  const loadFullContent = async () => {
    if (!fullContent) {
      const content = await getChunkContent(chunk.id)
      setFullContent(content)
    }
  }

  return (
    <Collapsible
      open={isExpanded}
      onOpenChange={(open) => {
        setIsExpanded(open)
        if (open) loadFullContent()
      }}
      className={cn(
        "border-b",
        isActive && "bg-accent/50 border-l-4 border-l-primary"
      )}
    >
      <CollapsibleTrigger className="w-full p-3 hover:bg-accent/30">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 text-left">
            <div className="flex items-center gap-2 mb-1">
              <Badge variant="outline" className="text-xs">
                #{chunk.sequence_number}
              </Badge>

              {/* Detection Status */}
              {chunk.connections_detected ? (
                <Badge variant="secondary" className="text-xs gap-1">
                  <CheckCircle2 className="h-3 w-3" />
                  {chunk.connection_count} connections
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
          </div>

          <ChevronDown className={cn(
            "h-4 w-4 shrink-0 transition-transform",
            isExpanded && "rotate-180"
          )} />
        </div>
      </CollapsibleTrigger>

      <CollapsibleContent className="p-3 pt-0">
        {/* Full Content (lazy loaded) */}
        {fullContent ? (
          <div className="space-y-3">
            <div className="prose prose-sm dark:prose-invert max-w-none">
              <ReactMarkdown>{fullContent}</ReactMarkdown>
            </div>

            {/* Actions */}
            <div className="flex gap-2">
              {!chunk.connections_detected && (
                <Button
                  size="sm"
                  onClick={() => detectChunkConnections(chunk.id)}
                >
                  <Sparkles className="h-4 w-4 mr-2" />
                  Detect Connections
                </Button>
              )}

              <Button
                size="sm"
                variant="outline"
                onClick={() => scrollToChunk(chunk.id)}
              >
                <Eye className="h-4 w-4 mr-2" />
                View in Reader
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="h-4 w-4 animate-spin" />
          </div>
        )}
      </CollapsibleContent>
    </Collapsible>
  )
}
```

#### E. Upload Flow Checkbox

```typescript
// src/components/upload/upload-form.tsx (or wherever upload happens)
export function UploadForm() {
  const [detectConnections, setDetectConnections] = useState(true) // Default: checked

  const handleUpload = async (file: File) => {
    const formData = new FormData()
    formData.append('file', file)
    formData.append('detectConnections', String(detectConnections))

    await uploadDocument(formData)
  }

  return (
    <form onSubmit={handleUpload}>
      {/* File input, etc. */}

      <div className="flex items-center space-x-2">
        <Checkbox
          id="detect-connections"
          checked={detectConnections}
          onCheckedChange={setDetectConnections}
        />
        <label htmlFor="detect-connections" className="text-sm">
          Detect connections after processing
          <p className="text-xs text-muted-foreground">
            You can detect connections later for individual chunks
          </p>
        </label>
      </div>

      <Button type="submit">Upload</Button>
    </form>
  )
}
```

#### F. Left Margin Tooltip Enhancement

```typescript
// src/components/reader/chunk-marker.tsx (existing component)
export function ChunkMarker({ chunk }: { chunk: Chunk }) {
  const { data: connectionCount } = useQuery({
    queryKey: ['chunk-connections', chunk.id],
    queryFn: () => getConnectionCount(chunk.id)
  })

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="chunk-marker">
            {/* Existing marker UI */}
          </div>
        </TooltipTrigger>
        <TooltipContent side="right">
          <div className="space-y-1">
            <div className="font-medium">Chunk #{chunk.sequence_number}</div>
            <div className="text-xs text-muted-foreground">
              {chunk.word_count} words
            </div>

            {/* Detection Status */}
            {chunk.connections_detected ? (
              <>
                <div className="flex items-center gap-1 text-xs text-green-600">
                  <CheckCircle2 className="h-3 w-3" />
                  {connectionCount} connections found
                </div>
                <div className="text-xs text-muted-foreground">
                  Detected {formatDistanceToNow(chunk.connections_detected_at)}
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center gap-1 text-xs text-yellow-600">
                  <AlertCircle className="h-3 w-3" />
                  Not scanned yet
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 text-xs mt-1"
                  onClick={() => detectChunkConnections(chunk.id)}
                >
                  Detect Connections
                </Button>
              </>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
```

### 4. Synced Scrolling Implementation

**Bidirectional sync between Reader and Chunks Tab:**

```typescript
// src/stores/reader-store.ts (or use existing store)
interface ReaderStore {
  currentChunkId: string | null
  setCurrentChunkId: (id: string | null) => void
  scrollSource: 'reader' | 'chunks-tab' | null
  setScrollSource: (source: 'reader' | 'chunks-tab' | null) => void
}

export const useReaderStore = create<ReaderStore>((set) => ({
  currentChunkId: null,
  setCurrentChunkId: (id) => set({ currentChunkId: id }),
  scrollSource: null,
  setScrollSource: (source) => set({ scrollSource: source })
}))
```

```typescript
// src/components/reader/virtualized-reader.tsx
export function VirtualizedReader({ documentId }: { documentId: string }) {
  const virtuosoRef = useRef<VirtuosoHandle>(null)
  const { currentChunkId, setCurrentChunkId, scrollSource, setScrollSource } = useReaderStore()

  // Track which chunk is currently in viewport
  const handleVisibleRangeChange = useCallback((range: ListRange) => {
    const visibleChunks = chunks.slice(range.startIndex, range.endIndex + 1)
    const centerChunk = visibleChunks[Math.floor(visibleChunks.length / 2)]

    // Only update if we're the scroll source (prevent infinite loops)
    if (scrollSource !== 'chunks-tab' && centerChunk?.id !== currentChunkId) {
      setCurrentChunkId(centerChunk?.id || null)
      setScrollSource('reader')
    }
  }, [chunks, scrollSource, currentChunkId])

  // Scroll to chunk when triggered from Chunks Tab
  useEffect(() => {
    if (scrollSource === 'chunks-tab' && currentChunkId) {
      const index = chunks.findIndex(c => c.id === currentChunkId)
      if (index !== -1) {
        virtuosoRef.current?.scrollToIndex({
          index,
          align: 'center',
          behavior: 'smooth'
        })
      }
    }
  }, [currentChunkId, scrollSource, chunks])

  return (
    <Virtuoso
      ref={virtuosoRef}
      data={chunks}
      rangeChanged={handleVisibleRangeChange}
      itemContent={(index, chunk) => (
        <ChunkBlock chunk={chunk} />
      )}
    />
  )
}
```

```typescript
// src/components/sidebar/all-chunks-view.tsx (updated)
export function AllChunksView({ documentId }: { documentId: string }) {
  const virtuosoRef = useRef<VirtuosoHandle>(null)
  const { currentChunkId, setCurrentChunkId, scrollSource, setScrollSource } = useReaderStore()

  // Scroll to current chunk when reader scrolls
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

  // Handle manual scroll in chunks tab
  const handleChunkClick = (chunkId: string) => {
    setCurrentChunkId(chunkId)
    setScrollSource('chunks-tab')
  }

  return (
    <Virtuoso
      ref={virtuosoRef}
      data={chunksMetadata}
      itemContent={(index, chunk) => (
        <ChunkAccordionItem
          chunk={chunk}
          isActive={chunk.id === currentChunkId}
          onClick={() => handleChunkClick(chunk.id)}
        />
      )}
    />
  )
}
```

**Scroll sync behavior:**
- User scrolls in Reader → currentChunkId updates → Chunks Tab scrolls to match
- User clicks chunk in Chunks Tab → currentChunkId updates → Reader scrolls to match
- Highlighted/active state shows which chunk is synced
- Smooth scroll animations for better UX

## Server Actions

```typescript
// src/app/actions/connections.ts
'use server'

import { createECS } from '@/lib/ecs'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function detectChunkConnections(chunkId: string) {
  const supabase = await createClient()

  // Create detect-connections job
  const { data: job } = await supabase
    .from('background_jobs')
    .insert({
      job_type: 'detect-connections',
      status: 'pending',
      metadata: {
        chunkIds: [chunkId],
        mode: 'single',
        triggeredBy: 'user'
      }
    })
    .select()
    .single()

  revalidatePath(`/read/[id]`, 'page')

  return { success: true, jobId: job.id }
}

export async function detectAllUndetectedChunks(documentId: string) {
  const supabase = await createClient()

  // Get undetected chunk count
  const { count } = await supabase
    .from('chunks')
    .select('*', { count: 'exact', head: true })
    .eq('document_id', documentId)
    .eq('connections_detected', false)

  // Create batch detect job
  const { data: job } = await supabase
    .from('background_jobs')
    .insert({
      job_type: 'detect-connections',
      status: 'pending',
      metadata: {
        documentId,
        mode: 'full',
        triggeredBy: 'user',
        estimatedChunks: count
      }
    })
    .select()
    .single()

  revalidatePath(`/read/${documentId}`)

  return { success: true, jobId: job.id, chunkCount: count }
}

export async function getChunkStats(documentId: string) {
  const supabase = await createClient()

  const { data: stats } = await supabase.rpc('get_chunk_stats', {
    doc_id: documentId
  })

  return stats
}

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
    .order('sequence_number')

  return chunks?.map(chunk => ({
    ...chunk,
    preview: chunk.content.slice(0, 100) + '...',
    connection_count: 0 // TODO: Add join to count connections
  }))
}

export async function getChunkContent(chunkId: string) {
  const supabase = await createClient()

  const { data: chunk } = await supabase
    .from('chunks')
    .select('content')
    .eq('id', chunkId)
    .single()

  return chunk?.content || ''
}
```

## Database Helper Functions

```sql
-- Get chunk statistics for a document
CREATE OR REPLACE FUNCTION get_chunk_stats(doc_id uuid)
RETURNS TABLE (
  total bigint,
  detected bigint,
  undetected bigint,
  avg_connections_per_chunk numeric
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*)::bigint as total,
    COUNT(*) FILTER (WHERE connections_detected = true)::bigint as detected,
    COUNT(*) FILTER (WHERE connections_detected = false)::bigint as undetected,
    COALESCE(AVG(connection_counts.count), 0) as avg_connections_per_chunk
  FROM chunks c
  LEFT JOIN (
    SELECT source_chunk_id, COUNT(*) as count
    FROM connections
    GROUP BY source_chunk_id
  ) connection_counts ON connection_counts.source_chunk_id = c.id
  WHERE c.document_id = doc_id;
END;
$$ LANGUAGE plpgsql;
```

## Implementation Phases

### Phase 1: Database & Job System (Foundation)
**Priority**: Critical
**Estimated Time**: 4-6 hours

- [ ] Create migration 053: Add `connections_detected` columns to chunks table
- [ ] Run migration, mark all existing chunks as undetected
- [ ] Update document processing handler to accept `detectConnections` parameter
- [ ] Modify job creation to trigger per-document connection jobs (not batched)
- [ ] Update connection detection handler to accept `chunkIds` parameter (null = all undetected)
- [ ] Add progress tracking for connection detection jobs
- [ ] Test: Upload 3 documents, verify independent connection jobs created
- [ ] Test: Upload with `detectConnections: false`, verify chunks marked undetected

**Files to modify:**
- `supabase/migrations/053_chunk_connection_detection.sql`
- `worker/handlers/process-document.ts`
- `worker/handlers/detect-connections.ts` (new or modify existing)
- `worker/types/job-schemas.ts`

### Phase 2: Upload Flow & Server Actions (User Control)
**Priority**: High
**Estimated Time**: 3-4 hours

- [ ] Add checkbox to upload form: "Detect connections after processing"
- [ ] Pass `detectConnections` parameter to upload server action
- [ ] Create server actions in `src/app/actions/connections.ts`:
  - `detectChunkConnections(chunkId)`
  - `detectAllUndetectedChunks(documentId)`
  - `getChunkStats(documentId)`
  - `getChunksMetadata(documentId)`
  - `getChunkContent(chunkId)`
- [ ] Create database helper function: `get_chunk_stats(doc_id)`
- [ ] Test: Upload with checkbox unchecked, verify no connection job created
- [ ] Test: Call server actions, verify correct job creation

**Files to create/modify:**
- `src/app/actions/connections.ts` (new)
- `src/components/upload/upload-form.tsx` (or wherever upload happens)
- `supabase/migrations/053_chunk_connection_detection.sql` (add helper functions)

### Phase 3: Unified Chunks Tab (UI Foundation)
**Priority**: High
**Estimated Time**: 6-8 hours

- [ ] Create new Chunks tab component structure
- [ ] Move existing Quality monitoring into Chunks tab as sub-tab
- [ ] Create Overview sub-tab with stats cards
- [ ] Add "Detect All Undetected Chunks" button with progress feedback
- [ ] Update RightPanel to replace Quality tab with Chunks tab
- [ ] Test: View stats, verify correct counts
- [ ] Test: Click batch detect, verify job creation and progress

**Files to create/modify:**
- `src/components/sidebar/chunks-tab.tsx` (new)
- `src/components/sidebar/chunk-stats-overview.tsx` (new)
- `src/components/sidebar/chunk-quality-monitoring.tsx` (move from quality-tab.tsx)
- `src/components/sidebar/right-panel.tsx` (update tab structure)

### Phase 4: All Chunks View (Virtualized List)
**Priority**: High
**Estimated Time**: 8-10 hours

- [ ] Create AllChunksView component with Virtuoso
- [ ] Implement lightweight metadata loading strategy
- [ ] Create ChunkAccordionItem component
- [ ] Implement lazy loading for full chunk content on expand
- [ ] Add detection status badges and visual indicators
- [ ] Add "Detect Connections" button per chunk
- [ ] Add "View in Reader" button per chunk
- [ ] Test: Load document with 500+ chunks, verify smooth scrolling
- [ ] Test: Expand chunk, verify content loads on demand
- [ ] Test: Click detect on single chunk, verify job creation

**Files to create:**
- `src/components/sidebar/all-chunks-view.tsx`
- `src/components/sidebar/chunk-accordion-item.tsx`

### Phase 5: Synced Scrolling (Enhanced UX)
**Priority**: Medium
**Estimated Time**: 4-6 hours

- [ ] Create or extend reader store with sync state
- [ ] Add scroll tracking to VirtualizedReader
- [ ] Update currentChunkId on reader scroll
- [ ] Add scroll-to-chunk in AllChunksView when reader scrolls
- [ ] Add scroll-to-chunk in Reader when chunk clicked in tab
- [ ] Add highlighted/active state for synced chunk
- [ ] Prevent infinite scroll loops with source tracking
- [ ] Test: Scroll in reader, verify chunks tab follows
- [ ] Test: Click chunk in tab, verify reader scrolls to match
- [ ] Test: No performance issues with rapid scrolling

**Files to modify:**
- `src/stores/reader-store.ts` (or create if doesn't exist)
- `src/components/reader/virtualized-reader.tsx`
- `src/components/sidebar/all-chunks-view.tsx`
- `src/components/sidebar/chunk-accordion-item.tsx`

### Phase 6: Left Margin Tooltip (Polish)
**Priority**: Low
**Estimated Time**: 2-3 hours

- [ ] Update ChunkMarker component to show detection status
- [ ] Add connection count to tooltip
- [ ] Add "Detect Connections" button to tooltip for undetected chunks
- [ ] Add timestamp for when detection occurred
- [ ] Test: Hover over detected chunk, verify correct info
- [ ] Test: Hover over undetected chunk, verify button works
- [ ] Test: Click detect from tooltip, verify job creation

**Files to modify:**
- `src/components/reader/chunk-marker.tsx` (or wherever left margin tooltips live)

### Phase 7: Testing & Polish (Quality Assurance)
**Priority**: High
**Estimated Time**: 4-6 hours

- [ ] End-to-end test: Full workflow from upload to detection
- [ ] Performance test: Large document (500+ chunks) with synced scrolling
- [ ] Edge cases: Empty documents, single chunk documents
- [ ] Error handling: Failed detection jobs, network errors
- [ ] UI polish: Loading states, animations, feedback
- [ ] Documentation: Update CLAUDE.md with new Chunks tab structure
- [ ] Update JOB_SYSTEM.md with connection detection job details

**Files to create/modify:**
- `docs/CLAUDE.md`
- `docs/JOB_SYSTEM.md`
- Add integration tests as needed

## Total Estimated Time: 31-43 hours

## Technical Decisions & Rationale

### Why Chunk-Level Tracking?
- **Granular control**: User can detect some chunks, skip others
- **Better analytics**: "487 of 1,234 chunks detected"
- **Natural fit**: Per-chunk detection requires per-chunk status
- **Flexible**: Can aggregate to document-level if needed

### Why Merge Quality into Chunks Tab?
- **Unified interface**: All chunk management in one place
- **Related functionality**: Quality metrics + connection detection both chunk-level
- **Cleaner UX**: Fewer top-level tabs, better organization
- **Room to grow**: Can add more chunk-level features (editing, merging, etc.)

### Why Virtualized + Lazy Load?
- **Performance**: 500+ chunks would be heavy to render all at once
- **UX**: User sees all chunks instantly (metadata is lightweight)
- **Efficiency**: Full content loads only when needed
- **Scalability**: Handles even 1000+ chunk documents smoothly

### Why LOCAL Mode Default?
- **Cost**: Completely free (no API costs)
- **Privacy**: All processing happens locally
- **Speed**: Good enough for per-chunk workflow (user is patient)
- **Control**: User decides which chunks are worth the time investment

### Why Synced Scrolling?
- **Context**: User can see chunk position in document structure
- **Navigation**: Click chunk in tab → jump to reading position
- **Awareness**: Always know where you are in the document
- **Natural**: Matches user mental model of "this chunk in this place"

## Success Criteria

- [ ] Can upload document WITHOUT detecting connections
- [ ] Can batch-detect all undetected chunks from Admin Panel
- [ ] Can detect connections for single chunk while reading
- [ ] Chunks Tab shows accurate stats (detected/undetected counts)
- [ ] All Chunks view loads 500+ chunks smoothly
- [ ] Synced scrolling works bidirectionally with no lag
- [ ] Per-document connection jobs run in parallel after processing
- [ ] No performance regressions in reader or job system
- [ ] Clear visual feedback for detection status everywhere

## Future Enhancements (Out of Scope)

- Cost estimation for cloud mode connection detection
- Bulk chunk actions (detect multiple selected chunks)
- Connection quality scoring (rank connections by relevance)
- Chunk editing/merging from Chunks Tab
- Export/import connection detection status
- Analytics dashboard for connection patterns
- Keyboard shortcuts for chunk navigation

## Notes

- This is a **personal tool** - optimize for single-user UX, not multi-tenant scale
- LOCAL mode is primary use case - cloud mode is for A/B testing
- Existing test documents will show as "undetected" - this is intentional
- Synced scrolling should be smooth but doesn't need to be perfect
- Focus on making per-chunk detection feel responsive and natural
