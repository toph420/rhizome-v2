# PDF Viewer Manual Testing Guide

**Implementation Date:** October 27, 2025
**Phases Completed:** 1-5 (Foundation → Connection Integration)
**Testing Status:** Phases 1-3 Complete ✅ | Phases 4-5 Pending
**Bundle Size:** 499 kB for /read/[id] route

---

## 📊 Test Session Summary

### Active Test Document
**Document ID:** `fb8e50c3-5c33-4b00-8c34-0f22fa2579e7`
**Title:** Deleuze, Freud and the Three Syntheses
**URL:** `http://localhost:3000/read/fb8e50c3-5c33-4b00-8c34-0f22fa2579e7`
**Test Date:** October 27, 2025 (afternoon session)

### Test Document Characteristics
- **Chunks:** 179 total chunks
- **Bboxes:** 1 chunk with bbox data (0% coverage - will test fallback indicators)
- **Connections:** 0 connections detected (will test "No connections" states)
- **Page Count:** Available in metadata
- **Outline:** No PDF outline/TOC available
- **Storage:** ✅ PDF file available in Supabase Storage

### Phase Completion Status
- ✅ **Phase 1: Foundation** - COMPLETE (PDF loads, navigation works, zoom controls fixed)
- ✅ **Phase 2: Text Selection** - COMPLETE (Selection fixed, metadata enhanced)
- ✅ **Phase 3: Annotations** - COMPLETE (Creation works, zoom scaling fixed, multi-line fixed)
- ⏳ **Phase 4: Chunk Visualization** - PENDING (0% bbox coverage, need investigation)
- ⏳ **Phase 5: Connection Integration** - PENDING (No connections in test document)

### Critical Issues Found & Fixed

| Issue | Type | Severity | Status | Files Changed |
|-------|------|----------|--------|---------------|
| **1. Zoom controls identical** | Bug | Medium | ✅ FIXED | PDFViewer.tsx |
| **Root Cause:** `handleFitPage()` used hardcoded `1000` instead of actual page height | | | | |
| **Fix:** Added `pageHeight` state tracking, calculate `containerHeight / pageHeight` | | | | |
| | | | | |
| **2. No chunk stats** | Missing Feature | Low | ✅ FIXED | MetadataTab.tsx, LeftPanel.tsx, annotations.ts, page.tsx |
| **Root Cause:** Metadata tab showed placeholder "Will populate in Phase 3" | | | | |
| **Fix:** Added chunks display with bbox coverage percentage and chunker type | | | | |
| | | | | |
| **3. Clunky text selection** | UX | Medium | ✅ FIXED | PDFViewer.tsx |
| **Root Cause:** Fixed indicator bar at top interfered with selection gestures | | | | |
| **Fix:** Moved to floating bottom-right with shadow/border | | | | |
| | | | | |
| **4. Highlights wrong zoom** | Bug | High | ✅ FIXED | usePDFSelection.ts, PDFViewer.tsx |
| **Root Cause:** Double-scaling bug - captured screen coords, then multiplied by scale again | | | | |
| **Fix:** Convert to unscaled PDF coordinates when capturing, multiply by current scale when displaying | | | | |
| **Algorithm:** `pdfX = screenX / scale` (capture) → `displayX = pdfX * currentScale` (render) | | | | |
| | | | | |
| **5. Multi-line boxes wrong** | Bug | High | ✅ FIXED | usePDFSelection.ts, PDFAnnotationOverlay.tsx, annotations.ts, operations, types |
| **Root Cause:** Used `getBoundingClientRect()` which returns single rectangle | | | | |
| **Fix:** Use `getClientRects()` to get individual line rectangles | | | | |
| **Result:** Each line gets individual highlight box, no whitespace highlighted | | | | |
| | | | | |
| **6. PDF↔Markdown sync** | Missing Feature | High | 📋 PLANNED | Implementation plan created |
| **Root Cause:** Annotations saved with `startOffset: 0, endOffset: 0` (PDF uses coordinates, Markdown uses character offsets) | | | | |
| **Solution:** Text-based coordinate mapping (Phase 1 of sync plan) | | | | |
| **Plan:** `thoughts/plans/2025-10-27_pdf-annotation-sync.md` (896 lines) | | | | |

