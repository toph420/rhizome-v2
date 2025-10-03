# EPUB Processor Implementation Plan

**Status**: Ready to implement
**Estimated Time**: 6 hours
**Cost Impact**: $0.40/book (vs $0.50 for PDF)

## Core Principle

EPUBs use the **same AI chunking pipeline** as PDFs. Chapters are batch boundaries, not semantic chunks.

```
EPUB → Parse OPF (free) → Convert HTML→MD (free) → AI chunk each chapter ($0.40) → 3-engine detection
```

## Implementation Checklist

### 1. EPUB Parser (`worker/lib/epub/epub-parser.ts`) - 3.5 hours

**Dependencies:**
```bash
cd worker
npm install adm-zip fast-xml-parser turndown
npm install -D @types/adm-zip
```

**Interface:**
```typescript
export interface EPUBMetadata {
  title: string
  author: string
  publisher?: string
  publicationDate?: string
  isbn?: string
  language: string
  description?: string
  subjects: string[]  // For type inference
}

export interface EPUBChapter {
  id: string
  title: string
  href: string
  content: string    // Raw HTML
  markdown: string   // Converted during extraction
  order: number
}

export async function parseEPUB(buffer: Buffer): Promise<{
  metadata: EPUBMetadata
  chapters: EPUBChapter[]
  coverImage: Buffer | null
}>
```

**Key Features:**
- Parse OPF file for metadata
- Extract subjects array for type inference
- Convert HTML to markdown during chapter extraction
- **3-strategy cover extraction**:
  1. Look for `cover-image` property
  2. Look for `id="cover"` in manifest
  3. Look for `<meta name="cover">` in metadata
- **Fail-fast error handling**: Throw on corrupted EPUB, don't continue with partial data

**Error Messages:**
```typescript
// Corrupted chapter reference
throw new Error(`EPUB is corrupted: Chapter ${i + 1} references missing manifest item '${idref}'`)

// Failed to read chapter
throw new Error(`EPUB is corrupted: Failed to read chapter ${i + 1} at ${fullPath}: ${err.message}`)

// No chapters found
throw new Error('EPUB is corrupted: No readable chapters found')
```

### 2. HTML to Markdown (`worker/lib/epub/html-to-markdown.ts`) - Included in parser time

```typescript
import TurndownService from 'turndown'

const turndown = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
  emDelimiter: '*',
  strongDelimiter: '**'
})

turndown.addRule('pageBreak', {
  filter: (node) => node.nodeName === 'DIV' &&
                    node.getAttribute('class')?.includes('page-break'),
  replacement: () => '\n\n---\n\n'
})

export function htmlToMarkdown(html: string): string {
  let cleaned = html
    .replace(/<\?xml[^>]*\?>/g, '')
    .replace(/xmlns="[^"]*"/g, '')
    .replace(/<epub:[^>]*>/g, '')
    .replace(/<\/epub:[^>]*>/g, '')

  return turndown.turndown(cleaned)
}
```

### 3. Type Inference (`worker/lib/epub/type-inference.ts`) - 15 min

```typescript
import type { EPUBMetadata } from './epub-parser'
import type { DocumentType } from '../types/processor'

export function inferDocumentType(metadata: EPUBMetadata): DocumentType {
  const subjects = metadata.subjects?.join(' ').toLowerCase() || ''
  const publisher = metadata.publisher?.toLowerCase() || ''

  // Technical
  if (publisher.includes("o'reilly") ||
      publisher.includes('packt') ||
      subjects.includes('programming')) {
    return 'technical_manual'
  }

  // Academic
  if (subjects.includes('textbook') ||
      subjects.includes('academic') ||
      publisher.includes('university press')) {
    return 'academic_paper'
  }

  // Fiction (default)
  return 'fiction'
}
```

### 4. EPUB Processor (`worker/processors/epub-processor.ts`) - 1 hour

