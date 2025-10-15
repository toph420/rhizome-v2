# Updated APP_VISION.md

# Rhizome: Personal Knowledge Synthesis Engine

**Status:** Personal tool in active development. No external users, no compromises.

## Core Philosophy

This is my personal thinking environment. Every feature is built for how I actually work, not how I imagine others might. The app surfaces meaningful connections using AI where it matters, optimizes for serendipitous discovery, and processes books of any size efficiently.

## Architecture Principles

### 1. Intelligence Where It Matters
- **AI-powered for insight** - Cross-domain thematic bridges, rich metadata
- **Local processing for speed** - Stitching, chunking, filtering
- **Cost-aware design** - ~$0.50 per book through aggressive filtering
- **No token limits** - Batched processing handles 1000+ page books

### 2. File-Over-App (But For Me)
- Local files I can manipulate directly
- Obsidian vault as first-class citizen
- Version control on everything
- No data loss, ever, even during experimental refactors

## Core Systems

### Document Processing Pipeline

**Two Processing Modes:**
- **CLOUD**: Gemini 2.0 Flash (batched extraction/metadata) - ~$0.50/book
- **LOCAL**: Docling + Ollama + Transformers.js (zero cost, complete privacy)

**Unified Pipeline** (10 stages):
```
Upload → Extract → Cleanup → Bulletproof Match → Chonkie Chunk → Metadata Transfer → Enrich → Embed → Detect → Surface
```

**Chonkie Integration**: 9 user-selectable chunking strategies (token, sentence, recursive, semantic, late, code, neural, slumber, table). Default is **recursive** for structural chunking.

#### For Large Books (500+ pages) - CLOUD Mode

**Stage 1: Batched Extraction**
- Extract 100 pages at a time with 10-page overlap
- Gemini 2.0 Flash has 65k output token limit
- 5-6 API calls for 500-page book
- Cost: ~$0.12

**Stage 2: Intelligent Stitching**
- Find overlapping content via fuzzy matching
- Remove duplicates at boundaries
- Local processing, free

**Stage 3: Batched Metadata Extraction**
- Process 100k characters at a time
- Extract per chunk: content, themes, concepts (with importance), emotional_tone (polarity + emotion), importance_score
- 10 API calls for 500-page book
- Cost: ~$0.20

**Stage 4: Embedding Generation**
- Batch API call for all chunks
- 768-dim vectors for semantic search
- Cost: ~$0.02

**Stage 5: Connection Detection**
- 3 engines run in parallel
- Aggressive filtering reduces 160k potential comparisons to ~200 AI calls
- Cost: ~$0.20

**Total: ~$0.54 per 500-page book**

### The 3-Engine System

Dropped from 7 engines to 3. Each does something distinct:

#### 1. Semantic Similarity (Baseline)
- Fast embedding-based search
- Finds "these say the same thing"
- Uses pgvector indexes
- No AI calls, just cosine distance
- Weight: 0.25

#### 2. Contradiction Detection (Enhanced)
- Finds conceptual tensions using metadata
- Same concepts + opposite emotional polarity = tension
- "Paranoia" discussed positively vs negatively
- Uses existing metadata (concepts + polarity), no AI calls
- Falls back to syntax-based detection if metadata insufficient
- Weight: 0.40 (highest priority)

#### 3. Thematic Bridge (AI-Powered)
- Cross-domain concept matching
- "Paranoia in Gravity's Rainbow ↔ surveillance capitalism"
- Aggressive filtering: importance > 0.6, cross-document, different domains
- AI analyzes only ~200 chunk pairs per document
- Weight: 0.35

### Connection Scoring

Personal preference weights:
```typescript
contradiction_weight: 0.40  // Maximum friction (top priority)
thematic_bridge_weight: 0.35  // Cross-domain discovery
semantic_weight: 0.25  // Baseline similarity
```

No preset modes. These are my weights. Adjustable in real-time via code or config.

### The Synthesis Flow

1. **Chunks & Connections** (PostgreSQL)
   - Immutable document chunks with rich metadata
   - All connections stored (filtered at display time)
   - Full version history

2. **User Layer** (ECS)
   - Annotations with global positions + chunk references
   - Flashcards
   - Sparks (quick captures with full context)
   - Threads (connection chains)

3. **Intelligence Layer**
   - Runs on document upload (background job)
   - Re-runs on manual reprocess
   - ThematicBridge engine learns from validation patterns (future)

## Personal Optimizations

### Obsidian Integration
- Two-way sync between vault and Rhizome
- Chunks regenerate on sync
- Fuzzy matching preserves connections when content changes
- My folder structure becomes navigational hierarchy
- Rhizome metadata written back as frontmatter
- Cross-vault connections weighted higher

### Connection Surfacing

**The Hybrid Reader Approach:**
- **Display**: Full markdown document (`content.md`) for natural reading flow
- **Track**: Which chunks are currently in viewport
- **Surface**: Connections for visible chunks in sidebar
- **Score**: Apply personal weights in real-time

