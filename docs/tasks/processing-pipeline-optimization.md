# Processing Pipeline Optimization - Task Breakdown

**Status**: Planning  
**PRP Reference**: `docs/prps/processing-pipeline-optimization.md`  
**Timeline**: 2-3 weeks (3 phases)  
**Complexity**: Moderate-to-Complex  

## Executive Summary

This task breakdown decomposes the Processing Pipeline Optimization feature into 14 manageable development tasks across 3 phases. The implementation enables processing of 500+ page documents through intelligent batching, standardizes on AI-only metadata extraction ($0.20/doc), and consolidates from a 7-engine to 3-engine collision detection system.

**Key Architecture Decision**: Tasks T-001 through T-008 completed. **Task T-009 introduces major simplification** - removing dual metadata systems in favor of AI-only approach for consistency and semantic understanding.

## Phase Organization

### Phase 1: Cleanup & Preparation ✅ COMPLETE
**Objective**: Remove legacy engine references and prepare codebase for batched processing
**Duration**: 3-4 days
**Deliverables**:
- ✅ Cleaned engine types and configurations
- ✅ Updated weight management system
- ✅ Validated 3-engine system consistency

**Milestones**:
- ✅ All legacy 4-engine references removed (5 engines → 3 engines)
- ✅ Test suite passing with 3-engine system
- ✅ Configuration presets updated

### Phase 2: Batched Processing & AI Metadata ⚠️ IN PROGRESS
**Objective**: Implement batched processing and standardize on AI-only metadata
**Duration**: 6-8 days (extended for simplification)
**Deliverables**:
- ✅ Batched PDF extraction with overlap stitching
- ✅ AI-powered metadata extraction system
- ✅ Integration with existing progress tracking
- 🔄 **NEW**: Remove regex metadata system, AI-only standardization
- 🔄 **NEW**: Update all 6 processors to use AI metadata

**Milestones**:
- ✅ 500+ page PDF successfully processed
- ✅ AI metadata extraction implemented
- 🔄 Regex metadata system archived
- 🔄 All processors using batchChunkAndExtractMetadata

### Phase 3: Validation & Quality Assurance ⚠️ IN PROGRESS
**Objective**: Validate AI metadata quality, connection discovery, and production readiness
**Duration**: 4-5 days
**Deliverables**:
- ✅ Large document test suite (Task T-010 complete)
- 🔄 Performance benchmarks for batched processing (T-011)
- 🔄 AI metadata quality validation (emotional polarity, concept extraction) (T-012)
- 🔄 Connection discovery quality tests (3-engine system with AI metadata) (T-013)
- 🔄 Production deployment documentation (T-014)

**Milestones**:
- ✅ 500-page document processing validated (<10 min)
- ✅ AI metadata schema completeness verified
- ✅ Batch boundary conditions tested (99, 100, 101 pages)
- ✅ Stitching accuracy >95% validated
- 🔄 $0.20/doc cost consistent across all document sizes
- 🔄 <2 min/hour processing maintained
- 🔄 >70% precision for contradiction detection
- 🔄 >60% precision for thematic bridge discovery

## Detailed Task Breakdown

---

## Task T-001: Remove Legacy Engine Type Definitions

**Priority**: Critical  
**Estimated Effort**: 2-3 hours  
**Phase**: 1 - Cleanup & Preparation  

### Context & Background

**Source PRP Document**: `docs/prps/processing-pipeline-optimization.md` - Lines 73-102

**Task Purpose**:  
**As a** system maintainer  
**I need** to remove deprecated engine type definitions  
**So that** the codebase only references the active 3-engine system

### Dependencies
- **Prerequisite Tasks**: None (can start immediately)
- **Parallel Tasks**: T-002, T-003
- **Blocked By**: None

### Technical Requirements

**Files to Modify**:
```
├── worker/engines/types.ts - Remove 5 deprecated engine types
├── worker/handlers/detect-connections.ts - Update engine imports
└── worker/engines/orchestrator.ts - Remove deprecated engine references
```

### Implementation Steps
1. Remove deprecated EngineType enum values from types.ts
2. Update DEFAULT_WEIGHTS to only include 3 engines
3. Search and remove all references to deprecated engines
4. Update type exports and interfaces

### Code Patterns to Follow
- **Existing Pattern**: `worker/engines/types.ts:10-30` - Current enum structure
- **Weight Config**: `worker/lib/weight-config.ts:44-89` - Configuration pattern

### Acceptance Criteria

```gherkin
Scenario: Legacy engine types removed
  Given the types.ts file contains 7 engine definitions
  When I remove the 5 deprecated engine types
  Then only SEMANTIC_SIMILARITY, CONTRADICTION_DETECTION, and THEMATIC_BRIDGE remain
  And the DEFAULT_WEIGHTS object only contains 3 engine weights

Scenario: No orphaned references
  Given legacy engines have been removed
  When I search the codebase for deprecated engine names
  Then no references to TEMPORAL_PROXIMITY, CONCEPTUAL_DENSITY, EMOTIONAL_RESONANCE, CITATION_NETWORK, or STRUCTURAL_PATTERN exist
```

