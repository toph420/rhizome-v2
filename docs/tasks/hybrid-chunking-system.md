# Hybrid Chunking System - Task Breakdown

**Source PRP**: [docs/prps/hybrid-chunking-system.md](../prps/hybrid-chunking-system.md)
**Feature Priority**: P1 (High)
**Estimated Total Effort**: 4.5 weeks
**Created**: 2025-10-15
**Status**: Ready for Implementation

---

## Overview

This task breakdown implements the Hybrid Chunking System, adding Chonkie's 6 chunker strategies as optional paths alongside the proven HybridChunker. The system enables per-document chunker selection while preserving the fast, reliable default path and guaranteeing metadata preservation via the bulletproof matcher.

### Key Deliverables
1. **Bulletproof Matcher Validation**: Verify content-offset sync and overlap detection (Phase 0)
2. **Chonkie Infrastructure**: Python wrapper with 6 chunker types and TypeScript IPC
3. **Metadata Transfer System**: Overlap-based metadata aggregation from Docling to Chonkie chunks
4. **UI Integration**: Per-document chunker selection with time estimates
5. **A/B Testing & Optimization**: Compare chunker quality and performance

### Business Impact
- **Quality Upgrade**: 15%+ connection quality improvement for semantic/neural chunkers
- **Flexibility**: Match chunker strategy to document type (narrative, technical, academic)
- **Zero Risk**: HybridChunker remains default, bulletproof matcher ensures metadata preservation
- **Cost**: $0 additional (all LOCAL mode processing)

---

## Phase 0: Bulletproof Matcher Validation (Week 0.5)

### T-001: Validate Bulletproof Matcher Content-Offset Sync

**Priority**: Critical
**Estimated Effort**: 4 hours
**Dependencies**: None

#### Task Purpose
**As a** developer preparing for Chonkie integration
**I need** to verify that the bulletproof matcher fix (removal of sequential ordering/proportional scaling) ensures content-offset synchronization
**So that** we can confidently use the coordinate map for metadata transfer

#### Context & Background
**Recent Fix**: The bulletproof matcher was fixed to remove sequential ordering and proportional scaling, which were causing content-offset desynchronization. This task validates that chunk offsets now match actual content positions.

**Why This Matters**: Chonkie metadata transfer depends on accurate overlap detection, which requires content offsets to match stored chunk positions. If offsets are wrong, metadata transfer will fail silently.

#### Technical Requirements

**Files to Test**:
```
worker/lib/local/bulletproof-matcher.ts - Matcher implementation (fixed)
worker/lib/local/bulletproof-metadata.ts - Metadata caching with matcher
src/components/reader/ChunkQualityPanel.tsx - Fix Position feature (UI validation)
```

**Functional Requirements**:
- REQ-1: When a chunk has stored offsets, the system shall return exact content at those positions
- REQ-2: When binary search maps a position to a chunk, the system shall return the correct chunk 100% of time
- REQ-3: When ChunkQualityPanel uses Fix Position, the system shall highlight the correct markdown block
- REQ-4: When overlap detection runs, the system shall find 70-90% of chunks have overlaps (this is GOOD)

**Validation Method**:
1. Reprocess 5-10 diverse test documents (narrative, technical, academic PDFs)
2. For each chunk, verify: `cleanedMarkdown.slice(start_offset, end_offset) === chunk.content`
3. Test binary search: For 10 random positions, map to chunks and verify content match
4. Test Fix Position UI: Click warning → verify correct block highlighted
5. Measure overlap rate: Should be 70-90% for most documents

#### Implementation Steps

1. **Create validation script**: `worker/scripts/validate-bulletproof-matcher.ts`
   - Test content-offset sync for all chunks in a document
   - Test binary search with 100 random positions
   - Measure overlap statistics
   - Report any desync issues

2. **Reprocess test documents**:
   ```bash
   # Use existing documents or upload new test cases
   # Diverse types: fiction, textbook, research paper, technical manual
   npx tsx worker/scripts/validate-bulletproof-matcher.ts <document_id>
   ```

3. **Test Fix Position UI**:
   - Open ChunkQualityPanel in reader
   - Click "Fix Position" on warning chunks
   - Verify highlighted block matches chunk content
   - Check browser console for offset calculation logs

4. **Document results**:
   - Create `docs/validation/bulletproof-matcher-validation.md`
   - Include pass/fail for each test document
   - Note any edge cases or issues found
   - Record overlap statistics

**Code Patterns to Follow**:
- **Validation Pattern**: `worker/lib/local/__tests__/test-orchestrator.ts` - Existing validation script
- **Binary Search**: `src/lib/reader/block-parser.ts:findChunkForBlock` - Position mapping logic
- **Fix Position**: `src/components/reader/ChunkQualityPanel.tsx:handleFixPosition` - UI feature

#### Acceptance Criteria

**Given-When-Then Scenarios**:
```gherkin
Scenario 1: Content-offset synchronization
  Given a document processed with bulletproof matcher
  When I extract content using chunk.start_offset and chunk.end_offset
  Then the extracted content must match chunk.content exactly
  And this must be true for 100% of chunks

Scenario 2: Binary search accuracy
  Given a document with 382 chunks
  When I test 100 random positions with binary search
  Then each position must map to the correct chunk
  And extracted content must match the chunk at that position

Scenario 3: Fix Position UI validation
  Given a chunk with validation warning in ChunkQualityPanel
  When I click "Fix Position"
  Then the reader should scroll to the correct markdown block
  And the block should be highlighted
  And the block content should match the chunk content

Scenario 4: Overlap detection
  Given a 500-page document processed with HybridChunker
  When overlap detection runs on all chunk pairs
  Then 70-90% of chunks should have at least one overlap
  And overlaps should have meaningful character overlap (>20 chars)
  And overlap rate <70% indicates potential matching failure
```

**Rule-Based Criteria**:
- [ ] **Content Sync**: 100% of chunks have content matching their offsets
- [ ] **Binary Search**: 100% accuracy for position-to-chunk mapping
- [ ] **Fix Position**: UI correctly highlights blocks for all tested chunks
- [ ] **Overlap Rate**: 70-90% of chunks have overlaps (expected and beneficial)
- [ ] **No Regressions**: No sequential ordering or proportional scaling artifacts
- [ ] **Documentation**: Validation results documented with pass/fail per document

#### Validation Commands

```bash
# Run validation script on test document
cd worker
npx tsx scripts/validate-bulletproof-matcher.ts <document_id>

# Expected output:
# ✓ Content-offset sync: 382/382 chunks (100%)
# ✓ Binary search accuracy: 100/100 positions (100%)
# ✓ Overlap detection: 342/382 chunks (89.5%)
# ✓ No desync artifacts detected

# Manual UI testing
# 1. Open document reader: http://localhost:3000/read/<document_id>
# 2. Open chunk quality panel (if available)
# 3. Click "Fix Position" on chunks with warnings
# 4. Verify correct blocks highlighted

# Test multiple document types
npx tsx scripts/validate-bulletproof-matcher.ts <narrative_pdf_id>
npx tsx scripts/validate-bulletproof-matcher.ts <technical_manual_id>
npx tsx scripts/validate-bulletproof-matcher.ts <research_paper_id>
```

#### Resources & References

**Documentation**:
- Bulletproof Matcher: `docs/processing-pipeline/bulletproof-metadata-extraction.md`
- PRP Section: Lines 419-445 (Phase 0 definition)

**Code References**:
- Matcher Implementation: `worker/lib/local/bulletproof-matcher.ts`
- Metadata Caching: `worker/lib/local/bulletproof-metadata.ts`
- Binary Search: `src/lib/reader/block-parser.ts:findChunkForBlock`
- Fix Position UI: `src/components/reader/ChunkQualityPanel.tsx:handleFixPosition`

---

### T-002: Document Overlap Detection as Feature (Not Bug)

**Priority**: High
**Estimated Effort**: 2 hours
**Dependencies**: T-001 (validation results needed)

#### Task Purpose
**As a** developer and future maintainer
**I need** clear documentation that overlaps are expected and beneficial for Chonkie metadata transfer
**So that** high overlap rates (70-90%) are not mistaken for matching failures

#### Context & Background
**Key Insight**: The bulletproof matcher's "94% overlap corrections" initially appeared to be a failure metric. In reality, it proves overlap detection works perfectly, which is exactly what Chonkie needs for metadata aggregation.

**For Chonkie**: Multiple Docling chunks overlapping with a single Chonkie chunk is the PRIMARY MECHANISM for metadata transfer. This is NOT a bug—it's the feature.

#### Technical Requirements

**Files to Update**:
```
docs/processing-pipeline/bulletproof-metadata-extraction.md - Add overlap section
worker/lib/chonkie/README.md - Create new doc explaining overlap-based metadata transfer
docs/prps/hybrid-chunking-system.md - Already updated (reference)
```

**Documentation Structure**:
1. **What are overlaps?**: Visual example with character ranges
2. **Why overlaps occur**: Different chunking boundaries (structural vs semantic)
3. **Why overlaps are beneficial**: Enable metadata aggregation across boundaries
4. **Expected overlap rates**: 70-90% for most documents
5. **When to worry**: Overlap rate <70% indicates potential matching issues
6. **Metadata aggregation logic**: How overlapping chunks contribute metadata

#### Implementation Steps

1. **Update bulletproof-metadata-extraction.md**:
   - Add new section: "Understanding Overlaps as a Feature"
   - Include visual example from PRP (lines 489-496)
   - Document expected overlap rates by document type
   - Add troubleshooting guide for low overlap rates

2. **Create worker/lib/chonkie/README.md**:
   - Explain Chonkie metadata transfer architecture
   - Detail overlap-based aggregation logic
   - Provide examples of metadata merging from multiple chunks
   - Document confidence scoring based on overlap count

3. **Add inline code comments**:
   - Update `worker/lib/chonkie/metadata-transfer.ts` (to be created in Phase 2)
   - Add comments explaining overlap detection and aggregation
   - Document edge cases (no overlap, single overlap, many overlaps)

4. **Create validation examples**:
   - Show real examples from test documents
   - Include overlap statistics from validation
   - Demonstrate successful metadata aggregation

**Code Patterns to Follow**:
- **Documentation Style**: `docs/local-pipeline-setup.md` - Detailed setup guide
- **Visual Examples**: `docs/ARCHITECTURE.md` - ASCII diagrams for clarity

#### Acceptance Criteria

**Rule-Based Criteria**:
- [ ] **Documentation Updated**: bulletproof-metadata-extraction.md has overlap section
- [ ] **New Doc Created**: worker/lib/chonkie/README.md explains overlap-based transfer
- [ ] **Visual Examples**: At least 2 diagrams showing overlap scenarios
- [ ] **Metrics Defined**: Clear thresholds for good (70-90%) vs concerning (<70%) overlap rates
- [ ] **Troubleshooting**: Guide for diagnosing low overlap rates
- [ ] **Code Comments**: Inline documentation in future metadata-transfer.ts

#### Validation Commands

```bash
# Verify documentation exists
ls -l docs/processing-pipeline/bulletproof-metadata-extraction.md
ls -l worker/lib/chonkie/README.md

# Check for key sections
grep -i "overlap" docs/processing-pipeline/bulletproof-metadata-extraction.md
grep -i "metadata transfer" worker/lib/chonkie/README.md

# Validate markdown formatting
npx markdownlint docs/processing-pipeline/bulletproof-metadata-extraction.md
npx markdownlint worker/lib/chonkie/README.md
```

#### Resources & References

**PRP References**:
- Phase 0 Context: Lines 419-445 (Validation phase)
- Overlap Explanation: Lines 488-496 (Visual example)
- Phase 2 Context: Lines 482-559 (Metadata transfer with overlaps)
- Success Metrics: Lines 1031 (Overlap coverage metric)

**Documentation Examples**:
- `docs/local-pipeline-setup.md` - Detailed setup guide style
- `docs/ARCHITECTURE.md` - Visual diagram examples

---

## Phase 1: Infrastructure Setup (Week 1)

### T-003: Install Chonkie and Create Python Wrapper

**Priority**: Critical
**Estimated Effort**: 6 hours
**Dependencies**: T-001 (Phase 0 complete)

#### Task Purpose
**As a** document processing pipeline
**I need** a Python script that supports all 6 Chonkie chunker types
**So that** I can chunk documents with semantic, recursive, neural, slumber, sentence, or token strategies

#### Context & Background
**Chonkie Library**: Python library with 6 chunker implementations, each optimized for different document types and quality requirements.

**Processing Mode**: All chunkers run in LOCAL mode (no API costs), with configurable parameters per chunker type.

#### Technical Requirements

**Files to Create**:
```
worker/scripts/chonkie_chunk.py - Python wrapper supporting all 6 chunker types
worker/scripts/requirements.txt - Update with chonkie dependency
```

**Functional Requirements**:
- REQ-1: When receiving markdown via stdin, the script shall parse JSON input
- REQ-2: When chunker_type is specified, the script shall initialize the correct Chonkie chunker
- REQ-3: When chunking completes, the script shall output JSON array of chunks with metadata
- REQ-4: When errors occur, the script shall write to stderr and exit with non-zero code
- REQ-5: When stdout is written, the script shall call sys.stdout.flush() to prevent IPC hangs

