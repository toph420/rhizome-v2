I need to update the processing sections to reflect the Node.js worker architecture. Here's the corrected version:

---

# Rhizome Architecture - Personal Knowledge Synthesis Engine

**What this is:** My external cognitive system. Every architectural decision optimizes for how I actually think, not how others might. No compromises.

**Current Status:**
- ✅ **IMPLEMENTED**: Upload pipeline, Node.js processing worker, chunking, fingerprinting, embeddings
- 🚧 **IN PROGRESS**: 7-engine collision detection, document reader
- 📋 **PLANNED**: Sparks, threads, Obsidian sync, study system

## Core Philosophy

This architecture serves one user (me) and one goal: discovering connections I wouldn't make manually. Performance matters when it annoys me. Scale considerations don't exist. The only success metric: does it lead to actual creative output?

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
    "processing": "Gemini 2.0 Flash",
    "embeddings": "gemini-embedding-001 (768 dimensions)",
    "extraction": "AI-first (no pdf-parse)",
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
    "rendering": "MDX with remark/rehype",
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
    ├── source-raw.txt      # YouTube: verbatim transcript with timestamps
    ├── content.md          # Full processed markdown (for reading)
    └── annotations.json    # Sidecar (file-over-app philosophy)

POSTGRESQL (Knowledge Graph)
├── documents     # Metadata, processing status
├── chunks        # Semantic units (300-500 words) with embeddings
├── connections   # All 7 engines write here, no filtering
├── entities      # ECS entity IDs
└── components    # ECS component data (sparks, threads, annotations)

NODE.JS WORKER (Processing Engine)
└── worker/
    ├── index.ts              # Main worker process
    ├── handlers/
    │   └── process-document.ts
    ├── lib/
    │   ├── gemini.ts         # AI processing
    │   ├── youtube.ts        # Transcript fetching
    │   ├── youtube-cleaning.ts
    │   ├── fuzzy-matching.ts
    │   └── embeddings.ts
    └── __tests__/
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
  source_type TEXT,  -- 'pdf', 'youtube', 'text', 'epub'
  storage_path TEXT NOT NULL,
  
  -- Processing
  processing_status TEXT DEFAULT 'pending',
  processing_started_at TIMESTAMPTZ,
  processing_completed_at TIMESTAMPTZ,
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
  content TEXT NOT NULL,  -- 300-500 words typically
  chunk_index INTEGER NOT NULL,
  chunk_type TEXT,  -- 'introduction', 'argument', 'evidence'
  start_offset INTEGER,  -- Position in content.md
  end_offset INTEGER,
  heading_path TEXT[],
  page_numbers INTEGER[],
  word_count INTEGER,
  
  -- Deep fingerprinting (THE SYNTHESIS ENGINE)
  embedding vector(768),
  themes JSONB NOT NULL,      -- ['capitalism', 'surveillance', 'control']
  tone JSONB,                 -- {emotional: 'analytical', style: 'dense'}
  patterns JSONB,             -- {structural: 'argument-evidence', narrative: 'linear'}
  concepts JSONB,             -- {primary: ['panopticon'], secondary: ['power']}
  entities JSONB,             -- {people: ['Foucault'], works: ['Discipline & Punish']}
  importance_score FLOAT,     -- 0-1 for synthesis ranking
  summary TEXT,
  
  -- YouTube-specific: fuzzy positioning
  position_context JSONB,     -- {confidence: 0.85, method: 'fuzzy', context_before: '...'}
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Connections: ALL 7 ENGINES, NO FILTERING
CREATE TABLE connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  
  source_chunk_id UUID REFERENCES chunks,
  target_chunk_id UUID REFERENCES chunks,
  
  -- Which engine detected this
  engine_type TEXT NOT NULL,  -- 'semantic'|'thematic'|'structural'|'contradiction'|'emotional'|'methodological'|'temporal'
  
  -- Strength scoring
  raw_strength FLOAT NOT NULL,      -- Before weighting (0-1)
  weighted_strength FLOAT NOT NULL, -- After applying my weights
  
  -- Validation
  auto_detected BOOLEAN DEFAULT TRUE,
  user_validated BOOLEAN,  -- null = not reviewed, true/false = confirmed/rejected
  user_hidden BOOLEAN DEFAULT FALSE,
  
  -- Engine-specific metadata
  metadata JSONB,
  
  discovered_at TIMESTAMPTZ DEFAULT NOW(),
  
  CONSTRAINT no_self_connections CHECK (source_chunk_id != target_chunk_id)
);

