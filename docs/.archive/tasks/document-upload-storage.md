# Technical Task Breakdown: Document Upload to Storage

**Feature:** Document Upload to Storage System  
**Source PRP:** `/docs/prps/document-upload-storage.md`  
**Date:** January 25, 2025  
**Complexity:** Complex (12.5 days, 7 phases)  
**Priority:** Critical - Core feature for MVP  

---

## PRP Analysis Summary

### Feature Scope
A sophisticated document ingestion system supporting multiple file formats (PDF, TXT, Markdown, EPUB, YouTube) with two-phase AI processing through Gemini. The system provides real-time progress tracking via a bottom dock UI (no modals philosophy) and stores documents using a hybrid approach: large files in Supabase Storage, queryable chunks in PostgreSQL.

### Key Technical Requirements
- Multi-file batch upload (up to 10 files, max 50MB each)
- Two-phase Gemini processing: Quick metadata (<5s) + Full extraction (<2min)
- Real-time progress tracking via ProcessingDock component
- Semantic chunking with embeddings (768 dimensions)
- YouTube transcript integration with fallback handling
- Export capability for data ownership

### Validation Requirements  
- Upload success rate > 95%
- Processing time < 2 minutes for 20-page documents
- Metadata extraction accuracy > 80%
- Zero data loss during processing
- Cost per document < $0.10

---

## Task Complexity Assessment

### Overall Complexity: **Complex**

### Technical Challenges
- **Gemini API Integration**: Multi-model usage (Flash, Pro, Embeddings)
- **Real-time Updates**: WebSocket subscriptions for progress tracking
- **Hybrid Storage**: Coordinating between Storage and PostgreSQL
- **Background Processing**: Edge Functions with progress reporting
- **YouTube Integration**: External API with fallback handling

### Integration Points
- Supabase Storage API
- Supabase Realtime subscriptions  
- Gemini API (3 different models)
- YouTube Transcript API
- ECS entity management system

---

## Phase Organization

### Phase 1: Foundation & UI Components
**Objective:** Create upload interface and preview system  
**Deliverables:** Upload zone, preview cards, batch grid  
**Milestones:** User can select and preview files  

### Phase 2: Storage & Validation
**Objective:** Secure file upload with validation  
**Deliverables:** Server actions, signed URLs, file validation  
**Milestones:** Files successfully upload to Supabase Storage  

### Phase 3: AI Metadata Extraction  
**Objective:** Quick metadata extraction with Gemini Flash  
**Deliverables:** Metadata extraction endpoint, cost estimation  
**Milestones:** Metadata displayed within 5 seconds  

### Phase 4: Processing Pipeline
**Objective:** Full document processing with chunking  
**Deliverables:** Edge Function, Gemini Pro integration, embeddings  
**Milestones:** Documents fully processed with searchable chunks  

### Phase 5: Progress Tracking
**Objective:** Real-time progress visualization  
**Deliverables:** ProcessingDock, realtime subscriptions  
**Milestones:** Users see live processing status  

### Phase 6: YouTube Integration
**Objective:** Support YouTube transcript processing  
**Deliverables:** Transcript fetching, cleaning, fallbacks  
**Milestones:** YouTube URLs processed successfully  

### Phase 7: Testing & Polish
**Objective:** Ensure production readiness  
**Deliverables:** Integration tests, error handling, documentation  
**Milestones:** All validation gates pass  

---

## Detailed Task Breakdown

### TASK-001: Database Schema Migration
**Priority:** Critical  
**Phase:** Foundation  
**Dependencies:** None  
**Estimated Time:** 2 hours  

**Description:**  
Create and apply database migrations for document upload feature including processing_queue table, document table updates, and RLS policies.

**Acceptance Criteria:**
- **Given** the database schema in the PRP
- **When** migrations are applied
- **Then** all tables and indexes are created successfully
- **And** RLS policies are active and tested
- **And** rollback script is available

**Implementation Details:**
- Create migration file: `supabase/migrations/002_document_upload.sql`
- Add processing_queue table with status tracking
- Update documents table with new columns
- Create required indexes for performance
- Implement RLS policies for user isolation

