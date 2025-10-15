# Rhizome V2 Processing Pipeline Documentation

**Last Updated**: 2025-10-11
**Status**: Complete and Operational

## Overview

Rhizome V2 features a **dual-mode processing architecture** that balances cost, privacy, quality, and speed. Both PDF and EPUB pipelines support LOCAL mode (100% local, zero API costs, complete privacy) and CLOUD mode (faster, $0.50/book, Gemini-powered).

### Key Features

- **100% Chunk Recovery Guarantee**: 5-layer bulletproof matching system ensures no data loss
- **Structural Metadata Preservation**: Page numbers, headings, bboxes maintained through text transformations
- **Review Checkpoints**: "Think before you spend" gates allow user review before expensive operations
- **Graceful Degradation**: Every stage has fallback strategies (OOM → regex, embeddings → Gemini → none)
- **Cost Control**: LOCAL mode eliminates recurring API costs, CLOUD mode optimizes for speed

### Mode Comparison

| Aspect | LOCAL Mode | CLOUD Mode |
|--------|-----------|-----------|
| **Cost** | $0.00 (one-time setup) | $0.50-$1.10/book |
| **Speed** | ~15 min/book | ~10-14 min/book |
| **Privacy** | 100% local, offline capable | Requires internet, data sent to Gemini |
| **Metadata** | Full structural metadata (pages, headings, bboxes) | AI-extracted metadata only |
| **Chunk Recovery** | 100% guaranteed, confidence tracking | AI semantic boundaries |
| **Requirements** | 24GB+ RAM, Ollama, Qwen model | Just API key |
| **Best For** | Academic study, citation needs, privacy | Quick ingestion, casual reading |

---

## 1. PDF Processing Pipeline

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                    PDF PROCESSING PIPELINE                          │
│                                                                     │
│  Mode Selection: PROCESSING_MODE = local | cloud                   │
└─────────────────────────────────────────────────────────────────────┘

╔═══════════════════════════════════════════════════════════════════╗
║                         SHARED STAGES (Both Modes)                 ║
╚═══════════════════════════════════════════════════════════════════╝

┌─────────────────────────────────────────────────────────────────────┐
│ Stage 1: Download PDF (10-15%)                                     │
├─────────────────────────────────────────────────────────────────────┤
│ • Fetch from Supabase Storage                                       │
│ • Create signed URL → download to buffer                            │
│ • File size logging                                                 │
└─────────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────────┐
│ Stage 2: Docling Extraction (15-50%)                                │
├─────────────────────────────────────────────────────────────────────┤
│ Python Subprocess: docling_extract.py                               │
│                                                                     │
│ LOCAL MODE (enableChunking=true):                                  │
│   • HybridChunker: 512 tokens, tokenizer='Xenova/all-mpnet-base-v2'│
│   • Extracts ~382 chunks with metadata:                             │
│     - page_start/page_end (1-based page numbers)                    │
│     - heading_path (["Chapter 1", "Section 1.1"])                   │
│     - heading_level (TOC depth)                                     │
│     - bboxes (PDF coordinates for highlighting)                     │
│   • Structure: headings[], total_pages                              │
│                                                                     │
│ CLOUD MODE (enableChunking=false):                                 │
│   • Markdown only, no chunks                                        │
│   • Structure info still extracted                                  │
│                                                                     │
│ CRITICAL: Caches to job.metadata.cached_extraction                  │
│   → Prevents re-extraction if cleanup fails                         │
│                                                                     │
│ Output: markdown (150KB), chunks (382 segments), structure          │
└─────────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────────┐
│ Stage 3: Local Regex Cleanup (50-55%)                              │
├─────────────────────────────────────────────────────────────────────┤
│ cleanPageArtifacts(markdown, { skipHeadingGeneration: true })       │
│   • Remove page numbers, headers, footers                           │
│   • Fix smart quotes, em dashes                                     │
│   • Normalize whitespace                                            │
│   • Skip heading generation (Docling already extracted structure)   │
└─────────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────────┐
│ Stage 3.5: OPTIONAL Review Checkpoint                              │
├─────────────────────────────────────────────────────────────────────┤
│ IF reviewDoclingExtraction = true:                                  │
│   • Pause BEFORE AI cleanup                                         │
│   • Return markdown only (no chunks)                                │
│   • User reviews/edits in Obsidian                                  │
│   • Resume: Re-run job with flag=false                              │
│   • Benefit: Skip AI cleanup if already clean                       │
└─────────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────────┐
│ Stage 4: AI Cleanup (55-70%) - OPTIONAL                            │
├─────────────────────────────────────────────────────────────────────┤
│ IF cleanMarkdown = false: SKIP (use regex-only)                    │
│ IF cleanMarkdown = true (default):                                 │
│                                                                     │
│ LOCAL MODE:                                                         │
│   cleanMarkdownLocal(markdown) via Ollama (Qwen 32B)               │
│   • Small docs (<100K): Single pass                                 │
│   • Large docs (>100K): Split at ## headings                        │
│   • Remove OCR artifacts, fix formatting                            │
│   • Temperature: 0.3 (consistent, not creative)                     │
│   • OOM Recovery: Catch OOMError → cleanMarkdownRegexOnly()        │
│                    → markForReview('ai_cleanup_oom')               │
│                                                                     │
│ CLOUD MODE:                                                         │
│   cleanPdfMarkdown(ai, markdown) via Gemini                         │
│   • Heading-split strategy for large docs                           │
│   • Parallel batch processing                                       │
│   • Cost: ~$0.10 for 500-page book                                  │
│                                                                     │
│ Output: Cleaned markdown (140KB, OCR fixed)                         │
└─────────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────────┐
│ Stage 5: OPTIONAL Review Checkpoint                                │
├─────────────────────────────────────────────────────────────────────┤
│ IF reviewBeforeChunking = true:                                    │
│   • Pause BEFORE chunking/matching (most expensive stage)           │
│   • Return markdown only (AI cleaned)                               │
│   • Saves ~$0.50 by skipping chunking until user approves           │
│   • User reviews in Obsidian, can fix cleanup issues                │
└─────────────────────────────────────────────────────────────────────┘
                              ↓
                  ┌───────────────────┐
                  │  MODE DIVERGENCE  │
                  └───────────────────┘
                              ↓
                ┌─────────────┴─────────────┐
                ↓                           ↓