-- ECS: Entities are just IDs
CREATE TABLE entities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ECS: Components define behavior
CREATE TABLE components (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id UUID REFERENCES entities ON DELETE CASCADE,
  component_type TEXT NOT NULL,
  data JSONB NOT NULL,
  
  -- Denormalized for query performance
  chunk_id UUID REFERENCES chunks,
  document_id UUID REFERENCES documents,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_chunks_document ON chunks(document_id);
CREATE INDEX idx_chunks_embedding ON chunks USING ivfflat (embedding vector_cosine_ops);
CREATE INDEX idx_chunks_importance ON chunks(importance_score DESC);
CREATE INDEX idx_connections_source ON connections(source_chunk_id);
CREATE INDEX idx_connections_target ON connections(target_chunk_id);
CREATE INDEX idx_connections_engine ON connections(engine_type);
CREATE INDEX idx_connections_weighted_strength ON connections(weighted_strength DESC);
CREATE INDEX idx_components_entity ON components(entity_id);
CREATE INDEX idx_components_type ON components(component_type);
CREATE INDEX idx_components_chunk ON components(chunk_id);

-- Functional indexes for YouTube positioning
CREATE INDEX idx_chunks_position_confidence ON chunks ((position_context->>'confidence')::float);
CREATE INDEX idx_chunks_position_method ON chunks ((position_context->>'method'));

-- RLS (single user, but keeps data isolated)
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE entities ENABLE ROW LEVEL SECURITY;
ALTER TABLE components ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own data" ON documents FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users see own data" ON connections FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users see own data" ON entities FOR ALL USING (auth.uid() = user_id);
-- Similar for chunks, components
```

## Document Processing Pipeline [✅ IMPLEMENTED]

**Architecture:** Node.js worker process handles all AI processing independently. Frontend triggers jobs, worker processes asynchronously.

```
Frontend Upload → Supabase Storage → Worker Queue → 
Node.js Worker → AI Extract → Markdown → Chunk → Fingerprint → 
Embed → Store → Update Status
```

### Worker Architecture

```typescript
// worker/index.ts - Main worker process

import { createClient } from '@supabase/supabase-js'
import { GoogleGenAI } from '@google/genai'

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!)
const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_AI_API_KEY! })

// Poll for pending documents
async function pollForJobs() {
  while (true) {
    const { data: pending } = await supabase
      .from('documents')
      .select('*')
      .eq('processing_status', 'pending')
      .order('created_at', { ascending: true })
      .limit(1)
      .single()
    
    if (pending) {
      await processDocument(pending.id, pending.source_type)
    }
    
    await sleep(5000)  // Poll every 5 seconds
  }
}

pollForJobs()
```

### Processing Handler

```typescript
// worker/handlers/process-document.ts

export async function processDocument(documentId: string, sourceType: string) {
  console.log(`Processing document ${documentId} (${sourceType})`)
  
  // Update status
  await supabase
    .from('documents')
    .update({ 
      processing_status: 'processing',
      processing_started_at: new Date().toISOString()
    })
    .eq('id', documentId)
  
  try {
    switch (sourceType) {
      case 'pdf':
        await processPDF(documentId)
        break
      case 'youtube':
        await processYouTube(documentId)
        break
      case 'text':
        await processText(documentId)
        break
      default:
        throw new Error(`Unknown source type: ${sourceType}`)
    }
    
    // Mark complete
    await supabase
      .from('documents')
      .update({ 
        processing_status: 'complete',
        processing_completed_at: new Date().toISOString()
      })
      .eq('id', documentId)
    
    console.log(`✅ Document ${documentId} processed successfully`)
    
  } catch (error) {
    console.error(`❌ Processing failed:`, error)
    
    await supabase
      .from('documents')
      .update({ 
        processing_status: 'failed',
        processing_error: error.message
      })
      .eq('id', documentId)
  }
}
```

### PDF Processing

```typescript
// worker/handlers/process-document.ts

async function processPDF(documentId: string) {
  const { data: doc } = await supabase
    .from('documents')
    .select('storage_path')
    .eq('id', documentId)
    .single()
  
  // Stage 1: Download from storage
  const { data: fileData } = await supabase.storage
    .from('documents')
    .download(`${doc.storage_path}/source.pdf`)
  
  const buffer = await fileData.arrayBuffer()
  const blob = new Blob([buffer], { type: 'application/pdf' })
  
  // Stage 2: Upload to Gemini Files API
  const uploadedFile = await ai.files.upload({
    file: blob,
    config: { mimeType: 'application/pdf' }
  })
  
  // Stage 3: Wait for file to be ready
  let fileState = await ai.files.get({ name: uploadedFile.name })
  let attempts = 0
  
  while (fileState.state === 'PROCESSING' && attempts < 30) {
    await sleep(2000)
    fileState = await ai.files.get({ name: uploadedFile.name })
    attempts++
  }
  
  if (fileState.state !== 'ACTIVE') {
    throw new Error(`File validation failed: ${fileState.state}`)
  }
  
  // Stage 4: AI extraction + chunking + fingerprinting (single call)
  const result = await ai.models.generateContent({
    model: 'gemini-2.0-flash',
    contents: [{
      parts: [
        { fileData: { fileUri: uploadedFile.uri, mimeType: 'application/pdf' } },
        { text: EXTRACTION_AND_CHUNKING_PROMPT }
      ]
    }],
    config: {
      responseMimeType: "application/json",
      responseSchema: EXTRACTION_SCHEMA
    }
  })
  
  const { markdown, metadata, chunks } = JSON.parse(result.text)
  
  // Stage 5: Save full markdown to storage
  await supabase.storage
    .from('documents')
    .upload(`${doc.storage_path}/content.md`, markdown, { upsert: true })
  
  // Stage 6: Update document metadata
  await supabase
    .from('documents')
    .update({
      metadata: metadata,
      word_count: markdown.split(/\s+/).length
    })
    .eq('id', documentId)
  
  // Stage 7: Generate embeddings (batched)
  const embeddings = await generateEmbeddings(chunks.map(c => c.content))
  
  // Stage 8: Store chunks with fingerprints
  await storeChunks(documentId, chunks, embeddings)
  
  // Stage 9: Run collision detection (all 7 engines)
  for (const chunk of chunks) {
    await runCollisionDetection(chunk.id)
  }
}
```

### YouTube Processing (Specialized)

```typescript
// worker/handlers/process-document.ts

