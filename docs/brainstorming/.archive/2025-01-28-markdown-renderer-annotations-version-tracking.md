# Brainstorming Session: Markdown Renderer, Annotations & Version Tracking

**Date:** 2025-01-28  
**Participants:** User (Topher), Claude (AI Assistant)  
**Session Type:** Architecture Design & Planning

---

## Session Overview

Planning Week 3 implementation: Markdown renderer with annotation system and version tracking infrastructure. Key decision: Build version tracking now vs. later to avoid major refactoring.

---

## Initial Requirements

### User Vision
- **Reader Inspiration:** Readwise Reader + Zotero aesthetic
- **Core Features:**
  - Minimal, beautiful reading experience
  - Feature-rich annotation capabilities:
    - Color-coded highlights
    - Tagging system
    - Note attachments
    - Resizable highlights (complex feature, needs full design)
- **Right Panel Tabs:**
  - Document annotations
  - Connections (future)
  - Study queue
  - Document info (debugging/raw data)

### Technical Context
- **Current Status:** Weeks 1-2 complete (foundation + AI processing pipeline)
- **Tech Stack:** MDX for rendering, Shiki for syntax, KaTeX for math
- **Database:** PostgreSQL with ECS architecture
- **Storage:** Hybrid (files in Supabase Storage, metadata in DB)

---

## Critical Architectural Question

### The Annotation-Chunk Positioning Problem

**Question 1:** How should annotations reference document structure?

#### Analysis of Current Architecture

**Current Design (from ARCHITECTURE.md):**
```typescript
// Annotations reference chunks (chunk-relative positions)
annotation: {
  chunk_id: string,
  start_offset: number,  // Position within chunk
  end_offset: number,
  text_content: string
}
```

**Problem Identified:** Two-layer breakage potential:
1. **Layer 1:** Annotations → Chunks (handled by current design)
2. **Layer 2:** Chunks → Source markdown versions (NOT handled)

If chunks regenerate (document reprocessing, Obsidian edits), annotations break entirely.

---

## Key Insight: File-Over-App Requires Version Tracking

### markdown-sync-versions.md Analysis

**Two Distinct Fuzzy Matching Use Cases:**

1. **YouTube Timestamps (Current T14):**
   - Map cleaned chunks → original source (extract timestamps)
   - Immutable after fetch
   - Different from version tracking needs

2. **Markdown Version Migration (Not Implemented):**
   - Map new chunks → old chunks (annotation survival)
   - Mutable (users edit in Obsidian)
   - Requires version tables, sync detection, migration logic

**Conclusion:** T14 (YouTube fuzzy matching) solves a different problem than markdown version tracking. Both are needed, but for different purposes.

---

## Proposed Architectural Decisions

### Decision 1: Build Version Tracking in Week 3

**Rationale:**

**Cost Comparison:**
- **Build Now:** ~6-8 hours (during initial implementation)
- **Refactor Later:** ~16+ hours + migration risk + potential data loss

**Why Now is Better:**
1. **No existing code to refactor** - Building annotations from scratch
2. **Infrastructure ready** - Fuzzy matching already exists (YouTube work)
3. **Core to philosophy** - File-over-app REQUIRES version tracking
4. **Greenfield advantage** - No users to migrate

**User Argument:** "Why wouldn't we build the file over app version now, wouldn't we avoid a major refactor down the road?"

**Conclusion:** User was correct. Version tracking is foundational, not a "nice-to-have."

### Decision 2: Version-Aware Annotation Schema

```sql
-- New table
CREATE TABLE document_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID REFERENCES documents NOT NULL,
  version_number INTEGER NOT NULL,
  content_hash TEXT NOT NULL,  -- SHA-256 for change detection
  storage_path TEXT NOT NULL,  -- "userId/docId/content-v1.md"
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(document_id, version_number)
);

-- Modify existing tables
ALTER TABLE chunks ADD COLUMN version_id UUID REFERENCES document_versions;
ALTER TABLE documents ADD COLUMN current_version_id UUID REFERENCES document_versions;

-- Indexes
CREATE INDEX idx_chunks_version ON chunks(version_id);
```

**Annotation Component (Version-Aware):**
```typescript
'annotation': {
  // Content
  text: string,
  color: string,
  note?: string,
  
  // Version-aware positioning
  document_id: string,      // For queries
  version_id: string,       // Which version this annotation is for
  start_offset: number,     // Absolute position in version's markdown
  end_offset: number,
  chunk_id: string,         // Hint for current version (denormalized)
  text_content: string      // Original text for fuzzy matching
}
```

---

## Connection Detection & Version Tracking Integration

### The Core Tension

**Problem:** Connection detection relies on chunk embeddings, but version tracking means chunks change over time.

