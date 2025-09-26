# Brainstorming Session: Document Upload, Processing & Connection Detection

**Date:** January 26, 2025  
**Participants:** Development Team  
**Facilitator:** Scrum Master  
**Feature:** Complete Document Upload, AI Processing & Cross-Document Connection Detection System

---

## 1. Executive Summary

### Feature Overview
A sophisticated document ingestion and knowledge synthesis system that accepts multiple file formats, processes them through AI to create clean markdown, and automatically discovers connections between documents using semantic analysis and vector embeddings.

### Key Outcomes
- Multi-format support (PDF, TXT, Markdown, EPUB, YouTube transcripts)
- AI-powered extraction to clean, semantic markdown
- Automatic cross-document connection detection
- Connections as first-class ECS entities (can be annotated, studied, shared)
- Background processing with real-time progress updates
- Meta-connections (connections between connections)

### Critical Decisions Made
- Use Server Actions for quick metadata, Edge Functions for heavy processing
- Implement Supabase Realtime for progress tracking
- Use Supabase Queue for job management
- Importance-based filtering for vector searches
- Connections as ECS entities, not just database records
- One level of meta-connections initially
- No connection decay - use smart ranking instead

---

## 2. Requirements & User Stories

### Primary User Story
**As a** knowledge worker  
**I want to** upload documents and discover non-obvious connections  
**So that I can** synthesize knowledge across my entire reading library

### Core Problem Solved
Users struggle with:
- Knowledge fragmentation across documents
- Missing valuable connections between ideas
- Manual effort to create study materials
- Static, siloed information that doesn't reveal patterns

### Acceptance Criteria
- [ ] Multi-format document support with AI extraction
- [ ] Semantic chunking with themes and importance scoring
- [ ] Automatic connection detection running async
- [ ] Connections can be annotated, studied, converted to flashcards
- [ ] Smart importance-based filtering to reduce noise
- [ ] Real-time progress updates via Supabase Realtime
- [ ] Re-detection triggers (new document, manual)
- [ ] Beautiful reading experience with connection indicators

---

## 3. Technical Architecture

### Storage Architecture (Hybrid)
```
SUPABASE STORAGE (Files)
└── userId/
    └── documentId/
        ├── source.{ext}           # Original upload
        ├── content.md             # Processed markdown
        ├── cover.jpg              # Optional cover
        └── export.bundle.zip      # User's data

POSTGRESQL DATABASE
├── documents     # Metadata only
├── chunks        # Searchable segments + embeddings
├── entities      # ECS entities
├── components    # ECS components (including connections)
└── processing_queue  # Job tracking
```

### Processing Pipeline

#### Phase 1: Quick Metadata (Server Action - Synchronous)
```typescript
// app/actions/metadata.ts
'use server';

export async function extractMetadata(file: File) {
  // First few pages to Gemini Flash
  const preview = await extractFirstPages(file);
  const metadata = await gemini.generateContent({
    model: 'gemini-1.5-flash',
    prompt: QUICK_METADATA_PROMPT,
    content: preview
  });
  
  return { title, author, summary, themes }; // < 5 seconds
}
```

#### Phase 2: Full Processing (Edge Function - Async)
```typescript
// supabase/functions/process-document/index.ts

export async function processDocument(documentId: string, fileUrl: string) {
  // 1. Convert to base64
  const fileBuffer = await downloadFile(fileUrl);
  const fileBase64 = Buffer.from(fileBuffer).toString('base64');
  
  // 2. Send to Gemini Pro for complete extraction
  const result = await gemini.generateContent({
    model: 'gemini-1.5-pro',
    contents: [{
      parts: [
        { inlineData: { mimeType: detectMimeType(fileUrl), data: fileBase64 } },
        { text: EXTRACTION_AND_CHUNKING_PROMPT }
      ]
    }],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: DOCUMENT_SCHEMA
    }
  });
  
  // 3. Save markdown to Storage
  await supabase.storage
    .from('documents')
    .upload(`${userId}/${documentId}/content.md`, result.markdown);
  
  // 4. Generate embeddings for chunks
  const embeddings = await Promise.all(
    result.chunks.map(chunk => 
      gemini.embedContent({
        model: 'text-embedding-004',
        content: chunk.content
      })
    )
  );
  
  // 5. Save chunks to database
  for (let i = 0; i < result.chunks.length; i++) {
    await supabase.from('chunks').insert({
      document_id: documentId,
      content: result.chunks[i].content,
      embedding: embeddings[i],
      chunk_index: i,
      chunk_type: result.chunks[i].type,
      themes: result.chunks[i].themes,
      importance_score: result.chunks[i].importance
    });
  }
  
  // 6. Queue connection detection
  await queueJob({
    type: JobType.DETECT_CONNECTIONS,
    payload: { documentId, userId, priority: 7 }
  });
}
```

