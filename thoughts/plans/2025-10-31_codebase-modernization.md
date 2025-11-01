# Codebase Modernization & Documentation Plan

**Date**: 2025-10-31
**Status**: Ready for implementation
**Priority**: HIGH - Code quality, security, and documentation accuracy

---

## Overview

Comprehensive cleanup to eliminate duplicate code patterns, add security validation, improve test coverage for critical features, and update documentation to match implementation reality. This plan transforms Rhizome V2 from "excellent architecture" to "production-ready, maintainable, and well-documented."

**Philosophy**: Focus on practical improvements that reduce maintenance burden, prevent security issues, protect irreplaceable user data, and make the codebase easily understandable by both humans and LLMs.

**Audit-Based Planning**: This plan is based on comprehensive codebase audit conducted 2025-10-31, with all baseline metrics verified against actual implementation.

---

## Current State Analysis

### Strengths ✅
- **Exceptional architectural discipline**: Zero dual-module violations, pure Server Actions architecture, clean ECS implementation
- **Recent refactoring success**: VirtualizedReader reduced from 2,171 → 511 lines (annotation resize system)
- **Good test foundation**: Core systems (ECS, engines, reader utilities) have 60-80% coverage
- **Existing patterns**: Clear examples to follow for validation, testing, and documentation
- **Storage-first philosophy**: Properly implemented across Admin Panel

### Issues Identified ⚠️

**Code Quality:**
- **~250 lines of duplicate code** across 7 utility patterns (down from 300+ due to recent refactoring)
- **New god components**: IntegrationsTab (1,136 lines), UploadZone (879 lines), ChunkMetadataIcon (762 lines)
- **2 worker files** with Supabase client duplication (not 8 as originally claimed)
- No shared utilities for common operations (auth, ECS init, progress, error handling)

**Security:**
- **74% Server Actions unprotected**: 23 of 31 files lack Zod validation (worse than 58% estimate)
- **18 worker handlers** write unvalidated JSONB to output_data
- Missing UUID validation, enum validation, range validation
- Critical unprotected endpoints: `sparks.ts`, `connections.ts`, `settings.ts`, entire `documents/` subdirectory

**Test Coverage:**
- Annotation system: 0% coverage (stores hours of manual user work)
- Flashcard system: 0% coverage (complete backend, missing tests)
- Admin Panel: 14% coverage (1/7 tabs tested) - **IntegrationsTab (1,136 lines) untested**
- Server Actions: 30% coverage (2/33 files tested)
- Worker handlers: 11% coverage (2/18 handlers tested)

**Documentation:**
- **204 archived docs** vs 92 active (2.2:1 bloat ratio)
- Redundant pairs: `ANNOTATIONS_SYSTEM.md` + `ANNOTATIONS_SYSTEM_V2.md` (both describe same 5-component architecture)
- `IMPLEMENTATION_STATUS.md` outdated (flashcard system marked incomplete)
- No API reference for 31 Server Actions
- No processor guide for 8 document formats
- Missing component architecture guides
- No Zod validation patterns documentation

---

## Desired End State

### Code Quality Goals
- **Zero duplication** in common utility patterns (~250 lines saved)
- **Shared utilities** for auth, ECS, progress, validation, error handling
- **Modular components**: IntegrationsTab split into 4 focused components (1,136 → ~800 lines)
- **Modular components**: UploadZone split into 3 focused components (879 → ~650 lines)
- **Consistent patterns** across all Server Actions and handlers

### Security Goals
- **100% Server Action validation** with Zod schemas (31 files)
- **100% Worker handler validation** with Zod schemas (18 files)
- **Consistent error handling** with specific validation messages
- **Type-safe inputs** using `z.infer<typeof Schema>` pattern
- **UUID/enum/range validation** for all user inputs

### Test Coverage Goals
- **Critical systems protected**: Annotations, flashcards, recovery algorithms tested
- **Admin Panel validated**: IntegrationsTab (NEW), Scanner, Export, Connections tabs tested
- **Server Actions covered**: Top 10 most-used actions have tests
- **Worker pipeline tested**: Main orchestration logic validated

### Documentation Goals
- **Pruned archives**: Keep only 6 months (reduce 204 → ~50 archived docs)
- **Consolidated redundancy**: Merge duplicate docs (ANNOTATIONS_SYSTEM.md)
- **Accurate status**: All docs reflect current implementation
- **API reference**: Complete Server Actions + Worker handlers documentation
- **LLM-friendly format**: Clear context, file paths, code patterns, cross-references
- **Discoverable patterns**: How-to guides for common tasks
- **Maintainable structure**: Organized by purpose (api/, architecture/, guides/)

---

## Rhizome Architecture

- **Module**: Both (Main App + Worker)
- **Storage**: No changes (refactoring only)
- **Migration**: No (pure code cleanup)
- **Test Tier**: Critical (new tests block deployment) + Stable (fix when broken)
- **Pipeline Stages**: None affected
- **Engines**: None affected

---

## What We're NOT Doing

To prevent scope creep:

❌ **No feature additions** - This is cleanup and documentation only
❌ **No database schema changes** - Pure code refactoring
❌ **No pipeline modifications** - Processing logic unchanged
❌ **No UI redesigns** - Component structure only
❌ **No performance optimizations** - Focus on maintainability
❌ **No SuperClaude docs updates** - Skip `.claude/` and `thoughts/`
❌ **No external integrations** - Existing Readwise/Obsidian unchanged

**In scope**: Code consolidation, security validation, test coverage, `docs/` folder updates, component breakdown

---

## Implementation Approach

**Strategy**: Incremental, testable phases with validation gates. Each phase is independently deployable and adds value. Documentation happens throughout, not at the end.

**Validation**: Every phase has automated verification (tests, lint, typecheck) and manual verification (UI, behavior).

**Rollback**: All changes are backwards-compatible. No breaking changes.

**NEW: Phase 0 Pre-Audit**: Verify all claims before implementation to ensure accurate scope.

---

## Phase 0: Pre-Implementation Audit (NEW - 2-4 hours)

### Overview
Validate all modernization plan claims against actual codebase to ensure accurate baseline metrics. Prevents working on already-solved problems and identifies new pain points.

### Audit Checklist:

#### Code Duplication Verification:
- [x] **VirtualizedReader**: Claimed 2,171 lines → **Actual: 511 lines** (already refactored)
- [x] **Worker Supabase duplication**: Claimed 8 files → **Actual: 2 files** (`obsidian-sync.ts`, `continue-processing.ts`)
- [x] **New god components**: IntegrationsTab (1,136 lines), UploadZone (879 lines), ChunkMetadataIcon (762 lines)
- [ ] Verify remaining duplication patterns (auth, ECS, revalidation)

#### Security Coverage Verification:
- [x] **Zod validation**: Claimed 40% (12/29) → **Actual: 26% (8/31)** - 23 files unprotected
- [ ] List specific unprotected files by priority
- [ ] Verify worker handler validation status (18 handlers)

#### Test Coverage Verification:
- [x] Worker handlers: **11% (2/18)** ✓ Accurate
- [x] Admin Panel: **14% (1/7 tabs)** ✓ Accurate
- [x] Annotations: **0% Server Action coverage** ✓ Accurate
- [ ] Identify which Admin Panel tab needs testing most urgently (IntegrationsTab: 1,136 lines)

#### Documentation Verification:
- [x] **Archive bloat**: 204 archived vs 92 active (2.2:1 ratio)
- [x] **Redundant pairs**: ANNOTATIONS_SYSTEM.md + ANNOTATIONS_SYSTEM_V2.md
- [ ] Catalog all documentation gaps

### Success Criteria:

#### Automated Verification:
- [ ] Audit script runs: `bash scripts/audit-baseline-metrics.sh`
- [ ] Metrics exported: `thoughts/plans/baseline-metrics-2025-10-31.json`

#### Manual Verification:
- [ ] All claims verified against codebase
- [ ] New targets identified (IntegrationsTab, UploadZone)
- [ ] Scope adjusted based on findings
- [ ] Team aligned on corrected metrics

**Implementation Note**: Complete this audit BEFORE starting Phase 1 to ensure effort focused on current pain points.

---

## Phase 1: Code Consolidation

### Overview
Extract duplicate utility patterns into shared modules. Reduces codebase by ~250 lines, improves maintainability, establishes patterns for future development.

**Impact**: Immediate reduction in maintenance burden, easier onboarding for new developers (including LLMs).

---

### 1.1 Worker Supabase Client Utility

**File**: `worker/lib/supabase-client.ts` (NEW)

**Changes**: Extract duplicate `getSupabaseClient()` from **2 handlers**

**Code**:
```typescript
import { createClient } from '@supabase/supabase-js'

/**
 * Creates a Supabase client for worker module operations.
 * Uses service role key for admin-level access (bypasses RLS).
 *
 * NEVER expose to client side - worker module only.
 *
 * @returns Supabase client with service role privileges
 * @throws Error if environment variables missing
 */
export function getWorkerSupabaseClient() {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error(
      `Missing Supabase environment variables: ` +
      `SUPABASE_URL=${!!supabaseUrl}, SERVICE_KEY=${!!supabaseServiceKey}`
    )
  }

  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  })
}
```