**Supported Chunker Types** (from PRP lines 188-399):
1. **SemanticChunker**: Embedding-based topic boundaries
2. **RecursiveChunker**: Hierarchical structural splits
3. **NeuralChunker**: BERT-based semantic shifts
4. **SlumberChunker**: Agentic LLM-based boundaries
5. **SentenceChunker**: Simple sentence-based splits
6. **TokenChunker**: Fixed token-count fallback

**Chunker-Specific Configuration**:
- Semantic: `embedding_model`, `threshold`
- Recursive: `separators` array
- Neural: `model` name
- Slumber: `model`, `strategy` (coherence/topic/structure)
- Sentence: minimal config
- Token: `tokenizer` name

#### Implementation Steps

1. **Install Chonkie**:
   ```bash
   cd worker
   pip install chonkie
   # Verify installation
   python3 -c "import chonkie; print(chonkie.__version__)"
   ```

2. **Create Python wrapper** (see PRP lines 648-740):
   ```python
   # worker/scripts/chonkie_chunk.py
   # - Parse JSON input from stdin
   # - Initialize chunker based on config.chunker_type
   # - Apply chunker-specific config
   # - Chunk markdown
   # - Output JSON array: [{text, start_index, end_index, token_count, chunker_type}]
   # - Handle errors with proper stderr logging
   # - CRITICAL: sys.stdout.flush() after JSON write to prevent IPC hangs
   ```

3. **Add error handling**:
   - Unknown chunker type → ValueError with helpful message
   - Chunking failure → Exception with traceback to stderr
   - OOM errors → Graceful failure message
   - Always exit with proper code (0 success, 1 failure)

4. **Add configuration defaults**:
   - Default chunk_size: 768 (matches HybridChunker)
   - Default threshold (semantic): 0.7
   - Default separators (recursive): `["\n\n", "\n", " ", ""]`
   - Default model (neural): "bert-base-uncased"
   - Default strategy (slumber): "coherence"

5. **Test with sample markdown**:
   ```bash
   echo '{"markdown": "# Test\n\nContent here.", "config": {"chunker_type": "semantic"}}' | \
     python3 worker/scripts/chonkie_chunk.py
   ```

**Code Patterns to Follow**:
- **Python IPC**: `worker/scripts/docling_extract.py` - Stdin/stdout JSON pattern
- **Flush Requirement**: `worker/scripts/extract_metadata_pydantic.py` - sys.stdout.flush() pattern
- **Error Handling**: `worker/scripts/ollama_cleanup.py` - Stderr and exit codes

**Critical Anti-Pattern**:
```python
# ❌ NEVER forget sys.stdout.flush() - IPC will hang
print(json.dumps(output))
sys.exit(0)

# ✅ ALWAYS flush after print
print(json.dumps(output), flush=True)
sys.stdout.flush()
sys.exit(0)
```

#### Acceptance Criteria

**Given-When-Then Scenarios**:
```gherkin
Scenario 1: Semantic chunker works correctly
  Given markdown text with 3 paragraphs
  When I call chonkie_chunk.py with chunker_type="semantic"
  Then I should receive JSON array of chunks
  And each chunk should have text, start_index, end_index, token_count, chunker_type
  And chunker_type should be "semantic"
  And chunks should not exceed 768 tokens

Scenario 2: All 6 chunker types succeed
  Given the same markdown input
  When I test each chunker type (semantic, recursive, neural, slumber, sentence, token)
  Then all should return valid chunk arrays
  And each should have appropriate boundary characteristics
  And none should throw unhandled exceptions

Scenario 3: Error handling works
  Given invalid chunker type "invalid"
  When I call chonkie_chunk.py
  Then the script should write error to stderr
  And exit with code 1
  And error message should list valid chunker types

Scenario 4: Character offsets are accurate
  Given markdown text "Hello World"
  When chunker returns chunk with start_index=0, end_index=11
  Then markdown[0:11] should equal the chunk's text field
  And this should be true for all chunks
```

**Rule-Based Criteria**:
- [ ] **Functional**: All 6 chunker types work correctly
- [ ] **Character Offsets**: Chunk offsets match actual markdown positions (critical for metadata transfer)
- [ ] **Error Handling**: Invalid chunker type caught with helpful error
- [ ] **IPC Safety**: sys.stdout.flush() called after all stdout writes
- [ ] **Configuration**: Chunker-specific configs applied correctly
- [ ] **Token Limits**: No chunk exceeds 768 tokens
- [ ] **JSON Output**: Valid JSON with expected schema

#### Validation Commands

```bash
# Install Chonkie
cd worker
pip install chonkie

# Test semantic chunker
echo '{"markdown": "# Chapter 1\n\nFirst paragraph.\n\nSecond paragraph.", "config": {"chunker_type": "semantic", "chunk_size": 768}}' | \
  python3 scripts/chonkie_chunk.py

# Test all 6 chunker types
for chunker in semantic recursive neural slumber sentence token; do
  echo "Testing $chunker..."
  echo '{"markdown": "Test content", "config": {"chunker_type": "'$chunker'"}}' | \
    python3 scripts/chonkie_chunk.py
done

# Test error handling
echo '{"markdown": "Test", "config": {"chunker_type": "invalid"}}' | \
  python3 scripts/chonkie_chunk.py
# Should exit with code 1 and error message

# Verify character offset accuracy
npx tsx scripts/test-chonkie-offsets.ts

# Type checking (TypeScript)
cd ..
npx tsc --noEmit
```

#### Resources & References

**Documentation**:
- Chonkie Docs: https://docs.chonkie.ai
- Chunker Overview: https://docs.chonkie.ai/oss/chunkers/overview
- PRP Python Script: Lines 648-740

**Code References**:
- Python IPC Pattern: `worker/scripts/docling_extract.py`
- Flush Requirement: `worker/scripts/extract_metadata_pydantic.py`
- Error Handling: `worker/lib/local/ollama-cleanup.ts` (TypeScript wrapper pattern)

---

### T-004: Create TypeScript IPC Wrapper for Chonkie

**Priority**: Critical
**Estimated Effort**: 5 hours
**Dependencies**: T-003 (Python script must exist)

#### Task Purpose
**As a** document processor
**I need** a TypeScript function to call Chonkie via subprocess IPC
**So that** I can integrate Chonkie chunking into the processing pipeline

#### Context & Background
**IPC Pattern**: Spawn Python subprocess, write JSON to stdin, read JSON from stdout, handle errors from stderr.

**Timeout Handling**: Different chunker types have different speed profiles. Neural and Slumber are slowest (90-180 seconds).

#### Technical Requirements

**Files to Create**:
```
worker/lib/chonkie/chonkie-chunker.ts - TypeScript IPC wrapper
worker/lib/chonkie/types.ts - TypeScript interfaces for Chonkie
```

**Functional Requirements**:
- REQ-1: When calling chonkieChunk(), the system shall spawn python3 subprocess
- REQ-2: When timeout is reached, the system shall kill process and reject promise
- REQ-3: When Python writes to stderr, the system shall log warnings (not fatal)
- REQ-4: When Python exits non-zero, the system shall reject with descriptive error
- REQ-5: When chunking succeeds, the system shall parse and return ChonkieChunk[]

**TypeScript Types** (from PRP lines 744-835):
```typescript
export type ChunkerType =
  | 'semantic' | 'recursive' | 'neural'
  | 'slumber' | 'sentence' | 'token'

export interface ChonkieConfig {
  chunker_type: ChunkerType
  chunk_size?: number
  timeout?: number
  // Chunker-specific configs
  embedding_model?: string
  threshold?: number
  separators?: string[]
  model?: string
  strategy?: 'coherence' | 'topic' | 'structure'
}

export interface ChonkieChunk {
  text: string
  start_index: number
  end_index: number
  token_count: number
  chunker_type: ChunkerType
}
```

**Timeout Defaults by Chunker**:
- Semantic: 120 seconds
- Recursive: 90 seconds
- Neural: 180 seconds
- Slumber: 240 seconds
- Sentence: 60 seconds
- Token: 60 seconds

#### Implementation Steps

1. **Create TypeScript types**:
   - `worker/lib/chonkie/types.ts` with ChunkerType, ChonkieConfig, ChonkieChunk
   - Export all types
   - Add JSDoc comments with usage examples

2. **Create IPC wrapper** (see PRP lines 744-835):
   ```typescript
   // worker/lib/chonkie/chonkie-chunker.ts
   export async function chonkieChunk(
     cleanedMarkdown: string,
     config: ChonkieConfig
   ): Promise<ChonkieChunk[]>
   ```

3. **Implement subprocess logic**:
   - Spawn `python3 worker/scripts/chonkie_chunk.py`
   - Set timeout based on chunker type (or use config.timeout)
   - Write JSON input to stdin: `{markdown, config}`
   - Collect stdout (JSON chunks) and stderr (logs)
   - Parse stdout as ChonkieChunk[]
   - Handle errors with descriptive messages

4. **Add error context**:
   - Include chunker type in error messages
   - Include exit code and stderr output
   - Include timeout value if timeout occurred
   - Suggest troubleshooting steps (check Python install, increase timeout)

5. **Test with all chunker types**:
   ```bash
   cd worker
   npx tsx -e "
   import { chonkieChunk } from './lib/chonkie/chonkie-chunker'
   const chunks = await chonkieChunk('# Test\n\nContent', {
     chunker_type: 'semantic',
     threshold: 0.7
   })
   console.log(chunks)
   "
   ```

**Code Patterns to Follow**:
- **Subprocess IPC**: `worker/lib/local/ollama-cleanup.ts:ollamaCleanup()` - Spawn and IPC pattern
- **Timeout Handling**: `worker/lib/local/ollama-client.ts:generateWithTimeout()` - Timeout pattern
- **Error Messages**: `worker/lib/errors.ts` - Descriptive error classes

#### Acceptance Criteria

**Given-When-Then Scenarios**:
```gherkin
Scenario 1: Successful chunking
  Given cleaned markdown text
  When chonkieChunk is called with semantic config
  Then it should return array of ChonkieChunk objects
  And each chunk should have all required fields
  And chunks should be sorted by start_index

Scenario 2: Timeout handling
  Given a very large document (10MB markdown)
  When chonkieChunk is called with 5-second timeout
  Then it should timeout and reject promise
  And error message should mention timeout
  And Python process should be killed

Scenario 3: Python error propagation
  Given invalid chunker type in config
  When chonkieChunk is called
  Then it should reject with descriptive error
  And error should include stderr output from Python
  And error should suggest valid chunker types

Scenario 4: All chunker types work
  Given the same markdown input
  When testing all 6 chunker types
  Then all should successfully return chunks
  And each should apply correct chunker-specific config
  And chunk boundaries should reflect chunker strategy
```

**Rule-Based Criteria**:
- [ ] **Functional**: All 6 chunker types work via IPC
- [ ] **Timeout**: Process killed after timeout, promise rejected
- [ ] **Error Handling**: Python errors caught and wrapped with context
- [ ] **Type Safety**: All types properly defined and exported
- [ ] **Logging**: Stderr logged as warnings, not errors
- [ ] **Performance**: No unnecessary delays (immediate stdin write, immediate stdout parsing)
- [ ] **Documentation**: JSDoc comments with usage examples

#### Validation Commands

```bash
# Unit tests
cd worker
npx jest lib/chonkie/__tests__/chonkie-chunker.test.ts

# Integration test (requires Python script)
npx tsx lib/chonkie/__tests__/test-all-chunkers.ts

# Type checking
npx tsc --noEmit

# Manual testing
npx tsx -e "
import { chonkieChunk } from './lib/chonkie/chonkie-chunker'

// Test semantic chunker
const chunks = await chonkieChunk('# Chapter 1\n\nFirst paragraph.\n\nSecond paragraph.', {
  chunker_type: 'semantic',
  chunk_size: 768,
  threshold: 0.7
})

console.log('Chunks:', chunks.length)
console.log('First chunk:', chunks[0])
"

# Test timeout
npx tsx -e "
import { chonkieChunk } from './lib/chonkie/chonkie-chunker'
const largeMarkdown = '# Huge doc\n\n' + 'Content '.repeat(100000)
await chonkieChunk(largeMarkdown, { chunker_type: 'neural', timeout: 1000 })
// Should timeout and reject
"
```

#### Resources & References

**Documentation**:
- Node.js child_process: https://nodejs.org/api/child_process.html
- PRP TypeScript Wrapper: Lines 744-835

**Code References**:
- Subprocess IPC: `worker/lib/local/ollama-cleanup.ts:ollamaCleanup()`
- Timeout Pattern: `worker/lib/local/ollama-client.ts:generateWithTimeout()`
- Error Classes: `worker/lib/errors.ts`

---

### T-005: Database Migration for Chunker Type

**Priority**: Critical
**Estimated Effort**: 3 hours
**Dependencies**: None (can run parallel with T-003/T-004)

#### Task Purpose
**As a** database administrator
**I need** a migration adding chunker_type column to chunks and documents tables
**So that** the system can track which chunker was used for each chunk

#### Context & Background
**Chunker Tracking**: Each chunk needs to know which chunker created it for analytics, comparison, and reprocessing decisions.

**User Preferences**: Users can set a default chunker type for new documents.

#### Technical Requirements

**Files to Create**:
```
supabase/migrations/050_add_chunker_type.sql - Migration adding chunker_type support
```

**Database Changes**:
1. Add `chunker_type` column to `chunks` table
2. Add `chunker_type` column to `documents` table
3. Add `default_chunker_type` to `user_preferences` table
4. Add indexes for querying by chunker type
5. Add CHECK constraints for valid chunker types

