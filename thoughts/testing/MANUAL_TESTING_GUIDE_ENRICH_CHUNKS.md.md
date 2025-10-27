# Manual Testing Guide - Chunk Enrichment Skip Feature

**Created**: 2025-10-26
**Feature**: Chunk Enrichment Skip (Migration 072)
**Status**: Core Features Working, UI Enhancements Needed

## 📝 Session Summary (2025-10-26)

**Morning Session**: Fixed review workflow (pause/resume, flag preservation, metadata transfer)
**Evening Session**: Fixed job completion sync, added document titles, tested enrichment

**Key Achievements**:
- ✅ Jobs complete correctly and show in ProcessingDock
- ✅ Progress reporting works (0% → 100%)
- ✅ Document titles show in job cards
- ✅ Review workflow fully functional
- ✅ Enrichment skip feature working end-to-end

**Remaining Work** (5 items):
1. ✅ ~~Chunk metadata refresh on enrichment completion~~ - **COMPLETE** (2025-10-27)
2. Chunks Overview tab - enrichment statistics
3. All Chunks tab - "Select Unenriched" + batch enrich
4. ChunkMetadataIcon - Add missing "Detect Connections" button
5. Connection detection - Auto-enrich if needed
6. All Chunks tab - Add sparkles button tooltip

**Latest Session (2025-10-27)**: Chunk metadata refresh implemented and tested ✅

---

## ✅ Fixes Implemented (2025-10-27 Session)

### Feature: Chunk Metadata Refresh on Enrichment Completion

**Problem**: After enrichment completed, ChunkMetadataIcon didn't show updated metadata without page refresh.

**Root Causes**:
1. `ChunkMetadataIcon` read chunk data from **props** (Server Component), not from ReaderStore
2. BackgroundJobsStore polling didn't fetch `input_data` field from database
3. ReaderLayout couldn't extract chunk IDs to refetch
4. Connection queries hit URL length limits with 100+ chunk IDs

**Solution Implemented**:
1. **ChunkMetadataIcon reads from ReaderStore** (`src/components/reader/ChunkMetadataIcon.tsx`):
   - Subscribes to `useReaderStore(state => state.chunks)`
   - Finds fresh chunk by ID: `const freshChunk = storeChunks.find(c => c.id === chunk.id) || chunk`
   - Uses `freshChunk` for all metadata display
   - Result: Component automatically re-renders when store updates

2. **ReaderLayout detects enrichment completion** (`src/components/reader/ReaderLayout.tsx`):
   - Watches `jobsMap` for completed `enrich_chunks` or `enrich_and_connect` jobs
   - Extracts `chunk_ids` from `job.input_data`
   - Calls `refetchChunks(chunkIds)` to get fresh data from database
   - Calls `updateChunks(freshData)` to update ReaderStore
   - Result: Store updates trigger ChunkMetadataIcon re-render

3. **Added refetchChunks Server Action** (`src/app/actions/chunks.ts`):
   - Efficiently fetches only specified chunks by ID
   - Returns enrichment metadata: themes, summary, importance_score, etc.

4. **ReaderStore chunk update method** (`src/stores/reader-store.ts`):
   - `updateChunks(updatedChunks)`: Merges updated chunks by ID
   - Recalculates visible chunks to propagate changes
   - Uses Map for O(1) lookup performance

5. **Fixed BackgroundJobsStore polling** (`src/stores/admin/background-jobs.ts`):
   - Added `input_data` to SELECT query (line 389)
   - Added `input_data` to all `updateJob()` calls
   - Result: Job details now include chunk IDs for refetch

6. **Fixed connection query URL length issue** (`src/app/actions/connections.ts`):
   - Implemented batching: max 50 chunks per query
   - Prevents ERR_FAILED from URL length limits
   - Gracefully handles batch failures

**Testing**:
```bash
# Test steps
1. Open document with unenriched chunks
2. Click "Enrich Chunk" on metadata icon
3. Wait for job completion in ProcessingDock
4. ✅ Metadata icon updates automatically with themes/summary!
5. ✅ No page refresh needed
6. ✅ No console errors
```

