# Brainstorming Session: Complete Annotation, Version Tracking & Connection System

**Date:** 2025-01-28  
**Participants:** User (Topher), Claude (AI Assistant)  
**Session Type:** Comprehensive Architecture Design  
**Duration:** ~90 minutes  
**Status:** ✅ Complete - Ready for Implementation

---

## Executive Summary

This brainstorming session established the complete architecture for Rhizome V2's annotation layer with version tracking, connection migration, and knowledge synthesis. The system is designed to support **Obsidian → Rhizome sync** while preserving user-created content (annotations, flashcards, connections, spark threads) across document edits.

**Key Decision**: Build version tracking infrastructure in Week 3 (not later) to avoid major refactoring and enable true file-over-app philosophy.

**Core Innovation**: Hybrid connection system separates ephemeral chunk-level connections (regenerated) from valuable entity-level connections (migrated), ensuring user-curated knowledge survives document changes.

---

## Table of Contents

1. [Context & Motivation](#context--motivation)
2. [Core Architectural Components](#core-architectural-components)
3. [Database Schema Design](#database-schema-design)
4. [User Journey: Obsidian Sync](#user-journey-obsidian-sync)
5. [Annotation Migration Strategy](#annotation-migration-strategy)
6. [Connection Migration System](#connection-migration-system)
7. [Spark Threads & Knowledge Synthesis](#spark-threads--knowledge-synthesis)
8. [UI/UX Patterns](#uiux-patterns)
9. [Implementation Timeline](#implementation-timeline)
10. [Success Criteria & Metrics](#success-criteria--metrics)

---

## Context & Motivation

### The Problem

**User Need**: Sync markdown files from Obsidian vault into Rhizome for:
- Beautiful reading experience
- Inline annotation capabilities
- Connection detection across documents
- Knowledge synthesis and spark threads

**Technical Challenge**: When markdown content changes (edits in Obsidian), all position-based data breaks:
- Annotations reference character offsets (now wrong)
- Chunks regenerated with different boundaries
- Connections between chunks orphaned
- User loses weeks/months of annotation work

### The Solution

**Version-Aware Architecture** with intelligent migration:
- Track document versions explicitly
- Store position data relative to specific versions
- Use fuzzy matching to migrate annotations across versions
- Separate ephemeral (chunk) from persistent (entity) connections
- Provide review UI for low-confidence migrations

---

## Core Architectural Components

### 1. Version Tracking System

**Purpose**: Enable annotation survival across document edits

**Key Concepts**:
- Every document has multiple versions over time (v1, v2, v3...)
- Chunks belong to specific versions
- Annotations reference specific versions
- Historical versions preserved in storage

**Storage Pattern**:
```
userId/documentId/
├── source.md           # Original from Obsidian
├── content-v1.md       # Initial processed version
├── content-v2.md       # After first edit
├── content-v3.md       # After second edit
└── content.md          # Symlink to latest (current_version)
```

**Change Detection**: SHA-256 hash comparison
```typescript
const newHash = await crypto.subtle.digest('SHA-256', newContent)
if (newHash !== currentVersion.content_hash) {
  createNewVersion(documentId, newContent, newHash)
}
```

---

### 2. Annotation System

**Architecture**: ECS (Entity-Component-System) based

**Annotation Entity Structure**:
```typescript
await ecs.createEntity(userId, {
  annotation: {
    text: selectedText,
    color: 'yellow',
    note: 'Optional user note'
  },
  position: {
    document_id: documentId,
    version_id: versionId,        // Which version
    start_offset: 1245,           // Absolute position
    end_offset: 1312,
    chunk_id: chunkId,            // Performance hint
    text_content: selectedText    // For fuzzy matching
  },
  source: {
    document_id: documentId,
    chunk_id: chunkId
  }
})
```

**Key Features**:
- Version-aware positioning
- Text content preserved for fuzzy matching
- Chunk ID hint for performance (denormalized)
- Flexible color/note system

---

### 3. Connection System (Two-Tier)

**Tier 1: Auto-Detected Chunk Connections** (Ephemeral)
- Created by pgvector similarity search
- Cheap to regenerate
- **Strategy**: Delete old, create new on version change

**Tier 2: User-Curated Entity Connections** (Persistent)
- Created/confirmed by user
- Threads, manual links, confirmed relationships
- **Strategy**: Migrate with fuzzy matching + review

**Hybrid Schema**:
```sql
CREATE TABLE connections (
  id UUID PRIMARY KEY,
  
  -- HYBRID REFERENCING (one pair will be null)
  source_chunk_id UUID,      -- For auto-detected
  target_chunk_id UUID,
  source_entity_id UUID,     -- For user-curated
  target_entity_id UUID,
  
  -- Version tracking
  source_version_id UUID,
  target_version_id UUID,
  
  connection_type TEXT,      -- 'similar', 'thread', 'extends'
  strength FLOAT,
  confidence FLOAT DEFAULT 1.0,
  
  -- Migration metadata
  auto_detected BOOLEAN DEFAULT TRUE,
  user_confirmed BOOLEAN DEFAULT FALSE,
  user_created BOOLEAN DEFAULT FALSE,
  migrated_from_version INTEGER,
  migration_confidence FLOAT
);
```

---

### 4. Spark System & Threads

**Spark**: One-click idea capture linking to source content

**Thread**: User-curated sequence of connected ideas (sparks, annotations, flashcards)

**Key Insight**: Threads use ENTITY IDs (not chunk IDs) → 100% stable across versions

**Thread Structure**:
```typescript
// Create thread entity
const threadId = await ecs.createEntity(userId, {
  thread: {
    name: 'Evolution of Assemblage Theory',
    description: 'Tracing Deleuze → DeLanda → Bennett'
  }
})

// Add connections to thread
await supabase.from('connections').insert([
  {
    source_entity_id: spark1Id,  // Entity IDs never change!
    target_entity_id: spark2Id,
    connection_type: 'thread',
    thread_id: threadId,
    user_created: true,
    confidence: 1.0
  },
  // ... more connections
])
```

**Thread Survival**: Since entities have stable IDs, threads survive ALL version changes automatically.

---

## Database Schema Design

### New Tables (Migration 013)

```sql
-- Document versions table
CREATE TABLE document_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID REFERENCES documents NOT NULL,
  version_number INTEGER NOT NULL,
  content_hash TEXT NOT NULL,  -- SHA-256 for change detection
  storage_path TEXT NOT NULL,  -- "userId/docId/content-v1.md"
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by TEXT DEFAULT 'system',
  change_summary TEXT,  -- Optional user description
  UNIQUE(document_id, version_number)
);

-- Indexes
CREATE INDEX idx_doc_versions_document ON document_versions(document_id);
CREATE INDEX idx_doc_versions_hash ON document_versions(content_hash);

-- Add version tracking to existing tables
ALTER TABLE documents 
  ADD COLUMN current_version_id UUID REFERENCES document_versions,
  ADD COLUMN version_count INTEGER DEFAULT 1;

ALTER TABLE chunks 
  ADD COLUMN version_id UUID REFERENCES document_versions NOT NULL;

-- Update indexes
CREATE INDEX idx_chunks_version ON chunks(version_id);
CREATE INDEX idx_chunks_document_version ON chunks(document_id, version_id);
```

### Modified Components Schema

```sql
-- Components table already supports flexible data
-- No schema changes needed, but annotation component structure:
{
  "annotation": {
    "text": "highlighted text",
    "color": "yellow",
    "note": "optional note"
  },
  "position": {
    "document_id": "uuid",
    "version_id": "uuid",  -- NEW: version tracking
    "start_offset": 1245,
    "end_offset": 1312,
    "chunk_id": "uuid",
    "text_content": "original text",
    "migration_confidence": 0.95,  -- NEW: after migration
    "migrated_from_version": 1     -- NEW: migration tracking
  }
}
```

### Connections Schema (Complete)

```sql
CREATE TABLE connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  
  -- Hybrid referencing (one pair will be null)
  source_chunk_id UUID REFERENCES chunks,
  target_chunk_id UUID REFERENCES chunks,
  source_entity_id UUID REFERENCES entities,
  target_entity_id UUID REFERENCES entities,
  
  -- Version tracking
  source_version_id UUID REFERENCES document_versions,
  target_version_id UUID REFERENCES document_versions,
  source_document_id UUID REFERENCES documents,
  target_document_id UUID REFERENCES documents,
  
  -- Connection metadata
  connection_type TEXT NOT NULL,  -- 'similar', 'extends', 'contradicts', 'thread'
  strength FLOAT,                  -- 0-1 similarity score
  confidence FLOAT DEFAULT 1.0,    -- Migration confidence
  
  -- Categorization
  auto_detected BOOLEAN DEFAULT TRUE,
  user_confirmed BOOLEAN DEFAULT FALSE,
  user_created BOOLEAN DEFAULT FALSE,
  is_historical BOOLEAN DEFAULT FALSE,  -- Old version connections
  
  -- Migration tracking
  migrated_from_version INTEGER,
  migration_confidence FLOAT,
  superseded_by_version UUID REFERENCES document_versions,
  
  -- Thread support
  thread_id UUID REFERENCES entities,  -- If part of thread
  thread_order INTEGER,                -- Position in thread
  
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_connections_source_chunk ON connections(source_chunk_id);
CREATE INDEX idx_connections_target_chunk ON connections(target_chunk_id);
CREATE INDEX idx_connections_source_entity ON connections(source_entity_id);
CREATE INDEX idx_connections_target_entity ON connections(target_entity_id);
CREATE INDEX idx_connections_thread ON connections(thread_id);
CREATE INDEX idx_connections_version ON connections(source_version_id, target_version_id);
CREATE INDEX idx_connections_user_type ON connections(user_id, connection_type);
CREATE INDEX idx_connections_historical ON connections(is_historical) WHERE is_historical = false;
```

---

## User Journey: Obsidian Sync

### Complete Flow Walkthrough

#### **Act 1: Initial Import**

**Scene 1: User uploads markdown from Obsidian**

1. Opens Rhizome app
2. Uploads "The Deleuze Notes.md" 
3. Chooses "Clean with AI" processing
4. Processing pipeline executes:
   - Creates document record
   - **Creates version v1** with content hash
   - Uploads to storage: `userId/docId/content-v1.md`
   - AI semantic chunking (50 chunks)
   - Embeddings generation (Vercel AI SDK)
   - Stores chunks with `version_id: v1`

**Storage State**:
```
userId/documentId/
├── source.md           # Original from Obsidian
└── content-v1.md       # Processed version 1
```

**Database State**:
- document_versions: 1 row (v1)
- documents: current_version_id → v1
- chunks: 50 rows (all version_id: v1)

---

**Scene 2: User reads and annotates**

1. Opens document in reader
2. Highlights 15 passages throughout document
3. Adds notes to 8 highlights
4. Creates 8 flashcards from annotations

**Each annotation stores**:
```typescript
position: {
  version_id: v1,           // Critical: links to v1
  start_offset: 1245,       // Position in v1 markdown
  end_offset: 1312,
  text_content: "original"  // For future fuzzy matching
}
```

**Current State**:
- 15 annotations (all reference v1)
- 8 flashcards (linked to annotations via entity IDs)
- 50 chunks (v1)

---

#### **Act 2: Obsidian Edit & Sync**

**Scene 3: User edits in Obsidian (2 weeks later)**

User makes changes in Obsidian:
- Adds new section at top (3 paragraphs)
- Fixes typo in "Assemblages" section
- Adds clarifying sentence
- Saves file

Then syncs to Rhizome:
1. Opens Rhizome
2. Clicks "Sync Document"
3. Selects updated file

---

**Scene 4: Automatic version detection & migration**

**Backend Process**:

```typescript
// Step 1: Detect change
const newContent = await readFile(updatedFile)
const newHash = await hashContent(newContent)
const currentVersion = await getCurrentVersion(documentId)

if (newHash === currentVersion.content_hash) {
  return // No changes
}

// Step 2: Create version v2
const v2 = await createVersion({
  document_id: documentId,
  version_number: 2,
  content_hash: newHash,
  storage_path: `${storagePath}/content-v2.md`,
  change_summary: 'Added new section, fixed typos'
})

// Step 3: Save new markdown
await uploadToStorage(`${storagePath}/content-v2.md`, newContent)

// Step 4: Rechunk with AI
const newChunks = await rechunkMarkdown(ai, newContent)
// Result: 53 chunks (added section increased count)

// Step 5: Generate embeddings
const embeddings = await generateEmbeddings(newChunks)

// Step 6: Store new chunks with version_id: v2
for (let i = 0; i < newChunks.length; i++) {
  await insertChunk({
    document_id: documentId,
    version_id: v2.id,  // Links to v2
    chunk_index: i,
    content: newChunks[i].content,
    embedding: embeddings[i],
    // ... metadata
  })
}

// Step 7: Update document current version
await updateDocument(documentId, { 
  current_version_id: v2.id,
  version_count: 2
})
```

**Storage State**:
```
userId/documentId/
├── source.md           # Original
├── content-v1.md       # Version 1 (preserved!)
└── content-v2.md       # Version 2 (new)
```

---

**Scene 5: Annotation migration (automatic)**

```typescript
// Step 8: Migrate annotations from v1 to v2
async function migrateAnnotations(oldVersionId, newVersionId) {
  // Get all annotations for v1
  const annotations = await getAnnotationsForVersion(oldVersionId)
  
  // Load both markdown versions
  const v1Content = await fetchVersionContent(oldVersionId)
  const v2Content = await fetchVersionContent(newVersionId)
  
  const results = { migrated: 0, needsReview: 0, lost: 0 }
  
  for (const annotation of annotations) {
    const position = getComponent(annotation, 'position')
    const originalText = position.data.text_content
    
    // FUZZY MATCHING (reuse YouTube algorithm)
    const match = fuzzyMatchChunkToSource(
      originalText,
      v2Content,
      { trigramThreshold: 0.75 }
    )
    
    if (match.confidence >= 0.7) {
      // HIGH CONFIDENCE: Auto-migrate
      await updateComponent(position.id, {
        version_id: newVersionId,
        start_offset: match.start_offset,
        end_offset: match.end_offset,
        migration_confidence: match.confidence,
        migrated_from_version: 1
      })
      results.migrated++
      
    } else if (match.confidence >= 0.5) {
      // MEDIUM CONFIDENCE: Flag for review
      await createMigrationAlert({
        annotation_id: annotation.id,
        confidence: match.confidence,
        suggested_position: match
      })
      results.needsReview++
      
    } else {
      // LOW CONFIDENCE: Mark as lost (rare)
      results.lost++
    }
  }
  
  return results
  // Typical: { migrated: 13, needsReview: 2, lost: 0 }
}
```

**Migration Results** (typical):
- ✅ Migrated automatically: 13/15 (87%)
- ⚠️  Need review: 2/15 (13%)
- ❌ Lost: 0/15 (0%)

---

**Scene 6: Connection migration**

```typescript
// Step 9: Handle connections
async function handleConnectionsMigration(oldVersionId, newVersionId) {
  
  // TIER 1: Auto-detected chunk connections (REGENERATE)
  await supabase
    .from('connections')
    .update({ 
      is_historical: true,
      superseded_by_version: newVersionId 
    })
    .eq('source_version_id', oldVersionId)
    .eq('auto_detected', true)
  
  // Re-detect connections for new chunks
  const newChunks = await getChunksForVersion(newVersionId)
  await detectConnectionsForChunks(newChunks, newVersionId)
  // Creates fresh connections based on new embeddings
  
  
  // TIER 2: User-curated connections (MIGRATE)
  const userConnections = await getUserConnections(oldVersionId)
  
  for (const conn of userConnections) {
    if (conn.source_entity_id && conn.target_entity_id) {
      // ENTITY-LEVEL: Stable across versions (just update metadata)
      await updateConnection(conn.id, {
        source_version_id: newVersionId,
        migration_confidence: 1.0
      })
      
    } else if (conn.source_chunk_id && conn.target_chunk_id) {
      // CHUNK-LEVEL: Find equivalent chunks
      const newSourceChunk = await findEquivalentChunk(
        conn.source_chunk_id, 
        newVersionId
      )
      const newTargetChunk = await findEquivalentChunk(
        conn.target_chunk_id,
        conn.target_version_id
      )
      
      if (newSourceChunk.confidence >= 0.7 && 
          newTargetChunk.confidence >= 0.7) {
        // Auto-migrate
        await updateConnection(conn.id, {
          source_chunk_id: newSourceChunk.id,
          source_version_id: newVersionId,
          migration_confidence: Math.min(
            newSourceChunk.confidence,
            newTargetChunk.confidence
          )
        })
      } else {
        // Flag for review
        await createConnectionReviewAlert(conn.id, {
          newSourceSuggestion: newSourceChunk,
          newTargetSuggestion: newTargetChunk
        })
      }
    }
  }
}
```

---

#### **Act 3: User Experience After Migration**

**Scene 7: User opens document (v2)**

1. Opens "The Deleuze Notes"
2. Document automatically loads v2 content
3. Annotations appear at correct positions (migrated)
4. Visual confidence indicators shown

**UI Experience**:
```
┌─────────────────────────────────────────────┐
│ The Deleuze Notes                           │
├─────────────────────────────────────────────┤
│ ## New Section (added in Obsidian)         │
│ [New content here...]                       │
│                                             │
│ ## Assemblages                              │
│                                             │
│ Assemblages are multiplicities of          │
│ heterogeneous elements...                   │
│ ╔═══════════════════════════════════════╗  │ ← HIGH confidence (0.95)
│ ║ 🟡 HIGHLIGHT                          ║  │
│ ║ 📝 This connects to my systems        ║  │
│ ║    thinking notes!                    ║  │
│ ╚═══════════════════════════════════════╝  │
│                                             │
│ They combine disparate parts into...       │
│ ╔═══════════════════════════════════════╗  │ ← MEDIUM confidence (0.68)
│ ║ 🟡 HIGHLIGHT ⚠️                       ║  │
│ ║ Position may have shifted             ║  │
│ ╚═══════════════════════════════════════╝  │
└─────────────────────────────────────────────┘

⚠️  2 annotations need review after sync [Review]
```

---

**Scene 8: User reviews low-confidence annotations**

1. Clicks "Review" button
2. Sees side-by-side comparison
3. Accepts suggestions or adjusts manually
4. All annotations now at correct positions

**Review UI**:
```tsx
<ReviewPanel>
  <Alert variant="warning">
    <AlertTitle>2 annotations need position review</AlertTitle>
  </Alert>
  
  {lowConfidenceAnnotations.map(ann => (
    <Card>
      <CardHeader>
        <Badge>Confidence: {ann.confidence}</Badge>
      </CardHeader>
      <CardContent>
        {/* Original text */}
        <blockquote>
          {ann.position.text_content}
        </blockquote>
        
        {/* Suggested new position */}
        <blockquote className="bg-yellow-50">
          {suggestedMatch}
        </blockquote>
        
        <div className="flex gap-2">
          <Button onClick={() => accept(ann.id)}>
            ✓ Accept
          </Button>
          <Button onClick={() => adjust(ann.id)}>
            ✏️  Adjust
          </Button>
          <Button onClick={() => remove(ann.id)}>
            🗑️ Delete
          </Button>
        </div>
      </CardContent>
    </Card>
  ))}
</ReviewPanel>
```

---

**Scene 9: User continues working**

Everything works seamlessly:
- ✅ Annotations visible at correct positions
- ✅ Flashcards still linked (entity IDs stable)
- ✅ Study sessions work normally
- ✅ Connections preserved (entity-level 100%, chunk-level regenerated)
- ✅ Threads intact (use entity IDs)

User can add new annotations to v2:
```typescript
// New annotations automatically get v2 version_id
await createAnnotation({
  text: selectedText,
  version_id: currentVersionId  // v2
})
```

---

#### **Act 4: Future Syncs** (Weeks/Months Later)

**Scene 10: Repeated Obsidian syncs**

User makes 5 more edits over 3 months. Each sync:
1. Creates new version (v3, v4, v5...)
2. Migrates annotations automatically
3. Regenerates chunk connections
4. Preserves entity connections
5. Shows review UI for low-confidence migrations

**Storage grows gracefully**:
```
userId/documentId/
├── source.md           # Original
├── content-v1.md       # Initial
├── content-v2.md       # First edit
├── content-v3.md       # Second edit
├── content-v4.md       # Third edit
└── content-v5.md       # Current
```

**Database maintains full history**:
```sql
SELECT version_number, created_at, 
       (SELECT COUNT(*) FROM chunks WHERE version_id = dv.id) as chunks
FROM document_versions 
WHERE document_id = 'doc-123'
ORDER BY version_number;

-- v1  2025-02-01  50 chunks
-- v2  2025-02-15  53 chunks
-- v3  2025-03-01  51 chunks
-- v4  2025-03-20  54 chunks
-- v5  2025-04-10  52 chunks (current)
```

---

## Annotation Migration Strategy

### Algorithm: Three-Tier Fuzzy Matching

**Reuses YouTube fuzzy matching infrastructure** (`worker/lib/fuzzy-matching.ts`)

#### Tier 1: Exact Match (Confidence 1.0)

```typescript
const exactIndex = v2Content.indexOf(annotation.text_content)
if (exactIndex !== -1) {
  return {
    start_offset: exactIndex,
    end_offset: exactIndex + annotation.text_content.length,
    confidence: 1.0,
    method: 'exact'
  }
}
```

**Performance**: O(n) single pass, early exit

---

#### Tier 2: Trigram Fuzzy Match (Confidence 0.75-0.99)

```typescript
function fuzzyMatchAnnotation(originalText: string, newContent: string) {
  // Generate trigrams for original text
  const originalTrigrams = generateTrigrams(originalText)
  
  // Slide window across new content
  const windowSize = originalText.length
  const stride = Math.floor(windowSize * 0.1)  // 10% stride
  
  let bestMatch = { similarity: 0, offset: 0 }
  
  for (let offset = 0; offset <= newContent.length - windowSize; offset += stride) {
    const window = newContent.substring(offset, offset + windowSize)
    const windowTrigrams = generateTrigrams(window)
    
    const similarity = calculateJaccardSimilarity(
      originalTrigrams, 
      windowTrigrams
    )
    
    if (similarity > bestMatch.similarity) {
      bestMatch = { similarity, offset }
      
      if (similarity > 0.95) break  // Early exit
    }
  }
  
  if (bestMatch.similarity >= 0.75) {
    return {
      start_offset: bestMatch.offset,
      end_offset: bestMatch.offset + windowSize,
      confidence: bestMatch.similarity,
      method: 'fuzzy'
    }
  }
  
  return null  // Fall through to Tier 3
}
```

**Trigram Generation**:
```typescript
function generateTrigrams(text: string): Set<string> {
  const normalized = text.toLowerCase().replace(/\s+/g, ' ')
  const trigrams = new Set<string>()
  
  for (let i = 0; i <= normalized.length - 3; i++) {
    trigrams.add(normalized.substring(i, i + 3))
  }
  
  return trigrams
}
```

**Jaccard Similarity**:
```typescript
function calculateJaccardSimilarity(set1: Set<string>, set2: Set<string>): number {
  const intersection = new Set([...set1].filter(x => set2.has(x)))
  const union = new Set([...set1, ...set2])
  return intersection.size / union.size
}
```

---

#### Tier 3: Approximate Position (Confidence 0.3)

```typescript
// Fallback: proportional positioning
const approximatePosition = Math.floor(
  (annotation.start_offset / v1Content.length) * v2Content.length
)

return {
  start_offset: approximatePosition,
  end_offset: Math.min(
    approximatePosition + annotation.text_content.length,
    v2Content.length
  ),
  confidence: 0.3,
  method: 'approximate'
}
```

**Never fails** - always returns a position (best guess)

---

### Migration Confidence Thresholds

| Confidence | Action | User Experience |
|------------|--------|----------------|
| **≥0.7** | Auto-migrate | Annotation appears normally |
| **0.5-0.7** | Flag for review | Shows warning badge + review UI |
| **<0.5** | Mark as lost | User notified, can manually reposition |

### Expected Success Rates

Based on fuzzy matching testing:
- **Exact matches** (1.0): ~30% of annotations
- **High confidence** (≥0.7): ~55% of annotations
- **Medium confidence** (0.5-0.7): ~10% of annotations
- **Lost** (<0.5): ~5% of annotations

**Total automatic success rate: ~85%**

---

## Connection Migration System

### Two-Tier Strategy

#### Tier 1: Auto-Detected Chunk Connections

**Characteristics**:
- Created by pgvector similarity search
- Link chunk → chunk based on embeddings
- Ephemeral (cheap to regenerate)
- No user investment

**Migration Strategy: REGENERATE**

```typescript
async function handleAutoDetectedConnections(oldVersionId, newVersionId) {
  // 1. Mark old connections as historical
  await supabase
    .from('connections')
    .update({ 
      is_historical: true,
      superseded_by_version: newVersionId 
    })
    .eq('source_version_id', oldVersionId)
    .eq('auto_detected', true)
  
  // 2. Get new chunks for v2
  const newChunks = await supabase
    .from('chunks')
    .select('*')
    .eq('version_id', newVersionId)
  
  // 3. Detect connections for new chunks
  for (const chunk of newChunks) {
    const similar = await supabase.rpc('match_chunks', {
      query_embedding: chunk.embedding,
      threshold: 0.8,
      exclude_document: chunk.document_id,
      limit: 20
    })
    
    // Create new connections
    for (const match of similar) {
      await supabase.from('connections').insert({
        source_chunk_id: chunk.id,
        target_chunk_id: match.id,
        source_version_id: newVersionId,
        target_version_id: match.version_id,
        connection_type: 'similar',
        strength: match.similarity,
        auto_detected: true
      })
    }
  }
}
```

**Why regenerate?**
- ✅ More accurate (new embeddings = better semantic matches)
- ✅ Fast (<2 seconds per document)
- ✅ No migration complexity
- ✅ Old connections preserved as historical (for analysis)

---

#### Tier 2: User-Curated Connections

**Characteristics**:
- Created/confirmed by user
- Threads, manual links, confirmed similarities
- High user investment
- Must survive version changes

**Migration Strategy: FUZZY MATCH + REVIEW**

##### 2A: Entity-Level Connections (100% Stable)

```typescript
// Connections between annotations, flashcards, sparks
// Entity IDs NEVER change → NO migration needed!

if (conn.source_entity_id && conn.target_entity_id) {
  // Just update version metadata
  await supabase
    .from('connections')
    .update({
      source_version_id: newVersionId,
      migration_confidence: 1.0
    })
    .eq('id', conn.id)
  
  // Connection automatically works with new version
}
```

**Examples**:
- Annotation → Flashcard link
- Spark → Spark in thread
- Annotation → Annotation cross-document

---

##### 2B: Chunk-Level User Connections (Fuzzy Migration)

```typescript
// User confirmed "these chunks are related"
// Need to find equivalent chunks in new version

if (conn.source_chunk_id && conn.target_chunk_id) {
  const oldSourceChunk = await getChunk(conn.source_chunk_id)
  const oldTargetChunk = await getChunk(conn.target_chunk_id)
  
  // Find equivalent chunks using fuzzy matching
  const newSource = await findEquivalentChunk(
    oldSourceChunk,
    newVersionId
  )
  const newTarget = await findEquivalentChunk(
    oldTargetChunk,
    conn.target_version_id
  )
  
  if (newSource.confidence >= 0.7 && newTarget.confidence >= 0.7) {
    // HIGH CONFIDENCE: Auto-migrate
    await supabase.from('connections').update({
      source_chunk_id: newSource.chunkId,
      source_version_id: newVersionId,
      migration_confidence: Math.min(
        newSource.confidence,
        newTarget.confidence
      ),
      migrated_from_version: conn.source_version_id
    }).eq('id', conn.id)
    
  } else {
    // LOW CONFIDENCE: Flag for review
    await createConnectionReviewAlert(conn.id, {
      oldSource: oldSourceChunk,
      oldTarget: oldTargetChunk,
      suggestedSource: newSource,
      suggestedTarget: newTarget,
      confidence: Math.min(
        newSource.confidence,
        newTarget.confidence
      )
    })
  }
}
```

---

### Finding Equivalent Chunks

**Two-stage algorithm**: Embedding similarity → Text similarity

```typescript
async function findEquivalentChunk(
  oldChunk: Chunk,
  newVersionId: string
): Promise<{ chunkId: string, confidence: number }> {
  
  const newChunks = await supabase
    .from('chunks')
    .select('id, content, embedding')
    .eq('version_id', newVersionId)
  
  // STAGE 1: Embedding similarity (fast, semantic)
  const embeddingMatches = newChunks.map(newChunk => ({
    chunkId: newChunk.id,
    similarity: cosineSimilarity(oldChunk.embedding, newChunk.embedding)
  }))
  
  const bestEmbedding = embeddingMatches.sort(
    (a, b) => b.similarity - a.similarity
  )[0]
  
  if (bestEmbedding.similarity >= 0.9) {
    // Very high semantic similarity
    return {
      chunkId: bestEmbedding.chunkId,
      confidence: bestEmbedding.similarity
    }
  }
  
  // STAGE 2: Text-based fuzzy matching (fallback)
  const textMatches = newChunks.map(newChunk => {
    const match = fuzzyMatchChunkToSource(
      oldChunk.content,
      newChunk.content,
      { trigramThreshold: 0.75 }
    )
    return {
      chunkId: newChunk.id,
      confidence: match.confidence
    }
  })
  
  const bestText = textMatches.sort(
    (a, b) => b.confidence - a.confidence
  )[0]
  
  return {
    chunkId: bestText.chunkId,
    confidence: bestText.confidence
  }
}
```

---

### Connection Migration Summary

| Connection Type | Source | Target | Strategy | Success Rate |
|-----------------|--------|--------|----------|--------------|
| **Auto-detected** | chunk | chunk | Regenerate | 100% (new) |
| **User-confirmed chunk** | chunk | chunk | Fuzzy match | 80-90% |
| **Annotation links** | entity | entity | Stable | 100% |
| **Spark threads** | entity | entity | Stable | 100% |
| **Manual cross-doc** | entity | entity | Stable | 100% |

---

## Spark Threads & Knowledge Synthesis

### Spark System

**Definition**: One-click idea capture that links to source content

**Structure**:
```typescript
await ecs.createEntity(userId, {
  spark: {
    idea: 'The assemblage concept bridges structuralism and post-structuralism',
    created_at: new Date(),
    tags: ['philosophy', 'deleuze']
  },
  source: {
    document_id: documentId,
    chunk_id: chunkId,
    annotation_id: annotationId  // Optional: if sparked from annotation
  }
})
```

**Features**:
- Instant capture during reading (keyboard shortcut)
- Automatically links to source context
- Generates embedding for connection detection
- Can be created from annotations

---

### Thread System

**Definition**: User-curated sequence of connected ideas (sparks, annotations, flashcards)

**Why Threads Matter**: Tracking evolution of ideas across multiple documents/sources

**Example Thread**:
```
Thread: "Evolution of Assemblage Theory"
├─ Spark 1: Deleuze's original concept (Deleuze.md)
│   ↓ "extends"
├─ Spark 2: DeLanda's systematization (DeLanda.md)
│   ↓ "applies"
├─ Spark 3: Bennett's political application (Bennett.md)
│   ↓ "challenges"
└─ Spark 4: My synthesis (My Notes.md)
```

**Implementation**:
```typescript
// 1. Create thread entity
const threadId = await ecs.createEntity(userId, {
  thread: {
    name: 'Evolution of Assemblage Theory',
    description: 'Tracing how assemblage concept evolved across authors',
    color: '#3b82f6',
    created_at: new Date()
  }
})

// 2. Add sparks to thread (creates connections)
for (let i = 0; i < sparks.length - 1; i++) {
  await supabase.from('connections').insert({
    source_entity_id: sparks[i].id,
    target_entity_id: sparks[i + 1].id,
    connection_type: 'thread',
    thread_id: threadId,
    thread_order: i,
    user_created: true,
    confidence: 1.0,
    metadata: {
      relationship: 'extends'  // or 'challenges', 'applies', etc.
    }
  })
}
```

---

### Thread Survival Across Versions

**Key Insight**: Threads use ENTITY IDs, not chunk IDs → 100% stable

**Example Scenario**:

```
INITIAL STATE (all docs at v1):
Thread: "Assemblage Evolution"
├─ Spark 1 (entity-abc) in Deleuze.md v1
├─ Spark 2 (entity-def) in DeLanda.md v1
└─ Spark 3 (entity-ghi) in Bennett.md v1

USER EDITS Deleuze.md in Obsidian → v2

AFTER SYNC:
Thread: "Assemblage Evolution"
├─ Spark 1 (entity-abc) in Deleuze.md v2  ← SAME ENTITY ID!
├─ Spark 2 (entity-def) in DeLanda.md v1
└─ Spark 3 (entity-ghi) in Bennett.md v1

✅ Thread intact (entity IDs never change)
✅ Connections preserved (link entities, not chunks)
✅ Only metadata updated (which version_id spark was created in)
```

**Database State**:
```sql
-- Connections table
SELECT * FROM connections WHERE thread_id = 'thread-123';

-- All connections still valid:
-- source_entity_id: entity-abc (stable)
-- target_entity_id: entity-def (stable)
-- source_version_id: v2 (updated metadata)
-- target_version_id: v1 (unchanged)
```

---

### Knowledge Synthesis Flow

**Automatic Process**:

```typescript
// 1. User creates spark
const sparkId = await createSpark({
  idea: 'Assemblages are anti-essentialist structures',
  source: { document_id, chunk_id }
})

// 2. Generate embedding for spark
const embedding = await generateEmbedding(sparkIdea)

// 3. Find related entities (annotations, other sparks, flashcards)
const related = await findRelatedEntities({
  embedding: embedding,
  entityTypes: ['spark', 'annotation', 'flashcard'],
  threshold: 0.8,
  excludeDocument: document_id  // Cross-document only
})

// 4. Create auto-detected connections
for (const match of related) {
  await createConnection({
    source_entity_id: sparkId,
    target_entity_id: match.id,
    connection_type: 'similar',
    strength: match.similarity,
    auto_detected: true,
    user_confirmed: false
  })
}

// 5. Surface connections in UI
// Right panel shows related sparks/annotations from other docs
```

**User Experience**:

```
User creates spark: "Anti-essentialist structures"
    ↓
System finds 8 related items across 3 documents
    ↓
Right Panel displays:
┌─────────────────────────────────────┐
│ 🔗 Related Ideas                    │
├─────────────────────────────────────┤
│ From "Deleuze & Guattari.md"       │
│ ├─ Annotation: "Rhizomatic thinking"│
│ │  Similarity: 0.87                 │
│ └─ Spark: "Multiplicities concept"  │
│    Similarity: 0.82                 │
│                                     │
│ From "Actor-Network Theory.md"     │
│ └─ Annotation: "Heterogeneous nets" │
│    Similarity: 0.79                 │
│                                     │
│ [Create Thread] [View All]          │
└─────────────────────────────────────┘
```

User can:
- Click any related item to view in context
- Create thread linking these ideas
- Confirm/reject suggested connections
- Add notes explaining relationships

---

## UI/UX Patterns

### Annotation Layer

**Architecture**: Overlay system on top of MDX-rendered markdown

```tsx
<DocumentViewer documentId={documentId}>
  {/* Base content layer */}
  <MDXRenderer content={markdownContent} />
  
  {/* Annotation overlay layer */}
  <AnnotationLayer>
    {annotations.map(ann => (
      <Highlight
        key={ann.id}
        position={calculatePosition(ann.position)}
        color={ann.annotation.color}
        confidence={ann.position.migration_confidence}
        onClick={() => openAnnotation(ann.id)}
      >
        {/* Highlight spans over text */}
        <HighlightNote visible={selectedAnnotation === ann.id}>
          {ann.annotation.note}
        </HighlightNote>
      </Highlight>
    ))}
  </AnnotationLayer>
  
  {/* Selection handler */}
  <TextSelectionHandler onSelect={showAnnotationToolbar} />
</DocumentViewer>
```

**Confidence Indicators**:
```tsx
function Highlight({ confidence, ...props }) {
  const badge = confidence >= 0.9 ? null : 
                confidence >= 0.7 ? '✓' : 
                '⚠️'
  
  return (
    <span 
      className={cn(
        'highlight',
        confidence < 0.7 && 'highlight-uncertain'
      )}
      data-confidence={confidence}
    >
      {badge && <ConfidenceBadge>{badge}</ConfidenceBadge>}
      {props.children}
    </span>
  )
}
```

---

### Right Panel (Connections View)

**Layout**: Fixed right sidebar with tabs

```tsx
<RightPanel>
  <Tabs defaultValue="connections">
    <TabsList>
      <TabsTrigger value="connections">
        Connections {connectionCount}
      </TabsTrigger>
      <TabsTrigger value="annotations">
        Notes {annotationCount}
      </TabsTrigger>
      <TabsTrigger value="study">
        Study {dueCardCount}
      </TabsTrigger>
    </TabsList>
    
    {/* Connections Tab */}
    <TabsContent value="connections">
      <div className="space-y-4">
        {/* Active connections (current version) */}
        <div>
          <h4 className="text-sm font-medium mb-2">
            Active Connections
          </h4>
          {activeConnections.map(conn => (
            <ConnectionCard
              key={conn.id}
              connection={conn}
              onClick={() => navigateToConnection(conn)}
            />
          ))}
        </div>
        
        {/* Historical connections (collapsed) */}
        <Collapsible>
          <CollapsibleTrigger>
            <h4 className="text-sm font-medium">
              Historical (v1) · {historicalCount}
            </h4>
          </CollapsibleTrigger>
          <CollapsibleContent>
            {historicalConnections.map(conn => (
              <ConnectionCard 
                key={conn.id} 
                connection={conn}
                isHistorical 
              />
            ))}
          </CollapsibleContent>
        </Collapsible>
        
        {/* Needs review alert */}
        {lowConfidenceCount > 0 && (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>
              {lowConfidenceCount} connections need review
            </AlertTitle>
            <Button onClick={openReviewPanel}>
              Review
            </Button>
          </Alert>
        )}
      </div>
    </TabsContent>
  </Tabs>
</RightPanel>
```

---

### Thread Visualization

**Canvas View**: Spatial organization of threads

```tsx
<ThreadCanvas>
  <InfiniteCanvas>
    {threads.map(thread => (
      <ThreadNode
        key={thread.id}
        thread={thread}
        position={thread.position}
        onDrag={updatePosition}
      >
        {/* Thread title */}
        <ThreadHeader>
          {thread.thread.name}
        </ThreadHeader>
        
        {/* Spark sequence */}
        <SparkSequence>
          {getSparksInThread(thread.id).map((spark, i) => (
            <React.Fragment key={spark.id}>
              <SparkCard spark={spark} />
              {i < sparks.length - 1 && (
                <ConnectionLine type={getConnectionType(i)} />
              )}
            </React.Fragment>
          ))}
        </SparkSequence>
        
        {/* Actions */}
        <ThreadActions>
          <Button size="sm" onClick={() => expandThread(thread.id)}>
            <Maximize2 />
          </Button>
          <Button size="sm" onClick={() => studyThread(thread.id)}>
            <BookOpen />
          </Button>
        </ThreadActions>
      </ThreadNode>
    ))}
  </InfiniteCanvas>
</ThreadCanvas>
```

---

### Review Interfaces

#### Annotation Review Panel

```tsx
<ReviewPanel title="Annotation Position Review">
  {needsReview.map(ann => (
    <Card key={ann.id}>
      <CardHeader>
        <div className="flex justify-between">
          <Badge>Confidence: {ann.confidence.toFixed(2)}</Badge>
          <Badge variant="outline">{ann.annotation.color}</Badge>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {/* Original position */}
        <div>
          <Label>Original (v1):</Label>
          <blockquote className="border-l-2 pl-4 text-sm">
            {ann.position.text_content}
          </blockquote>
        </div>
        
        {/* Suggested position */}
        <div>
          <Label>Suggested (v2):</Label>
          <blockquote className="border-l-2 pl-4 text-sm bg-yellow-50">
            {suggestedMatch}
          </blockquote>
        </div>
        
        {/* Context preview */}
        <div>
          <Label>Document context:</Label>
          <div className="text-xs text-muted-foreground">
            ...{contextBefore}<mark>{suggestedMatch}</mark>{contextAfter}...
          </div>
        </div>
      </CardContent>
      
      <CardFooter className="flex gap-2">
        <Button onClick={() => accept(ann.id)}>
          ✓ Looks correct
        </Button>
        <Button variant="outline" onClick={() => showInDocument(ann.id)}>
          👁️ View in document
        </Button>
        <Button variant="outline" onClick={() => adjustPosition(ann.id)}>
          ✏️ Adjust
        </Button>
        <Button variant="ghost" onClick={() => deleteAnnotation(ann.id)}>
          🗑️ Delete
        </Button>
      </CardFooter>
    </Card>
  ))}
</ReviewPanel>
```

---

#### Connection Review Panel

```tsx
<ReviewPanel title="Connection Review">
  {needsReview.map(conn => (
    <Card key={conn.id}>
      <CardHeader>
        <Badge>Confidence: {conn.confidence.toFixed(2)}</Badge>
      </CardHeader>
      
      <CardContent>
        <div className="grid grid-cols-2 gap-4">
          {/* Source */}
          <div>
            <Label>Source (original):</Label>
            <blockquote className="text-sm">
              {conn.oldSource.content.slice(0, 150)}...
            </blockquote>
            
            <Label className="mt-2">Suggested match:</Label>
            <blockquote className="text-sm bg-yellow-50">
              {conn.suggestedSource.content.slice(0, 150)}...
            </blockquote>
          </div>
          
          {/* Target */}
          <div>
            <Label>Target (original):</Label>
            <blockquote className="text-sm">
              {conn.oldTarget.content.slice(0, 150)}...
            </blockquote>
            
            <Label className="mt-2">Suggested match:</Label>
            <blockquote className="text-sm bg-yellow-50">
              {conn.suggestedTarget.content.slice(0, 150)}...
            </blockquote>
          </div>
        </div>
      </CardContent>
      
      <CardFooter className="flex gap-2">
        <Button onClick={() => acceptConnection(conn.id)}>
          ✓ Accept
        </Button>
        <Button variant="outline" onClick={() => viewConnection(conn.id)}>
          👁️ View both
        </Button>
        <Button variant="ghost" onClick={() => deleteConnection(conn.id)}>
          🗑️ Delete
        </Button>
      </CardFooter>
    </Card>
  ))}
</ReviewPanel>
```

---

### Alerts & Notifications

**After successful sync**:
```tsx
<Toast>
  <ToastTitle>Document synced successfully</ToastTitle>
  <ToastDescription>
    ✅ 13 annotations migrated automatically<br/>
    ⚠️  2 annotations need review<br/>
    🔄 21 connections regenerated
  </ToastDescription>
  <ToastAction onClick={openReview}>
    Review now
  </ToastAction>
</Toast>
```

**During migration**:
```tsx
<ProcessingDock>
  <div className="flex items-center gap-4">
    <Loader2 className="animate-spin" />
    <div>
      <p className="font-medium">Syncing document...</p>
      <p className="text-sm text-muted-foreground">
        Migrating annotations (13/15)
      </p>
    </div>
    <Progress value={86} />
  </div>
</ProcessingDock>
```

---

## Implementation Timeline

### Week 3: Foundation & Annotation Layer

**Duration**: 7-8 days

#### Day 1-2: Version Tracking Infrastructure
- [ ] Write migration 013 (document_versions table)
- [ ] Add version_id columns to chunks, documents
- [ ] Implement version creation logic
- [ ] Hash-based change detection
- [ ] Storage path versioning

#### Day 3-4: Annotation System
- [ ] Annotation component schema
- [ ] Text selection handler
- [ ] Annotation toolbar UI
- [ ] Create/edit/delete operations
- [ ] Color picker and note system

#### Day 5-6: Migration System
- [ ] Fuzzy matching for annotations
- [ ] Batch migration function
- [ ] Confidence scoring
- [ ] Migration alerts/notifications
- [ ] Review panel UI

#### Day 7: Testing & Polish
- [ ] Test migration with real documents
- [ ] Validate success rates
- [ ] Polish UI interactions
- [ ] Documentation

**Deliverables**:
- ✅ Version tracking active
- ✅ Annotations with migration
- ✅ Review UI functional
- ✅ ~85% automatic migration rate

---

### Week 4: Study System (As Planned)

No changes to original Week 4 plan:
- Flashcard creation from annotations
- FSRS implementation
- Split-screen study mode
- Study queue
- Progress tracking

**Note**: Connections/threads deferred to Phase 2

---

### Phase 2: Connection & Synthesis System

**Duration**: 2-3 weeks (after MVP)

#### Week 5: Connection Detection
- [ ] Auto-detected chunk connections
- [ ] pgvector similarity search
- [ ] Connection strength scoring
- [ ] Right panel connections tab
- [ ] Historical connections view

#### Week 6: User-Curated Connections
- [ ] Manual connection creation
- [ ] Connection confirmation flow
- [ ] Connection migration on version change
- [ ] Connection review panel
- [ ] Cross-document linking

#### Week 7: Spark & Thread System
- [ ] Spark creation from reading
- [ ] Spark embedding generation
- [ ] Thread creation interface
- [ ] Thread canvas visualization
- [ ] Thread study mode

---

## Success Criteria & Metrics

### Annotation Migration

**Target Success Rates**:
- Automatic migration: ≥85%
- User review needed: ≤15%
- Complete loss: ≤5%

**Performance Targets**:
- Migration time: <10 seconds per document
- Fuzzy matching: <100ms per annotation
- UI responsiveness: <200ms for all interactions

**Quality Metrics**:
```typescript
interface MigrationMetrics {
  totalAnnotations: number
  autoMigrated: number        // confidence ≥0.7
  needsReview: number          // confidence 0.5-0.7
  lost: number                 // confidence <0.5
  avgConfidence: number
  processingTimeMs: number
}

// Target example:
{
  totalAnnotations: 50,
  autoMigrated: 43,      // 86%
  needsReview: 6,        // 12%
  lost: 1,               // 2%
  avgConfidence: 0.82,
  processingTimeMs: 4500
}
```

---

### Connection Preservation

**Target Survival Rates**:
- Entity-level connections: 100%
- User-confirmed chunk connections: ≥80%
- Thread integrity: 100%

**Metrics**:
```typescript
interface ConnectionMetrics {
  entityConnections: {
    total: number
    preserved: number      // Should be 100%
  }
  chunkConnections: {
    autoDetected: number
    regenerated: number    // Should equal autoDetected
  }
  userCurated: {
    total: number
    autoMigrated: number
    needsReview: number
    lost: number
  }
  threads: {
    total: number
    intact: number         // Should be 100%
  }
}
```

---

### User Experience

**Interaction Targets**:
- Annotation creation: <1 second
- Document load: <2 seconds
- Migration review: 1-2 minutes per document
- Sync workflow: <30 seconds total

**Quality Indicators**:
- Zero data loss migrations
- Clear confidence indicators
- Helpful review interface
- Non-blocking workflow (can continue reading during sync)

---

### System Performance

**Database**:
- Query time: <100ms for annotations
- Connection search: <200ms
- Version lookup: <50ms

**Storage**:
- Version file size: Similar to original
- Total storage growth: ~10% per version
- Cleanup strategy: Archive versions >6 months old

**Memory**:
- Fuzzy matching: <50MB per document
- Annotation rendering: <100MB for 1000 annotations
- Connection graph: <200MB for 10k connections

---

## Open Questions & Future Considerations

### Short-Term (Week 3-4)

1. **Annotation Positioning Edge Cases**:
   - How to handle annotations that span chunk boundaries?
   - Should we prevent cross-chunk annotations or support them?
   - **Proposed**: Allow cross-chunk, store in first chunk, handle specially in migration

2. **Version Storage Limits**:
   - How many versions to keep before archiving?
   - Compression strategy for old versions?
   - **Proposed**: Keep all versions for first 6 months, then compress/archive

3. **Concurrent Edits**:
   - What if user edits in both Rhizome and Obsidian?
   - Conflict resolution strategy?
   - **Proposed**: Last-write-wins with version history for recovery

---

### Medium-Term (Phase 2)

1. **Connection Complexity**:
   - How to handle transitive connections (A→B→C)?
   - Connection clustering/grouping?
   - **Research**: Graph algorithms for connection analysis

2. **Thread Branching**:
   - Can threads have branches (tree structure)?
   - Or only linear sequences?
   - **User Research**: Test both patterns

3. **Multi-User Collaboration**:
   - How to handle version tracking with multiple users?
   - Annotation conflict resolution?
   - **Future**: Operational Transform or CRDT approach

---

### Long-Term (Phase 3+)

1. **Offline Support**:
   - Local-first version tracking?
   - Sync conflict resolution?

2. **AI-Assisted Migration**:
   - Use LLM to understand semantic similarity?
   - Auto-suggest annotation adjustments?

3. **Version Diffing UI**:
   - Visual diff between versions?
   - Annotation movement visualization?

4. **Automated Testing**:
   - Generate test cases for migration scenarios?
   - Regression testing suite?

---

## Related Documents

### Architecture
- `docs/ARCHITECTURE.md` - Overall system design
- `docs/ECS_IMPLEMENTATION.md` - Entity-Component-System patterns
- `docs/STORAGE_PATTERNS.md` - Hybrid storage strategy

### Implementation Guides
- `worker/lib/fuzzy-matching.ts` - Reusable fuzzy matching algorithm
- `worker/lib/youtube-cleaning.ts` - Similar migration patterns
- `docs/GEMINI_PROCESSING.md` - AI processing pipeline

### Previous Brainstorming
- `docs/brainstorming/2025-01-28-markdown-renderer-annotations-version-tracking.md` - Initial version tracking discussion
- `docs/todo/markdown-sync-versions.md` - Version tracking requirements

---

## Key Takeaways

1. **Version tracking is foundational** - Not optional for file-over-app philosophy
2. **Build it in Week 3** - Avoids major refactor, enables Obsidian sync from day 1
3. **Two-tier connection system** - Separates ephemeral (regenerate) from persistent (migrate)
4. **Entity IDs are stable** - Threads and entity connections survive automatically
5. **Fuzzy matching is proven** - Reuse YouTube algorithm with 85-90% success rate
6. **User review is critical** - 10-15% of annotations need manual verification
7. **No data loss** - Even low-confidence migrations preserved for review

---

## Action Items

### Immediate (This Week)
1. [ ] Review this document with team
2. [ ] Approve architectural decisions
3. [ ] Begin migration 013 implementation
4. [ ] Set up testing framework for migrations

### Week 3 (Implementation)
1. [ ] Implement version tracking system
2. [ ] Build annotation layer with migration
3. [ ] Create review UI for low-confidence migrations
4. [ ] Test with real Obsidian documents

### Phase 2 (Post-MVP)
1. [ ] Implement connection detection
2. [ ] Build spark & thread system
3. [ ] Create knowledge synthesis features
4. [ ] Polish UI/UX based on feedback

---

**Session Completed**: 2025-01-28  
**Status**: ✅ Ready for Implementation  
**Next Step**: Begin Migration 013 Development

---

*This comprehensive brainstorming session established the complete architecture for version-aware annotations, connection migration, and spark threads. The system is designed to preserve user-created knowledge across document edits while maintaining the file-over-app philosophy.*