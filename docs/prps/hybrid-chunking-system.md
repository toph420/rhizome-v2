# PRP: Hybrid Chunking System with Multi-Strategy Selection

**Status**: Approved for Implementation
**Created**: 2025-10-14
**Type**: Architecture Enhancement
**Complexity**: High
**Estimated Effort**: 3-4 weeks

---

## Executive Summary

Implement a **hybrid chunking architecture** that preserves the proven HybridChunker (structural, fast) while adding Chonkie as an optional path with **multiple chunker strategies**. Users can choose the optimal chunking strategy per document based on content type and quality requirements.

### Key Design Decisions

1. ✅ **Hybrid Approach**: Keep both HybridChunker AND Chonkie (not replacement)
2. ✅ **NO Skip-Window**: Omit skip-window merging (complexity vs benefit tradeoff)
3. ✅ **Bulletproof Matcher as Coordinate Map**: Essential for metadata transfer
4. ✅ **Multiple Chunker Types**: Support 6 Chonkie chunker strategies (start with Semantic)

### Value Proposition

**Current System** (HybridChunker only):
- ✅ Fast: ~15 min for 500-page book
- ✅ Reliable: 100% metadata recovery
- ✅ Structure-preserving: Perfect for citations
- ❌ Limited: Token-based boundaries, no semantic awareness

**Hybrid System** (HybridChunker + Chonkie):
- ✅ Flexibility: Choose strategy per document
- ✅ Quality: Semantic/neural chunking for narratives
- ✅ Fallback: HybridChunker remains default
- ✅ Zero Risk: Bulletproof matcher ensures metadata preservation
- ⚠️ Cost: +60-90 seconds processing time for Chonkie paths

---

## Goals & Motivation

### Primary Goals

1. **Preserve Proven System**: Keep HybridChunker as fast, reliable default
2. **Enable Quality Upgrades**: Offer semantic/neural chunking for quality-first users
3. **Content-Aware Chunking**: Match chunker strategy to document characteristics
4. **Zero Data Loss**: Guarantee metadata preservation via bulletproof matcher
5. **User Choice**: Per-document chunker selection in UI

### Non-Goals

- Replace HybridChunker (hybrid, not replacement)
- Implement skip-window merging (complexity not justified)
- Automatic chunker selection (user chooses, no AI magic)
- Optimize for speed (quality over speed for Chonkie paths)

### Success Criteria

- [ ] All 6 chunker types implemented and tested
- [ ] Metadata recovery rate >90% for all chunker types
- [ ] Processing time <20 min for 500-page book (all chunkers)
- [ ] UI allows per-document chunker selection
- [ ] Zero regressions in HybridChunker path (default unchanged)
- [ ] A/B test shows >15% connection quality improvement for semantic chunkers

---

## Architecture Overview

### Processing Flow (Hybrid with Fork)