### Validation
```bash
# Verify cleanup
grep -r "TEMPORAL_PROXIMITY\|CONCEPTUAL_DENSITY\|EMOTIONAL_RESONANCE\|CITATION_NETWORK\|STRUCTURAL_PATTERN" worker/

# Build verification
cd worker && npm run build

# Type checking
cd worker && npm run typecheck
```

---

## Task T-002: Update Weight Configuration System

**Priority**: Critical  
**Estimated Effort**: 3-4 hours  
**Phase**: 1 - Cleanup & Preparation

### Context & Background

**Source PRP Document**: `docs/prps/processing-pipeline-optimization.md` - Lines 104-118

**Task Purpose**:  
**As a** system administrator  
**I need** to update the weight configuration for 3-engine system  
**So that** user preferences and presets work correctly with the simplified engine set

### Dependencies
- **Prerequisite Tasks**: None (can parallel with T-001)
- **Parallel Tasks**: T-001, T-003
- **Integration Points**: User preferences system, orchestrator

### Technical Requirements

**Files to Modify**:
```
├── worker/lib/weight-config.ts - Update preset configurations
├── worker/lib/user-preferences.ts - Clean user preference handling
└── worker/tests/weight-config.test.ts - Update test cases
```

### Implementation Steps
1. Update PRESET_CONFIGS to use 3-engine weights
2. Adjust normalization logic for 3 engines
3. Update validation functions for weight ranges
4. Migrate existing user preferences

### Code Patterns to Follow
- **Weight Management**: `worker/lib/weight-config.ts:90-140` - Weight calculation patterns
- **Preference Loading**: `worker/lib/user-preferences.ts:25-45` - User preference patterns

### Acceptance Criteria

```gherkin
Scenario: Preset configurations updated
  Given the weight configuration system
  When I load any preset (balanced, academic, narrative, analytical)
  Then each preset contains exactly 3 engine weights
  And the weights sum to 1.0 after normalization

Scenario: User preference migration
  Given existing user preferences with 7-engine weights
  When the system loads user preferences
  Then old engine weights are ignored
  And the 3 active engine weights are normalized to sum to 1.0
```

### Validation
```bash
# Run weight configuration tests
cd worker && npm test -- weight-config.test.ts

# Validate preset loading
cd worker && npm run test:integration -- --testNamePattern="weight presets"
```

---

## Task T-003: Clean Up Engine References

**Priority**: High  
**Estimated Effort**: 2-3 hours  
**Phase**: 1 - Cleanup & Preparation

### Context & Background

**Source PRP Document**: `docs/prps/processing-pipeline-optimization.md` - Lines 49-52

**Task Purpose**:  
**As a** developer  
**I need** to remove all code references to deprecated engines  
**So that** the codebase is clean and maintainable

### Dependencies
- **Prerequisite Tasks**: T-001 (type definitions must be updated first)
- **Parallel Tasks**: T-002
- **Blocked By**: T-001

### Technical Requirements

**Files to Delete/Clean**:
```
├── worker/engines/citation-network.ts - DELETE
├── worker/engines/conceptual-density.ts - DELETE  
├── worker/engines/emotional-resonance.ts - DELETE
├── worker/engines/structural-pattern.ts - DELETE
├── worker/engines/temporal-proximity.ts - DELETE
├── worker/tests/engines/*.test.ts - DELETE corresponding test files
└── worker/engines/orchestrator.ts - Remove imports and usage
```

### Implementation Steps
1. Delete deprecated engine implementation files
2. Delete corresponding test files
3. Update orchestrator to remove engine imports
4. Update engine index exports
5. Clean up any utility functions specific to deprecated engines

### Acceptance Criteria

```gherkin
Scenario: Engine files removed
  Given the worker/engines directory
  When cleanup is complete
  Then only semantic-similarity.ts, contradiction-detection.ts, and thematic-bridge.ts remain
  And orchestrator.ts only imports these 3 engines

Scenario: Tests updated
  Given the test suite
  When I run all worker tests
  Then no tests reference deprecated engines
  And all tests pass
```

### Validation
```bash
# Verify file removal
ls -la worker/engines/

# Run full test suite
cd worker && npm test

# Check for orphaned imports
cd worker && npm run lint
```

---

## Task T-004: Validate 3-Engine System

**Priority**: High  
**Estimated Effort**: 2-3 hours  
**Phase**: 1 - Cleanup & Preparation

### Context & Background

**Source PRP Document**: `docs/prps/processing-pipeline-optimization.md` - Lines 119-128

**Task Purpose**:  
**As a** QA engineer  
**I need** to validate the 3-engine system works correctly  
**So that** we can proceed with batched processing implementation

### Dependencies
- **Prerequisite Tasks**: T-001, T-002, T-003
- **Parallel Tasks**: None
- **Integration Points**: All engine consumers

### Technical Requirements

### Implementation Steps
1. Run comprehensive test suite
2. Validate engine orchestration with 3 engines
3. Test weight normalization edge cases
4. Verify backward compatibility for API consumers

### Acceptance Criteria