**Console Logs Confirmed**:
```
[ReaderLayout] 🔍 Found 1 new enrichment jobs to process
[ReaderLayout] 📋 Job details: {input_data: {chunk_ids: [...]}}
[ReaderLayout] 🔄 Enrichment completed for 1 chunks, refreshing...
[ReaderLayout] 📥 Fetched 1 updated chunks from database
[ReaderLayout] ✅ Refreshed 1 chunks with new metadata
[ChunkMetadataIcon] Chunk X enrichment detected! Themes: [...]
```

**Files Modified**:
- `src/components/reader/ChunkMetadataIcon.tsx` - Read from store
- `src/components/reader/ReaderLayout.tsx` - Detect completion, refetch, update
- `src/stores/reader-store.ts` - Add updateChunks method
- `src/app/actions/chunks.ts` - Add refetchChunks action, batch connections
- `src/stores/admin/background-jobs.ts` - Fetch input_data
- `src/components/admin/JobList.tsx` - Add enrichment job icons

**Status**: ✅ **COMPLETE and TESTED** (2025-10-27)

---

## 🔴 New Issues Found During Testing (2025-10-26 Evening Session)

### Critical: Job Completion Not Syncing to UI
**Symptoms**:
- Jobs appear in ProcessingDock and Admin Panel Jobs tab
- Worker logs show job completed successfully
- UI still shows "processing" status indefinitely
- Refreshing page doesn't update status
- Progress never advances (stuck at 0%)

**Root Cause**: Unknown - needs investigation
- Progress reporting code added to handlers
- Store polling every 2 seconds should detect completion
- May be schema mismatch (progress vs progress_percentage)

**Investigation Needed**:
1. Check `background_jobs` table schema for progress fields
2. Verify store is reading correct fields
3. Add console logging to store polling
4. Check if job status is actually being updated in DB

**Priority**: 🔴 CRITICAL - Blocks all enrichment testing

---

### UI Enhancements Needed

#### 1. Chunks Overview Tab - Enrichment Stats Missing
**Current State**: Tab shows total chunks, but no enrichment statistics

**Required**:
- **Enrichment Statistics Card**:
  - Total chunks count
  - Enriched chunks count (with percentage)
  - Unenriched chunks count
  - Skipped chunks count (by reason: user_choice, error, etc.)
  - Visual progress bar showing enrichment completion
- **Batch Actions**:
  - "Enrich All Unenriched" button (similar to existing batch connection detection)
  - Should respect user's original enrichment choice (don't override skipped_by_choice)
  - Show confirmation dialog with count: "Enrich 234 unenriched chunks?"
- **Stats Refresh**:
  - Auto-refresh stats when enrichment jobs complete
  - Manual refresh button

**Implementation Pattern**: Similar to ConnectionsTab statistics display

---

#### 2. All Chunks Tab - Missing Tooltip on Enrich Button
**Current State**: Sparkles button (✨) exists but no tooltip

**Required**:
- Add hover tooltip: "Enrich Chunk" or "Enrich with Metadata"
- Consistent with other button tooltips in the interface
- Should explain what enrichment does in 5-10 words

**File**: `src/components/sidebar/AllChunksView.tsx` or chunk card component

---

#### 3. All Chunks Tab - "Select Unenriched" Filter Missing
**Current State**:
- "Detect Connections" button exists with smart selection
- Can select all chunks, but no way to filter by enrichment status

**Required**:
- **Selection UI Pattern** (copy from connections):
  - "Select All" button
  - **"Select Unenriched"** button (NEW)
  - "Select None" button
  - Selected count badge
- **Batch Enrich Button**:
  - Only visible when chunks selected
  - "Enrich Selected (X chunks)" with count
  - Shows progress in ProcessingDock
  - Updates UI when complete

**Visual Hierarchy**:
```
[Select All] [Select Unenriched] [Select None]   |   [X selected]
                                                    [Enrich Selected]
```

**Behavior**:
- "Select Unenriched" filters for `enrichments_detected = false` AND `enrichment_skipped_reason IS NULL`
- Don't select chunks that were deliberately skipped by user
- Gray out already-enriched chunks in selection mode

---

