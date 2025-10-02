# Multi-Format Document Processing - Manual Testing Plan

**Test Date**: 2025-09-27  
**Tester**: Development Team  
**Feature**: Multi-Format Document Processing (MFP)  
**Test Phase**: Phase 5 - Manual Validation

---

## Test Environment Setup

### Prerequisites
- [ ] Supabase local instance running (`npx supabase start`)
- [ ] Worker process running (`npm run worker`)
- [ ] Next.js development server running (`npm run dev:next`)
- [ ] `.env.local` configured with all required API keys
- [ ] Test files prepared (see Test Materials section)

### Environment Verification
```bash
# Check all services
npm run status

# Expected output:
# ✓ Supabase: Running on localhost:54321
# ✓ Worker: Running (check for process)
# ✓ Next.js: Running on localhost:3000
```

---

## Test Materials

### Files to Prepare
1. **PDF Document** (5-10 pages)
   - Location: `test-files/sample-research-paper.pdf`
   - Suggested: Academic paper or technical documentation
   
2. **Markdown Files**
   - Clean: `test-files/clean-markdown.md` (well-formatted with headings)
   - Messy: `test-files/messy-markdown.md` (poor formatting, needs cleanup)
   
3. **Text File**
   - Location: `test-files/plain-text.txt`
   - Content: Multi-paragraph plain text

4. **YouTube URLs**
   - Valid with transcript: `https://youtube.com/watch?v=VIDEO_ID_WITH_TRANSCRIPT`
   - Disabled transcript: `https://youtube.com/watch?v=VIDEO_ID_NO_TRANSCRIPT`
   
5. **Web Article URLs**
   - News article: Any major news site article URL
   - Paywalled: Known paywalled article (e.g., NYTimes, WSJ)
   
6. **Pasted Content**
   - Generic text: Copy from any document
   - YouTube transcript: Manually copied YouTube transcript with timestamps

---

## Test Matrix

| Test ID | Source Type | Test Case | Expected Result | Status | Notes |
|---------|-------------|-----------|-----------------|--------|-------|
| MFP-T001 | PDF | Upload research paper (10 pages) | Processed in <2min, chunks created, viewable in reader | [ ] | |
| MFP-T002 | Markdown (as-is) | Upload clean markdown with headings | Chunked by headings, no AI processing, fast <30s | [ ] | |
| MFP-T003 | Markdown (clean) | Upload messy markdown | Cleaned with AI, semantic chunks, <1min | [ ] | |
| MFP-T004 | Text | Upload .txt file | Converted to markdown, chunked, <1min | [ ] | |
| MFP-T005 | YouTube | Valid URL with transcript | Transcript fetched, timestamps clickable, <1min | [ ] | |
| MFP-T006 | YouTube | Disabled transcript | Error with "paste manually" suggestion | [ ] | |
| MFP-T007 | Web URL | News article | Content extracted, no ads/nav, <1min | [ ] | |
| MFP-T008 | Web URL | Paywalled article | Error with "try archive.ph" suggestion | [ ] | |
| MFP-T009 | Paste | Generic text | Formatted to markdown, chunked, <30s | [ ] | |
| MFP-T010 | Paste | YouTube transcript with timestamps | Timestamps preserved and clickable, <30s | [ ] | |
| MFP-T011 | Edge Case | Very long document (>100 pages) | Processes without timeout | [ ] | |
| MFP-T012 | Edge Case | Multiple simultaneous uploads (5) | All process successfully | [ ] | |
| MFP-T013 | Edge Case | Invalid URL (malformed) | Validation error before processing | [ ] | |
| MFP-T014 | Edge Case | Empty content submission | Validation error | [ ] | |
| MFP-T015 | Edge Case | Special characters in title | Handles correctly, no encoding issues | [ ] | |

---

## Detailed Test Procedures

### MFP-T001: PDF Upload

**Objective**: Verify PDF processing works as before (no regression)

**Steps**:
1. Navigate to http://localhost:3000
2. Click "Upload File" tab
3. Drag and drop `test-files/sample-research-paper.pdf`
4. Click "Upload" button
5. Monitor ProcessingDock at bottom of screen
6. Wait for "Processing complete" status

**Verification**:
- [ ] Upload accepted without errors
- [ ] ProcessingDock shows progress: "Extracting from PDF..." → "Creating chunks..." → "Generating embeddings..."
- [ ] Processing completes in <2 minutes
- [ ] Document appears in library grid
- [ ] Clicking document opens reader
- [ ] Reader displays clean markdown content
- [ ] Chunks are visible (check database)

