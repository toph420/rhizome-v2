# Local Processing Pipeline - Implementation Tasks

## Overview

Migration from cloud-based Gemini API to 100% local document processing using Ollama, achieving zero API costs and complete privacy. This task breakdown decomposes the 14 high-level PRP tasks into 42 actionable development tasks organized into 5 phases.

## Success Criteria (from PRP)
- Process 500-page PDF in <120 minutes
- 100% chunk recovery rate (guaranteed by 5-layer failsafe)
- ≥85% exact confidence matches
- ≤2% synthetic chunks requiring review
- Zero API costs ($0 per document)

## Critical Path
Tasks on the critical path that block subsequent work:
- **T-001**: Install dependencies & setup (blocks all Ollama work)
- **T-002**: Create Ollama client wrapper (blocks all AI replacements)
- **T-003**: Create Zod validation schemas (blocks structured outputs)
- **T-006**: Implement bulletproof chunk matcher (blocks chunk saving)
- **T-029**: PDF processor integration (blocks E2E testing)

## Dependency Graph
```
Foundation Phase (T-001 to T-008)
    ↓
Core Components Phase (T-009 to T-020) [Parallel-safe within phase]
    ↓
UI & Review Phase (T-021 to T-028) [Can start after T-003]
    ↓
Integration Phase (T-029 to T-036)
    ↓
Validation Phase (T-037 to T-042)
```

---

## Phase 1: Foundation & Setup (Est: 4-6 hours)

**Dependencies**: None (can start immediately)
**Goal**: Set up Ollama integration and core infrastructure
**Deliverables**: Working Ollama client, database schema, validation schemas

### Task T-001: Install Dependencies & Setup

**Priority**: Critical
**Estimated Effort**: 30 minutes
**Dependencies**: None
**Source PRP**: docs/prps/local-processing-pipeline.md (Task 1)

**Acceptance Criteria**:
```gherkin
Scenario: Install Ollama dependencies
  Given the worker directory exists
  When I run npm install with updated package.json
  Then ollama@^0.5.0 is installed
  And zod@^3.22.0 is installed
  And zod-to-json-schema@^3.24.0 is installed
  And @google/genai is removed from package.json

Scenario: Verify installation
  Given dependencies are installed
  When I run npm ls ollama zod zod-to-json-schema
  Then all packages are listed at correct versions
  And no peer dependency warnings exist
```

**Implementation Details**:
```
Files to modify:
├── worker/package.json - Add ollama, zod, zod-to-json-schema; remove @google/genai
└── worker/package-lock.json - Update after install
```

**Validation**:
```bash
cd worker && npm ls ollama zod zod-to-json-schema
# Expected: All packages listed at correct versions
```

---

### Task T-002: Create Ollama Client Wrapper

**Priority**: Critical
**Estimated Effort**: 2 hours
**Dependencies**: T-001
**Source PRP**: docs/prps/local-processing-pipeline.md (Task 1)

**Acceptance Criteria**:
```gherkin
Scenario: Ollama client initialization
  Given Ollama is running at localhost:11434
  When the client is instantiated
  Then it connects successfully
  And health check returns { available: true }

Scenario: Structured output with retry
  Given a Zod schema for validation
  When calling chat() with malformed JSON response
  Then it retries up to 3 times
  And validates output with Zod schema
  And returns typed result on success

Scenario: Embeddings generation
  Given text input for embedding
  When calling embeddings()
  Then returns 768-dimensional vector
  And throws error if dimension mismatch
```

**Implementation Details**:
```
Files to create:
├── worker/lib/ollama-client.ts - Singleton client with retry logic
└── worker/types/ollama.ts - TypeScript types for Ollama responses
```

**Code Patterns to Follow**:
- **Singleton Pattern**: Similar to worker/lib/supabase.ts
- **Retry Logic**: Reference worker/lib/markdown-cleanup-ai.ts:120-145
- **Error Handling**: Follow pattern from worker/lib/docling-extractor.ts:85-95

**Manual Testing**:
```bash
npx tsx -e "
import { ollamaClient } from './lib/ollama-client.js';
const health = await ollamaClient.healthCheck();
console.log(health);
"
# Expected: { available: true }
```

---

### Task T-003: Create Zod Validation Schemas

**Priority**: Critical
**Estimated Effort**: 1.5 hours
**Dependencies**: T-001
**Source PRP**: docs/prps/local-processing-pipeline.md (Task 2)

**Acceptance Criteria**:
```gherkin
Scenario: Schema definitions
  Given the need for structured LLM outputs
  When schemas are defined
  Then ChunkMetadataSchema validates all metadata fields
  And CleanupResultSchema validates cleanup responses
  And PositionConfidence enum has 4 values
  And PositionMethod enum has 5 values
  And all schemas export inferred TypeScript types

Scenario: Schema validation
  Given a ChunkMetadataSchema
  When parsing valid metadata
  Then returns typed ChunkMetadata object
  When parsing invalid metadata
  Then throws ZodError with details
```

**Implementation Details**:
```
Files to create:
└── worker/lib/zod-schemas.ts - All validation schemas
```

