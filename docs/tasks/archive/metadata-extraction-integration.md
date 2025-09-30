# Task Breakdown: Metadata Extraction Integration

**Generated**: 2025-09-30  
**Source PRP**: `docs/prps/metadata-extraction-integration.md`  
**Total Implementation Time**: 2 hours  
**Task Count**: 12 tasks  
**Risk Level**: Low  
**Complexity**: Moderate  

## PRP Analysis Summary

### Feature Name and Scope
**Metadata Extraction Integration** - Connect existing 7-engine metadata extraction infrastructure to the document processing pipeline to increase collision detection effectiveness from 20% to 95%.

### Key Technical Requirements
- Integrate `enrichChunksWithMetadata()` method into 6 document processors
- Update handler to map metadata fields to database JSONB columns
- Ensure type safety with optional metadata field in ProcessedChunk interface
- Maintain graceful degradation on extractor failures
- Meet performance target of <50% processing time increase

### Validation Requirements
- All processor tests must pass with metadata extraction enabled
- Integration tests must verify end-to-end metadata flow
- Performance tests must confirm <2 seconds additional processing per chunk
- Type checking must pass without errors
- Collision detection effectiveness must show measurable improvement

## Task Complexity Assessment

### Overall Complexity Rating
**Moderate** - Simple code changes across multiple integration points

### Integration Points
- 6 document processors (PDF, YouTube, Web, Markdown, Text, Paste)
- 1 handler (process-document.ts)
- 1 type definition update (processor.ts)
- Database schema already exists (migration 015)

### Technical Challenges
- Ensuring consistent integration pattern across all processors
- Verifying performance targets are met
- Testing graceful degradation scenarios
- Validating metadata completeness

## Phase Organization

### Phase 1: Processor Integration
**Objective**: Add metadata extraction to all 6 document processors  
**Duration**: 90 minutes  
**Deliverables**: 
- All processors calling `enrichChunksWithMetadata()`
- Individual processor tests passing
**Milestones**: Each processor successfully extracting metadata

### Phase 2: Handler & Database Integration  
**Objective**: Connect metadata flow to database storage  
**Duration**: 20 minutes  
**Deliverables**:
- Handler mapping metadata to JSONB columns
- Type definitions updated for metadata field
**Milestones**: Metadata successfully stored in database

### Phase 3: Validation & Performance Testing
**Objective**: Verify integration meets all requirements  
**Duration**: 10 minutes  
**Deliverables**:
- All tests passing
- Performance metrics validated
**Milestones**: System ready for production deployment

## Detailed Task Breakdown

---

## Task T-001: Update PDF Processor with Metadata Extraction

**Task ID**: T-001  
**Task Name**: Update PDF Processor with Metadata Extraction  
**Priority**: Critical  
**Estimated Time**: 15 minutes  

### Source PRP Document
**Reference**: `docs/prps/metadata-extraction-integration.md` - Lines 77-78

### Dependencies
- **Prerequisite Tasks**: None (can start immediately)
- **Parallel Tasks**: T-002, T-003, T-004, T-005, T-006
- **Integration Points**: Base processor class, metadata extractor
- **Blocked By**: None

### Implementation Details

#### Files to Modify
```
└── worker/processors/pdf-processor.ts - Add enrichChunksWithMetadata() call before return
```

#### Code Pattern to Follow
```typescript
// Add before the return statement around line 168-184
chunks = await this.enrichChunksWithMetadata(chunks);
```

### Acceptance Criteria

#### Given-When-Then Scenarios
```gherkin
Scenario 1: PDF processing includes metadata
  Given a PDF document is being processed
  When the processor completes chunk extraction
  Then each chunk contains metadata fields
  And metadata includes all 7 engine extractions

Scenario 2: Graceful degradation on metadata failure
  Given metadata extraction fails for a PDF
  When the processor continues
  Then chunks are still returned without metadata
  And processing completes successfully
```

#### Rule-Based Criteria
- [ ] `enrichChunksWithMetadata()` called before return
- [ ] Existing PDF processing logic unchanged
- [ ] Error handling preserves processing flow
- [ ] Tests pass for pdf-processor.test.ts

### Manual Testing Steps
1. **Setup**: Start local development server
2. **Test**: Upload a sample PDF document
3. **Verify**: Check database for metadata fields in chunks table
4. **Validate**: Confirm all 8 metadata JSONB columns populated

---

## Task T-002: Update YouTube Processor with Metadata Extraction

