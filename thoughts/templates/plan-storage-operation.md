# [Feature Name] Implementation Plan

> Template for Storage-first portability operations (export, import, sync, scanning)

## Overview
[Brief description of storage operation and why it's needed]

## Current State Analysis
[What storage capabilities exist now, what's missing]

### Key Discoveries:
- [Current storage patterns with file:line]
- [Existing operations to model after]
- [Storage vs Database decisions]

## Desired End State
[Specific storage capability after completion, how to verify]

## Rhizome Architecture
- **Module**: Main App + Worker (if background processing)
- **Storage**: Source of Truth
- **Database**: Queryable Cache / Metadata
- **Migration**: Yes/No - [053_description.sql if yes]
- **Test Tier**: Critical/Stable
- **Admin Panel Integration**: Yes (Scanner/Import/Export tab)

## What We're NOT Doing
[Out-of-scope items]

## Implementation Approach

### Storage-First Philosophy
**Storage is source of truth for:**
- Original documents (`source.pdf`)
- Processed markdown (`content.md`)
- Chunks data (`chunks.json`)
- Metadata (`metadata.json`)
- Manifests (`manifest.json`)

**Database is cache for:**
- Queryable chunks
- Embeddings (pgvector)
- User data
- Processing status

### Portability Requirements
- Must support export to ZIP
- Must support import with conflict resolution
- Must validate integrity
- Must preserve user annotations

## Phase 1: Storage Structure

### Overview
[Define storage directory structure and file formats]

### Changes Required:

#### 1. Storage Path Design
**Pattern**: `userId/documentId/[artifacts]`

**Files**:
- `source.[ext]` - Original upload
- `content.md` - Processed markdown
- `chunks.json` - Chunk data with metadata
- `metadata.json` - Document metadata
- `manifest.json` - Artifact manifest

#### 2. Schema Definitions
**File**: `worker/types/storage-schemas.ts`
**Changes**:
```typescript
import { z } from 'zod'

export const ChunkStorageSchema = z.object({
  id: z.string().uuid(),
  content: z.string(),
  // ...
})

export const ManifestSchema = z.object({
  version: z.string(),
  createdAt: z.string(),
  // ...
})
```

### Success Criteria:

#### Automated Verification:
- [ ] Schema validation tests pass
- [ ] Type check: `npm run type-check`

#### Manual Verification:
- [ ] Upload test document
- [ ] Verify all artifacts in Storage
- [ ] Check manifest is valid JSON

---

## Phase 2: Export Operation

### Overview
[Implement export to Storage and ZIP bundle]

### Changes Required:

#### 1. Export Handler
**File**: `worker/handlers/export-document.ts`
**Changes**:
```typescript
export async function exportDocuments(
  documentIds: string[],
  userId: string
): Promise<ExportResult> {
  // 1. Fetch from database
  // 2. Generate Storage artifacts
  // 3. Create ZIP bundle
  // 4. Return signed URL
}
```

#### 2. Admin Panel Integration
**File**: `src/components/admin/ExportTab.tsx`
**Changes**: Add export UI

#### 3. Background Job
**File**: `worker/types/database.ts`
**Changes**: Add export job type

### Success Criteria:

#### Automated Verification:
- [ ] Export tests pass: `npm test worker/handlers/export-document.test.ts`
- [ ] ZIP validation works
- [ ] Signed URL generation works

#### Manual Verification:
- [ ] Export single document via Admin Panel
- [ ] Download ZIP and verify contents
- [ ] Export multiple documents
- [ ] Verify all artifacts present

---

## Phase 3: Import Operation with Conflict Resolution

### Overview
[Implement import from Storage with smart conflict handling]

### Changes Required:

#### 1. Import Handler
**File**: `worker/handlers/import-document.ts`
**Changes**:
```typescript
export async function importFromStorage(
  documentId: string,
  conflictStrategy: 'skip' | 'replace' | 'merge_smart'
): Promise<ImportResult> {
  // 1. Read from Storage
  // 2. Validate with Zod schemas
  // 3. Resolve conflicts
  // 4. Write to database
}
```

#### 2. Conflict Resolution
**Strategies**:
- `skip`: Don't import if exists
- `replace`: Overwrite existing
- `merge_smart`: Preserve user-validated connections

#### 3. Scanner Integration
**File**: `src/components/admin/ScannerTab.tsx`
**Changes**: Show Storage vs Database diff

### Success Criteria:

#### Automated Verification:
- [ ] Import tests pass for all strategies
- [ ] Conflict resolution logic tested
- [ ] Validation catches invalid data

#### Manual Verification:
- [ ] Import with 'skip' strategy
- [ ] Import with 'replace' strategy
- [ ] Import with 'merge_smart' strategy
- [ ] Verify Scanner shows correct state

---

## Phase 4: Integrity Validation

### Overview
[Ensure Storage and Database stay in sync]

### Changes Required:

#### 1. Validation Functions
**File**: `worker/lib/storage-validation.ts`
**Changes**:
- SHA-256 checksums
- Schema validation
- Completeness checks

#### 2. Scanner Enhancements
**File**: `src/components/admin/ScannerTab.tsx`
**Changes**:
- Show validation status
- Highlight discrepancies
- Offer repair actions

### Success Criteria:

#### Automated Verification:
- [ ] Validation tests pass
- [ ] Checksum verification works

#### Manual Verification:
- [ ] Run Scanner on healthy state
- [ ] Manually corrupt Storage file
- [ ] Verify Scanner detects issue
- [ ] Use repair function

---

## Testing Strategy

### Unit Tests:
- Schema validation
- Conflict resolution logic
- Checksum calculation
- ZIP creation/extraction

### Integration Tests:
- Export → Import round-trip
- Multi-document operations
- Conflict scenarios
- Scanner accuracy

### Manual Testing:
1. Export 5 documents to ZIP
2. Delete from database
3. Import from ZIP with each strategy
4. Verify all data restored correctly
5. Check Scanner shows clean state

## Performance Considerations

### Export Performance:
- Single document: <5 seconds
- 10 documents: <30 seconds
- 100 documents: <5 minutes

### Storage Costs:
- Average document: ~2MB Storage
- 1000 documents: ~2GB total

### Import Performance:
- Single document: <10 seconds
- ZIP with 10 documents: <60 seconds

## Migration Notes
[If adding new tables or columns for tracking]

## References
- Architecture: `docs/ARCHITECTURE.md`
- Storage Patterns: `docs/STORAGE_FIRST_PORTABILITY_GUIDE.md`
- Similar operation: `worker/handlers/[example].ts`
- Admin Panel: `src/components/admin/`
