# Chonkie Integration - Unified Processing Pipeline

**Status**: Ready for Implementation
**Created**: 2025-10-15
**Priority**: P0 (Critical - Architecture Simplification)
**Estimated Effort**: 3 weeks
**Confidence Score**: 9/10

---

## Executive Summary

**Goal**: Eliminate 3 parallel chunking paths and replace with ONE unified Chonkie-based pipeline that offers 9 user-selectable chunking strategies while maintaining metadata preservation and zero API costs.

### Current Architecture (3 Parallel Paths)

```
BEFORE:
├─ Inline metadata (PDF only, experimental)
├─ Bulletproof matching (LOCAL mode, 5-layer recovery)
└─ Cloud chunking (CLOUD mode, Gemini)
```

### New Architecture (1 Unified Path)

```
AFTER:
Download → Docling Extract → Cleanup → Bulletproof (coord map) →
Review → Chonkie Chunk → Metadata Transfer → Enrich → Embed → Save
```

### Key Decisions

- ✅ **ALWAYS run Chonkie** (no fast paths, no branching, no CLOUD/LOCAL split)
- ✅ **Docling chunks = metadata anchors** (heading_path, pages, bboxes)
- ✅ **Chonkie chunks = actual chunks** (search, connections, annotations)
- ✅ **Bulletproof matcher = coordinate mapper** (helps metadata transfer via overlap detection)
- ✅ **9 chunker strategies** (Token → Recursive → Semantic → Neural → Slumber)
- ✅ **Backward compatibility = not a concern** (no important existing documents)

### Business Impact

- **Simplicity**: -223 lines net code (remove 823, add 600)
- **Flexibility**: 9 chunking strategies for different document types
- **Quality**: 15%+ connection quality improvement (semantic/neural chunkers)
- **Cost**: $0 additional (all LOCAL mode processing)
- **Maintenance**: Single pipeline = easier debugging, testing, optimization

---

## Business Context

### Problem Statement

The current processing pipeline has 3 parallel chunking paths:

1. **Inline Metadata** (experimental, PDF only): HTML comment markers for perfect sync
2. **Bulletproof Matcher** (LOCAL mode): 5-layer recovery system for chunk remapping
3. **Cloud Chunking** (CLOUD mode): Gemini's semantic chunking

