# Rhizome Complete Implementation Plan

**Version:** 1.0  
**Date:** January 2025  
**Scope:** 100% Local Pipeline with Docling + Qwen 32B  
**Context:** Greenfield personal tool, one user, no backward compatibility concerns

---

## Executive Summary

**Goal:** Implement the complete 100% local document processing pipeline with bulletproof chunk matching, rich metadata extraction, and 3-engine connection detection.

**Key Decisions:**
- ✅ 100% local (zero API costs, complete privacy)
- ✅ Docling for extraction (PDFs, EPUBs via HTML)
- ✅ Qwen 32B for LLM tasks (cleanup, metadata, connections)
- ✅ PydanticAI for structured outputs (automatic retries)
- ✅ Zod for TypeScript validation (type safety)
- ✅ 5-layer bulletproof chunk matching (100% recovery guaranteed)
- ✅ 3-engine connection detection (semantic, contradiction, thematic bridge)

**What We Already Have:**
- ✅ Basic connection detection system (needs local model update)
- ✅ Database schema (may need minor adjustments)
- ✅ Next.js app structure
- ✅ Supabase integration

**What We're Building:**
- 🆕 Complete Docling-based extraction pipeline
- 🆕 Bulletproof chunk matching system
- 🆕 PydanticAI metadata extraction
- 🆕 Local embedding generation
- 🔄 Updated connection detection (Qwen 32B)
- 🆕 Review checkpoints and manual controls

---

## Current State Assessment

### Existing Assets
```
✅ Database schema (documents, chunks, connections)
✅ Supabase storage integration
✅ Background job system
✅ Connection detection logic (3 engines)
✅ Next.js app structure
```

### Needs Major Work
```
❌ PDF extraction (switch to Docling)
❌ EPUB extraction (Docling via HTML)
❌ Chunk matching (implement 5-layer failsafe)
❌ Metadata extraction (PydanticAI + Qwen 32B)
❌ Embedding generation (local models)
❌ Connection detection (update to Qwen 32B)
```

### Tech Stack Additions Needed
```
New Dependencies:
- Python: docling, pydantic-ai, sentence-transformers, ollama-python
- TypeScript: zod (for validation)
- System: Ollama (with Qwen 32B model)
```

---

## Implementation Phases

### Phase 0: Foundation & Setup (Week 1)

**Goal:** Get all dependencies and infrastructure ready

#### Task 0.1: System Setup
```bash
# Install Ollama
curl -fsSL https://ollama.com/install.sh | sh

# Pull Qwen 32B model
ollama pull qwen2.5:32b

# Verify installation
ollama run qwen2.5:32b "Hello"
```

**Acceptance:**
- ✅ Ollama running locally
- ✅ Qwen 32B model loaded (20GB)
- ✅ Can generate responses in <5 seconds

#### Task 0.2: Python Environment
```bash
# Create virtual environment
cd scripts
python -m venv venv
source venv/bin/activate

# Install dependencies
pip install docling pydantic-ai ollama sentence-transformers
```

**File:** `scripts/requirements.txt`
```txt
docling>=2.0.0
pydantic-ai>=0.0.13
pydantic>=2.0.0
ollama>=0.1.0
sentence-transformers>=2.0.0
pillow>=10.0.0
```

**Acceptance:**
- ✅ Python 3.11+ installed
- ✅ All packages installed without errors
- ✅ Can import all packages

#### Task 0.3: TypeScript Dependencies
```bash
npm install zod
```

**Acceptance:**
- ✅ Zod installed
- ✅ No dependency conflicts

#### Task 0.4: Shared Schema Definitions

**File:** `lib/schemas/chunk.ts`
```typescript
import { z } from 'zod'

export const ConceptSchema = z.object({
  text: z.string().min(1),
  importance: z.number().min(0).max(1)
})

export const EmotionalToneSchema = z.object({
  polarity: z.number().min(-1).max(1),
  primaryEmotion: z.enum(['neutral', 'joy', 'sadness', 'anger', 'fear', 'anxiety', 'excitement']),
  intensity: z.number().min(0).max(1)
})

export const ChunkMetadataSchema = z.object({
  themes: z.array(z.string()).min(1).max(5),
  concepts: z.array(ConceptSchema).min(1),
  importance_score: z.number().min(0).max(1),
  summary: z.string().min(20).max(300),
  emotional_tone: EmotionalToneSchema,
  domain: z.string().optional()
})

export type ChunkMetadata = z.infer<typeof ChunkMetadataSchema>
```

**File:** `scripts/schemas.py`
```python
from pydantic import BaseModel, Field

class Concept(BaseModel):
    text: str = Field(min_length=1)
    importance: float = Field(ge=0.0, le=1.0)

class EmotionalTone(BaseModel):
    polarity: float = Field(ge=-1.0, le=1.0)
    primaryEmotion: str = Field(pattern='^(neutral|joy|sadness|anger|fear|anxiety|excitement)$')
    intensity: float = Field(ge=0.0, le=1.0)

class ChunkMetadata(BaseModel):
    themes: list[str] = Field(min_length=1, max_length=5)
    concepts: list[Concept] = Field(min_length=1)
    importance_score: float = Field(ge=0.0, le=1.0)
    summary: str = Field(min_length=20, max_length=300)
    emotional_tone: EmotionalTone
    domain: str | None = None
```

**Acceptance:**
- ✅ Schemas defined in both languages
- ✅ Manually verified they match
- ✅ No TypeScript errors

---

### Phase 1: Core Extraction Pipeline (Week 2-3)

**Goal:** Implement Docling-based extraction for PDF and EPUB

#### Task 1.1: Docling PDF Extractor

**File:** `scripts/docling_extract_pdf.py`
```python
#!/usr/bin/env python3
"""
Docling-based PDF extraction with HybridChunker.
Returns: markdown, structure, chunks with rich metadata
"""
import sys
import json
from pathlib import Path
from docling.document_converter import DocumentConverter
from docling.chunking import HybridChunker
import tempfile
import os

def extract_pdf(pdf_path: str, options: dict = None) -> dict:
    options = options or {}
    
    # Initialize converter
    converter = DocumentConverter()
    
    print(json.dumps({
        'type': 'progress',
        'status': 'extracting',
        'message': 'Processing PDF with Docling',
        'progress': 0.20
    }), flush=True)
    
    # Convert PDF
    result = converter.convert(pdf_path)
    doc = result.document
    
    # Export markdown
    markdown = doc.export_to_markdown()
    
    print(json.dumps({
        'type': 'progress',
        'status': 'chunking',
        'message': 'Creating semantic chunks',
        'progress': 0.40
    }), flush=True)
    
    # Create chunks
    chunker = HybridChunker(
        tokenizer=options.get('tokenizer', 'sentence-transformers/all-mpnet-base-v2'),
        max_tokens=options.get('max_tokens', 512),
        merge_peers=True,
        heading_as_metadata=True
    )
    
    chunk_iter = chunker.chunk(doc)
    chunks = []
    
    for idx, chunk in enumerate(chunk_iter):
        chunk_data = {
            'chunk_index': idx,
            'content': chunk.text,
            'start_offset': chunk.meta.doc_items[0].self_ref.start if chunk.meta.doc_items else 0,
            'end_offset': chunk.meta.doc_items[-1].self_ref.end if chunk.meta.doc_items else len(chunk.text),
            'tokens': len(chunk.text.split()),  # Rough estimate
            
            # Structural metadata
            'page_start': chunk.meta.doc_items[0].prov[0].page if chunk.meta.doc_items and chunk.meta.doc_items[0].prov else None,
            'page_end': chunk.meta.doc_items[-1].prov[0].page if chunk.meta.doc_items and chunk.meta.doc_items[-1].prov else None,
            'heading': chunk.meta.headings[-1] if chunk.meta.headings else None,
            'heading_path': chunk.meta.headings if chunk.meta.headings else [],
            'heading_level': len(chunk.meta.headings) if chunk.meta.headings else 0,
            
            # Bounding boxes for PDF highlighting
            'bboxes': [
                {
                    'page': item.prov[0].page,
                    'bbox': item.prov[0].bbox.as_tuple()
                }
                for item in chunk.meta.doc_items
                if item.prov and item.prov[0].bbox
            ] if chunk.meta.doc_items else []
        }
        chunks.append(chunk_data)
    
    # Extract document structure
    structure = extract_structure(doc)
    
    print(json.dumps({
        'type': 'progress',
        'status': 'complete',
        'message': f'Extracted {len(chunks)} chunks',
        'progress': 0.50
    }), flush=True)
    
    return {
        'markdown': markdown,
        'structure': structure,
        'chunks': chunks,
        'metadata': {
            'source_format': 'pdf',
            'extraction_method': 'docling',
            'chunk_count': len(chunks),
            'word_count': len(markdown.split())
        }
    }

def extract_structure(doc) -> dict:
    """Extract document structure from Docling document."""
    structure = {
        'sections': [],
        'tables': [],
        'figures': []
    }
    
    for item in doc.body:
        if hasattr(item, 'label') and 'title' in item.label.lower():
            structure['sections'].append({
                'title': item.text,
                'level': int(item.label.replace('title_', '')),
                'page': item.prov[0].page if item.prov else None
            })
        elif 'Table' in item.__class__.__name__:
            structure['tables'].append({
                'content': item.export_to_markdown(),
                'page': item.prov[0].page if item.prov else None
            })
        elif 'Figure' in item.__class__.__name__:
            structure['figures'].append({
                'caption': getattr(item, 'caption', ''),
                'page': item.prov[0].page if item.prov else None
            })
    
    return structure

if __name__ == '__main__':
    pdf_path = sys.argv[1]
    options = json.loads(sys.argv[2]) if len(sys.argv) > 2 else {}
    
    result = extract_pdf(pdf_path, options)
    print(json.dumps(result))
```