```gherkin
Scenario: Engine orchestration works
  Given the 3-engine configuration
  When I process a document through collision detection
  Then all 3 engines execute successfully
  And scores are properly normalized
  And connections are ranked correctly

Scenario: Performance maintained
  Given the simplified 3-engine system
  When processing benchmark documents
  Then processing time remains <500ms for 100 chunks
  And memory usage is reduced compared to 7-engine baseline
```

### Validation
```bash
# Run stability tests
cd worker && npm run test:stable

# Run integration tests
cd worker && npm run test:integration

# Run benchmarks
cd worker && npm run benchmark:semantic-engine
```

---

## Task T-005: Implement Batched PDF Extraction Core

**Priority**: Critical  
**Estimated Effort**: 8-10 hours  
**Phase**: 2 - Batched Processing Implementation

### Context & Background

**Source PRP Document**: `docs/prps/processing-pipeline-optimization.md` - Lines 131-207

**Task Purpose**:  
**As a** document processor  
**I need** to extract large PDFs in batches  
**So that** we can process 500+ page documents without hitting token limits

### Dependencies
- **Prerequisite Tasks**: T-004 (3-engine validation complete)
- **Parallel Tasks**: T-006 (can develop AI metadata extraction in parallel)
- **Integration Points**: Gemini Files API, progress tracking

### Technical Requirements

**Files to Modify/Create**:
```
├── worker/processors/pdf-processor.ts - Add batched extraction logic
├── worker/lib/pdf-batch-utils.ts - NEW: Batch utilities
└── worker/tests/processors/pdf-processor.test.ts - Add batch tests
```

### Implementation Steps
1. Create ExtractionBatch interface
2. Implement extractLargePDF function with 100-page batches
3. Add 10-page overlap handling
4. Implement progress tracking per batch
5. Add page counting utility function

### Code Patterns to Follow
- **Processor Pattern**: `worker/processors/base.ts:51-145` - Base processor structure
- **Progress Tracking**: `worker/processors/base.ts:80-95` - Progress update pattern
- **Error Handling**: `worker/lib/batch-operations.ts:213-229` - Error recovery pattern

### Acceptance Criteria

```gherkin
Scenario: Large PDF extraction
  Given a 500-page PDF document
  When I process it through extractLargePDF
  Then it creates 5 batches of ~100 pages each
  And each batch has 10-page overlap with the next
  And progress is updated after each batch

Scenario: Batch extraction error handling
  Given a batch extraction fails
  When the error occurs
  Then the error is logged
  And processing continues with the next batch
  And partial results are preserved
```

### Manual Testing Steps
1. Upload a 500+ page PDF to test environment
2. Monitor batch processing in logs
3. Verify all pages are extracted
4. Check overlap handling between batches

### Validation
```bash
# Run PDF processor tests
cd worker && npm test -- pdf-processor.test.ts

# Test with large document
cd worker && npm run test:integration -- --testNamePattern="large document"
```

---

## Task T-006: Implement Overlap Stitching Algorithm

**Priority**: Critical  
**Estimated Effort**: 6-8 hours  
**Phase**: 2 - Batched Processing Implementation

### Context & Background

**Source PRP Document**: `docs/prps/processing-pipeline-optimization.md` - Lines 186-225

**Task Purpose**:  
**As a** content processor  
**I need** to stitch overlapping markdown batches  
**So that** we get a single coherent document without duplicates

### Dependencies
- **Prerequisite Tasks**: T-005 (needs batch structure)
- **Parallel Tasks**: None
- **Integration Points**: PDF batch extraction

### Technical Requirements

**Files to Modify**:
```
├── worker/processors/pdf-processor.ts - Add stitching functions
├── worker/lib/fuzzy-matching.ts - Enhance fuzzy matching utilities
└── worker/tests/lib/fuzzy-matching.test.ts - Add stitching tests
```

### Implementation Steps
1. Implement stitchMarkdownBatches function
2. Create findBestOverlap with fuzzy matching
3. Add text normalization utilities
4. Handle edge cases (no overlap found)
5. Add separator insertion for non-matching sections

### Code Patterns to Follow
- **Fuzzy Matching**: `worker/lib/ai-chunking.ts:39-86` - Existing fuzzy match pattern
- **Text Normalization**: `worker/lib/youtube-cleaning.ts:15-30` - Text cleaning patterns

### Acceptance Criteria

```gherkin
Scenario: Successful overlap stitching
  Given two markdown batches with overlapping content
  When stitching them together
  Then the overlapping portion appears only once
  And content order is preserved
  And no content is lost

Scenario: No overlap handling
  Given two batches with no overlapping content
  When stitching them together
  Then both are joined with a separator
  And a warning is logged
  And processing continues
```

### Validation
```bash
# Run fuzzy matching tests
cd worker && npm test -- fuzzy-matching.test.ts

# Test stitching accuracy
cd worker && npm run validate:stitching-accuracy
```

---

## Task T-007: Create AI-Powered Metadata Extraction

**Priority**: Critical  
**Estimated Effort**: 10-12 hours  
**Phase**: 2 - Batched Processing Implementation

### Context & Background

