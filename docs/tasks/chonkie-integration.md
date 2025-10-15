# Chonkie Integration - Unified Processing Pipeline

**Source PRP**: [docs/prps/chonkie-integration.md](../prps/chonkie-integration.md)
**Feature Priority**: P0 (Critical - Architecture Simplification)
**Estimated Total Effort**: 3 weeks (15 days)
**Created**: 2025-10-15
**Status**: Ready for Implementation
**Confidence Score**: 9/10

---

## Overview

This task breakdown implements the Chonkie Integration system, eliminating 3 parallel chunking paths and replacing them with ONE unified Chonkie-based pipeline offering 9 user-selectable chunking strategies while maintaining metadata preservation and zero API costs.

### Key Architecture Change

**BEFORE** (3 Parallel Paths):
```
├─ Inline metadata (PDF only, experimental)
├─ Bulletproof matching (LOCAL mode, 5-layer recovery)
└─ Cloud chunking (CLOUD mode, Gemini)
```

**AFTER** (1 Unified Path):
```
Download → Docling Extract → Cleanup → Bulletproof (coord map) →
Review → Chonkie Chunk → Metadata Transfer → Enrich → Embed → Save
```

### Key Deliverables

1. **Python Wrapper** (`chonkie_chunk.py`) - 9 chunker types support
2. **TypeScript IPC** (`chonkie-chunker.ts`) - Subprocess wrapper with validation
3. **Metadata Transfer** (`metadata-transfer.ts`) - Overlap detection system
4. **Database Migration** (050) - Schema changes for chunker_type
5. **Processor Integration** - Unified pipeline in pdf-processor.ts and epub-processor.ts
6. **UI Components** - Chunker selection and quality panel updates

### Business Impact

- **Simplicity**: -223 lines net code (remove 823, add 600)
- **Flexibility**: 9 chunking strategies for different document types
- **Quality**: 15%+ connection quality improvement (semantic/neural chunkers)
- **Cost**: $0 additional (all LOCAL mode processing)
- **Maintenance**: Single pipeline = easier debugging, testing, optimization

### Success Metrics

- **Overlap Coverage**: 70-90% (metadata transfer quality)
- **Metadata Recovery**: >90% (chunks with heading_path OR page_start)
- **Performance**: token (3 min), recursive (5 min), semantic (15 min), neural (25 min)
- **Net Code Reduction**: -223 lines
- **Test Coverage**: >90% for new Chonkie modules

---

## Week 1: Infrastructure Setup (Days 1-5)

### T-001: Python Wrapper - Chonkie Multi-Strategy Chunker

**Priority**: Critical
**Estimated Effort**: 10 hours (2 days)
**Dependencies**: None

#### Task Purpose

**As a** document processing pipeline
**I need** a Python script supporting 9 Chonkie chunker types
**So that** users can choose optimal chunking strategies for their documents

#### Technical Requirements

**Files to Create**:
```
worker/scripts/chonkie_chunk.py - Python wrapper supporting all 9 chunker types
```

**Functional Requirements**:
- REQ-1: When receiving stdin JSON, the system shall parse markdown and config
- REQ-2: When chunker_type is specified, the system shall initialize appropriate Chonkie chunker
- REQ-3: When chunking completes, the system shall output JSON with character offsets (start_index, end_index)
- REQ-4: When errors occur, the system shall write to stderr and exit with code 1
- REQ-5: After JSON output, the system shall flush stdout to prevent IPC hangs

**Supported Chunker Types**:
1. **token**: TokenChunker - Fixed-size chunks (fastest, 2-3 min)
2. **sentence**: SentenceChunker - Sentence boundaries (3-4 min)
3. **recursive**: RecursiveChunker - Hierarchical splitting (default, 3-5 min)
4. **semantic**: SemanticChunker - Topic-based boundaries (8-15 min)
5. **late**: LateChunker - Contextual embeddings (10-20 min)
6. **code**: CodeChunker - AST-aware code splitting (5-10 min)
7. **neural**: NeuralChunker - BERT-based semantic shifts (15-25 min)
8. **slumber**: SlumberChunker - Agentic LLM-powered (30-60 min)
9. **table**: TableChunker - Markdown table splitting (3-5 min)

**Implementation Steps**:

1. **Install Chonkie**:
   ```bash
   cd worker
   pip install chonkie  # Basic installation (15 MiB)
   pip install "chonkie[semantic]"  # For semantic/late (adds 62 MiB)
   pip install "chonkie[neural]"    # For neural (adds BERT models)
   pip install "chonkie[code]"      # For code (adds tree-sitter)
   # Note: Don't install [all] unless needed (680 MiB)
   ```

2. **Create `chonkie_chunk.py`** (PRP lines 255-393):
   - Import all 9 chunker classes from chonkie package
   - Create CHUNKERS dictionary mapping types to classes
   - Implement main() function with stdin JSON parsing
   - Add chunker-specific configuration logic
   - Output JSON array with guaranteed character offsets
   - **CRITICAL**: Add `sys.stdout.flush()` after JSON write to prevent IPC hangs

3. **Chunker-Specific Configuration**:
   - **recursive**: Support RecursiveRules, recipe ("markdown", "default")
   - **semantic/late**: Support embedding_model (default: "all-MiniLM-L6-v2"), threshold/mode
   - **neural**: Support model (default: "mirth/chonky_modernbert_base_1")
   - **slumber**: Support genie ("gemini" or "openai")
   - **code**: Support language ("python", "javascript", etc.), include_nodes
   - **sentence**: Support min_sentences_per_chunk

4. **Output Format** (guaranteed fields):
   ```python
   {
     "text": chunk.text,
     "start_index": chunk.start_index,  # Character offset in markdown
     "end_index": chunk.end_index,      # Character offset in markdown
     "token_count": chunk.token_count,
     "chunker_type": chunker_type
   }
   ```

5. **Error Handling**:
   - Catch all exceptions with full stack traces to stderr
   - Exit with code 1 on any error
   - Validate chunker_type against CHUNKERS dict

**Code Patterns to Follow**:
- **Python IPC Pattern**: `worker/scripts/docling_extract.py` - stdin/stdout JSON pattern
- **Flush Pattern**: `worker/scripts/extract_metadata_pydantic.py` - sys.stdout.flush() after JSON write
- **Error Handling**: Print stack trace to stderr, exit(1) on errors

#### Acceptance Criteria

**Given-When-Then Scenarios**:
```gherkin
Scenario 1: Recursive chunker (default)
  Given a markdown document with 10,000 characters
  When chonkie_chunk.py receives {"markdown": doc, "config": {"chunker_type": "recursive", "chunk_size": 512}}
  Then it should output JSON array of chunks
  And each chunk should have start_index, end_index, text, token_count fields
  And text should equal markdown.slice(start_index, end_index)
  And token_count should be <= 512
  And chunker_type should be "recursive"

Scenario 2: Semantic chunker with custom threshold
  Given a narrative document
  When chunker_type is "semantic" with threshold 0.7
  Then chunks should align with topic shifts
  And chunk boundaries should respect semantic coherence
  And processing time should be 8-15 minutes for 500-page doc

Scenario 3: Character offset validation
  Given any chunker type
  When chunks are generated
  Then markdown[chunk.start_index:chunk.end_index] MUST equal chunk.text
  And offsets must be valid character positions (not byte offsets)

Scenario 4: Error handling
  Given an invalid chunker_type "invalid"
  When the script runs
  Then it should write error to stderr
  And exit with code 1
  And stdout should be empty

Scenario 5: stdout.flush() prevents IPC hang
  Given successful chunking
  When JSON is printed to stdout
  Then sys.stdout.flush() should be called immediately after
  And the process should exit with code 0
  And the parent TypeScript process should receive complete output
```

**Rule-Based Criteria**:
- [ ] **Functional**: All 9 chunker types work correctly
- [ ] **Character Offsets**: start_index/end_index guaranteed accurate for metadata transfer
- [ ] **Configuration**: Chunker-specific config properly handled (rules, threshold, model, etc.)
- [ ] **Error Handling**: All errors logged to stderr, exit code 1
- [ ] **IPC Safety**: sys.stdout.flush() after JSON write
- [ ] **Performance**: Token/sentence/recursive < 5 min, semantic < 15 min, neural < 25 min (500 pages)
- [ ] **Documentation**: JSDoc-style comments explaining each chunker's use case

#### Validation Commands

```bash
# Install Chonkie
cd worker
pip install chonkie "chonkie[semantic]" "chonkie[neural]"

# Verify installation
python3 -c "from chonkie import RecursiveChunker; print('OK')"

# Test script manually
echo '{"markdown": "# Test\n\nParagraph 1.\n\nParagraph 2.", "config": {"chunker_type": "recursive", "chunk_size": 512}}' | python3 scripts/chonkie_chunk.py

# Expected output (JSON array with chunks)
# Verify each chunk has: text, start_index, end_index, token_count, chunker_type

# Test all chunker types
for chunker in token sentence recursive semantic; do
  echo "Testing $chunker..."
  echo '{"markdown": "Test content", "config": {"chunker_type": "'$chunker'"}}' | python3 scripts/chonkie_chunk.py
done

# Test character offset validation
python3 -c "
import json
import sys
sys.path.append('scripts')
from chonkie_chunk import main
# Verify offsets match content
"
```

#### Resources & References

**Documentation**:
- **Chonkie Docs**: https://docs.chonkie.ai/oss/chunkers/overview - Complete API reference
- **Chonkie GitHub**: https://github.com/chonkie-inc/chonkie - Source code and examples
- **Chonkie PyPI**: https://pypi.org/project/chonkie/ - Installation instructions

**Code References**:
- Python IPC: `worker/scripts/docling_extract.py:1-50` - stdin/stdout pattern
- Flush pattern: `worker/scripts/extract_metadata_pydantic.py:82` - sys.stdout.flush()

---

### T-002: TypeScript IPC Wrapper - Chonkie Chunker

**Priority**: Critical
**Estimated Effort**: 8 hours (1 day)
**Dependencies**: T-001 (Python wrapper must exist)

#### Task Purpose

**As a** TypeScript processor
**I need** a type-safe IPC wrapper for the Python Chonkie script
**So that** I can chunk documents from Node.js with proper error handling

#### Technical Requirements

**Files to Create**:
```
worker/lib/chonkie/chonkie-chunker.ts - TypeScript subprocess wrapper
worker/lib/chonkie/types.ts - TypeScript type definitions
```

**Functional Requirements**:
- REQ-1: When chunkWithChonkie is called, the system shall spawn Python subprocess
- REQ-2: When subprocess outputs JSON, the system shall parse and validate chunk offsets
- REQ-3: When subprocess times out, the system shall kill process and throw descriptive error
- REQ-4: When character offsets mismatch content, the system shall throw error (critical failure)
- REQ-5: When chunker type is specified, the system shall apply dynamic timeout based on speed

**Implementation Steps**:

1. **Create `types.ts`** (PRP lines 556-603):
   ```typescript
   export type ChonkieStrategy =
     | 'token' | 'sentence' | 'recursive' | 'semantic'
     | 'late' | 'code' | 'neural' | 'slumber' | 'table'

   export interface ChonkieConfig {
     chunker_type: ChonkieStrategy
     chunk_size?: number  // Default: 512 (768 optional)
     tokenizer?: string   // Default: "gpt2"
     // Chunker-specific config fields
     timeout?: number  // Milliseconds
   }

   export interface ChonkieChunk {
     text: string
     start_index: number  // Character offset
     end_index: number    // Character offset
     token_count: number
     chunker_type: ChonkieStrategy
   }

   export type ChunkerType =
     | 'hybrid'  // Old HybridChunker (deprecated)
     | ChonkieStrategy

   export interface ChunkMetadata {
     heading_path: string[] | null
     page_start: number | null
     page_end: number | null
     section_marker: string | null
     bboxes: any[] | null
     metadata_overlap_count: number
     metadata_confidence: 'high' | 'medium' | 'low'
     metadata_interpolated: boolean
   }
   ```