**Valid Chunker Types** (from PRP lines 843-875):
- `hybrid` (default, HybridChunker)
- `semantic` (Chonkie SemanticChunker)
- `recursive` (Chonkie RecursiveChunker)
- `neural` (Chonkie NeuralChunker)
- `slumber` (Chonkie SlumberChunker)
- `sentence` (Chonkie SentenceChunker)
- `token` (Chonkie TokenChunker)

#### Implementation Steps

1. **Create migration file**:
   ```bash
   cd supabase/migrations
   # Find latest migration number
   ls -1 | tail -1  # Should be 049_*
   # Create new migration
   touch 050_add_chunker_type.sql
   ```

2. **Write migration SQL** (see PRP lines 839-875):
   ```sql
   -- Add chunker_type to chunks table
   ALTER TABLE chunks
   ADD COLUMN chunker_type TEXT NOT NULL DEFAULT 'hybrid'
   CHECK (chunker_type IN (
     'hybrid', 'semantic', 'recursive', 'neural',
     'slumber', 'sentence', 'token'
   ));

   -- Add chunker_type to documents table
   ALTER TABLE documents
   ADD COLUMN chunker_type TEXT DEFAULT 'hybrid'
   CHECK (chunker_type IN (
     'hybrid', 'semantic', 'recursive', 'neural',
     'slumber', 'sentence', 'token'
   ));

   -- Add default_chunker_type to user_preferences
   ALTER TABLE user_preferences
   ADD COLUMN default_chunker_type TEXT DEFAULT 'hybrid'
   CHECK (default_chunker_type IN (
     'hybrid', 'semantic', 'recursive', 'neural',
     'slumber', 'sentence', 'token'
   ));

   -- Add indexes
   CREATE INDEX idx_chunks_chunker_type ON chunks(chunker_type);
   CREATE INDEX idx_chunks_doc_chunker ON chunks(document_id, chunker_type);
   CREATE INDEX idx_documents_chunker_type ON documents(chunker_type);
   ```

3. **Test migration locally**:
   ```bash
   # Reset database with new migration
   npx supabase db reset

   # Verify columns added
   npx supabase db query "SELECT column_name, data_type, column_default
                          FROM information_schema.columns
                          WHERE table_name = 'chunks'
                          AND column_name = 'chunker_type';"

   # Test CHECK constraint
   npx supabase db query "INSERT INTO chunks (chunker_type, ...)
                          VALUES ('invalid', ...);"
   # Should fail with CHECK constraint error
   ```

4. **Update TypeScript types**:
   ```typescript
   // Update src/lib/types/database.ts
   export type ChunkerType =
     | 'hybrid' | 'semantic' | 'recursive'
     | 'neural' | 'slumber' | 'sentence' | 'token'

   export interface Chunk {
     // ... existing fields
     chunker_type: ChunkerType
   }

   export interface Document {
     // ... existing fields
     chunker_type: ChunkerType | null
   }

   export interface UserPreferences {
     // ... existing fields
     default_chunker_type: ChunkerType
   }
   ```

**Code Patterns to Follow**:
- **Migration Format**: `supabase/migrations/047_chunk_metadata_enhancements.sql` - Recent migration example
- **CHECK Constraints**: `supabase/migrations/016_user_preferences.sql` - Enum-like constraints
- **Indexes**: `supabase/migrations/010_chunks_table.sql` - Index patterns

#### Acceptance Criteria

**Given-When-Then Scenarios**:
```gherkin
Scenario 1: Migration applies successfully
  Given a fresh database
  When I run npx supabase db reset
  Then migration 050 should apply without errors
  And chunks table should have chunker_type column
  And documents table should have chunker_type column
  And user_preferences table should have default_chunker_type column

Scenario 2: Default values work
  Given an existing chunks row
  When chunker_type is not specified
  Then it should default to 'hybrid'
  And queries should return 'hybrid' for chunker_type

Scenario 3: CHECK constraints enforce valid types
  Given a chunks insert with chunker_type='invalid'
  When the insert is executed
  Then it should fail with CHECK constraint violation
  And error message should list valid types

Scenario 4: Indexes improve query performance
  Given 10,000 chunks with mixed chunker types
  When querying WHERE chunker_type = 'semantic'
  Then the query should use idx_chunks_chunker_type
  And execution should be fast (<10ms)
```

**Rule-Based Criteria**:
- [ ] **Migration Success**: Applies cleanly on fresh database
- [ ] **Backward Compatibility**: Existing chunks default to 'hybrid'
- [ ] **Data Integrity**: CHECK constraints prevent invalid types
- [ ] **Performance**: Indexes created for common query patterns
- [ ] **Type Safety**: TypeScript types updated to match schema
- [ ] **Documentation**: Migration includes comments explaining purpose

#### Validation Commands

```bash
# Apply migration
npx supabase db reset

# Verify schema changes
npx supabase db query "
  SELECT column_name, data_type, column_default, is_nullable
  FROM information_schema.columns
  WHERE table_name IN ('chunks', 'documents', 'user_preferences')
  AND column_name LIKE '%chunker_type%';
"

# Test CHECK constraints
npx supabase db query "
  INSERT INTO chunks (
    document_id, content, start_offset, end_offset,
    token_count, chunker_type
  )
  VALUES (
    '00000000-0000-0000-0000-000000000000',
    'test', 0, 4, 1, 'invalid'
  );
"
# Should fail with CHECK violation

# Verify indexes
npx supabase db query "
  SELECT indexname, indexdef
  FROM pg_indexes
  WHERE tablename = 'chunks'
  AND indexname LIKE '%chunker%';
"

# Test default values
npx supabase db query "
  SELECT chunker_type
  FROM chunks
  WHERE chunker_type = 'hybrid'
  LIMIT 5;
"

# Type checking
npx tsc --noEmit
```

#### Resources & References

**Documentation**:
- Supabase Migrations: https://supabase.com/docs/guides/cli/local-development#database-migrations
- PostgreSQL CHECK: https://www.postgresql.org/docs/current/ddl-constraints.html
- PRP Migration: Lines 839-875

**Code References**:
- Recent Migration: `supabase/migrations/047_chunk_metadata_enhancements.sql`
- CHECK Constraints: `supabase/migrations/016_user_preferences.sql`
- Index Patterns: `supabase/migrations/010_chunks_table.sql`

---

### T-006: Unit Tests for Chonkie Infrastructure

**Priority**: High
**Estimated Effort**: 4 hours
**Dependencies**: T-003, T-004 (Python script and TypeScript wrapper)

#### Task Purpose
**As a** quality assurance developer
**I need** comprehensive unit tests for Chonkie chunking infrastructure
**So that** regressions are caught early and all chunker types work correctly

#### Context & Background
**Testing Strategy**: Mock Python subprocess for unit tests (fast), use real subprocess for integration tests (slower but comprehensive).

**Coverage Goals**: 90%+ coverage for chonkie-chunker.ts, all 6 chunker types tested.

#### Technical Requirements

**Files to Create**:
```
worker/lib/chonkie/__tests__/chonkie-chunker.test.ts - Unit tests with mocked subprocess
worker/lib/chonkie/__tests__/test-all-chunkers.ts - Integration tests with real Python
```

**Test Coverage Requirements**:
- All 6 chunker types produce valid output
- Character offset accuracy (critical for metadata transfer)
- Timeout handling works correctly
- Error handling catches Python failures
- Chunker-specific configs applied correctly
- JSON parsing handles malformed output

#### Implementation Steps

1. **Create unit tests with mocked subprocess**:
   ```typescript
   // worker/lib/chonkie/__tests__/chonkie-chunker.test.ts
   import { chonkieChunk } from '../chonkie-chunker'
   import { spawn } from 'child_process'

   jest.mock('child_process')

   describe('Chonkie Multi-Strategy Chunker', () => {
     const testMarkdown = '# Chapter 1\n\nFirst paragraph.\n\nSecond paragraph.'

     test.each([
       ['semantic', { threshold: 0.7 }],
       ['recursive', { separators: ['\n\n', '\n'] }],
       ['sentence', {}],
       ['token', {}]
     ])('%s chunker produces valid chunks', async (chunkerType, config) => {
       // Mock subprocess to return valid chunks
       const mockChunks = [
         {
           text: 'First paragraph.',
           start_index: 15,
           end_index: 31,
           token_count: 3,
           chunker_type: chunkerType
         }
       ]

       mockSpawn(JSON.stringify(mockChunks), '', 0)

       const chunks = await chonkieChunk(testMarkdown, {
         chunker_type: chunkerType as ChunkerType,
         chunk_size: 768,
         ...config
       })

       expect(chunks.length).toBeGreaterThan(0)
       expect(chunks[0].chunker_type).toBe(chunkerType)
       expect(chunks[0].token_count).toBeLessThanOrEqual(768)
     })

     test('character offsets match content', async () => {
       const chunks = await chonkieChunk(testMarkdown, {
         chunker_type: 'semantic'
       })

       chunks.forEach(chunk => {
         const extracted = testMarkdown.slice(chunk.start_index, chunk.end_index)
         expect(extracted).toBe(chunk.text)
       })
     })

     test('timeout handling works', async () => {
       mockSpawnHang() // Mock subprocess that never exits

       await expect(
         chonkieChunk(testMarkdown, {
           chunker_type: 'neural',
           timeout: 100
         })
       ).rejects.toThrow(/timed out/)
     })
   })
   ```

2. **Create integration tests with real Python**:
   ```typescript
   // worker/lib/chonkie/__tests__/test-all-chunkers.ts
   import { chonkieChunk } from '../chonkie-chunker'

   // Run with: npx tsx lib/chonkie/__tests__/test-all-chunkers.ts
   async function testAllChunkers() {
     const markdown = '# Test Document\n\nParagraph 1.\n\nParagraph 2.'

     const chunkerTypes: ChunkerType[] = [
       'semantic', 'recursive', 'neural',
       'slumber', 'sentence', 'token'
     ]

     for (const chunkerType of chunkerTypes) {
       console.log(`\nTesting ${chunkerType}...`)

       const chunks = await chonkieChunk(markdown, {
         chunker_type: chunkerType,
         chunk_size: 768
       })

       console.log(`  ✓ Chunks: ${chunks.length}`)
       console.log(`  ✓ First chunk: ${chunks[0].text.slice(0, 50)}...`)

       // Verify character offsets
       chunks.forEach((chunk, i) => {
         const extracted = markdown.slice(chunk.start_index, chunk.end_index)
         if (extracted !== chunk.text) {
           throw new Error(`Offset mismatch in chunk ${i}`)
         }
       })

       console.log(`  ✓ Character offsets valid`)
     }

     console.log('\n✅ All chunker types passed!')
   }

   testAllChunkers().catch(console.error)
   ```

3. **Add test fixtures**:
   - Small markdown (5 paragraphs)
   - Medium markdown (20 paragraphs)
   - Large markdown (100 paragraphs)
   - Edge cases (empty, single paragraph, no headings)

4. **Add snapshot tests**:
   ```typescript
   test('semantic chunker output matches snapshot', async () => {
     const chunks = await chonkieChunk(fixtureMarkdown, {
       chunker_type: 'semantic',
       threshold: 0.7
     })

     expect(chunks).toMatchSnapshot()
   })
   ```

**Code Patterns to Follow**:
- **Mocking Subprocess**: `worker/lib/local/__tests__/test-layer1-fuzzy.ts` - Mock patterns
- **Integration Tests**: `worker/tests/integration/` - Real subprocess testing
- **Test Structure**: PRP lines 883-992 (test examples)

#### Acceptance Criteria

**Rule-Based Criteria**:
- [ ] **Coverage**: >90% line coverage for chonkie-chunker.ts
- [ ] **All Chunker Types**: Each of 6 chunker types has dedicated test
- [ ] **Character Offsets**: Offset accuracy tested for all chunkers
- [ ] **Error Handling**: Python errors, timeouts, and malformed output tested
- [ ] **Integration Tests**: Real Python subprocess tested in CI (optional) or manual script
- [ ] **Snapshot Tests**: Output stability tracked via snapshots
- [ ] **Documentation**: Test file has comments explaining mock strategy

#### Validation Commands

```bash
# Run unit tests (fast, mocked)
cd worker
npx jest lib/chonkie/__tests__/chonkie-chunker.test.ts

# Run integration tests (slow, real Python)
npx tsx lib/chonkie/__tests__/test-all-chunkers.ts

# Coverage report
npx jest --coverage lib/chonkie/__tests__/chonkie-chunker.test.ts

# Test specific chunker
npx jest -t "semantic chunker produces valid chunks"

# Update snapshots
npx jest --updateSnapshot lib/chonkie/__tests__/chonkie-chunker.test.ts
```

#### Resources & References

**Documentation**:
- Jest Mocking: https://jestjs.io/docs/mock-functions
- PRP Test Examples: Lines 883-992

**Code References**:
- Mocking Pattern: `worker/lib/local/__tests__/test-layer1-fuzzy.ts`
- Integration Tests: `worker/tests/integration/pdf-processing.test.ts`

---

## Phase 2: Metadata Transfer System (Week 2)

### T-007: Create Metadata Transfer Module

**Priority**: Critical
**Estimated Effort**: 8 hours
**Dependencies**: T-001 (validation), T-004 (TypeScript wrapper), T-005 (migration)

#### Task Purpose
**As a** Chonkie chunker integration
**I need** a module that transfers Docling metadata to Chonkie chunks via overlap detection
**So that** Chonkie chunks preserve heading_path, page numbers, and other structural metadata

