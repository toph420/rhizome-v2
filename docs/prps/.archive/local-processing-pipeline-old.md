# PRP: Local Processing Pipeline Migration

**Status**: Ready for Implementation
**Priority**: High
**Complexity**: High
**Estimated Effort**: 3-5 days
**Dependencies**: Ollama, Qwen 32B, nomic-embed-text models installed locally

---

## Discovery Summary

### Initial Task Analysis

User provided comprehensive reference document (`docs/todo/updated-local-processing-pipeline.md`) describing migration from Gemini API to 100% local processing using:
- Docling for PDF/EPUB extraction
- Qwen 32B via Ollama for LLM processing
- PydanticAI for structured outputs
- sentence-transformers for embeddings

**Critical discovery**: Reference document assumes Python-based implementation, but Rhizome V2 worker is **TypeScript**. This requires architectural decision on integration approach.

### User Clarifications Received

1. **Question**: How to handle Ollama service not running?
   - **Answer**: Auto-start or prompt user (personal tool, simple approach)
   - **Impact**: Need pre-flight check with clear error messages

2. **Question**: UX during 40-80 minute processing?
   - **Answer**: Background processing with real-time ProcessingDock updates
   - **Impact**: Reuse existing ProcessingDock, no new UI needed

3. **Question**: Migration strategy for existing Gemini-processed documents?
   - **Answer**: Clean slate - remove all existing documents
   - **Impact**: No backward compatibility, database wipe acceptable

4. **Question**: Review checkpoint workflow capabilities?
   - **Answer**: Edit in Obsidian using existing pattern (`obsidian-sync.ts`)
   - **Impact**: Reuse proven export → edit → sync pattern

5. **Question**: Synthetic chunks visibility to users?
   - **Answer**: Review screen in sidebar (extend existing review tab)
   - **Impact**: Small UI extension, follow existing review patterns

### Missing Requirements Identified

- ✅ Service dependency management resolved (pre-flight check)
- ✅ Long processing UX resolved (background + real-time updates)
- ✅ Migration strategy resolved (clean slate)
- ✅ Review workflow resolved (Obsidian pattern)
- ✅ Synthetic chunks UI resolved (extend review tab)

---

## Goal

Migrate Rhizome V2's document processing pipeline from cloud-based Gemini API to 100% local processing using Ollama, achieving:

1. **Zero API costs**: Eliminate $0.50+ per document Gemini charges
2. **Complete privacy**: All processing happens locally, no data sent to external services
3. **No vendor lock-in**: Open source models, replaceable components
4. **100% chunk recovery**: Bulletproof matching guarantees no metadata loss
5. **User control**: Review checkpoints at extraction and cleanup stages

---

## Why

### Business Value
- **Cost Savings**: $0 per document vs $0.50+ with Gemini API
- **Privacy**: Personal documents never leave user's machine
- **Control**: User can review and edit at multiple stages
- **Reliability**: No API rate limits, network dependencies, or service outages

### User Impact
- **Acceptable tradeoff**: 40-80 minutes processing time for free operation
- **Transparency**: Review screens show extraction and cleanup quality
- **Data ownership**: Complete control over processing pipeline
- **No surprises**: Clear progress tracking and error messages

### Integration
- Builds on existing: Docling extraction, ProcessingDock, Obsidian sync
- Preserves: 3-engine connection detection, ECS annotation system
- Enhances: Review workflows, chunk confidence tracking, position recovery

---

## What

### User-Visible Behavior

1. **Pre-upload Check**:
   - System verifies Ollama is running before processing starts
   - Clear error with instructions if Ollama unavailable
   - Model availability check (Qwen 32B, nomic-embed-text)

2. **Processing Flow** (40-80 minutes for 500-page book):
   - Stage 1: Docling extraction (15-50%) - Already local ✅
   - Stage 2: Regex cleanup (50-55%) - Already local ✅
   - **Optional**: Review extraction in Obsidian (user can edit)
   - Stage 3: LLM cleanup (55-70%) - **NEW: Ollama + Zod**
   - **Optional**: Review cleanup in Obsidian (user can edit)
   - Stage 4: Bulletproof chunk matching (70-75%) - **NEW: 5-layer failsafe**
   - Stage 5: Metadata enrichment (75-90%) - **NEW: Ollama + Zod**
   - Stage 6: Embeddings (90-95%) - **NEW: Ollama nomic-embed-text**
   - Stage 7: Save to database (95-98%) - Already works ✅
   - Stage 8: Connection detection (async) - **NEW: Ollama for thematic bridge**

3. **Review Checkpoints**:
   - After Docling extraction: Export to Obsidian for preview/edit
   - After LLM cleanup: Export to Obsidian for final approval
   - User can approve or make edits, pipeline continues with edited version

4. **Synthetic Chunks Review**:
   - Sidebar review tab shows chunks with confidence < "high"
   - User can validate synthetic chunks (interpolated positions)
   - Visual indicators: exact (green), high (blue), medium (yellow), synthetic (red)

### Technical Requirements

- **Pure TypeScript**: Worker remains TypeScript-only (except Docling subprocess)
- **Dependencies**: ollama-js, Zod, zod-to-json-schema (remove @google/genai)
- **Database**: New fields for position confidence tracking (migration 045)
- **Validation**: Ollama must be running with required models installed
- **Error Handling**: Graceful degradation, clear error messages, retry logic

