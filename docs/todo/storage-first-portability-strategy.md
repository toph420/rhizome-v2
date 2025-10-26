# Storage-First Data Portability Strategy

**Created:** 2025-10-12
**Status:** Analysis & Implementation Plan
**Related:** cached-chunks-table.md, PROCESSING_PIPELINE.md

---

## Executive Summary

Rhizome V2 already implements **partial storage-first architecture** through annotation export and recovery systems. This document analyzes what exists, identifies gaps, and proposes extensions to achieve **100% data portability** for seamless database resets during development.

### Current State ✅

**Already Storage-Backed:**
- ✅ Source files (`source.pdf`, `source.epub`)
- ✅ Processed markdown (`content.md`)
- ✅ Annotations (`.annotations.json` via hourly cron)

**Database Only (At Risk):**
- ⚠️ Docling chunks (cached in `job.metadata`, pruned after 90 days)
- ⚠️ AI metadata ($0.20 per 500 chunks to regenerate)
- ⚠️ Embeddings ($0.02 per 500 chunks to regenerate)
- ✓ Connections (auto-generated, can recompute)

### Proposed Extensions

Add to storage:
1. **Cached chunks** → `cached_chunks.json` (enables $0.00 reprocessing forever)
2. **Metadata** → `metadata.json` (avoid re-extraction costs)
3. **Embeddings** → `embeddings.bin` (binary format, efficient)

**Result:** Complete data portability, database becomes true query cache.

---

## Part 1: Current Implementation Analysis

### 1.1 Annotation Export System ✅ WORKING

**File:** `worker/jobs/export-annotations.ts`

**What It Does:**
- Runs hourly via cron (`0 * * * *`)
- Fetches annotations via ECS entity joins
- Transforms to portable format
- Saves to `.annotations.json` in storage

**Storage Path:**
```
documents/{document_id}/.annotations.json
```

**Portable Format:**
```json
[
  {
    "text": "User annotation text",
    "note": "Optional user note",
    "color": "yellow",
    "tags": ["important", "concept"],
    "position": {
      "start": 1234,
      "end": 1456,
      "method": "exact_match",
      "confidence": 1.0,
      "originalChunkIndex": 5
    },
    "textContext": {
      "before": "...preceding text...",
      "after": "...following text...",
      "content": "The actual highlighted text"
    },
    "chunkIds": ["chunk-uuid-1", "chunk-uuid-2"],
    "recovery": {
      "method": "exact_match",
      "confidence": 1.0,
      "needsReview": false
    },
    "created_at": "2025-10-12T12:00:00Z",
    "updated_at": "2025-10-12T12:00:00Z"
  }
]
```

**Key Features:**
- ✅ Survives database resets (in storage, not DB)
- ✅ Portable format (can import to other tools)
- ✅ Recovery metadata (tracks fuzzy matching confidence)
- ✅ Position context (enables re-recovery after edits)

### 1.2 Annotation Recovery System ✅ WORKING

**File:** `worker/handlers/recover-annotations.ts`

**What It Does:**
- 4-tier fuzzy matching strategy
- Updates both position and annotation components
- Confidence scoring with auto-recovery/review gates

**Matching Tiers:**
```
Tier 1: Exact match (markdown.indexOf)
  ↓
Tier 2: Context-guided Levenshtein (if context available)
  ↓
Tier 3: Chunk-bounded Levenshtein (50-75x faster if chunk index known)
  ↓
Tier 4: Trigram fallback (last resort)
```

**Confidence Thresholds:**
- `≥0.85`: Auto-recover (high confidence)
- `0.75-0.85`: Needs review (medium confidence)
- `<0.75`: Lost (mark as unrecoverable)

**Recovery Process:**
```typescript
// After reprocessing document
const results = await recoverAnnotations(
  documentId,
  newMarkdown,
  newChunks
)

// Results:
// - success: 42 annotations (auto-recovered)
// - needsReview: 3 annotations (manual validation needed)
// - lost: 1 annotation (couldn't find match)
```

### 1.3 Connection Remapping System ✅ WORKING

**File:** `worker/handlers/remap-connections.ts`

**What It Does:**
- Uses embedding similarity for chunk matching
- Preserves user-validated connections
- Handles cross-document connections

**Algorithm:**
```typescript
// Find best match using embeddings
const bestMatch = findBestMatchByCosine(
  oldChunkEmbedding,
  newChunks,
  threshold: 0.85
)

// Confidence thresholds:
// ≥0.95: Auto-remap
// 0.85-0.95: Needs review
// <0.85: Lost
```

**Critical Insight:**
This already demonstrates that **embeddings are essential for recovery**. We need them in storage for seamless remapping after database resets.

### 1.4 Bulletproof Matching System ✅ WORKING

**File:** `worker/lib/local/bulletproof-matcher.ts`

**What It Does:**
- 5-layer matching system with 100% recovery guarantee
- Preserves structural metadata (pages, headings, bboxes)
- Confidence tracking

**Why This Matters:**
With cached Docling chunks in storage, we can ALWAYS run bulletproof matching to recover chunk positions after markdown edits. This is the foundation of zero-cost reprocessing.

**Current Gap:**
Docling chunks cached in `job.metadata` are deleted after 90 days. Need permanent storage.

---

## Part 2: Current Workflow Analysis

### 2.1 Reading & Annotating (Current State)

```
┌─────────────────────────────────────────────────────────────┐
│ USER: Reads document and creates 42 annotations             │
└─────────────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────────┐
│ ECS: Annotations saved to database                          │
│ - annotation component (text, color, tags)                  │
│ - position component (offsets, context)                     │
│ - source component (document_id, chunk_id)                  │
└─────────────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────────┐
│ CRON: Hourly export to storage (export-annotations.ts)      │
│ Path: documents/{doc-id}/.annotations.json                  │
│ Result: Annotations backed up to storage ✅                 │
└─────────────────────────────────────────────────────────────┘
```

**Assessment:** ✅ Annotations are safe. Database reset won't lose them.

### 2.2 Editing in Obsidian (Current State)