#### Context & Background
**Key Insight from Phase 0**: Overlaps are EXPECTED and BENEFICIAL. The bulletproof matcher's overlap detection is the PRIMARY MECHANISM for metadata transfer.

**Overlap Mechanics**:
- Docling chunks: Structural boundaries (heading breaks, page breaks)
- Chonkie chunks: Semantic boundaries (topic shifts, sentence groups)
- Expected: 1-3 Docling chunks overlap with each Chonkie chunk
- Overlap rate: 70-90% indicates successful potential for metadata aggregation

**Metadata Aggregation Strategy**:
1. Find all Docling chunks overlapping a Chonkie chunk
2. Merge heading_path arrays (union of all paths)
3. Use earliest page_start, latest page_end
4. Aggregate bboxes for citation support
5. Track confidence based on overlap count

#### Technical Requirements

**Files to Create**:
```
worker/lib/chonkie/metadata-transfer.ts - Overlap-based metadata transfer
worker/lib/chonkie/types.ts - Update with metadata transfer types
```

**Functional Requirements**:
- REQ-1: When a Chonkie chunk overlaps 1+ Docling chunks, the system shall aggregate metadata from all
- REQ-2: When multiple heading_paths exist, the system shall merge into union array
- REQ-3: When page ranges exist, the system shall use min(page_start) and max(page_end)
- REQ-4: When no overlaps exist (rare), the system shall interpolate metadata from neighbors
- REQ-5: When confidence is calculated, the system shall use overlap count and character overlap percentage

**Overlap Detection Logic**:
```typescript
// Two chunks overlap if:
// docling.start_offset < chonkie.end_index AND
// docling.end_offset > chonkie.start_index

// Overlap percentage:
// overlap_chars / min(docling_length, chonkie_length) * 100
```

**Confidence Levels**:
- **High (>0.9)**: 3+ Docling overlaps, >50% character overlap
- **Medium (0.7-0.9)**: 1-2 Docling overlaps, 20-50% overlap
- **Low (<0.7)**: Interpolated metadata, no direct overlap

#### Implementation Steps

1. **Create overlap detection function**:
   ```typescript
   // worker/lib/chonkie/metadata-transfer.ts

   function findOverlappingMatches(
     chonkieChunk: ChonkieChunk,
     doclingChunks: MatchResult[]
   ): Array<{match: MatchResult, overlapChars: number}> {
     const overlapping = doclingChunks.filter(docling =>
       docling.start_offset < chonkieChunk.end_index &&
       docling.end_offset > chonkieChunk.start_index
     )

     return overlapping.map(match => ({
       match,
       overlapChars: calculateOverlapChars(chonkieChunk, match)
     }))
   }
   ```

2. **Create metadata aggregation function**:
   ```typescript
   function aggregateMetadata(
     overlapping: Array<{match: MatchResult, overlapChars: number}>
   ): AggregatedMetadata {
     if (overlapping.length === 0) {
       return { confidence: 0, interpolated: true }
     }

     // Merge heading_path arrays (union)
     const heading_paths = new Set<string>()
     overlapping.forEach(({ match }) => {
       match.heading_path?.forEach(h => heading_paths.add(h))
     })

     // Use earliest page_start, latest page_end
     const page_start = Math.min(...overlapping.map(o => o.match.page_start).filter(Boolean))
     const page_end = Math.max(...overlapping.map(o => o.match.page_end).filter(Boolean))

     // Aggregate bboxes
     const bboxes = overlapping.flatMap(o => o.match.bboxes || [])

     // Calculate confidence
     const totalOverlapChars = overlapping.reduce((sum, o) => sum + o.overlapChars, 0)
     const confidence = calculateConfidence(overlapping.length, totalOverlapChars)

     return {
       heading_path: Array.from(heading_paths),
       page_start,
       page_end,
       bboxes,
       confidence,
       interpolated: false
     }
   }
   ```

3. **Create main transfer function**:
   ```typescript
   export function transferMetadataToChonkieChunks(
     chonkieChunks: ChonkieChunk[],
     bulletproofMatches: MatchResult[]
   ): ProcessedChunk[] {
     return chonkieChunks.map((chonkieChunk, idx) => {
       const overlapping = findOverlappingMatches(chonkieChunk, bulletproofMatches)

       if (overlapping.length === 0) {
         console.warn(`Chonkie chunk ${idx} has no Docling overlaps, interpolating metadata`)
       }

       const metadata = aggregateMetadata(overlapping)

       return {
         content: chonkieChunk.text,
         start_offset: chonkieChunk.start_index,
         end_offset: chonkieChunk.end_index,
         token_count: chonkieChunk.token_count,
         ...metadata,
         chunker_type: chonkieChunk.chunker_type,
         metadata_overlap_count: overlapping.length
       }
     })
   }
   ```

4. **Add interpolation for no-overlap cases**:
   ```typescript
   function interpolateMetadata(
     chonkieChunk: ChonkieChunk,
     allMatches: MatchResult[],
     idx: number
   ): AggregatedMetadata {
     // Find nearest Docling chunks before and after
     const before = allMatches
       .filter(m => m.end_offset <= chonkieChunk.start_index)
       .sort((a, b) => b.end_offset - a.end_offset)[0]

     const after = allMatches
       .filter(m => m.start_offset >= chonkieChunk.end_index)
       .sort((a, b) => a.start_offset - b.start_offset)[0]

     // Use before metadata if available, else after
     const source = before || after
     if (!source) {
       return { confidence: 0, interpolated: true }
     }

     return {
       heading_path: source.heading_path,
       page_start: source.page_start,
       page_end: source.page_end,
       confidence: 0.5, // Low confidence for interpolated
       interpolated: true
     }
   }
   ```

5. **Add validation and logging**:
   - Log overlap statistics (count, percentage, confidence distribution)
   - Warn if overlap rate <70% (indicates matching issues)
   - Validate metadata completeness (heading_path, page_start exist)

**Code Patterns to Follow**:
- **Overlap Logic**: PRP lines 513-551 (overlap detection algorithm)
- **Metadata Aggregation**: PRP lines 488-496 (visual example)
- **Bulletproof Matcher**: `worker/lib/local/bulletproof-matcher.ts` - Similar overlap detection

#### Acceptance Criteria

**Given-When-Then Scenarios**:
```gherkin
Scenario 1: Multiple Docling chunks overlap Chonkie chunk
  Given a Chonkie chunk at [16500-17100]
  And Docling chunks at [16841-17054], [17055-17300]
  When transferMetadataToChonkieChunks is called
  Then the Chonkie chunk should have metadata from both Docling chunks
  And heading_path should be union of both arrays
  And page_start should be min, page_end should be max
  And confidence should be HIGH (>0.9)
  And metadata_overlap_count should be 2

Scenario 2: No overlaps (rare edge case)
  Given a Chonkie chunk with no overlapping Docling chunks
  When transferMetadataToChonkieChunks is called
  Then metadata should be interpolated from nearest neighbors
  And confidence should be LOW (<0.7)
  And interpolated flag should be true
  And a warning should be logged

Scenario 3: High overlap rate indicates success
  Given 382 Chonkie chunks
  When metadata transfer completes
  Then >90% of chunks should have at least 1 overlap
  And 70-90% should have 1-3 overlaps
  And average confidence should be >0.8
  And overlap statistics should be logged

Scenario 4: Metadata completeness validation
  Given all Chonkie chunks after metadata transfer
  When validating metadata
  Then >90% should have heading_path populated
  And >95% should have page_start/page_end
  And all should have confidence score
  And all should have metadata_overlap_count
```

**Rule-Based Criteria**:
- [ ] **Functional**: Metadata transfer works for all 6 chunker types
- [ ] **Overlap Detection**: Correctly identifies all overlapping Docling chunks
- [ ] **Metadata Aggregation**: Properly merges heading_path, pages, bboxes
- [ ] **Interpolation**: Handles no-overlap cases gracefully
- [ ] **Confidence Tracking**: Assigns confidence based on overlap quality
- [ ] **Validation**: >90% of chunks have at least one overlap
- [ ] **Logging**: Logs statistics (overlap rate, confidence distribution)
- [ ] **Documentation**: Inline comments explain overlap-based transfer

#### Validation Commands

```bash
# Unit tests
cd worker
npx jest lib/chonkie/__tests__/metadata-transfer.test.ts

# Integration test with real PDF
npx tsx scripts/test-chonkie-metadata-transfer.ts <document_id>

# Expected output:
# ✓ Chonkie chunks: 370
# ✓ Docling matches: 382
# ✓ Chunks with overlaps: 350/370 (94.6%)
# ✓ Average overlaps per chunk: 2.3
# ✓ Average confidence: 0.87
# ✓ High confidence: 280 (75.7%)
# ✓ Medium confidence: 70 (18.9%)
# ✓ Low confidence: 20 (5.4%)
# ✓ Interpolated: 5 (1.4%)

# Validate metadata completeness
npx tsx scripts/validate-chonkie-metadata.ts <document_id>

# Test all chunker types
for chunker in semantic recursive sentence; do
  npx tsx scripts/test-chonkie-metadata-transfer.ts <document_id> --chunker=$chunker
done
```

#### Resources & References

**Documentation**:
- PRP Metadata Transfer: Lines 482-559
- PRP Overlap Explanation: Lines 488-496
- Phase 0 Overlap Validation: Lines 419-445

**Code References**:
- Bulletproof Matcher: `worker/lib/local/bulletproof-matcher.ts`
- Metadata Types: `worker/lib/chunking/pydantic-metadata.ts`

---

### T-008: Integration Tests for Metadata Transfer

**Priority**: High
**Estimated Effort**: 6 hours
**Dependencies**: T-007 (metadata transfer module)

#### Task Purpose
**As a** quality assurance developer
**I need** integration tests validating metadata transfer with real PDFs
**So that** I can ensure >90% overlap coverage and proper metadata aggregation

#### Context & Background
**Test Strategy**: Use real PDF processing with all chunker types, measure overlap rates and metadata completeness.

**Success Metrics** (from PRP lines 1027-1054):
- Overlap coverage: 70-90% of chunks have overlaps (not 100%!)
- Metadata recovery: >90% of chunks have heading_path or page numbers
- Confidence distribution: >75% high confidence, <5% interpolated

#### Technical Requirements

**Files to Create**:
```
worker/tests/integration/chonkie-metadata-transfer.test.ts - Jest integration tests
worker/scripts/test-chonkie-metadata-transfer.ts - Manual validation script
```

**Test Documents**:
- Small narrative PDF (50 pages)
- Medium technical manual (200 pages)
- Large research paper (500 pages)
- Edge cases (no headings, dense tables, mixed content)

#### Implementation Steps

1. **Create Jest integration tests**:
   ```typescript
   // worker/tests/integration/chonkie-metadata-transfer.test.ts
   describe('Chonkie Metadata Transfer', () => {
     const testPdf = path.join(__dirname, '../fixtures/test-document.pdf')

     test('metadata recovery >90% for semantic chunker', async () => {
       const result = await processPDF(testPdf, {
         chunker: 'semantic',
         processing_mode: 'local'
       })

       const withMetadata = result.chunks.filter(c =>
         c.heading_path && c.heading_path.length > 0 ||
         c.page_start
       )

       const recoveryRate = withMetadata.length / result.chunks.length
       expect(recoveryRate).toBeGreaterThan(0.9)
     })

     test('overlap coverage 70-90% for recursive chunker', async () => {
       const result = await processPDF(testPdf, {
         chunker: 'recursive'
       })

       const withOverlaps = result.chunks.filter(c =>
         c.metadata_overlap_count && c.metadata_overlap_count > 0
       )

       const overlapRate = withOverlaps.length / result.chunks.length
       expect(overlapRate).toBeGreaterThan(0.7)
       expect(overlapRate).toBeLessThan(0.95)
     })

     test('confidence distribution shows high quality', async () => {
       const result = await processPDF(testPdf, {
         chunker: 'semantic'
       })

       const highConfidence = result.chunks.filter(c => c.confidence > 0.9)
       const interpolated = result.chunks.filter(c => c.interpolated)

       const highRate = highConfidence.length / result.chunks.length
       const interpolatedRate = interpolated.length / result.chunks.length

       expect(highRate).toBeGreaterThan(0.75) // >75% high confidence
       expect(interpolatedRate).toBeLessThan(0.05) // <5% interpolated
     })

     test.each(['semantic', 'recursive', 'sentence'])(
       '%s chunker preserves Docling metadata',
       async (chunkerType) => {
         const result = await processPDF(testPdf, { chunker: chunkerType })

         result.chunks.forEach((chunk, i) => {
           // All chunks should have metadata or be interpolated
           const hasMetadata = chunk.heading_path || chunk.page_start
           const isInterpolated = chunk.interpolated

           expect(hasMetadata || isInterpolated).toBe(true)

           // Metadata should be valid
           if (chunk.heading_path) {
             expect(Array.isArray(chunk.heading_path)).toBe(true)
           }
           if (chunk.page_start) {
             expect(chunk.page_start).toBeGreaterThan(0)
           }
         })
       }
     )
   })
   ```

