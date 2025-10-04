# PRP: Unified Metadata Preview for All Document Types

**Status**: Ready for Implementation
**Confidence Score**: 9/10
**Estimated Implementation Time**: 3 hours
**Last Updated**: 2025-10-03

---

## Executive Summary

Extend the existing PDF metadata preview functionality to all 6 supported document types (PDF, EPUB, Markdown, Text, YouTube, Web URL). This enables users to review and edit AI-detected or parsed metadata before processing, ensuring accurate document categorization and type-specific chunking strategies.

### Business Value
- **Improved Accuracy**: Users verify metadata before processing (title, author, type)
- **Cost Optimization**: Free extraction for EPUB/frontmatter, minimal AI cost for others
- **Better Chunking**: Document type informs worker's chunking strategy (fiction vs technical)
- **Enhanced UX**: Visual preview with cover images creates professional experience

### Technical Approach
- **Pattern Replication**: Mirror existing PDF API pattern for 3 new endpoints
- **Minimal Changes**: Extend UploadZone routing, enhance upload actions
- **No Worker Changes**: Backend already receives `documentType` via job.input_data
- **Shared Types**: Extract common interfaces to prevent duplication

---

## 1. Business Context

### Current State
- **PDF Only**: Metadata preview works via `/api/extract-metadata` (15s, Files API)
- **Other Types**: Skip directly to upload without metadata confirmation
- **Worker Ready**: Chunking orchestrator already uses `job.input_data.documentType`
- **Database Ready**: Migration 025 added all required metadata columns

### Problem Statement
Users cannot review or correct metadata for 5 document types (EPUB, Markdown, Text, YouTube, Web), leading to:
- Incorrect document categorization
- Suboptimal chunking strategies (generic vs type-specific)
- Missing or inaccurate author/publisher information
- No cover images for supported formats

### Success Criteria
1. All 6 source types display metadata preview before processing
2. Cover images extracted automatically (EPUB) or from APIs (YouTube)
3. Metadata persists to database and flows to worker
4. Graceful error handling for API failures
5. Cost remains under $0.002 per document for AI-powered extraction
6. No regression in existing PDF workflow

---

## 2. Technical Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     User Upload Flow                         │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
                    ┌─────────────────────┐
                    │   UploadZone        │
                    │   File Detection    │
                    └─────────────────────┘
                              │
                ┌─────────────┼─────────────┬──────────────┐
                ▼             ▼             ▼              ▼
        ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐
        │ PDF API  │  │ EPUB API │  │ Text API │  │   YT API │
        │ (exists) │  │  (new)   │  │  (new)   │  │  (new)   │
        └──────────┘  └──────────┘  └──────────┘  └──────────┘
                │             │             │              │
                └─────────────┴─────────────┴──────────────┘
                              │
                              ▼
                    ┌─────────────────────┐
                    │ DocumentPreview     │
                    │ (User Edits)        │
                    └─────────────────────┘
                              │
                              ▼
                    ┌─────────────────────┐
                    │ Upload Actions      │
                    │ (Metadata + Cover)  │
                    └─────────────────────┘
                              │
                              ▼
                    ┌─────────────────────┐
                    │ Database + Storage  │
                    └─────────────────────┘
                              │
                              ▼
                    ┌─────────────────────┐
                    │ Background Job      │
                    │ (with documentType) │
                    └─────────────────────┘
                              │
                              ▼
                    ┌─────────────────────┐
                    │ Worker Processing   │
                    │ (Type-Specific)     │
                    └─────────────────────┘
```

### Data Flow

#### Metadata Extraction Flow
```typescript
// 1. File Upload
File/URL → UploadZone.handleFileSelect()

// 2. Route to Correct API
getMetadataEndpoint(file) → '/api/extract-{type}-metadata'

// 3. Extract Metadata
API Route → {
  EPUB: parseEPUB() → OPF metadata + cover
  Text: extractFrontmatter() || AI extraction
  YouTube: YouTube Data API → snippet
}

// 4. Return Standard Format
→ DetectedMetadata {
  title, author, type, year?, publisher?,
  description?, coverImage?, language?
}

// 5. Preview Phase
DocumentPreview → User edits/confirms

// 6. Upload with Metadata
uploadDocument(file, metadata) → {
  Store file in Supabase Storage
  Handle cover image (base64/URL/File)
  Create document record with metadata
  Create background job with documentType
}

// 7. Worker Receives
job.input_data.documentType → Chunking strategy
```

### Database Schema (Already Applied)

```sql
-- Migration 025: document_metadata_and_cover_images.sql
ALTER TABLE documents
  ADD COLUMN document_type TEXT,           -- fiction, nonfiction_book, etc.
  ADD COLUMN author TEXT,
  ADD COLUMN publication_year INTEGER,
  ADD COLUMN publisher TEXT,
  ADD COLUMN cover_image_url TEXT,         -- Supabase Storage URL
  ADD COLUMN detected_metadata JSONB;      -- Full metadata object
```

### Existing Pattern to Mirror

**Reference Implementation**: `/src/app/api/extract-metadata/route.ts` (PDF)

```typescript
// Pattern Structure (applies to all new APIs)
export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File

    // Validate input
    if (!file) {
      return Response.json({ error: 'No file provided' }, { status: 400 })
    }

    // Extract metadata (specific to each type)
    const metadata = await extractMetadata(file)

    // Return standard format
    return Response.json(metadata)
  } catch (error: any) {
    console.error('[endpoint-name] Error:', error)
    return Response.json(
      { error: error.message || 'Failed to extract metadata' },
      { status: 500 }
    )
  }
}
```

---

## 3. Implementation Details

### 3.1 Shared Type System

**File**: `src/types/metadata.ts` (New)

**Purpose**: Centralize type definitions used across all APIs, components, and actions.

```typescript
/**
 * Document type classifications for chunking strategy.
 * Influences how the worker segments and processes content.
 */
