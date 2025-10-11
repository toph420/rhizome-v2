# Simplified Pipeline Task Breakdown

**Generated from PRP**: `docs/prps/simplified-pipeline.md`
**Total Estimated Effort**: 4-6 hours
**Number of Tasks**: 9 primary tasks
**Risk Level**: Low (Easy rollback via git + db reset)
**Last Updated**: 2025-10-07

---

## PRP Analysis Summary

### Feature Name and Scope
**Feature**: Simplified Document Processing Pipeline
**Scope**: Replace complex offset-based chunking (1500+ lines) with boundary-based matching (400 lines)

### Key Technical Requirements
- Replace offset arithmetic with text boundary matching
- Reduce code complexity by 70% (from 1500 to 400 lines)
- Achieve 95%+ chunk match rate (vs current 70-80%)
- Process 500-page books in <20 minutes
- Maintain ~$0.50 cost per book processing

### Validation Requirements
- Chunk match rate must exceed 90%
- No regression in existing features
- All chunks must have complete metadata
- Clean markdown without artifacts

---

## Task Complexity Assessment

### Overall Complexity Rating
**Moderate** - Well-defined refactoring with clear patterns

### Integration Points
- `worker/processors/base.ts` - Base processor pattern (unchanged)
- `worker/lib/pdf-batch-utils.ts` - Batch processing (reuse existing)
- `worker/lib/fuzzy-matching.ts` - Stitching function (line 667)
- `worker/lib/text-cleanup.ts` - Regex patterns (keep existing)
- Database schema (unchanged)
- Background job system (unchanged)

### Technical Challenges
- Ensuring AI copies boundaries exactly (100 chars)
- Batch overlap stitching for large documents
- Maintaining metadata extraction quality
- Graceful fallback when boundary matching fails

---

## Phase Organization

### Phase 1: Core Module Implementation (2-3 hours)
**Objective**: Create new simplified modules for cleanup and chunking
**Deliverables**: Two new module files with linear processing flow
**Milestones**: Unit tests passing, boundary matching working

### Phase 2: Testing Infrastructure (45 minutes)
**Objective**: Validate new modules with comprehensive tests
**Deliverables**: Unit and integration tests
**Milestones**: >90% test coverage, boundary matching validated

### Phase 3: Processor Simplification (1.5 hours)
**Objective**: Simplify PDF and EPUB processors to use new modules
**Deliverables**: Simplified processors (70% code reduction)
**Milestones**: End-to-end processing working

### Phase 4: Deployment & Validation (30 minutes)
**Objective**: Deploy and validate with real documents
**Deliverables**: Deployed system with >90% match rate
**Milestones**: Production validation complete

---

## Detailed Task Breakdown

## Task T-001: Create markdown-cleanup-simple.ts

**Priority**: Critical
**Estimated Effort**: 45 minutes
**Source PRP Document**: `docs/prps/simplified-pipeline.md`

### Dependencies
- **Prerequisites**: None
- **Blocks**: T-002, T-003, T-005, T-006

### Acceptance Criteria

```gherkin
Scenario 1: Small document cleanup (single pass)
  Given a markdown document <50,000 characters
  When cleanMarkdown() is called
  Then AI cleanup is performed in a single batch
  And artifacts are removed (filenames, page numbers, TOC)
  And actual content is preserved

Scenario 2: Large document cleanup (batched)
  Given a markdown document >50,000 characters
  When cleanMarkdown() is called
  Then document is processed in 100K char batches
  And batches have 2K char overlap
  And stitchMarkdownBatches() merges results
  And no content is lost at boundaries

Scenario 3: AI error handling
  Given an AI API call failure
  When processing a batch
  Then error is classified (transient vs permanent)
  And appropriate retry logic is applied
```

### Implementation Details

**Files to Create**:
```
├── worker/lib/markdown-cleanup-simple.ts - AI-powered cleanup with batching (~150 lines)
```

**Code Patterns to Follow**:
- **Batching Pattern**: `worker/lib/pdf-batch-utils.ts:100-400` - Batch size and overlap strategy
- **Stitching**: `worker/lib/fuzzy-matching.ts:667-750` - Use existing stitchMarkdownBatches()
- **AI Client**: `worker/lib/ai-client.ts` - Gemini integration patterns

### Manual Testing Steps
1. Create test markdown with known artifacts
2. Run cleanup and verify artifacts removed
3. Check batch boundaries for content preservation
4. Verify cost tracking shows ~$0.10 for cleanup

### Validation Commands
```bash
cd worker
npx tsc --noEmit  # TypeScript compilation
npm test -- markdown-cleanup-simple.test.ts  # Unit tests
```

---

## Task T-002: Create chunking-simple.ts

