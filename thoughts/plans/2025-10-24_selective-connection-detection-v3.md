# Selective Connection Detection V3 - Post-Refactoring Implementation Plan

**Created**: 2025-10-24
**Status**: Planning
**Priority**: High
**Context**: Post worker refactoring (Phases 1-6 complete)

## Overview

Transform connection detection from automatic all-or-nothing to flexible, user-driven progressive enhancement. Users can skip detection during upload, detect connections for individual chunks while reading, batch detect multiple chunks, or detect all undetected chunks from Admin Panel.

**Core Philosophy**: Connection detection is expensive (time + compute). Users should control when and what gets detected, especially with LOCAL mode (zero cost but slow).

## Current Architecture (Post-Refactoring)

### What's Already Built

**Phase 1-6 Refactoring Complete** (see `docs/WORKER_REFACTORING_ANALYSIS.md`):
- ✅ `HandlerJobManager`: Centralized job state management
- ✅ `DocumentProcessingManager`: Document workflow orchestration
- ✅ `ConnectionDetectionManager`: Connection detection/reprocessing workflows
- ✅ `EngineRegistry`: Dynamic engine management
- ✅ `StorageClient`: Unified storage operations
- ✅ Centralized error handling with classification

**Job System**:
- 10 job types with pause/resume capability
- SHA-256 checkpoint validation
- Progress tracking with heartbeat
- Automatic retry with exponential backoff

**Orchestrator V3** (`worker/engines/orchestrator.ts`):
- Registry-based engine selection
- Sequential engine execution
- Progress callbacks
- `targetDocumentIds` filtering (Add New mode)
- **Missing**: `sourceChunkIds` parameter for per-chunk detection

**Database**:
- `chunks` table: 37 fields, comprehensive metadata
- `connections` table: chunk-to-chunk connections with validation
- `background_jobs` table: full job lifecycle tracking
- **Missing**: `connections_detected` tracking on chunks

### Key Discovery: Current Detection Flow

```typescript
// worker/lib/managers/document-processing-manager.ts (line 432)
await this.orchestrateConnections() // ALWAYS runs, no opt-out

// worker/lib/managers/connection-detection-manager.ts (line 49)
const result = await processDocument(documentId, {
  enabledEngines: ['semantic_similarity', 'contradiction_detection', 'thematic_bridge'],
  // ...all 3 engines, ALL chunks, no filtering
})
```

**Problem**: Detection is mandatory and document-level only. No granular control.

## Implementation Plan

### Phase 1: Database Schema (2-3 hours)

**Migration 069: Add chunk-level detection tracking**

```sql
-- Add detection tracking to chunks
ALTER TABLE chunks
  ADD COLUMN connections_detected BOOLEAN DEFAULT false,
  ADD COLUMN connections_detected_at TIMESTAMPTZ,
  ADD COLUMN detection_skipped_reason TEXT; -- 'user_choice', 'error', 'manual_skip'

-- Index for efficient queries
CREATE INDEX idx_chunks_detection_status
  ON chunks(document_id, connections_detected)
  WHERE connections_detected = false;

-- Index for document-level stats
CREATE INDEX idx_chunks_detected_at
  ON chunks(connections_detected_at)
  WHERE connections_detected_at IS NOT NULL;

-- Migration strategy: Mark all existing chunks as detected
-- (Assume they've been processed already)
UPDATE chunks
SET connections_detected = true,
    connections_detected_at = NOW()
WHERE EXISTS (
  SELECT 1 FROM connections
  WHERE source_chunk_id = chunks.id
);

-- Chunks with no connections: mark as undetected (could be isolated chunks)
UPDATE chunks
SET connections_detected = false
WHERE NOT EXISTS (
  SELECT 1 FROM connections
  WHERE source_chunk_id = chunks.id
);
```

**Add RPC functions for stats**:

```sql
-- Get detection stats for a document
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

-- Get undetected chunk IDs for a document
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
```

**Files to create/modify**:
- `supabase/migrations/069_chunk_connection_detection.sql`

### Phase 2: Worker Manager Updates (4-5 hours)

**2A. Extend ConnectionDetectionManager**

Add support for per-chunk detection and marking chunks as detected:

```typescript
// worker/lib/managers/connection-detection-manager.ts

interface DetectOptions {
  documentId: string
  chunkIds?: string[]  // NEW: Optional chunk filtering
  chunkCount?: number
  trigger?: string
  markAsDetected?: boolean  // NEW: Mark chunks after detection (default: true)
}

async detectConnections(options: DetectOptions): Promise<void> {
  const { documentId, chunkIds, trigger, markAsDetected = true } = options

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
  })
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
}

private async getAllChunkIds(documentId: string): Promise<string[]> {
  const { data } = await this.supabase
    .from('chunks')
    .select('id')
    .eq('document_id', documentId)
    .eq('is_current', true)

  return data?.map(c => c.id) || []
}
```

