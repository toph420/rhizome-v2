# Week 1: Document Processor Stabilization Tasks

> **Sprint Duration**: Jan 29 - Feb 4, 2025  
> **Goal**: Transform 1,128-line monolithic processor into modular, high-performance system  
> **Expected Outcome**: 50x performance improvement, maintainable codebase, zero Gemini quota waste

## Task Identification Summary

| Task ID | Task Name | Priority | Dependencies | Effort |
|---------|-----------|----------|--------------|--------|
| T-001 | Create base processor abstraction | Critical | None | 4h |
| T-002 | Extract PDF processor class | Critical | T-001 | 6h |
| T-003 | Extract YouTube processor class | Critical | T-001 | 6h |
| T-004 | Extract Web processor class | High | T-001 | 4h |
| T-005 | Extract Markdown processor class | High | T-001 | 3h |
| T-006 | Extract Text/Paste processor classes | Medium | T-001 | 3h |
| T-007 | Implement Gemini file caching | Critical | T-002 | 4h |
| T-008 | Implement batch database operations | Critical | T-001 | 4h |
| T-009 | Create generalized retry helper | Critical | None | 3h |
| T-010 | Refactor main handler to use processors | Critical | T-002 to T-006 | 4h |
| T-011 | Add performance benchmarking | High | T-010 | 3h |
| T-012 | Integration testing and validation | Critical | T-010 | 6h |

---

## T-001: Create Base Processor Abstraction

**Priority**: Critical  
**Effort**: 4 hours

### Source PRP Document
**Reference**: docs/prps/document-processor-stabilization.md - Lines 79-123

### Task Purpose
**As a** development team  
**I need** a base abstract class for all source processors  
**So that** all processors share common functionality and interface

### Dependencies
- **Prerequisite Tasks**: None
- **Parallel Tasks**: T-009 (retry helper)
- **Integration Points**: All processor classes will inherit from this
- **Blocked By**: None

### Technical Requirements

#### Functional Requirements
- **REQ-1**: When a processor is instantiated, the system shall initialize AI client, Supabase client, and job reference
- **REQ-2**: While processing, the system shall provide updateProgress method for status tracking
- **REQ-3**: Where retry is needed, the system shall use the shared retry helper

#### Non-Functional Requirements
- **Performance**: Progress updates < 100ms latency
- **Security**: Service role key must be protected
- **Code Standards**: TypeScript with strict typing

### Implementation Details

#### Files to Modify/Create
```
├── worker/processors/base.ts - [Create: Abstract SourceProcessor class]
├── worker/types/processor.ts - [Create: Shared interfaces and types]
└── worker/processors/index.ts - [Create: Export barrel file]
```

#### Key Implementation Steps
1. **Step 1**: Create base.ts with abstract class → Base processor ready
2. **Step 2**: Define ProcessResult interface → Type safety established
3. **Step 3**: Implement updateProgress method → Progress tracking available
4. **Step 4**: Add withRetry wrapper method → Retry logic integrated

#### Code Patterns to Follow
- **Similar Pattern**: worker/lib/youtube-cleaning.ts:10-14 - Clean interface definition
- **Error Handling**: worker/lib/errors.ts:14-61 - Error classification approach
- **Progress Pattern**: worker/handlers/process-document.ts:106-113 - Progress update structure

### Acceptance Criteria

#### Given-When-Then Scenarios
```gherkin
Scenario 1: Processor initialization
  Given a concrete processor class extending SourceProcessor
  When the processor is instantiated with AI, Supabase, and job
  Then all dependencies are stored as protected properties
  And the processor is ready for processing

Scenario 2: Progress tracking
  Given a processor instance
  When updateProgress is called with stage and percentage
  Then the background_jobs table is updated
  And the timestamp is refreshed

Scenario 3: Abstract method enforcement
  Given the base SourceProcessor class
  When a subclass doesn't implement process() method
  Then TypeScript compilation fails with clear error
```

#### Rule-Based Criteria (Checklist)
- [ ] **Functional**: Abstract class with process() method defined
- [ ] **Type Safety**: ProcessResult interface properly typed
- [ ] **Progress Tracking**: updateProgress method works correctly
- [ ] **Error Handling**: Errors properly classified and wrapped
- [ ] **Documentation**: JSDoc comments on all public methods
- [ ] **Testing**: Unit tests for base functionality

### Manual Testing Steps
1. **Setup**: Create test processor extending base class
2. **Test Case 1**: Verify TypeScript requires process() implementation
3. **Test Case 2**: Test updateProgress writes to database
4. **Test Case 3**: Verify retry wrapper properly delegates

### Validation & Quality Gates

#### Code Quality Checks
```bash
# Type checking
cd worker && npm run build

# Linting
npm run lint

# Unit tests
npm test processors/base.test.js
```

#### Definition of Done
- [ ] TypeScript compilation passes
- [ ] All tests pass
- [ ] Code review approved
- [ ] No ESLint warnings
- [ ] Documentation complete

---

## T-002: Extract PDF Processor Class

**Priority**: Critical  
**Effort**: 6 hours

### Source PRP Document
**Reference**: docs/prps/document-processor-stabilization.md - Lines 59-61

### Task Purpose
**As a** document processing system  
**I need** a dedicated PDF processor class  
**So that** PDF-specific logic is isolated and maintainable

### Dependencies
- **Prerequisite Tasks**: T-001 (base processor)
- **Parallel Tasks**: T-003, T-004, T-005, T-006
- **Integration Points**: Gemini Files API, Supabase Storage
- **Blocked By**: None

### Technical Requirements

#### Functional Requirements
- **REQ-1**: When processing a PDF, the system shall download from Supabase storage
- **REQ-2**: While extracting content, the system shall use Gemini Files API with proper prompts
- **REQ-3**: Where caching is available, the system shall reuse uploaded Gemini files