**Files to update** (2 handlers):
- `worker/handlers/obsidian-sync.ts:24-38` - Replace with import
- `worker/handlers/continue-processing.ts:27-41` - Replace with import

**Pattern**:
```typescript
// OLD (delete):
function getSupabaseClient() {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
  // ... 15 lines of duplicate code
}

// NEW (add import):
import { getWorkerSupabaseClient } from '../lib/supabase-client.js'

// Usage (unchanged):
const supabase = getWorkerSupabaseClient()
```

**Lines saved**: ~30 lines across 2 files (adjusted from ~120 across 8 files)

---

### 1.2 Authentication Utility (Main App)

**File**: `src/lib/auth/require-auth.ts` (NEW)

**Changes**: Extract auth check pattern used in 82 Server Actions

**Code**:
```typescript
import { getCurrentUser } from '@/lib/auth'

/**
 * Ensures user is authenticated. Throws if not.
 * Use at the start of every Server Action.
 *
 * @returns Authenticated user object
 * @throws Error with 'Unauthorized' message if not authenticated
 *
 * @example
 * export async function myAction(input: MyInput) {
 *   'use server'
 *   const user = await requireAuth()
 *   // ... rest of action
 * }
 */
export async function requireAuth() {
  const user = await getCurrentUser()
  if (!user) {
    throw new Error('Unauthorized')
  }
  return user
}

/**
 * Type-safe wrapper for Server Actions with auth.
 * Automatically handles auth check and error handling.
 *
 * @example
 * export const myAction = withAuth(async (user, input: MyInput) => {
 *   // user is guaranteed to exist
 *   // ... action logic
 *   return { success: true, data }
 * })
 */
export function withAuth<TInput, TOutput>(
  handler: (user: { id: string; email: string }, input: TInput) => Promise<TOutput>
) {
  return async (input: TInput): Promise<TOutput> => {
    const user = await requireAuth()
    return handler(user, input)
  }
}
```

**Files to update**: All 31 Server Action files

**Pattern**:
```typescript
// OLD:
export async function myAction(input: MyInput) {
  'use server'
  const user = await getCurrentUser()
  if (!user) throw new Error('Unauthorized')
  // ... rest
}

// NEW (Option 1 - simple):
import { requireAuth } from '@/lib/auth/require-auth'

export async function myAction(input: MyInput) {
  'use server'
  const user = await requireAuth()
  // ... rest
}

// NEW (Option 2 - wrapper - FUTURE ENHANCEMENT):
import { withAuth } from '@/lib/auth/require-auth'

export const myAction = withAuth(async (user, input: MyInput) => {
  // user guaranteed to exist
  // ... rest
})
```

**Note**: Use Option 1 (simple) for consistency with existing code. Option 2 is future enhancement.

**Lines saved**: ~160 lines (2 lines per action × 80 actions)

---

### 1.3 ECS Initialization Utility + Type Safety (ENHANCED)

**File**: `src/lib/ecs/utils.ts` (NEW)

**Changes**: Extract ECS + Operations pattern used in 26 actions + add type safety

**Code**:
```typescript
import { createECS } from './index'
import { AnnotationOperations } from './annotations'
import { SparkOperations } from './sparks'
import { FlashcardOperations } from './flashcards'

/**
 * Creates ECS instance with operations class for given entity type.
 * Centralizes the factory pattern used across all Server Actions.
 *
 * @param entityType - Type of entity operations needed
 * @param userId - User ID for operations
 * @returns Operations instance ready to use
 *
 * @example
 * const sparkOps = createECSOperations('spark', user.id)
 * await sparkOps.create({ ... })
 */
export function createECSOperations<T extends 'annotation' | 'spark' | 'flashcard'>(
  entityType: T,
  userId: string
): T extends 'annotation' ? AnnotationOperations :
   T extends 'spark' ? SparkOperations :
   T extends 'flashcard' ? FlashcardOperations :
   never {
  const ecs = createECS()

  switch (entityType) {
    case 'annotation':
      return new AnnotationOperations(ecs, userId) as any
    case 'spark':
      return new SparkOperations(ecs, userId) as any
    case 'flashcard':
      return new FlashcardOperations(ecs, userId) as any
    default:
      throw new Error(`Unknown entity type: ${entityType}`)
  }
}

/**
 * Type-safe operations return types (for external use)
 */
export type ECSOpsAnnotation = AnnotationOperations
export type ECSOpspark = SparkOperations
export type ECSOpFlashcard = FlashcardOperations
```

**Files to update**: 26 Server Actions using ECS

**Pattern**:
```typescript
// OLD:
const ecs = createECS()
const ops = new AnnotationOperations(ecs, user.id)

// NEW:
import { createECSOperations } from '@/lib/ecs/utils'
const ops = createECSOperations('annotation', user.id)
// TypeScript now knows ops is AnnotationOperations
```

**Lines saved**: ~26 lines (1 line per action) + improved type safety

---

### 1.4 Revalidation Utility + Cache Tags (ENHANCED)

**File**: `src/lib/revalidation.ts` (NEW)

**Changes**: Extract common revalidation patterns + add Next.js 15 cache tag support

**Code**:
```typescript
import { revalidatePath, revalidateTag } from 'next/cache'

/**
 * Revalidates reader page for a document.
 * Use after mutations affecting document view (annotations, sparks, etc.)
 */
export function revalidateReader(documentId: string) {
  revalidateTag(`document:${documentId}`)
  revalidatePath(`/read/${documentId}`)
}

/**
 * Revalidates library/homepage.
 * Use after document CRUD operations.
 */
export function revalidateLibrary() {
  revalidateTag('documents:all')
  revalidatePath('/')
}

/**
 * Revalidates flashcard decks page.
 * Use after deck/flashcard mutations.
 */
export function revalidateDecks() {
  revalidateTag('decks:all')
  revalidatePath('/flashcards/decks')
}

/**
 * Revalidates study page for a deck.
 * Use after study session or flashcard updates.
 */
export function revalidateStudy(deckId?: string) {
  if (deckId) {
    revalidateTag(`deck:${deckId}`)
    revalidatePath(`/study/${deckId}`)
  }
  revalidateTag('study:all')
  revalidatePath('/study')
}

/**
 * Revalidates sparks page.
 * Use after spark CRUD operations.
 */
export function revalidateSparks() {
  revalidateTag('sparks:all')
  revalidatePath('/sparks')
}

/**
 * Revalidates document and reader page together.
 * Common pattern after document mutations.
 */
export function revalidateDocument(documentId: string) {
  revalidateTag(`document:${documentId}`)
  revalidateTag('documents:all')
  revalidatePath('/')
  revalidatePath(`/read/${documentId}`)
}

/**
 * Revalidates annotations for a document.
 * Use after annotation CRUD operations.
 */
export function revalidateAnnotations(documentId: string) {
  revalidateTag(`annotations:${documentId}`)
  revalidateTag('annotations:all')
  revalidatePath(`/read/${documentId}`)
}

/**
 * Revalidates connections.
 * Use after connection detection or feedback.
 */
export function revalidateConnections(documentId?: string) {
  if (documentId) {
    revalidateTag(`connections:${documentId}`)
  }
  revalidateTag('connections:all')
}
```

**Files to update**: 31 Server Actions

**Pattern**:
```typescript
// OLD:
revalidatePath('/')
revalidatePath(`/read/${documentId}`)

// NEW:
import { revalidateDocument } from '@/lib/revalidation'
revalidateDocument(documentId)
```

**Lines saved**: ~30-40 lines + Next.js 15 cache tag benefits

---

### 1.5 Error Handling Utility + Response Types (ENHANCED)

**File**: `src/lib/error-utils.ts` (NEW)

**Changes**: Standardize error handling across Server Actions + enforce response type consistency

