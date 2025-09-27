# Multi-Format Document Processing System

> **Feature Type**: Core Processing Pipeline Enhancement  
> **Complexity**: Medium (2 weeks)  
> **Impact**: High - Transforms Rhizome from PDF-only to universal content ingestion platform

---

## High-Level Objective

Transform Rhizome V2 from a PDF-only document processor into a **universal content ingestion system** that seamlessly handles 6 different input methods: PDF uploads, Markdown files (with optional AI cleaning), plain text files, YouTube video transcripts, web articles, and pasted text content. Enable users to capture knowledge from any source into a unified, searchable, and annotatable format.

**Success Criteria:**
- Users can upload/paste content from 6 different sources
- Processing quality maintained across all formats (>95% success rate)
- YouTube timestamps preserved and clickable
- Web articles extracted cleanly without ads/navigation
- Processing time <2 minutes per document
- Cost <$0.05 per document (Gemini API)

---

## Mid-Level Objectives

### 1. Database Schema Enhancement
- Add `source_url` TEXT column to documents table (nullable, for YouTube/web URLs)
- Add `processing_requested` BOOLEAN to documents table (for markdown optional processing)
- Add `timestamps` JSONB to chunks table (for YouTube timestamp preservation)
- Create migration with indexes for performance

### 2. External Library Integration
- Integrate `youtube-transcript-plus` for YouTube transcript fetching with retry logic
- Integrate `jsdom` + `@mozilla/readability` for web article extraction
- Add `axios` for HTTP requests with proper error handling
- Install TypeScript type definitions

### 3. Worker Processing Pipeline Refactoring
- Refactor `worker/handlers/process-document.ts` to route by `source_type`
- Implement YouTube handler (fetch transcript → format with timestamps → chunk)
- Implement web URL handler (fetch HTML → extract article → Gemini cleanup → chunk)
- Implement markdown save-as-is handler (heading-based chunking, no AI)
- Implement text file handler (Gemini conversion to markdown)
- Add timestamp extraction logic (JSONB with context snippets)

### 4. Upload UI Enhancement
- Update `src/components/library/UploadZone.tsx` with tabbed interface
- Add "Fetch from URL" input with client-side YouTube/web detection
- Add "Paste Content" textarea with optional source URL field
- Add markdown processing radio buttons (Save as-is | Clean with AI)
- Implement smart error recovery UI (archive.ph suggestion for paywalls)

### 5. Error Handling & Recovery
- Implement structured error responses for worker failures
- Add retry logic with exponential backoff for rate limits
- Update ProcessingDock to show format-specific error messages
- Add fallback flows (YouTube manual paste, web archive.ph suggestion)

### 6. Testing & Validation
- Create unit tests for helper utilities (video ID extraction, timestamp parsing)
- Create integration tests for worker handlers (mocked external APIs)
- Manual testing plan for all 6 upload methods
- Performance validation (processing time, API costs)

---

## Implementation Notes

### Technical Architecture Overview

```
User Input (6 Methods)
    ↓
uploadDocument Action (src/app/actions/documents.ts)
    ↓ (creates background job with source_type metadata)
Background Job System
    ↓
Worker Handler (worker/handlers/process-document.ts)
    ↓ (routes by source_type)
Format-Specific Processing
    ↓
Unified Output: Markdown (Storage) + Chunks (Database) + Embeddings
```

### Processing Paths by Source Type

| Source Type | External API | AI Processing | Chunking Method | Special Handling |
|------------|--------------|---------------|-----------------|------------------|
| `pdf` | Gemini Files API | Yes (extract + chunk) | Semantic | Existing (no changes) |
| `markdown_asis` | None | No | Heading-based | NEW: Manual chunking |
| `markdown_clean` | None | Yes (cleanup + chunk) | Semantic | NEW: Optional processing |
| `txt` | None | Yes (format + chunk) | Semantic | NEW: Markdown conversion |
| `youtube` | youtube-transcript-plus | Yes (chunk only) | Semantic | NEW: Timestamp preservation |
| `web_url` | axios + Readability | Yes (cleanup + chunk) | Semantic | NEW: Article extraction |
| `paste` | None | Yes (format + chunk) | Semantic | NEW: Generic text processing |

### Key Patterns to Follow

**From `worker/handlers/process-document.ts`:**

1. **File Type Detection** (Lines 62-65):
```typescript
const contentType = fileResponse.headers.get('content-type') || 'application/pdf'
const isTextFile = contentType.includes('text') || contentType.includes('markdown')
const isPDF = contentType.includes('pdf')
```

2. **Checkpoint Recovery** (Lines 52, 231-239):
```typescript
if (!completedStages.includes(STAGES.SAVE_MARKDOWN.name)) {
  // Full processing
} else {
  // Resume from checkpoint
  markdown = await mdBlob.text()
  chunks = await rechunkMarkdown(ai, markdown)
}
```

3. **Error Handling** (Lines 197-201):
```typescript
try {
  // Processing
} catch (error: any) {
  const friendlyMessage = getUserFriendlyError(error)
  throw new Error(friendlyMessage)
}
```

4. **Rate Limiting** (Lines 248-250):
```typescript
if (i > 0 && i % 10 === 0) {
  await new Promise(resolve => setTimeout(resolve, 1000))
}
```

5. **Structured Output** (Lines 132-144):
```typescript
const result = await ai.models.generateContent({
  model: 'gemini-2.0-flash',
  contents: [{ parts: [
    { fileData: { fileUri: uploadedFile.uri, mimeType: 'application/pdf' } },
    { text: EXTRACTION_PROMPT }
  ]}],
  config: {
    responseMimeType: 'application/json',
    responseSchema: EXTRACTION_SCHEMA
  }
})
```

### External Library Documentation

