# Manual Testing Checklist - Storage-First Portability System (T-024)

**Task**: T-024 Phase 7 Validation & Regression Testing
**Date**: 2025-10-13
**Status**: Ready for Execution

---

## Overview

This comprehensive manual testing checklist validates the complete Storage-First Portability System across all 7 phases. Execute these tests systematically to ensure all features work correctly and no regressions have occurred.

**Estimated Time**: 3-4 hours for complete checklist

---

## Test Environment Setup

### Prerequisites

- [x] **Supabase Running**: `npx supabase start` (verify with `npx supabase status`)
- [x] **Worker Running**: `cd worker && npm run dev`
- [x] **Next.js Running**: `npm run dev:next`
- [x] **Browser**: Chrome/Firefox with DevTools open
- [x] **Test Document**: Have 1 PDF (50-200 pages) and 1 EPUB ready for testing
- [ ] **Clean State**: Fresh database reset (`npx supabase db reset`) recommended

### Environment Validation

- [x] Check `.env` (root) has correct Supabase credentials
- [x] Check `worker/.env` has correct Supabase credentials
- [x] Verify no console errors on app startup
- [x] Verify database connection: Check Supabase Studio (http://localhost:54323)

**Session 1 Results**: ✅ All environment checks passed. 2 test documents available.

---

## Phase 1: Storage Export Infrastructure ✅

### T-001: Storage Helper Functions

**Goal**: Verify storage helper utilities work correctly

1. **File Structure Check**
   - [ ] Navigate to `worker/lib/storage-helpers.ts`
   - [ ] Verify functions exist: `saveToStorage`, `readFromStorage`, `hashContent`, `listStorageFiles`
   - [ ] Check TypeScript types are exported

2. **Functional Test** (via script or manual)
   ```bash
   cd worker
   npx tsx scripts/test-storage-helpers.ts # If test script exists
   ```
   - [ ] Verify no errors
   - [ ] Check Supabase Storage UI for test files

**Expected Result**: All 4 functions exist and execute without errors.

---

### T-002: JSON Export Schemas

**Goal**: Verify TypeScript interfaces for export schemas

1. **Schema Validation**
   - [ ] Navigate to `worker/types/storage.ts`
   - [ ] Verify interfaces exist:
     - `ChunksExport`
     - `CachedChunksExport`
     - `MetadataExport`
     - `ManifestExport`
     - `ImportConflict`
     - `ReprocessOptions`
   - [ ] Check all interfaces have version fields
   - [ ] Verify JSDoc comments are present

2. **Type Check**
   ```bash
   cd worker
   npx tsc --noEmit types/storage.ts
   ```
   - [ ] No TypeScript errors

**Expected Result**: All 6 schemas defined with proper types and documentation.

---

### T-003: BaseProcessor saveStageResult

**Goal**: Verify base processor can save stage results

1. **Code Check**
   - [ ] Open `worker/processors/base.ts`
   - [ ] Find `saveStageResult()` method
   - [ ] Verify method signature matches task requirements
   - [ ] Check error handling (try-catch with warnings)

**Expected Result**: Method exists with proper signature and non-fatal error handling.

---

### T-004: PDF Processor Storage Integration

**Goal**: Verify PDF processing saves to Storage at all checkpoints

1. **Process Test PDF**
   ```bash
   # From web UI: Upload a 50-200 page PDF
   # OR via API/script if available
   ```
   - [ ] Monitor processing in ProcessingDock
   - [ ] Wait for completion (5-15 minutes depending on size)

2. **Verify Storage Files**
   - [ ] Open Supabase Storage UI (http://localhost:54323)
   - [ ] Navigate to `documents/{userId}/{documentId}/`
   - [ ] Verify files exist:
     - [ ] `chunks.json` (final)
     - [ ] `metadata.json` (final) or `markdown.json`
     - [ ] `manifest.json` (final)
     - [ ] Stage files (optional): `stage-extraction.json`, `stage-cleanup.json`, etc.

3. **Validate chunks.json Schema**
   ```bash
   cd worker
   npx tsx scripts/validate-storage-export.ts <doc_id> <user_id> cloud
   ```
   - [ ] Validation passes
   - [ ] No schema errors
   - [ ] Chunk count matches database

**Expected Result**: All required JSON files present in Storage with valid schemas.

---

### T-005: EPUB Processor Storage Integration

**Goal**: Verify EPUB processing saves to Storage

1. **Process Test EPUB**
   - [ ] Upload an EPUB file via web UI
   - [ ] Wait for completion

2. **Verify Storage Files**
   - [ ] Check Supabase Storage for EPUB document folder
   - [ ] Verify same file structure as PDF (chunks.json, metadata.json, manifest.json)

3. **Validate Schema**
   ```bash
   npx tsx scripts/validate-storage-export.ts <epub_doc_id> <user_id> cloud
   ```
   - [ ] Validation passes

**Expected Result**: EPUB documents have same Storage structure as PDFs.

---

### T-006: LOCAL Mode Validation

**Goal**: Verify LOCAL processing mode saves cached_chunks.json

1. **Set LOCAL Mode**
   ```bash
   # In .env.local and worker/.env
   PROCESSING_MODE=local
   ```
   - [ ] Restart worker: `cd worker && npm run dev`

2. **Process Document in LOCAL Mode**
   - [ ] Upload PDF or EPUB
   - [ ] Wait for completion
   - [ ] Check for longer processing time (3-25 minutes)

3. **Verify cached_chunks.json**
   - [ ] Navigate to Storage: `documents/{userId}/{documentId}/`
   - [ ] Verify `cached_chunks.json` exists
   - [ ] Validate schema:
     ```bash
     npx tsx scripts/validate-storage-export.ts <doc_id> <user_id> local
     ```
   - [ ] Verify markdown_hash matches content

**Expected Result**: LOCAL mode creates cached_chunks.json with Docling structural data.

---

## Phase 2: Admin Panel UI ✅ COMPLETE (Session 1)

### T-007: Admin Panel Refactor ✅ COMPLETE

**Goal**: Verify Admin Panel uses Sheet component and has 6 tabs

1. **Open Admin Panel**
   - [x] Navigate to any page in app
   - [x] Click **Database icon** in TopNav header
   - [x] **OR** Press `Cmd+Shift+A` (Mac) / `Ctrl+Shift+A` (Windows)

2. **Verify Sheet Animation**
   - [x] Panel slides down from top (smooth animation)
   - [x] Height is approximately 85vh
   - [x] Backdrop appears (dimmed background)

3. **Verify Tabs**
   - [x] Count tab triggers at top: should be **6 tabs**
   - [x] Tab names:
     1. Scanner
     2. Import
     3. Export
     4. Connections
     5. Integrations
     6. Jobs

4. **Close Admin Panel**
   - [x] Press `Esc` → Panel closes
   - [x] Click backdrop → Panel closes
   - [x] Click X button in header → Panel closes (if present)
   - [x] Press `Cmd+Shift+A` again → Panel toggles

**Bugs Fixed**: None - worked as designed

**Expected Result**: Admin Panel is Sheet-based with 6 tabs and proper animations.

---

### T-008: Tab Navigation

**Goal**: Verify all tabs render and are clickable

1. **Navigate Through Tabs**
   - [ ] Click each tab trigger: Scanner, Import, Export, Connections, Integrations, Jobs
   - [ ] Each tab content should render
   - [ ] No console errors
   - [ ] URL should NOT change (client-side only)

2. **Jobs Tab Compatibility**
   - [ ] Navigate to Jobs tab
   - [ ] Verify existing job controls are present:
     - Clear Completed Jobs
     - Clear Failed Jobs
     - Stop All Processing
     - Clear All Jobs
     - Nuclear Reset
   - [ ] Click "Clear Completed Jobs" → Verify functionality works

**Expected Result**: All 6 tabs render without errors, Jobs tab functionality unchanged.

---

## Phase 3: Storage Scanner ✅ COMPLETE (Session 2)

### T-009: scanStorage Server Action ✅ COMPLETE

**Goal**: Verify Storage scanner compares Storage vs Database

1. **Prepare Test Data**
   - [x] Ensure at least 1 document processed (Phase 1 tests)
   - [x] Optionally: Delete chunks from database for one document (to test "missing_from_db" state)

2. **Open Scanner Tab**
   - [x] Open Admin Panel → Navigate to Scanner tab
   - [x] Scanner should auto-scan on mount
   - [x] Watch for loading spinner

3. **Verify Scan Results**
   - [x] Results table appears
   - [x] Documents listed with:
     - Document title
     - Storage files count
     - Database status
     - Sync state badge (healthy, missing_from_db, out_of_sync, etc.)

**Expected Result**: Scanner accurately compares Storage vs Database state.

**Session 2 Results**: ✅ All checks passed. Scanner correctly identified documents in various sync states.

---

### T-010: Scanner UI and Filters ✅ COMPLETE

**Goal**: Verify Scanner UI features work correctly

1. **Filter Documents**
   - [x] Click "All" filter → All documents show
   - [x] Click "Missing from DB" filter → Only documents missing from DB show
   - [x] Click "Out of Sync" filter → Only out-of-sync documents show
   - [x] Click "Healthy" filter → Only healthy documents show
   - [x] Verify summary stats update with each filter

2. **Expandable Rows**
   - [x] Click a document row to expand
   - [x] Verify file details show:
     - chunks.json (size, last updated)
     - metadata.json (size, last updated)
     - manifest.json (size, last updated)
     - cached_chunks.json (if LOCAL mode)

3. **Summary Statistics**
   - [x] Verify summary shows:
     - Total documents in Storage
     - Total documents in Database
     - Missing from Database count
     - Out of Sync count
     - Healthy count
   - [x] Stats should be accurate

**Expected Result**: Filters work, rows expand, statistics accurate.

**Session 2 Results**: ✅ All features working correctly. Minor UX note: Missing pointer cursor on buttons (cosmetic).

---

## Phase 4: Import Workflow ✅ COMPLETE (Sessions 2-5)

### T-011: Import Without Conflict ✅ COMPLETE

**Goal**: Verify import works when no conflict exists

1. **Prepare Test**
   - [x] Process a document (from Phase 1)
   - [x] Delete all chunks for that document from database:
     ```sql
     DELETE FROM chunks WHERE document_id = '369e6062-8447-48c9-b526-229b48edecec';
     ```
   - [x] Verify chunks still exist in Storage (Scanner should show "missing_from_db")

2. **Import Document**
   - [x] Open Admin Panel → Import tab
   - [x] OR: Scanner tab → Click "Import" button for the document
   - [x] Verify import job starts
   - [x] Monitor progress (should show percentage and stage)

3. **Verify Import Success**
   - [x] Job completes with status "completed"
   - [x] Check database:
     ```sql
     SELECT COUNT(*) FROM chunks WHERE document_id = '369e6062-8447-48c9-b526-229b48edecec';
     -- Result: 3 chunks restored ✅
     ```
   - [x] Chunk count matches Storage chunks.json
   - [x] Scanner now shows "healthy" state

**Expected Result**: Import restores chunks from Storage to Database without conflict.

**Session 2 Results**: ✅ Clean import working correctly. 3 chunks restored from Storage.

**Bugs Fixed**:
- Bug #5: `details` column error in background-jobs polling → Fixed: Use `error_message` column
- Bug #8: Polling temp job IDs causes database errors → Fixed: Skip polling temp jobs

---

### T-012: Import with Conflict Resolution ✅ COMPLETE

**Goal**: Verify conflict detection and resolution strategies

1. **Create Conflict**
   - [x] Process a document (has chunks in both Storage and Database)
   - [x] Document "The Man" has corrupted storage (0 chunks in Storage, 10 in DB)
   - [x] Document is in "out_of_sync" state

2. **Trigger Import**
   - [x] Import tab → Select document → Click Import
   - [x] Verify ConflictResolutionDialog opens

3. **Verify Conflict Dialog**
   - [x] Dialog shows side-by-side comparison:
     - Existing (Database): chunk count, processed date
     - Import (Storage): chunk count, processed date
   - [x] Sample chunks displayed (first 3)
   - [x] Metadata differences highlighted

4. **Test Skip Strategy** ✅ COMPLETE
   - [x] Select "Skip Import" radio button
   - [x] Verify warning: "Import data will be ignored"
   - [x] Click "Apply Resolution"
   - [x] Verify: No changes occur, database unchanged
   - [x] Dialog closes
   - [x] Shows message: "Import skipped - existing data preserved"

5. **Test Replace Strategy** ✅ COMPLETE (Session 5)
   - [x] Trigger import again
   - [x] Select "Replace All" radio button
   - [x] Verify warning: "Will reset all annotation positions"
   - [x] Click "Apply Resolution"
   - [x] Monitor import job progress
   - [x] Verify:
     - All old chunks deleted (verified with database query)
     - New chunks from Storage inserted with new UUIDs
     - Chunk count matches Storage (3 chunks)

6. **Test Merge Smart Strategy** ✅ COMPLETE (Session 5)
   - [x] Create annotations on some chunks (created 3 annotations via ECS)
   - [x] Trigger import again (modified chunk metadata to create conflict)
   - [x] Select "Merge Smart" radio button (default)
   - [x] Verify info message: "Preserves annotations by keeping chunk IDs"
   - [x] Click "Apply Resolution"
   - [x] Monitor import job
   - [x] Verify:
     - Chunk IDs unchanged (f03c3ab0-2c19-4c5c-b989-ff5400c2c1ce preserved)
     - Metadata updated from Storage
     - Chunk content unchanged (merge smart preserves database content)
     - Annotations still work (all 3 annotations intact)

**Expected Result**: All 3 conflict resolution strategies work correctly.

**Session 2 Results**: 🟡 Partial - Skip strategy working. Replace and Merge Smart pending.

**Session 5 Results**: ✅ Complete - Replace and Merge Smart strategies both tested and passing.

**Bugs Fixed (Session 2)**:
- Bug #6: Dialog close doesn't clean up pending job → Fixed: Separate `onClose` from `onCancel`
- Bug #7: Skip strategy returns undefined jobId → Fixed: Handle skip specially
- Bug #9: Apply resolution triggers cancellation → Fixed: Proper callback separation

**Session 3 Refinements**: 🟡 Deep debugging of import workflow state management

**Additional Bugs Fixed (Session 3)**:
- Bug #10: Job ID replacement issue → Fixed: Added `replaceJob()` method
- Bug #11: Import state stuck (Promise never resolves) → Fixed: Store resolve/reject callbacks
- Bug #11b: Unnecessary scanning on cancel → Fixed: Track `successfulImports` count
- Bug #11c: Misleading "failed" jobs → Fixed: Call `removeJob()` instead of marking failed
- Bug #12: Polling state inconsistency → Fixed: Auto-stop polling in `removeJob()`
- Bug #13: Job not appearing after cancel→retry → Fixed: Fallback to create new job
- Bug #14: Dialog double-close issue → Fixed: Remove `onClose()` from success paths
- Bug #15: 'skip' strategy UUID error → Fixed: Handle 'skip' specially in Promise callback
- Bug #16: Page refresh on button click → Fixed: Add `type="button"` to dialog buttons
- Bug #17: Panel flashing during job → Fixed: Empty dependency array in `useEffect`
- Bug #18: Missing `onResolved()` call → Fixed: Add callback invocation

---

### T-013: Import with Embeddings Regeneration ✅ COMPLETE (Session 5)

**Goal**: Verify optional embedding regeneration works

1. **Import with Embeddings Option**
   - [x] Import tab → Select document
   - [x] Check "Regenerate Embeddings" option
   - [x] Start import

2. **Verify Embeddings**
   - [x] Monitor progress: should show "Regenerating embeddings" stage
   - [x] After completion, check database:
     ```sql
     SELECT id, embedding FROM chunks WHERE document_id = '369e6062-8447-48c9-b526-229b48edecec';
     ```
   - [x] Verify embedding columns are not null (all 3 chunks have embeddings)
   - [x] Embeddings should be 768-dimensional vectors (verified)

**Expected Result**: Embeddings regenerated during import.

**Session 5 Results**: ✅ Test passed after Bug #20 fix. All 3 chunks now have 768-dimensional embeddings from Gemini API.

**Bug Fixed**:
- **Bug #20**: Import options (regenerateEmbeddings, reprocessConnections) hard-coded to false in ConflictResolutionDialog
  - **Problem**: Dialog wasn't receiving import option props from ImportTab, always used false values
  - **Fix**: Added `regenerateEmbeddings` and `reprocessConnections` props to dialog interface, passed from ImportTab
  - **Files Modified**:
    - `src/components/admin/ConflictResolutionDialog.tsx` - Added props to interface and component
    - `src/components/admin/tabs/ImportTab.tsx` - Pass props to dialog

---

## Phase 5: Connection Reprocessing ✅

### T-015: Reprocess Connections Action

**Goal**: Verify reprocessConnections Server Action creates jobs

1. **Prepare Test**
   - [ ] Ensure document has connections (from initial processing)
   - [ ] Manually mark some connections as user_validated:
     ```sql
     UPDATE chunk_connections
     SET user_validated = true
     WHERE id IN (SELECT id FROM chunk_connections LIMIT 10);
     ```

2. **Open Connections Tab**
   - [ ] Admin Panel → Connections tab
   - [ ] Select a document
   - [ ] Verify current connection stats display:
     - Total connections
     - User-validated count

**Expected Result**: ConnectionsTab displays current connection statistics.

---

### T-016: Test Reprocess All Mode

**Goal**: Verify "Reprocess All" deletes all connections and regenerates

1. **Select Reprocess All**
   - [ ] ConnectionsTab → Select mode: "Reprocess All"
   - [ ] Verify warning appears about deleting all connections
   - [ ] Select all 3 engines (Semantic Similarity, Contradiction Detection, Thematic Bridge)
   - [ ] Verify estimate shows time and cost

2. **Start Reprocessing**
   - [ ] Click "Start Reprocessing"
   - [ ] Monitor job progress
   - [ ] Stages should show: preparing, processing, finalizing

3. **Verify Results**
   - [ ] Check database:
     ```sql
     SELECT COUNT(*) FROM chunk_connections
     WHERE source_chunk_id IN (SELECT id FROM chunks WHERE document_id = '<doc_id>');
     ```
   - [ ] Connection count may differ from before
   - [ ] Verified connections should NOT exist (all deleted)
   - [ ] New connections generated from scratch

**Expected Result**: All connections deleted and regenerated fresh.

---

### T-017: Test Smart Mode with Preservation

**Goal**: Verify Smart Mode preserves user-validated connections

1. **Mark Connections as Validated**
   - [ ] Ensure 10+ connections marked as user_validated (from T-015 prep)

2. **Select Smart Mode**
   - [ ] ConnectionsTab → Select mode: "Smart Mode"
   - [ ] Check "Preserve user-validated connections"
   - [ ] Check "Save backup before reprocessing"
   - [ ] Select all 3 engines

3. **Start Reprocessing**
   - [ ] Click "Start Reprocessing"
   - [ ] Monitor progress: should show "Backing up validated connections" stage

4. **Verify Results**
   - [ ] Check database for validated connections:
     ```sql
     SELECT COUNT(*) FROM chunk_connections
     WHERE user_validated = true
     AND source_chunk_id IN (SELECT id FROM chunks WHERE document_id = '<doc_id>');
     ```
   - [ ] Should still have 10 validated connections
   - [ ] Check Storage for backup file:
     - Navigate to `documents/{userId}/{documentId}/`
     - Find `validated-connections-{timestamp}.json`
     - Download and verify JSON contains validated connections

5. **Verify Backup File**
   ```bash
   # Download validated-connections-*.json from Storage
   # Verify structure:
   cat validated-connections-*.json | jq '.connections | length'
   # Should show 10
   ```

**Expected Result**: Smart Mode preserves validated connections and creates backup.

---

### T-018: Test Add New Mode

**Goal**: Verify "Add New" mode only processes newer documents

1. **Prepare Test**
   - [ ] Process Document A on Day 1
   - [ ] Process Document B on Day 2 (newer)
   - [ ] Document A should have connections to Document B

2. **Select Add New Mode**
   - [ ] ConnectionsTab → Select Document A
   - [ ] Select mode: "Add New"
   - [ ] Select engines

3. **Start Reprocessing**
   - [ ] Click "Start Reprocessing"
   - [ ] Monitor progress

4. **Verify Results**
   - [ ] Existing connections preserved
   - [ ] New connections to Document B added
   - [ ] Connection count increased (not replaced)

**Expected Result**: Add New mode only adds connections to newer documents.

---

## Phase 6: Export Workflow ✅

### T-019: Export Single Document

**Goal**: Verify export generates valid ZIP bundle

1. **Select Document for Export**
   - [ ] Admin Panel → Export tab
   - [ ] Check a completed document
   - [ ] Check export options:
     - [x] Include Connections
     - [x] Include Annotations

2. **Start Export**
   - [ ] Click "Export Selected (1)"
   - [ ] Monitor export job progress
   - [ ] Stages: reading files, creating ZIP, uploading

3. **Download ZIP**
   - [ ] When job completes, "Download ZIP" button appears
   - [ ] Click download button
   - [ ] ZIP file downloads to browser

4. **Verify ZIP Contents**
   ```bash
   # Extract ZIP
   unzip export-*.zip -d export-test/
   cd export-test/

   # Verify structure
   ls -la <doc-id>/
   # Should have:
   # - source.pdf or source.epub
   # - content.md
   # - chunks.json
   # - metadata.json
   # - manifest.json
   # - connections.json (if Include Connections checked)
   # - annotations.json (if Include Annotations checked)

   # Validate JSON schemas
   cat <doc-id>/chunks.json | jq '.version'
   # Should output: "1.0"

   cat <doc-id>/manifest.json | jq '.files | keys'
   # Should list all files
   ```

5. **Verify Signed URL Expiry**
   - [ ] Note download URL
   - [ ] Wait 10 seconds, try URL again → Should still work
   - [ ] (Optional) Wait 24+ hours → URL should expire (403 error)

**Expected Result**: ZIP downloads successfully with all expected files and valid JSON.

---

### T-020: Batch Export

**Goal**: Verify batch export of multiple documents

1. **Select Multiple Documents**
   - [ ] Export tab → Check 3-5 documents
   - [ ] Check export options
   - [ ] Verify estimated size updates

2. **Start Batch Export**
   - [ ] Click "Export Selected (5)"
   - [ ] Monitor progress: should show "Processing document 1 of 5", etc.

3. **Verify Batch ZIP**
   ```bash
   unzip export-*.zip -d batch-export/
   cd batch-export/

   # Count document folders
   ls -d */ | wc -l
   # Should match selected count (5)

   # Verify top-level manifest
   cat manifest.json | jq '.documents | length'
   # Should show 5

   # Verify each document folder
   for dir in */; do
     echo "Checking $dir"
     ls "$dir" | grep chunks.json
   done
   ```

**Expected Result**: Batch ZIP contains all selected documents with top-level manifest.

---

## Phase 7: Integration & Polish ✅

### T-021: Integrations Tab

**Goal**: Verify Obsidian and Readwise operations work from Admin Panel

1. **Obsidian Operations**
   - [ ] Admin Panel → Integrations tab
   - [ ] Verify Obsidian section exists
   - [ ] Click "Export to Obsidian" (if vault configured)
   - [ ] Verify operation starts
   - [ ] Check operation history: should show recent export

2. **Readwise Operations**
   - [ ] Verify Readwise section exists
   - [ ] Click "Import Highlights" (if Readwise data available)
   - [ ] Verify import starts
   - [ ] Check operation history

3. **Operation History**
   - [ ] Verify history table shows:
     - Operation type (Export to Obsidian, Import Readwise, etc.)
     - Status (Completed, Failed)
     - Timestamp
   - [ ] Recent operations appear at top

**Expected Result**: Obsidian and Readwise operations work from Integrations tab.

---

### T-022: Keyboard Shortcuts

**Goal**: Verify all keyboard shortcuts work

1. **Toggle Admin Panel**
   - [ ] Press `Cmd+Shift+A` (Mac) or `Ctrl+Shift+A` (Windows)
   - [ ] Admin Panel toggles open/closed
   - [ ] Works from any page

2. **Tab Navigation with Number Keys**
   - [ ] Open Admin Panel
   - [ ] Press `1` → Scanner tab activates
   - [ ] Press `2` → Import tab activates
   - [ ] Press `3` → Export tab activates
   - [ ] Press `4` → Connections tab activates
   - [ ] Press `5` → Integrations tab activates
   - [ ] Press `6` → Jobs tab activates

3. **Close with Esc**
   - [ ] Admin Panel open
   - [ ] Press `Esc` → Panel closes

4. **Help Dialog** (if implemented)
   - [ ] Admin Panel open
   - [ ] Press `?` → Help dialog opens
   - [ ] Dialog lists all shortcuts
   - [ ] Close help dialog

**Expected Result**: All keyboard shortcuts function correctly.

---

### T-023: Tooltips and UX Polish

**Goal**: Verify tooltips are present and helpful

1. **Hover Over Buttons**
   - [ ] Scanner tab → Hover over "Refresh" button → Tooltip appears
   - [ ] Import tab → Hover over "Import" button → Tooltip appears
   - [ ] Export tab → Hover over export options info icons → Detailed tooltips appear
   - [ ] Connections tab → Hover over engine checkboxes → Tooltips with timing/cost appear
   - [ ] Jobs tab → Hover over "Clear Completed" → Tooltip appears

2. **Info Icons**
   - [ ] Export tab → Hover over "Include Connections" info icon → Detailed explanation
   - [ ] Connections tab → Hover over "Smart Mode" info icon → Explanation of preservation
   - [ ] Verify tooltips are contextual and helpful

3. **Empty States**
   - [ ] Reset database: `npx supabase db reset`
   - [ ] Open Scanner tab → Empty state message appears
   - [ ] Message should say: "No documents in Storage yet. Process a document to get started."
   - [ ] Open Import tab → Empty state appears with helpful message

4. **Loading States**
   - [ ] Trigger any operation (scan, import, export)
   - [ ] Verify loading spinner appears
   - [ ] Verify loading message is clear (e.g., "Scanning Storage..." not just generic spinner)

**Expected Result**: All buttons have tooltips, info icons provide details, empty/loading states are polished.

---

## Regression Tests ✅

### Existing Features Validation

**Goal**: Ensure Storage-First Portability didn't break existing features

1. **Document Processing**
   - [ ] Upload new PDF → Processing completes successfully
   - [ ] Upload new EPUB → Processing completes successfully
   - [ ] Upload YouTube URL → Transcript extracted and processed
   - [ ] Upload web article URL → Article extracted and processed

2. **Document Reading** (if reader exists)
   - [ ] Navigate to a processed document's reader page
   - [ ] Markdown renders correctly
   - [ ] Virtual scrolling works (smooth scroll through long document)
   - [ ] Text selection works

3. **Annotations** (if annotation system exists)
   - [ ] Select text in reader
   - [ ] Create annotation
   - [ ] Annotation persists (refresh page, still there)
   - [ ] Annotations survive import with merge_smart strategy

4. **Collision Detection**
   - [ ] Process 2 documents
   - [ ] Verify connections table has entries:
     ```sql
     SELECT COUNT(*) FROM chunk_connections;
     ```
   - [ ] Should have connections from semantic_similarity, contradiction_detection, thematic_bridge

5. **ECS System**
   - [ ] Verify entities table has entries
   - [ ] Verify components table has entries
   - [ ] ECS queries work (if you have UI that uses ECS)

**Expected Result**: All existing features work as before, no regressions.

---

## Performance Validation ✅

### Performance Targets

1. **Storage Scanner**
   - [ ] Scan 50 documents
   - [ ] Measure time (should be <5 seconds)
   - [ ] Check browser DevTools Network tab for efficiency

2. **Import Operation**
   - [ ] Import single document (382 chunks)
   - [ ] With regenerate embeddings option
   - [ ] Measure total time (should be <5 minutes)
   - [ ] Check progress updates are smooth

3. **Export Operation**
   - [ ] Export single document
   - [ ] Measure time (should be <2 minutes)
   - [ ] Check ZIP file size is reasonable

4. **Reprocess Connections**
   - [ ] Reprocess document (382 chunks, all 3 engines)
   - [ ] Measure time (should be <15 minutes)
   - [ ] Check progress updates

**Expected Result**: All operations meet performance targets.

---

## Browser Compatibility ✅

### Cross-Browser Testing

1. **Chrome**
   - [ ] All features work
   - [ ] No console errors
   - [ ] Animations smooth

2. **Firefox**
   - [ ] All features work
   - [ ] No console errors
   - [ ] Animations smooth

3. **Safari** (Mac only)
   - [ ] All features work
   - [ ] No console errors
   - [ ] Animations smooth

**Expected Result**: Works in all major browsers.

---

## Data Integrity Validation ✅

### Critical Data Integrity Checks

1. **Round-Trip Test: Export → Delete DB → Import → Verify**
   ```bash
   # Step 1: Process document
   # Step 2: Export document to ZIP
   # Step 3: Delete all chunks from database
   DELETE FROM chunks WHERE document_id = '<doc_id>';
   # Step 4: Import from Storage (or extracted ZIP)
   # Step 5: Verify data matches
   ```
   - [ ] Chunk count matches
   - [ ] Chunk content matches
   - [ ] Metadata matches
   - [ ] Annotations preserved (if merge_smart used)

2. **Connection Preservation**
   - [ ] Mark 10 connections as validated
   - [ ] Reprocess with Smart Mode
   - [ ] Verify 10 validated connections still exist
   - [ ] Verify backup file created

3. **Annotation Preservation** (if annotation system exists)
   - [ ] Create 5 annotations on document
   - [ ] Import with merge_smart strategy
   - [ ] Verify all 5 annotations still work
   - [ ] Annotations point to correct chunks

**Expected Result**: Zero data loss, all data integrity checks pass.

---

## Final Validation ✅

### Complete System Health Check

1. **Run Automated Validation**
   ```bash
   npx tsx scripts/validate-complete-system.ts --full
   ```
   - [ ] All automated tests pass
   - [ ] No failures reported

2. **Console Check**
   - [ ] Open browser DevTools Console
   - [ ] Navigate through all Admin Panel tabs
   - [ ] Perform key operations
   - [ ] **No console errors** (warnings OK if expected)

3. **Database Check**
   ```sql
   -- Check no orphaned data
   SELECT COUNT(*) FROM chunks WHERE document_id NOT IN (SELECT id FROM documents);
   -- Should be 0

   SELECT COUNT(*) FROM chunk_connections WHERE source_chunk_id NOT IN (SELECT id FROM chunks);
   -- Should be 0
   ```
   - [ ] No orphaned chunks
   - [ ] No orphaned connections
   - [ ] Database integrity intact

4. **Storage Check**
   - [ ] Open Supabase Storage UI
   - [ ] Navigate through document folders
   - [ ] Verify all processed documents have complete file sets
   - [ ] No corrupted JSON files

**Expected Result**: Complete system is healthy, no errors, no data loss.

---

## Test Completion Summary

### Validation Results

**Testing Sessions**: 5 sessions completed
**Total Tests Executed**: 18 / 47 (38%)
**Tests Passed**: 18 ✅
**Tests Failed**: 0 ❌
**Bugs Found**: 22 (all fixed)

### Session 2 Progress (2025-10-14)

**Completed**:
- ✅ Phase 3: Storage Scanner (T-009, T-010)
- ✅ Phase 4: Import Without Conflict (T-011)
- 🟡 Phase 4: Conflict Resolution - Skip Strategy (T-012 partial)

**Bugs Fixed This Session**:
1. Bug #5: `details` column error in background-jobs polling
2. Bug #6: Dialog close doesn't clean up pending job state
3. Bug #7: Skip strategy returns undefined jobId
4. Bug #8: Polling temp job IDs causes database errors
5. Bug #9: Apply resolution triggers cancellation

---

### Session 3 Progress (2025-10-14 - continued)

**Completed**:
- ✅ Phase 4: Conflict Resolution refinement (T-012 continued)
- 🟡 Deep debugging of import workflow state management
- 🟡 Promise lifecycle and job ID replacement testing

**Bugs Fixed This Session** (11 total):

---

### Session 4 Progress (2025-10-14 - Job Display System Refactor)

**Completed**:
- ✅ Created shared JobList component (`src/components/admin/JobList.tsx`)
- ✅ Updated JobsTab to display ALL background jobs with 7-filter system
- ✅ Refactored ImportTab to use shared JobList component
- ✅ Fixed UX inconsistency: Jobs now appear in Jobs tab where expected

**Features Added**:
1. **Shared JobList Component** (~200 lines)
   - 7 filter tabs: All, Import, Export, Connections, Active, Completed, Failed
   - Job cards with status icons, progress bars, error messages
   - Type-based and status-based filtering
   - Responsive design with sorting (newest first)

2. **JobsTab Enhancement**
   - Now displays comprehensive job history (was empty before)
   - Shows all job types: import_document, export_documents, reprocess_connections
   - Maintains existing job control buttons (Clear, Stop, Nuclear Reset)
   - Filter counts in badges

3. **ImportTab Refactor**
   - Removed ~30 lines of duplicate job display code
   - Uses shared JobList with filter=false (focused import-only view)
   - Cleaner code, less duplication

**UX Improvements**:
- Jobs tab now matches user expectations ("show me all jobs")
- Import tab maintains focused workflow (no filter clutter)
- Processing Dock continues showing active jobs (no conflict)
- No confusion about where jobs are displayed

**Code Quality**:
- DRY principle: Single job display component shared across tabs
- Type-safe: Full TypeScript support
- Maintainable: Fix bugs once, applies everywhere
- Extensible: Easy to add new job types or filters

**Bugs Fixed This Session** (1 total):

1. **Bug #10: Job ID Replacement Issue**
   - **Problem**: `updateJob()` changed internal `id` field but kept Map key as temp ID, causing polling to skip the job
   - **Fix**: Added `replaceJob()` method that removes old job and creates new one with real UUID
   - **Files**: `src/stores/admin/background-jobs.ts`, `src/components/admin/tabs/ImportTab.tsx`

2. **Bug #11: Import State Stuck (Promise Never Resolves)**
   - **Problem**: Dialog close/cancel didn't resolve Promise, causing `isImporting` state to hang forever
   - **Fix**: Store both resolve and reject callbacks in `currentConflict` state, call them on all exit paths
   - **Files**: `src/components/admin/tabs/ImportTab.tsx`

3. **Bug #11b: Unnecessary Scanning on Cancel**
   - **Problem**: `scan()` called unconditionally after import loop, even when user just cancelled
   - **Fix**: Track `successfulImports` count, only scan if > 0
   - **Files**: `src/components/admin/tabs/ImportTab.tsx`

4. **Bug #11c: Misleading "Failed" Jobs**
   - **Problem**: Cancelled/skipped imports showed as "failed" jobs in UI
   - **Fix**: Call `removeJob()` instead of marking as failed - no job appears if nothing imported
   - **Files**: `src/components/admin/tabs/ImportTab.tsx`

5. **Bug #12: Polling State Inconsistency**
   - **Problem**: `removeJob()` didn't check if polling should stop, causing inconsistent state
   - **Fix**: Added auto-stop polling logic to `removeJob()` (matching `updateJob()`)
   - **Files**: `src/stores/admin/background-jobs.ts`

6. **Bug #13: Job Not Appearing After Cancel→Retry**
   - **Problem**: `replaceJob()` silently failed if old job didn't exist
   - **Fix**: Added fallback to create new job from scratch if old job not found, plus comprehensive logging
   - **Files**: `src/stores/admin/background-jobs.ts`

7. **Bug #14: Dialog Double-Close Issue**
   - **Problem**: Dialog called `onResolved(jobId)` then `onClose()`, triggering `onRejected()` and causing "Import cancelled" error
   - **Fix**: Removed `onClose()` calls from dialog success paths - let `handleConflictResolved` close dialog
   - **Files**: `src/components/admin/ConflictResolutionDialog.tsx`

8. **Bug #15: 'skip' Strategy UUID Error**
   - **Problem**: Calling `replaceJob(tempJobId, 'skip')` created job with ID 'skip', causing PostgreSQL UUID error
   - **Fix**: Handle 'skip' in Promise callback - call `removeJob()` instead of `replaceJob()`
   - **Files**: `src/components/admin/tabs/ImportTab.tsx`

9. **Bug #16: Page Refresh on Button Click**
   - **Problem**: Buttons missing `type="button"` defaulted to `type="submit"`, causing form submission/page refresh
   - **Fix**: Added `type="button"` to both "Cancel" and "Apply Resolution" buttons
   - **Files**: `src/components/admin/ConflictResolutionDialog.tsx`

10. **Bug #17: Panel Flashing During Job**
    - **Problem**: `useEffect` with `scan` in dependencies re-scanned on every render during job updates
    - **Fix**: Changed to empty dependency array `[]` - scan only on mount
    - **Files**: `src/components/admin/tabs/ImportTab.tsx`

11. **Bug #18: handleConflictResolved Missing onResolved Call**
    - **Problem**: After refactor, `handleConflictResolved` never called `onResolved()`, so worker never started
    - **Fix**: Added `currentConflict.onResolved?.(jobId)` call
    - **Files**: `src/components/admin/tabs/ImportTab.tsx`

**Key Learnings**:
1. State management is hard - Promise callbacks, Zustand stores, and React state need careful coordination
2. Button types matter - Always specify `type="button"` in dialogs to prevent form submission
3. useEffect dependencies - Empty array `[]` for mount-only effects, avoid function references that change
4. Job lifecycle management - Need consistent handling across all exit paths (success, cancel, error)
5. Polling state - All job mutations must check if polling should start/stop

**Final Result**: Import workflow now works correctly:
- ✅ Cancel/close dialog → No job, no refresh
- ✅ Skip strategy → No job, clean exit
- ✅ Replace/Merge strategies → Job appears, updates smoothly, no flashing
- ✅ No page refreshes, no unnecessary scans, no UI flickering

**Bugs Fixed This Session (Session 4)** (1 total):

1. **Bug #19: Jobs Tab Missing Job List**
   - **Problem**: Jobs tab only showed control buttons, no actual jobs displayed
   - **Root Cause**: JobsTab component never subscribed to background-jobs store or rendered job list
   - **Impact**: Users confused about where import/export jobs were displayed
   - **Fix**: Created shared JobList component, updated JobsTab to show all jobs with filtering
   - **Files**:
     - Created: `src/components/admin/JobList.tsx`
     - Updated: `src/components/admin/tabs/JobsTab.tsx`, `src/components/admin/tabs/ImportTab.tsx`

---

### Session 5 Progress (2025-10-15 - Import Workflow Completion)

**Completed**:
- ✅ T-012.5: Replace Strategy - Complete chunk replacement
- ✅ T-012.6: Merge Smart Strategy - Annotation preservation
- ✅ T-013: Embeddings Regeneration - Fixed and verified

**Tests Executed**:

1. **Replace Strategy (T-012.5)**
   - Created conflict by modifying chunk in database
   - Selected "Replace All" in conflict dialog
   - Verified all old chunks deleted, new chunks with fresh UUIDs inserted
   - Confirmed chunk count matches Storage (3 chunks)
   - Result: ✅ PASSED

2. **Merge Smart Strategy (T-012.6)**
   - Created 3 annotations via ECS on chunk `f03c3ab0-2c19-4c5c-b989-ff5400c2c1ce`
   - Created conflict by modifying chunk metadata
   - Selected "Merge Smart" strategy
   - Verified:
     - Chunk IDs preserved (same UUID after import)
     - Metadata updated from Storage
     - All 3 annotations intact and functional
   - Result: ✅ PASSED

3. **Embeddings Regeneration (T-013)**
   - Initially failed - embeddings not created
   - Found Bug #20 (import options hard-coded to false)
   - Fixed and retested
   - Verified all 3 chunks have 768-dimensional embeddings from Gemini API
   - Result: ✅ PASSED after fix

**Bugs Fixed This Session** (1 total):

**Bug #20: Import Options Not Passed to Dialog**
- **Problem**: ConflictResolutionDialog had hard-coded `regenerateEmbeddings: false` and `reprocessConnections: false`, ignoring user selections in ImportTab
- **Root Cause**: Dialog interface wasn't receiving import option props from parent ImportTab component
- **Impact**: Embeddings never regenerated despite checkbox being checked
- **Fix**:
  1. Added `regenerateEmbeddings?: boolean` and `reprocessConnections?: boolean` to ConflictResolutionDialogProps interface
  2. Updated component function signature to accept and default these props to false
  3. Changed importFromStorage call to use prop values instead of hard-coded false
  4. Updated ImportTab to pass `regenerateEmbeddings={regenerateEmbeddings}` and `reprocessConnections={reprocessConnections}` to dialog
- **Files Modified**:
  - `src/components/admin/ConflictResolutionDialog.tsx` - Added props to interface and component
  - `src/components/admin/tabs/ImportTab.tsx` - Pass props to dialog
- **Verification**:
  - Checked background_jobs table: Job data showed `regenerateEmbeddings: true`
  - Checked chunks table: All 3 chunks had non-null embeddings after import
  - User confirmed embeddings created successfully

**Test Document**: "Tiny Test PDF" (document_id: `369e6062-8447-48c9-b526-229b48edecec`, 3 chunks)

**Key Insights**:
- Merge Smart is the most critical strategy for production use - preserves user annotations
- Replace strategy useful for fixing corrupted chunks or reverting bad processing
- Embeddings regeneration adds 30-60 seconds per chunk to import time
- Chunk ID preservation is essential for annotation system integrity

**Session Summary**: Phase 4 (Import Workflow) now 100% complete. All conflict resolution strategies validated and working correctly.

---

**Issues Found**: 22 total (9 from Sessions 1-2, 11 from Session 3, 1 from Session 4, 1 from Session 5)

### Critical Issues (P0)
<!-- List any blocking issues found during testing -->

-

### High Priority Issues (P1)
<!-- List important but non-blocking issues -->

-

### Medium Priority Issues (P2)
<!-- List nice-to-fix issues -->

-

### Notes
<!-- Any additional observations or recommendations -->

-

---

## Sign-Off

**Tester**: _______________
**Date**: _______________
**Status**: [ ] PASS [ ] PASS WITH ISSUES [ ] FAIL

---

## Next Steps

- [ ] Fix all P0 (Critical) issues
- [ ] Document any workarounds for known issues
- [ ] Update user documentation with any changes
- [ ] Plan P1/P2 issue remediation
- [ ] Consider Phase 8 enhancements (if any)

---

**END OF MANUAL TESTING CHECKLIST**
