# Complete Metadata Preview Implementation Plan

## Overview

**Flow:** Drop file/URL → Extract metadata (~100ms to 15s) → Show preview → User edits/confirms → Process with type-specific chunking

**Source types:** PDF, EPUB, Text, Markdown, YouTube

-----

## Step 1: Database Schema (5 min)

```sql
-- supabase/migrations/026_document_metadata.sql
ALTER TABLE documents 
  ADD COLUMN document_type TEXT CHECK (document_type IN (
    'fiction',
    'nonfiction_book', 
    'academic_paper',
    'technical_manual',
    'article',
    'essay'
  )),
  ADD COLUMN author TEXT,
  ADD COLUMN isbn TEXT,
  ADD COLUMN publisher TEXT,
  ADD COLUMN publication_date DATE,
  ADD COLUMN language TEXT DEFAULT 'en',
  ADD COLUMN cover_image_path TEXT;

CREATE INDEX idx_documents_type ON documents(document_type);
CREATE INDEX idx_documents_author ON documents(author);
```

-----

## Step 2: Shared Types (10 min)

**File:** `types/metadata.ts`

```typescript
export type DocumentType = 
  | 'fiction'
  | 'nonfiction_book'
  | 'academic_paper'
  | 'technical_manual'
  | 'article'
  | 'essay'

export interface DetectedMetadata {
  title: string
  author: string
  type: DocumentType
  year?: string
  publisher?: string
  isbn?: string
  description?: string
  coverImage?: string // base64 or URL
  language?: string
}
```

-----

## Step 3: API Routes

### 3.1: PDF Metadata (Uses Files API)

**File:** `app/api/extract-metadata/route.ts`

```typescript
import { NextRequest } from 'next/server'
import { createGeminiClient } from '@/lib/ai/ai-client'

export async function POST(req: NextRequest) {
  const formData = await req.formData()
  const file = formData.get('file') as File
  
  const buffer = await file.arrayBuffer()
  const gemini = createGeminiClient(process.env.GOOGLE_AI_API_KEY!)
  
  // Upload to Files API
  const fileUri = await gemini.files.upload({
    file: new Blob([buffer], { type: 'application/pdf' }),
    config: { mimeType: 'application/pdf' }
  })
  
  // Extract first 10 pages
  const result = await gemini.models.generateContent({
    model: 'gemini-2.0-flash-exp',
    contents: [{
      parts: [
        { fileData: { fileUri, mimeType: 'application/pdf' } },
        { text: 'Extract pages 1-10 as clean markdown. Return ONLY markdown.' }
      ]
    }],
    config: { maxOutputTokens: 8192, temperature: 0.1 }
  })
  
  const firstPages = result.text || ''
  
  // Detect metadata from extracted text
  const metadata = await detectMetadataFromText(firstPages)
  
  return Response.json(metadata)
}

async function detectMetadataFromText(markdown: string) {
  const gemini = createGeminiClient(process.env.GOOGLE_AI_API_KEY!)
  
  const result = await gemini.models.generateContent({
    model: 'gemini-2.0-flash-exp',
    contents: [{ parts: [{ text: `
      Extract document metadata from these first pages.
      
      Return JSON:
      {
        "title": "Full title",
        "author": "Author name or Unknown",
        "type": "fiction|nonfiction_book|academic_paper|technical_manual|article|essay",
        "year": "Publication year or null",
        "publisher": "Publisher or null",
        "description": "1-2 sentence description"
      }
      
      Text:
      ${markdown}
    `}] }],
    config: { 
      responseMimeType: 'application/json',
      maxOutputTokens: 512
    }
  })
  
  return JSON.parse(result.text || '{}')
}
```

### 3.2: EPUB Metadata (Local Parsing)

**File:** `app/api/extract-epub-metadata/route.ts`

```typescript
import { NextRequest } from 'next/server'
import { parseEPUB } from '@/worker/lib/epub/epub-parser'

export async function POST(req: NextRequest) {
  const formData = await req.formData()
  const file = formData.get('file') as File
  
  const buffer = Buffer.from(await file.arrayBuffer())
  const { metadata, coverImage } = await parseEPUB(buffer)
  
  const coverBase64 = coverImage 
    ? `data:image/jpeg;base64,${coverImage.toString('base64')}`
    : null
  
  return Response.json({
    title: metadata.title,
    author: metadata.author || 'Unknown',
    type: inferTypeFromEPUB(metadata),
    year: metadata.publicationDate,
    publisher: metadata.publisher,
    isbn: metadata.isbn,
    description: metadata.description,
    coverImage: coverBase64,
    language: metadata.language
  })
}

function inferTypeFromEPUB(metadata: any): DocumentType {
  const publisher = metadata.publisher?.toLowerCase() || ''
  const subjects = metadata.subjects?.join(' ').toLowerCase() || ''
  
  if (publisher.includes("o'reilly") || publisher.includes('packt')) {
    return 'technical_manual'
  }
  
  if (subjects.includes('textbook') || publisher.includes('university press')) {
    return 'academic_paper'
  }
  
  return 'fiction'
}
```