2. **Create `chonkie-chunker.ts`** (PRP lines 397-553):
   - Import spawn from 'child_process'
   - Implement `chunkWithChonkie(markdown, config)` async function
   - Calculate dynamic timeout based on chunker_type and document size
   - Spawn Python subprocess with scriptPath
   - Implement timeout with process.kill()
   - Parse stdout JSON, validate stderr for errors
   - **CRITICAL**: Validate character offsets match content

3. **Dynamic Timeout Logic**:
   ```typescript
   const baseTimeout = {
     token: 60000,      // 1 minute
     sentence: 60000,
     recursive: 90000,  // 1.5 minutes
     semantic: 300000,  // 5 minutes
     late: 600000,      // 10 minutes
     code: 180000,      // 3 minutes
     neural: 900000,    // 15 minutes
     slumber: 1800000,  // 30 minutes
     table: 90000
   }[config.chunker_type] || 300000

   // Scale with document size (1 min per 100k chars)
   const docSizeMultiplier = Math.max(1, Math.ceil(markdown.length / 100000))
   const timeout = config.timeout || (baseTimeout * docSizeMultiplier)
   ```

4. **Character Offset Validation** (CRITICAL):
   ```typescript
   for (const chunk of chunks) {
     const extracted = cleanedMarkdown.slice(chunk.start_index, chunk.end_index)
     if (extracted !== chunk.text) {
       console.error(`[Chonkie] Offset mismatch:\n` +
         `  Expected: "${chunk.text.slice(0, 50)}..."\n` +
         `  Got: "${extracted.slice(0, 50)}..."\n` +
         `  Offsets: [${chunk.start_index}, ${chunk.end_index})`)
       throw new Error('Character offset mismatch - metadata transfer will fail')
     }
   }
   ```

5. **Error Handling**:
   - Timeout: Kill process, throw with timeout message and document size
   - Non-zero exit code: Throw with stderr content and exit code
   - JSON parse error: Throw with partial stdout for debugging
   - Offset mismatch: Throw immediately (critical - metadata transfer depends on this)

**Code Patterns to Follow**:
- **Subprocess Pattern**: `worker/lib/local/ollama-cleanup.ts:50-120` - Timeout + error handling
- **IPC Pattern**: `worker/lib/docling-extractor.ts:80-150` - Python subprocess communication
- **Validation**: `worker/lib/local/bulletproof-matcher.ts:862-891` - Offset validation logic

#### Acceptance Criteria

**Given-When-Then Scenarios**:
```gherkin
Scenario 1: Successful chunking with recursive
  Given a 50-page PDF's cleaned markdown
  When chunkWithChonkie is called with chunker_type "recursive"
  Then it should return array of ChonkieChunk objects
  And each chunk's character offsets should match content
  And processing should complete within 90 seconds * doc_size_multiplier
  And console should log "Chonkie recursive created X chunks"

Scenario 2: Timeout handling for slow chunker
  Given a large document and neural chunker
  When processing exceeds calculated timeout
  Then the Python process should be killed
  And an error should be thrown with timeout message
  And error should include document size and suggest faster chunker

Scenario 3: Character offset validation failure
  Given a chunk with mismatched offsets (bug in Chonkie)
  When validation runs
  Then an error should be thrown immediately
  And error message should show expected vs actual content
  And processing should not continue (critical failure)

Scenario 4: Python script error
  Given an invalid configuration (e.g., unknown chunker_type)
  When Python script exits with code 1
  Then TypeScript should catch the error
  And error should include stderr content
  And error should include partial stdout for debugging

Scenario 5: Dynamic timeout scaling
  Given a 200,000 character document (2x multiplier)
  When using recursive chunker (base 90 seconds)
  Then timeout should be 180 seconds
  And timeout should be logged for monitoring
```

**Rule-Based Criteria**:
- [ ] **Functional**: Successfully chunks documents with all 9 chunker types
- [ ] **Type Safety**: All inputs/outputs properly typed (no `any`)
- [ ] **Error Handling**: Timeout, exit code, parse errors handled with descriptive messages
- [ ] **Validation**: Character offset mismatches detected and thrown
- [ ] **Performance**: Dynamic timeout prevents premature kills on large docs
- [ ] **Logging**: Console logs for chunker type, chunk count, warnings
- [ ] **IPC Safety**: Handles subprocess communication edge cases (empty stdout, stderr warnings)

#### Validation Commands

```bash
# Unit tests (mock subprocess)
cd worker
npx jest lib/chonkie/__tests__/chonkie-chunker.test.ts

# Type checking
npx tsc --noEmit lib/chonkie/chonkie-chunker.ts

# Integration test with real subprocess
npx tsx lib/chonkie/__tests__/integration-test.ts

# Manual testing
node -e "
import { chunkWithChonkie } from './lib/chonkie/chonkie-chunker.js'
const markdown = '# Test\n\nParagraph 1.\n\nParagraph 2.'
const chunks = await chunkWithChonkie(markdown, { chunker_type: 'recursive' })
console.log(chunks)
"
```

#### Resources & References

**Documentation**:
- Node.js child_process: https://nodejs.org/api/child_process.html
- Chonkie character offsets: https://docs.chonkie.ai/oss/chunkers/overview#character-offsets

**Code References**:
- Subprocess wrapper: `worker/lib/local/ollama-cleanup.ts:50-120`
- Timeout handling: `worker/lib/docling-extractor.ts:100-130`
- Character offset validation: `worker/lib/local/bulletproof-matcher.ts:862-891`

---

### T-003: Metadata Transfer System - Overlap Detection

**Priority**: Critical
**Estimated Effort**: 12 hours (1.5 days)
**Dependencies**: T-002 (needs ChonkieChunk type)

#### Task Purpose

**As a** chunking pipeline
**I need** to transfer Docling metadata (headings, pages, bboxes) to Chonkie chunks
**So that** chunks have structural metadata for citations and navigation

#### Technical Requirements

**Files to Create**:
```
worker/lib/chonkie/metadata-transfer.ts - Overlap detection and metadata aggregation
```

**Functional Requirements**:
- REQ-1: When Chonkie chunk is created, the system shall find all overlapping Docling chunks
- REQ-2: When overlaps exist, the system shall aggregate metadata (heading_path union, page range, bbox concat)
- REQ-3: When 3+ overlaps OR >70% coverage, the system shall assign 'high' confidence
- REQ-4: When no overlaps exist, the system shall interpolate metadata from nearest neighbors
- REQ-5: When overlap coverage <70%, the system shall log warning

**Key Insight from PRP (lines 611-619)**:
> Overlaps are EXPECTED and BENEFICIAL. Multiple Docling chunks overlapping a Chonkie chunk is the PRIMARY MECHANISM for metadata transfer.
>
> **Why Overlaps Occur**:
> - Docling chunks: Structural boundaries (heading breaks, page breaks)
> - Chonkie chunks: Semantic boundaries (topic shifts, sentence groups)
> - Different boundaries = overlaps when both cover same content
>
> **Expected Overlap Rate**: 70-90% of Chonkie chunks have at least one Docling overlap. This is GOOD, not a bug.

**Implementation Steps**:

1. **Create overlap detection functions** (PRP lines 624-659):
   ```typescript
   export function hasOverlap(
     doclingChunk: MatchResult,
     chonkieChunk: ChonkieChunk
   ): boolean {
     return doclingChunk.start_offset < chonkieChunk.end_index &&
            doclingChunk.end_offset > chonkieChunk.start_index
   }

   export function calculateOverlapPercentage(
     doclingChunk: MatchResult,
     chonkieChunk: ChonkieChunk
   ): number {
     const overlapStart = Math.max(doclingChunk.start_offset, chonkieChunk.start_index)
     const overlapEnd = Math.min(doclingChunk.end_offset, chonkieChunk.end_index)
     const overlapSize = Math.max(0, overlapEnd - overlapStart)
     const chonkieSize = chonkieChunk.end_index - chonkieChunk.start_index
     return overlapSize / chonkieSize
   }
   ```

2. **Implement metadata aggregation** (PRP lines 662-720):
   - Union all heading_path arrays (unique headings)
   - Calculate page_start (earliest) and page_end (latest)
   - Concatenate all bounding boxes
   - Use first section_marker (for EPUBs)

3. **Implement confidence calculation** (PRP lines 723-749):
   ```typescript
   export function calculateConfidence(
     overlappingChunks: MatchResult[],
     maxOverlapPercentage: number
   ): 'high' | 'medium' | 'low' {
     if (overlappingChunks.length === 0) return 'low'

     // High: 3+ overlaps OR one strong overlap (>70%)
     if (overlappingChunks.length >= 3 || maxOverlapPercentage >= 0.7) {
       return 'high'
     }

     // Medium: 1-2 overlaps with decent coverage (>30%)
     if (maxOverlapPercentage >= 0.3) {
       return 'medium'
     }

     return 'low'
   }
   ```

4. **Implement interpolation for no-overlap cases** (PRP lines 752-797):
   - Find nearest Docling chunk before and after
   - Use 'before' metadata if available, else 'after'
   - Mark as interpolated: true

5. **Implement main transfer function** (PRP lines 800-916):
   ```typescript
   export async function transferMetadataToChonkieChunks(
     chonkieChunks: ChonkieChunk[],
     bulletproofMatches: MatchResult[],
     documentId: string
   ): Promise<ProcessedChunk[]>
   ```
   - Iterate through Chonkie chunks
   - Find overlapping Docling chunks for each
   - Aggregate metadata or interpolate
   - Calculate confidence
   - Build ProcessedChunk objects
   - Log statistics (overlap coverage, avg overlaps, interpolated count)
   - **Warn if overlap coverage <70%** (indicates matching issues)

6. **Statistics Logging**:
   ```typescript
   console.log(
     `[Metadata Transfer] Complete:\n` +
     `  Overlap coverage: ${overlapCoverage.toFixed(1)}% (X/Y chunks)\n` +
     `  Average overlaps per chunk: ${avgOverlaps.toFixed(2)}\n` +
     `  Interpolated chunks: ${noOverlapCount} (${percent}%)`
   )

   if (overlapCoverage < 70) {
     console.warn(
       `[Metadata Transfer] ⚠️  LOW OVERLAP COVERAGE: ${overlapCoverage.toFixed(1)}%\n` +
       `  Expected: >70% for successful metadata transfer\n` +
       `  Review ChunkQualityPanel for validation warnings.`
     )
   }
   ```

**Code Patterns to Follow**:
- **Overlap Logic**: `worker/lib/local/bulletproof-matcher.ts:862-891` - Reuse this exact pattern
- **Metadata Aggregation**: `worker/lib/chunking/bulletproof-metadata.ts:50-120` - Similar logic
- **Type Safety**: `worker/types/database.ts` - Consistent with existing types

#### Acceptance Criteria

**Given-When-Then Scenarios**:
```gherkin
Scenario 1: High confidence metadata transfer (3+ overlaps)
  Given a Chonkie chunk spanning 3 Docling chunks
  When transferMetadataToChonkieChunks runs
  Then the chunk should have metadata_overlap_count = 3
  And metadata_confidence should be 'high'
  And heading_path should be union of all 3 heading paths
  And page_start should be earliest page
  And page_end should be latest page
  And metadata_interpolated should be false

Scenario 2: High confidence metadata transfer (strong overlap)
  Given a Chonkie chunk with 1 Docling overlap covering 80%
  When metadata transfer runs
  Then metadata_confidence should be 'high'
  And metadata_overlap_count should be 1
  And metadata should come from that single Docling chunk

Scenario 3: Medium confidence (weak overlap)
  Given a Chonkie chunk with 1 Docling overlap covering 40%
  When metadata transfer runs
  Then metadata_confidence should be 'medium'
  And a warning should not be logged (acceptable quality)

Scenario 4: Low confidence with interpolation
  Given a Chonkie chunk with no Docling overlaps
  When metadata transfer runs
  Then metadata_interpolated should be true
  And metadata_confidence should be 'low'
  And metadata should come from nearest neighbor (before or after)
  And a warning should be logged for this chunk

Scenario 5: Overall overlap coverage validation
  Given 100 Chonkie chunks with 65 having Docling overlaps
  When metadata transfer completes
  Then overlap coverage should be 65%
  And a warning should be logged (below 70% threshold)
  And warning should suggest reviewing ChunkQualityPanel

Scenario 6: Successful processing (90% coverage)
  Given 100 Chonkie chunks with 90 having overlaps
  When metadata transfer completes
  Then no warnings should be logged
  And statistics should show 90% overlap coverage
  And average overlaps per chunk should be logged
```

