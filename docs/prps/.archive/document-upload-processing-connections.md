# PRP: Document Upload, Processing & Connection Detection

**Feature Name:** Document Upload, AI Processing & Cross-Document Connection Detection  
**PRP Version:** 1.0  
**Date:** January 26, 2025  
**Status:** Ready for Implementation  
**Confidence Score:** 8/10

---

## Executive Summary

### Feature Overview
A comprehensive document ingestion and knowledge synthesis system that accepts PDFs and text documents, processes them through AI (Gemini 1.5 Pro) to create clean markdown with semantic chunks, and automatically discovers meaningful connections between documents using vector similarity search and AI analysis.

### Business Value
- **Knowledge Synthesis**: Automatically discover non-obvious connections across reading materials
- **Enhanced Reading**: Transform static documents into interconnected knowledge graphs
- **Study Efficiency**: Convert documents and connections into flashcards for spaced repetition
- **Data Ownership**: Users retain full control with export capabilities

### Key Outcomes
- Multi-format document support (PDF, TXT, Markdown) with AI extraction
- Semantic chunking with themes and importance scoring
- Automatic cross-document connection detection using pgvector
- Connections as first-class ECS entities (annotatable, studiable)
- Real-time processing progress tracking
- User-adjustable connection sensitivity for testing/tuning
- Manual retry capability with error display

### Critical Success Factors
1. **AI-First Processing**: Use Gemini for extraction, NOT pdf-parse or similar libraries
2. **Hybrid Storage**: Large files in Supabase Storage, queryable data in PostgreSQL
3. **No Modals**: Use docks, panels, and overlays that preserve reading flow
4. **ECS Architecture**: All user data through Entity-Component-System
5. **Cost Transparency**: Show processing cost estimates to users

---

## User Stories & Requirements

### Primary User Story
**As a** knowledge worker  
**I want to** upload documents and discover non-obvious connections between ideas  
**So that I can** synthesize knowledge across my entire reading library and create effective study materials

### Core Problems Solved
- Knowledge fragmentation across multiple documents
- Missing valuable connections between ideas from different sources
- Manual effort required to create study materials
- Static, siloed information that doesn't reveal patterns

### User Clarifications (From Discovery Phase)
1. **Cost Management**: Show cost estimates before processing, but don't block MVP development with quotas
2. **Connection Sensitivity**: Provide slider (0-100%) to control connection threshold for testing and tuning
3. **Processing Failures**: Display error reason and provide manual retry button (no auto-retry)
4. **Connection Detection Timing**: Run at document upload + manual re-detect button (no automatic schedules)
5. **YouTube Integration**: Basic paste transcript functionality for MVP (no auto-fetch)
6. **Mobile Support**: Desktop priority, mobile responsive but not full-featured

### Acceptance Criteria
- ✅ User can drag-drop PDF files for upload
- ✅ System shows processing cost estimate before upload
- ✅ Processing happens asynchronously with real-time progress updates
- ✅ User can see processing status in bottom dock (non-blocking)
- ✅ Documents are converted to clean markdown stored in Supabase Storage
- ✅ Semantic chunks with embeddings are stored in PostgreSQL
- ✅ Connection detection runs automatically after processing
- ✅ User can adjust connection sensitivity with slider
- ✅ User can manually trigger re-detection
- ✅ Processing failures display error reason with retry button
- ✅ Connections appear in right panel while reading
- ✅ All functionality works on desktop (mobile responsive as bonus)

---

## Technical Architecture

### System Context

**Technology Stack:**
```json
{
  "framework": "Next.js 15.5.4 with App Router",
  "runtime": "React 19.1.0",
  "database": "Supabase PostgreSQL with pgvector",
  "storage": "Supabase Storage",
  "ai": "Google Gemini 1.5 Pro + text-embedding-004",
  "state": "Zustand + TanStack React Query",
  "ui": "Shadcn/ui + Tailwind CSS v4 + Framer Motion"
}
```