async function processYouTube(documentId: string) {
  const { data: doc } = await supabase
    .from('documents')
    .select('source_url, storage_path')
    .eq('id', documentId)
    .single()
  
  // Stage 1: Fetch transcript
  const videoId = extractYouTubeVideoId(doc.source_url)
  const transcript = await fetchYouTubeTranscript(videoId)
  const markdown = formatTranscriptToMarkdown(transcript, { includeTimestamps: true })
  
  // Stage 2: Save source-raw.txt (with timestamps)
  await supabase.storage
    .from('documents')
    .upload(`${doc.storage_path}/source-raw.txt`, markdown, { 
      contentType: 'text/markdown',
      upsert: true 
    })
  
  // Stage 3: AI cleaning (graceful degradation)
  let cleanedMarkdown = markdown
  try {
    const cleaningResult = await cleanYoutubeTranscript(ai, markdown)
    if (cleaningResult.success) {
      cleanedMarkdown = cleaningResult.cleaned
      console.log('✅ Transcript cleaned successfully')
    } else {
      console.warn(`⚠️  Cleaning failed: ${cleaningResult.error}, using original`)
    }
  } catch (error) {
    console.warn(`⚠️  Cleaning error: ${error.message}, using original`)
  }
  
  // Stage 4: Save cleaned markdown
  await supabase.storage
    .from('documents')
    .upload(`${doc.storage_path}/content.md`, cleanedMarkdown, { upsert: true })
  
  // Stage 5: Semantic rechunking
  const chunks = await rechunkMarkdown(ai, cleanedMarkdown, {
    requireMetadata: true,
    validateDefaults: true
  })
  
  // Stage 6: Fuzzy positioning (map chunks back to source)
  const { data: sourceFile } = await supabase.storage
    .from('documents')
    .download(`${doc.storage_path}/source-raw.txt`)
  
  const sourceMarkdown = await sourceFile.text()
  const positionedChunks = chunks.map((chunk, index) => {
    const matchResult = fuzzyMatchChunkToSource(
      chunk.content,
      sourceMarkdown,
      { chunkIndex: index, totalChunks: chunks.length }
    )
    
    return {
      ...chunk,
      start_offset: matchResult.start_offset,
      end_offset: matchResult.end_offset,
      position_context: {
        confidence: matchResult.confidence,
        method: matchResult.method,
        context_before: matchResult.context_before,
        context_after: matchResult.context_after
      }
    }
  })
  
  // Stage 7: Generate embeddings
  const embeddings = await generateEmbeddings(positionedChunks.map(c => c.content))
  
  // Stage 8: Store chunks
  await storeChunks(documentId, positionedChunks, embeddings)
  
  // Stage 9: Run collision detection
  for (const chunk of positionedChunks) {
    await runCollisionDetection(chunk.id)
  }
}
```

### Embedding Generation (Vercel AI SDK)

```typescript
// worker/lib/embeddings.ts

import { embedMany } from 'ai'
import { google } from '@ai-sdk/google'

export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  const { embeddings } = await embedMany({
    model: google.textEmbeddingModel('gemini-embedding-001', {
      outputDimensionality: 768
    }),
    values: texts
  })
  
  return embeddings
}
```

### Chunk Storage

```typescript
// worker/handlers/process-document.ts

