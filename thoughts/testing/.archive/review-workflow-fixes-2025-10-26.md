# Review Workflow Fixes - 2025-10-26

**Session**: Review Workflow Debugging
**Issues**: Document not appearing in UI, Obsidian not opening automatically

---

## 🔍 Issues Discovered

### Issue 1: Document Not Appearing in UI ❌

**Symptoms**:
- Document in `awaiting_manual_review` status
- Worker logs show export to Obsidian successful
- Document does NOT appear in DocumentList

**Root Cause**: `markdown_available` flag not set to `true` during review pause

**Evidence**:
```sql
SELECT id, title, processing_status, markdown_available
FROM documents WHERE id = '7ab2382a-45d5-4bf1-bf16-c6f4ff7cd2ee';

-- Result:
-- processing_status = 'awaiting_manual_review' ✅
-- markdown_available = false ❌ (should be true!)
```

---

### Issue 2: Obsidian Not Opening Automatically ❌

**Symptoms**:
- Obsidian export succeeds
- Files written to vault
- Obsidian does NOT open automatically

**Root Cause**: Obsidian URI not captured and stored in job output_data

**Evidence**:
```sql
SELECT output_data FROM background_jobs
WHERE job_type = 'process_document'
AND input_data->>'document_id' = '7ab2382a-45d5-4bf1-bf16-c6f4ff7cd2ee';

-- Result:
-- output_data = {} ❌ (should contain obsidianUri!)
```

---

### Issue 3: Job Status Incorrect ❌

**Symptoms**:
- Job progress shows 100%
- Job status still `processing`
- Should be `completed`

**Evidence**:
```sql
SELECT status, progress FROM background_jobs WHERE job_type = 'process_document';

-- Result:
-- status = 'processing' ❌
-- progress = {"percent": 100, "stage": "review"} ✅
```

---

## ✅ Fixes Implemented

### Fix 1: Aggressive Polling Fallback for Realtime Failures

**File**: `src/components/library/DocumentList.tsx` (lines 114-151)

**Problem**: Supabase realtime WebSocket can fail in local development, causing documents not to appear without manual refresh.

**Solution**: Implemented robust polling that checks for new/changed documents every 3 seconds.

**Implementation**:
```typescript
const pollInterval = setInterval(async () => {
  // Query for documents in processing or review status
  const { data: activeJobs } = await supabase
    .from('documents')
    .select('id, processing_status')
    .eq('user_id', userId)
    .in('processing_status', ['processing', 'awaiting_manual_review'])

  if (!activeJobs) return

  // Detect NEW documents entering review
  const newActiveJobs = activeJobs.filter(job =>
    !documents.some(doc => doc.id === job.id)
  )

  // Detect status changes
  const statusChanged = activeJobs.some(job => {
    const existing = documents.find(doc => doc.id === job.id)
    return existing && existing.processing_status !== job.processing_status
  })

  // Detect completed documents
  const completedJobs = documents.filter(doc =>
    (doc.processing_status === 'processing' || doc.processing_status === 'awaiting_manual_review') &&
    !activeJobs.some(job => job.id === doc.id)
  )

  if (newActiveJobs.length > 0 || statusChanged || completedJobs.length > 0) {
    loadDocuments(supabase, userId)  // Refresh with URI fetching
  }
}, 3000)
```