**Code Patterns to Follow**:
- **Current Metadata Structure**: Copy from worker/lib/ai-chunking-batch.ts:45-75
- **Schema Composition**: Use z.object(), z.array(), z.enum()
- **Type Export**: Use z.infer<typeof Schema> pattern

---

### Task T-004: Database Migration for Local Processing

**Priority**: High
**Estimated Effort**: 1 hour
**Dependencies**: None
**Source PRP**: docs/prps/local-processing-pipeline.md (Task 3)

**Acceptance Criteria**:
```gherkin
Scenario: Migration execution
  Given migration 045_local_processing_schema.sql
  When running supabase db reset
  Then chunks table has position_confidence column
  And chunks table has position_method column
  And chunks table has bboxes, heading_path, section_marker columns
  And documents table has review_stage column
  And all existing chunks/documents are truncated
  And indexes are created successfully

Scenario: Constraint validation
  Given the updated schema
  When inserting chunks
  Then position_confidence accepts only: exact, high, medium, synthetic
  And position_method accepts only defined methods
  And review_stage accepts only defined stages
```

**Implementation Details**:
```
Files to create:
└── supabase/migrations/045_local_processing_schema.sql - Schema changes
```

**Validation**:
```bash
npx supabase db reset
psql -h localhost -p 54322 -U postgres -d postgres -c "\d chunks"
# Expected: New columns visible with constraints
```

---

### Task T-005: Implement Pre-flight Check Script

**Priority**: High
**Estimated Effort**: 1 hour
**Dependencies**: T-002
**Source PRP**: docs/prps/local-processing-pipeline.md (Task 4)

**Acceptance Criteria**:
```gherkin
Scenario: Ollama availability check
  Given the pre-flight check script
  When Ollama is running
  Then returns { available: true, models: [...] }
  When Ollama is not running
  Then returns { available: false, error: "Ollama not running" }

Scenario: Model verification
  Given Ollama is running
  When required models are installed
  Then lists qwen2.5:32b and nomic-embed-text
  When models are missing
  Then returns missing_models array with names
```

**Implementation Details**:
```
Files to create:
├── worker/scripts/pre-flight-check.ts - Ollama verification script
└── src/lib/ollama/health-check.ts - Frontend health check
```

**Manual Testing**:
```bash
cd worker && npx tsx scripts/pre-flight-check.ts
# Expected: JSON output with availability status
```

---

### Task T-006: Integrate Pre-flight Check into Process Handler

**Priority**: High
**Estimated Effort**: 30 minutes
**Dependencies**: T-005
**Source PRP**: docs/prps/local-processing-pipeline.md (Task 4)

**Acceptance Criteria**:
```gherkin
Scenario: Pre-processing validation
  Given a document upload request
  When process-document handler starts
  Then runs pre-flight check first
  And continues if Ollama available
  And fails with clear error if unavailable

Scenario: User-friendly errors
  Given Ollama is not running
  When pre-flight check fails
  Then job status shows "Ollama not running. Please start Ollama and try again"
  And includes instructions for starting Ollama
```

**Implementation Details**:
```
Files to modify:
└── worker/handlers/process-document.ts - Add pre-flight check before processing
```

**Code Patterns to Follow**:
- **Error Pattern**: worker/handlers/process-document.ts:155-165
- **Job Status Update**: worker/handlers/process-document.ts:78-85

---

### Task T-007: Create TypeScript Types for Ollama

**Priority**: Medium
**Estimated Effort**: 30 minutes
**Dependencies**: T-001
**Source PRP**: docs/prps/local-processing-pipeline.md (Task 2)

**Acceptance Criteria**:
```gherkin
Scenario: Type definitions
  Given TypeScript strict mode
  When types are defined
  Then OllamaConfig interface is complete
  And OllamaMessage follows chat format
  And ChunkMatchResult includes all confidence levels
  And types export successfully
```

**Implementation Details**:
```
Files to create:
└── worker/types/ollama.ts - All Ollama-related types
```

---

### Task T-008: Create Test Suite for Ollama Client

**Priority**: Medium
**Estimated Effort**: 1 hour
**Dependencies**: T-002
**Source PRP**: docs/prps/local-processing-pipeline.md (validation)

**Acceptance Criteria**:
```gherkin
Scenario: Unit test coverage
  Given the ollama-client module
  When running tests
  Then health check is tested
  And structured output is tested
  And retry logic is tested
  And embeddings validation is tested
  And all tests pass
```

**Implementation Details**:
```
Files to create:
└── worker/tests/lib/ollama-client.test.ts - Unit tests
```

---

## Phase 2: Core Processing Components (Est: 12-16 hours)

**Dependencies**: Phase 1 completion
**Goal**: Replace all Gemini AI calls with Ollama
**Deliverables**: Working LLM cleanup, chunk matcher, metadata extraction, embeddings

### Task T-009: Replace LLM Cleanup with Ollama

**Priority**: High
**Estimated Effort**: 3 hours
**Dependencies**: T-002, T-003
**Source PRP**: docs/prps/local-processing-pipeline.md (Task 5)