**Rule-Based Criteria**:
- [ ] **Functional**: Overlap detection works correctly (reuses bulletproof matcher logic)
- [ ] **Aggregation**: Metadata properly combined (union headings, min/max pages, concat bboxes)
- [ ] **Confidence**: Thresholds correctly applied (high: 3+ or >70%, medium: >30%, low: <30%)
- [ ] **Interpolation**: Nearest neighbor metadata used when no overlaps (rare, <10%)
- [ ] **Logging**: Statistics logged (coverage, avg overlaps, interpolated count)
- [ ] **Validation**: Warning logged if coverage <70%
- [ ] **Type Safety**: All functions properly typed, return ProcessedChunk[]
- [ ] **Documentation**: JSDoc comments explaining overlap expectations

#### Validation Commands

```bash
# Unit tests
cd worker
npx jest lib/chonkie/__tests__/metadata-transfer.test.ts

# Test overlap detection
npx tsx lib/chonkie/__tests__/test-overlap-detection.ts

# Integration test with real document
npx tsx scripts/test-metadata-transfer.ts <document_id>

# Validate overlap coverage
npx tsx scripts/validate-overlap-coverage.ts <document_id>
# Expected: 70-90% coverage, <10% interpolated

# Type checking
npx tsc --noEmit lib/chonkie/metadata-transfer.ts
```

#### Resources & References

**Documentation**:
- PRP Overlap Detection: `docs/prps/chonkie-integration.md:606-916` - Complete specification

**Code References**:
- Overlap logic: `worker/lib/local/bulletproof-matcher.ts:862-891` - Reuse this pattern
- Metadata types: `worker/types/database.ts:ChunkMetadata` - Field definitions
- ProcessedChunk: `worker/lib/chunking/types.ts` - Output type

---

### T-004: Database Migration - Add Chunker Type Support

**Priority**: Critical
**Estimated Effort**: 4 hours
**Dependencies**: None (can run parallel with T-001, T-002, T-003)

#### Task Purpose

**As a** database schema
**I need** to track which Chonkie chunker was used for each chunk
**So that** users can filter, compare, and analyze chunks by chunker strategy

#### Technical Requirements

**Files to Create**:
```
supabase/migrations/050_add_chunker_type.sql - Schema changes for Chonkie support
```

**Functional Requirements**:
- REQ-1: When chunk is saved, the system shall record chunker_type (token, recursive, etc.)
- REQ-2: When document is processed, the system shall record user-selected chunker_type
- REQ-3: When metadata transfer occurs, the system shall record overlap quality metrics
- REQ-4: When querying chunks, the system shall support filtering by chunker_type

**Implementation Steps**:

1. **Add chunker_type to chunks table** (PRP lines 932-945):
   ```sql
   ALTER TABLE chunks
   ADD COLUMN IF NOT EXISTS chunker_type TEXT NOT NULL DEFAULT 'hybrid'
   CHECK (chunker_type IN (
     'hybrid',     -- Old HybridChunker (deprecated, backward compat)
     'token',      -- Chonkie TokenChunker
     'sentence',   -- Chonkie SentenceChunker
     'recursive',  -- Chonkie RecursiveChunker (recommended default)
     'semantic',   -- Chonkie SemanticChunker
     'late',       -- Chonkie LateChunker
     'code',       -- Chonkie CodeChunker
     'neural',     -- Chonkie NeuralChunker
     'slumber',    -- Chonkie SlumberChunker
     'table'       -- Chonkie TableChunker
   ));
   ```

2. **Add metadata transfer quality columns** (PRP lines 947-953):
   ```sql
   ALTER TABLE chunks
   ADD COLUMN IF NOT EXISTS metadata_overlap_count INTEGER DEFAULT 0,
   ADD COLUMN IF NOT EXISTS metadata_confidence TEXT DEFAULT 'high'
   CHECK (metadata_confidence IN ('high', 'medium', 'low')),
   ADD COLUMN IF NOT EXISTS metadata_interpolated BOOLEAN DEFAULT false;
   ```

3. **Add chunker_type to documents table** (PRP lines 955-961):
   ```sql
   ALTER TABLE documents
   ADD COLUMN IF NOT EXISTS chunker_type TEXT DEFAULT 'recursive'
   CHECK (chunker_type IN (
     'hybrid', 'token', 'sentence', 'recursive', 'semantic',
     'late', 'code', 'neural', 'slumber', 'table'
   ));
   ```

4. **Add default_chunker_type to user_preferences** (PRP lines 963-969):
   ```sql
   ALTER TABLE user_preferences
   ADD COLUMN IF NOT EXISTS default_chunker_type TEXT DEFAULT 'recursive'
   CHECK (default_chunker_type IN (
     'hybrid', 'token', 'sentence', 'recursive', 'semantic',
     'late', 'code', 'neural', 'slumber', 'table'
   ));
   ```

5. **Add indexes for performance** (PRP lines 971-978):
   ```sql
   CREATE INDEX IF NOT EXISTS idx_chunks_chunker_type ON chunks(chunker_type);
   CREATE INDEX IF NOT EXISTS idx_chunks_doc_chunker ON chunks(document_id, chunker_type);
   CREATE INDEX IF NOT EXISTS idx_documents_chunker_type ON documents(chunker_type);
   CREATE INDEX IF NOT EXISTS idx_chunks_metadata_confidence ON chunks(metadata_confidence);
   CREATE INDEX IF NOT EXISTS idx_chunks_interpolated ON chunks(metadata_interpolated) WHERE metadata_interpolated = true;
   ```

6. **Add helpful comments** (PRP lines 980-986):
   ```sql
   COMMENT ON COLUMN chunks.chunker_type IS 'Chonkie chunker strategy used (recursive default)';
   COMMENT ON COLUMN chunks.metadata_overlap_count IS 'Number of Docling chunks that overlapped (0 = interpolated)';
   COMMENT ON COLUMN chunks.metadata_confidence IS 'Confidence in metadata transfer (high/medium/low based on overlaps)';
   COMMENT ON COLUMN chunks.metadata_interpolated IS 'True if metadata was interpolated from neighbors (no overlaps)';
   COMMENT ON COLUMN documents.chunker_type IS 'Chonkie chunker strategy selected by user';
   COMMENT ON COLUMN user_preferences.default_chunker_type IS 'User default Chonkie chunker preference';
   ```

**Migration Naming**: `050_add_chunker_type.sql` (increment from latest migration 049)

**Code Patterns to Follow**:
- **Migration Structure**: `supabase/migrations/047_chunk_validation_corrections.sql` - Similar ALTER TABLE pattern
- **CHECK Constraints**: Ensure consistency with TypeScript ChunkerType enum
- **Indexes**: Support common query patterns (by chunker_type, by confidence, by interpolated)

#### Acceptance Criteria

**Given-When-Then Scenarios**:
```gherkin
Scenario 1: Apply migration to fresh database
  Given a new Supabase database
  When migration 050 is applied
  Then chunks table should have chunker_type column with default 'hybrid'
  And chunks table should have metadata_overlap_count, metadata_confidence, metadata_interpolated columns
  And documents table should have chunker_type column with default 'recursive'
  And user_preferences table should have default_chunker_type column
  And all CHECK constraints should be valid
  And all indexes should be created

Scenario 2: Apply migration to existing database with data
  Given chunks table with existing rows
  When migration 050 is applied
  Then existing chunks should have chunker_type = 'hybrid' (default)
  And existing chunks should have metadata_confidence = 'high' (default)
  And no data should be lost

Scenario 3: Insert chunk with Chonkie chunker
  Given migration 050 applied
  When inserting chunk with chunker_type = 'recursive'
  Then insert should succeed
  And chunk should be queryable by chunker_type

Scenario 4: Invalid chunker_type rejected
  Given migration 050 applied
  When attempting to insert chunk with chunker_type = 'invalid'
  Then insert should fail with CHECK constraint violation

Scenario 5: Query performance with indexes
  Given 100,000 chunks with various chunker types
  When querying chunks by chunker_type = 'semantic'
  Then query should use idx_chunks_chunker_type index
  And query should complete in <100ms
```

**Rule-Based Criteria**:
- [ ] **Schema Completeness**: All 4 tables updated (chunks, documents, user_preferences)
- [ ] **Constraints**: CHECK constraints enforce valid chunker_type values
- [ ] **Defaults**: Sensible defaults (hybrid for existing, recursive for new)
- [ ] **Indexes**: Performance indexes for common queries
- [ ] **Comments**: Helpful comments on all new columns
- [ ] **Backward Compatibility**: Existing chunks get 'hybrid' default (no breaking changes)
- [ ] **Type Alignment**: SQL enum values match TypeScript ChunkerType

#### Validation Commands

```bash
# Apply migration locally
npx supabase db reset

# Verify migration applied
npx supabase db diff --schema public
# Should show no changes (migration complete)

# Test INSERT with new columns
psql $DATABASE_URL -c "
INSERT INTO chunks (document_id, content, chunk_index, chunker_type, metadata_confidence)
VALUES ('test-doc', 'Test chunk', 0, 'recursive', 'high');
"

# Test CHECK constraint
psql $DATABASE_URL -c "
INSERT INTO chunks (document_id, content, chunk_index, chunker_type)
VALUES ('test-doc', 'Invalid', 1, 'invalid');
"
# Should fail with CHECK constraint violation

# Verify indexes created
psql $DATABASE_URL -c "\d chunks"
# Should show idx_chunks_chunker_type, idx_chunks_metadata_confidence, etc.

# Test query performance
psql $DATABASE_URL -c "
EXPLAIN ANALYZE SELECT * FROM chunks WHERE chunker_type = 'semantic';
"
# Should use idx_chunks_chunker_type index
```

#### Resources & References

**Documentation**:
- Supabase Migrations: https://supabase.com/docs/guides/database/migrations
- PostgreSQL ALTER TABLE: https://www.postgresql.org/docs/current/sql-altertable.html
- PostgreSQL CHECK Constraints: https://www.postgresql.org/docs/current/ddl-constraints.html

**Code References**:
- Migration pattern: `supabase/migrations/047_chunk_validation_corrections.sql`
- TypeScript enum: `worker/lib/chonkie/types.ts:ChunkerType`

---

### T-005: Update TypeScript Database Types

**Priority**: High
**Estimated Effort**: 2 hours
**Dependencies**: T-004 (migration must be applied first)

#### Task Purpose

**As a** TypeScript codebase
**I need** updated database types reflecting migration 050
**So that** type checking catches schema mismatches

#### Technical Requirements

**Files to Modify**:
```
worker/types/database.ts - Update Chunk, Document, UserPreferences types
```

**Functional Requirements**:
- REQ-1: When Chunk type is used, it shall include chunker_type, metadata_overlap_count, metadata_confidence, metadata_interpolated
- REQ-2: When Document type is used, it shall include chunker_type
- REQ-3: When UserPreferences type is used, it shall include default_chunker_type
- REQ-4: All chunker_type fields shall use ChunkerType enum (not string)

**Implementation Steps**:

1. **Update Chunk interface**:
   ```typescript
   export interface Chunk {
     // Existing fields...
     chunker_type: ChunkerType
     metadata_overlap_count: number
     metadata_confidence: 'high' | 'medium' | 'low'
     metadata_interpolated: boolean
   }
   ```

2. **Update Document interface**:
   ```typescript
   export interface Document {
     // Existing fields...
     chunker_type: ChunkerType
   }
   ```

3. **Update UserPreferences interface**:
   ```typescript
   export interface UserPreferences {
     // Existing fields...
     default_chunker_type: ChunkerType
   }
   ```

4. **Verify ChunkerType import**:
   ```typescript
   import { ChunkerType } from '../lib/chonkie/types.js'
   ```