**Task ID**: T-002  
**Task Name**: Update YouTube Processor with Metadata Extraction  
**Priority**: Critical  
**Estimated Time**: 15 minutes  

### Source PRP Document
**Reference**: `docs/prps/metadata-extraction-integration.md` - Lines 81-82

### Dependencies
- **Prerequisite Tasks**: None (can start immediately)
- **Parallel Tasks**: T-001, T-003, T-004, T-005, T-006
- **Integration Points**: Base processor class, YouTube transcript handler
- **Blocked By**: None

### Implementation Details

#### Files to Modify
```
└── worker/processors/youtube-processor.ts - Add enrichChunksWithMetadata() around line 170
```

#### Code Pattern to Follow
```typescript
// Add before the return statement
chunks = await this.enrichChunksWithMetadata(chunks);
```

### Acceptance Criteria

#### Given-When-Then Scenarios
```gherkin
Scenario 1: YouTube transcript includes metadata
  Given a YouTube URL is being processed
  When transcript chunks are extracted
  Then metadata is extracted for each chunk
  And fuzzy positioning is preserved

Scenario 2: Metadata extraction with timestamps
  Given YouTube chunks have timestamp data
  When metadata extraction occurs
  Then temporal metadata reflects video timing
  And narrative flow is captured
```

#### Rule-Based Criteria
- [ ] Metadata extraction integrated with transcript processing
- [ ] Fuzzy positioning annotations preserved
- [ ] Timestamp metadata properly captured
- [ ] YouTube-specific tests pass

### Manual Testing Steps
1. **Setup**: Prepare test YouTube URL
2. **Test**: Process YouTube video through pipeline
3. **Verify**: Check temporal_metadata reflects video timeline
4. **Validate**: Confirm narrative metadata captures video flow

---

## Task T-003: Update Web Processor with Metadata Extraction

**Task ID**: T-003  
**Task Name**: Update Web Processor with Metadata Extraction  
**Priority**: Critical  
**Estimated Time**: 15 minutes  

### Source PRP Document
**Reference**: `docs/prps/metadata-extraction-integration.md` - Lines 83-84

### Dependencies
- **Prerequisite Tasks**: None (can start immediately)
- **Parallel Tasks**: T-001, T-002, T-004, T-005, T-006
- **Integration Points**: Base processor class, web content extraction
- **Blocked By**: None

### Implementation Details

#### Files to Modify
```
└── worker/processors/web-processor.ts - Add enrichChunksWithMetadata() around line 160
```

### Acceptance Criteria

#### Given-When-Then Scenarios
```gherkin
Scenario 1: Web content metadata extraction
  Given a web URL is processed
  When content is chunked
  Then metadata includes domain context
  And reference metadata captures links

Scenario 2: Blog post processing
  Given a blog article URL
  When processed with metadata
  Then structural metadata reflects HTML hierarchy
  And conceptual metadata identifies key themes
```

#### Rule-Based Criteria
- [ ] Web-specific metadata patterns captured
- [ ] Link references preserved in metadata
- [ ] HTML structure reflected in structural_metadata
- [ ] Web processor tests pass

### Manual Testing Steps
1. **Test**: Process various web content types (blog, news, documentation)
2. **Verify**: Domain metadata reflects website context
3. **Validate**: Reference metadata includes external links

---

## Task T-004: Update Markdown Processor with Metadata Extraction

**Task ID**: T-004  
**Task Name**: Update Markdown Processor with Metadata Extraction  
**Priority**: Critical  
**Estimated Time**: 15 minutes  

### Source PRP Document
**Reference**: `docs/prps/metadata-extraction-integration.md` - Lines 85-86

### Dependencies
- **Prerequisite Tasks**: None (can start immediately)
- **Parallel Tasks**: T-001, T-002, T-003, T-005, T-006
- **Integration Points**: Base processor class, markdown parsing
- **Blocked By**: None

### Implementation Details

#### Files to Modify
```
└── worker/processors/markdown-processor.ts - Add enrichChunksWithMetadata() around line 150
```

#### Special Considerations
- Handle both 'as-is' and 'clean' processing modes
- Preserve markdown structure in metadata

### Acceptance Criteria

#### Given-When-Then Scenarios
```gherkin
Scenario 1: Markdown as-is mode
  Given markdown processed in as-is mode
  When metadata extraction occurs
  Then original formatting preserved
  And structural metadata reflects heading hierarchy

Scenario 2: Markdown clean mode
  Given markdown processed in clean mode
  When metadata extraction occurs
  Then cleaned content has metadata
  And AI-enhanced summaries included
```