```
┌─────────────────────────────────────────────────────────────┐
│          RHIZOME V2 HYBRID CHUNKING ARCHITECTURE            │
│           (6 Chunker Strategies + HybridChunker)            │
└─────────────────────────────────────────────────────────────┘

╔═══════════════════════════════════════════════════════════╗
║               STAGE 1: DOCLING EXTRACTION                 ║
║                 (Always runs, always cached)              ║
╚═══════════════════════════════════════════════════════════╝
┌───────────────────────────────────────────────────────────┐
│ Docling Extraction (Python subprocess)                    │
│ • HybridChunker: ALWAYS enabled                           │
│   - tokenizer: 'Xenova/all-mpnet-base-v2'                │
│   - max_tokens: 768                                       │
│ • Output:                                                  │
│   - markdown (original, with artifacts)                   │
│   - chunks (~382 segments with metadata)                  │
│   - structure (headings[], total_pages)                   │
│                                                            │
│ **KEY**: Chunks cached to cached_chunks table             │
│          These become anchors for bulletproof matching    │
└───────────────────────────────────────────────────────────┘
                          ↓
╔═══════════════════════════════════════════════════════════╗
║                 STAGE 2: CLEANUP PHASE                    ║
╚═══════════════════════════════════════════════════════════╝
┌───────────────────────────────────────────────────────────┐
│ Regex Cleanup + Optional AI Cleanup                      │
│ • cleanPageArtifacts(markdown)                            │
│ • Ollama/Gemini cleanup (user choice)                     │
│ • Result: Coordinate mismatch created!                    │
└───────────────────────────────────────────────────────────┘
                          ↓
╔═══════════════════════════════════════════════════════════╗
║           STAGE 3: BULLETPROOF MATCHING                   ║
║         (Creates coordinate map: ORIGINAL → CLEANED)      ║
╚═══════════════════════════════════════════════════════════╝
┌───────────────────────────────────────────────────────────┐
│ 5-Layer Matching System                                   │
│ • Creates coordinate map for ALL chunker strategies       │
│ • 100% recovery guarantee via interpolation layer         │
│ • Output: Docling chunks → cleaned markdown positions     │
└───────────────────────────────────────────────────────────┘
                          ↓
╔═══════════════════════════════════════════════════════════╗
║            STAGE 4: CHUNKING STRATEGY FORK                ║
║              (User selects per document)                  ║
╚═══════════════════════════════════════════════════════════╝

         ┌────────────────┴────────────────┐
         ↓                                  ↓

┌─────────────────────────┐    ┌─────────────────────────┐
│   PATH A: STRUCTURAL    │    │   PATH B: CHONKIE       │
│     (HybridChunker)     │    │   (6 Strategies)        │
│        DEFAULT          │    │      OPTIONAL           │
└─────────────────────────┘    └─────────────────────────┘

┌─────────────────────────┐    ┌─────────────────────────┐
│ Use Bulletproof Matched │    │ Chonkie Python Script   │
│ Chunks (already done!)  │    │                         │
│                         │    │ User selects:           │
│ • Docling boundaries    │    │ ┌─────────────────────┐ │
│ • Structure-aware       │    │ │ 1. SemanticChunker  │ │
│ • Fast (no extra work)  │    │ │ 2. RecursiveChunker │ │
│ • Time: 0 sec           │    │ │ 3. NeuralChunker    │ │
│                         │    │ │ 4. SlumberChunker   │ │
│ Result: ~382 chunks     │    │ │ 5. SentenceChunker  │ │
│                         │    │ │ 6. TokenChunker     │ │
│                         │    │ └─────────────────────┘ │
│                         │    │                         │
│                         │    │ • chunk_size: 768       │
│                         │    │ • Time: 60-120 sec      │
│                         │    │                         │
│                         │    │ Result: ~350-420 chunks │
└─────────────────────────┘    └─────────────────────────┘
         ↓                                  ↓
         │                      ┌─────────────────────────┐
         │                      │ Metadata Transfer       │
         │                      │ • Use bulletproof coord │
         │                      │   map to find overlap   │
         │                      │ • Aggregate Docling     │
         │                      │   metadata from matches │
         │                      │ • Preserve pages,       │
         │                      │   headings, bboxes      │
         │                      └─────────────────────────┘
         │                                  ↓
         └────────────────┬────────────────┘
                          ↓
╔═══════════════════════════════════════════════════════════╗
║         STAGE 5: METADATA ENRICHMENT (SHARED)             ║
╚═══════════════════════════════════════════════════════════╝
┌───────────────────────────────────────────────────────────┐
│ PydanticAI + Ollama                                       │
│ • Same for all chunker types                              │
└───────────────────────────────────────────────────────────┘
                          ↓
╔═══════════════════════════════════════════════════════════╗
║        STAGE 6: EMBEDDINGS GENERATION (SHARED)            ║
╚═══════════════════════════════════════════════════════════╝
┌───────────────────────────────────────────────────────────┐
│ Transformers.js Local Embeddings                          │
│ • Same for all chunker types                              │
└───────────────────────────────────────────────────────────┘
                          ↓
╔═══════════════════════════════════════════════════════════╗
║              STAGE 7: FINALIZE & STORE                    ║
╚═══════════════════════════════════════════════════════════╝
┌───────────────────────────────────────────────────────────┐
│ Store with chunker_type metadata                          │
│ • chunker_type: 'hybrid' | 'semantic' | 'recursive' | ... │
└───────────────────────────────────────────────────────────┘
```