**Priority**: Critical
**Estimated Effort**: 1 hour
**Source PRP Document**: `docs/prps/simplified-pipeline.md`

### Dependencies
- **Prerequisites**: T-001 (for testing full pipeline)
- **Blocks**: T-003, T-005, T-006

### Acceptance Criteria

```gherkin
Scenario 1: Boundary-based chunk matching
  Given AI returns chunks with boundaryBefore and boundaryAfter
  When findWithBoundaries() is called
  Then chunk position is found using indexOf(boundaryBefore)
  And chunk end is found using indexOf(boundaryAfter)
  And matched content equals expected chunk content
  And match rate exceeds 95%

Scenario 2: Fallback to content search
  Given boundary matching fails (boundaries not found)
  When fallback is triggered
  Then content search using indexOf(chunk.content) is attempted
  And warning is logged for debugging
  And chunk is still matched if content found

Scenario 3: Metadata extraction
  Given chunks are matched successfully
  When chunks are returned
  Then each chunk has themes (2-3 items)
  And concepts (5-10 items with importance scores)
  And emotional tone (polarity, emotion, intensity)
  And domain classification
```

### Implementation Details

**Files to Create**:
```
├── worker/lib/chunking-simple.ts - Boundary-based matching (~200 lines)
```

**Key Implementation Steps**:
1. Implement `chunkWithBoundaries()` main function
2. Implement `findWithBoundaries()` for position matching
3. Implement `chunkBatch()` for AI interaction
4. Add progress tracking callbacks
5. Validate boundary length (exactly 100 chars)

**Code Patterns to Follow**:
- **Progress Tracking**: `worker/processors/base.ts:updateProgress()` - Progress callback pattern
- **Error Classification**: `worker/lib/errors.ts` - Error handling patterns
- **Metadata Mapping**: `worker/processors/base.ts:mapAIChunkToDatabase()` - camelCase to snake_case

### Manual Testing Steps
1. Process test document with known content
2. Verify boundaries are exactly 100 chars
3. Check match rate logs (should be >90%)
4. Inspect chunk metadata completeness

### Validation Commands
```bash
cd worker
npx tsc --noEmit  # TypeScript compilation
npm test -- chunking-simple.test.ts  # Unit tests
```

---

## Task T-003: Write unit tests for new modules

**Priority**: High
**Estimated Effort**: 45 minutes
**Source PRP Document**: `docs/prps/simplified-pipeline.md`

### Dependencies
- **Prerequisites**: T-001, T-002
- **Blocks**: T-007 (integration tests)

### Acceptance Criteria

```gherkin
Scenario 1: Cleanup module tests
  Given markdown-cleanup-simple.test.ts
  When tests are run
  Then single batch cleanup is tested
  And multi-batch with stitching is tested
  And artifact removal is validated
  And error handling is tested

Scenario 2: Chunking module tests
  Given chunking-simple.test.ts
  When tests are run
  Then boundary matching algorithm is tested
  And fallback to content search is tested
  And metadata extraction is validated
  And edge cases are covered (short/long chunks)

Scenario 3: Test coverage
  Given both test files
  When coverage is measured
  Then >90% line coverage achieved
  And all critical paths tested
```

### Implementation Details

**Files to Create**:
```
├── worker/tests/lib/markdown-cleanup-simple.test.ts - Cleanup tests
├── worker/tests/lib/chunking-simple.test.ts - Chunking tests
```

**Test Cases to Include**:
- Boundary matching success/failure scenarios
- Batch stitching with overlap detection
- Metadata validation
- Progress tracking callbacks
- Error recovery paths

### Validation Commands
```bash
cd worker
npm test -- tests/lib/  # Run all lib tests
npm run test:coverage  # Check coverage metrics
```

---

## Task T-004: Create integration test suite

**Priority**: High
**Estimated Effort**: 30 minutes
**Source PRP Document**: `docs/prps/simplified-pipeline.md`

### Dependencies
- **Prerequisites**: T-003, T-005, T-006
- **Blocks**: T-008 (deployment)

### Acceptance Criteria

```gherkin
Scenario 1: End-to-end PDF processing
  Given a test PDF document
  When processed through simplified pipeline
  Then extraction → cleanup → chunking works
  And match rate exceeds 90%
  And processing time is under 20 minutes
  And cost is ~$0.50

Scenario 2: End-to-end EPUB processing
  Given a test EPUB document
  When processed through simplified pipeline
  Then chapters are combined and cleaned
  And chunks are matched successfully
  And metadata is complete
```

### Implementation Details

**Files to Create**:
```
├── worker/tests/integration/simplified-pipeline.test.ts - E2E tests
```

### Validation Commands
```bash
cd worker
npm run test:integration -- simplified-pipeline.test.ts
```

