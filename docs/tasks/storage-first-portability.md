# Storage-First Portability System - Task Breakdown

**Source PRP**: [docs/prps/storage-first-portability.md](../prps/storage-first-portability.md)
**Feature Priority**: P0 (Critical)
**Estimated Total Effort**: 4-5 weeks
**Created**: 2025-10-12
**Status**: Ready for Implementation

---

## Overview

This task breakdown implements the Storage-First Portability System, transforming Rhizome's architecture to treat Storage as the source of truth for expensive AI-enriched data. The system enables zero-cost database resets, intelligent import/export workflows, and comprehensive document portability.

### Key Deliverables
1. **Automatic Storage Export**: Save chunks.json, metadata.json, manifest.json during processing
2. **Admin Panel UI**: Centralized Sheet-based interface with 6 tabs
3. **Storage Scanner**: Compare Storage vs Database with sync actions
4. **Import Workflow**: Restore from Storage with intelligent conflict resolution
5. **Connection Reprocessing**: Three modes with user-validation preservation
6. **Export Workflow**: ZIP bundle generation for portability
7. **Integration Hub**: Obsidian and Readwise in Admin Panel

### Business Impact
- **Development Velocity**: DB reset + restore in 6 minutes vs 25 minutes reprocessing
- **Cost Savings**: $0.20-0.60 per document saved by avoiding reprocessing
- **Data Safety**: Zero data loss, Storage is source of truth
- **Portability**: Complete document bundles for backup/migration

---

## Phase 1: Storage Export Infrastructure

### T-001: Create Storage Helper Functions

**Priority**: Critical
**Estimated Effort**: 4 hours
**Dependencies**: None

#### Task Purpose
**As a** processing pipeline
**I need** standardized Storage operations (save, read, hash, list)
**So that** all processors can consistently save enriched data to Storage

#### Technical Requirements

**Files to Create**:
```
worker/lib/storage-helpers.ts - Storage operation utilities
worker/types/storage.ts - TypeScript interfaces for all export schemas
```

**Functional Requirements**:
- REQ-1: When saving JSON data, the system shall wrap in Blob to preserve formatting
- REQ-2: When reading from Storage, the system shall use signed URLs with 1-hour expiry
- REQ-3: When hashing content, the system shall use SHA256 for consistency
- REQ-4: When listing files, the system shall return name, size, updated_at

**Implementation Steps**:
1. Create `worker/lib/storage-helpers.ts` with functions:
   - `saveToStorage(supabase, path, data, options)` → void
   - `readFromStorage<T>(supabase, path)` → Promise<T>
   - `hashContent(content)` → string (SHA256)
   - `listStorageFiles(supabase, path)` → Promise<FileInfo[]>
2. Create `worker/types/storage.ts` with interfaces:
   - `ChunksExport`, `CachedChunksExport`, `MetadataExport`, `ManifestExport`
   - All supporting types (ChunkExportData, FileInfo, etc.)
3. Add error handling for Storage API failures (non-fatal, log-only)
4. Add JSDoc comments with usage examples

**Code Patterns to Follow**:
- **Supabase Storage**: `worker/lib/cached-chunks.ts:89-115` - Storage upload pattern
- **Error Handling**: `worker/lib/errors.ts` - ProcessingError classes
- **Type Safety**: `worker/types/` - Existing type definitions

#### Acceptance Criteria

**Given-When-Then Scenarios**:
```gherkin
Scenario 1: Save JSON to Storage
  Given a valid Supabase client and JSON data
  When saveToStorage is called with path "test/data.json"
  Then the file should be created in Storage as a Blob
  And the file should have application/json content type
  And the file should be upsertable (overwrite existing)

Scenario 2: Read JSON from Storage
  Given a JSON file exists at "test/data.json"
  When readFromStorage is called with that path
  Then a signed URL should be created with 1-hour expiry
  And the file should be fetched and parsed as JSON
  And the returned data should match the original

Scenario 3: Hash content consistently
  Given the same content string
  When hashContent is called multiple times
  Then all hash values should match
  And the hash should be 64-character hex string (SHA256)

Scenario 4: List directory files
  Given a Storage directory with 5 files
  When listStorageFiles is called
  Then it should return an array of 5 FileInfo objects
  And each should have name, size, updated_at fields
```

**Rule-Based Criteria**:
- [ ] **Functional**: All 4 functions work correctly with Supabase Storage
- [ ] **Error Handling**: Storage failures log warnings but don't throw (non-fatal)
- [ ] **Type Safety**: All functions properly typed with generics
- [ ] **Performance**: Signed URLs cached for duration, no unnecessary API calls
- [ ] **Security**: Signed URLs expire after 1 hour
- [ ] **Documentation**: JSDoc comments with usage examples

#### Validation Commands

```bash
# Unit tests
cd worker
npx jest lib/__tests__/storage-helpers.test.ts

# Type checking
npx tsc --noEmit

# Manual validation
# 1. Run test script: npx tsx scripts/test-storage-helpers.ts
# 2. Verify file created in Supabase Storage UI
# 3. Download file, verify JSON formatting preserved
# 4. Check hash consistency across multiple runs
```

#### Resources & References

**Documentation**:
- Supabase Storage API: https://supabase.com/docs/reference/javascript/storage
- Node crypto module: https://nodejs.org/api/crypto.html

**Code References**:
- Storage upload pattern: `worker/lib/cached-chunks.ts:89-115`
- Type definitions: `worker/types/database.ts`

---

### T-002: Define JSON Export Schemas

**Priority**: Critical
**Estimated Effort**: 3 hours
**Dependencies**: None (can run parallel with T-001)

#### Task Purpose
**As a** developer implementing import/export
**I need** complete TypeScript interfaces for all JSON schemas
**So that** data is consistently structured and validated

#### Technical Requirements

**Files to Create**:
```
worker/types/storage.ts - Export schema TypeScript interfaces
```

**Functional Requirements**:
- REQ-1: Each schema shall have a version field (currently "1.0")
- REQ-2: ChunksExport shall exclude database IDs and embeddings (not portable)
- REQ-3: CachedChunksExport shall include markdown_hash for validation
- REQ-4: ManifestExport shall track processing costs and times

**Schema Definitions** (from PRP lines 111-2151):
1. **ChunksExport**: Enriched chunks with full metadata
2. **CachedChunksExport**: Docling extraction for LOCAL mode
3. **MetadataExport**: Document-level metadata
4. **ManifestExport**: File inventory, costs, processing times
5. **ImportConflict**: Conflict resolution data structure
6. **ReprocessOptions**: Connection reprocessing configuration

**Implementation Steps**:
1. Create interfaces matching PRP schema definitions
2. Add JSDoc comments with field descriptions
3. Define supporting types (FileInfo, BBox, ConflictStrategy, etc.)
4. Export all types from index
5. Validate schema completeness against PRP

**Code Patterns to Follow**:
- **Type Structure**: `worker/types/database.ts` - Existing database types
- **Metadata Types**: `worker/lib/chunking/pydantic-metadata.ts:12-50` - Metadata interfaces

#### Acceptance Criteria

**Rule-Based Criteria**:
- [ ] **Completeness**: All 6 main schemas defined (Chunks, CachedChunks, Metadata, Manifest, ImportConflict, ReprocessOptions)
- [ ] **Type Safety**: All fields properly typed (no `any` except JSON blobs)
- [ ] **Documentation**: JSDoc comments on all interfaces and complex fields
- [ ] **Validation**: Version field on all export schemas
- [ ] **Consistency**: Field names match database column names (snake_case)
- [ ] **Exclude**: Embeddings and UUIDs not in ChunksExport (not portable)

#### Validation Commands

```bash
# Type checking
cd worker
npx tsc --noEmit types/storage.ts

# Validation script
npx tsx scripts/validate-schemas.ts
```

---

### T-003: Add saveStageResult to Base Processor

**Priority**: Critical
**Estimated Effort**: 6 hours
**Dependencies**: T-001 (storage helpers)

#### Task Purpose
**As a** document processor
**I need** to save intermediate and final results to Storage
**So that** processing can be paused/resumed and data is backed up

#### Technical Requirements

**Files to Modify**:
```
worker/processors/base.ts - Add saveStageResult() method
```

**Functional Requirements**:
- REQ-1: When processing stage completes, the system shall save stage data to Storage
- REQ-2: When final flag is true, the system shall save to final filename (e.g., chunks.json)
- REQ-3: When final flag is false, the system shall save to stage-{name}.json
- REQ-4: When Storage save fails, the system shall log warning but continue processing (non-fatal)

**Implementation Steps**:
1. Import storage helpers in base processor
2. Add `saveStageResult()` protected method to BaseProcessor class
3. Implement stage vs final path logic
4. Add try-catch with console.warn for non-fatal failures
5. Add JSDoc with usage example

**Method Signature**:
```typescript
protected async saveStageResult(
  stage: string,
  data: any,
  options?: { final?: boolean }
): Promise<void>
```

**Code Patterns to Follow**:
- **Base Processor**: `worker/processors/base.ts` - Existing structure
- **Error Handling**: Log warnings for non-critical failures
- **Storage Path**: `${userId}/${documentId}/stage-{name}.json` or `${userId}/${documentId}/{name}.json`

#### Acceptance Criteria

```gherkin
Scenario 1: Save intermediate stage
  Given processing completes extraction stage
  When saveStageResult('extraction', data, { final: false }) is called
  Then file should be saved to "{userId}/{docId}/stage-extraction.json"
  And data should include version, document_id, stage, timestamp fields

Scenario 2: Save final result
  Given chunking stage completes
  When saveStageResult('chunking', data, { final: true }) is called
  Then file should be saved to "{userId}/{docId}/chunks.json"
  And file should follow ChunksExport schema

Scenario 3: Handle Storage failure gracefully
  Given Supabase Storage is unavailable
  When saveStageResult is called
  Then a warning should be logged
  And processing should continue (no throw)
  And job status should not be affected
```

**Rule-Based Criteria**:
- [ ] **Functional**: Method saves to correct paths (stage vs final)
- [ ] **Error Handling**: Storage failures are non-fatal (warn only)
- [ ] **Integration**: Works with existing processor flow
- [ ] **Type Safety**: Data parameter accepts any, output is Promise<void>
- [ ] **Documentation**: JSDoc with usage example

#### Validation Commands

```bash
# Unit tests
cd worker
npx jest processors/__tests__/base.test.ts

# Integration test
npx tsx scripts/test-processor-save.ts

# Manual verification
# 1. Process test document
# 2. Check Storage: documents/{userId}/{docId}/
# 3. Verify stage-*.json files created during processing
```

---

### T-004: Integrate Storage Saves in PDF Processor

**Priority**: Critical
**Estimated Effort**: 8 hours
**Dependencies**: T-003 (saveStageResult method)

#### Task Purpose
**As a** PDF processing pipeline
**I need** to save data at each processing checkpoint
**So that** expensive processing can be resumed and data is backed up

#### Technical Requirements

**Files to Modify**:
```
worker/processors/pdf-processor.ts - Add saveStageResult calls at 5 checkpoints
```

**Functional Requirements**:
- REQ-1: After Docling extraction, save extraction data (markdown + chunks + structure)
- REQ-2: After cleanup, save cleaned markdown
- REQ-3: After matching, save chunks.json (final)
- REQ-4: After metadata extraction, update chunks.json with enriched metadata (final)
- REQ-5: After finalization, save manifest.json (final)
- REQ-6: In LOCAL mode, save cached_chunks.json after Docling extraction

**Implementation Steps**:
1. Add save after Docling extraction (~line 140):
   ```typescript
   await this.saveStageResult('extraction', {
     markdown: result.markdown,
     doclingChunks: result.chunks,
     structure: result.structure
   })
   ```
2. Add save after cleanup (~line 185):
   ```typescript
   await this.saveStageResult('cleanup', { markdown: cleanedMarkdown })
   ```
3. Add save after matching (~line 230):
   ```typescript
   await this.saveStageResult('chunking', remappedChunks, { final: true })
   ```