export type DocumentType =
  | 'fiction'              // Narrative structure, character-focused
  | 'nonfiction_book'      // Informational, concept-focused
  | 'academic_paper'       // Research-oriented, citation-heavy
  | 'technical_manual'     // Instructional, reference-style
  | 'article'              // Short-form, topic-focused
  | 'essay'                // Analytical, argument-focused

/**
 * Metadata detected from document sources.
 * Used for preview, editing, and worker routing.
 */
export interface DetectedMetadata {
  title: string
  author: string
  type: DocumentType
  year?: string           // Publication year (string for flexibility)
  publisher?: string
  isbn?: string           // EPUB only
  description?: string    // AI-generated or from source
  coverImage?: string     // base64 data URI, HTTP URL, or undefined
  language?: string       // ISO 639-1 code (default: 'en')
}

/**
 * Convert base64 data URI to Blob for upload to Supabase Storage.
 * Used for EPUB cover images.
 *
 * @param base64 - Data URI format: "data:image/jpeg;base64,..."
 * @returns Blob with correct MIME type
 */
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

**Integration**: After creating this file, update `/src/app/api/extract-metadata/route.ts` to import from shared types instead of local definitions (remove lines 7-22).

---

### 3.2 EPUB Metadata API

**File**: `src/app/api/extract-epub-metadata/route.ts` (New)

**Extraction Strategy**: Local ZIP parsing with existing worker EPUB parser

**Performance**: <100ms (no AI, no network calls)

**Cost**: $0 (local processing)

```typescript
import { NextRequest } from 'next/server'
import { parseEPUB } from '@/worker/lib/epub/epub-parser'
import type { DetectedMetadata, DocumentType } from '@/types/metadata'

export const runtime = 'nodejs'
export const maxDuration = 30 // EPUB parsing is fast

/**
 * Extract metadata from EPUB files using local OPF parsing.
 * Returns metadata + base64-encoded cover image.
 */
export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File

    if (!file) {
      return Response.json({ error: 'No file provided' }, { status: 400 })
    }

    console.log('[extract-epub-metadata] Parsing EPUB file:', file.name)

    // Parse EPUB locally (worker library)
    const buffer = Buffer.from(await file.arrayBuffer())
    const { metadata, coverImage } = await parseEPUB(buffer)

    console.log('[extract-epub-metadata] Extracted metadata:', {
      title: metadata.title,
      author: metadata.author,
      hasCover: !!coverImage
    })

    // Convert cover to base64 data URI
    const coverBase64 = coverImage
      ? `data:image/jpeg;base64,${coverImage.toString('base64')}`
      : undefined

    const result: DetectedMetadata = {
      title: metadata.title || 'Untitled',
      author: metadata.author || 'Unknown',
      type: inferTypeFromEPUB(metadata),
      year: metadata.publicationDate || undefined,
      publisher: metadata.publisher || undefined,
      isbn: metadata.isbn || undefined,
      description: metadata.description || undefined,
      coverImage: coverBase64,
      language: metadata.language || 'en'
    }

    return Response.json(result)
  } catch (error) {
    console.error('[extract-epub-metadata] Error:', error)
    return Response.json(
      { error: error instanceof Error ? error.message : 'Failed to extract EPUB metadata' },
      { status: 500 }
    )
  }
}

/**
 * Infer document type from EPUB metadata.
 * Uses publisher and subject tags for classification.
 */
function inferTypeFromEPUB(metadata: any): DocumentType {
  const publisher = metadata.publisher?.toLowerCase() || ''
  const subjects = metadata.subjects?.join(' ').toLowerCase() || ''

  // Technical publishers
  if (publisher.includes("o'reilly") ||
      publisher.includes('packt') ||
      publisher.includes('manning') ||
      publisher.includes('apress')) {
    return 'technical_manual'
  }

  // Academic publishers
  if (subjects.includes('textbook') ||
      publisher.includes('university press') ||
      publisher.includes('academic') ||
      subjects.includes('academic')) {
    return 'academic_paper'
  }

  // Non-fiction indicators
  if (subjects.includes('biography') ||
      subjects.includes('history') ||
      subjects.includes('science') ||
      subjects.includes('philosophy')) {
    return 'nonfiction_book'
  }

  // Default to fiction for EPUBs (most common consumer format)
  return 'fiction'
}
```

**Key Points**:
- Reuses existing `parseEPUB()` from worker (already tested)
- Three-strategy cover extraction (see worker/lib/epub/epub-parser.ts lines 314-370)
- Type inference based on publisher/subjects metadata
- Fast execution (<100ms typical)

---

### 3.3 Text/Markdown Metadata API

**File**: `src/app/api/extract-text-metadata/route.ts` (New)

**Extraction Strategy**: Hybrid - Frontmatter parsing (free) → AI extraction (fallback)

**Performance**: <10ms (frontmatter) or 2-3s (AI)

**Cost**: $0 (frontmatter) or $0.001 (Gemini Flash)

