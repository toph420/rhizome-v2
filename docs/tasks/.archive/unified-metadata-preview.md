# Task Breakdown: Unified Metadata Preview for All Document Types

**Generated**: 2025-10-03
**Source PRP**: `/docs/prps/unified-metadata-preview.md`
**Total Estimated Time**: 3 hours
**Phases**: 7
**Total Tasks**: 18

## Executive Summary

This task breakdown implements the Unified Metadata Preview feature, extending the existing PDF metadata preview functionality to all 6 supported document types (PDF, EPUB, Markdown, Text, YouTube, Web URL). The implementation follows a proven pattern replication approach with minimal risk.

### Complexity Assessment
- **Overall Complexity**: Moderate
- **Technical Challenges**: ESM imports in API routes, YouTube API quota management
- **Integration Points**: UploadZone routing, worker job input_data, Supabase storage
- **Risk Level**: Low (pattern already proven with PDF implementation)

### Phase Organization

| Phase | Name | Duration | Tasks | Deliverables |
|-------|------|----------|-------|--------------|
| 1 | Foundation | 10 min | 2 | Shared types, refactored PDF API |
| 2 | EPUB API | 20 min | 2 | EPUB metadata extraction endpoint |
| 3 | Text/Markdown API | 30 min | 2 | Hybrid extraction (frontmatter + AI) |
| 4 | YouTube API | 30 min | 2 | YouTube Data API integration |
| 5 | UploadZone Routing | 30 min | 3 | UI routing logic for all types |
| 6 | Upload Actions | 30 min | 3 | Enhanced upload with metadata |
| 7 | Integration Testing | 30 min | 4 | End-to-end validation |

---

## Phase 1: Foundation (10 minutes)

### Task T-001: Create Shared Type System

**Task Name**: Create Shared Metadata Types
**Priority**: Critical
**Estimated Time**: 5 minutes

#### Context & Background
**Source PRP**: docs/prps/unified-metadata-preview.md (Section 3.1)
**Purpose**: Centralize type definitions to prevent duplication across APIs and components.

#### Dependencies
- **Prerequisite Tasks**: None (Phase 1 start)
- **Parallel Tasks**: None
- **Integration Points**: All API routes, UploadZone, DocumentPreview, upload actions

#### Technical Requirements
- Create new file `src/types/metadata.ts`
- Define `DocumentType` union type
- Define `DetectedMetadata` interface
- Implement `base64ToBlob()` utility function

#### Implementation Details

**Files to Create**:
```
└── src/types/metadata.ts - Shared type definitions and utilities
```

**Code Pattern to Implement**:
```typescript
// Reference: src/app/api/extract-metadata/route.ts:7-22
// Extract existing types and enhance with new requirements
export type DocumentType =
  | 'fiction'
  | 'nonfiction_book'
  | 'academic_paper'
  | 'technical_manual'
  | 'article'
  | 'essay'
```

#### Acceptance Criteria

**Given-When-Then**:
```gherkin
Given the shared types file is created
When importing from '@/types/metadata'
Then TypeScript compilation succeeds
And all type exports are available
And base64ToBlob function works correctly
```

**Checklist**:
- [ ] File created at correct location
- [ ] All 6 document types defined
- [ ] DetectedMetadata interface complete
- [ ] base64ToBlob handles data URIs
- [ ] TypeScript compilation passes
- [ ] No circular dependencies

#### Manual Testing Steps
1. Run `npm run lint` to verify TypeScript
2. Import types in a test file
3. Verify IntelliSense shows all exports

#### Validation
```bash
npm run lint
npx tsc --noEmit
```

---

### Task T-002: Refactor PDF API to Use Shared Types

**Task Name**: Refactor PDF Metadata API
**Priority**: Critical
**Estimated Time**: 5 minutes

#### Context & Background
**Source PRP**: docs/prps/unified-metadata-preview.md (Section 3.1)
**Purpose**: Update existing PDF API to use shared types, ensuring consistency.

#### Dependencies
- **Prerequisite Tasks**: T-001 (shared types must exist)
- **Parallel Tasks**: None
- **Integration Points**: PDF upload flow

#### Technical Requirements
- Update imports in `src/app/api/extract-metadata/route.ts`
- Remove local type definitions (lines 7-22)
- Import from shared types module
- Verify no breaking changes

#### Implementation Details

**Files to Modify**:
```
└── src/app/api/extract-metadata/route.ts - Remove local types, use shared
```

**Key Changes**:
```typescript
// Remove lines 7-22 (local type definitions)
// Add at top:
import type { DetectedMetadata, DocumentType } from '@/types/metadata'
```

#### Acceptance Criteria