**Code**:
```typescript
import { ZodError } from 'zod'

/**
 * Standard error response format for Server Actions
 */
export interface ActionError {
  success: false
  error: string
  code?: string
}

/**
 * Standard success response format for Server Actions
 */
export interface ActionSuccess<T = void> {
  success: true
  data: T
}

export type ActionResult<T = void> = ActionSuccess<T> | ActionError

/**
 * Creates success response with data
 */
export function successResponse<T>(data: T): ActionSuccess<T> {
  return { success: true, data }
}

/**
 * Formats error for Server Action response.
 * Handles Zod validation errors specially.
 *
 * @param error - Error object from catch block
 * @param context - Optional context for logging (action name)
 * @returns Formatted error response
 *
 * @example
 * catch (error) {
 *   return formatActionError(error, 'createAnnotation')
 * }
 */
export function formatActionError(
  error: unknown,
  context?: string
): ActionError {
  // Log for debugging
  if (context) {
    console.error(`[${context}] Error:`, error)
  } else {
    console.error('Action error:', error)
  }

  // Handle Zod validation errors with detailed messages
  if (error instanceof ZodError) {
    const messages = error.errors.map(e => {
      const path = e.path.join('.')
      return path ? `${path}: ${e.message}` : e.message
    })
    return {
      success: false,
      error: `Validation failed: ${messages.join(', ')}`,
      code: 'VALIDATION_ERROR'
    }
  }

  // Handle standard errors
  if (error instanceof Error) {
    return {
      success: false,
      error: error.message,
      code: 'ERROR'
    }
  }

  // Fallback for unknown errors
  return {
    success: false,
    error: 'Unknown error occurred',
    code: 'UNKNOWN_ERROR'
  }
}

/**
 * Wraps Server Action in try-catch with standard error handling.
 * Reduces boilerplate in every action.
 *
 * @example
 * export const myAction = withErrorHandling('myAction', async (input) => {
 *   // ... action logic
 *   return successResponse(result)
 * })
 */
export function withErrorHandling<TInput, TOutput>(
  actionName: string,
  handler: (input: TInput) => Promise<ActionResult<TOutput>>
): (input: TInput) => Promise<ActionResult<TOutput>> {
  return async (input: TInput) => {
    try {
      return await handler(input)
    } catch (error) {
      return formatActionError(error, actionName)
    }
  }
}
```

**Files to update**: 31 Server Actions

**Pattern**:
```typescript
// OLD (inconsistent):
export async function myAction(input: MyInput) {
  try {
    // ... logic
    return { success: true, id: entityId } // Sometimes { id }, sometimes { data }
  } catch (error) {
    console.error('[myAction] Error:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

// NEW (consistent):
import { formatActionError, successResponse, type ActionResult } from '@/lib/error-utils'

export async function myAction(input: MyInput): Promise<ActionResult<string>> {
  try {
    // ... logic
    return successResponse(entityId) // Always { success: true, data: entityId }
  } catch (error) {
    return formatActionError(error, 'myAction')
  }
}
```

**Lines saved**: ~40-50 lines + response type consistency

---

### 1.6 Component Breakdown

**Overview**: Split god components identified in audit into focused, maintainable modules.

#### 1.6.1 IntegrationsTab Split (1,136 → ~800 lines)

**File**: `src/components/admin/tabs/IntegrationsTab.tsx` (MODIFY)

**Changes**: Split into 4 focused components

**New Files**:
```typescript
// src/components/admin/integrations/ReadwiseIntegration.tsx (~300 lines)
export function ReadwiseIntegration() {
  // Readwise-specific logic: API key management, sync, import history
}

// src/components/admin/integrations/ObsidianIntegration.tsx (~300 lines)
export function ObsidianIntegration() {
  // Obsidian-specific logic: vault config, sync settings, export
}

// src/components/admin/integrations/IntegrationSettings.tsx (~200 lines)
export function IntegrationSettings() {
  // Shared settings UI: enable/disable, sync frequency
}

// src/components/admin/integrations/IntegrationStatus.tsx (~200 lines)
export function IntegrationStatus() {
  // Status dashboard: last sync, error messages, activity log
}

// src/components/admin/tabs/IntegrationsTab.tsx (orchestrator, ~100 lines)
import { ReadwiseIntegration } from '../integrations/ReadwiseIntegration'
import { ObsidianIntegration } from '../integrations/ObsidianIntegration'
import { IntegrationSettings } from '../integrations/IntegrationSettings'
import { IntegrationStatus } from '../integrations/IntegrationStatus'

export function IntegrationsTab() {
  return (
    <Tabs defaultValue="readwise">
      <TabsList>
        <TabsTrigger value="readwise">Readwise</TabsTrigger>
        <TabsTrigger value="obsidian">Obsidian</TabsTrigger>
        <TabsTrigger value="status">Status</TabsTrigger>
      </TabsList>

      <TabsContent value="readwise">
        <ReadwiseIntegration />
      </TabsContent>

      <TabsContent value="obsidian">
        <ObsidianIntegration />
      </TabsContent>

      <TabsContent value="status">
        <IntegrationStatus />
        <IntegrationSettings />
      </TabsContent>
    </Tabs>
  )
}
```

**Impact**: 1,136 → ~800 lines total (net reduction via better organization)

#### 1.6.2 UploadZone Simplification (879 → ~650 lines)

**File**: `src/components/library/UploadZone.tsx` (MODIFY)

**Changes**: Split into 3 focused components

**New Files**:
```typescript
// src/components/library/upload/UploadDropzone.tsx (~400 lines)
export function UploadDropzone() {
  // Drag-and-drop logic, file validation, preview
}

// src/components/library/upload/ChunkerSelector.tsx (~250 lines)
export function ChunkerSelector() {
  // Chunker strategy selection UI, configuration options
}

// src/components/library/upload/UploadProgress.tsx (~200 lines)
export function UploadProgress() {
  // Progress tracking, job status, error handling
}

// src/components/library/UploadZone.tsx (orchestrator, ~150 lines)
import { UploadDropzone } from './upload/UploadDropzone'
import { ChunkerSelector } from './upload/ChunkerSelector'
import { UploadProgress } from './upload/UploadProgress'

export function UploadZone() {
  const [files, setFiles] = useState<File[]>([])
  const [chunkerConfig, setChunkerConfig] = useState<ChunkerConfig>()

  return (
    <div className="upload-zone">
      <UploadDropzone onFilesSelected={setFiles} />
      <ChunkerSelector onConfigChange={setChunkerConfig} />
      <UploadProgress files={files} config={chunkerConfig} />
    </div>
  )
}
```

**Impact**: 879 → ~650 lines total (net reduction via extraction)

**Lines saved**: ~400 lines total from better organization

---

### 1.7 Storage Integrity Utilities

**File**: `src/lib/storage/integrity.ts` (NEW)

**Changes**: Add validation layer for storage-first architecture

**Code**:
```typescript
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Validation result for storage vs database sync
 */
export interface StorageValidationResult {
  status: 'synced' | 'orphaned_storage' | 'orphaned_database' | 'missing'
  action: 'none' | 'import' | 'export' | 'delete'
  details?: {
    storageExists: boolean
    databaseExists: boolean
    storagePath?: string
    documentId?: string
  }
}

/**
 * Validates that Storage and Database are in sync for a document.
 * Storage is source of truth - database is queryable cache.
 *
 * @param documentId - Document to validate
 * @returns Validation result with recommended action
 */
export async function validateStorageSync(
  documentId: string
): Promise<StorageValidationResult> {
  const supabase = await createAdminClient()

  // Check database
  const { data: dbDoc, error: dbError } = await supabase
    .from('documents')
    .select('id, title, storage_path')
    .eq('id', documentId)
    .single()

  const databaseExists = !dbError && !!dbDoc

  // Check storage
  let storageExists = false
  let storagePath: string | undefined

  if (dbDoc?.storage_path) {
    const { data: storageData, error: storageError } = await supabase
      .storage
      .from('documents')
      .list(dbDoc.storage_path.split('/')[0])

    storageExists = !storageError && storageData.length > 0
    storagePath = dbDoc.storage_path
  }

  // Determine status and action
  if (storageExists && databaseExists) {
    return {
      status: 'synced',
      action: 'none',
      details: { storageExists, databaseExists, storagePath, documentId }
    }
  }

  if (storageExists && !databaseExists) {
    return {
      status: 'orphaned_storage',
      action: 'import',
      details: { storageExists, databaseExists, storagePath }
    }
  }

  if (!storageExists && databaseExists) {
    return {
      status: 'orphaned_database',
      action: 'export',
      details: { storageExists, databaseExists, documentId }
    }
  }

  return {
    status: 'missing',
    action: 'delete',
    details: { storageExists: false, databaseExists: false }
  }
}

/**
 * Validates all documents in database have corresponding storage.
 * Used by ScannerTab.
 */
export async function validateAllDocuments(): Promise<{
  synced: string[]
  orphanedStorage: string[]
  orphanedDatabase: string[]
  missing: string[]
}> {
  const supabase = await createAdminClient()

  const { data: documents } = await supabase
    .from('documents')
    .select('id')

  if (!documents) {
    return {
      synced: [],
      orphanedStorage: [],
      orphanedDatabase: [],
      missing: []
    }
  }

  const results = await Promise.all(
    documents.map(doc => validateStorageSync(doc.id))
  )

  return {
    synced: results.filter(r => r.status === 'synced').map(r => r.details!.documentId!),
    orphanedStorage: results.filter(r => r.status === 'orphaned_storage').map(r => r.details!.storagePath!),
    orphanedDatabase: results.filter(r => r.status === 'orphaned_database').map(r => r.details!.documentId!),
    missing: results.filter(r => r.status === 'missing').map((r, i) => documents[i].id)
  }
}
```

**Usage in ScannerTab**:
```typescript
import { validateAllDocuments } from '@/lib/storage/integrity'

const results = await validateAllDocuments()
// Display results with recommended actions
```

