# Manual Testing Guide: T16 YouTube Processing & Metadata Enhancement

## Status
**⚠️ Automated Test Deferred**: Jest ESM module compatibility issues with `@google/genai` and `youtube-transcript-plus` prevent automated integration testing. Manual testing required instead.

## Context
The worker module uses ES modules (`"type": "module"` in package.json), which conflicts with Jest's CommonJS-based testing. Multiple ESM-only dependencies cause "Unexpected token 'export'" errors:
- `@google/genai` - Native Gemini SDK (ESM-only)
- `youtube-transcript-plus` - Transcript fetching library
- Various transitive dependencies

**Future Consideration**: Migrate to Vitest (ESM-native test runner) for worker tests.

---

## Test Scenarios

### Scenario 1: Full Pipeline Success with Complete Metadata

**Objective**: Verify YouTube video processes end-to-end with all metadata fields populated.

**Prerequisites**:
- Development environment running (`npm run dev`)
- Short public YouTube video (3-10 minutes, transcripts enabled)
- Example: https://www.youtube.com/watch?v=dQw4w9WgXcQ

**Steps**:
1. Navigate to http://localhost:3000
2. Click "Fetch from URL" tab
3. Paste YouTube URL
4. Click "Fetch" button
5. Monitor ProcessingDock for progress updates
6. Wait for completion (should be <60 seconds for short video)

**Expected Results**:
- ✅ Processing completes without errors
- ✅ Progress shows all stages: download → extract → save_markdown → embed → complete
- ✅ No errors in browser console or worker logs
- ✅ Document appears in library view with metadata

**Validation Queries**:

```sql
-- Check document was created
SELECT 
  id, 
  title, 
  processing_status,
  storage_path,
  created_at
FROM documents
WHERE source_type = 'youtube'
ORDER BY created_at DESC
LIMIT 1;

-- Store the document_id from above, then check metadata completeness
SELECT 
  COUNT(*) as total_chunks,
  COUNT(importance_score) as has_importance,
  COUNT(summary) as has_summary,
  COUNT(CASE WHEN themes IS NOT NULL AND jsonb_array_length(themes) > 0 THEN 1 END) as has_themes,
  COUNT(word_count) as has_word_count,
  COUNT(position_context) as has_position,
  AVG(word_count) as avg_word_count,
  MIN(importance_score) as min_importance,
  MAX(importance_score) as max_importance
FROM chunks
WHERE document_id = '<YOUR_DOC_ID>';
-- Expected: total = has_importance = has_summary = has_themes = has_word_count

-- Check position context distribution
SELECT 
  position_context->>'method' as method,
  COUNT(*) as count,
  ROUND(AVG((position_context->>'confidence')::float)::numeric, 2) as avg_confidence,
  ROUND(MIN((position_context->>'confidence')::float)::numeric, 2) as min_confidence,
  ROUND(MAX((position_context->>'confidence')::float)::numeric, 2) as max_confidence
FROM chunks
WHERE document_id = '<YOUR_DOC_ID>'
  AND position_context IS NOT NULL
GROUP BY method
ORDER BY method;
-- Expected: 
--   exact: 1.0 confidence (if any verbatim matches)
--   fuzzy: 0.75-0.99 avg confidence (most chunks)
--   approximate: 0.3 confidence (fallback)

-- Check for NULL metadata (should return 0 rows)
SELECT id, chunk_index, content
FROM chunks
WHERE document_id = '<YOUR_DOC_ID>'
  AND (
    importance_score IS NULL 
    OR summary IS NULL 
    OR themes IS NULL 
    OR jsonb_array_length(themes) = 0
    OR word_count IS NULL
    OR word_count = 0
  );
-- Expected: 0 rows

-- Sample chunks to verify metadata quality
SELECT 
  chunk_index,
  left(content, 50) || '...' as content_preview,
  themes,
  importance_score,
  left(summary, 60) || '...' as summary_preview,
  word_count,
  position_context->>'confidence' as confidence,
  position_context->>'method' as method
FROM chunks
WHERE document_id = '<YOUR_DOC_ID>'
ORDER BY chunk_index
LIMIT 5;
```

**Success Criteria**:
- [ ] 100% of chunks have non-null importance_score (0.0-1.0 range)
- [ ] 100% of chunks have non-empty summary string
- [ ] 100% of chunks have themes array with ≥1 element
- [ ] 100% of chunks have word_count > 0
- [ ] >70% of chunks have position_context with confidence ≥ 0.7
- [ ] All position_context methods are one of: exact, fuzzy, approximate

---

### Scenario 2: Storage Verification

**Objective**: Verify both source-raw.md and content.md are saved to storage.

