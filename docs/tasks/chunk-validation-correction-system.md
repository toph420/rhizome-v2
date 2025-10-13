# Task Breakdown: Chunk Validation and Correction System

**Source PRP**: `docs/prps/chunk-validation-correction-system.md`
**Status**: Ready for Implementation
**Total Estimated Effort**: 5-6 hours
**Task Count**: 18 tasks (8 phases)
**Priority**: P1 (Critical Quality System)

---

## PRP Analysis Summary

### Feature Name and Scope
**Chunk Validation and Correction System** - A quality assurance workflow for LOCAL mode document processing that enables users to review, validate, and correct chunk positions that have matching warnings (overlap corrections, synthetic interpolations).

### Key Technical Requirements
1. **Database Layer**: Add 5 new columns to chunks table (validation_warning, validation_details, overlap_corrected, position_corrected, correction_history)
2. **Matcher Integration**: Attach validation metadata to MatchResult objects during bulletproof matching
3. **Processor Integration**: Persist validation warnings to database during chunk insertion
4. **Hook Refactoring**: Replace synthetic-only queries with comprehensive unvalidated chunk queries
5. **UI Implementation**: Build validation/correction workflow in ChunkQualityPanel
6. **Server Actions**: Implement validation and correction operations with overlap detection
7. **Reader Integration**: Support correction mode with text selection and offset calculation

### Validation Requirements
- **Data Persistence**: 100% of warnings must persist to database (no ephemeral storage)
- **UI Accuracy**: All unvalidated chunks visible in ChunkQualityPanel
- **Overlap Detection**: 100% of overlapping corrections must be caught and rejected
- **Correction History**: Full audit trail with timestamps and reasons
- **Performance**: Query unvalidated chunks in <100ms

---

## Task Complexity Assessment

### Overall Complexity Rating
**Moderate-High** (7/10)
- Database migration: Low complexity (additive schema changes)
- Matcher updates: Medium complexity (existing patterns + new metadata)
- Server actions: Medium-high complexity (overlap detection logic)
- UI implementation: High complexity (correction workflow with text selection)

### Integration Points
1. **Bulletproof Matcher** → PDF Processor (MatchResult → ProcessedChunk mapping)
2. **PDF Processor** → Database (chunk insertion with validation metadata)
3. **Database** → Hooks (unvalidated chunk queries)
4. **Hooks** → ChunkQualityPanel (data display and categorization)
5. **ChunkQualityPanel** → Server Actions (validation/correction operations)
6. **Server Actions** → Document Reader (correction mode navigation)
7. **Document Reader** → Offset Calculator (text selection → offsets)

### Technical Challenges
1. **Overlap Detection Logic**: Must check adjacent chunks for offset conflicts
2. **Correction Mode UX**: Text selection → offset calculation → confirmation workflow
3. **Data Migration**: Existing chunks have no validation metadata (handled by defaults)
4. **Categorization Logic**: Distinguishing synthetic vs overlap-corrected chunks

---

## Phase Organization

### Phase 1: Database Foundation (30 minutes)
**Objective**: Create schema for validation metadata storage
**Deliverables**:
- Migration 047 applied
- TypeScript types updated
- Indexes created for query optimization

**Milestones**:
- ✅ Migration runs without errors
- ✅ All new columns exist with correct types
- ✅ Indexes created for performance

---

### Phase 2: Matcher Enhancement (45 minutes)
**Objective**: Attach validation warnings during chunk matching
**Deliverables**:
- MatchResult interface extended with validation fields
- Overlap correction logic generates warnings
- Synthetic chunk logic generates warnings
- Stats tracking updated

**Milestones**:
- ✅ Overlap warnings attached with details
- ✅ Synthetic warnings attached with metadata
- ✅ Logging distinguishes overlap vs synthetic

---

### Phase 3: Processor Integration (30 minutes)
**Objective**: Persist validation metadata during chunk insertion
**Deliverables**:
- ProcessedChunk mapping includes validation fields
- Logging updated for clarity

**Milestones**:
- ✅ Warnings persisted to database during processing
- ✅ Logs show "Overlap corrections: X" and "Layer 4 (Synthetic): Y"

---

### Phase 4: Server Actions (60 minutes)
**Objective**: Implement validation and correction operations
**Deliverables**:
- validateChunkPosition() action
- updateChunkOffsets() action with overlap detection
- Correction history tracking

**Milestones**:
- ✅ Simple validation works
- ✅ Overlap detection prevents invalid corrections
- ✅ Correction history appends properly

---

### Phase 5: Hook Refactoring (30 minutes)
**Objective**: Query all unvalidated chunks, not just synthetic
**Deliverables**:
- useUnvalidatedChunks hook replaces useSyntheticChunks
- Categorization by warning type
- useChunkStats updated

**Milestones**:
- ✅ Hook returns {synthetic, overlapCorrected, lowSimilarity, all}
- ✅ ChunkStats shows overlap count

---

### Phase 6: UI Implementation (90 minutes)
**Objective**: Build validation/correction workflow in ChunkQualityPanel
**Deliverables**:
- ChunkQualityPanel refactored with new hook
- Warning details display
- Validation buttons
- Correction mode UI
- Toast notifications

**Milestones**:
- ✅ All unvalidated chunks displayed
- ✅ Validation buttons work
- ✅ Correction mode enters successfully
- ✅ Toast feedback works

---

### Phase 7: Reader Integration (60 minutes)
**Objective**: Support correction mode with text selection
**Deliverables**:
- Correction mode state in reader
- Text selection handler
- Offset calculation integration
- Confirmation dialog

**Milestones**:
- ✅ Correction mode banner shows
- ✅ Text selection calculates offsets
- ✅ Confirmation dialog shows before/after preview
- ✅ Correction submits successfully

---

### Phase 8: Testing & Validation (45 minutes)
**Objective**: Comprehensive testing and validation
**Deliverables**:
- Unit tests for overlap detection
- Integration tests for warning persistence
- Manual testing checklist completed

**Milestones**:
- ✅ All automated tests pass
- ✅ Manual testing checklist 100% complete
- ✅ No TypeScript errors

---

## Detailed Task Breakdown

### Phase 1: Database Foundation

---

#### Task T-001: Create Migration 047
**Priority**: Critical
**Estimated Effort**: 15 minutes
**Dependencies**: None

**Context & Background**:
Migration adds validation metadata columns to chunks table. This is an additive migration (backward compatible).

**Technical Requirements**:
- Add 5 columns: validation_warning (TEXT), validation_details (JSONB), overlap_corrected (BOOLEAN), position_corrected (BOOLEAN), correction_history (JSONB)
- Create 2 indexes for query optimization
- Add column comments for documentation

**Files to Modify/Create**:
```
├── supabase/migrations/047_chunk_validation_corrections.sql - [NEW: Migration file]
```

**Implementation Steps**:
1. Create migration file with 047 prefix
2. Add ALTER TABLE statements for new columns
3. Create indexes on position_validated and overlap_corrected
4. Add COMMENT statements for documentation
5. Test migration: `npx supabase db reset`

**Code Pattern Reference**:
- Migration pattern: `supabase/migrations/046_cached_chunks.sql` (similar structure)

