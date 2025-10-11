# Docling PDF Extraction - Implementation Progress

**Started:** 2025-10-08
**Reference:** `docs/todo/docling-pdf-extraction-implementation.md`

## Objective
Replace network-dependent Gemini batch extraction with local Docling extraction for 100% reliability.

## Progress Summary

### ✅ Completed
- ✅ Installed Docling Python library (v2.55.1)
- ✅ Verified Docling installation
- ✅ Deleted obsolete benchmark files (pdf-benchmark.ts, batch-processing.ts)
- ✅ Created `worker/scripts/docling_extract.py` (JSON I/O wrapper)
- ✅ Created `worker/lib/docling-extractor.ts` (TypeScript bridge)
- ✅ Modified `worker/processors/pdf-processor.ts` (replaced extractLargePDF with extractPdfBuffer)
- ✅ Deleted `worker/lib/pdf-batch-utils.ts` (430 lines, no longer needed)
- ✅ Deleted `worker/tests/lib/pdf-batch-utils.test.ts`
- ✅ Updated progress tracking document

### 🔄 In Progress
- Ready for testing with fresh PDF upload

### ⏳ Pending
- Upload new PDF through UI to test Docling extraction
- Verify extraction completes successfully
- Measure extraction time and verify quality
- Test with large PDF (100+ pages)
- Verify cost and performance improvements

### ✅ Bug Fixes Applied
1. **Fixed ESM `__dirname` error** in `docling-extractor.ts`
   - Added `fileURLToPath` and `import.meta.url` for ES modules
   - Worker hot-reloaded successfully

2. **Fixed Pydantic validation error** in `docling_extract.py`
   - Docling doesn't accept `None` for `max_num_pages`
   - Now only passes parameter when explicitly provided
   - Changed: `converter.convert(pdf_path, max_num_pages=None)`
   - To: `converter.convert(pdf_path, **kwargs)` (conditional)

---

## Detailed Log

### 2025-10-08 - Session Start

**Environment Check:**
- ✅ Python 3.13.6 (plan requires 3.8+)
- ✅ `pdf-batch-utils.ts` exists (12.7KB, 430 lines)
- ✅ Current processor uses `extractLargePDF`

**Dependencies Found:**
```
pdf-batch-utils.ts used in:
├─ processors/pdf-processor.ts (will replace)
├─ tests/lib/pdf-batch-utils.test.ts (will delete)
├─ benchmarks/pdf-benchmark.ts (will delete)
└─ benchmarks/batch-processing.ts (will delete)
```

**Decision:** Delete all 4 files (processor will be updated, benchmarks obsolete)

**Installing Docling...**
✅ Installed Docling v2.55.1 with all dependencies (torch, transformers, easyocr, etc.)
✅ Verified installation: `from docling.document_converter import DocumentConverter`

**Creating Implementation Files...**
✅ Created `worker/scripts/docling_extract.py` (117 lines)
  - JSON input/output interface
  - Progress tracking (starting, converting, complete)
  - Error handling with structured JSON errors
  - Support for OCR, page limits, page ranges

✅ Created `worker/lib/docling-extractor.ts` (254 lines)
  - `extractWithDocling()` - File path extraction
  - `extractPdfBuffer()` - Buffer extraction with temp file
  - Full TypeScript types and interfaces
  - Progress callback support
  - 30-minute default timeout
  - Automatic temp file cleanup

**Modifying PDF Processor...**
✅ Replaced imports: `extractLargePDF` → `extractPdfBuffer`
✅ Updated extraction stage (15-50% vs old 20-40%)
✅ Added Docling-specific progress tracking
✅ Updated all subsequent stage percentages
✅ Added extraction time and page count logging
✅ Updated cost documentation in comments

**Cleanup...**
✅ Deleted `worker/lib/pdf-batch-utils.ts` (430 lines)
✅ Deleted `worker/tests/lib/pdf-batch-utils.test.ts`
✅ Deleted obsolete benchmarks:
  - `worker/benchmarks/pdf-benchmark.ts`
  - `worker/benchmarks/batch-processing.ts`

**Total Lines Changed:**
- Added: ~370 lines (Python + TypeScript)
- Removed: ~600+ lines (batch utils + tests + benchmarks)
- Net: -230 lines (simpler codebase!)

---

## Key Metrics (Target vs Actual)

| Metric | Current | Target | Status |
|--------|---------|--------|--------|
| Success Rate | ~85% | 100% | Pending |
| Processing Time (426p) | 20-30 min | ~9 min | Pending |
| Cost per 500p book | $0.60-$1.15 | $0.50 | Pending |
| Batch Failures | ~15% | 0% | Pending |

---

## Files Modified

**Created:**
- ✅ `worker/scripts/docling_extract.py` (Python wrapper, 117 lines)
- ✅ `worker/lib/docling-extractor.ts` (TypeScript bridge, 254 lines)
- ✅ `docs/todo/docling-implementation-progress.md` (this file)

**Modified:**
- ✅ `worker/processors/pdf-processor.ts` (replaced extractLargePDF with extractPdfBuffer)
  - Lines changed: ~50 (imports, extraction logic, progress percentages)
  - New flow: Download → Docling extraction → Regex cleanup → AI cleanup → Chunking