#### 4. Connection Detection - Auto-Enrich Dependency
**Current State**:
- Connection detection requires enrichment
- UI shows "(requires enrichment)" text
- But clicking "Detect Connections" fails if chunks aren't enriched

**Required**:
- **Smart Auto-Enrichment**:
  - When user clicks "Detect Connections" on unenriched chunk(s)
  - Automatically enrich first, then detect connections
  - Show two-phase progress: "Enriching (0-50%) → Detecting (50-100%)"
  - Single job that does both sequentially
- **Implementation**:
  - Check chunk enrichment status before connection detection
  - If not enriched: Call `enrichAndConnectChunks()` instead of `detectConnectionsForChunks()`
  - If already enriched: Just call `detectConnectionsForChunks()`
- **User Experience**:
  - No error messages about "needs enrichment"
  - Seamless workflow: Click detect → automatically enriches if needed → detects
  - Progress indicator shows current phase

**Files to Modify**:
- `src/app/actions/connections.ts` - Add enrichment check
- `src/components/admin/tabs/ConnectionsTab.tsx` - Smart button behavior
- `src/components/sidebar/AllChunksView.tsx` - Smart button behavior

---

#### 5. ChunkMetadataIcon - Missing "Detect Connections" Button
**Current State**:
- Shows enrichment status section with "Enrich Chunk" and "Enrich & Connect"
- Shows connections status section BUT no action button
- Line 393-413 has the logic but button is MISSING

**Expected Behavior**:
```
Enrichment Section:
- If not enriched: [Enrich Chunk] [Enrich & Connect]
- If enriched: ✓ Badge with timestamp

Connections Section:
- If not detected AND enriched: [Detect Connections] ← MISSING!
- If not detected AND not enriched: (requires enrichment) ← Currently shows this
- If detected: ✓ Badge with timestamp
```

**Bug**: Line 393 condition `!metadata.connectionsDetected && metadata.enrichmentsDetected` exists, but button should show!

**Investigation Needed**:
- Verify `metadata.enrichmentsDetected` is actually true for enriched chunks
- Check if button is being rendered but hidden by CSS
- Verify chunk data includes `enrichments_detected` field

**File**: `src/components/reader/ChunkMetadataIcon.tsx` (lines 393-413)

---

## ✅ Previously Fixed Issues (2025-10-26 Morning Session)

### Fixed Issues
1. ✅ **Auto-resume bug**: FIXED with polling fallback (3-second detection)
   - Document appears automatically within 3 seconds
   - No manual refresh required
   - Supabase realtime WebSocket fails in local dev (expected, harmless)

2. ✅ **Enrichment override**: FIXED with flag preservation
   - `enrichChunks` and `detectConnections` flags preserved through continue-processing
   - Original job flags fetched and passed to resume handler
   - Worker respects user choices correctly

3. ✅ **Metadata transfer gaps**: FIXED with bulletproof matching
   - Added bulletproof matching step in continue-processing
   - Achieved 100% overlap coverage (339/339 chunks)
   - Gap-fill chunks (185 synthetic) are expected for EPUB (2-4 char whitespace gaps)
   - Average 2.12 overlaps per chunk (excellent)

### Previously Fixed Issues
- ✅ Review workflow field name mismatch
- ✅ DocumentList polling detection
- ✅ Obsidian URI capture and storage
- ✅ Document appears immediately without refresh

---

## Test Environment Setup

### Prerequisites
```bash
# 1. Ensure worker is running with latest code
cd /Users/topher/Code/rhizome-v2-dev-1/worker
npm start

# 2. Ensure Next.js dev server is running
cd /Users/topher/Code/rhizome-v2-dev-1
npm run dev

# 3. Check Supabase is running
npx supabase status
```

### Test Files
- **Small test**: Use a short EPUB/PDF (5-10 pages) for quick validation
- **Medium test**: 50-100 pages to verify batch operations
- **Large test**: 200+ pages to test performance (optional)

---

## Test Scenarios

### ✅ Scenario 1: Upload with Enrichment OFF (Fast Import)

**Purpose**: Verify enrichment skip works correctly

