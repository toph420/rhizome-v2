# Rhizome: Personal Knowledge Synthesis Engine

**Status:** Personal tool in active development. No external users, no compromises.

## Core Philosophy

This is my personal thinking environment. Every feature is built for how I actually work, not how I imagine others might. The app aggressively surfaces connections, embraces complexity from day one, and optimizes for serendipitous discovery over user-friendliness.

## Architecture Principles

### 1. Maximum Intelligence, Minimum Friction
- **No progressive disclosure** - All features available immediately
- **Aggressive connection detection** - Surface everything, filter later
- **Personal tuning** - Every algorithm weight is adjustable in real-time
- **Experimental features** - Ship broken things, fix them when they annoy me

### 2. File-Over-App (But For Me)
- Local files I can manipulate directly
- Obsidian vault as first-class citizen
- Version control on everything
- No data loss, ever, even during experimental refactors

## Core Systems

### Document Processing Pipeline (✅ BUILT)
```
Upload → Extract → Clean → Chunk → Fingerprint → Embed → Detect → Surface
```

Every document gets:
1. **Verbatim markdown conversion** - Full document preserved in `content.md`
2. **Semantic chunking** - AI identifies complete thought units (300-500 words)
3. **Deep thematic fingerprinting** - Themes, tone, structure, concepts per chunk
4. **Multiple embedding strategies** - Semantic vectors for each chunk
5. **Full collision detection** - All 7 engines, all the time
6. **No filtering** - Store every possible connection, surface based on context

### Collision Detection Engines (🚧 IN PROGRESS - All Running in Parallel)

1. **Semantic Similarity** - Standard embedding distance
2. **Thematic Bridges** - Cross-domain concept matching
3. **Structural Isomorphisms** - Pattern recognition across contexts
4. **Contradiction Tensions** - Productive disagreements
5. **Emotional Resonance** - Mood/tone matching (experimental)
6. **Methodological Echoes** - Similar analytical approaches
7. **Temporal Rhythms** - Documents that follow similar narrative patterns

All engines write to same connection table. Every connection stored, no threshold filtering.

### Connection Scoring

Personal preference weights (adjustable via config):
```
semantic_weight: 0.3
thematic_weight: 0.9  # I care about concepts
structural_weight: 0.7
contradiction_weight: 1.0  # Maximum friction
emotional_weight: 0.4
methodological_weight: 0.8
temporal_weight: 0.2
```

### The Synthesis Flow

1. **Chunks & Connections** (PostgreSQL)
   - Immutable document chunks
   - All connections stored (no strength threshold)
   - Full version history

2. **User Layer** (ECS)
   - Annotations
   - Flashcards
   - Sparks (quick captures with full context)
   - Threads (grown aggressively, no waiting for "maturity")

3. **Intelligence Layer**
   - Runs constantly in background
   - Re-fingerprints on every Obsidian sync
   - Learns from my validation patterns
   - No compute limits - use GPT-4 if needed

## Personal Optimizations

### Obsidian Integration (Important Feature)
- Two-way sync between vault and Rhizome
- Chunks regenerate on every sync
- Fuzzy matching preserves connections when content changes
- My folder structure becomes navigational hierarchy
- Rhizome metadata written back as frontmatter (connections, themes, importance)
- Cross-vault connections weighted higher (more interesting)

### Connection Surfacing

**The Hybrid Reader Approach:**
- **Display**: Full markdown document (`content.md`) for natural reading flow
- **Track**: Which chunks are currently in viewport
- **Surface**: Connections for visible chunks in sidebar
- **Score**: Apply personal weights in real-time

**Reading Mode**: Show ALL connections in sidebar, sorted by personal scoring
- Connections are chunk-to-chunk, not doc-to-doc
- Click through to explore connection chains (A→B→C)
- Adjust weights on the fly to tune what surfaces

**Writing Mode**: Aggressive suggestion of related chunks while drafting
- As you type, system finds relevant chunks across corpus
- Suggests connections from your entire knowledge graph
- Pull in quotes, references, contradictions

**Research Mode**: Full graph visualization with all connection types visible
- See the entire network of relationships
- Filter by engine type (show only contradictions, only thematic bridges)
- Zoom from bird's eye to chunk detail

**Chaos Mode**: Random high-strength connection every hour as notification
- Inject serendipity into routine reading
- Surface buried connections that deserve attention

### The Reader Architecture (Critical Design)

**The Problem We Solve:**
- Reading needs flow (continuous markdown, no chunk boundaries)
- Connections need precision (chunk-to-chunk relationships)
- Can't have both if you only store chunks