**Database Check**:
```sql
SELECT 
  d.id, 
  d.title, 
  d.source_type,
  d.processing_status,
  COUNT(c.id) as chunk_count
FROM documents d
LEFT JOIN chunks c ON c.document_id = d.id
WHERE d.source_type = 'pdf'
GROUP BY d.id
ORDER BY d.created_at DESC
LIMIT 1;
```

**Expected**: 1 document, status='completed', chunk_count>0

---

### MFP-T002: Markdown (Save As-Is)

**Objective**: Verify markdown can be saved without AI processing

**Steps**:
1. Navigate to upload page
2. Select `test-files/clean-markdown.md`
3. Ensure "Save as-is" radio button selected
4. Click "Upload"
5. Monitor processing

**Verification**:
- [ ] Radio buttons appear for markdown file
- [ ] "Save as-is" option visible and selectable
- [ ] Processing is FAST (<30 seconds)
- [ ] No "Cleaning content with AI..." stage in progress
- [ ] Content preserved exactly (check reader)
- [ ] Chunks split by markdown headings

**Database Check**:
```sql
SELECT 
  d.id,
  d.processing_requested,
  c.themes
FROM documents d
LEFT JOIN chunks c ON c.document_id = d.id
WHERE d.source_type = 'markdown_asis'
ORDER BY d.created_at DESC
LIMIT 1;
```

**Expected**: processing_requested=false, themes match markdown headings

---

### MFP-T003: Markdown (Clean with AI)

**Objective**: Verify AI cleanup works for messy markdown

**Steps**:
1. Navigate to upload page
2. Select `test-files/messy-markdown.md`
3. Select "Clean with AI" radio button
4. Click "Upload"
5. Monitor processing

**Verification**:
- [ ] "Clean with AI" option works
- [ ] ProcessingDock shows "Cleaning content with AI..."
- [ ] Processing takes longer than as-is mode (~1 minute)
- [ ] Content is cleaned (better formatting in reader)
- [ ] Semantic chunks created (not just by headings)

**Database Check**:
```sql
SELECT 
  d.processing_requested,
  c.importance_score,
  c.summary
FROM documents d
LEFT JOIN chunks c ON c.document_id = d.id
WHERE d.source_type = 'markdown_clean'
ORDER BY d.created_at DESC
LIMIT 1;
```

**Expected**: processing_requested=true, importance_score present, summaries generated

---

### MFP-T004: Text File Upload

**Objective**: Verify plain text converts to markdown

**Steps**:
1. Navigate to upload page
2. Select `test-files/plain-text.txt`
3. Click "Upload"
4. Monitor processing

**Verification**:
- [ ] Text file accepted (.txt extension)
- [ ] ProcessingDock shows "Converting to markdown..."
- [ ] Processing completes in <1 minute
- [ ] Reader shows structured markdown (not raw text)
- [ ] Headings and formatting added by AI

**Database Check**:
```sql
SELECT d.id, d.source_type, d.title
FROM documents d
WHERE d.source_type = 'txt'
ORDER BY d.created_at DESC
LIMIT 1;
```

**Expected**: document created with source_type='txt'

---

### MFP-T005: YouTube with Transcript

**Objective**: Verify YouTube transcript fetching and timestamp preservation

**Steps**:
1. Navigate to upload page
2. Click "Fetch from URL" tab
3. Paste YouTube URL with transcript enabled
4. System should auto-detect "YouTube video"
5. Click "Fetch"
6. Monitor processing

**Verification**:
- [ ] URL auto-detected as YouTube
- [ ] ProcessingDock shows "Fetching YouTube transcript..."
- [ ] Processing completes in <1 minute
- [ ] Reader displays transcript with timestamps
- [ ] Timestamps are clickable markdown links
- [ ] Clicking timestamp opens YouTube at that time
- [ ] Timestamps stored in database

**Database Check**:
```sql
SELECT 
  c.id,
  c.content,
  c.timestamps
FROM chunks c
JOIN documents d ON d.id = c.document_id
WHERE d.source_type = 'youtube'
ORDER BY c.chunk_index
LIMIT 5;
```

**Expected**: timestamps JSONB field populated with array of timestamp objects

**Manual Test - Click Timestamp**:
1. In reader, click a timestamp link like `[02:15]`
2. Verify YouTube opens in new tab
3. Verify video starts at 2:15

---

### MFP-T006: YouTube Disabled Transcript

**Objective**: Verify graceful error handling for disabled transcripts

**Steps**:
1. Navigate to Fetch from URL tab
2. Paste YouTube URL known to have transcripts disabled
3. Click "Fetch"
4. Wait for error

