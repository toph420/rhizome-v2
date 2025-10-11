# Annotation Recovery & Sync System - Task Breakdown

**Feature**: Annotation Recovery & Sync System
**Timeline**: 50 hours (6.5 days)
**Complexity**: High
**Source PRP**: [docs/prps/annotation-recovery-and-sync.md](/Users/topher/Code/rhizome-v2/docs/prps/annotation-recovery-and-sync.md)
**Created**: 2025-10-04

---

## PRP Analysis Summary

### Feature Overview
The Annotation Recovery & Sync System implements a robust 4-tier fuzzy matching system that automatically recovers 90%+ of annotations after document edits. It integrates with Obsidian for bidirectional sync and provides a seamless review workflow for ambiguous matches.

### Key Technical Requirements
- **Performance**: 20 annotations recovered in <2 seconds
- **Accuracy**: >90% recovery rate with confidence scoring
- **Integration**: Extends existing fuzzy-matching.ts (718 lines)
- **UI Pattern**: RightPanel integration (no modals)
- **Safety**: Transaction-safe reprocessing with rollback

### Validation Requirements
- All critical tests must pass
- Performance benchmarks must meet targets
- Type safety enforced (no any[])
- Cross-document connections preserved

---

## Task Complexity Assessment

### Overall Complexity: **High**
- **Technical Debt**: Must extend existing 718-line fuzzy matching system
- **Integration Points**: 7+ components (ECS, RightPanel, Worker, Storage)
- **External Dependencies**: fastest-levenshtein library integration
- **Risk Factors**: Data loss potential, performance constraints, cross-document complexity

### Technical Challenges
1. **Chunk-bounded search optimization** (50-75x performance requirement)
2. **Transaction-safe rollback** with is_current flag
3. **Multi-chunk annotation support** via chunk_ids array
4. **Cross-document connection preservation**
5. **Obsidian protocol handling** with invisible iframe

---

## Sprint Organization

### Sprint 1 (Week 1): Foundation & Core Recovery
**Capacity**: 40 hours
**Focus**: Database setup, fuzzy matching enhancement, core recovery logic

- Phase 0: Prerequisites (9 hours)
- Phase 1: Schema Enhancement (3 hours)
- Phase 2: Fuzzy Matching Extensions (3 hours)
- Phase 3: Server-Side Enrichment (3 hours)
- Phase 4: Reprocessing Pipeline (5 hours)
- Integration Testing (5 hours)
- **Buffer**: 12 hours for complexity handling

### Sprint 2 (Week 2): Integration & UI
**Capacity**: 40 hours
**Focus**: Obsidian integration, Review UI, validation

- Phase 5: Obsidian Integration (4 hours)
- Phase 6: Review UI & Batch Operations (5 hours)
- Phase 7: Infrastructure & Cron (3 hours)
- Phase 8: Readwise Import (2 hours)
- Phase 9: Testing & Validation (8 hours)
- Phase 10: Documentation (4 hours)
- **Buffer**: 14 hours for refinement and edge cases

---

## Detailed Task Breakdown

### PHASE 0: Prerequisites & Pre-Flight (9 hours)

#### T-001: Database State Verification
**Priority**: Critical
**Effort**: 2 hours
**Dependencies**: None
**Blocked By**: Nothing

**Implementation Details**:
- Files to Check:
  - `supabase/migrations/` - Verify current migration number
  - Database schema - Check for markdown_path, obsidian_path columns
  - RPC functions - Verify match_chunks exists

**Acceptance Criteria**:
```gherkin
Given the database is in an unknown state
When I run verification checks
Then all required columns should exist
And RPC functions should be available
And storage structure should be valid
```

**Checklist**:
- [ ] markdown_path column exists or migration created
- [ ] obsidian_path column exists or migration created
- [ ] match_chunks RPC function exists
- [ ] Storage contains content.md files
- [ ] is_current column added to chunks table

#### T-002: Install Dependencies
**Priority**: Critical
**Effort**: 1 hour
**Dependencies**: T-001
**Blocked By**: None

