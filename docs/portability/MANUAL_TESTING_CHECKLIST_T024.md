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

- [ ] **Supabase Running**: `npx supabase start` (verify with `npx supabase status`)
- [ ] **Worker Running**: `cd worker && npm run dev`
- [ ] **Next.js Running**: `npm run dev:next`
- [ ] **Browser**: Chrome/Firefox with DevTools open
- [ ] **Test Document**: Have 1 PDF (50-200 pages) and 1 EPUB ready for testing
- [ ] **Clean State**: Fresh database reset (`npx supabase db reset`) recommended

### Environment Validation

- [ ] Check `.env.local` has correct Supabase credentials
- [ ] Check `worker/.env` has correct Supabase credentials
- [ ] Verify no console errors on app startup
- [ ] Verify database connection: Check Supabase Studio (http://localhost:54323)

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

## Phase 2: Admin Panel UI ✅

### T-007: Admin Panel Refactor

**Goal**: Verify Admin Panel uses Sheet component and has 6 tabs

1. **Open Admin Panel**
   - [ ] Navigate to any page in app
   - [ ] Click **Database icon** in TopNav header
   - [ ] **OR** Press `Cmd+Shift+A` (Mac) / `Ctrl+Shift+A` (Windows)

2. **Verify Sheet Animation**
   - [ ] Panel slides down from top (smooth animation)
   - [ ] Height is approximately 85vh
   - [ ] Backdrop appears (dimmed background)

3. **Verify Tabs**
   - [ ] Count tab triggers at top: should be **6 tabs**
   - [ ] Tab names:
     1. Scanner
     2. Import
     3. Export
     4. Connections
     5. Integrations
     6. Jobs

4. **Close Admin Panel**
   - [ ] Press `Esc` → Panel closes
   - [ ] Click backdrop → Panel closes
   - [ ] Click X button in header → Panel closes
   - [ ] Press `Cmd+Shift+A` again → Panel toggles

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

## Phase 3: Storage Scanner ✅

### T-009: scanStorage Server Action

**Goal**: Verify Storage scanner compares Storage vs Database

1. **Prepare Test Data**
   - [ ] Ensure at least 1 document processed (Phase 1 tests)
   - [ ] Optionally: Delete chunks from database for one document (to test "missing_from_db" state)

2. **Open Scanner Tab**
   - [ ] Open Admin Panel → Navigate to Scanner tab
   - [ ] Scanner should auto-scan on mount
   - [ ] Watch for loading spinner

3. **Verify Scan Results**
   - [ ] Results table appears
   - [ ] Documents listed with:
     - Document title
     - Storage files count
     - Database status
     - Sync state badge (healthy, missing_from_db, out_of_sync, etc.)

**Expected Result**: Scanner accurately compares Storage vs Database state.

---

### T-010: Scanner UI and Filters

**Goal**: Verify Scanner UI features work correctly

1. **Filter Documents**
   - [ ] Click "All" filter → All documents show
   - [ ] Click "Missing from DB" filter → Only documents missing from DB show
   - [ ] Click "Out of Sync" filter → Only out-of-sync documents show
   - [ ] Click "Healthy" filter → Only healthy documents show
   - [ ] Verify summary stats update with each filter

2. **Expandable Rows**
   - [ ] Click a document row to expand
   - [ ] Verify file details show:
     - chunks.json (size, last updated)
     - metadata.json (size, last updated)
     - manifest.json (size, last updated)
     - cached_chunks.json (if LOCAL mode)

3. **Summary Statistics**
   - [ ] Verify summary shows:
     - Total documents in Storage
     - Total documents in Database
     - Missing from Database count
     - Out of Sync count
     - Healthy count
   - [ ] Stats should be accurate

**Expected Result**: Filters work, rows expand, statistics accurate.

---

## Phase 4: Import Workflow ✅

### T-011: Import Without Conflict

**Goal**: Verify import works when no conflict exists

1. **Prepare Test**
   - [ ] Process a document (from Phase 1)
   - [ ] Delete all chunks for that document from database:
     ```sql
     DELETE FROM chunks WHERE document_id = '<doc_id>';
     ```
   - [ ] Verify chunks still exist in Storage (Scanner should show "missing_from_db")

2. **Import Document**
   - [ ] Open Admin Panel → Import tab
   - [ ] OR: Scanner tab → Click "Import" button for the document
   - [ ] Verify import job starts
   - [ ] Monitor progress (should show percentage and stage)

3. **Verify Import Success**
   - [ ] Job completes with status "completed"
   - [ ] Check database:
     ```sql
     SELECT COUNT(*) FROM chunks WHERE document_id = '<doc_id>';
     ```
   - [ ] Chunk count matches Storage chunks.json
   - [ ] Scanner now shows "healthy" state

**Expected Result**: Import restores chunks from Storage to Database without conflict.

---

### T-012: Import with Conflict Resolution

**Goal**: Verify conflict detection and resolution strategies

1. **Create Conflict**
   - [ ] Process a document (has chunks in both Storage and Database)
   - [ ] Manually modify some chunks in database (change content or metadata)
   - [ ] Document is now in "out_of_sync" state

2. **Trigger Import**
   - [ ] Import tab → Select document → Click Import
   - [ ] Verify ConflictResolutionDialog opens

3. **Verify Conflict Dialog**
   - [ ] Dialog shows side-by-side comparison:
     - Existing (Database): chunk count, processed date
     - Import (Storage): chunk count, processed date
   - [ ] Sample chunks displayed (first 3)
   - [ ] Metadata differences highlighted

4. **Test Skip Strategy**
   - [ ] Select "Skip Import" radio button
   - [ ] Verify warning: "Import data will be ignored"
   - [ ] Click "Apply Resolution"
   - [ ] Verify: No changes occur, database unchanged
   - [ ] Dialog closes

5. **Test Replace Strategy**
   - [ ] Trigger import again
   - [ ] Select "Replace All" radio button
   - [ ] Verify warning: "Will reset all annotation positions"
   - [ ] Click "Apply Resolution"
   - [ ] Monitor import job progress
   - [ ] Verify:
     - All old chunks deleted
     - New chunks from Storage inserted
     - Chunk count matches Storage

6. **Test Merge Smart Strategy** (Most Important)
   - [ ] Create annotations on some chunks (if annotation system exists)
   - [ ] Trigger import again
   - [ ] Select "Merge Smart" radio button (should be default)
   - [ ] Verify info message: "Preserves annotations by keeping chunk IDs"
   - [ ] Click "Apply Resolution"
   - [ ] Monitor import job
   - [ ] Verify:
     - Chunk IDs unchanged
     - Metadata updated from Storage
     - Chunk content unchanged
     - Annotations still work (if applicable)

**Expected Result**: All 3 conflict resolution strategies work correctly.

---

### T-013: Import with Embeddings Regeneration

**Goal**: Verify optional embedding regeneration works

1. **Import with Embeddings Option**
   - [ ] Import tab → Select document
   - [ ] Check "Regenerate Embeddings" option
   - [ ] Start import

2. **Verify Embeddings**
   - [ ] Monitor progress: should show "Regenerating embeddings" stage
   - [ ] After completion, check database:
     ```sql
     SELECT id, embedding FROM chunks WHERE document_id = '<doc_id>' LIMIT 5;
     ```
   - [ ] Verify embedding columns are not null
   - [ ] Embeddings should be 768-dimensional vectors

**Expected Result**: Embeddings regenerated during import.

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

**Total Tests Executed**: _____ / _____
**Tests Passed**: _____ ✅
**Tests Failed**: _____ ❌
**Issues Found**: _____

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