#### Non-Functional Requirements
- **Performance**: Process 50-page PDF in < 2 minutes
- **Security**: Signed URLs for storage access
- **File Size**: Support up to 100MB PDFs

### Implementation Details

#### Files to Modify/Create
```
├── worker/processors/pdf-processor.ts - [Create: PDFProcessor class]
├── worker/handlers/process-document.ts - [Modify: Extract PDF logic (lines 170-430)]
└── worker/lib/gemini-cache.ts - [Reference: For file caching integration]
```

#### Key Implementation Steps
1. **Step 1**: Extract PDF processing logic from main handler → Isolated PDF code
2. **Step 2**: Create PDFProcessor extending SourceProcessor → Proper inheritance
3. **Step 3**: Integrate Gemini file caching → Reduced API calls
4. **Step 4**: Implement structured extraction prompt → Consistent output
5. **Step 5**: Add retry logic for transient failures → Improved reliability

#### Code Patterns to Follow
- **Gemini Pattern**: worker/handlers/process-document.ts:170-250 - Current PDF extraction
- **Storage Pattern**: worker/handlers/process-document.ts:180-200 - Download from storage
- **Error Handling**: worker/lib/errors.ts:45-61 - PDF-specific errors

### Acceptance Criteria

#### Given-When-Then Scenarios
```gherkin
Scenario 1: PDF download and processing
  Given a valid PDF document in storage
  When PDFProcessor.process() is called
  Then the PDF is downloaded from storage
  And Gemini extracts markdown and chunks
  And results are returned in ProcessResult format

Scenario 2: Cached file reuse
  Given a PDF was processed recently
  When the same PDF is processed again within 47 hours
  Then the cached Gemini file URI is reused
  And no new upload to Gemini occurs

Scenario 3: Large PDF handling
  Given a 100-page PDF document
  When processing is initiated
  Then the system completes within 3 minutes
  And all chunks are properly extracted
```

#### Rule-Based Criteria (Checklist)
- [ ] **Functional**: PDF extraction works end-to-end
- [ ] **Performance**: 50-page PDF < 2 minutes
- [ ] **Caching**: Gemini files reused when available
- [ ] **Error Handling**: Proper fallback for extraction failures
- [ ] **Memory**: No memory leaks with large PDFs
- [ ] **Progress**: Regular progress updates during processing

### Manual Testing Steps
1. **Setup**: Upload test PDFs (10, 50, 100 pages)
2. **Test Case 1**: Process small PDF, verify markdown output
3. **Test Case 2**: Process same PDF twice, verify cache hit
4. **Test Case 3**: Process large PDF, monitor memory usage
4. **Test Case 4**: Simulate network failure, verify retry

### Validation & Quality Gates

#### Code Quality Checks
```bash
# Build check
cd worker && npm run build

# Memory leak test
node --expose-gc test-memory-leak.js

# Performance benchmark
npm run benchmark:pdf
```

#### Definition of Done
- [ ] Extracted from main handler (<250 lines)
- [ ] Cache integration working
- [ ] Performance targets met
- [ ] All tests passing
- [ ] Documentation updated

---

## T-003: Extract YouTube Processor Class

**Priority**: Critical  
**Effort**: 6 hours

### Source PRP Document
**Reference**: docs/prps/document-processor-stabilization.md - Lines 62-63

### Task Purpose
**As a** document processing system  
**I need** a dedicated YouTube processor class  
**So that** YouTube transcript processing is modular and maintainable

### Dependencies
- **Prerequisite Tasks**: T-001 (base processor)
- **Parallel Tasks**: T-002, T-004, T-005, T-006
- **Integration Points**: YouTube transcript API, cleaning module, fuzzy matching
- **Blocked By**: None

### Technical Requirements

#### Functional Requirements
- **REQ-1**: When processing YouTube URL, the system shall fetch transcript with retry
- **REQ-2**: While cleaning transcript, the system shall remove timestamps and fix grammar
- **REQ-3**: Where fuzzy matching is needed, the system shall maintain position context

#### Non-Functional Requirements
- **Performance**: Process 1-hour video in < 2 minutes
- **Reliability**: Handle rate limits gracefully
- **Quality**: Clean transcript with >95% accuracy

### Implementation Details

#### Files to Modify/Create
```
├── worker/processors/youtube-processor.ts - [Create: YouTubeProcessor class]
├── worker/handlers/process-document.ts - [Modify: Extract YouTube logic (lines 89-160)]
└── worker/lib/youtube-cleaning.ts - [Reference: Existing cleaning module]
```

#### Key Implementation Steps
1. **Step 1**: Extract YouTube logic from main handler → Isolated YouTube code
2. **Step 2**: Create YouTubeProcessor class → Proper structure
3. **Step 3**: Integrate cleaning and fuzzy matching → Complete pipeline
4. **Step 4**: Implement 7-stage progress tracking → Detailed status
5. **Step 5**: Add comprehensive error handling → User-friendly errors

#### Code Patterns to Follow
- **Retry Pattern**: worker/lib/youtube.ts:69-100 - Exponential backoff
- **Cleaning Pattern**: worker/lib/youtube-cleaning.ts:45-49 - Graceful degradation
- **Fuzzy Matching**: worker/lib/fuzzy-matching.ts - 3-tier algorithm

### Acceptance Criteria

#### Given-When-Then Scenarios
```gherkin
Scenario 1: YouTube transcript processing
  Given a valid YouTube video URL
  When YouTubeProcessor.process() is called
  Then transcript is fetched and cleaned
  And chunks have position context
  And metadata is fully populated

Scenario 2: Rate limit handling
  Given YouTube API rate limit is hit
  When processing a video
  Then the system retries with exponential backoff
  And eventually succeeds or provides clear error

Scenario 3: Transcript cleaning
  Given a transcript with timestamps [[01:23](url)]
  When cleaning is performed
  Then all timestamps are removed
  And grammar is corrected
  And readability is improved
```

