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

## Core Systems

### Document Processing Pipeline
```
Upload → Version → Chunk → Fingerprint → Embed → Detect → Surface
```

Every document immediately gets:
- **Deep thematic fingerprinting** (themes, tone, structure, concepts)
- **Multiple embedding strategies** (semantic, structural, conceptual)
- **Full collision detection** (all engines, all the time)
- **No filtering** - Store every possible connection, surface based on context

### Collision Detection Engines (All Running in Parallel)

1. **Semantic Similarity** - Standard embedding distance
2. **Thematic Bridges** - Cross-domain concept matching
3. **Structural Isomorphisms** - Pattern recognition across contexts
4. **Contradiction Tensions** - Productive disagreements
5. **Emotional Resonance** - Mood/tone matching (experimental)
6. **Methodological Echoes** - Similar analytical approaches
7. **Temporal Rhythms** - Documents that follow similar narrative patterns

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

### Obsidian Integration (Priority 1)
- Two-way sync (not just read-only)
- Chunks regenerate on every sync
- Fuzzy matching preserves connections
- My folder structure becomes navigational hierarchy
- Rhizome metadata written back as frontmatter

### Connection Surfacing
- **Reading Mode**: Show ALL connections in sidebar, sorted by personal scoring
- **Writing Mode**: Aggressive suggestion of related chunks while drafting
- **Research Mode**: Full graph visualization with all connection types visible
- **Chaos Mode**: Random high-strength connection every hour as notification

### Experimental Features (Ship Immediately)
- Voice note transcription → automatic spark creation
- PDF highlight import from my Remarkable tablet
- Connection strength decay (unused connections weaken over time)
- Anti-connections (explicitly marked "these should NOT be connected")
- Connection chains (A→B→C traversal paths)
- Time-based threading (what was I thinking about in September?)

## Data Architecture

### Hybrid Approach (Already Decided)
```sql
-- Document layer (PostgreSQL)
chunks (
  id, document_id, version, content,
  themes[], tone[], patterns[], concepts[],
  embedding vector(768),
  importance float,
  summary text,
  user_overrides jsonb  -- My corrections to AI analysis
)

connections (
  source_chunk_id, target_chunk_id,
  type, strength, auto_detected,
  user_validated, discovered_at,
  metadata jsonb,
  INDEX everything  -- Query speed > storage
)
```

### ECS Layer
- Annotations → ChunkRef component
- Flashcards → ChunkRef component  
- Sparks → ContextRef component (includes app state when created)
- Threads → ConnectionRef[] component array

## Development Approach

### Immediate Priorities
1. Ship the 4-engine collision detection
2. Build tuning interface (real-time weight adjustment)
3. Obsidian bidirectional sync
4. Validate connections inline while reading

### No Compromises On
- Every connection stored
- Full version history
- Instant collision detection

### Explicitly Ignore
- Performance optimization (until it personally annoys me)
- Scale considerations (it's just me)

## Success Metrics

The only metric: **Do I actually use this to create something?**

Not:
- Number of connections found

But:
- Did a connection lead to a thread?
- Did a thread become actual writing?
- Did I discover something I wouldn't have otherwise?

## The Real Goal

Build a thinking partner that knows my entire knowledge graph and aggressively suggests connections I wouldn't make myself. Even if 95% are noise, the 5% that hit will be worth it.

This isn't a product. It's my external cognitive system. Build accordingly.