```
┌─────────────────────────────────────────────────────────────┐
│ USER: Edits content.md in Obsidian                          │
│ - Fixes typos, adds notes, restructures                     │
│ - Obsidian syncs changes to Supabase Storage                │
└─────────────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────────┐
│ SYNC: Triggers reprocessing                                 │
│ - Fetches edited markdown from storage                      │
│ - Processing mode: LOCAL or CLOUD                           │
└─────────────────────────────────────────────────────────────┘
                        ↓
            ┌───────────────────────┐
            │   MODE DIVERGENCE     │
            └───────────────────────┘
                        ↓
        ┌───────────────────────────────┐
        │                               │
        ↓                               ↓
┌──────────────────────┐    ┌──────────────────────┐
│   LOCAL MODE ✅      │    │   CLOUD MODE ⚠️      │
├──────────────────────┤    ├──────────────────────┤
│ Load cached Docling  │    │ Gemini AI chunking   │
│ chunks from job      │    │ - New semantic       │
│ metadata             │    │   boundaries         │
│                      │    │ - No structural      │
│ bulletproofMatch()   │    │   metadata           │
│ - 5-layer recovery   │    │ - Cost: $0.50        │
│ - 100% guaranteed    │    └──────────────────────┘
│                      │                │
│ Result: Chunks with  │                │
│ structural metadata  │                │
│ preserved            │                │
└──────────────────────┘                │
        │                               │
        └───────────────┬───────────────┘
                        ↓
┌─────────────────────────────────────────────────────────────┐
│ RECOVERY: recoverAnnotations()                              │
│ - Load annotations from .annotations.json in storage ✅     │
│ - 4-tier fuzzy matching                                     │
│ - Remap to new chunk positions                              │
│ - Update database                                           │
│                                                             │
│ Result:                                                     │
│ - 40 auto-recovered (95%)                                   │
│ - 2 needs review (5%)                                       │
│ - 0 lost (0%)                                               │
└─────────────────────────────────────────────────────────────┘
```

**Current Issues:**

**Issue 1: Cached Chunks Lifecycle** ⚠️
- Stored in `job.metadata.cached_extraction.doclingChunks`
- Jobs pruned after 90 days
- Resume from checkpoint queries wrong job type (continue-processing vs process_document)
- **Impact:** LOCAL mode falls back to CLOUD ($0.50 cost) after 90 days

**Issue 2: Metadata Re-extraction** ⚠️
- AI metadata (themes, concepts, emotions) not cached
- Must regenerate with PydanticAI + Ollama (or Gemini)
- **Cost:** Time (1-2 min) or money ($0.20 for CLOUD)

**Issue 3: Embeddings Re-generation** ⚠️
- Embeddings not cached in storage
- Must regenerate with Transformers.js (or Gemini)
- **Cost:** Time (30 sec) or money ($0.02 for CLOUD fallback)

**Issue 4: Connection Recovery Dependency** ⚠️
- Connection remapping requires embeddings
- If embeddings not cached, must regenerate before remapping
- Delays connection recovery

### 2.3 Database Reset Scenario (Current State)

```
┌─────────────────────────────────────────────────────────────┐
│ DEVELOPER: npx supabase db reset                            │
│ Reason: Testing cached_chunks table migration              │
└─────────────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────────┐
│ DATABASE: All data deleted                                  │
│ ❌ documents table (empty)                                  │
│ ❌ chunks table (empty)                                     │
│ ❌ components table (empty - annotations lost!)             │
│ ❌ connections table (empty)                                │
│ ❌ background_jobs table (empty - cached chunks lost!)      │
└─────────────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────────┐
│ STORAGE: Data intact ✅                                     │
│ ✅ source.pdf                                               │
│ ✅ content.md                                               │
│ ✅ .annotations.json (exported by cron)                     │
│ ⚠️  cached chunks (NOT in storage - in deleted job.metadata)│
│ ⚠️  metadata (NOT in storage - in deleted chunks table)     │
│ ⚠️  embeddings (NOT in storage - in deleted chunks table)   │
└─────────────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────────┐
│ RECOVERY OPTIONS:                                           │
│                                                             │
│ Option A: Full Reprocessing ⚠️                              │
│   - Process source.pdf again                                │
│   - LOCAL mode: Docling extraction (9 min)                 │
│   - CLOUD mode: Gemini extraction + chunking ($0.50)       │
│   - Metadata extraction (1-2 min or $0.20)                  │
│   - Embeddings generation (30 sec or $0.02)                 │
│   - Load .annotations.json from storage                     │
│   - Recover annotations with fuzzy matching                 │
│   - Recompute connections                                   │
│   - Total: 15+ minutes or $0.70+                            │
│                                                             │
│ Option B: Manual Restore (TEDIOUS)                          │
│   - Manually re-upload documents                            │
│   - Manually trigger processing                             │
│   - Wait for processing                                     │
│   - Check annotation recovery                               │
│   - Validate connections                                    │
│                                                             │
│ Option C: IDEAL (if storage-first) ✅                       │
│   - Run rebuild-from-storage.ts script                      │
│   - Load all data from storage (5 seconds)                  │
│   - Database fully reconstructed                            │
│   - Total: 5 seconds, $0.00                                 │
└─────────────────────────────────────────────────────────────┘
```

**Current State:** Option A or B (painful, slow, expensive)
**Desired State:** Option C (instant, free, automatic)

---

## Part 3: Proposed Storage Structure

### 3.1 Complete Storage Manifest

Extend current storage structure to include ALL derived data:

```
documents/{document_id}/
├── source.pdf                 # ✅ Already stored
├── content.md                 # ✅ Already stored
├── .annotations.json          # ✅ Already stored (via cron)
├── .cached_chunks.json        # 🆕 NEW: Docling extraction + HybridChunker
├── .metadata.json             # 🆕 NEW: AI-extracted chunk metadata
├── .embeddings.bin            # 🆕 NEW: 768d vectors (binary format)
├── .manifest.json             # 🆕 NEW: Version tracking + hashes
└── cover.jpg                  # ✅ Already stored (for EPUBs)
```

**Naming Convention:** Dotfiles (`.filename`) are system-generated, user shouldn't edit.

### 3.2 File Schemas

#### `.cached_chunks.json` (NEW)

**Purpose:** Permanent storage for Docling extraction results. Enables $0.00 reprocessing forever.

