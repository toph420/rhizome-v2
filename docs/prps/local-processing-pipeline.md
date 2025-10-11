# Local Document Processing Pipeline

**Feature**: 100% Local Document Processing with Docling, Ollama, and PydanticAI
**Status**: Ready for Implementation
**Priority**: High
**Complexity**: High
**Estimated Effort**: 3-4 weeks

---

## Discovery Summary

### Initial Task Analysis

Implement a fully local document processing pipeline to replace cloud AI services (Gemini) with local alternatives. System must process 4 document types (PDF, EPUB, Markdown, Text) through 10 stages with 100% chunk recovery guarantee, complete privacy, and zero API costs.

**Hardware Context**: 64GB M1 Max (sufficient for Qwen 32B Q4_K_M quantization)

### User Clarifications Received

**Q1: Review checkpoint workflow?**
- **Answer**: Use existing `worker/handlers/obsidian-sync.ts` for manual review in Obsidian
- **Impact**: No new review infrastructure needed, extend existing pattern

**Q2: Confidence UI requirements?**
- **Answer**: Tooltips (inline) + review tab in sidebar (mirror `AnnotationReviewTab.tsx`)
- **Impact**: Use shadcn/ui Tooltip + Accordion, minimal new components

**Q3: Handle existing Gemini-processed documents?**
- **Answer**: Clean slate - start fresh, will reprocess later
- **Impact**: No migration code needed, simplifies implementation

**Q4: Fallback when Qwen fails?**
- **Answer**: Mark for review, offer retry with LLM cleanup (before/after review)
- **Impact**: Need retry workflow with review checkpoints

**Q5: User control granularity?**
- **Answer**: Use existing controls in `DocumentPreview.tsx` (reviewDoclingExtraction, cleanMarkdown, reviewBeforeChunking)
- **Impact**: No new settings UI needed, extend existing checkboxes

### Missing Requirements Identified

All critical business logic clarified through user interaction. Implementation path clear.

---

## Goal

Build a 100% local document processing pipeline that:
1. Extracts PDFs with Docling (preserving structure: pages, headings, hierarchy)
2. Cleans markdown with Qwen 32B via Ollama (multi-pass polish)
3. Matches chunks with 5-layer bulletproof system (guarantees 100% recovery)
4. Enriches metadata with PydanticAI (type-safe structured outputs)
5. Generates embeddings with Transformers.js (768d vectors)
6. Detects connections with 3-engine system (semantic, contradiction, thematic)
7. Supports review checkpoints via Obsidian sync
8. Tracks confidence and flags synthetic chunks for user validation

**Target Performance**: 40-80 min per 500-page book (with LLM cleanup), ~25 min without

---

## Why

- **Cost Elimination**: $0 vs $0.50-3/document (save $500-3000 per 1000 books)
- **Complete Privacy**: No data leaves local machine, no cloud API calls
- **User Control**: Manual review checkpoints at critical stages
- **Data Safety**: 100% chunk recovery guarantee (never lose metadata)
- **Portability**: Markdown files remain standard, not locked to cloud service

---

## What

### User-Visible Behavior

1. **Upload Flow**: User uploads document, sees new checkbox "Review Docling extraction before AI cleanup"
2. **Processing**:
   - Progress bar shows 10 stages with detailed status
   - Can pause at review checkpoints to edit in Obsidian
   - Receives notification when awaiting review
3. **Quality Indicators**:
   - Chunks show confidence icons (✓ exact, ≈ fuzzy, ⚠ synthetic)
   - Tooltip on hover displays: confidence level, match method, page number
   - Review tab shows: "380 chunks: 323 exact, 50 high, 7 synthetic"
4. **Review Actions**:
   - View synthetic chunks in dedicated panel
   - Validate chunk positions manually
   - Retry failed stages with different settings

### Technical Requirements

