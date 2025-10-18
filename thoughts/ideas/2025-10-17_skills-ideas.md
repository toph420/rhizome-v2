# Using Claude Skills to Build Rhizome Faster

## What You're Actually Asking

**Question**: "Claude now has this Skills feature. How can I use it to build Rhizome more effectively?"

**Answer**: We can create custom Skills that teach Claude about Rhizome's architecture, patterns, and workflows - making it a better development partner.

---

## How Skills Work (For Development)

### The Concept

Think of Skills as **persistent context** that Claude loads only when relevant:

1. **You create a skill** - A folder with `SKILL.md` that explains Rhizome patterns
2. **Claude scans it at startup** - Sees metadata: "rhizome-architecture: Understands Rhizome's 3-engine system, hybrid reader, etc."
3. **You ask Claude to code** - "Add a new connection filter"
4. **Claude loads the skill** - Reads full instructions about connection detection
5. **Claude codes correctly** - Uses our actual patterns, not generic approaches

### Token Efficiency

**Without Skills**: You paste APP_VISION.md, ARCHITECTURE.md, PROCESSING_PIPELINE.md every conversation = 50k+ tokens

**With Skills**: Claude loads 50-token metadata, then loads full skill only when needed = massive savings

---

## Practical Skills for Building Rhizome

### Skill 1: Rhizome Architecture

**File**: `~/.claude/skills/rhizome-architecture/SKILL.md`

```markdown
---
name: rhizome-architecture
description: Complete understanding of Rhizome's architecture, processing pipeline, and design philosophy
---

# Rhizome Architecture Skill

## Overview
Rhizome is a personal knowledge synthesis engine with:
- 10-stage unified processing pipeline (Docling → Chonkie → 3-engine detection)
- Hybrid reader (full markdown display + chunk-level connections)
- Storage-first portability (Supabase Storage = source of truth)
- Cost-aware design (~$0.50 per 500-page book)

## Core Principles

### 1. Personal Tool Philosophy
- Built for ONE user (me)
- No multi-user features
- No compromises for imagined use cases
- Ship messy if clean doesn't work

### 2. Hybrid Architecture
**Display Layer**: Read continuous markdown (natural flow)
**Connection Layer**: Operate on semantic chunks (precision)
**Bridge**: Viewport tracking maps position → chunks → connections

### 3. The 3-Engine System
**DO NOT add more engines without explicit discussion**

1. **Semantic Similarity** (25% weight)
   - pgvector cosine similarity
   - Fast baseline, no AI calls
   - Finds: "These say the same thing"

2. **Contradiction Detection** (40% weight - HIGHEST)
   - Metadata-based: concepts + emotional polarity
   - No AI calls
   - Finds: "These disagree about X"

3. **Thematic Bridge** (35% weight)
   - AI-powered cross-domain matching
   - Aggressive filtering: ~200 AI calls/doc
   - Finds: "These connect different domains"

### 4. Cost Control
**Target**: ~$0.50 per 500-page book
**Breakdown**:
- Extraction: $0.12 (batched)
- Metadata: $0.20 (batched)
- Embeddings: $0.02
- ThematicBridge: $0.20 (filtered)

**Critical**: Any feature that adds AI calls must justify cost increase

## File Structure

```
src/                    # Next.js app
  components/
    reader/            # VirtualizedReader, ConnectionHeatmap
    sidebar/           # RightPanel (6 tabs)
    admin/             # Admin Panel (Cmd+Shift+A)
  app/
    actions/           # Server Actions (mutations)
    read/[id]/         # Document reader page

worker/                # Node.js processing
  processors/          # 7 format processors
  engines/            # 3 collision detection engines
  lib/
    chonkie/          # Chonkie integration
    local/            # Local pipeline (Docling + Ollama)
```

## Common Patterns

### Server Actions (Always)
```typescript
// app/actions/annotations.ts
'use server'

export async function createAnnotation(data: AnnotationData) {
  const entityId = await ecs.createEntity(userId, {
    annotation: { text: data.text },
    source: { chunk_id: data.chunkId }
  })
  revalidatePath(`/read/${data.documentId}`)
  return { success: true, id: entityId }
}
```

### No Modals (Use Persistent UI)
```typescript
// ❌ NEVER
<Dialog><CreateFlashcard /></Dialog>

// ✅ ALWAYS
<ProcessingDock />    // Bottom-right
<RightPanel />        // Side panel
<QuickSparkModal />   // ⌘K only
```

### Worker Processing
```typescript
// worker/handlers/process-document.ts
export async function processDocument(jobId: string) {
  // 10 stages with progress updates
  await updateProgress(jobId, 10, 'Downloading...')
  const file = await downloadFromStorage(documentId)
  
  await updateProgress(jobId, 20, 'Extracting with Docling...')
  const { markdown, chunks } = await doclingExtract(file)
  
  // ... continue through all 10 stages
}
```

## When Coding for Rhizome

1. **Check if feature breaks personal-tool philosophy**
   - Adding user management? ❌ No
   - Adding API rate limits? ❌ No
   - Adding usage analytics? ❌ No

2. **Check cost impact**
   - Adding AI calls? Show cost calculation
   - Can it be filtered? Apply aggressive filters first

3. **Check architecture layers**
   - Is this display or connections? Don't mix them
   - Full markdown for reading, chunks for connections

4. **Use existing patterns**
   - Server Actions for mutations
   - Zustand for client state
   - React Query for server state
   - No new patterns without justification

## Testing Philosophy
**Test based on replaceability**:
- Annotations (manual work) → Test exhaustively
- Documents (source files) → Test preservation  
- Chunks (cost $0.20) → Test critical algorithms
- Connections (auto-generated) → Light testing

Run: `npm run test:critical` before committing

## Latest Migration
`050_add_chunker_type.sql` - Chonkie integration

## Reference Documents
- APP_VISION.md - Philosophy
- ARCHITECTURE.md - System design
- PROCESSING_PIPELINE.md - 10-stage pipeline
- CLAUDE.md - Development guide (YOU ARE HERE)
```

**How to use this**:

1. Save to `~/.claude/skills/rhizome-architecture/SKILL.md`
2. In Claude.ai or Claude Code, Claude automatically scans it
3. When you ask "Add a new annotation type", Claude loads this skill
4. Claude now knows: Use Server Actions, ECS pattern, update RightPanel, etc.

---

### Skill 2: Rhizome Testing Patterns

**File**: `~/.claude/skills/rhizome-testing/SKILL.md`

```markdown
---
name: rhizome-testing
description: Testing patterns and critical test requirements for Rhizome
---

# Rhizome Testing Skill

## Test Priority Matrix

### CRITICAL (Must pass before deploy)
These break user's manual work or lose data:

```typescript
// Annotation persistence
test('annotations survive document reprocessing', async () => {
  const annotation = await createAnnotation(docId, { text: 'test' })
  await reprocessDocument(docId)
  const retrieved = await getAnnotation(annotation.id)
  expect(retrieved.text).toBe('test')
})

// Connection preservation
test('user-validated connections preserved during reprocess', async () => {
  await validateConnection(connectionId, userId)
  await reprocessConnections(docId)
  const conn = await getConnection(connectionId)
  expect(conn.user_validated).toBe(true)
})

