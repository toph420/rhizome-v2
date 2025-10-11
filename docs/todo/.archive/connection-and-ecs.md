Let's map this out systematically. The interesting problem is: **How do users interact with the connection graph through their annotations, sparks, and threads?**

## The Core Integration Pattern

You have two data layers that need to talk:

**Connection Layer (automatic):**
- chunk → chunk relationships
- Detected by 7 engines
- Stored with strength, type, metadata

**ECS Layer (user-created):**
- Annotations, flashcards, sparks, threads
- Reference chunks via `source` component
- User's interaction with knowledge

**The bridge:** When viewing chunk A with connections to chunks B, C, D, you need to surface:
1. The connections themselves (already built)
2. **User entities that exist on B, C, D** (not built)

## Query Patterns We Need

Let me walk through the key scenarios:

### Scenario 1: Reading with Connections

**You're reading chunk_0, system finds it connects to chunk_847 (different document)**

Current sidebar shows:
```
🔗 Thematic Bridge (0.87)
├─ "Catch-22" - Opening
└─ Shared: bureaucratic absurdity
```

But it should also show:
```
🔗 Thematic Bridge (0.87)
├─ "Catch-22" - Opening
└─ Shared: bureaucratic absurdity

📝 Your notes on connected chunk:
   "This reminds me of Pynchon's approach..."
   
💡 Spark from when you read this:
   "Both authors subvert military logic"
```

**This requires:**
```typescript
// New ECS method needed
async function getEntitiesOnChunks(
  chunkIds: string[],
  userId: string,
  componentTypes?: string[]
): Promise<Entity[]>
```

Implementation:
```typescript
async getEntitiesOnChunks(
  chunkIds: string[],
  userId: string,
  componentTypes?: string[]
): Promise<Entity[]> {
  let query = this.supabase
    .from('components')
    .select('*, entity:entities!inner(*)')
    .in('chunk_id', chunkIds)
    .eq('entity.user_id', userId)
  
  if (componentTypes) {
    query = query.in('component_type', componentTypes)
  }
  
  // Group by entity_id
  const { data, error } = await query
  
  // Transform into Entity[] with components grouped
  return this.groupComponentsByEntity(data)
}
```

### Scenario 2: Creating a Spark with Full Context

**You have an insight while reading.** Your vision doc says sparks capture:
- visible_chunks
- active_connections  
- scroll_position
- engine_states

This is brilliant - you're preserving **your cognitive state** when the insight occurred.

```typescript
// In the reader component
async function captureContext(): Promise<ContextData> {
  return {
    visible_chunks: getVisibleChunkIds(), // From viewport tracking
    active_connections: getCurrentConnections(), // What's in sidebar
    scroll_position: window.scrollY,
    engine_weights: {
      semantic: 0.3,
      thematic: 0.9,
      contradiction: 1.0,
      // ... current weight settings
    },
    timestamp: new Date().toISOString(),
    document_id: currentDocumentId,
    reading_mode: 'standard' // vs research, chaos, etc
  }
}

// When user hits "Capture Spark"
await ecs.createEntity(userId, {
  spark: {
    idea: "Both authors subvert military logic through absurdity",
    tags: ["narrative-structure", "military-critique"]
  },
  context: await captureContext(), // Full app state
  source: {
    chunk_id: currentChunkId,
    document_id: currentDocumentId
  }
})
```

**Later, when reviewing this spark:**
```typescript
async function replaySparkContext(sparkId: string) {
  const spark = await ecs.getEntity(sparkId, userId)
  const context = spark.components.find(c => c.type === 'context').data
  
  // Recreate the mental state
  return {
    navigateTo: context.document_id,
    scrollTo: context.scroll_position,
    highlightChunks: context.visible_chunks,
    showConnections: context.active_connections,
    applyWeights: context.engine_weights
  }
}
```

You can literally **time-travel back to your mental state** when you had the insight.

### Scenario 3: Threads as Connection Paths

**A thread is a curated journey through the connection graph.**

