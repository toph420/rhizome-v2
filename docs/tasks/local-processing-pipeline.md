# Local Processing Pipeline - Task Breakdown

**Feature**: 100% Local Document Processing with Docling, Ollama, and PydanticAI
**Source PRP**: [docs/prps/local-processing-pipeline.md](../prps/local-processing-pipeline.md)
**Status**: Ready for Sprint Planning
**Total Effort**: 3-4 weeks
**Complexity**: High
**Priority**: High

---

## PRP Analysis Summary

### Feature Scope
- **Core Capability**: Replace cloud AI services (Gemini) with 100% local processing
- **Document Types**: PDF, EPUB, Markdown, Text (4 formats)
- **Processing Stages**: 10 distinct stages with review checkpoints
- **Key Innovation**: 5-layer bulletproof chunk matching system (100% recovery guarantee)
- **Performance Target**: 40-80 minutes per 500-page book (with LLM cleanup)

### Key Technical Requirements
- **Hardware**: 64GB M1 Max (minimum for Qwen 32B Q4_K_M)
- **External Dependencies**: Python 3.10+, Ollama, Docling, PydanticAI, Transformers.js
- **Database Changes**: Migration #045 with 8 new chunk columns
- **UI Components**: Chunk quality panel with confidence tracking
- **Cost Reduction**: $0 API costs vs $0.50-3 per document

### Validation Requirements
- 100% chunk recovery rate (zero data loss)
- 85%+ chunks match with "exact" confidence
- <5% chunks flagged as "synthetic"
- Processing time under 80 minutes for 500-page PDF
- All processing happens locally (0 API calls)

---

## Task Complexity Assessment

### Overall Complexity: **High**

**Rationale**:
- **Multi-language Integration**: Python + Node.js IPC communication
- **External Dependencies**: 4 new major libraries requiring coordination
- **Novel Algorithm**: 5-layer matching system is sophisticated
- **Database Migration**: Complex schema changes with new indexes
- **UI Components**: New quality tracking and review interfaces
- **Error Handling**: OOM recovery, fallback strategies, review workflow

### Integration Points
- **Python Subprocess**: Docling extraction, PydanticAI metadata
- **Ollama Service**: Local LLM integration via HTTP API
- **Transformers.js**: Browser-based embeddings generation
- **Database**: 8 new columns + 3 indexes in chunks table
- **UI**: 2 new components + modifications to existing panels

### Technical Challenges
- **IPC Reliability**: Python stdout buffering can cause hangs
- **Memory Management**: Qwen 32B requires 20-24GB RAM
- **Tokenizer Alignment**: Must match between HybridChunker and embeddings
- **Fuzzy Matching**: 5-layer system requires careful orchestration
- **Performance**: Balance accuracy vs processing time

---

## Phase Organization

### Phase 1: Core Infrastructure (Days 1-2)
**Objective**: Establish foundation with database schema, dependencies, and model setup
**Deliverables**: Migration applied, dependencies installed, Ollama configured
**Milestones**: Qwen 32B responding to test prompts

### Phase 2: Docling Integration (Days 3-5)
**Objective**: Implement PDF extraction with HybridChunker and structural metadata
**Deliverables**: Enhanced Python script, TypeScript wrapper, processor integration
**Milestones**: PDFs extracting with chunk metadata (pages, headings, bboxes)

### Phase 3: Local LLM Cleanup (Days 6-7)
**Objective**: Replace Gemini cleanup with Ollama-based markdown cleaning
**Deliverables**: Ollama client module, cleanup implementation, OOM handling
**Milestones**: Markdown cleanup working locally with fallback

### Phase 4: Bulletproof Chunk Matching (Days 8-11)
**Objective**: Implement 5-layer matching system for 100% chunk recovery
**Deliverables**: Enhanced fuzzy, embeddings, LLM-assisted, interpolation layers
**Milestones**: 100% chunk recovery rate achieved

### Phase 5: Metadata Enrichment (Days 12-13)
**Objective**: Extract structured metadata using PydanticAI with type safety
**Deliverables**: Python script, TypeScript wrapper, processor integration
**Milestones**: All chunks have validated metadata

### Phase 6: Local Embeddings (Day 14)
**Objective**: Generate embeddings locally with Transformers.js
**Deliverables**: Embeddings module, processor integration
**Milestones**: 768-dimensional vectors generated locally

### Phase 7: Review Checkpoints (Days 15-16)
**Objective**: Add user review checkpoints for Docling extraction and AI cleanup
**Deliverables**: Checkpoint logic, resume handling
**Milestones**: Pipeline can pause and resume from review

### Phase 8: Confidence UI (Days 17-18)
**Objective**: Build UI for chunk quality tracking and validation
**Deliverables**: Quality panel component, inline tooltips, sidebar tab
**Milestones**: Users can see and validate synthetic chunks

### Phase 9: Testing & Validation (Days 19-20)
**Objective**: Comprehensive testing of local pipeline
**Deliverables**: Integration tests, validation suite
**Milestones**: All tests pass, <5% synthetic chunks

### Phase 10: Documentation & Cleanup (Day 21)
**Objective**: Complete documentation and environment setup guides
**Deliverables**: Setup instructions, environment docs, CLAUDE.md updates
**Milestones**: Pipeline ready for production use

---

## Detailed Task Breakdown

### Phase 1: Core Infrastructure

#### Task T-001: Database Migration #045
**Priority**: Critical
**Effort**: S (2-4 hours)
**Dependencies**: None
**Blocks**: T-007, T-015, T-025

**Description**: Create and apply database migration to add local pipeline columns to chunks table.

**Implementation Details**:
- Create `supabase/migrations/045_add_local_pipeline_columns.sql`
- Add 8 new columns: page_start, page_end, heading_level, section_marker, bboxes, position_confidence, position_method, position_validated
- Create 3 indexes for efficient querying
- Preserve existing recovery_confidence, recovery_method columns