```typescript
// Connections use chunk embeddings
const { data: similar } = await supabase.rpc('match_chunks', {
  query_embedding: chunk.embedding,
  threshold: 0.8
})

// But chunks change across versions
// Version 1: Chunk A (embedding X)
// [User edits markdown]
// Version 2: New chunks (different embeddings)
// Old connections → deleted chunks (BROKEN)
```

### Recommended Hybrid Solution

**Key Insight:** Chunk-level connections are cheap to regenerate (auto-detected). Entity-level connections are expensive to lose (user-curated). Treat differently.

#### Schema Design

```sql
CREATE TABLE connections (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES auth.users NOT NULL,
  
  -- Hybrid referencing (one will be null)
  source_entity_id UUID REFERENCES entities,      -- For user content
  target_entity_id UUID REFERENCES entities,
  source_chunk_id UUID REFERENCES chunks,         -- For auto-detected
  target_chunk_id UUID REFERENCES chunks,
  
  -- Version tracking
  source_version_id UUID REFERENCES document_versions,
  target_version_id UUID REFERENCES document_versions,
  
  connection_type TEXT,
  strength FLOAT,
  confidence FLOAT DEFAULT 1.0,
  
  auto_detected BOOLEAN DEFAULT TRUE,
  user_confirmed BOOLEAN DEFAULT FALSE,
  migrated_from_version INTEGER,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### Connection Types

**1. Auto-Detected Chunk Connections (Version-Bound)**
- Created during processing
- Tied to specific chunk versions
- Regenerated on document update
- Queryable by version (historical view)

**2. User-Curated Entity Connections (Migration-Aware)**
- Link annotations, flashcards, sparks
- Survive document edits
- Entity IDs stable across versions
- Confidence score may decrease after migration

#### Migration Workflow

```typescript
async function handleDocumentUpdate(documentId: string, newContent: string) {
  // 1. Create new version
  const newVersionId = await createNewVersion(documentId, newContent)
  
  // 2. Generate new chunks
  const newChunks = await rechunkMarkdown(newContent)
  await saveChunks(newChunks, documentId, newVersionId)
  
  // 3. Migrate annotations (fuzzy matching)
  const migrationResults = await migrateAnnotations(oldVersion, newVersionId)
  
  // 4. Update entity-level connections with confidence scores
  await updateConnectionConfidence(migrationResults)
  
  // 5. Re-detect chunk-level connections for new version
  await detectChunkConnections(newChunks, newVersionId)
  
  // 6. Mark old chunk connections as historical
  await markConnectionsAsHistorical(oldVersion.id)
}
```

### UI Patterns for Versioned Connections

**Right Panel - Connections Tab:**
- **Active Connections:** Current version + entity-level (always shown)
- **Historical Connections:** Previous version chunk connections (collapsed)
- **Low-Confidence Alert:** Migrations with confidence <0.7 need review

**Example:**
```
Active Connections (12)
├─ Your annotation: "Marx's theory" → Chapter 3 (confidence: 1.0)
└─ Similar argument in Section 2 (confidence: 0.92)

Previous Connections (5) [collapsed]
└─ Connected before your edit (v1)

