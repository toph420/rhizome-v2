# Spark System - Complete Documentation

**Version**: 2.0 (ECS Refactor)
**Last Updated**: 2025-10-18
**Status**: Production Ready

---

## Table of Contents

1. [Overview](#overview)
2. [Philosophy](#philosophy)
3. [Architecture](#architecture)
4. [Data Structures](#data-structures)
5. [Storage Strategy](#storage-strategy)
6. [Recovery System](#recovery-system)
7. [API Reference](#api-reference)
8. [UI Patterns](#ui-patterns)
9. [Performance](#performance)
10. [Migration Guide](#migration-guide)
11. [Troubleshooting](#troubleshooting)

---

## Overview

### What are Sparks?

**Sparks** are lightweight, context-rich thoughts captured while reading. They combine:
- **Your ideas** (free-form text)
- **Text selections** (quotes from the document)
- **Automatic connections** (to other chunks via AI engines)
- **Reading context** (what else was visible, where you were)

### Use Cases

1. **Quick annotations** - Capture thoughts without leaving reading flow (Cmd+K)
2. **Multi-quote thoughts** - Link one idea to multiple passages
3. **Fleeting notes** - Capture ideas that don't fit standard annotations
4. **Connection discovery** - Automatic links to related content
5. **Study notes** - Build flashcards from captured insights (future)

### Key Features

✅ **Instant capture** - Cmd+K anywhere in document
✅ **Multiple selections** - Quote multiple passages in one spark
✅ **Automatic recovery** - Survives document edits (fuzzy + semantic matching)
✅ **Portable** - Export to Obsidian, Storage-first design
✅ **Timeline view** - Chronological feed of all sparks (future)
✅ **Full-text search** - Find sparks by content or tags

---

## Philosophy

### Design Principles

1. **Friction-Free Capture**
   - No forms, no modals, no friction
   - Cmd+K → Type → Save (< 3 seconds)
   - Works without text selection (thought-only sparks)

2. **Context is King**
   - Capture what you were reading, where you were
   - Preserve visible chunks, scroll position, active connections
   - Enable future "time travel" to your reading moment

3. **Flexible Structure**
   - Mix selections and thoughts freely
   - Add as many quotes as needed
   - No forced categorization

4. **Resilient to Change**
   - Sparks survive document edits
   - 2-mode recovery: fuzzy matching + semantic similarity
   - Graceful degradation (orphaned > needs review > auto-recovered)

5. **Storage First**
   - Storage is source of truth
   - Database is queryable cache
   - Zero data loss on DB reset (6 min restore vs 25 min reprocessing)

---

## Architecture

### 4-Component ECS Pattern

Every spark is an **entity** with **4 components**:

```
Entity (UUID)
├── Spark        - Spark-specific data (selections, connections, recovery metadata)
├── Content      - Shared content (thought text, tags)
├── Temporal     - Shared timestamps (createdAt, updatedAt)
└── ChunkRef     - Shared chunk reference (origin chunk, all visible chunks, document)
```

#### Why 4 Components?

**Reusability**: Content, Temporal, and ChunkRef are shared across entity types (annotations, sparks, flashcards).

**Single Responsibility**: Each component has one job:
- `Spark` = spark-specific features
- `Content` = user-created text + tags
- `Temporal` = time tracking
- `ChunkRef` = location in document

**Query Flexibility**: Query by component type independently.

### Component Schemas

#### 1. Spark Component

```typescript
interface SparkComponent {
  /** Multiple text selections (can be empty for thought-only sparks) */
  selections: SparkSelection[];

  /** Connections to other chunks */
  connections: SparkConnection[];

  /** Linked annotation entity IDs */
  annotationRefs?: string[];

  // Recovery metadata
  orphaned?: boolean;
  recoveryConfidence?: number;
  recoveryMethod?: 'selections' | 'semantic' | 'context' | 'orphaned';
  needsReview?: boolean;
  originalChunkContent?: string;  // First 500 chars for recovery
  originalChunkHash?: string;     // SHA-256 hash
}

interface SparkSelection {
  text: string;
  chunkId: string;
  startOffset: number;
  endOffset: number;
  textContext?: {
    before: string;
    after: string;
  };
}

interface SparkConnection {
  chunkId: string;
  type: 'origin' | 'mention' | 'inherited';
  strength: number;
  metadata?: {
    inheritedFrom?: string;
    originalStrength?: number;
    originalType?: string;
    mentionedInContent?: boolean;
    relationship?: string;
  };
}
```

#### 2. Content Component (Shared)

```typescript
interface ContentComponent {
  /** User's note/thought */
  note: string;

  /** Tags (extracted or manual) */
  tags: string[];

  /** Color for visual grouping */
  color?: string;
}
```

#### 3. Temporal Component (Shared)

```typescript
interface TemporalComponent {
  createdAt: string;  // ISO 8601
  updatedAt: string;  // ISO 8601
}
```

#### 4. ChunkRef Component (Shared)

```typescript
interface ChunkRefComponent {
  /** Primary/origin chunk ID (camelCase) */
  chunkId: string;

  /** Primary chunk ID (snake_case for compatibility) */
  chunk_id: string;

  /** All visible chunk IDs (includes origin + viewport + selections) */
  chunkIds?: string[];

  /** Document ID (camelCase) */
  documentId: string;

  /** Document ID (snake_case for compatibility) */
  document_id: string;
}
```

**Note**: ChunkRef has both camelCase and snake_case for backward compatibility with existing queries.

### Database Schema

#### Components Table

```sql
CREATE TABLE components (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  entity_id UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  component_type TEXT NOT NULL,  -- 'Spark', 'Content', 'Temporal', 'ChunkRef'
  data JSONB NOT NULL,           -- Component-specific data (camelCase fields)

  -- Recovery fields (added in migration 057)
  recovery_method TEXT,
  recovery_confidence FLOAT,
  needs_review BOOLEAN DEFAULT FALSE,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_components_entity ON components(entity_id);
CREATE INDEX idx_components_type ON components(component_type);
CREATE INDEX idx_components_needs_review ON components(needs_review) WHERE needs_review = true;
CREATE INDEX idx_components_recovery_method ON components(recovery_method) WHERE recovery_method IS NOT NULL;
```

#### Sparks Cache Table

```sql
CREATE TABLE sparks_cache (
  entity_id UUID PRIMARY KEY REFERENCES entities(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,

  -- Denormalized fields from components
  content TEXT NOT NULL,
  tags TEXT[],
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ,

  origin_chunk_id TEXT NOT NULL,
  document_id UUID NOT NULL,

  -- Arrays (added in migrations 056-057)
  connections JSONB DEFAULT '[]',
  selections JSONB DEFAULT '[]',

  -- Search
  embedding vector(768),
  storage_path TEXT,
  cached_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_sparks_cache_user_time ON sparks_cache(user_id, created_at DESC);
CREATE INDEX idx_sparks_cache_tags ON sparks_cache USING gin(tags);
CREATE INDEX idx_sparks_cache_embedding ON sparks_cache USING ivfflat(embedding vector_cosine_ops);
CREATE INDEX idx_sparks_cache_selections ON sparks_cache USING gin(selections);
```

---

## Data Structures

### Full Spark Entity (TypeScript)

```typescript
interface SparkEntity {
  id: string;                    // Entity UUID
  user_id: string;               // Owner
  created_at: string;
  updated_at: string;
  components: {
    spark: SparkComponent;
    content: ContentComponent;
    temporal: TemporalComponent;
    chunkRef: ChunkRefComponent;
  };
}
```

### Storage JSON (Portability)

```typescript
interface SparkStorageJson {
  entity_id: string;
  user_id: string;
  component_type: 'spark';
  data: SparkComponent;
  context: SparkContext;
  source: {
    chunk_id: string;
    document_id: string;
  };
}

interface SparkContext {
  documentId: string;
  documentTitle: string;
  originChunkId: string;
  visibleChunks: string[];
  scrollPosition: number;
  activeConnections: Connection[];
  engineWeights: {
    semantic: number;
    contradiction: number;
    bridge: number;
  };
  selection?: {
    text: string;
    chunkId: string;
    startOffset: number;
    endOffset: number;
  };
}
```

### Cache Row (Query Optimization)

```typescript
interface SparkCacheRow {
  entity_id: string;
  user_id: string;
  content: string;
  created_at: string;
  updated_at?: string;
  origin_chunk_id: string;
  document_id: string;
  tags: string[];
  connections: SparkConnection[];
  selections: SparkSelection[];
  embedding?: number[];
  storage_path: string;
  cached_at: string;
}
```

---

## Storage Strategy

### Hybrid Approach

**Supabase Storage** = Source of Truth
**PostgreSQL** = Queryable Cache

### Why Storage First?

1. **Portability** - Export to ZIP, share across devices
2. **Cost Savings** - Reprocessing costs $0.20-0.60 per doc, Storage restore is free
3. **Speed** - DB reset + restore = 6 min vs 25 min reprocessing
4. **Resilience** - Can rebuild entire DB from Storage if needed

### Storage Structure

```
{user-id}/
  sparks/
    {document-id}/
      sparks.json         - Array of all sparks for this document
      spark-{entity-id}.json  - Individual spark (legacy)
```

### Automatic Export

Every spark CRUD operation:
1. Update ECS components (database)
2. Update sparks_cache (database)
3. Export to Storage (background)

### Import/Export

```typescript
// Export single spark to Storage
await exportSparkToStorage(entityId)

// Export all sparks for document
await exportDocumentSparks(documentId)

// Import from Storage (with conflict resolution)
await importSparksFromStorage(documentId, strategy: 'skip' | 'replace' | 'merge_smart')
```

---

## Recovery System

### When Recovery Runs

1. **Document reprocessing** - User edits markdown and reprocesses
2. **Chunk regeneration** - Smart Mode connection refresh
3. **Manual trigger** - Admin Panel → Recovery tab

### 2-Mode Recovery

#### Mode 1: Selection-Based (For sparks with selections)

**4-Tier Fuzzy Matching** per selection:

1. **Exact Match** (confidence: 1.0)
   - Same text at same offset in same chunk
   - Instant recovery

2. **Context Match** (confidence: 0.90-0.95)
   - Same text with matching before/after context
   - Handles small edits

3. **Chunk-Bounded Search** (confidence: 0.80-0.90)
   - Search within same logical chunk
   - Uses trigram similarity + context

4. **Trigram Fallback** (confidence: 0.70-0.85)
   - Fuzzy string matching across document
   - Finds text even if moved

**Result**: Highest confidence match from all 4 tiers.

#### Mode 2: Semantic (For thought-only sparks)

**Embedding Similarity**:

1. Generate embedding for spark's thought text
2. Compare to new chunk embeddings (cosine similarity)
3. Find best match above threshold (0.70)

**Confidence Thresholds**:
- `> 0.85` = Auto-recovered (high confidence)
- `0.70 - 0.85` = Needs review (medium confidence)
- `< 0.70` = Orphaned (low confidence)

### Recovery Metadata

Stored in `components` table:

```sql
SELECT
  recovery_method,      -- 'exact', 'context', 'chunk_bounded', 'trigram', 'semantic', 'lost'
  recovery_confidence,  -- 0.0 - 1.0
  needs_review          -- true if 0.70 <= confidence < 0.85
FROM components
WHERE component_type = 'Spark';
```

### Recovery UI (Future)

Users can:
- **Accept** auto-recovered sparks (confidence > 0.85)
- **Review** medium-confidence sparks (0.70-0.85)
- **Manually relink** low-confidence sparks
- **Mark as lost** if recovery failed

---

## API Reference

### SparkOperations Class

```typescript
import { ECS } from '@/lib/ecs/ecs'
import { SparkOperations } from '@/lib/ecs/sparks'

const ecs = new ECS(supabaseClient)
const ops = new SparkOperations(ecs, userId)
```

#### Methods

##### `create(input: CreateSparkInput): Promise<string>`

Create a new spark entity.

```typescript
const entityId = await ops.create({
  content: 'My thought about privacy...',
  selections: [
    {
      text: 'privacy is dead',
      chunkId: 'chunk-123',
      startOffset: 100,
      endOffset: 115,
      textContext: {
        before: '...',
        after: '...'
      }
    }
  ],
  tags: ['privacy', 'surveillance'],
  connections: [],
  chunkId: 'chunk-123',
  chunkIds: ['chunk-123', 'chunk-124'],
  documentId: 'doc-456',
  originChunkContent: 'First 500 chars...'
})
```

##### `update(entityId: string, updates: UpdateSparkInput): Promise<void>`

Update spark content and tags.

```typescript
await ops.update(entityId, {
  content: 'Updated thought',
  tags: ['privacy', 'ethics', 'updated']
})
```

##### `delete(entityId: string): Promise<void>`

Delete spark and all components.

```typescript
await ops.delete(entityId)
```

##### `getByDocument(documentId: string): Promise<SparkEntity[]>`

Get all sparks for a document.

```typescript
const sparks = await ops.getByDocument('doc-123')
```

##### `getRecent(limit: number, offset: number): Promise<SparkEntity[]>`

Get recent sparks (timeline view).

```typescript
const recent = await ops.getRecent(50, 0)
```

##### `search(query: string): Promise<SparkEntity[]>`

Full-text search sparks.

```typescript
const results = await ops.search('privacy surveillance')
```

##### `addAnnotationRef(entityId: string, annotationId: string): Promise<void>`

Link an annotation to a spark.

```typescript
await ops.addAnnotationRef(sparkId, annotationId)
```

##### `removeAnnotationRef(entityId: string, annotationId: string): Promise<void>`

Unlink an annotation.

```typescript
await ops.removeAnnotationRef(sparkId, annotationId)
```

##### `markOrphaned(entityId: string): Promise<void>`

Mark spark as orphaned (recovery failed).

```typescript
await ops.markOrphaned(sparkId)
```

##### `updateAfterRecovery(entityId: string, chunkId: string, confidence: number, method: string): Promise<void>`

Update spark after recovery process.

```typescript
await ops.updateAfterRecovery(
  sparkId,
  'new-chunk-123',
  0.92,
  'context'
)
```

### Server Actions

```typescript
'use server'
import { createSpark, updateSpark, deleteSpark } from '@/app/actions/sparks'
```

#### `createSpark(data: CreateSparkData): Promise<Result>`

Create spark from UI.

```typescript
const result = await createSpark({
  content: 'My thought',
  selections: [...],
  tags: ['tag1'],
  documentId: 'doc-123',
  chunkId: 'chunk-456',
  chunkIds: ['chunk-456', 'chunk-457']
})

if (result.success) {
  console.log('Created:', result.data.entityId)
}
```

#### `updateSpark(entityId: string, updates: UpdateSparkData): Promise<Result>`

Update existing spark.

```typescript
const result = await updateSpark(entityId, {
  content: 'Updated thought',
  tags: ['updated']
})
```

#### `deleteSpark(entityId: string): Promise<Result>`

Delete spark.

```typescript
const result = await deleteSpark(entityId)
```

### Zustand Store

```typescript
import { useSparkStore } from '@/stores/spark-store'

function MyComponent() {
  const { sparks, setSparks, addSpark, updateSpark, removeSpark } = useSparkStore()

  // Load sparks for document
  useEffect(() => {
    const loadSparks = async () => {
      const result = await getSparksForDocument(documentId)
      setSparks(documentId, result)
    }
    loadSparks()
  }, [documentId])

  // Add optimistic update
  const handleCreate = async (data) => {
    const tempId = `temp-${Date.now()}`
    addSpark(documentId, { ...data, entity_id: tempId })

    const result = await createSpark(data)
    if (result.success) {
      removeSpark(documentId, tempId)
      addSpark(documentId, result.data)
    }
  }
}
```

---

## UI Patterns

### Quick Capture (Cmd+K)

**Component**: `src/components/reader/QuickSparkCapture.tsx`

**Features**:
- Keyboard shortcut: `Cmd+K` or `Ctrl+K`
- Auto-focus on open
- Esc to close
- Tab to toggle between thought and tags

**State Management**:
```typescript
import { useUIStore } from '@/stores/ui-store'

const { quickCaptureOpen, setQuickCaptureOpen } = useUIStore()
```

### Multiple Selections

**Pattern**: Array-based selection management

```typescript
const [selections, setSelections] = useState<SparkSelection[]>([])

// Add selection
const addSelection = (selection: SparkSelection) => {
  setSelections(prev => [...prev, selection])
}

// Remove selection
const removeSelection = (index: number) => {
  setSelections(prev => prev.filter((_, i) => i !== index))
}

// Clear all
const clearSelections = () => setSelections([])
```

### Spark Timeline (Future)

**Location**: `/sparks` route

**Features**:
- Chronological feed (newest first)
- Infinite scroll
- Filter by tags, document, date range
- Full-text search
- Bulk operations (delete, export)

### RightPanel Integration

**Tab**: Sparks (tab 2)

**Features**:
- List sparks for current document
- Click to scroll to origin chunk
- Edit inline
- Link to annotations

---

## Performance

### Targets (Personal Tool)

- **Spark creation**: <1s (Cmd+K → saved)
- **Timeline load**: <500ms (50 sparks from cache)
- **Recovery**: <30s per document (100 sparks)
- **Obsidian export**: <5s (background job)

### Optimization Strategies

1. **Use Cache Table** for queries
   ```typescript
   // ✅ Fast - uses sparks_cache
   const sparks = await supabase
     .from('sparks_cache')
     .select('*')
     .eq('document_id', documentId)

   // ❌ Slow - 4-way join on ECS
   const sparks = await ops.getByDocument(documentId)
   ```

2. **Batch Operations**
   - Export all sparks for document in one Storage write
   - Update cache in single transaction with ECS

3. **Lazy Loading**
   - Timeline: Load 50, fetch more on scroll
   - Don't load selections unless expanded

4. **Debounce Searches**
   - Wait 300ms before triggering search
   - Cancel in-flight requests

### Monitoring

```typescript
// In development
console.time('spark-create')
await createSpark(data)
console.timeEnd('spark-create')
// Should be <1000ms
```

---

## Migration Guide

### From Old Spark System

**Old** (2-component):
```typescript
{
  entity_id: 'abc-123',
  components: [
    { type: 'spark', data: { content, tags, created_at } },
    { type: 'source', data: { chunk_id, document_id } }
  ]
}
```

**New** (4-component):
```typescript
{
  entity_id: 'abc-123',
  components: [
    { type: 'Spark', data: { selections, connections } },
    { type: 'Content', data: { note, tags } },
    { type: 'Temporal', data: { createdAt, updatedAt } },
    { type: 'ChunkRef', data: { chunkId, documentId, chunkIds } }
  ]
}
```

### Migration Script

```bash
# Run migration (worker script)
cd worker
node scripts/migrate-sparks-to-4-component.ts

# Verify
psql -d rhizome -c "
  SELECT component_type, COUNT(*)
  FROM components
  WHERE entity_id IN (SELECT id FROM entities WHERE /* spark condition */)
  GROUP BY component_type;
"
# Should show: Spark, Content, Temporal, ChunkRef with equal counts
```

### Breaking Changes

1. **Component names**: `spark` → `Spark`, `source` → `ChunkRef`
2. **Data structure**: Flat `{ content, tags }` → Nested `{ data: { note, tags } }`
3. **Timestamps**: `created_at` (snake) → `createdAt` (camel) in JSONB
4. **Server actions**: New signatures, return types

---

## Troubleshooting

### Common Issues

#### Sparks not saving

**Symptoms**: Click save, no error, but spark doesn't appear

**Causes**:
1. Server action failing silently
2. Cache not updating
3. UI not refreshing

**Debug**:
```typescript
// Check server action result
const result = await createSpark(data)
console.log('Result:', result)

// Check database
SELECT * FROM entities ORDER BY created_at DESC LIMIT 1;
SELECT * FROM components WHERE entity_id = '{entity-id}';

// Check cache
SELECT * FROM sparks_cache ORDER BY created_at DESC LIMIT 1;
```

#### Selections not persisting

**Symptoms**: Selections added in UI, but not in database

**Causes**:
1. Selections not passed to server action
2. JSONB serialization issue
3. Component data structure wrong

**Debug**:
```typescript
// Log before submit
console.log('Selections to save:', selections)

// Check Spark component
SELECT data->'selections' FROM components
WHERE component_type = 'Spark'
ORDER BY created_at DESC LIMIT 1;
```

#### Recovery not working

**Symptoms**: All sparks marked orphaned after reprocessing

**Causes**:
1. Chunk IDs completely changed
2. Text context missing
3. Recovery handler not running

**Debug**:
```bash
# Check worker logs
docker logs -f rhizome-worker

# Check background jobs
SELECT * FROM background_jobs
WHERE job_type = 'recover_sparks'
ORDER BY created_at DESC LIMIT 5;

# Check recovery metadata
SELECT recovery_method, recovery_confidence, needs_review
FROM components
WHERE component_type = 'Spark'
ORDER BY created_at DESC;
```

#### Cache out of sync

**Symptoms**: sparks_cache has different data than ECS

**Causes**:
1. Dual-write not happening
2. Transaction failed partway
3. Manual DB edit

**Fix**:
```typescript
// Rebuild cache from ECS
import { rebuildSparksCache } from '@/lib/sparks/cache'
await rebuildSparksCache(documentId)

// Or rebuild all
await rebuildAllSparksCache()
```

### Performance Issues

#### Slow timeline load (>1s)

**Causes**:
1. Using ECS query instead of cache
2. No index on created_at
3. Loading too many at once

**Fix**:
```typescript
// ✅ Use cache
const sparks = await supabase
  .from('sparks_cache')
  .select('entity_id, content, tags, created_at')
  .eq('user_id', userId)
  .order('created_at', { ascending: false })
  .limit(50)

// ❌ Don't use ECS for timeline
const sparks = await ops.getRecent(50)  // 4-way join
```

#### Slow creation (>2s)

**Causes**:
1. Synchronous Storage export
2. Multiple network requests
3. No optimistic update

**Fix**:
```typescript
// Make Storage export async
await createSparkInDatabase(data)
exportSparkToStorage(entityId).catch(console.error)  // Fire and forget

// Optimistic update
addSpark(documentId, optimisticSpark)
const result = await createSpark(data)
if (result.success) {
  updateSpark(documentId, optimisticSpark.id, result.data)
}
```

---

## Future Enhancements

### Planned Features

1. **Timeline View** (`/sparks`)
   - Chronological feed of all sparks
   - Infinite scroll, filtering, search
   - Bulk operations

2. **Flashcard Generation**
   - Convert sparks to flashcards
   - FSRS spaced repetition
   - Study mode interface

3. **Thread System**
   - Group related sparks into threads
   - Visual thread view
   - Thread-based navigation

4. **Advanced Search**
   - Semantic search (embedding similarity)
   - Filter by date range, tags, document
   - Saved searches

5. **Obsidian Integration**
   - Bi-directional sync
   - Wikilink support
   - Tag synchronization

### Research Ideas

- **Automatic tag extraction** from thought text
- **Connection suggestions** based on content
- **Duplicate detection** (similar sparks)
- **Smart grouping** (topic clustering)

---

## Appendix

### Related Documentation

- **ECS Guide**: `docs/ECS_IMPLEMENTATION.md`
- **Storage Patterns**: `docs/STORAGE_PATTERNS.md`
- **Testing Rules**: `docs/testing/TESTING_RULES.md`
- **Manual Testing**: `docs/testing/SPARK_MANUAL_TESTING_GUIDE.md`

### Key Files

**Implementation**:
- `src/lib/ecs/sparks.ts` - SparkOperations class
- `src/lib/ecs/components.ts` - Component schemas
- `src/app/actions/sparks.ts` - Server actions
- `src/stores/spark-store.ts` - Zustand store

**UI**:
- `src/components/reader/QuickSparkCapture.tsx` - Cmd+K capture
- `src/components/reader/QuickCapturePanel.tsx` - Selection UI
- `src/components/sidebar/SparksTab.tsx` - RightPanel tab

**Worker**:
- `worker/handlers/recover-sparks.ts` - Recovery handler
- `worker/lib/fuzzy-matching.ts` - 4-tier matching
- `worker/lib/storage-helpers.ts` - Storage operations

**Database**:
- `supabase/migrations/054_create_sparks_cache.sql` - Cache table
- `supabase/migrations/056_add_connections_to_sparks_cache.sql` - Connections
- `supabase/migrations/057_spark_recovery_fields.sql` - Recovery fields

### Glossary

- **Spark**: Lightweight thought captured while reading
- **Selection**: Text quote from document
- **Origin chunk**: Primary chunk where spark was created
- **Visible chunks**: All chunks visible in viewport when spark created
- **Connection**: Automatic link to related chunk
- **Recovery**: Process of remapping sparks after document edit
- **Orphaned**: Spark that couldn't be recovered (confidence <0.70)
- **Needs review**: Medium-confidence recovery (0.70-0.85)
- **Cache**: Denormalized table for fast queries
- **Storage**: Supabase Storage (source of truth)

### Version History

- **v2.0** (2025-10-18): ECS refactor, 4-component pattern, dual-mode recovery
- **v1.5** (2025-10-15): Multiple selections support
- **v1.0** (2025-10-10): Initial implementation (2-component)

---

**Last Updated**: 2025-10-18
**Maintained By**: Rhizome Development Team
**Questions?**: See `TROUBLESHOOTING.md` or open an issue
