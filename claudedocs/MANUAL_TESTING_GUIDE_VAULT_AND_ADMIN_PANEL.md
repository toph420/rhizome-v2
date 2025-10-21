# Manual Testing Guide: Vault Import/Export + Admin Panel

**Date**: 2025-10-20
**Purpose**: Comprehensive testing of Obsidian vault mirroring with UUID preservation AND Admin Panel functionality
**Status**: Ready for testing

---

## Prerequisites

- ✅ Database reset: `npx supabase db reset`
- ✅ Worker running: `cd worker && npm run dev`
- ✅ Next.js running: `npm run dev`
- ✅ Vault configured in settings: `/settings`

---

## 🔄 STATUS UPDATE (2025-10-21 Evening)

**✅ FIXED (Tested)**:
1. ✅ **Connections export** - Fixed `.onConflict()` bug, now uses `.upsert()` (148 connections exported successfully)
2. ✅ **Cross-document connections** - Import checks entire database, not just current document chunks
3. ✅ **Embeddings auto-regenerate** - Vault import automatically regenerates embeddings
4. ✅ **Smart connection detection** - Only triggers if connections.json missing (skips if already imported)
5. ✅ **Jobs panel visibility** - Shows ALL jobs from database, including worker-created jobs

**🔄 FIXED (Needs Testing)**:
1. 🔄 **Annotation import** - Added entity creation with `entity_type` column (Migration 061)
2. 🔄 **Spark import** - Same entity creation fix as annotations
3. 🔄 **Entity table schema** - Added `entity_type TEXT` column for ECS system

**How it should work now**:
- Delete document → Import from vault → Chunks ✅ + Connections ✅ + Embeddings ✅ + **Annotations 🔄** + **Sparks 🔄**
- Connection detection skipped if connections already imported (saves $$)
- All jobs visible in Admin Panel Jobs tab

**Next Test Required**:
- Delete Test 3 → Import from vault → Verify annotations (5) and sparks (1) import successfully

---

## Test Suite 1: UUID Preservation (Core Fix)

### Test 1.1: Fresh Document Processing with UUIDs

**Goal**: Verify new documents get UUIDs in chunks.json

1. **Upload a test document** (PDF, EPUB, or paste text)
2. **Wait for processing to complete**
3. **Check chunks.json in Storage**:
   ```bash
   # Get document ID from UI
   DOC_ID="<your-document-id>"
   USER_ID="<your-user-id>"

   # Download chunks.json from Storage
   cat "/Users/topher/Tophs Vault/Rhizome/Documents/<title>/.rhizome/chunks.json" | python3 -c "import sys, json; data = json.load(sys.stdin); print('Has IDs:', all('id' in chunk for chunk in data['chunks'])); print('First chunk ID:', data['chunks'][0].get('id'))"
   ```

**Expected**:
- ✅ chunks.json has `id` field for each chunk
- ✅ IDs are valid UUIDs (36 characters with dashes)
- ✅ metadata.json has `document_id` field

---

### Test 1.2: Vault Export with UUIDs

**Goal**: Verify vault export includes UUIDs

1. **Open Admin Panel** (Cmd+Shift+A)
2. **Go to Integrations tab**
3. **Click "Export to Vault"** for your test document
4. **Check vault files**:
   ```bash
   # Check chunks.json in vault
   cat "/Users/topher/Tophs Vault/Rhizome/Documents/<title>/.rhizome/chunks.json" | python3 -c "import sys, json; data = json.load(sys.stdin); print('Chunks have IDs:', all('id' in c for c in data['chunks'])); print('Sample:', data['chunks'][0].get('id', 'NO ID'))"

   # Check metadata.json
   cat "/Users/topher/Tophs Vault/Rhizome/Documents/<title>/.rhizome/metadata.json" | python3 -c "import sys, json; data = json.load(sys.stdin); print('Document ID:', data.get('document_id', 'NOT FOUND'))"
   ```