```typescript
import { SourceProcessor } from './base.js'
import { parseEPUB } from '../lib/epub/epub-parser.js'
import { inferDocumentType } from '../lib/epub/type-inference.js'
import { batchChunkAndExtractMetadata } from '../lib/ai-chunking-batch.js'

export class EPUBProcessor extends SourceProcessor {
  async process(): Promise<ProcessorResult> {
    // 1. Download and parse EPUB (FREE)
    const buffer = await this.downloadFile()
    const { metadata, chapters, coverImage } = await parseEPUB(buffer)

    // 2. Save cover image
    if (coverImage) {
      await this.supabase.storage
        .from('documents')
        .upload(`${this.job.storage_path}/cover.jpg`, coverImage, {
          contentType: 'image/jpeg',
          upsert: true
        })
    }

    // 3. Combine chapters into full document
    const fullMarkdown = chapters
      .map(ch => `# ${ch.title}\n\n${ch.markdown}`)
      .join('\n\n---\n\n')

    // 4. AI CHUNKING - Same as PDFs, chapter boundaries
    const documentType = inferDocumentType(metadata)
    const chunks = await batchChunkAndExtractMetadata(
      this.ai,
      fullMarkdown,
      documentType,
      {
        customBatches: chapters.map((ch, i) => ({
          content: ch.markdown,
          startOffset: this.calculateOffset(fullMarkdown, i),
          endOffset: this.calculateOffset(fullMarkdown, i + 1)
        }))
      }
    )

    // 5. Save to storage
    await this.saveToStorage(fullMarkdown)

    return {
      markdown: fullMarkdown,
      chunks,
      metadata: {
        title: metadata.title,
        author: metadata.author,
        document_type: documentType,
        isbn: metadata.isbn,
        publisher: metadata.publisher,
        publication_date: metadata.publicationDate,
        language: metadata.language
      }
    }
  }

  private calculateOffset(markdown: string, chapterIndex: number): number {
    const chapters = markdown.split('\n\n---\n\n')
    return chapters.slice(0, chapterIndex).join('\n\n---\n\n').length
  }
}
```

### 5. Update AI Chunking Config (`worker/lib/ai-chunking-batch.ts`) - 15 min

```typescript
export interface BatchMetadataConfig {
  maxBatchSize?: number
  customBatches?: Array<{
    content: string
    startOffset: number
    endOffset: number
  }>
}

export async function batchChunkAndExtractMetadata(
  ai: GoogleGenAI,
  markdown: string,
  documentType: DocumentType,
  config: BatchMetadataConfig = {}
): Promise<ChunkWithOffsets[]> {

  // Use custom batches (EPUB chapters) OR default windowing (PDFs)
  const batches = config.customBatches || createDefaultBatches(markdown, 100000)

  const allChunks = []
  for (const batch of batches) {
    const result = await callGeminiForMetadata(ai, batch.content, documentType)
    allChunks.push(...parseChunksWithMetadata(result, batch.startOffset))
  }

  return allChunks
}
```

**Note**: Don't split large chapters. Gemini 2.0 Flash handles 1M token context. A 50K character chapter = ~12K tokens (well within limits).

### 6. Database Migration (`supabase/migrations/026_epub_support.sql`) - 15 min

```sql
-- Add EPUB-specific metadata fields
ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS isbn TEXT,
  ADD COLUMN IF NOT EXISTS publisher TEXT,
  ADD COLUMN IF NOT EXISTS publication_date DATE,
  ADD COLUMN IF NOT EXISTS language TEXT;

-- Add index for ISBN lookups
CREATE INDEX IF NOT EXISTS idx_documents_isbn
  ON documents(isbn)
  WHERE isbn IS NOT NULL;

COMMENT ON COLUMN documents.isbn IS 'ISBN from EPUB metadata';
COMMENT ON COLUMN documents.publisher IS 'Publisher from EPUB/PDF metadata';
COMMENT ON COLUMN documents.publication_date IS 'Publication date from EPUB metadata';
```

### 7. Router Update (`worker/processors/router.ts`) - 10 min

```typescript
import { EPUBProcessor } from './epub-processor.js'

export class ProcessorRouter {
  static createProcessor(
    sourceType: SourceType,
    ai: any,
    supabase: any,
    job: any
  ): SourceProcessor {
    switch (sourceType) {
      case 'epub':
        console.log('📚 Using EPUBProcessor')
        return new EPUBProcessor(ai, supabase, job)

      case 'pdf':
        console.log('📄 Using PDFProcessor')
        return new PDFProcessor(ai, supabase, job)

      // ... existing cases
    }
  }
}
```

### 8. Type Updates (`worker/types/multi-format.ts`) - 5 min

```typescript
export type SourceType =
  | 'pdf'
  | 'youtube'
  | 'web_url'
  | 'markdown_asis'
  | 'markdown_clean'
  | 'txt'
  | 'paste'
  | 'epub'  // Add this
```

### 9. Frontend Upload Detection (`src/components/library/UploadZone.tsx`) - 10 min

```typescript
// Detect EPUB MIME type
const acceptedTypes = {
  'application/pdf': ['.pdf'],
  'application/epub+zip': ['.epub'],  // Add this
  'text/markdown': ['.md'],
  'text/plain': ['.txt']
}

// Route to correct processor
function detectSourceType(file: File): SourceType {
  if (file.type === 'application/epub+zip') return 'epub'
  if (file.type === 'application/pdf') return 'pdf'
  // ... existing logic
}
```

### 10. Testing Setup - 45 min

**Download test fixtures:**
```bash
mkdir -p worker/test-fixtures
curl -o worker/test-fixtures/moby-dick.epub \
  "https://www.gutenberg.org/ebooks/2701.epub.noimages"