### PDF↔Markdown Sync Implementation (October 27, 2025 - Evening)

**Status**: ✅ **Phase 1 Complete - Working**

**Files Created/Modified**:
- `src/lib/reader/text-offset-calculator.ts` (new) - Text matching with exact + fuzzy Levenshtein
- `src/components/rhizome/pdf-viewer/PDFViewer.tsx` - Calculates offsets during annotation creation
- `src/lib/ecs/components.ts` - Added sync metadata fields (syncConfidence, syncMethod, syncNeedsReview)
- `src/lib/ecs/annotations.ts` - Store sync metadata in Position component
- `src/app/actions/annotations.ts` - Zod validation for sync fields

**Implementation**:
- 3-tier matching: exact → case-insensitive → fuzzy (Levenshtein)
- Document-wide fallback when page info unavailable (0% bbox coverage)
- Sync metadata tracked with confidence scores
- User warnings for low confidence or missing page data

**Testing Results**:
- ✅ PDF annotations now appear in markdown view
- ✅ Exact text matching works (confidence 1.0)
- ✅ Fuzzy matching works for OCR errors (confidence 0.75+)
- ✅ Graceful degradation without page information
- ⚠️ Document-wide search slower but functional (46 chunks searched)

### Investigation Required
- ⚠️ **Page Coverage 0%**: All chunks have `page_start: null`, `page_end: null`
- ⚠️ **Bbox Coverage 0%**: Empty bbox arrays despite extraction code in Docling script
- ⚠️ **Verify `enableChunking` flag** in PDF processor
- ⚠️ **Test with newly processed PDF** to check if issue is document-specific
- ⚠️ **Check if Chonkie preserves Docling metadata** during chunking

---

## 📋 Testing Prerequisites

### Required Setup
- [ ] Local development environment running (`npm run dev`)
- [ ] Supabase instance running (`npx supabase start`)
- [ ] At least one PDF document uploaded and processed with Docling
- [ ] Document should have:
  - Multiple pages (ideally 10+ for navigation testing)
  - Detected connections (for Phase 5 testing)
  - Bboxes from Docling processing (for chunk visualization)
  - PDF outline/table of contents (optional, for outline testing)

### Test Documents Recommended
1. **Small PDF** (5-10 pages) - Quick navigation testing
2. **Medium PDF** (50-100 pages) - Standard use case
3. **Large PDF** (200+ pages) - Performance baseline (Phase 6 focus)
4. **PDF with TOC** - Outline navigation testing
5. **PDF without bboxes** - Fallback indicator testing

---

## 🎯 Phase 1: Foundation - Basic PDF Display

### PDF Loading & Display
- [ ] **Load PDF from Supabase Storage**
  - Navigate to `/read/[document-id]`
  - Toggle to PDF view using "View PDF" button in header
  - Verify PDF loads without errors
  - Check console for successful load message: `[PDFViewer] Loaded PDF with X pages`

- [ ] **Worker Thread Performance**
  - Verify main thread doesn't freeze during PDF load
  - Check that text selection works immediately after load
  - Verify no console warnings about worker configuration

### Page Navigation
- [ ] **Previous/Next Buttons**
  - Click "Next" → verify page increments
  - Click "Previous" → verify page decrements
  - Verify "Previous" disabled on page 1
  - Verify "Next" disabled on last page
  - Check page counter shows "Page X of Y" correctly

- [ ] **Page Number Accuracy**
  - Navigate through 5+ pages
  - Verify page content matches page number
  - Check that page state persists on browser refresh (ReaderStore persistence)

### Zoom Controls
- [ ] **Fit Width**
  - Click "Fit Width" button
  - Verify PDF scales to fit viewport width
  - Test on different browser window sizes