**Expected**:
- ✅ Vault chunks.json has `id` fields
- ✅ Vault metadata.json has `document_id`
- ✅ IDs match database IDs

---

### Test 1.3: Vault Import with UUID Preservation

**Goal**: Verify import preserves UUIDs from vault

1. **Note the original document ID and chunk IDs**:
   ```sql
   SELECT id FROM documents WHERE title = '<your-doc-title>';
   SELECT id, chunk_index FROM chunks WHERE document_id = '<doc-id>' LIMIT 3;
   ```

2. **Delete document from database**:
   ```sql
   DELETE FROM documents WHERE id = '<doc-id>';
   ```

3. **Import from vault** (Admin Panel → Integrations → Scan Vault → Import)

4. **Check if UUIDs were preserved**:
   ```sql
   -- Should find the SAME document ID!
   SELECT id FROM documents WHERE title = '<your-doc-title>';

   -- Should find the SAME chunk IDs!
   SELECT id, chunk_index FROM chunks WHERE document_id = '<doc-id>' LIMIT 3;
   ```

**Expected**:
- ✅ Document ID matches original
- ✅ Chunk IDs match originals
- ✅ Console shows: "Preserving vault UUID: <uuid>"

---

### Test 1.4: Annotations Survive Round-Trip

**Goal**: THE KEY TEST - annotations work after vault round-trip

1. **Create annotations** on your test document (highlight some text, add notes)
2. **Export to vault**
3. **Note annotation positions**:
   ```sql
   SELECT entity_id, data->>'originalText' as text
   FROM components
   WHERE component_type = 'Position'
   AND data->>'documentId' = '<doc-id>';
   ```

4. **Delete document** from database
5. **Import from vault**
6. **Check annotations**:
   ```sql
   -- Should find SAME entity IDs with SAME positions!
   SELECT entity_id, data->>'originalText' as text
   FROM components
   WHERE component_type = 'Position'
   AND data->>'documentId' = '<doc-id>';
   ```

7. **Open document in reader** and verify annotations display correctly

**Expected**:
- ✅ Annotations display in reader
- ✅ Highlights are in correct positions
- ✅ Notes are preserved
- ✅ Console shows: "Chunk IDs match - direct restore"
- ✅ Console shows: "Direct restore: <N> annotations"

---

## Test Suite 2: Annotation Recovery (Fallback Path)

### Test 2.1: Recovery When Chunk IDs Don't Match

**Goal**: Test fuzzy matching when UUIDs are missing (backward compatibility)

1. **Export document to vault**
2. **Manually edit chunks.json** to remove all `id` fields:
   ```bash
   # Backup first
   cp "/Users/topher/Tophs Vault/Rhizome/Documents/<title>/.rhizome/chunks.json" chunks-backup.json

   # Remove IDs with Python
   python3 -c "
   import json
   with open('/Users/topher/Tophs Vault/Rhizome/Documents/<title>/.rhizome/chunks.json', 'r') as f:
       data = json.load(f)
   for chunk in data['chunks']:
       chunk.pop('id', None)
   with open('/Users/topher/Tophs Vault/Rhizome/Documents/<title>/.rhizome/chunks.json', 'w') as f:
       json.dump(data, f, indent=2)
   "
   ```

3. **Delete document from database**
4. **Import from vault**
5. **Check console output**:

**Expected**:
- ✅ Console shows: "Generating new UUIDs (backward compatible)"
- ✅ Console shows: "Chunk IDs changed - recovering from JSON via fuzzy matching"
- ✅ Console shows recovery stats: "Auto-recovered: X, Needs review: Y, Lost: Z"
- ✅ Annotations display in reader (may need review)

---

## Test Suite 3: Admin Panel Functionality

### Test 3.1: Scanner Tab

**Goal**: Verify Storage scanning works correctly

1. **Open Admin Panel** (Cmd+Shift+A)
2. **Go to Scanner tab**
3. **Scanner automatically runs** on load
4. **Check results**:
   - Shows all documents in Storage
   - Shows sync states (Healthy, Out of Sync, Missing from DB)
   - Summary statistics are accurate

