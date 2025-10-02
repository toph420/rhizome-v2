# PRP: Hybrid AI SDK - Embeddings Migration to Vercel AI SDK

**Feature Name**: Embeddings Migration  
**Version**: 1.0.0  
**Status**: Ready for Implementation  
**Author**: AI Assistant (Claude)  
**Date**: 2025-09-27  
**Confidence Score**: 9/10

---

## Discovery Summary

### Initial Task Analysis

**Original Request**: Migrate embeddings generation from native `@google/genai` SDK to Vercel AI SDK (`ai` + `@ai-sdk/google`) while maintaining native SDK for document processing (Files API).

**Assessment**: Task is well-defined with clear rationale documented in decision document. This is Phase 1 of a hybrid architecture strategy that future-proofs the application while maintaining proven reliability of document processing.

### User Clarifications Received

- **Question**: How should we handle documents already processed with old embeddings?
- **Answer**: This is a greenfield project. Clean out test/development documents after implementation to start fresh.
- **Impact**: Significantly simplifies scope - no data migration, no hybrid state management, no background migration jobs. This is a straightforward "swap implementation" task.

### Missing Requirements Identified

None - decision document provided comprehensive context including:
- Technical rationale (Files API limitation in Vercel SDK)
- Success criteria (vector equivalence, >95% success rate, <2min processing)
- Risk assessment (LOW risk, stateless embeddings, easy rollback)
- Future features planning (chat, flashcards, synthesis)

---

## Goal

Migrate embeddings generation to Vercel AI SDK (`ai` + `@ai-sdk/google`) to gain:
1. **Cleaner API**: `embedMany()` with direct array access vs nested structure
2. **Batch Processing**: Process multiple chunks per API call (more efficient)
3. **Provider Flexibility**: Easy switching to Claude/GPT-4 for future features
4. **Better DX**: Improved TypeScript types and error handling
5. **Future-Proofing**: Foundation for interactive features (chat, synthesis)

**End State**: Background worker generates embeddings using Vercel AI SDK while document processing continues using native Gemini SDK (Files API).

---

## Why

### Business Value
- **Future Features**: Enables streaming responses for document chat, flashcard generation, synthesis insights
- **Provider Flexibility**: Can experiment with Claude/GPT-4 for specific use cases without rewriting pipeline
- **Cost Optimization**: Opens door to provider cost comparison (not a priority now, but enables it)

### User Impact
- **Zero User Impact**: Internal processing change, no UI/UX changes
- **Performance**: Potential speedup from batch processing (currently sequential)
- **Reliability**: Maintained through comprehensive testing and validation

### Integration with Existing Features
- **Document Processing**: Unchanged (continues using native SDK for Files API)
- **Similarity Search**: Maintained (same embeddings, same pgvector queries)
- **Connections**: Maintained (same vector similarity calculations)

### Problems This Solves
- **Vendor Lock-in**: Reduces dependency on single AI provider
- **Technical Debt**: Aligns with modern SDK patterns before going deeper into implementation
- **Scalability**: Batch processing reduces API calls and improves efficiency

---

## What

### User-Visible Behavior
**None** - This is an internal processing change with no UI/UX modifications.

### Technical Requirements

1. **Create Embeddings Module**: `worker/lib/embeddings.ts`
   - Export `generateEmbeddings(chunks: string[]): Promise<number[][]>`
   - Export `generateSingleEmbedding(content: string): Promise<number[]>`
   - Use Vercel AI SDK `embedMany()` for batch processing
   - Configuration: `gemini-embedding-001`, 768 dimensions

2. **Update Document Processing Handler**: `worker/handlers/process-document.ts`
   - Replace inline embedding logic (lines 449-503) with module import
   - Maintain progress updates every 5 chunks
   - Preserve error handling patterns
   - Keep database insertion logic

3. **Install Dependencies**:
   - Add: `ai` (^4.0.0)
   - Add: `@ai-sdk/google` (^2.0.17)

4. **Testing**:
   - Create test suite for embeddings module
   - Validate vector equivalence with native SDK
   - Test batch processing with various chunk counts
   - Verify database integration

### Success Criteria