**Implementation Details**:
```bash
cd worker && npm install fastest-levenshtein@1.0.16
cd worker && npm install node-cron@3.0.3
cd worker && npm install -D @types/node-cron@3.0.11
```

**Acceptance Criteria**:
```gherkin
Given the worker module needs new dependencies
When I install fastest-levenshtein and node-cron
Then imports should work correctly
And TypeScript types should resolve
And package.json should be updated
```

#### T-003: Create Type Definitions
**Priority**: Critical
**Effort**: 3 hours
**Dependencies**: T-002
**Blocked By**: None

**Implementation Details**:
- Create: `worker/types/recovery.ts`
- Define: Annotation, FuzzyMatchResult, RecoveryResults, Chunk, Connection interfaces
- Pattern: Follow existing `worker/types/index.ts` structure

**Acceptance Criteria**:
```gherkin
Given the recovery system needs type definitions
When I create recovery.ts with all interfaces
Then type checking should pass
And no any[] types should exist
And all fields should be properly typed
```

#### T-004: Update ECS Component Types
**Priority**: High
**Effort**: 1 hour
**Dependencies**: T-003
**Blocked By**: None

**Implementation Details**:
- Modify: `src/lib/ecs/components.ts`
- Add: textContext, originalChunkIndex to PositionComponent
- Add: chunkIds array to ChunkRefComponent

**Code Pattern Reference**:
```typescript
// src/lib/ecs/components.ts:91-124
export interface PositionComponent {
  // Existing fields preserved
  documentId: string
  startOffset: number
  endOffset: number

  // NEW fields for recovery
  textContext?: {
    before: string  // 100 chars before
    after: string   // 100 chars after
  }
  originalChunkIndex?: number
  recoveryConfidence?: number
  recoveryMethod?: 'exact' | 'context' | 'chunk_bounded' | 'lost'
  needsReview?: boolean
}
```

#### T-005: Processing Status Tracking
**Priority**: High
**Effort**: 2 hours
**Dependencies**: T-001
**Blocked By**: None

**Implementation Details**:
- Create: `supabase/migrations/030d_processing_status.sql`
- Add: processing_status, processing_error, processed_at columns
- Index: idx_documents_processing_status

---

### PHASE 1: Schema Enhancement (3 hours)

#### T-006: Fuzzy Matching Fields Migration
**Priority**: Critical
**Effort**: 1.5 hours
**Dependencies**: T-005
**Blocked By**: None

**Implementation Details**:
```sql
-- supabase/migrations/031_fuzzy_matching_fields.sql
ALTER TABLE components
ADD COLUMN text_context JSONB,
ADD COLUMN original_chunk_index INTEGER,
ADD COLUMN recovery_confidence FLOAT,
ADD COLUMN recovery_method TEXT,
ADD COLUMN needs_review BOOLEAN DEFAULT FALSE;

CREATE INDEX idx_components_chunk_index ON components(original_chunk_index);
CREATE INDEX idx_components_needs_review ON components(needs_review) WHERE needs_review = TRUE;
```

**Acceptance Criteria**:
```gherkin
Given the components table needs recovery fields
When I apply migration 031
Then all new columns should exist
And indexes should be created
And existing data should remain intact
```

#### T-007: Obsidian Settings Migration
**Priority**: High
**Effort**: 1.5 hours
**Dependencies**: T-006
**Blocked By**: None

**Implementation Details**:
- Create: `supabase/migrations/032_obsidian_settings.sql`
- Table: user_settings with obsidian_settings JSONB
- Structure: `{ vaultName, vaultPath, autoSync, syncAnnotations }`

---

### PHASE 2: Extend Fuzzy Matching Library (3 hours)

#### T-008: Enhance Fuzzy Matching with Levenshtein
**Priority**: Critical
**Effort**: 3 hours
**Dependencies**: T-002, T-003
**Blocked By**: None

