# Phase 5: EPUB Docling Integration

## Overview
- **Tasks Covered**: Task 16-20 (EPUB HTML extraction, Docling processing, processor integration)
- **Estimated Time**: 3-5 days
- **Risk Level**: Low-Medium (proven patterns from PDF pipeline)
- **Dependencies**: Phase 4 (Bulletproof Matching must be proven with PDFs)

## Prerequisites
- ✅ Phase 1-3 completed (Core infrastructure, Docling, Ollama cleanup)
- ✅ Phase 4 completed (Bulletproof matching validated with PDFs)
- Existing `epub-parser.ts` (jszip-based EPUB extraction)

## Context & Background

### Feature Overview
Extend local processing pipeline to EPUBs using Docling for structural metadata extraction. EPUBs follow same pipeline as PDFs but use HTML as intermediate format and section markers instead of page numbers.

**Key Differences from PDF:**
- Input: EPUB file → HTML (via jszip)
- No page numbers (use section_marker)
- No bounding boxes (HTML doesn't have PDF coordinates)
- Heading hierarchy preserved
- Section markers for bulletproof matching

### Why This Matters
- **Consistency**: Both PDFs and EPUBs use same local pipeline
- **Cost**: EPUB cleanup $0.60 → $0.00 (eliminates Gemini dependency)
- **Metadata**: EPUBs get structural metadata (headings, hierarchy, sections)
- **Matching**: EPUBs benefit from bulletproof matching (100% chunk recovery)

## Tasks

### Task 16: Python EPUB-to-HTML Docling Script

**Files to Create**:
- `worker/scripts/docling_extract_epub.py`

**Pattern to Follow**:
- `worker/scripts/docling_extract.py` (PDF version from Phase 2)
- Same HybridChunker approach
- Same progress reporting pattern

#### Implementation Steps

```python
#!/usr/bin/env python3
"""
Docling-based EPUB extraction via HTML processing.
EPUBs have NO page numbers - use section markers instead.
"""
import sys
import json
from docling.document_converter import DocumentConverter
from docling.chunking import HybridChunker
import tempfile
import os

def extract_epub_html(html_content: str, options: dict = None) -> dict:
    """Extract EPUB HTML with Docling."""
    options = options or {}

    # Save HTML to temp file for Docling
    with tempfile.NamedTemporaryFile(mode='w', suffix='.html', delete=False, encoding='utf-8') as f:
        f.write(html_content)
        temp_html_path = f.name

    try:
        print(json.dumps({
            'type': 'progress',
            'status': 'extracting',
            'message': 'Processing HTML with Docling',
            'progress': 30
        }), flush=True)

        # Convert HTML with Docling
        converter = DocumentConverter()
        result = converter.convert(temp_html_path)
        doc = result.document

        # Export to markdown
        markdown = doc.export_to_markdown()

        print(json.dumps({
            'type': 'progress',
            'status': 'chunking',
            'message': 'Creating semantic chunks',
            'progress': 50
        }), flush=True)

        # Create chunks with HybridChunker
        # CRITICAL: Must use same tokenizer as embeddings (Phase 1)
        chunker = HybridChunker(
            tokenizer=options.get('tokenizer', 'Xenova/all-mpnet-base-v2'),
            max_tokens=options.get('chunk_size', 512),
            merge_peers=True,
            heading_as_metadata=True
        )

        chunk_iter = chunker.chunk(doc)
        chunks = []

        for idx, chunk in enumerate(chunk_iter):
            # EPUB has NO page numbers - use section markers
            section_marker = f"section_{idx:03d}"
            if chunk.meta.headings:
                # Use heading as section marker (e.g., "chapter_03_introduction")
                heading_slug = chunk.meta.headings[-1].lower()
                heading_slug = heading_slug.replace(' ', '_').replace('-', '_')
                section_marker = heading_slug[:50]  # Max 50 chars

            chunk_data = {
                'chunk_index': idx,
                'content': chunk.text,
                'start_offset': chunk.meta.doc_items[0].self_ref.start if chunk.meta.doc_items else 0,
                'end_offset': chunk.meta.doc_items[-1].self_ref.end if chunk.meta.doc_items else len(chunk.text),
                'tokens': len(chunk.text.split()),

                # CRITICAL: EPUBs have NO page numbers
                'page_start': None,
                'page_end': None,

                # Structure metadata (same as PDF)
                'heading': chunk.meta.headings[-1] if chunk.meta.headings else None,
                'heading_path': chunk.meta.headings if chunk.meta.headings else [],
                'heading_level': len(chunk.meta.headings) if chunk.meta.headings else 0,
                'section_marker': section_marker,

                # CRITICAL: EPUBs have NO bboxes
                'bboxes': None
            }
            chunks.append(chunk_data)

        structure = extract_html_structure(doc)

        print(json.dumps({
            'type': 'progress',
            'status': 'complete',
            'message': 'Extraction complete',
            'progress': 100
        }), flush=True)

        return {
            'markdown': markdown,
            'structure': structure,
            'chunks': chunks,
            'metadata': {
                'source_format': 'epub',
                'extraction_method': 'docling',
                'chunk_count': len(chunks),
                'word_count': len(markdown.split())
            }
        }

    finally:
        os.unlink(temp_html_path)

def extract_html_structure(doc) -> dict:
    """Extract document structure from HTML."""
    structure = {
        'sections': [],
        'headings': [],
        'tables': [],
        'lists': []
    }

    for item in doc.body:
        # Extract headings
        if hasattr(item, 'label') and 'title' in item.label.lower():
            level = int(item.label.replace('title_', '')) if 'title_' in item.label else 1
            structure['headings'].append({
                'text': item.text,
                'level': level
            })
            structure['sections'].append({
                'title': item.text,
                'level': level
            })

        # Extract tables
        elif 'Table' in item.__class__.__name__:
            structure['tables'].append({
                'content': item.export_to_markdown()
            })

        # Extract lists
        elif hasattr(item, 'label') and 'list' in item.label.lower():
            structure['lists'].append({
                'type': 'ordered' if 'ol' in str(item).lower() else 'unordered'
            })

    return structure

if __name__ == '__main__':
    # Read HTML from stdin
    html_content = sys.stdin.read()

    # Parse options from command line
    options = json.loads(sys.argv[1]) if len(sys.argv) > 1 else {}

    # Extract and output result
    result = extract_epub_html(html_content, options)
    print(json.dumps(result))
    sys.stdout.flush()  # CRITICAL: Must flush for Node.js IPC
```

#### Critical Gotchas

**GOTCHA 1: No Page Numbers for EPUBs**
```python
# From task specification:
# EPUBs have NO page numbers - use section_marker instead

# ❌ WRONG - Don't try to infer page numbers
chunk_data['page_start'] = chunk_index * 10  # NO!

# ✅ CORRECT - Set to None
chunk_data['page_start'] = None
chunk_data['page_end'] = None
chunk_data['section_marker'] = heading_slug
```

**GOTCHA 2: Section Marker Generation**
```python
# From heading: "Chapter 3: Introduction to Physics"
# Generate slug: "chapter_3_introduction_to_physics"

heading_slug = heading.lower()
heading_slug = heading_slug.replace(' ', '_').replace('-', '_')
heading_slug = ''.join(c for c in heading_slug if c.isalnum() or c == '_')
section_marker = heading_slug[:50]  # Limit length
```

**GOTCHA 3: HTML Encoding**
```python
# EPUB HTML may have various encodings
# Must open temp file with UTF-8 encoding

with tempfile.NamedTemporaryFile(mode='w', suffix='.html', delete=False, encoding='utf-8') as f:
    f.write(html_content)
```

#### Validation

```bash
# Unit test with sample HTML
cat > test_epub.html << 'EOF'
<html>
<body>
<h1>Chapter 1</h1>
<p>First chapter content here.</p>
<h2>Section 1.1</h2>
<p>Section content.</p>
</body>
</html>
EOF

echo '{"tokenizer": "Xenova/all-mpnet-base-v2", "chunk_size": 512}' | \
  python3 worker/scripts/docling_extract_epub.py < test_epub.html | jq .

# Verify output has:
# - markdown field
# - chunks array with section_marker
# - NO page_start/page_end (should be null)
# - structure with headings
```

---

### Task 17: TypeScript EPUB-to-HTML Extractor

**Files to Create**:
- `worker/lib/epub/epub-docling-extractor.ts`

**Pattern to Follow**:
- `worker/lib/epub/epub-parser.ts` (existing EPUB extraction)
- `worker/lib/docling-extractor.ts` (Docling wrapper pattern from Phase 2)

#### Implementation Steps

```typescript
/**
 * EPUB to HTML extractor for Docling processing
 *
 * Extracts EPUB structure, concatenates HTML in spine order,
 * then feeds to Docling Python script for processing.
 */

import JSZip from 'jszip'
import { spawn } from 'child_process'
import path from 'path'

interface EpubMetadata {
  title?: string
  author?: string
  publisher?: string
  isbn?: string
  language?: string
  description?: string
}

interface EpubToHtmlResult {
  html: string
  metadata: EpubMetadata
  spine: string[]
}

interface DoclingChunk {
  chunk_index: number
  content: string
  start_offset: number
  end_offset: number
  tokens: number
  page_start: null  // Always null for EPUB
  page_end: null    // Always null for EPUB
  heading: string | null
  heading_path: string[]
  heading_level: number
  section_marker: string
  bboxes: null      // Always null for EPUB
}

interface DoclingStructure {
  sections: Array<{ title: string; level: number }>
  headings: Array<{ text: string; level: number }>
  tables: Array<{ content: string }>
  lists: Array<{ type: 'ordered' | 'unordered' }>
}

interface DoclingEpubResult {
  markdown: string
  structure: DoclingStructure
  chunks: DoclingChunk[]
  metadata: {
    source_format: 'epub'
    extraction_method: 'docling'
    chunk_count: number
    word_count: number
  }
}

/**
 * Extract EPUB to unified HTML
 * Pattern from: worker/lib/epub/epub-parser.ts
 */
export async function extractEpubToHtml(
  epubBuffer: ArrayBuffer
): Promise<EpubToHtmlResult> {
  const zip = await JSZip.loadAsync(epubBuffer)

  // Parse container.xml to find content.opf
  const containerXml = await zip.file('META-INF/container.xml')?.async('text')
  if (!containerXml) throw new Error('Invalid EPUB: missing container.xml')

  const opfPathMatch = containerXml.match(/full-path="([^"]+)"/)
  if (!opfPathMatch) throw new Error('Invalid EPUB: cannot find OPF path')

  const opfPath = opfPathMatch[1]
  const opfDir = opfPath.substring(0, opfPath.lastIndexOf('/'))

  // Parse content.opf for metadata and spine
  const opfXml = await zip.file(opfPath)?.async('text')
  if (!opfXml) throw new Error('Invalid EPUB: missing content.opf')

  // Extract metadata
  const metadata: EpubMetadata = {
    title: opfXml.match(/<dc:title[^>]*>([^<]+)<\/dc:title>/)?.[1],
    author: opfXml.match(/<dc:creator[^>]*>([^<]+)<\/dc:creator>/)?.[1],
    publisher: opfXml.match(/<dc:publisher[^>]*>([^<]+)<\/dc:publisher>/)?.[1],
    isbn: opfXml.match(/<dc:identifier[^>]*>([^<]+)<\/dc:identifier>/)?.[1],
    language: opfXml.match(/<dc:language[^>]*>([^<]+)<\/dc:language>/)?.[1],
    description: opfXml.match(/<dc:description[^>]*>([^<]+)<\/dc:description>/)?.[1]
  }

  // Extract spine order (reading sequence)
  const spineItems: string[] = []
  const spineMatches = opfXml.matchAll(/<itemref[^>]*idref="([^"]+)"/g)

  for (const match of spineMatches) {
    const idref = match[1]
    const hrefMatch = opfXml.match(new RegExp(`<item[^>]*id="${idref}"[^>]*href="([^"]+)"`))
    if (hrefMatch) {
      const href = hrefMatch[1]
      spineItems.push(opfDir ? `${opfDir}/${href}` : href)
    }
  }

  // Extract HTML files in spine order
  const htmlChunks: string[] = []

  for (const spineItem of spineItems) {
    const htmlContent = await zip.file(spineItem)?.async('text')
    if (htmlContent) {
      htmlChunks.push(htmlContent)
    }
  }

  // Concatenate with chapter break markers
  const unifiedHtml = htmlChunks.join('\n<!-- CHAPTER_BREAK -->\n')

  return {
    html: unifiedHtml,
    metadata,
    spine: spineItems
  }
}

