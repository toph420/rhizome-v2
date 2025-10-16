# Background Job System

**Status**: Production Ready
**Version**: 2.0 (Enhanced with Pause/Resume)
**Last Updated**: 2025-10-15

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Job Lifecycle](#job-lifecycle)
4. [Job Types](#job-types)
5. [Progress Tracking](#progress-tracking)
6. [Pause & Resume](#pause--resume)
7. [Automatic Retry](#automatic-retry)
8. [Developer Guide](#developer-guide)
9. [API Reference](#api-reference)
10. [Troubleshooting](#troubleshooting)

---

## Overview

The Rhizome V2 background job system provides robust, fault-tolerant processing for long-running document operations. Built on PostgreSQL and Supabase, it supports:

- **7 Job Types**: Document processing, imports, exports, connection detection, and integrations
- **Real-time Progress**: Updates every 5-10 seconds with detailed status
- **Pause & Resume**: Checkpoint-based pause/resume with integrity validation
- **Automatic Retry**: Intelligent error classification with exponential backoff
- **Visual Feedback**: Heartbeat indicators, progress bars, and status badges

### Key Features

| Feature | Description | Status |
|---------|-------------|--------|
| Visual Progress | Micro-updates ("Chunk 234 of 500") | ✅ Complete |
| Heartbeat | 5-second updates, green pulse indicator | ✅ Complete |
| Pause/Resume | Checkpoint-based with SHA-256 validation | ✅ Complete |
| Auto-Retry | 4 error types, exponential backoff | ✅ Complete |
| Job Control | Pause/Resume/Retry/Delete buttons | ✅ Complete |
| Multi-Format | PDF, EPUB, YouTube, Web, Markdown, Text, Paste | ✅ Complete |

---

## Architecture

### System Components

```
┌─────────────────────────────────────────────────────────────┐
│                     User Interface Layer                     │
├─────────────────────┬───────────────────────────────────────┤
│  ProcessingDock     │  Admin Panel (JobList)                │
│  - Active jobs only │  - All jobs history                   │
│  - Bottom-right     │  - 6 tabs (Scanner, Import, etc.)     │
│  - Auto-hide        │  - Full job control                   │
└─────────────────────┴───────────────────────────────────────┘
                              ↕
┌─────────────────────────────────────────────────────────────┐
│                    Zustand Store Layer                       │
│  background-jobs store - Client-side state & polling         │
│  - Polls every 2 seconds                                     │
│  - Tracks active/completed/failed jobs                       │
│  - Optimistic updates for actions                           │
└─────────────────────────────────────────────────────────────┘
                              ↕
┌─────────────────────────────────────────────────────────────┐
│                   Server Actions Layer                       │
│  src/app/actions/admin.ts                                    │
│  - pauseJob(jobId)     - Pause processing jobs              │
│  - resumeJob(jobId)    - Resume paused jobs                 │
│  - retryJob(jobId)     - Retry failed jobs                  │
│  - deleteJob(jobId)    - Delete completed/failed jobs       │
└─────────────────────────────────────────────────────────────┘
                              ↕
┌─────────────────────────────────────────────────────────────┐
│                    Database Layer (PostgreSQL)               │
│  background_jobs table                                       │
│  - Job metadata (status, progress, checkpoint)              │
│  - Retry tracking (retry_count, max_retries)                │
│  - Pause/resume fields (paused_at, checkpoint_path, etc.)   │
└─────────────────────────────────────────────────────────────┘
                              ↕
┌─────────────────────────────────────────────────────────────┐
│                    Worker Process (Node.js)                  │
│  worker/index.ts - Main polling loop (5s interval)           │
│  ├─ Job handlers (process-document, import, export, etc.)   │
│  ├─ Processors (PDF, EPUB, YouTube, Web, etc.)              │
│  ├─ Retry manager (30s polling for failed jobs)             │
│  └─ Connection engines (Semantic, Contradiction, Thematic)  │
└─────────────────────────────────────────────────────────────┘
                              ↕
┌─────────────────────────────────────────────────────────────┐
│                    Storage Layer (Supabase)                  │
│  - Checkpoints (stage-extraction.json, stage-chunking.json) │
│  - Final results (chunks.json, metadata.json, manifest.json)│
│  - Markdown content (content.md)                             │
└─────────────────────────────────────────────────────────────┘
```

### Database Schema

**Table**: `background_jobs`

**Core Fields:**
```sql
id                UUID PRIMARY KEY
job_type          TEXT NOT NULL  -- 'process_document', 'import_document', etc.
status            TEXT NOT NULL  -- 'pending', 'processing', 'paused', 'completed', 'failed', 'cancelled'
document_id       UUID           -- Associated document
user_id           UUID NOT NULL
created_at        TIMESTAMPTZ
started_at        TIMESTAMPTZ
completed_at      TIMESTAMPTZ
updated_at        TIMESTAMPTZ    -- Updated every 5s by heartbeat
```

**Progress Fields:**
```sql
progress          JSONB          -- { percent: 75, stage: 'chunking', details: '...', checkpoint: {...} }
```

**Retry Fields:**
```sql
retry_count       INTEGER DEFAULT 0
max_retries       INTEGER DEFAULT 3
next_retry_at     TIMESTAMPTZ
error_message     TEXT
```

**Pause/Resume Fields (Added in Phase 3):**
```sql
paused_at              TIMESTAMPTZ
resumed_at             TIMESTAMPTZ
pause_reason           TEXT
resume_count           INTEGER DEFAULT 0
last_checkpoint_path   TEXT          -- 'documents/{userId}/{docId}/stage-{stage}.json'
last_checkpoint_stage  TEXT          -- 'extraction', 'chunking', 'embedding', etc.
checkpoint_hash        TEXT          -- SHA-256 hash (first 16 chars) for validation
```

**Indexes:**
```sql
idx_background_jobs_status           ON (status)
idx_background_jobs_document_id      ON (document_id)
idx_background_jobs_user_id          ON (user_id)
idx_background_jobs_paused           ON (status) WHERE status = 'paused'
idx_background_jobs_checkpoint       ON (last_checkpoint_path) WHERE last_checkpoint_path IS NOT NULL
```

---

## Job Lifecycle

### Standard Flow (No Interruptions)

```
pending → processing → completed
   ↓          ↓            ↓
   5s      5-60min      stored
```

1. **pending** (0%): Job queued, waiting for worker
2. **processing** (0-100%): Active processing with progress updates
3. **completed** (100%): Success, final results stored

### Pause/Resume Flow

```
pending → processing → paused → pending → processing → completed
            ↓ (30%)      ↓         ↓        ↓ (30%)       ↓
         checkpoint   pause    resume    resume from   success
                      saved   request   checkpoint
```

1. **processing**: Job reaches pause-safe checkpoint (e.g., after chunking)
2. **paused**: User clicks "Pause", job status → 'paused', checkpoint saved
3. **pending**: User clicks "Resume", status → 'pending', resume_count++
4. **processing**: Worker picks up job, loads checkpoint, continues from saved stage

### Error & Retry Flow

```
pending → processing → failed → pending → processing → completed
   ↓          ↓           ↓        ↓          ↓            ↓
  queue    error      classify  auto-retry  success    final
                     (transient) (1-30min)
```

**Error Types:**
- **Transient**: Network timeouts, 429/503 errors → Auto-retry (exponential backoff)
- **Permanent**: Unknown errors → Manual retry only
- **Paywall**: Quota/billing → No retry, user action required
- **Invalid**: Bad input → No retry, fix required

---

## Job Types

### 1. process_document

**Purpose**: Extract, chunk, embed, and detect connections for new documents

**Input**:
```typescript
{
  documentId: string
  sourceType: 'pdf' | 'epub' | 'youtube' | 'web' | 'markdown' | 'text' | 'paste'
  sourceUrl?: string
  storagePath: string
}
```

**Stages** (with pause-safe checkpoints):
1. **Extraction** (0-20%): Download + Docling extraction ✅ Checkpoint
2. **Cleanup** (20-30%): AI/regex markdown cleanup ✅ Checkpoint
3. **Bulletproof Matching** (30-40%): 5-layer metadata transfer
4. **Chunking** (40-60%): Chonkie chunking (9 strategies) ✅ Checkpoint
5. **Metadata Transfer** (60-65%): Docling → Chonkie enrichment
6. **Metadata Enrichment** (65-70%): PydanticAI + Ollama
7. **Embedding** (70-80%): Transformers.js local embeddings ✅ Checkpoint
8. **Save to DB** (80-90%): Insert chunks with embeddings
9. **Connection Detection** (90-95%): Queue connection job
10. **Finalize** (95-100%): Complete

**Processing Time**: 3-5 min (small), 15-25 min (medium), 60-80 min (large)

### 2. detect_connections

**Purpose**: Run 3-engine collision detection after document processing

**Engines**:
1. **SemanticSimilarity** (25% weight): Embedding-based, fast
2. **ContradictionDetection** (40% weight): Metadata-based, conceptual tensions
3. **ThematicBridge** (35% weight): AI-powered (Qwen 32B), cross-domain

**Input**:
```typescript
{
  documentId: string
  trigger: 'document-processing-complete' | 'manual-reprocess'
}
```

**Processing Time**: 2-5 min (7 chunks), 10-20 min (100+ chunks)

### 3. import_document

**Purpose**: Restore documents from Storage (Admin Panel → Import tab)

**Modes**:
- **skip**: Skip existing documents
- **replace**: Replace all data
- **merge_smart**: Merge non-user-modified data only

**Input**:
```typescript
{
  documentId: string
  userId: string
  mode: 'skip' | 'replace' | 'merge_smart'
  withEmbeddings?: boolean
  withConnections?: boolean
}
```

**Processing Time**: 30s-2min (depends on document size)

### 4. export_documents

**Purpose**: Create ZIP export of documents for portability

**Input**:
```typescript
{
  documentIds: string[]
  userId: string
  includeConnections?: boolean
  format?: 'json' | 'markdown'
}
```

**Processing Time**: 1-5 min (depends on document count)

### 5. reprocess_connections

**Purpose**: Re-run connection detection with updated engine weights

**Modes**:
- **smart**: Preserve user-validated connections, reprocess others
- **all**: Delete and reprocess everything

**Input**:
```typescript
{
  documentIds: string[]
  mode: 'smart' | 'all'
}
```

**Processing Time**: 5-20 min (depends on chunk count)

### 6. obsidian_export

**Purpose**: Export document to Obsidian vault

**Input**:
```typescript
{
  documentId: string
  userId: string
}
```

**Processing Time**: <30s

### 7. obsidian_sync

**Purpose**: Sync changes from Obsidian back to Rhizome

**Input**:
```typescript
{
  documentId: string
  userId: string
}
```

**Processing Time**: <30s

---

## Progress Tracking

### Progress Structure

```typescript
interface JobProgress {
  percent: number              // 0-100
  stage: string               // Human-readable stage name
  details?: string            // "Processing chunk 234 of 500"
  checkpoint?: {
    stage: string            // 'extraction', 'chunking', etc.
    path: string             // Storage path to checkpoint
    timestamp: string        // ISO timestamp
    can_resume: boolean      // true if pause is safe here
  }
}
```

### Heartbeat Mechanism

**Implementation** (`worker/processors/base.ts`):

```typescript
private heartbeat?: NodeJS.Timeout

protected startHeartbeat(): void {
  if (!this.jobId) return

  this.heartbeat = setInterval(async () => {
    try {
      await this.supabase
        .from('background_jobs')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', this.jobId)
    } catch (error) {
      // Non-fatal: heartbeat failure doesn't stop processing
      console.warn('[Heartbeat] Update failed:', error)
    }
  }, 5000) // Every 5 seconds
}

protected stopHeartbeat(): void {
  if (this.heartbeat) {
    clearInterval(this.heartbeat)
    this.heartbeat = undefined
  }
}
```

**Usage**: Called automatically in all handlers via `BaseProcessor`

**UI Indicator**: Green pulse shows if `updated_at` is < 10 seconds ago

### Stage Names

**Formatted for Display** (`src/components/layout/ProcessingDock.tsx`):

```typescript
const formatStageName = (stage: string): string => {
  const stageNames: Record<string, string> = {
    'extraction': 'Extracting',
    'chunking': 'Chunking',
    'embedding': 'Embedding',
    'markdown_saved': 'Markdown Saved',
    'chunked': 'Chunked',
    'embedded': 'Embedded',
    'complete': 'Complete'
  }
  return stageNames[stage] || stage.replace(/_/g, ' ')
}
```

---

## Pause & Resume

### Overview

The pause/resume system allows users to interrupt long-running jobs and continue later without data loss. Built on **checkpoint-based resumption** with **integrity validation**.

### Checkpoint System

**What is a Checkpoint?**

A checkpoint is a saved snapshot of processing state at a "pause-safe" stage. Includes:
- All processing results up to that point
- Stage name for resumption logic
- SHA-256 hash for integrity validation

**Pause-Safe Stages**:
- ✅ **After Extraction**: PDF/EPUB extracted, markdown ready
- ✅ **After Cleanup**: Markdown cleaned and validated
- ✅ **After Chunking**: Chunks created and metadata transferred
- ✅ **After Embedding**: Embeddings generated
- ❌ **During Bulletproof Matching**: Mid-algorithm, not safe
- ❌ **During AI Calls**: Ollama/Gemini in progress, not safe

**Storage Location**: `documents/{userId}/{documentId}/stage-{stageName}.json`

### Checkpoint Tracking

**Implementation** (`worker/processors/base.ts`):

```typescript
protected async saveStageResult(
  stage: string,
  data: any,
  options?: { final?: boolean, pauseSafe?: boolean }
): Promise<void> {
  // Save to Storage
  const storagePath = `documents/${this.userId}/${this.documentId}/stage-${stage}.json`
  await saveToStorage(this.supabase, storagePath, { stage, data, timestamp: new Date() })

  // Track checkpoint if pause-safe
  if (options?.pauseSafe && this.jobId) {
    const checkpointHash = crypto
      .createHash('sha256')
      .update(JSON.stringify(data))
      .digest('hex')
      .substring(0, 16) // First 16 chars

    await this.supabase
      .from('background_jobs')
      .update({
        last_checkpoint_path: storagePath,
        last_checkpoint_stage: stage,
        checkpoint_hash: checkpointHash,
        progress: {
          ...currentProgress,
          checkpoint: {
            stage,
            path: storagePath,
            timestamp: new Date().toISOString(),
            can_resume: true
          }
        }
      })
      .eq('id', this.jobId)
  }
}
```

**Usage in Handlers**:

```typescript
// Mark extraction as pause-safe
await processor.saveStageResult('extraction', result, { pauseSafe: true })

// Mark chunking as pause-safe
await processor.saveStageResult('chunking', result, { pauseSafe: true })

// Not pause-safe (mid-process)
await processor.saveStageResult('matching', result, { pauseSafe: false })
```

### Pause Flow

**User Action**: Click "Pause" button (only enabled when `checkpoint.can_resume === true`)

**Server Action** (`src/app/actions/admin.ts`):

```typescript
export async function pauseJob(jobId: string) {
  'use server'
  const supabase = await createClient()

  const { data: job } = await supabase
    .from('background_jobs')
    .select('*')
    .eq('id', jobId)
    .single()

  // Validation
  if (job.status !== 'processing') {
    return { success: false, error: 'Can only pause processing jobs' }
  }

  // Update to paused
  await supabase
    .from('background_jobs')
    .update({
      status: 'paused',
      paused_at: new Date().toISOString(),
      pause_reason: 'User requested pause'
    })
    .eq('id', jobId)

  revalidatePath('/admin')
  return { success: true }
}
```

**What Happens**:
1. Job status → 'paused'
2. Worker sees 'paused' status and stops processing
3. Latest checkpoint remains in Storage
4. UI shows orange "Paused" badge with checkpoint info

### Resume Flow

**User Action**: Click "Resume" button on paused job

**Server Action** (`src/app/actions/admin.ts`):

```typescript
export async function resumeJob(jobId: string) {
  'use server'
  const supabase = await createClient()

  const { data: job } = await supabase
    .from('background_jobs')
    .select('*')
    .eq('id', jobId)
    .single()

  // Validation
  if (job.status !== 'paused') {
    return { success: false, error: 'Can only resume paused jobs' }
  }

  // Validate checkpoint exists
  if (job.last_checkpoint_path) {
    const { data } = await supabase.storage
      .from('documents')
      .download(job.last_checkpoint_path)

    if (!data) {
      return { success: false, error: 'Checkpoint no longer exists' }
    }
  }

  // Update to pending for worker pickup
  await supabase
    .from('background_jobs')
    .update({
      status: 'pending',
      resumed_at: new Date().toISOString(),
      resume_count: (job.resume_count || 0) + 1
    })
    .eq('id', jobId)

  revalidatePath('/admin')
  return { success: true }
}
```

### Resumption Logic

**Handler Implementation** (`worker/handlers/process-document.ts`):

```typescript
export async function processDocumentHandler(job: BackgroundJob) {
  let startStage = 'extraction' // Default: start from beginning
  let checkpointData = null

  // Check if resuming from checkpoint
  if (job.resume_count > 0 && job.last_checkpoint_path) {
    console.log(`[Resume] Job ${job.id} from checkpoint: ${job.last_checkpoint_stage}`)

    try {
      // Download checkpoint from Storage
      const { data } = await supabase.storage
        .from('documents')
        .download(job.last_checkpoint_path)

      const checkpoint = JSON.parse(await data.text())

      // Validate hash
      const currentHash = crypto
        .createHash('sha256')
        .update(JSON.stringify(checkpoint.data))
        .digest('hex')
        .substring(0, 16)

      if (currentHash !== job.checkpoint_hash) {
        console.warn('[Resume] Hash mismatch, falling back to fresh processing')
      } else {
        checkpointData = checkpoint.data
        startStage = getNextStageAfterCheckpoint(job.last_checkpoint_stage)
        console.log(`[Resume] Resuming from stage: ${startStage}`)
      }
    } catch (error) {
      console.error('[Resume] Failed to load checkpoint:', error)
      // Graceful fallback: start fresh
    }
  }

  // Continue processing from startStage...
  // If checkpointData exists, use it instead of reprocessing
}

function getNextStageAfterCheckpoint(checkpointStage: string): string {
  const stageMap: Record<string, string> = {
    'extraction': 'chunking',
    'cleanup': 'chunking',
    'chunking': 'embedding',
    'embedding': 'completion'
  }
  return stageMap[checkpointStage] || 'extraction'
}
```

**What Happens**:
1. Worker picks up job from `pending` queue
2. Detects `resume_count > 0` and checkpoint exists
3. Downloads checkpoint from Storage
4. Validates hash matches `checkpoint_hash`
5. Loads checkpoint data into processing pipeline
6. Skips completed stages, continues from next stage
7. If validation fails, falls back to fresh processing

---

## Automatic Retry

### Overview

The retry system automatically retries failed jobs based on **intelligent error classification** with **exponential backoff**. Runs every 30 seconds in the worker loop.

### Error Classification

**Implementation** (`worker/lib/retry-manager.ts`):

```typescript
export type ErrorType = 'transient' | 'permanent' | 'paywall' | 'invalid'

export function classifyError(error: Error): ErrorClassification {
  const errorMessage = error.message.toLowerCase()

  // Transient errors (retry-able)
  if (
    errorMessage.includes('timeout') ||
    errorMessage.includes('network') ||
    errorMessage.includes('econnrefused') ||
    errorMessage.includes('econnreset') ||
    errorMessage.includes('socket hang up') ||
    errorMessage.includes('503') ||
    errorMessage.includes('502') ||
    errorMessage.includes('504') ||
    errorMessage.includes('429') // Rate limit
  ) {
    return {
      type: 'transient',
      message: 'Temporary network or service issue. Will retry automatically.',
      canRetry: true
    }
  }

  // Paywall errors
  if (
    errorMessage.includes('quota') ||
    errorMessage.includes('credits') ||
    errorMessage.includes('billing')
  ) {
    return {
      type: 'paywall',
      message: 'API quota or billing issue. Check your account.',
      canRetry: false
    }
  }

  // Invalid input errors
  if (
    errorMessage.includes('invalid') ||
    errorMessage.includes('malformed') ||
    errorMessage.includes('not found') ||
    errorMessage.includes('parse error')
  ) {
    return {
      type: 'invalid',
      message: 'Invalid input or missing resource. Manual intervention required.',
      canRetry: false
    }
  }

  // Default to permanent
  return {
    type: 'permanent',
    message: 'Permanent error. Manual intervention required.',
    canRetry: false
  }
}
```

### Exponential Backoff

**Implementation**:

```typescript
export function calculateNextRetry(retryCount: number): string {
  // 2^retryCount minutes, capped at 30 min
  const delayMinutes = Math.min(Math.pow(2, retryCount), 30)
  return new Date(Date.now() + delayMinutes * 60 * 1000).toISOString()
}
```

**Backoff Schedule**:
- Retry 1: 1 minute
- Retry 2: 2 minutes
- Retry 3: 4 minutes
- Retry 4: 8 minutes
- Retry 5: 16 minutes
- Retry 6+: 30 minutes (capped)

### Retry Loop

**Implementation** (`worker/lib/retry-manager.ts`):

```typescript
export async function retryLoop(supabase: SupabaseClient) {
  try {
    // Query for retry-eligible jobs
    const { data: failedJobs, error } = await supabase
      .from('background_jobs')
      .select('*')
      .eq('status', 'failed')

    if (error || !failedJobs || failedJobs.length === 0) {
      return
    }

    console.log(`[RetryManager] Found ${failedJobs.length} job(s) eligible for retry`)

    for (const job of failedJobs) {
      // Skip if already at max retries
      if (job.retry_count >= job.max_retries) {
        continue
      }

      // Only retry transient errors
      const isTransient = job.error_message?.toLowerCase().includes('temporary') ||
                         job.error_message?.toLowerCase().includes('timeout') ||
                         job.error_message?.toLowerCase().includes('network')

      if (!isTransient) {
        continue
      }

      // Calculate next retry time
      const nextRetryCount = job.retry_count + 1
      const nextRetryAt = calculateNextRetry(nextRetryCount)

      console.log(
        `[RetryManager] Auto-retrying job ${job.id} - ` +
        `attempt ${nextRetryCount}/${job.max_retries}`
      )

      // Update job to pending for re-processing
      await supabase
        .from('background_jobs')
        .update({
          status: 'pending',
          retry_count: nextRetryCount,
          next_retry_at: nextRetryAt,
          resumed_at: new Date().toISOString(),
          error_message: null // Clear for fresh attempt
        })
        .eq('id', job.id)
    }
  } catch (error) {
    console.error('[RetryManager] Error in retry loop:', error)
  }
}
```

**Worker Integration** (`worker/index.ts`):

```typescript
async function main() {
  let retryLoopCounter = 0

  while (!isShuttingDown) {
    // Process pending jobs
    await processNextJob()

    // Check for retry-eligible jobs every 30 seconds (6 iterations × 5s)
    retryLoopCounter++
    if (retryLoopCounter >= 6) {
      await retryLoop(supabase)
      retryLoopCounter = 0
    }

    await new Promise(resolve => setTimeout(resolve, 5000))
  }
}
```

### Recording Failures

**Helper Function** (`worker/lib/retry-manager.ts`):

```typescript
export async function recordJobFailure(
  supabase: SupabaseClient,
  jobId: string,
  error: Error
): Promise<void> {
  const classification = classifyError(error)

  // Calculate next retry time if transient
  const nextRetryAt = classification.canRetry
    ? calculateNextRetry(0) // First retry in 1 minute
    : null

  await supabase
    .from('background_jobs')
    .update({
      status: 'failed',
      error_message: classification.message,
      completed_at: new Date().toISOString(),
      next_retry_at: nextRetryAt
    })
    .eq('id', jobId)
}
```

**Usage in Handlers**:

```typescript
try {
  // ... processing logic ...
} catch (error) {
  console.error(`Job ${job.id} failed:`, error)
  await recordJobFailure(supabase, job.id, error as Error)
}
```

---

## Developer Guide

### Creating a New Job Type

**1. Add Database Handler** (`worker/index.ts`):

```typescript
const JOB_HANDLERS: Record<string, (supabase: any, job: any) => Promise<void>> = {
  'my_new_job': async (supabase: any, job: any) => {
    const { documentId } = job.input_data

    // Process job...
    const result = await myJobLogic(documentId)

    // Mark complete
    await supabase
      .from('background_jobs')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        output_data: result
      })
      .eq('id', job.id)
  }
}
```

**2. Add Type Definitions** (`src/stores/admin/background-jobs.ts`):

```typescript
export type JobType =
  | 'process_document'
  | 'import_document'
  | 'export_documents'
  | 'reprocess_connections'
  | 'detect_connections'
  | 'obsidian_export'
  | 'obsidian_sync'
  | 'my_new_job'  // Add here
```

**3. Add UI Label** (`src/components/layout/ProcessingDock.tsx`):

```typescript
const jobTypeLabels: Record<JobType, string> = {
  process_document: 'Processing',
  // ... others ...
  my_new_job: 'My Custom Job'
}
```

**4. Add Icon** (`src/components/admin/JobList.tsx`):

```typescript
const getJobIcon = (type: string) => {
  switch (type) {
    // ... others ...
    case 'my_new_job':
      return <MyCustomIcon className="h-5 w-5" />
    default:
      return <FileTextIcon className="h-5 w-5" />
  }
}
```

### Adding Progress Updates

**In Your Handler**:

```typescript
async function myJobLogic(documentId: string, jobId: string) {
  const processor = new BaseProcessor(supabase, userId, documentId, jobId)

  // Start heartbeat
  processor.startHeartbeat()

  try {
    // Stage 1: Downloading (0-20%)
    await processor.updateProgress(5, 'downloading', 'Starting download...')
    const data = await downloadData()
    await processor.updateProgress(20, 'downloading', 'Download complete')

    // Stage 2: Processing (20-80%)
    await processor.updateProgress(25, 'processing', 'Processing data...')
    for (let i = 0; i < items.length; i++) {
      await processItem(items[i])

      // Update every 10 items
      if (i % 10 === 0) {
        const percent = 25 + (i / items.length) * 55  // 25-80% range
        await processor.updateProgress(
          percent,
          'processing',
          `Processing item ${i + 1} of ${items.length}`
        )
      }
    }

    // Stage 3: Finalizing (80-100%)
    await processor.updateProgress(85, 'finalizing', 'Saving results...')
    await saveResults(result)
    await processor.updateProgress(100, 'complete', 'Complete')
  } finally {
    // Always stop heartbeat
    processor.stopHeartbeat()
  }
}
```

### Adding Checkpoints

**Mark Pause-Safe Stages**:

```typescript
// After expensive operation completes
await processor.saveStageResult('my_stage', result, { pauseSafe: true })
```

**Add Resumption Logic**:

```typescript
export async function myJobHandler(job: BackgroundJob) {
  let startStage = 'download' // Default
  let checkpointData = null

  // Check for resume
  if (job.resume_count > 0 && job.last_checkpoint_path) {
    const checkpoint = await tryResumeFromCheckpoint(job)
    if (checkpoint) {
      checkpointData = checkpoint.data
      startStage = getNextStage(job.last_checkpoint_stage)
    }
  }

  // Process from startStage
  if (startStage === 'download') {
    const data = await downloadData()
    await processor.saveStageResult('download', data, { pauseSafe: true })
  } else if (checkpointData) {
    // Use checkpoint data instead of re-downloading
    const data = checkpointData
  }

  // Continue processing...
}
```

---

## API Reference

### Server Actions

#### `pauseJob(jobId: string)`

Pauses a processing job.

**Parameters**:
- `jobId`: Job UUID

**Returns**:
```typescript
{ success: boolean, error?: string }
```

**Errors**:
- "Can only pause processing jobs" - Job must be in 'processing' status

**Example**:
```typescript
import { pauseJob } from '@/app/actions/admin'

const result = await pauseJob(job.id)
if (result.success) {
  console.log('Job paused successfully')
}
```

---

#### `resumeJob(jobId: string)`

Resumes a paused job.

**Parameters**:
- `jobId`: Job UUID

**Returns**:
```typescript
{ success: boolean, error?: string }
```

**Errors**:
- "Can only resume paused jobs" - Job must be in 'paused' status
- "Checkpoint no longer exists" - Checkpoint file missing from Storage

**Example**:
```typescript
import { resumeJob } from '@/app/actions/admin'

const result = await resumeJob(job.id)
if (!result.success) {
  console.error('Resume failed:', result.error)
}
```

---

#### `retryJob(jobId: string)`

Retries a failed or cancelled job.

**Parameters**:
- `jobId`: Job UUID

**Returns**:
```typescript
{ success: boolean, error?: string }
```

**Notes**:
- Increments `retry_count`
- Checks against `max_retries` limit
- Clears previous `error_message`
- Sets status to 'pending' for worker pickup

**Example**:
```typescript
import { retryJob } from '@/app/actions/admin'

const result = await retryJob(job.id)
```

---

#### `deleteJob(jobId: string)`

Deletes a completed, failed, or cancelled job.

**Parameters**:
- `jobId`: Job UUID

**Returns**:
```typescript
{ success: boolean, error?: string }
```

**Notes**:
- Cannot delete 'processing' or 'pending' jobs
- Removes job record from database
- Does NOT delete associated Storage files

**Example**:
```typescript
import { deleteJob } from '@/app/actions/admin'

await deleteJob(job.id)
```

---

### Processor Methods

#### `BaseProcessor.updateProgress()`

Updates job progress in database.

**Signature**:
```typescript
protected async updateProgress(
  percent: number,
  stage: string,
  details?: string
): Promise<void>
```

**Parameters**:
- `percent`: Progress percentage (0-100)
- `stage`: Stage name (e.g., 'extraction', 'chunking')
- `details`: Optional details string

**Example**:
```typescript
await processor.updateProgress(
  50,
  'chunking',
  'Processing chunk 234 of 500'
)
```

---

#### `BaseProcessor.saveStageResult()`

Saves stage result to Storage and optionally creates checkpoint.

**Signature**:
```typescript
protected async saveStageResult(
  stage: string,
  data: any,
  options?: { final?: boolean, pauseSafe?: boolean }
): Promise<void>
```

**Parameters**:
- `stage`: Stage name (e.g., 'extraction')
- `data`: Result data to save
- `options.final`: If true, saves to final result path
- `options.pauseSafe`: If true, creates checkpoint for pause/resume

**Example**:
```typescript
// Save with checkpoint
await processor.saveStageResult('chunking', chunks, { pauseSafe: true })

// Save final result
await processor.saveStageResult('complete', finalData, { final: true })
```

---

#### `BaseProcessor.startHeartbeat()` / `stopHeartbeat()`

Controls heartbeat updates.

**Signature**:
```typescript
protected startHeartbeat(): void
protected stopHeartbeat(): void
```

**Usage**:
```typescript
try {
  processor.startHeartbeat()
  // ... processing ...
} finally {
  processor.stopHeartbeat()
}
```

---

### Retry Manager Functions

#### `classifyError(error: Error)`

Classifies errors for retry eligibility.

**Signature**:
```typescript
export function classifyError(error: Error): ErrorClassification

interface ErrorClassification {
  type: 'transient' | 'permanent' | 'paywall' | 'invalid'
  message: string
  canRetry: boolean
}
```

**Example**:
```typescript
import { classifyError } from '@/worker/lib/retry-manager'

const classification = classifyError(error)
if (classification.canRetry) {
  console.log('Will auto-retry:', classification.message)
}
```

---

#### `recordJobFailure(supabase, jobId, error)`

Records job failure with error classification.

**Signature**:
```typescript
export async function recordJobFailure(
  supabase: SupabaseClient,
  jobId: string,
  error: Error
): Promise<void>
```

**Example**:
```typescript
import { recordJobFailure } from '@/worker/lib/retry-manager'

try {
  await processDocument()
} catch (error) {
  await recordJobFailure(supabase, jobId, error as Error)
}
```

---

## Troubleshooting

### Job Appears Frozen

**Symptoms**: Job at X%, no progress for >1 minute

**Diagnosis**:
1. Check `updated_at` field - should be < 10s ago
2. Check worker logs for errors
3. Check if worker process is running

**Solutions**:
- If `updated_at` is old (>30min), job is stale - worker will auto-recover
- If worker crashed, restart with `npm run dev`
- If job legitimately slow (large document), be patient

---

### Pause Button Disabled

**Symptoms**: "Pause" button grayed out

**Diagnosis**:
Check `progress.checkpoint.can_resume` in database:
```sql
SELECT progress->'checkpoint'->'can_resume'
FROM background_jobs
WHERE id = '<job-id>';
```

**Solutions**:
- Wait for next checkpoint (e.g., after chunking completes)
- Pause button only enabled at pause-safe stages
- Processing stages like "bulletproof matching" are mid-algorithm, not safe to pause

---

### Resume Failed - Checkpoint Missing

**Symptoms**: "Checkpoint no longer exists" error

**Diagnosis**:
1. Check if checkpoint file exists in Storage:
```sql
SELECT last_checkpoint_path FROM background_jobs WHERE id = '<job-id>';
```
2. Verify file in Supabase Storage UI

**Solutions**:
- If file missing, delete job and reprocess document
- If checkpoint corrupted, hash validation will fail gracefully and restart fresh
- **Prevention**: Don't manually delete Storage files for active/paused jobs

---

### Job Fails Immediately After Retry

**Symptoms**: Job retries but fails again instantly

**Diagnosis**:
1. Check `error_message` field for error type
2. Check `retry_count` vs `max_retries`
3. Review worker logs for detailed error

**Solutions**:
- **Transient errors**: Should auto-retry with backoff (wait 1-30 min)
- **Permanent errors**: Requires manual intervention (check logs)
- **Paywall errors**: Check API quota/billing
- **Invalid errors**: Fix input data and manually retry

---

### Checkpoint Hash Mismatch

**Symptoms**: "Hash mismatch, falling back to fresh processing" in logs

**Diagnosis**:
Checkpoint file was modified or corrupted after creation.

**Solutions**:
- System will automatically fall back to fresh processing (graceful)
- No user action needed
- **Prevention**: Don't manually edit checkpoint files in Storage

---

### Worker Not Picking Up Jobs

**Symptoms**: Jobs stuck in 'pending' status

**Diagnosis**:
1. Check if worker is running: `ps aux | grep tsx`
2. Check worker logs: `tail -f /tmp/worker.log`
3. Check for database connection errors

**Solutions**:
- Start worker: `cd worker && npm run dev`
- Check Supabase is running: `npx supabase status`
- Verify environment variables in `worker/.env`

---

### Auto-Retry Not Working

**Symptoms**: Transient errors don't auto-retry

**Diagnosis**:
1. Check `error_message` includes keywords like "timeout", "network", "503"
2. Check `retry_count < max_retries`
3. Verify retry loop is running (logs should show "[RetryManager]" every 30s)

**Solutions**:
- Wait 1-2 minutes for retry loop to pick up job
- Check worker logs for "[RetryManager] Found N job(s) eligible for retry"
- Verify error is classified as 'transient' (check `error_message`)

---

## Performance Considerations

### Job Polling Frequency

- **UI Polling**: 2 seconds (Zustand store)
- **Worker Polling**: 5 seconds (main loop)
- **Retry Polling**: 30 seconds (retry loop)
- **Heartbeat Updates**: 5 seconds (per job)

**Optimization Tips**:
- UI polling only fetches active/recent jobs (< 24 hours)
- Worker uses indexed queries (`status = 'pending'`)
- Heartbeat failures are non-fatal (continue processing)

### Storage Best Practices

**Checkpoint Files**:
- Stored in user-scoped paths: `documents/{userId}/{docId}/`
- Auto-cleaned when document deleted
- Typically 5-50KB (JSON)

**Final Results**:
- `chunks.json`: 100KB-5MB (depends on document size)
- `metadata.json`: 10-500KB
- `manifest.json`: 1-5KB

**Tips**:
- Don't store checkpoints for jobs < 5 minutes (overhead not worth it)
- Checkpoint only at expensive stage boundaries
- Clean up old jobs/documents to free Storage

---

## Migration Guide

### Upgrading from Job System 1.0

**Database Migration**: Run `052_job_pause_resume.sql`

```bash
npx supabase db reset
# or
npx supabase migration up
```

**Code Changes Required**:

1. **Update Type Definitions**: Add 'paused' and 'cancelled' to status types
2. **Update UI Components**: Add pause/resume/retry buttons
3. **Update Handlers**: Add checkpoint tracking and resumption logic

**Breaking Changes**:
- None - migration is non-breaking
- All new columns nullable with defaults
- Existing jobs unaffected

**Rollback**:
- Remove pause/resume columns (optional, non-breaking)
- Revert code changes
- System will work without pause/resume features

---

## Related Documentation

- [Processing Pipeline](./PROCESSING_PIPELINE.md) - 10-stage document processing
- [Storage Patterns](./STORAGE_PATTERNS.md) - Storage vs Database strategy
- [Architecture](./ARCHITECTURE.md) - Overall system architecture
- [Job System Enhancement Plan](./todo/job-system-enhancement-plan.md) - Implementation details

---

**Last Updated**: 2025-10-15
**Version**: 2.0 (Enhanced with Pause/Resume + Auto-Retry)
**Status**: Production Ready ✅