**Expected**:
- ✅ All documents listed
- ✅ Sync states correct
- ✅ Can expand rows for details
- ✅ Action buttons work (Import, Export, Details)

---

### Test 3.2: Import Tab

**Goal**: Verify Storage import works with all strategies

**Test 3.2a: Skip Strategy**
1. Go to Import tab
2. Select a document
3. Choose strategy: **Skip**
4. Click "Import Selected"
5. Verify: No changes to database

**Test 3.2b: Replace Strategy**
1. Select same document
2. Choose strategy: **Replace**
3. Enable "Regenerate Embeddings"
4. Click "Import Selected"
5. Verify: Chunks replaced, annotations break (expected!)

**Test 3.2c: Merge Smart Strategy**
1. Create new annotations
2. Export to Storage
3. Import with strategy: **Merge Smart**
4. Verify: Annotations preserved, metadata updated

**Expected**:
- ✅ All 3 strategies work as documented
- ✅ Merge Smart preserves annotations
- ✅ Replace warns about breaking annotations
- ✅ Progress updates in real-time

---

### Test 3.3: Export Tab

**Goal**: Verify ZIP bundle generation

1. **Go to Export tab**
2. **Select 2-3 documents**
3. **Check options**:
   - ☑ Include Connections
   - ☑ Include Annotations
4. **Click "Export Selected"**
5. **Wait for completion**
6. **Download ZIP**
7. **Extract and verify**:
   ```bash
   unzip export-*.zip
   ls -la <doc-id>/
   ```

**Expected**:
- ✅ ZIP contains all documents
- ✅ Each has: source, content.md, chunks.json, metadata.json, manifest.json
- ✅ connections.json included (if selected)
- ✅ annotations.json included (if selected)
- ✅ manifest.json at root lists all documents

---

### Test 3.4: Connections Tab

**Goal**: Verify connection reprocessing works

1. **Go to Connections tab**
2. **Select a document**
3. **View current stats**: "X connections (Y user-validated)"
4. **Select mode: Smart Mode**
5. **Check options**:
   - ☑ Preserve user-validated connections
   - ☑ Save backup before reprocessing
6. **Select all 3 engines**
7. **Review estimate** (time and cost)
8. **Click "Start Reprocessing"**
9. **Monitor progress**

**Expected**:
- ✅ Progress updates in real-time
- ✅ Backup created in Storage
- ✅ User-validated connections preserved
- ✅ New connections generated
- ✅ Stats update after completion

---

### Test 3.5: Integrations Tab

**Goal**: Verify Obsidian operations work

**Test 3.5a: Vault Scan**
1. Go to Integrations tab
2. Click "Scan Vault"
3. Verify: Lists all documents in vault
4. Check: Complete documents show ✅, incomplete show ⚠️

**Test 3.5b: Vault Import**
1. Select a document from scan results
2. Click "Import" button
3. Monitor progress
4. Verify: Document appears in database

**Test 3.5c: Vault Export**
1. Select a document
2. Click "Export to Vault"
3. Check: Files created in vault
4. Verify: All .rhizome/ files present

**Expected**:
- ✅ All operations work
- ✅ Progress tracked in Jobs tab
- ✅ Errors handled gracefully

---

### Test 3.6: Jobs Tab

**Goal**: Verify background job management

1. **Go to Jobs tab**
2. **Trigger various jobs** (import, export, connections)
3. **Verify**:
   - Jobs show in list
   - Status updates in real-time
   - Progress bars work
   - Details expand correctly

4. **Test controls**:
   - Clear Completed Jobs
   - Clear Failed Jobs
   - Pause/Resume a job
   - Cancel a job

**Expected**:
- ✅ All jobs tracked
- ✅ Real-time updates
- ✅ Controls work
- ✅ Job details accurate

---

## Test Suite 4: Edge Cases

### Test 4.1: Empty Document

1. Upload document with no content
2. Verify: Graceful handling

### Test 4.2: Document with No Annotations