```typescript
import { NextRequest } from 'next/server'
import { generateObject } from 'ai'
import { google } from '@ai-sdk/google'
import { z } from 'zod'
import type { DetectedMetadata, DocumentType } from '@/types/metadata'

export const runtime = 'nodejs'
export const maxDuration = 30

/**
 * Zod schema for AI-powered metadata extraction.
 * Ensures structured output from Gemini.
 */
const metadataSchema = z.object({
  title: z.string(),
  author: z.string(),
  type: z.enum(['article', 'essay', 'nonfiction_book', 'technical_manual']),
  year: z.string().optional(),
  description: z.string().optional()
})

/**
 * Extract metadata from text/markdown files.
 * Strategy 1: Parse YAML frontmatter (instant, free)
 * Strategy 2: AI extraction with Vercel AI SDK (2s, $0.001)
 */
export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File

    if (!file) {
      return Response.json({ error: 'No file provided' }, { status: 400 })
    }

    const content = await file.text()

    // Strategy 1: Try frontmatter first (free and instant)
    const frontmatter = extractFrontmatter(content)
    if (frontmatter?.title && frontmatter?.author) {
      console.log('[extract-text-metadata] Using frontmatter (free path)')

      const result: DetectedMetadata = {
        title: frontmatter.title,
        author: frontmatter.author,
        type: (frontmatter.type as DocumentType) || 'article',
        year: frontmatter.year || frontmatter.date?.slice(0, 4),
        publisher: frontmatter.publisher,
        description: frontmatter.description,
        language: frontmatter.language || 'en'
      }

      return Response.json(result)
    }

    // Strategy 2: Fallback to AI extraction
    console.log('[extract-text-metadata] No frontmatter found, using AI extraction')

    const { object } = await generateObject({
      model: google(process.env.GEMINI_MODEL || 'gemini-2.0-flash-exp'),
      schema: metadataSchema,
      prompt: `Extract metadata from this document.

Rules:
- Title: Use main heading or infer from content
- Author: Look for author name or use "Unknown"
- Type: Classify as article, essay, nonfiction_book, or technical_manual
- Year: Publication year if mentioned (4 digits only)
- Description: 1-2 sentence summary

Document (first 5000 chars):
${content.slice(0, 5000)}`
    })

    console.log('[extract-text-metadata] AI extraction complete:', object.title)

    const result: DetectedMetadata = {
      ...object,
      language: 'en'
    }

    return Response.json(result)
  } catch (error) {
    console.error('[extract-text-metadata] Error:', error)
    return Response.json(
      { error: 'Failed to extract metadata' },
      { status: 500 }
    )
  }
}

/**
 * Extract YAML frontmatter from markdown content.
 * Supports standard Jekyll/Hugo frontmatter format:
 * ---
 * key: value
 * ---
 *
 * @returns Parsed frontmatter object or null if not found/invalid
 */
function extractFrontmatter(content: string): Record<string, any> | null {
  // Match YAML frontmatter (--- ... ---)
  const match = content.match(/^---\n([\s\S]*?)\n---/)
  if (!match) return null

  try {
    const yaml = match[1]
    const lines = yaml.split('\n')
    const data: Record<string, any> = {}

    for (const line of lines) {
      const colonIndex = line.indexOf(':')
      if (colonIndex === -1) continue

      const key = line.slice(0, colonIndex).trim()
      const value = line.slice(colonIndex + 1).trim().replace(/^['"]|['"]$/g, '')

      if (key && value) {
        data[key] = value
      }
    }

    // Validate minimum required fields
    return (data.title && data.author) ? data : null
  } catch (error) {
    console.warn('[extract-text-metadata] Frontmatter parsing failed:', error)
    return null
  }
}
```

**Key Points**:
- Frontmatter parsing is regex-based (simple but robust)
- AI fallback uses Vercel AI SDK's `generateObject` for structured output
- Zod schema ensures type safety
- First 5000 chars sufficient for metadata detection

---

### 3.4 YouTube Metadata API

**File**: `src/app/api/extract-youtube-metadata/route.ts` (New)

**Extraction Strategy**: YouTube Data API v3

**Performance**: 1-2s (network call)

**Cost**: $0 (within free quota: 10,000 units/day)

```typescript
import { NextRequest } from 'next/server'
import type { DetectedMetadata, DocumentType } from '@/types/metadata'

export const runtime = 'nodejs'
export const maxDuration = 10

/**
 * Extract metadata from YouTube videos using Data API v3.
 * Requires YOUTUBE_API_KEY environment variable.
 */
export async function POST(req: NextRequest) {
  try {
    const { url } = await req.json()

    if (!url) {
      return Response.json({ error: 'No URL provided' }, { status: 400 })
    }

    console.log('[extract-youtube-metadata] Fetching metadata for URL:', url)

    const videoId = extractVideoId(url)
    const metadata = await fetchYouTubeMetadata(videoId)

    const result: DetectedMetadata = {
      title: metadata.title,
      author: metadata.channelName,
      type: 'article' as DocumentType, // User will refine in preview
      year: new Date(metadata.publishedAt).getFullYear().toString(),
      description: metadata.description.slice(0, 200) +
                  (metadata.description.length > 200 ? '...' : ''),
      coverImage: metadata.thumbnail,
      language: 'en' // YouTube doesn't expose language in snippet
    }

    console.log('[extract-youtube-metadata] Extraction complete:', result.title)

    return Response.json(result)
  } catch (error) {
    console.error('[extract-youtube-metadata] Error:', error)

    // Check for quota errors (403 Forbidden)
    if (error instanceof Error &&
        (error.message.includes('quota') || error.message.includes('403'))) {
      return Response.json({
        error: 'YouTube API quota exceeded',
        fallback: true
      }, { status: 429 })
    }

    return Response.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch YouTube metadata' },
      { status: 500 }
    )
  }
}

/**
 * Extract video ID from various YouTube URL formats.
 * Supports: youtube.com/watch?v=, youtu.be/, embed/, v/, shorts/
 */
function extractVideoId(url: string): string {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\n?#]+)/,
    /youtube\.com\/embed\/([^&\n?#]+)/,
    /youtube\.com\/v\/([^&\n?#]+)/,
    /youtube\.com\/shorts\/([^&\n?#]+)/
  ]

  for (const pattern of patterns) {
    const match = url.match(pattern)
    if (match?.[1]) {
      console.log('[extract-youtube-metadata] Extracted video ID:', match[1])
      return match[1]
    }
  }

  throw new Error('Invalid YouTube URL format')
}

/**
 * Fetch video metadata from YouTube Data API v3.
 * Uses YOUTUBE_API_KEY from environment.
 */
async function fetchYouTubeMetadata(videoId: string) {
  const apiKey = process.env.YOUTUBE_API_KEY

  if (!apiKey) {
    throw new Error('YOUTUBE_API_KEY not configured in environment')
  }

  const url = new URL('https://www.googleapis.com/youtube/v3/videos')
  url.searchParams.set('id', videoId)
  url.searchParams.set('key', apiKey)
  url.searchParams.set('part', 'snippet')

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      'Accept': 'application/json'
    }
  })

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}))

    if (response.status === 403) {
      throw new Error('YouTube API quota exceeded')
    }

    throw new Error(`YouTube API error: ${errorData.error?.message || response.statusText}`)
  }

  const data = await response.json()

  if (!data.items || data.items.length === 0) {
    throw new Error('Video not found or is private')
  }

  const snippet = data.items[0].snippet

  return {
    title: snippet.title,
    channelName: snippet.channelTitle,
    description: snippet.description || '',
    // Thumbnail priority: maxres > high > medium > default
    thumbnail: snippet.thumbnails.maxres?.url ||
               snippet.thumbnails.high?.url ||
               snippet.thumbnails.medium?.url ||
               snippet.thumbnails.default?.url,
    publishedAt: snippet.publishedAt
  }
}
```