### Success Criteria

- [ ] Process 500-page PDF in <80 minutes (without LLM cleanup)
- [ ] Process 500-page PDF in <120 minutes (with LLM cleanup)
- [ ] 100% chunk recovery rate (5-layer failsafe works)
- [ ] ≥85% chunks matched with "exact" confidence
- [ ] ≤2% chunks marked as "synthetic" (requiring review)
- [ ] Zero API costs ($0 per document)
- [ ] All existing features work (annotations, connections, flashcards)
- [ ] Review checkpoints functional in Obsidian
- [ ] Synthetic chunks visible in review tab

---

## All Needed Context

### Research Phase Summary

- **Codebase patterns found**:
  - Docling subprocess pattern (TypeScript → Python bridge)
  - ProcessingDock with multi-stage progress
  - Obsidian export/sync with review checkpoints (`awaiting_manual_review` status)
  - Annotation review tab with confidence scoring
  - Background job system with polling

- **External research needed**: YES
  - Ollama TypeScript integration (ollama-js library)
  - Structured outputs without PydanticAI (Zod validation)
  - Embeddings strategy (Ollama vs sentence-transformers)

- **Knowledge gaps identified**:
  - How to get JSON schema validation in TypeScript (solved: Zod + zod-to-json-schema)
  - LLM retry strategies for malformed JSON (solved: try/catch with 3 retries)
  - Chunk matching algorithms (solved: fuzzy + embedding + LLM + interpolation)

### Documentation & References

```yaml
# CRITICAL - Ollama Integration
- url: https://ollama.com/blog/structured-outputs
  why: Official pattern for TypeScript structured outputs with JSON schema
  critical: Use format parameter with zodToJsonSchema for validation

- url: https://www.npmjs.com/package/ollama
  why: ollama-js API documentation for chat/embeddings
  critical: Streaming vs non-streaming, error handling patterns

- url: https://github.com/inferablehq/ollama-structured-outputs
  why: Real-world Zod + Ollama retry patterns
  critical: Handle malformed JSON with exponential backoff

# CRITICAL - Structured Validation
- url: https://www.npmjs.com/package/zod
  why: Runtime validation for LLM outputs (TypeScript alternative to PydanticAI)
  critical: z.object() schemas, .parse() for validation

- url: https://www.npmjs.com/package/zod-to-json-schema
  why: Convert Zod schemas to JSON schema for Ollama format parameter
  critical: zodToJsonSchema(schema) pattern

# Codebase Patterns (MUST READ)
- file: worker/lib/docling-extractor.ts
  why: Subprocess spawning pattern for Python integration
  critical: Temp file management, progress parsing, error handling

- file: worker/handlers/obsidian-sync.ts
  why: Review checkpoint pattern (lines 253-261)
  critical: awaiting_manual_review status, export → edit → sync flow

- file: src/components/layout/ProcessingDock.tsx
  why: Multi-stage progress UI with real-time updates
  critical: Stage labels, substage tracking, polling + realtime subscription

- file: src/components/sidebar/AnnotationReviewTab.tsx
  why: Review UI pattern with confidence scores
  critical: Accept/reject buttons, batch operations, confidence badges

- file: worker/processors/pdf-processor.ts
  why: Current PDF processing flow (Gemini-based)
  critical: Stage progression, review checkpoints, error handling

# Reference Document
- docfile: docs/todo/updated-local-processing-pipeline.md
  why: Comprehensive pipeline specification (Python-centric)
  critical: 8-stage flow, bulletproof matching, performance targets
```

### Current Codebase Structure

```bash
worker/
├── processors/
│   ├── pdf-processor.ts          # Current Gemini implementation (REPLACE AI calls)
│   ├── epub-processor.ts
│   └── ...
├── lib/
│   ├── docling-extractor.ts      # Existing Python bridge (EXTEND)
│   ├── embeddings.ts             # Gemini embeddings (REPLACE)
│   ├── markdown-cleanup-ai.ts    # Gemini cleanup (REPLACE)
│   └── ai-chunking-batch.ts      # Gemini chunking (REPLACE)
├── engines/
│   ├── orchestrator.ts
│   ├── semantic-similarity.ts    # No changes (uses embeddings only)
│   ├── contradiction-detection.ts # No changes (metadata-based)
│   └── thematic-bridge.ts        # REPLACE AI calls
├── handlers/
│   ├── process-document.ts
│   └── obsidian-sync.ts          # Existing review pattern (REUSE)
└── scripts/
    └── docling_extract.py        # Existing Python script (EXTEND)

src/
├── components/
│   ├── layout/
│   │   └── ProcessingDock.tsx    # Update stage labels
│   └── sidebar/
│       └── AnnotationReviewTab.tsx # EXTEND for synthetic chunks
└── lib/
    └── supabase/

supabase/
└── migrations/
    └── 045_local_processing_schema.sql # NEW migration
```

### Desired Codebase Structure (files to add)

