# Rhizome Architecture - Personal Knowledge Synthesis Engine

**What this is:** My external cognitive system. Every architectural decision optimizes for how I actually think, not how others might. No compromises.

**Current Status:**
- ✅ **IMPLEMENTED**: 10-stage pipeline, 3-engine detection, Storage-First portability, Job v2.0, 7 processors
- ✅ **IMPLEMENTED**: Annotations (5-component ECS), Sparks (4-component ECS v2.0)
- 🚧 **90% COMPLETE**: Document reader (missing connection visualization)
- 🚧 **PARTIAL**: Cards tab (UI placeholder only, backend not implemented)
- 📋 **PLANNED**: Study system (FSRS), Threads

## Core Philosophy

This architecture serves one user (me) and one goal: discovering connections I wouldn't make manually. AI where it provides insight, local processing everywhere else. Cost-aware design (~$0.50 per 500-page book). The only success metric: does it lead to actual creative output?

## Technical Stack

```json
{
  "infrastructure": {
    "database": "Supabase (PostgreSQL + Storage)",
    "vectors": "pgvector for embeddings",
    "worker": "Node.js processing worker (root directory)",
    "runtime": "Node.js with TypeScript"
  },
  "ai": {
    "processing": "Gemini 2.0 Flash (65k output token limit)",
    "embeddings": "gemini-embedding-001 (768 dimensions)",
    "extraction": "Batched for large documents",
    "sdk": "@google/genai v0.3+",
    "vercel-ai": "ai ^4.0.0, @ai-sdk/google ^1.0.0"
  },
  "frontend": {
    "framework": "Next.js 15 with App Router",
    "ui": "shadcn/ui + Radix primitives",
    "styling": "Tailwind CSS v4",
    "state": "Zustand + @tanstack/react-query v5"
  },
  "markdown": {
    "rendering": "remark/rehype",
    "syntax": "Shiki",
    "math": "KaTeX"
  }
}
```

## Storage Architecture - Hybrid Approach

**Core Principle:** Full documents for reading (portability), chunks for connections (precision).

```
SUPABASE STORAGE (Source of Truth)
└── userId/documentId/
    ├── source.pdf          # Original upload
    ├── content.md          # Full processed markdown (for reading)
    └── annotations.json    # Sidecar (file-over-app philosophy)

POSTGRESQL (Knowledge Graph)
├── documents     # Metadata, processing status
├── chunks        # Semantic units with rich metadata + embeddings
├── connections   # 3 engines write here, filtered at display time
├── entities      # ECS entity IDs
└── components    # ECS component data (sparks, threads, annotations)

NODE.JS WORKER (Processing Engine)
└── worker/
    ├── index.ts              # Main worker process
    ├── handlers/
    │   ├── process-document.ts
    │   └── detect-connections.ts
    ├── engines/
    │   ├── semantic-similarity.ts
    │   ├── contradiction-detection.ts
    │   └── thematic-bridge.ts
    ├── lib/
    │   ├── ai-chunking-batch.ts
    │   ├── embeddings.ts
    │   └── fuzzy-matching.ts
    └── processors/
        └── pdf-processor.ts
```

**Why Both?**
- Read continuous markdown (natural flow, Obsidian-compatible)
- Connections attach to chunks (semantic precision)
- System tracks which chunks are visible while I read full document
- Annotations use global positions but indexed by chunk for connection lookup
- Worker runs independently, can process in background without timeouts

## Database Schema