/**
 * Process EPUB HTML with Docling Python script
 * Pattern from: worker/lib/docling-extractor.ts
 */
export async function processEpubWithDocling(
  html: string,
  options: {
    tokenizer?: string
    chunkSize?: number
    onProgress?: (percent: number, stage: string, message: string) => void
  } = {}
): Promise<DoclingEpubResult> {
  const {
    tokenizer = 'Xenova/all-mpnet-base-v2',
    chunkSize = 512,
    onProgress
  } = options

  return new Promise((resolve, reject) => {
    const scriptPath = path.join(process.cwd(), 'scripts', 'docling_extract_epub.py')
    const scriptOptions = JSON.stringify({ tokenizer, chunk_size: chunkSize })

    const pythonProcess = spawn('python3', [scriptPath, scriptOptions], {
      stdio: ['pipe', 'pipe', 'pipe']
    })

    let stdout = ''
    let stderr = ''

    pythonProcess.stdout.on('data', (data) => {
      const lines = data.toString().split('\n')

      for (const line of lines) {
        if (!line.trim()) continue

        try {
          const parsed = JSON.parse(line)

          // Progress updates
          if (parsed.type === 'progress') {
            onProgress?.(parsed.progress, parsed.status, parsed.message)
          }
          // Final result
          else if (parsed.markdown) {
            stdout += line
          }
        } catch {
          stdout += line
        }
      }
    })

    pythonProcess.stderr.on('data', (data) => {
      stderr += data.toString()
    })

    pythonProcess.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`Docling EPUB extraction failed: ${stderr}`))
        return
      }

      try {
        const result = JSON.parse(stdout)
        resolve(result as DoclingEpubResult)
      } catch (error) {
        reject(new Error(`Failed to parse Docling output: ${error}`))
      }
    })

    // Write HTML to Python process stdin
    pythonProcess.stdin.write(html)
    pythonProcess.stdin.end()
  })
}