---

## Chunker Strategy Guide

### 1. SemanticChunker (Narrative & Thematic Content)

**Best For**:
- Narrative books (novels, biographies)
- Essays and opinion pieces
- Content requiring thematic coherence
- Cross-section connection discovery

**How It Works**:
- Groups sentences by semantic similarity
- Uses embeddings to detect topic shifts
- Preserves complete thoughts within chunks

**Parameters**:
```python
SemanticChunker(
    embedding_model="sentence-transformers/all-mpnet-base-v2",
    chunk_size=768,
    threshold=0.7  # Higher = stricter boundaries
)
```

**Trade-offs**:
- ✅ Better thematic coherence
- ✅ Cross-domain connection discovery
- ⚠️ Slower: +60-90 seconds
- ⚠️ Boundaries may not align with structure

**Use Cases**:
- "Gravity's Rainbow" (narrative complexity)
- "Surveillance Capitalism" (thematic arguments)
- General non-fiction (topic-based organization)

---

### 2. RecursiveChunker (Structured Documents)

**Best For**:
- Technical documentation
- Academic papers with clear sections
- Textbooks with hierarchical structure
- Documents with explicit headings

**How It Works**:
- Recursively splits by structure (headings, paragraphs)
- Respects document hierarchy
- Falls back to sentence/token boundaries

**Parameters**:
```python
RecursiveChunker(
    chunk_size=768,
    separators=["\n\n", "\n", " ", ""]  # Hierarchy of splits
)
```

**Trade-offs**:
- ✅ Structure-preserving (like HybridChunker)
- ✅ Faster than semantic chunking
- ✅ Predictable boundaries
- ❌ May split mid-concept if structure doesn't align

**Use Cases**:
- O'Reilly technical books
- Academic papers (IEEE, ACM)
- API documentation
- Technical manuals

---

### 3. NeuralChunker (BERT-Based Semantic Shifts)

**Best For**:
- Complex academic writing
- Multi-topic documents
- Content with subtle topic transitions
- Quality > speed scenarios

**How It Works**:
- Fine-tuned BERT model detects semantic shifts
- More sophisticated than embedding similarity
- Learns document-specific patterns

**Parameters**:
```python
NeuralChunker(
    model="bert-base-uncased",  # Or domain-specific fine-tune
    chunk_size=768
)
```

**Trade-offs**:
- ✅ Highest quality topic boundaries
- ✅ Detects subtle shifts
- ⚠️ Slowest: +90-120 seconds
- ⚠️ Requires GPU for acceptable speed

**Use Cases**:
- PhD dissertations
- Multi-topic research papers
- Complex philosophy texts
- When quality is paramount

---

### 4. SlumberChunker (Agentic High-Quality)

**Best For**:
- Critical documents requiring best quality
- Small corpus where cost is acceptable
- Documents with mixed content types
- "Publication-ready" chunking

**How It Works**:
- Uses generative models (LLM) to determine boundaries
- Agentic reasoning about optimal chunk points
- Most expensive but highest quality

**Parameters**:
```python
SlumberChunker(
    model="gpt-4",  # Or Ollama Qwen for local
    chunk_size=768,
    strategy="coherence"  # or "topic", "structure"
)
```

**Trade-offs**:
- ✅ Best possible quality
- ✅ Context-aware decisions
- ❌ Slowest: +120-180 seconds
- ❌ Highest cost (if using paid APIs)

