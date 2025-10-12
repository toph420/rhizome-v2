# Phase 2: Docling Integration

## Overview
- **Tasks Covered**: Task 5-7 (Python Script Enhancement, TypeScript Wrapper, PDF Processor Integration)
- **Estimated Time**: 4-5 days
- **Risk Level**: Medium-High
- **Dependencies**: Phase 1 complete (Database, Python environment, Ollama setup)

## Prerequisites
- ✅ Phase 1 completed successfully
- ✅ Migration 045 applied (chunks table has new columns)
- ✅ Python packages installed (docling, pydantic-ai, etc.)
- ✅ Ollama running with Qwen 32B model
- Existing `worker/scripts/docling_extract.py` file
- Existing `worker/lib/docling-extractor.ts` TypeScript wrapper
- Existing `worker/processors/pdf-processor.ts` PDF pipeline

## Context & Background

### Feature Overview
This phase integrates Docling's HybridChunker to extract PDFs with rich structural metadata. Instead of just getting plain markdown, we now get:
- **Chunks at extraction time** (not after cleanup)
- **Page numbers** for accurate citations
- **Heading hierarchy** for table of contents
- **Bounding boxes** for PDF coordinate highlighting
- **Section markers** for EPUB support

This enables the "bulletproof matching" system in Phase 4 to remap chunks after AI cleanup with 100% recovery guarantee.

### Why This Matters
**Problem**: Current pipeline extracts markdown, then chunks AFTER cleanup. When markdown changes (OCR fixes, formatting cleanup), chunk positions become invalid, losing page numbers and citations.

**Solution**: Docling HybridChunker extracts chunks BEFORE cleanup, preserving structural metadata. Phase 4 will remap these chunks to cleaned markdown, keeping all metadata intact.

**Critical**: The tokenizer used in HybridChunker MUST match the embedding model (`Xenova/all-mpnet-base-v2`), or chunk sizes won't align with embedding context windows.

### Technical Context
From PRP lines 174-214, we follow existing patterns:
- **Python IPC**: `worker/lib/docling-extractor.ts:86-221` shows subprocess communication pattern
- **Progress Reporting**: PDF processor tracks stages 0-100% with status updates
- **Caching**: Job metadata stores extraction results to avoid reprocessing

## Tasks

### Task 5: Enhance Docling Python Script

**Files to Modify**:
- `worker/scripts/docling_extract.py`

**Pattern to Follow**:
- Existing DocumentConverter usage in current script
- Progress reporting via stdout (JSON messages)
- Error handling with try/catch and exit codes

#### Implementation Steps

**Step 1: Add HybridChunker Import and Options**