/**
 * Complete EPUB extraction pipeline: EPUB → HTML → Docling → Result
 */
export async function extractEpubWithDocling(
  epubBuffer: ArrayBuffer,
  options: {
    tokenizer?: string
    chunkSize?: number
    onProgress?: (percent: number, stage: string, message: string) => void
  } = {}
): Promise<DoclingEpubResult & { epubMetadata: EpubMetadata }> {
  // Step 1: Extract EPUB to HTML
  options.onProgress?.(10, 'extract', 'Extracting EPUB structure')
  const { html, metadata } = await extractEpubToHtml(epubBuffer)

  // Step 2: Process HTML with Docling
  options.onProgress?.(20, 'extract', 'Processing with Docling')
  const result = await processEpubWithDocling(html, options)

  return {
    ...result,
    epubMetadata: metadata
  }
}
```

#### Critical Gotchas

**GOTCHA 1: Spine Order Must Be Preserved**
```typescript
// From EPUB spec: spine defines reading order
// Must process HTML files in spine order, not alphabetical

// ❌ WRONG
const files = Object.keys(zip.files).filter(f => f.endsWith('.html'))

// ✅ CORRECT
const spineItems = extractSpineOrder(opfXml)
for (const item of spineItems) {
  const html = await zip.file(item).async('text')
}
```

**GOTCHA 2: IPC Pattern Same as PDF**
```typescript
// From Phase 2: Must parse line-by-line for progress
// JSON may span multiple data events