async function storeChunks(
  documentId: string,
  chunks: Chunk[],
  embeddings: number[][]
) {
  const chunkInserts = chunks.map((chunk, i) => ({
    document_id: documentId,
    content: chunk.content,
    chunk_index: i,
    chunk_type: chunk.type,
    
    // Position in full markdown
    start_offset: chunk.start_offset,
    end_offset: chunk.end_offset,
    heading_path: chunk.heading_path,
    page_numbers: chunk.pageNumbers,
    word_count: chunk.word_count,
    
    // Embeddings
    embedding: embeddings[i],
    
    // Deep fingerprints (THE SYNTHESIS DATA)
    themes: chunk.themes,
    tone: chunk.tone,
    patterns: chunk.patterns,
    concepts: chunk.concepts,
    entities: chunk.entities,
    importance_score: chunk.importance_score,
    summary: chunk.summary,
    
    // YouTube-specific
    position_context: chunk.position_context
  }))
  
  await supabase.from('chunks').insert(chunkInserts)
}
```

### Key Prompts

```typescript
const EXTRACTION_AND_CHUNKING_PROMPT = `
You are an expert document processor. Your job is to extract, chunk, and deeply analyze this document.

PHASE 1 - MARKDOWN EXTRACTION:
Create a perfect markdown version preserving:
- All text verbatim (no summarization)
- Heading hierarchy (# ## ###)
- Lists, tables, blockquotes
- Footnotes as [^1]
- Mathematical equations as LaTeX: $equation$
- Page breaks as ---
- Figure captions: *Figure 1: Caption*

PHASE 2 - SEMANTIC CHUNKING:
Break into complete thought units (300-500 words typically):
- Each chunk is self-contained
- Never split mid-argument or mid-example
- Keep evidence with claims
- Natural breakpoints (sections, scene changes)
- Maintain context via heading paths

PHASE 3 - DEEP FINGERPRINTING:
For EACH chunk, identify:
- **themes**: 2-5 core concepts (e.g., ['surveillance', 'power', 'resistance'])
- **tone**: {emotional: 'analytical'|'urgent'|'contemplative', style: 'dense'|'accessible'}
- **patterns**: {structural: 'argument-evidence'|'narrative'|'definition', methodology: 'empirical'|'theoretical'}
- **concepts**: {primary: ['key ideas'], secondary: ['supporting ideas'], entities: {people: [], works: []}}
- **importance**: 0-1 score (how central is this chunk to the document's argument?)
- **summary**: One sentence describing what this chunk covers

Return as structured JSON.
`

const EXTRACTION_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    markdown: { type: Type.STRING },
    metadata: {
      type: Type.OBJECT,
      properties: {
        title: { type: Type.STRING },
        authors: { type: Type.ARRAY, items: { type: Type.STRING } },
        mainTopics: { type: Type.ARRAY, items: { type: Type.STRING } }
      }
    },
    chunks: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          content: { type: Type.STRING },
          type: { type: Type.STRING },
          themes: { type: Type.ARRAY, items: { type: Type.STRING } },
          tone: { type: Type.OBJECT },
          patterns: { type: Type.OBJECT },
          concepts: { type: Type.OBJECT },
          importance: { type: Type.NUMBER },
          summary: { type: Type.STRING },
          pageNumbers: { type: Type.ARRAY, items: { type: Type.NUMBER } }
        }
      }
    }
  }
}
```

## 7-Engine Collision Detection System [🚧 IN PROGRESS]

**The Core Innovation:** Run 7 different connection detection algorithms in parallel on every chunk. Store EVERYTHING, filter at query time based on personal weights.

### Engine Definitions (Runs in Worker)

```typescript
// worker/lib/collision/engines.ts

interface CollisionEngine {
  name: string
  weight: number  // My personal preference (adjustable in UI)
  detect: (chunk: Chunk, corpus: Chunk[]) => Promise<Connection[]>
}