**Steps**:
1. Navigate to upload page
2. Select an EPUB/PDF file
3. In DocumentPreview:
   - ✅ **UNCHECK** "Enrich chunks with metadata"
   - Verify "Detect connections" auto-disables and shows "(requires enrichment)"
   - Set workflow: "Fully Automatic"
4. Click "Confirm & Upload"
5. Monitor ProcessingDock and worker logs

**Expected Results**:
```
✅ Document uploads successfully
✅ Worker logs show: "[DocumentProcessing] Skipping metadata enrichment (user opted out)"
✅ Worker logs show: "[ChunkEnrichmentManager] Marked chunks as unenriched (user_choice)"
✅ Worker logs show: "[DocumentProcessing] Skipping connection detection (user opted out)"
✅ Document completes with status: 'completed'
✅ Chunks in database have:
   - enrichments_detected = false
   - enrichment_skipped_reason = 'user_choice'
   - connections_detected = false
   - detection_skipped_reason = 'user_choice'
```

**Actual Results** (Tested 2025-10-26):
```
✅ All expected results matched
✅ Feature working correctly for fast import flow
```

**Database Verification**:
```sql
-- Check chunk enrichment status
SELECT
  COUNT(*) as total_chunks,
  COUNT(*) FILTER (WHERE enrichments_detected = false) as unenriched,
  COUNT(*) FILTER (WHERE enrichment_skipped_reason = 'user_choice') as skipped_by_choice
FROM chunks
WHERE document_id = 'YOUR_DOCUMENT_ID';

-- Should show: total_chunks = unenriched = skipped_by_choice
```

---

### ✅ Scenario 2: Review After Extraction (FIXED)

**Purpose**: Verify review workflow pauses correctly

**Steps**:
1. Navigate to upload page
2. Select an EPUB file
3. In DocumentPreview:
   - ✅ **CHECK** "Enrich chunks with metadata" (default)
   - Set workflow: **"Review After Extraction"**
4. Click "Confirm & Upload"
5. Wait for processing to pause

**Expected Results**:
```
✅ Docling extracts markdown
✅ Document status becomes: 'awaiting_manual_review'
✅ Worker logs show: "[Review] Pausing for docling_extraction review"
✅ Worker logs show: "[Review] Exporting to Obsidian..."
✅ ProcessingDock shows: "Awaiting manual review"
✅ DocumentList shows:
   - Badge: "awaiting_manual_review" with pause icon
   - Button: "Review in Obsidian"
   - Button: "Skip AI Cleanup"
   - Button: "Continue with AI Cleanup"
✅ Document remains paused until user clicks a button
✅ 0 chunks in database (not chunked yet)
```

**Actual Results** (Re-tested 2025-10-26 after fixes):
```
✅ Document status becomes 'awaiting_manual_review'
✅ Document appears automatically within 3 seconds (polling fallback)
✅ Buttons appear in DocumentList
✅ "Review in Obsidian" button opens Obsidian correctly
✅ Document remains paused until user clicks resume button
✅ Enrichment respects user choice (preserved through continue-processing)
✅ Metadata transfer: 100% overlap coverage with bulletproof matching
✅ 0 chunks in database before resume (correct - not chunked yet)
```

**Original Debug Actions (Now Resolved)**:
1. **Auto-resume investigation**:
   ```bash
   # Check for race conditions in continue-processing action
   grep -n "continueDocumentProcessing" src/app/actions/documents/continue-processing.ts

   # Check if review buttons auto-trigger on render
   grep -n "useEffect.*continueProcessing" src/components/library/DocumentList.tsx
   ```

2. **Enrichment override investigation**:
   ```bash
   # Check if enrichChunks flag is preserved during resume
   grep -n "enrichChunks" worker/handlers/continue-processing.ts

   # Check if resume job respects original flags
   psql -c "SELECT input_data FROM background_jobs WHERE job_type = 'continue_processing' ORDER BY created_at DESC LIMIT 1"
   ```

3. **Metadata transfer investigation**:
   ```bash
   # Check Docling chunk extraction
   grep -n "No Docling overlaps" worker/lib/metadata-transfer/*.ts

   # Verify Docling is extracting chunks properly
   # Check: worker/processors/epub-processor.ts extraction logic
   ```