```

### LOCAL MODE: Stages 6-9 (Bulletproof Matching Path)

```
┌───────────────────────────────────────────────────────────────────┐
│ Stage 6: Bulletproof Matching (70-75%)                            │
├───────────────────────────────────────────────────────────────────┤
│ Input: cleaned markdown + doclingChunks (cached)                  │
│                                                                   │
│ bulletproofMatch() - 5-Layer System:                             │
│                                                                   │
│ Layer 1 - Enhanced Fuzzy (4 strategies):                         │
│   • Exact indexOf                                                 │
│   • Normalized whitespace                                         │
│   • Multi-anchor search (start/middle/end)                        │
│   • Sliding window with Levenshtein                               │
│   Success Rate: 85-90%                                            │
│                                                                   │
│ Layer 2 - Embeddings:                                             │
│   • Transformers.js (Xenova/all-mpnet-base-v2)                    │
│   • Cosine similarity >0.85 threshold                             │
│   • Sliding windows across markdown                               │
│   Success Rate: 95-98% cumulative                                 │
│                                                                   │
│ Layer 3 - LLM Assisted:                                           │
│   • Ollama Qwen finds chunk in search window                      │
│   • Returns JSON with offsets                                     │
│   Success Rate: 99.9% cumulative                                  │
│                                                                   │
│ Layer 4 - Interpolation (NEVER FAILS):                            │
│   • Anchor-based position calculation                             │
│   • Uses matched chunks to estimate unmatched positions           │
│   • 100% GUARANTEED recovery                                      │
│                                                                   │
│ Validation:                                                       │
│   • Enforce sequential ordering (no overlaps)                     │
│   • Fix backwards jumps                                           │
│   • Generate warnings for synthetic chunks                        │
│                                                                   │
│ Output: MatchResult[] with:                                       │
│   • chunk (Docling metadata preserved)                            │
│   • start_offset/end_offset (new positions)                       │
│   • confidence (exact/high/medium/synthetic)                      │
│   • method (which layer matched)                                  │
│   • similarity score                                              │
│                                                                   │
│ Validation Warnings (NEW - Migration 047):                       │
│   • Warnings persisted to database for user review                │
│   • Saved to chunks.validation_warning + validation_details       │
│   • Surfaced in ChunkQualityPanel UI for validation/correction   │
│   • See "User Validation Workflow" section below                  │
└───────────────────────────────────────────────────────────────────┘
              ↓
┌───────────────────────────────────────────────────────────────────┐
│ Stage 7: Metadata Enrichment (75-90%)                             │
├───────────────────────────────────────────────────────────────────┤
│ PydanticAI + Ollama (Structured Extraction)                       │
│                                                                   │
│ Batch Processing: 10 chunks at a time                             │
│                                                                   │
│ Extracts:                                                         │
│   • themes: string[] (key topics)                                 │
│   • importance: 0-1 (chunk significance)                          │
│   • summary: string (brief description)                           │
│   • emotional: { polarity, primaryEmotion, intensity }            │
│   • concepts: Concept[] (key ideas with relationships)            │
│   • domain: string (academic field)                               │
│                                                                   │
│ Error Recovery:                                                   │
│   • On failure: Use default metadata                              │
│   • Mark for review but continue                                  │
│   • Chunks still valid without enrichment                         │
│                                                                   │
│ Output: Enriched chunks with structured metadata                  │
└───────────────────────────────────────────────────────────────────┘
              ↓
┌───────────────────────────────────────────────────────────────────┐
│ Stage 8: Local Embeddings (90-95%)                                │
├───────────────────────────────────────────────────────────────────┤
│ generateEmbeddingsLocal() via Transformers.js                     │
│                                                                   │
│ Model: Xenova/all-mpnet-base-v2                                   │
│   • MUST match HybridChunker tokenizer                            │
│   • pooling='mean' (CRITICAL)                                     │
│   • normalize=true (CRITICAL)                                     │
│   • Dimensions: 768d vectors                                      │
│                                                                   │
│ Fallback Chain:                                                   │
│   1. Local Transformers.js (free, fast)                           │
│   2. Gemini embeddings (costs ~$0.02)                             │
│   3. Save without embeddings + mark for review                    │
│                                                                   │
│ Output: Chunks with 768d embedding vectors                        │
└───────────────────────────────────────────────────────────────────┘
              ↓
┌───────────────────────────────────────────────────────────────────┐
│ Stage 9: Finalize (95-100%)                                       │
├───────────────────────────────────────────────────────────────────┤
│ Combine all data into ProcessedChunk[]:                           │
│   • Docling metadata (pages, headings, bboxes)                    │
│   • New offsets (from bulletproof matching)                       │
│   • PydanticAI metadata (themes, emotions, concepts)              │
│   • Local embeddings (768d vectors)                               │
│   • Confidence tracking (exact/high/medium/synthetic)             │
│                                                                   │
│ Return ProcessResult with markdown + chunks + metadata            │
└───────────────────────────────────────────────────────────────────┘
```

### CLOUD MODE: Stages 6-8 (AI Semantic Chunking Path)

```
┌───────────────────────────────────────────────────────────────────┐
│ Stage 6: AI Semantic Chunking (72-95%)                            │
├───────────────────────────────────────────────────────────────────┤
│ batchChunkAndExtractMetadata() via Gemini 2.5 Flash              │
│                                                                   │
│ Configuration:                                                    │
│   • Batch size: 20K chars                                         │
│   • Document type: 'nonfiction_book'                              │
│   • Creates AI-determined semantic boundaries                     │
│   • Extracts metadata in same pass                                │
│                                                                   │
│ Output: Chunks with AI metadata:                                  │
│   • content, start_offset, end_offset                             │
│   • themes, importance, summary                                   │
│   • emotional metadata, concepts, domain                          │
│                                                                   │
│ Trade-offs:                                                       │
│   • NO structural metadata (no page numbers, headings, bboxes)    │
│   • Semantic boundaries may not align with document structure     │
│   • Cost: ~$0.40 for 500-page book                                │
│   • Faster than local matching (no 5-layer process)               │
└───────────────────────────────────────────────────────────────────┘
              ↓
┌───────────────────────────────────────────────────────────────────┐
│ Stage 7: Gemini Embeddings (95-97%)                               │
├───────────────────────────────────────────────────────────────────┤
│ Generate 768d embeddings via Gemini API                           │
│ Cost: ~$0.02                                                      │
└───────────────────────────────────────────────────────────────────┘
              ↓
