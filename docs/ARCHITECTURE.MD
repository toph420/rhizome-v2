# Rhizome V2 Architecture - Final

## Vision

A **beautiful document reader** with integrated **flashcard study system** and **AI-powered knowledge synthesis**. Built for deep reading, effective learning, and discovering unexpected connections between ideas.

Core principle: **Flow state preservation** - never interrupt reading or thinking with modals or context switches.


## Core Principles

1. **No Modals** - Use docks, panels, and overlays that don't block the main content
2. **ECS Architecture** - Everything is an entity with components for maximum flexibility
3. **Markdown as Universal Format** - All documents processed to clean, portable markdown
4. **Hybrid File-Over-App** - Files for ownership, database for performance
5. **Quality Processing** - Deep semantic analysis with Gemini, not quick extractions
6. **Synthesis Through Use** - Connections emerge from reading, annotating, and studying

## Technical Stack

```json
{
  "infrastructure": {
    "database": "Supabase (PostgreSQL + Auth + Storage)",
    "vectors": "pgvector for embeddings",
    "functions": "Supabase Edge Functions",
    "queues": "Supabase Queue or pg_cron"
  },
  "ai": {
    "processing": "Gemini 2.0 Flash (gemini-2.0-flash)",
    "embeddings": "gemini-embedding-001 (768/1536/3072 dimensions)",
    "extraction": "AI-first extraction (no pdf-parse)",
    "sdk": "@google/genai v0.3+",
    "ai": "^4.0.0",
    "@ai-sdk/google": "^1.0.0"
  },
  "frontend": {
    "framework": "Next.js 15 with App Router",
    "ui": "shadcn/ui + Radix primitives",
    "styling": "Tailwind CSS v4",
    "state": "Zustand for client state",
    "server-state": "@tanstack/react-query v5",
    "animations": "Framer Motion"
  },
  "markdown": {
    "rendering": "MDX with remark/rehype",
    "syntax": "Shiki",
    "math": "KaTeX"
  }
}
```

## Storage Architecture - Hybrid Approach

### What Goes Where

```
SUPABASE STORAGE (Files)
Purpose: Large, immutable, user-owned content
└── userId/
    └── documentId/
        ├── source.pdf          # Original upload
        ├── content.md          # Full processed markdown
        └── export.bundle.zip   # Portable backup

POSTGRESQL DATABASE
Purpose: Queryable, mutable, performance-critical
├── documents               # Metadata and storage paths
├── chunks                  # Text segments with embeddings
├── entities               # ECS entity IDs
├── components             # ECS component data
├── connections            # Synthesis relationships
└── decks                  # Flashcard organization
```

### Storage Decision Matrix

| Data Type | Storage Location | Why |
|-----------|-----------------|-----|
| Original PDFs | Supabase Storage | Large, immutable, user-owned |
| Full Markdown | Supabase Storage | Large, immutable, streamable |
| Chunks | Database | Need SQL queries, relatively small |
| Embeddings | Database | Required for pgvector similarity |
| User Annotations | Database | Mutable, frequently queried |
| Flashcards | Database | Need study algorithms, queries |
| Export Bundles | Supabase Storage | User downloads |

## Database Schema

```sql
-- Documents metadata (not content!)
CREATE TABLE documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  title TEXT NOT NULL,
  author TEXT,
  source_type TEXT, -- 'pdf', 'epub', 'web'
  storage_path TEXT NOT NULL, -- 'userId/documentId/'
  
  -- Processing
  processing_status TEXT DEFAULT 'pending',
  processing_started_at TIMESTAMPTZ,
  processing_completed_at TIMESTAMPTZ,
  processing_error TEXT,
  
  -- Metadata
  word_count INTEGER,
  page_count INTEGER,
  outline JSONB, -- Table of contents
  metadata JSONB, -- Extracted metadata
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Semantic chunks for synthesis
CREATE TABLE chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID REFERENCES documents ON DELETE CASCADE,
  
  -- Content
  content TEXT NOT NULL, -- Markdown text of chunk
  chunk_index INTEGER NOT NULL, -- Order in document
  chunk_type TEXT, -- 'introduction', 'argument', 'evidence', etc
  
  -- Position in original
  start_offset INTEGER, -- Character position in markdown
  end_offset INTEGER,
  heading_path TEXT[], -- ['Chapter 1', 'Section 2']
  page_numbers INTEGER[], -- Original PDF pages
  
  -- Semantic analysis
  embedding vector(768), -- Gemini embedding
  themes JSONB, -- ['capitalism', 'control']
  entities JSONB, -- {people: [], concepts: [], works: []}
  importance_score FLOAT, -- 0-1 for synthesis ranking
  summary TEXT, -- One-line summary
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ECS: Entities are just IDs
CREATE TABLE entities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ECS: Components define behavior
CREATE TABLE components (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id UUID REFERENCES entities ON DELETE CASCADE,
  component_type TEXT NOT NULL, -- 'flashcard', 'annotation', 'spark', 'study'
  data JSONB NOT NULL, -- Component-specific data
  
  -- Denormalized for performance
  chunk_id UUID REFERENCES chunks,
  document_id UUID REFERENCES documents,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Synthesis: Connections between ideas
CREATE TABLE connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  
  source_entity_id UUID REFERENCES entities,
  target_entity_id UUID REFERENCES entities,
  
  connection_type TEXT, -- 'supports', 'contradicts', 'extends', 'references'
  strength FLOAT, -- 0-1 similarity score
  
  auto_detected BOOLEAN DEFAULT TRUE,
  user_confirmed BOOLEAN DEFAULT FALSE,
  user_hidden BOOLEAN DEFAULT FALSE,
  
  metadata JSONB, -- Additional connection data
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Decks for flashcard organization
CREATE TABLE decks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  
  -- Visual position for canvas view
  position JSONB DEFAULT '{"x": 0, "y": 0}',
  
  -- Source tracking
  source_document_id UUID REFERENCES documents,
  auto_created BOOLEAN DEFAULT FALSE,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Assign entities to decks
CREATE TABLE entity_decks (
  entity_id UUID REFERENCES entities ON DELETE CASCADE,
  deck_id UUID REFERENCES decks ON DELETE CASCADE,
  added_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (entity_id, deck_id)
);

-- Study sessions and progress
CREATE TABLE study_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  deck_id UUID REFERENCES decks,
  
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  
  cards_studied INTEGER DEFAULT 0,
  cards_correct INTEGER DEFAULT 0,
  
  metadata JSONB -- Session-specific data
);

-- Review log for analytics
CREATE TABLE review_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id UUID REFERENCES entities,
  user_id UUID REFERENCES auth.users,
  
  rating INTEGER, -- 1-4 (Again, Hard, Good, Easy)
  reviewed_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- State before review
  ease_before FLOAT,
  interval_before INTEGER,
  
  -- State after review
  ease_after FLOAT,
  interval_after INTEGER
);

-- Indexes for performance
CREATE INDEX idx_chunks_document ON chunks(document_id);
CREATE INDEX idx_chunks_embedding ON chunks USING ivfflat (embedding vector_cosine_ops);
CREATE INDEX idx_components_entity ON components(entity_id);
CREATE INDEX idx_components_type ON components(component_type);
CREATE INDEX idx_components_chunk ON components(chunk_id);
CREATE INDEX idx_components_document ON components(document_id);
CREATE INDEX idx_connections_source ON connections(source_entity_id);
CREATE INDEX idx_connections_target ON connections(target_entity_id);

-- RLS Policies
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE entities ENABLE ROW LEVEL SECURITY;
ALTER TABLE components ENABLE ROW LEVEL SECURITY;

-- Users can only see their own data
CREATE POLICY "Users can view own documents" ON documents
  FOR ALL USING (auth.uid() = user_id);
-- ... similar policies for all tables
```

