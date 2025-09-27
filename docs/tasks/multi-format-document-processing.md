# Task Breakdown: Multi-Format Document Processing System

**Source PRP**: `/Users/topher/Code/rhizome-v2/docs/prps/multi-format-document-processing.md`  
**Feature Type**: Core Processing Pipeline Enhancement  
**Complexity**: Medium (2 weeks, 80-100 hours)  
**Impact**: High - Universal content ingestion platform

---

## Executive Summary

This task breakdown translates the Multi-Format Document Processing PRP into 18 actionable development tasks organized into 5 phases. The feature transforms Rhizome from PDF-only processing to supporting 6 input methods: PDF uploads, Markdown files, plain text, YouTube videos, web articles, and pasted content.

### Success Criteria
- All 6 input methods functional with >95% success rate
- Processing time <2 minutes per document
- YouTube timestamps preserved and clickable
- Web articles extracted without ads/navigation
- Cost <$0.05 per document

### Task Organization
- **Phase 1**: Database & Dependencies (12 hours, 3 tasks)
- **Phase 2**: Worker Utilities (24 hours, 4 tasks)
- **Phase 3**: Worker Handler Integration (20 hours, 3 tasks)
- **Phase 4**: UI & Server Actions (20 hours, 4 tasks)
- **Phase 5**: Testing & Validation (24 hours, 4 tasks)

---

## Phase 1: Database Schema & External Dependencies

**Objective**: Establish data layer support and install required libraries  
**Duration**: 12 hours  
**Dependencies**: None (starting point)  
**Risk Level**: Low

---

### MFP-001: Create Database Migration for Multi-Format Support

**Priority**: Critical  
**Estimated Hours**: 4  
**Assignable To**: Backend/Full-stack  
**Dependencies**: None

#### Description
Create a new database migration that adds columns to support multiple source types, URLs for external content, user processing preferences, and timestamp storage for YouTube videos. This migration is the foundation for all subsequent work.

#### Files to Create/Modify
- **CREATE**: `/Users/topher/Code/rhizome-v2/supabase/migrations/010_multi_format_support.sql`

#### Implementation Details

**Migration SQL**:
```sql
-- Add new columns to documents table
ALTER TABLE documents 
  ADD COLUMN source_url TEXT,
  ADD COLUMN processing_requested BOOLEAN DEFAULT true;

-- Add timestamp support to chunks table
ALTER TABLE chunks
  ADD COLUMN timestamps JSONB;

-- Add indexes for performance
CREATE INDEX idx_documents_source_url ON documents(source_url) 
  WHERE source_url IS NOT NULL;
CREATE INDEX idx_chunks_timestamps ON chunks USING GIN (timestamps) 
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

-- Add documentation comments
COMMENT ON COLUMN documents.source_url IS 
  'Source URL for YouTube videos or web articles. Null for uploaded files.';
COMMENT ON COLUMN documents.processing_requested IS 
  'For markdown files: true = AI cleanup, false = save as-is';
COMMENT ON COLUMN chunks.timestamps IS 
  'JSONB array of timestamp objects with time, context_before, context_after fields for YouTube videos';
```

#### Acceptance Criteria

**Given** the migration file is created  
**When** I run `npx supabase db reset`  
**Then** the migration applies without errors

**Given** the migration is applied  
**When** I check the documents table schema  
**Then** it includes `source_url` (TEXT, nullable) and `processing_requested` (BOOLEAN, default true)

**Given** the migration is applied  
**When** I check the chunks table schema  
**Then** it includes `timestamps` (JSONB, nullable)

**Given** the migration is applied  
**When** I query system catalogs  
**Then** indexes exist on `documents.source_url` and `chunks.timestamps`

**Rule-Based Checklist**:
- [ ] Migration file numbered sequentially (010)
- [ ] All columns use appropriate data types
- [ ] Indexes created for query optimization
- [ ] CHECK constraint validates all 7 source types
- [ ] Column comments provide context
- [ ] Migration is idempotent (safe to re-run)

#### Manual Testing Steps

1. **Apply Migration**:
   ```bash
   cd /Users/topher/Code/rhizome-v2
   npx supabase db reset
   ```
   - Expected: No errors, migration applies successfully

2. **Verify Schema Changes**:
   ```bash
   npx supabase db diff
   ```
   - Expected: No pending differences

3. **Test Constraint**:
   ```sql
   -- Should succeed
   INSERT INTO documents (user_id, title, storage_path, source_type) 
   VALUES ('dev-user-123', 'Test', 'path/to/doc', 'youtube');
   
   -- Should fail with constraint violation
   INSERT INTO documents (user_id, title, storage_path, source_type) 
   VALUES ('dev-user-123', 'Test', 'path/to/doc', 'invalid_type');
   ```

4. **Verify Indexes**:
   ```sql
   SELECT indexname, indexdef 
   FROM pg_indexes 
   WHERE tablename IN ('documents', 'chunks') 
   AND indexname LIKE 'idx_%';
   ```
   - Expected: Both new indexes appear in results

---

### MFP-002: Install External Libraries

**Priority**: Critical  
**Estimated Hours**: 2  
**Assignable To**: Backend/Full-stack  
**Dependencies**: None

#### Description
Install npm packages required for YouTube transcript fetching and web article extraction. Includes production dependencies and TypeScript type definitions.

#### Files to Modify
- **MODIFY**: `/Users/topher/Code/rhizome-v2/package.json` (automatic via npm install)

#### Implementation Details

**Installation Commands**:
```bash
# Production dependencies
npm install youtube-transcript-plus jsdom @mozilla/readability axios

# TypeScript type definitions
npm install -D @types/mozilla__readability
```

**Expected package.json additions**:
```json
{
  "dependencies": {
    "youtube-transcript-plus": "^2.0.0",
    "jsdom": "^24.0.0",
    "@mozilla/readability": "^0.5.0",
    "axios": "^1.6.0"
  },
  "devDependencies": {
    "@types/mozilla__readability": "^0.2.0"
  }
}
```

#### Acceptance Criteria

**Given** I have run the installation commands  
**When** I check `package.json`  
**Then** all 4 production dependencies are listed with correct version ranges

**Given** dependencies are installed  
**When** I run `npm list youtube-transcript-plus jsdom @mozilla/readability axios`  
**Then** all packages show as installed with no errors

**Given** TypeScript types are installed  
**When** I run `npx tsc --noEmit`  
**Then** no errors about missing type definitions for these libraries

**Rule-Based Checklist**:
- [ ] youtube-transcript-plus version ^2.x installed
- [ ] jsdom version ^24.x installed
- [ ] @mozilla/readability version ^0.5.x installed
- [ ] axios version ^1.6.x installed
- [ ] @types/mozilla__readability in devDependencies
- [ ] package-lock.json updated
- [ ] No peer dependency warnings

#### Manual Testing Steps

1. **Install Dependencies**:
   ```bash
   cd /Users/topher/Code/rhizome-v2
   npm install youtube-transcript-plus jsdom @mozilla/readability axios
   npm install -D @types/mozilla__readability
   ```
   - Expected: Clean install with no errors

2. **Verify Installation**:
   ```bash
   npm list youtube-transcript-plus jsdom @mozilla/readability axios
   ```
   - Expected: All packages listed with versions

3. **Test TypeScript Types**:
   ```bash
   npx tsc --noEmit
   ```
   - Expected: No type-related errors

4. **Test Import Syntax** (create temporary test file):
   ```typescript
   import { fetchTranscript } from 'youtube-transcript-plus'
   import { JSDOM } from 'jsdom'
   import { Readability } from '@mozilla/readability'
   import axios from 'axios'
   // If no errors, types are working
   ```

---

### MFP-003: Create TypeScript Type Definitions

**Priority**: High  
**Estimated Hours**: 6  
**Assignable To**: Backend/Full-stack  
**Dependencies**: MFP-002 (needs libraries installed)

#### Description
Define comprehensive TypeScript interfaces for all new data structures including transcript segments, timestamp contexts, extracted articles, source types, and error classifications. These types provide type safety across the entire feature.

#### Files to Create
- **CREATE**: `/Users/topher/Code/rhizome-v2/worker/types/multi-format.ts`

#### Implementation Details

**Complete type definitions** (refer to PRP Task 1.3 for full code):

