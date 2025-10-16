# Rhizome V2 Job System Architecture Report

## Executive Summary

This document provides a comprehensive analysis of the background job system in Rhizome V2, including job tracking, state management, worker handlers, storage checkpoints, and gaps for implementing pause/resume/retry functionality.

**Key Findings:**
- 7 job types with inconsistent naming conventions (internal vs display names)
- Progress tracking is partially implemented (percent + stage + message)
- Storage-based checkpointing exists for processing stages
- Several opportunities for implementing pause/resume capabilities
- Current architecture supports some retry logic but lacks comprehensive resumption

---

## 1. Job Store & State Management

### Location
`/Users/topher/Code/rhizome-v2-cached-chunks/src/stores/admin/background-jobs.ts`

### Store Structure

**JobStatus Interface:**
```typescript
interface JobStatus {
  id: string
  type: 'process_document' | 'import_document' | 'export_documents' | 
         'reprocess_connections' | 'obsidian_export' | 'obsidian_sync' | 
         'readwise_import'
  status: 'pending' | 'processing' | 'completed' | 'failed'
  progress: number           // 0-100 percentage
  details: string           // Human-readable message
  metadata?: {
    documentId?: string
    documentIds?: string[]
    title?: string
  }
  result?: any
  error?: string
  createdAt: number
}
```

### Store Features
- **Zustand-based** client-side state management
- **Auto-polling** every 2 seconds when jobs exist
- **Auto-start/stop** polling based on active jobs
- **Temp job IDs** for optimistic UI (`import-{uuid}`, `export-{uuid}`, `reprocess-{uuid}`)
- **Job replacement** mechanism (temp ID → real job ID after creation)
- **Computed selectors**: `activeJobs()`, `completedJobs()`, `failedJobs()`

### Polling Mechanism
```
Frontend polling (2s interval) → background_jobs table
Extracts: status, progress JSONB, output_data, error_message
Maps: progress.percent → progress (%)
      progress.message/stage → details (text)
```

**Gap Identified**: Currently only extracts numeric progress and message, not granular stage data needed for smart resumption.

---

## 2. Job Types & Internal/Display Names

### Current Job Types

| Internal Name | Display Name | Handler | Status |
|---|---|---|---|
| `process_document` | "Processing..." | worker/handlers/process-document.ts | Core |
| `import_document` | "Importing document" | worker/handlers/import-document.ts | Core |
| `export_documents` | "Exporting N documents" | worker/handlers/export-document.ts | Core |
| `reprocess_connections` | "Reprocessing connections" | worker/handlers/reprocess-connections.ts | Core |
| `detect_connections` | (no display mapping yet) | worker/handlers/detect-connections.ts | Async |
| `obsidian_export` | (not shown in dock) | worker/handlers/obsidian-sync.ts | Integration |
| `obsidian_sync` | (not shown in dock) | worker/handlers/obsidian-sync.ts | Integration |
| `readwise_import` | (not shown in dock) | worker/handlers/readwise-import.ts | Integration |

**Inconsistency**: 
- ProcessingDock only maps 3 types (import, export, reprocess)
- detect_connections not exposed in UI
- Integration jobs not shown in display layer

---

## 3. Progress Tracking Mechanisms

### Frontend Progress Display

**ProcessingDock** (`src/components/layout/ProcessingDock.tsx`):
- Shows `job.progress` (numeric 0-100)
- Shows `job.details` (text message)
- Displays progress bar with percentage

**JobList** (`src/components/admin/JobList.tsx`):
- Filters by type and status
- Shows progress bar only for 'processing' status
- Shows metadata (document count for batch exports)

### Backend Progress Storage

**Database Schema** (migration 008):
```sql
progress JSONB DEFAULT '{}'  -- { stage: 'extract', percent: 30, stage_data: {...} }
```

**Progress Structure** (as stored in background_jobs.progress):
```json
{
  "percent": 30,
  "stage": "extraction",
  "substage": "document_extraction",
  "details": "Processing page 45 of 100"
}
```

### Progress Update Methods

**BaseProcessor.updateProgress()** (worker/processors/base.ts):
```typescript
protected async updateProgress(
  percent: number,
  stage: string,
  substage?: string,
  details?: string,
  additionalData: Record<string, any> = {}
)
```

**Handler-specific updateProgress()** (all handlers):
```typescript
async function updateProgress(
  supabase: any,
  jobId: string,
  percentage: number,
  stage: string,
  status: string,
  message?: string
)
```

---

