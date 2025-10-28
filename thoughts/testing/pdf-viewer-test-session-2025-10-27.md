# PDF Viewer Test Session

**Date:** October 27, 2025
**Tester:** Automated Testing Session
**Browser:** Chrome (latest)
**Device:** Desktop (macOS)

---

## Test Document Information

**Document ID:** `961851b8-7fc0-40b0-a83c-29c14c486477`
**Title:** War Fever -- J. G. Ballard
**Source Type:** PDF
**Processing Status:** ✅ Completed

**Test URL:** `http://localhost:3000/read/961851b8-7fc0-40b0-a83c-29c14c486477`

### Document Data Summary
- **Chunks:** 179 total chunks
- **Bboxes:** 1 chunk with bbox data (⚠️ limited - will test fallback indicators)
- **Connections:** 0 connections detected (⚠️ will test "No connections" states)
- **Page Count:** Not set in metadata (⚠️ may need investigation)
- **Outline:** No PDF outline/TOC available
- **Storage:** ✅ PDF file available in Supabase Storage (8.9 MB)

### Testing Implications
✅ **Can Test:**
- Phase 1: PDF loading, navigation, zoom controls
- Phase 2: Text selection, metadata display
- Phase 3: Annotation creation and persistence
- Phase 4: Fallback indicators (most chunks lack bboxes)
- Phase 5: "No connections" error states

⚠️ **Limited Testing:**
- Chunk boundaries with bboxes (only 1 chunk has data)
- Connection-aware chunks (no connections)
- Heatmap with data (will show empty state)
- Outline navigation (no TOC available)

---

## 🎯 Phase 1: Foundation - Basic PDF Display

### PDF Loading & Display
- [ ] **Navigate to test URL**
  - URL: `http://localhost:3000/read/961851b8-7fc0-40b0-a83c-29c14c486477`
  - Expected: Document loads in markdown view initially

- [ ] **Toggle to PDF view**
  - Click "View PDF" button in DocumentHeader
  - Expected: PDF loads without errors
  - Check console: Look for `[PDFViewer] Loaded PDF with X pages`

- [ ] **Verify PDF display**
  - Expected: PDF renders clearly
  - Check: No blurry text or rendering artifacts
  - Check: PDF worker thread loads without errors

### Page Navigation
- [ ] **Test Next/Previous buttons**
  - Click "Next" → page should increment
  - Click "Previous" → page should decrement
  - Verify "Previous" disabled on page 1
  - Verify "Next" disabled on last page
  - Check page counter shows "Page X of Y"

- [ ] **Navigate through multiple pages**
  - Navigate to page 5
  - Navigate to page 10
  - Check that content changes appropriately
  - Verify page number persists on browser refresh

### Zoom Controls
- [ ] **Test Fit Width**
  - Click "Fit Width" button
  - Verify PDF scales to viewport width
  - Test on different window sizes

- [ ] **Test Fit Page**
  - Click "Fit Page" button
  - Verify entire page visible in viewport

- [ ] **Test 100% (Actual Size)**
  - Click "100%" button
  - Verify PDF at actual size (scale = 1.0)

- [ ] **Test Zoom In/Out**
  - Click "Zoom In" 3 times
  - Verify PDF enlarges smoothly
  - Click "Zoom Out" 3 times
  - Verify PDF shrinks smoothly
  - Check zoom limits (should cap)

### LeftPanel
- [ ] **Verify LeftPanel visible**
  - LeftPanel should appear in PDF mode
  - Check width is 300px
  - Verify no layout shifts

- [ ] **Test panel tabs**
  - Click through all 4 tabs:
    - Metadata
    - Outline
    - Heatmap
    - Pages (Thumbnails)
  - Verify each tab renders without errors

### View Mode Toggle
- [ ] **Test Markdown ↔ PDF switching**
  - Toggle from PDF to Markdown view
  - Verify smooth transition (no flicker)
  - Toggle back to PDF
  - Verify PDF state preserved (page number, zoom)

---

## 🎯 Phase 2: Text Selection & Metadata

### Text Selection
- [ ] **Test basic selection**
  - Select text on PDF page using mouse
  - Verify selection indicator appears above toolbar
  - Check indicator shows selected text (first 60 chars)
  - Click "Clear" → selection should clear

