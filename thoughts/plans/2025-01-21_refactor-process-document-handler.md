# Refactor process-document.ts Handler - Implementation Plan

**Created**: 2025-01-21
**Status**: Draft
**Goal**: Refactor monolithic process-document.ts (662 lines) into modular, reusable architecture

---

## Overview

Transform the 662-line `process-document.ts` handler into a modular architecture through **5 incremental phases**, extracting reusable utilities that other handlers can leverage. Focus on enabling reusability while maintaining stability through comprehensive testing after each phase.

**Primary Driver**: Enable reusability (heartbeat, cache, progress tracking) across all 16 handlers
**Secondary Goals**: Improve testability, readability, and maintainability

---

## Current State Analysis

### What Exists

**File**: `worker/handlers/process-document.ts` (662 lines)

**Responsibilities** (12 distinct concerns):
1. Checkpoint resume system (lines 34-89)
2. Cache detection & loading (lines 156-188)
3. Fresh AI processing orchestration (lines 190-257)
4. Heartbeat & cancellation monitoring (lines 204-242)
5. Result caching for retry safety (lines 259-286)
6. Markdown storage operations (lines 304-349)
7. Manual review workflow (lines 351-419)
8. Embedding generation (lines 421-451)
9. Chunk database insertion (lines 453-534)
10. Connection detection queuing (lines 536-579)
11. Finalization & status updates (lines 581-618)
12. Error handling & classification (lines 619-661)

**Helper Functions** (at bottom, lines 664-788):
- `tryResumeFromCheckpoint()` (lines 34-89)
- `getNextStageAfterCheckpoint()` (lines 18-28)
- `updateStage()` (lines 671-701)
- `updateDocumentStatus()` (lines 715-753)
- `updateProgress()` (lines 765-788)