**Given-When-Then**:
```gherkin
Given the PDF API is refactored
When uploading a PDF file
Then metadata extraction still works
And the response matches DetectedMetadata interface
And no regression in existing functionality
```

**Checklist**:
- [ ] Local types removed
- [ ] Shared types imported
- [ ] PDF upload flow tested
- [ ] No TypeScript errors
- [ ] Response structure unchanged

#### Manual Testing Steps
1. Start dev server
2. Upload a test PDF
3. Verify metadata preview appears
4. Check console for errors
5. Confirm processing completes

#### Validation
```bash
# Test PDF upload
curl -X POST http://localhost:3000/api/extract-metadata \
  -F "file=@test-files/sample.pdf"
```

---

## Phase 2: EPUB API (20 minutes)

### Task T-003: Create EPUB Metadata Extraction Endpoint

**Task Name**: Implement EPUB Metadata API
**Priority**: High
**Estimated Time**: 15 minutes

#### Context & Background
**Source PRP**: docs/prps/unified-metadata-preview.md (Section 3.2)
**Purpose**: Enable EPUB metadata extraction using existing worker parser, including cover image extraction.

#### Dependencies
- **Prerequisite Tasks**: T-001, T-002 (shared types)
- **Parallel Tasks**: T-005 (can start Text API simultaneously)
- **Integration Points**: worker/lib/epub/epub-parser

#### Technical Requirements
- Create `/src/app/api/extract-epub-metadata/route.ts`
- Import parseEPUB from worker module
- Handle three cover extraction strategies
- Implement type inference logic
- Return base64-encoded cover images

#### Implementation Details

**Files to Create**:
```
└── src/app/api/extract-epub-metadata/route.ts - EPUB metadata extraction
```

**Code Patterns**:
- **Similar Pattern**: `src/app/api/extract-metadata/route.ts` - API structure
- **Parser Import**: `worker/lib/epub/epub-parser.ts:parseEPUB` - extraction logic
- **Cover Extraction**: `worker/lib/epub/epub-parser.ts:314-370` - three strategies

#### Acceptance Criteria

**Given-When-Then**:
```gherkin
Scenario 1: Valid EPUB with cover
  Given an EPUB file with embedded cover
  When POST to /api/extract-epub-metadata
  Then metadata is extracted in <100ms
  And cover image is returned as base64
  And document type is inferred correctly

Scenario 2: EPUB without cover
  Given an EPUB file without cover image
  When extraction is attempted
  Then metadata is returned without coverImage
  And no error occurs

Scenario 3: Corrupted EPUB
  Given a corrupted EPUB file
  When extraction is attempted
  Then 500 status with error message
  And error is logged to console
```

**Checklist**:
- [ ] API route created and accessible
- [ ] parseEPUB imported successfully
- [ ] Metadata extraction works
- [ ] Cover image base64 encoding
- [ ] Type inference logic works
- [ ] Error handling for invalid files
- [ ] Performance <100ms

#### Manual Testing Steps
1. Prepare test EPUB files (with/without cover)
2. Test via curl: `curl -X POST http://localhost:3000/api/extract-epub-metadata -F "file=@test.epub"`
3. Verify response structure matches DetectedMetadata
4. Check cover image displays in browser
5. Test with technical vs fiction EPUBs

#### Validation
```bash
# Performance test
time curl -X POST http://localhost:3000/api/extract-epub-metadata \
  -F "file=@test-files/technical.epub" | jq .title
```

---

### Task T-004: Validate EPUB Type Inference

**Task Name**: Test EPUB Document Type Detection
**Priority**: Medium
**Estimated Time**: 5 minutes

#### Context & Background
**Source PRP**: docs/prps/unified-metadata-preview.md (Section 3.2)
**Purpose**: Ensure EPUB type inference correctly identifies technical manuals, fiction, and academic content.

#### Dependencies
- **Prerequisite Tasks**: T-003 (EPUB API must exist)
- **Parallel Tasks**: T-006 (Text API testing)
- **Integration Points**: None

#### Technical Requirements
- Test with O'Reilly/Packt EPUBs → technical_manual
- Test with fiction novels → fiction
- Test with university press → academic_paper
- Verify fallback to fiction for unknown

#### Acceptance Criteria

**Given-When-Then**:
```gherkin
Given EPUBs from different publishers
When metadata is extracted
Then O'Reilly books return 'technical_manual'
And novels return 'fiction'
And textbooks return 'academic_paper'
And unknown publishers default to 'fiction'
```

**Checklist**:
- [ ] Technical publishers detected
- [ ] Academic publishers detected
- [ ] Fiction as default works
- [ ] Subject-based inference works