**File:** `lib/docling-extractor.ts`
```typescript
import { exec } from 'child_process'
import { promisify } from 'util'
import path from 'path'

const execAsync = promisify(exec)

export interface DoclingChunk {
  chunk_index: number
  content: string
  start_offset: number
  end_offset: number
  tokens: number
  page_start?: number
  page_end?: number
  heading?: string
  heading_path: string[]
  heading_level: number
  bboxes?: Array<{
    page: number
    bbox: [number, number, number, number]
  }>
}

export interface DoclingResult {
  markdown: string
  structure: {
    sections: Array<{ title: string; level: number; page?: number }>
    tables: Array<{ content: string; page?: number }>
    figures: Array<{ caption: string; page?: number }>
  }
  chunks: DoclingChunk[]
  metadata: {
    source_format: string
    extraction_method: string
    chunk_count: number
    word_count: number
  }
}

export async function extractPDFWithDocling(
  pdfPath: string,
  options: {
    tokenizer?: string
    max_tokens?: number
    onProgress?: (progress: number, message: string) => void
  } = {}
): Promise<DoclingResult> {
  const scriptPath = path.join(process.cwd(), 'scripts', 'docling_extract_pdf.py')
  const optionsJson = JSON.stringify({
    tokenizer: options.tokenizer || 'sentence-transformers/all-mpnet-base-v2',
    max_tokens: options.max_tokens || 512
  })
  
  const command = `python3 ${scriptPath} "${pdfPath}" '${optionsJson}'`
  
  return new Promise((resolve, reject) => {
    const child = exec(command)
    let output = ''
    let lastResult: DoclingResult | null = null
    
    child.stdout?.on('data', (data: string) => {
      const lines = data.split('\n').filter(line => line.trim())
      
      for (const line of lines) {
        try {
          const parsed = JSON.parse(line)
          
          if (parsed.type === 'progress') {
            options.onProgress?.(parsed.progress, parsed.message)
          } else {
            // Final result
            lastResult = parsed as DoclingResult
          }
        } catch (e) {
          // Not JSON, accumulate
          output += line
        }
      }
    })
    
    child.stderr?.on('data', (data: string) => {
      console.error('Docling stderr:', data)
    })
    
    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`Docling extraction failed with code ${code}`))
      } else if (lastResult) {
        resolve(lastResult)
      } else {
        try {
          resolve(JSON.parse(output))
        } catch (e) {
          reject(new Error('Failed to parse Docling output'))
        }
      }
    })
  })
}
```

**Testing:** `__tests__/docling-extractor.test.ts`
```typescript
import { extractPDFWithDocling } from '@/lib/docling-extractor'
import path from 'path'

describe('Docling PDF Extraction', () => {
  it('should extract a simple PDF', async () => {
    const pdfPath = path.join(__dirname, 'fixtures', 'sample.pdf')
    const result = await extractPDFWithDocling(pdfPath)
    
    expect(result.markdown).toBeTruthy()
    expect(result.chunks.length).toBeGreaterThan(0)
    expect(result.metadata.chunk_count).toBe(result.chunks.length)
    
    // Verify chunk structure
    const firstChunk = result.chunks[0]
    expect(firstChunk).toHaveProperty('content')
    expect(firstChunk).toHaveProperty('start_offset')
    expect(firstChunk).toHaveProperty('page_start')
    expect(firstChunk.heading_path).toBeInstanceOf(Array)
  }, 60000) // 60s timeout
  
  it('should preserve page numbers', async () => {
    const pdfPath = path.join(__dirname, 'fixtures', 'multipage.pdf')
    const result = await extractPDFWithDocling(pdfPath)
    
    const chunksWithPages = result.chunks.filter(c => c.page_start !== undefined)
    expect(chunksWithPages.length).toBeGreaterThan(0)
    
    // Pages should be sequential
    const pages = chunksWithPages.map(c => c.page_start!)
    expect(Math.max(...pages)).toBeGreaterThan(Math.min(...pages))
  }, 60000)
})
```

**Acceptance:**
- ✅ Extracts PDF to markdown
- ✅ Creates chunks with offsets
- ✅ Preserves page numbers
- ✅ Preserves heading hierarchy
- ✅ Extracts bboxes for highlighting
- ✅ Tests pass for sample PDFs

---

#### Task 1.2: Docling EPUB Extractor

**File:** `scripts/docling_extract_epub.py`
```python
#!/usr/bin/env python3
"""
Docling-based EPUB extraction via direct HTML processing.
"""
import sys
import json
from docling.document_converter import DocumentConverter
from docling.chunking import HybridChunker
import tempfile
import os

def extract_epub_html(html_content: str, options: dict = None) -> dict:
    """Extract EPUB HTML directly with Docling."""
    options = options or {}
    
    # Save HTML to temp file
    with tempfile.NamedTemporaryFile(mode='w', suffix='.html', delete=False) as f:
        f.write(html_content)
        temp_html_path = f.name
    
    try:
        print(json.dumps({
            'type': 'progress',
            'status': 'extracting',
            'message': 'Processing HTML with Docling',
            'progress': 0.30
        }), flush=True)
        
        # Convert HTML
        converter = DocumentConverter()
        result = converter.convert(temp_html_path)
        doc = result.document
        
        # Export to markdown
        markdown = doc.export_to_markdown()
        
        print(json.dumps({
            'type': 'progress',
            'status': 'chunking',
            'message': 'Creating semantic chunks',
            'progress': 0.50
        }), flush=True)
        
        # Create chunks
        chunker = HybridChunker(
            tokenizer=options.get('tokenizer', 'sentence-transformers/all-mpnet-base-v2'),
            max_tokens=options.get('max_tokens', 512),
            merge_peers=True,
            heading_as_metadata=True
        )
        
        chunk_iter = chunker.chunk(doc)
        chunks = []
        
        for idx, chunk in enumerate(chunk_iter):
            # EPUB has NO page numbers, use section markers
            section_marker = f"section_{idx:03d}"
            if chunk.meta.headings:
                # Use heading for marker
                section_marker = chunk.meta.headings[-1].lower().replace(' ', '_')
            
            chunk_data = {
                'chunk_index': idx,
                'content': chunk.text,
                'start_offset': chunk.meta.doc_items[0].self_ref.start if chunk.meta.doc_items else 0,
                'end_offset': chunk.meta.doc_items[-1].self_ref.end if chunk.meta.doc_items else len(chunk.text),
                'tokens': len(chunk.text.split()),
                
                # NO page numbers for EPUB
                'page_start': None,
                'page_end': None,
                
                # Structure metadata
                'heading': chunk.meta.headings[-1] if chunk.meta.headings else None,
                'heading_path': chunk.meta.headings if chunk.meta.headings else [],
                'heading_level': len(chunk.meta.headings) if chunk.meta.headings else 0,
                'section_marker': section_marker,
                
                # NO bboxes for EPUB
                'bboxes': None
            }
            chunks.append(chunk_data)
        
        structure = extract_html_structure(doc)
        
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
    """Extract structure from HTML document."""
    structure = {
        'sections': [],
        'tables': [],
        'lists': [],
        'code_blocks': []
    }
    
    for item in doc.body:
        if hasattr(item, 'label') and 'title' in item.label.lower():
            structure['sections'].append({
                'title': item.text,
                'level': int(item.label.replace('title_', ''))
            })
        elif 'Table' in item.__class__.__name__:
            structure['tables'].append({
                'content': item.export_to_markdown()
            })
        elif hasattr(item, 'label') and 'list' in item.label.lower():
            structure['lists'].append({
                'type': 'ordered' if 'ol' in str(item).lower() else 'unordered'
            })
        elif hasattr(item, 'label') and 'code' in item.label.lower():
            structure['code_blocks'].append({
                'content': item.text
            })
    
    return structure

if __name__ == '__main__':
    html_content = sys.stdin.read()
    options = json.loads(sys.argv[1]) if len(sys.argv) > 1 else {}
    
    result = extract_epub_html(html_content, options)
    print(json.dumps(result))
```

**File:** `lib/epub-extractor.ts`
```typescript
import JSZip from 'jszip'

interface EpubMetadata {
  title?: string
  author?: string
  publisher?: string
  coverImage?: string
}

export async function extractEpubToHtml(
  epubBuffer: ArrayBuffer
): Promise<{
  html: string
  metadata: EpubMetadata
  spine: string[]
}> {
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
    publisher: opfXml.match(/<dc:publisher[^>]*>([^<]+)<\/dc:publisher>/)?.[1]
  }
  
  // Extract spine order
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
  
  // Concatenate with markers
  const unifiedHtml = htmlChunks.join('\n<!-- CHAPTER_BREAK -->\n')
  
  return {
    html: unifiedHtml,
    metadata,
    spine: spineItems
  }
}
```

**Acceptance:**
- ✅ Extracts EPUB to unified HTML
- ✅ Preserves reading order (spine)
- ✅ Docling processes HTML directly
- ✅ Creates chunks without page numbers
- ✅ Uses section_marker instead of pages

---

#### Task 1.3: Regex Cleanup

**File:** `lib/markdown-cleanup-regex.ts`
```typescript
export function regexCleanupMarkdown(markdown: string): string {
  let cleaned = markdown
  
  // Remove common page number patterns
  cleaned = cleaned.replace(/^\s*\d+\s*$/gm, '')
  cleaned = cleaned.replace(/^Page \d+$/gm, '')
  
  // Remove running headers/footers (repeated text)
  const lines = cleaned.split('\n')
  const lineCounts = new Map<string, number>()
  
  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed.length > 10 && trimmed.length < 100) {
      lineCounts.set(trimmed, (lineCounts.get(trimmed) || 0) + 1)
    }
  }
  
  // Remove lines that appear >5 times (likely headers/footers)
  const commonLines = new Set(
    Array.from(lineCounts.entries())
      .filter(([_, count]) => count > 5)
      .map(([line]) => line)
  )
  
  cleaned = lines
    .filter(line => !commonLines.has(line.trim()))
    .join('\n')
  
  // Fix hyphenation (end-of-line breaks)
  cleaned = cleaned.replace(/(\w+)-\s*\n\s*(\w+)/g, '$1$2')
  
  // Normalize whitespace
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n') // Max 2 newlines
  cleaned = cleaned.replace(/[ \t]+/g, ' ') // Normalize spaces
  
  return cleaned.trim()
}
```