---

### ✅ Scenario 3: Manual Enrichment via ChunkMetadataIcon

**Purpose**: Verify per-chunk enrichment UI works

**Steps**:
1. Upload document with enrichment OFF (use Scenario 1)
2. Navigate to `/read/[document-id]`
3. Hover over any chunk (left margin icon appears)
4. Click the metadata icon (ℹ️)
5. In the hover card:
   - Verify "Enrichment" section shows "Not enriched"
   - Click "Enrich Chunk" button
6. Monitor ProcessingDock

**Expected Results**:
```
✅ Toast: "Enrichment started" with "Check ProcessingDock for progress"
✅ ProcessingDock shows: "Enriching chunk..."
✅ Worker creates 'enrich_chunks' job
✅ Worker logs show: "[EnrichChunksHandler] Starting job..."
✅ ChunkEnrichmentManager enriches the single chunk
✅ After completion:
   - Hover card shows "Enriched" badge
   - Enrichment timestamp appears
   - "Connection Detection" button becomes available
```

**Test Cases**:
- Single chunk enrichment
- "Enrich & Connect" button (sequential workflow)
- Verify enriched chunk has metadata populated

---

### ✅ Scenario 4: Manual Enrichment via ChunkCard

**Purpose**: Verify batch enrichment via chunk browser

**Steps**:
1. Upload document with enrichment OFF
2. Navigate to Admin Panel (Cmd+Shift+A) → Connections tab
3. Click "Browse Chunks" for the document
4. Expand any chunk to detailed mode
5. Verify enrichment buttons appear
6. Click "Enrich Chunk" or "Enrich & Connect"

**Expected Results**:
```
✅ Detailed mode shows:
   - "Enrich Chunk" button (outline variant)
   - "Enrich & Connect" button (primary variant)
✅ After clicking "Enrich & Connect":
   - Toast shows progress
   - Worker runs enrichment (0-50%)
   - Worker runs connection detection (50-100%)
   - Both complete successfully
```

---

### ✅ Scenario 5: Batch Enrichment via EnrichmentsTab

**Purpose**: Verify Admin Panel enrichment management

**Steps**:
1. Upload document with enrichment OFF
2. Open Admin Panel (Cmd+Shift+A)
3. Navigate to **Tab 4: Enrichments**
4. Verify statistics display:
   - Total chunks
   - Enriched count (should be 0)
   - Pending count (should equal total)
   - Skipped count
5. Click "Enrich All Pending" button

**Expected Results**:
```
✅ Statistics load correctly from database
✅ Progress bar shows 0% enriched
✅ "Enrich All Pending" button shows correct count
✅ After clicking:
   - Toast: "Enriching X chunks"
   - ProcessingDock shows batch job
   - Worker creates 'enrich_chunks' job
   - All chunks get enriched
✅ After completion:
   - Click "Refresh Statistics"
   - Progress bar shows 100%
   - "Enrich All Pending" becomes disabled (0 chunks)
```

---

### ✅ Scenario 6: Connection Detection Dependency

**Purpose**: Verify connections require enrichment

**Steps**:
1. Upload document with enrichment OFF
2. Navigate to ChunkMetadataIcon hover card
3. Verify "Connection Detection" section shows:
   - Status: "Not detected"
   - Button: **NOT VISIBLE** (because not enriched)
4. Click "Enrich Chunk" and wait for completion
5. Verify "Detect Connections" button now appears

**Expected Results**:
```
✅ Connection detection button only shows when chunk is enriched
✅ Enforces dependency: enrichment → connections
✅ UI clearly indicates requirement
```

---

## Debug Priorities

### 🔴 Priority 1: Auto-Resume Bug

**Symptoms**:
- Document in `awaiting_manual_review` auto-resumes without user action
- Buttons appear but document processes immediately

**Investigation Steps**:
1. Check if `continueProcessing` is called on component mount:
   ```typescript
   // src/components/library/DocumentList.tsx
   // Look for useEffect with continueProcessing call
   ```