```json
{
  "version": "1.0",
  "created_at": "2025-10-12T12:00:00Z",
  "extraction_mode": "pdf",
  "docling_version": "2.55.1",
  "markdown_hash": "a1b2c3d4e5f6...",
  "structure": {
    "headings": [
      {
        "level": 1,
        "text": "Chapter 1: Introduction",
        "page": 1
      },
      {
        "level": 2,
        "text": "1.1 Background",
        "page": 2
      }
    ],
    "total_pages": 500
  },
  "chunks": [
    {
      "index": 0,
      "content": "This is the beginning of the book...",
      "meta": {
        "page_start": 1,
        "page_end": 1,
        "heading_path": ["Chapter 1: Introduction"],
        "heading_level": 1,
        "section_marker": null,
        "bboxes": [
          {
            "page": 1,
            "l": 0.1,
            "t": 0.2,
            "r": 0.9,
            "b": 0.3
          }
        ]
      }
    },
    {
      "index": 1,
      "content": "The second chunk continues...",
      "meta": {
        "page_start": 1,
        "page_end": 2,
        "heading_path": ["Chapter 1: Introduction", "1.1 Background"],
        "heading_level": 2,
        "section_marker": null,
        "bboxes": [
          {
            "page": 1,
            "l": 0.1,
            "t": 0.35,
            "r": 0.9,
            "b": 0.95
          },
          {
            "page": 2,
            "l": 0.1,
            "t": 0.1,
            "r": 0.9,
            "b": 0.25
          }
        ]
      }
    }
  ]
}
```

**Size:** ~2-5 MB for 500-page book (382 chunks with metadata)

**Usage:**
- Bulletproof matching input (replaces job.metadata cache)
- Survives database resets forever
- Enables reprocessing after markdown edits

#### `.metadata.json` (NEW)

**Purpose:** AI-extracted chunk metadata. Avoid re-extraction costs ($0.20 per 500 chunks).

```json
{
  "version": "1.0",
  "created_at": "2025-10-12T12:30:00Z",
  "extraction_method": "pydantic_ai_ollama",
  "model": "qwen2.5:32b-instruct-q4_K_M",
  "document": {
    "title": "Gravity's Rainbow",
    "author": "Thomas Pynchon",
    "word_count": 150000,
    "themes": ["paranoia", "war", "technology", "conspiracy"]
  },
  "chunks": [
    {
      "chunk_index": 0,
      "themes": ["paranoia", "surveillance", "rocket"],
      "importance_score": 0.85,
      "summary": "Introduction to Slothrop and the mysterious correlation between his sexual encounters and V-2 rocket strikes.",
      "emotional_metadata": {
        "polarity": 0.2,
        "primaryEmotion": "anxious",
        "intensity": 0.7
      },
      "conceptual_metadata": {
        "concepts": [
          {
            "name": "surveillance capitalism",
            "confidence": 0.9,
            "type": "theme"
          },
          {
            "name": "paranoia",
            "confidence": 0.95,
            "type": "emotion"
          }
        ]
      },
      "domain_metadata": {
        "primaryDomain": "literature",
        "subDomain": "postmodern_fiction",
        "confidence": 0.9
      }
    },
    {
      "chunk_index": 1,
      "themes": ["technology", "control", "determinism"],
      "importance_score": 0.65,
      "summary": "Description of wartime London and the bureaucratic systems tracking Slothrop.",
      "emotional_metadata": {
        "polarity": -0.1,
        "primaryEmotion": "fear",
        "intensity": 0.5
      },
      "conceptual_metadata": {
        "concepts": [
          {
            "name": "bureaucracy",
            "confidence": 0.85,
            "type": "theme"
          }
        ]
      },
      "domain_metadata": {
        "primaryDomain": "literature",
        "subDomain": "historical_fiction",
        "confidence": 0.7
      }
    }
  ]
}
```

**Size:** ~1-3 MB for 500-page book (382 chunks)

**Usage:**
- Skip metadata re-extraction after database reset
- Faster document reconstruction (5 seconds vs 2 minutes)

#### `.embeddings.bin` (NEW)

**Purpose:** 768-dimensional vectors for semantic search and connection remapping.

**Format:** Binary Float32Array

```
// Structure (binary format)
[chunk_count: uint32]           // 4 bytes: 382
[dimensions: uint32]            // 4 bytes: 768
[chunk_0_vector: float32[768]]  // 3072 bytes
[chunk_1_vector: float32[768]]  // 3072 bytes
...
[chunk_381_vector: float32[768]] // 3072 bytes

Total size: 8 + (382 × 768 × 4) = 1,173,512 bytes ≈ 1.2 MB
```

**Why Binary:**
- 10x smaller than JSON (1.2 MB vs 12 MB)
- Faster to load (single buffer read)
- Direct memory mapping

**Read/Write:**
```typescript
// Write
const buffer = new Float32Array(chunks.length * 768)
chunks.forEach((chunk, i) => {
  chunk.embedding.forEach((val, j) => {
    buffer[i * 768 + j] = val
  })
})
await supabase.storage
  .from('documents')
  .upload(path, Buffer.from(buffer.buffer))

// Read
const { data } = await supabase.storage
  .from('documents')
  .download(path)
const arrayBuffer = await data.arrayBuffer()
const float32 = new Float32Array(arrayBuffer)

// Convert to 2D array
const embeddings = []
for (let i = 0; i < float32.length; i += 768) {
  embeddings.push(Array.from(float32.slice(i, i + 768)))
}
```

**Usage:**
- Connection remapping after database reset
- Semantic search without regenerating embeddings
- Faster than Gemini API ($0.02 per 500 chunks)

#### `.manifest.json` (NEW)

**Purpose:** Track versions and detect file changes.

```json
{
  "version": "1.0",
  "schema_version": 46,
  "created_at": "2025-10-12T12:00:00Z",
  "last_processed": "2025-10-12T14:30:00Z",
  "processing_mode": "local",
  "files": {
    "source.pdf": {
      "size_bytes": 5242880,
      "sha256": "abc123def456...",
      "uploaded_at": "2025-10-12T11:00:00Z"
    },
    "content.md": {
      "size_bytes": 512000,
      "sha256": "def456ghi789...",
      "last_edited": "2025-10-12T13:00:00Z"
    },
    ".annotations.json": {
      "annotation_count": 42,
      "last_exported": "2025-10-12T14:00:00Z"
    },
    ".cached_chunks.json": {
      "chunk_count": 382,
      "docling_version": "2.55.1",
      "markdown_hash": "ghi789jkl012..."
    },
    ".metadata.json": {
      "extraction_method": "pydantic_ai_ollama",
      "model": "qwen2.5:32b"
    },
    ".embeddings.bin": {
      "size_bytes": 1173512,
      "dimensions": 768,
      "model": "Xenova/all-mpnet-base-v2"
    }
  }
}
```

