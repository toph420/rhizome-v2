# The Complete Processing Pipeline

Let me trace the entire flow from "you drop a PDF" to "connections surface in the reader."

## Stage 1: Upload & Job Creation

```
User drops PDF → Frontend uploads to Supabase storage → Creates background_job record
```

**Where it lands:**
```
storage/documents/{userId}/{documentId}/source.pdf
```

**Database state:**
```sql
background_jobs {
  id: "job_123",
  document_id: "doc_456",
  status: "pending",
  input_data: {
    document_id: "doc_456",
    source_type: "pdf",
    storage_path: "userId/documentId"
  }
}
```

## Stage 2: PDF Processor Takes Over

**PDFProcessor.process() decides: single-pass or batched?**

```typescript
const useBatched = totalPages > 200; // Threshold for batched processing
```

### For Small Documents (<200 pages): Single Pass

**2.1: Download & Upload (10-20%)**
```typescript
const fileBuffer = await fileResponse.arrayBuffer()
const fileUri = await this.ai.files.upload({
  file: new Blob([buffer], { type: 'application/pdf' }),
  config: { mimeType: 'application/pdf' }
})
```

**2.2: Extract Everything (20-80%)**
```typescript
const result = await this.ai.models.generateContent({
  model: 'gemini-2.5-flash-lite',
  contents: [{
    parts: [
      { fileData: { fileUri, mimeType: 'application/pdf' } },
      { text: EXTRACTION_PROMPT }
    ]
  }],
  config: { maxOutputTokens: 65536 }
})

const markdown = result.text
// Progress: "Extracted 50,000 words"
```

### For Large Documents (500+ pages): Batched Processing

**2.1: Batched Extraction (15-40%)**

Extract 100 pages at a time with 10-page overlap:

```typescript
const BATCH_SIZE = 100;
const OVERLAP_PAGES = 10;
const batches = [];

for (let start = 0; start < totalPages; start += BATCH_SIZE - OVERLAP_PAGES) {
  const end = Math.min(start + BATCH_SIZE, totalPages);
  
  console.log(`📄 Extracting pages ${start + 1}-${end} (batch ${batchNum}/${totalBatches})`);
  
  const result = await ai.models.generateContent({
    model: 'gemini-2.5-flash-lite',
    contents: [{
      parts: [
        { fileData: { fileUri, mimeType: 'application/pdf' } },
        { text: `Extract pages ${start + 1} through ${end} as clean markdown.
                 Preserve ALL text verbatim. Return ONLY markdown.` }
      ]
    }],
    config: { maxOutputTokens: 65536, temperature: 0.1 }
  });
  
  batches.push(result.text);
}
// Cost: 6 batches × $0.02 = $0.12 for 500-page book
```

**2.2: Intelligent Stitching (40-45%)**

```typescript
let stitched = batches[0].markdown;

for (let i = 1; i < batches.length; i++) {
  const prevEnd = batches[i - 1].markdown.slice(-2000);
  const currStart = batches[i].markdown.slice(0, 3000);
  
  // Find overlap using fuzzy matching
  const overlapPoint = findBestOverlap(prevEnd, currStart);
  
  if (overlapPoint > 0) {
    console.log(`🔗 Found overlap at position ${overlapPoint}`);
    stitched += batches[i].markdown.slice(overlapPoint);
  } else {
    console.warn(`⚠️  No overlap found, using paragraph boundary`);
    const paraStart = batches[i].markdown.indexOf('\n\n');
    stitched += paraStart > 0 
      ? batches[i].markdown.slice(paraStart)
      : '\n\n' + batches[i].markdown;
  }
}

// Result: Full 150k word document, overlaps removed
// Progress: "Stitched 6 batches into 150,000 words"
```

**Fuzzy matching handles:**
- Pages split mid-sentence
- OCR variations between batches
- Formatting differences
- Whitespace inconsistencies

### 2.3: Batched Chunking + Metadata (45-85%)

```typescript
const allChunks = [];
const WINDOW_SIZE = 100000; // ~25k tokens
let position = 0;
let chunkIndex = 0;

while (position < markdown.length) {
  const section = markdown.slice(position, position + WINDOW_SIZE);
  const progress = Math.round((position / markdown.length) * 100);
  
  console.log(`🔍 Chunking: ${progress}% (${Math.round(remaining / 1000)}k chars remaining)`);
  
  const result = await ai.models.generateContent({
    model: 'gemini-2.5-flash-lite',
    contents: [{ parts: [{ text: `
      Extract semantic chunks (200-500 words) starting at character ${position}.
      
      For each chunk return:
      - content: actual text
      - themes: 2-3 key topics
      - concepts: [{text, importance}] - 5-10 concepts with scores
      - emotional_tone: {polarity: -1 to 1, primaryEmotion}
      - importance_score: 0-1
      - start_offset, end_offset (absolute positions)
      
      Return JSON: { chunks: [...], lastProcessedOffset: number }
      
      Markdown: ${section}
    `}] }],
    config: { maxOutputTokens: 65536, temperature: 0.1 }
  });
  
  const response = JSON.parse(result.text);
  
  for (const chunk of response.chunks) {
    allChunks.push({
      ...chunk,
      chunk_index: chunkIndex++,
      word_count: chunk.content.split(/\s+/).length
    });
  }
  
  position = response.lastProcessedOffset;
}

// Result: 382 chunks with rich metadata
// Cost: 10 batches × $0.02 = $0.20 for 500-page book
```

