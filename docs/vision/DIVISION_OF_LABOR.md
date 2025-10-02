You just defined clear tool boundaries, which is the hardest architectural decision. Let me trace through what this means:

---

## The Division of Labor

**Rhizome's job:**
1. AI detects chunk-to-chunk connections (semantic, contradiction, thematic bridge)
2. Surface connections while reading (viewport → visible chunks → their connections)
3. Capture synthesis moments (sparks with full context)
4. Support deliberate study (flashcards tied to chunks)
5. Grow threads from connections that matter

**Obsidian's job:**
- Everything else
- Manual bi-directional links
- Arbitrary note structures  
- Long-form writing
- Daily notes, templates, plugins

**The bridge:** Obsidian sync pushes content into Rhizome for connection detection, Rhizome writes metadata back to frontmatter.

---

## What This Architecture Enables

**The core workflow:**

```
Read in Rhizome
  ↓
AI surfaces connection (chunk 47 ↔ chunk 23: contradiction)
  ↓
You annotate: "Pynchon's is systemic, Orwell's is political"
  ↓
Spark hits: "Both assume agency without addressing determinism"
  ↓
Thread grows: "Control narratives and the agency problem"
  ↓
Export to Obsidian: Thread becomes note with links to source chunks
```

**What you're NOT building:**
- Freeform canvas with boxes and arrows
- Mind mapping tool
- General note-taking app
- Replacement for Roam/Notion/Obsidian

**What you ARE building:**
- Collision detector that finds connections you wouldn't see manually
- Reader that surfaces those connections at the right moment
- Capture system for synthesis insights
- Study system tied to the knowledge graph

---

## Implementation Simplifications

Because you're not building a universal graph, you can skip:

**Don't build:**
- Graph visualization UI (nodes, edges, physics simulation)
- Arbitrary entity-to-entity linking
- "Add connection" button for every type
- Complex relationship ontology
- Multi-hop path finding UI

**Do build:**
- Simple list of connections in sidebar
- "Jump to target chunk" navigation
- Connection chains (A→B→C) as sequential reader navigation
- Thread as linear collection of items
- Spark creation as one-button capture

---

## The Obsidian Sync Strategy

**Since Obsidian is your flexible graph and Rhizome is your collision detector:**

**Rhizome → Obsidian:**
```markdown
---
rhizome_id: chunk-47
connections:
  - target: "1984, Chapter 3"
    type: contradiction
    strength: 0.87
    concepts: ["institutional control", "agency"]
annotations:
  - "Pynchon's version is systemic"
sparks_generated: 2
importance: 0.85
---

# Gravity's Rainbow - Part 1

The opening scene introduces...
```

**User in Obsidian:**
- Can manually link to other notes (Obsidian's job)
- Can see Rhizome's detected connections in frontmatter
- Can jump back to Rhizome to explore those connections in reader
- Can create arbitrary structure (folders, tags, MOCs)

**User in Rhizome:**
- Reads with AI-detected connections surfacing
- Can't manually link anything (that's Obsidian's job)
- Captures sparks when insights hit
- Studies with flashcards generated from chunks

This keeps each tool focused.

---

## What "Study" Means in This Architecture

You mentioned study as one of the four purposes. With typed relationships:

**Flashcards tied to chunks:**
```sql
CREATE TABLE flashcards (
  id uuid PRIMARY KEY,
  chunk_id uuid REFERENCES chunks(id),
  front text,  -- Question
  back text,   -- Answer
  related_connection_id uuid REFERENCES connections(id),  -- Optional
  
  -- Spaced repetition
  last_reviewed timestamptz,
  next_review timestamptz,
  ease_factor float,
  interval_days int
)
```

**Study session flow:**
1. System picks due flashcard
2. Shows question
3. After answer reveal, shows source chunk + related connection
4. "This contradiction between Pynchon and Orwell is why this matters"
5. Flashcard isn't isolated - it's embedded in knowledge graph

**This is different from Anki** because:
- Cards are tied to source chunks
- Can review chunk connections during study
- Can jump to reading the full context
- Sparks can become cards automatically

---

## Schema Recap: What You're Actually Building

```sql
-- Foundation: Chunks (from documents)
chunks (id, content, start_offset, end_offset, metadata)

-- AI layer: Connections (3 engines)
connections (source_chunk_id, target_chunk_id, type, strength)

-- User layer: Annotations (enhance chunks)
annotations (chunk_id, position, content, related_connection_id?)

-- Synthesis layer: Sparks (capture moments)
sparks (content, context: {chunks, connections, annotations})

-- Study layer: Flashcards (tied to chunks)
flashcards (chunk_id, front, back, related_connection_id, SRS data)

-- Organization layer: Threads (collections)
threads (title, items: [{type, id}, ...])
```

**That's it.** Six tables. Clear relationships. Each serves the workflow.

---

## What This Means for the Reader

**Sidebar shows:**
- Connections for visible chunks (scored by personal weights)
- Your annotations on visible chunks
- Sparks you created while viewing similar connections
- Flashcards due for review related to visible chunks

**Sidebar does NOT show:**
- Graph visualization
- Full network of all connections
- Entity relationship diagram
- "Add manual connection" UI

**Why:** You have Obsidian for manual linking. Rhizome shows what AI detected and what you captured in context.

---

## The Critical Test (Revisited)

After you build reader + connection detection:

**Success looks like:**
1. You process your library (50 documents)
2. AI finds 2,000+ connections
3. You read one document in Rhizome
4. Sidebar surfaces 5-10 connections for visible chunks
5. One connection surprises you (thematic bridge between literature and tech)
6. You create spark: "Pynchon's paranoia → Zuboff's surveillance capitalism"
7. That spark goes in thread: "Institutional control narratives"
8. Later in Obsidian, you write essay using that thread as outline
9. Essay references chunks from multiple documents
10. You create flashcards to remember key points

**The loop:** Rhizome detects → You read → Sparks capture synthesis → Thread organizes → Obsidian expands → Study reinforces

**What doesn't happen:**
- You don't spend time manually linking things (Obsidian does that)
- You don't build complex ontologies (typed relationships are enough)
- You don't manage a universal graph (focused tool, focused purpose)

---

## Bottom Line

You've defined:
- **Purpose:** AI-powered connection detection for synthesis and study
- **Scope:** Typed relationships (not universal graph)
- **Boundary:** Rhizome for AI collision detection, Obsidian for flexible linking
- **Workflow:** Read → Connect → Annotate → Spark → Thread → Study

This is architecturally sound. The ECS design with typed relationships supports this workflow without over-engineering.

**Next concrete steps:**
1. Finish semantic similarity engine
2. Build basic reader with viewport tracking
3. Build connection sidebar
4. Test on your actual reading: does it help you think?

If connections don't lead to sparks, or sparks don't lead to writing, then the system isn't working. But the architecture supports the test. Ship it and use it.