2. **Create manual validation script**:
   ```typescript
   // worker/scripts/test-chonkie-metadata-transfer.ts
   async function testMetadataTransfer(documentId: string, chunkerType: string) {
     console.log(`Testing ${chunkerType} chunker metadata transfer...`)

     // Get Chonkie chunks
     const { data: chunks } = await supabase
       .from('chunks')
       .select('*')
       .eq('document_id', documentId)
       .eq('chunker_type', chunkerType)

     // Calculate metrics
     const withOverlaps = chunks.filter(c => c.metadata_overlap_count > 0)
     const withHeadings = chunks.filter(c => c.heading_path && c.heading_path.length > 0)
     const withPages = chunks.filter(c => c.page_start)
     const highConfidence = chunks.filter(c => c.confidence > 0.9)
     const interpolated = chunks.filter(c => c.interpolated)

     console.log(`\nResults:`)
     console.log(`  Total chunks: ${chunks.length}`)
     console.log(`  With overlaps: ${withOverlaps.length} (${percent(withOverlaps, chunks)}%)`)
     console.log(`  With headings: ${withHeadings.length} (${percent(withHeadings, chunks)}%)`)
     console.log(`  With pages: ${withPages.length} (${percent(withPages, chunks)}%)`)
     console.log(`  High confidence: ${highConfidence.length} (${percent(highConfidence, chunks)}%)`)
     console.log(`  Interpolated: ${interpolated.length} (${percent(interpolated, chunks)}%)`)

     // Validate thresholds
     const overlapRate = withOverlaps.length / chunks.length
     const metadataRate = withHeadings.length / chunks.length
     const highConfRate = highConfidence.length / chunks.length

     if (overlapRate < 0.7) {
       console.error(`⚠️  LOW OVERLAP RATE: ${overlapRate.toFixed(2)} (expected >0.7)`)
     }
     if (metadataRate < 0.9) {
       console.error(`⚠️  LOW METADATA RECOVERY: ${metadataRate.toFixed(2)} (expected >0.9)`)
     }
     if (highConfRate < 0.75) {
       console.warn(`⚠️  LOW HIGH-CONFIDENCE RATE: ${highConfRate.toFixed(2)} (expected >0.75)`)
     }

     if (overlapRate >= 0.7 && metadataRate >= 0.9) {
       console.log(`\n✅ All thresholds passed!`)
     }
   }
   ```

3. **Create test fixtures**:
   - Process 3-5 diverse PDFs with HybridChunker
   - Save document IDs for testing
   - Reprocess same documents with Chonkie chunkers
   - Compare metadata completeness

4. **Add visual validation**:
   - Export chunks to JSON for manual inspection
   - Create HTML report showing overlap statistics
   - Highlight interpolated chunks for review

**Code Patterns to Follow**:
- **Integration Tests**: `worker/tests/integration/pdf-processing.test.ts`
- **Validation Scripts**: `worker/scripts/validate-bulletproof-matcher.ts`
- **PRP Test Examples**: Lines 883-992

#### Acceptance Criteria

**Rule-Based Criteria**:
- [ ] **Coverage**: Integration tests for all chunker types
- [ ] **Thresholds**: Tests validate >90% overlap coverage, >90% metadata recovery
- [ ] **Edge Cases**: No-overlap chunks handled gracefully
- [ ] **Performance**: Tests complete in <10 minutes per document
- [ ] **Documentation**: Test file explains expected metrics
- [ ] **CI Ready**: Tests can run in CI (with mocked AI or skip flag)

#### Validation Commands

```bash
# Run integration tests
cd worker
npx jest tests/integration/chonkie-metadata-transfer.test.ts

# Manual validation with real PDF
npx tsx scripts/test-chonkie-metadata-transfer.ts <document_id> semantic

# Test all chunker types
for chunker in semantic recursive sentence; do
  npx tsx scripts/test-chonkie-metadata-transfer.ts <document_id> $chunker
done

# Compare HybridChunker vs Chonkie metadata
npx tsx scripts/compare-chunker-metadata.ts <document_id> hybrid semantic

# Visual HTML report
npx tsx scripts/generate-metadata-report.ts <document_id> --output=report.html
```

#### Resources & References

**Documentation**:
- PRP Success Metrics: Lines 1027-1054
- PRP Test Examples: Lines 883-992

**Code References**:
- Integration Tests: `worker/tests/integration/pdf-processing.test.ts`
- Validation Scripts: `worker/scripts/validate-bulletproof-matcher.ts`

---

## Phase 3: UI Integration (Week 3)

### T-009: Add Chunker Selection to Upload Flow

**Priority**: High
**Estimated Effort**: 5 hours
**Dependencies**: T-005 (migration), T-006 (tests passing)

#### Task Purpose
**As a** user uploading a document
**I need** a dropdown to select which chunker strategy to use
**So that** I can choose the optimal chunker for my document type

#### Context & Background
**UI Location**: Document upload form (UploadZone component or similar).

**User Guidance**: Provide clear descriptions of each chunker type and when to use them.

**Time Estimates**: Show processing time estimates based on chunker type (from PRP lines 998-1008).

#### Technical Requirements

**Files to Modify**:
```
src/components/library/UploadZone.tsx - Add chunker selection dropdown
src/lib/types/processing.ts - Add chunker type to processing options
```

**Functional Requirements**:
- REQ-1: When user selects PDF upload, the system shall show chunker dropdown
- REQ-2: When user hovers chunker option, the system shall show tooltip with description
- REQ-3: When user selects non-hybrid chunker, the system shall show time estimate
- REQ-4: When form is submitted, the system shall include chunker_type in processing request
- REQ-5: When user has default_chunker_type preference, the system shall pre-select it

**Chunker Descriptions** (from PRP lines 188-399):
- **Hybrid** (default): Fast, structure-preserving, 15 min
- **Semantic**: Narrative, thematic coherence, 16-17 min
- **Recursive**: Structured documents, 15.5-16 min
- **Neural**: Best quality, BERT-based, 17-18 min
- **Slumber**: Highest quality, agentic, 18-20 min
- **Sentence**: Simple, fast, 15-16 min
- **Token**: Fixed-size fallback, 15 min

#### Implementation Steps

1. **Add chunker selection dropdown**:
   ```tsx
   // src/components/library/UploadZone.tsx

   const [chunkerType, setChunkerType] = useState<ChunkerType>('hybrid')

   <Select
     label="Chunking Strategy"
     value={chunkerType}
     onChange={(e) => setChunkerType(e.target.value as ChunkerType)}
     className="mb-4"
   >
     <option value="hybrid">
       Structural (Fast, default) - 15 min
     </option>
     <option value="semantic">
       Semantic (Narrative, thematic) - 16-17 min
     </option>
     <option value="recursive">
       Recursive (Structured docs) - 15.5-16 min
     </option>
     <option value="neural">
       Neural (Best quality, slow) - 17-18 min
     </option>
     <option value="slumber">
       Slumber (Agentic, highest quality) - 18-20 min
     </option>
     <option value="sentence">
       Sentence (Simple, fast) - 15-16 min
     </option>
     <option value="token">
       Token (Fixed-size fallback) - 15 min
     </option>
   </Select>
   ```

2. **Add tooltips with detailed descriptions**:
   ```tsx
   const chunkerDescriptions: Record<ChunkerType, string> = {
     hybrid: "Fast structural chunking. Preserves document hierarchy. Best for most documents.",
     semantic: "Groups by semantic similarity. Best for narratives, essays, thematic content.",
     recursive: "Hierarchical structural splits. Best for technical docs, textbooks.",
     neural: "BERT-based semantic boundaries. Highest quality for complex academic writing.",
     slumber: "Agentic LLM-based chunking. Highest quality, use for critical documents only.",
     sentence: "Simple sentence boundaries. Best for clean, well-formatted text.",
     token: "Fixed token-count chunks. Fallback for compatibility."
   }

   <Tooltip content={chunkerDescriptions[chunkerType]}>
     <InfoIcon className="ml-2 text-gray-400" />
   </Tooltip>
   ```

3. **Add processing time alert**:
   ```tsx
   {chunkerType !== 'hybrid' && (
     <Alert variant="info" className="mt-2">
       Estimated processing time: +{estimatedDelay[chunkerType]} seconds
       compared to default Structural chunker.
     </Alert>
   )}
   ```

4. **Load user default preference**:
   ```tsx
   useEffect(() => {
     // Fetch user_preferences.default_chunker_type
     async function loadPreference() {
       const { data } = await supabase
         .from('user_preferences')
         .select('default_chunker_type')
         .single()

       if (data?.default_chunker_type) {
         setChunkerType(data.default_chunker_type)
       }
     }
     loadPreference()
   }, [])
   ```

5. **Pass chunker_type to processing handler**:
   ```tsx
   const handleUpload = async (file: File) => {
     await processDocument(file, {
       chunker_type: chunkerType,
       processing_mode: 'local'
     })
   }
   ```

**Code Patterns to Follow**:
- **Select Component**: `src/components/ui/select.tsx` - shadcn/ui Select
- **Tooltips**: `src/components/ui/tooltip.tsx` - shadcn/ui Tooltip
- **User Preferences**: `src/lib/user-preferences.ts` - Preference loading

#### Acceptance Criteria

**Given-When-Then Scenarios**:
```gherkin
Scenario 1: User can select chunker type
  Given I am on the document upload page
  When I click the "Chunking Strategy" dropdown
  Then I should see all 7 chunker options
  And each option should show estimated processing time
  And "Structural (Fast, default)" should be selected by default

Scenario 2: Tooltips provide guidance
  Given I am selecting a chunker type
  When I hover over the info icon
  Then I should see a detailed description
  And the description should explain when to use this chunker
  And the description should mention document types

Scenario 3: Processing time estimate shown
  Given I select "Neural" chunker
  When the selection changes
  Then I should see an alert showing "+60-90 seconds"
  And the alert should be clearly visible
  And it should mention comparison to default

Scenario 4: User preference pre-selected
  Given I have set default_chunker_type to "semantic"
  When I open the upload form
  Then "Semantic" should be pre-selected in the dropdown
  And I can still change to other chunker types

Scenario 5: Chunker type passed to processor
  Given I select "recursive" chunker
  When I upload a PDF
  Then the processing job should include chunker_type: "recursive"
  And the document should be processed with RecursiveChunker
  And chunks should have chunker_type = "recursive"
```

**Rule-Based Criteria**:
- [ ] **UI/UX**: Dropdown shows all 7 chunker types with time estimates
- [ ] **Tooltips**: Each chunker has helpful description
- [ ] **User Preference**: Default chunker pre-selected from user_preferences
- [ ] **Time Estimate**: Alert shown for non-hybrid chunkers
- [ ] **Integration**: Chunker type passed to processing handler
- [ ] **Accessibility**: Dropdown keyboard-navigable, tooltips screen-reader friendly
- [ ] **Mobile**: Dropdown works on mobile devices

#### Validation Commands

```bash
# Type checking
npx tsc --noEmit

# Component tests
npx jest src/components/library/__tests__/UploadZone.test.tsx

# Manual testing checklist:
# 1. Open upload form
# 2. Click chunker dropdown → verify 7 options
# 3. Hover info icons → verify tooltips
# 4. Select "Neural" → verify time estimate alert
# 5. Upload PDF → verify chunker_type in processing job
# 6. Check database → verify chunks.chunker_type = "neural"

# Test user preference
# 1. Set default_chunker_type in database
# 2. Reload upload form
# 3. Verify preference pre-selected
```

#### Resources & References

**Documentation**:
- PRP Chunker Guide: Lines 188-399
- PRP UI Mockup: Lines 574-594
- PRP Processing Times: Lines 998-1008

**Code References**:
- Select Component: `src/components/ui/select.tsx`
- Tooltip Component: `src/components/ui/tooltip.tsx`
- Upload Zone: `src/components/library/UploadZone.tsx`

---

### T-010: Display Chunker Type in Document Metadata

**Priority**: Medium
**Estimated Effort**: 3 hours
**Dependencies**: T-009 (UI integration)

#### Task Purpose
**As a** user viewing a document
**I need** to see which chunker strategy was used
**So that** I understand how the document was processed

#### Context & Background
**UI Location**: Document metadata panel (likely in reader or library).

**Use Cases**:
- User forgets which chunker they selected
- User wants to compare documents processed with different chunkers
- User troubleshooting connection quality issues

#### Technical Requirements

**Files to Modify**:
```
src/components/reader/DocumentMetadata.tsx - Add chunker type display
src/components/library/DocumentCard.tsx - Show chunker badge
```

**Functional Requirements**:
- REQ-1: When viewing document metadata, the system shall display chunker_type
- REQ-2: When chunker is hybrid (default), the system shall show subtle indicator
- REQ-3: When chunker is non-hybrid, the system shall show prominent badge
- REQ-4: When hovering chunker indicator, the system shall show full description

**Visual Design**:
- Hybrid: Gray text "Structural Chunking"
- Semantic: Blue badge "Semantic"
- Recursive: Green badge "Recursive"
- Neural: Purple badge "Neural"
- Slumber: Gold badge "Slumber"
- Sentence: Gray badge "Sentence"
- Token: Gray badge "Token"

#### Implementation Steps

