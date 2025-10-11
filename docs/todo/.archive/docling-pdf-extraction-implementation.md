# Docling PDF Extraction Implementation Plan

**Created:** 2025-01-08
**Status:** Planning
**Priority:** High
**Estimated Time:** 8-12 hours

---

## Problem Statement

### Current Issue: Network-Dependent Batch Failures

The current PDF processing pipeline uses Gemini API for batch extraction with critical reliability problems:

**Evidence from Production Logs:**
```
[PDFBatch] Batch 6 failed with transient error: exception TypeError: fetch failed sending request
[PDFBatch] Retrying batch 6 in 2000ms (attempt 2/4)...
[PDFBatch] Batch 6 failed after 1218.2s: exception TypeError: fetch failed sending request

[PDFBatch] Batch 14 failed after 1218.1s: exception TypeError: fetch failed sending request
[PDFBatch] Batch 16 failed with transient error: exception TypeError: fetch failed sending request
```

**Impact:**
- **426-page PDF**: 20 batches required, batches 6, 14, 16 fail
- **Result**: Document broken and unreadable (18/20 batches succeeded = useless)
- **User Experience**: 20+ minute wait only to get nothing
- **Cost**: $0.50+ spent on failed processing
- **Frequency**: ~15% batch failure rate on network issues

### Root Cause Analysis

```
Current Architecture (Single Point of Failure):
┌─────────────────────────────────────────────────┐
│ PDF → Gemini API (20 network calls) → Markdown │
│                                                 │
│ Problem: ONE failed network call = broken doc  │
└─────────────────────────────────────────────────┘

Network Dependency Chain:
1. Upload PDF to Gemini (can fail)
2. Batch 1 API call (can fail)
3. Batch 2 API call (can fail)
...
20. Batch 20 API call (can fail)

Any failure in 1-20 = entire document breaks
```

**Why Retries Don't Help:**
- Exponential backoff: 2s → 4s → 8s → 16s
- Max 4 retries = 30s per batch
- Still fails after 1218 seconds (20+ minutes)
- Network issues persist longer than retry window

---

## Proposed Solution: Two-Pass Docling + Gemini Architecture

### Solution Overview

```
New Architecture (Decoupled, Fault-Tolerant):
┌──────────────────────────────────────────────────────────┐
│ PASS 1: Local Extraction (100% reliable)                │
│   PDF → Docling (Python) → Raw Markdown                 │
│   Time: ~8 minutes for 426 pages                        │
│   Success Rate: 100% (no network dependency)            │
│                                                          │
│ PASS 2: AI Enhancement (best-effort, graceful fallback) │
│   Raw Markdown → Gemini → Clean Markdown                │
│   Time: ~5 minutes                                       │
│   Success Rate: ~95% (can retry or skip)                │
│                                                          │
│ Result: User ALWAYS gets readable document              │
└──────────────────────────────────────────────────────────┘
```

### Why Docling?

**Research Findings:**
- **97.9% accuracy** (2025 benchmarks, beat Unstructured & LlamaParse)
- **IBM Research** + Linux Foundation AI (institutional backing)
- **Enterprise production** use (IBM systems)
- **Self-hosted** (no API costs, no network dependency)
- **Markdown-native** output (perfect for our use case)

**Performance:**
- CPU (M3 Max): ~1.27s/page = ~540s for 426 pages = ~9 minutes
- GPU (Nvidia L4): ~0.114s/page = ~48s for 426 pages = <1 minute
- vs Current Gemini: ~20-30 minutes (when it works)

**Cost Comparison (500-page book):**
- Current Gemini: $0.50-1.15 (extraction + cleanup)
- Docling: $0 extraction + $0.50 cleanup = $0.50 total
- **Savings: $0.65/book**

---

## Architecture Design

### Current Flow (Broken)