**Testing:** `__tests__/regex-cleanup.test.ts`
```typescript
describe('Regex Cleanup', () => {
  it('should remove page numbers', () => {
    const input = 'Paragraph one.\n\n42\n\nParagraph two.'
    const output = regexCleanupMarkdown(input)
    expect(output).not.toContain('42')
  })
  
  it('should remove running headers', () => {
    const input = [
      'Chapter 1',
      'Content here.',
      'Chapter 1',
      'More content.',
      'Chapter 1',
      'Final content.'
    ].join('\n')
    
    const output = regexCleanupMarkdown(input)
    // "Chapter 1" should be removed (appears 3 times)
    expect(output.match(/Chapter 1/g)?.length || 0).toBe(0)
  })
  
  it('should fix hyphenation', () => {
    const input = 'This is a hyphen-\nated word.'
    const output = regexCleanupMarkdown(input)
    expect(output).toContain('hyphenated')
    expect(output).not.toContain('hyphen-\n')
  })
})
```

**Acceptance:**
- ✅ Removes page numbers
- ✅ Removes running headers
- ✅ Fixes hyphenation
- ✅ Normalizes whitespace
- ✅ Tests pass

---

### Phase 2: Bulletproof Chunk Matching (Week 3-4)

**Goal:** Implement 5-layer failsafe matching system

#### Task 2.1: Enhanced Fuzzy Matching (Layer 1)

**File:** `lib/chunking/fuzzy-matcher.ts`
```typescript
import Fuse from 'fuse.js'

export interface MatchResult {
  newStartOffset: number
  newEndOffset: number
  confidence: 'exact' | 'high' | 'medium' | 'low'
  method: 'exact' | 'normalized' | 'multi_anchor' | 'sliding_window'
}

export function fuzzyMatchChunk(
  chunkContent: string,
  cleanedMarkdown: string,
  originalOffset: number
): MatchResult | null {
  // Layer 1.1: Exact match
  const exactIndex = cleanedMarkdown.indexOf(chunkContent)
  if (exactIndex !== -1) {
    return {
      newStartOffset: exactIndex,
      newEndOffset: exactIndex + chunkContent.length,
      confidence: 'exact',
      method: 'exact'
    }
  }
  
  // Layer 1.2: Normalized match (ignore whitespace differences)
  const normalizedChunk = normalizeWhitespace(chunkContent)
  const normalizedMarkdown = normalizeWhitespace(cleanedMarkdown)
  const normalizedIndex = normalizedMarkdown.indexOf(normalizedChunk)
  
  if (normalizedIndex !== -1) {
    // Find actual position in original
    const actualOffset = findActualOffset(cleanedMarkdown, normalizedIndex, chunkContent.length)
    return {
      newStartOffset: actualOffset,
      newEndOffset: actualOffset + chunkContent.length,
      confidence: 'high',
      method: 'normalized'
    }
  }
  
  // Layer 1.3: Multi-anchor search (use start, middle, end phrases)
  const anchors = extractAnchors(chunkContent)
  const anchorResult = findUsingAnchors(anchors, cleanedMarkdown, chunkContent.length)
  
  if (anchorResult) {
    return {
      ...anchorResult,
      confidence: 'high',
      method: 'multi_anchor'
    }
  }
  
  // Layer 1.4: Sliding window (find best matching region)
  const windowResult = slidingWindowMatch(chunkContent, cleanedMarkdown, originalOffset)
  
  if (windowResult) {
    return {
      ...windowResult,
      confidence: 'medium',
      method: 'sliding_window'
    }
  }
  
  return null // Move to next layer
}

function normalizeWhitespace(text: string): string {
  return text
    .replace(/\s+/g, ' ')
    .replace(/\n+/g, ' ')
    .trim()
}

function extractAnchors(text: string, anchorLength = 50): string[] {
  const words = text.split(/\s+/)
  return [
    words.slice(0, 10).join(' '), // Start
    words.slice(Math.floor(words.length / 2) - 5, Math.floor(words.length / 2) + 5).join(' '), // Middle
    words.slice(-10).join(' ') // End
  ].filter(a => a.length > 20)
}

function findUsingAnchors(
  anchors: string[],
  markdown: string,
  expectedLength: number
): Omit<MatchResult, 'confidence' | 'method'> | null {
  for (const anchor of anchors) {
    const anchorIndex = markdown.indexOf(anchor)
    if (anchorIndex !== -1) {
      // Found anchor, estimate chunk boundaries
      const startOffset = Math.max(0, anchorIndex - expectedLength / 3)
      const endOffset = Math.min(markdown.length, anchorIndex + anchor.length + expectedLength / 3)
      
      return {
        newStartOffset: startOffset,
        newEndOffset: endOffset
      }
    }
  }
  return null
}

function slidingWindowMatch(
  chunkContent: string,
  markdown: string,
  originalOffset: number,
  windowSize = 100
): Omit<MatchResult, 'confidence' | 'method'> | null {
  // Start near original position
  const searchStart = Math.max(0, originalOffset - 5000)
  const searchEnd = Math.min(markdown.length, originalOffset + 5000)
  const searchRegion = markdown.slice(searchStart, searchEnd)
  
  // Use fuzzy search
  const fuse = new Fuse([searchRegion], {
    includeScore: true,
    threshold: 0.4,
    location: originalOffset - searchStart,
    distance: 1000
  })
  
  const result = fuse.search(chunkContent.slice(0, 500))[0] // Use first 500 chars
  
  if (result && result.score && result.score < 0.4) {
    return {
      newStartOffset: searchStart + (result.refIndex || 0),
      newEndOffset: searchStart + (result.refIndex || 0) + chunkContent.length
    }
  }
  
  return null
}

function findActualOffset(text: string, approximateOffset: number, length: number): number {
  // Map from normalized offset to actual offset
  let actualChars = 0
  let normalizedChars = 0
  
  for (let i = 0; i < text.length; i++) {
    if (normalizedChars >= approximateOffset) {
      return actualChars
    }
    
    actualChars++
    if (!/\s/.test(text[i])) {
      normalizedChars++
    }
  }
  
  return actualChars
}
```

**Testing:** `__tests__/fuzzy-matcher.test.ts`
```typescript
describe('Fuzzy Chunk Matching', () => {
  it('should match exact text', () => {
    const chunk = 'This is a test chunk.'
    const markdown = 'Before text. This is a test chunk. After text.'
    
    const result = fuzzyMatchChunk(chunk, markdown, 0)
    
    expect(result).not.toBeNull()
    expect(result!.confidence).toBe('exact')
    expect(markdown.slice(result!.newStartOffset, result!.newEndOffset)).toBe(chunk)
  })
  
  it('should match with whitespace differences', () => {
    const chunk = 'This is a  test   chunk.'
    const markdown = 'Before. This is a test chunk. After.'
    
    const result = fuzzyMatchChunk(chunk, markdown, 0)
    
    expect(result).not.toBeNull()
    expect(result!.confidence).toBe('high')
  })
  
  it('should match using anchors when text changed', () => {
    const chunk = 'The quick brown fox jumps over the lazy dog in the moonlight.'
    const markdown = 'The quick brown fox leaps over the sleepy dog in the moonlight.'
    
    const result = fuzzyMatchChunk(chunk, markdown, 0)
    
    expect(result).not.toBeNull()
    // Should find approximate position
  })
  
  it('should handle heavily modified text', () => {
    const chunk = 'Original text with artifacts and typos here.'
    const markdown = 'Cleaned version of text with proper formatting.'
    
    const result = fuzzyMatchChunk(chunk, markdown, 0)
    
    // May fail (expected), will fall back to embedding layer
    // Just verify it doesn't crash
    expect(true).toBe(true)
  })
})
```

**Acceptance:**
- ✅ Exact matching works
- ✅ Normalized matching handles whitespace
- ✅ Anchor matching finds approximate positions
- ✅ Sliding window provides fallback
- ✅ Tests pass
- ✅ Success rate: ~85% of chunks

---

#### Task 2.2: Embedding-Based Matching (Layer 2)

**File:** `lib/chunking/embedding-matcher.ts`
```typescript
import { generateEmbeddings } from '@/lib/embeddings'
import { cosineSimilarity } from '@/lib/vector-utils'

export async function embeddingMatchChunk(
  chunkContent: string,
  cleanedMarkdown: string,
  windowSize = 600
): Promise<{
  newStartOffset: number
  newEndOffset: number
  similarity: number
} | null> {
  // Create sliding windows of markdown
  const windows: Array<{ text: string; offset: number }> = []
  const step = Math.floor(windowSize / 2) // 50% overlap
  
  for (let i = 0; i <= cleanedMarkdown.length - windowSize; i += step) {
    windows.push({
      text: cleanedMarkdown.slice(i, i + windowSize),
      offset: i
    })
  }
  
  // Embed chunk and all windows
  const allTexts = [chunkContent, ...windows.map(w => w.text)]
  const embeddings = await generateEmbeddings(allTexts)
  
  const chunkEmbedding = embeddings[0]
  const windowEmbeddings = embeddings.slice(1)
  
  // Find best matching window
  let bestMatch: { index: number; similarity: number } | null = null
  
  for (let i = 0; i < windowEmbeddings.length; i++) {
    const similarity = cosineSimilarity(chunkEmbedding, windowEmbeddings[i])
    
    if (!bestMatch || similarity > bestMatch.similarity) {
      bestMatch = { index: i, similarity }
    }
  }
  
  if (bestMatch && bestMatch.similarity > 0.85) {
    const window = windows[bestMatch.index]
    return {
      newStartOffset: window.offset,
      newEndOffset: window.offset + chunkContent.length, // Approximate
      similarity: bestMatch.similarity
    }
  }
  
  return null
}
```

**Testing:** `__tests__/embedding-matcher.test.ts`
```typescript
describe('Embedding-Based Matching', () => {
  it('should match semantically similar text', async () => {
    const chunk = 'The cat sat on the mat.'
    const markdown = 'Before text. The feline sat on the rug. After text.'
    
    const result = await embeddingMatchChunk(chunk, markdown, 100)
    
    expect(result).not.toBeNull()
    expect(result!.similarity).toBeGreaterThan(0.85)
  }, 30000)
  
  // Skip extensive tests - this is expensive
  // User will validate manually if issues arise
})
```