// Chunk recovery
test('bulletproof matcher recovers 100% of chunks', async () => {
  const { stats } = await processDocument(docId)
  expect(stats.recovery_rate).toBe(1.0)
})
```

### STABLE (Fix when broken)
These are important but replaceable:

```typescript
// Metadata extraction quality
test('extracts concepts with importance scores', async () => {
  const chunks = await extractMetadata(markdown)
  expect(chunks[0].concepts.length).toBeGreaterThan(0)
  expect(chunks[0].concepts[0].importance).toBeGreaterThan(0)
})

// Connection detection quality
test('finds contradictions with shared concepts', async () => {
  const connections = await detectConnections(docId)
  const contradictions = connections.filter(c => c.type === 'contradiction')
  expect(contradictions[0].metadata.sharedConcepts).toBeDefined()
})
```

### OPTIONAL (Monitor, don't block)
Nice to have, can regenerate:

```typescript
// Embedding generation
test('generates 768-dim embeddings', async () => {
  const embeddings = await generateEmbeddings(chunks)
  expect(embeddings[0].length).toBe(768)
})
```

## Test Commands

```bash
npm run test:critical     # Must pass (blocks deploy)
npm run test:stable       # Fix when broken
npm run test:full         # All tests

cd worker
npm run test:integration  # Worker integration tests
npm run validate:metadata # Metadata extraction quality
```

## Mock Patterns

```typescript
// Mock Supabase in tests
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: (table) => ({
      select: vi.fn().mockResolvedValue({ data: mockData }),
      insert: vi.fn().mockResolvedValue({ data: mockData })
    })
  })
}))

// Mock Gemini API
vi.mock('@google/genai', () => ({
  GoogleGenAI: class {
    models = {
      generateContent: vi.fn().mockResolvedValue({
        text: JSON.stringify(mockMetadata)
      })
    }
  }
}))
```

## When to Write Tests

**Always test**:
- Annotation CRUD operations
- Connection validation persistence
- Bulletproof matcher recovery
- ECS entity creation

**Sometimes test**:
- Metadata extraction (use validate:metadata script)
- Connection detection (spot check with real docs)

**Rarely test**:
- Embedding generation (vendor responsibility)
- File uploads (Supabase responsibility)

## Red Flags

❌ Test creates 100+ real API calls (use mocks)
❌ Test requires manual verification (automate or skip)
❌ Test takes >10 seconds (optimize or move to integration)
❌ Test fails randomly (fix flakiness or remove)
```

---

### Skill 3: Rhizome Code Patterns

**File**: `~/.claude/skills/rhizome-patterns/SKILL.md`

```markdown
---
name: rhizome-patterns
description: Common code patterns, anti-patterns, and idioms specific to Rhizome
---

# Rhizome Code Patterns

## Database Queries

### ✅ Correct Pattern
```typescript
// Always use server-side Supabase client
import { createClient } from '@/lib/supabase/server'

export async function getDocument(id: string) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('documents')
    .select('*, chunks(*)')
    .eq('id', id)
    .single()
    
  if (error) throw error
  return data
}
```

### ❌ Wrong Pattern
```typescript
// Don't use client-side Supabase for mutations
'use client'
import { createClient } from '@/lib/supabase/client'

function MyComponent() {
  const handleDelete = async () => {
    const supabase = createClient()
    await supabase.from('documents').delete().eq('id', id)
    // ❌ No revalidation, stale cache
  }
}
```

## ECS Pattern

### ✅ Correct
```typescript
import { ecs } from '@/lib/ecs'

async function createAnnotationWithSource(
  userId: string,
  annotationData: AnnotationData,
  chunkId: string
) {
  return await ecs.createEntity(userId, {
    annotation: {
      text: annotationData.text,
      note: annotationData.note,
      color: annotationData.color
    },
    source: {
      chunk_id: chunkId,
      document_id: annotationData.documentId
    }
  })
}
```

## Worker Job Pattern

### ✅ Correct
```typescript
export async function processDocument(
  jobId: string,
  params: ProcessingParams
) {
  try {
    // Stage 1
    await updateJobProgress(jobId, 10, 'Downloading...')
    const file = await downloadFile(params.documentId)
    
    // Stage 2
    await updateJobProgress(jobId, 20, 'Extracting...')
    const extracted = await doclingExtract(file)
    
    // ... continue through stages
    
    // Success
    await updateJobStatus(jobId, 'completed')
    return { success: true }
    
  } catch (error) {
    await updateJobStatus(jobId, 'failed', error.message)
    throw error
  }
}
```

## Connection Filtering

### ✅ Correct (Aggressive Filtering)
```typescript
async function findThematicBridgeCandidates(
  sourceChunk: Chunk,
  corpus: Chunk[]
) {
  // Filter cascade BEFORE AI calls
  let candidates = corpus
  
  // Filter 1: Importance
  candidates = candidates.filter(c => 
    c.importance_score > 0.6
  )
  
  // Filter 2: Cross-document
  candidates = candidates.filter(c =>
    c.document_id !== sourceChunk.document_id
  )
  
  // Filter 3: Different domains
  candidates = candidates.filter(c =>
    c.themes[0] !== sourceChunk.themes[0]
  )
  
  // Filter 4: Concept overlap sweet spot
  candidates = candidates.filter(c => {
    const overlap = calculateConceptOverlap(sourceChunk, c)
    return overlap > 0.2 && overlap < 0.7
  })
  
  // Filter 5: Top 15 only
  candidates = candidates
    .slice(0, 15)
  
  console.log(`Filtered ${corpus.length} → ${candidates.length} candidates`)
  
  // NOW use AI on filtered set
  return candidates
}
```

### ❌ Wrong (No Filtering)
```typescript
async function findThematicBridges(chunk: Chunk, corpus: Chunk[]) {
  // ❌ This would make 145,000 AI calls for a 500-page book
  for (const candidate of corpus) {
    const bridge = await analyzeWithAI(chunk, candidate)
    // ...
  }
}
```
```

---

## How to Actually Use These Skills

### Option 1: Claude.ai (Web/Mobile/Desktop)

1. **Enable Skills** in Settings
2. **Create custom skills** or use built-in ones
3. When you ask coding questions, Claude automatically loads relevant skills

**Example workflow**:
```
You: "Add a fourth engine to the connection detection system"

Claude: [Loads rhizome-architecture skill]
"I see from the rhizome-architecture skill that we explicitly 
have 3 engines with specific weights. Adding a fourth engine 
would require:

1. Justifying why it's needed (current 3 are non-redundant)
2. Rebalancing weights (must sum to 1.0)
3. Cost analysis (does it add AI calls?)

Based on the 'personal tool philosophy', we should test the 
current 3 engines on real documents first. What problem are 
you seeing that needs a fourth engine?"
```

### Option 2: Claude Code (CLI)

```bash
# Install Claude Code
npm install -g @anthropic-ai/claude-code

# Add skills directory as plugin
claude code plugin add ~/.claude/skills

# Now when you code, Claude has Rhizome context
claude code "add annotation recovery to document processor"
# Claude loads rhizome-architecture skill, uses correct patterns
```