```python
# worker/scripts/docling_extract.py

import sys
import json
from pathlib import Path
from docling.document_converter import DocumentConverter
from docling.chunking import HybridChunker  # NEW
from docling.datamodel.base_models import InputFormat
from docling.datamodel.pipeline_options import PdfPipelineOptions

def extract_with_chunking(pdf_path: str, options: dict) -> dict:
    """
    Extract PDF with optional HybridChunker integration

    Args:
        pdf_path: Path to PDF file
        options: {
            'enable_chunking': bool,
            'chunk_size': int (default 512),
            'tokenizer': str (default 'Xenova/all-mpnet-base-v2')
        }

    Returns:
        {
            'markdown': str,
            'structure': dict,
            'chunks': list[dict] (if enable_chunking=True)
        }
    """

    # Initialize converter with progress reporting
    converter = DocumentConverter()

    # Convert document
    sys.stdout.write(json.dumps({
        'type': 'progress',
        'stage': 'extraction',
        'percent': 10,
        'message': 'Converting PDF with Docling'
    }) + '\n')
    sys.stdout.flush()  # CRITICAL: Must flush or Node.js will hang

    result = converter.convert(pdf_path)
    doc = result.document

    sys.stdout.write(json.dumps({
        'type': 'progress',
        'stage': 'extraction',
        'percent': 40,
        'message': 'Extraction complete'
    }) + '\n')
    sys.stdout.flush()

    # Export markdown (always needed)
    markdown = doc.export_to_markdown()

    # Extract structure (headings, hierarchy)
    structure = extract_document_structure(doc)

    sys.stdout.write(json.dumps({
        'type': 'progress',
        'stage': 'extraction',
        'percent': 50,
        'message': 'Extracted structure'
    }) + '\n')
    sys.stdout.flush()

    # Optionally run HybridChunker
    chunks = None
    if options.get('enable_chunking', False):
        sys.stdout.write(json.dumps({
            'type': 'progress',
            'stage': 'chunking',
            'percent': 60,
            'message': 'Running HybridChunker'
        }) + '\n')
        sys.stdout.flush()

        chunker = HybridChunker(
            tokenizer=options.get('tokenizer', 'Xenova/all-mpnet-base-v2'),
            max_tokens=options.get('chunk_size', 512),
            merge_peers=True  # Merge small adjacent chunks
        )

        chunks = []
        for idx, chunk in enumerate(chunker.chunk(doc)):
            chunk_data = {
                'index': idx,
                'content': chunk.text,
                'meta': extract_chunk_metadata(chunk, doc)
            }
            chunks.append(chunk_data)

        sys.stdout.write(json.dumps({
            'type': 'progress',
            'stage': 'chunking',
            'percent': 90,
            'message': f'Chunked into {len(chunks)} segments'
        }) + '\n')
        sys.stdout.flush()

    return {
        'markdown': markdown,
        'structure': structure,
        'chunks': chunks
    }


def extract_document_structure(doc) -> dict:
    """
    Extract heading hierarchy and structure from document

    Returns:
        {
            'headings': [{'level': int, 'text': str, 'page': int}],
            'total_pages': int,
            'sections': [...]
        }
    """
    structure = {
        'headings': [],
        'total_pages': 0,
        'sections': []
    }

    # Docling provides rich document structure
    # Extract headings from document hierarchy
    for item in doc.iterate_items():
        if item.label in ['title', 'heading', 'section_header']:
            structure['headings'].append({
                'level': item.level if hasattr(item, 'level') else 1,
                'text': item.text,
                'page': item.prov[0].page if item.prov else None
            })

    # Get total pages
    structure['total_pages'] = len(doc.pages) if hasattr(doc, 'pages') else 0

    return structure


def extract_chunk_metadata(chunk, doc) -> dict:
    """
    Extract rich metadata from Docling chunk

    Args:
        chunk: HybridChunker chunk object
        doc: Docling Document object

    Returns:
        {
            'page_start': int,
            'page_end': int,
            'heading_path': list[str],
            'heading_level': int,
            'section_marker': str,
            'bboxes': list[dict]
        }
    """
    meta = {
        'page_start': None,
        'page_end': None,
        'heading_path': [],
        'heading_level': None,
        'section_marker': None,
        'bboxes': []
    }

    # Extract page numbers from chunk provenance
    if hasattr(chunk, 'meta') and 'prov' in chunk.meta:
        prov = chunk.meta['prov']
        if prov:
            # Get first and last page numbers
            pages = [p.page for p in prov if hasattr(p, 'page')]
            if pages:
                meta['page_start'] = min(pages)
                meta['page_end'] = max(pages)

    # Extract heading path (e.g., ["Chapter 1", "Section 1.1"])
    if hasattr(chunk, 'meta') and 'headings' in chunk.meta:
        meta['heading_path'] = chunk.meta['headings']
        meta['heading_level'] = len(meta['heading_path'])

    # Extract bounding boxes for PDF highlighting
    if hasattr(chunk, 'meta') and 'prov' in chunk.meta:
        for prov in chunk.meta['prov']:
            if hasattr(prov, 'bbox') and hasattr(prov, 'page'):
                bbox = prov.bbox
                meta['bboxes'].append({
                    'page': prov.page,
                    'l': bbox.l,  # left
                    't': bbox.t,  # top
                    'r': bbox.r,  # right
                    'b': bbox.b   # bottom
                })

    # For EPUB support (future)
    # section_marker would be like "chapter_003" from EPUB spine

    return meta


def main():
    """Main entry point for script"""
    if len(sys.argv) < 2:
        print(json.dumps({'error': 'Usage: python docling_extract.py <pdf_path> [options_json]'}))
        sys.exit(1)

    pdf_path = sys.argv[1]
    options = json.loads(sys.argv[2]) if len(sys.argv) > 2 else {}

    try:
        result = extract_with_chunking(pdf_path, options)

        # Final output
        sys.stdout.write(json.dumps({
            'type': 'result',
            'data': result
        }) + '\n')
        sys.stdout.flush()

    except Exception as e:
        sys.stdout.write(json.dumps({
            'type': 'error',
            'error': str(e),
            'traceback': __import__('traceback').format_exc()
        }) + '\n')
        sys.stdout.flush()
        sys.exit(1)


if __name__ == '__main__':
    main()
```