#### Rule-Based Criteria
- [ ] Both processing modes handle metadata
- [ ] Heading structure captured in metadata
- [ ] Code blocks reflected in method_metadata
- [ ] Markdown processor tests pass

### Manual Testing Steps
1. **Test**: Process complex markdown with headers, lists, code blocks
2. **Verify**: Structural metadata reflects document outline
3. **Validate**: Both as-is and clean modes work correctly

---

## Task T-005: Update Text Processor with Metadata Extraction

**Task ID**: T-005  
**Task Name**: Update Text Processor with Metadata Extraction  
**Priority**: High  
**Estimated Time**: 15 minutes  

### Source PRP Document
**Reference**: `docs/prps/metadata-extraction-integration.md` - Lines 87-88

### Dependencies
- **Prerequisite Tasks**: None (can start immediately)
- **Parallel Tasks**: T-001, T-002, T-003, T-004, T-006
- **Integration Points**: Base processor class, text parsing
- **Blocked By**: None

### Implementation Details

#### Files to Modify
```
└── worker/processors/text-processor.ts - Add enrichChunksWithMetadata() around line 140
```

### Acceptance Criteria

#### Given-When-Then Scenarios
```gherkin
Scenario 1: Plain text metadata extraction
  Given plain text content is processed
  When chunks are created
  Then metadata extraction occurs
  And emotional tone is captured

Scenario 2: Structured text patterns
  Given text with list or outline structure
  When processed with metadata
  Then structural patterns detected
  And conceptual groupings identified
```

#### Rule-Based Criteria
- [ ] Simple text gets meaningful metadata
- [ ] Pattern detection works on plain text
- [ ] Emotional metadata extracted from content
- [ ] Text processor tests pass

### Manual Testing Steps
1. **Test**: Process various text formats (notes, lists, prose)
2. **Verify**: Metadata quality for unstructured content
3. **Validate**: Emotional and conceptual metadata present

---

## Task T-006: Update Paste Processor with Metadata Extraction

**Task ID**: T-006  
**Task Name**: Update Paste Processor with Metadata Extraction  
**Priority**: High  
**Estimated Time**: 15 minutes  

### Source PRP Document
**Reference**: `docs/prps/metadata-extraction-integration.md` - Lines 89-90

### Dependencies
- **Prerequisite Tasks**: None (can start immediately)
- **Parallel Tasks**: T-001, T-002, T-003, T-004, T-005
- **Integration Points**: Base processor class, paste handling
- **Blocked By**: None

### Implementation Details

#### Files to Modify
```
└── worker/processors/paste-processor.ts - Add enrichChunksWithMetadata() around line 130
```

### Acceptance Criteria

#### Given-When-Then Scenarios
```gherkin
Scenario 1: Direct paste content processing
  Given content is pasted directly
  When processed into chunks
  Then metadata extraction completes
  And quality metadata indicates paste source

Scenario 2: Code snippet paste
  Given code is pasted
  When metadata extraction runs
  Then method_metadata identifies programming patterns
  And domain metadata captures language context
```

#### Rule-Based Criteria
- [ ] Paste content receives full metadata
- [ ] Quick paste workflow not slowed
- [ ] Metadata quality comparable to other sources
- [ ] Paste processor tests pass

### Manual Testing Steps
1. **Test**: Paste various content types (text, code, formatted)
2. **Verify**: Metadata extraction completes quickly
3. **Validate**: Quality metadata reflects paste context

---

## Task T-007: Update Handler Database Mapping

**Task ID**: T-007  
**Task Name**: Update Handler Database Mapping  
**Priority**: Critical  
**Estimated Time**: 15 minutes  

### Source PRP Document
**Reference**: `docs/prps/metadata-extraction-integration.md` - Lines 91-114

### Dependencies
- **Prerequisite Tasks**: T-001 through T-006 (at least one processor updated)
- **Parallel Tasks**: T-008
- **Integration Points**: Database schema, chunk insertion logic
- **Blocked By**: None

### Implementation Details

#### Files to Modify
```
└── worker/handlers/process-document.ts - Update chunk mapping around lines 125-129
```