### Option 3: API (For Custom Tooling)

```typescript
import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
})

// Skills are loaded from ~/.claude/skills automatically
const message = await client.messages.create({
  model: 'claude-sonnet-4-20250929',
  max_tokens: 4096,
  messages: [{
    role: 'user',
    content: 'Review my connection detection code for Rhizome best practices'
  }]
})

// Claude automatically loads rhizome-architecture skill if relevant
```

---

## Skills I Recommend Building

### Priority 1: Architecture & Patterns
**Already outlined above** - Teaches Claude Rhizome's design

### Priority 2: Migration Patterns
Helps Claude write database migrations correctly

```markdown
---
name: rhizome-migrations
description: Database migration patterns for Rhizome (Supabase, pgvector, RLS)
---

# Rhizome Migration Patterns

## Migration Naming
`NNN_descriptive_name.sql` where NNN is zero-padded number

Latest: `050_add_chunker_type.sql`

## Always Include

1. **Backward-compatible changes first**
```sql
-- Add new columns with defaults
ALTER TABLE chunks
ADD COLUMN chunker_type TEXT DEFAULT 'hybrid';
```

2. **Indexes for performance**
```sql
CREATE INDEX idx_chunks_chunker ON chunks(chunker_type);
```

3. **RLS policies** (if table is user-scoped)
```sql
CREATE POLICY "Users can view own annotations"
ON annotations FOR SELECT
USING (auth.uid() = user_id);
```

4. **Rollback plan in comments**
```sql
-- ROLLBACK:
-- DROP INDEX idx_chunks_chunker;
-- ALTER TABLE chunks DROP COLUMN chunker_type;
```
```

### Priority 3: Debugging Patterns
Helps Claude debug issues faster

```markdown
---
name: rhizome-debugging
description: Common debugging workflows and troubleshooting for Rhizome
---

# Rhizome Debugging Skill

## Connection Detection Issues

**Symptom**: No contradictions found
**Debug steps**:
1. Check metadata extraction: `SELECT concepts, emotional_tone FROM chunks LIMIT 5`
2. Verify polarity values: Should be -1 to 1
3. Check concept overlap: Log shared concepts before filtering
4. Test on known contradiction pair

**Symptom**: Too many low-quality connections
**Fix**: Increase importance threshold in ThematicBridge filter

## Processing Pipeline Issues

**Symptom**: Job stuck at 72% (Chonkie stage)
**Debug**:
1. Check Python subprocess logs
2. Verify `sys.stdout.flush()` in chonkie_chunk.py
3. Validate character offsets: Extract vs chunk.text

**Symptom**: Metadata not transferring to Chonkie chunks
**Debug**:
1. Check bulletproof matcher output: `matchResults.length`
2. Verify overlap detection: Log overlapping chunks
3. Check interpolation rate: Should be <10%

## Cost Issues

**Symptom**: Document costs >$1
**Debug**:
1. Count ThematicBridge AI calls: Should be ~200
2. Check filtering cascade: Log candidates at each filter
3. Verify batching: Extraction should be ~6 batches for 500 pages
```

---

## Expected Workflow

**Before Skills**:
```
You: "Add a new connection type"
Claude: "Here's a generic approach..."
You: "No, that breaks our 3-engine system. Let me paste 50k tokens of context..."
Claude: "Ah, now I see. Here's the Rhizome way..."
```

**With Skills**:
```
You: "Add a new connection type"
Claude: [Loads rhizome-architecture skill]
"I see we have a strict 3-engine system. Adding a new connection 
type would require either:

1. Extending an existing engine (e.g., adding a contradiction subtype)
2. Replacing an engine (requires justification + testing)

Which approach fits your use case? And what problem are you solving?"
```

**Key difference**: Claude understands Rhizome's constraints BEFORE suggesting solutions.

---

## Next Steps

1. **Create the 3 core skills** I outlined above (architecture, testing, patterns)
2. **Save to** `~/.claude/skills/` (or wherever Claude expects them)
3. **Test it out**: Ask Claude Code to "add a new feature to Rhizome" and see if it uses correct patterns
4. **Iterate**: Add more skills as you encounter repeated explanations

**Timeline**: 
- Create 3 skills: 1-2 hours (mostly extracting existing docs)
- Test with Claude Code: 30 minutes
- Refine based on usage: Ongoing

Want me to actually write the complete SKILL.md files for you to save locally?


# Future-Focused Skills for Building Rhizome

Let me think through skills that would help build the features you're planning. These teach Claude about Rhizome's future direction and complex patterns.

---

## Category 1: Sparks System Architecture

### Skill: Spark Capture Patterns

**Why this skill**: Sparks are Rhizome's "quick insight capture" - needs to be fast, contextual, and convertible to other entities (threads, annotations, flashcards). This skill teaches the complete spark lifecycle.

```markdown
---
name: rhizome-spark-patterns
description: Complete patterns for spark capture, context preservation, and conversion workflows
---

# Spark Capture Patterns

## Philosophy
Sparks are **speed-first** insight capture. Design principle: "Capture now, organize later."

**Core constraint**: 0-3 seconds from thought → saved spark
**Context requirement**: Preserve WHERE the spark happened (chunk, viewport, connections visible)

## The Spark Data Model

```typescript
interface Spark {
  id: string
  user_id: string
  content: string              // 1-2 sentences max
  created_at: timestamp
  
  // Context preservation (CRITICAL)
  context: {
    document_id: string
    chunk_id: string           // Which chunk was visible
    visible_chunks: string[]   // What else was in viewport
    active_connections: {      // What connections were showing
      connection_id: string
      strength: number
      type: string
    }[]
    scroll_position: number
    viewport_start: number
    viewport_end: number
  }
  
  // Optional enrichment (async, post-capture)
  extracted_concepts?: string[]
  related_sparks?: string[]    // Other sparks with similar concepts
  suggested_tags?: string[]
  
  // Conversion tracking
  converted_to?: {
    entity_type: 'thread' | 'annotation' | 'flashcard'
    entity_id: string
    converted_at: timestamp
  }
}
```

## Capture Workflows

### Quick Capture (⌘K) - PRIMARY
**Speed target**: <1 second from keystroke to saved

```typescript
// QuickSparkModal.tsx
'use client'