- [ ] **Fit Page**
  - Click "Fit Page" button
  - Verify entire page visible in viewport
  - Test with portrait and landscape pages

- [ ] **100% (Actual Size)**
  - Click "100%" button
  - Verify PDF renders at actual size (scale = 1.0)

- [ ] **Zoom In/Out**
  - Click "Zoom In" multiple times
  - Verify PDF enlarges smoothly
  - Click "Zoom Out" multiple times
  - Verify PDF shrinks smoothly
  - Test zoom limits (should cap at reasonable min/max)

### LeftPanel
- [ ] **Panel Toggle**
  - LeftPanel should be visible in PDF mode
  - Verify it can collapse/expand (if collapse functionality exists)
  - Check that panel doesn't overlap PDF content

- [ ] **Responsive Width**
  - Verify panel is 300px wide
  - Check that it doesn't cause layout shifts

### View Mode Toggle
- [ ] **Markdown ↔ PDF Switching**
  - Toggle from Markdown to PDF view
  - Verify smooth transition (no flicker)
  - Toggle back to Markdown
  - Verify document state preserved (scroll position, etc.)
  - Check that toggle only appears when PDF is available

### Mobile (Touch) Detection
- [ ] **Touch Gestures Detected**
  - On touch device or mobile emulation mode
  - Verify console logs touch events
  - Check that long-press detection initializes

---

## 🎯 Phase 2: Text Selection & Metadata

### Text Selection
- [ ] **Basic Selection**
  - Select text on PDF page using mouse
  - Verify selection indicator appears above toolbar
  - Verify selected text shows in indicator (first 60 chars)
  - Click "Clear" button → verify selection clears

- [ ] **Selection Coordinates**
  - Select text and check console for coordinate log
  - Verify coordinates logged: `[PDFViewer] Text selected: { text, page, rect }`
  - Confirm rect has x, y, width, height values

- [ ] **Multi-line Selection**
  - Select text across multiple lines
  - Verify entire selection captured
  - Check that selection indicator shows combined text

- [ ] **Selection with Different Zoom Levels**
  - Zoom in to 150%
  - Select text → verify coordinates scale correctly
  - Zoom out to 75%
  - Select text → verify coordinates still accurate

### Mobile Long-Press
- [ ] **Long-Press Detection** (Mobile/Touch Device)
  - Long-press on text for 500ms
  - Verify "Selection Mode Active" indicator appears
  - Verify selection works after long-press
  - Check console log: `[usePDFSelection] Long press detected`

### Metadata Tab
- [ ] **PDF Metadata Display**
  - Open LeftPanel → click "Metadata" tab
  - Verify displays:
    - Title (or "Untitled Document")
    - Author (or "Unknown Author")
    - Creator (PDF creation tool)
    - Page count
  - Test with PDF that has metadata
  - Test with PDF without metadata (should show defaults)

---

## 🎯 Phase 3: ECS Annotation Integration

### Annotation Creation
- [ ] **Create Annotation from Selection**
  - Select text on PDF
  - Verify "Highlight" button appears floating above selection
  - Click "Highlight" button
  - Verify success toast: "Annotation created"
  - Verify yellow overlay appears on PDF at selection location

- [ ] **Annotation Persistence**
  - Create annotation
  - Refresh page (browser reload)
  - Verify annotation overlay still appears
  - Check database: annotations table should have entry with PDF coordinates

### Annotation Display
- [ ] **Overlay Rendering**
  - Create multiple annotations on same page
  - Verify all overlays render without overlapping issues
  - Check that overlays have correct color (yellow default)
  - Verify overlays positioned accurately over selected text

- [ ] **Overlay Scaling**
  - Create annotation at 100% zoom
  - Zoom in to 150% → verify overlay scales correctly
  - Zoom out to 75% → verify overlay scales correctly
  - Verify overlay always covers same text area regardless of zoom