```sql
-- Documents: Metadata only (content in storage)
CREATE TABLE documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  title TEXT NOT NULL,
  author TEXT,
  source_type TEXT,
  storage_path TEXT NOT NULL,
  
  -- Processing
  processing_status TEXT DEFAULT 'pending',
  processing_error TEXT,
  
  -- Extracted metadata
  word_count INTEGER,
  page_count INTEGER,
  metadata JSONB,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Chunks: WHERE CONNECTIONS HAPPEN
CREATE TABLE chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID REFERENCES documents ON DELETE CASCADE,

  -- Content and position
  content TEXT NOT NULL,
  chunk_index INTEGER NOT NULL,
  start_offset INTEGER,  -- Position in content.md
  end_offset INTEGER,
  word_count INTEGER,

  -- Rich metadata (extracted in batches via AI)
  embedding vector(768),
  themes TEXT[] NOT NULL,
  concepts JSONB,              -- [{text: string, importance: 0-1}]
  emotional_tone JSONB,         -- {polarity: -1 to 1, primaryEmotion: string}
  importance_score FLOAT,       -- 0-1 for filtering
  summary TEXT,

  -- Extended metadata (Migration 047)
  heading_path TEXT[],          -- Hierarchical headings
  heading_level INTEGER,        -- Depth in tree
  section_marker TEXT,          -- EPUB sections
  chunker_type TEXT,            -- Which Chonkie strategy
  confidence TEXT,              -- high/medium/low/interpolated

  -- Full metadata structure
  metadata JSONB,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Connections: 3 ENGINES, FILTERED AT DISPLAY TIME
CREATE TABLE connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  
  source_chunk_id UUID REFERENCES chunks,
  target_chunk_id UUID REFERENCES chunks,
  
  -- Engine type: semantic | contradiction | thematic_bridge
  type TEXT NOT NULL,
  
  -- Strength scoring
  strength FLOAT NOT NULL,      -- 0-1, engine-specific
  
  -- Validation
  auto_detected BOOLEAN DEFAULT TRUE,
  user_validated BOOLEAN,
  
  -- Engine-specific metadata
  metadata JSONB,
  
  discovered_at TIMESTAMPTZ DEFAULT NOW(),
  
  CONSTRAINT no_self_connections CHECK (source_chunk_id != target_chunk_id)
);

-- Import pending for review workflow (Migration 040)
CREATE TABLE import_pending (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  source_type TEXT,
  title TEXT,
  author TEXT,
  raw_highlights JSONB,
  processed_data JSONB,
  import_status TEXT
);

-- Indexes for performance
CREATE INDEX idx_chunks_document ON chunks(document_id);
CREATE INDEX idx_chunks_embedding ON chunks USING ivfflat (embedding vector_cosine_ops);
CREATE INDEX idx_chunks_importance ON chunks(importance_score DESC);
CREATE INDEX idx_connections_source ON connections(source_chunk_id);
CREATE INDEX idx_connections_target ON connections(target_chunk_id);
CREATE INDEX idx_connections_type ON connections(type);
CREATE INDEX idx_connections_strength ON connections(strength DESC);
```

## Document Processing Pipeline [✅ IMPLEMENTED]

**Architecture:** Node.js worker handles all AI processing independently. Cost-aware batching for large documents.

### For Large Documents (500+ pages)

```
Upload → Storage → Worker Queue → Batched Extract → 
Stitch → Batched Metadata → Embed → Detect → Store
```

**Cost: ~$0.54 per 500-page book**

#### Stage 1: Batched PDF Extraction (~$0.12)

```typescript
// worker/processors/pdf-processor.ts

async function extractLargePDF(fileUri: string, totalPages: number) {
  const batches = [];
  const BATCH_SIZE = 100;
  const OVERLAP = 10;
  
  for (let start = 0; start < totalPages; start += BATCH_SIZE - OVERLAP) {
    const end = Math.min(start + BATCH_SIZE, totalPages);
    
    const result = await ai.models.generateContent({
      model: 'gemini-2.5-flash-lite',
      contents: [{
        parts: [
          { fileData: { fileUri, mimeType: 'application/pdf' } },
          { text: `Extract pages ${start + 1}-${end} as markdown...` }
        ]
      }],
      config: { maxOutputTokens: 65536 }
    });
    
    batches.push(result.text);
  }
  
  return batches;
}
```

#### Stage 2: Intelligent Stitching (local, free)

```typescript
function stitchMarkdownBatches(batches: ExtractionBatch[]): string {
  let stitched = batches[0].markdown;
  
  for (let i = 1; i < batches.length; i++) {
    const overlapPoint = findBestOverlap(
      batches[i - 1].markdown.slice(-2000),
      batches[i].markdown.slice(0, 3000)
    );
    
    stitched += overlapPoint > 0 
      ? batches[i].markdown.slice(overlapPoint)
      : '\n\n' + batches[i].markdown;
  }
  
  return stitched;
}
```

