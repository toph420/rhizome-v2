# PDF ↔ Markdown Annotation Sync Implementation Plan

**Created**: 2025-10-27  
**Status**: Design Complete, Ready for Implementation  
**Priority**: High (Core UX Feature)  
**Estimated Effort**: 3-5 days for Phase 1

---

## Executive Summary

Enable PDF annotations to display in markdown view and vice versa through intelligent text-based coordinate mapping. This provides seamless annotation portability across viewing modes without requiring perfect bbox coverage from Docling.

**Key Insight**: We can achieve bidirectional sync through text matching + fuzzy search, making the system robust even with 0% bbox coverage. Bboxes become a precision enhancement, not a requirement.

---

## Current State Analysis

### ✅ What Works
- PDF annotations created with multi-rect coordinates (`pdfRects`)
- Annotations display correctly in PDF view at any zoom level
- Database schema supports both PDF coords and markdown offsets
- Chunks have `page_start`/`page_end` for page mapping
- Docling Python script extracts bboxes (lines 149-162)

### ❌ What's Broken
- **PDF → Markdown**: Annotations saved with `startOffset: 0, endOffset: 0`
  - BlockRenderer filters by offset overlap: `ann.endOffset > block.startOffset`
  - 0 overlaps nothing except first block
  - Result: Annotations invisible in markdown view

- **Bbox Coverage**: Currently 0% (empty arrays `[]`)
  - Docling extraction code exists and works
  - Likely not enabled during processing (`enableChunking` flag)
  - Need investigation to enable

### 🔍 Root Cause
PDF annotations use coordinates (x, y, page) instead of character offsets. The markdown view only understands character offsets. We need a bridge between these two coordinate systems.

---

## Solution Architecture

### Primary Strategy: Text-Based Coordinate Mapping

**Concept**: Use the annotation text itself as the bridge between coordinate systems.

```typescript
// When creating PDF annotation:
1. User selects text: "The key insight is that..."
2. PDF gives us: { text, page: 5, pdfRects: [...] }
3. We search chunks on page 5 for this text
4. Find match at chunk offset 1234
5. Calculate markdown offsets: { startOffset: 5678, endOffset: 5702 }
6. Save BOTH: { pdfRects, startOffset, endOffset }
7. Now visible in BOTH views!
```

**Why This Works**:
- Text is the source of truth (human-readable)
- Fuzzy matching handles OCR/formatting differences
- Works with 0% bbox coverage
- Portable across document formats

### Secondary Enhancement: Bbox-Based Mapping (Future)

Once bboxes achieve >70% coverage:

```typescript
// Precision mapping with bboxes:
1. Get chunk bboxes from database
2. Check which chunk bbox overlaps annotation bbox
3. Calculate relative position within chunk
4. Derive precise markdown offset
```

**Benefits**:
- More precise than text matching
- Handles non-text content (images, math)
- No fuzzy matching needed

---

## Implementation Phases

### Phase 1: Text-Based Annotation Sync (HIGH PRIORITY)

**Goal**: Enable PDF annotations to appear in markdown view through text matching.

**Estimated Time**: 2-3 days  
**Dependencies**: None (works with current data)

#### Step 1.1: Create Text Matching Utility
**File**: `src/lib/reader/text-offset-calculator.ts`

```typescript
interface OffsetCalculationResult {
  startOffset: number
  endOffset: number
  confidence: number  // 0.0-1.0
  method: 'exact' | 'fuzzy' | 'not_found'
  matchedChunkId?: string
}

/**
 * Find markdown offsets for text on a specific page.
 * Uses exact match first, falls back to fuzzy matching.
 */
export function calculateMarkdownOffsets(
  text: string,
  pageNumber: number,
  chunks: Chunk[]
): OffsetCalculationResult {
  // 1. Filter chunks that span the target page
  const pageChunks = chunks.filter(c => 
    c.page_start && c.page_end &&
    pageNumber >= c.page_start && 
    pageNumber <= c.page_end
  )
  
  // 2. Try exact text match first
  for (const chunk of pageChunks) {
    const index = chunk.content.indexOf(text)
    if (index !== -1) {
      return {
        startOffset: chunk.start_offset + index,
        endOffset: chunk.start_offset + index + text.length,
        confidence: 1.0,
        method: 'exact',
        matchedChunkId: chunk.id
      }
    }
  }
  
  // 3. Fall back to fuzzy matching (Levenshtein distance)
  const fuzzyMatch = findFuzzyMatch(text, pageChunks)
  if (fuzzyMatch.confidence > 0.75) {
    return fuzzyMatch
  }
  
  // 4. Not found
  return {
    startOffset: 0,
    endOffset: 0,
    confidence: 0.0,
    method: 'not_found'
  }
}
```

