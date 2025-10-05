# Annotation Recovery Testing Guide

**Stop building. Start testing.** Find bugs through execution, not code review.

## Test Execution Order

### 1. Test Fuzzy Matching (5 min)

Tests all 4 tiers in isolation with synthetic data.

```bash
cd worker
npx tsx test-fuzzy-matching.ts
```

**Expected output:**
- ✅ All 5 test cases pass
- Each tier (exact, context, chunk_bounded, trigram) works correctly
- Null returned for unfindable text

**If it fails:**
- Check `findAnnotationMatch()` implementation
- Verify Levenshtein import from `fastest-levenshtein`
- Check trigram Jaccard similarity calculation

---

### 2. Test Annotation Recovery (10 min)

Tests recovery against a **real document** with real annotations.

**Setup:**
1. Upload a test document (5-10 pages)
2. Create 5-10 annotations
3. Note the document ID

**Run test:**
```bash
npx tsx test-annotation-recovery.ts <document_id>
```

**Expected output:**
- ✅ Fetches markdown and chunks
- ✅ Finds existing annotations
- ✅ Recovery rate >90%
- ⚠️ Shows items needing review (if any)

**If it fails:**
- Check error message - likely query pattern issue
- Verify `component_type` casing (position vs Position)
- Check JSONB field names (document_id vs documentId)
- Look for missing context data

---

### 3. Test Full Reprocessing Pipeline (20 min)

Tests the complete flow: edit markdown → reprocess → recover annotations.

**Setup:**
1. Use document from Test 2 (with annotations)
2. Download markdown from Supabase Storage
3. Edit markdown (add paragraph, reword sentences)
4. Re-upload to same path

**Run test:**
```bash
npx tsx test-reprocess-pipeline.ts <document_id>
```

**Expected output:**
- ✅ Reprocessing completes in <30s
- ✅ Annotations recovered (>90% rate)
- ✅ Connections remapped
- ✅ Old chunks deleted
- ✅ Status: completed

**If it fails:**
- Check transaction rollback (old chunks restored?)
- Verify `reprocessing_batch` column exists
- Check collision detection (wrapped in try-catch?)
- Look for schema mismatches in chunk insertion

---

## Common Failures & Fixes

### ❌ "Column 'reprocessing_batch' does not exist"
**Fix:** Run migration 035
```bash
npx supabase migration up
```

### ❌ "No annotations found" (but they exist)
**Fix:** Schema mismatch - check casing
```sql
-- Check actual data
SELECT DISTINCT component_type FROM components;

-- If returns 'Position' but code uses 'position', update code
-- Or vice versa - pick one standard
```

### ❌ "Query returned 0 results" for JSONB
**Fix:** Field name mismatch
```sql
-- Check actual field
SELECT data FROM components WHERE component_type = 'source' LIMIT 1;

-- If shows {"document_id": "..."}, use data->>document_id
-- If shows {"documentId": "..."}, use data->>documentId
```

### ❌ Recovery rate <70%
**Fix:** Check context capture
```sql
-- Verify annotations have context
SELECT
  data->'textContext' IS NOT NULL as has_context,
  COUNT(*)
FROM components
WHERE component_type = 'position'
GROUP BY has_context;

-- If many have NULL, context isn't being captured during creation
```

### ❌ Chunks not cleaned up
**Fix:** Batch ID not set correctly
```sql
-- Check for zombie chunks
SELECT id, is_current, reprocessing_batch
FROM chunks
WHERE document_id = '<id>'
  AND is_current = false;

-- Should be 0 rows after successful reprocessing
```

---

## Schema Standardization Checklist

Before running tests, verify consistency:

- [ ] **component_type**: Is it `'position'` (lowercase) everywhere?
- [ ] **JSONB fields**: Is it `document_id` or `documentId`? Pick one.
- [ ] **Environment vars**: Worker uses `SUPABASE_URL`, not `NEXT_PUBLIC_SUPABASE_URL`
- [ ] **Migration 035**: `reprocessing_batch` column exists in `chunks` table
- [ ] **Migration 033**: Recovery fields exist in `components` table

**Run this query to check:**
```sql
-- Check components table
SELECT column_name
FROM information_schema.columns
WHERE table_name = 'components'
  AND column_name IN ('recovery_method', 'recovery_confidence', 'needs_review', 'original_chunk_index');

-- Check chunks table
SELECT column_name
FROM information_schema.columns
WHERE table_name = 'chunks'
  AND column_name = 'reprocessing_batch';
```

Should return all 5 columns.

---

## Next Steps After Testing

1. **Fix patterns, not bugs**
   - If you find query issues, standardize ALL queries
   - Don't just fix the one that broke

2. **Document actual behavior**
   - Update manual test plan with real performance numbers
   - Record actual recovery rates

3. **Integration test**
   - Test UI → API → Handler flow
   - Click buttons in AnnotationReviewTab
   - Verify database updates

4. **Then and only then**: Build new features

---

## Performance Targets

From manual test plan:

- ⏱️ **Recovery time**: <2s for 20 annotations
- 📈 **Recovery rate**: >90% (success + needsReview)
- 💰 **Cost**: ~$0.20 per 500-page reprocess
- 🧹 **Cleanup**: 0 old chunks remaining

Use these scripts to validate we hit targets.