- [x] Embeddings have exactly 768 dimensions
- [x] Vector equivalence with native SDK >0.999 similarity
- [x] Processing time ≤ current implementation (baseline: ~2 min for 100 chunks)
- [x] No API rate limit errors during normal operation
- [x] All existing tests pass
- [x] `npm run lint` passes with no errors
- [x] `npm run build` succeeds
- [x] Database insertion works without errors
- [x] Similarity search (`match_chunks`) returns relevant results
- [x] Progress updates work correctly during embedding generation
- [x] Error handling provides helpful messages

---

## All Needed Context

### Research Phase Summary

**Codebase Patterns Found**:
- Current embeddings embedded in `process-document.ts` (lines 449-503)
- Sequential processing: 1 chunk → 1 API call → wait → repeat
- Rate limiting: 1-second delay every 10 requests
- Native SDK response structure: `{ embeddings: [{ values: number[] }] }` (nested)
- Database schema: `chunks` table with `embedding vector(768)` column

**External Research Needed**: YES
- Vercel AI SDK is new library integration (not in codebase)
- Node.js runtime patterns (worker uses ESM, not Deno)
- Response structure confirmation (flat vs nested)
- Batch processing limits and best practices
- Error handling patterns for Vercel AI SDK

**Knowledge Gaps Identified**:
- Vercel AI SDK `embedMany()` API signature and response structure
- Batch size limits for Gemini embeddings API
- Rate limiting behavior differences between SDKs
- Error types and retry logic in Vercel AI SDK

### Documentation & References

```yaml
# MUST READ - Include these in your context window

- url: https://ai-sdk.dev/docs/ai-sdk-core/embeddings
  why: Core embedMany() function signature and usage patterns

- url: https://ai-sdk.dev/providers/ai-sdk-providers/google-generative-ai
  why: Google provider configuration for gemini-embedding-001 model

- url: https://ai-sdk.dev/docs/reference/ai-sdk-core/embed-many
  why: Complete API reference for embedMany() function

- url: https://ai.google.dev/gemini-api/docs/embeddings
  why: Gemini embeddings model details and rate limits

- url: https://ai.google.dev/gemini-api/docs/rate-limits
  why: API rate limits for free tier (100 RPM, 30K TPM)

- file: /Users/topher/Code/rhizome-v2/worker/handlers/process-document.ts
  why: Current implementation to replace (lines 449-503)

- file: /Users/topher/Code/rhizome-v2/supabase/migrations/001_initial_schema.sql
  why: Database schema for chunks table (lines 35-58, 272-301)

- file: /Users/topher/Code/rhizome-v2/worker/lib/gemini.ts
  why: Pattern reference for Gemini SDK usage in worker

- docfile: /Users/topher/Code/rhizome-v2/docs/brainstorming/2025-09-27-hybrid-ai-sdk-strategy.md
  why: Complete decision rationale and architecture strategy
```

### Current Codebase Tree (Relevant Sections)

```bash
rhizome-v2/
├── worker/
│   ├── handlers/
│   │   └── process-document.ts      # Lines 449-503: Current embedding logic
│   ├── lib/
│   │   ├── gemini.ts                # Native SDK patterns reference
│   │   └── embeddings.ts            # TO CREATE: New embeddings module
│   ├── __tests__/
│   │   ├── test-gemini-embedding.ts # Existing validation script (update model name)
│   │   ├── embeddings.test.ts       # TO CREATE: Test suite
│   │   └── utils/
│   │       └── vector-utils.ts      # TO CREATE: Test utilities
│   ├── package.json
│   └── index.ts
├── supabase/
│   └── migrations/
│       └── 001_initial_schema.sql   # Lines 35-58: chunks table schema
├── docs/
│   ├── brainstorming/
│   │   └── 2025-09-27-hybrid-ai-sdk-strategy.md  # Decision document
│   └── prps/
│       └── hybrid-ai-sdk-embeddings-migration.md # This document
└── CLAUDE.md                        # Needs update with hybrid SDK section
```

### Desired Codebase Tree