#### Critical Gotchas

**GOTCHA 1: MUST Flush stdout After Every Write**
```python
# ❌ WRONG - Node.js will hang waiting for output
sys.stdout.write(json.dumps(message) + '\n')

# ✅ CORRECT - Flush immediately
sys.stdout.write(json.dumps(message) + '\n')
sys.stdout.flush()  # REQUIRED for IPC

# From PRP lines 282-286:
# "CRITICAL: Python stdout buffering breaks IPC
# Python scripts MUST flush after every JSON write"
```

**GOTCHA 2: Tokenizer MUST Match Embedding Model**
```python
# ❌ WRONG - Mismatched tokenizer
chunker = HybridChunker(tokenizer='bert-base-uncased')

# ✅ CORRECT - Matches Transformers.js embedding model
chunker = HybridChunker(tokenizer='Xenova/all-mpnet-base-v2')

# From PRP lines 288-292:
# "CRITICAL: Docling HybridChunker tokenizer MUST match embedding model
# Otherwise chunk sizes won't align with embedding context windows"
```

**GOTCHA 3: Chunk Provenance May Be Missing**
```python
# Not all chunks have provenance data
# Always check before accessing

if hasattr(chunk, 'meta') and 'prov' in chunk.meta:
    # Safe to access chunk.meta['prov']
else:
    # No provenance - use fallback values
    meta['page_start'] = None
```

**GOTCHA 4: Progress Messages Are Critical**
```python
# Node.js waits for progress updates to show UI feedback
# Send progress at key milestones: 10%, 40%, 60%, 90%

# Each message MUST include:
# - type: 'progress' | 'result' | 'error'
# - stage: 'extraction' | 'chunking'
# - percent: 0-100
# - message: Human-readable status
```

#### Validation

```bash
# Test script directly
cd worker/scripts

# Test without chunking
python docling_extract.py /path/to/test.pdf '{"enable_chunking": false}'
# Expected: JSON with markdown and structure, no chunks

# Test with chunking
python docling_extract.py /path/to/test.pdf '{"enable_chunking": true, "chunk_size": 512, "tokenizer": "Xenova/all-mpnet-base-v2"}'
# Expected: JSON with markdown, structure, AND chunks array

# Verify chunk structure
python docling_extract.py test.pdf '{"enable_chunking": true}' | jq '.data.chunks[0]'
# Expected output:
# {
#   "index": 0,
#   "content": "...",
#   "meta": {
#     "page_start": 1,
#     "page_end": 1,
#     "heading_path": ["Chapter 1"],
#     "heading_level": 1,
#     "bboxes": [{"page": 1, "l": 100, "t": 200, "r": 400, "b": 250}]
#   }
# }

# Test error handling
python docling_extract.py /nonexistent.pdf
# Expected: JSON error message with traceback

# Verify stdout flushing (check for hanging)
timeout 10s python docling_extract.py test.pdf '{"enable_chunking": true}'
# Should complete within 10 seconds, not hang
```

---

### Task 6: Update TypeScript Docling Wrapper

**Files to Modify**:
- `worker/lib/docling-extractor.ts`

**Pattern to Follow**:
- Existing `extractPdfBuffer()` function (lines 120-220)
- Subprocess spawning with stdin/stdout IPC
- Progress callback pattern

#### Implementation Steps

