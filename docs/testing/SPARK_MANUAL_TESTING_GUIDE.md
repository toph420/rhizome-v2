# Spark System Manual Testing Guide

**Purpose**: Verify the Spark ECS refactor implementation works correctly end-to-end.

**Prerequisites**:
- Supabase running (`npx supabase start`)
- Worker running (`npm run dev:worker`)
- Next.js running (`npm run dev:next`)
- Test document loaded in reader

---

## Test 1: ECS Pattern Verification

**Goal**: Verify sparks use 4-component ECS pattern correctly.

### Steps

1. **Open a document in the reader**
   - Navigate to `/read/{documentId}`
   - Document should load successfully

2. **Create a simple spark (Cmd+K)**
   - Press `Cmd+K` to open Quick Capture
   - Type a thought: "Testing ECS pattern"
   - Submit (no selections)
   - Note the success message

3. **Verify in database**
   ```sql
   -- Get the latest spark entity
   SELECT * FROM entities
   WHERE user_id = '{your-user-id}'
   ORDER BY created_at DESC
   LIMIT 1;
   -- Note the entity_id

   -- Check components for this entity
   SELECT entity_id, component_type, data
   FROM components
   WHERE entity_id = '{entity-id-from-above}';
   ```

### Expected Results

✅ **4 components exist** with these exact names (PascalCase):
   - `Spark`
   - `Content`
   - `Temporal`
   - `ChunkRef`

✅ **Component data uses camelCase**:
   ```json
   // Spark component
   {
     "selections": [],
     "connections": [],
     "annotationRefs": []
   }

   // Content component
   {
     "note": "Testing ECS pattern",
     "tags": []
   }

   // Temporal component
   {
     "createdAt": "2025-10-18T...",
     "updatedAt": "2025-10-18T..."
   }

   // ChunkRef component
   {
     "chunkId": "chunk-123",        // camelCase
     "chunk_id": "chunk-123",        // snake_case (compatibility)
     "documentId": "doc-456",        // camelCase
     "document_id": "doc-456",       // snake_case (compatibility)
     "chunkIds": ["chunk-123", "chunk-124"]
   }
   ```

✅ **No snake_case in JSONB data** (except compatibility fields in ChunkRef)

### Troubleshooting

❌ **If components have wrong names** (e.g., `spark` instead of `Spark`):
   - Check `src/lib/ecs/sparks.ts` component creation
   - Verify component type constants use PascalCase

❌ **If data has snake_case fields**:
   - Check component schemas in `src/lib/ecs/components.ts`
   - Verify server actions use camelCase when creating components

---

## Test 2: Multiple Selections

**Goal**: Verify users can add multiple text selections to a single spark.

### Steps

1. **Open Quick Capture** (`Cmd+K`)

2. **Add first selection**
   - Select some text in the document
   - Click "Quote This" button that appears
   - Selection should appear in the selections array

3. **Add second selection**
   - Select different text (different paragraph)
   - Click "Quote This" again
   - Both selections should now be visible

4. **Add third selection**
   - Select more text
   - Click "Quote This"
   - All 3 selections visible

5. **Remove middle selection**
   - Click remove button on second selection
   - Only 1st and 3rd selections remain

6. **Type thought**
   - Add text to the thought textarea: "These quotes prove my point"
   - Verify thought text is separate from selections

7. **Submit**
   - Click Save/Submit
   - Note success message

8. **Verify in database**
   ```sql
   -- Get the Spark component for latest entity
   SELECT data->'selections' as selections
   FROM components
   WHERE component_type = 'Spark'
   ORDER BY created_at DESC
   LIMIT 1;
   ```

### Expected Results

✅ **Selections array has 2 items** (1st and 3rd, not 2nd)

✅ **Each selection has structure**:
   ```json
   {
     "text": "Selected text content",
     "chunkId": "chunk-xxx",
     "startOffset": 100,
     "endOffset": 150,
     "textContext": {
       "before": "context before...",
       "after": "...context after"
     }
   }
   ```