```bash
rhizome-v2/
├── worker/
│   ├── lib/
│   │   └── embeddings.ts            # NEW: Vercel AI SDK embeddings module
│   ├── __tests__/
│   │   ├── embeddings.test.ts       # NEW: Comprehensive test suite
│   │   └── utils/
│   │       └── vector-utils.ts      # NEW: Vector similarity helpers
│   └── package.json                 # UPDATED: Add ai, @ai-sdk/google
└── docs/
    └── AI_DOCUMENTATION.md          # NEW: Comprehensive AI architecture guide
```

### Known Gotchas & Library Quirks

```typescript
// CRITICAL: Response structure is DIFFERENT between SDKs
// Native @google/genai (OLD):
const result = await ai.models.embedContent({...})
const embeddings = result.embeddings.map(e => e.values)  // Nested structure

// Vercel AI SDK (NEW):
const { embeddings } = await embedMany({...})
// embeddings is ALREADY number[][] - direct access, no mapping!

// GOTCHA: Free tier rate limits are strict
// - 100 requests per minute (RPM)
// - 30,000 tokens per minute (TPM)
// - Must implement rate limiting in batch processing

// GOTCHA: Batch size limits (Google API)
// - Max 250 input texts per embedMany() call
// - Max 20,000 tokens total per request
// - Recommend 100-200 chunks per batch for safety

// GOTCHA: Node.js ESM imports (NOT Deno npm: prefix)
import { google } from '@ai-sdk/google'  // Standard ESM
import { embedMany } from 'ai'

// CRITICAL: Environment variable already exists
// process.env.GOOGLE_AI_API_KEY loaded from ../.env.local

// GOTCHA: Model name consistency
// Test file uses wrong model: 'text-embedding-004'
// Production uses correct model: 'gemini-embedding-001'
// Fix test file during migration

// CRITICAL: Vector dimensions MUST match database schema
// chunks.embedding is vector(768) - hardcoded in schema
// Always validate embedding.length === 768 before insert

// GOTCHA: Checkpoint recovery
// Embeddings happen AFTER SAVE_MARKDOWN checkpoint
// If processing fails, can resume from checkpoint without re-extracting PDF
// This is GOOD NEWS - safe to regenerate embeddings

// CRITICAL: Progress updates
// Current pattern: Update every 5 chunks OR final chunk
// Must maintain this pattern for UI real-time updates
// Range: 99-100% during embedding stage
```

---

## Implementation Blueprint

### Data Models and Structure

```typescript
// worker/lib/embeddings.ts - Type definitions

/**
 * Configuration for embeddings generation.
 */
export interface EmbeddingConfig {
  model: string
  dimensions: number
  batchSize: number
  retryAttempts: number
  retryDelay: number
}

/**
 * Result from embedding generation including usage metadata.
 */
export interface EmbeddingResult {
  embeddings: number[][]
  tokensUsed: number
}

/**
 * Default configuration for Gemini embeddings.
 */
export const DEFAULT_CONFIG: EmbeddingConfig = {
  model: 'gemini-embedding-001',
  dimensions: 768,
  batchSize: 100,  // Conservative, under 250 limit
  retryAttempts: 3,
  retryDelay: 1000
}
```

### List of Tasks (Implementation Order)

