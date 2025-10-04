# Task Breakdown: Idempotent Retry Logic for Document Processing

**Generated**: 2025-10-04
**Source PRP**: [docs/prps/idempotent-retry-logic.md](../prps/idempotent-retry-logic.md)
**Complexity**: High (Multi-phase, cross-system impact)
**Total Estimated Effort**: 8-12 hours

## PRP Analysis Summary

**Feature Name**: Idempotent Retry Logic
**Scope**: Document processing pipeline resilience and data integrity

**Key Technical Requirements**:
- Implement heartbeat mechanism for long-running jobs (14+ minute EPUBs)
- Add stage checkpointing for resumable processing
- Make retry operations idempotent to prevent data loss
- Fix FK violations in collision detection (94% failure rate)

**Validation Requirements**:
- No FK violations on connection insertion
- Complete chunk preservation (61 vs current 41)
- Cached AI results reused on retry (save $0.40/retry)
- Integration tests for all retry scenarios

## Task Complexity Assessment

**Overall Complexity**: High
- Processing spans 14+ minutes for large documents
- Concurrent job race conditions
- Data integrity across multiple tables
- Cost implications of duplicate AI calls

**Integration Points**:
- Background job system (`background_jobs` table)
- Document processing pipeline (`worker/handlers/process-document.ts`)
- Collision detection system (`worker/handlers/detect-connections.ts`)
- Chunk storage with embeddings (`chunks` table)
- Connection storage (`chunk_connections` table)

**Technical Challenges**:
- Race condition between delete and collision detection
- Heartbeat implementation without excessive DB load
- Stage tracking while maintaining backward compatibility
- Ensuring idempotent operations across retries

## Phase Organization

### Phase 1: Critical Fixes (P0 - Immediate)
**Objective**: Stop data loss and FK violations
**Timeline**: Day 1-2
**Deliverables**:
- Heartbeat mechanism preventing false stale detection
- Extended timeout from 10 to 30 minutes
- Stage tracking in job metadata
- Conditional chunk deletion based on stage

**Milestones**:
- V. novel processes without FK violations
- 61 chunks preserved (not 41)
- Retry uses cached results ($0.40 saved)

### Phase 2: Improvements (P1 - This Week)
**Objective**: Optimize processing flow and add comprehensive testing
**Timeline**: Day 3-5
**Deliverables**:
- Async collision detection (non-blocking)
- Complete integration test suite
- Optional database migration for heartbeat column

**Milestones**:
- Document completion not blocked by collision detection
- 100% test coverage for retry scenarios
- Zero FK violations in production

## Detailed Task Breakdown

---

## Task T-001: Implement Job Heartbeat Mechanism

**Task Name**: Add heartbeat timer during AI processing
**Priority**: Critical
**Estimated Effort**: 2 hours

