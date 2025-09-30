# Task Breakdown: Hybrid AI SDK - Embeddings Migration

**Feature**: Embeddings Migration to Vercel AI SDK  
**Source PRP**: `/docs/prps/hybrid-ai-sdk-embeddings-migration.md`  
**Version**: 1.0.0  
**Created**: 2025-09-27  
**Estimated Duration**: 8-12 hours (2-3 development days)

---

## Executive Summary

This task breakdown decomposes the migration of embeddings generation from native `@google/genai` SDK to Vercel AI SDK (`ai` + `@ai-sdk/google`). The migration maintains document processing on the native SDK (Files API requirement) while gaining cleaner API, batch processing, and provider flexibility for future features.

**Key Characteristics**:
- **Zero User Impact**: Internal processing change only
- **Low Risk**: Stateless embeddings, easy rollback, greenfield project
- **High Value**: Foundation for streaming features (chat, synthesis)
- **Clear Validation**: Vector equivalence testing (>0.999 similarity)

**Complexity Assessment**: **Moderate**
- Familiar codebase patterns (worker/handlers)
- New external library integration (Vercel AI SDK)
- Comprehensive testing requirements
- Clear success criteria and rollback strategy

---

## Phase Organization

### Phase 1: Foundation Setup (2-3 hours)
**Goal**: Install dependencies and create module skeleton with proper types.

**Deliverables**:
- Dependencies installed and verified
- Embeddings module created with TypeScript interfaces
- Test utilities module scaffolded

**Milestone**: `npm install` succeeds, module imports work

---

### Phase 2: Core Implementation (3-4 hours)
**Goal**: Implement embeddings generation with batch processing and validation.

**Deliverables**:
- `generateEmbeddings()` function with batch processing
- `generateSingleEmbedding()` helper function
- Rate limiting and retry logic
- Vector dimension validation

**Milestone**: Embeddings module passes unit tests

---

### Phase 3: Handler Integration (1-2 hours)
**Goal**: Replace inline embedding logic in document processing handler.

**Deliverables**:
- Handler updated to use new embeddings module
- Progress updates preserved
- Error handling maintained
- Database insertion logic unchanged

**Milestone**: Document processing works end-to-end with new module

---

### Phase 4: Testing & Validation (2-3 hours)
**Goal**: Comprehensive testing including vector equivalence validation.

**Deliverables**:
- Test suite for embeddings module
- Vector equivalence validation script
- Integration testing with full document pipeline
- Performance baseline comparison

**Milestone**: All tests pass, vector similarity >0.999

---

### Phase 5: Documentation & Cleanup (1 hour)
**Goal**: Update documentation and clean test data.

**Deliverables**:
- AI_DOCUMENTATION.md created
- CLAUDE.md updated with hybrid SDK strategy
- Test documents cleaned from database/storage
- Production readiness checklist complete

**Milestone**: Documentation complete, system ready for production

---

## Detailed Task Breakdown

### Task 1.1: Install Vercel AI SDK Dependencies

**Priority**: Critical  
**Size**: Small (15-30 minutes)  
**Dependencies**: None  
**Phase**: Foundation Setup

**Context**:
The Vercel AI SDK consists of two packages: the core `ai` package (embeddings API) and the `@ai-sdk/google` provider package (Gemini integration). These will be installed in the `worker/` directory alongside existing dependencies.

**Implementation Steps**:

1. Navigate to worker directory:
   ```bash
   cd /Users/topher/Code/rhizome-v2/worker
   ```

2. Install dependencies:
   ```bash
   npm install ai@^4.0.0 @ai-sdk/google@^2.0.17
   ```

3. Verify installation:
   ```bash
   # Check package.json
   cat package.json | grep -A 2 "dependencies"
   
   # Verify lock file updated
   ls -la package-lock.json
   ```

4. Test imports in Node REPL:
   ```bash
   node --input-type=module -e "import { embedMany } from 'ai'; import { google } from '@ai-sdk/google'; console.log('Imports successful')"
   ```

**Acceptance Criteria**:

**Given** a fresh worker directory with existing dependencies  
**When** I install `ai@^4.0.0` and `@ai-sdk/google@^2.0.17`  
**Then**:
- [ ] Both packages appear in `worker/package.json` dependencies
- [ ] `worker/package-lock.json` is updated with new packages
- [ ] No dependency conflicts or peer dependency warnings
- [ ] Test imports succeed without errors
- [ ] Existing tests still pass: `npm test`

**Validation Commands**:
```bash
cd worker
npm list ai @ai-sdk/google  # Verify versions
npm test                     # Ensure no regressions
```

**Files Modified**:
- `/Users/topher/Code/rhizome-v2/worker/package.json`
- `/Users/topher/Code/rhizome-v2/worker/package-lock.json`

**Definition of Done**:
- [ ] Dependencies installed successfully
- [ ] No security vulnerabilities reported
- [ ] Existing tests pass
- [ ] Imports verified in Node REPL

---

### Task 1.2: Create Embeddings Module with Type Definitions

**Priority**: Critical  
**Size**: Medium (1-1.5 hours)  
**Dependencies**: Task 1.1  
**Phase**: Foundation Setup

**Context**:
Create the core embeddings module at `worker/lib/embeddings.ts`. This module will expose a clean API for generating embeddings using the Vercel AI SDK, abstracting away batch processing, rate limiting, and validation logic.

**Implementation Steps**:

1. Create module file:
   ```bash
   touch /Users/topher/Code/rhizome-v2/worker/lib/embeddings.ts
   ```

2. Add imports and type definitions:
   ```typescript
   import { google } from '@ai-sdk/google'
   import { embedMany } from 'ai'
   
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
     tokensUsed?: number
   }
   
   /**
    * Default configuration for Gemini embeddings.
    * - model: gemini-embedding-001 (768 dimensions)
    * - batchSize: 100 chunks (conservative, under 250 API limit)
    * - retryAttempts: 3 retries with exponential backoff
    */
   export const DEFAULT_CONFIG: EmbeddingConfig = {
     model: 'gemini-embedding-001',
     dimensions: 768,
     batchSize: 100,
     retryAttempts: 3,
     retryDelay: 1000
   }
   ```

3. Add function stubs with JSDoc:
   ```typescript
   /**
    * Generate embeddings for document chunks using Vercel AI SDK.
    * 
    * Processes chunks in batches for efficiency while respecting rate limits.
    * Validates vector dimensions before returning results.
    * 
    * @param chunks - Array of chunk content strings
    * @param config - Optional configuration (uses DEFAULT_CONFIG if not provided)
    * @returns Promise resolving to array of embedding vectors (768 dimensions each)
    * @throws {Error} If API call fails or returns invalid dimensions
    * 
    * @example
    * const embeddings = await generateEmbeddings(['chunk 1', 'chunk 2'])
    * console.log(embeddings.length) // 2
    * console.log(embeddings[0].length) // 768
    */
   export async function generateEmbeddings(
     chunks: string[],
     config: Partial<EmbeddingConfig> = {}
   ): Promise<number[][]> {
     // TODO: Implementation in Task 2.1
     throw new Error('Not implemented')
   }
   
   /**
    * Generate single embedding for query or test purposes.
    * 
    * Convenience wrapper around generateEmbeddings for single-chunk use cases.
    * 
    * @param content - Text content to embed
    * @param config - Optional configuration
    * @returns Promise resolving to single embedding vector
    * 
    * @example
    * const embedding = await generateSingleEmbedding('test content')
    * console.log(embedding.length) // 768
    */
   export async function generateSingleEmbedding(
     content: string,
     config: Partial<EmbeddingConfig> = {}
   ): Promise<number[]> {
     // TODO: Implementation in Task 2.1
     throw new Error('Not implemented')
   }
   ```

4. Verify TypeScript compilation:
   ```bash
   cd worker
   npx tsc --noEmit
   ```

**Acceptance Criteria**:

**Given** the worker/lib directory structure  
**When** I create `embeddings.ts` with type definitions and function stubs  
**Then**:
- [ ] File exists at `worker/lib/embeddings.ts`
- [ ] TypeScript compilation succeeds: `npx tsc --noEmit`
- [ ] No linting errors: `npm run lint`
- [ ] Exports are accessible: `import { generateEmbeddings } from './lib/embeddings.js'`
- [ ] JSDoc comments are complete and correctly formatted
- [ ] DEFAULT_CONFIG contains all required fields

**Manual Testing Steps**:

1. Import module in handler:
   ```typescript
   // Add to top of worker/handlers/process-document.ts
   import { generateEmbeddings } from '../lib/embeddings.js'
   ```

2. Verify no import errors:
   ```bash
   npx tsc --noEmit
   ```

**Files Created**:
- `/Users/topher/Code/rhizome-v2/worker/lib/embeddings.ts`

**Definition of Done**:
- [ ] Module created with complete type definitions
- [ ] Function stubs with comprehensive JSDoc
- [ ] TypeScript compiles without errors
- [ ] ESLint passes
- [ ] Module exports verified

---

### Task 1.3: Create Test Utilities Module

**Priority**: High  
**Size**: Small (30-45 minutes)  
**Dependencies**: Task 1.2  
**Phase**: Foundation Setup

**Context**:
Create utility functions for vector similarity calculations and test fixture generation. These utilities will be used extensively in the test suite to validate vector equivalence between native and Vercel SDKs.

**Implementation Steps**:

1. Create test utilities file:
   ```bash
   mkdir -p /Users/topher/Code/rhizome-v2/worker/__tests__/utils
   touch /Users/topher/Code/rhizome-v2/worker/__tests__/utils/vector-utils.ts
   ```