**Implementation Details**:
- **CRITICAL**: Extend existing `worker/lib/fuzzy-matching.ts` (DO NOT create new file)
- Location: After line 718, add "// ANNOTATION RECOVERY FUNCTIONS" section
- Functions to add:
  - findAnnotationMatch() - Main 4-tier entry point
  - findWithLevenshteinContext() - Context-guided matching
  - findNearChunkLevenshtein() - Chunk-bounded search
  - findLevenshteinInSegment() - Sliding window matcher
  - findFuzzyContext() - Trigram fallback

**Code Pattern**:
```typescript
// worker/lib/fuzzy-matching.ts:719+
// ANNOTATION RECOVERY FUNCTIONS
import { distance } from 'fastest-levenshtein'

export async function findAnnotationMatch(
  needle: string,
  markdown: string,
  context?: { before: string; after: string },
  chunkIndex?: number,
  chunks?: Chunk[]
): Promise<FuzzyMatchResult> {
  // Tier 1: Exact match
  const exactIndex = markdown.indexOf(needle)
  if (exactIndex !== -1) {
    return {
      text: needle,
      startOffset: exactIndex,
      endOffset: exactIndex + needle.length,
      confidence: 1.0,
      method: 'exact'
    }
  }

  // Tier 2: Context-guided
  if (context) {
    const contextMatch = await findWithLevenshteinContext(needle, markdown, context)
    if (contextMatch && contextMatch.confidence > 0.85) {
      return contextMatch
    }
  }

  // Tier 3: Chunk-bounded
  if (chunkIndex !== undefined && chunks) {
    const chunkMatch = await findNearChunkLevenshtein(needle, markdown, chunkIndex, chunks)
    if (chunkMatch && chunkMatch.confidence > 0.75) {
      return chunkMatch
    }
  }

  // Tier 4: Trigram fallback
  return fuzzyMatchChunkToSource(needle, markdown) // Existing function
}
```

**Acceptance Criteria**:
```gherkin
Given an annotation needs recovery
When I call findAnnotationMatch with context
Then it should try 4 tiers in order
And return the best match with confidence
And performance should be <5ms per annotation
```

---

### PHASE 3: Server-Side Enrichment (3 hours)

#### T-009: Context Capture in Server Actions
**Priority**: Critical
**Effort**: 3 hours
**Dependencies**: T-004, T-008
**Blocked By**: None

**Implementation Details**:
- Modify: `src/app/actions/annotations.ts`
- Location: createAnnotation function
- Add: Server-side markdown fetching from Supabase Storage
- Add: Context extraction (±100 chars)
- Add: Chunk index determination
- Add: Multi-chunk overlap detection

**Code Pattern**:
```typescript
// src/app/actions/annotations.ts:38-97
export async function createAnnotation(input: AnnotationInput) {
  // 1. Fetch markdown from storage (server-side)
  const { data: document } = await supabase
    .from('documents')
    .select('markdown_path')
    .eq('id', input.documentId)
    .single()

  const { data: blob } = await supabase.storage
    .from('documents')
    .download(document.markdown_path)

  const markdown = await blob.text()

  // 2. Extract context
  const textContext = {
    before: markdown.slice(Math.max(0, input.startOffset - 100), input.startOffset),
    after: markdown.slice(input.endOffset, Math.min(markdown.length, input.endOffset + 100))
  }

  // 3. Find chunks and determine index
  const { data: chunks } = await supabase
    .from('chunks')
    .select('id, chunk_index, start_offset, end_offset')
    .eq('document_id', input.documentId)
    .order('chunk_index')

  const chunkIndex = chunks?.findIndex(
    c => c.start_offset <= input.startOffset && c.end_offset >= input.endOffset
  ) ?? -1

  // 4. Find overlapping chunks for multi-chunk support
  const overlappingChunks = chunks?.filter(
    c => c.end_offset > input.startOffset && c.start_offset < input.endOffset
  ) || []

  // 5. Create with enhanced data
  const entityId = await ops.create({
    ...input,
    textContext,
    originalChunkIndex: chunkIndex
  })

  // 6. Update chunk_ids array
  if (overlappingChunks.length > 1) {
    await supabase
      .from('components')
      .update({ chunk_ids: overlappingChunks.map(c => c.id) })
      .eq('entity_id', entityId)
      .eq('component_type', 'ChunkRef')
  }
}
```