**Acceptance Criteria**:
```gherkin
Scenario: Migration applies successfully
  Given a clean database state
  When I run npx supabase migration up
  Then the chunks table has 8 new columns
  And 3 new indexes are created
  And existing data is preserved

Scenario: Confidence enum validation
  Given the migration is applied
  When I insert a chunk with position_confidence
  Then only 'exact', 'high', 'medium', 'synthetic' values are accepted
  And invalid values are rejected
```

**Checklist**:
- [ ] Migration file created with proper numbering (045)
- [ ] All 8 columns added with correct types
- [ ] CHECK constraint on position_confidence enum
- [ ] Indexes created for performance
- [ ] Migration runs without errors
- [ ] Rollback script included

---

#### Task T-002: Install External Dependencies
**Priority**: Critical
**Effort**: S (1-2 hours)
**Dependencies**: None
**Blocks**: T-004, T-005, T-008, T-016, T-019

**Description**: Install all Python and Node.js dependencies required for local processing.

**Implementation Details**:
- Install Python packages: docling==2.55.1, pydantic-ai[ollama], sentence-transformers, transformers
- Install Node packages in worker workspace: ollama, @huggingface/transformers
- Verify installations with test imports

**Acceptance Criteria**:
```gherkin
Scenario: Python dependencies installed
  Given Python 3.10+ is available
  When I run pip install commands
  Then all packages import successfully
  And docling version is 2.55.1
  And pydantic_ai Agent class is available

Scenario: Node dependencies installed
  Given Node.js environment
  When I run npm install in worker directory
  Then ollama and transformers packages are available
  And require statements work without errors
```

**Checklist**:
- [ ] Python version verified (>=3.10)
- [ ] All Python packages installed
- [ ] Node packages installed in worker workspace
- [ ] Import tests pass
- [ ] Package versions documented

---

#### Task T-003: Ollama Model Setup
**Priority**: Critical
**Effort**: S (1-2 hours)
**Dependencies**: T-002
**Blocks**: T-004, T-008, T-012, T-016

**Description**: Install and configure Ollama with Qwen 32B model.

**Implementation Details**:
- Install Ollama service if not present
- Pull qwen2.5:32b-instruct-q4_K_M model (~20GB)
- Verify model responds to test prompts
- Configure OLLAMA_HOST environment variable

**Acceptance Criteria**:
```gherkin
Scenario: Ollama service running
  Given Ollama is installed
  When I run ollama serve
  Then the service starts on port 11434
  And health endpoint responds

Scenario: Qwen model available
  Given Ollama service is running
  When I run ollama list
  Then qwen2.5:32b-instruct-q4_K_M appears
  And model size shows ~20GB

Scenario: Model responds to prompts
  Given Qwen model is loaded
  When I send a test prompt via curl
  Then I receive a coherent response
  And response time is under 10 seconds
```

**Checklist**:
- [ ] Ollama service installed
- [ ] Service running on default port
- [ ] Qwen 32B model downloaded
- [ ] Model responds to test prompts
- [ ] Memory usage verified (<24GB)
- [ ] Environment variables configured

---

#### Task T-004: Create Ollama Client Module
**Priority**: High
**Effort**: S (3-4 hours)
**Dependencies**: T-002, T-003
**Blocks**: T-008, T-012

**Description**: Create TypeScript wrapper for Ollama API with structured output support.

**Implementation Details**:
- Create `worker/lib/local/ollama-client.ts`
- Implement OllamaClient class with chat() and generateStructured() methods
- Handle timeout, OOM, connection errors
- Follow pattern from markdown-cleanup-ai.ts

**Acceptance Criteria**:
```gherkin
Scenario: Basic chat functionality
  Given OllamaClient is initialized
  When I call chat() with a prompt
  Then I receive a text response
  And the response is coherent

Scenario: Structured output generation
  Given a JSON schema
  When I call generateStructured()
  Then I receive valid JSON matching schema
  And invalid responses trigger retry

Scenario: Error handling
  Given various error conditions
  When OOM or timeout occurs
  Then errors are caught and wrapped
  And meaningful error messages are returned
```

**Checklist**:
- [ ] OllamaClient class created
- [ ] chat() method works
- [ ] generateStructured() returns valid JSON
- [ ] Timeout handling (10 min default)
- [ ] OOM error detection
- [ ] Connection error handling
- [ ] Environment variable configuration

---

### Phase 2: Docling Integration

#### Task T-005: Enhance Docling Python Script
**Priority**: High
**Effort**: M (1 day)
**Dependencies**: T-002
**Blocks**: T-006, T-007, T-010

**Description**: Extend existing Docling script to support HybridChunker with structural metadata extraction.

**Implementation Details**:
- Modify `worker/scripts/docling_extract.py`
- Add HybridChunker with tokenizer configuration
- Extract page numbers, headings, bboxes from Docling structure
- Maintain backward compatibility with existing interface

**Acceptance Criteria**:
```gherkin
Scenario: HybridChunker integration
  Given a PDF file
  When extraction runs with enable_chunking=true
  Then chunks are created with tokenizer alignment
  And chunk size respects max_tokens parameter
  And peer chunks are merged appropriately

Scenario: Metadata extraction
  Given Docling document structure
  When chunks are created
  Then each chunk has page_start and page_end
  And heading_path contains hierarchy
  And bboxes contain coordinate data

Scenario: Progress reporting maintained
  Given existing progress callbacks
  When extraction runs
  Then progress is reported to stdout
  And JSON format is preserved
```

**Checklist**:
- [ ] HybridChunker imported and configured
- [ ] Tokenizer set to 'Xenova/all-mpnet-base-v2'
- [ ] Structure extraction (sections, headings)
- [ ] Chunk metadata (pages, headings, bboxes)
- [ ] Progress reporting maintained
- [ ] Backward compatibility preserved
- [ ] Error handling for malformed PDFs

---