- [ ] **Page Filtering**
  - Create annotations on pages 1, 3, 5
  - Navigate to page 2 → verify no overlays shown
  - Navigate to page 3 → verify only page 3 overlays shown
  - Navigate to page 1 → verify only page 1 overlays shown

### Annotation Interaction
- [ ] **Click Handler**
  - Click on annotation overlay
  - Check console log: `[PDFViewer] Annotation clicked: [annotation-id]`
  - (Note: Edit functionality not yet implemented - Phase 6+)

### Dual-Format Support
- [ ] **Markdown vs PDF Annotations**
  - Create annotation in PDF view
  - Toggle to Markdown view
  - Verify PDF-only annotation not visible in Markdown (no markdown offsets)
  - Create annotation in Markdown view (if supported)
  - Toggle to PDF view
  - Verify markdown annotation doesn't appear in PDF (no PDF coordinates)

### Mobile Annotation
- [ ] **Bottom Sheet** (Mobile)
  - Select text on mobile
  - Verify annotation creation UI appears (should be bottom sheet, not floating button)
  - Create annotation
  - Verify overlay appears correctly

---

## 🎯 Phase 4: Chunk Visualization with Bboxes

### Chunk Boundary Rendering
- [ ] **Precise Bboxes**
  - Open PDF with Docling-processed chunks
  - Verify blue borders appear around text regions
  - Check that borders align with chunk content
  - Verify borders are thin (1px) and gray by default

- [ ] **Fallback Indicators**
  - Open PDF with chunks but no bboxes (or chunks missing bbox data)
  - Verify whole-page indicator bar appears at top of page
  - Bar should be subtle gray (1px height)
  - Verify bar still clickable and shows tooltip

### Chunk Interactions
- [ ] **Hover States**
  - Hover over chunk boundary
  - Verify border highlights (changes to 2px blue medium)
  - Verify subtle background appears
  - Hover away → verify border returns to normal

- [ ] **Click Handlers**
  - Click on chunk boundary
  - Check console log: `[PDFViewer] Chunk clicked: [chunk-id]`
  - (Note: Navigation to chunk details not yet implemented)

- [ ] **Tooltips**
  - Hover over chunk with bbox
  - Verify tooltip shows: `Chunk [index]: [summary preview]`
  - Hover over fallback indicator
  - Verify tooltip shows: `Chunk [index]`

### Chunk Scaling
- [ ] **Zoom In/Out**
  - Start at 100% zoom
  - Verify chunk boundaries visible
  - Zoom in to 150%
  - Verify boundaries scale correctly (still align with text)
  - Zoom out to 75%
  - Verify boundaries scale correctly

### Multiple Chunks Per Page
- [ ] **Complex Layouts**
  - Navigate to page with 5+ chunks
  - Verify all chunk boundaries render
  - Verify no overlapping boundaries
  - Verify each chunk independently hoverable/clickable

### Chunk Navigation from ChunksTab
- [ ] **Navigate to Chunk in PDF**
  - Open RightPanel → ChunksTab
  - Find chunk with page information (page_start/page_end)
  - Click "View in PDF" button (if exists) OR click chunk
  - Verify:
    - View switches to PDF mode
    - PDF navigates to chunk's page_start
    - Chunk highlighted with thicker blue border (3px)
    - Highlight fades after 2 seconds
    - Success toast: "Navigated to page X"

### Outline Tab
- [ ] **PDF Table of Contents**
  - Open LeftPanel → click "Outline" tab
  - If PDF has TOC:
    - Verify hierarchical list appears
    - Verify indentation shows heading levels
    - Click outline item → verify navigates to page
  - If PDF has no TOC:
    - Verify message: "No outline available for this PDF"

- [ ] **Outline Navigation**
  - Click on top-level heading → verify page jump
  - Click on nested heading → verify correct page
  - Verify current page doesn't need highlighting yet (Phase 5)

---

## 🎯 Phase 5: Connection Integration & Heatmap

