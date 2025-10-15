# Chonkie Integration - Complete Refactor Plan

**Status**: Ready for Implementation
**Created**: 2025-10-15
**Complexity**: High
**Timeline**: 2-3 weeks

---

## Executive Summary

**Goal**: Eliminate 3 parallel chunking paths (inline metadata, bulletproof, cloud) and replace with ONE unified pipeline that ALWAYS uses Chonkie for chunking while preserving Docling metadata via overlap transfer.

**Core Architecture Change**:
```
BEFORE (3 parallel paths):
├─ Inline metadata (PDF only)
├─ Bulletproof matching (LOCAL)
└─ Cloud chunking (CLOUD)

AFTER (1 unified path):
Docling (metadata) → Cleanup → Bulletproof (coordinate map) →
Chonkie (chunking) → Overlap Transfer → Enrich → Embed
```

**Key Decisions**:
- ✅ **ALWAYS run Chonkie** (no fast paths, no branching)
- ✅ **Docling chunks = metadata anchors** (not actual chunks)
- ✅ **Chonkie chunks = actual chunks** (search, connections, annotations)
- ✅ **Overlap transfer = metadata bridge** (bulletproof matcher helps detect overlaps)
- ✅ **7 chunker strategies** (structural to agentic quality)
- ✅ **Backward compatibility = not a concern** (no important existing documents)

---

## The New Single Pipeline

```
┌─────────────────────────────────────────────────────┐
│ Stage 1: Download (10-15%)                         │
│  • Fetch PDF/EPUB from storage                     │
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
│  • Optional AI cleanup (Ollama or Gemini)          │
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
│ Stage 5: Review Checkpoint (Optional)              │
│  • Skip if reviewBeforeChunking=false              │
└──────────────┬──────────────────────────────────────┘
               │
┌──────────────▼──────────────────────────────────────┐
│ Stage 6: Chonkie Chunking (72-75%)                 │
│  • ALWAYS run (no fast paths)                      │
│  • User selects strategy:                          │
│    - semantic (narrative, thematic)                │
│    - recursive (structural, like old Hybrid)       │
│    - neural (BERT-based, quality)                  │
│    - slumber (agentic, highest quality)            │
│    - sentence (simple boundaries)                  │
│    - token (fixed-size fallback)                   │
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

---

## Code Removal Analysis

### Files to DELETE Entirely

```bash
rm worker/lib/local/inline-metadata-parser.ts              # HTML comment parsing
rm worker/lib/local/__tests__/test-layer1-fuzzy.ts       # Old bulletproof tests
rm worker/lib/local/__tests__/test-orchestrator.ts       # Old bulletproof tests
```

### Code to REMOVE from Processors

**pdf-processor.ts** (~470 lines removed):
- Lines 39-47: Bulletproof + inline metadata imports
- Lines 116-123: Inline metadata chunk size logic
- Lines 136-140: Inline metadata options spread
- Lines 181-209: Inline metadata parsing stage
- Lines 381-443: Inline metadata conversion (~62 lines)
- Lines 444-723: Bulletproof matching AS chunking system (~279 lines)
- Lines 725-807: Cloud chunking path (~82 lines)

**epub-processor.ts** (~353 lines removed):
- Lines 34-35: Bulletproof import
- Lines 447-718: Bulletproof matching + metadata + embeddings (~271 lines)
- Lines 720-802: Cloud chunking path (~82 lines)

**Total removal: ~823 lines**

### What STAYS from Bulletproof Matcher

**Keep `bulletproof-matcher.ts`** BUT repurpose:
- ✅ Keep 5-layer matching system (creates coordinate map)
- ✅ Keep overlap detection logic (lines 862-891)
- ✅ Keep MatchResult type (has start_offset, end_offset, metadata)
- ❌ Remove: Usage AS the chunking system (just a coordinate mapper now)

The bulletproof matcher becomes a **utility** for overlap detection, not a chunking strategy.

---

## New Code to CREATE

### 1. Chonkie Python Wrapper

**File**: `worker/scripts/chonkie_chunk.py`

```python
#!/usr/bin/env python3
"""
Chonkie multi-strategy chunking for Rhizome V2.
Supports 6 chunker types: semantic, recursive, neural, slumber, sentence, token.

CRITICAL: sys.stdout.flush() after JSON write (prevents IPC hangs)
"""