```typescript
// worker/lib/docling-extractor.ts

import { spawn } from 'child_process'
import path from 'path'
import fs from 'fs/promises'

// NEW: Options for Docling extraction
export interface DoclingOptions {
  enableChunking?: boolean
  chunkSize?: number
  tokenizer?: string
  onProgress?: (percent: number, stage: string, message: string) => void
}

// NEW: Chunk structure from Python
export interface DoclingChunk {
  index: number
  content: string
  meta: {
    page_start?: number
    page_end?: number
    heading_path?: string[]
    heading_level?: number
    section_marker?: string
    bboxes?: Array<{
      page: number
      l: number  // left
      t: number  // top
      r: number  // right
      b: number  // bottom
    }>
  }
}

// NEW: Structure from Python
export interface DoclingStructure {
  headings: Array<{
    level: number
    text: string
    page: number | null
  }>
  total_pages: number
  sections: any[]
}

// Updated return type
export interface DoclingExtractionResult {
  markdown: string
  structure: DoclingStructure
  chunks?: DoclingChunk[]  // Only present if enableChunking=true
}

/**
 * Extract PDF buffer using Docling Python script
 *
 * @param buffer - PDF file as ArrayBuffer
 * @param options - Chunking and progress options
 * @returns Extraction result with markdown, structure, and optional chunks
 */
export async function extractPdfBuffer(
  buffer: ArrayBuffer,
  options: DoclingOptions = {}
): Promise<DoclingExtractionResult> {
  const {
    enableChunking = false,
    chunkSize = 512,
    tokenizer = 'Xenova/all-mpnet-base-v2',
    onProgress
  } = options

  // Write buffer to temporary file (Docling needs file path)
  const tempPath = path.join('/tmp', `docling-${Date.now()}.pdf`)
  await fs.writeFile(tempPath, Buffer.from(buffer))

  try {
    const result = await runDoclingScript(tempPath, {
      enable_chunking: enableChunking,
      chunk_size: chunkSize,
      tokenizer
    }, onProgress)

    return result
  } finally {
    // Clean up temp file
    await fs.unlink(tempPath).catch(() => {})
  }
}

/**
 * Run Docling Python script via subprocess
 *
 * CRITICAL: Must handle progress messages and flush correctly
 * Pattern from existing code: worker/lib/docling-extractor.ts:120-220
 */
async function runDoclingScript(
  pdfPath: string,
  options: any,
  onProgress?: (percent: number, stage: string, message: string) => void
): Promise<DoclingExtractionResult> {
  const scriptPath = path.join(process.cwd(), 'worker/scripts/docling_extract.py')

  return new Promise((resolve, reject) => {
    const python = spawn('python', [
      '-u',  // Unbuffered output (critical for real-time progress)
      scriptPath,
      pdfPath,
      JSON.stringify(options)
    ], {
      stdio: ['ignore', 'pipe', 'pipe']
    })

    let stdoutData = ''
    let stderrData = ''
    let result: DoclingExtractionResult | null = null

    // Handle stdout (progress + final result)
    python.stdout.on('data', (data: Buffer) => {
      const lines = data.toString().split('\n').filter(line => line.trim())

      for (const line of lines) {
        try {
          const message = JSON.parse(line)

          if (message.type === 'progress' && onProgress) {
            onProgress(message.percent, message.stage, message.message)
          } else if (message.type === 'result') {
            result = message.data
          } else if (message.type === 'error') {
            reject(new Error(`Docling error: ${message.error}\n${message.traceback}`))
          }
        } catch (e) {
          // Not JSON, might be debug output - ignore
          stdoutData += line + '\n'
        }
      }
    })

    // Handle stderr (Python errors)
    python.stderr.on('data', (data: Buffer) => {
      stderrData += data.toString()
    })

    // Handle process exit
    python.on('close', (code) => {
      if (code === 0 && result) {
        resolve(result)
      } else if (code === 0 && !result) {
        reject(new Error('Docling script completed but returned no result'))
      } else {
        reject(new Error(
          `Docling script failed (exit ${code})\n` +
          `stderr: ${stderrData}\n` +
          `stdout: ${stdoutData}`
        ))
      }
    })

    // Handle process errors (e.g., Python not found)
    python.on('error', (error) => {
      reject(new Error(`Failed to spawn Python process: ${error.message}`))
    })

    // Timeout after 10 minutes (large PDFs can be slow)
    const timeout = setTimeout(() => {
      python.kill()
      reject(new Error('Docling extraction timeout (10 minutes)'))
    }, 10 * 60 * 1000)

    python.on('close', () => {
      clearTimeout(timeout)
    })
  })
}

/**
 * Validate Docling chunks have required metadata
 * Useful for debugging and ensuring data quality
 */
export function validateDoclingChunks(chunks: DoclingChunk[]): {
  valid: boolean
  errors: string[]
} {
  const errors: string[] = []

  for (const chunk of chunks) {
    if (!chunk.content || chunk.content.length === 0) {
      errors.push(`Chunk ${chunk.index} has no content`)
    }
    if (chunk.meta.page_start === null && chunk.meta.page_end === null) {
      errors.push(`Chunk ${chunk.index} missing page numbers`)
    }
    if (!chunk.meta.heading_path || chunk.meta.heading_path.length === 0) {
      errors.push(`Chunk ${chunk.index} missing heading path`)
    }
  }

  return {
    valid: errors.length === 0,
    errors
  }
}
```