**Source PRP Document**: `docs/prps/processing-pipeline-optimization.md` - Lines 246-358

**Task Purpose**:  
**As a** metadata extractor  
**I need** AI-powered batch metadata extraction  
**So that** we get rich metadata without regex limitations

### Dependencies
- **Prerequisite Tasks**: T-004 (system validated)
- **Parallel Tasks**: T-005 (can develop in parallel)
- **Integration Points**: Gemini API, chunk creation

### Technical Requirements

**Files to Create**:
```
├── worker/lib/ai-chunking-batch.ts - NEW: AI metadata extraction
├── worker/tests/lib/ai-chunking-batch.test.ts - NEW: Tests
└── worker/types/ai-metadata.ts - NEW: Type definitions
```

### Implementation Steps
1. Create batchChunkAndExtractMetadata function
2. Implement 100K character batching logic
3. Create AI prompt for metadata extraction
4. Add JSON response parsing
5. Implement fallback for failed batches
6. Add progress tracking integration

### Code Patterns to Follow
- **AI Integration**: `worker/engines/thematic-bridge.ts:94-98` - Gemini integration pattern
- **Metadata Structure**: `worker/lib/metadata-extractor.ts:156-167` - Metadata patterns
- **Batch Operations**: `worker/lib/batch-operations.ts:100-150` - Batching patterns

### Acceptance Criteria

```gherkin
Scenario: AI metadata extraction
  Given a 200K character markdown document
  When processing through AI metadata extraction
  Then it creates 2 batches of ~100K characters each
  And each batch returns structured metadata
  And metadata includes themes, concepts, importance scores

Scenario: Metadata extraction failure recovery
  Given a batch fails AI processing
  When the error occurs
  Then the batch is split into smaller chunks
  And each chunk is processed individually
  And minimal metadata is created for complete failures
```

### Manual Testing Steps
1. Process document with AI metadata extraction
2. Verify metadata quality in database
3. Compare with regex-based extraction
4. Check error recovery with invalid content

### Validation
```bash
# Run AI chunking tests
cd worker && npm test -- ai-chunking-batch.test.ts

# Validate metadata quality
cd worker && npm run validate:metadata:real

# Test with various content types
cd worker && npm run test:all-sources
```

---

## Task T-008: Integrate Batched Processing with PDF Processor

**Priority**: High  
**Estimated Effort**: 4-6 hours  
**Phase**: 2 - Batched Processing Implementation

### Context & Background

**Source PRP Document**: `docs/prps/processing-pipeline-optimization.md` - Lines 411-433

**Task Purpose**:  
**As a** system integrator  
**I need** to connect batched extraction with the PDF processor  
**So that** large documents automatically use batched processing

### Dependencies
- **Prerequisite Tasks**: T-005, T-006, T-007
- **Parallel Tasks**: T-009
- **Integration Points**: PDF processor, progress tracking

### Technical Requirements

**Files to Modify**:
```
├── worker/processors/pdf-processor.ts - Integration logic
├── worker/processors/base.ts - Update progress handling
└── worker/tests/integration/pdf-batch.test.ts - Integration tests
```

### Implementation Steps
1. Add document size detection logic
2. Implement conditional routing (batch vs standard)
3. Integrate AI metadata extraction
4. Update progress tracking for batched flow
5. Add logging for process selection

### Code Patterns to Follow
- **Processor Flow**: `worker/processors/pdf-processor.ts:51-145` - Current process method
- **Conditional Logic**: `worker/processors/router.ts:30-50` - Routing patterns

### Acceptance Criteria

```gherkin
Scenario: Automatic batch routing
  Given a PDF document
  When it has >200 pages OR >50K chars markdown
  Then batched extraction is used
  And AI metadata extraction is used
  Otherwise standard processing is used

Scenario: Progress tracking integration
  Given batched processing is active
  When processing a large document
  Then progress updates show batch numbers
  And overall progress is accurately calculated
```

### Validation
```bash
# Run integration tests
cd worker && npm run test:integration -- pdf-batch

# Test routing logic
cd worker && npm test -- pdf-processor.test.ts
```

---

## Task T-009: Simplify to AI-Only Metadata System

**Priority**: Critical
**Estimated Effort**: 4-6 hours
**Phase**: 2 - Batched Processing Implementation

### Context & Background

**Current Problem**: The system has two metadata extraction approaches:
1. **AI metadata** (`batchChunkAndExtractMetadata`) - semantic understanding, $0.20/doc
2. **Regex metadata** (`enrichChunksWithMetadata`) - pattern matching, $0/doc

This creates:
- Schema inconsistencies across documents
- Complex conditional routing logic
- Engines that must handle two metadata formats
- Confusion about which system to use when

**Task Purpose**:
**As a** system architect
**I need** to standardize on AI-only metadata extraction
**So that** we have consistent schemas, simpler code, and semantic understanding for ThematicBridge

### Dependencies
- **Prerequisite Tasks**: T-008 (integration complete)
- **Blocked Tasks**: None (simplification)
- **Integration Points**: All processors, collision detection engines

### Technical Requirements