**Existing Foundation (Ready to Use):**
- ✅ Complete ECS system: `/src/lib/ecs/ecs.ts` (303 lines)
- ✅ Supabase clients: `/src/lib/supabase/server.ts`, `/src/lib/supabase/client.ts`
- ✅ Auth helpers: `/src/lib/auth/index.ts` (dev mode with hardcoded user ID)
- ✅ Database schema: `/supabase/migrations/001_initial_schema.sql`
- ✅ Storage setup: `/supabase/migrations/002_storage_setup.sql`
- ✅ UI component library: Shadcn/ui installed and configured
- ✅ UI patterns documented: `/docs/UI_PATTERNS.md`

### Architecture Diagrams

#### Storage Architecture (Hybrid Approach)
```
SUPABASE STORAGE (Immutable Files)
└── documents/
    └── {userId}/
        └── {documentId}/
            ├── source.pdf              # Original upload
            ├── content.md              # Processed markdown (from Gemini)
            ├── gemini-response.json    # Raw API response (debugging)
            └── export.bundle.zip       # User data export

POSTGRESQL DATABASE (Queryable Data)
├── documents                # Metadata only, NOT content
│   ├── id, user_id, title
│   ├── storage_path         # Points to Storage
│   ├── processing_status    # 'pending'|'processing'|'completed'|'failed'
│   └── processing_error     # Error message for retry
│
├── chunks                   # Semantic segments with embeddings
│   ├── document_id
│   ├── content              # Text content (<1MB)
│   ├── embedding            # vector(768) for similarity search
│   ├── chunk_index
│   ├── themes               # JSONB array
│   └── importance_score     # 0.0-1.0 for filtering
│
├── entities                 # ECS entities
│   └── id, user_id
│
└── components               # ECS components
    └── connection type      # For connection entities
```

**Decision Rules:**
- **Storage**: Large files (>100KB), immutable content, user-owned data
- **Database**: Queryable data, embeddings (require pgvector), metadata
- **NEVER**: Store full markdown in database, store embeddings in Storage

#### Processing Pipeline (2-Phase Approach)

```
┌─────────────────────────────────────────────────────────────────┐
│ PHASE 1: Quick Metadata Extraction (Server Action, <5s)        │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Upload       →    Extract      →    Estimate    →    Return   │
│  to Storage        first pages       cost              to user  │
│                    via Gemini                                   │
│                    Flash                                        │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ PHASE 2: Full Processing (Edge Function, Async)                │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. Fetch PDF from Storage (signed URL)                        │
│  2. Convert to base64                                          │
│  3. Send to Gemini Pro with structured JSON schema             │
│     - Request: PDF + extraction prompt                         │
│     - Response: { markdown, chunks[] }                         │
│  4. Generate embeddings in parallel (Promise.all)              │
│  5. Save markdown to Storage (content.md)                      │
│  6. Batch insert chunks to Database                            │
│  7. Update processing_status to 'completed'                    │
│  8. Trigger connection detection                               │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ PHASE 3: Connection Detection (Async)                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  For each chunk (importance_score > sensitivity):              │
│    1. Query match_chunks RPC (pgvector similarity)             │
│    2. Filter results by threshold (0.75 default)               │
│    3. Analyze connection type with Gemini                      │
│    4. Create connection entity via ECS if strength > threshold │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Why This Architecture:**
- **Phase 1 Server Action**: Fast user feedback (<5s), immediate title/metadata
- **Phase 2 Edge Function**: Long-running AI processing without timeout limits
- **Phase 3 Async Detection**: Prevents blocking document availability
- **Hybrid Storage**: Optimizes for query performance and cost
- **ECS Connections**: Maximum flexibility for future features

### Data Models

#### Documents Table
```sql
CREATE TABLE documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  title TEXT NOT NULL,
  author TEXT,
  summary TEXT,
  storage_path TEXT NOT NULL,              -- 'userId/documentId/'
  processing_status TEXT DEFAULT 'pending', -- 'pending'|'processing'|'completed'|'failed'
  processing_error TEXT,
  processing_started_at TIMESTAMPTZ,
  processing_completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_documents_user_id ON documents(user_id);
CREATE INDEX idx_documents_status ON documents(processing_status);
```

#### Chunks Table
```sql
CREATE TABLE chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID REFERENCES documents ON DELETE CASCADE,
  content TEXT NOT NULL,
  chunk_index INTEGER NOT NULL,
  embedding vector(768),                   -- Gemini text-embedding-004
  themes JSONB,                            -- ['theme1', 'theme2']
  importance_score FLOAT,                  -- 0.0-1.0
  summary TEXT,
  start_offset INTEGER,
  end_offset INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_chunks_document ON chunks(document_id);