- [ ] **Verify selection coordinates**
  - Select text and check console
  - Look for: `[PDFViewer] Text selected: { text, page, rect }`
  - Verify rect has x, y, width, height

- [ ] **Test multi-line selection**
  - Select text across multiple lines
  - Verify entire selection captured
  - Check indicator shows combined text

- [ ] **Test selection at different zoom levels**
  - Zoom to 150%
  - Select text → verify coordinates
  - Zoom to 75%
  - Select text → verify coordinates scale correctly

### Metadata Tab
- [ ] **Test Metadata display**
  - Open LeftPanel → Metadata tab
  - Check displays:
    - Title (or "Untitled Document")
    - Author (or "Unknown Author")
    - Creator
    - Page count
  - Note: Current document has no metadata, should show defaults

---

## 🎯 Phase 3: ECS Annotation Integration

### Annotation Creation
- [ ] **Create annotation from selection**
  - Select text on PDF
  - Verify "Highlight" button appears floating above selection
  - Click "Highlight" button
  - Verify success toast: "Annotation created"
  - Verify yellow overlay appears at selection location

- [ ] **Test annotation persistence**
  - Create annotation
  - Refresh browser (Cmd+R)
  - Verify annotation overlay still appears
  - Check database: annotations table should have entry

### Annotation Display
- [ ] **Test overlay rendering**
  - Create multiple annotations on same page
  - Verify all overlays render
  - Check overlays have correct color (yellow)
  - Verify positioning over selected text

- [ ] **Test overlay scaling**
  - Create annotation at 100% zoom
  - Zoom to 150% → verify overlay scales
  - Zoom to 75% → verify overlay scales
  - Verify overlay always covers same text area

- [ ] **Test page filtering**
  - Create annotations on pages 1, 3, 5
  - Navigate to page 2 → no overlays
  - Navigate to page 3 → only page 3 overlays
  - Navigate to page 1 → only page 1 overlays

### Annotation Interaction
- [ ] **Test click handler**
  - Click on annotation overlay
  - Check console: `[PDFViewer] Annotation clicked: [annotation-id]`
  - Note: Edit functionality not yet implemented

---

## 🎯 Phase 4: Chunk Visualization with Bboxes

### ⚠️ Limited Testing - Only 1 Chunk with Bbox Data

### Chunk Boundary Rendering
- [ ] **Test bbox rendering** (if visible)
  - Look for blue borders around text regions
  - Check that borders align with chunk content
  - Verify borders are thin (1px) and gray by default

- [ ] **Test fallback indicators** (expected for most chunks)
  - Look for whole-page indicator bars at top
  - Bar should be subtle gray (1px height)
  - Verify bar still clickable and shows tooltip

### Chunk Interactions
- [ ] **Test hover states**
  - Hover over chunk boundary
  - Verify border highlights (2px blue)
  - Verify subtle background appears

- [ ] **Test click handlers**
  - Click on chunk boundary
  - Check console: `[PDFViewer] Chunk clicked: [chunk-id]`

- [ ] **Test tooltips**
  - Hover over chunk with bbox
  - Verify tooltip: `Chunk [index]: [summary preview]`
  - Hover over fallback indicator
  - Verify tooltip: `Chunk [index]`

### Chunk Scaling
- [ ] **Test zoom scaling**
  - Start at 100% zoom
  - Verify chunk boundaries visible
  - Zoom to 150% → boundaries scale
  - Zoom to 75% → boundaries scale

---

## 🎯 Phase 5: Connection Integration & Heatmap

### ⚠️ No Connections Available - Testing Empty States

### Connection-Aware Chunks
- [ ] **Verify default chunk styling**
  - All chunks should have normal borders (gray 1px)
  - No connection count badges should appear
  - Chunks should not have blue tint

### Heatmap Tab
- [ ] **Test empty state**
  - Open LeftPanel → Heatmap tab
  - Expected: "No connections detected yet" message
  - Verify no bars or chart displayed

### Thumbnails Tab
- [ ] **Test page thumbnails grid**
  - Open LeftPanel → Pages/Thumbnails tab
  - Verify 2-column grid of page previews
  - Each thumbnail should show:
    - Rendered page at 120px width
    - Page number below
    - Border (gray default, blue if current)

