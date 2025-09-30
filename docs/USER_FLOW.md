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

**PDFProcessor.process() gets called:**

### 2.1: Download from Storage (10-12%)
```typescript
// Creates signed URL → Fetches file → Gets buffer
const fileBuffer = await fileResponse.arrayBuffer()
// Progress: "Downloaded 2.4 MB file"
```

### 2.2: Upload to Gemini Files API (15-20%)
```typescript
// Uses GeminiFileCache to avoid re-uploading same PDFs
const fileUri = await cache.getOrUpload(fileBuffer, async (buffer) => {
  return await this.ai.files.upload({
    file: new Blob([buffer], { type: 'application/pdf' }),
    config: { mimeType: 'application/pdf' }
  })
})
// Progress: "Processing time: 3s, validating file..."
```

### 2.3: Extract Markdown ONLY (25-40%)

**Current (broken for large docs):**
```typescript
// Asks AI for BOTH markdown AND chunks in one call
// Hits 65k token limit on books
```

**Fixed approach:**
```typescript
// Simplified prompt - just extract text
const SIMPLE_EXTRACTION_PROMPT = `
Extract ALL text from this PDF and convert to clean markdown.
Preserve headings, lists, emphasis. Focus on accurate extraction.
Return ONLY the markdown text.
`

const result = await this.ai.models.generateContent({
  model: GEMINI_MODEL,
  contents: [{
    parts: [
      { fileData: { fileUri, mimeType: 'application/pdf' } },
      { text: SIMPLE_EXTRACTION_PROMPT }
    ]
  }],
  config: { maxOutputTokens: MAX_OUTPUT_TOKENS }
})

const markdown = result.text
// Progress: "Extracted 150,000 words"
```

**What you get:**
```markdown
# Gravity's Rainbow

## Part 1: Beyond the Zero

The opening scene of Pynchon's novel...

[Full document text, properly formatted]
```

### 2.4: Local Chunking (40-60%)

```typescript
// This happens LOCALLY - no AI, no token limits
const rawChunks = simpleMarkdownChunking(markdown, {
  targetWords: 400,
  maxWords: 600,
  splitOnHeadings: true
})
// Progress: "Created 382 chunks"
```

**Chunking algorithm:**
```
1. Split on ## and ### headings (natural boundaries)
2. If section > 600 words, split on paragraph breaks
3. Each chunk: 300-500 words (complete thought units)
4. Track: start_offset, end_offset in original markdown
```

**Example chunk:**
```typescript
{
  content: "The opening scene of Pynchon's novel... [400 words]",
  chunk_index: 0,
  start_offset: 0,
  end_offset: 2847
}
```

### 2.5: Metadata Extraction (60-85%)

**This is where deep fingerprinting happens:**

```typescript
const enrichedChunks = await this.enrichChunksWithMetadata(rawChunks)
```

**For EACH chunk, run:**
```typescript
await extractMetadata(chunk.content, options)
```

**What extractMetadata does (per chunk):**
```typescript
{
  themes: ["postmodern literature", "paranoia", "entropy"],
  tone: { primary: "complex", secondary: "darkly humorous" },
  patterns: ["non-linear narrative", "scientific metaphors"],
  concepts: ["V-2 rocket", "Pavlovian conditioning", "corporate control"],
  entities: ["Tyrone Slothrop", "ACHTUNG", "Pointsman"],
  structure: {
    hasCode: false,
    hasLists: false,
    hasTables: false,
    density: "high"
  },
  quality: {
    completeness: 0.95,
    extractedFields: 6,
    totalFields: 7
  }
}
```

**This happens in parallel batches** (handled by your existing pipeline).

Progress updates:
```
"Extracting metadata for 382 chunks"
"Metadata extraction complete: 365/382 chunks with >50% completeness"
```

## Stage 3: Handler Takes Over (85-100%)

**The processor returns to the handler:**

```typescript
return {
  markdown: "# Gravity's Rainbow\n\n...",  // Full 150k word document
  chunks: [
    {
      content: "chunk text",
      chunk_index: 0,
      themes: [...],
      metadata: { themes, tone, patterns, concepts, entities, structure }
    },
    // ... 381 more chunks
  ],
  metadata: { sourceUrl: "..." },
  wordCount: 150000,
  outline: [/* hierarchical structure */]
}
```

**Handler does:**

### 3.1: Save Full Markdown (85%)
```typescript
// Uploads to storage
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
  markdown_content: markdown,  // Cached for quick access
  word_count: 150000,
  outline: [...]
})
```

### 3.3: Batch Insert Chunks (90%)
```typescript
await batchInsertChunks(supabase, chunks)
// Uses optimal batch size based on chunk count
// Inserts all 382 chunks with metadata
```

**Database state after insert:**
```sql
chunks {
  id: "chunk_0",
  document_id: "doc_456",
  chunk_index: 0,
  content: "The opening scene...",
  start_offset: 0,
  end_offset: 2847,
  themes: ["postmodern literature", "paranoia"],
  tone: {...},
  patterns: [...],
  concepts: [...],
  embedding: null,  -- Not yet generated
  importance: 0.8,
  summary: "Opening scene introducing Slothrop..."
}
-- × 382 chunks
```

### 3.4: Generate Embeddings (92-95%)
```typescript
// Batch process all chunks through embedding model
// This is where semantic vectors get created
await generateEmbeddings(chunks)
```