---

### PHASE 4: Reprocessing Pipeline (5 hours)

#### T-010: Annotation Recovery Handler
**Priority**: Critical
**Effort**: 2 hours
**Dependencies**: T-008, T-009
**Blocked By**: None

**Implementation Details**:
- Create: `worker/handlers/recover-annotations.ts`
- Function: recoverAnnotations(documentId, newMarkdown, newChunks)
- Algorithm: Fetch annotations → Apply 4-tier matching → Classify by confidence

**Acceptance Criteria**:
```gherkin
Given a document has been edited and reprocessed
When I call recoverAnnotations
Then it should recover >90% of annotations
And classify them by confidence (success/needsReview/lost)
And update Position components accordingly
```

#### T-011: Connection Remapping Handler
**Priority**: High
**Effort**: 1.5 hours
**Dependencies**: T-010
**Blocked By**: None

**Implementation Details**:
- Create: `worker/handlers/remap-connections.ts`
- Function: remapConnections(verifiedConnections, newChunks, documentId)
- Critical: Handle cross-document connections properly

**Acceptance Criteria**:
```gherkin
Given verified connections exist for edited chunks
When I call remapConnections
Then it should preserve cross-document connections
And remap only the edited side
And maintain >85% remapping success rate
```

#### T-012: Main Reprocessing Orchestrator
**Priority**: Critical
**Effort**: 1.5 hours
**Dependencies**: T-010, T-011
**Blocked By**: None

**Implementation Details**:
- Create: `worker/handlers/reprocess-document.ts`
- Pattern: Transaction-safe with is_current flag
- Rollback: Restore old chunks if recovery fails

**Transaction Pattern**:
```typescript
// Transaction-safe reprocessing
try {
  // 1. Mark old chunks as is_current: false
  await supabase
    .from('chunks')
    .update({ is_current: false })
    .eq('document_id', documentId)
    .eq('is_current', true)

  // 2. Create new chunks with is_current: false
  const newChunks = await processMarkdown(markdown)
  await insertChunks(newChunks, { is_current: false })

  // 3. Recover annotations
  const recoveryResults = await recoverAnnotations(documentId, markdown, newChunks)

  if (recoveryResults.success.length / totalAnnotations < 0.5) {
    throw new Error('Recovery rate too low')
  }

  // 4. Commit: Set new chunks as current
  await supabase
    .from('chunks')
    .update({ is_current: true })
    .in('id', newChunks.map(c => c.id))

  // 5. Clean up old chunks
  await supabase
    .from('chunks')
    .delete()
    .eq('document_id', documentId)
    .eq('is_current', false)

} catch (error) {
  // Rollback: Restore old chunks
  await supabase
    .from('chunks')
    .update({ is_current: true })
    .eq('document_id', documentId)
    .eq('is_current', false)

  throw error
}
```

---

### PHASE 5: Obsidian Integration (4 hours)

#### T-013: Obsidian Sync Handlers
**Priority**: High
**Effort**: 3 hours
**Dependencies**: T-012
**Blocked By**: None

**Implementation Details**:
- Create: `worker/handlers/obsidian-sync.ts`
- Functions: exportToObsidian(), syncFromObsidian(), getObsidianUri()
- Pattern: Use encodeURIComponent for URI parameters

**Acceptance Criteria**:
```gherkin
Given a document needs Obsidian editing
When I export to vault and sync back
Then annotations should be recovered
And the document should be updated
And recovery stats should be reported
```

#### T-014: Document Header Component
**Priority**: Medium
**Effort**: 1 hour
**Dependencies**: T-013
**Blocked By**: None

**Implementation Details**:
- Create: `src/components/reader/DocumentHeader.tsx`
- Buttons: "Edit in Obsidian", "Sync from Obsidian"
- Critical: Use invisible iframe for protocol handling (NOT window.open)