**Implementation Details**:
- Use sliding window for fuzzy matching
- Levenshtein distance normalized by length
- Confidence threshold: 0.75 minimum
- Handle whitespace normalization
- Case-insensitive comparison option

#### Step 1.2: Update PDF Annotation Creation
**File**: `src/components/rhizome/pdf-viewer/PDFViewer.tsx`

```typescript
// Add chunks prop
interface PDFViewerProps {
  // ... existing props
  chunks: Chunk[]  // NEW: For text matching
}

const handleCreateAnnotation = async () => {
  if (!selection) return
  
  // NEW: Calculate markdown offsets
  const offsetResult = calculateMarkdownOffsets(
    selection.text,
    selection.pdfRect.pageNumber,
    chunks
  )
  
  // Log confidence for debugging
  console.log('[PDFViewer] Offset calculation:', {
    confidence: offsetResult.confidence,
    method: offsetResult.method
  })
  
  const result = await createAnnotation({
    documentId,
    text: selection.text,
    // NEW: Use calculated offsets instead of 0
    startOffset: offsetResult.startOffset,
    endOffset: offsetResult.endOffset,
    chunkIds: offsetResult.matchedChunkId ? [offsetResult.matchedChunkId] : [],
    color: 'yellow',
    textContext: {
      before: '',
      content: selection.text,
      after: '',
    },
    // Keep PDF coordinates for PDF view
    pdfPageNumber: selection.pdfRect.pageNumber,
    pdfRects: selection.pdfRects,
    pdfX: selection.pdfRect.x,
    pdfY: selection.pdfRect.y,
    pdfWidth: selection.pdfRect.width,
    pdfHeight: selection.pdfRect.height,
    // NEW: Store sync metadata
    syncConfidence: offsetResult.confidence,
    syncMethod: offsetResult.method
  })
}
```

#### Step 1.3: Add Sync Metadata to Schema
**File**: `src/lib/ecs/components.ts`

```typescript
export interface PositionComponent {
  // ... existing fields
  
  // Annotation sync metadata
  syncConfidence?: number  // 0.0-1.0 confidence in PDF↔markdown mapping
  syncMethod?: 'exact' | 'fuzzy' | 'bbox' | 'manual'  // How offsets were calculated
  syncNeedsReview?: boolean  // True if confidence < 0.85
}
```

#### Step 1.4: Update ECS Operations
**File**: `src/lib/ecs/annotations.ts`

```typescript
export interface CreateAnnotationInput {
  // ... existing fields
  
  // Sync metadata
  syncConfidence?: number
  syncMethod?: 'exact' | 'fuzzy' | 'bbox' | 'manual'
}

// Update create() to store sync metadata
```

#### Step 1.5: Testing
- Create annotation in PDF view
- Switch to markdown view
- Verify annotation appears with correct highlighting
- Test with:
  - Single-line selections
  - Multi-line selections
  - Text with special characters
  - OCR'd text (fuzzy matching)

**Success Criteria**:
- ✅ 95%+ exact match rate for clean PDFs
- ✅ 85%+ fuzzy match rate for OCR'd PDFs
- ✅ Annotations visible in both views
- ✅ Highlights align with correct text

---

### Phase 2: Bbox Investigation & Enhancement (MEDIUM PRIORITY)

**Goal**: Fix bbox extraction and use for precision mapping.

**Estimated Time**: 1-2 days  
**Dependencies**: Phase 1 complete (bbox is enhancement, not requirement)

#### Step 2.1: Investigate Bbox Extraction
**Question**: Why are bboxes empty when Docling extraction code exists?

**Investigation Steps**:
1. Check PDF processor configuration
2. Verify `enableChunking` flag is true
3. Add logging to Python script bbox extraction
4. Test with new PDF upload
5. Check if Chonkie chunking preserves Docling metadata

**File**: `worker/processors/pdf-processor.ts`

```typescript
// Verify enableChunking is true
const doclingOptions = {
  enableChunking: true,  // MUST be true for bboxes
  chunkSize: 512,
  tokenizer: 'Xenova/all-mpnet-base-v2'
}
```