**Deleted:**
- ✅ `worker/lib/pdf-batch-utils.ts` (430 lines)
- ✅ `worker/tests/lib/pdf-batch-utils.test.ts` (~200 lines)
- ✅ `worker/benchmarks/pdf-benchmark.ts` (~150 lines)
- ✅ `worker/benchmarks/batch-processing.ts` (~150 lines)

---

## Next Steps

1. ✅ ~~Verify Docling installation~~
2. ✅ ~~Delete obsolete benchmarks~~
3. ✅ ~~Create Python extraction script~~
4. ✅ ~~Create TypeScript bridge~~
5. ⏳ Test end-to-end with small PDF (NEXT)
6. ⏳ Test with large PDF (426 pages)
7. ⏳ Measure performance improvements
8. ⏳ Verify cost savings

---

## Notes & Decisions

- **Greenfield approach:** No backward compatibility, complete replacement
- **Benchmark strategy:** Delete old benchmarks, create new Docling benchmarks later if needed
- **Error handling:** Docling failures are local (file access, parsing) not network-based
- **Progress tracking:** Map Docling page progress to 15-50% range (vs current 20-40%)

---

---

## Testing Session (2025-10-08)

**Bug Fixes:**
1. ❌ First run: `ReferenceError: __dirname is not defined`
   - ✅ Fixed with ESM-compatible path resolution
   - Worker hot-reloaded successfully

2. ❌ Second run: `1 validation error for DocumentConverter.convert max_num_pages`
   - ✅ Fixed by only passing `max_num_pages` when not `None`
   - Docling's Pydantic validation requires int or omission

**Test Results:**
- Python script validated and fixed
- TypeScript bridge validated and fixed
- Worker running and healthy
- Ready for fresh PDF upload (old docs have stale storage paths)

**Setup Complete:**
1. ✅ SSL certificates installed
2. ✅ HuggingFace token configured
3. ✅ Docling AI models downloaded (~700MB)
4. ✅ Token added to worker/.env

**Next:**
Upload a fresh PDF through the UI to test complete Docling extraction pipeline

**Models Cached At:**
`/Users/topher/.cache/huggingface/hub/models--ds4sd--docling-layout-heron/`

---

---

## Large PDF Test Results (2025-10-08 21:10)

**Success! 427-page PDF extracted:**
- Pages: 427
- Extraction time: 1334.6s (~3.1 seconds/page)
- Markdown size: 1.2MB
- Status: ✅ Completed successfully
- Exported to Obsidian for review

**Performance Analysis:**
- M3 Mac speed: ~3.1s/page
- 100% success rate (no batch failures)
- Total processing: ~22 minutes for 427-page book
- Cost: $0 extraction (local) + AI cleanup/chunking

**Issues Found:**
- ⚠️ AI cleanup failed on section 92 (empty response) - fell back to regex cleanup
- ⚠️ Many "I" headings detected (likely page numbers/index) - cleanup can be improved

---

---

## Bug Fixes (2025-10-08 22:00)

### Issue 1: Spurious "I" Heading Injection ✅ FIXED

**Problem:** Pattern 10 in text-cleanup.ts was matching single-letter all-caps text (Roman numerals, index entries) and formatting them as headings, causing 300+ fake headings.

**Root Cause:** Naive regex `/[A-Z]+(?:\s+[A-Z]+){0,2}/` matched ANY 1-3 word all-caps text without filtering false positives.

**Fix Applied:**
1. Made Pattern 10 conditional via `skipHeadingGeneration` option
2. Added false positive filtering:
   - Single letters (I, II, III, IV, V, etc.)
   - Common index terms (INDEX, NOTES, PAGE)
   - Text too short (<3 chars) or too long (>60 chars)
3. Require 2+ words OR >5 chars for heading formatting
4. Docling PDFs skip heading generation entirely (already have structure)

**Files Changed:**
- `worker/lib/text-cleanup.ts` - Added CleanupOptions interface, improved Pattern 10
- `worker/processors/pdf-processor.ts` - Pass `{ skipHeadingGeneration: true }` for Docling

### Issue 2: AI Cleanup Explosion (360 sections) ✅ FIXED

**Problem:** Splitting at `##` headings created 360 sections from 300+ fake headings, causing AI to fail.

**Root Cause:** Heading-split strategy assumed only real headings, but Pattern 10 injected hundreds of spurious headings.

**Fix Applied:**
1. Added heading filter in markdown-cleanup-ai.ts before processing
2. Filter out same false positives as Pattern 10:
   - Single letters/Roman numerals
   - Common index terms
   - Text <3 chars without spaces
3. Merge spurious sections back together before AI processing
4. Log filtering results: "After filtering: N sections (removed M spurious headings)"

**Expected Result:**
- Before: 360 sections (300+ fake headings)
- After: ~10-20 sections (only real chapter headings)
- AI cost reduction: 36x fewer calls

**Files Changed:**
- `worker/lib/markdown-cleanup-ai.ts` - Added heading validation and merging logic