**Protocol Handler Pattern**:
```typescript
// Critical: Use iframe for Obsidian URI
const handleEditInObsidian = async () => {
  const { uri } = await fetch('/api/obsidian/export', {
    method: 'POST',
    body: JSON.stringify({ documentId })
  }).then(r => r.json())

  // Create invisible iframe (DO NOT use window.open)
  const iframe = document.createElement('iframe')
  iframe.style.display = 'none'
  iframe.src = uri
  document.body.appendChild(iframe)
  setTimeout(() => iframe.remove(), 1000)
}
```

---

### PHASE 6: Review UI & Batch Operations (5 hours)

#### T-015: Batch API Routes
**Priority**: High
**Effort**: 2 hours
**Dependencies**: T-010
**Blocked By**: None

**Implementation Details**:
- Create: `/api/annotations/batch-accept/route.ts`
- Create: `/api/annotations/batch-discard/route.ts`
- Pattern: Use single upsert() not loop

**Acceptance Criteria**:
```gherkin
Given 50 annotations need review
When I click "Accept All"
Then all should be updated in <2 seconds
And needs_review should be false
And recovery_confidence should be preserved
```

#### T-016: Annotation Review Tab Component
**Priority**: High
**Effort**: 2 hours
**Dependencies**: T-015
**Blocked By**: None

**Implementation Details**:
- Create: `src/components/sidebar/AnnotationReviewTab.tsx`
- UI: Confidence badges, original vs suggested text
- Actions: Accept/Discard individual, batch operations

**UI Structure**:
```tsx
// Component structure
<div className="annotation-review">
  {/* Stats Summary */}
  <div className="grid grid-cols-3">
    <div>✅ Restored: {success.length}</div>
    <div>⚠️ Review: {needsReview.length}</div>
    <div>❌ Lost: {lost.length}</div>
  </div>

  {/* Review Queue */}
  <ScrollArea>
    {needsReview.map(item => (
      <ReviewItem
        key={item.annotation.id}
        annotation={item.annotation}
        suggestedMatch={item.suggestedMatch}
        onAccept={handleAccept}
        onDiscard={handleDiscard}
        onHighlight={onHighlightAnnotation}
      />
    ))}
  </ScrollArea>

  {/* Batch Actions */}
  <div className="flex gap-2">
    <Button onClick={handleAcceptAll}>Accept All</Button>
    <Button onClick={handleDiscardAll}>Discard All</Button>
  </div>
</div>
```

#### T-017: RightPanel Integration
**Priority**: High
**Effort**: 1 hour
**Dependencies**: T-016
**Blocked By**: None

**Implementation Details**:
- Modify: `src/components/sidebar/RightPanel.tsx`
- Add: 'review' tab type
- Add: reviewResults prop
- Pattern: Auto-switch to review tab when results present

---

### PHASE 7: Infrastructure & Cron (3 hours)

#### T-018: Periodic Annotation Export
**Priority**: Medium
**Effort**: 2 hours
**Dependencies**: T-010
**Blocked By**: None

**Implementation Details**:
- Create: `worker/jobs/export-annotations.ts`
- Schedule: Hourly using node-cron
- Format: Portable JSON (not raw DB structure)

**Portable Format**:
```typescript
// Transform to portable format
const portable = annotations.map(a => ({
  text: a.data.originalText,
  note: a.data.note,
  color: a.data.color,
  type: a.data.type,
  position: {
    start: a.data.startOffset,
    end: a.data.endOffset
  },
  pageLabel: a.data.pageLabel,
  created_at: a.created_at,
  recovery: a.recovery_method ? {
    method: a.recovery_method,
    confidence: a.recovery_confidence
  } : undefined
}))
```

#### T-019: Worker Integration
**Priority**: Medium
**Effort**: 1 hour
**Dependencies**: T-018
**Blocked By**: None

**Implementation Details**:
- Modify: `worker/index.ts`
- Import and start cron job
- Log startup confirmation

---

### PHASE 8: Readwise Import (2 hours)

#### T-020: Readwise Import Handler
**Priority**: Low
**Effort**: 2 hours
**Dependencies**: T-008
**Blocked By**: None

