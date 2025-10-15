# Complete Pipeline Flow: Upload to Connections

**Last Updated**: 2025-10-15
**Pipeline Version**: Unified Chonkie Pipeline (10 stages)
**Status**: Current implementation

This document traces the complete flow from "user drops a PDF" to "connections surface in the reader."

---

## Overview: The 10-Stage Pipeline

```
Upload → Docling Extract → Cleanup → Bulletproof Match →
Review → Chonkie Chunk → Metadata Transfer → Enrich →
Embed → Connections → Display
```

**Key Architecture**:
- **Storage-First**: Every stage saves to Supabase Storage
- **Database as Cache**: DB for queryable data only
- **Unified Pipeline**: One path, 9 chunking strategies
- **100% Local Option**: Zero API cost via Docling + Ollama + Transformers.js

---

## Stage 1: Upload & Job Creation (0-10%)

### User Action
```
User drops PDF → Frontend uploads to Supabase Storage → Creates background_job
```

### Storage
```
storage/documents/{userId}/{documentId}/source.pdf
```

### Database State
```sql
background_jobs {
  id: "job_123",
  document_id: "doc_456",
  status: "pending",
  job_type: "process_document",
  input_data: {
    document_id: "doc_456",
    source_type: "pdf",
    storage_path: "userId/documentId",
    chunker_type: "recursive"  -- User-selected strategy
  }
}

documents {
  id: "doc_456",
  title: "Gravity's Rainbow",
  source_type: "pdf",
  storage_path: "userId/documentId",
  processing_status: "processing"
}
```

---

## Stage 2: Docling Extraction (10-50%)

### Purpose
Extract structured content with metadata anchors (heading paths, page numbers, bboxes).

### Processing (LOCAL Mode)
```typescript
// worker/lib/local/docling-extractor.ts
const pythonScript = 'worker/scripts/docling_extract.py'

const result = await executePythonScript(pythonScript, {
  pdf_path: localPdfPath,
  config: {
    extract_images: true,
    extract_tables: true,
    chunk_size: 768,  // HybridChunker tokens
    tokenizer: 'Xenova/all-mpnet-base-v2'
  }
})

// Returns: { markdown, chunks: [...] }
```

### Docling Output
```typescript
{
  markdown: "# Gravity's Rainbow\n\n## Part 1: Beyond the Zero...",
  chunks: [
    {
      text: "The opening scene introduces Tyrone Slothrop...",
      start_offset: 0,
      end_offset: 2847,
      token_count: 412,
      heading_path: ["Part 1: Beyond the Zero", "Chapter 1"],
      heading_level: 2,
      page_start: 1,
      page_end: 3,
      bbox: {...}  // Bounding boxes
    }
    // ... ~382 chunks with structural metadata
  ]
}
```

### Storage Save
```typescript
// Save cleaned markdown
await supabase.storage
  .from('documents')
  .upload(`${storagePath}/content.md`, markdown)

// Save Docling chunks for later coordinate mapping
await supabase.from('cached_chunks').insert(
  doclingChunks.map(c => ({
    document_id,
    ...c,
    source: 'docling'
  }))
)
```

**Progress**: "Extracted 150,000 words with structural metadata"

---

## Stage 3: Cleanup (50-70%)

### Purpose
Clean markdown for optimal Chonkie chunking.

### Processing (LOCAL Mode - Ollama)
```typescript
// worker/lib/local/ollama-cleanup.ts
const cleanedMarkdown = await ollamaClient.cleanup(markdown, {
  model: 'qwen2.5:32b-instruct-q4_K_M',
  operations: [
    'fix_encoding_errors',
    'normalize_whitespace',
    'fix_broken_sentences',
    'remove_page_artifacts'
  ]
})

// Fallback: If OOM error, use regex-only cleanup
if (error.message.includes('out of memory')) {
  cleanedMarkdown = regexCleanup(markdown)
}
```

### Processing (CLOUD Mode - Gemini)
```typescript
const result = await gemini.generateContent({
  model: 'gemini-2.5-flash-lite',
  prompt: `Clean this markdown: fix encoding, normalize whitespace, preserve structure.

  ${markdown}`
})
```

**Progress**: "Cleaned 150,000 words"

---

## Stage 4: Bulletproof Matching (70-72%)