**Issues**:
- Complex branching logic (if LOCAL vs CLOUD, if inline metadata enabled, if bulletproof fallback needed)
- Duplicate code (~823 lines across processors)
- Hard to maintain (fix bug in one path, forget others)
- Limited flexibility (users can't choose chunking strategy)

### Solution

**ONE unified pipeline** where Chonkie handles ALL chunking:
- Eliminate CLOUD/LOCAL branching (everything uses same path)
- Remove inline metadata (simplify to one approach)
- Repurpose bulletproof matcher as coordinate mapper (not a chunking system)
- Offer 9 Chonkie strategies (users choose quality vs speed)

### Value Proposition

**For Users**:
- Choose optimal chunker for document type (narrative → Semantic, technical → Recursive)
- Better connection quality (semantic chunkers group related content)
- Consistent experience (no mode differences)

**For Developers**:
- -223 lines of code (simpler codebase)
- Single pipeline to test/debug/optimize
- Easier to add features (affects all documents equally)

### User Journey

```
Before:
User uploads PDF → System picks path (inline? bulletproof? cloud?) → Results vary by mode

After:
User uploads PDF → User selects chunker (Recursive, Semantic, etc.) → Predictable results
```

---

## Technical Architecture

### The New 10-Stage Pipeline

```
┌─────────────────────────────────────────────────────┐
│ Stage 1: Download (10-15%)                         │
│  • Fetch PDF/EPUB from Supabase Storage           │
└──────────────┬──────────────────────────────────────┘
               │
┌──────────────▼──────────────────────────────────────┐
│ Stage 2: Docling Extraction (15-50%)               │
│  • ALWAYS run HybridChunker (768 tokens)           │
│  • Save to cached_chunks table                     │
│  • Purpose: Metadata anchors (pages, headings,     │
│    bboxes, section markers)                        │
│  • Output: ~382 chunks with structural metadata    │
└──────────────┬──────────────────────────────────────┘
               │
┌──────────────▼──────────────────────────────────────┐
│ Stage 3: Cleanup (50-70%)                          │
│  • Local regex cleanup                             │
│  • Optional AI cleanup (Ollama if available)       │
│  • Output: Cleaned markdown for Chonkie            │
└──────────────┬──────────────────────────────────────┘
               │
┌──────────────▼──────────────────────────────────────┐
│ Stage 4: Bulletproof Matching (70-72%)             │
│  • Map Docling chunks → cleaned markdown positions │
│  • 5-layer system creates coordinate map           │
│  • Purpose: Know where metadata lives in cleaned   │
│    markdown so we can detect overlaps              │
│  • Output: MatchResult[] with offsets              │
└──────────────┬──────────────────────────────────────┘
               │
┌──────────────▼──────────────────────────────────────┐
│ Stage 5: Review Checkpoint (Optional, 72%)        │
│  • Skip if reviewBeforeChunking=false              │
└──────────────┬──────────────────────────────────────┘
               │
┌──────────────▼──────────────────────────────────────┐
│ Stage 6: Chonkie Chunking (72-75%)                 │
│  • ALWAYS run (no fast paths)                      │
│  • User selects strategy:                          │
│    - token (fixed-size, fastest)                   │
│    - sentence (sentence boundaries, simple)        │
│    - recursive (structural, default)               │
│    - semantic (topic shifts, narrative)            │
│    - late (contextual embeddings, quality)         │
│    - code (AST-aware, source code)                 │
│    - neural (BERT-based, academic)                 │
│    - slumber (agentic LLM, highest quality)        │
│    - table (markdown tables, row-based)            │
│  • Chunk from cleaned markdown                     │
│  • Output: ~350-420 chunks (semantic boundaries)   │
└──────────────┬──────────────────────────────────────┘
               │
┌──────────────▼──────────────────────────────────────┐
│ Stage 7: Overlap Metadata Transfer (75-77%)       │
│  • For each Chonkie chunk:                         │
│    1. Find overlapping Docling chunks via offsets  │
│    2. Aggregate metadata (headings, pages, bboxes) │
│    3. Calculate confidence based on overlap count/ │
│       percentage                                    │
│  • Overlap detection reuses bulletproof matcher    │
│    logic (lines 862-891)                           │
│  • Expected: 1-3 Docling overlaps per Chonkie chunk│
│  • High overlap = good (means metadata transfers)  │
└──────────────┬──────────────────────────────────────┘
               │
┌──────────────▼──────────────────────────────────────┐
│ Stage 8: Metadata Enrichment (77-90%)             │
│  • PydanticAI + Ollama                            │
│  • Extract themes, concepts, domains, emotions     │
│  • Same for all chunker strategies                 │
└──────────────┬──────────────────────────────────────┘
               │
┌──────────────▼──────────────────────────────────────┐
│ Stage 9: Embeddings Generation (90-95%)           │
│  • Transformers.js (local, 768d)                   │
│  • Metadata-enhanced (heading context prepended)   │
│  • Same for all chunker strategies                 │
└──────────────┬──────────────────────────────────────┘
               │
┌──────────────▼──────────────────────────────────────┐
│ Stage 10: Finalize (95-100%)                       │
│  • Save to database with chunker_type              │
│  • Queue connection detection                      │
└─────────────────────────────────────────────────────┘
```

### Component Roles

**Docling (Stage 2)**:
- Role: Metadata extraction
- Output: Chunks with heading_path, page numbers, bboxes
- NOT actual chunks (just metadata anchors)

**Bulletproof Matcher (Stage 4)**:
- Role: Coordinate mapper
- Output: MatchResult[] showing where Docling chunks map to cleaned markdown
- NOT a chunking system (repurposed from old role)

**Chonkie (Stage 6)**:
- Role: Actual chunking
- Output: Final chunks used for search, connections, annotations
- 9 strategies for different use cases

**Metadata Transfer (Stage 7)**:
- Role: Bridge between Docling and Chonkie
- Mechanism: Overlap detection (reuse bulletproof matcher logic)
- Output: Chonkie chunks with Docling metadata

---

## Chonkie Integration Details

### 9 Chunker Strategies

| **Chunker** | **Use Case** | **Speed** | **Quality** |
|------------|--------------|-----------|-------------|
| **token** | Fixed-size chunks, compatibility fallback | Fastest (2-3 min) | Basic |
| **sentence** | Simple sentence boundaries, clean text | Fast (3-4 min) | Good |
| **recursive** | Structured docs (textbooks, manuals) | Fast (3-5 min) | **Recommended default** |
| **semantic** | Narrative, thematic coherence (essays, novels) | Medium (8-15 min) | High |
| **late** | Contextual embeddings, high retrieval quality | Slow (10-20 min) | Very High |
| **code** | Source code with AST-aware splitting | Medium (5-10 min) | High (code only) |
| **neural** | BERT-based semantic shifts (academic papers) | Slow (15-25 min) | Very High |
| **slumber** | Agentic LLM-powered (critical documents) | Very Slow (30-60 min) | Highest |
| **table** | Markdown tables split by row | Fast (3-5 min) | Good (tables only) |

**Recommendation**: Start with **recursive** as default (fastest, most flexible, works for 80% of documents).

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

### Python Wrapper Implementation

**File**: `worker/scripts/chonkie_chunk.py`

```python
#!/usr/bin/env python3
"""
Chonkie multi-strategy chunking for Rhizome V2.
Supports 9 chunker types: token, sentence, recursive, semantic, late, code, neural, slumber, table.

CRITICAL: sys.stdout.flush() after JSON write (prevents IPC hangs)

External docs: https://docs.chonkie.ai/oss/chunkers/overview
"""

import sys
import json
from chonkie import (
    TokenChunker,
    SentenceChunker,
    RecursiveChunker,
    RecursiveRules,
    SemanticChunker,
    LateChunker,
    CodeChunker,
    NeuralChunker,
    SlumberChunker,
    TableChunker
)

CHUNKERS = {
    'token': TokenChunker,
    'sentence': SentenceChunker,
    'recursive': RecursiveChunker,
    'semantic': SemanticChunker,
    'late': LateChunker,
    'code': CodeChunker,
    'neural': NeuralChunker,
    'slumber': SlumberChunker,
    'table': TableChunker
}

def main():
    try:
        input_data = json.loads(sys.stdin.read())
        markdown = input_data["markdown"]
        config = input_data.get("config", {})
        chunker_type = config.get("chunker_type", "recursive")

        # Get chunker class
        ChunkerClass = CHUNKERS.get(chunker_type)
        if not ChunkerClass:
            raise ValueError(f"Unknown chunker type: {chunker_type}. Valid types: {', '.join(CHUNKERS.keys())}")

        # Initialize chunker with common config
        chunker_config = {
            "tokenizer": config.get("tokenizer", "gpt2"),
            "chunk_size": config.get("chunk_size", 512)
        }

        # Add chunker-specific config
        if chunker_type == 'recursive':
            # Use RecursiveRules for hierarchical splitting
            # Default: paragraph → sentence → token
            rules_config = config.get("rules")
            if rules_config:
                chunker_config["rules"] = RecursiveRules(rules_config)
            elif config.get("recipe"):
                # Pre-configured rules: "markdown", "default"
                chunker = RecursiveChunker(
                    tokenizer=chunker_config["tokenizer"],
                    chunk_size=chunker_config["chunk_size"],
                    recipe=config["recipe"]
                )
            else:
                # Default rules
                rules = RecursiveRules([
                    {"delimiters": ["\n\n"], "includeDelim": "prev"},  # Paragraphs
                    {"delimiters": [". ", "! ", "? "], "includeDelim": "prev"},  # Sentences
                    {}  # Token fallback
                ])
                chunker_config["rules"] = rules

        elif chunker_type == 'semantic':
            chunker_config["embedding_model"] = config.get(
                "embedding_model",
                "all-MiniLM-L6-v2"
            )
            chunker_config["similarity_threshold"] = config.get("threshold", "auto")

        elif chunker_type == 'late':
            chunker_config["embedding_model"] = config.get(
                "embedding_model",
                "all-MiniLM-L6-v2"
            )
            chunker_config["mode"] = config.get("mode", "sentence")

        elif chunker_type == 'neural':
            chunker_config["model"] = config.get("model", "mirth/chonky_modernbert_base_1")

        elif chunker_type == 'slumber':
            chunker_config["genie"] = config.get("genie", "gemini")  # or "openai"

        elif chunker_type == 'code':
            chunker_config["language"] = config.get("language", "python")
            chunker_config["include_nodes"] = config.get("include_nodes", False)

        elif chunker_type == 'sentence':
            chunker_config["min_sentences_per_chunk"] = config.get("min_sentences", 1)

        # Initialize and chunk
        if 'chunker' not in locals():
            chunker = ChunkerClass(**chunker_config)
        chunks = chunker.chunk(markdown)

        # Format output with guaranteed character offsets
        output = [
            {
                "text": chunk.text,
                "start_index": chunk.start_index,  # Character offset in original markdown
                "end_index": chunk.end_index,      # Character offset in original markdown
                "token_count": chunk.token_count,
                "chunker_type": chunker_type
            }
            for chunk in chunks
        ]

        print(json.dumps(output), flush=True)
        sys.stdout.flush()  # CRITICAL: prevents IPC hangs
        sys.exit(0)

    except Exception as e:
        print(f"ERROR: {e}", file=sys.stderr, flush=True)
        import traceback
        print(traceback.format_exc(), file=sys.stderr, flush=True)
        sys.exit(1)

if __name__ == "__main__":
    main()
```

### TypeScript IPC Wrapper

**File**: `worker/lib/chonkie/chonkie-chunker.ts`

```typescript
import { spawn } from 'child_process'
import * as path from 'path'

export type ChonkieStrategy =
  | 'token'      // Fixed-size chunks, compatibility fallback
  | 'sentence'   // Sentence boundaries, simple and fast
  | 'recursive'  // Hierarchical splitting (recommended default)
  | 'semantic'   // Topic shifts, narrative coherence
  | 'late'       // Contextual embeddings, high quality
  | 'code'       // AST-aware code splitting
  | 'neural'     // BERT-based semantic shifts
  | 'slumber'    // Agentic LLM-powered (highest quality)
  | 'table'      // Markdown table splitting

export interface ChonkieConfig {
  chunker_type: ChonkieStrategy
  chunk_size?: number  // Default: 512 (768 optional for alignment)
  tokenizer?: string   // Default: "gpt2"

  // Recursive-specific
  rules?: any[]
  recipe?: 'markdown' | 'default'

  // Semantic/Late-specific
  embedding_model?: string  // Default: "all-MiniLM-L6-v2"
  threshold?: number | 'auto'  // Semantic only
  mode?: 'sentence' | 'paragraph'  // Late only

  // Neural-specific
  model?: string  // Default: "mirth/chonky_modernbert_base_1"

  // Slumber-specific
  genie?: 'gemini' | 'openai'

  // Code-specific
  language?: string  // e.g., "python", "javascript", "typescript"
  include_nodes?: boolean

  // Sentence-specific
  min_sentences?: number

  // General
  timeout?: number  // Milliseconds (default: varies by chunker)
}

export interface ChonkieChunk {
  text: string
  start_index: number  // Character offset in original markdown
  end_index: number    // Character offset in original markdown
  token_count: number
  chunker_type: ChonkieStrategy
}

/**
 * Chunk markdown using Chonkie via Python subprocess IPC.
 *
 * PATTERN: Based on worker/lib/local/ollama-cleanup.ts (subprocess wrapper)
 *
 * @param cleanedMarkdown - Markdown text to chunk
 * @param config - Chunker configuration
 * @returns Array of chunks with guaranteed character offsets
 */
export async function chunkWithChonkie(
  cleanedMarkdown: string,
  config: ChonkieConfig
): Promise<ChonkieChunk[]> {
  const scriptPath = path.join(__dirname, '../../scripts/chonkie_chunk.py')

  // Dynamic timeout based on chunker type and document size
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
  }[config.chunker_type] || 300000

  // Scale timeout with document size (1 minute per 100k characters)
  const docSizeMultiplier = Math.max(1, Math.ceil(cleanedMarkdown.length / 100000))
  const timeout = config.timeout || (baseTimeout * docSizeMultiplier)

  return new Promise((resolve, reject) => {
    const python = spawn('python3', [scriptPath])

    let stdout = ''
    let stderr = ''

    const timer = setTimeout(() => {
      python.kill()
      reject(new Error(
        `Chonkie ${config.chunker_type} timed out after ${timeout}ms. ` +
        `Document size: ${cleanedMarkdown.length} chars. ` +
        `Try reducing chunk_size or using a faster chunker (recursive, token).`
      ))
    }, timeout)

    python.stdout.on('data', (data) => {
      stdout += data.toString()
    })

    python.stderr.on('data', (data) => {
      stderr += data.toString()
      console.warn(`[Chonkie ${config.chunker_type}] ${data}`)
    })

    python.on('close', (code) => {
      clearTimeout(timer)

      if (code !== 0) {
        reject(new Error(
          `Chonkie ${config.chunker_type} failed (exit ${code}): ${stderr}\n` +
          `Stdout: ${stdout.slice(0, 500)}`
        ))
        return
      }

      try {
        const chunks: ChonkieChunk[] = JSON.parse(stdout)

        // CRITICAL: Validate chunk offsets match content
        for (const chunk of chunks) {
          const extracted = cleanedMarkdown.slice(chunk.start_index, chunk.end_index)
          if (extracted !== chunk.text) {
            console.error(
              `[Chonkie] Offset mismatch detected:\n` +
              `  Expected: "${chunk.text.slice(0, 50)}..."\n` +
              `  Got: "${extracted.slice(0, 50)}..."\n` +
              `  Offsets: [${chunk.start_index}, ${chunk.end_index})`
            )
            throw new Error('Character offset mismatch - metadata transfer will fail')
          }
        }

        console.log(`[Chonkie] ${config.chunker_type} created ${chunks.length} chunks`)
        resolve(chunks)
      } catch (err) {
        reject(new Error(
          `Failed to parse Chonkie output: ${err}\n` +
          `Output: ${stdout.slice(0, 1000)}`
        ))
      }
    })

    // Send input
    const input = JSON.stringify({ markdown: cleanedMarkdown, config })
    python.stdin.write(input)
    python.stdin.end()
  })
}
```

### TypeScript Types

**File**: `worker/lib/chonkie/types.ts`

```typescript
export type ChunkerType =
  | 'hybrid'     // Old HybridChunker (for backward compatibility, deprecated)
  | 'token'      // Chonkie TokenChunker
  | 'sentence'   // Chonkie SentenceChunker
  | 'recursive'  // Chonkie RecursiveChunker (recommended default)
  | 'semantic'   // Chonkie SemanticChunker
  | 'late'       // Chonkie LateChunker
  | 'code'       // Chonkie CodeChunker
  | 'neural'     // Chonkie NeuralChunker
  | 'slumber'    // Chonkie SlumberChunker
  | 'table'      // Chonkie TableChunker

export interface ChunkMetadata {
  heading_path: string[] | null
  page_start: number | null
  page_end: number | null
  section_marker: string | null  // For EPUBs
  bboxes: any[] | null  // For PDFs (citation support)

  // Metadata transfer quality
  metadata_overlap_count: number  // How many Docling chunks overlapped
  metadata_confidence: 'high' | 'medium' | 'low'
  metadata_interpolated: boolean  // True if no overlaps found
}

export interface ProcessedChunk extends ChunkMetadata {
  document_id: string
  content: string
  chunk_index: number
  start_offset: number
  end_offset: number
  word_count: number
  token_count: number
  chunker_type: ChunkerType

  // Existing metadata enrichment fields
  themes: string[]
  importance_score: number
  summary: string | null
  emotional_metadata: any
  conceptual_metadata: any
  domain_metadata: any | null
}
```

---

## Metadata Transfer System

### Overlap Detection Algorithm

**Key Insight**: Overlaps are EXPECTED and BENEFICIAL. Multiple Docling chunks overlapping a Chonkie chunk is the PRIMARY MECHANISM for metadata transfer.

**Why Overlaps Occur**:
- Docling chunks: Structural boundaries (heading breaks, page breaks)
- Chonkie chunks: Semantic boundaries (topic shifts, sentence groups)
- Different boundaries = overlaps when both cover same content

**Expected Overlap Rate**: 70-90% of Chonkie chunks have at least one Docling overlap. This is GOOD, not a bug.

### Overlap Detection Implementation

**File**: `worker/lib/chonkie/metadata-transfer.ts`

```typescript
import type { MatchResult } from '../local/bulletproof-matcher.js'
import type { ChonkieChunk } from './chonkie-chunker.js'
import type { ProcessedChunk } from './types.js'

/**
 * Detect if two chunks overlap.
 *
 * PATTERN: Reuses logic from bulletproof-matcher.ts (lines 862-891)
 *
 * Two chunks overlap if:
 * docling.start_offset < chonkie.end_index AND
 * docling.end_offset > chonkie.start_index
 */
export function hasOverlap(
  doclingChunk: MatchResult,
  chonkieChunk: ChonkieChunk
): boolean {
  return doclingChunk.start_offset < chonkieChunk.end_index &&
         doclingChunk.end_offset > chonkieChunk.start_index
}

/**
 * Calculate overlap percentage for confidence scoring.
 */
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

/**
 * Aggregate metadata from multiple overlapping Docling chunks.
 *
 * Strategy:
 * - heading_path: Union of all paths
 * - page_start: Earliest page
 * - page_end: Latest page
 * - bboxes: Concatenate all
 * - section_marker: First non-null (EPUBs)
 */
export function aggregateMetadata(
  overlappingChunks: MatchResult[]
): {
  heading_path: string[] | null
  page_start: number | null
  page_end: number | null
  section_marker: string | null
  bboxes: any[] | null
} {
  if (overlappingChunks.length === 0) {
    return {
      heading_path: null,
      page_start: null,
      page_end: null,
      section_marker: null,
      bboxes: null
    }
  }

  // Union of all heading paths
  const allHeadings = overlappingChunks
    .map(c => c.chunk.meta.heading_path)
    .filter(h => h && h.length > 0)
    .flat()

  const uniqueHeadings = [...new Set(allHeadings)]

  // Earliest to latest page
  const pages = overlappingChunks
    .map(c => ({ start: c.chunk.meta.page_start, end: c.chunk.meta.page_end }))
    .filter(p => p.start !== null && p.start !== undefined)

  // All bounding boxes
  const allBboxes = overlappingChunks
    .map(c => c.chunk.meta.bboxes)
    .filter(b => b !== null && b !== undefined)
    .flat()

  // Section markers (EPUBs only)
  const sectionMarkers = overlappingChunks
    .map(c => c.chunk.meta.section_marker)
    .filter(s => s !== null && s !== undefined)

  return {
    heading_path: uniqueHeadings.length > 0 ? uniqueHeadings : null,
    page_start: pages.length > 0 ? Math.min(...pages.map(p => p.start!)) : null,
    page_end: pages.length > 0 ? Math.max(...pages.map(p => p.end!)) : null,
    section_marker: sectionMarkers.length > 0 ? sectionMarkers[0] : null,
    bboxes: allBboxes.length > 0 ? allBboxes : null
  }
}

/**
 * Calculate confidence based on overlap quality.
 *
 * High (>0.9): 3+ overlaps OR one strong overlap (>70%)
 * Medium (0.7-0.9): 1-2 overlaps with decent coverage (>30%)
 * Low (<0.7): Weak overlaps or none (interpolated)
 */
export function calculateConfidence(
  overlappingChunks: MatchResult[],
  maxOverlapPercentage: number
): 'high' | 'medium' | 'low' {
  if (overlappingChunks.length === 0) {
    return 'low'  // No overlaps, will need interpolation
  }

  // High confidence: 3+ overlaps OR one very strong overlap
  if (overlappingChunks.length >= 3 || maxOverlapPercentage >= 0.7) {
    return 'high'
  }

  // Medium confidence: 1-2 overlaps with decent coverage
  if (maxOverlapPercentage >= 0.3) {
    return 'medium'
  }

  // Low confidence: weak overlaps
  return 'low'
}

/**
 * Interpolate metadata from nearest neighbors when no overlaps exist.
 *
 * Rare case (usually <10% of chunks). Use metadata from nearest Docling chunk.
 */
function interpolateMetadata(
  chonkieChunk: ChonkieChunk,
  allMatches: MatchResult[]
): {
  heading_path: string[] | null
  page_start: number | null
  page_end: number | null
  section_marker: string | null
  bboxes: any[] | null
  interpolated: true
} {
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
    return {
      heading_path: null,
      page_start: null,
      page_end: null,
      section_marker: null,
      bboxes: null,
      interpolated: true
    }
  }

  return {
    heading_path: source.chunk.meta.heading_path,
    page_start: source.chunk.meta.page_start,
    page_end: source.chunk.meta.page_end,
    section_marker: source.chunk.meta.section_marker,
    bboxes: source.chunk.meta.bboxes,
    interpolated: true
  }
}

/**
 * Transfer metadata from Docling chunks to Chonkie chunks via overlap detection.
 *
 * For each Chonkie chunk:
 * 1. Find all overlapping Docling chunks
 * 2. Aggregate their metadata (headings, pages, bboxes)
 * 3. Calculate confidence based on overlap count/percentage
 *
 * Expected: 70-90% of Chonkie chunks have at least one Docling overlap.
 *
 * VALIDATION: If overlap coverage <70%, log warning (indicates matching issues).
 */
export async function transferMetadataToChonkieChunks(
  chonkieChunks: ChonkieChunk[],
  bulletproofMatches: MatchResult[],
  documentId: string
): Promise<ProcessedChunk[]> {
  console.log(
    `[Metadata Transfer] Processing ${chonkieChunks.length} Chonkie chunks ` +
    `with ${bulletproofMatches.length} Docling anchors`
  )

  const results: ProcessedChunk[] = []
  let noOverlapCount = 0
  const overlapCounts: number[] = []

  for (let idx = 0; idx < chonkieChunks.length; idx++) {
    const chonkieChunk = chonkieChunks[idx]

    // Find overlapping Docling chunks
    const overlapping = bulletproofMatches.filter(docling =>
      hasOverlap(docling, chonkieChunk)
    )

    if (overlapping.length === 0) {
      noOverlapCount++
      console.warn(
        `[Metadata Transfer] Chonkie chunk ${idx} has no Docling overlaps, ` +
        `will interpolate metadata from neighbors`
      )
    }

    overlapCounts.push(overlapping.length)

    // Calculate max overlap percentage for confidence scoring
    const overlapPercentages = overlapping.map(docling =>
      calculateOverlapPercentage(docling, chonkieChunk)
    )
    const maxOverlapPercentage = overlapPercentages.length > 0
      ? Math.max(...overlapPercentages)
      : 0

    // Aggregate metadata from all overlapping chunks
    const metadata = overlapping.length > 0
      ? aggregateMetadata(overlapping)
      : interpolateMetadata(chonkieChunk, bulletproofMatches)

    // Calculate confidence
    const confidence = calculateConfidence(overlapping, maxOverlapPercentage)

    // Calculate word count
    const wordCount = chonkieChunk.text.split(/\s+/).filter(w => w.length > 0).length

    results.push({
      document_id: documentId,
      content: chonkieChunk.text,
      chunk_index: idx,
      start_offset: chonkieChunk.start_index,
      end_offset: chonkieChunk.end_index,
      word_count: wordCount,
      token_count: chonkieChunk.token_count,

      // Transferred Docling metadata
      heading_path: metadata.heading_path,
      page_start: metadata.page_start,
      page_end: metadata.page_end,
      section_marker: metadata.section_marker,
      bboxes: metadata.bboxes,

      // Chonkie metadata
      chunker_type: chonkieChunk.chunker_type,
      metadata_overlap_count: overlapping.length,
      metadata_confidence: confidence,
      metadata_interpolated: 'interpolated' in metadata ? metadata.interpolated : false,

      // Metadata enrichment (filled in Stage 8)
      themes: [],
      importance_score: 0.5,
      summary: null,
      emotional_metadata: { polarity: 0, primaryEmotion: 'neutral', intensity: 0 },
      conceptual_metadata: { concepts: [] },
      domain_metadata: null
    } as ProcessedChunk)
  }

  // Calculate and log statistics
  const overlapCoverage = ((chonkieChunks.length - noOverlapCount) / chonkieChunks.length) * 100
  const avgOverlaps = overlapCounts.reduce((a, b) => a + b, 0) / overlapCounts.length

  console.log(
    `[Metadata Transfer] Complete:\n` +
    `  Overlap coverage: ${overlapCoverage.toFixed(1)}% (${chonkieChunks.length - noOverlapCount}/${chonkieChunks.length} chunks)\n` +
    `  Average overlaps per chunk: ${avgOverlaps.toFixed(2)}\n` +
    `  Interpolated chunks: ${noOverlapCount} (${(noOverlapCount / chonkieChunks.length * 100).toFixed(1)}%)`
  )

  if (overlapCoverage < 70) {
    console.warn(
      `[Metadata Transfer] ⚠️  LOW OVERLAP COVERAGE: ${overlapCoverage.toFixed(1)}%\n` +
      `  Expected: >70% for successful metadata transfer\n` +
      `  This may indicate bulletproof matcher issues or unusual document structure.\n` +
      `  Review ChunkQualityPanel for validation warnings.`
    )
  }

  return results
}
```

---

## Database Schema Changes

### Migration 050: Add Chunker Type Support

**File**: `supabase/migrations/050_add_chunker_type.sql`

```sql
-- Migration 050: Add chunker_type support for Chonkie integration
-- Created: 2025-10-15
-- Purpose: Track which chunker was used for each chunk

-- Add chunker_type column to chunks table
ALTER TABLE chunks
ADD COLUMN IF NOT EXISTS chunker_type TEXT NOT NULL DEFAULT 'hybrid'
CHECK (chunker_type IN (
  'hybrid',     -- Old HybridChunker (deprecated, for backward compatibility)
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

-- Add metadata transfer quality columns
ALTER TABLE chunks
ADD COLUMN IF NOT EXISTS metadata_overlap_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS metadata_confidence TEXT DEFAULT 'high'
CHECK (metadata_confidence IN ('high', 'medium', 'low')),
ADD COLUMN IF NOT EXISTS metadata_interpolated BOOLEAN DEFAULT false;

-- Add chunker selection to documents table
ALTER TABLE documents
ADD COLUMN IF NOT EXISTS chunker_type TEXT DEFAULT 'recursive'
CHECK (chunker_type IN (
  'hybrid', 'token', 'sentence', 'recursive', 'semantic',
  'late', 'code', 'neural', 'slumber', 'table'
));

-- Add default chunker preference to user_preferences
ALTER TABLE user_preferences
ADD COLUMN IF NOT EXISTS default_chunker_type TEXT DEFAULT 'recursive'
CHECK (default_chunker_type IN (
  'hybrid', 'token', 'sentence', 'recursive', 'semantic',
  'late', 'code', 'neural', 'slumber', 'table'
));

-- Add indexes for querying by chunker type
CREATE INDEX IF NOT EXISTS idx_chunks_chunker_type ON chunks(chunker_type);
CREATE INDEX IF NOT EXISTS idx_chunks_doc_chunker ON chunks(document_id, chunker_type);
CREATE INDEX IF NOT EXISTS idx_documents_chunker_type ON documents(chunker_type);

-- Add indexes for metadata transfer quality
CREATE INDEX IF NOT EXISTS idx_chunks_metadata_confidence ON chunks(metadata_confidence);
CREATE INDEX IF NOT EXISTS idx_chunks_interpolated ON chunks(metadata_interpolated) WHERE metadata_interpolated = true;

-- Add comments
COMMENT ON COLUMN chunks.chunker_type IS 'Chonkie chunker strategy used (recursive default)';
COMMENT ON COLUMN chunks.metadata_overlap_count IS 'Number of Docling chunks that overlapped (0 = interpolated)';
COMMENT ON COLUMN chunks.metadata_confidence IS 'Confidence in metadata transfer (high/medium/low based on overlaps)';
COMMENT ON COLUMN chunks.metadata_interpolated IS 'True if metadata was interpolated from neighbors (no overlaps)';
COMMENT ON COLUMN documents.chunker_type IS 'Chonkie chunker strategy selected by user';
COMMENT ON COLUMN user_preferences.default_chunker_type IS 'User default Chonkie chunker preference';
```

---

## Code Changes

### Files to DELETE

```bash
# Remove inline metadata parser (experimental feature, now deprecated)
rm worker/lib/local/inline-metadata-parser.ts
rm worker/lib/local/__tests__/test-inline-metadata.ts

# Remove old bulletproof tests (will be replaced with overlap transfer tests)
rm worker/lib/local/__tests__/test-layer1-fuzzy.ts
rm worker/lib/local/__tests__/test-orchestrator.ts
```

### Files to MODIFY

**pdf-processor.ts**: Remove ~470 lines

```typescript
// REMOVE Lines 39-47: Inline metadata + bulletproof imports
// DELETE: import { parseInlineMetadata } from '../lib/local/inline-metadata-parser.js'
// DELETE: import { bulletproofMatch } from '../lib/local/bulletproof-matcher.js'

// REMOVE Lines 116-123: Inline metadata chunk size logic
// DELETE: const useInlineMetadata = this.processingMode === 'local' && process.env.USE_INLINE_METADATA === 'true'
// DELETE: const chunkSize = useInlineMetadata ? 256 : 768

// REMOVE Lines 136-140: Inline metadata options spread
// DELETE: ...(useInlineMetadata && { inlineMetadata: true })

// REMOVE Lines 181-209: Inline metadata parsing stage (Stage 2.5)
// DELETE: Entire stage 2.5 block

// REMOVE Lines 381-443: Inline metadata conversion (~62 lines)
// DELETE: Function convertInlineMetadataToChunks()

// REMOVE Lines 444-723: Bulletproof matching AS chunking system (~279 lines)
// DELETE: Entire LOCAL mode path that uses bulletproof matcher for chunking

// REMOVE Lines 725-807: Cloud chunking path (~82 lines)
// DELETE: Entire CLOUD mode path that uses Gemini chunking

// REPLACE with new Chonkie integration (see next section)
```

**epub-processor.ts**: Remove ~353 lines

```typescript
// Similar removals as PDF processor:
// - Remove bulletproof import (lines 34-35)
// - Remove bulletproof matching + metadata path (lines 447-718, ~271 lines)
// - Remove cloud chunking path (lines 720-802, ~82 lines)
// - Replace with Chonkie integration
```

### New Processor Integration

**pdf-processor.ts** (after Stage 5 review checkpoint):

```typescript
// Stage 6: Chonkie Chunking (72-75%)
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

// Stage 7: Overlap Metadata Transfer (75-77%)
const cachedDoclingChunks = this.job.metadata?.cached_extraction?.doclingChunks as DoclingChunk[]
if (!cachedDoclingChunks) {
  throw new Error('Docling chunks not found in cache - cannot transfer metadata')
}

// Run bulletproof matcher to get coordinate map
console.log('[PDFProcessor] Creating coordinate map with bulletproof matcher')
const { chunks: bulletproofMatches } = await bulletproofMatch(markdown, cachedDoclingChunks)

// Transfer metadata via overlap detection
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

// Stage 8: Metadata Enrichment (77-90%) - continues as before
// Stage 9: Embeddings (90-95%) - continues as before
// Stage 10: Finalize (95-100%) - continues as before
```

---

## UI Integration

### Upload Form: Chunker Selection

**File**: `src/components/library/UploadZone.tsx`

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

### ChunkQualityPanel: Review Low-Confidence Chunks

**File**: `src/components/sidebar/ChunkQualityPanel.tsx`

The existing ChunkQualityPanel (already implemented) will work perfectly for Chonkie integration:

- **Synthetic chunks**: Now "interpolated" chunks (no Docling overlaps)
- **Overlap-corrected chunks**: Now "low-confidence" chunks (<30% overlap)
- **Low similarity chunks**: Now "medium-confidence" chunks (30-70% overlap)

**No UI changes needed** - the existing workflow (view, accept, fix position) applies directly to Chonkie chunks with low metadata confidence.

### Document Metadata Display

**File**: `src/components/reader/DocumentMetadata.tsx`

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

---

## Testing Strategy

### Unit Tests

**File**: `worker/lib/chonkie/__tests__/chonkie-chunker.test.ts`

```typescript
import { chunkWithChonkie } from '../chonkie-chunker'
import { spawn } from 'child_process'

jest.mock('child_process')

describe('Chonkie Multi-Strategy Chunker', () => {
  const testMarkdown = '# Chapter 1\n\nFirst paragraph.\n\nSecond paragraph.'

  test.each([
    ['token', {}],
    ['sentence', {}],
    ['recursive', {}],
    ['semantic', { threshold: 0.7 }],
    ['late', { mode: 'sentence' }],
    ['code', { language: 'python' }],
    ['neural', {}],
    ['table', {}]
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

    const chunks = await chunkWithChonkie(testMarkdown, {
      chunker_type: chunkerType as ChunkerType,
      chunk_size: 512,
      ...config
    })

    expect(chunks.length).toBeGreaterThan(0)
    expect(chunks[0].chunker_type).toBe(chunkerType)
    expect(chunks[0].token_count).toBeLessThanOrEqual(512)
  })

  test('character offsets match content', async () => {
    const chunks = await chunkWithChonkie(testMarkdown, {
      chunker_type: 'recursive'
    })

    chunks.forEach(chunk => {
      const extracted = testMarkdown.slice(chunk.start_index, chunk.end_index)
      expect(extracted).toBe(chunk.text)
    })
  })

  test('timeout handling works', async () => {
    mockSpawnHang() // Mock subprocess that never exits

    await expect(
      chunkWithChonkie(testMarkdown, {
        chunker_type: 'neural',
        timeout: 100
      })
    ).rejects.toThrow(/timed out/)
  })
})
```

### Integration Tests

**File**: `worker/scripts/test-chonkie-integration.ts`

```typescript
// Run with: npx tsx scripts/test-chonkie-integration.ts <document_id>

import { chunkWithChonkie } from '../lib/chonkie/chonkie-chunker'
import { transferMetadataToChonkieChunks } from '../lib/chonkie/metadata-transfer'
import { bulletproofMatch } from '../lib/local/bulletproof-matcher'

async function testChonkieIntegration(documentId: string) {
  console.log('Testing Chonkie integration for document:', documentId)

  // 1. Get cleaned markdown from storage
  const markdown = await getCleanedMarkdown(documentId)
  console.log(`✓ Markdown length: ${markdown.length} characters`)

  // 2. Get Docling chunks from cached_chunks table
  const doclingChunks = await getCachedDoclingChunks(documentId)
  console.log(`✓ Docling chunks: ${doclingChunks.length}`)

  // 3. Test all chunker types
  for (const chunkerType of ['token', 'sentence', 'recursive', 'semantic']) {
    console.log(`\nTesting ${chunkerType} chunker...`)

    // Chunk with Chonkie
    const chonkieChunks = await chunkWithChonkie(markdown, {
      chunker_type: chunkerType as ChunkerType,
      chunk_size: 512
    })
    console.log(`  ✓ Chunks: ${chonkieChunks.length}`)

    // Verify character offsets
    for (const chunk of chonkieChunks) {
      const extracted = markdown.slice(chunk.start_index, chunk.end_index)
      if (extracted !== chunk.text) {
        throw new Error(`Offset mismatch in ${chunkerType} chunker at chunk ${chonkieChunks.indexOf(chunk)}`)
      }
    }
    console.log(`  ✓ Character offsets valid`)

    // Create coordinate map with bulletproof matcher
    const { chunks: bulletproofMatches } = await bulletproofMatch(markdown, doclingChunks)
    console.log(`  ✓ Bulletproof matches: ${bulletproofMatches.length}`)

    // Transfer metadata
    const finalChunks = await transferMetadataToChonkieChunks(
      chonkieChunks,
      bulletproofMatches,
      documentId
    )
    console.log(`  ✓ Metadata transferred: ${finalChunks.length} chunks`)

    // Calculate statistics
    const withOverlaps = finalChunks.filter(c => c.metadata_overlap_count > 0)
    const overlapCoverage = (withOverlaps.length / finalChunks.length) * 100

    const highConfidence = finalChunks.filter(c => c.metadata_confidence === 'high')
    const interpolated = finalChunks.filter(c => c.metadata_interpolated)

    console.log(`  ✓ Overlap coverage: ${overlapCoverage.toFixed(1)}%`)
    console.log(`  ✓ High confidence: ${highConfidence.length} (${(highConfidence.length / finalChunks.length * 100).toFixed(1)}%)`)
    console.log(`  ✓ Interpolated: ${interpolated.length} (${(interpolated.length / finalChunks.length * 100).toFixed(1)}%)`)

    // Validate thresholds
    if (overlapCoverage < 70) {
      console.error(`  ❌ LOW OVERLAP COVERAGE: ${overlapCoverage.toFixed(1)}% (expected >70%)`)
    }
    if (highConfidence.length / finalChunks.length < 0.75) {
      console.warn(`  ⚠️  Low high-confidence rate: ${(highConfidence.length / finalChunks.length * 100).toFixed(1)}% (expected >75%)`)
    }
  }

  console.log('\n✅ All chunker types passed!')
}
```

### Validation Commands

```bash
# Install Chonkie
cd worker
pip install chonkie

# Verify installation
python3 -c "from chonkie import RecursiveChunker; print('OK')"

# Unit tests
npx jest lib/chonkie/__tests__/chonkie-chunker.test.ts

# Integration test with real PDF
npx tsx scripts/test-chonkie-integration.ts <document_id>

# Test all chunker types
for chunker in token sentence recursive semantic; do
  echo "Testing $chunker..."
  npx tsx scripts/test-chunker.ts <document_id> $chunker
done

# Validate metadata transfer quality
npx tsx scripts/validate-metadata-transfer.ts <document_id>

# Performance benchmark (500-page document)
npx tsx scripts/benchmark-chonkie.ts <document_id>

# Type checking
cd ..
npx tsc --noEmit

# Apply database migration
npx supabase db reset
```

---

## Success Metrics

### Overlap Coverage (Expected: 70-90%)

**Definition**: Percentage of Chonkie chunks that have at least one Docling chunk overlap.

**Why 70-90%?**: Perfect 100% overlap is NOT expected or needed. Different chunking boundaries (structural vs semantic) naturally create some non-overlapping chunks. These are handled via interpolation.

**Validation**:
```typescript
const withOverlaps = chunks.filter(c => c.metadata_overlap_count > 0)
const coverage = (withOverlaps.length / chunks.length) * 100
console.log(`Overlap coverage: ${coverage.toFixed(1)}%`)
if (coverage < 70) {
  console.warn('LOW OVERLAP COVERAGE - investigate matching quality')
}
```

### Metadata Recovery (Target: >90%)

**Definition**: Percentage of chunks with populated heading_path OR page_start.

**Validation**:
```typescript
const withMetadata = chunks.filter(c =>
  (c.heading_path && c.heading_path.length > 0) || c.page_start
)
const recovery = (withMetadata.length / chunks.length) * 100
console.log(`Metadata recovery: ${recovery.toFixed(1)}%`)
```

### Performance (500-Page Document)

| **Chunker** | **Target Time** | **Acceptable Range** |
|------------|----------------|---------------------|
| token | <3 min | 2-4 min |
| sentence | <4 min | 3-5 min |
| recursive | <5 min | 3-6 min |
| semantic | <15 min | 10-18 min |
| late | <20 min | 15-25 min |
| code | <10 min | 5-12 min |
| neural | <25 min | 20-30 min |
| slumber | <60 min | 45-75 min |
| table | <5 min | 3-6 min |

### Code Quality

- **Net code reduction**: -223 lines (remove 823, add 600)
- **Cyclomatic complexity**: Reduce by removing branching logic
- **Test coverage**: >90% for new Chonkie modules
- **Documentation**: All new functions have JSDoc comments

---

## Implementation Timeline

### Week 1: Infrastructure Setup

**Day 1-2**: Python Wrapper + TypeScript IPC
- [ ] Install Chonkie: `pip install chonkie`
- [ ] Create `chonkie_chunk.py` with all 9 chunker types
- [ ] Create `chonkie-chunker.ts` TypeScript IPC wrapper
- [ ] Create `types.ts` with TypeScript interfaces
- [ ] Unit tests for Python wrapper (mock subprocess)
- [ ] Validate character offset accuracy

**Day 3-4**: Metadata Transfer System
- [ ] Create `metadata-transfer.ts` with overlap detection
- [ ] Implement aggregation logic (heading_path, pages, bboxes)
- [ ] Implement confidence scoring (High/Medium/Low)
- [ ] Implement interpolation for no-overlap cases
- [ ] Unit tests for overlap detection

**Day 5**: Database Migration
- [ ] Create migration 050: Add chunker_type column
- [ ] Add metadata_overlap_count, metadata_confidence, metadata_interpolated columns
- [ ] Add indexes for performance
- [ ] Test migration locally
- [ ] Update TypeScript types

### Week 2: Processor Refactoring

**Day 1-2**: Remove Old Code
- [ ] Delete `inline-metadata-parser.ts`
- [ ] Remove inline metadata logic from pdf-processor.ts (lines 181-209, 381-443)
- [ ] Remove bulletproof AS chunking logic (lines 444-723)
- [ ] Remove cloud chunking logic (lines 725-807)
- [ ] Same removals for epub-processor.ts
- [ ] Verify compilation after removals

**Day 3-4**: Integrate Chonkie
- [ ] Add Chonkie chunking stage to pdf-processor.ts (Stage 6)
- [ ] Add metadata transfer stage (Stage 7)
- [ ] Update progress reporting (72-77%)
- [ ] Same integration for epub-processor.ts
- [ ] Test with small PDF (<20 pages)

**Day 5**: Validation
- [ ] Process test documents with all chunker types
- [ ] Validate overlap coverage >70%
- [ ] Validate metadata recovery >90%
- [ ] Check for regressions in existing features

### Week 3: UI Integration & Testing

**Day 1-2**: UI Updates
- [ ] Add chunker selection dropdown to UploadZone
- [ ] Add chunker display to DocumentMetadata
- [ ] Add chunker filter to library view
- [ ] Test user flow: upload → select chunker → view results

**Day 3-4**: Testing & Performance
- [ ] Integration tests with real PDFs (50, 200, 500 pages)
- [ ] Performance benchmarks for all chunker types
- [ ] A/B comparison: recursive vs semantic vs neural quality
- [ ] Load testing: Process 10 documents concurrently

**Day 5**: Documentation & Handoff
- [ ] Update processing pipeline docs
- [ ] Create Chonkie integration guide
- [ ] Document chunker selection recommendations
- [ ] Create troubleshooting guide

---

## Risk Mitigation

### Risk 1: Python Subprocess Hangs

**Likelihood**: Medium
**Impact**: High (blocks all processing)

**Mitigation**:
- Always `sys.stdout.flush()` after JSON write
- Dynamic timeout based on chunker type and document size
- Kill process after timeout, log error with context

**Detection**:
```typescript
const timer = setTimeout(() => {
  python.kill()
  reject(new Error(`Timeout after ${timeout}ms`))
}, timeout)
```

### Risk 2: Low Overlap Coverage (<70%)

**Likelihood**: Low (bulletproof matcher proven stable)
**Impact**: Medium (metadata quality degrades)

**Mitigation**:
- Log warning when coverage <70%
- Surface in ChunkQualityPanel for user review
- Provide "Accept All" button for bulk validation

**Detection**:
```typescript
if (overlapCoverage < 70) {
  console.warn('LOW OVERLAP COVERAGE - review matching quality')
  await flagForUserReview(documentId, 'low_overlap_coverage')
}
```

### Risk 3: Content-Offset Mismatch

**Likelihood**: Low (Chonkie guarantees character offsets)
**Impact**: Critical (metadata transfer fails)

**Mitigation**:
- Validate `markdown.slice(start, end) === chunk.text` after chunking
- Fail fast with descriptive error if mismatch detected
- Add validation to unit tests

**Detection**:
```typescript
for (const chunk of chunks) {
  const extracted = markdown.slice(chunk.start_index, chunk.end_index)
  if (extracted !== chunk.text) {
    throw new Error('Character offset mismatch - metadata transfer will fail')
  }
}
```

### Risk 4: Chunker Takes Too Long

**Likelihood**: Medium (neural/slumber can take 20-60 min)
**Impact**: Low (user just waits longer)

**Mitigation**:
- Show time estimates in UI before upload
- Dynamic timeout scaling with document size
- Consider batching for very large documents (>1000 pages)

**Detection**:
```typescript
const estimate = chunkerTimeEstimates[chunkerType]
if (document.pages > 500 && ['neural', 'slumber'].includes(chunkerType)) {
  showWarning(`Expected processing time: ${estimate}. Consider using recursive chunker for faster results.`)
}
```

---

## Open Questions & Decisions

### Q1: Default Chunker Strategy

**Question**: What should be the default chunker for new documents?

**Options**:
- A) `token` - Fastest, most predictable
- B) `recursive` - Fast, flexible, structural
- C) `semantic` - Better quality, slower