**Files to Modify**:
```
├── worker/processors/pdf-processor.ts - Remove conditional routing
├── worker/processors/youtube-processor.ts - Switch to AI metadata
├── worker/processors/web-processor.ts - Switch to AI metadata
├── worker/processors/markdown-processor.ts - Switch to AI metadata
├── worker/processors/text-processor.ts - Switch to AI metadata
├── worker/processors/paste-processor.ts - Switch to AI metadata
└── worker/processors/base.ts - Remove enrichChunksWithMetadata method
```

**Files to Deprecate** (move to `.archive/`):
```
├── worker/lib/metadata-extractor.ts - Legacy regex system
├── worker/lib/extractors/*.ts - All regex extractors
└── worker/tests matching above - Corresponding tests
```

**Files to Update**:
```
├── worker/types/ai-metadata.ts - Enhance to include emotional polarity
├── worker/engines/contradiction-detection.ts - Use AI metadata schema
└── worker/engines/thematic-bridge.ts - Already uses AI metadata
```

### Implementation Steps

1. **Enhance AI metadata schema** to support all 3 engines:
   ```typescript
   export interface AIChunkMetadata {
     themes: string[]
     concepts: Array<{ text: string; importance: number }>
     importance: number
     summary?: string
     domain?: string
     emotional: {
       polarity: number        // -1 to +1 for ContradictionDetection
       primaryEmotion: string  // joy/fear/anger/neutral/etc
       intensity: number       // 0 to 1
     }
   }
   ```

2. **Simplify PDF processor** - remove conditional routing:
   ```typescript
   async process(): Promise<ProcessResult> {
     // Extract markdown (batched if >10MB)
     const markdown = await this.extractMarkdown()

     // ALWAYS use AI metadata (no conditionals)
     const chunks = await batchChunkAndExtractMetadata(markdown)

     return { markdown, chunks }
   }
   ```

3. **Update all other processors** to use `batchChunkAndExtractMetadata`:
   - YouTube, Web, Markdown, Text, Paste processors
   - Remove all calls to `enrichChunksWithMetadata()`

4. **Update collision detection engines**:
   - ContradictionDetection: Use `chunk.metadata.emotional.polarity`
   - ThematicBridge: Already uses AI metadata structure
   - SemanticSimilarity: Metadata-agnostic (no changes)

5. **Archive legacy regex system**:
   - Move `worker/lib/metadata-extractor.ts` → `.archive/`
   - Move `worker/lib/extractors/` → `.archive/`
   - Keep as reference but remove from builds

6. **Remove base processor method**:
   - Delete `enrichChunksWithMetadata()` from `base.ts`
   - Delete `extractChunkMetadata()` helper

### Code Patterns to Follow
- **AI Integration**: `worker/lib/ai-chunking-batch.ts:54-130` - Main extraction function
- **Progress Tracking**: `worker/processors/pdf-processor.ts:413-424` - Progress callback pattern
- **Error Handling**: `worker/lib/ai-chunking-batch.ts:220-275` - Retry with fallback

### Acceptance Criteria

```gherkin
Scenario: All processors use AI metadata
  Given any document processor (PDF, YouTube, Web, etc.)
  When processing a document
  Then batchChunkAndExtractMetadata is called
  And enrichChunksWithMetadata is NOT called
  And regex extractors are NOT imported

Scenario: Enhanced AI metadata schema
  Given AI metadata extraction
  When metadata is returned
  Then it includes emotional.polarity for ContradictionDetection
  And it includes concepts with importance scores for ThematicBridge
  And it includes domain classification

Scenario: Simplified processor code
  Given PDF processor
  When reviewing the code
  Then there is no conditional "should we use AI?" logic
  Then there is no conditional "large vs small document" routing for metadata
  And the process() method is <150 lines (down from 545)

Scenario: Engines consume AI metadata
  Given ContradictionDetection engine
  When analyzing chunks
  Then it reads chunk.metadata.emotional.polarity
  And does not expect regex metadata schema
```

### Validation
```bash
# Verify no imports of legacy extractors
cd worker && grep -r "from.*metadata-extractor" processors/ lib/
# Should return: no results

# Run all processor tests
cd worker && npm test -- processors/

# Run engine tests with new metadata
cd worker && npm test -- engines/contradiction-detection.test.ts
cd worker && npm test -- engines/thematic-bridge.test.ts

# Build verification
cd worker && npm run build
```

### Migration Notes

**Breaking Changes:**
- Old chunks with regex metadata will need re-processing
- Or: Add migration script to transform old metadata → AI metadata schema
- Decision: For personal tool, just re-process (simpler)

**Cost Impact:**
- Before: $0 for small docs, $0.20 for large docs (inconsistent)
- After: $0.20 for all docs (consistent, predictable)
- Benefit: Semantic understanding enables ThematicBridge cross-domain connections

---

## Task T-010: Create Large Document Test Suite

**Priority**: High
**Estimated Effort**: 4-5 hours
**Phase**: 3 - Validation & Optimization

### Context & Background

**Source PRP Document**: `docs/prps/processing-pipeline-optimization.md` - Lines 439-452