### 3.3: Text/Markdown Metadata (Vercel AI SDK)

**File:** `app/api/extract-text-metadata/route.ts`

```typescript
import { NextRequest } from 'next/server'
import { generateObject } from 'ai'
import { google } from '@ai-sdk/google'
import { z } from 'zod'

const metadataSchema = z.object({
  title: z.string(),
  author: z.string(),
  type: z.enum(['article', 'essay', 'notes', 'nonfiction_book']),
  description: z.string().optional()
})

export async function POST(req: NextRequest) {
  const formData = await req.formData()
  const file = formData.get('file') as File
  const content = await file.text()
  
  // Check for YAML frontmatter first (free)
  const frontmatter = extractFrontmatter(content)
  if (frontmatter?.title && frontmatter?.author) {
    return Response.json({
      ...frontmatter,
      type: frontmatter.type || 'article'
    })
  }
  
  // Use Vercel AI SDK for structured extraction
  const { object } = await generateObject({
    model: google('gemini-2.0-flash-exp'),
    schema: metadataSchema,
    prompt: `Extract metadata from this document.
    
    Title: Main title from heading or infer from content
    Author: Author name or "Unknown"  
    Type: Classify as article, essay, notes, or nonfiction_book
    Description: 1-2 sentences
    
    Document (first 5000 chars):
    ${content.slice(0, 5000)}`
  })
  
  return Response.json(object)
}

function extractFrontmatter(content: string) {
  const match = content.match(/^---\n([\s\S]*?)\n---/)
  if (!match) return null
  
  const yaml = match[1]
  const lines = yaml.split('\n')
  const data: any = {}
  
  for (const line of lines) {
    const [key, ...valueParts] = line.split(':')
    if (key && valueParts.length > 0) {
      data[key.trim()] = valueParts.join(':').trim().replace(/['"]/g, '')
    }
  }
  
  return data
}
```

### 3.4: YouTube Metadata

**File:** `app/api/extract-youtube-metadata/route.ts`

```typescript
import { NextRequest } from 'next/server'

export async function POST(req: NextRequest) {
  const { url } = await req.json()
  
  const videoId = extractVideoId(url)
  const metadata = await fetchYouTubeMetadata(videoId)
  
  return Response.json({
    title: metadata.title,
    author: metadata.channelName,
    type: 'article' as const,
    description: metadata.description.slice(0, 200),
    coverImage: metadata.thumbnail,
    year: new Date(metadata.publishedAt).getFullYear().toString()
  })
}

async function fetchYouTubeMetadata(videoId: string) {
  const apiKey = process.env.YOUTUBE_API_KEY
  const url = `https://www.googleapis.com/youtube/v3/videos?id=${videoId}&key=${apiKey}&part=snippet`
  
  const res = await fetch(url)
  const data = await res.json()
  
  if (!data.items?.[0]) {
    throw new Error('Video not found')
  }
  
  const snippet = data.items[0].snippet
  
  return {
    title: snippet.title,
    channelName: snippet.channelTitle,
    description: snippet.description,
    thumbnail: snippet.thumbnails.high.url,
    publishedAt: snippet.publishedAt
  }
}

function extractVideoId(url: string): string {
  const match = url.match(/(?:youtu\.be\/|youtube\.com\/watch\?v=)([^&]+)/)
  if (!match) throw new Error('Invalid YouTube URL')
  return match[1]
}
```

-----

## Step 4: Preview Component (Reusable)

**File:** `components/upload/DocumentPreview.tsx`

```typescript
'use client'

import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { DetectedMetadata, DocumentType } from '@/types/metadata'

interface DocumentPreviewProps {
  metadata: DetectedMetadata
  onConfirm: (edited: DetectedMetadata) => void
  onCancel: () => void
}

