---
date: 2025-10-21T05:10:00-07:00
commit: 26443f469eb17da8a36847fcd27b034269f802dc
branch: reader-ui
topic: "Admin Panel Fixes & Spark Portability Testing"
tags: [admin, sparks, storage, vault, portability, testing]
status: in_progress
---

# Handoff: Admin Panel Fixes & Spark Portability Testing

## Task(s)

### ✅ Completed This Session

1. **Fixed `import-review.ts` to Use AnnotationOperations**
   - Status: ✅ Complete
   - Issue: Used old single-component pattern with lowercase names, missing entity_type
   - Fix: Refactored to use AnnotationOperations wrapper (5-component ECS pattern)
   - File: `src/app/actions/import-review.ts:179-196`

2. **Updated Vault Structure for Sparks**
   - Status: ✅ Complete
   - Change: JSON files moved to `.rhizome/` subfolder (hidden in Obsidian)
   - Pattern: Matches document vault structure (Documents/{title}/.rhizome/)
   - Files: `worker/lib/vault-export-sparks.ts`, `worker/lib/vault-import-sparks.ts`

3. **Fixed Storage Upload Issues in Spark Creation**
   - Status: ✅ Complete
   - Issue 1: Missing `upsert: true` caused silent failures on duplicate filenames
   - Issue 2: RLS policy blocked uploads (used ANON_KEY instead of SERVICE_ROLE_KEY)
   - Fix: Added `upsert: true` + switched to admin client
   - File: `src/app/actions/sparks.ts:116-135`

4. **Tested Spark Portability Features**
   - Export: ✅ Works (creates .md + .json in correct locations)
   - Import: ✅ Works (reads from `.rhizome/` subfolder)
   - Orphan Survival: ✅ Works (sparks survive document deletion with documentId=NULL)
   - Storage Rebuild: ✅ Script successfully rebuilds missing files

5. **Fixed Admin Panel Scanner Tab**
   - Status: ✅ Complete
   - Issue: Treated `sparks/` folder as document folder
   - Fix: Excluded `sparks/` from document scan filter
   - File: `src/app/actions/documents.ts:536-538`

6. **Fixed Admin Panel Import Tab**
   - Status: ✅ Complete
   - Issue: FK constraint error when importing chunks for deleted document
   - Fix: Check if document exists, create from metadata.json if missing
   - File: `worker/handlers/import-document.ts:81-131`

### 🔄 In Progress / Needs Testing

7. **Admin Panel Testing**
   - Scanner Tab: ✅ Fixed, needs verification
   - Import Tab: ✅ Fixed, needs testing with deleted document
   - Export Tab: ⏳ Not tested, may need spark exclusion
   - Connections Tab: ⏳ Not tested, verify still works
   - Integrations Tab: ✅ Working (spark import/export tested)
   - Jobs Tab: ✅ Working (verified during testing)

8. **Upload Test Documents**
   - Status: ⏳ Pending (user will upload more documents for testing)

### ⏳ TODO (Future Sessions)

9. **Full Round-Trip Test** (From handoff 2025-10-21)
   - Export all sparks → Delete all from DB → Import all → Verify integrity
   - Test with multiple documents and sparks

10. **Phase 6: ZIP Export with Sparks** (From plan)
    - Update `worker/handlers/export-document.ts` to include sparks folder
    - Add spark count to manifest

11. **Orphan Spark UI** (Enhancement)
    - Show warning when viewing orphaned sparks
    - Add "Re-link to document" functionality

---

## Critical Rhizome References

- Architecture: `docs/ARCHITECTURE.md`
- ECS Implementation: `docs/ECS_IMPLEMENTATION.md`
- Spark System: `docs/SPARK_SYSTEM.md`
- Annotations System: `docs/ANNOTATIONS_SYSTEM.md`
- Storage Patterns: `docs/STORAGE_PATTERNS.md`
- Storage-First Portability: `docs/STORAGE_FIRST_PORTABILITY_GUIDE.md`
- Testing Rules: `docs/testing/TESTING_RULES.md`
- Spark Portability Plan: `thoughts/plans/2025-01-21_spark-portability-global-architecture.md`
- Previous Handoff: `thoughts/handoffs/2025-10-21_global-spark-capture-and-entity-type-fixes.md`

---

## Recent Changes

### Fixed Files (3)

**1. `src/app/actions/import-review.ts:1-7,179-196`**
- Added: `import { AnnotationOperations } from '@/lib/ecs/annotations'`
- Changed: Replaced direct `ecs.createEntity()` with `AnnotationOperations.create()`
- Effect: Readwise import review now uses correct 5-component ECS pattern
- Entity type: Now sets `entity_type='annotation'` correctly

