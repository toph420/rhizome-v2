# Test Files for Rhizome V2

This directory contains test files for validating the document processing pipeline.

## Test File Inventory

### Markdown Files

| File | Size | Expected Chunks | Processing Time | Purpose |
|------|------|-----------------|-----------------|---------|
| `small-test.md` | 819 B | 2 | <20s | ✅ Baseline test (TESTED - SUCCESS) |
| `medium-test.txt` | 3.0 KB | 4-6 | 20-40s | Plain text processing |
| `QUICK_START.md` | 3.0 KB | 3-5 | 20-40s | Real documentation test |
| `TESTING_CHECKLIST.md` | 7.8 KB | 6-10 | 40-60s | Larger markdown test |
| `GEMINI_API_ISSUE.md` | 4.0 KB | 4-6 | 20-40s | Technical documentation |

### PDF Files

| File | Size | Pages | Expected Chunks | Processing Time | Purpose |
|------|------|-------|-----------------|-----------------|---------|
| `tiny-test.pdf` | 1.8 KB | 1 | 1-2 | 30-60s | Quick PDF baseline |
| `small-pdf-test.pdf` | 5.1 KB | 3 | 3-5 | 60-90s | Basic PDF content |
| `medium-pdf-test.pdf` | 14 KB | 7 | 8-12 | 90-120s | Standard document |
| `large-pdf-test.pdf` | 61 KB | 18 | 20-30 | 2-3 min | Stress test |

## Test Results

### ✅ Completed Tests

**small-test.md** (2025-09-26)
- Status: ✅ SUCCESS
- Chunks: 2
- Themes: ["Rhizome V2", "System Testing", "Document Processing Pipeline"]
- Processing: ~15 seconds
- Notes: First successful test after fixing text file handling

### 🔄 Pending Tests

- [ ] medium-test.txt - Plain text processing
- [ ] tiny-test.pdf - PDF processing baseline
- [ ] small-pdf-test.pdf - Multi-page PDF
- [ ] medium-pdf-test.pdf - Standard PDF document
- [ ] large-pdf-test.pdf - Large PDF stress test

## Testing Guidelines

### Upload Order (Recommended)

1. **Start Simple**: `tiny-test.pdf` - Verify PDF pipeline works
2. **Scale Up**: `small-pdf-test.pdf` - Test multi-page handling
3. **Real Content**: `medium-test.txt` - Test plain text
4. **Stress Test**: `large-pdf-test.pdf` - Test performance limits

### Expected Processing Times

- **Text/Markdown**: <30 seconds regardless of size (no PDF extraction)
- **Tiny PDFs (<5 KB)**: 30-60 seconds
- **Small PDFs (5-20 KB)**: 1-2 minutes
- **Medium PDFs (20-100 KB)**: 2-3 minutes
- **Large PDFs (100+ KB)**: May timeout at 2 minutes

### Success Criteria

A test is successful when:
- ✅ Job status reaches `completed` (100%)
- ✅ Document status is `completed`
- ✅ `markdown_available = true`
- ✅ `embeddings_available = true`
- ✅ Chunks created with proper embeddings (768-dimensional)
- ✅ Themes and summaries generated for each chunk
- ✅ content.md file exists in storage

## Known Issues

### Gemini API Timeout (2025-09-26)

**Status**: RESOLVED for text files, UNKNOWN for PDFs

**Issue**: Gemini API calls for PDF extraction may timeout after 2 minutes. This was initially thought to be a hang, but was actually the API rejecting invalid PDFs (e.g., text files mislabeled as PDFs).

**Fix Applied**:
- Content-type detection before processing
- Text/Markdown files bypass PDF extraction entirely
- SDK-level timeout set to 120 seconds
- Promise.race timeout as backup

**Remaining Unknown**: Real PDF processing times have not been tested yet.

## File Generation

Test PDFs were generated using the script:
```bash
npx tsx scripts/generate-test-pdfs.ts
```

This creates 4 PDFs with lorem ipsum content:
- 1 page tiny document
- 3 page small document  
- 7 page medium document with chapters
- 18 page large document with extensive content

## Testing Commands

```bash
# Check job status
psql $DATABASE_URL -c "SELECT id, status, progress FROM background_jobs ORDER BY created_at DESC LIMIT 5;"

# Check document status
psql $DATABASE_URL -c "SELECT id, title, processing_status, markdown_available, embeddings_available FROM documents ORDER BY created_at DESC LIMIT 5;"

# Check chunks for a document
psql $DATABASE_URL -c "SELECT COUNT(*), vector_dims(embedding) FROM chunks WHERE document_id = 'DOCUMENT_ID';"

# Monitor worker logs
# (Check Terminal 2 where worker is running)
```

## Next Steps

1. Upload `tiny-test.pdf` to test PDF processing
2. Monitor worker logs for Gemini API response times
3. Verify chunks and embeddings are created properly
4. Test increasingly larger PDFs
5. Document any failures or performance issues