**Acceptance Criteria**:
```gherkin
Scenario 1: Migration applies successfully
  Given fresh database
  When migration 047 runs
  Then all 5 columns exist with correct types
  And 2 indexes created
  And no errors logged

Scenario 2: Migration is idempotent
  Given migration already applied
  When migration runs again
  Then no errors occur
  And columns remain unchanged
```

**Validation Commands**:
```bash
# Reset database and check migration
npx supabase db reset
psql -d rhizome -c "\d chunks" | grep validation_warning
```

**Definition of Done**:
- [ ] Migration file created with 047 prefix
- [ ] All 5 columns added with correct types
- [ ] Indexes created (idx_chunks_needs_validation, idx_chunks_overlap_corrected)
- [ ] Column comments added
- [ ] Migration applies cleanly on fresh database
- [ ] No TypeScript errors

---

#### Task T-002: Update TypeScript Types
**Priority**: Critical
**Estimated Effort**: 15 minutes
**Dependencies**: T-001

**Context & Background**:
Update ProcessedChunk interface to include new validation metadata fields.

**Technical Requirements**:
- Add validation_warning?: string | null
- Add validation_details?: ValidationDetails | null
- Add overlap_corrected: boolean
- Add position_corrected: boolean
- Add correction_history: CorrectionHistoryEntry[]

**Files to Modify/Create**:
```
├── worker/types/processor.ts - [MODIFY: Add validation fields to ProcessedChunk]
├── worker/lib/local/bulletproof-matcher.ts - [MODIFY: Add validation fields to MatchResult]
```

**Implementation Steps**:
1. Define ValidationDetails interface
2. Define CorrectionHistoryEntry interface
3. Update ProcessedChunk interface
4. Update MatchResult interface
5. Run type-check: `npm run type-check`

**Code Pattern Reference**:
- Interface pattern: `worker/types/processor.ts:63-91` (existing ProcessedChunk)

**Acceptance Criteria**:
```gherkin
Scenario 1: Types compile successfully
  Given updated interfaces
  When TypeScript compiler runs
  Then no type errors occur
  And all validation fields properly typed

Scenario 2: Null safety preserved
  Given optional fields
  When accessed in code
  Then null checks required
```

**Validation Commands**:
```bash
# Type check
npm run type-check
cd worker && npm run type-check
```

**Definition of Done**:
- [ ] ValidationDetails interface defined
- [ ] CorrectionHistoryEntry interface defined
- [ ] ProcessedChunk interface updated
- [ ] MatchResult interface updated
- [ ] No TypeScript errors in project
- [ ] Null safety enforced for optional fields

---

### Phase 2: Matcher Enhancement

---

#### Task T-003: Attach Warnings During Overlap Correction
**Priority**: High
**Estimated Effort**: 25 minutes
**Dependencies**: T-002

**Context & Background**:
When bulletproof matcher detects overlapping chunks, it adjusts offsets and downgrades confidence. Need to capture original offsets and generate validation warning.

**Technical Requirements**:
- Store original offsets before adjustment
- Build validation_warning message
- Build validation_details object with type, offsets, reason
- Set overlap_corrected = true
- Push warning to warnings array

**Files to Modify/Create**:
```
├── worker/lib/local/bulletproof-matcher.ts:833-868 - [MODIFY: Overlap correction logic]
```

**Implementation Steps**:
1. Before offset adjustment: capture originalStart, originalEnd
2. After adjustment: build validation_warning string
3. Build validation_details object with overlap_corrected type
4. Set overlap_corrected = true on MatchResult
5. Push warning to warnings array

**Code Pattern Reference**:
- Overlap correction: `worker/lib/local/bulletproof-matcher.ts:833-868` (existing logic)
- Warning format: See PRP section "Data Flow - During Processing"

**Acceptance Criteria**:
```gherkin
Scenario 1: Overlap warning attached
  Given two chunks with overlapping offsets
  When bulletproof matcher processes them
  Then second chunk has validation_warning populated
  And validation_details.type = 'overlap_corrected'
  And original_offsets differ from adjusted_offsets
  And overlap_corrected = true

Scenario 2: Confidence downgrade tracked
  Given overlap correction from exact → high
  When warning attached
  Then validation_details.confidence_downgrade = 'exact → high'
```

**Validation Commands**:
```bash
# Unit test
cd worker && npm test -- bulletproof-matcher
```

**Definition of Done**:
- [ ] Original offsets captured before adjustment
- [ ] validation_warning string built with offset details
- [ ] validation_details object populated
- [ ] overlap_corrected flag set
- [ ] Warning pushed to warnings array
- [ ] Unit tests pass

---

#### Task T-004: Attach Warnings for Synthetic Chunks
**Priority**: High
**Estimated Effort**: 15 minutes
**Dependencies**: T-002

**Context & Background**:
Layer 4 interpolation generates synthetic chunks when no match found. Need to attach validation warning with metadata.

**Technical Requirements**:
- Build validation_warning with chunk index, page number
- Set validation_details.type = 'synthetic'
- Add reason explaining Layer 4 interpolation
- Push warning to warnings array

**Files to Modify/Create**:
```
├── worker/lib/local/bulletproof-matcher.ts:793-810 - [MODIFY: Layer 4 synthetic chunk generation]
```

**Implementation Steps**:
1. In layer4_interpolation results loop
2. Build validation_warning string with chunk index and page
3. Set validation_details.type = 'synthetic'
4. Add reason: "Layer 4 interpolation (no exact match found)"
5. Push warning to warnings array

**Code Pattern Reference**:
- Layer 4 logic: `worker/lib/local/bulletproof-matcher.ts:793-810`
- Warning format: See PRP "Data Flow - During Processing"

**Acceptance Criteria**:
```gherkin
Scenario 1: Synthetic warning attached
  Given chunk processed via Layer 4
  When synthetic result generated
  Then validation_warning includes chunk index and page
  And validation_details.type = 'synthetic'
  And reason explains Layer 4 interpolation

Scenario 2: Page number included
  Given chunk with page_start metadata
  When warning generated
  Then validation_warning includes "page X"
```

**Validation Commands**:
```bash
# Unit test
cd worker && npm test -- bulletproof-matcher
```

**Definition of Done**:
- [ ] validation_warning built with chunk index and page
- [ ] validation_details.type = 'synthetic'
- [ ] Reason includes "Layer 4 interpolation"
- [ ] Warning pushed to warnings array
- [ ] Unit tests pass

---

#### Task T-005: Update Stats Tracking
**Priority**: Medium
**Estimated Effort**: 10 minutes
**Dependencies**: T-003, T-004

**Context & Background**:
Logging currently shows "Synthetic: 0/9" (Layer 4 only). Need to track overlap corrections separately.

**Technical Requirements**:
- Add overlapCorrected counter to MatchStats
- Increment for each overlap correction
- Update logging to show both metrics

**Files to Modify/Create**:
```
├── worker/lib/local/bulletproof-matcher.ts:871-886 - [MODIFY: Stats tracking]
├── worker/processors/pdf-processor.ts:313-323 - [MODIFY: Logging output]
```