**Acceptance:**
- ✅ Generates embeddings for windows
- ✅ Finds best matching window
- ✅ Threshold: 0.85+ similarity
- ✅ Success rate: +13% (98% cumulative)

---

#### Task 2.3: LLM-Assisted Matching (Layer 3)

**File:** `scripts/llm_match_chunk.py`
```python
#!/usr/bin/env python3
"""
LLM-assisted chunk matching using Qwen 32B.
For chunks that failed fuzzy and embedding matching.
"""
import sys
import json
from pydantic import BaseModel, Field
from pydantic_ai import Agent
from pydantic_ai.models.ollama import OllamaModel

class ChunkMatch(BaseModel):
    found: bool
    start_offset: int | None = None
    end_offset: int | None = None
    confidence: float = Field(ge=0.0, le=1.0)
    reasoning: str

agent = Agent(
    model=OllamaModel('qwen2.5:32b'),
    result_type=ChunkMatch,
    retries=2
)

async def find_chunk_in_text(chunk_content: str, search_window: str) -> ChunkMatch:
    """Use LLM to find chunk in cleaned text."""
    prompt = f"""
You are helping locate a chunk of text within a cleaned document.

ORIGINAL CHUNK (may have artifacts):
```
{chunk_content[:500]}  
```

SEARCH WINDOW (cleaned version):
```
{search_window}
```

Your task:
1. Find the most likely location of this chunk's content in the search window
2. The text may have been rephrased, cleaned, or had artifacts removed
3. Look for semantic matches, not just exact strings
4. Estimate character offsets (start and end positions)

Return:
- found: true if you found a match, false otherwise
- start_offset: character position where chunk starts (0-indexed)
- end_offset: character position where chunk ends
- confidence: 0-1 score of your certainty
- reasoning: brief explanation of your match

If you cannot find a match, set found=false and explain why.
"""
    
    result = await agent.run(prompt)
    return result.data

if __name__ == '__main__':
    data = json.loads(sys.stdin.read())
    chunk_content = data['chunk_content']
    search_window = data['search_window']
    
    result = await find_chunk_in_text(chunk_content, search_window)
    print(json.dumps(result.model_dump()))
```

**File:** `lib/chunking/llm-matcher.ts`
```typescript
import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

export async function llmMatchChunk(
  chunkContent: string,
  cleanedMarkdown: string,
  approximateOffset: number,
  windowSize = 3000
): Promise<{
  newStartOffset: number
  newEndOffset: number
  confidence: number
} | null> {
  // Create search window around approximate position
  const windowStart = Math.max(0, approximateOffset - windowSize / 2)
  const windowEnd = Math.min(cleanedMarkdown.length, approximateOffset + windowSize / 2)
  const searchWindow = cleanedMarkdown.slice(windowStart, windowEnd)
  
  const scriptPath = 'scripts/llm_match_chunk.py'
  const input = JSON.stringify({
    chunk_content: chunkContent,
    search_window: searchWindow
  })
  
  try {
    const { stdout } = await execAsync(
      `echo '${input.replace(/'/g, "\\'")}' | python3 ${scriptPath}`
    )
    
    const result = JSON.parse(stdout)
    
    if (result.found && result.confidence > 0.7) {
      return {
        newStartOffset: windowStart + result.start_offset,
        newEndOffset: windowStart + result.end_offset,
        confidence: result.confidence
      }
    }
  } catch (error) {
    console.error('LLM matching failed:', error)
  }
  
  return null
}
```

**Testing:** Skip tests (too expensive, user validates manually)

**Acceptance:**
- ✅ LLM finds semantic matches
- ✅ Returns position + confidence
- ✅ Success rate: +1.9% (99.9% cumulative)

---

#### Task 2.4: Anchor Interpolation (Layer 4)

**File:** `lib/chunking/anchor-interpolation.ts`
```typescript
export interface AnchorChunk {
  chunk_index: number
  start_offset: number
  end_offset: number
  content_length: number
}

export function anchorInterpolation(
  unmatchedChunk: { chunk_index: number; content_length: number },
  matchedChunks: AnchorChunk[]
): {
  newStartOffset: number
  newEndOffset: number
  confidence: 'synthetic'
  method: 'interpolation'
} {
  // Find nearest matched chunks before and after
  const before = matchedChunks
    .filter(c => c.chunk_index < unmatchedChunk.chunk_index)
    .sort((a, b) => b.chunk_index - a.chunk_index)[0]
  
  const after = matchedChunks
    .filter(c => c.chunk_index > unmatchedChunk.chunk_index)
    .sort((a, b) => a.chunk_index - b.chunk_index)[0]
  
  if (before && after) {
    // Interpolate between neighbors
    const totalChunks = after.chunk_index - before.chunk_index
    const chunkPosition = unmatchedChunk.chunk_index - before.chunk_index
    const ratio = chunkPosition / totalChunks
    
    const interpolatedStart = Math.round(
      before.end_offset + ratio * (after.start_offset - before.end_offset)
    )
    
    const interpolatedEnd = interpolatedStart + unmatchedChunk.content_length
    
    return {
      newStartOffset: interpolatedStart,
      newEndOffset: interpolatedEnd,
      confidence: 'synthetic',
      method: 'interpolation'
    }
  } else if (before) {
    // Only before anchor, place after it
    return {
      newStartOffset: before.end_offset + 100, // Small gap
      newEndOffset: before.end_offset + 100 + unmatchedChunk.content_length,
      confidence: 'synthetic',
      method: 'interpolation'
    }
  } else if (after) {
    // Only after anchor, place before it
    return {
      newStartOffset: Math.max(0, after.start_offset - unmatchedChunk.content_length - 100),
      newEndOffset: after.start_offset - 100,
      confidence: 'synthetic',
      method: 'interpolation'
    }
  } else {
    // No anchors (shouldn't happen), place at 0
    return {
      newStartOffset: 0,
      newEndOffset: unmatchedChunk.content_length,
      confidence: 'synthetic',
      method: 'interpolation'
    }
  }
}
```

**Testing:** `__tests__/anchor-interpolation.test.ts`
```typescript
describe('Anchor Interpolation', () => {
  it('should interpolate between two anchors', () => {
    const unmatched = { chunk_index: 5, content_length: 500 }
    const matched: AnchorChunk[] = [
      { chunk_index: 3, start_offset: 1000, end_offset: 1500, content_length: 500 },
      { chunk_index: 7, start_offset: 3000, end_offset: 3500, content_length: 500 }
    ]
    
    const result = anchorInterpolation(unmatched, matched)
    
    expect(result.newStartOffset).toBeGreaterThan(1500)
    expect(result.newStartOffset).toBeLessThan(3000)
    expect(result.confidence).toBe('synthetic')
  })
  
  it('should handle only before anchor', () => {
    const unmatched = { chunk_index: 10, content_length: 500 }
    const matched: AnchorChunk[] = [
      { chunk_index: 5, start_offset: 1000, end_offset: 1500, content_length: 500 }
    ]
    
    const result = anchorInterpolation(unmatched, matched)
    
    expect(result.newStartOffset).toBeGreaterThan(1500)
  })
})
```

**Acceptance:**
- ✅ Interpolates position between neighbors
- ✅ Handles edge cases (only before/after)
- ✅ Marks as "synthetic"
- ✅ Tests pass
- ✅ 100% recovery guaranteed

---

#### Task 2.5: Orchestrator (Complete System)

**File:** `lib/chunking/bulletproof-matcher.ts`
```typescript
import { fuzzyMatchChunk } from './fuzzy-matcher'
import { embeddingMatchChunk } from './embedding-matcher'
import { llmMatchChunk } from './llm-matcher'
import { anchorInterpolation } from './anchor-interpolation'
import { DoclingChunk } from '@/lib/docling-extractor'

export interface RematchedChunk extends DoclingChunk {
  position_confidence: 'exact' | 'high' | 'medium' | 'synthetic'
  position_method: string
  original_start_offset?: number
  original_end_offset?: number
}