#### Code Pattern to Follow
```typescript
const chunkInserts = chunks.map(chunk => ({
  // ... existing fields ...
  
  // Add metadata mapping
  structural_metadata: chunk.metadata?.structural || null,
  emotional_metadata: chunk.metadata?.emotional || null,
  conceptual_metadata: chunk.metadata?.conceptual || null,
  method_metadata: chunk.metadata?.method || null,
  narrative_metadata: chunk.metadata?.narrative || null,
  reference_metadata: chunk.metadata?.reference || null,
  domain_metadata: chunk.metadata?.domain || null,
  quality_metadata: chunk.metadata?.quality || null,
  metadata_extracted_at: chunk.metadata ? new Date().toISOString() : null
}));
```

### Acceptance Criteria

#### Given-When-Then Scenarios
```gherkin
Scenario 1: Metadata saved to database
  Given chunks with metadata are processed
  When handler inserts into database
  Then all 8 JSONB columns are populated
  And metadata_extracted_at timestamp is set

Scenario 2: Null metadata handling
  Given chunks without metadata (fallback case)
  When handler processes insertion
  Then null values are properly set
  And insertion completes without error
```

#### Rule-Based Criteria
- [ ] All 8 metadata JSONB columns mapped correctly
- [ ] Null handling for missing metadata
- [ ] Timestamp tracking for metadata extraction
- [ ] Database insertion tests pass

### Manual Testing Steps
1. **Setup**: Clear chunks table for clean test
2. **Test**: Process document through full pipeline
3. **Query**: `SELECT * FROM chunks WHERE document_id = ?`
4. **Verify**: All metadata columns contain JSONB data
5. **Validate**: metadata_extracted_at timestamp present

---

## Task T-008: Update Type Definitions for Metadata

**Task ID**: T-008  
**Task Name**: Update Type Definitions for Metadata  
**Priority**: Critical  
**Estimated Time**: 5 minutes  

### Source PRP Document
**Reference**: `docs/prps/metadata-extraction-integration.md` - Lines 119-129

### Dependencies
- **Prerequisite Tasks**: None
- **Parallel Tasks**: T-007
- **Integration Points**: TypeScript type system
- **Blocked By**: None

### Implementation Details

#### Files to Modify
```
└── worker/types/processor.ts - Add optional metadata field to ProcessedChunk interface
```

#### Code Pattern to Follow
```typescript
export interface ProcessedChunk {
  content: string;
  summary: string;
  themes: string[];
  importance: number;
  wordCount: number;
  index: number;
  metadata?: ChunkMetadata | PartialChunkMetadata; // Add this field
}
```

### Acceptance Criteria

#### Given-When-Then Scenarios
```gherkin
Scenario 1: Type safety maintained
  Given ProcessedChunk interface updated
  When TypeScript compilation runs
  Then no type errors occur
  And metadata field is optional

Scenario 2: Backward compatibility
  Given existing code without metadata
  When type checking occurs
  Then no breaking changes
  And optional field allows gradual adoption
```

#### Rule-Based Criteria
- [ ] TypeScript compilation successful
- [ ] Optional metadata field added
- [ ] Import statements for metadata types included
- [ ] No breaking changes to existing code

### Manual Testing Steps
1. **Run**: `npx tsc --noEmit` in worker directory
2. **Verify**: No type errors reported
3. **Check**: IDE autocomplete shows metadata field

---

## Task T-009: Run Integration Test Suite

**Task ID**: T-009  
**Task Name**: Run Integration Test Suite  
**Priority**: High  
**Estimated Time**: 5 minutes  

### Source PRP Document
**Reference**: `docs/prps/metadata-extraction-integration.md` - Lines 149-162

### Dependencies
- **Prerequisite Tasks**: T-001 through T-008
- **Parallel Tasks**: T-010
- **Integration Points**: All processors and handler
- **Blocked By**: All implementation tasks

### Implementation Details

#### Test Commands to Execute
```bash
# Run all tests
cd worker && npm test

# Run metadata-specific tests
npm test -- metadata-extractor.test.ts

# Run processor integration tests
npm test -- integration/

# Direct metadata testing
npx tsx tests/integration/test-metadata-direct.ts
```

### Acceptance Criteria

#### Given-When-Then Scenarios
```gherkin
Scenario 1: All tests pass
  Given metadata integration is complete
  When test suite runs
  Then all existing tests pass
  And new metadata tests pass

Scenario 2: Coverage maintained
  Given test coverage baseline
  When coverage report generated
  Then coverage remains above 85%
  And critical paths have 100% coverage
```