**Task Purpose**:
**As a** QA engineer
**I need** comprehensive tests for large documents
**So that** we can validate 500+ page processing with AI metadata

### Dependencies
- **Prerequisite Tasks**: T-009 (AI-only metadata system complete)
- **Parallel Tasks**: T-011, T-012
- **Integration Points**: All batched processing components, AI metadata extraction

### Technical Requirements

**Files to Create**:
```
├── worker/tests/integration/large-document.test.ts - NEW: Test suite
├── worker/tests/fixtures/large-sample.pdf - Test document
└── worker/benchmarks/large-document-benchmark.ts - NEW: Benchmark
```

### Implementation Steps
1. Create test suite for 500+ page documents
2. Add fixtures for various document sizes
3. Test batch boundary conditions
4. Verify stitching accuracy
5. Validate AI metadata schema completeness (emotional, concepts, themes, importance)
6. Test metadata consistency across all document sizes

### Acceptance Criteria

```gherkin
Scenario: Large document processing with AI metadata
  Given a 500-page test document
  When processed through the pipeline
  Then all pages are extracted
  And content is properly stitched
  And AI metadata includes emotional.polarity, concepts, themes, importance
  And all chunks have consistent metadata schema
  And processing completes in <10 minutes

Scenario: Edge case handling
  Given documents with 99, 100, 101, 199, 200, 201 pages
  When processed
  Then all use AI metadata extraction (no size-based routing)
  And no content is lost
  And metadata schema is identical across all sizes

Scenario: Metadata schema validation
  Given processed chunks from any document size
  When inspecting chunk metadata
  Then it matches AIChunkMetadata interface
  And includes emotional.polarity for ContradictionDetection
  And includes concepts array with importance scores for ThematicBridge
```

### Validation
```bash
# Run large document tests
cd worker && npm run test:large-documents

# Run with real documents
cd worker && npm run test:integration -- --testNamePattern="large document"
```

---

## Task T-011: Performance Benchmarking

**Priority**: High  
**Estimated Effort**: 3-4 hours  
**Phase**: 3 - Validation & Optimization

### Context & Background

**Source PRP Document**: `docs/prps/processing-pipeline-optimization.md` - Lines 566-571

**Task Purpose**:  
**As a** performance engineer  
**I need** to benchmark the optimized pipeline  
**So that** we meet performance targets

### Dependencies
- **Prerequisite Tasks**: T-010
- **Parallel Tasks**: T-010, T-012
- **Integration Points**: All processing components

### Technical Requirements

**Files to Create/Modify**:
```
├── worker/benchmarks/batch-processing.ts - NEW: Batch benchmarks
├── worker/benchmarks/pdf-benchmark.ts - Update for batching
└── worker/benchmarks/reports/ - Benchmark results
```

### Implementation Steps
1. Create batch processing benchmarks
2. Measure memory usage patterns
3. Track processing time per page
4. Compare with baseline performance
5. Generate performance reports

### Acceptance Criteria

```gherkin
Scenario: Performance targets met
  Given the optimized pipeline
  When processing benchmark documents
  Then processing time is <2 min per hour of content
  And memory usage peaks at <500MB
  And batch processing shows 40% improvement

Scenario: Performance regression detection
  Given performance benchmarks
  When comparing with baseline
  Then any regression >10% is flagged
  And detailed metrics are available
```

### Validation
```bash
# Run all benchmarks
cd worker && npm run benchmark:all

# Generate performance report
cd worker && npm run benchmark:report

# Compare with baseline
cd worker && npm run benchmark:compare
```

---

## Task T-012: AI Metadata Quality Validation

**Priority**: High
**Estimated Effort**: 4-5 hours
**Phase**: 3 - Validation & Optimization

### Context & Background

**Source PRP Document**: `docs/prps/processing-pipeline-optimization.md` - Lines 481-482

**Task Purpose**:
**As a** quality engineer
**I need** to validate AI metadata quality and consistency
**So that** the 3-engine collision detection system works reliably

### Dependencies
- **Prerequisite Tasks**: T-009 (AI-only metadata complete)
- **Parallel Tasks**: T-010, T-011
- **Integration Points**: AI metadata extraction, collision detection engines

### Technical Requirements

**Files to Create**:
```
├── worker/tests/validation/ai-metadata-quality.test.ts - NEW: Quality tests
├── worker/benchmarks/metadata-quality-benchmark.ts - NEW: Quality metrics
└── worker/tests/fixtures/metadata-samples/ - Sample outputs
```

### Implementation Steps
1. Create validation suite for AI metadata quality
2. Test emotional polarity accuracy for ContradictionDetection
3. Validate concept extraction and importance scores for ThematicBridge
4. Verify metadata consistency across document types (PDF, YouTube, Web, etc.)
5. Measure extraction accuracy vs manual labeling
6. Generate quality metrics report

### Code Patterns to Follow
- **Validation Pattern**: `worker/tests/validation/validation-set.test.ts` - Existing validation approach
- **Quality Metrics**: `worker/lib/ai-chunking-batch.ts:265-275` - Fallback metadata structure

### Acceptance Criteria