2. Check if resume buttons have auto-trigger:
   ```typescript
   // Check onClick handlers don't fire immediately
   // Verify disabled state is respected
   ```

3. Check real-time subscription triggers:
   ```typescript
   // Line 68-87 in DocumentList.tsx
   // Does UPDATE event auto-trigger resume?
   ```

**Fix Strategy**:
- Add guard condition to prevent auto-resume
- Add console.log to track resume trigger source
- Verify `processing` state prevents double-clicks

---

### 🔴 Priority 2: Enrichment Override Bug

**Symptoms**:
- Document uploaded with enrichment OFF
- During review workflow resume, enrichment runs anyway

**Investigation Steps**:
1. Check if `enrichChunks` flag is preserved in continue-processing job:
   ```typescript
   // src/app/actions/documents/continue-processing.ts
   // Does it pass enrichChunks to worker?
   ```

2. Check original job's `input_data`:
   ```sql
   SELECT input_data->'enrichChunks' as enrich_flag
   FROM background_jobs
   WHERE document_id = 'YOUR_DOC_ID'
   AND job_type = 'process_document';
   ```

3. Check if DocumentProcessingManager respects flag during resume:
   ```typescript
   // worker/lib/managers/document-processing-manager.ts
   // Line 115: if (this.options.enrichChunks !== false)
   // Is options.enrichChunks being set correctly?
   ```

**Fix Strategy**:
- Ensure `continue_processing` action fetches and forwards original flags
- Add logging to track enrichChunks value through resume flow
- Verify `enrichChunks` defaults to true only for new uploads, not resumes

---

### 🟡 Priority 3: Metadata Transfer Gaps

**Symptoms**:
- 80% of Chonkie chunks have no Docling overlaps
- Heavy reliance on interpolation instead of direct mapping

**Investigation Steps**:
1. Check Docling chunk extraction quality:
   ```typescript
   // worker/processors/epub-processor.ts
   // Verify Docling extracts structural chunks properly
   ```

2. Check overlap detection algorithm:
   ```typescript
   // worker/lib/metadata-transfer/overlap-detector.ts
   // Are overlap thresholds too strict?
   ```

3. Analyze a specific document:
   ```bash
   # Export Docling chunks and Chonkie chunks for comparison
   # Check: Are Docling chunks too sparse?
   # Check: Are Chonkie chunks too granular?
   ```

**Expected Behavior**:
- 70-90% of chunks should have direct Docling overlaps
- 10-30% interpolation is normal (for small chunks, tables, etc.)
- Current: ~20% overlap, ~80% interpolation (REVERSED!)

**Fix Strategy**:
- Review Docling extraction parameters
- Adjust overlap threshold (currently may be too strict)
- Consider chunker strategy (recursive vs semantic)
- Verify Docling is enabled and working for EPUB

---

## Testing Checklist

### Upload Flow
- [ ] Upload with enrichment ON → chunks enriched automatically
- [x] Upload with enrichment OFF → chunks marked as skipped ✅
- [x] Connection detection disabled when enrichment OFF ✅
- [ ] Review workflow pauses correctly (BROKEN - needs fix)
- [ ] Resume respects original enrichment flag (BROKEN - needs fix)

### Manual Enrichment
- [ ] ChunkMetadataIcon shows enrichment status
- [ ] "Enrich Chunk" button triggers single-chunk job
- [ ] "Enrich & Connect" button runs sequential workflow
- [ ] ChunkCard shows enrichment buttons in detailed mode
- [ ] Enrichment buttons only show for unenriched chunks

### Batch Operations
- [ ] EnrichmentsTab displays statistics correctly
- [ ] "Enrich All Pending" triggers batch job
- [ ] Progress bar updates after enrichment
- [ ] Statistics refresh shows updated counts

### Dependency Enforcement
- [ ] Connection detection requires enrichment
- [ ] UI clearly indicates "(requires enrichment)"
- [ ] Connection button appears after enrichment completes

### Database State
- [x] `enrichments_detected` tracked correctly ✅
- [x] `enrichment_skipped_reason` set for user opt-out ✅
- [ ] Timestamps recorded properly
- [ ] No orphaned unenriched chunks after batch operation