2. Implement cosine similarity calculation:
   ```typescript
   /**
    * Calculate cosine similarity between two vectors.
    * 
    * Cosine similarity measures the cosine of the angle between two vectors,
    * producing a value between -1 (opposite) and 1 (identical).
    * 
    * @param a - First vector
    * @param b - Second vector
    * @returns Cosine similarity score (0-1 range for embeddings)
    * @throws {Error} If vectors have different lengths
    * 
    * @example
    * const similarity = cosineSimilarity([1, 0, 0], [1, 0, 0])
    * console.log(similarity) // 1.0 (identical)
    */
   export function cosineSimilarity(a: number[], b: number[]): number {
     if (a.length !== b.length) {
       throw new Error(`Vector dimension mismatch: ${a.length} vs ${b.length}`)
     }
     
     let dotProduct = 0
     let normA = 0
     let normB = 0
     
     for (let i = 0; i < a.length; i++) {
       dotProduct += a[i] * b[i]
       normA += a[i] * a[i]
       normB += b[i] * b[i]
     }
     
     const denominator = Math.sqrt(normA) * Math.sqrt(normB)
     if (denominator === 0) {
       return 0
     }
     
     return dotProduct / denominator
   }
   ```

3. Add test fixture generator:
   ```typescript
   /**
    * Generate test embedding using native Gemini SDK.
    * 
    * Used for vector equivalence testing to compare Vercel AI SDK results
    * against the native SDK baseline.
    * 
    * @param content - Text content to embed
    * @returns Promise resolving to embedding vector from native SDK
    */
   export async function generateNativeEmbedding(content: string): Promise<number[]> {
     const { GoogleGenAI } = await import('@google/genai')
     
     if (!process.env.GOOGLE_AI_API_KEY) {
       throw new Error('GOOGLE_AI_API_KEY not configured')
     }
     
     const ai = new GoogleGenAI({ 
       apiKey: process.env.GOOGLE_AI_API_KEY 
     })
     
     const result = await ai.models.embedContent({
       model: 'gemini-embedding-001',
       contents: content,
       config: { outputDimensionality: 768 }
     })
     
     const embedding = result.embeddings?.[0]?.values
     if (!embedding || !Array.isArray(embedding)) {
       throw new Error('Invalid native embedding response')
     }
     
     return embedding
   }
   ```

4. Add validation helpers:
   ```typescript
   /**
    * Validate that an embedding has correct dimensions and valid values.
    * 
    * @param embedding - Vector to validate
    * @param expectedDimensions - Expected vector length (default: 768)
    * @returns True if valid, throws Error if invalid
    */
   export function validateEmbedding(
     embedding: number[], 
     expectedDimensions = 768
   ): boolean {
     if (!Array.isArray(embedding)) {
       throw new Error('Embedding must be an array')
     }
     
     if (embedding.length !== expectedDimensions) {
       throw new Error(
         `Invalid dimensions: expected ${expectedDimensions}, got ${embedding.length}`
       )
     }
     
     if (!embedding.every(val => typeof val === 'number' && !isNaN(val))) {
       throw new Error('Embedding contains invalid values')
     }
     
     return true
   }
   ```

**Acceptance Criteria**:

**Given** the test utilities module  
**When** I use the helper functions in tests  
**Then**:
- [ ] `cosineSimilarity()` returns correct values for test vectors
- [ ] `cosineSimilarity([1,0,0], [1,0,0])` returns 1.0
- [ ] `cosineSimilarity([1,0,0], [0,1,0])` returns 0.0
- [ ] `generateNativeEmbedding()` returns 768-dimensional vectors
- [ ] `validateEmbedding()` correctly identifies invalid vectors
- [ ] All functions have complete JSDoc comments
- [ ] TypeScript compilation succeeds

**Manual Testing Steps**:

1. Test cosine similarity with known vectors:
   ```typescript
   import { cosineSimilarity } from './utils/vector-utils.js'
   
   // Test identical vectors
   console.assert(cosineSimilarity([1,0,0], [1,0,0]) === 1.0)
   
   // Test orthogonal vectors
   console.assert(cosineSimilarity([1,0,0], [0,1,0]) === 0.0)
   ```

2. Test native embedding generation:
   ```bash
   node --input-type=module -e "
   import { generateNativeEmbedding } from './utils/vector-utils.js';
   const embedding = await generateNativeEmbedding('test');
   console.log('Dimensions:', embedding.length);
   "
   ```

**Files Created**:
- `/Users/topher/Code/rhizome-v2/worker/__tests__/utils/vector-utils.ts`

**Definition of Done**:
- [ ] All utility functions implemented
- [ ] JSDoc comments complete
- [ ] Manual tests pass
- [ ] TypeScript compiles without errors
- [ ] Ready for use in test suite

---

### Task 2.1: Implement Batch Embeddings Generation

**Priority**: Critical  
**Size**: Large (2-3 hours)  
**Dependencies**: Task 1.1, Task 1.2  
**Phase**: Core Implementation

**Context**:
Implement the core `generateEmbeddings()` function in `worker/lib/embeddings.ts`. This function processes chunks in batches using the Vercel AI SDK, with rate limiting, retry logic, and dimension validation. Follow the pattern established in `worker/lib/gemini.ts` for error handling.

**Implementation Steps**:

1. Update `generateEmbeddings()` implementation:
   ```typescript
   export async function generateEmbeddings(
     chunks: string[],
     config: Partial<EmbeddingConfig> = {}
   ): Promise<number[][]> {
     const finalConfig = { ...DEFAULT_CONFIG, ...config }
     const allEmbeddings: number[][] = []
     
     // Validate inputs
     if (!chunks || chunks.length === 0) {
       throw new Error('No chunks provided for embedding generation')
     }
     
     if (!process.env.GOOGLE_AI_API_KEY) {
       throw new Error('GOOGLE_AI_API_KEY environment variable not configured')
     }
     
     // Process in batches (max 250 per Gemini API, we use 100 conservatively)
     const batchCount = Math.ceil(chunks.length / finalConfig.batchSize)
     
     for (let batchIndex = 0; batchIndex < batchCount; batchIndex++) {
       const startIdx = batchIndex * finalConfig.batchSize
       const endIdx = Math.min(startIdx + finalConfig.batchSize, chunks.length)
       const batch = chunks.slice(startIdx, endIdx)
       
       try {
         // Generate embeddings with Vercel AI SDK
         const { embeddings, usage } = await embedMany({
           model: google.textEmbedding(finalConfig.model, {
             outputDimensionality: finalConfig.dimensions
           }),
           values: batch,
           maxRetries: finalConfig.retryAttempts
         })
         
         // CRITICAL: Validate dimensions BEFORE accepting results
         for (let i = 0; i < embeddings.length; i++) {
           const embedding = embeddings[i]
           
           if (!Array.isArray(embedding)) {
             throw new Error(
               `Invalid embedding at batch ${batchIndex}, index ${i}: not an array`
             )
           }
           
           if (embedding.length !== finalConfig.dimensions) {
             throw new Error(
               `Invalid embedding dimension at batch ${batchIndex}, index ${i}: ` +
               `expected ${finalConfig.dimensions}, got ${embedding.length}`
             )
           }
           
           // Validate all values are numbers
           if (!embedding.every(val => typeof val === 'number' && !isNaN(val))) {
             throw new Error(
               `Invalid embedding values at batch ${batchIndex}, index ${i}: ` +
               `contains non-numeric or NaN values`
             )
           }
         }
         
         allEmbeddings.push(...embeddings)
         
         // Log progress for monitoring
         const processedCount = endIdx
         const progressPercent = Math.floor((processedCount / chunks.length) * 100)
         console.log(
           `Embedding batch ${batchIndex + 1}/${batchCount}: ` +
           `${batch.length} chunks, ${usage?.tokens || 'unknown'} tokens ` +
           `(${progressPercent}% complete)`
         )
         
         // Rate limiting: 1s delay between batches (free tier: 100 RPM)
         // Skip delay after last batch
         if (batchIndex < batchCount - 1) {
           await new Promise(resolve => setTimeout(resolve, finalConfig.retryDelay))
         }
         
       } catch (error) {
         const err = error instanceof Error ? error : new Error('Unknown error')
         throw new Error(
           `Embedding generation failed for batch ${batchIndex + 1}/${batchCount} ` +
           `(chunks ${startIdx}-${endIdx}): ${err.message}`
         )
       }
     }
     
     // Final validation: ensure we got embeddings for all chunks
     if (allEmbeddings.length !== chunks.length) {
       throw new Error(
         `Embedding count mismatch: expected ${chunks.length}, got ${allEmbeddings.length}`
       )
     }
     
     return allEmbeddings
   }
   ```

2. Implement `generateSingleEmbedding()` wrapper:
   ```typescript
   export async function generateSingleEmbedding(
     content: string,
     config: Partial<EmbeddingConfig> = {}
   ): Promise<number[]> {
     if (!content || content.trim().length === 0) {
       throw new Error('Empty content provided for embedding generation')
     }
     
     const embeddings = await generateEmbeddings([content], config)
     return embeddings[0]
   }
   ```

3. Verify TypeScript compilation:
   ```bash
   cd worker
   npx tsc --noEmit
   npm run lint
   ```

**Acceptance Criteria**:

**Given** the embeddings module with implementation  
**When** I call `generateEmbeddings()` with test chunks  
**Then**:
- [ ] Function returns array of embeddings matching input chunk count
- [ ] Each embedding has exactly 768 dimensions
- [ ] All embedding values are valid numbers (no NaN, no Infinity)
- [ ] Batch processing works with 1, 50, 100, and 250 chunks
- [ ] Rate limiting delays are applied between batches
- [ ] Token usage is logged to console
- [ ] Dimension validation catches invalid responses
- [ ] Error messages include batch context
- [ ] `generateSingleEmbedding()` returns single vector

**Manual Testing Steps**:

1. Test with single chunk:
   ```bash
   node --input-type=module -e "
   import { generateSingleEmbedding } from './lib/embeddings.js';
   const embedding = await generateSingleEmbedding('test content');
   console.log('Dimensions:', embedding.length);
   console.assert(embedding.length === 768, 'Incorrect dimensions');
   "
   ```

2. Test with batch:
   ```bash
   node --input-type=module -e "
   import { generateEmbeddings } from './lib/embeddings.js';
   const chunks = Array.from({ length: 10 }, (_, i) => \`chunk \${i}\`);
   const embeddings = await generateEmbeddings(chunks);
   console.log('Generated:', embeddings.length, 'embeddings');
   console.assert(embeddings.length === 10, 'Incorrect count');
   console.assert(embeddings[0].length === 768, 'Incorrect dimensions');
   "
   ```