**Implementation Steps**:
1. Add overlapCorrected: number to MatchStats interface
2. Increment counter when overlap_corrected = true
3. Update log message: "Layer 4 (Synthetic): X/Y"
4. Add log message: "Overlap corrections: X/Y"
5. Update warnings message: "Total needing validation: X chunks"

**Code Pattern Reference**:
- Stats tracking: `worker/lib/local/bulletproof-matcher.ts:871-886`

**Acceptance Criteria**:
```gherkin
Scenario 1: Overlap count tracked
  Given 3 overlap corrections during matching
  When stats logged
  Then overlapCorrected = 3

Scenario 2: Logging clarity
  Given 2 synthetic and 5 overlap corrections
  When logs printed
  Then shows "Layer 4 (Synthetic): 2/N"
  And shows "Overlap corrections: 5/N"
  And shows "Total needing validation: 7 chunks"
```

**Validation Commands**:
```bash
# Process test document and check logs
cd worker && npm run dev
# Check console output for updated log messages
```

**Definition of Done**:
- [ ] overlapCorrected counter added to MatchStats
- [ ] Counter incremented for overlap corrections
- [ ] Logging updated: "Layer 4 (Synthetic): X/Y"
- [ ] Logging added: "Overlap corrections: X/Y"
- [ ] Total validation message updated
- [ ] Logs clear and unambiguous

---

### Phase 3: Processor Integration

---

#### Task T-006: Save Validation Metadata to Database
**Priority**: Critical
**Estimated Effort**: 20 minutes
**Dependencies**: T-003, T-004, T-005

**Context & Background**:
PDF processor converts MatchResult objects to ProcessedChunk format. Need to map validation fields.

**Technical Requirements**:
- Map validation_warning from MatchResult to ProcessedChunk
- Map validation_details from MatchResult to ProcessedChunk
- Map overlap_corrected flag
- Initialize position_corrected = false
- Initialize correction_history = []

**Files to Modify/Create**:
```
├── worker/processors/pdf-processor.ts:327-363 - [MODIFY: Chunk mapping logic]
```

**Implementation Steps**:
1. In rematchedChunks.map(), add validation_warning mapping
2. Add validation_details mapping with null fallback
3. Add overlap_corrected mapping with false fallback
4. Initialize position_corrected = false
5. Initialize correction_history = []

**Code Pattern Reference**:
- Chunk mapping: `worker/processors/pdf-processor.ts:327-363`
- MatchResult → ProcessedChunk conversion

**Acceptance Criteria**:
```gherkin
Scenario 1: Validation metadata persisted
  Given MatchResult with validation_warning
  When converted to ProcessedChunk
  Then validation_warning copied to ProcessedChunk
  And validation_details copied to ProcessedChunk
  And overlap_corrected copied to ProcessedChunk

Scenario 2: Defaults set correctly
  Given MatchResult without warnings
  When converted to ProcessedChunk
  Then validation_warning = null
  And overlap_corrected = false
  And position_corrected = false
  And correction_history = []
```

**Validation Commands**:
```bash
# Integration test
cd worker && npm run test:integration
```

**Definition of Done**:
- [ ] validation_warning mapped from MatchResult
- [ ] validation_details mapped from MatchResult
- [ ] overlap_corrected mapped from MatchResult
- [ ] position_corrected initialized to false
- [ ] correction_history initialized to empty array
- [ ] Integration tests pass
- [ ] Warnings persist to database

---

#### Task T-007: Update Processor Logging
**Priority**: Low
**Estimated Effort**: 10 minutes
**Dependencies**: T-005, T-006

**Context & Background**:
Processor logging should match the updated stats from bulletproof matcher.

**Technical Requirements**:
- Update "Synthetic" log to "Layer 4 (Synthetic)"
- Add "Overlap corrections" log line
- Update total warnings message

**Files to Modify/Create**:
```
├── worker/processors/pdf-processor.ts:313-323 - [MODIFY: Logging statements]
```

**Implementation Steps**:
1. Find "Synthetic: X/Y" log statement
2. Update to "Layer 4 (Synthetic): X/Y"
3. Add "Overlap corrections: X/Y" log line
4. Update warnings.length message to "Total needing validation: X chunks"

**Code Pattern Reference**:
- Logging pattern: `worker/processors/pdf-processor.ts:313-323`

**Acceptance Criteria**:
```gherkin
Scenario 1: Logging matches matcher output
  Given processor receives MatchStats
  When logs printed
  Then shows "Layer 4 (Synthetic): X/Y"
  And shows "Overlap corrections: X/Y"
  And shows "Total needing validation: X chunks"
```

**Validation Commands**:
```bash
# Manual testing - check logs
npm run dev:worker
# Process test document, verify log output
```

**Definition of Done**:
- [ ] "Synthetic" updated to "Layer 4 (Synthetic)"
- [ ] "Overlap corrections" log added
- [ ] Total validation message updated
- [ ] Logs consistent with matcher output

---

### Phase 4: Server Actions

---

#### Task T-008: Create Validation Server Action
**Priority**: High
**Estimated Effort**: 15 minutes
**Dependencies**: T-001, T-002

**Context & Background**:
Simple server action to mark chunk as validated (position_validated = true).

**Technical Requirements**:
- Accept chunkId and documentId parameters
- Update position_validated = true
- Revalidate path for document reader
- Return success/error response

**Files to Modify/Create**:
```
├── src/app/actions/chunks.ts - [NEW: Server actions file]
```

**Implementation Steps**:
1. Create chunks.ts with 'use server' directive
2. Implement validateChunkPosition(chunkId, documentId)
3. Query chunks table, update position_validated
4. Call revalidatePath(`/read/${documentId}`)
5. Return {success: boolean, error?: string}

**Code Pattern Reference**:
- Server action pattern: `src/app/actions/annotations.ts:273-466`
- Error handling approach

**Acceptance Criteria**:
```gherkin
Scenario 1: Validation succeeds
  Given valid chunkId and documentId
  When validateChunkPosition called
  Then position_validated = true in database
  And path revalidated
  And returns {success: true}

Scenario 2: Chunk not found
  Given invalid chunkId
  When validateChunkPosition called
  Then returns {success: false, error: 'Chunk not found'}
```

**Validation Commands**:
```bash
# Unit test
npm test -- src/app/actions/chunks.test.ts
```

**Definition of Done**:
- [ ] chunks.ts file created with 'use server'
- [ ] validateChunkPosition() implemented
- [ ] position_validated updated in database
- [ ] Path revalidation works
- [ ] Error handling implemented
- [ ] Unit tests pass

---

#### Task T-009: Implement Overlap Detection Logic
**Priority**: Critical
**Estimated Effort**: 25 minutes
**Dependencies**: T-008

**Context & Background**:
Core logic to prevent chunk offset corrections that overlap with adjacent chunks.

**Technical Requirements**:
- Query adjacent chunks (chunk_index ± 1)
- Check if new offsets overlap with adjacent ranges
- Return detailed error with adjacent chunk info if overlap detected

**Files to Modify/Create**:
```
├── src/app/actions/chunks.ts - [MODIFY: Add overlap detection to updateChunkOffsets]
```

**Implementation Steps**:
1. Query chunks with chunk_index ± 1 from current chunk
2. Check if newStartOffset falls within adjacent range
3. Check if newEndOffset falls within adjacent range
4. Check if new range completely contains adjacent
5. Return error with adjacentChunks if overlap detected