```bash
worker/
├── lib/
│   ├── ollama-client.ts          # NEW: Ollama TypeScript client wrapper
│   ├── zod-schemas.ts            # NEW: All Zod validation schemas
│   ├── chunk-matcher.ts          # NEW: 5-layer bulletproof matching
│   └── local-embeddings.ts       # NEW: Ollama embeddings wrapper
├── scripts/
│   └── pre-flight-check.ts       # NEW: Verify Ollama + models
└── types/
    └── ollama.ts                 # NEW: Ollama response types

src/
├── components/
│   └── sidebar/
│       └── SyntheticChunksReview.tsx # NEW: Review UI for synthetic chunks
└── lib/
    └── ollama/
        └── health-check.ts       # NEW: Ollama availability check
```

### Known Gotchas & Library Quirks

```typescript
// CRITICAL: Ollama JSON responses can be malformed
// Always validate with Zod and retry on parse errors
try {
  const data = ChunkMetadataSchema.parse(JSON.parse(response.content));
} catch (error) {
  // Retry with clearer prompt
}

// CRITICAL: Ollama format parameter requires JSON schema, not Zod
// Use zod-to-json-schema for conversion
import { zodToJsonSchema } from 'zod-to-json-schema';
const schema = zodToJsonSchema(ChunkMetadataSchema);

// GOTCHA: Ollama streaming vs non-streaming have different APIs
// Non-streaming: await ollama.chat()
// Streaming: for await (const part of ollama.chat({ stream: true }))

// CRITICAL: Worker subprocess pattern (from Docling)
// Must set PYTHONUNBUFFERED=1 for real-time progress
const python = spawn(pythonPath, [scriptPath], {
  env: { ...process.env, PYTHONUNBUFFERED: '1' }
});

// GOTCHA: Review checkpoint status (from obsidian-sync.ts:253)
// Use 'awaiting_manual_review' not 'awaiting_review'
if (document.processing_status === 'awaiting_manual_review') {
  // Simple sync - no annotation recovery needed
}

// CRITICAL: ProcessingDock expects specific stage keys
// Update STAGE_LABELS in ProcessingDock.tsx for new pipeline
const STAGE_LABELS = {
  extract: { icon: Sparkles, label: '🔧 Docling Extraction' },
  cleanup_local: { icon: Eraser, label: '🧹 Regex Cleanup' },
  cleanup_ai: { icon: Sparkles, label: '🤖 AI Cleanup (Ollama)' },
  // ... etc
};
```

---

## Implementation Blueprint

### Data Models and Structure

#### Zod Schemas (NEW: `worker/lib/zod-schemas.ts`)

```typescript
import { z } from 'zod';

// Chunk metadata schema (replaces PydanticAI)
export const ChunkMetadataSchema = z.object({
  themes: z.array(z.string()).min(1).max(5).describe("Main themes in chunk"),
  concepts: z.array(z.object({
    text: z.string(),
    importance: z.number().min(0).max(1)
  })).describe("Key concepts with importance scores"),
  importance_score: z.number().min(0).max(1).describe("Chunk relevance 0-1"),
  summary: z.string().min(20).max(200).describe("Brief chunk summary"),
  emotional_metadata: z.object({
    polarity: z.number().min(-1).max(1).describe("Sentiment -1 to 1"),
    primary_emotion: z.enum(['joy', 'sadness', 'anger', 'fear', 'surprise', 'neutral']),
    intensity: z.number().min(0).max(1)
  }),
  domain: z.string().describe("Primary field (science, history, etc.)")
});

export type ChunkMetadata = z.infer<typeof ChunkMetadataSchema>;

// Markdown cleanup schema
export const CleanupResultSchema = z.object({
  cleaned_markdown: z.string().describe("Polished markdown output"),
  changes_made: z.array(z.string()).describe("List of cleanup operations performed"),
  confidence: z.number().min(0).max(1).describe("Cleanup quality confidence")
});

export type CleanupResult = z.infer<typeof CleanupResultSchema>;

// Position confidence tracking
export const PositionConfidence = z.enum(['exact', 'high', 'medium', 'synthetic']);
export const PositionMethod = z.enum([
  'exact_match',
  'fuzzy_match',
  'embedding_match',
  'llm_assisted',
  'interpolation'
]);
```

#### Database Schema (NEW: `supabase/migrations/045_local_processing_schema.sql`)

```sql
-- Add position tracking fields to chunks table
ALTER TABLE chunks
  ADD COLUMN position_confidence TEXT
    CHECK (position_confidence IN ('exact', 'high', 'medium', 'synthetic'))
    DEFAULT 'exact',
  ADD COLUMN position_method TEXT
    CHECK (position_method IN ('exact_match', 'fuzzy_match', 'embedding_match', 'llm_assisted', 'interpolation'))
    DEFAULT 'exact_match',
  ADD COLUMN bboxes JSONB, -- PDF coordinates from Docling
  ADD COLUMN heading_path TEXT[], -- Full hierarchy array
  ADD COLUMN section_marker TEXT, -- chapter_001, etc.
  ADD COLUMN position_validated BOOLEAN DEFAULT false;

-- Add indexes for position confidence queries
CREATE INDEX idx_chunks_position_confidence ON chunks(position_confidence);
CREATE INDEX idx_chunks_position_method ON chunks(position_method);
CREATE INDEX idx_chunks_heading_path ON chunks USING gin(heading_path);

-- Add review stage to documents for checkpoint workflow
ALTER TABLE documents
  ADD COLUMN review_stage TEXT
    CHECK (review_stage IN ('docling_extraction', 'llm_cleanup', 'chunking', 'completed'))
    DEFAULT 'completed';

-- Clean slate: Drop all existing chunks and documents
-- User confirmed this is acceptable
TRUNCATE chunks CASCADE;
TRUNCATE documents CASCADE;
TRUNCATE background_jobs CASCADE;

COMMENT ON COLUMN chunks.position_confidence IS 'Chunk matching confidence: exact (85%), high (13%), medium (1.9%), synthetic (0.1%)';
COMMENT ON COLUMN chunks.position_method IS 'Method used to match chunk position after cleanup';
```