#### Manual Testing Steps
1. Test O'Reilly EPUB → expect technical_manual
2. Test fiction EPUB → expect fiction
3. Test academic EPUB → expect academic_paper
4. Verify inference logic in logs

---

## Phase 3: Text/Markdown API (30 minutes)

### Task T-005: Create Text/Markdown Metadata Extraction Endpoint

**Task Name**: Implement Hybrid Text Metadata API
**Priority**: High
**Estimated Time**: 20 minutes

#### Context & Background
**Source PRP**: docs/prps/unified-metadata-preview.md (Section 3.3)
**Purpose**: Extract metadata from text/markdown files using frontmatter (free) with AI fallback.

#### Dependencies
- **Prerequisite Tasks**: T-001, T-002 (shared types)
- **Parallel Tasks**: T-003 (EPUB API can run parallel)
- **Integration Points**: Vercel AI SDK, Gemini model

#### Technical Requirements
- Create `/src/app/api/extract-text-metadata/route.ts`
- Implement frontmatter regex parser
- Setup Zod schema for AI extraction
- Configure generateObject with Gemini
- Handle both .md and .txt files

#### Implementation Details

**Files to Create**:
```
└── src/app/api/extract-text-metadata/route.ts - Text/markdown extraction
```

**Code Patterns**:
```typescript
// Frontmatter regex
const match = content.match(/^---\n([\s\S]*?)\n---/)

// AI extraction with Vercel AI SDK
import { generateObject } from 'ai'
import { google } from '@ai-sdk/google'
```

#### Acceptance Criteria

**Given-When-Then**:
```gherkin
Scenario 1: Markdown with frontmatter
  Given markdown with valid YAML frontmatter
  When extraction is requested
  Then metadata extracted in <10ms
  And no AI calls are made
  And cost is $0

Scenario 2: Text without frontmatter
  Given plain text file
  When extraction is requested
  Then AI extraction is triggered
  And response in 2-3 seconds
  And cost is ~$0.001

Scenario 3: Malformed frontmatter
  Given markdown with invalid YAML
  When extraction is requested
  Then falls back to AI extraction
  And returns valid metadata
```

**Checklist**:
- [ ] Frontmatter parsing works
- [ ] AI fallback triggers correctly
- [ ] Zod schema validates output
- [ ] Both .md and .txt supported
- [ ] Error handling complete
- [ ] Performance targets met

#### Manual Testing Steps
1. Test with frontmatter markdown
2. Test without frontmatter
3. Test plain .txt file
4. Verify AI extraction quality
5. Check cost in logs

#### Validation
```bash
# Test frontmatter path (should be instant)
curl -X POST http://localhost:3000/api/extract-text-metadata \
  -F "file=@test-files/with-frontmatter.md"

# Test AI path (should take 2-3s)
curl -X POST http://localhost:3000/api/extract-text-metadata \
  -F "file=@test-files/plain.txt"
```

---

### Task T-006: Validate Frontmatter Parser Robustness

**Task Name**: Test Frontmatter Edge Cases
**Priority**: Medium
**Estimated Time**: 10 minutes

#### Context & Background
**Source PRP**: docs/prps/unified-metadata-preview.md (Section 3.3)
**Purpose**: Ensure frontmatter parser handles various YAML formats and edge cases gracefully.

#### Dependencies
- **Prerequisite Tasks**: T-005 (Text API must exist)
- **Parallel Tasks**: T-004 (EPUB testing)
- **Integration Points**: None

#### Technical Requirements
- Test Jekyll-style frontmatter
- Test Hugo-style frontmatter
- Test with quotes, without quotes
- Test missing required fields
- Test malformed YAML

#### Acceptance Criteria

**Given-When-Then**:
```gherkin
Given various frontmatter formats
When parsing is attempted
Then valid frontmatter extracts correctly
And invalid frontmatter triggers AI fallback
And no crashes occur
```

**Checklist**:
- [ ] Jekyll format works
- [ ] Hugo format works
- [ ] Quoted values handled
- [ ] Missing fields → AI fallback
- [ ] Malformed YAML → AI fallback
- [ ] No unhandled exceptions

#### Manual Testing Steps
1. Test standard frontmatter
2. Test with missing title
3. Test with special characters
4. Test with nested YAML (should fail gracefully)
5. Verify AI fallback in each failure case

---

## Phase 4: YouTube API (30 minutes)

### Task T-007: Create YouTube Metadata Extraction Endpoint

**Task Name**: Implement YouTube Data API Integration
**Priority**: High
**Estimated Time**: 20 minutes