const ENGINES: CollisionEngine[] = [
  {
    name: 'semantic',
    weight: 0.3,
    detect: async (chunk, corpus) => {
      // pgvector cosine similarity
      const matches = await supabase.rpc('match_chunks', {
        query_embedding: chunk.embedding,
        threshold: 0.7,
        exclude_document: chunk.document_id,
        limit: 50
      })
      
      return matches.map(m => ({
        source_chunk_id: chunk.id,
        target_chunk_id: m.id,
        engine_type: 'semantic',
        raw_strength: m.similarity,
        metadata: { similarity_score: m.similarity }
      }))
    }
  },
  
  {
    name: 'thematic',
    weight: 0.9,  // I CARE MOST ABOUT CONCEPTS
    detect: async (chunk, corpus) => {
      // Cross-domain concept matching
      const chunkThemes = new Set(chunk.themes)
      
      return corpus
        .filter(c => c.document_id !== chunk.document_id)
        .map(target => {
          const targetThemes = new Set(target.themes)
          const overlap = [...chunkThemes].filter(t => targetThemes.has(t))
          const bridgeScore = overlap.length / Math.max(chunkThemes.size, targetThemes.size)
          
          if (bridgeScore > 0.3) {
            return {
              source_chunk_id: chunk.id,
              target_chunk_id: target.id,
              engine_type: 'thematic',
              raw_strength: bridgeScore,
              metadata: { shared_themes: overlap }
            }
          }
          return null
        })
        .filter(Boolean)
    }
  },
  
  {
    name: 'structural',
    weight: 0.7,
    detect: async (chunk, corpus) => {
      // Pattern recognition across contexts
      const chunkPattern = chunk.patterns?.structural
      
      return corpus
        .filter(c => c.patterns?.structural === chunkPattern)
        .filter(c => c.document_id !== chunk.document_id)
        .map(target => ({
          source_chunk_id: chunk.id,
          target_chunk_id: target.id,
          engine_type: 'structural',
          raw_strength: 0.8,
          metadata: { pattern: chunkPattern }
        }))
    }
  },
  
  {
    name: 'contradiction',
    weight: 1.0,  // MAXIMUM FRICTION
    detect: async (chunk, corpus) => {
      // Find opposing viewpoints (AI-powered)
      const chunkThemes = new Set(chunk.themes)
      const candidates = corpus.filter(c => 
        [...c.themes].some(t => chunkThemes.has(t)) &&
        c.document_id !== chunk.document_id
      ).slice(0, 5)  // Limit to 5 for cost
      
      if (candidates.length === 0) return []
      
      const result = await ai.models.generateContent({
        model: 'gemini-2.0-flash',
        contents: [{
          parts: [{
            text: `Identify contradictions between these chunks. Return JSON array of {target_id, is_contradiction, shared_concept, tension, strength}.

Source: ${chunk.content}

Targets:
${candidates.map((c, i) => `${i}: ${c.content}`).join('\n---\n')}`
          }]
        }],
        config: { responseMimeType: "application/json", temperature: 0.3 }
      })
      
      const contradictions = JSON.parse(result.text)
      
      return contradictions
        .filter(c => c.is_contradiction)
        .map(c => ({
          source_chunk_id: chunk.id,
          target_chunk_id: candidates[c.target_id].id,
          engine_type: 'contradiction',
          raw_strength: c.strength,
          metadata: { shared_concept: c.shared_concept, tension: c.tension }
        }))
    }
  },
  
  {
    name: 'emotional',
    weight: 0.4,
    detect: async (chunk, corpus) => {
      const chunkTone = chunk.tone?.emotional
      
      return corpus
        .filter(c => c.tone?.emotional === chunkTone)
        .filter(c => c.document_id !== chunk.document_id)
        .map(target => ({
          source_chunk_id: chunk.id,
          target_chunk_id: target.id,
          engine_type: 'emotional',
          raw_strength: 0.7,
          metadata: { tone: chunkTone }
        }))
    }
  },
  
  {
    name: 'methodological',
    weight: 0.8,
    detect: async (chunk, corpus) => {
      const chunkMethod = chunk.patterns?.methodology
      
      return corpus
        .filter(c => c.patterns?.methodology === chunkMethod)
        .filter(c => c.document_id !== chunk.document_id)
        .map(target => ({
          source_chunk_id: chunk.id,
          target_chunk_id: target.id,
          engine_type: 'methodological',
          raw_strength: 0.75,
          metadata: { methodology: chunkMethod }
        }))
    }
  },
  
  {
    name: 'temporal',
    weight: 0.2,
    detect: async (chunk, corpus) => {
      const chunkTemporal = chunk.patterns?.temporal
      
      return corpus
        .filter(c => c.patterns?.temporal === chunkTemporal)
        .filter(c => c.document_id !== chunk.document_id)
        .map(target => ({
          source_chunk_id: chunk.id,
          target_chunk_id: target.id,
          engine_type: 'temporal',
          raw_strength: 0.6,
          metadata: { temporal_pattern: chunkTemporal }
        }))
    }
  }
]
```

### Collision Detection Runner (Worker)

```typescript
// worker/lib/collision/runner.ts

export async function runCollisionDetection(chunkId: string) {
  const { data: chunk } = await supabase
    .from('chunks')
    .select('*')
    .eq('id', chunkId)
    .single()
  
  // Load full corpus (for now - optimize later if needed)
  const { data: corpus } = await supabase
    .from('chunks')
    .select('*')
  
  const allConnections = []
  
  // Run ALL engines in parallel
  const engineResults = await Promise.all(
    ENGINES.map(engine => engine.detect(chunk, corpus))
  )
  
  // Flatten results
  for (const connections of engineResults) {
    for (const connection of connections) {
      // Calculate weighted strength
      const engine = ENGINES.find(e => e.name === connection.engine_type)
      const weightedStrength = connection.raw_strength * engine.weight
      
      allConnections.push({
        user_id: chunk.user_id,
        ...connection,
        weighted_strength: weightedStrength,
        auto_detected: true,
        user_validated: null,
        discovered_at: new Date().toISOString()
      })
    }
  }
  
  // Bulk insert (NO filtering by threshold)
  if (allConnections.length > 0) {
    await supabase.from('connections').insert(allConnections)
    console.log(`Found ${allConnections.length} connections for chunk ${chunkId}`)
  }
  
  return allConnections
}
```

### SQL Helper for Vector Similarity

```sql
-- Find similar chunks via pgvector
CREATE FUNCTION match_chunks(
  query_embedding vector(768),
  threshold float,
  exclude_document uuid,
  limit_count int
)
RETURNS TABLE (
  id uuid,
  content text,
  similarity float,
  document_id uuid,
  themes jsonb
) AS $$
  SELECT 
    id,
    content,
    1 - (embedding <=> query_embedding) as similarity,
    document_id,
    themes
  FROM chunks
  WHERE 
    1 - (embedding <=> query_embedding) > threshold
    AND document_id != exclude_document
  ORDER BY embedding <=> query_embedding
  LIMIT limit_count