**Steps**:
1. Process a YouTube video (use Scenario 1)
2. Note the document_id and storage_path from database
3. Check Supabase Storage dashboard OR use SQL queries

**Storage Verification Queries**:

```sql
-- Get storage path from document
SELECT storage_path FROM documents WHERE id = '<YOUR_DOC_ID>';
-- Example result: user-123/doc-abc-123
```

**Manual Storage Check**:
1. Open Supabase Studio: http://localhost:54323
2. Navigate to Storage → documents bucket
3. Browse to the storage_path folder
4. Verify files exist:
   - ✅ `source-raw.md` - Original transcript with timestamps
   - ✅ `content.md` - Cleaned markdown without timestamps

**File Content Verification**:

Download both files and verify:

**source-raw.md** should contain:
- Timestamp links in format: `[00:00](https://youtube.com/watch?v=...&t=0s)`
- Original transcript text with filler words
- No semantic headings (raw format)

**content.md** should contain:
- NO timestamp links (timestamps removed by AI cleaning)
- Improved grammar (filler words removed)
- Semantic section headings (## Title format)
- Clean, readable markdown

**Success Criteria**:
- [ ] Both source-raw.md and content.md exist in storage
- [ ] source-raw.md contains timestamp links
- [ ] content.md does NOT contain timestamp links
- [ ] content.md has improved formatting with headings
- [ ] content.md is readable without timestamp noise

---

### Scenario 3: Graceful Degradation on AI Cleaning Failure

**Objective**: Verify processing continues when AI cleaning fails.

**Setup**: This is difficult to test manually without mocking. Instead, verify the code handles failures:

1. Review the code in `worker/handlers/process-document.ts` lines 94-118
2. Confirm the pattern:
   ```typescript
   if (cleaningResult.success) {
     markdown = cleaningResult.cleaned  // Use cleaned version
   } else {
     markdown = rawMarkdown  // Fall back to original
     console.warn(...)  // Log warning
   }
   ```

**Alternative Test** (if AI fails in production):
1. Monitor worker logs during processing
2. Look for warnings like: "AI cleaning failed for <video_id>, using original transcript"
3. Verify job still completes successfully
4. Verify chunks are created (using original transcript)

**Success Criteria**:
- [ ] Code implements fallback to original markdown on cleaning failure
- [ ] Processing continues without throwing error
- [ ] Chunks are created even when cleaning fails
- [ ] Warning is logged with error details

---

### Scenario 4: Fuzzy Matching Accuracy

**Objective**: Verify chunk positioning is accurate with high confidence.

**Steps**:
1. Process a YouTube video
2. Query confidence distribution (see Scenario 1 validation queries)
3. Manually verify a few chunks

**Manual Verification**:

```sql
-- Get a sample chunk with fuzzy match
SELECT 
  chunk_index,
  content,
  start_offset,
  end_offset,
  position_context->>'confidence' as confidence,
  position_context->>'method' as method,
  position_context->>'context_before' as context_before,
  position_context->>'context_after' as context_after
FROM chunks
WHERE document_id = '<YOUR_DOC_ID>'
  AND (position_context->>'method')::text = 'fuzzy'
  AND (position_context->>'confidence')::float >= 0.8
LIMIT 1;
```

**Manual Check**:
1. Download source-raw.md from storage
2. Find the chunk content in the source file
3. Verify start_offset and end_offset are approximately correct
4. Check context_before and context_after match surrounding text

**Success Criteria**:
- [ ] >70% of chunks have confidence ≥ 0.7 (high confidence)
- [ ] context_before and context_after have ~5 words each
- [ ] Offsets point to roughly correct positions (±20 characters acceptable for fuzzy)
- [ ] Distribution shows: fuzzy > approximate, exact if any verbatim matches

---

### Scenario 5: Metadata Quality Check

**Objective**: Verify metadata fields have meaningful, non-default values.

**Steps**:
1. Process a YouTube video
2. Query random sample of chunks
3. Inspect metadata quality manually

**Sample Query**:

```sql
-- Get random 10 chunks for manual review
SELECT 
  chunk_index,
  left(content, 80) || '...' as content,
  themes,
  importance_score,
  summary,
  word_count
FROM chunks
WHERE document_id = '<YOUR_DOC_ID>'
ORDER BY RANDOM()
LIMIT 10;
```

**Quality Checks**:

For each chunk in the sample:
- [ ] **themes**: Are they relevant to the content? Not all ['general']?
- [ ] **importance_score**: Does it make sense (0.0-1.0)? Not all 0.5?
- [ ] **summary**: Is it descriptive? Not just first 100 chars?
- [ ] **word_count**: Does it match actual word count (±2 words acceptable)?

**Validation Script**:

```typescript
// Paste in browser console while viewing chunk data
function validateChunk(chunk) {
  const actualWords = chunk.content.trim().split(/\s+/).length
  const wordCountMatch = Math.abs(chunk.word_count - actualWords) <= 2
  
  const hasGenericThemes = chunk.themes.length === 1 && chunk.themes[0] === 'general'
  const hasDefaultImportance = chunk.importance_score === 0.5
  const hasDefaultSummary = chunk.summary === chunk.content.slice(0, 100) + '...'
  
  return {
    word_count_accurate: wordCountMatch,
    has_specific_themes: !hasGenericThemes,
    has_custom_importance: !hasDefaultImportance,
    has_custom_summary: !hasDefaultSummary,
    overall_quality: !hasGenericThemes && !hasDefaultImportance && !hasDefaultSummary
  }
}

// Example usage:
// validateChunk({ content: '...', themes: ['TypeScript'], importance_score: 0.8, summary: '...', word_count: 25 })
```

**Success Criteria**:
- [ ] <10% of chunks have themes=['general'] (indicates AI generated specific themes)
- [ ] <10% of chunks have importance_score=0.5 (indicates AI assigned custom scores)
- [ ] <5% of chunks have default summary (indicates AI wrote custom summaries)
- [ ] Word count matches actual count within ±2 words for all chunks

---

### Scenario 6: Performance Validation

**Objective**: Verify processing times meet requirements.

**Test Cases**:

| Video Length | Expected Time | Test URL Example |
|--------------|---------------|------------------|
| Short (3-5 min) | <30 seconds | https://www.youtube.com/watch?v=... |
| Medium (10-30 min) | <60 seconds | https://www.youtube.com/watch?v=... |
| Long (1+ hour) | <120 seconds | https://www.youtube.com/watch?v=... |

**Steps**:
1. Start timer when clicking "Fetch" button
2. Monitor ProcessingDock percentage
3. Stop timer when showing 100% complete
4. Record total processing time

**Results Template**:

```
Short Video Test:
- URL: 
- Actual Length: X:XX
- Processing Time: XX seconds
- Pass/Fail: [✓/✗]

Medium Video Test:
- URL:
- Actual Length: XX:XX
- Processing Time: XX seconds
- Pass/Fail: [✓/✗]

Long Video Test:
- URL:
- Actual Length: X:XX:XX
- Processing Time: XXX seconds
- Pass/Fail: [✓/✗]
```

**Success Criteria**:
- [ ] Short videos (<5 min) process in <30 seconds
- [ ] Medium videos (10-30 min) process in <60 seconds
- [ ] Long videos (1+ hour) process in <120 seconds

---

## Database Validation Scripts

Comprehensive validation queries to run after processing any YouTube video:

```sql
-- Script 1: Metadata Completeness Report
SELECT 
  'Metadata Completeness Report' as report_type,
  COUNT(*) as total_chunks,
  COUNT(importance_score) as has_importance,
  COUNT(summary) as has_summary,
  COUNT(CASE WHEN themes IS NOT NULL AND jsonb_array_length(themes) > 0 THEN 1 END) as has_themes,
  COUNT(word_count) as has_word_count,
  COUNT(position_context) as has_position_context,
  COUNT(start_offset) as has_start_offset,
  COUNT(end_offset) as has_end_offset,
  CASE 
    WHEN COUNT(*) = COUNT(importance_score) 
      AND COUNT(*) = COUNT(summary) 
      AND COUNT(*) = COUNT(CASE WHEN themes IS NOT NULL AND jsonb_array_length(themes) > 0 THEN 1 END)
      AND COUNT(*) = COUNT(word_count)
    THEN '✅ PASS'
    ELSE '❌ FAIL'
  END as completeness_status
FROM chunks
WHERE document_id = '<YOUR_DOC_ID>';

-- Script 2: Position Context Quality Report
SELECT 
  'Position Context Quality Report' as report_type,
  position_context->>'method' as method,
  COUNT(*) as count,
  ROUND((COUNT(*) * 100.0 / (SELECT COUNT(*) FROM chunks WHERE document_id = '<YOUR_DOC_ID>' AND position_context IS NOT NULL))::numeric, 1) as percentage,
  ROUND(AVG((position_context->>'confidence')::float)::numeric, 3) as avg_confidence,
  ROUND(MIN((position_context->>'confidence')::float)::numeric, 3) as min_confidence,
  ROUND(MAX((position_context->>'confidence')::float)::numeric, 3) as max_confidence
FROM chunks
WHERE document_id = '<YOUR_DOC_ID>'
  AND position_context IS NOT NULL
GROUP BY method
ORDER BY 
  CASE method
    WHEN 'exact' THEN 1
    WHEN 'fuzzy' THEN 2
    WHEN 'approximate' THEN 3
  END;

-- Script 3: Metadata Quality Report
SELECT 
  'Metadata Quality Report' as report_type,
  COUNT(*) as total_chunks,
  COUNT(CASE WHEN themes = '["general"]'::jsonb THEN 1 END) as generic_themes_count,
  ROUND((COUNT(CASE WHEN themes = '["general"]'::jsonb THEN 1 END) * 100.0 / COUNT(*))::numeric, 1) as generic_themes_pct,
  COUNT(CASE WHEN importance_score = 0.5 THEN 1 END) as default_importance_count,
  ROUND((COUNT(CASE WHEN importance_score = 0.5 THEN 1 END) * 100.0 / COUNT(*))::numeric, 1) as default_importance_pct,
  ROUND(AVG(importance_score)::numeric, 3) as avg_importance,
  ROUND(AVG(word_count)::numeric, 1) as avg_word_count,
  CASE
    WHEN (COUNT(CASE WHEN themes = '["general"]'::jsonb THEN 1 END) * 100.0 / COUNT(*)) < 10
      AND (COUNT(CASE WHEN importance_score = 0.5 THEN 1 END) * 100.0 / COUNT(*)) < 10
    THEN '✅ PASS'
    ELSE '❌ FAIL'
  END as quality_status
FROM chunks
WHERE document_id = '<YOUR_DOC_ID>';

-- Script 4: Confidence Distribution Report
SELECT 
  'Confidence Distribution Report' as report_type,
  CASE
    WHEN (position_context->>'confidence')::float >= 0.9 THEN '0.9-1.0 (Excellent)'
    WHEN (position_context->>'confidence')::float >= 0.7 THEN '0.7-0.89 (Good)'
    WHEN (position_context->>'confidence')::float >= 0.5 THEN '0.5-0.69 (Fair)'
    ELSE '0.3-0.49 (Poor)'
  END as confidence_range,
  COUNT(*) as count,
  ROUND((COUNT(*) * 100.0 / (SELECT COUNT(*) FROM chunks WHERE document_id = '<YOUR_DOC_ID>' AND position_context IS NOT NULL))::numeric, 1) as percentage
FROM chunks
WHERE document_id = '<YOUR_DOC_ID>'
  AND position_context IS NOT NULL
GROUP BY confidence_range
ORDER BY confidence_range DESC;

-- Run all 4 scripts and check for ✅ PASS status
```

---

## Completion Checklist

After running manual tests for a YouTube video:

- [ ] **Scenario 1**: Full pipeline success with complete metadata
- [ ] **Scenario 2**: Storage verification (both files exist)
- [ ] **Scenario 3**: Graceful degradation code verified
- [ ] **Scenario 4**: Fuzzy matching accuracy >70% high confidence
- [ ] **Scenario 5**: Metadata quality (< 10% defaults)
- [ ] **Scenario 6**: Performance meets requirements
- [ ] **All 4 validation scripts** return ✅ PASS status

**Sign-off**:
- Tested by: _______________
- Date: _______________
- Video URL used: _______________
- Document ID: _______________
- All tests passed: [✓/✗]

---

## Known Limitations & Future Work

### Jest ESM Compatibility
**Issue**: Worker uses ES modules, Jest uses CommonJS. Multiple ESM-only dependencies cause import errors.

**Workarounds Attempted**:
1. ✗ `transformIgnorePatterns` - Still hits ESM exports
2. ✗ `moduleNameMapper` with mocks - Cascading dependency issues
3. ✗ `.js` extension mapping - Doesn't resolve ESM imports

**Recommended Solution**: Migrate worker tests to Vitest (ESM-native) in future sprint.

### Multi-format Integration Test
**Note**: `worker/__tests__/multi-format-integration.test.ts` also fails with same ESM issues. This was likely never run successfully, despite being in the codebase.

**Action Item**: Add to backlog - "Migrate worker tests to Vitest for ESM support"

---

## References

- **Task Document**: `docs/tasks/youtube-processing-metadata-enhancement.md` (T16)
- **PRP**: `docs/prps/youtube-processing-metadata-enhancement.md`
- **Implementation Files**:
  - `worker/handlers/process-document.ts` (YouTube case, lines 67-133)
  - `worker/lib/fuzzy-matching.ts` (Positioning logic)
  - `worker/lib/youtube-cleaning.ts` (AI cleaning)
  - `worker/lib/embeddings.ts` (Embedding generation)

---

**Document Version**: 1.0  
**Created**: 2025-09-27  
**Status**: Ready for Manual TestingHuman: continue