**2B. Update DocumentProcessingManager**

Make connection detection optional:

```typescript
// worker/lib/managers/document-processing-manager.ts

interface ProcessingOptions {
  documentId: string
  userId: string
  sourceType: SourceType
  reviewBeforeChunking?: boolean
  reviewDoclingExtraction?: boolean
  detectConnections?: boolean  // NEW: Default true for backward compatibility
}

async execute(): Promise<void> {
  // ... existing processing stages ...

  // Stage 6: Optional connection detection
  if (this.options.detectConnections !== false) {
    await this.orchestrateConnections()
  } else {
    console.log('[DocumentProcessing] Skipping connection detection (user opted out)')

    // Mark chunks as skipped
    const connectionManager = new ConnectionDetectionManager(this.supabase, this.jobId)
    await connectionManager.markChunksAsSkipped(this.options.documentId, 'user_choice')
  }

  // ... completion ...
}
```

**2C. Update Orchestrator**

Add `sourceChunkIds` filtering:

```typescript
// worker/engines/orchestrator.ts

export interface OrchestratorConfig {
  enabledEngines?: ('semantic_similarity' | 'contradiction_detection' | 'thematic_bridge')[]
  sourceChunkIds?: string[]  // NEW: Filter connections to these source chunks only
  targetDocumentIds?: string[]
  // ... existing fields
}

export async function processDocument(
  documentId: string,
  config: OrchestratorConfig = {}
): Promise<OrchestratorResult> {
  const { sourceChunkIds, targetDocumentIds } = config

  if (sourceChunkIds) {
    console.log(`[Orchestrator] Per-chunk mode: ${sourceChunkIds.length} source chunks`)
  }

  // Pass filters to each engine
  const engineConfig: any = {
    sourceChunkIds,  // NEW: Engines will filter source chunks
    targetDocumentIds,
    // ... existing config
  }

  // Engines handle filtering internally
  // ... rest unchanged
}
```

**2D. Update Engines**

Each engine needs to support `sourceChunkIds` filtering:

```typescript
// worker/engines/semantic-similarity.ts

export async function runSemanticSimilarity(
  documentId: string,
  config: SemanticConfig
): Promise<ChunkConnection[]> {
  const { sourceChunkIds, targetDocumentIds, threshold, maxResultsPerChunk } = config

  // Build query
  let query = supabase
    .from('chunks')
    .select('id, document_id, embedding')
    .eq('document_id', documentId)
    .eq('is_current', true)

  // NEW: Filter to specific source chunks if provided
  if (sourceChunkIds && sourceChunkIds.length > 0) {
    query = query.in('id', sourceChunkIds)
  }

  const { data: sourceChunks } = await query

  // ... rest unchanged (vector similarity logic)
}
```

Similar updates for:
- `worker/engines/contradiction-detection.ts`
- `worker/engines/thematic-bridge.ts`
- `worker/engines/thematic-bridge-qwen.ts`

**Files to modify**:
- `worker/lib/managers/connection-detection-manager.ts`
- `worker/lib/managers/document-processing-manager.ts`
- `worker/engines/orchestrator.ts`
- `worker/engines/semantic-similarity.ts`
- `worker/engines/contradiction-detection.ts`
- `worker/engines/thematic-bridge.ts`
- `worker/engines/thematic-bridge-qwen.ts`

### Phase 3: Upload Flow Checkbox (2-3 hours)

**3A. Update DocumentPreview Component**

Add checkbox to document upload preview:

```typescript
// src/components/admin/tabs/DocumentPreview.tsx (or wherever upload happens)

export function DocumentPreview({ document }: { document: Document }) {
  const [detectConnections, setDetectConnections] = useState(true)  // Default: checked

  const handleStartProcessing = async () => {
    // Create job with detectConnections flag
    await createProcessingJob({
      documentId: document.id,
      sourceType: document.source_type,
      detectConnections  // NEW: Pass to job
    })
  }

  return (
    <div>
      {/* ... existing preview UI ... */}

      <div className="flex items-start gap-3 p-4 border rounded-lg bg-muted/30">
        <Checkbox
          id="detect-connections"
          checked={detectConnections}
          onCheckedChange={setDetectConnections}
        />
        <div className="flex-1">
          <label htmlFor="detect-connections" className="text-sm font-medium cursor-pointer">
            Detect connections after processing
          </label>
          <p className="text-xs text-muted-foreground mt-1">
            Finds semantic similarities, contradictions, and thematic bridges between chunks.
            {processingMode === 'local' && (
              <span className="block mt-1 text-amber-600">
                LOCAL mode: Connection detection adds ~30-60 seconds per document.
              </span>
            )}
            You can detect connections later for individual chunks.
          </p>
        </div>
      </div>

      <Button onClick={handleStartProcessing}>
        Start Processing
      </Button>
    </div>
  )
}
```

