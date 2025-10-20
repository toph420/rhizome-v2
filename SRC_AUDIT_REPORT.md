# Rhizome V2 - src/ Directory Audit Report

**Date**: 2025-10-19
**Focus**: TypeScript errors, type issues, unused files, broken imports, dead code
**Total TS Errors**: 669

---

## EXECUTIVE SUMMARY

The src/ directory has **significant TypeScript compilation issues** (669 errors) that prevent deployment. The issues fall into these categories:

1. **Type System Misalignment** - Mock data uses old engine types; missing type exports
2. **API Route Issues** - Obsolete API routes and missing type declarations
3. **Breaking API Changes** - Parameter name changes (chunkId → chunkIds) in ECS layer
4. **Cookie API Migration** - Next.js 15 cookie API changes not applied consistently
5. **Test Infrastructure Issues** - Jest configuration problems, test setup issues
6. **Dead Code Candidates** - Unused design components, outdated test data

---

## CRITICAL ISSUES (Blocks Compilation)

### 1. Type Export Missing from ECS Module
**Files**: `src/hooks/useAnnotations.ts` (line 15)
**Error**: `Cannot find AnnotationEntity exported from '@/lib/ecs/annotations'`
**Details**: 
- `useAnnotations.ts` imports `AnnotationEntity` from `@/lib/ecs/annotations`
- `AnnotationEntity` is defined in `@/lib/ecs/components.ts` but NOT exported from `annotations.ts`
- `annotations.ts` only exports input/output types for AnnotationOperations, not the component types

**Fix Required**:
```typescript
// src/lib/ecs/annotations.ts - Add export
export type { AnnotationEntity } from './components'
```

### 2. Mock Connection Data Uses Obsolete Engine Types
**File**: `src/lib/annotations/mock-connections.ts` (53 errors across lines 33-573)
**Error**: Type 'string' is not assignable to type 'SynthesisEngine'
**Issue**: 
- Uses 7 engine types: `'semantic'`, `'thematic'`, `'structural'`, `'contradiction'`, `'emotional'`, `'methodological'`, `'temporal'`
- Current system only has 3: `'semantic_similarity'`, `'thematic_bridge'`, `'contradiction_detection'`
- Lines affected: 33, 44, 55, 66, 77, 88, 99, 112, 123, 134, 145, 156, 167, 178, 191, 202, 213, 224, 235, 246, 257, 270, 281, 292, 303, 314, 325, 336, 349, 360, 371, 382, 393, 404, 415, 428, 439, 450, 461, 472, 483, 494, 507, 518, 529, 540, 551, 562, 573

**Fix Required**: Update all engine_type values to match 3-engine system

### 3. Next.js 15 Cookie API - Cookies Async
**File**: `src/app/actions/preferences.ts` (lines 20, 66-67)
**Error**: Property 'get' does not exist on type 'Promise<ReadonlyRequestCookies>' (TS2339)
**Details**:
- Next.js 15 changed `cookies()` to return Promise
- Current code treats return as synchronous
- Line 20: `cookieStore.get(name)?.value` fails because cookieStore is a Promise

**Fix Required**:
```typescript
async function getSupabaseAdmin() {
  const cookieStore = await cookies()  // Add await
  // Rest of code...
}
```

Also need to make the function async and update all call sites.

### 4. Missing Type Declaration: adm-zip
**File**: `src/app/api/extract-epub-metadata/route.ts` (line 3)
**Error**: Could not find declaration file for module 'adm-zip'
**Details**: No @types/adm-zip package installed, library has implicit any type

**Quick Fix**: Add `// @ts-ignore` or install types package

### 5. Missing Text Context Type Export
**File**: `src/lib/annotations/text-range.ts` (line 6)
**Error**: Module '@/types/annotations' has no exported member 'TextContext'
**Details**: 
- `text-range.ts` tries to import `TextContext` type
- Type doesn't exist in `@/types/annotations.ts`
- Likely should be `TextSelection` or needs new definition

### 6. Missing Recovery Types Import
**File**: `src/components/sidebar/AnnotationReviewTab.tsx` (line 11)
**Error**: Cannot find module '../../worker/types/recovery' 
**Details**: 
- AnnotationReviewTab imports from worker directory
- This creates circular dependency (frontend depending on backend types)
- `RecoveryResults` and `ReviewItem` types are imported but not found

---

## HIGH PRIORITY ISSUES (Breaks Features)

### 7. Parameter Name Breaking Change: chunkId → chunkIds
**Files**: 
- `src/app/test-annotations/page.tsx` (lines 30, 57)
- `src/app/actions/documents.ts` - Debug logs reference

**Issue**:
- Test page uses `chunkId: string` in annotation creation
- ECS layer expects `chunkIds: string[]` (array)
- This will cause runtime errors when creating annotations

**Fix Required**: Update test page to use `chunkIds` array:
```typescript
// Before
chunkId: '00000000-0000-0000-0000-000000000100'

// After  
chunkIds: ['00000000-0000-0000-0000-000000000100']
```

