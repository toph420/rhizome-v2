# Spark System - Quick Reference

**Last Updated**: 2025-10-06
**Status**: Ready for Implementation
**Full Guide**: `spark-system-implementation-guide.md`

---

## What Are Sparks?

**Sparks = Cognitive Event Captures**

Unlike notes or annotations, sparks preserve:
- ⚡ Your thought
- 📍 Complete reading context (visible chunks, connections, scroll position)
- 🧭 Navigation trail (how you got there)
- ⚙️ App state (engine weights, active connections)

**The killer feature**: Click a spark from 6 months ago → return to EXACT reading state that triggered the insight.

---

## 4-Week Implementation Plan

### Week 1: Foundation
- ✅ Database migrations (044-047)
- ✅ Supabase Storage bucket (`entities`)
- ✅ File-based ECS (`lib/ecs/file-entity.ts`, `sync.ts`)
- ✅ TypeScript types (`types/spark.ts`)

### Week 2: Capture
- ✅ Create system (`lib/systems/createSpark.ts`)
- ✅ Reader context hook (`hooks/useReaderContext.ts`)
- ✅ Spark capture UI (Cmd+K modal)
- ✅ API route (`/api/sparks`)

### Week 3: Resurrection
- ✅ Search system (semantic + tags)
- ✅ Timeline UI (chronological view)
- ✅ Context restoration (breadcrumb navigation)
- ✅ Sidebar integration (in-reader sparks)

### Week 4: Intelligence
- ✅ Graph integration (spark ↔ chunk connections)
- ✅ Thread detection (auto-clustering)
- ✅ Thread suggestions UI
- ✅ Cron job (hourly detection)

---

## Key Files

**New Files** (26 total):
```
src/types/spark.ts
src/lib/ecs/file-entity.ts
src/lib/ecs/sync.ts
src/lib/systems/createSpark.ts
src/lib/systems/searchSparks.ts
src/lib/systems/threadDetection.ts
src/lib/systems/contextRestore.ts
src/lib/systems/graphIntegration.ts
src/hooks/useReaderContext.ts
src/components/spark/SparkCapture.tsx
src/components/spark/SparkTimeline.tsx
src/components/spark/SparkSidebar.tsx
src/components/spark/ThreadSuggestions.tsx
src/app/api/sparks/route.ts
src/app/api/sparks/search/route.ts
src/app/api/sparks/[id]/restore/route.ts
src/app/api/sparks/threads/route.ts
src/app/api/sparks/threads/detect/route.ts
src/app/api/sparks/connections/[chunkId]/route.ts
src/app/sparks/page.tsx
worker/jobs/detect-threads.ts
supabase/migrations/044_extend_connections_for_entities.sql
supabase/migrations/045_create_spark_index.sql
supabase/migrations/046_create_thread_suggestions.sql
supabase/migrations/047_disable_spark_index_rls.sql
```

**Modified Files** (2):
```
src/components/reader/ReaderLayout.tsx - Add SparkCapture, useReaderContext
src/components/sidebar/RightPanel.tsx - Add SparkSidebar
```

---

## Architecture Patterns

### 1. Hybrid File + Index
```
FILES (source of truth)    →    INDEX (query cache)
spark_xyz.json             →    spark_index table
                          ↔
                       Always sync
```

### 2. ECS Components
```typescript
Entity: spark_123
Components:
  - Content: { text, created_at }
  - ContextRef: { document_id, visible_chunks, scroll, connections, weights, trail }
  - Selection: { text, chunk_id, offsets }
  - Tags: { values: ['#capitalism'] }
  - ChunkRefs: { mentioned: [], origin: 'chunk_456' }
  - ThreadMembership: { thread_id, position }
  - SearchVector: { embedding: [768-dim] }
```