### Purpose
Create coordinate map: Docling chunks → cleaned markdown positions.

### Why Needed
Cleanup may change character positions. We need to know where Docling metadata lives in cleaned markdown so we can later detect overlaps with Chonkie chunks.

### Processing
```typescript
// worker/lib/local/bulletproof-matcher.ts
const matchResults = await bulletproofMatcher.match({
  originalChunks: doclingChunks,
  cleanedMarkdown,
  layers: [
    'exact_match',           // Layer 1: Perfect matches
    'normalized_match',      // Layer 2: Whitespace-normalized
    'fuzzy_match',          // Layer 3: Levenshtein distance
    'embedding_match',       // Layer 4: Cosine similarity >0.85
    'anchor_interpolation'   // Layer 5: Synthetic chunks (never fails)
  ]
})

// Result: Every Docling chunk now has position in cleaned markdown
// [
//   {
//     chunk_id: "docling_0",
//     start_offset: 0,
//     end_offset: 2847,
//     confidence: "exact",
//     metadata: { heading_path: [...], page_start: 1, ... }
//   }
// ]
```

**Confidence Levels**:
- `exact`: Perfect match
- `high`: >0.95 similarity
- `medium`: 0.85-0.95 similarity
- `synthetic`: Interpolated position (user validation recommended)

**Quality Target**: 85-90% exact matches, <5% synthetic

**Progress**: "Mapped 382 metadata anchors (87% exact matches)"

---

## Stage 5: Review Checkpoint (72% - Optional)

### Purpose
Allow user to review cleaned markdown before chunking.

### When Enabled
```typescript
if (reviewBeforeChunking) {
  await supabase.from('documents').update({
    processing_status: 'review_required',
    review_stage: 'pre_chunking'
  })
  // Pauses pipeline, waits for user approval
}
```

**Most users skip this step.**

---

## Stage 6: Chonkie Chunking (72-75%)

### Purpose
Semantic chunking with user-selected strategy (9 options).

### Strategy Selection
```typescript
const chunkerType = userPreferences.default_chunker_type || 'recursive'

// 9 strategies available:
// token, sentence, recursive (DEFAULT), semantic, late,
// code, neural, slumber, table
```

### Processing
```typescript
// worker/lib/chonkie/chonkie-chunker.ts
const pythonScript = 'worker/scripts/chonkie_chunk.py'

const chonkieChunks = await executePythonScript(pythonScript, {
  markdown: cleanedMarkdown,
  config: {
    chunker_type: 'recursive',
    chunk_size: 512,
    tokenizer: 'gpt2'
  }
})

// CRITICAL: Character offset validation
for (const chunk of chonkieChunks) {
  const extracted = cleanedMarkdown.slice(chunk.start_index, chunk.end_index)
  if (extracted !== chunk.text) {
    throw new Error('Character offset mismatch - metadata transfer will fail')
  }
}
```

### Chonkie Output
```typescript
[
  {
    text: "The opening scene introduces Tyrone Slothrop, a lieutenant...",
    start_index: 0,
    end_index: 2104,
    token_count: 387,
    chunker_type: "recursive"
  },
  {
    text: "Slothrop's conditioning by Pavlovian methods reveals...",
    start_index: 2105,
    end_index: 4289,
    token_count: 412,
    chunker_type: "recursive"
  }
  // ... ~350-420 chunks (semantic boundaries)
]
```

**Key Difference from Docling Chunks**:
- **Docling**: Structural boundaries (headings, pages) - ~382 chunks
- **Chonkie**: Semantic boundaries (topic shifts) - ~350-420 chunks
- **Overlap**: 70-90% of Chonkie chunks overlap with 1-3 Docling chunks

**Progress**: "Chunked into 382 semantic segments (recursive strategy)"

---

## Stage 7: Metadata Transfer (75-77%)

### Purpose
Transfer Docling metadata (headings, pages, bboxes) to Chonkie chunks via overlap detection.

### The Core Insight
**Overlaps are EXPECTED and BENEFICIAL.** Multiple Docling chunks overlapping a Chonkie chunk = PRIMARY MECHANISM for metadata transfer.