┌───────────────────────────────────────────────────────────────────┐
│ Stage 8: Finalize (97-100%)                                       │
├───────────────────────────────────────────────────────────────────┤
│ Convert to ProcessedChunk[] format                                │
│ Return ProcessResult                                              │
└───────────────────────────────────────────────────────────────────┘
```

### Performance Metrics (500-page book)

| Metric | LOCAL Mode | CLOUD Mode |
|--------|-----------|-----------|
| **Total Time** | ~15 minutes | ~14 minutes |
| **Extraction** | 9 min (Docling) | 9 min (Docling) |
| **Cleanup** | 3 min (Qwen) or 0 (OOM fallback) | 2 min (Gemini) |
| **Chunking/Matching** | 2 min (5-layer) | 3 min (AI semantic) |
| **Metadata** | 1 min (PydanticAI) | Included in chunking |
| **Embeddings** | 30 sec (local) | Included (~$0.02) |
| **Total Cost** | $0.00 | ~$0.50 |
| **Exact Matches** | 85-90% | N/A (semantic) |
| **Recovery Rate** | 100% guaranteed | 100% (AI boundaries) |

---

## 2. EPUB Processing Pipeline

### Key Differences from PDF

1. **No Page Numbers**: EPUBs are text-based, not page-based
   - `page_start` and `page_end` are ALWAYS NULL
   - Use `section_marker` (EPUB spine position) instead

2. **No Bounding Boxes**: No PDF coordinates
   - `bboxes` is ALWAYS NULL

3. **Different Extractors**:
   - LOCAL mode: `extractEpubWithDocling()` + HybridChunker
   - CLOUD mode: `parseEPUB()` (native EPUB parser, faster)

4. **Per-Chapter Cleanup** (CLOUD mode):
   - More expensive: ~$0.60 cleanup + $0.50 chunking = $1.10/book
   - Deterministic joining with `\n\n---\n\n` (no stitching)

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                    EPUB PROCESSING PIPELINE                         │
│                                                                     │
│  Mode Selection: PROCESSING_MODE = local | cloud                   │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│ Stage 1: Download EPUB (10%)                                       │
│ • Fetch from Supabase Storage → buffer                             │
└─────────────────────────────────────────────────────────────────────┘
                              ↓
                  ┌───────────────────┐
                  │  MODE DIVERGENCE  │
                  │  (Different       │
                  │   Extractors)     │
                  └───────────────────┘
                              ↓
                ┌─────────────┴─────────────┐
                ↓                           ↓

╔═══════════════════════════╗     ╔═══════════════════════════════╗
║      LOCAL MODE           ║     ║       CLOUD MODE              ║
║  (Docling Extractor)      ║     ║  (Native EPUB Parser)         ║
╚═══════════════════════════╝     ╚═══════════════════════════════╝

┌───────────────────────────┐     ┌───────────────────────────────┐
│ Stage 2: Docling Extract  │     │ Stage 2: Parse EPUB (20%)     │
│ (10-50%)                  │     ├───────────────────────────────┤
├───────────────────────────┤     │ parseEPUB(buffer)             │
│ extractEpubWithDocling()  │     │                               │
│                           │     │ • Extract chapters from spine │
│ Python: docling_extract_  │     │ • Parse OPF metadata          │
│         epub.py           │     │ • Extract cover image         │
│                           │     │                               │
│ HybridChunker produces:   │     │ Output:                       │
│   • chunks with metadata: │     │   • chapters[]                │
│     - page_start: NULL    │     │   • metadata (title, author,  │
│     - page_end: NULL      │     │     ISBN, publisher, etc.)    │
│     - heading_path ✓      │     │   • coverImage (buffer)       │
│     - section_marker ✓    │     └───────────────────────────────┘
│     - bboxes: NULL        │                   ↓
│   • epubMetadata          │     ┌───────────────────────────────┐
│                           │     │ Stage 3: Upload Cover (25%)   │
│ Output: markdown, chunks, │     ├───────────────────────────────┤
│         structure,        │     │ IF coverImage exists:         │
│         epubMetadata      │     │   • Upload to storage:        │
└───────────────────────────┘     │     {storagePath}/cover.jpg   │
              ↓                   └───────────────────────────────┘
┌───────────────────────────┐                   ↓
│ Stage 3: Regex Cleanup    │     ┌───────────────────────────────┐
│ (50-55%)                  │     │ Stage 4: Regex Cleanup        │
├───────────────────────────┤     │ (30-35%)                      │
│ cleanMarkdownRegexOnly()  │     ├───────────────────────────────┤
│   • Simpler than PDF      │     │ Per-chapter:                  │
│   • No page artifacts     │     │ cleanEpubArtifacts(chapter)   │
│   • EPUB HTML remnants    │     │   • Remove HTML entities      │
└───────────────────────────┘     │   • Fix EPUB-specific tags    │
                                  └───────────────────────────────┘

╔═══════════════════════════════════════════════════════════════════╗
║                  MODES CONVERGE: Shared Cleanup & Chunking         ║
╚═══════════════════════════════════════════════════════════════════╝

• Stage 3.5/4: OPTIONAL Review Checkpoints (same as PDF)
• Stage 4/5: AI Cleanup (same as PDF, LOCAL: Ollama, CLOUD: Gemini)
• Stage 6-8 (LOCAL): Bulletproof Matching + Metadata + Embeddings (IDENTICAL to PDF)
• Stage 7 (CLOUD): AI Semantic Chunking with document type='fiction' (different strategy)

CRITICAL DIFFERENCES in final ProcessedChunk:
  • page_start: ALWAYS NULL (no pages in EPUB)
  • page_end: ALWAYS NULL
  • section_marker: EPUB spine position (e.g., "chapter003.xhtml")
  • bboxes: ALWAYS NULL (no PDF coordinates)
  • heading_path: Still extracted from EPUB TOC
```

### Performance Metrics (500-page EPUB)

| Metric | LOCAL Mode | CLOUD Mode |
|--------|-----------|-----------|
| **Total Time** | ~12 minutes | ~10 minutes (if AI cleanup disabled) |
| **Extraction** | 7 min (Docling) | 3 min (parseEPUB) |
| **Cleanup** | Same as PDF | ~$0.60 (per-chapter more expensive) |
| **Chunking** | Same as PDF | ~$0.50 |
| **Total Cost** | $0.00 | $1.10 (with AI cleanup), $0.50 (without) |

**Recommendation for EPUBs**: Use LOCAL mode or CLOUD with `cleanMarkdown=false` to avoid expensive per-chapter cleanup.

---

## 3. Bulletproof Matching System (5-Layer Architecture)

The crown jewel of LOCAL mode processing. Guarantees 100% chunk recovery while preserving structural metadata through text transformations.

### Layer 1: Enhanced Fuzzy Matching (4 Strategies)

**Expected Success Rate**: 85-90%

#### Strategy 1: Exact Match
```typescript
const exactIndex = cleanedMarkdown.indexOf(chunk.content, searchHint)
```
- Fast O(n) scan with position hint
- Confidence: EXACT
- Success rate: ~70%

#### Strategy 2: Normalized Match
```typescript
// Collapse whitespace, flexible regex
const pattern = normalized.replace(/ /g, '\\s+')
```
- Handles AI cleanup that condenses spaces
- Confidence: HIGH
- Success rate: +10-12%

#### Strategy 3: Multi-Anchor Search
```typescript
// Find start, middle, and end phrases
const startAnchor = content.slice(0, 100)
const middleAnchor = content.slice(middle - 50, middle + 50)
const endAnchor = content.slice(-100)
```
- Finds chunks with 3x length variation
- Verifies middle anchor for quality
- Confidence: HIGH
- Success rate: +3-5%

#### Strategy 4: Sliding Window + Levenshtein
```typescript
// Slide window across markdown
for (let i = startFrom; i < markdown.length; i += step) {
  const similarity = calculateStringSimilarity(content, window)
  if (similarity > 0.75) { /* match */ }
}
```
- Computationally expensive (hard cap: 50 iterations)
- Threshold: 75% minimum
- Confidence: HIGH (≥80%), MEDIUM (75-80%)
- Success rate: +2-3%

**Layer 1 Output**: ~330/382 chunks matched (86%)

### Layer 2: Embeddings-Based Matching

**Expected Success Rate**: 95-98% cumulative

