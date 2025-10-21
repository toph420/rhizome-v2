# TypeScript Cleanup & Codebase Organization

## Overview

Comprehensive cleanup of TypeScript errors and obsolete code across both main app and worker module. Fixes 150+ type errors stemming from incomplete refactoring (7-engine → 3-engine system, class-based → functional architecture) and removes 43 obsolete test/script files totaling ~4,500 lines of dead code.

## Current State Analysis

### Type Error Summary
- **Main App (src/)**: ~80 TypeScript errors
- **Worker Module (worker/)**: ~70 TypeScript errors
- **Root Cause**: Incomplete refactoring from 7-engine to 3-engine connection detection system
- **Secondary Cause**: Next.js 15 async API changes not fully migrated

### Key Discoveries:

**Main App Issues:**
- `src/lib/annotations/mock-connections.ts:33-573` - 53 errors from obsolete engine types (`'semantic'`, `'thematic'`, `'structural'`, `'contradiction'`, `'emotional'`, `'methodological'`, `'temporal'`)
- `src/app/actions/preferences.ts:20,66` - Async cookies API not awaited (Next.js 15 breaking change)
- `src/lib/ecs/annotations.ts` - Missing `AnnotationEntity` type export, breaks `src/hooks/useAnnotations.ts:15`
- `src/app/test-annotations/page.tsx:30,57` - Uses `chunkId: string` instead of `chunkIds: string[]`
- `src/types/annotations.ts` - Missing `TextContext` type definition

**Worker Issues:**
- `worker/engines/*.ts` - All 3 engines missing `reprocessingBatch?: string` in config interfaces
- `worker/handlers/readwise-import.ts:16` - Imports `FuzzyMatchResult` from wrong location (should be `../lib/fuzzy-matching.js`)
- `worker/handlers/readwise-import.ts:460` - References non-existent `ReadwiseReaderClient` (should be `ReadwiseExportClient`)
- `worker/engines/orchestrator.ts:97,102` - Progress callback signature mismatch (required vs optional `details` parameter)
- `worker/benchmarks/*.ts` - Import class-based engines that were refactored to functional exports

**Obsolete Files (43 total, ~4,500 lines):**
- 8 root-level `test-*.ts` files - Manual CLI scripts duplicating jest test suite
- 8 phase validation files - Legacy from completed development phases
- 8 debugging/utility scripts - One-off fixes from past issues
- 3 old test runners - Superseded by jest
- 1 shell wrapper - Has TypeScript equivalent
- 1 scoring integration file - Old implementation
- 14 experimental scripts - Reference value but clutter main repo

### Pattern Analysis:
The codebase went through major architectural changes but references weren't fully updated:
1. **7 engines → 3 engines** (Semantic Similarity 25%, Contradiction Detection 40%, Thematic Bridge 35%)
2. **Class-based → Functional** (Engines now export functions, not classes)
3. **Next.js 14 → 15** (Async cookies, updated React patterns)

## Desired End State

**Zero TypeScript Errors:**
```bash
npx tsc --noEmit                           # Main app: 0 errors
cd worker && npx tsc --noEmit              # Worker: 0 errors
```

**Clean File Organization:**
- All obsolete test files removed or archived
- No root-level `test-*.ts` files in worker/
- Scripts directory organized and documented
- Only actively-used code in main directories

**Verification:**
```bash
npm test                                   # All tests pass
cd worker && npm test                      # Worker tests pass
git status                                 # Clean working tree (after commits)
```

## Rhizome Architecture