import sys
import json
from chonkie import (
    SemanticChunker,
    RecursiveChunker,
    NeuralChunker,
    SlumberChunker,
    SentenceChunker,
    TokenChunker
)

CHUNKERS = {
    'semantic': SemanticChunker,
    'recursive': RecursiveChunker,
    'neural': NeuralChunker,
    'slumber': SlumberChunker,
    'sentence': SentenceChunker,
    'token': TokenChunker
}

def main():
    try:
        input_data = json.loads(sys.stdin.read())
        markdown = input_data["markdown"]
        config = input_data.get("config", {})
        chunker_type = config.get("chunker_type", "semantic")

        # Get chunker class
        ChunkerClass = CHUNKERS.get(chunker_type)
        if not ChunkerClass:
            raise ValueError(f"Unknown chunker type: {chunker_type}")

        # Initialize chunker with common config
        chunker_config = {
            "chunk_size": config.get("chunk_size", 768)
        }

        # Add chunker-specific config
        if chunker_type == 'semantic':
            chunker_config["embedding_model"] = config.get(
                "embedding_model",
                "sentence-transformers/all-mpnet-base-v2"
            )
            chunker_config["threshold"] = config.get("threshold", 0.7)
        elif chunker_type == 'recursive':
            chunker_config["separators"] = config.get(
                "separators",
                ["\\n\\n", "\\n", " ", ""]
            )
        elif chunker_type == 'neural':
            chunker_config["model"] = config.get("model", "bert-base-uncased")
        elif chunker_type == 'slumber':
            chunker_config["model"] = config.get("model", "qwen2.5:32b")  # Ollama
            chunker_config["strategy"] = config.get("strategy", "coherence")

        # Initialize and chunk
        chunker = ChunkerClass(**chunker_config)
        chunks = chunker.chunk(markdown)

        # Format output
        output = [
            {
                "text": chunk.text,
                "start_index": chunk.start_index,
                "end_index": chunk.end_index,
                "token_count": chunk.token_count,
                "chunker_type": chunker_type
            }
            for chunk in chunks
        ]

        print(json.dumps(output), flush=True)
        sys.stdout.flush()  # CRITICAL!
        sys.exit(0)

    except Exception as e:
        print(f"ERROR: {e}", file=sys.stderr, flush=True)
        import traceback
        print(traceback.format_exc(), file=sys.stderr, flush=True)
        sys.exit(1)

if __name__ == "__main__":
    main()
```

**Installation**: `pip install chonkie`

---

### 2. Chonkie TypeScript IPC Wrapper

**File**: `worker/lib/chonkie/chonkie-chunker.ts`

```typescript
import { spawn } from 'child_process'
import * as path from 'path'

export type ChonkieStrategy =
  | 'semantic'    // Topic shifts (narrative, thematic)
  | 'recursive'   // Hierarchical splitting (structured docs)
  | 'neural'      // BERT-based (best quality)
  | 'slumber'     // Agentic LLM-based (highest quality)
  | 'sentence'    // Sentence boundaries (simple, fast)
  | 'token'       // Fixed token size (fallback)

export interface ChonkieConfig {
  chunker_type: ChonkieStrategy
  chunk_size?: number

  // Semantic-specific
  embedding_model?: string
  threshold?: number

  // Recursive-specific
  separators?: string[]

  // Neural-specific
  model?: string

  // Slumber-specific
  strategy?: 'coherence' | 'topic' | 'structure'

  // General
  timeout?: number
}

export interface ChonkieChunk {
  text: string
  start_index: number
  end_index: number
  token_count: number
  chunker_type: ChonkieStrategy
}

