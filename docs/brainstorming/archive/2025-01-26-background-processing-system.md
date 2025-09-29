# Brainstorming Session: Background Processing System

**Date**: January 26, 2025  
**Participants**: Development Team  
**Facilitator**: Scrum Master  
**Session Duration**: ~45 minutes  
**Session Type**: Architecture Design & Planning

---

## Executive Summary

Refactored document processing pipeline from synchronous Edge Functions to asynchronous background worker pattern. This change addresses timeout limitations, improves observability, and establishes a generic infrastructure for future background operations.

**Key Decision**: Implemented `background_jobs` table with type-based handler pattern for extensibility.

---

## 1. Problem Statement

### Current Architecture Issues
- **Edge Function Timeouts**: 150-second limit (extendable but still finite)
- **Observability Gap**: Limited logging and debugging during long-running operations
- **Pattern Mismatch**: Synchronous-style processing for operations taking 30+ minutes
- **Scale Concerns**: Large books (500+ pages) will exceed timeout limits

### User Impact
- No visibility into processing progress
- All-or-nothing processing (can't read document until 100% complete)
- Frustrating retry experience on failures
- Poor UX for multi-hour document processing

### Technical Context
- Documents: Large books (200-500+ pages)
- Processing time: 2+ hours for extraction + embeddings
- Volume: Low (few uploads per day, single user initially)
- Infrastructure: Supabase-based with Next.js 15

---

## 2. Requirements Analysis

### Functional Requirements
**Must Have**:
- Process documents without timeout constraints
- Real-time progress updates to frontend
- Graceful failure recovery with checkpoints
- Progressive document availability (read markdown before embeddings complete)

**Should Have**:
- Auto-retry transient errors (rate limits)
- Manual retry for permanent errors
- Generic infrastructure for future background jobs

**Nice to Have**:
- Job prioritization
- Scheduled jobs
- Batch processing

### Non-Functional Requirements
- **Observability**: Full visibility into processing stages
- **Reliability**: Resume from checkpoint on failure
- **Scalability**: Handle documents of any size
- **Maintainability**: Simple local development workflow
- **Extensibility**: Easy to add new job types

### Constraints
- Development priority: Get it right from the start
- Personal app (low volume initially)
- Prefer simple solutions over complex infrastructure
- Must work locally for development

---

## 3. Proposed Solution

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     BACKGROUND PROCESSING FLOW               │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  Upload PDF                                                  │
│      ↓                                                        │
│  Create background_job (status: pending)                     │
│      ↓                                                        │
│  Worker polls every 5s, picks up job                         │
│      ↓                                                        │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  STAGE 1: Download PDF (10% progress)               │   │
│  │  STAGE 2: Extract with Gemini (30% progress)        │   │
│  │  STAGE 3: Save markdown → markdown_available = true │   │
│  │           (50% progress) ✅ USER CAN NOW READ       │   │
│  │  STAGE 4: Generate embeddings (50-99% progress)     │   │
│  │  STAGE 5: Complete → embeddings_available = true    │   │
│  │           (100% progress) ✅ CONNECTIONS VISIBLE    │   │
│  └─────────────────────────────────────────────────────┘   │
│      ↓                                                        │
│  Realtime updates to frontend via Supabase                   │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

### Core Components

#### 1. Generic Background Jobs Table
```sql
CREATE TABLE background_jobs (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES auth.users,
  
  -- Job type discrimination
  job_type TEXT NOT NULL,  -- 'process_document', 'detect_connections', etc.
  entity_type TEXT,         -- 'document', 'deck', 'spark'
  entity_id UUID,
  
  -- Job state
  status TEXT DEFAULT 'pending',
  progress JSONB DEFAULT '{}',
  input_data JSONB DEFAULT '{}',
  
  -- Retry logic
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 3,
  last_error TEXT,
  next_retry_at TIMESTAMPTZ,
  
  -- Timing
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Design Rationale**:
- Generic `job_type` field allows adding new background operations without schema changes
- `entity_type` + `entity_id` provide polymorphic references
- `input_data` JSONB allows flexible job-specific parameters
- Retry fields support automatic recovery from transient failures

#### 2. Worker Architecture
```typescript
// Generic polling loop
async function processNextJob() {
  const job = await supabase
    .from('background_jobs')
    .select('*')
    .eq('status', 'pending')
    .order('created_at')
    .limit(1)
    .single()
  
  const handler = JOB_HANDLERS[job.job_type]
  await handler(job)
}

// Type-specific handlers
const JOB_HANDLERS = {
  'process_document': processDocumentHandler,
  'detect_connections': detectConnectionsHandler,  // Future
  'generate_export': generateExportHandler,        // Future
}
```

**Design Rationale**:
- Single worker process handles all job types
- Handler pattern makes adding new jobs trivial
- Simple polling (5s interval) sufficient for low volume
- Easy to scale to multiple workers if needed

#### 3. Stage-Based Processing with Checkpoints
```typescript
const STAGES = {
  DOWNLOAD: { name: 'download', percent: 10 },
  EXTRACT: { name: 'extract', percent: 30 },
  SAVE_MARKDOWN: { name: 'save_markdown', percent: 50 },  // CHECKPOINT
  EMBED: { name: 'embed', percent: 99 },
  COMPLETE: { name: 'complete', percent: 100 }
}

// On failure, resume from last completed stage
if (job.progress.completed_stages.includes('save_markdown')) {
  // Skip extraction, resume from embeddings
  const markdown = await loadSavedMarkdown()
  await generateEmbeddings(markdown)
}
```

**Design Rationale**:
- Checkpoints prevent re-doing expensive work
- For 500-page book: losing embedding stage (~15 min) acceptable, losing extraction (~2 hours) not
- Stage-level granularity balances complexity vs efficiency
- Clear progress visibility for user

#### 4. Progressive Document Availability
```typescript
// After markdown saved (stage 3 of 5):
await supabase
  .from('documents')
  .update({
    processing_status: 'extracted',
    markdown_available: true  // User can read now!
  })

// After embeddings complete (stage 5):
await supabase
  .from('documents')
  .update({
    processing_status: 'completed',
    embeddings_available: true  // Connections visible!
  })
```

**Design Rationale**:
- User gets value immediately after extraction
- Document readable even if embeddings fail
- Better UX than all-or-nothing processing
- Allows debugging extracted markdown before embeddings

#### 5. Error Handling Strategy

**Transient Errors** (Auto-retry with exponential backoff):
- Rate limit exceeded
- Network timeouts
- Service unavailable
- Retry delays: 5s, 25s, 125s

**Permanent Errors** (Manual retry required):
- Invalid/corrupted PDF
- Invalid API key
- Insufficient quota
- Parse errors

```typescript
async function handleError(error, job) {
  if (isTransient(error) && job.retry_count < 3) {
    const delay = 5000 * Math.pow(5, job.retry_count)
    await scheduleRetry(job.id, delay)
  } else {
    await markAsFailed(job.id, error.message)
  }
}
```

**Design Rationale**:
- Gemini rate limits common with large books → auto-recovery
- Real errors surface to user for investigation
- Exponential backoff prevents API hammering
- Manual retry gives user control over problematic jobs

---

## 4. Technical Implementation

### Technology Stack
- **Worker Runtime**: Node.js with tsx (TypeScript)
- **Database**: PostgreSQL (Supabase)
- **Realtime**: Supabase Realtime subscriptions
- **AI Processing**: Google Gemini 2.5 Flash + text-embedding-004
- **Process Management**: npm-run-all for integrated dev experience

### File Structure
```
worker/
├── index.ts                    # Main polling loop
├── handlers/
│   ├── process-document.ts     # Document processing (current)
│   ├── detect-connections.ts   # Connection detection (future)
│   └── generate-export.ts      # Export generation (future)
├── lib/
│   ├── errors.ts               # Error classification
│   ├── progress.ts             # Progress update helpers
│   └── checkpoint.ts           # Stage management
├── types.ts                    # TypeScript interfaces
└── package.json                # Worker dependencies
```

### Integration Points

**Upload Flow**:
```typescript
// Before: Direct Edge Function invocation
await supabase.functions.invoke('process-document', { body: { documentId } })

// After: Create background job
await supabase.from('background_jobs').insert({
  job_type: 'process_document',
  entity_type: 'document',
  entity_id: documentId,
  input_data: { document_id: documentId, storage_path }
})
```

**Frontend Subscription**:
```typescript
supabase
  .channel('job-updates')
  .on('postgres_changes', {
    event: 'UPDATE',
    schema: 'public',
    table: 'background_jobs',
    filter: `user_id=eq.${userId}`
  }, (payload) => {
    updateProcessingDock(payload.new.progress)
  })
  .subscribe()
```

**Document Reader**:
```typescript
// Progressive loading based on availability flags
if (doc.markdown_available) {
  return (
    <>
      <DocumentReader markdown={doc.markdown} />
      {!doc.embeddings_available && (
        <Banner>Processing connections: {progress}%</Banner>
      )}
    </>
  )
}
```

### Development Workflow

**Local Development**:
```bash
# Terminal 1: Next.js + Supabase
npm run dev

# Terminal 2: Worker
npm run worker
```

**Production Deployment** (future):
```bash
# Deploy to Railway/Fly.io
railway up
# or
fly deploy
```

---

## 5. Implementation Roadmap

### Phase 1: Database Schema (30 minutes)
**Tasks**:
- Create `background_jobs` table migration
- Add `markdown_available` and `embeddings_available` to `documents`
- Enable Realtime publication
- Create indexes for polling efficiency

**Deliverables**:
- `supabase/migrations/008_background_jobs.sql`

**Success Criteria**:
- Migration runs cleanly
- Realtime enabled for `background_jobs`
- Indexes improve query performance

---

### Phase 2: Worker Infrastructure (2-3 hours)
**Tasks**:
- Set up `worker/` directory structure
- Implement generic job polling loop
- Create document processing handler with 5 stages
- Add error classification and retry logic
- Implement progress tracking (every 10 chunks)

**Deliverables**:
- `worker/index.ts`
- `worker/handlers/process-document.ts`
- `worker/lib/errors.ts`
- `worker/lib/progress.ts`
- `worker/package.json`

**Success Criteria**:
- Worker successfully polls for jobs
- Document processing completes all 5 stages
- Progress updates visible in database
- Transient errors trigger auto-retry
- Permanent errors marked as failed

---

### Phase 3: Upload Flow Refactor (1 hour)
**Tasks**:
- Modify `uploadDocument` to create background job
- Remove direct Edge Function invocation
- Update return values to include `jobId`
- Keep Edge Function code for reference (can delete later)

**Deliverables**:
- Modified `src/app/actions/documents.ts`

**Success Criteria**:
- Upload creates job record
- Worker picks up job automatically
- No Edge Function timeout errors

---

### Phase 4: Frontend Integration (1-2 hours)
**Tasks**:
- Add Realtime subscription in ProcessingDock
- Update UI to show stage-based progress
- Implement progressive document loading in reader
- Add connection processing banner when embeddings pending

**Deliverables**:
- Modified `src/components/layout/ProcessingDock.tsx`
- Modified `src/app/read/[id]/page.tsx`

**Success Criteria**:
- Real-time progress updates visible in UI
- User can read document after markdown stage completes
- Connection banner appears during embedding stage
- Banner disappears when embeddings complete

---

### Phase 5: Dev Workflow (30 minutes)
**Tasks**:
- Update `package.json` scripts for worker integration
- Add worker startup instructions to documentation
- Test integrated development workflow

**Deliverables**:
- Modified `package.json`
- Updated `docs/QUICK_START.md`

**Success Criteria**:
- `npm run dev` starts Next.js + Supabase
- `npm run worker` starts background processor
- Both run simultaneously without conflicts

---

### Phase 6: Error Handling & Polish (1 hour)
**Tasks**:
- Add retry button UI for failed jobs
- Improve error messages for common failures
- Add graceful worker shutdown handling
- Test failure scenarios and resume logic

**Deliverables**:
- Retry UI in ProcessingDock
- Enhanced error messages
- Worker shutdown handler

**Success Criteria**:
- Failed jobs display helpful error messages
- Retry button successfully restarts processing
- Worker shuts down cleanly on Ctrl+C
- Resume from checkpoint works correctly

---

### Timeline Summary
| Phase | Duration | Critical Path |
|-------|----------|---------------|
| Phase 1: Database | 30 min | Yes |
| Phase 2: Worker | 2-3 hours | Yes |
| Phase 3: Upload Flow | 1 hour | Yes |
| Phase 4: Frontend | 1-2 hours | Yes |
| Phase 5: Dev Workflow | 30 min | No |
| Phase 6: Polish | 1 hour | No |
| **Total** | **5-7 hours** | |

---

## 6. Risk Assessment & Mitigation

### Technical Risks

**Risk 1: Worker Process Management**
- **Impact**: High
- **Probability**: Medium
- **Description**: Worker crashes or stops running unnoticed
- **Mitigation**:
  - Add health check endpoint
  - Implement graceful shutdown
  - Add process monitoring in production (PM2, systemd)
  - Start simple (manual restart acceptable for single user)

**Risk 2: Database Connection Pool Exhaustion**
- **Impact**: Medium
- **Probability**: Low
- **Description**: Worker holds connections too long
- **Mitigation**:
  - Use short-lived connections per job
  - Implement connection pooling properly
  - Monitor connection count in development

**Risk 3: Realtime Subscription Reliability**
- **Impact**: Medium
- **Probability**: Low
- **Description**: Frontend doesn't receive progress updates
- **Mitigation**:
  - Add fallback polling every 5 seconds
  - Show "last updated" timestamp
  - Add reconnection logic

**Risk 4: Checkpoint Resume Failures**
- **Impact**: Medium
- **Probability**: Medium
- **Description**: Resume logic fails, user loses work
- **Mitigation**:
  - Thorough testing of resume scenarios
  - Add validation of checkpoint data
  - Log checkpoint saves for debugging
  - Accept full restart as fallback

### Operational Risks

**Risk 5: Local Worker Not Running**
- **Impact**: High
- **Probability**: High (during development)
- **Description**: User uploads document but worker isn't started
- **Mitigation**:
  - Clear documentation about two-terminal workflow
  - Add status indicator in UI showing worker health
  - Consider auto-start in future (Phase 5 enhancement)

**Risk 6: Gemini API Quota Exhaustion**
- **Impact**: High
- **Probability**: Medium
- **Description**: Process fails due to quota limits
- **Mitigation**:
  - Quota monitoring in worker
  - Clear error messages about quota
  - Auto-retry with longer backoff
  - Document quota management strategy

---

## 7. Future Enhancements

### Short Term (Next Sprint)
1. **Job Cancellation**
   - Add cancel button in UI
   - Worker checks for cancellation signal
   - Clean up partial work on cancel

2. **Job Queue Dashboard**
   - View all jobs (pending, processing, failed)
   - Bulk retry failed jobs
   - Job history and logs

3. **Enhanced Progress Details**
   - Show current chunk being processed
   - Display token usage estimation
   - Show time remaining estimate

### Medium Term (Next Month)
1. **Additional Job Types**
   - Connection detection (find similar chunks)
   - Bulk export generation
   - Re-embedding with new models

2. **Job Prioritization**
   - User-initiated jobs get higher priority
   - System maintenance jobs run during low activity

3. **Batch Processing**
   - Upload multiple documents
   - Process in parallel (with concurrency limits)

### Long Term (Future Roadmap)
1. **Cloud Deployment**
   - Deploy worker to Railway/Fly.io
   - Auto-scaling based on queue depth
   - Multi-region support

2. **Job Scheduling**
   - Schedule jobs for specific times
   - Recurring jobs (daily maintenance)
   - Cron-like scheduling

3. **Advanced Retry Logic**
   - Different retry strategies per error type
   - Circuit breaker pattern for API failures
   - Exponential backoff with jitter

4. **Job Dependencies**
   - Chain jobs (process document → detect connections)
   - Parallel fan-out (process multiple docs)
   - Workflow orchestration

---

## 8. Success Metrics

### Technical Metrics
- **Processing Reliability**: >95% of jobs complete successfully
- **Resume Success Rate**: >90% of failed jobs resume correctly
- **Processing Time**: <5% overhead vs direct processing
- **Progress Update Latency**: <2 seconds from worker to UI

### User Experience Metrics
- **Time to First Read**: User can read document within 30% of total processing time
- **Error Recovery Time**: Failed jobs auto-recover within 5 minutes (transient errors)
- **Progress Visibility**: User sees progress update every 10 seconds

### Operational Metrics
- **Worker Uptime**: >99% during development (manual restarts acceptable)
- **Database Connection Usage**: <5 concurrent connections
- **Realtime Message Rate**: <10 messages per processing job

---

## 9. Decision Log

### Key Decisions Made

**Decision 1: Generic `background_jobs` Table**
- **Date**: 2025-01-26
- **Rationale**: Future-proofing for connection detection, export generation, and other background operations
- **Alternatives Considered**: 
  - Separate `processing_jobs` table (rejected: too specific)
  - No generic pattern (rejected: would require refactoring later)
- **Trade-offs**: Slight complexity increase now, significant flexibility later

**Decision 2: Local Worker for Development**
- **Date**: 2025-01-26
- **Rationale**: Simplest path for single-user development, easy cloud migration
- **Alternatives Considered**:
  - Immediate cloud deployment (rejected: over-engineering)
  - pg_cron polling (rejected: less flexible)
  - Edge Functions with chunking (rejected: too complex)
- **Trade-offs**: Requires two terminals, but acceptable for development

**Decision 3: Stage-Level Checkpoints**
- **Date**: 2025-01-26
- **Rationale**: Balances implementation complexity with recovery efficiency
- **Alternatives Considered**:
  - Full restart (rejected: too wasteful for large books)
  - Chunk-level resume (rejected: over-engineering)
- **Trade-offs**: May re-process ~15 minutes of work on failure, acceptable waste

**Decision 4: Hybrid Error Handling**
- **Date**: 2025-01-26
- **Rationale**: Auto-retry for transient errors, manual retry for permanent
- **Alternatives Considered**:
  - Always auto-retry (rejected: infinite loops on permanent errors)
  - Always manual (rejected: annoying for transient errors)
- **Trade-offs**: Slightly more complex logic, much better UX

**Decision 5: Progressive Document Availability**
- **Date**: 2025-01-26
- **Rationale**: User can read document immediately after extraction
- **Alternatives Considered**:
  - All-or-nothing (rejected: poor UX for long processing)
- **Trade-offs**: Slight state management complexity, significantly better UX

---

## 10. Open Questions & Next Steps

### Open Questions
1. **Worker Monitoring**: How to detect when worker is down in production?
   - **Decision Needed By**: Before production deployment
   - **Options**: Health check endpoint, dead man's switch, monitoring service

2. **Concurrent Job Processing**: Should worker process multiple jobs in parallel?
   - **Decision Needed By**: When volume increases
   - **Current Approach**: Sequential processing (sufficient for single user)

3. **Job Retention**: How long to keep completed job records?
   - **Decision Needed By**: After 1 month of usage
   - **Options**: 30 days, 90 days, indefinite

### Next Steps

**Immediate** (This Week):
1. Create database migration (Phase 1)
2. Implement worker infrastructure (Phase 2)
3. Refactor upload flow (Phase 3)

**Short Term** (Next Week):
4. Frontend integration (Phase 4)
5. Dev workflow setup (Phase 5)
6. Error handling polish (Phase 6)

**Medium Term** (Next Sprint):
7. Test with real large books (500+ pages)
8. Document troubleshooting guide
9. Add job cancellation feature

**Backlog**:
10. Deploy worker to cloud (when needed)
11. Add additional job types (connections, exports)
12. Implement job queue dashboard

---

## 11. Appendix

### Related Documents
- `docs/ARCHITECTURE.MD` - Overall system architecture
- `docs/GEMINI_PROCESSING.md` - AI processing details
- `docs/STORAGE_PATTERNS.md` - Hybrid storage strategy
- `supabase/functions/process-document/index.ts` - Current Edge Function (reference)

### Key Terminology
- **Background Job**: Asynchronous task tracked in `background_jobs` table
- **Job Handler**: Type-specific processing function
- **Stage**: Distinct phase of document processing with checkpoint
- **Checkpoint**: Point where progress can be saved and resumed
- **Transient Error**: Temporary failure (rate limit, timeout) eligible for auto-retry
- **Permanent Error**: Error requiring manual intervention
- **Progressive Loading**: Making document partially available before full processing completes

### Reference Architecture
```
┌──────────────────────────────────────────────────────────────┐
│                    SYSTEM COMPONENTS                          │
├──────────────────────────────────────────────────────────────┤
│                                                                │
│  ┌────────────┐      ┌────────────────┐      ┌────────────┐ │
│  │  Next.js   │─────▶│ background_jobs│◀─────│   Worker   │ │
│  │  (Upload)  │      │     (Table)    │      │  (Poller)  │ │
│  └────────────┘      └────────────────┘      └────────────┘ │
│         │                     │                      │        │
│         │                     │                      │        │
│         ▼                     ▼                      ▼        │
│  ┌────────────┐      ┌────────────────┐      ┌────────────┐ │
│  │   Upload   │      │    Realtime    │      │   Gemini   │ │
│  │    Zone    │      │  (Subscribe)   │      │    API     │ │
│  └────────────┘      └────────────────┘      └────────────┘ │
│         │                     │                      │        │
│         │                     │                      │        │
│         ▼                     ▼                      ▼        │
│  ┌────────────┐      ┌────────────────┐      ┌────────────┐ │
│  │ Processing │      │   Progress     │      │  Storage   │ │
│  │    Dock    │      │    Updates     │      │  (Files)   │ │
│  └────────────┘      └────────────────┘      └────────────┘ │
│                                                                │
└──────────────────────────────────────────────────────────────┘
```

---

## Session Conclusion

This brainstorming session successfully defined a comprehensive background processing architecture that addresses all identified pain points while maintaining simplicity for the current development phase. The generic job pattern provides a solid foundation for future features while keeping the initial implementation straightforward.

**Key Achievements**:
✅ Clear architecture with well-defined components
✅ Progressive implementation roadmap (5-7 hours)
✅ Risk mitigation strategies identified
✅ Future extensibility designed in from start
✅ Balanced complexity vs functionality

**Next Action**: Begin Phase 1 (Database Schema) implementation.

---

**Document Version**: 1.0  
**Last Updated**: 2025-01-26  
**Status**: Approved for Implementation