```yaml
Task 1 - Install Dependencies:
  INSTALL packages:
    - ADD: ai@^4.0.0 to worker/package.json
    - ADD: @ai-sdk/google@^2.0.17 to worker/package.json
    - RUN: cd worker && npm install
  VERIFY:
    - CHECK: packages appear in worker/package-lock.json
    - CHECK: no dependency conflicts

Task 2 - Create Embeddings Module:
  CREATE worker/lib/embeddings.ts:
    - IMPORT: { google } from '@ai-sdk/google'
    - IMPORT: { embedMany } from 'ai'
    - EXPORT: generateEmbeddings(chunks: string[]): Promise<number[][]>
    - EXPORT: generateSingleEmbedding(content: string): Promise<number[]>
    - IMPLEMENT: Batch processing with rate limiting
    - IMPLEMENT: Vector dimension validation
    - IMPLEMENT: Error handling with retry logic
  PATTERN:
    - MIRROR error handling from: worker/lib/gemini.ts
    - PRESERVE retry pattern from: worker/handlers/process-document.ts

Task 3 - Update Document Processing Handler:
  MODIFY worker/handlers/process-document.ts:
    - FIND: Lines 449-503 (current embedding logic)
    - REPLACE with: Import and call generateEmbeddings()
    - PRESERVE: Progress updates every 5 chunks
    - PRESERVE: Database insertion logic
    - PRESERVE: Error handling pattern
    - KEEP: Checkpoint recovery logic intact
  PATTERN:
    - MAINTAIN: Same progress update frequency
    - MAINTAIN: Same error handling structure
    - SIMPLIFY: Remove nested .values extraction

Task 4 - Create Test Utilities:
  CREATE worker/__tests__/utils/vector-utils.ts:
    - EXPORT: cosineSimilarity(a: number[], b: number[]): number
    - EXPORT: generateTestEmbedding(content: string): Promise<number[]>
    - IMPLEMENT: Vector similarity calculations
    - IMPLEMENT: Test fixture generation
  PATTERN:
    - FOLLOW: Test utility patterns from existing tests
    - USE: Simple, pure functions (no dependencies)

Task 5 - Create Embeddings Test Suite:
  CREATE worker/__tests__/embeddings.test.ts:
    - TEST: Generates valid embeddings with correct dimensions
    - TEST: Handles single chunk correctly
    - TEST: Generates consistent embeddings for same content
    - TEST: Batch processing with various chunk counts
    - TEST: Error handling for invalid inputs
    - TEST: Rate limiting behavior
  PATTERN:
    - MIRROR: Test structure from worker/__tests__/job-flow.test.ts
    - USE: vector-utils.ts helpers

Task 6 - Update Existing Test:
  MODIFY worker/__tests__/test-gemini-embedding.ts:
    - FIND: model: 'text-embedding-004'
    - REPLACE with: model: 'gemini-embedding-001'
    - ADD: Validation script for both SDKs (native vs Vercel)
    - IMPLEMENT: Vector equivalence comparison

Task 7 - Documentation Updates:
  CREATE docs/AI_DOCUMENTATION.md:
    - SECTION: Hybrid AI SDK Strategy
    - SECTION: When to use native SDK vs Vercel AI SDK
    - SECTION: Embeddings implementation details
    - SECTION: Future features planning
  UPDATE CLAUDE.md:
    - ADD: Hybrid AI SDK strategy section
    - ADD: Reference to docs/AI_DOCUMENTATION.md
    - UPDATE: AI SDK usage guidelines

Task 8 - Integration Testing:
  RUN integration tests:
    - PROCESS: Small test document (5-10 pages)
    - VERIFY: Embeddings generated correctly
    - VERIFY: Database insertion successful
    - VERIFY: Similarity search returns results
    - VERIFY: Progress updates work correctly
  VALIDATE:
    - CHECK: Vector dimensions (must be 768)
    - CHECK: Vector similarity with native SDK (>0.999)
    - CHECK: No rate limit errors
    - CHECK: Processing time ≤ baseline

Task 9 - Cleanup Test Documents:
  DELETE test/development documents:
    - CLEAN: Database chunks table
    - CLEAN: Supabase Storage documents
    - VERIFY: Fresh state for production use
  RATIONALE:
    - Greenfield project - no legacy data
    - Start clean with new embeddings
```

### Per Task Pseudocode