#### Task T-006: Update TypeScript Docling Wrapper
**Priority**: High
**Effort**: S (3-4 hours)
**Dependencies**: T-005
**Blocks**: T-007, T-015

**Description**: Update TypeScript wrapper to handle HybridChunker output and structured chunks.

**Implementation Details**:
- Modify `worker/lib/docling-extractor.ts`
- Add DoclingOptions and DoclingChunk interfaces
- Parse chunks from Python output
- Maintain timeout and progress handling

**Acceptance Criteria**:
```gherkin
Scenario: Chunk parsing
  Given Python returns chunked output
  When extractPdfBuffer() is called
  Then chunks array is properly parsed
  And each chunk has required metadata
  And type safety is maintained

Scenario: Options passing
  Given DoclingOptions configuration
  When calling Python subprocess
  Then options are serialized correctly
  And Python receives all parameters

Scenario: Error handling preserved
  Given existing timeout logic
  When extraction takes too long
  Then timeout error is thrown
  And subprocess is cleaned up
```

**Checklist**:
- [ ] DoclingOptions interface defined
- [ ] DoclingChunk interface complete
- [ ] Chunks parsed from JSON output
- [ ] Options passed to Python correctly
- [ ] Timeout handling preserved
- [ ] Progress callbacks work
- [ ] Type safety maintained

---

#### Task T-007: Update PDF Processor for Local Mode
**Priority**: High
**Effort**: S (2-3 hours)
**Dependencies**: T-001, T-005, T-006
**Blocks**: T-009, T-015

**Description**: Modify PDF processor to use Docling chunking in local mode.

**Implementation Details**:
- Modify `worker/processors/pdf-processor.ts`
- Check PROCESSING_MODE environment variable
- Enable chunking when in local mode
- Cache Docling chunks in job metadata

**Acceptance Criteria**:
```gherkin
Scenario: Local mode detection
  Given PROCESSING_MODE=local
  When PDF processing starts
  Then Docling chunking is enabled
  And tokenizer is configured correctly

Scenario: Chunk caching
  Given Docling returns chunks
  When extraction completes
  Then chunks are stored in job.metadata
  And structure is cached for later use

Scenario: Progress tracking
  Given existing progress stages
  When using local mode
  Then progress percentages are maintained
  And stage names remain consistent
```

**Checklist**:
- [ ] Environment variable check added
- [ ] Conditional chunking enablement
- [ ] Chunk caching in metadata
- [ ] Structure caching
- [ ] Progress tracking maintained
- [ ] Stage progression (15-50%)

---

### Phase 3: Local LLM Cleanup

#### Task T-008: Implement Ollama Cleanup Module
**Priority**: High
**Effort**: M (4-6 hours)
**Dependencies**: T-004
**Blocks**: T-009, T-021

**Description**: Create Ollama-based markdown cleanup module to replace Gemini.