4. Add save after metadata (~line 260):
   ```typescript
   await this.saveStageResult('metadata', enrichedChunks, { final: true })
   ```
5. Add save for manifest (~line 285):
   ```typescript
   await this.saveStageResult('manifest', manifestData, { final: true })
   ```
6. Add save for cached_chunks (LOCAL mode only):
   ```typescript
   if (processingMode === 'local') {
     await this.saveStageResult('cached_chunks', cachedChunksData, { final: true })
   }
   ```

**Code Patterns to Follow**:
- **PDF Processor**: `worker/processors/pdf-processor.ts` - Existing flow
- **Stage Pattern**: Existing stage tracking and progress updates
- **Conditional Save**: Check `processingMode` before cached_chunks save

#### Acceptance Criteria

```gherkin
Scenario 1: Process PDF in Cloud mode
  Given a 50-page PDF document
  When PDF processor runs to completion
  Then 5 stage files should be created in Storage
  And 3 final files should exist: chunks.json, metadata.json, manifest.json
  And cached_chunks.json should NOT exist (Cloud mode)

Scenario 2: Process PDF in LOCAL mode
  Given a 50-page PDF document with LOCAL processing mode
  When PDF processor runs to completion
  Then all 5 stage files should be created
  And 4 final files should exist: chunks.json, cached_chunks.json, metadata.json, manifest.json

Scenario 3: Resume from checkpoint
  Given processing stopped after extraction stage
  When stage-extraction.json exists in Storage
  Then processing should be able to resume from cleanup stage
  (Note: Resume logic is future enhancement, this validates data exists)

Scenario 4: Storage failure doesn't break processing
  Given Storage API fails during save
  When processing continues
  Then job should complete successfully
  And warning should be logged for failed save
```

**Rule-Based Criteria**:
- [ ] **Functional**: All 5 checkpoints save correctly
- [ ] **Conditional**: cached_chunks.json only saved in LOCAL mode
- [ ] **Schema**: Final files follow export schemas (Chunks, Metadata, Manifest)
- [ ] **Non-Breaking**: Storage failures don't stop processing
- [ ] **Performance**: Saves don't significantly slow processing (<5% overhead)
- [ ] **Validation**: JSON files conform to TypeScript schemas

#### Validation Commands

```bash
# Integration test
cd worker
npm run test:integration -- pdf-processor

# Manual test
npx tsx scripts/test-pdf-with-storage.ts test-files/sample.pdf

# Validation
# 1. Process PDF document
# 2. Check Storage: documents/{userId}/{docId}/
# 3. Verify 3 final files: chunks.json, metadata.json, manifest.json
# 4. Download chunks.json, validate schema with: npx tsx scripts/validate-chunks-schema.ts
# 5. Check manifest.json has correct file inventory and costs
```

---

### T-005: Integrate Storage Saves in EPUB Processor

**Priority**: High
**Estimated Effort**: 6 hours
**Dependencies**: T-004 (PDF processor pattern)

#### Task Purpose
**As an** EPUB processing pipeline
**I need** to save data at each processing checkpoint
**So that** EPUB books are backed up consistently with PDFs

#### Technical Requirements

**Files to Modify**:
```
worker/processors/epub-processor.ts - Add saveStageResult calls
```

**Functional Requirements**: Same as T-004, adapted for EPUB processing flow

**Implementation Steps**: Same pattern as T-004, but for EPUB-specific stages

#### Acceptance Criteria

Same as T-004, but with EPUB test files.

**Rule-Based Criteria**:
- [ ] **Functional**: All EPUB processing stages save to Storage
- [ ] **Consistency**: Same file structure as PDF processor
- [ ] **Schema**: Files conform to same export schemas
- [ ] **LOCAL Mode**: cached_chunks.json saved for LOCAL mode

#### Validation Commands

```bash
# Integration test
cd worker
npm run test:integration -- epub-processor

# Manual test
npx tsx scripts/test-epub-with-storage.ts test-files/sample.epub
```

---

### T-006: Phase 1 Validation & Testing

**Priority**: Critical
**Estimated Effort**: 6 hours
**Dependencies**: T-004, T-005 (all processors integrated)

#### Task Purpose
**As a** QA validator
**I need** comprehensive tests for Storage export
**So that** Phase 1 is production-ready before Phase 2

#### Technical Requirements

**Files to Create**:
```
worker/__tests__/storage-export.test.ts - Integration tests
scripts/validate-storage-export.ts - Manual validation script
```

**Test Coverage**:
1. **Unit Tests**: storage-helpers.ts functions
2. **Integration Tests**: Full PDF and EPUB processing with Storage saves
3. **Schema Validation**: Validate exported JSON against TypeScript schemas
4. **Performance Tests**: Measure Storage save overhead (<5% processing time)
5. **Error Handling**: Simulate Storage failures, verify non-fatal behavior

#### Acceptance Criteria

```gherkin
Scenario 1: Complete PDF processing validation
  Given a 200-page PDF document
  When processing completes
  Then all 3 final files should exist in Storage
  And chunks.json should have 156 chunks with full metadata
  And metadata.json should have accurate word_count and page_count
  And manifest.json should list all files with sizes and hashes
  And processing time should be <5% higher than without Storage saves

Scenario 2: LOCAL mode validation
  Given processing in LOCAL mode
  When document processing completes
  Then cached_chunks.json should exist
  And cached_chunks.json should have markdown_hash matching content.md
  And cached_chunks should have Docling structural metadata

Scenario 3: Storage failure resilience
  Given Supabase Storage is unavailable
  When processing runs
  Then processing should complete successfully
  And database should have all chunks with metadata
  And warnings should be logged for Storage failures
  And job status should be "completed" not "failed"
```

**Rule-Based Criteria**:
- [ ] **Coverage**: All storage-helpers functions tested
- [ ] **Integration**: PDF and EPUB processing tested end-to-end
- [ ] **Schema**: All JSON files validated against TypeScript schemas
- [ ] **Performance**: Storage overhead <5% of processing time
- [ ] **Resilience**: Storage failures don't break processing
- [ ] **Documentation**: Validation script with instructions

#### Validation Commands

```bash
# Run all Phase 1 tests
cd worker
npm run test:phase1

# Validate storage export
npx tsx scripts/validate-storage-export.ts

# Performance benchmark
npm run benchmark:storage-overhead

# Manual checklist
# 1. Process small PDF (<50 pages) → verify all files
# 2. Process large PDF (500 pages) → verify batch processing
# 3. Process EPUB → verify same structure
# 4. Process in LOCAL mode → verify cached_chunks.json
# 5. Simulate Storage failure → verify processing completes
# 6. Download chunks.json → verify schema with TypeScript validation
```

---

## Phase 2: Admin Panel UI

### T-007: Refactor AdminPanel to Sheet Component

**Priority**: Critical
**Estimated Effort**: 8 hours
**Dependencies**: None (UI work can start before Phase 1 completes)

#### Task Purpose
**As a** user managing documents
**I need** a centralized admin interface
**So that** all document operations are accessible from one place

#### Technical Requirements

**Files to Modify**:
```
src/components/admin/AdminPanel.tsx - Convert from sidebar to Sheet with Tabs
src/components/layout/TopNav.tsx - Add Database icon button
```

**Functional Requirements**:
- REQ-1: Admin Panel shall use shadcn Sheet component (side="top")
- REQ-2: Sheet shall be 85vh height, slide down from top
- REQ-3: Panel shall have 6 tabs: Scanner, Import, Export, Connections, Integrations, Jobs
- REQ-4: Jobs tab shall contain existing job controls (moved from current sidebar)
- REQ-5: Panel shall open from Database icon in TopNav header
- REQ-6: Panel shall close on Esc key or backdrop click
- REQ-7: Panel shall support keyboard shortcut Cmd+Shift+A

**Implementation Steps**:
1. Install shadcn Sheet and Tabs components:
   ```bash
   npx shadcn@latest add sheet
   npx shadcn@latest add tabs
   ```
2. Refactor AdminPanel.tsx:
   - Replace sidebar div with Sheet component
   - Add Tabs component with 6 TabTriggers
   - Move existing controls to JobsTab component
   - Create placeholder components for other tabs
3. Update TopNav.tsx:
   - Add Database icon button
   - Add state management for Admin Panel open/close
   - Pass state to AdminPanel component
4. Add keyboard shortcut handler (Cmd+Shift+A)

**UI Structure**:
```tsx
<Sheet open={isOpen} onOpenChange={onClose}>
  <SheetContent side="top" className="h-[85vh] overflow-auto">
    <SheetHeader>
      <SheetTitle>Admin Panel</SheetTitle>
      <SheetDescription>Manage documents, storage, and integrations</SheetDescription>
    </SheetHeader>

    <Tabs defaultValue="scanner">
      <TabsList className="grid w-full grid-cols-6">
        <TabsTrigger value="scanner">Scanner</TabsTrigger>
        <TabsTrigger value="import">Import</TabsTrigger>
        <TabsTrigger value="export">Export</TabsTrigger>
        <TabsTrigger value="connections">Connections</TabsTrigger>
        <TabsTrigger value="integrations">Integrations</TabsTrigger>
        <TabsTrigger value="jobs">Jobs</TabsTrigger>
      </TabsList>

      <TabsContent value="jobs">
        <JobsTab /> {/* Existing controls moved here */}
      </TabsContent>

      {/* Other tabs... */}
    </Tabs>
  </SheetContent>
</Sheet>
```

**Code Patterns to Follow**:
- **shadcn Sheet**: Follow shadcn documentation for Sheet component
- **Tabs Navigation**: Standard Tabs pattern from shadcn
- **Keyboard Shortcuts**: Use `useHotkeys` hook or similar pattern
- **State Management**: React useState for open/close state

#### Acceptance Criteria

```gherkin
Scenario 1: Open Admin Panel from header
  Given user is on any page
  When user clicks Database icon in TopNav
  Then Admin Panel should slide down from top
  And Panel should be 85vh height
  And Scanner tab should be active by default

Scenario 2: Navigate between tabs
  Given Admin Panel is open
  When user clicks different tab triggers
  Then active tab content should change
  And URL should not change (client-side only)

Scenario 3: Close Admin Panel
  Given Admin Panel is open
  When user presses Esc key
  Then Panel should close with slide-up animation

  When user clicks backdrop
  Then Panel should close

  When user clicks X button in header
  Then Panel should close

Scenario 4: Keyboard shortcut
  Given Admin Panel is closed
  When user presses Cmd+Shift+A (Mac) or Ctrl+Shift+A (Windows)
  Then Admin Panel should open

  When Admin Panel is open and user presses Cmd+Shift+A again
  Then Admin Panel should close

Scenario 5: Existing job controls work
  Given Admin Panel is open on Jobs tab
  When user clicks "Clear Completed Jobs"
  Then existing job control functionality should work
  And UI should match previous sidebar behavior
```

**Rule-Based Criteria**:
- [ ] **UI**: Panel slides from top with smooth animation
- [ ] **Navigation**: All 6 tabs render and are clickable
- [ ] **Compatibility**: Existing job controls work in Jobs tab
- [ ] **Keyboard**: Cmd+Shift+A toggles panel open/close
- [ ] **Responsive**: Panel works on desktop and tablet (>768px width)
- [ ] **Accessibility**: Sheet and Tabs are keyboard navigable
- [ ] **No Regressions**: Existing job functionality unchanged

#### Validation Commands

```bash
# Component tests
npm test -- AdminPanel.test.tsx

# E2E tests
npm run test:e2e -- admin-panel.spec.ts

# Manual testing checklist
# 1. Click Database icon → Panel opens
# 2. Click each tab → Content changes
# 3. Press Esc → Panel closes
# 4. Click backdrop → Panel closes
# 5. Press Cmd+Shift+A → Panel toggles
# 6. Jobs tab controls work (clear completed, etc.)
# 7. No console errors
# 8. No layout shift when opening/closing
```

---

### T-008: Create Placeholder Tab Components