### Source PRP Document
**Reference**: [docs/prps/idempotent-retry-logic.md](../prps/idempotent-retry-logic.md#task-11-add-job-heartbeat)

### Dependencies
- **Prerequisite Tasks**: None (can start immediately)
- **Parallel Tasks**: T-002 (timeout configuration)
- **Integration Points**: Background job system, Gemini AI processing
- **Blocked By**: None

### Acceptance Criteria

#### Given-When-Then Scenarios
```gherkin
Scenario 1: Heartbeat prevents stale detection
  Given a large EPUB taking 14+ minutes to process
  When AI processing is running
  Then heartbeat updates job timestamp every 5 minutes
  And job is NOT marked stale after 10 minutes
  And processing completes successfully

Scenario 2: Heartbeat cleanup on error
  Given processing with active heartbeat
  When an error occurs during processing
  Then heartbeat timer is cleared
  And no orphaned intervals remain

Scenario 3: Heartbeat during cached processing
  Given a job with cached AI results
  When retry processing runs
  Then heartbeat still updates during chunk insertion
  And prevents stale detection during DB operations
```

#### Rule-Based Criteria
- [x] Heartbeat interval set to 5 minutes
- [x] Updates `started_at` field to reset timeout
- [x] Always cleared in finally block
- [x] No memory leaks from uncleaned intervals
- [x] Works with both fresh and cached processing

### Implementation Details

#### Files to Modify
```
├── worker/handlers/process-document.ts - Add heartbeat timer around AI processing (lines 62-116)
└── worker/tests/integration/heartbeat.test.ts - New test file for heartbeat scenarios
```

#### Key Implementation Steps
1. **Add heartbeat before processor.process()** → Timer updates job every 5 minutes
2. **Wrap in try/finally** → Ensure cleanup on any exit path
3. **Test with 15-minute mock** → Verify prevents stale detection

#### Code Patterns to Follow
- **Timer pattern**: Use `setInterval` with 5-minute interval
- **DB update**: Update `started_at` field (resets stale timer)
- **Cleanup**: Always use `finally` block for `clearInterval`

### Manual Testing Steps
1. **Setup**: Upload large EPUB (500+ pages)
2. **Monitor**: Watch logs for heartbeat messages every 5 minutes
3. **Verify**: Check `background_jobs.started_at` updates in database
4. **Cleanup**: Ensure job completes without stale recovery

### Validation Commands
```bash
cd worker && npm run test:integration -- heartbeat.test.ts
cd worker && npm run test:retry-scenarios
```

### Resources & References
- **Current Implementation**: [worker/handlers/process-document.ts:62-116](../../worker/handlers/process-document.ts#L62-L116)
- **Stale Detection**: [worker/index.ts:32-65](../../worker/index.ts#L32-L65)

---

## Task T-002: Increase Stale Job Timeout

**Task Name**: Extend stale threshold from 10 to 30 minutes
**Priority**: Critical
**Estimated Effort**: 1 hour

### Source PRP Document
**Reference**: [docs/prps/idempotent-retry-logic.md](../prps/idempotent-retry-logic.md#task-12-increase-stale-timeout)

### Dependencies
- **Prerequisite Tasks**: None
- **Parallel Tasks**: T-001 (heartbeat mechanism)
- **Integration Points**: Worker polling loop
- **Blocked By**: None

### Acceptance Criteria

#### Given-When-Then Scenarios
```gherkin
Scenario 1: Large documents don't trigger false stale
  Given a 500-page EPUB processing
  When 15 minutes have elapsed
  Then job is NOT marked stale
  And processing continues normally

Scenario 2: Actually stale jobs are recovered
  Given a job with no heartbeat
  When 30+ minutes have elapsed
  Then job IS marked stale
  And recovery process begins

Scenario 3: Heartbeat resets stale timer
  Given a job sending heartbeats
  When checked at any time
  Then elapsed time calculated from last heartbeat
  And job never marked stale if heartbeat recent
```

#### Rule-Based Criteria
- [x] STALE_THRESHOLD constant = 30 minutes
- [x] Comment explains large document requirements
- [x] Stale check uses started_at timestamp
- [x] Works with heartbeat mechanism
- [x] Backward compatible with existing jobs

### Implementation Details

#### Files to Modify
```
├── worker/index.ts - Update STALE_THRESHOLD constant (line 33)
├── worker/constants.ts - Add timing constants file (new, optional)
└── worker/tests/unit/stale-detection.test.ts - Test stale threshold logic
```

#### Key Implementation Steps
1. **Update constant** → Change from 10 to 30 minutes
2. **Add documentation** → Explain why 30 minutes needed
3. **Test boundary** → Verify 29 min = active, 31 min = stale

#### Code Patterns to Follow
- **Time calculation**: `Date.now() - new Date(job.started_at).getTime()`
- **Constants**: Define in one place, reference everywhere
- **Comments**: Explain business reason for 30 minutes

### Manual Testing Steps
1. **Start long job**: Begin EPUB processing
2. **Wait 15 minutes**: Verify still processing
3. **Check status**: Confirm not marked stale
4. **Force stale**: Stop heartbeat, wait 30+ minutes, verify recovery

### Validation Commands
```bash
cd worker && npm test -- index.test.ts
cd worker && npm run test:integration
```

### Resources & References
- **Current Code**: [worker/index.ts:33](../../worker/index.ts#L33)
- **Stale Recovery**: [worker/index.ts:46-55](../../worker/index.ts#L46-L55)

---

## Task T-003: Add Processing Stage Tracking

**Task Name**: Track processing stages in job metadata
**Priority**: Critical
**Estimated Effort**: 2 hours

### Source PRP Document
**Reference**: [docs/prps/idempotent-retry-logic.md](../prps/idempotent-retry-logic.md#task-13-add-stage-tracking-to-metadata)

### Dependencies
- **Prerequisite Tasks**: None
- **Parallel Tasks**: T-004 (will use stage data)
- **Integration Points**: Job metadata system, caching mechanism
- **Blocked By**: None

### Acceptance Criteria

#### Given-When-Then Scenarios
```gherkin
Scenario 1: Stage progression tracking
  Given a fresh document processing job
  When each stage completes
  Then metadata.processing_stage updates
  And completed_stages array grows
  And stage_timestamps records completion time

Scenario 2: Resume from checkpoint
  Given a job failed at 'chunking' stage
  When retry begins
  Then job resumes from 'chunking'
  And does NOT re-run extraction (cached)
  And completed_stages preserved

Scenario 3: Backward compatibility
  Given existing jobs without stage tracking
  When processed
  Then defaults to 'pending' stage
  And processes normally without error
```

#### Rule-Based Criteria
- [x] Stage enum: pending, extracting, extracted, saving_markdown, markdown_saved, chunking, chunked, embedding, embedded, complete, failed
- [x] Metadata includes: processing_stage, completed_stages[], stage_timestamps{}
- [x] Compatible with existing cache fields
- [x] Helper function updateStage() for consistency
- [x] Stages persist across retries

### Implementation Details

#### Files to Modify
```
├── worker/handlers/process-document.ts - Add stage updates throughout pipeline (lines 97-114, throughout)
├── worker/types/stages.ts - Define ProcessingStage type (new)
├── worker/lib/stage-manager.ts - Helper functions for stage management (new)
└── worker/tests/unit/stage-tracking.test.ts - Test stage progression
```

#### Key Implementation Steps
1. **Define ProcessingStage type** → Enum with all stages
2. **Create updateStage() helper** → Consistent stage updates
3. **Add stage calls** → After each major operation
4. **Test progression** → Verify stage flow and persistence

#### Code Patterns to Follow
- **Metadata structure**: Extend existing cached_* fields
- **Stage updates**: Always after successful operations
- **Error handling**: Set 'failed' stage on errors
- **Type safety**: Use TypeScript enum for stages

### Manual Testing Steps
1. **Start processing**: Begin with large document
2. **Kill after extraction**: Force failure after AI completes
3. **Check metadata**: Verify stage = 'extracted'
4. **Retry job**: Should skip extraction, use cache
5. **Complete**: Verify reaches 'complete' stage

### Validation Commands
```bash
cd worker && npm run test:unit -- stage-tracking.test.ts
cd worker && npm run test:integration
```

### Resources & References
- **Current Metadata**: [worker/handlers/process-document.ts:97-114](../../worker/handlers/process-document.ts#L97-L114)
- **Job Table Schema**: Check migration 029 for metadata column

---

## Task T-004: Implement Conditional Chunk Deletion

**Task Name**: Only delete chunks when starting fresh processing
**Priority**: Critical
**Estimated Effort**: 2 hours

### Source PRP Document
**Reference**: [docs/prps/idempotent-retry-logic.md](../prps/idempotent-retry-logic.md#task-14-conditional-chunk-deletion)

### Dependencies
- **Prerequisite Tasks**: T-003 (needs stage tracking)
- **Parallel Tasks**: None
- **Integration Points**: Chunk deletion logic, collision detection
- **Blocked By**: T-003 completion

### Acceptance Criteria

#### Given-When-Then Scenarios
```gherkin
Scenario 1: Fresh processing deletes old chunks
  Given a document with no processing stage
  When processing begins
  Then existing chunks ARE deleted
  And new chunks inserted cleanly

Scenario 2: Resume preserves chunks
  Given a job at 'chunked' stage
  When retry occurs
  Then existing chunks NOT deleted
  And collision detection uses valid chunks
  And no FK violations occur

Scenario 3: Failed chunking allows re-deletion
  Given a job failed during 'chunking' stage
  When retry occurs
  Then chunks ARE deleted (partial state)
  And fresh chunks inserted

Scenario 4: Embeddings stage preserves chunks
  Given a job at 'embedding' stage
  When retry occurs
  Then chunks preserved for embedding generation
  And chunk IDs remain stable
```

#### Rule-Based Criteria
- [x] Check processing_stage before deletion
- [x] Resume stages: ['chunked', 'embedding', 'embedded', 'complete']
- [x] Delete stages: ['pending', 'extracting', 'extracted', 'saving_markdown', 'markdown_saved', 'chunking']
- [x] Log decision clearly
- [x] No orphaned chunks after fresh processing

### Implementation Details

#### Files to Modify
```
├── worker/handlers/process-document.ts - Conditional deletion logic (lines 188-200)
├── worker/tests/integration/chunk-preservation.test.ts - Test deletion logic
└── worker/lib/chunk-manager.ts - Optional: Extract chunk operations (new)
```

#### Key Implementation Steps
1. **Read stage from metadata** → Determine if resuming
2. **Conditional branch** → Delete only if NOT resuming
3. **Clear logging** → Show deletion decision
4. **Test both paths** → Fresh and resume scenarios

#### Code Patterns to Follow
- **Stage check**: Use array.includes() for resume stages
- **Logging**: Clear messages about deletion decision
- **Safety**: Only delete for specific document_id
- **Error handling**: Log warning if delete fails (might not exist)

### Manual Testing Steps
1. **Fresh document**: Upload new, verify chunks deleted then created
2. **Kill during embeddings**: Stop job after chunking
3. **Check chunks exist**: Query database for chunks
4. **Retry job**: Verify chunks NOT deleted
5. **Complete**: Verify connections created without FK errors

### Validation Commands
```bash
cd worker && npm run test:integration -- chunk-preservation.test.ts
cd worker && npm run test:retry-scenarios
```

### Resources & References
- **Current Deletion**: [worker/handlers/process-document.ts:188-200](../../worker/handlers/process-document.ts#L188-L200)
- **Unique Constraint**: Migration 029 - (document_id, chunk_index)

---

## Task T-005: Decouple Collision Detection

**Task Name**: Queue collision detection as async job
**Priority**: High
**Estimated Effort**: 2 hours

### Source PRP Document
**Reference**: [docs/prps/idempotent-retry-logic.md](../prps/idempotent-retry-logic.md#task-21-async-connection-detection)

### Dependencies
- **Prerequisite Tasks**: T-001, T-002, T-003, T-004 (Phase 1 complete)
- **Parallel Tasks**: T-006 (can write tests simultaneously)
- **Integration Points**: Background job queue, collision detection handler
- **Blocked By**: Phase 1 tasks

### Acceptance Criteria

#### Given-When-Then Scenarios
```gherkin
Scenario 1: Document completes without waiting
  Given document processing with embeddings complete
  When final stage reached
  Then collision detection job queued
  And document marked 'embedded' (not blocked)
  And user sees document ready immediately

Scenario 2: Collision runs independently
  Given collision detection job queued
  When job processes
  Then uses stable chunk IDs
  And creates connections successfully
  And no FK violations

Scenario 3: Duplicate job prevention
  Given existing collision job for document
  When document reprocessed
  Then duplicate job NOT created
  And existing job continues
```

#### Rule-Based Criteria
- [x] Document status = 'embedded' after embeddings
- [x] Collision job queued with document_id
- [x] Check for existing collision jobs
- [x] Job includes chunk_count for validation
- [x] Clear status messaging to user

### Implementation Details

#### Files to Modify
```
├── worker/handlers/process-document.ts - Queue job instead of inline call (lines 213-250)
├── worker/handlers/detect-connections.ts - Ensure handles queued job format
└── worker/tests/integration/async-collision.test.ts - Test async flow
```

#### Key Implementation Steps
1. **Remove inline collision call** → Delete synchronous detection
2. **Queue background job** → Insert collision detection job
3. **Check duplicates** → Prevent multiple collision jobs
4. **Update status** → Return 'embedded' not 'complete'

#### Code Patterns to Follow
- **Job structure**: Match existing background_jobs format
- **Duplicate check**: Query for pending/processing collision jobs
- **Input data**: Include document_id, user_id, chunk_count
- **Status message**: "Document ready, finding connections..."

### Manual Testing Steps
1. **Upload document**: Process any document
2. **Check completion time**: Should be faster (no collision wait)
3. **Verify job queued**: Check background_jobs table
4. **Monitor collision**: Verify runs separately
5. **Check connections**: Verify connections created

### Validation Commands
```bash
cd worker && npm run test:integration -- async-collision.test.ts
cd worker && npm run test:detect-connections
```

### Resources & References
- **Current Code**: [worker/handlers/process-document.ts:213-250](../../worker/handlers/process-document.ts#L213-L250)
- **Collision Handler**: worker/handlers/detect-connections.ts

---

## Task T-006: Comprehensive Retry Integration Tests

**Task Name**: Create test suite for retry safety scenarios
**Priority**: High
**Estimated Effort**: 3 hours

### Source PRP Document
**Reference**: [docs/prps/idempotent-retry-logic.md](../prps/idempotent-retry-logic.md#task-22-integration-tests-for-retry-scenarios)

### Dependencies
- **Prerequisite Tasks**: T-001 through T-004 (need working implementation)
- **Parallel Tasks**: T-005 (can test independently)
- **Integration Points**: All retry logic components
- **Blocked By**: Core implementation

### Acceptance Criteria

#### Given-When-Then Scenarios
```gherkin
Scenario 1: Test cached retry efficiency
  Given completed extraction phase
  When retry triggered
  Then no additional AI calls made
  And processing resumes from checkpoint
  And completes faster than original

Scenario 2: Test chunk preservation
  Given chunks created and embeddings in progress
  When timeout and retry occur
  Then chunk IDs remain identical
  And collision detection succeeds
  And no FK violations

Scenario 3: Test concurrent safety
  Given collision detection running
  When document reprocessing triggered
  Then collision completes without errors
  And connections saved successfully
```

#### Rule-Based Criteria
- [x] Test all retry scenarios from PRP
- [x] Mock AI calls to track usage
- [x] Verify cost savings ($0.40 per retry)
- [x] Test timing boundaries (29 vs 31 minutes)
- [x] Coverage for all stage transitions

### Implementation Details

#### Files to Create
```
├── worker/tests/integration/retry-safety.test.ts - Main retry test suite
├── worker/tests/helpers/job-simulator.ts - Helper to simulate job states
├── worker/tests/fixtures/retry-scenarios.ts - Test data for scenarios
└── worker/tests/integration/fk-violation.test.ts - FK safety tests
```

#### Key Implementation Steps
1. **Create test harness** → Job state simulation helpers
2. **Test each scenario** → From PRP validation gates
3. **Mock AI calls** → Track and assert no duplicates
4. **Time-based tests** → Heartbeat and stale detection
5. **FK safety** → Chunk ID stability tests

#### Code Patterns to Follow
- **Test structure**: Arrange-Act-Assert pattern
- **Mocking**: Mock Gemini AI to count calls
- **Database state**: Set up realistic job metadata
- **Assertions**: Check both behavior and performance

### Manual Testing Steps
1. **Run test suite**: `npm run test:integration`
2. **Check coverage**: Ensure all paths tested
3. **Performance**: Verify tests complete < 30 seconds
4. **CI integration**: Ensure runs in CI pipeline

### Validation Commands
```bash
cd worker && npm run test:integration -- retry-safety.test.ts
cd worker && npm run test:full-validation
cd worker && npm run test:coverage
```

### Resources & References
- **Test Examples**: worker/tests/integration/*.test.ts
- **Mock Patterns**: worker/tests/__mocks__/
- **Validation Requirements**: From PRP section "Validation Gates"

---

## Task T-007: Optional Database Migration for Heartbeat

**Task Name**: Add last_heartbeat column to background_jobs
**Priority**: Low
**Estimated Effort**: 1 hour

### Source PRP Document
**Reference**: [docs/prps/idempotent-retry-logic.md](../prps/idempotent-retry-logic.md#database-changes-optional-enhancement)

### Dependencies
- **Prerequisite Tasks**: T-001 (heartbeat mechanism working)
- **Parallel Tasks**: None
- **Integration Points**: Database schema
- **Blocked By**: None (optional enhancement)

### Acceptance Criteria

#### Given-When-Then Scenarios
```gherkin
Scenario 1: Migration applies cleanly
  Given current database state
  When migration 030 runs
  Then last_heartbeat column added
  And index created for performance
  And helper function works

Scenario 2: Backward compatibility
  Given jobs without last_heartbeat
  When queried
  Then falls back to started_at
  And no errors occur

Scenario 3: Heartbeat updates column
  Given heartbeat mechanism active
  When heartbeat fires
  Then last_heartbeat updated
  And stale detection uses new column
```

#### Rule-Based Criteria
- [x] Migration number = 030 (next in sequence)
- [x] Column type = TIMESTAMPTZ
- [x] Index on (last_heartbeat) WHERE status = 'processing'
- [x] Helper function is_job_stale() works
- [x] Rollback script included

### Implementation Details

#### Files to Create
```
├── supabase/migrations/030_processing_checkpoints.sql - Migration up
├── supabase/migrations/030_processing_checkpoints_down.sql - Rollback
└── worker/lib/heartbeat.ts - Update to use new column (optional)
```

#### Key Implementation Steps
1. **Create migration** → ALTER TABLE add column
2. **Add index** → For stale job queries
3. **Helper function** → Encapsulate stale logic
4. **Update code** → Use last_heartbeat if available
5. **Test rollback** → Ensure reversible

#### Code Patterns to Follow
- **Migration naming**: 030_processing_checkpoints.sql
- **Index naming**: idx_background_jobs_heartbeat
- **Function**: PL/pgSQL for is_job_stale()
- **Null handling**: COALESCE for backward compatibility

### Manual Testing Steps
1. **Apply migration**: `npx supabase db push`
2. **Check schema**: Verify column exists
3. **Test function**: Call is_job_stale()
4. **Rollback test**: Apply down migration
5. **Re-apply**: Ensure idempotent

### Validation Commands
```bash
npx supabase db diff --schema public
npx supabase migration new processing_checkpoints
npx supabase db reset  # Test full migration chain
```

### Resources & References
- **Migration 029**: Previous migration for reference
- **Schema**: supabase/migrations/ directory
- **Supabase Docs**: Migration best practices

---

## Implementation Recommendations

### Suggested Team Structure
- **Lead Developer**: Owns T-001, T-003, T-004 (core retry logic)
- **Backend Developer**: Owns T-002, T-005 (job system changes)
- **Test Engineer**: Owns T-006 (integration tests)
- **Database Admin**: Owns T-007 (optional migration)

### Optimal Task Sequencing

**Day 1 Morning**:
- T-001 + T-002 in parallel (both can start immediately)
- Critical to prevent data loss ASAP

**Day 1 Afternoon**:
- T-003 (stage tracking) - builds on morning work
- Begin T-006 test planning

**Day 2 Morning**:
- T-004 (conditional deletion) - depends on T-003
- Complete Phase 1 testing

**Day 2 Afternoon**:
- Deploy Phase 1 to development
- Test with V. novel (failing case)

**Day 3**:
- T-005 (async collision detection)
- T-006 (complete test suite)

**Day 4-5**:
- T-007 (optional migration)
- Production deployment
- Monitoring setup

### Parallelization Opportunities

**Can Run in Parallel**:
- T-001 (heartbeat) + T-002 (timeout) - No dependencies
- T-005 (async) + T-006 (tests) - Different codebases
- Documentation + Implementation - Non-blocking

**Must Run Sequentially**:
- T-003 → T-004 (stage tracking needed for conditional delete)
- Phase 1 → Phase 2 (foundation required)

### Resource Allocation
- **High Priority**: 2 developers on Phase 1 (T-001 through T-004)
- **Testing**: 1 developer dedicated to T-006
- **Optional**: T-007 can wait or be done by DBA

## Critical Path Analysis

### Tasks on Critical Path
1. **T-003** (Stage Tracking) - Blocks T-004
2. **T-004** (Conditional Deletion) - Blocks Phase 1 completion
3. **T-001** (Heartbeat) - Prevents false stale detection

### Potential Bottlenecks
- **Stage Tracking Complexity**: Metadata structure changes affect multiple functions
- **Testing Large Documents**: 15+ minute processing makes testing slow
- **Backward Compatibility**: Ensuring existing jobs don't break

### Schedule Optimization
- **Mock Long Processing**: Use delays instead of real 500-page documents for testing
- **Parallel Development**: Frontend team can update UI status messages while backend implements
- **Early Integration**: Deploy to dev after each task for incremental validation

## Risk Assessment

### High Risk Items
1. **Heartbeat DB Load**: Every active job updates every 5 minutes
   - **Mitigation**: Batch updates, use connection pooling

2. **Stage Metadata Growth**: Metadata field could get large
   - **Mitigation**: Limit fields, implement cleanup for old jobs

3. **Race Conditions**: Concurrent retries could still conflict
   - **Mitigation**: Unique constraints, integration tests

### Medium Risk Items
1. **Breaking Changes**: Existing jobs might fail with new code
   - **Mitigation**: Careful backward compatibility, staged rollout

2. **Performance Impact**: Additional checks and updates
   - **Mitigation**: Benchmark before/after, optimize queries

### Low Risk Items
1. **Optional Migration**: Column addition is low risk
   - **Mitigation**: Can defer or skip entirely

## Success Metrics

### Must Have (Phase 1)
- [x] Zero FK violations after implementation
- [x] 61 chunks preserved (not 41) for V. novel
- [x] No duplicate AI calls on retry ($0.40 saved)
- [x] All critical tests passing

### Should Have (Phase 2)
- [x] Document ready in <5 minutes for user
- [x] Collision detection completes independently
- [x] 100% test coverage for retry scenarios
- [x] Monitoring dashboard shows health

### Nice to Have
- [x] Database migration for heartbeat column
- [x] Performance metrics dashboard
- [x] Automated alerting for FK violations

## Validation Framework

### Per-Task Validation
```bash
# After each task implementation
cd worker
npm run lint
npm run test:unit
npm run test:integration
```

### Phase 1 Validation
```bash
# Complete Phase 1 validation
cd worker
npm run test:full-validation
npm run test:retry-scenarios
npm run test:critical-patterns

# Test with real document
npm run test:epub-processing -- "V.epub"
```

### Phase 2 Validation
```bash
# Complete system validation
cd worker
npm run test:all-sources
npm run test:database-batching
npm run validate:semantic-accuracy

# End-to-end validation
npm run test:e2e -- retry-safety
```

### Production Validation
```bash
# Monitor for 24 hours post-deployment
grep "FK violation" logs/worker.log
grep "stale recovery" logs/worker.log
grep "retry triggered" logs/worker.log

# Check metrics
SELECT COUNT(*) FROM chunk_connections WHERE created_at > NOW() - INTERVAL '24 hours';
SELECT COUNT(*) FROM background_jobs WHERE status = 'failed' AND last_error LIKE '%FK%';
```

## Notes

### Implementation Priorities
1. **Data Integrity First**: Prevent data loss before optimization
2. **Cost Control**: Each retry without cache costs $0.40
3. **User Experience**: Documents should be ready quickly
4. **Monitoring**: Visibility into retry behavior critical

### Technical Debt Addressed
- Removes race condition causing 94% connection failure
- Eliminates data loss from premature deletion
- Reduces AI API costs through caching
- Improves system resilience and recovery

### Future Enhancements
- Progressive chunk processing (process as extracted)
- Smarter stale detection (per job-type thresholds)
- Automatic retry backoff tuning
- Cost tracking per document

---

**Generated by**: AI Task Breakdown Assistant
**Review Status**: Ready for implementation
**Confidence**: 8/10 - Well-researched with clear implementation path