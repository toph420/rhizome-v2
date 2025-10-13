# Docling Optimization v1 - Task Breakdown

**Source PRP**: [docs/prps/docling-optimization-v1.md](../prps/docling-optimization-v1.md)
**Status**: Ready for Implementation
**Priority**: High
**Total Estimated Effort**: 6 hours (2-3 days with testing)
**Last Updated**: 2025-10-12

---

## Table of Contents

1. [Phase 1: Configuration Fixes](#phase-1-configuration-fixes)
2. [Phase 2: Flexible Pipeline Configuration](#phase-2-flexible-pipeline-configuration)
3. [Phase 3: Database Migration](#phase-3-database-migration)
4. [Phase 4: Metadata Copying in Bulletproof Matcher](#phase-4-metadata-copying-in-bulletproof-matcher)
5. [Phase 5: Metadata-Enhanced Embeddings](#phase-5-metadata-enhanced-embeddings)
6. [Phase 6: Validation & Testing](#phase-6-validation--testing)
7. [Success Metrics](#success-metrics)
8. [Rollout Strategy](#rollout-strategy)

---

## Phase 1: Configuration Fixes

**Duration**: 30 minutes
**Priority**: Critical (Blocks all other work)
**Dependencies**: None

### Overview

Fix invalid HybridChunker configuration and standardize chunk size across PDF and EPUB processors. This phase addresses the critical discovery that `heading_as_metadata=True` parameter doesn't exist in Docling's API.

---

### T-001: Remove Invalid Parameter from EPUB Script

**Task ID**: T-001
**Priority**: Critical
**Estimated Effort**: 5 minutes

#### Task Purpose

**As a** document processing system
**I need** to remove the non-existent `heading_as_metadata` parameter from EPUB extraction
**So that** the Docling HybridChunker receives only valid configuration parameters

#### Dependencies

- **Prerequisite Tasks**: None
- **Parallel Tasks**: None
- **Blocked By**: None

#### Implementation Details

**Files to Modify**:
```
└── worker/scripts/docling_extract_epub.py (Line 169-174)
```

**Key Implementation Steps**:
1. Locate HybridChunker initialization in `docling_extract_epub.py`
2. Remove `heading_as_metadata=True` line
3. Keep `merge_peers=True` as it's a valid parameter
4. Verify no other invalid parameters exist

**Code Change**:
```diff
# Line 169-174
chunker = HybridChunker(
    tokenizer=options.get('tokenizer', 'Xenova/all-mpnet-base-v2'),
    max_tokens=options.get('chunk_size', 512),
-   merge_peers=True,
-   heading_as_metadata=True
+   merge_peers=True
)
```

#### Acceptance Criteria

```gherkin
Scenario 1: EPUB processing without errors
  Given an EPUB file with chapters and headings
  When the extraction script runs with default configuration
  Then the HybridChunker initializes without parameter errors
  And heading metadata is still captured (automatic behavior)

Scenario 2: Heading metadata still extracted
  Given an EPUB with heading hierarchy
  When chunks are generated
  Then heading_path metadata is present in chunk metadata
  And no warnings about invalid parameters appear
```

#### Checklist

- [ ] Invalid parameter removed from docling_extract_epub.py
- [ ] Script runs without Python errors
- [ ] Heading metadata still extracted (verified in output)
- [ ] No warnings in console output

#### Validation Commands

```bash
cd worker

# Test EPUB processing
echo '{"chunk_size": 512}' | python3 scripts/docling_extract_epub.py < tests/fixtures/test.epub

# Verify no errors in output
# Verify heading metadata present in JSON output
```

---

### T-002: Create Shared Chunker Configuration Module

**Task ID**: T-002
**Priority**: High
**Estimated Effort**: 15 minutes

#### Task Purpose

**As a** document processing system
**I need** a single source of truth for HybridChunker configuration
**So that** PDF and EPUB processors use consistent chunking parameters and updates are centralized

#### Dependencies

- **Prerequisite Tasks**: None
- **Parallel Tasks**: Can be done in parallel with T-001
- **Integration Points**: PDF processor, EPUB processor, future document types

#### Implementation Details

**Files to Create**:
```
└── worker/lib/chunking/chunker-config.ts (NEW)
```

**Key Implementation Steps**:
1. Create TypeScript interface for ChunkerConfig
2. Define STANDARD_CHUNKER_CONFIG constant with 768 tokens
3. Create getChunkerOptions() function for Python JSON serialization
4. Add comprehensive documentation explaining token increase rationale

**Code to Implement**:
```typescript
/**
 * Shared HybridChunker configuration for PDF and EPUB processing.
 *
 * Based on research findings:
 * - 768 tokens optimal for academic/book content
 * - Aligns with 768d embedding model
 * - Provides +50% context vs previous 512 tokens
 */

export interface ChunkerConfig {
  tokenizer: string
  max_tokens: number
  merge_peers: boolean
}

/**
 * Standard chunker configuration.
 * Used by both PDF and EPUB processors.
 */
export const STANDARD_CHUNKER_CONFIG: ChunkerConfig = {
  tokenizer: 'Xenova/all-mpnet-base-v2',  // MUST match embeddings model
  max_tokens: 768,                         // Increased from 512 (research-backed)
  merge_peers: true                        // Merge undersized adjacent chunks
}

/**
 * Get chunker options as Python JSON.
 * For passing to Docling extraction scripts.
 */
export function getChunkerOptions(): string {
  return JSON.stringify({
    tokenizer: STANDARD_CHUNKER_CONFIG.tokenizer,
    chunk_size: STANDARD_CHUNKER_CONFIG.max_tokens
  })
}
```

#### Acceptance Criteria

```gherkin
Scenario 1: Configuration module exports correct values
  Given the chunker-config.ts module
  When imported in TypeScript code
  Then STANDARD_CHUNKER_CONFIG contains 768 max_tokens
  And tokenizer is 'Xenova/all-mpnet-base-v2'
  And merge_peers is true

Scenario 2: Python JSON serialization works
  Given the getChunkerOptions() function
  When called
  Then it returns valid JSON string
  And JSON contains 'chunk_size': 768
  And JSON contains 'tokenizer': 'Xenova/all-mpnet-base-v2'
```

#### Checklist

- [ ] TypeScript file created with proper types
- [ ] STANDARD_CHUNKER_CONFIG uses 768 tokens
- [ ] getChunkerOptions() returns valid JSON
- [ ] Documentation explains 512 → 768 rationale
- [ ] File compiles without TypeScript errors

#### Validation Commands

```bash
cd worker

# Check TypeScript compilation
npx tsc --noEmit lib/chunking/chunker-config.ts

# Test import works
node -e "const { getChunkerOptions } = require('./lib/chunking/chunker-config.js'); console.log(getChunkerOptions())"
```

---

### T-003: Update PDF Processor to Use Shared Config

**Task ID**: T-003
**Priority**: High
**Estimated Effort**: 5 minutes

#### Task Purpose

**As a** PDF processor
**I need** to use the shared chunker configuration
**So that** chunking parameters are consistent and centrally managed

#### Dependencies

- **Prerequisite Tasks**: T-002 (Shared config must exist)
- **Integration Points**: worker/lib/docling-extractor.ts, worker/scripts/docling_extract.py

#### Implementation Details

**Files to Modify**:
```
└── worker/processors/pdf-processor.ts (Line 100-105)
```

**Key Implementation Steps**:
1. Import getChunkerOptions from chunker-config.ts
2. Replace hardcoded chunkSize and tokenizer
3. Spread parsed JSON options into extractPdfBuffer config
4. Remove duplicate configuration

**Code Change**:
```diff
// Line 100-102
+ import { getChunkerOptions } from '../lib/chunking/chunker-config.js'

const extractionResult = await extractPdfBuffer(
  fileBuffer,
  {
    enableChunking: isLocalMode,
-   chunkSize: 512,
-   tokenizer: 'Xenova/all-mpnet-base-v2',
+   ...JSON.parse(getChunkerOptions()),
    ocr: false,
    timeout: 30 * 60 * 1000,
  }
)
```

#### Acceptance Criteria

```gherkin
Scenario 1: PDF processor uses shared config
  Given a PDF file to process
  When extraction runs in LOCAL mode
  Then HybridChunker receives 768 max_tokens
  And tokenizer is 'Xenova/all-mpnet-base-v2'
  And no hardcoded chunk size remains

Scenario 2: Configuration changes propagate
  Given STANDARD_CHUNKER_CONFIG is updated
  When PDF processor runs
  Then it uses the updated configuration
  And no code changes needed in processor
```

#### Checklist

- [ ] Import statement added
- [ ] Hardcoded values removed
- [ ] getChunkerOptions() result spread correctly
- [ ] TypeScript compiles without errors
- [ ] PDF processing test passes

#### Validation Commands

```bash
cd worker

# Check TypeScript compilation
npx tsc --noEmit processors/pdf-processor.ts

# Run PDF processing test
npm run test:pdf-processor
```

---

### T-004: Update EPUB Processor to Use Shared Config

**Task ID**: T-004
**Priority**: High
**Estimated Effort**: 5 minutes

#### Task Purpose

**As an** EPUB processor
**I need** to use the shared chunker configuration
**So that** EPUB and PDF processing use identical chunking parameters

#### Dependencies

- **Prerequisite Tasks**: T-002 (Shared config must exist)
- **Integration Points**: worker/lib/docling-extractor.ts, worker/scripts/docling_extract_epub.py

#### Implementation Details

**Files to Modify**:
```
└── worker/processors/epub-processor.ts (Line 100-101)
```

**Key Implementation Steps**:
1. Import getChunkerOptions from chunker-config.ts
2. Replace hardcoded tokenizer and chunkSize
3. Spread parsed JSON options
4. Verify EPUB script receives correct parameters

**Code Change**:
```diff
// Line 100-101
+ import { getChunkerOptions } from '../lib/chunking/chunker-config.js'

return await extractEpubWithDocling(fileData.buffer, {
- tokenizer: 'Xenova/all-mpnet-base-v2',
- chunkSize: 512,
+ ...JSON.parse(getChunkerOptions()),
  onProgress: async (percent, stage, message) => {
```

#### Acceptance Criteria

```gherkin
Scenario 1: EPUB processor uses shared config
  Given an EPUB file to process
  When extraction runs
  Then HybridChunker receives 768 max_tokens
  And tokenizer matches PDF processor
  And configuration is identical to PDF processing

Scenario 2: EPUB chunks match expected size
  Given an EPUB processed with new config
  When chunks are generated
  Then average chunk size is ~600-850 tokens
  And chunk count is ~30% less than with 512 tokens
```

#### Checklist

- [ ] Import statement added
- [ ] Hardcoded values removed
- [ ] Configuration spread correctly
- [ ] TypeScript compiles
- [ ] EPUB processing test passes

#### Validation Commands

```bash
cd worker

# Check TypeScript compilation
npx tsc --noEmit processors/epub-processor.ts

# Run EPUB processing test
npm run test:epub-processor
```

---

### Phase 1 Success Criteria

- [ ] All 4 tasks completed (T-001 through T-004)
- [ ] Invalid parameter removed from EPUB script
- [ ] Shared configuration module created
- [ ] Both processors use 768-token chunks
- [ ] No hardcoded chunk sizes remain
- [ ] All processor tests pass

---

## Phase 2: Flexible Pipeline Configuration

**Duration**: 45 minutes
**Priority**: High
**Dependencies**: Phase 1 complete

### Overview

Create a comprehensive configuration system that exposes all Docling pipeline features while maintaining sensible defaults. Users can control features via environment variables without code changes.

---

### T-005: Create Flexible Pipeline Configuration System

**Task ID**: T-005
**Priority**: High
**Estimated Effort**: 20 minutes

#### Task Purpose

**As a** document processing system
**I need** a flexible configuration system for Docling pipeline features
**So that** users can enable/disable features via environment variables without modifying code

#### Dependencies

- **Prerequisite Tasks**: Phase 1 complete
- **Integration Points**: PDF processor, EPUB processor, Python extraction scripts

#### Implementation Details

**Files to Create**:
```
└── worker/lib/local/docling-config.ts (NEW, ~500 lines)
```

**Key Implementation Steps**:
1. Define DoclingPipelineConfig interface with all features
2. Create FEATURE_GUIDE documentation object
3. Implement getDefaultPipelineConfig() - quality-first defaults
4. Implement applyEnvironmentOverrides() - env var parsing
5. Implement applyDocumentHints() - auto-optimization for large docs
6. Implement getPipelineConfig() - orchestration function
7. Implement logPipelineConfig() - transparency logging
8. Implement formatPipelineConfigForPython() - serialization

**Configuration Features**:
- Image extraction (figures, tables)
- AI enrichment (classification, description, code analysis)
- OCR for scanned documents
- Page batching for memory optimization
- Table structure extraction

**Environment Variables**:
```bash
EXTRACT_IMAGES=true          # Default: true
IMAGE_SCALE=2.0              # Default: 2.0 (144 DPI)
EXTRACT_TABLES=true          # Default: true
CLASSIFY_IMAGES=false        # Default: false (opt-in)
DESCRIBE_IMAGES=false        # Default: false (opt-in)
ENRICH_CODE=false            # Default: false (opt-in)
ENABLE_OCR=false             # Default: false
```

#### Acceptance Criteria

```gherkin
Scenario 1: Default configuration is quality-first
  Given no environment variables set
  When getPipelineConfig() is called
  Then figure extraction is enabled
  And table extraction is enabled
  And AI features are disabled
  And OCR is disabled

Scenario 2: Environment overrides work
  Given CLASSIFY_IMAGES=true environment variable
  When getPipelineConfig() is called
  Then do_picture_classification is true
  And other defaults remain unchanged

Scenario 3: Document hints auto-optimize
  Given a document with 300 pages
  When getPipelineConfig({ pageCount: 300 }) is called
  Then page_batch_size is set to 50
  And memory optimization is logged

Scenario 4: Configuration logging provides transparency
  Given any configuration
  When logPipelineConfig() is called
  Then all enabled/disabled features are printed
  And image quality settings are shown
  And the output is human-readable
```

#### Checklist

- [ ] TypeScript interface covers all Docling features
- [ ] FEATURE_GUIDE explains each feature with use cases
- [ ] Default config prioritizes quality over speed
- [ ] Environment variables override defaults
- [ ] Document hints enable auto-optimization
- [ ] Logging shows configuration decisions
- [ ] Python serialization format matches script expectations
- [ ] TypeScript compiles without errors

#### Validation Commands

```bash
cd worker

# Test TypeScript compilation
npx tsc --noEmit lib/local/docling-config.ts

# Test default configuration
node -e "const { getPipelineConfig, logPipelineConfig } = require('./lib/local/docling-config.js'); const cfg = getPipelineConfig(); logPipelineConfig(cfg)"

# Test environment override
CLASSIFY_IMAGES=true node -e "const { getPipelineConfig } = require('./lib/local/docling-config.js'); console.log(getPipelineConfig())"

# Test document hints
node -e "const { getPipelineConfig } = require('./lib/local/docling-config.js'); console.log(getPipelineConfig({ pageCount: 300 }))"
```

---

### T-006: Update Python Extraction Scripts to Accept Pipeline Options

**Task ID**: T-006
**Priority**: High
**Estimated Effort**: 15 minutes

#### Task Purpose

**As a** Python extraction script
**I need** to accept and apply pipeline configuration options
**So that** features can be enabled/disabled from TypeScript configuration

#### Dependencies

- **Prerequisite Tasks**: T-005 (Config system must exist)
- **Integration Points**: worker/lib/docling-extractor.ts

#### Implementation Details

**Files to Modify**:
```
├── worker/scripts/docling_extract.py (Lines 10-12, 185-195)
└── worker/scripts/docling_extract_epub.py (Similar changes)
```

**Key Implementation Steps**:
1. Update docstring to document new options
2. Configure PdfPipelineOptions from options dict
3. Pass pipeline_options to DocumentConverter
4. Apply page batching if specified
5. Test with various configurations

**Code Changes**:
```diff
# Line 10-12 (update docstring)
Options:
    - enable_chunking: bool (default: false)
    - chunk_size: int (default: 512 tokens)
    - tokenizer: str (default: 'Xenova/all-mpnet-base-v2')
+   - do_picture_classification: bool (default: false)
+   - do_picture_description: bool (default: false)
+   - do_code_enrichment: bool (default: false)
+   - generate_page_images: bool (default: false)
+   - generate_picture_images: bool (default: false)
+   - images_scale: float (default: 1.0)
+   - page_batch_size: int (optional, for large docs)
    - ocr: bool (enable OCR for scanned PDFs)

# Line 185-195 (configure pipeline)
def extract_with_chunking(pdf_path: str, options: Dict[str, Any]) -> Dict[str, Any]:
    emit_progress('extraction', 5, 'Initializing Docling converter')

+   # Configure pipeline options
+   pipeline_options = PdfPipelineOptions()
+   pipeline_options.do_picture_classification = options.get('do_picture_classification', False)
+   pipeline_options.do_picture_description = options.get('do_picture_description', False)
+   pipeline_options.do_code_enrichment = options.get('do_code_enrichment', False)
+   pipeline_options.generate_page_images = options.get('generate_page_images', False)
+   pipeline_options.do_ocr = options.get('ocr', False)
+   pipeline_options.do_table_structure = options.get('do_table_structure', True)
+   pipeline_options.generate_picture_images = options.get('generate_picture_images', False)
+   pipeline_options.generate_table_images = options.get('generate_table_images', False)
+   pipeline_options.images_scale = options.get('images_scale', 1.0)
+
+   if 'page_batch_size' in options:
+       pipeline_options.page_batch_size = options['page_batch_size']

-   converter = DocumentConverter()
+   converter = DocumentConverter(
+       format_options={
+           InputFormat.PDF: PdfFormatOption(pipeline_options=pipeline_options)
+       }
+   )
```

#### Acceptance Criteria

```gherkin
Scenario 1: Script accepts all configuration options
  Given a PDF and full pipeline configuration
  When extraction script runs
  Then all options are applied to PdfPipelineOptions
  And DocumentConverter uses the configured options
  And no errors occur

Scenario 2: Disabled features improve performance
  Given a PDF and all AI features disabled
  When extraction script runs
  Then processing completes 25-30% faster than with features enabled
  And output quality is unchanged

Scenario 3: Page batching reduces memory
  Given a 300-page PDF with page_batch_size=50
  When extraction script runs
  Then memory usage stays under 12GB
  And processing completes successfully
```

#### Checklist

- [ ] Docstring updated with all options
- [ ] PdfPipelineOptions configured from options dict
- [ ] DocumentConverter receives pipeline options
- [ ] Page batching applied when specified
- [ ] Script runs without Python errors
- [ ] Performance improvement measured

#### Validation Commands

```bash
cd worker

# Test with default options
python3 scripts/docling_extract.py /path/to/test.pdf '{"enable_chunking": true}'

# Test with AI features enabled
python3 scripts/docling_extract.py /path/to/test.pdf '{"enable_chunking": true, "do_picture_classification": true}'

# Test with page batching
python3 scripts/docling_extract.py /path/to/large.pdf '{"enable_chunking": true, "page_batch_size": 50}'

# Measure performance difference
time python3 scripts/docling_extract.py test.pdf '{"do_picture_classification": true}' > /dev/null
time python3 scripts/docling_extract.py test.pdf '{"do_picture_classification": false}' > /dev/null
```

---

### T-007: Integrate Pipeline Config into PDF Processor

**Task ID**: T-007
**Priority**: High
**Estimated Effort**: 10 minutes

#### Task Purpose

**As a** PDF processor
**I need** to use the flexible pipeline configuration system
**So that** document processing respects user preferences and auto-optimizes for document characteristics

#### Dependencies

- **Prerequisite Tasks**: T-005, T-006
- **Integration Points**: worker/lib/docling-extractor.ts

#### Implementation Details

**Files to Modify**:
```
└── worker/processors/pdf-processor.ts (Lines 97-104)
```

**Key Implementation Steps**:
1. Import configuration functions
2. Get pipeline config with document hints (page count)
3. Log configuration for transparency
4. Format and pass to extractPdfBuffer
5. Test with various document types

**Code Change**:
```diff
// Line 97-104
+ import { getPipelineConfig, logPipelineConfig, formatPipelineConfigForPython } from '../lib/local/docling-config.js'

+ // Get pipeline configuration (defaults + env overrides + document hints)
+ const pipelineConfig = getPipelineConfig({
+   pageCount: metadata?.pageCount
+ })
+
+ // Log configuration for transparency
+ logPipelineConfig(pipelineConfig)

const extractionResult = await extractPdfBuffer(
  fileBuffer,
  {
    enableChunking: isLocalMode,
    ...JSON.parse(getChunkerOptions()),
+   ...JSON.parse(formatPipelineConfigForPython(pipelineConfig)),
-   ocr: false,
    timeout: 30 * 60 * 1000,
  }
)
```

#### Acceptance Criteria

```gherkin
Scenario 1: Configuration logged before processing
  Given a PDF to process
  When processing starts
  Then configuration is logged showing all enabled/disabled features
  And log shows document-specific optimizations

Scenario 2: Large documents get page batching
  Given a PDF with 300 pages
  When processing starts
  Then configuration includes page_batch_size=50
  And log indicates memory optimization enabled

Scenario 3: Environment overrides applied
  Given CLASSIFY_IMAGES=true environment variable
  When PDF processing starts
  Then configuration includes do_picture_classification=true
  And Python script receives the option
```

#### Checklist

- [ ] Configuration imports added
- [ ] getPipelineConfig() called with page count hint
- [ ] Configuration logged before extraction
- [ ] Pipeline config passed to Python script
- [ ] Large document test shows batching enabled
- [ ] Environment variable test shows override works

#### Validation Commands

```bash
cd worker

# Test configuration logging
npm run dev:worker
# Process a PDF and check console for config log

# Test page batching for large docs
# (Mock metadata with pageCount: 300 and verify log)

# Test environment override
CLASSIFY_IMAGES=true npm run dev:worker
# Process a PDF and check config log shows classification enabled
```

---

### T-008: Create Pipeline Configuration Documentation

**Task ID**: T-008
**Priority**: Medium
**Estimated Effort**: 15 minutes

#### Task Purpose

**As a** user of the document processing system
**I need** comprehensive documentation on pipeline configuration
**So that** I understand what features are available and how to control them

#### Dependencies

- **Prerequisite Tasks**: T-005, T-006, T-007
- **Deliverable**: User-facing documentation

#### Implementation Details

**Files to Create**:
```
└── docs/docling-configuration.md (NEW, ~400 lines)
```

**Key Sections**:
1. Quick Reference - Environment variables table
2. Default Configuration - What's enabled out of the box
3. Feature Decision Guide - When to enable each feature
4. Example Configurations - Academic, programming, novels, scanned docs
5. Configuration Priority - How overrides work
6. Performance Impact Summary - Cost/benefit of each feature

**Documentation Structure**:
```markdown
# Docling Pipeline Configuration Guide

## Quick Reference
[Environment variables table]

## Default Configuration
[What's enabled by default and why]

## Feature Decision Guide
### Figure Extraction
- What it does
- Enable for: [use cases]
- Skip for: [use cases]
- Cost: [performance impact]
- Recommendation

[Repeat for each feature]

## Example Configurations
### Academic Papers
### Programming Books
### Novels (Text-Only)
### Scanned Documents

## Configuration Priority
1. Environment variables (explicit)
2. Document hints (auto-detection)
3. Sensible defaults (quality-first)

## Performance Impact Summary
[Table with time/memory/recommendation for each feature]
```

#### Acceptance Criteria

```gherkin
Scenario 1: User finds feature explanations
  Given docs/docling-configuration.md
  When user searches for a feature (e.g., "OCR")
  Then they find a dedicated section explaining:
    - What the feature does
    - When to enable it
    - When to skip it
    - Performance impact
    - Recommendation

Scenario 2: User finds example configurations
  Given the documentation
  When user wants to process programming books
  Then they find "Programming Books" example configuration
  And it shows which env vars to set
  And it explains the expected results

Scenario 3: User understands configuration priority
  Given the documentation
  When user sets environment variable
  Then they understand it overrides defaults
  And they understand document hints come after env vars
```

#### Checklist

- [ ] All features documented with use cases
- [ ] Example configurations for 4+ document types
- [ ] Performance impact table created
- [ ] Configuration priority explained
- [ ] Environment variables reference complete
- [ ] Markdown formatting correct
- [ ] Links work

#### Validation Commands

```bash
# Check markdown syntax
npx markdownlint docs/docling-configuration.md

# Verify links work
grep -o '\[.*\](.*\.md)' docs/docling-configuration.md

# Check all features documented
grep "###" docs/docling-configuration.md | wc -l  # Should be 7+ (one per feature)
```

---

### Phase 2 Success Criteria

- [ ] All 4 tasks completed (T-005 through T-008)
- [ ] Configuration system created with all Docling features
- [ ] Python scripts accept pipeline options
- [ ] PDF processor uses configuration system
- [ ] Documentation explains all features
- [ ] Environment variables control features
- [ ] Configuration logged for transparency

---

## Phase 3: Database Migration

**Duration**: 15 minutes
**Priority**: Critical
**Dependencies**: None (can be done in parallel with Phase 1-2)

### Overview

Extend the chunks table with Docling structural metadata fields (heading_path, heading_level, section_marker). These fields enable better citations, filtering, and metadata-enhanced embeddings.

---

### T-009: Create and Apply Database Migration

**Task ID**: T-009
**Priority**: Critical
**Estimated Effort**: 10 minutes

#### Task Purpose

**As a** document processing system
**I need** to store Docling structural metadata in the chunks table
**So that** chunks have richer context for citations, filtering, and embeddings

#### Dependencies

- **Prerequisite Tasks**: None
- **Parallel Tasks**: Can be done while working on Phase 1-2
- **Integration Points**: Chunks table, bulletproof matcher, embeddings

#### Technical Requirements

**Schema Changes**:
- Add `heading_path` (TEXT[]) - Heading hierarchy array
- Add `heading_level` (INTEGER) - Depth in heading tree
- Add `section_marker` (TEXT) - Section identifier for EPUBs

**Indexes**:
- GIN index on heading_path for hierarchy queries
- B-tree index on (document_id, heading_level) for filtering
- B-tree index on (document_id, section_marker) for EPUB navigation

#### Implementation Details

**Files to Create**:
```
└── supabase/migrations/042_extend_chunk_metadata.sql (NEW)
```

**Migration SQL**:
```sql
-- Extend chunks table with Docling structural metadata
-- These fields enhance citations, filtering, and embeddings

-- Add heading hierarchy
ALTER TABLE chunks
  ADD COLUMN IF NOT EXISTS heading_path TEXT[];

-- Add heading level
ALTER TABLE chunks
  ADD COLUMN IF NOT EXISTS heading_level INTEGER;

-- Add section marker (for EPUBs)
ALTER TABLE chunks
  ADD COLUMN IF NOT EXISTS section_marker TEXT;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_chunks_heading_path
  ON chunks USING GIN (heading_path);

CREATE INDEX IF NOT EXISTS idx_chunks_heading_level
  ON chunks (document_id, heading_level)
  WHERE heading_level IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_chunks_section
  ON chunks (document_id, section_marker)
  WHERE section_marker IS NOT NULL;

-- Add comments
COMMENT ON COLUMN chunks.heading_path IS
  'Heading hierarchy from Docling (e.g., ["Chapter 3", "Results", "Discussion"])';

COMMENT ON COLUMN chunks.heading_level IS
  'Depth in heading tree (1 = top-level)';

COMMENT ON COLUMN chunks.section_marker IS
  'Section identifier for EPUBs (e.g., "chapter_003")';
```

#### Acceptance Criteria

```gherkin
Scenario 1: Migration applies cleanly
  Given a fresh database
  When migration 042 is applied
  Then all 3 columns are added
  And all 3 indexes are created
  And no errors occur

Scenario 2: Migration is idempotent
  Given migration 042 already applied
  When migration runs again
  Then no errors occur
  And no duplicate columns created

Scenario 3: Existing data unaffected
  Given existing chunks in database
  When migration 042 is applied
  Then all existing chunks remain
  And new columns are NULL for existing rows
  And all queries still work

Scenario 4: Indexes improve query performance
  Given 10,000 chunks with heading_path
  When querying by heading hierarchy
  Then query uses GIN index
  And query completes in <50ms
```

#### Checklist

- [ ] Migration file created with correct number (042)
- [ ] 3 columns added with correct types
- [ ] 3 indexes created
- [ ] Columns are NULLable (backward compatible)
- [ ] Comments added for documentation
- [ ] IF NOT EXISTS used for idempotency
- [ ] Migration applies without errors
- [ ] Existing data verified intact

#### Validation Commands

```bash
# Apply migration
npx supabase db reset

# Verify columns added
npx supabase db execute "
  SELECT column_name, data_type, is_nullable
  FROM information_schema.columns
  WHERE table_name = 'chunks'
    AND column_name IN ('heading_path', 'heading_level', 'section_marker')
  ORDER BY column_name
"

# Verify indexes created
npx supabase db execute "
  SELECT indexname, indexdef
  FROM pg_indexes
  WHERE tablename = 'chunks'
    AND indexname LIKE '%heading%'
  ORDER BY indexname
"

# Test query performance with GIN index
npx supabase db execute "
  EXPLAIN ANALYZE
  SELECT id, heading_path
  FROM chunks
  WHERE heading_path @> ARRAY['Chapter 3']
"

# Verify existing chunks unaffected
npx supabase db execute "
  SELECT COUNT(*) as total_chunks
  FROM chunks
"
```

---

### T-010: Verify Migration and Test Backward Compatibility

**Task ID**: T-010
**Priority**: High
**Estimated Effort**: 5 minutes

#### Task Purpose

**As a** database administrator
**I need** to verify the migration works correctly and doesn't break existing functionality
**So that** the system remains stable during schema changes

#### Dependencies

- **Prerequisite Tasks**: T-009 (Migration must be created)
- **Integration Points**: All queries that read from chunks table

#### Implementation Details

**Testing Strategy**:
1. Verify migration applies cleanly
2. Check existing chunks unaffected
3. Test inserting new chunks with metadata
4. Test inserting new chunks without metadata
5. Verify indexes used in queries

**Test Queries**:
```sql
-- Test 1: Insert chunk with full metadata
INSERT INTO chunks (document_id, content, heading_path, heading_level, section_marker)
VALUES ('test-doc', 'Test content', ARRAY['Chapter 1', 'Introduction'], 1, 'ch01');

-- Test 2: Insert chunk without metadata (should work)
INSERT INTO chunks (document_id, content)
VALUES ('test-doc', 'Test content 2');

-- Test 3: Query by heading hierarchy
SELECT id, heading_path
FROM chunks
WHERE heading_path @> ARRAY['Chapter 1'];

-- Test 4: Query by heading level
SELECT id, heading_level, heading_path
FROM chunks
WHERE document_id = 'test-doc' AND heading_level = 1;

-- Test 5: Query by section marker
SELECT id, section_marker
FROM chunks
WHERE document_id = 'test-doc' AND section_marker = 'ch01';
```

#### Acceptance Criteria

```gherkin
Scenario 1: Chunks with metadata insert successfully
  Given migration 042 applied
  When inserting chunk with heading_path, heading_level, section_marker
  Then insert succeeds
  And values are stored correctly

Scenario 2: Chunks without metadata insert successfully
  Given migration 042 applied
  When inserting chunk with only content
  Then insert succeeds
  And metadata columns are NULL

Scenario 3: Queries use appropriate indexes
  Given chunks with heading metadata
  When querying by heading_path
  Then query plan shows GIN index usage
  And query completes quickly

Scenario 4: Existing application code unaffected
  Given chunks inserted before migration
  When querying chunks
  Then old chunks returned successfully
  And no errors occur
```

#### Checklist

- [ ] Migration applied successfully
- [ ] Test inserts with metadata succeed
- [ ] Test inserts without metadata succeed
- [ ] Query by heading_path works
- [ ] Query by heading_level works
- [ ] Query by section_marker works
- [ ] Index usage verified in EXPLAIN output
- [ ] Existing chunks queries work

#### Validation Commands

```bash
# Run test queries
npx supabase db execute "$(cat tests/sql/test-chunk-metadata.sql)"

# Verify indexes used
npx supabase db execute "
  EXPLAIN (ANALYZE, BUFFERS)
  SELECT id, heading_path
  FROM chunks
  WHERE heading_path @> ARRAY['Chapter 1']
" | grep -i "index"

# Check for any errors in application
npm run test:integration
```

---

### Phase 3 Success Criteria

- [ ] All 2 tasks completed (T-009 through T-010)
- [ ] Migration 042 applied successfully
- [ ] 3 new columns added to chunks table
- [ ] 3 new indexes created
- [ ] Backward compatibility verified
- [ ] Test queries work correctly
- [ ] Indexes used in query plans

---

## Phase 4: Metadata Copying in Bulletproof Matcher

**Duration**: 1 hour
**Priority**: High
**Dependencies**: Phase 3 complete (migration applied)

### Overview

Modify the bulletproof matching system to extract and copy Docling structural metadata from cached chunks to final chunks. This ensures heading_path, heading_level, and section_marker are preserved through the matching process.

---

### T-011: Update Bulletproof Matcher Types

**Task ID**: T-011
**Priority**: High
**Estimated Effort**: 10 minutes

#### Task Purpose

**As a** bulletproof matching system
**I need** to include Docling metadata in FinalChunk type
**So that** metadata flows through the matching pipeline

#### Dependencies

- **Prerequisite Tasks**: T-009 (Migration applied)
- **Integration Points**: worker/lib/local/bulletproof-matcher.ts

#### Implementation Details

**Files to Modify**:
```
└── worker/lib/local/bulletproof-matcher.ts (Lines 50-70)
```

**Key Implementation Steps**:
1. Locate FinalChunk interface
2. Add heading_path field (string[] | null)
3. Add heading_level field (number | null)
4. Add section_marker field (string | null)
5. Update any type guards or validators

**Code Change**:
```diff
// Line 50-60 (update FinalChunk interface)
export interface FinalChunk {
  chunk_index: number
  content: string
  page_start: number | null
  page_end: number | null
+ heading_path: string[] | null
+ heading_level: number | null
+ section_marker: string | null
  bboxes: BBox[] | null
  position_confidence: 'exact' | 'high' | 'medium' | 'synthetic'
  position_method: string
}
```

#### Acceptance Criteria

```gherkin
Scenario 1: FinalChunk type includes metadata fields
  Given the FinalChunk interface
  When TypeScript compilation runs
  Then heading_path is string[] | null
  And heading_level is number | null
  And section_marker is string | null
  And no TypeScript errors occur

Scenario 2: Type safety enforced
  Given code creating FinalChunk objects
  When missing metadata fields
  Then TypeScript compiler shows error
  And developer must provide fields (can be null)
```

#### Checklist

- [ ] FinalChunk interface updated
- [ ] 3 metadata fields added with correct types
- [ ] All fields nullable (backward compatible)
- [ ] TypeScript compiles without errors
- [ ] No breaking changes to existing code

#### Validation Commands

```bash
cd worker

# Check TypeScript compilation
npx tsc --noEmit lib/local/bulletproof-matcher.ts

# Verify interface exported
node -e "const { FinalChunk } = require('./lib/local/bulletproof-matcher.js'); console.log('FinalChunk interface available')"
```

---

### T-012: Extract Metadata in Bulletproof Matching Logic

**Task ID**: T-012
**Priority**: High
**Estimated Effort**: 30 minutes

#### Task Purpose

**As a** bulletproof matching system
**I need** to extract Docling metadata from cached chunks during matching
**So that** final chunks contain rich structural context

#### Dependencies

- **Prerequisite Tasks**: T-011 (Types updated)
- **Integration Points**: DoclingChunk metadata structure

#### Implementation Details

**Files to Modify**:
```
└── worker/lib/local/bulletproof-matcher.ts (Lines 400-450)
```

**Key Implementation Steps**:
1. Locate remapChunks() function
2. Find where FinalChunk objects are created
3. Extract metadata from DoclingChunk.meta
4. Create buildFinalChunk() helper function
5. Map heading_path, heading_level, section_marker
6. Handle missing metadata gracefully (set to null)

**Code to Add**:
```typescript
function buildFinalChunk(
  doclingChunk: DoclingChunk,
  matchResult: MatchResult
): FinalChunk {
  return {
    chunk_index: doclingChunk.index,
    content: doclingChunk.content,

    // Page metadata (PDF only)
    page_start: doclingChunk.meta.page_start ?? null,
    page_end: doclingChunk.meta.page_end ?? null,

    // Heading metadata (both PDF and EPUB)
    heading_path: doclingChunk.meta.heading_path ?? null,
    heading_level: doclingChunk.meta.heading_level ?? null,

    // Section marker (EPUB only)
    section_marker: doclingChunk.meta.section_marker ?? null,

    // Position metadata
    bboxes: doclingChunk.meta.bboxes ?? null,
    position_confidence: matchResult.confidence,
    position_method: matchResult.method
  }
}
```

**Integration Point**:
```diff
// In remapChunks() function, after successful match:
- const finalChunk = {
-   chunk_index: doclingChunk.index,
-   content: doclingChunk.content,
-   page_start: doclingChunk.meta.page_start ?? null,
-   page_end: doclingChunk.meta.page_end ?? null,
-   // ...
- }
+ const finalChunk = buildFinalChunk(doclingChunk, matchResult)
```

#### Acceptance Criteria

```gherkin
Scenario 1: Metadata extracted for PDFs
  Given a PDF with heading hierarchy
  When bulletproof matching runs
  Then FinalChunk contains heading_path
  And FinalChunk contains page_start/page_end
  And heading_level is populated

Scenario 2: Metadata extracted for EPUBs
  Given an EPUB with sections
  When bulletproof matching runs
  Then FinalChunk contains heading_path
  And FinalChunk contains section_marker
  And page_start is null (EPUBs don't have pages)

Scenario 3: Missing metadata handled gracefully
  Given a chunk without heading information
  When bulletproof matching runs
  Then FinalChunk is created successfully
  And heading fields are null
  And no errors occur

Scenario 4: Metadata preserved through all match layers
  Given chunks matched by any layer (fuzzy, embeddings, LLM, anchor)
  When FinalChunk is created
  Then metadata is always copied
  And metadata never lost
```

#### Checklist

- [ ] buildFinalChunk() helper function created
- [ ] Metadata extracted from DoclingChunk.meta
- [ ] heading_path mapped correctly
- [ ] heading_level mapped correctly
- [ ] section_marker mapped correctly
- [ ] Nullish coalescing handles missing metadata
- [ ] Function called in all match paths
- [ ] TypeScript compiles without errors
- [ ] Unit tests added for metadata extraction

#### Validation Commands

```bash
cd worker

# Run bulletproof matcher tests
npm run test:bulletproof-matcher

# Test with real document
npx tsx lib/local/__tests__/test-metadata-extraction.ts <document_id>

# Verify metadata in output
npx tsx -e "
const { remapChunks } = require('./lib/local/bulletproof-matcher.js');
const result = await remapChunks([/* mock docling chunks */], /* mock cleaned chunks */);
console.log('Metadata present:', result[0].heading_path !== null);
"
```

---

### T-013: Update Chunk Saving Logic in Processors

**Task ID**: T-013
**Priority**: High
**Estimated Effort**: 20 minutes

#### Task Purpose

**As a** document processor
**I need** to save Docling metadata to the database
**So that** chunks have persistent structural context for queries and embeddings

#### Dependencies

- **Prerequisite Tasks**: T-011, T-012 (Metadata extraction working)
- **Integration Points**: Supabase database, chunks table

#### Implementation Details

**Files to Modify**:
```
├── worker/processors/pdf-processor.ts (Lines 250-280)
└── worker/processors/epub-processor.ts (Similar changes)
```

**Key Implementation Steps**:
1. Locate saveChunksToDatabase() function
2. Add metadata fields to chunk insert objects
3. Map heading_path, heading_level, section_marker
4. Ensure batch insert includes new fields
5. Test with real PDF and EPUB

**Code Change**:
```diff
// Line 250-280 (in saveChunksToDatabase function)

const chunkInserts = finalChunks.map((chunk, idx) => ({
  document_id: this.job.document_id,
  content: chunk.content,
  chunk_index: idx,

  // Position metadata
  page_start: chunk.page_start,
  page_end: chunk.page_end,
+
+ // Heading metadata
+ heading_path: chunk.heading_path,
+ heading_level: chunk.heading_level,
+ section_marker: chunk.section_marker,

  // Bounding boxes
  bboxes: chunk.bboxes,

  // Confidence tracking
  position_confidence: chunk.position_confidence,
  position_method: chunk.position_method,
  position_validated: false
}))

const { error } = await this.supabase
  .from('chunks')
  .insert(chunkInserts)

if (error) {
  throw new Error(`Failed to save chunks: ${error.message}`)
}
```

#### Acceptance Criteria

```gherkin
Scenario 1: Metadata saved to database for PDFs
  Given a processed PDF with heading metadata
  When chunks are saved to database
  Then database rows contain heading_path
  And database rows contain heading_level
  And database rows contain page_start/page_end

Scenario 2: Metadata saved for EPUBs
  Given a processed EPUB
  When chunks are saved
  Then database rows contain section_marker
  And heading_path is populated
  And page fields are null

Scenario 3: Null metadata handled correctly
  Given chunks without heading information
  When saving to database
  Then insert succeeds
  And metadata columns are NULL
  And no database errors

Scenario 4: Batch insert performance maintained
  Given 500 chunks to save
  When batch insert executes
  Then insert completes in <2 seconds
  And all metadata fields saved
```

#### Checklist

- [ ] Metadata fields added to insert objects
- [ ] PDF processor saves heading metadata
- [ ] EPUB processor saves section_marker
- [ ] Null values handled correctly
- [ ] Batch insert works with new fields
- [ ] Database insert succeeds
- [ ] TypeScript compiles
- [ ] Integration test passes

#### Validation Commands

```bash
cd worker

# Test PDF processing with metadata
npm run test:pdf-processor

# Test EPUB processing with metadata
npm run test:epub-processor

# Verify database inserts
npx supabase db execute "
  SELECT id, heading_path, heading_level, section_marker
  FROM chunks
  WHERE document_id = (SELECT id FROM documents LIMIT 1)
  LIMIT 5
"

# Check for NULL handling
npx supabase db execute "
  SELECT COUNT(*) as with_metadata,
         SUM(CASE WHEN heading_path IS NULL THEN 1 ELSE 0 END) as without_metadata
  FROM chunks
"
```

---

### Phase 4 Success Criteria

- [ ] All 3 tasks completed (T-011 through T-013)
- [ ] FinalChunk type includes metadata fields
- [ ] Bulletproof matcher extracts metadata
- [ ] Processors save metadata to database
- [ ] PDF chunks have heading_path and page numbers
- [ ] EPUB chunks have section_marker
- [ ] All tests pass
- [ ] Database queries work with metadata

---

## Phase 5: Metadata-Enhanced Embeddings

**Duration**: 1.5 hours
**Priority**: High
**Dependencies**: Phase 4 complete (metadata in database)

### Overview

Enhance embedding generation by prepending structural metadata context to chunk content. This improves retrieval quality without modifying stored chunk content.

---

### T-014: Create Metadata Context Builder Module

**Task ID**: T-014
**Priority**: High
**Estimated Effort**: 30 minutes

#### Task Purpose

**As an** embeddings generation system
**I need** to create enhanced text from chunk content + metadata
**So that** embeddings capture both content and structural context

#### Dependencies

- **Prerequisite Tasks**: Phase 4 complete
- **Integration Points**: Embeddings generation, chunks table

#### Implementation Details

**Files to Create**:
```
└── worker/lib/embeddings/metadata-context.ts (NEW)
```

**Key Functions**:
1. `buildMetadataContext()` - Create context string from metadata
2. `createEnhancedEmbeddingText()` - Prepend context to chunk content
3. `validateEnhancedText()` - Ensure token limits not exceeded

**Implementation**:
```typescript
/**
 * Build context strings from Docling structural metadata.
 *
 * Used to enhance embeddings with document structure information
 * WITHOUT modifying the stored chunk content.
 *
 * Research backing:
 * - Metadata context improves retrieval by 15-25%
 * - More efficient than chunk overlap (no token duplication)
 * - Preserves citation information
 */

export interface ChunkWithMetadata {
  content: string
  heading_path?: string[] | null
  page_start?: number | null
  page_end?: number | null
  section_marker?: string | null
}

/**
 * Build context string from structural metadata.
 *
 * Examples:
 * - PDF: "Chapter 3 > Results > Discussion | Page 42"
 * - EPUB: "Part II > Chapter 5 > The Awakening"
 */
export function buildMetadataContext(chunk: ChunkWithMetadata): string {
  const parts: string[] = []

  // Add heading hierarchy (most important)
  if (chunk.heading_path && chunk.heading_path.length > 0) {
    parts.push(chunk.heading_path.join(' > '))
  }

  // Add page context (for PDFs, citation support)
  if (chunk.page_start !== null && chunk.page_start !== undefined) {
    if (chunk.page_end && chunk.page_end !== chunk.page_start) {
      parts.push(`Pages ${chunk.page_start}-${chunk.page_end}`)
    } else {
      parts.push(`Page ${chunk.page_start}`)
    }
  }

  // Add section marker (for EPUBs)
  if (chunk.section_marker && !chunk.page_start) {
    parts.push(chunk.section_marker.replace(/_/g, ' '))
  }

  return parts.join(' | ')
}

/**
 * Create enhanced text for embedding.
 *
 * Prepends metadata context to chunk content.
 * The stored content remains unchanged - this is ONLY for embeddings.
 */
export function createEnhancedEmbeddingText(chunk: ChunkWithMetadata): string {
  const context = buildMetadataContext(chunk)

  if (!context) {
    return chunk.content
  }

  return `${context}\n\n${chunk.content}`
}

/**
 * Validate that enhancement doesn't exceed token limits.
 */
export function validateEnhancedText(
  originalText: string,
  enhancedText: string,
  maxTokens: number = 1024
): { valid: boolean; estimatedTokens: number; warning?: string } {
  // Rough token estimate: 1 token ≈ 4 characters
  const estimatedTokens = Math.ceil(enhancedText.length / 4)

  if (estimatedTokens > maxTokens) {
    return {
      valid: false,
      estimatedTokens,
      warning: `Enhanced text (~${estimatedTokens} tokens) exceeds limit (${maxTokens})`
    }
  }

  // Context should be <10% of total (sanity check)
  const contextRatio = (enhancedText.length - originalText.length) / enhancedText.length
  if (contextRatio > 0.1) {
    return {
      valid: true,
      estimatedTokens,
      warning: `Context is ${(contextRatio * 100).toFixed(1)}% of total (expected <10%)`
    }
  }

  return { valid: true, estimatedTokens }
}
```

#### Acceptance Criteria

```gherkin
Scenario 1: Metadata context built for PDFs
  Given a chunk with heading_path and page_start
  When buildMetadataContext() is called
  Then context string includes heading hierarchy
  And context includes page number
  And format is "Chapter > Section | Page X"

Scenario 2: Metadata context built for EPUBs
  Given a chunk with heading_path and section_marker
  When buildMetadataContext() is called
  Then context includes headings
  And context includes section marker
  And page number is absent

Scenario 3: Enhanced text prepends context
  Given chunk content "This is the content"
  And metadata context "Chapter 1 > Intro | Page 5"
  When createEnhancedEmbeddingText() is called
  Then result is "Chapter 1 > Intro | Page 5\n\nThis is the content"
  And original content preserved

Scenario 4: Missing metadata returns original text
  Given a chunk with no metadata
  When createEnhancedEmbeddingText() is called
  Then result equals original content
  And no context prepended

Scenario 5: Validation catches token overflow
  Given enhanced text with 1100 estimated tokens
  When validateEnhancedText() called with maxTokens=1024
  Then valid is false
  And warning message provided

Scenario 6: Validation passes for normal chunks
  Given enhanced text with 800 tokens and 5% context
  When validateEnhancedText() is called
  Then valid is true
  And no warnings
```

#### Checklist

- [ ] ChunkWithMetadata interface defined
- [ ] buildMetadataContext() handles PDFs correctly
- [ ] buildMetadataContext() handles EPUBs correctly
- [ ] buildMetadataContext() handles missing metadata
- [ ] createEnhancedEmbeddingText() prepends context
- [ ] createEnhancedEmbeddingText() preserves original when no metadata
- [ ] validateEnhancedText() checks token limits
- [ ] validateEnhancedText() checks context ratio
- [ ] TypeScript compiles without errors
- [ ] Unit tests cover all scenarios

#### Validation Commands

```bash
cd worker

# Run unit tests
npm run test -- metadata-context.test.ts

# Test manually
npx tsx -e "
const { buildMetadataContext, createEnhancedEmbeddingText } = require('./lib/embeddings/metadata-context.js');
const chunk = {
  content: 'Test content',
  heading_path: ['Chapter 1', 'Introduction'],
  page_start: 5
};
console.log(buildMetadataContext(chunk));
console.log(createEnhancedEmbeddingText(chunk));
"
```

---

### T-015: Update Embeddings Generation to Use Metadata

**Task ID**: T-015
**Priority**: High
**Estimated Effort**: 45 minutes

#### Task Purpose

**As an** embeddings generation system
**I need** to use enhanced text with metadata for embedding creation
**So that** embeddings capture both content and document structure

#### Dependencies

- **Prerequisite Tasks**: T-014 (Metadata context builder)
- **Integration Points**: worker/lib/local/embeddings-local.ts

#### Implementation Details

**Files to Modify**:
```
└── worker/lib/local/embeddings-local.ts (Lines 180-220)
```

**Key Implementation Steps**:
1. Import metadata context functions
2. Update generateEmbeddingsForChunks() signature to accept metadata
3. Create enhanced text for each chunk
4. Validate enhanced text
5. Fall back to original text if validation fails
6. Log enhancement statistics

**Code Change**:
```diff
// Add import
+ import { createEnhancedEmbeddingText, validateEnhancedText } from '../embeddings/metadata-context.js'

// Line 180-220 (in generateEmbeddingsForChunks function)

export async function generateEmbeddingsForChunks(
  chunks: Array<{
    id: string
    content: string
+   heading_path?: string[] | null
+   page_start?: number | null
+   section_marker?: string | null
  }>
): Promise<Map<string, number[]>> {
  console.log(`[Embeddings] Generating for ${chunks.length} chunks...`)

  const embeddings = new Map<string, number[]>()
+ let enhancedCount = 0
+ let fallbackCount = 0

  for (const chunk of chunks) {
-   // Generate embedding from chunk content
-   const embedding = await generateEmbedding(chunk.content)
+   // Enhance with metadata context
+   const enhancedText = createEnhancedEmbeddingText({
+     content: chunk.content,
+     heading_path: chunk.heading_path,
+     page_start: chunk.page_start,
+     section_marker: chunk.section_marker
+   })
+
+   // Validate enhancement
+   const validation = validateEnhancedText(chunk.content, enhancedText)
+   if (!validation.valid) {
+     console.warn(`[Embeddings] ${validation.warning} - using original text`)
+     fallbackCount++
+     const embedding = await generateEmbedding(chunk.content)
+     embeddings.set(chunk.id, embedding)
+     continue
+   }
+
+   if (enhancedText !== chunk.content) {
+     enhancedCount++
+   }
+
+   // Generate embedding from enhanced text
+   const embedding = await generateEmbedding(enhancedText)
    embeddings.set(chunk.id, embedding)
  }

+ console.log(`[Embeddings] Enhanced: ${enhancedCount}/${chunks.length} (${((enhancedCount/chunks.length)*100).toFixed(1)}%)`)
+ if (fallbackCount > 0) {
+   console.warn(`[Embeddings] Fallback: ${fallbackCount} chunks exceeded token limits`)
+ }

  return embeddings
}
```

#### Acceptance Criteria

```gherkin
Scenario 1: Chunks with metadata get enhanced embeddings
  Given 100 chunks with heading_path metadata
  When generateEmbeddingsForChunks() is called
  Then enhanced text is created for all chunks
  And embeddings use enhanced text
  And log shows "Enhanced: 100/100 (100%)"

Scenario 2: Chunks without metadata use original text
  Given 50 chunks without metadata
  When generateEmbeddingsForChunks() is called
  Then embeddings use original content
  And log shows "Enhanced: 0/50 (0%)"

Scenario 3: Token overflow triggers fallback
  Given a chunk where enhancement exceeds 1024 tokens
  When generateEmbeddingsForChunks() is called
  Then validation fails for that chunk
  And original text is used
  And warning logged
  And other chunks still enhanced

Scenario 4: Mixed metadata coverage handled
  Given 100 chunks, 70 with metadata, 30 without
  When generateEmbeddingsForChunks() is called
  Then 70 chunks enhanced
  And 30 chunks use original text
  And log shows "Enhanced: 70/100 (70%)"

Scenario 5: Enhancement statistics logged
  Given any batch of chunks
  When embeddings generation completes
  Then console shows enhancement percentage
  And console shows fallback count if any
```

#### Checklist

- [ ] Import statements added
- [ ] Function signature updated with metadata fields
- [ ] Enhanced text created for each chunk
- [ ] Validation performed before embedding
- [ ] Fallback to original text on validation failure
- [ ] Enhancement statistics tracked
- [ ] Statistics logged at end
- [ ] TypeScript compiles
- [ ] Integration tests pass

#### Validation Commands

```bash
cd worker

# Run embeddings tests
npm run test -- embeddings-local.test.ts

# Test with real chunks
npx tsx lib/local/__tests__/test-enhanced-embeddings.ts <document_id>

# Verify enhancement percentage
# (Should show ~70-80% enhanced for typical books with headings)
```

---

### T-016: Update Processors to Pass Metadata to Embeddings

**Task ID**: T-016
**Priority**: High
**Estimated Effort**: 15 minutes

#### Task Purpose

**As a** document processor
**I need** to pass chunk metadata to the embeddings generation function
**So that** embeddings can be enhanced with structural context

#### Dependencies

- **Prerequisite Tasks**: T-015 (Embeddings function updated)
- **Integration Points**: PDF processor, EPUB processor

#### Implementation Details

**Files to Modify**:
```
├── worker/processors/pdf-processor.ts (Lines 320-340)
└── worker/processors/epub-processor.ts (Similar changes)
```

**Key Implementation Steps**:
1. Locate Stage 9 (embeddings generation)
2. Add metadata fields to chunksForEmbedding array
3. Map heading_path, page_start, section_marker from finalChunks
4. Test with real PDF and EPUB

**Code Change**:
```diff
// Line 320-340 (in Stage 9: Generate embeddings)

console.log('[PDFProcessor] LOCAL MODE: Generating embeddings with Transformers.js')

const chunksForEmbedding = finalChunks.map(chunk => ({
  id: chunk.chunk_index.toString(),
  content: chunk.content,
+ heading_path: chunk.heading_path,
+ page_start: chunk.page_start,
+ section_marker: chunk.section_marker
}))

const embeddingsMap = await generateEmbeddingsForChunks(chunksForEmbedding)
```

#### Acceptance Criteria

```gherkin
Scenario 1: PDF processor passes metadata
  Given a PDF with heading metadata
  When Stage 9 embeddings generation runs
  Then chunksForEmbedding includes heading_path
  And chunksForEmbedding includes page_start
  And embeddings are enhanced

Scenario 2: EPUB processor passes metadata
  Given an EPUB with section markers
  When embeddings generation runs
  Then chunksForEmbedding includes section_marker
  And chunksForEmbedding includes heading_path
  And embeddings are enhanced

Scenario 3: Enhancement percentage logged
  Given any document processing
  When embeddings complete
  Then console shows enhancement statistics
  And statistics match metadata coverage
```

#### Checklist

- [ ] PDF processor passes metadata fields
- [ ] EPUB processor passes metadata fields
- [ ] Metadata mapped from finalChunks correctly
- [ ] TypeScript compiles
- [ ] PDF processing test shows enhancement
- [ ] EPUB processing test shows enhancement
- [ ] Logs show enhancement percentage

#### Validation Commands

```bash
cd worker

# Process PDF and check logs
npm run dev:worker
# Upload PDF, check console for enhancement percentage

# Process EPUB and check logs
# Upload EPUB, check console for enhancement percentage

# Integration test
npm run test:integration

# Verify embeddings enhanced
npx supabase db execute "
  SELECT COUNT(*) as total
  FROM chunks
  WHERE document_id = (SELECT id FROM documents LIMIT 1)
    AND heading_path IS NOT NULL
"
```

---

### Phase 5 Success Criteria

- [ ] All 3 tasks completed (T-014 through T-016)
- [ ] Metadata context builder created
- [ ] Embeddings generation uses enhanced text
- [ ] Processors pass metadata to embeddings
- [ ] Enhancement percentage logged (target: >70%)
- [ ] Original chunk content unchanged
- [ ] Validation prevents token overflow
- [ ] All tests pass

---

## Phase 6: Validation & Testing

**Duration**: 2 hours
**Priority**: Critical
**Dependencies**: Phases 1-5 complete

### Overview

Comprehensive validation of all changes through statistics logging, A/B testing, integration tests, and real-world validation. Ensures quality improvements and performance gains meet targets.

---

### T-017: Create Chunk Statistics Module

**Task ID**: T-017
**Priority**: High
**Estimated Effort**: 30 minutes

#### Task Purpose

**As a** quality assurance system
**I need** to track and report chunk quality statistics
**So that** I can validate chunking improvements and detect regressions

#### Dependencies

- **Prerequisite Tasks**: Phase 1-4 complete
- **Deliverable**: Statistics module and logging

#### Implementation Details

**Files to Create**:
```
└── worker/lib/chunking/chunk-statistics.ts (NEW)
```

**Key Functions**:
1. `calculateChunkStatistics()` - Analyze chunk quality
2. `logChunkStatistics()` - Pretty-print statistics
3. Track: token counts, metadata coverage, semantic coherence

**Implementation**:
```typescript
/**
 * Chunk quality and size statistics.
 * Used to validate chunking improvements.
 */

export interface ChunkStatistics {
  total: number
  avgTokens: number
  minTokens: number
  maxTokens: number
  oversized: number            // Chunks > max_tokens
  undersized: number           // Chunks < 100 tokens
  withMetadata: number         // Chunks with heading_path
  metadataEnhanced: number     // Chunks with enhanced embeddings
  semanticCoherence: number    // % ending on sentence boundary
}

export function calculateChunkStatistics(
  chunks: Array<{
    content: string
    heading_path?: string[] | null
  }>,
  maxTokens: number = 768
): ChunkStatistics {
  const stats: ChunkStatistics = {
    total: chunks.length,
    avgTokens: 0,
    minTokens: Infinity,
    maxTokens: 0,
    oversized: 0,
    undersized: 0,
    withMetadata: 0,
    metadataEnhanced: 0,
    semanticCoherence: 0
  }

  let totalTokens = 0
  let endsOnSentence = 0

  for (const chunk of chunks) {
    // Rough token count (1 token ≈ 4 chars)
    const tokens = Math.ceil(chunk.content.length / 4)

    totalTokens += tokens
    stats.minTokens = Math.min(stats.minTokens, tokens)
    stats.maxTokens = Math.max(stats.maxTokens, tokens)

    if (tokens > maxTokens) stats.oversized++
    if (tokens < 100) stats.undersized++

    if (chunk.heading_path && chunk.heading_path.length > 0) {
      stats.withMetadata++
    }

    // Check sentence boundary
    if (chunk.content.trim().match(/[.!?]$/)) {
      endsOnSentence++
    }
  }

  stats.avgTokens = Math.round(totalTokens / chunks.length)
  stats.semanticCoherence = endsOnSentence / chunks.length

  return stats
}

export function logChunkStatistics(stats: ChunkStatistics, label: string = 'Chunks'): void {
  console.log(`\n[${label} Statistics]`)
  console.log(`  Total chunks: ${stats.total}`)
  console.log(`  Avg tokens: ${stats.avgTokens}`)
  console.log(`  Min tokens: ${stats.minTokens}`)
  console.log(`  Max tokens: ${stats.maxTokens}`)
  console.log(`  Oversized: ${stats.oversized} (${((stats.oversized/stats.total)*100).toFixed(1)}%)`)
  console.log(`  With metadata: ${stats.withMetadata} (${((stats.withMetadata/stats.total)*100).toFixed(1)}%)`)
  console.log(`  Semantic coherence: ${(stats.semanticCoherence * 100).toFixed(1)}%`)
}
```

#### Acceptance Criteria

```gherkin
Scenario 1: Statistics calculated correctly
  Given 100 chunks with known properties
  When calculateChunkStatistics() is called
  Then total is 100
  And avgTokens is within expected range
  And oversized count is accurate

Scenario 2: Metadata coverage tracked
  Given 70 chunks with heading_path, 30 without
  When statistics are calculated
  Then withMetadata is 70
  And percentage is 70%

Scenario 3: Semantic coherence measured
  Given 85 chunks ending with sentence punctuation
  When statistics are calculated
  Then semanticCoherence is 0.85 (85%)

Scenario 4: Statistics logged in readable format
  Given any chunk statistics
  When logChunkStatistics() is called
  Then output is formatted table
  And percentages are shown
  And labels are clear
```

#### Checklist

- [ ] ChunkStatistics interface defined
- [ ] calculateChunkStatistics() implemented
- [ ] Token counting logic works
- [ ] Metadata coverage tracked
- [ ] Semantic coherence measured
- [ ] logChunkStatistics() formats output
- [ ] TypeScript compiles
- [ ] Unit tests pass

#### Validation Commands

```bash
cd worker

# Run unit tests
npm run test -- chunk-statistics.test.ts

# Test manually
npx tsx -e "
const { calculateChunkStatistics, logChunkStatistics } = require('./lib/chunking/chunk-statistics.js');
const mockChunks = [
  { content: 'Test content 1.', heading_path: ['Chapter 1'] },
  { content: 'Test content 2.', heading_path: null }
];
const stats = calculateChunkStatistics(mockChunks, 768);
logChunkStatistics(stats);
"
```

---

### T-018: Add Statistics Logging to Processors

**Task ID**: T-018
**Priority**: Medium
**Estimated Effort**: 15 minutes

#### Task Purpose

**As a** document processing system
**I need** to log chunk statistics after processing
**So that** quality metrics are visible and regressions can be detected

#### Dependencies

- **Prerequisite Tasks**: T-017 (Statistics module)
- **Integration Points**: PDF processor, EPUB processor

#### Implementation Details

**Files to Modify**:
```
├── worker/processors/pdf-processor.ts (After Stage 7)
└── worker/processors/epub-processor.ts (After Stage 7)
```

**Key Implementation Steps**:
1. Import statistics functions
2. Calculate statistics after bulletproof matching
3. Log statistics before continuing to embeddings
4. Add to both PDF and EPUB processors

**Code Change**:
```diff
// After Stage 7 (bulletproof matching)
+ import { calculateChunkStatistics, logChunkStatistics } from '../lib/chunking/chunk-statistics.js'

console.log(`[PDFProcessor] ✅ Matched ${finalChunks.length} chunks`)

+ // Log statistics
+ const stats = calculateChunkStatistics(finalChunks, 768)
+ logChunkStatistics(stats, 'PDF Chunks')
```

#### Acceptance Criteria

```gherkin
Scenario 1: Statistics logged after processing
  Given a PDF processed through all stages
  When bulletproof matching completes
  Then statistics are calculated
  And statistics are logged to console
  And processing continues normally

Scenario 2: Statistics show expected values
  Given a 500-page book processed with 768 tokens
  When statistics are logged
  Then avgTokens is ~600-850
  And metadata coverage is >70%
  And semantic coherence is >85%

Scenario 3: Statistics help detect issues
  Given abnormally small avgTokens (<400)
  When statistics are logged
  Then developer sees problem in logs
  And can investigate chunking issue
```

#### Checklist

- [ ] Import statements added to processors
- [ ] Statistics calculated after matching
- [ ] Statistics logged before embeddings
- [ ] Both PDF and EPUB processors updated
- [ ] TypeScript compiles
- [ ] Logs appear during processing
- [ ] Statistics values look reasonable

#### Validation Commands

```bash
cd worker

# Process PDF and check logs
npm run dev:worker
# Upload PDF, check console for statistics

# Process EPUB and check logs
# Upload EPUB, check console for statistics

# Verify reasonable values
# avgTokens: 600-850 ✓
# withMetadata: >70% ✓
# semanticCoherence: >85% ✓
```

---

### T-019: Create A/B Testing Script

**Task ID**: T-019
**Priority**: High
**Estimated Effort**: 1 hour

#### Task Purpose

**As a** quality assurance engineer
**I need** to compare 512-token vs 768-token chunking side-by-side
**So that** I can validate the improvement claims from research

#### Dependencies

- **Prerequisite Tasks**: T-017 (Statistics module)
- **Deliverable**: Comparison script

#### Implementation Details

**Files to Create**:
```
└── worker/scripts/test-chunk-size-comparison.ts (NEW)
```

**Key Features**:
1. Process same PDF with both chunk sizes
2. Measure: chunk count, avgTokens, processing time, semantic coherence
3. Generate comparison table
4. Provide recommendation based on results

**Implementation** (see PRP lines 1357-1451 for full code)

#### Acceptance Criteria

```gherkin
Scenario 1: Script compares both configurations
  Given a test PDF
  When script runs
  Then PDF processed twice (512 and 768 tokens)
  And results compared side-by-side
  And comparison table printed

Scenario 2: 768 tokens shows improvements
  Given a 500-page book
  When A/B test runs
  Then 768-token version has:
    - ~30% fewer chunks
    - ~50% higher avgTokens
    - <15% processing time increase
    - >5% semantic coherence improvement

Scenario 3: Recommendations provided
  Given A/B test results
  When script completes
  Then recommendation section shows:
    - Quality improvements
    - Performance impact
    - Clear recommendation
```

#### Checklist

- [ ] Script created with TypeScript
- [ ] Both chunk sizes tested on same PDF
- [ ] Metrics compared: chunks, tokens, time, coherence
- [ ] Comparison table generated
- [ ] Recommendations provided
- [ ] Script executable with tsx
- [ ] Documentation explains usage

#### Validation Commands

```bash
cd worker

# Run A/B test
npx tsx scripts/test-chunk-size-comparison.ts /path/to/test.pdf

# Expected output:
# === COMPARISON ===
# Metric                 | 512 tokens | 768 tokens | Difference
# Chunk count            | 800        | 550        | -31.3%
# Avg tokens             | 480        | 720        | +50.0%
# Processing time (s)    | 120        | 130        | +8.3%
# Semantic coherence (%) | 87.2       | 92.5       | +5.3pp
#
# === RECOMMENDATION ===
# ✅ 768 tokens shows significantly better semantic coherence
# ✅ 768 tokens has acceptable processing time (<15% increase)
# ✅ 768 tokens significantly reduces chunk count
```

---

### T-020: Create Integration Tests

**Task ID**: T-020
**Priority**: High
**Estimated Effort**: 15 minutes

#### Task Purpose

**As a** quality assurance system
**I need** automated integration tests for Docling optimizations
**So that** regressions are caught in CI/CD pipeline

#### Dependencies

- **Prerequisite Tasks**: Phases 1-5 complete
- **Integration Points**: Jest test suite

#### Implementation Details

**Files to Create**:
```
└── worker/tests/integration/docling-optimization.test.ts (NEW)
```

**Test Cases**:
1. Chunks average 768 tokens
2. Chunks have metadata
3. Performance optimizations reduce time
4. Metadata-enhanced embeddings work

**Implementation** (see PRP lines 1463-1529 for full code)

#### Acceptance Criteria

```gherkin
Scenario 1: Test suite runs in CI
  Given integration test file
  When npm test runs
  Then all tests execute
  And pass/fail status clear

Scenario 2: Tests validate 768-token chunks
  Given test PDF processed
  When chunk statistics checked
  Then avgTokens is 600-850
  And test passes

Scenario 3: Tests validate metadata coverage
  Given processed chunks
  When metadata checked
  Then >70% have heading_path
  And test passes

Scenario 4: Tests validate performance gain
  Given baseline vs optimized processing
  When times compared
  Then optimized is >20% faster
  And test passes
```

#### Checklist

- [ ] Test file created with Jest
- [ ] Test 1: 768-token chunk size
- [ ] Test 2: Metadata coverage
- [ ] Test 3: Performance optimization
- [ ] Test 4: Metadata-enhanced embeddings
- [ ] All tests pass locally
- [ ] Tests run in CI pipeline
- [ ] Test fixtures included

#### Validation Commands

```bash
cd worker

# Run integration tests
npm run test:integration

# Run specific test file
npm test -- docling-optimization.test.ts

# Check coverage
npm run test:coverage
```

---

### Phase 6 Success Criteria

- [ ] All 4 tasks completed (T-017 through T-020)
- [ ] Statistics module created and used
- [ ] A/B testing script validates improvements
- [ ] Integration tests pass
- [ ] 768 tokens shows quality improvement
- [ ] Performance optimization saves 25-30% time
- [ ] Metadata coverage >70%
- [ ] All tests pass

---

## Success Metrics

### Performance Targets

**Processing Time** (500-page book):
- Baseline: 60-80 minutes
- Target: 45-60 minutes (-25%)
- Measurement: Real book processing

**Memory Usage** (with batching):
- Baseline: 12-18 GB
- Target: 8-12 GB (-40%)
- Measurement: System monitor during processing

**Chunk Count** (500-page book):
- Baseline: ~800 chunks @ 512 tokens
- Target: ~550 chunks @ 768 tokens (-30%)
- Measurement: Chunk statistics

### Quality Targets

**Semantic Coherence**:
- Baseline: 85-90%
- Target: >90%
- Measurement: % chunks ending on sentence boundary

**Metadata Coverage**:
- Target: >80% chunks have heading_path
- Measurement: Chunk statistics

**Embedding Enhancement**:
- Target: >70% chunks enhanced with metadata
- Measurement: Embeddings generation logs

### Cost Targets

- **Cost**: $0 (no change, still fully local)
- **API calls**: 0 (no change)

---

## Rollout Strategy

### Phase 1: Development (Day 1 - 6 hours)

**Morning** (3 hours):
- T-001 to T-004: Configuration fixes (30 min)
- T-005 to T-008: Pipeline configuration (45 min)
- T-009 to T-010: Database migration (15 min)
- T-011 to T-013: Metadata copying (1 hour)

**Afternoon** (3 hours):
- T-014 to T-016: Metadata-enhanced embeddings (1.5 hours)
- T-017 to T-018: Statistics logging (45 min)
- T-019: A/B testing script (45 min)

### Phase 2: Validation (Day 2 - 4 hours)

**Morning** (2 hours):
- T-020: Integration tests (15 min)
- Run A/B tests on 3 different document types
- Measure processing time and memory
- Validate quality improvements

**Afternoon** (2 hours):
- Real-world testing with 3-5 books
- Monitor processing and check logs
- Verify metadata coverage
- Test semantic search quality

### Phase 3: Bug Fixes (Day 3 - 2 hours)

- Address any issues found in validation
- Fine-tune configuration if needed
- Update documentation
- Final testing

### Phase 4: Deployment

- Merge to main branch
- Update CLAUDE.md with new capabilities
- Monitor first few documents processed
- Collect user feedback

---

## Risk Mitigation

### Risk 1: 768 Tokens Causes Issues

**Probability**: Low
**Impact**: Medium

**Mitigation**:
- Research shows 768 optimal for this model
- A/B testing validates before rollout
- Easy rollback to 512 if needed

**Rollback Plan**:
1. Change `max_tokens` to 512 in chunker-config.ts
2. Reprocess affected documents
3. Verify quality restored

### Risk 2: Performance Optimization Breaks Features

**Probability**: Low
**Impact**: Low

**Mitigation**:
- Only disabling unused features
- Integration tests validate quality
- Configuration system allows re-enabling

**Rollback Plan**:
1. Set environment variables to re-enable features
2. No code changes needed
3. No reprocessing required

### Risk 3: Metadata Enhancement Causes Token Overflow

**Probability**: Low
**Impact**: Low

**Mitigation**:
- Validation function checks limits
- Automatic fallback to original text
- Metadata context is <10% of total

**Rollback Plan**:
1. Disable enhancement in embeddings generation
2. Embeddings still work without metadata
3. No reprocessing needed

### Risk 4: Migration Breaks Queries

**Probability**: Very Low
**Impact**: Low

**Mitigation**:
- Adding columns (not modifying)
- Backward compatible (NULLable)
- Existing queries unaffected

**Rollback Plan**:
1. Columns optional, can be ignored
2. No rollback needed

---

## Documentation Updates

After implementation, update:

1. **CLAUDE.md**:
   - Chunking strategy (768 tokens)
   - Metadata enhancement for embeddings
   - Performance optimizations

2. **Processing Pipeline Docs**:
   - Stage 2: Optimized Docling configuration
   - Stage 7: Metadata copying in bulletproof matcher
   - Stage 9: Metadata-enhanced embeddings

3. **Migration Guide**:
   - How to reprocess old documents
   - Expected improvements for new documents

---

## Conclusion

This task breakdown provides a comprehensive implementation plan for the Docling Optimization v1 PRP. All 20 tasks are clearly defined with:

- **Dependencies**: What must be completed first
- **Implementation Details**: Exact code changes and file locations
- **Acceptance Criteria**: Given-When-Then scenarios
- **Validation Commands**: How to verify each task

**Key Benefits**:
1. 30% faster processing (optimized pipeline)
2. 50% more context per chunk (512 → 768 tokens)
3. Better embeddings (metadata enhancement)
4. Richer metadata (citations and filtering)
5. 40% less memory (batching for large docs)

**Total Effort**: 6 hours over 2-3 days
**Risk Level**: Low (backward compatible, well-tested)
**Ready for Implementation**: ✅ Yes

---

**Next Steps**: Begin with Phase 1 (Configuration Fixes) and proceed sequentially through all phases.