**Priority**: Medium
**Estimated Effort**: 4 hours
**Dependencies**: T-007 (Admin Panel refactor)

#### Task Purpose
**As a** developer building Admin Panel
**I need** placeholder components for each tab
**So that** navigation structure is complete before implementing features

#### Technical Requirements

**Files to Create**:
```
src/components/admin/tabs/ScannerTab.tsx
src/components/admin/tabs/ImportTab.tsx
src/components/admin/tabs/ExportTab.tsx
src/components/admin/tabs/ConnectionsTab.tsx
src/components/admin/tabs/IntegrationsTab.tsx
src/components/admin/tabs/JobsTab.tsx - Move existing controls here
```

**Implementation Steps**:
1. Create 6 tab component files
2. Each placeholder should have:
   - Title and description
   - "Coming soon" message or basic structure
   - Proper TypeScript types
3. JobsTab should contain moved job controls from current AdminPanel
4. Export all components from index file

**Component Template**:
```tsx
export function ScannerTab() {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold">Storage Scanner</h3>
        <p className="text-sm text-muted-foreground">
          Compare Storage vs Database and sync documents
        </p>
      </div>

      <div className="border rounded-lg p-8 text-center">
        <p className="text-muted-foreground">Coming soon...</p>
      </div>
    </div>
  )
}
```

#### Acceptance Criteria

**Rule-Based Criteria**:
- [ ] **Files**: 6 tab components created
- [ ] **Structure**: Each has title, description, placeholder content
- [ ] **Jobs Tab**: Contains existing job controls (working)
- [ ] **Types**: All components properly typed
- [ ] **Exports**: All components exported from tabs/index.ts
- [ ] **Rendering**: All tabs render without errors

#### Validation Commands

```bash
# Component tests
npm test -- tabs/

# Visual check
npm run dev
# Open Admin Panel, click through all tabs
```

---

## Phase 3: Storage Scanner

### T-009: Create scanStorage Server Action

**Priority**: Critical
**Estimated Effort**: 8 hours
**Dependencies**: T-007 (Admin Panel structure)

#### Task Purpose
**As a** Storage Scanner
**I need** to compare Storage vs Database state
**So that** users can see differences and sync as needed

#### Technical Requirements

**Files to Create**:
```
src/app/actions/documents.ts - New Server Actions file
```

**Functional Requirements**:
- REQ-1: When scanStorage is called, list all document folders in Storage
- REQ-2: For each folder, check which files exist (chunks.json, metadata.json, etc.)
- REQ-3: For each folder, query Database for document and chunk count
- REQ-4: Return comparison data structure with Storage files, DB status, sync state

**Implementation Steps**:
1. Create Server Actions file with 'use server' directive
2. Implement scanStorage() action:
   - List Storage folders: `supabase.storage.from('documents').list(userId)`
   - For each folder, list files
   - Query DB for document existence and chunk count
   - Calculate sync state: healthy, missing_from_db, missing_from_storage, out_of_sync
3. Return structured data for UI consumption

**Return Type**:
```typescript
interface ScanResult {
  success: boolean
  documents: Array<{
    documentId: string
    title: string
    storageFiles: string[] // File names
    inDatabase: boolean
    chunkCount: number | null
    syncState: 'healthy' | 'missing_from_db' | 'missing_from_storage' | 'out_of_sync'
    createdAt: string | null
  }>
}
```

**Code Patterns to Follow**:
- **Server Actions**: `src/app/actions/admin.ts` - Existing action patterns
- **Supabase Client**: `src/lib/supabase/server.ts` - Server-side client
- **Error Handling**: Return `{ success: false, error: message }` on failure

#### Acceptance Criteria

```gherkin
Scenario 1: Healthy document (in sync)
  Given a document processed successfully
  And chunks exist in both Storage and Database
  When scanStorage is called
  Then document should have syncState: 'healthy'
  And storageFiles should include chunks.json, metadata.json, manifest.json
  And chunkCount should match Storage chunks count

Scenario 2: Missing from Database
  Given chunks.json exists in Storage
  But no chunks exist in Database for that document
  When scanStorage is called
  Then document should have syncState: 'missing_from_db'
  And inDatabase should be false

Scenario 3: Missing from Storage
  Given chunks exist in Database
  But no Storage files exist for that document
  When scanStorage is called
  Then document should have syncState: 'missing_from_storage'
  And storageFiles should be empty array

Scenario 4: Out of sync
  Given chunks.json has 200 chunks
  But Database has 150 chunks for same document
  When scanStorage is called
  Then document should have syncState: 'out_of_sync'
  And both storageFiles and chunkCount should be populated
```

**Rule-Based Criteria**:
- [ ] **Functional**: Accurately compares Storage vs Database
- [ ] **Performance**: Scans 50 documents in <5 seconds
- [ ] **Error Handling**: Returns error object on failure
- [ ] **Type Safety**: Return type matches ScanResult interface
- [ ] **Security**: Only scans documents for authenticated user
- [ ] **Data Integrity**: Chunk counts match actual data

#### Validation Commands

```bash
# Unit tests
npm test -- actions/documents.test.ts

# Integration test
npx tsx scripts/test-scan-storage.ts

# Manual validation
# 1. Process 3 documents
# 2. Delete chunks from DB for document 1
# 3. Delete Storage files for document 2
# 4. Document 3 stays healthy
# 5. Run scanStorage()
# 6. Verify: doc1=missing_from_db, doc2=missing_from_storage, doc3=healthy
```

---

### T-010: Build ScannerTab UI Component

**Priority**: High
**Estimated Effort**: 12 hours
**Dependencies**: T-009 (scanStorage action)

#### Task Purpose
**As a** user viewing Storage Scanner
**I need** a table showing Storage vs Database comparison
**So that** I can identify and fix sync issues

#### Technical Requirements

**Files to Modify**:
```
src/components/admin/tabs/ScannerTab.tsx - Replace placeholder
```

**Functional Requirements**:
- REQ-1: On tab open, automatically trigger scanStorage()
- REQ-2: Display results in shadcn Table component
- REQ-3: Show filters: All, Missing from DB, Out of Sync, Healthy
- REQ-4: Show summary stats: Total in Storage, Total in DB, Missing, Out of Sync
- REQ-5: Each row shows: Title, Storage Files (count), DB Status, Actions
- REQ-6: Expandable row to show file details
- REQ-7: Row actions: Import, Sync, Export, Details
- REQ-8: Bulk actions: Import All, Sync All

**UI Components**:
- shadcn Table for document list
- shadcn Badge for sync state indicators
- shadcn Button for actions
- shadcn Tabs or Buttons for filters
- shadcn Collapsible for row expansion

**Implementation Steps**:
1. Create state management:
   ```typescript
   const [scanResults, setScanResults] = useState<ScanResult | null>(null)
   const [loading, setLoading] = useState(false)
   const [filter, setFilter] = useState<'all' | 'missing_db' | 'out_sync' | 'healthy'>('all')
   ```
2. Implement scan on mount:
   ```typescript
   useEffect(() => {
     handleScan()
   }, [])
   ```
3. Build table UI matching mockup (PRP lines 288-312)
4. Implement filters with computed properties
5. Add row actions (placeholder handlers for now)
6. Style with Tailwind matching design system

**Code Patterns to Follow**:
- **Server Actions**: Call with useTransition for loading states
- **Table Component**: Use shadcn Table from UI library
- **Badges**: Status badges with color coding (green=healthy, yellow=warning, red=error)

#### Acceptance Criteria

```gherkin
Scenario 1: Initial scan on tab open
  Given user opens Scanner tab
  When component mounts
  Then scanStorage should be called automatically
  And loading spinner should show during scan
  And results table should populate when scan completes

Scenario 2: Filter documents
  Given scan results with mixed states
  When user clicks "Missing from DB" filter
  Then only documents with that state should show
  And summary stats should update to filtered count

  When user clicks "All" filter
  Then all documents should show again

Scenario 3: View file details
  Given a document row in the table
  When user clicks row to expand
  Then file list should show: chunks.json (800KB), metadata.json (2KB), etc.
  And each file should show size and last updated timestamp

Scenario 4: Summary statistics
  Given scan results loaded
  Then summary should show:
    - Total documents in Storage: 47
    - Total documents in Database: 12
    - Missing from Database: 35
    - Out of Sync: 2
    - Healthy: 12
```

**Rule-Based Criteria**:
- [ ] **UI**: Table matches mockup design (PRP lines 288-312)
- [ ] **Filters**: All 4 filters work correctly
- [ ] **Performance**: Table renders 100+ documents smoothly
- [ ] **Expandable**: Rows expand to show file details
- [ ] **Actions**: Import/Sync/Export buttons rendered (handlers in next phase)
- [ ] **Statistics**: Summary stats accurate and update with filters
- [ ] **Loading States**: Loading spinner during scan
- [ ] **Empty State**: Shows helpful message when no documents

#### Validation Commands

```bash
# Component tests
npm test -- ScannerTab.test.tsx

# E2E tests
npm run test:e2e -- scanner-tab.spec.ts

# Manual testing
# 1. Open Scanner tab → auto-scans
# 2. Verify table shows all documents
# 3. Click each filter → verify filtering works
# 4. Click row → verify expansion shows files
# 5. Check summary stats match actual counts
# 6. Verify loading states during scan
```

---

## Phase 4: Import Workflow

### T-011: Create importFromStorage Server Action

**Priority**: Critical
**Estimated Effort**: 10 hours
**Dependencies**: T-009 (scanStorage action)

#### Task Purpose
**As an** import system
**I need** to restore chunks from Storage with conflict detection
**So that** users can safely import without data loss

#### Technical Requirements

**Files to Modify**:
```
src/app/actions/documents.ts - Add importFromStorage action
```

**Functional Requirements**:
- REQ-1: When importFromStorage is called, check for existing chunks in Database
- REQ-2: If chunks exist and no strategy provided, return conflict detection result
- REQ-3: If no conflict or strategy='skip', do nothing and return
- REQ-4: If strategy='replace', delete existing chunks then insert from Storage
- REQ-5: If strategy='merge_smart', update metadata while preserving chunk IDs
- REQ-6: Create background job for actual import work
- REQ-7: Return job ID for progress tracking

**Implementation Steps**:
1. Add importFromStorage() Server Action
2. Implement conflict detection:
   - Query existing chunks: `supabase.from('chunks').select('id').eq('document_id', docId).limit(1)`
   - If exists and no strategy, return `{ needsResolution: true, conflict: {...} }`
3. Create background job with input_data containing strategy
4. Return job ID for polling

**Action Signature**:
```typescript
export async function importFromStorage(
  documentId: string,
  options: {
    strategy?: 'skip' | 'replace' | 'merge_smart'
    regenerateEmbeddings?: boolean
    reprocessConnections?: boolean
  } = {}
): Promise<{ success: boolean; jobId?: string; needsResolution?: boolean; conflict?: ImportConflict }>
```

**Code Patterns to Follow**:
- **Background Jobs**: `src/app/actions/admin.ts` - Job creation pattern
- **Conflict Detection**: Query first, create job second
- **Server Actions**: Return structured result with success flag

#### Acceptance Criteria

```gherkin
Scenario 1: Import new document (no conflict)
  Given chunks.json exists in Storage
  And no chunks exist in Database
  When importFromStorage is called without strategy
  Then a background job should be created
  And job should have type 'import_document'
  And response should include jobId

Scenario 2: Detect conflict
  Given chunks exist in both Storage and Database
  When importFromStorage is called without strategy
  Then response should have needsResolution: true
  And conflict object should include chunk counts and sample data
  And no background job should be created yet

Scenario 3: Import with skip strategy
  Given conflict exists
  When importFromStorage is called with strategy='skip'
  Then no changes should occur
  And response should indicate success with skip

Scenario 4: Import with replace strategy
  Given conflict exists
  When importFromStorage is called with strategy='replace'
  Then background job should be created
  And job input_data should include strategy='replace'
```