**Key Points**:
- YouTube API key already configured: `YOUTUBE_API_KEY` in `.env.local`
- Handles multiple URL formats (watch, embed, shorts, youtu.be)
- Graceful quota error handling (403 → 429 with fallback flag)
- Thumbnail selection prioritizes highest quality available

---

### 3.5 UploadZone Routing Logic

**File**: `src/components/library/UploadZone.tsx` (Modify)

**Changes**: Add metadata endpoint routing for new file types

**Location**: Lines 73-113 (existing PDF detection logic)

```typescript
// Add helper function at top of component (after imports)

/**
 * Determine which metadata extraction API to use for a file.
 * Returns null for types without preview (web_url, paste).
 */
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

  // No preview for other types (web_url, paste)
  return null
}

// Update handleFileSelect function (replace lines 75-111)

const handleFileSelect = useCallback(async (file: File) => {
  setSelectedFile(file)
  setError(null)

  // Generate cost estimate (existing logic)
  const estimate = await estimateProcessingCost(file.size)
  setCostEstimate(estimate)

  // Check if this file type supports metadata preview
  const endpoint = getMetadataEndpoint(file)

  if (!endpoint) {
    // No preview, proceed directly to upload (web_url, paste patterns)
    console.log('No metadata preview for this file type, skipping detection')
    return
  }

  // Extract metadata for preview
  setUploadPhase('detecting')

  try {
    const formData = new FormData()
    formData.append('file', file)

    console.log(`🔍 Extracting metadata using ${endpoint}...`)
    const startTime = Date.now()

    const response = await fetch(endpoint, {
      method: 'POST',
      body: formData
    })

    if (!response.ok) {
      const errorData = await response.json()
      throw new Error(errorData.error || 'Metadata extraction failed')
    }

    const metadata = await response.json()
    const duration = Date.now() - startTime

    console.log(`✅ Metadata extracted in ${duration}ms:`, metadata.title)

    setDetectedMetadata(metadata)
    setUploadPhase('preview')
  } catch (error) {
    console.error('Metadata detection error:', error)

    // Fallback: Show preview with filename-based metadata
    setDetectedMetadata({
      title: file.name.replace(/\.[^/.]+$/, ''), // Remove extension
      author: 'Unknown',
      type: 'article',
      description: 'Metadata extraction failed. Please edit manually.'
    })
    setUploadPhase('preview')
  }
}, [])

// Add YouTube URL handling for URL tab (new function)

const handleYouTubeUrl = useCallback(async (url: string) => {
  setError(null)
  setUploadPhase('detecting')

  try {
    console.log('🔍 Fetching YouTube metadata...')

    const response = await fetch('/api/extract-youtube-metadata', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url })
    })

    if (!response.ok) {
      const errorData = await response.json()

      if (response.status === 429 && errorData.fallback) {
        // Quota exceeded - show manual entry
        console.warn('YouTube API quota exceeded, using fallback')
        setDetectedMetadata({
          title: 'YouTube Video',
          author: 'Unknown Channel',
          type: 'article',
          description: 'YouTube API quota exceeded. Please edit manually.'
        })
      } else {
        throw new Error(errorData.error || 'Failed to fetch metadata')
      }
    } else {
      const metadata = await response.json()
      console.log('✅ YouTube metadata extracted:', metadata.title)
      setDetectedMetadata(metadata)
    }

    setUrlInput(url)
    setUploadPhase('preview')
  } catch (error) {
    console.error('YouTube metadata error:', error)

    // Fallback: Show preview with placeholder
    setDetectedMetadata({
      title: 'YouTube Video',
      author: 'Unknown',
      type: 'article',
      description: 'Failed to fetch metadata. Please edit manually.'
    })
    setUrlInput(url)
    setUploadPhase('preview')
  }
}, [])

// Call handleYouTubeUrl when YouTube URL is detected
// (Integration with existing URL tab - around line 350-400)
```

**Key Points**:
- `getMetadataEndpoint()` acts as router based on file type
- Maintains existing PDF flow (no breaking changes)
- Graceful fallback on errors (shows preview with filename)
- YouTube URL handling separate from file upload flow

---

### 3.6 Upload Actions Enhancement

**File**: `src/app/actions/documents.ts` (Modify)

**Changes**: Accept metadata parameter, handle cover images, persist to database