**3B. Update Server Action**

Pass `detectConnections` to job:

```typescript
// src/app/actions/documents.ts (or appropriate file)

export async function createProcessingJob(params: {
  documentId: string
  sourceType: string
  detectConnections?: boolean  // NEW
}) {
  const supabase = await createClient()
  const user = await getCurrentUser()

  const { data: job } = await supabase
    .from('background_jobs')
    .insert({
      job_type: 'process_document',
      input_data: {
        document_id: params.documentId,
        source_type: params.sourceType,
        detect_connections: params.detectConnections ?? true  // NEW
      },
      entity_id: params.documentId,
      user_id: user.id,
      status: 'pending'
    })
    .select()
    .single()

  return { success: true, jobId: job.id }
}
```

**3C. Update Handler**

Extract and pass flag to manager:

```typescript
// worker/handlers/process-document.ts

export async function processDocumentHandler(supabase: any, job: any): Promise<void> {
  const {
    document_id,
    source_type = 'pdf',
    review_before_chunking,
    review_docling_extraction,
    detect_connections = true  // NEW: Default true for backward compatibility
  } = job.input_data

  const manager = new DocumentProcessingManager(supabase, job.id, {
    documentId: document_id,
    userId: doc.user_id,
    sourceType: source_type as SourceType,
    reviewBeforeChunking: review_before_chunking,
    reviewDoclingExtraction: review_docling_extraction,
    detectConnections: detect_connections  // NEW
  })

  await manager.execute()
}
```

**Files to create/modify**:
- `src/components/admin/tabs/DocumentPreview.tsx` (or upload component)
- `src/app/actions/documents.ts`
- `worker/handlers/process-document.ts` (already shown in Phase 2)

### Phase 4: Reader Per-Chunk Detection (6-8 hours)

**4A. Update ChunkMetadataIcon Component**

Show detection status and action button:

```typescript
// src/components/reader/ChunkMetadataIcon.tsx

interface ChunkMetadataIconProps {
  chunk: Chunk
  position: 'left' | 'right'
}

export function ChunkMetadataIcon({ chunk, position }: ChunkMetadataIconProps) {
  const [isDetecting, setIsDetecting] = useState(false)

  const handleDetectConnections = async () => {
    setIsDetecting(true)
    try {
      await detectSingleChunkConnections(chunk.id)
      toast.success('Connection detection started')
    } catch (error) {
      toast.error('Failed to start detection')
    } finally {
      setIsDetecting(false)
    }
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className={cn(
            "absolute top-0 w-2 h-full cursor-pointer hover:bg-accent/20",
            position === 'left' ? 'left-0' : 'right-0',
            chunk.connections_detected ? 'bg-green-500/10' : 'bg-amber-500/10'
          )}>
            {/* Visual indicator */}
          </div>
        </TooltipTrigger>
        <TooltipContent side={position === 'left' ? 'right' : 'left'} className="max-w-xs">
          <div className="space-y-2">
            <div className="font-medium text-sm">
              Chunk #{chunk.chunk_index}
            </div>

            {/* Detection Status */}
            {chunk.connections_detected ? (
              <div className="flex items-center gap-2 text-xs text-green-600">
                <CheckCircle2 className="h-3 w-3" />
                <span>Connections detected</span>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-xs text-amber-600">
                <AlertCircle className="h-3 w-3" />
                <span>Not scanned yet</span>
              </div>
            )}

            {/* Connection Count */}
            {chunk.connections_detected && (
              <div className="text-xs text-muted-foreground">
                {chunk.connection_count || 0} connections found
              </div>
            )}

            {/* Action Button */}
            {!chunk.connections_detected && (
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
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
```

**4B. Server Action for Single-Chunk Detection**