#### Rule-Based Criteria
- [ ] All processor tests pass
- [ ] Metadata extractor tests pass
- [ ] Integration tests successful
- [ ] No regression in existing functionality

### Manual Testing Steps
1. **Execute**: Run full test suite
2. **Review**: Check test output for failures
3. **Coverage**: Generate coverage report
4. **Document**: Note any failing tests for follow-up

---

## Task T-010: Performance Validation

**Task ID**: T-010  
**Task Name**: Performance Validation  
**Priority**: High  
**Estimated Time**: 5 minutes  

### Source PRP Document
**Reference**: `docs/prps/metadata-extraction-integration.md` - Lines 138-144

### Dependencies
- **Prerequisite Tasks**: T-001 through T-008
- **Parallel Tasks**: T-009
- **Integration Points**: Performance monitoring system
- **Blocked By**: All implementation tasks

### Implementation Details

#### Performance Metrics to Validate
- Individual extractor timeout: 200-500ms
- Total metadata extraction: <2000ms
- Processing time increase: <50%
- Parallel execution of all 7 extractors

### Acceptance Criteria

#### Given-When-Then Scenarios
```gherkin
Scenario 1: Performance targets met
  Given a document is processed
  When timing metrics are collected
  Then metadata extraction takes <2 seconds
  And total processing increase is <50%

Scenario 2: Timeout handling
  Given an extractor exceeds timeout
  When processing continues
  Then partial metadata is returned
  And overall processing completes
```

#### Rule-Based Criteria
- [ ] Processing time increase <50%
- [ ] Metadata extraction <2 seconds per chunk
- [ ] Parallel extractor execution verified
- [ ] Cache hit rate >70% on repeated chunks

### Manual Testing Steps
1. **Baseline**: Record processing time without metadata
2. **Test**: Process same document with metadata
3. **Compare**: Calculate percentage increase
4. **Monitor**: Check performance logs for bottlenecks

---

## Task T-011: Type Safety and Linting Validation

**Task ID**: T-011  
**Task Name**: Type Safety and Linting Validation  
**Priority**: Medium  
**Estimated Time**: 5 minutes  

### Source PRP Document
**Reference**: `docs/prps/metadata-extraction-integration.md` - Lines 165-175

### Dependencies
- **Prerequisite Tasks**: T-001 through T-008
- **Parallel Tasks**: T-012
- **Integration Points**: TypeScript compiler, ESLint
- **Blocked By**: All implementation tasks

### Implementation Details

#### Validation Commands
```bash
# Type checking
npx tsc --noEmit

# Linting
npm run lint

# Build verification
npm run build
```

### Acceptance Criteria

#### Given-When-Then Scenarios
```gherkin
Scenario 1: Type safety verified
  Given all code changes complete
  When TypeScript compilation runs
  Then no type errors occur
  And build completes successfully

Scenario 2: Code quality maintained
  Given linting rules configured
  When ESLint runs
  Then no linting errors
  And code style consistent
```

#### Rule-Based Criteria
- [ ] TypeScript compilation successful
- [ ] ESLint passes without errors
- [ ] Build process completes
- [ ] No new warnings introduced

### Manual Testing Steps
1. **Run**: Type checking command
2. **Review**: Address any type errors
3. **Lint**: Run linting checks
4. **Build**: Verify production build works

---

## Task T-012: Collision Detection Effectiveness Validation

**Task ID**: T-012  
**Task Name**: Collision Detection Effectiveness Validation  
**Priority**: High  
**Estimated Time**: 10 minutes  

### Source PRP Document
**Reference**: `docs/prps/metadata-extraction-integration.md` - Lines 244-256

### Dependencies
- **Prerequisite Tasks**: T-001 through T-010
- **Parallel Tasks**: T-011
- **Integration Points**: 7-engine collision detection system
- **Blocked By**: All processor and handler tasks

### Implementation Details

#### Validation Approach
1. Process test documents with known relationships
2. Run collision detection with metadata
3. Measure connection quality improvement
4. Verify 95% effectiveness target

### Acceptance Criteria

#### Given-When-Then Scenarios
```gherkin
Scenario 1: Effectiveness improvement
  Given documents with known connections
  When collision detection runs with metadata
  Then connection discovery rate >90%
  And non-obvious relationships identified

Scenario 2: Quality validation
  Given detected connections
  When quality scores calculated
  Then relevance ratings improve significantly
  And false positives remain <10%
```