```typescript
import { base64ToBlob, type DetectedMetadata } from '@/types/metadata'

/**
 * Upload document with metadata to Supabase.
 * Handles file upload, cover image processing, and background job creation.
 *
 * @param file - Document file to upload
 * @param metadata - Detected or user-edited metadata
 * @returns Created document record
 */
export async function uploadDocument(
  file: File,
  metadata: DetectedMetadata
) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) throw new Error('Not authenticated')

  const documentId = generateId()
  const storagePath = `${user.id}/${documentId}`

  // 1. Upload source file to storage
  const fileExtension = getFileExtension(file)
  const { error: uploadError } = await supabase.storage
    .from('documents')
    .upload(`${storagePath}/source${fileExtension}`, file)

  if (uploadError) {
    console.error('File upload failed:', uploadError)
    throw new Error(`Failed to upload file: ${uploadError.message}`)
  }

  // 2. Handle cover image (three types)
  let coverImageUrl: string | null = null

  if (metadata.coverImage) {
    if (metadata.coverImage.startsWith('data:image')) {
      // Case 1: Base64 from EPUB - decode and upload to storage
      console.log('Converting base64 cover image to storage')
      const coverBlob = base64ToBlob(metadata.coverImage)
      const coverPath = `${storagePath}/cover.jpg`

      const { error: coverError } = await supabase.storage
        .from('documents')
        .upload(coverPath, coverBlob, { upsert: true })

      if (!coverError) {
        const { data } = supabase.storage
          .from('documents')
          .getPublicUrl(coverPath)

        coverImageUrl = data.publicUrl
      } else {
        console.warn('Cover upload failed (non-blocking):', coverError)
      }
    } else if (metadata.coverImage.startsWith('http')) {
      // Case 2: URL from YouTube - use directly
      console.log('Using HTTP cover image URL')
      coverImageUrl = metadata.coverImage
    }
    // Case 3: Manual File upload handled by DocumentPreview component
  }

  // 3. Create document record with metadata
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

  if (docError) {
    // Rollback: Delete uploaded file
    await supabase.storage
      .from('documents')
      .remove([`${storagePath}/source${fileExtension}`])

    throw new Error(`Failed to create document: ${docError.message}`)
  }

  // 4. Create background job with metadata for worker
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
        metadata // Full context for potential future use
      }
    })

  if (jobError) {
    console.error('Job creation failed:', jobError)
    throw new Error(`Failed to create background job: ${jobError.message}`)
  }

  console.log('✅ Document uploaded successfully:', doc.id)
  return doc
}

/**
 * Upload YouTube video for processing (no file upload needed).
 *
 * @param url - YouTube video URL
 * @param metadata - Video metadata from API
 * @returns Created document record
 */
export async function uploadYouTubeUrl(
  url: string,
  metadata: DetectedMetadata
) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) throw new Error('Not authenticated')

  const documentId = generateId()

  // Create document record (no file storage needed)
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

  if (docError) {
    throw new Error(`Failed to create document: ${docError.message}`)
  }

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

  if (jobError) {
    throw new Error(`Failed to create background job: ${jobError.message}`)
  }

  console.log('✅ YouTube video uploaded successfully:', doc.id)
  return doc
}

/**
 * Extract file extension including the dot.
 */
function getFileExtension(file: File): string {
  const name = file.name
  const lastDot = name.lastIndexOf('.')
  return lastDot > 0 ? name.slice(lastDot) : ''
}

/**
 * Detect source type from file.
 * (Existing function - reference only)
 */
function detectSourceType(file: File): string {
  if (file.type === 'application/pdf') return 'pdf'
  if (file.type === 'application/epub+zip') return 'epub'
  if (file.name.endsWith('.md')) return 'markdown_clean'
  if (file.type === 'text/plain') return 'txt'
  return 'unknown'
}
```

**Key Points**:
- Three cover image types handled: base64 (EPUB), URL (YouTube), File (manual)
- Metadata persisted to both typed columns AND `detected_metadata` JSONB
- Worker receives `documentType` via `job.input_data.documentType`
- Rollback on errors (delete uploaded files if DB insert fails)

---

### 3.7 DocumentPreview Integration

**File**: `src/components/upload/DocumentPreview.tsx` (Modify)

**Changes**: Update confirm handler to call enhanced upload actions

**Location**: Lines 207-209 (current confirm button)

```typescript
// Update the confirm button onClick handler

<Button
  onClick={async () => {
    try {
      setIsUploading(true)

      if (file) {
        // File upload with metadata
        await uploadDocument(file, edited)
      } else if (youtubeUrl) {
        // YouTube URL with metadata
        await uploadYouTubeUrl(youtubeUrl, edited)
      }

      // Call parent onConfirm callback
      onConfirm(edited, coverImage)

      // Reset form
      setIsUploading(false)
    } catch (error) {
      console.error('Upload failed:', error)
      setError(error instanceof Error ? error.message : 'Upload failed')
      setIsUploading(false)
    }
  }}
  disabled={isUploading}
>
  {isUploading ? 'Processing...' : 'Process Document'}
</Button>
```

**Key Points**:
- Handles both file uploads and YouTube URLs
- Passes edited metadata (user can modify before upload)
- Shows loading state during upload
- Error handling with user-friendly messages

---

## 4. Worker Integration (Already Built)

**No changes required** - the worker already receives and uses `documentType`.

**Reference**: `worker/lib/chunking/orchestrator.ts` (approx line 609)

```typescript
// Worker already handles documentType from job.input_data
const chunks = await batchChunkAndExtractMetadata(
  markdown,
  job.input_data.documentType, // ← Metadata preview provides this
  config
)
```

**How it works**:
1. Upload action creates background job with `input_data.documentType`
2. Worker picks up job from queue
3. Chunking orchestrator uses `documentType` to select appropriate chunking strategy
4. Different strategies for fiction (narrative flow) vs technical (topic-based) vs academic (citation-aware)