### Connection-Aware Chunks
- [ ] **Visual Hierarchy**
  - Open PDF with detected connections
  - Find chunk that has connections (check RightPanel → Connections tab)
  - Verify chunk has:
    - Thicker blue border (2px instead of 1px)
    - Subtle blue background tint
  - Compare with chunk without connections (should be gray 1px)

- [ ] **Connection Count Badges**
  - Find chunk with 3+ connections
  - Verify small blue circle appears at top-right corner of chunk
  - Circle should show number (e.g., "5")
  - Badge should be 5x5px, white text on blue background
  - Verify badge positioned correctly with zoom changes

- [ ] **Enhanced Tooltips**
  - Hover over chunk with connections
  - Verify tooltip shows: `Chunk [index] ([count] connections): [summary]`
  - Hover over chunk without connections
  - Verify tooltip shows: `Chunk [index]: [summary]` (no count)

### Heatmap Tab
- [ ] **Connection Density Visualization**
  - Open LeftPanel → click "Heatmap" tab
  - If connections exist:
    - Verify horizontal bar chart appears
    - Each row should show: "Page X" | bar | count
    - Bars should be blue (rgba 59, 130, 246)
    - Verify bars sorted by page number (ascending)
  - If no connections:
    - Verify message: "No connections detected yet"

- [ ] **Density Calculation**
  - Verify bars show relative widths (percentage-based)
  - Page with most connections should have 100% width bar
  - Other pages should scale proportionally
  - Verify connection counts accurate (match RightPanel counts)

- [ ] **Current Page Highlighting**
  - Navigate to page 5
  - Open Heatmap tab
  - Verify page 5 row has blue background (bg-blue-50 / dark:bg-blue-900/20)
  - Navigate to page 10
  - Verify page 10 now highlighted, page 5 normal

- [ ] **Hover States**
  - Hover over heatmap row (not current page)
  - Verify subtle hover background (hover:bg-muted)

### Thumbnails Tab
- [ ] **Page Thumbnails Grid**
  - Open LeftPanel → click "Pages" tab (or "Thumbnails")
  - Verify 2-column grid of page previews appears
  - Each thumbnail should show:
    - Rendered page at 120px width
    - Page number below thumbnail
    - Border (gray default, blue if current page)

- [ ] **Current Page Highlighting**
  - Navigate to page 3
  - Open Thumbnails tab
  - Verify page 3 thumbnail has:
    - Blue border (border-blue-600)
    - Blue ring (ring-2 ring-blue-200)
  - Navigate to page 7
  - Verify page 7 now highlighted, page 3 normal

- [ ] **Thumbnail Navigation**
  - Click on thumbnail for page 10
  - Verify PDF navigates to page 10
  - Verify thumbnail for page 10 now highlighted
  - Test with 5+ different pages

- [ ] **Hover States**
  - Hover over non-current page thumbnail
  - Verify border changes to blue (hover:border-blue-400)

### ConnectionStore Integration
- [ ] **Real-Time Updates**
  - Open RightPanel → Connections tab
  - Adjust engine weights (e.g., increase Semantic Similarity weight)
  - Verify chunk borders update automatically (connections change)
  - Verify connection count badges update
  - Verify heatmap bars update

- [ ] **Shared State Across Views**
  - Set connection filters in Markdown view
  - Toggle to PDF view
  - Verify same connections shown in chunk overlays
  - Verify heatmap reflects filtered connections

---

## 🧪 Cross-Phase Integration Tests

### Navigation Integration
- [ ] **Multi-Source Navigation**
  - Navigate from ChunksTab to PDF page → verify works
  - Navigate from Outline tab → verify works
  - Navigate from Thumbnails tab → verify works
  - Navigate from Heatmap (future: clickable bars) → verify current behavior

### State Persistence
- [ ] **ReaderStore Persistence**
  - Navigate to page 15 in PDF view
  - Refresh browser
  - Verify PDF opens to page 15 (pdfPageNumber persisted)

- [ ] **Mode Persistence**
  - Switch to PDF view
  - Refresh browser
  - Verify opens in last used mode (if implemented)