**Implementation Details**:
- Create: `worker/handlers/readwise-import.ts`
- Function: importReadwiseHighlights(documentId, readwiseJson)
- Pattern: Try exact match → chunk-bounded fuzzy → needsReview

---

### PHASE 9: Testing & Validation (8 hours)

#### T-021: Critical Tests
**Priority**: Critical
**Effort**: 3 hours
**Dependencies**: All implementation tasks
**Blocked By**: None

**Test Coverage**:
- Context capture in server action
- 4-tier fuzzy matching strategies
- Confidence threshold classification
- Multi-chunk annotation support
- Cross-document connection preservation

#### T-022: Integration Tests
**Priority**: High
**Effort**: 3 hours
**Dependencies**: T-021
**Blocked By**: None

**Test Coverage**:
- Full reprocessing workflow
- Transaction rollback on failure
- Annotation recovery pipeline
- Connection remapping with embeddings

#### T-023: Performance Benchmarks
**Priority**: High
**Effort**: 2 hours
**Dependencies**: T-022
**Blocked By**: None

**Benchmarks**:
- 20 annotations in <2 seconds
- Chunk-bounded vs full-text (50-75x speedup)
- Batch operations <2 seconds for 50 items

---

### PHASE 10: Documentation (4 hours)

#### T-024: Update Architecture Documentation
**Priority**: Medium
**Effort**: 2 hours
**Dependencies**: All tasks
**Blocked By**: None

**Updates Required**:
- docs/ARCHITECTURE.md - Add annotation recovery section
- docs/IMPLEMENTATION_STATUS.md - Mark features complete
- worker/README.md - Document new handlers

#### T-025: Performance Validation Report
**Priority**: Medium
**Effort**: 2 hours
**Dependencies**: T-023
**Blocked By**: None

**Validation Steps**:
- Run all benchmarks
- Verify performance targets met
- Document results in docs/PERFORMANCE.md

---

## Critical Path Analysis

### Critical Path Tasks (Must complete in sequence)
1. **T-001** → **T-002** → **T-003** → **T-008** → **T-010** → **T-012** → **T-021**
   - Database verification → Dependencies → Types → Fuzzy matching → Recovery → Orchestrator → Testing
   - **Total Critical Path**: ~19 hours

### Parallel Opportunities
- **Sprint 1 Parallel Tracks**:
  - Track A: T-003 (Types) + T-004 (ECS) + T-006 (Migration)
  - Track B: T-008 (Fuzzy Matching) → T-009 (Server Actions)

- **Sprint 2 Parallel Tracks**:
  - Track A: T-013 (Obsidian) + T-014 (Header)
  - Track B: T-015 (Batch) + T-016 (Review Tab) + T-017 (RightPanel)
  - Track C: T-018 (Export) + T-020 (Readwise)

### Potential Bottlenecks
1. **T-008**: Fuzzy matching enhancement (blocks 4 other tasks)
2. **T-012**: Reprocessing orchestrator (blocks all integration)
3. **T-021**: Critical tests (blocks deployment)

---

## Implementation Recommendations

### Team Structure (Single Developer)
- **Week 1 Focus**: Core recovery logic and database setup
- **Week 2 Focus**: UI integration and validation
- **Daily Capacity**: 8 hours with 2-hour buffer for complexity

### Task Sequencing
1. **Day 1**: Prerequisites (T-001 to T-005)
2. **Day 2**: Schema & Fuzzy Matching start (T-006, T-007, T-008)
3. **Day 3**: Complete Fuzzy Matching & Server Actions (T-008, T-009)
4. **Day 4**: Recovery Pipeline (T-010, T-011, T-012)
5. **Day 5**: Integration Testing & Buffer
6. **Day 6**: Obsidian Integration (T-013, T-014)
7. **Day 7**: Review UI (T-015, T-016, T-017)
8. **Day 8**: Infrastructure & Minor Features (T-018, T-019, T-020)
9. **Day 9**: Complete Testing Suite (T-021, T-022, T-023)
10. **Day 10**: Documentation & Final Validation (T-024, T-025)