export function DocumentPreview({ 
  metadata, 
  onConfirm, 
  onCancel 
}: DocumentPreviewProps) {
  const [edited, setEdited] = useState(metadata)

  return (
    <div className="space-y-4 p-6 border rounded-lg bg-card">
      {/* Cover Image */}
      {edited.coverImage && (
        <div className="flex justify-center">
          <img 
            src={edited.coverImage} 
            alt="Cover"
            className="h-48 object-cover rounded"
          />
        </div>
      )}

      {/* Description */}
      {edited.description && (
        <p className="text-sm text-muted-foreground">
          {edited.description}
        </p>
      )}

      {/* Editable Fields */}
      <div className="space-y-3">
        <div>
          <Label htmlFor="title">Title</Label>
          <Input
            id="title"
            value={edited.title}
            onChange={(e) => setEdited({ ...edited, title: e.target.value })}
          />
        </div>

        <div>
          <Label htmlFor="author">Author</Label>
          <Input
            id="author"
            value={edited.author}
            onChange={(e) => setEdited({ ...edited, author: e.target.value })}
          />
        </div>

        <div>
          <Label htmlFor="type">Document Type</Label>
          <Select
            value={edited.type}
            onValueChange={(value: DocumentType) => 
              setEdited({ ...edited, type: value })
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="fiction">Fiction</SelectItem>
              <SelectItem value="nonfiction_book">Nonfiction Book</SelectItem>
              <SelectItem value="academic_paper">Academic Paper</SelectItem>
              <SelectItem value="technical_manual">Technical Manual</SelectItem>
              <SelectItem value="article">Article</SelectItem>
              <SelectItem value="essay">Essay</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="year">Year</Label>
            <Input
              id="year"
              value={edited.year || ''}
              onChange={(e) => setEdited({ ...edited, year: e.target.value })}
            />
          </div>

          <div>
            <Label htmlFor="publisher">Publisher</Label>
            <Input
              id="publisher"
              value={edited.publisher || ''}
              onChange={(e) => setEdited({ ...edited, publisher: e.target.value })}
            />
          </div>
        </div>

        {edited.isbn && (
          <div>
            <Label htmlFor="isbn">ISBN</Label>
            <Input
              id="isbn"
              value={edited.isbn}
              onChange={(e) => setEdited({ ...edited, isbn: e.target.value })}
            />
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-2 pt-4">
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button onClick={() => onConfirm(edited)}>
          Process Document
        </Button>
      </div>
    </div>
  )
}
```

-----

## Step 5: Upload Component (Routes to Correct API)

**File:** `components/upload/FileUpload.tsx`

```typescript
'use client'

import { useState } from 'react'
import { DocumentPreview } from './DocumentPreview'
import type { DetectedMetadata } from '@/types/metadata'

type UploadState = 
  | { phase: 'idle' }
  | { phase: 'detecting'; file?: File; url?: string }
  | { phase: 'preview'; file?: File; url?: string; metadata: DetectedMetadata }
  | { phase: 'processing'; metadata: DetectedMetadata }

export function FileUpload() {
  const [state, setState] = useState<UploadState>({ phase: 'idle' })

  const handleFileDrop = async (file: File) => {
    setState({ phase: 'detecting', file })
    
    const fileType = detectFileType(file)
    const formData = new FormData()
    formData.append('file', file)
    
    // Route to correct API
    const endpoint = {
      pdf: '/api/extract-metadata',
      epub: '/api/extract-epub-metadata',
      markdown: '/api/extract-text-metadata',
      text: '/api/extract-text-metadata'
    }[fileType]
    
    const metadata = await fetch(endpoint, {
      method: 'POST',
      body: formData
    }).then(r => r.json())
    
    setState({ phase: 'preview', file, metadata })
  }

  const handleYouTubeURL = async (url: string) => {
    setState({ phase: 'detecting', url })
    
    const metadata = await fetch('/api/extract-youtube-metadata', {
      method: 'POST',
      body: JSON.stringify({ url }),
      headers: { 'Content-Type': 'application/json' }
    }).then(r => r.json())
    
    setState({ phase: 'preview', url, metadata })
  }

  const handleConfirm = async (metadata: DetectedMetadata) => {
    setState({ phase: 'processing', metadata })
    
    // Create document with metadata
    if (state.phase === 'preview' && state.file) {
      await processDocument(state.file, metadata)
    } else if (state.phase === 'preview' && state.url) {
      await processYouTubeURL(state.url, metadata)
    }
  }

  if (state.phase === 'detecting') {
    return <div className="p-8 text-center">Analyzing document...</div>
  }

  if (state.phase === 'preview') {
    return (
      <DocumentPreview
        metadata={state.metadata}
        onConfirm={handleConfirm}
        onCancel={() => setState({ phase: 'idle' })}
      />
    )
  }

  if (state.phase === 'processing') {
    return <div className="p-8 text-center">Processing {state.metadata.title}...</div>
  }

  // Idle: show dropzone + URL input
  return (
    <div className="space-y-4">
      <FileDropzone onDrop={handleFileDrop} />
      <YouTubeURLInput onSubmit={handleYouTubeURL} />
    </div>
  )
}

function detectFileType(file: File): 'pdf' | 'epub' | 'markdown' | 'text' {
  if (file.type === 'application/pdf') return 'pdf'
  if (file.type === 'application/epub+zip') return 'epub'
  
  const ext = file.name.split('.').pop()?.toLowerCase()
  if (ext === 'epub') return 'epub'
  if (ext === 'md' || ext === 'markdown') return 'markdown'
  
  return 'text'
}
```

-----

## Step 6: Pass Metadata to Processing

**File:** `app/actions/documents.ts`

```typescript
export async function processDocument(
  file: File, 
  metadata: DetectedMetadata
) {
  // Create document record with metadata
  const { data: doc } = await supabase
    .from('documents')
    .insert({
      title: metadata.title,
      author: metadata.author,
      document_type: metadata.type,
      publisher: metadata.publisher,
      publication_date: metadata.year,
      isbn: metadata.isbn,
      source_type: detectSourceType(file),
      processing_status: 'pending'
    })
    .select()
    .single()
  
  // Create background job with metadata
  await supabase
    .from('background_jobs')
    .insert({
      document_id: doc.id,
      status: 'pending',
      input_data: {
        documentType: metadata.type, // For type-specific chunking
        metadata
      }
    })
  
  return doc
}
```

-----

## Step 7: Type-Specific Chunking (Already Built)

**File:** `worker/lib/chunking/orchestrator.ts`

```typescript
// Uses metadata.type for chunking prompt
const chunks = await batchChunkAndExtractMetadata(
  markdown,
  job.input_data.documentType, // From preview
  config
)
```

-----

## Testing Checklist

**PDF:**

- [ ] Drop PDF → See 15s extraction → Preview shows → Edit → Confirm

**EPUB:**

- [ ] Drop EPUB → See instant preview → Cover displays → Confirm

**Markdown:**

- [ ] Drop markdown with frontmatter → Instant preview (no AI)
- [ ] Drop markdown without frontmatter → 2s AI extraction → Preview

**Text:**

- [ ] Drop .txt file → 2s AI extraction → Preview

**YouTube:**

- [ ] Paste URL → 1s fetch → Thumbnail displays → Preview

-----

## Time Estimates

- Step 1 (Schema): 5 min
- Step 2 (Types): 10 min
- Step 3.1 (PDF API): 30 min
- Step 3.2 (EPUB API): 20 min
- Step 3.3 (Text API): 30 min
- Step 3.4 (YouTube API): 20 min
- Step 4 (Preview Component): 45 min
- Step 5 (Upload Router): 30 min
- Step 6 (Pass to Worker): 15 min
- Testing: 30 min

**Total: ~4 hours**

Ship all source types with preview in one session. Same preview component, different extraction strategies per type.​​​​​​​​​​​​​​​​




---


# Complete Metadata Preview Implementation

## Overview

Ship metadata extraction preview for all 6 source types:
- **PDF** (already working)
- **EPUB** (new - instant)
- **Markdown** (new - instant if frontmatter, else 2s AI)
- **Text** (new - 2s AI)
- **YouTube** (new - 1s API)
- **Web URL** (existing - unchanged)

**Total time: ~2.5 hours**

---

## Step 1: Shared Types (10 min)

**File:** `src/types/metadata.ts`

```typescript
export type DocumentType = 
  | 'fiction'
  | 'nonfiction_book'
  | 'academic_paper'
  | 'technical_manual'
  | 'article'
  | 'essay'

export interface DetectedMetadata {
  title: string
  author: string
  type: DocumentType
  year?: string
  publisher?: string
  isbn?: string
  description?: string
  coverImage?: string // base64 data URI or HTTP URL
  language?: string
}

// Utility for cover image handling
export function base64ToBlob(base64: string): Blob {
  const [header, data] = base64.split(',')
  const mimeMatch = header.match(/:(.*?);/)
  const mimeType = mimeMatch ? mimeMatch[1] : 'image/jpeg'
  
  const binary = atob(data)
  const array = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    array[i] = binary.charCodeAt(i)
  }
  
  return new Blob([array], { type: mimeType })
}
```

---

## Step 2: EPUB Metadata API (20 min)

**File:** `src/app/api/extract-epub-metadata/route.ts`

```typescript
import { NextRequest } from 'next/server'
import { parseEPUB } from '@/worker/lib/epub/epub-parser'

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File
    
    if (!file) {
      return Response.json({ error: 'No file provided' }, { status: 400 })
    }
    
    // Parse EPUB locally
    const buffer = Buffer.from(await file.arrayBuffer())
    const { metadata, coverImage } = await parseEPUB(buffer)
    
    // Convert cover to base64 data URI
    const coverBase64 = coverImage 
      ? `data:image/jpeg;base64,${coverImage.toString('base64')}`
      : null
    
    return Response.json({
      title: metadata.title || 'Untitled',
      author: metadata.author || 'Unknown',
      type: inferTypeFromEPUB(metadata),
      year: metadata.publicationDate || null,
      publisher: metadata.publisher || null,
      isbn: metadata.isbn || null,
      description: metadata.description || null,
      coverImage: coverBase64,
      language: metadata.language || 'en'
    })
  } catch (error) {
    console.error('EPUB metadata extraction failed:', error)
    return Response.json(
      { error: 'Failed to extract EPUB metadata' },
      { status: 500 }
    )
  }
}