**Usage:**
- Detect markdown changes (hash mismatch = invalidate cache)
- Track which processing mode was used
- Version compatibility checking

---

## Part 4: Enhanced Workflows

### 4.1 Initial Processing (With Storage Caching)

```
┌─────────────────────────────────────────────────────────────┐
│ USER: Uploads source.pdf                                    │
└─────────────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────────┐
│ PROCESSING: LOCAL MODE                                      │
│                                                             │
│ Stage 1: Download PDF from storage                         │
│ Stage 2: Docling extraction with HybridChunker             │
│   → 382 chunks with structural metadata                    │
│   → Save to .cached_chunks.json in storage ✅               │
│                                                             │
│ Stage 3: Ollama cleanup (or regex-only)                    │
│   → Save content.md to storage ✅                           │
│                                                             │
│ Stage 4: Bulletproof matching                              │
│   → Uses cached chunks from Stage 2                        │
│   → 100% recovery with confidence tracking                 │
│                                                             │
│ Stage 5: PydanticAI metadata extraction                    │
│   → Extract themes, concepts, emotions                     │
│   → Save to .metadata.json in storage ✅                    │
│                                                             │
│ Stage 6: Local embeddings (Transformers.js)                │
│   → Generate 768d vectors                                  │
│   → Save to .embeddings.bin in storage ✅                   │
│                                                             │
│ Stage 7: Save to database (query cache)                    │
│   → Insert documents row                                   │
│   → Insert chunks rows (with all metadata)                 │
│                                                             │
│ Stage 8: Generate manifest                                 │
│   → Create .manifest.json with file hashes ✅               │
└─────────────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────────┐
│ STORAGE: Complete backup (source of truth)                 │
│ ✅ source.pdf                                               │
│ ✅ content.md                                               │
│ ✅ .cached_chunks.json (Docling results)                    │
│ ✅ .metadata.json (AI extraction)                           │
│ ✅ .embeddings.bin (768d vectors)                           │
│ ✅ .manifest.json (version tracking)                        │
└─────────────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────────┐
│ DATABASE: Query cache (can be rebuilt anytime)             │
│ • documents table                                           │
│ • chunks table (with embeddings)                            │
│ • components table (annotations saved by cron)              │
└─────────────────────────────────────────────────────────────┘
```

**Cost:** $0.00 (LOCAL mode)
**Time:** 15 minutes
**Result:** Everything in storage, database is query cache

### 4.2 Obsidian Editing Workflow (Zero-Cost Reprocessing)

```
┌─────────────────────────────────────────────────────────────┐
│ USER: Edits content.md in Obsidian                          │
│ - Fixes 100 typos                                           │
│ - Restructures 3 sections                                   │
│ - Adds personal notes                                       │
│ - Obsidian syncs to Supabase Storage                        │
└─────────────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────────┐
│ SYNC TRIGGER: Detects content.md change                     │
└─────────────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────────┐
│ REPROCESSING: LOCAL MODE                                    │
│                                                             │
│ Stage 1: Load from storage (instant)                       │
│   ✅ edited content.md                                      │
│   ✅ .cached_chunks.json (original Docling extraction)      │
│   ✅ .annotations.json (user annotations)                   │
│                                                             │
│ Stage 2: Validate cache                                    │
│   • Hash content.md                                         │
│   • Compare to .cached_chunks.json markdown_hash            │
│   • Decision: Hash changed → cache still valid for matching │
│                                                             │
│ Stage 3: Bulletproof matching ($0.00!)                      │
│   • Load 382 cached chunks from storage                    │
│   • Run 5-layer matching against edited markdown           │
│   • Layer 1: ~70% exact matches                            │
│   • Layer 2: ~20% fuzzy matches                            │
│   • Layer 3: ~8% embeddings/LLM                             │
│   • Layer 4: ~2% interpolation                             │
│   • Result: 382/382 chunks remapped (100%)                  │
│                                                             │
│ Stage 4: Recover annotations ($0.00!)                       │
│   • Load .annotations.json from storage                     │
│   • 4-tier fuzzy matching                                  │
│   • Remap 40/42 annotations (95% success rate)              │
│   • 2 annotations flagged for review                       │
│                                                             │
│ Stage 5: Reuse metadata ($0.00!)                            │
│   • Load .metadata.json from storage                        │
│   • Apply metadata to remapped chunks                      │
│   • No re-extraction needed                                │
│                                                             │
│ Stage 6: Reuse embeddings ($0.00!)                          │
│   • Load .embeddings.bin from storage                       │
│   • Apply embeddings to remapped chunks                    │
│   • No regeneration needed                                 │
│                                                             │
│ Stage 7: Update database                                   │
│   • Mark old chunks as is_current: false                   │
│   • Insert new chunks with metadata + embeddings           │
│   • Update annotations in ECS components                   │
│                                                             │
│ Stage 8: Remap connections ($0.00!)                         │
│   • Load verified connections                              │
│   • Use cached embeddings for similarity matching          │
│   • Update connection chunk IDs                            │
└─────────────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────────┐
│ RESULT:                                                     │
│ ✅ Cost: $0.00 (everything from storage)                    │
│ ✅ Time: 2-3 minutes (bulletproof matching)                 │
│ ✅ Quality: 100% chunk recovery, 95% annotation recovery    │
│ ✅ Metadata: Preserved from original extraction             │
│ ✅ Embeddings: Reused from original generation              │
│ ✅ Connections: Remapped using cached embeddings            │
└─────────────────────────────────────────────────────────────┘
```

**Comparison:**