#### Context & Background
**Source PRP**: docs/prps/unified-metadata-preview.md (Section 3.4)
**Purpose**: Extract video metadata using YouTube Data API v3 with quota management.

#### Dependencies
- **Prerequisite Tasks**: T-001, T-002 (shared types)
- **Parallel Tasks**: T-005 (Text API can run parallel)
- **Integration Points**: YouTube Data API v3

#### Technical Requirements
- Create `/src/app/api/extract-youtube-metadata/route.ts`
- Implement video ID extraction for multiple URL formats
- Integrate with YouTube Data API
- Handle quota errors (403 → 429)
- Select best available thumbnail

#### Implementation Details

**Files to Create**:
```
└── src/app/api/extract-youtube-metadata/route.ts - YouTube metadata extraction
```

**API Integration**:
```typescript
const url = new URL('https://www.googleapis.com/youtube/v3/videos')
url.searchParams.set('id', videoId)
url.searchParams.set('key', process.env.YOUTUBE_API_KEY)
url.searchParams.set('part', 'snippet')
```

#### Acceptance Criteria

**Given-When-Then**:
```gherkin
Scenario 1: Valid YouTube URL
  Given a valid YouTube video URL
  When metadata extraction is requested
  Then video title and channel returned
  And thumbnail URL provided
  And response in 1-2 seconds

Scenario 2: Quota exceeded
  Given YouTube API quota is exceeded
  When extraction is attempted
  Then 429 status returned
  And fallback flag is true
  And error message is clear

Scenario 3: Multiple URL formats
  Given various YouTube URL formats
  When video ID extraction runs
  Then watch URLs work
  And short URLs work
  And embed URLs work
```

**Checklist**:
- [ ] API key configured
- [ ] Video ID extraction works
- [ ] Metadata fetched correctly
- [ ] Thumbnail priority logic
- [ ] Quota error handling
- [ ] Private video handling
- [ ] Performance 1-2 seconds

#### Manual Testing Steps
1. Test standard watch URL
2. Test youtu.be short URL
3. Test embed URL
4. Test with private video (should error)
5. Test quota exceeded scenario

#### Validation
```bash
# Test various URL formats
curl -X POST http://localhost:3000/api/extract-youtube-metadata \
  -H "Content-Type: application/json" \
  -d '{"url":"https://www.youtube.com/watch?v=dQw4w9WgXcQ"}'

curl -X POST http://localhost:3000/api/extract-youtube-metadata \
  -H "Content-Type: application/json" \
  -d '{"url":"https://youtu.be/dQw4w9WgXcQ"}'
```

---

### Task T-008: Implement YouTube URL Format Support

**Task Name**: Support All YouTube URL Variants
**Priority**: Medium
**Estimated Time**: 10 minutes

#### Context & Background
**Source PRP**: docs/prps/unified-metadata-preview.md (Section 3.4)
**Purpose**: Ensure all common YouTube URL formats are supported for video ID extraction.

#### Dependencies
- **Prerequisite Tasks**: T-007 (YouTube API must exist)
- **Parallel Tasks**: None
- **Integration Points**: None

#### Technical Requirements
- Support youtube.com/watch?v=
- Support youtu.be/
- Support youtube.com/embed/
- Support youtube.com/v/
- Support youtube.com/shorts/

#### Acceptance Criteria

**Given-When-Then**:
```gherkin
Given different YouTube URL formats
When extractVideoId() is called
Then all formats extract ID correctly
And invalid URLs throw clear error
```

**Checklist**:
- [ ] Watch URLs work
- [ ] Short URLs work
- [ ] Embed URLs work
- [ ] Shorts URLs work
- [ ] Invalid URLs error clearly

#### Manual Testing Steps
1. Test each URL format
2. Verify correct ID extraction
3. Test invalid URLs
4. Check error messages

---

## Phase 5: UploadZone Routing (30 minutes)

### Task T-009: Implement File Type Routing Logic

**Task Name**: Add Metadata Endpoint Router
**Priority**: Critical
**Estimated Time**: 15 minutes

#### Context & Background
**Source PRP**: docs/prps/unified-metadata-preview.md (Section 3.5)
**Purpose**: Route different file types to appropriate metadata extraction endpoints.

#### Dependencies
- **Prerequisite Tasks**: T-003, T-005, T-007 (all APIs must exist)
- **Parallel Tasks**: None
- **Integration Points**: UploadZone component

#### Technical Requirements
- Add `getMetadataEndpoint()` helper function
- Update `handleFileSelect()` to use router
- Maintain backward compatibility with PDF
- Handle files without preview support

#### Implementation Details

**Files to Modify**:
```
└── src/components/library/UploadZone.tsx - Add routing logic (lines 73-113)
```