function inferTypeFromEPUB(metadata: any): DocumentType {
  const publisher = metadata.publisher?.toLowerCase() || ''
  const subjects = metadata.subjects?.join(' ').toLowerCase() || ''
  
  // Technical publishers
  if (publisher.includes("o'reilly") || 
      publisher.includes('packt') || 
      publisher.includes('manning')) {
    return 'technical_manual'
  }
  
  // Academic publishers
  if (subjects.includes('textbook') || 
      publisher.includes('university press') ||
      publisher.includes('academic')) {
    return 'academic_paper'
  }
  
  // Default to fiction for EPUBs (most common)
  return 'fiction'
}
```

---

## Step 3: Text/Markdown Metadata API (30 min)

**File:** `src/app/api/extract-text-metadata/route.ts`

```typescript
import { NextRequest } from 'next/server'
import { generateObject } from 'ai'
import { google } from '@ai-sdk/google'
import { z } from 'zod'

const metadataSchema = z.object({
  title: z.string(),
  author: z.string(),
  type: z.enum(['article', 'essay', 'nonfiction_book', 'technical_manual']),
  year: z.string().optional(),
  description: z.string().optional()
})

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File
    
    if (!file) {
      return Response.json({ error: 'No file provided' }, { status: 400 })
    }
    
    const content = await file.text()
    
    // Try frontmatter first (free and instant)
    const frontmatter = extractFrontmatter(content)
    if (frontmatter?.title && frontmatter?.author) {
      return Response.json({
        title: frontmatter.title,
        author: frontmatter.author,
        type: frontmatter.type || 'article',
        year: frontmatter.year || frontmatter.date?.slice(0, 4),
        publisher: frontmatter.publisher,
        description: frontmatter.description,
        language: frontmatter.language || 'en'
      })
    }
    
    // Fallback to AI extraction
    const { object } = await generateObject({
      model: google('gemini-2.0-flash-exp'),
      schema: metadataSchema,
      prompt: `Extract metadata from this document.
      
Rules:
- Title: Use main heading or infer from content
- Author: Look for author name or use "Unknown"
- Type: Classify as article, essay, nonfiction_book, or technical_manual
- Year: Publication year if mentioned
- Description: 1-2 sentence summary

Document (first 5000 chars):
${content.slice(0, 5000)}`
    })
    
    return Response.json({
      ...object,
      language: 'en'
    })
  } catch (error) {
    console.error('Text metadata extraction failed:', error)
    return Response.json(
      { error: 'Failed to extract metadata' },
      { status: 500 }
    )
  }
}