**Impact**: Strengthens storage-first architecture with validation layer

---

### Success Criteria

#### Automated Verification:
- [ ] All tests pass: `npm test`
- [ ] Type check passes: `npm run type-check`
- [ ] Linting passes: `npm run lint`
- [ ] Build succeeds: `npm run build`
- [ ] No duplicate code detected: `grep -r "function getSupabaseClient" worker/handlers/` (should be 0 results)
- [ ] Worker tests pass: `cd worker && npm test`

#### Manual Verification:
- [ ] Server Actions still work (create annotation, spark, flashcard)
- [ ] Worker handlers execute correctly (process document, export, import)
- [ ] Error messages still clear and helpful
- [ ] IntegrationsTab refactor maintains functionality
- [ ] UploadZone refactor maintains functionality
- [ ] No behavioral changes (pure refactoring)

**Implementation Note**: Pause after automated verification passes for manual confirmation before proceeding to Phase 2.

### Service Restarts:
- [ ] Next.js: Auto-reload (verify with `npm run dev`)
- [ ] Worker: Restart via `npm run dev`
- [ ] No Supabase restart needed (no schema changes)

**Lines Saved Summary**: ~250 lines (30 worker + 160 auth + 26 ECS + 40 revalidation + 50 error + better component organization)

---

## Phase 2: Security Hardening

### Overview
Add input validation to **23 Server Actions** and **18 worker handlers** missing Zod schemas. Prevents invalid data, improves error messages, adds runtime type safety. Follows established patterns from `flashcards.ts` and `annotations.ts`.

**Security Impact**: Prevents malformed UUIDs, out-of-range numbers, invalid enums, injection attacks, JSONB corruption.

---

### 2.1 Sparks Actions Validation

**File**: `src/app/actions/sparks.ts`

**Current State**: Uses TypeScript interfaces, no runtime validation

**Changes**: Add Zod schemas at top of file

**Code**:
```typescript
// Add after imports, before action functions
import { z } from 'zod'

// ============================================
// ZOD SCHEMAS
// ============================================

const SparkSelectionSchema = z.object({
  text: z.string().min(1).max(5000),
  chunkId: z.string().uuid(),
  startOffset: z.number().int().min(0),
  endOffset: z.number().int().min(0),
  documentOffset: z.number().int().min(0).optional(),
  textContext: z.object({
    before: z.string().max(200),
    after: z.string().max(200),
  }).optional(),
})

const SparkContextSchema = z.object({
  documentId: z.string().uuid(),
  originChunkId: z.string().uuid().optional(),
  visibleChunks: z.array(z.string().uuid()).max(50).optional(),
  documentTitle: z.string().min(1).max(500).optional(),
})

const CreateSparkSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  content: z.string().min(1).max(10000),
  selections: z.array(SparkSelectionSchema).max(20).optional(),
  context: SparkContextSchema.optional(),
})

const UpdateSparkSchema = z.object({
  sparkId: z.string().uuid(),
  content: z.string().min(1).max(10000).optional(),
  title: z.string().min(1).max(200).optional(),
  selections: z.array(SparkSelectionSchema).max(20).optional(),
})

const DeleteSparkSchema = z.object({
  sparkId: z.string().uuid(),
})

// Update function signatures:
export async function createSpark(input: z.infer<typeof CreateSparkSchema>) {
  const user = await requireAuth()

  try {
    const validated = CreateSparkSchema.parse(input)
    // ... rest of function using validated data
  } catch (error) {
    return formatActionError(error, 'createSpark')
  }
}

export async function updateSpark(input: z.infer<typeof UpdateSparkSchema>) {
  const user = await requireAuth()

  try {
    const validated = UpdateSparkSchema.parse(input)
    // ... rest of function using validated data
  } catch (error) {
    return formatActionError(error, 'updateSpark')
  }
}

export async function deleteSpark(input: z.infer<typeof DeleteSparkSchema>) {
  const user = await requireAuth()

  try {
    const validated = DeleteSparkSchema.parse(input)
    // ... rest of function using validated data
  } catch (error) {
    return formatActionError(error, 'deleteSpark')
  }
}
```

**Lines added**: ~60 lines (schemas)
**Security improvement**: Prevents invalid selections, chunk IDs, content length attacks

---

### 2.2 Connections Actions Validation

**File**: `src/app/actions/connections.ts`

**Changes**: Add schemas for connection operations

**Code**:
```typescript
import { z } from 'zod'

// ============================================
// ZOD SCHEMAS
// ============================================

const ConnectionFeedbackSchema = z.enum(['validate', 'reject', 'star'])

const UpdateConnectionFeedbackSchema = z.object({
  connectionId: z.string().uuid(),
  feedback: ConnectionFeedbackSchema,
})

const DetectConnectionsSchema = z.object({
  documentId: z.string().uuid(),
  chunkIds: z.array(z.string().uuid()).min(1).max(100),
})

const GetConnectionsSchema = z.object({
  chunkIds: z.array(z.string().uuid()).min(1).max(50),
})

// Apply to functions:
export async function updateConnectionFeedback(
  input: z.infer<typeof UpdateConnectionFeedbackSchema>
) {
  const user = await requireAuth()
  try {
    const validated = UpdateConnectionFeedbackSchema.parse(input)
    // ... rest
  } catch (error) {
    return formatActionError(error, 'updateConnectionFeedback')
  }
}

// Repeat for other functions...
```

**Security improvement**: Validates feedback enum, prevents invalid UUIDs, enforces array limits

---

### 2.3-2.6 Remaining Server Actions (AS PLANNED)

Apply similar patterns to all 23 unprotected files:

**Critical Priority** (user data at risk):
- `src/app/actions/settings.ts` - Obsidian/Readwise settings
- `src/app/actions/enrichments.ts` - Metadata extraction
- `src/app/actions/delete-document.ts` - Deletion operations
- `src/app/actions/admin.ts` - Job operations

**High Priority** (data integrity):
- `src/app/actions/integrations.ts` - External API keys
- `src/app/actions/preferences.ts` - User preferences
- `src/app/actions/annotation-recovery.ts` - Recovery operations
- `src/app/actions/import-review.ts` - Conflict resolution

**Medium Priority** (documents subdirectory - 10 files):
- `src/app/actions/documents/*.ts` - All document operations

**Pattern for all**:
1. Add Zod schemas at top of file
2. Use `z.infer<typeof Schema>` for types
3. Call `.parse()` immediately after auth check
4. Use `formatActionError()` for error handling

---

### 2.7 Worker Handler Validation

**Overview**: Validate `output_data` JSONB before database writes in 18 worker handlers

**File**: `worker/types/job-schemas.ts` (ENHANCE)

**Changes**: Add Zod schemas for all job output_data structures

**Code**:
```typescript
import { z } from 'zod'

// ============================================
// WORKER JOB OUTPUT SCHEMAS
// ============================================

// Export Document Job
export const ExportJobOutputSchema = z.object({
  success: z.boolean(),
  documentCount: z.number().int().min(0),
  downloadUrl: z.string().url(),
  zipFilename: z.string().min(1).max(500),
  expiresAt: z.string().datetime(),
})

// Import Document Job
export const ImportJobOutputSchema = z.object({
  success: z.boolean(),
  documentId: z.string().uuid().optional(),
  chunksCreated: z.number().int().min(0).optional(),
  error: z.string().optional(),
})

// Process Document Job
export const ProcessJobOutputSchema = z.object({
  success: z.boolean(),
  chunksCreated: z.number().int().min(0).optional(),
  connectionsFound: z.number().int().min(0).optional(),
  processingTime: z.number().min(0).optional(),
  error: z.string().optional(),
})

// Detect Connections Job
export const DetectConnectionsOutputSchema = z.object({
  success: z.boolean(),
  connectionsFound: z.number().int().min(0),
  chunkIds: z.array(z.string().uuid()),
})

// Readwise Import Job
export const ReadwiseImportOutputSchema = z.object({
  success: z.boolean(),
  documentsImported: z.number().int().min(0),
  annotationsImported: z.number().int().min(0),
  duplicatesSkipped: z.number().int().min(0),
})

// Obsidian Sync Job
export const ObsidianSyncOutputSchema = z.object({
  success: z.boolean(),
  filesSynced: z.number().int().min(0),
  annotationsExported: z.number().int().min(0),
  sparksExported: z.number().int().min(0),
})

// ... Add schemas for all 18 handlers
```

**Usage in handlers**:
```typescript
// worker/handlers/export-document.ts
import { ExportJobOutputSchema } from '../types/job-schemas'

const outputData = {
  success: true,
  documentCount: documents.length,
  downloadUrl: signedUrl,
  zipFilename: filename,
  expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
}

// CRITICAL: Validate before database write
try {
  const validated = ExportJobOutputSchema.parse(outputData)

  await updateJob(jobId, {
    status: 'completed',
    output_data: validated, // TypeScript knows this is valid
  })
} catch (error) {
  console.error('[ExportJob] Invalid output_data:', error)
  throw new Error('Job output validation failed')
}
```