```typescript
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

**Key patterns to follow**:
- Use JSDoc for all exported types (required by project standards)
- Include usage examples in comments
- Mark optional fields with `?` operator
- Use union types for enums instead of TypeScript enums

#### Acceptance Criteria

**Given** the type file is created  
**When** I run `npx tsc --noEmit`  
**Then** no TypeScript compilation errors occur

**Given** the types are defined  
**When** I import them in another file  
**Then** autocomplete works in IDE for all properties

**Given** I create a variable with type `TranscriptSegment`  
**When** I try to assign invalid properties  
**Then** TypeScript shows type errors

**Rule-Based Checklist**:
- [ ] All exported interfaces have JSDoc comments
- [ ] All interface properties have descriptive comments
- [ ] Optional properties marked with `?`
- [ ] SourceType union includes all 7 types
- [ ] ErrorType union includes all 4 categories
- [ ] No `any` types used
- [ ] Follows project naming conventions (PascalCase for types)

#### Manual Testing Steps

1. **Create Type File**:
   ```bash
   mkdir -p /Users/topher/Code/rhizome-v2/worker/types
   # Create multi-format.ts with full content from PRP
   ```

2. **Type Check**:
   ```bash
   npx tsc --noEmit
   ```
   - Expected: No errors

3. **Test Type Safety** (create test file):
   ```typescript
   import type { TranscriptSegment, SourceType } from './worker/types/multi-format'
   
   // Should work
   const segment: TranscriptSegment = {
     text: 'Hello',
     duration: 5,
     offset: 0
   }
   
   // Should error (missing required field)
   const bad: TranscriptSegment = {
     text: 'Hello'
   }
   
   // Should work (valid union member)
   const type: SourceType = 'youtube'
   
   // Should error (invalid union member)
   const badType: SourceType = 'invalid'
   ```

4. **Verify IDE Support**:
   - Open VS Code
   - Import types and check autocomplete works
   - Hover over properties to see JSDoc comments

---

## Phase 2: Worker Utility Functions

**Objective**: Build reusable utility modules for YouTube, web extraction, and markdown chunking  
**Duration**: 24 hours  
**Dependencies**: Phase 1 complete  
**Risk Level**: Medium (external API dependencies)

---

### MFP-004: Implement YouTube Utility Functions

**Priority**: High  
**Estimated Hours**: 8  
**Assignable To**: Backend/Full-stack  
**Dependencies**: MFP-002, MFP-003

#### Description
Create utility functions for YouTube video processing: extract video IDs from various URL formats, fetch transcripts with retry logic and error handling, and format transcripts to markdown with clickable timestamp links.

#### Files to Create
- **CREATE**: `/Users/topher/Code/rhizome-v2/worker/lib/youtube.ts`

#### Implementation Details

**Key Functions** (see PRP Task 2.1 for complete implementation):

1. **`extractVideoId(url: string): string | null`**
   - Regex pattern supports youtube.com/watch, youtu.be, shorts, embed
   - Returns 11-character video ID or null
   - No external API calls

2. **`fetchTranscriptWithRetry(videoId: string, maxRetries: number): Promise<TranscriptSegment[]>`**
   - Implements exponential backoff: 1s, 2s, 4s
   - Classifies errors: permanent (disabled/unavailable), transient (rate limit/network)
   - Returns structured error messages with UI-friendly prefixes

3. **`formatTranscriptToMarkdown(transcript: TranscriptSegment[], videoUrl: string): string`**
   - Converts timestamps to HH:MM:SS or MM:SS format
   - Generates YouTube deep links: `&t=125s`
   - Returns markdown with inline timestamp links

**Pattern references**:
- Follow existing error handling in `worker/handlers/process-document.ts` (lines 197-201)
- Use structured error messages with prefixes (e.g., `YOUTUBE_TRANSCRIPT_DISABLED`)
- Implement retry logic similar to rate limiting pattern (lines 248-250)

#### Acceptance Criteria

**Given** I provide a valid YouTube URL  
**When** I call `extractVideoId`  
**Then** it returns the 11-character video ID

**Given** I provide various YouTube URL formats (watch, youtu.be, shorts)  
**When** I call `extractVideoId`  
**Then** all formats extract the video ID correctly

**Given** a valid video ID with transcripts disabled  
**When** I call `fetchTranscriptWithRetry`  
**Then** it throws error with prefix `YOUTUBE_TRANSCRIPT_DISABLED`

**Given** a rate limit error occurs  
**When** `fetchTranscriptWithRetry` retries  
**Then** it waits 1s, 2s, 4s between attempts (exponential backoff)

**Given** a valid transcript is fetched  
**When** I call `formatTranscriptToMarkdown`  
**Then** it returns markdown with clickable timestamp links

**Rule-Based Checklist**:
- [ ] All functions have complete JSDoc with examples
- [ ] extractVideoId handles 4+ URL formats
- [ ] Retry logic implements exponential backoff
- [ ] Error messages prefixed for UI routing
- [ ] Timestamp format matches YouTube convention
- [ ] No hardcoded API keys or credentials
- [ ] Functions are pure (no side effects except async I/O)

#### Manual Testing Steps

1. **Test Video ID Extraction**:
   ```bash
   node -e "
   const { extractVideoId } = require('./worker/lib/youtube');
   console.log(extractVideoId('https://youtube.com/watch?v=dQw4w9WgXcQ'));
   console.log(extractVideoId('https://youtu.be/dQw4w9WgXcQ'));
   console.log(extractVideoId('invalid'));
   "
   ```
   - Expected: First two print 'dQw4w9WgXcQ', third prints null

2. **Test Transcript Fetching** (use real video):
   ```bash
   node -e "
   const { fetchTranscriptWithRetry } = require('./worker/lib/youtube');
   fetchTranscriptWithRetry('dQw4w9WgXcQ').then(t => {
     console.log('Segments:', t.length);
     console.log('First segment:', t[0]);
   }).catch(err => console.error(err.message));
   "
   ```
   - Expected: Prints segment count and first segment structure

3. **Test Error Handling** (video with disabled transcripts):
   ```bash
   node -e "
   const { fetchTranscriptWithRetry } = require('./worker/lib/youtube');
   fetchTranscriptWithRetry('INVALID_ID').catch(err => {
     console.log('Error caught:', err.message.startsWith('YOUTUBE_'));
   });
   "
   ```
   - Expected: Error message starts with YOUTUBE_ prefix

4. **Test Markdown Formatting**:
   ```bash
   node -e "
   const { formatTranscriptToMarkdown } = require('./worker/lib/youtube');
   const mockTranscript = [
     { text: 'Hello world', offset: 0, duration: 2 },
     { text: 'Second segment', offset: 125, duration: 3 }
   ];
   const md = formatTranscriptToMarkdown(mockTranscript, 'https://youtube.com/watch?v=abc123');
   console.log(md);
   "
   ```
   - Expected: Markdown with [00:00] and [02:05] timestamp links

---

### MFP-005: Implement Web Article Extraction Utilities

**Priority**: High  
**Estimated Hours**: 8  
**Assignable To**: Backend/Full-stack  
**Dependencies**: MFP-002, MFP-003

#### Description
Create utilities for web content extraction: URL validation, article content extraction using Mozilla Readability algorithm, and HTML sanitization. Handles paywalls, 404s, timeouts, and non-article pages gracefully.

#### Files to Create
- **CREATE**: `/Users/topher/Code/rhizome-v2/worker/lib/web-extraction.ts`

#### Implementation Details

**Key Functions** (see PRP Task 2.2 for complete code):

1. **`isValidUrl(url: string): boolean`**
   - Validates HTTP/HTTPS URLs using URL constructor
   - Returns false for invalid formats without throwing

2. **`extractArticle(url: string): Promise<Article>`**
   - Fetches HTML with axios (10s timeout)
   - Parses with jsdom (scripts disabled for security)
   - Validates with `Readability.isProbablyReaderable`
   - Extracts content with Readability algorithm
   - Returns structured Article object

3. **`sanitizeHtml(html: string): string`**
   - Removes script tags and event handlers
   - Basic XSS protection (note: suggests DOMPurify for production)

**Error handling**:
- HTTP 404 → `WEB_NOT_FOUND`
- HTTP 403 → `WEB_PAYWALL` (suggests archive.ph)
- Timeout → `WEB_TIMEOUT`
- Network → `WEB_NETWORK_ERROR`
- Not article → `WEB_NOT_ARTICLE`

**Security considerations**:
- Disable script execution in jsdom
- Set User-Agent header to identify bot
- Clean up DOM to prevent memory leaks

#### Acceptance Criteria

**Given** I provide a valid HTTP URL  
**When** I call `isValidUrl`  
**Then** it returns true

**Given** I provide an invalid string  
**When** I call `isValidUrl`  
**Then** it returns false without throwing

**Given** a valid article URL  
**When** I call `extractArticle`  
**Then** it returns an Article object with title, content, and textContent

**Given** a 404 URL  
**When** I call `extractArticle`  
**Then** it throws error with prefix `WEB_NOT_FOUND`

**Given** a paywalled article (403)  
**When** I call `extractArticle`  
**Then** it throws error suggesting archive.ph

**Given** a non-article page (homepage, etc.)  
**When** I call `extractArticle`  
**Then** it throws error with prefix `WEB_NOT_ARTICLE`

**Rule-Based Checklist**:
- [ ] All functions have complete JSDoc
- [ ] URL validation uses try/catch with URL constructor
- [ ] jsdom disables script execution
- [ ] Axios timeout set to 10 seconds
- [ ] User-Agent header identifies Rhizome bot
- [ ] DOM cleanup prevents memory leaks
- [ ] Error messages prefixed for UI routing
- [ ] HTTP status codes mapped to appropriate errors

#### Manual Testing Steps

1. **Test URL Validation**:
   ```bash
   node -e "
   const { isValidUrl } = require('./worker/lib/web-extraction');
   console.log('Valid:', isValidUrl('https://example.com'));
   console.log('Invalid:', isValidUrl('not-a-url'));
   console.log('Invalid:', isValidUrl('ftp://example.com'));
   "
   ```
   - Expected: true, false, false

2. **Test Article Extraction** (use real article):
   ```bash
   node -e "
   const { extractArticle } = require('./worker/lib/web-extraction');
   extractArticle('https://example.com').then(article => {
     console.log('Title:', article.title);
     console.log('Length:', article.textContent.length);
     console.log('Has content:', article.content.length > 0);
   }).catch(err => console.error(err.message));
   "
   ```
   - Expected: Article title and content length displayed

3. **Test 404 Handling**:
   ```bash
   node -e "
   const { extractArticle } = require('./worker/lib/web-extraction');
   extractArticle('https://httpstat.us/404').catch(err => {
     console.log('Error prefix:', err.message.startsWith('WEB_NOT_FOUND'));
   });
   "
   ```
   - Expected: true

4. **Test Timeout Handling**:
   ```bash
   node -e "
   const { extractArticle } = require('./worker/lib/web-extraction');
   extractArticle('https://httpstat.us/200?sleep=15000').catch(err => {
     console.log('Timeout error:', err.message.includes('WEB_TIMEOUT'));
   });
   "
   ```
   - Expected: Timeout error after 10 seconds

---

### MFP-006: Implement Markdown Chunking Utilities

**Priority**: High  
**Estimated Hours**: 6  
**Assignable To**: Backend/Full-stack  
**Dependencies**: MFP-003

#### Description
Create utilities for heading-based markdown chunking (no AI) and timestamp extraction with fuzzy-match context. Supports markdown save-as-is mode and YouTube timestamp preservation.

#### Files to Create
- **CREATE**: `/Users/topher/Code/rhizome-v2/worker/lib/markdown-chunking.ts`

#### Implementation Details

**Key Functions** (see PRP Task 2.3 for complete code):

1. **`simpleMarkdownChunking(markdown: string): Chunk[]`**
   - Splits by heading markers (# ## ### etc.)
   - Minimum chunk size: 200 chars
   - Maximum chunk size: 2000 chars (splits long sections)
   - Returns chunks with content, themes, importance_score, summary

2. **`extractTimestampsWithContext(content: string): TimestampContext[]`**
   - Regex matches [MM:SS] and [HH:MM:SS] formats
   - Extracts 3-5 words before and after each timestamp
   - Converts to seconds for storage
   - Returns array of timestamp contexts

**Algorithm details**:
- Heading regex: `/^(#{1,6})\s+(.+)$/gm`
- Timestamp regex: `/\[(\d{1,2}):(\d{2})(?::(\d{2}))?\]/g`
- Context extraction: 100 chars before/after, split to 3-5 words
- Long section splitting: by paragraph breaks

#### Acceptance Criteria

**Given** markdown with multiple headings  
**When** I call `simpleMarkdownChunking`  
**Then** it returns one chunk per section with heading as theme

**Given** markdown with no headings  
**When** I call `simpleMarkdownChunking`  
**Then** it returns single chunk with default theme 'Document Content'

**Given** a section longer than 2000 characters  
**When** I call `simpleMarkdownChunking`  
**Then** it splits into multiple sub-chunks by paragraphs

**Given** content with timestamp [02:05]  
**When** I call `extractTimestampsWithContext`  
**Then** it returns timestamp object with time=125 and context words

**Given** content with multiple timestamps  
**When** I call `extractTimestampsWithContext`  
**Then** it returns array with all timestamps and contexts

**Rule-Based Checklist**:
- [ ] All functions have complete JSDoc
- [ ] Heading regex captures all markdown heading levels (1-6)
- [ ] Timestamp regex handles both MM:SS and HH:MM:SS
- [ ] Minimum chunk size enforced (200 chars)
- [ ] Maximum chunk size enforced (2000 chars)
- [ ] Context extraction includes 3-5 words
- [ ] Time conversion handles hours, minutes, seconds correctly

#### Manual Testing Steps

1. **Test Basic Chunking**:
   ```bash
   node -e "
   const { simpleMarkdownChunking } = require('./worker/lib/markdown-chunking');
   const md = '# Introduction\n\nFirst section\n\n## Details\n\nSecond section';
   const chunks = simpleMarkdownChunking(md);
   console.log('Chunks:', chunks.length);
   console.log('Themes:', chunks.map(c => c.themes));
   "
   ```
   - Expected: 2 chunks with themes ['Introduction', 'Details']

2. **Test Long Section Splitting**:
   ```bash
   node -e "
   const { simpleMarkdownChunking } = require('./worker/lib/markdown-chunking');
   const longSection = '# Long\n\n' + 'Lorem ipsum '.repeat(300);
   const chunks = simpleMarkdownChunking(longSection);
   console.log('Chunks from long section:', chunks.length);
   console.log('Lengths:', chunks.map(c => c.content.length));
   "
   ```
   - Expected: Multiple chunks, all <2000 chars

3. **Test Timestamp Extraction**:
   ```bash
   node -e "
   const { extractTimestampsWithContext } = require('./worker/lib/markdown-chunking');
   const content = 'In the beginning [00:30] we discuss basics and later [02:15] advanced topics';
   const timestamps = extractTimestampsWithContext(content);
   console.log('Timestamps:', timestamps);
   console.log('First time:', timestamps[0].time);
   console.log('Context:', timestamps[0].context_after);
   "
   ```
   - Expected: 2 timestamps with time=30 and time=135, contexts extracted

4. **Test Edge Cases**:
   ```bash
   node -e "
   const { simpleMarkdownChunking, extractTimestampsWithContext } = require('./worker/lib/markdown-chunking');
   
   // No headings
   const noHeadings = simpleMarkdownChunking('Just plain text content');
   console.log('No headings:', noHeadings.length, noHeadings[0].themes);
   
   // No timestamps
   const noTimestamps = extractTimestampsWithContext('No timestamps here');
   console.log('No timestamps:', noTimestamps.length);
   "
   ```
   - Expected: 1 chunk with default theme, 0 timestamps

---

### MFP-007: Create Unit Tests for Worker Utilities

**Priority**: Medium  
**Estimated Hours**: 6  
**Assignable To**: Backend/Full-stack  
**Dependencies**: MFP-004, MFP-005, MFP-006

#### Description
Create comprehensive unit tests for all utility functions using Jest. Tests should cover happy paths, error cases, edge cases, and validate all acceptance criteria.

#### Files to Create
- **CREATE**: `/Users/topher/Code/rhizome-v2/worker/lib/__tests__/youtube.test.ts`
- **CREATE**: `/Users/topher/Code/rhizome-v2/worker/lib/__tests__/web-extraction.test.ts`
- **CREATE**: `/Users/topher/Code/rhizome-v2/worker/lib/__tests__/markdown-chunking.test.ts`

#### Implementation Details

**Test Structure** (Jest with TypeScript):
```typescript
describe('youtube utilities', () => {
  describe('extractVideoId', () => {
    it('extracts ID from youtube.com/watch URL', () => {
      const id = extractVideoId('https://youtube.com/watch?v=dQw4w9WgXcQ')
      expect(id).toBe('dQw4w9WgXcQ')
    })
    
    it('extracts ID from youtu.be short URL', () => {
      const id = extractVideoId('https://youtu.be/dQw4w9WgXcQ')
      expect(id).toBe('dQw4w9WgXcQ')
    })
    
    it('returns null for invalid URL', () => {
      const id = extractVideoId('not-a-youtube-url')
      expect(id).toBeNull()
    })
  })
  
  describe('fetchTranscriptWithRetry', () => {
    it('returns transcript segments for valid video', async () => {
      const transcript = await fetchTranscriptWithRetry('valid_video_id')
      expect(Array.isArray(transcript)).toBe(true)
      expect(transcript[0]).toHaveProperty('text')
      expect(transcript[0]).toHaveProperty('offset')
    })
    
    it('throws structured error for disabled transcripts', async () => {
      await expect(
        fetchTranscriptWithRetry('disabled_video_id')
      ).rejects.toThrow('YOUTUBE_TRANSCRIPT_DISABLED')
    })
  })
})
```

**Coverage targets**:
- youtube.ts: 100% line coverage (functions are small)
- web-extraction.ts: >90% coverage (mock axios responses)
- markdown-chunking.ts: 100% coverage (pure functions)

**Mocking strategy**:
- Mock `youtube-transcript-plus` for transcript tests
- Mock `axios` for web extraction tests
- No mocking needed for markdown-chunking (pure functions)

#### Acceptance Criteria

**Given** I run the test suite  
**When** all tests execute  
**Then** 100% of tests pass

**Given** I run with coverage flag  
**When** coverage report generates  
**Then** all utility files have >90% line coverage

**Given** I test extractVideoId with various formats  
**When** tests run  
**Then** all YouTube URL formats extract correctly

**Given** I test error scenarios  
**When** tests run  
**Then** all error types are caught and validated

**Rule-Based Checklist**:
- [ ] All test files use describe/it structure
- [ ] Tests cover happy path, error cases, edge cases
- [ ] Mocks prevent external API calls during tests
- [ ] Error assertions check message prefixes
- [ ] Async tests use await/async syntax
- [ ] Coverage >90% for all utility files

#### Manual Testing Steps

1. **Run Test Suite**:
   ```bash
   npm test worker/lib/__tests__/
   ```
   - Expected: All tests pass

2. **Run with Coverage**:
   ```bash
   npm test -- --coverage worker/lib/
   ```
   - Expected: Coverage report shows >90% for all files

3. **Run in Watch Mode** (during development):
   ```bash
   npm run test:watch
   ```
   - Expected: Tests re-run on file changes

4. **Validate Test Structure**:
   - Check each test file has describe blocks
   - Verify test names describe behavior clearly
   - Confirm mocks are properly reset between tests

---

## Phase 3: Worker Handler Integration

**Objective**: Integrate utility functions into main processing pipeline with routing logic  
**Duration**: 20 hours  
**Dependencies**: Phase 2 complete  
**Risk Level**: Medium-High (integration complexity)

---

### MFP-008: Refactor Worker Handler Routing Logic

**Priority**: Critical  
**Estimated Hours**: 8  
**Assignable To**: Backend/Full-stack  
**Dependencies**: MFP-004, MFP-005, MFP-006

#### Description
Refactor the main worker handler to route processing by `source_type` instead of file content type. Replace existing file type detection with switch-case routing for all 7 source types while preserving existing PDF processing logic.

#### Files to Modify
- **MODIFY**: `/Users/topher/Code/rhizome-v2/worker/handlers/process-document.ts`

#### Implementation Details

**Current State** (lines 62-207):
- Uses `contentType` from file headers for routing
- Only handles PDF and text/markdown
- Routing logic around lines 62-65

**Target State**:
- Add imports for new utilities at top of file
- Extract `source_type`, `source_url`, `processing_requested` from `job.input_data`
- Replace lines 62-207 with switch-case routing
- Keep existing PDF processing (lines 80-201) in default case
- Add 6 new case handlers (see PRP Task 3.1 for complete code)

**Routing structure**:
```typescript
const sourceType = job.input_data.source_type as SourceType || 'pdf'
const sourceUrl = job.input_data.source_url as string | undefined
const processingRequested = job.input_data.processing_requested as boolean ?? true

switch (sourceType) {
  case 'youtube': // Fetch transcript, format markdown, extract timestamps
  case 'web_url': // Extract article, clean with AI, chunk
  case 'markdown_asis': // Download file, chunk by headings
  case 'markdown_clean': // Download file, clean with AI, chunk
  case 'txt': // Download file, convert to markdown, chunk
  case 'paste': // Process from job input, detect timestamps
  case 'pdf': // Existing logic (no changes)
  default: // Existing PDF logic
}
```

**Progress tracking**:
- Each case must call `updateProgress` with appropriate substages
- Maintain existing progress checkpoints for storage and embeddings
- Use format-specific substage names (fetching, extracting, cleaning, chunking)

#### Acceptance Criteria

**Given** the refactoring is complete  
**When** I run TypeScript compiler  
**Then** no type errors occur

**Given** a job with source_type='pdf'  
**When** the worker processes it  
**Then** it follows existing PDF logic unchanged

**Given** a job with source_type='youtube'  
**When** the worker processes it  
**Then** it fetches transcript, formats markdown, and extracts timestamps

**Given** a job with source_type='web_url'  
**When** the worker processes it  
**Then** it extracts article and cleans with AI

**Given** a job with source_type='markdown_asis'  
**When** the worker processes it  
**Then** it chunks by headings without AI processing

**Rule-Based Checklist**:
- [ ] All 7 source types have case handlers
- [ ] Existing PDF logic preserved (no regressions)
- [ ] Progress updates call updateProgress with substages
- [ ] Error handling maintains existing pattern
- [ ] Imports added for all utility functions
- [ ] TypeScript types match multi-format.ts definitions
- [ ] No code duplication across cases

#### Manual Testing Steps

1. **Type Check**:
   ```bash
   npx tsc --noEmit
   ```
   - Expected: No errors

2. **Test PDF Processing** (ensure no regression):
   ```bash
   # Upload a PDF through UI or curl
   # Watch worker logs
   ```
   - Expected: Processes like before, no changes to behavior

3. **Test Each Source Type** (manual via worker):
   ```bash
   # For each source type, trigger processing
   # Verify worker logs show correct case handler
   # Verify progress updates show format-specific stages
   ```

4. **Verify Error Handling**:
   - Test with invalid YouTube URL
   - Test with 404 web URL
   - Verify error messages preserved

---

### MFP-009: Implement Timestamp Storage in Chunks

**Priority**: High  
**Estimated Hours**: 6  
**Assignable To**: Backend/Full-stack  
**Dependencies**: MFP-008

#### Description
Modify chunk storage logic to persist timestamp data to database for YouTube content. Update chunk insertion to include `timestamps` JSONB field when present.

#### Files to Modify
- **MODIFY**: `/Users/topher/Code/rhizome-v2/worker/handlers/process-document.ts`

#### Implementation Details

**Current chunk insertion** (around line 260):
```typescript
const { error: chunkError } = await supabase
  .from('chunks')
  .insert({
    document_id: documentId,
    content: chunk.content,
    embedding: embedding.values,
    chunk_index: i,
    themes: chunk.themes,
    importance_score: chunk.importance_score,
    summary: chunk.summary
  })
```

**Updated chunk insertion**:
```typescript
const chunkData: any = {
  document_id: documentId,
  content: chunk.content,
  embedding: embedding.values,
  chunk_index: i,
  themes: chunk.themes,
  importance_score: chunk.importance_score,
  summary: chunk.summary
}

// Add timestamp data if present (YouTube videos)
if ((chunk as any).timestamps) {
  chunkData.timestamps = (chunk as any).timestamps
}

const { error: chunkError } = await supabase
  .from('chunks')
  .insert(chunkData)
```

**Data structure in database**:
```json
{
  "timestamps": [
    {
      "time": 125,
      "context_before": "talking about the importance of",
      "context_after": "in modern web development"
    }
  ]
}
```

#### Acceptance Criteria

**Given** a YouTube video is processed  
**When** chunks are stored  
**Then** timestamps JSONB field contains array of TimestampContext objects

**Given** a non-YouTube document is processed  
**When** chunks are stored  
**Then** timestamps field is null (not included)

**Given** I query chunks for a YouTube video  
**When** I check the timestamps field  
**Then** it contains valid JSONB with time and context fields

**Rule-Based Checklist**:
- [ ] Conditional logic checks for timestamps property
- [ ] JSONB structure matches TimestampContext[] type
- [ ] Non-YouTube chunks don't include timestamps field
- [ ] Database accepts null timestamps without error
- [ ] Type safety maintained with TypeScript

#### Manual Testing Steps

1. **Process YouTube Video**:
   ```bash
   # Upload YouTube URL through UI
   # Wait for processing to complete
   ```

2. **Query Chunks**:
   ```sql
   SELECT id, content, timestamps 
   FROM chunks 
   WHERE document_id = '<youtube_document_id>'
   LIMIT 5;
   ```
   - Expected: timestamps field populated with JSONB array

3. **Verify Structure**:
   ```sql
   SELECT 
     id,
     jsonb_array_length(timestamps) as timestamp_count,
     timestamps->0->>'time' as first_time,
     timestamps->0->>'context_after' as first_context
   FROM chunks 
   WHERE timestamps IS NOT NULL
   LIMIT 1;
   ```
   - Expected: Correct count, time as integer, context as string

4. **Test Non-YouTube Document**:
   ```bash
   # Upload PDF through UI
   ```
   ```sql
   SELECT id, timestamps 
   FROM chunks 
   WHERE document_id = '<pdf_document_id>'
   LIMIT 1;
   ```
   - Expected: timestamps field is null

---

### MFP-010: Add Format-Specific Error Handling

**Priority**: Medium  
**Estimated Hours**: 6  
**Assignable To**: Backend/Full-stack  
**Dependencies**: MFP-008

#### Description
Enhance error handling to classify errors by type (transient, permanent, paywall, invalid) and provide format-specific recovery guidance. Update error messages to match UI expectations.

#### Files to Modify
- **MODIFY**: `/Users/topher/Code/rhizome-v2/worker/handlers/process-document.ts`

#### Implementation Details

**Add error classification function**:
```typescript
/**
 * Classifies error type based on message prefix.
 * 
 * @param error - Error object from processing
 * @returns Error type classification
 */
function classifyError(error: Error): ErrorType {
  const message = error.message
  
  if (message.startsWith('YOUTUBE_RATE_LIMIT') || 
      message.startsWith('WEB_TIMEOUT') ||
      message.startsWith('WEB_NETWORK_ERROR')) {
    return 'transient'
  }
  
  if (message.startsWith('YOUTUBE_TRANSCRIPT_DISABLED') ||
      message.startsWith('YOUTUBE_VIDEO_UNAVAILABLE') ||
      message.startsWith('WEB_NOT_FOUND')) {
    return 'permanent'
  }
  
  if (message.startsWith('WEB_PAYWALL')) {
    return 'paywall'
  }
  
  return 'invalid'
}

/**
 * Gets user-friendly error message with recovery guidance.
 * 
 * @param error - Error object from processing
 * @returns Friendly message with recovery actions
 */
function getUserFriendlyError(error: Error): string {
  const type = classifyError(error)
  const message = error.message
  
  switch (type) {
    case 'transient':
      return `${message} This is a temporary issue. Please try again in a few minutes.`
    
    case 'permanent':
      if (message.includes('YOUTUBE_TRANSCRIPT_DISABLED')) {
        return `${message} Try pasting the transcript manually from YouTube's transcript feature.`
      }
      return message
    
    case 'paywall':
      return `${message} Try using https://archive.ph/ to find an archived version.`
    
    default:
      return message
  }
}
```

**Wrap processing logic**:
```typescript
try {
  // Existing routing switch-case
  switch (sourceType) {
    // ... all cases
  }
} catch (error: any) {
  const friendlyMessage = getUserFriendlyError(error)
  await supabase
    .from('background_jobs')
    .update({ 
      status: 'failed',
      error_message: friendlyMessage,
      error_type: classifyError(error)
    })
    .eq('id', job.id)
  
  throw new Error(friendlyMessage)
}
```

#### Acceptance Criteria

**Given** a YouTube rate limit error occurs  
**When** the error is classified  
**Then** it returns 'transient' type

**Given** a paywall error occurs  
**When** the error message is generated  
**Then** it suggests using archive.ph

**Given** a transcript disabled error occurs  
**When** the error message is generated  
**Then** it suggests manual paste

**Given** any error occurs  
**When** the job is updated  
**Then** error_type and error_message fields are set

**Rule-Based Checklist**:
- [ ] classifyError function handles all error prefixes
- [ ] getUserFriendlyError provides actionable guidance
- [ ] Error types match ErrorType union
- [ ] All processing errors caught and classified
- [ ] Job status updated with error details
- [ ] JSDoc documentation complete

#### Manual Testing Steps

1. **Test Transient Error**:
   ```bash
   # Trigger rate limit by processing many YouTube videos
   # Check job error_type = 'transient'
   ```

2. **Test Permanent Error**:
   ```bash
   # Process YouTube video with disabled transcripts
   # Verify error suggests manual paste
   ```

3. **Test Paywall Error**:
   ```bash
   # Process paywalled article URL
   # Verify error suggests archive.ph
   ```

4. **Verify Database Updates**:
   ```sql
   SELECT id, status, error_type, error_message 
   FROM background_jobs 
   WHERE status = 'failed' 
   ORDER BY created_at DESC 
   LIMIT 5;
   ```
   - Expected: error_type and error_message populated

---

## Phase 4: UI & Server Actions

**Objective**: Update frontend components to support all 6 input methods  
**Duration**: 20 hours  
**Dependencies**: Phase 3 complete  
**Risk Level**: Low-Medium (UI complexity)

---

### MFP-011: Update uploadDocument Server Action

**Priority**: Critical  
**Estimated Hours**: 6  
**Assignable To**: Full-stack  
**Dependencies**: MFP-001

#### Description
Modify the uploadDocument server action to accept new FormData fields for source type, URL, processing preferences, and pasted content. Add validation for each input method.

#### Files to Modify
- **MODIFY**: `/Users/topher/Code/rhizome-v2/src/app/actions/documents.ts`

#### Implementation Details

**Current function signature** (line 43):
```typescript
export async function uploadDocument(formData: FormData)
```

**Add field extraction** (after line 50):
```typescript
const sourceType = formData.get('source_type') as string || 'pdf'
const sourceUrl = formData.get('source_url') as string | null
const processingRequested = formData.get('processing_requested') === 'true'
const pastedContent = formData.get('pasted_content') as string | null
```

**Add validation**:
```typescript
const validSourceTypes = ['pdf', 'markdown_asis', 'markdown_clean', 'txt', 'youtube', 'web_url', 'paste']
if (!validSourceTypes.includes(sourceType)) {
  return { success: false, error: 'Invalid source type' }
}