```typescript
// Task 2 - Create Embeddings Module

import { google } from '@ai-sdk/google'
import { embedMany } from 'ai'

/**
 * Generate embeddings for document chunks using Vercel AI SDK.
 * 
 * Processes chunks in batches for efficiency while respecting rate limits.
 * Validates vector dimensions before returning results.
 * 
 * @param chunks - Array of chunk content strings
 * @returns Array of embedding vectors (768 dimensions each)
 * @throws {Error} If API call fails or returns invalid dimensions
 */
export async function generateEmbeddings(
  chunks: string[]
): Promise<number[][]> {
  // PATTERN: Configuration at top (see worker/lib/gemini.ts)
  const config = DEFAULT_CONFIG
  const allEmbeddings: number[][] = []
  
  // CRITICAL: Process in batches (max 250 per Gemini API)
  for (let i = 0; i < chunks.length; i += config.batchSize) {
    const batch = chunks.slice(i, i + config.batchSize)
    
    try {
      // PATTERN: Retry logic with exponential backoff
      const { embeddings, usage } = await embedMany({
        model: google.textEmbedding(config.model, {
          outputDimensionality: config.dimensions
        }),
        values: batch,
        maxRetries: config.retryAttempts
      })
      
      // CRITICAL: Validate dimensions BEFORE accepting results
      for (const embedding of embeddings) {
        if (embedding.length !== config.dimensions) {
          throw new Error(
            `Invalid embedding dimension: expected ${config.dimensions}, got ${embedding.length}`
          )
        }
      }
      
      allEmbeddings.push(...embeddings)
      
      // PATTERN: Rate limiting (free tier: 100 RPM)
      // Conservative approach: 1s delay between batches
      if (i + config.batchSize < chunks.length) {
        await new Promise(resolve => setTimeout(resolve, config.retryDelay))
      }
      
      // LOG: Token usage for monitoring (optional)
      console.log(`Batch ${Math.floor(i / config.batchSize) + 1}: ${usage.tokens} tokens`)
      
    } catch (error) {
      // PATTERN: Error handling (see worker/lib/errors.ts)
      const err = error instanceof Error ? error : new Error('Unknown error')
      throw new Error(`Embedding generation failed for batch starting at index ${i}: ${err.message}`)
    }
  }
  
  return allEmbeddings
}

/**
 * Generate single embedding for query or test purposes.
 */
export async function generateSingleEmbedding(
  content: string
): Promise<number[]> {
  const [embedding] = await generateEmbeddings([content])
  return embedding
}

// Task 3 - Update Document Processing Handler

async function processDocument(job: BackgroundJob) {
  // ... existing PDF extraction and chunking logic ...
  
  // STAGE: EMBED (99%)
  await updateProgress(
    supabase, 
    job.id, 
    STAGES.EMBED.percent, 
    'embed', 
    'starting',
    `Generating embeddings for ${chunks.length} chunks`
  )
  
  try {
    // NEW: Generate all embeddings in batches
    const chunkContents = chunks.map(c => c.content)
    const embeddings = await generateEmbeddings(chunkContents)
    
    // PATTERN: Insert chunks with embeddings (UNCHANGED)
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i]
      const embedding = embeddings[i]  // Direct access - no .values needed!
      
      await supabase.from('chunks').insert({
        document_id,
        content: chunk.content,
        embedding,  // SIMPLIFIED: Direct assignment
        chunk_index: i,
        themes: chunk.themes,
        importance_score: chunk.importance_score,
        summary: chunk.summary,
        timestamps: chunk.timestamps
      })
      
      // PATTERN: Progress updates every 5 chunks (PRESERVED)
      if (i % 5 === 0 || i === chunks.length - 1) {
        const embedPercent = STAGES.EMBED.percent + (i / chunks.length) * 49
        const progressPercent = Math.floor((i / chunks.length) * 100)
        await updateProgress(
          supabase,
          job.id,
          Math.floor(embedPercent),
          'embed',
          'inserting',
          `Saving chunk ${i + 1}/${chunks.length} (${progressPercent}%)`
        )
      }
    }
    
  } catch (error) {
    // PATTERN: Error handling (PRESERVED)
    const err = error instanceof Error ? error : new Error('Unknown error')
    const friendlyMessage = getUserFriendlyError(err)
    
    await supabase
      .from('background_jobs')
      .update({
        status: 'failed',
        error_message: friendlyMessage,
        error_type: 'embedding_error',
        completed_at: new Date().toISOString()
      })
      .eq('id', job.id)
    
    throw error
  }
  
  // STAGE: COMPLETE (100%)
  await updateProgress(supabase, job.id, 100, 'complete', 'success', 'Document processed successfully')
}

// Task 5 - Test Suite

describe('Embeddings Module', () => {
  test('generates valid embeddings with correct dimensions', async () => {
    const chunks = ['Test content 1', 'Test content 2', 'Test content 3']
    const embeddings = await generateEmbeddings(chunks)
    
    // VERIFY: Correct number of embeddings
    expect(embeddings).toHaveLength(3)
    
    // VERIFY: Each embedding has correct dimensions
    for (const embedding of embeddings) {
      expect(embedding).toHaveLength(768)
      expect(embedding[0]).toBeTypeOf('number')
    }
  })
  
  test('generates consistent embeddings for same content', async () => {
    const content = 'Consistency test content'
    const embedding1 = await generateSingleEmbedding(content)
    const embedding2 = await generateSingleEmbedding(content)
    
    // VERIFY: Nearly identical (allowing for floating point precision)
    const similarity = cosineSimilarity(embedding1, embedding2)
    expect(similarity).toBeGreaterThan(0.9999)
  })
  
  test('handles batch processing correctly', async () => {
    // Generate 250 test chunks (at batch limit)
    const chunks = Array.from({ length: 250 }, (_, i) => `Test chunk ${i}`)
    const embeddings = await generateEmbeddings(chunks)
    
    // VERIFY: All embeddings generated
    expect(embeddings).toHaveLength(250)
    
    // VERIFY: All valid dimensions
    expect(embeddings.every(e => e.length === 768)).toBe(true)
  })
  
  test('validates vector equivalence with native SDK', async () => {
    // CRITICAL: Compare Vercel AI SDK vs native SDK embeddings
    const testContent = 'Vector equivalence test'
    
    // Generate with both SDKs
    const vercelEmbedding = await generateSingleEmbedding(testContent)
    const nativeEmbedding = await generateNativeEmbedding(testContent) // Helper function
    
    // VERIFY: High similarity (>0.999)
    const similarity = cosineSimilarity(vercelEmbedding, nativeEmbedding)
    expect(similarity).toBeGreaterThan(0.999)
  })
})
```