**Reading Mode**: Show connections in sidebar, sorted by weighted score
- Connections are chunk-to-chunk, not doc-to-doc
- Click through to explore connection chains (A→B→C)
- Filter by type (contradictions, bridges, similarity)

**Writing Mode**: Aggressive suggestion of related chunks while drafting
- As you type, system finds relevant chunks across corpus
- Suggests connections from entire knowledge graph
- Pull in quotes, references, contradictions

**Research Mode**: Full graph visualization
- See entire network of relationships
- Filter by engine type
- Zoom from bird's eye to chunk detail

### The Reader Architecture (Critical Design)

**The Problem We Solve:**
- Reading needs flow (continuous markdown, no chunk boundaries)
- Connections need precision (chunk-to-chunk relationships)
- Can't have both if you only store chunks

**The Solution:**
```
Full Document (content.md)     Semantic Chunks (database)
        ↓                              ↓
   Display Layer    ←────┬────→   Connection Layer
                         │
                   Bridge via:
              - Chunk boundaries (offsets)
              - Viewport tracking
              - Annotation indexing
```

**How It Works:**
1. User reads continuous markdown (natural flow, no breaks)
2. System tracks which chunks are currently visible in viewport
3. Sidebar shows connections for those specific chunks
4. Annotations have global positions BUT indexed by chunk
5. Connection graph operates entirely on chunk relationships
6. Export/Obsidian sync uses full markdown (portable)

## Cost Management

**Design philosophy:** AI where it provides insight, local processing everywhere else.

**Per-document costs (500-page book):**
- Extraction: $0.12 (batched)
- Metadata: $0.20 (batched, rich concepts/emotion)
- Connection detection: $0.20 (filtered to ~200 AI calls)
- Total: ~$0.52

**Cost controls:**
- Importance filtering (only analyze important chunks)
- Cross-document only (no self-connections)
- Domain filtering (bridges connect different contexts)
- Candidate limiting (top 15 per source chunk)

**For 100 books:** ~$52
**For 1000 books:** ~$520

Acceptable for a personal tool that actually delivers on the vision.

## What's Built

1. ✅ Multi-format upload (PDF, EPUB, YouTube, Web, Markdown, Text, Paste) - 7 input methods
2. ✅ Chonkie Integration - 9 chunking strategies with metadata transfer
3. ✅ LOCAL Processing Pipeline - Docling + Ollama + Transformers.js (zero cost)
4. ✅ CLOUD Processing Pipeline - Batched extraction/metadata with Gemini
5. ✅ 3-engine collision detection (Semantic, Contradiction, ThematicBridge)
6. ✅ Document reader (90% complete) - VirtualizedReader, ConnectionHeatmap, 6-tab RightPanel
7. ✅ Annotations System - Text selection → ECS persistence with fuzzy matching recovery
8. ✅ Connection Display - 6 tabs (Connections, Sparks, Flashcards, Tune, Annotations, Quality)
9. ✅ Storage-First Portability - Admin Panel (Cmd+Shift+A) with import/export/ZIP bundles
10. ✅ Obsidian & Readwise Integration - IntegrationsTab in Admin Panel
11. ✅ ProcessingDock - Bottom-right dock with active jobs tracking
12. 🚧 Study System - FlashcardsTab placeholder, FSRS not implemented

## Development Approach

### What Works
- Chonkie unified pipeline with 9 strategies (replaced 3 parallel paths)
- LOCAL mode processing (zero cost, complete privacy)
- Storage-First Portability (DB reset + restore in 6 min vs 25 min reprocessing)
- 90% complete reader with ConnectionHeatmap and 6-tab RightPanel
- Rich metadata from AI (concepts with importance, emotional polarity)
- Cost-effective through aggressive filtering (~$0.50/book)
- Clean 3-engine architecture with user-configurable weights

### Current Focus
- Study System implementation (FSRS algorithm, flashcard creation)
- Connection quality tuning based on personal library usage
- Performance optimization for large libraries (>1000 documents)
- Export enhancements (Markdown with inline annotations)

### Explicitly Ignore
- Performance optimization (until it personally annoys me)
- Multi-user features (it's just me)
- UI polish (functional > pretty)
- Scale considerations (personal library, not production)

## Success Metrics

The only metric: **Do I actually use this to create something?**

Not:
- Number of connections found
- Technical elegance
- Feature completeness
- Processing speed

But:
- Did a chunk-level connection lead to a spark?
- Did a spark become a thread?
- Did a thread become actual writing?
- Did ThematicBridge surface a cross-domain insight I wouldn't have made manually?
- Are contradictions showing me productive intellectual tension?
- Am I reading full documents while the system works underneath?

## The Real Goal

Build a thinking partner that knows my entire knowledge graph at the chunk level and surfaces connections I wouldn't make myself. The hybrid approach means I read naturally (full markdown) while the system operates on semantic precision (chunks with rich metadata).

The 3 engines work together:
- Semantic Similarity finds the obvious connections
- Contradiction Detection finds the friction
- Thematic Bridge finds the surprising cross-domain insights

This isn't a product. It's my external cognitive system. Build accordingly