#### Rule-Based Criteria (Checklist)
- [ ] **Functional**: Complete YouTube pipeline works
- [ ] **Cleaning**: Timestamps removed, grammar fixed
- [ ] **Metadata**: All fields populated (themes, importance, summary)
- [ ] **Positioning**: Fuzzy matching provides confidence scores
- [ ] **Error Handling**: Clear messages for common failures
- [ ] **Progress**: 7-stage tracking with percentages

### Manual Testing Steps
1. **Setup**: Prepare YouTube URLs (short, long, restricted)
2. **Test Case 1**: Process 10-minute video, verify cleaning
3. **Test Case 2**: Process 2-hour video, check performance
4. **Test Case 3**: Test restricted video, verify error message
5. **Test Case 4**: Simulate rate limit, verify retry behavior

### Validation & Quality Gates

#### Code Quality Checks
```bash
# Type checking
cd worker && npm run build

# Unit tests
npm test processors/youtube-processor.test.js

# Integration test
npm run test:youtube-videos
```

#### Definition of Done
- [ ] Extracted from main handler
- [ ] All 7 stages implemented
- [ ] Cleaning integration complete
- [ ] Fuzzy matching working
- [ ] Tests passing with >85% coverage

---

## T-004: Extract Web Processor Class

**Priority**: High  
**Effort**: 4 hours

### Source PRP Document
**Reference**: docs/prps/document-processor-stabilization.md - Lines 64-65

### Task Purpose
**As a** document processing system  
**I need** a dedicated web article processor  
**So that** web content extraction is maintainable and reliable

### Dependencies
- **Prerequisite Tasks**: T-001 (base processor)
- **Parallel Tasks**: T-002, T-003, T-005, T-006
- **Integration Points**: Readability library, jsdom, web extraction module
- **Blocked By**: None

### Technical Requirements

#### Functional Requirements
- **REQ-1**: When processing a URL, the system shall extract article content
- **REQ-2**: While extracting, the system shall handle paywalls gracefully
- **REQ-3**: Where extraction fails, the system shall provide actionable errors

#### Non-Functional Requirements
- **Performance**: Extract article in < 30 seconds
- **Reliability**: Handle timeouts and network errors
- **Quality**: Preserve article structure and formatting

### Implementation Details

#### Files to Modify/Create
```
├── worker/processors/web-processor.ts - [Create: WebProcessor class]
├── worker/handlers/process-document.ts - [Modify: Extract web logic (lines 431-520)]
└── worker/lib/web-extraction.ts - [Reference: Existing extraction module]
```

#### Key Implementation Steps
1. **Step 1**: Extract web processing logic → Isolated web code
2. **Step 2**: Create WebProcessor class → Structured implementation
3. **Step 3**: Add retry for network failures → Improved reliability
4. **Step 4**: Implement paywall detection → Better error messages
5. **Step 5**: Add metadata extraction → Rich article data

#### Code Patterns to Follow
- **Extraction Pattern**: worker/lib/web-extraction.ts - Mozilla Readability
- **Error Prefixes**: worker/lib/errors.ts:14-30 - WEB_* error codes
- **Validation**: worker/lib/web-extraction.ts - URL validation

### Acceptance Criteria

#### Given-When-Then Scenarios
```gherkin
Scenario 1: Article extraction
  Given a valid article URL
  When WebProcessor.process() is called
  Then article content is extracted
  And markdown formatting is preserved
  And metadata is populated

Scenario 2: Paywall handling
  Given a paywalled article URL
  When extraction is attempted
  Then WEB_PAYWALL error is returned
  And suggestion for archive.ph is provided

Scenario 3: Network timeout
  Given a slow-loading website
  When timeout is reached
  Then WEB_TIMEOUT error is returned
  And retry with exponential backoff occurs
```

#### Rule-Based Criteria (Checklist)
- [ ] **Functional**: Article extraction works
- [ ] **Error Handling**: Clear error messages
- [ ] **Performance**: < 30 second extraction
- [ ] **Formatting**: Markdown structure preserved
- [ ] **Metadata**: Title, author, date extracted
- [ ] **Retry Logic**: Network failures handled

### Manual Testing Steps
1. **Setup**: Collect test URLs (news, blog, paywall, slow)
2. **Test Case 1**: Extract news article, verify content
3. **Test Case 2**: Test paywalled site, verify error
4. **Test Case 3**: Test slow site, verify timeout handling
5. **Test Case 4**: Extract long article, check formatting

### Validation & Quality Gates

#### Code Quality Checks
```bash
# Build and type check
cd worker && npm run build

# Unit tests
npm test processors/web-processor.test.js

# Integration test with real URLs
npm run test:web-articles
```

#### Definition of Done
- [ ] Extracted from main handler
- [ ] Retry logic implemented
- [ ] Paywall detection working
- [ ] All tests passing
- [ ] Documentation complete

---

## T-005: Extract Markdown Processor Class

**Priority**: High  
**Effort**: 3 hours

### Source PRP Document
**Reference**: docs/prps/document-processor-stabilization.md - Lines 66-67

### Task Purpose
**As a** document processing system  
**I need** dedicated markdown processors (as-is and clean)  
**So that** markdown processing options are properly separated

### Dependencies
- **Prerequisite Tasks**: T-001 (base processor)
- **Parallel Tasks**: T-002, T-003, T-004, T-006
- **Integration Points**: Markdown chunking module, AI cleaning
- **Blocked By**: None

### Technical Requirements

#### Functional Requirements
- **REQ-1**: When processing markdown as-is, the system shall use heading-based chunking
- **REQ-2**: When processing markdown with cleaning, the system shall use AI enhancement
- **REQ-3**: Where timestamps exist, the system shall extract and preserve them

#### Non-Functional Requirements
- **Performance**: As-is processing < 5 seconds for 100KB
- **Quality**: Clean markdown improves readability
- **Flexibility**: Support both fast and enhanced modes