**Rule-Based Criteria**:
- [ ] **Functional**: Conflict detection works accurately
- [ ] **Safety**: No data modified without explicit strategy
- [ ] **Background**: Import runs as background job
- [ ] **Type Safety**: Return types match interface
- [ ] **Error Handling**: Returns error object on failure
- [ ] **Security**: Only imports for authenticated user's documents

#### Validation Commands

```bash
# Unit tests
npm test -- actions/documents.test.ts -t importFromStorage

# Integration test
npx tsx scripts/test-import-flow.ts

# Manual validation
# 1. Process document, then delete from DB
# 2. Call importFromStorage without strategy → verify no conflict
# 3. Process again (creates conflict)
# 4. Call importFromStorage without strategy → verify needsResolution=true
# 5. Call with strategy='skip' → verify no changes
```

---

### T-012: Create import-document Background Job Handler

**Priority**: Critical
**Estimated Effort**: 12 hours
**Dependencies**: T-011 (importFromStorage action), T-001 (storage helpers)

#### Task Purpose
**As an** import background job
**I need** to restore chunks from Storage to Database
**So that** processing results can be recovered without reprocessing

#### Technical Requirements

**Files to Create**:
```
worker/handlers/import-document.ts - Background job handler
worker/lib/conflict-resolution.ts - Conflict resolution logic
```

**Functional Requirements**:
- REQ-1: Read chunks.json from Storage using storage helpers
- REQ-2: Validate schema version (currently "1.0")
- REQ-3: Apply strategy: skip (noop), replace (DELETE + INSERT), merge_smart (UPDATE)
- REQ-4: If regenerateEmbeddings option, generate embeddings after import
- REQ-5: Update job progress at each stage
- REQ-6: Mark job complete with result summary

**Implementation Steps**:
1. Create handler function:
   ```typescript
   export async function importDocumentHandler(supabase: any, job: any): Promise<void>
   ```
2. Implement progress tracking:
   ```typescript
   await updateProgress(supabase, job.id, 10, 'reading', 'Reading chunks from Storage')
   ```
3. Read chunks.json using `readFromStorage()` helper
4. Validate schema version
5. Implement three strategies:
   - **skip**: Return immediately
   - **replace**: `DELETE FROM chunks WHERE document_id = ?` then batch INSERT
   - **merge_smart**: UPDATE metadata fields, keep existing IDs
6. Optional: Regenerate embeddings (loop through chunks, call generateEmbedding)
7. Mark job complete with stats

**Strategy Implementation**:
```typescript
// Replace strategy
await supabase.from('chunks').delete().eq('document_id', document_id)
await supabase.from('chunks').insert(chunksToInsert)

// Merge Smart strategy
for (const chunk of chunksData.chunks) {
  await supabase.from('chunks')
    .update({
      themes: chunk.themes,
      importance_score: chunk.importance_score,
      summary: chunk.summary,
      emotional_metadata: chunk.emotional_metadata,
      conceptual_metadata: chunk.conceptual_metadata,
      domain_metadata: chunk.domain_metadata,
      metadata_extracted_at: chunk.metadata_extracted_at
    })
    .eq('document_id', document_id)
    .eq('chunk_index', chunk.chunk_index)
}
```

**Code Patterns to Follow**:
- **Background Handlers**: `worker/handlers/process-document.ts` - Handler pattern
- **Progress Updates**: `worker/handlers/reprocess-document.ts` - Progress tracking
- **Batch Inserts**: `worker/lib/batch-operations.ts` - Batch insert pattern
- **Embeddings**: `worker/lib/embeddings.ts` - generateEmbedding function

#### Acceptance Criteria

```gherkin
Scenario 1: Replace strategy import
  Given chunks.json with 200 chunks in Storage
  And 150 existing chunks in Database
  When import job runs with strategy='replace'
  Then all 150 existing chunks should be deleted
  And 200 new chunks should be inserted
  And job should complete with status='completed'
  And output_data should show imported: 200

Scenario 2: Merge Smart strategy
  Given existing chunks with IDs in Database
  And chunks.json with updated metadata
  When import job runs with strategy='merge_smart'
  Then chunk IDs should remain unchanged
  And metadata should be updated to match chunks.json
  And chunk content should remain unchanged (only metadata updated)

Scenario 3: Regenerate embeddings
  Given import with regenerateEmbeddings=true
  When import completes
  Then every chunk should have 768-dimensional embedding
  And embeddings should be generated from chunk content
  And progress should show "Regenerating embeddings" stage

Scenario 4: Schema validation failure
  Given chunks.json with version='2.0'
  When import job runs
  Then job should fail with error message
  And error should indicate unsupported version
```

**Rule-Based Criteria**:
- [ ] **Functional**: All three strategies implemented correctly
- [ ] **Data Integrity**: Merge Smart preserves chunk IDs and annotations
- [ ] **Progress**: Job progress updates at each stage (10%, 40%, 60%, 90%, 100%)
- [ ] **Embeddings**: Optional embedding regeneration works
- [ ] **Error Handling**: Schema validation failures handled gracefully
- [ ] **Performance**: Batch operations for large imports
- [ ] **Statistics**: Output data includes chunk counts and strategy used

#### Validation Commands

```bash
# Unit tests
cd worker
npx jest handlers/__tests__/import-document.test.ts

# Integration test
npx tsx scripts/test-import-strategies.ts

# Manual validation
# Test 1: Replace strategy
# 1. Process document → get 200 chunks
# 2. Manually modify some chunks in DB
# 3. Import with replace → verify DB matches Storage

# Test 2: Merge Smart
# 1. Process document
# 2. Create annotations on some chunks
# 3. Import with merge_smart → verify annotations still work

# Test 3: Embeddings
# 1. Import with regenerateEmbeddings=true
# 2. Query chunks → verify all have embeddings
```

---

### T-013: Build ConflictResolutionDialog Component

**Priority**: High
**Estimated Effort**: 10 hours
**Dependencies**: T-011 (conflict detection)

#### Task Purpose
**As a** user encountering import conflict
**I need** to see data comparison and choose resolution strategy
**So that** I can make informed decision about data handling

#### Technical Requirements

**Files to Create**:
```
src/components/admin/ConflictResolutionDialog.tsx
```

**Functional Requirements**:
- REQ-1: Show side-by-side comparison of existing vs import data
- REQ-2: Display sample chunks (first 3) with metadata differences highlighted
- REQ-3: Show 3 strategy options: Skip, Replace, Merge Smart
- REQ-4: Show warnings for each strategy (data loss, annotation impact)
- REQ-5: Allow user to apply chosen strategy
- REQ-6: Close dialog and start import job on confirmation

**UI Components**:
- shadcn Dialog for modal
- shadcn RadioGroup for strategy selection
- shadcn Alert for warnings
- Comparison cards for chunk samples

**Implementation Steps**:
1. Create Dialog component with conflict data props
2. Build comparison layout (2 columns: Existing | Import)
3. Render chunk samples with metadata diff highlighting
4. Implement radio group for strategy selection
5. Add warning messages per strategy
6. Handle apply button → call importFromStorage with chosen strategy

**Component Props**:
```typescript
interface ConflictResolutionDialogProps {
  isOpen: boolean
  onClose: () => void
  conflict: ImportConflict
  documentId: string
  onResolved: (jobId: string) => void
}
```

**UI Layout** (from PRP lines 316-350):
```
╔══════════════════════════════════════════════════════════════════╗
║  IMPORT CONFLICT DETECTED: "Gravity's Rainbow"                  ║
╠══════════════════════════════════════════════════════════════════╣
║  Existing in Database          Import from Storage              ║
║  382 chunks                    382 chunks                       ║
║  Processed: 2025-10-10         Processed: 2025-10-12           ║
║                                                                  ║
║  Sample Chunks (first 3): [Show differences]                    ║
║                                                                  ║
║  Resolution Options:                                             ║
║  ○ Skip Import (keep existing, ignore import)                   ║
║  ○ Replace All (delete existing, use import)                    ║
║  ● Merge Smart (update metadata, preserve IDs/annotations)     ║
║                                                                  ║
║  ⚠️ Warnings based on selection                                 ║
║                                                                  ║
║  [Cancel] [Apply Resolution]                                    ║
╚══════════════════════════════════════════════════════════════════╝
```

**Code Patterns to Follow**:
- **Dialog**: shadcn Dialog component
- **Comparison View**: Use grid layout with 2 columns
- **Diff Highlighting**: Different background colors for changed metadata

#### Acceptance Criteria

```gherkin
Scenario 1: Display conflict information
  Given import conflict detected
  When dialog opens
  Then existing data should show: chunk count, processed date
  And import data should show: chunk count, processed date
  And 3 sample chunks should display from each source
  And metadata differences should be highlighted

Scenario 2: Select Skip strategy
  Given conflict dialog open
  When user selects "Skip Import"
  Then warning should show: "Import data will be ignored"
  And "Apply Resolution" button should be enabled

Scenario 3: Select Replace strategy
  Given conflict dialog open
  When user selects "Replace All"
  Then warning should show: "Will reset all annotation positions"
  And warning should emphasize destructive nature

Scenario 4: Select Merge Smart strategy
  Given conflict dialog open
  When user selects "Merge Smart" (default)
  Then info message should show: "Preserves annotations by keeping chunk IDs"
  And this should be the recommended option

Scenario 5: Apply resolution
  Given user selected strategy
  When user clicks "Apply Resolution"
  Then importFromStorage should be called with chosen strategy
  And dialog should close
  And import job should start
  And onResolved callback should be called with jobId
```

**Rule-Based Criteria**:
- [ ] **UI**: Matches mockup design (PRP lines 316-350)
- [ ] **Comparison**: Side-by-side existing vs import data
- [ ] **Samples**: First 3 chunks shown with metadata
- [ ] **Highlighting**: Metadata differences visually distinct
- [ ] **Warnings**: Strategy-specific warnings displayed
- [ ] **UX**: Default selection is "Merge Smart" (safest for annotations)
- [ ] **Accessibility**: Dialog keyboard navigable, Esc closes
- [ ] **Validation**: Apply button disabled until strategy selected

#### Validation Commands

```bash
# Component tests
npm test -- ConflictResolutionDialog.test.tsx

# E2E tests
npm run test:e2e -- conflict-resolution.spec.ts

# Manual testing
# 1. Trigger import conflict
# 2. Verify dialog opens with correct data
# 3. Select each strategy → verify warnings change
# 4. Apply resolution → verify import starts
# 5. Check annotations after merge_smart import
```

---

### T-014: Integrate Import Flow in ImportTab

**Priority**: High
**Estimated Effort**: 8 hours
**Dependencies**: T-012 (import handler), T-013 (conflict dialog)

#### Task Purpose
**As a** user in Import tab
**I need** to select documents and trigger import
**So that** I can restore data from Storage

#### Technical Requirements

**Files to Modify**:
```
src/components/admin/tabs/ImportTab.tsx - Replace placeholder
```

**Functional Requirements**:
- REQ-1: Display list of documents from Storage (from Scanner results)
- REQ-2: Allow single or multi-select for import
- REQ-3: Show import options: Regenerate Embeddings, Reprocess Connections
- REQ-4: Trigger import, handle conflict resolution if needed
- REQ-5: Show progress for active import jobs
- REQ-6: Display results after import completion

**UI Components**:
- Document list with checkboxes
- Import options form
- Progress tracking for jobs
- Success/error messages

**Implementation Steps**:
1. Reuse scanStorage results to show importable documents
2. Add multi-select checkbox state
3. Build import options form (checkboxes for embeddings, connections)
4. Implement import button handler:
   - Call importFromStorage for selected documents
   - Handle conflict if needsResolution
   - Show ConflictResolutionDialog
   - Track import jobs
5. Add job polling for progress updates

**Code Patterns to Follow**:
- **Job Tracking**: Similar to ProcessingDock job polling
- **Multi-Select**: React state for selected document IDs
- **Progress Display**: Use shadcn Progress component

#### Acceptance Criteria