$$ LANGUAGE SQL;
```

## The Hybrid Reader Architecture [🚧 IN PROGRESS]

**The Problem:** 
- Reading needs continuous flow (no chunk boundaries visible)
- Connections need precision (chunk-to-chunk relationships)
- Can't have both if you only display chunks

**The Solution:**

```
     Full Document                    Chunk Tracking
     (content.md)                     (database)
          │                                │
          ▼                                ▼
    ┌──────────────────┐          ┌──────────────────┐
    │  Display Layer   │◄─────────┤ Connection Layer │
    │  (Markdown)      │          │  (Chunks)        │
    └──────────────────┘          └──────────────────┘
           │                               │
           │      Viewport Tracking        │
           └───────────┬───────────────────┘
                       │
                  Annotations
             (global positions + chunk IDs)
```

### Implementation

```typescript
interface ReaderState {
  // What I see
  markdown: string              // Full document streamed from content.md
  
  // What system tracks
  visibleChunks: ChunkBoundary[]   // Which chunks are in viewport
  chunkBoundaries: Map<string, { start: number, end: number }>
  scrollPosition: number
  
  // What sidebar shows
  activeConnections: Connection[]  // For visible chunks only
  engineWeights: EngineWeights     // Real-time tuning
}

// Track which chunks are visible
function calculateVisibleChunks(scrollTop: number, scrollHeight: number): string[] {
  const viewportStart = scrollTop
  const viewportEnd = scrollTop + scrollHeight
  
  return Array.from(chunkBoundaries.entries())
    .filter(([id, bounds]) => {
      // Check if chunk overlaps with viewport
      return bounds.start < viewportEnd && bounds.end > viewportStart
    })
    .map(([id]) => id)
}

// Reader component
function DocumentReader({ documentId }) {
  const [markdown, setMarkdown] = useState('')
  const [visibleChunks, setVisibleChunks] = useState<string[]>([])
  const [weights, setWeights] = useState(DEFAULT_WEIGHTS)
  
  // Stream markdown from storage
  useEffect(() => {
    async function loadDocument() {
      const { data } = await supabase.storage
        .from('documents')
        .download(`${userId}/${documentId}/content.md`)
      
      const text = await data.text()
      setMarkdown(text)
    }
    loadDocument()
  }, [documentId])
  
  // Load chunk boundaries
  const { data: chunks } = useQuery({
    queryKey: ['chunks', documentId],
    queryFn: async () => {
      const { data } = await supabase
        .from('chunks')
        .select('id, start_offset, end_offset, chunk_index')
        .eq('document_id', documentId)
        .order('chunk_index')
      
      return data
    }
  })
  
  // Track scroll and update visible chunks
  const handleScroll = useCallback((e) => {
    const visible = calculateVisibleChunks(
      e.target.scrollTop,
      e.target.clientHeight
    )
    setVisibleChunks(visible)
  }, [chunks])
  
  // Load connections for visible chunks
  const { data: connections } = useQuery({
    queryKey: ['connections', visibleChunks, weights],
    queryFn: async () => {
      if (visibleChunks.length === 0) return []
      
      return await getConnectionsForChunks(visibleChunks, weights)
    },
    enabled: visibleChunks.length > 0
  })
  
  return (
    <div className="grid grid-cols-[1fr_400px] gap-0 h-screen">
      {/* Main content: Full markdown */}
      <div 
        className="overflow-auto p-8"
        onScroll={handleScroll}
      >
        <MarkdownRenderer content={markdown} />
      </div>
      
      {/* Sidebar: Connections for visible chunks */}
      <ConnectionsSidebar
        connections={connections}
        weights={weights}
        onWeightChange={setWeights}
        onValidate={(connId, valid) => validateConnection(connId, valid)}
      />
    </div>
  )
}
```

### Annotations Bridge Both Layers

```typescript
interface Annotation {
  id: string
  
  // For display: global position in full markdown
  position: {
    start: number,  // Character offset in content.md
    end: number
  }
  
  // For connections: which chunk does this belong to
  chunkId: string
  
  // Content
  content: {
    note?: string,
    tags: string[],
    color: 'yellow' | 'green' | 'red' | 'purple'
  }
  
  created_at: string
}

// Save to sidecar JSON (file-over-app)
async function saveAnnotation(annotation: Annotation) {
  const { data: existing } = await supabase.storage
    .from('documents')
    .download(`${userId}/${documentId}/annotations.json`)
  
  const annotations = existing ? JSON.parse(await existing.text()) : []
  annotations.push(annotation)
  
  await supabase.storage
    .from('documents')
    .upload(
      `${userId}/${documentId}/annotations.json`,
      JSON.stringify(annotations, null, 2),
      { upsert: true }
    )
}