**Verification**:
- [ ] Processing starts normally
- [ ] Error appears in ProcessingDock
- [ ] Error message: "YOUTUBE_TRANSCRIPT_DISABLED: ..."
- [ ] Helpful suggestion: "Try pasting the transcript manually"
- [ ] Button/link to switch to Paste tab
- [ ] Document marked as failed in database

**Database Check**:
```sql
SELECT 
  bj.id,
  bj.status,
  bj.last_error
FROM background_jobs bj
WHERE bj.job_type = 'process_document'
  AND bj.last_error LIKE '%YOUTUBE_TRANSCRIPT_DISABLED%'
ORDER BY bj.created_at DESC
LIMIT 1;
```

**Expected**: status='failed', last_error contains error prefix

---

### MFP-T007: Web Article Extraction

**Objective**: Verify web article extraction with clean output

**Steps**:
1. Navigate to Fetch from URL tab
2. Paste news article URL (e.g., from TechCrunch, BBC, etc.)
3. System should detect "Web article"
4. Click "Fetch"
5. Monitor processing

**Verification**:
- [ ] URL detected as web article (not YouTube)
- [ ] ProcessingDock shows "Extracting article content..."
- [ ] Processing completes in <1 minute
- [ ] Reader shows clean article content
- [ ] NO ads, navigation menus, or sidebars
- [ ] Article title preserved
- [ ] Main content extracted correctly

**Database Check**:
```sql
SELECT 
  d.id,
  d.title,
  d.source_url,
  d.source_type
FROM documents d
WHERE d.source_type = 'web_url'
ORDER BY d.created_at DESC
LIMIT 1;
```

**Expected**: source_url populated with original URL

---

### MFP-T008: Paywalled Article

**Objective**: Verify paywall error handling with recovery suggestion

**Steps**:
1. Navigate to Fetch from URL tab
2. Paste paywalled article URL (e.g., NYTimes, WSJ)
3. Click "Fetch"
4. Wait for error

**Verification**:
- [ ] Processing attempts article extraction
- [ ] Error appears: "WEB_PAYWALL: ..."
- [ ] Suggestion: "Try using https://archive.ph/"
- [ ] Button/link to open archive.ph
- [ ] Document marked as failed

**Database Check**:
```sql
SELECT 
  bj.last_error
FROM background_jobs bj
WHERE bj.last_error LIKE '%WEB_PAYWALL%'
ORDER BY bj.created_at DESC
LIMIT 1;
```

**Expected**: Error message suggests archive.ph

---

### MFP-T009: Paste Generic Text

**Objective**: Verify pasted content processing

**Steps**:
1. Navigate to upload page
2. Click "Paste Content" tab
3. Paste multi-paragraph text content
4. (Optional) Add source URL
5. Click "Submit"
6. Monitor processing

**Verification**:
- [ ] Textarea accepts pasted content
- [ ] Optional source URL field available
- [ ] Processing completes in <30 seconds
- [ ] Content formatted to markdown
- [ ] Chunks created appropriately

**Database Check**:
```sql
SELECT d.source_type, d.source_url
FROM documents d
WHERE d.source_type = 'paste'
ORDER BY d.created_at DESC
LIMIT 1;
```

**Expected**: source_type='paste', optional source_url

---

### MFP-T010: Paste YouTube Transcript

**Objective**: Verify pasted YouTube transcripts preserve timestamps

**Steps**:
1. Manually copy YouTube transcript (with timestamps) from YouTube
2. Navigate to Paste Content tab
3. Paste transcript with timestamps like:
   ```
   [00:00] Introduction
   [02:15] Main topic
   [05:30] Conclusion
   ```
4. Add YouTube URL in optional field
5. Click "Submit"
6. Monitor processing

**Verification**:
- [ ] Content accepted with timestamps
- [ ] ProcessingDock shows processing
- [ ] Timestamps detected and preserved
- [ ] Reader shows clickable timestamps
- [ ] Timestamps link to YouTube URL provided

**Database Check**:
```sql
SELECT 
  c.timestamps,
  d.source_url
FROM chunks c
JOIN documents d ON d.id = c.document_id
WHERE d.source_type = 'paste'
  AND d.source_url LIKE '%youtube%'
ORDER BY d.created_at DESC
LIMIT 1;
```

**Expected**: timestamps populated when source_url is YouTube

---

## Edge Case Testing

### MFP-T011: Very Long Document

**Test**: Upload 100+ page PDF  
**Expected**: Processes without timeout, may take 5-10 minutes, no errors