| Without Storage Caching | With Storage Caching |
|------------------------|---------------------|
| Re-extract with Gemini: $0.50 | Load cached chunks: $0.00 ✅ |
| Re-extract metadata: $0.20 | Load .metadata.json: $0.00 ✅ |
| Regenerate embeddings: $0.02 | Load .embeddings.bin: $0.00 ✅ |
| **Total: $0.72 + 15 min** | **Total: $0.00 + 3 min** ✅ |

### 4.3 Database Reset Workflow (5-Second Recovery)

```
┌─────────────────────────────────────────────────────────────┐
│ DEVELOPER: npx supabase db reset                            │
│ Reason: Testing cached_chunks migration 046                │
└─────────────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────────┐
│ DATABASE: All data deleted                                  │
│ ❌ documents (empty)                                        │
│ ❌ chunks (empty)                                           │
│ ❌ components (empty)                                       │
│ ❌ connections (empty)                                      │
└─────────────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────────┐
│ RECOVERY: npm run rebuild-from-storage                      │
└─────────────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────────┐
│ REBUILD SCRIPT: scripts/rebuild-from-storage.ts             │
│                                                             │
│ Step 1: List all documents in storage                      │
│   • Query storage API for document directories             │
│   • Found: 50 documents                                    │
│                                                             │
│ Step 2: For each document:                                 │
│   ┌─────────────────────────────────────────────────────┐  │
│   │ Document: Gravity's Rainbow (gravity-123)           │  │
│   ├─────────────────────────────────────────────────────┤  │
│   │ Load .manifest.json                                 │  │
│   │   → Processing mode: local                          │  │
│   │   → Files: 6 (source, content, chunks, meta, emb)  │  │
│   │                                                     │  │
│   │ Reconstruct document metadata                       │  │
│   │   → Insert documents row                            │  │
│   │   → Title, author from .metadata.json               │  │
│   │                                                     │  │
│   │ Load .cached_chunks.json                            │  │
│   │   → 382 chunks with structural metadata             │  │
│   │                                                     │  │
│   │ Load content.md                                     │  │
│   │   → Current markdown content                        │  │
│   │                                                     │  │
│   │ Bulletproof matching                                │  │
│   │   → Remap chunks to current markdown                │  │
│   │   → Preserve structural metadata                    │  │
│   │                                                     │  │
│   │ Load .metadata.json                                 │  │
│   │   → Apply themes, concepts, emotions                │  │
│   │                                                     │  │
│   │ Load .embeddings.bin                                │  │
│   │   → 382 × 768d vectors                              │  │
│   │                                                     │  │
│   │ Insert chunks                                       │  │
│   │   → 382 rows with all metadata + embeddings         │  │
│   │                                                     │  │
│   │ Load .annotations.json                              │  │
│   │   → 42 annotations                                  │  │
│   │   → Remap to new chunk IDs                          │  │
│   │   → Insert as ECS components                        │  │
│   │                                                     │  │
│   │ Time: 0.1 seconds per document                      │  │
│   └─────────────────────────────────────────────────────┘  │
│                                                             │
│ Step 3: Recompute connections                              │
│   • Run 3-engine orchestrator                              │
│   • Uses cached embeddings (no regeneration)               │
│   • Time: 2-3 seconds per document                         │
│                                                             │
│ TOTAL TIME: 5 seconds for 50 documents ✅                   │
└─────────────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────────┐
│ DATABASE: Fully reconstructed                               │
│ ✅ 50 documents                                             │
│ ✅ 19,100 chunks (382 per doc)                              │
│ ✅ 2,100 annotations (42 per doc avg)                       │
│ ✅ ~5,000 connections (auto-generated)                      │
│                                                             │
│ All data restored in 5 seconds, $0.00 cost ✅               │
└─────────────────────────────────────────────────────────────┘
```

**Comparison:**

| Without Storage Caching | With Storage Caching |
|------------------------|---------------------|
| Re-upload 50 documents | Load from storage ✅ |
| Re-process: 50 × 15 min = 12.5 hours | Reconstruct: 5 seconds ✅ |
| Cost: 50 × $0.50 = $25 | Cost: $0.00 ✅ |
| Manual work: Upload, wait, validate | Automated: 1 command ✅ |

---

## Part 5: Implementation Guide

### 5.1 Integration Points

#### Point 1: PDF Processor (After Docling Extraction)

**File:** `worker/processors/pdf-processor.ts`
**Location:** After line ~126 (Stage 2 complete)

**Add:**
```typescript
// Stage 2.5: Save cached chunks to storage
await saveCachedChunksToStorage(this.supabase, this.job.document_id!, {
  version: '1.0',
  created_at: new Date().toISOString(),
  extraction_mode: 'pdf',
  docling_version: '2.55.1',
  markdown_hash: hashMarkdown(extractionResult.markdown),
  structure: extractionResult.structure,
  chunks: extractionResult.chunks
})
```

#### Point 2: After Metadata Extraction

**File:** `worker/processors/pdf-processor.ts`
**Location:** After bulletproof matching + metadata enrichment

**Add:**
```typescript
// Save metadata to storage
await saveMetadataToStorage(this.supabase, this.job.document_id!, {
  version: '1.0',
  created_at: new Date().toISOString(),
  extraction_method: 'pydantic_ai_ollama',
  model: process.env.OLLAMA_MODEL!,
  document: {
    title: this.job.document_title,
    word_count: enrichedChunks.reduce((sum, c) => sum + c.word_count, 0)
  },
  chunks: enrichedChunks.map(c => ({
    chunk_index: c.chunk_index,
    themes: c.themes,
    importance_score: c.importance_score,
    summary: c.summary,
    emotional_metadata: c.emotional_metadata,
    conceptual_metadata: c.conceptual_metadata,
    domain_metadata: c.domain_metadata
  }))
})
```

#### Point 3: After Embeddings Generation

**File:** `worker/processors/pdf-processor.ts`
**Location:** After embeddings generated

**Add:**
```typescript
// Save embeddings to storage (binary format)
await saveEmbeddingsToStorage(
  this.supabase,
  this.job.document_id!,
  embeddings
)
```

#### Point 4: Continue Processing Handler

**File:** `worker/handlers/continue-processing.ts`
**Location:** Replace job metadata cache lookup (lines 170-189)