#### Stage 3: Batched Metadata Extraction (~$0.20)

```typescript
// worker/lib/ai-chunking-batch.ts

async function batchChunkAndExtractMetadata(
  ai: GoogleGenAI,
  markdown: string
): Promise<ChunkWithRichMetadata[]> {
  const allChunks = [];
  const WINDOW_SIZE = 100000;  // ~25k tokens
  let position = 0;
  
  while (position < markdown.length) {
    const section = markdown.slice(position, position + WINDOW_SIZE);
    
    const result = await ai.models.generateContent({
      model: 'gemini-2.5-flash-lite',
      contents: [{ parts: [{ text: `
        Extract semantic chunks (200-500 words) from this markdown.
        
        For each chunk return:
        - content: actual text
        - themes: 2-3 key topics
        - concepts: [{text, importance}] - 5-10 concepts
        - emotional_tone: {polarity: -1 to 1, primaryEmotion}
        - importance_score: 0-1
        - start_offset, end_offset
        
        Markdown: ${section}
      `}] }],
      config: { maxOutputTokens: 65536 }
    });
    
    const response = JSON.parse(result.text);
    allChunks.push(...response.chunks);
    position = response.lastProcessedOffset;
  }
  
  return allChunks;
}
```

#### Stage 4: Embedding Generation (~$0.02)

```typescript
// worker/lib/embeddings.ts

import { embedMany } from 'ai';
import { google } from '@ai-sdk/google';

export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  const { embeddings } = await embedMany({
    model: google.textEmbeddingModel('gemini-embedding-001', {
      outputDimensionality: 768
    }),
    values: texts
  });
  
  return embeddings;
}
```

### For Small Documents (<200 pages)

- Single-pass extraction
- Local chunking (heading-based) or batched AI
- Optional AI metadata or regex fallback
- Cost: ~$0.02-0.10

## 3-Engine Collision Detection System [✅ IMPLEMENTED]

**The Core Innovation:** 3 distinct engines find different connection types. Sequential execution with configurable weights.

### Orchestrator Architecture

```typescript
// worker/engines/orchestrator.ts
const orchestrator = new CollisionOrchestrator({
  engines: {
    semantic: new SemanticSimilarityEngine(),      // 25% weight
    contradiction: new ContradictionDetectionEngine(), // 40% weight
    thematic: process.env.PROCESSING_MODE === 'local'
      ? new ThematicBridgeQwenEngine()  // Local: Qwen
      : new ThematicBridgeEngine()      // Cloud: Gemini
  },
  weights: {
    semantic: 0.25,
    contradiction: 0.40,
    thematic: 0.35
  }
})
```

### Engine Implementations

#### 1. Semantic Similarity (25% weight)
- **Method**: pgvector cosine similarity
- **Threshold**: 0.7 (configurable)
- **Cost**: $0 (vector math only)
- **Finds**: "These say the same thing"

#### 2. Contradiction Detection (40% weight)
- **Method**: Metadata-based concept + polarity analysis
- **No AI calls**: Uses pre-extracted metadata
- **Strategies**: Shared concepts with opposite polarity
- **Finds**: "These disagree about the same thing"

#### 3. Thematic Bridge (35% weight)
- **Method**: AI-powered cross-domain matching
- **Filtering**: Importance >0.6, top 15 candidates per chunk
- **Local Mode**: Qwen 32B via Ollama
- **Cloud Mode**: Gemini 2.0 Flash
- **Cost**: ~$0.20 per document (after filtering)
- **Finds**: "These connect different domains"

### Connection Storage

All engines write to single `connections` table with:
- `type`: Engine identifier
- `strength`: 0-1 score
- `metadata`: Engine-specific data
- `auto_detected`: true (until user validates)
- `user_validated`: Preserved during reprocessing

## Storage-First Portability System [✅ IMPLEMENTED]

**Philosophy:** Storage is source of truth, Database is queryable cache.