**Acceptance Criteria**:
```gherkin
Scenario: Markdown cleanup via Ollama
  Given raw markdown from Docling
  When processing through LLM cleanup
  Then returns CleanupResult with cleaned_markdown
  And validates with CleanupResultSchema
  And preserves existing regex cleanup
  And handles malformed responses with retry

Scenario: Multi-pass cleanup
  Given artifact-heavy markdown
  When running cleanup passes
  Then first pass removes artifacts
  And second pass fixes formatting
  And third pass polishes output
  And each pass validates with Zod
```

**Implementation Details**:
```
Files to modify:
└── worker/lib/markdown-cleanup-ai.ts - Replace Gemini with Ollama
```

**Code Patterns to Follow**:
- **Existing Cleanup**: Preserve cleanPageArtifacts() at lines 50-120
- **Prompt Structure**: Adapt existing prompts at lines 145-180
- **Error Handling**: Keep retry pattern from lines 185-200

**Validation**:
```bash
cd worker && npm test -- markdown-cleanup
```

---

### Task T-010: Implement Bulletproof Chunk Matcher - Layer 1

**Priority**: Critical
**Estimated Effort**: 2 hours
**Dependencies**: T-003
**Source PRP**: docs/prps/local-processing-pipeline.md (Task 6)

**Acceptance Criteria**:
```gherkin
Scenario: Exact and fuzzy matching
  Given original chunks and cleaned markdown
  When running Layer 1 matching
  Then finds exact matches first
  And attempts fuzzy matching for remainder
  And marks matches with confidence levels
  And tracks unmatched chunks

Scenario: Confidence scoring
  Given a fuzzy match
  When score > 0.9
  Then marks as "high" confidence
  When score between 0.7-0.9
  Then marks as "medium" confidence
  When score < 0.7
  Then adds to unmatched list
```

**Implementation Details**:
```
Files to create:
└── worker/lib/chunk-matcher.ts - 5-layer matching system (start with Layer 1)
```

**Code Patterns to Follow**:
- **Fuzzy Matching**: Use fuse.js library (add to dependencies)
- **Annotation Recovery**: Reference worker/handlers/reprocess-document.ts:245-320

---

### Task T-011: Implement Chunk Matcher - Layers 2-3

**Priority**: Critical
**Estimated Effort**: 3 hours
**Dependencies**: T-010, T-002
**Source PRP**: docs/prps/local-processing-pipeline.md (Task 6)

**Acceptance Criteria**:
```gherkin
Scenario: Embedding-based matching (Layer 2)
  Given unmatched chunks from Layer 1
  When computing embeddings
  Then compares via cosine similarity
  And matches if similarity > 0.85
  And updates confidence accordingly

Scenario: LLM-assisted matching (Layer 3)
  Given still unmatched chunks
  When using Ollama for semantic matching
  Then provides context window around expected position
  And finds semantic matches
  And validates matched text exists
```

**Implementation Details**:
```
Files to modify:
└── worker/lib/chunk-matcher.ts - Add Layers 2 and 3
```

---

### Task T-012: Implement Chunk Matcher - Layer 4 (Interpolation)

**Priority**: High
**Estimated Effort**: 1.5 hours
**Dependencies**: T-011
**Source PRP**: docs/prps/local-processing-pipeline.md (Task 6)

**Acceptance Criteria**:
```gherkin
Scenario: Position interpolation
  Given unmatched chunks after Layers 1-3
  When finding nearest matched neighbors
  Then calculates interpolated position
  And marks as "synthetic" confidence
  And preserves all metadata
  And guarantees 100% chunk recovery

Scenario: Edge case handling
  Given chunk with no matched neighbors
  When interpolating position
  Then uses document boundaries
  And maintains chunk ordering
```

**Implementation Details**:
```
Files to modify:
└── worker/lib/chunk-matcher.ts - Add Layer 4 interpolation
```

---

### Task T-013: Create Chunk Matcher Test Suite

**Priority**: Medium
**Estimated Effort**: 2 hours
**Dependencies**: T-012
**Source PRP**: docs/prps/local-processing-pipeline.md (validation)

**Acceptance Criteria**:
```gherkin
Scenario: 100% recovery validation
  Given any set of chunks
  When running all 5 layers
  Then every chunk has a position
  And no chunks are lost
  And confidence distribution meets targets

Scenario: Performance testing
  Given a 500-page document
  When matching chunks
  Then completes within 5 minutes
  And achieves ≥85% exact matches
```

**Implementation Details**:
```
Files to create:
└── worker/tests/lib/chunk-matcher.test.ts - Comprehensive tests
```

---

### Task T-014: Replace Metadata Extraction with Ollama

**Priority**: High
**Estimated Effort**: 2.5 hours
**Dependencies**: T-002, T-003
**Source PRP**: docs/prps/local-processing-pipeline.md (Task 7)

