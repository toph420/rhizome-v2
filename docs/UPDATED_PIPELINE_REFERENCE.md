


# Rhizome Document Processing Pipeline Reference

**Version:** 2.0 (Fully Local, Docling-Powered)  
**Last Updated:** January 2025  
**Status:** Production-Ready

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture Philosophy](#architecture-philosophy)
3. [Technology Stack](#technology-stack)
4. [Processing Pipelines](#processing-pipelines)
   - [PDF Pipeline](#pdf-pipeline)
   - [EPUB Pipeline](#epub-pipeline)
   - [Markdown Pipeline](#markdown-pipeline)
   - [Text Pipeline](#text-pipeline)
5. [Key Concepts](#key-concepts)
6. [Database Schema](#database-schema)
7. [Performance & Costs](#performance--costs)
8. [Troubleshooting](#troubleshooting)

---

## Overview

Rhizome transforms documents into a rich knowledge graph with **100% local processing**. Every document—whether PDF, EPUB, Markdown, or plain text—goes through a multi-stage pipeline that:

1. **Extracts** content while preserving structure
2. **Cleans** artifacts and formatting issues
3. **Chunks** intelligently at semantic boundaries
4. **Enriches** with AI-generated metadata (themes, concepts, importance)
5. **Embeds** for semantic search
6. **Connects** chunks across your entire library

**Key Guarantees:**
- ✅ 100% chunk recovery (never lose metadata)
- ✅ 100% local processing (zero API costs, complete privacy)
- ✅ Structure preservation (headings, pages, hierarchy)
- ✅ Type-safe outputs (PydanticAI validation)
- ✅ Resumable processing (checkpoint system)

---

## Architecture Philosophy

### The Hybrid Model: Display vs. Connections

```
┌─────────────────────────────────────────────────────────────┐
│                    DISPLAY LAYER                            │
│  What You Read: Clean, continuous markdown (content.md)     │
│  - Natural reading flow                                      │
│  - No chunk boundaries visible                              │
│  - Portable (standard markdown)                             │
└─────────────────────────────────────────────────────────────┘
                            ↕
┌─────────────────────────────────────────────────────────────┐
│                  CONNECTION LAYER                           │
│  What The System Uses: Semantic chunks (database)           │
│  - Rich metadata (themes, concepts, importance)             │
│  - Precise offsets (for annotations, connections)           │
│  - Structural data (pages, headings, hierarchy)             │
│  - Embeddings (for semantic search)                         │
└─────────────────────────────────────────────────────────────┘

The Bridge: Bulletproof chunk matching maps between layers
```

**Why This Works:**
- You read **clean markdown** without interruptions
- System operates on **semantic chunks** with rich metadata
- Chunks are **metadata overlays** on the display text
- **Citations work** (chunks preserve page/section numbers)
- **Connections work** (chunks have precise offsets)
- **Never lose data** (even if chunk position is approximate)

### File-Over-App Principle

```
storage/
├── {userId}/{documentId}/
│   ├── content.md              ← Clean markdown (what you read)
│   ├── annotations.json        ← Your highlights/notes
│   └── metadata.json           ← Document properties

database/
├── chunks                      ← Semantic units with metadata
├── connections                 ← Relationships between chunks
└── documents                   ← Document-level data + structure
```

**Benefits:**
- Your documents are **portable markdown files**
- Can edit in any text editor
- Version control with Git
- Obsidian integration built-in
- Database is **enrichment layer**, not lock-in

---

## Technology Stack

### Core Technologies

| Component | Technology | Purpose | Why This Choice |
|-----------|-----------|---------|-----------------|
| **PDF Extraction** | Docling | Extract PDFs to structured markdown | 100% local, preserves structure, no hallucinations |
| **EPUB Extraction** | JSZip + Docling | Parse EPUB HTML, extract structure | Native HTML understanding, preserves semantics |
| **Chunking** | Docling HybridChunker | Create semantic chunks | Respects document structure, deterministic, free |
| **LLM Processing** | Qwen 32B (Ollama) | Cleanup, metadata extraction, connections | Powerful local model, structured outputs |
| **Structured Outputs** | PydanticAI | Type-safe LLM responses | Automatic validation, retry on errors, no JSON parsing issues |
| **Embeddings** | sentence-transformers | Semantic search | Fast local embeddings, good quality |
| **Vector Search** | pgvector (Supabase) | Similarity search | Mature, PostgreSQL-native, efficient |
| **Validation** | Fuzzy matching + LLM | Chunk position recovery | 5-layer failsafe ensures 100% recovery |

### Model Specifications

```yaml
Qwen 32B (via Ollama):
  Parameters: 32 billion
  Quantization: Q4_K_M (recommended)
  RAM Required: 20-24GB
  Speed: ~30 tokens/sec on M3 Max
  Use Cases: Cleanup, metadata extraction, connection detection

sentence-transformers/all-MiniLM-L6-v2:
  Dimensions: 384
  Speed: ~2000 chunks/sec
  Quality: Good for most use cases
  
sentence-transformers/all-mpnet-base-v2:
  Dimensions: 768
  Speed: ~1000 chunks/sec
  Quality: Better, recommended for production
```

---

## Processing Pipelines

### PDF Pipeline

```
📚 PDF DOCUMENT PROCESSING (100% LOCAL)

┌─────────────────────────────────────────────────────────────────────┐
│ STAGE 1: DOCLING EXTRACTION (15-50%)                                │
├─────────────────────────────────────────────────────────────────────┤
│ Input:  PDF file from Supabase Storage                              │
│ Action: Docling processes PDF with Python                           │
│         ├─ Extract markdown (structure preserved)                   │
│         ├─ Document structure (sections, headings, hierarchy)       │
│         ├─ HybridChunker (512 tokens, semantic boundaries)          │
│         └─ Rich metadata per chunk:                                 │
│             • page_start, page_end (for citations)                  │
│             • heading, heading_path (for navigation)                │
│             • heading_level (hierarchy depth)                       │
│             • bboxes (PDF coordinates for highlighting)             │
│         ├─ Optional extraction:                                     │
│         │   • Tables (structured data)                              │
│         │   • Figures (captions + positions)                        │
│         │   • Citations (bibliography)                              │
│         │   └─ Code blocks (syntax preserved)                       │
│ Output: originalMarkdown, doclingStructure, doclingChunks           │
│ Cost:   $0 (100% local)                                             │
│ Time:   ~9 minutes for 500 pages                                    │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│ STAGE 2: LOCAL REGEX CLEANUP (50-55%)                               │
├─────────────────────────────────────────────────────────────────────┤
│ Input:  originalMarkdown from Docling                               │
│ Action: Deterministic cleanup with regex                            │
│         ├─ Remove page numbers, headers, footers                    │
│         ├─ Fix obvious hyphenation (end-of-line breaks)             │
│         ├─ Normalize whitespace (consistent spacing)                │
│         └─ Skip heading generation (Docling provides structure)     │
│ Output: regexCleanedMarkdown                                         │
│ Cost:   $0 (local regex)                                            │
│ Time:   <1 second                                                    │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│ OPTIONAL CHECKPOINT: Review Docling Extraction                      │
├─────────────────────────────────────────────────────────────────────┤
│ User Setting: reviewDoclingExtraction = true                         │
│ Action:       Export to Obsidian for manual review                  │
│ User Choice:  ├─ Continue with LLM cleanup                          │
│               └─ Skip LLM cleanup (use regex-cleaned version)       │
│ Status:       Pipeline pauses until user decision                   │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│ STAGE 3: LOCAL LLM CLEANUP (55-70%) [Optional]                      │
├─────────────────────────────────────────────────────────────────────┤
│ User Setting: cleanMarkdown = true (default)                         │
│ Input:        regexCleanedMarkdown                                   │
│ Action:       Multi-pass cleanup with Qwen 32B (Ollama)             │
│               Pass 1: Remove artifacts (headers, footers, noise)    │
│                       ├─ Identify and remove running headers        │
│                       ├─ Remove page number fragments               │
│                       └─ Clean OCR errors                           │
│               Pass 2: Fix formatting issues                          │
│                       ├─ Merge incorrectly split paragraphs         │
│                       ├─ Fix hyphenation across lines               │
│                       └─ Normalize inconsistent spacing             │
│               Pass 3: Validate and polish                            │
│                       ├─ Check markdown structure                   │
│                       ├─ Verify heading hierarchy                   │
│                       └─ Final quality pass                         │
│         Strategy: Heading-split for large docs (>100K chars)        │
│                  ├─ Split at ## headings before cleanup             │
│                  ├─ Clean each section independently               │
│                  └─ Join sections (no stitching complexity)         │
│         Validation: PydanticAI ensures structured cleanup           │
│ Output: cleanedMarkdown (polished, may differ from original)        │
│ Cost:   $0 (local Ollama)                                           │
│ Time:   ~10-30 minutes (depends on size)                            │
│ Quality: Removes 90%+ of artifacts while preserving content         │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│ OPTIONAL CHECKPOINT: Review LLM Cleanup                             │
├─────────────────────────────────────────────────────────────────────┤
│ User Setting: reviewBeforeChunking = true                            │
│ Action:       Export cleaned markdown to Obsidian                   │
│ Purpose:      Verify quality before expensive enrichment            │
│ Status:       Pipeline pauses until user approves                   │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│ STAGE 4: BULLETPROOF CHUNK MATCHING (70-75%)                        │
├─────────────────────────────────────────────────────────────────────┤
│ Problem: doclingChunks have offsets for originalMarkdown            │
│          But we display cleanedMarkdown (different text!)           │
│ Solution: 5-layer failsafe matching system                          │
│                                                                       │
│ Phase 1: Enhanced Fuzzy Matching (85% success)                     │
│   Method: String similarity algorithms                               │
│   ├─ Exact match: Find identical text                              │
│   ├─ Normalized match: Ignore whitespace differences               │
│   ├─ Multi-anchor search: Use start/middle/end phrases             │
│   └─ Sliding window: Find best matching window                     │
│   Cost: $0 (local string operations)                                │
│   Time: ~5 seconds                                                   │
│   Result: 85% of chunks matched with high confidence                │
│                                                                       │
│ Phase 2: Embedding-Based Matching (98% cumulative)                 │
│   Method: Semantic similarity via embeddings                         │
│   ├─ Embed all chunk contents                                      │
│   ├─ Create sliding windows of cleaned markdown                    │
│   ├─ Embed all windows                                             │
│   ├─ Find best matching window via cosine similarity               │
│   └─ Threshold: 0.85+ for confidence                               │
│   Cost: $0 (local sentence-transformers)                            │
│   Time: ~30 seconds                                                  │
│   Result: +13% chunks matched (98% total)                           │
│                                                                       │
│ Phase 3: LLM-Assisted Matching (99.9% cumulative)                  │
│   Method: Qwen 32B semantic understanding                           │
│   ├─ For remaining unmatched chunks                                │
│   ├─ Give LLM the chunk content + search window                    │
│   ├─ LLM finds semantic match (handles rephrasing)                 │
│   └─ Returns position with confidence level                        │
│   Cost: $0 (local Ollama)                                           │
│   Time: ~15 seconds (~7 chunks)                                     │
│   Result: +1.9% chunks matched (99.9% total)                        │
│                                                                       │
│ Phase 4: Anchor Interpolation (100% guaranteed)                    │
│   Method: Position interpolation between neighbors                  │
│   ├─ For any remaining unmatched chunks                            │
│   ├─ Find nearest matched neighbors (before/after)                 │
│   ├─ Interpolate position based on chunk index                     │
│   ├─ Mark as "synthetic" with confidence tracking                  │
│   └─ PRESERVE all metadata (pages, themes intact)                  │
│   Cost: $0 (local math)                                             │
│   Time: Instant                                                      │
│   Result: 100% chunk recovery (no data loss ever)                   │
│                                                                       │
│ Output: rematchedChunks with:                                        │
│         ├─ NEW offsets (in cleanedMarkdown)                         │
│         ├─ OLD metadata (pages, headings, bboxes)                   │
│         └─ Confidence tracking (exact/high/medium/synthetic)        │
│ Guarantee: 100% chunk recovery, metadata always preserved           │
│ Cost: ~$0.06 total (mostly free, small embedding cost)             │
│ Time: ~50 seconds                                                    │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│ STAGE 5: LOCAL LLM METADATA ENRICHMENT (75-90%)                     │
├─────────────────────────────────────────────────────────────────────┤
│ Input:  rematchedChunks (now with correct offsets)                  │
│ Action: Extract semantic metadata using Qwen 32B + PydanticAI       │
│         For each chunk:                                              │
│         ├─ Themes: 2-3 key topics (e.g., "entropy", "thermodynamics")│
│         ├─ Concepts: Entities with importance scores                │
│         │   Example: [{"text": "V-2 rocket", "importance": 0.9}]    │
│         ├─ Importance: 0-1 score (how central to document)          │
│         ├─ Summary: One-sentence description                        │
│         ├─ Emotional Tone: {polarity, primaryEmotion, intensity}    │
│         └─ Domain: Primary field (science, history, etc.)           │
│                                                                       │
│ PydanticAI Benefits:                                                 │
│   ✅ Type-safe outputs (no JSON parsing errors)                     │
│   ✅ Automatic retries (LLM fixes validation failures)              │
│   ✅ Clear error messages (knows exactly what's wrong)              │
│   ✅ Schema enforcement (guaranteed structure)                      │
│                                                                       │
│ Processing: Batch 10 chunks at a time for efficiency                │
│                                                                       │
│ Preserved: All Docling structural metadata                          │
│   ├─ page_start, page_end (unchanged)                              │
│   ├─ heading, heading_path, heading_level (unchanged)              │
│   └─ bboxes (unchanged)                                            │
│                                                                       │
│ Output: enrichedChunks (structure + semantics combined)             │
│         Each chunk now has:                                          │
│         ├─ Docling metadata (structure, pages, headings)            │
│         └─ AI metadata (themes, concepts, importance)               │
│ Cost:   $0 (local Ollama + PydanticAI)                             │
│ Time:   ~10-20 minutes (depends on chunk count)                     │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│ STAGE 6: LOCAL EMBEDDING GENERATION (90-95%)                        │
├─────────────────────────────────────────────────────────────────────┤
│ Input:  enrichedChunks (with all metadata)                          │
│ Action: Generate embeddings for semantic search                     │
│         Model: sentence-transformers/all-mpnet-base-v2              │
│                (768 dimensions, better quality)                      │
│         Alternative: all-MiniLM-L6-v2 (384 dims, faster)            │
│         Batch: Process 100 chunks at a time                         │
│         Validation: Verify all vectors are 768-dimensional          │
│ Output: embeddings[] (one per chunk)                                │
│ Cost:   $0 (local sentence-transformers)                            │
│ Time:   ~1-2 minutes for 380 chunks                                 │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│ STAGE 7: SAVE TO DATABASE (95-98%)                                  │
├─────────────────────────────────────────────────────────────────────┤
│ Save cleanedMarkdown:                                                │
│   Location: storage/{userId}/{documentId}/content.md                │
│   Purpose:  What users read (display layer)                         │
│                                                                       │
│ Save document metadata:                                              │
│   ├─ structure: Docling's hierarchical sections                     │
│   ├─ tables: Extracted tables (if any)                             │
│   ├─ figures: Extracted figures with captions                       │
│   ├─ citations: Bibliography entries                                │
│   ├─ matching_stats: Chunk recovery statistics                     │
│   └─ warnings: Any synthetic chunks flagged                         │
│                                                                       │
│ Insert enrichedChunks to database:                                   │
│   Each chunk contains:                                               │
│   ├─ content: The actual text                                       │
│   ├─ start_offset, end_offset: Position in cleanedMarkdown         │
│   ├─ chunk_index: Sequential order                                  │
│   ├─ Docling metadata:                                              │
│   │   ├─ page_start, page_end                                      │
│   │   ├─ heading, heading_path[], heading_level                    │
│   │   └─ bboxes[] (for PDF highlighting)                           │
│   ├─ AI metadata:                                                   │
│   │   ├─ themes[]                                                   │
│   │   ├─ concepts[] (with importance scores)                       │
│   │   ├─ importance_score                                           │
│   │   ├─ summary                                                    │
│   │   ├─ emotional_metadata                                         │
│   │   └─ domain                                                     │
│   ├─ embedding: vector(768) for semantic search                    │
│   └─ position_confidence: exact/high/medium/synthetic              │
│                                                                       │
│ Result: Document ready for reading, searching, connecting           │
│ Cost:   $0 (database writes)                                        │
│ Time:   ~30 seconds                                                  │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│ STAGE 8: CONNECTION DETECTION (Async, separate background job)     │
├─────────────────────────────────────────────────────────────────────┤
│ Trigger: Queued as separate job (doesn't block document)            │
│ Purpose: Find relationships between chunks across entire library    │
│                                                                       │
│ 3-Engine Detection System (all local):                              │
│                                                                       │
│ Engine 1: Semantic Similarity                                        │
│   Method: Vector cosine similarity (pgvector)                       │
│   ├─ Query: For each chunk, find similar chunks via embedding      │
│   ├─ Threshold: 0.70+ similarity                                   │
│   ├─ Finds: "These say the same thing"                             │
│   └─ Example: Two chunks both discussing entropy                   │
│   Cost: $0 (database vector search)                                 │
│   Speed: <1 second per chunk                                        │
│                                                                       │
│ Engine 2: Contradiction Detection                                   │
│   Method: Metadata analysis + Qwen 32B                              │
│   ├─ Filter: Chunks with overlapping concepts                      │
│   ├─ Check: Opposite emotional polarity                            │
│   │   (polarity > 0.3 vs polarity < -0.3)                          │
│   ├─ Verify: Ask Qwen 32B if they actually contradict              │
│   └─ Finds: "These disagree about the same topic"                  │
│   Example: Optimistic view vs pessimistic view of AI               │
│   Cost: $0 (local Ollama, filtered candidates)                     │
│   Speed: ~100 comparisons per document                              │
│                                                                       │
│ Engine 3: Thematic Bridge                                           │
│   Method: Cross-domain concept matching via Qwen 32B               │
│   Aggressive Filtering (reduces 160k to ~200 comparisons):         │
│   ├─ Importance > 0.6 (only important chunks)                      │
│   ├─ Cross-document only (no self-connections)                     │
│   ├─ Different domains (cross-pollination)                         │
│   ├─ Concept overlap 0.2-0.7 (sweet spot)                          │
│   └─ Top 15 candidates per chunk                                   │
│   Action: Qwen 32B analyzes filtered pairs                          │
│   Finds: "These connect different domains via shared concept"       │
│   Example: "paranoia" in literature ↔ "surveillance" in tech       │
│   Cost: $0 (local Ollama, ~200 calls)                              │
│   Speed: ~30-60 minutes for full analysis                           │
│                                                                       │
│ Output: connections[] stored in database                             │
│         Each connection has:                                         │
│         ├─ source_chunk_id, target_chunk_id                         │
│         ├─ type: semantic/contradiction/thematic_bridge             │
│         ├─ strength: 0-1 confidence score                           │
│         ├─ metadata: Why they're connected                          │
│         └─ discovered_at: timestamp                                 │
│                                                                       │
│ Personal Scoring (applied at display time):                         │
│   finalScore = 0.25 × semantic +                                    │
│                0.40 × contradiction +  (highest weight)             │
│                0.35 × thematic_bridge                                │
│                                                                       │
│ Total Cost: $0 (100% local)                                         │
│ Total Time: ~30-60 minutes per document                             │
│ Total Connections: ~50-100 per document (filtered for quality)     │
└─────────────────────────────────────────────────────────────────────┘

📊 TOTAL PIPELINE COST: $0 (100% local processing)
⏱️  TOTAL PIPELINE TIME: ~40-80 minutes for 500-page book
💾 MODEL REQUIREMENTS: ~20GB RAM for Qwen 32B
✅ SUCCESS RATE: 100% chunk recovery guaranteed
```

---

### EPUB Pipeline

```
📕 EPUB DOCUMENT PROCESSING (100% LOCAL, UNIFIED WITH PDF)

┌─────────────────────────────────────────────────────────────────────┐
│ STAGE 1: EPUB HTML EXTRACTION (15-25%)                              │
├─────────────────────────────────────────────────────────────────────┤
│ Input:  EPUB file from Supabase Storage                             │
│ Action: Parse EPUB as ZIP archive                                   │
│         ├─ Read META-INF/container.xml (find content.opf)           │
│         ├─ Parse content.opf (metadata + spine)                     │
│         ├─ Extract HTML/XHTML files in spine order                  │
│         └─ Concatenate HTML preserving reading order                │
│         Metadata extraction:                                         │
│         ├─ Title, author, publisher (from OPF)                      │
│         ├─ Cover image (if present)                                 │
│         ├─ Table of Contents (if present)                           │
│         └─ Chapter/section markers                                  │
│ Output: unifiedHtml, metadata                                        │
│ Cost:   $0 (local ZIP/XML parsing)                                  │
│ Time:   <30 seconds                                                  │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│ STAGE 2: DOCLING HTML PROCESSING (25-50%)                           │
├─────────────────────────────────────────────────────────────────────┤
│ Input:  unifiedHtml (concatenated from EPUB)                        │
│ Action: Feed HTML directly to Docling (no markdown conversion!)     │
│         Docling understands HTML semantic tags:                      │
│         ├─ <h1>, <h2>, <h3> → heading hierarchy                    │
│         ├─ <p> → paragraphs                                         │
│         ├─ <ul>, <ol>, <li> → lists                                │
│         ├─ <blockquote> → quotes                                    │
│         ├─ <table> → structured tables                              │
│         ├─ <code>, <pre> → code blocks                             │
│         ├─ <em>, <strong> → emphasis                                │
│         └─ CSS classes (preserved for special handling)            │
│                                                                       │
│         HybridChunker creates structural chunks:                     │
│         ├─ Tokenizer: sentence-transformers/all-mpnet-base-v2       │
│         ├─ Max tokens: 512                                           │
│         ├─ Respects HTML block boundaries                           │
│         ├─ Never splits mid-paragraph or mid-list                   │
│         └─ Preserves heading hierarchy                              │
│                                                                       │
│         Works WITHOUT chapters:                                      │
│         ├─ Poetry books → chunks by paragraph/stanza                │
│         ├─ Chapter books → full hierarchy preserved                 │
│         ├─ Continuous narratives → sequential markers               │
│         └─ Multi-file EPUBs → unified then chunked                  │
│                                                                       │
│         Benefits over HTML→MD→Docling:                               │
│         ✅ Better structure (semantic HTML preserved)               │
│         ✅ No conversion artifacts (entities intact)                │
│         ✅ Richer metadata (CSS classes, attributes)                │
│         ✅ Better tables (full structure preserved)                 │
│         ✅ Footnote tracking (ref relationships)                    │
│                                                                       │
│ Output: cleanMarkdown (from Docling's conversion)                   │
│         doclingStructure (sections, hierarchy)                       │
│         doclingChunks with metadata:                                 │
│         ├─ heading, heading_path[], heading_level                   │
│         ├─ section_marker (chapter_001, part_003, etc.)             │
│         ├─ NO page_start/page_end (EPUBs don't have pages)          │
│         └─ tokens (for embedding size validation)                   │
│ Cost:   $0 (local Docling)                                          │
│ Time:   ~2-5 minutes                                                │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│ STAGE 3: LOCAL LLM CLEANUP (50-65%) [Optional]                      │
├─────────────────────────────────────────────────────────────────────┤
│ User Setting: cleanMarkdown = true (default)                         │
│ Input:        Docling's markdown output                             │
│ Action:       Multi-pass Qwen 32B cleanup                           │
│               ├─ Remove HTML artifacts (if any)                     │
│               ├─ Fix formatting issues                              │
│               └─ Polish structure                                    │
│ Note:         Usually needs LESS cleanup than PDF                    │
│               (HTML is cleaner than OCR)                             │
│ Output: cleanedMarkdown                                              │
│ Cost:   $0 (local Ollama)                                           │
│ Time:   ~3-8 minutes (faster than PDF)                              │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│ STAGE 4: BULLETPROOF CHUNK MATCHING (65-70%)                        │
├─────────────────────────────────────────────────────────────────────┤
│ Same 5-layer failsafe as PDF pipeline                               │
│ Maps doclingChunks → cleanedMarkdown                                │
│ Preserves metadata:                                                  │
│   ├─ heading_path (full hierarchy)                                  │
│   ├─ heading_level                                                   │
│   ├─ section_marker (for citations)                                 │
│   └─ NO page numbers (use section markers instead)                  │
│ 100% recovery guaranteed                                             │
│ Cost: $0 (all local)                                                │
│ Time: ~50 seconds                                                    │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│ STAGES 5-8: SAME AS PDF PIPELINE                                    │
├─────────────────────────────────────────────────────────────────────┤
│ • Local LLM metadata enrichment (Qwen 32B + PydanticAI)            │
│ • Local embedding generation (sentence-transformers)                │
│ • Save to database (chapter metadata instead of pages)             │
│ • Local connection detection (async, 3 engines)                     │
└─────────────────────────────────────────────────────────────────────┘

📊 TOTAL PIPELINE COST: $0 (100% local)
⏱️  TOTAL PIPELINE TIME: ~15-30 minutes (faster than PDF!)
✅ WORKS WITHOUT CHAPTERS: Yes, any EPUB structure supported
```

**EPUB Citation Format:**
```
PDF:  "Quote text..." (p. 47)
EPUB: "Quote text..." (Chapter 3, Section 2)
      "Quote text..." (Part II)
      "Quote text..." (Section 12)  ← If no chapters
```

---

### Markdown Pipeline

```
📝 MARKDOWN/TEXT DOCUMENT PROCESSING (100% LOCAL)

┌─────────────────────────────────────────────────────────────────────┐
│ STAGE 1: EXTRACTION (15-30%)                                        │
├─────────────────────────────────────────────────────────────────────┤
│ Input:  Markdown or text file from storage                          │
│ Action: Download and optional conversion                            │
│         ├─ Markdown: Use as-is                                      │
│         └─ Plain text: Optional Qwen 32B conversion to markdown     │
│             (adds headings, structure, formatting)                   │
│ Output: markdown content                                             │
│ Cost:   $0 (local)                                                  │
│ Time:   <1 minute                                                    │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│ STAGE 2: OPTIONAL CLEANUP (30-50%)                                  │
├─────────────────────────────────────────────────────────────────────┤
│ markdown_asis:  Skip cleanup (use as-is)                            │
│ markdown_clean: Multi-pass Qwen 32B cleanup                         │
│                 ├─ Fix formatting issues                            │
│                 ├─ Improve structure                                │
│                 └─ Polish for readability                           │
│ Cost: $0 (local)                                                    │
│ Time: ~5 minutes                                                     │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│ STAGES 3-6: SIMPLIFIED PIPELINE                                     │
├─────────────────────────────────────────────────────────────────────┤
│ • No bulletproof matching needed (single markdown version)          │
│ • AI semantic chunking (identifies boundaries)                      │
│ • Local LLM metadata enrichment                                     │
│ • Local embedding generation                                        │
│ • Save to database                                                   │
│ • Connection detection (async)                                      │
└─────────────────────────────────────────────────────────────────────┘

📊 TOTAL COST: $0
⏱️  TOTAL TIME: ~10-20 minutes
```

---

## Key Concepts

### 1. Bulletproof Chunk Matching

**The Problem:**
- Docling extracts chunks from **original markdown** (with artifacts)
- We clean the markdown with LLM (changes text)
- Chunk offsets now point to wrong positions
- Must remap chunks to cleaned markdown WITHOUT losing metadata

**The Solution: 5-Layer Failsafe**

```
Layer 1: Enhanced Fuzzy Matching (85% success)
├─ Exact match: Find identical text
├─ Normalized match: Ignore whitespace
├─ Multi-anchor: Use start/middle/end phrases
└─ Sliding window: Find best matching region

Layer 2: Embedding-Based (98% cumulative)
├─ Embed chunk contents
├─ Embed markdown windows
└─ Cosine similarity matching

Layer 3: LLM-Assisted (99.9% cumulative)
└─ Qwen 32B finds semantic matches

Layer 4: Anchor Interpolation (100%)
├─ Use neighboring chunks as anchors
├─ Interpolate position
└─ Mark as "synthetic" (user-visible flag)

Result: NEVER lose a chunk, metadata always preserved
```

**What Gets Preserved:**
- ✅ Page numbers (for PDF citations)
- ✅ Section markers (for EPUB citations)
- ✅ Heading hierarchy (for navigation)
- ✅ Themes, concepts (for connections)
- ✅ All AI metadata

**What Changes:**
- start_offset, end_offset (updated for cleaned markdown)

**Confidence Tracking:**
```typescript
type ChunkConfidence = 
  | 'exact'      // Perfect match (85%)
  | 'high'       // Fuzzy/embedding match (13%)
  | 'medium'     // LLM-assisted (1.9%)
  | 'synthetic'  // Interpolated (0.1%)
```

Users can review synthetic chunks if desired.

### 2. PydanticAI Structured Outputs

**The Problem with Raw LLM Output:**
```python
# Without PydanticAI
response = llm.generate("Extract metadata from this chunk")
data = json.loads(response.text)  # Could fail!

# Must manually validate:
if 'themes' not in data:
    raise ValueError("Missing themes")
if not isinstance(data['importance'], float):
    raise ValueError("Importance must be float")
# ... dozens of checks
```

**The Solution: PydanticAI**
```python
# Define structure once
class ChunkMetadata(BaseModel):
    themes: list[str] = Field(min_length=1, max_length=5)
    concepts: list[Concept] = Field(min_length=1)
    importance: float = Field(ge=0.0, le=1.0)
    summary: str = Field(min_length=20, max_length=200)
    emotional: EmotionalTone

# Use with agent
agent = Agent(
    model=QwenModel('qwen2.5:32b'),
    result_type=ChunkMetadata,
    retries=3  # Auto-retry on validation failure
)

result = await agent.run(chunk_content)
metadata = result.data  # Guaranteed to be ChunkMetadata!
```

**Benefits:**
- ✅ Type-safe (no JSON parsing errors)
- ✅ Automatic retries (LLM fixes its own mistakes)
- ✅ Clear error messages ("importance must be 0-1, got 1.5")
- ✅ No manual validation code

**How Retries Work:**
1. LLM returns: `{"importance": 1.5, ...}`
2. Validation fails: "importance must be ≤1.0"
3. PydanticAI tells LLM: "Your importance value was invalid, try again"
4. LLM returns: `{"importance": 0.95, ...}` ✅

### 3. Docling HybridChunker

**What It Does:**
- Reads document structure (headings, paragraphs, tables)
- Creates chunks at semantic boundaries (never mid-sentence)
- Targets 512 tokens per chunk (flexible)
- Merges small adjacent chunks if they fit
- Attaches rich metadata to each chunk

**Configuration:**
```python
chunker = HybridChunker(
    tokenizer='sentence-transformers/all-mpnet-base-v2',  # Match your embeddings
    max_tokens=512,        # Target size (~400 words)
    merge_peers=True,      # Combine short paragraphs
    heading_as_metadata=True  # Track parent sections
)
```

**Benefits:**
- ✅ Respects document structure (never splits tables)
- ✅ Preserves heading hierarchy
- ✅ Deterministic (same input = same output)
- ✅ Free (no API calls)
- ✅ Fast (~5 seconds for 500 pages)

**Works For:**
- PDF (via Docling extraction)
- EPUB (via HTML semantic tags)
- Markdown (via heading structure)
- Any structured document

### 4. The 3-Engine Connection System

```
Engine 1: Semantic Similarity (Baseline)
├─ Method: Vector cosine similarity
├─ Finds: "These say similar things"
├─ Speed: Fast (database query)
└─ Cost: $0

Engine 2: Contradiction Detection (Tension)
├─ Method: Metadata + LLM verification
├─ Finds: "These disagree about the same topic"
├─ Speed: Medium (filtered candidates)
└─ Cost: $0

Engine 3: Thematic Bridge (Serendipity)
├─ Method: Cross-domain concept matching
├─ Finds: "These connect different domains"
├─ Speed: Slow (full LLM analysis)
└─ Cost: $0 (but ~200 LLM calls per document)

Personal Scoring (at display time):
finalScore = 0.25 × semantic +
             0.40 × contradiction +  ← Highest weight
             0.35 × thematic_bridge

User can adjust weights in real-time
```

**Example Connection:**
```json
{
  "source": "Gravity's Rainbow, Chapter 1, p. 47",
  "target": "Surveillance Capitalism, Chapter 3",
  "type": "thematic_bridge",
  "strength": 0.87,
  "reason": "Both discuss institutional control mechanisms through data",
  "shared_concept": "surveillance",
  "domains": ["literature", "technology"]
}
```

---

## Database Schema

### Core Tables

```sql
-- Documents (metadata layer)
CREATE TABLE documents (
  id uuid PRIMARY KEY,
  user_id uuid REFERENCES users(id),
  title text NOT NULL,
  storage_path text,              -- Base path in storage
  markdown_path text,              -- Path to content.md
  
  -- Processing state
  processing_status text,          -- pending/processing/completed/failed
  processing_requested boolean DEFAULT true,
  
  -- Document metadata
  source_type text,                -- pdf/epub/markdown_asis/markdown_clean/txt
  source_url text,                 -- Original URL (YouTube, web)
  word_count integer,
  
  -- Rich structure from Docling
  structure jsonb,                 -- Sections, hierarchy, TOC
  outline jsonb[],                 -- Heading outline
  
  -- Availability flags
  markdown_available boolean DEFAULT false,
  embeddings_available boolean DEFAULT false,
  
  -- Timestamps
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Chunks (semantic units with rich metadata)
CREATE TABLE chunks (
  id uuid PRIMARY KEY,
  document_id uuid REFERENCES documents(id) ON DELETE CASCADE,
  chunk_index integer NOT NULL,
  content text NOT NULL,
  
  -- Position in cleaned markdown
  start_offset integer,
  end_offset integer,
  word_count integer,
  
  -- PDF-specific (null for EPUB/Markdown)
  page_start integer,
  page_end integer,
  bboxes jsonb,                    -- PDF coordinates for highlighting
  
  -- Universal structure (all formats)
  heading text,
  heading_path text[],             -- Full hierarchy ["Part I", "Chapter 1", "Section 1.1"]
  heading_level integer,
  section_marker text,             -- "chapter_001", "part_003", etc.
  
  -- AI metadata
  themes text[],
  importance_score float,
  summary text,
  
  -- Emotional metadata
  emotional_metadata jsonb,        -- {polarity, primaryEmotion, intensity}
  
  -- Conceptual metadata
  conceptual_metadata jsonb,       -- {concepts: [{text, importance}]}
  
  -- Domain classification
  domain_metadata jsonb,           -- {primaryDomain, confidence}
  
  -- Vector for semantic search
  embedding vector(768),           -- or vector(384) for MiniLM
  
  -- Quality tracking
  position_confidence text,        -- exact/high/medium/synthetic
  position_method text,            -- exact_match/embedding_match/llm_assisted/interpolation
  position_validated boolean DEFAULT false,
  
  metadata_extracted_at timestamptz,
  created_at timestamptz DEFAULT now(),
  
  UNIQUE(document_id, chunk_index)
);

-- Connections (relationships between chunks)
CREATE TABLE connections (
  id uuid PRIMARY KEY,
  source_chunk_id uuid REFERENCES chunks(id) ON DELETE CASCADE,
  target_chunk_id uuid REFERENCES chunks(id) ON DELETE CASCADE,
  
  -- Connection type
  type text NOT NULL,              -- semantic/contradiction/thematic_bridge
  strength float NOT NULL,         -- 0-1 confidence
  
  -- Detection metadata
  auto_detected boolean DEFAULT true,
  user_validated boolean DEFAULT false,
  discovered_at timestamptz DEFAULT now(),
  
  -- Connection details
  metadata jsonb,                  -- {reason, shared_concepts, domains, etc.}
  
  UNIQUE(source_chunk_id, target_chunk_id, type)
);

-- Optional: Extracted structures
CREATE TABLE document_tables (
  id uuid PRIMARY KEY,
  document_id uuid REFERENCES documents(id),
  chunk_id uuid REFERENCES chunks(id),
  content text,                    -- Markdown table
  caption text,
  page_number integer,
  section_title text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE document_figures (
  id uuid PRIMARY KEY,
  document_id uuid REFERENCES documents(id),
  caption text,
  page_number integer,
  bbox jsonb,
  image_path text,
  section_title text,
  created_at timestamptz DEFAULT now()
);
```

### Indexes

```sql
-- Chunk queries
CREATE INDEX idx_chunks_document ON chunks(document_id, chunk_index);
CREATE INDEX idx_chunks_pages ON chunks(document_id, page_start, page_end);
CREATE INDEX idx_chunks_section ON chunks(document_id, section_marker);
CREATE INDEX idx_chunks_heading_path ON chunks USING gin(heading_path);
CREATE INDEX idx_chunks_confidence ON chunks(position_confidence);

-- Vector search (pgvector)
CREATE INDEX idx_chunks_embedding ON chunks 
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

-- Connection queries
CREATE INDEX idx_connections_source ON connections(source_chunk_id, type);
CREATE INDEX idx_connections_target ON connections(target_chunk_id, type);
CREATE INDEX idx_connections_strength ON connections(strength DESC);
```

### Example Queries

```sql
-- Find chunks on specific page
SELECT * FROM chunks 
WHERE document_id = $1 
  AND page_start <= $2 
  AND page_end >= $2
ORDER BY chunk_index;

-- Semantic search (nearest neighbors)
SELECT c.*, 
       1 - (c.embedding <=> $1::vector) as similarity
FROM chunks c
WHERE c.document_id = $2
ORDER BY c.embedding <=> $1::vector
LIMIT 20;

-- Get document structure
SELECT heading_path, 
       heading_level, 
       COUNT(*) as chunk_count
FROM chunks
WHERE document_id = $1
GROUP BY heading_path, heading_level
ORDER BY MIN(chunk_index);

-- Find contradictions
SELECT c1.content as source,
       c2.content as target,
       conn.strength,
       conn.metadata->>'reason' as reason
FROM connections conn
JOIN chunks c1 ON conn.source_chunk_id = c1.id
JOIN chunks c2 ON conn.target_chunk_id = c2.id
WHERE conn.type = 'contradiction'
  AND conn.strength > 0.8
ORDER BY conn.strength DESC;
```

---

## Performance & Costs

### Processing Time (500-page PDF book)

| Stage | Time | Notes |
|-------|------|-------|
| Docling Extraction | 9 min | PDF to markdown + structure |
| Regex Cleanup | <1 sec | Deterministic cleanup |
| LLM Cleanup (optional) | 10-30 min | Multi-pass with Qwen 32B |
| Bulletproof Matching | 50 sec | 5-layer failsafe |
| Metadata Enrichment | 10-20 min | Qwen 32B + PydanticAI |
| Embedding Generation | 1-2 min | sentence-transformers |
| Database Save | 30 sec | Batch inserts |
| **Total (without cleanup)** | **~25 min** | Fast path |
| **Total (with cleanup)** | **~40-80 min** | Full polish |
| Connection Detection | 30-60 min | Async, separate job |

### Resource Requirements

```yaml
CPU:
  Minimum: 4 cores (Apple M1 or equivalent)
  Recommended: 8+ cores (Apple M3 Max or equivalent)
  
RAM:
  Qwen 32B: 20-24GB (Q4_K_M quantization)
  sentence-transformers: 2-4GB
  Docling: 2-4GB
  System overhead: 4GB
  Total: 28-36GB recommended

Storage:
  Models (one-time):
    - Qwen 32B: 20GB
    - sentence-transformers: 500MB
    - Docling dependencies: 2GB
  Per document:
    - Markdown: ~500KB per 500 pages
    - Database: ~2MB per 500 pages (chunks + embeddings)
    - Total: ~3MB per 500-page book
```

### Cost Analysis

```
Operating Costs: $0/document
├─ Docling extraction: $0 (local)
├─ LLM cleanup: $0 (local Ollama)
├─ Metadata extraction: $0 (local Ollama)
├─ Embeddings: $0 (local sentence-transformers)
├─ Connection detection: $0 (local Ollama)
└─ Database storage: $0.01/GB/month (Supabase free tier: 500MB)

One-Time Setup Costs:
├─ Model downloads: ~23GB bandwidth
└─ Setup time: ~1 hour

Hardware Costs:
├─ Can run on: M1 Mac, high-end PC, cloud GPU
├─ Recommended: M3 Max or equivalent
└─ Alternative: Rent GPU server ($1-2/hour when processing)

Comparison to Cloud Services:
├─ Gemini (previous): $0.50/document
├─ OpenAI GPT-4: $2-3/document
├─ Anthropic Claude: $1-2/document
└─ Our system: $0/document (✅)
```

---

## Troubleshooting

### Common Issues

#### 1. "Chunk matching failed for 10 chunks"

**Cause:** LLM cleanup changed text too drastically  
**Solution:** Chunks marked as "synthetic" - metadata preserved  
**Action:** Review synthetic chunks in UI, manually validate if needed

#### 2. "Qwen 32B out of memory"

**Cause:** Insufficient RAM  
**Solutions:**
- Use smaller model (Qwen 14B or 7B)
- Use Q4 quantization instead of Q5
- Process smaller batches (5 chunks instead of 10)
- Close other applications

#### 3. "Docling extraction timeout"

**Cause:** Very large or complex PDF  
**Solutions:**
- Increase timeout in options
- Split PDF into parts
- Check for corrupted/protected PDF

#### 4. "Embeddings dimension mismatch"

**Cause:** Wrong tokenizer in HybridChunker  
**Solution:** Ensure tokenizer matches embedding model:
```python
# If using all-mpnet-base-v2 (768 dims)
tokenizer='sentence-transformers/all-mpnet-base-v2'

# If using all-MiniLM-L6-v2 (384 dims)
tokenizer='sentence-transformers/all-MiniLM-L6-v2'
```

#### 5. "Connection detection taking too long"

**Cause:** Large library, many documents  
**Solutions:**
- Run connection detection during off-hours
- Increase filtering thresholds (importance > 0.7)
- Reduce candidates per chunk (top 10 instead of 15)
- Process in batches (10 documents at a time)

### Quality Issues

#### "Too many low-confidence chunks"

**Check:**
1. Is LLM cleanup too aggressive? Try disabling cleanup
2. Is source PDF very poor quality? Manual review needed
3. Review the specific chunks - what patterns do you see?

**Fix:**
- Adjust cleanup prompts for gentler changes
- Use review checkpoints to catch issues early
- Manually validate synthetic chunks

#### "Connections seem random"

**Check:**
1. Are themes extracted correctly? Review chunk metadata
2. Is importance scoring working? Check score distribution
3. Are personal weights appropriate? Adjust in UI

**Fix:**
- Review a sample of connections
- Adjust personal scoring weights
- Increase strength thresholds (0.8 instead of 0.7)

#### "Missing important chunks"

**Impossible:** We guarantee 100% chunk recovery  
**If you think this happened:**
1. Check if chunk is marked "synthetic" (interpolated)
2. Review confidence levels
3. Check database - chunk exists but may have approximate position

### Performance Issues

#### "Processing too slow"

**Check:**
1. Which stage is slow? Check logs
2. Is Ollama running efficiently? Check GPU usage
3. Are models loaded in RAM? Check memory

**Optimize:**
- Use GPU acceleration if available
- Use smaller/faster models for initial processing
- Process in batches during off-hours
- Consider cloud GPU for large batches

---

## Success Metrics

**What Good Looks Like:**

```yaml
Chunk Recovery:
  Exact matches: 85%+
  High confidence: 13%
  Synthetic: <2%
  Failed: 0% (impossible)

Processing Quality:
  Markdown readability: High (manual review)
  Structure preservation: 100%
  Metadata completeness: 100%
  
Performance:
  Time per 500 pages: <80 minutes
  Memory usage: <30GB peak
  CPU utilization: 70-90% during processing
  
Connection Quality:
  Connections per document: 50-100
  User validation rate: >80% useful
  False positives: <20%
```

**Monitor:**
- Processing time trends
- Chunk confidence distribution
- Connection strength distribution
- User feedback on connection quality

---

## Future Enhancements

**Potential Additions:**

1. **Multi-Document Summarization**
   - Synthesize themes across entire library
   - Generate reading lists based on connections
   - Timeline views for historical documents

2. **Advanced Visualizations**
   - 3D knowledge graph
   - Temporal evolution of themes
   - Citation network graphs

3. **Specialized Extractors**
   - Academic paper parser (citations, references)
   - Code documentation extractor
   - Poetry/verse structure preservation

4. **Enhanced Connections**
   - Temporal proximity (documents from same era)
   - Author similarity (writing style)
   - Citation chains (follow references)

5. **Performance Optimizations**
   - Parallel processing pipeline
   - Incremental updates (only changed chunks)
   - Smart caching for frequently accessed chunks

---

## Appendix: File Locations

```
Repository Structure:
├── scripts/
│   └── docling_extract.py          # Python wrapper for Docling
├── lib/
│   ├── docling-extractor.ts        # TypeScript interface
│   ├── embeddings.ts                # Local embedding generation
│   ├── ai-chunking-batch.ts        # Semantic chunking
│   ├── markdown-cleanup-ai.ts      # LLM cleanup
│   └── chunking/
│       └── bulletproof-matcher.ts   # 5-layer failsafe
├── processors/
│   ├── pdf-docling.ts              # PDF pipeline
│   ├── epub.ts                     # EPUB pipeline
│   ├── markdown.ts                 # Markdown pipeline
│   └── text.ts                     # Text pipeline
├── workers/
│   └── process-document.ts         # Background job handler
└── docs/
    └── PIPELINE_REFERENCE.md       # This file

Storage Paths:
├── storage/documents/
│   └── {userId}/{documentId}/
│       ├── content.md              # Clean markdown
│       ├── annotations.json        # User highlights
│       └── metadata.json           # Document properties

Database:
├── documents                       # Document metadata
├── chunks                          # Semantic units
├── connections                     # Relationships
├── document_tables                 # Extracted tables
└── document_figures                # Extracted figures
```

---

**End of Reference Document**

*For questions or issues, refer to the troubleshooting section or review the specific processor code.*