export async function chunkWithChonkie(
  cleanedMarkdown: string,
  config: ChonkieConfig
): Promise<ChonkieChunk[]> {
  const scriptPath = path.join(__dirname, '../../scripts/chonkie_chunk.py')
  const timeout = config.timeout || 300000 // 5 minutes default

  return new Promise((resolve, reject) => {
    const python = spawn('python3', [scriptPath])

    let stdout = ''
    let stderr = ''

    const timer = setTimeout(() => {
      python.kill()
      reject(new Error(`Chonkie ${config.chunker_type} timed out after ${timeout}ms`))
    }, timeout)

    python.stdout.on('data', (data) => {
      stdout += data.toString()
    })

    python.stderr.on('data', (data) => {
      stderr += data.toString()
      console.error(`[Chonkie ${config.chunker_type}] ${data}`)
    })

    python.on('close', (code) => {
      clearTimeout(timer)

      if (code !== 0) {
        reject(new Error(`Chonkie ${config.chunker_type} failed (exit ${code}): ${stderr}`))
        return
      }

      try {
        const chunks: ChonkieChunk[] = JSON.parse(stdout)

        // Validate chunk offsets match content
        for (const chunk of chunks) {
          const extracted = cleanedMarkdown.slice(chunk.start_index, chunk.end_index)
          if (extracted !== chunk.text) {
            console.warn(`[Chonkie] Offset mismatch detected for chunk at ${chunk.start_index}`)
          }
        }

        resolve(chunks)
      } catch (err) {
        reject(new Error(`Failed to parse Chonkie output: ${err}\nOutput: ${stdout}`))
      }
    })

    // Send input
    const input = JSON.stringify({ markdown: cleanedMarkdown, config })
    python.stdin.write(input)
    python.stdin.end()
  })
}
```

---

### 3. Overlap Metadata Transfer System

**File**: `worker/lib/chonkie/metadata-transfer.ts`

```typescript
import type { MatchResult } from '../local/bulletproof-matcher.js'
import type { ChonkieChunk } from './chonkie-chunker.js'
import type { ProcessedChunk } from '../../types/processor.js'

export interface OverlapResult {
  chonkieChunk: ChonkieChunk
  overlappingDoclingChunks: MatchResult[]
  confidence: 'high' | 'medium' | 'low'
  metadata: {
    heading_path: string[] | null
    page_start: number | null
    page_end: number | null
    section_marker: string | null
    bboxes: any[] | null
  }
}

/**
 * Detect if two chunks overlap.
 * Reuses logic from bulletproof-matcher.ts (lines 862-891).
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
 */