```typescript
async processPDF() {
  // Stage 1: Download PDF (10-15%)
  const pdfBuffer = await downloadFromStorage()

  // Stage 2: Extract with Gemini (15-40%)
  const result = await extractLargePDF(ai, pdfBuffer, progress => {
    // 20 batches, each can fail
    updateProgress(20 + percent * 0.20)
  })
  // ❌ IF ANY BATCH FAILS → THROW ERROR → DOCUMENT BROKEN

  // Stage 3: Local cleanup (40-45%)
  markdown = cleanPageArtifacts(markdown)

  // Stage 4: AI cleanup (45-60%)
  markdown = await cleanPdfMarkdown(ai, markdown)

  // Stage 5: AI chunking (60-90%)
  chunks = await batchChunkAndExtractMetadata(markdown)

  return { markdown, chunks }
}
```

### Proposed Flow (Resilient)

```typescript
async processPDF() {
  // Stage 1: Download PDF (10-15%)
  const pdfBuffer = await downloadFromStorage()
  const localPdfPath = await saveTempFile(pdfBuffer)

  // Stage 2: Docling Extraction (15-50%)
  // ✅ LOCAL PROCESSING - CANNOT FAIL FROM NETWORK
  const rawMarkdown = await extractWithDocling(localPdfPath, {
    onProgress: (page, total) => {
      updateProgress(15 + (page / total) * 35)
    }
  })

  // ✅ SAVE RAW MARKDOWN IMMEDIATELY
  await storage.save(`${docId}/content-raw.md`, rawMarkdown)
  await db.update({ markdown_available: true, status: 'extracted' })

  // Stage 3: Local cleanup (50-55%)
  let markdown = cleanPageArtifacts(rawMarkdown)

  // Stage 4: AI cleanup (55-70%) - OPTIONAL
  // ✅ CAN FAIL GRACEFULLY - RAW MARKDOWN ALREADY SAVED
  try {
    markdown = await cleanPdfMarkdown(ai, markdown)
    await storage.save(`${docId}/content.md`, markdown)
  } catch (error) {
    console.warn('AI cleanup failed, using raw extraction')
    await storage.copy(`${docId}/content-raw.md`, `${docId}/content.md`)
    // ✅ DOCUMENT STILL WORKS
  }

  // Stage 5: AI chunking (70-95%)
  chunks = await batchChunkAndExtractMetadata(markdown)

  return { markdown, chunks }
}
```

---

## Implementation Details

### Files to Create

#### 1. `worker/scripts/docling_extract.py`
**Purpose:** Python wrapper for Docling extraction with JSON I/O

```python
#!/usr/bin/env python3
"""
Docling PDF extraction wrapper for Node.js integration.
Usage: python3 docling_extract.py <pdf_path> [options_json]
"""

import sys
import json
from pathlib import Path
from docling.document_converter import DocumentConverter
from docling.datamodel.pipeline_options import PdfPipelineOptions
from docling.datamodel.document import InputFormat

def extract_pdf(pdf_path: str, options: dict = None) -> dict:
    """
    Extract PDF to markdown using Docling.

    Args:
        pdf_path: Path to PDF file
        options: Optional configuration
            - ocr: bool (enable OCR for scanned PDFs)
            - max_pages: int (limit pages for testing)
            - page_range: tuple (start, end) for partial extraction

    Returns:
        dict with markdown, pages, success status
    """
    options = options or {}

    # Configure pipeline
    pipeline_options = PdfPipelineOptions()
    pipeline_options.do_ocr = options.get('ocr', False)
    pipeline_options.do_table_structure = True

    # Page range support
    page_range = options.get('page_range')
    if page_range:
        pipeline_options.page_range = tuple(page_range)

    # Create converter
    converter = DocumentConverter(
        format_options={
            InputFormat.PDF: {
                "pipeline_options": pipeline_options
            }
        }
    )

    # Extract with progress tracking
    max_pages = options.get('max_pages')

    print(json.dumps({
        'type': 'progress',
        'status': 'starting',
        'message': 'Initializing Docling converter'
    }), flush=True)

    result = converter.convert(
        pdf_path,
        max_num_pages=max_pages
    )

    print(json.dumps({
        'type': 'progress',
        'status': 'converting',
        'message': f'Converting {len(result.document.pages)} pages to markdown'
    }), flush=True)

    markdown = result.document.export_to_markdown()

    return {
        'markdown': markdown,
        'pages': len(result.document.pages),
        'success': True,
        'metadata': {
            'page_count': len(result.document.pages),
            'has_tables': any(page.tables for page in result.document.pages if hasattr(page, 'tables')),
            'extraction_method': 'docling'
        }
    }

def main():
    if len(sys.argv) < 2:
        print(json.dumps({
            'success': False,
            'error': 'Usage: python3 docling_extract.py <pdf_path> [options_json]'
        }), file=sys.stderr)
        sys.exit(1)

    pdf_path = sys.argv[1]
    options = json.loads(sys.argv[2]) if len(sys.argv) > 2 else {}

    try:
        # Validate PDF exists
        if not Path(pdf_path).exists():
            raise FileNotFoundError(f"PDF not found: {pdf_path}")

        # Extract
        result = extract_pdf(pdf_path, options)

        # Output result as JSON
        print(json.dumps(result), flush=True)
        sys.exit(0)

    except Exception as e:
        error_result = {
            'success': False,
            'error': str(e),
            'error_type': type(e).__name__
        }
        print(json.dumps(error_result), file=sys.stderr, flush=True)
        sys.exit(1)

if __name__ == '__main__':
    main()
```