---

## Performance Testing

### Fast Import Validation
**Goal**: Verify enrichment skip actually speeds up bulk imports

**Test**:
1. Upload 10 small PDFs with enrichment ON (baseline)
2. Upload 10 small PDFs with enrichment OFF (fast)
3. Compare total time

**Expected**:
- Enrichment OFF: ~50% faster
- Skip eliminates 30-60s per document (Ollama enrichment time)

---

## Log Monitoring

### Worker Logs to Watch
```bash
# Success indicators
✅ "[DocumentProcessing] Skipping metadata enrichment (user opted out)"
✅ "[ChunkEnrichmentManager] Marked chunks as unenriched (user_choice)"
✅ "[EnrichChunksHandler] Starting job..."
✅ "[EnrichAndConnectHandler] Step 1: Enriching..."
✅ "[EnrichAndConnectHandler] Step 2: Detecting connections..."

# Error indicators
❌ "Cannot find package '@/lib'" (import path error - FIXED)
❌ "Property 'onProgress' does not exist" (interface error - FIXED)
❌ "[Metadata Transfer] chunk X has no Docling overlaps" (>80% = problem)
❌ Enrichment runs when enrichChunks=false (flag override bug)
```

### Database Queries for Validation
```sql
-- Check enrichment statistics
SELECT
  COUNT(*) as total,
  COUNT(*) FILTER (WHERE enrichments_detected = true) as enriched,
  COUNT(*) FILTER (WHERE enrichment_skipped_reason = 'user_choice') as skipped,
  COUNT(*) FILTER (WHERE enrichments_detected = false AND enrichment_skipped_reason IS NULL) as pending
FROM chunks
WHERE document_id = 'YOUR_DOCUMENT_ID';

-- Check job types created
SELECT job_type, status, created_at
FROM background_jobs
WHERE input_data->>'document_id' = 'YOUR_DOCUMENT_ID'
ORDER BY created_at DESC;
```

---

## Summary & Action Items

### ✅ Critical Issues RESOLVED

**2025-10-26 Evening:**
1. **Job Completion Sync** - ✅ FIXED
   - Root cause: Worker writing to non-existent `progress_percentage` column
   - Solution: Updated handlers to only use `progress` JSONB field
   - Status: Jobs now complete and show progress correctly
   - Files: `worker/handlers/enrich-chunks.ts`, `worker/handlers/enrich-and-connect.ts`

2. **Document Title in Jobs** - ✅ FIXED
   - Jobs now show: "Document Title - Chunk 123"
   - Passed `documentTitle` from reader store through BlockRenderer to ChunkMetadataIcon
   - Files: `src/components/reader/ChunkMetadataIcon.tsx`, `src/components/reader/BlockRenderer.tsx`

3. **ProcessingDock Global** - ✅ FIXED
   - Moved to root layout, now appears on all pages
   - File: `src/app/layout.tsx`

**2025-10-27:**
4. **Chunk Metadata Refresh** - ✅ FIXED
   - Root causes: ChunkMetadataIcon using props instead of store, BackgroundJobsStore not fetching input_data
   - Solution: Subscribe to ReaderStore, add refetch mechanism, fix polling
   - Status: Metadata icons update automatically after enrichment completes
   - Files: See "Fixes Implemented (2025-10-27 Session)" section above

5. **Connection Query URL Length Error** - ✅ FIXED
   - Root cause: 100+ chunk IDs in single query exceeded browser URL limits
   - Solution: Implemented batching (50 chunks per query)
   - Status: No more ERR_FAILED errors on scroll
   - File: `src/app/actions/connections.ts`

### 🟡 UI Enhancements Required
1. **Chunks Overview Tab** - Add enrichment statistics and batch actions
   - Priority: HIGH
   - Impact: Core workflow for managing enrichment at document level

3. **All Chunks Tab - Select Unenriched** - Missing filter and batch enrich
   - Priority: HIGH
   - Impact: Bulk enrichment workflow

4. **Connection Detection Auto-Enrich** - Should auto-enrich if needed
   - Priority: MEDIUM
   - Impact: Better UX, removes error state