if ((sourceType === 'youtube' || sourceType === 'web_url') && !sourceUrl) {
  return { success: false, error: 'Source URL required for this type' }
}

if (sourceType === 'paste' && !pastedContent) {
  return { success: false, error: 'Content required for paste type' }
}
```

**Update document insertion** (line 72-85):
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

**Update job creation** (line 88-107):
```typescript
input_data: {
  document_id: documentId,
  storage_path: storagePath,
  source_type: sourceType,  // NEW
  source_url: sourceUrl,  // NEW
  processing_requested: processingRequested,  // NEW
  pasted_content: pastedContent  // NEW
}
```

#### Acceptance Criteria

**Given** I submit FormData with source_type='youtube' and source_url  
**When** uploadDocument is called  
**Then** it creates document with both fields set

**Given** I submit source_type='youtube' without source_url  
**When** uploadDocument is called  
**Then** it returns error 'Source URL required'

**Given** I submit source_type='paste' with pasted_content  
**When** uploadDocument is called  
**Then** it creates document and includes content in job input_data

**Given** I submit invalid source_type  
**When** uploadDocument is called  
**Then** it returns error 'Invalid source type'

**Rule-Based Checklist**:
- [ ] Validates all 7 source types
- [ ] Requires source_url for youtube/web_url types
- [ ] Requires pasted_content for paste type
- [ ] Updates document table with new fields
- [ ] Updates job input_data with new fields
- [ ] Maintains backward compatibility with existing PDF uploads

#### Manual Testing Steps

1. **Test PDF Upload** (no regression):
   ```bash
   curl -X POST http://localhost:3000/api/upload \
     -F "file=@test.pdf" \
     -F "source_type=pdf"
   ```
   - Expected: Success response

2. **Test YouTube URL**:
   ```bash
   curl -X POST http://localhost:3000/api/upload \
     -F "source_type=youtube" \
     -F "source_url=https://youtube.com/watch?v=abc123"
   ```
   - Expected: Success, document created with source_url

3. **Test Validation**:
   ```bash
   # Missing URL for youtube type
   curl -X POST http://localhost:3000/api/upload \
     -F "source_type=youtube"
   ```
   - Expected: Error 'Source URL required'

4. **Verify Database**:
   ```sql
   SELECT id, source_type, source_url, processing_requested 
   FROM documents 
   ORDER BY created_at DESC 
   LIMIT 5;
   ```
   - Expected: New fields populated correctly

---

### MFP-012: Create Multi-Method Upload UI Component

**Priority**: Critical  
**Estimated Hours**: 10  
**Assignable To**: Frontend/Full-stack  
**Dependencies**: MFP-011

#### Description
Replace existing UploadZone component with tabbed interface supporting file upload, URL fetching, and content pasting. Includes smart URL detection and markdown processing options.

#### Files to Modify
- **MODIFY**: `/Users/topher/Code/rhizome-v2/src/components/library/UploadZone.tsx`

#### Implementation Details

**Component structure** (see PRP Task 4.2 for complete code):
```tsx
<Tabs value={activeTab}>
  <TabsList>
    <TabsTrigger value="file">Upload File</TabsTrigger>
    <TabsTrigger value="url">Fetch from URL</TabsTrigger>
    <TabsTrigger value="paste">Paste Content</TabsTrigger>
  </TabsList>
  
  <TabsContent value="file">
    {/* File upload with markdown processing options */}
  </TabsContent>
  
  <TabsContent value="url">
    {/* URL input with auto-detection */}
  </TabsContent>
  
  <TabsContent value="paste">
    {/* Textarea with optional source URL */}
  </TabsContent>