### MFP-T012: Concurrent Uploads

**Test**: Upload 5 different documents simultaneously  
**Expected**: All queue successfully, all complete, worker handles concurrency

### MFP-T013: Invalid URL

**Test**: Enter malformed URL in Fetch tab  
**Expected**: Validation error BEFORE processing starts

### MFP-T014: Empty Content

**Test**: Submit empty paste or invalid file  
**Expected**: Validation error, no job created

### MFP-T015: Special Characters

**Test**: Upload file with unicode/emoji in filename  
**Expected**: Handles correctly, title displays properly

---

## Performance Benchmarks

### Processing Time Targets

| Source Type | Target Time | Acceptable Max |
|-------------|-------------|----------------|
| PDF (10 pages) | <1 minute | 2 minutes |
| Markdown (as-is) | <30 seconds | 1 minute |
| Markdown (clean) | <1 minute | 2 minutes |
| Text file | <1 minute | 2 minutes |
| YouTube (10 min video) | <45 seconds | 1.5 minutes |
| Web article | <45 seconds | 2 minutes |
| Paste | <30 seconds | 1 minute |

### Performance Test Results

Record actual times here:

| Test Run | Source Type | File Size | Processing Time | Pass/Fail |
|----------|-------------|-----------|-----------------|-----------|
| 1 | PDF | 10 pages | ___ seconds | [ ] |
| 2 | Markdown (as-is) | 5KB | ___ seconds | [ ] |
| 3 | Markdown (clean) | 5KB | ___ seconds | [ ] |
| 4 | Text | 3KB | ___ seconds | [ ] |
| 5 | YouTube | 10 min | ___ seconds | [ ] |
| 6 | Web article | - | ___ seconds | [ ] |
| 7 | Paste | 2KB | ___ seconds | [ ] |

---

## Quality Assessment

### Content Quality Checklist

For each processed document, assess:

- [ ] **Accuracy**: Content matches source material
- [ ] **Formatting**: Clean markdown, proper headings
- [ ] **Completeness**: No content missing or truncated
- [ ] **Timestamps** (YouTube): Preserved and functional
- [ ] **Cleanliness** (Web): No ads, navigation, or boilerplate
- [ ] **Readability**: Easy to read in document viewer

---

## Issues Discovered

### Bugs Found

| Issue ID | Description | Severity | Steps to Reproduce | Status |
|----------|-------------|----------|-------------------|--------|
| | | | | |

### Performance Issues

| Issue ID | Description | Impact | Measured Time | Target Time |
|----------|-------------|--------|---------------|-------------|
| | | | | |

### UX Issues

| Issue ID | Description | Impact | Suggested Fix |
|----------|-------------|--------|---------------|
| | | | |

---

## Test Summary

### Overall Results

- **Tests Passed**: ___ / 15
- **Tests Failed**: ___
- **Tests Blocked**: ___
- **Success Rate**: ___%

### Critical Metrics

- [ ] All 6 input methods functional
- [ ] Success rate >95% for valid inputs
- [ ] Processing times meet targets
- [ ] Error messages user-friendly
- [ ] No regressions in existing PDF processing

### Recommendations

_(Document any recommendations for improvements, optimizations, or fixes)_

---

## Sign-Off

**Tester**: ___________________  
**Date**: ___________________  
**Status**: [ ] Approved [ ] Needs Work [ ] Failed  

**Notes**: 

---

## Appendix: Database Queries

### Check All Recent Documents
```sql
SELECT 
  d.id,
  d.title,
  d.source_type,
  d.processing_status,
  d.created_at,
  COUNT(c.id) as chunks
FROM documents d
LEFT JOIN chunks c ON c.document_id = d.id
GROUP BY d.id
ORDER BY d.created_at DESC
LIMIT 10;
```

### Check Processing Jobs
```sql
SELECT 
  id,
  job_type,
  status,
  created_at,
  started_at,
  completed_at,
  last_error
FROM background_jobs
WHERE job_type = 'process_document'
ORDER BY created_at DESC
LIMIT 10;
```

### Check Chunk Details
```sql
SELECT 
  c.id,
  d.title as document,
  d.source_type,
  c.chunk_index,
  c.themes,
  LENGTH(c.content) as content_length,
  c.timestamps IS NOT NULL as has_timestamps
FROM chunks c
JOIN documents d ON d.id = c.document_id
ORDER BY c.created_at DESC
LIMIT 20;
```

---

**Document Version**: 1.0  
**Last Updated**: 2025-09-27  
**Status**: Ready for Testing