# Rhizome V2 Processing Pipeline

**Last Updated:** 2025-10-06

A comprehensive guide to how documents flow through the Rhizome system, from upload to connection detection.

---

## Table of Contents
1. [Pipeline Overview](#pipeline-overview)
2. [Stage 1: Document Ingestion](#stage-1-document-ingestion)
3. [Stage 2: Optional Markdown Review](#stage-2-optional-markdown-review-pre-chunking)
4. [Stage 3: Content Extraction](#stage-3-content-extraction)
5. [Stage 4: Semantic Chunking](#stage-4-semantic-chunking)
6. [Stage 5: Embedding Generation](#stage-5-embedding-generation)
7. [Stage 6: Connection Detection](#stage-6-connection-detection)
8. [Stage 7: Reader Experience](#stage-7-reader-experience)
9. [Stage 8: Obsidian Sync](#stage-8-obsidian-sync-post-processing)
10. [Error Handling & Fallbacks](#error-handling--fallbacks)

---

## Pipeline Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                         DOCUMENT UPLOAD                              │
│  6 Input Methods: PDF | YouTube | Web | Markdown | Text | Paste    │
└────────────────────────┬────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    STAGE 1: CONTENT EXTRACTION                       │
│  • PDF → Gemini Files API → Clean Markdown                          │
│  • YouTube → Transcript API → Enhanced Markdown                     │
│  • Web → Jina Reader API → Article Markdown                         │
│  • Markdown → Clean or As-Is                                        │
│  • Text/Paste → Direct Processing                                   │
└────────────────────────┬────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────────┐
│                STAGE 2: OPTIONAL MARKDOWN REVIEW                     │
│                  (Pre-Chunking Quality Control)                      │
│                                                                       │
│  IF reviewBeforeChunking enabled:                                   │
│  ┌──────────────────────────────────────────────────────────┐      │
│  │ 1. Create Simple Chunks (FREE - heading-based)           │      │
│  │ 2. Export to Obsidian for editing                        │      │
│  │ 3. User fixes formatting, structure, headers             │      │
│  │ 4. Sync edited markdown back                             │      │
│  │ 5. Continue to AI chunking (next stage)                  │      │
│  │                                                           │      │
│  │ Cost Savings: $0.20 (no double AI chunking)              │      │
│  └──────────────────────────────────────────────────────────┘      │
│                                                                       │
│  ELSE: Skip to Stage 3 (AI chunking)                                │
└────────────────────────┬────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    STAGE 3: SEMANTIC CHUNKING                        │
│                                                                       │
│  ┌──────────────────────────────────────────────────────────┐      │
│  │ AI-Powered Chunking (Primary Path)                        │      │
│  │ • Gemini 2.5 Flash identifies semantic boundaries         │      │
│  │ • Extracts themes, concepts, emotional metadata           │      │
│  │ • Target: 500-1200 words per chunk                        │      │
│  │ • Max: 10K chars (hard limit)                             │      │
│  └──────────────────┬───────────────────────────────────────┘      │
│                     │                                                │
│                     ▼                                                │
│  ┌──────────────────────────────────────────────────────────┐      │
│  │ Offset Correction (Fuzzy Matching)                        │      │
│  │ • AI often calculates wrong offsets                       │      │
│  │ • Fuzzy matcher finds real positions                      │      │
│  │ • 3-tier: Exact → Trigram → Approximate                  │      │
│  └──────────────────┬───────────────────────────────────────┘      │
│                     │                                                │
│                     ▼                                                │
│  ┌──────────────────────────────────────────────────────────┐      │
│  │ Auto-Split Oversized Chunks                               │      │
│  │ • If chunk > 10K chars                                    │      │
│  │ • Split at paragraph boundaries                           │      │
│  │ • Preserve metadata (themes, concepts, importance)        │      │
│  │ • Fuzzy matcher corrects split chunk offsets              │      │
│  └──────────────────────────────────────────────────────────┘      │
│                                                                       │
└────────────────────────┬────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────────┐
│                   STAGE 4: EMBEDDING GENERATION                      │
│  • Model: text-embedding-004 (768 dimensions)                       │
│  • Batch processing: 100 chunks at a time                           │
│  • Stored in PostgreSQL with pgvector                               │
└────────────────────────┬────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────────┐
│                  STAGE 5: CONNECTION DETECTION                       │
│                      (3-Engine System)                               │
│                                                                       │
│  ┌────────────────────────────────────────────────────────┐        │
│  │  ENGINE 1: Semantic Similarity (Weight: 0.25)          │        │
│  │  • Fast embedding-based search                         │        │
│  │  • Finds "these say the same thing"                    │        │
│  │  • Uses pgvector cosine distance                       │        │
│  │  • No AI calls, pure vector math                       │        │
│  └────────────────────────────────────────────────────────┘        │
│                                                                       │
│  ┌────────────────────────────────────────────────────────┐        │
│  │  ENGINE 2: Contradiction Detection (Weight: 0.40)      │        │
│  │  • Finds conceptual tensions                           │        │
│  │  • Same concepts + opposite emotional polarity         │        │
│  │  • Example: "Paranoia" (positive) vs (negative)        │        │
│  │  • Uses existing metadata, no AI calls                 │        │
│  └────────────────────────────────────────────────────────┘        │
│                                                                       │
│  ┌────────────────────────────────────────────────────────┐        │
│  │  ENGINE 3: Thematic Bridge (Weight: 0.35)              │        │
│  │  • Cross-domain concept matching                       │        │
│  │  • Example: "Paranoia in fiction ↔ surveillance tech"  │        │
│  │  • Aggressive filtering (importance > 0.6)             │        │
│  │  • AI analyzes ~200 chunk pairs per document           │        │
│  └────────────────────────────────────────────────────────┘        │
│                                                                       │
│  ┌────────────────────────────────────────────────────────┐        │
│  │  ORCHESTRATOR: Score Aggregation                       │        │
│  │  • Normalizes scores from all 3 engines                │        │
│  │  • Applies user-configurable weights                   │        │
│  │  • Deduplicates and ranks connections                  │        │
│  │  • Stores top connections in database                  │        │
│  └────────────────────────────────────────────────────────┘        │
│                                                                       │
└────────────────────────┬────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         READER EXPERIENCE                            │
│  • User scrolls markdown content                                    │
│  • Viewport tracking: chunk offsets determine visible chunks        │
│  • Right panel shows connections for visible chunks                 │
│  • Click connection → jump to related passage                       │
└────────────────────────┬────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    OPTIONAL: POST-PROCESSING SYNC                    │
│                  (Edit After Completion)                             │
│                                                                       │
│  User can edit markdown in Obsidian AFTER reading:                  │
│  1. Click "Sync from Obsidian" in document header                   │
│  2. Worker detects changes, uploads edited markdown                 │
│  3. Reprocess: New chunks created from edited content               │
│  4. Annotation Recovery: Fuzzy match annotations to new chunks      │
│  5. Connection Remapping: Update connections to new chunk IDs       │
│                                                                       │
│  Cost: ~$0.20 (reprocessing) + recovery complexity                  │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Stage 1: Document Ingestion

### 6 Input Methods

**Method**|**Processor**|**Output**|**Special Handling**
---|---|---|---
**PDF**|`PDFProcessor`|Clean markdown|Gemini Files API for extraction
**YouTube**|`YouTubeProcessor`|Enhanced markdown|Transcript + timestamps + fuzzy positioning
**Web URL**|`WebProcessor`|Article markdown|Jina Reader API for content extraction
**Markdown (Clean)**|`MarkdownProcessor`|Cleaned markdown|AI removes boilerplate, extracts core content
**Markdown (As-Is)**|`MarkdownProcessor`|Original markdown|No processing, direct storage
**Text/Paste**|`TextProcessor`|Plain text|Minimal processing

### Storage Strategy

- **Source Files**: Supabase Storage (`{user_id}/{document_id}/source.{ext}`)
- **Markdown Content**: Supabase Storage (`{user_id}/{document_id}/content.md`)
- **Metadata**: PostgreSQL (`documents` table)

---

## Stage 2: Optional Markdown Review (Pre-Chunking)

### Review Workflow (When `reviewBeforeChunking` Enabled)

```
Upload with "Review before chunking" ✅
        │
        ▼
┌─────────────────────────────────────────┐
│  Processor Creates Simple Chunks        │
│  • Heading-based splitting (FREE)       │
│  • No AI metadata extraction            │
│  • Placeholder chunks for structure     │
└─────────────────┬───────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────┐
│  Export to Obsidian                     │
│  • Write markdown to vault              │
│  • Open via obsidian://advanced-uri     │
│  • Document status: awaiting_manual_review
└─────────────────┬───────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────┐
│  User Edits Markdown                    │
│  • Fix extraction errors                │
│  • Adjust formatting                    │
│  • Correct headers, tables, lists       │
│  • Save when done                       │
└─────────────────┬───────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────┐
│  Click "Continue Processing"            │
│  • Sync edited markdown from Obsidian   │
│  • Upload to storage                    │
│  • Trigger AI chunking (Stage 3)        │
│  • Replace simple chunks with AI chunks │
└─────────────────────────────────────────┘
```

**Why This Matters:**
- **Cost Savings**: $0.20 per document (avoids double AI chunking)
- **Quality**: AI chunks clean, edited markdown (better results)
- **Flexibility**: Fix extraction issues before expensive processing

**Implementation Details:**
```typescript
// In PDF/EPUB processors
if (reviewBeforeChunking) {
  // Use FREE heading-based chunking
  const simpleChunks = simpleMarkdownChunking(markdown)

  // Export to Obsidian for editing
  await exportToObsidian(documentId, userId)

  // Pause processing (status: awaiting_manual_review)
  return {
    status: 'awaiting_manual_review',
    message: 'Review markdown in Obsidian, then click Continue Processing'
  }
}

// Normal flow: proceed with AI chunking
const aiChunks = await batchChunkAndExtractMetadata(markdown, ...)
```

---

## Stage 3: Content Extraction

### Extraction Flow

```
Input Document
    │
    ├─ PDF ────────────────────────────────────────┐
    │  1. Upload to Gemini Files API               │
    │  2. Gemini 2.0 extracts text structure       │
    │  3. Returns clean markdown                   │
    │  4. Handles: tables, lists, headings         │
    │                                               │
    ├─ YouTube ────────────────────────────────────┤
    │  1. Fetch transcript via YouTube API         │
    │  2. Gemini enhances with structure           │
    │  3. Adds timestamps as markdown comments     │
    │  4. Enables fuzzy position recovery          │
    │                                               │
    ├─ Web URL ────────────────────────────────────┤
    │  1. Jina Reader API extracts article         │
    │  2. Returns clean markdown                   │
    │  3. Removes ads, navigation, footers         │
    │                                               │
    └─ Other ──────────────────────────────────────┘
       Direct storage or AI cleaning
                │
                ▼
        Markdown Saved to Storage
```

---

## Stage 4: Semantic Chunking

### AI-Powered Chunking Pipeline

```
┌─────────────────────────────────────────────────────────────────┐
│  STEP 1: Batch Creation                                          │
│  • Split markdown into ~100K char batches                        │
│  • 2K char overlap between batches                               │
│  • Custom batches for EPUB chapters                              │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│  STEP 2: AI Chunking (per batch)                                 │
│                                                                   │
│  Prompt to Gemini 2.5 Flash:                                     │
│  • "Find semantic boundaries (complete thoughts)"                │
│  • "Target: 500-1200 words per chunk"                            │
│  • "Max: 10K chars (HARD LIMIT)"                                 │
│  • "Extract: themes, concepts, importance, emotional tone"       │
│                                                                   │
│  Response Schema:                                                │
│  {                                                                │
│    chunks: [                                                      │
│      {                                                            │
│        content: string,                                           │
│        start_offset: number,  ← AI often wrong                   │
│        end_offset: number,    ← AI often wrong                   │
│        themes: string[],                                          │
│        concepts: {text, importance}[],                            │
│        importance: number,                                        │
│        summary: string,                                           │
│        emotional: {polarity, primaryEmotion, intensity}           │
│      }                                                            │
│    ]                                                              │
│  }                                                                │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│  STEP 3: Size Validation                                         │
│                                                                   │
│  IF chunk > 10K chars:                                           │
│    ┌─────────────────────────────────────────┐                  │
│    │  Auto-Split at Paragraph Boundaries     │                  │
│    │  • Split /\n\n+/ regex                   │                  │
│    │  • Preserve metadata from parent         │                  │
│    │  • Use -1 placeholder offsets            │                  │
│    │  • Summary: "Part 1 of split chunk"      │                  │
│    └─────────────────────────────────────────┘                  │
│  ELSE:                                                            │
│    Continue to offset correction                                 │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│  STEP 4: Offset Correction (Fuzzy Matching)                      │
│                                                                   │
│  Problem: AI calculates wrong offsets                            │
│  Solution: Find where content actually appears                   │
│                                                                   │
│  3-Tier Strategy:                                                │
│  ┌──────────────────────────────────────────────┐               │
│  │ Tier 1: Exact Match (Fast)                   │               │
│  │ • markdown.indexOf(chunk.content)            │               │
│  │ • Confidence: 1.0                             │               │
│  └──────────────────────────────────────────────┘               │
│         │ not found                                              │
│         ▼                                                         │
│  ┌──────────────────────────────────────────────┐               │
│  │ Tier 2: Fuzzy Match (Trigram Similarity)     │               │
│  │ • Generate 3-char sliding windows            │               │
│  │ • Jaccard similarity (intersection/union)    │               │
│  │ • Threshold: 75% similarity                  │               │
│  │ • Confidence: 0.75-0.99                      │               │
│  └──────────────────────────────────────────────┘               │
│         │ < 75% similar                                          │
│         ▼                                                         │
│  ┌──────────────────────────────────────────────┐               │
│  │ Tier 3: Approximate Position                 │               │
│  │ • Use chunk index to estimate position       │               │
│  │ • Chunk 5/10 → ~50% through document         │               │
│  │ • Confidence: 0.3                             │               │
│  └──────────────────────────────────────────────┘               │
│                                                                   │
│  Post-Validation:                                                │
│  • Check corrected offsets match content (70% threshold)         │
│  • If >20% chunks failed correction → reject batch (retry)       │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│  STEP 5: Deduplication                                           │
│  • Remove overlapping chunks from batch boundaries               │
│  • Keep chunk from first batch (earlier in document)             │
│  • Similarity check: 80% trigram overlap → duplicate             │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
                    Chunks Complete!
              (Accurate offsets + rich metadata)
```

### Key Insights

**★ Insight ─────────────────────────────────────**
**AI Strength**: Finding semantic boundaries, extracting metadata
**AI Weakness**: Calculating character offsets accurately
**Solution**: Let AI do semantics, fuzzy matcher fixes offsets
**─────────────────────────────────────────────────**

### Chunk Metadata Structure

```typescript
{
  content: string              // Verbatim text from source
  start_offset: number        // Corrected by fuzzy matcher
  end_offset: number          // Corrected by fuzzy matcher
  metadata: {
    themes: string[]                    // 2-5 key themes
    concepts: Array<{                   // 3-5 key concepts
      text: string
      importance: 0.0-1.0
    }>
    importance: number                  // 0.0-1.0 chunk significance
    summary: string                     // One-sentence summary
    domain: string                      // narrative|academic|technical|etc
    emotional: {
      polarity: number                  // -1.0 (negative) to +1.0 (positive)
      primaryEmotion: string            // joy|fear|anger|neutral|etc
      intensity: 0.0-1.0                // Emotion strength
    }
  }
}
```

---

## Stage 5: Embedding Generation

### Embedding Pipeline

```
Chunks from Stage 3
        │
        ▼
┌─────────────────────────────────────────┐
│  Batch Processing (100 chunks/batch)    │
│  • Model: text-embedding-004            │
│  • Dimensions: 768                      │
│  • Provider: Google AI                  │
└─────────────────┬───────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────┐
│  Store in PostgreSQL with pgvector      │
│  • CREATE EXTENSION vector              │
│  • Column: embedding vector(768)        │
│  • Index: HNSW for fast similarity      │
└─────────────────┬───────────────────────┘
                  │
                  ▼
         Embeddings Complete!
```

---

## Stage 6: Connection Detection

### 3-Engine Architecture

The system uses **3 specialized engines**, each optimized for different connection types:

```
                    ┌─────────────────────────────┐
                    │      ORCHESTRATOR           │
                    │  • Coordinates all engines  │
                    │  • Normalizes scores        │
                    │  • Applies user weights     │
                    │  • Deduplicates results     │
                    └──────────┬──────────────────┘
                               │
        ┌──────────────────────┼──────────────────────┐
        │                      │                      │
        ▼                      ▼                      ▼
┌───────────────┐    ┌────────────────┐    ┌──────────────────┐
│   ENGINE 1    │    │    ENGINE 2    │    │    ENGINE 3      │
│   Semantic    │    │ Contradiction  │    │ Thematic Bridge  │
│  Similarity   │    │   Detection    │    │                  │
│               │    │                │    │                  │
│ Weight: 0.25  │    │  Weight: 0.40  │    │  Weight: 0.35    │
└───────────────┘    └────────────────┘    └──────────────────┘
```

### Engine 1: Semantic Similarity

**Purpose**: Find chunks that say similar things
**Method**: Vector similarity search
**Cost**: No AI calls (pure math)

```
For each chunk:
  1. Get embedding vector (768d)
  2. Query pgvector:
     SELECT * FROM chunks
     WHERE document_id != source_document_id  -- Cross-document only
     ORDER BY embedding <=> query_embedding   -- Cosine distance
     LIMIT 50
  3. Filter: similarity >= 0.7 threshold
  4. Return connections with strength scores
```

**Example Connection**:
```
Chunk A: "The surveillance state monitors all citizens..."
Chunk B: "Big Brother watches everything you do..."
→ Similarity: 0.85 (very similar concepts)
```

### Engine 2: Contradiction Detection

**Purpose**: Find conceptual tensions and opposing views
**Method**: Metadata-based analysis (no AI)
**Weight**: Highest (0.40) - contradictions are valuable

```
For each chunk:
  1. Extract concepts: ["surveillance", "privacy", "freedom"]
  2. Extract emotional polarity: 0.8 (positive about surveillance)

  3. Find chunks with:
     - Same concepts (overlap > 50%)
     - Opposite polarity (|polarity_diff| > 1.0)

  4. Score contradiction strength:
     strength = concept_overlap × polarity_difference
```

**Example Connection**:
```
Chunk A (Fiction):
  Concepts: ["paranoia", "surveillance", "control"]
  Polarity: -0.8 (negative - dystopian fear)

Chunk B (Tech Paper):
  Concepts: ["surveillance", "security", "safety"]
  Polarity: +0.7 (positive - protective technology)

→ Contradiction: Same topic, opposite emotional stance
→ Strength: 0.92
```

**Fallback**: If metadata insufficient, uses syntax-based detection:
- Negation patterns ("not X" vs "X")
- Opposing terms ("freedom" vs "control")
- Antonym detection

### Engine 3: Thematic Bridge

**Purpose**: Cross-domain concept matching
**Method**: AI-powered analysis (expensive, filtered)
**Budget**: ~200 AI calls per document

```
Aggressive Pre-Filtering:
  1. Only high-importance chunks (importance > 0.6)
  2. Only cross-document pairs
  3. Only different domains (narrative ≠ technical)
  4. Must share at least 1 concept

  Result: 500-page book → ~200 candidate pairs (not 145,924!)

AI Analysis (for filtered candidates):
  Prompt: "Do these chunks discuss related concepts
           across different domains?"

  Example:
    Literary chunk: "Paranoia in Gravity's Rainbow"
    Tech chunk: "Surveillance capitalism algorithms"

  AI Response: {
    detected: true,
    strength: 0.78,
    bridge_concept: "systemic observation and control"
  }
```

**Example Connection**:
```
Chunk A (Literary Analysis):
  "Pynchon's paranoia represents post-war anxiety about
   systems beyond individual control..."
  Domain: narrative
  Importance: 0.85

Chunk B (Tech Paper):
  "Algorithmic surveillance creates asymmetric power
   dynamics in digital platforms..."
  Domain: technical
  Importance: 0.92

→ Thematic Bridge: Both discuss power, control, invisible systems
→ Strength: 0.78
```

### Orchestrator: Score Aggregation

```typescript
For each chunk pair with connections:

  // Collect scores from all engines
  scores = {
    semantic: engine1.score || 0,      // 0.0-1.0
    contradiction: engine2.score || 0,  // 0.0-1.0
    thematic: engine3.score || 0       // 0.0-1.0
  }

  // Apply user-configurable weights
  weights = getUserWeights(userId)  // Default: {0.25, 0.40, 0.35}

  // Calculate weighted strength
  finalStrength =
    (scores.semantic × weights.semantic) +
    (scores.contradiction × weights.contradiction) +
    (scores.thematic × weights.thematic)

  // Normalize to 0.0-1.0 range
  normalized = normalize(finalStrength, method: 'softmax')

  // Store if above threshold
  if (normalized > 0.5) {
    saveConnection({
      source_chunk_id,
      target_chunk_id,
      connection_type: dominantEngine,  // Which engine scored highest
      strength: normalized,
      metadata: { scores, weights, bridge_concept }
    })
  }
```

### Connection Storage

```sql
CREATE TABLE connections (
  id uuid PRIMARY KEY,
  source_chunk_id uuid REFERENCES chunks(id),
  target_chunk_id uuid REFERENCES chunks(id),
  connection_type text,  -- 'semantic_similarity' | 'contradiction_detection' | 'thematic_bridge'
  strength real,         -- 0.0-1.0 normalized score
  metadata jsonb,        -- Engine-specific details
  created_at timestamptz
);

-- Indexes for fast retrieval
CREATE INDEX idx_connections_source ON connections(source_chunk_id);
CREATE INDEX idx_connections_strength ON connections(strength DESC);
```

---

## Stage 7: Reader Experience

### Viewport Tracking

```
User scrolls markdown content
        │
        ▼
JavaScript calculates scroll position
        │
        ▼
┌─────────────────────────────────────────┐
│  Determine Visible Chunks               │
│                                          │
│  scrollTop = 5000                        │
│  scrollBottom = 8000                     │
│                                          │
│  visibleChunks = chunks.filter(c =>     │
│    c.start_offset <= 8000 &&            │
│    c.end_offset >= 5000                 │
│  )                                       │
└─────────────────┬───────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────┐
│  Fetch Connections for Visible Chunks   │
│                                          │
│  SELECT * FROM connections              │
│  WHERE source_chunk_id IN (...)         │
│  ORDER BY strength DESC                 │
│  LIMIT 20                               │
└─────────────────┬───────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────┐
│  Render Right Panel                     │
│  • Show connection cards                │
│  • Display strength (0-100%)            │
│  • Show connection type icon            │
│  • Click → jump to target chunk         │
└─────────────────────────────────────────┘
```

**Why Accurate Offsets Matter**:
- User at position 5000 sees chunks that **actually** overlap position 5000
- Wrong offsets = wrong connections displayed
- Fuzzy matcher ensures viewport tracking works correctly

---

## Stage 8: Obsidian Sync (Post-Processing)

### Sync Workflow (Edit After Completion)

```
Document Complete & Readable
        │
        ▼
┌─────────────────────────────────────────┐
│  Export to Obsidian                     │
│  • Click "Export to Obsidian" button    │
│  • Write markdown to vault              │
│  • Export .annotations.json (optional)  │
│  • Open in Obsidian for editing         │
└─────────────────┬───────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────┐
│  User Edits Content                     │
│  • Fix typos, rephrase sections         │
│  • Add notes, reorganize                │
│  • Save when done                       │
└─────────────────┬───────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────┐
│  Click "Sync from Obsidian"             │
│  • Detect changes (compare hash)        │
│  • Upload edited markdown               │
│  • Trigger reprocessing pipeline        │
└─────────────────┬───────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────┐
│  Reprocessing Pipeline                  │
│                                          │
│  1. Mark old chunks is_current=false    │
│     (batch_id for rollback safety)      │
│                                          │
│  2. Create new chunks from edited MD    │
│     • AI chunking on edited content     │
│     • Generate embeddings               │
│     • Extract new metadata              │
│                                          │
│  3. Annotation Recovery (Fuzzy Match)   │
│     • Find annotations for old chunks   │
│     • Match to new chunks (85%+ similar)│
│     • Create recovery jobs for review   │
│                                          │
│  4. Connection Remapping                │
│     • Update connections to new IDs     │
│     • Preserve connection metadata      │
│                                          │
│  5. Commit Changes                      │
│     • Delete old chunks                 │
│     • Set new chunks is_current=true    │
│     • Update document status            │
└─────────────────────────────────────────┘
```

### Recovery Success Rates

**Minor Edits** (typos, formatting):
- Success: 90-100% annotations recovered
- Needs Review: 0-10%
- Lost: 0%

**Moderate Edits** (rephrasing, moving):
- Success: 70-90% annotations recovered
- Needs Review: 10-20%
- Lost: 0-10%

**Major Edits** (deletions, rewrites):
- Success: 50-70% annotations recovered
- Needs Review: 20-30%
- Lost: 10-30%

### Obsidian Integration

**Export Settings:**
```typescript
{
  vaultName: string          // "My Vault"
  vaultPath: string          // "/Users/.../My Vault"
  exportPath: string         // "Rhizome" (subfolder)
  syncAnnotations: boolean   // Export .annotations.json
  autoSync: boolean          // Auto-sync on changes
  reviewBeforeChunking: boolean  // Enable pre-chunking review
}
```

**URI Protocol:**
```
obsidian://advanced-uri?
  vault=My%20Vault&
  filepath=Rhizome/Document.md&
  mode=source
```

**Files Exported:**
- `{title}.md` - Markdown content
- `{title}.annotations.json` - Annotation positions (optional)

---

## Error Handling & Fallbacks

### Chunking Failures

```
AI Chunking Attempt
        │
        ├─ Success → Continue
        │
        ├─ Oversized Chunks → Auto-split at paragraphs → Continue
        │
        ├─ Wrong Offsets → Fuzzy matcher corrects → Continue
        │
        ├─ Batch Failure (3 retries)
        │   └─ Split batch in half → Retry smaller batches
        │       ├─ Success → Continue
        │       └─ Fail → Regex fallback
        │
        └─ Complete Failure (after all retries)
            └─ Fallback: Regex chunking
                • Split on sentence boundaries
                • ~1500 chars per chunk
                • Minimal metadata (generic themes)
                • Still better than nothing
```

### Connection Detection Failures

```
Engine Failure → Log warning → Continue with other engines

Example:
  - Semantic Similarity: ✓ 47 connections
  - Contradiction Detection: ✗ Failed (corrupted metadata)
  - Thematic Bridge: ✓ 15 connections

Result: 62 total connections (degraded but functional)
```

### Cost Protection

```
Thematic Bridge Budget Exceeded:
  IF ai_calls > 300:
    Log warning
    Stop engine
    Return connections found so far

  User still gets:
    - All semantic similarity connections (no AI)
    - All contradiction connections (no AI)
    - Partial thematic bridges (budget used)
```

---

## Performance Characteristics

### Processing Time (500-page book)

**Stage**|**Time**|**Bottleneck**
---|---|---
Extraction|2-5 min|Gemini Files API
**Review (optional)**|**User time**|**Manual editing**
Chunking|15-25 min|AI semantic analysis (10 batches)
Embeddings|1-2 min|Batch embedding generation
Connections|5-10 min|Thematic bridge AI calls
**Total**|**23-42 min**|**AI processing**
**With Review**|**23-42 min + user time**|**Manual + AI**

### Cost Budget (500-page book)

**Component**|**Cost**|**Notes**
---|---|---
PDF Extraction|$0.12|6 batches × $0.02
**Review Mode**|**$0 saved**|**Skip AI chunking initially**
Semantic Chunking|$0.20|10 batches × $0.02
Embeddings|$0.02|382 chunks × $0.00005
Thematic Bridge|$0.20|200 AI calls × $0.001
**Total**|**~$0.54**|**Well under $1 budget**
**With Post-Sync**|**+$0.20**|**Reprocessing edited markdown**

### Optimization Strategies

1. **Batching**: Process 100K chars at a time (Gemini limit: 65K output tokens)
2. **Parallel Processing**: Run embeddings while chunking next batch
3. **Aggressive Filtering**: Thematic bridge only analyzes ~200 pairs (not 145K)
4. **Caching**: Store processing results for retry safety
5. **Fallbacks**: Graceful degradation at every stage

---

## Key Takeaways

### What Makes This Pipeline Unique

1. **AI + Fuzzy Matching Partnership**
   - AI: Semantic understanding, metadata extraction
   - Fuzzy Matcher: Accurate offset calculation
   - Each does what it's best at

2. **3-Engine Connection System**
   - Semantic: Fast, baseline similarity
   - Contradiction: Detects tensions (highest weight)
   - Thematic: Cross-domain bridges (AI-powered)

3. **Graceful Degradation**
   - Oversized chunks → Auto-split
   - Wrong offsets → Fuzzy correction
   - AI failure → Regex fallback
   - Never lose data, always get results

4. **Cost-Aware Design**
   - Aggressive filtering (200 AI calls, not 145K)
   - Metadata reuse (no redundant analysis)
   - Budget protection (stop at $1 per document)

5. **Viewport-Driven UX**
   - Accurate offsets enable scroll-based chunk detection
   - Right panel shows connections for visible content
   - One-click navigation to related passages

6. **Obsidian Integration**
   - Pre-chunking review: Fix extraction errors before AI processing (saves $0.20)
   - Post-processing sync: Edit completed documents with annotation recovery
   - Bidirectional workflow: Export → Edit → Sync back
   - Advanced URI protocol for cross-app integration

---

## Next Steps

- [ ] **Continue Reader UI**: Markdown renderer, virtual scrolling
- [ ] **Implement Annotations**: Text selection → ECS persistence
- [ ] **Build Connection Panel**: Display 3-engine results
- [ ] **Add Study System**: Flashcards with FSRS algorithm
- [ ] **Create Export**: ZIP bundles with markdown + annotations

---

**Related Documentation**:
- [Architecture Overview](./ARCHITECTURE.md)
- [ECS Implementation](./ECS_IMPLEMENTATION.md)
- [Testing Strategy](./testing/TESTING_README.md)
- [Code Examples](./CODE_EXAMPLES.md)