```gherkin
Scenario: Emotional polarity accuracy
  Given sample chunks with known sentiment
  When AI metadata is extracted
  Then emotional.polarity matches expected values within ±0.2
  And primaryEmotion classification is >80% accurate

Scenario: Concept extraction quality
  Given a technical document
  When AI metadata is extracted
  Then key concepts are identified with >85% precision
  And concept importance scores correlate with manual ratings (>0.7 correlation)
  And domain classification is accurate

Scenario: Metadata consistency across sources
  Given documents from PDF, YouTube, Web, Markdown, Text, Paste
  When each is processed
  Then all chunks have identical metadata schema
  And emotional.polarity is present for all chunks
  And concepts array is present with importance scores
  And no chunks have legacy regex metadata schema

Scenario: ThematicBridge integration
  Given processed chunks with AI metadata
  When ThematicBridge engine analyzes them
  Then it successfully reads concepts and importance scores
  And cross-domain connections are detected
  And no schema errors occur
```

### Validation
```bash
# Run AI metadata quality tests
cd worker && npm test -- ai-metadata-quality.test.ts

# Generate quality report
cd worker && npm run benchmark:metadata-quality

# Validate engine integration
cd worker && npm test -- engines/contradiction-detection.test.ts
cd worker && npm test -- engines/thematic-bridge.test.ts

# Test cross-source consistency
cd worker && npm run test:all-sources
```

---

## Task T-013: Connection Discovery Quality Validation

**Priority**: High
**Estimated Effort**: 4-5 hours
**Phase**: 3 - Validation & Optimization

### Context & Background

**Source PRP Document**: `docs/prps/processing-pipeline-optimization.md` - Lines 560-564

**Task Purpose**:
**As a** quality engineer
**I need** to validate end-to-end connection discovery quality
**So that** the 3-engine system finds meaningful cross-document connections

### Dependencies
- **Prerequisite Tasks**: T-012 (AI metadata quality validated)
- **Parallel Tasks**: None
- **Integration Points**: 3-engine orchestrator, AI metadata, collision detection

### Technical Requirements

**Files to Create**:
```
├── worker/tests/validation/connection-quality.test.ts - NEW: E2E connection tests
├── worker/tests/fixtures/connection-corpus/ - Known connection pairs
└── worker/benchmarks/connection-discovery-benchmark.ts - Connection metrics
```

### Implementation Steps
1. Create test corpus with known connections (contradictions, thematic bridges, semantic similarities)
2. Validate ContradictionDetection finds concept+polarity oppositions
3. Validate ThematicBridge finds cross-domain concept mappings
4. Validate SemanticSimilarity baseline performance
5. Test orchestrator score aggregation with 3-engine weights
6. Measure precision/recall for connection discovery

### Acceptance Criteria

```gherkin
Scenario: Contradiction detection accuracy
  Given chunks with known contradictions (e.g., "paranoia" positive vs negative)
  When ContradictionDetection engine analyzes them
  Then contradictions are detected with >70% precision
  And false positive rate is <20%
  And emotional.polarity values are used correctly

Scenario: Thematic bridge discovery
  Given chunks from different domains with conceptual connections
  When ThematicBridge engine analyzes them
  Then cross-domain connections are found (e.g., "paranoia" ↔ "surveillance capitalism")
  And connection scores reflect concept importance
  And precision is >60% for known bridges

Scenario: End-to-end orchestration
  Given a test corpus with labeled connections
  When full 3-engine orchestration runs
  Then top-10 connections include >5 true positives
  And score aggregation properly weights all 3 engines
  And performance is <500ms for 100 chunks
```

### Validation
```bash
# Run connection quality tests
cd worker && npm test -- connection-quality.test.ts

# Generate connection discovery report
cd worker && npm run benchmark:connection-discovery

# Validate with real documents
cd worker && npm run validate:connections:real
```

---

## Task T-014: Production Readiness

**Priority**: High  
**Estimated Effort**: 4-5 hours  
**Phase**: 3 - Validation & Optimization

### Context & Background

**Source PRP Document**: `docs/prps/processing-pipeline-optimization.md` - Lines 504-531

**Task Purpose**:  
**As a** DevOps engineer  
**I need** to ensure production readiness  
**So that** the feature can be safely deployed

### Dependencies
- **Prerequisite Tasks**: T-010, T-011, T-012, T-013
- **Parallel Tasks**: None (final task)
- **Integration Points**: All systems

### Technical Requirements

**Documentation Updates**:
```
├── docs/ARCHITECTURE.md - Update with AI-only metadata system
├── docs/CODE_EXAMPLES.md - Add AI metadata examples
├── worker/README.md - Document simplified processor flow
└── docs/prps/processing-pipeline-optimization.md - Mark as completed
```

### Implementation Steps
1. Run full validation suite (all tests passing)
2. Update architecture documentation to reflect AI-only system
3. Document cost model ($0.20/doc, $0.50/500-page book)
4. Add monitoring for AI API usage and failures
5. Create rollback plan (re-enable regex metadata if needed)
6. Perform load testing with various document sizes
7. Update deployment scripts for worker module
8. Create migration guide for existing documents