export function aggregateMetadata(
  overlappingChunks: MatchResult[]
): OverlapResult['metadata'] {
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
 * High confidence: 3+ overlaps OR one strong overlap (>70%)
 * Medium confidence: 1-2 overlaps with decent coverage (>30%)
 * Low confidence: Weak overlaps or none (interpolated)
 */
export function calculateConfidence(
  overlappingChunks: MatchResult[],
  maxOverlapPercentage: number
): OverlapResult['confidence'] {
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
 * Transfer metadata from Docling chunks to Chonkie chunks via overlap detection.
 *
 * For each Chonkie chunk:
 * 1. Find all overlapping Docling chunks
 * 2. Aggregate their metadata (headings, pages, bboxes)
 * 3. Calculate confidence based on overlap count/percentage
 *
 * Expected: 70-90% of Chonkie chunks have at least one Docling overlap.
 */
export async function transferMetadataToChonkieChunks(
  chonkieChunks: ChonkieChunk[],
  bulletproofMatches: MatchResult[],
  documentId: string
): Promise<ProcessedChunk[]> {
  console.log(`[Metadata Transfer] Processing ${chonkieChunks.length} Chonkie chunks with ${bulletproofMatches.length} Docling anchors`)

  const results: ProcessedChunk[] = []
  let noOverlapCount = 0

  for (let idx = 0; idx < chonkieChunks.length; idx++) {
    const chonkieChunk = chonkieChunks[idx]

    // Find overlapping Docling chunks
    const overlapping = bulletproofMatches.filter(docling =>
      hasOverlap(docling, chonkieChunk)
    )

    if (overlapping.length === 0) {
      noOverlapCount++
      console.warn(`[Metadata Transfer] Chonkie chunk ${idx} has no Docling overlaps, will interpolate`)
    }

    // Calculate max overlap percentage for confidence scoring
    const overlapPercentages = overlapping.map(docling =>
      calculateOverlapPercentage(docling, chonkieChunk)
    )
    const maxOverlapPercentage = overlapPercentages.length > 0
      ? Math.max(...overlapPercentages)
      : 0

    // Aggregate metadata from all overlapping chunks
    const metadata = aggregateMetadata(overlapping)

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

      // Transferred Docling metadata
      page_start: metadata.page_start,
      page_end: metadata.page_end,
      heading_path: metadata.heading_path,
      heading_level: metadata.heading_path ? metadata.heading_path.length : null,
      section_marker: metadata.section_marker,
      bboxes: metadata.bboxes,

      // Chonkie metadata
      chunker_type: chonkieChunk.chunker_type,
      position_confidence: confidence === 'high' ? 'exact' : confidence === 'medium' ? 'high' : 'medium',
      position_method: 'overlap_transfer',
      position_validated: false,

      // Validation details
      validation_warning: overlapping.length === 0
        ? `No Docling overlaps found. Metadata interpolated from nearby chunks.`
        : null,
      validation_details: overlapping.length === 0
        ? {
            type: 'synthetic',
            reason: 'No Docling chunks overlapped with this Chonkie chunk. Metadata may be approximate.',
            metadata: {
              overlap_count: 0,
              max_overlap_percentage: 0
            }
          }
        : null,
      overlap_corrected: false,
      position_corrected: false,
      correction_history: [],

      // Metadata enrichment happens in next stage
      themes: [],
      importance_score: 0.5,
      summary: null,
      emotional_metadata: {
        polarity: 0,
        primaryEmotion: 'neutral',
        intensity: 0
      },
      conceptual_metadata: {
        concepts: []
      },
      domain_metadata: null,
      metadata_extracted_at: null
    })
  }

  const overlapCoverage = ((chonkieChunks.length - noOverlapCount) / chonkieChunks.length) * 100
  console.log(`[Metadata Transfer] Complete: ${overlapCoverage.toFixed(1)}% overlap coverage (${chonkieChunks.length - noOverlapCount}/${chonkieChunks.length} chunks)`)

  if (overlapCoverage < 70) {
    console.warn(`[Metadata Transfer] ⚠️  Low overlap coverage (${overlapCoverage.toFixed(1)}%). Expected >70%. May indicate matching issues.`)
  }

  return results
}
```

---

### 4. Database Migration

**File**: `supabase/migrations/050_add_chunker_type.sql`

```sql
-- Migration 050: Add chunker_type support for Chonkie integration
-- Created: 2025-10-15

-- Add chunker_type column to chunks table
ALTER TABLE chunks
ADD COLUMN IF NOT EXISTS chunker_type TEXT NOT NULL DEFAULT 'semantic'
CHECK (chunker_type IN (
  'semantic',    -- Chonkie SemanticChunker (narrative, thematic)
  'recursive',   -- Chonkie RecursiveChunker (structured docs)
  'neural',      -- Chonkie NeuralChunker (BERT-based, quality)
  'slumber',     -- Chonkie SlumberChunker (agentic, highest quality)
  'sentence',    -- Chonkie SentenceChunker (simple sentence boundaries)
  'token'        -- Chonkie TokenChunker (fixed-size fallback)
));

-- Add index for querying by chunker type
CREATE INDEX IF NOT EXISTS idx_chunks_chunker_type ON chunks(chunker_type);

-- Add index for document + chunker combination
CREATE INDEX IF NOT EXISTS idx_chunks_doc_chunker ON chunks(document_id, chunker_type);

-- Add chunker selection per document
ALTER TABLE documents
ADD COLUMN IF NOT EXISTS chunker_type TEXT DEFAULT 'semantic'
CHECK (chunker_type IN (
  'semantic', 'recursive', 'neural', 'slumber', 'sentence', 'token'
));