---

## 5. Implementation Tasks

### Phase 1: Foundation (10 min)

**Task 1.1**: Create Shared Types
- [ ] Create `src/types/metadata.ts`
- [ ] Add `DocumentType` enum
- [ ] Add `DetectedMetadata` interface
- [ ] Add `base64ToBlob()` utility
- [ ] Run `npm run lint` to validate TypeScript

**Task 1.2**: Refactor PDF API
- [ ] Update `src/app/api/extract-metadata/route.ts`
- [ ] Remove local type definitions (lines 7-22)
- [ ] Import from `@/types/metadata`
- [ ] Test existing PDF flow still works

**Validation**: `npm run lint` passes, PDF metadata extraction still works

---

### Phase 2: EPUB API (20 min)

**Task 2.1**: Create EPUB Metadata Endpoint
- [ ] Create `src/app/api/extract-epub-metadata/route.ts`
- [ ] Import `parseEPUB` from worker
- [ ] Implement POST handler with try-catch
- [ ] Add `inferTypeFromEPUB()` function
- [ ] Test with sample EPUB file

**Task 2.2**: Test EPUB Extraction
- [ ] Upload EPUB via UploadZone
- [ ] Verify metadata extracted (<100ms)
- [ ] Check cover image displays
- [ ] Verify type inference (technical vs fiction)

**Validation**:
```bash
# Manual API test
curl -X POST http://localhost:3000/api/extract-epub-metadata \
  -F "file=@test-files/sample.epub"
```

---

### Phase 3: Text/Markdown API (30 min)

**Task 3.1**: Create Text Metadata Endpoint
- [ ] Create `src/app/api/extract-text-metadata/route.ts`
- [ ] Implement `extractFrontmatter()` function
- [ ] Add Zod schema for AI extraction
- [ ] Implement hybrid extraction logic
- [ ] Test both paths (frontmatter + AI)

**Task 3.2**: Test Text Extraction
- [ ] Test markdown WITH frontmatter (instant)
- [ ] Test markdown WITHOUT frontmatter (AI)
- [ ] Test plain .txt file (AI)
- [ ] Verify cost tracking

**Validation**:
```bash
# Test frontmatter path
curl -X POST http://localhost:3000/api/extract-text-metadata \
  -F "file=@test-files/with-frontmatter.md"

# Test AI path
curl -X POST http://localhost:3000/api/extract-text-metadata \
  -F "file=@test-files/no-frontmatter.md"
```

---

### Phase 4: YouTube API (30 min)

**Task 4.1**: Create YouTube Metadata Endpoint
- [ ] Create `src/app/api/extract-youtube-metadata/route.ts`
- [ ] Implement `extractVideoId()` function
- [ ] Implement `fetchYouTubeMetadata()` function
- [ ] Add quota error handling (403 → 429)
- [ ] Test with real YouTube URL

**Task 4.2**: Test YouTube Extraction
- [ ] Test standard URL format (watch?v=)
- [ ] Test short URL format (youtu.be/)
- [ ] Verify thumbnail displays (maxres priority)
- [ ] Test quota exceeded scenario (mock)

**Validation**:
```bash
curl -X POST http://localhost:3000/api/extract-youtube-metadata \
  -H "Content-Type: application/json" \
  -d '{"url":"https://www.youtube.com/watch?v=dQw4w9WgXcQ"}'
```

---

### Phase 5: UploadZone Routing (30 min)

**Task 5.1**: Add Routing Logic
- [ ] Add `getMetadataEndpoint()` helper function
- [ ] Update `handleFileSelect()` to use router
- [ ] Add `handleYouTubeUrl()` function
- [ ] Integrate with existing URL tab
- [ ] Test all file type routing

**Task 5.2**: UI Integration
- [ ] Test PDF → PDF API (existing)
- [ ] Test EPUB → EPUB API (new)
- [ ] Test Markdown → Text API (new)
- [ ] Test Text → Text API (new)
- [ ] Test YouTube URL → YouTube API (new)

**Validation**: Each file type shows correct preview with metadata

---

### Phase 6: Upload Actions (30 min)

**Task 6.1**: Enhance Upload Functions
- [ ] Update `uploadDocument()` signature
- [ ] Add cover image handling (3 types)
- [ ] Create `uploadYouTubeUrl()` function
- [ ] Add `getFileExtension()` helper
- [ ] Test metadata persistence

**Task 6.2**: Database Verification
- [ ] Upload test document with metadata
- [ ] Verify `document_type` populated
- [ ] Verify `author`, `publication_year`, `publisher`
- [ ] Verify `detected_metadata` JSONB
- [ ] Verify `cover_image_url` for EPUB/YouTube

**Validation**:
```sql
-- Check metadata persistence
SELECT
  id, title, author, document_type,
  publication_year, cover_image_url,
  detected_metadata
FROM documents
ORDER BY created_at DESC
LIMIT 5;
```

---

### Phase 7: Integration Testing (30 min)

**Task 7.1**: End-to-End Testing
- [ ] Upload PDF → verify metadata → process
- [ ] Upload EPUB → verify cover → process
- [ ] Upload Markdown (frontmatter) → process
- [ ] Upload Text → verify AI extraction → process
- [ ] Paste YouTube URL → verify thumbnail → process

**Task 7.2**: Worker Verification
- [ ] Check background jobs table for `documentType`
- [ ] Verify worker receives correct type
- [ ] Monitor chunking strategy selection
- [ ] Verify no regression in processing

**Task 7.3**: Error Handling
- [ ] Test corrupted EPUB
- [ ] Test YouTube quota exceeded (mock)
- [ ] Test AI extraction failure
- [ ] Test invalid frontmatter
- [ ] Verify graceful degradation

**Validation**: All document types process successfully with correct metadata