**Updated chunks:**
```sql
chunks {
  ...
  embedding: vector(768)  -- Now populated
}
```

### 3.5: Collision Detection (95-100%)

**This is where your 7 engines run:**

```typescript
// For each chunk, run all 7 engines against entire corpus
await detectConnections(chunkId, allChunks)
```

**Engine by engine:**

**1. Semantic Similarity**
```typescript
// Uses embedding vectors
const semanticMatches = await findSimilarEmbeddings(chunk.embedding)
// Finds chunks with cosine similarity > threshold
```

**2. Thematic Bridges**
```typescript
// Compares metadata.themes
if (hasOverlappingThemes(chunkA.themes, chunkB.themes)) {
  // Even across different domains
  // "paranoia" in Gravity's Rainbow ↔ "surveillance" in 1984
}
```

**3. Structural Isomorphisms**
```typescript
// Compares metadata.patterns
// "non-linear narrative" ↔ "fragmented timeline"
// Both chunks use similar structural approaches
```

**4. Contradiction Tensions**
```typescript
// Finds opposing viewpoints on same concepts
// metadata.concepts overlap BUT tone/stance differs
```

**5. Emotional Resonance**
```typescript
// Compares metadata.tone
// "darkly humorous" ↔ "satirical"
```

**6. Methodological Echoes**
```typescript
// Similar analytical approaches
// "scientific metaphors" ↔ "mathematical analogies"
```

**7. Temporal Rhythms**
```typescript
// metadata.structure.density and pacing
// Both chunks follow similar narrative rhythm
```

**All engines write to:**
```sql
connections {
  source_chunk_id: "chunk_0",
  target_chunk_id: "chunk_847",  -- Maybe from different book!
  type: "thematic_bridge",
  strength: 0.87,
  auto_detected: true,
  discovered_at: "2025-09-30T...",
  metadata: {
    shared_themes: ["paranoia", "control"],
    reasoning: "Both explore institutional paranoia through different lenses"
  }
}
```

**No filtering** - ALL connections stored, regardless of strength.

## Stage 4: Reading Experience

**You open the document:**

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

**Sidebar shows:**
```
┌─────────────────────────────────────────┐
│ 🔗 Connections                          │
│                                         │
│ ⚡ Contradiction (0.92)                 │
│ ├─ "1984" - Chapter 3                  │
│ └─ Different views on institutional    │
│    control mechanisms                   │
│                                         │
│ 🌉 Thematic Bridge (0.87)              │
│ ├─ "Catch-22" - Opening                │
│ └─ Shared: bureaucratic absurdity,     │
│    military paranoia                    │
│                                         │
│ 🏗️ Structural (0.79)                   │
│ ├─ "Ulysses" - Episode 1               │
│ └─ Non-linear narrative, stream of     │
│    consciousness                        │
└─────────────────────────────────────────┘
```

**These are chunk-to-chunk connections:**
- Source: chunk_0 (currently visible)
- Target: chunk from different document
- Scored using your personal weights:
  ```typescript
  score = 
    semantic_weight(0.3) * semantic_strength +
    thematic_weight(0.9) * thematic_strength +  // You care about concepts
    contradiction_weight(1.0) * contradiction_strength +  // Maximum
    ...
  ```

### As You Scroll

```typescript
// Viewport changes → visible chunks change
// Connections update in real-time
// New connections surface for new chunks

onScroll(() => {
  const newVisibleChunks = getVisibleChunks(viewport)
  const connections = getConnectionsFor(newVisibleChunks)
  updateSidebar(connections.sortBy(personalWeights))
})
```

## The Key Insight

**Two layers working in harmony:**

1. **Display Layer**: You read continuous markdown (natural flow)
   - Source: `content.md` 
   - No chunk boundaries
   - Natural reading experience

2. **Connection Layer**: System operates on chunks (semantic precision)
   - Source: `chunks` table with metadata
   - All 7 engines detect connections
   - Surfaces in sidebar based on viewport

**The bridge:**
- Chunks have `start_offset` and `end_offset`
- System tracks your scroll position
- Maps position → visible chunks → their connections
- Sidebar updates as you read

**Annotations work the same way:**
```typescript
{
  position: { start: 1547, end: 1623 },  // Global position in content.md
  chunkId: "chunk_0",  // For connection lookups
  note: "This reminds me of..."
}
```

You annotate in the flow of reading (display layer), but the system can find connections through the chunk (connection layer).

## Summary

```
Upload PDF
  ↓
Extract Markdown (Gemini, simple prompt)
  ↓
Chunk Locally (no AI, no limits)
  ↓
Extract Metadata (per chunk, batched)
  ↓
Generate Embeddings (batch)
  ↓
Detect Connections (7 engines, all pairs)
  ↓
Store Everything (no filtering)
  ↓
Read & Surface (hybrid display/connection layers)
```

**Processing time for Gravity's Rainbow:**
- Extract: ~3-5 minutes (one Gemini call)
- Chunk: <1 second (local algorithm)
- Metadata: ~10-15 minutes (382 chunks × AI calls, batched)
- Embeddings: ~2 minutes (batch API)
- Connections: ~5 minutes (all 7 engines)

**Total: ~20-25 minutes** for a 400-page book with 382 chunks, all connections detected.

Any part of this pipeline you want me to dig deeper on?