export function QuickSparkModal() {
  const [content, setContent] = useState('')
  const context = useReaderContext() // Hook gets current viewport
  
  async function saveSpark() {
    // NO validation, NO confirmation - just save
    await createSparkAction({
      content,
      context: {
        document_id: context.documentId,
        chunk_id: context.visibleChunks[0], // First visible
        visible_chunks: context.visibleChunks,
        active_connections: context.activeConnections,
        scroll_position: context.scrollPosition,
        viewport_start: context.viewportStart,
        viewport_end: context.viewportEnd
      }
    })
    
    toast.success('Spark captured')
    setContent('')
    onClose()
  }
  
  return (
    <Dialog open={open}>
      <Input
        autoFocus
        placeholder="Quick thought..."
        value={content}
        onChange={(e) => setContent(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && content.trim()) {
            saveSpark()
          }
        }}
      />
    </Dialog>
  )
}
```

### Selection → Spark
User selects text → Right-click → "Capture as spark"

```typescript
// Preserve BOTH the selection AND surrounding context
await createSparkAction({
  content: selectedText,
  context: {
    ...standardContext,
    selection: {
      text: selectedText,
      start_offset: selectionStart,
      end_offset: selectionEnd,
      surrounding_text: {
        before: text.slice(selectionStart - 100, selectionStart),
        after: text.slice(selectionEnd, selectionEnd + 100)
      }
    }
  }
})
```

### AI-Suggested Sparks
System suggests "You might want to capture this"

**Triggers**:
- High connection density (3+ connections in small region)
- Contradiction without annotation
- Repeated concept across documents
- Long dwell time on paragraph (>30 seconds)

```typescript
// Background job checks these conditions
// Surfaces suggestion in RightPanel
<SparkSuggestion
  reason="High connection density"
  suggestedContent="Pattern: surveillance mechanisms across 3 books"
  onAccept={() => createSpark(suggestion)}
  onDismiss={() => dismissSuggestion(suggestion.id)}
/>
```

## Conversion Workflows

### Spark → Annotation
```typescript
async function convertSparkToAnnotation(sparkId: string) {
  const spark = await getSpark(sparkId)
  
  // Create annotation at original context
  const annotationId = await ecs.createEntity(userId, {
    annotation: {
      text: spark.context.selection?.text || '', // If from selection
      note: spark.content,
      start_offset: spark.context.viewport_start,
      end_offset: spark.context.viewport_end
    },
    source: {
      chunk_id: spark.context.chunk_id,
      document_id: spark.context.document_id
    }
  })
  
  // Mark conversion
  await updateSpark(sparkId, {
    converted_to: {
      entity_type: 'annotation',
      entity_id: annotationId,
      converted_at: new Date()
    }
  })
}
```

### Spark → Thread (Future)
```typescript
// Thread = chain of connected sparks
async function createThreadFromSparks(sparkIds: string[]) {
  const threadId = await ecs.createEntity(userId, {
    thread: {
      title: await generateThreadTitle(sparkIds),
      spark_ids: sparkIds,
      created_from: 'manual' // vs 'ai_suggested'
    }
  })
  
  // Mark all sparks as part of thread
  for (const sparkId of sparkIds) {
    await updateSpark(sparkId, {
      converted_to: {
        entity_type: 'thread',
        entity_id: threadId,
        converted_at: new Date()
      }
    })
  }
}
```

## UI Patterns

### Spark Display (RightPanel Sparks Tab)

**Sort options**:
- Recent first (default)
- By document
- By concept clustering
- Unconverted only

**Actions**:
- Convert to annotation
- Add to thread
- Generate flashcard
- Delete

```typescript
<SparkCard
  spark={spark}
  onConvert={(type) => convertSpark(spark.id, type)}
  onNavigate={() => scrollToContext(spark.context)}
  showContext={true} // Shows which document, chunk
/>
```

### Context Navigation
Click spark → Reader scrolls to original context

```typescript
async function scrollToSparkContext(spark: Spark) {
  // Navigate to document
  router.push(`/read/${spark.context.document_id}`)
  
  // Wait for render, then scroll
  await nextTick()
  scrollToChunk(spark.context.chunk_id)
  
  // Highlight region where spark was captured
  highlightRegion(
    spark.context.viewport_start,
    spark.context.viewport_end
  )
  
  // Show connections that were visible at capture time
  setActiveConnections(spark.context.active_connections)
}
```

## Background Enrichment

**After capture** (async, doesn't block user):

```typescript
async function enrichSpark(sparkId: string) {
  const spark = await getSpark(sparkId)
  
  // Extract concepts
  const concepts = await extractConcepts(spark.content)
  
  // Find related sparks (concept overlap)
  const relatedSparks = await findRelatedSparks(concepts)
  
  // Suggest tags
  const tags = await suggestTags(spark.content, concepts)
  
  await updateSpark(sparkId, {
    extracted_concepts: concepts,
    related_sparks: relatedSparks.map(s => s.id),
    suggested_tags: tags
  })
}
```

## Anti-Patterns

### ❌ Don't: Require categories at capture
Slows down capture, breaks flow

### ❌ Don't: Validate content length
Let users capture whatever length they want

### ❌ Don't: Force context selection
System should capture context automatically

### ✅ Do: Make capture instant
Save first, enrich later

### ✅ Do: Preserve rich context
More context = better organization later

### ✅ Do: Enable bulk operations
Convert 10 sparks → thread in one action
```

---

## Category 2: AI Integration Architecture

### Skill: Claude-in-Artifacts Patterns

**Why this skill**: You're building Claude completions in artifacts. This skill teaches the API patterns, cost management, and UX.

```markdown
---
name: rhizome-ai-integration
description: Patterns for Claude API integration in artifacts and chat, including cost management and context optimization
---

# AI Integration Patterns for Rhizome

## The Claude API in Artifacts

**File**: `src/components/artifacts/` (or wherever you build artifacts)

**Key principle**: Test in analysis tool FIRST, then build artifact

### Step 1: Test API Call in Analysis Tool

```typescript
// Test your prompt structure first
const response = await fetch("https://api.anthropic.com/v1/messages", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1000,
    messages: [
      { role: "user", content: "Your prompt here" }
    ]
  })
});
const data = await response.json();
const claudeResponse = data.content[0].text;
```

**Verify**:
- Response structure is correct
- Prompt produces desired output
- Cost is acceptable (~$0.003 per request for 1k tokens)

### Step 2: Build Artifact with Verified Pattern

```typescript
// React artifact with Claude API
'use client'

import { useState } from 'react'