#### Step 2.2: Add Bbox-Based Offset Calculation
**File**: `src/lib/reader/bbox-offset-calculator.ts`

```typescript
/**
 * Calculate markdown offsets using bbox overlap.
 * More precise than text matching when bboxes available.
 */
export function calculateOffsetsFromBbox(
  annotationBbox: BBox,
  pageNumber: number,
  chunks: Chunk[]
): OffsetCalculationResult {
  // 1. Find chunks on this page
  const pageChunks = chunks.filter(c => 
    c.page_start <= pageNumber && 
    c.page_end >= pageNumber &&
    c.bboxes && c.bboxes.length > 0
  )
  
  // 2. Calculate bbox overlap with each chunk
  for (const chunk of pageChunks) {
    for (const bbox of chunk.bboxes) {
      if (bbox.page !== pageNumber) continue
      
      const overlap = calculateBboxOverlap(annotationBbox, bbox)
      if (overlap > 0.5) {  // >50% overlap
        // 3. Calculate relative position within chunk
        const relativePosition = calculateRelativePosition(
          annotationBbox, 
          bbox
        )
        
        // 4. Map to character offset
        const offsetInChunk = Math.floor(
          chunk.content.length * relativePosition
        )
        
        return {
          startOffset: chunk.start_offset + offsetInChunk,
          endOffset: chunk.start_offset + offsetInChunk + estimatedLength,
          confidence: overlap,
          method: 'bbox',
          matchedChunkId: chunk.id
        }
      }
    }
  }
  
  return { confidence: 0.0, method: 'not_found' }
}
```

#### Step 2.3: Hybrid Approach
**Strategy**: Use bbox when available, fall back to text matching.

```typescript
export function calculateOffsetsHybrid(
  text: string,
  pdfRects: PdfRect[],
  pageNumber: number,
  chunks: Chunk[]
): OffsetCalculationResult {
  // 1. Try bbox-based if chunks have bboxes
  const hasBboxes = chunks.some(c => c.bboxes?.length > 0)
  if (hasBboxes && pdfRects.length > 0) {
    const bboxResult = calculateOffsetsFromBbox(
      pdfRects[0], 
      pageNumber, 
      chunks
    )
    if (bboxResult.confidence > 0.7) {
      return bboxResult
    }
  }
  
  // 2. Fall back to text matching
  return calculateMarkdownOffsets(text, pageNumber, chunks)
}
```

#### Step 2.4: Testing
- Upload new PDF with bbox extraction enabled
- Verify bbox coverage >70%
- Test bbox-based offset calculation
- Compare accuracy with text matching
- Measure performance difference

**Success Criteria**:
- ✅ Bbox coverage >70% for clean PDFs
- ✅ Bbox-based matching >95% accurate
- ✅ Falls back gracefully when bboxes unavailable

---

### Phase 3: Bidirectional Sync (MEDIUM PRIORITY)

**Goal**: Annotations created in markdown view appear in PDF view.

**Estimated Time**: 1 day  
**Dependencies**: Phase 1 complete

#### Step 3.1: Markdown → PDF Coordinate Calculation
**File**: `src/lib/reader/pdf-coordinate-calculator.ts`

```typescript
/**
 * Calculate PDF coordinates from markdown offsets.
 * Uses chunks with bbox data or page mapping.
 */
export function calculatePdfCoordinates(
  startOffset: number,
  endOffset: number,
  chunks: Chunk[]
): PdfCoordinateResult {
  // 1. Find chunk(s) containing these offsets
  const containingChunks = chunks.filter(c =>
    startOffset >= c.start_offset &&
    startOffset < c.end_offset
  )
  
  if (containingChunks.length === 0) {
    return { found: false }
  }
  
  const chunk = containingChunks[0]
  
  // 2. Use bboxes if available
  if (chunk.bboxes && chunk.bboxes.length > 0) {
    return calculateFromBboxes(startOffset, endOffset, chunk)
  }
  
  // 3. Fall back to page estimation
  if (chunk.page_start) {
    return {
      found: true,
      pageNumber: chunk.page_start,
      confidence: 0.5,
      method: 'page_estimation'
      // Coordinates would be rough estimates
    }
  }
  
  return { found: false }
}
```

#### Step 3.2: Update Markdown Annotation Creation
**File**: `src/components/reader/VirtualizedReader.tsx`