**Manual Testing Steps:**
1. Run `npx supabase db reset` to verify clean migration
2. Insert test document record
3. Verify RLS blocks cross-user access
4. Test queue status updates
5. Verify indexes with EXPLAIN queries

---

### TASK-002: Upload Zone Component
**Priority:** High  
**Phase:** Foundation & UI  
**Dependencies:** TASK-001  
**Estimated Time:** 4 hours  

**Description:**  
Implement drag & drop upload interface supporting multiple file formats with validation and preview generation.

**Acceptance Criteria:**
- **Given** a user on the upload page
- **When** they drag files onto the zone
- **Then** files are validated for type and size
- **And** preview cards are generated for valid files
- **And** batch upload is limited to 10 files
- **And** invalid files show error messages

**Implementation Details:**
- Create `src/components/upload/UploadZone.tsx`
- Use react-dropzone for drag & drop functionality
- Reference `src/components/ui/card.tsx` for component patterns
- Implement file type validation (PDF, TXT, MD, EPUB)
- Enforce 50MB size limit per file
- Generate preview state for each accepted file

**Manual Testing Steps:**
1. Drag single PDF file - should show preview
2. Drag 11 files - should reject with limit message
3. Drag 60MB file - should reject with size error
4. Drag invalid file type - should reject
5. Test file picker as alternative to drag & drop

---

### TASK-003: Document Preview Card Component
**Priority:** High  
**Phase:** Foundation & UI  
**Dependencies:** TASK-002  
**Estimated Time:** 3 hours  

**Description:**  
Create preview card component displaying file metadata with AI enhancement option and cover image selector.

**Acceptance Criteria:**
- **Given** a file has been uploaded
- **When** the preview card is displayed
- **Then** it shows filename or extracted title
- **And** displays author if available
- **And** shows AI enhance button with sparkle icon
- **And** allows cover image selection/upload
- **And** displays extracted themes as badges

**Implementation Details:**
- Create `src/components/upload/DocumentPreviewCard.tsx`
- Create `src/components/upload/CoverImageSelector.tsx`
- Use shadcn Card, Badge, Button components
- Implement three cover options: extract/upload/none
- Add loading state for AI enhancement

**Manual Testing Steps:**
1. Upload PDF - verify default preview displays
2. Click AI enhance - verify loading state
3. Select custom cover image - verify upload
4. Remove cover image - verify none option
5. Verify theme badges display correctly

---

### TASK-004: Signed URL Generation
**Priority:** Critical  
**Phase:** Storage & Validation  
**Dependencies:** TASK-001  
**Estimated Time:** 3 hours  

**Description:**  
Implement server action for generating signed upload URLs with document record creation and validation.

**Acceptance Criteria:**
- **Given** a user wants to upload a file
- **When** they request a signed URL
- **Then** a unique document ID is generated
- **And** a document record is created in the database
- **And** a signed URL is returned (60 second expiry)
- **And** the storage path follows userId/documentId pattern
- **And** unauthorized users receive error

**Implementation Details:**
- Create `src/app/actions/upload.ts`
- Implement `createSignedUploadUrl` server action
- Use Supabase service client for Storage API
- Generate UUID for document ID
- Create atomic document record with rollback
- Follow storage pattern: `userId/documentId/source-filename`

**Manual Testing Steps:**
1. Request signed URL as authenticated user - should succeed
2. Request signed URL as unauthenticated - should fail
3. Verify document record created in database
4. Test URL expires after 60 seconds
5. Verify storage path structure is correct

---

### TASK-005: File Upload with Progress
**Priority:** High  
**Phase:** Storage & Validation  
**Dependencies:** TASK-004  
**Estimated Time:** 4 hours  

**Description:**  
Implement file upload using XMLHttpRequest with real-time progress tracking and error handling.

**Acceptance Criteria:**
- **Given** a signed URL has been obtained
- **When** the file upload begins
- **Then** progress updates are emitted every 10%
- **And** upload completion triggers processing
- **And** upload failures are handled gracefully
- **And** retry mechanism is available for failures

**Implementation Details:**
- Update UploadZone with XMLHttpRequest upload
- Implement progress callback with state updates
- Create upload status tracking (pending/uploading/complete/failed)
- Add retry logic with exponential backoff
- Trigger processing on successful upload