```typescript
// Start a thread from current chunk
const threadId = await ecs.createEntity(userId, {
  thread: {
    title: "How postmodern authors critique institutions",
    description: "Following the contradiction connections",
    started_at: new Date()
  },
  path: {
    nodes: [
      {
        chunk_id: "chunk_0",
        document_id: "gravity_rainbow",
        note: "Pynchon's paranoid systems",
        added_at: new Date()
      }
    ]
  }
})

// As you navigate connections, extend the thread
await ecs.updateComponent(pathComponentId, {
  nodes: [
    ...existingNodes,
    {
      chunk_id: "chunk_847",
      document_id: "catch_22",
      connection_type: "thematic",
      connection_strength: 0.87,
      note: "Heller's bureaucratic absurdity - same theme, different mechanism",
      added_at: new Date()
    }
  ]
}, userId)
```

**Thread visualization:**
```
📖 Thread: "How postmodern authors critique institutions"

chunk_0 (Gravity's Rainbow)
  │ thematic → 0.87
chunk_847 (Catch-22)
  │ contradiction → 0.92
chunk_1523 (1984)
  │ structural → 0.79
chunk_2891 (Ulysses)
```

You're building a **narrative through your knowledge graph**.

### Scenario 4: Annotations on Connected Chunks

**The multi-hop problem:** You annotate chunk A. Later, you're reading chunk B which connects to chunk A.

```typescript
// When viewing chunk B
const connections = await getConnectionsFor(chunkB.id)

// For each connection, check for annotations
const annotationsOnConnected = await ecs.getEntitiesOnChunks(
  connections.map(c => c.target_chunk_id),
  userId,
  ['annotation']
)

// Surface in sidebar
"📝 Notes on connected chunks:
  • chunk_0 (Gravity's Rainbow): 'Pynchon's paranoid systems'
  • chunk_1523 (1984): 'Orwell's surveillance state'
"
```

## What Needs to Be Built

### 1. ECS Extensions

```typescript
// Add to ECS class
class ECS {
  // ... existing methods
  
  async getEntitiesOnChunks(
    chunkIds: string[],
    userId: string,
    componentTypes?: string[]
  ): Promise<Entity[]>
  
  async getEntitiesInConnectionGraph(
    sourceChunkId: string,
    userId: string,
    options: {
      connectionTypes?: string[],
      entityTypes?: string[],
      maxDepth?: number // For multi-hop
    }
  ): Promise<Entity[]>
}
```

### 2. Connection Service Layer

```typescript
// src/lib/connections/service.ts
export class ConnectionService {
  constructor(private supabase: SupabaseClient) {}
  
  async getConnectionsForChunk(
    chunkId: string,
    options?: {
      types?: ConnectionType[],
      minStrength?: number,
      weights?: Record<ConnectionType, number>
    }
  ): Promise<Connection[]>
  
  async getConnectedChunks(
    chunkId: string,
    depth: number = 1
  ): Promise<ChunkNode[]> // With connection metadata
  
  async findPath(
    fromChunkId: string,
    toChunkId: string,
    preferredTypes?: ConnectionType[]
  ): Promise<ConnectionPath | null>
}
```

### 3. Hybrid Query Layer

```typescript
// src/lib/knowledge-graph/queries.ts
export class KnowledgeGraph {
  constructor(
    private ecs: ECS,
    private connections: ConnectionService
  ) {}
  
  async getEnrichedConnections(
    chunkId: string,
    userId: string,
    weights: WeightConfig
  ): Promise<EnrichedConnection[]> {
    // Get connections
    const connections = await this.connections.getConnectionsForChunk(
      chunkId,
      { weights }
    )
    
    // Get user entities on connected chunks
    const entities = await this.ecs.getEntitiesOnChunks(
      connections.map(c => c.target_chunk_id),
      userId
    )
    
    // Merge and score
    return this.mergeConnectionsWithEntities(connections, entities)
  }
  
  async getThreadView(
    threadId: string,
    userId: string
  ): Promise<ThreadView> {
    const thread = await this.ecs.getEntity(threadId, userId)
    const path = thread.components.find(c => c.type === 'path').data
    
    // Fetch full chunk data for each node
    // Include connections between nodes
    // Include other entities on these chunks
    return this.buildThreadView(path, userId)
  }
  
  async replayContext(
    sparkId: string,
    userId: string
  ): Promise<ReplayState> {
    const spark = await this.ecs.getEntity(sparkId, userId)
    const context = spark.components.find(c => c.type === 'context').data
    
    // Reconstruct the full state
    return {
      document: await this.getDocument(context.document_id),
      chunks: await this.getChunks(context.visible_chunks),
      connections: await this.getConnections(context.active_connections),
      weights: context.engine_weights,
      scrollPosition: context.scroll_position
    }
  }
}
```