</Tabs>
```

**Key features**:
- Smart URL detection (YouTube vs web article)
- Markdown processing radio buttons (save as-is | clean with AI)
- File type detection (.pdf, .md, .txt)
- Loading states and error display
- Form validation before submission

**State management**:
```typescript
const [activeTab, setActiveTab] = useState<'file' | 'url' | 'paste'>('file')
const [selectedFile, setSelectedFile] = useState<File | null>(null)
const [markdownProcessing, setMarkdownProcessing] = useState<'asis' | 'clean'>('asis')
const [urlInput, setUrlInput] = useState('')
const [urlType, setUrlType] = useState<'youtube' | 'web' | null>(null)
const [pastedContent, setPastedContent] = useState('')
```

#### Acceptance Criteria

**Given** I open the upload interface  
**When** the component renders  
**Then** I see three tabs: Upload File, Fetch from URL, Paste Content

**Given** I select a .md file  
**When** the file is loaded  
**Then** radio buttons appear for markdown processing options

**Given** I paste a YouTube URL in URL tab  
**When** the input changes  
**Then** the interface detects it as YouTube automatically

**Given** I paste a regular URL  
**When** the input changes  
**Then** the interface detects it as web article

**Given** I paste content with timestamps  
**When** I provide an optional YouTube URL  
**Then** the system treats it as YouTube transcript

**Rule-Based Checklist**:
- [ ] All tabs render without errors
- [ ] File upload accepts .pdf, .md, .txt
- [ ] URL detection works for YouTube and web
- [ ] Markdown options only show for .md files
- [ ] Loading states prevent duplicate submissions
- [ ] Error messages display clearly
- [ ] Form resets after successful submission

#### Manual Testing Steps

1. **Test File Upload Tab**:
   - Drag PDF → verify upload button appears
   - Select .md file → verify radio buttons appear
   - Click upload → verify success/error handling

2. **Test URL Tab**:
   - Paste YouTube URL → verify detection shows "YouTube video"
   - Paste article URL → verify detection shows "Web article"
   - Submit → verify processing starts

3. **Test Paste Tab**:
   - Paste long text → verify textarea works
   - Add optional URL → verify both fields submitted
   - Submit → verify processing starts

4. **Test Error Handling**:
   - Submit without content → verify validation error
   - Submit during upload → verify button disabled
   - Simulate server error → verify error message displays

---

### MFP-013: Update ProcessingDock with Format-Specific Messages

**Priority**: Medium  
**Estimated Hours**: 4  
**Assignable To**: Frontend/Full-stack  
**Dependencies**: MFP-010

#### Description
Enhance ProcessingDock to display format-specific substages and error messages with recovery actions. Show YouTube fetching, web extraction, and article cleaning stages.

#### Files to Modify
- **MODIFY**: `/Users/topher/Code/rhizome-v2/src/components/layout/ProcessingDock.tsx`

#### Implementation Details

**Add substage mapping** (around line 22):
```typescript
const SUBSTAGE_MESSAGES: Record<string, string> = {
  // YouTube
  'fetching': 'Fetching YouTube transcript...',
  
  // Web extraction
  'extracting': 'Extracting article content...',
  'cleaning': 'Cleaning content with AI...',
  
  // Markdown
  'reading': 'Reading file...',
  'formatting': 'Converting to markdown...',
  
  // Common
  'chunking': 'Creating semantic chunks...',
  'embedding': 'Generating embeddings...'
}
```

**Update progress display** (around line 45):
```tsx
<div className="text-sm">
  {job.progress?.substage 
    ? SUBSTAGE_MESSAGES[job.progress.substage] || job.progress.stage
    : job.progress?.stage || 'Processing...'
  }
