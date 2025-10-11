# Readwise Integration Handoff

**Date**: October 5, 2025
**Status**: ✅ Core functionality complete, ready for UI integration
**Success Rate**: 69.7% (122/175 highlights imported for J R test)

---

## What Was Accomplished

### 1. Readwise Export API Integration

**Problem Identified**: Initially attempted to use Reader API (`/api/v3/list/`), which returned:
- 404 errors on document detail endpoint
- Null title/author fields for highlight collections
- Unreliable document structure

**Solution Implemented**: Switched to Readwise Export API (`/api/v2/export/`):
- Single endpoint fetches all books with highlights
- Proper book metadata (title, author, category)
- Better location data (page, location, order, time)
- Pagination support for large libraries

### 2. Files Created

**Core Implementation**:
- `worker/lib/readwise-export-api.ts` - Export API client
  - `export()` - Fetch books with pagination
  - `exportAll()` - Auto-handle pagination
  - `findBookByTitle()` - Fuzzy title matching
  - `searchBooks()` - Multi-criteria search

- `worker/scripts/test-readwise-export-import.ts` - Test script
  - Finds books by author (Gaddis)
  - Matches Readwise book to Rhizome document
  - Imports highlights with detailed reporting

**Support Files** (potentially deprecated):
- `worker/lib/readwise-reader-api.ts` - Reader API client (see cleanup notes)
- `worker/scripts/test-readwise-reader-import.ts` - Reader test (see cleanup notes)

### 3. Import Handler Updates

**File**: `worker/handlers/readwise-import.ts`

**Bug Fixes**:
1. **Line 290 - Type mismatch**: `findAnnotationMatch()` expects full `Annotation` interface
   - Added missing fields: `id`, `startOffset`, `endOffset`

2. **Line 120 - Invalid user_id**: Hardcoded `"dev-user-123"` caused UUID validation error
   - Fixed: Use `process.env.NEXT_PUBLIC_DEV_USER_ID` or fallback UUID