## 4. Storage-Based Checkpointing (saveStageResult)

### Location
`worker/processors/base.ts` - `saveStageResult()` method

### Design Pattern

**Purpose**: Save intermediate processing results to Storage for:
- Portability (can export and reimport)
- Resumability (restart from checkpoint)
- Cost savings (skip re-computation)

**File Naming**:
```
Intermediate: documents/{userId}/{documentId}/stage-{stageName}.json
Final: documents/{userId}/{documentId}/{stageName}.json
```

**Examples**:
```
stage-extraction.json          → Docling extraction + markdown cleanup
stage-chunking.json            → Initial chunks before metadata
chunks.json (final)            → Final processed chunks
metadata.json (final)          → Document metadata
manifest.json (final)          → Document structure summary
```

### Implementation

```typescript
protected async saveStageResult(
  stage: string,
  data: any,
  options?: { final?: boolean }
): Promise<void>
```

**Behavior**:
- Wraps array data in `{ chunks: data, version: "1.0", ... }`
- Adds timestamp and document_id automatically
- Non-fatal: logs warning but doesn't throw on storage failure
- Data still saved to database even if storage fails

---

## 5. Job Handler Analysis

### 5.1 process-document.ts (Main Processing)

**Location**: `worker/handlers/process-document.ts`

**Processing Stages**:
1. **Check cache** (0%) - Load from previous attempt if exists
2. **AI processing** (0-50%) - Via processor (PDF/EPUB/Web/etc)
3. **Markdown save** (60%) - Upload to Storage
4. **Chunking** (65-80%) - Generate embeddings
5. **Database insertion** (85%) - Insert chunks + embeddings
6. **Connection detection** (queued) - Async job creation
7. **Document completion** (100%) - Mark ready

**Progress Checkpoints**:
```
await updateStage(supabase, job.id, 'extracted')     // After AI
await updateStage(supabase, job.id, 'markdown_saved') // After storage upload
await updateStage(supabase, job.id, 'chunked')       // After chunk insert
await updateStage(supabase, job.id, 'embedded')      // After embeddings
```

**Stage Metadata Saved**:
```typescript
metadata: {
  cached_chunks: result.chunks,
  cached_markdown: result.markdown,
  cached_metadata: result.metadata,
  cached_word_count: result.wordCount,
  cached_outline: result.outline,
  processing_stage: 'embedded',
  completed_stages: ['extracting', 'chunked', 'embedded'],
  stage_timestamps: {
    extracting: '2025-10-15T...',
    chunked: '2025-10-15T...',
    embedded: '2025-10-15T...'
  }
}
```

**Resumption Support**: Already tracks completed stages + timestamps
- Can detect fresh vs resume mode
- Skip deletion of chunks if resuming
- Prevents FK violations from duplicate processing

**Gap**: Metadata tracking is internal only, not used for pause/resume UI

### 5.2 import-document.ts (Storage → Database)

**Location**: `worker/handlers/import-document.ts`

**Processing Stages**:
1. **Read Storage** (10%) - Load chunks.json
2. **Validate schema** (20%) - Version check
3. **Apply strategy** (40-60%):
   - `skip`: No-op (40%)
   - `replace`: Delete all, insert new (40-60%)
   - `merge_smart`: Update metadata only (40-60%)
4. **Regenerate embeddings** (optional, 60-90%)
5. **Mark complete** (100%)

**Three Import Strategies**:
- **skip**: Preserve existing, no changes
- **replace**: DELETE all chunks, INSERT from Storage (destructive)
- **merge_smart**: UPDATE metadata only, preserve IDs + annotations

**Progress Updates**:
```typescript
await updateProgress(supabase, job.id, 10, 'reading', 'processing', 'Reading chunks from Storage')
await updateProgress(supabase, job.id, 20, 'validating', 'processing', 'Validating schema version')
await updateProgress(supabase, job.id, 40, 'strategy', 'processing', 'Applying import strategy')
```

**Checkpoint Opportunities**:
- After reading Storage → can resume at validation
- After validation → can resume at strategy application
- After strategy → can resume at embedding

### 5.3 export-document.ts (Database → ZIP Storage)

**Location**: `worker/handlers/export-document.ts`

**Processing Stages**:
1. **Get metadata** (5%) - Query documents
2. **Create ZIP** (10%) - Initialize JSZip
3. **Process documents** (10-90%) - For each document:
   - List Storage files
   - Read files (PDFs, markdown, JSON)
   - Add to ZIP folder
   - Query connections (optional)
   - Add annotations (optional)