**Decision**: **Recursive** (Option B)

**Reasoning**:
- Recursive is recommended by Chonkie for 80% of use cases
- Balances speed (3-5 min) with quality (structural boundaries)
- Semantic is only 2-3x slower but significantly better for narrative documents
- Users can choose semantic/neural for quality, token for speed

### Q2: Overlap Interpolation Strategy

**Question**: When a Chonkie chunk has NO Docling overlaps (rare), how should we handle metadata?

**Options**:
- A) Fail processing (require manual review)
- B) Interpolate from nearest neighbors, mark as 'low' confidence
- C) Skip metadata, leave fields null

**Decision**: **Option B** (interpolate from neighbors)

**Reasoning**:
- Rare case (<10% of chunks typically)
- Interpolation provides approximate metadata (better than nothing)
- 'low' confidence + metadata_interpolated flag surfaces issue in ChunkQualityPanel
- User can accept/fix via existing validation workflow

### Q3: Confidence Thresholds

**Question**: What overlap criteria define High/Medium/Low confidence?

**Proposed Thresholds**:
- **High**: 3+ Docling overlaps OR single overlap >70% coverage
- **Medium**: 1-2 overlaps with >30% coverage
- **Low**: <30% overlap OR interpolated

**Decision**: **Use proposed thresholds**