- **Module**: Both (Main App + Worker)
- **Storage**: No storage changes
- **Migration**: No (type fixes and file cleanup only)
- **Test Tier**: Stable (fix test type errors, don't break functionality)
- **Pipeline Stages**: None directly affected (cleanup only)
- **Engines**: All 3 (type fixes for Semantic, Contradiction, Thematic)

## What We're NOT Doing

- **NOT** refactoring architecture or changing functionality
- **NOT** updating database schema (no migrations)
- **NOT** modifying design components in `src/components/design/` (intentional playground)
- **NOT** changing connection engine logic or weights
- **NOT** removing Python scripts (all actively used via IPC)
- **NOT** touching benchmark files that are referenced in package.json scripts

## Implementation Approach

**Strategy**: Fix critical type errors first (quick wins), then organize codebase, validate incrementally.

**4 Phases**:
1. **Critical Type Fixes (Main App)** - 55+ errors fixed in ~45 min
2. **Critical Type Fixes (Worker)** - 20+ errors fixed in ~1 hour
3. **Test Files & Implicit Types** - 50+ errors fixed in ~2 hours
4. **File Organization & Cleanup** - Remove 43 obsolete files in ~1 hour

**Total Time**: 5-6 hours of focused work

---

## Phase 1: Critical Type Errors (Main App)

### Overview
Fix the 5 critical type issues in main app that account for 60+ TypeScript errors. Focus on quick wins: engine type updates (53 errors), async API migration (2 errors), and missing exports (5 errors).

### Changes Required:

#### 1. Update Engine Types in Mock Connections

**File**: `src/lib/annotations/mock-connections.ts`

**Changes**: Replace 53 instances of obsolete engine types with current 3-engine system.

**Find & Replace Operations**:
```typescript
// Replace old engine types with new ones
'semantic' → 'semantic_similarity'         // 7 instances
'thematic' → 'thematic_bridge'             // 7 instances
'structural' → 'contradiction_detection'    // 7 instances (structural analysis now handled by contradiction)
'contradiction' → 'contradiction_detection' // 7 instances
'emotional' → 'thematic_bridge'            // 7 instances (emotional context in thematic)
'methodological' → 'thematic_bridge'       // 7 instances (methodology patterns in thematic)
'temporal' → 'thematic_bridge'             // 7 instances (temporal connections in thematic)
```

**Verification**: Check that all mock connections use only: `'semantic_similarity'`, `'thematic_bridge'`, `'contradiction_detection'`

#### 2. Fix Async Cookies API

**File**: `src/app/actions/preferences.ts`

**Changes**: Update to Next.js 15 async cookies API.

```typescript
// OLD (line 20):
const cookieStore = cookies()
const supabase = createServerClient(/* ... */)

// NEW:
const cookieStore = await cookies()
const supabase = createServerClient(/* ... */)
```

**Also update function signature**:
```typescript
// Make function async
export async function getSupabaseAdmin() {
  const cookieStore = await cookies()
  // ...
}
```

**Fix type assertion** (line 66-67):
```typescript
// Add type assertion for Supabase response
const { data, error } = await supabase
  .from('user_preferences')
  .select('*')
  .single()

if (error || !data) return null
return data as UserPreferences  // Add explicit type
```

#### 3. Export Missing ECS Type

**File**: `src/lib/ecs/annotations.ts`

**Changes**: Export the `AnnotationEntity` type that's used in hooks.

```typescript
// Add to exports at bottom of file
export type { AnnotationEntity } from './components'
```

**Verification**: Check that type is properly defined in `src/lib/ecs/components.ts`

#### 4. Fix Test Annotations Parameters

**File**: `src/app/test-annotations/page.tsx`

**Changes**: Update from `chunkId` (string) to `chunkIds` (array).

```typescript
// Line 30 - OLD:
{
  text: "Test annotation",
  chunkId: testChunk.id,  // ❌ Wrong
  // ...
}

// NEW:
{
  text: "Test annotation",
  chunkIds: [testChunk.id],  // ✅ Correct (array)
  // ...
}

// Line 57 - Same change needed
```

#### 5. Add TextContext Type Definition

**File**: `src/types/annotations.ts`

**Changes**: Add missing `TextContext` type.

```typescript
// Add type definition
export interface TextContext {
  before: string
  content: string
  after: string
}
```

**Usage**: Already referenced in `src/lib/annotations/text-range.ts:6`

#### 6. Fix Text Range Return Type

**File**: `src/lib/annotations/text-range.ts`

**Changes**: Update return object to use array form.

```typescript
// Line 64 - OLD:
return {
  startOffset: range.start,
  endOffset: range.end,
  chunkId: chunkId,  // ❌ Wrong property name
}

// NEW:
return {
  startOffset: range.start,
  endOffset: range.end,
  chunkIds: [chunkId],  // ✅ Correct (array)
}
```

### Success Criteria:

#### Automated Verification:
- [ ] Type check passes: `npx tsc --noEmit src/lib/annotations/mock-connections.ts`
- [ ] Type check passes: `npx tsc --noEmit src/app/actions/preferences.ts`
- [ ] Type check passes: `npx tsc --noEmit src/lib/ecs/annotations.ts`
- [ ] Type check passes: `npx tsc --noEmit src/app/test-annotations/page.tsx`
- [ ] Type check passes: `npx tsc --noEmit src/types/annotations.ts`
- [ ] Full type check: `npx tsc --noEmit` (main app should have <30 errors remaining)

#### Manual Verification:
- [ ] Mock connections still return valid engine types
- [ ] Server actions can access cookies properly
- [ ] Test annotation page works (if manually tested)

**Implementation Note**: Run type check after each file fix to verify error reduction. Commit working state before Phase 2.

---

## Phase 2: Critical Type Errors (Worker)

### Overview
Fix critical worker module type errors: missing config properties (4 files), broken imports (2 issues), and callback signature mismatches. These fixes are independent and can be done in any order.

### Changes Required:

#### 1. Add reprocessingBatch to Engine Configs

**Files**:
- `worker/engines/semantic-similarity.ts`
- `worker/engines/contradiction-detection.ts`
- `worker/engines/thematic-bridge.ts`
- `worker/engines/thematic-bridge-qwen.ts`

**Changes**: Add missing property to config interfaces.

**For each file, update the config interface**:

```typescript
// semantic-similarity.ts - Add to SemanticSimilarityConfig
export interface SemanticSimilarityConfig {
  minScore?: number
  maxConnections?: number
  batchSize?: number
  reprocessingBatch?: string  // ✅ ADD THIS
}

// contradiction-detection.ts - Add to ContradictionDetectionConfig
export interface ContradictionDetectionConfig {
  minConfidence?: number
  maxConnections?: number
  batchSize?: number
  reprocessingBatch?: string  // ✅ ADD THIS
}

// thematic-bridge.ts - Add to ThematicBridgeConfig
export interface ThematicBridgeConfig {
  minRelevance?: number
  maxConnections?: number
  batchSize?: number
  reprocessingBatch?: string  // ✅ ADD THIS
}

// thematic-bridge-qwen.ts - Add to ThematicBridgeConfig (if different interface)
export interface ThematicBridgeConfig {
  minRelevance?: number
  maxConnections?: number
  batchSize?: number
  reprocessingBatch?: string  // ✅ ADD THIS
}
```

**Code using this property** (examples):
- `semantic-similarity.ts:79-80`
- `contradiction-detection.ts:61-62`
- `thematic-bridge.ts:78-79`
- `thematic-bridge-qwen.ts:69-70`

#### 2. Fix FuzzyMatchResult Import

**File**: `worker/handlers/readwise-import.ts`

**Changes**: Import from correct location.

```typescript
// Line 16 - OLD:
import type { FuzzyMatchResult } from '../types/recovery.js'  // ❌ Not exported there

// NEW:
import type { FuzzyMatchResult } from '../lib/fuzzy-matching.js'  // ✅ Correct location
```

**Verification**: Check that `FuzzyMatchResult` is exported from `worker/lib/fuzzy-matching.ts`

#### 3. Fix ReadwiseReaderClient Reference

**File**: `worker/handlers/readwise-import.ts`

**Changes**: Use correct class name.

```typescript
// Line 460 - OLD:
const client = new ReadwiseReaderClient(apiKey)  // ❌ Doesn't exist

// NEW:
const client = new ReadwiseExportClient(apiKey)  // ✅ Correct class
```

**Verification**: Confirm `ReadwiseExportClient` is defined in `worker/lib/readwise-export-api.ts`

#### 4. Fix Optional Details Parameter

**File**: `worker/engines/orchestrator.ts`

**Changes**: Make `details` parameter optional in callback signature.

```typescript
// Lines 97, 102 - Update callback type
type ProgressCallback = (
  percent: number,
  stage: string,
  details?: string  // ✅ Make optional
) => Promise<void>

// When calling semantic similarity engine:
await runSemanticSimilarity(
  chunks,
  semanticConfig,
  async (percent, stage, details) => {  // Details is now correctly optional
    await progressCallback?.(percent, stage, details)
  }
)

// Same for contradiction and thematic engines
```

#### 5. Handle Possibly Undefined Values

**File**: `worker/engines/thematic-bridge.ts`

**Changes**: Add null checks for `rawText`.

```typescript
// Line 193 - Add null check:
if (!rawText) {
  throw new Error('rawText is required for thematic bridge analysis')
}
const analysis = await analyzeBridge(rawText, /* ... */)

// Lines 213-214 - rawText already validated above, safe to use
```

**File**: `worker/engines/base-engine.ts`

**Changes**: Add default value for minScore.

```typescript
// Line 146 - Add default:
const minScore = config.minScore ?? 0.5  // Default if undefined
if (connection.strength < minScore) continue
```

### Success Criteria:

#### Automated Verification:
- [ ] Type check: `cd worker && npx tsc --noEmit engines/semantic-similarity.ts`
- [ ] Type check: `cd worker && npx tsc --noEmit engines/contradiction-detection.ts`
- [ ] Type check: `cd worker && npx tsc --noEmit engines/thematic-bridge.ts`
- [ ] Type check: `cd worker && npx tsc --noEmit handlers/readwise-import.ts`
- [ ] Type check: `cd worker && npx tsc --noEmit engines/orchestrator.ts`
- [ ] Full worker type check: `cd worker && npx tsc --noEmit` (<40 errors remaining)

#### Manual Verification:
- [ ] Engines still function correctly (config property is optional)
- [ ] Readwise import handler can instantiate client

**Implementation Note**: Commit after each subsection (engines, imports, callbacks) for clean history.

---

## Phase 3: Test Files & Implicit Types

### Overview
Fix remaining type errors in test files and add explicit types to implicit `any` parameters. Most errors are in test mocks and handler tests. These are lower priority but should be fixed for type safety.

### Changes Required:

#### 1. Fix Test Mock Types (Never Errors)

**Affected Files**:
- `worker/__tests__/multi-format-integration.test.ts` (6 errors)
- `worker/__tests__/storage-export.test.ts` (10 errors)
- `worker/__tests__/youtube-metadata-enhancement.test.ts` (5 errors)

**Root Cause**: Mock returns typed as `never` instead of proper types.

**Pattern to Fix**:

```typescript
// Example from storage-export.test.ts:68

// OLD:
vi.mocked(supabase.storage.from).mockReturnValue({
  upload: vi.fn().mockResolvedValue({ error: null })
} as never)  // ❌ Cast to never breaks types

// NEW:
vi.mocked(supabase.storage.from).mockReturnValue({
  upload: vi.fn().mockResolvedValue({
    data: { path: 'test.pdf' },
    error: null
  })
} as any)  // ✅ Use any for complex Supabase types in tests
```

**Apply pattern to all mock setup blocks** - search for `as never` and replace with proper mock data structure.

#### 2. Fix chunker_type Missing in Test Data

**File**: `worker/handlers/__tests__/import-document.test.ts`

**Changes**: Add required `chunker_type` property to all test chunk data.

```typescript
// Lines 72, 79, 129, 185, 244-245, 306, 400

// OLD:
const testChunk = {
  content: "test content",
  chunk_index: 0,
  themes: [],
  importance_score: 0.5,
}

// NEW:
const testChunk = {
  content: "test content",
  chunk_index: 0,
  themes: [],
  importance_score: 0.5,
  chunker_type: 'recursive',  // ✅ Add this (matches ChunkExportData interface)
}
```

#### 3. Fix Property Naming in Tests

**File**: `worker/__tests__/youtube-metadata-enhancement.test.ts`

**Changes**: Use camelCase consistently (project convention for JSONB).

```typescript
// Line 227 - OLD:
{
  content: "test",
  position_context: { /* ... */ },  // ❌ snake_case
}

// NEW:
{
  content: "test",
  positionContext: { /* ... */ },  // ✅ camelCase
}

// Line 285 - Remove invalid property:
// Remove 'content' from AIChunkMetadata (not in interface)
```

#### 4. Add Explicit Types to Parameters

**Files with implicit any**:
- `worker/handlers/recover-annotations.ts:47,83,258` - parameter `c`
- `worker/handlers/recover-sparks.ts:75,88,103-105` - parameters `c`
- `worker/handlers/remap-connections.ts:52,83,101,112` - parameters `chunk`, `conn`, `c`
- `worker/handlers/__tests__/reprocess-connections.test.ts:136,371,378,395,398` - callback parameters
- `worker/benchmarks/semantic-engine-benchmark.ts:197` - parameters `sum`, `r`
- `worker/engines/semantic-similarity.ts:136,146` - parameter `m`
- `src/components/sidebar/AnnotationReviewTab.tsx:97,137,167,178,189,212,215,226,353,524` - various parameters

**Pattern**:

```typescript
// Example from recover-annotations.ts:47

// OLD:
chunks.filter(c => c.is_current)  // ❌ Implicit any

// NEW:
chunks.filter((c: Chunk) => c.is_current)  // ✅ Explicit type

// For complex cases, extract type:
type ChunkWithMetadata = Chunk & { metadata: AIChunkMetadata }
chunks.filter((c: ChunkWithMetadata) => /* ... */)
```

**Strategy**:
1. Find type from context (parameter comes from typed array/object)
2. Add inline type annotation
3. For callbacks, infer from parent function signature

#### 5. Add Null Checks for Refs

**File**: `src/components/reader/QuickSparkCapture.tsx`

**Changes**: Add null check before accessing ref.

```typescript
// Line 130 - OLD:
textareaRef.current.focus()  // ❌ Possibly null

// NEW:
textareaRef.current?.focus()  // ✅ Optional chaining
```

#### 6. Fix WeightConfig Import Conflict

**File**: `src/components/preferences/WeightConfig.tsx`

**Changes**: Use type-only import for conflicting name.

```typescript
// Line 27 - OLD:
import { WeightConfig } from '@/types/preferences'  // ❌ Conflicts with component name

// NEW:
import type { WeightConfig as WeightConfigType } from '@/types/preferences'  // ✅ Type-only import with alias

// Update usage in component:
const config: WeightConfigType = { /* ... */ }
```

#### 7. Fix Test Function Call Arguments

**Files**:
- `worker/__tests__/storage-export.test.ts:490` - Missing argument
- `worker/handlers/__tests__/reprocess-connections.test.ts:76` - Missing argument

```typescript
// storage-export.test.ts:490 - Add required argument
// Check function signature and add missing parameter

// reprocess-connections.test.ts:76 - Same pattern
```

### Success Criteria:

#### Automated Verification:
- [ ] Main app type check: `npx tsc --noEmit` (0 errors)
- [ ] Worker type check: `cd worker && npx tsc --noEmit` (0 errors)
- [ ] Tests pass: `npm test` (main app)
- [ ] Worker tests pass: `cd worker && npm test`
- [ ] Linting: `npm run lint` (both modules)

#### Manual Verification:
- [ ] All test suites run without type errors
- [ ] No regression in test coverage
- [ ] Mock types accurately reflect real implementations

**Implementation Note**: Run tests frequently during this phase to catch any broken mocks early.

---

## Phase 4: File Organization & Cleanup

### Overview
Remove or archive 43 obsolete files identified in worker module. Organize remaining scripts with documentation. This phase has zero risk since files have no cross-references.

### Changes Required:

#### 1. Delete Root-Level Test Files (8 files)

**Files to DELETE**:
```bash
worker/test-orchestrator.ts
worker/test-annotation-recovery.ts
worker/test-semantic-similarity.ts
worker/test-thematic-bridge.ts
worker/test-contradiction-detection.ts
worker/test-reprocess-pipeline.ts
worker/test-fuzzy-matching.ts
worker/test-cleanup-prompt.ts
```

**Rationale**: Manual CLI scripts that duplicate jest test suite functionality. Zero imports from other code. Not referenced in package.json scripts.

**Command**:
```bash
cd /Users/topher/Code/rhizome-v2-worktree-1/worker
rm test-*.ts
```

#### 2. Delete Phase Validation Files (8 files)

**Files to DELETE**:
```bash
worker/tests/phase-2-validation.ts
worker/tests/phase-4-validation.ts
worker/tests/phase-6-validation.ts
worker/tests/phase-7-validation.ts
worker/tests/phase-8-validation.ts
worker/tests/phase-9-validation.ts
worker/tests/phase-10-validation.ts
worker/tests/scoring-integration.ts
```

**Rationale**: Legacy validation from completed development phases. Superseded by proper jest test suites.

**Command**:
```bash
cd /Users/topher/Code/rhizome-v2-worktree-1/worker/tests
rm phase-*-validation.ts scoring-integration.ts
```

#### 3. Delete Debugging/Utility Scripts (8 files)

**Files to DELETE**:
```bash
worker/scripts/check-annotations.ts
worker/scripts/check-connection-batching.ts
worker/scripts/check-connection-query.ts
worker/scripts/check-n-plus-one.ts
worker/scripts/debug-connection-data.ts
worker/scripts/find-readwise-book.ts
worker/scripts/fix-document-status.ts
worker/scripts/restore-chunks.ts
```

**Rationale**: One-off debugging tools from specific past issues. No longer needed.

**Command**:
```bash
cd /Users/topher/Code/rhizome-v2-worktree-1/worker/scripts
rm check-*.ts debug-connection-data.ts find-readwise-book.ts fix-document-status.ts restore-chunks.ts
```

#### 4. Delete Old Test Runners (3 files)

**Files to DELETE**:
```bash
worker/scripts/run-integration-tests.js
worker/scripts/test-metadata-integration.js
worker/scripts/validate-metadata-quality-mock.cjs
```

**Rationale**: Superseded by jest test infrastructure.

**Command**:
```bash
cd /Users/topher/Code/rhizome-v2-worktree-1/worker/scripts
rm run-integration-tests.js test-metadata-integration.js validate-metadata-quality-mock.cjs
```

#### 5. Delete Shell Wrapper (1 file)

**File to DELETE**:
```bash
worker/scripts/test-docling-direct.sh
```

**Rationale**: Superseded by TypeScript version `test-docling-wrapper.ts`.

**Command**:
```bash
cd /Users/topher/Code/rhizome-v2-worktree-1/worker/scripts
rm test-docling-direct.sh
```

#### 6. Archive Experimental Scripts (14 files)

**Create archive directory**:
```bash
mkdir -p /Users/topher/Code/rhizome-v2-worktree-1/claudedocs/archived-scripts
```

**Files to ARCHIVE** (move, don't delete - have reference value):
```bash
# Connection remapping experiments (5 files)
worker/scripts/test-remap-connections.ts
worker/scripts/test-remap-with-cache.ts
worker/scripts/test-remap-connection-preservation.ts
worker/scripts/test-remap-simple.ts
worker/scripts/test-remap-strategies.ts

# Offset analysis experiments (5 files)
worker/scripts/analyze-character-drift.ts
worker/scripts/analyze-character-drift-detailed.ts
worker/scripts/analyze-offset-alignment.ts
worker/scripts/analyze-offset-preservation.ts
worker/scripts/check-chunk-offsets.ts

# Other experiments (4 files)
worker/scripts/test-chunk-size-comparison.ts
worker/scripts/handler-refactor.test.ts
worker/scripts/load-test.ts
worker/scripts/test-local-embeddings.ts
```

**Command**:
```bash
cd /Users/topher/Code/rhizome-v2-worktree-1/worker/scripts
mv test-remap-*.ts analyze-*.ts check-chunk-offsets.ts test-chunk-size-comparison.ts \
   handler-refactor.test.ts load-test.ts test-local-embeddings.ts \
   /Users/topher/Code/rhizome-v2-worktree-1/claudedocs/archived-scripts/
```

#### 7. Create Scripts Documentation

**File**: `worker/scripts/README.md`

**Content**:
```markdown
# Worker Scripts Directory

Actively-used scripts for testing, validation, and benchmarking.

## Benchmarks (npm scripts)

Run via package.json scripts:
- `npm run benchmark:batch-processing` - Batch processing performance
- `npm run benchmark:pdf-processing` - PDF processing benchmarks
- `npm run benchmark:orchestration` - Connection engine orchestration
- `npm run benchmark:semantic-engine` - Semantic similarity engine
- `npm run benchmark:metadata-quality` - Metadata quality assessment

## Production Utilities

- `test-dual-bridge.ts` - Test dual thematic bridge setup (`npm run test:dual-bridge`)
- `list-testable-documents.ts` - List documents for testing (`npm run test:list-documents`)
- `reprocess-cli.ts` - CLI for reprocessing documents
- `manual-reprocess.ts` - Manual reprocessing workflow
- `test-readwise-export-import.ts` - Readwise integration testing
- `import-readwise.ts` - Import from Readwise
- `validate-metadata-quality.js` - Metadata quality validation

## Python Integration

Python scripts called via IPC from TypeScript:
- `docling_extract.py` - PDF extraction wrapper (Docling)
- `docling_extract_epub.py` - EPUB extraction wrapper (Docling)
- `extract_metadata_pydantic.py` - Metadata extraction via Ollama
- `chonkie_chunk.py` - Python chunking integration (Chonkie)

## Storage/Import Testing

- `validate-storage-export.ts` - Storage export validation
- `test-pdf-storage-integration.ts` - PDF storage integration
- `test-epub-storage-integration.ts` - EPUB storage integration
- `test-import-strategies.ts` - Import strategy testing

## Docling/Chunking Testing

- `test-docling-wrapper.ts` - Docling wrapper testing
- `test-local-pipeline.ts` - Local processing pipeline
- `validate-chunk-matching.ts` - Chunk matching validation
- `validate-bulletproof-matcher.ts` - Bulletproof matcher validation
- `test-chonkie-integration.ts` - Chonkie integration testing
- `test-chonkie-ipc.ts` - Chonkie IPC communication
- `test-metadata-transfer.ts` - Metadata transfer testing

## Archived Scripts

Experimental/reference scripts moved to: `claudedocs/archived-scripts/`
- Connection remapping experiments
- Offset analysis tools
- Historical development experiments
```

### Success Criteria:

#### Automated Verification:
- [ ] Files deleted: `ls worker/test-*.ts 2>&1 | grep -c "No such file"` returns 1
- [ ] Phase files deleted: `ls worker/tests/phase-*.ts 2>&1 | grep -c "No such file"` returns 1
- [ ] Archive directory exists: `test -d claudedocs/archived-scripts && echo "exists"`
- [ ] Tests still pass: `cd worker && npm test`
- [ ] Type check still passes: `cd worker && npx tsc --noEmit`
- [ ] README created: `test -f worker/scripts/README.md && echo "exists"`

#### Manual Verification:
- [ ] No broken imports (grep for deleted file references)
- [ ] Benchmark scripts still run: `cd worker && npm run benchmark:quick`
- [ ] Archive directory contains expected 14 files
- [ ] Scripts directory feels organized and documented

**Implementation Note**: Create archive directory first, then delete files in batches (test files, phase files, debug files, old runners). Commit after each batch for easy rollback if needed.

### Service Restarts:
- [ ] No services need restart (file cleanup only)
- [ ] Verify no webpack/vite rebuild errors after cleanup

---

## Testing Strategy

### Unit Tests:

All existing unit tests should continue to pass. This cleanup adds type safety without changing behavior.

**Key test suites to verify**:
- `worker/tests/engines/orchestrator.test.ts` (critical)
- `worker/tests/integration/full-system.test.ts` (critical)
- `worker/__tests__/fuzzy-matching.test.ts` (stable)
- `src/lib/ecs/__tests__/ecs.test.ts` (main app ECS)

### Integration Tests:

```bash
# Worker integration tests
cd worker
npm run test:integration

# Main app tests
npm test

# Critical test suite (must pass before deployment)
cd worker
npm run test:critical
```

### Manual Testing:

1. **Verify engine types in UI**:
   - Open document reader
   - Check connections panel
   - Verify engines show as: Semantic Similarity, Contradiction Detection, Thematic Bridge

2. **Test preferences**:
   - Open settings
   - Verify engine weight configuration loads
   - Adjust weights and save

3. **Test Readwise import** (if available):
   - Try importing highlights
   - Verify client instantiation works

4. **Run benchmark** (optional):
   ```bash
   cd worker
   npm run benchmark:quick
   ```

## Performance Considerations

**Zero Performance Impact**: This is purely a type safety and code organization cleanup. No runtime behavior changes.

**Build Time**: May improve slightly due to fewer files to process and better type checking (faster incremental builds).

**Bundle Size**: No change (test files and scripts not included in production bundles).

## Migration Notes

**No Database Migration Required**: This is a code-only cleanup.

**Git History**: Deleted files will remain in git history for reference. Use `git log --follow` to trace file history if needed.

**Rollback Strategy**: Each phase commits separately, allowing easy rollback to any phase:
```bash
# Rollback to before Phase 4
git revert HEAD

# Rollback to before Phase 3
git revert HEAD~1
```

## Verification Checklist

After completing all phases:

```bash
# 1. Type checks pass (both modules)
npx tsc --noEmit
cd worker && npx tsc --noEmit

# 2. All tests pass
npm test
cd worker && npm test

# 3. Linting passes
npm run lint
cd worker && npm run lint

# 4. No obsolete files remain
ls worker/test-*.ts 2>&1 | grep "No such file"
ls worker/tests/phase-*.ts 2>&1 | grep "No such file"

# 5. Archive directory created
test -d claudedocs/archived-scripts && echo "Archive exists"

# 6. Scripts documented
test -f worker/scripts/README.md && cat worker/scripts/README.md

# 7. Git status clean (after commits)
git status

# 8. Benchmarks still work
cd worker && npm run benchmark:quick
```

## References

- **Architecture**: `docs/ARCHITECTURE.md` - Rhizome V2 system architecture
- **Testing**: `docs/testing/TESTING_RULES.md` - Testing philosophy
- **Naming**: `CLAUDE.md` lines 552-614 - Naming conventions (camelCase in JSONB)
- **Engine System**: `worker/engines/orchestrator.ts` - 3-engine coordination
- **ECS Pattern**: `docs/ECS_IMPLEMENTATION.md` - Entity-Component-System guide
- **Exploration Report**: `claudedocs/worker-test-scripts-cleanup.md` - Detailed file analysis

## Implementation Timeline

**Total Estimated Time**: 5-6 hours

- **Phase 1** (Critical Main App): 45 minutes
- **Phase 2** (Critical Worker): 1 hour
- **Phase 3** (Tests & Types): 2 hours
- **Phase 4** (File Cleanup): 1 hour
- **Validation & Commits**: 30 minutes

**Recommended Schedule**:
- Session 1: Phases 1-2 (get to buildable state)
- Session 2: Phase 3 (clean up tests)
- Session 3: Phase 4 + final validation (organize codebase)

## Success Metrics

**Before Cleanup**:
- TypeScript errors: ~150
- Obsolete files: 43 (~4,500 lines)
- Test type safety: Poor (many implicit any)

**After Cleanup**:
- TypeScript errors: 0 ✅
- Obsolete files: 0 (14 archived for reference) ✅
- Test type safety: Excellent (all explicit types) ✅
- Documentation: Scripts directory documented ✅
- Build time: Potentially improved ✅

---

**Plan Status**: Ready for review and execution
**Created**: 2025-01-20
**Estimated Duration**: 5-6 hours across 4 phases