**Use Cases**:
- Personal canonical documents
- Publication preparation
- Critical research materials
- When cost is not a concern

---

### 5. SentenceChunker (Simple Sentence Boundaries)

**Best For**:
- Clean, well-formatted text
- Documents with clear sentence structure
- Fast processing priority
- Fallback when others fail

**How It Works**:
- Splits at sentence boundaries (periods, !?, etc.)
- Groups sentences to fit token limit
- No semantic analysis

**Parameters**:
```python
SentenceChunker(
    chunk_size=768
)
```

**Trade-offs**:
- ✅ Fast: +10-20 seconds
- ✅ Predictable boundaries
- ✅ Simple, reliable
- ❌ No semantic awareness
- ❌ May split related sentences

**Use Cases**:
- Clean PDFs with good formatting
- Speed > quality scenarios
- Fallback when semantic chunking fails
- Testing and development

---

### 6. TokenChunker (Fixed-Size Fallback)

**Best For**:
- Uniform chunk sizes required
- Maximum compatibility
- Absolute fallback
- Testing and benchmarking

**How It Works**:
- Splits text into fixed 768-token chunks
- No boundary awareness
- Pure token counting

**Parameters**:
```python
TokenChunker(
    chunk_size=768,
    tokenizer="sentence-transformers/all-mpnet-base-v2"
)
```

**Trade-offs**:
- ✅ Fastest: +5-10 seconds
- ✅ Predictable chunk count
- ✅ Guaranteed token limit compliance
- ❌ Splits mid-sentence
- ❌ No semantic or structural awareness

**Use Cases**:
- Embeddings model requires exact token counts
- Debugging and testing
- Absolute fallback when all else fails
- Benchmarking baseline

---

## Decision Matrix

| Document Type | Primary | Fallback | Why |
|---------------|---------|----------|-----|
| **Novel/Fiction** | Semantic | Sentence | Thematic coherence |
| **Academic Paper** | Recursive | Neural | Structure + quality |
| **Technical Manual** | Recursive | Hybrid | Preserve structure |
| **Philosophy** | Neural | Semantic | Subtle topic shifts |
| **Mixed Content** | Slumber | Semantic | Handles complexity |
| **Clean PDF** | Sentence | Hybrid | Fast + reliable |
| **Canonical Docs** | Slumber | Neural | Best quality |
| **Speed Priority** | Hybrid | Token | Fastest path |

---

## Implementation Phases

### Phase 1: Infrastructure (Week 1)

**Goal**: Set up Chonkie infrastructure and database schema

**Tasks**:
1. Install Chonkie: `pip install chonkie`
2. Create Python wrapper script: `worker/scripts/chonkie_chunk.py`
3. Create TypeScript wrapper: `worker/lib/chonkie/chonkie-chunker.ts`
4. Database migration: Add `chunker_type` enum
   ```sql
   ALTER TABLE chunks
   ADD COLUMN chunker_type TEXT NOT NULL DEFAULT 'hybrid'
   CHECK (chunker_type IN (
     'hybrid',
     'semantic',
     'recursive',
     'neural',
     'slumber',
     'sentence',
     'token'
   ));
   ```
5. Add user preferences for default chunker
6. Unit tests for Python wrapper

**Deliverables**:
- [ ] Chonkie installed and verified
- [ ] Python script with all 6 chunker types
- [ ] TypeScript IPC wrapper
- [ ] Database migration applied
- [ ] Basic unit tests passing

---

### Phase 2: Metadata Transfer System (Week 2)

**Goal**: Implement bulletproof matcher metadata transfer for Chonkie chunks

**Tasks**:
1. Extend bulletproof matcher with metadata transfer mode
2. Implement overlap detection algorithm
3. Implement metadata aggregation logic
4. Handle edge cases:
   - Multiple Docling chunks → one Chonkie chunk
   - One Docling chunk → multiple Chonkie chunks
   - No overlap (gap in matching)