- [ ] **Test current page highlighting**
  - Navigate to page 3
  - Open Thumbnails tab
  - Verify page 3 has blue border and ring
  - Navigate to page 7
  - Verify page 7 now highlighted

- [ ] **Test thumbnail navigation**
  - Click thumbnail for page 10
  - Verify PDF navigates to page 10
  - Verify thumbnail highlighted

- [ ] **Test hover states**
  - Hover over non-current thumbnail
  - Verify border changes to blue

### Outline Tab
- [ ] **Test empty state**
  - Open LeftPanel → Outline tab
  - Expected: "No outline available for this PDF"
  - Verify message displays (document has no TOC)

---

## 🐛 Issues & Observations

### Critical Issues
```
Priority | Issue Description | Steps to Reproduce | Phase
---------|-------------------|-------------------|-------
HIGH     | PDF.js worker error: "Object.defineProperty called on non-object" | Load PDF viewer page | Phase 1
         | ROOT CAUSE: pdfjs-dist v5.x has incompatible ES module code for Next.js |  |
         | SOLUTION: Downgrade to stable versions |  |
         | FIXED: 1) Downgraded react-pdf from v10.2.0 → v9.1.1 |  |
         |        2) Downgraded pdfjs-dist from v5.4.296 → v4.4.168 (peer dep match) |  |
         |        3) Updated worker config to use local /pdf.worker.min.mjs |  |
         |        4) Simplified webpack config (just canvas: false) |  |
         |        5) Kept dynamic imports with { ssr: false } |  |
         |        6) Added @emotion/is-prop-valid for framer-motion |  |
         | STATUS: ✅ RESOLVED - PDF viewer now loads successfully |  |
```

### Warnings & Notes
```
- Document missing page_count in metadata (NULL in database)
- Only 1 of 179 chunks has bbox data (99% using fallback indicators)
- No connections detected (all connection features show empty states)
- No PDF outline/TOC available
- TEST PDF: "War Fever" by J.G. Ballard - appears to be scanned (image-based)
- NOTE: OCR not implemented - text selection may not work on scanned PDFs
```

### Performance Notes
```
PDF Size | Pages | Load Time | Navigation Speed | Notes
---------|-------|-----------|------------------|-------
8.9 MB   | ?     |           |                  |
```

---

## ✅ Test Results Summary

### Phase 1: Foundation
- [x] PDF Loading: ✅ **Pass** - Loads without errors
- [x] Navigation: ✅ **Pass** - Previous/Next work perfectly
- [x] Zoom Controls: ⚠️ **Issues Found & Fixed** - Fit Page vs 100% now distinct
- [x] LeftPanel: ✅ **Pass** - All tabs render, metadata enhanced

### Phase 2: Selection & Metadata
- [x] Text Selection: ⚠️ **Issues Found & Fixed** - Moved indicator to bottom-right
- [x] Metadata Display: ⚠️ **Enhanced** - Now shows chunk stats with bbox coverage

### Phase 3: Annotation Integration
- [x] Annotation Creation: ✅ **Pass** - Highlight button works, annotations persist
- [x] Annotation Display: ⚠️ **Issues Found & Fixed** - Zoom scaling & multi-line boxes fixed
- [ ] **NEW ISSUE:** PDF↔Markdown sync not working (implementation plan created)

### Phase 4: Chunk Visualization
- [ ] Bbox Rendering: ⬜ **Not Tested** - 0% bbox coverage
- [ ] Fallback Indicators: ⬜ **Not Tested** - Need to investigate bbox extraction

### Phase 5: Connection Integration
- [ ] Empty States: ⬜ **Not Tested**
- [ ] Thumbnails: ⬜ **Not Tested**

---

---

## 📋 Session 2: Manual Testing Results (October 27, 2025 - Afternoon)

### Test Document
**Document ID:** `fb8e50c3-5c33-4b00-8c34-0f22fa2579e7`
**Title:** Deleuze, Freud and the Three Syntheses
**URL:** `http://localhost:3000/read/fb8e50c3-5c33-4b00-8c34-0f22fa2579e7`

### Phase 1: Foundation - TESTED ✅

#### PDF Loading & Navigation
- ✅ **PDF loads successfully** - No errors
- ✅ **Navigation Previous/Next** - Works perfectly
- ✅ **Page counter** - Displays correctly
- ✅ **State preservation** - Page number persists