function extractFrontmatter(content: string) {
  // Match YAML frontmatter (--- ... ---)
  const match = content.match(/^---\n([\s\S]*?)\n---/)
  if (!match) return null
  
  try {
    const yaml = match[1]
    const lines = yaml.split('\n')
    const data: any = {}
    
    for (const line of lines) {
      const colonIndex = line.indexOf(':')
      if (colonIndex === -1) continue
      
      const key = line.slice(0, colonIndex).trim()
      const value = line.slice(colonIndex + 1).trim().replace(/^['"]|['"]$/g, '')
      
      if (key && value) {
        data[key] = value
      }
    }
    
    return data
  } catch (error) {
    return null
  }
}
```

---

## Step 4: YouTube Metadata API (30 min)

**File:** `src/app/api/extract-youtube-metadata/route.ts`

```typescript
import { NextRequest } from 'next/server'
import type { DocumentType } from '@/types/metadata'

export async function POST(req: NextRequest) {
  try {
    const { url } = await req.json()
    
    if (!url) {
      return Response.json({ error: 'No URL provided' }, { status: 400 })
    }
    
    const videoId = extractVideoId(url)
    const metadata = await fetchYouTubeMetadata(videoId)
    
    return Response.json({
      title: metadata.title,
      author: metadata.channelName,
      type: 'article' as DocumentType, // User will choose in preview
      year: new Date(metadata.publishedAt).getFullYear().toString(),
      description: metadata.description.slice(0, 200) + '...',
      coverImage: metadata.thumbnail,
      language: 'en'
    })
  } catch (error) {
    console.error('YouTube metadata extraction failed:', error)
    
    // Check for quota errors
    if (error instanceof Error && error.message.includes('quota')) {
      return Response.json({
        error: 'YouTube API quota exceeded',
        fallback: true
      }, { status: 429 })
    }
    
    return Response.json(
      { error: 'Failed to fetch YouTube metadata' },
      { status: 500 }
    )
  }
}

function extractVideoId(url: string): string {
  // Handle multiple YouTube URL formats
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\n?#]+)/,
    /youtube\.com\/embed\/([^&\n?#]+)/,
    /youtube\.com\/v\/([^&\n?#]+)/
  ]
  
  for (const pattern of patterns) {
    const match = url.match(pattern)
    if (match) return match[1]
  }
  
  throw new Error('Invalid YouTube URL')
}

async function fetchYouTubeMetadata(videoId: string) {
  const apiKey = process.env.YOUTUBE_API_KEY
  
  if (!apiKey) {
    throw new Error('YOUTUBE_API_KEY not configured')
  }
  
  const url = new URL('https://www.googleapis.com/youtube/v3/videos')
  url.searchParams.set('id', videoId)
  url.searchParams.set('key', apiKey)
  url.searchParams.set('part', 'snippet')
  
  const response = await fetch(url.toString())
  
  if (!response.ok) {
    const error = await response.json()
    if (response.status === 403) {
      throw new Error('YouTube API quota exceeded')
    }
    throw new Error(`YouTube API error: ${error.error?.message || response.statusText}`)
  }
  
  const data = await response.json()
  
  if (!data.items || data.items.length === 0) {
    throw new Error('Video not found')
  }
  
  const snippet = data.items[0].snippet
  
  return {
    title: snippet.title,
    channelName: snippet.channelTitle,
    description: snippet.description,
    thumbnail: snippet.thumbnails.maxres?.url || snippet.thumbnails.high.url,
    publishedAt: snippet.publishedAt
  }
}
```

---

## Step 5: Update UploadZone Routing (30 min)

**File:** `src/components/upload/UploadZone.tsx`

Update the file handling logic to route to correct API:

```typescript
// Add this helper function at top of component
function getMetadataEndpoint(file: File): string | null {
  // PDF - already working
  if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
    return '/api/extract-metadata'
  }
  
  // EPUB - new
  if (file.type === 'application/epub+zip' || file.name.endsWith('.epub')) {
    return '/api/extract-epub-metadata'
  }
  
  // Markdown - new
  if (file.name.endsWith('.md') || file.name.endsWith('.markdown')) {
    return '/api/extract-text-metadata'
  }
  
  // Text - new
  if (file.type === 'text/plain' || file.name.endsWith('.txt')) {
    return '/api/extract-text-metadata'
  }
  
  // No preview for other types
  return null
}

// Update handleFileSelect function (around line 67)
const handleFileSelect = async (file: File) => {
  const endpoint = getMetadataEndpoint(file)
  
  if (!endpoint) {
    // No preview, go straight to upload
    await uploadDocument(file)
    return
  }
  
  // Extract metadata for preview
  setIsDetectingMetadata(true)
  
  try {
    const formData = new FormData()
    formData.append('file', file)
    
    const response = await fetch(endpoint, {
      method: 'POST',
      body: formData
    })
    
    if (!response.ok) {
      throw new Error('Metadata extraction failed')
    }
    
    const metadata = await response.json()
    
    setDetectedMetadata(metadata)
    setSelectedFile(file)
  } catch (error) {
    console.error('Metadata detection error:', error)
    
    // Fallback: Show preview with filename
    setDetectedMetadata({
      title: file.name.replace(/\.[^/.]+$/, ''),
      author: 'Unknown',
      type: 'article',
      description: 'Metadata extraction failed. Please edit manually.'
    })
    setSelectedFile(file)
  } finally {
    setIsDetectingMetadata(false)
  }
}

// Add YouTube URL handling to existing URL tab
const handleYouTubeUrl = async (url: string) => {
  setIsDetectingMetadata(true)
  
  try {
    const response = await fetch('/api/extract-youtube-metadata', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url })
    })
    
    if (!response.ok) {
      const error = await response.json()
      if (response.status === 429) {
        // Quota exceeded - show manual entry
        setDetectedMetadata({
          title: 'YouTube Video',
          author: 'Unknown Channel',
          type: 'article',
          description: 'YouTube API quota exceeded. Please edit manually.'
        })
      } else {
        throw new Error(error.error || 'Failed to fetch metadata')
      }
    } else {
      const metadata = await response.json()
      setDetectedMetadata(metadata)
    }
    
    setYoutubeUrl(url)
  } catch (error) {
    console.error('YouTube metadata error:', error)
    
    setDetectedMetadata({
      title: 'YouTube Video',
      author: 'Unknown',
      type: 'article',
      description: 'Failed to fetch metadata. Please edit manually.'
    })
    setYoutubeUrl(url)
  } finally {
    setIsDetectingMetadata(false)
  }
}
```

---

## Step 6: Update Document Upload Action (30 min)

**File:** `src/app/actions/documents.ts`

Update to handle cover images and pass metadata to worker:

```typescript
import { base64ToBlob } from '@/types/metadata'
import type { DetectedMetadata } from '@/types/metadata'

export async function uploadDocument(
  file: File,
  metadata: DetectedMetadata
) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) throw new Error('Not authenticated')
  
  const documentId = generateId()
  const storagePath = `${user.id}/${documentId}`
  
  // Upload source file
  const { error: uploadError } = await supabase.storage
    .from('documents')
    .upload(`${storagePath}/source${getFileExtension(file)}`, file)
  
  if (uploadError) throw uploadError
  
  // Handle cover image if present
  let coverImageUrl: string | null = null
  
  if (metadata.coverImage) {
    if (metadata.coverImage.startsWith('data:image')) {
      // Base64 (from EPUB) - upload to storage
      const coverBlob = base64ToBlob(metadata.coverImage)
      const coverPath = `${storagePath}/cover.jpg`
      
      const { error: coverError } = await supabase.storage
        .from('documents')
        .upload(coverPath, coverBlob)
      
      if (!coverError) {
        const { data } = supabase.storage
          .from('documents')
          .getPublicUrl(coverPath)
        
        coverImageUrl = data.publicUrl
      }
    } else if (metadata.coverImage.startsWith('http')) {
      // URL (from YouTube) - use directly
      coverImageUrl = metadata.coverImage
    }
  }
  
  // Create document record
  const { data: doc, error: docError } = await supabase
    .from('documents')
    .insert({
      id: documentId,
      user_id: user.id,
      title: metadata.title,
      author: metadata.author,
      document_type: metadata.type,
      publisher: metadata.publisher,
      publication_year: metadata.year ? parseInt(metadata.year) : null,
      cover_image_url: coverImageUrl,
      detected_metadata: metadata, // Store full metadata as JSONB
      source_type: detectSourceType(file),
      storage_path: storagePath,
      processing_status: 'pending'
    })
    .select()
    .single()
  
  if (docError) throw docError
  
  // Create background job with metadata
  const { error: jobError } = await supabase
    .from('background_jobs')
    .insert({
      document_id: doc.id,
      status: 'pending',
      input_data: {
        document_id: doc.id,
        source_type: doc.source_type,
        storage_path: storagePath,
        documentType: metadata.type, // Worker uses this for chunking strategy
        metadata // Full context
      }
    })
  
  if (jobError) throw jobError
  
  return doc
}