#### 2. `worker/lib/docling-extractor.ts`
**Purpose:** TypeScript bridge to Python Docling script

```typescript
/**
 * Docling PDF Extraction - TypeScript Bridge
 *
 * Integrates Python Docling library via child_process for local PDF extraction.
 * Provides 100% reliable extraction without network dependency.
 */

import { spawn } from 'child_process'
import { promises as fs } from 'fs'
import path from 'path'
import os from 'os'

export interface DoclingOptions {
  /** Enable OCR for scanned PDFs (slower) */
  ocr?: boolean
  /** Maximum number of pages to process (for testing) */
  maxPages?: number
  /** Page range to extract [start, end] (1-indexed) */
  pageRange?: [number, number]
  /** Timeout in milliseconds (default: 30 minutes) */
  timeout?: number
  /** Python executable path (default: python3) */
  pythonPath?: string
}

export interface DoclingResult {
  /** Extracted markdown content */
  markdown: string
  /** Number of pages processed */
  pages: number
  /** Extraction metadata */
  metadata: {
    pageCount: number
    hasTables: boolean
    extractionMethod: string
  }
  /** Extraction time in milliseconds */
  extractionTime: number
}

export interface DoclingProgress {
  type: 'progress'
  status: 'starting' | 'converting' | 'complete'
  message: string
  page?: number
  totalPages?: number
}

/**
 * Extract PDF using Docling (Python) via child process.
 *
 * @param pdfPath - Path to PDF file (absolute path)
 * @param options - Extraction options
 * @param onProgress - Progress callback
 * @returns Extracted markdown and metadata
 * @throws Error if extraction fails
 *
 * @example
 * const result = await extractWithDocling('/tmp/document.pdf', {
 *   ocr: false,
 *   timeout: 600000 // 10 minutes
 * }, (progress) => {
 *   console.log(`Progress: ${progress.message}`)
 * })
 */
export async function extractWithDocling(
  pdfPath: string,
  options: DoclingOptions = {},
  onProgress?: (progress: DoclingProgress) => void | Promise<void>
): Promise<DoclingResult> {
  const startTime = Date.now()

  // Validate PDF path
  const pdfAbsPath = path.resolve(pdfPath)
  const pdfExists = await fs.access(pdfAbsPath).then(() => true).catch(() => false)

  if (!pdfExists) {
    throw new Error(`PDF file not found: ${pdfAbsPath}`)
  }

  // Prepare options JSON
  const pythonOptions = {
    ocr: options.ocr || false,
    max_pages: options.maxPages,
    page_range: options.pageRange
  }

  const scriptPath = path.join(__dirname, '../scripts/docling_extract.py')
  const pythonPath = options.pythonPath || 'python3'
  const timeout = options.timeout || 30 * 60 * 1000 // 30 minutes default

  console.log('[Docling] Starting extraction...')
  console.log(`  PDF: ${pdfAbsPath}`)
  console.log(`  Options: ${JSON.stringify(pythonOptions)}`)

  return new Promise((resolve, reject) => {
    // Spawn Python process with unbuffered output (-u flag)
    const python = spawn(pythonPath, [
      '-u', // Unbuffered output for real-time progress
      scriptPath,
      pdfAbsPath,
      JSON.stringify(pythonOptions)
    ], {
      env: { ...process.env, PYTHONUNBUFFERED: '1' }
    })

    let stdout = ''
    let stderr = ''
    let timeoutHandle: NodeJS.Timeout

    // Set timeout
    timeoutHandle = setTimeout(() => {
      python.kill('SIGTERM')
      reject(new Error(`Docling extraction timeout after ${timeout}ms`))
    }, timeout)

    // Capture stdout (result JSON)
    python.stdout.on('data', (data: Buffer) => {
      const text = data.toString()
      stdout += text

      // Try to parse progress updates (one JSON per line)
      const lines = text.split('\n').filter(l => l.trim())
      for (const line of lines) {
        try {
          const json = JSON.parse(line)
          if (json.type === 'progress' && onProgress) {
            onProgress(json as DoclingProgress)
          }
        } catch {
          // Not JSON, ignore
        }
      }
    })

    // Capture stderr (errors)
    python.stderr.on('data', (data: Buffer) => {
      stderr += data.toString()
    })

    // Handle process exit
    python.on('close', (code) => {
      clearTimeout(timeoutHandle)

      if (code === 0) {
        // Success - parse final JSON result
        try {
          // Get last JSON object from stdout (final result)
          const lines = stdout.trim().split('\n')
          const lastLine = lines[lines.length - 1]
          const result = JSON.parse(lastLine)

          if (!result.success) {
            reject(new Error(result.error || 'Docling extraction failed'))
            return
          }

          const extractionTime = Date.now() - startTime

          console.log('[Docling] Extraction complete')
          console.log(`  Pages: ${result.pages}`)
          console.log(`  Markdown size: ${Math.round(result.markdown.length / 1024)}KB`)
          console.log(`  Time: ${(extractionTime / 1000).toFixed(1)}s`)

          resolve({
            markdown: result.markdown,
            pages: result.pages,
            metadata: result.metadata,
            extractionTime
          })
        } catch (parseError: any) {
          reject(new Error(`Failed to parse Docling output: ${parseError.message}\nOutput: ${stdout.slice(0, 500)}`))
        }
      } else {
        // Error
        let errorMessage = 'Docling extraction failed'

        // Try to parse structured error from stderr
        try {
          const errorJson = JSON.parse(stderr)
          errorMessage = errorJson.error || errorMessage
        } catch {
          // Not JSON, use raw stderr
          errorMessage = stderr || stdout || errorMessage
        }

        reject(new Error(`${errorMessage} (exit code ${code})`))
      }
    })

    // Handle spawn errors
    python.on('error', (error) => {
      clearTimeout(timeoutHandle)
      reject(new Error(`Failed to spawn Python process: ${error.message}`))
    })
  })
}

/**
 * Extract PDF from buffer (saves to temp file first).
 *
 * @param pdfBuffer - PDF file buffer
 * @param options - Extraction options
 * @param onProgress - Progress callback
 * @returns Extracted markdown and metadata
 */
export async function extractPdfBuffer(
  pdfBuffer: ArrayBuffer | Buffer,
  options: DoclingOptions = {},
  onProgress?: (progress: DoclingProgress) => void | Promise<void>
): Promise<DoclingResult> {
  // Save to temp file
  const tempDir = os.tmpdir()
  const tempPath = path.join(tempDir, `docling-${Date.now()}.pdf`)

  const buffer = Buffer.isBuffer(pdfBuffer) ? pdfBuffer : Buffer.from(pdfBuffer)
  await fs.writeFile(tempPath, buffer)

  console.log(`[Docling] Saved PDF to temp file: ${tempPath} (${Math.round(buffer.length / 1024)}KB)`)

  try {
    const result = await extractWithDocling(tempPath, options, onProgress)
    return result
  } finally {
    // Cleanup temp file
    await fs.unlink(tempPath).catch(() => {})
    console.log('[Docling] Cleaned up temp file')
  }
}
```