### 8. EngineType References in preferences.ts
**File**: `src/app/actions/preferences.ts` (lines 76-82)
**Issue**: 
- Uses 7-engine EngineType enum that doesn't match 3-engine system
- References: SEMANTIC_SIMILARITY, STRUCTURAL_PATTERN, TEMPORAL_PROXIMITY, CONCEPTUAL_DENSITY, EMOTIONAL_RESONANCE, CITATION_NETWORK, CONTRADICTION_DETECTION
- Current system only has: semantic_similarity, thematic_bridge, contradiction_detection

**Fix Required**: Update to match 3-engine system

### 9. Type Conflicts: WeightConfig Import
**File**: `src/components/preferences/WeightConfig.tsx` (line 27)
**Error**: Import 'WeightConfig' conflicts with local value
**Details**: 
- Importing `WeightConfig` type from module
- But component also named `WeightConfig`
- Needs type-only import due to isolatedModules

**Fix Required**:
```typescript
import type { WeightConfig } from '@/types/collision-detection'
```

### 10. Undefined Null Reference in QuickSparkCapture
**File**: `src/components/reader/QuickSparkCapture.tsx` (line 130)
**Error**: 'textareaRef.current' is possibly 'null'
**Details**: 
- Direct null check needed before using ref
- Line 130 uses textareaRef.current without safe navigation

### 11. Untyped Function Parameters
**File**: `src/components/sidebar/AnnotationReviewTab.tsx` (multiple lines)
**Errors**: Parameter implicitly has 'any' type
- Lines 97, 137, 167, 178, 189, 212, 215, 226, 353 (multiple params)
- Array callback parameters not typed

**Fix Required**: Add explicit types to all callback parameters

### 12. Implicit 'any' Type Annotations
**File**: `src/app/api/extract-epub-metadata/route.ts` (line 212)
**Error**: Parameter 'entry' implicitly has an 'any' type
**Fix**: Add parameter type: `(entry: unknown) =>`

### 13. Possibly Undefined Object Access
**File**: `src/components/sidebar/AnnotationReviewTab.tsx` (line 97)
**Error**: Parameter 'r' implicitly has an 'any' type in array callback
**Fix**: Type all recovery array callbacks

---

## OUTDATED FILES & COMPONENTS

### Test Files (12 total test files found)

All test files present, but several have outdated references:

**Test Files**:
- `src/lib/ecs/__tests__/ecs-comprehensive.test.ts` (587 lines)
- `src/lib/ecs/__tests__/ecs-working.test.ts` 
- `src/lib/ecs/__tests__/ecs.test.ts`
- `src/lib/ecs/__tests__/sparks.test.ts` (has TODO comments)
- `src/lib/reader/__tests__/chunk-utils.test.ts`
- `src/lib/reader/__tests__/highlight-injector.test.ts`
- `src/lib/reader/__tests__/offset-calculator.test.ts`
- `src/lib/reader/__tests__/resize-detection.test.ts`
- `src/stores/__tests__/processing-store.test.ts`
- `src/app/actions/__tests__/chunks.test.ts` (640 lines)
- `src/app/actions/__tests__/documents.test.ts` (736 lines)
- `src/stores/admin/__tests__/storage-scan.test.ts`
- `src/components/admin/__tests__/ConflictResolutionDialog.test.tsx`
- `src/components/admin/tabs/__tests__/ImportTab.test.tsx` (612 lines)

**Issues in Sparks Tests**: 
File: `src/lib/ecs/__tests__/sparks.test.ts`
- Lines with TODO: "TODO: Implement comprehensive mocking for component verification"
- 7 lines (all test methods) marked with "TODO: Implement with proper mocks"
- Tests are skeleton/incomplete

### Dead Code Candidates

**Design Components** (mostly unused, only referenced in `/design` pages):
- `src/components/design/ExperimentalPlayground.tsx` (862 lines) → `/design` page only
- `src/components/design/ModernReaderShowcase.tsx` (783 lines) → `/design/v2` only
- `src/components/design/PremiumEdgeNavigation.tsx` (713 lines) → Not imported anywhere
- `src/components/design/BrutalistComponents.tsx` (669 lines) → Not imported anywhere  
- `src/components/design/EdgeNavigationDemo.tsx` (489 lines) → Not imported anywhere

**Total Dead Design Code**: ~3,516 lines in 5 components

**Assessment**: 
- These appear to be UI prototyping experiments
- Referenced only in `/design` routes (admin/development only)
- Safe to remove but may be kept for future reference
- Could be moved to separate prototyping branch/directory

---

## TODO & DEBUG COMMENTS

Found in code (7 instances):

1. **src/lib/ecs/__tests__/sparks.test.ts:N/A** - "TODO: Implement comprehensive mocking"
2. **src/lib/ecs/__tests__/sparks.test.ts** - 7x "TODO: Implement with proper mocks"
3. **src/app/actions/sparks.ts** - `embedding: null, // TODO: Generate via background job`
4. **src/components/admin/ConflictResolutionDialog.tsx** - "// TODO: Show error toast" (2x)
5. **src/components/sidebar/RightPanel.tsx** - "Badge counts (TODO: fetch real counts from database)"
6. **src/components/sidebar/FlashcardsTab.tsx** - "TODO: Fetch flashcards from database once ECS component is built"
7. **src/components/reader/BlockRenderer.tsx** - "// DEBUG: Log when annotations change"
8. **src/app/actions/documents.ts** - "console.log('[uploadDocument] Processing flags DEBUG:..."