**The Solution:**
```
Full Document (content.md)     Semantic Chunks (database)
        ↓                              ↓
   Display Layer    ←────┬───→   Connection Layer
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

**Why This Matters:**
- You get narrative continuity (reading full documents)
- System gets semantic precision (chunk-level connections)
- Portability preserved (markdown files you own)
- Connection discovery maximized (operates on thought units)

No compromises. Both layers working in harmony.

### Experimental Features (Ship Immediately)
- ✅ YouTube transcript extraction with timestamp preservation
- ✅ Fuzzy position matching for resilient annotation recovery
- ⏳ Voice note transcription → automatic spark creation
- ⏳ PDF highlight import from Remarkable tablet
- ⏳ Connection strength decay (unused connections weaken over time)
- ⏳ Anti-connections (explicitly marked "these should NOT be connected")
- ⏳ Connection chains (A→B→C traversal paths)
- ⏳ Time-based threading (what was I thinking about in September?)
- ⏳ Multiple AI models per engine (GPT-4 for nuance, Perplexity for contradictions)
- ⏳ Auto-threading when sparks cluster within 30 minutes

## Data Architecture

### Hybrid Approach: Full Documents + Semantic Chunks

**File System (Source of Truth)**
```
storage/
├── {doc_id}/content.md          # Full verbatim markdown (for reading)
├── {doc_id}/annotations.json    # Sidecar annotations with global positions
└── {doc_id}/metadata.json       # Document-level metadata
```

**PostgreSQL (Knowledge Graph)**
```sql
-- Full documents for portability
documents (
  id, title, source_type,
  storage_path,  -- Points to content.md
  markdown_content,  -- Cached for quick access
  processing_status,
  created_at, updated_at
)

-- Chunks: Atomic units for connections
chunks (
  id, document_id, chunk_index,
  content,  -- Semantic unit (300-500 words)
  start_offset, end_offset,  -- Position in full document
  themes[], tone[], patterns[], concepts[],
  embedding vector(768),
  importance float,
  summary text,
  user_overrides jsonb
)

-- Connections: Where the magic happens
connections (
  source_chunk_id, target_chunk_id,
  type enum(semantic|thematic|structural|contradiction|emotional|methodological|temporal),
  strength float,
  auto_detected boolean,
  user_validated boolean,
  discovered_at timestamp,
  metadata jsonb,
  INDEX on source_chunk_id,
  INDEX on target_chunk_id,
  INDEX on type,
  INDEX on strength
)
```

**Why Both?**
- **Full markdown**: Natural reading flow, portability, Obsidian sync
- **Chunks**: Where connections attach, what collision detection runs on
- **Reader displays full document, connection system operates on chunks underneath**

### ECS Layer
- Annotations → ChunkRef component (points to specific chunk for connections)
- Flashcards → ChunkRef component  
- Sparks → ContextRef component (includes app state when created: visible chunks, active connections, navigation path, scroll position, engine states)
- Threads → ConnectionRef[] component array

**Annotation Architecture:**
```typescript
// Stored in annotations.json (file-over-app)
{
  id: "ann_123",
  position: { start: 1547, end: 1623 },  // Global position in content.md
  chunkId: "chunk-42",  // For connection lookups
  content: { note: "...", tags: [...], color: "yellow" },
  created_at: "2025-09-29T..."
}

// When reading: Map global position to visible markdown
// When connecting: Use chunkId to find related chunks
// Fuzzy matching: Resilient to content edits
```

## Development Approach

### What's Built
1. ✅ Upload pipeline (PDFs, text, YouTube, drag-and-drop)
2. ✅ Multi-stage processing (extract → clean → chunk → fingerprint → embed)
3. ✅ Semantic chunking with AI (300-500 word thought units)
4. ✅ Deep fingerprinting per chunk (themes, tone, patterns, concepts)
5. ✅ Embedding generation (batched for performance)
6. 🚧 7-engine collision detection (in progress)
7. 🚧 Document reader with connection surfacing (next)

### Current Focus
- Finish collision detection system (all 7 engines writing to connections table)
- Build document reader that displays full markdown while surfacing chunk-level connections
- Implement real-time weight tuning interface
- Enable inline connection validation while reading

### Immediate Next Steps
1. Complete connection detection for all 7 engines
2. Document reader with hybrid chunk/markdown approach:
   - Display full markdown for natural reading flow
   - Track visible chunks in viewport
   - Surface connections for visible chunks in sidebar
   - Real-time weight adjustment
3. Build tuning interface (adjust engine weights on the fly)
4. Validate connections inline while reading
5. Obsidian bidirectional sync

### No Compromises On
- Every connection stored
- Full version history
- Instant collision detection
- My workflow, not "best practices"

### Explicitly Ignore
- Performance optimization (until it personally annoys me)
- Clean architecture (working code > pretty code)
- User experience (I know how it works)
- Scale considerations (it's just me)

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
- Did I discover a connection I wouldn't have made manually?
- Did the collision detection surface something genuinely surprising?
- Am I actually reading full documents while the connection system works underneath?

## The Real Goal

Build a thinking partner that knows my entire knowledge graph at the chunk level and aggressively suggests connections I wouldn't make myself. The hybrid approach means I read naturally (full markdown) while the system operates on semantic precision (chunks).

Even if 95% of connections are noise, the 5% that spark genuine insight will be worth it.

This isn't a product. It's my external cognitive system. Build accordingly.