#### Rule-Based Criteria
- [ ] Collision detection rate increased from 20% to >90%
- [ ] Connection quality scores improved
- [ ] Non-obvious relationships discovered
- [ ] Metadata completeness >90%

### Manual Testing Steps
1. **Prepare**: Select test documents with known connections
2. **Baseline**: Run collision detection without metadata
3. **Test**: Run with metadata extraction enabled
4. **Compare**: Measure improvement in detection rate
5. **Validate**: Review quality of discovered connections
6. **Document**: Record effectiveness metrics

---

## Implementation Recommendations

### Suggested Team Structure
- **Developer 1**: Focus on Phase 1 (Processors) - Tasks T-001 through T-006 can be done in parallel
- **Developer 2**: Handle Phase 2 (Handler/Types) - Tasks T-007 and T-008
- **Both**: Collaborate on Phase 3 (Validation) - Tasks T-009 through T-012

### Optimal Task Sequencing
1. **Parallel Start**: T-001 through T-006 (all processors can be updated simultaneously)
2. **Sequential**: T-007 and T-008 (handler and types)
3. **Parallel Testing**: T-009 and T-010 (integration and performance)
4. **Final Validation**: T-011 and T-012 (quality gates)

### Parallelization Opportunities
- **Maximum Parallelization**: 6 developers could each take one processor (T-001 to T-006)
- **Practical Parallelization**: 2 developers splitting processors (3 each)
- **Testing Parallelization**: Integration and performance tests can run simultaneously

### Resource Allocation Suggestions
- **Senior Developer**: T-007 (handler mapping) - most critical integration point
- **Mid-Level Developers**: T-001 through T-006 (processor updates) - straightforward pattern
- **QA Engineer**: T-009 through T-012 (validation tasks) - testing expertise

## Critical Path Analysis

### Tasks on Critical Path
1. **T-007** - Handler Database Mapping (blocks all validation)
2. **T-008** - Type Definitions (blocks TypeScript compilation)
3. **T-012** - Collision Detection Validation (final success metric)

### Potential Bottlenecks
- **Handler Mapping**: If incorrectly implemented, all processor work is ineffective
- **Type Safety**: TypeScript errors will block build and deployment
- **Performance**: If targets not met, may need optimization iterations

### Schedule Optimization Suggestions
1. **Start Early**: Begin T-008 (types) immediately - no dependencies
2. **Parallel Processing**: Assign all 6 processors to different developers
3. **Continuous Testing**: Run tests after each processor completion
4. **Fast Feedback**: Deploy to staging after Phase 1 for early validation

## Risk Mitigation Strategies

### Low Risk Factors
- All infrastructure already exists and is tested
- Changes are additive, not breaking
- Graceful degradation prevents failures
- Each task is independently testable

### Mitigation Actions
1. **Test One Processor First**: Complete T-001 fully before others
2. **Monitor Performance**: Check metrics after each processor
3. **Incremental Deployment**: Deploy processors one at a time if needed
4. **Rollback Plan**: Feature flag for enabling/disabling metadata

## Quality Gates

### Phase 1 Exit Criteria
- [ ] All 6 processors updated with metadata extraction
- [ ] Individual processor tests pass
- [ ] No performance regression detected

### Phase 2 Exit Criteria
- [ ] Handler correctly maps all metadata fields
- [ ] Type definitions compile without errors
- [ ] Database successfully stores metadata

### Phase 3 Exit Criteria
- [ ] All integration tests pass
- [ ] Performance targets met (<50% increase)
- [ ] Collision detection effectiveness >90%
- [ ] Production build successful

## Notes

### Implementation Tips
1. Use `git diff` to verify each processor change is consistent
2. Test with diverse content types for comprehensive validation
3. Monitor database storage usage with JSONB columns
4. Consider feature flag for gradual rollout

### Common Pitfalls to Avoid
1. Don't forget to await the async `enrichChunksWithMetadata()` call
2. Ensure null handling in handler for backward compatibility
3. Remember to import metadata types in processor.ts
4. Test with documents that previously had no metadata

### Success Indicators
- Processing continues working for all document types
- Metadata fields populated in database
- Collision detection shows dramatic improvement
- No increase in error rates or failures

---

**Document Generated**: 2025-09-30  
**Estimated Total Implementation Time**: 2 hours  
**Recommended Team Size**: 1-2 developers  
**Next Steps**: Begin with T-001 (PDF Processor) as proof of concept