### Implementation Details

#### Files to Modify/Create
```
├── worker/processors/markdown-processor.ts - [Create: MarkdownProcessor classes]
├── worker/handlers/process-document.ts - [Modify: Extract markdown logic (lines 521-650)]
└── worker/lib/markdown-chunking.ts - [Reference: Existing chunking module]
```

#### Key Implementation Steps
1. **Step 1**: Create MarkdownAsIsProcessor → Fast processing path
2. **Step 2**: Create MarkdownCleanProcessor → AI-enhanced path
3. **Step 3**: Extract chunking logic → Reusable chunking
4. **Step 4**: Add timestamp extraction → Preserve timestamps
5. **Step 5**: Implement proper inheritance → Code reuse

#### Code Patterns to Follow
- **Chunking Pattern**: worker/lib/markdown-chunking.ts - Heading-based chunking
- **Timestamp Pattern**: worker/lib/markdown-chunking.ts - extractTimestampsWithContext
- **AI Pattern**: Current Gemini usage for cleaning

### Acceptance Criteria

#### Given-When-Then Scenarios
```gherkin
Scenario 1: As-is markdown processing
  Given markdown content with headings
  When MarkdownAsIsProcessor.process() is called
  Then content is chunked by headings
  And no AI processing occurs
  And results return in < 5 seconds

Scenario 2: Clean markdown processing
  Given poorly formatted markdown
  When MarkdownCleanProcessor.process() is called
  Then AI improves formatting and structure
  And semantic chunking is applied
  And metadata is enriched

Scenario 3: Timestamp preservation
  Given markdown with [[MM:SS]] timestamps
  When either processor is used
  Then timestamps are extracted
  And position context is maintained
```

#### Rule-Based Criteria (Checklist)
- [ ] **Functional**: Both processors work correctly
- [ ] **Performance**: As-is mode is fast (< 5s)
- [ ] **Quality**: Clean mode improves readability
- [ ] **Timestamps**: Properly extracted and stored
- [ ] **Code Reuse**: Shared logic in base class
- [ ] **Testing**: Both modes thoroughly tested

### Manual Testing Steps
1. **Setup**: Prepare markdown files (clean, messy, with timestamps)
2. **Test Case 1**: Process clean markdown as-is, verify speed
3. **Test Case 2**: Process messy markdown with cleaning, verify improvement
4. **Test Case 3**: Process markdown with timestamps, verify extraction
5. **Test Case 4**: Compare output quality between modes

### Validation & Quality Gates

#### Code Quality Checks
```bash
# Type checking
cd worker && npm run build

# Unit tests
npm test processors/markdown-processor.test.js

# Performance test
npm run benchmark:markdown
```

#### Definition of Done
- [ ] Both processors implemented
- [ ] Extracted from main handler
- [ ] Performance targets met
- [ ] Timestamp handling works
- [ ] Tests passing

---

## T-006: Extract Text/Paste Processor Classes

**Priority**: Medium  
**Effort**: 3 hours

### Source PRP Document
**Reference**: docs/prps/document-processor-stabilization.md - Lines 68-69

### Task Purpose
**As a** document processing system  
**I need** processors for plain text and pasted content  
**So that** all input types are properly handled

### Dependencies
- **Prerequisite Tasks**: T-001 (base processor)
- **Parallel Tasks**: T-002, T-003, T-004, T-005
- **Integration Points**: AI for structure detection
- **Blocked By**: None

### Technical Requirements

#### Functional Requirements
- **REQ-1**: When processing plain text, the system shall add markdown structure
- **REQ-2**: When processing pasted content, the system shall detect format
- **REQ-3**: Where timestamps exist, the system shall identify and extract them

#### Non-Functional Requirements
- **Performance**: Process 10KB text in < 10 seconds
- **Quality**: Improve text structure and readability
- **Flexibility**: Handle various paste formats

### Implementation Details

#### Files to Modify/Create
```
├── worker/processors/text-processor.ts - [Create: TextProcessor class]
├── worker/processors/paste-processor.ts - [Create: PasteProcessor class]
├── worker/handlers/process-document.ts - [Modify: Extract text/paste logic (lines 651-750)]
```

#### Key Implementation Steps
1. **Step 1**: Create TextProcessor for plain text → Structured output
2. **Step 2**: Create PasteProcessor for generic content → Format detection
3. **Step 3**: Add AI structure generation → Improved formatting
4. **Step 4**: Implement timestamp detection → Time-based content
5. **Step 5**: Add format auto-detection → Smart processing

#### Code Patterns to Follow
- **AI Pattern**: Use Gemini for structure generation
- **Detection Pattern**: Regex for timestamp patterns
- **Chunking Pattern**: Reuse markdown chunking logic

### Acceptance Criteria

#### Given-When-Then Scenarios
```gherkin
Scenario 1: Plain text processing
  Given unstructured plain text
  When TextProcessor.process() is called
  Then AI adds markdown headings and structure
  And content becomes more readable
  And chunks are properly created

Scenario 2: Pasted content detection
  Given pasted content of unknown format
  When PasteProcessor.process() is called
  Then format is auto-detected
  And appropriate processing is applied
  And timestamps are extracted if present

Scenario 3: Timestamp detection
  Given text with "01:23" patterns
  When processing occurs
  Then timestamps are identified
  And converted to standard format
  And linked to content chunks
```

#### Rule-Based Criteria (Checklist)
- [ ] **Functional**: Both processors work
- [ ] **Structure**: AI improves text organization
- [ ] **Detection**: Format auto-detection works
- [ ] **Timestamps**: Properly extracted
- [ ] **Performance**: Fast processing
- [ ] **Quality**: Improved readability