**Acceptance Criteria**:
```gherkin
Scenario: Metadata extraction via Ollama
  Given text chunks for enrichment
  When extracting metadata
  Then generates themes, concepts, importance scores
  And adds emotional metadata
  And validates with ChunkMetadataSchema
  And processes in batches of 10

Scenario: Fallback handling
  Given metadata extraction failure
  When Zod validation fails
  Then retries up to 3 times
  And falls back to minimal metadata
  And logs error for debugging
```

**Implementation Details**:
```
Files to modify:
└── worker/lib/ai-chunking-batch.ts - Replace Gemini with Ollama
```

**Code Patterns to Follow**:
- **Batch Processing**: Keep existing pattern at lines 180-220
- **Progress Updates**: Preserve progress tracking at lines 225-235

---

### Task T-015: Replace Embeddings Generation with Ollama

**Priority**: High
**Estimated Effort**: 1.5 hours
**Dependencies**: T-002
**Source PRP**: docs/prps/local-processing-pipeline.md (Task 8)

**Acceptance Criteria**:
```gherkin
Scenario: Local embeddings generation
  Given text chunks for embedding
  When calling Ollama nomic-embed-text
  Then generates 768-dimensional vectors
  And validates dimensions
  And batches 100 chunks at a time
  And handles API timeouts gracefully

Scenario: Compatibility validation
  Given existing pgvector storage
  When saving new embeddings
  Then maintains same 768-dim format
  And works with existing similarity search
```

**Implementation Details**:
```
Files to create:
├── worker/lib/local-embeddings.ts - Ollama embeddings wrapper
Files to modify:
└── worker/lib/embeddings.ts - Update to use local-embeddings
```

---

### Task T-016: Update Thematic Bridge Engine

**Priority**: Medium
**Estimated Effort**: 1 hour
**Dependencies**: T-002
**Source PRP**: docs/prps/local-processing-pipeline.md (Task 9)

**Acceptance Criteria**:
```gherkin
Scenario: Thematic bridge with Ollama
  Given filtered chunk pairs
  When analyzing connections
  Then uses Ollama for bridge detection
  And maintains existing filtering logic
  And preserves <300 AI calls limit
  And returns structured connection data
```

**Implementation Details**:
```
Files to modify:
└── worker/engines/thematic-bridge.ts - Replace Gemini with Ollama
```

**Code Patterns to Follow**:
- **Filtering Logic**: Preserve importance > 0.6 filter at lines 145-160
- **Cross-document Logic**: Keep existing checks at lines 165-175

---

### Task T-017: Create Metadata Extraction Tests

**Priority**: Low
**Estimated Effort**: 1 hour
**Dependencies**: T-014
**Source PRP**: docs/prps/local-processing-pipeline.md (validation)

**Acceptance Criteria**:
```gherkin
Scenario: Metadata quality validation
  Given sample chunks
  When extracting metadata
  Then themes are relevant
  And importance scores are normalized
  And emotional metadata is present
  And domain classification is accurate
```

**Implementation Details**:
```
Files to create:
└── worker/tests/lib/ai-chunking-batch.test.ts - Metadata tests
```

---

### Task T-018: Create Embeddings Generation Tests

**Priority**: Low
**Estimated Effort**: 45 minutes
**Dependencies**: T-015
**Source PRP**: docs/prps/local-processing-pipeline.md (validation)

**Acceptance Criteria**:
```gherkin
Scenario: Embedding validation
  Given text input
  When generating embeddings
  Then produces 768-dim vectors
  And vectors are normalized
  And similar texts have high cosine similarity
```

**Implementation Details**:
```
Files to create:
└── worker/tests/lib/local-embeddings.test.ts - Embedding tests
```

---

### Task T-019: Performance Optimization for Batch Processing

**Priority**: Medium
**Estimated Effort**: 1.5 hours
**Dependencies**: T-014, T-015
**Source PRP**: docs/prps/local-processing-pipeline.md (performance targets)

**Acceptance Criteria**:
```gherkin
Scenario: Batch optimization
  Given 500 chunks to process
  When running metadata extraction
  Then processes in optimal batch sizes
  And completes within 20 minutes
  And uses Promise.all for parallelization

Scenario: Resource management
  Given limited memory
  When processing large documents
  Then manages memory efficiently
  And doesn't exceed 30GB RAM usage
```

**Implementation Details**:
```
Files to modify:
├── worker/lib/ai-chunking-batch.ts - Optimize batching
└── worker/lib/local-embeddings.ts - Optimize batch sizes
```

---

### Task T-020: Create Integration Test for Full Pipeline

**Priority**: High
**Estimated Effort**: 2 hours
**Dependencies**: T-009 through T-016
**Source PRP**: docs/prps/local-processing-pipeline.md (validation)

**Acceptance Criteria**:
```gherkin
Scenario: End-to-end component test
  Given all core components
  When processing a 10-page test document
  Then LLM cleanup works
  And chunk matching achieves 100% recovery
  And metadata extraction completes
  And embeddings are generated
  And all components integrate correctly
```

**Implementation Details**:
```
Files to create:
└── worker/tests/integration/core-components.test.ts - Integration test
```

---

## Phase 3: UI & Review Workflow (Est: 6-8 hours)