### Files to Modify

#### 1. `worker/processors/pdf-processor.ts`
**Changes:** Replace Gemini batch extraction with Docling (no fallback needed - this is the new way)

```typescript
// BEFORE (lines 60-87):
// Stage 2: Extract PDF with batching (15-40%)
await this.updateProgress(20, 'extract', 'processing', 'Extracting PDF content')

const extractionResult = await this.withRetry(
  async () => {
    return await extractLargePDF(
      this.ai,
      fileBuffer,
      (percent) => {
        const stagePercent = 20 + Math.floor(percent * 0.20)
        this.updateProgress(
          stagePercent,
          'extract',
          'processing',
          `${percent}% extracted`
        )
      }
    )
  },
  'PDF extraction'
)

let markdown = extractionResult.markdown

// AFTER:
// Stage 2: Extract PDF with Docling (15-50%)
await this.updateProgress(20, 'extract', 'processing', 'Extracting PDF with Docling')

import { extractPdfBuffer } from '../lib/docling-extractor.js'

const extractionResult = await this.withRetry(
  async () => {
    return await extractPdfBuffer(
      fileBuffer,
      {
        ocr: false, // Enable if needed for scanned PDFs
        timeout: 30 * 60 * 1000 // 30 minutes
      },
      async (progress) => {
        // Map Docling progress to our percentage
        if (progress.page && progress.totalPages) {
          const percent = Math.floor((progress.page / progress.totalPages) * 100)
          const stagePercent = 20 + Math.floor(percent * 0.30) // 20-50%
          await this.updateProgress(
            stagePercent,
            'extract',
            'processing',
            `Extracting page ${progress.page}/${progress.totalPages}`
          )
        }
      }
    )
  },
  'Docling PDF extraction'
)

let markdown = extractionResult.markdown
const markdownKB = Math.round(markdown.length / 1024)

console.log(`[PDFProcessor] Extracted ${extractionResult.pages} pages (${markdownKB}KB markdown)`)
console.log(`[PDFProcessor] Extraction time: ${(extractionResult.extractionTime / 1000).toFixed(1)}s`)

await this.updateProgress(50, 'extract', 'complete', 'PDF extraction done')
```