### Overlap Detection
```typescript
// worker/lib/chonkie/metadata-transfer.ts
function detectOverlap(doclingChunk, chonkieChunk) {
  // Do they overlap?
  return (
    doclingChunk.start_offset < chonkieChunk.end_index &&
    doclingChunk.end_offset > chonkieChunk.start_index
  )
}

function calculateOverlapPercentage(doclingChunk, chonkieChunk) {
  const overlapStart = Math.max(doclingChunk.start_offset, chonkieChunk.start_index)
  const overlapEnd = Math.min(doclingChunk.end_offset, chonkieChunk.end_index)
  const overlapSize = Math.max(0, overlapEnd - overlapStart)
  const chonkieSize = chonkieChunk.end_index - chonkieChunk.start_index
  return overlapSize / chonkieSize
}
```

### Metadata Aggregation
```typescript
for (const chonkieChunk of chonkieChunks) {
  // Find overlapping Docling chunks
  const overlaps = bulletproofMatches.filter(docling =>
    detectOverlap(docling, chonkieChunk)
  )

  if (overlaps.length > 0) {
    // Aggregate metadata from all overlaps
    const metadata = {
      heading_path: unionHeadings(overlaps),  // Unique headings
      page_start: Math.min(...overlaps.map(o => o.page_start)),
      page_end: Math.max(...overlaps.map(o => o.page_end)),
      bboxes: overlaps.flatMap(o => o.bboxes),
      section_marker: overlaps[0].section_marker  // First non-null
    }

    // Calculate confidence
    const avgOverlap = overlaps.reduce((sum, o) =>
      sum + calculateOverlapPercentage(o, chonkieChunk), 0
    ) / overlaps.length

    const confidence =
      overlaps.length >= 3 || avgOverlap > 0.7 ? 'high' :
      overlaps.length >= 1 && avgOverlap > 0.3 ? 'medium' : 'low'

    enrichedChunks.push({
      ...chonkieChunk,
      ...metadata,
      metadata_overlap_count: overlaps.length,
      metadata_confidence: confidence,
      metadata_interpolated: false
    })
  } else {
    // Interpolation fallback (<10% of chunks)
    const nearest = findNearestDoclingChunk(chonkieChunk)
    enrichedChunks.push({
      ...chonkieChunk,
      ...nearest.metadata,
      metadata_overlap_count: 0,
      metadata_confidence: 'low',
      metadata_interpolated: true  // Flag for user review
    })
  }
}
```

### Result
```typescript
{
  // Chonkie content
  content: "The opening scene introduces Tyrone Slothrop...",
  start_offset: 0,
  end_offset: 2104,
  token_count: 387,
  chunker_type: "recursive",

  // Transferred Docling metadata
  heading_path: ["Part 1: Beyond the Zero", "Chapter 1"],
  heading_level: 2,
  page_start: 1,
  page_end: 3,
  bboxes: [...],

  // Quality tracking
  metadata_overlap_count: 3,         // 3 Docling chunks overlapped
  metadata_confidence: "high",       // 92% of chunks achieve this
  metadata_interpolated: false
}
```

**Quality Metrics**:
- Overlap coverage: 70-90% (chunks with ≥1 overlap)
- Metadata recovery: >90% (chunks with heading_path OR page_start)
- High confidence: 92% of chunks
- Interpolated: <10% of chunks

**Progress**: "Transferred metadata to 382 chunks (92% high confidence)"

---

## Stage 8: Metadata Enrichment (77-90%)

### Purpose
Extract themes, concepts, emotional tone, importance scores.

### Processing (LOCAL Mode - PydanticAI + Ollama)
```typescript
// worker/lib/chunking/pydantic-metadata.ts
const pythonScript = 'worker/scripts/extract_metadata_pydantic.py'

const enrichedChunks = await executePythonScript(pythonScript, {
  chunks: chunks.map(c => c.content),
  config: {
    model: 'qwen2.5:32b-instruct-q4_K_M',
    ollama_host: 'http://127.0.0.1:11434'
  }
})

// Returns structured metadata via PydanticAI validation
```

### Enriched Output
```typescript
{
  content: "The opening scene introduces...",

  // From Docling (Stage 7)
  heading_path: ["Part 1: Beyond the Zero"],
  page_start: 1,

  // From PydanticAI Enrichment (Stage 8)
  themes: ["postmodern literature", "paranoia", "entropy"],
  concepts: [
    { text: "V-2 rocket", importance: 0.9 },
    { text: "Pavlovian conditioning", importance: 0.8 },
    { text: "corporate control", importance: 0.7 }
  ],
  emotional_tone: {
    polarity: -0.3,  // Slightly negative
    primaryEmotion: "anxiety"
  },
  importance_score: 0.85,
  word_count: 412
}
```