</div>
```

**Add error recovery UI** (around line 60):
```tsx
{job.status === 'failed' && job.error_type && (
  <div className="mt-2 p-3 bg-destructive/10 rounded">
    <p className="text-sm text-destructive">{job.error_message}</p>
    
    {job.error_type === 'paywall' && (
      <Button
        variant="link"
        size="sm"
        onClick={() => window.open('https://archive.ph/', '_blank')}
      >
        Try archive.ph →
      </Button>
    )}
    
    {job.error_type === 'permanent' && job.error_message.includes('TRANSCRIPT_DISABLED') && (
      <Button
        variant="link"
        size="sm"
        onClick={() => setActiveTab('paste')}
      >
        Paste transcript manually →
      </Button>
    )}
  </div>
)}
```

#### Acceptance Criteria

**Given** a YouTube video is processing  
**When** the dock displays progress  
**Then** it shows "Fetching YouTube transcript..." during fetch stage

**Given** a web article is processing  
**When** the extraction stage runs  
**Then** it shows "Extracting article content..."

**Given** processing fails with paywall error  
**When** the dock displays error  
**Then** it shows button to open archive.ph

**Given** YouTube transcript is disabled  
**When** the dock displays error  
**Then** it shows button to switch to paste tab

**Rule-Based Checklist**:
- [ ] All substage messages mapped
- [ ] Error recovery actions for each error type
- [ ] UI responsive to job status changes
- [ ] Links open in new tab
- [ ] Buttons styled consistently with design system

#### Manual Testing Steps

1. **Test YouTube Processing**:
   - Upload YouTube URL
   - Watch ProcessingDock
   - Verify "Fetching YouTube transcript..." appears

2. **Test Web Article Processing**:
   - Upload article URL
   - Watch ProcessingDock
   - Verify "Extracting article content..." appears

3. **Test Paywall Error**:
   - Upload paywalled article URL
   - Wait for failure
   - Verify archive.ph button appears and works

4. **Test Transcript Disabled Error**:
   - Upload YouTube URL with disabled transcripts
   - Wait for failure
   - Verify "Paste transcript manually" button appears

---

## Phase 5: Testing & Validation

**Objective**: Comprehensive testing of all input methods and edge cases  
**Duration**: 24 hours  
**Dependencies**: Phase 4 complete  
**Risk Level**: Low (validation phase)

---

### MFP-014: Create Integration Tests for Worker Handlers

**Priority**: High  
**Estimated Hours**: 8  
**Assignable To**: Backend/Full-stack  
**Dependencies**: MFP-008, MFP-009, MFP-010

#### Description
Create integration tests that mock external APIs and test complete processing flows for all 6 source types. Tests should verify database operations, storage, and error handling.

#### Files to Create
- **CREATE**: `/Users/topher/Code/rhizome-v2/worker/__tests__/multi-format-integration.test.ts`

#### Implementation Details

**Test structure**:
```typescript
describe('Multi-format document processing', () => {
  beforeEach(() => {
    // Mock Supabase client
    // Mock Gemini AI client
    // Mock external APIs (YouTube, axios)
  })
  
  describe('YouTube processing', () => {
    it('fetches transcript and stores with timestamps', async () => {
      // Mock YouTube transcript response
      // Process job
      // Verify chunks created with timestamps JSONB
    })
    
    it('handles disabled transcripts gracefully', async () => {
      // Mock disabled transcript error
      // Process job
      // Verify error_type = 'permanent'
    })
  })
  
  describe('Web article processing', () => {
    it('extracts article and cleans with AI', async () => {
      // Mock axios response
      // Mock Readability extraction
      // Process job
      // Verify markdown saved to storage
    })
    
    it('handles 404 errors', async () => {
      // Mock 404 response
      // Process job
      // Verify error_type and message
    })
  })
  
  describe('Markdown processing', () => {
    it('chunks by headings without AI (save-as-is)', async () => {
      // Mock storage download
      // Process job with processing_requested=false
      // Verify no AI calls made
      // Verify chunks created by headings
    })
    
    it('cleans with AI (clean mode)', async () => {
      // Mock storage download
      // Process job with processing_requested=true
      // Verify AI cleanup called
      // Verify semantic chunks created
    })
  })
  
  // Similar test suites for txt and paste types
})
```

**Mocking strategy**:
- Mock `createClient` from Supabase
- Mock `GoogleGenAI` from @google/genai
- Mock `fetchTranscript` from youtube-transcript-plus
- Mock `axios.get` for web extraction

#### Acceptance Criteria

**Given** I run the integration test suite  
**When** all tests execute  
**Then** 100% pass with no flaky tests

**Given** I test each source type  
**When** processing completes  
**Then** database operations verified (documents, chunks, jobs)

**Given** I test error scenarios  
**When** errors occur  
**Then** error classification and messages validated

**Given** I run tests with coverage  
**When** report generates  
**Then** worker handler has >85% coverage

**Rule-Based Checklist**:
- [ ] All 6 source types have integration tests
- [ ] External APIs properly mocked
- [ ] Database operations verified with assertions
- [ ] Error scenarios test all error types
- [ ] Tests are isolated (no side effects)
- [ ] Tests clean up resources after execution

#### Manual Testing Steps

1. **Run Integration Tests**:
   ```bash
   npm test worker/__tests__/multi-format-integration.test.ts
   ```
   - Expected: All tests pass

2. **Run with Coverage**:
   ```bash
   npm test -- --coverage worker/handlers/process-document.ts
   ```
   - Expected: >85% coverage

3. **Test Isolation**:
   ```bash
   # Run tests multiple times
   npm test worker/__tests__/multi-format-integration.test.ts -- --runInBand
   ```
   - Expected: Same results every time (no flakiness)

4. **Verify Mocks**:
   - Check no real API calls during tests
   - Verify mock functions called with correct arguments
   - Confirm mock cleanup between tests

---

### MFP-015: Manual Testing Plan - All Input Methods

**Priority**: Critical  
**Estimated Hours**: 8  
**Assignable To**: Full-stack/QA  
**Dependencies**: MFP-012, MFP-013

#### Description
Execute comprehensive manual testing for all 6 input methods with real content. Document results, edge cases, and any issues discovered.

#### Files to Create
- **CREATE**: `/Users/topher/Code/rhizome-v2/docs/testing/multi-format-manual-tests.md`

#### Implementation Details

**Test Matrix**:

| Source Type | Test Case | Expected Result | Status |
|------------|-----------|-----------------|--------|
| PDF | Upload 5-page research paper | Processed in <2min, chunks created | [ ] |
| Markdown (as-is) | Upload markdown with headings | Chunked by headings, no AI | [ ] |
| Markdown (clean) | Upload messy markdown | Cleaned with AI, semantic chunks | [ ] |
| Text | Upload .txt file | Converted to markdown, chunked | [ ] |
| YouTube | Valid URL with transcript | Transcript fetched, timestamps preserved | [ ] |
| YouTube | Disabled transcript | Error with paste suggestion | [ ] |
| Web URL | News article | Content extracted, no ads | [ ] |
| Web URL | Paywalled article | Error with archive.ph suggestion | [ ] |
| Paste | YouTube transcript | Detected timestamps, processed | [ ] |
| Paste | Generic text | Formatted to markdown | [ ] |

**Test procedure for each**:
1. Prepare test content
2. Upload through UI
3. Monitor ProcessingDock for progress
4. Verify document appears in library
5. Open reader and spot-check content quality
6. Query database to verify chunks and metadata

**Edge cases to test**:
- Very long documents (>100 pages)
- Multiple uploads simultaneously
- Network interruption during processing
- Invalid URLs (malformed, non-existent)
- Empty content submissions
- Special characters in titles/content

#### Acceptance Criteria

**Given** I test all 6 input methods  
**When** processing completes  
**Then** success rate >95% for valid inputs

**Given** I upload a YouTube video  
**When** I open in reader  
**Then** timestamps are clickable and link to video

**Given** I upload a web article  
**When** I read the content  
**Then** no ads, navigation, or boilerplate present

**Given** I test error cases  
**When** errors occur  
**Then** user-friendly messages appear with recovery actions

**Rule-Based Checklist**:
- [ ] All 10+ test cases executed
- [ ] Results documented in testing markdown file
- [ ] Edge cases tested and documented
- [ ] Performance measured (<2min per document)
- [ ] Quality assessed (content accuracy, formatting)
- [ ] Bugs filed for any issues discovered

#### Manual Testing Steps

1. **Prepare Test Content**:
   - Download sample PDF
   - Create test markdown files (clean and messy)
   - Find YouTube video with transcript
   - Find news article URL
   - Prepare text snippets

2. **Execute Test Matrix**:
   ```bash
   # For each source type:
   # 1. Upload through UI
   # 2. Watch processing
   # 3. Verify success
   # 4. Document results
   ```

3. **Test Edge Cases**:
   - Upload 10 documents simultaneously
   - Try malformed URLs
   - Submit empty forms
   - Test with slow network (throttling)

4. **Document Findings**:
   ```markdown
   # Test Results
   
   ## PDF Upload
   - Status: ✅ Pass
   - Time: 1m 23s
   - Quality: Excellent
   - Issues: None
   
   ## YouTube URL
   - Status: ✅ Pass
   - Time: 45s
   - Timestamps: Working
   - Issues: None
   
   ...
   ```

---

### MFP-016: Performance & Cost Validation

**Priority**: High  
**Estimated Hours**: 4  
**Assignable To**: Backend/Full-stack  
**Dependencies**: MFP-015

#### Description
Measure and validate processing performance and API costs against success criteria: <2 minutes processing time and <$0.05 per document cost.

#### Files to Create
- **CREATE**: `/Users/topher/Code/rhizome-v2/docs/testing/performance-validation.md`

#### Implementation Details

**Performance Metrics to Track**:
```typescript
// Add instrumentation to worker
const startTime = Date.now()