---

## 6. Validation Gates

### Pre-Implementation
- [ ] YouTube API key configured in `.env.local`
- [ ] Supabase running locally
- [ ] Worker module running
- [ ] Test files available for each type

### Per-Phase Validation
- [ ] Phase 1: `npm run lint` passes
- [ ] Phase 2: EPUB API curl test successful
- [ ] Phase 3: Text API both paths work
- [ ] Phase 4: YouTube API curl test successful
- [ ] Phase 5: UI routing works for all types
- [ ] Phase 6: Database columns populated correctly
- [ ] Phase 7: End-to-end flow complete

### Pre-Deployment
- [ ] All TypeScript errors resolved
- [ ] No console errors in browser
- [ ] All 6 source types tested
- [ ] Metadata persists correctly
- [ ] Worker receives documentType
- [ ] Cover images display correctly
- [ ] Error handling works as expected

---

## 7. Error Handling Strategy

### API-Level Errors

**EPUB Parsing Failures**:
```typescript
try {
  const { metadata, coverImage } = await parseEPUB(buffer)
} catch (error) {
  // User sees: "Failed to parse EPUB file"
  return Response.json(
    { error: 'EPUB file is corrupted or invalid' },
    { status: 500 }
  )
}
```

**YouTube API Failures**:
```typescript
if (response.status === 403) {
  // Quota exceeded - return special status
  return Response.json(
    { error: 'YouTube API quota exceeded', fallback: true },
    { status: 429 }
  )
}
```

**AI Extraction Failures**:
```typescript
try {
  const { object } = await generateObject(...)
} catch (error) {
  // Log error, return generic failure
  console.error('[extract-text-metadata] AI extraction failed:', error)
  return Response.json(
    { error: 'Failed to extract metadata' },
    { status: 500 }
  )
}
```

### UI-Level Fallbacks

**UploadZone Error Handling**:
```typescript
catch (error) {
  // Show preview with filename-based metadata
  setDetectedMetadata({
    title: file.name.replace(/\.[^/.]+$/, ''),
    author: 'Unknown',
    type: 'article',
    description: 'Metadata extraction failed. Please edit manually.'
  })
  setUploadPhase('preview') // Allow user to proceed
}
```

**YouTube Quota Exceeded**:
```typescript
if (response.status === 429 && errorData.fallback) {
  setDetectedMetadata({
    title: 'YouTube Video',
    author: 'Unknown Channel',
    type: 'article',
    description: 'YouTube API quota exceeded. Please edit manually.'
  })
}
```

### Non-Blocking Failures

**Cover Image Upload**:
```typescript
if (!coverError) {
  coverImageUrl = data.publicUrl
} else {
  console.warn('Cover upload failed (non-blocking):', coverError)
  // Continue without cover image
}
```

---

## 8. Performance & Cost Analysis

### Extraction Performance

| Source Type | Strategy | Time | AI Calls | Cost |
|-------------|----------|------|----------|------|
| PDF | Files API + AI | 15s | 2 | $0.01 |
| EPUB | Local parsing | <100ms | 0 | $0 |
| Markdown (FM) | Regex | <10ms | 0 | $0 |
| Markdown (AI) | Gemini Flash | 2-3s | 1 | $0.001 |
| Text | Gemini Flash | 2-3s | 1 | $0.001 |
| YouTube | YouTube API | 1-2s | 0 | $0 |

### Cost Optimization

**Monthly Cost Estimate** (100 documents):
- 20 PDFs × $0.01 = $0.20
- 30 EPUBs × $0 = $0
- 20 Markdown (50% frontmatter) × $0.0005 = $0.01
- 20 Text × $0.001 = $0.02
- 10 YouTube × $0 = $0

**Total: ~$0.23/month** for 100 documents

---

## 9. Testing Strategy

### Unit Tests (Future Enhancement)

```typescript
// src/app/api/extract-epub-metadata/route.test.ts
describe('EPUB Metadata Extraction', () => {
  it('extracts metadata from valid EPUB', async () => {
    const file = await loadFixture('sample.epub')
    const response = await POST(createRequest(file))
    const metadata = await response.json()

    expect(metadata.title).toBeDefined()
    expect(metadata.author).toBeDefined()
    expect(metadata.coverImage).toMatch(/^data:image/)
  })

  it('handles corrupted EPUB gracefully', async () => {
    const file = await loadFixture('corrupted.epub')
    const response = await POST(createRequest(file))

    expect(response.status).toBe(500)
  })
})
```

### Integration Tests

**End-to-End Flow**:
1. Upload EPUB file
2. Verify metadata preview displays
3. Edit author field
4. Confirm upload
5. Check database for metadata
6. Verify background job has documentType
7. Wait for processing
8. Verify chunks use correct strategy

### Manual Testing Checklist