**Progress**: "Enriched 382 chunks with themes and concepts"

---

## Stage 9: Embeddings Generation (90-95%)

### Processing (LOCAL Mode - Transformers.js)
```typescript
// worker/lib/local/embeddings-local.ts
import { pipeline } from '@huggingface/transformers'

const embedder = await pipeline('feature-extraction',
  'Xenova/all-mpnet-base-v2',
  { pooling: 'mean', normalize: true }
)

// Metadata-enhanced embeddings
const embeddings = await Promise.all(
  chunks.map(async chunk => {
    // Prepend heading context for 15-25% retrieval quality improvement
    const context = chunk.heading_path?.join(' > ') || ''
    const enhanced = `${context}\n\n${chunk.content}`

    const embedding = await embedder(enhanced)
    return embedding.data  // 768d vector
  })
)
```

### Processing (CLOUD Mode - Gemini)
```typescript
import { embedMany } from 'ai'
import { google } from '@ai-sdk/google'

const { embeddings } = await embedMany({
  model: google.textEmbeddingModel('gemini-embedding-001', {
    outputDimensionality: 768
  }),
  values: chunks.map(c => c.content)
})
```

### Database Update
```sql
chunks {
  id: "chunk_0",
  document_id: "doc_456",
  content: "The opening scene...",
  embedding: vector(768),  -- Now populated
  ...
}
```

**Progress**: "Generated 768d embeddings for 382 chunks"

---

## Stage 10: Connection Detection (95-100%)

### The 3-Engine System

For each chunk, run 3 distinct engines:

#### Engine 1: Semantic Similarity (25% weight)

**Purpose**: Find "these say the same thing"

```typescript
// worker/engines/semantic-similarity.ts
const semanticMatches = await supabase.rpc('match_chunks', {
  query_embedding: chunk.embedding,
  threshold: 0.7,
  exclude_document: chunk.document_id,
  limit: 50
})

// Finds chunks with similar embeddings
// Cost: $0 (pgvector cosine similarity)
// Speed: Very fast (indexed vector search)
```

#### Engine 2: Contradiction Detection (40% weight - Highest!)

**Purpose**: Find "these disagree about the same thing"

```typescript
// worker/engines/contradiction-detection.ts
for (const targetChunk of corpus) {
  // Same concepts + opposite emotional polarity?
  const sharedConcepts = getSharedConcepts(
    chunk.concepts,
    targetChunk.concepts
  )

  if (sharedConcepts.length > 0) {
    const oppositePolarity =
      chunk.emotional_tone.polarity > 0.3 &&
      targetChunk.emotional_tone.polarity < -0.3

    if (oppositePolarity) {
      connections.push({
        sourceChunkId: chunk.id,
        targetChunkId: targetChunk.id,
        type: 'contradiction_detection',
        strength: 0.8,
        metadata: {
          sharedConcepts,
          polarityDifference: Math.abs(
            chunk.emotional_tone.polarity -
            targetChunk.emotional_tone.polarity
          )
        }
      })
    }
  }
}

// Finds conceptual tensions
// Example: "paranoia" discussed positively vs negatively
// Cost: $0 (uses extracted metadata)
```

#### Engine 3: Thematic Bridge (35% weight)

**Purpose**: Find "these connect different domains through shared concepts"

```typescript
// worker/engines/thematic-bridge.ts

// AGGRESSIVE FILTERING to reduce AI calls
// Filter 1: Only important chunks
if (chunk.importance_score < 0.6) return []

// Filter 2: Cross-document only
const crossDocCandidates = corpus.filter(
  c => c.document_id !== chunk.document_id
)

// Filter 3: Different domains
// Filter 4: Concept overlap 0.2-0.7 (sweet spot)
// Filter 5: Top 15 candidates

const candidates = filterCandidates(chunk, crossDocCandidates)
// Result: ~5-15 candidates per source chunk

// NOW use AI to analyze bridges
for (const candidate of candidates) {
  const analysis = await analyzeBridge(chunk, candidate)

  if (analysis.connected && analysis.strength >= 0.6) {
    connections.push({
      sourceChunkId: chunk.id,
      targetChunkId: candidate.id,
      type: 'thematic_bridge',
      strength: analysis.strength,
      metadata: {
        bridgeType: analysis.bridgeType,
        sharedConcept: analysis.sharedConcept,
        sourceDomain: chunk.themes[0],
        targetDomain: candidate.themes[0]
      }
    })
  }
}

// Finds cross-domain connections
// Example: "paranoia" in Gravity's Rainbow ↔ "surveillance capitalism"
// Cost: ~200 AI calls per document = ~$0.20
```