#### Critical Gotchas

**GOTCHA 1: Subprocess Timeout Handling**
```typescript
// Large PDFs can take 5-10 minutes
// Timeout must be generous but not infinite

const timeout = setTimeout(() => {
  python.kill()
  reject(new Error('Timeout after 10 minutes'))
}, 10 * 60 * 1000)  // 10 minutes

// Always clear timeout on completion
python.on('close', () => clearTimeout(timeout))
```

**GOTCHA 2: -u Flag Is Critical**
```typescript
// ❌ WRONG - Python buffers output
const python = spawn('python', [scriptPath, pdfPath])

// ✅ CORRECT - Unbuffered for real-time progress
const python = spawn('python', ['-u', scriptPath, pdfPath])

// Without -u, progress messages arrive in large batches
// UI appears frozen even though processing is happening
```

**GOTCHA 3: Error Handling for Missing Python**
```typescript
python.on('error', (error) => {
  if (error.message.includes('ENOENT')) {
    reject(new Error(
      'Python not found. Install Python 3.10+ and ensure it is in PATH'
    ))
  } else {
    reject(new Error(`Process error: ${error.message}`))
  }
})
```

**GOTCHA 4: Temporary File Cleanup**
```typescript
// Always clean up temp files, even if extraction fails
try {
  const result = await runDoclingScript(tempPath, options, onProgress)
  return result
} finally {
  // This runs whether success or error
  await fs.unlink(tempPath).catch(() => {})
}
```

#### Validation

```bash
# Create test file
cat > worker/lib/__tests__/docling-extractor.test.ts << 'EOF'
import { extractPdfBuffer, validateDoclingChunks } from '../docling-extractor'
import fs from 'fs/promises'

describe('Docling Extractor', () => {
  it('extracts PDF without chunking', async () => {
    const buffer = await fs.readFile('test-fixtures/sample.pdf')

    const result = await extractPdfBuffer(buffer.buffer, {
      enableChunking: false
    })

    expect(result.markdown).toBeDefined()
    expect(result.structure).toBeDefined()
    expect(result.chunks).toBeUndefined()
  })

  it('extracts PDF with chunking', async () => {
    const buffer = await fs.readFile('test-fixtures/sample.pdf')

    const result = await extractPdfBuffer(buffer.buffer, {
      enableChunking: true,
      chunkSize: 512,
      tokenizer: 'Xenova/all-mpnet-base-v2'
    })

    expect(result.chunks).toBeDefined()
    expect(result.chunks!.length).toBeGreaterThan(0)

    const firstChunk = result.chunks![0]
    expect(firstChunk.content).toBeDefined()
    expect(firstChunk.meta.page_start).toBeDefined()
  })

  it('validates chunk metadata', async () => {
    const buffer = await fs.readFile('test-fixtures/sample.pdf')
    const result = await extractPdfBuffer(buffer.buffer, { enableChunking: true })

    const validation = validateDoclingChunks(result.chunks!)
    expect(validation.valid).toBe(true)
    expect(validation.errors).toHaveLength(0)
  })

  it('reports progress during extraction', async () => {
    const buffer = await fs.readFile('test-fixtures/sample.pdf')
    const progressEvents: any[] = []

    await extractPdfBuffer(buffer.buffer, {
      enableChunking: true,
      onProgress: (percent, stage, message) => {
        progressEvents.push({ percent, stage, message })
      }
    })

    expect(progressEvents.length).toBeGreaterThan(0)
    expect(progressEvents[0].percent).toBeLessThan(100)
  })
})
EOF

# Run tests
cd worker
npm test -- docling-extractor.test.ts

# Expected: All tests pass
```