### 3. Context Snapshot
```typescript
// On Cmd+K capture:
{
  visibleChunks: ['chunk-1', 'chunk-2'],     // What you're reading
  scrollPosition: 1234,                      // Exact scroll position
  activeConnections: [...],                  // What connections visible
  engineWeights: { semantic: 0.25, ... },    // Your preferences
  navigationTrail: [{ doc, chunk, time }],   // How you got here
  selection: { text, chunk, offsets }        // What you highlighted
}
```

### 4. Mention Extraction
```typescript
// Natural language linking:
"/chunk-ref"    → Links to chunk
"#tag-name"     → Adds tag
"@quote"        → Quotes selection
```

### 5. Tiered Detection
```typescript
// Cheap → Medium → Expensive
if (sharedTags) return { coherent: true }      // Free
if (sharedChunks) return { coherent: true }    // $0
if (3+ sparks) analyzeWithAI()                 // $0.02
```

---

## Cost Model

**Per Spark**:
- Creation: $0.0001 (embedding)
- Search: $0.0001 (query embedding)

**Monthly** (100 sparks/week):
- Creation: 400 × $0.0001 = $0.04
- Search: 50 queries = $0.005
- Threading: 4 runs × $0.02 = $0.08
- **Total: ~$0.13/month**

**Extremely affordable.**

---

## Performance Targets

| Operation | Target | Notes |
|-----------|--------|-------|
| Capture | <2s | File + embedding + sync |
| Timeline | <100ms | Index query |
| Search | <200ms | Embedding + vector |
| Thread detect | <5s | Weekly background |
| Context restore | <500ms | Load file + navigate |

---

## Database Schema

### spark_index
```sql
entity_id TEXT PRIMARY KEY
user_id TEXT
content_text TEXT
content_vector vector(768)
created_at TIMESTAMPTZ
tags TEXT[]
origin_chunk_id TEXT
mentioned_chunks TEXT[]
thread_id TEXT
file_path TEXT
```

### thread_suggestions
```sql
id TEXT PRIMARY KEY
user_id TEXT
spark_ids TEXT[]
suggested_title TEXT
strength FLOAT
reason TEXT
dismissed BOOLEAN
```

### connections (extended)
```sql
-- Existing: chunk-to-chunk
source_chunk_id UUID
target_chunk_id UUID

-- New: entity references
source_entity_id TEXT
target_entity_id TEXT
source_entity_type TEXT  -- 'spark' | 'annotation' | 'thread'
target_entity_type TEXT
```

---

## User Flows

### Flow 1: Capture
```
1. Reading Deleuze, see Pynchon connection
2. Press Cmd+K
3. Type: "Control as modulation #deleuze"
4. Hit Enter
5. Spark saved with full context (~200ms)
6. Graph connection created (origin → spark)
```

### Flow 2: Resurrection
```
1. Writing scene about surveillance
2. Sidebar auto-surfaces spark from 6 months ago
3. Click breadcrumb
4. Navigate to Deleuze document
5. Scroll to exact position
6. Highlight chunks that were visible
7. Show connections from that moment
8. Discover forgotten Bataille connection
```

### Flow 3: Threading
```
1. Background job runs hourly
2. Finds 4 sparks about "control" in 30-min window
3. Detects shared tags + chunk overlap
4. Suggests thread: "Control Mechanisms"
5. User accepts → thread created
6. All 4 sparks linked with positions
```

---

## Testing Checklist