---

## Task T-005: Simplify epub-processor.ts

**Priority**: High
**Estimated Effort**: 45 minutes
**Source PRP Document**: `docs/prps/simplified-pipeline.md`

### Dependencies
- **Prerequisites**: T-001, T-002
- **Blocks**: T-007 (integration test)

### Acceptance Criteria

```gherkin
Scenario 1: Code reduction
  Given existing epub-processor.ts (280 lines)
  When simplified
  Then reduced to ~120 lines
  And complex batching removed
  And review mode removed
  And type-specific chunking removed

Scenario 2: Linear flow
  Given simplified processor
  When processing EPUB
  Then follows linear pipeline: parse → clean → chunk → return
  And uses new cleanup and chunking modules
  And maintains progress tracking
```

### Implementation Details

**Files to Modify**:
```
├── worker/processors/epub-processor.ts - Reduce from 280 to 120 lines
```

**Changes Required**:
1. Import new modules (markdown-cleanup-simple, chunking-simple)
2. Remove windowed batching logic
3. Remove review mode paths
4. Remove type-specific chunking
5. Simplify to linear flow

### Manual Testing Steps
1. Process test EPUB document
2. Verify clean markdown output
3. Check chunk match rate >90%
4. Verify processing time reasonable

---

## Task T-006: Simplify pdf-processor.ts

**Priority**: High
**Estimated Effort**: 45 minutes
**Source PRP Document**: `docs/prps/simplified-pipeline.md`

### Dependencies
- **Prerequisites**: T-001, T-002
- **Blocks**: T-007 (integration test)

### Acceptance Criteria

```gherkin
Scenario 1: Code reduction
  Given existing pdf-processor.ts (689 lines)
  When simplified
  Then reduced to ~150 lines
  And review mode removed
  And complex progress tracking removed
  And service role key refresh removed

Scenario 2: Reuse existing patterns
  Given simplified processor
  When processing PDF
  Then uses extractLargePDF() from pdf-batch-utils
  And uses cleanPageArtifacts() from text-cleanup
  And uses new cleanup and chunking modules
```

### Implementation Details

**Files to Modify**:
```
├── worker/processors/pdf-processor.ts - Reduce from 689 to 150 lines
```

**Changes Required**:
1. Keep extractLargePDF() - it works well
2. Keep cleanPageArtifacts() - regex cleanup works
3. Add cleanMarkdown() for AI cleanup
4. Add chunkWithBoundaries() for chunking
5. Remove all complex logic

---

## Task T-007: Archive old modules

**Priority**: Low
**Estimated Effort**: 5 minutes
**Source PRP Document**: `docs/prps/simplified-pipeline.md`

### Dependencies
- **Prerequisites**: T-005, T-006 (processors updated)
- **Blocks**: None

### Acceptance Criteria

```gherkin
Scenario 1: Archive without deletion
  Given old complex modules
  When archiving
  Then files renamed with .old extension
  And kept for reference during testing
  And not deleted immediately
```

### Implementation Details

**Files to Archive**:
```
├── worker/lib/ai-chunking-batch.ts → ai-chunking-batch.ts.old
├── worker/lib/markdown-cleanup-ai.ts → markdown-cleanup-ai.ts.old
```

### Manual Testing Steps
1. Rename files with .old extension
2. Verify imports updated in processors
3. Keep files for rollback reference

---

## Task T-008: Deploy and validate

**Priority**: Critical
**Estimated Effort**: 20 minutes
**Source PRP Document**: `docs/prps/simplified-pipeline.md`

### Dependencies
- **Prerequisites**: All previous tasks (T-001 through T-007)
- **Blocks**: None

### Acceptance Criteria

```gherkin
Scenario 1: Fresh deployment
  Given completed implementation
  When deploying
  Then database reset with npx supabase db reset
  And services started with npm run dev
  And test document processed successfully
  And logs show >90% match rate

Scenario 2: Validation metrics
  Given deployed system
  When processing test document
  Then chunk match rate >90%
  And processing time <20 minutes for 500 pages
  And markdown is clean (no artifacts)
  And all metadata populated
```

### Implementation Details

**Deployment Steps**:
```bash
# 1. Clean any in-flight jobs
# Check background_jobs table

# 2. Reset database
npx supabase db reset

# 3. Commit changes
git add -A
git commit -m "feat: simplify pipeline with boundary-based chunking"

# 4. Start services
npm run dev

# 5. Test with document
# Upload test PDF/EPUB
# Monitor logs for match rate
```

### Manual Testing Steps
1. Upload 500-page test PDF
2. Monitor processing logs
3. Check match rate >90%
4. Verify markdown quality
5. Test annotation recovery

