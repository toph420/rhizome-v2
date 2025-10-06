# Pre-Chunking Markdown Review System

## Problem Statement

Current workflow forces post-processing edits which trigger complex recovery:
- Edit markdown AFTER chunking → Must recover 99+ annotations
- Edit markdown AFTER connections → Must remap all connections
- AI chunking failures → 134 fallback chunks lose metadata
- High complexity, potential data loss, long processing times

**Solution**: Insert manual review step AFTER extraction, BEFORE chunking.

---

## Proposed Workflow

### Current (Post-Processing - Complex)
```
Upload → Extract → Chunk → Embed → Connections → [USER EDITS] → Reprocess
                                                        ↓
                                        Recover annotations (fuzzy matching)
                                        Remap connections (chunk ID mapping)
                                        Risk: Data loss, ~10-30min processing
```

### Proposed (Pre-Processing - Simple)
```
Upload → Extract → [REVIEW PAUSE] → User fixes in Obsidian → Continue → Chunk → Embed → Connections
                         ↓                                        ↓
                   (auto-export)                          (simple sync, no recovery)
                                                          Risk: None, ~2-5min processing
```

---

## Architecture Design

### Status Flow

**New Document Status**: `awaiting_manual_review`

```
Document Processing States:
├─ pending → Initial upload
├─ processing → AI extraction running
├─ awaiting_manual_review → Markdown extracted, paused for user review (NEW!)
├─ processing → Chunking resumed after review
├─ completed → Full pipeline finished
└─ failed → Error occurred
```

### Settings Configuration

Add to `user_settings.obsidian_settings`:

```typescript
{
  vaultName: string
  vaultPath: string
  exportPath: string
  syncAnnotations: boolean
  autoSync: boolean
  reviewBeforeChunking: boolean  // NEW! Default: false
}
```

### Pipeline Modification

**process-document.ts** - Insert pause after extraction:

```typescript
// After markdown extraction (line ~150)
await updateProgress(40, 'Markdown extracted')

// NEW: Check if manual review is enabled
const { data: settings } = await supabase
  .from('user_settings')
  .select('obsidian_settings')
  .eq('user_id', userId)
  .single()

if (settings?.obsidian_settings?.reviewBeforeChunking) {
  // Export to Obsidian for review
  const { exportToObsidian } = await import('./obsidian-sync.js')
  await exportToObsidian(documentId, userId)

  // Pause pipeline
  await supabase
    .from('documents')
    .update({ processing_status: 'awaiting_manual_review' })
    .eq('id', documentId)

  await updateProgress(50, 'Exported to Obsidian - awaiting manual review')

  return {
    success: true,
    status: 'awaiting_manual_review',
    message: 'Review markdown in Obsidian, then click "Continue Processing"'
  }
}

// Otherwise, continue with chunking...
```

---

## Implementation Components

### 1. Worker Handler: continue-processing.ts