**YouTube Transcript Fetching:**
- Library: `youtube-transcript-plus` (https://github.com/ericmmartin/youtube-transcript-plus)
- Installation: `npm install youtube-transcript-plus`
- TypeScript: Built-in type definitions included
- Features: Retry logic, caching, proxy support, multiple language support

**Web Article Extraction:**
- Libraries: `jsdom` + `@mozilla/readability` + `axios`
- Installation: `npm install jsdom @mozilla/readability axios`
- TypeScript: `npm install -D @types/mozilla__readability`
- Pattern: Fetch HTML with axios → Parse with jsdom → Extract with Readability
- Security: Disable script execution in jsdom

### Critical Implementation Details

**Timestamp Storage Schema:**
```typescript
// chunks table
{
  source_timestamp: 125,  // INTEGER: First timestamp (seconds) for chunk start
  timestamps: [           // JSONB: All timestamps with fuzzy-match context
    {
      time: 125,          // Seconds from video start
      context_before: "talking about the importance of",  // 3-5 words before
      context_after: "in modern web development"          // 3-5 words after
    },
    {
      time: 187,
      context_before: "another key aspect is",
      context_after: "which we'll explore next"
    }
  ]
}
```

**YouTube Deep Linking Format:**
- URL Parameter: `&t=<seconds>` (e.g., `&t=125` for 2:05)
- Alternative: `&t=2m5s` format also supported
- Generate links: `https://youtube.com/watch?v=${videoId}&t=${seconds}s`

**Error Classification:**
- **Transient Errors** (retry): Rate limits, timeouts, network errors
- **Permanent Errors** (fail gracefully): Invalid URLs, disabled transcripts, 404s
- **Paywall Errors** (suggest alternative): HTTP 403, content extraction failure

### Dependencies & Requirements

**Existing Systems (No Changes Needed):**
- Gemini Files API integration (`@google/genai` v0.3+)
- Background job system with progress tracking
- Supabase Storage for file management
- ECS system for user annotations/flashcards
- ProcessingDock UI for real-time updates

**New External Dependencies:**
```json
{
  "youtube-transcript-plus": "^2.0.0",
  "jsdom": "^24.0.0",
  "@mozilla/readability": "^0.5.0",
  "axios": "^1.6.0"
}
```

**New Dev Dependencies:**
```json
{
  "@types/mozilla__readability": "^0.2.0"
}
```

### Coding Standards

1. **JSDoc Required**: All exported functions must have complete JSDoc (enforced by ESLint)
2. **TypeScript Strict**: No `any` types, explicit return types
3. **Error Handling**: Use structured error objects with type classification
4. **Testing**: Unit tests for utilities, integration tests for worker handlers
5. **File Organization**: Co-locate tests in `__tests__/` folders
6. **Naming Conventions**: camelCase for functions, PascalCase for components

### Validation Commands

```bash
# Type checking and linting
npm run lint       # ESLint + JSDoc validation
npm run build      # Next.js build + TypeScript check

# Testing
npm run test       # Jest test suite
npm run test:watch # Watch mode for development

# Development
npm run dev        # Full stack (Supabase + Worker + Next.js)
npm run worker     # Worker only
```

---

## Context

### Beginning Context (Files That Exist)

**Processing Pipeline:**
- `/Users/topher/Code/rhizome-v2/worker/handlers/process-document.ts` (475 lines)
  - Current: Handles PDF and text/markdown processing
  - Routing logic starts at line 62-65 (file type detection)
  - Needs refactoring at line 207 (add new format handlers)

**Database Schema:**
- `/Users/topher/Code/rhizome-v2/supabase/migrations/001_initial_schema.sql`
  - `documents` table has `source_type` column (currently: 'pdf' | 'epub' | 'web')
  - `chunks` table has basic structure (no timestamp support)
  
**Upload UI:**
- `/Users/topher/Code/rhizome-v2/src/components/library/UploadZone.tsx` (191 lines)
  - Current: Drag-drop for PDF/text/markdown files
  - Line 115: Where to add new upload methods

**Server Actions:**
- `/Users/topher/Code/rhizome-v2/src/app/actions/documents.ts` (230 lines)
  - `uploadDocument` function (lines 43-113)
  - Handles file upload, validation, background job creation

**Processing Status UI:**
- `/Users/topher/Code/rhizome-v2/src/components/layout/ProcessingDock.tsx` (381 lines)
  - Current: Shows processing stages for documents
  - Line 22: Where to add format-specific substages

### Ending Context (Files That Will Exist)

**New Database Migration:**
- `/Users/topher/Code/rhizome-v2/supabase/migrations/010_multi_format_support.sql` (NEW)
  - Adds `source_url`, `processing_requested` to documents
  - Adds `timestamps` JSONB to chunks
  - Creates performance indexes

**New Worker Utilities:**
- `/Users/topher/Code/rhizome-v2/worker/lib/youtube.ts` (NEW)
  - `extractVideoId(url: string): string | null`
  - `fetchTranscriptWithRetry(videoId: string, maxRetries: number): Promise<TranscriptSegment[]>`
  - `formatTranscriptToMarkdown(transcript: TranscriptSegment[], videoUrl: string): string`

- `/Users/topher/Code/rhizome-v2/worker/lib/web-extraction.ts` (NEW)
  - `isValidUrl(url: string): boolean`
  - `extractArticle(url: string): Promise<Article>`
  - `sanitizeHtml(html: string): string`

- `/Users/topher/Code/rhizome-v2/worker/lib/markdown-chunking.ts` (NEW)
  - `simpleMarkdownChunking(markdown: string): Chunk[]`
  - `extractTimestampsWithContext(content: string): TimestampContext[]`

**Updated Worker Handler:**
- `/Users/topher/Code/rhizome-v2/worker/handlers/process-document.ts` (MODIFIED)
  - Refactored routing logic with new format handlers
  - YouTube processing handler
  - Web URL processing handler
  - Markdown save-as-is handler
  - Timestamp extraction integration

**Updated Upload UI:**
- `/Users/topher/Code/rhizome-v2/src/components/library/UploadZone.tsx` (MODIFIED)
  - Tabbed interface (Upload File | Fetch from URL | Paste Content)
  - Markdown processing radio buttons
  - URL input with smart detection
  - Paste textarea with optional source URL

**Updated Server Actions:**
- `/Users/topher/Code/rhizome-v2/src/app/actions/documents.ts` (MODIFIED)
  - Accepts new FormData fields (source_type, source_url, processing_requested)
  - Updated validation logic for new formats

**Updated Processing UI:**
- `/Users/topher/Code/rhizome-v2/src/components/layout/ProcessingDock.tsx` (MODIFIED)
  - Format-specific error messages
  - Recovery actions (archive.ph link, show paste textarea)

**New Tests:**
- `/Users/topher/Code/rhizome-v2/worker/__tests__/multi-format.test.ts` (NEW)
  - Unit tests for YouTube utilities
  - Unit tests for web extraction utilities
  - Integration tests for worker handlers

---

## Low-Level Tasks

> **Execution Order**: Tasks must be completed sequentially. Each task depends on previous tasks.

### Phase 1: Database & Dependencies (Week 1, Days 1-2)

---

#### Task 1.1: Create Database Migration for Multi-Format Support

**Objective**: Add required database columns and indexes to support new source types.

```
CREATE the migration file: supabase/migrations/010_multi_format_support.sql

Add the following SQL:

-- Add new columns to documents table
ALTER TABLE documents 
  ADD COLUMN source_url TEXT,
  ADD COLUMN processing_requested BOOLEAN DEFAULT true;

-- Add timestamp support to chunks table
ALTER TABLE chunks
  ADD COLUMN timestamps JSONB;

-- Add indexes for performance
CREATE INDEX idx_documents_source_url ON documents(source_url) WHERE source_url IS NOT NULL;
CREATE INDEX idx_chunks_timestamps ON chunks USING GIN (timestamps) WHERE timestamps IS NOT NULL;

-- Update source_type enum to include new types
-- Note: PostgreSQL doesn't have easy ALTER TYPE, so we'll use CHECK constraint instead
ALTER TABLE documents 
  DROP CONSTRAINT IF EXISTS documents_source_type_check;

ALTER TABLE documents
  ADD CONSTRAINT documents_source_type_check 
  CHECK (source_type IN ('pdf', 'markdown_asis', 'markdown_clean', 'txt', 'youtube', 'web_url', 'paste'));

-- Add comment documentation
COMMENT ON COLUMN documents.source_url IS 'Source URL for YouTube videos or web articles. Null for uploaded files.';
COMMENT ON COLUMN documents.processing_requested IS 'For markdown files: true = AI cleanup, false = save as-is';
COMMENT ON COLUMN chunks.timestamps IS 'JSONB array of timestamp objects with time, context_before, context_after fields for YouTube videos';
```

**Validation**:
```bash
# Apply migration
npx supabase db reset

# Verify columns exist
npx supabase db diff

# Expected: No differences, migration applied successfully
```

---

#### Task 1.2: Install External Libraries

**Objective**: Add npm dependencies for YouTube and web content extraction.

```
RUN the following commands in terminal:

# Install production dependencies
npm install youtube-transcript-plus jsdom @mozilla/readability axios

# Install TypeScript type definitions
npm install -D @types/mozilla__readability

# Verify installation
npm list youtube-transcript-plus jsdom @mozilla/readability axios
```

**Validation**:
```bash
# Check package.json includes:
# - youtube-transcript-plus: ^2.x
# - jsdom: ^24.x
# - @mozilla/readability: ^0.5.x
# - axios: ^1.6.x

# Verify TypeScript can find types
npx tsc --noEmit
# Expected: No errors related to missing type definitions
```

---

#### Task 1.3: Create TypeScript Type Definitions

**Objective**: Define TypeScript interfaces for new data structures.

```
CREATE file: worker/types/multi-format.ts

Add TypeScript interfaces:

/**
 * YouTube transcript segment from youtube-transcript-plus library.
 */
export interface TranscriptSegment {
  /** Transcript text content */
  text: string
  /** Segment duration in seconds */
  duration: number
  /** Start time offset in seconds from video beginning */
  offset: number
  /** Language code (e.g., 'en', 'es') */
  lang?: string
}

/**
 * Timestamp context for fuzzy matching in markdown content.
 */
export interface TimestampContext {
  /** Timestamp in seconds */
  time: number
  /** 3-5 words appearing before timestamp in content */
  context_before: string
  /** 3-5 words appearing after timestamp in content */
  context_after: string
}

/**
 * Extracted web article from Mozilla Readability.
 */
export interface Article {
  /** Article title */
  title: string
  /** Processed HTML content */
  content: string
  /** Plain text without HTML tags */
  textContent: string
  /** Article description/summary */
  excerpt: string
  /** Author metadata */
  byline: string
  /** Website name */
  siteName: string
  /** Content language */
  lang?: string
}

/**
 * Source type enum for document processing routing.
 */
export type SourceType = 
  | 'pdf'              // Existing PDF processing via Files API
  | 'markdown_asis'    // Save markdown as-is, chunk by headings
  | 'markdown_clean'   // Clean markdown with AI + semantic chunking
  | 'txt'              // Convert text to markdown with AI
  | 'youtube'          // Fetch YouTube transcript + preserve timestamps
  | 'web_url'          // Extract web article + clean with AI
  | 'paste'            // Generic pasted text processing

/**
 * Error types for structured error handling.
 */
export type ErrorType = 
  | 'transient'        // Retry possible (rate limit, timeout)
  | 'permanent'        // Fail gracefully (invalid URL, disabled)
  | 'paywall'          // Suggest alternative (HTTP 403, extraction failed)
  | 'invalid'          // Validation error (malformed input)
```

**Validation**:
```bash
# Type check
npx tsc --noEmit

# Expected: No TypeScript errors
```

---

### Phase 2: Worker Utilities (Week 1, Days 3-5)

---

#### Task 2.1: Create YouTube Utility Functions

**Objective**: Implement YouTube video ID extraction and transcript fetching with retry logic.

```
CREATE file: worker/lib/youtube.ts

Implement functions:

import { fetchTranscript } from 'youtube-transcript-plus'
import type { TranscriptSegment } from '../types/multi-format'

/**
 * Extracts YouTube video ID from various URL formats.
 * 
 * Supports:
 * - youtube.com/watch?v=ID
 * - youtu.be/ID
 * - youtube.com/shorts/ID
 * - youtube.com/embed/ID
 * 
 * @param url - YouTube URL
 * @returns Video ID (11 characters) or null if invalid
 * 
 * @example
 * extractVideoId('https://youtube.com/watch?v=dQw4w9WgXcQ') // 'dQw4w9WgXcQ'
 * extractVideoId('https://youtu.be/dQw4w9WgXcQ') // 'dQw4w9WgXcQ'
 */
export function extractVideoId(url: string): string | null {
  const regex = /(?:youtube(?:-nocookie)?\.com\/(?:[^\/\n\s]+\/\S+\/|(?:v|e(?:mbed)?)\/|shorts\/|\S*?[?&]v=)|youtu\.be\/)([a-zA-Z0-9_-]{11})/
  const match = url.match(regex)
  return match ? match[1] : null
}

/**
 * Fetches YouTube transcript with exponential backoff retry logic.
 * 
 * Handles:
 * - Rate limiting with exponential backoff (1s, 2s, 4s, 8s)
 * - Permanent failures (disabled transcripts, unavailable videos)
 * - Transient errors (network issues, timeouts)
 * 
 * @param videoId - YouTube video ID (11 characters)
 * @param maxRetries - Maximum retry attempts (default: 3)
 * @returns Array of transcript segments with timestamps
 * @throws {Error} With specific error type for UI handling
 * 
 * @example
 * const transcript = await fetchTranscriptWithRetry('dQw4w9WgXcQ')
 * // Returns: [{ text: '...', offset: 0, duration: 1.5, lang: 'en' }, ...]
 */
export async function fetchTranscriptWithRetry(
  videoId: string,
  maxRetries: number = 3
): Promise<TranscriptSegment[]> {
  let lastError: Error | null = null
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      // Fetch transcript with language preference
      const transcript = await fetchTranscript(`https://youtube.com/watch?v=${videoId}`, {
        lang: 'en'  // Prefer English, falls back to auto-generated
      })
      
      return transcript
      
    } catch (error: any) {
      lastError = error
      
      // Permanent failures - don't retry
      if (error.name === 'YoutubeTranscriptDisabledError') {
        throw new Error('YOUTUBE_TRANSCRIPT_DISABLED: Video has transcripts disabled. Please paste transcript manually.')
      }
      
      if (error.name === 'YoutubeTranscriptVideoUnavailableError') {
        throw new Error('YOUTUBE_VIDEO_UNAVAILABLE: Video is private, deleted, or does not exist.')
      }
      
      // Rate limit - retry with exponential backoff
      if (error.name === 'YoutubeTranscriptTooManyRequestError') {
        if (attempt < maxRetries - 1) {
          const delay = Math.pow(2, attempt) * 1000  // 1s, 2s, 4s
          await new Promise(resolve => setTimeout(resolve, delay))
          continue
        }
        throw new Error('YOUTUBE_RATE_LIMIT: Too many requests. Please try again in a few minutes.')
      }
      
      // Transient errors - retry
      if (attempt < maxRetries - 1) {
        const delay = 1000  // 1 second for network errors
        await new Promise(resolve => setTimeout(resolve, delay))
        continue
      }
      
      // Max retries exceeded
      throw error
    }
  }
  
  throw lastError || new Error('YOUTUBE_FETCH_FAILED: Failed to fetch transcript after multiple retries.')
}

/**
 * Formats YouTube transcript segments into markdown with clickable timestamp links.
 * 
 * Generates markdown with inline timestamps like:
 * [00:00](https://youtube.com/watch?v=ID&t=0s) Transcript text here...
 * [02:05](https://youtube.com/watch?v=ID&t=125s) More content...
 * 
 * @param transcript - Array of transcript segments from fetchTranscript
 * @param videoUrl - Original YouTube URL for generating deep links
 * @returns Formatted markdown with timestamp links
 * 
 * @example
 * const markdown = formatTranscriptToMarkdown(transcript, 'https://youtube.com/watch?v=abc123')
 * // Returns: "# Video Transcript\n\n[00:00](https://youtube.com/watch?v=abc123&t=0s) ..."
 */