**Manual Testing Steps:**
1. Upload 10MB file - verify progress increments
2. Interrupt upload - verify error handling
3. Retry failed upload - verify success
4. Upload multiple files - verify concurrent progress
5. Test slow connection simulation

---

### TASK-006: Metadata Extraction API
**Priority:** High  
**Phase:** AI Metadata Extraction  
**Dependencies:** TASK-005  
**Estimated Time:** 4 hours  

**Description:**  
Create API endpoint for quick metadata extraction using Gemini Flash model with cost estimation.

**Acceptance Criteria:**
- **Given** a document has been uploaded
- **When** metadata extraction is requested
- **Then** Gemini Flash processes first 1MB of content
- **And** extraction completes within 5 seconds
- **And** metadata includes title, author, summary, themes
- **And** cost estimate is calculated for full processing
- **And** processing queue is updated with metadata

**Implementation Details:**
- Create `src/app/api/metadata/extract/route.ts`
- Use Gemini Flash model for speed
- Limit input to first 1MB for quick processing
- Implement structured JSON output schema
- Calculate token-based cost estimate
- Update both documents and processing_queue tables

**Manual Testing Steps:**
1. Extract metadata from 5-page PDF - < 5 seconds
2. Extract metadata from academic paper - verify accuracy
3. Verify cost estimate reasonable ($0.01-0.10)
4. Check database updates in both tables
5. Test with various document types

---

### TASK-007: Processing Queue Entry
**Priority:** Critical  
**Phase:** AI Metadata Extraction  
**Dependencies:** TASK-006  
**Estimated Time:** 2 hours  

**Description:**  
Create processing queue entries with status tracking and trigger Edge Function for background processing.

**Acceptance Criteria:**
- **Given** a document needs processing
- **When** processing is triggered
- **Then** a queue entry is created with pending status
- **And** the Edge Function is invoked with document ID
- **And** queue ID is returned for tracking
- **And** status updates are atomic

**Implementation Details:**
- Create `triggerDocumentProcessing` server action
- Insert processing_queue record with user_id
- Invoke `process-document` Edge Function
- Handle Edge Function invocation errors
- Return queue ID for progress tracking

**Manual Testing Steps:**
1. Trigger processing - verify queue entry created
2. Check Edge Function invoked successfully
3. Verify queue status is "pending"
4. Test concurrent processing triggers
5. Verify user isolation via RLS

---

### TASK-008: Edge Function Setup
**Priority:** Critical  
**Phase:** Processing Pipeline  
**Dependencies:** TASK-007  
**Estimated Time:** 6 hours  

**Description:**  
Implement Supabase Edge Function for full document processing with Gemini Pro, including markdown extraction and semantic chunking.

**Acceptance Criteria:**
- **Given** an Edge Function receives a document ID
- **When** processing begins
- **Then** document is downloaded from storage
- **And** Gemini Pro extracts full markdown
- **And** content is semantically chunked (300-500 words)
- **And** markdown is saved to storage
- **And** chunks are saved to database
- **And** processing completes < 2 minutes for 20 pages

**Implementation Details:**
- Create `supabase/functions/process-document/index.ts`
- Use Gemini 1.5 Pro for quality extraction
- Implement structured extraction prompt
- Save markdown to storage (not database)
- Create semantic chunks with themes
- Update queue status at each stage

**Manual Testing Steps:**
1. Process 5-page PDF - verify markdown quality
2. Process 20-page document - verify < 2 minutes
3. Check markdown saved to storage correctly
4. Verify chunks in database with themes
5. Monitor queue status updates

---

### TASK-009: Embedding Generation
**Priority:** High  
**Phase:** Processing Pipeline  
**Dependencies:** TASK-008  
**Estimated Time:** 3 hours  

**Description:**  
Generate embeddings for each chunk using Gemini text-embedding-004 model for similarity search.

**Acceptance Criteria:**
- **Given** chunks have been created
- **When** embeddings are generated
- **Then** each chunk receives a 768-dimension embedding
- **And** embeddings are stored in chunks table
- **And** pgvector indexes are utilized
- **And** batch processing is used for efficiency

**Implementation Details:**
- Extend Edge Function with embedding generation
- Use Gemini text-embedding-004 model
- Batch chunks for efficient API calls
- Store embeddings in PostgreSQL vector column
- Update progress during embedding generation
- Handle API rate limits gracefully