curl -o worker/test-fixtures/pride-prejudice.epub \
  "https://www.gutenberg.org/ebooks/1342.epub.noimages"
```

**Test file** (`worker/tests/processors/epub-processor.test.ts`):
```typescript
import fs from 'fs'
import { EPUBProcessor } from '../../processors/epub-processor'

describe('EPUBProcessor', () => {
  let processor: EPUBProcessor

  beforeEach(() => {
    processor = new EPUBProcessor(mockAI, mockSupabase, mockJob)
  })

  it('processes Moby Dick (long chapters)', async () => {
    const buffer = fs.readFileSync('worker/test-fixtures/moby-dick.epub')
    const result = await processor.process(buffer)

    expect(result.chunks.length).toBeGreaterThan(50)
    expect(result.metadata.title).toBe('Moby Dick')
    expect(result.metadata.author).toBeDefined()

    // Verify AI chunking happened (not just chapter-level)
    expect(result.chunks[0].metadata.themes).toBeDefined()
    expect(result.chunks[0].metadata.concepts).toBeDefined()
    expect(result.chunks[0].metadata.emotional_tone).toBeDefined()
  })

  it('processes Pride and Prejudice (short chapters)', async () => {
    const buffer = fs.readFileSync('worker/test-fixtures/pride-prejudice.epub')
    const result = await processor.process(buffer)

    expect(result.chunks.length).toBeGreaterThan(30)
    expect(result.metadata.document_type).toBe('fiction')
  })

  it('extracts cover image', async () => {
    const buffer = fs.readFileSync('worker/test-fixtures/moby-dick.epub')
    const { coverImage } = await parseEPUB(buffer)

    expect(coverImage).toBeDefined()
    expect(coverImage?.length).toBeGreaterThan(0)
  })

  it('fails fast on corrupted EPUB', async () => {
    const corruptedBuffer = Buffer.from('not an epub')

    await expect(processor.process(corruptedBuffer))
      .rejects.toThrow('corrupted')
  })

  it('infers document type from metadata', () => {
    const technicalMetadata = {
      title: 'Learning Python',
      author: 'Mark Lutz',
      publisher: "O'Reilly Media",
      subjects: ['programming', 'python']
    }

    expect(inferDocumentType(technicalMetadata)).toBe('technical_manual')
  })
})
```

## Cost Analysis

**500-page EPUB:**
- Parse OPF: $0 (local)
- Convert HTML→MD: $0 (local)
- AI chunk 20 chapters: $0.40 (20 batches @ $0.02)
- **Total: $0.40**

**500-page PDF:**
- Extract via Gemini: $0.12
- AI chunk markdown: $0.20
- Stitching overhead: $0.18
- **Total: $0.50**

**Savings: $0.10 per book (20% reduction)**

## Why This Approach is Correct

❌ **Don't think**: Chapters are semantic chunks (use chapter titles as themes)
✅ **Do think**: Chapters are batch boundaries (AI still extracts themes/concepts)

❌ **Don't think**: EPUB is free to process
✅ **Do think**: EPUB saves $0.10 through better extraction, still uses AI chunking

❌ **Don't think**: Local TF-IDF for metadata
✅ **Do think**: AI extracts metadata better, just use chapters as boundaries

## Key Architectural Decisions

1. **Same AI pipeline**: EPUBs use identical chunking/metadata extraction as PDFs
2. **Chapter boundaries**: Natural batch boundaries instead of arbitrary 100K windows
3. **Fail fast**: Corrupted EPUB throws immediately, no partial processing
4. **Cover required**: Extract cover image for consistency with PDF/YouTube
5. **Type inference**: Simple heuristics based on publisher/subjects (can override in preview)

## Timeline

- EPUB parser + cover extraction: **3.5 hours**
- Type inference + processor: **1 hour**
- AI chunking config: **15 min**
- Router + types: **15 min**
- Migration: **15 min**
- Frontend upload: **10 min**
- Testing: **45 min**

**Total: ~6 hours**

## Next Steps

1. Install dependencies (`adm-zip`, `fast-xml-parser`, `turndown`)
2. Build EPUB parser with cover extraction
3. Create type inference logic
4. Build EPUB processor (extends `SourceProcessor`)
5. Update AI chunking to accept `customBatches`
6. Wire to router and upload UI
7. Create migration for EPUB metadata fields
8. Download test fixtures and write tests
9. Test end-to-end with real EPUBs

---

**Status**: Paused, ready to implement when you give the signal.