export function formatTranscriptToMarkdown(
  transcript: TranscriptSegment[],
  videoUrl: string
): string {
  const videoId = extractVideoId(videoUrl)
  if (!videoId) {
    throw new Error('Invalid YouTube URL for markdown formatting')
  }
  
  let markdown = '# Video Transcript\n\n'
  
  for (const segment of transcript) {
    // Convert seconds to MM:SS or HH:MM:SS format
    const timestamp = formatTimestamp(segment.offset)
    
    // Generate YouTube deep link with timestamp
    const link = `https://youtube.com/watch?v=${videoId}&t=${Math.floor(segment.offset)}s`
    
    // Add timestamped entry
    markdown += `[${timestamp}](${link}) ${segment.text.trim()}\n\n`
  }
  
  return markdown
}

/**
 * Formats seconds into MM:SS or HH:MM:SS timestamp string.
 * 
 * @param seconds - Time in seconds
 * @returns Formatted timestamp string
 * 
 * @example
 * formatTimestamp(125) // '02:05'
 * formatTimestamp(3725) // '01:02:05'
 */
function formatTimestamp(seconds: number): string {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = Math.floor(seconds % 60)
  
  if (hours > 0) {
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }
  return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
}
```

**Validation**:
```bash
# Run tests
npm test worker/lib/__tests__/youtube.test.ts

# Manual test with real YouTube video
node -e "
const { extractVideoId, fetchTranscriptWithRetry } = require('./worker/lib/youtube');
const videoId = extractVideoId('https://youtube.com/watch?v=dQw4w9WgXcQ');
console.log('Video ID:', videoId);
fetchTranscriptWithRetry(videoId).then(t => console.log('Segments:', t.length));
"

# Expected: Video ID extracted, transcript segments returned
```

---

#### Task 2.2: Create Web Article Extraction Utilities

**Objective**: Implement web URL validation and article content extraction using jsdom + Readability.

```
CREATE file: worker/lib/web-extraction.ts

Implement functions:

import { JSDOM } from 'jsdom'
import { Readability } from '@mozilla/readability'
import axios from 'axios'
import type { Article } from '../types/multi-format'

/**
 * Validates if a string is a well-formed HTTP/HTTPS URL.
 * 
 * @param url - URL string to validate
 * @returns true if valid HTTP(S) URL
 * 
 * @example
 * isValidUrl('https://example.com/article') // true
 * isValidUrl('not-a-url') // false
 */
export function isValidUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

/**
 * Extracts article content from a web URL using Mozilla Readability algorithm.
 * 
 * Process:
 * 1. Fetch HTML with axios (10s timeout)
 * 2. Parse with jsdom (scripts disabled for security)
 * 3. Validate content is article-like (isProbablyReaderable check)
 * 4. Extract main content with Readability
 * 5. Sanitize output
 * 
 * @param url - Web article URL
 * @returns Extracted article with title, content, text, metadata
 * @throws {Error} With specific error type for UI handling
 * 
 * @example
 * const article = await extractArticle('https://example.com/article')
 * // Returns: { title: '...', textContent: '...', ... }
 */
export async function extractArticle(url: string): Promise<Article> {
  // Validate URL format
  if (!isValidUrl(url)) {
    throw new Error('WEB_INVALID_URL: Invalid URL format. Please check the URL and try again.')
  }
  
  try {
    // Fetch HTML with timeout and error handling
    const response = await axios.get(url, {
      timeout: 10000,  // 10 second timeout
      validateStatus: (status) => status < 500,  // Don't throw on 4xx
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; RhizomeBot/2.0; +https://rhizome.app)'
      }
    })
    
    // Handle non-200 responses
    if (response.status === 404) {
      throw new Error('WEB_NOT_FOUND: Article not found (404). Please check the URL.')
    }
    
    if (response.status === 403) {
      throw new Error('WEB_PAYWALL: Access forbidden (403). This may be a paywalled article. Try using https://archive.ph/ to find an archived version, or paste the article content directly.')
    }
    
    if (response.status >= 400) {
      throw new Error(`WEB_HTTP_ERROR: HTTP ${response.status} error. Unable to fetch article.`)
    }
    
    // Create DOM with security restrictions
    const dom = new JSDOM(response.data, {
      url: url,  // Required for relative URL resolution
      runScripts: 'outside-only'  // Disable script execution for security
    })
    
    // Check if content is suitable for article extraction
    if (!Readability.isProbablyReaderable(dom.window.document)) {
      throw new Error('WEB_NOT_ARTICLE: This page does not appear to be an article. Try pasting the content directly instead.')
    }
    
    // Extract article content
    const reader = new Readability(dom.window.document, {
      charThreshold: 500,  // Minimum 500 characters for article
      keepClasses: false   // Remove CSS classes for cleaner output
    })
    
    const article = reader.parse()
    
    if (!article) {
      throw new Error('WEB_EXTRACTION_FAILED: Failed to extract readable content from this page. Try pasting the content directly.')
    }
    
    // Clean up DOM to prevent memory leaks
    dom.window.close()
    
    return article
    
  } catch (error: any) {
    // Handle axios-specific errors
    if (axios.isAxiosError(error)) {
      if (error.code === 'ECONNABORTED') {
        throw new Error('WEB_TIMEOUT: Request timeout - the website took too long to respond. Please try again.')
      }
      if (error.code === 'ERR_NETWORK') {
        throw new Error('WEB_NETWORK_ERROR: Network error. Please check your connection and try again.')
      }
    }
    
    // Re-throw structured errors
    if (error.message.startsWith('WEB_')) {
      throw error
    }
    
    // Unknown error
    throw new Error(`WEB_UNKNOWN_ERROR: ${error.message}`)
  }
}

/**
 * Sanitizes HTML content to prevent XSS attacks.
 * Removes potentially dangerous tags and attributes.
 * 
 * Note: For production use, consider integrating DOMPurify or similar library.
 * This is a basic implementation for MVP.
 * 
 * @param html - HTML string to sanitize
 * @returns Sanitized HTML
 */
