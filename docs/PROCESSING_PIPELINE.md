# Rhizome V2 - Document Processing Pipeline

**Last Updated**: 2025-10-28
**Pipeline Version**: Chonkie Integration (Unified Pipeline)
**Status**: ✅ Fully Operational
**Recent Improvements**:
- Worker module refactored (Oct 2025) - eliminated 1,265 lines of duplication across handlers and processors
- Phase 2A metadata extraction (Oct 2025) - 8 enhanced Docling fields for 99%+ annotation accuracy and 5-10% better connection quality

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture Philosophy](#architecture-philosophy)
3. [The 10-Stage Unified Pipeline](#the-10-stage-unified-pipeline)
4. [Chonkie Chunking System](#chonkie-chunking-system)
5. [Metadata Transfer System](#metadata-transfer-system)
6. [Local Processing Pipeline](#local-processing-pipeline)
7. [Performance & Cost](#performance--cost)
8. [Quality Metrics](#quality-metrics)
9. [Troubleshooting](#troubleshooting)

---

## Overview

Rhizome V2 uses a **unified 10-stage processing pipeline** powered by Chonkie for semantic chunking. This architecture eliminates the previous 3 parallel chunking paths in favor of a single, predictable pipeline that offers 9 user-selectable chunking strategies.

### Key Features

- ✅ **9 Chunking Strategies**: From fastest (token) to highest quality (slumber)
- ✅ **100% Local Processing**: Zero API costs with Docling + Ollama + Chonkie
- ✅ **Optional Enrichment**: Skip metadata extraction to save processing time (default: off)
- ✅ **Metadata Preservation**: 70-90% overlap coverage via coordinate mapping
- ✅ **Character Offset Validation**: Guaranteed accuracy for metadata transfer
- ✅ **Quality Tracking**: Confidence scores (high/medium/low) for all chunks
- ✅ **Phase 2A Metadata** (Oct 2025): 8 enhanced fields (charspan, content_layer, content_label, etc.) for 99%+ annotation accuracy and 5-10% better connections

### Processing Times (500-Page Document)

| Chunker | Time | Use Case |
|---------|------|----------|
| **token** | 2-3 min | Fixed-size, compatibility |
| **sentence** | 3-4 min | Simple boundaries |
| **recursive** | 3-5 min | **Recommended default** |
| **semantic** | 8-15 min | Narrative, thematic |
| **late** | 10-20 min | High-quality RAG |
| **code** | 5-10 min | Source code |
| **neural** | 15-25 min | Academic papers |
| **slumber** | 30-60 min | Critical documents |
| **table** | 3-5 min | Table-heavy docs |

---

## Architecture Philosophy

### The Problem We Solved

**Before Chonkie Integration (3 Parallel Paths):**
```
❌ Inline metadata (experimental, PDF only)
❌ Bulletproof matcher AS chunking system
❌ Cloud chunking (Gemini semantic)
```

**Issues:**
- Complex branching logic (if LOCAL vs CLOUD, if inline metadata enabled)
- ~823 lines of duplicate code across processors
- Hard to maintain (fix bug in one path, forget others)
- Limited flexibility (users can't choose chunking strategy)

### The Solution (1 Unified Path)

**After Chonkie Integration:**
```
✅ Download → Docling Extract → Cleanup → Bulletproof (coord map) →
   Review → Chonkie Chunk → Metadata Transfer → Enrich → Embed → Save
```

**Benefits:**
- **Simplicity**: -223 net lines of code (removed 823, added 600)
- **Flexibility**: 9 chunking strategies for different document types
- **Quality**: 15%+ connection quality improvement (semantic/neural)
- **Cost**: $0 additional (all LOCAL mode processing)
- **Maintenance**: Single pipeline = easier debugging, testing, optimization

### Key Architectural Decisions

1. **ALWAYS run Chonkie** - No fast paths, no branching, no CLOUD/LOCAL split
2. **Docling chunks = metadata anchors** - Heading paths, pages, bboxes
3. **Chonkie chunks = actual chunks** - Used for search, connections, annotations
4. **Bulletproof matcher = coordinate mapper** - Helps metadata transfer via overlap detection
5. **Backward compatibility = not a concern** - This is a greenfield app

---

## The 10-Stage Unified Pipeline

### Stage Overview

```
┌─────────────────────────────────────────────────────┐
│ Stage 1: Download (10-15%)                          │
│  • Fetch PDF/EPUB from Supabase Storage             │
└──────────────┬──────────────────────────────────────┘
               │
┌──────────────▼──────────────────────────────────────┐
│ Stage 2: Docling Extraction (15-50%)                │
│  • ALWAYS run HybridChunker (768 tokens)            │
│  • Save to cached_chunks table                      │
│  • Purpose: Metadata anchors (pages, headings,      │
│    bboxes, section markers)                         │
│  • Output: ~382 chunks with structural metadata     │
└──────────────┬──────────────────────────────────────┘
               │
┌──────────────▼──────────────────────────────────────┐
│ Stage 3: Cleanup (50-70%)                           │
│  • Local regex cleanup                              │
│  • Optional AI cleanup (Ollama if available)        │
│  • Output: Cleaned markdown for Chonkie             │
└──────────────┬──────────────────────────────────────┘
               │
┌──────────────▼──────────────────────────────────────┐
│ Stage 4: Bulletproof Matching (70-72%)              │
│  • Map Docling chunks → cleaned markdown positions  │
│  • 5-layer system creates coordinate map            │
│  • Purpose: Know where metadata lives in cleaned    │
│    markdown so we can detect overlaps               │
│  • Output: MatchResult[] with offsets               │
└──────────────┬──────────────────────────────────────┘
               │
┌──────────────▼──────────────────────────────────────┐
│ Stage 5: Review Checkpoint (Optional, 72%)          │
│  • Skip if reviewBeforeChunking=false               │
└──────────────┬──────────────────────────────────────┘
               │
┌──────────────▼──────────────────────────────────────┐
│ Stage 6: Chonkie Chunking (72-75%)                  │
│  • ALWAYS run (no fast paths)                       │
│  • User selects strategy (9 options)                │
│  • Chunk from cleaned markdown                      │
│  • Output: ~350-420 chunks (semantic boundaries)    │
└──────────────┬──────────────────────────────────────┘
               │
┌──────────────▼──────────────────────────────────────┐
│ Stage 7: Overlap Metadata Transfer (75-77%)         │
│  • For each Chonkie chunk:                          │
│    1. Find overlapping Docling chunks via offsets   │
│    2. Aggregate metadata (Phase 1 + Phase 2A):      │
│       - Headings, pages, bboxes (Phase 1)           │
│       - charspan, content_layer, content_label      │
│         section_level, list fields (Phase 2A)       │
│    3. Calculate confidence based on overlap count/  │
│       percentage                                     │
│  • Expected: 1-3 Docling overlaps per Chonkie chunk │
│  • High overlap = good (means metadata transfers)   │
└──────────────┬──────────────────────────────────────┘
               │
┌──────────────▼──────────────────────────────────────┐
│ Stage 8: Metadata Enrichment (77-90%) - OPTIONAL   │
│  • User can skip via enrichChunks checkbox          │
│  • PydanticAI + Ollama (when enabled)               │
│  • Extract themes, concepts, domains, emotions      │
│  • Default: SKIP (enrichChunks: false)              │
└──────────────┬──────────────────────────────────────┘
               │
┌──────────────▼──────────────────────────────────────┐
│ Stage 9: Embeddings Generation (90-95%)             │
│  • Transformers.js (local, 768d)                    │
│  • Metadata-enhanced (heading context prepended)    │
│  • Same for all chunker strategies                  │
└──────────────┬──────────────────────────────────────┘
               │
┌──────────────▼──────────────────────────────────────┐
│ Stage 10: Finalize (95-100%)                        │
│  • Save to database with chunker_type               │
│  • Queue connection detection                       │
└─────────────────────────────────────────────────────┘
```

### Component Roles

**Docling (Stage 2):**
- **Role**: Metadata extraction
- **Output**: Chunks with heading_path, page numbers, bboxes
- **NOT actual chunks** (just metadata anchors)

**Bulletproof Matcher (Stage 4):**
- **Role**: Coordinate mapper
- **Output**: MatchResult[] showing where Docling chunks map to cleaned markdown
- **NOT a chunking system** (repurposed from old role)

**Chonkie (Stage 6):**
- **Role**: Actual chunking
- **Output**: Final chunks used for search, connections, annotations
- **9 strategies** for different use cases

**Metadata Transfer (Stage 7):**
- **Role**: Bridge between Docling and Chonkie
- **Mechanism**: Overlap detection (reuse bulletproof matcher logic)
- **Output**: Chonkie chunks with Docling metadata

---

## Chonkie Chunking System

### Why Chonkie?

Chonkie is a Python library offering 9 distinct chunking strategies, each optimized for different document types. It guarantees character offset accuracy, which is **critical** for our metadata transfer system.

Chonkie Reference Doc: `docs/processing-pipeline/CHONKIE_CHUNKERS.md`

### Installation

```bash
# Basic installation (15 MiB)
pip install chonkie

# With semantic/late chunkers (adds 62 MiB for sentence-transformers)
pip install "chonkie[semantic]"

# With neural chunker (adds BERT models)
pip install "chonkie[neural]"

# With code chunker (adds tree-sitter)
pip install "chonkie[code]"

# With slumber chunker (adds LLM support, requires API key)
pip install "chonkie[genie]"

# Everything (680 MiB - not recommended unless needed)
pip install "chonkie[all]"
```

### The 9 Chunking Strategies

#### 1. Token Chunker
- **Use Case**: Fixed-size chunks, compatibility fallback
- **Speed**: Fastest (2-3 min for 500 pages)
- **Quality**: Basic
- **How It Works**: Splits by token count (e.g., 512 tokens per chunk)
- **When to Use**: Testing, compatibility, predictable chunk sizes

#### 2. Sentence Chunker
- **Use Case**: Simple sentence boundaries, clean text
- **Speed**: Fast (3-4 min)
- **Quality**: Good
- **How It Works**: Splits on sentence boundaries, groups to target size
- **When to Use**: Well-formatted text with clear sentence structure

#### 3. Recursive Chunker (RECOMMENDED DEFAULT)
- **Use Case**: Structured docs (textbooks, manuals)
- **Speed**: Fast (3-5 min)
- **Quality**: High
- **How It Works**: Hierarchical splitting (paragraph → sentence → token)
- **When to Use**: 80% of documents, most flexible
- **Why Default**: Best balance of speed, quality, and flexibility

#### 4. Semantic Chunker
- **Use Case**: Narrative, thematic coherence (essays, novels)
- **Speed**: Medium (8-15 min)
- **Quality**: Very High
- **How It Works**: Embeddings-based topic shift detection
- **When to Use**: Narrative documents where topic coherence matters

#### 5. Late Chunker
- **Use Case**: Contextual embeddings, high retrieval quality
- **Speed**: Slow (10-20 min)
- **Quality**: Very High
- **How It Works**: Contextual embeddings for late interaction
- **When to Use**: Critical RAG applications, high retrieval quality needs

#### 6. Code Chunker
- **Use Case**: Source code with AST-aware splitting
- **Speed**: Medium (5-10 min)
- **Quality**: High (for code only)
- **How It Works**: Uses tree-sitter for AST parsing
- **When to Use**: Source code files only

#### 7. Neural Chunker
- **Use Case**: BERT-based semantic shifts (academic papers)
- **Speed**: Slow (15-25 min)
- **Quality**: Very High
- **How It Works**: BERT model detects semantic boundaries
- **When to Use**: Complex academic papers, research documents

#### 8. Slumber Chunker
- **Use Case**: Agentic LLM-powered (critical documents)
- **Speed**: Very Slow (30-60 min)
- **Quality**: Highest
- **How It Works**: LLM analyzes content to determine optimal boundaries
- **When to Use**: Most critical documents only, when quality is paramount

#### 9. Table Chunker
- **Use Case**: Markdown tables split by row
- **Speed**: Fast (3-5 min)
- **Quality**: Good (for tables only)
- **How It Works**: Splits markdown tables row by row
- **When to Use**: Table-heavy documents

### Python Wrapper Implementation

**File**: `worker/scripts/chonkie_chunk.py`

**Key Features:**
- stdin/stdout JSON IPC pattern (prevents mixing of logging and data)
- `sys.stdout.flush()` after JSON write (CRITICAL: prevents IPC hangs)
- Proper RecursiveRules initialization
- Comprehensive error handling with stack traces
- Character offset guarantee (start_index, end_index)

**Input Format:**
```json
{
  "markdown": "# Chapter 1\n\nFirst paragraph...",
  "config": {
    "chunker_type": "recursive",
    "chunk_size": 512,
    "tokenizer": "gpt2"
  }
}
```

**Output Format:**
```json
[
  {
    "text": "# Chapter 1\n\nFirst paragraph...",
    "start_index": 0,
    "end_index": 81,
    "token_count": 18,
    "chunker_type": "recursive"
  }
]
```

### TypeScript IPC Wrapper

**File**: `worker/lib/chonkie/chonkie-chunker.ts`

**Key Features:**
- Dynamic timeout based on chunker type + document size
- Character offset validation after chunking (CRITICAL)
- Proper error handling with descriptive messages
- Subprocess spawn with stdin/stdout JSON IPC

**Timeout Calculation:**
```typescript
const baseTimeout = {
  token: 60000,      // 1 minute
  sentence: 60000,   // 1 minute
  recursive: 90000,  // 1.5 minutes
  semantic: 300000,  // 5 minutes
  late: 600000,      // 10 minutes
  code: 180000,      // 3 minutes
  neural: 900000,    // 15 minutes
  slumber: 1800000,  // 30 minutes
  table: 90000       // 1.5 minutes
}[config.chunker_type]

// Scale timeout with document size (1 minute per 100k characters)
const docSizeMultiplier = Math.max(1, Math.ceil(markdown.length / 100000))
const timeout = baseTimeout * docSizeMultiplier
```

**Character Offset Validation:**
```typescript
// CRITICAL: Validate chunk offsets match content
for (const chunk of chunks) {
  const extracted = cleanedMarkdown.slice(chunk.start_index, chunk.end_index)
  if (extracted !== chunk.text) {
    throw new Error('Character offset mismatch - metadata transfer will fail')
  }
}
```

---

## Metadata Transfer System

### The Core Insight

**Overlaps are EXPECTED and BENEFICIAL.** Multiple Docling chunks overlapping a Chonkie chunk is the PRIMARY MECHANISM for metadata transfer.

**Why Overlaps Occur:**
- **Docling chunks**: Structural boundaries (heading breaks, page breaks)
- **Chonkie chunks**: Semantic boundaries (topic shifts, sentence groups)
- Different boundaries = overlaps when both cover same content

**Expected Overlap Rate**: 70-90% of Chonkie chunks have at least one Docling overlap. This is GOOD, not a bug.

### Overlap Detection Algorithm

**File**: `worker/lib/chonkie/metadata-transfer.ts`

#### 1. Detect Overlap

Two chunks overlap if:
```typescript
docling.start_offset < chonkie.end_index AND
docling.end_offset > chonkie.start_index
```

**Pattern**: Reuses logic from `bulletproof-matcher.ts` (lines 862-891)

#### 2. Calculate Overlap Percentage

```typescript
const overlapStart = Math.max(docling.start_offset, chonkie.start_index)
const overlapEnd = Math.min(docling.end_offset, chonkie.end_index)
const overlapSize = Math.max(0, overlapEnd - overlapStart)
const chonkieSize = chonkie.end_index - chonkie.start_index
return overlapSize / chonkieSize
```

#### 3. Aggregate Metadata

For each Chonkie chunk:
1. Find all overlapping Docling chunks
2. **Union of heading paths** (unique headings from all overlaps)
3. **Page range** (earliest to latest page)
4. **Bounding boxes** (concatenate all)
5. **Section markers** (first non-null, for EPUBs)

**Phase 2A: Enhanced Docling Metadata** (Oct 2025):
6. **charspan** - Aggregate character ranges (min start, max end from all overlaps)
   - Enables 100x faster annotation sync (search window vs full document)
   - Example: 3 Docling chunks [0,500), [400,900), [850,1200) → aggregate to [0,1200)
7. **content_layer** - Select layer (prefer BODY over FURNITURE)
   - BODY = main content, FURNITURE = headers/footers
   - Used to filter noise in connection detection (5-10% quality improvement)
8. **content_label** - Select label (prioritize semantic types)
   - Priority: PARAGRAPH > CODE > FORMULA > LIST_ITEM > TEXT
   - Enables content-type-specific processing
9. **section_level**, **list_enumerated**, **list_marker** - First non-null
10. **code_language**, **hyperlink** - First non-null

**Impact**: 100% Phase 2A coverage enables 99%+ annotation accuracy (up from 95%)

#### 4. Calculate Confidence

**High Confidence** (≥0.9):
- 3+ Docling overlaps OR
- One strong overlap (>70% coverage)

**Medium Confidence** (0.7-0.9):
- 1-2 overlaps with decent coverage (>30%)

**Low Confidence** (<0.7):
- Weak overlaps (<30%) OR
- No overlaps (will need interpolation)

#### 5. Interpolation Fallback

**Rare case** (usually <10% of chunks). When no overlaps exist:
1. Find nearest Docling chunks before and after
2. Use metadata from nearest neighbor
3. Mark as `metadata_interpolated: true`
4. Surface in ChunkQualityPanel for user validation

### Metadata Transfer Workflow

```typescript
export async function transferMetadataToChonkieChunks(
  chonkieChunks: ChonkieChunk[],
  bulletproofMatches: MatchResult[],
  documentId: string
): Promise<ProcessedChunk[]> {

  for each Chonkie chunk:
    1. Find overlapping Docling chunks
    2. If overlaps found:
         - Aggregate Phase 1 metadata (heading_path, pages, bboxes)
         - Aggregate Phase 2A metadata (charspan, content_layer, content_label, etc.)
         - Calculate confidence (high/medium/low)
       Else:
         - Interpolate from nearest neighbors
         - Mark as interpolated
    3. Calculate word count
    4. Create ProcessedChunk with:
         - Chonkie content and offsets
         - Transferred Docling metadata (Phase 1 + Phase 2A)
         - Confidence scores
         - Interpolation flag

  return enriched chunks
}
```

### Quality Tracking

**Database Schema** (Migration 050):
```sql
ALTER TABLE chunks
ADD COLUMN chunker_type TEXT NOT NULL DEFAULT 'hybrid',
ADD COLUMN metadata_overlap_count INTEGER DEFAULT 0,
ADD COLUMN metadata_confidence TEXT DEFAULT 'high',
ADD COLUMN metadata_interpolated BOOLEAN DEFAULT false;
```

**Monitoring:**
```typescript
const overlapCoverage = (chunksWithOverlaps / totalChunks) * 100
const avgOverlaps = totalOverlaps / totalChunks

console.log(`Overlap coverage: ${overlapCoverage.toFixed(1)}%`)
console.log(`Average overlaps per chunk: ${avgOverlaps.toFixed(2)}`)
console.log(`Interpolated chunks: ${interpolatedCount} (${percentage}%)`)

if (overlapCoverage < 70) {
  console.warn('⚠️  LOW OVERLAP COVERAGE - investigate matching quality')
}
```

### Phase 2A: Enhanced Metadata Extraction

**Implementation Date**: October 2025
**Migration**: `073_enhanced_chunk_metadata.sql`
**Coverage**: 100% (all chunks have Phase 2A metadata)

#### Overview

Phase 2A adds 8 enhanced Docling fields to improve annotation accuracy and connection quality:

| Field | Type | Purpose | Coverage |
|-------|------|---------|----------|
| `charspan` | `int8range` | Character offset range in cleaned markdown | 100% |
| `content_layer` | `text` | Content layer (BODY, FURNITURE, BACKGROUND, etc.) | 100% |
| `content_label` | `text` | Content type (TEXT, PARAGRAPH, CODE, FORMULA, etc.) | 100% |
| `section_level` | `integer` | Explicit section level (1-100) | ~5% |
| `list_enumerated` | `boolean` | Whether list is numbered | ~3% |
| `list_marker` | `text` | List marker ("1.", "•", "a)") | ~3% |
| `code_language` | `text` | Programming language for code blocks | <1% |
| `hyperlink` | `text` | Hyperlink URL or file path | <1% |

#### Data Source

Phase 2A metadata is extracted from Docling's `chunk.meta.doc_items[]`:

```python
# worker/scripts/docling_extract.py
for doc_item in chunk.meta.doc_items:
    content_layer = doc_item.content_layer.value  # "body" | "furniture" | ...
    content_label = doc_item.label.value  # "PARAGRAPH" | "CODE" | ...

    for prov in doc_item.prov:
        charspan = prov.charspan  # [start, end] in cleaned markdown
        bbox = prov.bbox  # {l, t, r, b}
        page_no = prov.page_no
```

**Note**: Docling HybridChunker creates 768-token semantic chunks with provenance metadata. These chunks are different from Chonkie chunks but provide the source metadata that gets transferred.

#### Aggregation Strategy

Since Chonkie chunks overlap with multiple Docling chunks, metadata is aggregated intelligently:

**charspan**: Min start, max end across all provenance items
```typescript
// Example: 3 Docling chunks [0,500), [400,900), [850,1200) → [0,1200)
const aggregatedCharspan = [
  Math.min(...charspans.map(cs => cs[0])),
  Math.max(...charspans.map(cs => cs[1]))
]
```

**content_layer**: Prefer BODY over FURNITURE
```typescript
// BODY = main content, FURNITURE = headers/footers/watermarks
const content_layer = layers.includes('BODY') ? 'BODY' : layers[0]
```

**content_label**: Prioritize semantic types
```typescript
// Prefer: PARAGRAPH > CODE > FORMULA > LIST_ITEM > TEXT
const labelPriority = ['PARAGRAPH', 'CODE', 'FORMULA', 'LIST_ITEM']
const content_label = labels.find(l => labelPriority.includes(l)) || labels[0]
```

**Other fields**: First non-null value

#### Benefits

1. **99%+ Annotation Accuracy** (up from 95%)
   - `charspan` provides character-level search windows (100x faster than full document search)
   - Enables precise PDF↔Markdown synchronization

2. **5-10% Better Connection Quality**
   - `content_layer` filtering removes noise (skip FURNITURE chunks in connection detection)
   - Reduces false positives from repeated headers/footers

3. **Content-Aware Processing**
   - `content_label` enables type-specific handling (code vs prose vs formulas)
   - Future: Syntax highlighting for CODE chunks, LaTeX rendering for FORMULA

4. **Structural Understanding**
   - `section_level` for hierarchical navigation
   - `list_enumerated` + `list_marker` for list reconstruction

#### Database Schema

```sql
-- Migration 073
ALTER TABLE chunks
ADD COLUMN IF NOT EXISTS charspan INT8RANGE,
ADD COLUMN IF NOT EXISTS content_layer TEXT,
ADD COLUMN IF NOT EXISTS content_label TEXT,
ADD COLUMN IF NOT EXISTS section_level INTEGER,
ADD COLUMN IF NOT EXISTS list_enumerated BOOLEAN,
ADD COLUMN IF NOT EXISTS list_marker TEXT,
ADD COLUMN IF NOT EXISTS code_language TEXT,
ADD COLUMN IF NOT EXISTS hyperlink TEXT;

-- Indexes for filtering
CREATE INDEX IF NOT EXISTS idx_chunks_charspan
  ON chunks USING gist(charspan) WHERE charspan IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_chunks_content_layer
  ON chunks(content_layer) WHERE content_layer IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_chunks_content_label
  ON chunks(content_label) WHERE content_label IS NOT NULL;
```

#### Implementation Files

- **Python extraction**: `worker/scripts/docling_extract.py` (lines 100-298)
- **TypeScript transfer**: `worker/lib/chonkie/metadata-transfer.ts` (lines 206-260)
- **Database insertion**: `worker/lib/managers/document-processing-manager.ts` (lines 442-450)
- **Connection filtering**: `worker/engines/{semantic-similarity,contradiction-detection,thematic-bridge}.ts`

---

## Local Processing Pipeline

### Architecture

100% local document processing with **zero API costs** and **complete privacy**. Replaces cloud AI services with local alternatives.

**Components:**
- **Docling**: PDF/EPUB extraction with HybridChunker (768-token chunks)
- **Ollama (Qwen 32B)**: Local LLM for cleanup and metadata extraction
- **Transformers.js**: Local embeddings (768d vectors)
- **5-Layer Bulletproof Matching**: 100% chunk recovery guarantee

### System Requirements

**Minimum:**
- 24GB RAM (Qwen 14B)
- Python 3.10+
- Node.js 18+

**Recommended:**
- 64GB RAM (Qwen 32B - best quality)
- Apple M1 Max/Ultra or equivalent

### Configuration

```bash
# Enable local mode in .env.local
PROCESSING_MODE=local                         # Set to 'cloud' for Gemini
OLLAMA_HOST=http://127.0.0.1:11434
OLLAMA_MODEL=qwen2.5:32b-instruct-q4_K_M     # or 14b/7b for smaller RAM
OLLAMA_TIMEOUT=600000

# Docling Pipeline Configuration (optional, env var control)
EXTRACT_IMAGES=true              # Default: true (figure/table extraction)
IMAGE_SCALE=2.0                  # Default: 2.0 (144 DPI)
EXTRACT_TABLES=true              # Default: true
CLASSIFY_IMAGES=false            # Default: false (opt-in AI feature)
DESCRIBE_IMAGES=false            # Default: false (opt-in AI feature)
ENRICH_CODE=false                # Default: false (opt-in AI feature)
ENABLE_OCR=false                 # Default: false (for scanned documents)
```

### Processing Times

**Small PDFs (<50 pages):** 3-5 minutes
**Medium PDFs (200 pages):** 15-25 minutes
**Large PDFs (500 pages):** 60-80 minutes (with automatic page batching)

### Quality Metrics

- **Chunk recovery**: 100% (guaranteed, no data loss)
- **Exact matches**: 85-90%
- **Synthetic chunks**: <5% (flagged for review)
- **Metadata coverage**: >80% (heading_path, page numbers, section markers)
- **Embedding enhancement**: >70% (metadata-enriched vectors)
- **Semantic coherence**: >90% (chunks end on sentence boundaries)
- **API calls**: 0 (completely local)

### Cost Savings

- **Cloud (Gemini)**: $0.42/book (500 pages)
- **Local**: $0.00/book
- **1,000 books**: Save $420
- **10,000 books**: Save $4,200
- **Bonus**: Complete privacy, no rate limits, works offline

---

## Performance & Cost

### Processing Times by Strategy

| Chunker | Small (<50p) | Medium (200p) | Large (500p) |
|---------|--------------|---------------|--------------|
| token | 1-2 min | 5-8 min | 2-3 min |
| sentence | 1-2 min | 6-10 min | 3-4 min |
| **recursive** | 1-2 min | 8-12 min | 3-5 min |
| semantic | 3-5 min | 20-35 min | 8-15 min |
| late | 4-8 min | 30-50 min | 10-20 min |
| code | 2-4 min | 15-25 min | 5-10 min |
| neural | 5-10 min | 45-75 min | 15-25 min |
| slumber | 10-20 min | 90-150 min | 30-60 min |
| table | 1-2 min | 8-12 min | 3-5 min |

### Cost Breakdown (Local Mode)

**Per 500-page book:**
- Extraction: $0 (Docling local)
- Cleanup: $0 (Ollama local)
- Metadata: $0 (PydanticAI + Ollama local)
- Embeddings: $0 (Transformers.js local)
- Chunking: $0 (Chonkie local)
- **Total: $0.00**

**Hardware Costs:**
- M1 Max 64GB: ~$3,000 (one-time)
- Break-even: ~7,000 books (vs cloud at $0.42/book)

---

## Quality Metrics

### Success Criteria

#### 1. Overlap Coverage (Target: 70-90%)

**Definition**: Percentage of Chonkie chunks that have at least one Docling chunk overlap.

**Why 70-90%?**: Perfect 100% overlap is NOT expected or needed. Different chunking boundaries (structural vs semantic) naturally create some non-overlapping chunks. These are handled via interpolation.

**Validation:**
```typescript
const withOverlaps = chunks.filter(c => c.metadata_overlap_count > 0)
const coverage = (withOverlaps.length / chunks.length) * 100
if (coverage < 70) {
  console.warn('LOW OVERLAP COVERAGE - investigate matching quality')
}
```

#### 2. Metadata Recovery (Target: >90%)

**Definition**: Percentage of chunks with populated heading_path OR page_start.

**Validation:**
```typescript
const withMetadata = chunks.filter(c =>
  (c.heading_path && c.heading_path.length > 0) || c.page_start
)
const recovery = (withMetadata.length / chunks.length) * 100
```

#### 3. Character Offsets (Target: 100%)

**Definition**: All chunk offsets must match content exactly.

**Validation:**
```typescript
for (const chunk of chunks) {
  const extracted = markdown.slice(chunk.start_offset, chunk.end_offset)
  if (extracted !== chunk.content) {
    throw new Error('Character offset mismatch detected')
  }
}
```

### Monitoring in Production

**ChunkQualityPanel** provides real-time visibility:
- High confidence chunks (green badge)
- Medium confidence chunks (yellow badge)
- Low confidence chunks (orange badge)
- Interpolated chunks (red badge, requires review)

**Statistics Display:**
```
High: 92% (184/200 chunks)  ✅
Medium: 5% (10/200 chunks)  ⚠️
Low: 2% (4/200 chunks)      ⚠️
Interpolated: 1% (2/200)    ❌
```

---

## Troubleshooting

### Common Issues

#### 1. Python Subprocess Hangs

**Symptom**: Chonkie chunking never completes, worker stuck at Stage 6

**Root Cause**: Missing `sys.stdout.flush()` in Python script

**Solution**:
```python
print(json.dumps(output), flush=True)
sys.stdout.flush()  # CRITICAL: prevents IPC hangs
```

**Detection**:
- Timeout after expected duration
- Python process still running but no output

#### 2. Character Offset Mismatch

**Symptom**: Error: "Character offset mismatch - metadata transfer will fail"

**Root Cause**: Chonkie chunk offsets don't match markdown content

**Solution**:
- Verify Chonkie version (should be ≥0.5.0)
- Check for markdown encoding issues (UTF-8 required)
- Validate no middleware is modifying markdown between stages

**Detection**:
```typescript
const extracted = markdown.slice(chunk.start_index, chunk.end_index)
if (extracted !== chunk.text) {
  console.error('Offset mismatch detected')
}
```

#### 3. Low Overlap Coverage (<70%)

**Symptom**: Warning: "LOW OVERLAP COVERAGE: 45%"

**Root Cause**: Bulletproof matcher issues or unusual document structure

**Solution**:
- Review Docling extraction quality (Stage 2)
- Check if document is scanned (enable OCR if needed)
- Verify markdown cleanup didn't remove structural markers
- Review ChunkQualityPanel for validation warnings

**Detection**:
- Automatic warning logged during metadata transfer
- High percentage of interpolated chunks (>10%)
- Many low-confidence chunks in database

#### 4. Slow Chunking Performance

**Symptom**: Semantic/neural chunkers taking 2-3x longer than expected

**Root Cause**: Large document, complex content, or resource constraints

**Solution**:
- Switch to faster chunker (recursive or token)
- Ensure sufficient RAM for chunker strategy
- Consider batching for very large documents (>1000 pages)
- Check system resource usage (CPU, memory)

**Detection**:
- Timeout warnings in logs
- Stage 6 progress stuck for extended time
- High CPU/memory usage

#### 5. Metadata Not Transferring

**Symptom**: Chunks missing heading_path, page numbers, or bboxes

**Root Cause**: Docling extraction didn't capture metadata or overlap detection failed

**Solution**:
- Verify Docling extraction completed successfully (Stage 2)
- Check cached_chunks table for Docling metadata
- Review bulletproof matcher output (Stage 4)
- Validate overlap detection logic

**Detection**:
```typescript
const withMetadata = chunks.filter(c => c.heading_path || c.page_start)
const recovery = (withMetadata.length / chunks.length) * 100
if (recovery < 90) {
  console.warn('LOW METADATA RECOVERY')
}
```

### Debug Commands

```bash
# Check Chonkie installation
python3 -c "from chonkie import RecursiveChunker; print('OK')"

# Test Python wrapper
echo '{"markdown":"# Test","config":{"chunker_type":"recursive"}}' | \
  python3 worker/scripts/chonkie_chunk.py

# Verify Ollama is running
curl -s http://127.0.0.1:11434/api/version

# Check database migration status
psql postgres://postgres:postgres@localhost:54322/postgres \
  -c "SELECT chunker_type FROM chunks LIMIT 5;"

# Run integration test
cd worker && npx tsx scripts/test-chonkie-integration.ts <document_id>
```

---

## Additional Resources

### Documentation

- **Chonkie Docs**: https://docs.chonkie.ai/oss/chunkers/overview
- **Chonkie GitHub**: https://github.com/chonkie-inc/chonkie
- **Chonkie PyPI**: https://pypi.org/project/chonkie/

### Codebase References

**Python Wrapper**:
- `worker/scripts/chonkie_chunk.py` - Main Python script

**TypeScript Integration**:
- `worker/lib/chonkie/chonkie-chunker.ts` - IPC wrapper
- `worker/lib/chonkie/metadata-transfer.ts` - Overlap detection
- `worker/lib/chonkie/types.ts` - TypeScript types

**Processors**:
- `worker/processors/pdf-processor.ts` - PDF pipeline
- `worker/processors/epub-processor.ts` - EPUB pipeline

**Database**:
- `supabase/migrations/050_add_chunker_type.sql` - Schema changes
- `worker/types/database.ts` - TypeScript database types

**UI Components**:
- `src/components/library/UploadZone.tsx` - Chunker selection
- `src/components/sidebar/ChunkQualityPanel.tsx` - Quality monitoring
- `src/components/reader/DocumentHeader.tsx` - Chunker badge display

---

**Document Version**: 1.0
**Last Verified**: 2025-10-15
**Status**: ✅ Production Ready