**Dependencies**: T-003 (schemas), can run parallel to Phase 2
**Goal**: Update UI for new pipeline stages and review workflows
**Deliverables**: Updated ProcessingDock, synthetic chunk review, Obsidian checkpoints

### Task T-021: Update ProcessingDock Stage Labels

**Priority**: High
**Estimated Effort**: 1 hour
**Dependencies**: None
**Source PRP**: docs/prps/local-processing-pipeline.md (Task 11)

**Acceptance Criteria**:
```gherkin
Scenario: New stage labels
  Given the ProcessingDock component
  When displaying progress
  Then shows new stage labels:
    - "🔧 Docling Extraction"
    - "🧹 Regex Cleanup"
    - "🤖 AI Cleanup (Ollama)"
    - "✂️ Semantic Chunking"
    - "🎯 Bulletproof Matching"
    - "📊 Metadata Enrichment"
    - "🔢 Embeddings Generation"
    - "💾 Saving to Database"

Scenario: Progress tracking
  Given multi-stage processing
  When stages update
  Then shows accurate progress percentages
  And displays current substage details
```

**Implementation Details**:
```
Files to modify:
└── src/components/layout/ProcessingDock.tsx - Update STAGE_LABELS
```

---

### Task T-022: Add Review Checkpoint Indicators

**Priority**: Medium
**Estimated Effort**: 1.5 hours
**Dependencies**: T-021
**Source PRP**: docs/prps/local-processing-pipeline.md (Task 11)

**Acceptance Criteria**:
```gherkin
Scenario: Checkpoint visualization
  Given review checkpoints enabled
  When reaching checkpoint stage
  Then shows review indicator
  And displays "Review in Obsidian" button
  And pauses processing if configured

Scenario: Checkpoint interaction
  Given a review checkpoint
  When user clicks review button
  Then exports to Obsidian
  And shows awaiting_manual_review status
```

**Implementation Details**:
```
Files to modify:
└── src/components/layout/ProcessingDock.tsx - Add checkpoint UI
```

---

### Task T-023: Create Synthetic Chunks Review Component

**Priority**: High
**Estimated Effort**: 2.5 hours
**Dependencies**: T-004 (database schema)
**Source PRP**: docs/prps/local-processing-pipeline.md (Task 12)

**Acceptance Criteria**:
```gherkin
Scenario: Synthetic chunk display
  Given chunks with confidence < "high"
  When viewing review tab
  Then displays all synthetic/medium chunks
  And shows confidence badges (color-coded)
  And displays matched content
  And shows position method used

Scenario: Review actions
  Given a synthetic chunk
  When user reviews
  Then can accept (mark validated)
  And can manually fix offsets
  And can bulk accept all
  And updates position_validated flag
```

**Implementation Details**:
```
Files to create:
└── src/components/sidebar/SyntheticChunksReview.tsx - Review component
```

**Code Patterns to Follow**:
- **Component Structure**: Mirror src/components/sidebar/AnnotationReviewTab.tsx
- **Query Pattern**: Use similar Supabase queries at lines 45-65
- **Bulk Actions**: Follow pattern at lines 120-145

---

### Task T-024: Integrate Synthetic Review into Sidebar

**Priority**: Medium
**Estimated Effort**: 1 hour
**Dependencies**: T-023
**Source PRP**: docs/prps/local-processing-pipeline.md (Task 12)

**Acceptance Criteria**:
```gherkin
Scenario: Tab integration
  Given the right sidebar
  When synthetic chunks exist
  Then shows 6th tab for review
  And displays count badge
  And switches correctly between tabs

Scenario: Empty state
  Given no synthetic chunks
  When viewing review tab
  Then shows "No chunks need review" message
  And suggests processing confidence is high
```

**Implementation Details**:
```
Files to modify:
└── src/components/sidebar/RightPanel.tsx - Add 6th tab
```

---

### Task T-025: Extend Obsidian Sync for Checkpoints

**Priority**: High
**Estimated Effort**: 2 hours
**Dependencies**: T-004
**Source PRP**: docs/prps/local-processing-pipeline.md (Task 10)

**Acceptance Criteria**:
```gherkin
Scenario: Checkpoint export
  Given a document at review checkpoint
  When exporting to Obsidian
  Then includes review_stage in metadata
  And exports at docling_extraction checkpoint
  And exports at llm_cleanup checkpoint
  And maintains existing sync logic

Scenario: Checkpoint import
  Given edited document from Obsidian
  When syncing back
  Then resumes from checkpoint stage
  And preserves user edits
  And continues processing pipeline
```

**Implementation Details**:
```
Files to modify:
└── worker/handlers/obsidian-sync.ts - Add checkpoint support
```

**Code Patterns to Follow**:
- **Existing Review Logic**: Preserve lines 253-261
- **Export Pattern**: Follow existing export at lines 180-220

---

### Task T-026: Create UI State Management for Review

**Priority**: Low
**Estimated Effort**: 1 hour
**Dependencies**: T-023
**Source PRP**: docs/prps/local-processing-pipeline.md (UI state)