3. Test error handling:
   ```bash
   node --input-type=module -e "
   import { generateEmbeddings } from './lib/embeddings.js';
   try {
     await generateEmbeddings([]);
     console.error('Should have thrown error');
   } catch (err) {
     console.log('✓ Empty array error:', err.message);
   }
   "
   ```

**Code Patterns to Follow**:
- Error handling: Mirror `worker/lib/gemini.ts` patterns
- Logging: Use console.log for progress, console.error for errors
- Validation: Fail fast with descriptive error messages
- Rate limiting: Conservative 1s delays (can be optimized later)

**Files Modified**:
- `/Users/topher/Code/rhizome-v2/worker/lib/embeddings.ts`

**Definition of Done**:
- [ ] Implementation complete with batch processing
- [ ] Rate limiting implemented
- [ ] Dimension validation working
- [ ] Error handling comprehensive
- [ ] Manual tests pass
- [ ] TypeScript compiles without errors
- [ ] ESLint passes

---

### Task 2.2: Create Embeddings Test Suite

**Priority**: Critical  
**Size**: Medium (1.5-2 hours)  
**Dependencies**: Task 1.3, Task 2.1  
**Phase**: Core Implementation

**Context**:
Create comprehensive test suite for the embeddings module. Tests will validate correct dimensions, batch processing, consistency, error handling, and most critically, vector equivalence with the native SDK (>0.999 similarity).

**Implementation Steps**:

1. Create test file:
   ```bash
   touch /Users/topher/Code/rhizome-v2/worker/__tests__/embeddings.test.ts
   ```

2. Add test setup and imports:
   ```typescript
   import { describe, test, expect, beforeAll } from '@jest/globals'
   import { generateEmbeddings, generateSingleEmbedding, DEFAULT_CONFIG } from '../lib/embeddings.js'
   import { cosineSimilarity, generateNativeEmbedding, validateEmbedding } from './utils/vector-utils.js'
   
   // Skip tests if API key not configured
   const shouldRunTests = !!process.env.GOOGLE_AI_API_KEY
   const describeIf = shouldRunTests ? describe : describe.skip
   
   describeIf('Embeddings Module', () => {
     // Tests here
   })
   ```

3. Add dimension validation tests:
   ```typescript
   test('generates valid embeddings with correct dimensions', async () => {
     const chunks = ['Test content 1', 'Test content 2', 'Test content 3']
     const embeddings = await generateEmbeddings(chunks)
     
     // Verify correct count
     expect(embeddings).toHaveLength(3)
     
     // Verify each embedding
     for (let i = 0; i < embeddings.length; i++) {
       const embedding = embeddings[i]
       expect(embedding).toHaveLength(768)
       expect(validateEmbedding(embedding)).toBe(true)
       
       // Verify all values are numbers
       for (const value of embedding) {
         expect(typeof value).toBe('number')
         expect(isNaN(value)).toBe(false)
         expect(isFinite(value)).toBe(true)
       }
     }
   }, 30000) // 30s timeout for API call
   ```

4. Add consistency test:
   ```typescript
   test('generates consistent embeddings for same content', async () => {
     const content = 'Consistency test content for embeddings'
     
     const embedding1 = await generateSingleEmbedding(content)
     const embedding2 = await generateSingleEmbedding(content)
     
     // Verify nearly identical (allowing for floating point precision)
     const similarity = cosineSimilarity(embedding1, embedding2)
     expect(similarity).toBeGreaterThan(0.9999)
   }, 30000)
   ```

5. Add batch processing test:
   ```typescript
   test('handles batch processing correctly', async () => {
     // Generate 150 test chunks (1.5 batches at default batch size of 100)
     const chunks = Array.from({ length: 150 }, (_, i) => `Test chunk number ${i} with some content`)
     
     const embeddings = await generateEmbeddings(chunks)
     
     // Verify all embeddings generated
     expect(embeddings).toHaveLength(150)
     
     // Verify all have correct dimensions
     expect(embeddings.every(e => e.length === 768)).toBe(true)
     
     // Verify no duplicates (each chunk should have unique embedding)
     const firstEmbedding = embeddings[0]
     const lastEmbedding = embeddings[149]
     const similarity = cosineSimilarity(firstEmbedding, lastEmbedding)
     expect(similarity).toBeLessThan(0.99) // Should be different content
   }, 60000) // 60s timeout for large batch
   ```

6. Add vector equivalence test (CRITICAL):
   ```typescript
   test('validates vector equivalence with native SDK', async () => {
     const testContent = 'Vector equivalence test: comparing Vercel AI SDK with native Gemini SDK'
     
     // Generate with both SDKs
     const vercelEmbedding = await generateSingleEmbedding(testContent)
     const nativeEmbedding = await generateNativeEmbedding(testContent)
     
     // Verify both have correct dimensions
     expect(vercelEmbedding).toHaveLength(768)
     expect(nativeEmbedding).toHaveLength(768)
     
     // CRITICAL: High similarity (>0.999) required for migration confidence
     const similarity = cosineSimilarity(vercelEmbedding, nativeEmbedding)
     expect(similarity).toBeGreaterThan(0.999)
     
     console.log(`Vector equivalence: ${(similarity * 100).toFixed(4)}% similarity`)
   }, 30000)
   ```

7. Add error handling tests:
   ```typescript
   test('handles empty input gracefully', async () => {
     await expect(generateEmbeddings([])).rejects.toThrow('No chunks provided')
   })
   
   test('handles invalid content gracefully', async () => {
     await expect(generateSingleEmbedding('')).rejects.toThrow('Empty content')
   })
   
   test('validates embedding dimensions', async () => {
     // This test validates that our dimension checking works
     const embedding = await generateSingleEmbedding('test')
     expect(() => validateEmbedding(embedding, 1024)).toThrow('Invalid dimensions')
   })
   ```

8. Run tests:
   ```bash
   cd worker
   npm test embeddings.test.ts
   ```

**Acceptance Criteria**:

**Given** the embeddings test suite  
**When** I run `npm test embeddings.test.ts`  
**Then**:
- [ ] All dimension validation tests pass
- [ ] Consistency test shows >0.9999 similarity
- [ ] Batch processing test handles 150 chunks correctly
- [ ] Vector equivalence test shows >0.999 similarity with native SDK
- [ ] Error handling tests pass
- [ ] No test failures or timeouts
- [ ] Tests complete in <90 seconds total
- [ ] Console output shows similarity percentages

**Manual Testing Steps**:

1. Run full test suite:
   ```bash
   cd worker
   npm test embeddings.test.ts -- --verbose
   ```

2. Check test coverage:
   ```bash
   npm test embeddings.test.ts -- --coverage
   ```

3. Verify vector equivalence output:
   ```
   Expected console output:
   ✓ generates valid embeddings with correct dimensions (5234ms)
   ✓ generates consistent embeddings for same content (4123ms)
   ✓ handles batch processing correctly (45678ms)
   Vector equivalence: 99.9876% similarity
   ✓ validates vector equivalence with native SDK (6789ms)
   ```

**Files Created**:
- `/Users/topher/Code/rhizome-v2/worker/__tests__/embeddings.test.ts`

**Definition of Done**:
- [ ] Test suite complete with 7+ tests
- [ ] All tests pass
- [ ] Vector equivalence confirmed >0.999
- [ ] Error cases covered
- [ ] Test execution time acceptable
- [ ] Console output informative

---

### Task 3.1: Update Document Processing Handler

**Priority**: Critical  
**Size**: Medium (1-1.5 hours)  
**Dependencies**: Task 2.1, Task 2.2  
**Phase**: Handler Integration

**Context**:
Replace the inline embedding logic in `worker/handlers/process-document.ts` (lines 449-503) with calls to the new embeddings module. This is a surgical replacement - preserve all progress updates, error handling, and database insertion logic.

**Implementation Steps**:

1. Add import at top of file:
   ```typescript
   // Add after existing imports (around line 7)
   import { generateEmbeddings } from '../lib/embeddings.js'
   ```

2. Locate and document current implementation:
   ```bash
   # Review current implementation
   sed -n '449,503p' /Users/topher/Code/rhizome-v2/worker/handlers/process-document.ts
   ```

3. Replace embedding generation logic (lines 449-503):
   ```typescript
   await updateProgress(supabase, job.id, STAGES.EMBED.percent, 'embed', 'starting', `Generating embeddings for ${chunks.length} chunks`)
   
   try {
     // NEW: Generate all embeddings in batches using Vercel AI SDK
     const chunkContents = chunks.map(c => c.content)
     const embeddings = await generateEmbeddings(chunkContents)
     
     // UNCHANGED: Insert chunks with embeddings into database
     const chunkCount = chunks.length
     for (let i = 0; i < chunkCount; i++) {
       const chunk = chunks[i]
       const embedding = embeddings[i]  // Direct access - no .values needed!
       
       const chunkData: any = {
         document_id,
         content: chunk.content,
         embedding,  // SIMPLIFIED: Direct assignment (was: embeddingVector)
         chunk_index: i,
         themes: chunk.themes,
         importance_score: chunk.importance_score,
         summary: chunk.summary
       }
       
       // Add timestamp data if present (YouTube videos)
       if (chunk.timestamps) {
         chunkData.timestamps = chunk.timestamps
       }
       
       await supabase.from('chunks').insert(chunkData)
       
       // PRESERVED: Progress updates every 5 chunks (UNCHANGED)
       if (i % 5 === 0 || i === chunkCount - 1) {
         const embedPercent = STAGES.EMBED.percent + (i / chunkCount) * 49
         const progressPercent = Math.floor((i / chunkCount) * 100)
         await updateProgress(
           supabase,
           job.id,
           Math.floor(embedPercent),
           'embed',
           'inserting',
           `Saving chunk ${i + 1}/${chunkCount} (${progressPercent}%)`
         )
       }
     }
     
   } catch (error) {
     // PRESERVED: Error handling pattern (UNCHANGED)
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
   ```

4. Remove OLD code that's no longer needed:
   - Delete: Lines 456-473 (rate limiting, embedContent call, nested values extraction)
   - Keep: All progress update logic
   - Keep: All database insertion logic
   - Keep: Error handling pattern