### Annotation + Chunk Overlays
- [ ] **Layering**
  - Create annotation on PDF
  - Verify annotation overlay under chunk overlay (yellow below blue borders)
  - Hover chunk → verify can still see annotation
  - Zoom → verify both scale correctly

### Mobile Responsive
- [ ] **LeftPanel on Mobile**
  - Open PDF on mobile device (or emulation)
  - Verify LeftPanel behavior:
    - Should become bottom sheet (if implemented)
    - OR should overlay with close button
    - OR should push content (current behavior)
  - Test all 4 tabs on mobile

---

## 🐛 Error Handling & Edge Cases

### Error States
- [ ] **PDF Load Failure**
  - Try loading PDF with invalid URL
  - Verify error message: "Failed to load PDF"
  - Verify error doesn't crash page

- [ ] **Missing PDF Metadata**
  - Load PDF without metadata fields
  - Verify Metadata tab shows defaults (not errors)

- [ ] **Empty Outline**
  - Load PDF without table of contents
  - Verify Outline tab shows message (not error)

### Edge Cases
- [ ] **Single-Page PDF**
  - Load 1-page PDF
  - Verify Previous/Next buttons disabled
  - Verify Thumbnails tab shows single thumbnail
  - Verify Heatmap shows single row

- [ ] **No Connections**
  - Load PDF with no detected connections
  - Verify chunks show normal borders (not connection borders)
  - Verify Heatmap shows "No connections" message
  - Verify no badges appear

- [ ] **No Bboxes**
  - Load PDF processed without Docling OR chunks missing bboxes
  - Verify fallback indicators (top-of-page bars) appear
  - Verify all chunk features still work (hover, click, tooltip)

- [ ] **Very Long Summary**
  - Find chunk with long summary (>100 chars)
  - Hover to see tooltip
  - Verify summary truncated to 80 chars + "..."

### Performance Baselines (Pre-Phase 6)
- [ ] **Medium PDF Performance** (50-100 pages)
  - Page navigation speed: ~500ms (acceptable for now)
  - Zoom response: ~200ms (acceptable for now)
  - Annotation creation: <1s
  - Chunk overlay render: <500ms

- [ ] **Large PDF Performance** (200+ pages)
  - Note: Performance optimization is Phase 6 focus
  - Document any slowness or memory issues
  - Test thumbnail tab load time (may be slow)

---

## 📊 Test Results

### Test Session Information
```
Date: October 27, 2025 (afternoon)
Tester: Manual Testing Session
Browser: Chrome (latest)
Device: Desktop (macOS)
Test PDFs Used:
1. fb8e50c3-5c33-4b00-8c34-0f22fa2579e7 - "Deleuze, Freud and the Three Syntheses"
2. 961851b8-7fc0-40b0-a83c-29c14c486477 - "War Fever" by J.G. Ballard (initial testing)
```

### Phase Results
- [x] **Phase 1: Foundation** - ⚠️ **Issues Found & Fixed**
  - Issues found: Zoom controls (Fit Page vs 100% identical), No chunk statistics in metadata
  - Status: All issues resolved, phase complete

- [x] **Phase 2: Text Selection & Metadata** - ⚠️ **Issues Found & Fixed**
  - Issues found: Clunky text selection with indicator interference
  - Status: Selection moved to bottom-right, metadata enhanced with chunk stats

- [x] **Phase 3: ECS Annotation Integration** - ⚠️ **Issues Found & Fixed**
  - Issues found: Zoom scaling misalignment, Multi-line selection boxes incorrect, PDF↔Markdown sync missing
  - Status: Zoom scaling fixed, multi-line boxes fixed, sync issue documented with implementation plan

- [ ] **Phase 4: Chunk Visualization** - ⏳ **Pending Testing**
  - Blocked by: 0% bbox coverage in test documents
  - Investigation needed: Why bboxes not being saved despite extraction code existing

- [ ] **Phase 5: Connection Integration** - ⏳ **Pending Testing**
  - Blocked by: Test documents have no connections detected
  - Need: Document with connections for comprehensive testing