```typescript
// src/app/actions/connections.ts

export async function detectSingleChunkConnections(chunkId: string) {
  const user = await getCurrentUser()
  if (!user) throw new Error('Not authenticated')

  const supabase = await createClient()

  // Get chunk's document
  const { data: chunk } = await supabase
    .from('chunks')
    .select('document_id')
    .eq('id', chunkId)
    .single()

  if (!chunk) throw new Error('Chunk not found')

  // Create detect-connections job
  const { data: job } = await supabase
    .from('background_jobs')
    .insert({
      job_type: 'detect_connections',
      input_data: {
        document_id: chunk.document_id,
        chunk_ids: [chunkId],  // NEW: Single-chunk mode
        trigger: 'user_reader'
      },
      entity_id: chunk.document_id,
      user_id: user.id,
      status: 'pending'
    })
    .select()
    .single()

  revalidatePath(`/read/${chunk.document_id}`)

  return { success: true, jobId: job.id }
}
```

**4C. Update Handler**

Extract and pass `chunk_ids`:

```typescript
// worker/handlers/detect-connections.ts

export async function detectConnectionsHandler(supabase: any, job: any): Promise<void> {
  const {
    document_id,
    chunk_ids,  // NEW: Optional chunk filtering
    chunk_count,
    trigger
  } = job.input_data

  const manager = new ConnectionDetectionManager(supabase, job.id)

  await manager.detectConnections({
    documentId: document_id,
    chunkIds: chunk_ids,  // NEW: Pass to manager
    chunkCount: chunk_count,
    trigger
  })
}
```

**Files to create/modify**:
- `src/components/reader/ChunkMetadataIcon.tsx`
- `src/app/actions/connections.ts`
- `worker/handlers/detect-connections.ts` (already shown)

### Phase 5: Chunks Tab Batch Detection (10-12 hours)

**5A. Create Chunk Zustand Store**

State management for chunk selection, detection status, and lazy-loaded details:

```typescript
// src/stores/chunk-store.ts

interface ChunkMetadata {
  // Editable metadata fields
  concepts?: string[]
  title?: string  // User-defined chunk title
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
  themes?: string[]
  importance_score?: number
}

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
  connectionCount: number

  // Quality info
  position_confidence?: string
  metadata_confidence?: string
  chunker_type: string
}

interface ChunkStore {
  // Selection for batch operations
  selectedChunks: Set<string>
  toggleSelection: (chunkId: string) => void
  selectMultiple: (chunkIds: string[]) => void
  clearSelection: () => void

  // Detection status (synced with DB)
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
        ...metadata
      })

      return { detailedChunks: nextDetailed }
    })

    try {
      await updateChunkMetadata(chunkId, metadata)
    } catch (error) {
      console.error('[ChunkStore] Failed to update metadata:', error)
      toast.error('Failed to save metadata')
      // Revert on error - would need original state saved
    }
  }
}))
```

**5B. Create ChunkCard Component (Mode-Based)**

Self-contained chunk card with compact/detailed modes and lazy loading:

```typescript
// src/components/rhizome/chunk-card.tsx

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

  const [isEditing, setIsEditing] = useState(false)
  const [isExpanded, setIsExpanded] = useState(false)
  const [isDetecting, setIsDetecting] = useState(false)

  // Lazy load when switching to detailed mode or editing
  useEffect(() => {
    if ((mode === 'detailed' || isEditing) && !detailedChunk && !isLoading) {
      loadDetailedChunk(chunkId)
    }
  }, [mode, isEditing, chunkId, detailedChunk, isLoading, loadDetailedChunk])

  // Keyboard shortcuts when active
  useEffect(() => {
    if (!isActive) return

    const handleKeyPress = (e: KeyboardEvent) => {
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
        case 'e':
          if (mode === 'detailed') {
            e.preventDefault()
            setIsEditing(!isEditing)
          }
          break
      }
    }

    window.addEventListener('keydown', handleKeyPress)
    return () => window.removeEventListener('keydown', handleKeyPress)
  }, [isActive, connectionsDetected, mode, isEditing, onNavigate, chunkId, showSelection, toggleSelection])

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
                  {connectionCount} connections
                </Badge>
              ) : (
                <Badge variant="destructive" className="text-xs gap-1">
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

  // Detailed mode with full metadata
  return (
    <Card className="p-4">
      {isLoading || !detailedChunk ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : (
        <div className="space-y-4">
          {/* Full content, metadata editor, etc. */}
          <ChunkMetadataEditor
            chunkId={chunkId}
            metadata={detailedChunk}
            isEditing={isEditing}
            onEditChange={setIsEditing}
          />
        </div>
      )}
    </Card>
  )
}
```

**5C. Create AllChunksView with ChunkCard**

Virtualized list using ChunkCard in compact mode:

```typescript
// src/components/sidebar/AllChunksView.tsx

export function AllChunksView({ documentId }: { documentId: string }) {
  const selectedChunks = useChunkStore(state => state.selectedChunks)
  const selectMultiple = useChunkStore(state => state.selectMultiple)
  const clearSelection = useChunkStore(state => state.clearSelection)

  const [chunks, setChunks] = useState<ChunkMetadata[]>([])

  useEffect(() => {
    loadChunkMetadata(documentId).then(setChunks)
  }, [documentId])

  const selectUndetected = () => {
    const undetected = chunks
      .filter(c => !c.connections_detected)
      .map(c => c.id)
    selectMultiple(undetected)
  }

  const handleBatchDetect = async () => {
    const chunkIds = Array.from(selectedChunks)
    await detectBatchChunkConnections(documentId, chunkIds)
    clearSelection()
    toast.success(`Started detection for ${chunkIds.length} chunks`)
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

      {/* Virtualized List with ChunkCard */}
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
            onNavigate={() => navigateToChunk(chunk.id)}
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
          <Button size="sm" variant="secondary" onClick={handleBatchDetect}>
            <Sparkles className="h-4 w-4 mr-2" />
            Detect Connections
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

**5D. Server Actions for Lazy Loading and Metadata**

```typescript
// src/app/actions/chunks.ts (NEW FILE)

export async function loadChunkMetadata(documentId: string) {
  const supabase = await createClient()
  const user = await getCurrentUser()

  const { data: chunks } = await supabase
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

  // Count connections for each chunk
  const chunksWithCounts = await Promise.all(
    chunks.map(async (chunk) => {
      const { count } = await supabase
        .from('connections')
        .select('id', { count: 'exact', head: true })
        .eq('source_chunk_id', chunk.id)

      return {
        ...chunk,
        preview: chunk.content.slice(0, 150) + '...',
        connection_count: count || 0
      }
    })
  )

  return chunksWithCounts
}