### Acceptance Criteria

```gherkin
Scenario: Full validation passing
  Given the complete AI-only metadata implementation
  When running full validation suite
  Then all processor tests pass
  And all engine tests pass with AI metadata
  And all integration tests pass
  And no regex metadata extractors are imported anywhere

Scenario: Documentation complete
  Given the updated system
  When developers review documentation
  Then AI-only metadata approach is clearly explained
  And cost model is documented ($0.20/doc)
  And all processors use batchChunkAndExtractMetadata
  And legacy regex system is marked as archived

Scenario: Production deployment ready
  Given the validated implementation
  When preparing for deployment
  Then worker module builds without errors
  And all critical paths tested
  And monitoring configured for AI API failures
  And rollback plan documented
```

### Validation
```bash
# Full validation suite
cd worker && npm run test:full-validation

# Pre-deployment checks
cd worker && npm run predeploy

# Load testing
cd worker && npm run test:load

# Final quality gates
cd worker && npm run test:critical
```

---

## Implementation Recommendations

### Suggested Team Structure
- **Lead Developer**: Focus on T-005, T-006, T-007 (core batching implementation)
- **Integration Developer**: Handle T-001, T-002, T-003, T-008 (system integration)
- **QA Engineer**: Own T-010, T-013, T-014 (validation and quality)
- **Performance Engineer**: Focus on T-011, T-012 (benchmarking and optimization)

### Optimal Task Sequencing

**Week 1 (Phase 1)**:
1. Day 1-2: T-001, T-002, T-003 in parallel (cleanup)
2. Day 3: T-004 (validation)
3. Day 4: Buffer/spillover

**Week 2 (Phase 2)**:
1. Day 1-3: T-005, T-007 in parallel (core implementation)
2. Day 3-4: T-006 (stitching)
3. Day 4-5: T-008 (integration)
4. Day 5: T-009 (cost tracking)

**Week 3 (Phase 3)**:
1. Day 1-2: T-010, T-011, T-012 in parallel (testing/validation)
2. Day 3: T-013 (quality validation)
3. Day 4: T-014 (production readiness)
4. Day 5: Buffer/deployment prep

### Parallelization Opportunities
- **Phase 1**: T-001, T-002, T-003 can be done simultaneously by different developers
- **Phase 2**: T-005 and T-007 can be developed in parallel, then integrated
- **Phase 3**: T-010, T-011, T-012 can run concurrently with different focus areas

### Resource Allocation Suggestions
- Allocate most senior developer to T-005, T-006 (critical path items)
- QA can start preparing test data during Phase 1
- Performance engineer can establish baselines during Phase 1

## Critical Path Analysis

### Tasks on Critical Path
1. **T-001** → **T-004** → **T-005** → **T-006** → **T-008** → **T-014**
   - These tasks must complete sequentially for feature delivery
   - Total estimated time: 35-42 hours

### Potential Bottlenecks
- **T-006 (Stitching Algorithm)**: Complex fuzzy matching logic may require iterations
- **T-008 (Integration)**: Coordination point where all Phase 2 work converges
- **T-014 (Production Readiness)**: Final gate that depends on all validation

### Schedule Optimization Suggestions
1. Start T-007 (AI metadata) early as it can be developed independently
2. Begin T-009 (cost tracking) as soon as T-007 has basic structure
3. Prepare test fixtures for T-010 during Phase 1
4. Run continuous benchmarking starting from Phase 2

## Risk Mitigation

### Technical Risks

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| Stitching algorithm accuracy issues | High | Medium | Implement multiple overlap sizes, extensive testing with real documents |
| AI API cost overruns | High | Low | Aggressive batching, cost caps, monitoring from day 1 |
| Performance regression | Medium | Low | Continuous benchmarking, performance gates in CI |
| Memory issues with large docs | Medium | Medium | Streaming processing, batch size limits, memory profiling |

### Implementation Risks

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| Breaking existing functionality | High | Low | Feature flags, comprehensive test suite, gradual rollout |
| Integration complexity | Medium | Medium | Clear interfaces, extensive integration tests |
| Timeline slippage | Medium | Low | Buffer time allocated, parallel work streams |

## Success Metrics

### Must-Have Criteria
- ✅ Support 500+ page documents without errors
- ✅ Processing cost ≤$0.50 per 500-page book
- ✅ Maintain <2 min processing per hour of content
- ✅ Stitching accuracy >95%
- ✅ All existing tests continue to pass

### Nice-to-Have Criteria
- 📊 Cost prediction accuracy ±5% (target: ±10%)
- 📊 Memory usage <400MB peak (target: <500MB)
- 📊 40% performance improvement on large docs
- 📊 Metadata quality score >95% (target: >90%)

### Validation Commands
```bash
# Comprehensive validation before deployment
cd worker && npm run test:full-validation
cd worker && npm run benchmark:all
cd worker && npm run validate:costs
cd worker && npm run validate:quality
```

---

**Document Version**: 1.0  
**Generated**: 2025-09-30  
**PRP Source**: `docs/prps/processing-pipeline-optimization.md`  
**Template Version**: Technical Task Template v1.0.0