**Code Pattern Reference**:
- Database query: `src/app/actions/annotations.ts` (query patterns)

**Acceptance Criteria**:
```gherkin
Scenario 1: Overlap with previous chunk
  Given chunk 5 with offsets [500, 700]
  And chunk 4 with offsets [300, 550]
  When user sets chunk 5 to [520, 720]
  Then returns {success: false, error: 'overlap', adjacentChunks}

Scenario 2: Overlap with next chunk
  Given chunk 5 with offsets [500, 700]
  And chunk 6 with offsets [680, 850]
  When user sets chunk 5 to [500, 750]
  Then returns {success: false, error: 'overlap', adjacentChunks}

Scenario 3: No overlap
  Given chunk 5 with offsets [500, 700]
  And chunk 4 with offsets [300, 490]
  And chunk 6 with offsets [710, 850]
  When user sets chunk 5 to [495, 705]
  Then overlap check passes
```

**Validation Commands**:
```bash
# Unit test overlap detection
npm test -- src/app/actions/chunks.test.ts
```

**Definition of Done**:
- [ ] Adjacent chunks queried correctly
- [ ] All 3 overlap conditions checked
- [ ] Error returned with adjacent chunk details
- [ ] Unit tests cover all overlap scenarios
- [ ] No false positives (valid corrections allowed)

---

#### Task T-010: Implement Correction History Tracking
**Priority**: High
**Estimated Effort**: 20 minutes
**Dependencies**: T-009

**Context & Background**:
Maintain audit trail of all corrections with timestamps and reasons.

**Technical Requirements**:
- Build history entry with timestamp, old_offsets, new_offsets, reason
- Append to existing correction_history array
- Set position_corrected = true
- Trim to last 50 entries to prevent unbounded growth

**Files to Modify/Create**:
```
├── src/app/actions/chunks.ts - [MODIFY: Add history tracking to updateChunkOffsets]
```

**Implementation Steps**:
1. Build historyEntry object with timestamp, offsets, reason
2. Get existing correction_history from chunk
3. Append new entry: [...existing, historyEntry]
4. Trim to last 50 entries: .slice(-50)
5. Update chunk with new history and position_corrected = true

**Code Pattern Reference**:
- JSONB array append: Standard PostgreSQL pattern

**Acceptance Criteria**:
```gherkin
Scenario 1: First correction tracked
  Given chunk with empty correction_history
  When updateChunkOffsets called
  Then correction_history has 1 entry
  And entry includes timestamp, old_offsets, new_offsets, reason

Scenario 2: Multiple corrections tracked
  Given chunk with 2 previous corrections
  When updateChunkOffsets called
  Then correction_history has 3 entries
  And entries in chronological order

Scenario 3: History trimmed
  Given chunk with 50 corrections
  When updateChunkOffsets called
  Then correction_history has 50 entries (oldest removed)
```

**Validation Commands**:
```bash
# Unit test history tracking
npm test -- src/app/actions/chunks.test.ts
```

**Definition of Done**:
- [ ] History entry built with all fields
- [ ] Entry appended to existing history
- [ ] position_corrected set to true
- [ ] History trimmed to last 50 entries
- [ ] Unit tests pass

---

#### Task T-011: Complete updateChunkOffsets Action
**Priority**: Critical
**Estimated Effort**: 15 minutes
**Dependencies**: T-009, T-010

**Context & Background**:
Integrate all pieces: validation, overlap detection, history tracking.

**Technical Requirements**:
- Use Zod for input validation
- Get current chunk
- Run overlap detection
- Build and append history entry
- Update chunk with new offsets and flags
- Revalidate path

**Files to Modify/Create**:
```
├── src/app/actions/chunks.ts - [MODIFY: Complete updateChunkOffsets implementation]
```

**Implementation Steps**:
1. Define Zod schema for input validation
2. Get current chunk from database
3. Query adjacent chunks for overlap detection
4. Run overlap checks (from T-009)
5. Build history entry (from T-010)
6. Update chunk with new offsets, history, flags
7. Revalidate path and return success

**Code Pattern Reference**:
- Zod validation: Standard pattern from other actions
- Server action structure: `src/app/actions/annotations.ts`

**Acceptance Criteria**:
```gherkin
Scenario 1: End-to-end correction succeeds
  Given valid input (no overlap)
  When updateChunkOffsets called
  Then chunk offsets updated in database
  And position_validated = true
  And position_corrected = true
  And correction_history appended
  And path revalidated
  And returns {success: true}

Scenario 2: Invalid input rejected
  Given negative offset
  When updateChunkOffsets called
  Then Zod validation fails
  And returns {success: false, error: 'validation'}

Scenario 3: Overlap rejected
  Given overlapping offsets
  When updateChunkOffsets called
  Then returns {success: false, error: 'overlap', adjacentChunks}
```

**Validation Commands**:
```bash
# Full integration test
npm test -- src/app/actions/chunks.test.ts
```

**Definition of Done**:
- [ ] Zod schema defined and working
- [ ] All steps integrated (validation, overlap, history)
- [ ] Error handling comprehensive
- [ ] Path revalidation works
- [ ] Unit tests cover all scenarios
- [ ] TypeScript types correct

---

### Phase 5: Hook Refactoring

---

#### Task T-012: Create useUnvalidatedChunks Hook
**Priority**: High
**Estimated Effort**: 20 minutes
**Dependencies**: T-001, T-006

**Context & Background**:
Replace synthetic-only query with comprehensive unvalidated chunk query. Categorize by warning type.

**Technical Requirements**:
- Query chunks where position_validated = false
- Select all validation-related columns
- Return categorized results: {synthetic, overlapCorrected, lowSimilarity, all}

**Files to Modify/Create**:
```
├── src/hooks/use-unvalidated-chunks.ts - [NEW: Hook file]
```

**Implementation Steps**:
1. Create hook with documentId parameter
2. Query chunks with position_validated = false
3. Select validation columns (validation_warning, validation_details, etc.)
4. Categorize results by position_confidence and overlap_corrected
5. Return categorized object with synthetic, overlapCorrected, lowSimilarity, all

**Code Pattern Reference**:
- Hook pattern: `src/hooks/use-chunk-stats.ts` (similar structure)
- Supabase query: Standard patterns

**Acceptance Criteria**:
```gherkin
Scenario 1: All unvalidated chunks returned
  Given document with 2 synthetic and 5 overlap-corrected chunks
  When useUnvalidatedChunks called
  Then data.all has 7 chunks
  And data.synthetic has 2 chunks
  And data.overlapCorrected has 5 chunks

Scenario 2: Empty state
  Given document with all chunks validated
  When useUnvalidatedChunks called
  Then data.all is empty array
  And isLoading = false
```

**Validation Commands**:
```bash
# Unit test hook
npm test -- src/hooks/use-unvalidated-chunks.test.ts
```

**Definition of Done**:
- [ ] Hook file created
- [ ] Query returns all unvalidated chunks
- [ ] Categorization logic correct
- [ ] Loading and error states handled
- [ ] Unit tests pass
- [ ] TypeScript types correct

---