**Manual Testing Steps:**
1. Verify embeddings have 768 dimensions
2. Test similarity search with embeddings
3. Monitor API usage and rate limits
4. Verify batch processing works
5. Check pgvector index performance

---

### TASK-010: Processing Dock Component
**Priority:** High  
**Phase:** Progress Tracking  
**Dependencies:** TASK-009  
**Estimated Time:** 4 hours  

**Description:**  
Create bottom dock component for processing status display with minimize/expand functionality.

**Acceptance Criteria:**
- **Given** documents are being processed
- **When** the processing dock is visible
- **Then** it shows at the bottom of the screen
- **And** displays progress for each document
- **And** can be minimized to header bar only
- **And** shows completion actions when ready
- **And** never blocks main content (no modal)

**Implementation Details:**
- Create `src/components/processing/ProcessingDock.tsx`
- Implement fixed bottom positioning
- Add minimize/expand with animation
- Show progress bars for each document
- Display status messages and errors
- Add action buttons on completion

**Manual Testing Steps:**
1. Process multiple documents - all visible
2. Minimize dock - verify header remains
3. Expand dock - verify smooth animation
4. Complete processing - verify action buttons
5. Verify dock never covers content

---

### TASK-011: Realtime Progress Updates
**Priority:** High  
**Phase:** Progress Tracking  
**Dependencies:** TASK-010  
**Estimated Time:** 4 hours  

**Description:**  
Implement realtime subscriptions to processing queue for live progress updates.

**Acceptance Criteria:**
- **Given** a processing queue subscription is active
- **When** queue status updates occur
- **Then** UI updates immediately without polling
- **And** progress percentages are reflected
- **And** status messages are displayed
- **And** connection failures are handled gracefully

**Implementation Details:**
- Create `src/hooks/useProcessingStatus.ts`
- Setup Supabase realtime channel subscription
- Subscribe to processing_queue table changes
- Handle connection lifecycle and retries
- Update ProcessingDock with live data
- Implement fallback polling if needed

**Manual Testing Steps:**
1. Start processing - verify instant updates
2. Watch progress increment in real-time
3. Disconnect network - verify reconnection
4. Process multiple documents - all update
5. Verify no duplicate subscriptions

---

### TASK-012: YouTube Transcript API
**Priority:** Medium  
**Phase:** YouTube Integration  
**Dependencies:** TASK-008  
**Estimated Time:** 3 hours  

**Description:**  
Create API endpoint for fetching and processing YouTube transcripts with Gemini cleaning.

**Acceptance Criteria:**
- **Given** a YouTube URL is provided
- **When** transcript processing is requested
- **Then** video ID is extracted from URL
- **And** transcript is fetched if available
- **And** Gemini cleans and formats the transcript
- **And** fallback options are provided if unavailable
- **And** thumbnail URL is generated

**Implementation Details:**
- Create `src/app/api/youtube/transcript/route.ts`
- Use youtube-transcript npm package
- Extract video ID from multiple URL formats
- Process transcript with Gemini for cleanup
- Handle missing transcripts gracefully
- Generate thumbnail URL pattern

**Manual Testing Steps:**
1. Process YouTube URL with transcript - success
2. Process URL without transcript - show fallback
3. Test short URL format (youtu.be)
4. Verify transcript cleaning quality
5. Check thumbnail URL correctness

---

### TASK-013: YouTube UI Integration
**Priority:** Medium  
**Phase:** YouTube Integration  
**Dependencies:** TASK-012  
**Estimated Time:** 2 hours  

**Description:**  
Add YouTube URL input support to upload interface with special handling.

**Acceptance Criteria:**
- **Given** the upload interface is displayed
- **When** a YouTube URL is entered
- **Then** it's recognized as YouTube content
- **And** transcript availability is checked
- **And** video thumbnail is displayed if available
- **And** processing uses YouTube-specific pipeline

**Implementation Details:**
- Extend UploadZone to detect YouTube URLs
- Add URL input field option
- Display YouTube-specific preview card
- Use video thumbnail as cover image
- Route to YouTube processing endpoint