**Reasoning**:
- Based on observed overlap patterns from bulletproof matcher testing
- High confidence = strong metadata transfer (most chunks)
- Medium confidence = acceptable metadata (review if critical)
- Low confidence = weak/interpolated metadata (flag for review)

---

## External Resources

### Documentation

- **Chonkie Docs**: https://docs.chonkie.ai/oss/chunkers/overview
  - Complete API reference for all 9 chunker types
  - Configuration examples and best practices
  - **Critical**: start_index/end_index guaranteed accurate for metadata transfer

- **Chonkie GitHub**: https://github.com/chonkie-inc/chonkie
  - Source code and examples
  - Issue tracker for bugs/feature requests

- **Chonkie Benchmarks**: https://github.com/chonkie-inc/chonkie/blob/main/BENCHMARKS.md
  - Performance metrics: 4.8 MB/s (token), 3.5 MB/s (recursive)
  - 500K Wikipedia articles processed in 2-7 minutes

- **Chonkie PyPI**: https://pypi.org/project/chonkie/
  - Installation instructions
  - Dependency requirements: Python >=3.9
  - Optional installs by feature (basic 15 MiB, semantic 62 MiB, all 680 MiB)

### Codebase References

**Python IPC Pattern**:
- `worker/scripts/docling_extract.py` - stdin/stdout JSON pattern
- `worker/scripts/extract_metadata_pydantic.py` - sys.stdout.flush() pattern