1. **Add chunker display to DocumentMetadata**:
   ```tsx
   // src/components/reader/DocumentMetadata.tsx

   const chunkerLabels: Record<ChunkerType, string> = {
     hybrid: 'Structural',
     semantic: 'Semantic',
     recursive: 'Recursive',
     neural: 'Neural',
     slumber: 'Slumber',
     sentence: 'Sentence',
     token: 'Token'
   }

   const chunkerColors: Record<ChunkerType, string> = {
     hybrid: 'bg-gray-100 text-gray-700',
     semantic: 'bg-blue-100 text-blue-700',
     recursive: 'bg-green-100 text-green-700',
     neural: 'bg-purple-100 text-purple-700',
     slumber: 'bg-yellow-100 text-yellow-700',
     sentence: 'bg-gray-100 text-gray-700',
     token: 'bg-gray-100 text-gray-700'
   }

   <div className="metadata-row">
     <span className="label">Chunking:</span>
     <Tooltip content={chunkerDescriptions[document.chunker_type]}>
       <Badge className={chunkerColors[document.chunker_type]}>
         {chunkerLabels[document.chunker_type]}
       </Badge>
     </Tooltip>
   </div>
   ```

2. **Add chunker badge to DocumentCard**:
   ```tsx
   // src/components/library/DocumentCard.tsx

   {document.chunker_type && document.chunker_type !== 'hybrid' && (
     <Badge
       className={cn(
         'absolute top-2 right-2',
         chunkerColors[document.chunker_type]
       )}
     >
       {chunkerLabels[document.chunker_type]}
     </Badge>
   )}
   ```

3. **Add chunker filter to library view**:
   ```tsx
   // src/components/library/LibraryFilters.tsx

   <Select
     label="Filter by Chunker"
     value={chunkerFilter}
     onChange={setChunkerFilter}
   >
     <option value="all">All Chunkers</option>
     <option value="hybrid">Structural</option>
     <option value="semantic">Semantic</option>
     <option value="recursive">Recursive</option>
     <option value="neural">Neural</option>
     <option value="slumber">Slumber</option>
     <option value="sentence">Sentence</option>
     <option value="token">Token</option>
   </Select>
   ```

4. **Add query support**:
   ```typescript
   // Update document queries to include chunker_type
   const { data: documents } = await supabase
     .from('documents')
     .select('*')
     .eq('user_id', userId)
     .eq('chunker_type', chunkerFilter) // If filtering
   ```

**Code Patterns to Follow**:
- **Badge Component**: `src/components/ui/badge.tsx` - shadcn/ui Badge
- **Metadata Display**: `src/components/reader/DocumentMetadata.tsx`
- **Library Filters**: `src/components/library/LibraryFilters.tsx`

#### Acceptance Criteria

**Given-When-Then Scenarios**:
```gherkin
Scenario 1: Chunker type shown in metadata
  Given I am viewing a document processed with "semantic" chunker
  When I open the document metadata panel
  Then I should see a blue badge labeled "Semantic"
  And hovering should show full description
  And the description should explain semantic chunking

Scenario 2: Hybrid chunker shows subtle indicator
  Given I am viewing a document processed with "hybrid" chunker
  When I view the metadata
  Then I should see gray text "Structural Chunking"
  And it should not be overly prominent
  And tooltip should explain default chunker

Scenario 3: Library card shows chunker badge
  Given I am in the library view
  When I see documents processed with different chunkers
  Then non-hybrid documents should show colored badges
  And hybrid documents should not show badges (default)
  And badges should be in top-right corner

Scenario 4: Filter by chunker type
  Given I am in the library view with 20 documents
  When I select "Filter by Chunker: Semantic"
  Then only documents with chunker_type="semantic" should show
  And the count should update accordingly
```

**Rule-Based Criteria**:
- [ ] **UI/UX**: Chunker type visible in metadata and library card
- [ ] **Color Coding**: Different colors for different chunker types
- [ ] **Tooltips**: Descriptions available on hover
- [ ] **Filtering**: Can filter documents by chunker type
- [ ] **Accessibility**: Color not sole indicator, text labels present
- [ ] **Mobile**: Badges and metadata visible on mobile

#### Validation Commands

```bash
# Type checking
npx tsc --noEmit

# Component tests
npx jest src/components/reader/__tests__/DocumentMetadata.test.tsx
npx jest src/components/library/__tests__/DocumentCard.test.tsx

# Visual regression tests (if available)
npx playwright test --grep "chunker badge"

# Manual testing:
# 1. Process documents with different chunkers
# 2. Open reader → verify metadata shows chunker type
# 3. Open library → verify badges on cards
# 4. Test filter → verify only matching documents shown
# 5. Hover tooltips → verify descriptions
```

#### Resources & References

**Code References**:
- Badge Component: `src/components/ui/badge.tsx`
- Document Metadata: `src/components/reader/DocumentMetadata.tsx`
- Library Filters: `src/components/library/LibraryFilters.tsx`

---

### T-011: Add Chunker Statistics to Admin Panel

**Priority**: Low
**Estimated Effort**: 4 hours
**Dependencies**: T-005 (migration), T-009 (UI integration)

#### Task Purpose
**As a** system administrator
**I need** chunker usage statistics and performance metrics
**So that** I can understand which chunkers are most popular and effective

#### Context & Background
**Admin Panel**: Existing admin panel with scanner, import, export tabs (from Storage-First Portability).

**New Tab**: Add "Chunker Stats" tab showing usage, performance, and quality metrics.

#### Technical Requirements

**Files to Modify**:
```
src/components/admin/AdminPanel.tsx - Add new "Chunker Stats" tab
src/components/admin/ChunkerStatsTab.tsx - Create new stats component
```

**Functional Requirements**:
- REQ-1: When Admin Panel opens, the system shall fetch chunker usage stats
- REQ-2: When displaying stats, the system shall show document count per chunker
- REQ-3: When displaying stats, the system shall show average processing time per chunker
- REQ-4: When displaying stats, the system shall show metadata recovery rate per chunker
- REQ-5: When user clicks chunker, the system shall show list of documents using it

**Statistics to Display**:
- Document count per chunker type
- Average chunk count per chunker
- Average processing time per chunker
- Metadata recovery rate per chunker
- Connection quality per chunker (optional)

#### Implementation Steps

1. **Create stats query function**:
   ```typescript
   // src/lib/admin/chunker-stats.ts

   export async function getChunkerStats(userId: string) {
     const { data: documents } = await supabase
       .from('documents')
       .select('chunker_type, chunk_count, processing_time')
       .eq('user_id', userId)

     const stats = {
       hybrid: { count: 0, avgChunks: 0, avgTime: 0 },
       semantic: { count: 0, avgChunks: 0, avgTime: 0 },
       // ... other chunker types
     }

     documents.forEach(doc => {
       const type = doc.chunker_type || 'hybrid'
       stats[type].count++
       stats[type].avgChunks += doc.chunk_count
       stats[type].avgTime += doc.processing_time
     })

     // Calculate averages
     Object.keys(stats).forEach(type => {
       if (stats[type].count > 0) {
         stats[type].avgChunks /= stats[type].count
         stats[type].avgTime /= stats[type].count
       }
     })

     return stats
   }
   ```

2. **Create ChunkerStatsTab component**:
   ```tsx
   // src/components/admin/ChunkerStatsTab.tsx

   export function ChunkerStatsTab() {
     const [stats, setStats] = useState(null)

     useEffect(() => {
       loadStats()
     }, [])

     const loadStats = async () => {
       const data = await getChunkerStats(userId)
       setStats(data)
     }

     return (
       <div className="space-y-6">
         <h2>Chunker Usage Statistics</h2>

         <Table>
           <TableHeader>
             <TableRow>
               <TableHead>Chunker</TableHead>
               <TableHead>Documents</TableHead>
               <TableHead>Avg Chunks</TableHead>
               <TableHead>Avg Time</TableHead>
               <TableHead>Actions</TableHead>
             </TableRow>
           </TableHeader>
           <TableBody>
             {Object.entries(stats).map(([type, data]) => (
               <TableRow key={type}>
                 <TableCell>
                   <Badge className={chunkerColors[type]}>
                     {chunkerLabels[type]}
                   </Badge>
                 </TableCell>
                 <TableCell>{data.count}</TableCell>
                 <TableCell>{data.avgChunks.toFixed(0)}</TableCell>
                 <TableCell>{formatTime(data.avgTime)}</TableCell>
                 <TableCell>
                   <Button onClick={() => showDocuments(type)}>
                     View Docs
                   </Button>
                 </TableCell>
               </TableRow>
             ))}
           </TableBody>
         </Table>

         <ChunkerPerformanceChart stats={stats} />
       </div>
     )
   }
   ```

3. **Add chart visualization**:
   ```tsx
   // Use recharts or similar library
   <BarChart data={chartData}>
     <XAxis dataKey="chunker" />
     <YAxis />
     <Bar dataKey="count" fill="#8884d8" />
     <Bar dataKey="avgTime" fill="#82ca9d" />
   </BarChart>
   ```

4. **Add to Admin Panel tabs**:
   ```tsx
   // src/components/admin/AdminPanel.tsx

   const tabs = [
     { id: 'scanner', label: 'Scanner' },
     { id: 'import', label: 'Import' },
     { id: 'export', label: 'Export' },
     { id: 'connections', label: 'Connections' },
     { id: 'chunker-stats', label: 'Chunker Stats' }, // NEW
     { id: 'integrations', label: 'Integrations' },
     { id: 'jobs', label: 'Jobs' }
   ]
   ```

**Code Patterns to Follow**:
- **Admin Panel**: `src/components/admin/AdminPanel.tsx` - Tab structure
- **Stats Queries**: `src/components/admin/ScannerTab.tsx` - Similar query pattern
- **Charts**: Use recharts library for visualizations

#### Acceptance Criteria

**Rule-Based Criteria**:
- [ ] **Functional**: Stats show accurate document counts per chunker
- [ ] **Performance**: Stats load in <2 seconds for 1000 documents
- [ ] **Visualization**: Chart clearly shows usage distribution
- [ ] **Actions**: "View Docs" button filters library by chunker type
- [ ] **Accessibility**: Table and chart accessible via keyboard/screen reader
- [ ] **Documentation**: Code comments explain stat calculations

#### Validation Commands

```bash
# Type checking
npx tsc --noEmit

# Component tests
npx jest src/components/admin/__tests__/ChunkerStatsTab.test.tsx

# Manual testing:
# 1. Process 10 documents with different chunkers
# 2. Open Admin Panel → Chunker Stats tab
# 3. Verify counts match database
# 4. Verify averages calculated correctly
# 5. Click "View Docs" → verify filtering works
# 6. Test chart interactivity
```

#### Resources & References

**Code References**:
- Admin Panel: `src/components/admin/AdminPanel.tsx`
- Scanner Tab: `src/components/admin/ScannerTab.tsx`
- Table Component: `src/components/ui/table.tsx`

---

## Phase 4: Testing & Optimization (Week 4)

### T-012: A/B Test Chunker Strategies with Real Documents

**Priority**: High
**Estimated Effort**: 10 hours
**Dependencies**: All previous tasks (full system operational)

#### Task Purpose
**As a** system evaluator
**I need** to process the same 10 documents with all 6 chunker types
**So that** I can measure quality improvements and validate the 15% connection quality target

#### Context & Background
**A/B Testing Goal**: Process diverse documents with all chunkers, measure metrics, identify optimal chunker per document type.

**Success Criteria** (from PRP lines 608-643):
- All 6 chunkers tested with 10 diverse documents
- Processing time <20 min for all chunkers (500-page book)
- Connection quality improvement >15% for semantic/neural vs hybrid
- Best practice guide created based on results

#### Technical Requirements

**Files to Create**:
```
worker/scripts/ab-test-chunkers.ts - A/B testing script
docs/chunker-comparison-results.md - Results documentation
docs/chunker-best-practices.md - User guide based on results
```

**Test Documents** (diverse types):
1. Fiction novel (narrative, 300-500 pages)
2. Technical manual (structured, 200 pages)
3. Research paper (academic, 50 pages)
4. Philosophy text (complex arguments, 200 pages)
5. Textbook (hierarchical, 400 pages)
6. Essays collection (thematic, 150 pages)
7. Biography (narrative + factual, 300 pages)
8. API documentation (structured, 100 pages)
9. Legal document (dense, 80 pages)
10. Mixed content PDF (tables, text, images, 200 pages)

**Metrics to Measure**:
- Processing time (seconds)
- Chunk count
- Metadata recovery rate (%)
- Connection count (by engine: semantic, contradiction, thematic)
- Connection quality score (subjective 1-5 rating)
- User satisfaction (subjective rating after reviewing)

#### Implementation Steps

1. **Create A/B testing script**:
   ```typescript
   // worker/scripts/ab-test-chunkers.ts

   interface ChunkerComparison {
     documentId: string
     documentType: string
     chunkerType: ChunkerType
     processingTime: number // seconds
     chunkCount: number
     metadataRecovery: number // percentage
     connections: {
       total: number
       semantic: number
       contradiction: number
       thematic: number
     }
     subjective: {
       connectionQuality: number // 1-5
       userSatisfaction: number // 1-5
       notes: string
     }
   }

   async function runABTest(documentIds: string[]) {
     const results: ChunkerComparison[] = []

     for (const documentId of documentIds) {
       console.log(`\nTesting document ${documentId}...`)

       for (const chunkerType of CHUNKER_TYPES) {
         console.log(`  Processing with ${chunkerType}...`)

         const startTime = Date.now()

         // Reprocess document with this chunker
         await reprocessDocument(documentId, { chunker_type: chunkerType })

         const endTime = Date.now()
         const processingTime = (endTime - startTime) / 1000

         // Measure metrics
         const metrics = await measureMetrics(documentId, chunkerType)

         results.push({
           documentId,
           documentType: metrics.documentType,
           chunkerType,
           processingTime,
           chunkCount: metrics.chunkCount,
           metadataRecovery: metrics.metadataRecovery,
           connections: metrics.connections,
           subjective: {
             connectionQuality: 0, // Filled in manually later
             userSatisfaction: 0,
             notes: ''
           }
         })
       }
     }

     // Save results
     await saveResults(results)

     // Generate comparison report
     await generateReport(results)
   }
   ```