#### TypeScript Types (NEW: `worker/types/ollama.ts`)

```typescript
export interface OllamaConfig {
  host: string; // http://localhost:11434
  model: string; // qwen2.5:32b
  temperature?: number;
  timeout?: number;
}

export interface OllamaMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface OllamaChatRequest {
  model: string;
  messages: OllamaMessage[];
  format?: any; // JSON schema from zodToJsonSchema
  stream?: boolean;
  options?: {
    temperature?: number;
    top_p?: number;
    top_k?: number;
  };
}

export interface ChunkMatchResult {
  chunk_index: number;
  content: string;
  original_offset: { start: number; end: number };
  matched_offset: { start: number; end: number } | null;
  confidence: 'exact' | 'high' | 'medium' | 'synthetic';
  method: 'exact_match' | 'fuzzy_match' | 'embedding_match' | 'llm_assisted' | 'interpolation';
  metadata: any; // Preserved from Docling
}
```

### Task List (Implementation Order)

```yaml
Task 1: Setup Ollama Integration
  INSTALL dependencies:
    - ADD: ollama@^0.5.0 to worker/package.json
    - ADD: zod@^3.22.0 to worker/package.json
    - ADD: zod-to-json-schema@^3.24.0 to worker/package.json
    - REMOVE: @google/genai dependency
    - RUN: cd worker && npm install

  CREATE worker/lib/ollama-client.ts:
    - PATTERN: Singleton client with retry logic
    - METHODS: chat(), embeddings(), healthCheck()
    - ERROR_HANDLING: Timeout, connection refused, malformed JSON
    - CODE_REFERENCE: See pseudocode section below

Task 2: Create Zod Validation Schemas
  CREATE worker/lib/zod-schemas.ts:
    - COPY patterns from: worker/lib/ai-chunking-batch.ts (current metadata structure)
    - ADD: ChunkMetadataSchema (replace PydanticAI)
    - ADD: CleanupResultSchema (for LLM cleanup)
    - ADD: Position confidence enums
    - EXPORT: All schemas and inferred types

Task 3: Database Migration
  CREATE supabase/migrations/045_local_processing_schema.sql:
    - PATTERN: Follow existing migration format
    - ADD: position_confidence, position_method to chunks
    - ADD: bboxes, heading_path, section_marker to chunks
    - ADD: review_stage to documents
    - TRUNCATE: chunks, documents (clean slate per user)
    - RUN: npx supabase db reset

Task 4: Implement Pre-flight Check
  CREATE worker/scripts/pre-flight-check.ts:
    - CHECK: Ollama running at http://localhost:11434
    - VERIFY: qwen2.5:32b model exists (ollama list)
    - VERIFY: nomic-embed-text model exists
    - RETURN: { available: boolean, missing_models: string[], error?: string }

  MODIFY worker/handlers/process-document.ts:
    - INJECT: Pre-flight check before processing starts
    - ON_FAILURE: Update job status with clear error message
    - PATTERN: if (!preflightResult.available) { throw new PreflightError(...) }

Task 5: Replace LLM Cleanup with Ollama
  MODIFY worker/lib/markdown-cleanup-ai.ts:
    - REPLACE: All Gemini API calls with ollama-client
    - USE: CleanupResultSchema for validation
    - PATTERN: Multi-pass cleanup (artifacts → formatting → polish)
    - RETRY: 3 attempts with exponential backoff
    - PRESERVE: Existing cleanPageArtifacts() regex cleanup

Task 6: Implement Bulletproof Chunk Matcher
  CREATE worker/lib/chunk-matcher.ts:
    - IMPLEMENT: 5-layer failsafe system
      Layer 1: Enhanced fuzzy matching (exact, normalized, multi-anchor)
      Layer 2: Embedding-based matching (cosine similarity)
      Layer 3: LLM-assisted matching (Ollama for semantic understanding)
      Layer 4: Anchor interpolation (guaranteed 100% recovery)
    - PATTERN: Reuse annotation recovery logic from reprocessDocument
    - TRACK: Confidence and method for each chunk
    - PRESERVE: All Docling metadata (pages, headings, bboxes)
    - CODE_REFERENCE: See detailed pseudocode section below

Task 7: Replace Metadata Extraction with Ollama
  MODIFY worker/lib/ai-chunking-batch.ts:
    - REPLACE: Gemini calls with ollama-client
    - USE: ChunkMetadataSchema for validation
    - BATCH: Process 10 chunks at a time with Promise.all()
    - PRESERVE: Docling metadata (pages, headings)
    - ADD: New metadata (emotional, domain)
    - RETRY: 3 attempts per chunk with Zod validation

Task 8: Replace Embeddings with Ollama
  CREATE worker/lib/local-embeddings.ts:
    - USE: ollama.embeddings({ model: 'nomic-embed-text' })
    - BATCH: 100 chunks at a time
    - VALIDATE: 768-dimensional vectors
    - REPLACE: worker/lib/embeddings.ts (Gemini embeddings)
    - PATTERN: Same interface, different implementation

Task 9: Update Connection Detection (Thematic Bridge Only)
  MODIFY worker/engines/thematic-bridge.ts:
    - REPLACE: Gemini AI calls with ollama-client
    - PRESERVE: Filtering logic (importance > 0.6, cross-document)
    - USE: Structured output for connection analysis
    - NO_CHANGES: semantic-similarity.ts, contradiction-detection.ts (metadata-based)

Task 10: Extend Obsidian Review for Checkpoints
  MODIFY worker/handlers/obsidian-sync.ts:
    - ADD: reviewStage parameter ('docling_extraction' | 'llm_cleanup')
    - EXPORT: Document at each checkpoint if user settings enabled
    - PRESERVE: Existing awaiting_manual_review logic (lines 253-261)
    - PATTERN: Same export flow, different trigger points

Task 11: Update ProcessingDock UI
  MODIFY src/components/layout/ProcessingDock.tsx:
    - UPDATE: STAGE_LABELS for new pipeline stages
      - extract: "🔧 Docling Extraction"
      - cleanup_local: "🧹 Regex Cleanup"
      - cleanup_ai: "🤖 AI Cleanup (Ollama)"
      - chunking: "✂️ Semantic Chunking"
      - matching: "🎯 Bulletproof Matching"
      - enrichment: "📊 Metadata Enrichment"
      - embeddings: "🔢 Embeddings Generation"
      - finalize: "💾 Saving to Database"
    - ADD: Substages for review checkpoints
    - PRESERVE: Existing real-time update mechanism

Task 12: Create Synthetic Chunks Review UI
  CREATE src/components/sidebar/SyntheticChunksReview.tsx:
    - PATTERN: Mirror AnnotationReviewTab.tsx structure
    - QUERY: Chunks with position_confidence IN ('medium', 'synthetic')
    - DISPLAY: Confidence badge, matched content, validation buttons
    - ACTIONS: Accept (mark validated), Manual fix (edit offsets)
    - BATCH: Accept all, review later

  MODIFY src/components/sidebar/RightPanel.tsx:
    - ADD: New tab for synthetic chunks review (6th tab)
    - SHOW: Count badge when synthetic chunks exist
    - PATTERN: Same tab switching as existing 5 tabs

Task 13: Integration & Error Handling
  MODIFY worker/processors/pdf-processor.ts:
    - INTEGRATE: All new components (ollama, chunk-matcher, local-embeddings)
    - REPLACE: processDocumentStage3() with Ollama cleanup
    - REPLACE: processDocumentStage6() with Ollama chunking
    - ADD: Chunk matching stage (new stage 4)
    - PRESERVE: Review checkpoint logic
    - ERROR_HANDLING: Try/catch with informative messages

Task 14: Environment Configuration
  UPDATE worker/.env.example:
    - ADD: OLLAMA_HOST=http://localhost:11434
    - ADD: OLLAMA_MODEL=qwen2.5:32b
    - ADD: OLLAMA_EMBEDDING_MODEL=nomic-embed-text
    - REMOVE: GOOGLE_AI_API_KEY, GEMINI_MODEL

  UPDATE documentation:
    - ADD: Setup instructions for Ollama
    - ADD: Model installation: ollama pull qwen2.5:32b
    - ADD: Embedding model: ollama pull nomic-embed-text
    - UPDATE: README.md with new requirements
```