5. Verify TypeScript compilation:
   ```bash
   cd worker
   npx tsc --noEmit
   npm run lint
   ```

**Acceptance Criteria**:

**Given** the updated process-document handler  
**When** I process a test document  
**Then**:
- [ ] Document processing completes successfully
- [ ] Embeddings are generated using new module
- [ ] Progress updates appear every 5 chunks as before
- [ ] All chunks are inserted into database with embeddings
- [ ] No nested `.values` extraction (direct assignment)
- [ ] Error handling preserves friendly messages
- [ ] TypeScript compilation succeeds
- [ ] ESLint passes with no warnings

**Manual Testing Steps**:

1. Process small test document:
   ```bash
   # Start worker
   cd worker
   npm run dev
   
   # Upload test PDF via UI
   # Monitor background_jobs table for progress updates
   # Verify chunks table populated with embeddings
   ```

2. Verify progress updates:
   ```sql
   -- Check progress updates in database
   SELECT 
     progress->>'percent' as percent,
     progress->>'stage' as stage,
     progress->>'details' as details,
     updated_at
   FROM background_jobs
   WHERE id = '<job_id>'
   ORDER BY updated_at DESC
   LIMIT 20;
   ```

3. Verify embeddings in database:
   ```sql
   -- Verify embeddings are 768 dimensions
   SELECT 
     id,
     chunk_index,
     array_length(embedding::float[], 1) as dimensions
   FROM chunks
   WHERE document_id = '<doc_id>'
   ORDER BY chunk_index
   LIMIT 5;
   ```

**Code Patterns to Follow**:
- Progress updates: MUST maintain existing pattern (every 5 chunks)
- Error handling: MUST preserve getUserFriendlyError pattern
- Database insertion: MUST maintain transaction-like error recovery
- Logging: Add console.log for batch completion (helpful for debugging)

**Files Modified**:
- `/Users/topher/Code/rhizome-v2/worker/handlers/process-document.ts`

**Lines Modified**: 449-503 (approximately 55 lines replaced with ~40 lines)

**Definition of Done**:
- [ ] Import added
- [ ] Embedding logic replaced
- [ ] Progress updates preserved
- [ ] Error handling preserved
- [ ] TypeScript compiles
- [ ] ESLint passes
- [ ] Manual test passes

---

### Task 3.2: Integration Testing with Full Pipeline

**Priority**: High  
**Size**: Medium (1 hour)  
**Dependencies**: Task 3.1  
**Phase**: Handler Integration

**Context**:
Validate the complete document processing pipeline end-to-end. Process a real test document and verify embeddings, similarity search, and performance metrics meet requirements.

**Implementation Steps**:

1. Prepare test document:
   - Use existing test PDF (5-10 pages)
   - Or create new test document with known content
   - Document should generate 20-50 chunks

2. Start all services:
   ```bash
   # From project root
   npm run dev
   ```