✅ **Content component has thought**:
   ```json
   {
     "note": "These quotes prove my point",
     "tags": []
   }
   ```

✅ **Thought is NOT mixed with selections** (separate fields)

### Troubleshooting

❌ **"Quote This" button doesn't appear**:
   - Check `QuickSparkCapture.tsx` selection handling
   - Verify text selection event listeners

❌ **Selections don't persist**:
   - Check Zustand store `addSelection` action
   - Verify selections are passed to server action

❌ **Wrong number of selections**:
   - Check remove logic in UI
   - Verify array manipulation doesn't mutate state incorrectly

---

## Test 3: Recovery Workflow

**Goal**: Verify sparks are recovered after document reprocessing.

### Setup

1. **Create spark with selection**
   - Open a document
   - Select text: "privacy is dead"
   - Press `Cmd+K`
   - Add selection via "Quote This"
   - Add thought: "Important claim about surveillance"
   - Submit
   - Note the entity_id and chunk_id

2. **Create thought-only spark**
   - Press `Cmd+K` again
   - Type thought: "This reminds me of 1984" (no selections)
   - Submit

3. **Verify sparks exist**
   ```sql
   SELECT entity_id, component_type, data
   FROM components
   WHERE component_type = 'Spark'
   ORDER BY created_at DESC
   LIMIT 2;
   ```

### Selection-Based Recovery Test

1. **Edit the document slightly**
   - Make minor edit to markdown (add a sentence somewhere)
   - Don't change the text "privacy is dead"

2. **Trigger reprocessing**
   - Admin Panel → Connections tab
   - Select "Smart Mode" (preserves user-validated)
   - Click "Reprocess Connections"
   - Wait for job to complete

3. **Check recovery results**
   ```sql
   -- Check if selection was recovered
   SELECT
     c.entity_id,
     c.data->'selections' as selections,
     c.recovery_confidence,
     c.recovery_method,
     c.needs_review
   FROM components c
   WHERE c.component_type = 'Spark'
     AND jsonb_array_length(c.data->'selections') > 0
   ORDER BY c.created_at DESC
   LIMIT 1;
   ```

### Expected Results (Selection-Based)

✅ **Selection recovered** (still has text "privacy is dead")

✅ **Recovery confidence set**:
   - High confidence (0.85-1.0): Exact or context match
   - Medium confidence (0.70-0.85): Chunk-bounded or trigram match
   - Low confidence (<0.70): Marked as orphaned

✅ **Recovery method populated**:
   - One of: `exact`, `context`, `chunk_bounded`, `trigram`, `semantic`, `lost`

✅ **Needs review flag**:
   - `needs_review = true` if confidence 0.70-0.85
   - `needs_review = false` if confidence > 0.85
   - `orphaned = true` if confidence < 0.70

### Semantic Recovery Test (Thought-Only)

1. **Check thought-only spark recovery**
   ```sql
   -- Check semantic recovery for thought-only spark
   SELECT
     c.entity_id,
     content.data->>'note' as thought,
     c.recovery_confidence,
     c.recovery_method,
     c.needs_review
   FROM components c
   JOIN components content ON content.entity_id = c.entity_id
     AND content.component_type = 'Content'
   WHERE c.component_type = 'Spark'
     AND jsonb_array_length(c.data->'selections') = 0
   ORDER BY c.created_at DESC
   LIMIT 1;
   ```

### Expected Results (Semantic)

✅ **Spark recovered using semantic similarity**

✅ **Recovery method = 'semantic'**

✅ **ChunkRef updated** to new chunk_id (if chunk changed)

✅ **Confidence based on embedding similarity**:
   - High: Very similar content (>0.85)
   - Medium: Somewhat similar (0.70-0.85)
   - Low: Weak match (<0.70)

### Troubleshooting