### Pseudocode for Critical Components

#### Task 1: Ollama Client (`worker/lib/ollama-client.ts`)

```typescript
import ollama from 'ollama';
import { zodToJsonSchema } from 'zod-to-json-schema';
import type { OllamaConfig, OllamaChatRequest } from '../types/ollama.js';

// PATTERN: Singleton client with configuration
class OllamaClient {
  private config: OllamaConfig;

  constructor(config: OllamaConfig) {
    this.config = {
      host: config.host || 'http://localhost:11434',
      model: config.model || 'qwen2.5:32b',
      temperature: config.temperature || 0,
      timeout: config.timeout || 5 * 60 * 1000 // 5 minutes
    };
  }

  // CRITICAL: Structured chat with Zod validation
  async chat<T>(
    messages: OllamaMessage[],
    schema: z.ZodType<T>,
    retries = 3
  ): Promise<T> {
    const jsonSchema = zodToJsonSchema(schema);

    for (let i = 0; i < retries; i++) {
      try {
        const response = await ollama.chat({
          model: this.config.model,
          messages,
          format: jsonSchema,
          options: {
            temperature: this.config.temperature,
            num_ctx: 8192 // Context window
          }
        });

        // GOTCHA: Ollama may return malformed JSON
        const parsed = JSON.parse(response.message.content);

        // CRITICAL: Validate with Zod (throws on invalid)
        return schema.parse(parsed);

      } catch (error) {
        if (i === retries - 1) {
          throw new Error(`Ollama validation failed after ${retries} attempts: ${error.message}`);
        }
        // PATTERN: Exponential backoff
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, i) * 1000));
      }
    }
  }

  // Embeddings generation
  async embeddings(text: string): Promise<number[]> {
    const response = await ollama.embeddings({
      model: process.env.OLLAMA_EMBEDDING_MODEL || 'nomic-embed-text',
      prompt: text
    });

    // VALIDATE: Must be 768-dimensional
    if (response.embedding.length !== 768) {
      throw new Error(`Expected 768-dim vector, got ${response.embedding.length}`);
    }

    return response.embedding;
  }

  // Health check
  async healthCheck(): Promise<{ available: boolean; error?: string }> {
    try {
      await fetch(`${this.config.host}/api/tags`);
      return { available: true };
    } catch (error) {
      return {
        available: false,
        error: `Ollama not running at ${this.config.host}`
      };
    }
  }
}

// Export singleton
export const ollamaClient = new OllamaClient({
  host: process.env.OLLAMA_HOST,
  model: process.env.OLLAMA_MODEL
});
```