2. **Measure connection quality**:
   ```typescript
   async function measureMetrics(documentId: string, chunkerType: string) {
     const { data: chunks } = await supabase
       .from('chunks')
       .select('*')
       .eq('document_id', documentId)
       .eq('chunker_type', chunkerType)

     const { data: connections } = await supabase
       .from('chunk_connections')
       .select('*')
       .in('source_chunk_id', chunks.map(c => c.id))

     const metadataRecovery =
       chunks.filter(c => c.heading_path || c.page_start).length / chunks.length

     const connectionsByEngine = {
       semantic: connections.filter(c => c.connection_type === 'semantic_similarity').length,
       contradiction: connections.filter(c => c.connection_type === 'contradiction_detection').length,
       thematic: connections.filter(c => c.connection_type === 'thematic_bridge').length
     }

     return {
       documentType: await getDocumentType(documentId),
       chunkCount: chunks.length,
       metadataRecovery: metadataRecovery * 100,
       connections: {
         total: connections.length,
         ...connectionsByEngine
       }
     }
   }
   ```

3. **Generate comparison report**:
   ```typescript
   async function generateReport(results: ChunkerComparison[]) {
     const report = {
       summary: {
         documentsProcessed: new Set(results.map(r => r.documentId)).size,
         chunkersCompared: CHUNKER_TYPES.length,
         totalConnectionsGenerated: results.reduce((sum, r) => sum + r.connections.total, 0)
       },
       byChunker: {},
       byDocumentType: {},
       recommendations: []
     }

     // Aggregate by chunker type
     CHUNKER_TYPES.forEach(chunker => {
       const chunkerResults = results.filter(r => r.chunkerType === chunker)
       report.byChunker[chunker] = {
         avgProcessingTime: avg(chunkerResults.map(r => r.processingTime)),
         avgChunkCount: avg(chunkerResults.map(r => r.chunkCount)),
         avgMetadataRecovery: avg(chunkerResults.map(r => r.metadataRecovery)),
         avgConnections: avg(chunkerResults.map(r => r.connections.total)),
         avgQuality: avg(chunkerResults.map(r => r.subjective.connectionQuality))
       }
     })

     // Generate recommendations
     report.recommendations = generateRecommendations(report)

     // Save to file
     const markdown = formatAsMarkdown(report)
     await fs.writeFile('docs/chunker-comparison-results.md', markdown)
   }
   ```

4. **Create best practices guide**:
   ```markdown
   # Chunker Selection Best Practices

   Based on A/B testing of 10 diverse documents with all 6 chunker types.

   ## Decision Matrix

   | Document Type | Primary | Fallback | Why |
   |---------------|---------|----------|-----|
   | **Fiction/Narrative** | Semantic | Sentence | Thematic coherence, narrative flow |
   | **Technical Manual** | Recursive | Hybrid | Preserves structure, fast |
   | **Academic Paper** | Neural | Recursive | Quality > speed, complex arguments |
   | **Philosophy** | Neural | Semantic | Subtle topic shifts, deep analysis |
   | **Textbook** | Recursive | Hybrid | Hierarchical structure preservation |
   | **Essays** | Semantic | Sentence | Thematic grouping, cross-essay connections |
   | **Mixed Content** | Slumber | Semantic | Handles complexity, context-aware |

   ## Performance vs Quality Trade-off

   - **Speed Priority**: Use Hybrid (default) or Sentence
   - **Quality Priority**: Use Neural or Slumber
   - **Balanced**: Use Semantic or Recursive

   ## Connection Quality Results

   - **Semantic**: +18% connections vs Hybrid, +15% quality rating
   - **Neural**: +22% connections vs Hybrid, +20% quality rating
   - **Recursive**: +5% connections vs Hybrid, similar quality
   - **Slumber**: +25% connections vs Hybrid, +23% quality rating

   ## When to Use Each Chunker

   ### Semantic Chunker
   - Best for: Narratives, essays, thematic content
   - Processing time: +60-90 seconds
   - Connection improvement: +18%
   - Use when: Discovering cross-section themes

   [... similar sections for each chunker ...]
   ```

**Code Patterns to Follow**:
- **A/B Testing**: General A/B testing methodology
- **Metrics Collection**: `worker/lib/monitoring.ts` - Performance metrics
- **Report Generation**: Markdown formatting utilities

#### Acceptance Criteria

**Given-When-Then Scenarios**:
```gherkin
Scenario 1: All documents processed with all chunkers
  Given 10 test documents of diverse types
  When A/B test script runs
  Then each document should be processed 6 times (once per chunker)
  And all 60 processing jobs should complete successfully
  And results should be saved to database and report file

Scenario 2: Connection quality improvement validated
  Given A/B test results for semantic and neural chunkers
  When comparing to hybrid baseline
  Then semantic should show >15% connection quality improvement
  And neural should show >15% connection quality improvement
  And improvements should be statistically significant

Scenario 3: Best practices guide generated
  Given A/B test results analyzed
  When generating best practices guide
  Then guide should include decision matrix for document types
  And guide should have performance vs quality trade-offs
  And guide should explain when to use each chunker
  And recommendations should be data-driven

Scenario 4: User satisfaction measured
  Given documents processed with different chunkers
  When user reviews connection quality manually
  Then semantic/neural should have higher satisfaction ratings
  And improvements should align with objective metrics
  And edge cases should be documented
```

**Rule-Based Criteria**:
- [ ] **Completeness**: All 10 documents processed with all 6 chunkers (60 total)
- [ ] **Processing Time**: All chunkers complete <20 min for 500-page book
- [ ] **Quality Improvement**: Semantic/neural show >15% improvement vs hybrid
- [ ] **Documentation**: Results documented in chunker-comparison-results.md
- [ ] **Best Practices**: User guide created based on data
- [ ] **Statistical Significance**: Results validated with proper analysis

#### Validation Commands

```bash
# Run A/B test (long-running, ~2-3 hours)
cd worker
npx tsx scripts/ab-test-chunkers.ts \
  --documents=doc1,doc2,doc3,doc4,doc5,doc6,doc7,doc8,doc9,doc10

# Generate report from existing results
npx tsx scripts/generate-chunker-report.ts

# Validate report exists
ls -l docs/chunker-comparison-results.md
ls -l docs/chunker-best-practices.md

# View summary statistics
npx tsx scripts/summarize-chunker-results.ts

# Expected output:
# Documents: 10
# Chunkers: 6
# Total processing jobs: 60
# Semantic vs Hybrid: +18% connections, +15% quality
# Neural vs Hybrid: +22% connections, +20% quality
# Slumber vs Hybrid: +25% connections, +23% quality
```

#### Resources & References

**Documentation**:
- PRP A/B Testing: Lines 608-643
- PRP Decision Matrix: Lines 402-413
- PRP Success Criteria: Lines 59-65

**Code References**:
- Monitoring: `worker/lib/monitoring.ts`
- Connection Queries: `src/lib/connections.ts`

---

### T-013: Optimize Slow Chunkers (Neural, Slumber)

**Priority**: Medium
**Estimated Effort**: 6 hours
**Dependencies**: T-012 (A/B test identifies bottlenecks)

#### Task Purpose
**As a** performance engineer
**I need** to optimize neural and slumber chunkers to reduce processing time
**So that** users experience <20 min processing for all chunkers on 500-page books

#### Context & Background
**Performance Targets** (from PRP lines 998-1008):
- Semantic: 16-17 min (acceptable)
- Recursive: 15.5-16 min (acceptable)
- Neural: 17-18 min (target, currently may exceed)
- Slumber: 18-20 min (target, currently may exceed)

**Optimization Strategies**:
- GPU acceleration for neural chunker (if available)
- Batching for slumber LLM calls
- Parallel processing where possible
- Timeout tuning

#### Technical Requirements

**Files to Modify**:
```
worker/scripts/chonkie_chunk.py - Add GPU support, batching
worker/lib/chonkie/chonkie-chunker.ts - Tune timeouts, add parallel processing
```

**Functional Requirements**:
- REQ-1: When GPU is available, the system shall use it for neural chunker
- REQ-2: When batching chunks, the system shall process 5-10 at a time
- REQ-3: When timeout is too short, the system shall adjust based on document size
- REQ-4: When optimization is applied, the system shall log performance improvements

**Optimization Targets**:
- Neural: Reduce from 18 min to 17 min (GPU) or 16 min (optimized CPU)
- Slumber: Reduce from 22 min to 18-20 min (batching)

#### Implementation Steps

1. **Add GPU support for neural chunker**:
   ```python
   # worker/scripts/chonkie_chunk.py

   import torch

   def initialize_neural_chunker(config):
       device = 'cuda' if torch.cuda.is_available() else 'cpu'
       print(f"Using device: {device}", file=sys.stderr)

       chunker = NeuralChunker(
           model=config.get('model', 'bert-base-uncased'),
           chunk_size=config.get('chunk_size', 768),
           device=device  # Use GPU if available
       )

       return chunker
   ```

2. **Add batching for slumber chunker**:
   ```python
   # Slumber can be slow with many LLM calls
   # Batch chunks together to reduce overhead

   def batch_slumber_chunks(markdown, chunk_size=768, batch_size=5):
       # Split markdown into ~batch_size segments
       # Process each batch with Slumber
       # Merge results
       pass
   ```

3. **Tune timeouts based on document size**:
   ```typescript
   // worker/lib/chonkie/chonkie-chunker.ts

   function calculateTimeout(
     markdownLength: number,
     chunkerType: ChunkerType
   ): number {
     const baseTimeouts = {
       semantic: 120,
       recursive: 90,
       neural: 180,
       slumber: 240,
       sentence: 60,
       token: 60
     }

     const baseTimeout = baseTimeouts[chunkerType]

     // Scale timeout based on document size
     // 1MB markdown = 1x timeout, 10MB = 2x timeout
     const sizeMultiplier = 1 + Math.log10(markdownLength / 1_000_000)

     return Math.ceil(baseTimeout * sizeMultiplier)
   }

   export async function chonkieChunk(
     cleanedMarkdown: string,
     config: ChonkieConfig
   ): Promise<ChonkieChunk[]> {
     const timeout = config.timeout ||
       calculateTimeout(cleanedMarkdown.length, config.chunker_type)

     // ... rest of implementation
   }
   ```

4. **Add performance logging**:
   ```typescript
   console.log(`Chonkie ${config.chunker_type} timing:`)
   console.log(`  Markdown size: ${(cleanedMarkdown.length / 1024).toFixed(0)} KB`)
   console.log(`  Timeout: ${timeout} seconds`)
   console.log(`  Actual time: ${actualTime} seconds`)
   console.log(`  Chunks produced: ${chunks.length}`)
   console.log(`  Performance: ${(cleanedMarkdown.length / actualTime).toFixed(0)} chars/sec`)
   ```

5. **Profile and identify bottlenecks**:
   ```bash
   # Profile Python script
   python3 -m cProfile -o chonkie.prof worker/scripts/chonkie_chunk.py

   # Analyze profile
   python3 -m pstats chonkie.prof

   # Identify slowest functions
   # Optimize based on profiling data
   ```

**Code Patterns to Follow**:
- **GPU Detection**: Standard PyTorch GPU detection pattern
- **Batching**: `worker/lib/local/ollama-cleanup.ts` - Batching pattern
- **Timeout Calculation**: Dynamic timeout based on input size

#### Acceptance Criteria

**Rule-Based Criteria**:
- [ ] **Performance**: Neural chunker completes 500-page book in <18 min (GPU) or <19 min (CPU)
- [ ] **Performance**: Slumber chunker completes 500-page book in <20 min
- [ ] **GPU Utilization**: Neural chunker uses GPU if available (check logs)
- [ ] **Batching**: Slumber chunker processes in batches (check logs)
- [ ] **Timeouts**: No false timeouts on large documents
- [ ] **Logging**: Performance metrics logged for monitoring

#### Validation Commands

```bash
# Test neural chunker with GPU
cd worker
GPU_AVAILABLE=$(python3 -c "import torch; print(torch.cuda.is_available())")
echo "GPU available: $GPU_AVAILABLE"

# Benchmark neural chunker
npx tsx scripts/benchmark-neural-chunker.ts <large_document_id>

# Benchmark slumber chunker
npx tsx scripts/benchmark-slumber-chunker.ts <large_document_id>

# Compare before and after optimization
npx tsx scripts/compare-chunker-performance.ts \
  --before=baseline-results.json \
  --after=optimized-results.json

# Profile Python script
python3 -m cProfile -o chonkie.prof worker/scripts/chonkie_chunk.py < test-input.json
python3 -m pstats chonkie.prof
```

#### Resources & References

**Documentation**:
- PyTorch GPU: https://pytorch.org/docs/stable/notes/cuda.html
- PRP Performance: Lines 998-1008

**Code References**:
- Batching: `worker/lib/local/ollama-cleanup.ts`
- Timeout Tuning: `worker/lib/local/ollama-client.ts`

---

### T-014: Document Final Best Practices Guide

**Priority**: High
**Estimated Effort**: 4 hours
**Dependencies**: T-012 (A/B test results), T-013 (optimization complete)