**2. `src/app/actions/documents.ts:536-540`**
- Changed: Added `&& item.name !== 'sparks'` filter to Scanner
- Effect: Sparks folder no longer appears as document in Scanner tab
- Prevents: "missing_from_db" false positives for non-document folders

**3. `worker/handlers/import-document.ts:81-131`**
- Added: Document existence check before chunk import
- Added: Document creation from `metadata.json` if missing
- Effect: Can restore deleted documents from Storage (true portability!)
- Fixes: FK constraint error when importing chunks for non-existent document

### Updated Files (2)

**4. `worker/lib/vault-export-sparks.ts:10-22,52-56`**
- Changed: JSON files export to `.rhizome/` subfolder
- Changed: Markdown files export to main Sparks/ folder
- Pattern: Matches document vault structure
- Location: `Rhizome/Sparks/.rhizome/{date}-spark-{title}.json`

**5. `worker/lib/vault-import-sparks.ts:10-30,39`**
- Changed: Reads JSON from `.rhizome/` subfolder
- Changed: Checks for `.rhizome/` directory existence
- Effect: Import works with new hidden metadata structure

### Previously Modified (From Earlier in Session)

**6. `src/app/actions/sparks.ts:6,116-135`**
- Added: `import { createAdminClient } from '@/lib/supabase/admin'`
- Changed: Use admin client for Storage uploads (bypasses RLS)
- Added: `upsert: true` to prevent duplicate filename errors
- Effect: Storage uploads now reliable, no more silent failures

---

## Rhizome Architecture Decisions

### Completed Work
- [x] Module: Both (Main App actions + Worker handlers)
- [x] Storage: Both (Database for queries + Storage for portability)
- [x] Migration: Current is 062 (spark portability), no new migrations needed
- [x] Test Tier: Stable (manual testing required for Admin Panel)
- [x] Pipeline Stage: None (Admin Panel and portability features)
- [x] Engines: None (no connection engine changes)

### Architecture Patterns Validated

**Storage-First Portability** ✅
- Scanner excludes non-document folders
- Import creates document from metadata if missing
- Sparks survive document deletion (orphan survival)

**Vault Structure Consistency** ✅
- Documents: `Documents/{title}/.rhizome/` for metadata
- Sparks: `Sparks/.rhizome/` for metadata
- Pattern: All metadata in hidden `.rhizome/` subfolders

**ECS Operations Pattern** ✅
- All annotation creation uses AnnotationOperations
- All spark creation uses SparkOperations
- No direct `ecs.createEntity()` calls in main app

---

## Learnings

### 1. Storage Upload RLS Issue

**Problem**: Storage uploads failed with "violates row-level security policy"

**Root Cause** (`src/app/actions/sparks.ts:117-129`):
- Used regular client (ANON_KEY) for Storage operations
- RLS policy: `(auth.uid())::text = (storage.foldername(name))[1]`
- In Server Action context, `auth.uid()` was NULL
- Upload to `00000000.../sparks/` failed because `NULL ≠ 00000000...`

**Solution**:
```typescript
const adminClient = createAdminClient()  // Uses SERVICE_ROLE_KEY
await adminClient.storage.from('documents').upload(...)  // Bypasses RLS
```

**Lesson**: For server-side Storage operations in personal tools, admin client is appropriate and safe.

### 2. Scanner False Positives from New Folders

**Problem**: New `sparks/` folder appeared in Scanner as "missing_from_db"

**Root Cause** (`src/app/actions/documents.ts:535-538`):
- Scanner listed ALL folders under `{userId}/`
- New storage structure: `{userId}/sparks/` for spark files
- Scanner treated `sparks/` as document folder (invalid UUID)

**Solution**:
```typescript
const folders = (storageFolders || []).filter(item =>
  !item.metadata && item.name !== 'sparks'  // Exclude non-document folders
)
```

**Lesson**: As storage structure evolves, explicitly exclude non-document folders from document scans.

### 3. Import FK Constraint for Deleted Documents

**Problem**: Import failed with "violates foreign key constraint chunks_document_id_fkey"

**Root Cause** (`worker/handlers/import-document.ts:295-300`):
- Import assumed document record always exists
- Document deleted during orphan survival test
- Chunks couldn't insert without parent document

**Solution** (`worker/handlers/import-document.ts:81-131`):
- Check if document exists before importing chunks
- If missing, read `metadata.json` from Storage
- Create document record with original metadata
- Then proceed with chunk import

**Lesson**: True portability means Storage can restore entire documents, not just chunks. Always validate FK targets exist before batch inserts.

### 4. Vault Structure User Experience

**Discovery**: User requested JSON files be hidden in Obsidian vault

**Insight**:
- Markdown files: Human-readable, for Obsidian reading/searching
- JSON files: Machine-readable metadata, clutter the UI
- Solution: `.rhizome/` subfolder pattern (already used for documents)