**Files to update**: 18 worker handlers

**Security improvement**: Prevents JSONB corruption, catches typos before they reach database, ensures UI can safely parse output_data

---

### 2.8 Response Type Enforcement

**Overview**: Update all Server Actions to use consistent `ActionResult<T>` type

**Files to update**: All 31 Server Actions

**Pattern**:
```typescript
// Before (inconsistent):
return { success: true, id: entityId }        // Some actions
return { success: true, data: result }        // Other actions
return { success: true }                      // Others still
return { success: false, error: 'message' }   // Errors

// After (consistent):
import { type ActionResult, successResponse, formatActionError } from '@/lib/error-utils'

export async function myAction(input: MyInput): Promise<ActionResult<MyData>> {
  try {
    // ... logic
    return successResponse(data) // Always { success: true, data }
  } catch (error) {
    return formatActionError(error, 'myAction') // Always { success: false, error, code }
  }
}
```

**Impact**: Frontend can rely on consistent response shape, easier error handling, better TypeScript inference

---

### Success Criteria

#### Automated Verification:
- [ ] All tests pass: `npm test`
- [ ] Type check passes: `npm run type-check`
- [ ] Linting passes: `npm run lint`
- [ ] Build succeeds: `npm run build`
- [ ] Validation works: Attempt to call action with invalid data (should fail gracefully)

#### Manual Verification:
- [ ] Invalid UUID shows helpful error message
- [ ] Out-of-range numbers rejected with clear message
- [ ] Invalid enum values rejected
- [ ] Valid inputs still work correctly
- [ ] Error messages reference specific field names
- [ ] Worker jobs with invalid output_data fail early

**Implementation Note**: Test each action group (sparks, connections, admin, workers) before moving to next.

### Service Restarts:
- [ ] Next.js: Auto-reload
- [ ] Worker: Restart to pick up new validation

---

## Phase 3: Critical Test Coverage

### Overview
Add tests for systems protecting irreplaceable user data (annotations, flashcards) and critical admin operations. Prevents regressions that could cause data loss.

**Philosophy**: Test based on replaceability, not coverage. Annotations and flashcards store hours of manual work - they MUST be tested.

---

### 3.1 Annotation System Tests

**File**: `src/app/actions/__tests__/annotations.test.ts` (NEW)

**Coverage**: All annotation CRUD operations (5-component ECS pattern)

**Test Count**: 12 tests covering CRUD + edge cases
**Lines**: ~200 lines of test code

(Full test code from original plan - unchanged)

---

### 3.2 Annotation Recovery Tests

**File**: `src/app/actions/__tests__/annotation-recovery.test.ts` (NEW)

**Coverage**: Position recovery after document edits

**Test Count**: 4 tests covering recovery scenarios
**Lines**: ~120 lines

(Full test code from original plan - unchanged)

---

### 3.3 Flashcard System Tests

**File**: `src/app/actions/__tests__/flashcards.test.ts` (NEW)

**Coverage**: Flashcard CRUD, study sessions, FSRS integration

**Test Count**: 8+ tests covering flashcard lifecycle and FSRS
**Lines**: ~250 lines

(Full test code from original plan - unchanged)

---

### 3.4 Admin Panel Tests

**Priority Order** (by complexity and risk):

#### Priority 1: IntegrationsTab (CRITICAL)

**File**: `src/components/admin/tabs/__tests__/IntegrationsTab.test.tsx` (NEW)

**Rationale**: 1,136 lines of complex integration logic (Readwise API, Obsidian sync) with 0% test coverage

**Coverage**: Readwise integration, Obsidian integration, sync operations

**Code**:
```typescript
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { IntegrationsTab } from '../IntegrationsTab'
import * as adminActions from '@/app/actions/integrations'
import * as settingsActions from '@/app/actions/settings'

jest.mock('@/app/actions/integrations')
jest.mock('@/app/actions/settings')

describe('IntegrationsTab', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('Readwise Integration', () => {
    it('should display API key input and test connection', async () => {
      ;(adminActions.testReadwiseConnection as jest.Mock).mockResolvedValue({
        success: true,
        data: { valid: true, booksCount: 42 }
      })

      render(<IntegrationsTab />)

      // Switch to Readwise tab
      const readwiseTab = screen.getByRole('tab', { name: /readwise/i })
      fireEvent.click(readwiseTab)

      // Enter API key
      const apiKeyInput = screen.getByLabelText(/api key/i)
      fireEvent.change(apiKeyInput, { target: { value: 'test-key-123' } })

      // Test connection
      const testButton = screen.getByRole('button', { name: /test connection/i })
      fireEvent.click(testButton)

      await waitFor(() => {
        expect(screen.getByText(/connected successfully/i)).toBeInTheDocument()
        expect(screen.getByText(/42.*books/i)).toBeInTheDocument()
      })
    })

    it('should handle invalid API key gracefully', async () => {
      ;(adminActions.testReadwiseConnection as jest.Mock).mockResolvedValue({
        success: false,
        error: 'Invalid API key'
      })

      render(<IntegrationsTab />)

      const readwiseTab = screen.getByRole('tab', { name: /readwise/i })
      fireEvent.click(readwiseTab)

      const apiKeyInput = screen.getByLabelText(/api key/i)
      fireEvent.change(apiKeyInput, { target: { value: 'invalid-key' } })

      const testButton = screen.getByRole('button', { name: /test connection/i })
      fireEvent.click(testButton)

      await waitFor(() => {
        expect(screen.getByText(/invalid api key/i)).toBeInTheDocument()
      })
    })

    it('should trigger import from Readwise', async () => {
      ;(adminActions.importFromReadwise as jest.Mock).mockResolvedValue({
        success: true,
        data: { documentsImported: 5, annotationsImported: 42 }
      })

      render(<IntegrationsTab />)

      const readwiseTab = screen.getByRole('tab', { name: /readwise/i })
      fireEvent.click(readwiseTab)

      const importButton = screen.getByRole('button', { name: /import/i })
      fireEvent.click(importButton)

      await waitFor(() => {
        expect(screen.getByText(/5.*documents.*imported/i)).toBeInTheDocument()
        expect(screen.getByText(/42.*annotations.*imported/i)).toBeInTheDocument()
      })
    })
  })

  describe('Obsidian Integration', () => {
    it('should configure vault settings', async () => {
      ;(settingsActions.saveObsidianSettings as jest.Mock).mockResolvedValue({
        success: true
      })

      render(<IntegrationsTab />)

      const obsidianTab = screen.getByRole('tab', { name: /obsidian/i })
      fireEvent.click(obsidianTab)

      // Fill out vault configuration
      const vaultPathInput = screen.getByLabelText(/vault path/i)
      fireEvent.change(vaultPathInput, { target: { value: '/Users/test/vault' } })

      const vaultNameInput = screen.getByLabelText(/vault name/i)
      fireEvent.change(vaultNameInput, { target: { value: 'My Vault' } })

      const rhizomePathInput = screen.getByLabelText(/rhizome path/i)
      fireEvent.change(rhizomePathInput, { target: { value: 'Rhizome/' } })

      const saveButton = screen.getByRole('button', { name: /save/i })
      fireEvent.click(saveButton)

      await waitFor(() => {
        expect(settingsActions.saveObsidianSettings).toHaveBeenCalledWith({
          vaultPath: '/Users/test/vault',
          vaultName: 'My Vault',
          rhizomePath: 'Rhizome/',
          syncAnnotations: expect.any(Boolean),
          exportSparks: expect.any(Boolean),
          exportConnections: expect.any(Boolean),
        })
      })
    })

    it('should trigger Obsidian sync', async () => {
      ;(adminActions.syncToObsidian as jest.Mock).mockResolvedValue({
        success: true,
        data: { filesSynced: 10, annotationsExported: 25 }
      })

      render(<IntegrationsTab />)

      const obsidianTab = screen.getByRole('tab', { name: /obsidian/i })
      fireEvent.click(obsidianTab)

      const syncButton = screen.getByRole('button', { name: /sync now/i })
      fireEvent.click(syncButton)

      await waitFor(() => {
        expect(screen.getByText(/10.*files.*synced/i)).toBeInTheDocument()
        expect(screen.getByText(/25.*annotations.*exported/i)).toBeInTheDocument()
      })
    })
  })

  describe('Integration Status', () => {
    it('should display last sync status', async () => {
      const mockStatus = {
        readwise: {
          lastSync: '2025-10-31T10:00:00Z',
          status: 'success',
          documentsImported: 5
        },
        obsidian: {
          lastSync: '2025-10-31T09:30:00Z',
          status: 'success',
          filesSynced: 10
        }
      }

      ;(adminActions.getIntegrationStatus as jest.Mock).mockResolvedValue({
        success: true,
        data: mockStatus
      })

      render(<IntegrationsTab />)

      const statusTab = screen.getByRole('tab', { name: /status/i })
      fireEvent.click(statusTab)

      await waitFor(() => {
        expect(screen.getByText(/readwise.*success/i)).toBeInTheDocument()
        expect(screen.getByText(/obsidian.*success/i)).toBeInTheDocument()
      })
    })

    it('should display error messages from failed syncs', async () => {
      const mockStatus = {
        readwise: {
          lastSync: '2025-10-31T10:00:00Z',
          status: 'error',
          error: 'API rate limit exceeded'
        }
      }

      ;(adminActions.getIntegrationStatus as jest.Mock).mockResolvedValue({
        success: true,
        data: mockStatus
      })

      render(<IntegrationsTab />)

      const statusTab = screen.getByRole('tab', { name: /status/i })
      fireEvent.click(statusTab)

      await waitFor(() => {
        expect(screen.getByText(/api rate limit exceeded/i)).toBeInTheDocument()
      })
    })
  })
})
```