### Unit Tests
- [ ] Entity ID generation (unique, prefixed)
- [ ] File save/load operations
- [ ] Mention extraction (/chunk, #tag, @quote)
- [ ] Index sync (file → database)

### Integration Tests
- [ ] Spark creation flow (content → embedding → save → sync)
- [ ] Search (semantic + tag matching)
- [ ] Timeline queries (chronological, filtered)
- [ ] Thread detection (clustering + AI analysis)

### E2E Tests
- [ ] Cmd+K capture modal
- [ ] Auto-quote selection
- [ ] Context restoration (scroll + highlight)
- [ ] Thread suggestions (accept/dismiss)

### Manual Testing
- [ ] Create spark while reading
- [ ] Search finds by semantic similarity
- [ ] Timeline shows grouped by date
- [ ] Click spark restores exact state
- [ ] Thread auto-detection works
- [ ] Graph connections visible

---

## Quick Start Commands

```bash
# Phase 1: Foundation
npx supabase migration new extend_connections_for_entities
npx supabase migration new create_spark_index
npx supabase migration new create_thread_suggestions
npx supabase migration new disable_spark_index_rls
npx supabase db reset

# Phase 2: Development
npm run dev
# Open http://localhost:3000/read/[id]
# Press Cmd+K to test capture

# Phase 3: Testing
npm test -- spark
npm run test:e2e -- spark-capture

# Phase 4: Verification
npx tsx scripts/verify-spark-index.ts
```

---

## Common Patterns

### Creating a Spark
```typescript
import { createSpark } from '@/lib/systems/createSpark'

const spark = await createSpark({
  content: 'My thought #tag',
  context: {
    documentId: doc.id,
    visibleChunks: ['chunk-1'],
    scrollY: 1234,
    connections: [],
    engineWeights: {},
    navigationTrail: []
  }
}, userId)
```

### Searching Sparks
```typescript
import { searchSparks } from '@/lib/systems/searchSparks'

// Semantic search
const results = await searchSparks('capitalism', userId, {
  threshold: 0.7,
  limit: 20
})

// Tag search (automatic if query starts with #)
const tagged = await searchSparks('#deleuze', userId)
```

### Restoring Context
```typescript
import { restoreSparkContext } from '@/lib/systems/contextRestore'

const context = await restoreSparkContext(sparkId, userId)

// Navigate
router.push(`/read/${context.documentId}?restore=${sparkId}`)

// Scroll
window.scrollTo({ top: context.scrollPosition })

// Highlight chunks
context.visibleChunks.forEach(highlightChunk)
```

### Verifying Index
```typescript
import { verifyIndexIntegrity, rebuildSparkIndex } from '@/lib/ecs/sync'

const valid = await verifyIndexIntegrity(userId)
if (!valid) {
  await rebuildSparkIndex(userId)
}
```

---

## Troubleshooting

### "Spark not syncing to index"
```bash
# Check file exists
ls entities/dev-user-123/sparks/

# Verify index entry
psql -d postgres -c "SELECT * FROM spark_index WHERE entity_id = 'spark_xyz'"

# Rebuild index
npx tsx scripts/rebuild-spark-index.ts
```

### "Context restoration not working"
```typescript
// Debug: Check context data
const spark = await loadEntity(sparkId, 'spark', userId)
console.log(spark.components.ContextRef)

// Verify navigation
console.log('Navigate to:', spark.components.ContextRef.document_id)
console.log('Scroll to:', spark.components.ContextRef.scroll_position)
```

### "Thread detection not running"
```bash
# Manual trigger
curl -X POST http://localhost:3000/api/sparks/threads/detect \
  -H "x-user-id: dev-user-123"

# Check cron job
ps aux | grep detect-threads
```

---

## Success Metrics

### Capture Metrics
- **Friction**: <2 seconds (Cmd+K → saved)
- **Adoption**: >80% of reading sessions create ≥1 spark

### Resurrection Metrics
- **Discovery**: 30% clicked within 30 days
- **Fossil Resurrection**: 5% of 30+ day sparks resurface
- **Context Usage**: 20% use breadcrumb restoration

### Threading Metrics
- **Conversion**: 5-10% of sparks join threads
- **Suggestion Quality**: >60% acceptance rate

---

## Next Steps

1. **Read**: `spark-system-implementation-guide.md` (full details)
2. **Start**: Phase 1 (Foundation) - migrations + file ECS
3. **Test**: Create spark while reading
4. **Iterate**: Based on real usage

---

**The architecture is sound. The cost model is sustainable. The user experience will be transformative.**

**Let's build. 🚀**