---

## MISSING TYPE DEFINITIONS

### Worker Module Types Referenced from Frontend

**File**: `src/components/sidebar/AnnotationReviewTab.tsx` (line 11)
```typescript
import type { RecoveryResults, ReviewItem } from '../../worker/types/recovery'
```

**Issue**: 
- Frontend imports worker types directly
- Creates coupling between frontend and backend type systems
- Worker module types may not exist at the expected path

**Files Needing Investigation**:
- `worker/types/recovery.ts` - Does this exist?
- `worker/types/processor.ts` - Referenced in worker tests but may have issues

---

## API ROUTE ISSUES

### 3 String Type Assignments in extract-metadata/route.ts

**File**: `src/app/api/extract-metadata/route.ts` (lines 30, 34)
**Errors**: Type 'string | undefined' is not assignable to type 'string'
**Details**: 
- Parameters may be undefined but code treats as required string
- Need null coalescing or default values

**Fix Required**:
```typescript
// Line 30
const documentId = params?.id ?? ''  // or throw error
```

### extract-text-metadata/route.ts Parameter Count
**File**: `src/app/api/extract-text-metadata/route.ts` (line 70)
**Error**: Expected 1 arguments, but got 2
**Details**: Function call signature mismatch

---

## OBSOLETE API ROUTES

### Successfully Deleted (Good!)
- `src/app/api/obsidian/continue-processing/route.ts` ✓ Deleted
- `src/app/api/obsidian/export/route.ts` ✓ Deleted
- `src/app/api/obsidian/status/[jobId]/route.ts` ✓ Deleted
- `src/app/api/obsidian/sync-async/route.ts` ✓ Deleted
- `src/app/api/obsidian/sync/route.ts` ✓ Deleted

**Status**: All old Obsidian API routes have been properly removed. Integration now uses background jobs.

---

## FILE ORGANIZATION ISSUES

### Cross-Module Imports (Antipattern)
- Frontend imports from worker module (`../../worker/types/recovery`)
- Creates circular dependency risk
- Violates separation of concerns

**Solution**: Move shared types to `src/types/` directory instead

---

## SUMMARY TABLE

| Category | Count | Severity | Files |
|----------|-------|----------|-------|
| Type Errors | 200+ | CRITICAL | preferences.ts, mock-connections.ts, annotations.ts |
| Missing Exports | 3 | CRITICAL | annotations.ts, text-range.ts, recovery types |
| API Changes | 5 | HIGH | preferences.ts, preferences.tsx |
| Parameter Changes | 2 | HIGH | test-annotations page, ECS layer |
| Untyped Params | 20+ | MEDIUM | AnnotationReviewTab, various callbacks |
| Dead Code | ~3.5K LOC | LOW | Design components (5 files) |
| TODO Comments | 8 | LOW | Various files |
| Test Skeleton Code | 7 tests | MEDIUM | sparks.test.ts |

---

## RECOMMENDED FIXES (Priority Order)

### Phase 1: CRITICAL (Blocks Compilation)
1. Export `AnnotationEntity` from `@/lib/ecs/annotations.ts`
2. Fix mock-connections.ts: Update 53 engine_type references to 3-engine system
3. Fix preferences.ts: Make `getSupabaseAdmin()` async and await cookies()
4. Fix chunkId → chunkIds parameter change in test page and ECS calls
5. Add type for TextContext or fix text-range.ts imports
6. Resolve RecoveryResults/ReviewItem type path or move to src/types/

### Phase 2: HIGH (Breaks Features)
7. Update preferences.ts to use 3-engine system (remove 7-engine references)
8. Add explicit types to callback parameters in AnnotationReviewTab
9. Fix null checks for ref.current in QuickSparkCapture
10. Resolve WeightConfig import conflict with type-only import
11. Fix string | undefined → string assignments in API routes

### Phase 3: MEDIUM (Code Quality)
12. Remove TODO from sparks.test.ts or implement tests
13. Remove DEBUG logging from production code
14. Move design components to separate directory or remove
15. Replace frontend→worker imports with proper shared types in src/types/
16. Add types to all implicit any parameters

### Phase 4: LOW (Cleanup)
17. Consider removing dead design components (5 files, ~3.5K LOC)
18. Consolidate test files organization
19. Document expected test structure for future tests

---

## NEXT STEPS

1. **Immediate**: Run fixes for Phase 1 (Type System Alignment)
2. **Then**: Verify TypeScript compilation: `npx tsc --noEmit`
3. **Then**: Run tests: `npm run test:critical`
4. **Finally**: Address Phase 3-4 improvements

**Estimated Fix Time**: 2-3 hours for Phase 1-2, 1-2 hours for Phase 3-4