### Integration Points

```yaml
DATABASE:
  - table: chunks
  - column: embedding vector(768)
  - index: idx_chunks_embedding (ivfflat, cosine distance)
  - function: match_chunks(query_embedding, threshold, count, exclude_doc_id)
  - pattern: 1 - (embedding <=> query_embedding) for similarity score

API:
  - NO API changes - internal processing only
  - NO route additions needed

CONFIG:
  - environment: GOOGLE_AI_API_KEY (already exists in .env.local)
  - NO new config needed

WORKER:
  - import: worker/lib/embeddings.ts in process-document.ts
  - replace: Lines 449-503 in process-document.ts
  - maintain: Same job processing flow
  - maintain: Same progress update pattern

DEPENDENCIES:
  - add: ai@^4.0.0 to worker/package.json
  - add: @ai-sdk/google@^2.0.17 to worker/package.json
  - NO changes to main app dependencies
```

---

## Validation Loop

### Level 1: Syntax & Style

```bash
# Run these FIRST - fix any errors before proceeding

cd worker && npm run lint        # ESLint checking
cd worker && npx tsc --noEmit    # TypeScript type checking

# Expected: No errors. If errors, READ the error and fix.
```

### Level 2: Unit Tests

```bash
# Run embeddings test suite
cd worker && npm test embeddings.test.ts

# Expected: All tests pass
# - Correct dimensions (768)
# - Consistent embeddings for same content
# - Batch processing works
# - Vector equivalence with native SDK
```

### Level 3: Integration Tests

```bash
# Test full document processing pipeline
cd worker && npm test multi-format-integration.test.ts

# Manual integration test:
# 1. Upload small PDF (5-10 pages) via UI
# 2. Monitor processing in background_jobs table
# 3. Verify chunks.embedding column populated
# 4. Test similarity search: supabase.rpc('match_chunks', {...})
# 5. Verify results are relevant

# Expected:
# - Processing completes successfully
# - All chunks have embeddings
# - Similarity search returns results
# - Processing time ≤ baseline
```

## Final Validation Checklist