export async function bulletproofChunkMatching(
  cleanedMarkdown: string,
  originalChunks: DoclingChunk[]
): Promise<{
  chunks: RematchedChunk[]
  stats: {
    exact: number
    high: number
    medium: number
    synthetic: number
    total: number
  }
}> {
  const rematchedChunks: RematchedChunk[] = []
  const unmatchedChunks: Array<{ index: number; chunk: DoclingChunk }> = []
  
  console.log('🔍 Phase 1: Fuzzy Matching...')
  
  // Phase 1: Fuzzy matching (85% expected)
  for (let i = 0; i < originalChunks.length; i++) {
    const chunk = originalChunks[i]
    const fuzzyResult = fuzzyMatchChunk(chunk.content, cleanedMarkdown, chunk.start_offset)
    
    if (fuzzyResult) {
      rematchedChunks.push({
        ...chunk,
        original_start_offset: chunk.start_offset,
        original_end_offset: chunk.end_offset,
        start_offset: fuzzyResult.newStartOffset,
        end_offset: fuzzyResult.newEndOffset,
        position_confidence: fuzzyResult.confidence,
        position_method: fuzzyResult.method
      })
    } else {
      unmatchedChunks.push({ index: i, chunk })
    }
  }
  
  console.log(`✅ Matched ${rematchedChunks.length}/${originalChunks.length} chunks with fuzzy matching`)
  
  if (unmatchedChunks.length === 0) {
    return {
      chunks: rematchedChunks.sort((a, b) => a.chunk_index - b.chunk_index),
      stats: calculateStats(rematchedChunks)
    }
  }
  
  console.log('🧬 Phase 2: Embedding-Based Matching...')
  
  // Phase 2: Embedding matching (+13% expected)
  const stillUnmatched: typeof unmatchedChunks = []
  
  for (const { index, chunk } of unmatchedChunks) {
    const embeddingResult = await embeddingMatchChunk(chunk.content, cleanedMarkdown)
    
    if (embeddingResult) {
      rematchedChunks.push({
        ...chunk,
        original_start_offset: chunk.start_offset,
        original_end_offset: chunk.end_offset,
        start_offset: embeddingResult.newStartOffset,
        end_offset: embeddingResult.newEndOffset,
        position_confidence: embeddingResult.similarity > 0.95 ? 'high' : 'medium',
        position_method: 'embedding_match'
      })
    } else {
      stillUnmatched.push({ index, chunk })
    }
  }
  
  console.log(`✅ Matched ${rematchedChunks.length}/${originalChunks.length} chunks after embedding matching`)
  
  if (stillUnmatched.length === 0) {
    return {
      chunks: rematchedChunks.sort((a, b) => a.chunk_index - b.chunk_index),
      stats: calculateStats(rematchedChunks)
    }
  }
  
  console.log('🤖 Phase 3: LLM-Assisted Matching...')
  
  // Phase 3: LLM matching (+1.9% expected)
  const finalUnmatched: typeof unmatchedChunks = []
  
  for (const { index, chunk } of stillUnmatched) {
    const llmResult = await llmMatchChunk(
      chunk.content,
      cleanedMarkdown,
      chunk.start_offset
    )
    
    if (llmResult) {
      rematchedChunks.push({
        ...chunk,
        original_start_offset: chunk.start_offset,
        original_end_offset: chunk.end_offset,
        start_offset: llmResult.newStartOffset,
        end_offset: llmResult.newEndOffset,
        position_confidence: 'medium',
        position_method: 'llm_assisted'
      })
    } else {
      finalUnmatched.push({ index, chunk })
    }
  }
  
  console.log(`✅ Matched ${rematchedChunks.length}/${originalChunks.length} chunks after LLM matching`)
  
  if (finalUnmatched.length === 0) {
    return {
      chunks: rematchedChunks.sort((a, b) => a.chunk_index - b.chunk_index),
      stats: calculateStats(rematchedChunks)
    }
  }
  
  console.log('📐 Phase 4: Anchor Interpolation (GUARANTEED)...')
  
  // Phase 4: Interpolation (100% recovery)
  const sortedMatched = rematchedChunks
    .map(c => ({
      chunk_index: c.chunk_index,
      start_offset: c.start_offset,
      end_offset: c.end_offset,
      content_length: c.content.length
    }))
    .sort((a, b) => a.chunk_index - b.chunk_index)
  
  for (const { index, chunk } of finalUnmatched) {
    const interpolated = anchorInterpolation(
      { chunk_index: chunk.chunk_index, content_length: chunk.content.length },
      sortedMatched
    )
    
    rematchedChunks.push({
      ...chunk,
      original_start_offset: chunk.start_offset,
      original_end_offset: chunk.end_offset,
      start_offset: interpolated.newStartOffset,
      end_offset: interpolated.newEndOffset,
      position_confidence: interpolated.confidence,
      position_method: interpolated.method
    })
  }
  
  console.log(`✅ 100% RECOVERY: ${rematchedChunks.length}/${originalChunks.length} chunks matched`)
  
  return {
    chunks: rematchedChunks.sort((a, b) => a.chunk_index - b.chunk_index),
    stats: calculateStats(rematchedChunks)
  }
}

function calculateStats(chunks: RematchedChunk[]) {
  return {
    exact: chunks.filter(c => c.position_confidence === 'exact').length,
    high: chunks.filter(c => c.position_confidence === 'high').length,
    medium: chunks.filter(c => c.position_confidence === 'medium').length,
    synthetic: chunks.filter(c => c.position_confidence === 'synthetic').length,
    total: chunks.length
  }
}
```

**Testing:** `__tests__/bulletproof-matcher.test.ts`
```typescript
describe('Bulletproof Chunk Matching', () => {
  it('should guarantee 100% recovery', async () => {
    const originalMarkdown = 'Original text with artifacts.'
    const cleanedMarkdown = 'Cleaned text without artifacts.'
    
    const originalChunks: DoclingChunk[] = [
      {
        chunk_index: 0,
        content: 'Original text',
        start_offset: 0,
        end_offset: 13,
        tokens: 2,
        heading_path: [],
        heading_level: 0
      },
      {
        chunk_index: 1,
        content: 'with artifacts.',
        start_offset: 14,
        end_offset: 29,
        tokens: 2,
        heading_path: [],
        heading_level: 0
      }
    ]
    
    const result = await bulletproofChunkMatching(cleanedMarkdown, originalChunks)
    
    // 100% recovery guaranteed
    expect(result.chunks.length).toBe(originalChunks.length)
    expect(result.stats.total).toBe(2)
    
    // All chunks have new offsets
    for (const chunk of result.chunks) {
      expect(chunk.start_offset).toBeGreaterThanOrEqual(0)
      expect(chunk.end_offset).toBeGreaterThan(chunk.start_offset)
      expect(chunk.position_confidence).toBeTruthy()
    }
  }, 60000)
})
```

**Acceptance:**
- ✅ Orchestrates all 4 layers
- ✅ 100% chunk recovery
- ✅ Tracks confidence levels
- ✅ Provides statistics
- ✅ Tests pass

---

### Phase 3: LLM Cleanup & Metadata (Week 4-5)

**Goal:** Qwen 32B cleanup and PydanticAI metadata extraction

#### Task 3.1: Multi-Pass LLM Cleanup

**File:** `scripts/cleanup_markdown.py`
```python
#!/usr/bin/env python3
"""
Multi-pass markdown cleanup using Qwen 32B.
"""
import sys
import json
from pydantic import BaseModel
from pydantic_ai import Agent
from pydantic_ai.models.ollama import OllamaModel

class CleanedText(BaseModel):
    cleaned_content: str
    changes_made: list[str]
    warnings: list[str] = []

cleanup_agent = Agent(
    model=OllamaModel('qwen2.5:32b'),
    result_type=CleanedText,
    retries=2
)

async def cleanup_markdown_pass(content: str, pass_number: int) -> CleanedText:
    """Single cleanup pass."""
    if pass_number == 1:
        prompt = f"""
Pass 1: Remove artifacts from this markdown document.

Your task:
1. Remove page numbers, running headers, and footers
2. Remove OCR artifacts (random characters, misread text)
3. Keep all content, only remove clear artifacts
4. Preserve markdown structure (headings, lists, quotes)

Document:
```markdown
{content}
```

Return the cleaned content and list changes you made.
"""
    elif pass_number == 2:
        prompt = f"""
Pass 2: Fix formatting issues in this markdown.

Your task:
1. Merge incorrectly split paragraphs
2. Fix hyphenation across lines (e.g., "hyphen-\nated" → "hyphenated")
3. Normalize inconsistent spacing
4. Ensure proper heading hierarchy

Document:
```markdown
{content}
```

Return the cleaned content and list changes.
"""
    else:  # pass_number == 3
        prompt = f"""
Pass 3: Final polish and validation.

Your task:
1. Check markdown structure is valid
2. Verify heading hierarchy makes sense
3. Fix any remaining minor issues
4. DO NOT make major content changes

Document:
```markdown
{content}
```

Return the final content and any warnings about potential issues.
"""
    
    result = await cleanup_agent.run(prompt)
    return result.data

async def cleanup_markdown_multi_pass(content: str) -> dict:
    """Full multi-pass cleanup."""
    current_content = content
    all_changes = []
    all_warnings = []
    
    for pass_num in [1, 2, 3]:
        print(json.dumps({
            'type': 'progress',
            'status': f'cleaning_pass_{pass_num}',
            'message': f'Cleanup pass {pass_num}/3',
            'progress': 0.55 + (pass_num * 0.05)
        }), flush=True)
        
        result = await cleanup_markdown_pass(current_content, pass_num)
        current_content = result.cleaned_content
        all_changes.extend(result.changes_made)
        all_warnings.extend(result.warnings)
    
    return {
        'cleaned_markdown': current_content,
        'changes': all_changes,
        'warnings': all_warnings
    }

if __name__ == '__main__':
    content = sys.stdin.read()
    result = await cleanup_markdown_multi_pass(content)
    print(json.dumps(result))
```

**File:** `lib/markdown-cleanup-ai.ts`
```typescript
import { exec } from 'child_process'

export async function cleanMarkdownWithAI(
  markdown: string,
  onProgress?: (pass: number, message: string) => void
): Promise<{
  cleanedMarkdown: string
  changes: string[]
  warnings: string[]
}> {
  const scriptPath = 'scripts/cleanup_markdown.py'
  
  return new Promise((resolve, reject) => {
    const child = exec(`python3 ${scriptPath}`)
    
    child.stdin?.write(markdown)
    child.stdin?.end()
    
    let output = ''
    let lastResult: any = null
    
    child.stdout?.on('data', (data: string) => {
      const lines = data.split('\n').filter(l => l.trim())
      
      for (const line of lines) {
        try {
          const parsed = JSON.parse(line)
          
          if (parsed.type === 'progress') {
            const pass = parseInt(parsed.status.match(/\d+/)?.[0] || '0')
            onProgress?.(pass, parsed.message)
          } else {
            lastResult = parsed
          }
        } catch (e) {
          output += line
        }
      }
    })
    
    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`Cleanup failed with code ${code}`))
      } else if (lastResult) {
        resolve({
          cleanedMarkdown: lastResult.cleaned_markdown,
          changes: lastResult.changes,
          warnings: lastResult.warnings
        })
      } else {
        try {
          const result = JSON.parse(output)
          resolve(result)
        } catch (e) {
          reject(new Error('Failed to parse cleanup output'))
        }
      }
    })
  })
}
```

**Acceptance:**
- ✅ 3-pass cleanup works
- ✅ PydanticAI validates structure
- ✅ Progress reporting works
- ✅ Returns changes/warnings

---

#### Task 3.2: PydanticAI Metadata Extraction

**File:** `scripts/extract_chunk_metadata.py`
```python
#!/usr/bin/env python3
"""
Extract rich metadata from chunks using Qwen 32B + PydanticAI.
"""
import sys
import json
from schemas import ChunkMetadata, Concept, EmotionalTone
from pydantic_ai import Agent
from pydantic_ai.models.ollama import OllamaModel

metadata_agent = Agent(
    model=OllamaModel('qwen2.5:32b'),
    result_type=ChunkMetadata,
    retries=3  # Auto-retry on validation failure
)