### Admin Panel Architecture (Cmd+Shift+A)

```typescript
// 6 Operational Tabs
interface AdminPanel {
  scanner: CompareStorageVsDatabase,      // Find discrepancies
  import: RestoreFromStorage,             // 3 conflict strategies
  export: GenerateZipBundles,            // Complete portability
  connections: ReprocessConnections,       // Smart mode preserves validated
  integrations: ObsidianReadwise,         // External tool sync
  jobs: BackgroundJobHistory              // Complete job management
}
```

### Storage Structure

```
SUPABASE STORAGE
└── userId/documentId/
    ├── source.pdf              # Original upload
    ├── content.md              # Processed markdown
    ├── chunks.json             # Complete chunk data
    ├── metadata.json           # Document metadata
    ├── manifest.json           # Export manifest
    └── annotations.json        # Annotation backup

Benefits:
- Zero-cost restore ($0 vs $0.20-0.60 reprocessing)
- 6 minute restore vs 25 minute reprocessing
- Complete portability via ZIP export
- Disaster recovery capability
```

### Conflict Resolution Strategies

```typescript
enum ConflictStrategy {
  SKIP = 'skip',           // Keep existing
  REPLACE = 'replace',     // Overwrite with imported
  MERGE_SMART = 'merge'    // Intelligent merge by timestamp
}
```

### Export System

1. **Automatic**: After every processing completion
2. **Manual**: Via Admin Panel Export tab
3. **Format**: ZIP bundle with signed URLs (24hr expiry)
4. **Contents**: All documents or selected subset

## Background Job System v2.0 [✅ IMPLEMENTED]

**Enhancement:** Checkpoint-based pause/resume with SHA-256 validation.

### Job Architecture

```sql
-- Migration 052: Pause/Resume Support
ALTER TABLE background_jobs ADD COLUMN
  paused_at TIMESTAMPTZ,
  resumed_at TIMESTAMPTZ,
  pause_reason TEXT,
  resume_count INTEGER DEFAULT 0,
  last_checkpoint_path TEXT,
  last_checkpoint_stage TEXT,
  checkpoint_hash TEXT;
```

### Features

#### Pause & Resume
- **Checkpoint Creation**: At safe stages (review, post-chunk)
- **SHA-256 Validation**: Prevents corrupted resume
- **Graceful Fallback**: Start fresh if checkpoint invalid
- **UI Controls**: Pause/Resume buttons with validation

#### Retry System
- **Error Classification**: transient, permanent, paywall, invalid
- **Exponential Backoff**: 1min → 2min → 4min → 8min → 16min → 30min
- **Max Attempts**: 5 (configurable)
- **Auto-retry Loop**: 30-second polling

#### Progress Tracking
- **Real-time Updates**: Every 5-10 seconds
- **Detailed Status**: "Processing chunk 234 of 500"
- **Heartbeat**: Visual pulse indicator
- **Stage Progress**: 10 stages with percentages

### ProcessingDock

```typescript
// Bottom-right floating dock
interface ProcessingDock {
  visibility: 'auto-hide when admin open',
  display: 'active jobs only',
  collapse: 'mini badge mode',
  store: 'shared with admin panel'
}
```

## Cached Chunks System [✅ IMPLEMENTED]

**Purpose:** Zero-cost document reprocessing by caching Docling extraction.

### Architecture

```sql
-- Migration 046: Cached Chunks Table
CREATE TABLE cached_chunks (
  id UUID PRIMARY KEY,
  document_id UUID REFERENCES documents,
  extraction_mode TEXT, -- 'pdf' or 'epub'
  markdown_hash TEXT,   -- Invalidation detection
  chunks JSONB,         -- Full DoclingChunk array
  structure_metadata JSONB,
  created_at TIMESTAMPTZ
);
```

### Benefits

| Operation | With Cache | Without Cache |
|-----------|------------|---------------|
| Reprocess | 6 minutes | 25 minutes |
| Cost | $0.00 | $0.20-0.60 |
| API Calls | 0 | 50-200 |

### Usage

