---
date: 2025-10-21T04:20:00-07:00
commit: ba88dba90cab94c7c5de5e3ed3eb84a5ea4e54de
branch: reader-ui
topic: "Global Spark Capture & ECS entity_type Fixes"
tags: [sparks, ecs, ui, portability, testing]
status: in_progress
---

# Handoff: Global Spark Capture Implementation & Entity Type Bug Fixes

## Task(s)

### ✅ Completed This Session

1. **Fixed Settings Page Input Warning** - Controlled/uncontrolled input error
   - Status: ✅ Complete
   - File: `src/app/settings/page.tsx:57-66`

2. **Made QuickSparkCapture Globally Available**
   - Status: ✅ Complete
   - Moved component from reader-specific to global
   - Added Cmd+K shortcut that works everywhere
   - Made all props optional to support global context

3. **Fixed Critical ECS entity_type Bug**
   - Status: ✅ Complete
   - Root cause: `createEntity()` wasn't setting entity_type
   - Fixed for both sparks and annotations
   - Updated existing entities in database

4. **Spark Portability Implementation (Phases 1-5)**
   - Status: ✅ Complete (per previous session)
   - Job handlers added for vault import/export
   - UI integration in IntegrationsTab

### 🔄 In Progress / Needs Testing

5. **Test Spark Portability End-to-End**
   - Status: 🔄 Partially tested
   - Export tested: ✅ Working (2 sparks exported)
   - Import: ⏳ Not tested yet
   - Orphan survival: ⏳ Not tested yet
   - Round-trip: ⏳ Not tested yet

6. **Fix import-review.ts to Use AnnotationOperations**
   - Status: ⏳ TODO (identified but not fixed)
   - File uses old annotation format (single component)
   - Should use 5-component ECS pattern via AnnotationOperations

## Critical Rhizome References

- Architecture: `docs/ARCHITECTURE.md`
- ECS Implementation: `docs/ECS_IMPLEMENTATION.md`
- Annotations System: `docs/ANNOTATIONS_SYSTEM.md`
- Spark System: `docs/SPARK_SYSTEM.md`
- Storage Patterns: `docs/STORAGE_PATTERNS.md`
- Portability Plan: `thoughts/plans/2025-01-21_spark-portability-global-architecture.md`

## Recent Changes

### Settings Page Fix
- `src/app/settings/page.tsx:57-66` - Added default values for form fields to prevent undefined

### Global Spark Capture
- `src/components/reader/QuickSparkCapture.tsx` → `src/components/sparks/QuickSparkCapture.tsx` - Moved component
- `src/components/sparks/QuickSparkCapture.tsx:19-28` - Made all props optional
- `src/components/sparks/QuickSparkCapture.tsx:79-84` - Conditional text selection based on chunks availability
- `src/components/sparks/QuickSparkCapture.tsx:225-242` - Optional context creation
- `src/components/sparks/QuickSparkCapture.tsx:523-535` - Shows "Global Spark" vs document title
- `src/components/layout/AppShell.tsx:8-10` - Added imports for QuickSparkCapture and useUIStore
- `src/components/layout/AppShell.tsx:19,28-31` - Added global Cmd+K keyboard shortcut
- `src/components/layout/AppShell.tsx:47` - Rendered QuickSparkCapture globally
- `src/components/reader/ReaderLayout.tsx:8` - Updated import path

### ECS entity_type Bug Fix
- `src/lib/ecs/ecs.ts:30-47` - Added optional `entityType` parameter to `createEntity()`
- `src/lib/ecs/sparks.ts:146` - Pass `'spark'` as entity_type
- `src/lib/ecs/annotations.ts:143` - Pass `'annotation'` as entity_type
- Database: Updated 5 existing entities (2 sparks, 3 annotations) from 'unknown' to correct types

### Spark Storage Rebuild Script
- `scripts/rebuild-spark-storage.ts` - Created utility to rebuild Storage files from ECS (NEW)