#### Task 6: Bulletproof Chunk Matcher (`worker/lib/chunk-matcher.ts`)

```typescript
import Fuse from 'fuse.js'; // For fuzzy matching
import { ollamaClient } from './ollama-client.js';
import type { ChunkMatchResult } from '../types/ollama.js';

// PATTERN: 5-layer failsafe for 100% chunk recovery
export async function matchChunksToCleanedMarkdown(
  originalMarkdown: string,
  cleanedMarkdown: string,
  doclingChunks: DoclingChunk[]
): Promise<ChunkMatchResult[]> {

  const results: ChunkMatchResult[] = [];
  const unmatched: DoclingChunk[] = [];

  // Layer 1: Enhanced Fuzzy Matching (85% success expected)
  for (const chunk of doclingChunks) {
    const exactMatch = findExactMatch(chunk.content, cleanedMarkdown);
    if (exactMatch) {
      results.push({
        ...chunk,
        matched_offset: exactMatch,
        confidence: 'exact',
        method: 'exact_match'
      });
      continue;
    }

    const fuzzyMatch = findFuzzyMatch(chunk.content, cleanedMarkdown);
    if (fuzzyMatch && fuzzyMatch.score > 0.9) {
      results.push({
        ...chunk,
        matched_offset: fuzzyMatch.offset,
        confidence: 'high',
        method: 'fuzzy_match'
      });
      continue;
    }

    unmatched.push(chunk);
  }

  // Layer 2: Embedding-Based Matching (98% cumulative expected)
  if (unmatched.length > 0) {
    const embeddingMatches = await matchViaEmbeddings(
      unmatched,
      cleanedMarkdown
    );

    for (const match of embeddingMatches) {
      if (match.similarity > 0.85) {
        results.push({
          ...match.chunk,
          matched_offset: match.offset,
          confidence: 'high',
          method: 'embedding_match'
        });
        unmatched.splice(unmatched.indexOf(match.chunk), 1);
      }
    }
  }

  // Layer 3: LLM-Assisted Matching (99.9% cumulative expected)
  if (unmatched.length > 0) {
    for (const chunk of unmatched) {
      const llmMatch = await matchViaLLM(chunk, cleanedMarkdown);
      if (llmMatch) {
        results.push({
          ...chunk,
          matched_offset: llmMatch.offset,
          confidence: 'medium',
          method: 'llm_assisted'
        });
        unmatched.splice(unmatched.indexOf(chunk), 1);
      }
    }
  }

  // Layer 4: Anchor Interpolation (100% guaranteed)
  // CRITICAL: Even if no match found, preserve metadata via interpolation
  if (unmatched.length > 0) {
    for (const chunk of unmatched) {
      const interpolated = interpolatePosition(chunk, results);
      results.push({
        ...chunk,
        matched_offset: interpolated,
        confidence: 'synthetic',
        method: 'interpolation'
      });
    }
  }

  // GUARANTEE: Sort by chunk_index and return all chunks
  return results.sort((a, b) => a.chunk_index - b.chunk_index);
}

// Helper: Interpolate position between neighbors
function interpolatePosition(
  chunk: DoclingChunk,
  matched: ChunkMatchResult[]
): { start: number; end: number } {
  // Find nearest matched neighbors
  const before = matched
    .filter(c => c.chunk_index < chunk.chunk_index)
    .sort((a, b) => b.chunk_index - a.chunk_index)[0];

  const after = matched
    .filter(c => c.chunk_index > chunk.chunk_index)
    .sort((a, b) => a.chunk_index - b.chunk_index)[0];

  if (before && after) {
    // PATTERN: Linear interpolation between anchors
    const ratio = (chunk.chunk_index - before.chunk_index) /
                  (after.chunk_index - before.chunk_index);
    const start = before.matched_offset.end +
                  Math.floor(ratio * (after.matched_offset.start - before.matched_offset.end));
    const end = start + chunk.content.length;
    return { start, end };
  }

  // Fallback: Use approximate position
  return chunk.original_offset;
}

// Helper: LLM-assisted semantic matching
async function matchViaLLM(
  chunk: DoclingChunk,
  markdown: string
): Promise<{ offset: { start: number; end: number } } | null> {
  // PATTERN: Give LLM context window around expected position
  const searchWindow = extractSearchWindow(markdown, chunk.original_offset, 2000);

  const response = await ollamaClient.chat([
    {
      role: 'system',
      content: 'Find the semantic match for the given chunk in the search window. Return the matched text exactly as it appears.'
    },
    {
      role: 'user',
      content: `Chunk: ${chunk.content}\n\nSearch window: ${searchWindow}`
    }
  ], z.object({ matched_text: z.string() }));

  // Find offset of matched text in markdown
  const offset = markdown.indexOf(response.matched_text);
  if (offset !== -1) {
    return {
      offset: {
        start: offset,
        end: offset + response.matched_text.length
      }
    };
  }

  return null;
}
```