**TypeScript Subprocess Wrapper**:
- `worker/lib/local/ollama-cleanup.ts` - Timeout + error handling pattern
- `worker/lib/docling-extractor.ts` - Python subprocess IPC

**Overlap Detection**:
- `worker/lib/local/bulletproof-matcher.ts` (lines 862-891) - Overlap detection logic

**Metadata Enrichment**:
- `worker/lib/chunking/pydantic-metadata.ts` - PydanticAI structured outputs

**UI Validation**:
- `src/components/sidebar/ChunkQualityPanel.tsx` - Chunk validation workflow

---

## Confidence Score: 9/10

**Strengths**:
- ✅ Complete research on Chonkie (9 chunker types, performance, configuration)
- ✅ Clear architecture (ONE unified pipeline, no branching)
- ✅ Proven patterns (Python IPC, bulletproof matcher reuse)
- ✅ Existing UI (ChunkQualityPanel already handles validation)
- ✅ Measurable success metrics (overlap coverage, metadata recovery)
- ✅ Risk mitigation strategies (timeout, validation, interpolation)
- ✅ Executable validation commands (pip install, tsx scripts, jest tests)

**Risks**:
- ⚠️ Chonkie is relatively new (v0.5.x) - may have undiscovered edge cases
- ⚠️ Neural/Slumber chunkers very slow (20-60 min) - users may get impatient
- ⚠️ Overlap interpolation untested at scale - may need tuning

**Recommendation**: Proceed with implementation. Start with recursive chunker as default, add other chunker types progressively.

---

**Next Steps**:
1. Review this PRP with team
2. Generate task breakdown document (use team-lead-task-breakdown agent)
3. Begin Week 1 implementation (Python wrapper, TypeScript IPC)
4. Validate with small test documents before processing large books