```typescript
// Generate embeddings for unmatched chunks
const chunkEmbeddings = await generateEmbeddings(unmatchedChunks)

// Create sliding windows of markdown
const windows = createSlidingWindows(markdown, avgChunkSize, 0.5) // 50% overlap

// Generate embeddings for windows
const windowEmbeddings = await generateEmbeddings(windows)

// Find best match via cosine similarity
for (const chunk of unmatchedChunks) {
  const bestWindow = findBestMatch(chunk, windows, threshold=0.85)
}
```

**Technical Requirements**:
- Model: `Xenova/all-mpnet-base-v2`
- `pooling: 'mean'` (CRITICAL)
- `normalize: true` (CRITICAL)
- Dimensions: 768d
- Threshold: 0.85 minimum
- Confidence: HIGH (≥0.95), MEDIUM (0.85-0.95)

**Layer 2 Output**: ~370/382 chunks matched (97%)

### Layer 3: LLM-Assisted Matching

**Expected Success Rate**: 99.9% cumulative

```typescript
// Create search window around estimated position
const estimatedPos = (chunk.index / 400) × markdown.length
const searchWindow = markdown.slice(estimatedPos - 5000, estimatedPos + 5000)

// Ask LLM to find chunk in window
const prompt = `Find where this CHUNK appears in the SEARCH WINDOW...`
const response = await ollama.generateStructured(prompt)

// Response: { found: true, start_offset: 1234, end_offset: 5678, confidence: "high" }
```

**Process**:
1. Estimate position based on chunk index
2. Create 10KB search window
3. Prompt Ollama Qwen to find chunk
4. LLM returns JSON with offsets
5. Convert relative offsets to absolute

**Confidence**: MEDIUM (LLM not deterministic)

**Layer 3 Output**: ~381/382 chunks matched (99.7%)

### Layer 4: Anchor Interpolation (NEVER FAILS)

**Success Rate**: 100% GUARANTEED

The safety net that ensures no chunk is ever lost.

```typescript
// Sort matched chunks by index to create anchors
const anchors = matchedChunks.sort((a, b) => a.chunk.index - b.chunk.index)

for (const unmatchedChunk of remaining) {
  const beforeAnchor = findNearestAnchor(anchors, chunk.index, 'before')
  const afterAnchor = findNearestAnchor(anchors, chunk.index, 'after')

  if (beforeAnchor && afterAnchor) {
    // Case A: Interpolate between two anchors
    const ratio = (chunk.index - before.index) / (after.index - before.index)
    const position = before.end + (after.start - before.end) × ratio

  } else if (beforeAnchor) {
    // Case B: Extrapolate forward after last anchor
    const avgChunkSize = before.end - before.start
    const distance = chunk.index - before.index
    const position = before.end + (avgChunkSize × distance)

  } else if (afterAnchor) {
    // Case C: Extrapolate backward before first anchor
    const avgChunkSize = after.end - after.start
    const distance = after.index - chunk.index
    const position = after.start - (avgChunkSize × distance)

  } else {
    // Case D: No anchors (should never happen)
    const position = (chunk.index / 400) × markdown.length
  }

  // Clamp to valid range
  const clampedPosition = Math.max(0, Math.min(position, markdown.length))
}
```

**Output**:
- Confidence: SYNTHETIC
- Method: 'interpolation'
- Similarity: 0 (no similarity score, calculated position)
- Generates warning for user validation

**Layer 4 Output**: 382/382 chunks matched (100%)

### Validation & Finalization

#### Sequential Ordering Enforcement

CRITICAL for binary search in reader UI:

```typescript
// Enforce no overlaps or backwards jumps
for (let i = 1; i < allMatched.length; i++) {
  const prev = allMatched[i - 1]
  const curr = allMatched[i]

  if (curr.start_offset < prev.end_offset) {
    // ⚠️ OVERLAP DETECTED - Force sequential
    curr.start_offset = prev.end_offset
    curr.end_offset = Math.max(curr.start_offset + curr.chunk.content.length, prev.end_offset + 1)

    // Downgrade confidence
    if (curr.confidence === 'exact') curr.confidence = 'high'
    else if (curr.confidence === 'high') curr.confidence = 'medium'

    // Generate warning
    warnings.push(`Chunk ${curr.chunk.index}: Position overlap corrected. Validation recommended.`)
  }
}
```

### User Validation Workflow

After bulletproof matching completes, validation warnings are **persisted to the database** for user review:

```
┌─────────────────────────────────────────────────────────────┐
│ Processing Complete → Warnings Saved to Database            │
├─────────────────────────────────────────────────────────────┤
│ chunks.validation_warning: "Position overlap corrected..."  │
│ chunks.validation_details: { type, original_offsets, ... }  │
│ chunks.position_validated: FALSE                            │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│ UI: ChunkQualityPanel (src/components/sidebar/)             │
├─────────────────────────────────────────────────────────────┤
│ useUnvalidatedChunks(documentId)                            │
│ → Query: position_validated = FALSE                         │
│ → Returns: { synthetic, overlapCorrected, all }             │
│                                                              │
│ User Actions:                                                │
│ 1. ✅ Validate → validateChunkPosition()                    │
│ 2. 🔧 Fix → Enter correction mode → updateChunkOffsets()    │
│ 3. 📍 View → Navigate to chunk in reader                    │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│ Correction Workflow (if user selects "Fix")                │
├─────────────────────────────────────────────────────────────┤
│ 1. Reader enters correction mode                            │
│ 2. User selects correct text span                           │
│ 3. Calculate markdown offsets (offset-calculator.ts)        │
│ 4. Overlap detection: Check adjacent chunks                 │
│ 5. Update database + correction_history                     │
│ 6. Set position_validated = TRUE                            │
└─────────────────────────────────────────────────────────────┘
```

**Server Actions** (`src/app/actions/chunks.ts`):
- `validateChunkPosition()`: Mark chunk as correct (no changes)
- `updateChunkOffsets()`: Adjust boundaries with overlap detection and history tracking

**Key Files**:
- `src/hooks/use-unvalidated-chunks.ts` (replaces useSyntheticChunks)
- `src/app/actions/chunks.ts` (validation/correction server actions)
- `src/components/sidebar/ChunkQualityPanel.tsx` (UI for review)

**Why This Matters**: Closes the quality loop from "warnings generated" → "warnings persisted" → "user validates" → "system learns"

#### Statistics Example

```
Total: 382 chunks
Exact: 268 (70%)
High: 95 (25%)
Medium: 18 (5%)
Synthetic: 1 (<1%) ⚠️

By Layer:
  Layer 1 (Enhanced Fuzzy): 330 (86%)
  Layer 2 (Embeddings): 40 (10%)
  Layer 3 (LLM): 11 (3%)
  Layer 4 (Interpolation): 1 (0.3%)

Processing Time: 2-3 minutes
```

### Why This Matters

1. **No Data Loss**: 100% chunk recovery guarantee means no content is ever lost
2. **Metadata Preservation**: Page numbers, headings, bboxes survive text transformations
3. **Citation Support**: Users can cite specific pages with confidence
4. **Navigation**: Heading hierarchy enables TOC-based navigation
5. **PDF Highlighting**: Bboxes enable precise highlighting in PDF viewer
6. **Transparency**: Confidence tracking alerts users to synthetic positions needing validation

---

## 4. Decision Tree & Configuration Guide