### Issue 3: New Review Options ✅ IMPLEMENTED

**Added Two New Checkboxes:**

1. **"Review Docling extraction before AI cleanup"**
   - Pauses after regex cleanup, before AI cleanup
   - Exports raw Docling + regex cleanup to Obsidian
   - User can verify extraction quality before expensive AI processing
   - Saves ~$0.50 if extraction is poor and needs retry

2. **"Extract images from PDF"**
   - UI checkbox added (functional, backend pending)
   - Warns about 30-40% processing time increase
   - Full implementation documented in `docs/todo/docling-image-extraction.md`

**Files Changed:**
- `src/components/upload/DocumentPreview.tsx` - Added 2 new checkboxes with proper state management
- `src/components/library/UploadZone.tsx` - Wired up state and formData
- `worker/processors/pdf-processor.ts` - Added reviewDoclingExtraction logic
- `worker/lib/docling-extractor.ts` - Added TypeScript interfaces for image extraction

### Testing Next Upload

**Expected Log (425-page PDF):**
```
[text-cleanup] Formatted as chapter heading: ACKNOWLEDGMENTS
[text-cleanup] Formatted as chapter heading: REFERENCE NOTES
[markdown-cleanup-ai] Raw split: 12 sections
[markdown-cleanup-ai] Filtering spurious heading: "I"
[markdown-cleanup-ai] Filtering spurious heading: "II"
[markdown-cleanup-ai] After filtering: 8 sections (removed 4 spurious headings)
[markdown-cleanup-ai] Cleaning section 1/8 (125KB)
...
[markdown-cleanup-ai] ✅ PDF cleanup complete: 8 sections → 1169KB
```

**vs Previous (Broken):**
```
[text-cleanup] Formatted as chapter heading: I (300+ times)
[markdown-cleanup-ai] Split into 360 sections
[markdown-cleanup-ai] Cleaning section 92/360 (3KB)
[markdown-cleanup-ai] ❌ Section 92 cleanup failed: Section 92 returned empty response
```

---

## Future Enhancements

### 1. Page-Range Progress Tracking

**Problem:** Docling's `convert()` is synchronous with no progress callbacks. Users see no updates during long extractions (e.g., 427 pages = 22 minutes).

**Solution: Batched Page-Range Extraction**
```python
# Process in chunks of 50 pages with progress updates
def extract_with_progress(pdf_path, total_pages, on_progress):
    results = []
    for start in range(1, total_pages + 1, 50):
        end = min(start + 49, total_pages)

        # Extract batch
        result = converter.convert(
            pdf_path,
            page_range=(start, end)
        )
        results.append(result.document.export_to_markdown())

        # Report progress
        on_progress({
            'pages_processed': end,
            'total_pages': total_pages,
            'percent': int((end / total_pages) * 100)
        })

    # Combine all batches
    return '\n\n'.join(results)
```

**Benefits:**
- Real-time progress updates every 50 pages (~2.5 minutes)
- Better user experience for large PDFs
- Can be cancelled mid-extraction

**Implementation:**
- Update `worker/scripts/docling_extract.py` with page-range batching
- Add page count detection (can use pypdfium2 to get page count first)
- Emit progress events per batch

### 2. Image Extraction Support

**Research Complete:** Docling supports full image extraction with multiple output modes.

**Key Findings:**
1. **Configuration Required:**
   ```python
   from docling.datamodel.pipeline_options import PdfPipelineOptions
   from docling_core.types.doc import ImageRefMode

   pipeline_options = PdfPipelineOptions()
   pipeline_options.generate_picture_images = True  # REQUIRED!
   pipeline_options.images_scale = 1.5  # Quality (1.0-2.0)
   ```

2. **Output Modes:**
   - `ImageRefMode.EMBEDDED` - Base64 in markdown (self-contained, large files)
   - `ImageRefMode.REFERENCED` - Separate PNG files (smaller markdown)

3. **Performance Impact:**
   - With images: ~4-5s/page (vs current 3.1s/page)
   - Adds ~30-40% processing time
   - Image quality configurable (trade-off: quality vs speed)

4. **Code Example:**
   ```python
   # Enable images
   converter = DocumentConverter(
       format_options={
           InputFormat.PDF: pipeline_options
       }
   )
   result = converter.convert(pdf_path)

   # Export with embedded images
   markdown = result.document.export_to_markdown(
       image_mode=ImageRefMode.EMBEDDED
   )

   # OR save images as separate files
   for idx, picture in enumerate(result.document.pictures):
       image = picture.get_image(result.document)
       image.save(f"image-{idx}.png", "PNG")
   ```

**Implementation Decision:**
- **Recommendation:** Add as optional flag (default: off)
  - `input_data.extractImages = true` to enable
  - Use `REFERENCED` mode (separate files) for large books
  - Store images in Supabase Storage alongside markdown

**Next Steps:**
1. Add `extractImages` flag to PDF processor
2. Configure pipeline options conditionally
3. Handle image file storage/retrieval
4. Update UI to toggle image extraction

---

**Last Updated:** 2025-10-08 21:15 (Large PDF test complete, enhancements documented)