-- Add user preferences for default chunker
ALTER TABLE user_preferences
ADD COLUMN IF NOT EXISTS default_chunker_type TEXT DEFAULT 'semantic'
CHECK (default_chunker_type IN (
  'semantic', 'recursive', 'neural', 'slumber', 'sentence', 'token'
));

COMMENT ON COLUMN chunks.chunker_type IS 'Chonkie chunker strategy used (semantic default)';
COMMENT ON COLUMN documents.chunker_type IS 'Chonkie chunker strategy selected by user';
COMMENT ON COLUMN user_preferences.default_chunker_type IS 'User default Chonkie chunker preference';
```

---

## Refactored Processors

### PDF Processor Changes

**File**: `worker/processors/pdf-processor.ts`

**Remove** (Lines 381-807): All inline metadata, bulletproof AS chunking, and cloud paths

**Replace with** (after Stage 5 review checkpoint):

```typescript
// Stage 6: Chonkie Chunking (70-75%)
const chunkerStrategy = this.job.input_data?.chunkerStrategy || 'semantic'
console.log(`[PDFProcessor] Chunking with Chonkie strategy: ${chunkerStrategy}`)

await this.updateProgress(72, 'chunking', 'processing', `Chunking with ${chunkerStrategy} strategy`)

const chonkieChunks = await chunkWithChonkie(markdown, {
  chunker_type: chunkerStrategy,
  chunk_size: 768,
  timeout: 300000  // 5 minutes
})

console.log(`[PDFProcessor] Chonkie created ${chonkieChunks.length} chunks using ${chunkerStrategy} strategy`)

await this.updateProgress(75, 'chunking', 'complete', `${chonkieChunks.length} chunks created`)

// Stage 7: Overlap Metadata Transfer (75-77%)
const cachedDoclingChunks = this.job.metadata?.cached_extraction?.doclingChunks as DoclingChunk[]
if (!cachedDoclingChunks) {
  throw new Error('Docling chunks not found in cache - cannot transfer metadata')
}

// First, run bulletproof matcher to get coordinate map
console.log('[PDFProcessor] Creating coordinate map with bulletproof matcher')
const { chunks: bulletproofMatches } = await bulletproofMatch(markdown, cachedDoclingChunks)

// Now transfer metadata via overlap detection
console.log('[PDFProcessor] Transferring Docling metadata to Chonkie chunks')
await this.updateProgress(76, 'metadata_transfer', 'processing', 'Transferring metadata via overlap detection')

const finalChunks = await transferMetadataToChonkieChunks(
  chonkieChunks,
  bulletproofMatches,
  this.job.document_id
)

console.log(`[PDFProcessor] Metadata transfer complete: ${finalChunks.length} enriched chunks`)

await this.updateProgress(77, 'metadata_transfer', 'complete', 'Metadata transfer done')

// Checkpoint 3: Save chunks with transferred metadata
await this.saveStageResult('chunking', finalChunks)