### Database Storage
```sql
connections {
  source_chunk_id: "chunk_0",
  target_chunk_id: "chunk_847",  -- From different book!
  type: "thematic_bridge",
  strength: 0.87,
  auto_detected: true,
  user_validated: false,
  discovered_at: "2025-10-15T...",
  metadata: {
    bridgeType: "cross_domain",
    sharedConcept: "institutional paranoia",
    sourceDomain: "literature",
    targetDomain: "technology"
  }
}
```

**Progress**: "Detected 85 connections (47 semantic, 23 contradictions, 15 bridges)"

---

## Stage 11: Storage-First Export

### Purpose
Save all enriched data to Supabase Storage (source of truth).

### Files Saved
```
storage/documents/{userId}/{documentId}/
├── source.pdf                  # Original upload
├── content.md                  # Cleaned markdown
├── chunks.json                 # Enriched chunks (FINAL)
├── metadata.json               # Document metadata
├── manifest.json               # File inventory + costs
└── cached_chunks.json          # Docling chunks (LOCAL mode only)
```

### chunks.json Example
```json
[
  {
    "id": "chunk_0",
    "chunk_index": 0,
    "content": "The opening scene introduces...",
    "start_offset": 0,
    "end_offset": 2104,
    "heading_path": ["Part 1: Beyond the Zero"],
    "page_start": 1,
    "page_end": 3,
    "themes": ["postmodern literature", "paranoia"],
    "concepts": [
      {"text": "V-2 rocket", "importance": 0.9}
    ],
    "emotional_tone": {"polarity": -0.3, "primaryEmotion": "anxiety"},
    "importance_score": 0.85,
    "embedding": [0.123, 0.456, ...],  // 768d vector
    "chunker_type": "recursive",
    "metadata_confidence": "high"
  }
]
```

**Progress**: "Saved 382 chunks to Storage (source of truth)"

---

## Stage 12: Reading Experience

### The Hybrid Display Architecture

**What you see** (continuous markdown):
```
┌─────────────────────────────────────────────────────┐
│ # Gravity's Rainbow                                 │
│                                                     │
│ ## Part 1: Beyond the Zero                         │
│                                                     │
│ The opening scene introduces Tyrone Slothrop...    │
│ [Continuous markdown, natural reading flow]         │
│ [No chunk boundaries visible]                       │
│                                                     │
│ Slothrop's conditioning by Pavlovian methods...    │
└─────────────────────────────────────────────────────┘
```

**What the system tracks**:
```typescript
// Viewport tracking
const visibleOffsets = { start: 0, end: 3500 }

// Which chunks are visible?
const visibleChunks = chunks.filter(c =>
  c.start_offset <= 3500 && c.end_offset >= 0
)
// Result: [chunk_0, chunk_1] are in viewport
```

### Connection Surfacing

**RightPanel shows connections for visible chunks**:
```
┌─────────────────────────────────────────┐
│ Connections Tab                         │
│                                         │
│ ⚡ Contradiction (0.92)                 │
│ ├─ "1984" - Chapter 3                  │
│ └─ Different views on institutional    │
│    control mechanisms                   │
│                                         │
│ 🌉 Thematic Bridge (0.87)              │
│ ├─ "Surveillance Capitalism"           │
│ └─ Cross-domain: paranoia (literature) │
│    ↔ surveillance (technology)         │
│                                         │
│ 📊 Semantic (0.79)                     │
│ ├─ "Catch-22" - Opening                │
│ └─ Similar themes: military paranoia   │
└─────────────────────────────────────────┘
```