**Test Count**: 8 tests covering integrations + status
**Lines**: ~400 lines (mocks for external APIs)

**Mock Strategy**:
- Mock Readwise API responses (success/failure)
- Mock Obsidian vault operations
- Mock sync status retrieval
- Test error handling for API failures

#### Priority 2: ScannerTab (AS PLANNED)

**File**: `src/components/admin/tabs/__tests__/ScannerTab.test.tsx` (NEW)

**Coverage**: Storage vs Database comparison

(Test code from original plan - unchanged)

#### Priority 3: ConnectionsTab (AS PLANNED)

**File**: `src/components/admin/tabs/__tests__/ConnectionsTab.test.tsx` (NEW)

**Coverage**: Connection reprocessing, smart mode

#### Priority 4: ExportTab (LOWER PRIORITY)

**File**: `src/components/admin/tabs/__tests__/ExportTab.test.tsx` (NEW)

**Coverage**: Export bundle generation (simpler logic, lower priority)

**Test Count**: 4 tabs × 3-5 tests = 15-20 tests total
**Lines**: ~600 lines total

---

### 3.5 Worker Main Pipeline Test

**File**: `worker/handlers/__tests__/process-document.test.ts` (NEW)

**Coverage**: Main orchestration logic

(Test code from original plan - unchanged)

**Test Count**: 5-6 tests
**Lines**: ~150 lines

---

### 3.6 Integration Tests

**Overview**: End-to-end flows for critical user paths

**File**: `tests/integration/critical-flows.test.ts` (NEW)

**Coverage**:
```typescript
describe('Critical User Flows', () => {
  it('should complete full annotation workflow', async () => {
    // 1. Upload document
    // 2. Process document
    // 3. Create annotation
    // 4. Update annotation
    // 5. Verify storage sync
    // 6. Delete annotation
  })

  it('should complete full flashcard study workflow', async () => {
    // 1. Create deck
    // 2. Create flashcards from selections
    // 3. Start study session
    // 4. Review cards with FSRS
    // 5. Verify SRS state updates
  })

  it('should handle document reprocessing with annotation recovery', async () => {
    // 1. Upload document
    // 2. Create annotations
    // 3. Trigger reprocessing
    // 4. Verify annotations recovered
    // 5. Check recovery confidence scores
  })
})
```

**Test Count**: 3-5 integration tests
**Lines**: ~300 lines

---

### Success Criteria

#### Automated Verification:
- [ ] All new tests pass: `npm test`
- [ ] Critical tests pass: `npm run test:critical`
- [ ] Coverage increased for:
  - Annotations: 0% → 70%+
  - Flashcards: 0% → 70%+
  - Admin Panel: 14% → 60%+ (includes IntegrationsTab)
  - Integration flows: New coverage
- [ ] Type check passes: `npm run type-check`
- [ ] Linting passes: `npm run lint`

#### Manual Verification:
- [ ] Tests accurately reflect real behavior
- [ ] Edge cases covered (invalid input, errors, edge conditions)
- [ ] Mocks properly isolated (no real database/network calls)
- [ ] Tests run fast (< 5 seconds for unit tests, < 30 seconds for integration)
- [ ] IntegrationsTab tests cover Readwise API mocking
- [ ] IntegrationsTab tests cover Obsidian vault operations

**Implementation Note**: Add tests incrementally (annotations → flashcards → integrations → admin panel → integration flows). Verify each group passes before moving to next.

### Service Restarts:
- [ ] No restarts needed (tests only)

---

## Phase 4: Documentation Modernization

### Overview
Update all documentation in `docs/` folder to match current implementation reality. Create new API references, guides, and pattern documentation optimized for LLM consumption. Focus on clarity, accuracy, and discoverability.

**Philosophy**: Documentation should be the source of truth. LLMs (and humans) should be able to quickly find relevant context, understand patterns, and locate specific implementations.

---

### 4.0 Documentation Audit (PREREQUISITE)

**Overview**: Clean up existing documentation before creating new content

#### 4.0.1 Merge Redundant Documentation

**ANNOTATIONS_SYSTEM.md Redundancy**:
- Both `ANNOTATIONS_SYSTEM.md` and `ANNOTATIONS_SYSTEM_V2.md` describe 5-component architecture
- V2 has more recent updates (cross-block resize implementation)
- Last updated: ANNOTATIONS_SYSTEM.md (2025-10-19), ANNOTATIONS_SYSTEM_V2.md (2025-10-30)

**Action**:
```bash
# Merge content from ANNOTATIONS_SYSTEM.md into ANNOTATIONS_SYSTEM_V2.md
# Delete ANNOTATIONS_SYSTEM.md
# Update all cross-references to point to ANNOTATIONS_SYSTEM_V2.md
```

**Files to update**:
- Delete: `docs/ANNOTATIONS_SYSTEM.md`
- Keep: `docs/ANNOTATIONS_SYSTEM_V2.md` (rename to `ANNOTATIONS_SYSTEM.md` after merge)
- Update references in: `docs/IMPLEMENTATION_STATUS.md`, `CLAUDE.md`, other docs

#### 4.0.2 Prune Archived Documentation

**Current State**: 204 archived docs vs 92 active (2.2:1 bloat ratio)

**Strategy**: Keep only 6 months of archives

**Action**:
```bash
# Find archives older than 6 months
find docs -path "*/.archive/*" -o -path "*/archive/*" -mtime +180

# Review and delete
# Expected reduction: 204 → ~50 archived docs
```

**Directories to clean**:
- `docs/.archive/`
- `docs/todo/.archive/`
- `docs/tasks/.archive/`
- `docs/prps/.archive/`
- `docs/testing/.archive/`

#### 4.0.3 Create Navigation Hub

**File**: `docs/INDEX.md` (NEW)

**Purpose**: Central entry point for all documentation

**Code**:
```markdown
# Rhizome V2 Documentation Index

**Quick Links**: [API Reference](#api-reference) • [Architecture](#architecture) • [Guides](#guides) • [Testing](#testing)

---

## API Reference

Complete reference for all public APIs:

- **[Server Actions](api/SERVER_ACTIONS.md)** - 31 Server Actions with Zod schemas
- **[Worker Handlers](api/WORKER_HANDLERS.md)** - 18 background job handlers
- **[ECS Operations](api/ECS_OPERATIONS.md)** - Entity-Component-System operations classes
- **[Utilities](api/UTILITIES.md)** - Shared utilities (auth, validation, revalidation)

---

## Architecture

Core architectural patterns and decisions:

- **[Implementation Status](IMPLEMENTATION_STATUS.md)** - What's built vs planned
- **[Architecture Overview](ARCHITECTURE.md)** - System design and philosophy
- **[ECS Implementation](ECS_IMPLEMENTATION.md)** - Entity-Component-System pattern
- **[Storage-First Strategy](STORAGE_FIRST_PORTABILITY_GUIDE.md)** - Storage as source of truth
- **[Dual-Module Architecture](architecture/DUAL_MODULE.md)** - Main app vs worker separation
- **[Naming Conventions](architecture/NAMING_CONVENTIONS.md)** - 4-tier naming system

---

## Processing Pipeline

Document processing and chunking:

- **[Processing Pipeline](PROCESSING_PIPELINE.md)** - Complete 10-stage pipeline
- **[Chonkie Chunkers](processing-pipeline/CHONKIE_CHUNKERS.md)** - 9 chunking strategies
- **[Docling Configuration](docling/docling-configuration.md)** - Environment variables

---

## Systems Documentation

Feature-specific implementation guides:

- **[Annotations System](ANNOTATIONS_SYSTEM.md)** - 5-component ECS, recovery, resize
- **[Spark System](SPARK_SYSTEM.md)** - Quick capture, multi-selection
- **[Flashcard System](FLASHCARD_SYSTEM.md)** - FSRS integration, study sessions
- **[Job System](JOB_SYSTEM.md)** - Background jobs, pause/resume, retry

---

## Guides

How-to guides for common tasks:

- **[Creating Server Actions](guides/CREATING_SERVER_ACTIONS.md)** - Step-by-step with Zod validation
- **[Adding ECS Entities](guides/ADDING_ECS_ENTITIES.md)** - 5-component pattern
- **[Adding Processors](guides/ADDING_PROCESSORS.md)** - Document format support
- **[Testing Strategy](guides/TESTING_STRATEGY.md)** - Replaceability-based testing
- **[Zod Validation Patterns](guides/ZOD_PATTERNS.md)** - Common validation schemas

---

## Testing

Test organization and patterns:

- **[Testing Rules](testing/TESTING_RULES.md)** - Primary rules for AI agents
- **[Testing README](testing/TESTING_README.md)** - Quick start guide
- **[Critical Patterns](testing/critical-patterns.md)** - Code examples
- **[General Patterns](testing/general-patterns.md)** - Testing patterns

---

## User Experience

UI patterns and component guidelines:

- **[UI Patterns](UI_PATTERNS.md)** - No modals, persistent UI, feature-rich components
- **[React Guidelines](rEACT_GUIDELINES.md)** - Server/Client component rules

---

## State Management

Client-side state management:

- **[Zustand Rules](ZUSTAND_RULES.md)** - Comprehensive guide with 4 stores
- **[Zustand Pattern](ZUSTAND_PATTERN.md)** - Quick reference for migrations

---

## Development Workflow

Development process and tools:

- **[Migration Workflow](MIGRATION_WORKFLOW.md)** - Dual-worktree development
- **[Deploy Guide](DEPLOY.md)** - Production deployment
- **[Schema Safety](SCHEMA_SAFETY_GUIDELINES.md)** - Database safety
```