3. Upload and process test document:
   - Upload via UI (http://localhost:3000)
   - Monitor processing in real-time
   - Record processing time

4. Verify embeddings in database:
   ```sql
   -- Connect to local Supabase
   -- Check embeddings generated correctly
   SELECT 
     d.title,
     d.processing_status,
     d.embeddings_available,
     COUNT(c.id) as chunk_count,
     MIN(array_length(c.embedding::float[], 1)) as min_dimensions,
     MAX(array_length(c.embedding::float[], 1)) as max_dimensions
   FROM documents d
   LEFT JOIN chunks c ON c.document_id = d.id
   WHERE d.id = '<test_doc_id>'
   GROUP BY d.id, d.title, d.processing_status, d.embeddings_available;
   ```

5. Test similarity search:
   ```sql
   -- Create test function to verify similarity search works
   SELECT 
     c.chunk_index,
     c.content,
     1 - (c.embedding <=> (
       SELECT embedding 
       FROM chunks 
       WHERE document_id = '<test_doc_id>' 
       LIMIT 1
     )) as similarity_score
   FROM chunks c
   WHERE c.document_id = '<test_doc_id>'
   ORDER BY c.embedding <=> (
     SELECT embedding 
     FROM chunks 
     WHERE document_id = '<test_doc_id>' 
     LIMIT 1
   )
   LIMIT 5;
   ```

6. Test match_chunks RPC:
   ```typescript
   // Create test script: worker/__tests__/test-similarity-search.ts
   import { createClient } from '@supabase/supabase-js'
   import { generateSingleEmbedding } from '../lib/embeddings.js'
   
   const supabase = createClient(
     process.env.NEXT_PUBLIC_SUPABASE_URL!,
     process.env.SUPABASE_SERVICE_ROLE_KEY!
   )
   
   async function testSimilaritySearch() {
     // Generate query embedding
     const queryEmbedding = await generateSingleEmbedding(
       'Test query about document content'
     )
     
     // Call match_chunks RPC
     const { data, error } = await supabase.rpc('match_chunks', {
       query_embedding: queryEmbedding,
       match_threshold: 0.7,
       match_count: 5
     })
     
     if (error) {
       console.error('Similarity search failed:', error)
       process.exit(1)
     }
     
     console.log('Top 5 similar chunks:')
     for (const result of data) {
       console.log(`- Similarity: ${result.similarity.toFixed(4)}`)
       console.log(`  Content: ${result.content.substring(0, 100)}...`)
     }
   }
   
   testSimilaritySearch()
   ```

7. Run similarity search test:
   ```bash
   cd worker
   node --input-type=module --loader tsx __tests__/test-similarity-search.ts
   ```

8. Record performance metrics:
   - Total processing time
   - Embedding generation time
   - Chunk insertion time
   - Memory usage

**Acceptance Criteria**:

**Given** a test document processed through the full pipeline  
**When** I verify the results  
**Then**:
- [ ] Document processing completes without errors
- [ ] Processing status updates to 'completed'
- [ ] All chunks have embeddings in database
- [ ] All embeddings have exactly 768 dimensions
- [ ] Similarity search returns relevant results
- [ ] match_chunks RPC returns results with similarity scores
- [ ] Processing time ≤ baseline (approximately 2 min for 100 chunks)
- [ ] No rate limit errors
- [ ] No memory leaks or performance degradation

**Manual Testing Steps**:

1. **Before Migration Baseline** (if available):
   ```bash
   # Record baseline with old implementation
   # Processing time: ___ seconds
   # Memory usage: ___ MB
   ```

2. **After Migration Test**:
   ```bash
   # Record metrics with new implementation
   # Processing time: ___ seconds (should be ≤ baseline)
   # Memory usage: ___ MB
   # Rate limit errors: 0
   ```

3. **Similarity Search Validation**:
   ```bash
   # Run similarity search test script
   # Expected: 5 results with similarity scores > 0.7
   # Expected: Results are contextually relevant
   ```

**Performance Baseline** (from PRP):
- 100 chunks: ~2 minutes total processing
- Embedding stage: ~1 minute (with sequential API calls)
- Expected improvement: 10-30% faster with batching (not critical, but nice)

**Files Created**:
- `/Users/topher/Code/rhizome-v2/worker/__tests__/test-similarity-search.ts` (optional test script)

**Definition of Done**:
- [ ] Full document processed successfully
- [ ] Embeddings verified in database
- [ ] Similarity search works correctly
- [ ] Performance meets or exceeds baseline
- [ ] No errors or warnings
- [ ] Metrics documented

---

### Task 4.1: Update Existing Gemini Embedding Test

**Priority**: Medium  
**Size**: Small (30 minutes)  
**Dependencies**: Task 2.1  
**Phase**: Testing & Validation

**Context**:
Update the existing test file `worker/__tests__/test-gemini-embedding.ts` to fix the incorrect model name and add comparison between native and Vercel AI SDK implementations.

**Implementation Steps**:

1. Locate existing test file:
   ```bash
   cat /Users/topher/Code/rhizome-v2/worker/__tests__/test-gemini-embedding.ts
   ```

2. Fix model name (identified in PRP as incorrect):
   ```typescript
   // BEFORE (line ~15):
   model: 'text-embedding-004',  // WRONG MODEL
   
   // AFTER:
   model: 'gemini-embedding-001',  // Correct Gemini model
   ```

3. Add Vercel AI SDK comparison test:
   ```typescript
   import { generateSingleEmbedding } from '../lib/embeddings.js'
   import { cosineSimilarity } from './utils/vector-utils.js'
   
   async function compareSDKs() {
     console.log('\n=== SDK Comparison Test ===\n')
     
     const testContent = 'This is a test sentence for embedding comparison.'
     
     // Generate with native SDK (existing code)
     console.log('Generating embedding with native @google/genai...')
     const nativeStart = Date.now()
     const nativeResult = await ai.models.embedContent({
       model: 'gemini-embedding-001',
       contents: testContent,
       config: { outputDimensionality: 768 }
     })
     const nativeTime = Date.now() - nativeStart
     const nativeEmbedding = nativeResult.embeddings[0].values
     
     // Generate with Vercel AI SDK
     console.log('Generating embedding with Vercel AI SDK...')
     const vercelStart = Date.now()
     const vercelEmbedding = await generateSingleEmbedding(testContent)
     const vercelTime = Date.now() - vercelStart
     
     // Compare
     const similarity = cosineSimilarity(nativeEmbedding, vercelEmbedding)
     
     console.log('\nResults:')
     console.log(`- Native SDK time: ${nativeTime}ms`)
     console.log(`- Vercel SDK time: ${vercelTime}ms`)
     console.log(`- Native dimensions: ${nativeEmbedding.length}`)
     console.log(`- Vercel dimensions: ${vercelEmbedding.length}`)
     console.log(`- Similarity: ${(similarity * 100).toFixed(4)}%`)
     
     if (similarity > 0.999) {
       console.log('✅ Vector equivalence confirmed (>99.9% similar)')
     } else {
       console.log('⚠️  Warning: Similarity below threshold')
     }
   }
   
   // Add to existing test execution
   compareSDKs()
   ```

4. Update documentation in test file:
   ```typescript
   /**
    * Test script to validate Gemini embeddings and compare SDK implementations.
    * 
    * Tests:
    * 1. Native @google/genai SDK embedding generation
    * 2. Vercel AI SDK embedding generation
    * 3. Vector equivalence between both implementations
    * 
    * Expected: >99.9% similarity between native and Vercel SDKs
    */
   ```

5. Run updated test:
   ```bash
   cd worker
   npx tsx __tests__/test-gemini-embedding.ts
   ```

**Acceptance Criteria**:

**Given** the updated test file  
**When** I run the test script  
**Then**:
- [ ] Test uses correct model: `gemini-embedding-001`
- [ ] Both SDKs generate 768-dimensional embeddings
- [ ] Similarity between SDKs is >0.999
- [ ] Test output shows timing comparison
- [ ] Console output is clear and informative
- [ ] Test completes without errors

**Manual Testing Steps**:

1. Run test script:
   ```bash
   cd worker
   npx tsx __tests__/test-gemini-embedding.ts
   ```

2. Verify expected output:
   ```
   Expected console output:
   
   === Native @google/genai SDK Test ===
   Generating embedding for: "This is a test sentence."
   ✓ Embedding generated successfully
   Dimensions: 768
   
   === SDK Comparison Test ===
   Generating embedding with native @google/genai...
   Generating embedding with Vercel AI SDK...
   
   Results:
   - Native SDK time: 1234ms
   - Vercel SDK time: 1198ms
   - Native dimensions: 768
   - Vercel dimensions: 768
   - Similarity: 99.9876%
   ✅ Vector equivalence confirmed (>99.9% similar)
   ```

**Files Modified**:
- `/Users/topher/Code/rhizome-v2/worker/__tests__/test-gemini-embedding.ts`

**Definition of Done**:
- [ ] Model name corrected
- [ ] SDK comparison test added
- [ ] Test runs successfully
- [ ] Vector equivalence confirmed
- [ ] Output is informative

---

### Task 4.2: Performance Baseline Validation

**Priority**: Medium  
**Size**: Small (30 minutes)  
**Dependencies**: Task 3.2  
**Phase**: Testing & Validation

**Context**:
Validate that the new implementation meets performance requirements. Compare processing time, API usage, and resource consumption against baseline metrics from the PRP.

**Implementation Steps**:

1. Create performance test script:
   ```bash
   touch /Users/topher/Code/rhizome-v2/worker/__tests__/performance-baseline.ts
   ```

2. Implement performance test:
   ```typescript
   import { generateEmbeddings } from '../lib/embeddings.js'
   
   /**
    * Performance baseline test for embeddings generation.
    * 
    * Validates:
    * - Processing time meets requirements (≤ 2 min for 100 chunks)
    * - Batch processing efficiency
    * - Memory usage is stable
    * - No rate limit errors
    */
   
   async function runPerformanceTest() {
     console.log('=== Embeddings Performance Baseline Test ===\n')
     
     // Generate test chunks (100 chunks, similar to typical document)
     const chunkCount = 100
     const chunks = Array.from(
       { length: chunkCount },
       (_, i) => `This is test chunk number ${i}. It contains some sample text to represent a typical document chunk with meaningful content for embedding generation.`
     )
     
     console.log(`Testing with ${chunkCount} chunks...`)
     
     // Measure performance
     const startTime = Date.now()
     const startMemory = process.memoryUsage()
     
     try {
       const embeddings = await generateEmbeddings(chunks)
       
       const endTime = Date.now()
       const endMemory = process.memoryUsage()
       
       const duration = (endTime - startTime) / 1000 // seconds
       const memoryIncrease = (endMemory.heapUsed - startMemory.heapUsed) / 1024 / 1024 // MB
       
       // Calculate metrics
       const chunksPerSecond = chunkCount / duration
       const avgTimePerChunk = duration / chunkCount
       
       console.log('\n=== Results ===')
       console.log(`Total time: ${duration.toFixed(2)}s`)
       console.log(`Baseline target: ≤120s (2 minutes)`)
       console.log(`Status: ${duration <= 120 ? '✅ PASS' : '❌ FAIL'}`)
       console.log(`\nThroughput: ${chunksPerSecond.toFixed(2)} chunks/sec`)
       console.log(`Avg time per chunk: ${(avgTimePerChunk * 1000).toFixed(0)}ms`)
       console.log(`Memory increase: ${memoryIncrease.toFixed(2)} MB`)
       console.log(`\nEmbeddings generated: ${embeddings.length}`)
       console.log(`All valid dimensions: ${embeddings.every(e => e.length === 768) ? '✅' : '❌'}`)
       
       // Performance summary
       console.log('\n=== Performance Summary ===')
       if (duration <= 60) {
         console.log('🚀 Excellent: Under 1 minute')
       } else if (duration <= 120) {
         console.log('✅ Good: Meets baseline requirement')
       } else {
         console.log('⚠️  Needs optimization: Exceeds baseline')
       }
       
     } catch (error) {
       console.error('❌ Test failed:', error)
       process.exit(1)
     }
   }
   
   runPerformanceTest()
   ```

3. Run performance test:
   ```bash
   cd worker
   npx tsx __tests__/performance-baseline.ts
   ```

4. Document results in this task:
   ```
   Results Template:
   - Total time: ___ seconds
   - Baseline target: ≤120s (2 minutes)
   - Status: PASS/FAIL
   - Throughput: ___ chunks/sec
   - Memory increase: ___ MB
   ```

**Acceptance Criteria**:

**Given** the performance test script  
**When** I run the test with 100 chunks  
**Then**:
- [ ] Processing completes in ≤120 seconds (2 minutes)
- [ ] All 100 embeddings generated successfully
- [ ] All embeddings have 768 dimensions
- [ ] Memory usage is stable (no leaks)
- [ ] No rate limit errors
- [ ] Throughput is acceptable (>0.8 chunks/sec)
- [ ] Test output is clear and informative

**Manual Testing Steps**:

1. Run performance test:
   ```bash
   cd worker
   npx tsx __tests__/performance-baseline.ts
   ```

2. Record results:
   ```
   Date: 2025-09-27
   Environment: Local development
   Test: 100 chunks
   
   Results:
   - Total time: ___ seconds
   - Status: PASS/FAIL
   - Throughput: ___ chunks/sec
   - Memory increase: ___ MB
   - Rate limit errors: 0
   ```

3. Compare with baseline (from PRP):
   ```
   Baseline (native SDK, sequential):
   - 100 chunks: ~120s (2 minutes)
   - Sequential processing: 1 chunk/sec
   
   New implementation (Vercel SDK, batched):
   - 100 chunks: ___ seconds
   - Batch processing: ___ chunks/sec
   - Improvement: ___% faster (or similar)
   ```

**Performance Requirements** (from PRP):
- **Primary**: Processing time ≤ current implementation (~2 min for 100 chunks)
- **Secondary**: No rate limit errors during normal operation
- **Tertiary**: Memory usage stable (no leaks)

**Files Created**:
- `/Users/topher/Code/rhizome-v2/worker/__tests__/performance-baseline.ts`

**Definition of Done**:
- [ ] Performance test script created
- [ ] Test runs successfully
- [ ] Results meet baseline requirements
- [ ] Metrics documented
- [ ] No performance regressions

---

### Task 5.1: Create AI Documentation Guide

**Priority**: High  
**Size**: Medium (1 hour)  
**Dependencies**: Task 3.2  
**Phase**: Documentation & Cleanup

**Context**:
Create comprehensive AI architecture documentation that explains the hybrid SDK strategy, when to use each SDK, and implementation patterns for future AI features.

**Implementation Steps**:

1. Create documentation file:
   ```bash
   touch /Users/topher/Code/rhizome-v2/docs/AI_DOCUMENTATION.md
   ```

2. Add document structure and content:
   ```markdown
   # AI Architecture Documentation
   
   **Last Updated**: 2025-09-27  
   **Status**: Production  
   **Applies To**: Rhizome V2
   
   ---
   
   ## Overview
   
   Rhizome V2 uses a **hybrid AI SDK strategy** with two complementary libraries:
   
   1. **Native Gemini SDK** (`@google/genai`): Document processing with Files API
   2. **Vercel AI SDK** (`ai` + `@ai-sdk/google`): Embeddings and interactive features
   
   This strategy combines the reliability of Files API for large documents with the flexibility of Vercel AI SDK for modern AI patterns.
   
   ---
   
   ## Decision Rationale
   
   ### Why Hybrid Strategy?
   
   **Native SDK Strengths**:
   - Files API support (critical for >15MB PDFs)
   - Proven reliability for document processing
   - Direct control over upload and validation
   
   **Vercel SDK Strengths**:
   - Cleaner API for embeddings (`embedMany()`)
   - Batch processing built-in
   - Provider flexibility (easy Claude/GPT-4 switching)
   - Better streaming support for future features
   - Excellent TypeScript types
   
   **Why Not Single SDK?**:
   - Vercel AI SDK lacks Files API (15MB base64 limit)
   - Native SDK has awkward embedding API (nested structure)
   - Hybrid approach gets best of both worlds
   
   See: `docs/brainstorming/2025-09-27-hybrid-ai-sdk-strategy.md` for complete decision context.
   
   ---
   
   ## When to Use Each SDK
   
   ### Use Native Gemini SDK (`@google/genai`) For:
   
   ✅ **Document Processing**:
   - PDF extraction (Files API required)
   - Large file uploads (>15MB)
   - Background worker processing pipeline
   
   ✅ **Files API Operations**:
   - Upload PDFs to Gemini
   - Wait for file validation
   - Extract markdown with structured output
   
   **Example**:
   \`\`\`typescript
   import { GoogleGenAI } from '@google/genai'
   
   const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_AI_API_KEY })
   
   // Upload file
   const uploadedFile = await ai.files.upload({
     file: pdfBlob,
     config: { mimeType: 'application/pdf' }
   })
   
   // Process with Files API
   const result = await ai.models.generateContent({
     model: 'gemini-2.0-flash',
     contents: [{
       parts: [
         { fileData: { fileUri: uploadedFile.uri, mimeType: 'application/pdf' }},
         { text: EXTRACTION_PROMPT }
       ]
     }],
     config: {
       responseMimeType: 'application/json',
       responseSchema: DOCUMENT_SCHEMA
     }
   })
   \`\`\`
   
   ---
   
   ### Use Vercel AI SDK (`ai` + `@ai-sdk/google`) For:
   
   ✅ **Embeddings Generation**:
   - All document chunk embeddings
   - Query embeddings for similarity search
   - Batch processing (100-200 chunks at once)
   
   ✅ **Interactive Features** (Future):
   - Document chat with streaming
   - Flashcard generation with AI
   - Synthesis insights and connections
   - Any feature needing streaming responses
   
   ✅ **Provider Flexibility** (Future):
   - Easy switching to Claude/GPT-4
   - Cost optimization experiments
   - Feature-specific model selection
   
   **Example**:
   \`\`\`typescript
   import { google } from '@ai-sdk/google'
   import { embedMany } from 'ai'
   
   // Generate embeddings for chunks
   const { embeddings } = await embedMany({
     model: google.textEmbedding('gemini-embedding-001', {
       outputDimensionality: 768
     }),
     values: chunks.map(c => c.content),
     maxRetries: 3
   })
   
   // Direct access to embeddings array (no nesting)
   console.log(embeddings.length) // Same as chunks.length
   console.log(embeddings[0].length) // 768
   \`\`\`
   
   ---
   
   ## Implementation Patterns
   
   ### Pattern 1: Document Processing (Native SDK)
   
   **File**: `worker/handlers/process-document.ts`  
   **SDK**: `@google/genai`  
   **Use Case**: PDF → Markdown extraction
   
   \`\`\`typescript
   // Upload PDF to Files API
   const uploadedFile = await ai.files.upload({ file: pdfBlob })
   
   // Wait for validation
   let fileState = await ai.files.get({ name: uploadedFile.name })
   while (fileState.state === 'PROCESSING') {
     await sleep(2000)
     fileState = await ai.files.get({ name: uploadedFile.name })
   }
   
   // Extract with structured output
   const result = await ai.models.generateContent({
     model: 'gemini-2.0-flash',
     contents: [{ parts: [{ fileData: {...}}, { text: prompt }]}],
     config: {
       responseMimeType: 'application/json',
       responseSchema: EXTRACTION_SCHEMA
     }
   })
   \`\`\`
   
   ---
   
   ### Pattern 2: Embeddings Generation (Vercel SDK)
   
   **File**: `worker/lib/embeddings.ts`  
   **SDK**: `ai` + `@ai-sdk/google`  
   **Use Case**: Chunk embeddings for similarity search
   
   \`\`\`typescript
   import { generateEmbeddings } from './lib/embeddings.js'
   
   // Batch processing (100 chunks at a time)
   const embeddings = await generateEmbeddings(chunks.map(c => c.content))
   
   // Direct array access (no nested structure)
   for (let i = 0; i < chunks.length; i++) {
     await supabase.from('chunks').insert({
       content: chunks[i].content,
       embedding: embeddings[i]  // Direct assignment
     })
   }
   \`\`\`
   
   ---
   
   ### Pattern 3: Future Streaming Features (Vercel SDK)
   
   **Use Case**: Document chat, flashcard generation  
   **SDK**: `ai` + `@ai-sdk/google`  
   **Status**: Planned (not yet implemented)
   
   \`\`\`typescript
   import { google } from '@ai-sdk/google'
   import { streamText } from 'ai'
   
   // Stream chat responses
   const result = await streamText({
     model: google.generativeAI('gemini-2.0-flash'),
     prompt: `Based on this document chunk: ${chunk.content}\n\nQuestion: ${userQuery}`
   })
   
   // Stream to client
   for await (const text of result.textStream) {
     console.log(text) // Real-time streaming
   }
   \`\`\`
   
   ---
   
   ## Configuration
   
   ### Environment Variables
   
   \`\`\`bash
   # Required for both SDKs (same API key)
   GOOGLE_AI_API_KEY=<your_api_key>
   \`\`\`
   
   ### Model Configuration
   
   | Task | Model | Dimensions | SDK |
   |------|-------|-----------|-----|
   | PDF Extraction | gemini-2.0-flash | N/A | Native |
   | Embeddings | gemini-embedding-001 | 768 | Vercel |
   | Future Chat | gemini-2.0-flash | N/A | Vercel |
   
   ### Rate Limits (Free Tier)
   
   - **Requests Per Minute (RPM)**: 100
   - **Tokens Per Minute (TPM)**: 30,000
   - **Strategy**: 1s delay between embedding batches
   - **Batch Size**: 100 chunks (conservative, max 250)
   
   ---
   
   ## Migration History
   
   ### 2025-09-27: Embeddings Migration
   
   **Changed**: Embeddings generation from native SDK to Vercel AI SDK  
   **Preserved**: Document processing continues using native SDK  
   **Impact**: Zero user impact, internal processing change only  
   **Validation**: Vector equivalence >99.9% confirmed  
   
   **Before** (Native SDK):
   \`\`\`typescript
   const result = await ai.models.embedContent({
     model: 'gemini-embedding-001',
     contents: chunk.content
   })
   const embedding = result.embeddings[0].values // Nested structure
   \`\`\`
   
   **After** (Vercel SDK):
   \`\`\`typescript
   const { embeddings } = await embedMany({
     model: google.textEmbedding('gemini-embedding-001'),
     values: chunks.map(c => c.content)
   })
   const embedding = embeddings[0] // Direct access
   \`\`\`
   
   ---
   
   ## Testing Strategy
   
   ### Vector Equivalence Testing
   
   **Critical**: Embeddings must be equivalent between SDKs (>99.9% similarity)
   
   \`\`\`typescript
   import { cosineSimilarity, generateNativeEmbedding } from './__tests__/utils/vector-utils.js'
   import { generateSingleEmbedding } from './lib/embeddings.js'
   
   const content = 'test content'
   const vercelEmbedding = await generateSingleEmbedding(content)
   const nativeEmbedding = await generateNativeEmbedding(content)
   
   const similarity = cosineSimilarity(vercelEmbedding, nativeEmbedding)
   expect(similarity).toBeGreaterThan(0.999) // Required threshold
   \`\`\`
   
   ### Performance Validation
   
   **Baseline**: ≤2 minutes for 100 chunks  
   **Test**: `worker/__tests__/performance-baseline.ts`
   
   ---
   
   ## Future Features Roadmap
   
   ### Phase 1: Complete ✅
   - PDF document processing (Native SDK)
   - Embeddings generation (Vercel SDK)
   - Similarity search
   
   ### Phase 2: Planned 🚀
   - **Document Chat**: Streaming Q&A with context
   - **Smart Flashcards**: AI-generated from selections
   - **Synthesis Insights**: Cross-document connections
   - **Provider Experiments**: Try Claude/GPT-4 for specific features
   
   ### Phase 3: Future 🔮
   - **Multi-model Strategy**: Different models for different tasks
   - **Cost Optimization**: Provider switching based on cost/quality
   - **Advanced Streaming**: Real-time synthesis generation
   
   ---
   
   ## Troubleshooting
   
   ### Issue: "File too large" error
   **Cause**: Trying to use Vercel SDK for large PDFs  
   **Solution**: Use native SDK with Files API (already implemented)
   
   ### Issue: Embeddings have wrong dimensions
   **Cause**: Model configuration mismatch  
   **Solution**: Verify `outputDimensionality: 768` in config
   
   ### Issue: Rate limit errors
   **Cause**: Too many API calls too quickly  
   **Solution**: Increase delay between batches in `worker/lib/embeddings.ts`
   
   ### Issue: Vector similarity too low (<0.999)
   **Cause**: Model or configuration change  
   **Solution**: Run `worker/__tests__/test-gemini-embedding.ts` to compare SDKs
   
   ---
   
   ## References
   
   ### External Documentation
   - [Vercel AI SDK Embeddings](https://ai-sdk.dev/docs/ai-sdk-core/embeddings)
   - [Google Provider](https://ai-sdk.dev/providers/ai-sdk-providers/google-generative-ai)
   - [Gemini API Docs](https://ai.google.dev/gemini-api/docs)
   - [Gemini Rate Limits](https://ai.google.dev/gemini-api/docs/rate-limits)
   
   ### Internal Documentation
   - Decision rationale: `docs/brainstorming/2025-09-27-hybrid-ai-sdk-strategy.md`
   - Migration PRP: `docs/prps/hybrid-ai-sdk-embeddings-migration.md`
   - Task breakdown: `docs/tasks/hybrid-ai-sdk-embeddings-migration.md`
   
   ---
   
   ## Appendix: API Comparison
   
   ### Embedding Generation
   
   | Aspect | Native SDK | Vercel SDK |
   |--------|-----------|------------|
   | Function | `embedContent()` | `embedMany()` |
   | Batching | Manual (one at a time) | Built-in |
   | Response | `{embeddings: [{values: number[]}]}` | `{embeddings: number[][]}` |
   | Retry | Manual | Built-in (`maxRetries`) |
   | TypeScript | Basic | Excellent |
   | DX | Awkward | Clean |
   
   ### Document Processing
   
   | Aspect | Native SDK | Vercel SDK |
   |--------|-----------|------------|
   | Files API | ✅ Yes | ❌ No (15MB limit) |
   | Large PDFs | ✅ Supported | ❌ Not supported |
   | Structured Output | ✅ JSON schema | ✅ JSON schema |
   | Streaming | Limited | Excellent |
   \`\`\`
   ```

3. Verify markdown formatting:
   ```bash
   # Check for markdown errors
   npx markdownlint docs/AI_DOCUMENTATION.md
   ```

**Acceptance Criteria**:

**Given** the AI documentation guide  
**When** a developer reads it  
**Then**:
- [ ] Hybrid strategy rationale is clear
- [ ] "When to use each SDK" section provides actionable guidance
- [ ] Implementation patterns are complete with examples
- [ ] Migration history documents the change
- [ ] Future roadmap is outlined
- [ ] Troubleshooting section addresses common issues
- [ ] All code examples are syntactically correct
- [ ] Markdown formatting is clean

**Manual Testing Steps**:

1. Read through documentation:
   ```bash
   cat docs/AI_DOCUMENTATION.md
   ```

2. Verify all sections are complete:
   - [ ] Overview
   - [ ] Decision Rationale
   - [ ] When to Use Each SDK
   - [ ] Implementation Patterns (3 patterns)
   - [ ] Configuration
   - [ ] Migration History
   - [ ] Testing Strategy
   - [ ] Future Roadmap
   - [ ] Troubleshooting
   - [ ] References
   - [ ] API Comparison

3. Test code examples (copy-paste into test file):
   ```bash
   # Verify examples are syntactically valid
   ```

**Files Created**:
- `/Users/topher/Code/rhizome-v2/docs/AI_DOCUMENTATION.md`

**Definition of Done**:
- [ ] Documentation created with all sections
- [ ] Code examples verified
- [ ] Markdown formatting correct
- [ ] References accurate
- [ ] Ready for team reference

---

### Task 5.2: Update CLAUDE.md with Hybrid SDK Strategy

**Priority**: High  
**Size**: Small (30 minutes)  
**Dependencies**: Task 5.1  
**Phase**: Documentation & Cleanup

**Context**:
Update the main `CLAUDE.md` file to reference the new hybrid SDK strategy and AI documentation guide. Add clear guidance for when Claude Code (AI assistant) should use each SDK.

**Implementation Steps**:

1. Read current CLAUDE.md:
   ```bash
   cat /Users/topher/Code/rhizome-v2/CLAUDE.md | grep -A 20 "AI SDK"
   ```

2. Locate hybrid SDK section (around lines 193-271):
   ```markdown
   ### Hybrid AI SDK Strategy
   
   **IMPORTANT**: Rhizome uses a **hybrid approach** with two AI SDKs:
   
   1. **Native Gemini SDK (`@google/genai`)**: Document processing with Files API
   2. **Vercel AI SDK (`ai` + `@ai-sdk/google`)**: Embeddings and future interactive features
   ```

3. Update section with migration status:
   ```markdown
   ### Hybrid AI SDK Strategy
   
   **IMPORTANT**: Rhizome uses a **hybrid approach** with two AI SDKs:
   
   1. **Native Gemini SDK (`@google/genai`)**: Document processing with Files API
   2. **Vercel AI SDK (`ai` + `@ai-sdk/google`)**: Embeddings and interactive features
   
   **Migration Status** (as of 2025-09-27):
   - ✅ **Embeddings**: Migrated to Vercel AI SDK (production)
   - ✅ **Document Processing**: Remains on Native SDK (Files API)
   - 🚀 **Future Features**: Will use Vercel AI SDK (chat, flashcards, synthesis)
   
   **Decision Rationale**: Vercel AI SDK lacks Files API support (15MB base64 limit), but provides excellent embeddings API and provider flexibility for future features.
   
   **See Full Documentation**: `docs/AI_DOCUMENTATION.md` for complete guidance on when to use each SDK.
   ```

4. Update the "When to Use Native Gemini SDK" section:
   ```markdown
   #### When to Use Native Gemini SDK
   
   **Use `@google/genai` for**:
   - ✅ Document processing (PDF extraction with Files API)
   - ✅ Large file uploads (>15MB files)
   - ✅ Background worker processing pipeline
   - ❌ **NOT for embeddings** (use Vercel AI SDK instead)
   
   **Why**: Files API required for large PDFs, proven reliability.
   ```

5. Update the "When to Use Vercel AI SDK" section:
   ```markdown
   #### When to Use Vercel AI SDK
   
   **Use `ai` + `@ai-sdk/google` for**:
   - ✅ **ALL embeddings generation** (`embedMany()`) - PRODUCTION
   - ✅ Future interactive features (chat, flashcards, synthesis) - PLANNED
   - ✅ Streaming responses to users - PLANNED
   - ✅ Provider flexibility (easy Claude/GPT-4 switching) - PLANNED
   
   **Why**: Cleaner API, better DX, future-proofing, batch processing.
   ```

6. Add reference to embeddings module:
   ```markdown
   ### Embeddings Implementation
   
   **Module**: `worker/lib/embeddings.ts`  
   **SDK**: Vercel AI SDK (`ai` + `@ai-sdk/google`)  
   **Status**: Production (migrated 2025-09-27)
   
   ```typescript
   import { generateEmbeddings } from './lib/embeddings.js'
   
   // Generate embeddings for chunks (batch processing)
   const embeddings = await generateEmbeddings(chunks.map(c => c.content))
   
   // Direct array access (no nested structure)
   for (let i = 0; i < chunks.length; i++) {
     await supabase.from('chunks').insert({
       content: chunks[i].content,
       embedding: embeddings[i]  // Direct assignment
     })
   }
   ```
   
   **Key Features**:
   - Batch processing (100 chunks per API call)
   - Automatic rate limiting (1s delay between batches)
   - Dimension validation (768 dimensions)
   - Retry logic (3 attempts with exponential backoff)
   
   **For complete documentation**: See `docs/AI_DOCUMENTATION.md`
   ```

7. Verify changes don't break existing content:
   ```bash
   # Check for markdown errors
   npx markdownlint CLAUDE.md
   ```

**Acceptance Criteria**:

**Given** the updated CLAUDE.md  
**When** Claude Code reads it  
**Then**:
- [ ] Hybrid SDK strategy is clearly documented
- [ ] Migration status is current (2025-09-27)
- [ ] "When to use each SDK" guidance is actionable
- [ ] Reference to AI_DOCUMENTATION.md is prominent
- [ ] Embeddings implementation is documented
- [ ] Code examples are correct
- [ ] No markdown formatting errors
- [ ] Existing content is preserved

**Manual Testing Steps**:

1. Read updated sections:
   ```bash
   cat CLAUDE.md | grep -A 50 "Hybrid AI SDK"
   ```

2. Verify cross-references work:
   ```bash
   # Check that referenced files exist
   ls -la docs/AI_DOCUMENTATION.md
   ls -la worker/lib/embeddings.ts
   ls -la docs/brainstorming/2025-09-27-hybrid-ai-sdk-strategy.md
   ```

3. Check for broken links:
   ```bash
   # Verify all referenced paths are correct
   grep -o 'docs/[^)]*' CLAUDE.md
   ```

**Files Modified**:
- `/Users/topher/Code/rhizome-v2/CLAUDE.md`

**Lines Modified**: Approximately 80 lines (hybrid SDK section)

**Definition of Done**:
- [ ] CLAUDE.md updated with migration status
- [ ] References to AI_DOCUMENTATION.md added
- [ ] Embeddings implementation documented
- [ ] No markdown errors
- [ ] Cross-references verified

---

### Task 5.3: Clean Test Documents and Prepare for Production

**Priority**: Medium  
**Size**: Small (30 minutes)  
**Dependencies**: Task 4.2  
**Phase**: Documentation & Cleanup

**Context**:
Clean out test and development documents from the database and storage to ensure a fresh start with the new embeddings implementation. This is a greenfield project with no production data, so we can safely clean everything.

**Implementation Steps**:

1. Create cleanup script:
   ```bash
   touch /Users/topher/Code/rhizome-v2/worker/__tests__/cleanup-test-data.ts
   ```

2. Implement cleanup script:
   ```typescript
   import { createClient } from '@supabase/supabase-js'
   
   /**
    * Cleanup test and development documents.
    * 
    * WARNING: This deletes ALL documents and chunks for dev-user-123.
    * Only run in development environment.
    */
   
   const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321'
   const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
   
   const supabase = createClient(supabaseUrl, supabaseKey)
   
   async function cleanupTestData() {
     console.log('=== Cleanup Test Documents ===\n')
     
     const userId = 'dev-user-123' // Hardcoded dev user
     
     // Get all documents for dev user
     const { data: documents, error: docError } = await supabase
       .from('documents')
       .select('id, title, storage_path')
       .eq('user_id', userId)
     
     if (docError) {
       console.error('Error fetching documents:', docError)
       return
     }
     
     console.log(`Found ${documents?.length || 0} documents to clean up\n`)
     
     if (!documents || documents.length === 0) {
       console.log('No documents to clean up')
       return
     }
     
     // Delete each document
     for (const doc of documents) {
       console.log(`Cleaning up: ${doc.title}`)
       
       // Delete chunks (cascades via foreign key)
       const { error: chunkError } = await supabase
         .from('chunks')
         .delete()
         .eq('document_id', doc.id)
       
       if (chunkError) {
         console.error(`  ❌ Error deleting chunks:`, chunkError)
         continue
       }
       
       // Delete storage files
       try {
         // List files in storage path
         const { data: files } = await supabase.storage
           .from('documents')
           .list(doc.storage_path)
         
         if (files && files.length > 0) {
           const filePaths = files.map(f => `${doc.storage_path}/${f.name}`)
           await supabase.storage
             .from('documents')
             .remove(filePaths)
           
           console.log(`  ✅ Deleted ${files.length} storage files`)
         }
       } catch (storageError) {
         console.error(`  ⚠️  Storage cleanup warning:`, storageError)
       }
       
       // Delete document record
       const { error: docDeleteError } = await supabase
         .from('documents')
         .delete()
         .eq('id', doc.id)
       
       if (docDeleteError) {
         console.error(`  ❌ Error deleting document:`, docDeleteError)
       } else {
         console.log(`  ✅ Document deleted`)
       }
     }
     
     // Verify cleanup
     const { data: remainingDocs } = await supabase
       .from('documents')
       .select('id')
       .eq('user_id', userId)
     
     const { data: remainingChunks } = await supabase
       .from('chunks')
       .select('id')
       .limit(1)
     
     console.log('\n=== Cleanup Summary ===')
     console.log(`Remaining documents: ${remainingDocs?.length || 0}`)
     console.log(`Remaining chunks: ${remainingChunks?.length || 0}`)
     console.log('✅ Cleanup complete')
   }
   
   cleanupTestData()
   ```

3. Run cleanup script:
   ```bash
   cd worker
   npx tsx __tests__/cleanup-test-data.ts
   ```

4. Verify cleanup:
   ```sql
   -- Connect to Supabase
   -- Verify tables are clean
   SELECT COUNT(*) FROM documents WHERE user_id = 'dev-user-123';
   SELECT COUNT(*) FROM chunks;
   ```

5. Document cleanup in migration notes:
   ```bash
   echo "2025-09-27: Cleaned test data after embeddings migration" >> docs/CHANGELOG.md
   ```

**Acceptance Criteria**:

**Given** the cleanup script  
**When** I run it in development environment  
**Then**:
- [ ] All documents for dev-user-123 are deleted
- [ ] All chunks are deleted (cascades)
- [ ] All storage files are removed
- [ ] Database tables are empty for dev user
- [ ] Script provides clear output
- [ ] No errors during cleanup
- [ ] Ready for fresh production data

**Manual Testing Steps**:

1. Check before cleanup:
   ```sql
   SELECT COUNT(*) as doc_count FROM documents WHERE user_id = 'dev-user-123';
   SELECT COUNT(*) as chunk_count FROM chunks;
   ```

2. Run cleanup:
   ```bash
   cd worker
   npx tsx __tests__/cleanup-test-data.ts
   ```

3. Verify after cleanup:
   ```sql
   SELECT COUNT(*) as doc_count FROM documents WHERE user_id = 'dev-user-123';
   -- Expected: 0
   
   SELECT COUNT(*) as chunk_count FROM chunks;
   -- Expected: 0
   ```

4. Check storage is clean:
   ```bash
   # Via Supabase dashboard: Storage > documents > dev-user-123/
   # Expected: Empty or no directory
   ```

**Files Created**:
- `/Users/topher/Code/rhizome-v2/worker/__tests__/cleanup-test-data.ts`

**Files Modified**:
- `/Users/topher/Code/rhizome-v2/docs/CHANGELOG.md` (add cleanup note)

**Definition of Done**:
- [ ] Cleanup script created
- [ ] Script runs successfully
- [ ] All test data removed
- [ ] Database verified clean
- [ ] Storage verified clean
- [ ] Cleanup documented

---

## Risk Register

### Risk 1: Vector Quality Degradation
**Likelihood**: Low  
**Impact**: High (breaks similarity search)  
**Status**: Mitigated

**Mitigation Strategy**:
- Comprehensive vector equivalence testing (Task 2.2, Task 4.1)
- Threshold: >0.999 similarity required
- Dimension validation before database insertion
- Test documents preserved for regression testing

**Rollback Plan**:
- Revert handler changes (Task 3.1)
- Re-run processing with native SDK
- Vector equivalence test provides confidence

---

### Risk 2: Rate Limiting on Free Tier
**Likelihood**: Medium (100 RPM limit)  
**Impact**: Medium (processing failures)  
**Status**: Mitigated

**Mitigation Strategy**:
- Conservative batch processing (100 chunks, under 250 limit)
- 1-second delays between batches (Task 2.1)
- Built-in retry logic (maxRetries: 3)
- Token usage monitoring in logs

**Contingency Plan**:
- Increase delays between batches
- Reduce batch size if needed
- Upgrade to paid tier if necessary

---

### Risk 3: Performance Regression
**Likelihood**: Low  
**Impact**: Medium (slower processing)  
**Status**: Monitored

**Mitigation Strategy**:
- Performance baseline testing (Task 4.2)
- Requirement: ≤2 minutes for 100 chunks
- Batch processing should improve performance
- Fallback: Optimize batch size and delays

**Expected Outcome**: Similar or better performance (batch processing advantage)

---

### Risk 4: Integration Bugs
**Likelihood**: Low  
**Impact**: High (processing failures)  
**Status**: Mitigated

**Mitigation Strategy**:
- Comprehensive integration testing (Task 3.2)
- Full document processing pipeline test
- Similarity search validation
- Error handling preserved from original implementation

**Rollback Plan**: Revert Task 3.1 changes, resume with native SDK

---

## Critical Path Analysis

```
Task 1.1 (Install Dependencies)
    ↓
Task 1.2 (Create Module) ← Task 1.3 (Test Utils)
    ↓                           ↓
Task 2.1 (Implementation) ←――――┘
    ↓
Task 2.2 (Test Suite)
    ↓
Task 3.1 (Handler Integration) ←― CRITICAL MILESTONE
    ↓
Task 3.2 (Integration Test)
    ↓
Task 4.1 (Update Test) ← Task 4.2 (Performance)
    ↓                         ↓
Task 5.1 (Documentation) ←――――┘
    ↓
Task 5.2 (CLAUDE.md)
    ↓
Task 5.3 (Cleanup) ←――――――――― PRODUCTION READY
```

**Critical Path Tasks** (Must complete in order):
1. Task 1.1: Install Dependencies
2. Task 1.2: Create Module Skeleton
3. Task 2.1: Implement Batch Embeddings
4. Task 2.2: Create Test Suite
5. Task 3.1: Update Handler (CRITICAL - Production Impact)
6. Task 3.2: Integration Testing
7. Task 5.3: Production Cleanup

**Parallel Opportunities**:
- Task 1.3 (Test Utils) can start after Task 1.2
- Task 4.1 & 4.2 (Validation) can run in parallel after Task 3.2
- Task 5.1 & 5.2 (Documentation) can run in parallel after Task 4.x

**Estimated Critical Path Duration**: 6-8 hours

---

## Implementation Recommendations

### Team Structure
**Recommended**: Single developer (consistency, small scope)  
**Alternative**: Pair programming for Task 3.1 (critical handler integration)

**Skill Requirements**:
- TypeScript proficiency
- Node.js worker patterns
- API integration experience
- Testing mindset (vector equivalence critical)

---

### Task Sequencing Strategy

**Day 1** (4-5 hours):
1. Morning: Tasks 1.1-1.3 (Foundation Setup)
2. Afternoon: Task 2.1 (Core Implementation)
3. End of day: Task 2.2 (Test Suite)

**Day 2** (3-4 hours):
1. Morning: Task 3.1 (Handler Integration) ← CRITICAL
2. Late morning: Task 3.2 (Integration Testing)
3. Afternoon: Tasks 4.1, 4.2, 5.1, 5.2 (Validation & Docs)
4. End of day: Task 5.3 (Cleanup & Production Ready)

**Alternative: Compressed Schedule** (Single day, 8 hours):
- Experienced developer can complete in one focused session
- Skip Tasks 4.1, 4.2 (validation) for faster delivery
- Run Tasks 5.1, 5.2 (documentation) async

---

### Parallelization Opportunities

**Can Run in Parallel**:
- Task 1.3 (Test Utils) + Task 2.1 (Implementation) - Different files
- Task 4.1 (Update Test) + Task 4.2 (Performance) - Independent validation
- Task 5.1 (AI Docs) + Task 5.2 (CLAUDE.md) - Different documentation

**Cannot Parallelize** (Dependencies):
- Tasks 1.1 → 1.2 → 2.1 → 3.1 (Critical path, must be sequential)
- Task 2.2 requires Task 2.1 complete (needs working implementation)
- Task 3.2 requires Task 3.1 complete (needs integrated handler)

**Time Savings**: 1-2 hours if parallelized effectively

---

### Resource Allocation

**Development Time**: 8-12 hours total
- Foundation (Tasks 1.x): 2-3 hours
- Implementation (Tasks 2.x): 3-4 hours
- Integration (Tasks 3.x): 2-3 hours
- Validation (Tasks 4.x): 1-2 hours
- Documentation (Tasks 5.x): 1-2 hours

**Testing Time**: Included in each task (unit + integration)

**Buffer**: 20% (2-3 hours) for unexpected issues

---

## Final Validation Checklist

**Before Marking Complete**:

### Functional Requirements
- [ ] All tests pass: `cd worker && npm test`
- [ ] No linting errors: `npm run lint`
- [ ] No type errors: `npx tsc --noEmit`
- [ ] Build succeeds: `npm run build`

### Embeddings Validation
- [ ] Vector dimensions: All 768
- [ ] Vector equivalence: >0.999 similarity with native SDK
- [ ] Batch processing: Handles 1-250 chunks correctly
- [ ] Database integration: Chunks inserted with embeddings

### Performance Requirements
- [ ] Processing time: ≤ baseline (~2 min for 100 chunks)
- [ ] No rate limit errors during normal operation
- [ ] Memory usage stable (no leaks)
- [ ] Progress updates work correctly

### Integration Testing
- [ ] Full document processing works end-to-end
- [ ] Similarity search returns relevant results
- [ ] match_chunks RPC works correctly
- [ ] Error handling preserves friendly messages

### Documentation
- [ ] AI_DOCUMENTATION.md created and complete
- [ ] CLAUDE.md updated with migration status
- [ ] Code comments and JSDoc complete
- [ ] Test documents cleaned from database

### Production Readiness
- [ ] Dependencies declared in worker/package.json
- [ ] Environment variables documented
- [ ] Rollback plan documented
- [ ] No test/debug code in production paths

---

## Success Metrics

### Functional Success
- ✅ **Correctness**: 100% of embeddings have 768 dimensions
- ✅ **Equivalence**: Vector similarity with native SDK >0.999
- ✅ **Integration**: 100% success rate for database insertion
- ✅ **Search**: Similarity search returns relevant results

### Performance Success
- ✅ **Speed**: Processing time ≤ current baseline
- ✅ **Efficiency**: Batch processing reduces API calls by ~10x
- ✅ **Reliability**: >95% success rate (no rate limit errors)
- ✅ **Memory**: Stable memory usage during processing

### Quality Success
- ✅ **Tests**: 100% test pass rate
- ✅ **Linting**: Zero linting errors
- ✅ **Types**: Zero TypeScript errors
- ✅ **Documentation**: Complete and accurate

---

## Conclusion

This migration represents a strategic shift to a hybrid AI SDK architecture that balances reliability (native SDK for document processing) with flexibility (Vercel SDK for embeddings and future features).

**Key Outcomes**:
1. Cleaner embeddings API (no nested structure)
2. Batch processing efficiency (10x fewer API calls)
3. Foundation for interactive features (chat, flashcards, synthesis)
4. Provider flexibility for future optimization

**Risk Assessment**: **LOW** - Stateless embeddings, comprehensive testing, easy rollback

**Confidence**: **9/10** - Clear requirements, proven patterns, well-mitigated risks

**Ready for Implementation**: ✅ YES