export async function loadChunkDetails(chunkId: string) {
  const supabase = await createClient()

  const { data: chunk } = await supabase
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

      -- Metadata fields (JSONB)
      emotional_metadata,
      conceptual_metadata,
      domain_metadata,

      -- Detection info
      connections_detected,
      connections_detected_at,

      -- Quality info
      position_confidence,
      metadata_confidence,
      chunker_type
    `)
    .eq('id', chunkId)
    .single()

  // Count connections
  const { count: connectionCount } = await supabase
    .from('connections')
    .select('id', { count: 'exact', head: true })
    .eq('source_chunk_id', chunkId)

  return {
    ...chunk,
    connectionCount: connectionCount || 0
  }
}

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
  if (!user) throw new Error('Not authenticated')

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

  revalidatePath('/read/[id]', 'page')
  return { success: true }
}

export async function detectBatchChunkConnections(
  documentId: string,
  chunkIds: string[]
) {
  const user = await getCurrentUser()
  if (!user) throw new Error('Not authenticated')

  const supabase = await createClient()

  // Create batch detection job
  const { data: job } = await supabase
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

  revalidatePath(`/read/${documentId}`)

  return { success: true, jobId: job.id, chunkCount: chunkIds.length }
}
```

**5E. ChunkMetadataEditor Component**

Metadata editing form for detailed mode:

```typescript
// src/components/rhizome/chunk-metadata-editor.tsx

interface ChunkMetadataEditorProps {
  chunkId: string
  metadata: ChunkDetailed
  isEditing: boolean
  onEditChange: (editing: boolean) => void
}

export function ChunkMetadataEditor({
  chunkId,
  metadata,
  isEditing,
  onEditChange
}: ChunkMetadataEditorProps) {
  const updateMetadata = useChunkStore(state => state.updateChunkMetadata)

  const [editedMetadata, setEditedMetadata] = useState({
    title: metadata.title || '',
    primaryDomain: metadata.domain_metadata?.primaryDomain || '',
    concepts: metadata.conceptual_metadata?.concepts || [],
    themes: metadata.themes || [],
    importance_score: metadata.importance_score || 0.5
  })

  const handleSave = async () => {
    await updateMetadata(chunkId, {
      domain_metadata: {
        ...metadata.domain_metadata,
        primaryDomain: editedMetadata.primaryDomain
      },
      conceptual_metadata: {
        ...metadata.conceptual_metadata,
        concepts: editedMetadata.concepts
      },
      themes: editedMetadata.themes,
      importance_score: editedMetadata.importance_score
    })
    onEditChange(false)
    toast.success('Metadata updated')
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium">Chunk Metadata</h3>
          <Button
            size="sm"
            onClick={() => onEditChange(!isEditing)}
          >
            {isEditing ? 'Cancel' : 'Edit'}
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Primary Domain */}
        <div>
          <Label>Primary Domain</Label>
          {isEditing ? (
            <Select
              value={editedMetadata.primaryDomain}
              onValueChange={(value) => setEditedMetadata({
                ...editedMetadata,
                primaryDomain: value
              })}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="philosophy">Philosophy</SelectItem>
                <SelectItem value="science">Science</SelectItem>
                <SelectItem value="history">History</SelectItem>
                <SelectItem value="technology">Technology</SelectItem>
                <SelectItem value="literature">Literature</SelectItem>
              </SelectContent>
            </Select>
          ) : (
            <p className="text-sm">{editedMetadata.primaryDomain || 'Unknown'}</p>
          )}
        </div>

        {/* Concepts */}
        <div>
          <Label>Concepts</Label>
          {isEditing ? (
            <TagInput
              tags={editedMetadata.concepts}
              onChange={(concepts) => setEditedMetadata({
                ...editedMetadata,
                concepts
              })}
              placeholder="Add concept..."
            />
          ) : (
            <div className="flex flex-wrap gap-1">
              {editedMetadata.concepts.map(concept => (
                <Badge key={concept} variant="secondary">{concept}</Badge>
              ))}
            </div>
          )}
        </div>

        {/* Themes */}
        <div>
          <Label>Themes</Label>
          {isEditing ? (
            <TagInput
              tags={editedMetadata.themes}
              onChange={(themes) => setEditedMetadata({
                ...editedMetadata,
                themes
              })}
              placeholder="Add theme..."
            />
          ) : (
            <div className="flex flex-wrap gap-1">
              {editedMetadata.themes.map(theme => (
                <Badge key={theme}>{theme}</Badge>
              ))}
            </div>
          )}
        </div>

        {/* Importance Score */}
        <div>
          <Label>Importance ({(editedMetadata.importance_score * 100).toFixed(0)}%)</Label>
          {isEditing ? (
            <Slider
              value={[editedMetadata.importance_score]}
              onValueChange={([value]) => setEditedMetadata({
                ...editedMetadata,
                importance_score: value
              })}
              min={0}
              max={1}
              step={0.05}
            />
          ) : (
            <Progress value={editedMetadata.importance_score * 100} className="mt-2" />
          )}
        </div>

        {isEditing && (
          <Button onClick={handleSave} className="w-full">
            <Save className="h-4 w-4 mr-2" />
            Save Changes
          </Button>
        )}
      </CardContent>
    </Card>
  )
}
```

**5F. Update ChunksTab**

Add AllChunksView as new tab:

```typescript
// src/components/sidebar/ChunksTab.tsx (new or modify existing Quality tab)

export function ChunksTab({ documentId }: { documentId: string }) {
  return (
    <Tabs defaultValue="overview">
      <TabsList>
        <TabsTrigger value="overview">Overview</TabsTrigger>
        <TabsTrigger value="all-chunks">All Chunks</TabsTrigger>
        <TabsTrigger value="quality">Quality</TabsTrigger>
      </TabsList>

      <TabsContent value="overview">
        <ChunkStatsOverview documentId={documentId} />
      </TabsContent>

      <TabsContent value="all-chunks">
        <AllChunksView documentId={documentId} />
      </TabsContent>

      <TabsContent value="quality">
        <ChunkQualityMonitoring documentId={documentId} />
      </TabsContent>
    </Tabs>
  )
}
```

**Files to create**:
- `src/stores/chunk-store.ts` (Zustand store)
- `src/components/rhizome/chunk-card.tsx` (mode-based component)
- `src/components/rhizome/chunk-metadata-editor.tsx` (metadata editing)
- `src/components/sidebar/AllChunksView.tsx` (virtualized list)
- `src/components/sidebar/ChunksTab.tsx` (tab container)
- `src/components/sidebar/ChunkStatsOverview.tsx` (see Phase 6)
- `src/app/actions/chunks.ts` (server actions for lazy loading & metadata)

**Files to modify**:
- `src/app/actions/connections.ts` (add batch detection action)

### Phase 6: Admin Panel Detect All (3-4 hours)

**6A. Create ChunkStatsOverview Component**

Shows detection stats with "Detect All" button:

```typescript
// src/components/sidebar/ChunkStatsOverview.tsx

export function ChunkStatsOverview({ documentId }: { documentId: string }) {
  const [stats, setStats] = useState<ChunkDetectionStats | null>(null)
  const [isDetecting, setIsDetecting] = useState(false)

  useEffect(() => {
    loadChunkDetectionStats(documentId).then(setStats)
  }, [documentId])

  const handleDetectAllUndetected = async () => {
    setIsDetecting(true)
    try {
      await detectAllUndetectedChunks(documentId)
      toast.success('Detection started for all undetected chunks')
    } catch (error) {
      toast.error('Failed to start detection')
    } finally {
      setIsDetecting(false)
    }
  }

  if (!stats) return <div>Loading...</div>

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

**6B. Server Actions**

```typescript
// src/app/actions/connections.ts

export async function loadChunkDetectionStats(documentId: string) {
  const supabase = await createClient()
  const user = await getCurrentUser()

  const { data, error } = await supabase
    .rpc('get_chunk_detection_stats', { doc_id: documentId })
    .single()

  if (error) throw error
  return data
}

export async function detectAllUndetectedChunks(documentId: string) {
  const user = await getCurrentUser()
  if (!user) throw new Error('Not authenticated')

  const supabase = await createClient()

  // Get all undetected chunk IDs
  const { data: chunkIds } = await supabase
    .rpc('get_undetected_chunk_ids', { doc_id: documentId })

  if (!chunkIds || chunkIds.length === 0) {
    return { success: true, message: 'All chunks already detected' }
  }

  // Create batch detection job
  const { data: job } = await supabase
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

  revalidatePath(`/read/${documentId}`)

  return { success: true, jobId: job.id, chunkCount: chunkIds.length }
}
```

**Files to create**:
- `src/components/sidebar/ChunkStatsOverview.tsx`

**Files to modify**:
- `src/app/actions/connections.ts`

### Phase 7: Testing & Polish (4-6 hours)

**7A. Integration Tests**

```typescript
// worker/tests/selective-connection-detection.test.ts

describe('Selective Connection Detection', () => {
  it('should skip detection when opted out during upload', async () => {
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
})
```

**7B. Manual Testing Checklist**

Create comprehensive manual testing guide:

```markdown
# Manual Testing Guide: Selective Connection Detection

## Test 1: Upload with Detection Disabled
1. Upload new PDF document
2. UNCHECK "Detect connections after processing"
3. Wait for processing to complete
4. Verify:
   - Document appears in reader
   - Chunks show "Not scanned yet" in tooltips
   - ChunksTab Overview shows 0% detection rate
   - No connections in Connections tab

## Test 2: Single Chunk Detection
1. Open document from Test 1
2. Hover over any chunk's left margin
3. Click "Detect Connections" in tooltip
4. Verify:
   - ProcessingDock shows progress
   - Chunk marker changes to green after completion
   - Connections appear in RightPanel
   - Only that chunk marked as detected in ChunksTab

## Test 3: Batch Chunk Detection
1. Open RightPanel → ChunksTab → All Chunks
2. Click "Select Undetected" button
3. Verify 10-20 chunks are selected
4. Click "Detect Connections" in floating action bar
5. Verify:
   - ProcessingDock shows progress
   - Selected chunks marked as detected after completion
   - Connections appear in Connections tab

## Test 4: Detect All Undetected
1. Open ChunksTab → Overview
2. Verify stats show remaining undetected chunks
3. Click "Detect All Undetected Chunks"
4. Verify:
   - ProcessingDock shows progress with chunk count
   - Detection rate increases to 100%
   - All chunks show green markers

## Test 5: Upload with Detection Enabled (Default)
1. Upload new PDF document
2. LEAVE "Detect connections after processing" CHECKED
3. Wait for processing to complete
4. Verify:
   - All chunks marked as detected immediately
   - Connections visible in RightPanel
   - ChunksTab shows 100% detection rate

## Test 6: LOCAL Mode Performance
1. Set PROCESSING_MODE=local
2. Upload document with detection disabled
3. Detect single chunk
4. Verify:
   - Detection takes ~2-3 seconds
   - No errors in console
   - Ollama logs show activity
```

**7C. Documentation Updates**

Update key docs with new feature:

- `CLAUDE.md`: Add section on selective connection detection
- `docs/USER_FLOW.md`: Update connection detection workflow
- `worker/README.md`: Document new orchestrator parameters

**Files to create**:
- `worker/tests/selective-connection-detection.test.ts`
- `thoughts/testing/MANUAL_TESTING_GUIDE_SELECTIVE_DETECTION.md`

**Files to modify**:
- `CLAUDE.md`
- `docs/USER_FLOW.md`
- `worker/README.md`

## Implementation Summary

### Total Estimated Time: 31-43 hours

**Phase Breakdown**:
1. Database Schema: 2-3 hours
2. Worker Manager Updates: 4-5 hours
3. Upload Flow Checkbox: 2-3 hours
4. Reader Per-Chunk Detection: 6-8 hours
5. Chunks Tab Batch Detection: 10-12 hours ⬆️ (+2h for ChunkCard + metadata editing)
6. Admin Panel Detect All: 3-4 hours
7. Testing & Polish: 4-6 hours

### Success Criteria

- ✅ User can upload document WITHOUT detecting connections
- ✅ User can detect connections for single chunk while reading
- ✅ User can select and batch-detect multiple chunks
- ✅ User can detect all undetected chunks from Admin Panel
- ✅ ChunksTab shows accurate detection stats
- ✅ AllChunksView handles 500+ chunks smoothly (virtualized)
- ✅ Orchestrator supports per-chunk filtering
- ✅ All 3 engines respect `sourceChunkIds` filter
- ✅ ProcessingDock shows progress for detection jobs
- ✅ No performance regressions in document processing

### Key Benefits

**For Users**:
- Control over expensive operations (especially LOCAL mode)
- Read documents immediately without waiting for detection
- Selective detection for interesting chunks only
- Visual feedback on detection status

**For Development**:
- Leverages existing refactored patterns (managers, registry)
- Minimal changes to core architecture
- Incremental rollout (phase by phase)
- Backward compatible (default behavior unchanged)

### Architecture Decisions

**Why Chunk-Level Tracking?**
- Granular control matches user mental model
- Supports partial detection workflows
- Enables accurate progress tracking
- Future-proof for per-engine tracking

**Why Keep Default to True?**
- Backward compatibility for existing workflows
- Most users want automatic detection
- Power users will opt-out consciously

**Why Manager Pattern?**
- Already established in codebase
- Clean separation of concerns
- Easy to test and maintain

**Why Not Parallel Engines?**
- Orchestrator currently sequential
- Would require significant refactoring
- Out of scope for this feature
- Can optimize later if needed

### Risks & Mitigations

**Risk**: Incomplete detection makes connections misleading
**Mitigation**: Clear visual indicators (amber markers, "Not scanned yet")

**Risk**: Users forget to detect connections
**Mitigation**: Default to auto-detect, make opt-out conscious choice

**Risk**: Per-chunk detection creates too many jobs
**Mitigation**: Batch jobs for multiple chunks, queue system handles it

**Risk**: Engine filtering logic becomes complex
**Mitigation**: Simple `IN` clause filtering, engines handle internally

### Key Architectural Decisions

**ChunkCard Component Pattern** (NEW):
- **Mode-based rendering**: `'compact'` for lists, `'detailed'` for focused view
- **Lazy loading**: Full metadata only loads when switching to detailed mode or editing
- **Zustand integration**: Selection, detection status, and detailed chunks in store
- **Keyboard shortcuts**: `d` (detect), `j` (jump), `space` (select), `e` (edit in detailed mode)
- **Optimistic updates**: Metadata changes update store immediately, sync to DB
- **Self-contained**: No prop drilling, handles own server actions

**Metadata Editing Scope**:
- ✅ Edit JSONB fields: `domain_metadata`, `conceptual_metadata`, `emotional_metadata`
- ✅ Edit scalar fields: `themes`, `importance_score`
- ✅ User-defined titles and concepts
- ❌ Content editing (chunks derive from markdown, not editable)
- ❌ Structural changes (splitting/merging handled separately)

### Future Enhancements (Out of Scope)

**Connection Detection**:
- Per-engine detection (run only Semantic Similarity)
- Scheduled detection (detect at night)
- Smart detection (detect high-importance chunks first)
- Cost estimation UI (show $ before cloud detection)
- Detection history (show when chunk was last detected)
- Re-detection (mark chunk as needing re-scan)

**Metadata Editing** (Phase 5 foundation enables):
- Bulk metadata editing (apply domain to multiple chunks)
- AI-assisted concept extraction
- Metadata validation and suggestions
- Import/export metadata schemas
- Metadata templates for common domains

## Notes

- **Personal Tool**: Optimize for single-user UX, not multi-tenant scale
- **LOCAL Mode is Primary**: Zero cost trumps speed for most workflows
- **Incremental Rollout**: Ship phases 1-3 first, validate, then 4-6
- **No Breaking Changes**: Default behavior stays the same (auto-detect on upload)
- **Testing First**: Phase 1-2 fully tested before moving to UI phases

---

**Remember**: This is a progressive enhancement. The default behavior (auto-detect) remains unchanged for backward compatibility. Power users get granular control.