// Also create ECS entity for synthesis
async function createAnnotationEntity(annotation: Annotation) {
  const entityId = await ecs.createEntity(userId, {
    annotation: {
      text: annotation.content.note,
      color: annotation.content.color,
      tags: annotation.content.tags
    },
    position: {
      chunk_id: annotation.chunkId,
      start_offset: annotation.position.start,
      end_offset: annotation.position.end
    },
    source: {
      document_id: documentId,
      chunk_id: annotation.chunkId
    }
  })
  
  return entityId
}
```

## ECS Architecture for Sparks & Threads

### Core ECS Implementation

```typescript
// lib/ecs/ecs.ts

class ECS {
  async createEntity(userId: string, components: Record<string, any>): Promise<string> {
    // Create entity
    const { data: entity } = await this.supabase
      .from('entities')
      .insert({ user_id: userId })
      .select()
      .single()
    
    // Create components
    const componentInserts = Object.entries(components).map(([type, data]) => ({
      entity_id: entity.id,
      component_type: type,
      data,
      chunk_id: data.chunk_id || null,
      document_id: data.document_id || null
    }))
    
    await this.supabase.from('components').insert(componentInserts)
    
    return entity.id
  }
  
  async query(
    componentTypes: string[],
    filters?: Record<string, any>
  ) {
    let query = this.supabase
      .from('entities')
      .select(`
        id,
        components!inner (
          component_type,
          data,
          chunk_id,
          document_id
        )
      `)
      .in('components.component_type', componentTypes)
    
    if (filters?.document_id) {
      query = query.eq('components.document_id', filters.document_id)
    }
    
    const { data } = await query
    return data
  }
}
```

### Component Types

```typescript
type ComponentTypes = {
  // Core content
  'annotation': {
    text: string,
    color: 'yellow' | 'green' | 'red' | 'purple',
    note?: string,
    tags: string[]
  }
  
  'flashcard': {
    question: string,
    answer: string,
    source_annotation_id?: string
  }
  
  // THE KEY ONE: Sparks capture full cognitive context
  'spark': {
    idea: string,
    emotional_valence: number,  // -1 to 1
    confidence: number,          // 0 to 1
    spark_type: 'insight' | 'question' | 'connection' | 'contradiction'
  }
  
  // Context captured at moment of spark
  'contextRef': {
    visible_chunks: string[],        // What I was reading
    active_connections: string[],    // What connections were shown
    navigation_path: string[],       // How I got here
    scroll_position: number,
    engine_states: Record<string, boolean>,  // Which engines were active
    app_state: {
      mode: 'reading' | 'writing' | 'research' | 'chaos',
      active_document: string,
      time_in_document: number  // Seconds
    }
  }
  
  // Threads evolve from sparks
  'thread': {
    state: 'seed' | 'emerging' | 'growing' | 'mature',
    spark_ids: string[],
    strength: number,  // Based on connection density
    auto_detected: boolean
  }
  
  // Study system
  'study': {
    due: Date,
    ease: number,
    interval: number,
    reviews: number,
    last_review?: Date
  }
  
  // Source tracking
  'source': {
    chunk_id?: string,
    document_id?: string,
    parent_entity_id?: string
  }
  
  // Semantic data
  'embedding': { vector: number[] }
  'themes': { themes: string[] }
}
```

### Spark Creation Flow

```typescript
// Universal spark button (Cmd+S from anywhere)
async function createSpark(idea: string, context: AppState) {
  // Capture EVERYTHING at moment of creation
  const sparkId = await ecs.createEntity(userId, {
    spark: {
      idea: idea,
      emotional_valence: analyzeValence(idea),
      confidence: 0.8,  // Default, user can adjust
      spark_type: 'insight'
    },
    
    // THE MAGIC: Full context preservation
    contextRef: {
      visible_chunks: context.reader.visibleChunks,
      active_connections: context.sidebar.connections.map(c => c.id),
      navigation_path: context.navigation.history,
      scroll_position: context.reader.scrollPosition,
      engine_states: context.weights,
      app_state: {
        mode: context.mode,
        active_document: context.documentId,
        time_in_document: context.timeInDocument
      }
    },
    
    source: {
      document_id: context.documentId,
      chunk_id: context.reader.visibleChunks[0]  // Primary chunk
    }
  })
  
  // Generate embedding for spark
  const embedding = await generateEmbedding(idea)
  await ecs.addComponent(sparkId, 'embedding', { vector: embedding })
  
  // Find connections immediately (could run in worker)
  await findRelatedEntities(sparkId, embedding)
  
  return sparkId
}