#### Task T-013: Update useChunkStats Hook
**Priority**: Low
**Estimated Effort**: 10 minutes
**Dependencies**: T-001

**Context & Background**:
Add overlap_corrected count to stats.

**Technical Requirements**:
- Add overlapCorrected counter
- Aggregate from overlap_corrected column

**Files to Modify/Create**:
```
├── src/hooks/use-chunk-stats.ts - [MODIFY: Add overlapCorrected stat]
```

**Implementation Steps**:
1. Add overlapCorrected: number to ChunkStats interface
2. Query count of chunks with overlap_corrected = true
3. Return in stats object

**Code Pattern Reference**:
- Stats aggregation: `src/hooks/use-chunk-stats.ts` (existing pattern)

**Acceptance Criteria**:
```gherkin
Scenario 1: Overlap count included
  Given document with 5 overlap-corrected chunks
  When useChunkStats called
  Then stats.overlapCorrected = 5
```

**Validation Commands**:
```bash
# Unit test
npm test -- src/hooks/use-chunk-stats.test.ts
```

**Definition of Done**:
- [ ] overlapCorrected added to ChunkStats interface
- [ ] Count query implemented
- [ ] Returned in stats object
- [ ] Unit tests updated

---

### Phase 6: UI Implementation

---

#### Task T-014: Refactor ChunkQualityPanel with New Hook
**Priority**: High
**Estimated Effort**: 30 minutes
**Dependencies**: T-012

**Context & Background**:
Replace useSyntheticChunks with useUnvalidatedChunks. Display all unvalidated chunks grouped by type.

**Technical Requirements**:
- Import useUnvalidatedChunks (replace useSyntheticChunks)
- Display chunks in Accordion grouped by type
- Show warning details (original vs adjusted offsets)
- Add three action buttons: Validate, Fix, View

**Files to Modify/Create**:
```
├── src/components/sidebar/ChunkQualityPanel.tsx - [MODIFY: Complete refactor]
```

**Implementation Steps**:
1. Replace useSyntheticChunks import with useUnvalidatedChunks
2. Update data structure access (data.synthetic, data.overlapCorrected, etc.)
3. Create Accordion sections for each category
4. Display validation_warning text in each chunk item
5. Add three buttons: "✅ Position OK", "🔧 Fix Position", "📍 View"

**Code Pattern Reference**:
- Accordion usage: `@radix-ui/react-accordion` patterns
- Button patterns: shadcn/ui Button component

**Acceptance Criteria**:
```gherkin
Scenario 1: All categories displayed
  Given 3 synthetic and 5 overlap-corrected chunks
  When ChunkQualityPanel renders
  Then shows "Synthetic Chunks (3)" section
  And shows "Overlap-Corrected Chunks (5)" section

Scenario 2: Warning details shown
  Given overlap-corrected chunk
  When accordion item expanded
  Then shows validation_warning text
  And shows original offsets
  And shows adjusted offsets
  And shows reason

Scenario 3: Empty state
  Given all chunks validated
  When ChunkQualityPanel renders
  Then shows "All chunks validated" message
  With green checkmark icon
```

**Validation Commands**:
```bash
# Manual testing
npm run dev
# Open document with unvalidated chunks
```

**Definition of Done**:
- [ ] useUnvalidatedChunks integrated
- [ ] Accordion sections for each category
- [ ] Warning details displayed
- [ ] Three action buttons added
- [ ] Empty state implemented
- [ ] No TypeScript errors

---

#### Task T-015: Implement Validation Button Handler
**Priority**: High
**Estimated Effort**: 15 minutes
**Dependencies**: T-008, T-014

**Context & Background**:
"Position OK" button calls validateChunkPosition server action.

**Technical Requirements**:
- Call validateChunkPosition(chunkId, documentId)
- Show success toast on success
- Show error toast on failure
- Optimistic update (remove from UI immediately)

**Files to Modify/Create**:
```
├── src/components/sidebar/ChunkQualityPanel.tsx - [MODIFY: Add validation handler]
```

**Implementation Steps**:
1. Create handleValidate callback
2. Call validateChunkPosition server action
3. Show toast notification with result
4. Optimistically remove chunk from UI (useOptimistic if available)

**Code Pattern Reference**:
- Toast usage: `sonner` toast library
- Server action call: Standard async/await pattern

**Acceptance Criteria**:
```gherkin
Scenario 1: Validation succeeds
  Given unvalidated chunk
  When "Position OK" clicked
  Then validateChunkPosition called
  And success toast shown
  And chunk removed from panel

Scenario 2: Validation fails
  Given database error
  When "Position OK" clicked
  Then error toast shown with details
  And chunk remains in panel
```

**Validation Commands**:
```bash
# Manual testing
npm run dev
# Click validation button, check toast
```

**Definition of Done**:
- [ ] handleValidate callback implemented
- [ ] Server action called correctly
- [ ] Success toast shown
- [ ] Error toast shown with details
- [ ] Optimistic UI update works

---

#### Task T-016: Implement Correction Mode UI
**Priority**: High
**Estimated Effort**: 45 minutes
**Dependencies**: T-014

**Context & Background**:
"Fix Position" button enters correction mode, navigates to chunk, enables text selection.

**Technical Requirements**:
- Add correctionMode state: {chunkId, originalOffsets} | null
- On "Fix" click: set correction mode, navigate to chunk
- Show floating instruction panel: "Select correct text span"
- On text selection: calculate offsets, show confirmation dialog
- On confirm: call updateChunkOffsets, exit correction mode

**Files to Modify/Create**:
```
├── src/components/sidebar/ChunkQualityPanel.tsx - [MODIFY: Add correction mode state and handler]
├── src/components/reader/CorrectionModePanel.tsx - [NEW: Floating instruction panel]
├── src/components/reader/CorrectionConfirmDialog.tsx - [NEW: Confirmation dialog]
```

**Implementation Steps**:
1. Add correctionMode state to ChunkQualityPanel
2. Create handleFixPosition callback
3. Set correction mode, call onNavigateToChunk with correctionMode flag
4. Create CorrectionModePanel component (floating banner)
5. Create CorrectionConfirmDialog component (before/after preview)
6. On text selection: calculate offsets using offset-calculator.ts
7. Show confirmation dialog with selected text and offsets
8. On confirm: call updateChunkOffsets, exit correction mode

**Code Pattern Reference**:
- Dialog: shadcn/ui Dialog component
- Floating panel: Tailwind fixed positioning
- Offset calculation: `src/lib/reader/offset-calculator.ts`

**Acceptance Criteria**:
```gherkin
Scenario 1: Correction mode entered
  Given unvalidated chunk
  When "Fix Position" clicked
  Then correctionMode state set
  And navigates to chunk in reader
  And floating instruction panel shown

Scenario 2: Text selection captured
  Given correction mode active
  When user selects text in reader
  Then offsets calculated
  And confirmation dialog shown
  And shows selected text preview
  And shows before/after offsets

Scenario 3: Correction submitted
  Given confirmation dialog open
  When "Apply Correction" clicked
  Then updateChunkOffsets called
  And success toast shown
  And correction mode exited
  And panel updates
```

**Validation Commands**:
```bash
# Manual testing
npm run dev
# Click "Fix Position", select text, verify workflow
```