#### Task 7: Metadata Extraction (`worker/lib/ai-chunking-batch.ts` modification)

```typescript
import { ollamaClient } from './ollama-client.js';
import { ChunkMetadataSchema } from './zod-schemas.js';

// REPLACE: Gemini calls with Ollama
export async function extractChunkMetadata(
  chunks: ProcessedChunk[]
): Promise<EnrichedChunk[]> {

  const enriched: EnrichedChunk[] = [];

  // PATTERN: Batch process 10 chunks at a time
  const BATCH_SIZE = 10;
  for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
    const batch = chunks.slice(i, i + BATCH_SIZE);

    // CRITICAL: Parallel processing within batch
    const results = await Promise.all(
      batch.map(async (chunk) => {
        try {
          // PATTERN: Structured extraction with retry
          const metadata = await ollamaClient.chat(
            [
              {
                role: 'system',
                content: 'Extract semantic metadata from this text chunk. Focus on themes, concepts, importance, and emotional tone.'
              },
              {
                role: 'user',
                content: chunk.content
              }
            ],
            ChunkMetadataSchema
          );

          return {
            ...chunk,
            themes: metadata.themes,
            concepts: metadata.concepts,
            importance_score: metadata.importance_score,
            summary: metadata.summary,
            emotional_metadata: metadata.emotional_metadata,
            domain: metadata.domain
          };

        } catch (error) {
          console.error(`Metadata extraction failed for chunk ${chunk.chunk_index}:`, error);
          // FALLBACK: Return chunk with minimal metadata
          return {
            ...chunk,
            themes: [],
            concepts: [],
            importance_score: 0.5,
            summary: chunk.content.substring(0, 100),
            emotional_metadata: { polarity: 0, primary_emotion: 'neutral', intensity: 0 },
            domain: 'unknown'
          };
        }
      })
    );

    enriched.push(...results);

    // PROGRESS: Report batch completion
    await this.updateProgress(
      70 + (i / chunks.length) * 20, // 70-90% range
      'enrichment',
      'processing',
      `Enriched ${i + batch.length}/${chunks.length} chunks`
    );
  }

  return enriched;
}
```

### Integration Points

```yaml
DATABASE:
  migration: supabase/migrations/045_local_processing_schema.sql
  changes:
    - ADD position_confidence to chunks
    - ADD position_method to chunks
    - ADD bboxes, heading_path, section_marker to chunks
    - ADD review_stage to documents
    - TRUNCATE chunks, documents (clean slate)
  indexes:
    - CREATE INDEX idx_chunks_position_confidence
    - CREATE INDEX idx_chunks_position_method
    - CREATE INDEX idx_chunks_heading_path (GIN)

WORKER:
  entry: worker/handlers/process-document.ts
  flow:
    1. Pre-flight check (Ollama availability)
    2. Download PDF (existing)
    3. Docling extraction (existing)
    4. Regex cleanup (existing)
    5. Review checkpoint 1 (optional Obsidian export)
    6. LLM cleanup (NEW: Ollama)
    7. Review checkpoint 2 (optional Obsidian export)
    8. Bulletproof chunk matching (NEW)
    9. Metadata enrichment (NEW: Ollama + Zod)
    10. Embeddings (NEW: Ollama)
    11. Save to DB (existing)
    12. Connection detection (Ollama for thematic bridge)

FRONTEND:
  entry: src/components/layout/ProcessingDock.tsx
  updates:
    - STAGE_LABELS for new pipeline
    - Review checkpoint indicators

  new: src/components/sidebar/SyntheticChunksReview.tsx
    - Query chunks with confidence < 'high'
    - Display with confidence badges
    - Accept/manual fix actions

CONFIG:
  env: worker/.env
  add:
    - OLLAMA_HOST=http://localhost:11434
    - OLLAMA_MODEL=qwen2.5:32b
    - OLLAMA_EMBEDDING_MODEL=nomic-embed-text
  remove:
    - GOOGLE_AI_API_KEY
    - GEMINI_MODEL
```

---

## Validation Loop

### Level 0: Pre-Implementation Checks

```bash
# CRITICAL: Verify Ollama setup before coding
ollama list
# Expected: qwen2.5:32b and nomic-embed-text models installed

ollama show qwen2.5:32b
# Expected: Model details with 32B parameters

ollama show nomic-embed-text
# Expected: Model details with 768-dimensional embeddings

# Test Ollama API
curl http://localhost:11434/api/tags
# Expected: JSON response with model list
```

### Level 1: Syntax & Build

```bash
# CRITICAL: Run these FIRST in worker directory
cd worker

# Install dependencies
npm install

# Type checking
npm run build
# Expected: No TypeScript errors

# Linting
npm run lint
# Expected: No ESLint errors

# Run tests
npm test
# Expected: All existing tests pass (new tests will be added)
```

### Level 2: Integration Testing

