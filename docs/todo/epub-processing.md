# EPUB Processor Implementation

## Why EPUB is Different (Better)

**PDF processing:**
- Unstructured format → AI extraction ($0.50/doc)
- No metadata → AI detection ($0.01/doc)  
- No semantic structure → AI chunking needed

**EPUB processing:**
- Structured format → Direct parsing ($0/doc)
- Built-in metadata → Just read OPF file
- Chapter structure → Natural chunk boundaries

**EPUB is basically free to process.**

## Architecture

### Step 1: EPUB Structure Parser

**File:** `worker/lib/epub/epub-parser.ts`

```typescript
import AdmZip from 'adm-zip'
import { XMLParser } from 'fast-xml-parser'

export interface EPUBMetadata {
  title: string
  author: string
  publisher?: string
  publicationDate?: string
  isbn?: string
  language: string
  description?: string
}

export interface EPUBChapter {
  id: string
  title: string
  href: string
  content: string
  order: number
}

export async function parseEPUB(buffer: Buffer): Promise<{
  metadata: EPUBMetadata
  chapters: EPUBChapter[]
}> {
  const zip = new AdmZip(buffer)
  
  // Step 1: Find OPF file (metadata)
  const containerXML = zip.readAsText('META-INF/container.xml')
  const opfPath = extractOPFPath(containerXML)
  
  // Step 2: Parse metadata
  const opfContent = zip.readAsText(opfPath)
  const metadata = parseMetadata(opfContent)
  
  // Step 3: Extract chapter structure
  const chapters = await extractChapters(zip, opfPath, opfContent)
  
  return { metadata, chapters }
}

function extractOPFPath(containerXML: string): string {
  const parser = new XMLParser()
  const parsed = parser.parse(containerXML)
  return parsed.container.rootfiles.rootfile['@_full-path']
}

function parseMetadata(opfContent: string): EPUBMetadata {
  const parser = new XMLParser({ ignoreAttributes: false })
  const opf = parser.parse(opfContent)
  
  const metadata = opf.package.metadata
  
  return {
    title: metadata['dc:title'],
    author: metadata['dc:creator'],
    publisher: metadata['dc:publisher'],
    publicationDate: metadata['dc:date'],
    isbn: metadata['dc:identifier'],
    language: metadata['dc:language'],
    description: metadata['dc:description']
  }
}

async function extractChapters(
  zip: AdmZip,
  opfPath: string,
  opfContent: string
): Promise<EPUBChapter[]> {
  const parser = new XMLParser({ ignoreAttributes: false })
  const opf = parser.parse(opfContent)
  
  // Get spine (reading order)
  const spine = opf.package.spine.itemref
  const manifest = opf.package.manifest.item
  
  // Build chapter list
  const chapters: EPUBChapter[] = []
  const opfDir = opfPath.substring(0, opfPath.lastIndexOf('/'))
  
  for (let i = 0; i < spine.length; i++) {
    const itemref = Array.isArray(spine) ? spine[i] : spine
    const idref = itemref['@_idref']
    
    // Find manifest item
    const manifestItem = Array.isArray(manifest)
      ? manifest.find(m => m['@_id'] === idref)
      : manifest['@_id'] === idref ? manifest : null
    
    if (!manifestItem) continue
    
    const href = manifestItem['@_href']
    const fullPath = `${opfDir}/${href}`
    
    try {
      const htmlContent = zip.readAsText(fullPath)
      
      chapters.push({
        id: idref,
        title: extractChapterTitle(htmlContent) || `Chapter ${i + 1}`,
        href,
        content: htmlContent,
        order: i
      })
    } catch (err) {
      console.warn(`Could not read chapter: ${fullPath}`)
    }
  }
  
  return chapters
}

function extractChapterTitle(html: string): string | null {
  // Try to find h1, h2, or title tag
  const h1Match = html.match(/<h1[^>]*>(.*?)<\/h1>/i)
  if (h1Match) return h1Match[1].replace(/<[^>]*>/g, '')
  
  const h2Match = html.match(/<h2[^>]*>(.*?)<\/h2>/i)
  if (h2Match) return h2Match[1].replace(/<[^>]*>/g, '')
  
  const titleMatch = html.match(/<title[^>]*>(.*?)<\/title>/i)
  if (titleMatch) return titleMatch[1].replace(/<[^>]*>/g, '')
  
  return null
}
```

### Step 2: HTML to Markdown Converter

**File:** `worker/lib/epub/html-to-markdown.ts`

```typescript
import TurndownService from 'turndown'

const turndown = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
  emDelimiter: '*',
  strongDelimiter: '**'
})

// Custom rules for better EPUB conversion
turndown.addRule('pageBreak', {
  filter: (node) => {
    return node.nodeName === 'DIV' && 
           node.getAttribute('class')?.includes('page-break')
  },
  replacement: () => '\n\n---\n\n'
})

export function htmlToMarkdown(html: string): string {
  // Clean up EPUB-specific tags
  let cleaned = html
    .replace(/<\?xml[^>]*\?>/g, '') // Remove XML declaration
    .replace(/xmlns="[^"]*"/g, '')   // Remove namespaces
    .replace(/<epub:[^>]*>/g, '')    // Remove EPUB tags
    .replace(/<\/epub:[^>]*>/g, '')
  
  return turndown.turndown(cleaned)
}
```