**Implementation Details**:
- Create `worker/lib/local/ollama-cleanup.ts`
- Mirror structure from markdown-cleanup-ai.ts
- Implement batching for large documents (split at ## headings)
- Add OOM error handling with fallback

**Acceptance Criteria**:
```gherkin
Scenario: Small document cleanup
  Given markdown under 100k characters
  When cleanMarkdownLocal() is called
  Then single-pass cleanup is performed
  And artifacts are removed
  And content is preserved

Scenario: Large document batching
  Given markdown over 100k characters
  When cleanup is performed
  Then document is split at headings
  And sections are processed in parallel
  And results are reassembled correctly

Scenario: OOM handling
  Given Qwen runs out of memory
  When OOM error occurs
  Then OOMError is thrown
  And error message indicates fallback needed
```

**Checklist**:
- [ ] cleanMarkdownLocal() function created
- [ ] Batching strategy implemented
- [ ] Section splitting at ## headings
- [ ] Parallel processing of sections
- [ ] OOM error detection
- [ ] Temperature configuration (0.3)
- [ ] Progress callback support

---

#### Task T-009: Add Cleanup to PDF Processor
**Priority**: High
**Effort**: S (2-3 hours)
**Dependencies**: T-007, T-008
**Blocks**: T-010, T-015, T-021

**Description**: Integrate Ollama cleanup into PDF processor with fallback handling.

**Implementation Details**:
- Modify Stage 4 in PDF processor (55-70%)
- Add conditional for local vs Gemini cleanup
- Implement OOM fallback to regex-only
- Mark for review on failure

**Acceptance Criteria**:
```gherkin
Scenario: Local cleanup selection
  Given PROCESSING_MODE=local
  And cleanMarkdown flag is true
  When Stage 4 executes
  Then Ollama cleanup is used
  And progress is tracked correctly

Scenario: OOM fallback
  Given Ollama throws OOM error
  When cleanup fails
  Then document is marked for review
  And regex-only cleanup is applied
  And processing continues

Scenario: Progress tracking
  Given cleanup stage running
  When processing markdown
  Then progress updates from 55% to 70%
  And status messages are informative
```

**Checklist**:
- [ ] Local mode conditional added
- [ ] Ollama cleanup integration
- [ ] OOM catch block
- [ ] Review marking on failure
- [ ] Fallback to regex cleanup
- [ ] Progress tracking (55-70%)
- [ ] Status messages updated

---

### Phase 4: Bulletproof Chunk Matching

#### Task T-010: Implement Layer 1 (Enhanced Fuzzy)
**Priority**: Critical
**Effort**: M (4-6 hours)
**Dependencies**: T-005, T-009
**Blocks**: T-011, T-014

**Description**: Enhance existing fuzzy matcher with multi-anchor search strategy.

**Implementation Details**:
- Modify `worker/lib/chunking/ai-fuzzy-matcher.ts`
- Add Strategy 3.5: Multi-anchor search
- Extract 3 anchor points (start, middle, end)
- Return confidence levels based on strategy used

**Acceptance Criteria**:
```gherkin
Scenario: Exact matching
  Given chunk content exactly in markdown
  When matching is performed
  Then confidence is 'exact'
  And method is 'exact_match'

Scenario: Multi-anchor matching
  Given chunk with identifiable anchors
  When at least 2 anchors are found
  Then bounds are calculated
  And confidence is 'high'
  And method is 'multi_anchor'

Scenario: Sliding window fallback
  Given no exact or anchor matches
  When sliding window finds >80% similarity
  Then match is returned
  And confidence is 'high'
```

**Checklist**:
- [ ] Existing strategies preserved
- [ ] Multi-anchor extraction logic
- [ ] Anchor position finding
- [ ] Bounds calculation from anchors
- [ ] Confidence level assignment
- [ ] Method tracking
- [ ] Return null on failure

---

#### Task T-011: Implement Layer 2 (Embeddings)
**Priority**: High
**Effort**: M (6-8 hours)
**Dependencies**: T-010
**Blocks**: T-012, T-014

**Description**: Create embedding-based matching for unmatched chunks.

**Implementation Details**:
- Create embeddingBasedMatching() in bulletproof-matcher.ts
- Use Transformers.js for embeddings
- Create sliding windows of markdown
- Find best cosine similarity matches

**Acceptance Criteria**:
```gherkin
Scenario: Chunk embedding
  Given unmatched chunks
  When embeddings are generated
  Then 768-dimensional vectors are created
  And vectors are normalized

Scenario: Window creation
  Given cleaned markdown
  When windows are created
  Then windows are 500 chars with 200 stride
  And windows cover entire document

Scenario: Similarity matching
  Given chunk and window embeddings
  When cosine similarity >= 0.85
  Then match is recorded
  And confidence is 'high' if >= 0.95
  And confidence is 'medium' if < 0.95
```

**Checklist**:
- [ ] Transformers.js pipeline setup
- [ ] Chunk embedding generation
- [ ] Window creation logic
- [ ] Window embedding generation
- [ ] Cosine similarity calculation
- [ ] Threshold-based matching
- [ ] Confidence assignment
- [ ] Batch processing support

---

#### Task T-012: Implement Layer 3 (LLM-Assisted)
**Priority**: Medium
**Effort**: M (4-6 hours)
**Dependencies**: T-004, T-011
**Blocks**: T-013, T-014

**Description**: Implement LLM-assisted matching for remaining unmatched chunks.

**Implementation Details**:
- Add llmAssistedMatching() function
- Use OllamaClient for intelligent matching
- Provide chunk + search window to LLM
- Parse JSON response with positions

**Acceptance Criteria**:
```gherkin
Scenario: LLM prompt creation
  Given unmatched chunk and search window
  When prompt is constructed
  Then chunk content is included
  And search area is provided
  And JSON format is specified

Scenario: Response parsing
  Given LLM returns JSON
  When response has found=true
  Then offsets are extracted
  And positions are adjusted to document
  And confidence is 'medium'

Scenario: No match handling
  Given LLM returns found=false
  When processing response
  Then chunk remains unmatched
  And moves to next layer
```

**Checklist**:
- [ ] Prompt template created
- [ ] Search window extraction
- [ ] OllamaClient integration
- [ ] JSON response parsing
- [ ] Offset adjustment logic
- [ ] Confidence set to 'medium'
- [ ] Error handling for malformed JSON
- [ ] Timeout handling

---

#### Task T-013: Implement Layer 4 (Interpolation)
**Priority**: Critical
**Effort**: S (3-4 hours)
**Dependencies**: T-012
**Blocks**: T-014

**Description**: Create interpolation layer for 100% chunk recovery guarantee.

**Implementation Details**:
- Add anchorInterpolation() function
- Use matched chunks as anchors
- Interpolate positions for unmatched chunks
- Always return results (100% guarantee)

**Acceptance Criteria**:
```gherkin
Scenario: Between neighbors interpolation
  Given unmatched chunk with before/after matches
  When interpolation runs
  Then position is calculated by ratio
  And confidence is 'synthetic'
  And method is 'interpolation'

Scenario: After last chunk
  Given unmatched chunk after all matches
  When interpolation runs
  Then position appends after last
  And appropriate gap is added

Scenario: Before first chunk
  Given unmatched chunk before all matches
  When interpolation runs
  Then position is set before first
  And bounds are adjusted

Scenario: No anchors fallback
  Given no matched chunks as anchors
  When interpolation runs
  Then original offsets are used
  And chunk is still marked synthetic
```

**Checklist**:
- [ ] Anchor sorting by index
- [ ] Ratio calculation logic
- [ ] Position interpolation
- [ ] Edge case handling (first/last)
- [ ] No-anchor fallback
- [ ] Bounds validation
- [ ] Always returns results
- [ ] Confidence always 'synthetic'

---

#### Task T-014: Orchestrate 5-Layer Matching
**Priority**: Critical
**Effort**: M (4-6 hours)
**Dependencies**: T-010, T-011, T-012, T-013
**Blocks**: T-015

**Description**: Create main orchestration function for 5-layer matching system.

**Implementation Details**:
- Create bulletproofMatch() main function
- Call layers 1-4 in sequence with early exit
- Track statistics for each layer
- Generate warnings for synthetic chunks

**Acceptance Criteria**:
```gherkin
Scenario: Layer 1 success
  Given all chunks match in Layer 1
  When bulletproofMatch() runs
  Then only Layer 1 executes
  And results are returned immediately
  And stats show 100% exact/high

Scenario: Progressive matching
  Given chunks fail Layer 1
  When subsequent layers run
  Then unmatched chunks progress through layers
  And matched chunks are accumulated
  And early exit happens when all matched

Scenario: 100% recovery guarantee
  Given some chunks remain unmatched
  When Layer 4 (interpolation) runs
  Then all chunks have positions
  And synthetic chunks have warnings
  And total matches equals input count

Scenario: Statistics tracking
  Given matching completes
  When stats are calculated
  Then counts by confidence level are accurate
  And layer success rates are recorded
```

**Checklist**:
- [ ] Layer 1-4 sequential calls
- [ ] Early exit optimization
- [ ] Results accumulation
- [ ] Unmatched tracking
- [ ] Statistics calculation
- [ ] Warning generation
- [ ] 100% recovery verification
- [ ] Performance logging

---

#### Task T-015: Integrate Matching into Processor
**Priority**: Critical
**Effort**: S (3-4 hours)
**Dependencies**: T-001, T-007, T-009, T-014
**Blocks**: T-018, T-020

**Description**: Integrate bulletproof matching into PDF processor pipeline.

**Implementation Details**:
- Add matching after AI cleanup stage (70-75%)
- Preserve Docling metadata through matching
- Add confidence tracking to chunks
- Store warnings in job metadata

**Acceptance Criteria**:
```gherkin
Scenario: Matching stage execution
  Given AI cleanup completes
  When Stage 6 runs
  Then bulletproofMatch() is called
  And progress updates from 70% to 75%

Scenario: Metadata preservation
  Given Docling chunks with metadata
  When matching completes
  Then page numbers are preserved
  And heading paths are maintained
  And bboxes are retained

Scenario: Confidence tracking
  Given matched chunks
  When final chunks are created
  Then position_confidence is set
  And position_method is recorded
  And warnings are stored
```

**Checklist**:
- [ ] Stage 6 implementation (70-75%)
- [ ] bulletproofMatch() integration
- [ ] Metadata preservation logic
- [ ] Confidence field mapping
- [ ] Warning storage in metadata
- [ ] Progress tracking
- [ ] Console logging of stats

---

### Phase 5: Metadata Enrichment with PydanticAI

#### Task T-016: Create PydanticAI Python Script
**Priority**: High
**Effort**: M (4-6 hours)
**Dependencies**: T-002, T-003
**Blocks**: T-017, T-018

**Description**: Create Python script for structured metadata extraction using PydanticAI.

**Implementation Details**:
- Create `worker/scripts/extract_metadata_pydantic.py`
- Define ChunkMetadata schema with Pydantic BaseModel
- Implement Agent with retries and validation
- Handle batch processing via stdin/stdout

**Acceptance Criteria**:
```gherkin
Scenario: Schema validation
  Given ChunkMetadata BaseModel
  When agent extracts metadata
  Then all fields are validated
  And invalid data triggers retry
  And max 3 retries are attempted

Scenario: Batch processing
  Given chunks sent via stdin
  When processing each chunk
  Then metadata is extracted
  And JSON is written to stdout
  And stdout is flushed immediately

Scenario: Error handling
  Given extraction failure
  When retries are exhausted
  Then fallback metadata is returned
  And error is logged in response
```

**Checklist**:
- [ ] ChunkMetadata schema defined
- [ ] Field validators (min/max constraints)
- [ ] Agent with result_type configured
- [ ] Retry mechanism (max 3)
- [ ] stdin/stdout processing
- [ ] JSON serialization
- [ ] Fallback metadata function
- [ ] Error reporting

---

#### Task T-017: Create TypeScript Wrapper for PydanticAI
**Priority**: High
**Effort**: S (3-4 hours)
**Dependencies**: T-016
**Blocks**: T-018

**Description**: Create TypeScript wrapper for PydanticAI Python subprocess.

**Implementation Details**:
- Create `worker/lib/chunking/pydantic-metadata.ts`
- Follow docling-extractor.ts subprocess pattern
- Implement extractMetadataBatch() function
- Handle timeouts and validation failures

**Acceptance Criteria**:
```gherkin
Scenario: Subprocess communication
  Given chunks to process
  When extractMetadataBatch() is called
  Then Python subprocess is spawned
  And chunks are piped via stdin
  And results are read from stdout

Scenario: Result mapping
  Given Python returns metadata
  When processing results
  Then Map<chunk_id, metadata> is created
  And all chunks have metadata

Scenario: Error recovery
  Given subprocess timeout
  When error occurs
  Then subprocess is terminated
  And error is propagated
```

**Checklist**:
- [ ] Subprocess spawn logic
- [ ] stdin writing for chunks
- [ ] stdout reading for results
- [ ] JSON parsing
- [ ] Map creation for results
- [ ] Timeout handling
- [ ] Error propagation
- [ ] Subprocess cleanup

---

#### Task T-018: Integrate Metadata Extraction into Processor
**Priority**: High
**Effort**: S (2-3 hours)
**Dependencies**: T-015, T-016, T-017
**Blocks**: T-020

**Description**: Add metadata extraction stage to PDF processor.

**Implementation Details**:
- Add Stage 7 after matching (75-90%)
- Batch process chunks (10 at a time)
- Merge metadata into chunk objects
- Track progress through batches

**Acceptance Criteria**:
```gherkin
Scenario: Metadata extraction stage
  Given matched chunks
  When Stage 7 runs
  Then metadata is extracted in batches
  And progress updates from 75% to 90%

Scenario: Batch processing
  Given 100 chunks to process
  When extraction runs
  Then chunks are processed in batches of 10
  And progress updates per batch

Scenario: Metadata merging
  Given extracted metadata
  When chunks are enriched
  Then all metadata fields are added
  And original chunk data is preserved
```

**Checklist**:
- [ ] Stage 7 implementation (75-90%)
- [ ] Batch size configuration (10)
- [ ] Batch iteration logic
- [ ] Metadata merging
- [ ] Progress calculation
- [ ] Field mapping (themes, concepts, etc.)
- [ ] Error handling per batch

---

### Phase 6: Local Embeddings

#### Task T-019: Implement Local Embeddings with Transformers.js
**Priority**: High
**Effort**: M (4-6 hours)
**Dependencies**: T-002
**Blocks**: T-020

**Description**: Create local embeddings generation using Transformers.js.

**Implementation Details**:
- Create `worker/lib/local/embeddings-local.ts`
- Implement generateEmbeddingsBatch() function
- Configure pooling and normalization
- Cache pipeline for reuse

**Acceptance Criteria**:
```gherkin
Scenario: Pipeline initialization
  Given first call to generate embeddings
  When pipeline is created
  Then model is loaded once
  And cached for subsequent calls

Scenario: Embedding generation
  Given text chunks
  When generateEmbeddingsBatch() is called
  Then 768-dimensional vectors are returned
  And vectors are normalized
  And pooling is 'mean'

Scenario: Batch processing
  Given 100 chunks
  When embeddings are generated
  Then all are processed efficiently
  And memory usage is managed
```

**Checklist**:
- [ ] Pipeline caching logic
- [ ] Model loading (all-mpnet-base-v2)
- [ ] Pooling configuration
- [ ] Normalization enabled
- [ ] Tensor to array conversion
- [ ] Batch processing support
- [ ] Memory management

---

#### Task T-020: Integrate Embeddings into Processor
**Priority**: High
**Effort**: S (2-3 hours)
**Dependencies**: T-015, T-018, T-019
**Blocks**: T-026

**Description**: Add local embeddings generation to PDF processor.

**Implementation Details**:
- Add Stage 8 after metadata (90-95%)
- Check for local mode and use Transformers.js
- Fallback to Gemini if local fails
- Attach embeddings to chunks

**Acceptance Criteria**:
```gherkin
Scenario: Local embeddings selection
  Given PROCESSING_MODE=local
  When Stage 8 runs
  Then Transformers.js embeddings are used
  And progress updates from 90% to 95%

Scenario: Fallback to Gemini
  Given local embeddings fail
  When error occurs
  Then warning is logged
  And Gemini embeddings are used instead

Scenario: Embedding attachment
  Given generated embeddings
  When processing completes
  Then each chunk has embedding array
  And dimensions are 768
```

**Checklist**:
- [ ] Stage 8 implementation (90-95%)
- [ ] Local mode check
- [ ] generateEmbeddingsBatch() call
- [ ] Error handling with fallback
- [ ] Embedding attachment to chunks
- [ ] Progress tracking
- [ ] Dimension verification

---

### Phase 7: Review Checkpoints

#### Task T-021: Add Docling Extraction Review Checkpoint
**Priority**: Medium
**Effort**: M (4-6 hours)
**Dependencies**: T-008, T-009
**Blocks**: T-022

**Description**: Implement review checkpoint after Docling extraction.

**Implementation Details**:
- Add checkpoint after regex cleanup (55%)
- Check reviewDoclingExtraction flag
- Export to Obsidian for review
- Set awaiting_manual_review status

**Acceptance Criteria**:
```gherkin
Scenario: Review checkpoint trigger
  Given reviewDoclingExtraction is true
  When Stage 3 completes
  Then pipeline pauses
  And status is 'awaiting_manual_review'
  And review_stage is 'docling_extraction'

Scenario: Obsidian export
  Given checkpoint is triggered
  When export runs
  Then markdown is saved to Obsidian
  And obsidian_path is updated in database

Scenario: Partial result return
  Given review checkpoint active
  When process() returns
  Then markdown is included
  And chunks array is empty
  And metadata indicates review needed
```

**Checklist**:
- [ ] Flag check implementation
- [ ] Obsidian export integration
- [ ] Status update to database
- [ ] Review stage setting
- [ ] Partial result structure
- [ ] Console logging
- [ ] Path tracking

---

#### Task T-022: Handle Resume from Docling Review
**Priority**: Medium
**Effort**: S (3-4 hours)
**Dependencies**: T-021
**Blocks**: T-026

**Description**: Implement resume logic for continuing after Docling review.

**Implementation Details**:
- Modify `worker/handlers/continue-processing.ts`
- Add case for 'docling_extraction' review stage
- Sync edited markdown from Obsidian
- Continue with or skip AI cleanup based on flag

**Acceptance Criteria**:
```gherkin
Scenario: Resume from review
  Given review_stage is 'docling_extraction'
  When continue-processing runs
  Then markdown is synced from Obsidian
  And changes are detected

Scenario: AI cleanup decision
  Given user edited markdown
  When cleanMarkdown flag is checked
  Then either AI cleanup runs
  Or processing skips to chunking

Scenario: State preservation
  Given resume from checkpoint
  When processing continues
  Then job metadata is preserved
  And progress resumes correctly
```

**Checklist**:
- [ ] Review stage case added
- [ ] Obsidian sync integration
- [ ] Change detection logic
- [ ] AI cleanup conditional
- [ ] Direct to chunking path
- [ ] Metadata preservation
- [ ] Progress continuation

---

### Phase 8: Confidence UI

#### Task T-023: Create Chunk Quality Panel Component
**Priority**: Medium
**Effort**: M (6-8 hours)
**Dependencies**: None
**Blocks**: T-024, T-025

**Description**: Create React component for chunk quality visualization and validation.

**Implementation Details**:
- Create `src/components/sidebar/ChunkQualityPanel.tsx`
- Mirror AnnotationReviewTab.tsx structure
- Use shadcn/ui components (Accordion, Button, Badge)
- Display statistics and synthetic chunk list

**Acceptance Criteria**:
```gherkin
Scenario: Statistics display
  Given document with chunks
  When panel renders
  Then exact count is shown
  And high/medium/synthetic counts display
  And percentages are calculated

Scenario: Synthetic chunk list
  Given synthetic chunks exist
  When accordion expands
  Then chunk details are shown
  And validation buttons are available
  And preview text is displayed

Scenario: Validation action
  Given synthetic chunk
  When user clicks validate
  Then chunk is marked as validated
  And UI updates immediately
```

**Checklist**:
- [ ] Component structure created
- [ ] Statistics cards implemented
- [ ] Accordion for chunk list
- [ ] Badge components for status
- [ ] Validation button handlers
- [ ] Show in document action
- [ ] Data fetching hooks
- [ ] Loading states

---

#### Task T-024: Add Chunk Quality Tab to Sidebar
**Priority**: Low
**Effort**: S (2-3 hours)
**Dependencies**: T-023
**Blocks**: T-025

**Description**: Integrate quality panel into existing sidebar structure.

**Implementation Details**:
- Modify sidebar component
- Add new "Quality" tab with icon
- Import ChunkQualityPanel component
- Follow existing tab pattern

**Acceptance Criteria**:
```gherkin
Scenario: Tab addition
  Given sidebar with existing tabs
  When Quality tab is added
  Then it appears after Annotations
  And uses CheckCircle icon

Scenario: Tab switching
  Given Quality tab selected
  When tab content renders
  Then ChunkQualityPanel is shown
  And document ID is passed correctly
```

**Checklist**:
- [ ] Tab structure added
- [ ] Icon imported and used
- [ ] Component import added
- [ ] Props passed correctly
- [ ] Tab switching works
- [ ] Styling consistent

---

#### Task T-025: Add Inline Confidence Tooltips
**Priority**: Low
**Effort**: M (4-6 hours)
**Dependencies**: T-001, T-023, T-024
**Blocks**: T-026

**Description**: Add confidence indicators and tooltips to document reader.

**Implementation Details**:
- Modify document reader component
- Add data-chunk-id attributes to spans
- Show warning icon for synthetic chunks
- Display tooltip on hover with metadata

**Acceptance Criteria**:
```gherkin
Scenario: Synthetic chunk indicator
  Given synthetic chunk in document
  When chunk renders
  Then warning icon appears inline
  And icon color is yellow

Scenario: Tooltip display
  Given user hovers on indicator
  When tooltip appears
  Then confidence level is shown
  And matching method is displayed
  And page number is included

Scenario: Non-intrusive display
  Given normal reading flow
  When confidence is exact/high
  Then no indicators are shown
  And reading is not interrupted
```

**Checklist**:
- [ ] Chunk wrapper component created
- [ ] data-chunk-id attributes added
- [ ] Warning icon for synthetic
- [ ] Tooltip component integration
- [ ] Tooltip content structure
- [ ] Hover detection logic
- [ ] Styling for indicators

---

### Phase 9: Testing & Validation

#### Task T-026: Create Integration Tests
**Priority**: High
**Effort**: L (1-2 days)
**Dependencies**: T-020, T-022, T-025
**Blocks**: T-027

**Description**: Create comprehensive integration test suite for local pipeline.

**Implementation Details**:
- Create `worker/tests/integration/local-processing.test.ts`
- Test all 5 layers of matching
- Mock Ollama and Python subprocesses
- Use test fixtures for validation

**Acceptance Criteria**:
```gherkin
Scenario: Docling extraction test
  Given test PDF buffer
  When extraction runs with chunking
  Then chunks have metadata
  And structure is extracted

Scenario: 100% recovery test
  Given Docling chunks
  When bulletproof matching runs
  Then all chunks are matched
  And synthetic rate is <5%

Scenario: OOM handling test
  Given mocked OOM error
  When Ollama cleanup runs
  Then error is handled gracefully
  And review flag is set

Scenario: End-to-end test
  Given complete pipeline
  When processing test document
  Then all stages complete
  And chunks have all metadata
```

**Checklist**:
- [ ] Test file structure created
- [ ] Docling extraction tests
- [ ] All 5 matching layers tested
- [ ] PydanticAI metadata tests
- [ ] Transformers.js embedding tests
- [ ] Ollama mocking with MSW
- [ ] Python subprocess mocking
- [ ] OOM scenario coverage
- [ ] Performance assertions

---

#### Task T-027: Run Validation Commands
**Priority**: Critical
**Effort**: S (2-4 hours)
**Dependencies**: T-026
**Blocks**: T-028

**Description**: Execute full validation suite and fix any issues.

**Implementation Details**:
- Run integration tests in worker
- Run metadata validation
- Run E2E tests
- Verify build succeeds

**Acceptance Criteria**:
```gherkin
Scenario: Integration tests pass
  Given test suite is complete
  When npm run test:integration runs
  Then all tests pass
  And coverage is >80%

Scenario: Validation suite passes
  Given validation commands
  When validate:metadata runs
  Then metadata extraction is verified
  And quality metrics pass

Scenario: Build verification
  Given all code changes
  When npm run build executes
  Then build completes without errors
  And type checking passes
```

**Checklist**:
- [ ] Integration tests pass
- [ ] Metadata validation passes
- [ ] E2E tests pass
- [ ] Linting passes
- [ ] Type checking passes
- [ ] Build succeeds
- [ ] No console errors

---

### Phase 10: Documentation & Cleanup

#### Task T-028: Update Environment Variables Documentation
**Priority**: Low
**Effort**: S (1-2 hours)
**Dependencies**: T-027
**Blocks**: T-029

**Description**: Document all new environment variables for local processing.

**Implementation Details**:
- Update .env.local.example
- Add PROCESSING_MODE variable
- Add Ollama configuration variables
- Document expected values

**Acceptance Criteria**:
```gherkin
Scenario: Environment documentation
  Given new variables needed
  When .env.local.example is updated
  Then all variables are listed
  And descriptions are clear
  And example values are provided
```

**Checklist**:
- [ ] PROCESSING_MODE documented
- [ ] OLLAMA_HOST documented
- [ ] OLLAMA_MODEL documented
- [ ] OLLAMA_TIMEOUT documented
- [ ] Comments explain usage
- [ ] Example values provided

---

#### Task T-029: Create Setup Instructions
**Priority**: Medium
**Effort**: S (3-4 hours)
**Dependencies**: T-028
**Blocks**: T-030

**Description**: Create comprehensive setup guide for local pipeline.

**Implementation Details**:
- Create `docs/local-pipeline-setup.md`
- Document Python dependencies installation
- Document Ollama setup process
- Include troubleshooting section

**Acceptance Criteria**:
```gherkin
Scenario: Setup documentation
  Given new user
  When following setup guide
  Then all dependencies install correctly
  And Ollama model is configured
  And pipeline runs successfully

Scenario: Troubleshooting section
  Given common issues
  When problems occur
  Then troubleshooting steps are clear
  And solutions are provided
```

**Checklist**:
- [ ] Python setup instructions
- [ ] Ollama installation guide
- [ ] Model download instructions
- [ ] Environment configuration
- [ ] Testing instructions
- [ ] Troubleshooting section
- [ ] Common errors documented
- [ ] Performance tips included

---

#### Task T-030: Update CLAUDE.md
**Priority**: Low
**Effort**: S (1-2 hours)
**Dependencies**: T-029
**Blocks**: None

**Description**: Update main documentation with local pipeline information.

**Implementation Details**:
- Update CLAUDE.md with local processing section
- Add new validation commands
- Document memory requirements
- Reference bulletproof matching

**Acceptance Criteria**:
```gherkin
Scenario: Documentation update
  Given CLAUDE.md exists
  When local pipeline section is added
  Then feature is documented
  And commands are listed
  And requirements are clear
```

**Checklist**:
- [ ] Local pipeline section added
- [ ] New commands documented
- [ ] Memory requirements noted
- [ ] Matching guarantee explained
- [ ] References to setup guide
- [ ] Version requirements updated

---

## Implementation Recommendations

### Suggested Team Structure
- **Lead Developer**: Focus on core infrastructure and matching system (T-001 to T-015)
- **Integration Developer**: Handle Python/Node.js integration (T-005, T-006, T-016, T-017)
- **UI Developer**: Build confidence UI components (T-023 to T-025)
- **QA Engineer**: Testing and validation (T-026, T-027)

### Optimal Task Sequencing

**Week 1 (Days 1-5)**:
1. Start with infrastructure setup (T-001 to T-004) - Critical path
2. Parallel: Begin Docling integration (T-005, T-006)
3. Complete PDF processor updates (T-007)

**Week 2 (Days 6-10)**:
1. Implement Ollama cleanup (T-008, T-009)
2. Focus on matching layers (T-010 to T-014) - Most complex
3. Integrate matching into processor (T-015)

**Week 3 (Days 11-15)**:
1. Metadata extraction with PydanticAI (T-016 to T-018)
2. Local embeddings (T-019, T-020)
3. Review checkpoints (T-021, T-022)

**Week 4 (Days 16-21)**:
1. UI components in parallel (T-023 to T-025)
2. Comprehensive testing (T-026, T-027)
3. Documentation and cleanup (T-028 to T-030)

### Parallelization Opportunities

**Can be done in parallel**:
- UI components (T-023 to T-025) while backend work continues
- Python scripts (T-005, T-016) while TypeScript wrappers are built
- Documentation (T-028 to T-030) during testing phase

**Must be sequential**:
- Infrastructure → Integration → Testing
- Each matching layer builds on previous
- Review checkpoints need base functionality

### Resource Allocation Suggestions
- Allocate most experienced developer to bulletproof matching (T-010 to T-014)
- Python expertise needed for T-005, T-016
- UI/React expertise for T-023 to T-025
- DevOps skills helpful for T-001 to T-003

---

## Critical Path Analysis

### Tasks on Critical Path
The following tasks block the most downstream work and determine minimum project duration:

1. **T-001** (Database Migration) → Blocks 4 tasks
2. **T-002** (Dependencies) → Blocks 5 tasks
3. **T-003** (Ollama Setup) → Blocks 4 tasks
4. **T-014** (5-Layer Orchestration) → Blocks T-015
5. **T-015** (Processor Integration) → Blocks 3 tasks
6. **T-026** (Integration Tests) → Blocks validation

### Potential Bottlenecks

**Technical Bottlenecks**:
- Python-Node.js IPC communication (T-005, T-006, T-016, T-017)
- Memory management with Qwen 32B (T-008, T-009)
- 5-layer matching complexity (T-010 to T-014)

**Resource Bottlenecks**:
- Single Python expert for multiple scripts
- Testing requires full pipeline completion
- UI work blocked until backend provides data

### Schedule Optimization Suggestions

1. **Front-load critical path tasks**: Complete T-001 to T-004 immediately
2. **Parallel Python development**: Have Python scripts ready before TypeScript wrappers
3. **Incremental testing**: Test each matching layer independently
4. **Mock data for UI**: Start UI development with mock data
5. **Documentation in parallel**: Begin documentation during implementation

**Minimum Duration**: 15 days (with parallel execution)
**Recommended Duration**: 21 days (with buffer for complexity)
**Conservative Duration**: 28 days (with testing and iteration)

---

## Risk Assessment

### High-Risk Areas
1. **Bulletproof Matching Layers 2-4**: Most complex, may need debugging
2. **Python-Node IPC**: Edge cases with subprocess communication
3. **Qwen 32B OOM**: Graceful degradation critical
4. **Tokenizer Alignment**: Must match between chunker and embeddings

### Mitigation Strategies
1. Start with Layers 1-2 only, add 3-4 incrementally
2. Comprehensive subprocess error handling
3. Mock Python in tests to avoid flakiness
4. Extensive validation of tokenizer configuration

### Validation Checklist
- [ ] Database migration applied successfully
- [ ] Python dependencies installed
- [ ] Ollama running with Qwen 32B
- [ ] All integration tests pass
- [ ] No linting or type errors
- [ ] Build succeeds
- [ ] Manual test: 50-page PDF processes in <5 min
- [ ] Quality panel shows statistics
- [ ] Synthetic chunks have correct metadata
- [ ] OOM triggers review, not crash
- [ ] Logs show layer-by-layer progress
- [ ] Documentation complete

---

**Document Generated**: 2025-10-11
**Status**: Ready for Sprint Planning
**Confidence**: 8.5/10 - High confidence with identified risk areas