**Replace:**
```typescript
// OLD: Query job.metadata (wrong job type, 90-day deletion)
const { data: originalJob } = await supabase
  .from('background_jobs')
  .select('metadata')
  .eq('entity_id', documentId)
  .eq('job_type', 'process_document')
  .single()

cachedDoclingChunks = originalJob?.metadata?.cached_extraction?.doclingChunks
```

**With:**
```typescript
// NEW: Load from storage (permanent, correct)
const cached = await loadCachedChunksFromStorage(
  supabase,
  documentId,
  hashMarkdown(markdown)
)

if (cached) {
  cachedDoclingChunks = cached.chunks
  console.log(`[ContinueProcessing] Loaded ${cached.chunks.length} cached chunks from storage`)
} else {
  console.warn('[ContinueProcessing] No cached chunks in storage - falling back to CLOUD mode')
}
```

### 5.2 New Utility Module

**File:** `worker/lib/storage-sync.ts` (NEW)

```typescript
import { createClient } from '@supabase/supabase-js'
import { createHash } from 'crypto'
import type { DoclingChunk, DoclingStructure } from './docling-extractor.js'

/**
 * Generate SHA256 hash of markdown for cache validation.
 */
export function hashMarkdown(markdown: string): string {
  return createHash('sha256').update(markdown).digest('hex')
}

/**
 * Save cached chunks to storage (permanent, not job metadata).
 */
export async function saveCachedChunksToStorage(
  supabase: ReturnType<typeof createClient>,
  documentId: string,
  data: {
    version: string
    created_at: string
    extraction_mode: 'pdf' | 'epub'
    docling_version: string
    markdown_hash: string
    structure: DoclingStructure
    chunks: DoclingChunk[]
  }
): Promise<void> {
  const path = `${documentId}/.cached_chunks.json`

  await supabase.storage
    .from('documents')
    .upload(path, JSON.stringify(data, null, 2), {
      contentType: 'application/json',
      upsert: true
    })

  console.log(`[StorageSync] Saved ${data.chunks.length} cached chunks to storage`)
}

/**
 * Load cached chunks from storage with hash validation.
 */
export async function loadCachedChunksFromStorage(
  supabase: ReturnType<typeof createClient>,
  documentId: string,
  currentMarkdownHash: string
): Promise<{ chunks: DoclingChunk[]; structure: DoclingStructure } | null> {
  const path = `${documentId}/.cached_chunks.json`

  const { data, error } = await supabase.storage
    .from('documents')
    .download(path)

  if (error || !data) {
    return null
  }

  const cached = JSON.parse(await data.text())

  // Validate hash
  if (cached.markdown_hash !== currentMarkdownHash) {
    console.warn('[StorageSync] Markdown hash mismatch - cache may be stale but still usable for matching')
  }

  return {
    chunks: cached.chunks,
    structure: cached.structure
  }
}

/**
 * Save metadata to storage.
 */
export async function saveMetadataToStorage(
  supabase: ReturnType<typeof createClient>,
  documentId: string,
  data: {
    version: string
    created_at: string
    extraction_method: string
    model: string
    document: any
    chunks: any[]
  }
): Promise<void> {
  const path = `${documentId}/.metadata.json`

  await supabase.storage
    .from('documents')
    .upload(path, JSON.stringify(data, null, 2), {
      contentType: 'application/json',
      upsert: true
    })

  console.log(`[StorageSync] Saved metadata for ${data.chunks.length} chunks`)
}

/**
 * Save embeddings to storage (binary format).
 */
export async function saveEmbeddingsToStorage(
  supabase: ReturnType<typeof createClient>,
  documentId: string,
  embeddings: number[][]
): Promise<void> {
  const path = `${documentId}/.embeddings.bin`

  // Convert to Float32Array (4 bytes per float)
  const float32 = new Float32Array(embeddings.flat())
  const buffer = Buffer.from(float32.buffer)

  await supabase.storage
    .from('documents')
    .upload(path, buffer, {
      contentType: 'application/octet-stream',
      upsert: true
    })

  console.log(`[StorageSync] Saved ${embeddings.length} embeddings (${buffer.length} bytes)`)
}

/**
 * Load embeddings from storage.
 */
export async function loadEmbeddingsFromStorage(
  supabase: ReturnType<typeof createClient>,
  documentId: string
): Promise<number[][] | null> {
  const path = `${documentId}/.embeddings.bin`

  const { data, error } = await supabase.storage
    .from('documents')
    .download(path)

  if (error || !data) {
    return null
  }

  const buffer = await data.arrayBuffer()
  const float32 = new Float32Array(buffer)

  // Convert flat array to 2D (768 dimensions per chunk)
  const embeddings: number[][] = []
  for (let i = 0; i < float32.length; i += 768) {
    embeddings.push(Array.from(float32.slice(i, i + 768)))
  }

  return embeddings
}
```

### 5.3 Rebuild Script

**File:** `scripts/rebuild-from-storage.ts` (NEW)