```gherkin
Scenario 1: Import single document without conflict
  Given document in Storage not in Database
  When user selects document and clicks Import
  Then import job should start
  And progress should show in ImportTab
  And on completion, success message should display

Scenario 2: Import with conflict
  Given document exists in both Storage and Database
  When user clicks Import
  Then ConflictResolutionDialog should open
  And user should choose strategy
  And import should proceed with chosen strategy

Scenario 3: Batch import
  Given 5 documents selected for import
  When user clicks "Import All"
  Then 5 import jobs should be created
  And progress should show for each
  And conflicts should be handled individually

Scenario 4: Import with options
  Given "Regenerate Embeddings" checked
  When import completes
  Then embeddings should be regenerated
  And progress should show embedding generation stage
```

**Rule-Based Criteria**:
- [ ] **Functional**: Import workflow from select to completion works
- [ ] **Conflict Handling**: ConflictResolutionDialog integrates properly
- [ ] **Progress**: Real-time job progress displayed
- [ ] **Options**: Regenerate embeddings and reprocess connections options work
- [ ] **Batch**: Multiple documents can be imported together
- [ ] **Error Handling**: Import failures show clear error messages
- [ ] **UX**: Loading states, success/error feedback

#### Validation Commands

```bash
# Component tests
npm test -- ImportTab.test.tsx

# E2E tests
npm run test:e2e -- import-flow.spec.ts

# Manual testing
# 1. Import single document → verify success
# 2. Import with conflict → verify dialog
# 3. Batch import 3 documents → verify all complete
# 4. Import with embeddings → verify regeneration
# 5. Check database after import → verify data correct
```

---

## Phase 5: Connection Reprocessing

### T-015: Create reprocessConnections Server Action

**Priority**: Critical
**Estimated Effort**: 6 hours
**Dependencies**: None (can start after Phase 1)

#### Task Purpose
**As a** connection reprocessing system
**I need** to create background jobs for connection regeneration
**So that** users can update connections with new engines or strategies

#### Technical Requirements

**Files to Modify**:
```
src/app/actions/documents.ts - Add reprocessConnections action
```

**Functional Requirements**:
- REQ-1: Create background job with type 'reprocess_connections'
- REQ-2: Accept mode: 'all', 'add_new', 'smart'
- REQ-3: Accept engine selection: array of engine names
- REQ-4: Accept Smart Mode options: preserveValidated, backupFirst
- REQ-5: Return job ID for tracking

**Action Signature**:
```typescript
export async function reprocessConnections(
  documentId: string,
  options: {
    mode: 'all' | 'add_new' | 'smart'
    engines: Array<'semantic_similarity' | 'contradiction_detection' | 'thematic_bridge'>
    preserveValidated?: boolean
    backupFirst?: boolean
  }
): Promise<{ success: boolean; jobId?: string; error?: string }>
```

**Implementation Steps**:
1. Add Server Action to documents.ts
2. Validate options (at least one engine selected)
3. Create background job with input_data containing all options
4. Return job ID

**Code Patterns to Follow**:
- **Job Creation**: Standard background job creation pattern
- **Validation**: Ensure at least one engine selected

#### Acceptance Criteria

```gherkin
Scenario 1: Create reprocess job with all options
  Given valid document ID and options
  When reprocessConnections is called
  Then background job should be created
  And job type should be 'reprocess_connections'
  And input_data should include mode, engines, preserveValidated, backupFirst
  And response should include jobId

Scenario 2: Validation failure
  Given options with empty engines array
  When reprocessConnections is called
  Then response should have success=false
  And error should indicate "At least one engine required"

Scenario 3: Smart Mode with preservation
  Given mode='smart' and preserveValidated=true
  When job is created
  Then input_data should flag preservation for handler
```

**Rule-Based Criteria**:
- [ ] **Functional**: Job creation works for all modes
- [ ] **Validation**: Rejects invalid options (empty engines)
- [ ] **Type Safety**: Options match ReprocessOptions interface
- [ ] **Security**: Only creates jobs for user's documents

#### Validation Commands

```bash
# Unit tests
npm test -- actions/documents.test.ts -t reprocessConnections

# Integration test
npx tsx scripts/test-reprocess-action.ts
```

---

### T-016: Create reprocess-connections Background Job Handler

**Priority**: Critical
**Estimated Effort**: 14 hours
**Dependencies**: T-015 (reprocessConnections action), T-001 (storage helpers)

#### Task Purpose
**As a** connection reprocessing job
**I need** to regenerate connections with user-validation preservation
**So that** connections stay current without losing user work

#### Technical Requirements

**Files to Create**:
```
worker/handlers/reprocess-connections.ts
```

**Functional Requirements**:
- REQ-1: Support three modes: all (fresh), add_new (incremental), smart (preserve validated)
- REQ-2: In Smart Mode, backup validated connections to Storage before deletion
- REQ-3: Delete connections based on mode (all connections, or only non-validated)
- REQ-4: Call orchestrator with selected engines only
- REQ-5: Restore validated connections after reprocessing (Smart Mode)
- REQ-6: Return stats: connectionsBefore, connectionsAfter, byEngine

**Implementation Steps**:
1. Create handler function
2. Get current connection count (before)
3. Implement mode-specific logic:

   **Reprocess All Mode**:
   ```typescript
   await supabase.from('connections').delete()
     .or(`source_chunk.document_id.eq.${document_id},target_chunk.document_id.eq.${document_id}`)
   ```

   **Add New Mode**:
   ```typescript
   // Get newer documents
   const { data: currentDoc } = await supabase.from('documents')
     .select('created_at').eq('id', document_id).single()
   const { data: newerDocs } = await supabase.from('documents')
     .select('id').gt('created_at', currentDoc.created_at)
   // Only process connections to these documents (orchestrator enhancement needed)
   ```

   **Smart Mode**:
   ```typescript
   // 1. Query validated connections
   const { data: validated } = await supabase.from('connections')
     .select('*')
     .eq('user_validated', true)
     .or(`source_chunk.document_id.eq.${document_id},target_chunk.document_id.eq.${document_id}`)

   // 2. Save to Storage
   await saveToStorage(supabase, `${userId}/${document_id}/validated-connections-${timestamp}.json`,
     { connections: validated, timestamp })

   // 3. Delete non-validated only
   await supabase.from('connections').delete()
     .is('user_validated', null)
     .or(`source_chunk.document_id.eq.${document_id},target_chunk.document_id.eq.${document_id}`)
   ```

4. Call orchestrator with selected engines
5. Get final connection count (after)
6. Mark job complete with stats

**Code Patterns to Follow**:
- **Orchestrator**: `worker/engines/orchestrator.ts:processDocument()` - Calling pattern
- **Progress Updates**: Update job progress at each stage
- **Storage Backup**: Use saveToStorage helper

#### Acceptance Criteria

```gherkin
Scenario 1: Reprocess All mode
  Given document with 85 connections (12 validated)
  When reprocess job runs with mode='all'
  Then all 85 connections should be deleted
  And orchestrator should run with selected engines
  And new connections should be generated from scratch
  And validated connections should NOT be restored

Scenario 2: Smart Mode with preservation
  Given document with 85 connections (12 validated)
  When reprocess job runs with mode='smart', preserveValidated=true
  Then validated connections should be backed up to Storage
  And only 73 non-validated connections should be deleted
  And orchestrator should run
  And 12 validated connections should still exist after
  And backup file should exist: validated-connections-{timestamp}.json

Scenario 3: Add New mode
  Given document A processed on 2025-10-10
  And document B processed on 2025-10-12 (newer)
  When reprocess job runs on document A with mode='add_new'
  Then only connections between A and B should be processed
  And existing connections should be preserved
  (Note: Requires orchestrator enhancement for targetDocumentIds)

Scenario 4: Progress tracking
  Given reprocess job running
  When job progresses through stages
  Then progress should update: 10% preparing, 20% backup, 40% processing, 90% finalizing, 100% complete
  And each stage should have descriptive details
```

**Rule-Based Criteria**:
- [ ] **Functional**: All three modes implemented correctly
- [ ] **Preservation**: Smart Mode preserves validated connections
- [ ] **Backup**: Validated connections saved to Storage before deletion
- [ ] **Orchestrator**: Respects engine selection (only runs selected engines)
- [ ] **Statistics**: Output data includes before/after counts and byEngine breakdown
- [ ] **Progress**: Job progress updated at each major stage
- [ ] **Error Handling**: Failures don't leave partial state (transaction-safe where possible)

#### Validation Commands

```bash
# Unit tests
cd worker
npx jest handlers/__tests__/reprocess-connections.test.ts

# Integration test
npx tsx scripts/test-reprocess-modes.ts

# Manual validation
# Test 1: Smart Mode preservation
# 1. Process document → get connections
# 2. Mark 10 connections as user_validated=true
# 3. Reprocess with Smart Mode
# 4. Verify: 10 validated connections still exist
# 5. Verify: validated-connections-*.json in Storage

# Test 2: Reprocess All
# 1. Process document with connections
# 2. Reprocess All
# 3. Verify: All old connections deleted
# 4. Verify: New connections generated

# Test 3: Backup verification
# 1. Smart Mode reprocess
# 2. Download validated-connections-*.json from Storage
# 3. Verify: JSON contains validated connections with full data
```

---

### T-017: Build ConnectionsTab UI Component

**Priority**: High
**Estimated Effort**: 12 hours
**Dependencies**: T-016 (reprocess handler)

#### Task Purpose
**As a** user managing connections
**I need** UI to reprocess connections with mode and engine selection
**So that** I can update connections intelligently without losing validated work

#### Technical Requirements

**Files to Modify**:
```
src/components/admin/tabs/ConnectionsTab.tsx - Replace placeholder
```

**Functional Requirements**:
- REQ-1: Show document selector (single or batch)
- REQ-2: Show mode selector with descriptions (All, Add New, Smart)
- REQ-3: Show engine checkboxes (3 engines with descriptions)
- REQ-4: Show Smart Mode options (preserve validated, backup first)
- REQ-5: Show estimate (time and cost based on selections)
- REQ-6: Display current connection count for selected document
- REQ-7: Track reprocess job progress
- REQ-8: Show before/after connection statistics on completion

**UI Components**:
- Document selector (dropdown or list)
- Radio group for mode selection
- Checkboxes for engine selection
- Checkboxes for Smart Mode options
- Estimate display (read-only)
- Progress tracking
- Statistics display

**Implementation Steps**:
1. Create state for form inputs:
   ```typescript
   const [selectedDoc, setSelectedDoc] = useState<string | null>(null)
   const [mode, setMode] = useState<'all' | 'add_new' | 'smart'>('smart')
   const [engines, setEngines] = useState<string[]>(['semantic_similarity', 'contradiction_detection', 'thematic_bridge'])
   const [preserveValidated, setPreserveValidated] = useState(true)
   const [backupFirst, setBackupFirst] = useState(true)
   ```
2. Build form UI matching mockup (PRP lines 352-378)
3. Implement estimate calculation:
   ```typescript
   const estimate = calculateEstimate(engines, chunkCount)
   // Rough: 200ms per chunk for semantic, 50ms for contradiction, 500ms for thematic
   ```
4. Handle reprocess button → call reprocessConnections action
5. Poll job status and update progress
6. Show statistics on completion

**UI Layout** (from PRP lines 352-378):
```
╔══════════════════════════════════════════════════════════════════╗
║  REPROCESS CONNECTIONS                                           ║
║  Document: Gravity's Rainbow                                     ║
║  Current Connections: 85 (12 user-validated)                     ║
║                                                                  ║
║  Reprocess Mode:                                                 ║
║  ○ Reprocess All (delete all, regenerate)                       ║
║  ○ Add New (keep existing, add to newer docs)                   ║
║  ● Smart Mode (preserve validated, update rest)                 ║
║                                                                  ║
║  Engines to Run:                                                 ║
║  ☑ Semantic Similarity (embeddings-based, fast, free)           ║
║  ☑ Contradiction Detection (metadata-based, fast, free)         ║
║  ☑ Thematic Bridge (AI-powered, slow, $0.20)                   ║
║                                                                  ║
║  Smart Mode Options:                                             ║
║  ☑ Preserve user-validated connections                          ║
║  ☑ Save backup before reprocessing                              ║
║                                                                  ║
║  Estimated: ~8 minutes, $0.20                                   ║
║                                                                  ║
║  [Cancel] [Start Reprocessing]                                  ║
╚══════════════════════════════════════════════════════════════════╝
```