#### Zoom Controls - ISSUES FOUND & FIXED 🔧

**Issue 1: Fit Page and 100% showed identical zoom**
- **Root Cause:** `handleFitPage()` used hardcoded `1000` instead of actual page height
- **Fix:** Added `pageHeight` state tracking, calculate `containerHeight / pageHeight`
- **Status:** ✅ FIXED
- **Files Changed:** `src/components/rhizome/pdf-viewer/PDFViewer.tsx`

**Zoom Controls After Fix:**
- ✅ Fit Width - Works correctly
- ✅ Fit Page - Now scales to viewport height properly
- ✅ 100% - Shows actual size (different from Fit Page)
- ✅ Zoom In/Out - Smooth scaling with 1.2x multiplier

#### LeftPanel - TESTED ✅
- ✅ **Panel visible** - 300px width, no layout shifts
- ✅ **Tab switching** - All 4 tabs render without errors
- ✅ **Toggle preservation** - PDF page state maintained

**Metadata Tab - ISSUES FOUND & FIXED 🔧**

**Issue 2: No chunk statistics displayed**
- **Root Cause:** Metadata tab showed placeholder "Will populate in Phase 3"
- **Fix:** Added chunks display with bbox coverage percentage
- **Status:** ✅ FIXED
- **Files Changed:**
  - `src/components/layout/tabs/MetadataTab.tsx`
  - `src/components/layout/LeftPanel.tsx`
  - `src/types/annotations.ts` (added chunker_type field)
  - `src/app/read/[id]/page.tsx` (query chunker_type)

**Metadata Now Shows:**
- ✅ Total chunks: 179
- ✅ Chunks with bboxes: 1 (0%)
- ✅ Chunker type: recursive

**Outline Tab - DOCUMENTED ✅**
- ✅ Shows "No outline available" - EXPECTED behavior
- 📝 **Note:** PDF outlines extracted from embedded TOC, not generated
- 📝 Many PDFs (especially scanned) lack embedded outlines

### Phase 2: Text Selection - ISSUES FOUND & FIXED 🔧

#### Selection Mechanics
**Issue 3: Text selection was clunky and "shaky"**
- **Root Cause:** Fixed indicator bar at top interfered with selection gestures
- **Fix:** Moved to floating bottom-right with shadow/border
- **Status:** ✅ FIXED
- **Files Changed:** `src/components/rhizome/pdf-viewer/PDFViewer.tsx`

**Selection After Fix:**
- ✅ Selection smooth and reliable
- ✅ Indicator at bottom-right (non-blocking)
- ✅ Clear button works
- ✅ Multi-line selection captures correctly

### Phase 3: Annotations - ISSUES FOUND & FIXED 🔧

#### Annotation Zoom Scaling
**Issue 4: Highlights only aligned at 100% zoom**
- **Root Cause:** Double-scaling bug - captured screen coords, then multiplied by scale again
- **Fix:** Convert to unscaled PDF coordinates when capturing, multiply by current scale when displaying
- **Status:** ✅ FIXED
- **Files Changed:**
  - `src/hooks/usePDFSelection.ts` (divide by scale when capturing)
  - `src/components/rhizome/pdf-viewer/PDFViewer.tsx` (pass scale to hook)
- **Algorithm:** `pdfX = screenX / scale` (capture) → `displayX = pdfX * currentScale` (render)

**Zoom Scaling After Fix:**
- ✅ Create at 100%, zoom to 150% - Stays aligned
- ✅ Create at 150%, zoom to 100% - Stays aligned
- ✅ Create at 75%, zoom anywhere - Stays aligned

#### Multi-Line Annotations
**Issue 5: Multi-line selections created box around entire area (including whitespace)**
- **Root Cause:** Used `getBoundingClientRect()` which returns single rectangle
- **Fix:** Use `getClientRects()` to get individual line rectangles
- **Status:** ✅ FIXED
- **Files Changed:**
  - `src/hooks/usePDFSelection.ts` (capture multiple rects)
  - `src/components/rhizome/pdf-viewer/PDFAnnotationOverlay.tsx` (render per-line boxes)
  - `src/app/actions/annotations.ts` (schema supports pdfRects array)
  - `src/lib/ecs/annotations.ts` (operations support)
  - `src/lib/ecs/components.ts` (type definitions)