### Q1: What are your priorities?

#### Option A: Zero Cost + Privacy + Metadata
```bash
# LOCAL MODE
export PROCESSING_MODE=local
export OLLAMA_HOST=http://127.0.0.1:11434
export OLLAMA_MODEL=qwen2.5:32b-instruct-q4_K_M

# Requirements:
# - 24GB RAM minimum (64GB recommended for Qwen 32B)
# - Ollama + Qwen model installed
# - Python 3.10+ with docling
# - Node.js with @huggingface/transformers

# Performance:
# - Time: ~15 min/book
# - Cost: $0.00
# - Quality: 85-90% exact matches, 100% recovery
```

#### Option B: Speed + Convenience (OK with costs)
```bash
# CLOUD MODE
export PROCESSING_MODE=cloud
export GOOGLE_AI_API_KEY=<your-key>

# Requirements:
# - Just an API key
# - Internet connection

# Performance:
# - Time: ~14 min/book
# - Cost: $0.50/book
# - Quality: AI semantic boundaries, no structural metadata
```

### Q2: Is the document already clean?

#### Clean Documents (Digital PDFs, Pre-processed EPUBs)
```typescript
// Skip AI cleanup for speed/cost savings
job.input_data.cleanMarkdown = false

// Benefit:
// - LOCAL: Save 3 min
// - CLOUD: Save $0.10
```

#### Messy Documents (Scanned PDFs, OCR Artifacts)
```typescript
// Enable AI cleanup (default)
job.input_data.cleanMarkdown = true

// LOCAL: Uses Ollama Qwen 32B
// CLOUD: Uses Gemini
// Fixes: OCR artifacts, formatting issues
// OOM fallback: Automatic regex-only cleanup
```

### Q3: Review before expensive processing?

The UI now uses a **single workflow selector** with three options instead of multiple checkboxes:

#### Option A: Fully Automatic (No Review)
```typescript
// UI: reviewWorkflow = 'none'
// Backend flags:
{
  reviewDoclingExtraction: false,
  reviewBeforeChunking: false,
  cleanMarkdown: user_choice
}

// Use case: Batch processing, trusted sources
```

#### Option B: Review After Extraction
```typescript
// UI: reviewWorkflow = 'after_extraction'
// Backend flags:
{
  reviewDoclingExtraction: true,
  reviewBeforeChunking: false,
  cleanMarkdown: false  // Deferred to resume
}

// Use case:
// - Check if document is already clean
// - Skip AI cleanup if extraction is good
// - Edit markdown before cleanup

// Saves:
// - LOCAL: 3 min
// - CLOUD: $0.10
```

#### Option C: Review After Cleanup
```typescript
// UI: reviewWorkflow = 'after_cleanup'
// Backend flags:
{
  reviewDoclingExtraction: false,
  reviewBeforeChunking: true,
  cleanMarkdown: user_choice
}

// Use case:
// - Verify cleanup quality
// - Fix issues before locking chunk boundaries
// - Most expensive stage (chunking/matching)

// Saves:
// - LOCAL: 2 min (matching overhead)
// - CLOUD: $0.50 (AI chunking cost)
```

### Q4: What if Qwen runs out of memory? (LOCAL MODE)

**Automatic OOM Handling**:
```typescript
try {
  markdown = await cleanMarkdownLocal(markdown)
} catch (error) {
  if (error instanceof OOMError) {
    // Automatic fallback to regex-only
    markdown = cleanMarkdownRegexOnly(markdown)
    await markForReview('ai_cleanup_oom', 'Qwen OOM. Using regex. Review recommended.')
  }
}
```

**User Options**:
1. **Accept regex-only**: Complete but lower quality
2. **Switch to smaller model**: `OLLAMA_MODEL=qwen2.5:14b` (requires 16GB RAM)
3. **Disable AI cleanup**: `cleanMarkdown=false`
4. **Use cloud mode**: `PROCESSING_MODE=cloud` (costs $0.50)

**No data loss**: Document always completes processing

---

## 5. Recommended Configurations

### UI Implementation Note
The review workflow selector in DocumentPreview.tsx provides a simplified UX:
- Single dropdown: "Fully Automatic", "Review After Extraction", "Review After Cleanup"
- Conditional cleanMarkdown checkbox (only shown for 'none' and 'after_cleanup')
- No disabled states or confusing mutual exclusions
- Converts to backend flags via `workflowToFlags()` utility

### Academic Books (Deep Study)
```bash
# UI Selection
reviewWorkflow: 'after_cleanup'
cleanMarkdown: true

# Backend
PROCESSING_MODE=local
cleanMarkdown=true
reviewBeforeChunking=true

# Why:
# - Zero cost for large library
# - Full metadata (pages, headings, bboxes)
# - Review before locking chunks
# - Best for citation and navigation
# - Time: ~17 min (with review pause)
```

### Quick Ingestion (Casual Reading)
```bash
# UI Selection
reviewWorkflow: 'none'
cleanMarkdown: false

# Backend
PROCESSING_MODE=cloud
cleanMarkdown=false

# Why:
# - Fast (~10 min)
# - Low cost (~$0.40)
# - Good enough for one-time reads
# - Time: ~10 min
```

### Clean PDFs (Pre-processed)
```bash
# UI Selection
reviewWorkflow: 'after_extraction'
# cleanMarkdown deferred to review stage

# Backend
PROCESSING_MODE=local
reviewDoclingExtraction=true
cleanMarkdown=false

# Why:
# - Quick extraction check
# - Skip cleanup if already good
# - Zero cost
# - Time: ~12 min
```

### Scanned/Messy PDFs (OCR Artifacts)
```bash
# UI Selection
reviewWorkflow: 'none'
cleanMarkdown: true

# Backend
PROCESSING_MODE=local
cleanMarkdown=true

# Why:
# - Full AI cleanup (Qwen)
# - Bulletproof matching
# - Zero cost
# - Time: ~15 min
```

### Limited RAM (<24GB)
```bash
# UI Selection
reviewWorkflow: 'none'
cleanMarkdown: true

# Backend
PROCESSING_MODE=cloud

# Why:
# - No Ollama required
# - No local AI models
# - Trade money for convenience
# - Cost: $0.50/book
```

### Batch Processing (1000 books)
```bash
# UI Selection
reviewWorkflow: 'none'
cleanMarkdown: true

# Backend
PROCESSING_MODE=local
reviewDoclingExtraction=false
reviewBeforeChunking=false

# Why:
# - Fully automatic
# - Zero cost → save $500 vs cloud
# - Process overnight
# - Time: ~250 hours for 1000 books
```

---

## 6. Error Recovery & Resilience

### Philosophy

Every stage has a fallback strategy. Nothing blocks processing. Graceful degradation over hard failures.

### OOM Recovery (Ollama)
```
Error: Qwen out of memory during cleanup
  ↓
Fallback: cleanMarkdownRegexOnly() (basic regex fixes)
  ↓
Action: markForReview('ai_cleanup_oom', message)
  ↓
Continue: Processing continues with reduced quality
  ↓
User: Can re-run with smaller model or disable AI cleanup
```