**Code Patterns to Follow**:
- **Form State**: React useState for all form inputs
- **Job Polling**: Similar to ProcessingDock polling pattern
- **Estimates**: Rough calculation based on chunk count and engines

#### Acceptance Criteria

```gherkin
Scenario 1: Display current connection stats
  Given document selected
  When ConnectionsTab loads
  Then current connection count should display
  And validated connection count should display
  And stats should update when document changes

Scenario 2: Mode selection updates options
  Given form open
  When user selects "Smart Mode"
  Then Smart Mode options should be enabled
  And options should show: preserve validated, backup first

  When user selects "Reprocess All"
  Then Smart Mode options should be disabled/hidden
  And warning should show about data loss

Scenario 3: Engine selection affects estimate
  Given all 3 engines selected
  When user unchecks "Thematic Bridge"
  Then estimate cost should drop by ~$0.20
  And estimate time should be faster

  When user checks only "Semantic Similarity"
  Then estimate should show fastest time, $0 cost

Scenario 4: Start reprocessing
  Given valid form selections
  When user clicks "Start Reprocessing"
  Then reprocessConnections action should be called
  And progress tracking should start
  And form should be disabled during processing

Scenario 5: Show results
  Given reprocess job completed
  When job status changes to 'completed'
  Then statistics should update
  And before/after connection counts should display
  And byEngine breakdown should show
```

**Rule-Based Criteria**:
- [ ] **UI**: Matches mockup design (PRP lines 352-378)
- [ ] **Modes**: All 3 modes selectable with clear descriptions
- [ ] **Engines**: 3 checkboxes with cost/speed indicators
- [ ] **Options**: Smart Mode options conditional on mode selection
- [ ] **Estimates**: Time and cost estimates based on selections
- [ ] **Validation**: "Start" button disabled if no engines selected
- [ ] **Progress**: Real-time job progress displayed
- [ ] **Statistics**: Before/after connection counts shown on completion

#### Validation Commands

```bash
# Component tests
npm test -- ConnectionsTab.test.tsx

# E2E tests
npm run test:e2e -- connections-tab.spec.ts

# Manual testing
# 1. Select document → verify stats load
# 2. Change mode → verify options update
# 3. Toggle engines → verify estimate changes
# 4. Start reprocess → verify progress tracking
# 5. Complete → verify statistics display
# 6. Smart Mode → verify validated connections preserved
```

---

## Phase 6: Export Workflow

### T-018: Create exportDocuments Server Action

**Priority**: High
**Estimated Effort**: 6 hours
**Dependencies**: None

#### Task Purpose
**As an** export system
**I need** to create background jobs for ZIP generation
**So that** users can download complete document bundles

#### Technical Requirements

**Files to Modify**:
```
src/app/actions/documents.ts - Add exportDocuments action
```

**Functional Requirements**:
- REQ-1: Accept array of document IDs (single or batch export)
- REQ-2: Accept options: includeConnections, includeAnnotations, format
- REQ-3: Create background job with type 'export_documents'
- REQ-4: Return job ID for tracking

**Action Signature**:
```typescript
export async function exportDocuments(
  documentIds: string[],
  options: {
    includeConnections?: boolean
    includeAnnotations?: boolean
    format?: 'storage' | 'zip'
  } = {}
): Promise<{ success: boolean; jobId?: string; error?: string }>
```

**Implementation Steps**:
1. Validate documentIds (non-empty array)
2. Create background job with input_data containing document IDs and options
3. Return job ID

**Code Patterns to Follow**:
- **Job Creation**: Standard pattern from other actions

#### Acceptance Criteria

```gherkin
Scenario 1: Export single document
  Given valid document ID
  When exportDocuments is called
  Then background job should be created
  And job type should be 'export_documents'
  And input_data should include document_ids array and options

Scenario 2: Batch export
  Given array of 5 document IDs
  When exportDocuments is called
  Then job should include all 5 IDs in input_data

Scenario 3: Export with options
  Given includeConnections=true and includeAnnotations=true
  When job is created
  Then input_data should include these options for handler
```

**Rule-Based Criteria**:
- [ ] **Functional**: Job creation works for single and batch
- [ ] **Validation**: Rejects empty documentIds array
- [ ] **Type Safety**: Options match export options interface

#### Validation Commands

```bash
# Unit tests
npm test -- actions/documents.test.ts -t exportDocuments
```

---

### T-019: Create export-document Background Job Handler

**Priority**: High
**Estimated Effort**: 12 hours
**Dependencies**: T-018 (exportDocuments action), T-001 (storage helpers)

#### Task Purpose
**As an** export job
**I need** to generate ZIP bundles with all document files
**So that** users can download portable document packages

#### Technical Requirements

**Files to Create**:
```
worker/handlers/export-document.ts
```

**Dependencies to Install**:
```bash
cd worker
npm install jszip
```

**Functional Requirements**:
- REQ-1: For each document, read all files from Storage
- REQ-2: Create ZIP structure with document folders
- REQ-3: Optionally include connections.json if includeConnections=true
- REQ-4: Optionally include annotations.json if includeAnnotations=true
- REQ-5: Generate ZIP blob
- REQ-6: Save ZIP to Storage under exports/ folder
- REQ-7: Create signed URL for download
- REQ-8: Return download URL in job output_data

**Implementation Steps**:
1. Create handler function
2. Import JSZip
3. For each document:
   - List Storage files: `listStorageFiles(supabase, storagePath)`
   - Read each file: `readFromStorage(supabase, filePath)`
   - Add to ZIP: `zip.folder(docId).file(filename, content)`
4. If includeConnections:
   - Query connections from Database
   - Create connections.json
   - Add to ZIP
5. If includeAnnotations:
   - Read annotations.json from Storage (if exists)
   - Add to ZIP
6. Generate ZIP:
   ```typescript
   const zipBlob = await zip.generateAsync({ type: 'blob' })
   ```
7. Save to Storage:
   ```typescript
   const zipPath = `${userId}/exports/export-${timestamp}.zip`
   await saveToStorage(supabase, zipPath, zipBlob)
   ```
8. Create signed URL (24-hour expiry for download):
   ```typescript
   const { data: signedUrl } = await supabase.storage
     .from('documents')
     .createSignedUrl(zipPath, 86400) // 24 hours
   ```
9. Mark job complete with download URL

**ZIP Structure**:
```
export-2025-10-12.zip
├── doc-id-1/
│   ├── source.pdf
│   ├── content.md
│   ├── chunks.json
│   ├── metadata.json
│   ├── manifest.json
│   ├── cached_chunks.json (if LOCAL mode)
│   ├── connections.json (if includeConnections)
│   └── annotations.json (if includeAnnotations)
├── doc-id-2/
│   └── (same structure)
└── manifest.json (top-level, describes all documents in ZIP)
```

**Code Patterns to Follow**:
- **Storage Helpers**: Use readFromStorage and listStorageFiles
- **Progress Updates**: Update progress for each document processed
- **Error Handling**: Handle missing files gracefully

#### Acceptance Criteria

```gherkin
Scenario 1: Export single document
  Given document with all files in Storage
  When export job runs
  Then ZIP should be created with document folder
  And ZIP should contain: source, content, chunks, metadata, manifest
  And ZIP should be saved to Storage under exports/
  And signed URL should be returned in output_data

Scenario 2: Export with connections
  Given includeConnections=true
  When export job runs
  Then connections.json should be included in ZIP
  And connections.json should contain all document connections

Scenario 3: Export with annotations
  Given includeAnnotations=true
  And annotations.json exists in Storage
  When export job runs
  Then annotations.json should be included in ZIP

Scenario 4: Batch export
  Given 5 documents to export
  When export job runs
  Then ZIP should have 5 document folders
  And top-level manifest should list all 5 documents
  And progress should update for each document (20%, 40%, 60%, 80%, 100%)

Scenario 5: Download ZIP
  Given export job completed
  When user accesses signed URL
  Then ZIP should download successfully
  And ZIP should be extractable with standard tools
  And all files should be valid JSON
```

**Rule-Based Criteria**:
- [ ] **Functional**: ZIP generation works for single and batch
- [ ] **Structure**: ZIP follows defined structure (document folders)
- [ ] **Options**: Connections and annotations included when requested
- [ ] **Signed URL**: URL works and expires after 24 hours
- [ ] **Progress**: Job progress updates during ZIP generation
- [ ] **File Integrity**: All JSON files valid and parseable
- [ ] **Performance**: <2 minutes for single document export

#### Validation Commands

```bash
# Unit tests
cd worker
npx jest handlers/__tests__/export-document.test.ts

# Integration test
npx tsx scripts/test-export-flow.ts

# Manual validation
# 1. Export single document
# 2. Download ZIP from signed URL
# 3. Extract ZIP
# 4. Verify files: source.pdf, content.md, chunks.json, metadata.json, manifest.json
# 5. Validate JSON schemas: npx tsx scripts/validate-exported-files.ts
# 6. Test with 5 documents → verify batch export
```

---

### T-020: Build ExportTab UI Component

**Priority**: High
**Estimated Effort**: 10 hours
**Dependencies**: T-019 (export handler)

#### Task Purpose
**As a** user exporting documents
**I need** UI to select documents and export options
**So that** I can download portable document bundles

#### Technical Requirements

**Files to Modify**:
```
src/components/admin/tabs/ExportTab.tsx - Replace placeholder
```

**Functional Requirements**:
- REQ-1: Display list of documents with multi-select
- REQ-2: Show export options: Include Connections, Include Annotations
- REQ-3: Show export button with selected count
- REQ-4: Track export job progress
- REQ-5: Display download button with signed URL when complete
- REQ-6: Support "Select All" for batch export

**UI Components**:
- Document list with checkboxes
- Export options form
- Progress tracking
- Download button

**Implementation Steps**:
1. Query documents for user
2. Build multi-select list
3. Add export options checkboxes
4. Implement export button handler:
   - Call exportDocuments action with selected IDs
   - Track export job
5. Poll job status
6. Show download button when job completes
7. Handle download (open signed URL)

**UI Layout**:
```
╔══════════════════════════════════════════════════════════════════╗
║  EXPORT DOCUMENTS                                                ║
║                                                                  ║
║  Select Documents:                                               ║
║  [Select All] [Select None]                                     ║
║                                                                  ║
║  ☑ Gravity's Rainbow (382 chunks, 500 pages)                   ║
║  ☑ The Stack (156 chunks, 200 pages)                           ║
║  ☐ Surveillance Capitalism (289 chunks, 400 pages)             ║
║                                                                  ║
║  Export Options:                                                 ║
║  ☑ Include Connections                                          ║
║  ☑ Include Annotations                                          ║
║                                                                  ║
║  Selected: 2 documents (~1.8MB estimated)                       ║
║                                                                  ║
║  [Export Selected (2)]                                          ║
║                                                                  ║
║  Export Progress: ████████░░ 80% (Processing document 2 of 2)  ║
║                                                                  ║
║  ✓ Export Complete! [Download ZIP]                             ║
╚══════════════════════════════════════════════════════════════════╝
```

**Code Patterns to Follow**:
- **Document List**: Query documents similar to Scanner
- **Multi-Select**: React state for selected IDs
- **Job Polling**: Standard job polling pattern

#### Acceptance Criteria