### Resource Allocation
- **High-Risk Tasks** (allocate extra time):
  - T-008: Fuzzy matching enhancement (complex algorithm)
  - T-012: Transaction-safe reprocessing (data integrity)
  - T-021: Critical tests (must be comprehensive)

- **Quick Wins** (can be done in parallel):
  - T-004: ECS updates
  - T-007: Obsidian settings
  - T-019: Worker integration

### Risk Mitigation

#### High-Risk Items
1. **Levenshtein Performance**
   - Risk: May not meet <2 second target
   - Mitigation: Chunk-bounded search reduces search space 50-75x
   - Fallback: Increase chunk window size if needed

2. **Transaction Rollback**
   - Risk: Data corruption if rollback fails
   - Mitigation: is_current flag pattern tested in other systems
   - Fallback: Manual recovery from backups

3. **Cross-Document Connections**
   - Risk: May lose connections when both documents edited
   - Mitigation: Check both source and target document IDs
   - Fallback: Re-run 3-engine detection after recovery

#### Schedule Optimization
- **Front-load critical path**: Complete T-001 through T-012 first
- **Parallel UI work**: T-015, T-016 can be developed while testing T-012
- **Buffer time**: 26 hours buffer across both sprints for unknowns

---

## Quality Gates

### Sprint 1 Exit Criteria
- [ ] Database migrations applied successfully
- [ ] Fuzzy matching functions pass unit tests
- [ ] Recovery achieves >90% success rate in tests
- [ ] Transaction rollback tested and working
- [ ] No TypeScript errors

### Sprint 2 Exit Criteria
- [ ] Review UI functional with batch operations
- [ ] Obsidian sync roundtrip successful
- [ ] All critical tests passing
- [ ] Performance benchmarks met (<2 seconds)
- [ ] Documentation complete

### Definition of Done
- [ ] Code review completed
- [ ] All tests passing (critical, stable, integration)
- [ ] No linting errors
- [ ] TypeScript compilation successful
- [ ] Manual testing completed
- [ ] Documentation updated
- [ ] Performance targets met
- [ ] Deployment checklist verified

---

## Anti-Patterns & Gotchas

### Critical Warnings
- **DO NOT** create new fuzzy-matching.ts - EXTEND existing file
- **DO NOT** use modals - Use RightPanel tabs only
- **DO NOT** use window.open for Obsidian - Use invisible iframe
- **DO NOT** delete chunks before recovery succeeds
- **DO NOT** ignore null checks for Levenshtein functions
- **DO NOT** use relative imports in worker - Add .js extensions
- **DO NOT** skip multi-chunk support - Use chunk_ids array
- **DO NOT** use API routes for mutations - Server Actions only

### Performance Considerations
- Levenshtein degrades on strings >10k chars (use chunks)
- Batch operations should use single upsert, not loops
- Chunk-bounded search is 50-75x faster than full-text
- Cache embeddings when remapping multiple connections

---

## Success Metrics

### Quantitative Metrics
- Recovery Rate: >90% (success + needsReview)
- Performance: <2 seconds for 20 annotations
- Connection Preservation: >85% remapping success
- Batch Operations: <2 seconds for 50 items
- Test Coverage: >80% for critical paths

### Qualitative Metrics
- User can confidently edit documents
- Review UI is intuitive (1-click actions)
- Obsidian integration feels seamless
- No data loss for high-confidence matches
- System handles edge cases gracefully

---

## Notes

This task breakdown provides comprehensive implementation guidance for the Annotation Recovery & Sync System. The 50-hour estimate includes buffer time for complexity handling and edge cases. The phased approach allows for incremental delivery with validation checkpoints.

Key success factors:
1. **Pre-flight verification** prevents implementation blockers
2. **Transaction-safe pattern** ensures data integrity
3. **4-tier fuzzy matching** maximizes recovery rate
4. **RightPanel integration** maintains UI consistency
5. **Comprehensive testing** validates all requirements

The critical path of 19 hours leaves substantial buffer for handling unexpected complexity. Parallel tracks in both sprints optimize developer productivity.