### Embeddings Fallback Chain
```
Try 1: Local Transformers.js (free, fast)
  ↓ (on failure)
Try 2: Gemini embeddings (cloud, costs ~$0.02)
  ↓ (on failure)
Try 3: Save without embeddings + mark for review
  ↓
Result: Chunks still usable for reading (just no semantic search)
```

### Metadata Extraction Failure
```
Try: PydanticAI + Ollama structured extraction
  ↓ (on failure)
Fallback: Use default metadata (importance=0.5, neutral emotions)
  ↓
Action: markForReview('metadata_enrichment_failed', message)
  ↓
Continue: Processing continues, chunks valid but not enriched
```

### Bulletproof Matching Guarantees
```
Layer 1-3: May fail to match some chunks
  ↓
Layer 4: Interpolation NEVER fails
  ↓
Validation: Enforce sequential ordering, fix overlaps
  ↓
Warnings: Track synthetic chunks for user validation
  ↓
Result: 100% chunk recovery, always
```

### Review Checkpoint Recovery
```
Stage X: reviewDoclingExtraction=true or reviewBeforeChunking=true
  ↓
Pause: Return markdown only (no chunks)
  ↓
Cache: job.metadata.cached_extraction (extraction + doclingChunks)
  ↓
User: Reviews/edits in Obsidian
  ↓
Resume: continue-processing handler respects PROCESSING_MODE
  ↓
LOCAL MODE: bulletproofMatch(cachedDoclingChunks) → local metadata → local embeddings
CLOUD MODE: batchChunkAndExtractMetadata() → Gemini embeddings
  ↓
Benefit: Skip expensive steps until user approves, mode preserved
```

---

## 7. Database Schema: ProcessedChunk

### Shared Fields (Both Modes)
```typescript
interface ProcessedChunk {
  document_id: string
  chunk_index: number
  content: string
  start_offset: number      // Character position in markdown
  end_offset: number        // Character position in markdown
  word_count: number

  // AI-extracted metadata
  themes: string[]
  importance_score: number  // 0-1
  summary: string | null
  emotional_metadata: {
    polarity: number        // -1 to 1
    primaryEmotion: 'joy' | 'sadness' | 'anger' | 'fear' | 'surprise' | 'neutral'
    intensity: number       // 0-1
  }
  conceptual_metadata: {
    concepts: Concept[]
  }
  domain_metadata: {
    primaryDomain: 'literature' | 'science' | 'history' | 'philosophy' | ...
    confidence: number      // 0-1
  } | null
  metadata_extracted_at: string | null

  // Embeddings
  embedding?: number[]      // 768d vector
}
```

### LOCAL MODE ONLY: Structural Metadata
```typescript
interface LocalModeExtras {
  // PDF-specific (from Docling)
  page_start: number | null      // 1-based page number (NULL for EPUB)
  page_end: number | null        // 1-based page number (NULL for EPUB)
  bboxes: Array<{                // PDF coordinates for highlighting (NULL for EPUB)
    page: number
    l: number  // left
    t: number  // top
    r: number  // right
    b: number  // bottom
  }> | null

  // Both PDF and EPUB
  heading_level: number | null   // TOC depth (1=top-level)
  heading_path: string[] | null  // ["Chapter 1", "Section 1.1"]
  section_marker: string | null  // EPUB: "chapter003.xhtml", PDF: null

  // Bulletproof matching tracking
  position_confidence: 'exact' | 'high' | 'medium' | 'synthetic'
  position_method: 'exact_match' | 'normalized_match' | 'multi_anchor_search' |
                   'sliding_window' | 'embeddings' | 'llm_assisted' | 'interpolation'
  position_validated: boolean    // User can validate synthetic chunks

  // Validation & Correction tracking (Migration 047)
  validation_warning: string | null           // "Position overlap corrected..."
  validation_details: {                       // Machine-readable warning metadata
    type: 'overlap_corrected' | 'synthetic' | 'low_similarity'
    original_offsets?: { start: number; end: number }
    adjusted_offsets?: { start: number; end: number }
    reason?: string
    confidence_downgrade?: string
  } | null
  overlap_corrected: boolean                  // TRUE if offsets adjusted during matching
  position_corrected: boolean                 // TRUE if user manually corrected boundaries
  correction_history: Array<{                 // User correction audit trail
    timestamp: string
    old_offsets: { start: number; end: number }
    new_offsets: { start: number; end: number }
    reason: string
  }>
}
```

### Migration: 045_add_local_pipeline_columns.sql
```sql
ALTER TABLE chunks ADD COLUMN page_start integer;
ALTER TABLE chunks ADD COLUMN page_end integer;
ALTER TABLE chunks ADD COLUMN heading_level integer;
ALTER TABLE chunks ADD COLUMN heading_path text[];
ALTER TABLE chunks ADD COLUMN section_marker text;
ALTER TABLE chunks ADD COLUMN bboxes jsonb;
ALTER TABLE chunks ADD COLUMN position_confidence text;
ALTER TABLE chunks ADD COLUMN position_method text;
ALTER TABLE chunks ADD COLUMN position_validated boolean DEFAULT false;
```

### Migration: 047_chunk_validation_corrections.sql
```sql
-- Add validation metadata columns
ALTER TABLE chunks
  ADD COLUMN IF NOT EXISTS validation_warning TEXT,
  ADD COLUMN IF NOT EXISTS validation_details JSONB,
  ADD COLUMN IF NOT EXISTS overlap_corrected BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS position_corrected BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS correction_history JSONB DEFAULT '[]'::jsonb;

-- Add index for querying unvalidated chunks
CREATE INDEX IF NOT EXISTS idx_chunks_needs_validation
  ON chunks(document_id, position_validated)
  WHERE position_validated = FALSE;

-- Add index for overlap-corrected chunks
CREATE INDEX IF NOT EXISTS idx_chunks_overlap_corrected
  ON chunks(document_id, overlap_corrected)
  WHERE overlap_corrected = TRUE;

-- Column comments for documentation
COMMENT ON COLUMN chunks.validation_warning IS 'Human-readable warning message (e.g., "Position overlap corrected")';
COMMENT ON COLUMN chunks.validation_details IS 'Machine-readable warning details: {type, original_offsets, adjusted_offsets, reason}';
COMMENT ON COLUMN chunks.overlap_corrected IS 'TRUE if chunk offsets were adjusted due to overlap during matching';
COMMENT ON COLUMN chunks.position_corrected IS 'TRUE if user manually corrected chunk boundaries';
COMMENT ON COLUMN chunks.correction_history IS 'Array of correction records: [{timestamp, old_offsets, new_offsets, reason}]';
```

---

## 8. Key Insights & Architectural Strengths

### 1. Resilience Philosophy
Every stage has a fallback:
- OOM → regex
- Embeddings → Gemini → none
- Matching → interpolation

Nothing blocks processing. Graceful degradation over hard failures.

### 2. Cost Control
Review checkpoints are "think before you spend" gates:
- `reviewDoclingExtraction`: Pause before $0.10 cleanup
- `reviewBeforeChunking`: Pause before $0.50 chunking

Local mode eliminates recurring costs entirely.