```typescript
// When creating annotation from markdown selection:
const handleCreateAnnotation = async () => {
  // ... existing code ...
  
  // NEW: Calculate PDF coordinates
  const pdfCoords = calculatePdfCoordinates(
    selection.startOffset,
    selection.endOffset,
    chunks
  )
  
  await createAnnotation({
    // ... existing fields ...
    
    // Add PDF coordinates if found
    pdfPageNumber: pdfCoords.found ? pdfCoords.pageNumber : undefined,
    pdfRects: pdfCoords.found ? pdfCoords.rects : undefined,
    // ... sync metadata ...
  })
}
```

#### Step 3.3: Testing
- Create annotation in markdown view
- Switch to PDF view
- Verify annotation appears (may be approximate)
- Test accuracy with bbox vs without

**Success Criteria**:
- ✅ Markdown annotations appear in PDF view
- ✅ Positioning accurate within ±10% with bboxes
- ✅ Page number accurate without bboxes

---

### Phase 4: Image & Table Extraction (LOW-MEDIUM PRIORITY)

**Goal**: Extract images and tables from PDFs, embed in markdown.

**Estimated Time**: 2-3 days  
**Dependencies**: None (parallel track)

#### Step 4.1: Enable Docling Image Extraction
**File**: `worker/processors/pdf-processor.ts`

```typescript
const pipelineOptions = {
  do_picture_classification: false,  // Skip AI classification (slow)
  do_picture_description: true,      // Generate captions
  generate_picture_images: true,     // Extract figures
  generate_table_images: true,       // Extract tables
  images_scale: 2.0,                 // 144 DPI (2x 72 DPI)
  do_table_structure: true,          // Parse table structure
}
```

#### Step 4.2: Storage Upload Pipeline
**File**: `worker/lib/image-storage.ts`

```typescript
/**
 * Upload extracted images to Supabase Storage.
 * Returns storage URLs for markdown embedding.
 */
export async function uploadDocumentImages(
  documentId: string,
  images: ExtractedImage[]
): Promise<ImageReference[]> {
  const references: ImageReference[] = []
  
  for (const image of images) {
    // Generate storage path
    const storagePath = `images/${documentId}/${image.type}-${image.pageNumber}-${image.index}.png`
    
    // Upload to Supabase Storage
    const { data, error } = await supabase.storage
      .from('documents')
      .upload(storagePath, image.buffer, {
        contentType: 'image/png',
        upsert: true
      })
    
    if (!error) {
      // Get public URL
      const { data: urlData } = supabase.storage
        .from('documents')
        .getPublicUrl(storagePath)
      
      references.push({
        type: image.type,
        pageNumber: image.pageNumber,
        storageUrl: urlData.publicUrl,
        caption: image.caption,
        chunkIndex: image.chunkIndex
      })
    }
  }
  
  return references
}
```

#### Step 4.3: Markdown Embedding
**File**: `worker/lib/markdown-image-embedder.ts`

```typescript
/**
 * Embed image references into markdown at appropriate positions.
 */
export function embedImagesInMarkdown(
  markdown: string,
  images: ImageReference[],
  chunks: ProcessedChunk[]
): string {
  // Sort images by chunk position
  const sortedImages = images.sort((a, b) => 
    a.chunkIndex - b.chunkIndex
  )
  
  let result = markdown
  let offset = 0
  
  for (const image of sortedImages) {
    const chunk = chunks[image.chunkIndex]
    if (!chunk) continue
    
    // Find insertion point (end of chunk)
    const insertPosition = chunk.endOffset + offset
    
    // Create markdown image syntax
    const imageMarkdown = `\n\n![${image.caption || 'Figure'}](${image.storageUrl})\n\n`
    
    // Insert at position
    result = result.slice(0, insertPosition) + 
             imageMarkdown + 
             result.slice(insertPosition)
    
    offset += imageMarkdown.length
  }
  
  return result
}
```

#### Step 4.4: Table Handling
**Decision Point**: Native markdown tables vs images?

**Option A: Native Markdown**
```markdown
| Column 1 | Column 2 | Column 3 |
|----------|----------|----------|
| Value 1  | Value 2  | Value 3  |
```
- ✅ Searchable, editable
- ❌ Complex tables lose formatting

**Option B: Table Images**
```markdown
![Table 1: Financial Data](storage://tables/doc-id/page-5-table-1.png)
```
- ✅ Preserves exact formatting
- ❌ Not searchable