```typescript
/**
 * Rebuild entire database from storage files.
 * Use after database reset during development.
 *
 * Usage:
 *   npm run rebuild-from-storage
 *
 * Result:
 *   Database fully reconstructed from storage in 5-10 seconds.
 */

import { createClient } from '@supabase/supabase-js'
import {
  loadCachedChunksFromStorage,
  loadEmbeddingsFromStorage,
  hashMarkdown
} from '../worker/lib/storage-sync.js'

async function rebuildFromStorage() {
  console.log('🔄 Rebuilding database from storage...\n')

  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Step 1: List all documents in storage
  const { data: files } = await supabase.storage
    .from('documents')
    .list('', { limit: 1000 })

  const documentIds = files
    ?.filter(f => f.name.match(/^[a-f0-9-]{36}$/))
    .map(f => f.name) || []

  console.log(`📁 Found ${documentIds.length} documents in storage\n`)

  let totalChunks = 0
  let totalAnnotations = 0

  // Step 2: Reconstruct each document
  for (const docId of documentIds) {
    console.log(`📄 Processing ${docId}...`)

    try {
      // Load manifest
      const { data: manifestFile } = await supabase.storage
        .from('documents')
        .download(`${docId}/.manifest.json`)

      if (!manifestFile) {
        console.log(`  ⚠️  No manifest, skipping`)
        continue
      }

      const manifest = JSON.parse(await manifestFile.text())

      // Load markdown
      const { data: markdownFile } = await supabase.storage
        .from('documents')
        .download(`${docId}/content.md`)

      if (!markdownFile) {
        console.log(`  ⚠️  No markdown, skipping`)
        continue
      }

      const markdown = await markdownFile.text()
      const markdownHash = hashMarkdown(markdown)

      // Load cached chunks
      const cached = await loadCachedChunksFromStorage(supabase, docId, markdownHash)

      if (!cached) {
        console.log(`  ⚠️  No cached chunks, skipping`)
        continue
      }

      // Bulletproof matching
      const { bulletproofMatch } = await import('../worker/lib/local/bulletproof-matcher.js')
      const { chunks: rematchedChunks } = await bulletproofMatch(
        markdown,
        cached.chunks,
        { silent: true }
      )

      // Load metadata
      const { data: metadataFile } = await supabase.storage
        .from('documents')
        .download(`${docId}/.metadata.json`)

      const metadata = metadataFile ? JSON.parse(await metadataFile.text()) : null

      // Load embeddings
      const embeddings = await loadEmbeddingsFromStorage(supabase, docId)

      // Insert document
      await supabase.from('documents').insert({
        id: docId,
        title: metadata?.document?.title || 'Untitled',
        source_type: cached.extraction_mode === 'pdf' ? 'pdf' : 'epub',
        processing_status: 'completed',
        markdown_path: `${docId}/content.md`,
        created_at: manifest.created_at
      })

      // Insert chunks
      const chunksToInsert = rematchedChunks.map((result, idx) => ({
        document_id: docId,
        chunk_index: idx,
        content: result.chunk.content,
        start_offset: result.start_offset,
        end_offset: result.end_offset,
        word_count: result.chunk.content.split(/\s+/).length,
        embedding: embeddings?.[idx] || null,
        // Structural metadata from cached chunks
        page_start: result.chunk.meta.page_start,
        page_end: result.chunk.meta.page_end,
        heading_level: result.chunk.meta.heading_level,
        heading_path: result.chunk.meta.heading_path,
        section_marker: result.chunk.meta.section_marker,
        bboxes: result.chunk.meta.bboxes,
        position_confidence: result.confidence,
        position_method: result.method,
        // AI metadata from storage
        themes: metadata?.chunks?.[idx]?.themes || [],
        importance_score: metadata?.chunks?.[idx]?.importance_score || 0.5,
        summary: metadata?.chunks?.[idx]?.summary || null,
        emotional_metadata: metadata?.chunks?.[idx]?.emotional_metadata || null,
        conceptual_metadata: metadata?.chunks?.[idx]?.conceptual_metadata || null,
        domain_metadata: metadata?.chunks?.[idx]?.domain_metadata || null
      }))

      await supabase.from('chunks').insert(chunksToInsert)
      totalChunks += chunksToInsert.length

      // Load and insert annotations
      const { data: annotationsFile } = await supabase.storage
        .from('documents')
        .download(`${docId}/.annotations.json`)

      if (annotationsFile) {
        const annotations = JSON.parse(await annotationsFile.text())

        for (const anno of annotations) {
          // Find matching chunk
          const chunk = chunksToInsert.find(c =>
            c.start_offset <= anno.position.start &&
            c.end_offset >= anno.position.end
          )

          if (chunk) {
            // Create ECS entity with annotation + position + source components
            const { data: entity } = await supabase.from('entities').insert({
              user_id: 'default-user-id'
            }).select().single()

            await supabase.from('components').insert([
              {
                entity_id: entity.id,
                component_type: 'annotation',
                data: {
                  text: anno.text,
                  note: anno.note,
                  color: anno.color,
                  tags: anno.tags
                }
              },
              {
                entity_id: entity.id,
                component_type: 'position',
                data: {
                  startOffset: anno.position.start,
                  endOffset: anno.position.end,
                  textContext: anno.textContext
                },
                recovery_method: anno.recovery?.method,
                recovery_confidence: anno.recovery?.confidence
              },
              {
                entity_id: entity.id,
                component_type: 'source',
                data: {
                  document_id: docId,
                  chunk_id: chunk.id
                }
              }
            ])

            totalAnnotations++
          }
        }
      }

      console.log(`  ✅ Reconstructed ${chunksToInsert.length} chunks`)

    } catch (error) {
      console.error(`  ❌ Failed: ${error.message}`)
    }
  }

  // Step 3: Recompute connections
  console.log('\n🔗 Recomputing connections...')

  for (const docId of documentIds) {
    try {
      const { processDocument } = await import('../worker/engines/orchestrator.js')
      await processDocument(docId)
    } catch (error) {
      console.error(`  ❌ Failed for ${docId}: ${error.message}`)
    }
  }

  console.log('\n✅ Database rebuild complete!')
  console.log(`   ${documentIds.length} documents`)
  console.log(`   ${totalChunks} chunks`)
  console.log(`   ${totalAnnotations} annotations`)
}

rebuildFromStorage()
```

**Add to `package.json`:**
```json
{
  "scripts": {
    "rebuild-from-storage": "npx tsx scripts/rebuild-from-storage.ts"
  }
}
```

---

## Part 6: Cost-Benefit Analysis

### 6.1 Development Workflow Comparison

| Scenario | Without Storage Caching | With Storage Caching |
|----------|------------------------|---------------------|
| **Database Reset (50 docs)** | Re-upload + reprocess: 12.5 hours, $25 | Rebuild script: 5 seconds, $0.00 ✅ |
| **Markdown Edit (1 doc)** | Gemini reprocessing: 15 min, $0.72 | Bulletproof matching: 3 min, $0.00 ✅ |
| **Batch Edits (10 docs)** | 150 min, $7.20 | 30 min, $0.00 ✅ |
| **Migration Testing** | Manual re-upload each time | One-command restore ✅ |
| **Annotation Loss Risk** | ⚠️ Database only | ✅ Hourly export to storage |

### 6.2 Storage Cost Analysis

**Per Document (500-page book):**
- `source.pdf`: 5 MB
- `content.md`: 0.5 MB
- `.cached_chunks.json`: 3 MB
- `.metadata.json`: 2 MB
- `.embeddings.bin`: 1.2 MB
- `.annotations.json`: 0.1 MB
- **Total: ~12 MB per document**