3. **Storage path**: Queried `markdown_path` (doesn't exist in schema)
   - Fixed: Use `storage_path` + `/content.md`

**New Function**:
```typescript
importFromReadwiseExport(
  rhizomeDocumentId: string,
  readwiseBook: ReadwiseBook
): Promise<ImportResults>
```

**Features**:
- Exact text matching (primary strategy)
- Fuzzy matching fallback (>0.8 confidence threshold)
- Location-aware chunk estimation (page/location/order types)
- ECS entity creation with 5 components (Position, Visual, Content, Temporal, ChunkRef)

### 4. Test Results

**Document**: J R by William Gaddis
**Total Highlights**: 175

| Category | Count | Percentage |
|----------|-------|------------|
| ✓ Exact matches | 122 | 69.7% |
| ? Needs review | 0 | 0.0% |
| ✗ Failed | 53 | 30.3% |

**Failure Analysis**:
- ~6 highlights: Image URLs (`![](https://readwise-assets...)`) - can't match markdown
- ~47 highlights: "No chunk found" - location estimates outside chunk boundaries

---

## File Cleanup Recommendations

### ⚠️ Reader API Files (Likely Deprecated)

**Files to Review**:
1. `worker/lib/readwise-reader-api.ts` (273 lines)
2. `worker/scripts/test-readwise-reader-import.ts` (175 lines)
3. `importFromReadwiseReader()` in `worker/handlers/readwise-import.ts` (lines 400-593)

**Status**: These files were created during initial exploration but the Reader API approach failed (404 errors, null metadata). The **Export API is the working solution**.

**Recommendation**:
- ✅ **Keep** if you want to support both import methods (unlikely)
- ❌ **Delete** if Export API meets all needs (recommended)
- 📦 **Archive** to `worker/.archive/` if unsure

**Delete Command** (if approved):
```bash
rm worker/lib/readwise-reader-api.ts
rm worker/scripts/test-readwise-reader-import.ts
# Manually remove importFromReadwiseReader() function from handlers/readwise-import.ts
```

### ✅ Export API Files (Keep These)

**Production Files**:
- `worker/lib/readwise-export-api.ts` ✓
- `worker/handlers/readwise-import.ts` ✓ (contains `importFromReadwiseExport()`)
- `worker/scripts/test-readwise-export-import.ts` ✓

---

## Next Steps

### Phase 1: Improve Import Accuracy (Target: 85%+ success rate)

**Priority 1: Filter Image Highlights**
```typescript
// In importFromReadwiseExport(), before processing:
const textHighlights = readwiseBook.highlights.filter(h =>
  !h.text.startsWith('![](') && !h.text.includes('readwise-assets')
)
```

**Priority 2: Improve Location Estimation**
Current algorithm in `estimateChunkFromLocation()`:
- Page: `location * 0.75` (assumes 500 pages → 378 chunks)
- Location: `location * 0.076` (assumes 5000 locations → 378 chunks)
- Order: Uses directly as index

**Problem**: These are rough estimates. Need data-driven calibration:
```typescript
// Calculate actual ratio from document
const totalPages = // from document metadata
const chunksPerPage = chunks.length / totalPages
const estimatedChunk = Math.floor(pageNumber * chunksPerPage)
```

**Priority 3: Enable Fuzzy Matching**
Currently fuzzy matches go to `needsReview` (threshold 0.8). Consider:
- Auto-import fuzzy matches >0.85 confidence
- Implement review UI for 0.70-0.85 range
- Reject <0.70

### Phase 2: UI Integration

**Feature: Per-Document Import Button**

**Location**: Document reader page (`src/app/read/[id]/page.tsx`)

**UI Design**:
```tsx
// In DocumentHeader or RightPanel
<Button
  onClick={() => handleReadwiseImport(documentId)}
  variant="outline"
  size="sm"
>
  <BookOpen className="w-4 h-4 mr-2" />
  Import Readwise Highlights
</Button>
```

**Implementation Flow**:
1. **User clicks button** → Modal opens
2. **Search Readwise library** by document title/author
3. **Show matching books** (if multiple, let user select)
4. **Trigger import** → Show progress (175 highlights processing...)
5. **Display results** → "122 imported, 53 failed" with details
6. **Refresh reader** → Annotations appear in sidebar

**Server Action** (`src/app/actions/readwise.ts`):
```typescript
'use server'

export async function importReadwiseForDocument(
  documentId: string,
  searchQuery: { title?: string; author?: string }
): Promise<ImportResults> {
  const token = process.env.READWISE_ACCESS_TOKEN
  const client = new ReadwiseExportClient(token)

  // Find matching book
  const books = await client.searchBooks(searchQuery)
  if (books.length === 0) {
    throw new Error('Book not found in Readwise')
  }

  // Import highlights
  return await importFromReadwiseExport(documentId, books[0])
}
```

**Modal Component** (`src/components/reader/ReadwiseImportModal.tsx`):
- Step 1: Search for book
- Step 2: Confirm match (show book cover, highlight count)
- Step 3: Import progress
- Step 4: Results summary with failed highlights

### Phase 3: Bulk Import

**Feature**: Import entire Readwise library

**Implementation**:
```typescript
// worker/scripts/bulk-readwise-import.ts
async function importEntireLibrary() {
  const client = new ReadwiseExportClient(token)
  const allBooks = await client.exportAll()

  for (const book of allBooks) {
    // Try to find matching document in Rhizome
    const rhizomeDoc = await findMatchingDocument(book.title, book.author)

    if (rhizomeDoc) {
      console.log(`Importing ${book.title}...`)
      await importFromReadwiseExport(rhizomeDoc.id, book)
    } else {
      console.log(`Skipping ${book.title} - not found in Rhizome`)
    }
  }
}
```

**UI Location**: Settings page or library page
- "Import All from Readwise" button
- Shows progress: "Importing book 5 of 142..."
- Final report: "Imported 89 books, 3,421 highlights"

### Phase 4: Testing & Validation

**Test Cases**:

1. **Different location types**:
   - [ ] Book with page numbers (most common)
   - [ ] Kindle with locations
   - [ ] Article with order indices
   - [ ] Podcast with time codes

2. **Edge cases**:
   - [ ] Document not in Readwise (graceful failure)
   - [ ] Readwise book matches multiple Rhizome documents
   - [ ] Duplicate import (should skip existing highlights)
   - [ ] Very long highlights (>1000 chars)

3. **Error scenarios**:
   - [ ] Invalid API token
   - [ ] Rate limiting (429 errors)
   - [ ] Network timeout
   - [ ] Document not fully processed in Rhizome

**Test Script Updates**:
```bash
# Test specific scenarios
npm run test:readwise-import -- --scenario=duplicate
npm run test:readwise-import -- --scenario=rate-limit
npm run test:readwise-import -- --book-id=12345
```

---

## Architecture Decisions

### Why Export API Over Reader API?

| Aspect | Reader API (/api/v3) | Export API (/api/v2) |
|--------|---------------------|---------------------|
| **Data structure** | Fragmented (list → detail) | Complete (single call) |
| **Metadata** | Null/undefined fields | Full book metadata |
| **Highlights** | Requires per-doc fetch | Included with books |
| **Reliability** | 404 errors on detail | Stable, well-documented |
| **Use case** | Reader app features | Library export/import |
| **Pagination** | Not required | Built-in cursor support |

**Decision**: Use Export API exclusively. Reader API files can be removed.

### Location Estimation Strategy

**Current approach**: Static ratios based on common book characteristics
- 500 pages → 378 chunks ≈ 0.75 chunks/page
- 5000 locations → 378 chunks ≈ 0.076 chunks/location

**Why not precise?** Readwise location data doesn't map 1:1 to Rhizome's chunking:
- Readwise: Based on source (PDF page, Kindle location)
- Rhizome: Semantic chunking (variable size, concept-based)

**Future improvement**: Calculate document-specific ratios:
```typescript
const ratio = chunks.length / documentMetadata.totalPages
const estimatedChunk = Math.floor(highlight.location * ratio)
```

### Why Fuzzy Matching Threshold at 0.8?

**Analysis**:
- 1.0 = Exact match (122 highlights, 69.7%)
- 0.8-1.0 = High confidence (0 highlights, 0%)
- <0.8 = Low confidence (not attempted)

**Observation**: Gap between exact (1.0) and fuzzy (0.8) is large. Consider:
- Lower threshold to 0.7 to catch more matches
- Implement graduated thresholds:
  - ≥0.90 → auto-import
  - 0.70-0.89 → needs review
  - <0.70 → failed

---

## Known Issues & Limitations

### Issue 1: Image Highlights Can't Be Imported
**Problem**: Readwise includes image URLs as highlights
**Example**: `![](https://readwise-assets.s3.amazonaws.com/media/...)`
**Impact**: ~6/175 highlights (3.4%)
**Workaround**: Filter these out before processing
**Long-term**: Support image annotations (store URL, display in reader)

### Issue 2: Location Estimates Outside Chunk Boundaries
**Problem**: Estimated chunk index > actual chunk count
**Example**: Location 414275 → chunk 3148, but only 378 chunks exist
**Impact**: ~47/175 highlights (26.9%)
**Cause**: Location type misinterpretation or calibration issues
**Fix**: Improve `estimateChunkFromLocation()` with document metadata

### Issue 3: No Duplicate Detection
**Problem**: Re-importing creates duplicate annotations
**Current**: No check for existing Readwise highlights
**Risk**: User confusion, database bloat
**Fix**: Track `readwise_id` in annotation metadata, skip if exists

### Issue 4: No Review UI for Fuzzy Matches
**Problem**: Fuzzy matches (0.8-1.0 confidence) go to `needsReview` array
**Current**: No UI to accept/reject suggestions
**Impact**: Potential matches lost
**Fix**: Build AnnotationReviewTab integration (already exists in RightPanel)

---

## Environment Configuration

### Required Environment Variables

**Main App** (`.env.local`):
```bash
READWISE_ACCESS_TOKEN=<your-token>
NEXT_PUBLIC_DEV_USER_ID=00000000-0000-0000-0000-000000000000
```

**Worker** (`worker/.env`):
```bash
READWISE_ACCESS_TOKEN=<your-token>
NEXT_PUBLIC_DEV_USER_ID=00000000-0000-0000-0000-000000000000
```

**Get Token**: https://readwise.io/access_token

### Test Commands

```bash
# Test import for specific book
cd worker
READWISE_ACCESS_TOKEN=<token> \
NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321 \
SUPABASE_SERVICE_ROLE_KEY=<key> \
NEXT_PUBLIC_DEV_USER_ID=00000000-0000-0000-0000-000000000000 \
npx tsx scripts/test-readwise-export-import.ts

# Or use environment files
cd worker
npx tsx scripts/test-readwise-export-import.ts # Uses .env
```

---

## Integration Checklist

### Backend (Ready ✓)
- [x] Readwise Export API client
- [x] Import handler with fuzzy matching
- [x] ECS entity creation
- [x] Test script with reporting
- [x] Error handling & logging

### Frontend (To Do)
- [ ] Import button in document reader
- [ ] Readwise book search modal
- [ ] Import progress indicator
- [ ] Results summary display
- [ ] Review UI for fuzzy matches
- [ ] Settings page integration (API token)

### Testing (To Do)
- [ ] Unit tests for import logic
- [ ] Integration tests with mock API
- [ ] E2E test with real Readwise data
- [ ] Performance test (1000+ highlights)
- [ ] Error scenario coverage

### Documentation (To Do)
- [ ] User guide: "How to import Readwise highlights"
- [ ] API documentation for import functions
- [ ] Troubleshooting guide (common errors)
- [ ] Migration guide (from Readwise to Rhizome)

---

## Quick Start for Next Developer

### 1. Clean Up (Optional)
```bash
# Remove deprecated Reader API files
rm worker/lib/readwise-reader-api.ts
rm worker/scripts/test-readwise-reader-import.ts
# Manually delete importFromReadwiseReader() from handlers/readwise-import.ts (lines ~400-593)
```

### 2. Test Current Implementation
```bash
cd worker
npx tsx scripts/test-readwise-export-import.ts
# Should show 69.7% success rate for J R
```

### 3. Improve Accuracy
Edit `worker/handlers/readwise-import.ts`:
- Filter image highlights
- Improve location estimation
- Lower fuzzy threshold to 0.7

### 4. Build UI
Create `src/components/reader/ReadwiseImportModal.tsx`:
- Search Readwise by book title
- Show matching books
- Trigger import
- Display results

### 5. Add Button
Edit `src/components/reader/DocumentHeader.tsx`:
```tsx
<Button onClick={() => setShowReadwiseModal(true)}>
  Import from Readwise
</Button>
```

---

## Success Metrics

**Current State**:
- ✓ Core import functionality working
- ✓ 69.7% success rate (baseline)
- ✓ Test script with detailed reporting
- ✓ Environment configured

**Target State**:
- 🎯 85%+ success rate (filter images, improve location estimation)
- 🎯 UI integration complete (button + modal + results)
- 🎯 Duplicate detection (skip existing highlights)
- 🎯 Review workflow (accept/reject fuzzy matches)

**Stretch Goals**:
- 📈 95%+ success rate (advanced fuzzy matching)
- 📈 Bulk import entire library (settings page)
- 📈 Auto-sync (periodic background job)
- 📈 Bi-directional sync (Rhizome → Readwise)

---

## References

**API Documentation**:
- Readwise Export API: https://readwise.io/api_deets
- Access Token: https://readwise.io/access_token

**Related Files**:
- Import handler: `worker/handlers/readwise-import.ts`
- Export API client: `worker/lib/readwise-export-api.ts`
- Test script: `worker/scripts/test-readwise-export-import.ts`
- Fuzzy matching: `worker/lib/fuzzy-matching.ts`

**Related Docs**:
- Integration test plan: `docs/todo/integration-testing-plan-2025-10-05.md`
- Recovery pipeline: `docs/todo/recovery-pipeline-testing.md`

---

**Handoff Complete** ✅
Next session: Start with Phase 1 (improve accuracy) or Phase 2 (UI integration)