**Acceptance Criteria**:
```gherkin
Scenario: Review state tracking
  Given synthetic chunks under review
  When user makes changes
  Then updates local state optimistically
  And syncs with database
  And handles conflicts gracefully
```

**Implementation Details**:
```
Files to create:
└── src/stores/review-store.ts - Zustand store for review state
```

---

### Task T-027: Add Review Analytics Dashboard

**Priority**: Low
**Estimated Effort**: 1.5 hours
**Dependencies**: T-023
**Source PRP**: docs/prps/local-processing-pipeline.md (monitoring)

**Acceptance Criteria**:
```gherkin
Scenario: Confidence analytics
  Given processed documents
  When viewing analytics
  Then shows confidence distribution
  And displays average match rates
  And tracks improvement over time
```

**Implementation Details**:
```
Files to create:
└── src/components/analytics/ConfidenceMetrics.tsx - Analytics view
```

---

### Task T-028: Create Review Workflow Tests

**Priority**: Medium
**Estimated Effort**: 1 hour
**Dependencies**: T-023, T-025
**Source PRP**: docs/prps/local-processing-pipeline.md (validation)

**Acceptance Criteria**:
```gherkin
Scenario: Review workflow E2E
  Given synthetic chunks
  When user reviews and accepts
  Then updates database correctly
  And removes from review queue
  And maintains data integrity
```

**Implementation Details**:
```
Files to create:
└── tests/e2e/review-workflow.spec.ts - Playwright E2E tests
```

---

## Phase 4: Integration & Testing (Est: 8-10 hours)

**Dependencies**: Phases 1-2 complete
**Goal**: Wire everything together and ensure robust error handling
**Deliverables**: Integrated PDF processor, comprehensive error handling

### Task T-029: Integrate Components into PDF Processor

**Priority**: Critical
**Estimated Effort**: 3 hours
**Dependencies**: T-009 through T-016
**Source PRP**: docs/prps/local-processing-pipeline.md (Task 13)

**Acceptance Criteria**:
```gherkin
Scenario: Component integration
  Given all new Ollama components
  When processing a PDF
  Then uses Ollama for LLM cleanup (Stage 3)
  And uses chunk matcher (new Stage 4)
  And uses Ollama for metadata (Stage 6)
  And uses local embeddings (Stage 7)
  And maintains stage progression

Scenario: Review checkpoint integration
  Given checkpoint configuration
  When reaching checkpoint stages
  Then triggers Obsidian export
  And updates review_stage in database
  And resumes from checkpoints correctly
```

**Implementation Details**:
```
Files to modify:
└── worker/processors/pdf-processor.ts - Integrate all components
```

**Code Patterns to Follow**:
- **Stage Pattern**: Follow existing stage structure at lines 200-400
- **Error Handling**: Maintain try-catch pattern at lines 150-180

---

### Task T-030: Add Comprehensive Error Handling

**Priority**: High
**Estimated Effort**: 2 hours
**Dependencies**: T-029
**Source PRP**: docs/prps/local-processing-pipeline.md (Task 13)

**Acceptance Criteria**:
```gherkin
Scenario: Ollama connection errors
  Given Ollama is unavailable
  When processing starts
  Then shows clear error message
  And updates job status appropriately
  And suggests remediation steps

Scenario: Partial failure recovery
  Given a stage fails
  When error is recoverable
  Then retries with exponential backoff
  And logs detailed error information
  And continues if non-critical

Scenario: Data integrity on failure
  Given processing failure
  When transaction rollback needed
  Then preserves data consistency
  And doesn't create orphan records
```

**Implementation Details**:
```
Files to modify:
├── worker/processors/pdf-processor.ts - Error boundaries
└── worker/lib/ollama-client.ts - Connection error handling
```

---

### Task T-031: Create Error Recovery Mechanisms

**Priority**: Medium
**Estimated Effort**: 1.5 hours
**Dependencies**: T-030
**Source PRP**: docs/prps/local-processing-pipeline.md (error handling)

**Acceptance Criteria**:
```gherkin
Scenario: Automatic retry logic
  Given transient failures
  When retryable error occurs
  Then attempts up to 3 times
  And uses exponential backoff
  And logs each attempt

Scenario: Manual recovery
  Given persistent failure
  When user intervention needed
  Then provides recovery instructions
  And allows resuming from last checkpoint
```

**Implementation Details**:
```
Files to create:
└── worker/lib/error-recovery.ts - Recovery utilities
```

---

### Task T-032: Implement Progress Tracking Updates

**Priority**: Medium
**Estimated Effort**: 1 hour
**Dependencies**: T-029
**Source PRP**: docs/prps/local-processing-pipeline.md (progress tracking)

**Acceptance Criteria**:
```gherkin
Scenario: Granular progress updates
  Given 8-stage pipeline
  When processing document
  Then updates progress at substage level
  And shows estimated time remaining
  And displays current operation details
```

**Implementation Details**:
```
Files to modify:
└── worker/processors/pdf-processor.ts - Add progress calls
```

---

### Task T-033: Create Integration Test Suite