**Routing Logic**:
```typescript
function getMetadataEndpoint(file: File): string | null {
  if (file.type === 'application/pdf') return '/api/extract-metadata'
  if (file.type === 'application/epub+zip') return '/api/extract-epub-metadata'
  if (file.name.endsWith('.md')) return '/api/extract-text-metadata'
  // ... etc
}
```

#### Acceptance Criteria

**Given-When-Then**:
```gherkin
Scenario 1: PDF file upload
  Given a PDF file is selected
  When handleFileSelect runs
  Then routes to /api/extract-metadata
  And existing behavior preserved

Scenario 2: EPUB file upload
  Given an EPUB file is selected
  When handleFileSelect runs
  Then routes to /api/extract-epub-metadata
  And preview shows with metadata

Scenario 3: Unsupported file
  Given a file without metadata support
  When handleFileSelect runs
  Then no API call is made
  And upload proceeds directly
```

**Checklist**:
- [ ] Router function works
- [ ] All file types route correctly
- [ ] PDF flow unchanged
- [ ] Error handling preserved
- [ ] Preview phase triggered

#### Manual Testing Steps
1. Upload PDF → verify existing flow
2. Upload EPUB → verify new flow
3. Upload Markdown → verify routing
4. Upload Text → verify routing
5. Check console for routing logs

---

### Task T-010: Add YouTube URL Handler

**Task Name**: Implement YouTube URL Processing
**Priority**: High
**Estimated Time**: 10 minutes

#### Context & Background
**Source PRP**: docs/prps/unified-metadata-preview.md (Section 3.5)
**Purpose**: Handle YouTube URLs separately from file uploads in the URL tab.

#### Dependencies
- **Prerequisite Tasks**: T-007, T-009 (YouTube API and routing)
- **Parallel Tasks**: None
- **Integration Points**: URL input tab

#### Technical Requirements
- Create `handleYouTubeUrl()` function
- Integrate with URL tab
- Handle quota exceeded gracefully
- Show loading states

#### Implementation Details

**Files to Modify**:
```
└── src/components/library/UploadZone.tsx - Add YouTube handler (~line 350)
```

#### Acceptance Criteria

**Given-When-Then**:
```gherkin
Given a YouTube URL is entered
When processing is triggered
Then metadata is fetched
And preview shows with thumbnail
And quota errors handled gracefully
```

**Checklist**:
- [ ] URL handler created
- [ ] Integration with URL tab
- [ ] Loading states work
- [ ] Error messages clear
- [ ] Quota handling works

#### Manual Testing Steps
1. Enter YouTube URL
2. Verify metadata fetch
3. Check thumbnail display
4. Test quota error scenario
5. Verify fallback behavior

---

### Task T-011: Test All Upload Paths

**Task Name**: Validate Complete Routing System
**Priority**: High
**Estimated Time**: 5 minutes

#### Context & Background
**Source PRP**: docs/prps/unified-metadata-preview.md (Section 3.5)
**Purpose**: Ensure all file types and URL inputs route correctly through the system.

#### Dependencies
- **Prerequisite Tasks**: T-009, T-010 (routing implementation)
- **Parallel Tasks**: None
- **Integration Points**: All upload paths

#### Technical Requirements
- Test all 6 source types
- Verify routing decisions
- Check error fallbacks
- Validate loading states

#### Acceptance Criteria

**Given-When-Then**:
```gherkin
Given all document types
When uploaded through UI
Then each routes to correct API
And metadata preview displays
And errors show fallback UI
```

**Checklist**:
- [ ] PDF routing works
- [ ] EPUB routing works
- [ ] Markdown routing works
- [ ] Text routing works
- [ ] YouTube routing works
- [ ] Web URL handling correct

#### Manual Testing Steps
1. Upload one file of each type
2. Verify correct API called
3. Check preview displays
4. Test error scenarios
5. Verify no regressions

---

## Phase 6: Upload Actions (30 minutes)

### Task T-012: Enhance Document Upload Action

**Task Name**: Add Metadata Support to Upload
**Priority**: Critical
**Estimated Time**: 15 minutes

#### Context & Background
**Source PRP**: docs/prps/unified-metadata-preview.md (Section 3.6)
**Purpose**: Extend upload actions to accept and persist metadata to database.

#### Dependencies
- **Prerequisite Tasks**: T-001 (shared types)
- **Parallel Tasks**: T-013 (YouTube upload)
- **Integration Points**: Supabase storage, database

#### Technical Requirements
- Update `uploadDocument()` signature
- Handle three cover image types
- Persist metadata to database
- Pass documentType to worker