5. **ChunkMetadataIcon - Detect Connections Button** - Button missing
   - Priority: MEDIUM
   - Impact: Per-chunk connection detection workflow

6. **All Chunks Tab - Tooltip** - Missing sparkles button tooltip
   - Priority: LOW
   - Impact: Minor UX improvement

### ✅ Working Features
- Enrichment skip during upload (fast import) ✅
- Database schema tracking (3 columns) ✅
- Review workflow (pause/resume with flag preservation) ✅
- Worker handlers (enrich-chunks, enrich-and-connect with progress) ✅
- ProcessingDock global availability ✅
- Job registration and visibility ✅
- **NEW**: Chunk metadata refresh on enrichment completion ✅
- **NEW**: Connection query batching (no URL errors) ✅

### 📝 Testing Status
- ✅ **Scenario 1**: Upload with enrichment OFF - WORKING
- ✅ **Scenario 2**: Review After Extraction - WORKING
- ✅ **Scenario 3**: Manual enrichment via ChunkMetadataIcon - **WORKING** (metadata refreshes automatically!)
- ⏸️ **Scenario 4**: Manual enrichment via ChunkCard - NOT TESTED (should work now)
- ⏸️ **Scenario 5**: Batch enrichment via EnrichmentsTab - NOT TESTED (tab needs implementation)
- ⏸️ **Scenario 6**: Connection detection dependency - NOT TESTED (needs auto-enrich feature)

**Next Steps**:
1. ✅ ~~Fix job completion sync~~ - FIXED (2025-10-26)
2. ✅ ~~Add document title to job display~~ - FIXED (2025-10-26)
3. ✅ ~~Implement chunk refresh on enrichment completion~~ - FIXED (2025-10-27)
4. ✅ ~~Fix connection URL length errors~~ - FIXED (2025-10-27)
5. Implement Chunks Overview enrichment stats
6. Add "Select Unenriched" to All Chunks tab
7. Fix missing Detect Connections button
8. Add auto-enrich to connection detection
9. Add tooltip to sparkles button in All Chunks tab

---

## ✅ Chunk Refresh Strategy (IMPLEMENTED 2025-10-27)

**See "Fixes Implemented (2025-10-27 Session)" section above for complete implementation details.**

**Key Points**:
- ChunkMetadataIcon subscribes to ReaderStore, not props
- ReaderLayout detects job completion via BackgroundJobsStore
- Only affected chunks refetched (selective refresh)
- React reconciliation ensures only ChunkMetadataIcon re-renders
- No full page reload needed

**Status**: ✅ Complete and tested

---

## Files Modified During Implementation

### Phase 1: Database Schema (Complete)
- `supabase/migrations/072_chunk_enrichment_skip.sql`

### Phase 2: Upload Form & Server Actions (Complete)
- `src/stores/upload.ts`
- `src/components/upload/DocumentPreview.tsx`
- `src/components/upload/UploadZone.tsx`
- `src/app/actions/enrichments.ts` (NEW)
- `src/app/actions/documents/upload.ts`

### Phase 3: Worker Processing Manager (Complete)
- `worker/lib/managers/document-processing-manager.ts`
- `worker/lib/managers/chunk-enrichment-manager.ts` (NEW)
- `worker/handlers/process-document.ts`

### Phase 4: Job Handlers (Complete)
- `worker/handlers/enrich-chunks.ts` (NEW)
- `worker/handlers/enrich-and-connect.ts` (NEW)
- `worker/index.ts`
- `worker/types/job-schemas.ts`

### Phase 5: UI Components (Complete)
- `src/components/reader/ChunkMetadataIcon.tsx`
- `src/components/rhizome/chunk-card.tsx`
- `src/components/admin/tabs/EnrichmentsTab.tsx` (NEW)
- `src/components/admin/AdminPanel.tsx`
- `src/types/annotations.ts`
- `src/stores/chunk-store.ts`
- `src/stores/admin/background-jobs.ts`

### Bug Fixes (This Session)
- `worker/handlers/process-document.ts` - Fixed review workflow field name mismatch
- `src/components/library/DocumentList.tsx` - Fixed polling for awaiting_manual_review status