⚠️ 2 connections may need review after recent edits [Review]
```

---

## Implementation Timeline

### Week 3 Scope (Updated)

**Original tasks:**
- Markdown renderer with MDX
- Virtual scrolling for chunks
- Text selection system
- Annotation toolbar (highlight/note)
- Right panel (connections/notes tabs)
- Annotation persistence with ECS

**Additional tasks:**
- Document version tracking (+6 hours)
- Annotation migration logic (+2 hours)
- Connections schema foundation (no active detection yet)

**Total increase:** ~8 hours (~1 day)

### Phased Implementation

**Week 3:** Version tracking + Annotations foundation
- Schema with version_id columns
- Version creation on content changes
- Annotation migration using fuzzy matching
- Basic annotation UI

**Week 4:** Study system
- No connection detection yet
- Focus on flashcard creation and FSRS

**Phase 2 (Future):** Full Synthesis
- Auto-detected chunk-to-chunk connections
- Entity-level user-curated connections
- Historical connection views
- Connection confidence scoring

---

## Key Technical Decisions

### 1. Position Strategy: Document-Absolute vs Version-Absolute

**Decision:** Version-absolute positions

**Rationale:**
- Annotations reference specific version + offset
- Survives chunk regeneration immediately
- Enables historical annotation views
- Foundation for file-over-app philosophy

### 2. Fuzzy Matching Reuse

**Decision:** Reuse existing fuzzy-matching.ts infrastructure from YouTube work

**Implementation:**
```typescript
// Same algorithm, different use case
async function migrateAnnotations(oldVersionId, newVersionId, newContent) {
  const annotations = await getAnnotationsForVersion(oldVersionId)
  const oldContent = await fetchVersionContent(oldVersionId)
  
  for (const ann of annotations) {
    const originalText = oldContent.substring(ann.start_offset, ann.end_offset)
    
    // Reuse fuzzyMatchChunkToSource from YouTube implementation
    const match = fuzzyMatchChunkToSource(originalText, newContent)
    
    if (match.confidence >= 0.7) {
      await createMigratedAnnotation(ann, newVersionId, match)
    } else {
      await flagForManualReview(ann.id, match.confidence)
    }
  }
}
```

### 3. Storage Pattern: Versioned Files

**Decision:** Store each version as separate file

**Pattern:**
```
userId/documentId/
├── source.pdf              # Original upload (immutable)
├── source-raw.txt          # YouTube: original with timestamps
├── content-v1.md           # Version 1 (initial processing)
├── content-v2.md           # Version 2 (after Obsidian edit)
├── content-v3.md           # Version 3 (subsequent edits)
└── content.md              # Symlink/latest (current version)
```

### 4. Change Detection: Hash-Based

**Decision:** Use SHA-256 content hashing

```typescript
async function detectContentChange(documentId: string, newContent: string) {
  const currentVersion = await getCurrentVersion(documentId)
  const currentHash = currentVersion.content_hash
  const newHash = await crypto.subtle.digest('SHA-256', newContent)
  
  if (currentHash === newHash) return null // No change
  
  return createNewVersion(documentId, newContent, newHash)
}
```

---

## Performance Considerations

### Connection Detection Cost

**Per Document Version:**
- 100 chunks × 10-50ms search = 2-5 seconds total

**Optimization Strategies:**
1. **Incremental detection:** Only for new/changed chunks
2. **Background processing:** Queue as async job
3. **Caching:** Store top-K connections per chunk
4. **Threshold tuning:** Higher similarity = fewer connections

### Migration Cost

**Per Annotation:**
- Fuzzy matching: <100ms average (from YouTube testing)
- 100 annotations: <10 seconds total

**Acceptable for:**
- Interactive edits (user waits)
- Background sync (no user waiting)

---

## Open Questions & Future Considerations

### Resizable Highlights (Complex Feature)

**Status:** Deferred to separate task after basic annotations work

**Requirements:**
- Adjust highlight boundaries after creation
- Maintain text selection integrity
- Update offsets in real-time
- Handle edge cases (crossing chunk boundaries)

**Design Needed:**
- UI interaction pattern (drag handles?)
- Validation logic (prevent invalid selections)
- Undo/redo support

### MDX Component Architecture

**Question:** How to render annotations as overlays on MDX content?

**Potential Approaches:**
1. **Wrapper Components:** Inject highlight spans during rendering
2. **Overlay Layer:** Separate annotation layer on top of rendered content
3. **Hybrid:** Base content + positioned overlays

**Decision Deferred:** Will evaluate during implementation based on rendering performance and DX.

---

## Success Criteria

### Week 3 Deliverables

**Must Have:**
- ✅ Document version tracking (schema + creation logic)
- ✅ Version-aware annotation schema
- ✅ Annotation migration using fuzzy matching
- ✅ Basic annotation UI (highlight + note)
- ✅ Right panel with annotations tab
- ✅ Text selection handler

**Should Have:**
- ✅ Change detection (hash-based)
- ✅ Versioned file storage pattern
- ✅ Migration confidence scoring

**Nice to Have:**
- ⏸️ Historical version viewer
- ⏸️ Low-confidence annotation review UI
- ⏸️ Annotation color picker

---

## References

### Related Documents
- `docs/ARCHITECTURE.md` - Overall system design
- `docs/todo/markdown-sync-versions.md` - Version tracking analysis
- `worker/lib/fuzzy-matching.ts` - Reusable positioning algorithm
- `worker/lib/youtube-cleaning.ts` - Similar migration patterns

### Key Insights
1. **File-over-app requires version tracking** - Not optional for core philosophy
2. **Build foundations early** - Cheaper than refactoring later
3. **Reuse existing infrastructure** - Fuzzy matching already validated
4. **Separate connection types** - Auto-detected vs user-curated need different handling

---

## Next Steps

1. **Start new discussion** - Continue with MDX rendering and annotation UI specifics
2. **Schema migration** - Write migration 013 for version tracking tables
3. **Version creation logic** - Implement hash-based change detection
4. **Annotation migration** - Adapt fuzzy matching for annotation positioning
5. **UI implementation** - MDX renderer + annotation overlays

---

**Session Duration:** ~45 minutes  
**Outcome:** Clear architectural direction for version-aware annotation system with connection detection integration strategy

---

*This brainstorming session established the foundational architecture for Week 3 implementation, resolving the key tension between version tracking complexity and file-over-app requirements. The decision to build version tracking now rather than later avoids major refactoring and enables true file ownership.*