```typescript
// worker/handlers/continue-processing.ts

import { createClient } from '@supabase/supabase-js'
import { batchChunkAndExtractMetadata } from '../lib/ai-chunking-batch.js'
import { generateEmbeddings } from '../lib/embeddings.js'
import { processDocument as runCollisionDetection } from '../engines/orchestrator.js'

export async function continueProcessing(
  documentId: string,
  userId: string,
  jobId?: string
) {
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  async function updateProgress(percent: number, message?: string) {
    if (jobId) {
      await supabase
        .from('background_jobs')
        .update({
          progress: { percent, stage: 'continue_processing', details: message || '' }
        })
        .eq('id', jobId)
    }
  }

  try {
    console.log(`[ContinueProcessing] Starting for document ${documentId}`)

    // 1. Get document
    const { data: document } = await supabase
      .from('documents')
      .select('id, markdown_path, processing_status')
      .eq('id', documentId)
      .single()

    if (!document) {
      throw new Error('Document not found')
    }

    if (document.processing_status !== 'awaiting_manual_review') {
      throw new Error(`Invalid status: ${document.processing_status}. Expected: awaiting_manual_review`)
    }

    await updateProgress(5, 'Starting chunking pipeline...')

    // 2. Check if markdown was edited in Obsidian
    const { data: obsidianSettings } = await supabase
      .from('user_settings')
      .select('obsidian_settings')
      .eq('user_id', userId)
      .single()

    if (obsidianSettings?.obsidian_settings?.syncAnnotations) {
      // Sync latest version from Obsidian (simple sync, no recovery needed)
      const { syncFromObsidian } = await import('./obsidian-sync.js')
      const syncResult = await syncFromObsidian(documentId, userId)

      if (syncResult.changed) {
        console.log('[ContinueProcessing] Synced edited markdown from Obsidian')
      }
    }

    await updateProgress(10, 'Markdown synced')

    // 3. Download markdown from storage
    const { data: blob } = await supabase.storage
      .from('documents')
      .download(document.markdown_path)

    if (!blob) {
      throw new Error('Failed to download markdown')
    }

    const markdown = await blob.text()
    await updateProgress(15, 'Markdown loaded')

    // 4. Set processing status
    await supabase
      .from('documents')
      .update({ processing_status: 'processing' })
      .eq('id', documentId)

    // 5. Run AI chunking
    await updateProgress(20, 'Starting AI chunking...')

    const aiChunks = await batchChunkAndExtractMetadata(
      markdown,
      {
        apiKey: process.env.GOOGLE_AI_API_KEY,
        modelName: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
        enableProgress: true,
        onProgress: (percent, stage) => {
          updateProgress(20 + (percent * 0.4), stage) // 20-60%
        }
      }
    )

    console.log(`[ContinueProcessing] Created ${aiChunks.length} chunks`)
    await updateProgress(60, `Created ${aiChunks.length} semantic chunks`)

    // 6. Generate embeddings
    await updateProgress(65, 'Generating embeddings...')
    const embeddings = await generateEmbeddings(aiChunks.map(c => c.content))
    await updateProgress(70, 'Embeddings generated')

    // 7. Insert chunks into database
    const chunksToInsert = aiChunks.map((chunk, index) => ({
      document_id: documentId,
      chunk_index: index,
      content: chunk.content,
      start_offset: chunk.start_offset,
      end_offset: chunk.end_offset,
      word_count: chunk.content.split(/\s+/).length,
      themes: chunk.metadata?.themes || [],
      importance_score: chunk.metadata?.importance || 0.5,
      summary: chunk.metadata?.summary || null,
      emotional_metadata: chunk.metadata?.emotional ? {
        polarity: chunk.metadata.emotional.polarity,
        primaryEmotion: chunk.metadata.emotional.primaryEmotion,
        intensity: chunk.metadata.emotional.intensity
      } : null,
      conceptual_metadata: chunk.metadata?.concepts ? {
        concepts: chunk.metadata.concepts
      } : null,
      domain_metadata: chunk.metadata?.domain ? {
        primaryDomain: chunk.metadata.domain,
        confidence: 0.8
      } : null,
      metadata_extracted_at: new Date().toISOString(),
      embedding: embeddings[index],
      is_current: true
    }))

    const { error: insertError } = await supabase
      .from('chunks')
      .insert(chunksToInsert)

    if (insertError) {
      throw new Error(`Failed to insert chunks: ${insertError.message}`)
    }

    await updateProgress(75, 'Chunks saved to database')

    // 8. Run collision detection
    await updateProgress(80, 'Running collision detection...')
    await runCollisionDetection(documentId)
    await updateProgress(90, 'Collision detection complete')

    // 9. Mark document as completed
    await supabase
      .from('documents')
      .update({ processing_status: 'completed' })
      .eq('id', documentId)

    await updateProgress(100, 'Processing complete')

    console.log('[ContinueProcessing] ✅ Complete')

    return {
      success: true,
      chunksCreated: aiChunks.length
    }

  } catch (error) {
    console.error('[ContinueProcessing] ❌ Failed:', error)

    await supabase
      .from('documents')
      .update({
        processing_status: 'failed',
        processing_error: error instanceof Error ? error.message : 'Unknown error'
      })
      .eq('id', documentId)

    throw error
  }
}
```

### 2. API Route: /api/obsidian/continue-processing

```typescript
// src/app/api/obsidian/continue-processing/route.ts

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

/**
 * POST /api/obsidian/continue-processing
 * Resume chunking pipeline after manual review
 */
export async function POST(request: NextRequest) {
  try {
    const { documentId } = await request.json()

    if (!documentId) {
      return NextResponse.json(
        { error: 'Document ID is required' },
        { status: 400 }
      )
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const devUserId = process.env.DEV_USER_ID || '00000000-0000-0000-0000-000000000000'

    // Create background job for continue-processing
    const { data: job, error: jobError } = await supabase
      .from('background_jobs')
      .insert({
        job_type: 'continue-processing',
        status: 'pending',
        user_id: devUserId,
        input_data: { documentId, userId: devUserId },
        max_retries: 3
      })
      .select()
      .single()

    if (jobError) {
      throw new Error(`Failed to create job: ${jobError.message}`)
    }

    console.log(`[API] Created continue-processing job ${job.id}`)

    // Return job ID for client-side polling
    return NextResponse.json({
      success: true,
      jobId: job.id,
      message: 'Processing started'
    })

  } catch (error) {
    console.error('[API] Continue processing failed:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to continue processing' },
      { status: 500 }
    )
  }
}
```