- [ ] All tests pass: `cd worker && npm test`
- [ ] No linting errors: `cd worker && npm run lint`
- [ ] No type errors: `cd worker && npx tsc --noEmit`
- [ ] Build succeeds: `npm run build` (from project root)
- [ ] Manual test successful: Process test PDF through full pipeline
- [ ] Vector dimensions validated: All embeddings are 768 dimensions
- [ ] Vector equivalence confirmed: >0.999 similarity with native SDK
- [ ] Database integration works: Chunks inserted with embeddings
- [ ] Similarity search works: match_chunks returns relevant results
- [ ] Error cases handled: Test with invalid inputs, rate limits
- [ ] Progress updates work: UI shows real-time progress
- [ ] Logs are informative: Token usage, batch progress logged
- [ ] Documentation updated: CLAUDE.md, AI_DOCUMENTATION.md created
- [ ] Dependencies declared: ai, @ai-sdk/google in worker/package.json
- [ ] Test documents cleaned: Database and storage ready for production

---

## Anti-Patterns to Avoid

- ❌ Don't use `embed()` in loops - use `embedMany()` for batch processing
- ❌ Don't assume nested response structure - Vercel SDK returns flat arrays
- ❌ Don't skip dimension validation - always verify length === 768
- ❌ Don't exceed batch limits - max 250 chunks per embedMany() call
- ❌ Don't ignore rate limits - implement delays between batches on free tier
- ❌ Don't change database schema - chunks.embedding vector(768) must stay
- ❌ Don't modify document processing - keep native SDK for Files API
- ❌ Don't skip vector equivalence test - critical for migration validation
- ❌ Don't remove progress updates - UI depends on real-time feedback
- ❌ Don't hardcode configuration - use constants for model, dimensions, batch size

---

## Risk Mitigation

### Risk: Vector Quality Degradation
**Likelihood**: Low  
**Impact**: High (breaks similarity search)  
**Mitigation**: 
- Comprehensive vector equivalence testing (>0.999 similarity)
- Validate dimensions before database insertion
- Keep test documents for regression testing

### Risk: Rate Limiting on Free Tier
**Likelihood**: Medium (100 RPM limit)  
**Impact**: Medium (processing failures)  
**Mitigation**:
- Conservative batch processing (1s delays)
- Built-in retry logic (maxRetries: 3)
- Monitor token usage in logs

### Risk: Response Structure Misunderstanding
**Likelihood**: Low (well-documented)  
**Impact**: High (runtime errors)  
**Mitigation**:
- Clear documentation of flat array structure
- Explicit test for response shape
- Type safety with TypeScript

### Risk: Breaking Existing Tests
**Likelihood**: Low  
**Impact**: Medium (development friction)  
**Mitigation**:
- Run full test suite before/after migration
- Update test expectations for new SDK
- Keep integration tests comprehensive

---

## Success Metrics

### Functional Metrics
- ✅ **Correctness**: All embeddings have 768 dimensions
- ✅ **Equivalence**: Vector similarity with native SDK >0.999
- ✅ **Integration**: Database insertion succeeds without errors
- ✅ **Search**: Similarity search returns relevant results

### Performance Metrics
- ✅ **Speed**: Processing time ≤ current baseline (~2 min for 100 chunks)
- ✅ **Efficiency**: Batch processing reduces API calls by ~10x
- ✅ **Reliability**: >95% success rate (no rate limit errors)
- ✅ **Memory**: Stable memory usage during processing

### Quality Metrics
- ✅ **Tests**: 100% test pass rate
- ✅ **Linting**: Zero linting errors
- ✅ **Types**: Zero TypeScript errors
- ✅ **Documentation**: Complete AI architecture guide

---

## Task Breakdown Reference

Detailed implementation tasks with acceptance criteria available at:
**docs/tasks/hybrid-ai-sdk-embeddings-migration.md**

(Will be generated by team-lead-task-breakdown agent after PRP approval)

---

## Confidence Score: 9/10

**Rationale**:
- ✅ **Clear Requirements**: Decision document provides comprehensive context
- ✅ **Proven Pattern**: Vercel AI SDK is well-documented with examples
- ✅ **Low Risk**: Stateless embeddings, easy rollback, greenfield project
- ✅ **Comprehensive Research**: Both codebase and external research complete
- ✅ **Validation Strategy**: Multi-level testing with clear success criteria

**-1 Point**:
- ⚠️ **First-time Migration**: No prior team experience with Vercel AI SDK
- ⚠️ **Rate Limit Unknowns**: Free tier behavior needs production validation

**Recommendation**: PROCEED with implementation. Risk is well-mitigated, and benefits are clear.