**What each chunk contains:**
```typescript
{
  content: "The opening scene of Pynchon's novel... [400 words]",
  chunk_index: 0,
  start_offset: 0,
  end_offset: 2847,
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

## Stage 3: Handler Takes Over (85-100%)

**The processor returns:**

```typescript
return {
  markdown: "# Gravity's Rainbow\n\n...",  // Full 150k word document
  chunks: [/* 382 chunks with rich metadata */],
  metadata: { sourceUrl: "..." },
  wordCount: 150000,
  outline: [/* hierarchical structure */]
}
```

### 3.1: Save Full Markdown (85%)
```typescript
await supabase.storage
  .from('documents')
  .upload(`${storagePath}/content.md`, markdown)
```

### 3.2: Insert Document Record (87%)
```typescript
await supabase.from('documents').insert({
  id: documentId,
  title: "Gravity's Rainbow",
  storage_path: storagePath,
  markdown_content: markdown,
  word_count: 150000,
  outline: [...]
})
```

### 3.3: Batch Insert Chunks (90%)
```typescript
await batchInsertChunks(supabase, chunks)
// Inserts all 382 chunks with metadata
```

**Database state:**
```sql
chunks {
  id: "chunk_0",
  document_id: "doc_456",
  chunk_index: 0,
  content: "The opening scene...",
  start_offset: 0,
  end_offset: 2847,
  themes: ["postmodern literature", "paranoia"],
  concepts: [
    {"text": "V-2 rocket", "importance": 0.9},
    {"text": "Pavlovian conditioning", "importance": 0.8}
  ],
  emotional_tone: {"polarity": -0.3, "primaryEmotion": "anxiety"},
  importance_score: 0.85,
  embedding: null,  -- Not yet generated
  metadata: {...}   -- Full metadata structure
}
-- × 382 chunks
```

### 3.4: Generate Embeddings (92-95%)
```typescript
// Batch process using Vercel AI SDK
import { embedMany } from 'ai';
import { google } from '@ai-sdk/google';

const { embeddings } = await embedMany({
  model: google.textEmbeddingModel('gemini-embedding-001', {
    outputDimensionality: 768
  }),
  values: chunks.map(c => c.content)
});

// Cost: ~$0.02 for 382 chunks
```

**Updated chunks:**
```sql
chunks {
  ...
  embedding: vector(768)  -- Now populated
}
```

### 3.5: 3-Engine Connection Detection (95-100%)

**For each chunk, run 3 distinct engines:**

#### Engine 1: Semantic Similarity (Fast, No AI)

```typescript
// Uses pgvector cosine similarity
const semanticMatches = await supabase.rpc('match_chunks', {
  query_embedding: chunk.embedding,
  threshold: 0.7,
  exclude_document: chunk.document_id,
  limit: 50
});

// Finds: "These say the same thing"
// Cost: $0 (just vector math)
```

#### Engine 2: Contradiction Detection (Metadata-Enhanced)

```typescript
for (const targetChunk of corpus) {
  // Check: Same concepts + opposite emotional polarity?
  const sharedConcepts = getSharedConcepts(
    chunk.concepts,
    targetChunk.concepts
  );
  
  if (sharedConcepts.length > 0) {
    const oppositePolarity = 
      chunk.emotional_tone.polarity > 0.3 &&
      targetChunk.emotional_tone.polarity < -0.3;
    
    if (oppositePolarity) {
      // Found conceptual tension!
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
      });
    }
  }
}

// Finds: "These disagree about the same thing"
// Cost: $0 (uses extracted metadata)
```

#### Engine 3: Thematic Bridge (AI-Powered, Filtered)

```typescript
// AGGRESSIVE FILTERING to reduce AI calls

// Filter 1: Only important chunks
if (chunk.importance_score < 0.6) return [];

// Filter 2: Cross-document only
const crossDocCandidates = corpus.filter(
  c => c.document_id !== chunk.document_id
);

// Filter 3: Different domains
// Filter 4: Concept overlap 0.2-0.7 (sweet spot)
// Filter 5: Top 15 candidates

// Result: ~5-15 candidates per source chunk
const candidates = filterCandidates(chunk, crossDocCandidates);