## The Reader Integration

**Current reader (from USER_FLOW.md):**
```
Display: Full markdown
Track: Visible chunks
Surface: Connections in sidebar
```

**Enhanced reader:**
```
Display: Full markdown
Track: Visible chunks + user context
Surface: 
  - Connections (chunk→chunk)
  - User entities on connected chunks
  - Thread paths passing through visible chunks
  - Sparks created in similar contexts
Score: Weighted combination of connection strength + user engagement
```

**Implementation sketch:**
```typescript
// Reader state
const readerState = {
  document: Document,
  visibleChunks: string[],
  connections: Connection[],
  userEntities: Entity[], // NEW
  activeThreads: Thread[], // NEW
  weights: WeightConfig,
  mode: 'standard' | 'research' | 'chaos'
}

// On scroll/viewport change
async function updateReaderState() {
  const visibleChunks = getVisibleChunkIds()
  
  // Get connections
  const connections = await connectionService.getConnectionsForChunks(
    visibleChunks,
    { weights: currentWeights }
  )
  
  // Get user entities on connected chunks
  const connectedChunkIds = connections.map(c => c.target_chunk_id)
  const entities = await ecs.getEntitiesOnChunks(
    connectedChunkIds,
    userId
  )
  
  // Get threads passing through visible chunks
  const threads = await ecs.query(['thread', 'path'], userId)
  const activeThreads = threads.filter(t => 
    t.components.find(c => c.type === 'path')
      .data.nodes.some(n => visibleChunks.includes(n.chunk_id))
  )
  
  updateSidebar({
    connections,
    entities,
    threads: activeThreads
  })
}
```

## Component Type Definitions

Let's formalize these:

```typescript
// Annotation Component
type AnnotationComponent = {
  text: string  // Highlighted text
  note?: string  // User's note
  color: string  // Highlight color
  range: { start: number, end: number }  // Global position
  tags?: string[]
}

// Spark Component  
type SparkComponent = {
  idea: string
  tags: string[]
  confidence?: number  // How confident in this connection
}

// Context Component (for Sparks)
type ContextComponent = {
  visible_chunks: string[]
  active_connections: Array<{
    source_chunk_id: string
    target_chunk_id: string
    type: ConnectionType
    strength: number
  }>
  scroll_position: number
  engine_weights: Record<ConnectionType, number>
  reading_mode: 'standard' | 'research' | 'chaos'
  timestamp: string
}

// Thread Component
type ThreadComponent = {
  title: string
  description?: string
  started_at: string
  status: 'active' | 'archived' | 'published'
}

// Path Component (for Threads)
type PathComponent = {
  nodes: Array<{
    chunk_id: string
    document_id: string
    connection_type?: ConnectionType
    connection_strength?: number
    note?: string
    added_at: string
  }>
}
```

## Questions for You

Before we start building, I need to understand your priorities:

1. **Which component type do you want first?** Annotations, Sparks, or Threads?

2. **For the sidebar:** Do you want connections and user entities mixed together, or separate sections?

3. **Context replay:** When you click a Spark, do you want it to navigate to that document and recreate the state, or show it in a modal/overlay?

4. **Thread building:** Should it be explicit ("Add to thread" button) or automatic (system suggests thread extensions based on navigation)?

5. **ECS query performance:** Are you okay with the `getEntitiesOnChunks` doing a bulk query every time the viewport changes, or should we add caching/preloading?

Which of these feels most critical to your workflow right now?