**Recommended**: Hybrid approach
- Simple tables (<5 cols, <10 rows): Native markdown
- Complex tables: Image with alt text containing data

#### Step 4.5: Testing
- Upload PDF with images and tables
- Verify images extracted and uploaded
- Check markdown rendering
- Test storage URL accessibility
- Verify image quality at different scales

**Success Criteria**:
- ✅ Images extracted with >90% success rate
- ✅ Storage URLs accessible and fast (<500ms)
- ✅ Images embedded at correct positions
- ✅ Markdown rendering handles images correctly

---

## Database Schema Updates

### Migration: Add Sync Metadata Fields

**File**: `supabase/migrations/XXX_annotation_sync_metadata.sql`

```sql
-- Add sync confidence and method to Position component data
-- These are stored in JSONB so no schema change needed
-- Just document the fields:

-- Position component data structure:
-- {
--   "documentId": "uuid",
--   "startOffset": number,
--   "endOffset": number,
--   "pdfPageNumber": number | null,
--   "pdfRects": array | null,
--   "syncConfidence": number | null,     -- NEW
--   "syncMethod": string | null,         -- NEW
--   "syncNeedsReview": boolean | null    -- NEW
-- }

-- No migration needed - JSONB is schemaless
-- TypeScript types enforce structure
```

---

## Testing Strategy

### Unit Tests
```typescript
// src/lib/reader/__tests__/text-offset-calculator.test.ts
describe('calculateMarkdownOffsets', () => {
  it('finds exact match on correct page', () => {
    const result = calculateMarkdownOffsets(
      'test text',
      5,
      mockChunks
    )
    expect(result.method).toBe('exact')
    expect(result.confidence).toBe(1.0)
  })
  
  it('uses fuzzy matching for OCR errors', () => {
    const result = calculateMarkdownOffsets(
      'test texl',  // typo
      5,
      mockChunks
    )
    expect(result.method).toBe('fuzzy')
    expect(result.confidence).toBeGreaterThan(0.75)
  })
  
  it('returns not_found for missing text', () => {
    const result = calculateMarkdownOffsets(
      'nonexistent',
      5,
      mockChunks
    )
    expect(result.method).toBe('not_found')
    expect(result.confidence).toBe(0.0)
  })
})
```

### Integration Tests
1. **PDF → Markdown Sync**
   - Create annotation in PDF view
   - Verify appears in markdown view
   - Check offset accuracy

2. **Markdown → PDF Sync**
   - Create annotation in markdown view
   - Verify appears in PDF view
   - Check coordinate accuracy

3. **Bidirectional Consistency**
   - Create in PDF, verify in markdown
   - Switch views multiple times
   - Edit annotation, verify sync maintained

### Manual Testing Checklist
- [ ] Clean PDF with perfect text extraction
- [ ] OCR'd PDF with minor errors
- [ ] Scanned PDF with major errors
- [ ] Single-line annotations
- [ ] Multi-line annotations
- [ ] Annotations near page boundaries
- [ ] Annotations with special characters
- [ ] Image-heavy PDFs (Phase 4)
- [ ] Table-heavy PDFs (Phase 4)

---

## Performance Considerations

### Text Matching Optimization
- Cache chunk content in memory during annotation creation
- Use binary search for offset calculation
- Limit fuzzy matching to ±100 chars of expected position
- Pre-filter chunks by page before searching

### Bbox Calculation Optimization
- Index bboxes by page for fast lookup
- Cache bbox overlap calculations
- Use spatial data structures (R-tree) for large documents

### Image Extraction Optimization
- Process images in parallel
- Compress before storage (WebP for photos, PNG for diagrams)
- Generate thumbnails for preview
- Lazy-load images in markdown view

**Expected Performance**:
- Text matching: <10ms per annotation
- Bbox calculation: <5ms per annotation (when available)
- Image extraction: ~50-200ms per image (depending on size)
- Total annotation creation: <50ms end-to-end

---

## Success Metrics

### Phase 1 (Text-Based Sync)
- **Match Accuracy**: >95% exact match rate for clean PDFs
- **Fuzzy Match**: >85% success rate for OCR'd PDFs
- **View Consistency**: 100% of annotations visible in both views
- **Performance**: <50ms to create annotation with offset calculation
- **User Satisfaction**: Seamless experience switching between views