5. Add confidence tracking for metadata transfer
6. Integration tests with real PDFs

**Implementation**:
```typescript
// worker/lib/chonkie/metadata-transfer.ts
export function transferMetadataToChonkieChunks(
  chonkieChunks: ChonkieChunk[],
  bulletproofMatches: MatchResult[]
): ProcessedChunk[] {
  return chonkieChunks.map(chonkieChunk => {
    // Find overlapping Docling chunks
    const overlapping = findOverlappingMatches(chonkieChunk, bulletproofMatches)

    // Aggregate metadata
    const metadata = aggregateMetadata(overlapping)

    return {
      content: chonkieChunk.text,
      start_offset: chonkieChunk.start_index,
      end_offset: chonkieChunk.end_index,
      token_count: chonkieChunk.token_count,
      ...metadata,
      chunker_type: chonkieChunk.chunker_type
    }
  })
}
```

**Deliverables**:
- [ ] Metadata transfer working for all 6 chunker types
- [ ] >90% metadata recovery rate
- [ ] Confidence tracking implemented
- [ ] Integration tests passing

---

### Phase 3: UI Integration (Week 3)

**Goal**: Add chunker selection to document processing UI

**Tasks**:
1. Add chunker selection dropdown to upload flow
2. Store user preference per document
3. Display chunker type in document metadata
4. Add chunker comparison view (optional)
5. Update Admin Panel to show chunker stats
6. Add ability to reprocess with different chunker

**UI Mockup**:
```typescript
<Select
  label="Chunking Strategy"
  value={chunkerType}
  onChange={setChunkerType}
>
  <option value="hybrid">Structural (Fast, default)</option>
  <option value="semantic">Semantic (Narrative, thematic)</option>
  <option value="recursive">Recursive (Structured docs)</option>
  <option value="neural">Neural (Best quality, slow)</option>
  <option value="slumber">Slumber (Agentic, highest quality)</option>
  <option value="sentence">Sentence (Simple, fast)</option>
  <option value="token">Token (Fixed-size fallback)</option>
</Select>

{chunkerType !== 'hybrid' && (
  <Alert>
    Processing time: +{estimatedDelay[chunkerType]} seconds
  </Alert>
)}
```

**Deliverables**:
- [ ] UI allows chunker selection
- [ ] User preferences saved
- [ ] Document metadata shows chunker type
- [ ] Admin Panel displays chunker stats

---

### Phase 4: Testing & Optimization (Week 4)

**Goal**: A/B test chunker strategies and optimize performance

**Tasks**:
1. Process same 10 documents with all 6 chunkers
2. Measure metrics:
   - Processing time
   - Chunk count
   - Metadata recovery rate
   - Connection quality (3-engine system)
   - User subjective quality
3. Identify optimal chunker per document type
4. Optimize slow chunkers (GPU for neural, batching)
5. Document best practices guide

**A/B Test Metrics**:
```typescript
interface ChunkerComparison {
  chunkerType: string
  processingTime: number  // seconds
  chunkCount: number
  metadataRecovery: number  // percentage
  connections: {
    total: number
    semantic: number
    contradiction: number
    thematic: number
  }
  userRating: number  // 1-5
}
```

**Success Criteria**:
- [ ] All 6 chunkers tested with 10 diverse documents
- [ ] Processing time <20 min for all chunkers (500-page book)
- [ ] Connection quality improvement >15% for semantic/neural vs hybrid
- [ ] Best practice guide created

---

## Technical Implementation Details

### Python Wrapper Script