**Definition of Done**:
- [ ] correctionMode state implemented
- [ ] handleFixPosition navigates to chunk
- [ ] CorrectionModePanel component created
- [ ] CorrectionConfirmDialog component created
- [ ] Text selection triggers offset calculation
- [ ] Confirmation dialog shows preview
- [ ] Apply correction works end-to-end
- [ ] Exit correction mode on success/cancel

---

### Phase 7: Reader Integration

---

#### Task T-017: Add Correction Mode to Document Reader
**Priority**: High
**Estimated Effort**: 30 minutes
**Dependencies**: T-016

**Context & Background**:
Document reader must accept correction mode prop, show banner, enable text selection handler.

**Technical Requirements**:
- Accept correctionMode prop from navigation
- Show CorrectionModePanel when in correction mode
- Enable text selection handler
- Calculate offsets on selection end
- Pass to confirmation dialog

**Files to Modify/Create**:
```
├── src/app/read/[id]/page.tsx - [MODIFY: Add correction mode support]
├── src/components/reader/DocumentReader.tsx - [MODIFY: Add correction mode logic]
```

**Implementation Steps**:
1. Add correctionMode prop to DocumentReader
2. Show CorrectionModePanel when correctionMode = true
3. Add text selection handler (onMouseUp or onSelectionChange)
4. Calculate offsets using offset-calculator.ts
5. Store in state for confirmation dialog
6. Pass offsets to CorrectionConfirmDialog

**Code Pattern Reference**:
- Text selection: Browser Selection API
- Offset calculation: `src/lib/reader/offset-calculator.ts`

**Acceptance Criteria**:
```gherkin
Scenario 1: Correction mode activated
  Given navigation with correctionMode flag
  When DocumentReader renders
  Then CorrectionModePanel shown
  And text selection enabled

Scenario 2: Text selected
  Given correction mode active
  When user selects text
  Then offsets calculated
  And stored in state
  And confirmation dialog triggered

Scenario 3: Correction mode exited
  Given correction submitted
  When confirmation dialog closes
  Then CorrectionModePanel hidden
  And normal reader mode resumed
```

**Validation Commands**:
```bash
# Manual testing
npm run dev
# Navigate to document in correction mode
```

**Definition of Done**:
- [ ] correctionMode prop accepted
- [ ] CorrectionModePanel shown conditionally
- [ ] Text selection handler implemented
- [ ] Offset calculation works
- [ ] Offsets passed to confirmation dialog
- [ ] Exit correction mode functional

---

#### Task T-018: Implement Confirmation Dialog Logic
**Priority**: High
**Estimated Effort**: 30 minutes
**Dependencies**: T-011, T-017

**Context & Background**:
Show before/after preview, call updateChunkOffsets on confirm, handle overlap errors.

**Technical Requirements**:
- Display selected text preview
- Show before/after offsets
- Call updateChunkOffsets on confirm
- Handle overlap errors with detailed message
- Exit correction mode on success
- Show toast notifications

**Files to Modify/Create**:
```
├── src/components/reader/CorrectionConfirmDialog.tsx - [MODIFY: Add submission logic]
```

**Implementation Steps**:
1. Accept chunkId, oldOffsets, newOffsets, selectedText props
2. Display selected text in preview
3. Show before/after offset comparison
4. On "Apply Correction": call updateChunkOffsets
5. Handle success: toast, exit correction mode
6. Handle overlap error: show detailed toast with adjacent chunks
7. On cancel: exit correction mode without changes

**Code Pattern Reference**:
- Dialog submission: shadcn/ui Dialog patterns
- Server action call: Standard async/await pattern

**Acceptance Criteria**:
```gherkin
Scenario 1: Correction succeeds
  Given valid new offsets (no overlap)
  When "Apply Correction" clicked
  Then updateChunkOffsets called
  And success toast shown
  And correction mode exited
  And chunk validated in database

Scenario 2: Overlap error
  Given new offsets overlap with adjacent
  When "Apply Correction" clicked
  Then error toast shown with details
  And dialog remains open
  And user can adjust selection

Scenario 3: Cancel
  Given dialog open
  When "Cancel" clicked
  Then dialog closes
  And correction mode exited
  And no changes made
```

**Validation Commands**:
```bash
# Manual testing
npm run dev
# Test correction workflow with valid and invalid offsets
```

**Definition of Done**:
- [ ] Preview displays selected text
- [ ] Before/after offsets shown
- [ ] updateChunkOffsets called on confirm
- [ ] Success case handled
- [ ] Overlap error handled with detailed message
- [ ] Cancel button works
- [ ] Toast notifications shown

---

### Phase 8: Testing & Validation

---

#### Task T-019: Write Unit Tests for Overlap Detection
**Priority**: High
**Estimated Effort**: 20 minutes
**Dependencies**: T-011

**Context & Background**:
Comprehensive tests for overlap detection logic in updateChunkOffsets.

**Technical Requirements**:
- Test overlap with previous chunk (start/end cases)
- Test overlap with next chunk (start/end cases)
- Test complete containment of adjacent chunk
- Test valid corrections (no overlap)
- Test edge case: first/last chunk (no adjacent)

**Files to Modify/Create**:
```
├── src/app/actions/__tests__/chunks.test.ts - [NEW: Server action tests]
```

**Implementation Steps**:
1. Create test file with Supabase mock
2. Test overlap with previous chunk (3 scenarios)
3. Test overlap with next chunk (3 scenarios)
4. Test valid correction (no overlap)
5. Test edge case: no adjacent chunks
6. Test correction history appended correctly

**Code Pattern Reference**:
- Test patterns: `src/app/actions/__tests__/annotations.test.ts` (if exists)
- Mock Supabase: Standard Jest mocking patterns

**Acceptance Criteria**:
```gherkin
Scenario 1: All overlap scenarios covered
  Given 6 overlap test cases
  When tests run
  Then all return {success: false, error: 'overlap'}

Scenario 2: Valid corrections pass
  Given no overlap
  When updateChunkOffsets called
  Then returns {success: true}
  And chunk updated in database
```

**Validation Commands**:
```bash
# Run unit tests
npm test -- src/app/actions/chunks.test.ts
```

**Definition of Done**:
- [ ] Test file created
- [ ] All overlap scenarios tested
- [ ] Valid correction tested
- [ ] Edge cases tested
- [ ] Correction history tested
- [ ] All tests pass
- [ ] 100% coverage for overlap logic

---

#### Task T-020: Write Integration Tests for Warning Persistence
**Priority**: High
**Estimated Effort**: 25 minutes
**Dependencies**: T-006

**Context & Background**:
End-to-end test: process document, verify warnings persist to database.

**Technical Requirements**:
- Use fixture with known overlaps
- Process document through bulletproof matcher
- Verify warnings persisted to database
- Check validation_details structure

**Files to Modify/Create**:
```
├── worker/__tests__/integration/validation-warnings.test.ts - [NEW: Integration test]
```

**Implementation Steps**:
1. Create test file in worker integration tests
2. Load fixture PDF with overlaps (or create minimal test PDF)
3. Process document through pdf-processor
4. Query chunks from database
5. Assert warnings persisted correctly
6. Assert validation_details structure correct