5. **Run Supabase type generation**:
   ```bash
   npx supabase gen types typescript --local > types/supabase.ts
   ```

6. **Verify type consistency across codebase**

**Code Patterns to Follow**:
- **Type Structure**: `worker/types/database.ts` - Existing interfaces
- **Enum Usage**: `worker/types/` - Consistent enum patterns

#### Acceptance Criteria

**Rule-Based Criteria**:
- [ ] **Type Completeness**: All 3 interfaces updated with new fields
- [ ] **Type Safety**: ChunkerType enum used (not string literal)
- [ ] **Compilation**: `npx tsc --noEmit` passes with no errors
- [ ] **Supabase Gen**: Generated types match manual updates
- [ ] **Import Consistency**: ChunkerType imported from correct location
- [ ] **Documentation**: JSDoc comments on new fields

#### Validation Commands

```bash
# Generate types from Supabase
npx supabase gen types typescript --local > types/supabase-generated.ts

# Compare with manual types
diff worker/types/database.ts types/supabase-generated.ts

# Type checking
cd worker
npx tsc --noEmit

# Test type usage
node -e "
import type { Chunk } from './types/database.js'
const chunk: Chunk = {
  chunker_type: 'recursive',
  metadata_confidence: 'high'
  // ... other fields
}
"
```

---

## Week 2: Processor Refactoring (Days 6-10)

### T-006: Remove Inline Metadata System

**Priority**: Critical
**Estimated Effort**: 3 hours
**Dependencies**: None

#### Task Purpose

**As a** codebase maintainer
**I need** to remove the experimental inline metadata system
**So that** the pipeline is simplified and easier to maintain

#### Technical Requirements

**Files to DELETE**:
```
worker/lib/local/inline-metadata-parser.ts (entire file)
worker/lib/local/__tests__/test-inline-metadata.ts (entire file)
```

**Files to MODIFY**:
```
worker/processors/pdf-processor.ts - Remove inline metadata logic
worker/processors/epub-processor.ts - Remove inline metadata references
```

**Lines to Remove from pdf-processor.ts** (PRP lines 1007-1025):
- Lines 39-47: Inline metadata imports
- Lines 116-123: Inline metadata chunk size logic
- Lines 136-140: Inline metadata options spread
- Lines 181-209: Inline metadata parsing stage (Stage 2.5)
- Lines 381-443: convertInlineMetadataToChunks() function (~62 lines)

**Implementation Steps**:

1. **Delete files**:
   ```bash
   rm worker/lib/local/inline-metadata-parser.ts
   rm worker/lib/local/__tests__/test-inline-metadata.ts
   ```

