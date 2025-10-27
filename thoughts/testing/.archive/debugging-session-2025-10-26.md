# Debugging Session - Chunk Enrichment Skip Feature

**Date**: 2025-10-26
**Session**: Pipeline Testing and Debugging

---

## 🔍 Issues Discovered

### 1. Worker Crash (CRITICAL - BLOCKING) ✅ IDENTIFIED

**Symptoms**:
```
Error [ERR_MODULE_NOT_FOUND]: Cannot find package '@/lib'
imported from worker/handlers/enrich-and-connect.ts
```

**Status**: Worker process not running
**Impact**: NO processing can occur - all jobs stuck

**Root Cause**:
- Previous code had incorrect `@/lib` import (Next.js alias doesn't work in worker)
- Code was fixed but worker process crashed and didn't recover
- `tsx watch` should auto-reload but process is dead

**Fix**: Restart worker process
```bash
cd /Users/topher/Code/rhizome-v2-dev-1/worker
npm start
```

---

### 2. Enrichment Override Bug (CONFIRMED) 🔴

**File**: `src/app/actions/documents/continue-processing.ts`
**Line**: 42-54

**Problem**: When resuming from review, the `enrichChunks` flag is NOT preserved

**Evidence**:
1. Upload action correctly passes `enrichChunks` flag (upload.ts:377)
2. Continue-processing action creates new job WITHOUT fetching original flag
3. Worker defaults to `enrichChunks = true` when flag missing

**Current Code** (continue-processing.ts:42-54):
```typescript
const jobId = await createBackgroundJob(
  user.id,
  'continue_processing',
  documentId,
  {
    documentId,
    userId: user.id,
    skipAiCleanup,
    chunkerStrategy,
    documentTitle: document.title,
    reviewStage: document.review_stage
    // ❌ MISSING: enrichChunks flag from original job!
    // ❌ MISSING: detectConnections flag from original job!
  }
)
```

**Fix Required**:
1. Query original `process_document` job to get flags
2. Pass `enrichChunks` and `detectConnections` to continue_processing job
3. Worker should respect these flags

---

### 3. Auto-Resume Bug (NEEDS INVESTIGATION) ⚠️

**Reported Issue**: Document in `awaiting_manual_review` auto-resumes without user clicking button

**Current Investigation**:
- DocumentList.tsx shows manual buttons (lines 356-412)
- No obvious auto-trigger in useEffect hooks
- Real-time subscription updates state but doesn't call actions
- Polling checks status but doesn't trigger resume

**Need to Test**:
1. Upload document with review workflow
2. Watch for automatic status changes
3. Check worker logs for unexpected job creation
4. Monitor database for job inserts

**Hypothesis**: Might be fixed once worker is running properly

---

### 4. Metadata Transfer Gaps (LOWER PRIORITY) 📊

**Symptoms**: ~80% of chunks show "No Docling overlaps" - heavy interpolation

**Expected**: 70-90% direct overlap, 10-30% interpolation
**Actual**: ~20% overlap, ~80% interpolation (REVERSED!)

**Investigation Needed**:
- Check if Docling is extracting chunks properly
- Review overlap detection thresholds
- Analyze specific document for Docling vs Chonkie chunk patterns

---

## 🛠️ Fixes to Implement

### Fix 1: Restart Worker (IMMEDIATE)
```bash
cd /Users/topher/Code/rhizome-v2-dev-1/worker
npm start
```

### Fix 2: Preserve Enrichment Flags in Continue Processing

**File**: `src/app/actions/documents/continue-processing.ts`

**Changes Required**:
1. Query original `process_document` job before creating continue_processing job
2. Extract `enrichChunks` and `detectConnections` from original job.input_data
3. Pass these flags to continue_processing job
4. Worker handlers must respect these flags

**Implementation**:
```typescript
// 1. Get original job flags
const { data: originalJob } = await supabase
  .from('background_jobs')
  .select('input_data')
  .eq('job_type', 'process_document')
  .eq('input_data->document_id', documentId)
  .order('created_at', { ascending: false })
  .limit(1)
  .single()

const originalFlags = originalJob?.input_data || {}

// 2. Create continue_processing job with preserved flags
const jobId = await createBackgroundJob(
  user.id,
  'continue_processing',
  documentId,
  {
    documentId,
    userId: user.id,
    skipAiCleanup,
    chunkerStrategy,
    documentTitle: document.title,
    reviewStage: document.review_stage,
    // ✅ Preserve original user choices
    enrichChunks: originalFlags.enrichChunks ?? true,
    detectConnections: originalFlags.detectConnections ?? true
  }
)
```

### Fix 3: Worker Handler Respect Flags

**File**: `worker/handlers/continue-processing.ts`

**Verify**:
- Handler extracts `enrichChunks` from job.input_data
- If `enrichChunks === false`, skip enrichment stages
- If `detectConnections === false`, skip connection detection queue

---

## 📋 Testing Plan After Fixes

### Test 1: Fast Import (Enrichment OFF)
1. Upload EPUB with enrichChunks = false
2. Verify worker logs: "Skipping metadata enrichment (user opted out)"
3. Verify chunks: `enrichment_skipped_reason = 'user_choice'`
4. NO connections should be detected

### Test 2: Review Workflow (Enrichment OFF)
1. Upload with enrichChunks = false + reviewAfterExtraction = true
2. Wait for `awaiting_manual_review` status
3. Click "Skip AI Cleanup" button
4. Verify worker logs: "Skipping metadata enrichment (user opted out)"
5. Document should NOT auto-resume before button click

### Test 3: Full Pipeline (Enrichment ON)
1. Upload with default settings (enrichChunks = true)
2. Verify enrichment runs
3. Verify connections detected
4. All chunks should have enrichments_detected = true

---

## 🎯 Priority Order

1. **IMMEDIATE**: Restart worker (blocks all testing)
2. **HIGH**: Fix enrichment flag preservation (core bug)
3. **MEDIUM**: Investigate auto-resume behavior (may be phantom issue)
4. **LOW**: Analyze metadata transfer gaps (quality improvement)

---

## 📝 Session Notes

- Worker not running is the blocking issue - must fix first
- Enrichment override bug is confirmed via code review
- Auto-resume needs live testing to reproduce
- Metadata gaps might be expected behavior (need to validate 70-90% claim)