```typescript
// During initial processing (Stage 2)
await saveCachedChunks(documentId, doclingChunks)

// During reprocessing
const cached = await getCachedChunks(documentId)
if (cached && cached.markdown_hash === currentHash) {
  return cached.chunks // Skip extraction!
}
```

## Document Reader Architecture [90% COMPLETE]

**Current Implementation:** Virtualized scrolling with annotation support.

### VirtualizedReader Component

```typescript
// react-virtuoso for performance
interface ReaderState {
  markdown: string,              // Full document
  chunks: Chunk[],               // For tracking
  visibleChunks: string[],       // Viewport detection
  annotations: Annotation[],      // Injected inline
  scrollToChunk?: string,        // Navigation trigger
  correctionMode: boolean        // Chunk fixing
}
```

### Features Implemented

✅ **Virtual Scrolling**: react-virtuoso for 1000+ page documents
✅ **Markdown Rendering**: react-markdown + remark + KaTeX
✅ **Annotation System**: Selection → ECS persistence → Display
✅ **Text Selection**: useTextSelection hook with snapshot
✅ **Viewport Tracking**: Visible chunk detection for connections
✅ **Programmatic Navigation**: Scroll to chunk from RightPanel
✅ **Correction Mode**: Fix chunk quality issues

### Features Planned

📋 **Connection Visualization**:
- Heatmap in left margin (density)
- Inline highlights for active connections
- Connection strength gradients

### RightPanel (7 Tabs)

```typescript
interface Tabs {
  connections: 'Active connections for visible chunks',    // ✅
  annotations: 'All document annotations',                 // ✅
  quality: 'Chunk confidence metrics',                     // ✅
  sparks: 'Quick captures (placeholder)',                  // ⚠️
  cards: 'Flashcards (placeholder)',                       // ⚠️
  review: 'Annotation recovery workflow',                  // ✅
  tune: 'Engine weight configuration'                      // ✅
}
```

## Annotation Recovery & Sync System [✅ IMPLEMENTED]

**The Problem:** Annotations become orphaned when documents are edited (via Obsidian or direct edits). Need automatic recovery with high accuracy and zero data loss.

**The Solution:** 4-tier fuzzy matching strategy with chunk-bounded search achieves >90% recovery rate in <2 seconds for 20 annotations. Chunk-bounded search provides 50-75x performance improvement over full-text search.

### Architecture Overview

```
Document Edit → Reprocessing → Fuzzy Matching → Review UI → Accept/Discard
     ↓              ↓              ↓                ↓             ↓
  Obsidian      New Chunks   4-Tier Strategy   RightPanel   Update Positions
```

### 4-Tier Fuzzy Matching Strategy

**Tier 1: Exact Match** (fastest, 100% confidence)
```typescript
const exactIndex = markdown.indexOf(annotation.text)
if (exactIndex !== -1) {
  return { startOffset: exactIndex, confidence: 1.0, method: 'exact' }
}
```

**Tier 2: Context-Guided Levenshtein** (±100 chars context)
```typescript
// Locate contextBefore in markdown
const contextIndex = markdown.indexOf(annotation.textContext.before)
// Search bounded region near context
const searchSpace = markdown.slice(
  contextIndex,
  contextIndex + annotation.text.length * 1.3
)
// Use Levenshtein distance for precise match
return findLevenshteinInSegment(searchSpace, annotation.text)
```

**Tier 3: Chunk-Bounded Search** (50-75x faster than full-text)
```typescript
// Get ±2 chunks from original position
const boundedChunks = chunks.slice(
  annotation.originalChunkIndex - 2,
  annotation.originalChunkIndex + 3
)
// Extract ~12,500 chars vs 750K full document
const searchSpace = boundedChunks.map(c => c.content).join('')
// Search within bounded space
return findLevenshteinInSegment(searchSpace, annotation.text)
```

**Tier 4: Trigram Fallback** (existing fuzzy-matching.ts)
```typescript
// Use existing 718-line trigram system
return fuzzyMatchChunkToSource(annotation, markdown, chunks)
```

### Confidence Classification