### Manual Testing Steps
1. **Setup**: Prepare text files (plain, transcript, notes)
2. **Test Case 1**: Process plain text, verify structure
3. **Test Case 2**: Paste transcript, verify timestamp detection
4. **Test Case 3**: Paste mixed content, verify format detection
5. **Test Case 4**: Process large text, check performance

### Validation & Quality Gates

#### Code Quality Checks
```bash
# Build check
cd worker && npm run build

# Unit tests
npm test processors/text-processor.test.js
npm test processors/paste-processor.test.js

# Integration test
npm run test:text-processing
```

#### Definition of Done
- [ ] Both processors implemented
- [ ] Format detection working
- [ ] AI structuring functional
- [ ] Tests passing
- [ ] Documentation complete

---

## T-007: Implement Gemini File Caching

**Priority**: Critical  
**Effort**: 4 hours

### Source PRP Document
**Reference**: docs/prps/document-processor-stabilization.md - Lines 125-173

### Task Purpose
**As a** document processing system  
**I need** Gemini file caching with 47-hour TTL  
**So that** we avoid re-uploading PDFs and reduce API quota usage by 90%

### Dependencies
- **Prerequisite Tasks**: T-002 (PDF processor needs this)
- **Parallel Tasks**: T-008, T-009
- **Integration Points**: Gemini Files API, PDF processor
- **Blocked By**: None

### Technical Requirements

#### Functional Requirements
- **REQ-1**: When uploading a file to Gemini, the system shall cache the URI for 47 hours
- **REQ-2**: While processing a cached document, the system shall reuse existing Gemini file
- **REQ-3**: Where cache expires, the system shall re-upload automatically

#### Non-Functional Requirements
- **Performance**: Cache lookup < 10ms
- **Reliability**: Graceful handling of expired files
- **Efficiency**: 90% reduction in Gemini uploads

### Implementation Details

#### Files to Modify/Create
```
├── worker/lib/gemini-cache.ts - [Create: GeminiFileCache class]
├── worker/processors/pdf-processor.ts - [Modify: Integrate caching]
└── worker/lib/cache-store.ts - [Create: Optional persistent cache]
```

#### Key Implementation Steps
1. **Step 1**: Create GeminiFileCache class → Cache infrastructure
2. **Step 2**: Implement getOrUpload method → Smart upload logic
3. **Step 3**: Add TTL management (47 hours) → Expiration handling
4. **Step 4**: Integrate with PDF processor → Actual usage
5. **Step 5**: Add cache metrics logging → Monitor effectiveness