### 3. Updated Obsidian Sync Handler

```typescript
// worker/handlers/obsidian-sync.ts

export async function syncFromObsidian(
  documentId: string,
  userId: string,
  jobId?: string
): Promise<SyncResult> {
  try {
    // ... existing code to read edited markdown from vault ...

    // NEW: Check if document is in pre-chunking review state
    const { data: document } = await supabase
      .from('documents')
      .select('processing_status')
      .eq('id', documentId)
      .single()

    if (document?.processing_status === 'awaiting_manual_review') {
      // Simple sync - no annotations to recover, no chunks to remap
      console.log('[Obsidian Sync] Pre-chunking review mode - simple sync')

      // Upload edited markdown to storage
      await supabase.storage
        .from('documents')
        .update(document.markdown_path, new Blob([editedMarkdown], { type: 'text/markdown' }), {
          contentType: 'text/markdown',
          upsert: true
        })

      console.log('[Obsidian Sync] ✅ Markdown updated')

      return {
        success: true,
        changed: true,
        recovery: null // No recovery needed!
      }
    }

    // Otherwise, full reprocessing with recovery (existing code)
    const recovery = await reprocessDocument(documentId, supabase, jobId)
    return { success: true, changed: true, recovery: recovery.annotations }

  } catch (error) {
    // ... error handling ...
  }
}
```

### 4. Worker Index: Add Job Handler

```typescript
// worker/index.ts

import { continueProcessing } from './handlers/continue-processing.js'

// Add to job handlers map
const jobHandlers = {
  'process-document': processDocumentHandler,
  'detect-connections': detectConnectionsHandler,
  'obsidian-export': obsidian_export,
  'obsidian-sync': obsidian_sync,
  'continue-processing': async (job: Job) => {
    const { documentId, userId } = job.input_data
    const result = await continueProcessing(documentId, userId, job.id)
    return result
  }
}
```

### 5. UI Component: DocumentList (Add Review Button)

```typescript
// src/components/documents/DocumentList.tsx

{document.processing_status === 'awaiting_manual_review' && (
  <div className="flex gap-2">
    <Button
      variant="outline"
      size="sm"
      onClick={() => openInObsidian(document.id)}
    >
      <ExternalLink className="w-4 h-4 mr-2" />
      Review in Obsidian
    </Button>
    <Button
      size="sm"
      onClick={() => continueProcessing(document.id)}
    >
      <Play className="w-4 h-4 mr-2" />
      Continue Processing
    </Button>
  </div>
)}

async function continueProcessing(documentId: string) {
  setIsProcessing(true)

  try {
    // Start job
    const response = await fetch('/api/obsidian/continue-processing', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ documentId })
    })

    if (!response.ok) {
      throw new Error('Failed to start processing')
    }

    const { jobId } = await response.json()

    toast.info('Processing Started', {
      description: 'Chunking document - this may take a few minutes'
    })

    // Poll for completion (similar to sync-async pattern)
    await pollJobStatus(jobId)

    toast.success('Processing Complete', {
      description: 'Document is ready to read'
    })

    // Refresh document list
    router.refresh()

  } catch (error) {
    toast.error('Processing Failed', {
      description: error instanceof Error ? error.message : 'Unknown error'
    })
  } finally {
    setIsProcessing(false)
  }
}
```

### 6. Settings UI: Add Toggle

```typescript
// src/app/settings/page.tsx

<div className="flex items-center justify-between">
  <div>
    <label className="text-sm font-medium">Review Before Chunking</label>
    <p className="text-sm text-muted-foreground">
      Pause after extraction to review and fix markdown formatting in Obsidian
    </p>
  </div>
  <Switch
    checked={settings.obsidian_settings?.reviewBeforeChunking || false}
    onCheckedChange={(checked) => {
      setSettings({
        ...settings,
        obsidian_settings: {
          ...settings.obsidian_settings,
          reviewBeforeChunking: checked
        }
      })
    }}
  />
</div>
```

### 7. ProcessingDock: Add Stage Label