### Step 3: EPUB Processor (No AI Needed)

**File:** `worker/processors/epub-processor.ts`

```typescript
import { parseEPUB } from '../lib/epub/epub-parser'
import { htmlToMarkdown } from '../lib/epub/html-to-markdown'
import type { ProcessorResult } from './types'

export class EPUBProcessor {
  async process(buffer: Buffer): Promise<ProcessorResult> {
    // Parse EPUB structure
    const { metadata, chapters } = await parseEPUB(buffer)
    
    // Convert chapters to markdown
    const markdownChapters = chapters.map(chapter => ({
      ...chapter,
      markdown: htmlToMarkdown(chapter.content)
    }))
    
    // Combine into full document
    const fullMarkdown = markdownChapters
      .map((ch, i) => {
        const header = `# ${ch.title}\n\n`
        return header + ch.markdown
      })
      .join('\n\n---\n\n')
    
    // Create chunks from chapters (natural boundaries)
    const chunks = markdownChapters.map((ch, i) => {
      const startOffset = fullMarkdown.indexOf(`# ${ch.title}`)
      const endOffset = i < markdownChapters.length - 1
        ? fullMarkdown.indexOf(`# ${markdownChapters[i + 1].title}`)
        : fullMarkdown.length
      
      return {
        content: ch.markdown,
        start_offset: startOffset,
        end_offset: endOffset,
        chunk_index: i,
        metadata: {
          themes: [ch.title], // Chapter title as theme
          concepts: [],
          importance: 0.5,
          summary: `Chapter: ${ch.title}`,
          domain: 'fiction', // Could detect from metadata
          emotional: {
            polarity: 0,
            primaryEmotion: 'neutral',
            intensity: 0
          }
        }
      }
    })
    
    return {
      markdown: fullMarkdown,
      chunks,
      metadata: {
        title: metadata.title,
        author: metadata.author,
        documentType: 'fiction', // Or detect from metadata
        sourceUrl: metadata.isbn ? `isbn:${metadata.isbn}` : undefined,
        ...metadata
      },
      wordCount: fullMarkdown.split(/\s+/).length,
      outline: chapters.map(ch => ({
        title: ch.title,
        level: 1,
        startOffset: fullMarkdown.indexOf(`# ${ch.title}`)
      }))
    }
  }
}
```

### Step 4: Wire to Upload Handler

**File:** `app/actions/documents.ts`

```typescript
import { EPUBProcessor } from '@/worker/processors/epub-processor'
import { PDFProcessor } from '@/worker/processors/pdf-processor'

export async function uploadDocument(file: File) {
  const buffer = await file.arrayBuffer()
  const fileType = file.type
  
  let processor
  if (fileType === 'application/pdf') {
    processor = new PDFProcessor()
  } else if (fileType === 'application/epub+zip') {
    processor = new EPUBProcessor()
  } else {
    throw new Error(`Unsupported file type: ${fileType}`)
  }
  
  const result = await processor.process(Buffer.from(buffer))
  
  // Save to database
  await createDocument({
    title: result.metadata.title,
    author: result.metadata.author,
    document_type: result.metadata.documentType,
    markdown: result.markdown,
    chunks: result.chunks
  })
}
```

## What This Gets You

**Metadata for free:**
- Title, author, publisher, ISBN all in OPF file
- No AI detection needed
- No preview needed (metadata is accurate)

**Natural chunking:**
- Chapters are semantic boundaries
- No AI chunking needed
- Better than AI-detected chunks for fiction

**Cost savings:**
- PDF: $0.50 per document
- EPUB: $0.00 per document

**Processing speed:**
- PDF: 5-10 minutes
- EPUB: 10-30 seconds

## EPUB-Specific Metadata Enrichment

Since you have structured data, add EPUB-specific fields:

```sql
ALTER TABLE documents 
  ADD COLUMN isbn TEXT,
  ADD COLUMN publisher TEXT,
  ADD COLUMN publication_date DATE,
  ADD COLUMN language TEXT,
  ADD COLUMN chapter_count INTEGER;
```

## Should You Still Show Preview?

**Yes, for consistency:**
```typescript
// Same preview flow, but instant metadata
const metadata = await detectMetadata(file)

// For EPUB: parse OPF (~100ms)
// For PDF: AI extraction (~15s)

// Same preview UI works for both
```

## Implementation Order

1. **Build EPUB parser** (2 hours) - Parse OPF, extract chapters
2. **HTML → Markdown converter** (1 hour) - Use Turndown
3. **Chapter-based chunking** (30 min) - Natural boundaries
4. **Wire to upload** (30 min) - Detect file type, route to processor

**Total: 4 hours to support EPUB**

Then EPUBs process in seconds with perfect metadata, while PDFs take minutes with AI-detected metadata. Both show preview for user confirmation.