#### Code Patterns to Follow
- **Singleton Pattern**: Static cache instance
- **TTL Pattern**: 47 hours (1 hour buffer before Gemini's 48h)
- **Fallback Pattern**: Re-upload on cache miss

### Acceptance Criteria

#### Given-When-Then Scenarios
```gherkin
Scenario 1: Cache hit
  Given a PDF was uploaded to Gemini 24 hours ago
  When the same PDF is processed again
  Then the cached URI is returned
  And no new upload occurs
  And processing continues normally

Scenario 2: Cache expiration
  Given a cached file older than 47 hours
  When attempting to use it
  Then the cache entry is invalidated
  And a new upload occurs
  And the new URI is cached

Scenario 3: Cache invalidation
  Given a cached file URI
  When invalidate() is called
  Then the cache entry is removed
  And next access triggers new upload
```

#### Rule-Based Criteria (Checklist)
- [ ] **Functional**: Cache stores and retrieves URIs
- [ ] **TTL**: 47-hour expiration works correctly
- [ ] **Performance**: Significant reduction in uploads
- [ ] **Reliability**: Graceful expiration handling
- [ ] **Metrics**: Cache hit rate tracked
- [ ] **Memory**: No memory leaks with long-running cache

### Manual Testing Steps
1. **Setup**: Enable cache logging, prepare test PDFs
2. **Test Case 1**: Process PDF twice, verify cache hit
3. **Test Case 2**: Wait 47+ hours (or mock), verify re-upload
4. **Test Case 3**: Manually invalidate, verify re-upload
5. **Test Case 4**: Process 10 PDFs repeatedly, check hit rate

### Validation & Quality Gates

#### Code Quality Checks
```bash
# Type checking
cd worker && npm run build

# Unit tests with mocked time
npm test lib/gemini-cache.test.js

# Cache effectiveness test
npm run test:cache-metrics
```

#### Definition of Done
- [ ] Cache implementation complete
- [ ] 47-hour TTL working
- [ ] PDF processor integrated
- [ ] >80% cache hit rate in tests
- [ ] Metrics logging added

---

## T-008: Implement Batch Database Operations

**Priority**: Critical  
**Effort**: 4 hours

### Source PRP Document
**Reference**: docs/prps/document-processor-stabilization.md - Lines 175-198

### Task Purpose
**As a** document processing system  
**I need** batch database operations for chunk insertion  
**So that** we achieve 50x performance improvement (100 calls → 2 calls)

### Dependencies
- **Prerequisite Tasks**: T-001 (processors need this)
- **Parallel Tasks**: T-007, T-009
- **Integration Points**: All processor classes, Supabase
- **Blocked By**: None

### Technical Requirements

#### Functional Requirements
- **REQ-1**: When inserting chunks, the system shall batch them in groups of 50
- **REQ-2**: While batching, the system shall respect PostgreSQL parameter limits
- **REQ-3**: Where batch fails, the system shall retry with smaller batch size

#### Non-Functional Requirements
- **Performance**: 50x faster chunk insertion
- **Reliability**: Transaction safety for batches
- **Limits**: Stay under 65,535 PostgreSQL parameters

### Implementation Details

#### Files to Modify/Create
```
├── worker/lib/batch-operations.ts - [Create: Batch operation helpers]
├── worker/processors/base.ts - [Modify: Add batch methods]
└── All processor classes - [Modify: Use batch operations]
```

#### Key Implementation Steps
1. **Step 1**: Create batchInsertChunks function → Core batching logic
2. **Step 2**: Add transaction support → Data consistency
3. **Step 3**: Implement adaptive batch sizing → Handle failures
4. **Step 4**: Integrate into all processors → Universal usage
5. **Step 5**: Add progress tracking per batch → Status updates

#### Code Patterns to Follow
- **Batch Pattern**: worker/lib/embeddings.ts:77-147 - Batch processing example
- **Transaction Pattern**: Use Supabase transactions
- **Progress Pattern**: Update after each batch

### Acceptance Criteria

#### Given-When-Then Scenarios
```gherkin
Scenario 1: Batch insertion success
  Given 150 chunks to insert
  When batchInsertChunks is called with batch size 50
  Then 3 database calls are made
  And all chunks are inserted successfully
  And progress is updated 3 times

Scenario 2: Batch failure recovery
  Given a batch that fails due to size
  When the error occurs
  Then batch size is reduced to 25
  And retry succeeds with smaller batches
  And all data is eventually inserted

Scenario 3: Transaction rollback
  Given a batch insertion in progress
  When one chunk fails validation
  Then the entire batch is rolled back
  And error details are provided
  And no partial data remains
```

#### Rule-Based Criteria (Checklist)
- [ ] **Functional**: Batch insertion works
- [ ] **Performance**: 50x improvement verified
- [ ] **Reliability**: Transaction safety ensured
- [ ] **Adaptive**: Batch size adjusts on failure
- [ ] **Progress**: Updates between batches
- [ ] **Integration**: All processors updated

### Manual Testing Steps
1. **Setup**: Create test with 200 chunks
2. **Test Case 1**: Insert chunks, verify 4 DB calls (50 each)
3. **Test Case 2**: Force batch failure, verify retry
4. **Test Case 3**: Measure performance improvement
5. **Test Case 4**: Verify transaction rollback on error

### Validation & Quality Gates

#### Code Quality Checks
```bash
# Build check
cd worker && npm run build

# Unit tests
npm test lib/batch-operations.test.js

# Performance benchmark
npm run benchmark:batch-insert

# Integration test
npm run test:database-batching
```

#### Definition of Done
- [ ] Batch operations implemented
- [ ] 50x performance gain verified
- [ ] Transaction safety tested
- [ ] All processors integrated
- [ ] Tests passing

---

## T-009: Create Generalized Retry Helper

**Priority**: Critical  
**Effort**: 3 hours

### Source PRP Document
**Reference**: docs/prps/document-processor-stabilization.md - Lines 40, 116-122

### Task Purpose
**As a** document processing system  
**I need** generalized retry logic with exponential backoff  
**So that** all processors handle transient failures gracefully

### Dependencies
- **Prerequisite Tasks**: None
- **Parallel Tasks**: T-001, T-007, T-008
- **Integration Points**: All processor classes, error classification
- **Blocked By**: None

### Technical Requirements

#### Functional Requirements
- **REQ-1**: When an operation fails, the system shall classify error as transient or permanent
- **REQ-2**: While retrying, the system shall use exponential backoff (2s, 4s, 8s)
- **REQ-3**: Where max attempts reached, the system shall return the final error

#### Non-Functional Requirements
- **Performance**: Minimal overhead for successful operations
- **Flexibility**: Configurable attempts and delays
- **Logging**: Clear retry attempt logging

### Implementation Details

#### Files to Modify/Create
```
├── worker/lib/retry-helper.ts - [Create: Retry utility functions]
├── worker/lib/errors.ts - [Reference: Error classification]
└── worker/processors/base.ts - [Modify: Integrate retry helper]
```

#### Key Implementation Steps
1. **Step 1**: Create withRetry function → Core retry logic
2. **Step 2**: Add error classification → Smart retry decisions
3. **Step 3**: Implement exponential backoff → Progressive delays
4. **Step 4**: Add configurable options → Flexibility
5. **Step 5**: Integrate into base processor → Universal availability

#### Code Patterns to Follow
- **Existing Pattern**: worker/lib/youtube.ts:69-100 - Current retry implementation
- **Error Classification**: worker/lib/errors.ts:14-61 - Error types
- **Backoff Pattern**: 2^attempt * baseDelay

### Acceptance Criteria

#### Given-When-Then Scenarios
```gherkin
Scenario 1: Successful retry
  Given a transient network error
  When withRetry wraps the operation
  Then first attempt fails
  And second attempt succeeds after 2s delay
  And result is returned normally

Scenario 2: Max attempts reached
  Given an operation that always fails
  When 3 attempts are configured
  Then 3 attempts are made with delays 2s, 4s, 8s
  And final error is thrown
  And all attempts are logged

Scenario 3: Permanent error handling
  Given a permanent error (404, auth failure)
  When the error occurs
  Then no retry is attempted
  And error is immediately returned
  And classified as non-retryable
```

#### Rule-Based Criteria (Checklist)
- [ ] **Functional**: Retry logic works correctly
- [ ] **Classification**: Transient vs permanent errors
- [ ] **Backoff**: Exponential delays implemented
- [ ] **Configuration**: Customizable attempts/delays
- [ ] **Logging**: Clear retry attempt logs
- [ ] **Integration**: Base processor uses it

### Manual Testing Steps
1. **Setup**: Create test operations with various failures
2. **Test Case 1**: Test transient error retry and recovery
3. **Test Case 2**: Test permanent error immediate failure
4. **Test Case 3**: Test max attempts exhaustion
5. **Test Case 4**: Verify exponential backoff timing

### Validation & Quality Gates

#### Code Quality Checks
```bash
# Type checking
cd worker && npm run build

# Unit tests with mocked delays
npm test lib/retry-helper.test.js

# Integration test
npm run test:retry-scenarios
```

#### Definition of Done
- [ ] Retry helper implemented
- [ ] Error classification working
- [ ] Exponential backoff verified
- [ ] Integrated into base processor
- [ ] Tests passing with coverage

---

## T-010: Refactor Main Handler to Use Processors

**Priority**: Critical  
**Effort**: 4 hours

### Source PRP Document
**Reference**: docs/prps/document-processor-stabilization.md - Lines 71-73

### Task Purpose
**As a** development team  
**I need** the main handler refactored to use processor classes  
**So that** the monolithic 1,128-line file is reduced to <250 lines

### Dependencies
- **Prerequisite Tasks**: T-002 to T-006 (all processors ready)
- **Parallel Tasks**: None
- **Integration Points**: All processor classes, job handling
- **Blocked By**: T-002, T-003, T-004, T-005, T-006

### Technical Requirements

#### Functional Requirements
- **REQ-1**: When processing starts, the system shall select appropriate processor by source type
- **REQ-2**: While processing, the system shall delegate to processor class
- **REQ-3**: Where processing completes, the system shall update job status

#### Non-Functional Requirements
- **Performance**: No regression from current performance
- **Maintainability**: Main handler < 250 lines
- **Clarity**: Clear processor selection logic

### Implementation Details

#### Files to Modify/Create
```
├── worker/handlers/process-document.ts - [Modify: Refactor to use processors]
├── worker/processors/factory.ts - [Create: ProcessorFactory for selection]
└── worker/processors/index.ts - [Modify: Export all processors]
```

#### Key Implementation Steps
1. **Step 1**: Create ProcessorFactory → Processor selection logic
2. **Step 2**: Remove inline processing code → Clean main handler
3. **Step 3**: Implement processor routing → Source type mapping
4. **Step 4**: Add error handling wrapper → Consistent errors
5. **Step 5**: Verify < 250 lines → Size target met

#### Code Patterns to Follow
- **Factory Pattern**: Create processor based on source type
- **Delegation Pattern**: Handler delegates to processors
- **Error Wrapping**: Consistent error handling

### Acceptance Criteria

#### Given-When-Then Scenarios
```gherkin
Scenario 1: Processor selection
  Given a job with source_type 'youtube'
  When the handler processes the job
  Then YouTubeProcessor is instantiated
  And processing is delegated to it
  And results are properly handled

Scenario 2: Unknown source type
  Given a job with unknown source_type
  When processing is attempted
  Then clear error is returned
  And job is marked as failed
  And error suggests valid source types

Scenario 3: Handler size reduction
  Given the refactored handler
  When line count is measured
  Then file is less than 250 lines
  And all functionality is preserved
  And code is more maintainable
```

#### Rule-Based Criteria (Checklist)
- [ ] **Functional**: All source types still work
- [ ] **Size**: Main handler < 250 lines
- [ ] **Routing**: Correct processor selection
- [ ] **Error Handling**: Consistent across processors
- [ ] **Progress**: Status updates working
- [ ] **Backwards Compatible**: Existing jobs process

### Manual Testing Steps
1. **Setup**: Prepare test jobs for all source types
2. **Test Case 1**: Process PDF, verify correct processor used
3. **Test Case 2**: Process YouTube, verify delegation works
4. **Test Case 3**: Test each source type end-to-end
5. **Test Case 4**: Verify line count < 250

### Validation & Quality Gates

#### Code Quality Checks
```bash
# Line count check
wc -l worker/handlers/process-document.ts  # Must be < 250

# Build check
cd worker && npm run build

# Full integration test
npm run test:all-sources

# Regression test
npm run test:backwards-compatibility
```

#### Definition of Done
- [ ] Handler refactored to use processors
- [ ] File size < 250 lines verified
- [ ] All source types working
- [ ] No performance regression
- [ ] Code review approved

---

## T-011: Add Performance Benchmarking

**Priority**: High  
**Effort**: 3 hours

### Source PRP Document
**Reference**: docs/prps/document-processor-stabilization.md - Lines 216-218

### Task Purpose
**As a** development team  
**I need** performance benchmarking for the processing pipeline  
**So that** we can verify 50x improvement and catch regressions

### Dependencies
- **Prerequisite Tasks**: T-010 (complete refactoring first)
- **Parallel Tasks**: T-012
- **Integration Points**: All processors, batch operations, caching
- **Blocked By**: T-010

### Technical Requirements

#### Functional Requirements
- **REQ-1**: When benchmarking runs, the system shall measure processing time
- **REQ-2**: While testing, the system shall track database calls
- **REQ-3**: Where caching exists, the system shall measure hit rates

#### Non-Functional Requirements
- **Performance**: Benchmarks complete in < 5 minutes
- **Accuracy**: Measurements within 5% variance
- **Reporting**: Clear performance metrics output

### Implementation Details

#### Files to Modify/Create
```
├── worker/benchmarks/performance.js - [Create: Benchmark suite]
├── worker/benchmarks/fixtures/ - [Create: Test documents]
└── package.json - [Modify: Add benchmark scripts]
```

#### Key Implementation Steps
1. **Step 1**: Create benchmark harness → Testing framework
2. **Step 2**: Add timing measurements → Performance data
3. **Step 3**: Track database call counts → Efficiency metrics
4. **Step 4**: Measure cache hit rates → Cache effectiveness
5. **Step 5**: Create comparison reports → Before/after metrics

#### Code Patterns to Follow
- **Timing Pattern**: Use performance.now() for precision
- **Metrics Pattern**: Track calls, time, memory
- **Reporting Pattern**: JSON and human-readable output

### Acceptance Criteria

#### Given-When-Then Scenarios
```gherkin
Scenario 1: Performance measurement
  Given the benchmark suite
  When processing a 50-page PDF
  Then processing time is measured
  And database call count is tracked
  And results show 50x improvement

Scenario 2: Cache effectiveness
  Given repeated document processing
  When cache is enabled
  Then hit rate is measured
  And shows >80% cache hits
  And upload count is reduced

Scenario 3: Regression detection
  Given baseline performance metrics
  When new changes are tested
  Then performance is compared
  And regressions are flagged
  And detailed report is generated
```

#### Rule-Based Criteria (Checklist)
- [ ] **Metrics**: Time, calls, memory tracked
- [ ] **Targets**: 50x improvement verified
- [ ] **Cache**: Hit rate measurement working
- [ ] **Reports**: Clear output format
- [ ] **Automation**: Can run in CI/CD
- [ ] **Fixtures**: Representative test data

### Manual Testing Steps
1. **Setup**: Prepare benchmark fixtures
2. **Test Case 1**: Run baseline benchmark (old code)
3. **Test Case 2**: Run new benchmark (refactored code)
4. **Test Case 3**: Compare results, verify improvement
5. **Test Case 4**: Test cache effectiveness metrics

### Validation & Quality Gates

#### Code Quality Checks
```bash
# Run benchmarks
npm run benchmark:all

# Specific benchmarks
npm run benchmark:pdf
npm run benchmark:batch
npm run benchmark:cache

# Generate report
npm run benchmark:report
```

#### Definition of Done
- [ ] Benchmark suite created
- [ ] All metrics tracked
- [ ] 50x improvement confirmed
- [ ] Cache metrics implemented
- [ ] Documentation updated

---

## T-012: Integration Testing and Validation

**Priority**: Critical  
**Effort**: 6 hours

### Source PRP Document
**Reference**: docs/prps/document-processor-stabilization.md - Lines 207-218

### Task Purpose
**As a** development team  
**I need** comprehensive integration testing  
**So that** we validate the entire refactored system works correctly

### Dependencies
- **Prerequisite Tasks**: T-010 (refactoring complete)
- **Parallel Tasks**: T-011
- **Integration Points**: All processors, all features
- **Blocked By**: T-010

### Technical Requirements

#### Functional Requirements
- **REQ-1**: When testing, the system shall process documents from all source types
- **REQ-2**: While validating, the system shall verify output quality
- **REQ-3**: Where errors occur, the system shall verify recovery

#### Non-Functional Requirements
- **Performance**: Meet all performance targets
- **Coverage**: Test all source types and edge cases
- **Reliability**: Verify error handling and recovery

### Implementation Details

#### Files to Modify/Create
```
├── worker/tests/integration/ - [Create: Integration test suite]
├── worker/tests/fixtures/ - [Create: Test documents]
├── worker/tests/validation.js - [Create: Output validation]
└── package.json - [Modify: Add test scripts]
```

#### Key Implementation Steps
1. **Step 1**: Create integration test suite → Test framework
2. **Step 2**: Add fixtures for all source types → Test data
3. **Step 3**: Implement output validation → Quality checks
4. **Step 4**: Test error scenarios → Recovery validation
5. **Step 5**: Run full validation suite → Complete verification

#### Code Patterns to Follow
- **Test Pattern**: End-to-end processing tests
- **Validation Pattern**: Schema and content validation
- **Error Testing**: Simulate various failure modes

### Acceptance Criteria

#### Given-When-Then Scenarios
```gherkin
Scenario 1: Full pipeline validation
  Given test documents for all source types
  When integration tests run
  Then all documents process successfully
  And output quality meets standards
  And performance targets are met

Scenario 2: Error recovery testing
  Given simulated failure conditions
  When errors occur during processing
  Then retry logic activates appropriately
  And graceful degradation occurs
  And clear error messages are provided

Scenario 3: Backwards compatibility
  Given existing processed documents
  When the new system processes them
  Then output is compatible
  And no data loss occurs
  And migrations work correctly
```

#### Rule-Based Criteria (Checklist)
- [ ] **Coverage**: All source types tested
- [ ] **Quality**: Output validation passing
- [ ] **Performance**: Targets met for all types
- [ ] **Errors**: Recovery mechanisms work
- [ ] **Compatibility**: Existing data works
- [ ] **Documentation**: Test results documented

### Manual Testing Steps
1. **Setup**: Deploy to test environment
2. **Test Case 1**: Process 10 PDFs of varying sizes
3. **Test Case 2**: Process 10 YouTube videos
4. **Test Case 3**: Process various web articles
5. **Test Case 4**: Test error conditions and recovery
6. **Test Case 5**: Verify performance improvements

### Validation & Quality Gates

#### Code Quality Checks
```bash
# Run all tests
cd worker && npm test

# Integration tests only
npm run test:integration

# Validation suite
npm run test:validate

# Full validation with report
npm run test:full-validation
```

#### Definition of Done
- [ ] All integration tests passing
- [ ] Performance targets verified
- [ ] Error handling validated
- [ ] Backwards compatibility confirmed
- [ ] Test report generated
- [ ] Sign-off from team

---

## Summary & Delivery Checklist

### Week 1 Deliverables
- [ ] Base processor abstraction (T-001)
- [ ] All source processors extracted (T-002 to T-006)
- [ ] Gemini file caching implemented (T-007)
- [ ] Batch database operations working (T-008)
- [ ] Retry logic generalized (T-009)
- [ ] Main handler refactored < 250 lines (T-010)
- [ ] Performance benchmarks showing 50x improvement (T-011)
- [ ] Full integration testing passed (T-012)

### Success Metrics
- ✅ 100% document processing success rate
- ✅ Chunk insertion 50x faster (100 calls → 2)
- ✅ Main handler reduced to <250 lines
- ✅ Zero Gemini quota waste from re-uploads
- ✅ All tests passing with >80% coverage

### Risk Mitigation
- **If behind schedule**: Prioritize T-001, T-002, T-007, T-008, T-010 (critical path)
- **If tests fail**: Use gradual rollout with feature flags
- **If performance targets missed**: Profile and optimize bottlenecks in Week 2

### Handoff Requirements
- [ ] Code review completed
- [ ] Documentation updated
- [ ] Performance report generated
- [ ] Integration tests passing
- [ ] Deployment guide prepared