**Code Pattern Reference**:
- Integration test pattern: `worker/__tests__/integration/*.test.ts`

**Acceptance Criteria**:
```gherkin
Scenario 1: Warnings persisted
  Given document processed in LOCAL mode
  When chunks queried from database
  Then validation_warning populated for overlap chunks
  And validation_details.type = 'overlap_corrected'
  And overlap_corrected = true

Scenario 2: Synthetic warnings persisted
  Given document with Layer 4 chunks
  When chunks queried
  Then validation_warning populated
  And validation_details.type = 'synthetic'
```

**Validation Commands**:
```bash
# Run integration tests
cd worker && npm run test:integration
```

**Definition of Done**:
- [ ] Integration test file created
- [ ] Document processing tested
- [ ] Warning persistence verified
- [ ] validation_details structure verified
- [ ] Tests pass consistently

---

---

## Implementation Recommendations

### Suggested Task Sequencing

**Critical Path (Must Complete in Order)**:
1. T-001 (Migration) → T-002 (Types) → Foundation complete
2. T-003 (Overlap warnings) → T-004 (Synthetic warnings) → T-005 (Stats) → Matcher complete
3. T-006 (Save metadata) → Processor complete
4. T-008 (Validate action) → T-009 (Overlap detection) → T-010 (History) → T-011 (Complete action) → Server actions complete
5. T-012 (Hook) → T-014 (Panel refactor) → T-015 (Validation button) → T-016 (Correction mode) → UI complete
6. T-017 (Reader integration) → T-018 (Confirmation dialog) → Reader complete

**Parallelizable Tasks**:
- After T-002: T-007 (Logging) can run parallel with T-003/T-004
- After T-012: T-013 (Stats hook) can run parallel with T-014
- After T-011: T-019 (Unit tests) can run parallel with T-012-T-018
- After T-006: T-020 (Integration tests) can start early

### Recommended Team Structure

**Solo Developer** (4-6 hours):
- Follow critical path sequentially
- Run tests after each phase
- Manual testing at end

**Two Developers** (3-4 hours):
- Developer 1: Database + Matcher + Processor (T-001 through T-007)
- Developer 2: Server Actions + Tests (T-008 through T-011, T-019, T-020)
- Then: Dev 1 → Hooks + UI (T-012 through T-016)
- Then: Dev 2 → Reader Integration (T-017, T-018)

### Parallelization Opportunities

**Phase 2 & 7**: Can run in parallel after Phase 1
- Phase 2 (Matcher) - Developer 1
- Phase 7 (Logging) - Developer 2

**Phase 5 & Testing**: Can overlap
- Phase 5 (Hooks) - Developer 1
- Phase 8 (Tests) - Developer 2 (start early with T-019)

**UI Components**: Can be built in parallel
- T-014 (Panel refactor) - Developer 1
- T-017 (Reader integration) - Developer 2

---

## Critical Path Analysis

### Tasks on Critical Path (Sequential Dependencies)
1. **T-001** (Migration) - 15 min - Must complete first
2. **T-002** (Types) - 15 min - Depends on T-001
3. **T-003** (Overlap warnings) - 25 min - Depends on T-002
4. **T-006** (Save metadata) - 20 min - Depends on T-003
5. **T-008** (Validate action) - 15 min - Depends on T-001, T-002
6. **T-009** (Overlap detection) - 25 min - Depends on T-008
7. **T-011** (Complete action) - 15 min - Depends on T-009, T-010
8. **T-012** (Hook) - 20 min - Depends on T-001, T-006
9. **T-014** (Panel refactor) - 30 min - Depends on T-012
10. **T-016** (Correction mode) - 45 min - Depends on T-014
11. **T-017** (Reader integration) - 30 min - Depends on T-016
12. **T-018** (Confirmation dialog) - 30 min - Depends on T-011, T-017

**Critical Path Duration**: 285 minutes (4.75 hours)

### Potential Bottlenecks

1. **T-016 (Correction Mode UI)** - 45 minutes
   - Most complex UI task
   - Multiple new components
   - Text selection handling
   - Risk: UX complexity
   - Mitigation: Break into smaller steps, use existing offset-calculator

2. **T-009 (Overlap Detection)** - 25 minutes
   - Complex logic with multiple edge cases
   - Risk: Missing overlap scenarios
   - Mitigation: Comprehensive unit tests (T-019)

3. **T-018 (Confirmation Dialog)** - 30 minutes
   - Integration point for correction workflow
   - Risk: Error handling complexity
   - Mitigation: Clear error messages, detailed logging

### Schedule Optimization Suggestions

**Optimize Phase 2 (Matcher)**:
- T-003, T-004, T-005 can be done in one session (55 min)
- Batch testing: test all matcher changes together

**Optimize Phase 4 (Server Actions)**:
- T-008, T-009, T-010, T-011 in one session (75 min)
- Test incrementally after each addition

**Optimize Phase 6 (UI)**:
- T-014 and T-015 in one session (45 min)
- T-016 separate session (45 min)

**Fast Track Option** (Aggressive Timeline):
1. Session 1: T-001 → T-006 (Database + Matcher + Processor) - 120 min
2. Session 2: T-008 → T-011 (Server Actions) - 75 min
3. Session 3: T-012 → T-015 (Hooks + Basic UI) - 65 min
4. Session 4: T-016 → T-018 (Correction Workflow) - 105 min
5. Session 5: T-019 → T-020 (Testing) - 45 min

**Total**: 410 minutes (6.8 hours) with breaks

---

## Risk Assessment

### High-Risk Areas

1. **Overlap Detection Logic (T-009)**
   - Risk: Missing edge cases (3+ chunks, non-sequential)
   - Impact: Invalid corrections allowed
   - Mitigation: Comprehensive unit tests, manual testing checklist

2. **Correction Mode UX (T-016)**
   - Risk: Confusing workflow, user errors
   - Impact: Poor user experience
   - Mitigation: Clear instructions, confirmation dialog, cancel option

3. **Migration Backward Compatibility (T-001)**
   - Risk: Breaking existing chunks
   - Impact: Data corruption
   - Mitigation: Additive migration only, all new columns nullable/defaulted

### Medium-Risk Areas

1. **Text Selection Offset Calculation (T-017)**
   - Risk: Incorrect offsets calculated
   - Impact: Invalid corrections
   - Mitigation: Use existing offset-calculator.ts (already tested)

2. **Correction History Growth (T-010)**
   - Risk: JSONB array unbounded growth
   - Impact: Performance degradation
   - Mitigation: Trim to last 50 entries

### Low-Risk Areas

1. **Simple Validation (T-008, T-015)**
   - Risk: Minimal (simple update operation)
   - Impact: Low
   - Mitigation: Standard server action pattern

2. **UI Display (T-014)**
   - Risk: Minimal (data display only)
   - Impact: Low
   - Mitigation: Use existing UI components

---

## Validation Checklist

### Pre-Implementation
- [ ] Migration 047 reviewed (backward compatible)
- [ ] MatchResult interface change reviewed (additive only)
- [ ] Server action patterns approved
- [ ] UI mockups approved

### Phase Completion Gates