4. **Add manifest** (90%) - Top-level manifest.json
5. **Generate ZIP blob** (95%)
6. **Save to Storage** (97%)
7. **Create signed URL** (99%)
8. **Mark complete** (100%)

**Checkpoint Opportunities**:
- After metadata fetch
- After each document processing
- Before ZIP blob generation

### 5.4 reprocess-connections.ts (Smart Connection Regeneration)

**Location**: `worker/handlers/reprocess-connections.ts`

**Processing Stages**:
1. **Prepare** (10%) - Query chunk IDs
2. **Count before** (20%) - Get baseline connection count
3. **Mode-specific**:
   - **all** (20-25%): Delete all connections
   - **smart** (15-25%): Query validated, backup, delete non-validated
   - **add_new** (20-25%): Find newer documents, filter targets
4. **Run orchestrator** (40-90%) - 3-engine collision detection
5. **Count after** (90%) - Get final connection count
6. **Mark complete** (100%)

**Modes**:
- **all**: Delete all → regenerate from scratch
- **add_new**: Keep existing → add connections to newer documents only
- **smart**: Preserve user-validated → regenerate rest

**Backup Feature**:
```typescript
if (options.backupFirst && validatedCount > 0) {
  backupPath = `${userId}/${documentId}/validated-connections-${timestamp}.json`
}
```

### 5.5 detect-connections.ts (Async Connection Detection)

**Location**: `worker/handlers/detect-connections.ts`

**Simplified Handler**: Calls `processDocument()` orchestrator
- No intermediate stages tracked
- No checkpointing

**Gap**: Could benefit from same checkpointing as main processing

### 5.6 readwise-import.ts, obsidian-sync.ts

**Status**: Integration handlers
- Not fully documented in handlers
- No explicit stage tracking visible

---

## 6. Database Schema

### background_jobs Table

**Location**: `supabase/migrations/008_background_jobs.sql`

**Schema**:
```sql
CREATE TABLE background_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  
  -- Job type discrimination
  job_type TEXT NOT NULL,
  entity_type TEXT,
  entity_id UUID,
  
  -- Job state
  status TEXT DEFAULT 'pending',  -- pending, processing, completed, failed, cancelled
  progress JSONB DEFAULT '{}',    -- { percent, stage, substage, details, ... }
  input_data JSONB DEFAULT '{}',  -- Job-specific parameters
  
  -- Retry logic
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 3,
  last_error TEXT,
  next_retry_at TIMESTAMPTZ,
  
  -- Timing
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Error Fields** (migration 011):
```sql
ALTER TABLE background_jobs
  ADD COLUMN error_type TEXT,          -- transient, permanent, paywall, invalid
  ADD COLUMN error_message TEXT;       -- User-friendly message with recovery guidance
```

### Key Observations

**Gaps for Pause/Resume**:
1. No `paused_at` or `pause_reason` field
2. No `resumed_at` or `resume_count` field
3. `metadata` field not in schema (exists but not DDL-defined, gets stored in progress JSONB)
4. No `checkpoint_stage` field

**Retry Fields Exist**:
- `retry_count`, `max_retries`, `last_error`, `next_retry_at`
- But no automatic retry implementation visible in handlers

---

## 7. Admin Panel Display Components

### ProcessingDock (Bottom-right floating widget)

**File**: `src/components/layout/ProcessingDock.tsx`

**Display**:
- Only shows ACTIVE jobs (processing/pending)
- Hides when Admin Panel open
- Collapse/expand toggle
- Progress bar + percentage for each job
- X button to cancel job

**Job Title Generation**:
```typescript
const getJobTitle = (job: any): string => {
  if (job.type === 'import_document') {
    return job.metadata?.title || 'Importing document'
  }
  if (job.type === 'export_documents') {
    const count = job.metadata?.documentIds?.length || 1
    return `Exporting ${count} document${count > 1 ? 's' : ''}`
  }
  if (job.type === 'reprocess_connections') {
    return 'Reprocessing connections'
  }
  return 'Processing...'
}
```

**Missing Types**: No display mappings for detect_connections, obsidian_export, obsidian_sync, readwise_import

### JobList (Shared component)

**File**: `src/components/admin/JobList.tsx`

**Features**:
- Type-based filters: all, import, export, connections
- Status-based filters: active, completed, failed
- Sorts by creation time (newest first)
- Shows counts on filter badges

**Job Type Labels** (incomplete):
```typescript
const jobTypeLabels: Record<JobStatus['type'], string> = {
  import_document: 'Import',
  export_documents: 'Export',
  reprocess_connections: 'Connections',
}
```

**Gap**: Only 3 of 7 types have display labels

### JobsTab (Admin Panel tab)

**File**: `src/components/admin/tabs/JobsTab.tsx`

**Features**:
- Displays all jobs with filtering
- Quick Actions:
  - Clear Completed Jobs
  - Clear Failed Jobs
- Emergency Controls:
  - Stop All Processing (force-fail all active)
  - Clear All Jobs (delete all regardless of status)
  - Nuclear Reset (delete jobs + all processing documents)

---

## 8. Job Management Actions

**File**: `src/app/actions/admin.ts`

### Key Actions

1. **clearCompletedJobs()**: Delete all completed jobs
2. **clearFailedJobs()**: Delete all failed jobs
3. **forceFailAllProcessing()**: Mark all processing as failed, then delete
4. **clearAllJobs()**: Delete all jobs (after fixing orphaned documents)
5. **clearAllJobsAndProcessingDocuments()**: NUCLEAR - delete jobs + processing docs + storage
6. **cancelAndDeleteJob(jobId)**: Mark cancelled → delete specific job
7. **forceFailJob(jobId)**: Reset stuck job to failed state
8. **deleteJob(jobId)**: Direct deletion
9. **fixOrphanedDocuments()**: Find processing docs with no active jobs
10. **deleteDocument()**: Comprehensive deletion (doc + chunks + connections + storage)

### Cancellation Flow

```
User clicks X on job
→ cancelAndDeleteJob(jobId)
  → Mark status='cancelled' (worker checks heartbeat)
  → Wait 100ms (give worker time to see it)
  → Delete from database
  → UI removes from store