pythonProcess.stdout.on('data', (data) => {
  const lines = data.toString().split('\n')
  // Parse each line separately
})
```

#### Validation

```bash
# TypeScript compile check
cd worker && npx tsc --noEmit lib/epub/epub-docling-extractor.ts

# Integration test
cat > test_epub_extraction.ts << 'EOF'
import { extractEpubWithDocling } from './lib/epub/epub-docling-extractor'
import fs from 'fs'

const epubBuffer = fs.readFileSync('test.epub').buffer
const result = await extractEpubWithDocling(epubBuffer, {
  onProgress: (p, s, m) => console.log(`${p}% - ${s}: ${m}`)
})

console.log(`Chunks: ${result.chunks.length}`)
console.log(`Headings: ${result.structure.headings.length}`)
console.log(`Has page numbers: ${result.chunks[0].page_start !== null}`) // Should be false
EOF

npx tsx test_epub_extraction.ts
```

---

### Task 18: Update EPUB Processor with Docling Mode

**Files to Modify**:
- `worker/processors/epub-processor.ts`

**Pattern to Follow**:
- `worker/processors/pdf-processor.ts` (Phase 2-3 local mode integration)

#### Implementation Steps

Add local mode support to EPUB processor (similar to PDF):

```typescript
// worker/processors/epub-processor.ts