❌ **Recovery doesn't run**:
   - Check worker logs for errors
   - Verify `recoverSparks` handler is registered
   - Check background_jobs table for status

❌ **All sparks marked as orphaned**:
   - Check fuzzy matching logic in `worker/lib/fuzzy-matching.ts`
   - Verify new chunks have proper metadata
   - Check if chunk IDs changed completely

❌ **Confidence scores all 0**:
   - Verify recovery methods are being called
   - Check embedding generation for semantic recovery
   - Verify text context is being compared

---

## Test 4: Cache Table Consistency

**Goal**: Verify `sparks_cache` stays in sync with ECS components.

### Steps

1. **Create a spark** (use Test 2 steps)

2. **Check cache table**
   ```sql
   SELECT
     entity_id,
     content,
     tags,
     origin_chunk_id,
     document_id,
     connections,
     selections,
     cached_at
   FROM sparks_cache
   ORDER BY created_at DESC
   LIMIT 1;
   ```

3. **Update the spark**
   - Open the spark in UI (if update UI exists)
   - OR update directly via server action
   - Change thought to "Updated thought"
   - Add tag "updated"

4. **Verify cache updated**
   ```sql
   SELECT content, tags
   FROM sparks_cache
   WHERE entity_id = '{your-entity-id}';
   ```

### Expected Results

✅ **Cache has same data as ECS components**

✅ **Selections stored in cache** (as JSONB array)

✅ **Connections stored in cache** (as JSONB array)

✅ **Updates reflected in cache** within 1 second

### Troubleshooting

❌ **Cache out of sync**:
   - Check server action updates both ECS and cache
   - Verify cache update logic in `src/app/actions/sparks.ts`

❌ **Selections missing from cache**:
   - Check migration 057 applied correctly
   - Verify `selections` column exists with GIN index

---

## Test 5: Recovery UI

**Goal**: Verify recovery store and UI work correctly.

### Prerequisites

This test requires implementing the Recovery UI first. If not implemented, skip to Test 6.

### Steps

1. **Create sparks and trigger recovery** (use Test 3)

2. **Open Recovery UI**
   - Location: RightPanel → Recovery tab (if implemented)
   - OR Admin Panel → Recovery section

3. **Filter by type**
   - Select "Sparks" in type filter
   - Only sparks should show

4. **Filter by confidence**
   - Select "Medium" (0.70-0.85)
   - Only medium-confidence sparks show

5. **Accept recovery**
   - Click "Accept" on a spark
   - Spark should disappear from list
   - `needs_review` set to false in database

6. **Reject recovery**
   - Click "Reject" on a spark
   - Spark marked as lost
   - `recovery_method = 'lost'` in database

7. **Manual relink**
   - Click "Relink" on a spark
   - Select correct chunk from list
   - ChunkRef updated to selected chunk
   - `recovery_method = 'manual'`, confidence = 1.0

### Expected Results

✅ **Filters work** (type and confidence)

✅ **Actions update database** correctly

✅ **Items removed from list** after accept/reject

✅ **Manual relink** sets confidence to 1.0

---

## Performance Benchmarks (Personal Tool)

These are rough guidelines, not strict requirements.

### Expected Performance

✅ **Spark creation**: <1s (Cmd+K → saved)
✅ **Timeline load**: <500ms (50 sparks from cache)
✅ **Recovery**: <30s per document (100 sparks)
✅ **Obsidian export**: <5s (background job)

### How to Measure

```javascript
// In browser console on /read/{id} page
console.time('spark-create')
// Press Cmd+K, create spark, submit
console.timeEnd('spark-create')

// Timeline load (if timeline exists)
console.time('timeline-load')
// Navigate to timeline view
console.timeEnd('timeline-load')
```

### Troubleshooting Performance

❌ **Spark creation >2s**:
   - Check server action performance
   - Verify no unnecessary database queries
   - Check network tab for slow requests