```gherkin
Scenario 1: Select documents for export
  Given document list displayed
  When user checks 2 documents
  Then selected count should update
  And export button should show "Export Selected (2)"

Scenario 2: Select All
  Given 10 documents in list
  When user clicks "Select All"
  Then all 10 documents should be checked
  And selected count should show 10

Scenario 3: Export with options
  Given 2 documents selected
  And "Include Connections" checked
  When user clicks Export
  Then exportDocuments should be called with includeConnections=true
  And export job should start

Scenario 4: Download exported ZIP
  Given export job completed
  When job status changes to 'completed'
  Then download button should appear
  And clicking download should open signed URL in new tab
  And ZIP should download

Scenario 5: Batch export progress
  Given exporting 5 documents
  When export job progresses
  Then progress should update: 20%, 40%, 60%, 80%, 100%
  And current document should display: "Processing document 3 of 5"
```

**Rule-Based Criteria**:
- [ ] **UI**: Document list with checkboxes
- [ ] **Selection**: Multi-select and Select All/None work
- [ ] **Options**: Export options checkboxes functional
- [ ] **Progress**: Real-time job progress displayed
- [ ] **Download**: Download button appears on completion
- [ ] **Estimation**: Size estimate shows for selected documents
- [ ] **Validation**: Export button disabled if no documents selected

#### Validation Commands

```bash
# Component tests
npm test -- ExportTab.test.tsx

# E2E tests
npm run test:e2e -- export-tab.spec.ts

# Manual testing
# 1. Select 2 documents → verify count updates
# 2. Click Select All → verify all checked
# 3. Export → verify progress tracking
# 4. Download → verify ZIP downloads and extracts
# 5. Batch export 5 documents → verify all included
```

---

## Phase 7: Integration & Polish

### T-021: Move Obsidian and Readwise to IntegrationsTab

**Priority**: Medium
**Estimated Effort**: 8 hours
**Dependencies**: T-007 (Admin Panel structure)

#### Task Purpose
**As a** user managing integrations
**I need** Obsidian and Readwise operations in Admin Panel
**So that** all document management is centralized

#### Technical Requirements

**Files to Modify**:
```
src/components/admin/tabs/IntegrationsTab.tsx - Replace placeholder
src/components/document/DocumentHeader.tsx - Remove Obsidian/Readwise buttons (optional, or keep as shortcuts)
```

**Functional Requirements**:
- REQ-1: IntegrationsTab should show Obsidian section with Export and Sync actions
- REQ-2: IntegrationsTab should show Readwise section with Import action
- REQ-3: Each integration should have configuration options
- REQ-4: Show operation history (recent exports, imports, syncs)

**Implementation Steps**:
1. Create Obsidian section:
   - Export to Obsidian button
   - Sync from Obsidian button
   - Configuration: Vault path, sync settings
2. Create Readwise section:
   - Import highlights button
   - Configuration: API key, filter settings
3. Add operation history:
   - Query recent jobs of type 'obsidian_export', 'obsidian_sync', 'readwise_import'
   - Display in table: Operation, Status, Timestamp
4. Reuse existing Server Actions from `src/app/actions/obsidian.ts` and `src/app/actions/readwise.ts`

**UI Layout**:
```
╔══════════════════════════════════════════════════════════════════╗
║  INTEGRATIONS                                                    ║
║                                                                  ║
║  ── Obsidian ──                                                 ║
║  [Export to Obsidian] [Sync from Obsidian]                     ║
║  Vault: /path/to/vault                                          ║
║  Last sync: 2025-10-12 10:30 AM                                ║
║                                                                  ║
║  ── Readwise ──                                                 ║
║  [Import Highlights]                                            ║
║  Last import: 2025-10-10 3:00 PM (47 highlights)              ║
║                                                                  ║
║  ── Operation History ──                                        ║
║  Operation              Status      Timestamp                   ║
║  Export to Obsidian     Completed   2025-10-12 10:30 AM       ║
║  Import Readwise        Completed   2025-10-10 3:00 PM        ║
║  Sync from Obsidian     Failed      2025-10-09 5:15 PM        ║
╚══════════════════════════════════════════════════════════════════╝
```

**Code Patterns to Follow**:
- **Server Actions**: Reuse existing actions from obsidian.ts and readwise.ts
- **Job Tracking**: Query background_jobs for integration job types
- **Configuration**: Use React state or context for settings

#### Acceptance Criteria

```gherkin
Scenario 1: Export to Obsidian
  Given IntegrationsTab open
  When user clicks "Export to Obsidian"
  Then Obsidian export action should be called
  And operation should appear in history
  And last sync timestamp should update on completion

Scenario 2: Import Readwise highlights
  Given IntegrationsTab open
  When user clicks "Import Highlights"
  Then Readwise import action should be called
  And progress should show in history
  And highlight count should display on completion

Scenario 3: View operation history
  Given 5 recent integration operations
  When user opens IntegrationsTab
  Then all 5 operations should display in history table
  And each should show operation type, status, timestamp
  And failed operations should be clearly indicated
```

**Rule-Based Criteria**:
- [ ] **Functional**: Obsidian and Readwise operations work from Admin Panel
- [ ] **History**: Operation history displays recent jobs
- [ ] **Configuration**: Settings persist between sessions
- [ ] **No Regressions**: Existing integration functionality unchanged
- [ ] **UX**: Clear status indicators for operations

#### Validation Commands

```bash
# Component tests
npm test -- IntegrationsTab.test.tsx

# E2E tests
npm run test:e2e -- integrations-tab.spec.ts

# Manual testing
# 1. Export to Obsidian → verify operation completes
# 2. Import Readwise → verify highlights imported
# 3. Check operation history → verify recent operations shown
# 4. Verify existing integration functionality still works
```

---

### T-022: Add Keyboard Shortcuts and Help Dialog

**Priority**: Low
**Estimated Effort**: 4 hours
**Dependencies**: T-007 (Admin Panel)

#### Task Purpose
**As a** power user
**I need** keyboard shortcuts for Admin Panel
**So that** I can navigate efficiently

#### Technical Requirements

**Files to Create**:
```
src/components/admin/KeyboardShortcutsDialog.tsx
```

**Files to Modify**:
```
src/components/admin/AdminPanel.tsx - Add keyboard shortcut handlers
```

**Functional Requirements**:
- REQ-1: Cmd+Shift+A (Mac) or Ctrl+Shift+A (Windows) toggles Admin Panel
- REQ-2: Number keys 1-6 switch tabs when panel open
- REQ-3: Esc closes panel
- REQ-4: ? opens keyboard shortcuts help dialog
- REQ-5: Help dialog shows all available shortcuts

**Implementation Steps**:
1. Install keyboard shortcut library:
   ```bash
   npm install react-hotkeys-hook
   ```
2. Add hotkey handlers in AdminPanel:
   ```typescript
   useHotkeys('cmd+shift+a,ctrl+shift+a', () => setIsOpen(!isOpen))
   useHotkeys('esc', () => setIsOpen(false), { enabled: isOpen })
   useHotkeys('1', () => setActiveTab('scanner'), { enabled: isOpen })
   // ... other tab shortcuts
   ```
3. Create KeyboardShortcutsDialog component
4. Add help button in Admin Panel header

**Shortcuts to Implement**:
- `Cmd+Shift+A` / `Ctrl+Shift+A`: Toggle Admin Panel
- `Esc`: Close Admin Panel
- `1`: Switch to Scanner tab
- `2`: Switch to Import tab
- `3`: Switch to Export tab
- `4`: Switch to Connections tab
- `5`: Switch to Integrations tab
- `6`: Switch to Jobs tab
- `?`: Show keyboard shortcuts help

**Code Patterns to Follow**:
- **Hotkeys**: Use react-hotkeys-hook library
- **Help Dialog**: Use shadcn Dialog component

#### Acceptance Criteria

```gherkin
Scenario 1: Toggle panel with keyboard
  Given Admin Panel closed
  When user presses Cmd+Shift+A
  Then Admin Panel should open

  When user presses Cmd+Shift+A again
  Then Admin Panel should close

Scenario 2: Navigate tabs with number keys
  Given Admin Panel open on Scanner tab
  When user presses '3'
  Then Export tab should become active

  When user presses '6'
  Then Jobs tab should become active

Scenario 3: Close with Esc
  Given Admin Panel open
  When user presses Esc
  Then Admin Panel should close

Scenario 4: View keyboard shortcuts help
  Given Admin Panel open
  When user presses '?'
  Then help dialog should open
  And all shortcuts should be listed with descriptions
```

**Rule-Based Criteria**:
- [ ] **Functional**: All keyboard shortcuts work
- [ ] **Platform**: Works on Mac (Cmd) and Windows (Ctrl)
- [ ] **Conditional**: Tab shortcuts only work when panel open
- [ ] **Help**: Help dialog lists all available shortcuts
- [ ] **Accessibility**: Shortcuts don't conflict with browser defaults

#### Validation Commands

```bash
# Manual testing
# 1. Press Cmd+Shift+A → verify panel toggles
# 2. Press 1-6 → verify tab switching
# 3. Press Esc → verify panel closes
# 4. Press ? → verify help dialog opens
# 5. Test on both Mac and Windows
```

---

### T-023: Add Tooltips and Improve UX Polish

**Priority**: Low
**Estimated Effort**: 6 hours
**Dependencies**: All previous tasks

#### Task Purpose
**As a** user navigating Admin Panel
**I need** helpful tooltips and smooth interactions
**So that** I understand what each action does

#### Technical Requirements

**Files to Modify**:
```
All Admin Panel components - Add tooltips and polish
```

**Functional Requirements**:
- REQ-1: All buttons should have tooltips with descriptions
- REQ-2: Important warnings should have info icons with tooltips
- REQ-3: Sync state badges should have tooltips explaining status
- REQ-4: Progress bars should show percentage on hover
- REQ-5: File size estimates should have explanatory tooltips

**Implementation Steps**:
1. Add shadcn Tooltip component:
   ```bash
   npx shadcn@latest add tooltip
   ```
2. Wrap all action buttons with tooltips:
   ```tsx
   <Tooltip>
     <TooltipTrigger asChild>
       <Button>Import</Button>
     </TooltipTrigger>
     <TooltipContent>
       <p>Restore chunks from Storage to Database</p>
     </TooltipContent>
   </Tooltip>
   ```
3. Add info icons with tooltips for warnings
4. Polish loading states (ensure all use consistent spinners)
5. Add empty states with helpful messages
6. Test responsiveness on tablet screens

**Tooltip Examples**:
- **Import button**: "Restore chunks from Storage to Database"
- **Sync button**: "Update Database to match Storage files"
- **Export button**: "Download ZIP bundle with all document files"
- **Reprocess All**: "Delete all connections and regenerate from scratch"
- **Smart Mode**: "Preserve user-validated connections, update others"
- **Healthy status**: "Storage and Database are in sync"
- **Out of Sync status**: "Storage and Database have different chunk counts"

**Code Patterns to Follow**:
- **Tooltips**: Use shadcn Tooltip component
- **Loading States**: Consistent use of Loader2 icon with spin animation
- **Empty States**: Helpful messages with actionable suggestions

#### Acceptance Criteria

```gherkin
Scenario 1: Tooltips on hover
  Given Admin Panel open
  When user hovers over any action button
  Then tooltip should appear after brief delay
  And tooltip should have helpful description

Scenario 2: Info icons with explanations
  Given conflict resolution dialog
  When user hovers over warning icon
  Then tooltip should explain the warning

Scenario 3: Empty states
  Given no documents in Storage
  When user opens Scanner tab
  Then empty state should show
  And message should say "No documents in Storage yet. Process a document to get started."
```

**Rule-Based Criteria**:
- [ ] **Tooltips**: All buttons have descriptive tooltips
- [ ] **Info Icons**: Important warnings have info icon tooltips
- [ ] **Empty States**: All tabs have empty state messages
- [ ] **Loading States**: Consistent loading indicators
- [ ] **Responsive**: Works on tablet (>768px) and desktop
- [ ] **Accessibility**: Tooltips are keyboard accessible

#### Validation Commands

```bash
# Manual testing
# 1. Hover over all buttons → verify tooltips
# 2. Check empty states on each tab
# 3. Verify loading states during operations
# 4. Test on tablet screen size (768px)
# 5. Navigate with keyboard → verify tooltip accessibility
```