// Track stage durations
const timings = {
  download: 0,
  extract: 0,
  chunk: 0,
  embed: 0,
  save: 0
}

// Log at each stage
console.log(`Stage ${stage} completed in ${duration}ms`)

// Final summary
const totalTime = Date.now() - startTime
console.log(`Total processing time: ${totalTime}ms`)
```

**Cost Tracking**:
- Gemini API calls per document type
- Token usage per API call
- Calculate cost based on pricing: https://ai.google.dev/pricing
- Embedding API cost per chunk

**Baseline measurements**:
| Source Type | Avg Time | API Calls | Est. Cost |
|------------|----------|-----------|-----------|
| PDF (10 pages) | ? | 1 extract + 1 rechunk + N embeds | ? |
| YouTube (10min) | ? | 1 rechunk + N embeds | ? |
| Web article | ? | 1 cleanup + 1 rechunk + N embeds | ? |
| Markdown (clean) | ? | 1 cleanup + 1 rechunk + N embeds | ? |
| Markdown (as-is) | ? | 0 AI + N embeds | ? |
| Text file | ? | 1 format + 1 rechunk + N embeds | ? |

#### Acceptance Criteria

**Given** I process documents of various types  
**When** I measure processing time  
**Then** 95% complete in <2 minutes

**Given** I calculate API costs  
**When** I sum all Gemini API calls  
**Then** average cost per document <$0.05

**Given** I identify slow operations  
**When** I review timing logs  
**Then** bottlenecks are documented for future optimization

**Rule-Based Checklist**:
- [ ] Timing instrumentation added to worker
- [ ] 10+ documents processed per type for averages
- [ ] API token usage tracked
- [ ] Costs calculated per document type
- [ ] Results compared to success criteria
- [ ] Optimization recommendations documented

#### Manual Testing Steps

1. **Add Performance Logging**:
   ```typescript
   // In worker handler, add timing logs
   console.log(`[PERF] Stage ${stage}: ${duration}ms`)
   console.log(`[PERF] Total: ${totalTime}ms`)
   console.log(`[COST] API calls: ${apiCallCount}, Tokens: ${tokenCount}`)
   ```

2. **Process Test Documents**:
   ```bash
   # Process 10+ documents per type
   # Collect logs with timing data
   grep "\[PERF\]" worker.log > perf-results.txt
   grep "\[COST\]" worker.log > cost-results.txt
   ```

3. **Analyze Results**:
   ```bash
   # Calculate averages
   # Identify outliers
   # Check against <2min and <$0.05 targets
   ```

4. **Create Report**:
   ```markdown
   # Performance Validation Report
   
   ## Processing Time
   - PDF (10 pages): 1m 23s ✅
   - YouTube (10min): 45s ✅
   - Web article: 2m 15s ⚠️ (exceeds target)
   
   ## Cost Analysis
   - PDF: $0.032 ✅
   - YouTube: $0.018 ✅
   - Web article: $0.041 ✅
   
   ## Recommendations
   - Optimize web extraction timeout
   - Consider caching for repeated URLs
   ```

---

### MFP-017: Update Documentation

**Priority**: Medium  
**Estimated Hours**: 4  
**Assignable To**: Full-stack  
**Dependencies**: MFP-015, MFP-016

#### Description
Update project documentation to reflect new multi-format capabilities. Update README, CLAUDE.md, and create user guide for new features.

#### Files to Modify/Create
- **MODIFY**: `/Users/topher/Code/rhizome-v2/README.md`
- **MODIFY**: `/Users/topher/Code/rhizome-v2/CLAUDE.md`
- **CREATE**: `/Users/topher/Code/rhizome-v2/docs/USER_GUIDE.md`

#### Implementation Details

**README.md updates**:
```markdown
## Features