-- IVFFlat index for similarity search (CRITICAL for performance)
CREATE INDEX idx_chunks_embedding ON chunks 
  USING ivfflat (embedding vector_cosine_ops) 
  WITH (lists = 100);
```

#### Connection Entities (via ECS)
```typescript
// Connection as ECS entity (not direct table)
interface ConnectionEntity {
  entity_id: string;
  components: {
    connection: {
      source_chunk_id: string;
      target_chunk_id: string;
      connection_type: 'supports' | 'contradicts' | 'extends' | 'references' | 'parallel' | 'bridges';
      strength: number;              // 0.0-1.0
      reasoning: string;             // AI explanation
      auto_detected: boolean;
      user_confirmed: boolean;
      user_hidden: boolean;
    };
    source: {
      document_ids: [string, string];
      chunk_previews: [string, string];
    };
    embedding: {
      vector: number[];              // Connection's own embedding
    };
    themes: {
      combined: string[];            // Union of both chunks' themes
    };
  };
}
```

### API Specifications

#### Server Actions (app/actions/documents.ts)

```typescript
/**
 * Uploads a document to Supabase Storage and creates metadata record.
 * 
 * @param formData - Form data containing the PDF file
 * @returns Result with document ID and processing status
 * @throws {Error} If upload or database insert fails
 */
export async function uploadDocument(formData: FormData): Promise<{
  success: boolean;
  documentId?: string;
  error?: string;
}>;

/**
 * Estimates the processing cost for a document.
 * 
 * @param file - The file to estimate
 * @returns Estimated tokens, cost in USD, and processing time
 */
export async function estimateProcessingCost(file: File): Promise<{
  tokens: number;
  cost: number;
  estimatedTime: number;
}>;

/**
 * Triggers processing for an uploaded document.
 * 
 * @param documentId - Document to process
 * @returns Success status
 */
export async function triggerProcessing(documentId: string): Promise<{
  success: boolean;
  error?: string;
}>;

/**
 * Retries failed document processing.
 * 
 * @param documentId - Document to retry
 * @returns Success status
 */
export async function retryProcessing(documentId: string): Promise<{
  success: boolean;
  error?: string;
}>;
```

#### Edge Function (supabase/functions/process-document/index.ts)

```typescript
/**
 * Edge Function for document processing via Gemini API.
 * Handles PDF extraction, chunking, embedding generation.
 */
serve(async (req: Request) => {
  const { documentId, storagePath } = await req.json();
  
  // 1. Fetch PDF from Storage
  // 2. Convert to base64
  // 3. Send to Gemini Pro
  // 4. Generate embeddings
  // 5. Save results
  // 6. Update status
  
  return new Response(JSON.stringify({ success: true }));
});
```

#### Database Functions (pgvector)

```sql
/**
 * Finds similar chunks using cosine similarity.
 * 
 * @param query_embedding - Embedding vector to search for
 * @param match_threshold - Minimum similarity (0.0-1.0)
 * @param match_count - Maximum results to return
 * @param exclude_document_id - Optional document to exclude
 * @param min_importance - Minimum importance score filter
 * @returns Table of matching chunks with similarity scores
 */
CREATE OR REPLACE FUNCTION match_chunks(
  query_embedding vector(768),
  match_threshold float DEFAULT 0.8,
  match_count int DEFAULT 10,
  exclude_document_id uuid DEFAULT NULL,
  min_importance float DEFAULT 0.5
) RETURNS TABLE (
  id uuid,
  document_id uuid,
  content text,
  similarity float,
  themes jsonb,
  importance_score float
);
```

### External Integrations

#### Gemini 1.5 Pro API Integration

**Documentation:**
- Primary: https://ai.google.dev/gemini-api/docs/get-started/tutorial?lang=node
- JSON Mode: https://ai.google.dev/gemini-api/docs/json-mode
- Embeddings: https://ai.google.dev/gemini-api/docs/embeddings

**Installation:**
```bash
npm install @google/generative-ai
```

**Configuration:**
```typescript
// Environment variables (add to .env.local and Supabase secrets)
GOOGLE_AI_API_KEY=<your-api-key>
```

**Usage Pattern:**
```typescript
import { GoogleGenerativeAI } from '@google/generative-ai';

