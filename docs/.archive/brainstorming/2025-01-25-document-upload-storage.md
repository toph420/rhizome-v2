# Brainstorming Session: Document Upload to Storage

**Date:** January 25, 2025  
**Participants:** Development Team  
**Facilitator:** Scrum Master  
**Feature:** Document Upload to Storage System

---

## 1. Executive Summary

### Feature Overview
A sophisticated document ingestion system that accepts multiple file formats (PDF, TXT, Markdown, EPUB, YouTube transcripts), processes them through AI to create clean markdown versions, and provides a delightful upload experience with real-time progress tracking.

### Key Outcomes
- Multi-file batch upload capability (up to 10 concurrent)
- Two-phase AI processing (quick metadata + full extraction)
- Beautiful preview cards with optional cover images
- Background processing with real-time progress updates
- YouTube transcript integration with thumbnail fetching

### Critical Decisions Made
- Use Supabase Edge Functions for processing queue
- Implement realtime subscriptions for progress tracking
- Store files in hybrid pattern: originals in Storage, metadata in DB
- 50MB file size limit initially
- Show cost estimates but don't enforce limits (single-user mode)

---

## 2. Requirements & User Stories

### Primary User Story
**As a** knowledge worker  
**I want to** upload documents in various formats  
**So that I can** read, annotate, and create flashcards from them in a beautiful interface

### Acceptance Criteria
- [ ] Supports PDF, TXT, Markdown, EPUB, YouTube transcripts
- [ ] Drag & drop or file picker interface
- [ ] Batch upload up to 10 documents simultaneously
- [ ] AI-enhanced metadata extraction (title, author, summary)
- [ ] Optional cover image (extract/upload/none)
- [ ] Background processing with progress visibility
- [ ] Delightful completion notifications
- [ ] Maximum file size: 50MB

### User Flow
1. User drags files onto upload zone
2. Preview cards appear with extracted/default metadata
3. User can enhance metadata with AI (magic stars button)
4. User can add/change cover image (optional)
5. User confirms upload
6. Files process in background with progress in dock
7. Completion notification with action buttons (Read Now, View in Library, Create Flashcards)

---

## 3. Technical Architecture

### Storage Structure
```
userId/
└── documentId/
    ├── source-{originalfilename}.ext  # Original upload
    ├── content.md                     # Processed markdown
    ├── cover.jpg                      # Optional cover image
    └── export.bundle.zip              # Future: export package
```

### Processing Pipeline
```typescript
// 1. Quick Metadata Extraction (seconds)
POST /api/metadata/extract
- First few pages to Gemini
- Returns: title, author, summary, themes, tags

// 2. Full Document Processing (minutes)
POST /api/process/document
- Complete document to Gemini 1.5 Pro
- Extraction + Chunking + Analysis
- Updates via realtime subscription

// 3. YouTube Special Handling
POST /api/youtube/transcript
- Server-side youtube-transcript library
- Preserve timestamps if available
- Process through Gemini for clean markdown
- Thumbnail via predictable URL pattern
```