- **Multi-Format Document Processing**
  - PDF uploads via Gemini Files API
  - Markdown files (save as-is or clean with AI)
  - Plain text conversion to markdown
  - YouTube video transcripts with clickable timestamps
  - Web article extraction (no ads/navigation)
  - Direct content pasting

## Supported Sources

1. **PDF Documents**: Academic papers, books, reports
2. **Markdown Files**: Technical docs, notes (optional AI cleaning)
3. **Text Files**: Plain text converted to structured markdown
4. **YouTube Videos**: Auto-fetch transcripts with timestamp preservation
5. **Web Articles**: Clean extraction from news sites, blogs
6. **Pasted Content**: Any text content with optional source attribution
```

**CLAUDE.md updates**:
```markdown
## Document Processing - CRITICAL

### Multi-Format Support
Rhizome now supports 6 input methods. Processing routes by `source_type`:

- `pdf`: Gemini Files API (existing)
- `youtube`: youtube-transcript-plus library
- `web_url`: jsdom + Readability extraction
- `markdown_asis`: Heading-based chunking, no AI
- `markdown_clean`: AI cleanup + semantic chunking
- `txt`: Convert to markdown with AI
- `paste`: Generic text processing

### Processing Patterns
See `/Users/topher/Code/rhizome-v2/worker/handlers/process-document.ts` for routing logic.
See `/Users/topher/Code/rhizome-v2/worker/lib/` for utility functions.
```

**USER_GUIDE.md creation**:
```markdown
# Rhizome V2 User Guide

## Adding Content

### Upload Files
1. Click "Upload File" tab
2. Drag & drop or browse for:
   - PDF documents
   - Markdown files (.md)
   - Text files (.txt)
3. For markdown: Choose "Save as-is" or "Clean with AI"
4. Click Upload

### Fetch from URLs
1. Click "Fetch from URL" tab
2. Paste YouTube video URL or web article URL
3. System auto-detects type
4. Click Fetch

### Paste Content
1. Click "Paste Content" tab
2. Paste your content
3. Optionally add source URL
4. Click Submit

## YouTube Videos
- Transcripts automatically fetched
- Timestamps preserved and clickable
- Click timestamp to jump to that moment in video
- If transcript disabled, paste manually

## Web Articles
- Content extracted without ads/navigation
- Formatted as clean markdown
- Paywalled? Try archive.ph for archived version
```

#### Acceptance Criteria

**Given** I read the README  
**When** I look for supported formats  
**Then** all 6 input methods are clearly listed

**Given** I read CLAUDE.md  
**When** I look for processing guidance  
**Then** routing logic and utility functions are documented

**Given** I read USER_GUIDE.md  
**When** I want to upload content  
**Then** step-by-step instructions are provided for each method

**Rule-Based Checklist**:
- [ ] README updated with feature list
- [ ] CLAUDE.md updated with processing patterns
- [ ] USER_GUIDE.md created with usage instructions
- [ ] All 6 input methods documented
- [ ] Error handling guidance included
- [ ] Screenshots or examples provided (optional)

#### Manual Testing Steps

1. **Review README**:
   - Open README.md
   - Verify features section updated
   - Check supported sources listed

2. **Review CLAUDE.md**:
   - Open CLAUDE.md
   - Find document processing section
   - Verify routing patterns documented

3. **Review USER_GUIDE.md**:
   - Open USER_GUIDE.md
   - Follow instructions for each method
   - Verify clarity and completeness

4. **Get Peer Review**:
   - Share with team member
   - Ask for feedback on clarity
   - Update based on feedback

---

## Critical Path Analysis

### Sequential Dependencies (Cannot Parallelize)

**Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 5**

```
MFP-001 (DB Migration) ────┐
MFP-002 (Install Libs)     ├──→ MFP-003 (Types) ────┐
                           │                         │
                           └─────────────────────────┤
                                                     │