#### Implementation Details

**Files to Modify**:
```
└── src/app/actions/documents.ts - Enhance upload functions
```

**Key Changes**:
- Accept DetectedMetadata parameter
- Handle base64, URL, and File covers
- Store in both columns and JSONB
- Include in job input_data

#### Acceptance Criteria

**Given-When-Then**:
```gherkin
Scenario 1: File with metadata
  Given a file and metadata object
  When uploadDocument is called
  Then file stored in storage
  And metadata saved to database
  And job created with documentType

Scenario 2: Cover image handling
  Given metadata with cover image
  When upload processes cover
  Then base64 converts to blob
  And URL used directly
  And storage URL generated
```

**Checklist**:
- [ ] Metadata parameter added
- [ ] Cover image handling works
- [ ] Database columns populated
- [ ] JSONB field populated
- [ ] Job input_data correct
- [ ] Rollback on errors

#### Manual Testing Steps
1. Upload with metadata
2. Check database columns
3. Verify cover_image_url
4. Check background_jobs table
5. Verify worker receives type

#### Validation
```sql
-- Verify metadata persistence
SELECT
  id, title, author, document_type,
  cover_image_url, detected_metadata
FROM documents
ORDER BY created_at DESC
LIMIT 1;

-- Check job input_data
SELECT input_data
FROM background_jobs
ORDER BY created_at DESC
LIMIT 1;
```

---

### Task T-013: Create YouTube Upload Action

**Task Name**: Implement YouTube URL Upload
**Priority**: High
**Estimated Time**: 10 minutes

#### Context & Background
**Source PRP**: docs/prps/unified-metadata-preview.md (Section 3.6)
**Purpose**: Create separate upload action for YouTube URLs (no file storage needed).

#### Dependencies
- **Prerequisite Tasks**: T-001 (shared types)
- **Parallel Tasks**: T-012 (file upload)
- **Integration Points**: Database, background jobs

#### Technical Requirements
- Create `uploadYouTubeUrl()` function
- Store URL in source_url column
- Use thumbnail as cover_image_url
- Create background job with URL

#### Implementation Details

**Files to Modify**:
```
└── src/app/actions/documents.ts - Add YouTube upload function
```

#### Acceptance Criteria

**Given-When-Then**:
```gherkin
Given YouTube URL and metadata
When uploadYouTubeUrl is called
Then document created without file
And source_url contains YouTube URL
And thumbnail stored as cover
And job created with URL in input_data
```

**Checklist**:
- [ ] Function created
- [ ] No file storage attempted
- [ ] URL stored correctly
- [ ] Thumbnail URL saved
- [ ] Job has URL for worker

#### Manual Testing Steps
1. Upload YouTube URL
2. Check no storage path
3. Verify source_url field
4. Check cover_image_url
5. Verify job input_data

---

### Task T-014: Update DocumentPreview Integration

**Task Name**: Connect Preview to Enhanced Upload
**Priority**: High
**Estimated Time**: 5 minutes

#### Context & Background
**Source PRP**: docs/prps/unified-metadata-preview.md (Section 3.7)
**Purpose**: Update DocumentPreview component to use enhanced upload actions.

#### Dependencies
- **Prerequisite Tasks**: T-012, T-013 (upload actions)
- **Parallel Tasks**: None
- **Integration Points**: DocumentPreview component

#### Technical Requirements
- Update confirm button handler
- Call appropriate upload function
- Pass edited metadata
- Handle loading states

#### Implementation Details

**Files to Modify**:
```
└── src/components/upload/DocumentPreview.tsx - Update confirm handler (line 207)
```

#### Acceptance Criteria

**Given-When-Then**:
```gherkin
Given user confirms metadata
When Process Document clicked
Then appropriate upload called
And edited metadata passed
And loading state shown
And errors displayed
```

**Checklist**:
- [ ] File uploads work
- [ ] YouTube uploads work
- [ ] Edited metadata used
- [ ] Loading states work
- [ ] Error handling works

#### Manual Testing Steps
1. Edit metadata in preview
2. Click Process Document
3. Verify upload succeeds
4. Check edited values saved
5. Test error scenarios

---

## Phase 7: Integration Testing (30 minutes)

### Task T-015: End-to-End Testing Suite

**Task Name**: Complete E2E Validation
**Priority**: Critical
**Estimated Time**: 10 minutes

#### Context & Background
**Source PRP**: docs/prps/unified-metadata-preview.md (Section 5, Task 7.1)
**Purpose**: Validate complete flow for all document types from upload to processing.

#### Dependencies
- **Prerequisite Tasks**: All previous tasks
- **Parallel Tasks**: T-016 (worker verification)
- **Integration Points**: Entire system