**Priority**: High
**Estimated Effort**: 2.5 hours
**Dependencies**: T-029
**Source PRP**: docs/prps/local-processing-pipeline.md (Level 3 validation)

**Acceptance Criteria**:
```gherkin
Scenario: Small document E2E
  Given a 5-page PDF
  When processing through pipeline
  Then completes all 8 stages
  And achieves 100% chunk recovery
  And saves to database correctly
  And generates valid embeddings

Scenario: Large document performance
  Given a 100-page PDF
  When processing
  Then completes within 30 minutes
  And maintains memory under 30GB
  And handles batching correctly
```

**Implementation Details**:
```
Files to create:
└── worker/tests/integration/pdf-pipeline.test.ts - E2E tests
```

---

### Task T-034: Test Checkpoint Workflow

**Priority**: Medium
**Estimated Effort**: 1 hour
**Dependencies**: T-025, T-029
**Source PRP**: docs/prps/local-processing-pipeline.md (checkpoint validation)

**Acceptance Criteria**:
```gherkin
Scenario: Checkpoint export/import
  Given checkpoint enabled
  When reaching review stage
  Then exports to Obsidian correctly
  And accepts user edits
  And resumes processing with edits
```

**Implementation Details**:
```
Files to create:
└── worker/tests/integration/checkpoint-workflow.test.ts - Checkpoint tests
```

---

### Task T-035: Performance Benchmarking

**Priority**: Low
**Estimated Effort**: 1.5 hours
**Dependencies**: T-029
**Source PRP**: docs/prps/local-processing-pipeline.md (performance targets)

**Acceptance Criteria**:
```gherkin
Scenario: Processing time benchmarks
  Given documents of various sizes
  When benchmarking
  Then 50-page PDF < 10 minutes
  And 200-page PDF < 40 minutes
  And 500-page PDF < 120 minutes
  And memory usage < 30GB
```

**Implementation Details**:
```
Files to create:
└── worker/benchmarks/local-processing.ts - Benchmark suite
```

---

### Task T-036: Create Troubleshooting Documentation

**Priority**: Low
**Estimated Effort**: 1 hour
**Dependencies**: T-029
**Source PRP**: docs/prps/local-processing-pipeline.md (documentation)

**Acceptance Criteria**:
```gherkin
Scenario: Common issues guide
  Given troubleshooting needs
  When documentation exists
  Then covers Ollama setup issues
  And explains model installation
  And provides performance tuning tips
  And includes FAQ section
```

**Implementation Details**:
```
Files to create:
└── docs/TROUBLESHOOTING.md - Troubleshooting guide
```

---

## Phase 5: Validation & Deployment (Est: 4-6 hours)

**Dependencies**: Phases 1-4 complete
**Goal**: Ensure production readiness and complete documentation
**Deliverables**: Configured environment, updated docs, validated system

### Task T-037: Update Environment Configuration

**Priority**: High
**Estimated Effort**: 30 minutes
**Dependencies**: All previous tasks
**Source PRP**: docs/prps/local-processing-pipeline.md (Task 14)

**Acceptance Criteria**:
```gherkin
Scenario: Environment variables
  Given new Ollama configuration
  When updating .env files
  Then adds OLLAMA_HOST variable
  And adds OLLAMA_MODEL variable
  And adds OLLAMA_EMBEDDING_MODEL variable
  And removes GOOGLE_AI_API_KEY
  And removes GEMINI_MODEL
```

**Implementation Details**:
```
Files to modify:
├── worker/.env.example - Add Ollama vars, remove Gemini
└── .env.local.example - Update main app example
```

---

### Task T-038: Update README Documentation

**Priority**: High
**Estimated Effort**: 1 hour
**Dependencies**: T-037
**Source PRP**: docs/prps/local-processing-pipeline.md (Task 14)

**Acceptance Criteria**:
```gherkin
Scenario: Setup instructions
  Given new local processing
  When reading documentation
  Then explains Ollama installation
  And lists required models
  And provides ollama pull commands
  And includes troubleshooting tips

Scenario: Migration guide
  Given existing users
  When reading migration section
  Then explains clean slate approach
  And warns about data removal
  And provides backup instructions
```

**Implementation Details**:
```
Files to modify:
├── README.md - Update with Ollama requirements
└── docs/SETUP.md - Create detailed setup guide
```

---

### Task T-039: Final Integration Testing

**Priority**: Critical
**Estimated Effort**: 2 hours
**Dependencies**: T-033
**Source PRP**: docs/prps/local-processing-pipeline.md (final validation)

**Acceptance Criteria**:
```gherkin
Scenario: Complete E2E validation
  Given fully integrated system
  When processing various documents
  Then PDF processing works
  And EPUB processing works
  And YouTube processing works
  And all features functional
  And no Gemini API calls made

Scenario: Data integrity
  Given processed documents
  When checking database
  Then all chunks have positions
  And confidence levels accurate
  And metadata complete
  And embeddings valid
```

**Implementation Details**:
```
Files to create:
└── worker/tests/e2e/full-pipeline.test.ts - Complete E2E suite
```

---