export function DocumentChatArtifact({ documentId, chunks }) {
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(false)
  
  async function sendMessage(userMessage: string) {
    setLoading(true)
    
    // CRITICAL: Include conversation history
    const conversationHistory = [
      ...messages,
      { role: "user", content: userMessage }
    ]
    
    try {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 2000,
          messages: conversationHistory
        })
      });
      
      const data = await response.json();
      const assistantMessage = data.content[0].text;
      
      // Update conversation history
      setMessages([
        ...conversationHistory,
        { role: "assistant", content: assistantMessage }
      ])
    } catch (error) {
      console.error('Chat error:', error)
    } finally {
      setLoading(false)
    }
  }
  
  return (
    <div className="flex flex-col h-full">
      {/* Messages display */}
      <div className="flex-1 overflow-auto">
        {messages.map((msg, i) => (
          <div key={i} className={msg.role === 'user' ? 'user-msg' : 'assistant-msg'}>
            {msg.content}
          </div>
        ))}
      </div>
      
      {/* Input */}
      <input
        type="text"
        onKeyDown={(e) => {
          if (e.key === 'Enter' && e.target.value.trim()) {
            sendMessage(e.target.value)
            e.target.value = ''
          }
        }}
      />
    </div>
  )
}
```

## Context Management Strategies

### Strategy 1: Visible Chunks Only (RECOMMENDED)

**Use case**: Chat while reading
**Cost**: ~$0.01 per message (3k context tokens)

```typescript
async function chatWithVisibleChunks(userMessage: string, visibleChunks: Chunk[]) {
  const contextPrompt = `
You are chatting with a user who is reading a document. Here are the chunks currently visible in their viewport:

${visibleChunks.map((chunk, i) => `
Chunk ${i + 1}:
${chunk.content}

Metadata:
- Themes: ${chunk.themes.join(', ')}
- Page: ${chunk.page_start}
`).join('\n---\n')}

User question: ${userMessage}

Answer based on the visible chunks. If the answer requires chunks outside the viewport, tell the user.
`

  const response = await claudeAPI({
    messages: [{ role: "user", content: contextPrompt }]
  })
}
```

### Strategy 2: Full Document (EXPENSIVE)

**Use case**: Deep analysis, "search entire book"
**Cost**: ~$0.05 per message (15k context tokens for 500-page book)
**Mitigation**: Use prompt caching

```typescript
async function chatWithFullDocument(userMessage: string, documentId: string) {
  // Fetch full markdown
  const markdown = await getDocumentMarkdown(documentId)
  
  // CRITICAL: Use prompt caching to reduce costs
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "anthropic-beta": "prompt-caching-2024-07-31" // Enable caching
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 2000,
      system: [
        {
          type: "text",
          text: `You are analyzing this complete document:\n\n${markdown}`,
          cache_control: { type: "ephemeral" } // Cache the document
        }
      ],
      messages: [
        { role: "user", content: userMessage }
      ]
    })
  });
  
  // Subsequent messages reuse cached document → 10x cost reduction
}
```

### Strategy 3: Chunk Retrieval (SMART)

**Use case**: "What does the book say about X?"
**Cost**: ~$0.02 per message (5k context tokens)

```typescript
async function chatWithRetrieval(userMessage: string, documentId: string) {
  // 1. Embed user question
  const questionEmbedding = await embedText(userMessage)
  
  // 2. Find relevant chunks (semantic search)
  const relevantChunks = await supabase.rpc('match_chunks', {
    query_embedding: questionEmbedding,
    document_id: documentId,
    threshold: 0.7,
    limit: 10
  })
  
  // 3. Send only relevant chunks to Claude
  const contextPrompt = `
Based on these relevant excerpts from the document:

${relevantChunks.map((chunk, i) => `
Excerpt ${i + 1} (Page ${chunk.page_start}):
${chunk.content}
`).join('\n---\n')}

User question: ${userMessage}

Answer based on the excerpts. If more context is needed, say so.
`

  const response = await claudeAPI({
    messages: [{ role: "user", content: contextPrompt }]
  })
}
```

## Chat Modes for Rhizome

### Mode 1: Local Chat (Default)
**Context**: Only visible chunks
**Use case**: "Explain this passage"
**Cost**: $0.01/message

### Mode 2: Document Chat
**Context**: Full document (cached)
**Use case**: "Summarize the book", "Find all mentions of X"
**Cost**: $0.05 first message, $0.005 subsequent (with caching)

### Mode 3: Connection Chat
**Context**: Source chunk + connected chunks
**Use case**: "Why are these connected?", "Explain the contradiction"
**Cost**: $0.02/message

```typescript
interface ChatMode {
  mode: 'local' | 'document' | 'connection'
  context: {
    chunks: Chunk[]
    connections?: Connection[]
    full_markdown?: string
  }
  cost_estimate: string
}

function ChatModeSelector({ mode, setMode }: { mode: ChatMode, setMode: (m: ChatMode) => void }) {
  return (
    <Select value={mode.mode} onValueChange={(m) => setMode({ ...mode, mode: m })}>
      <SelectItem value="local">
        📖 Local (visible chunks) • ~$0.01/msg
      </SelectItem>
      <SelectItem value="document">
        📚 Full Document • ~$0.05/msg (cached)
      </SelectItem>
      <SelectItem value="connection">
        🔗 Connection Analysis • ~$0.02/msg
      </SelectItem>
    </Select>
  )
}
```

## Cost Tracking

```typescript
// Track API costs per session
interface CostTracker {
  session_id: string
  total_input_tokens: number
  total_output_tokens: number
  cached_tokens: number
  total_cost: number
  messages_sent: number
}

async function trackCost(usage: APIUsage) {
  const inputCost = usage.input_tokens * 0.000003  // $3 per 1M tokens
  const outputCost = usage.output_tokens * 0.000015 // $15 per 1M tokens
  const cachedCost = usage.cache_read_tokens * 0.0000003 // 90% discount
  
  await updateCostTracker({
    total_cost: inputCost + outputCost + cachedCost,
    ...usage
  })
  
  console.log(`[Cost] Message: $${(inputCost + outputCost).toFixed(4)}`)
}
```

## Structured Output Patterns

**For JSON responses** (e.g., connection analysis):

```typescript
const analysisPrompt = `
Analyze the connection between these two chunks.

Chunk A:
${chunkA.content}

Chunk B:
${chunkB.content}

Respond with ONLY a valid JSON object in this format:
{
  "connection_type": "semantic" | "contradiction" | "thematic_bridge",
  "strength": 0.0 to 1.0,
  "explanation": "brief explanation",
  "shared_concepts": ["concept1", "concept2"]
}

DO NOT include any text outside the JSON object.
`

// Parse response
let responseText = data.content[0].text
responseText = responseText.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim()
const analysis = JSON.parse(responseText)
```

## Error Handling

```typescript
async function claudeAPIWithRetry(params: APIParams, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params)
      })
      
      if (!response.ok) {
        const error = await response.json()
        if (error.type === 'rate_limit_error') {
          // Wait and retry
          await sleep(2000 * (i + 1))
          continue
        }
        throw new Error(error.message)
      }
      
      return await response.json()
    } catch (error) {
      if (i === maxRetries - 1) throw error
      await sleep(1000 * (i + 1))
    }
  }
}
```

## Anti-Patterns

### ❌ Don't: Send full document without caching
Cost explosion - $0.05 per message

### ❌ Don't: Forget conversation history
Breaks multi-turn conversations

### ❌ Don't: Use streaming in artifacts (yet)
Complicates error handling, not worth it for Rhizome

### ✅ Do: Test prompts in analysis tool first
Iterate fast without building UI

### ✅ Do: Use prompt caching for large contexts
90% cost reduction on subsequent messages

### ✅ Do: Track costs per session
Understand actual usage patterns
```

---

## Category 3: Reader Experience Design

### Skill: Rhizome Reader Patterns

**Why this skill**: The reader is Rhizome's core UI. This skill teaches the hybrid architecture and interaction patterns.