```python
#!/usr/bin/env python3
"""
Chonkie multi-strategy chunking for Rhizome V2
Supports 6 chunker types: semantic, recursive, neural, slumber, sentence, token
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
                ["\n\n", "\n", " ", ""]
            )
        elif chunker_type == 'neural':
            chunker_config["model"] = config.get("model", "bert-base-uncased")
        elif chunker_type == 'slumber':
            chunker_config["model"] = config.get("model", "gpt-4")
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
        sys.stdout.flush()
        sys.exit(0)

    except Exception as e:
        print(f"ERROR: {e}", file=sys.stderr, flush=True)
        import traceback
        print(traceback.format_exc(), file=sys.stderr, flush=True)
        sys.exit(1)

if __name__ == "__main__":
    main()
```

### TypeScript Wrapper

```typescript
// worker/lib/chonkie/chonkie-chunker.ts
import { spawn } from 'child_process'
import * as path from 'path'

export type ChunkerType =
  | 'semantic'
  | 'recursive'
  | 'neural'
  | 'slumber'
  | 'sentence'
  | 'token'

export interface ChonkieConfig {
  chunker_type: ChunkerType
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
  chunker_type: ChunkerType
}

export async function chonkieChunk(
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
      console.error(`Chonkie ${config.chunker_type}: ${data}`)
    })

    python.on('close', (code) => {
      clearTimeout(timer)

      if (code !== 0) {
        reject(new Error(`Chonkie ${config.chunker_type} failed (exit ${code}): ${stderr}`))
        return
      }

      try {
        const chunks: ChonkieChunk[] = JSON.parse(stdout)
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

### Database Migration

```sql
-- Migration 050: Add chunker_type support
-- Created: 2025-10-14

-- Add chunker_type column to chunks table
ALTER TABLE chunks
ADD COLUMN chunker_type TEXT NOT NULL DEFAULT 'hybrid'
CHECK (chunker_type IN (
  'hybrid',      -- HybridChunker (default, fast)
  'semantic',    -- Chonkie SemanticChunker (narrative, thematic)
  'recursive',   -- Chonkie RecursiveChunker (structured docs)
  'neural',      -- Chonkie NeuralChunker (BERT-based, high quality)
  'slumber',     -- Chonkie SlumberChunker (agentic, highest quality)
  'sentence',    -- Chonkie SentenceChunker (simple sentence boundaries)
  'token'        -- Chonkie TokenChunker (fixed-size fallback)
));

-- Add index for querying by chunker type
CREATE INDEX idx_chunks_chunker_type ON chunks(chunker_type);

-- Add index for document + chunker combination
CREATE INDEX idx_chunks_doc_chunker ON chunks(document_id, chunker_type);

-- Add user preferences for default chunker
ALTER TABLE user_preferences
ADD COLUMN default_chunker_type TEXT DEFAULT 'hybrid'
CHECK (default_chunker_type IN (
  'hybrid', 'semantic', 'recursive', 'neural', 'slumber', 'sentence', 'token'
));