---

### 4.1 API References (EXPANDED)

#### 4.1.1 Server Actions API Reference

**File**: `docs/api/SERVER_ACTIONS.md` (NEW)

**Structure**:
```markdown
# Server Actions API Reference

Complete reference for all 31 Server Actions in Rhizome V2.

---

## Quick Navigation

- [Annotations](#annotations) - 5-component ECS for text highlights
- [Sparks](#sparks) - 4-component ECS for quick captures
- [Flashcards](#flashcards) - 5-component ECS for study system
- [Decks](#decks) - Hierarchical deck management
- [Study](#study) - FSRS-powered study sessions
- [Connections](#connections) - Connection management and feedback
- [Documents](#documents) - Document CRUD and processing
- [Chunks](#chunks) - Chunk operations
- [Admin](#admin) - Background job management
- [Settings](#settings) - User settings and preferences

---

## Common Patterns

### Authentication
All Server Actions require authentication:
\`\`\`typescript
import { requireAuth } from '@/lib/auth/require-auth'

export async function myAction(input: MyInput) {
  'use server'
  const user = await requireAuth() // Throws if not authenticated
  // ... action logic
}
\`\`\`

### Input Validation
All actions use Zod for runtime validation:
\`\`\`typescript
import { z } from 'zod'

const MyActionSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(100),
})

export async function myAction(input: z.infer<typeof MyActionSchema>) {
  'use server'
  const user = await requireAuth()

  try {
    const validated = MyActionSchema.parse(input)
    // ... logic using validated data
  } catch (error) {
    return formatActionError(error, 'myAction')
  }
}
\`\`\`

### Response Format
All actions return consistent response format:
\`\`\`typescript
type ActionResult<T> =
  | { success: true, data: T }
  | { success: false, error: string, code?: string }
\`\`\`

---

## Annotations

### createAnnotation

Creates a new annotation entity with 5 components (Position, Visual, Content, Temporal, ChunkRef).

**File**: `src/app/actions/annotations.ts:54`
**Auth**: ✅ Required
**Zod**: ✅ Validated
**Tests**: ❌ None (see Phase 3.1)
**Related**: [updateAnnotation](#updateannotation), [deleteAnnotation](#deleteannotation)

**Schema**:
\`\`\`typescript
const CreateAnnotationSchema = z.object({
  text: z.string().min(1).max(5000),
  chunkIds: z.array(z.string().uuid()).min(0).max(5).default([]),
  documentId: z.string().uuid(),
  startOffset: z.number().int().min(0),
  endOffset: z.number().int().min(0),
  color: z.enum(['yellow', 'green', 'blue', 'red', 'purple', 'orange', 'pink']),
  note: z.string().max(10000).optional(),
  tags: z.array(z.string()).optional(),
  textContext: z.object({
    before: z.string(),
    content: z.string(),
    after: z.string(),
  }),
  pdfPageNumber: z.number().int().positive().optional(),
  pdfRects: z.array(z.object({
    x: z.number(),
    y: z.number(),
    width: z.number(),
    height: z.number(),
    pageNumber: z.number().int().positive(),
  })).optional(),
})
\`\`\`

**Example**:
\`\`\`typescript
const result = await createAnnotation({
  text: "Selected text from document",
  chunkIds: ["chunk-uuid-1", "chunk-uuid-2"],
  documentId: "doc-uuid",
  startOffset: 100,
  endOffset: 200,
  color: "yellow",
  note: "Important concept",
  tags: ["key-idea", "review"],
  textContext: {
    before: "Text before selection",
    content: "Selected text from document",
    after: "Text after selection",
  },
  pdfPageNumber: 5,
  pdfRects: [{
    x: 100, y: 200, width: 300, height: 20, pageNumber: 5
  }],
})

if (result.success) {
  console.log('Annotation created:', result.data)
} else {
  console.error('Failed:', result.error)
}
\`\`\`

**Returns**: `ActionResult<string>` (entity ID)

**Revalidates**: `/read/${documentId}`

**ECS Components Created**:
- Position: Document location and PDF coordinates
- Visual: Color and display type
- Content: Note and tags
- Temporal: Created/updated timestamps
- ChunkRef: Associated chunk IDs

---

[Continue for all 31 Server Actions...]
```

**LLM-Friendly Features**:
- File paths with line numbers
- Status badges (Auth ✅/❌, Zod ✅/❌, Tests ✅/❌)
- Quick examples first
- Related actions cross-linked
- Searchable headers
- Consistent structure

#### 4.1.2 Worker Handlers API Reference (NEW)

**File**: `docs/api/WORKER_HANDLERS.md` (NEW)

**Structure**: Similar to Server Actions, but for 18 background job handlers

**Content**:
```markdown
# Worker Handlers API Reference

Complete reference for all 18 background job handlers in Rhizome V2.

---

## Quick Navigation

- [Document Processing](#document-processing) - Main pipeline jobs
- [Import/Export](#importexport) - Document import and export
- [Connections](#connections) - Connection detection and reprocessing
- [Recovery](#recovery) - Annotation and spark recovery
- [Integrations](#integrations) - Readwise and Obsidian sync
- [Flashcards](#flashcards) - AI-powered flashcard generation

---

## Common Patterns

### Handler Structure
All handlers follow this pattern:
\`\`\`typescript
export async function myHandler(
  supabase: SupabaseClient,
  job: BackgroundJob
): Promise<void> {
  try {
    // 1. Extract input_data
    const inputData = job.input_data as MyInputType

    // 2. Process job
    const result = await processMyJob(inputData)

    // 3. Validate output_data
    const validated = MyJobOutputSchema.parse(result)

    // 4. Update job status
    await updateJob(supabase, job.id, {
      status: 'completed',
      output_data: validated,
      completed_at: new Date().toISOString(),
    })
  } catch (error) {
    await updateJob(supabase, job.id, {
      status: 'failed',
      output_data: { error: error.message },
      completed_at: new Date().toISOString(),
    })
    throw error
  }
}
\`\`\`

### Output Validation
All handlers validate output_data with Zod:
\`\`\`typescript
import { MyJobOutputSchema } from '../types/job-schemas'

const outputData = {
  success: true,
  itemsProcessed: count,
  downloadUrl: url,
}

// CRITICAL: Validate before database write
const validated = MyJobOutputSchema.parse(outputData)
\`\`\`

---

## Document Processing

### processDocument

Main document processing pipeline (10 stages).

**File**: `worker/handlers/process-document.ts`
**Input**: Document ID, processing options
**Output**: Chunks created, connections found
**Zod**: ✅ Validated
**Tests**: ❌ None (see Phase 3.5)

**Input Schema**:
\`\`\`typescript
{
  document_id: string (UUID)
  skip_enrichment?: boolean
  chunker_type?: 'token' | 'sentence' | 'recursive' | ...
  processing_mode?: 'LOCAL' | 'CLOUD'
}
\`\`\`

**Output Schema**:
\`\`\`typescript
const ProcessJobOutputSchema = z.object({
  success: z.boolean(),
  chunksCreated: z.number().int().min(0).optional(),
  connectionsFound: z.number().int().min(0).optional(),
  processingTime: z.number().min(0).optional(),
  error: z.string().optional(),
})
\`\`\`

**Example**:
\`\`\`typescript
await createBackgroundJob({
  job_type: 'process_document',
  input_data: {
    document_id: 'doc-uuid',
    skip_enrichment: false,
    chunker_type: 'recursive',
    processing_mode: 'LOCAL',
  }
})
\`\`\`

---

[Continue for all 18 handlers...]
```