1. Upload document
2. Don't create annotations
3. Vault round-trip
4. Verify: Works without errors

### Test 4.3: Large Document (500+ chunks)

1. Upload large PDF
2. Vault export
3. Vault import
4. Verify: All chunks preserved

### Test 4.4: Multiple Concurrent Operations

1. Trigger 3 imports simultaneously
2. Trigger 2 exports
3. Verify: All complete successfully

---

## Test Suite 5: Connection Export/Import (✅ FIXED)

### Test 5.1: Verify Connections Export to Vault

**Goal**: Confirm connections are actually exported to connections.json

1. **Upload document and wait for connection detection to complete**
2. **Check database for connections**:
   ```sql
   SELECT COUNT(*) FROM connections
   WHERE source_chunk_id IN (SELECT id FROM chunks WHERE document_id = '<doc-id>');
   ```
3. **Export to vault**
4. **Check vault connections.json**:
   ```bash
   cat "/path/to/vault/Documents/<title>/.rhizome/connections.json"
   ```
5. **Verify connections array is NOT empty**

**Expected**:
- ✅ Database has N connections
- ✅ connections.json has N connections (matching database)
- ✅ Export creates valid connections.json with full metadata
- ✅ **VERIFIED**: Test 3 exported 148 connections successfully (2025-10-21)

### Test 5.2: Verify Annotation/Spark Import (🔄 NEEDS TESTING)

**Goal**: Confirm annotations and sparks import successfully after entity_type migration

**Context**: Fixed foreign key constraint violation by:
- Added `entity_type` column to entities table (Migration 061)
- Entity creation now includes `user_id` and `entity_type` before inserting components
- Functions updated to accept `userId` parameter

**Test Steps**:
1. **Verify Test 3 has annotations in vault**:
   ```bash
   cat "/Users/topher/Tophs Vault/Rhizome/Documents/Test 3/.rhizome/annotations.json" | python3 -c "import sys, json; print(f'Annotations: {len(json.load(sys.stdin)[\"entities\"])}')"
   ```
   Should show: 5 annotations

2. **Delete Test 3** from database (UI or SQL)

3. **Import from vault** (Admin Panel → Integrations → Scan Vault → Import)

4. **Check import results** in worker logs:
   ```
   [ImportAnnotations] ✓ Direct restore: 5 annotations
   [ImportSparks] ✓ Direct restore: 1 spark
   ```

5. **Verify in database**:
   ```sql
   SELECT COUNT(*) FROM components WHERE data->>'documentId' = '<test-3-id>';
   -- Should return 25+ (5 annotations × 5 components each)

   SELECT entity_type, COUNT(*) FROM entities GROUP BY entity_type;
   -- Should show annotations and sparks
   ```

6. **Open Test 3 in reader** - Verify annotations display correctly

**Expected**:
- 🔄 5 annotations imported successfully
- 🔄 1 spark imported successfully
- 🔄 Annotations visible in reader at correct positions
- 🔄 Entities table has proper entity_type values

**If this fails**: Check worker logs for "Failed to create entity" errors

### Test 5.3: Verify Automatic Embeddings Regeneration

**Goal**: Confirm embeddings regenerate automatically during vault import

1. **Import document from vault** (default settings, `regenerateEmbeddings: true`)
2. **Check worker logs** - should show:
   ```
   [ImportFromVault] Regenerating embeddings for N chunks...
   [ImportFromVault] Generated N embeddings
   ✅ [ImportFromVault] Embeddings regenerated for all N chunks
   ✅ [ImportFromVault] Connection detection job created: <job-id>
   ```
3. **Verify embeddings in database**:
   ```sql
   SELECT COUNT(*) FROM chunks WHERE document_id = '<doc-id>' AND embedding IS NOT NULL;
   ```
4. **Check connection detection job** - should auto-trigger and complete
5. **Verify connections created** in sidebar

**Expected**:
- ✅ Embeddings regenerated automatically during import (no manual script needed!)
- ✅ Connection detection job created and queued automatically
- ✅ Connections appear in sidebar after job completes
- ✅ Zero manual intervention required