### Connection Detection System

#### Core Detection Logic (Runs After Processing)
```typescript
// lib/synthesis/connection-detector.ts

export async function detectCrossDocumentConnections(
  documentId: string,
  userId: string
) {
  const { data: newChunks } = await supabase
    .from('chunks')
    .select('*')
    .eq('document_id', documentId)
    .order('chunk_index');
  
  for (const chunk of newChunks) {
    // Skip low-importance chunks
    if (chunk.importance_score < 0.5) continue;
    
    // Find similar chunks using pgvector
    const similar = await supabase.rpc('find_similar_chunks', {
      query_embedding: chunk.embedding,
      exclude_document_id: documentId,
      min_importance: 0.5,  // Importance filtering
      similarity_threshold: 0.75,
      limit: 20
    });
    
    for (const match of similar) {
      const analysis = await analyzeConnection(chunk, match);
      
      if (analysis.strength < 0.5) continue;
      
      // Create connection as ECS entity
      await createConnectionEntity(chunk, match, analysis);
      
      // Notify if strong bridge found
      if (analysis.strength > 0.9 && analysis.type === 'bridges') {
        await notifyUser('Surprising connection discovered!', {
          source: chunk.document_title,
          target: match.document_title
        });
      }
    }
  }
}
```

#### Connections as ECS Entities
```typescript
async function createConnectionEntity(
  sourceChunk: Chunk,
  targetChunk: Chunk,
  analysis: ConnectionAnalysis
) {
  // Connections are entities, not just records!
  const connectionId = await ecs.createEntity(userId, {
    // Core connection data
    connection: {
      type: analysis.connectionType,
      strength: analysis.strength,
      reasoning: analysis.reasoning,
      auto_detected: true
    },
    
    // What it connects
    source: {
      chunk_ids: [sourceChunk.id, targetChunk.id],
      document_ids: [sourceChunk.document_id, targetChunk.document_id],
      chunk_previews: [
        sourceChunk.content.slice(0, 100),
        targetChunk.content.slice(0, 100)
      ]
    },
    
    // Connection has its own embedding!
    embedding: await generateConnectionEmbedding(
      sourceChunk.content,
      targetChunk.content,
      analysis.reasoning
    ),
    
    // Combined themes
    themes: [...new Set([
      ...sourceChunk.themes,
      ...targetChunk.themes
    ])],
    
    metadata: {
      created_at: new Date(),
      similarity_score: analysis.similarity
    }
  });
  
  return connectionId;
}
```

#### Why Connections as Entities is Powerful

1. **Connections can be annotated** - Users add insights to connections
2. **Connections become flashcards** - Study the relationships
3. **Connections can have sparks** - Ideas about connections
4. **Meta-connections** - Find patterns between connections
5. **Unified querying** - Same ECS patterns for everything

### Queue Architecture

```typescript
// Using Supabase Queue for all job types
enum JobType {
  PROCESS_DOCUMENT = 'process_document',
  DETECT_CONNECTIONS = 'detect_connections', 
  REDETECT_CONNECTIONS = 'redetect_connections'
}

interface QueueJob {
  type: JobType
  payload: {
    documentId?: string
    userId: string
    priority: number // 1-10
  }
  retries: number
}

// Priority levels
// 10: Document processing (user waiting)
// 7: Initial connection detection
// 3: Re-detection runs
```

### Realtime Progress Tracking

```typescript
// Subscribe to processing updates
const channel = supabase.channel('processing-updates')
  .on(
    'postgres_changes',
    {
      event: '*',
      schema: 'public', 
      table: 'processing_queue',
      filter: `user_id=eq.${userId}`
    },
    (payload) => {
      if (payload.eventType === 'UPDATE') {
        updateProcessingDock({
          documentId: payload.new.document_id,
          status: payload.new.status,
          progress: payload.new.progress,
          message: payload.new.status_message
        });
      }
    }
  )
  .subscribe();
```

---

## 4. Implementation Tasks

### Phase 1: Core Upload & Processing (5 days)
- [ ] Create upload UI with drag & drop
- [ ] Implement Server Actions for metadata
- [ ] Set up Supabase Storage buckets
- [ ] Create Edge Functions for processing
- [ ] Implement Gemini extraction pipeline
- [ ] Set up Supabase Queue
- [ ] Add Realtime progress tracking