// Stage 8: Metadata Enrichment (continues as before at 77-90%)
// Stage 9: Embeddings (continues as before at 90-95%)
// Stage 10: Finalize (continues as before at 95-100%)
```

### EPUB Processor Changes

Same pattern as PDF processor - replace Lines 447-802 with Chonkie chunking + overlap transfer.

---

## Implementation Timeline

### Week 1: Infrastructure Setup
- [ ] Install Chonkie: `pip install chonkie`
- [ ] Create `chonkie_chunk.py` Python wrapper
- [ ] Create `chonkie-chunker.ts` TypeScript IPC wrapper
- [ ] Create `metadata-transfer.ts` overlap detection system
- [ ] Database migration: Add `chunker_type` columns
- [ ] Unit tests for Python wrapper (mock subprocess)
- [ ] Unit tests for overlap detection (real algorithm)

### Week 2: Processor Refactoring
- [ ] Refactor `pdf-processor.ts`:
  - Remove inline metadata (lines 181-209, 381-443)
  - Remove bulletproof AS chunking (lines 444-723)
  - Remove cloud chunking (lines 725-807)
  - Add Chonkie chunking stage (70-75%)
  - Add overlap transfer stage (75-77%)
  - Keep metadata enrichment + embeddings unchanged
- [ ] Refactor `epub-processor.ts` (same pattern)
- [ ] Delete `inline-metadata-parser.ts`
- [ ] Update bulletproof matcher comments (now a coordinate mapper)

### Week 3: Testing & Validation
- [ ] Integration tests with real PDFs (<20 pages)
- [ ] Integration tests with real EPUBs (<10 chapters)
- [ ] Test all 6 chunker strategies
- [ ] Validate overlap coverage (>70%)
- [ ] Validate metadata recovery (>80% of chunks have metadata)
- [ ] Performance testing (processing time <20 min for 500 pages)
- [ ] A/B comparison: semantic vs recursive vs neural quality

---

## Success Metrics

### Performance
- [ ] Semantic chunker: <18 min for 500-page book
- [ ] Recursive chunker: <17 min (structural, faster than semantic)
- [ ] Neural chunker: <20 min (quality-first, acceptable slowdown)

### Quality
- [ ] Overlap coverage: >70% of Chonkie chunks have ≥1 Docling overlap
- [ ] Metadata recovery: >80% of chunks have heading_path or page numbers
- [ ] No content-offset mismatches (validation passes)
- [ ] Chunk content matches stored offsets exactly

### Data Integrity
- [ ] Zero chunk loss (all Chonkie chunks saved)
- [ ] All chunks have valid start_offset/end_offset
- [ ] Stored markdown matches chunk.text slice exactly

---

## Risk Mitigation

### Risk 1: Python Subprocess Hangs
**Mitigation**: Always `sys.stdout.flush()` after JSON write
**Detection**: 5-minute timeout in TypeScript wrapper

### Risk 2: Overlap Coverage <70%
**Mitigation**: Log warning, investigate matching quality
**Detection**: Calculate coverage in `transferMetadataToChonkieChunks()`

### Risk 3: Content-Offset Mismatch
**Mitigation**: Validate `markdown.slice(start, end) === chunk.text`
**Detection**: Add validation in Chonkie wrapper

### Risk 4: Chonkie Produces Wrong Offsets
**Mitigation**: Chonkie uses character indices, verify against markdown
**Detection**: Unit tests with known-good fixtures

---

## Open Questions

1. **Default chunker strategy**: Start with `semantic` or `recursive`?
   - Semantic = better quality (thematic)
   - Recursive = faster (structural, like old Hybrid)
   - **Recommendation**: Semantic (better quality)

2. **Overlap interpolation**: If Chonkie chunk has NO overlaps, interpolate from neighbors?
   - Yes: Mark as 'low' confidence, use nearby chunks' metadata
   - No: Fail processing, require manual review
   - **Recommendation**: Yes, mark as 'low' confidence

3. **Confidence thresholds**: Use suggested thresholds or adjust?
   - High: 3+ overlaps OR 70%+ single overlap
   - Medium: 1-2 overlaps with 30%+ coverage
   - Low: <30% overlap or interpolated
   - **Recommendation**: Use suggested thresholds

---

## Key Insights

1. **Docling chunks = metadata anchors** (not actual chunks used in system)
2. **Chonkie chunks = actual chunks** (search, connections, annotations)
3. **Bulletproof matcher = coordinate mapper** (not chunking strategy)
4. **Overlap detection = already built** (reuse bulletproof matcher logic)
5. **ONE path, ZERO branching** (every document goes through same pipeline)
6. **7 strategies, user choice** (semantic to agentic quality)

---

## Next Steps

1. **Review this plan** - Confirm architecture is correct
2. **Start Week 1** - Infrastructure setup (Python wrapper, TS IPC, overlap system)
3. **Test incrementally** - Validate each component before integration
4. **Refactor processors** - Clean removal + Chonkie integration
5. **Validate quality** - Overlap coverage, metadata recovery, performance

---

**End of Plan**