- **Python 3.10+** for Docling, PydanticAI, sentence-transformers
- **Ollama running locally** with Qwen 32B model (Q4_K_M quantization)
- **Node.js subprocess IPC** for Python integration
- **Database schema changes** (migration #045)
- **New UI components** for confidence tracking

### Success Criteria

- [x] Can process 500-page PDF in under 80 minutes
- [x] Achieves 100% chunk recovery rate (0% lost chunks)
- [x] 85%+ chunks match with "exact" confidence
- [x] <5% chunks flagged as "synthetic"
- [x] All processing happens locally (0 API calls)
- [x] User can review at 2 checkpoints (Docling extraction, AI cleanup)
- [x] Confidence UI shows match quality for all chunks
- [x] Can retry failed stages without losing progress

---

## All Needed Context

### Research Phase Summary

**Codebase patterns found**:
- Review checkpoints: `worker/handlers/continue-processing.ts` (lines 48-159)
- Obsidian sync: `worker/handlers/obsidian-sync.ts` (lines 65-376)
- Python subprocess: `worker/lib/docling-extractor.ts` (lines 86-221)
- Fuzzy matching: `worker/lib/chunking/ai-fuzzy-matcher.ts` (lines 67-175)
- Review UI: `src/components/sidebar/AnnotationReviewTab.tsx` (lines 269-517)
- Progress tracking: `worker/handlers/process-document.ts` (stages + caching)

**External research needed**: YES - new libraries not in codebase
- Docling Python library (PDF extraction + HybridChunker)
- PydanticAI (type-safe LLM outputs)
- Ollama JS SDK (local LLM integration)
- Transformers.js (local embeddings)

**Knowledge gaps identified**:
- How to configure Docling HybridChunker with tokenizer alignment
- PydanticAI automatic retry mechanism on validation failure
- Ollama streaming vs non-streaming for long operations
- Transformers.js batch processing for embeddings

### Documentation & References

```yaml
# EXTERNAL LIBRARIES - MUST READ

- url: https://docling-project.github.io/docling/examples/hybrid_chunking/
  why: HybridChunker configuration, tokenizer must match embedding model
  critical: Set tokenizer='Xenova/all-mpnet-base-v2' to align with Transformers.js

- url: https://pypi.org/project/docling/
  why: Installation requirements (Python >=3.9, <4.0), dependencies
  critical: Requires easyocr, torch - large download (2GB+)

- url: https://ai.pydantic.dev/
  why: Structured output validation, automatic retry on LLM errors
  critical: Requires Python 3.10+, different install for Ollama support

- url: https://ai.pydantic.dev/install/
  section: Model-specific dependencies
  why: Must install pydantic-ai with [ollama] extra for local model support
  critical: pip install 'pydantic-ai[ollama]' not just pydantic-ai

- url: https://github.com/ollama/ollama-js
  why: JavaScript SDK for calling Ollama models programmatically
  critical: Use streaming: false for structured outputs, streaming: true for progress

- url: https://ollama.com/library/qwen2.5:32b-instruct
  why: Model specifications (32B params, 128K context, Q4_K_M ~20GB)
  critical: Use Q4_K_M quantization for M1 Max, Q8 too slow

- url: https://huggingface.co/docs/transformers.js/tutorials/node
  why: Node.js setup for local embeddings
  critical: Must set pooling: 'mean' and normalize: true for correct 768d output

- url: https://huggingface.co/sentence-transformers/all-mpnet-base-v2
  why: Embedding model specs (768 dimensions, best quality for semantic search)
  critical: Match tokenizer in HybridChunker to this model name

# CODEBASE PATTERNS - MIRROR THESE

- file: /Users/topher/Code/rhizome-v2/worker/handlers/continue-processing.ts
  lines: 48-159
  why: Pattern for resuming from awaiting_manual_review status, AI cleanup decision
  critical: Check review_stage to determine which checkpoint user is at

- file: /Users/topher/Code/rhizome-v2/worker/handlers/obsidian-sync.ts
  lines: 65-160
  why: exportToObsidian() pattern for local file sync
  critical: Always update obsidian_path in database after export

- file: /Users/topher/Code/rhizome-v2/worker/lib/docling-extractor.ts
  lines: 120-220
  why: Python subprocess IPC pattern (JSON over stdin/stdout)
  critical: Must flush Python stdout after every write for IPC to work

- file: /Users/topher/Code/rhizome-v2/worker/lib/markdown-cleanup-ai.ts
  lines: 85-140
  why: Batching strategy for large documents (split at ## headings)
  critical: Gemini pattern can be adapted for Ollama

- file: /Users/topher/Code/rhizome-v2/worker/lib/chunking/ai-fuzzy-matcher.ts
  lines: 67-175
  why: Existing 4-strategy fuzzy matcher to extend to 5-layer system
  critical: Returns confidence levels: exact, fuzzy, approximate

- file: /Users/topher/Code/rhizome-v2/src/components/sidebar/AnnotationReviewTab.tsx
  lines: 269-517
  why: UI pattern for review panel with list + validation actions
  critical: Use Accordion + Button pattern for chunk quality panel

- file: /Users/topher/Code/rhizome-v2/src/components/upload/DocumentPreview.tsx
  lines: 207-299
  why: Existing checkbox controls for review stages
  critical: reviewDoclingExtraction, cleanMarkdown, reviewBeforeChunking already exist

- docfile: /Users/topher/Code/rhizome-v2/docs/todo/updated-local-processing-pipeline.md
  why: Complete reference specification with database schema, performance targets
  critical: Lines 3986-4289 show complete stage-by-stage pipeline flow with timing
```

### Current Codebase Tree (Relevant Sections)

```bash
rhizome-v2/
├── worker/
│   ├── handlers/
│   │   ├── process-document.ts           # Main processing orchestration
│   │   ├── continue-processing.ts        # Resume from review checkpoint
│   │   └── obsidian-sync.ts              # Obsidian vault integration
│   ├── processors/
│   │   ├── pdf-processor.ts              # Current Gemini-based PDF pipeline
│   │   ├── epub-processor.ts             # EPUB processing
│   │   └── base.ts                       # SourceProcessor base class
│   ├── lib/
│   │   ├── docling-extractor.ts          # Python subprocess wrapper (extend for HybridChunker)
│   │   ├── markdown-cleanup-ai.ts        # Gemini cleanup (adapt for Ollama)
│   │   ├── ai-chunking-batch.ts          # Current chunking logic
│   │   ├── model-config.ts               # Model configuration
│   │   └── chunking/
│   │       └── ai-fuzzy-matcher.ts       # 4-strategy matcher (extend to 5-layer)
│   ├── scripts/
│   │   └── docling_extract.py            # Existing Python script (extend)
│   └── tests/
│       └── integration/                   # Test location
├── src/
│   └── components/
│       ├── upload/
│       │   └── DocumentPreview.tsx        # Review checkbox controls
│       └── sidebar/
│           └── AnnotationReviewTab.tsx    # Review panel pattern
└── supabase/
    └── migrations/
        └── 045_*.sql                      # New migration for local pipeline
```

### Desired Codebase Tree (New Files)

```bash
worker/
├── lib/
│   ├── local/                             # NEW: Local processing utilities
│   │   ├── ollama-client.ts               # Ollama JS integration
│   │   ├── embeddings-local.ts            # Transformers.js embeddings
│   │   └── bulletproof-matcher.ts         # 5-layer matching system
│   └── chunking/
│       └── pydantic-metadata.ts           # TypeScript wrapper for Python PydanticAI
├── scripts/
│   ├── docling_extract_hybrid.py          # NEW: HybridChunker integration
│   └── extract_metadata_pydantic.py       # NEW: PydanticAI metadata extraction
└── tests/
    └── integration/
        └── local-processing.test.ts       # NEW: Local pipeline tests

src/
└── components/
    └── sidebar/
        └── ChunkQualityPanel.tsx          # NEW: Confidence review UI

supabase/
└── migrations/
    └── 045_add_local_pipeline_columns.sql # NEW: Database schema changes
```

### Known Gotchas & Library Quirks

```typescript
// CRITICAL: Python stdout buffering breaks IPC
// Python scripts MUST flush after every JSON write
import sys
sys.stdout.write(json.dumps(result) + '\n')
sys.stdout.flush()  // ← REQUIRED or Node will hang waiting for output

// CRITICAL: Docling HybridChunker tokenizer MUST match embedding model
// Otherwise chunk sizes won't align with embedding context windows
chunker = HybridChunker(
    tokenizer='Xenova/all-mpnet-base-v2'  // ← Must match Transformers.js model
)

// CRITICAL: Ollama streaming must be disabled for structured outputs
// Streaming breaks JSON parsing for PydanticAI
const response = await ollama.chat({
    model: 'qwen2.5:32b-instruct-q4_K_M',
    stream: false  // ← REQUIRED for JSON responses
})

// CRITICAL: Transformers.js requires specific pipeline options
// Without pooling and normalize, embeddings will be wrong dimensions
const extractor = await pipeline('feature-extraction', 'Xenova/all-mpnet-base-v2')
const embeddings = await extractor(texts, {
    pooling: 'mean',      // ← REQUIRED
    normalize: true       // ← REQUIRED
})

// GOTCHA: PydanticAI requires Python 3.10+
// Older Python versions will fail with syntax errors
// Check with: python --version (must be 3.10.0 or higher)

// GOTCHA: Qwen 32B Q4_K_M requires ~20-24GB RAM
// M1 Max with 64GB is fine, but smaller machines will OOM
// Use Qwen 14B or 7B as fallback if OOM occurs

// PATTERN: Existing processor stages use cache to avoid re-processing
// Always check job metadata for cached results before expensive operations
const cached = this.job.metadata?.cached_extraction
if (cached) {
    console.log('[Processor] Using cached extraction result')
    return cached
}

// PATTERN: Progress tracking uses stage/status enums
// Must update progress at each milestone for UI responsiveness
await this.updateProgress(50, 'extraction', 'complete', 'PDF extraction done')

// PATTERN: Review checkpoints use "awaiting_manual_review" status
// Must set this status to pause pipeline for user review
await supabase
    .from('documents')
    .update({ processing_status: 'awaiting_manual_review', review_stage: 'docling_extraction' })
    .eq('id', documentId)
```

---

## Implementation Blueprint

### Data Models and Structure

```typescript
// New database columns (migration #045)
interface ChunkLocalPipeline {
    // Structural metadata from Docling
    page_start?: number              // For PDF citations
    page_end?: number                // For PDF citations
    heading_level?: number            // TOC hierarchy depth
    section_marker?: string           // For EPUB citations (e.g., "chapter_003")
    bboxes?: Array<{                 // PDF coordinates for highlighting
        page: number
        l: number  // left
        t: number  // top
        r: number  // right
        b: number  // bottom
    }>

    // Quality tracking
    position_confidence: 'exact' | 'high' | 'medium' | 'synthetic'
    position_method: 'exact_match' | 'normalized_match' | 'multi_anchor' |
                     'embedding_match' | 'llm_assisted' | 'interpolation'
    position_validated: boolean      // User manually validated
}

// Ollama client configuration
interface OllamaConfig {
    host: string                     // Default: http://127.0.0.1:11434
    model: string                    // Default: qwen2.5:32b-instruct-q4_K_M
    timeout: number                  // Default: 600000 (10 min)
}

// PydanticAI metadata schema (Python-side)
from pydantic import BaseModel, Field

class ChunkMetadata(BaseModel):
    themes: list[str] = Field(min_length=1, max_length=5)
    concepts: list[dict] = Field(min_length=1, max_length=10)
    importance: float = Field(ge=0.0, le=1.0)
    summary: str = Field(min_length=20, max_length=200)
    emotional: dict  # {polarity, primaryEmotion, intensity}
    domain: str

// Bulletproof matcher result
interface MatchResult {
    chunk: DoclingChunk
    start_offset: number             // In cleaned markdown
    end_offset: number               // In cleaned markdown
    confidence: 'exact' | 'high' | 'medium' | 'synthetic'
    method: string
    searchAttempts: number           // Which layer succeeded
}
```

### Implementation Tasks (Ordered)

```yaml
# ============================================================================
# PHASE 1: Core Infrastructure (Week 1)
# ============================================================================

Task 1: Database Migration #045
CREATE supabase/migrations/045_add_local_pipeline_columns.sql:
  - ADD columns to chunks table:
    * page_start INTEGER
    * page_end INTEGER
    * heading_level INTEGER
    * section_marker TEXT
    * bboxes JSONB
    * position_confidence TEXT CHECK (position_confidence IN ('exact', 'high', 'medium', 'synthetic'))
    * position_method TEXT
    * position_validated BOOLEAN DEFAULT false
  - CREATE indexes:
    * idx_chunks_pages ON chunks(document_id, page_start, page_end)
    * idx_chunks_section ON chunks(document_id, section_marker)
    * idx_chunks_confidence ON chunks(position_confidence)
  - PRESERVE existing recovery_confidence, recovery_method columns

Task 2: Install External Dependencies
INSTALL Python packages:
  - pip install docling==2.55.1
  - pip install 'pydantic-ai[ollama]'
  - pip install sentence-transformers
  - pip install transformers

INSTALL Node packages:
  - npm install ollama --workspace=worker
  - npm install @huggingface/transformers --workspace=worker

VERIFY installations:
  - python -c "import docling; print(docling.__version__)"
  - python -c "from pydantic_ai import Agent"
  - node -e "const {Ollama} = require('ollama'); console.log('Ollama OK')"

Task 3: Ollama Model Setup
INSTALL Qwen 32B model:
  - ollama pull qwen2.5:32b-instruct-q4_K_M

VERIFY model:
  - ollama list | grep qwen2.5:32b
  - curl http://localhost:11434/api/generate -d '{"model":"qwen2.5:32b-instruct-q4_K_M","prompt":"test"}'

EXPECTED: Model shows ~20GB size, responds to test prompt

Task 4: Create Ollama Client Module
CREATE worker/lib/local/ollama-client.ts:
  - IMPORT: import Ollama from 'ollama'
  - EXPORT: class OllamaClient with methods:
    * chat(prompt: string, options?: OllamaOptions): Promise<string>
    * generateStructured(prompt: string, schema: object): Promise<object>
  - PATTERN: Follow markdown-cleanup-ai.ts client initialization
  - ERROR HANDLING: Catch timeout, OOM, connection refused
  - CONFIGURATION: Read OLLAMA_HOST, OLLAMA_MODEL from env

# ============================================================================
# PHASE 2: Docling Integration (Week 1-2)
# ============================================================================

Task 5: Enhance Docling Python Script
MODIFY worker/scripts/docling_extract.py:
  - FIND: existing DocumentConverter usage
  - ADD: HybridChunker import and initialization
  - ADD: Options for enable_chunking, chunk_size, tokenizer
  - ADD: Structure extraction (sections, headings, hierarchy)
  - ADD: Chunk metadata (page_start, page_end, heading_path, bboxes)
  - PRESERVE: Existing progress reporting via stdout
  - PATTERN: See reference doc lines 3986-4010 for complete flow

PSEUDOCODE:
from docling.chunking import HybridChunker

def extract_with_chunking(pdf_path, options):
    converter = DocumentConverter()
    doc = converter.convert(pdf_path)

    if options.get('enable_chunking'):
        chunker = HybridChunker(
            tokenizer=options.get('tokenizer', 'Xenova/all-mpnet-base-v2'),
            max_tokens=options.get('chunk_size', 512),
            merge_peers=True
        )

        chunks = []
        for chunk in chunker.chunk(doc):
            # Extract metadata from Docling's rich structure
            chunks.append({
                'content': chunk.text,
                'page_start': extract_page_start(chunk),
                'heading_path': chunk.meta.get('headings', []),
                'bboxes': extract_bboxes(chunk)
            })

    return {
        'markdown': doc.export_to_markdown(),
        'structure': extract_structure(doc),
        'chunks': chunks
    }

Task 6: Update TypeScript Docling Wrapper
MODIFY worker/lib/docling-extractor.ts:
  - FIND: extractPdfBuffer() function
  - ADD: Support for enableChunking, chunkSize, tokenizer options
  - ADD: Parse chunks from Python output
  - ADD: Type definitions for DoclingChunk
  - PRESERVE: Existing timeout and progress handling

PSEUDOCODE:
interface DoclingOptions {
    enableChunking?: boolean
    chunkSize?: number
    tokenizer?: string
}

interface DoclingChunk {
    content: string
    page_start?: number
    page_end?: number
    heading_path?: string[]
    heading_level?: number
    bboxes?: BBox[]
}

async function extractPdfBuffer(
    buffer: ArrayBuffer,
    options: DoclingOptions
): Promise<{
    markdown: string
    structure: any
    chunks?: DoclingChunk[]
}> {
    // Spawn Python with options
    // Parse JSON output
    // Return structured result
}

Task 7: Update PDF Processor for Local Mode
MODIFY worker/processors/pdf-processor.ts:
  - FIND: process() method
  - ADD: Check for PROCESSING_MODE=local env var
  - ADD: enableChunking: true when calling docling-extractor
  - ADD: Store doclingChunks in job metadata cache
  - PRESERVE: Existing stage progression (15-50% for extraction)

PSEUDOCODE:
async process(): Promise<ProcessResult> {
    const isLocalMode = process.env.PROCESSING_MODE === 'local'

    // Stage 1: Docling extraction
    const extractionResult = await extractPdfBuffer(buffer, {
        enableChunking: isLocalMode,
        chunkSize: 512,
        tokenizer: 'Xenova/all-mpnet-base-v2'
    })

    // Cache for use in matching later
    this.job.metadata.doclingChunks = extractionResult.chunks
    this.job.metadata.doclingStructure = extractionResult.structure
}

# ============================================================================
# PHASE 3: Local LLM Cleanup (Week 2)
# ============================================================================

Task 8: Implement Ollama Cleanup Module
CREATE worker/lib/local/ollama-cleanup.ts:
  - MIRROR: worker/lib/markdown-cleanup-ai.ts structure
  - REPLACE: Gemini calls with Ollama calls
  - KEEP: Batching strategy (split at ## headings for large docs)
  - KEEP: Progress callbacks
  - ADD: Error handling for OOM (catch and mark for review)

PSEUDOCODE:
import { OllamaClient } from './ollama-client'

async function cleanMarkdownLocal(
    markdown: string,
    options: CleanupOptions
): Promise<string> {
    const ollama = new OllamaClient()

    // Split large documents
    if (markdown.length > 100000) {
        const sections = splitAtHeadings(markdown)
        const cleaned = await Promise.all(
            sections.map(section => cleanSection(ollama, section))
        )
        return cleaned.join('\n\n')
    }

    // Single pass for small docs
    return await cleanSection(ollama, markdown)
}

async function cleanSection(ollama: OllamaClient, text: string): Promise<string> {
    const prompt = `Clean this markdown, removing artifacts while preserving content:\n\n${text}`

    try {
        return await ollama.chat(prompt, { temperature: 0.3 })
    } catch (error) {
        if (error.message.includes('out of memory')) {
            throw new OOMError('Qwen 32B out of memory - use smaller model')
        }
        throw error
    }
}

Task 9: Add Cleanup to PDF Processor
MODIFY worker/processors/pdf-processor.ts:
  - FIND: Stage 4 AI cleanup (55-70%)
  - ADD: Conditional for local vs Gemini cleanup
  - ADD: Try/catch for OOM with fallback
  - PRESERVE: cleanMarkdown flag from job.input_data

PSEUDOCODE:
// Stage 4: AI cleanup (55-70%)
if (cleanMarkdownEnabled) {
    const isLocalMode = process.env.PROCESSING_MODE === 'local'

    try {
        if (isLocalMode) {
            markdown = await cleanMarkdownLocal(markdown, { onProgress })
        } else {
            markdown = await cleanPdfMarkdown(this.ai, markdown, { onProgress })
        }

        await this.updateProgress(70, 'cleanup_ai', 'complete', 'AI cleanup done')
    } catch (error) {
        if (error instanceof OOMError) {
            // Mark for review, continue with regex-only
            await this.markForReview('ai_cleanup_failed', error.message)
            await this.updateProgress(70, 'cleanup_ai', 'skipped', 'Using regex cleanup only')
        } else {
            throw error
        }
    }
}

# ============================================================================
# PHASE 4: Bulletproof Chunk Matching (Week 2-3)
# ============================================================================

Task 10: Implement Layer 1 (Enhanced Fuzzy)
MODIFY worker/lib/chunking/ai-fuzzy-matcher.ts:
  - FIND: Existing 4-strategy matcher
  - ADD: Strategy 3.5: Multi-anchor search
  - ENHANCE: Extract 3 anchor points (start, middle, end)
  - ENHANCE: Find anchors in order to bound chunk
  - RETURN: confidence: 'exact' | 'high' based on strategy

PSEUDOCODE:
function enhancedFuzzyMatch(markdown: string, chunk: Chunk): MatchResult | null {
    // Existing strategies 1-2
    if (exactMatch) return { confidence: 'exact', method: 'exact_match' }
    if (normalizedMatch) return { confidence: 'exact', method: 'normalized_match' }

    // NEW: Multi-anchor search
    const anchors = extractAnchors(chunk.content, 3)  // start, middle, end phrases
    const anchorPositions = findAnchors(markdown, anchors)

    if (anchorPositions.length >= 2) {
        const bounds = calculateBounds(anchorPositions)
        return {
            confidence: 'high',
            method: 'multi_anchor',
            start_offset: bounds.start,
            end_offset: bounds.end
        }
    }

    // Existing strategy 4 (sliding window)
    const windowMatch = slidingWindowSearch(markdown, chunk.content)
    if (windowMatch.similarity > 0.8) {
        return { confidence: 'high', method: 'sliding_window', ...windowMatch }
    }

    return null  // Failed Layer 1
}

Task 11: Implement Layer 2 (Embeddings)
CREATE worker/lib/local/bulletproof-matcher.ts:
  - IMPORT: @huggingface/transformers
  - IMPLEMENT: embeddingBasedMatching() function
  - LOGIC:
    * Embed unmatched chunks
    * Create sliding windows of cleaned markdown
    * Embed windows
    * Find best cosine similarity (threshold 0.85)
  - RETURN: confidence: 'high' | 'medium' based on similarity score

PSEUDOCODE:
import { pipeline } from '@huggingface/transformers'

async function embeddingBasedMatching(
    markdown: string,
    chunks: Chunk[]
): Promise<MatchResult[]> {
    const extractor = await pipeline('feature-extraction', 'Xenova/all-mpnet-base-v2')

    // Embed chunks
    const chunkEmbeddings = await extractor(
        chunks.map(c => c.content),
        { pooling: 'mean', normalize: true }
    )

    // Create windows
    const windows = createWindows(markdown, 500, 200)  // 500 chars, 200 stride
    const windowEmbeddings = await extractor(
        windows.map(w => w.content),
        { pooling: 'mean', normalize: true }
    )

    // Match
    const results = []
    for (let i = 0; i < chunks.length; i++) {
        const bestMatch = findBestMatch(chunkEmbeddings[i], windowEmbeddings)
        if (bestMatch.similarity >= 0.85) {
            results.push({
                chunk: chunks[i],
                start_offset: windows[bestMatch.index].start,
                end_offset: windows[bestMatch.index].end,
                confidence: bestMatch.similarity >= 0.95 ? 'high' : 'medium',
                method: 'embedding_match'
            })
        }
    }

    return results
}

Task 12: Implement Layer 3 (LLM-Assisted)
ADD to worker/lib/local/bulletproof-matcher.ts:
  - IMPLEMENT: llmAssistedMatching() function
  - USE: OllamaClient to ask Qwen to find matches
  - LOGIC:
    * Give LLM chunk content + search window
    * Ask "find best match" with JSON response
    * Parse position from LLM output
  - RETURN: confidence: 'medium' (LLM is less precise than embeddings)

PSEUDOCODE:
async function llmAssistedMatching(
    markdown: string,
    chunks: Chunk[]
): Promise<MatchResult[]> {
    const ollama = new OllamaClient()
    const results = []

    for (const chunk of chunks) {
        const searchWindow = getSearchWindow(markdown, chunk.start_offset, 5000)

        const prompt = `Find the best matching passage in TEXT for this TARGET.

TARGET: ${chunk.content.slice(0, 500)}

TEXT: ${searchWindow}

Return JSON: {"found": true/false, "start_offset": number, "end_offset": number}`

        const response = await ollama.generateStructured(prompt, {})

        if (response.found) {
            results.push({
                chunk,
                start_offset: searchWindow.start + response.start_offset,
                end_offset: searchWindow.start + response.end_offset,
                confidence: 'medium',
                method: 'llm_assisted'
            })
        }
    }

    return results
}

Task 13: Implement Layer 4 (Interpolation)
ADD to worker/lib/local/bulletproof-matcher.ts:
  - IMPLEMENT: anchorInterpolation() function
  - LOGIC:
    * Use successfully matched chunks as anchors
    * For unmatched chunks, find before/after neighbors
    * Interpolate position based on index ratio
  - RETURN: confidence: 'synthetic' (user should validate)
  - GUARANTEE: Always succeeds (100% recovery)

PSEUDOCODE:
function anchorInterpolation(
    markdown: string,
    unmatchedChunks: Chunk[],
    matchedResults: MatchResult[]
): MatchResult[] {
    const sortedMatched = matchedResults.sort((a, b) => a.chunk.index - b.chunk.index)
    const synthetic = []

    for (const chunk of unmatchedChunks) {
        const before = sortedMatched.filter(r => r.chunk.index < chunk.index).pop()
        const after = sortedMatched.filter(r => r.chunk.index > chunk.index).shift()

        let estimatedStart, estimatedEnd

        if (before && after) {
            // Interpolate between neighbors
            const ratio = (chunk.index - before.chunk.index) / (after.chunk.index - before.chunk.index)
            estimatedStart = Math.floor(before.end_offset + ratio * (after.start_offset - before.end_offset))
            estimatedEnd = estimatedStart + chunk.content.length
        } else if (before) {
            // Append after last chunk
            estimatedStart = before.end_offset + 10
            estimatedEnd = estimatedStart + chunk.content.length
        } else if (after) {
            // Insert before first chunk
            estimatedEnd = after.start_offset - 10
            estimatedStart = estimatedEnd - chunk.content.length
        } else {
            // No anchors - use original offset as best guess
            estimatedStart = chunk.start_offset
            estimatedEnd = chunk.end_offset
        }

        synthetic.push({
            chunk,
            start_offset: Math.max(0, estimatedStart),
            end_offset: Math.min(markdown.length, estimatedEnd),
            confidence: 'synthetic',
            method: 'interpolation'
        })
    }

    return synthetic  // NEVER returns empty - 100% guarantee
}

Task 14: Orchestrate 5-Layer Matching
ADD to worker/lib/local/bulletproof-matcher.ts:
  - IMPLEMENT: bulletproofMatch() main function
  - LOGIC: Call layers 1-4 in sequence, early exit if all matched
  - TRACK: Statistics for each layer
  - RETURN: All chunks matched, stats, warnings for synthetic

PSEUDOCODE:
async function bulletproofMatch(
    cleanedMarkdown: string,
    doclingChunks: DoclingChunk[]
): Promise<{chunks: MatchResult[], stats: MatchStats, warnings: string[]}> {
    const results = []
    const warnings = []

    // Layer 1: Enhanced Fuzzy (fast, 85% success)
    const { matched: l1Matched, unmatched: l1Failed } =
        await enhancedFuzzyMatch(cleanedMarkdown, doclingChunks)
    results.push(...l1Matched)

    if (l1Failed.length === 0) {
        return { chunks: results, stats: calculateStats(results), warnings: [] }
    }

    // Layer 2: Embeddings (medium, 98% cumulative)
    const { matched: l2Matched, unmatched: l2Failed } =
        await embeddingBasedMatching(cleanedMarkdown, l1Failed)
    results.push(...l2Matched)

    if (l2Failed.length === 0) {
        return { chunks: results, stats: calculateStats(results), warnings: [] }
    }

    // Layer 3: LLM (slow, 99.9% cumulative)
    const { matched: l3Matched, unmatched: l3Failed } =
        await llmAssistedMatching(cleanedMarkdown, l2Failed)
    results.push(...l3Matched)

    // Layer 4: Interpolation (instant, 100% guaranteed)
    const l4Synthetic = anchorInterpolation(cleanedMarkdown, l3Failed, results)
    results.push(...l4Synthetic)

    // Generate warnings for synthetic chunks
    for (const synthetic of l4Synthetic) {
        warnings.push(
            `Chunk ${synthetic.chunk.index} (page ${synthetic.chunk.page_start}): ` +
            `Position approximate, metadata preserved`
        )
    }

    return { chunks: results, stats: calculateStats(results), warnings }
}

Task 15: Integrate Matching into Processor
MODIFY worker/processors/pdf-processor.ts:
  - FIND: After AI cleanup stage (70%)
  - ADD: Call bulletproofMatch() to remap doclingChunks to cleanedMarkdown
  - ADD: Preserve Docling metadata (page_start, heading_path, bboxes)
  - ADD: Add confidence tracking (position_confidence, position_method)
  - STORE: Warnings in job metadata for user review

PSEUDOCODE:
// Stage 6: Bulletproof matching (70-75%)
await this.updateProgress(72, 'matching', 'processing', 'Remapping chunks')

const { chunks: rematchedChunks, stats, warnings } = await bulletproofMatch(
    cleanedMarkdown,
    this.job.metadata.doclingChunks
)

console.log(`[PDF] Matching complete: ${stats.exact} exact, ${stats.synthetic} synthetic`)

// Store warnings for UI
this.job.metadata.matchingWarnings = warnings

// Combine Docling metadata + new offsets + confidence
const finalChunks = rematchedChunks.map(result => ({
    content: result.chunk.content,
    start_offset: result.start_offset,      // NEW - in cleaned markdown
    end_offset: result.end_offset,          // NEW - in cleaned markdown
    page_start: result.chunk.page_start,    // PRESERVED from Docling
    page_end: result.chunk.page_end,        // PRESERVED from Docling
    heading_path: result.chunk.heading_path, // PRESERVED from Docling
    bboxes: result.chunk.bboxes,            // PRESERVED from Docling
    position_confidence: result.confidence, // NEW - quality tracking
    position_method: result.method          // NEW - how it was matched
}))

await this.updateProgress(75, 'matching', 'complete', `${finalChunks.length} chunks matched`)

# ============================================================================
# PHASE 5: Metadata Enrichment with PydanticAI (Week 3)
# ============================================================================

Task 16: Create PydanticAI Python Script
CREATE worker/scripts/extract_metadata_pydantic.py:
  - IMPORTS: pydantic, pydantic_ai, json, sys
  - DEFINE: ChunkMetadata schema with Pydantic BaseModel
  - IMPLEMENT: Agent with result_type=ChunkMetadata, retries=3
  - HANDLE: Batch processing (10 chunks at a time)
  - OUTPUT: JSON to stdout (one line per chunk)

PSEUDOCODE (Python):
from pydantic import BaseModel, Field
from pydantic_ai import Agent

class ChunkMetadata(BaseModel):
    themes: list[str] = Field(min_length=1, max_length=5)
    concepts: list[dict] = Field(min_length=1, max_length=10)
    importance: float = Field(ge=0.0, le=1.0)
    summary: str = Field(min_length=20, max_length=200)
    emotional: dict
    domain: str

agent = Agent(
    model='ollama:qwen2.5:32b-instruct-q4_K_M',
    result_type=ChunkMetadata,
    retries=3
)

# Read chunks from stdin
for line in sys.stdin:
    chunk = json.loads(line)

    try:
        result = await agent.run(chunk['content'])
        sys.stdout.write(json.dumps({
            'chunk_id': chunk['id'],
            'metadata': result.data.model_dump()
        }) + '\n')
        sys.stdout.flush()
    except Exception as e:
        # Return fallback metadata
        sys.stdout.write(json.dumps({
            'chunk_id': chunk['id'],
            'metadata': get_fallback_metadata(),
            'error': str(e)
        }) + '\n')
        sys.stdout.flush()

Task 17: Create TypeScript Wrapper for PydanticAI
CREATE worker/lib/chunking/pydantic-metadata.ts:
  - PATTERN: Follow docling-extractor.ts subprocess pattern
  - IMPLEMENT: extractMetadataBatch() function
  - HANDLE: Spawn Python, pipe chunks via stdin, read results from stdout
  - ERROR HANDLING: Timeouts, validation failures, fallback metadata

PSEUDOCODE:
import { spawn } from 'child_process'

async function extractMetadataBatch(
    chunks: Array<{id: string, content: string}>
): Promise<Map<string, ChunkMetadata>> {
    const pythonScript = path.join(process.cwd(), 'worker/scripts/extract_metadata_pydantic.py')
    const python = spawn('python', ['-u', pythonScript])

    const results = new Map()

    // Write chunks to stdin
    for (const chunk of chunks) {
        python.stdin.write(JSON.stringify(chunk) + '\n')
    }
    python.stdin.end()

    // Read results from stdout
    for await (const line of python.stdout) {
        const result = JSON.parse(line)
        results.set(result.chunk_id, result.metadata)
    }

    return results
}

Task 18: Integrate Metadata Extraction into Processor
MODIFY worker/processors/pdf-processor.ts:
  - FIND: After matching stage (75%)
  - ADD: Call extractMetadataBatch() for all chunks
  - ADD: Batch processing (10 chunks at a time for efficiency)
  - MERGE: Metadata into chunk objects
  - PROGRESS: 75-90% for metadata extraction

PSEUDOCODE:
// Stage 7: Metadata enrichment (75-90%)
await this.updateProgress(77, 'metadata', 'processing', 'Extracting metadata')

const BATCH_SIZE = 10
const enriched = []

for (let i = 0; i < finalChunks.length; i += BATCH_SIZE) {
    const batch = finalChunks.slice(i, i + BATCH_SIZE)
    const metadata = await extractMetadataBatch(
        batch.map(c => ({ id: c.id, content: c.content }))
    )

    for (const chunk of batch) {
        enriched.push({
            ...chunk,
            themes: metadata.get(chunk.id).themes,
            concepts: metadata.get(chunk.id).concepts,
            importance_score: metadata.get(chunk.id).importance,
            summary: metadata.get(chunk.id).summary,
            emotional_metadata: metadata.get(chunk.id).emotional,
            domain_metadata: { primaryDomain: metadata.get(chunk.id).domain }
        })
    }

    const progress = 77 + Math.floor((i / finalChunks.length) * 13)
    await this.updateProgress(progress, 'metadata', 'processing', `Batch ${i/BATCH_SIZE + 1}`)
}

await this.updateProgress(90, 'metadata', 'complete', 'Metadata enrichment done')

# ============================================================================
# PHASE 6: Local Embeddings (Week 3)
# ============================================================================

Task 19: Implement Local Embeddings with Transformers.js
CREATE worker/lib/local/embeddings-local.ts:
  - IMPORT: @huggingface/transformers
  - IMPLEMENT: generateEmbeddingsBatch() function
  - HANDLE: Batch processing (100 chunks at a time)
  - CONFIGURE: pooling: 'mean', normalize: true
  - CACHE: Pipeline instance for reuse

PSEUDOCODE:
import { pipeline } from '@huggingface/transformers'

let cachedExtractor: any = null

async function generateEmbeddingsBatch(
    texts: string[]
): Promise<number[][]> {
    if (!cachedExtractor) {
        cachedExtractor = await pipeline(
            'feature-extraction',
            'Xenova/all-mpnet-base-v2'
        )
    }

    const embeddings = await cachedExtractor(texts, {
        pooling: 'mean',
        normalize: true
    })

    return embeddings.tolist()  // Convert tensor to array
}

Task 20: Integrate Embeddings into Processor
MODIFY worker/processors/pdf-processor.ts:
  - FIND: After metadata enrichment (90%)
  - ADD: Check for local mode, use generateEmbeddingsBatch()
  - FALLBACK: If Transformers.js fails, use existing Gemini embeddings
  - BATCH: Process 100 chunks at a time
  - PROGRESS: 90-95%

PSEUDOCODE:
// Stage 8: Embedding generation (90-95%)
await this.updateProgress(92, 'embeddings', 'processing', 'Generating embeddings')

const isLocalMode = process.env.PROCESSING_MODE === 'local'
let embeddings

if (isLocalMode) {
    try {
        embeddings = await generateEmbeddingsBatch(
            enriched.map(c => c.content)
        )
    } catch (error) {
        console.warn('[PDF] Local embeddings failed, falling back to Gemini')
        embeddings = await generateEmbeddings(enriched.map(c => c.content))
    }
} else {
    embeddings = await generateEmbeddings(enriched.map(c => c.content))
}

// Attach embeddings to chunks
enriched.forEach((chunk, i) => {
    chunk.embedding = embeddings[i]
})

await this.updateProgress(95, 'embeddings', 'complete', 'Embeddings generated')

# ============================================================================
# PHASE 7: Review Checkpoints (Week 3)
# ============================================================================

Task 21: Add Docling Extraction Review Checkpoint
MODIFY worker/processors/pdf-processor.ts:
  - FIND: After regex cleanup (55%)
  - ADD: Check for reviewDoclingExtraction flag
  - IF true:
    * Export markdown to Obsidian
    * Set status: 'awaiting_manual_review'
    * Set review_stage: 'docling_extraction'
    * Return partial result
  - PATTERN: Follow existing reviewBeforeChunking checkpoint pattern

PSEUDOCODE:
// Stage 3: Review checkpoint (optional - 55%)
const reviewDoclingExtraction = this.job.input_data?.reviewDoclingExtraction

if (reviewDoclingExtraction) {
    console.log('[PDF] Pausing for Docling extraction review')

    // Export to Obsidian
    await exportToObsidian(this.job.document_id, this.job.user_id)

    // Set awaiting review status
    await this.supabase
        .from('documents')
        .update({
            processing_status: 'awaiting_manual_review',
            review_stage: 'docling_extraction'
        })
        .eq('id', this.job.document_id)

    // Return partial result (no chunks yet)
    return {
        markdown: regexCleanedMarkdown,
        chunks: [],
        metadata: {
            review_stage: 'docling_extraction',
            awaiting_user_decision: true
        }
    }
}

Task 22: Handle Resume from Docling Review
MODIFY worker/handlers/continue-processing.ts:
  - FIND: Existing review stage handling
  - ADD: Case for review_stage === 'docling_extraction'
  - LOGIC:
    * Sync markdown from Obsidian
    * Check if user set cleanMarkdown flag
    * Continue with AI cleanup or skip to chunking

PSEUDOCODE:
// Handle Docling extraction review
if (review_stage === 'docling_extraction') {
    console.log('[Continue] Resuming from Docling extraction review')

    // Sync edited markdown from Obsidian
    const { changed, markdown } = await syncFromObsidian(documentId, userId)

    // Check user decision on AI cleanup
    const runAICleanup = job.input_data?.cleanMarkdown ?? true

    if (runAICleanup) {
        // Continue with AI cleanup stage
        return await runAICleanup(job, markdown)
    } else {
        // Skip AI cleanup, go straight to chunking
        return await runChunking(job, markdown)
    }
}

# ============================================================================
# PHASE 8: Confidence UI (Week 4)
# ============================================================================

Task 23: Create Chunk Quality Panel Component
CREATE src/components/sidebar/ChunkQualityPanel.tsx:
  - MIRROR: AnnotationReviewTab.tsx structure
  - IMPORT: shadcn/ui Accordion, Button, Badge components
  - DISPLAY:
    * Quality statistics (total, exact, high, medium, synthetic)
    * List of synthetic chunks with details
    * Validation actions
  - ACTIONS: validateChunk(), showInDocument()

PSEUDOCODE:
'use client'

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

export function ChunkQualityPanel({ documentId }: { documentId: string }) {
    const { data: stats } = useChunkStats(documentId)
    const { data: syntheticChunks } = useSyntheticChunks(documentId)

    return (
        <div className="space-y-4 p-4">
            {/* Quality Stats */}
            <div className="grid grid-cols-2 gap-2">
                <StatCard label="Exact" count={stats.exact} color="green" />
                <StatCard label="High" count={stats.high} color="blue" />
                <StatCard label="Medium" count={stats.medium} color="yellow" />
                <StatCard label="Synthetic" count={stats.synthetic} color="orange" />
            </div>

            {/* Synthetic Chunks List */}
            {syntheticChunks.length > 0 && (
                <Accordion type="single" collapsible>
                    {syntheticChunks.map(chunk => (
                        <AccordionItem key={chunk.id} value={chunk.id}>
                            <AccordionTrigger>
                                <div className="flex items-center gap-2">
                                    <Badge variant="warning">Synthetic</Badge>
                                    <span>Chunk {chunk.chunk_index} (Page {chunk.page_start})</span>
                                </div>
                            </AccordionTrigger>
                            <AccordionContent>
                                <div className="space-y-2">
                                    <p className="text-sm">{chunk.content.slice(0, 150)}...</p>
                                    <div className="flex gap-2">
                                        <Button size="sm" onClick={() => validateChunk(chunk.id)}>
                                            ✓ Position Correct
                                        </Button>
                                        <Button size="sm" variant="outline" onClick={() => showInDocument(chunk.id)}>
                                            Review in Document
                                        </Button>
                                    </div>
                                </div>
                            </AccordionContent>
                        </AccordionItem>
                    ))}
                </Accordion>
            )}
        </div>
    )
}

Task 24: Add Chunk Quality Tab to Sidebar
MODIFY src/components/sidebar/*:
  - FIND: Existing sidebar tabs
  - ADD: New tab "Quality" with icon
  - IMPORT: ChunkQualityPanel component
  - PATTERN: Follow existing tab structure

PSEUDOCODE:
// In sidebar component
import { CheckCircle } from 'lucide-react'
import { ChunkQualityPanel } from './ChunkQualityPanel'

<SidebarTabs>
  <SidebarTab icon={BookOpen} label="Contents">
    <TableOfContents />
  </SidebarTab>
  <SidebarTab icon={MessageSquare} label="Annotations">
    <AnnotationReviewTab />
  </SidebarTab>
  <SidebarTab icon={CheckCircle} label="Quality">
    <ChunkQualityPanel documentId={documentId} />
  </SidebarTab>
</SidebarTabs>

Task 25: Add Inline Confidence Tooltips
MODIFY src/components/reader/* (Document reader component):
  - FIND: Chunk rendering logic
  - ADD: data-chunk-id attribute to chunk spans
  - ADD: Hover detection to show tooltip
  - DISPLAY: Confidence icon for synthetic chunks
  - TOOLTIP: Show confidence level, method, page number

PSEUDOCODE:
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

function ChunkWithMetadata({ chunk, children }) {
    const isSynthetic = chunk.position_confidence === 'synthetic'

    return (
        <span data-chunk-id={chunk.id}>
            {isSynthetic && (
                <Tooltip>
                    <TooltipTrigger asChild>
                        <WarningIcon className="inline w-3 h-3 text-yellow-500" />
                    </TooltipTrigger>
                    <TooltipContent>
                        <div className="space-y-1">
                            <div>Confidence: {chunk.position_confidence}</div>
                            <div>Method: {chunk.position_method}</div>
                            <div>Page: {chunk.page_start}</div>
                            <div className="text-xs text-muted-foreground">
                                Position approximate, metadata accurate
                            </div>
                        </div>
                    </TooltipContent>
                </Tooltip>
            )}
            {children}
        </span>
    )
}

# ============================================================================
# PHASE 9: Testing & Validation (Week 4)
# ============================================================================

Task 26: Create Integration Tests
CREATE worker/tests/integration/local-processing.test.ts:
  - TEST: Docling extraction with HybridChunker
  - TEST: Ollama cleanup (with mock)
  - TEST: 5-layer bulletproof matching
  - TEST: PydanticAI metadata extraction (with mock)
  - TEST: Transformers.js embeddings
  - MOCK: Ollama HTTP calls with MSW
  - MOCK: Python subprocess with test fixtures

PSEUDOCODE:
describe('Local Processing Pipeline', () => {
    it('extracts PDF with Docling and HybridChunker', async () => {
        const result = await extractPdfBuffer(testPdfBuffer, {
            enableChunking: true,
            chunkSize: 512,
            tokenizer: 'Xenova/all-mpnet-base-v2'
        })

        expect(result.chunks).toBeDefined()
        expect(result.chunks.length).toBeGreaterThan(0)
        expect(result.chunks[0]).toHaveProperty('page_start')
        expect(result.chunks[0]).toHaveProperty('heading_path')
    })

    it('achieves 100% chunk recovery with bulletproof matching', async () => {
        const { chunks, stats } = await bulletproofMatch(cleanedMarkdown, doclingChunks)

        expect(chunks.length).toBe(doclingChunks.length)  // 100% recovery
        expect(stats.exact + stats.high + stats.medium + stats.synthetic).toBe(chunks.length)
        expect(stats.synthetic).toBeLessThan(chunks.length * 0.05)  // <5%
    })

    it('handles Qwen OOM gracefully', async () => {
        // Mock OOM error
        mockOllama.mockRejectedValueOnce(new Error('out of memory'))

        const result = await processDocument(testJob)

        expect(result.metadata.ai_cleanup_status).toBe('skipped')
        expect(result.metadata.review_needed).toBe(true)
    })
})

Task 27: Run Validation Commands
EXECUTE validation suite:
  - cd worker && npm run test:integration
  - cd worker && npm run validate:metadata
  - npm run test:e2e
  - npm run build

EXPECTED: All tests pass, no linting errors, build succeeds

# ============================================================================
# PHASE 10: Documentation & Cleanup (Week 4)
# ============================================================================

Task 28: Update Environment Variables Documentation
MODIFY .env.local.example:
  - ADD: PROCESSING_MODE=local
  - ADD: OLLAMA_HOST=http://127.0.0.1:11434
  - ADD: OLLAMA_MODEL=qwen2.5:32b-instruct-q4_K_M
  - ADD: OLLAMA_TIMEOUT=600000

Task 29: Create Setup Instructions
CREATE docs/local-pipeline-setup.md:
  - DOCUMENT: Python dependencies installation
  - DOCUMENT: Ollama setup and model pulling
  - DOCUMENT: Environment variable configuration
  - DOCUMENT: Testing the pipeline
  - DOCUMENT: Troubleshooting common issues

Task 30: Update CLAUDE.md
MODIFY CLAUDE.md:
  - ADD: Local processing pipeline section
  - ADD: New commands for validation
  - ADD: Notes about Qwen 32B memory requirements
  - ADD: Reference to bulletproof matching guarantee
```

### Integration Points

```yaml
DATABASE:
  migration: '045_add_local_pipeline_columns.sql'
  tables:
    - chunks: Add 8 new columns (page_start, page_end, heading_level, section_marker, bboxes, position_confidence, position_method, position_validated)
  indexes:
    - idx_chunks_pages (document_id, page_start, page_end)
    - idx_chunks_section (document_id, section_marker)
    - idx_chunks_confidence (position_confidence)

PYTHON:
  scripts:
    - worker/scripts/docling_extract_hybrid.py (NEW)
    - worker/scripts/extract_metadata_pydantic.py (NEW)
  dependencies:
    - docling==2.55.1
    - pydantic-ai[ollama]
    - sentence-transformers
    - transformers

NODEJS:
  packages:
    - ollama (worker)
    - @huggingface/transformers (worker)
  wrappers:
    - worker/lib/local/ollama-client.ts (NEW)
    - worker/lib/local/embeddings-local.ts (NEW)
    - worker/lib/local/bulletproof-matcher.ts (NEW)

UI:
  components:
    - src/components/sidebar/ChunkQualityPanel.tsx (NEW)
    - Modify: Document reader for inline tooltips
    - Modify: Sidebar for Quality tab

CONFIG:
  environment:
    - PROCESSING_MODE=local
    - OLLAMA_HOST=http://127.0.0.1:11434
    - OLLAMA_MODEL=qwen2.5:32b-instruct-q4_K_M
```

---

## Validation Loop

### Level 1: Syntax & Style

```bash
# Worker module
cd worker && npm run lint
cd worker && npm run type-check

# Expected: No errors. If errors, READ the error and fix.
```

### Level 2: Unit Tests

```bash
# Worker integration tests
cd worker && npm run test:integration

# Metadata validation tests
cd worker && npm run validate:metadata

# Expected: All tests pass
```

### Level 3: E2E Tests

```bash
# Full pipeline test
npm run test:e2e

# Expected: Document processes successfully with 100% chunk recovery
```

### Level 4: Manual Testing

```bash
# Start Ollama
ollama serve

# Pull model
ollama pull qwen2.5:32b-instruct-q4_K_M

# Set environment
export PROCESSING_MODE=local

# Start worker
cd worker && npm run dev

# Upload test PDF in UI
# Verify: Processing completes, chunks show confidence, synthetic <5%
```

---

## Final Validation Checklist

- [ ] Database migration #045 applied successfully
- [ ] Python dependencies installed (docling, pydantic-ai, sentence-transformers)
- [ ] Ollama running with Qwen 32B model
- [ ] All tests pass: `cd worker && npm run test:integration`
- [ ] No linting errors: `cd worker && npm run lint`
- [ ] No type errors: `cd worker && npm run type-check`
- [ ] Build succeeds: `npm run build`
- [ ] Manual test: Upload 50-page PDF, verify <5 min processing time
- [ ] Manual test: Check chunk quality panel shows statistics
- [ ] Manual test: Synthetic chunks (if any) have correct page numbers
- [ ] Error cases handled: Qwen OOM triggers review, not crash
- [ ] Logs are informative: Show layer-by-layer matching progress
- [ ] Documentation updated: .env.example has new vars

---

## Anti-Patterns to Avoid

- ❌ Don't skip Python stdout.flush() - IPC will hang
- ❌ Don't use Ollama streaming for structured outputs - breaks JSON
- ❌ Don't mismatch tokenizer between HybridChunker and embeddings
- ❌ Don't load entire PDFs into memory - use Docling streaming
- ❌ Don't use Q8 quantization on M1 Max - too slow, use Q4_K_M
- ❌ Don't skip confidence tracking - user needs transparency
- ❌ Don't block pipeline on validation failures - mark for review
- ❌ Don't assume 100% exact matches - plan for synthetic chunks
- ❌ Don't test with real AI in CI - mock Ollama and Python subprocesses
- ❌ Don't ignore OOM errors - catch and fallback gracefully

---

## PRP Confidence Score

**8.5/10** - High confidence for one-pass implementation

**Reasoning:**
- ✅ Complete research (codebase + external libraries)
- ✅ Clear business logic (user decisions documented)
- ✅ Existing patterns to follow (Obsidian sync, fuzzy matching, Python IPC)
- ✅ External docs provided (Docling, PydanticAI, Ollama, Transformers.js)
- ✅ Validation commands specified
- ✅ Database schema defined
- ✅ Test strategy clear
- ⚠️ Complexity: 5-layer matching is sophisticated (may need debugging)
- ⚠️ Python integration: IPC can be tricky (but pattern exists)

**Risk areas:**
- Bulletproof matching (Layers 2-4) - most complex, may need iteration
- Python-Node IPC edge cases - subprocess failures, timeout handling
- Qwen 32B OOM - graceful degradation critical

**Mitigation:**
- Start with Layers 1-2 only, add 3-4 incrementally
- Comprehensive error handling for subprocess failures
- Mock Python in tests to avoid flakiness

---

**Ready for Implementation** ✓

See task breakdown: [docs/tasks/local-processing-pipeline.md](../tasks/local-processing-pipeline.md)