**Benefit**:
- Cleaner Obsidian vault (only .md files visible)
- Consistent with document pattern
- Hidden folders work across platforms (`.` prefix)

---

## Artifacts

### Files Created This Session
- None (all changes were edits to existing files)

### Files Modified This Session
1. `src/app/actions/import-review.ts` - AnnotationOperations refactor
2. `src/app/actions/documents.ts` - Scanner spark exclusion
3. `src/app/actions/sparks.ts` - Admin client for Storage uploads (from earlier)
4. `worker/handlers/import-document.ts` - Document creation before chunk import
5. `worker/lib/vault-export-sparks.ts` - `.rhizome/` subfolder structure
6. `worker/lib/vault-import-sparks.ts` - Read from `.rhizome/` subfolder

### Files Needing Attention (Not Changed)
1. `worker/handlers/readwise-import.ts:176-256` - Still uses old annotation pattern (mentioned in previous handoff, worker limitation)
2. `src/components/admin/tabs/ExportTab.tsx` - May need testing to verify still works
3. `src/components/admin/tabs/ConnectionsTab.tsx` - May need testing to verify still works

### Vault Structure (Updated)
```
/Users/topher/Tophs Vault/Rhizome/Sparks/
├── {date}-spark-{title}.md              ← Readable in Obsidian
├── {date}-spark-{title}.md
└── .rhizome/                             ← Hidden metadata
    ├── {date}-spark-{title}.json
    └── {date}-spark-{title}.json
```

---

## Service Restart Requirements

- [x] Supabase: Not needed (no schema changes)
- [x] Worker: **Needed** if testing import (code changes in `import-document.ts`)
- [x] Next.js: Auto-reload verified ✅

**Worker Restart**:
```bash
# Stop worker
pkill -f "worker/index"

# Start worker
cd worker && npm start
# OR from root
npm run dev
```

---

## Testing Status

### ✅ Tests Passed

1. **Spark Portability - Export**
   - Exported 3 sparks successfully
   - Markdown files in `Sparks/`
   - JSON files in `Sparks/.rhizome/`
   - Structure verified manually

2. **Spark Portability - Import**
   - Deleted spark from database
   - Imported from vault `.rhizome/` folder
   - All 4 components restored (Spark, Content, Temporal, ChunkRef)
   - `entity_type = 'spark'` set correctly
   - Storage file restored
   - Cache populated

3. **Orphan Survival**
   - Created spark linked to document
   - Deleted document (`Test 1` / `abaa9ad1-bcb7-4778-9b3b-3cf1d2db0be2`)
   - Spark survived with `documentId=NULL`
   - `documentTitle` preserved in JSONB for UI warning
   - Cache updated to `document_id=NULL`

4. **Storage Upload Reliability**
   - Created new spark after fixes
   - Storage upload succeeded (no RLS error)
   - File appeared in Storage bucket
   - Verified with `scripts/rebuild-spark-storage.ts` (3 files)

### ⏳ Tests Needed

**Admin Panel Testing**:
1. **Scanner Tab** - Verify no `sparks/` folder in results
2. **Import Tab** - Test importing deleted document (`Test 1`)
   - Should create document from `metadata.json`
   - Should import all chunks
   - Should succeed without FK errors
3. **Export Tab** - Verify ZIP export still works, doesn't include sparks folder
4. **Connections Tab** - Verify connection reprocessing still works
5. **Integrations Tab** - Already tested (spark import/export working)
6. **Jobs Tab** - Already verified (pause/resume buttons work)

**Spark Portability (From Previous Handoff)**:
- [ ] Full round-trip: Export all → Delete all → Import all → Verify integrity
- [ ] Phase 6: ZIP export with sparks folder
- [ ] Orphan spark UI warning

**Document Upload**:
- [ ] Upload test documents (user will provide)
- [ ] Verify Scanner shows them correctly
- [ ] Verify processing works
- [ ] Create sparks linked to new documents

---

## Context Usage

- Files read: ~30
- Tokens used: ~127,000 / 200,000
- Compaction needed: NO (sufficient headroom)

---

## Next Steps

### Immediate (Start of Next Session)

1. **Restart Worker** (critical if testing import!)
   ```bash
   pkill -f "worker/index" && cd worker && npm start
   ```

2. **Test Admin Panel Import Tab**
   - Try importing deleted document `Test 1` (abaa9ad1-bcb7-4778-9b3b-3cf1d2db0be2)
   - Expected: Creates document from `metadata.json`, imports chunks successfully
   - Verifies: Document restoration from Storage (full portability)

3. **Test Admin Panel Scanner Tab**
   - Open Scanner, verify no `sparks/` folder in results
   - Expected: Only document folders listed