### Phase 2: Connection Detection (7 days)
- [ ] Create pgvector similarity search functions
- [ ] Implement connection type analysis
- [ ] Build ECS entity creation for connections
- [ ] Add importance scoring logic
- [ ] Implement background job processing
- [ ] Create notification system for strong connections
- [ ] Add connection re-detection triggers

### Phase 3: Connection UI & Interactions (5 days)
- [ ] Build connection display in right panel
- [ ] Add connection annotation capability
- [ ] Implement connection → flashcard conversion
- [ ] Create spark system for connections
- [ ] Add connection ranking/filtering UI
- [ ] Build split-screen comparison view

### Phase 4: YouTube & Special Formats (3 days)
- [ ] Implement YouTube URL detection
- [ ] Add youtube-transcript library
- [ ] Create thumbnail fetching
- [ ] Process transcripts with timestamps
- [ ] Handle EPUB files
- [ ] Add cover image extraction

### Phase 5: Performance & Polish (3 days)
- [ ] Optimize vector search queries
- [ ] Add connection caching
- [ ] Implement batch processing optimizations
- [ ] Create export system
- [ ] Add analytics tracking
- [ ] Write documentation

---

## 5. Technical Decisions & Rationale

### Decision: Server Actions for Metadata, Edge Functions for Processing
**Rationale:** Server Actions are perfect for quick, synchronous operations (<5s). Edge Functions handle long-running async work.
**Alternative:** All Edge Functions
**Trade-off:** Slightly more complex but much better UX

### Decision: Importance-Based Filtering for Vector Search
**Rationale:** Reduces noise by only searching high-importance chunks
**Alternative:** Search everything, filter later
**Impact:** Better performance, more relevant connections

### Decision: Connections as ECS Entities
**Rationale:** Makes connections living objects that can be annotated, studied, and connected to other connections
**Alternative:** Simple database records
**Impact:** Vastly more powerful and flexible system

### Decision: One Level of Meta-Connections
**Rationale:** Prevents exponential growth while still finding patterns
**Alternative:** Unlimited depth
**Trade-off:** Simpler to reason about and implement

### Decision: No Connection Decay, Smart Ranking Instead
**Rationale:** Knowledge doesn't expire; old connections may become relevant later
**Alternative:** Time-based decay
**Impact:** Preserves all discoveries while surfacing relevant ones

---

## 6. Risks & Mitigation Strategies

### Risk: Vector Search Performance at Scale
**Probability:** Medium  
**Impact:** High  
**Mitigation:** 
- Importance filtering (already implemented)
- IVFFlat indexing for pgvector
- Consider partitioning strategies at 1000+ documents

### Risk: Connection Noise/Overwhelm
**Probability:** High  
**Impact:** Medium  
**Mitigation:**
- Importance scoring on all connections
- User engagement signals boost relevance
- Type-based filtering (bridges > supports)

### Risk: Gemini API Costs
**Probability:** Medium  
**Impact:** Medium  
**Mitigation:**
- Show cost estimates
- Use Flash for metadata, Pro only for full processing
- Batch operations where possible

### Risk: Processing Queue Bottlenecks
**Probability:** Low  
**Impact:** Medium  
**Mitigation:**
- Priority-based queue processing
- Concurrent limit of 10 documents
- Horizontal scaling ready

---

## 7. Performance Optimization Strategies

### Vector Search Optimization
```typescript
// Start simple, optimize as needed
async function findSimilarChunks(sourceChunk: Chunk) {
  return await supabase.rpc('match_important_chunks', {
    query_embedding: sourceChunk.embedding,
    min_importance: 0.5,        // Filter low-importance
    similarity_threshold: 0.75,  // Reasonable threshold
    limit: 20                    // Practical limit
  });
}
```

### Connection Ranking (No Decay)
```typescript
function rankConnections(connections: Connection[]) {
  return connections.sort((a, b) => {
    let scoreA = a.strength;
    let scoreB = b.strength;
    
    // User engagement is most important
    if (a.hasAnnotation) scoreA += 0.3;
    if (a.hasBeenStudied) scoreA += 0.2;
    if (a.hasSparks) scoreA += 0.2;
    
    // Rarity bonus
    if (a.type === 'bridges') scoreA += 0.2;
    if (a.type === 'contradicts') scoreA += 0.15;
    
    return scoreB - scoreA;
  });
}
```