### Task T-040: Validate Success Metrics

**Priority**: High
**Estimated Effort**: 1 hour
**Dependencies**: T-039
**Source PRP**: docs/prps/local-processing-pipeline.md (success criteria)

**Acceptance Criteria**:
```gherkin
Scenario: Performance metrics
  Given test documents
  When measuring performance
  Then 500-page PDF < 120 minutes
  And 100% chunk recovery achieved
  And ≥85% exact confidence matches
  And ≤2% synthetic chunks

Scenario: Cost validation
  Given processed documents
  When checking API logs
  Then zero Gemini API calls
  And $0 processing cost confirmed
```

**Implementation Details**:
```
Files to create:
└── worker/scripts/validate-metrics.ts - Metrics validation
```

---

### Task T-041: Create Deployment Checklist

**Priority**: Medium
**Estimated Effort**: 45 minutes
**Dependencies**: T-040
**Source PRP**: docs/prps/local-processing-pipeline.md (deployment)

**Acceptance Criteria**:
```gherkin
Scenario: Deployment readiness
  Given completed implementation
  When reviewing checklist
  Then all tests pass
  And documentation complete
  And environment configured
  And models installed
  And backup created
```

**Implementation Details**:
```
Files to create:
└── docs/DEPLOYMENT_CHECKLIST.md - Deployment guide
```

---

### Task T-042: Post-Deployment Monitoring

**Priority**: Low
**Estimated Effort**: 1.5 hours
**Dependencies**: T-041
**Source PRP**: docs/prps/local-processing-pipeline.md (monitoring)

**Acceptance Criteria**:
```gherkin
Scenario: Production monitoring
  Given deployed system
  When monitoring performance
  Then tracks processing times
  And monitors error rates
  And logs confidence distributions
  And alerts on failures
```

**Implementation Details**:
```
Files to create:
└── worker/lib/monitoring.ts - Monitoring utilities
```

---

## Implementation Recommendations

### Suggested Team Structure
For a single AI agent or developer:
- Execute phases sequentially
- Within each phase, identify parallel-safe tasks
- Prioritize critical path tasks first

### Optimal Task Sequencing
1. **Week 1**: Complete Phase 1 (Foundation) + Start Phase 2 (Core)
2. **Week 2**: Complete Phase 2 + Phase 3 (UI) in parallel
3. **Week 3**: Phase 4 (Integration) + Phase 5 (Validation)

### Parallelization Opportunities
Within phases, these tasks can run in parallel:
- **Phase 2**: T-014, T-015, T-016 (after T-009)
- **Phase 3**: All tasks can start after T-003
- **Phase 4**: T-031, T-032 (after T-030)
- **Phase 5**: T-038, T-041, T-042 (after T-037)

### Resource Allocation
- **High Priority**: Foundation setup, chunk matcher, integration
- **Medium Priority**: UI updates, error handling, testing
- **Low Priority**: Analytics, documentation, monitoring

---

## Critical Path Analysis

**Critical Path** (longest dependency chain blocking deployment):
```
T-001 → T-002 → T-003 → T-009 → T-010 → T-011 → T-012 → T-029 → T-039 → T-040
```

**Duration**: ~18-22 hours of focused development

**Potential Bottlenecks**:
1. **Ollama Client Setup** (T-002): Blocks all AI replacements
2. **Chunk Matcher** (T-010-012): Complex algorithm, blocks integration
3. **PDF Processor Integration** (T-029): Requires all components ready

**Schedule Optimization**:
- Start Phase 3 (UI) in parallel with Phase 2
- Batch simple tasks (environment, documentation) for efficiency
- Test continuously to catch issues early

---

## Risk Mitigation

### High-Risk Tasks
1. **T-010-012** (Chunk Matcher): Complex algorithm requiring careful testing
   - Mitigation: Extensive unit tests, real document validation

2. **T-029** (Integration): Many moving parts coming together
   - Mitigation: Component-level testing before integration

3. **T-002** (Ollama Client): External dependency
   - Mitigation: Robust error handling, clear setup documentation

### Contingency Plans
- If Qwen 32B too slow: Fall back to smaller model (7B/13B)
- If chunk matching < 85%: Tune fuzzy matching parameters
- If memory > 30GB: Implement streaming/chunking for large docs

---

## Summary

This task breakdown provides 42 detailed implementation tasks organized into 5 phases, decomposed from the original 14 PRP tasks. The implementation follows a clear progression from foundation setup through validation, with well-defined dependencies and acceptance criteria for each task.

**Total Estimated Effort**: 34-46 hours (~1 week for experienced developer)

**Key Success Factors**:
- ✅ Every PRP requirement mapped to specific tasks
- ✅ Dependencies clearly identified
- ✅ Acceptance criteria use Given-When-Then format
- ✅ Validation commands included throughout
- ✅ Critical path identified for priority focus

**Next Steps**:
1. Review task breakdown with stakeholders
2. Set up Ollama and required models
3. Begin Phase 1 execution with T-001
4. Track progress using TodoWrite for each task
5. Validate at phase boundaries before proceeding