```markdown
---
name: rhizome-reader-patterns
description: Design patterns for the hybrid reader (full markdown display + chunk-level connections)
---

# Rhizome Reader Design Patterns

## The Hybrid Architecture (CRITICAL)

**Two parallel layers**:

### Display Layer (What user sees)
- Full continuous markdown from `content.md`
- No chunk boundaries
- Natural reading flow
- KaTeX math, syntax highlighting
- Annotations rendered inline

### Connection Layer (What system tracks)
- Chunks with precise offsets
- Connections between chunks
- Visible chunks in viewport
- Active connections for visible chunks

**The Bridge**: Viewport tracking maps scroll position → chunks → connections

## Component Architecture

```
DocumentPage
├── DocumentHeader (title, progress, view modes)
├── LeftPanel (outline, stats, heatmap) [collapsible]
├── VirtualizedReader (main reading area)
│   ├── BlockRenderer (markdown blocks)
│   ├── AnnotationOverlay (inline annotations)
│   └── ConnectionHighlights (visual indicators)
├── RightPanel (connections, sparks, etc.) [collapsible]
└── BottomPanel (context, quick actions) [expandable]
```

## View Modes

### Focus Mode
- Hide both sidepanels
- Maximize reading area
- Minimal distractions

### Normal Mode (Default)
- Left panel collapsed (icon bar only)
- Right panel collapsed (icon bar only)
- Balanced layout

### Explore Mode
- Both panels expanded
- Connection graph visible
- Heatmap in left panel

```typescript
type ViewMode = 'focus' | 'normal' | 'explore'

function DocumentLayout({ mode }: { mode: ViewMode }) {
  const leftVisible = mode === 'explore'
  const rightVisible = mode === 'explore'
  
  return (
    <div className="flex h-screen">
      {leftVisible && <LeftPanel />}
      {!leftVisible && <LeftPanelCollapsed />}
      
      <VirtualizedReader />
      
      {rightVisible && <RightPanel />}
      {!rightVisible && <RightPanelCollapsed />}
    </div>
  )
}
```

## Viewport Tracking Pattern

**CRITICAL for connection surfacing**:

```typescript
// useViewportTracking.ts
export function useViewportTracking(
  documentId: string,
  chunks: Chunk[]
) {
  const [visibleChunks, setVisibleChunks] = useState<Chunk[]>([])
  const [scrollPosition, setScrollPosition] = useState(0)
  
  const handleScroll = useCallback((e: ScrollEvent) => {
    const scrollTop = e.target.scrollTop
    const viewportHeight = e.target.clientHeight
    
    // Calculate visible range in document
    const viewportStart = scrollTop
    const viewportEnd = scrollTop + viewportHeight
    
    // Find chunks that overlap viewport
    const visible = chunks.filter(chunk =>
      chunk.start_offset < viewportEnd &&
      chunk.end_offset > viewportStart
    )
    
    setVisibleChunks(visible)
    setScrollPosition(scrollTop)
  }, [chunks])
  
  return {
    visibleChunks,
    scrollPosition,
    handleScroll
  }
}
```

## Connection Display Pattern

**In RightPanel, show connections for visible chunks**:

```typescript
// ConnectionsTab.tsx
export function ConnectionsTab({ documentId }: { documentId: string }) {
  const { visibleChunks } = useReaderContext()
  const [connections, setConnections] = useState<Connection[]>([])
  const weights = useConnectionWeights() // User's personal weights
  
  useEffect(() => {
    if (visibleChunks.length === 0) return
    
    // Get all connections for visible chunks
    const chunkIds = visibleChunks.map(c => c.id)
    fetchConnections(chunkIds).then(conns => {
      // Score with personal weights
      const scored = conns.map(c => ({
        ...c,
        finalScore: 
          c.semantic_strength * weights.semantic +
          c.contradiction_strength * weights.contradiction +
          c.bridge_strength * weights.thematic_bridge
      }))
      
      // Sort by score
      scored.sort((a, b) => b.finalScore - a.finalScore)
      setConnections(scored)
    })
  }, [visibleChunks])
  
  return (
    <div className="space-y-2">
      {connections.map(conn => (
        <ConnectionCard
          key={conn.id}
          connection={conn}
          onNavigate={() => scrollToChunk(conn.target_chunk_id)}
        />
      ))}
    </div>
  )
}
```

## Annotation Rendering Pattern

**Inline annotations in markdown**:

```typescript
// AnnotationOverlay.tsx
export function AnnotationOverlay({ 
  annotations, 
  scrollPosition 
}: { 
  annotations: Annotation[], 
  scrollPosition: number 
}) {
  // Get annotations visible in current viewport
  const visibleAnnotations = annotations.filter(ann =>
    ann.start_offset >= scrollPosition &&
    ann.start_offset <= scrollPosition + viewportHeight
  )
  
  return (
    <>
      {visibleAnnotations.map(ann => (
        <div
          key={ann.id}
          className="absolute"
          style={{
            top: calculateTopPosition(ann.start_offset, scrollPosition),
            left: 0,
            right: 0,
            backgroundColor: ann.color || 'yellow',
            opacity: 0.3
          }}
          onClick={() => showAnnotationDetails(ann)}
        >
          {/* Highlight region */}
        </div>
      ))}
    </>
  )
}
```

## Connection Heatmap Pattern

**Left margin density visualization**:

```typescript
// ConnectionHeatmap.tsx
export function ConnectionHeatmap({ 
  chunks, 
  connections 
}: { 
  chunks: Chunk[], 
  connections: Connection[] 
}) {
  // Calculate connection density per chunk
  const densityMap = chunks.map(chunk => {
    const chunkConnections = connections.filter(c =>
      c.source_chunk_id === chunk.id || c.target_chunk_id === chunk.id
    )
    return {
      chunkId: chunk.id,
      density: chunkConnections.length,
      position: chunk.start_offset / documentLength // 0-1
    }
  })
  
  return (
    <div className="absolute left-0 top-0 bottom-0 w-4">
      {densityMap.map(({ chunkId, density, position }) => (
        <div
          key={chunkId}
          className="absolute w-full hover:w-6 transition-all cursor-pointer"
          style={{
            top: `${position * 100}%`,
            height: '4px',
            backgroundColor: getDensityColor(density),
            opacity: Math.min(density / 10, 1)
          }}
          onClick={() => scrollToChunk(chunkId)}
          title={`${density} connections`}
        />
      ))}
      
      {/* Current position indicator */}
      <div
        className="absolute w-full h-1 bg-red-500"
        style={{ top: `${currentPosition}%` }}
      />
    </div>
  )
}

function getDensityColor(density: number): string {
  if (density > 8) return '#3b82f6' // High density - blue
  if (density > 4) return '#10b981' // Medium density - green
  return '#6b7280' // Low density - gray
}
```

## Scroll-to-Connection Pattern

**Click connection in sidebar → Jump to target**:

```typescript
async function scrollToConnection(connection: Connection) {
  // Navigate to target document if different
  if (connection.target_document_id !== currentDocumentId) {
    router.push(`/read/${connection.target_document_id}`)
    await waitForNavigation()
  }
  
  // Scroll to target chunk
  const targetChunk = await getChunk(connection.target_chunk_id)
  
  // Use Virtuoso scrollToIndex
  virtuosoRef.current?.scrollToIndex({
    index: targetChunk.chunk_index,
    align: 'center',
    behavior: 'smooth'
  })
  
  // Highlight target chunk briefly
  highlightChunk(targetChunk.id, 2000) // 2 second highlight
  
  // Show connection details in overlay
  showConnectionOverlay(connection)
}
```

## Progressive Enhancement Pattern

**Features that enhance but don't block**:

```typescript
// Reader loads in stages
export function DocumentReader({ documentId }: { documentId: string }) {
  const [markdown, setMarkdown] = useState<string>('')
  const [chunks, setChunks] = useState<Chunk[]>([])
  const [connections, setConnections] = useState<Connection[]>([])
  const [annotations, setAnnotations] = useState<Annotation[]>([])
  
  useEffect(() => {
    // Stage 1: Load markdown immediately (readable)
    loadMarkdown(documentId).then(setMarkdown)
    
    // Stage 2: Load chunks (enables viewport tracking)
    loadChunks(documentId).then(setChunks)
    
    // Stage 3: Load connections (enables sidebar)
    loadConnections(documentId).then(setConnections)
    
    // Stage 4: Load annotations (enhances display)
    loadAnnotations(documentId).then(setAnnotations)
  }, [documentId])
  
  // Reader is functional at every stage
  return (
    <VirtualizedReader
      markdown={markdown}  // Stage 1 ✅
      chunks={chunks}      // Stage 2 ✅
      connections={connections} // Stage 3 ✅
      annotations={annotations} // Stage 4 ✅
    />
  )
}
```

## Performance Patterns

### Virtualization (REQUIRED)
```typescript
// Use react-virtuoso for large documents
import { Virtuoso } from 'react-virtuoso'

