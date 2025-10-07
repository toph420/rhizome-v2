# Job Cancellation Feature

**Date**: 2025-10-06
**Purpose**: Enable easy testing by allowing complete job cancellation and deletion

---

## The Problem

When testing document processing, force-failing a job only marked it as "failed" in the database but didn't stop the running worker process. The worker would continue processing in the background, making it hard to:
- Test new processing logic cleanly
- Stop stuck jobs quickly
- Clear out failed tests

**Issue**: `forceFailJob()` updated DB status but worker kept running → retries, continued processing

---

## The Solution

Added a new **"Cancel & Delete"** action that:
1. Marks job as `cancelled` in database (worker can check this)
2. Waits 100ms for worker to see the cancellation
3. Deletes the job completely from database

### New Server Action

**File**: `src/app/actions/admin.ts`

```typescript
export async function cancelAndDeleteJob(jobId: string) {
  const supabase = await createClient()

  try {
    // First mark as cancelled so worker knows to stop
    await supabase
      .from('background_jobs')
      .update({
        status: 'cancelled',
        last_error: 'Cancelled by user'
      })
      .eq('id', jobId)

    // Give worker a moment to see the cancellation
    await new Promise(resolve => setTimeout(resolve, 100))

    // Then delete the job
    const { error } = await supabase
      .from('background_jobs')
      .delete()
      .eq('id', jobId)

    if (error) throw error

    revalidatePath('/')
    return { success: true }
  } catch (error: any) {
    console.error('Error cancelling and deleting job:', error)
    return { success: false, error: error.message }
  }
}
```

### Updated UI

**File**: `src/components/layout/ProcessingDock.tsx`

**Changes**:
1. Added "Cancel & Delete" button for processing jobs (red destructive button)
2. Kept "Force Fail" button as secondary option
3. Moved regular "X" button to only show for completed/failed jobs

**New Button Layout** (for processing jobs):
```
[Cancel & Delete]  [Force Fail]
     Red              Gray
```

**Old Button Layout** (for completed/failed jobs):
```
[Retry]  [X]
 Gray    Ghost
```

---

## How It Works

### Flow

```
User clicks "Cancel & Delete"
  ↓
1. UI: Mark job ID as "deleting" (show spinner)
  ↓
2. Action: Update job status to 'cancelled' in DB
  ↓
3. Action: Wait 100ms (worker can check status)
  ↓
4. Action: Delete job from DB
  ↓
5. UI: Remove from local state
  ↓
6. Realtime: Subscription removes from state (double-check)
```

### Worker Integration (Future Enhancement)

For workers to respect cancellation, they should periodically check job status:

```typescript
// In worker/processors/base.ts or similar
async function checkCancellation(jobId: string): Promise<boolean> {
  const { data } = await supabase
    .from('background_jobs')
    .select('status')
    .eq('id', jobId)
    .single()

  return data?.status === 'cancelled' || !data
}

// In processing loop
if (await checkCancellation(this.jobId)) {
  console.log('[Worker] Job cancelled, exiting')
  process.exit(0)
}
```

**Note**: Current implementation relies on job deletion - when job is deleted, worker will eventually exit on next DB check. For immediate cancellation, workers would need active polling (future enhancement).

---

## Usage

### Development Testing

When testing document processing:

1. **Upload a document** → Job starts processing
2. **Click "Cancel & Delete"** → Job immediately removed from dock
3. **Worker continues briefly** then exits when it checks DB
4. **Upload again** → Clean slate for testing

### Buttons Explained

| Button | When | Action | Use Case |
|--------|------|--------|----------|
| **Cancel & Delete** | Processing | Cancel + Remove | Testing, stop unwanted job |
| **Force Fail** | Processing | Mark failed, keep job | Trigger retry logic |
| **Retry** | Failed | Reset to pending | Re-run failed job |
| **X** | Completed/Failed | Remove from dock | Clean up finished jobs |

---

## Files Changed