**Note**: Manual regeneration script (`regenerate-embeddings.ts`) still available for edge cases or if `regenerateEmbeddings: false` was used.

---

## Test Suite 6: Recovery System

### Test 6.1: Recovery Store (UI)

1. **Create annotations with low confidence recovery** (edit metadata.json offsets)
2. **Open Admin Panel → Annotations tab → Review**
3. **Verify**:
   - Items needing review appear
   - Confidence scores shown
   - Can accept/reject
   - Can manually relink

### Test 5.2: Recovery Methods

1. **Exact match** (no changes)
2. **Context match** (minor edits)
3. **Chunk-bounded match** (chunk moved)
4. **Trigram fallback** (heavy edits)
5. **Lost** (text removed)

**Expected**:
- ✅ All methods work
- ✅ Confidence thresholds correct (≥0.85 auto, 0.75-0.85 review, <0.75 lost)
- ✅ UI shows correct recovery method

---

## Success Criteria

### ✅ Core Functionality
- [ ] Fresh documents get UUIDs in chunks.json and metadata.json
- [ ] Vault export includes UUIDs
- [ ] Vault import preserves UUIDs when present
- [ ] Vault import generates UUIDs when missing (backward compatible)
- [ ] Annotations survive round-trip with UUID preservation
- [ ] Annotations recover via fuzzy matching when UUIDs missing

### ✅ Admin Panel
- [ ] Scanner tab lists all documents correctly
- [ ] Import tab works with all 3 strategies
- [ ] Export tab generates valid ZIP bundles
- [ ] Connections tab reprocesses with Smart Mode
- [ ] Integrations tab handles vault operations
- [ ] Jobs tab tracks all background jobs

### ✅ Recovery System
- [ ] Direct restore when chunk IDs match
- [ ] Fuzzy matching when chunk IDs don't match
- [ ] Recovery from JSON (not database)
- [ ] Recovery Store UI works
- [ ] All recovery methods functional

---

## Troubleshooting

### Issue: Chunks don't have IDs

**Check**: Did you process the document AFTER the code changes?
**Fix**: Delete and re-upload the document

### Issue: Import doesn't preserve UUIDs

**Check**: Does vault chunks.json have `id` fields?
**Fix**: Re-export to vault after code changes

### Issue: Annotations missing after import

**Check**: Console logs - did recovery run?
**Fix**: Check annotations.json in vault, verify entity IDs exist

### Issue: Admin Panel tabs don't work

**Check**: Is Supabase running? `npx supabase status`
**Fix**: Restart Supabase: `npx supabase restart`

---

## Testing Checklist

**Phase 1: UUID Preservation**
- [ ] Test 1.1: Fresh processing
- [ ] Test 1.2: Vault export
- [ ] Test 1.3: Vault import
- [ ] Test 1.4: Annotations round-trip ⭐ KEY TEST

**Phase 2: Recovery**
- [ ] Test 2.1: Recovery without UUIDs

**Phase 3: Admin Panel**
- [ ] Test 3.1: Scanner tab
- [ ] Test 3.2: Import tab (all 3 strategies)
- [ ] Test 3.3: Export tab
- [ ] Test 3.4: Connections tab
- [ ] Test 3.5: Integrations tab
- [ ] Test 3.6: Jobs tab

**Phase 4: Edge Cases**
- [ ] Test 4.1: Empty document
- [ ] Test 4.2: No annotations
- [ ] Test 4.3: Large document
- [ ] Test 4.4: Concurrent operations

**Phase 5: Recovery System**
- [ ] Test 5.1: Recovery Store UI
- [ ] Test 5.2: All recovery methods

---

## Notes

- **UUID Preservation is the key fix** - annotations now survive vault round-trips
- **Backward compatible** - works with old exports without UUIDs
- **Admin Panel unchanged** - still works perfectly with Storage-First architecture
- **No breaking changes** - all existing functionality preserved