**Benefits**:
- ✅ Works even when WebSocket fails
- ✅ Detects new documents entering review (wasn't working before)
- ✅ 3-second latency (acceptable for review workflow)
- ✅ No user intervention required

---

### Fix 2: Set markdown_available During Review Pause

**File**: `worker/lib/managers/document-processing-manager.ts` (lines 363-372)

**Before**:
```typescript
// Update status
await this.supabase
  .from('documents')
  .update({
    processing_status: 'awaiting_manual_review',
    review_stage: reviewStage
  })
  .eq('id', documentId)
```

**After**:
```typescript
// Update document status with markdown_available since it's uploaded
await this.supabase
  .from('documents')
  .update({
    processing_status: 'awaiting_manual_review',
    review_stage: reviewStage,
    markdown_available: true,  // ✅ Markdown is uploaded, set flag
    obsidian_path: exportResult.path || null  // ✅ Store Obsidian path
  })
  .eq('id', documentId)
```

**Rationale**: At this point in the workflow:
- Markdown HAS been extracted and uploaded to Storage
- User needs to see the document in DocumentList
- Setting the flag allows UI to display the document

---

### Fix 2: Capture and Store Obsidian URI

**File**: `worker/lib/managers/document-processing-manager.ts` (lines 360-361, 376-381)

**Before**:
```typescript
// Export to Obsidian
const { exportToObsidian } = await import('../../handlers/obsidian-sync.js')
await exportToObsidian(documentId, userId)  // ❌ Return value discarded

await this.updateProgress(100, 'review', 'Awaiting manual review')
// ❌ No job completion, URI not stored
```

**After**:
```typescript
// Export to Obsidian and capture URI
const { exportToObsidian } = await import('../../handlers/obsidian-sync.js')
const exportResult = await exportToObsidian(documentId, userId)  // ✅ Capture result

// Mark job as complete with Obsidian URI for UI
await this.updateProgress(100, 'review', 'Awaiting manual review')
await this.markComplete({
  obsidianUri: exportResult.uri || null,       // ✅ Store URI
  obsidianPath: exportResult.path || null,     // ✅ Store path
  reviewStage,
  status: 'awaiting_manual_review'
})
```

**Rationale**:
- `exportToObsidian()` returns `{ success, uri, path }`
- URI is needed by UI to open Obsidian automatically
- Storing in `output_data` makes it available to DocumentList

---

### Fix 3: Update UI to Fetch and Use Obsidian URI

**File**: `src/components/library/DocumentList.tsx`

**Changes**:

#### 1. Extended Document Interface (line 27):
```typescript
interface Document {
  id: string
  title: string
  processing_status: string
  review_stage?: 'docling_extraction' | 'ai_cleanup' | null
  obsidian_uri?: string | null  // ✅ NEW: Store Obsidian URI from job
}
```

#### 2. Fetch URI When Loading Documents (lines 138-160):
```typescript
async function loadDocuments(supabase: SupabaseClient, userId: string) {
  const { data } = await supabase
    .from('documents')
    .select('...')
    .eq('user_id', userId)

  if (data) {
    // For documents in review, fetch Obsidian URI from completed job
    const documentsWithUris = await Promise.all(
      data.map(async (doc) => {
        if (doc.processing_status === 'awaiting_manual_review') {
          const { data: job } = await supabase
            .from('background_jobs')
            .select('output_data')
            .eq('job_type', 'process_document')
            .contains('input_data', { document_id: doc.id })
            .eq('status', 'completed')
            .order('created_at', { ascending: false })
            .limit(1)
            .single()

          const obsidianUri = job?.output_data?.obsidianUri || null
          return { ...doc, obsidian_uri: obsidianUri }
        }
        return { ...doc, obsidian_uri: null }
      })
    )

    setDocuments(documentsWithUris)
  }
}
```

#### 3. Update openInObsidian Function (lines 185-220):
```typescript
async function openInObsidian(documentId: string, obsidianUri?: string) {
  // If we have a URI from the completed job, open it directly
  if (obsidianUri) {
    console.log('[DocumentList] Opening Obsidian with URI:', obsidianUri)
    window.location.href = obsidianUri  // ✅ Open Obsidian
    toast.success('Opening in Obsidian', {
      description: 'Document opened in your vault'
    })
    return
  }

  // Otherwise, trigger a new export job
  // ... existing export logic ...
}
```

#### 4. Pass URI to Button (line 392):
```typescript
<Button
  variant="outline"
  size="sm"
  onClick={() => openInObsidian(doc.id, doc.obsidian_uri || undefined)}
  data-testid="review-obsidian-button"
>
  <ExternalLink className="h-4 w-4 mr-2" />
  Review in Obsidian
</Button>
```

---

## 🎯 Expected Behavior After Fixes

### Review Workflow Flow

1. **Upload Document**:
   - User uploads EPUB with "Review After Extraction" workflow
   - Worker extracts with Docling
   - Markdown uploaded to Storage

2. **Pause for Review** (✅ FIXED):
   - Document status → `awaiting_manual_review`
   - `review_stage` → `docling_extraction`
   - `markdown_available` → `true` ✅
   - Export to Obsidian vault
   - Job marked `completed` with `obsidianUri` in output_data ✅

3. **UI Display** (✅ FIXED):
   - Document appears **automatically within 3 seconds** via polling ✅
   - (WebSocket error in console is expected in local dev - harmless)
   - DocumentList shows document with badge "awaiting_manual_review"
   - Buttons appear:
     - "Review in Obsidian" (opens Obsidian automatically) ✅
     - "Skip AI Cleanup"
     - "Continue with AI Cleanup"

4. **User Clicks "Review in Obsidian"**:
   - Obsidian opens automatically with document ✅
   - User can review/edit markdown in vault
   - Returns to UI when ready

5. **User Clicks Resume Button**:
   - Server Action fetches original flags
   - Worker chunks document
   - Respects enrichChunks/detectConnections flags
   - Document marked `completed`

---

## 🧪 Testing the Fixes

### Test 1: Existing Document (Already Fixed)

The document `7ab2382a-45d5-4bf1-bf16-c6f4ff7cd2ee` ("1984") has been manually fixed:

```sql
-- Document now has correct flags
UPDATE documents
SET markdown_available = true
WHERE id = '7ab2382a-45d5-4bf1-bf16-c6f4ff7cd2ee';

-- Job now has obsidianUri
UPDATE background_jobs
SET
  status = 'completed',
  output_data = {
    "obsidianUri": "obsidian://open?vault=Tophs%20Vault&file=Rhizome%2FDocuments%2F1984.md",
    "obsidianPath": "/Users/topher/Tophs Vault/Rhizome/Documents/1984.md",
    "reviewStage": "docling_extraction",
    "status": "awaiting_manual_review"
  }
WHERE input_data->>'document_id' = '7ab2382a-45d5-4bf1-bf16-c6f4ff7cd2ee';
```

**Expected Result**:
- ✅ Document appears in DocumentList
- ✅ "Review in Obsidian" button clickable
- ✅ Clicking button opens Obsidian automatically
- ✅ Can continue processing with buttons

---

### Test 2: New Upload (Full Workflow)

**Steps**:
1. Upload new EPUB with "Review After Extraction"
2. Wait for worker to pause
3. Verify document appears in UI
4. Click "Review in Obsidian" → Obsidian should open
5. Click "Skip AI Cleanup" or "Continue with AI Cleanup"
6. Verify enrichChunks flag respected

**Expected Worker Logs**:
```
[EPUBProcessor] Review Docling extraction mode enabled - pausing before AI cleanup
[Review] Pausing for docling_extraction review
[Obsidian Export] Starting export for document...
[Obsidian Export] ✅ Export complete
[DocumentProcessingManager] ✓ Job completed with output_data: { obsidianUri: "...", ... }
```

**Expected Database State**:
```sql
-- Document
processing_status = 'awaiting_manual_review'
review_stage = 'docling_extraction'
markdown_available = true  -- ✅ NOW SET

-- Job
status = 'completed'  -- ✅ NOW COMPLETED
output_data = { obsidianUri: "obsidian://...", ... }  -- ✅ NOW HAS URI
```

---

## 📝 Files Modified

### Worker Module
- `worker/lib/managers/document-processing-manager.ts` (lines 355-382)
  - Capture Obsidian export result
  - Set `markdown_available = true` during review
  - Store `obsidian_path` in document
  - Call `markComplete()` with URI in output_data

### Main Application
- `src/components/library/DocumentList.tsx`
  - Extended Document interface with `obsidian_uri`
  - Fetch Obsidian URI from job when loading documents
  - Update `openInObsidian` to use URI if available
  - Pass URI to button click handler

---

## ✅ Summary

`★ Insight ─────────────────────────────────────`
**Review Workflow Architecture**

The review workflow creates a "pause point" in document processing where:

1. **Worker Side**:
   - Extraction completes → markdown uploaded
   - Export to Obsidian → files written + URI generated
   - Job marked `completed` with URI stored
   - Document marked `awaiting_manual_review` with `markdown_available = true`

2. **UI Side**:
   - Polls for `awaiting_manual_review` documents
   - Fetches Obsidian URI from completed job
   - Displays buttons with URI attached
   - Opens Obsidian automatically on click

3. **Resume Flow**:
   - User reviews in Obsidian (optional edits)
   - Clicks resume button in UI
   - Server Action preserves original flags
   - Worker continues from checkpoint

This architecture separates concerns cleanly:
- Worker handles processing and state transitions
- Database stores persistent state
- UI reads state and provides user controls
- Job output_data carries context between stages
`─────────────────────────────────────────────────`

---

## 🚀 Next Steps

1. **Test with new upload** - Verify full workflow works end-to-end
2. **Test Obsidian opening** - Confirm URI opens Obsidian correctly
3. **Test resume buttons** - Verify enrichChunks flag preserved
4. **Monitor for auto-resume bug** - Check if document resumes automatically (shouldn't!)

All review workflow fixes are now complete and ready for testing!