// Initialize
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY!);

// Document extraction with structured JSON output
const model = genAI.getGenerativeModel({ 
  model: 'gemini-1.5-pro',
  generationConfig: {
    responseMimeType: "application/json",
    responseSchema: {
      type: "object",
      properties: {
        markdown: { type: "string" },
        chunks: {
          type: "array",
          items: {
            type: "object",
            properties: {
              content: { type: "string" },
              themes: { type: "array", items: { type: "string" } },
              importance_score: { type: "number" },
              summary: { type: "string" }
            }
          }
        }
      }
    }
  }
});

// Convert PDF to base64 (REQUIRED)
const pdfBuffer = await pdfResponse.arrayBuffer();
const pdfBase64 = btoa(String.fromCharCode(...new Uint8Array(pdfBuffer)));

// Send multi-modal content
const result = await model.generateContent([
  {
    inlineData: {
      mimeType: 'application/pdf',
      data: pdfBase64
    }
  },
  {
    text: EXTRACTION_PROMPT
  }
]);

// Parse structured response
const response = JSON.parse(result.response.text());

// Generate embeddings in parallel
const embeddingModel = genAI.getGenerativeModel({ model: 'text-embedding-004' });
const embeddings = await Promise.all(
  response.chunks.map(chunk => 
    embeddingModel.embedContent(chunk.content)
  )
);
```

**Critical Gotchas:**
- ❌ **NEVER** use pdf-parse or similar libraries - Gemini handles PDFs natively
- ❌ **NEVER** store embeddings as JSON - Use PostgreSQL `vector(768)` type
- ✅ **ALWAYS** convert PDFs to base64 before sending (Gemini doesn't accept URLs)
- ✅ **ALWAYS** use structured JSON output with `responseMimeType` and `responseSchema`
- ✅ **ALWAYS** generate embeddings in parallel with `Promise.all()`

**Cost Estimation:**
```typescript
// Gemini 1.5 Pro pricing (as of Jan 2025)
const COST_PER_1K_CHARS_INPUT = 0.00025;
const COST_PER_1K_CHARS_OUTPUT = 0.00050;
const EMBEDDING_COST_PER_1K_CHARS = 0.000025;

function estimateCost(fileSize: number): { tokens: number, cost: number } {
  const estimatedChars = fileSize * 1.5; // PDF to text ratio
  const inputTokens = Math.ceil(estimatedChars / 1000);
  const outputTokens = Math.ceil(estimatedChars * 0.5 / 1000); // Markdown ~50% of input
  const embeddingTokens = Math.ceil(estimatedChars * 0.3 / 1000); // Chunks ~30% of input
  
  const cost = 
    (inputTokens * COST_PER_1K_CHARS_INPUT) +
    (outputTokens * COST_PER_1K_CHARS_OUTPUT) +
    (embeddingTokens * EMBEDDING_COST_PER_1K_CHARS);
  
  return { tokens: inputTokens + outputTokens + embeddingTokens, cost };
}
```

#### pgvector Integration

**Documentation:**
- GitHub: https://github.com/pgvector/pgvector
- Querying: https://github.com/pgvector/pgvector#querying
- Performance: https://github.com/pgvector/pgvector#performance

**Setup:**
```sql
-- Enable extension (already done in migration 001)
CREATE EXTENSION IF NOT EXISTS vector;