❌ **Timeline >1s**:
   - Verify using `sparks_cache` table (not ECS query)
   - Check if indexes exist on cache table
   - Limit initial load to 50 sparks

---

## Quick Reference: SQL Queries

### View all sparks for a user
```sql
SELECT
  e.id as entity_id,
  content.data->>'note' as thought,
  content.data->'tags' as tags,
  spark.data->'selections' as selections,
  temporal.data->>'createdAt' as created_at
FROM entities e
JOIN components content ON content.entity_id = e.id AND content.component_type = 'Content'
JOIN components spark ON spark.entity_id = e.id AND spark.component_type = 'Spark'
JOIN components temporal ON temporal.entity_id = e.id AND temporal.component_type = 'Temporal'
WHERE e.user_id = '{your-user-id}'
ORDER BY temporal.data->>'createdAt' DESC
LIMIT 10;
```

### View sparks needing review
```sql
SELECT
  entity_id,
  recovery_confidence,
  recovery_method,
  needs_review
FROM components
WHERE component_type = 'Spark'
  AND needs_review = true;
```

### View orphaned sparks
```sql
SELECT
  entity_id,
  data->>'orphaned' as orphaned,
  recovery_confidence
FROM components
WHERE component_type = 'Spark'
  AND (data->>'orphaned')::boolean = true;
```

### Check cache consistency
```sql
-- Compare ECS vs Cache
SELECT
  'ECS' as source,
  COUNT(*) as spark_count
FROM components
WHERE component_type = 'Spark'
UNION ALL
SELECT
  'Cache' as source,
  COUNT(*) as spark_count
FROM sparks_cache;
```

---

## Checklist Summary

Copy this checklist when doing manual testing:

### ECS Pattern
- [ ] Spark creates 4 components (Spark, Content, Temporal, ChunkRef)
- [ ] Component names are PascalCase
- [ ] JSONB data fields are camelCase
- [ ] No snake_case in JSONB (except ChunkRef compatibility)

### Multiple Selections
- [ ] Can add multiple selections to one spark
- [ ] Can remove selections
- [ ] Thought text separate from selections
- [ ] All selections saved correctly

### Recovery
- [ ] Selection-based recovery works (fuzzy matching)
- [ ] Thought-only recovery works (semantic)
- [ ] Confidence scores set correctly
- [ ] needs_review flag accurate (0.70-0.85)
- [ ] Orphaned flag for low confidence (<0.70)

### Cache
- [ ] sparks_cache stays in sync with ECS
- [ ] selections column populated
- [ ] connections column populated
- [ ] Updates reflected in cache

### Recovery UI (if implemented)
- [ ] Type filter works
- [ ] Confidence filter works
- [ ] Accept sets needs_review = false
- [ ] Reject sets recovery_method = 'lost'
- [ ] Manual relink updates ChunkRef

### Performance
- [ ] Spark creation <1s
- [ ] Timeline load <500ms (if timeline exists)
- [ ] Recovery completes <30s (100 sparks)

---

## Reporting Issues

When reporting issues from manual testing, include:

1. **Steps to reproduce**
2. **Expected behavior** (from this guide)
3. **Actual behavior** (what happened)
4. **SQL query results** (if database-related)
5. **Browser console errors** (if UI-related)
6. **Screenshots** (if helpful)

Example:
```
Issue: Selections not saving

Steps:
1. Opened /read/doc-123
2. Selected text "privacy is dead"
3. Pressed Cmd+K
4. Clicked "Quote This"
5. Typed thought "Important"
6. Clicked Submit

Expected: Selection saved in Spark component
Actual: Spark component has empty selections array

SQL Query:
SELECT data->'selections' FROM components WHERE component_type = 'Spark' ORDER BY created_at DESC LIMIT 1;
Result: []

Console Error:
TypeError: Cannot read property 'startOffset' of undefined
  at sparks.ts:94
```