### 3. Metadata Preservation
Bulletproof matching is the crown jewel:
- Maintains page numbers through text transformations
- Preserves heading hierarchy for navigation
- Keeps bboxes for PDF highlighting
- Enables proper citations and cross-references

### 4. Mode Convergence
80% code reuse between LOCAL/CLOUD:
- Shared stages: download, extract, regex cleanup, review checkpoints
- Different: chunking strategy (matching vs AI semantic)
- Convergence point: ProcessedChunk[] format

Both modes produce compatible output for the reader UI.

### 5. 100% Recovery Guarantee
Layer 4 interpolation is the safety net:
- Uses matched chunks as anchors
- Calculates positions for unmatched chunks
- NEVER fails (always returns a position)
- Confidence tracking alerts user to synthetic chunks

Even if all fuzzy matching fails, you still get 100% chunk recovery.

### 6. Format-Specific Adaptations
- **PDF**: page numbers, bboxes, OCR artifacts
- **EPUB**: section markers, chapter boundaries, HTML artifacts
- Both converge to same ProcessedChunk[] format
- UI renders both formats identically

### 7. Performance vs Quality Trade-offs
- **LOCAL**: Slower (15 min) but zero cost, full metadata, 100% recovery
- **CLOUD**: Faster (14 min) but $0.50/book, AI boundaries, no structural metadata

Choose based on use case: deep study vs casual reading.

### 8. User Validation Completes the Quality Loop
Bulletproof matching generates confidence scores and warnings, but **user validation closes the feedback loop**:
- Warnings persisted to database (not ephemeral logs)
- UI surfaces synthetic and overlap-corrected chunks for review
- Users validate correct positions or manually fix boundaries
- Correction history tracked for audit and continuous improvement
- System learns from user corrections to refine matching algorithms
- Transforms processing quality from "black box" to "transparent partnership"

**Why This Matters**: User validation isn't just error correction—it's a quality assurance system that builds trust and enables continuous improvement. The correction_history table becomes a training dataset for future enhancements.

---

## 9. Cached Chunks Architecture

### Overview

The cached chunks system provides persistent storage for Docling extraction results, enabling zero-cost reprocessing when documents are edited. This feature is essential for LOCAL mode users who want to preserve extracted structural metadata (pages, headings, bboxes) without re-running expensive extraction.

### Key Benefits

1. **Zero-Cost Reprocessing**: $0.00 vs $0.50 for CLOUD mode when reprocessing edited documents
2. **Instant Resume**: Load cached extraction results in <2 seconds instead of 9 minutes
3. **Metadata Preservation**: Structural metadata survives markdown edits through bulletproof matching
4. **Hash Validation**: Automatic cache invalidation when markdown changes significantly

### Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                    CACHED CHUNKS LIFECYCLE                          │
└─────────────────────────────────────────────────────────────────────┘

┌───────────────────────────────────────────────────────────────────┐
│ Stage 1: Initial Processing (LOCAL mode)                         │
├───────────────────────────────────────────────────────────────────┤
│ 1. Docling extraction → DoclingChunk[] with metadata             │
│ 2. Generate markdown hash (SHA256)                                │
│ 3. Save to cached_chunks table:                                   │
│    • document_id (UNIQUE constraint)                              │
│    • extraction_mode ('pdf' | 'epub')                             │
│    • markdown_hash (64-char hex)                                  │
│    • chunks (JSONB array of DoclingChunks)                        │
│    • structure (JSONB with headings[], total_pages)               │
│    • docling_version (for compatibility tracking)                 │
│ 4. Continue with bulletproof matching...                          │
└───────────────────────────────────────────────────────────────────┘
                              ↓
┌───────────────────────────────────────────────────────────────────┐
│ Stage 2: Resume from Review Checkpoint                           │
├───────────────────────────────────────────────────────────────────┤
│ User edited markdown in Obsidian → resume processing             │
│                                                                   │
│ 1. Generate current markdown hash                                 │
│ 2. Load cached chunks from database                               │
│ 3. Validate hash:                                                 │
│    IF match   → Load cached chunks (0 API calls)                  │
│    IF mismatch → Fall back to CLOUD mode ($0.50 cost)            │
│ 4. Run bulletproof matching with cached chunks                    │
│ 5. Continue with metadata enrichment...                           │
└───────────────────────────────────────────────────────────────────┘
                              ↓
┌───────────────────────────────────────────────────────────────────┐
│ Stage 3: Document Reprocessing                                   │
├───────────────────────────────────────────────────────────────────┤
│ User makes heavy edits (30% content change) → reprocess          │
│                                                                   │
│ 1. Load cached chunks by document_id                              │
│ 2. Check markdown hash                                            │
│ 3. IF hash matches:                                               │
│    • Cached chunks still valid                                    │
│    • Run bulletproof matching (5 layers)                          │
│    • Preserve structural metadata through edit                    │
│    • Cost: $0.00                                                  │
│ 4. IF hash mismatch (expected after edits):                      │
│    • Cache stale but still valuable                               │
│    • Run bulletproof matching to remap positions                  │
│    • Structural metadata preserved via matching                   │
│    • Cost: $0.00 (no Gemini calls)                                │
│ 5. IF cache missing:                                              │
│    • Fall back to CLOUD mode                                      │
│    • Cost: $0.50 (AI semantic chunking)                          │
└───────────────────────────────────────────────────────────────────┘
```

### Database Schema

**Table**: `cached_chunks`

```sql
CREATE TABLE cached_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL,
  extraction_mode TEXT NOT NULL,  -- 'pdf' | 'epub'
  markdown_hash TEXT NOT NULL,    -- SHA256 hash for validation
  docling_version TEXT,            -- e.g., '2.55.1'
  chunks JSONB NOT NULL,           -- DoclingChunk[] array
  structure JSONB NOT NULL,        -- { headings, total_pages, sections }
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT cached_chunks_document_id_key UNIQUE (document_id),
  FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
);

-- Indexes for efficient lookups
CREATE INDEX idx_cached_chunks_document ON cached_chunks(document_id);
CREATE INDEX idx_cached_chunks_mode ON cached_chunks(extraction_mode);
CREATE INDEX idx_cached_chunks_created ON cached_chunks(created_at DESC);
```

### Usage Examples

#### Query Cached Chunks

```sql
-- Get cache for a document
SELECT
  extraction_mode,
  jsonb_array_length(chunks) as chunk_count,
  LEFT(markdown_hash, 8) as hash_prefix,
  docling_version,
  created_at
FROM cached_chunks
WHERE document_id = '<doc-uuid>';

-- Check all caches
SELECT
  extraction_mode,
  COUNT(*) as cache_count,
  AVG(jsonb_array_length(chunks)) as avg_chunks
FROM cached_chunks
GROUP BY extraction_mode;
```

#### Manual Cache Operations

```typescript
import {
  saveCachedChunks,
  loadCachedChunks,
  deleteCachedChunks,
  hashMarkdown
} from '../lib/cached-chunks'

// Save after extraction
await saveCachedChunks(supabase, {
  document_id: documentId,
  extraction_mode: 'pdf',
  markdown_hash: hashMarkdown(markdown),
  docling_version: '2.55.1',
  chunks: doclingChunks,
  structure: doclingStructure
})