```

**Gap**: No pause functionality (only cancel/delete)

---

## 9. Current Progress Tracking in Practice

### Example: process-document.ts

```javascript
// Initial progress
await updateProgress(supabase, job.id, 10, 'reading', 'processing', 'Reading from source')

// AI processing (0-50% mapped to 10-50%)
result = await processor.process()

// After cache (if used)
progress: {
  percent: 30,
  stage: 'cached',
  details: 'Using cached processing result from previous attempt'
}

// Chunking
await updateProgress(supabase, job.id, 65, 'chunking', 'processing', 'Generating embeddings for 234 chunks')

// Completion
await updateProgress(supabase, job.id, 100, 'complete', 'completed', 'Processing completed successfully')
```

### Polling Chain

```
Frontend (2s) → background_jobs.progress
  ↓
Extract: percent, stage, details, message
  ↓
zustand store: updateJob({ progress: percent, details: message })
  ↓
UI renders: Progress bar + job.details text
```

---

## 10. Gaps & Opportunities for Pause/Resume/Retry

### Gap 1: No Pause State

**Current**: pending → processing → completed/failed
**Missing**: pending → processing → **paused** → processing (resume)

**Opportunity**:
- Add `status: 'paused'` to allowed values
- Track pause reason in `progress.pause_reason`
- UI button to resume from paused state

### Gap 2: Stage Data Not Exported

**Current**: Progress stored in `progress` JSONB, stages only in metadata
**Issue**: Can't distinguish between:
- Job at 30% (extraction phase, could resume)
- Job at 30% (early embedding phase, might skip)

**Opportunity**:
- Store stage-specific data in `progress.stage_data`
- Include checkpoint paths for each stage
- Example:
```json
{
  "percent": 50,
  "stage": "chunking",
  "stage_data": {
    "chunks_processed": 234,
    "checkpoint_path": "documents/user/doc/stage-chunking.json",
    "checkpoint_hash": "abc123"
  }
}
```

### Gap 3: No Checkpoint State Tracking

**Current**: Checkpoints saved but not referenced in job
**Missing**: Link between job progress and checkpoint files

**Opportunity**:
```typescript
// In job metadata
metadata: {
  last_checkpoint: {
    stage: 'chunking',
    path: 'documents/user/doc/stage-chunking.json',
    timestamp: '2025-10-15T10:30:00Z',
    can_resume: true
  }
}
```

### Gap 4: No Resumption Logic

**Current**: If job fails, must restart from beginning
**Missing**: Checkpoint-aware resumption

**Opportunity**:
```typescript
// In handler resumption
if (job.metadata?.last_checkpoint?.can_resume) {
  const checkpoint = await readFromStorage(checkpointPath)
  result = {
    ...checkpoint.data,
    // Skip to next stage
  }
}
```

### Gap 5: Partial Retry Implementation

**Current**: 
- Retry fields exist in schema (retry_count, max_retries, next_retry_at)
- Error classification exists (transient, permanent, paywall, invalid)
- BaseProcessor.withRetry() wraps operations

**Missing**: 
- Job system doesn't use retry_count/next_retry_at
- No automatic retry polling or queue system
- Manual actions only (forceFailJob)

**Opportunity**:
```typescript
// In worker index loop
const failedJobs = await supabase
  .from('background_jobs')
  .select('*')
  .eq('status', 'failed')
  .eq('retry_count', '<', 'max_retries')
  .lt('next_retry_at', 'now()')