---

### Task 7: Update PDF Processor for Local Mode

**Files to Modify**:
- `worker/processors/pdf-processor.ts`

**Pattern to Follow**:
- Existing `process()` method with stages
- Job metadata caching pattern (lines 48-159 in continue-processing.ts)
- Progress tracking with `updateProgress()`

#### Implementation Steps

**Step 1: Add Local Mode Check and Docling Call**

```typescript
// worker/processors/pdf-processor.ts

import { extractPdfBuffer, DoclingChunk } from '../lib/docling-extractor'
import type { ProcessResult } from './base'

export class PdfProcessor extends SourceProcessor {
  async process(): Promise<ProcessResult> {
    const isLocalMode = process.env.PROCESSING_MODE === 'local'

    console.log(`[PDF] Processing mode: ${isLocalMode ? 'LOCAL' : 'CLOUD'}`)

    // Stage 1: Docling Extraction (0-50%)
    await this.updateProgress(5, 'extraction', 'processing', 'Starting PDF extraction')

    // Check cache first
    const cached = this.job.metadata?.cached_extraction
    if (cached) {
      console.log('[PDF] Using cached extraction result')
      return this.continueFromCache(cached)
    }

    // Extract PDF with Docling
    const extractionResult = await extractPdfBuffer(
      this.fileBuffer,
      {
        enableChunking: isLocalMode,  // Only chunk in local mode
        chunkSize: 512,
        tokenizer: 'Xenova/all-mpnet-base-v2',
        onProgress: (percent, stage, message) => {
          // Map Docling progress (0-100) to our stage (5-50)
          const ourPercent = 5 + Math.floor(percent * 0.45)
          this.updateProgress(ourPercent, 'extraction', 'processing', message)
        }
      }
    )

    await this.updateProgress(50, 'extraction', 'complete', 'PDF extraction done')

    // Cache extraction result in job metadata
    // This prevents re-extracting if AI cleanup fails
    this.job.metadata = {
      ...this.job.metadata,
      cached_extraction: {
        markdown: extractionResult.markdown,
        structure: extractionResult.structure,
        doclingChunks: extractionResult.chunks  // NEW: Cache chunks for matching
      }
    }

    let markdown = extractionResult.markdown

    // Stage 2: Regex cleanup (50-55%)
    // ... existing regex cleanup code ...

    // Stage 3: Review checkpoint (optional - 55%)
    const reviewDoclingExtraction = this.job.input_data?.reviewDoclingExtraction
    if (reviewDoclingExtraction) {
      // This is handled in Phase 7
      return await this.pauseForReview('docling_extraction', markdown)
    }

    // Continue with AI cleanup, chunking, etc.
    // Stages 4-10 remain the same for now
    // Phase 3 will modify AI cleanup stage
    // Phase 4 will add bulletproof matching stage

    return {
      markdown,
      chunks: [],  // Populated in later stages
      metadata: {
        structure: extractionResult.structure,
        docling_chunks_count: extractionResult.chunks?.length || 0
      }
    }
  }

  /**
   * Resume processing from cached extraction
   * Used when job is retried or resumed from review
   */
  private async continueFromCache(cached: any): Promise<ProcessResult> {
    console.log('[PDF] Continuing from cached extraction')

    // Restore state from cache
    const markdown = cached.markdown
    const structure = cached.structure
    const doclingChunks = cached.doclingChunks

    // Skip extraction stage, continue from where we left off
    await this.updateProgress(50, 'extraction', 'complete', 'Using cached extraction')

    // Continue with remaining stages...
    return this.continueProcessing(markdown, structure, doclingChunks)
  }

  /**
   * Pause processing for manual review
   * Sets document status to awaiting_manual_review
   */
  private async pauseForReview(
    reviewStage: string,
    markdown: string
  ): Promise<ProcessResult> {
    console.log(`[PDF] Pausing for review at stage: ${reviewStage}`)

    // Export to Obsidian for review
    await this.exportToObsidian(markdown)

    // Update document status
    await this.supabase
      .from('documents')
      .update({
        processing_status: 'awaiting_manual_review',
        review_stage: reviewStage
      })
      .eq('id', this.job.document_id)

    return {
      markdown,
      chunks: [],
      metadata: {
        review_stage: reviewStage,
        awaiting_user_decision: true
      }
    }
  }
}
```