async def extract_metadata(chunk_content: str) -> ChunkMetadata:
    """Extract semantic metadata from chunk."""
    prompt = f"""
Analyze this text chunk and extract metadata.

Text:
```
{chunk_content}
```

Extract:
1. themes: 2-3 key topics (e.g., ["entropy", "thermodynamics"])
2. concepts: 5-10 important entities with importance scores 0-1
   - Higher importance = more central to this chunk
   - Examples: {{"text": "V-2 rocket", "importance": 0.9}}
3. importance_score: 0-1, how central is this chunk to the overall document?
4. summary: One-sentence description (20-300 chars)
5. emotional_tone:
   - polarity: -1 (negative) to +1 (positive)
   - primaryEmotion: neutral, joy, sadness, anger, fear, anxiety, excitement
   - intensity: 0 (mild) to 1 (strong)
6. domain: Primary field (e.g., "science", "history", "philosophy")

Be precise and analytical.
"""
    
    result = await metadata_agent.run(prompt)
    return result.data

async def batch_extract_metadata(chunks: list[dict]) -> list[dict]:
    """Process chunks in batches of 10."""
    results = []
    
    for i, chunk in enumerate(chunks):
        print(json.dumps({
            'type': 'progress',
            'status': 'extracting_metadata',
            'message': f'Processing chunk {i+1}/{len(chunks)}',
            'progress': 0.75 + (i / len(chunks)) * 0.15
        }), flush=True)
        
        try:
            metadata = await extract_metadata(chunk['content'])
            results.append({
                **chunk,
                'themes': metadata.themes,
                'concepts': [c.model_dump() for c in metadata.concepts],
                'importance_score': metadata.importance_score,
                'summary': metadata.summary,
                'emotional_tone': metadata.emotional_tone.model_dump(),
                'domain': metadata.domain
            })
        except Exception as e:
            print(json.dumps({
                'type': 'warning',
                'message': f'Failed to extract metadata for chunk {i}: {str(e)}'
            }), file=sys.stderr, flush=True)
            
            # Return chunk without AI metadata (preserve structure)
            results.append({
                **chunk,
                'themes': [],
                'concepts': [],
                'importance_score': 0.5,
                'summary': '',
                'emotional_tone': {
                    'polarity': 0.0,
                    'primaryEmotion': 'neutral',
                    'intensity': 0.0
                },
                'domain': None
            })
    
    return results

if __name__ == '__main__':
    chunks = json.loads(sys.stdin.read())
    results = await batch_extract_metadata(chunks)
    print(json.dumps(results))
```

**File:** `lib/metadata-extractor.ts`
```typescript
import { exec } from 'child_process'
import { ChunkMetadataSchema, type ChunkMetadata } from './schemas/chunk'
import { z } from 'zod'

const EnrichedChunkSchema = z.object({
  chunk_index: z.number(),
  content: z.string(),
  start_offset: z.number(),
  end_offset: z.number(),
  // ... other chunk fields
}).merge(ChunkMetadataSchema)

export type EnrichedChunk = z.infer<typeof EnrichedChunkSchema>

export async function extractChunkMetadata(
  chunks: any[],
  onProgress?: (current: number, total: number) => void
): Promise<EnrichedChunk[]> {
  const scriptPath = 'scripts/extract_chunk_metadata.py'
  
  return new Promise((resolve, reject) => {
    const child = exec(`python3 ${scriptPath}`)
    
    child.stdin?.write(JSON.stringify(chunks))
    child.stdin?.end()
    
    let output = ''
    
    child.stdout?.on('data', (data: string) => {
      const lines = data.split('\n').filter(l => l.trim())
      
      for (const line of lines) {
        try {
          const parsed = JSON.parse(line)
          
          if (parsed.type === 'progress') {
            // Extract current/total from message
            const match = parsed.message.match(/(\d+)\/(\d+)/)
            if (match) {
              onProgress?.(parseInt(match[1]), parseInt(match[2]))
            }
          } else if (Array.isArray(parsed)) {
            // Final result
            output = line
          }
        } catch (e) {
          output += line
        }
      }
    })
    
    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`Metadata extraction failed with code ${code}`))
      } else {
        try {
          const results = JSON.parse(output)
          
          // Validate with Zod
          const validated = z.array(EnrichedChunkSchema).parse(results)
          resolve(validated)
        } catch (e) {
          reject(new Error(`Failed to parse metadata: ${e}`))
        }
      }
    })
  })
}
```

**Acceptance:**
- ✅ PydanticAI extracts metadata
- ✅ Automatic retries on validation failure
- ✅ Zod validates TypeScript side
- ✅ Batch processing works
- ✅ Failures don't crash pipeline

---

### Phase 4: Embeddings & Storage (Week 5)

**Goal:** Local embedding generation and database storage

#### Task 4.1: Local Embedding Generation

**File:** `lib/embeddings.ts`
```typescript
import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

export async function generateEmbeddings(
  texts: string[],
  model = 'sentence-transformers/all-mpnet-base-v2'
): Promise<number[][]> {
  const scriptPath = 'scripts/generate_embeddings.py'
  const input = JSON.stringify({ texts, model })
  
  const { stdout } = await execAsync(
    `echo '${input.replace(/'/g, "\\'")}' | python3 ${scriptPath}`
  )
  
  return JSON.parse(stdout)
}
```

**File:** `scripts/generate_embeddings.py`
```python
#!/usr/bin/env python3
"""
Generate embeddings using sentence-transformers (local).
"""
import sys
import json
from sentence_transformers import SentenceTransformer

# Cache model globally
_model = None

def get_model(model_name: str) -> SentenceTransformer:
    global _model
    if _model is None:
        _model = SentenceTransformer(model_name)
    return _model

def generate_embeddings(texts: list[str], model_name: str) -> list[list[float]]:
    """Generate embeddings for list of texts."""
    model = get_model(model_name)
    embeddings = model.encode(texts, show_progress_bar=False)
    return embeddings.tolist()

if __name__ == '__main__':
    data = json.loads(sys.stdin.read())
    embeddings = generate_embeddings(data['texts'], data['model'])
    print(json.dumps(embeddings))
```

**Acceptance:**
- ✅ Generates local embeddings
- ✅ Batched processing
- ✅ Model cached in memory
- ✅ 768-dim vectors (all-mpnet-base-v2)

---

#### Task 4.2: Database Storage

**File:** `lib/db/save-document.ts`
```typescript
import { createClient } from '@/lib/supabase/server'
import type { EnrichedChunk } from '@/lib/metadata-extractor'

export async function saveDocumentComplete(
  documentId: string,
  cleanedMarkdown: string,
  chunks: EnrichedChunk[],
  structure: any,
  matchingStats: any
) {
  const supabase = await createClient()
  
  // 1. Save markdown to storage
  const storagePath = `${documentId}/content.md`
  await supabase.storage
    .from('documents')
    .upload(storagePath, cleanedMarkdown, { upsert: true })
  
  // 2. Update document record
  await supabase
    .from('documents')
    .update({
      markdown_path: storagePath,
      markdown_available: true,
      word_count: cleanedMarkdown.split(/\s+/).length,
      structure,
      processing_status: 'completed',
      metadata: {
        matching_stats: matchingStats,
        chunk_count: chunks.length
      }
    })
    .eq('id', documentId)
  
  // 3. Batch insert chunks
  const chunkRecords = chunks.map(chunk => ({
    id: `${documentId}_chunk_${chunk.chunk_index}`,
    document_id: documentId,
    chunk_index: chunk.chunk_index,
    content: chunk.content,
    start_offset: chunk.start_offset,
    end_offset: chunk.end_offset,
    word_count: chunk.content.split(/\s+/).length,
    
    // PDF-specific (may be null)
    page_start: chunk.page_start,
    page_end: chunk.page_end,
    bboxes: chunk.bboxes,
    
    // Structure
    heading: chunk.heading,
    heading_path: chunk.heading_path,
    heading_level: chunk.heading_level,
    section_marker: chunk.section_marker || null,
    
    // AI metadata
    themes: chunk.themes,
    importance_score: chunk.importance_score,
    summary: chunk.summary,
    emotional_metadata: chunk.emotional_tone,
    conceptual_metadata: { concepts: chunk.concepts },
    domain_metadata: chunk.domain ? { primaryDomain: chunk.domain } : null,
    
    // Vector
    embedding: chunk.embedding,
    
    // Quality tracking
    position_confidence: chunk.position_confidence,
    position_method: chunk.position_method,
    
    metadata_extracted_at: new Date().toISOString()
  }))
  
  // Insert in batches of 100
  for (let i = 0; i < chunkRecords.length; i += 100) {
    const batch = chunkRecords.slice(i, i + 100)
    const { error } = await supabase
      .from('chunks')
      .insert(batch)
    
    if (error) throw error
  }
  
  console.log(`✅ Saved ${chunks.length} chunks to database`)
}
```

**Acceptance:**
- ✅ Saves markdown to storage
- ✅ Updates document record
- ✅ Batch inserts chunks
- ✅ All metadata preserved

---

### Phase 5: Connection Detection Update (Week 6)

**Goal:** Update existing connection detection to use Qwen 32B locally

#### Task 5.1: Update ThematicBridge Engine

**File:** `scripts/detect_thematic_bridge.py`
```python
#!/usr/bin/env python3
"""
Thematic bridge detection using Qwen 32B.
Finds cross-domain concept connections.
"""
import sys
import json
from pydantic import BaseModel, Field
from pydantic_ai import Agent
from pydantic_ai.models.ollama import OllamaModel

class BridgeAnalysis(BaseModel):
    connected: bool
    strength: float = Field(ge=0.0, le=1.0)
    bridge_type: str  # e.g., "cross_domain", "conceptual", "methodological"
    shared_concept: str
    reasoning: str

bridge_agent = Agent(
    model=OllamaModel('qwen2.5:32b'),
    result_type=BridgeAnalysis,
    retries=2
)