### Detailed Test Results by Phase

#### Phase 1: Foundation ✅
**PDF Loading & Navigation:**
- ✅ PDF loads successfully without errors
- ✅ Previous/Next navigation works perfectly
- ✅ Page counter displays correctly
- ✅ State preservation works (page number persists across refresh)

**Zoom Controls:**
- ✅ Fit Width works correctly
- ✅ Fit Page now scales to viewport height properly (FIXED)
- ✅ 100% shows actual size, distinct from Fit Page (FIXED)
- ✅ Zoom In/Out works smoothly with 1.2x multiplier

**LeftPanel:**
- ✅ Panel visible at 300px width, no layout shifts
- ✅ All 4 tabs render without errors
- ✅ Toggle preservation works (PDF page state maintained)

**Metadata Tab:**
- ✅ Now displays chunk statistics (FIXED)
- ✅ Shows: Total chunks (179), Chunks with bboxes (1 / 0%), Chunker type (recursive)

**Outline Tab:**
- ✅ Shows "No outline available" message (expected behavior for this PDF)

#### Phase 2: Text Selection ✅
**Selection Mechanics:**
- ✅ Selection smooth and reliable after fix
- ✅ Indicator at bottom-right (non-blocking) (FIXED)
- ✅ Clear button works
- ✅ Multi-line selection captures correctly
- ✅ Selection works at different zoom levels

#### Phase 3: Annotations ✅
**Annotation Creation:**
- ✅ Highlight button appears on selection
- ✅ Yellow overlay renders correctly
- ✅ Annotations persist across refresh
- ✅ Multiple annotations on same page work

**Zoom Scaling:**
- ✅ Create at 100%, zoom to 150% - Stays aligned (FIXED)
- ✅ Create at 150%, zoom to 100% - Stays aligned (FIXED)
- ✅ Create at 75%, zoom anywhere - Stays aligned (FIXED)

**Multi-Line Annotations:**
- ✅ Each line gets individual highlight box (FIXED)
- ✅ No whitespace highlighted between lines (FIXED)
- ✅ Follows text precisely (FIXED)
- ✅ Backward compatible (old single-rect annotations still work)

**Known Issue:**
- 🚨 **PDF↔Markdown Sync**: Annotations don't show in markdown view (Implementation plan created: `thoughts/plans/2025-10-27_pdf-annotation-sync.md`)

#### Phase 4: Chunk Visualization ⏳
- ⬜ **Not Tested** - 0% bbox coverage in test documents
- 🔍 **Investigation Needed**: Why are bboxes empty when extraction code exists?

#### Phase 5: Connection Integration ⏳
- ⬜ **Not Tested** - No connections in test documents
- 📝 **Note**: Will test empty states and thumbnails when suitable document available

### Performance Notes
```
PDF Size | Pages | Load Time | Navigation Speed | Notes
---------|-------|-----------|------------------|-------
8.9 MB   | ?     | ~2-3s     | Smooth (~200ms)  | "War Fever" - Scanned PDF
?        | ?     | ~2-3s     | Smooth (~200ms)  | "Deleuze" - Main test doc
```

---

## 🎯 Success Criteria

### Must Pass (Blocking Issues)
- [ ] PDF loads and displays correctly
- [ ] Page navigation works (Previous/Next)
- [ ] Zoom controls function (Fit Width, Fit Page, 100%, In/Out)
- [ ] Text selection captures coordinates
- [ ] Annotations create and persist
- [ ] Annotation overlays render at correct positions
- [ ] Chunk boundaries render (with bboxes OR fallback indicators)
- [ ] Connection-aware chunks show visual differences
- [ ] All 4 LeftPanel tabs render without errors

### Should Pass (Minor Issues Acceptable)
- [ ] Metadata tab shows PDF info correctly
- [ ] Outline tab shows TOC (when available)
- [ ] Thumbnails tab shows page previews
- [ ] Heatmap tab shows connection density
- [ ] Chunk navigation from ChunksTab works
- [ ] Mobile long-press detection works
- [ ] Tooltips show correct information