import { extractEpubWithDocling } from '../lib/epub/epub-docling-extractor.js'
import { cleanMarkdownLocal, cleanMarkdownRegexOnly } from '../lib/local/ollama-cleanup.js'
import { OOMError } from '../lib/local/ollama-client.js'

export class EPUBProcessor extends SourceProcessor {
  async process(): Promise<ProcessResult> {
    const storagePath = this.getStoragePath()

    // Check processing mode (same pattern as PDF)
    const isLocalMode = process.env.PROCESSING_MODE === 'local'
    console.log(`[EPUBProcessor] Processing mode: ${isLocalMode ? 'LOCAL' : 'CLOUD'}`)

    // Stage 1: Download EPUB (10%)
    await this.updateProgress(10, 'download', 'fetching', 'Downloading EPUB file')

    const fileData = await this.withRetry(
      async () => {
        const { data, error } = await this.supabase.storage
          .from('documents')
          .download(`${storagePath}/source.epub`)

        if (error) throw new Error(`Failed to download EPUB: ${error.message}`)
        return Buffer.from(await data.arrayBuffer())
      },
      'Download EPUB'
    )

    let markdown: string
    let doclingChunks: any[] | undefined

    if (isLocalMode) {
      // Stage 2: Extract with Docling (10-50%)
      console.log('[EPUBProcessor] Using Docling extraction')

      await this.updateProgress(15, 'extract', 'processing', 'Extracting EPUB with Docling')

      const result = await extractEpubWithDocling(fileData.buffer, {
        tokenizer: 'Xenova/all-mpnet-base-v2',
        chunkSize: 512,
        onProgress: async (percent, stage, message) => {
          const ourPercent = 15 + Math.floor(percent * 0.35) // 15-50%
          await this.updateProgress(ourPercent, 'extract', 'processing', message)
        }
      })

      markdown = result.markdown
      doclingChunks = result.chunks

      console.log(`[EPUBProcessor] Docling extracted ${result.chunks.length} chunks`)

      // Cache for Phase 4 bulletproof matching
      this.job.metadata = {
        ...this.job.metadata,
        cached_extraction: {
          markdown: result.markdown,
          structure: result.structure,
          doclingChunks: result.chunks,
          epubMetadata: result.epubMetadata
        }
      }

      await this.updateProgress(50, 'extract', 'complete', 'Docling extraction done')

      // Stage 3: Local regex cleanup (50-55%)
      await this.updateProgress(52, 'cleanup_local', 'processing', 'Removing artifacts')
      markdown = cleanMarkdownRegexOnly(markdown)
      await this.updateProgress(55, 'cleanup_local', 'complete', 'Local cleanup done')

      // Stage 4: AI cleanup with Ollama (55-70%)
      const cleanMarkdownEnabled = this.job.input_data?.cleanMarkdown !== false

      if (cleanMarkdownEnabled) {
        await this.updateProgress(58, 'cleanup_ai', 'processing', 'AI cleaning markdown')

        try {
          markdown = await cleanMarkdownLocal(markdown, {
            onProgress: (stage, percent) => {
              const ourPercent = 58 + Math.floor(percent * 0.12)
              this.updateProgress(ourPercent, 'cleanup_ai', 'processing', 'AI cleanup')
            }
          })

          await this.updateProgress(70, 'cleanup_ai', 'complete', 'AI cleanup done')
        } catch (error: any) {
          if (error instanceof OOMError) {
            console.warn('[EPUBProcessor] Qwen OOM - falling back to regex-only')
            markdown = cleanMarkdownRegexOnly(markdown)
            await this.markForReview('ai_cleanup_oom', 'Qwen OOM during cleanup')
            await this.updateProgress(70, 'cleanup_ai', 'skipped', 'AI cleanup skipped (OOM)')
          } else {
            throw error
          }
        }
      } else {
        await this.updateProgress(70, 'cleanup_ai', 'skipped', 'AI cleanup disabled')
      }

    } else {
      // Cloud mode: Use existing EPUB parser + Gemini cleanup
      console.log('[EPUBProcessor] Using cloud mode (existing pipeline)')

      const { metadata, chapters } = await parseEPUB(fileData)
      const cleanedChapters = chapters.map(ch => ({
        title: ch.title,
        markdown: cleanEpubArtifacts(ch.markdown)
      }))

      markdown = await cleanEpubChaptersWithAI(this.ai, cleanedChapters)
    }

    // Continue with chunking stage (70-95%)...
    // (Same as existing EPUB processor)

    return {
      markdown,
      chunks: enrichedChunks,
      metadata: { /* ... */ },
      wordCount: markdown.split(/\s+/).length
    }
  }