export function sanitizeHtml(html: string): string {
  // Basic sanitization - remove script tags, event handlers, etc.
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/on\w+="[^"]*"/gi, '')
    .replace(/on\w+='[^']*'/gi, '')
    .replace(/javascript:[^"']*/gi, '')
  
  // For production: Use DOMPurify
  // import DOMPurify from 'isomorphic-dompurify'
  // return DOMPurify.sanitize(html, {
  //   ALLOWED_TAGS: ['p', 'h1', 'h2', 'h3', 'h4', 'ul', 'ol', 'li', 'a', 'strong', 'em'],
  //   ALLOWED_ATTR: ['href']
  // })
}
```

**Validation**:
```bash
# Run tests
npm test worker/lib/__tests__/web-extraction.test.ts

# Manual test with real article
node -e "
const { extractArticle } = require('./worker/lib/web-extraction');
extractArticle('https://example.com').then(article => {
  console.log('Title:', article.title);
  console.log('Length:', article.textContent.length);
});
"

# Expected: Article title and content length displayed
```

---

#### Task 2.3: Create Markdown Chunking Utilities

**Objective**: Implement heading-based chunking for markdown save-as-is mode and timestamp extraction.

```
CREATE file: worker/lib/markdown-chunking.ts

Implement functions:

import type { TimestampContext } from '../types/multi-format'

/**
 * Chunks markdown by headings for save-as-is mode (no AI processing).
 * 
 * Algorithm:
 * 1. Split markdown by heading markers (# ## ### etc.)
 * 2. Keep heading with subsequent content as chunk
 * 3. Minimum chunk size: 200 characters
 * 4. Maximum chunk size: 2000 characters (split long sections)
 * 
 * @param markdown - Raw markdown content
 * @returns Array of chunk objects with content and metadata
 * 
 * @example
 * const chunks = simpleMarkdownChunking('# Title\n\nContent...')
 * // Returns: [{ content: '# Title\n\nContent...', themes: ['Title'], ... }]
 */
export function simpleMarkdownChunking(markdown: string): Array<{
  content: string
  themes: string[]
  importance_score: number
  summary: string
}> {
  const chunks: Array<{
    content: string
    themes: string[]
    importance_score: number
    summary: string
  }> = []
  
  // Split by headings (# ## ### etc.)
  const headingRegex = /^(#{1,6})\s+(.+)$/gm
  const sections: Array<{ level: number; heading: string; content: string }> = []
  
  let lastIndex = 0
  let match: RegExpExecArray | null
  
  while ((match = headingRegex.exec(markdown)) !== null) {
    if (lastIndex > 0) {
      // Save previous section
      const previousHeading = sections[sections.length - 1]
      if (previousHeading) {
        previousHeading.content = markdown.slice(lastIndex, match.index).trim()
      }
    }
    
    // Start new section
    sections.push({
      level: match[1].length,
      heading: match[2].trim(),
      content: ''
    })
    
    lastIndex = match.index
  }
  
  // Handle last section
  if (sections.length > 0) {
    sections[sections.length - 1].content = markdown.slice(lastIndex).trim()
  } else {
    // No headings found - treat as single chunk
    sections.push({
      level: 0,
      heading: 'Document Content',
      content: markdown
    })
  }
  
  // Convert sections to chunks
  for (const section of sections) {
    const fullContent = section.level > 0 
      ? `${'#'.repeat(section.level)} ${section.heading}\n\n${section.content}`
      : section.content
    
    // Skip empty sections
    if (fullContent.trim().length < 50) continue
    
    // Split long sections (>2000 chars)
    if (fullContent.length > 2000) {
      const subChunks = splitLongSection(fullContent, section.heading)
      chunks.push(...subChunks)
    } else {
      chunks.push({
        content: fullContent,
        themes: [section.heading],
        importance_score: section.level === 1 ? 0.8 : 0.5,  // Top-level headings more important
        summary: section.heading
      })
    }
  }
  
  return chunks
}

/**
 * Splits a long markdown section into smaller chunks by paragraphs.
 * 
 * @param content - Section content to split
 * @param heading - Section heading for theme
 * @returns Array of sub-chunks
 */
function splitLongSection(
  content: string,
  heading: string
): Array<{
  content: string
  themes: string[]
  importance_score: number
  summary: string
}> {
  const chunks: Array<{
    content: string
    themes: string[]
    importance_score: number
    summary: string
  }> = []
  
  const paragraphs = content.split(/\n\n+/)
  let currentChunk = ''
  
  for (const paragraph of paragraphs) {
    if (currentChunk.length + paragraph.length > 2000) {
      // Save current chunk
      if (currentChunk.trim().length > 200) {
        chunks.push({
          content: currentChunk.trim(),
          themes: [heading],
          importance_score: 0.5,
          summary: `${heading} (part ${chunks.length + 1})`
        })
      }
      currentChunk = paragraph
    } else {
      currentChunk += '\n\n' + paragraph
    }
  }
  
  // Save final chunk
  if (currentChunk.trim().length > 200) {
    chunks.push({
      content: currentChunk.trim(),
      themes: [heading],
      importance_score: 0.5,
      summary: `${heading} (part ${chunks.length + 1})`
    })
  }
  
  return chunks
}

/**
 * Extracts timestamp information with surrounding context from chunk content.
 * 
 * Finds timestamps in formats:
 * - [MM:SS] or [HH:MM:SS]
 * - [MM:SS](url) markdown links
 * 
 * Extracts 3-5 words before and after each timestamp for fuzzy matching.
 * 
 * @param content - Chunk content with embedded timestamps
 * @returns Array of timestamp objects with context
 * 
 * @example
 * const timestamps = extractTimestampsWithContext('[02:05] talking about React hooks')
 * // Returns: [{ time: 125, context_before: '', context_after: 'talking about React' }]
 */
export function extractTimestampsWithContext(content: string): TimestampContext[] {
  const timestamps: TimestampContext[] = []
  
  // Regex to match timestamps: [MM:SS] or [HH:MM:SS]
  const timestampRegex = /\[(\d{1,2}):(\d{2})(?::(\d{2}))?\]/g
  
  let match: RegExpExecArray | null
  
  while ((match = timestampRegex.exec(content)) !== null) {
    // Parse time components
    const hours = match[3] ? parseInt(match[1]) : 0
    const minutes = match[3] ? parseInt(match[2]) : parseInt(match[1])
    const seconds = match[3] ? parseInt(match[3]) : parseInt(match[2])
    
    // Convert to total seconds
    const time = hours * 3600 + minutes * 60 + seconds
    
    // Extract surrounding context (3-5 words)
    const beforeIndex = Math.max(0, match.index - 100)  // Look back ~100 chars
    const afterIndex = Math.min(content.length, match.index + match[0].length + 100)  // Look forward ~100 chars
    
    const beforeText = content.slice(beforeIndex, match.index)
    const afterText = content.slice(match.index + match[0].length, afterIndex)
    
    // Extract last 3-5 words before
    const beforeWords = beforeText.trim().split(/\s+/).slice(-5).join(' ')
    
    // Extract first 3-5 words after
    const afterWords = afterText.trim().split(/\s+/).slice(0, 5).join(' ')
    
    timestamps.push({
      time,
      context_before: beforeWords,
      context_after: afterWords
    })
  }
  
  return timestamps
}
```

**Validation**:
```bash
# Run tests
npm test worker/lib/__tests__/markdown-chunking.test.ts

# Manual test
node -e "
const { simpleMarkdownChunking, extractTimestampsWithContext } = require('./worker/lib/markdown-chunking');

const markdown = '# Introduction\n\n[00:30] Welcome to the video\n\n[02:15] Let me explain...';
const chunks = simpleMarkdownChunking(markdown);
console.log('Chunks:', chunks.length);

const timestamps = extractTimestampsWithContext(markdown);
console.log('Timestamps:', timestamps);
"

# Expected: Chunks created, timestamps extracted with context
```

---

### Phase 3: Worker Handler Refactoring (Week 1, Day 5 - Week 2, Day 1)

---

#### Task 3.1: Refactor process-document.ts Routing Logic

**Objective**: Update worker handler to route processing by source_type instead of just file content type.

```
UPDATE file: worker/handlers/process-document.ts

Locate the routing logic at lines 62-207 and refactor:

BEFORE (Line 62-65):
```typescript
const contentType = fileResponse.headers.get('content-type') || 'application/pdf'
const isTextFile = contentType.includes('text') || contentType.includes('markdown')
const isPDF = contentType.includes('pdf')
```

AFTER (Replace lines 62-207 with new routing):
```typescript
import { extractVideoId, fetchTranscriptWithRetry, formatTranscriptToMarkdown } from '../lib/youtube'
import { extractArticle, isValidUrl } from '../lib/web-extraction'
import { simpleMarkdownChunking, extractTimestampsWithContext } from '../lib/markdown-chunking'

// Get source metadata from job input
const sourceType = job.input_data.source_type as SourceType || 'pdf'
const sourceUrl = job.input_data.source_url as string | undefined
const processingRequested = job.input_data.processing_requested as boolean ?? true

let markdown: string
let chunks: Array<{
  content: string
  themes: string[]
  importance_score: number
  summary: string
}>

// Route by source type
switch (sourceType) {
  case 'youtube':
    await updateProgress(supabase, job.id, 10, 'download', 'fetching', 'Fetching YouTube transcript')
    
    const videoId = extractVideoId(sourceUrl!)
    if (!videoId) {
      throw new Error('Invalid YouTube URL')
    }
    
    const transcript = await fetchTranscriptWithRetry(videoId)
    markdown = formatTranscriptToMarkdown(transcript, sourceUrl!)
    
    await updateProgress(supabase, job.id, 30, 'extract', 'chunking', 'Creating semantic chunks')
    chunks = await rechunkMarkdown(ai, markdown)
    
    // Extract timestamps from chunks
    for (const chunk of chunks) {
      const timestamps = extractTimestampsWithContext(chunk.content)
      if (timestamps.length > 0) {
        // Store timestamps in chunk metadata (will be added to DB later)
        ;(chunk as any).timestamps = timestamps
        ;(chunk as any).source_timestamp = timestamps[0].time
      }
    }
    
    break
  
  case 'web_url':
    await updateProgress(supabase, job.id, 10, 'download', 'fetching', 'Fetching web article')
    
    if (!isValidUrl(sourceUrl!)) {
      throw new Error('Invalid web URL')
    }
    
    const article = await extractArticle(sourceUrl!)
    
    await updateProgress(supabase, job.id, 25, 'extract', 'cleaning', 'Cleaning article content')
    
    // Convert article to markdown with Gemini
    const articleResult = await ai.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: [{
        parts: [{
          text: `Convert this web article to clean, well-formatted markdown. Preserve structure but remove ads, navigation, and boilerplate.

Title: ${article.title}
Author: ${article.byline || 'Unknown'}

Content:
${article.textContent}`
        }]
      }]
    })
    
    markdown = articleResult.text
    
    await updateProgress(supabase, job.id, 40, 'extract', 'chunking', 'Creating semantic chunks')
    chunks = await rechunkMarkdown(ai, markdown)
    
    break
  
  case 'markdown_asis':
    await updateProgress(supabase, job.id, 10, 'download', 'reading', 'Reading markdown file')
    
    // Download file from storage
    const { data: markdownBlob, error: markdownError } = await supabase.storage
      .from('documents')
      .download(job.input_data.storage_path + '/source.md')
    
    if (markdownError) throw markdownError
    
    markdown = await markdownBlob.text()
    
    await updateProgress(supabase, job.id, 30, 'extract', 'chunking', 'Chunking by headings')
    
    // No AI processing - chunk by headings
    chunks = simpleMarkdownChunking(markdown)
    
    break
  
  case 'markdown_clean':
    await updateProgress(supabase, job.id, 10, 'download', 'reading', 'Reading markdown file')
    
    // Download file from storage
    const { data: mdBlob, error: mdError } = await supabase.storage
      .from('documents')
      .download(job.input_data.storage_path + '/source.md')
    
    if (mdError) throw mdError
    
    const rawMarkdown = await mdBlob.text()
    
    await updateProgress(supabase, job.id, 25, 'extract', 'cleaning', 'Cleaning markdown with AI')
    
    // Clean markdown with Gemini
    const cleanResult = await ai.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: [{
        parts: [{
          text: `Clean and improve this markdown formatting. Fix any issues with headings, lists, emphasis, etc. Preserve all content but enhance readability.

${rawMarkdown}`
        }]
      }]
    })
    
    markdown = cleanResult.text
    
    await updateProgress(supabase, job.id, 40, 'extract', 'chunking', 'Creating semantic chunks')
    chunks = await rechunkMarkdown(ai, markdown)
    
    break
  
  case 'txt':
    await updateProgress(supabase, job.id, 10, 'download', 'reading', 'Reading text file')
    
    // Download file from storage
    const { data: txtBlob, error: txtError } = await supabase.storage
      .from('documents')
      .download(job.input_data.storage_path + '/source.txt')
    
    if (txtError) throw txtError
    
    const textContent = await txtBlob.text()
    
    await updateProgress(supabase, job.id, 25, 'extract', 'formatting', 'Converting to markdown')
    
    // Convert text to markdown with Gemini
    const txtResult = await ai.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: [{
        parts: [{
          text: `Convert this plain text to well-formatted markdown. Add appropriate headings, lists, emphasis, and structure.

${textContent}`
        }]
      }]
    })
    
    markdown = txtResult.text
    
    await updateProgress(supabase, job.id, 40, 'extract', 'chunking', 'Creating semantic chunks')
    chunks = await rechunkMarkdown(ai, markdown)
    
    break
  
  case 'paste':
    await updateProgress(supabase, job.id, 10, 'extract', 'processing', 'Processing pasted content')
    
    // Pasted content comes from job input directly
    const pastedContent = job.input_data.pasted_content as string
    
    // Check if it has timestamps (might be YouTube transcript)
    const hasTimestamps = /\[\d{1,2}:\d{2}(?::\d{2})?\]/.test(pastedContent)
    
    if (hasTimestamps && sourceUrl) {
      // Treat as YouTube transcript
      markdown = pastedContent
      
      await updateProgress(supabase, job.id, 30, 'extract', 'chunking', 'Creating semantic chunks')
      chunks = await rechunkMarkdown(ai, markdown)
      
      // Extract timestamps
      for (const chunk of chunks) {
        const timestamps = extractTimestampsWithContext(chunk.content)
        if (timestamps.length > 0) {
          ;(chunk as any).timestamps = timestamps
          ;(chunk as any).source_timestamp = timestamps[0].time
        }
      }
    } else {
      // Generic text processing
      await updateProgress(supabase, job.id, 25, 'extract', 'formatting', 'Converting to markdown')
      
      const pasteResult = await ai.models.generateContent({
        model: 'gemini-2.0-flash',
        contents: [{
          parts: [{
            text: `Convert this text to clean, well-formatted markdown. Add structure and formatting as appropriate.

${pastedContent}`
          }]
        }]
      })
      
      markdown = pasteResult.text
      
      await updateProgress(supabase, job.id, 40, 'extract', 'chunking', 'Creating semantic chunks')
      chunks = await rechunkMarkdown(ai, markdown)
    }
    
    break
  
  case 'pdf':
  default:
    // Existing PDF processing logic (lines 80-201)
    // Keep this code unchanged
    // ... (existing PDF processing code)
    break
}

// Continue with existing save markdown + embedding logic (after line 207)
```

**Validation**:
```bash
# Type check
npx tsc --noEmit

# Run worker tests
npm test worker/__tests__/multi-format.test.ts

# Expected: No TypeScript errors, routing logic works for all types
```

---

### Phase 4: Upload UI & Server Actions (Week 2, Days 2-3)

---

#### Task 4.1: Update uploadDocument Server Action

**Objective**: Accept new FormData fields for source type, URL, and processing preferences.

```
UPDATE file: src/app/actions/documents.ts

Locate the uploadDocument function (lines 43-113) and modify:

ADD after line 50 (extracting file):
```typescript
// Extract source metadata
const sourceType = formData.get('source_type') as string || 'pdf'
const sourceUrl = formData.get('source_url') as string | null
const processingRequested = formData.get('processing_requested') === 'true'
const pastedContent = formData.get('pasted_content') as string | null

// Validate source type
const validSourceTypes = ['pdf', 'markdown_asis', 'markdown_clean', 'txt', 'youtube', 'web_url', 'paste']
if (!validSourceTypes.includes(sourceType)) {
  return { success: false, error: 'Invalid source type' }
}

// For URL-based sources, validate URL
if ((sourceType === 'youtube' || sourceType === 'web_url') && !sourceUrl) {
  return { success: false, error: 'Source URL required for this type' }
}

// For paste type, validate content
if (sourceType === 'paste' && !pastedContent) {
  return { success: false, error: 'Content required for paste type' }
}
```

UPDATE the document creation (around line 72-85):
```typescript
const { data: document, error: docError } = await supabase
  .from('documents')
  .insert({
    user_id: userId,
    title: title || sourceUrl || 'Untitled Document',
    storage_path: storagePath,
    source_type: sourceType,
    source_url: sourceUrl,  // NEW
    processing_requested: processingRequested,  // NEW
    processing_status: 'pending'
  })
  .select()
  .single()
```

UPDATE the background job creation (around line 88-107):
```typescript
const { data: job, error: jobError } = await supabase
  .from('background_jobs')
  .insert({
    id: jobId,
    user_id: userId,
    job_type: 'process_document',
    entity_type: 'document',
    entity_id: documentId,
    status: 'pending',
    progress: { percent: 0 },
    input_data: {
      document_id: documentId,
      storage_path: storagePath,
      source_type: sourceType,  // NEW
      source_url: sourceUrl,  // NEW
      processing_requested: processingRequested,  // NEW
      pasted_content: pastedContent  // NEW (for paste type)
    }
  })
  .select()
  .single()
```

**Validation**:
```bash
# Type check
npm run build

# Test with curl
curl -X POST http://localhost:3000/api/upload \
  -F "source_type=youtube" \
  -F "source_url=https://youtube.com/watch?v=abc123"

# Expected: Document created with source_url and source_type
```

---

#### Task 4.2: Update UploadZone Component with Multi-Method UI

**Objective**: Add tabbed interface with file upload, URL input, and paste textarea.

```
UPDATE file: src/components/library/UploadZone.tsx

Replace the entire component (lines 1-191) with new implementation:

```typescript
'use client'

import { useState, useCallback } from 'react'
import { uploadDocument } from '@/app/actions/documents'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Upload, Link as LinkIcon, FileText } from 'lucide-react'

export function UploadZone() {
  const [activeTab, setActiveTab] = useState<'file' | 'url' | 'paste'>('file')
  const [isUploading, setIsUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  // File upload state
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [markdownProcessing, setMarkdownProcessing] = useState<'asis' | 'clean'>('asis')
  
  // URL input state
  const [urlInput, setUrlInput] = useState('')
  const [urlType, setUrlType] = useState<'youtube' | 'web' | null>(null)
  
  // Paste state
  const [pastedContent, setPastedContent] = useState('')
  const [pasteSourceUrl, setPasteSourceUrl] = useState('')
  
  // Detect URL type from input
  const detectUrlType = useCallback((url: string) => {
    if (!url) {
      setUrlType(null)
      return
    }
    
    const youtubeRegex = /(?:youtube(?:-nocookie)?\.com|youtu\.be)/
    if (youtubeRegex.test(url)) {
      setUrlType('youtube')
    } else {
      setUrlType('web')
    }
  }, [])
  
  // Handle file selection
  const handleFileSelect = useCallback(async (file: File) => {
    setSelectedFile(file)
    setError(null)
    
    // Auto-detect if markdown
    if (file.name.endsWith('.md')) {
      // Show markdown processing options
      // (radio buttons will appear in UI)
    }
  }, [])
  
  // Handle file upload
  const handleFileUpload = useCallback(async () => {
    if (!selectedFile) return
    
    setIsUploading(true)
    setError(null)
    
    try {
      const formData = new FormData()
      formData.append('file', selectedFile)
      
      // Determine source type
      let sourceType = 'pdf'
      if (selectedFile.name.endsWith('.md')) {
        sourceType = markdownProcessing === 'asis' ? 'markdown_asis' : 'markdown_clean'
        formData.append('processing_requested', markdownProcessing === 'clean' ? 'true' : 'false')
      } else if (selectedFile.name.endsWith('.txt')) {
        sourceType = 'txt'
      }
      
      formData.append('source_type', sourceType)
      
      const result = await uploadDocument(formData)
      
      if (result.success) {
        // Reset form
        setSelectedFile(null)
        setMarkdownProcessing('asis')
      } else {
        setError(result.error || 'Upload failed')
      }
    } catch (err: any) {
      setError(err.message)
    } finally {
      setIsUploading(false)
    }
  }, [selectedFile, markdownProcessing])
  
  // Handle URL fetch
  const handleUrlFetch = useCallback(async () => {
    if (!urlInput || !urlType) return
    
    setIsUploading(true)
    setError(null)
    
    try {
      const formData = new FormData()
      formData.append('source_type', urlType)
      formData.append('source_url', urlInput)
      
      const result = await uploadDocument(formData)
      
      if (result.success) {
        // Reset form
        setUrlInput('')
        setUrlType(null)
      } else {
        setError(result.error || 'Fetch failed')
      }
    } catch (err: any) {
      setError(err.message)
    } finally {
      setIsUploading(false)
    }
  }, [urlInput, urlType])
  
  // Handle paste submit
  const handlePasteSubmit = useCallback(async () => {
    if (!pastedContent.trim()) return
    
    setIsUploading(true)
    setError(null)
    
    try {
      const formData = new FormData()
      formData.append('source_type', 'paste')
      formData.append('pasted_content', pastedContent)
      
      if (pasteSourceUrl) {
        formData.append('source_url', pasteSourceUrl)
      }
      
      const result = await uploadDocument(formData)
      
      if (result.success) {
        // Reset form
        setPastedContent('')
        setPasteSourceUrl('')
      } else {
        setError(result.error || 'Processing failed')
      }
    } catch (err: any) {
      setError(err.message)
    } finally {
      setIsUploading(false)
    }
  }, [pastedContent, pasteSourceUrl])
  
  return (
    <div className="max-w-2xl mx-auto p-6">
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="file">
            <Upload className="w-4 h-4 mr-2" />
            Upload File
          </TabsTrigger>
          <TabsTrigger value="url">
            <LinkIcon className="w-4 h-4 mr-2" />
            Fetch from URL
          </TabsTrigger>
          <TabsTrigger value="paste">
            <FileText className="w-4 h-4 mr-2" />
            Paste Content
          </TabsTrigger>
        </TabsList>
        
        {/* File Upload Tab */}
        <TabsContent value="file" className="space-y-4">
          <div className="border-2 border-dashed rounded-lg p-8 text-center">
            <input
              type="file"
              accept=".pdf,.txt,.md"
              onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])}
              className="hidden"
              id="file-upload"
            />
            <label htmlFor="file-upload" className="cursor-pointer">
              <Upload className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                Click to browse or drag and drop
              </p>
              <p className="text-xs text-muted-foreground mt-2">
                Supports: PDF, Markdown (.md), Text (.txt)
              </p>
            </label>
          </div>
          
          {selectedFile && (
            <div className="space-y-4">
              <div className="p-4 border rounded-lg">
                <p className="font-medium">{selectedFile.name}</p>
                <p className="text-sm text-muted-foreground">
                  {(selectedFile.size / 1024).toFixed(2)} KB
                </p>
              </div>
              
              {selectedFile.name.endsWith('.md') && (
                <div className="space-y-2">
                  <Label>Markdown Processing</Label>
                  <RadioGroup value={markdownProcessing} onValueChange={(v) => setMarkdownProcessing(v as any)}>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="asis" id="asis" />
                      <Label htmlFor="asis" className="cursor-pointer">
                        Save as-is (chunk by headings, no AI)
                      </Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="clean" id="clean" />
                      <Label htmlFor="clean" className="cursor-pointer">
                        Clean with AI (improve formatting, semantic chunking)
                      </Label>
                    </div>
                  </RadioGroup>
                </div>
              )}
              
              <Button onClick={handleFileUpload} disabled={isUploading} className="w-full">
                {isUploading ? 'Uploading...' : 'Upload Document'}
              </Button>
            </div>
          )}
        </TabsContent>
        
        {/* URL Fetch Tab */}
        <TabsContent value="url" className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="url-input">Enter URL</Label>
            <Input
              id="url-input"
              type="url"
              placeholder="https://youtube.com/watch?v=... or https://example.com/article"
              value={urlInput}
              onChange={(e) => {
                setUrlInput(e.target.value)
                detectUrlType(e.target.value)
              }}
            />
            {urlType && (
              <p className="text-sm text-muted-foreground">
                Detected: {urlType === 'youtube' ? 'YouTube Video' : 'Web Article'}
              </p>
            )}
          </div>
          
          <Button onClick={handleUrlFetch} disabled={!urlInput || isUploading} className="w-full">
            {isUploading ? 'Fetching...' : 'Fetch Content'}
          </Button>
          
          <div className="text-xs text-muted-foreground space-y-1">
            <p>• YouTube: Automatically fetches transcript with timestamps</p>
            <p>• Web Articles: Extracts main content, removes ads/navigation</p>
            <p>• On error: You'll be able to paste content manually</p>
          </div>
        </TabsContent>
        
        {/* Paste Content Tab */}
        <TabsContent value="paste" className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="paste-content">Paste your content</Label>
            <Textarea
              id="paste-content"
              placeholder="Paste article text, YouTube transcript, notes, etc..."
              value={pastedContent}
              onChange={(e) => setPastedContent(e.target.value)}
              className="min-h-[200px]"
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="paste-source-url">Source URL (optional)</Label>
            <Input
              id="paste-source-url"
              type="url"
              placeholder="https://youtube.com/watch?v=... (for timestamp links)"
              value={pasteSourceUrl}
              onChange={(e) => setPasteSourceUrl(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Provide YouTube URL to enable clickable timestamp links
            </p>
          </div>
          
          <Button onClick={handlePasteSubmit} disabled={!pastedContent.trim() || isUploading} className="w-full">
            {isUploading ? 'Processing...' : 'Process Content'}
          </Button>
        </TabsContent>
      </Tabs>
      
      {error && (
        <div className="mt-4 p-4 border border-red-500 rounded-lg bg-red-50 text-red-900">
          <p className="text-sm font-medium">Error</p>
          <p className="text-sm">{error}</p>
        </div>
      )}
    </div>
  )
}
```

**Validation**:
```bash
# Run Next.js dev server
npm run dev

# Navigate to upload page
# Test each tab (File, URL, Paste)
# Verify UI renders correctly

# Expected: Three tabs, appropriate inputs, validation works
```

---

### Phase 5: Error Handling & Polish (Week 2, Days 3-4)

---

#### Task 5.1: Update ProcessingDock with Format-Specific Errors

**Objective**: Display helpful error messages with recovery actions (archive.ph, paste fallback).

```
UPDATE file: src/components/layout/ProcessingDock.tsx

Locate the error display section and add structured error handling:

ADD after the STAGE_LABELS definition (around line 57):
```typescript
/**
 * Parses structured error messages from worker and returns recovery actions.
 */
function parseErrorMessage(error: string): {
  type: 'youtube' | 'web' | 'general'
  message: string
  actions: Array<{ label: string; action: () => void }>
} {
  // YouTube errors
  if (error.includes('YOUTUBE_TRANSCRIPT_DISABLED')) {
    return {
      type: 'youtube',
      message: 'This video has transcripts disabled.',
      actions: [
        {
          label: 'Get Transcript Manually',
          action: () => window.open('https://www.youtube-transcript.io/', '_blank')
        },
        {
          label: 'Paste Transcript',
          action: () => {
            // Navigate to paste tab (implementation depends on routing)
            window.location.href = '/upload?tab=paste'
          }
        }
      ]
    }
  }
  
  if (error.includes('YOUTUBE_RATE_LIMIT')) {
    return {
      type: 'youtube',
      message: 'YouTube rate limit reached. Please wait a few minutes and try again.',
      actions: []
    }
  }
  
  // Web article errors
  if (error.includes('WEB_PAYWALL')) {
    return {
      type: 'web',
      message: 'This article may be behind a paywall.',
      actions: [
        {
          label: 'Try Archive.ph',
          action: () => window.open('https://archive.ph/', '_blank')
        },
        {
          label: 'Paste Article Content',
          action: () => {
            window.location.href = '/upload?tab=paste'
          }
        }
      ]
    }
  }
  
  if (error.includes('WEB_NOT_ARTICLE')) {
    return {
      type: 'web',
      message: 'This page does not appear to be an article.',
      actions: [
        {
          label: 'Paste Content Directly',
          action: () => {
            window.location.href = '/upload?tab=paste'
          }
        }
      ]
    }
  }
  
  // Generic error
  return {
    type: 'general',
    message: error,
    actions: []
  }
}
```

UPDATE the job error display (find where job.error is rendered):
```typescript
{job.status === 'failed' && job.error && (
  <div className="p-4 border border-red-500 rounded-lg bg-red-50">
    <div className="flex items-start gap-3">
      <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
      <div className="flex-1 space-y-3">
        <div>
          <p className="text-sm font-medium text-red-900">Processing Failed</p>
          <p className="text-sm text-red-800 mt-1">
            {parseErrorMessage(job.error).message}
          </p>
        </div>
        
        {parseErrorMessage(job.error).actions.length > 0 && (
          <div className="flex gap-2">
            {parseErrorMessage(job.error).actions.map((action, i) => (
              <Button
                key={i}
                size="sm"
                variant="outline"
                onClick={action.action}
                className="text-xs"
              >
                {action.label}
              </Button>
            ))}
          </div>
        )}
      </div>
    </div>
  </div>
)}
```

**Validation**:
```bash
# Test error scenarios
# 1. Submit invalid YouTube URL
# 2. Submit paywalled article URL
# 3. Verify error messages and action buttons appear

# Expected: Clear error messages with helpful recovery actions
```

---

### Phase 6: Testing & Validation (Week 2, Day 5)

---

#### Task 6.1: Create Unit Tests for Utilities

**Objective**: Test helper functions with mocked external dependencies.

```
CREATE file: worker/__tests__/youtube.test.ts

```typescript
import { extractVideoId, fetchTranscriptWithRetry, formatTranscriptToMarkdown } from '../lib/youtube'
import { fetchTranscript } from 'youtube-transcript-plus'

jest.mock('youtube-transcript-plus')
const mockedFetchTranscript = fetchTranscript as jest.MockedFunction<typeof fetchTranscript>

describe('YouTube Utilities', () => {
  describe('extractVideoId', () => {
    it('extracts ID from standard watch URL', () => {
      const id = extractVideoId('https://youtube.com/watch?v=dQw4w9WgXcQ')
      expect(id).toBe('dQw4w9WgXcQ')
    })
    
    it('extracts ID from shortened youtu.be URL', () => {
      const id = extractVideoId('https://youtu.be/dQw4w9WgXcQ')
      expect(id).toBe('dQw4w9WgXcQ')
    })
    
    it('extracts ID from shorts URL', () => {
      const id = extractVideoId('https://youtube.com/shorts/dQw4w9WgXcQ')
      expect(id).toBe('dQw4w9WgXcQ')
    })
    
    it('returns null for invalid URL', () => {
      const id = extractVideoId('https://example.com')
      expect(id).toBeNull()
    })
  })
  
  describe('fetchTranscriptWithRetry', () => {
    beforeEach(() => {
      mockedFetchTranscript.mockReset()
    })
    
    it('fetches transcript successfully', async () => {
      const mockTranscript = [
        { text: 'Hello', offset: 0, duration: 1.5, lang: 'en' }
      ]
      mockedFetchTranscript.mockResolvedValue(mockTranscript)
      
      const result = await fetchTranscriptWithRetry('dQw4w9WgXcQ')
      
      expect(result).toEqual(mockTranscript)
      expect(mockedFetchTranscript).toHaveBeenCalledTimes(1)
    })
    
    it('retries on rate limit error', async () => {
      const rateLimitError: any = new Error('Rate limit')
      rateLimitError.name = 'YoutubeTranscriptTooManyRequestError'
      
      mockedFetchTranscript
        .mockRejectedValueOnce(rateLimitError)
        .mockResolvedValueOnce([{ text: 'Hello', offset: 0, duration: 1, lang: 'en' }])
      
      const result = await fetchTranscriptWithRetry('dQw4w9WgXcQ', 2)
      
      expect(mockedFetchTranscript).toHaveBeenCalledTimes(2)
      expect(result).toHaveLength(1)
    })
    
    it('throws on permanent error (disabled transcript)', async () => {
      const disabledError: any = new Error('Disabled')
      disabledError.name = 'YoutubeTranscriptDisabledError'
      
      mockedFetchTranscript.mockRejectedValue(disabledError)
      
      await expect(fetchTranscriptWithRetry('dQw4w9WgXcQ')).rejects.toThrow('YOUTUBE_TRANSCRIPT_DISABLED')
    })
  })
  
  describe('formatTranscriptToMarkdown', () => {
    it('formats transcript with timestamps', () => {
      const transcript = [
        { text: 'First line', offset: 0, duration: 2, lang: 'en' },
        { text: 'Second line', offset: 125, duration: 3, lang: 'en' }
      ]
      
      const markdown = formatTranscriptToMarkdown(transcript, 'https://youtube.com/watch?v=abc123')
      
      expect(markdown).toContain('[00:00]')
      expect(markdown).toContain('[02:05]')
      expect(markdown).toContain('First line')
      expect(markdown).toContain('Second line')
      expect(markdown).toContain('&t=0s')
      expect(markdown).toContain('&t=125s')
    })
  })
})
```

CREATE file: worker/__tests__/web-extraction.test.ts

```typescript
import { isValidUrl, extractArticle } from '../lib/web-extraction'
import axios from 'axios'
import { JSDOM } from 'jsdom'

jest.mock('axios')
jest.mock('jsdom')

const mockedAxios = axios as jest.Mocked<typeof axios>

describe('Web Extraction Utilities', () => {
  describe('isValidUrl', () => {
    it('validates HTTP URLs', () => {
      expect(isValidUrl('http://example.com')).toBe(true)
    })
    
    it('validates HTTPS URLs', () => {
      expect(isValidUrl('https://example.com')).toBe(true)
    })
    
    it('rejects non-HTTP protocols', () => {
      expect(isValidUrl('ftp://example.com')).toBe(false)
    })
    
    it('rejects malformed URLs', () => {
      expect(isValidUrl('not a url')).toBe(false)
    })
  })
  
  describe('extractArticle', () => {
    it('throws on invalid URL', async () => {
      await expect(extractArticle('not-a-url')).rejects.toThrow('WEB_INVALID_URL')
    })
    
    it('throws on 404 response', async () => {
      mockedAxios.get.mockResolvedValue({ status: 404, data: '' })
      
      await expect(extractArticle('https://example.com')).rejects.toThrow('WEB_NOT_FOUND')
    })
    
    it('throws on paywall (403)', async () => {
      mockedAxios.get.mockResolvedValue({ status: 403, data: '' })
      
      await expect(extractArticle('https://example.com')).rejects.toThrow('WEB_PAYWALL')
    })
    
    it('throws on timeout', async () => {
      const timeoutError: any = new Error('Timeout')
      timeoutError.code = 'ECONNABORTED'
      mockedAxios.get.mockRejectedValue(timeoutError)
      
      await expect(extractArticle('https://example.com')).rejects.toThrow('WEB_TIMEOUT')
    })
  })
})
```

CREATE file: worker/__tests__/markdown-chunking.test.ts

```typescript
import { simpleMarkdownChunking, extractTimestampsWithContext } from '../lib/markdown-chunking'

describe('Markdown Chunking Utilities', () => {
  describe('simpleMarkdownChunking', () => {
    it('chunks by top-level headings', () => {
      const markdown = `# Introduction

Some intro content here.

# Main Section

More content in this section.

# Conclusion

Final thoughts.`
      
      const chunks = simpleMarkdownChunking(markdown)
      
      expect(chunks).toHaveLength(3)
      expect(chunks[0].themes).toContain('Introduction')
      expect(chunks[1].themes).toContain('Main Section')
      expect(chunks[2].themes).toContain('Conclusion')
    })
    
    it('handles nested headings', () => {
      const markdown = `# Main

## Subsection 1

Content 1

## Subsection 2

Content 2`
      
      const chunks = simpleMarkdownChunking(markdown)
      
      expect(chunks.length).toBeGreaterThan(0)
      expect(chunks.some(c => c.content.includes('## Subsection 1'))).toBe(true)
    })
    
    it('handles markdown without headings', () => {
      const markdown = `Just some plain text without any headings.
Multiple paragraphs here.`
      
      const chunks = simpleMarkdownChunking(markdown)
      
      expect(chunks).toHaveLength(1)
      expect(chunks[0].themes).toContain('Document Content')
    })
  })
  
  describe('extractTimestampsWithContext', () => {
    it('extracts MM:SS timestamps', () => {
      const content = 'Introduction here [02:30] talking about React hooks and useState'
      
      const timestamps = extractTimestampsWithContext(content)
      
      expect(timestamps).toHaveLength(1)
      expect(timestamps[0].time).toBe(150)  // 2:30 = 150 seconds
      expect(timestamps[0].context_after).toContain('talking about React')
    })
    
    it('extracts HH:MM:SS timestamps', () => {
      const content = 'Later in video [01:02:30] we discuss advanced patterns'
      
      const timestamps = extractTimestampsWithContext(content)
      
      expect(timestamps).toHaveLength(1)
      expect(timestamps[0].time).toBe(3750)  // 1:02:30 = 3750 seconds
    })
    
    it('extracts multiple timestamps', () => {
      const content = '[00:00] Intro [02:15] Main content [05:30] Conclusion'
      
      const timestamps = extractTimestampsWithContext(content)
      
      expect(timestamps).toHaveLength(3)
      expect(timestamps[0].time).toBe(0)
      expect(timestamps[1].time).toBe(135)
      expect(timestamps[2].time).toBe(330)
    })
    
    it('captures context before and after', () => {
      const content = 'We were talking about state management [03:45] and then we moved to hooks'
      
      const timestamps = extractTimestampsWithContext(content)
      
      expect(timestamps[0].context_before).toContain('state management')
      expect(timestamps[0].context_after).toContain('moved to hooks')
    })
  })
})
```

**Validation**:
```bash
# Run all tests
npm test

# Expected: All tests pass, 100% coverage on utilities
```

---

#### Task 6.2: Manual Testing Plan

**Objective**: Validate all 6 upload methods with real content.

```
MANUAL TESTING CHECKLIST:

## File Uploads

### PDF (Existing)
- [ ] Upload 5-page academic paper PDF
- [ ] Verify markdown extraction
- [ ] Verify semantic chunking
- [ ] Verify embeddings generated
- [ ] Expected: Same quality as before

### Markdown Save-As-Is
- [ ] Upload markdown file with headings
- [ ] Select "Save as-is" option
- [ ] Verify NO Gemini API call
- [ ] Verify chunks created by headings
- [ ] Verify content unchanged
- [ ] Expected: Fast processing (<10s)

### Markdown Clean with AI
- [ ] Upload markdown file with formatting issues
- [ ] Select "Clean with AI" option
- [ ] Verify Gemini cleanup
- [ ] Verify semantic chunking
- [ ] Expected: Improved formatting

### Text File
- [ ] Upload plain .txt file (no formatting)
- [ ] Verify Gemini converts to markdown
- [ ] Verify semantic chunking
- [ ] Expected: Well-formatted markdown output

## URL Fetching

### YouTube
- [ ] Submit public YouTube video URL
- [ ] Verify transcript fetch
- [ ] Verify timestamps in markdown
- [ ] Verify clickable timestamp links
- [ ] Verify chunks have timestamp JSONB
- [ ] Test with private video (expect error)
- [ ] Test with video without transcript (expect error)
- [ ] Expected: Transcript with working timestamp links

### Web Article
- [ ] Submit article URL (try Medium, ArXiv)
- [ ] Verify article extraction
- [ ] Verify clean content (no ads/nav)
- [ ] Verify Gemini cleanup
- [ ] Test with paywall site (expect error + archive.ph suggestion)
- [ ] Test with non-article page (expect error)
- [ ] Expected: Clean article content

## Paste Content

### Generic Text
- [ ] Paste article text (no URL)
- [ ] Verify Gemini formatting
- [ ] Verify semantic chunking
- [ ] Expected: Well-formatted markdown

### YouTube Transcript with URL
- [ ] Paste YouTube transcript manually
- [ ] Add YouTube URL in source field
- [ ] Verify timestamp detection
- [ ] Verify clickable timestamp links
- [ ] Expected: Timestamps become clickable

### YouTube Transcript without URL
- [ ] Paste YouTube transcript
- [ ] Leave source URL empty
- [ ] Verify timestamps detected but not linked
- [ ] Expected: Timestamps present but not clickable

## Error Handling

### YouTube Errors
- [ ] Submit rate-limited video
- [ ] Verify exponential backoff retry
- [ ] Verify helpful error message
- [ ] Verify "Get Transcript Manually" button

### Web Errors
- [ ] Submit 404 URL
- [ ] Verify permanent error (no retry)
- [ ] Submit paywall article
- [ ] Verify "Try Archive.ph" button appears

## Performance

- [ ] Verify all formats process in <2 minutes
- [ ] Monitor Gemini API costs (<$0.05 per document)
- [ ] Check ProcessingDock updates in real-time
- [ ] Verify checkpoint recovery works

## Database Validation

- [ ] Query documents table, verify source_type set correctly
- [ ] Query documents table, verify source_url populated for YouTube/web
- [ ] Query chunks table, verify timestamps JSONB for YouTube
- [ ] Verify indexes created (source_url, timestamps)
```

**Validation**:
```bash
# Run manual tests following checklist above
# Document any failures or unexpected behavior
# Create bug reports for issues found

# Expected: >95% success rate across all formats
```

---

## Risk Assessment & Mitigations

### High-Priority Risks

**Risk 1: YouTube Unofficial API Breakage**
- **Probability**: Medium (YouTube can change internal API anytime)
- **Impact**: High (blocks YouTube transcript fetching)
- **Mitigation**:
  - Manual paste fallback prominently displayed in error message
  - Link to https://www.youtube-transcript.io/ for alternative transcript source
  - Monitor youtube-transcript-plus GitHub issues for community solutions
  - Consider building direct YouTube API integration as backup (requires API key)

**Risk 2: Web Scraping Failures (Paywalls, JS-Heavy Sites)**
- **Probability**: High (many sites have paywalls or complex rendering)
- **Impact**: Medium (affects web article extraction quality)
- **Mitigation**:
  - Suggest https://archive.ph/ for paywall bypass
  - Offer paste textarea as immediate fallback
  - Use Readability's isProbablyReaderable check to fail fast
  - Consider adding browser automation (Playwright) for JS-heavy sites in Phase 2

**Risk 3: Timestamp Extraction Complexity**
- **Probability**: Low (regex pattern is well-tested)
- **Impact**: Medium (affects YouTube chunk navigation)
- **Mitigation**:
  - Store ALL timestamps in JSONB (not just first)
  - Use context snippets for fuzzy matching (resilient to formatting changes)
  - Fall back to displaying chunk without timestamp if extraction fails
  - Manual timestamp editing feature in future phase

**Risk 4: Processing Cost Escalation**
- **Probability**: Low (Gemini pricing is stable)
- **Impact**: High (could exceed budget constraints)
- **Mitigation**:
  - Monitor API usage per document type
  - Implement per-user daily limits
  - Cache transcript/article extractions (avoid re-processing)
  - Use cheaper model (gemini-2.0-flash-8b) for simple formatting tasks

### Medium-Priority Risks

**Risk 5: Database Migration Failures**
- **Probability**: Low (schema changes are additive)
- **Impact**: High (blocks entire feature)
- **Mitigation**:
  - Test migration on local development database first
  - Backup production database before migration
  - Use Supabase migration rollback if issues occur
  - Verify indexes created successfully (check query performance)

**Risk 6: UI Complexity Confuses Users**
- **Probability**: Medium (3 tabs + multiple options)
- **Impact**: Low (user education issue, not technical)
- **Mitigation**:
  - Add tooltips explaining each upload method
  - Show format-specific help text in each tab
  - Create quick-start video or GIF demos
  - A/B test tab order (most common method first)

**Risk 7: Markdown Front Matter Breaking Rendering**
- **Probability**: Medium (common in Obsidian/Notion exports)
- **Impact**: Low (rendering issue, not data loss)
- **Mitigation**:
  - Strip front matter before processing (YAML/TOML parser)
  - Store front matter in separate document metadata field
  - Test with Obsidian and Notion export samples

---

## Performance Targets

### Processing Time Benchmarks

| Source Type | Target | Acceptable | Needs Optimization |
|-------------|--------|------------|-------------------|
| PDF (existing) | <60s | <90s | >90s |
| Markdown (save-as-is) | <10s | <20s | >20s |
| Markdown (clean) | <45s | <60s | >60s |
| Text File | <45s | <60s | >60s |
| YouTube Transcript | <30s | <45s | >45s |
| Web Article | <40s | <60s | >60s |
| Pasted Content | <30s | <45s | >45s |

### API Cost Targets

| Operation | Gemini Calls | Target Cost | Acceptable | Alert Threshold |
|-----------|--------------|-------------|------------|-----------------|
| PDF Processing | 2 (extract + chunk, then embeddings) | $0.02 | $0.05 | $0.08 |
| YouTube Processing | 1 (chunk only) | $0.01 | $0.02 | $0.04 |
| Web Article | 2 (clean + chunk) | $0.02 | $0.04 | $0.06 |
| Text/Markdown Clean | 2 (format + chunk) | $0.02 | $0.04 | $0.06 |
| Embeddings (all) | chunks * 0.001 | $0.01 | $0.02 | $0.05 |

### Database Performance

- **Index Creation**: Source URL and timestamps JSONB indexed
- **Query Optimization**: Use GIN index for timestamps JSONB lookups
- **Storage Efficiency**: Markdown files in Storage (not DB), only chunks in DB
- **Connection Pooling**: Reuse Supabase client connections

---

## Success Metrics

### Quantitative Metrics

- **Upload Success Rate**: >95% across all 6 methods
- **Processing Speed**: 90th percentile <2 minutes
- **Error Recovery Rate**: 80% of failed uploads retry successfully or use fallback
- **API Cost**: Average $0.03 per document
- **User Adoption**: 30% of uploads are non-PDF within 2 weeks of launch

### Qualitative Metrics

- **User Satisfaction**: "I can import content from any source" (survey feedback)
- **Ease of Use**: <5% of users contact support for upload issues
- **Feature Discovery**: 60% of users try multiple upload methods within first month
- **Quality Perception**: "Processed content is readable and well-formatted"

---

## Appendix A: Complete Code Examples

### Example: Complete YouTube Handler

```typescript
// This is the full implementation pattern for YouTube processing in process-document.ts

case 'youtube':
  await updateProgress(supabase, job.id, 10, 'download', 'fetching', 'Fetching YouTube transcript')
  
  // Step 1: Extract video ID
  const videoId = extractVideoId(sourceUrl!)
  if (!videoId) {
    throw new Error('Invalid YouTube URL. Please check the URL and try again.')
  }
  
  // Step 2: Fetch transcript with retry logic
  let transcript: TranscriptSegment[]
  try {
    transcript = await fetchTranscriptWithRetry(videoId, 3)
  } catch (error: any) {
    // Structured errors for UI handling
    if (error.message.includes('YOUTUBE_TRANSCRIPT_DISABLED')) {
      throw new Error('YOUTUBE_TRANSCRIPT_DISABLED: This video has transcripts disabled. Use the "Get Transcript Manually" link or paste the transcript.')
    }
    throw error
  }
  
  await updateProgress(supabase, job.id, 20, 'download', 'formatting', 'Formatting transcript with timestamps')
  
  // Step 3: Format to markdown with timestamp links
  markdown = formatTranscriptToMarkdown(transcript, sourceUrl!)
  
  // Step 4: Semantic chunking with Gemini
  await updateProgress(supabase, job.id, 35, 'extract', 'chunking', 'Creating semantic chunks')
  chunks = await rechunkMarkdown(ai, markdown)
  
  // Step 5: Extract timestamps from chunks with context
  await updateProgress(supabase, job.id, 45, 'extract', 'timestamps', 'Extracting timestamp context')
  for (const chunk of chunks) {
    const timestamps = extractTimestampsWithContext(chunk.content)
    if (timestamps.length > 0) {
      // Add to chunk metadata (will be stored in chunks table)
      ;(chunk as any).timestamps = timestamps
      ;(chunk as any).source_timestamp = timestamps[0].time  // First timestamp is chunk start
    }
  }
  
  await updateProgress(supabase, job.id, 50, 'save_markdown', 'saving', 'Saving markdown to storage')
  break
```

### Example: Complete Web Article Handler

```typescript
// Full implementation for web article extraction

case 'web_url':
  await updateProgress(supabase, job.id, 10, 'download', 'fetching', 'Fetching web page')
  
  // Step 1: Validate URL
  if (!isValidUrl(sourceUrl!)) {
    throw new Error('WEB_INVALID_URL: Invalid URL format. Please check the URL.')
  }
  
  // Step 2: Extract article with Readability
  let article: Article
  try {
    article = await extractArticle(sourceUrl!)
  } catch (error: any) {
    // Re-throw structured errors for UI handling
    throw error
  }
  
  await updateProgress(supabase, job.id, 25, 'extract', 'cleaning', 'Cleaning article content with AI')
  
  // Step 3: Convert article to clean markdown with Gemini
  const cleanResult = await ai.models.generateContent({
    model: 'gemini-2.0-flash',
    contents: [{
      parts: [{
        text: `Convert this extracted web article to clean, well-formatted markdown. Preserve the structure and main content, but remove any remaining ads, navigation elements, or boilerplate text.

Article Title: ${article.title}
Author: ${article.byline || 'Unknown'}
Source: ${sourceUrl}

Content:
${article.textContent}

Guidelines:
- Use appropriate heading levels (# ## ###)
- Format lists properly (bullet points, numbered)
- Preserve links and emphasis
- Add paragraph breaks for readability
- Remove any "Share" buttons, "Subscribe" prompts, or promotional text`
      }]
    }]
  })
  
  markdown = cleanResult.text
  
  // Step 4: Semantic chunking
  await updateProgress(supabase, job.id, 45, 'extract', 'chunking', 'Creating semantic chunks')
  chunks = await rechunkMarkdown(ai, markdown)
  
  await updateProgress(supabase, job.id, 50, 'save_markdown', 'saving', 'Saving to storage')
  break
```

---

## Appendix B: Database Schema Reference

### Complete Migration SQL

```sql
-- File: supabase/migrations/010_multi_format_support.sql

-- Add source metadata columns to documents table
ALTER TABLE documents 
  ADD COLUMN IF NOT EXISTS source_url TEXT,
  ADD COLUMN IF NOT EXISTS processing_requested BOOLEAN DEFAULT true;

-- Add timestamp support to chunks table
ALTER TABLE chunks
  ADD COLUMN IF NOT EXISTS timestamps JSONB;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_documents_source_url 
  ON documents(source_url) 
  WHERE source_url IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_chunks_timestamps 
  ON chunks USING GIN (timestamps) 
  WHERE timestamps IS NOT NULL;

-- Update source_type constraint to include new types
ALTER TABLE documents 
  DROP CONSTRAINT IF EXISTS documents_source_type_check;

ALTER TABLE documents
  ADD CONSTRAINT documents_source_type_check 
  CHECK (source_type IN (
    'pdf',
    'markdown_asis',
    'markdown_clean',
    'txt',
    'youtube',
    'web_url',
    'paste'
  ));

-- Add helpful comments for documentation
COMMENT ON COLUMN documents.source_url IS 
  'Source URL for YouTube videos or web articles. Null for uploaded files or pasted content.';

COMMENT ON COLUMN documents.processing_requested IS 
  'For markdown files: true = AI cleanup and semantic chunking, false = save as-is with heading-based chunking.';

COMMENT ON COLUMN chunks.timestamps IS 
  'JSONB array of timestamp objects for YouTube videos. Each object contains: time (seconds), context_before (3-5 words), context_after (3-5 words). Used for fuzzy matching timestamps to markdown content when displaying clickable timestamp links.';

-- Add example timestamps JSONB structure
COMMENT ON COLUMN chunks.source_timestamp IS 
  'First timestamp in seconds for chunk start (YouTube videos only). Used for quick access to chunk video position.';

-- Example query patterns:
-- Find chunks with timestamps: SELECT * FROM chunks WHERE timestamps IS NOT NULL;
-- Get timestamps for chunk: SELECT timestamps FROM chunks WHERE id = 'chunk-id';
-- Find chunks by document: SELECT * FROM chunks WHERE document_id = 'doc-id' ORDER BY chunk_index;
```

---

## Appendix C: External Documentation Links

### Primary Documentation

1. **youtube-transcript-plus**: https://github.com/ericmmartin/youtube-transcript-plus
   - Usage examples: See README.md
   - Error handling: See src/errors.ts
   - Caching: See src/cache.ts

2. **@mozilla/readability**: https://github.com/mozilla/readability
   - Algorithm explanation: See README.md
   - API reference: See src/Readability.js
   - Best practices: Check isProbablyReaderable() before parsing

3. **jsdom**: https://github.com/jsdom/jsdom
   - Security considerations: https://github.com/jsdom/jsdom#executing-scripts
   - Performance tips: Use runScripts: 'outside-only', call window.close()
   - Common issues: https://github.com/jsdom/jsdom/issues

4. **axios**: https://axios-http.com/docs/intro
   - Error handling: https://axios-http.com/docs/handling_errors
   - Request config: https://axios-http.com/docs/req_config
   - Timeout configuration: validateStatus, timeout options

### Secondary References

5. **YouTube Deep Linking**: https://developers.google.com/youtube/player_parameters#t
   - Format: `&t=<seconds>` or `&t=<minutes>m<seconds>s`
   - Examples: `&t=125` (2:05), `&t=2m5s`

6. **Gemini API Documentation**: https://ai.google.dev/gemini-api/docs
   - Structured output: https://ai.google.dev/gemini-api/docs/json-mode
   - File uploads: https://ai.google.dev/gemini-api/docs/vision
   - Rate limits: https://ai.google.dev/gemini-api/docs/rate-limits

---

## Appendix D: Validation Commands Reference

### Pre-Implementation Validation

```bash
# Verify current setup
npm run dev                    # All services start successfully
npx supabase db reset          # Database migrations work
npm test                       # Existing tests pass

# Verify dependencies
npm list youtube-transcript-plus jsdom @mozilla/readability axios
# Expected: All packages found

# Verify TypeScript configuration
npx tsc --noEmit
# Expected: No errors
```

### During Implementation Validation

```bash
# After database migration (Task 1.1)
npx supabase db diff
# Expected: No pending changes, migration applied

psql -h localhost -p 54322 -U postgres -d postgres -c "
  SELECT column_name, data_type 
  FROM information_schema.columns 
  WHERE table_name = 'documents' AND column_name IN ('source_url', 'processing_requested');
"
# Expected: Both columns exist

# After utility functions (Tasks 2.1-2.3)
npm test worker/lib/__tests__/
# Expected: All utility tests pass

node -e "
  const { extractVideoId } = require('./worker/lib/youtube');
  console.log(extractVideoId('https://youtube.com/watch?v=dQw4w9WgXcQ'));
"
# Expected: 'dQw4w9WgXcQ'

# After worker refactoring (Task 3.1)
npx tsc --noEmit
# Expected: No TypeScript errors

npm test worker/__tests__/multi-format.test.ts
# Expected: All integration tests pass

# After UI updates (Tasks 4.1-4.2)
npm run build
# Expected: Next.js builds successfully

npm run dev
# Navigate to http://localhost:3000
# Expected: Upload zone shows 3 tabs
```

### Post-Implementation Validation

```bash
# Run full test suite
npm test
# Expected: All tests pass, coverage >80%

# Lint check
npm run lint
# Expected: No ESLint errors

# Build check
npm run build
# Expected: No build errors

# Manual testing
# Follow checklist in Task 6.2

# Performance check
npm run dev
# Upload various formats, monitor processing times
# Expected: <2 minutes for all formats

# Cost monitoring
# Check Gemini API usage dashboard
# Expected: <$0.05 per document average
```

---

## Document Confidence Score

### Self-Assessment

**Score: 9/10** (High Confidence for One-Pass Implementation)

**Justification:**

**Strengths (+9 points):**
1. ✅ **Complete Context**: All research findings integrated (codebase analysis + external library docs)
2. ✅ **Executable Examples**: Real code snippets with line numbers from existing files
3. ✅ **Clear Dependencies**: Task order with explicit prerequisites
4. ✅ **Validation Gates**: Specific commands to run at each checkpoint
5. ✅ **Error Handling**: Structured error types with recovery actions
6. ✅ **External Documentation**: Direct URLs to library docs (not just mentions)
7. ✅ **Risk Mitigation**: Identified risks with concrete mitigation strategies
8. ✅ **Testing Strategy**: Unit tests, integration tests, manual test plan
9. ✅ **Database Schema**: Complete migration SQL with comments

**Minor Gaps (-1 point):**
1. ⚠️ **UI/UX Polish**: Tab order and tooltip content left to implementation discretion
2. ⚠️ **Performance Tuning**: Exact Gemini prompt engineering may need iteration
3. ⚠️ **Edge Cases**: Front matter parsing logic not fully specified

**Confidence in One-Pass Success:** 85-90%

The PRP provides sufficient detail for an AI agent to implement the feature successfully in one pass. The main uncertainties are:
- External library behavior (youtube-transcript-plus reliability)
- Gemini prompt quality (may need A/B testing)
- UI/UX refinements based on user testing

All critical technical decisions are specified, with fallback strategies for known risks.

---

**End of PRP Document**

Total Length: ~15,000 words | Estimated Implementation Time: 2 weeks (10 working days) | Complexity: Medium

For questions or clarifications during implementation, refer to:
- Codebase files: All referenced with absolute paths and line numbers
- External docs: Direct links provided in Appendix C
- Research findings: Integrated throughout document
- Validation commands: Appendix D with expected outputs