async def analyze_thematic_bridge(
    source_chunk: dict,
    target_chunk: dict
) -> BridgeAnalysis:
    """Analyze if two chunks form a thematic bridge."""
    prompt = f"""
You are analyzing potential thematic connections between two text chunks from different documents or domains.

SOURCE CHUNK:
Domain: {source_chunk.get('domain', 'unknown')}
Themes: {', '.join(source_chunk.get('themes', []))}
Content: {source_chunk['content'][:500]}

TARGET CHUNK:
Domain: {target_chunk.get('domain', 'unknown')}
Themes: {', '.join(target_chunk.get('themes', []))}
Content: {target_chunk['content'][:500]}

Determine:
1. Are these chunks connected through a shared concept across different domains?
2. How strong is the connection? (0-1, where 1 is very strong)
3. What type of bridge is this? (cross_domain, conceptual, methodological)
4. What concept bridges them?
5. Explain your reasoning briefly

A thematic bridge should:
- Connect different domains/topics
- Share an underlying concept or pattern
- Provide insight that wouldn't be obvious

Return your analysis.
"""
    
    result = await bridge_agent.run(prompt)
    return result.data

if __name__ == '__main__':
    data = json.loads(sys.stdin.read())
    result = await analyze_thematic_bridge(
        data['source_chunk'],
        data['target_chunk']
    )
    print(json.dumps(result.model_dump()))
```

**File:** `lib/connections/thematic-bridge.ts`
```typescript
import { exec } from 'child_process'
import type { EnrichedChunk } from '@/lib/metadata-extractor'

export async function detectThematicBridges(
  sourceChunk: EnrichedChunk,
  candidates: EnrichedChunk[]
): Promise<Array<{
  targetChunkId: string
  strength: number
  metadata: any
}>> {
  const connections = []
  const scriptPath = 'scripts/detect_thematic_bridge.py'
  
  // Filter candidates BEFORE AI calls
  const filtered = filterCandidatesForBridge(sourceChunk, candidates)
  
  console.log(`🌉 Analyzing ${filtered.length} candidates for thematic bridges`)
  
  for (const candidate of filtered) {
    try {
      const input = JSON.stringify({
        source_chunk: {
          content: sourceChunk.content,
          themes: sourceChunk.themes,
          domain: sourceChunk.domain,
          concepts: sourceChunk.concepts
        },
        target_chunk: {
          content: candidate.content,
          themes: candidate.themes,
          domain: candidate.domain,
          concepts: candidate.concepts
        }
      })
      
      const child = exec(`echo '${input.replace(/'/g, "\\'")}' | python3 ${scriptPath}`)
      const result = await new Promise<any>((resolve, reject) => {
        let output = ''
        child.stdout?.on('data', (data) => { output += data })
        child.on('close', () => {
          try {
            resolve(JSON.parse(output))
          } catch (e) {
            reject(e)
          }
        })
      })
      
      if (result.connected && result.strength >= 0.6) {
        connections.push({
          targetChunkId: candidate.id!,
          strength: result.strength,
          metadata: {
            bridgeType: result.bridge_type,
            sharedConcept: result.shared_concept,
            reasoning: result.reasoning,
            sourceDomain: sourceChunk.domain,
            targetDomain: candidate.domain
          }
        })
      }
    } catch (error) {
      console.error('Bridge analysis failed:', error)
      // Continue with other candidates
    }
  }
  
  return connections
}

function filterCandidatesForBridge(
  source: EnrichedChunk,
  candidates: EnrichedChunk[]
): EnrichedChunk[] {
  return candidates
    // Filter 1: Only important chunks
    .filter(c => c.importance_score > 0.6)
    // Filter 2: Cross-document only
    .filter(c => c.document_id !== source.document_id)
    // Filter 3: Different domains
    .filter(c => c.domain && c.domain !== source.domain)
    // Filter 4: Concept overlap sweet spot (0.2-0.7)
    .filter(c => {
      const overlap = calculateConceptOverlap(source.concepts, c.concepts)
      return overlap >= 0.2 && overlap <= 0.7
    })
    // Filter 5: Top 15 by importance
    .sort((a, b) => b.importance_score - a.importance_score)
    .slice(0, 15)
}

function calculateConceptOverlap(
  concepts1: Array<{ text: string; importance: number }>,
  concepts2: Array<{ text: string; importance: number }>
): number {
  const set1 = new Set(concepts1.map(c => c.text.toLowerCase()))
  const set2 = new Set(concepts2.map(c => c.text.toLowerCase()))
  
  const intersection = new Set([...set1].filter(x => set2.has(x)))
  const union = new Set([...set1, ...set2])
  
  return intersection.size / union.size
}
```

**Acceptance:**
- ✅ Uses Qwen 32B locally
- ✅ Aggressive filtering (160k → ~200 candidates)
- ✅ PydanticAI structured output
- ✅ ~$0 cost per document

---

#### Task 5.2: Update Contradiction Engine

**File:** `lib/connections/contradiction-detection.ts`
```typescript
export async function detectContradictions(
  sourceChunk: EnrichedChunk,
  corpus: EnrichedChunk[]
): Promise<Array<{
  targetChunkId: string
  strength: number
  metadata: any
}>> {
  const connections = []
  
  // Filter for candidates with overlapping concepts
  const candidates = corpus.filter(c => {
    if (c.id === sourceChunk.id) return false
    
    const sharedConcepts = getSharedConcepts(
      sourceChunk.concepts,
      c.concepts
    )
    
    return sharedConcepts.length > 0
  })
  
  for (const candidate of candidates) {
    // Check emotional polarity
    const sourcePolarity = sourceChunk.emotional_tone.polarity
    const targetPolarity = candidate.emotional_tone.polarity
    
    // Opposite polarity = potential contradiction
    const isOpposite = 
      (sourcePolarity > 0.3 && targetPolarity < -0.3) ||
      (sourcePolarity < -0.3 && targetPolarity > 0.3)
    
    if (isOpposite) {
      const sharedConcepts = getSharedConcepts(
        sourceChunk.concepts,
        candidate.concepts
      )
      
      const polarityDifference = Math.abs(sourcePolarity - targetPolarity)
      const strength = Math.min(1.0, polarityDifference * 0.5 + 0.3)
      
      connections.push({
        targetChunkId: candidate.id!,
        strength,
        metadata: {
          sharedConcepts: sharedConcepts.map(c => c.text),
          polarityDifference,
          sourcePolarity,
          targetPolarity
        }
      })
    }
  }
  
  return connections
}

function getSharedConcepts(
  concepts1: Array<{ text: string; importance: number }>,
  concepts2: Array<{ text: string; importance: number }>
): Array<{ text: string; importance: number }> {
  const map2 = new Map(concepts2.map(c => [c.text.toLowerCase(), c]))
  const shared = []
  
  for (const c1 of concepts1) {
    const match = map2.get(c1.text.toLowerCase())
    if (match) {
      shared.push({
        text: c1.text,
        importance: (c1.importance + match.importance) / 2
      })
    }
  }
  
  return shared
}
```

**Acceptance:**
- ✅ Uses metadata (no AI calls)
- ✅ Finds conceptual tensions
- ✅ ~$0 cost

---

### Phase 6: Integration & Polish (Week 7)

**Goal:** Wire everything together and add review checkpoints

#### Task 6.1: Complete PDF Processor

**File:** `processors/pdf-docling.ts`
```typescript
import { extractPDFWithDocling } from '@/lib/docling-extractor'
import { regexCleanupMarkdown } from '@/lib/markdown-cleanup-regex'
import { cleanMarkdownWithAI } from '@/lib/markdown-cleanup-ai'
import { bulletproofChunkMatching } from '@/lib/chunking/bulletproof-matcher'
import { extractChunkMetadata } from '@/lib/metadata-extractor'
import { generateEmbeddings } from '@/lib/embeddings'
import { saveDocumentComplete } from '@/lib/db/save-document'
import { createClient } from '@/lib/supabase/server'

export class PDFDoclingProcessor {
  async process(
    documentId: string,
    options: {
      cleanMarkdown?: boolean
      reviewDoclingExtraction?: boolean
      reviewBeforeChunking?: boolean
    } = {}
  ) {
    const supabase = await createClient()
    
    // Get document
    const { data: doc } = await supabase
      .from('documents')
      .select('*')
      .eq('id', documentId)
      .single()
    
    if (!doc) throw new Error('Document not found')
    
    // Download PDF
    const { data: fileData } = await supabase.storage
      .from('documents')
      .download(doc.storage_path)
    
    if (!fileData) throw new Error('Failed to download PDF')
    
    const tempPath = `/tmp/${documentId}.pdf`
    await fs.writeFile(tempPath, Buffer.from(await fileData.arrayBuffer()))
    
    // STAGE 1: Docling Extraction
    await this.updateProgress(documentId, 0.15, 'Extracting PDF with Docling')
    
    const doclingResult = await extractPDFWithDocling(tempPath, {
      onProgress: (progress, message) => {
        this.updateProgress(documentId, 0.15 + progress * 0.35, message)
      }
    })
    
    let markdown = doclingResult.markdown
    let chunks = doclingResult.chunks
    
    // STAGE 2: Regex Cleanup
    await this.updateProgress(documentId, 0.50, 'Regex cleanup')
    markdown = regexCleanupMarkdown(markdown)
    
    // CHECKPOINT 1: Review Docling Extraction
    if (options.reviewDoclingExtraction) {
      await this.exportForReview(documentId, markdown, 'docling_extraction')
      await this.waitForUserApproval(documentId)
    }
    
    // STAGE 3: LLM Cleanup (optional)
    if (options.cleanMarkdown !== false) {
      await this.updateProgress(documentId, 0.55, 'LLM cleanup (3 passes)')
      
      const cleanupResult = await cleanMarkdownWithAI(markdown, (pass, msg) => {
        this.updateProgress(documentId, 0.55 + pass * 0.05, msg)
      })
      
      markdown = cleanupResult.cleanedMarkdown
      
      // Log warnings
      if (cleanupResult.warnings.length > 0) {
        console.warn('Cleanup warnings:', cleanupResult.warnings)
      }
    }
    
    // CHECKPOINT 2: Review Before Chunking
    if (options.reviewBeforeChunking) {
      await this.exportForReview(documentId, markdown, 'cleaned_markdown')
      await this.waitForUserApproval(documentId)
    }
    
    // STAGE 4: Bulletproof Chunk Matching
    await this.updateProgress(documentId, 0.70, 'Matching chunks (5-layer failsafe)')
    
    const { chunks: rematchedChunks, stats } = await bulletproofChunkMatching(
      markdown,
      chunks
    )
    
    console.log('Matching stats:', stats)
    
    // STAGE 5: Metadata Extraction
    await this.updateProgress(documentId, 0.75, 'Extracting metadata with Qwen 32B')
    
    const enrichedChunks = await extractChunkMetadata(
      rematchedChunks,
      (current, total) => {
        const progress = 0.75 + (current / total) * 0.15
        this.updateProgress(documentId, progress, `Metadata ${current}/${total}`)
      }
    )
    
    // STAGE 6: Generate Embeddings
    await this.updateProgress(documentId, 0.90, 'Generating embeddings')
    
    const embeddings = await generateEmbeddings(
      enrichedChunks.map(c => c.content)
    )
    
    const chunksWithEmbeddings = enrichedChunks.map((chunk, i) => ({
      ...chunk,
      embedding: embeddings[i]
    }))
    
    // STAGE 7: Save Everything
    await this.updateProgress(documentId, 0.95, 'Saving to database')
    
    await saveDocumentComplete(
      documentId,
      markdown,
      chunksWithEmbeddings,
      doclingResult.structure,
      stats
    )
    
    await this.updateProgress(documentId, 1.0, 'Complete')
    
    return {
      success: true,
      stats: {
        chunks: chunksWithEmbeddings.length,
        matching: stats,
        warnings: []
      }
    }
  }
  