-- Create similarity search function
CREATE OR REPLACE FUNCTION match_chunks(
  query_embedding vector(768),
  match_threshold float DEFAULT 0.8,
  match_count int DEFAULT 10,
  exclude_document_id uuid DEFAULT NULL,
  min_importance float DEFAULT 0.5
)
RETURNS TABLE (
  id uuid,
  document_id uuid,
  content text,
  similarity float,
  themes jsonb,
  importance_score float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    chunks.id,
    chunks.document_id,
    chunks.content,
    1 - (chunks.embedding <=> query_embedding) as similarity,
    chunks.themes,
    chunks.importance_score
  FROM chunks
  WHERE 
    (exclude_document_id IS NULL OR chunks.document_id != exclude_document_id)
    AND chunks.importance_score >= min_importance
    AND 1 - (chunks.embedding <=> query_embedding) > match_threshold
  ORDER BY chunks.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- Create IVFFlat index for performance (CRITICAL)
CREATE INDEX IF NOT EXISTS idx_chunks_embedding ON chunks 
  USING ivfflat (embedding vector_cosine_ops) 
  WITH (lists = 100);

-- IMPORTANT: Run VACUUM ANALYZE after creating index
VACUUM ANALYZE chunks;
```

**Usage:**
```typescript
// Call from Edge Function or Server Action
const { data: similarChunks } = await supabase.rpc('match_chunks', {
  query_embedding: sourceChunk.embedding,
  match_threshold: 0.75,
  match_count: 20,
  exclude_document_id: sourceChunk.document_id,
  min_importance: 0.5
});
```

**Performance Considerations:**
- Without IVFFlat index: ~1000ms for 10K chunks
- With IVFFlat index: ~10ms for 10K chunks (100x improvement)
- Index lists parameter: `sqrt(row_count)` is recommended starting point

#### Supabase Edge Functions

**Documentation:**
- Quickstart: https://supabase.com/docs/guides/functions/quickstart
- Deploy: https://supabase.com/docs/guides/functions/deploy
- Environment: https://supabase.com/docs/guides/functions/secrets

**Structure:**
```typescript
// supabase/functions/process-document/index.ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { GoogleGenerativeAI } from 'npm:@google/generative-ai';

serve(async (req: Request) => {
  try {
    // Parse request
    const { documentId, storagePath } = await req.json();
    
    // Initialize clients
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );
    const genAI = new GoogleGenerativeAI(Deno.env.get('GOOGLE_AI_API_KEY')!);
    
    // Process document
    const result = await processDocument(documentId, storagePath, supabase, genAI);
    
    return new Response(JSON.stringify({ success: true, result }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
```

**Deployment:**
```bash
# Set secrets
npx supabase secrets set GOOGLE_AI_API_KEY=<your-key>

# Deploy function
npx supabase functions deploy process-document

# Test locally
npx supabase functions serve process-document
```

**Invocation from Next.js:**
```typescript
// From Server Action
const supabase = await createClient();
const { data, error } = await supabase.functions.invoke('process-document', {
  body: { documentId, storagePath }
});
```

#### Supabase Realtime

**Documentation:**
- Postgres Changes: https://supabase.com/docs/guides/realtime/postgres-changes
- Quickstart: https://supabase.com/docs/guides/realtime/quickstart

**Setup:**
```typescript
// Client component
'use client';
import { useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';

export function ProcessingDock() {
  const supabase = createClient();
  
  useEffect(() => {
    const channel = supabase
      .channel('document-processing')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'documents',
          filter: 'processing_status=neq.completed'
        },
        (payload) => {
          // Update UI with new status
          console.log('Document updated:', payload.new);
        }
      )
      .subscribe();
    
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);
}
```

---

## Implementation Blueprint

### Phase 1: Foundation Setup

#### Step 1.1: Install Dependencies
```bash
# Install Google AI SDK
npm install @google/generative-ai

# Verify Supabase CLI
npx supabase --version

# Start local Supabase
npx supabase start
```

#### Step 1.2: Create Database Migration
**File:** `supabase/migrations/005_vector_search.sql`

```sql
-- Create match_chunks function for similarity search
CREATE OR REPLACE FUNCTION match_chunks(
  query_embedding vector(768),
  match_threshold float DEFAULT 0.8,
  match_count int DEFAULT 10,
  exclude_document_id uuid DEFAULT NULL,
  min_importance float DEFAULT 0.5
)
RETURNS TABLE (
  id uuid,
  document_id uuid,
  content text,
  similarity float,
  themes jsonb,
  importance_score float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    chunks.id,
    chunks.document_id,
    chunks.content,
    1 - (chunks.embedding <=> query_embedding) as similarity,
    chunks.themes,
    chunks.importance_score
  FROM chunks
  WHERE 
    (exclude_document_id IS NULL OR chunks.document_id != exclude_document_id)
    AND chunks.importance_score >= min_importance
    AND 1 - (chunks.embedding <=> query_embedding) > match_threshold
  ORDER BY chunks.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- Create IVFFlat index (CRITICAL for performance)
CREATE INDEX IF NOT EXISTS idx_chunks_embedding ON chunks 
  USING ivfflat (embedding vector_cosine_ops) 
  WITH (lists = 100);

-- Run VACUUM ANALYZE to optimize index
VACUUM ANALYZE chunks;
```

**Apply migration:**
```bash
npx supabase db push
```

#### Step 1.3: Create Zustand Store
**File:** `src/stores/processing-store.ts`

```typescript
import { create } from 'zustand';

/**
 * Processing job status.
 */
export type ProcessingStatus = 'pending' | 'processing' | 'embedding' | 'completed' | 'failed';

/**
 * Processing job interface.
 */
export interface ProcessingJob {
  id: string;
  documentId: string;
  title: string;
  status: ProcessingStatus;
  progress: number;
  error?: string;
  startedAt: Date;
  completedAt?: Date;
}

/**
 * Processing store state.
 */
interface ProcessingState {
  jobs: ProcessingJob[];
  addJob: (job: ProcessingJob) => void;
  updateJob: (id: string, updates: Partial<ProcessingJob>) => void;
  removeJob: (id: string) => void;
  clearCompleted: () => void;
}

/**
 * Zustand store for managing document processing jobs.
 * Tracks status, progress, and errors for real-time UI updates.
 */
export const useProcessingStore = create<ProcessingState>((set) => ({
  jobs: [],
  
  addJob: (job) => set((state) => ({
    jobs: [...state.jobs, job]
  })),
  
  updateJob: (id, updates) => set((state) => ({
    jobs: state.jobs.map(job => 
      job.id === id ? { ...job, ...updates } : job
    )
  })),
  
  removeJob: (id) => set((state) => ({
    jobs: state.jobs.filter(job => job.id !== id)
  })),
  
  clearCompleted: () => set((state) => ({
    jobs: state.jobs.filter(job => job.status !== 'completed')
  }))
}));
```

**Reference:** Follows Zustand patterns, integrates with real-time updates.

### Phase 2: Upload System

#### Step 2.1: Create Server Actions
**File:** `src/app/actions/documents.ts`

```typescript
'use server';

import { createClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/auth';

/**
 * Estimates processing cost for a document.
 * 
 * @param fileSize - Size of file in bytes
 * @returns Estimated tokens, cost, and processing time
 */
export async function estimateProcessingCost(fileSize: number): Promise<{
  tokens: number;
  cost: number;
  estimatedTime: number;
}> {
  // Gemini 1.5 Pro pricing
  const COST_PER_1K_CHARS_INPUT = 0.00025;
  const COST_PER_1K_CHARS_OUTPUT = 0.00050;
  const EMBEDDING_COST_PER_1K_CHARS = 0.000025;
  
  // Estimate character count (PDF to text ratio ~1.5)
  const estimatedChars = fileSize * 1.5;
  const inputTokens = Math.ceil(estimatedChars / 1000);
  const outputTokens = Math.ceil(estimatedChars * 0.5 / 1000);
  const embeddingTokens = Math.ceil(estimatedChars * 0.3 / 1000);
  
  const totalTokens = inputTokens + outputTokens + embeddingTokens;
  const cost = 
    (inputTokens * COST_PER_1K_CHARS_INPUT) +
    (outputTokens * COST_PER_1K_CHARS_OUTPUT) +
    (embeddingTokens * EMBEDDING_COST_PER_1K_CHARS);
  
  // Estimate processing time (rough: 1 page per second)
  const estimatedPages = fileSize / 50000; // ~50KB per page
  const estimatedTime = estimatedPages * 1000; // milliseconds
  
  return { tokens: totalTokens, cost, estimatedTime };
}

/**
 * Uploads a document to Supabase Storage and creates metadata record.
 * 
 * @param formData - Form data containing the PDF file
 * @returns Result with document ID or error
 */
export async function uploadDocument(formData: FormData): Promise<{
  success: boolean;
  documentId?: string;
  error?: string;
}> {
  try {
    const file = formData.get('file') as File;
    if (!file) {
      return { success: false, error: 'No file provided' };
    }
    
    // Validate file type
    if (!file.type.includes('pdf') && !file.type.includes('text')) {
      return { success: false, error: 'Only PDF and text files are supported' };
    }
    
    // Get user and initialize client
    const user = await getCurrentUser();
    const supabase = await createClient();
    const documentId = crypto.randomUUID();
    
    // Upload to Storage
    const storagePath = `${user.id}/${documentId}/source.pdf`;
    const { error: uploadError } = await supabase.storage
      .from('documents')
      .upload(storagePath, file);
    
    if (uploadError) {
      return { success: false, error: uploadError.message };
    }
    
    // Create database record
    const { error: dbError } = await supabase
      .from('documents')
      .insert({
        id: documentId,
        user_id: user.id,
        title: file.name.replace(/\.[^/.]+$/, ''),
        storage_path: `${user.id}/${documentId}`,
        processing_status: 'pending'
      });
    
    if (dbError) {
      // Rollback storage upload
      await supabase.storage.from('documents').remove([storagePath]);
      return { success: false, error: dbError.message };
    }
    
    return { success: true, documentId };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}

/**
 * Triggers processing for an uploaded document.
 * Invokes Edge Function asynchronously.
 * 
 * @param documentId - Document to process
 * @returns Success status
 */
export async function triggerProcessing(documentId: string): Promise<{
  success: boolean;
  error?: string;
}> {
  try {
    const supabase = await createClient();
    const user = await getCurrentUser();
    
    // Update status to processing
    await supabase
      .from('documents')
      .update({ 
        processing_status: 'processing',
        processing_started_at: new Date().toISOString()
      })
      .eq('id', documentId);
    
    // Invoke Edge Function (async)
    const { error } = await supabase.functions.invoke('process-document', {
      body: { 
        documentId, 
        storagePath: `${user.id}/${documentId}`
      }
    });
    
    if (error) {
      // Update status to failed
      await supabase
        .from('documents')
        .update({ 
          processing_status: 'failed',
          processing_error: error.message 
        })
        .eq('id', documentId);
      
      return { success: false, error: error.message };
    }
    
    return { success: true };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}

/**
 * Retries failed document processing.
 * 
 * @param documentId - Document to retry
 * @returns Success status
 */
export async function retryProcessing(documentId: string): Promise<{
  success: boolean;
  error?: string;
}> {
  try {
    const supabase = await createClient();
    
    // Reset status to pending
    await supabase
      .from('documents')
      .update({ 
        processing_status: 'pending',
        processing_error: null 
      })
      .eq('id', documentId);
    
    // Trigger processing
    return await triggerProcessing(documentId);
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}
```

**References:**
- Supabase client: `/src/lib/supabase/server.ts`
- Auth helper: `/src/lib/auth/index.ts`
- Pattern: Server Actions from `/docs/rEACT_GUIDELINES.md`

---

## Validation Gates

### Code Quality Gates
```bash
# ESLint (enforces JSDoc on all functions)
npm run lint

# TypeScript type checking
npm run build

# Development server
npm run dev
```

**Success Criteria:**
- ✅ Zero ESLint errors (all functions have JSDoc)
- ✅ Zero TypeScript errors
- ✅ Application builds successfully

### Database Validation
```bash
# Apply all migrations
npx supabase db push

# Verify pgvector extension
npx supabase db execute --sql "SELECT * FROM pg_extension WHERE extname = 'vector';"

# Test match_chunks function
npx supabase db execute --sql "SELECT match_chunks('[0.1, 0.2, ...]'::vector(768), 0.8);"

# Verify IVFFlat index exists
npx supabase db execute --sql "SELECT indexname FROM pg_indexes WHERE tablename = 'chunks' AND indexname = 'idx_chunks_embedding';"

# Check Storage bucket
npx supabase storage ls documents
```

**Success Criteria:**
- ✅ All migrations applied successfully
- ✅ pgvector extension enabled
- ✅ match_chunks function returns results
- ✅ IVFFlat index created on chunks.embedding
- ✅ documents Storage bucket accessible

---

## External Resources

### Primary Documentation

**Gemini 1.5 Pro API:**
- Tutorial: https://ai.google.dev/gemini-api/docs/get-started/tutorial?lang=node
- JSON Mode: https://ai.google.dev/gemini-api/docs/json-mode
- Multi-modal: https://ai.google.dev/gemini-api/docs/vision
- Embeddings: https://ai.google.dev/gemini-api/docs/embeddings
- Pricing: https://ai.google.dev/pricing

**pgvector:**
- GitHub: https://github.com/pgvector/pgvector
- Querying: https://github.com/pgvector/pgvector#querying
- Performance: https://github.com/pgvector/pgvector#performance
- Indexing: https://github.com/pgvector/pgvector#indexing

**Supabase:**
- Edge Functions: https://supabase.com/docs/guides/functions/quickstart
- Realtime: https://supabase.com/docs/guides/realtime/postgres-changes
- Storage: https://supabase.com/docs/guides/storage

### Internal References

**Codebase Files:**
- ECS System: `/src/lib/ecs/ecs.ts` (lines 1-303)
- Supabase Clients: `/src/lib/supabase/server.ts`, `/src/lib/supabase/client.ts`
- Auth Helper: `/src/lib/auth/index.ts` (lines 1-54)
- Database Schema: `/supabase/migrations/001_initial_schema.sql`
- Storage Setup: `/supabase/migrations/002_storage_setup.sql`

**Documentation:**
- Architecture: `/docs/ARCHITECTURE.md`
- UI Patterns: `/docs/UI_PATTERNS.md` (ProcessingDock lines 606-737)
- React Guidelines: `/docs/rEACT_GUIDELINES.md`
- Storage Patterns: `/docs/STORAGE_PATTERNS.md`
- ECS Guide: `/docs/ECS_IMPLEMENTATION.md`

---

## Risk Assessment & Mitigation

### Technical Risks

**Risk 1: Gemini API Rate Limits**
- **Probability:** Medium
- **Impact:** High (blocks processing)
- **Mitigation:** 
  - Implement exponential backoff retry logic
  - Show cost estimates to discourage large batch uploads
  - Queue processing requests to avoid bursts
  - Monitor API usage with alerts

**Risk 2: pgvector Performance Degradation**
- **Probability:** Medium
- **Impact:** High (slow connection detection)
- **Mitigation:**
  - Create IVFFlat index (100x performance improvement)
  - Implement importance filtering (reduces search space)
  - Use connection sensitivity threshold (user-adjustable)
  - Monitor query performance, adjust index lists parameter

**Risk 3: Connection Noise/Overwhelm**
- **Probability:** High
- **Impact:** Medium (poor UX)
- **Mitigation:**
  - Default sensitivity to 50% (moderate threshold)
  - User-adjustable sensitivity slider for tuning
  - Importance scoring filters low-value connections
  - Connection type badges help users filter visually

---

## Confidence Score & Rationale

**Score: 8/10**

### Strengths (+8 points)
1. **Complete Foundation** (+2): ECS, database schema, Supabase integration all ready
2. **Comprehensive Research** (+2): Gemini API, pgvector, Edge Functions fully researched
3. **Clear Requirements** (+1): User clarifications received for all business logic gaps
4. **Documented Patterns** (+1): Architecture, UI, React patterns all documented
5. **Executable Validation** (+1): All validation commands available
6. **Detailed Task Breakdown** (+1): Ready for Archon task creation

### Risks (-2 points)
1. **No Existing Implementations** (-1): No Server Actions or Edge Functions to reference
2. **Complex External Integration** (-0.5): Gemini API is new, may have edge cases
3. **Connection Quality Uncertainty** (-0.5): Simple heuristic may need tuning

### Mitigation Plan
- Provide complete code templates for Server Actions and Edge Functions
- Include retry logic and error handling in all API integrations
- Make connection sensitivity user-adjustable for iterative improvement
- Document all external API patterns with examples

**Conclusion:** High confidence for one-pass implementation success. The foundation is solid, research is comprehensive, and risks are mitigated with clear strategies.

---

**Document Version:** 1.0  
**Last Updated:** January 26, 2025  
**Status:** Ready for Implementation  
**Next Step:** Create Archon tasks for implementation phases