---

### T-024: Phase 7 Validation & Regression Testing

**Priority**: Critical
**Estimated Effort**: 8 hours
**Dependencies**: All Phase 7 tasks

#### Task Purpose
**As a** QA validator
**I need** comprehensive validation of complete system
**So that** all features work together without regressions

#### Technical Requirements

**Files to Create**:
```
scripts/validate-complete-system.ts - Full system validation
```

**Test Coverage**:
1. **Full Workflow Tests**: Process → Export → Delete DB → Import → Verify
2. **Integration Tests**: All tabs work independently and together
3. **Regression Tests**: Existing features still work (document processing, annotations, etc.)
4. **Performance Tests**: Scanner and import operations meet performance targets
5. **UX Tests**: All interactions smooth, no broken UI states

**Validation Scenarios**:
1. **End-to-End Export-Import**:
   - Process 3 documents
   - Export all to ZIP
   - Reset database
   - Import from ZIP
   - Verify: All chunks, metadata, annotations restored
2. **Conflict Resolution**:
   - Process document
   - Modify chunks manually
   - Import with each strategy (skip, replace, merge_smart)
   - Verify: Strategy applied correctly
3. **Connection Reprocessing**:
   - Process document with connections
   - Validate some connections
   - Reprocess in Smart Mode
   - Verify: Validated connections preserved
4. **Admin Panel Navigation**:
   - Open panel, navigate all tabs
   - Trigger operations from each tab
   - Verify: All operations work

#### Acceptance Criteria

**Rule-Based Criteria**:
- [ ] **Export-Import**: Round-trip works (export → delete DB → import → verify)
- [ ] **Conflict Resolution**: All 3 strategies work correctly
- [ ] **Connection Preservation**: Smart Mode preserves validated connections
- [ ] **Admin Panel**: All tabs functional, no broken UI
- [ ] **Keyboard Shortcuts**: All shortcuts work
- [ ] **Performance**: Scanner <5s, Import <5min, Export <2min
- [ ] **Regression**: Existing features work (processing, annotations, reading)
- [ ] **No Console Errors**: No errors in browser console
- [ ] **No Data Loss**: All operations preserve data integrity

#### Validation Commands

```bash
# Full system validation
npx tsx scripts/validate-complete-system.ts

# Regression tests
npm run test:e2e

# Performance benchmarks
npm run benchmark:admin-panel

# Manual testing checklist (comprehensive)
# Phase 1: Storage Export
# [ ] Process PDF → verify all JSON files in Storage
# [ ] Process EPUB → verify same structure
# [ ] Process LOCAL mode → verify cached_chunks.json

# Phase 2: Admin Panel
# [ ] Open panel → verify slide-down animation
# [ ] Navigate all tabs → verify no errors
# [ ] Close with Esc → verify closes
# [ ] Keyboard shortcuts → verify all work

# Phase 3: Storage Scanner
# [ ] Scan → verify accurate Storage vs DB comparison
# [ ] Filters → verify all work correctly
# [ ] Row expansion → verify file details show

# Phase 4: Import Workflow
# [ ] Import new document → verify success
# [ ] Import conflict → verify dialog appears
# [ ] Apply each strategy → verify works correctly
# [ ] Annotations after import → verify functional

# Phase 5: Connection Reprocessing
# [ ] Reprocess All → verify fresh connections
# [ ] Smart Mode → verify validated preserved
# [ ] Backup verification → verify file in Storage

# Phase 6: Export Workflow
# [ ] Export single → verify ZIP downloads
# [ ] Extract ZIP → verify all files present
# [ ] Import exported ZIP → verify round-trip works

# Phase 7: Integration & Polish
# [ ] Obsidian operations → verify work from Admin Panel
# [ ] Readwise import → verify works
# [ ] Operation history → verify shows recent ops
# [ ] Tooltips → verify all present and helpful
# [ ] Empty states → verify all have helpful messages
```

---

## Critical Path Analysis

### Critical Path (Must-Have for MVP)

**Phase 1 (Week 1-2)**: Storage Export Infrastructure
- T-001 → T-002 → T-003 → T-004 → T-005 → T-006
- **Blocking**: All subsequent phases depend on Storage export working

**Phase 4 (Week 4)**: Import Workflow
- T-011 → T-012 → T-013 → T-014
- **Blocking**: Core value proposition (DB reset + quick restore)

**Phase 3 (Week 3)**: Storage Scanner
- T-009 → T-010
- **Parallel with Phase 4**: Can develop in parallel, not blocking

**Phase 2 (Week 2-3)**: Admin Panel UI
- T-007 → T-008
- **Parallel**: Can develop UI structure while Phase 1 completes

### Nice-to-Have (Can Be Deferred)

**Phase 5 (Week 5)**: Connection Reprocessing
- T-015 → T-016 → T-017
- **Deferrable**: Users can work without reprocessing initially

**Phase 6 (Week 5-6)**: Export Workflow
- T-018 → T-019 → T-020
- **Deferrable**: Manual export from Storage possible, ZIP is convenience

**Phase 7 (Week 6)**: Integration & Polish
- T-021 → T-022 → T-023 → T-024
- **Deferrable**: Polish and integrations can be iterative

### Parallelization Opportunities

**Week 1-2**:
- T-001, T-002 (parallel) → T-003 → T-004, T-005 (parallel) → T-006
- T-007, T-008 (parallel, UI track)

**Week 3**:
- T-009 → T-010 (Scanner track)
- T-011 → T-012 (Import track, parallel with Scanner)

**Week 4**:
- T-013 → T-014 (Complete Import)
- T-015 → T-016 (Start Connections, parallel)

**Week 5**:
- T-017 (Connections UI)
- T-018 → T-019 (Export track, parallel)

**Week 6**:
- T-020 (Export UI)
- T-021 → T-022 → T-023 (Polish track, parallel)
- T-024 (Final validation)

---

## Risk Mitigation Summary

### High-Priority Risks

1. **Import Conflicts Cause Data Loss** (Severity: HIGH)
   - Mitigation: Always backup, conflict UI shows data, default to Skip
   - Task Coverage: T-011, T-012, T-013

2. **Reprocess Loses User Validation** (Severity: HIGH)
   - Mitigation: Smart Mode preserves validated, backup to Storage
   - Task Coverage: T-015, T-016, T-017

3. **Storage vs DB Gets Out of Sync** (Severity: MEDIUM)
   - Mitigation: Scanner shows differences, clear sync actions
   - Task Coverage: T-009, T-010

### Testing Strategy to Mitigate Risks

- **Unit Tests**: All critical functions (storage helpers, conflict resolution, strategies)
- **Integration Tests**: Full workflows (export → import, reprocess with preservation)
- **Manual Validation**: Comprehensive checklist at end of each phase
- **Performance Tests**: Ensure operations meet time/cost targets
- **Regression Tests**: Verify existing features not broken

---

## Success Metrics

### Functional Requirements
- ✅ Every processed document has Storage backup (chunks.json, metadata.json, manifest.json)
- ✅ Admin Panel accessible from header, all tabs functional
- ✅ Storage Scanner accurately compares Storage vs Database
- ✅ Import workflow with 3 conflict resolution strategies working
- ✅ Connection reprocessing with Smart Mode preservation functional
- ✅ Export workflow generates valid ZIP bundles
- ✅ Obsidian and Readwise integrated into Admin Panel

### Performance Requirements
- Storage Scanner: <5 seconds for 50 documents
- Import: <5 minutes for 382 chunks (including embeddings)
- Export: <2 minutes for single document ZIP
- Reprocess: <15 minutes for 382 chunks, all 3 engines
- DB reset + restore: <10 minutes total vs 25 minutes reprocessing

### Data Integrity Requirements
- Zero data loss: All processed documents have Storage backups
- Annotation preservation: Import merge_smart doesn't break annotations
- Connection preservation: Smart Mode preserves user-validated connections
- Schema validation: All JSON files conform to TypeScript schemas

### Cost Savings
- Never reprocess unnecessarily: Save $0.20-0.60 per document
- Avoid redundant processing during development: Save hours + dollars
- Local development: Quick DB resets without data loss

---

## Appendix: Quick Reference

### Task Dependencies Graph

```
Phase 1: Storage Export
T-001 (Storage Helpers) ──┬─→ T-003 (Base Processor)
T-002 (JSON Schemas) ─────┘     ├─→ T-004 (PDF Processor)
                                 └─→ T-005 (EPUB Processor)
                                     └─→ T-006 (Phase 1 Validation)

Phase 2: Admin Panel
T-007 (Refactor AdminPanel) ──→ T-008 (Placeholder Tabs)

Phase 3: Storage Scanner
T-009 (scanStorage Action) ──→ T-010 (Scanner UI)

Phase 4: Import Workflow
T-011 (importFromStorage Action) ──→ T-012 (import-document Handler)
T-001 (Storage Helpers) ──────────┘     ├─→ T-013 (Conflict Dialog)
                                          └─→ T-014 (Import UI)

Phase 5: Connection Reprocessing
T-015 (reprocessConnections Action) ──→ T-016 (reprocess-connections Handler)
T-001 (Storage Helpers) ──────────────┘     └─→ T-017 (Connections UI)

Phase 6: Export Workflow
T-018 (exportDocuments Action) ──→ T-019 (export-document Handler)
T-001 (Storage Helpers) ──────────┘     └─→ T-020 (Export UI)

Phase 7: Integration & Polish
T-007 (Admin Panel) ──→ T-021 (IntegrationsTab)
                        T-022 (Keyboard Shortcuts)
                        T-023 (Tooltips & Polish)
                        T-024 (Final Validation)
```

### Task Effort Summary

**Total Estimated Effort**: 200 hours (~5 weeks for 1 developer at 40 hrs/week)

**By Phase**:
- Phase 1 (Storage Export): 27 hours
- Phase 2 (Admin Panel UI): 12 hours
- Phase 3 (Storage Scanner): 20 hours
- Phase 4 (Import Workflow): 40 hours
- Phase 5 (Connection Reprocessing): 32 hours
- Phase 6 (Export Workflow): 28 hours
- Phase 7 (Integration & Polish): 26 hours
- Validation & Testing: 15 hours

**By Priority**:
- Critical Tasks: 128 hours (64%)
- High Priority Tasks: 54 hours (27%)
- Medium/Low Priority Tasks: 18 hours (9%)

### File Structure Reference

```
src/
├── app/
│   └── actions/
│       └── documents.ts ─────────── 🆕 T-009, T-011, T-015, T-018
├── components/
│   ├── admin/
│   │   ├── AdminPanel.tsx ───────── ♻️ T-007
│   │   ├── ConflictResolutionDialog.tsx ─── 🆕 T-013
│   │   ├── KeyboardShortcutsDialog.tsx ──── 🆕 T-022
│   │   └── tabs/
│   │       ├── ScannerTab.tsx ───── 🆕 T-010
│   │       ├── ImportTab.tsx ────── 🆕 T-014
│   │       ├── ExportTab.tsx ────── 🆕 T-020
│   │       ├── ConnectionsTab.tsx ── 🆕 T-017
│   │       ├── IntegrationsTab.tsx ── 🆕 T-021
│   │       └── JobsTab.tsx ──────── ♻️ T-008

worker/
├── handlers/
│   ├── import-document.ts ───────── 🆕 T-012
│   ├── export-document.ts ───────── 🆕 T-019
│   └── reprocess-connections.ts ─── 🆕 T-016
├── lib/
│   ├── storage-helpers.ts ───────── 🆕 T-001
│   └── conflict-resolution.ts ───── 🆕 T-012
├── types/
│   └── storage.ts ───────────────── 🆕 T-002
└── processors/
    ├── base.ts ──────────────────── ♻️ T-003
    ├── pdf-processor.ts ─────────── ♻️ T-004
    └── epub-processor.ts ────────── ♻️ T-005
```

---

**END OF TASK BREAKDOWN**