**Step 2: Store Docling Chunks in Job Metadata**

```typescript
// The key insight: Docling chunks are cached in job metadata
// Phase 4 will retrieve these and remap to cleaned markdown

interface JobMetadata {
  cached_extraction?: {
    markdown: string
    structure: DoclingStructure
    doclingChunks: DoclingChunk[]  // NEW: Stored for bulletproof matching
  }
  // ... other metadata
}

// Why cache chunks?
// 1. If AI cleanup fails, don't re-extract (expensive)
// 2. Phase 4 needs BOTH Docling chunks AND cleaned markdown
// 3. Chunks contain structural metadata that must be preserved
```

#### Critical Gotchas

**GOTCHA 1: Local Mode vs Cloud Mode**
```typescript
// PROCESSING_MODE env var controls behavior
// local: Use Docling chunking + Ollama + local embeddings
// cloud: Use existing Gemini pipeline

const isLocalMode = process.env.PROCESSING_MODE === 'local'

// If not set, default to cloud mode (backward compatible)
if (!process.env.PROCESSING_MODE) {
  console.warn('[PDF] PROCESSING_MODE not set, defaulting to cloud')
}
```

**GOTCHA 2: Cache Must Include Docling Chunks**
```typescript
// ❌ WRONG - Chunks lost if AI cleanup retries
this.job.metadata.cached_extraction = {
  markdown: result.markdown,
  structure: result.structure
  // Missing: doclingChunks!
}

// ✅ CORRECT - Chunks preserved for Phase 4 matching
this.job.metadata.cached_extraction = {
  markdown: result.markdown,
  structure: result.structure,
  doclingChunks: result.chunks  // CRITICAL for bulletproof matching
}
```

**GOTCHA 3: Progress Mapping**
```typescript
// Docling reports 0-100%
// Our PDF processor uses stages 0-100% across entire pipeline
// Map Docling progress to extraction stage (5-50%)

onProgress: (percent, stage, message) => {
  // Scale Docling's 0-100 to our 5-50
  const ourPercent = 5 + Math.floor(percent * 0.45)
  this.updateProgress(ourPercent, 'extraction', 'processing', message)
}
```

**GOTCHA 4: Pattern from Existing Code**
```typescript
// From worker/handlers/continue-processing.ts:48-159
// Shows how to:
// 1. Check review_stage to determine where user paused
// 2. Resume processing from cached state
// 3. Update document status correctly

// Mirror this pattern for review checkpoint handling
```

#### Validation

```bash
# Set local mode
export PROCESSING_MODE=local

# Start worker
cd worker && npm run dev

# In another terminal, trigger PDF processing
# Upload a small PDF via UI or use test script

# Check logs for:
# - "[PDF] Processing mode: LOCAL"
# - "[PDF] Starting PDF extraction"
# - Progress messages from Docling (10%, 40%, 60%, 90%)
# - "[PDF] Extraction done"
# - "[PDF] Cached extraction result"

# Verify job metadata in database
npx supabase db execute "
  SELECT metadata->'cached_extraction'->'doclingChunks'
  FROM background_jobs
  WHERE job_type = 'process_document'
  ORDER BY created_at DESC
  LIMIT 1;
"
# Expected: Array of chunks with page_start, heading_path, etc.

# Test cloud mode fallback
unset PROCESSING_MODE
cd worker && npm run dev
# Upload PDF - should use existing Gemini pipeline
# Logs should show: "[PDF] Processing mode: CLOUD"
```

---

## Integration Points

### Database
- No schema changes in this phase (uses migration 045 from Phase 1)
- Job metadata stores Docling chunks for Phase 4
- Document table review_stage tracks review checkpoints

### Python Scripts
- `worker/scripts/docling_extract.py` - Enhanced with HybridChunker
- Communicates via JSON over stdout/stdin
- Returns markdown + structure + chunks

### TypeScript Worker
- `worker/lib/docling-extractor.ts` - TypeScript wrapper for Python script
- `worker/processors/pdf-processor.ts` - PDF processing orchestration
- Uses subprocess IPC pattern for Python integration

### Environment Variables
- `PROCESSING_MODE=local` - Enables local pipeline
- No new variables in this phase (Ollama vars from Phase 1)