#### Task Purpose
**As a** user
**I need** a comprehensive guide on choosing chunker strategies
**So that** I can make informed decisions based on document type and priorities

#### Context & Background
**Best Practices Guide**: User-facing documentation synthesizing A/B test results, performance data, and qualitative feedback.

**Target Audience**: Rhizome users deciding which chunker to use for their documents.

#### Technical Requirements

**Files to Create**:
```
docs/chunker-best-practices.md - User guide
docs/chunker-strategy-guide.md - Technical deep dive
README.md - Update with chunker strategy overview
```

**Guide Structure**:
1. **Quick Decision Matrix**: Table mapping document type to recommended chunker
2. **Performance vs Quality Trade-off**: Visualizations and explanations
3. **Detailed Chunker Profiles**: When to use each, what it's good for
4. **Real-World Examples**: Specific document recommendations
5. **Troubleshooting**: Common issues and solutions
6. **Advanced Tips**: Power-user optimizations

#### Implementation Steps

1. **Create Quick Decision Matrix**:
   ```markdown
   # Quick Chunker Selection Guide

   ## 30-Second Decision

   **Speed is priority**: Use **Hybrid** (default)
   **Quality is priority**: Use **Neural** or **Slumber**
   **Narrative content**: Use **Semantic**
   **Structured docs**: Use **Recursive**
   **Not sure**: Use **Hybrid** (you can always reprocess later)

   ## Decision Matrix

   | Document Type | Primary | Fallback | Processing Time | Connection Improvement |
   |---------------|---------|----------|----------------|----------------------|
   | **Fiction/Novel** | Semantic | Sentence | 16-17 min | +18% |
   | **Technical Manual** | Recursive | Hybrid | 15.5-16 min | +5% |
   | **Academic Paper** | Neural | Recursive | 17-18 min | +22% |
   | **Philosophy** | Neural | Semantic | 17-18 min | +20% |
   | **Textbook** | Recursive | Hybrid | 15.5-16 min | +5% |
   | **Essays** | Semantic | Sentence | 16-17 min | +18% |
   | **Mixed Content** | Slumber | Semantic | 18-20 min | +25% |
   | **API Docs** | Recursive | Hybrid | 15.5-16 min | +5% |
   ```

2. **Create Detailed Chunker Profiles**:
   ```markdown
   ## Semantic Chunker

   ### Best For
   - Fiction and narrative books
   - Essays and opinion pieces
   - Thematic content requiring coherence
   - Cross-section connection discovery

   ### How It Works
   Uses sentence embeddings to detect topic shifts. Groups semantically similar
   sentences together, even if they cross structural boundaries.

   ### Performance
   - Processing time: 16-17 minutes (500-page book)
   - Connection improvement: +18% vs Hybrid
   - Metadata recovery: >90%
   - Quality rating: 4.2/5

   ### When to Use
   ✅ Narrative flow is important
   ✅ Want to discover thematic connections
   ✅ Document lacks clear structure
   ✅ Quality > speed

   ### When NOT to Use
   ❌ Document has perfect headings/structure
   ❌ Speed is critical
   ❌ Simple sentence boundaries are fine

   ### Example Documents
   - "Gravity's Rainbow" by Thomas Pynchon
   - "Surveillance Capitalism" by Shoshana Zuboff
   - Personal essays and blog collections
   - Narrative non-fiction

   [... similar profiles for other chunkers ...]
   ```

3. **Add Performance Visualizations**:
   ```markdown
   ## Performance vs Quality Trade-off

   ```
   Quality ↑
     5 │                    ◆ Slumber (18-20 min)
       │               ◆ Neural (17-18 min)
     4 │          ◆ Semantic (16-17 min)
       │      ◆ Recursive (15.5-16 min)
     3 │   ◆ Hybrid (15 min) - DEFAULT
       │ ◆ Sentence (15-16 min)
     2 │◆ Token (15 min)
     1 │
       └────────────────────────────────> Speed
   ```

   **Interpretation:**
   - **Bottom-left**: Fast but basic (Token, Sentence)
   - **Middle**: Balanced (Hybrid, Recursive)
   - **Top-right**: High quality but slower (Semantic, Neural, Slumber)

   **Choose based on your priorities:**
   - Need results fast? → Hybrid or Sentence
   - Have 5 extra minutes for better quality? → Semantic
   - Processing overnight, want best quality? → Neural or Slumber
   ```

4. **Add Troubleshooting Section**:
   ```markdown
   ## Troubleshooting

   ### "Processing is taking too long"
   - **Solution**: Use Hybrid (default) or Sentence chunker
   - Semantic/Neural/Slumber are slower but produce better connections
   - Processing 500-page book should take <20 min for all chunkers

   ### "Chunks don't have metadata (headings, pages)"
   - **Check**: Metadata recovery rate in Admin Panel
   - **Solution**: This is rare (<5% of chunks)
   - Metadata is interpolated for chunks without direct overlaps

   ### "Connection quality seems low"
   - **Try**: Reprocess with Semantic or Neural chunker
   - Connection improvement: +15-25% over Hybrid
   - View connections in reader right panel

   ### "Which chunker should I use?"
   - **Default**: Hybrid (fast, reliable, works for most documents)
   - **Narrative**: Semantic (thematic connections)
   - **Technical**: Recursive (preserves structure)
   - **Quality-first**: Neural or Slumber (best connections)
   ```

5. **Update main README.md**:
   - Add section on hybrid chunking system
   - Link to best practices guide
   - Show decision matrix in README

**Code Patterns to Follow**:
- **Documentation Style**: `docs/ARCHITECTURE.md` - Technical but accessible
- **Visual Diagrams**: `docs/APP_VISION.md` - ASCII art diagrams

#### Acceptance Criteria

**Rule-Based Criteria**:
- [ ] **Completeness**: All 6 chunker types documented
- [ ] **Usability**: Quick decision matrix prominently placed
- [ ] **Visual Aids**: Performance vs quality visualization included
- [ ] **Real Examples**: At least 2 example documents per chunker
- [ ] **Troubleshooting**: Common issues and solutions documented
- [ ] **Accuracy**: Data-driven recommendations from A/B test results
- [ ] **Accessibility**: Written for non-technical users

#### Validation Commands

```bash
# Verify documentation exists
ls -l docs/chunker-best-practices.md
ls -l docs/chunker-strategy-guide.md

# Validate markdown
npx markdownlint docs/chunker-best-practices.md
npx markdownlint docs/chunker-strategy-guide.md

# Check for broken links
npx markdown-link-check docs/chunker-best-practices.md

# Manual review checklist:
# [ ] Quick decision matrix is clear and actionable
# [ ] Each chunker has detailed profile
# [ ] Performance trade-offs explained
# [ ] Real-world examples provided
# [ ] Troubleshooting covers common issues
# [ ] Links to technical docs work
# [ ] README updated with overview
```

#### Resources & References

**Documentation**:
- PRP Decision Matrix: Lines 402-413
- PRP Chunker Guide: Lines 188-399
- A/B Test Results: `docs/chunker-comparison-results.md`

**Documentation Examples**:
- `docs/ARCHITECTURE.md` - Technical documentation style
- `docs/APP_VISION.md` - User-facing documentation style

---

## Summary & Critical Path

### Total Estimated Effort
- **Phase 0** (Validation): 0.5 weeks (T-001, T-002)
- **Phase 1** (Infrastructure): 1 week (T-003, T-004, T-005, T-006)
- **Phase 2** (Metadata Transfer): 1 week (T-007, T-008)
- **Phase 3** (UI Integration): 1 week (T-009, T-010, T-011)
- **Phase 4** (Testing & Optimization): 1 week (T-012, T-013, T-014)

**Total**: 4.5 weeks

### Critical Path
```
T-001 (Validation)
  → T-003 (Python Wrapper)
    → T-004 (TypeScript IPC)
      → T-007 (Metadata Transfer)
        → T-009 (UI Integration)
          → T-012 (A/B Testing)
            → T-014 (Documentation)
```

**Parallel Tracks**:
- T-002, T-005, T-006 can run alongside T-003/T-004
- T-010, T-011 can run alongside T-009
- T-013 runs alongside T-012

### Success Metrics Summary

**Quantitative** (from PRP lines 1027-1036):
- [ ] Processing time: <20 min for 500-page book (all chunkers)
- [ ] Metadata recovery: >90% overlap coverage
- [ ] Chunk count variance: ±10% from HybridChunker baseline
- [ ] Connection quality: >15% improvement for semantic/neural
- [ ] Test coverage: >90% for chunker system

**Qualitative** (from PRP lines 1038-1045):
- [ ] User satisfaction: Positive feedback on chunker flexibility
- [ ] Documentation: Complete best practices guide
- [ ] Error rate: <1% chunker failures
- [ ] Metadata accuracy: Manual validation of 20 documents
- [ ] Chunk position accuracy: Binary search 100% accurate

**Regression Prevention** (from PRP lines 1047-1053):
- [ ] HybridChunker path: Zero regressions
- [ ] Bulletproof matcher: 100% recovery guarantee maintained
- [ ] Existing documents: No impact on previously processed
- [ ] Fix Position feature: Works correctly after matcher fix

---

## Risk Mitigation

### High Risk: Metadata Loss
**Status**: ✅ MITIGATED by Phase 0 validation

**Mitigation**:
- Bulletproof matcher validated before Chonkie integration
- Overlap detection proven to work (94% in testing)
- Overlaps are expected mechanism for metadata transfer
- Confidence tracking provides transparency
- Fallback to HybridChunker if overlap coverage <70%

### Medium Risk: Performance Degradation
**Mitigation**:
- Clear time estimates in UI
- Default to fast HybridChunker
- Optional GPU acceleration for neural
- User choice (speed vs quality trade-off)
- Timeout tuning based on document size

### Low Risk: Chunker Failure
**Mitigation**:
- Comprehensive error handling in Python and TypeScript
- Timeout handling with process kill
- Graceful fallback to HybridChunker
- Retry mechanism with exponential backoff
- Detailed error logging for troubleshooting

---

## Implementation Recommendations

### Task Sequencing
1. **Start with Phase 0** (validation is critical foundation)
2. **Phase 1 can be parallelized** (Python + TypeScript + migration)
3. **Phase 2 depends on Phase 1** (metadata transfer needs IPC wrapper)
4. **Phase 3 can start early** (UI work independent of backend)
5. **Phase 4 requires full system** (testing needs everything working)

### Team Structure (if applicable)
- **Backend Developer**: T-003, T-004, T-007, T-013
- **Database Engineer**: T-005
- **Frontend Developer**: T-009, T-010, T-011
- **QA Engineer**: T-001, T-002, T-006, T-008, T-012
- **Technical Writer**: T-014

### Optimal Task Sequencing for Single Developer
**Week 0.5** (Phase 0):
- Day 1: T-001 (validation)
- Day 2: T-002 (documentation)

**Week 1** (Phase 1):
- Day 1-2: T-003 (Python wrapper) + T-005 (migration)
- Day 3: T-004 (TypeScript IPC)
- Day 4-5: T-006 (unit tests)

**Week 2** (Phase 2):
- Day 1-3: T-007 (metadata transfer)
- Day 4-5: T-008 (integration tests)

**Week 3** (Phase 3):
- Day 1-2: T-009 (UI integration)
- Day 3: T-010 (metadata display)
- Day 4-5: T-011 (admin panel)

**Week 4** (Phase 4):
- Day 1-3: T-012 (A/B testing - long-running)
- Day 4: T-013 (optimization)
- Day 5: T-014 (documentation)

---

## Appendix: File Inventory

### New Files Created
```
worker/scripts/chonkie_chunk.py - Python chunking script
worker/lib/chonkie/chonkie-chunker.ts - TypeScript IPC wrapper
worker/lib/chonkie/types.ts - TypeScript interfaces
worker/lib/chonkie/metadata-transfer.ts - Overlap-based metadata transfer
worker/lib/chonkie/README.md - Overlap documentation
worker/scripts/validate-bulletproof-matcher.ts - Validation script
worker/scripts/test-chonkie-metadata-transfer.ts - Metadata validation
worker/scripts/ab-test-chunkers.ts - A/B testing script
worker/lib/chonkie/__tests__/chonkie-chunker.test.ts - Unit tests
worker/lib/chonkie/__tests__/metadata-transfer.test.ts - Unit tests
worker/lib/chonkie/__tests__/test-all-chunkers.ts - Integration tests
worker/tests/integration/chonkie-metadata-transfer.test.ts - Integration tests
supabase/migrations/050_add_chunker_type.sql - Database migration
src/components/admin/ChunkerStatsTab.tsx - Admin panel tab
docs/validation/bulletproof-matcher-validation.md - Validation results
docs/chunker-comparison-results.md - A/B test results
docs/chunker-best-practices.md - User guide
docs/chunker-strategy-guide.md - Technical deep dive
```

### Files Modified
```
src/components/library/UploadZone.tsx - Add chunker selection
src/components/reader/DocumentMetadata.tsx - Display chunker type
src/components/library/DocumentCard.tsx - Show chunker badge
src/components/admin/AdminPanel.tsx - Add chunker stats tab
src/lib/types/database.ts - Add ChunkerType type
worker/scripts/requirements.txt - Add chonkie dependency
docs/processing-pipeline/bulletproof-metadata-extraction.md - Add overlap section
README.md - Add chunker system overview
```

---

**End of Task Breakdown**