#### 2. `worker/package.json`
**Changes:** Add Python dependency check script

```json
{
  "scripts": {
    "dev": "tsx watch index.ts",
    "test": "jest",
    "validate:python": "python3 -c 'import docling; print(\"Docling version:\", docling.__version__)'"
  }
}
```

### Files to Delete

#### 1. `worker/lib/pdf-batch-utils.ts`
**Reason:** No longer needed - Docling handles extraction without batching

**Note:** Keep `worker/lib/fuzzy-matching.ts` - still used for annotation recovery

### New Dependencies

#### Python (Docling)
```bash
# Install Docling
pip install docling

# Pre-download AI models (saves time on first run)
docling-tools models download

# Verify installation
python3 -c "from docling.document_converter import DocumentConverter; print('Docling installed successfully')"
```

**Requirements:**
- Python 3.8+
- ~700MB disk space (models)
- Optional: CUDA for GPU acceleration (10-25x speedup)

---

## Migration Strategy

**Note:** This is a **personal tool** and **greenfield app** - no backward compatibility needed. We're replacing the old system entirely.

### Phase 1: Setup & Validation (2 hours)

**Tasks:**
1. Install Python dependencies
2. Create `worker/scripts/docling_extract.py`
3. Create `worker/lib/docling-extractor.ts`
4. Write integration tests

**Validation:**
```bash
# Test Python script directly
python3 worker/scripts/docling_extract.py test.pdf > output.json

# Test TypeScript integration
npm run test -- docling-extractor.test.ts

# Validate on small PDF
npm run test:docling-integration
```

### Phase 2: Replace PDF Processor (3 hours)

**Tasks:**
1. **Delete old batch extraction code** (`worker/lib/pdf-batch-utils.ts` - no longer needed)
2. Modify `worker/processors/pdf-processor.ts` (replace, not add fallback)
3. Test with various PDF types
4. Benchmark performance

**Testing:**
```bash
# Test with small PDF (10 pages)
npm run test:pdf-small

# Test with medium PDF (100 pages)
npm run test:pdf-medium

# Test with large PDF (426 pages from logs)
npm run test:pdf-large
```

### Phase 3: Ship It (30 minutes)