```typescript
// src/components/layout/ProcessingDock.tsx

const STAGE_LABELS: Record<string, { icon: LucideIcon; label: string }> = {
  // ... existing stages ...

  awaiting_manual_review: {
    icon: FileEdit,
    label: '✏️ Manual Review',
    substages: {
      waiting: 'Exported to Obsidian - edit when ready',
      ready: 'Click "Continue Processing" to resume'
    }
  },

  continue_processing: {
    icon: Play,
    label: '▶️ Resuming',
    substages: {
      chunking: 'Creating semantic chunks',
      embedding: 'Generating embeddings',
      connections: 'Detecting connections'
    }
  }
}
```

---

## Migration Script

```sql
-- No schema changes needed!
-- Just add reviewBeforeChunking to existing obsidian_settings JSONB
-- This is a runtime configuration, not a database change
```

---

## Implementation Checklist

### Phase 1: Worker Backend
- [ ] Create `worker/handlers/continue-processing.ts`
- [ ] Update `worker/handlers/process-document.ts` (add pause logic)
- [ ] Update `worker/handlers/obsidian-sync.ts` (add pre-chunking check)
- [ ] Update `worker/index.ts` (add job handler)
- [ ] Test with reviewBeforeChunking enabled

### Phase 2: API Layer
- [ ] Create `/api/obsidian/continue-processing/route.ts`
- [ ] Test job creation and polling

### Phase 3: UI Components
- [ ] Update Settings page (add toggle)
- [ ] Update DocumentList (add review buttons)
- [ ] Update ProcessingDock (add stage labels)
- [ ] Test end-to-end flow

### Phase 4: Testing
- [ ] Test: Upload PDF with review enabled → pauses at awaiting_manual_review
- [ ] Test: Edit in Obsidian → markdown syncs without recovery
- [ ] Test: Click "Continue Processing" → chunks created successfully
- [ ] Test: Upload PDF with review disabled → processes normally (no pause)
- [ ] Test: Verify no annotation recovery triggered (no annotations exist yet)

---

## Testing Scenarios

### Scenario 1: Happy Path (Review Enabled)
```
1. Enable "Review Before Chunking" in settings
2. Upload PDF
3. Worker extracts → exports to Obsidian → pauses at "awaiting_manual_review"
4. User fixes formatting in Obsidian, saves
5. User clicks "Continue Processing"
6. Worker syncs edited markdown → chunks → embeds → connections
7. Document status = "completed"
```

### Scenario 2: Review Disabled (Normal Flow)
```
1. Disable "Review Before Chunking"
2. Upload PDF
3. Worker extracts → chunks → embeds → connections (no pause)
4. Document status = "completed"
```

### Scenario 3: Review Enabled, No Edits
```
1. Enable review
2. Upload PDF → pauses at "awaiting_manual_review"
3. User clicks "Continue Processing" WITHOUT editing
4. Worker syncs (no changes) → chunks → completes
5. Works normally (idempotent sync)
```

---

## Benefits vs Current System

| Aspect | Current (Post-Processing) | Proposed (Pre-Processing) |
|--------|---------------------------|---------------------------|
| Annotation Recovery | Required (fuzzy matching) | Not needed (no annotations) |
| Connection Remapping | Required (chunk ID mapping) | Not needed (no connections) |
| Data Loss Risk | Medium (85-95% recovery) | None (nothing to lose) |
| Processing Time | 10-30 minutes (recovery) | 2-5 minutes (no recovery) |
| Complexity | High (3 recovery systems) | Low (simple sync) |
| Use Case | Fix content errors | Fix formatting errors |

---

## Key Design Decisions

**1. No Schema Changes**
- Uses existing `processing_status` column
- Uses existing `obsidian_settings` JSONB
- Minimal migration risk

**2. Coexistence**
- Pre-chunking review (new workflow)
- Post-completion sync (existing workflow)
- Both can be used depending on settings

**3. Simple Sync Logic**
- Pre-chunking: Upload markdown to storage (no recovery)
- Post-chunking: Full reprocessing with recovery (existing code)
- Single conditional in `syncFromObsidian()`

**4. Progressive Enhancement**
- Default: disabled (existing behavior)
- Enable when needed (opt-in feature)
- No breaking changes

---

## Next Steps

1. Implement worker backend (Phase 1)
2. Add API routes (Phase 2)
3. Build UI components (Phase 3)
4. Test all scenarios (Phase 4)
5. Document in user guide

**Estimated Implementation Time**: 4-6 hours

This is ready to build. The architecture is clean, no schema changes needed, and it coexists perfectly with the existing post-processing workflow.