## External References

### Documentation Links
- **Docling HybridChunker**: https://docling-project.github.io/docling/examples/hybrid_chunking/
- **Docling PyPI**: https://pypi.org/project/docling/
- **Tokenizer Alignment**: https://huggingface.co/sentence-transformers/all-mpnet-base-v2

### Codebase References
- **Python IPC Pattern**: `worker/lib/docling-extractor.ts:86-221`
- **Job Metadata Caching**: `worker/handlers/continue-processing.ts:48-159`
- **Progress Tracking**: `worker/handlers/process-document.ts` (stages + caching)
- **Batching Strategy**: `worker/lib/markdown-cleanup-ai.ts:85-140`

## Validation Checklist

- [ ] Python script accepts enable_chunking option
- [ ] Python script returns chunks with metadata
- [ ] Python script sends progress messages
- [ ] Python script flushes stdout after every write
- [ ] TypeScript wrapper handles progress callbacks
- [ ] TypeScript wrapper parses chunks correctly
- [ ] PDF processor checks PROCESSING_MODE env var
- [ ] PDF processor enables chunking in local mode
- [ ] PDF processor caches doclingChunks in job metadata
- [ ] Chunks have page_start, heading_path, bboxes
- [ ] Tokenizer matches Xenova/all-mpnet-base-v2
- [ ] No TypeScript errors (`cd worker && npm run type-check`)
- [ ] Integration test passes with sample PDF

## Success Criteria

✅ **Python Script Enhanced**
- HybridChunker integrated and working
- Chunks include all metadata (pages, headings, bboxes)
- Progress reporting works correctly
- No hanging or timeout issues

✅ **TypeScript Wrapper Updated**
- Accepts enableChunking option
- Parses chunks from Python output
- Progress callbacks work
- Error handling for subprocess failures

✅ **PDF Processor Integrated**
- Checks PROCESSING_MODE environment variable
- Calls Docling with chunking in local mode
- Caches doclingChunks in job metadata
- Stage progression works (0-50% for extraction)

✅ **Ready for Phase 3**
- Docling chunks available for matching
- Structural metadata preserved
- No blockers for Ollama cleanup integration

---

## Notes & Additional Context

### Why Cache Docling Chunks?
Phase 4 (Bulletproof Matching) needs BOTH:
1. **Docling chunks** (with original positions and metadata)
2. **Cleaned markdown** (after AI cleanup)

By caching chunks in job metadata, we avoid re-extracting if:
- AI cleanup fails and needs retry
- User reviews extraction and continues
- Matching stage needs to run multiple times

### Chunk Metadata Explained
Each chunk has rich metadata from Docling:

```typescript
{
  page_start: 5,           // For citations: "See page 5"
  page_end: 5,             // Usually same page, sometimes spans
  heading_path: [          // For table of contents
    "Chapter 2",
    "Section 2.1",
    "Subsection 2.1.1"
  ],
  heading_level: 3,        // Depth in TOC (1 = top level)
  bboxes: [                // For PDF coordinate highlighting
    { page: 5, l: 72, t: 200, r: 540, b: 250 }
  ]
}
```

This metadata survives the entire pipeline, even after AI cleanup changes the text.

### Performance Expectations
From PRP line 59: "Target Performance: 40-80 min per 500-page book (with LLM cleanup), ~25 min without"

Docling extraction stage:
- **Small PDFs (<50 pages)**: 1-2 minutes
- **Large PDFs (500 pages)**: 5-10 minutes
- **With HybridChunker**: +1-2 minutes overhead

### Tokenizer Alignment Critical
From PRP lines 288-292:
> "CRITICAL: Docling HybridChunker tokenizer MUST match embedding model
> Otherwise chunk sizes won't align with embedding context windows"

HybridChunker: `tokenizer='Xenova/all-mpnet-base-v2'`
Transformers.js: `pipeline('feature-extraction', 'Xenova/all-mpnet-base-v2')`

MUST be the same model name.

### Next Steps
After completing Phase 2, proceed to:
- **Phase 3**: Local LLM Cleanup (Tasks 8-9)
- Uses OllamaClient from Phase 1
- Uses cached markdown from Phase 2
- Sets up AI cleanup before Phase 4 matching