### Database Schema Updates
```sql
-- Add to documents table
ALTER TABLE documents ADD COLUMN
  original_filename TEXT,
  cover_image_path TEXT,
  processing_queue_id UUID,
  cost_estimate DECIMAL(10,4);

-- Processing queue table
CREATE TABLE processing_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID REFERENCES documents,
  status TEXT DEFAULT 'pending', -- pending|metadata|processing|chunking|embedding|complete|failed
  progress INTEGER DEFAULT 0, -- 0-100
  status_message TEXT,
  error_message TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## 4. Implementation Tasks

### Phase 1: Upload UI Components (2 days)
- [ ] Create `UploadZone` component with drag & drop
- [ ] Build `DocumentPreviewCard` with metadata display
- [ ] Implement `CoverImageSelector` (extract/upload/none)
- [ ] Add AI metadata enhancement button with loading state
- [ ] Design batch upload grid layout

### Phase 2: File Validation & Storage (1 day)
- [ ] Implement file type validation
- [ ] Add 50MB size limit check
- [ ] Create storage upload logic with proper paths
- [ ] Handle batch file uploads
- [ ] Generate unique document IDs

### Phase 3: AI Metadata Extraction (2 days)
- [ ] Create `/api/metadata/extract` endpoint
- [ ] Implement Gemini quick analysis (first pages)
- [ ] Add cost estimation logic
- [ ] Build metadata form with AI suggestions
- [ ] Handle extraction failures gracefully

### Phase 4: Processing Queue System (3 days)
- [ ] Create Supabase Edge Function for processing
- [ ] Implement queue management (10 concurrent limit)
- [ ] Add progress tracking with status updates
- [ ] Set up realtime subscriptions
- [ ] Build retry mechanism for failures

### Phase 5: Processing Dock UI (2 days)
- [ ] Create `ProcessingDock` component
- [ ] Implement progress bars for each document
- [ ] Add status messages and animations
- [ ] Build minimize/expand functionality
- [ ] Create completion notifications

### Phase 6: YouTube Integration (1.5 days)
- [ ] Add YouTube URL detection
- [ ] Implement transcript fetching API with timestamps
- [ ] Create thumbnail URL generator
- [ ] Process transcripts through AI for clean markdown
- [ ] Add timestamp preservation toggle option
- [ ] Format timestamps as markdown links/anchors
- [ ] Add fallback to external transcript services
- [ ] Handle YouTube-specific metadata (channel, duration, publish date)

### Phase 7: Integration & Polish (1 day)
- [ ] Connect all components
- [ ] Add error handling throughout
- [ ] Implement analytics tracking
- [ ] Create success animations
- [ ] Write user documentation

### Phase 8: Cross-Document Connection Detection (15 days)
**Backend (5 days)** - See developer implementation notes
- [ ] Connection detection infrastructure
- [ ] pgvector similarity search
- [ ] Connection type analysis
- [ ] ECS entity creation
- [ ] Background job processing

**Frontend (15 days)** - See detailed specification: `/docs/brainstorming/2025-01-26-connection-detection-phase8.md`
- [ ] Margin indicators with color coding (2 days)
- [ ] Connection preview cards (1.5 days)
- [ ] Connection sidebar panel (2 days)
- [ ] Split-screen comparison view (3 days)
- [ ] Manual connection creation (2 days)
- [ ] Connection-based flashcards (1.5 days)
- [ ] Notifications & activity feed (2 days)
- [ ] Document privacy settings (1 day)

**Total Estimate:** 32.5 days (was 12.5 days)

---

## 5. Technical Decisions & Rationale

### Decision: Supabase Edge Functions for Processing
**Rationale:** Native integration, built-in queue management, realtime support
**Alternative Considered:** External queue service (AWS SQS)
**Risk:** Vendor lock-in, but acceptable for MVP

### Decision: Two-Phase AI Processing
**Rationale:** Quick metadata for responsive UX, full processing in background
**Alternative Considered:** Single processing phase
**Trade-off:** Additional API call but much better user experience

### Decision: Hybrid Storage Pattern
**Rationale:** Large files in Storage, queryable data in DB
**Alternative Considered:** Everything in DB
**Impact:** Better performance, lower DB costs

### Decision: 50MB File Size Limit
**Rationale:** Balance between capability and cost/performance
**Alternative Considered:** 100MB limit
**Future:** Can increase based on usage patterns

---

## 6. Risks & Mitigation Strategies

### Risk: AI Processing Costs
**Probability:** Medium  
**Impact:** High  
**Mitigation:** Show estimates, monitor usage, implement quotas if needed

### Risk: Processing Queue Bottlenecks
**Probability:** Low  
**Impact:** Medium  
**Mitigation:** 10-document limit, queue prioritization, horizontal scaling ready

### Risk: YouTube Transcript Fetching Breaks
**Probability:** High  
**Impact:** Low  
**Mitigation:** Fallback to manual paste, external service links, clear user messaging

### Risk: Large File Upload Timeouts
**Probability:** Medium  
**Impact:** Medium  
**Mitigation:** Chunked uploads, progress indication, resume capability

---

## 7. Open Questions & Parking Lot

### Resolved During Session
- ✅ File size limit: 50MB
- ✅ Concurrent upload limit: 10 documents
- ✅ Cover image handling: Optional with three paths
- ✅ YouTube integration: Server-side with fallbacks
- ✅ Cost handling: Show estimates, no enforcement initially

### For Future Consideration
- [ ] OCR for scanned documents
- [ ] Web page capture and archiving
- [ ] Folder/bulk upload from cloud storage
- [ ] Document versioning
- [ ] Collaborative uploads (team spaces)

---

## 8. Next Steps

### Immediate Actions
1. **Create technical specification** - Break down Phase 1 tasks into detailed tickets
2. **Set up storage buckets** - Configure Supabase Storage with proper policies
3. **Design preview cards** - Create Figma mockups for upload UI
4. **Research YouTube API** - Test youtube-transcript library reliability

### Sprint Planning
- **Sprint 1:** Phase 1-3 (Upload UI, Validation, Metadata)
- **Sprint 2:** Phase 4-5 (Queue System, Processing Dock)
- **Sprint 3:** Phase 6-7 (YouTube, Polish)

### Dependencies
- Gemini API key and setup
- Supabase Edge Functions enabled
- Realtime subscriptions configured

### Success Metrics
- Upload success rate > 95%
- Processing time < 2 minutes for average document
- User satisfaction with metadata extraction accuracy
- Zero data loss during processing

---

## Appendix: Technical References

### Gemini Processing Prompt
```javascript
const EXTRACTION_PROMPT = `
You are an expert document processor. Process this document in two phases...
[Full prompt as provided]
`;
```

### YouTube Transcript Processing
```javascript
const YOUTUBE_TRANSCRIPT_PROMPT = `
Process this YouTube transcript into clean, readable markdown:

1. Remove filler words and repeated phrases
2. Add proper punctuation and paragraph breaks
3. Create logical sections based on topic changes
4. If timestamps are provided and user wants them:
   - Preserve as [HH:MM:SS] markers at section starts
   - Create clickable references for easy navigation
5. Extract key topics and themes
6. Format speaker changes clearly (if multi-speaker)

Return clean markdown with optional timestamp markers.
`;
```

### YouTube Thumbnail URLs
```javascript
const thumbnails = {
  default: \`https://img.youtube.com/vi/\${videoId}/default.jpg\`,
  medium: \`https://img.youtube.com/vi/\${videoId}/mqdefault.jpg\`,
  high: \`https://img.youtube.com/vi/\${videoId}/hqdefault.jpg\`,
  standard: \`https://img.youtube.com/vi/\${videoId}/sddefault.jpg\`,
  maxres: \`https://img.youtube.com/vi/\${videoId}/maxresdefault.jpg\`
};
```

### Processing Status Flow
```
pending → metadata → processing → chunking → embedding → complete
                        ↓ (on error)
                       failed
```

---

**Document Version:** 1.0  
**Last Updated:** January 25, 2025  
**Status:** Ready for Development