#### Technical Requirements
- Test all 6 document types
- Verify metadata flow
- Check worker integration
- Validate UI updates

#### Acceptance Criteria

**Given-When-Then**:
```gherkin
Given each document type
When uploaded through UI
Then metadata extracted correctly
And preview displays properly
And upload saves to database
And worker processes with correct type
```

**Checklist**:
- [ ] PDF E2E works
- [ ] EPUB E2E works
- [ ] Markdown E2E works
- [ ] Text E2E works
- [ ] YouTube E2E works
- [ ] Web URL E2E works

#### Manual Testing Steps
1. Upload PDF → preview → process → verify
2. Upload EPUB → preview → process → verify
3. Upload Markdown → preview → process → verify
4. Upload Text → preview → process → verify
5. Upload YouTube → preview → process → verify

---

### Task T-016: Worker Integration Verification

**Task Name**: Validate Worker Receives Metadata
**Priority**: High
**Estimated Time**: 10 minutes

#### Context & Background
**Source PRP**: docs/prps/unified-metadata-preview.md (Section 4)
**Purpose**: Ensure worker correctly receives and uses documentType for chunking strategy.

#### Dependencies
- **Prerequisite Tasks**: T-015 (E2E must pass)
- **Parallel Tasks**: T-017 (error testing)
- **Integration Points**: Worker module, background jobs

#### Technical Requirements
- Verify job input_data structure
- Check documentType passed
- Monitor chunking strategy
- Validate no regressions

#### Acceptance Criteria

**Given-When-Then**:
```gherkin
Given documents with different types
When worker processes them
Then documentType received from job
And correct chunking strategy used
And processing completes successfully
```

**Checklist**:
- [ ] Fiction uses narrative chunking
- [ ] Technical uses topic chunking
- [ ] Academic uses citation chunking
- [ ] Worker logs show type
- [ ] No processing errors

#### Manual Testing Steps
1. Upload fiction EPUB
2. Check worker logs for type
3. Verify narrative chunking
4. Upload technical PDF
5. Verify technical chunking

#### Validation
```bash
# Monitor worker logs
cd worker && npm run dev

# Check in another terminal
tail -f worker/logs/worker.log | grep documentType
```

---

### Task T-017: Error Handling Validation

**Task Name**: Test All Error Scenarios
**Priority**: High
**Estimated Time**: 5 minutes

#### Context & Background
**Source PRP**: docs/prps/unified-metadata-preview.md (Section 7)
**Purpose**: Ensure graceful degradation in all error scenarios.

#### Dependencies
- **Prerequisite Tasks**: T-015 (E2E complete)
- **Parallel Tasks**: T-016 (worker verification)
- **Integration Points**: All error paths

#### Technical Requirements
- Test corrupted files
- Test API failures
- Test quota exceeded
- Test network errors

#### Acceptance Criteria

**Given-When-Then**:
```gherkin
Given various error conditions
When errors occur
Then user sees clear messages
And can proceed with manual entry
And no data loss occurs
```

**Checklist**:
- [ ] Corrupted EPUB handled
- [ ] YouTube quota handled
- [ ] AI failure handled
- [ ] Network errors handled
- [ ] User can always proceed

#### Manual Testing Steps
1. Upload corrupted EPUB
2. Simulate YouTube quota error
3. Disconnect network during fetch
4. Test with invalid files
5. Verify fallback UI works

---

### Task T-018: Performance Benchmarking

**Task Name**: Validate Performance Targets
**Priority**: Medium
**Estimated Time**: 5 minutes

#### Context & Background
**Source PRP**: docs/prps/unified-metadata-preview.md (Section 10)
**Purpose**: Ensure all APIs meet performance requirements.

#### Dependencies
- **Prerequisite Tasks**: All previous tasks
- **Parallel Tasks**: None
- **Integration Points**: All APIs

#### Technical Requirements
- EPUB < 100ms
- Frontmatter < 10ms
- AI extraction < 5s
- YouTube < 3s

#### Acceptance Criteria

**Given-When-Then**:
```gherkin
Given performance requirements
When APIs are benchmarked
Then EPUB completes in <100ms
And frontmatter in <10ms
And AI extraction in <5s
And YouTube in <3s
```

**Checklist**:
- [ ] EPUB performance met
- [ ] Frontmatter instant
- [ ] AI under 5 seconds
- [ ] YouTube under 3 seconds
- [ ] No UI lag

#### Manual Testing Steps
1. Time each API with curl
2. Check browser network tab
3. Monitor console timings
4. Test with large files
5. Verify UI responsiveness