### Nice to Have (Phase 6 Focus)
- [ ] Page navigation <300ms
- [ ] Zoom response <100ms
- [ ] Mobile gestures (pinch-zoom, swipe)
- [ ] Keyboard shortcuts
- [ ] Continuous scroll mode

---

## 📝 Notes for Testers

### Known Limitations (Pre-Phase 6)
1. **Performance**: Large PDFs (500+ pages) may be slow - virtualization comes in Phase 6
2. **Mobile gestures**: Pinch-zoom and swipe navigation not yet implemented
3. **Keyboard shortcuts**: Not yet implemented (Phase 6)
4. **Continuous scroll**: Single-page mode only for now
5. **Page rotation**: Not yet implemented (Phase 6)

### Testing Tips
1. **Use Chrome DevTools**: Open Console to see debug logs (many `[PDFViewer]` logs available)
2. **Test mobile**: Use Chrome DevTools device emulation for mobile testing
3. **Clear cache**: If PDF doesn't update, try hard refresh (Cmd+Shift+R)
4. **Check database**: Use Supabase Studio to verify annotation data stored correctly
5. **Test edge cases**: Single-page PDFs, PDFs without metadata, chunks without bboxes

### Debug Checklist
If something doesn't work:
- [ ] Check browser console for errors
- [ ] Verify PDF signed URL is valid (check network tab)
- [ ] Confirm document has PDF in Supabase Storage
- [ ] Check that chunks have `page_start`/`page_end` fields (for navigation)
- [ ] Verify connections detected (for Phase 5 features)
- [ ] Try hard refresh (Cmd+Shift+R)

---

## 🚀 Next Steps

### Immediate Priorities (Next Session)
1. **Implement PDF↔Markdown Sync** (Phase 1 from plan)
   - Create `src/lib/reader/text-offset-calculator.ts`
   - Update PDF annotation creation to calculate markdown offsets
   - Test annotations visible in both views
   - See: `thoughts/plans/2025-10-27_pdf-annotation-sync.md` for complete plan

2. **Investigate Bbox Coverage Issue**
   - Why are bboxes empty when extraction code exists in Docling Python script?
   - Verify `enableChunking` flag in PDF processor
   - Test with newly processed PDF
   - Check if Chonkie preserves Docling metadata

3. **Complete Phase 4-5 Testing**
   - Find/process document with connections for Phase 5 testing
   - Test bbox rendering if investigation yields results
   - Test fallback indicators (whole-page bars)
   - Test thumbnails tab and heatmap empty states

### Future Enhancements (Post-Testing)
- **Bbox-based precision mapping** (when bbox coverage >70%)
- **Docling image & table extraction**
- **Bidirectional annotation sync** (Markdown→PDF)
- **Manual offset adjustment UI** for edge cases

### Phase 6 Considerations (Performance Optimization)
- Virtualized rendering for 500+ page PDFs
- Keyboard shortcuts (Cmd+0, Cmd+1, arrow keys)
- Continuous scroll mode toggle
- Page rotation controls (90°, 180°, 270°)
- Mobile pinch-zoom and swipe gestures
- Performance optimization (<300ms page nav, <100ms zoom)
- LeftPanel responsive (bottom sheet on mobile)

### Deployment Readiness
**Current Status:** Phases 1-3 production-ready
- ✅ Core PDF viewing works flawlessly
- ✅ Annotations create and persist correctly
- ✅ All critical bugs fixed
- ⚠️ PDF↔Markdown sync missing (high priority)
- ⚠️ Phases 4-5 untested (bbox/connections blocked by test data)

**Recommendation:** Complete PDF↔Markdown sync before deploying to production

---

**Document Version:** 2.0
**Last Updated:** October 27, 2025 (Post-Testing Session 2)
**Status:** Phases 1-3 Complete ✅ | Phases 4-5 Pending | Sync Feature Required