- **≥0.85**: Auto-recovered (update position immediately)
- **0.75-0.85**: Needs review (flag for manual approval)
- **<0.75**: Marked as lost (display in review UI, don't delete)

### Recovery Pipeline

**Stage 1: Detect Change**
- User edits `content.md` in Obsidian or directly
- System detects change via sync or reprocessing trigger

**Stage 2: Transaction-Safe Reprocessing**
```typescript
// Mark old chunks as is_current: false (don't delete yet!)
await markChunksAsOld(documentId)

// Create new chunks with is_current: false
const newChunks = await reprocessDocument(documentId)

// Recover annotations with fuzzy matching
const results = await recoverAnnotations(documentId, newMarkdown, newChunks)

if (results.success.length >= 0.8 * totalAnnotations) {
  // Recovery succeeded
  await setChunksAsCurrent(newChunks)
  await deleteOldChunks(documentId)
} else {
  // Recovery failed - rollback
  await restoreOldChunks(documentId)
  await deleteNewChunks(newChunks)
  throw new Error('Recovery rate too low, rolled back')
}
```

**Stage 3: Annotation Recovery**
```typescript
async function recoverAnnotations(
  documentId: string,
  newMarkdown: string,
  newChunks: Chunk[]
): Promise<RecoveryResults> {
  const results = { success: [], needsReview: [], lost: [] }

  // Fetch all annotations for document
  const annotations = await getAnnotationsForDocument(documentId)

  for (const annotation of annotations) {
    // Try 4-tier matching strategy
    const match = findAnnotationMatch(
      {
        text: annotation.text,
        textContext: annotation.textContext,
        originalChunkIndex: annotation.chunkIndex
      },
      newMarkdown,
      newChunks
    )

    if (match.confidence >= 0.85) {
      // Auto-recover
      await updateAnnotationPosition(annotation.id, match)
      results.success.push(annotation)
    } else if (match.confidence >= 0.75) {
      // Flag for review
      await flagForReview(annotation.id, match)
      results.needsReview.push({ annotation, suggestedMatch: match })
    } else {
      // Mark as lost (don't delete)
      await markAsLost(annotation.id)
      results.lost.push(annotation)
    }
  }

  return results
}
```

**Stage 4: Connection Remapping** (for cross-document connections)
```typescript
async function remapConnections(
  documentId: string,
  newChunks: Chunk[]
): Promise<ConnectionRecoveryResults> {
  // Only remap verified connections (user_validated: true)
  const verifiedConnections = await getVerifiedConnections(documentId)

  for (const connection of verifiedConnections) {
    // Use embedding similarity to find best match
    const sourceMatch = await findBestMatch(
      connection.source_chunk.embedding,
      newChunks
    )

    const targetMatch = await findBestMatch(
      connection.target_chunk.embedding,
      newChunks
    )

    if (sourceMatch.similarity > 0.95 && targetMatch.similarity > 0.95) {
      // Auto-remap
      await updateConnection(connection.id, sourceMatch.chunk, targetMatch.chunk)
    } else if (sourceMatch.similarity > 0.85 && targetMatch.similarity > 0.85) {
      // Flag for review
      await flagConnectionForReview(connection.id, sourceMatch, targetMatch)
    } else {
      // Mark as lost
      await markConnectionAsLost(connection.id)
    }
  }
}
```

### Obsidian Integration

**Export to Obsidian**
```typescript
async function exportToObsidian(documentId: string, userId: string) {
  // Get document and user's Obsidian settings
  const { vaultPath, obsidian_path } = await getObsidianSettings(userId)

  // Download markdown from storage
  const markdown = await downloadMarkdownFromStorage(documentId)

  // Write to vault
  await fs.writeFile(
    path.join(vaultPath, obsidian_path),
    markdown,
    'utf8'
  )

  // Optionally export annotations.json
  const annotations = await getAnnotationsForDocument(documentId)
  await fs.writeFile(
    path.join(vaultPath, obsidian_path.replace('.md', '.annotations.json')),
    JSON.stringify(annotations, null, 2)
  )

  return { success: true, path: obsidian_path }
}
```

**Sync from Obsidian**
```typescript
async function syncFromObsidian(documentId: string, userId: string) {
  // Read edited markdown from vault
  const { vaultPath, obsidian_path } = await getObsidianSettings(userId)
  const editedMarkdown = await fs.readFile(
    path.join(vaultPath, obsidian_path),
    'utf8'
  )

  // Compare with current version
  const currentMarkdown = await downloadMarkdownFromStorage(documentId)

  if (editedMarkdown === currentMarkdown) {
    return { changed: false }
  }

  // Upload edited version to storage
  await uploadMarkdownToStorage(documentId, editedMarkdown)

  // Trigger reprocessing with recovery
  const results = await reprocessDocument(documentId)

  return {
    changed: true,
    recoveryResults: results.annotations,
    connectionResults: results.connections
  }
}
```

**Obsidian URI Protocol Handling**
```typescript
// Generate URI for "Edit in Obsidian" button
function getObsidianUri(vaultName: string, filePath: string): string {
  return `obsidian://advanced-uri?vault=${encodeURIComponent(vaultName)}&filepath=${encodeURIComponent(filePath)}`
}