**Multi-Line After Fix:**
- ✅ Each line gets individual highlight box
- ✅ No whitespace highlighted between lines
- ✅ Follows text precisely
- ✅ Backward compatible (old single-rect annotations still work)

#### Annotation Creation
- ✅ Highlight button appears on selection
- ✅ Yellow overlay renders correctly
- ✅ Annotations persist across refresh
- ✅ Multiple annotations on same page work

### Critical Discovery: PDF ↔ Markdown Sync Issue 🚨

**Issue 6: PDF annotations don't show in markdown view**
- **Root Cause:** Annotations saved with `startOffset: 0, endOffset: 0`
  - PDF uses coordinates (x, y, page)
  - Markdown uses character offsets
  - BlockRenderer filters: `ann.endOffset > block.startOffset && ann.startOffset < block.endOffset`
  - With 0, 0 this is false for all blocks except first one

**Investigation Results:**
- ✅ Bbox infrastructure exists (Docling Python script lines 149-162)
- ⚠️ Bbox coverage: 0% (empty arrays `[]`)
- ⚠️ Need to investigate why bboxes not being saved
- ✅ Chunks have `page_start`/`page_end` for page mapping

**Solution Designed:** Text-Based Coordinate Mapping
1. Get annotation text from PDF selection
2. Find chunks spanning that page number
3. Search for exact text match (or fuzzy match)
4. Calculate markdown `startOffset` and `endOffset`
5. Save **BOTH** PDF coords AND markdown offsets
6. Annotations now visible in **BOTH views**

**Implementation Plan Created:**
- 📄 `thoughts/plans/2025-10-27_pdf-annotation-sync.md` (896 lines)
- **Phase 1:** Text-based sync (2-3 days, works with 0% bbox coverage)
- **Phase 2:** Bbox investigation (1-2 days, parallel track)
- **Phase 3:** Bidirectional sync (1 day)
- **Phase 4:** Image & table extraction (2-3 days)

### Summary of Fixes Applied Today

| Issue | Type | Severity | Status | Files Changed |
|-------|------|----------|--------|---------------|
| Zoom controls identical | Bug | Medium | ✅ FIXED | PDFViewer.tsx |
| No chunk stats | Missing Feature | Low | ✅ FIXED | MetadataTab.tsx, LeftPanel.tsx, annotations.ts, page.tsx |
| Clunky text selection | UX | Medium | ✅ FIXED | PDFViewer.tsx |
| Highlights wrong zoom | Bug | High | ✅ FIXED | usePDFSelection.ts, PDFViewer.tsx |
| Multi-line boxes wrong | Bug | High | ✅ FIXED | 5 files (selection hook, overlay, actions, operations, types) |
| PDF↔Markdown sync | Missing Feature | High | 📋 PLANNED | Implementation plan created |
| Bbox coverage 0% | Investigation | Medium | 🔍 PENDING | Need to investigate processing pipeline |

---

## 🚀 Next Steps

### Immediate (Next Session)
- [ ] Implement Phase 1 of PDF↔Markdown sync (text-based coordinate mapping)
- [ ] Create `src/lib/reader/text-offset-calculator.ts`
- [ ] Update PDF annotation creation to calculate markdown offsets
- [ ] Test annotations visible in both views

### Investigation Required
- [ ] Why are bboxes empty when extraction code exists?
- [ ] Verify `enableChunking` flag in PDF processor
- [ ] Test with newly processed PDF
- [ ] Check if Chonkie preserves Docling metadata

### Future Enhancements
- [ ] Bbox-based precision mapping (when bbox coverage >70%)
- [ ] Docling image & table extraction
- [ ] Bidirectional annotation sync (Markdown→PDF)
- [ ] Manual offset adjustment UI for edge cases

---

**Test Session Status:** Phase 1-3 Complete ✅
**Started:** October 27, 2025
**Session 1 Completed:** Phase 1 - PDF loads successfully
**Session 2 Completed:** October 27, 2025 (afternoon) - Phases 1-3 tested with fixes
**Next Session:** Phase 4-5 (Chunks & Connections) + Bbox investigation