### Phase 2 (Bbox Enhancement)
- **Coverage**: >70% of chunks have bbox data
- **Accuracy**: >95% precise positioning with bboxes
- **Fallback**: 100% graceful degradation to text matching
- **Performance**: <20ms bbox-based calculation

### Phase 3 (Bidirectional)
- **Markdown→PDF**: >80% annotations displayable in PDF view
- **Positioning**: ±10% accuracy with bboxes, ±25% without
- **Consistency**: 100% round-trip sync (PDF→MD→PDF preserves position)

### Phase 4 (Images/Tables)
- **Extraction Rate**: >90% images successfully extracted
- **Quality**: Images readable at 2x scale (144 DPI)
- **Storage**: <500ms to retrieve image from storage
- **Rendering**: Markdown view loads with images in <2s

---

## Risk Mitigation

### Risk: Text matching fails for poor OCR
**Mitigation**: 
- Implement aggressive fuzzy matching (Levenshtein distance)
- Allow manual offset adjustment in UI
- Store sync confidence and flag low-confidence annotations

### Risk: Bbox extraction remains broken
**Mitigation**:
- Phase 1 doesn't depend on bboxes
- System fully functional with text matching alone
- Bboxes are enhancement, not requirement

### Risk: Page mapping inaccurate
**Mitigation**:
- Use multi-page search window (±1 page)
- Validate with chunk boundaries
- Fall back to document-wide search if needed

### Risk: Performance degradation with large documents
**Mitigation**:
- Index chunks by page for fast filtering
- Cache frequently accessed chunks
- Use Web Workers for fuzzy matching
- Limit search scope aggressively

### Risk: Images increase storage costs
**Mitigation**:
- Compress images before storage (WebP/PNG)
- Store only images referenced in markdown
- Implement storage quota limits
- Lazy-load images on demand

---

## Future Enhancements

### Post-MVP Ideas
1. **Smart Annotation Suggestions**
   - AI suggests relevant passages to annotate
   - Based on reading patterns and highlights

2. **Annotation Templates**
   - Pre-defined highlight colors for different purposes
   - Quick-capture for common annotation types

3. **Cross-Document Linking**
   - Link annotations across multiple documents
   - Build knowledge graph from annotations

4. **Collaborative Annotations**
   - Share annotations with other users
   - Comment threads on highlights

5. **Export Formats**
   - Export annotations to Obsidian
   - Export to Readwise
   - PDF export with highlights

6. **OCR Improvement**
   - Re-run OCR on low-confidence regions
   - Manual correction interface
   - Learn from user corrections

---

## Dependencies & Prerequisites

### Required Libraries
- `fast-levenshtein`: Fuzzy string matching
- Existing: `@supabase/supabase-js` (storage)
- Existing: Docling Python (image extraction)

### Configuration
- Supabase Storage bucket: `documents` (already exists)
- Storage path structure: `images/{documentId}/{type}-{page}-{index}.png`

### Team Knowledge
- PDF.js coordinate systems
- ECS component architecture
- Zustand store patterns
- Supabase Storage API

---

## Rollout Plan

### Phase 1: Beta Testing (Week 1-2)
- Deploy text-based sync to development
- Test with 10-20 diverse PDFs
- Gather accuracy metrics
- Fix edge cases

### Phase 2: Bbox Investigation (Week 2-3)
- Enable bbox extraction
- Verify coverage improvement
- Integrate bbox-based calculation
- Compare accuracy with text matching

### Phase 3: Production Release (Week 3-4)
- Deploy Phase 1 to production
- Monitor performance and errors
- Collect user feedback
- Iterate based on usage patterns

### Phase 4: Image Enhancement (Week 4-6)
- Implement image extraction
- Test storage performance
- Roll out gradually by document type
- Monitor storage usage and costs

---

## Conclusion

This implementation plan provides a robust, phased approach to PDF↔Markdown annotation sync. By prioritizing text-based matching (Phase 1), we achieve core functionality immediately without dependencies. Bbox enhancement (Phase 2) and image extraction (Phase 4) are valuable additions that don't block the main feature.

**Key Success Factors**:
- ✅ Text matching works with 0% bbox coverage
- ✅ Graceful degradation at every level
- ✅ Performance optimized for large documents
- ✅ User experience seamless across views
- ✅ Future-proof architecture for enhancements

**Next Step**: Begin Phase 1 implementation with `text-offset-calculator.ts`.