// Trigger protocol via invisible iframe (most reliable)
function openInObsidian(uri: string) {
  const iframe = document.createElement('iframe')
  iframe.style.display = 'none'
  iframe.src = uri
  document.body.appendChild(iframe)
  setTimeout(() => iframe.remove(), 1000)
}
```

### Review UI Workflow

**RightPanel Integration**
```typescript
<RightPanel
  documentId={documentId}
  reviewResults={recoveryResults}
  onHighlightAnnotation={(annotationId) => {
    // Scroll to annotation and highlight
    scrollToAnnotation(annotationId)
  }}
>
  <Tabs defaultValue="connections">
    <TabsList>
      <TabsTrigger value="connections">Connections</TabsTrigger>
      <TabsTrigger value="annotations">Annotations</TabsTrigger>
      <TabsTrigger value="review">
        Review
        {reviewResults.needsReview.length > 0 && (
          <Badge>{reviewResults.needsReview.length}</Badge>
        )}
      </TabsTrigger>
      <TabsTrigger value="weights">Weights</TabsTrigger>
    </TabsList>

    <TabsContent value="review">
      <AnnotationReviewTab
        documentId={documentId}
        results={reviewResults}
        onHighlightAnnotation={onHighlightAnnotation}
      />
    </TabsContent>
  </Tabs>
</RightPanel>
```

**Review Tab UI**
```typescript
function AnnotationReviewTab({ results, documentId }) {
  return (
    <div>
      {/* Stats Summary */}
      <div className="grid grid-cols-3 gap-2">
        <StatCard label="Restored" value={results.success.length} icon="✓" />
        <StatCard label="Review" value={results.needsReview.length} icon="?" />
        <StatCard label="Lost" value={results.lost.length} icon="✗" />
      </div>

      {/* Review Queue */}
      <ScrollArea className="h-[400px]">
        {results.needsReview.map((item) => (
          <ReviewItem
            key={item.annotation.id}
            original={item.annotation.text}
            suggested={item.suggestedMatch.text}
            confidence={item.suggestedMatch.confidence}
            onAccept={() => handleAccept(item)}
            onDiscard={() => handleDiscard(item.annotation.id)}
            onClick={() => onHighlightAnnotation(item.annotation.id)}
          />
        ))}
      </ScrollArea>

      {/* Batch Actions */}
      <div className="flex gap-2">
        <Button onClick={handleAcceptAll}>Accept All</Button>
        <Button variant="destructive" onClick={handleDiscardAll}>
          Discard All
        </Button>
      </div>

      {/* Lost Annotations (Collapsible) */}
      <details>
        <summary>Lost Annotations ({results.lost.length})</summary>
        {results.lost.map((ann) => (
          <LostAnnotationItem key={ann.id} annotation={ann} />
        ))}
      </details>
    </div>
  )
}
```

### Readwise Import

```typescript
async function importReadwiseHighlights(
  documentId: string,
  readwiseJson: ReadwiseHighlight[]
): Promise<ImportResults> {
  const results = { imported: 0, needsReview: [], failed: [] }

  for (const highlight of readwiseJson) {
    // Try exact match first
    const exactIndex = markdown.indexOf(highlight.text)

    if (exactIndex !== -1) {
      await createAnnotation(documentId, {
        startOffset: exactIndex,
        endOffset: exactIndex + highlight.text.length,
        text: highlight.text,
        note: highlight.note,
        color: mapReadwiseColor(highlight.color)
      })
      results.imported++
      continue
    }

    // Fallback to fuzzy matching
    const estimatedChunkIndex = estimateChunkIndex(
      highlight.location,
      chunks.length
    )

    const fuzzyMatch = findAnnotationMatch(
      { text: highlight.text, originalChunkIndex: estimatedChunkIndex },
      markdown,
      chunks
    )

    if (fuzzyMatch && fuzzyMatch.confidence > 0.8) {
      results.needsReview.push({ highlight, suggestedMatch: fuzzyMatch })
    } else {
      results.failed.push({
        highlight,
        reason: fuzzyMatch
          ? `Low confidence (${fuzzyMatch.confidence})`
          : 'No match found'
      })
    }
  }

  return results
}
```

### Periodic Annotation Export

**Cron Job** (runs hourly)
```typescript
// worker/jobs/export-annotations.ts