**Tasks:**
1. Restart worker: `npm run stop && npm run dev`
2. Test with a real PDF upload
3. Validate markdown extraction quality
4. Done!

**Metrics to Track:**
- Extraction success rate (should be ~100%)
- Average extraction time per page
- Cost per document

---

## Testing Strategy

### Unit Tests

#### `worker/lib/__tests__/docling-extractor.test.ts`
```typescript
describe('DoclingExtractor', () => {
  test('extracts simple PDF', async () => {
    const result = await extractWithDocling('test-fixtures/simple.pdf')
    expect(result.markdown).toContain('# Chapter 1')
    expect(result.pages).toBeGreaterThan(0)
  })

  test('handles timeout gracefully', async () => {
    await expect(
      extractWithDocling('test-fixtures/large.pdf', { timeout: 100 })
    ).rejects.toThrow('timeout')
  })

  test('handles missing file', async () => {
    await expect(
      extractWithDocling('nonexistent.pdf')
    ).rejects.toThrow('not found')
  })

  test('extracts from buffer', async () => {
    const buffer = await fs.readFile('test-fixtures/simple.pdf')
    const result = await extractPdfBuffer(buffer)
    expect(result.markdown).toBeTruthy()
  })
})
```

### Integration Tests

#### `worker/__tests__/pdf-processor-docling.test.ts`
```typescript
describe('PDFProcessor with Docling', () => {
  test('processes 426-page PDF successfully', async () => {
    const processor = new PDFProcessor(ai, supabase, job)
    const result = await processor.process()

    expect(result.chunks.length).toBeGreaterThan(300)
    expect(result.markdown).toBeTruthy()
  })

  test('uses raw markdown if AI cleanup fails', async () => {
    // Mock Gemini cleanup to fail
    jest.spyOn(ai, 'generateContent').mockRejectedValue(new Error('Network error'))

    const processor = new PDFProcessor(ai, supabase, job)
    const result = await processor.process()

    // Should still have markdown from Docling (fallback is built into processor)
    expect(result.markdown).toBeTruthy()
    expect(result.markdown).toContain('## ')
  })

  test('Docling extraction never fails from network issues', async () => {
    // This is the whole point - local extraction can't have network failures
    const processor = new PDFProcessor(ai, supabase, job)

    // Even if network is down, extraction succeeds
    const result = await processor.process()
    expect(result.markdown).toBeTruthy()
  })
})
```

### Performance Benchmarks

#### `worker/benchmarks/docling-performance.ts`
```typescript
async function benchmarkDocling() {
  const testPdfs = [
    { name: 'small', pages: 10, path: 'test-fixtures/10-pages.pdf' },
    { name: 'medium', pages: 100, path: 'test-fixtures/100-pages.pdf' },
    { name: 'large', pages: 426, path: 'test-fixtures/426-pages.pdf' }
  ]

  for (const pdf of testPdfs) {
    console.log(`\nBenchmarking ${pdf.name} (${pdf.pages} pages)...`)

    const start = Date.now()
    const result = await extractWithDocling(pdf.path)
    const duration = Date.now() - start

    const pagesPerSecond = pdf.pages / (duration / 1000)

    console.log(`  Time: ${(duration / 1000).toFixed(1)}s`)
    console.log(`  Speed: ${pagesPerSecond.toFixed(2)} pages/second`)
    console.log(`  Markdown: ${Math.round(result.markdown.length / 1024)}KB`)
  }
}
```

---

## Rollback Plan

**Note:** Since this is a personal tool with no users, rollback is simple.

### If Docling Doesn't Work

1. **Git revert:** `git revert <commit-hash>`
2. **Restart worker:** `npm run stop && npm run dev`
3. **Done**

No feature flags, no gradual rollout, no hybrid approaches - just replace the old system completely.

---

## Cost Analysis

### Current Costs (Gemini Only)

**500-page PDF:**
- Extraction: $0.60 (20 batches @ $0.03 each)
- Cleanup: $0.55 (optional)
- **Total: $0.60-$1.15 per document**

**Monthly (50 documents):**
- Total: $30-$57.50/month

### Proposed Costs (Docling + Gemini)

**500-page PDF:**
- Extraction: $0 (local Docling)
- Cleanup: $0.50 (single Gemini call, optional)
- **Total: $0-$0.50 per document**