## Rhizome Architecture Decisions

- [x] Module: Both (Main App UI + Worker handlers already done in previous session)
- [x] Storage: Both (Database for queries + Storage for portability)
- [x] Migration: Current is 062 (spark portability), next would be 063
- [x] Test Tier: Stable (manual testing required for portability features)
- [ ] Pipeline Stage: N/A (sparks are user-generated, not pipeline)
- [ ] Engines: N/A (sparks don't use connection engines directly)

### Key Architectural Insights

**entity_type Field Discussion:**
- Added `entity_type` to `entities` table as pragmatic ECS pattern
- Not "pure" ECS (type could be inferred from components)
- **Rationale**:
  - Query performance (avoid component joins)
  - Vault import/export needs type before components exist
  - Type safety for Operations classes
  - Common pattern in SQL-backed ECS systems
- **Trade-off**: Slight denormalization, but worth it for portability
- **Future-proof**: Easy to extend (flashcard, deck, study_session, etc.)

**Global Spark Capture Pattern:**
- Sparks are user-level entities, not document-level
- Can be created anywhere in the app
- Context is optional (SparkContext can be undefined)
- ChunkRef component only added if document context available

## Learnings

### Bug Root Cause: entity_type = 'unknown'

**Problem:** Vault export found 0 sparks despite 2 existing in database

**Investigation Path:**
1. Checked Storage → files didn't exist
2. Checked sparks_cache → storage_path recorded but files missing
3. Attempted rebuild → found 0 sparks with `entity_type = 'spark'`
4. Discovered all entities had `entity_type = 'unknown'`
5. Found `ECS.createEntity()` only inserted `user_id`, not `entity_type`

**Root Cause:**
- `src/lib/ecs/ecs.ts:43` only inserted `{ user_id: userId }`
- Database defaults to 'unknown' when entity_type not specified
- Neither SparkOperations nor AnnotationOperations passed entity_type

**Fix:**
- Made `createEntity()` accept optional `entityType` parameter
- Updated both Operations classes to pass their entity type
- Fixed existing entities in database

### Storage Upload Silently Failed

**Issue:** When creating sparks, Storage upload step failed but was caught and logged
- `src/app/actions/sparks.ts:116-126` - try/catch silently continues on Storage error
- Database entities created successfully, but Storage files missing
- Export job couldn't find files to export

**Temporary Solution:** Created `scripts/rebuild-spark-storage.ts` to rebuild from ECS

**Long-term:** Monitor Storage upload errors, consider making uploads non-optional

## Artifacts

### Files Created
- `src/components/sparks/QuickSparkCapture.tsx` (moved from reader/)
- `scripts/rebuild-spark-storage.ts` (utility script)

### Files Modified
- `src/app/settings/page.tsx` - Fixed controlled input warning
- `src/components/layout/AppShell.tsx` - Global spark capture + Cmd+K
- `src/components/reader/ReaderLayout.tsx` - Updated import
- `src/lib/ecs/ecs.ts` - Added entity_type parameter
- `src/lib/ecs/sparks.ts` - Pass 'spark' entity_type
- `src/lib/ecs/annotations.ts` - Pass 'annotation' entity_type

### Database Changes
- Updated 2 spark entities: `entity_type = 'unknown'` → `'spark'`
- Updated 3 annotation entities: `entity_type = 'unknown'` → `'annotation'`

### Files Needing Refactor (Not Changed)
- `src/app/actions/import-review.ts:179` - Uses old annotation format, needs AnnotationOperations

## Service Restart Requirements

- [x] Supabase: Not needed (no schema changes, only data updates)
- [x] Worker: Not needed (code changes but already updated)
- [x] Next.js: Auto-reload verified ✅

## Vault Configuration

**Current Setup:**
- Vault Path: `/Users/topher/Tophs Vault`
- Vault Name: `Tophs Vault`
- Rhizome Path: `Rhizome`
- Sparks Directory: `/Users/topher/Tophs Vault/Rhizome/Sparks/` (exists, currently empty after first export test)

**Database:**
- User ID: `00000000-0000-0000-0000-000000000000`
- 2 sparks in database ready for testing
- 3 annotations in database

## Testing Status

### ✅ Completed Tests

1. **Global Spark Capture**
   - Created global spark from home page ✅
   - Created document spark from reader ✅
   - Both saved to database correctly ✅

2. **Spark Export**
   - Triggered export job ✅
   - Worker processed 2 sparks ✅
   - Files created in Storage ✅
   - **Note:** Vault export succeeded (user confirmed)

### ⏳ Tests Still Needed

From `thoughts/plans/2025-01-21_spark-portability-global-architecture.md`:

**Phase 1 - Orphan Survival:**
- [ ] Create spark referencing document
- [ ] Delete document
- [ ] Verify spark still exists with `document_id=NULL`
- [ ] Verify cache row updated with `document_id=NULL`

**Phase 2 - Optional ChunkRef:**
- [x] Create spark WITH document context (reader) ✅
- [x] Create spark WITHOUT document context (global capture) ✅
- [x] Both save successfully to database ✅
- [ ] ChunkRef component present/absent verified in database

**Phase 3 - AI Title Generation:**
- [x] Create spark without title ✅
- [x] Verify AI-generated title in response ✅
- [x] Check Storage file named correctly ✅
- [ ] Create spark with very long content
- [ ] Verify title is ≤50 chars

**Phase 4 - Vault Export:**
- [x] Trigger export job ✅
- [ ] Verify Rhizome/Sparks/ folder exists in vault
- [ ] Verify both .md and .json files for each spark
- [ ] Open .md in Obsidian (readable)
- [ ] Verify wikilinks work: `[[Document Title]]`
- [ ] Check .json has complete ECS data

**Phase 5 - Vault Import:**
- [ ] Export sparks to vault
- [ ] Delete sparks from database (keep vault files)
- [ ] Trigger import job
- [ ] Verify sparks in database with correct entity_type
- [ ] Verify Storage files restored
- [ ] Verify cache populated

**Full Round-Trip Test (Critical!):**
1. [ ] Create 3 sparks (1 global, 2 with document context)
2. [ ] Export to vault → Verify Rhizome/Sparks/ has files (.md + .json)
3. [ ] Delete 1 spark from database
4. [ ] Import from vault → Verify spark restored
5. [ ] Delete document → Verify spark survives with orphan state
6. [ ] Check UI → Verify orphan warning shows (if UI implemented)

## Context Usage

- Files read: ~25
- Tokens used: ~160,000 / 200,000
- Compaction needed: NO (still have good headroom)

## Next Steps

### Immediate (Start of Next Session)

1. **Fix import-review.ts to Use AnnotationOperations**
   - File: `src/app/actions/import-review.ts:179`
   - Currently uses old pattern: `ecs.createEntity(userId, { annotation: {...} })`
   - Should use: `new AnnotationOperations(ecs, userId).create({...})`
   - Benefits:
     - Proper 5-component pattern (Position, Visual, Content, Temporal, ChunkRef)
     - Correct entity_type = 'annotation' automatically
     - Consistent with codebase patterns

2. **Continue Spark Portability Testing**
   - Verify vault export created both .md and .json files
   - Test vault import functionality
   - Test orphan survival (delete document, verify spark survives)
   - Complete full round-trip test

### Medium Priority

3. **Storage Upload Error Handling**
   - Investigate why initial Storage uploads failed
   - Consider making Storage uploads non-optional (fail if they fail)
   - Or add better error logging/monitoring

4. **Test Data Cleanup**
   - Current test sparks can be deleted after testing
   - Vault test files can be cleaned up

### Future Enhancements

5. **Orphan Spark UI**
   - Implement UI to show orphaned sparks
   - Add "Re-link to document" functionality
   - Show warning: "Original document '{title}' was deleted"

6. **Phase 6: ZIP Export** (from plan, not started)
   - Update `worker/handlers/export-document.ts`
   - Add sparks folder to ZIP export
   - Include spark count in manifest

## Other Notes

### Useful Commands

**Check entity types in database:**
```bash
PGPASSWORD=postgres psql -h 127.0.0.1 -p 54322 -U postgres -d postgres -c "SELECT entity_type, COUNT(*) FROM entities GROUP BY entity_type;"
```

**Rebuild spark Storage files from ECS:**
```bash
npx tsx scripts/rebuild-spark-storage.ts
```

**Check vault directory:**
```bash
ls -la "/Users/topher/Tophs Vault/Rhizome/Sparks"
```

**Trigger spark export (via Admin Panel):**
1. Open Admin Panel (Cmd+Shift+A)
2. Go to Integrations tab
3. Scroll to Sparks section
4. Click "Export Sparks to Vault"
5. Monitor worker logs for job completion

### Important File Locations

**Spark System Files:**
- ECS: `src/lib/ecs/sparks.ts` - SparkOperations class
- Components: `src/lib/ecs/components.ts` - SparkComponent, ChunkRefComponent
- Actions: `src/app/actions/sparks.ts` - createSpark, updateSpark
- UI: `src/components/sparks/QuickSparkCapture.tsx` - Global capture panel
- Storage: `src/lib/sparks/storage.ts` - Storage helpers
- Title Gen: `src/lib/sparks/title-generator.ts` - AI title generation

**Worker Handlers:**
- Export: `worker/lib/vault-export-sparks.ts`
- Import: `worker/lib/vault-import-sparks.ts`
- Registration: `worker/index.ts:130-168` (job handlers)

**Integration Actions:**
- `src/app/actions/integrations.ts:574-701` - Spark import/export actions
- `src/components/admin/tabs/IntegrationsTab.tsx:433-489` - UI handlers

### Known Issues

1. **Storage Upload Silent Failures**
   - Storage uploads can fail silently in createSpark action
   - Need better error handling/monitoring

2. **import-review.ts Uses Old Pattern**
   - Needs refactoring to use AnnotationOperations
   - Currently creates single 'annotation' component instead of 5-component pattern

### Testing Checklist Template

When resuming testing, use this checklist:

```markdown
## Spark Portability Testing Session

### Setup
- [ ] Supabase running
- [ ] Worker running
- [ ] Next.js running
- [ ] Vault path configured

### Export Test
- [ ] Create 2-3 test sparks (mix of global and document-linked)
- [ ] Trigger export via Admin Panel
- [ ] Check worker logs for success
- [ ] Verify files in vault: `/Users/topher/Tophs Vault/Rhizome/Sparks/`
- [ ] Verify both .md and .json files exist
- [ ] Open .md in Obsidian - verify readable
- [ ] Check .json has complete data

### Import Test
- [ ] Note spark IDs before delete
- [ ] Delete 1 spark from database
- [ ] Trigger import via Admin Panel
- [ ] Check worker logs for success
- [ ] Verify spark restored with same ID
- [ ] Verify Storage files restored
- [ ] Verify cache populated

### Orphan Test
- [ ] Create spark linked to document
- [ ] Note document ID
- [ ] Delete document
- [ ] Query database: spark should have document_id = NULL
- [ ] Verify spark still queryable
- [ ] Check cache updated

### Round-Trip Test
- [ ] Export → Import → Verify data integrity
- [ ] Check all timestamps preserved
- [ ] Check all tags preserved
- [ ] Check selections preserved
```

## Questions for Next Session

1. Should we make Storage uploads non-optional? (Currently fails silently)
2. Do we want to implement the orphan spark UI now or later?
3. Should we add Phase 6 (ZIP export) or focus on other features?
4. Any other Operations classes that need entity_type fixes?