**Manual Testing Steps:**
1. Paste YouTube URL - verify detection
2. Check thumbnail displays correctly
3. Verify transcript check happens
4. Process video - verify markdown output
5. Test invalid YouTube URLs

---

### TASK-014: Batch Upload Management
**Priority:** Medium  
**Phase:** Foundation & UI  
**Dependencies:** TASK-002, TASK-005  
**Estimated Time:** 3 hours  

**Description:**  
Implement batch upload grid for managing multiple simultaneous uploads.

**Acceptance Criteria:**
- **Given** multiple files are selected
- **When** batch upload begins
- **Then** all files display in a grid layout
- **And** each shows individual progress
- **And** failures don't affect other uploads
- **And** limit of 10 concurrent uploads is enforced

**Implementation Details:**
- Create `src/components/upload/BatchUploadGrid.tsx`
- Implement grid layout with progress tracking
- Handle concurrent upload state management
- Add remove/retry options per file
- Coordinate processing triggers

**Manual Testing Steps:**
1. Upload 5 files - verify grid layout
2. Upload 10 files - verify limit enforcement
3. Fail one upload - others continue
4. Remove file from batch - verify cleanup
5. Test mixed file types in batch

---

### TASK-015: Cost Estimation Display
**Priority:** Low  
**Phase:** AI Metadata Extraction  
**Dependencies:** TASK-006  
**Estimated Time:** 2 hours  

**Description:**  
Display processing cost estimates to users before full processing begins.

**Acceptance Criteria:**
- **Given** metadata has been extracted
- **When** cost estimate is calculated
- **Then** estimated cost is displayed to user
- **And** cost is based on file size and complexity
- **And** user can proceed or cancel
- **And** running total shown for batch uploads

**Implementation Details:**
- Add cost display to DocumentPreviewCard
- Calculate based on token estimates
- Show running total for multiple documents
- Add confirmation before processing
- Store estimates in database

**Manual Testing Steps:**
1. Upload small file - verify low cost
2. Upload large file - verify proportional cost
3. Batch upload - verify total calculation
4. Cancel based on cost - verify handling
5. Compare estimate to actual usage

---

### TASK-016: Error Recovery System
**Priority:** High  
**Phase:** Testing & Polish  
**Dependencies:** All processing tasks  
**Estimated Time:** 4 hours  

**Description:**  
Implement comprehensive error handling with retry mechanisms and user feedback.

**Acceptance Criteria:**
- **Given** an error occurs during processing
- **When** the error is detected
- **Then** specific error message is shown
- **And** retry option is available where appropriate
- **And** partial progress is preserved
- **And** errors are logged for debugging

**Implementation Details:**
- Add error boundaries to all components
- Implement retry logic with exponential backoff
- Create user-friendly error messages
- Add error logging to Supabase
- Preserve successful partial uploads

**Manual Testing Steps:**
1. Simulate network failure - verify recovery
2. Exceed file size limit - clear message
3. Invalid file type - helpful feedback
4. API rate limit - retry with backoff
5. Database error - graceful degradation

---

### TASK-017: Integration Testing Suite
**Priority:** High  
**Phase:** Testing & Polish  
**Dependencies:** All tasks  
**Estimated Time:** 4 hours  

**Description:**  
Create comprehensive integration tests for the complete upload flow.

**Acceptance Criteria:**
- **Given** the test suite is executed
- **When** all tests complete
- **Then** upload flow is validated end-to-end
- **And** edge cases are covered
- **And** performance benchmarks are met
- **And** test coverage exceeds 80%

**Implementation Details:**
- Create `test/integration/upload.test.ts`
- Test complete upload → process → read flow
- Include edge cases and error scenarios
- Add performance benchmarks
- Mock external APIs for reliability

**Manual Testing Steps:**
1. Run full test suite - all pass
2. Check coverage report - > 80%
3. Verify mocked APIs work correctly
4. Test with various file types
5. Validate performance benchmarks

---

### TASK-018: Documentation & Cleanup
**Priority:** Medium  
**Phase:** Testing & Polish  
**Dependencies:** TASK-017  
**Estimated Time:** 2 hours  

**Description:**  
Complete JSDoc documentation and code cleanup for production readiness.