**Monthly (50 documents):**
- Total: $0-$25/month
- **Savings: $30-$32.50/month (52-56% reduction)**

### Infrastructure Costs

**Self-Hosted Docling:**
- CPU-only: Existing infrastructure (no additional cost)
- GPU option: $0.50/hour (AWS g4dn.xlarge) = $12/month for 24 hours of processing
- **Net savings even with GPU: $18-$20/month**

---

## Success Metrics

### Key Performance Indicators (KPIs)

#### Reliability (Primary Goal)
- **Extraction success rate:** 99.5% (current: ~85%)
- **Zero batch failures:** 0% (current: ~15%)
- **Document availability:** 100% (current: ~85%)

#### Performance
- **Time per page:** < 2 seconds (current: variable)
- **426-page PDF:** < 15 minutes (current: 20-30 minutes)
- **User wait time:** < 10 minutes for 90% of docs

#### Cost
- **Cost per document:** < $0.60 (current: $0.60-$1.15)
- **Monthly savings:** > $30

### Monitoring Dashboards

**Metrics to Track:**
```typescript
// In processing logs
{
  extraction_method: 'docling' | 'gemini',
  extraction_time_ms: number,
  pages_processed: number,
  success: boolean,
  fallback_used: boolean,
  cost_estimate: number,
  error_type?: string
}
```

---

## Timeline

**Total: 6-8 hours (single afternoon)**

### Hour 1-2: Setup
- Install Python dependencies
- Create `docling_extract.py`
- Test with sample PDF

### Hour 3-5: Integration
- Create `docling-extractor.ts`
- Replace PDF processor code
- Delete old batch utils
- Write basic tests

### Hour 6-8: Testing & Deploy
- Test with 10, 100, 426 page PDFs
- Restart worker
- Process a real document
- Done!

### Success Criteria
- ✅ Python script extracts test PDF
- ✅ TypeScript bridge works
- ✅ 426-page PDF processes without failures
- ✅ Markdown quality is good
- ✅ Ship it!

---

## Open Questions

1. **OCR Support:** Do we need OCR for scanned PDFs? (adds 5-10x processing time)
2. **GPU Acceleration:** Should we use GPU for 10x speedup? (requires infrastructure changes)
3. **Batch Size:** Should we process very large PDFs in chunks? (e.g., 100 pages at a time)
4. **Fallback Strategy:** If Docling fails, do we fall back to Gemini? (adds complexity)

---

## References

### Documentation
- Docling Official Docs: https://docling-project.github.io/docling/
- Docling GitHub: https://github.com/DS4SD/docling
- IBM Research Paper: https://arxiv.org/html/2408.09869v4

### Research Files
- `/Users/topher/Code/rhizome-v2/docs/ai_docs/docling_patterns.md` (library research)
- Production logs showing batch failures (see Problem Statement)
- Current PDF processor: `worker/processors/pdf-processor.ts`
- Batch utilities: `worker/lib/pdf-batch-utils.ts`

---

## Next Steps

1. ✅ Research complete
2. ⏳ Review this implementation plan
3. ⏳ Get approval to proceed
4. ⏳ Install Python dependencies
5. ⏳ Create Docling scripts
6. ⏳ Integrate with PDF processor
7. ⏳ Test with production PDFs
8. ⏳ Deploy to staging
9. ⏳ Deploy to production

---

## Implementation Philosophy

**This is a greenfield personal tool - we can be aggressive:**

- ✅ **No backward compatibility** - replace old system entirely
- ✅ **No feature flags** - Docling is the new way, period
- ✅ **No gradual rollout** - just ship it and test
- ✅ **No hybrid approaches** - delete the old batch code
- ✅ **Simple rollback** - git revert if needed
- ✅ **Fast iteration** - 6-8 hours total, not 2 weeks

**The only user is you, so:**
- Test with real PDFs immediately
- Fix issues as they come up
- No need for complex deployment strategies
- Ship early, iterate fast

---

**Last Updated:** 2025-01-08
**Author:** Claude Code
**Status:** Ready for Implementation
**Philosophy:** Greenfield, no backward compatibility, ship fast