### Processing Efficiency
```typescript
// Batch operations but serialize for API costs
async function processBatch(files: File[]) {
  // Metadata extraction (parallel - fast)
  const metadata = await Promise.all(
    files.map(file => extractMetadata(file))
  );
  
  // Full processing (serialized - cost control)
  for (let i = 0; i < files.length; i++) {
    await processDocument(files[i]);
    updateBatchProgress(i + 1, files.length);
  }
}
```

---

## 8. YouTube Integration Details

### Implementation
```typescript
// app/api/youtube/transcript/route.ts
import { YoutubeTranscript } from 'youtube-transcript';

export async function POST(request: Request) {
  const { url, preserveTimestamps } = await request.json();
  const videoId = extractVideoId(url);
  
  try {
    // Fetch transcript
    const transcript = await YoutubeTranscript.fetchTranscript(videoId);
    
    // Process with Gemini
    const cleanedMarkdown = await processTranscript(
      transcript,
      preserveTimestamps
    );
    
    // Extract metadata
    const metadata = {
      title: await getVideoTitle(videoId),
      channel: await getChannelName(videoId),
      duration: await getVideoDuration(videoId),
      publishDate: await getPublishDate(videoId),
      thumbnail: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`
    };
    
    return { markdown: cleanedMarkdown, metadata };
  } catch (error) {
    return { 
      error: "Couldn't fetch automatically",
      fallbackUrl: `https://www.youtube.com/watch?v=${videoId}`,
      manualInstructions: "Please paste transcript manually"
    };
  }
}
```

### Processing Prompt
```javascript
const YOUTUBE_TRANSCRIPT_PROMPT = `
Process this YouTube transcript into clean, readable markdown:

1. Remove filler words and repeated phrases
2. Add proper punctuation and paragraph breaks
3. Create logical sections based on topic changes
4. If timestamps are provided and user wants them:
   - Preserve as [HH:MM:SS] markers at section starts
   - Create clickable references for easy navigation
5. Extract key topics and themes
6. Format speaker changes clearly (if multi-speaker)

Return clean markdown with optional timestamp markers.
`;
```

---

## 9. Future Enhancements (Post-MVP)

### Near Term
- [ ] Connection threads (curated paths through connections)
- [ ] Connection evolution tracking
- [ ] Document clustering for search optimization
- [ ] Periodic re-detection scheduling
- [ ] Web page capture and archiving

### Long Term
- [ ] Multi-level meta-connections
- [ ] Collaborative connection discovery
- [ ] AI-suggested reading paths
- [ ] Connection strength prediction
- [ ] Knowledge graph visualization

---

## 10. Next Steps

### Immediate Actions
1. **Set up database schema** - Add processing_queue table
2. **Configure Supabase Queue** - Enable job processing
3. **Create Edge Functions** - Document processing pipeline
4. **Implement ECS for connections** - Entity-based connections
5. **Set up Realtime** - Progress tracking subscriptions

### Week 1 Sprint
- Upload UI and metadata extraction
- Basic processing pipeline
- Storage configuration

### Week 2 Sprint
- Connection detection implementation
- ECS entity creation
- Notification system

### Week 3 Sprint
- Connection UI components
- Annotation and flashcard features
- Performance optimization

### Success Metrics
- Upload success rate > 95%
- Processing time < 2 min average
- Connection detection < 30s after processing
- Relevant connection rate > 70%
- Zero data loss

### Dependencies
- Gemini API key (Pro and Flash)
- Supabase Edge Functions enabled
- Supabase Realtime configured
- pgvector extension installed
- youtube-transcript package

---

## Appendix: Key Prompts

### Document Extraction & Chunking
```javascript
const EXTRACTION_AND_CHUNKING_PROMPT = `
You are an expert document processor. Process this document in three phases.

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

PHASE 2 - SEMANTIC CHUNKING:
Break into meaningful chunks where each chunk is:
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

### Connection Analysis
```javascript
const CONNECTION_ANALYSIS_PROMPT = `
Analyze the relationship between these two text chunks:

CHUNK A: [source content]
CHUNK B: [target content]

Determine the connection type:
- supports: B reinforces or agrees with A's argument
- contradicts: B opposes or challenges A's claims
- extends: B builds upon A's ideas in new directions
- references: B explicitly mentions concepts from A
- parallel: Similar structure or pattern but different content
- bridges: Connects two previously unrelated domains

Consider:
- Logical relationship
- Semantic overlap
- Argumentative stance
- Domain crossover

Return JSON: { "connectionType": "...", "reasoning": "...", "strength": 0.0-1.0 }
`;
```

---

**Document Version:** 2.0  
**Last Updated:** January 26, 2025  
**Status:** Ready for Implementation