MFP-004 (YouTube Utils) ─────────────────────────┐  │
MFP-005 (Web Utils) ─────────────────────────────┤  │
MFP-006 (Markdown Utils) ────────────────────────┤  │
                                                 │  │
MFP-007 (Unit Tests) ←───────────────────────────┘  │
                                                     │
                                                     ↓
MFP-008 (Worker Routing) ←───────────────────────────┘
                │
                ├──→ MFP-009 (Timestamp Storage)
                └──→ MFP-010 (Error Handling)
                        │
                        ↓
                MFP-011 (Server Action) ──→ MFP-012 (Upload UI)
                                       │
                                       ├──→ MFP-013 (ProcessingDock)
                                       │
                                       ↓
                                MFP-014 (Integration Tests)
                                       │
                                       ├──→ MFP-015 (Manual Testing)
                                       │
                                       ├──→ MFP-016 (Performance)
                                       │
                                       └──→ MFP-017 (Documentation)
```

### Critical Path Tasks (Cannot Be Delayed)

1. **MFP-001** (4h) - Database migration blocks all work
2. **MFP-002** (2h) - Library installation required for utilities
3. **MFP-003** (6h) - Types needed for all subsequent code
4. **MFP-004/005/006** (22h combined) - Utilities required for integration
5. **MFP-008** (8h) - Worker routing integration point
6. **MFP-011** (6h) - Server action required for UI
7. **MFP-012** (10h) - UI component required for testing

**Total Critical Path**: 58 hours (7.25 days at 8 hours/day)

### Parallelization Opportunities

**Phase 2 (Utilities)**:
- MFP-004, MFP-005, MFP-006 can be built in parallel (3 developers)
- Reduces 22 hours to ~8 hours wall-clock time

**Phase 3 (Worker Integration)**:
- MFP-009 and MFP-010 can run parallel after MFP-008 (2 developers)
- Reduces 12 hours to ~6 hours wall-clock time

**Phase 4 (UI)**:
- MFP-012 and MFP-013 can run parallel after MFP-011 (2 developers)
- Reduces 14 hours to ~10 hours wall-clock time

**Phase 5 (Testing)**:
- MFP-015, MFP-016, MFP-017 can run parallel after MFP-014 (3 developers)
- Reduces 16 hours to ~8 hours wall-clock time

### Optimized Schedule (3 Developers)

| Day | Developer 1 | Developer 2 | Developer 3 | Wall-Clock Hours |
|-----|------------|-------------|-------------|------------------|
| 1 | MFP-001, MFP-002, MFP-003 | - | - | 12h |
| 2 | MFP-004 (YouTube) | MFP-005 (Web) | MFP-006 (Markdown) | 8h |
| 3 | MFP-007 (Tests) | MFP-008 (Routing) | - | 8h |
| 4 | MFP-009 (Timestamps) | MFP-010 (Errors) | MFP-011 (Server Action) | 8h |
| 5 | MFP-012 (Upload UI) | MFP-013 (ProcessingDock) | - | 10h |
| 6 | MFP-014 (Integration Tests) | - | - | 8h |
| 7 | MFP-015 (Manual) | MFP-016 (Performance) | MFP-017 (Docs) | 8h |

**Total Wall-Clock Time**: ~62 hours (~8 days)

### Risk Factors

**High Risk**:
- **MFP-004**: YouTube API rate limits during development
- **MFP-005**: Web extraction quality varies by site
- **MFP-008**: Complex refactoring with regression potential

**Medium Risk**:
- **MFP-012**: UI complexity may exceed estimate
- **MFP-015**: Manual testing may reveal unexpected issues

**Mitigation Strategies**:
- Use test YouTube videos known to have transcripts
- Test web extraction on diverse sites early
- Create comprehensive unit tests before integration
- Allocate buffer time for UI polish
- Start manual testing early in parallel with development

---

## Implementation Recommendations

### Team Structure

**Optimal**: 2-3 full-stack developers

**Role Allocation**:
- **Developer 1 (Backend Focus)**: MFP-001 through MFP-008, MFP-014
- **Developer 2 (Backend/Worker)**: MFP-004, MFP-005, MFP-006, MFP-009, MFP-010
- **Developer 3 (Frontend Focus)**: MFP-011 through MFP-013, MFP-015, MFP-017

### Task Sequencing Strategy

**Week 1 (Foundation)**:
- Days 1-2: Phase 1 (Database & Dependencies)
- Days 3-5: Phase 2 (Worker Utilities)

**Week 2 (Integration & UI)**:
- Days 1-2: Phase 3 (Worker Handler Integration)
- Days 3-4: Phase 4 (UI & Server Actions)
- Day 5: Phase 5 (Testing & Validation)

### Quality Gates

**After Phase 2**:
- [ ] All unit tests passing
- [ ] TypeScript compiles without errors
- [ ] Code review completed for utilities

**After Phase 3**:
- [ ] Worker processes all 6 types successfully
- [ ] Error handling validates for all error types
- [ ] Integration tests passing

**After Phase 4**:
- [ ] UI renders without errors
- [ ] All 6 input methods functional
- [ ] Error messages display correctly

**After Phase 5**:
- [ ] Manual testing complete for all types
- [ ] Performance targets met (<2min, <$0.05)
- [ ] Documentation updated

### Resource Allocation

**API Keys Required**:
- Google AI API key (Gemini) - already have
- No YouTube API key needed (using transcript library)

**Test Resources**:
- Sample PDFs (5-10 pages)
- Sample markdown files (clean and messy)
- Sample text files
- List of test YouTube URLs with transcripts
- List of test web article URLs
- Test paywalled URLs for error handling

**Infrastructure**:
- Supabase project (existing)
- Worker environment (existing)
- Local development setup (existing)

---

## Success Metrics

### Functional Metrics
- [ ] All 6 input methods working
- [ ] >95% success rate for valid inputs
- [ ] YouTube timestamps clickable
- [ ] Web articles clean (no ads/nav)
- [ ] Error messages user-friendly

### Performance Metrics
- [ ] Processing time <2 minutes per document
- [ ] API cost <$0.05 per document
- [ ] Worker handles 10+ concurrent jobs

### Quality Metrics
- [ ] Unit test coverage >90%
- [ ] Integration test coverage >85%
- [ ] Zero TypeScript errors
- [ ] Zero ESLint warnings

### User Experience Metrics
- [ ] Clear upload interface
- [ ] Real-time progress updates
- [ ] Helpful error recovery actions
- [ ] Consistent UI patterns across all methods

---

## Appendix: Task Summary Table

| Task ID | Name | Priority | Hours | Phase | Dependencies | Assignable To |
|---------|------|----------|-------|-------|--------------|---------------|
| MFP-001 | Database Migration | Critical | 4 | 1 | None | Backend |
| MFP-002 | Install Libraries | Critical | 2 | 1 | None | Backend |
| MFP-003 | TypeScript Types | High | 6 | 1 | MFP-002 | Backend |
| MFP-004 | YouTube Utils | High | 8 | 2 | MFP-002, MFP-003 | Backend |
| MFP-005 | Web Extraction Utils | High | 8 | 2 | MFP-002, MFP-003 | Backend |
| MFP-006 | Markdown Chunking Utils | High | 6 | 2 | MFP-003 | Backend |
| MFP-007 | Unit Tests | Medium | 6 | 2 | MFP-004, MFP-005, MFP-006 | Backend |
| MFP-008 | Worker Routing | Critical | 8 | 3 | MFP-004, MFP-005, MFP-006 | Backend |
| MFP-009 | Timestamp Storage | High | 6 | 3 | MFP-008 | Backend |
| MFP-010 | Error Handling | Medium | 6 | 3 | MFP-008 | Backend |
| MFP-011 | Server Action | Critical | 6 | 4 | MFP-001 | Full-stack |
| MFP-012 | Upload UI | Critical | 10 | 4 | MFP-011 | Frontend |
| MFP-013 | ProcessingDock | Medium | 4 | 4 | MFP-010 | Frontend |
| MFP-014 | Integration Tests | High | 8 | 5 | MFP-008, MFP-009, MFP-010 | Backend |
| MFP-015 | Manual Testing | Critical | 8 | 5 | MFP-012, MFP-013 | Full-stack |
| MFP-016 | Performance Validation | High | 4 | 5 | MFP-015 | Backend |
| MFP-017 | Documentation | Medium | 4 | 5 | MFP-015, MFP-016 | Full-stack |

**Total Estimated Hours**: 100 hours  
**Total Calendar Time**: 2 weeks with 3 developers

---

## Change Log

| Date | Version | Changes | Author |
|------|---------|---------|--------|
| 2025-09-27 | 1.0 | Initial task breakdown created from PRP | Technical Lead |

---

**Document Status**: Ready for Implementation  
**Next Action**: Begin MFP-001 (Database Migration)  
**Review Date**: After Phase 2 completion for progress check