// Load for resume/reprocess
const cached = await loadCachedChunks(
  supabase,
  documentId,
  hashMarkdown(currentMarkdown)
)

if (cached) {
  console.log(`Loaded ${cached.chunks.length} cached chunks`)
  // Use cached chunks for bulletproof matching
} else {
  console.warn('Cache invalid or missing - falling back to CLOUD mode')
}

// Manual cleanup
await deleteCachedChunks(supabase, documentId)
```

### Hash Validation Strategy

**When Hash Matches**:
- Markdown unchanged since extraction
- Cache is 100% valid
- Zero API calls needed
- Instant load (<2 seconds)

**When Hash Mismatches**:
- Markdown edited (expected)
- Cache chunks still valuable as anchors
- Bulletproof matching remaps positions
- Structural metadata preserved
- Still $0.00 cost (LOCAL mode)

**When Cache Missing**:
- Document never processed in LOCAL mode
- Or cache manually deleted
- Graceful fallback to CLOUD mode
- Cost: $0.50 for AI semantic chunking

### Performance Impact

| Scenario | Without Cache | With Cache | Savings |
|----------|--------------|-----------|---------|
| **Resume (no edits)** | 9 min extraction | <2 sec load | 99.6% time saved |
| **Reprocess (30% edits)** | 9 min + $0.50 | 2 min matching | 77% time, $0.50 saved |
| **Reprocess (minor edits)** | 9 min + $0.50 | <1 min matching | 88% time, $0.50 saved |

### Integration Points

**Processors** (cache save):
- `worker/processors/pdf-processor.ts:129` - Save after Docling extraction
- `worker/processors/epub-processor.ts:121` - Save after EPUB extraction

**Handlers** (cache load):
- `worker/handlers/continue-processing.ts:178` - Resume from review checkpoint
- `worker/handlers/reprocess-document.ts:116` - Reprocess edited documents

**Utilities**:
- `worker/lib/cached-chunks.ts` - Save/load/delete operations + hash generation

**Database**:
- `supabase/migrations/046_cached_chunks_table.sql` - Table schema and indexes

### Lifecycle Management

**Automatic Creation**:
- Created after every Docling extraction (LOCAL mode only)
- Upserts on duplicate document_id

**Automatic Invalidation**:
- Hash validation fails when markdown edited
- System logs warning and falls back gracefully

**Automatic Deletion**:
- CASCADE delete when parent document deleted
- No orphaned caches

**Manual Deletion**:
- `DELETE FROM cached_chunks WHERE document_id = '<uuid>'`
- Useful for forcing re-extraction

### Troubleshooting

**Cache Not Loading**:
```bash
# Check if cache exists
psql -c "SELECT document_id, extraction_mode FROM cached_chunks WHERE document_id = '<uuid>';"

# Verify hash
psql -c "SELECT LEFT(markdown_hash, 8) FROM cached_chunks WHERE document_id = '<uuid>';"
```

**Hash Always Mismatches**:
- Markdown was edited (expected behavior)
- System will use bulletproof matching to remap
- Structural metadata still preserved

**Cache Missing After Processing**:
- Check PROCESSING_MODE: cache only created in LOCAL mode
- Verify processor saved cache (check logs for "[CachedChunks] ✓ Saved")

---

## 10. Next Steps & Future Enhancements

### Potential Improvements

1. **Image & Table Extraction**: Add Docling figure/table extraction (see `docs/todo/image-and-table-extraction.md`)
2. **Parallel Processing**: Run Layer 1-3 in parallel (currently sequential)
3. **Adaptive Chunking**: Adjust chunk size based on document density
4. **Cross-Document Matching**: Use bulletproof matching for document updates
5. **Confidence Calibration**: Learn from user validations to improve Layer 4
6. **Smart Caching**: Cache Ollama outputs to avoid re-cleanup on re-runs

### Known Limitations

1. **Scanned PDFs**: Docling OCR is disabled by default (slow), enable via `ocr: true`
2. **Non-English**: Tokenizer assumes English text (mpnet-base-v2)
3. **RAM Requirements**: Qwen 32B needs 64GB for best results (32GB for 14B)
4. **Python Dependency**: Requires Python 3.10+ for Docling

---

## Appendix: File Reference

### PDF Processing
- `worker/processors/pdf-processor.ts`: Main PDF pipeline orchestrator
- `worker/lib/docling-extractor.ts`: Python subprocess bridge for Docling
- `worker/scripts/docling_extract.py`: Python script for PDF extraction
- `worker/lib/local/ollama-cleanup.ts`: Local markdown cleanup (Qwen)
- `worker/lib/local/bulletproof-matcher.ts`: 5-layer matching system
- `worker/lib/chunking/pydantic-metadata.ts`: Metadata extraction (PydanticAI)
- `worker/lib/local/embeddings-local.ts`: Local embeddings (Transformers.js)

### EPUB Processing
- `worker/processors/epub-processor.ts`: Main EPUB pipeline orchestrator
- `worker/lib/local/epub-docling-extractor.ts`: EPUB extraction with Docling
- `worker/scripts/docling_extract_epub.py`: Python script for EPUB extraction
- `worker/lib/epub/epub-parser.ts`: Native EPUB parser (cloud mode)
- `worker/lib/epub/epub-cleaner.ts`: EPUB-specific cleanup

### Shared Components
- `worker/processors/base.ts`: Base processor class with retry/progress
- `worker/lib/text-cleanup.ts`: Regex-based cleanup utilities
- `worker/lib/markdown-cleanup-ai.ts`: AI cleanup (Gemini, cloud mode)
- `worker/lib/ai-chunking-batch.ts`: Batch chunking with AI (cloud mode)
- `worker/lib/embeddings.ts`: Gemini embeddings (cloud fallback)
- `worker/types/processor.ts`: Shared types (ProcessResult, ProcessedChunk)

### Handlers
- `worker/handlers/continue-processing.ts`: Resume processing after review checkpoints (dual-mode)
- `worker/handlers/reprocess-document.ts`: Reprocess documents with cached chunks integration

### Cached Chunks System
- `worker/lib/cached-chunks.ts`: Cache save/load/delete operations + hash generation
- `worker/types/cached-chunks.ts`: Type definitions for cached chunks table
- `supabase/migrations/046_cached_chunks_table.sql`: Cached chunks table schema

### Database
- `supabase/migrations/045_add_local_pipeline_columns.sql`: Local metadata columns
- `supabase/migrations/046_cached_chunks_table.sql`: Cached chunks table for zero-cost reprocessing
- `supabase/migrations/047_chunk_validation_corrections.sql`: Validation/correction tracking columns

### Chunk Validation & Correction System
- `src/app/actions/chunks.ts`: Server actions for validation and correction
- `src/hooks/use-unvalidated-chunks.ts`: Hook for querying chunks needing validation (replaces useSyntheticChunks)
- `src/components/sidebar/ChunkQualityPanel.tsx`: UI for reviewing and correcting chunks
- `src/lib/reader/offset-calculator.ts`: Text selection to markdown offset conversion