<Virtuoso
  data={markdownBlocks}
  itemContent={(index, block) => (
    <BlockRenderer block={block} />
  )}
  increaseViewportBy={200} // Preload 200px above/below
/>
```

### Debounced Scroll
```typescript
const debouncedScroll = useDebouncedCallback(
  (e: ScrollEvent) => {
    updateViewportTracking(e)
    updateVisibleConnections()
  },
  100 // Update every 100ms max
)
```

### Memoized Connections
```typescript
const scoredConnections = useMemo(() => {
  return connections.map(c => ({
    ...c,
    finalScore: calculateScore(c, weights)
  })).sort((a, b) => b.finalScore - a.finalScore)
}, [connections, weights])
```

## Accessibility Patterns

```typescript
// Keyboard navigation
useKeyboardShortcuts({
  'j': () => scrollToNextChunk(),
  'k': () => scrollToPrevChunk(),
  'n': () => jumpToNextConnection(),
  'p': () => jumpToPrevConnection(),
  '/': () => openSearch(),
  'c': () => openConnectionPanel(),
  '?': () => showKeyboardShortcuts()
})

// Screen reader support
<div
  role="article"
  aria-label={documentTitle}
  aria-describedby="document-metadata"
>
  {markdown}
</div>
```

## Anti-Patterns

### ❌ Don't: Load all connections upfront
Only load for visible chunks

### ❌ Don't: Render chunk boundaries visually
Breaks reading flow

### ❌ Don't: Block rendering on connection data
Progressive enhancement

### ✅ Do: Track viewport continuously
Connections update as you scroll

### ✅ Do: Use virtualization for large docs
Performance critical for 500+ page books

### ✅ Do: Preserve scroll position on navigation
Cmd+Click connection → Back = same scroll position
```

---

## Category 4: Design System

### Skill: Rhizome Design Language

**Why this skill**: Ensures consistent UI/UX across all features.

```markdown
---
name: rhizome-design-system
description: Design language, component patterns, and interaction principles for Rhizome
---

# Rhizome Design System

## Design Philosophy

### Principles

1. **Reading First**: Nothing interrupts the reading flow
2. **Progressive Disclosure**: Show complexity only when needed
3. **Persistent UI**: No modals, use panels/docks/overlays
4. **Connection Visibility**: Make relationships obvious
5. **Personal Tool**: Optimize for power users, not onboarding

## Color Palette

### Semantic Colors
```typescript
const colors = {
  // Connection types
  semantic: '#3b82f6',      // Blue
  contradiction: '#ef4444', // Red
  thematicBridge: '#8b5cf6', // Purple
  
  // UI states
  background: '#ffffff',
  backgroundSecondary: '#f9fafb',
  border: '#e5e7eb',
  text: '#111827',
  textMuted: '#6b7280',
  
  // Interactive
  primary: '#3b82f6',
  primaryHover: '#2563eb',
  success: '#10b981',
  warning: '#f59e0b',
  error: '#ef4444',
  
  // Annotations
  highlight: '#fef3c7',
  annotationYellow: '#fbbf24',
  annotationGreen: '#34d399',
  annotationBlue: '#60a5fa',
  annotationPurple: '#a78bfa'
}
```

### Connection Type Visual Language

```typescript
// Each connection type has distinct visual identity
type ConnectionVisual = {
  icon: React.ComponentType
  color: string
  badge: string
  description: string
}

const connectionVisuals: Record<ConnectionType, ConnectionVisual> = {
  semantic: {
    icon: LinkIcon,
    color: '#3b82f6',
    badge: '📊',
    description: 'Similar content'
  },
  contradiction: {
    icon: AlertTriangle,
    color: '#ef4444',
    badge: '⚡',
    description: 'Conflicting ideas'
  },
  thematicBridge: {
    icon: Bridge,
    color: '#8b5cf6',
    badge: '🌉',
    description: 'Cross-domain link'
  }
}
```

## Typography

```css
/* Reading typography */
.prose {
  font-family: 'Georgia', serif;
  font-size: 18px;
  line-height: 1.75;
  color: #111827;
  max-width: 65ch;
}

/* UI typography */
.ui-text {
  font-family: 'Inter', sans-serif;
  font-size: 14px;
  line-height: 1.5;
}

/* Code typography */
.code {
  font-family: 'JetBrains Mono', monospace;
  font-size: 14px;
  line-height: 1.6;
}
```

## Component Patterns

### Panel Structure

**All panels follow same pattern**:

```typescript
interface PanelProps {
  collapsed: boolean
  activeTab: string
  onTabChange: (tab: string) => void
}

export function Panel({ collapsed, activeTab, onTabChange }: PanelProps) {
  if (collapsed) {
    return <CollapsedBar tabs={tabs} activeTab={activeTab} onTabChange={onTabChange} />
  }
  
  return (
    <div className="w-80 border-l bg-white flex flex-col">
      {/* Tab selector */}
      <Tabs value={activeTab} onValueChange={onTabChange}>
        <TabsList>
          {tabs.map(tab => (
            <TabsTrigger key={tab.id} value={tab.id}>
              <tab.icon className="h-4 w-4" />
              {tab.badge && <Badge>{tab.badge}</Badge>}
            </TabsTrigger>
          ))}
        </TabsList>
        
        {/* Tab content */}
        <TabsContent value={activeTab} className="flex-1 overflow-auto p-4">
          {renderTabContent(activeTab)}
        </TabsContent>
      </Tabs>
    </div>
  )
}
```

### Card Pattern

```typescript
<Card className="hover:shadow-md transition-shadow cursor-pointer">
  <CardHeader>
    <div className="flex items-start justify-between">
      <div className="flex items-center gap-2">
        <Badge variant={connection.type}>{connection.badge}</Badge>
        <CardTitle className="text-sm">{connection.target_title}</CardTitle>
      </div>
      <Badge variant="outline">{(connection.strength * 100).toFixed(0)}%</Badge>
    </div>
  </CardHeader>
  <CardContent>
    <p className="text-sm text-gray-600">{connection.explanation}</p>
  </CardContent>
  <CardFooter>
    <Button size="sm" variant="ghost" onClick={() => navigate(connection)}>
      View Connection →
    </Button>
  </CardFooter>