// Re-queue each job
for (const job of failedJobs) {
  await runJobHandler(job)
}
```

### Gap 6: Job Type Display Incomplete

**Current**: 7 job types, only 3 mapped for display
**Missing**: UI labels for detect_connections, obsidian_*, readwise_*

**Opportunity**:
```typescript
// Expand jobTypeLabels
const jobTypeLabels: Record<JobStatus['type'], string> = {
  process_document: 'Processing',
  import_document: 'Import',
  export_documents: 'Export',
  reprocess_connections: 'Connections',
  detect_connections: 'Detecting',
  obsidian_export: 'Obsidian Export',
  obsidian_sync: 'Obsidian Sync',
  readwise_import: 'Readwise Import'
}
```

### Gap 7: No Granular Stage Filtering

**Current**: Filter by job type and status only
**Missing**: Filter by stage (e.g., "show all jobs stuck in chunking stage")

**Opportunity**: Add stage-based filter for debugging
```typescript
activeFilter: 'all' | 'import' | 'export' | 'connections' | 
             'active' | 'completed' | 'failed' |
             'stage:chunking' | 'stage:extraction' | ...
```

### Gap 8: Storage Checkpoint Not Linked to UI

**Current**: Checkpoints saved automatically, no visibility
**Missing**: UI indication that job has resumable checkpoint

**Opportunity**:
- Show "Resumable checkpoint available" in job detail
- Show checkpoint timestamp and size
- Button to "Resume from checkpoint" vs "Restart from beginning"

---

## 11. Summary Table: Files & Locations

### Core Job System

| Component | File Path | Size | Purpose |
|---|---|---|---|
| Job Store | `src/stores/admin/background-jobs.ts` | 330 lines | Zustand state, polling, UI sync |
| Processing Dock | `src/components/layout/ProcessingDock.tsx` | 189 lines | Real-time job display widget |
| Job List | `src/components/admin/JobList.tsx` | 250 lines | Filterable job history |
| Jobs Tab | `src/components/admin/tabs/JobsTab.tsx` | 220 lines | Admin panel job controls |
| Admin Actions | `src/app/actions/admin.ts` | 636 lines | Job management (clear, fail, delete) |

### Worker Handlers

| Handler | File Path | Stages | Checkpoints |
|---|---|---|---|
| process-document | `worker/handlers/process-document.ts` | 8 | Yes (markdown, chunks, embeddings) |
| import-document | `worker/handlers/import-document.ts` | 5 | Yes (before strategy, after strategy) |
| export-document | `worker/handlers/export-document.ts` | 8 | Partial (per-document) |
| reprocess-connections | `worker/handlers/reprocess-connections.ts` | 5 | Minimal (mode-specific) |
| detect-connections | `worker/handlers/detect-connections.ts` | 3 | No |

### Supporting

| File | Purpose | Key Functions |
|---|---|---|
| `worker/processors/base.ts` | Base processor class | `updateProgress()`, `saveStageResult()`, `withRetry()` |
| `worker/processors/pdf-processor.ts` | PDF extraction | Implements SourceProcessor |
| `worker/processors/epub-processor.ts` | EPUB extraction | Implements SourceProcessor |
| Migration 008 | Schema | background_jobs table creation |
| Migration 011 | Schema | error_type, error_message columns |

---

## 12. Recommendations for Implementing Pause/Resume/Retry

### Phase 1: Database Schema (Non-Breaking)

```sql
-- Add pause/resume support
ALTER TABLE background_jobs
  ADD COLUMN paused_at TIMESTAMPTZ,
  ADD COLUMN resumed_at TIMESTAMPTZ,
  ADD COLUMN pause_reason TEXT,
  ADD COLUMN resume_count INTEGER DEFAULT 0,
  ADD COLUMN last_checkpoint_path TEXT,
  ADD COLUMN last_checkpoint_stage TEXT;