  private async markForReview(reason: string, message: string): Promise<void> {
    // Same as PDF processor
    await this.supabase
      .from('documents')
      .update({
        processing_status: 'completed_with_warnings',
        review_notes: message
      })
      .eq('id', this.job.document_id)

    this.job.metadata = {
      ...this.job.metadata,
      warnings: [
        ...(this.job.metadata?.warnings || []),
        { reason, message, timestamp: new Date().toISOString() }
      ]
    }
  }
}
```

---

### Task 19: Adapt Bulletproof Matching for EPUBs

**Files to Modify**:
- `worker/lib/bulletproof-matching.ts` (from Phase 4)

**Pattern to Follow**:
- Same 5-layer algorithm from Phase 4
- Adapt Layer 4 interpolation for section-based positioning

#### Key Changes

```typescript
// Layer 4: Interpolation
// PDF version uses page numbers
if (sourceType === 'pdf') {
  syntheticChunk.page_start = interpolatePageNumber(prevChunk, nextChunk)
}

// EPUB version uses section markers
if (sourceType === 'epub') {
  syntheticChunk.section_marker = interpolateSectionMarker(prevChunk, nextChunk)
  syntheticChunk.heading_path = inferHeadingPath(prevChunk, nextChunk)
}
```

**Implementation details in Phase 4 completion.**

---

### Task 20: Add Local Cleanup to EPUB (Already Done in Task 18)

Covered by Task 18 integration.

---

## Integration Points

### Worker Module
- `worker/scripts/docling_extract_epub.py` - Python EPUB → HTML → Docling
- `worker/lib/epub/epub-docling-extractor.ts` - TypeScript wrapper
- `worker/processors/epub-processor.ts` - Processor with local mode
- Uses OllamaClient from Phase 1
- Uses bulletproof matching from Phase 4 (adapted)

### Environment Variables
- `PROCESSING_MODE=local` - Enables Docling + Ollama for EPUBs (same as PDFs)
- `OLLAMA_HOST`, `OLLAMA_MODEL` from Phase 1

### Database Schema
- Same columns as PDFs (from Phase 1 migration 045)
- `page_start`, `page_end` always NULL for EPUBs
- `section_marker` used instead of page numbers
- `heading_level`, `heading_path` populated same as PDFs

## External References

### Documentation Links
- **Docling HTML Support**: https://docling-project.github.io/docling/
- **EPUB Specification**: http://idpf.org/epub/31
- **JSZip Library**: https://stuk.github.io/jszip/

### Codebase References
- **PDF Docling**: `worker/scripts/docling_extract.py`
- **PDF Processor**: `worker/processors/pdf-processor.ts`
- **EPUB Parser**: `worker/lib/epub/epub-parser.ts`

## Validation Checklist

- [ ] docling_extract_epub.py creates chunks with section_marker
- [ ] docling_extract_epub.py sets page_start/page_end to null
- [ ] epub-docling-extractor.ts extracts HTML in spine order
- [ ] epub-docling-extractor.ts calls Python script correctly
- [ ] epub-processor.ts checks PROCESSING_MODE
- [ ] epub-processor.ts caches doclingChunks in job metadata
- [ ] epub-processor.ts uses Ollama cleanup in local mode
- [ ] Bulletproof matching adapted for section-based positioning
- [ ] Tests pass: `cd worker && npm test`
- [ ] No TypeScript errors: `cd worker && npm run type-check`

## Success Criteria

✅ **EPUB Docling Works**
- EPUBs extract to HTML correctly
- Docling processes HTML to markdown + chunks
- Chunks have section markers instead of page numbers

✅ **Local Processing Complete**
- EPUBs use Ollama cleanup (not Gemini)
- EPUBs use local embeddings (Phase 7)
- Zero cloud API calls for EPUB processing

✅ **Bulletproof Matching Works**
- EPUBs benefit from 5-layer matching
- Section-based interpolation preserves structure
- 100% chunk recovery (same as PDFs)

✅ **Ready for Phase 6**
- Both PDFs and EPUBs have structural metadata
- Both formats ready for unified metadata enrichment
- No blockers for Phase 6 (Metadata) or Phase 7 (Embeddings)

---

## Notes & Additional Context

### Why Section Markers Work

**PDF Matching:**
```
"Chapter 1" at pages 5-7 → After cleanup → Find in cleaned markdown
Preserve: page_start=5, page_end=7
```

**EPUB Matching:**
```
"Chapter 1" with section="chapter_01_intro" → After cleanup → Find in cleaned markdown
Preserve: section_marker="chapter_01_intro", heading_path=["Chapter 1", "Introduction"]
```

Both preserve structural context for citations and navigation.

### Performance Expectations

**Processing Time (per 500-page book equivalent):**
- Current EPUB (Gemini): ~15-20 minutes
- Local EPUB (Docling + Ollama): ~20-25 minutes
- **Difference**: +5 minutes (25% slower but free)

**Cost Savings:**
- EPUB cleanup: $0.60 → $0.00
- EPUB chunking: $0.50 → $0.00 (Phase 7 local embeddings)
- **Total per EPUB**: $1.10 → $0.00 (100% savings)

### Quality Comparison

**Current EPUB:** Gemini cleanup + chunking
**Local EPUB:** Docling + Ollama cleanup + local embeddings

- Structural metadata: None → Full (headings, hierarchy, sections)
- Bulletproof matching: No → Yes (100% recovery)
- Privacy: Cloud → Local (no data sent)
- Cost: $1.10 → $0.00

---

**Source PRP**: `/Users/topher/Code/rhizome-v2/docs/prps/local-processing-pipeline.md`

**Phase 5 Completion Target**: After Phase 4 (Bulletproof Matching) complete