-- Add chunker selection per document
ALTER TABLE documents
ADD COLUMN chunker_type TEXT DEFAULT 'hybrid'
CHECK (chunker_type IN (
  'hybrid', 'semantic', 'recursive', 'neural', 'slumber', 'sentence', 'token'
));
```

---

## Testing Strategy

### Unit Tests

```typescript
// worker/lib/chonkie/__tests__/chonkie-chunker.test.ts
describe('Chonkie Multi-Strategy Chunker', () => {
  const testMarkdown = `
# Chapter 1: Introduction

This is the first paragraph.

This is the second paragraph.

# Chapter 2: Content

More content here.
  `.trim()

  test.each([
    ['semantic', { threshold: 0.7 }],
    ['recursive', { separators: ['\n\n', '\n'] }],
    ['sentence', {}],
    ['token', {}]
  ])('%s chunker produces valid chunks', async (chunkerType, config) => {
    const chunks = await chonkieChunk(testMarkdown, {
      chunker_type: chunkerType as ChunkerType,
      chunk_size: 768,
      ...config
    })

    expect(chunks.length).toBeGreaterThan(0)
    chunks.forEach(chunk => {
      expect(chunk.start_index).toBeGreaterThanOrEqual(0)
      expect(chunk.end_index).toBeGreaterThan(chunk.start_index)
      expect(chunk.token_count).toBeLessThanOrEqual(768)
      expect(chunk.chunker_type).toBe(chunkerType)

      // Verify character offset accuracy
      const extracted = testMarkdown.slice(chunk.start_index, chunk.end_index)
      expect(extracted).toBe(chunk.text)
    })
  })

  test('metadata transfer preserves Docling metadata', async () => {
    const doclingChunks = mockDoclingChunks()
    const cleanedMarkdown = mockCleanedMarkdown()

    // Run semantic chunker
    const chonkieChunks = await chonkieChunk(cleanedMarkdown, {
      chunker_type: 'semantic',
      threshold: 0.7
    })

    // Transfer metadata
    const enrichedChunks = transferMetadataToChonkieChunks(
      chonkieChunks,
      doclingChunks
    )

    // Verify metadata preserved
    enrichedChunks.forEach(chunk => {
      expect(chunk.heading_path).toBeDefined()
      expect(chunk.page_start).toBeDefined()
      expect(chunk.chunker_type).toBe('semantic')
    })
  })
})
```

### Integration Tests

```typescript
// worker/tests/integration/chunker-comparison.test.ts
describe('Chunker Strategy Comparison', () => {
  const testPdf = path.join(__dirname, '../fixtures/test-document.pdf')

  test('all chunkers complete successfully', async () => {
    const chunkerTypes: ChunkerType[] = [
      'hybrid',
      'semantic',
      'recursive',
      'sentence',
      'token'
    ]

    for (const chunkerType of chunkerTypes) {
      const result = await processPDF(testPdf, {
        chunker: chunkerType,
        processing_mode: 'local'
      })

      expect(result.chunks.length).toBeGreaterThan(0)
      expect(result.chunks.every(c => c.chunker_type === chunkerType)).toBe(true)
      expect(result.metadata_recovery_rate).toBeGreaterThan(0.9)
    }
  }, 600000) // 10 min timeout

  test('metadata recovery >90% for all chunkers', async () => {
    const chunkerTypes: ChunkerType[] = ['semantic', 'recursive', 'neural']

    for (const chunkerType of chunkerTypes) {
      const { chunks } = await processPDF(testPdf, { chunker: chunkerType })

      const withMetadata = chunks.filter(c =>
        c.heading_path && c.page_start
      )

      const recoveryRate = withMetadata.length / chunks.length
      expect(recoveryRate).toBeGreaterThan(0.9)
    }
  })
})
```

---

## Performance Expectations

### Processing Time (500-page book)

| Chunker | Time | Chunk Count | Quality | Use Case |
|---------|------|-------------|---------|----------|
| **Hybrid** (baseline) | 15 min | ~382 | Good | Default, fast |
| **Semantic** | 16-17 min | ~370 | Better | Narrative |
| **Recursive** | 15.5-16 min | ~390 | Good | Structured |
| **Neural** | 17-18 min | ~360 | Best | Quality-first |
| **Slumber** | 18-20 min | ~350 | Best | Canonical docs |
| **Sentence** | 15-16 min | ~400 | Good | Clean PDFs |
| **Token** | 15 min | ~420 | Baseline | Fallback |

### Cost Analysis (LOCAL mode)

| Chunker | Additional Cost | Total Processing Cost |
|---------|----------------|----------------------|
| Hybrid | $0.00 | $0.00 |
| Semantic | $0.00 | $0.00 |
| Recursive | $0.00 | $0.00 |
| Neural | $0.00 (GPU optional) | $0.00 |
| Slumber | $0.00 (Ollama) | $0.00 |
| Sentence | $0.00 | $0.00 |
| Token | $0.00 | $0.00 |

**Note**: All Chonkie chunkers are free in LOCAL mode. Slumber can use Ollama (free) or paid APIs (GPT-4).

---

## Success Metrics

### Quantitative Metrics

- [ ] **Processing Time**: <20 min for 500-page book (all chunkers)
- [ ] **Metadata Recovery**: >90% for all chunkers
- [ ] **Chunk Count Variance**: ±10% from HybridChunker baseline
- [ ] **Connection Quality**: >15% improvement for semantic/neural chunkers
- [ ] **Test Coverage**: >90% for chunker system

### Qualitative Metrics

- [ ] **User Satisfaction**: Positive feedback on chunker flexibility
- [ ] **Documentation Quality**: Complete guide for choosing chunker
- [ ] **Error Rate**: <1% chunker failures
- [ ] **Metadata Accuracy**: Manual validation of 20 documents

### Regression Prevention

- [ ] **HybridChunker Path**: Zero regressions (remains default)
- [ ] **Bulletproof Matcher**: 100% recovery guarantee maintained
- [ ] **Existing Documents**: No impact on previously processed documents

---

## Risk Mitigation

### High Risk: Metadata Loss

**Risk**: Chonkie chunks may not align with Docling chunks, losing metadata

**Mitigation**:
- Bulletproof matcher handles misalignment
- Overlap detection algorithm with multiple strategies
- Confidence tracking for metadata transfer
- Fallback to HybridChunker if recovery rate <90%

### Medium Risk: Performance Degradation

**Risk**: Slow chunkers (neural, slumber) may annoy users

**Mitigation**:
- Clear time estimates in UI
- Default to fast HybridChunker
- Optional GPU acceleration for neural
- User choice (speed vs quality)

### Low Risk: Chunker Failure

**Risk**: Python subprocess may fail or hang

**Mitigation**:
- Timeout handling (5 min default)
- Graceful fallback to HybridChunker
- Comprehensive error logging
- Retry mechanism with exponential backoff

---

## Future Enhancements (Out of Scope)

### Not in This PRP

- **Automatic Chunker Selection**: AI chooses chunker based on content analysis
- **Skip-Window Merging**: Cross-chunk semantic merging (complexity not justified)
- **Custom Chunker Training**: Fine-tune neural chunker on personal corpus
- **Chunker Comparison UI**: Side-by-side comparison of chunker outputs
- **Hybrid Chunking**: Combine multiple chunkers for same document

### Potential Follow-Up PRPs

1. **Automatic Chunker Selection** (AI analyzes document, chooses optimal chunker)
2. **Chunker Performance Optimization** (GPU acceleration, caching, parallel processing)
3. **Custom Chunker Training** (Fine-tune on user's document corpus)
4. **Advanced Metadata Transfer** (ML-based metadata prediction for gaps)

---

## References

- **Chonkie Documentation**: https://docs.chonkie.ai
- **Chunker Overview**: https://docs.chonkie.ai/oss/chunkers/overview
- **Pipeline UltraThink Analysis**: `docs/prps/PIPELINE_ULTRATHINK_ANALYSIS.md`
- **Chonkie Integration Research**: `docs/prps/chonkie-semantic-chunking-integration.md`
- **Bulletproof Matcher**: `docs/processing-pipeline/bulletproof-metadata-extraction.md`
- **Current Processing Pipeline**: `docs/PROCESSING_PIPELINE.md`

---

## Approval & Sign-Off

**Status**: Approved for Implementation
**Start Date**: TBD
**Target Completion**: 4 weeks from start

**Key Decisions**:
- ✅ Hybrid approach (not replacement)
- ✅ NO skip-window (simplicity)
- ✅ Bulletproof matcher for metadata transfer
- ✅ 6 chunker strategies (start with Semantic)
- ✅ User choice per document (not automatic)

**Next Steps**:
1. Review and approve this PRP
2. Begin Phase 1: Infrastructure setup
3. Implement chunker types incrementally (Semantic → Recursive → Neural → others)
4. A/B test with real documents
5. Document best practices guide

---

**End of PRP**