2. **Remove from pdf-processor.ts**:
   - Delete import statement: `import { parseInlineMetadata } from '../lib/local/inline-metadata-parser.js'`
   - Remove `useInlineMetadata` variable and related logic
   - Remove `chunkSize` conditional (always use 768 for Docling, doesn't matter for Chonkie)
   - Delete Stage 2.5 (inline metadata parsing)
   - Delete `convertInlineMetadataToChunks()` function

3. **Remove from epub-processor.ts** (if any references exist)

4. **Verify compilation**:
   ```bash
   cd worker
   npx tsc --noEmit
   ```

5. **Verify no imports remain**:
   ```bash
   grep -r "inline-metadata" worker/
   # Should return no results
   ```

**Code Patterns to Follow**:
- **Clean Deletion**: Remove all related code, not just commented out
- **Import Cleanup**: Ensure no orphaned imports remain

#### Acceptance Criteria

**Rule-Based Criteria**:
- [ ] **Files Deleted**: inline-metadata-parser.ts and test file removed
- [ ] **Imports Removed**: No references to inline-metadata in codebase
- [ ] **Compilation**: TypeScript compiles without errors
- [ ] **Code Reduction**: ~120 lines removed from pdf-processor.ts
- [ ] **No Commented Code**: Clean deletion, not commented out

#### Validation Commands

```bash
# Verify files deleted
ls worker/lib/local/inline-metadata-parser.ts
# Should error: No such file or directory

# Search for any references
grep -r "inline" worker/ | grep -i metadata
# Should return no code references (only comments/docs OK)

# Type checking
cd worker
npx tsc --noEmit

# Test processors still work
npx jest processors/__tests__/pdf-processor.test.ts
```

---

### T-007: Remove Bulletproof-As-Chunking System

**Priority**: Critical
**Estimated Effort**: 4 hours
**Dependencies**: T-006 (inline metadata removed first)

#### Task Purpose

**As a** processor pipeline
**I need** to remove bulletproof matcher as a chunking system
**So that** it only serves as a coordinate mapper for metadata transfer

#### Technical Requirements

**Files to MODIFY**:
```
worker/processors/pdf-processor.ts - Remove bulletproof chunking path
worker/processors/epub-processor.ts - Remove bulletproof chunking path
```

**Lines to Remove from pdf-processor.ts** (PRP lines 1026-1031):
- Lines 444-723: Bulletproof matching AS chunking system (~279 lines)
- This includes:
  - LOCAL mode check
  - bulletproofMatch() call for chunking
  - Chunk conversion from MatchResult to ProcessedChunk
  - Metadata preservation logic

**Key Distinction**:
- **REMOVE**: Bulletproof matcher as chunking system (generates final chunks)
- **KEEP**: Bulletproof matcher as coordinate mapper (will be used in T-010)

**Implementation Steps**:

1. **Remove LOCAL mode branching logic**:
   ```typescript
   // DELETE THIS ENTIRE BLOCK:
   if (this.processingMode === 'local') {
     // Bulletproof matching for chunking
     const { chunks: bulletproofChunks } = await bulletproofMatch(markdown, cachedDoclingChunks)

     // Convert to ProcessedChunk
     const processedChunks = bulletproofChunks.map((match, idx) => ({
       // ... 40 lines of conversion logic
     }))

     // Save and continue
   }
   ```

2. **Keep bulletproof matcher import** (will be used differently):
   ```typescript
   // KEEP THIS:
   import { bulletproofMatch } from '../lib/local/bulletproof-matcher.js'
   // But use it for coordinate mapping, not chunking
   ```

3. **Remove from epub-processor.ts** (~271 lines):
   - Similar LOCAL mode block (lines 447-718)

4. **Verify no CLOUD/LOCAL branching remains**:
   ```bash
   grep -n "processingMode === 'local'" worker/processors/*.ts
   # Should return no results after this task
   ```

**Code Patterns to Follow**:
- **Clean Deletion**: Remove entire LOCAL mode blocks
- **Keep Import**: bulletproofMatch import stays (used in T-010)

#### Acceptance Criteria

**Rule-Based Criteria**:
- [ ] **LOCAL Mode Removed**: No processingMode === 'local' checks for chunking
- [ ] **Code Reduction**: ~279 lines removed from pdf-processor.ts, ~271 from epub-processor.ts
- [ ] **Import Kept**: bulletproofMatch import remains (for coordinate mapping)
- [ ] **Compilation**: TypeScript compiles without errors
- [ ] **No Branching**: Single unified pipeline (no CLOUD/LOCAL split)

#### Validation Commands

```bash
# Verify LOCAL mode checks removed
grep -n "processingMode === 'local'" worker/processors/*.ts
# Should return 0 results

# Verify bulletproof import kept
grep -n "bulletproofMatch" worker/processors/pdf-processor.ts
# Should return import line only (no usage yet)

# Type checking
cd worker
npx tsc --noEmit

# Verify line count reduction
wc -l worker/processors/pdf-processor.ts
# Should be ~550 lines fewer than before
```

---

### T-008: Remove Cloud Chunking Path

**Priority**: Critical
**Estimated Effort**: 3 hours
**Dependencies**: T-007 (bulletproof chunking removed)

#### Task Purpose

**As a** processor pipeline
**I need** to remove Gemini cloud chunking
**So that** all chunking goes through Chonkie (local processing)

#### Technical Requirements

**Files to MODIFY**:
```
worker/processors/pdf-processor.ts - Remove cloud chunking
worker/processors/epub-processor.ts - Remove cloud chunking
```

**Lines to Remove from pdf-processor.ts** (PRP lines 1029-1031):
- Lines 725-807: Cloud chunking path (~82 lines)
- This includes:
  - CLOUD mode check
  - Gemini semantic chunking API call
  - Chunk validation and formatting

**Implementation Steps**:

1. **Remove CLOUD mode branching**:
   ```typescript
   // DELETE THIS ENTIRE BLOCK:
   if (this.processingMode === 'cloud') {
     // Use Gemini for semantic chunking
     const chunks = await this.geminiClient.semanticChunk(markdown, {
       // ... configuration
     })

     // Format and validate
     // ... 70 lines
   }
   ```

2. **Remove from epub-processor.ts** (~82 lines):
   - Similar CLOUD mode block (lines 720-802)

3. **Clean up processingMode checks**:
   ```bash
   grep -n "processingMode === 'cloud'" worker/processors/*.ts
   # Should return no results after this task
   ```

4. **Verify no CLOUD/LOCAL branching remains anywhere**:
   ```bash
   grep -n "processingMode ===" worker/
   # Should only be in initialization/config, not in chunking logic
   ```

**Code Patterns to Follow**:
- **Complete Removal**: Delete CLOUD mode blocks entirely
- **No Conditional Compilation**: Single code path for all users

#### Acceptance Criteria

**Rule-Based Criteria**:
- [ ] **CLOUD Mode Removed**: No processingMode === 'cloud' checks for chunking
- [ ] **Code Reduction**: ~82 lines removed from pdf-processor.ts, ~82 from epub-processor.ts
- [ ] **Compilation**: TypeScript compiles without errors
- [ ] **Single Path**: One unified pipeline (no mode branching)
- [ ] **Gemini Usage**: Gemini client remains for extraction/cleanup, but not chunking

#### Validation Commands

```bash
# Verify CLOUD mode checks removed
grep -n "processingMode === 'cloud'" worker/processors/*.ts
# Should return 0 results

# Verify Gemini still used for extraction
grep -n "geminiClient" worker/processors/pdf-processor.ts
# Should show usage in extraction stage only

# Type checking
cd worker
npx tsc --noEmit

# Verify total line reduction (T-006 + T-007 + T-008)
# Should be ~823 lines removed total
```

---

### T-009: Verify Code Reduction

**Priority**: Medium
**Estimated Effort**: 1 hour
**Dependencies**: T-006, T-007, T-008 (all deletions complete)

#### Task Purpose

**As a** code quality auditor
**I need** to verify the promised -823 line code reduction
**So that** we confirm architectural simplification

#### Technical Requirements

**Validation Steps**:

1. **Measure line count reduction**:
   ```bash
   # Before (from PRP estimate): ~3200 lines total
   # After: ~2377 lines (3200 - 823)

   wc -l worker/processors/pdf-processor.ts
   wc -l worker/processors/epub-processor.ts
   ```

2. **Verify deletions**:
   - Inline metadata parser: ~120 lines
   - Bulletproof as chunking: ~550 lines (279 pdf + 271 epub)
   - Cloud chunking: ~164 lines (82 pdf + 82 epub)
   - **Total deleted**: ~834 lines (close to 823 estimate)

3. **Generate diff report**:
   ```bash
   git diff origin/main worker/processors/ --stat
   ```

#### Acceptance Criteria

**Rule-Based Criteria**:
- [ ] **Total Reduction**: 800-850 lines removed from processors
- [ ] **No Commented Code**: All deletions clean (not commented out)
- [ ] **Compilation**: Code still compiles and tests pass
- [ ] **Documentation**: Update processor README with new simplified flow

#### Validation Commands

```bash
# Line count
wc -l worker/processors/*.ts

# Git diff
git diff origin/main worker/processors/ --stat

# Verify no commented code
grep -n "// DELETE" worker/processors/*.ts
# Should return no results
```

---

### T-010: Integrate Chonkie Chunking into Processors

**Priority**: Critical
**Estimated Effort**: 10 hours (1.5 days)
**Dependencies**: T-001, T-002, T-003, T-006, T-007, T-008 (infrastructure ready, old code removed)

#### Task Purpose

**As a** document processor
**I need** to integrate Chonkie chunking with metadata transfer
**So that** all documents use the new unified pipeline

#### Technical Requirements

**Files to MODIFY**:
```
worker/processors/pdf-processor.ts - Add Chonkie stages (6-7)
worker/processors/epub-processor.ts - Add Chonkie stages (6-7)
```

**Functional Requirements**:
- REQ-1: After cleanup stage (Stage 3), the system shall run bulletproof matcher for coordinate mapping (Stage 4)
- REQ-2: After optional review (Stage 5), the system shall run Chonkie chunking (Stage 6)
- REQ-3: After Chonkie chunking, the system shall transfer metadata via overlap detection (Stage 7)
- REQ-4: The system shall save chunks with chunker_type to Storage and Database

**New Pipeline Stages** (PRP lines 1050-1096):

**Stage 4: Bulletproof Matching (70-72%)** - Coordinate Mapper
```typescript
// Get cached Docling chunks
const cachedDoclingChunks = this.job.metadata?.cached_extraction?.doclingChunks as DoclingChunk[]
if (!cachedDoclingChunks) {
  throw new Error('Docling chunks not found in cache - cannot transfer metadata')
}

// Run bulletproof matcher to get coordinate map
console.log('[PDFProcessor] Creating coordinate map with bulletproof matcher')
await this.updateProgress(70, 'bulletproof_mapping', 'processing', 'Creating coordinate map')

const { chunks: bulletproofMatches } = await bulletproofMatch(markdown, cachedDoclingChunks)

console.log(`[PDFProcessor] Coordinate map created: ${bulletproofMatches.length} Docling anchors mapped`)
await this.updateProgress(72, 'bulletproof_mapping', 'complete', 'Coordinate map ready')
```

**Stage 5: Review Checkpoint (Optional, 72%)** - Skip if reviewBeforeChunking=false
```typescript
if (this.job.input_data?.reviewBeforeChunking === true) {
  await this.updateProgress(72, 'review_checkpoint', 'waiting', 'Awaiting user review')
  await this.waitForReview('chunking')
  console.log('[PDFProcessor] User approved, proceeding to chunking')
}
```

**Stage 6: Chonkie Chunking (72-75%)** - User-selected strategy
```typescript
const chunkerStrategy = this.job.input_data?.chunkerStrategy || 'recursive'
console.log(`[PDFProcessor] Chunking with Chonkie strategy: ${chunkerStrategy}`)

await this.updateProgress(72, 'chunking', 'processing', `Chunking with ${chunkerStrategy} strategy`)

const chonkieChunks = await chunkWithChonkie(markdown, {
  chunker_type: chunkerStrategy,
  chunk_size: 512,  // or 768 for alignment with embeddings
  timeout: 300000   // 5 minutes base timeout
})

console.log(`[PDFProcessor] Chonkie created ${chonkieChunks.length} chunks using ${chunkerStrategy} strategy`)
await this.updateProgress(75, 'chunking', 'complete', `${chonkieChunks.length} chunks created`)
```

**Stage 7: Metadata Transfer (75-77%)** - Overlap detection
```typescript
console.log('[PDFProcessor] Transferring Docling metadata to Chonkie chunks')
await this.updateProgress(76, 'metadata_transfer', 'processing', 'Transferring metadata via overlap detection')

const finalChunks = await transferMetadataToChonkieChunks(
  chonkieChunks,
  bulletproofMatches,
  this.job.document_id
)

console.log(`[PDFProcessor] Metadata transfer complete: ${finalChunks.length} enriched chunks`)
await this.updateProgress(77, 'metadata_transfer', 'complete', 'Metadata transfer done')

// Checkpoint: Save chunks with transferred metadata
await this.saveStageResult('chunking', finalChunks)
```

**Stage 8-10: Continue as before** - Metadata enrichment, embeddings, finalize

**Implementation Steps**:

1. **Add imports to pdf-processor.ts**:
   ```typescript
   import { chunkWithChonkie } from '../lib/chonkie/chonkie-chunker.js'
   import { transferMetadataToChonkieChunks } from '../lib/chonkie/metadata-transfer.js'
   import type { ChonkieStrategy } from '../lib/chonkie/types.js'
   ```

2. **Insert Stage 4 (Bulletproof Mapping)** after Stage 3 (Cleanup):
   - Retrieve cached Docling chunks from job metadata
   - Run bulletproofMatch() to create coordinate map
   - Update progress: 70-72%
   - Log coordinate map creation

3. **Insert Stage 5 (Review Checkpoint)** if enabled:
   - Check job.input_data.reviewBeforeChunking
   - Wait for user approval if true
   - Skip if false (default)

4. **Insert Stage 6 (Chonkie Chunking)**:
   - Get chunker strategy from job.input_data.chunkerStrategy (default: 'recursive')
   - Call chunkWithChonkie() with markdown and config
   - Update progress: 72-75%
   - Log chunk count and strategy

5. **Insert Stage 7 (Metadata Transfer)**:
   - Call transferMetadataToChonkieChunks() with Chonkie chunks and bulletproof matches
   - Update progress: 75-77%
   - Log metadata transfer completion
   - Save to Storage via saveStageResult('chunking', finalChunks, { final: true })

6. **Update Stage 8 inputs** (Metadata Enrichment):
   - Use finalChunks from Stage 7 (already has Docling metadata)
   - Continue as before

7. **Repeat for epub-processor.ts**:
   - Same 4 stages (4, 5, 6, 7)
   - Adapt for EPUB-specific cached chunks

8. **Update progress percentages**:
   - Ensure no gaps: 70→72→75→77→90→95→100

**Code Patterns to Follow**:
- **Progress Updates**: `await this.updateProgress(percentage, stage, status, message)`
- **Error Handling**: Wrap Chonkie call in try-catch, log errors
- **Checkpoints**: Use saveStageResult() after Stage 7
- **Logging**: Console.log for debugging, include strategy and counts

#### Acceptance Criteria

**Given-When-Then Scenarios**:
```gherkin
Scenario 1: Process PDF with recursive chunker (default)
  Given a 50-page PDF
  When processing with default settings (recursive)
  Then Stage 4 should create coordinate map from Docling chunks
  And Stage 6 should chunk with Chonkie recursive strategy
  And Stage 7 should transfer metadata via overlap detection
  And finalChunks should have chunker_type = 'recursive'
  And metadata_overlap_count should be >0 for >70% of chunks
  And chunks should be saved to database with all metadata

Scenario 2: Process with semantic chunker (user choice)
  Given a narrative essay
  When user selects chunkerStrategy = 'semantic'
  Then Stage 6 should use Chonkie SemanticChunker
  And processing should take 8-15 minutes
  And chunks should align with thematic boundaries
  And chunker_type should be 'semantic' in database

Scenario 3: Review checkpoint enabled
  Given reviewBeforeChunking = true
  When Stage 5 is reached
  Then progress should pause at 72%
  And status should be 'waiting'
  And job should wait for user approval
  And processing should continue after approval

Scenario 4: Metadata transfer with high overlap
  Given Chonkie chunks align well with Docling chunks
  When metadata transfer runs
  Then >80% of chunks should have 'high' confidence
  And <10% should be interpolated
  And no warnings should be logged

Scenario 5: Metadata transfer with low overlap (edge case)
  Given unusual document structure
  When metadata transfer runs with <70% overlap
  Then a warning should be logged
  And chunks should still be created (interpolated metadata)
  And ChunkQualityPanel should flag low-confidence chunks
```

**Rule-Based Criteria**:
- [ ] **Functional**: All 4 new stages work correctly (bulletproof map, review, chonkie, transfer)
- [ ] **Progress**: Percentages flow smoothly (70→72→75→77→...)
- [ ] **Error Handling**: Chonkie timeouts and failures handled gracefully
- [ ] **Logging**: Console logs for debugging (strategy, counts, coverage)
- [ ] **Storage**: Chunks saved with chunker_type and metadata quality fields
- [ ] **Database**: Chunks inserted with correct schema (chunker_type, metadata_overlap_count, etc.)
- [ ] **Integration**: Works with both pdf-processor and epub-processor
- [ ] **Backward Compatibility**: Existing documents unaffected (use 'hybrid' chunker_type)

#### Validation Commands

```bash
# Unit tests
cd worker
npx jest processors/__tests__/pdf-processor.test.ts
npx jest processors/__tests__/epub-processor.test.ts

# Integration test with small PDF
npx tsx scripts/test-chonkie-integration.ts <test_document_id>

# Process real document
npx tsx scripts/process-document.ts <document_id> --chunker recursive

# Verify database
psql $DATABASE_URL -c "
SELECT chunker_type, COUNT(*),
       AVG(metadata_overlap_count) as avg_overlaps,
       COUNT(*) FILTER (WHERE metadata_confidence = 'high') as high_conf
FROM chunks
WHERE document_id = '<document_id>'
GROUP BY chunker_type;
"

# Check Storage
# Verify chunks.json saved to Storage at documents/{userId}/{docId}/chunks.json

# Type checking
npx tsc --noEmit
```

#### Resources & References

**Documentation**:
- PRP Integration: `docs/prps/chonkie-integration.md:1046-1096` - Complete stage specifications

**Code References**:
- Progress updates: `worker/processors/base.ts:updateProgress()`
- Stage checkpoints: `worker/processors/base.ts:saveStageResult()`
- Bulletproof matcher: `worker/lib/local/bulletproof-matcher.ts:bulletproofMatch()`

---

## Week 3: UI Integration & Testing (Days 11-15)

### T-011: Add Chunker Selection to Upload Form

**Priority**: High
**Estimated Effort**: 6 hours
**Dependencies**: T-001, T-002, T-010 (Chonkie integration working)

#### Task Purpose

**As a** user uploading a document
**I need** to select a chunking strategy
**So that** I can optimize for speed vs quality based on document type

#### Technical Requirements

**Files to MODIFY**:
```
src/components/library/UploadZone.tsx - Add chunker selection dropdown
src/app/actions/documents.ts - Pass chunkerStrategy to worker job
```

**Functional Requirements**:
- REQ-1: When user uploads document, the system shall display chunker strategy dropdown
- REQ-2: When user selects strategy, the system shall show description and time estimate
- REQ-3: When non-default strategy selected, the system shall show info alert with timing
- REQ-4: Default strategy shall be 'recursive' (fastest, most flexible)

**UI Components** (PRP lines 1102-1158):

```typescript
const chunkerDescriptions: Record<ChunkerType, string> = {
  token: "Fixed-size chunks. Fastest, most predictable. Use for compatibility or testing.",
  sentence: "Sentence-based boundaries. Simple and fast. Best for clean, well-formatted text.",
  recursive: "Hierarchical splitting (paragraph → sentence → token). Recommended default for most documents.",
  semantic: "Topic-based boundaries using embeddings. Best for narratives, essays, thematic content. Slower but higher quality.",
  late: "Contextual embeddings for high retrieval quality. Best for critical RAG applications. Very slow.",
  code: "AST-aware code splitting. Use only for source code files.",
  neural: "BERT-based semantic shift detection. Best for complex academic papers. Very slow but highest quality.",
  slumber: "Agentic LLM-powered chunking. Highest quality, use for critical documents only. Extremely slow.",
  table: "Markdown table splitting by row. Use for table-heavy documents."
}

const chunkerTimeEstimates: Record<ChunkerType, string> = {
  token: "2-3 min",
  sentence: "3-4 min",
  recursive: "3-5 min",
  semantic: "8-15 min",
  late: "10-20 min",
  code: "5-10 min",
  neural: "15-25 min",
  slumber: "30-60 min",
  table: "3-5 min"
}

<Select
  label="Chunking Strategy"
  value={chunkerType}
  onChange={(e) => setChunkerType(e.target.value as ChunkerType)}
  className="mb-4"
>
  <option value="token">Token - Fixed-size ({chunkerTimeEstimates.token})</option>
  <option value="sentence">Sentence - Simple boundaries ({chunkerTimeEstimates.sentence})</option>
  <option value="recursive">Recursive - Structural (Recommended, {chunkerTimeEstimates.recursive})</option>
  <option value="semantic">Semantic - Topic-based ({chunkerTimeEstimates.semantic})</option>
  <option value="late">Late - High-quality RAG ({chunkerTimeEstimates.late})</option>
  <option value="code">Code - AST-aware ({chunkerTimeEstimates.code})</option>
  <option value="neural">Neural - BERT semantic ({chunkerTimeEstimates.neural})</option>
  <option value="slumber">Slumber - Agentic LLM ({chunkerTimeEstimates.slumber})</option>
  <option value="table">Table - Markdown tables ({chunkerTimeEstimates.table})</option>
</Select>

<Tooltip content={chunkerDescriptions[chunkerType]}>
  <InfoIcon className="ml-2 text-gray-400" />
</Tooltip>

{chunkerType !== 'recursive' && (
  <Alert variant="info" className="mt-2">
    Estimated processing time: {chunkerTimeEstimates[chunkerType]} for 500-page document.
    {chunkerType === 'slumber' && ' Warning: Very slow, use only for critical documents.'}
  </Alert>
)}
```

**Implementation Steps**:

1. **Add state to UploadZone**:
   ```typescript
   const [chunkerType, setChunkerType] = useState<ChunkerType>('recursive')
   ```

2. **Add chunker selection UI**:
   - Insert `<Select>` component after file input
   - Add descriptions and time estimates
   - Show info alert for non-default choices
   - Add tooltip with detailed description

3. **Pass to Server Action**:
   ```typescript
   // In UploadZone.tsx
   await createDocumentAction({
     // ... existing fields
     chunkerStrategy: chunkerType
   })
   ```

4. **Update Server Action** (`src/app/actions/documents.ts`):
   ```typescript
   export async function createDocumentAction(input: {
     // ... existing fields
     chunkerStrategy?: ChunkerType
   }) {
     // Pass to worker job
     const job = await createBackgroundJob({
       input_data: {
         // ... existing fields
         chunkerStrategy: input.chunkerStrategy || 'recursive'
       }
     })
   }
   ```

5. **Add user preference** (optional):
   - Query user_preferences.default_chunker_type
   - Pre-select user's default if set
   - Provide "Save as default" checkbox

**Code Patterns to Follow**:
- **shadcn Select**: Use existing Select component from `src/components/ui/select.tsx`
- **Tooltip**: Use existing Tooltip component
- **Alert**: Use existing Alert component
- **Server Actions**: `src/app/actions/` - Consistent pattern

#### Acceptance Criteria

**Given-When-Then Scenarios**:
```gherkin
Scenario 1: Default recursive chunker pre-selected
  Given user opens upload form
  When page loads
  Then "Recursive - Structural" should be selected by default
  And time estimate should show "3-5 min"
  And description tooltip should explain hierarchical splitting

Scenario 2: User selects semantic chunker
  Given user is on upload form
  When user selects "Semantic - Topic-based" from dropdown
  Then description should update to semantic explanation
  And info alert should appear with "8-15 min" estimate
  And tooltip should explain thematic coherence use case

Scenario 3: Warning for slumber chunker
  Given user is on upload form
  When user selects "Slumber - Agentic LLM"
  Then alert should show "30-60 min" estimate
  And warning should say "Very slow, use only for critical documents"

Scenario 4: Chunker passed to worker
  Given user selects "semantic" chunker
  When user uploads document
  Then Server Action should receive chunkerStrategy = 'semantic'
  And worker job should have input_data.chunkerStrategy = 'semantic'
  And processing should use SemanticChunker

Scenario 5: User preference pre-selected
  Given user has default_chunker_type = 'neural' in preferences
  When user opens upload form
  Then "Neural - BERT semantic" should be pre-selected
  And user can change if desired
```

**Rule-Based Criteria**:
- [ ] **UI/UX**: Dropdown clearly labeled, options descriptive
- [ ] **Descriptions**: All 9 chunkers have tooltips with use cases
- [ ] **Time Estimates**: Realistic estimates shown (2-60 min range)
- [ ] **Warnings**: Alert shown for slow chunkers (neural, slumber)
- [ ] **Default**: Recursive pre-selected (recommended for most docs)
- [ ] **Integration**: Chunker passed to Server Action and worker job
- [ ] **Accessibility**: Keyboard navigation works, screen reader friendly
- [ ] **Mobile**: Dropdown works on mobile devices

#### Validation Commands

```bash
# No automated tests (UI component)
# Manual testing checklist:

# 1. Open upload form
npm run dev
# Navigate to /library, click Upload

# 2. Verify dropdown appears with 9 options
# 3. Test each option:
#    - Click option
#    - Verify description tooltip updates
#    - Verify time estimate shown
#    - Verify alert appears for non-default

# 4. Upload test document with "semantic"
#    - Select "Semantic - Topic-based"
#    - Upload small PDF
#    - Check worker logs for "Chunking with Chonkie strategy: semantic"

# 5. Verify database
psql $DATABASE_URL -c "
SELECT title, chunker_type FROM documents ORDER BY created_at DESC LIMIT 5;
"
# Should show selected chunker_type
```

#### Resources & References

**Documentation**:
- shadcn Select: https://ui.shadcn.com/docs/components/select
- Radix UI Select: https://www.radix-ui.com/primitives/docs/components/select

**Code References**:
- Upload form: `src/components/library/UploadZone.tsx`
- Server actions: `src/app/actions/documents.ts`

---

### T-012: Update ChunkQualityPanel for Metadata Confidence

**Priority**: Medium
**Estimated Effort**: 4 hours
**Dependencies**: T-010 (chunks have metadata_confidence field)

#### Task Purpose

**As a** user reviewing chunk quality
**I need** to see metadata confidence and interpolated chunks
**So that** I can validate low-quality metadata transfers

#### Technical Requirements

**Files to MODIFY**:
```
src/components/sidebar/ChunkQualityPanel.tsx - Add metadata confidence filters
src/app/actions/chunks.ts - Query chunks by metadata_confidence
```

**Functional Requirements**:
- REQ-1: When panel opens, the system shall show chunks grouped by confidence (high/medium/low)
- REQ-2: When user clicks "Low Confidence", the system shall show chunks with metadata_interpolated = true OR metadata_confidence = 'low'
- REQ-3: When user reviews chunk, the system shall show overlap_count and interpolated status
- REQ-4: Existing validation workflow (view, accept, fix) shall work unchanged

**UI Changes** (PRP lines 1160-1171):

The existing ChunkQualityPanel already has the right structure. Just map existing categories to new metadata fields:

- **Synthetic chunks** → **Interpolated chunks** (metadata_interpolated = true)
- **Overlap-corrected chunks** → **Low-confidence chunks** (metadata_confidence = 'low')
- **Low similarity chunks** → **Medium-confidence chunks** (metadata_confidence = 'medium')

**Implementation Steps**:

1. **Update query in Server Action**:
   ```typescript
   // src/app/actions/chunks.ts
   export async function getChunksForReview(documentId: string, filter: string) {
     let query = supabase
       .from('chunks')
       .select('*')
       .eq('document_id', documentId)

     if (filter === 'interpolated') {
       query = query.eq('metadata_interpolated', true)
     } else if (filter === 'low_confidence') {
       query = query.eq('metadata_confidence', 'low')
     } else if (filter === 'medium_confidence') {
       query = query.eq('metadata_confidence', 'medium')
     }

     return query.order('chunk_index')
   }
   ```

2. **Update ChunkQualityPanel filter buttons**:
   ```typescript
   <Tabs defaultValue="all">
     <TabsList>
       <TabsTrigger value="all">All Chunks</TabsTrigger>
       <TabsTrigger value="interpolated">
         Interpolated ({interpolatedCount})
       </TabsTrigger>
       <TabsTrigger value="low_confidence">
         Low Confidence ({lowConfCount})
       </TabsTrigger>
       <TabsTrigger value="medium_confidence">
         Medium Confidence ({mediumConfCount})
       </TabsTrigger>
     </TabsList>
   </Tabs>
   ```

3. **Update chunk card display**:
   ```typescript
   <ChunkCard>
     <Badge variant={
       chunk.metadata_confidence === 'high' ? 'success' :
       chunk.metadata_confidence === 'medium' ? 'warning' :
       'error'
     }>
       {chunk.metadata_confidence} confidence
     </Badge>

     {chunk.metadata_interpolated && (
       <Badge variant="warning">Interpolated</Badge>
     )}

     <Text size="sm">
       Overlaps: {chunk.metadata_overlap_count}
     </Text>
   </ChunkCard>
   ```

4. **Keep existing validation workflow**:
   - View chunk content
   - Accept (mark as validated)
   - Fix position (if needed)

**Code Patterns to Follow**:
- **Existing Panel**: `src/components/sidebar/ChunkQualityPanel.tsx` - Keep structure, update queries
- **Tabs**: Use existing Tabs component
- **Badges**: Use existing Badge component with variants

#### Acceptance Criteria

**Given-When-Then Scenarios**:
```gherkin
Scenario 1: View low confidence chunks
  Given document with metadata transfer complete
  When user opens ChunkQualityPanel and clicks "Low Confidence" tab
  Then chunks with metadata_confidence = 'low' should be displayed
  And each should show overlap_count and confidence badge
  And "Interpolated" badge should appear if applicable

Scenario 2: View interpolated chunks
  Given document with <10% interpolated chunks
  When user clicks "Interpolated" tab
  Then only chunks with metadata_interpolated = true should show
  And count badge should show correct number

Scenario 3: Accept low confidence chunk
  Given chunk with low confidence due to weak overlap
  When user reviews and clicks "Accept"
  Then chunk should be marked as validated
  And should move out of low confidence list

Scenario 4: High confidence chunks (no issues)
  Given document with 90% high confidence chunks
  When panel opens
  Then "Low Confidence" and "Interpolated" tabs should show 0 or low counts
  And most chunks should have 'high' confidence badge
```

**Rule-Based Criteria**:
- [ ] **Functional**: Filters work correctly (interpolated, low, medium confidence)
- [ ] **UI/UX**: Clear confidence badges (green/yellow/red)
- [ ] **Integration**: Existing validation workflow unchanged
- [ ] **Counts**: Tab badges show correct counts
- [ ] **Performance**: Queries filtered at database level (not in-memory)

#### Validation Commands

```bash
# Manual testing (no automated tests for UI)

# 1. Process document with Chonkie
npm run dev
# Upload document, wait for processing

# 2. Open ChunkQualityPanel
# Click sidebar icon

# 3. Verify tabs appear:
#    - All Chunks
#    - Interpolated (count)
#    - Low Confidence (count)
#    - Medium Confidence (count)

# 4. Click each tab:
#    - Verify correct chunks displayed
#    - Verify badges show confidence level
#    - Verify overlap_count shown

# 5. Query database to verify counts
psql $DATABASE_URL -c "
SELECT
  metadata_confidence,
  metadata_interpolated,
  COUNT(*)
FROM chunks
WHERE document_id = '<doc_id>'
GROUP BY metadata_confidence, metadata_interpolated;
"
```

---

### T-013: Add Chunker Display to Document Metadata

**Priority**: Low
**Estimated Effort**: 3 hours
**Dependencies**: T-010 (documents have chunker_type)

#### Task Purpose

**As a** user viewing a document
**I need** to see which chunker was used
**So that** I understand the chunking strategy applied

#### Technical Requirements

**Files to MODIFY**:
```
src/components/reader/DocumentMetadata.tsx - Add chunker badge
src/components/library/DocumentCard.tsx - Show chunker on card (optional)
```

**Functional Requirements**:
- REQ-1: When viewing document, the system shall display chunker_type as a badge
- REQ-2: When user hovers badge, the system shall show chunker description tooltip
- REQ-3: Badge color shall indicate chunker category (fast/balanced/quality)

**UI Components** (PRP lines 1176-1211):

```typescript
const chunkerLabels: Record<ChunkerType, string> = {
  hybrid: 'Structural (Deprecated)',
  token: 'Token',
  sentence: 'Sentence',
  recursive: 'Recursive',
  semantic: 'Semantic',
  late: 'Late',
  code: 'Code',
  neural: 'Neural',
  slumber: 'Slumber',
  table: 'Table'
}

const chunkerColors: Record<ChunkerType, string> = {
  hybrid: 'bg-gray-100 text-gray-700',
  token: 'bg-gray-100 text-gray-700',
  sentence: 'bg-gray-100 text-gray-700',
  recursive: 'bg-green-100 text-green-700',
  semantic: 'bg-blue-100 text-blue-700',
  late: 'bg-purple-100 text-purple-700',
  code: 'bg-orange-100 text-orange-700',
  neural: 'bg-purple-100 text-purple-700',
  slumber: 'bg-yellow-100 text-yellow-700',
  table: 'bg-gray-100 text-gray-700'
}

<div className="metadata-row">
  <span className="label">Chunker:</span>
  <Tooltip content={chunkerDescriptions[document.chunker_type]}>
    <Badge className={chunkerColors[document.chunker_type]}>
      {chunkerLabels[document.chunker_type]}
    </Badge>
  </Tooltip>
</div>
```

**Implementation Steps**:

1. **Add to DocumentMetadata component**:
   - Query document.chunker_type
   - Display badge with color coding
   - Add tooltip with description

2. **Optional: Add to DocumentCard** (library grid):
   - Small badge in corner
   - Color-coded for quick recognition

3. **Add legend** (optional):
   - Show color meanings (fast/balanced/quality)

**Code Patterns to Follow**:
- **Badge**: Use existing Badge component
- **Tooltip**: Use existing Tooltip component
- **Metadata Display**: `src/components/reader/DocumentMetadata.tsx` - Existing pattern

#### Acceptance Criteria

**Given-When-Then Scenarios**:
```gherkin
Scenario 1: View document with recursive chunker
  Given document processed with recursive chunker
  When user views document metadata
  Then badge should show "Recursive"
  And badge should be green (recommended)
  And tooltip should explain hierarchical splitting

Scenario 2: View document with semantic chunker
  Given document processed with semantic chunker
  When user views metadata
  Then badge should show "Semantic"
  And badge should be blue (quality)
  And tooltip should explain thematic coherence

Scenario 3: Library card shows chunker
  Given user viewing library grid
  When looking at document cards
  Then each card should show small chunker badge
  And color should indicate category
```

**Rule-Based Criteria**:
- [ ] **UI/UX**: Badge clearly visible, color-coded appropriately
- [ ] **Tooltip**: Description helpful for understanding chunker choice
- [ ] **Accessibility**: Color not sole indicator (text label also present)
- [ ] **Mobile**: Badge scales appropriately on small screens

#### Validation Commands

```bash
# Manual testing

# 1. Process document with different chunkers
# 2. View document in reader
# 3. Verify badge appears with correct label and color
# 4. Hover badge, verify tooltip shows description
# 5. Check library grid (if implemented)
```

---

### T-014: Integration Testing - All Chunker Types

**Priority**: Critical
**Estimated Effort**: 8 hours (1 day)
**Dependencies**: T-010, T-011 (full pipeline integrated)

#### Task Purpose

**As a** quality assurance engineer
**I need** to test all 9 chunker types with real documents
**So that** we verify the system works end-to-end for all strategies

#### Technical Requirements

**Test Documents**:
- Small PDF (50 pages): "test-small.pdf"
- Medium PDF (200 pages): "test-medium.pdf"
- Large PDF (500 pages): "test-large.pdf"
- Narrative text: Essay or novel chapter
- Technical text: Academic paper with equations
- Code file: Python/JavaScript source

**Functional Requirements**:
- REQ-1: Each chunker type shall successfully process documents
- REQ-2: Overlap coverage shall be >70% for all chunker types
- REQ-3: Metadata recovery shall be >90% for all chunker types
- REQ-4: Processing times shall meet targets (PRP lines 1437-1447)
- REQ-5: Character offsets shall validate correctly

**Implementation Steps**:

1. **Create integration test script** (PRP lines 1292-1363):
   ```typescript
   // worker/scripts/test-chonkie-integration.ts
   import { chunkWithChonkie } from '../lib/chonkie/chonkie-chunker'
   import { transferMetadataToChonkieChunks } from '../lib/chonkie/metadata-transfer'
   import { bulletproofMatch } from '../lib/local/bulletproof-matcher'

   async function testChonkieIntegration(documentId: string) {
     // 1. Get cleaned markdown from storage
     const markdown = await getCleanedMarkdown(documentId)

     // 2. Get Docling chunks from cached_chunks table
     const doclingChunks = await getCachedDoclingChunks(documentId)

     // 3. Test all chunker types
     for (const chunkerType of ['token', 'sentence', 'recursive', 'semantic']) {
       // Chunk with Chonkie
       const chonkieChunks = await chunkWithChonkie(markdown, {
         chunker_type: chunkerType,
         chunk_size: 512
       })

       // Verify character offsets
       for (const chunk of chonkieChunks) {
         const extracted = markdown.slice(chunk.start_index, chunk.end_index)
         if (extracted !== chunk.text) {
           throw new Error(`Offset mismatch in ${chunkerType}`)
         }
       }

       // Create coordinate map
       const { chunks: bulletproofMatches } = await bulletproofMatch(markdown, doclingChunks)

       // Transfer metadata
       const finalChunks = await transferMetadataToChonkieChunks(
         chonkieChunks,
         bulletproofMatches,
         documentId
       )

       // Validate overlap coverage
       const withOverlaps = finalChunks.filter(c => c.metadata_overlap_count > 0)
       const overlapCoverage = (withOverlaps.length / finalChunks.length) * 100

       if (overlapCoverage < 70) {
         console.error(`LOW OVERLAP COVERAGE: ${overlapCoverage.toFixed(1)}%`)
       }

       // Validate metadata recovery
       const withMetadata = finalChunks.filter(c =>
         (c.heading_path && c.heading_path.length > 0) || c.page_start
       )
       const metadataRecovery = (withMetadata.length / finalChunks.length) * 100

       console.log(`${chunkerType}: ${overlapCoverage.toFixed(1)}% coverage, ${metadataRecovery.toFixed(1)}% recovery`)
     }
   }
   ```

2. **Test each chunker type**:
   ```bash
   for chunker in token sentence recursive semantic late code neural; do
     echo "Testing $chunker..."
     npx tsx scripts/test-chunker.ts <document_id> $chunker
   done
   ```

3. **Validate success metrics**:
   - Overlap coverage: 70-90%
   - Metadata recovery: >90%
   - Processing times within targets
   - Character offsets 100% accurate

4. **Performance benchmarks** (500-page document):
   ```bash
   npx tsx scripts/benchmark-chonkie.ts <large_document_id>
   ```

5. **Create test report**:
   ```markdown
   # Chonkie Integration Test Report

   ## Test Documents
   - Small (50 pages): ...
   - Medium (200 pages): ...
   - Large (500 pages): ...

   ## Results by Chunker Type

   | Chunker | Chunks | Coverage | Recovery | Time | Status |
   |---------|--------|----------|----------|------|--------|
   | token   | 382    | 85%      | 95%      | 3m   | ✅     |
   | sentence| 365    | 82%      | 93%      | 4m   | ✅     |
   | recursive| 348   | 88%      | 96%      | 5m   | ✅     |
   | semantic| 312    | 90%      | 97%      | 14m  | ✅     |
   ```

**Code Patterns to Follow**:
- **Integration Tests**: `worker/tests/integration/` - Existing test patterns
- **Validation**: PRP lines 1407-1447 - Success metrics

#### Acceptance Criteria

**Given-When-Then Scenarios**:
```gherkin
Scenario 1: Token chunker (fast baseline)
  Given 500-page PDF
  When processed with token chunker
  Then processing should complete in 2-4 minutes
  And overlap coverage should be >70%
  And metadata recovery should be >90%
  And all character offsets should validate

Scenario 2: Recursive chunker (default)
  Given 500-page PDF
  When processed with recursive chunker
  Then processing should complete in 3-6 minutes
  And overlap coverage should be 80-90%
  And chunks should respect paragraph boundaries

Scenario 3: Semantic chunker (quality)
  Given narrative essay
  When processed with semantic chunker
  Then processing should complete in 10-18 minutes
  And overlap coverage should be >85%
  And chunks should align with thematic shifts

Scenario 4: Neural chunker (highest quality)
  Given academic paper
  When processed with neural chunker
  Then processing should complete in 20-30 minutes
  And overlap coverage should be >90%
  And chunks should respect semantic coherence

Scenario 5: All chunkers pass validation
  Given test suite with all 9 chunker types
  When tests run
  Then all should pass overlap coverage threshold (>70%)
  And all should pass metadata recovery threshold (>90%)
  And no character offset mismatches
```

**Rule-Based Criteria**:
- [ ] **Functional**: All 9 chunker types work correctly
- [ ] **Overlap Coverage**: >70% for all chunkers (success metric)
- [ ] **Metadata Recovery**: >90% for all chunkers (success metric)
- [ ] **Performance**: Processing times within acceptable ranges
- [ ] **Character Offsets**: 100% validation accuracy (critical)
- [ ] **Error Handling**: Timeouts and failures handled gracefully
- [ ] **Logging**: Detailed logs for debugging
- [ ] **Report**: Test report generated with all metrics

#### Validation Commands

```bash
# Install test dependencies
cd worker
pip install pytest  # For Python tests if needed

# Run integration test suite
npx tsx scripts/test-all-chunkers.ts <document_id>

# Run individual chunker tests
for chunker in token sentence recursive semantic; do
  echo "Testing $chunker..."
  npx tsx scripts/test-chunker.ts <document_id> $chunker
done

# Benchmark performance (500-page doc)
npx tsx scripts/benchmark-chonkie.ts <large_document_id>

# Validate success metrics
npx tsx scripts/validate-chonkie-metrics.ts <document_id>
# Should report:
# ✅ Overlap coverage: 85% (target >70%)
# ✅ Metadata recovery: 95% (target >90%)
# ✅ Character offsets: 100% valid
# ✅ Processing time: 5 min (within target 3-6 min)

# Generate test report
npx tsx scripts/generate-test-report.ts > docs/chonkie-test-report.md
```

#### Resources & References

**Documentation**:
- PRP Success Metrics: `docs/prps/chonkie-integration.md:1403-1456` - Complete metrics
- PRP Integration Test: `docs/prps/chonkie-integration.md:1292-1363` - Test script

**Code References**:
- Integration tests: `worker/tests/integration/` - Existing patterns
- Validation scripts: `worker/scripts/validate-*.ts` - Validation patterns

---

### T-015: Performance Benchmarking

**Priority**: Medium
**Estimated Effort**: 4 hours
**Dependencies**: T-014 (integration tests complete)

#### Task Purpose

**As a** performance engineer
**I need** to benchmark all chunker types with various document sizes
**So that** we validate performance targets and identify bottlenecks

#### Technical Requirements

**Test Matrix**:
- 3 document sizes: 50, 200, 500 pages
- 9 chunker types: token, sentence, recursive, semantic, late, code, neural, slumber, table
- 3 metrics: processing time, memory usage, overlap coverage

**Performance Targets** (PRP lines 1437-1447):

| Chunker | Target Time (500p) | Acceptable Range |
|---------|-------------------|------------------|
| token | <3 min | 2-4 min |
| sentence | <4 min | 3-5 min |
| recursive | <5 min | 3-6 min |
| semantic | <15 min | 10-18 min |
| late | <20 min | 15-25 min |
| code | <10 min | 5-12 min |
| neural | <25 min | 20-30 min |
| slumber | <60 min | 45-75 min |
| table | <5 min | 3-6 min |

**Implementation Steps**:

1. **Create benchmark script**:
   ```typescript
   // worker/scripts/benchmark-chonkie.ts
   async function benchmarkChunker(
     documentId: string,
     chunkerType: ChonkerType
   ) {
     const startTime = Date.now()
     const startMemory = process.memoryUsage().heapUsed

     // Run Chonkie chunking
     const chunks = await chunkWithChonkie(markdown, {
       chunker_type: chunkerType,
       chunk_size: 512
     })

     const endTime = Date.now()
     const endMemory = process.memoryUsage().heapUsed

     const duration = (endTime - startTime) / 1000 / 60  // minutes
     const memoryDelta = (endMemory - startMemory) / 1024 / 1024  // MB

     return {
       chunkerType,
       duration,
       memoryUsage: memoryDelta,
       chunkCount: chunks.length,
       avgChunkSize: chunks.reduce((sum, c) => sum + c.text.length, 0) / chunks.length
     }
   }
   ```

2. **Run benchmarks for all chunkers**:
   ```bash
   npx tsx scripts/benchmark-all-chunkers.ts <document_id>
   ```

3. **Generate performance report**:
   ```markdown
   # Chonkie Performance Benchmark

   ## Document: 500-page Technical Manual

   | Chunker | Time | Target | Status | Memory | Chunks |
   |---------|------|--------|--------|--------|--------|
   | token   | 2.8m | <3m    | ✅     | 120 MB | 382    |
   | recursive| 4.2m| <5m    | ✅     | 140 MB | 348    |
   | semantic| 13.5m| <15m   | ✅     | 280 MB | 312    |
   | neural  | 24.1m| <25m   | ✅     | 450 MB | 298    |
   ```

4. **Compare with baseline** (optional):
   - Old bulletproof chunking: ~8 min (500 pages)
   - Chonkie recursive: ~5 min (500 pages)
   - **Improvement**: 37% faster

**Code Patterns to Follow**:
- **Benchmarking**: `worker/benchmarks/` - Existing benchmark patterns
- **Memory Tracking**: `process.memoryUsage()` - Node.js memory API

#### Acceptance Criteria

**Rule-Based Criteria**:
- [ ] **Performance**: All chunkers meet target times for 500-page docs
- [ ] **Memory**: Memory usage acceptable (<1 GB for any chunker)
- [ ] **Scaling**: Processing time scales linearly with document size
- [ ] **Report**: Comprehensive report with all metrics
- [ ] **Baseline**: Comparison with old system (if available)

#### Validation Commands

```bash
# Run benchmarks
cd worker
npx tsx scripts/benchmark-all-chunkers.ts <document_id>

# Generate report
npx tsx scripts/generate-benchmark-report.ts > docs/chonkie-benchmark-report.md

# Compare with baseline
npx tsx scripts/compare-with-baseline.ts
```

---

### T-016: Documentation & Handoff

**Priority**: Medium
**Estimated Effort**: 6 hours
**Dependencies**: T-014, T-015 (testing and benchmarking complete)

#### Task Purpose

**As a** future developer or maintainer
**I need** comprehensive documentation for the Chonkie integration
**So that** I can understand, debug, and extend the system

#### Technical Requirements

**Documents to Create/Update**:
```
docs/chonkie-integration.md - User-facing guide
docs/processing-pipeline/chonkie-chunking.md - Technical deep dive
worker/README.md - Update with Chonkie section
README.md - Update architecture overview
```

**Functional Requirements**:
- REQ-1: User guide shall explain chunker selection and use cases
- REQ-2: Technical guide shall explain architecture and metadata transfer
- REQ-3: Troubleshooting guide shall cover common issues and fixes
- REQ-4: API documentation shall cover all new functions and types

**Documentation Sections**:

1. **User Guide** (`docs/chonkie-integration.md`):
   - What is Chonkie?
   - Which chunker should I choose?
   - How to upload with custom chunker
   - How to review chunk quality
   - FAQ

2. **Technical Deep Dive** (`docs/processing-pipeline/chonkie-chunking.md`):
   - Architecture overview (10-stage pipeline)
   - Component roles (Docling vs Bulletproof vs Chonkie)
   - Metadata transfer mechanism (overlap detection)
   - Confidence scoring algorithm
   - Interpolation strategy

3. **Troubleshooting Guide**:
   - Low overlap coverage (<70%)
   - Character offset mismatches
   - Timeout handling
   - Python subprocess issues
   - Performance optimization

4. **API Documentation**:
   - `chunkWithChonkie()` - TypeScript IPC wrapper
   - `transferMetadataToChonkieChunks()` - Metadata transfer
   - `chonkie_chunk.py` - Python wrapper
   - All TypeScript types

**Implementation Steps**:

1. **Create user guide**:
   - Explain 9 chunker types with use cases
   - Show upload form workflow
   - Explain ChunkQualityPanel usage

2. **Create technical guide**:
   - Diagram 10-stage pipeline
   - Explain overlap detection algorithm
   - Show confidence scoring logic
   - Reference PRP for detailed specs

3. **Update README files**:
   - Main README: Add Chonkie to architecture section
   - Worker README: Add Chonkie integration section

4. **Create troubleshooting guide**:
   - Common issues and fixes
   - Validation commands
   - Debug techniques

5. **Generate API docs** (optional):
   ```bash
   npx typedoc worker/lib/chonkie/
   ```

**Code Patterns to Follow**:
- **Existing Docs**: `docs/processing-pipeline/` - Consistent style
- **Markdown**: Use headings, code blocks, diagrams

#### Acceptance Criteria

**Rule-Based Criteria**:
- [ ] **Completeness**: All 4 documents created/updated
- [ ] **Clarity**: Clear explanations for both users and developers
- [ ] **Examples**: Code examples for all key functions
- [ ] **Diagrams**: Pipeline diagram included
- [ ] **Troubleshooting**: Common issues documented with fixes
- [ ] **API Docs**: All new functions documented with JSDoc

#### Validation Commands

```bash
# Verify documentation exists
ls docs/chonkie-integration.md
ls docs/processing-pipeline/chonkie-chunking.md

# Check for broken links
npx markdown-link-check docs/**/*.md

# Generate API docs (optional)
cd worker
npx typedoc lib/chonkie/
```

---

## Risk Mitigation Summary

### Critical Risks (High Impact, Medium/High Likelihood)

**Risk 1: Python Subprocess Hangs**
- **Likelihood**: Medium
- **Impact**: High (blocks all processing)
- **Mitigation**:
  - Always `sys.stdout.flush()` after JSON write (T-001)
  - Dynamic timeout based on chunker_type and document size (T-002)
  - Kill process after timeout with descriptive error
- **Detection**: Timeout handling in chonkie-chunker.ts (T-002)

**Risk 2: Character Offset Mismatches**
- **Likelihood**: Low (Chonkie guarantees offsets)
- **Impact**: Critical (metadata transfer fails)
- **Mitigation**:
  - Validate `markdown.slice(start, end) === chunk.text` after chunking (T-002)
  - Fail fast with descriptive error if mismatch detected
  - Add validation to integration tests (T-014)
- **Detection**: Offset validation in chonkie-chunker.ts lines 524-535

**Risk 3: Low Overlap Coverage (<70%)**
- **Likelihood**: Low (bulletproof matcher proven stable)
- **Impact**: Medium (metadata quality degrades)
- **Mitigation**:
  - Log warning when coverage <70% (T-003)
  - Surface in ChunkQualityPanel for user review (T-012)
  - Interpolation provides fallback metadata (T-003)
- **Detection**: Coverage calculation in metadata-transfer.ts lines 895-912

### Medium Risks (Medium Impact, Low/Medium Likelihood)

**Risk 4: Slow Chunkers (neural, slumber)**
- **Likelihood**: Medium (expected behavior)
- **Impact**: Low (user just waits longer)
- **Mitigation**:
  - Show time estimates in UI before upload (T-011)
  - Dynamic timeout scaling with document size (T-002)
  - Warning for very slow chunkers (T-011)
- **Detection**: Time estimate alerts in UploadZone

**Risk 5: Migration Issues**
- **Likelihood**: Low (simple ALTER TABLE)
- **Impact**: Medium (schema mismatch)
- **Mitigation**:
  - Test migration locally before production (T-004)
  - Verify type consistency with Supabase gen (T-005)
  - Sensible defaults prevent data loss (T-004)
- **Detection**: Migration validation commands (T-004)

---

## Testing Checklist

### Unit Tests (Per Task)
- [ ] T-001: Python wrapper with all 9 chunker types (mock subprocess)
- [ ] T-002: TypeScript IPC wrapper (mock subprocess)
- [ ] T-003: Metadata transfer functions (overlap detection, aggregation, confidence)
- [ ] T-010: Processor integration (mock Chonkie and transfer functions)

### Integration Tests (T-014)
- [ ] All 9 chunker types with small PDF (50 pages)
- [ ] Recursive, semantic, neural with medium PDF (200 pages)
- [ ] Recursive, semantic with large PDF (500 pages)
- [ ] Character offset validation (100% accuracy)
- [ ] Overlap coverage validation (>70% for all)
- [ ] Metadata recovery validation (>90% for all)

### Performance Tests (T-015)
- [ ] Benchmark all chunkers with 500-page document
- [ ] Verify processing times within targets
- [ ] Memory usage acceptable (<1 GB)
- [ ] Scaling with document size linear

### Manual Tests (UI)
- [ ] T-011: Chunker selection dropdown works
- [ ] T-011: Time estimates and descriptions shown
- [ ] T-012: ChunkQualityPanel filters by confidence
- [ ] T-013: Document metadata shows chunker badge
- [ ] End-to-end: Upload → Select chunker → View results

---

## Success Criteria Summary

### Code Quality
- ✅ **Net code reduction**: -223 lines (remove 823, add 600)
- ✅ **Cyclomatic complexity**: Reduced by removing branching logic
- ✅ **Test coverage**: >90% for new Chonkie modules
- ✅ **Type safety**: All functions properly typed (no `any`)

### Functional Requirements
- ✅ **Single pipeline**: No CLOUD/LOCAL branching
- ✅ **9 chunker types**: All working correctly
- ✅ **Metadata transfer**: Overlap detection with 70-90% coverage
- ✅ **Character offsets**: 100% validation accuracy

### Performance Requirements
- ✅ **Token/Sentence/Recursive**: <5 min (500 pages)
- ✅ **Semantic/Late/Code**: <20 min (500 pages)
- ✅ **Neural**: <25 min (500 pages)
- ✅ **Slumber**: <60 min (500 pages)

### Quality Metrics
- ✅ **Overlap coverage**: 70-90% of chunks have Docling overlaps
- ✅ **Metadata recovery**: >90% of chunks have heading_path OR page_start
- ✅ **Confidence distribution**: >75% high confidence, <10% interpolated
- ✅ **User satisfaction**: Clear UI, helpful error messages

---

## Final Notes

### Implementation Order

**Critical Path** (must follow order):
1. Week 1, Days 1-2: T-001 (Python wrapper)
2. Week 1, Day 3: T-002 (TypeScript IPC)
3. Week 1, Days 4-5: T-003 (Metadata transfer)
4. Week 2, Days 1-2: T-006, T-007, T-008 (Remove old code)
5. Week 2, Days 3-5: T-010 (Integrate Chonkie)
6. Week 3, Day 3-4: T-014 (Integration testing)

**Parallel Work** (can happen anytime):
- T-004, T-005: Database migration and types (Week 1)
- T-011: UI chunker selection (Week 3, Day 1)
- T-012, T-013: UI quality panel and metadata display (Week 3, Day 2)
- T-015, T-016: Benchmarking and documentation (Week 3, Day 5)

### Key Decision Points

**Decision 1**: Default chunker strategy = **recursive** (confirmed in PRP)
**Decision 2**: Overlap interpolation = **neighbor metadata** (confirmed in PRP)
**Decision 3**: Confidence thresholds = **High: 3+/70%, Medium: 30%, Low: <30%** (confirmed in PRP)

### External Dependencies

- **Chonkie library**: Python package (install via pip)
- **Python 3.9+**: Required for Chonkie
- **Supabase Storage**: For saving chunks.json
- **PostgreSQL**: For chunker_type schema changes

### Contact & Support

- **PRP Document**: `docs/prps/chonkie-integration.md`
- **Chonkie Docs**: https://docs.chonkie.ai/oss/chunkers/overview
- **Chonkie GitHub**: https://github.com/chonkie-inc/chonkie

---

**Next Steps**:
1. Review this task breakdown with team
2. Assign tasks to developers
3. Begin Week 1 implementation (T-001: Python wrapper)
4. Track progress via this document (check off completed tasks)
5. Update estimates based on actual effort