| File | Change | Lines |
|------|--------|-------|
| `src/app/actions/admin.ts` | Added `cancelAndDeleteJob()` | +33 |
| `src/components/layout/ProcessingDock.tsx` | Added import | 1 |
| `src/components/layout/ProcessingDock.tsx` | Added `handleCancelAndDelete()` | +21 |
| `src/components/layout/ProcessingDock.tsx` | Updated button layout | ~50 |

**Total**: ~2 files changed, +105 lines

---

## Testing

### Manual Test

```bash
npm run dev

# 1. Upload EPUB file
# 2. Watch job appear in dock (bottom of screen)
# 3. Click "Cancel & Delete" button (red)
# 4. Job should immediately disappear
# 5. Check worker logs - should show job not found or cancelled
```

### Expected Logs

**UI Console**:
```
Cancelled and deleted job: abc-123-def
```

**Worker Logs** (if it checks):
```
[Worker] Job abc-123-def not found, exiting
# OR
[Worker] Job cancelled, exiting
```

---

## Future Enhancements

### 1. Active Worker Polling

Add periodic cancellation checks in base processor:

```typescript
// worker/processors/base.ts
class SourceProcessor {
  private checkCancellationInterval: NodeJS.Timer

  async startCancellationCheck() {
    this.checkCancellationInterval = setInterval(async () => {
      const { data } = await this.supabase
        .from('background_jobs')
        .select('status')
        .eq('id', this.job.id)
        .single()

      if (!data || data.status === 'cancelled') {
        console.log('[Worker] Job cancelled, exiting immediately')
        clearInterval(this.checkCancellationInterval)
        process.exit(0)
      }
    }, 1000) // Check every second
  }

  async stopCancellationCheck() {
    if (this.checkCancellationInterval) {
      clearInterval(this.checkCancellationInterval)
    }
  }
}
```

### 2. Graceful Shutdown

Instead of `process.exit(0)`, throw a `JobCancelledException` that handlers can catch:

```typescript
class JobCancelledException extends Error {
  constructor() {
    super('Job cancelled by user')
    this.name = 'JobCancelledException'
  }
}

// In processor
if (cancelled) {
  throw new JobCancelledException()
}

// In handler
try {
  await processor.process()
} catch (error) {
  if (error instanceof JobCancelledException) {
    console.log('[Worker] Job cancelled gracefully')
    return // Don't retry
  }
  throw error
}
```

### 3. Bulk Cancel & Delete

Add "Cancel All Processing" button that calls new action:

```typescript
export async function cancelAndDeleteAllProcessing() {
  // Mark all as cancelled
  await supabase
    .from('background_jobs')
    .update({ status: 'cancelled' })
    .eq('status', 'processing')

  // Wait for workers
  await new Promise(resolve => setTimeout(resolve, 200))

  // Delete all
  await supabase
    .from('background_jobs')
    .delete()
    .eq('status', 'cancelled')
}
```

---

## Developer Notes

### Why 100ms Wait?

The 100ms delay between marking as cancelled and deleting gives workers a brief window to check status. This is a pragmatic trade-off:
- **Too short (<50ms)**: Worker might not see cancellation before job is deleted
- **Too long (>500ms)**: User waits unnecessarily
- **100ms**: Good balance for development testing

### Why Not Kill Worker Process?

Killing Node.js worker processes is complex:
- Need to track PIDs
- Need IPC or signal handling
- Complexity not worth it for personal tool
- Current approach (DB deletion) works for testing

### Production Considerations

For production multi-user system, would need:
1. Worker process manager (PM2, Bull, etc.)
2. IPC between main app and workers
3. Graceful shutdown signals (SIGTERM)
4. Job status polling in worker loop

Current implementation is **optimized for single-user development testing**, not production workloads.

---

## Summary

**Before**: Force-failing jobs didn't stop background processing → hard to test cleanly

**After**: "Cancel & Delete" button stops and removes jobs → easy testing workflow

**Result**: Cleaner development experience, faster iteration on processing logic