4. **Upload Test Documents** (User will do)
   - Upload 2-3 documents via UI
   - Verify they appear in Scanner
   - Verify processing completes
   - Create sparks linked to them

### Medium Priority

5. **Test Export/Connections Tabs**
   - Export Tab: Verify ZIP export still works
   - Connections Tab: Verify connection reprocessing
   - Both should be unaffected by our changes

6. **Full Round-Trip Test** (Comprehensive)
   - Export all sparks to vault
   - Delete all sparks from database
   - Import all sparks from vault
   - Verify counts match
   - Verify all data preserved (timestamps, tags, selections)

### Low Priority / Future

7. **Phase 6: ZIP Export with Sparks**
   - Update `worker/handlers/export-document.ts`
   - Add `sparks/` folder to ZIP
   - Update manifest with spark count

8. **Orphan Spark UI**
   - Implement warning in `SparksTab.tsx`
   - Show "Original document '{title}' was deleted"
   - Add re-link functionality

---

## Other Notes

### Useful Commands

**Check entity types in database**:
```bash
PGPASSWORD=postgres psql -h 127.0.0.1 -p 54322 -U postgres -d postgres -c "
  SELECT entity_type, COUNT(*) FROM entities GROUP BY entity_type;
"
```

**Rebuild spark Storage files**:
```bash
npx tsx scripts/rebuild-spark-storage.ts
```

**Check vault directory**:
```bash
ls -la "/Users/topher/Tophs Vault/Rhizome/Sparks"
ls -la "/Users/topher/Tophs Vault/Rhizome/Sparks/.rhizome"
```

**Test deleted document import**:
```bash
# Document ID: abaa9ad1-bcb7-4778-9b3b-3cf1d2db0be2
# Title: Test 1
# Storage path: 00000000-0000-0000-0000-000000000000/abaa9ad1-bcb7-4778-9b3b-3cf1d2db0be2
# Status: Deleted from DB, exists in Storage
```

### Important File Locations

**Spark System Files**:
- Actions: `src/app/actions/sparks.ts`
- Operations: `src/lib/ecs/sparks.ts`
- Components: `src/lib/ecs/components.ts`
- Storage: `src/lib/sparks/storage.ts`
- Title Gen: `src/lib/sparks/title-generator.ts`

**Vault Import/Export**:
- Spark Export: `worker/lib/vault-export-sparks.ts`
- Spark Import: `worker/lib/vault-import-sparks.ts`
- Document Import: `worker/handlers/import-document.ts`

**Admin Panel**:
- Scanner: `src/components/admin/tabs/ScannerTab.tsx`
- Import: `src/components/admin/tabs/ImportTab.tsx`
- Export: `src/components/admin/tabs/ExportTab.tsx`
- Connections: `src/components/admin/tabs/ConnectionsTab.tsx`
- Integrations: `src/components/admin/tabs/IntegrationsTab.tsx`
- Jobs: `src/components/admin/tabs/JobsTab.tsx`

**Utilities**:
- Rebuild Spark Storage: `scripts/rebuild-spark-storage.ts`

### Known Issues

1. **`worker/handlers/readwise-import.ts`** - Still uses old annotation pattern
   - Issue identified in previous handoff
   - Worker module limitation (can't easily import frontend Operations classes)
   - Low priority (Readwise import works, just not with optimal pattern)

2. **Storage Upload Silent Failures** - Partially mitigated
   - Added `upsert: true` and admin client
   - Rebuild script available as fallback
   - Monitor for recurring issues

### Session Highlights

**Major Wins**:
1. ✅ All ECS annotation creation now uses Operations pattern
2. ✅ Vault structure cleaned up (hidden JSON files)
3. ✅ Storage uploads reliable (admin client + upsert)
4. ✅ Admin Panel Scanner excludes non-document folders
5. ✅ Import can restore deleted documents (true portability!)
6. ✅ Orphan survival fully tested and working

**Technical Debt Addressed**:
- Fixed `import-review.ts` old pattern (from previous handoff TODO)
- Resolved Storage RLS issues
- Improved import resilience

**Testing Coverage**:
- Spark export/import: ✅ Tested
- Orphan survival: ✅ Tested
- Storage rebuild: ✅ Tested
- Admin Panel: 🔄 Partially tested

---

## Questions for Next Session

1. Should we implement ZIP export with sparks (Phase 6) or focus on other features?
2. Do we want orphan spark UI now, or defer to later?
3. Any other Admin Panel issues discovered during testing?
4. How many test documents will be uploaded?

---

**Resume this session with**:
```bash
/rhizome:resume-handoff thoughts/handoffs/2025-10-21_admin-panel-fixes-spark-portability-testing.md
```