### Personal Weight Scoring
```typescript
// User-configurable weights (from user_preferences)
const weights = {
  semantic: 0.25,
  contradiction: 0.40,  // Highest by default
  thematic_bridge: 0.35
}

// Score each connection
const finalScore =
  weights.semantic * connection.semantic_strength +
  weights.contradiction * connection.contradiction_strength +
  weights.thematic_bridge * connection.bridge_strength

// Sort and display
const topConnections = connections
  .map(c => ({ ...c, finalScore }))
  .sort((a, b) => b.finalScore - a.finalScore)
  .slice(0, 10)
```

### As You Scroll
```typescript
onScroll(() => {
  const newVisibleChunks = getVisibleChunks(viewport)
  const connections = getConnectionsFor(newVisibleChunks)

  const scored = connections.map(c => ({
    ...c,
    finalScore: scoreWithPersonalWeights(c, userWeights)
  }))

  updateSidebar(scored.sort((a, b) => b.finalScore - a.finalScore))
})
```

---

## Cost Breakdown

### For 500-Page Book (Gravity's Rainbow) - CLOUD Mode

**Docling Extraction**: $0 (local)
**Cleanup**: $0.02 (single Gemini call)
**Chonkie Chunking**: $0 (local)
**Metadata Enrichment**: $0.20 (batched Gemini)
**Embeddings**: $0.02 (382 chunks)
**Thematic Bridge**: $0.20 (~200 AI calls)

**Total: ~$0.44 per 500-page book**

### For 500-Page Book - LOCAL Mode

**All stages**: $0.00 (Docling + Ollama + Transformers.js)
**Hardware**: M1 Max 64GB (one-time $3,000 investment)
**Break-even**: ~7,000 books

---

## Processing Time

### For Gravity's Rainbow (400 pages, 150k words) - LOCAL Mode

- Docling Extract: ~8-12 minutes
- Cleanup (Ollama): ~2-3 minutes
- Bulletproof Match: <30 seconds
- Chonkie Chunk (recursive): ~2-3 minutes
- Metadata Transfer: <10 seconds
- Enrichment (PydanticAI): ~5-8 minutes
- Embeddings (Transformers.js): ~3-5 minutes
- 3-Engine Detection: ~3-5 minutes

**Total: ~20-30 minutes** (fits within "coffee break" target)

---

## Key Architectural Insights

### Two Layers Working in Harmony

1. **Display Layer**: You read continuous markdown
   - Source: `content.md` from Storage
   - No chunk boundaries
   - Natural reading experience

2. **Connection Layer**: System operates on chunks
   - Source: `chunks` table + Storage
   - 3 engines detect connections
   - Surfaces in sidebar based on viewport

### The Bridge
- Chunks have `start_offset` and `end_offset`
- System tracks scroll position
- Maps position → visible chunks → their connections
- Sidebar updates as you read

### Storage-First Architecture
- **Storage = Source of Truth**: All AI-enriched data saved to Storage
- **Database = Queryable Cache**: For search, connections, queries
- **Zero Data Loss**: Import from Storage, not reprocessing
- **Development Velocity**: DB reset + restore in 6 min vs 25 min reprocessing

---

## Summary

```
Upload PDF
  ↓
Docling Extract (structural metadata anchors)
  ↓
Cleanup (Ollama or Gemini)
  ↓
Bulletproof Match (coordinate mapping)
  ↓
Chonkie Chunk (9 strategies, semantic boundaries)
  ↓
Metadata Transfer (overlap detection 70-90%)
  ↓
Enrich (PydanticAI + Ollama)
  ↓
Embed (Transformers.js or Gemini, 768d)
  ↓
3-Engine Detection (Semantic, Contradiction, Thematic)
  ↓
Storage Export (chunks.json, source of truth)
  ↓
Read & Surface (hybrid display/connection layers)
```

**The 3 engines each do something distinct**:
- **Semantic**: "These say the same thing" (fast baseline)
- **Contradiction**: "These disagree about X" (conceptual tension) - 40% weight!
- **Thematic Bridge**: "These connect across domains" (surprising insights)

**Cost-effective through**:
- Unified pipeline (one path, predictable)
- 100% local option (zero API cost)
- Aggressive filtering (ThematicBridge: 200 calls vs 145k possible)
- Smart architecture (continuous markdown + semantic chunks)

**The result**: ~$0.44 per book (CLOUD) or $0 (LOCAL), meaningful connections, natural reading flow.