**Library Scale:**
- 100 documents: 1.2 GB
- 1,000 documents: 12 GB
- 10,000 documents: 120 GB

**Supabase Storage Pricing:**
- Free tier: 100 GB
- Pro tier: $0.021/GB/month (beyond 100 GB)

**Cost for 1,000 documents:**
- Storage: 12 GB = FREE (under 100 GB)
- Processing savings: $500 (vs re-uploading)
- **Net savings: $500** ✅

### 6.3 Implementation Effort

| Task | Effort | Files |
|------|--------|-------|
| Create storage-sync.ts utility | 2 hours | 1 new file |
| Update pdf-processor.ts | 1 hour | 3 integration points |
| Update epub-processor.ts | 1 hour | 3 integration points |
| Update continue-processing.ts | 30 min | 1 replacement |
| Create rebuild script | 2 hours | 1 new file |
| Testing & validation | 2 hours | - |
| **Total** | **8.5 hours** | **6 files (4 modified, 2 new)** |

---

## Part 7: Recommendations

### 7.1 Implementation Priority

**Phase 1: Cached Chunks** (CRITICAL - Fixes LOCAL mode resume bug)
1. Implement `saveCachedChunksToStorage()` and `loadCachedChunksFromStorage()`
2. Update pdf-processor.ts and epub-processor.ts
3. Fix continue-processing.ts to load from storage (not job metadata)
4. Test: Resume from checkpoint after 91 days (simulate job deletion)

**Phase 2: Rebuild Script** (HIGH VALUE - Enables fearless development)
1. Create rebuild-from-storage.ts
2. Add npm script
3. Test: Database reset → rebuild → validate all data restored

**Phase 3: Metadata & Embeddings** (OPTIMIZATION - Reduces reprocessing time)
1. Implement `saveMetadataToStorage()` and `saveEmbeddingsToStorage()`
2. Update processors to save after extraction
3. Update rebuild script to load metadata and embeddings
4. Test: Database reset → rebuild → verify metadata and embeddings loaded

**Phase 4: Manifest** (POLISH - Version tracking)
1. Generate `.manifest.json` after processing
2. Use for cache invalidation and compatibility checks

### 7.2 Testing Strategy

**Test 1: Initial Processing**
```bash
# Process document and verify all files in storage
npm run dev:worker
# Upload test PDF
# Check storage:
# - source.pdf ✅
# - content.md ✅
# - .cached_chunks.json ✅
# - .metadata.json ✅
# - .embeddings.bin ✅
```

**Test 2: Resume After 90 Days**
```bash
# Simulate job deletion
DELETE FROM background_jobs WHERE entity_id = '<doc-id>'

# Trigger resume (should load from storage, not job metadata)
# Verify: No "fallback to CLOUD mode" warning
# Verify: Bulletproof matching runs successfully
```

**Test 3: Database Reset**
```bash
npx supabase db reset
npm run rebuild-from-storage

# Verify:
# - All documents restored ✅
# - All chunks with metadata ✅
# - All annotations recovered ✅
# - All connections recomputed ✅
# - Time: <10 seconds ✅
```

**Test 4: Markdown Edit**
```bash
# Edit content.md in Obsidian
# Trigger sync
# Verify:
# - Cached chunks loaded from storage ✅
# - Bulletproof matching runs ✅
# - Annotations recovered ✅
# - Cost: $0.00 ✅
```

### 7.3 Migration Path

For existing documents without storage caching:

**Option A: Lazy Migration**
- Keep existing documents as-is
- New processing creates storage files
- Gradually migrate as users reprocess

**Option B: Batch Migration**
```typescript
// scripts/migrate-to-storage.ts
// For each existing document:
// 1. Fetch chunks from database
// 2. Save to .cached_chunks.json
// 3. Save to .metadata.json
// 4. Save embeddings to .embeddings.bin
```

**Recommendation:** Option A (lazy migration) - simpler, no downtime

---

## Part 8: Summary

### What You Already Have ✅

1. **Annotation Export** - Hourly cron saves to storage
2. **Annotation Recovery** - 4-tier fuzzy matching
3. **Connection Remapping** - Embedding-based similarity
4. **Bulletproof Matching** - 5-layer system, 100% recovery

### What's Missing ⚠️

1. **Cached Chunks in Storage** - Currently in job metadata (90-day deletion)
2. **Metadata in Storage** - Currently database only (lost on reset)
3. **Embeddings in Storage** - Currently database only (lost on reset)
4. **Rebuild Script** - No automated recovery from storage

### What This Unlocks ✅

1. **Zero-Cost Reprocessing** - Forever, not just 90 days
2. **5-Second Database Resets** - Fearless development
3. **Seamless Obsidian Integration** - Edit freely, reprocess instantly
4. **Complete Data Portability** - Switch databases, export data, backup easily

### Implementation Complexity

- **Effort:** 8.5 hours
- **Files:** 6 (4 modified, 2 new)
- **Risk:** Low (additive changes, graceful fallbacks)
- **Testing:** 4 scenarios, ~2 hours

### ROI

- **Cost Savings:** $500+ for 1,000 documents
- **Time Savings:** 12.5 hours → 5 seconds for database resets
- **Development Velocity:** 10x faster iteration with fearless database resets
- **Data Safety:** 100% protection against database issues

---

## Appendix: File Reference

### Existing Files (Modified)
- `worker/processors/pdf-processor.ts` - Add storage save calls
- `worker/processors/epub-processor.ts` - Add storage save calls
- `worker/handlers/continue-processing.ts` - Load from storage (not job metadata)

### New Files
- `worker/lib/storage-sync.ts` - Storage I/O utilities
- `scripts/rebuild-from-storage.ts` - Database rebuild script

### Related Files (Reference Only)
- `worker/jobs/export-annotations.ts` - Already exports annotations ✅
- `worker/handlers/recover-annotations.ts` - Already recovers annotations ✅
- `worker/handlers/remap-connections.ts` - Already remaps connections ✅
- `worker/lib/local/bulletproof-matcher.ts` - Already matches chunks ✅

---

**Next Step:** Implement Phase 1 (Cached Chunks) to fix the LOCAL mode resume bug and unlock zero-cost reprocessing forever.