// Sparks can form connections just like chunks
async function findRelatedEntities(sparkId: string, embedding: number[]) {
  // Find related chunks
  const relatedChunks = await supabase.rpc('match_chunks', {
    query_embedding: embedding,
    threshold: 0.7,
    limit: 10
  })
  
  // Find related sparks (past ideas)
  const { data: sparks } = await ecs.query(['spark', 'embedding'])
  const relatedSparks = sparks
    .filter(s => s.id !== sparkId)
    .map(s => ({
      spark: s,
      similarity: cosineSimilarity(embedding, s.embedding.vector)
    }))
    .filter(s => s.similarity > 0.7)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, 10)
  
  // Store connections
  for (const chunk of relatedChunks) {
    await supabase.from('connections').insert({
      source_entity_id: sparkId,
      target_chunk_id: chunk.id,
      engine_type: 'semantic',
      raw_strength: chunk.similarity,
      weighted_strength: chunk.similarity * 0.9  // High weight for sparks
    })
  }
  
  for (const { spark, similarity } of relatedSparks) {
    await supabase.from('connections').insert({
      source_entity_id: sparkId,
      target_entity_id: spark.id,
      engine_type: 'semantic',
      raw_strength: similarity,
      weighted_strength: similarity * 1.0
    })
  }
}
```

### Thread Evolution (Could Run in Worker)

```typescript
// Auto-detect when sparks should form threads
async function detectThreads() {
  const { data: sparks } = await ecs.query(['spark', 'source'])
  
  // Group by temporal clustering (within 30 minutes)
  const clusters = groupByTime(sparks, 30 * 60 * 1000)
  
  for (const cluster of clusters) {
    if (cluster.length < 3) continue  // Need at least 3 sparks
    
    // Check connection density
    const connections = await getConnectionsBetweenSparks(cluster.map(s => s.id))
    const density = connections.length / (cluster.length * (cluster.length - 1) / 2)
    
    if (density > 0.3) {  // 30% of possible connections exist
      // Create thread entity
      const threadId = await ecs.createEntity(userId, {
        thread: {
          state: 'emerging',
          spark_ids: cluster.map(s => s.id),
          strength: density,
          auto_detected: true
        }
      })
      
      console.log(`Created thread from ${cluster.length} sparks (density: ${density})`)
    }
  }
}
```

## Obsidian Integration (Important Feature)

**Goal:** Bidirectional sync. Vault files become Rhizome documents, Rhizome metadata enriches vault.

### Sync Strategy

```typescript
async function syncWithObsidian() {
  // 1. Detect vault changes (file watcher or manual trigger)
  const vaultChanges = await detectVaultChanges(vaultPath)
  
  for (const file of vaultChanges.modified) {
    // 2. Read updated markdown
    const markdown = await fs.readFile(file.path, 'utf-8')
    
    // 3. Find existing document or create new
    let doc = await findDocumentByPath(file.path)
    if (!doc) {
      doc = await createDocument({
        title: file.name,
        source_type: 'obsidian',
        storage_path: file.path
      })
    }
    
    // 4. Save markdown to storage
    await supabase.storage
      .from('documents')
      .upload(`${userId}/${doc.id}/content.md`, markdown, { upsert: true })
    
    // 5. Trigger worker to rechunk + re-fingerprint
    await supabase
      .from('documents')
      .update({ processing_status: 'pending' })
      .eq('id', doc.id)
    
    // Worker picks it up and:
    // - Rechunks document
    // - Regenerates fingerprints
    // - Re-runs all 7 collision engines
  }
  
  // 6. Push Rhizome metadata back to Obsidian
  for (const doc of await getAllDocuments()) {
    const metadata = await generateObsidianFrontmatter(doc.id)
    await updateObsidianFrontmatter(doc.storage_path, metadata)
  }
}
```

## File Structure

```
rhizome/
├── app/                      # Next.js frontend
│   ├── (auth)/
│   ├── (main)/
│   │   ├── page.tsx
│   │   └── read/[id]/page.tsx
│   └── api/
│
├── components/
│   ├── reader/
│   ├── synthesis/
│   └── ui/
│
├── lib/
│   ├── ecs/
│   └── utils/
│
├── stores/
├── hooks/
│
├── worker/                   # Node.js processing worker
│   ├── index.ts             # Main worker process
│   ├── handlers/
│   │   └── process-document.ts
│   ├── lib/
│   │   ├── gemini.ts
│   │   ├── youtube.ts
│   │   ├── youtube-cleaning.ts
│   │   ├── fuzzy-matching.ts
│   │   ├── embeddings.ts
│   │   └── collision/
│   │       ├── engines.ts
│   │       └── runner.ts
│   └── __tests__/
│
└── supabase/
    └── migrations/
```

## Development Philosophy

### What I'm Building Now (Priority Order)
1. Finish 7-engine collision detection (in worker)
2. Document reader with hybrid architecture
3. Connection surfacing sidebar
4. Real-time weight tuning UI
5. Inline connection validation

### What I'm Explicitly Ignoring
- Worker scaling (single process is fine)
- Performance optimization (until it annoys me)
- Clean architecture (working code > pretty code)
- Test coverage (I am the test)
- Error recovery (I'll fix the database manually)

### How I Ship
1. Idea → Code in main branch
2. Deploy worker + frontend
3. If it breaks → Fix it
4. If it doesn't help thinking → Delete it

## Success Metrics

**The only metric that matters:** Did a connection lead to actual creative output?

Measuring:
- Did a chunk-level connection lead to a spark?
- Did a spark become a thread?
- Did a thread become actual writing?
- Did I discover something I wouldn't have found manually?
- Am I actually reading full documents while connections surface underneath?

This isn't a product. It's my external cognitive system. Build accordingly.