**After Phase 1**:
- [ ] Migration applies cleanly: `npx supabase db reset`
- [ ] TypeScript compiles: `npm run type-check`
- [ ] All 5 columns exist with correct types

**After Phase 2**:
- [ ] Matcher unit tests pass: `cd worker && npm test -- bulletproof-matcher`
- [ ] Warnings attached to MatchResult objects
- [ ] Logging shows "Overlap corrections" and "Layer 4 (Synthetic)"

**After Phase 3**:
- [ ] Integration tests pass: `cd worker && npm run test:integration`
- [ ] Warnings persisted to database
- [ ] Query chunks with validation_warning populated

**After Phase 4**:
- [ ] Server action tests pass: `npm test -- src/app/actions/chunks.test.ts`
- [ ] Overlap detection catches all scenarios
- [ ] Correction history appends correctly

**After Phase 5**:
- [ ] Hook tests pass: `npm test -- src/hooks/use-unvalidated-chunks.test.ts`
- [ ] Hook returns categorized chunks
- [ ] ChunkStats includes overlap count

**After Phase 6**:
- [ ] UI renders without errors: `npm run dev`
- [ ] All unvalidated chunks visible
- [ ] Validation button works
- [ ] Correction mode enters successfully

**After Phase 7**:
- [ ] Reader supports correction mode
- [ ] Text selection calculates offsets
- [ ] Confirmation dialog shows correctly

**After Phase 8**:
- [ ] All unit tests pass: `npm test`
- [ ] All integration tests pass: `cd worker && npm run test:integration`
- [ ] Manual testing checklist complete

### Pre-Deployment
- [ ] Full test suite passes
- [ ] TypeScript compilation successful
- [ ] Migration tested on fresh database
- [ ] Manual testing checklist 100% complete
- [ ] No console errors or warnings
- [ ] Performance: Query <100ms for unvalidated chunks

---

## Manual Testing Checklist

### Database Layer
- [ ] Run migration 047, verify all columns exist
- [ ] Query chunks table, verify default values correct
- [ ] Check indexes created: `\d chunks` in psql

### Processing Pipeline
- [ ] Process PDF in LOCAL mode
- [ ] Check logs: "Overlap corrections: X/Y"
- [ ] Check logs: "Layer 4 (Synthetic): X/Y"
- [ ] Query chunks, verify validation_warning populated
- [ ] Verify validation_details structure correct

### UI - ChunkQualityPanel
- [ ] Open document with unvalidated chunks
- [ ] Verify panel shows "Chunks Needing Validation"
- [ ] Verify categories: Overlap-Corrected, Synthetic
- [ ] Expand chunk, verify warning details shown
- [ ] Click "Position OK", verify chunk disappears
- [ ] Verify toast notification shown

### UI - Correction Workflow
- [ ] Click "Fix Position", verify navigation to chunk
- [ ] Verify CorrectionModePanel shown
- [ ] Select text in reader
- [ ] Verify confirmation dialog appears
- [ ] Verify selected text preview shown
- [ ] Verify before/after offsets displayed
- [ ] Click "Apply Correction", verify success toast
- [ ] Verify chunk validated and panel updated

### Error Handling
- [ ] Try correction with overlapping offsets
- [ ] Verify error toast with detailed message
- [ ] Verify dialog remains open (not closed on error)
- [ ] Try correction on first chunk (no previous)
- [ ] Try correction on last chunk (no next)
- [ ] Cancel correction dialog, verify no changes

### Edge Cases
- [ ] Document with 0 unvalidated chunks
- [ ] Document with 100+ unvalidated chunks (performance)
- [ ] Chunk with 10+ corrections (history tracking)
- [ ] Concurrent corrections (open multiple tabs)

---

## Success Criteria Summary

### Quantitative Metrics
- [ ] **Warning Persistence**: 100% of warnings persisted to database
- [ ] **UI Accuracy**: All unvalidated chunks visible in ChunkQualityPanel
- [ ] **Correction Success Rate**: >95% of valid corrections succeed
- [ ] **Overlap Detection Accuracy**: 100% of overlaps caught
- [ ] **Performance**: Query unvalidated chunks in <100ms

### Qualitative Metrics
- [ ] **User Satisfaction**: Validation/correction workflow intuitive
- [ ] **Logging Clarity**: No confusion between synthetic vs overlap
- [ ] **Error Messages**: Clear, actionable error messages

### Completion Criteria
- [ ] All 18 tasks completed
- [ ] All automated tests pass
- [ ] Manual testing checklist 100% complete
- [ ] No TypeScript errors
- [ ] Migration applies cleanly
- [ ] Documentation updated (if needed)

---

## Rollback Plan

### If Database Issues (Phase 1)
```bash
# Rollback migration 047
git revert <migration_commit>
npx supabase db push
# No data loss (additive migration)
```

### If Matcher Issues (Phase 2)
```bash
# Revert bulletproof-matcher.ts
git revert <matcher_commit>
cd worker && npm run dev
# System continues working (warnings optional)
```

### If Server Action Issues (Phase 4)
```bash
# Disable correction feature
echo "ENABLE_CHUNK_CORRECTION=false" >> .env.local
npm run dev
# Keep validation working, disable correction
```

### If UI Issues (Phase 6)
```bash
# Revert ChunkQualityPanel
git revert <ui_commit>
npm run dev
# Use old synthetic-only validation
```

### Emergency Rollback (Complete Feature)
```bash
# Revert all changes
git revert <feature_branch_merge>
npx supabase db push
npm run dev
# System returns to pre-feature state
```

---

## Resources & References

### Key Implementation Files
- **Bulletproof Matcher**: `worker/lib/local/bulletproof-matcher.ts`
- **PDF Processor**: `worker/processors/pdf-processor.ts`
- **Offset Calculator**: `src/lib/reader/offset-calculator.ts`
- **Server Action Pattern**: `src/app/actions/annotations.ts`
- **Hook Pattern**: `src/hooks/use-chunk-stats.ts`

### Documentation
- **PRP Document**: `docs/prps/chunk-validation-correction-system.md`
- **Testing Rules**: `docs/testing/TESTING_RULES.md`
- **Bulletproof Matching**: `docs/processing-pipeline/bulletproof-metadata-extraction.md`
- **Project Overview**: `CLAUDE.md`

### External References
- **shadcn/ui Components**: https://ui.shadcn.com/
- **Radix UI Accordion**: https://www.radix-ui.com/docs/primitives/components/accordion
- **Supabase Client**: https://supabase.com/docs/reference/javascript
- **Zod Validation**: https://zod.dev/

---

## Glossary

- **Bulletproof Matching**: 5-layer chunk recovery system guaranteeing 100% chunk recovery
- **Overlap Correction**: Automatic adjustment when chunk offsets overlap during matching
- **Synthetic Chunk**: Chunk positioned via Layer 4 interpolation (approximate position)
- **Validation**: User confirms chunk position is correct (no changes needed)
- **Correction**: User adjusts chunk boundaries via text selection
- **ProcessedChunk**: Chunk object saved to database (includes metadata + offsets)
- **MatchResult**: Chunk matching result from bulletproof matcher (includes confidence + warnings)
- **Correction History**: Audit trail of all corrections with timestamps and reasons

---

**End of Task Breakdown Document**
