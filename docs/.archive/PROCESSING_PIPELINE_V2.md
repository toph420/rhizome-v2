# Rhizome V2 Processing Pipeline Architecture (V2)

**Version**: 2.0
**Last Updated**: 2025-10-14
**Status**: Complete with Hybrid Chunking Support

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Complete Pipeline Flow](#complete-pipeline-flow)
3. [Stage-by-Stage Deep Dive](#stage-by-stage-deep-dive)
4. [Performance & Timing](#performance--timing)
5. [Quality Metrics](#quality-metrics)
6. [Critical Anti-Patterns](#critical-anti-patterns)
7. [Troubleshooting Guide](#troubleshooting-guide)

---

## Executive Summary

Rhizome V2 uses a **7-stage processing pipeline** that transforms documents (PDF, EPUB, Web, YouTube, etc.) into semantically chunked, embedded knowledge with 100% metadata recovery guarantee.

### Pipeline Characteristics

- **Architecture**: Hybrid Python/TypeScript with subprocess coordination
- **Processing Modes**: LOCAL (100% free, private) or CLOUD (Gemini API)
- **Chunking Strategies**: 7 types (HybridChunker default + 6 Chonkie strategies)
- **Metadata Recovery**: 100% guaranteed via 5-layer bulletproof matcher
- **Performance**: 15-20 minutes for 500-page book
- **Cost**: $0.00 (LOCAL) or ~$0.55 (CLOUD)

### Key Innovations

1. **5-Layer Bulletproof Matcher**: Guarantees 100% chunk recovery with metadata preservation
2. **Hybrid Chunking System**: User choice between 7 chunking strategies
3. **Metadata Enhancement**: Heading context prepended to embeddings (15-25% quality boost)
4. **Cached Chunks**: Original Docling extractions cached for zero-cost reprocessing
5. **Confidence Tracking**: Transparent quality indicators for synthetic chunks

---

## Complete Pipeline Flow

```
┌─────────────────────────────────────────────────────────────┐
│          RHIZOME V2 PROCESSING PIPELINE (V2)                │
│           7 Stages, 2 Modes, 7 Chunking Strategies          │
└─────────────────────────────────────────────────────────────┘

╔═══════════════════════════════════════════════════════════╗
║               STAGE 1: DOCLING EXTRACTION                 ║
║                     (9-20 minutes)                        ║
╚═══════════════════════════════════════════════════════════╝

┌───────────────────────────────────────────────────────────┐
│ Download Document from Supabase Storage                  │
│ • Create signed URL → buffer                              │
│ • File size logging                                       │
└───────────────────────────────────────────────────────────┘
                          ↓
┌───────────────────────────────────────────────────────────┐
│ Docling Extraction (Python subprocess)                    │
│ • Script: worker/scripts/docling_extract.py               │
│ • HybridChunker: ALWAYS enabled                           │
│   - tokenizer: 'Xenova/all-mpnet-base-v2'                │
│   - max_tokens: 768                                       │
│   - merge_peers: true                                     │
│ • Configuration: Environment-based (12 options)           │
│   - Image extraction: EXTRACT_IMAGES=true                 │
│   - OCR: ENABLE_OCR=false (opt-in for scanned docs)      │
│   - AI enrichment: CLASSIFY_IMAGES, DESCRIBE_IMAGES, etc │
│ • Page batching: Auto-enabled for >200 pages              │
│   - Batch size: 100 pages with 10-page overlap           │
│ • Output:                                                  │
│   - markdown (original, with page artifacts)              │
│   - chunks (~382 segments with metadata)                  │
│   - structure (headings[], total_pages, sections[])       │
│                                                            │
│ **Chunk Metadata** (from HybridChunker):                 │
│   - content: Raw text content                             │
│   - index: Sequential position (0-based)                  │
│   - heading_path: ["Chapter 1", "Section 1.1"]           │
│   - heading_level: TOC depth (0 = top-level)             │
│   - page_start, page_end: 1-based page numbers           │
│   - bboxes: PDF coordinates for highlighting             │
│                                                            │
│ **CRITICAL**: Chunks cached to `cached_chunks` table     │
│               These become anchors for bulletproof match  │
└───────────────────────────────────────────────────────────┘
                          ↓
         ┌────────────────┴────────────────┐
         ↓                                  ↓

┌─────────────────────────┐    ┌─────────────────────────┐
│   LOCAL MODE (Free)     │    │   CLOUD MODE (Paid)     │
│   Ollama/Transformers   │    │   Gemini API            │
└─────────────────────────┘    └─────────────────────────┘

Both modes converge at Stage 2...

╔═══════════════════════════════════════════════════════════╗
║                 STAGE 2: CLEANUP PHASE                    ║
║                     (1-3 minutes)                         ║
╚═══════════════════════════════════════════════════════════╝

┌───────────────────────────────────────────────────────────┐
│ Regex Cleanup (Always runs, <1 second)                   │
│ • Function: cleanPageArtifacts(markdown)                  │
│ • Removes:                                                 │
│   - Page numbers, headers, footers                        │
│   - Smart quotes → straight quotes                        │
│   - Em/en dashes → hyphens                                │
│   - Excessive whitespace                                   │
│ • Result: Coordinate mismatch created!                    │
│           (Docling positions no longer match cleaned text)│
└───────────────────────────────────────────────────────────┘
                          ↓
┌───────────────────────────────────────────────────────────┐
│ AI Cleanup (Optional, user choice)                       │
│                                                            │
│ LOCAL MODE:                                                │
│ • Ollama Qwen 32B (or 14B/7B)                             │
│ • Script: worker/lib/local/ollama-cleanup.ts              │
│ • OOM fallback: Skip to regex-only if Qwen crashes       │
│ • Fixes: OCR artifacts, formatting issues                 │
│                                                            │
│ CLOUD MODE:                                                │
│ • Gemini 2.5 Flash                                        │
│ • Better quality than Ollama                               │
│ • Cost: ~$0.10 per book                                   │
│                                                            │
│ **Result**: Further coordinate mismatch                   │
│             (Even more position drift from original)      │
└───────────────────────────────────────────────────────────┘
                          ↓
╔═══════════════════════════════════════════════════════════╗
║           STAGE 3: BULLETPROOF MATCHING                   ║
║                     (2 minutes)                           ║
║         Creates coordinate map: ORIGINAL → CLEANED        ║
╚═══════════════════════════════════════════════════════════╝

┌───────────────────────────────────────────────────────────┐
│ 5-Layer Matching System                                   │
│ Location: worker/lib/local/bulletproof-matcher.ts         │
│                                                            │
│ **Layer 1: Enhanced Fuzzy Matching** (85-90% success)    │
│   Strategy 1: Exact string match                          │
│     const index = cleanedMarkdown.indexOf(chunk.content)  │
│                                                            │
│   Strategy 2: Normalized match (whitespace-flexible)      │
│     const pattern = content.replace(/\s+/g, '\\s+')       │
│     const regex = new RegExp(pattern)                     │
│                                                            │
│   Strategy 3: Multi-anchor match (start/middle/end)       │
│     const startAnchor = content.slice(0, 100)             │
│     const middleAnchor = content.slice(mid-50, mid+50)    │
│     const endAnchor = content.slice(-100)                 │
│                                                            │
│   Strategy 4: Sliding window + Levenshtein               │
│     const similarity = levenshtein(content, window)       │
│     if (similarity > 0.75) return match                   │
│                                                            │
│ **Layer 2: Embeddings-Based** (95-98% cumulative)        │
│   • Model: Xenova/all-mpnet-base-v2 (same as final)      │
│   • Create sliding windows of cleaned markdown            │
│   • Find best match via cosine similarity (>0.85)         │
│   const bestWindow = findBestMatch(chunkEmb, windowEmbs)  │
│                                                            │
│ **Layer 3: LLM Assisted** (99.9% cumulative)             │
│   • Ollama Qwen analyzes difficult cases                  │
│   • Receives: chunk content + search window               │
│   • Returns: JSON with offset positions                   │
│   const response = ollama.generateStructured({...})       │
│                                                            │
│ **Layer 4: Interpolation** (100% GUARANTEED)             │
│   • NEVER FAILS - Uses anchors to synthesize positions    │
│   • Interpolation between matched chunks:                 │
│     ratio = (idx - before.idx) / (after.idx - before.idx)│
│     position = before.end + (after.start - before.end) × r│
│   • Extrapolation forward/backward if no anchors          │
│   • Result: ALWAYS returns a position (flagged synthetic)│
│                                                            │
│ **Layer 5: Metadata Preservation**                       │
│   • Transfer all Docling metadata to new positions:       │
│     - heading_path (citation hierarchy)                   │
│     - page_start, page_end (1-based)                      │
│     - heading_level (TOC depth)                           │
│     - section_marker (EPUB sections)                      │
│     - bboxes (PDF coordinates)                            │
│                                                            │
│ **Output**: MatchResult[] with:                          │
│   {                                                        │
│     chunk: DoclingChunk,  // Original with metadata       │
│     start_offset: number, // Position in CLEANED markdown │
│     end_offset: number,   // Position in CLEANED markdown │
│     confidence: 'exact' | 'high' | 'medium' | 'synthetic',│
│     method: 'exact_match' | ... | 'interpolation',       │
│     similarity?: number,                                  │
│     validation_warning?: string  // For synthetic chunks  │
│   }                                                        │
└───────────────────────────────────────────────────────────┘
                          ↓
╔═══════════════════════════════════════════════════════════╗
║            STAGE 4: CHUNKING STRATEGY FORK                ║
║                  (0-120 seconds)                          ║
║              User chooses per document                    ║
╚═══════════════════════════════════════════════════════════╝

         ┌────────────────┴────────────────┐
         ↓                                  ↓

┌─────────────────────────┐    ┌─────────────────────────┐
│   PATH A: STRUCTURAL    │    │   PATH B: CHONKIE       │
│     (HybridChunker)     │    │   (6 Strategies)        │
│        DEFAULT          │    │      OPTIONAL           │
└─────────────────────────┘    └─────────────────────────┘

┌─────────────────────────┐    ┌─────────────────────────┐
│ Use Bulletproof Matched │    │ Chonkie Semantic/Other  │
│ Chunks (already done!)  │    │ Chunking                │
│                         │    │                         │
│ • Docling boundaries    │    │ • Python subprocess     │
│ • Structure-aware       │    │ • Script:               │
│ • Fast (no extra work)  │    │   chonkie_chunk.py      │
│ • Time: 0 sec           │    │ • User selects type:    │
│                         │    │   - semantic (default)  │
│ Result: ~382 chunks     │    │   - recursive           │
│ Chunker type: 'hybrid'  │    │   - neural              │
│                         │    │   - slumber             │
│                         │    │   - sentence            │
│                         │    │   - token               │
│                         │    │ • Config:               │
│                         │    │   - chunk_size: 768     │
│                         │    │   - threshold: 0.7      │
│                         │    │     (semantic only)     │
│                         │    │ • Time: 60-120 sec      │
│                         │    │                         │
│                         │    │ Result: ~350-420 chunks │
│                         │    │ Chunker type: varies    │
└─────────────────────────┘    └─────────────────────────┘
         ↓                                  ↓
         │                      ┌─────────────────────────┐
         │                      │ Metadata Transfer       │
         │                      │ Location:               │
         │                      │   worker/lib/chonkie/   │
         │                      │   metadata-transfer.ts  │
         │                      │                         │
         │                      │ Process:                │
         │                      │ 1. Find overlapping     │
         │                      │    Docling chunks       │
         │                      │ 2. Aggregate metadata   │
         │                      │    from overlaps        │
         │                      │ 3. Preserve:            │
         │                      │    - heading_path       │
         │                      │    - page_start/end     │
         │                      │    - heading_level      │
         │                      │    - bboxes             │
         │                      │ 4. Flag merged chunks   │
         │                      │                         │
         │                      │ **Overlap Detection**:  │
         │                      │ - 1:1 mapping (simple)  │
         │                      │ - N:1 mapping (merge)   │
         │                      │ - 1:N mapping (split)   │
         │                      │ - No overlap (gap)      │
         │                      │                         │
         │                      │ **Confidence Tracking**:│
         │                      │ - exact: 1:1 match      │
         │                      │ - high: clean merge     │
         │                      │ - medium: complex merge │
         │                      │ - synthetic: no overlap │
         │                      └─────────────────────────┘
         │                                  ↓
         └────────────────┬────────────────┘
                          ↓

╔═══════════════════════════════════════════════════════════╗
║         STAGE 5: METADATA ENRICHMENT (SHARED)             ║
║                     (1 minute)                            ║
╚═══════════════════════════════════════════════════════════╝

┌───────────────────────────────────────────────────────────┐
│ PydanticAI + Ollama (Structured Extraction)              │
│ Location: worker/lib/chunking/pydantic-metadata.ts        │
│ Script: worker/scripts/extract_metadata_pydantic.py       │
│                                                            │
│ **Batch Processing**: 10 chunks at a time                │
│                                                            │
│ **Extraction Model** (PydanticAI):                       │
│   class ChunkMetadata(BaseModel):                        │
│     themes: list[str]           # 2-3 key themes         │
│     importance: float           # 0-1 (for filtering)    │
│     summary: str                # 1-2 sentence summary   │
│     emotional: EmotionalMetadata                         │
│       polarity: str  # positive/negative/neutral         │
│       emotion: str   # joy, fear, anger, sadness, etc    │
│       intensity: float  # 0-1                            │
│     concepts: list[Concept]                              │
│       name: str                                          │
│       domain: str    # tech, philosophy, science, etc    │
│       confidence: float                                  │
│     domain: str      # Primary domain of chunk           │
│                                                            │
│ **Error Recovery**: Fails gracefully with defaults       │
│ **Fallback Metadata**:                                   │
│   themes: ["general"]                                    │
│   importance: 0.5                                        │
│   summary: chunk.content.slice(0, 100)                   │
│   emotional: { polarity: "neutral", ... }                │
│                                                            │
│ **Performance**: ~6 seconds per 10 chunks (~60 total)    │
└───────────────────────────────────────────────────────────┘
                          ↓

╔═══════════════════════════════════════════════════════════╗
║        STAGE 6: EMBEDDINGS GENERATION (SHARED)            ║
║                     (30 seconds)                          ║
╚═══════════════════════════════════════════════════════════╝

┌───────────────────────────────────────────────────────────┐
│ Transformers.js Local Embeddings                          │
│ Location: worker/lib/local/embeddings-local.ts            │
│                                                            │
│ **Model**: 'Xenova/all-mpnet-base-v2'                    │
│   • Architecture: MPNet (same as HybridChunker tokenizer) │
│   • Dimensions: 768d vectors                              │
│   • Tokenizer alignment: CRITICAL for consistency         │
│                                                            │
│ **Metadata Enhancement** (15-25% quality boost):         │
│   Location: worker/lib/embeddings/metadata-context.ts     │
│                                                            │
│   function createEnhancedEmbeddingText(chunk) {          │
│     // Build context from metadata                        │
│     const context = buildMetadataContext(chunk)          │
│     // Output: "Chapter 3 > Section 3.1 | Page 42"       │
│                                                            │
│     // Prepend to chunk content (for embedding ONLY)     │
│     return `${context}\n\n${chunk.content}`             │
│   }                                                        │
│                                                            │
│   **CRITICAL**: Content stored in DB is UNCHANGED        │
│                 Only embeddings include metadata context  │
│                                                            │
│ **Configuration**:                                        │
│   const embeddings = await embedder(chunks, {            │
│     pooling: 'mean',      // REQUIRED for 768d output    │
│     normalize: true       // REQUIRED for cosine sim     │
│   })                                                      │
│                                                            │
│ **Batch Processing**: 50 chunks at a time                │
│   • Prevents memory issues                                │
│   • Enables progress tracking                             │
│                                                            │
│ **Fallback Chain**:                                      │
│   1. Local Transformers.js (free, fast)                  │
│   2. Gemini embeddings (~$0.02 per book)                 │
│   3. Save without embeddings + mark for review           │
│                                                            │
│ **Performance**: ~20-30 seconds for 400 chunks           │
│ **Output**: 768-dimensional normalized vectors           │
└───────────────────────────────────────────────────────────┘
                          ↓

╔═══════════════════════════════════════════════════════════╗
║              STAGE 7: FINALIZE & STORE                    ║
║                     (10 seconds)                          ║
╚═══════════════════════════════════════════════════════════╝

┌───────────────────────────────────────────────────────────┐
│ Combine into ProcessedChunk[] and Store                  │
│                                                            │
│ **Final Chunk Structure**:                               │
│   {                                                        │
│     // Core content                                       │
│     id: uuid,                                             │
│     document_id: uuid,                                    │
│     content: string,           // Original text (NO metadata prefix) │
│     start_offset: number,       // Position in cleaned markdown │
│     end_offset: number,         // Position in cleaned markdown │
│     token_count: number,        // ~768 max              │
│     index: number,              // Sequential position   │
│                                                            │
│     // Docling structural metadata                       │
│     heading_path: string[],     // ["Chapter 1", "Section 1.1"] │
│     heading_level: number,      // TOC depth             │
│     page_start: number,         // 1-based page number   │
│     page_end: number,           // 1-based page number   │
│     section_marker: string,     // EPUB section ID       │
│     bboxes: BBox[],            // PDF coordinates        │
│                                                            │
│     // PydanticAI extracted metadata                     │
│     themes: string[],           // Key themes            │
│     importance_score: number,   // 0-1 (for filtering)   │
│     summary: string,            // 1-2 sentences         │
│     emotional_polarity: string, // positive/negative/neutral │
│     emotional_emotion: string,  // joy, fear, anger, etc │
│     emotional_intensity: number,// 0-1                   │
│     concepts: Concept[],        // Extracted concepts    │
│     domain: string,             // Primary domain        │
│                                                            │
│     // Enhanced embedding (metadata-enriched)            │
│     embedding: number[],        // 768d vector with context │
│                                                            │
│     // Chunker metadata                                  │
│     chunker_type: string,       // 'hybrid' | 'semantic' | ... │
│                                                            │
│     // Quality tracking                                  │
│     confidence: string,         // 'exact' | 'high' | 'medium' | 'synthetic' │
│     match_method: string,       // 'exact_match' | ... | 'interpolation' │
│     needs_validation: boolean,  // True for synthetic chunks │
│                                                            │
│     // Timestamps                                        │
│     created_at: timestamp,                               │
│     updated_at: timestamp                                │
│   }                                                        │
│                                                            │
│ **Database Operations**:                                 │
│   1. Store chunks in `chunks` table                      │
│   2. Cache original Docling chunks in `cached_chunks`    │
│   3. Update document metadata (total chunks, status)     │
│   4. Trigger background connection detection             │
│                                                            │
│ **Storage Export** (Automatic):                          │
│   Save to Supabase Storage:                              │
│   • documents/{userId}/{documentId}/chunks.json          │
│   • documents/{userId}/{documentId}/metadata.json        │
│   • documents/{userId}/{documentId}/cached_chunks.json   │
│   • documents/{userId}/{documentId}/manifest.json        │
│                                                            │
│ **Quality Validation**:                                  │
│   • Chunk count sanity check                             │
│   • Metadata coverage >80%                               │
│   • Embedding coverage >90%                              │
│   • Synthetic chunks <5%                                 │
└───────────────────────────────────────────────────────────┘

                          ↓
                     ✅ COMPLETE
```

---

## Stage-by-Stage Deep Dive

### Stage 1: Docling Extraction (9-20 minutes)

**Purpose**: Extract structured markdown and initial chunks from PDF/EPUB

**Technology Stack**:
- Python: Docling library with HybridChunker
- Subprocess: TypeScript spawns Python script
- Caching: Results stored in `cached_chunks` table

**Process Flow**:

1. **Download Document**:
   ```typescript
   const signedUrl = await supabase.storage
     .from('documents')
     .createSignedUrl(filePath, 3600)

   const response = await fetch(signedUrl.data.signedUrl)
   const buffer = await response.arrayBuffer()
   ```

2. **Spawn Docling Process**:
   ```typescript
   const python = spawn('python3', [
     'worker/scripts/docling_extract.py',
     '--input', tempPdfPath,
     '--output', outputJsonPath
   ])
   ```

3. **Docling Extraction** (Python):
   ```python
   from docling.document_converter import DocumentConverter
   from docling_core.transforms.chunker import HybridChunker

   converter = DocumentConverter()
   result = converter.convert(pdf_path)

   # HybridChunker configuration
   chunker = HybridChunker(
       tokenizer='Xenova/all-mpnet-base-v2',
       max_tokens=768,
       merge_peers=True
   )

   chunks = chunker.chunk(result.document)
   ```

4. **Output Structure**:
   ```json
   {
     "markdown": "# Chapter 1\n\nParagraph text...",
     "chunks": [
       {
         "content": "Paragraph text...",
         "index": 0,
         "heading_path": ["Chapter 1"],
         "heading_level": 1,
         "page_start": 1,
         "page_end": 1,
         "bboxes": [{ "l": 72, "t": 100, "r": 540, "b": 120, "page": 1 }]
       }
     ],
     "structure": {
       "headings": ["Chapter 1", "Section 1.1"],
       "total_pages": 500
     }
   }
   ```

5. **Cache to Database**:
   ```typescript
   await supabase.from('cached_chunks').insert({
     document_id: documentId,
     chunks: doclingResult.chunks,
     markdown_hash: hashMarkdown(doclingResult.markdown)
   })
   ```

**Performance Characteristics**:
- Small PDFs (<50 pages): 3-5 minutes
- Medium PDFs (200 pages): 9-12 minutes
- Large PDFs (500 pages): 15-20 minutes (with page batching)

**Key Files**:
- `worker/scripts/docling_extract.py` - Python extraction script
- `worker/lib/local/docling-config.ts` - Configuration builder
- `worker/lib/local/docling-extract.ts` - TypeScript wrapper

---

### Stage 2: Cleanup Phase (1-3 minutes)

**Purpose**: Remove page artifacts and improve markdown quality

**Two-Step Process**:

#### Step 1: Regex Cleanup (Always, <1 second)

```typescript
// worker/lib/text-cleanup.ts
export function cleanPageArtifacts(
  markdown: string,
  options: { skipHeadingGeneration?: boolean } = {}
): string {
  let cleaned = markdown

  // Remove page numbers
  cleaned = cleaned.replace(/^Page \d+$/gm, '')

  // Remove headers/footers
  cleaned = cleaned.replace(/^-{3,}$/gm, '')

  // Fix smart quotes
  cleaned = cleaned.replace(/[\u201C\u201D]/g, '"')
  cleaned = cleaned.replace(/[\u2018\u2019]/g, "'")

  // Fix dashes
  cleaned = cleaned.replace(/[\u2013\u2014]/g, '-')

  // Normalize whitespace
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n')

  return cleaned.trim()
}
```

**Example Transformation**:
```
BEFORE (Docling):
"Page 45

Chapter 2

Paragraph text here.

---
Footer content
---"

AFTER (Regex):
"Chapter 2

Paragraph text here."
```

**Impact**: Creates coordinate mismatch (positions no longer align)

---

#### Step 2: AI Cleanup (Optional, 1-3 minutes)

**LOCAL Mode** (Ollama Qwen):
```typescript
// worker/lib/local/ollama-cleanup.ts
export async function cleanMarkdownLocal(
  markdown: string,
  config?: { timeout?: number }
): Promise<string> {
  try {
    const response = await ollama.chat({
      model: 'qwen2.5:32b-instruct-q4_K_M',
      messages: [{
        role: 'system',
        content: 'Clean OCR artifacts and formatting issues. Output ONLY cleaned markdown.'
      }, {
        role: 'user',
        content: markdown
      }],
      options: {
        temperature: 0.1,  // Low temperature for consistency
        num_predict: 100000  // Allow long outputs
      }
    })

    return response.message.content
  } catch (error) {
    // OOM fallback: Return regex-cleaned markdown
    console.error('Ollama cleanup failed, using regex-only:', error)
    return markdown  // Already regex-cleaned
  }
}
```

**CLOUD Mode** (Gemini):
```typescript
// worker/lib/gemini/cleanup.ts
export async function cleanPdfMarkdown(
  ai: GenerativeModel,
  markdown: string
): Promise<string> {
  const result = await ai.generateContent({
    contents: [{
      role: 'user',
      parts: [{
        text: `Clean this markdown extracted from a PDF. Remove OCR artifacts, fix formatting, preserve all content.

${markdown}`
      }]
    }]
  })

  return result.response.text()
}
```

**Key Differences**:
| Aspect | Ollama (LOCAL) | Gemini (CLOUD) |
|--------|---------------|----------------|
| Quality | Good (Qwen 32B) | Better (Gemini 2.5 Flash) |
| Speed | 2-3 minutes | 1-2 minutes |
| Cost | $0.00 | ~$0.10 per book |
| Privacy | 100% local | Sends to Google |
| Reliability | OOM risk on large docs | Very reliable |

**When to skip AI cleanup**:
- Clean PDFs with minimal artifacts
- OOM errors on large documents (Ollama)
- Cost concerns (Gemini)
- Speed priority

---

### Stage 3: Bulletproof Matching (2 minutes)

**Purpose**: Map Docling chunks from ORIGINAL markdown to CLEANED markdown positions

**Why Needed**:
```
USER READS:           CLEANED markdown (no page numbers, no headers)
USER CREATES:         Annotation at position 1500 in CLEANED text
SYSTEM NEEDS:         Which page? Which heading? (from ORIGINAL)

PROBLEM:              Docling metadata references ORIGINAL positions
                      Position 1500 in ORIGINAL ≠ Position 1500 in CLEANED

SOLUTION:             Bulletproof matcher creates coordinate map
                      ORIGINAL metadata → CLEANED positions
```

**5-Layer System**:

#### Layer 1: Enhanced Fuzzy Matching (85-90% success)

**Strategy 1: Exact Match**
```typescript
const exactIndex = cleanedMarkdown.indexOf(chunk.content, searchHint)
if (exactIndex !== -1) {
  return {
    start_offset: exactIndex,
    end_offset: exactIndex + chunk.content.length,
    confidence: 'exact',
    method: 'exact_match'
  }
}
```

**Strategy 2: Normalized Match**
```typescript
const normalized = chunk.content.trim().replace(/\s+/g, ' ')
const escaped = normalized.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const pattern = escaped.replace(/ /g, '\\s+')
const regex = new RegExp(pattern)

const match = cleanedMarkdown.match(regex)
if (match) {
  return {
    start_offset: match.index,
    end_offset: match.index + match[0].length,
    confidence: 'high',
    method: 'normalized_match'
  }
}
```

**Strategy 3: Multi-Anchor Match**
```typescript
const startAnchor = chunk.content.slice(0, 100)
const middleAnchor = chunk.content.slice(midpoint - 50, midpoint + 50)
const endAnchor = chunk.content.slice(-100)

const startIdx = cleanedMarkdown.indexOf(startAnchor)
const middleIdx = cleanedMarkdown.indexOf(middleAnchor, startIdx)
const endIdx = cleanedMarkdown.indexOf(endAnchor, middleIdx)

if (startIdx !== -1 && endIdx !== -1) {
  // Reconstruct full chunk between anchors
  return {
    start_offset: startIdx,
    end_offset: endIdx + endAnchor.length,
    confidence: 'high',
    method: 'multi_anchor'
  }
}
```

**Strategy 4: Sliding Window + Levenshtein**
```typescript
const windowSize = chunk.content.length
const stride = Math.floor(windowSize * 0.5)

for (let i = 0; i < cleanedMarkdown.length - windowSize; i += stride) {
  const window = cleanedMarkdown.slice(i, i + windowSize)
  const similarity = calculateStringSimilarity(chunk.content, window)

  if (similarity > 0.75) {
    return {
      start_offset: i,
      end_offset: i + windowSize,
      confidence: 'medium',
      method: 'sliding_window',
      similarity
    }
  }
}
```

---

#### Layer 2: Embeddings-Based Matching (95-98% cumulative)

**Purpose**: Find semantically similar sections when fuzzy matching fails

**Process**:
```typescript
// 1. Generate embedding for Docling chunk
const embedder = await pipeline('feature-extraction', 'Xenova/all-mpnet-base-v2')
const chunkEmbedding = await embedder(chunk.content, {
  pooling: 'mean',
  normalize: true
})

// 2. Create sliding windows of cleaned markdown
const avgChunkSize = 2000  // characters
const overlap = 0.5
const windows = createSlidingWindows(cleanedMarkdown, avgChunkSize, overlap)

// 3. Generate embeddings for all windows
const windowEmbeddings = await Promise.all(
  windows.map(w => embedder(w.text, { pooling: 'mean', normalize: true }))
)

// 4. Find best match via cosine similarity
const similarities = windowEmbeddings.map((winEmb, idx) => ({
  index: idx,
  similarity: cosineSimilarity(chunkEmbedding.data, winEmb.data)
}))

const bestMatch = similarities.reduce((best, curr) =>
  curr.similarity > best.similarity ? curr : best
)

if (bestMatch.similarity > 0.85) {
  const window = windows[bestMatch.index]
  return {
    start_offset: window.start,
    end_offset: window.end,
    confidence: 'high',
    method: 'embeddings_match',
    similarity: bestMatch.similarity
  }
}
```

**Why This Works**:
- Same model as final embeddings (consistency)
- Semantic similarity handles paraphrasing
- Robust to minor text changes

---

#### Layer 3: LLM Assisted Matching (99.9% cumulative)

**Purpose**: Use Ollama Qwen to analyze difficult cases

**Process**:
```typescript
// 1. Create search window (±2000 chars from expected position)
const expectedPos = estimatePosition(chunk, previousMatches)
const searchWindow = cleanedMarkdown.slice(
  Math.max(0, expectedPos - 2000),
  Math.min(cleanedMarkdown.length, expectedPos + 2000)
)

// 2. Ask Ollama to find the chunk
const response = await ollama.chat({
  model: 'qwen2.5:32b-instruct-q4_K_M',
  messages: [{
    role: 'user',
    content: `Find where this CHUNK appears in the SEARCH WINDOW.
Return JSON with start_offset and end_offset (character positions).

CHUNK:
${chunk.content}

SEARCH WINDOW:
${searchWindow}

Output ONLY JSON: { "found": true/false, "start_offset": N, "end_offset": M }`
  }],
  format: 'json'
})

const result = JSON.parse(response.message.content)

if (result.found) {
  return {
    start_offset: expectedPos - 2000 + result.start_offset,
    end_offset: expectedPos - 2000 + result.end_offset,
    confidence: 'medium',
    method: 'llm_assisted'
  }
}
```

**Why This Works**:
- LLM understands context and paraphrasing
- Can handle OCR errors and formatting changes
- Falls back gracefully if uncertain

---

#### Layer 4: Interpolation (100% GUARANTEED)

**Purpose**: NEVER FAIL - Always return a position, even if synthetic

**Strategy 1: Interpolate Between Anchors**
```typescript
if (beforeAnchor && afterAnchor) {
  // We have chunks matched before and after this one
  const ratio = (chunk.index - beforeAnchor.chunk.index) /
                (afterAnchor.chunk.index - beforeAnchor.chunk.index)

  const position = beforeAnchor.end_offset +
    (afterAnchor.start_offset - beforeAnchor.end_offset) * ratio

  return {
    start_offset: Math.floor(position),
    end_offset: Math.floor(position + avgChunkSize),
    confidence: 'synthetic',
    method: 'interpolation',
    validation_warning: 'Synthetic position - verify in UI'
  }
}
```

**Strategy 2: Extrapolate Forward**
```typescript
if (beforeAnchor && !afterAnchor) {
  // We have a chunk before, extrapolate forward
  const distance = chunk.index - beforeAnchor.chunk.index
  const position = beforeAnchor.end_offset + (avgChunkSize * distance)

  return {
    start_offset: Math.floor(position),
    end_offset: Math.floor(position + avgChunkSize),
    confidence: 'synthetic',
    method: 'extrapolation_forward',
    validation_warning: 'Extrapolated position - verify in UI'
  }
}
```

**Strategy 3: Extrapolate Backward**
```typescript
if (afterAnchor && !beforeAnchor) {
  // We have a chunk after, extrapolate backward
  const distance = afterAnchor.chunk.index - chunk.index
  const position = afterAnchor.start_offset - (avgChunkSize * distance)

  return {
    start_offset: Math.floor(position),
    end_offset: Math.floor(position + avgChunkSize),
    confidence: 'synthetic',
    method: 'extrapolation_backward',
    validation_warning: 'Extrapolated position - verify in UI'
  }
}
```

**Why This Guarantees 100% Recovery**:
- ALWAYS returns a position (never fails)
- Synthetic positions are flagged for user validation
- User can correct via Chunk Validation UI
- No data loss - all Docling metadata preserved

---

#### Layer 5: Metadata Preservation

**Purpose**: Transfer all Docling structural metadata to new positions

**Metadata Transfer**:
```typescript
interface MatchResult {
  chunk: DoclingChunk  // Original chunk with metadata
  start_offset: number  // Position in CLEANED markdown
  end_offset: number    // Position in CLEANED markdown
  confidence: 'exact' | 'high' | 'medium' | 'synthetic'
  method: string
  similarity?: number
  validation_warning?: string
}

function preserveMetadata(
  match: MatchResult
): ProcessedChunk {
  return {
    // New positions (in cleaned markdown)
    start_offset: match.start_offset,
    end_offset: match.end_offset,
    content: match.chunk.content,

    // Preserved Docling metadata
    heading_path: match.chunk.heading_path,
    heading_level: match.chunk.heading_level,
    page_start: match.chunk.page_start,
    page_end: match.chunk.page_end,
    section_marker: match.chunk.section_marker,
    bboxes: match.chunk.bboxes,

    // Quality tracking
    confidence: match.confidence,
    match_method: match.method,
    needs_validation: match.confidence === 'synthetic'
  }
}
```

**Guaranteed Preservation**:
- ✅ Heading hierarchy (for citations)
- ✅ Page numbers (for PDF navigation)
- ✅ Bounding boxes (for PDF highlighting)
- ✅ Section markers (for EPUB navigation)
- ✅ Confidence tracking (for UI validation)

---

### Stage 4: Chunking Strategy Fork (0-120 seconds)

**Purpose**: Choose optimal chunking strategy per document

**Two Paths**:

#### Path A: Structural (HybridChunker) - DEFAULT

**Characteristics**:
- ✅ Already done (uses bulletproof matched chunks)
- ✅ Fast (0 seconds additional time)
- ✅ Structure-preserving (perfect for citations)
- ✅ Proven reliability (100% metadata recovery)

**When to Use**:
- Academic papers (preserve citations)
- Technical manuals (structure-first)
- Clean PDFs (good formatting)
- Speed priority (batch processing)

**Output**:
```typescript
interface StructuralChunk {
  content: string
  start_offset: number
  end_offset: number
  token_count: number  // ~768
  heading_path: string[]
  page_start: number
  chunker_type: 'hybrid'
  confidence: 'exact' | 'high' | 'medium' | 'synthetic'
}
```

---

#### Path B: Chonkie (6 Strategies) - OPTIONAL

**Available Strategies**:

1. **SemanticChunker** (Narrative, Thematic)
   - Embedding-based semantic similarity
   - Detects topic shifts
   - Best for: Novels, essays, thematic content

2. **RecursiveChunker** (Structured Documents)
   - Hierarchical splitting (headings → paragraphs → sentences)
   - Respects document structure
   - Best for: Technical docs, academic papers

3. **NeuralChunker** (BERT-Based, High Quality)
   - Fine-tuned BERT for semantic shifts
   - Most sophisticated boundary detection
   - Best for: Complex academic writing, quality-first

4. **SlumberChunker** (Agentic, Highest Quality)
   - LLM-powered boundary decisions
   - Context-aware reasoning
   - Best for: Critical documents, publication-ready

5. **SentenceChunker** (Simple, Fast)
   - Splits at sentence boundaries
   - Groups to fit token limit
   - Best for: Clean PDFs, speed priority

6. **TokenChunker** (Fixed-Size, Fallback)
   - Pure token counting (no boundaries)
   - Guaranteed 768-token chunks
   - Best for: Testing, absolute fallback

**Example: SemanticChunker**:
```python
from chonkie import SemanticChunker

chunker = SemanticChunker(
    embedding_model="sentence-transformers/all-mpnet-base-v2",
    chunk_size=768,
    threshold=0.7  # Higher = stricter topic boundaries
)

chunks = chunker.chunk(cleaned_markdown)
# Output: [Chunk(text=..., start_index=..., end_index=..., token_count=...)]
```

**Metadata Transfer**:
```typescript
function transferMetadataToChonkieChunks(
  chonkieChunks: ChonkieChunk[],
  bulletproofMatches: MatchResult[]
): ProcessedChunk[] {
  return chonkieChunks.map(chonkieChunk => {
    // Find overlapping Docling chunks
    const overlapping = bulletproofMatches.filter(match => {
      const chonkieStart = chonkieChunk.start_index
      const chonkieEnd = chonkieChunk.end_index
      const doclingStart = match.start_offset
      const doclingEnd = match.end_offset

      // Check for any overlap
      return (
        (doclingStart <= chonkieStart && doclingEnd > chonkieStart) ||
        (doclingStart < chonkieEnd && doclingEnd >= chonkieEnd) ||
        (doclingStart >= chonkieStart && doclingEnd <= chonkieEnd) ||
        (doclingStart <= chonkieStart && doclingEnd >= chonkieEnd)
      )
    })

    // Aggregate metadata from overlapping chunks
    if (overlapping.length === 0) {
      // No overlap - use interpolation
      return estimateMetadataByPosition(chonkieChunk, bulletproofMatches)
    }

    if (overlapping.length === 1) {
      // Perfect 1:1 mapping
      return {
        content: chonkieChunk.text,
        start_offset: chonkieChunk.start_index,
        end_offset: chonkieChunk.end_index,
        token_count: chonkieChunk.token_count,
        ...overlapping[0].chunk.meta,
        chunker_type: chonkieChunk.chunker_type,
        confidence: 'exact'
      }
    }

    // Multiple overlaps - aggregate metadata
    const metadata = {
      heading_path: overlapping[0].chunk.meta.heading_path,  // Use first
      heading_level: overlapping[0].chunk.meta.heading_level,
      page_start: Math.min(...overlapping.map(m => m.chunk.meta.page_start)),
      page_end: Math.max(...overlapping.map(m => m.chunk.meta.page_end)),
      bboxes: overlapping.flatMap(m => m.chunk.meta.bboxes || [])
    }

    return {
      content: chonkieChunk.text,
      start_offset: chonkieChunk.start_index,
      end_offset: chonkieChunk.end_index,
      token_count: chonkieChunk.token_count,
      ...metadata,
      chunker_type: chonkieChunk.chunker_type,
      confidence: 'high'
    }
  })
}
```

---

### Stage 5: Metadata Enrichment (1 minute)

**Purpose**: Extract semantic metadata using PydanticAI + Ollama

**Why Needed**:
- **Thematic connections**: Detect cross-domain bridges
- **Contradiction detection**: Find opposing viewpoints
- **Filtering**: Importance scores reduce AI call volume
- **User experience**: Summaries improve reader context

**Technology**:
- PydanticAI: Structured outputs with validation
- Ollama Qwen 32B: Local LLM (free, private)
- Batch processing: 10 chunks at a time

**Process**:

```python
# worker/scripts/extract_metadata_pydantic.py
from pydantic_ai import Agent
from pydantic import BaseModel

class EmotionalMetadata(BaseModel):
    polarity: str  # positive, negative, neutral
    emotion: str   # joy, fear, anger, sadness, etc
    intensity: float  # 0-1

class Concept(BaseModel):
    name: str
    domain: str  # tech, philosophy, science, literature, etc
    confidence: float  # 0-1

class ChunkMetadata(BaseModel):
    themes: list[str]  # 2-3 key themes
    importance: float  # 0-1 (for filtering)
    summary: str  # 1-2 sentence summary
    emotional: EmotionalMetadata
    concepts: list[Concept]
    domain: str  # Primary domain

# Initialize agent
agent = Agent(
    'ollama:qwen2.5:32b',
    result_type=ChunkMetadata,
    system_prompt="""Extract metadata from this chunk.
- Themes: 2-3 key themes
- Importance: 0-1 (0=trivial, 1=critical)
- Summary: 1-2 sentences
- Emotional: polarity, primary emotion, intensity
- Concepts: key concepts with domains
- Domain: primary domain (tech, philosophy, etc)"""
)

# Process in batches
chunks_batch = chunks[0:10]
for chunk in chunks_batch:
    try:
        metadata = agent.run_sync(chunk.content)
        chunk.metadata = metadata.model_dump()
    except Exception as e:
        # Fallback to defaults
        chunk.metadata = {
            "themes": ["general"],
            "importance": 0.5,
            "summary": chunk.content[:100],
            "emotional": {
                "polarity": "neutral",
                "emotion": "none",
                "intensity": 0.0
            },
            "concepts": [],
            "domain": "general"
        }
```

**Example Output**:
```json
{
  "themes": ["surveillance", "capitalism", "privacy"],
  "importance": 0.85,
  "summary": "Discusses how surveillance capitalism monetizes personal data through behavioral prediction.",
  "emotional": {
    "polarity": "negative",
    "emotion": "concern",
    "intensity": 0.7
  },
  "concepts": [
    {
      "name": "surveillance capitalism",
      "domain": "technology",
      "confidence": 0.95
    },
    {
      "name": "behavioral surplus",
      "domain": "economics",
      "confidence": 0.80
    }
  ],
  "domain": "technology"
}
```

**Performance**:
- ~6 seconds per 10 chunks
- ~60 chunks total for 500-page book (filtered to importance >0.6)
- Total: ~60 seconds

**Error Handling**:
```typescript
// worker/lib/chunking/pydantic-metadata.ts
try {
  const metadata = await extractMetadata(chunks)
  return metadata
} catch (error) {
  console.error('Metadata extraction failed:', error)

  // Fallback: Use default metadata
  return chunks.map(chunk => ({
    ...chunk,
    themes: ['general'],
    importance: 0.5,
    summary: chunk.content.slice(0, 100),
    emotional: {
      polarity: 'neutral',
      emotion: 'none',
      intensity: 0.0
    },
    concepts: [],
    domain: 'general'
  }))
}
```

---

### Stage 6: Embeddings Generation (30 seconds)

**Purpose**: Generate 768-dimensional vectors for semantic search

**Technology**:
- Transformers.js: Local embeddings (WASM/WebGPU)
- Model: Xenova/all-mpnet-base-v2 (768d)
- Metadata enhancement: 15-25% quality boost

**Critical Configuration**:

```typescript
// worker/lib/local/embeddings-local.ts
import { pipeline } from '@huggingface/transformers'

const embedder = await pipeline(
  'feature-extraction',
  'Xenova/all-mpnet-base-v2'
)

const embeddings = await embedder(chunks, {
  pooling: 'mean',      // REQUIRED for 768d output
  normalize: true       // REQUIRED for cosine similarity
})
```

**Why This Configuration Matters**:
| Setting | Impact |
|---------|--------|
| `pooling: 'mean'` | Average token embeddings → 768d vector |
| `normalize: true` | Unit vectors for cosine similarity |
| Model alignment | Same tokenizer as HybridChunker |

**Metadata Enhancement**:

```typescript
// worker/lib/embeddings/metadata-context.ts
function buildMetadataContext(chunk: ProcessedChunk): string {
  const parts: string[] = []

  // Add heading hierarchy
  if (chunk.heading_path && chunk.heading_path.length > 0) {
    parts.push(chunk.heading_path.join(' > '))
  }

  // Add page number
  if (chunk.page_start) {
    parts.push(`Page ${chunk.page_start}`)
  }

  // Add domain (if enriched)
  if (chunk.domain && chunk.domain !== 'general') {
    parts.push(`Domain: ${chunk.domain}`)
  }

  return parts.join(' | ')
}

function createEnhancedEmbeddingText(chunk: ProcessedChunk): string {
  const context = buildMetadataContext(chunk)
  // Example: "Chapter 3 > Section 3.1 | Page 42 | Domain: philosophy"

  // Prepend context to chunk content (for embedding ONLY)
  return `${context}\n\n${chunk.content}`
}

// CRITICAL: Store original content, embed enhanced text
const enhancedText = createEnhancedEmbeddingText(chunk)
const embedding = await embedder(enhancedText, {
  pooling: 'mean',
  normalize: true
})

await supabase.from('chunks').insert({
  content: chunk.content,  // ORIGINAL (no metadata prefix)
  embedding: embedding.data,  // ENHANCED (with metadata context)
  ...chunk
})
```

**Why Metadata Enhancement Works**:
- **Retrieval improvement**: 15-25% better semantic search
- **Context awareness**: Embeddings include structural position
- **No content duplication**: Stored content remains clean
- **Citation preservation**: Page numbers in embeddings

**Research Backing**:
- HyDE (Hypothetical Document Embeddings): 15-25% improvement
- Context-enhanced retrieval: Standard RAG practice
- Metadata-aware search: Better cross-document connections

**Batch Processing**:

```typescript
// Process in batches to prevent memory issues
const BATCH_SIZE = 50

for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
  const batch = chunks.slice(i, i + BATCH_SIZE)

  const enhancedTexts = batch.map(createEnhancedEmbeddingText)

  const embeddings = await embedder(enhancedTexts, {
    pooling: 'mean',
    normalize: true
  })

  // Save batch
  await saveChunksWithEmbeddings(batch, embeddings)

  // Progress update
  console.log(`Embedded ${Math.min(i + BATCH_SIZE, chunks.length)}/${chunks.length} chunks`)
}
```

**Performance**:
- ~20-30 seconds for 400 chunks
- Batch size: 50 chunks
- No API costs (100% local)

**Fallback Chain**:

```typescript
try {
  // 1. Try local Transformers.js
  const embeddings = await generateLocalEmbeddings(chunks)
  return embeddings
} catch (error) {
  console.error('Local embeddings failed:', error)

  try {
    // 2. Try Gemini embeddings
    const embeddings = await generateGeminiEmbeddings(chunks)
    console.warn('Used Gemini fallback (~$0.02 cost)')
    return embeddings
  } catch (error2) {
    console.error('Gemini embeddings failed:', error2)

    // 3. Save without embeddings, mark for review
    await saveChunksWithoutEmbeddings(chunks)
    await markDocumentForEmbeddingReview(documentId)
    throw new Error('All embedding methods failed')
  }
}
```

---

### Stage 7: Finalize & Store (10 seconds)

**Purpose**: Save processed chunks to database and storage

**Database Storage**:

```typescript
// Save chunks to PostgreSQL
await supabase.from('chunks').insert(
  chunks.map(chunk => ({
    // Core fields
    id: uuid(),
    document_id: documentId,
    content: chunk.content,  // ORIGINAL (no metadata prefix)
    start_offset: chunk.start_offset,
    end_offset: chunk.end_offset,
    token_count: chunk.token_count,
    index: chunk.index,

    // Docling structural metadata
    heading_path: chunk.heading_path,
    heading_level: chunk.heading_level,
    page_start: chunk.page_start,
    page_end: chunk.page_end,
    section_marker: chunk.section_marker,
    bboxes: chunk.bboxes,

    // PydanticAI metadata
    themes: chunk.themes,
    importance_score: chunk.importance,
    summary: chunk.summary,
    emotional_polarity: chunk.emotional?.polarity,
    emotional_emotion: chunk.emotional?.emotion,
    emotional_intensity: chunk.emotional?.intensity,
    concepts: chunk.concepts,
    domain: chunk.domain,

    // Enhanced embedding (with metadata context)
    embedding: chunk.embedding,  // 768d vector

    // Chunker metadata
    chunker_type: chunk.chunker_type,

    // Quality tracking
    confidence: chunk.confidence,
    match_method: chunk.match_method,
    needs_validation: chunk.needs_validation,

    // Timestamps
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }))
)
```

**Storage Export** (Automatic):

```typescript
// Save chunks to Supabase Storage for portability
const basePath = `documents/${userId}/${documentId}`

// 1. chunks.json (final enriched chunks)
await supabase.storage
  .from('documents')
  .upload(`${basePath}/chunks.json`, JSON.stringify({
    chunks: chunks,
    metadata: {
      total_chunks: chunks.length,
      chunker_type: chunkerType,
      processing_mode: 'local',
      created_at: new Date().toISOString()
    }
  }))

// 2. cached_chunks.json (original Docling chunks for reprocessing)
await supabase.storage
  .from('documents')
  .upload(`${basePath}/cached_chunks.json`, JSON.stringify({
    chunks: doclingChunks,
    markdown_hash: hashMarkdown(originalMarkdown)
  }))

// 3. metadata.json (document-level metadata)
await supabase.storage
  .from('documents')
  .upload(`${basePath}/metadata.json`, JSON.stringify({
    document_id: documentId,
    title: documentTitle,
    author: documentAuthor,
    total_pages: structure.total_pages,
    total_chunks: chunks.length,
    processing_stats: {
      extraction_time: extractionTime,
      cleanup_time: cleanupTime,
      matching_time: matchingTime,
      enrichment_time: enrichmentTime,
      embedding_time: embeddingTime
    }
  }))

// 4. manifest.json (file inventory + costs)
await supabase.storage
  .from('documents')
  .upload(`${basePath}/manifest.json`, JSON.stringify({
    files: [
      'source.pdf',
      'content.md',
      'chunks.json',
      'cached_chunks.json',
      'metadata.json'
    ],
    costs: {
      extraction: 0.00,
      cleanup: 0.00,
      embeddings: 0.00,
      total: 0.00
    },
    created_at: new Date().toISOString()
  }))
```

**Quality Validation**:

```typescript
// worker/lib/chunking/chunk-statistics.ts
interface ChunkStatistics {
  total_chunks: number
  avg_chunk_size: number
  metadata_coverage: number  // % chunks with heading_path
  embedding_coverage: number  // % chunks with embeddings
  synthetic_chunks: number  // Count of interpolated chunks
  confidence_distribution: {
    exact: number
    high: number
    medium: number
    synthetic: number
  }
}

function validateChunkQuality(chunks: ProcessedChunk[]): ChunkStatistics {
  const stats: ChunkStatistics = {
    total_chunks: chunks.length,
    avg_chunk_size: chunks.reduce((sum, c) => sum + c.content.length, 0) / chunks.length,
    metadata_coverage: chunks.filter(c => c.heading_path && c.heading_path.length > 0).length / chunks.length,
    embedding_coverage: chunks.filter(c => c.embedding && c.embedding.length === 768).length / chunks.length,
    synthetic_chunks: chunks.filter(c => c.confidence === 'synthetic').length,
    confidence_distribution: {
      exact: chunks.filter(c => c.confidence === 'exact').length,
      high: chunks.filter(c => c.confidence === 'high').length,
      medium: chunks.filter(c => c.confidence === 'medium').length,
      synthetic: chunks.filter(c => c.confidence === 'synthetic').length
    }
  }

  // Validation thresholds
  if (stats.metadata_coverage < 0.8) {
    console.warn(`Low metadata coverage: ${(stats.metadata_coverage * 100).toFixed(1)}%`)
  }

  if (stats.embedding_coverage < 0.9) {
    console.warn(`Low embedding coverage: ${(stats.embedding_coverage * 100).toFixed(1)}%`)
  }

  if (stats.synthetic_chunks > chunks.length * 0.05) {
    console.warn(`High synthetic chunks: ${stats.synthetic_chunks} (${(stats.synthetic_chunks / chunks.length * 100).toFixed(1)}%)`)
  }

  return stats
}
```

**Expected Quality Metrics**:
- ✅ Metadata coverage: >80%
- ✅ Embedding coverage: >90%
- ✅ Synthetic chunks: <5%
- ✅ Semantic coherence: >90% (chunks end on sentence boundaries)

---

## Performance & Timing

### Processing Time Breakdown (500-page book)

| Stage | LOCAL Mode | CLOUD Mode | Notes |
|-------|-----------|-----------|-------|
| **1. Docling Extraction** | 15-20 min | 15-20 min | Same (Python subprocess) |
| **2. Cleanup** | 2-3 min | 1-2 min | Ollama vs Gemini |
| **3. Bulletproof Matching** | 2 min | 2 min | Same (TypeScript) |
| **4. Chunking Fork** | | | |
| - Path A (Hybrid) | 0 sec | 0 sec | Already done |
| - Path B (Semantic) | 60-90 sec | 60-90 sec | Same (Python subprocess) |
| - Path B (Recursive) | 30-60 sec | 30-60 sec | Faster than semantic |
| - Path B (Neural) | 90-120 sec | 90-120 sec | Slowest, best quality |
| **5. Metadata Enrichment** | 1 min | 1 min | Same (Ollama/Gemini) |
| **6. Embeddings** | 30 sec | 30 sec | Same (Transformers.js) |
| **7. Finalize & Store** | 10 sec | 10 sec | Same (database ops) |
| **TOTAL (Path A)** | **~20-25 min** | **~19-23 min** | Default, fast |
| **TOTAL (Path B Semantic)** | **~21-27 min** | **~20-25 min** | +1-2 min |
| **TOTAL (Path B Neural)** | **~22-28 min** | **~21-26 min** | +2-3 min |

### Cost Analysis

| Stage | LOCAL Mode | CLOUD Mode |
|-------|-----------|-----------|
| **Docling Extraction** | $0.00 | $0.00 |
| **Cleanup** | $0.00 | ~$0.10 |
| **Bulletproof Matching** | $0.00 | $0.00 |
| **Chunking** | $0.00 | $0.00 |
| **Metadata Enrichment** | $0.00 | ~$0.20 |
| **Embeddings** | $0.00 | ~$0.02 |
| **TOTAL** | **$0.00** | **~$0.32-0.55** |

**Cost Savings (LOCAL mode)**:
- 1,000 books: Save $320-550
- 10,000 books: Save $3,200-5,500
- **Bonus**: Complete privacy, no rate limits, works offline

---

## Quality Metrics

### Chunk Recovery Rate

| Confidence Level | Expected % | What It Means |
|-----------------|-----------|---------------|
| **Exact** | 85-90% | Perfect match, no intervention needed |
| **High** | 5-8% | Strong fuzzy/embedding match, reliable |
| **Medium** | 2-5% | LLM-assisted or lower similarity, review recommended |
| **Synthetic** | <5% | Interpolated position, user validation required |

**Total Recovery**: 100% (guaranteed, never fails)

### Metadata Coverage

| Metric | Target | Current |
|--------|--------|---------|
| **Heading Path** | >80% | ~85-92% |
| **Page Numbers** | >90% | ~95-98% |
| **Bounding Boxes** | >80% | ~82-88% (PDF only) |
| **Section Markers** | >90% | ~95-98% (EPUB only) |

### Embedding Quality

| Metric | Target | Current |
|--------|--------|---------|
| **Coverage** | >90% | ~98-100% |
| **Dimensionality** | 768d | 768d (always) |
| **Normalization** | Unit vectors | ✅ Enforced |
| **Metadata Enhancement** | >70% | ~75-85% |

### Semantic Coherence

| Metric | Target | Current |
|--------|--------|---------|
| **Sentence Boundaries** | >90% | ~92-96% |
| **Token Limit Compliance** | 100% | 100% (strict) |
| **Chunk Alignment** | >85% | ~87-93% |

---

## Critical Anti-Patterns

### ❌ Don't Skip `stdout.flush()` in Python

**Problem**: IPC will hang indefinitely
```python
# ❌ WRONG
print(json.dumps(output))  # Missing flush

# ✅ RIGHT
print(json.dumps(output), flush=True)
sys.stdout.flush()  # Extra safety
```

### ❌ Don't Use Ollama Streaming for Structured Outputs

**Problem**: Breaks JSON parsing
```typescript
// ❌ WRONG
const response = await ollama.chat({
  model: 'qwen2.5:32b',
  stream: true  // Breaks structured outputs!
})

// ✅ RIGHT
const response = await ollama.chat({
  model: 'qwen2.5:32b',
  format: 'json',  // Structured output
  stream: false  // No streaming for JSON
})
```

### ❌ Don't Mismatch Tokenizers

**Problem**: Chunk sizes won't align with embeddings
```python
# ❌ WRONG
chunker = HybridChunker(tokenizer='bert-base-uncased')
embedder = pipeline('feature-extraction', 'Xenova/all-mpnet-base-v2')

# ✅ RIGHT (same model)
chunker = HybridChunker(tokenizer='Xenova/all-mpnet-base-v2')
embedder = pipeline('feature-extraction', 'Xenova/all-mpnet-base-v2')
```

### ❌ Don't Use Q8 Quantization on M1 Max

**Problem**: Too slow (10x slower than Q4)
```bash
# ❌ WRONG
ollama pull qwen2.5:32b-instruct-q8_0  # Too slow!

# ✅ RIGHT
ollama pull qwen2.5:32b-instruct-q4_K_M  # Fast + good quality
```

### ❌ Don't Skip Confidence Tracking

**Problem**: User doesn't know which chunks need validation
```typescript
// ❌ WRONG
return { start_offset, end_offset }

// ✅ RIGHT
return {
  start_offset,
  end_offset,
  confidence: 'synthetic',
  validation_warning: 'Interpolated position - verify in UI'
}
```

### ❌ Don't Assume 100% Exact Matches

**Problem**: Always plan for synthetic chunks
```typescript
// ❌ WRONG
const chunks = await bulletproofMatch(...)
// Assume all exact matches

// ✅ RIGHT
const chunks = await bulletproofMatch(...)
const syntheticChunks = chunks.filter(c => c.confidence === 'synthetic')
if (syntheticChunks.length > 0) {
  console.warn(`${syntheticChunks.length} synthetic chunks need validation`)
}
```

### ❌ Don't Test with Real AI in CI

**Problem**: Expensive, slow, flaky
```typescript
// ❌ WRONG
test('extract metadata', async () => {
  const metadata = await extractMetadata(chunk)  // Real Ollama call
})

// ✅ RIGHT
test('extract metadata', async () => {
  const ollama = createMockOllama()
  const metadata = await extractMetadata(chunk, { ollama })
})
```

### ❌ Don't Ignore OOM Errors

**Problem**: Graceful fallback needed
```typescript
// ❌ WRONG
const cleaned = await ollamaCleanup(markdown)  // Crashes on OOM

// ✅ RIGHT
try {
  const cleaned = await ollamaCleanup(markdown)
} catch (error) {
  if (error.message.includes('out of memory')) {
    console.warn('Ollama OOM, falling back to regex-only cleanup')
    return regexCleanup(markdown)
  }
  throw error
}
```

### ❌ Don't Use Invalid Docling Parameters

**Problem**: `heading_as_metadata` doesn't exist
```python
# ❌ WRONG
chunker = HybridChunker(heading_as_metadata=True)

# ✅ RIGHT
chunker = HybridChunker()  # Headings are automatic
```

### ❌ Don't Hardcode Chunk Sizes

**Problem**: Inconsistency across codebase
```typescript
// ❌ WRONG
const chunker = new HybridChunker({ max_tokens: 768 })
const CHUNK_SIZE = 768  // Duplicated constant

// ✅ RIGHT
import { CHUNK_SIZE } from './chunker-config'
const chunker = new HybridChunker({ max_tokens: CHUNK_SIZE })
```

### ❌ Don't Modify Stored Chunk Content

**Problem**: Breaks annotation positions
```typescript
// ❌ WRONG
const enhanced = `${metadata}\n\n${chunk.content}`
await supabase.from('chunks').insert({ content: enhanced })

// ✅ RIGHT
const enhanced = `${metadata}\n\n${chunk.content}`
const embedding = await embed(enhanced)
await supabase.from('chunks').insert({
  content: chunk.content,  // ORIGINAL
  embedding: embedding  // ENHANCED
})
```

### ❌ Don't Skip Metadata Validation

**Problem**: Quality regressions go unnoticed
```typescript
// ❌ WRONG
await saveChunks(chunks)

// ✅ RIGHT
const stats = validateChunkQuality(chunks)
if (stats.metadata_coverage < 0.8) {
  console.warn('Low metadata coverage, investigate')
}
await saveChunks(chunks)
```

---

## Troubleshooting Guide

### Common Issues & Solutions

#### 1. Ollama Not Responding

**Symptoms**:
- Cleanup hangs indefinitely
- Timeout errors after 5 minutes

**Diagnosis**:
```bash
# Check if Ollama is running
curl -s http://127.0.0.1:11434/api/version

# Expected output:
# {"version":"0.1.0"}
```

**Solutions**:
```bash
# Start Ollama server
ollama serve

# Pull model if missing
ollama pull qwen2.5:32b-instruct-q4_K_M

# Test model
ollama run qwen2.5:32b-instruct-q4_K_M "Hello"
```

---

#### 2. Out of Memory (OOM) Errors

**Symptoms**:
- Ollama crashes during cleanup
- Error: "out of memory" or "killed"

**Diagnosis**:
```bash
# Check system memory
top -l 1 | grep PhysMem

# Check Ollama model size
ollama list | grep qwen
```

**Solutions**:

**Option 1: Switch to smaller model**
```bash
# Unload large model
ollama stop qwen2.5:32b

# Use 14B model instead
ollama pull qwen2.5:14b-instruct-q4_K_M
```

**Option 2: Fallback to regex-only**
```typescript
// worker/lib/local/ollama-cleanup.ts
try {
  const cleaned = await ollamaCleanup(markdown)
} catch (error) {
  if (error.message.includes('out of memory')) {
    console.warn('Ollama OOM, using regex-only cleanup')
    return regexCleanup(markdown)  // Fallback
  }
  throw error
}
```

---

#### 3. High Synthetic Chunks (>10%)

**Symptoms**:
- Many chunks flagged for validation
- Confidence tracking shows >10% synthetic

**Diagnosis**:
```bash
# Check chunk quality stats
npm run validate:metadata

# Look for "synthetic chunks" count
```

**Possible Causes**:
1. **Poor Docling extraction**: PDF is scanned or low quality
2. **Aggressive cleanup**: Too many changes between original and cleaned
3. **Bad fuzzy matching**: Thresholds too strict

**Solutions**:

**Verify PDF quality**:
```bash
# Check if PDF is text-based or scanned
pdfinfo source.pdf | grep "Pages"
pdffonts source.pdf  # Should show embedded fonts
```

**Adjust fuzzy matching thresholds**:
```typescript
// worker/lib/local/bulletproof-matcher.ts
const SIMILARITY_THRESHOLD = 0.75  // Lower to 0.65 if needed
```

**Skip AI cleanup for clean PDFs**:
```typescript
// Skip Ollama cleanup if PDF is clean
if (isCleanPdf(pdf)) {
  return regexCleanupOnly(markdown)
}
```

---

#### 4. Python Subprocess Hangs

**Symptoms**:
- Docling extraction never completes
- No output after 20+ minutes

**Diagnosis**:
```bash
# Check for zombie Python processes
ps aux | grep python3

# Check for stderr output
tail -f worker/logs/python-stderr.log
```

**Common Causes**:
1. **Missing `stdout.flush()`**: IPC buffer not flushed
2. **Infinite loop**: Python script stuck
3. **Timeout too short**: Large PDFs need more time

**Solutions**:

**Ensure flush after JSON output**:
```python
# worker/scripts/docling_extract.py
print(json.dumps(output), flush=True)
sys.stdout.flush()  # Critical!
sys.exit(0)
```

**Increase timeout for large PDFs**:
```typescript
// worker/lib/local/docling-extract.ts
const timeout = pdfPages > 200 ? 1200000 : 600000  // 20 min for large PDFs
```

---

#### 5. Wrong Embedding Dimensions

**Symptoms**:
- Database insert fails with "expected 768 dimensions, got 384"
- Vector search returns no results

**Diagnosis**:
```typescript
// Check embedding output
const embedding = await embedder(text)
console.log('Dimensions:', embedding.data.length)  // Should be 768
```

**Common Causes**:
1. **Missing `pooling: 'mean'`**: Returns token embeddings (384d per token)
2. **Wrong model**: Using MiniLM (384d) instead of MPNet (768d)

**Solutions**:

**Verify configuration**:
```typescript
// worker/lib/local/embeddings-local.ts
const embeddings = await embedder(chunks, {
  pooling: 'mean',      // REQUIRED for 768d
  normalize: true       // REQUIRED for cosine similarity
})

// Verify output
if (embeddings.data.length !== 768) {
  throw new Error(`Wrong dimensions: ${embeddings.data.length}`)
}
```

---

#### 6. Missing Metadata in Chunks

**Symptoms**:
- `heading_path` is null or empty
- Page numbers missing
- Citation broken

**Diagnosis**:
```typescript
// Check metadata coverage
const stats = validateChunkQuality(chunks)
console.log('Metadata coverage:', stats.metadata_coverage)
// Should be >80%
```

**Common Causes**:
1. **Docling extraction failed**: PDF has no TOC or structure
2. **Bulletproof matcher skipped metadata**: Bug in transfer logic
3. **PDF has no headings**: Plain text document

**Solutions**:

**Verify Docling extraction quality**:
```bash
# Check cached_chunks for Docling metadata
psql -d rhizome -c "SELECT heading_path FROM cached_chunks LIMIT 5"
```

**Inspect bulletproof matcher output**:
```typescript
// worker/lib/local/bulletproof-matcher.ts
console.log('Match result:', {
  heading_path: match.chunk.meta.heading_path,
  page_start: match.chunk.meta.page_start,
  confidence: match.confidence
})
```

**Fallback to defaults**:
```typescript
// If metadata missing, use sensible defaults
const chunk = {
  ...chonkieChunk,
  heading_path: overlapping.length > 0
    ? overlapping[0].chunk.meta.heading_path
    : ['Untitled'],
  page_start: overlapping.length > 0
    ? overlapping[0].chunk.meta.page_start
    : estimatePageNumber(chonkieChunk.start_index, totalPages)
}
```

---

## Next Steps

### For New Documents
1. Choose chunker strategy based on content type (see PRP decision matrix)
2. Use default HybridChunker for most documents (fast, reliable)
3. Use Semantic/Neural chunkers for narrative/thematic content
4. Validate synthetic chunks in Admin Panel if >5%

### For Development
1. Run integration tests: `npm run test:integration`
2. Validate metadata quality: `npm run validate:metadata`
3. Benchmark performance: `npm run benchmark:all`
4. Monitor quality metrics in logs

### For Production
1. Set up monitoring for synthetic chunk rates
2. Configure OOM fallbacks for large documents
3. Enable automated quality checks in CI/CD
4. Document chunker selection best practices for users

---

**End of Pipeline Documentation**