// Similar function for YouTube URLs
export async function uploadYouTubeUrl(
  url: string,
  metadata: DetectedMetadata
) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) throw new Error('Not authenticated')
  
  const documentId = generateId()
  
  // Create document record (no file upload needed)
  const { data: doc, error: docError } = await supabase
    .from('documents')
    .insert({
      id: documentId,
      user_id: user.id,
      title: metadata.title,
      author: metadata.author,
      document_type: metadata.type,
      cover_image_url: metadata.coverImage, // YouTube thumbnail URL
      detected_metadata: metadata,
      source_type: 'youtube',
      source_url: url,
      processing_status: 'pending'
    })
    .select()
    .single()
  
  if (docError) throw docError
  
  // Create background job
  const { error: jobError } = await supabase
    .from('background_jobs')
    .insert({
      document_id: doc.id,
      status: 'pending',
      input_data: {
        document_id: doc.id,
        source_type: 'youtube',
        url, // Worker will fetch transcript from this URL
        documentType: metadata.type,
        metadata
      }
    })
  
  if (jobError) throw jobError
  
  return doc
}

function getFileExtension(file: File): string {
  const name = file.name
  const lastDot = name.lastIndexOf('.')
  return lastDot > 0 ? name.slice(lastDot) : ''
}
```

---

## Step 7: Update DocumentPreview Confirm Handler

**File:** `src/components/upload/DocumentPreview.tsx`

Update the confirm button to call correct upload function:

```typescript
// In DocumentPreview component, update onConfirm
<Button 
  onClick={async () => {
    try {
      if (file) {
        await uploadDocument(file, edited)
      } else if (youtubeUrl) {
        await uploadYouTubeUrl(youtubeUrl, edited)
      }
      
      onConfirm(edited)
    } catch (error) {
      console.error('Upload failed:', error)
      // Show error toast
    }
  }}