#### 4.1.3 ECS Operations Reference (NEW)

**File**: `docs/api/ECS_OPERATIONS.md` (NEW)

**Content**: Complete API for AnnotationOperations, SparkOperations, FlashcardOperations

#### 4.1.4 Utilities Reference (NEW)

**File**: `docs/api/UTILITIES.md` (NEW)

**Content**: All shared utilities from Phase 1 (auth, validation, revalidation, error handling)

---

### 4.2 Architecture Guides (NEW)

#### 4.2.1 Dual-Module Architecture

**File**: `docs/architecture/DUAL_MODULE.md` (NEW)

**Content**:
```markdown
# Dual-Module Architecture

Rhizome V2 uses a dual-module architecture to separate concerns:

---

## Module Overview

### Main App (`/`)
- **Technology**: Next.js 15 + React 19
- **Purpose**: Frontend UI and Server Actions
- **Location**: `src/`
- **Entry Point**: `src/app/`

### Worker Module (`/worker/`)
- **Technology**: Node.js background processing
- **Purpose**: Document processors, connection engines, jobs
- **Location**: `worker/`
- **Entry Point**: `worker/index.ts`

---

## Communication Pattern

**NEVER cross-import** between modules. Communication via database only.

**Pattern**:
\`\`\`
Main App                    Database                   Worker
─────────                   ────────                   ──────
Server Action      →    background_jobs table    →    Handler
  ↓                          ↓                          ↓
createBackgroundJob()   Insert row (pending)      Poll for jobs
  ↓                          ↓                          ↓
Return job ID          Worker picks up job        Process job
  ↓                          ↓                          ↓
Poll job status        Update row (completed)     Return result
  ↓                          ↓                          ↓
Display result         Read output_data           Done
\`\`\`

---

## Critical Rules

❌ **NEVER**:
\`\`\`typescript
// In src/app/actions/documents.ts
import { processDocument } from '@/worker/handlers/process-document' // ❌ WRONG
\`\`\`

✅ **ALWAYS**:
\`\`\`typescript
// In src/app/actions/documents.ts
await createBackgroundJob({
  job_type: 'process_document',
  input_data: { document_id: documentId }
})
\`\`\`

---

[Continue with module boundaries, shared code, testing strategies...]
```

#### 4.2.2 Naming Conventions

**File**: `docs/architecture/NAMING_CONVENTIONS.md` (NEW)

**Content**: Complete 4-tier naming system with examples

---

### 4.3 How-To Guides (NEW)

#### 4.3.1 Creating Server Actions

**File**: `docs/guides/CREATING_SERVER_ACTIONS.md` (NEW)

**Content**:
```markdown
# Creating Server Actions

Step-by-step guide to creating new Server Actions following Rhizome patterns.

---

## Template

\`\`\`typescript
'use server'

import { z } from 'zod'
import { requireAuth } from '@/lib/auth/require-auth'
import { createECSOperations } from '@/lib/ecs/utils'
import { revalidateDocument } from '@/lib/revalidation'
import { formatActionError, successResponse, type ActionResult } from '@/lib/error-utils'

// ============================================
// ZOD SCHEMAS
// ============================================

const MyActionSchema = z.object({
  documentId: z.string().uuid(),
  name: z.string().min(1).max(100),
  enabled: z.boolean().default(true),
})

// ============================================
// SERVER ACTION
// ============================================

export async function myAction(
  input: z.infer<typeof MyActionSchema>
): Promise<ActionResult<string>> {
  try {
    // 1. Authenticate
    const user = await requireAuth()

    // 2. Validate input
    const validated = MyActionSchema.parse(input)

    // 3. Business logic
    const ops = createECSOperations('annotation', user.id)
    const entityId = await ops.create({
      // ... entity data
    })

    // 4. Revalidate UI
    revalidateDocument(validated.documentId)

    // 5. Return success
    return successResponse(entityId)

  } catch (error) {
    return formatActionError(error, 'myAction')
  }
}
\`\`\`

---

## Checklist

- [ ] File in `src/app/actions/` directory
- [ ] `'use server'` directive at top
- [ ] Import all required utilities
- [ ] Zod schema defined
- [ ] `requireAuth()` called first
- [ ] Input validated with `.parse()`
- [ ] Consistent error handling with `formatActionError()`
- [ ] Consistent success with `successResponse()`
- [ ] Type signature: `Promise<ActionResult<T>>`
- [ ] Revalidate affected paths
- [ ] Add to API reference docs

---

[Continue with examples, common patterns, troubleshooting...]
```

#### 4.3.2-4.3.5 Other Guides

- **Adding ECS Entities**: Step-by-step for new entity types
- **Adding Processors**: New document format support
- **Testing Strategy**: How to write replaceability-based tests
- **Zod Validation Patterns**: Common validation schemas

---

### 4.4 LLM Optimization (SPECIFIED)

**Principles for LLM-friendly documentation**:

1. **File Paths with Line Numbers**: Always include `file.ts:123` references
2. **Quick Examples First**: Show code before explaining
3. **Status Badges**: Visual indicators (✅/❌) for Zod, Tests, Auth
4. **Cross-Linked**: Related actions/handlers linked
5. **Searchable Headers**: Clear, unique, indexable headings
6. **Consistent Structure**: Same format across all docs
7. **Code-Heavy**: More code examples, less prose
8. **Navigation Hubs**: INDEX.md and category pages

**Template for all API references**:
```markdown
## [Function Name]

[One-sentence description]

**File**: `path/to/file.ts:123`
**Auth**: ✅/❌
**Zod**: ✅/❌
**Tests**: ✅/❌
**Related**: [link], [link]

**Quick Example**:
\`\`\`typescript
[Working code example]
\`\`\`

**Schema**: [Zod schema]
**Returns**: [Return type]
**Revalidates**: [Paths]

**Details**: [Additional explanation if needed]
```

---

### Success Criteria

#### Automated Verification:
- [ ] All markdown files lint: `markdownlint docs/**/*.md`
- [ ] No broken links: `markdown-link-check docs/**/*.md`
- [ ] File paths valid: Check all `file.ts:123` references exist

#### Manual Verification:
- [ ] Documentation reflects current implementation
- [ ] All 31 Server Actions documented
- [ ] All 18 worker handlers documented
- [ ] How-to guides complete and accurate
- [ ] Navigation hub (INDEX.md) comprehensive
- [ ] Archive pruned (204 → ~50 docs)
- [ ] Redundant docs merged (ANNOTATIONS_SYSTEM.md)
- [ ] LLM-friendly format verified (file paths, badges, examples)

**Implementation Note**: Complete Phase 4.0 audit BEFORE creating new documentation to avoid duplicating work.

### Service Restarts:
- [ ] None (documentation only)

---

## Audit Findings Summary

### Key Metrics (Verified 2025-10-31)
- **VirtualizedReader**: 511 lines (recent refactoring completed)
- **God components identified**: IntegrationsTab (1,136 lines), UploadZone (879 lines)
- **Worker Supabase duplication**: 2 files (obsidian-sync, continue-processing)
- **Zod coverage**: 26% (8/31 files), 23 files unprotected
- **Lines saved potential**: ~250 lines from utility consolidation

### Enhanced Scope
- **Phase 0**: Pre-implementation audit
- **Phase 1.6**: Component breakdown (IntegrationsTab, UploadZone)
- **Phase 1.7**: Storage integrity utilities
- **Phase 2.7**: Worker handler Zod validation (18 handlers)
- **Phase 2.8**: Response type enforcement
- **Phase 3.4**: Admin Panel tests (IntegrationsTab priority #1)
- **Phase 3.6**: Integration tests (end-to-end flows)
- **Phase 4.0**: Documentation audit (prerequisite for 4.1-4.4)
- **Phase 4.1-4.4**: API references, architecture guides, how-to guides

### Total Impact
- **Code Quality**: ~250 lines saved, 2 god components refactored
- **Security**: 100% Server Actions + worker handlers validated (49 files total)
- **Test Coverage**:
  - Annotations: 0% → 70%+
  - Flashcards: 0% → 70%+
  - Admin Panel: 14% → 60%+ (includes IntegrationsTab)
  - Integration: NEW coverage
- **Documentation**:
  - Archive: 204 → ~50 docs
  - New structure: api/, architecture/, guides/
  - LLM-optimized format
  - Merged redundancies

---

## References
- **Audit Notes**: Comprehensive review conducted 2025-10-31
- **Architecture**: `docs/ARCHITECTURE.md`
- **Pipeline**: `docs/PROCESSING_PIPELINE.md`
- **Testing**: `docs/testing/TESTING_RULES.md`
- **ECS**: `docs/ECS_IMPLEMENTATION.md`
- **Storage-First**: `docs/STORAGE_FIRST_PORTABILITY_GUIDE.md`