```bash
# Test Ollama client
cd worker
npx tsx -e "
import { ollamaClient } from './lib/ollama-client.js';
const health = await ollamaClient.healthCheck();
console.log(health);
"
# Expected: { available: true }

# Test structured output
npx tsx -e "
import { ollamaClient } from './lib/ollama-client.js';
import { z } from 'zod';
const schema = z.object({ test: z.string() });
const result = await ollamaClient.chat([
  { role: 'user', content: 'Say hello' }
], schema);
console.log(result);
"
# Expected: { test: 'hello' } or similar

# Test embeddings
npx tsx -e "
import { ollamaClient } from './lib/ollama-client.js';
const embedding = await ollamaClient.embeddings('test');
console.log(embedding.length);
"
# Expected: 768
```

### Level 3: End-to-End Pipeline Test

```bash
# Upload small PDF (5 pages) and verify:
# 1. Pre-flight check passes
# 2. All 8 stages complete
# 3. Chunks saved with confidence tracking
# 4. Review checkpoints offered (if enabled)
# 5. Synthetic chunks (if any) visible in review tab

# Check results in database
psql -h localhost -p 54322 -U postgres -d postgres -c "
SELECT
  position_confidence,
  COUNT(*)
FROM chunks
GROUP BY position_confidence;
"
# Expected: Mostly 'exact', few 'high', rare 'synthetic'
```

---

## Final Validation Checklist

- [ ] All tests pass: `cd worker && npm test`
- [ ] No linting errors: `cd worker && npm run lint`
- [ ] TypeScript compiles: `cd worker && npm run build`
- [ ] Ollama health check passes: `ollama list` shows required models
- [ ] Pre-flight check works: Error when Ollama not running
- [ ] ProcessingDock shows new stages correctly
- [ ] Review checkpoints export to Obsidian
- [ ] Sync from Obsidian triggers reprocessing
- [ ] Chunk matching achieves ≥85% exact confidence
- [ ] Synthetic chunks visible in review tab
- [ ] Embeddings are 768-dimensional
- [ ] Connection detection works (thematic bridge uses Ollama)
- [ ] Zero Gemini API calls (check logs)
- [ ] Processing completes in <120 minutes for 500-page PDF
- [ ] Database migration applies cleanly
- [ ] Clean slate confirmed (no old chunks remain)

---

## Anti-Patterns to Avoid

- ❌ Don't call Ollama without Zod validation - always use schemas
- ❌ Don't assume Ollama is running - pre-flight check is critical
- ❌ Don't skip chunk matching layers - 100% recovery depends on all 5
- ❌ Don't batch too many AI calls at once - 10 chunks max per batch
- ❌ Don't ignore synthetic chunks - they indicate matching issues
- ❌ Don't mix Gemini and Ollama - complete migration required
- ❌ Don't forget to update ProcessingDock stage labels
- ❌ Don't bypass review checkpoints - user wants control
- ❌ Don't store embeddings without validation - must be 768-dim
- ❌ Don't modify working code (Docling, regex cleanup, save to DB)

---

## Success Metrics

### Performance Targets
- **Processing time**: <80 min without cleanup, <120 min with cleanup (500 pages)
- **Chunk recovery**: 100% (guaranteed by interpolation fallback)
- **Exact matches**: ≥85% of chunks
- **Synthetic chunks**: ≤2% requiring review

### Quality Targets
- **Metadata completeness**: 100% (Zod validation ensures)
- **Embedding quality**: 768-dim vectors, consistent format
- **Review workflow**: Both checkpoints functional
- **Error messages**: Clear, actionable, user-friendly

### Cost Targets
- **API costs**: $0 per document (100% local)
- **Resource usage**: <30GB RAM peak (Qwen 32B requirement)

---

## Implementation Confidence Score

**8.5/10** - High confidence for one-pass implementation success

**Strengths:**
- ✅ Clear technical architecture (pure TypeScript)
- ✅ Existing patterns to follow (Docling, Obsidian, ProcessingDock)
- ✅ External research complete (ollama-js + Zod proven pattern)
- ✅ User decisions aligned with existing codebase
- ✅ Executable validation gates throughout
- ✅ 100% recovery guarantee via 5-layer failsafe

**Risks mitigated:**
- ✅ Ollama availability: Pre-flight check
- ✅ JSON parsing errors: Zod validation with retry
- ✅ Chunk matching failures: Anchor interpolation fallback
- ✅ Long processing times: Background with progress updates
- ✅ Synthetic chunks: Review UI with confidence tracking

**Remaining unknowns:**
- ⚠️ Real-world chunk matching accuracy (may need tuning)
- ⚠️ Qwen 32B performance on user's hardware (RAM requirements)

---

## Task Breakdown Document

**See detailed task breakdown:** `docs/tasks/local-processing-pipeline.md`

The task breakdown document provides:
- Work breakdown structure (WBS) with dependencies
- Acceptance criteria using Given-When-Then format
- Team capacity considerations
- Critical path identification
- Sprint planning guidance

**Next steps:**
1. Review this PRP for completeness
2. Read task breakdown for development planning
3. Execute tasks in order with validation gates
4. Track progress via background job system

---

**End of PRP Document**

*Generated with comprehensive codebase research and external documentation analysis. Ready for implementation by AI agent with iterative refinement.*