**Current Pain Points** (from user feedback):
- ❌ Hard to modify (changes touch many parts)
- ❌ Hard to debug (complex nested logic)
- ❌ Hard to understand (takes time to trace flow)
- ❌ Hard to test (can't unit test specific logic)

### Key Discoveries

**Reusable Patterns Found** (from codebase analysis):

1. **Progress Tracking**: All 16 handlers use identical `updateProgress()` signature
   - Location: Local function in each handler
   - Pattern: `worker/handlers/export-document.ts:374-397`
   - Why local: Each handler has different stages/percentages

2. **Heartbeat System**: Only in process-document.ts, but needed by:
   - `continue-processing.ts` (resume long operations)
   - `detect-connections.ts` (3-engine orchestration)
   - `reprocess-document.ts` (full reprocessing)
   - `import-document.ts` (large imports)

3. **Cache Management**: Existing pattern at `worker/lib/cache-manager.ts`
   - LRU cache with TTL support
   - Namespace isolation
   - Statistics tracking

4. **Storage Operations**: Existing utilities at `worker/lib/storage-helpers.ts`
   - `saveToStorage()`, `readFromStorage()`
   - Non-fatal error handling
   - Pattern reference for new utilities

**Chonkie Integration** (unified pipeline):
- All 7 processors now use Chonkie chunking (`worker/lib/chonkie/`)
- Metadata transfer via overlap detection (`metadata-transfer.ts`)
- Bulletproof matching for coordinate mapping (`worker/lib/local/bulletproof-matcher.ts`)

**Legacy Chunking Files** (potentially obsolete):
- ⚠️ `worker/lib/ai-chunking.ts` - Pre-Chonkie AI chunking (8 imports found)
- ⚠️ `worker/lib/ai-chunking-batch.ts` - Batch AI chunking (8 imports found)
- ⚠️ `worker/lib/chunking/ai-fuzzy-matcher.ts` - AI fuzzy matching (check usage)
- ⚠️ `worker/lib/chunking/batch-creator.ts` - Batch creation (check usage)
- ⚠️ `worker/lib/chunking/prompts.ts` - Chunking prompts (1 import found)

**Ad-hoc Test Files** (root level, should be in `tests/`):
- `worker/test-*.ts` (8 files) - Should move or delete

---

## Desired End State

### File Structure

```
worker/
├── handlers/
│   └── process-document.ts        (~150 lines - orchestration only)
├── lib/
│   ├── processing/                (NEW - extracted from handler)
│   │   ├── checkpoint-manager.ts  (checkpoint recovery)
│   │   ├── cache-manager.ts       (cache operations, extends existing)
│   │   ├── manual-review.ts       (review workflow)
│   │   ├── embedding-pipeline.ts  (embeddings)
│   │   └── document-storage.ts    (storage operations)
│   ├── job-heartbeat.ts           (NEW - reusable heartbeat)
│   └── job-updates.ts             (NEW - progress/stage/status helpers)
└── types/
    └── processing.ts              (NEW - shared types)
```

### Success Criteria

#### Automated Verification:
- [ ] All tests pass: `cd worker && npm test`
- [ ] Integration tests pass: `npm run test:integration`
- [ ] Type check passes: `npm run type-check`
- [ ] Worker starts successfully: `npm run dev`

#### Manual Verification:
- [ ] Upload PDF → verify complete processing (all 10 stages)
- [ ] Heartbeat works (cancellation responsive within 10s)
- [ ] Pause/resume works (checkpoint recovery)
- [ ] Error handling works (retry logic intact)
- [ ] Other handlers can import new utilities

**Implementation Note**: Pause after each phase's automated verification passes for manual confirmation before proceeding to next phase.

---

## Rhizome Architecture

- **Module**: Worker only (no main app changes)
- **Storage**: No changes (handler uses existing storage-helpers.ts)
- **Migration**: No database changes needed
- **Test Tier**: Stable (fix when broken, not critical path blocker)
- **Pipeline Stages**: All 10 stages (no changes to pipeline logic)
- **Engines**: No impact on 3-engine orchestration

---

## What We're NOT Doing

**Out of scope to prevent scope creep:**
- ❌ Changing pipeline logic or stage order
- ❌ Modifying processor implementations
- ❌ Refactoring other handlers (those come later, reuse new utilities)
- ❌ Changing database schema or queries
- ❌ Optimizing performance (unless regressions found)
- ❌ Adding new features to the handler
- ❌ Changing error handling behavior (only extracting to modules)

---

## Implementation Approach

**Strategy**: Incremental extraction with validation gates

**Why Incremental?**
- Lower risk (validate at each step)
- Can rollback easily (Git commits per phase)
- User feedback between phases
- Easier debugging if issues arise

**Pattern**: Extract → Test → Commit → Next

---

## Phase 1: Extract Reusable Utilities (Low Risk, High Value)

### Overview
Extract utilities that have zero business logic dependencies and can be reused immediately by other handlers.

### Changes Required

#### 1. Create `worker/lib/job-heartbeat.ts`

**Purpose**: Reusable heartbeat system for long-running jobs

**Extract from**: `process-document.ts:204-242`

```typescript
/**
 * Job Heartbeat System
 *
 * Provides responsive cancellation checking and stale prevention for long-running jobs.
 * Automatically updates job timestamps to prevent stale detection.
 *
 * Pattern reference: worker/handlers/process-document.ts:204-242
 */

export interface HeartbeatConfig {
  /** How often to check for cancellation (default: 10s) */
  cancellationCheckInterval?: number
  /** How often to update timestamp (default: every 30 checks = 5min) */
  timestampUpdateEvery?: number
  /** Custom cancellation callback */
  onCancelled?: () => void
}

export class JobHeartbeat {
  private intervalId: NodeJS.Timeout | null = null
  private heartbeatCount = 0
  private cancelled = false

  constructor(
    private supabase: any,
    private jobId: string,
    private config: HeartbeatConfig = {}
  ) {
    this.config.cancellationCheckInterval ??= 10 * 1000 // 10 seconds
    this.config.timestampUpdateEvery ??= 30 // 5 minutes at 10s intervals
  }

  /**
   * Start heartbeat monitoring
   * Checks for cancellation every 10s, updates timestamp every 5 min
   */
  start(): void {
    if (this.intervalId) {
      console.warn('[Heartbeat] Already started')
      return
    }

    console.log('[Heartbeat] Started')

    this.intervalId = setInterval(async () => {
      this.heartbeatCount++

      try {
        // ALWAYS check for cancellation (every 10 seconds)
        const { data: currentJob } = await this.supabase
          .from('background_jobs')
          .select('status')
          .eq('id', this.jobId)
          .single()

        if (currentJob?.status === 'cancelled') {
          console.log('[Heartbeat] ⚠️  Job has been cancelled - stopping processing')
          this.cancelled = true
          this.stop()

          if (this.config.onCancelled) {
            this.config.onCancelled()
          }

          return
        }

        // Update timestamp periodically (every 5 minutes)
        if (this.heartbeatCount % this.config.timestampUpdateEvery! === 0) {
          console.log('[Heartbeat] Updating job timestamp to prevent stale detection...')
          await this.supabase
            .from('background_jobs')
            .update({
              started_at: new Date().toISOString() // Reset timeout clock
            })
            .eq('id', this.jobId)
        }
      } catch (error) {
        console.error('[Heartbeat] Failed to check status:', error)
      }
    }, this.config.cancellationCheckInterval)
  }

  /**
   * Stop heartbeat monitoring
   * CRITICAL: Always call in finally block to prevent memory leaks
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId)
      this.intervalId = null
      console.log('[Heartbeat] Stopped')
    }
  }

  /**
   * Check if job was cancelled
   * Throw error if cancelled during processing
   */
  throwIfCancelled(): void {
    if (this.cancelled) {
      throw new Error('Job was cancelled during processing')
    }
  }

  /**
   * Get current cancellation status
   */
  isCancelled(): boolean {
    return this.cancelled
  }
}
```

**Usage in handler**:
```typescript
// Before (lines 204-257)
let jobCancelled = false
const heartbeatInterval = setInterval(async () => { /* 38 lines */ }, 10000)
try {
  result = await processor.process()
  if (jobCancelled) throw new Error('Job was cancelled')
} finally {
  clearInterval(heartbeatInterval)
}

// After
import { JobHeartbeat } from '../lib/job-heartbeat.js'

const heartbeat = new JobHeartbeat(supabase, job.id)
heartbeat.start()
try {
  result = await processor.process()
  heartbeat.throwIfCancelled()
} finally {
  heartbeat.stop()
}
```

**Benefits**:
- ✅ Reusable by other handlers (continue-processing, detect-connections, import-document)
- ✅ Testable in isolation (mock Supabase client)
- ✅ Configurable intervals
- ✅ Memory leak prevention enforced (stop() in finally)

---

#### 2. Create `worker/lib/job-updates.ts`

**Purpose**: Standardized job update helpers

**Extract from**: `process-document.ts:671-788` (helper functions)

```typescript
/**
 * Job Update Utilities
 *
 * Standardized helpers for updating job progress, stage, and document status.
 * Used across all handlers for consistent progress reporting.
 *
 * Pattern reference: worker/handlers/process-document.ts:671-788
 */

/**
 * Update processing stage in job metadata for idempotent retry.
 *
 * @param supabase - Supabase client
 * @param jobId - Job ID to update
 * @param stage - Current processing stage
 */
export async function updateStage(
  supabase: any,
  jobId: string,
  stage: string
): Promise<void> {
  const { data: job } = await supabase
    .from('background_jobs')
    .select('metadata')
    .eq('id', jobId)
    .single()

  const metadata = job?.metadata || {}
  const completedStages = metadata.completed_stages || []

  await supabase
    .from('background_jobs')
    .update({
      metadata: {
        ...metadata,
        processing_stage: stage,
        completed_stages: [...completedStages, stage],
        stage_timestamps: {
          ...metadata.stage_timestamps,
          [stage]: new Date().toISOString()
        }
      }
    })
    .eq('id', jobId)

  console.log(`📍 Stage updated: ${stage}`)
}

/**
 * Update document processing status in database.
 *
 * @param supabase - Supabase client
 * @param documentId - Document ID to update
 * @param status - New processing status
 * @param markdownAvailable - Whether markdown content is available
 * @param embeddingsAvailable - Whether chunk embeddings generated
 * @param errorMessage - Optional error message if failed
 * @param sourceMetadata - Optional source-specific metadata
 * @param sourceType - Optional explicit source type
 */
export async function updateDocumentStatus(
  supabase: any,
  documentId: string,
  status: string,
  markdownAvailable: boolean = false,
  embeddingsAvailable: boolean = false,
  errorMessage?: string,
  sourceMetadata?: any,
  sourceType?: string
): Promise<void> {
  const updateData: any = {
    processing_status: status,
    markdown_available: markdownAvailable,
    embeddings_available: embeddingsAvailable
  }

  if (errorMessage) {
    updateData.processing_error = errorMessage
  }

  if (sourceMetadata) {
    updateData.source_metadata = sourceMetadata
  }

  if (sourceType) {
    updateData.source_type = sourceType
  }

  const { error } = await supabase
    .from('documents')
    .update(updateData)
    .eq('id', documentId)

  if (error) {
    console.error('Failed to update document status:', error)
  }
}

/**
 * Update job progress in background_jobs table.
 *
 * @param supabase - Supabase client
 * @param jobId - Job ID to update
 * @param percentage - Progress percentage (0-100)
 * @param stage - Current processing stage
 * @param status - Job status
 * @param message - Human-readable progress message
 */
export async function updateProgress(
  supabase: any,
  jobId: string,
  percentage: number,
  stage: string,
  status: string,
  message?: string
): Promise<void> {
  const { error } = await supabase
    .from('background_jobs')
    .update({
      progress: {
        percent: percentage,
        stage,
        details: message || `${stage}: ${percentage}%`
      },
      status
    })
    .eq('id', jobId)

  if (error) {
    console.error('Failed to update job progress:', error)
  }
}
```

**Usage in handler**:
```typescript
// Before
await updateProgress(supabase, job.id, 65, 'chunking', 'processing', 'Preparing chunks')
await updateStage(supabase, job.id, 'chunked')
await updateDocumentStatus(supabase, documentId, 'completed', true, true)

// After
import { updateProgress, updateStage, updateDocumentStatus } from '../lib/job-updates.js'

await updateProgress(supabase, job.id, 65, 'chunking', 'processing', 'Preparing chunks')
await updateStage(supabase, job.id, 'chunked')
await updateDocumentStatus(supabase, documentId, 'completed', true, true)
// Same API, just imported from module
```

**Benefits**:
- ✅ Reusable across all 16 handlers
- ✅ Consistent progress reporting
- ✅ Centralized logging
- ✅ Easy to extend (add metrics, telemetry)

---

### Testing Strategy

**Unit Tests**: Create `worker/lib/__tests__/job-heartbeat.test.ts`
```typescript
describe('JobHeartbeat', () => {
  it('should check for cancellation every 10 seconds')
  it('should update timestamp every 5 minutes')
  it('should stop on cancellation')
  it('should call onCancelled callback')
  it('should throw when cancelled')
})
```

**Unit Tests**: Create `worker/lib/__tests__/job-updates.test.ts`
```typescript
describe('job-updates', () => {
  it('should update stage with timestamps')
  it('should update document status with all fields')
  it('should update progress with default message')
})
```

**Integration Test**: Modify `worker/handlers/process-document.ts` to use new utilities, then:
```bash
cd worker
npm test                    # Unit tests
npm run test:integration    # Full pipeline test
npx tsx scripts/test-pdf-storage-integration.ts  # Manual test
```

### Success Criteria

#### Automated Verification:
- [ ] Unit tests pass: `npm test`
- [ ] Integration tests pass: `npm run test:integration`
- [ ] Type check passes: `npm run type-check`
- [ ] No new errors in worker logs

#### Manual Verification:
- [ ] Upload PDF → verify processing completes
- [ ] Click Cancel during processing → verify cancellation within 10s
- [ ] Check job progress updates in UI
- [ ] Verify timestamp updates in background_jobs table

### Service Restarts:
- [ ] Worker: restart via `npm run dev`
- [ ] Verify no Supabase changes needed

---

## Phase 2: Extract Cache Management (Medium Risk, High Reusability)

### Overview
Extract cache operations into dedicated module, extending existing cache-manager.ts pattern.

### Changes Required

#### 1. Create `worker/lib/processing/cache-manager.ts`

**Purpose**: Processing result cache for retry safety

**Extract from**: `process-document.ts:156-188, 259-286`

```typescript
/**
 * Processing Cache Manager
 *
 * Manages caching of expensive AI processing results for retry safety.
 * Extends existing cache-manager.ts pattern for processing-specific caching.
 *
 * Pattern reference: worker/lib/cache-manager.ts (LRU cache pattern)
 * Usage: worker/handlers/process-document.ts:156-188
 */

import type { ProcessResult } from '../../types/processor.js'

export interface CachedProcessingResult {
  chunks: any[]
  markdown: string
  metadata?: any
  wordCount?: number
  outline?: any[]
  cacheCreatedAt: string
}

export interface ProcessingStage {
  stage: string
  completedStages: string[]
  stageTimestamps: Record<string, string>
}

/**
 * Check for cached processing result from previous attempt
 *
 * @param job - Background job with metadata
 * @returns Cached result or null if not found
 */
export function getCachedResult(job: any): ProcessResult | null {
  const {
    cached_chunks,
    cached_markdown,
    cached_metadata,
    cached_word_count,
    cached_outline
  } = job.metadata || {}

  // Must have both chunks and markdown to be valid
  if (!cached_chunks || !cached_markdown) {
    return null
  }

  console.log(`♻️  Using cached processing result from previous attempt`)
  console.log(`   - Cached chunks: ${cached_chunks.length}`)
  console.log(`   - Word count: ${cached_word_count || 'unknown'}`)
  console.log(`💰 Saved ~$0.40 by skipping AI re-processing`)

  return {
    markdown: cached_markdown,
    chunks: cached_chunks,
    metadata: cached_metadata,
    wordCount: cached_word_count,
    outline: cached_outline
  }
}

/**
 * Cache processing result immediately after AI processing
 * CRITICAL: Do this BEFORE database operations for retry safety
 *
 * @param supabase - Supabase client
 * @param jobId - Job ID
 * @param result - Processing result to cache
 */
export async function cacheProcessingResult(
  supabase: any,
  jobId: string,
  result: ProcessResult
): Promise<void> {
  console.log(`💾 Caching processing result for retry safety`)
  console.log(`   - Chunks to cache: ${result.chunks.length}`)
  console.log(`   - Markdown size: ${Math.round(result.markdown.length / 1024)}KB`)

  await supabase
    .from('background_jobs')
    .update({
      metadata: {
        // Cache all results
        cached_chunks: result.chunks,
        cached_markdown: result.markdown,
        cached_metadata: result.metadata,
        cached_word_count: result.wordCount,
        cached_outline: result.outline,
        cache_created_at: new Date().toISOString(),

        // Stage tracking for idempotent retry
        processing_stage: 'extracted',
        completed_stages: ['extracting'],
        stage_timestamps: {
          extracting: new Date().toISOString()
        }
      }
    })
    .eq('id', jobId)

  console.log(`✅ Processing complete and cached (stage: extracted)`)
}

/**
 * Get current processing stage from job metadata
 *
 * @param job - Background job
 * @returns Processing stage info
 */
export function getProcessingStage(job: any): ProcessingStage {
  const metadata = job.metadata || {}

  return {
    stage: metadata.processing_stage || 'pending',
    completedStages: metadata.completed_stages || [],
    stageTimestamps: metadata.stage_timestamps || {}
  }
}

/**
 * Check if this is a resume operation (not fresh processing)
 *
 * @param job - Background job
 * @returns True if resuming from a previous attempt
 */
export function isResumeOperation(job: any): boolean {
  const { stage } = getProcessingStage(job)
  return ['chunked', 'embedded', 'complete'].includes(stage)
}
```

**Usage in handler**:
```typescript
// Before (lines 156-188)
const cachedChunks = job.metadata?.cached_chunks
const cachedMarkdown = job.metadata?.cached_markdown
// ... 10 more lines of cache checking

// After
import { getCachedResult, cacheProcessingResult } from '../lib/processing/cache-manager.js'

const cachedResult = getCachedResult(job)
if (cachedResult) {
  result = cachedResult
} else {
  result = await processor.process()
  await cacheProcessingResult(supabase, job.id, result)
}
```

**Benefits**:
- ✅ Centralizes cache logic
- ✅ Reusable by continue-processing, reprocess-document
- ✅ Clear separation between cache and business logic
- ✅ Easy to extend (add TTL, validation)

---

### Testing Strategy

**Unit Tests**: Create `worker/lib/processing/__tests__/cache-manager.test.ts`
```typescript
describe('cache-manager', () => {
  it('should return null if no cache exists')
  it('should return cached result if valid')
  it('should cache result with all fields')
  it('should detect resume operation')
})
```

**Integration Test**: Trigger retry scenario
```bash
# Start processing, kill worker mid-process, restart
# Verify cache is used on retry
```

### Success Criteria

#### Automated Verification:
- [ ] Unit tests pass: `npm test`
- [ ] Integration tests pass
- [ ] Cache hit logs appear on retry

#### Manual Verification:
- [ ] Start processing a PDF
- [ ] Kill worker during processing
- [ ] Restart worker
- [ ] Verify "Using cached processing result" message
- [ ] Verify document completes without re-running AI

---

## Phase 3: Extract Stage Handlers (Medium Risk, Reduces Complexity)

### Overview
Extract major processing stages into dedicated modules.

### Changes Required

#### 1. Create `worker/lib/processing/checkpoint-manager.ts`

**Extract from**: `process-document.ts:18-89`

```typescript
/**
 * Checkpoint Manager
 *
 * Handles pause/resume functionality via Storage checkpoints with SHA-256 validation.
 *
 * Pattern reference: worker/handlers/process-document.ts:34-89
 */

import { createHash } from 'crypto'

export interface CheckpointData {
  stage: string
  data: any
}

export interface ResumeResult {
  shouldResume: boolean
  checkpoint: CheckpointData | null
  nextStage: string
}

/**
 * Stage progression map for checkpoint resume
 */
const STAGE_MAP: Record<string, string> = {
  'extraction': 'cleanup',
  'cleanup': 'chunking',
  'chunking': 'metadata',
  'metadata': 'embedding',
  'embedding': 'completion'
}

/**
 * Attempts to resume processing from a checkpoint.
 *
 * @param supabase - Supabase client
 * @param job - Background job
 * @returns Resume result with checkpoint data if valid
 */
export async function tryResumeFromCheckpoint(
  supabase: any,
  job: any
): Promise<ResumeResult> {
  // Check if this is a resume attempt
  if (!job.resume_count || job.resume_count === 0) {
    return {
      shouldResume: false,
      checkpoint: null,
      nextStage: 'chunking'
    }
  }

  if (!job.last_checkpoint_path || !job.last_checkpoint_stage) {
    console.log(`[Resume] No checkpoint found for job ${job.id}`)
    return {
      shouldResume: false,
      checkpoint: null,
      nextStage: 'chunking'
    }
  }

  console.log(
    `[Resume] Attempting to resume job ${job.id} from checkpoint: ${job.last_checkpoint_stage}`
  )

  try {
    // Download checkpoint from Storage
    const { data: checkpointFile, error: downloadError } = await supabase.storage
      .from('documents')
      .download(job.last_checkpoint_path)

    if (downloadError) {
      console.warn(`[Resume] Failed to download checkpoint: ${downloadError.message}`)
      return {
        shouldResume: false,
        checkpoint: null,
        nextStage: 'chunking'
      }
    }

    const checkpointText = await checkpointFile.text()
    const checkpointData = JSON.parse(checkpointText)

    // Validate checkpoint hash
    const currentHash = createHash('sha256')
      .update(checkpointText)
      .digest('hex')
      .substring(0, 16)

    if (job.checkpoint_hash && currentHash !== job.checkpoint_hash) {
      console.warn(
        `[Resume] Checkpoint hash mismatch (expected: ${job.checkpoint_hash}, got: ${currentHash}), ` +
        `checkpoint may have been modified - falling back to fresh processing`
      )
      return {
        shouldResume: false,
        checkpoint: null,
        nextStage: 'chunking'
      }
    }

    console.log(`[Resume] ✓ Checkpoint loaded and validated: ${job.last_checkpoint_stage}`)

    const nextStage = STAGE_MAP[job.last_checkpoint_stage] || 'chunking'

    return {
      shouldResume: true,
      checkpoint: {
        stage: job.last_checkpoint_stage,
        data: checkpointData
      },
      nextStage
    }
  } catch (error) {
    console.error(`[Resume] Failed to load checkpoint:`, error)
    return {
      shouldResume: false,
      checkpoint: null,
      nextStage: 'chunking'
    }
  }
}

/**
 * Load checkpoint data and convert to ProcessResult format
 *
 * @param checkpoint - Checkpoint data
 * @returns ProcessResult reconstructed from checkpoint
 */
export function checkpointToProcessResult(checkpoint: CheckpointData): any {
  return {
    markdown: checkpoint.data.markdown || checkpoint.data.cleaned_markdown || '',
    chunks: checkpoint.data.chunks || [],
    metadata: checkpoint.data.metadata,
    wordCount: checkpoint.data.word_count || checkpoint.data.wordCount,
    outline: checkpoint.data.outline
  }
}
```

---

#### 2. Create `worker/lib/processing/manual-review.ts`

**Extract from**: `process-document.ts:351-419`

```typescript
/**
 * Manual Review Workflow
 *
 * Handles pause-for-review functionality with Obsidian export.
 *
 * Pattern reference: worker/handlers/process-document.ts:351-419
 */

export interface ReviewConfig {
  reviewBeforeChunking: boolean
  reviewDoclingExtraction: boolean
}

export interface ReviewResult {
  shouldPause: boolean
  reviewStage: 'docling_extraction' | 'ai_cleanup' | null
  message: string
  discardedChunks: number
}

/**
 * Check if manual review is required and pause if needed
 *
 * @param supabase - Supabase client
 * @param job - Background job
 * @param documentId - Document ID
 * @param userId - User ID
 * @param result - Processing result
 * @param config - Review configuration
 * @returns Review result
 */
export async function handleManualReview(
  supabase: any,
  job: any,
  documentId: string,
  userId: string,
  result: any,
  config: ReviewConfig
): Promise<ReviewResult> {
  const { reviewBeforeChunking, reviewDoclingExtraction } = config

  // Check if we're pausing after Docling extraction
  const isDoclingReview = reviewDoclingExtraction && result.chunks.length === 0

  if (!reviewBeforeChunking && !isDoclingReview) {
    return {
      shouldPause: false,
      reviewStage: null,
      message: '',
      discardedChunks: 0
    }
  }

  const reviewStage = isDoclingReview ? 'docling_extraction' : 'ai_cleanup'
  const reviewMessage = isDoclingReview
    ? 'Review Docling extraction in Obsidian, then choose: Continue with AI cleanup, or Skip AI cleanup'
    : 'Review markdown in Obsidian, then click "Continue Processing"'

  console.log(`[ProcessDocument] Review mode (${reviewStage}) - pausing before ${isDoclingReview ? 'AI cleanup' : 'chunking'}`)

  let discardedChunks = 0
  if (!isDoclingReview) {
    // Discard the chunks the processor created - we'll re-chunk after review
    discardedChunks = result.chunks.length
    console.log(`[ProcessDocument] Discarding ${discardedChunks} pre-review chunks`)
  }

  // Export to Obsidian for review
  const { exportToObsidian } = await import('../../handlers/obsidian-sync.js')
  const exportResult = await exportToObsidian(documentId, userId)

  if (exportResult.success) {
    console.log(`[ProcessDocument] ✓ Exported to Obsidian: ${exportResult.path}`)
  } else {
    console.warn(`[ProcessDocument] ⚠️ Export failed: ${exportResult.error}`)
  }

  // Pause pipeline with review stage
  await supabase
    .from('documents')
    .update({
      processing_status: 'awaiting_manual_review',
      review_stage: reviewStage
    })
    .eq('id', documentId)

  await supabase
    .from('background_jobs')
    .update({
      progress: {
        percent: isDoclingReview ? 40 : 50,
        stage: 'awaiting_manual_review',
        details: `Exported to Obsidian - ${reviewMessage}`
      },
      status: 'completed',
      output_data: {
        success: true,
        status: 'awaiting_manual_review',
        review_stage: reviewStage,
        message: reviewMessage,
        exportPath: exportResult.path,
        exportUri: exportResult.uri,
        discardedChunks
      },
      completed_at: new Date().toISOString()
    })
    .eq('id', job.id)

  console.log(`[ProcessDocument] ⏸️ Paused at ${reviewStage} stage`)

  return {
    shouldPause: true,
    reviewStage,
    message: reviewMessage,
    discardedChunks
  }
}
```

---

#### 3. Create `worker/lib/processing/embedding-pipeline.ts`

**Extract from**: `process-document.ts:421-451`

```typescript
/**
 * Embedding Generation Pipeline
 *
 * Handles embedding generation with progress tracking and validation.
 *
 * Pattern reference: worker/handlers/process-document.ts:421-451
 */

import { generateEmbeddings } from '../embeddings.js'
import { updateProgress } from '../job-updates.js'

export interface EmbeddingResult {
  embeddings: number[][]
  validChunkCount: number
  filteredCount: number
}

/**
 * Generate embeddings for chunks with progress tracking
 *
 * @param supabase - Supabase client
 * @param jobId - Job ID for progress updates
 * @param chunks - Chunks to generate embeddings for
 * @returns Embedding result
 */
export async function generateAndSaveEmbeddings(
  supabase: any,
  jobId: string,
  chunks: any[]
): Promise<EmbeddingResult> {
  console.log(`🔢 Generating embeddings for ${chunks.length} chunks`)

  // Update progress before embedding generation
  await updateProgress(
    supabase,
    jobId,
    65,
    'chunking',
    'processing',
    'Preparing chunks for embedding generation'
  )

  // Extract chunk texts, filtering empty content
  const chunkTexts = chunks
    .map(chunk => chunk.content)
    .filter(text => text && text.trim().length > 0)

  if (chunkTexts.length === 0) {
    throw new Error('No valid chunk content found for embedding generation')
  }

  const filteredCount = chunks.length - chunkTexts.length
  if (filteredCount > 0) {
    console.warn(`⚠️ Filtered out ${filteredCount} empty chunks`)
  }

  // Show progress during embedding generation
  await updateProgress(
    supabase,
    jobId,
    70,
    'embedding',
    'processing',
    `Generating embeddings for ${chunkTexts.length} chunks...`
  )

  const embeddings = await generateEmbeddings(chunkTexts)
  console.log(`✅ Generated ${embeddings.length} embeddings`)

  // Update progress after embedding generation
  await updateProgress(
    supabase,
    jobId,
    80,
    'embedding',
    'processing',
    `Generated ${embeddings.length} embeddings`
  )

  return {
    embeddings,
    validChunkCount: chunkTexts.length,
    filteredCount
  }
}
```

---

### Testing Strategy

**Unit Tests**:
- `worker/lib/processing/__tests__/checkpoint-manager.test.ts`
- `worker/lib/processing/__tests__/manual-review.test.ts`
- `worker/lib/processing/__tests__/embedding-pipeline.test.ts`

**Integration Test**: Full pipeline with manual review enabled

### Success Criteria

#### Automated Verification:
- [ ] Unit tests pass
- [ ] Integration tests pass
- [ ] Manual review workflow works

#### Manual Verification:
- [ ] Upload PDF with "Review before chunking" enabled
- [ ] Verify pause at correct stage
- [ ] Verify Obsidian export works
- [ ] Click "Continue Processing"
- [ ] Verify processing completes

---

## Phase 4: Extract Storage Operations (Low Risk, Clear Boundaries)

### Overview
Consolidate storage operations into dedicated module.

### Changes Required

#### 1. Create `worker/lib/processing/document-storage.ts`

**Extract from**: `process-document.ts:304-346, 509-528`

```typescript
/**
 * Document Storage Operations
 *
 * Handles markdown and chunk storage with UUID preservation for portability.
 *
 * Pattern reference: worker/lib/storage-helpers.ts
 */

import { saveToStorage } from '../storage-helpers.js'
import { updateProgress } from '../job-updates.js'

/**
 * Save markdown to Storage and update database path
 *
 * @param supabase - Supabase client
 * @param userId - User ID
 * @param documentId - Document ID
 * @param markdown - Markdown content
 * @param jobId - Job ID for progress updates
 */
export async function saveMarkdownToStorage(
  supabase: any,
  userId: string,
  documentId: string,
  markdown: string,
  jobId: string
): Promise<void> {
  const markdownPath = `${userId}/${documentId}/content.md`

  // Refresh connection after long processing (prevents stale connection)
  console.log(`🔄 Refreshing Supabase connection after processing`)
  const { createClient } = await import('@supabase/supabase-js')
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!supabaseUrl) {
    throw new Error('SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL must be set')
  }
  supabase = createClient(
    supabaseUrl,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Upload markdown to storage
  // CRITICAL: Must wrap in Blob to preserve newlines!
  console.log(`💾 Saving markdown to storage: ${markdownPath}`)
  const markdownBlob = new Blob([markdown], { type: 'text/markdown' })
  const { error: uploadError } = await supabase.storage
    .from('documents')
    .upload(markdownPath, markdownBlob, {
      contentType: 'text/markdown',
      upsert: true
    })

  if (uploadError) {
    throw new Error(`Failed to save markdown: ${uploadError.message}`)
  }
  console.log(`✅ Markdown saved to storage`)

  // Update markdown_path in database
  const { error: pathUpdateError } = await supabase
    .from('documents')
    .update({ markdown_path: markdownPath })
    .eq('id', documentId)

  if (pathUpdateError) {
    console.warn(`⚠️ Failed to update markdown_path: ${pathUpdateError.message}`)
  } else {
    console.log(`✅ Updated markdown_path: ${markdownPath}`)
  }
}

/**
 * Update Storage chunks.json with UUIDs for vault portability
 *
 * @param supabase - Supabase client
 * @param userId - User ID
 * @param documentId - Document ID
 * @param chunksWithEmbeddings - Chunks with embeddings and UUIDs
 */
export async function updateStorageChunks(
  supabase: any,
  userId: string,
  documentId: string,
  chunksWithEmbeddings: any[]
): Promise<void> {
  // Remove embeddings (too large for Storage)
  const chunksForStorage = chunksWithEmbeddings.map(chunk => {
    const { embedding, ...chunkWithoutEmbedding } = chunk
    return chunkWithoutEmbedding
  })

  const storagePath = `${userId}/${documentId}`
  await saveToStorage(
    supabase,
    `${storagePath}/chunks.json`,
    {
      chunks: chunksForStorage,
      version: "1.0",
      document_id: documentId,
      timestamp: new Date().toISOString()
    }
  )
  console.log(`✅ Updated Storage chunks.json with UUIDs (vault-ready)`)
}
```

---

### Testing Strategy

**Unit Tests**: Create `worker/lib/processing/__tests__/document-storage.test.ts`

### Success Criteria

#### Automated Verification:
- [ ] Unit tests pass
- [ ] Storage files created correctly

#### Manual Verification:
- [ ] Upload PDF
- [ ] Verify content.md in Storage
- [ ] Verify chunks.json in Storage
- [ ] Verify markdown_path updated in database

---

## Phase 5: Final Cleanup (Orchestration Layer)

### Overview
Reduce `process-document.ts` to ~150 lines of pure orchestration using all extracted modules.

### Changes Required

#### 1. Refactor `worker/handlers/process-document.ts`

**Before**: 662 lines
**After**: ~150 lines

```typescript
/**
 * Main document processing handler (REFACTORED).
 *
 * Orchestrates the 10-stage processing pipeline using extracted utilities.
 *
 * Architecture:
 * - JobHeartbeat: Cancellation monitoring
 * - CheckpointManager: Pause/resume
 * - CacheManager: Retry safety
 * - ManualReview: Review workflow
 * - EmbeddingPipeline: Embedding generation
 * - DocumentStorage: Storage operations
 * - JobUpdates: Progress/stage/status
 */

import { GoogleGenAI } from '@google/genai'
import { ProcessorRouter } from '../processors/index.js'
import { randomUUID } from 'crypto'

// Extracted utilities
import { JobHeartbeat } from '../lib/job-heartbeat.js'
import { updateProgress, updateStage, updateDocumentStatus } from '../lib/job-updates.js'
import { getCachedResult, cacheProcessingResult, isResumeOperation } from '../lib/processing/cache-manager.js'
import { tryResumeFromCheckpoint, checkpointToProcessResult } from '../lib/processing/checkpoint-manager.js'
import { handleManualReview } from '../lib/processing/manual-review.js'
import { generateAndSaveEmbeddings } from '../lib/processing/embedding-pipeline.js'
import { saveMarkdownToStorage, updateStorageChunks } from '../lib/processing/document-storage.js'
import { getUserFriendlyError, classifyError } from '../lib/errors.js'
import { GEMINI_MODEL } from '../lib/model-config.js'

export async function processDocumentHandler(supabase: any, job: any): Promise<void> {
  const { document_id } = job.input_data

  // Initialize AI client
  const ai = new GoogleGenAI({
    apiKey: process.env.GOOGLE_AI_API_KEY!,
    httpOptions: { timeout: 900000 }
  })

  // Get document metadata
  const { data: doc, error: docError } = await supabase
    .from('documents')
    .select('storage_path, user_id')
    .eq('id', document_id)
    .single()

  if (docError || !doc) {
    throw new Error(`Document not found: ${document_id}`)
  }

  const sourceType = job.input_data.source_type || 'pdf'
  console.log(`📄 Processing document ${document_id} as ${ProcessorRouter.getSourceTypeName(sourceType)}`)

  try {
    // STEP 1: Check for checkpoint (pause/resume)
    const { shouldResume, checkpoint } = await tryResumeFromCheckpoint(supabase, job)

    let result: ProcessResult

    if (shouldResume && checkpoint) {
      // Resume from checkpoint
      console.log(`♻️  Using checkpoint data from paused job`)
      result = checkpointToProcessResult(checkpoint)
    } else {
      // Check cache
      const cachedResult = getCachedResult(job)

      if (cachedResult) {
        result = cachedResult
      } else {
        // STEP 2: Fresh AI processing with heartbeat
        const processor = ProcessorRouter.createProcessor(sourceType, ai, supabase, job)
        const heartbeat = new JobHeartbeat(supabase, job.id)

        heartbeat.start()
        try {
          result = await processor.process()
          heartbeat.throwIfCancelled()
        } finally {
          heartbeat.stop()
        }

        // STEP 3: Cache immediately after processing
        await cacheProcessingResult(supabase, job.id, result)
      }
    }

    // Validate result
    if (!result || !result.markdown || !result.chunks) {
      throw new Error('Processor returned empty result')
    }

    console.log(`✅ Processing complete: ${result.chunks.length} chunks`)

    // STEP 4: Save markdown to Storage
    await saveMarkdownToStorage(supabase, doc.user_id, document_id, result.markdown, job.id)
    await updateStage(supabase, job.id, 'markdown_saved')

    // STEP 5: Manual review workflow
    const { reviewBeforeChunking = false, reviewDoclingExtraction = false } = job.input_data
    const reviewResult = await handleManualReview(
      supabase,
      job,
      document_id,
      doc.user_id,
      result,
      { reviewBeforeChunking, reviewDoclingExtraction }
    )

    if (reviewResult.shouldPause) {
      return // Handler exits, waiting for user review
    }

    // STEP 6: Generate embeddings
    const { embeddings } = await generateAndSaveEmbeddings(supabase, job.id, result.chunks)

    // STEP 7: Prepare chunks for database
    await updateProgress(supabase, job.id, 82, 'saving', 'processing', 'Preparing chunks for database')

    const validChunks = result.chunks.filter(c => c.content?.trim())
    const chunksWithEmbeddings = validChunks.map((chunk, i) => {
      const { heading_path, ...chunkWithoutHeadingPath } = chunk as any
      return {
        id: randomUUID(),
        ...chunkWithoutHeadingPath,
        document_id,
        embedding: embeddings[i]
      }
    })

    // STEP 8: Conditional chunk deletion (resume-aware)
    if (!isResumeOperation(job)) {
      console.log(`🧹 Cleaning existing chunks for fresh processing`)
      const { error: deleteError } = await supabase
        .from('chunks')
        .delete()
        .eq('document_id', document_id)

      if (deleteError) {
        console.warn(`⚠️ Failed to clean existing chunks: ${deleteError.message}`)
      }
    }

    // STEP 9: Insert chunks
    await updateProgress(supabase, job.id, 85, 'saving', 'processing', 'Inserting chunks')

    const { error: chunkError } = await supabase
      .from('chunks')
      .insert(chunksWithEmbeddings)

    if (chunkError) {
      throw new Error(`Failed to save chunks: ${chunkError.message}`)
    }

    // STEP 10: Update Storage with UUIDs
    await updateStorageChunks(supabase, doc.user_id, document_id, chunksWithEmbeddings)
    await updateProgress(supabase, job.id, 90, 'saving', 'processing', 'Saved chunks successfully')
    await updateStage(supabase, job.id, 'chunked')

    // STEP 11: Queue connection detection
    await updateProgress(supabase, job.id, 92, 'finalizing', 'processing', 'Setting up connection detection')

    if (chunksWithEmbeddings.length >= 2) {
      // Check for existing active jobs
      const { data: existingJobs } = await supabase
        .from('background_jobs')
        .select('id, status')
        .eq('job_type', 'detect_connections')
        .eq('user_id', doc.user_id)
        .in('status', ['pending', 'processing'])
        .contains('input_data', { document_id })
        .limit(1)

      if (!existingJobs || existingJobs.length === 0) {
        console.log(`🔍 Creating collision detection job`)
        await supabase
          .from('background_jobs')
          .insert({
            user_id: doc.user_id,
            job_type: 'detect_connections',
            status: 'pending',
            input_data: {
              document_id,
              user_id: doc.user_id,
              chunk_count: chunksWithEmbeddings.length,
              trigger: 'document-processing-complete'
            },
            created_at: new Date().toISOString()
          })
      }
    }

    // STEP 12: Finalize
    await updateProgress(supabase, job.id, 95, 'finalizing', 'processing', 'Finalizing')
    await updateStage(supabase, job.id, 'embedded')

    await updateDocumentStatus(
      supabase,
      document_id,
      'completed',
      true,
      true,
      undefined,
      result.metadata?.source_metadata,
      result.metadata?.extra?.source_type || sourceType
    )

    await updateProgress(supabase, job.id, 100, 'complete', 'completed', 'Processing completed successfully')

    await supabase
      .from('background_jobs')
      .update({
        status: 'completed',
        output_data: {
          success: true,
          document_id,
          chunks_created: result.chunks.length,
          metadata: result.metadata,
          word_count: result.wordCount,
          outline: result.outline
        },
        completed_at: new Date().toISOString()
      })
      .eq('id', job.id)

  } catch (error: any) {
    console.error('❌ Processing failed:', error)

    const errorType = classifyError(error)
    const userMessage = getUserFriendlyError(error)

    await updateDocumentStatus(supabase, document_id, 'failed', false, false, userMessage)
    await updateProgress(supabase, job.id, 0, 'error', 'failed', userMessage)

    if (errorType === 'transient') {
      console.log('🔄 Error is transient, job will be retried')
      throw error
    } else {
      console.log('⛔ Error is permanent, no retry')
      await supabase
        .from('background_jobs')
        .update({
          status: 'failed',
          output_data: {
            success: false,
            document_id,
            error: userMessage,
            error_type: errorType
          },
          last_error: userMessage,
          completed_at: new Date().toISOString()
        })
        .eq('id', job.id)
    }
  }
}
```

---

### Testing Strategy

**Integration Tests**: Full pipeline test with all scenarios
- Fresh processing
- Cached processing
- Checkpoint resume
- Manual review
- Error handling

### Success Criteria

#### Automated Verification:
- [ ] All tests pass: `npm test`
- [ ] Integration tests pass: `npm run test:integration`
- [ ] Full pipeline works: `npx tsx scripts/test-pdf-storage-integration.ts`

#### Manual Verification:
- [ ] Upload PDF → verify all 10 stages complete
- [ ] Cancel during processing → verify cancellation works
- [ ] Trigger retry → verify cache used
- [ ] Enable manual review → verify pause/resume
- [ ] Verify connections created
- [ ] Check all database flags set correctly

---

## Phase 6: Obsolete File Cleanup

### Overview
Remove legacy pre-Chonkie files and reorganize ad-hoc tests.

### Files to Remove (After Verifying No Usage)

#### Legacy Chunking (Pre-Chonkie):
- ⚠️ `worker/lib/ai-chunking.ts` (check 8 imports first)
- ⚠️ `worker/lib/ai-chunking-batch.ts` (check 8 imports first)
- ⚠️ `worker/lib/chunking/ai-fuzzy-matcher.ts`
- ⚠️ `worker/lib/chunking/batch-creator.ts`
- ⚠️ `worker/lib/chunking/prompts.ts` (1 import found)

**Action**:
1. Run `npm run grep -- "import.*ai-chunking" worker/` to verify usage
2. If still used by paste/text processors, update those first
3. Delete files only after verifying zero imports

#### Ad-hoc Test Files (Root Level):
Move to `worker/tests/` or delete if superseded:
- `worker/test-annotation-recovery.ts`
- `worker/test-cleanup-prompt.ts`
- `worker/test-contradiction-detection.ts`
- `worker/test-fuzzy-matching.ts`
- `worker/test-orchestrator.ts`
- `worker/test-reprocess-pipeline.ts`
- `worker/test-semantic-similarity.ts`
- `worker/test-thematic-bridge.ts`

**Action**:
1. Review each file for unique test logic
2. Migrate unique tests to `worker/tests/`
3. Delete files after migration

### Success Criteria

#### Automated Verification:
- [ ] No broken imports: `npm run type-check`
- [ ] All tests still pass: `npm test`

#### Manual Verification:
- [ ] Verify processors still work (PDF, EPUB, paste, text)
- [ ] Check for any runtime errors

---

## References

- **Architecture**: `docs/ARCHITECTURE.md`
- **Pipeline**: `docs/PROCESSING_PIPELINE.md`
- **Complete Flow**: `docs/COMPLETE_PIPELINE_FLOW.md`
- **Worker README**: `worker/README.md`
- **Testing Rules**: `docs/testing/TESTING_RULES.md`
- **Similar Implementation**: `worker/lib/storage-helpers.ts` (pattern reference)
- **Cache Pattern**: `worker/lib/cache-manager.ts` (LRU cache example)
- **Batch Operations**: `worker/lib/batch-operations.ts` (progress tracking example)

---

## Risk Assessment

**Low Risk Phases**: 1, 4 (pure extraction, no logic changes)
**Medium Risk Phases**: 2, 3 (cache + stage handlers)
**High Risk Phase**: 5 (orchestration refactor)

**Mitigation**:
- ✅ Incremental approach (validate each phase)
- ✅ Comprehensive tests after each phase
- ✅ Git commits per phase (easy rollback)
- ✅ Manual testing between phases
- ✅ User feedback checkpoints

---

## Timeline Estimate

**Phase 1**: 2-3 hours (extract utilities, tests)
**Phase 2**: 2-3 hours (cache manager, tests)
**Phase 3**: 4-5 hours (stage handlers, tests)
**Phase 4**: 2-3 hours (storage operations, tests)
**Phase 5**: 3-4 hours (orchestration refactor, comprehensive tests)
**Phase 6**: 1-2 hours (cleanup, verification)

**Total**: 14-20 hours (2-3 days of focused work)

---

## Success Metrics

**Code Quality**:
- ✅ Main handler: 662 → ~150 lines (77% reduction)
- ✅ 7 new reusable modules created
- ✅ All tests pass (unit + integration)
- ✅ Zero regressions in processing pipeline

**Reusability**:
- ✅ JobHeartbeat used by 4+ handlers
- ✅ Job updates used by all 16 handlers
- ✅ Cache manager used by 3+ handlers
- ✅ Clear patterns for future handler development

**Maintainability**:
- ✅ Each module independently testable
- ✅ Clear separation of concerns
- ✅ Easy to modify individual stages
- ✅ Reduced debugging time (isolated modules)

---

**Document Version**: 1.0
**Last Updated**: 2025-01-21
**Status**: Ready for review and execution