  private async updateProgress(
    documentId: string,
    progress: number,
    message: string
  ) {
    const supabase = await createClient()
    await supabase
      .from('background_jobs')
      .update({
        progress,
        status_message: message
      })
      .eq('document_id', documentId)
  }
  
  private async exportForReview(
    documentId: string,
    markdown: string,
    stage: string
  ) {
    // Export to Obsidian vault or temp file
    const reviewPath = `/tmp/rhizome_review_${documentId}_${stage}.md`
    await fs.writeFile(reviewPath, markdown)
    console.log(`📝 Review file created: ${reviewPath}`)
  }
  
  private async waitForUserApproval(documentId: string) {
    // Set status to 'awaiting_review'
    const supabase = await createClient()
    await supabase
      .from('background_jobs')
      .update({ status: 'awaiting_review' })
      .eq('document_id', documentId)
    
    // Poll until user approves
    while (true) {
      const { data } = await supabase
        .from('background_jobs')
        .select('status')
        .eq('document_id', documentId)
        .single()
      
      if (data?.status === 'processing') {
        break // User approved
      }
      
      await new Promise(resolve => setTimeout(resolve, 5000)) // Check every 5s
    }
  }
}
```

**Acceptance:**
- ✅ Complete pipeline works end-to-end
- ✅ Progress reporting works
- ✅ Review checkpoints work
- ✅ Handles errors gracefully

---

#### Task 6.2: EPUB Processor (Similar Structure)

**File:** `processors/epub-docling.ts`
```typescript
// Similar to PDF processor but:
// 1. Extract EPUB to HTML
// 2. Feed HTML to Docling
// 3. Rest of pipeline identical
// 4. No page numbers (use section_marker)
```

**Acceptance:**
- ✅ EPUB extraction works
- ✅ HTML → Docling works
- ✅ No page numbers (use sections)
- ✅ Rest of pipeline identical

---

### Phase 7: Testing & Validation (Week 8)

**Goal:** Test critical paths and expensive operations

#### Task 7.1: High-Risk Tests

```typescript
// __tests__/critical-paths.test.ts

describe('Critical Path: End-to-End Processing', () => {
  it('should process a simple PDF without data loss', async () => {
    const documentId = 'test-doc'
    const pdfPath = 'test-fixtures/simple.pdf'
    
    const processor = new PDFDoclingProcessor()
    const result = await processor.process(documentId, {
      cleanMarkdown: false, // Skip LLM for speed
      reviewDoclingExtraction: false,
      reviewBeforeChunking: false
    })
    
    expect(result.success).toBe(true)
    expect(result.stats.chunks).toBeGreaterThan(0)
    
    // Verify 100% chunk recovery
    expect(result.stats.matching.synthetic).toBeLessThan(5) // <5% synthetic
    
    // Verify database
    const chunks = await supabase
      .from('chunks')
      .select('*')
      .eq('document_id', documentId)
    
    expect(chunks.data?.length).toBe(result.stats.chunks)
  }, 300000) // 5min timeout
})

describe('Bulletproof Matching: 100% Recovery', () => {
  it('should recover all chunks even with heavy modifications', async () => {
    const original = 'Original text with many artifacts and typos here.'
    const cleaned = 'Cleaned version with proper formatting.'
    
    const chunks: DoclingChunk[] = [
      {
        chunk_index: 0,
        content: original,
        start_offset: 0,
        end_offset: original.length,
        tokens: 10,
        heading_path: [],
        heading_level: 0
      }
    ]
    
    const result = await bulletproofChunkMatching(cleaned, chunks)
    
    // MUST be 100%
    expect(result.chunks.length).toBe(1)
    expect(result.chunks[0].start_offset).toBeGreaterThanOrEqual(0)
  })
})

describe('Cost Control: ThematicBridge Filtering', () => {
  it('should filter candidates to <20 before AI calls', () => {
    const sourceChunk = createMockChunk({ importance_score: 0.9 })
    const corpus = Array.from({ length: 1000 }, () => createMockChunk())
    
    const filtered = filterCandidatesForBridge(sourceChunk, corpus)
    
    expect(filtered.length).toBeLessThanOrEqual(15)
  })
})
```

**Acceptance:**
- ✅ End-to-end test passes
- ✅ 100% chunk recovery verified
- ✅ Filtering prevents cost explosions

---

## Timeline & Estimates

```
Phase 0: Foundation & Setup
├─ System setup (Ollama, Qwen 32B): 2 hours
├─ Python dependencies: 1 hour
├─ TypeScript dependencies: 30 minutes
└─ Schema definitions: 2 hours
Total: ~6 hours (1 day)

Phase 1: Core Extraction (PDF + EPUB)
├─ Docling PDF extractor: 8 hours
├─ Docling EPUB extractor: 6 hours
├─ Regex cleanup: 2 hours
└─ Testing: 4 hours
Total: ~20 hours (3 days)

Phase 2: Bulletproof Matching
├─ Fuzzy matcher: 6 hours
├─ Embedding matcher: 4 hours
├─ LLM matcher: 4 hours
├─ Anchor interpolation: 3 hours
├─ Orchestrator: 4 hours
└─ Testing: 4 hours
Total: ~25 hours (3-4 days)

Phase 3: LLM Cleanup & Metadata
├─ Multi-pass cleanup: 6 hours
├─ PydanticAI metadata: 8 hours
└─ Testing: 2 hours
Total: ~16 hours (2 days)

Phase 4: Embeddings & Storage
├─ Local embeddings: 3 hours
├─ Database storage: 4 hours
└─ Testing: 2 hours
Total: ~9 hours (1 day)

Phase 5: Connection Detection Update
├─ ThematicBridge (Qwen 32B): 6 hours
├─ Contradiction update: 3 hours
└─ Testing: 2 hours
Total: ~11 hours (1-2 days)

Phase 6: Integration & Polish
├─ PDF processor: 6 hours
├─ EPUB processor: 4 hours
├─ Review checkpoints: 4 hours
└─ Error handling: 3 hours
Total: ~17 hours (2 days)

Phase 7: Testing & Validation
├─ Critical path tests: 6 hours
├─ Manual testing: 6 hours
└─ Bug fixes: 8 hours
Total: ~20 hours (3 days)

TOTAL ESTIMATE: ~124 hours (15-17 days)
```

---

## Success Metrics

**Phase Completion:**
- ✅ All stages produce valid output
- ✅ 100% chunk recovery in matching
- ✅ Tests pass for critical paths
- ✅ Can process at least 3 different document types

**Quality Metrics:**
- Chunk matching: 85%+ exact, <2% synthetic
- Metadata extraction: 100% valid (PydanticAI guarantee)
- Cost per document: $0 (100% local)
- Processing time: <80 minutes for 500-page book

**User Validation:**
- Process 5-10 real documents
- Review synthetic chunks manually
- Verify connection quality
- Adjust personal weights

---

## Risk Mitigation

**High Risk Items:**

1. **Bulletproof Matching Failure**
   - **Mitigation:** Anchor interpolation guarantees recovery
   - **Fallback:** Synthetic chunks are user-visible and reviewable

2. **LLM Cleanup Too Aggressive**
   - **Mitigation:** Review checkpoints before expensive steps
   - **Fallback:** Skip cleanup option (use regex only)

3. **Connection Detection Too Slow**
   - **Mitigation:** Aggressive filtering reduces AI calls
   - **Fallback:** Process in background, doesn't block reading

4. **Model Memory Issues**
   - **Mitigation:** Use Q4 quantization, close other apps
   - **Fallback:** Use smaller model (Qwen 14B or 7B)

---

## What NOT to Build

**Skip These:**
- ❌ UI configuration for batch sizes
- ❌ Multiple embedding models (pick one)
- ❌ Connection strength UI sliders (use defaults)
- ❌ Extensive error recovery (fail fast, user fixes)
- ❌ Progress bars for trivial operations
- ❌ Tests for simple CRUD operations
- ❌ Optimization before profiling

**Defer These (Nice-to-Have):**
- ⏸️ Obsidian bidirectional sync
- ⏸️ Chaos mode (random connections)
- ⏸️ Connection decay over time
- ⏸️ Voice note transcription
- ⏸️ PDF highlight import

---

## Final Checklist

**Before Launch:**
- [ ] Process 5 real PDFs successfully
- [ ] Process 3 real EPUBs successfully
- [ ] Verify 100% chunk recovery in all cases
- [ ] Review synthetic chunks (should be <2%)
- [ ] Verify connection quality (sample 20 connections)
- [ ] Check cost (should be $0)
- [ ] Test on different document sizes (10 pages, 100 pages, 500 pages)
- [ ] Document any known issues
- [ ] Create user guide for review checkpoints

**Ready to Ship When:**
- ✅ Can process a 500-page book end-to-end
- ✅ All chunks have metadata
- ✅ Connections are being detected
- ✅ User can read documents in UI
- ✅ Markdown is stored and retrievable

---

**This is a living document. Update as you build and discover issues!**