cron.schedule('0 * * * *', async () => {
  console.log('[Annotation Export] Starting hourly export...')

  const documents = await getDocumentsWithMarkdown()

  for (const doc of documents) {
    const annotations = await getAnnotationsForDocument(doc.id)

    // Transform to portable format
    const portable = annotations.map((a) => ({
      text: a.data.originalText,
      note: a.data.note,
      color: a.data.color,
      type: a.data.type,
      position: {
        start: a.data.startOffset,
        end: a.data.endOffset
      },
      pageLabel: a.data.pageLabel,
      created_at: a.created_at,
      recovery: a.recovery_method ? {
        method: a.recovery_method,
        confidence: a.recovery_confidence
      } : undefined
    }))

    // Upload to storage
    await uploadToStorage(
      doc.markdown_path.replace('/content.md', '/.annotations.json'),
      JSON.stringify(portable, null, 2)
    )
  }

  console.log('[Annotation Export] Complete!')
})
```

### Performance Metrics

**Recovery Performance:**
- 20 annotations recovered in <2 seconds
- Chunk-bounded search: 50-75x faster than full-text (5ms vs 300ms per annotation)
- Zero AI costs (local fuzzy matching)

**Accuracy Metrics:**
- >90% recovery rate (success + needsReview)
- >85% connection remapping success
- 0% data loss for high-confidence matches (>0.85)

**Cost Impact:**
- Annotation recovery: $0 (no AI calls)
- Reprocessing: Same as initial processing (~$0.54 per 500-page book)
- Export/sync: $0 (local file operations)

## Cost Summary

**Per 500-page book:**
- Extraction: $0.12 (6 batches)
- Metadata: $0.20 (10 batches)
- Embeddings: $0.02
- Connection detection: $0.20 (ThematicBridge filtered)
- **Total: ~$0.54**

**For 100 books:** $54
**For 1000 books:** $520

Acceptable for a personal tool that actually delivers on the vision.

## Development Philosophy

### What I'm Building Now
1. Complete 3-engine system
2. Document reader with viewport tracking
3. Connection surfacing sidebar
4. Real-time weight tuning
5. Inline validation

### What I'm Explicitly Ignoring
- Worker scaling (single process is fine)
- Performance optimization (until it annoys me)
- Production patterns (this is one user)
- Feature creep (3 engines until proven insufficient)

### How I Ship
1. Idea → Code in main branch
2. Deploy worker + frontend
3. If it breaks → Fix it
4. If it doesn't help thinking → Delete it

## Success Metrics

**The only metric:** Did a connection lead to actual creative output?

- Did a chunk-level connection lead to a spark?
- Did a spark become a thread?
- Did a thread become actual writing?
- Did ThematicBridge find a cross-domain insight I wouldn't have made manually?
- Am I reading full documents while connections surface underneath?

This isn't a product. It's my external cognitive system. Build accordingly.