-- Index for pause/resume
CREATE INDEX idx_background_jobs_paused ON background_jobs(status, paused_at) 
  WHERE status = 'paused';
```

### Phase 2: Handler Updates

1. **Track checkpoints in job metadata**:
```typescript
metadata: {
  last_checkpoint: {
    stage: 'chunking',
    path: 'documents/.../stage-chunking.json',
    timestamp: ISO string,
    can_resume_from_here: boolean
  }
}
```

2. **Enable resumption logic** in each handler
3. **Add stage-data tracking** to progress object

### Phase 3: UI Features

1. Expand job type display labels (all 7 types)
2. Add "Pause Job" button alongside "Cancel Job"
3. Show checkpoint info in job detail view
4. Add "Resume from checkpoint" button when available
5. Add stage-based filtering to JobList

### Phase 4: Retry System

1. Implement retry polling loop in worker index
2. Use retry_count, max_retries, next_retry_at fields
3. Classify errors and decide retry eligibility
4. Exponential backoff timing

---

## 13. Code Examples for Implementation

### Example 1: Pause a Job

```typescript
// In admin.ts
export async function pauseJob(jobId: string) {
  const supabase = await createClient()
  
  const { error } = await supabase
    .from('background_jobs')
    .update({
      status: 'paused',
      paused_at: new Date().toISOString(),
      progress: {
        ...job.progress,
        pause_reason: 'User paused job'
      }
    })
    .eq('id', jobId)
  
  return { success: !error, error: error?.message }
}
```

### Example 2: Resume from Checkpoint

```typescript
// In process-document.ts handler
if (job.status === 'paused' && job.last_checkpoint_path) {
  console.log(`Resuming from checkpoint: ${job.last_checkpoint_stage}`)
  const checkpoint = await readFromStorage(supabase, job.last_checkpoint_path)
  
  // Skip to next stage
  result = checkpoint.data
  startStage = getNextStage(job.last_checkpoint_stage)
}
```

### Example 3: Expand Job Type Display

```typescript
// In JobList.tsx
const jobTypeLabels: Record<JobStatus['type'], string> = {
  process_document: 'Processing',
  import_document: 'Import',
  export_documents: 'Export',
  reprocess_connections: 'Connections',
  detect_connections: 'Detecting',
  obsidian_export: 'Obsidian Export',
  obsidian_sync: 'Obsidian Sync',
  readwise_import: 'Readwise Import'
}

const jobTypeIcons: Record<JobStatus['type'], React.ReactNode> = {
  process_document: <Zap className="size-4" />,
  import_document: <Database className="size-4" />,
  export_documents: <FileText className="size-4" />,
  reprocess_connections: <Network className="size-4" />,
  detect_connections: <GitBranch className="size-4" />,
  obsidian_export: <Lightbulb className="size-4" />,
  obsidian_sync: <Sync className="size-4" />,
  readwise_import: <BookOpen className="size-4" />
}
```

---

## 14. Risk Assessment

### Risk: Resuming from Checkpoint with Stale Data

**Issue**: Chunks in database may have been deleted/updated since checkpoint
**Mitigation**: 
- Hash checkpoint data at creation time
- Verify hash before resuming
- Fall back to fresh processing if mismatch

### Risk: Pause During Critical Transaction

**Issue**: Pausing mid-database-write could leave inconsistent state
**Mitigation**:
- Only allow pause at safe checkpoints
- Define pause-safe stages (between major operations)
- Mark unsafe stages as non-pausable

### Risk: Orphaned Storage Files

**Issue**: Checkpoint files left in storage if job deleted
**Mitigation**:
- Clean up stage-*.json files when job completes or deleted
- Implement storage cleanup routine
- Document checkpoint retention policy

---

## 15. Conclusion

The Rhizome V2 job system has **solid foundations** for pause/resume functionality:
- ✅ Multi-stage processing architecture
- ✅ Storage-based checkpointing mechanism
- ✅ Progress tracking with stage information
- ✅ Error classification for smart retry

But requires **targeted enhancements**:
- Add pause/resume states to schema
- Link checkpoints to job metadata
- Expand UI to show all job types
- Implement resumption logic in handlers
- Build retry polling loop

The infrastructure is 70% ready; implementation effort is primarily in:
1. Database schema additions (non-breaking)
2. Handler resumption logic (~200 lines per handler)
3. UI features (pause button, checkpoint display)
4. Worker retry loop (100-150 lines)

**Estimated Effort**: 2-3 days for full implementation