#### Validation
```bash
# Benchmark each API
time curl -X POST http://localhost:3000/api/extract-epub-metadata -F "file=@test.epub"
time curl -X POST http://localhost:3000/api/extract-text-metadata -F "file=@test.md"
time curl -X POST http://localhost:3000/api/extract-youtube-metadata -d '{"url":"..."}'
```

---

## Implementation Recommendations

### Suggested Team Structure
- **Single Developer**: Can complete sequentially in 3 hours
- **Two Developers**:
  - Dev 1: Foundation + APIs (Phases 1-4)
  - Dev 2: UI + Integration (Phases 5-7)

### Optimal Task Sequencing
1. **Sequential Path** (Recommended):
   - Phase 1 → 2 → 3 → 4 → 5 → 6 → 7
   - Each phase builds on previous
   - Lower risk of integration issues

2. **Parallel Opportunities**:
   - T-003 (EPUB) and T-005 (Text) can run parallel
   - T-012 (File upload) and T-013 (YouTube upload) can run parallel
   - T-015, T-016, T-017 (testing tasks) can run parallel

### Critical Path Analysis

**Critical Path**: T-001 → T-002 → T-009 → T-012 → T-015

**Why Critical**:
- T-001: All other tasks depend on shared types
- T-002: Validates pattern before replication
- T-009: Routing must work for UI to function
- T-012: Upload must work for E2E testing
- T-015: Final validation of entire system

**Potential Bottlenecks**:
- ESM import issues in API routes (test early in T-003)
- YouTube API key configuration (verify before T-007)
- Worker module imports (validate in T-003)

### Resource Requirements

**Developer Skills**:
- Next.js App Router experience
- TypeScript proficiency
- API integration experience
- Basic regex knowledge (frontmatter)

**External Resources**:
- YouTube API key (must be configured)
- Gemini API key (already configured)
- Test files for each format
- Supabase local instance running

---

## Risk Mitigation

### Technical Risks

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|------------|
| ESM imports fail | Medium | High | Test early in T-003, have fallback |
| YouTube quota exceeded | Low | Medium | Implement fallback UI (T-007) |
| AI extraction quality | Low | Low | User can edit in preview |
| Performance regression | Low | Medium | Benchmark in T-018 |

### Mitigation Strategies
1. **ESM Issues**: Test worker imports immediately in Phase 2
2. **API Failures**: All endpoints have fallback paths
3. **Data Loss**: Rollback logic in upload actions
4. **User Experience**: Always allow manual override

---

## Success Metrics

### Completion Checklist
- [ ] All 18 tasks completed
- [ ] All 6 document types supported
- [ ] Metadata persists to database
- [ ] Worker receives documentType
- [ ] Cover images display correctly
- [ ] Error handling works gracefully
- [ ] Performance targets met
- [ ] No regressions in PDF flow

### Quality Gates
- [ ] TypeScript compilation: 0 errors
- [ ] Console errors: 0 in normal flow
- [ ] API response times: Within targets
- [ ] Database integrity: All columns populated
- [ ] Worker integration: Type-specific chunking works

---

## Appendix: Quick Reference

### API Endpoints
- `/api/extract-metadata` - PDF (existing)
- `/api/extract-epub-metadata` - EPUB (new)
- `/api/extract-text-metadata` - Text/Markdown (new)
- `/api/extract-youtube-metadata` - YouTube (new)

### Database Columns (Migration 025)
- `document_type` - TEXT
- `author` - TEXT
- `publication_year` - INTEGER
- `publisher` - TEXT
- `cover_image_url` - TEXT
- `detected_metadata` - JSONB

### Environment Variables
- `YOUTUBE_API_KEY` - YouTube Data API v3
- `GEMINI_MODEL` - AI model for text extraction
- `GOOGLE_AI_API_KEY` - Gemini API access

### Test Commands
```bash
# Validate TypeScript
npm run lint
npx tsc --noEmit

# Test APIs
curl -X POST http://localhost:3000/api/extract-epub-metadata -F "file=@test.epub"
curl -X POST http://localhost:3000/api/extract-text-metadata -F "file=@test.md"
curl -X POST http://localhost:3000/api/extract-youtube-metadata -d '{"url":"..."}'

# Check database
npx supabase db reset  # Reset with migrations
psql $DATABASE_URL      # Direct SQL access

# Monitor worker
cd worker && npm run dev
tail -f worker/logs/worker.log
```

---

**Document Generated**: 2025-10-03
**Source PRP**: /docs/prps/unified-metadata-preview.md
**Total Tasks**: 18
**Estimated Time**: 3 hours
**Risk Level**: Low (proven pattern replication)