**EPUB**:
- [ ] Technical book (O'Reilly) → type = 'technical_manual'
- [ ] Fiction novel → type = 'fiction'
- [ ] Academic textbook → type = 'academic_paper'
- [ ] EPUB with cover → cover displays
- [ ] EPUB without cover → no error

**Markdown**:
```markdown
---
title: Test Article
author: Jane Doe
type: essay
year: 2025
---
Content...
```
- [ ] With frontmatter → instant preview
- [ ] Without frontmatter → AI extraction
- [ ] Malformed YAML → falls back to AI

**YouTube**:
- [ ] Standard URL (watch?v=)
- [ ] Short URL (youtu.be/)
- [ ] Embed URL
- [ ] Shorts URL
- [ ] Thumbnail maxres → high → default
- [ ] Channel name as author

**Error Cases**:
- [ ] Corrupted EPUB → shows error, allows manual entry
- [ ] YouTube quota exceeded → shows fallback message
- [ ] AI timeout → shows filename as title
- [ ] Invalid frontmatter → falls back to AI

---

## 10. Success Metrics

### Functional Requirements
- [x] All 6 source types show metadata preview
- [x] Cover images display correctly (EPUB embedded, YouTube thumbnail)
- [x] Metadata persists to database (typed columns + JSONB)
- [x] Worker receives documentType for chunking strategy
- [x] Graceful error handling (API failures, quota limits)
- [x] No regression in existing PDF flow

### Performance Requirements
- [ ] EPUB extraction < 100ms
- [ ] Text/Markdown (frontmatter) < 10ms
- [ ] Text/Markdown (AI) < 5s
- [ ] YouTube API < 3s
- [ ] UI remains responsive during extraction

### Cost Requirements
- [ ] EPUB: $0 (local parsing)
- [ ] Markdown frontmatter: $0 (regex)
- [ ] AI extraction: < $0.002 per document
- [ ] YouTube: $0 (within free quota)

### User Experience
- [ ] Clear loading states during extraction
- [ ] Editable metadata fields in preview
- [ ] Cover image upload option
- [ ] Error messages are actionable
- [ ] Can proceed even if extraction fails

---

## 11. Deployment Checklist

### Environment Setup
- [ ] `YOUTUBE_API_KEY` in production environment
- [ ] `GEMINI_MODEL` configured (default: gemini-2.0-flash-exp)
- [ ] Supabase Storage bucket 'documents' exists
- [ ] Database migration 025 applied

### Code Deployment
- [ ] All TypeScript compilation successful
- [ ] `npm run lint` passes
- [ ] No console errors in dev tools
- [ ] Test files cleaned up from repo

### Post-Deployment Verification
- [ ] Upload test document of each type
- [ ] Verify metadata in production database
- [ ] Check background jobs table for documentType
- [ ] Monitor worker logs for correct chunking strategy
- [ ] Verify cover images display in UI

---

## 12. Future Enhancements

### Phase 2 Improvements
1. **Batch Metadata Extraction**: Process multiple files in parallel
2. **Cover Image Generation**: AI-generated covers for text documents
3. **Metadata Validation**: Warn if metadata seems incorrect
4. **Cost Dashboard**: Show extraction costs per user
5. **Manual Entry Bypass**: Skip preview option for power users

### Additional Metadata Sources
1. **Web Scraping**: Extract author from HTML meta tags
2. **ISBN Lookup**: Fetch metadata from OpenLibrary API
3. **Google Books API**: Enhanced book metadata
4. **arXiv API**: Academic paper metadata

### Enhanced Type Inference
1. **Content Analysis**: Analyze text to refine type classification
2. **Machine Learning**: Train model on user corrections
3. **Domain Detection**: Auto-detect technical vs creative writing

---

## 13. Known Limitations

### Technical Constraints
1. **EPUB ESM Imports**: May require tsconfig adjustment for API routes
2. **YouTube Quota**: 10,000 units/day = 10,000 videos (acceptable for personal use)
3. **Frontmatter Parser**: Simple regex, doesn't handle nested YAML
4. **Cover Image Size**: No size limit validation (should add)

### Business Constraints
1. **Single User Focus**: No multi-user metadata conflict resolution
2. **No Batch Processing**: One file at a time
3. **No Undo**: Metadata changes are permanent
4. **No Audit Log**: Can't track who changed metadata

### Future Considerations
1. Add cover image size validation (<5MB)
2. Implement batch upload with parallel extraction
3. Add metadata change history
4. Support additional file formats (MOBI, AZW3)

---

## Appendix A: Reference Files

### Existing Implementations
- `/src/app/api/extract-metadata/route.ts` - PDF pattern to mirror
- `/src/components/upload/DocumentPreview.tsx` - Preview component
- `/src/components/library/UploadZone.tsx` - Upload flow
- `/src/app/actions/documents.ts` - Upload actions
- `/worker/lib/epub/epub-parser.ts` - EPUB parsing logic

### Database Migrations
- `supabase/migrations/025_document_metadata_and_cover_images.sql` - Schema

### Configuration Files
- `.env.local` - YouTube API key location
- `package.json` - Validation commands
- `tsconfig.json` - TypeScript configuration

---

## Appendix B: Task Breakdown Reference

**Detailed Task Breakdown**: `docs/tasks/unified-metadata-preview.md`

The task breakdown document contains:
- **18 tasks** organized into **7 phases**
- **Total Duration**: ~3 hours (180 minutes)
- **Critical Path**: T-001 → T-002 → T-009 → T-012 → T-015
- **Parallelization Opportunities**: APIs (Phase 2-4), Testing (Phase 7)
- **Given-When-Then Acceptance Criteria** for each task
- **Specific file paths** and implementation details
- **Validation commands** and SQL queries

**Quick Start**:
1. Begin with Phase 1 (Foundation) - all other tasks depend on shared types
2. Phases 2-4 (APIs) can be developed in parallel by multiple developers
3. Phase 5-6 (UI Integration) requires at least one API from Phase 2-4
4. Phase 7 (Testing) validates entire implementation

---

**End of PRP Document**

**Confidence Score**: 9/10

**Reasoning**:
- ✅ Clear pattern to replicate (existing PDF implementation)
- ✅ All infrastructure ready (database, worker, components)
- ✅ Comprehensive error handling strategy
- ✅ Well-defined integration points
- ⚠️ Minor risk: EPUB parser ESM imports in API route (testable early)

**Next Steps**:
1. Review and approve this PRP
2. Generate detailed task breakdown (automatic via team-lead-task-breakdown)
3. Begin Phase 1 implementation (shared types)
4. Test each phase incrementally
5. Deploy and monitor

---

**Document Version**: 1.0
**Last Updated**: 2025-10-03
**Prepared By**: AI Development Team
**Approved By**: [Pending Review]