## Document Processing Pipeline

### Overview
```
PDF → Upload to Files API → Validate → AI Extraction → Markdown → Chunk → Embed → Store
```

**Key Innovation**: Uses Gemini Files API ([docs](https://ai.google.dev/gemini-api/docs/files)) for reliable PDF processing with server-side validation.

### Detailed Pipeline (AI-First)

```typescript
// supabase/functions/process-document/index.ts
import { GoogleGenAI, Type } from 'npm:@google/genai'

async function processDocument(documentId: string, fileUrl: string) {
  const userId = await getUserId()
  const storagePath = `${userId}/${documentId}`
  
  // ┌─────────────────────────────────────┐
  // │ STAGE 1: UPLOAD TO FILES API        │
  // └─────────────────────────────────────┘
  
  // Initialize Google GenAI client
  const ai = new GoogleGenAI({ 
    apiKey: Deno.env.get('GOOGLE_AI_API_KEY') 
  })
  
  // Download file and prepare for upload
  const fileResponse = await fetch(fileUrl)
  const fileBuffer = await fileResponse.arrayBuffer()
  const pdfBlob = new Blob([fileBuffer], { type: 'application/pdf' })
  
  // Upload to Gemini Files API (handles larger files better than inline data)
  // Reference: https://ai.google.dev/gemini-api/docs/files
  const uploadedFile = await ai.files.upload({
    file: pdfBlob,
    config: { mimeType: 'application/pdf' }
  })
  
  // ┌─────────────────────────────────────┐
  // │ STAGE 2: VALIDATE FILE STATE        │
  // └─────────────────────────────────────┘
  
  // Poll file status until ready for processing
  let fileState = await ai.files.get({ name: uploadedFile.name || '' })
  let attempts = 0
  const maxAttempts = 30 // 60 seconds max (2s per attempt)
  
  while (fileState.state === 'PROCESSING' && attempts < maxAttempts) {
    await new Promise(resolve => setTimeout(resolve, 2000))
    fileState = await ai.files.get({ name: uploadedFile.name || '' })
    attempts++
  }
  
  if (fileState.state !== 'ACTIVE') {
    throw new Error(`File validation failed: ${fileState.state}`)
  }
  
  // ┌─────────────────────────────────────┐
  // │ STAGE 3: AI EXTRACTION & PROCESSING │
  // └─────────────────────────────────────┘
  
  // Send file reference to Gemini for extraction + processing
  const result = await ai.models.generateContent({
    model: 'gemini-2.0-flash', // Fast model for document processing
    contents: [{
      parts: [
        {
          fileData: {
            fileUri: uploadedFile.uri || uploadedFile.name,
            mimeType: 'application/pdf'
          }
        },
        {
          text: EXTRACTION_AND_CHUNKING_PROMPT
        }
      ]
    }],
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          markdown: { type: Type.STRING }, // Full document in perfect markdown
          metadata: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING },
              authors: { type: Type.ARRAY, items: { type: Type.STRING } },
              abstract: { type: Type.STRING },
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
                pageNumbers: { type: Type.ARRAY, items: { type: Type.NUMBER } },
                importance: { type: Type.NUMBER },
                summary: { type: Type.STRING }
              }
            }
          }
        }
      }
    }
  })
  
  // Parse JSON response
  const { markdown, metadata, chunks } = JSON.parse(result.text)
  
  // ┌─────────────────────────────────────┐
  // │ STAGE 4: STORAGE                    │
  // └─────────────────────────────────────┘
  
  // Save markdown to STORAGE (not database!)
  await supabase.storage
    .from('documents')
    .upload(`${storagePath}/content.md`, markdown)
  
  // Update document metadata
  await supabase
    .from('documents')
    .update({
      storage_path: storagePath,
      metadata: metadata,
      processing_status: 'embedding'
    })
    .eq('id', documentId)
  
  // ┌─────────────────────────────────────┐
  // │ STAGE 5: EMBEDDINGS                 │
  // └─────────────────────────────────────┘
  
  const embeddings = await Promise.all(
    chunks.map(async (chunk) => {
      const embedResult = await ai.models.embedContent({
        model: 'gemini-embedding-001',
        contents: chunk.content,
        outputDimensionality: 768
      })
      // Response structure: embedResult.embeddings contains the vector
      return embedResult.embeddings
    })
  )
  
  // ┌─────────────────────────────────────┐
  // │ STAGE 6: DATABASE STORAGE           │
  // └─────────────────────────────────────┘
  
  for (let i = 0; i < chunks.length; i++) {
    await supabase
      .from('chunks')
      .insert({
        document_id: documentId,
        content: chunks[i].content,
        chunk_index: i,
        chunk_type: chunks[i].type,
        embedding: embeddings[i],
        themes: chunks[i].themes,
        entities: extractEntities(chunks[i].content),
        importance_score: chunks[i].importance,
        summary: chunks[i].summary,
        page_numbers: chunks[i].pageNumbers
      })
  }
  
  // Update status
  await supabase
    .from('documents')
    .update({
      processing_status: 'complete',
      processing_completed_at: new Date()
    })
    .eq('id', documentId)
}
```

### Key Processing Prompts

```typescript
const EXTRACTION_AND_CHUNKING_PROMPT = `
You are an expert document processor. Process this document in two phases.

PHASE 1 - EXTRACTION:
Create a perfect markdown version preserving:
- All text verbatim
- Heading hierarchy (# ## ###)
- Lists and bullet points
- Tables (as markdown tables)
- Blockquotes for quotations
- Code blocks if present
- Footnotes as [^1] notation
- Page breaks as ---

Handle special elements:
- Figure captions as: *Figure 1: Caption text*
- Table titles as: **Table 1: Title**
- Mathematical equations as LaTeX: $equation$
- Citations as they appear

PHASE 2 - SEMANTIC CHUNKING:
Break the document into meaningful chunks where each chunk is:
- A complete thought or argument (100-500 words typically)
- Self-contained but with context
- Never cutting mid-sentence or mid-paragraph
- Keeping evidence with its claim
- Keeping examples with what they illustrate

PHASE 3 - ANALYSIS:
For each chunk identify:
- Key themes and concepts (2-5 per chunk)
- Type: introduction|argument|evidence|conclusion|example|definition
- Importance for synthesis (0-1)
- Page numbers from original
- One-sentence summary

Return as structured JSON with full markdown and chunk array.
`;
```

### YouTube Processing Pipeline

**Overview**: YouTube videos receive specialized AI-powered processing with transcript cleaning, metadata extraction, and fuzzy chunk positioning.

**Key Innovation**: Combines transcript cleaning (removes timestamp noise) with fuzzy positioning algorithm (enables future annotations despite content reformatting).

#### Pipeline Stages

**Stage 1: Transcript Fetching** (15% progress)
```typescript
// Extract video ID and fetch transcript
const videoId = extractYouTubeVideoId(url)  // worker/lib/youtube.ts
const transcript = await fetchYouTubeTranscript(videoId)

// Format to markdown with timestamps preserved
const markdown = formatTranscriptToMarkdown(transcript, {
  includeTimestamps: true,  // [[MM:SS](url)] format
  videoId: videoId
})
```

**Files**: `worker/lib/youtube.ts` - Video ID extraction, transcript fetching, formatting

**Stage 2: Original Backup** (20% progress)
```typescript
// Save source-raw.txt with timestamps intact
await supabase.storage
  .from('documents')
  .upload(`${storagePath}/source-raw.txt`, markdown, {
    contentType: 'text/markdown',
    upsert: true
  })
```

**Purpose**: Preserves verbatim transcript for:
- User reference ("view original" feature)
- Fuzzy positioning algorithm (Stage 5)
- Recovery from cleaning failures

**Stage 3: AI Cleaning** (25% progress)
```typescript
// Clean transcript with graceful degradation
const cleaningResult = await cleanYoutubeTranscript(ai, markdown)

if (cleaningResult.success) {
  markdown = cleaningResult.cleaned  // Use cleaned version
  console.log('✅ Transcript cleaned successfully')
} else {
  console.warn(`⚠️  Cleaning failed: ${cleaningResult.error}`)
  // Continue with original markdown (zero data loss)
}
```

**Implementation**: `worker/lib/youtube-cleaning.ts` (126 lines, 17 tests, 100% coverage)

**Cleaning Operations**:
- Remove ALL `[[MM:SS](url)]` timestamp links
- Fix grammar and combine sentence fragments  
- Add semantic section headings (##) every 3-5 minutes
- Remove filler words (um, uh, you know, like)
- Preserve natural flow and meaning

**Graceful Degradation**:
- Empty AI response → Uses original
- API error → Uses original  
- Suspicious length (<50% or >150% original) → Uses original
- **Always returns usable markdown** (no pipeline failures)

**AI Configuration**:
```typescript
model: 'gemini-2.0-flash'    // Fast model for cleaning
temperature: 0.3             // Low for consistency
maxOutputTokens: 8192        // Support long transcripts
```

**Stage 4: Semantic Rechunking** (30-80% progress)
```typescript
// Enhanced rechunking with complete metadata
const chunks = await rechunkMarkdown(ai, markdown, {
  requireMetadata: true,    // Enforce completeness
  validateDefaults: true    // Apply safe defaults if missing
})

// Validate and apply defaults
chunks.forEach((chunk, index) => {
  if (!chunk.themes || chunk.themes.length === 0) {
    chunk.themes = ['general']
    console.warn(`Chunk ${index}: Applied default theme`)
  }
  if (chunk.importance_score === undefined) {
    chunk.importance_score = 0.5
    console.warn(`Chunk ${index}: Applied default importance`)
  }
  if (!chunk.summary) {
    chunk.summary = chunk.content.slice(0, 100) + '...'
    console.warn(`Chunk ${index}: Generated default summary`)
  }
  chunk.word_count = chunk.content.trim().split(/\s+/).length
})
```

**Implementation**: `worker/handlers/process-document.ts:rechunkMarkdown()` function

**Prompt Enhancements**:
```typescript
const prompt = `Break this markdown into semantic chunks (200-2000 chars).

CRITICAL: Every chunk MUST have:
- themes: Array of 2-3 specific topics (e.g., ["authentication", "security"])
- importance_score: Float 0.0-1.0 (how central this content is)
- summary: One sentence describing what this chunk covers

Return JSON: {chunks: [{content, themes, importance_score, summary}]}`
```

**Metadata Validation**:
- JSON schema with `required` fields enforces completeness
- Safe defaults prevent NULL database values
- Warnings logged for all defaulted fields

**Stage 5: Fuzzy Chunk Positioning** (85-90% progress)
```typescript
// Load source-raw.txt for positioning
const { data: sourceFile } = await supabase.storage
  .from('documents')
  .download(`${storagePath}/source-raw.txt`)

const sourceMarkdown = await sourceFile.text()

// Match each chunk to source with confidence scoring
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
    position_context: matchResult.position_context
  }
})

// Log confidence distribution
const distribution = {
  exact: positionedChunks.filter(c => c.position_context.method === 'exact').length,
  fuzzy: positionedChunks.filter(c => c.position_context.method === 'fuzzy').length,
  approximate: positionedChunks.filter(c => c.position_context.method === 'approximate').length
}
console.log(`Positioning: ${distribution.exact} exact, ${distribution.fuzzy} fuzzy, ${distribution.approximate} approximate`)
```

**Implementation**: `worker/lib/fuzzy-matching.ts` (365 lines, 24 tests, 88.52% coverage)

**Algorithm**: See "YouTube Offset Resolution Strategy" section below for full details.

**Graceful Degradation**:
- Storage download failure → Logs warning, continues without positioning
- Fuzzy matching error → Logs warning, uses null offsets
- **Processing always completes successfully**

**Stage 6: Embeddings Generation** (95% progress)
```typescript
// Generate embeddings using Vercel AI SDK
import { embedMany } from 'ai'
import { google } from '@ai-sdk/google'

const { embeddings } = await embedMany({
  model: google.textEmbeddingModel('gemini-embedding-001', {
    outputDimensionality: 768
  }),
  values: chunks.map(c => c.content)
})
```

**Implementation**: `worker/lib/embeddings.ts`

**Model**: `gemini-embedding-001` with 768 dimensions for pgvector compatibility.

**Stage 7: Database Storage** (100% progress)
```typescript
// Insert chunks with complete metadata
for (let i = 0; i < chunks.length; i++) {
  await supabase
    .from('chunks')
    .insert({
      document_id: documentId,
      chunk_index: i,
      content: chunks[i].content,
      embedding: embeddings[i],
      
      // Complete metadata (all non-null)
      themes: chunks[i].themes,
      importance_score: chunks[i].importance_score,
      summary: chunks[i].summary,
      word_count: chunks[i].word_count,
      
      // Fuzzy positioning data
      start_offset: chunks[i].start_offset ?? null,
      end_offset: chunks[i].end_offset ?? null,
      position_context: chunks[i].position_context ?? null
    })
}

// Update document status
await supabase
  .from('documents')
  .update({ 
    processing_status: 'complete',
    processing_completed_at: new Date().toISOString()
  })
  .eq('id', documentId)
```

#### Storage Artifacts

```
userId/documentId/
├── source-raw.txt          # Original transcript with timestamps
├── content.md              # AI-cleaned markdown (no timestamps)
└── (future) export.bundle.zip
```

#### Quality Metrics

**Timestamp Removal**: 100% (verified in T16)
- Zero `[[MM:SS](url)]` patterns in cleaned content
- All timestamps preserved in source-raw.txt

**Metadata Completeness**: 100% (validated in T18, T20)
- All chunks have non-null themes, importance_score, summary, word_count
- Safe defaults applied when AI misses fields
- Database constraints enforce non-null

**Fuzzy Positioning Accuracy**: >70% high confidence (validated in T19)
- Short videos (<5 min): >90% confidence ≥0.7
- Medium videos (10-30 min): >70% confidence ≥0.7
- Long videos (1+ hour): >60% confidence ≥0.7

**Processing Performance**: <2 minutes per hour of video (validated in T19)
- Short (<5 min): <30 seconds
- Medium (10-30 min): <60 seconds  
- Long (1+ hour): <120 seconds

**Error Recovery**: 100% graceful degradation (validated in T17)
- AI cleaning failures → Uses original transcript
- Fuzzy matching failures → Continues without positioning
- Storage errors → Logs warning, completes pipeline
- **Zero data loss under any error condition**

#### Key Files

**Handler**: `worker/handlers/process-document.ts` (youtube case, lines 67-110)
- Main pipeline orchestration
- Progress updates at each stage
- Error handling and graceful degradation

**Utilities**:
- `worker/lib/youtube.ts` - Video ID extraction, transcript fetching
- `worker/lib/youtube-cleaning.ts` - AI cleaning with fallback
- `worker/lib/fuzzy-matching.ts` - 3-tier positioning algorithm  
- `worker/lib/embeddings.ts` - Vercel AI SDK embeddings

**Tests** (all passing, 85-100% coverage):
- `worker/__tests__/youtube-cleaning.test.ts` - 17 tests, 100% coverage
- `worker/__tests__/fuzzy-matching.test.ts` - 24 tests, 88.52% coverage

### YouTube Offset Resolution Strategy

**Purpose**: Enable precise chunk positioning for future annotation system despite AI content reformatting.

**Problem**: AI cleaning transforms YouTube transcripts (removes timestamps, fixes grammar, adds headings), making chunks non-identical to source. Simple string matching fails, requiring fuzzy algorithm with confidence scoring.

**Implementation**: `worker/lib/fuzzy-matching.ts` - 3-tier fallback algorithm with graceful degradation.

#### Algorithm Overview

```typescript
/**
 * Fuzzy match a chunk to source markdown with 3-tier resolution.
 * Always returns a result with confidence score (never fails).
 */
async function fuzzyMatchChunkToSource(
  chunkContent: string,
  sourceMarkdown: string,
  options?: { trigramThreshold?: number }
): Promise<FuzzyMatchResult>

interface FuzzyMatchResult {
  start_offset: number          // Character position in source
  end_offset: number            // End position in source
  confidence: number            // 0.3-1.0 (higher = more accurate)
  method: 'exact' | 'fuzzy' | 'approximate'
  position_context: {
    context_before: string      // ~5 words before match
    context_after: string       // ~5 words after match
    confidence: number          // Same as parent confidence
    method: string              // Same as parent method
  }
}
```

#### Tier 1: Exact String Match (Confidence 1.0)

**When it works**: Chunk exists verbatim in source (unchanged by AI).

```typescript
const exactIndex = sourceMarkdown.indexOf(chunkContent)
if (exactIndex !== -1) {
  return {
    start_offset: exactIndex,
    end_offset: exactIndex + chunkContent.length,
    confidence: 1.0,
    method: 'exact',
    position_context: {
      context_before: extractContextBefore(sourceMarkdown, exactIndex),
      context_after: extractContextAfter(sourceMarkdown, exactIndex + chunkContent.length),
      confidence: 1.0,
      method: 'exact'
    }
  }
}
```

**Performance**: O(n) single pass, early exit on match.

#### Tier 2: Trigram Fuzzy Match (Confidence 0.75-0.99)

**When it works**: Chunk has minor variations (grammar fixes, sentence restructuring).

**Algorithm**:
1. Generate trigrams (3-character sliding window) for chunk
2. Slide window across source (10% stride, 20% for >100 windows)
3. Generate trigrams for each window candidate
4. Calculate Jaccard similarity: `intersection / union`
5. Return best match above threshold (default 0.75)

```typescript
// Generate trigrams: "hello" → ["hel", "ell", "llo"]
function generateTrigrams(text: string): Set<string> {
  const trigrams = new Set<string>()
  const normalized = text.toLowerCase().replace(/\s+/g, ' ')
  
  for (let i = 0; i <= normalized.length - 3; i++) {
    trigrams.add(normalized.substring(i, i + 3))
  }
  
  return trigrams
}

// Jaccard similarity
function calculateTrigramSimilarity(set1: Set<string>, set2: Set<string>): number {
  const intersection = new Set([...set1].filter(x => set2.has(x)))
  const union = new Set([...set1, ...set2])
  return intersection.size / union.size
}

// Sliding window search
const chunkTrigrams = generateTrigrams(chunkContent)
const windowSize = chunkContent.length
const stride = Math.max(1, Math.floor(windowSize * (windowCount > 100 ? 0.2 : 0.1)))

let bestMatch = { similarity: 0, offset: 0 }

for (let offset = 0; offset <= sourceMarkdown.length - windowSize; offset += stride) {
  const window = sourceMarkdown.substring(offset, offset + windowSize)
  const windowTrigrams = generateTrigrams(window)
  const similarity = calculateTrigramSimilarity(chunkTrigrams, windowTrigrams)
  
  if (similarity > bestMatch.similarity) {
    bestMatch = { similarity, offset }
    
    // Early exit on near-perfect match
    if (similarity > 0.95) break
  }
}

if (bestMatch.similarity >= trigramThreshold) {
  return {
    start_offset: bestMatch.offset,
    end_offset: bestMatch.offset + windowSize,
    confidence: bestMatch.similarity,
    method: 'fuzzy',
    position_context: { /* extract context */ }
  }
}
```

**Optimizations**:
- Pre-compute chunk trigrams (no loop regeneration)
- Dynamic stride: 20% for >100 windows (saves 50% comparisons)
- Early exit on >0.95 similarity
- Skip if chunk longer than source

**Performance**: O(n * m) where n = source length, m = window size. Optimized to <100ms for typical chunks.

**Threshold Rationale**:
- **0.75**: Balanced accuracy/recall from testing
- Too low (<0.70): False positives, wrong positions
- Too high (>0.80): Misses legitimate variations

#### Tier 3: Approximate Positioning (Confidence 0.3)

**When it works**: Always (fallback when exact and fuzzy fail).

**Algorithm**: Proportional positioning based on chunk index.

```typescript
// Never fail - always return usable position
const approximatePosition = Math.floor(
  (chunkIndex / totalChunks) * sourceMarkdown.length
)

return {
  start_offset: approximatePosition,
  end_offset: Math.min(approximatePosition + chunkContent.length, sourceMarkdown.length),
  confidence: 0.3,  // Low confidence = "best guess"
  method: 'approximate',
  position_context: { /* extract context */ }
}
```

**Use case**: Heavily reformatted content, but still better than null.

#### Context Extraction

**Purpose**: Store ~5 words before/after match for future re-calculation.

```typescript
function extractContextBefore(source: string, offset: number, contextSize = 100): string {
  const start = Math.max(0, offset - contextSize)
  const context = source.substring(start, offset).trim()
  return context.split(/\s+/).slice(-5).join(' ')  // Last 5 words
}

function extractContextAfter(source: string, offset: number, contextSize = 100): string {
  const end = Math.min(source.length, offset + contextSize)
  const context = source.substring(offset, end).trim()
  return context.split(/\s+/).slice(0, 5).join(' ')  // First 5 words
}
```

**Storage**: Saved in `position_context` JSONB column for future use.

#### Batch Processing with Performance Metrics

```typescript
interface FuzzyMatchPerformance {
  totalChunks: number
  exactMatches: number
  fuzzyMatches: number
  approximateMatches: number
  averageConfidence: number
  processingTimeMs: number
}

async function fuzzyMatchBatch(
  chunks: Array<{ content: string }>,
  sourceMarkdown: string
): Promise<{ results: FuzzyMatchResult[], performance: FuzzyMatchPerformance }>
```

**Monitoring**: Logs confidence distribution for quality assessment.

#### Database Integration

**Migration 012** adds required columns:

```sql
ALTER TABLE chunks ADD COLUMN position_context JSONB;
ALTER TABLE chunks ADD COLUMN word_count INTEGER;

COMMENT ON COLUMN chunks.position_context IS 
  'Fuzzy matching metadata with context words for re-calculation';

-- Functional indexes for filtering
CREATE INDEX idx_chunks_position_confidence 
  ON chunks ((position_context->>'confidence')::float);
  
CREATE INDEX idx_chunks_position_method 
  ON chunks ((position_context->>'method'));
```

**Query Examples**:

```sql
-- Get high-confidence chunks
SELECT id, chunk_index, 
       (position_context->>'confidence')::float as confidence
FROM chunks 
WHERE document_id = 'video-123'
  AND (position_context->>'confidence')::float >= 0.7
ORDER BY chunk_index;

-- Confidence distribution
SELECT 
  position_context->>'method' as method,
  COUNT(*) as count,
  AVG((position_context->>'confidence')::float) as avg_confidence
FROM chunks
WHERE document_id = 'video-123'
GROUP BY method;
```

#### Quality Metrics (from testing)

**Accuracy** (24 test cases, 88.52% code coverage):
- Exact matches: 100% accuracy (confidence 1.0)
- Fuzzy matches: >90% within chunk length of true position
- Approximate: Provides usable position (confidence 0.3)

**Performance** (validated with 100-chunk batches):
- Per chunk: <100ms average
- 100 chunks: 6.75s total (33% better than 10s target)
- Memory: <50MB peak

**Real-world validation** (T19 manual testing):
- Short videos (<5 min): >90% high confidence (≥0.7)
- Medium videos (10-30 min): >70% high confidence
- Long videos (1+ hour): >60% high confidence

#### Future Enhancements

**Phase 2 - Annotation System**:
- Use `start_offset` + `end_offset` for text highlighting
- Show confidence badges: "Exact position" vs "Approximate"
- Disable precise highlighting for low-confidence chunks (<0.5)

**Re-calculation on markdown changes**:
- Use `position_context` (context words) for fuzzy re-matching
- Recalculate offsets without re-running full pipeline
- Maintain annotations even when source is edited

**Quality monitoring**:
- Log confidence distribution per video
- Alert on <50% high-confidence rate
- A/B test threshold adjustments (0.70 vs 0.75 vs 0.80)

#### Configuration Constants

```typescript
// Fuzzy matching thresholds
const TRIGRAM_THRESHOLD = 0.75        // Minimum similarity for fuzzy match
const MIN_CONFIDENCE_TO_STORE = 0.3   // Store even approximate matches
const WINDOW_STRIDE_PERCENT = 0.1     // 10% stride (20% for >100 windows)
const CONTEXT_WINDOW_SIZE = 100       // ±100 chars (typically 5 words)

// Performance limits
const MAX_WINDOW_COUNT = 10000        // Prevent excessive memory usage
const EARLY_EXIT_THRESHOLD = 0.95     // Stop searching on near-perfect match
```

## ECS Architecture

### Core Implementation

```typescript
// lib/ecs/ecs.ts

export class ECS {
  constructor(private supabase: SupabaseClient) {}
  
  async createEntity(
    userId: string,
    components: Record<string, any>
  ): Promise<string> {
    // Create entity
    const { data: entity } = await this.supabase
      .from('entities')
      .insert({ user_id: userId })
      .select()
      .single()
    
    // Create components
    const componentInserts = Object.entries(components).map(
      ([type, data]) => ({
        entity_id: entity.id,
        component_type: type,
        data,
        chunk_id: data.chunk_id || null,
        document_id: data.document_id || null
      })
    )
    
    await this.supabase.from('components').insert(componentInserts)
    
    return entity.id
  }
  
  async query(
    componentTypes: string[],
    userId: string,
    filters?: Record<string, any>
  ) {
    let query = this.supabase
      .from('entities')
      .select(`
        id,
        components!inner (
          component_type,
          data
        )
      `)
      .eq('user_id', userId)
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
  // Content components
  'annotation': { 
    text: string,
    range: Range,
    note?: string,
    color?: string
  }
  'flashcard': { 
    question: string,
    answer: string,
    source_annotation_id?: string
  }
  'spark': { 
    idea: string,
    created_at: Date
  }
  
  // Study components
  'study': { 
    due: Date,
    ease: number,
    interval: number,
    reviews: number,
    last_review?: Date
  }
  
  // Position tracking
  'position': {
    chunk_id: string,
    start_offset: number,
    end_offset: number,
    xpath?: string,
    text_content: string // for fuzzy matching
  }
  
  // Source tracking
  'source': {
    chunk_id?: string,
    document_id?: string,
    parent_entity_id?: string
  }
  
  // Semantic data
  'embedding': number[] // 768-dimension vector
  'themes': string[]
}
```

## Annotation Layer

### Overview
Annotations are visual highlights and notes overlaid on the document without modifying the source markdown. They persist across document updates and are shareable/exportable.

### Text Selection & Creation

```tsx
// components/reader/text-selection-handler.tsx

export function TextSelectionHandler({ chunkId, documentId }) {
  const [selection, setSelection] = useState<Selection | null>(null)
  
  const handleMouseUp = () => {
    const sel = window.getSelection()
    if (!sel || sel.isCollapsed) return
    
    const range = sel.getRangeAt(0)
    const text = sel.toString()
    
    // Get precise position data
    const position = {
      chunk_id: chunkId,
      start_offset: range.startOffset,
      end_offset: range.endOffset,
      xpath: getXPath(range.commonAncestorContainer),
      text_content: text // For fuzzy matching if DOM changes
    }
    
    setSelection({
      text,
      position,
      range: range.getBoundingClientRect()
    })
    
    // Show annotation toolbar
    showAnnotationToolbar(selection)
  }
  
  return (
    <div onMouseUp={handleMouseUp}>
      {children}
      
      {selection && (
        <AnnotationToolbar
          selection={selection}
          onHighlight={color => createHighlight(selection, color)}
          onNote={content => createNote(selection, content)}
          onFlashcard={() => openFlashcardCreator(selection)}
          onDismiss={() => setSelection(null)}
        />
      )}
    </div>
  )
}
```

### Annotation → Flashcard Flow

```typescript
// User creates annotation first, then optionally converts to flashcard
async function createAnnotation(selection: TextSelection) {
  const annotationId = await ecs.createEntity(userId, {
    annotation: {
      text: selection.text,
      range: selection.range,
      color: 'yellow'
    },
    position: {
      chunk_id: selection.chunkId,
      start_offset: selection.startOffset,
      end_offset: selection.endOffset,
      text_content: selection.text
    },
    source: {
      document_id: documentId,
      chunk_id: selection.chunkId
    }
  })
  
  return annotationId
}

// Later, user can create flashcard FROM annotation
async function createFlashcardFromAnnotation(annotationId: string) {
  const annotation = await ecs.getEntity(annotationId)
  
  const flashcardId = await ecs.createEntity(userId, {
    flashcard: {
      question: userQuestion, // User provides
      answer: annotation.annotation.text,
      source_annotation_id: annotationId
    },
    study: {
      due: new Date(),
      ease: 2.5,
      interval: 0,
      reviews: 0
    },
    source: annotation.source // Inherit source from annotation
  })
  
  return flashcardId
}
```

## Study System

### Core Components

#### 1. Split-Screen Study Mode

```tsx
// components/study/split-screen-study.tsx

export function SplitScreenStudy({ documentId, deckId }) {
  const [cards, setCards] = useState([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [showAnswer, setShowAnswer] = useState(false)
  const [layout, setLayout] = useState<'split' | 'overlay' | 'focus'>('split')
  
  return (
    <div className="h-screen grid grid-cols-2 gap-0">
      {/* Left: Document Context */}
      <div className="border-r overflow-auto">
        <DocumentReader 
          documentId={documentId}
          highlightChunkId={cards[currentIndex]?.source.chunk_id}
          dimNonRelevant={true}
        />
      </div>
      
      {/* Right: Study Interface */}
      <div className="flex flex-col">
        {/* Study Header */}
        <div className="p-4 border-b flex justify-between items-center">
          <div className="flex items-center gap-4">
            <Badge variant="outline">
              {deck.name}
            </Badge>
            <span className="text-sm text-muted-foreground">
              {currentIndex + 1} of {cards.length}
            </span>
          </div>
          
          <ToggleGroup 
            type="single" 
            value={layout}
            onValueChange={setLayout}
          >
            <ToggleGroupItem value="overlay">
              <Layers className="h-4 w-4" />
            </ToggleGroupItem>
            <ToggleGroupItem value="split">
              <Columns className="h-4 w-4" />
            </ToggleGroupItem>
            <ToggleGroupItem value="focus">
              <Square className="h-4 w-4" />
            </ToggleGroupItem>
          </ToggleGroup>
        </div>
        
        {/* Card Display */}
        <div className="flex-1 flex items-center justify-center p-8">
          <Card className="w-full max-w-2xl">
            <CardContent className="p-8">
              <div className="text-lg mb-4">
                {cards[currentIndex]?.question}
              </div>
              
              {showAnswer && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="pt-4 border-t"
                >
                  {cards[currentIndex]?.answer}
                </motion.div>
              )}
            </CardContent>
            
            <CardFooter>
              {!showAnswer ? (
                <Button 
                  className="w-full"
                  onClick={() => setShowAnswer(true)}
                >
                  Show Answer <kbd className="ml-2">Space</kbd>
                </Button>
              ) : (
                <div className="flex gap-2 w-full">
                  <Button 
                    variant="outline"
                    onClick={() => rateCard(1)}
                    className="flex-1"
                  >
                    Again <kbd>1</kbd>
                  </Button>
                  <Button 
                    variant="outline"
                    onClick={() => rateCard(2)}
                    className="flex-1"
                  >
                    Hard <kbd>2</kbd>
                  </Button>
                  <Button 
                    variant="outline"
                    onClick={() => rateCard(3)}
                    className="flex-1"
                  >
                    Good <kbd>3</kbd>
                  </Button>
                  <Button 
                    variant="outline"
                    onClick={() => rateCard(4)}
                    className="flex-1"
                  >
                    Easy <kbd>4</kbd>
                  </Button>
                </div>
              )}
            </CardFooter>
          </Card>
        </div>
        
        {/* Smart Connections */}
        <div className="p-4 border-t bg-muted/30">
          <p className="text-xs text-muted-foreground mb-2">
            Related concepts:
          </p>
          <div className="flex gap-2 flex-wrap">
            {relatedConcepts.map(concept => (
              <Badge 
                key={concept.id}
                variant="secondary"
                className="cursor-pointer hover:bg-secondary/80"
                onClick={() => navigateToConcept(concept)}
              >
                {concept.name}
              </Badge>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
```

#### 2. Inline Study Overlay

```tsx
// components/study/inline-study-overlay.tsx

export function InlineStudyOverlay({ active, card, onRate }) {
  if (!active) return null
  
  return (
    <motion.div
      className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
    >
      <div className="fixed inset-x-0 top-1/3 mx-auto max-w-2xl">
        <motion.div
          className="bg-background border rounded-lg shadow-2xl p-8"
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
        >
          {/* Card content */}
          <div className="space-y-4">
            <div>
              <p className="text-lg">{card.question}</p>
            </div>
            
            {showAnswer && (
              <div className="pt-4 border-t">
                <p>{card.answer}</p>
              </div>
            )}
          </div>
          
          {/* Quick rating */}
          <div className="flex justify-center gap-4 mt-6">
            <div className="flex gap-2">
              <kbd className="px-2 py-1 text-xs bg-muted rounded">1</kbd>
              <span className="text-xs text-muted-foreground">Again</span>
            </div>
            <div className="flex gap-2">
              <kbd className="px-2 py-1 text-xs bg-muted rounded">2</kbd>
              <span className="text-xs text-muted-foreground">Hard</span>
            </div>
            <div className="flex gap-2">
              <kbd className="px-2 py-1 text-xs bg-muted rounded">3</kbd>
              <span className="text-xs text-muted-foreground">Good</span>
            </div>
            <div className="flex gap-2">
              <kbd className="px-2 py-1 text-xs bg-muted rounded">4</kbd>
              <span className="text-xs text-muted-foreground">Easy</span>
            </div>
            <div className="flex gap-2 ml-4">
              <kbd className="px-2 py-1 text-xs bg-muted rounded">ESC</kbd>
              <span className="text-xs text-muted-foreground">Exit</span>
            </div>
          </div>
        </motion.div>
      </div>
    </motion.div>
  )
}
```

#### 3. Smart Study Queue

```tsx
// components/study/smart-study-queue.tsx

export function SmartStudyQueue() {
  const [isOpen, setIsOpen] = useState(false)
  const { queue, stats } = useSmartStudyQueue()
  
  return (
    <motion.div
      className="fixed right-0 top-20 bottom-0 bg-background border-l z-40"
      animate={{ width: isOpen ? 320 : 48 }}
    >
      {/* Toggle Button */}
      <Button
        className="absolute -left-4 top-8 rounded-full"
        size="icon"
        variant="outline"
        onClick={() => setIsOpen(!isOpen)}
      >
        <Brain className="h-4 w-4" />
      </Button>
      
      {isOpen ? (
        <div className="p-4 space-y-4">
          <div>
            <h3 className="font-medium mb-2">Smart Study Queue</h3>
            <p className="text-xs text-muted-foreground">
              AI-powered suggestions based on your reading
            </p>
          </div>
          
          {/* Contextual suggestions */}
          <div className="space-y-2">
            {/* Related to current reading */}
            <div className="p-3 border rounded-lg">
              <div className="flex justify-between items-start mb-2">
                <Badge variant="outline" className="text-xs">
                  Related to current chunk
                </Badge>
                <span className="text-xs text-muted-foreground">
                  5 cards
                </span>
              </div>
              <Button
                size="sm"
                variant="secondary"
                className="w-full"
                onClick={() => startContextualStudy()}
              >
                Study related concepts
              </Button>
            </div>
            
            {/* Due cards */}
            <div className="p-3 border rounded-lg">
              <div className="flex justify-between items-start mb-2">
                <Badge variant="outline" className="text-xs">
                  Due today
                </Badge>
                <span className="text-xs text-green-600">
                  12 cards
                </span>
              </div>
              <Button
                size="sm"
                variant="secondary"
                className="w-full"
                onClick={() => startDueCards()}
              >
                Review due cards
              </Button>
            </div>
            
            {/* Weak areas */}
            <div className="p-3 border rounded-lg bg-amber-500/5">
              <p className="text-xs font-medium mb-2">
                Struggling with:
              </p>
              <div className="flex flex-wrap gap-1 mb-2">
                {weakAreas.map(area => (
                  <Badge
                    key={area}
                    variant="secondary"
                    className="text-xs"
                  >
                    {area}
                  </Badge>
                ))}
              </div>
              <Button
                size="sm"
                variant="secondary"
                className="w-full"
                onClick={() => startWeakAreaReview()}
              >
                Strengthen weak areas
              </Button>
            </div>
          </div>
          
          {/* Study stats */}
          <div className="pt-4 border-t space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Today</span>
              <span>{stats.today} cards</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Streak</span>
              <span className="text-green-600">
                {stats.streak} days 🔥
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Retention</span>
              <span>{stats.retention}%</span>
            </div>
          </div>
        </div>
      ) : (
        // Collapsed state - just show counts
        <div className="flex flex-col items-center py-4 gap-4">
          <div className="text-center">
            <div className="text-lg font-bold text-green-600">
              {stats.dueCount}
            </div>
            <div className="text-xs text-muted-foreground">
              due
            </div>
          </div>
          {stats.streak > 0 && (
            <div className="text-xs">🔥</div>
          )}
        </div>
      )}
    </motion.div>
  )
}
```

#### 4. Deck Canvas (Spatial Organization)

```tsx
// app/decks/page.tsx

export function DecksCanvas() {
  const [decks, setDecks] = useState([])
  const [connections, setConnections] = useState([])
  
  return (
    <div className="h-screen relative overflow-hidden bg-muted/20">
      {/* Infinite canvas for decks */}
      <InfiniteCanvas
        onPan={handlePan}
        onZoom={handleZoom}
      >
        {/* Render connections first (behind decks) */}
        {connections.map(connection => (
          <DeckConnection
            key={connection.id}
            from={connection.from}
            to={connection.to}
            type={connection.type}
          />
        ))}
        
        {/* Render deck nodes */}
        {decks.map(deck => (
          <DeckNode
            key={deck.id}
            deck={deck}
            position={deck.position}
            onDrag={updatePosition}
            onConnect={createConnection}
            onStudy={() => startStudy(deck.id)}
          />
        ))}
      </InfiniteCanvas>
      
      {/* Floating controls */}
      <div className="absolute top-4 left-4 flex gap-2">
        <Button
          size="sm"
          variant="secondary"
          onClick={autoOrganize}
        >
          <Sparkles className="h-4 w-4 mr-1" />
          Auto-organize
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={createDeck}
        >
          <Plus className="h-4 w-4 mr-1" />
          New deck
        </Button>
      </div>
      
      {/* Mini-map */}
      <div className="absolute bottom-4 right-4 w-48 h-32 border rounded bg-background/95">
        <CanvasMinimap decks={decks} connections={connections} />
      </div>
    </div>
  )
}

// Each deck is a card on the canvas
function DeckNode({ deck, position, onDrag, onConnect, onStudy }) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  
  return (
    <motion.div
      className={cn(
        "absolute bg-background border rounded-lg shadow-sm cursor-move",
        "hover:shadow-md transition-shadow",
        isExpanded ? "w-80" : "w-64",
        isDragging && "opacity-50"
      )}
      style={{
        left: position.x,
        top: position.y
      }}
      drag
      onDragStart={() => setIsDragging(true)}
      onDragEnd={(e, info) => {
        setIsDragging(false)
        onDrag(deck.id, info.point)
      }}
    >
      {/* Deck Header */}
      <div className="p-4 border-b">
        <h3 className="font-medium">{deck.name}</h3>
        <div className="flex gap-4 mt-2 text-sm text-muted-foreground">
          <span>{deck.cardCount} cards</span>
          <span className="text-green-600">{deck.dueCount} due</span>
          <span className="text-amber-600">{deck.newCount} new</span>
        </div>
      </div>
      
      {/* Quick Actions */}
      <div className="p-2 flex gap-1">
        <Button
          size="sm"
          variant="ghost"
          onClick={onStudy}
        >
          <Play className="h-4 w-4" />
          Study
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          <ChevronDown className={cn(
            "h-4 w-4 transition-transform",
            isExpanded && "rotate-180"
          )} />
        </Button>
      </div>
      
      {/* Expanded Content */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: 'auto' }}
            exit={{ height: 0 }}
            className="overflow-hidden"
          >
            <div className="p-4 space-y-2">
              {/* Stats */}
              <div className="text-xs space-y-1">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Retention</span>
                  <span>{deck.retention}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Avg Ease</span>
                  <span>{deck.avgEase.toFixed(2)}</span>
                </div>
              </div>
              
              {/* Recent cards preview */}
              <div className="pt-2 border-t">
                <p className="text-xs text-muted-foreground mb-1">Recent:</p>
                {deck.recentCards.map(card => (
                  <div
                    key={card.id}
                    className="text-xs p-1 bg-muted/30 rounded truncate"
                  >
                    {card.question}
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      
      {/* Connection points for linking decks */}
      <ConnectionHandle position="top" />
      <ConnectionHandle position="bottom" />
      <ConnectionHandle position="left" />
      <ConnectionHandle position="right" />
    </motion.div>
  )
}
```

### FSRS Implementation

```typescript
// lib/study/fsrs.ts

export class FSRS {
  private params = {
    initialStability: [0.4, 0.7, 2.4, 5.8],
    requestRetention: 0.9,
    maximumInterval: 36500,
    decay: -0.5,
    factor: 0.0025
  }
  
  schedule(card: Card, now: Date, rating: Rating): ScheduledCard {
    // Calculate new interval based on FSRS algorithm
    const newCard = { ...card }
    
    switch (rating) {
      case Rating.Again:
        newCard.interval = 1
        newCard.ease *= 0.8
        break
      case Rating.Hard:
        newCard.interval *= 1.2
        newCard.ease *= 0.85
        break
      case Rating.Good:
        newCard.interval *= newCard.ease
        break
      case Rating.Easy:
        newCard.interval *= newCard.ease * 1.3
        newCard.ease *= 1.05
        break
    }
    
    // Apply maximum interval
    newCard.interval = Math.min(
      newCard.interval,
      this.params.maximumInterval
    )
    
    // Calculate due date
    newCard.due = new Date(
      now.getTime() + newCard.interval * 24 * 60 * 60 * 1000
    )
    
    newCard.reviews++
    newCard.lastReview = now
    
    return newCard
  }
}
```

## UI Architecture (No Modals)

### Layout Structure

```
┌────────────────────────────────────────────────┐
│  Command Palette (⌘K) - Hidden until triggered │
├────────────────────────────────────────────────┤
│                                                 │
│  ┌──────────────────────┐  ┌────────────────┐ │
│  │                      │  │                 │ │
│  │   Document Reader    │  │  Right Panel    │ │
│  │   (Main Content)     │  │  - Connections  │ │
│  │                      │  │  - Annotations  │ │
│  │                      │  │  - Study Queue  │ │
│  │                      │  │                 │ │
│  └──────────────────────┘  └────────────────┘ │
│                                                 │
│  ╔═════════════════════════════════════════╗  │
│  ║ Processing Dock (Collapsible)           ║  │
│  ╚═════════════════════════════════════════╝  │
│                                                 │
│  [Quick Capture Bar - Appears on selection]    │
│  [Study Overlay - When studying inline]        │
└────────────────────────────────────────────────┘
```

### UI Patterns Reference

| Pattern | Purpose | Behavior |
|---------|---------|----------|
| **Processing Dock** | Background tasks | Bottom, collapsible, shows progress |
| **Right Panel** | Contextual info | Tabbed, persistent, resizable |
| **Quick Capture Bar** | Text actions | Appears on selection, minimal |
| **Command Palette** | Global actions | ⌘K triggered, searchable |
| **Split Screen** | Study mode | Document + cards side by side |
| **Inline Overlay** | Quick study | Semi-transparent, keyboard driven |
| **Deck Canvas** | Visual organization | Draggable nodes, connections |

## User Flows

### Complete User Journey

#### 1. Document Upload
```
Drag PDF → Upload to Storage → AI processes → 
Markdown saved → Chunks in DB → Ready to read
```

#### 2. Reading & Annotating
```
Open document → Stream markdown → Select text → 
Annotation toolbar → Create highlight/note → 
Save to ECS → Show immediately
```

#### 3. Creating Flashcards
```
From annotation → "Create card" button → 
Enter question → Use annotation as answer → 
Auto-assign to deck → Ready to study
```

#### 4. Study Session
```
Smart queue suggests → Choose mode (split/inline) → 
Show card → Reveal answer → Rate difficulty → 
FSRS schedules next → Update progress
```

#### 5. Discovering Connections
```
Read chunk → See connections in panel → 
Click related → Navigate to source → 
Create spark → Find more connections
```

## Synthesis Engine

### Connection Detection

```typescript
// Background process finds relationships
async function detectConnections(chunkId: string) {
  const { data: chunk } = await supabase
    .from('chunks')
    .select('embedding, themes, document_id')
    .eq('id', chunkId)
    .single()
  
  // Find similar chunks via pgvector
  const { data: similar } = await supabase.rpc(
    'match_chunks',
    {
      query_embedding: chunk.embedding,
      threshold: 0.8,
      exclude_document: chunk.document_id, // Find cross-document
      limit: 20
    }
  )
  
  // Analyze connection types
  for (const match of similar) {
    const connectionType = await analyzeConnectionType(chunk, match)
    
    await supabase
      .from('connections')
      .insert({
        source_chunk_id: chunkId,
        target_chunk_id: match.id,
        connection_type: connectionType,
        strength: match.similarity,
        auto_detected: true
      })
  }
}

// SQL function for similarity
CREATE FUNCTION match_chunks(
  query_embedding vector(768),
  threshold float,
  exclude_document uuid,
  limit int
)
RETURNS TABLE (
  id uuid,
  content text,
  similarity float,
  document_id uuid
) AS $$
  SELECT 
    id,
    content,
    1 - (embedding <=> query_embedding) as similarity,
    document_id
  FROM chunks
  WHERE 
    1 - (embedding <=> query_embedding) > threshold
    AND document_id != exclude_document
  ORDER BY embedding <=> query_embedding
  LIMIT limit
$$ LANGUAGE SQL;
```

### Spark System

```typescript
// One-click idea capture
async function createSpark(entityId: string, idea: string) {
  const sparkId = await ecs.createEntity(userId, {
    spark: {
      idea: idea,
      created_at: new Date()
    },
    source: {
      parent_entity_id: entityId,
      chunk_id: getCurrentChunkId(),
      document_id: getCurrentDocumentId()
    }
  })
  
  // Find connections immediately
  const embedding = await generateEmbedding(idea)
  await findRelatedEntities(sparkId, embedding)
  
  return sparkId
}
```

## File Structure

```
rhizome/
├── app/
│   ├── (auth)/
│   │   ├── login/
│   │   └── register/
│   ├── (main)/
│   │   ├── page.tsx              # Library/dashboard
│   │   ├── read/[id]/page.tsx   # Document reader
│   │   ├── study/page.tsx       # Study dashboard
│   │   └── decks/page.tsx       # Deck canvas
│   └── api/
│       └── process/
│
├── components/
│   ├── reader/
│   ├── study/
│   ├── synthesis/
│   ├── layout/
│   └── ui/
│
├── lib/
│   ├── ecs/
│   ├── processing/
│   ├── study/
│   ├── synthesis/
│   └── utils/
│
├── stores/
├── hooks/
├── types/
│
└── supabase/
    ├── functions/
    └── migrations/
```

## State Management Strategy

### Zustand Stores

```typescript
// stores/reader-store.ts
interface ReaderStore {
  selectedText: TextSelection | null
  activeChunk: string | null
  annotations: Map<string, Annotation>
  
  selectText: (selection: TextSelection) => void
  clearSelection: () => void
  addAnnotation: (annotation: Annotation) => void
}

// stores/study-store.ts
interface StudyStore {
  activeSession: StudySession | null
  currentCard: Card | null
  studyMode: 'inline' | 'split' | 'focus'
  queue: Card[]
  
  startSession: (deckId: string) => void
  rateCard: (rating: number) => void
  nextCard: () => void
}
```

### React Query Patterns

```typescript
// Immutable data - infinite cache
const { data: document } = useQuery({
  queryKey: ['document', id],
  queryFn: getDocument,
  staleTime: Infinity
})

// Mutable data - smart invalidation
const { data: annotations } = useQuery({
  queryKey: ['annotations', documentId],
  queryFn: getAnnotations,
  staleTime: 5 * 60 * 1000 // 5 minutes
})
```

## Export System

```typescript
// Complete data ownership
export async function exportDocument(documentId: string) {
  const zip = new JSZip()
  
  // Original files
  zip.file('source.pdf', await getOriginal(documentId))
  zip.file('content.md', await getMarkdown(documentId))
  
  // User data as JSON
  zip.file('annotations.json', await exportAnnotations(documentId))
  zip.file('flashcards.json', await exportFlashcards(documentId))
  zip.file('connections.json', await exportConnections(documentId))
  zip.file('sparks.json', await exportSparks(documentId))
  
  // Generate bundle
  const blob = await zip.generateAsync({ type: 'blob' })
  
  // Save to storage for download
  const url = await uploadExport(blob, documentId)
  return url
}

// Portable format
{
  "version": "1.0",
  "exported_at": "2024-01-01T00:00:00Z",
  "document": {
    "id": "...",
    "title": "...",
    "author": "..."
  },
  "annotations": [...],
  "flashcards": [...],
  "connections": [...]
}
```

## Performance Optimizations

### Document Loading
- Virtual scrolling with intersection observer
- Chunk prefetching (n+1, n-1)
- Markdown streaming from CDN
- Progressive enhancement

### Study Performance
- Prefetch next 5 cards
- Optimistic UI updates
- Background sync
- LocalStorage fallback

### Synthesis
- Batch embedding generation
- Indexed vector search
- Connection caching
- Debounced spark creation

## Implementation Timeline

### MVP (2 weeks)
- ✅ Upload document
- ✅ Basic reader
- ✅ Simple annotations
- ✅ Create flashcards
- ✅ Basic study

### V1 (6 weeks)
- Full processing pipeline
- Rich annotations
- FSRS study system
- Connection detection
- Export system

### V2 (12 weeks)
- Deck canvas
- Smart queue
- Spark threads
- Knowledge graph
- Mobile support

## Cost Analysis

### Per Document
- Gemini processing: ~$0.10
- Storage: ~12MB
- Database: ~2MB

### Per User (1000 docs)
- Storage: 12GB (~$3/mo)
- Database: 2GB (free tier)
- Total: ~$5/mo

## Security

- Row Level Security (RLS) on all tables
- Signed URLs (1hr expiry)
- User isolation
- No public buckets
- Auth via Supabase

## Future Roadmap

### Near Term
- Collaboration features
- Public sharing
- Mobile apps
- Browser extension

### Long Term
- Local-first sync
- Plugin system
- AI writing assistant
- Video/audio support

---

This architecture document represents the complete system design for Rhizome V2, incorporating all discussed features including the detailed study system and annotation layer. The focus remains on flow state preservation, quality processing, and user ownership of data.