**Acceptance Criteria:**
- **Given** all code is complete
- **When** documentation is added
- **Then** all functions have JSDoc comments
- **And** complex logic is explained
- **And** API endpoints are documented
- **And** setup instructions are provided

**Implementation Details:**
- Add JSDoc to all exported functions
- Document API request/response formats
- Create setup guide for new developers
- Remove debug code and console.logs
- Run linter and fix all issues

**Manual Testing Steps:**
1. Run `npm run lint` - no errors
2. Run `npm run build` - successful
3. Check JSDoc completeness
4. Verify no console.logs remain
5. Test setup instructions work

---

## Implementation Recommendations

### Suggested Team Structure
- **Frontend Developer**: Tasks 2, 3, 10, 14 (UI components)
- **Backend Developer**: Tasks 4, 5, 7, 8, 9 (processing pipeline)
- **Full-Stack Developer**: Tasks 6, 11, 12, 13 (API and integration)
- **QA Engineer**: Tasks 16, 17, 18 (testing and quality)

### Optimal Task Sequencing
1. **Day 1-2**: Database setup (TASK-001) → Upload UI (TASK-002, 003)
2. **Day 3-4**: Storage integration (TASK-004, 005) → Batch support (TASK-014)
3. **Day 5-6**: Metadata extraction (TASK-006, 007) → Cost display (TASK-015)
4. **Day 7-9**: Processing pipeline (TASK-008, 009)
5. **Day 10-11**: Progress tracking (TASK-010, 011)
6. **Day 12**: YouTube integration (TASK-012, 013)
7. **Day 13-14**: Testing and polish (TASK-016, 017, 018)

### Parallelization Opportunities
- **Parallel Track 1**: UI components (Tasks 2, 3, 10, 14) - can proceed independently
- **Parallel Track 2**: Backend processing (Tasks 8, 9) - after storage is ready
- **Parallel Track 3**: YouTube feature (Tasks 12, 13) - independent module
- **Parallel Track 4**: Testing setup (Task 17) - can start early with mocks

---

## Critical Path Analysis

### Critical Path Tasks
These tasks block subsequent work and must be completed on schedule:
1. **TASK-001** (Database Schema) → Blocks everything
2. **TASK-004** (Signed URLs) → Blocks all uploads
3. **TASK-008** (Edge Function) → Blocks processing
4. **TASK-010** (Processing Dock) → Blocks user feedback

### Potential Bottlenecks
- **Gemini API Integration**: Rate limits and response times
- **Edge Function Timeouts**: Large document processing
- **Realtime Subscriptions**: Connection stability
- **YouTube API**: External dependency

### Schedule Optimization
- Start UI components immediately (low dependency)
- Parallelize YouTube integration (independent)
- Begin testing setup early with mocks
- Keep one developer on critical path at all times

---

## Risk Indicators

### High Risk Tasks
- **TASK-008** (Edge Function): Complex Gemini integration
- **TASK-011** (Realtime): WebSocket stability concerns
- **TASK-012** (YouTube): External API dependency

### Medium Risk Tasks  
- **TASK-009** (Embeddings): API rate limits
- **TASK-016** (Error Recovery): Edge case complexity

### Low Risk Tasks
- **TASK-002, 003** (UI Components): Well-understood patterns
- **TASK-001** (Database): Clear schema provided
- **TASK-018** (Documentation): Straightforward

---

## Success Metrics

### Sprint Metrics
- All 18 tasks completed within 14 days
- Zero critical bugs in production
- All validation gates passed
- Test coverage > 80%

### Feature Metrics
- Upload success rate > 95%
- Processing time < 2 min (20 pages)
- Metadata accuracy > 80%
- User satisfaction > 4.5/5

### Technical Metrics
- API costs < $0.10 per document
- No memory leaks detected
- Page load time < 2 seconds
- 99% uptime achieved

---

## Notes

- All tasks reference the PRP document for detailed implementation code
- Follow the "no modals" UI philosophy throughout
- Use existing ECS patterns from `/src/lib/ecs/ecs.ts`
- Reference UI components in `/src/components/ui/`
- Gemini API is the ONLY method for PDF processing (no PDF libraries)
- Large files go to Storage, queries go to PostgreSQL (hybrid pattern)
- Every exported function requires JSDoc documentation