### Rollback Plan
```bash
# If match rate <80%
git revert HEAD
npx supabase db reset
npm run dev
```

---

## Task T-009: Performance validation

**Priority**: Medium
**Estimated Effort**: 30 minutes
**Source PRP Document**: `docs/prps/simplified-pipeline.md`

### Dependencies
- **Prerequisites**: T-008 (deployment complete)
- **Blocks**: None

### Acceptance Criteria

```gherkin
Scenario 1: Processing time validation
  Given 500-page book
  When processed
  Then completes in <20 minutes
  And costs ~$0.50-0.60

Scenario 2: Match rate validation
  Given multiple test documents
  When processed
  Then average match rate >90%
  And boundary failures <5%
  And fallback usage <1%
```

### Manual Testing Steps
1. Process variety of documents (PDF, EPUB)
2. Record processing times
3. Calculate average match rates
4. Document cost breakdown
5. Create performance report

---

## Implementation Recommendations

### Suggested Team Structure
For a single developer:
1. Complete Phase 1 tasks first (T-001, T-002, T-003)
2. Run tests to validate modules work
3. Then tackle Phase 3 (T-005, T-006)
4. Finally deploy and validate (T-008, T-009)

### Optimal Task Sequencing
**Sequential Path**: T-001 → T-002 → T-003 → T-005/T-006 → T-007 → T-004 → T-008 → T-009

**Parallelization Opportunities**:
- T-005 and T-006 can be done in parallel after T-002
- T-003 and T-004 can be developed while processors are being simplified

### Resource Allocation Suggestions
- **Morning** (high focus): T-001, T-002 (core algorithm work)
- **Afternoon**: T-003, T-004 (testing)
- **Next session**: T-005, T-006 (simplification)
- **Final session**: T-008, T-009 (deployment/validation)

---

## Critical Path Analysis

### Tasks on Critical Path
1. **T-001** (markdown-cleanup-simple.ts) - Blocks all processing
2. **T-002** (chunking-simple.ts) - Core matching algorithm
3. **T-005/T-006** (processor updates) - Integration points
4. **T-008** (deployment) - Final validation

### Potential Bottlenecks
- **AI boundary copying accuracy** - If AI doesn't copy exactly, matching fails
- **Batch stitching** - Overlap detection must work perfectly
- **Fallback performance** - If >5% need fallback, investigate root cause

### Schedule Optimization Suggestions
- Start with T-001/T-002 to unblock everything else
- Write tests (T-003) while developing to catch issues early
- Keep T-007 (archiving) for end to avoid confusion
- Have rollback plan ready before T-008

---

## Risk Mitigation

### Identified Risks
1. **Boundary matching failure** (Low probability, Medium impact)
   - Mitigation: Fallback to content search
   - Detection: Log match rates

2. **Batch stitching issues** (Low probability, High impact)
   - Mitigation: Use existing proven stitching function
   - Detection: Content validation tests

3. **Metadata extraction failure** (Medium probability, High impact)
   - Mitigation: Validate in tests, use existing patterns
   - Detection: Check database after processing

### Monitoring Strategy
- Check logs for match rate after each document
- Alert if match rate <90%
- Monitor processing time and cost
- Validate metadata completeness

---

## Success Metrics

### Quantitative Metrics
- **Primary**: Chunk match rate >90%
- **Secondary**: Processing time <20 min for 500 pages
- **Tertiary**: Cost ~$0.50-0.60 per book
- **Code Quality**: 70% reduction in lines (1500 → 400)

### Qualitative Metrics
- Markdown cleanliness (no artifacts)
- Code readability improvement
- Maintenance simplicity
- Debug-ability enhancement

### Validation Checkpoints
- [ ] Unit tests pass (T-003)
- [ ] Integration tests pass (T-004)
- [ ] Match rate >90% (T-008)
- [ ] Processing time <20 min (T-009)
- [ ] Cost within budget (T-009)
- [ ] No regressions in features

---

## Notes

### Key Implementation Constraints
- Gemini 2.5 Flash has 65K output token limit (requires batching)
- Boundaries must be exactly 100 characters for reliability
- ESM imports require .js extension (not .ts)
- JSONB fields use snake_case in database, camelCase in TypeScript

### Success Factors
- Reusing existing proven patterns (stitching, batching)
- Linear pipeline eliminates complexity
- Boundary matching more reliable than offset arithmetic
- AI cleanup improves markdown quality

### Follow-up Opportunities
After successful implementation:
- Apply similar simplification to other processors
- Consider boundary approach for other matching problems
- Document the pattern for future refactoring

---

**Generated**: 2025-10-07
**Confidence Score**: 9/10 - Well-defined refactoring with clear patterns and low risk