>
  Process Document
</Button>
```

---

## Testing Checklist

**EPUB:**
- [ ] Drop EPUB file
- [ ] Verify instant preview (<100ms)
- [ ] Check cover image displays
- [ ] Verify title/author from OPF
- [ ] Edit type, confirm
- [ ] Check cover saved to storage
- [ ] Verify metadata in database

**Markdown with Frontmatter:**
```markdown
---
title: My Article
author: John Doe
type: essay
year: 2025
---

Content here...
```
- [ ] Drop file
- [ ] Verify instant preview (no AI call)
- [ ] Check frontmatter values populated
- [ ] Confirm and process

**Markdown without Frontmatter:**
- [ ] Drop file
- [ ] Verify 2-3s delay (AI extraction)
- [ ] Check inferred metadata
- [ ] Edit and confirm

**Text File:**
- [ ] Drop .txt file
- [ ] Verify AI extraction (~2s)
- [ ] Check inferred title from content
- [ ] Edit and confirm

**YouTube:**
- [ ] Paste YouTube URL
- [ ] Verify 1s fetch
- [ ] Check thumbnail displays
- [ ] Check channel name as author
- [ ] Change type (user decides)
- [ ] Confirm and verify URL stored

**Error Cases:**
- [ ] EPUB with no cover → Preview still shows
- [ ] Malformed YAML → Falls back to AI
- [ ] YouTube quota exceeded → Manual entry fallback
- [ ] Invalid YouTube URL → Error message

---

## Cost Summary

Per document metadata extraction:
- **PDF:** $0.01 (Files API)
- **EPUB:** $0 (local parsing)
- **Markdown (frontmatter):** $0 (regex)
- **Markdown (AI):** $0.001 (Gemini Flash)
- **Text:** $0.001 (Gemini Flash)
- **YouTube:** $0 (within free quota)

Cover image storage: ~50KB per image, negligible cost.

---

## Key Points for Worker Integration

The worker already has the infrastructure to use `documentType`:

```typescript
// worker/lib/chunking/orchestrator.ts (line 609)
const chunks = await batchChunkAndExtractMetadata(
  markdown,
  job.input_data.documentType, // ← Metadata preview provides this
  config
)
```

**What the worker receives:**
- `documentType`: User-confirmed type from preview (fiction, academic_paper, etc.)
- `metadata`: Full DetectedMetadata object with title, author, etc.

**No changes needed to worker** - it's already set up to receive this data.

---

## Total Implementation Time

- Step 1 (Types): 10 min
- Step 2 (EPUB API): 20 min
- Step 3 (Text API): 30 min
- Step 4 (YouTube API): 30 min
- Step 5 (UploadZone): 30 min
- Step 6 (Upload Actions): 30 min
- Step 7 (Preview): 10 min
- Testing: 30 min

**Total: ~3 hours**

Ship all 6 source types with metadata preview in one session.