// NOW use AI to analyze bridges
for (const candidate of candidates) {
  const analysis = await analyzeBridge(chunk, candidate);
  
  if (analysis.connected && analysis.strength >= 0.6) {
    connections.push({
      sourceChunkId: chunk.id,
      targetChunkId: candidate.id,
      type: 'thematic_bridge',
      strength: analysis.strength,
      metadata: {
        bridgeType: analysis.bridgeType,
        sharedConcept: analysis.sharedConcept
      }
    });
  }
}

// Finds: "These connect different domains through shared concepts"
// Example: "paranoia" in Gravity's Rainbow ↔ "surveillance capitalism"
// Cost: ~200 AI calls per document = ~$0.20
```

**All engines write to:**
```sql
connections {
  source_chunk_id: "chunk_0",
  target_chunk_id: "chunk_847",  -- From different book!
  type: "thematic_bridge",
  strength: 0.87,
  auto_detected: true,
  discovered_at: "2025-09-30T...",
  metadata: {
    bridgeType: "cross_domain",
    sharedConcept: "institutional paranoia",
    sourceDomain: "literature",
    targetDomain: "technology"
  }
}
```

**Connections stored, filtered at display time using personal weights.**

## Stage 4: Reading Experience

### The Hybrid Display

**What you see:**
```
┌─────────────────────────────────────────────────────┐
│ # Gravity's Rainbow                                 │
│                                                     │
│ ## Part 1: Beyond the Zero                         │
│                                                     │
│ The opening scene of Pynchon's novel introduces... │
│ [Continuous markdown, natural reading flow]         │
│ [No chunk boundaries visible]                       │
│                                                     │
│ Tyrone Slothrop is being conditioned by...        │
└─────────────────────────────────────────────────────┘
```

**What the system tracks:**
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

**Sidebar shows connections for visible chunks:**
```
┌─────────────────────────────────────────┐
│ Connections                             │
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

**Scored using personal weights:**
```typescript
score = 
  0.25 * semantic_strength +
  0.40 * contradiction_strength +  // Highest weight
  0.35 * thematic_bridge_strength
```

### As You Scroll

```typescript
onScroll(() => {
  const newVisibleChunks = getVisibleChunks(viewport)
  const connections = getConnectionsFor(newVisibleChunks)
  
  // Apply personal weights
  const scored = connections.map(c => ({
    ...c,
    finalScore: 
      0.25 * c.semantic_strength +
      0.40 * c.contradiction_strength +
      0.35 * c.bridge_strength
  }))
  
  updateSidebar(scored.sortBy('finalScore'))
})
```

## Cost Breakdown

### For 500-Page Book (Gravity's Rainbow)

**Extraction:**
- 6 batches × $0.02 = **$0.12**

**Metadata:**
- 10 batches × $0.02 = **$0.20**

**Embeddings:**
- 382 chunks = **$0.02**

**Connection Detection:**
- Semantic: $0 (vector math)
- Contradiction: $0 (metadata)
- ThematicBridge: 200 AI calls = **$0.20**

**Total: ~$0.54 per 500-page book**

## Processing Time

**For Gravity's Rainbow (400 pages, 150k words):**

- Extract (batched): ~5-7 minutes
- Stitch: <10 seconds (local)
- Metadata (batched): ~8-12 minutes
- Embeddings: ~1-2 minutes
- Connections (3 engines): ~3-5 minutes

**Total: ~20-25 minutes**

## The Key Insight

**Two layers working in harmony:**

1. **Display Layer**: You read continuous markdown
   - Source: `content.md`
   - No chunk boundaries
   - Natural reading experience

2. **Connection Layer**: System operates on chunks
   - Source: `chunks` table with rich metadata
   - 3 engines detect connections
   - Surfaces in sidebar based on viewport

**The bridge:**
- Chunks have `start_offset` and `end_offset`
- System tracks scroll position
- Maps position → visible chunks → their connections
- Sidebar updates as you read

## Summary

```
Upload PDF
  ↓
Batched Extraction (100 pages at a time, 10-page overlap)
  ↓
Intelligent Stitching (fuzzy matching removes duplicates)
  ↓
Batched Metadata Extraction (100k char windows, rich metadata)
  ↓
Generate Embeddings (batch API)
  ↓
3-Engine Detection (Semantic, Contradiction, ThematicBridge)
  ↓
Store Connections (filtered at display time)
  ↓
Read & Surface (hybrid display/connection layers)
```

**The 3 engines each do something distinct:**
- Semantic: "These say the same thing" (fast baseline)
- Contradiction: "These disagree about X" (conceptual tension)
- ThematicBridge: "These connect across domains" (surprising insights)

**Cost-effective through:**
- Batched processing (reduces API calls 10x)
- Aggressive filtering (ThematicBridge: 200 calls vs 160k)
- Smart architecture (full markdown + chunks)

**The result:** ~$0.50 per book, meaningful connections, natural reading flow.