</Card>
```

### Dock Pattern (ProcessingDock, etc.)

```typescript
<div className="fixed bottom-4 right-4 z-50">
  {expanded ? (
    <Card className="w-96 max-h-[600px] shadow-lg">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Active Jobs</CardTitle>
          <Button size="icon" variant="ghost" onClick={collapse}>
            <ChevronDown className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="overflow-auto">
        {jobs.map(job => (
          <JobCard key={job.id} job={job} />
        ))}
      </CardContent>
    </Card>
  ) : (
    <Badge className="cursor-pointer" onClick={expand}>
      {activeJobs.length} active
    </Badge>
  )}
</div>
```

## Interaction Patterns

### Hover States

```typescript
// Connections: Show preview on hover
<ConnectionCard
  onMouseEnter={() => setHoveredConnection(connection)}
  onMouseLeave={() => setHoveredConnection(null)}
>
  {hoveredConnection === connection && (
    <ConnectionPreview connection={connection} />
  )}
</ConnectionCard>

// Chunks: Highlight connected chunks on hover
<Chunk
  onMouseEnter={() => highlightConnectedChunks(chunk.id)}
  onMouseLeave={() => clearHighlights()}
/>
```

### Loading States

```typescript
// Optimistic updates
async function createAnnotation(data: AnnotationData) {
  // Add optimistically
  const tempId = `temp-${Date.now()}`
  addAnnotationOptimistically({ ...data, id: tempId })
  
  try {
    const result = await createAnnotationAction(data)
    replaceAnnotation(tempId, result)
  } catch (error) {
    removeAnnotation(tempId)
    toast.error('Failed to create annotation')
  }
}

// Skeleton screens for long loads
{isLoading && (
  <div className="space-y-2">
    {Array.from({ length: 5 }).map((_, i) => (
      <Skeleton key={i} className="h-20 w-full" />
    ))}
  </div>
)}
```

### Empty States

```typescript
// Connections tab when no connections visible
<EmptyState
  icon={Network}
  title="No connections in viewport"
  description="Scroll to a different section or expand your viewport"
  action={
    <Button onClick={() => scrollToHighDensityRegion()}>
      Jump to Connection Cluster
    </Button>
  }
/>

// Sparks tab when no sparks
<EmptyState
  icon={Zap}
  title="No sparks yet"
  description="Capture quick insights as you read"
  action={
    <Button onClick={() => openQuickSpark()}>
      Capture First Spark (⌘K)
    </Button>
  }
/>
```

## Animation Guidelines

### Principles
- Fast transitions (100-200ms)
- Meaningful motion only
- Respect prefers-reduced-motion

```typescript
// Framer Motion variants
const fadeIn = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
  transition: { duration: 0.15 }
}

const slideIn = {
  initial: { x: -20, opacity: 0 },
  animate: { x: 0, opacity: 1 },
  transition: { duration: 0.2 }
}

// Use sparingly
<motion.div variants={fadeIn} initial="initial" animate="animate">
  {content}
</motion.div>
```

### Avoid
- Bounce animations
- Long transitions (>300ms)
- Animations on every interaction
- Parallax scrolling

## Responsive Patterns

### Breakpoints
```typescript
const breakpoints = {
  mobile: '640px',   // Single column
  tablet: '1024px',  // Collapsible panels
  desktop: '1280px'  // Full layout
}
```

### Mobile-First Components
```typescript
// Stack panels on mobile
<div className="flex flex-col md:flex-row h-screen">
  <MobileNav className="md:hidden" />
  <LeftPanel className="hidden md:flex" />
  <Reader className="flex-1" />
  <RightPanel className="hidden md:flex" />
</div>
```

## Accessibility

### Keyboard Navigation
```typescript
// Every interactive element has keyboard support
<Button
  onClick={handleClick}
  onKeyDown={(e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      handleClick()
    }
  }}
/>

// Focus management
const firstInputRef = useRef<HTMLInputElement>(null)
useEffect(() => {
  if (modalOpen) {
    firstInputRef.current?.focus()
  }
}, [modalOpen])
```

### Screen Reader Support
```typescript
<div role="region" aria-label="Connections">
  {connections.map(conn => (
    <div
      key={conn.id}
      role="article"
      aria-label={`${conn.type} connection to ${conn.target_title}`}
    >
      {conn.explanation}
    </div>
  ))}
</div>
```

### Color Contrast
- Text: 4.5:1 minimum
- Interactive elements: 3:1 minimum
- Don't rely on color alone (use icons + labels)

## Anti-Patterns

### ❌ Don't: Use modals for primary actions
Breaks persistent UI principle

### ❌ Don't: Animate on every state change
Creates visual noise

### ❌ Don't: Use red for everything negative
Reserve for critical errors only

### ✅ Do: Use consistent spacing (4px, 8px, 16px, 24px)
Tailwind defaults work well

### ✅ Do: Group related actions
Card actions in CardFooter, panel actions in header

### ✅ Do: Show connection strength visually
Color intensity, badge prominence, sort order
```

---

## How These Skills Help You Build

### Development Workflow with Skills

```
You: "I want to add AI chat to the reader"

Claude: [Loads rhizome-ai-integration skill]
"Based on the rhizome-ai-integration skill, I recommend starting 
with Mode 1: Local Chat (visible chunks only). This is:
- Fast to implement (test in analysis tool first)
- Cost-effective (~$0.01/message)
- Doesn't require prompt caching setup
- Fits the reading flow

Here's the implementation order:
1. Test API call in analysis tool with visible chunks context
2. Build React artifact with verified pattern
3. Add ChatModeSelector for future modes
4. Track costs per session

Want me to write the analysis tool test first?"
```

### Design Consistency

```
You: "Add a sparks visualization feature"

Claude: [Loads rhizome-design-system skill]
"Following the Rhizome design system:
- Use Card pattern for spark items
- Dock pattern for floating spark capture
- Connection colors for spark clustering (by concept)
- Progressive disclosure: collapsed by default

Here's a component following our patterns..."
[Generates code using exact color palette, spacing, etc.]
```

### Testing Guidance

```
You: "Should I write tests for the spark creation feature?"

Claude: [Loads rhizome-testing skill]
"Based on the Rhizome testing matrix:

CRITICAL tests (required):
✅ Sparks persist after document reprocessing
✅ Spark context preserved (chunk_id, viewport data)

STABLE tests (recommended):
✅ Spark concept extraction quality
✅ Related sparks detection

Skip:
❌ Embedding generation (vendor responsibility)

I'll write the critical tests first..."
```

---

## Recommended Next Steps

1. **Start with 3 core skills** (Architecture, Patterns, Testing) - foundational
2. **Add specialized skills as you build features**:
   - Building sparks → Add `rhizome-spark-patterns`
   - Adding AI chat → Add `rhizome-ai-integration`
   - Designing new UI → Reference `rhizome-design-system`
3. **Iterate based on actual development** - Add examples from real bugs/wins

Want me to write the complete SKILL.md files for any of these? I can create production-ready skills you can save and use immediately.