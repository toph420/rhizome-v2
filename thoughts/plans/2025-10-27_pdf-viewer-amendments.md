# PDF Viewer Implementation - Amendments & Clarifications

**Date**: 2025-10-27
**Base Plan**: `2025-10-27_pdf-viewer-with-chunk-visualization.md`
**Status**: Approved with modifications

---

## Overview

This document amends the original PDF viewer plan based on user feedback and architectural clarifications. Key changes: introduce LeftPanel, prioritize mobile optimization, clarify Docling failure handling, and focus on personal tool use case.

---

## 🏗️ New Architectural Element: LeftPanel

### Concept

**LeftPanel** - New persistent UI component (mirrors RightPanel) for document-level information and navigation.

```
┌──────────────────────────────────────────────────────┐
│ [Document Header]                    [View: PDF ▼]   │
├──────┬────────────────────────────────────┬──────────┤
│ Left │                                    │ Right    │
│ Panel│  PDF/Markdown Viewer               │ Panel    │
│      │                                    │          │
│ - TOC│                                    │ - Annot. │
│ - Map│                                    │ - Chunks │
│ - Meta                                   │ - Conn.  │
│ - Thumb                                  │ - Sparks │
│      │                                    │          │
└──────┴────────────────────────────────────┴──────────┘
```

### LeftPanel Contents

**Planned Tabs** (6-8 total):
1. **Outline** - Table of contents from PDF outline or extracted headings
2. **Thumbnails** - Page previews for quick navigation (PDF mode only)
3. **Heatmap** - Connection density visualization (adapted from current ConnectionHeatmap)
4. **Metadata** - PDF info (title, author, pages, etc.) + Rhizome stats
5. **Document Details** - Processing info, chunker type, flags, etc.
6. **Search** (future) - Global PDF search results
7. **Bookmarks** (future) - User-saved page bookmarks
8. **Notes** (future) - Document-level notes (not tied to selection)

### Implementation

**File**: `src/components/layout/LeftPanel.tsx` (new)
**Pattern**: Mirror RightPanel structure
**State**: UIStore tracks `leftPanelOpen: boolean`, `leftPanelTab: string`
**Responsive**: Collapsible on mobile (overlay mode), permanent on desktop

**Phase Integration**:
- **Phase 2**: Create LeftPanel shell with Metadata tab
- **Phase 4**: Add Outline tab (PDF outline integration)
- **Phase 5**: Move Heatmap to LeftPanel, add Thumbnails tab
- **Phase 6**: Polish responsive behavior

---

## 🔍 Docling Failure Scenarios - Complete Analysis

### When Docling Fails

Based on code analysis (`worker/lib/docling-extractor.ts`), Docling can fail in these scenarios:

#### 1. **Python Environment Issues** (Common, Easy Fix)

**Failure Mode**:
```bash
Error: Python not found. Install Python 3.10+ and ensure it is in PATH.
Tried to execute: python3
```

**When It Happens**:
- Python not installed
- Wrong Python version (<3.10)
- Virtual environment not activated
- PATH not configured

**Frequency**: Common during initial setup, never after setup
**Impact**: 100% failure (no extraction possible)
**Detection**: Process spawn error (ENOENT)

**Remedy**:
- User: Install Python 3.10+ and configure PATH
- Admin Panel: "Check Python" button that runs `python3 --version`
- Document: Show "Python not configured" banner with setup link

#### 2. **PDF Corruption or Invalid Format** (Rare, No Fix)

**Failure Mode**:
```bash
Docling script failed (exit code 1)
stderr: pdfminer.pdffont.PDFUnicodeNotDefined
```

**When It Happens**:
- Corrupted PDF file (incomplete download, disk error)
- Invalid PDF structure (malformed by authoring tool)
- Password-protected (not handled yet)
- Encrypted with unsupported encryption

**Frequency**: 1-2% of uploads (rare)
**Impact**: Extraction fails, no markdown, no bboxes
**Detection**: Non-zero exit code from Python script

**Remedy**:
- **No automatic fix** - PDF is genuinely broken
- Admin Panel: "Delete & Re-upload" button
- User: Show detailed error: "PDF appears to be corrupted. Try downloading original again."
- Fallback: Keep original PDF in storage, user can still view (no annotations)

#### 3. **Timeout for Huge PDFs** (Rare, Configurable)

**Failure Mode**:
```bash
Error: Docling extraction timeout after 600000ms
```

**When It Happens**:
- Very large PDFs (1000+ pages)
- Complex layouts (heavy graphics, tables)
- Slow CPU (M1 vs Intel)

**Frequency**: <1% of uploads (extremely rare for personal tool)
**Impact**: Partial extraction (might get markdown but not chunks/bboxes)
**Detection**: Timeout after 10 minutes (configurable)

**Remedy**:
- Increase timeout: `DOCLING_TIMEOUT=1800000` (30 min) in .env
- Admin Panel: "Retry with Extended Timeout" button
- User: Show progress bar, allow cancel + retry

#### 4. **OCR Failure for Scanned PDFs** (Edge Case)

**Failure Mode**:
```bash
Docling script completed but returned no result
stdout: (empty)
stderr: tesseract: command not found
```

**When It Happens**:
- PDF is scanned images (no text layer)
- OCR enabled but Tesseract not installed
- OCR enabled but low-quality scans

**Frequency**: <5% of uploads (depends on user's PDF sources)
**Impact**: Empty extraction (no markdown)
**Detection**: Exit 0 but no result JSON

**Remedy**:
- Install Tesseract: `brew install tesseract` (macOS)
- Admin Panel: "OCR not available" warning
- User: Show banner: "Scanned PDF detected. Install OCR support for text extraction."
- Fallback: View PDF in viewer (no text selection, no annotations)

#### 5. **Memory Exhaustion** (Rare, Extreme Cases)

**Failure Mode**:
```bash
Docling script failed (exit code 137)
stderr: Killed (OOM)
```

**When It Happens**:
- Extremely large PDFs (5000+ pages, 500+ MB)
- Many high-resolution images embedded
- Low RAM system (<8GB)

**Frequency**: <0.5% (extremely rare)
**Impact**: Process killed by OS
**Detection**: Exit code 137 (SIGKILL)

**Remedy**:
- **No automatic fix** - System limitation
- Admin Panel: Show file size warning BEFORE processing
- User: "This PDF is very large (500MB). Processing may fail on systems with <16GB RAM."
- Suggestion: Split PDF into smaller files

### Handling Strategy (Pragmatic)

**Philosophy**: Personal tool, rare failures, don't over-engineer.

**Tiered Response**:

```typescript
// worker/handlers/process-document.ts
try {
  const result = await extractWithDocling(pdfPath, options)
  // Success path...
} catch (error) {
  // Classify error
  const errorType = classifyDoclingError(error)

  switch (errorType) {
    case 'python_missing':
      // BLOCK: Cannot proceed, show setup instructions
      await updateJob(jobId, {
        status: 'failed',
        error_message: 'Python not configured. See setup guide.',
        error_details: { type: 'environment', fixable: true }
      })
      break

    case 'pdf_corrupted':
      // WARN: Save what we have, allow PDF viewing
      await updateJob(jobId, {
        status: 'completed_with_warnings',
        warning_message: 'PDF extraction failed (corrupted file). PDF viewer available but no annotations.',
        processing_flags: { markdown_available: false, pdf_available: true }
      })
      break

    case 'timeout':
      // RETRY: Offer manual retry with extended timeout
      await updateJob(jobId, {
        status: 'failed_retryable',
        error_message: 'Processing timeout. Retry with extended timeout?',
        error_details: { type: 'timeout', retry_available: true }
      })
      break

    case 'ocr_missing':
      // FALLBACK: Process without OCR, warn user
      console.log('[Docling] OCR failed, retrying without OCR...')
      const resultWithoutOcr = await extractWithDocling(pdfPath, { ...options, ocr: false })
      // Continue with partial result...
      break

    case 'oom':
      // BLOCK: Cannot fix, suggest splitting PDF
      await updateJob(jobId, {
        status: 'failed',
        error_message: 'PDF too large for available memory. Try splitting into smaller files.',
        error_details: { type: 'resource_limit', fixable: false }
      })
      break

    default:
      // Unknown error - fail safe
      await updateJob(jobId, {
        status: 'failed',
        error_message: error.message,
        error_details: { type: 'unknown', traceback: error.stack }
      })
  }
}
```

### Admin Panel "Retry Processing" Action

**Add to Admin Panel → Scanner Tab**:

```typescript
// components/admin/tabs/ScannerTab.tsx
{document.processing_status === 'failed_retryable' && (
  <div className="bg-yellow-50 border border-yellow-200 rounded p-4">
    <h4 className="font-medium mb-2">Processing Failed</h4>
    <p className="text-sm mb-3">{document.error_message}</p>

    <div className="flex gap-2">
      <button
        onClick={() => retryProcessing(document.id, { extendedTimeout: true })}
        className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700"
      >
        Retry with Extended Timeout (30 min)
      </button>

      <button
        onClick={() => retryProcessing(document.id, { ocr: false })}
        className="px-3 py-1 border rounded hover:bg-gray-50"
      >
        Retry without OCR
      </button>

      <button
        onClick={() => deleteDocument(document.id)}
        className="px-3 py-1 text-red-600 border border-red-600 rounded hover:bg-red-50"
      >
        Delete & Re-upload
      </button>
    </div>
  </div>
)}
```

### Detection Utilities

**File**: `worker/lib/docling-error-classifier.ts` (new)

```typescript
export type DoclingErrorType =
  | 'python_missing'
  | 'pdf_corrupted'
  | 'timeout'
  | 'ocr_missing'
  | 'oom'
  | 'unknown'

export function classifyDoclingError(error: Error): DoclingErrorType {
  const message = error.message.toLowerCase()

  if (message.includes('python not found') || message.includes('enoent')) {
    return 'python_missing'
  }

  if (message.includes('timeout')) {
    return 'timeout'
  }

  if (message.includes('tesseract') || message.includes('ocr')) {
    return 'ocr_missing'
  }

  if (message.includes('killed') || message.includes('exit code 137')) {
    return 'oom'
  }

  if (
    message.includes('pdfunicodenotdefined') ||
    message.includes('pdfsyntaxerror') ||
    message.includes('corrupted')
  ) {
    return 'pdf_corrupted'
  }

  return 'unknown'
}
```

### Summary: Worth Fixing?

| Failure Type | Frequency | Auto-Fix? | Manual Fix? | Worth Engineering? |
|--------------|-----------|-----------|-------------|-------------------|
| Python missing | Common (setup) | ❌ | ✅ (Install Python) | ⚠️ Detection + setup guide |
| PDF corrupted | 1-2% | ❌ | ✅ (Re-upload) | ✅ Graceful fallback |
| Timeout | <1% | ✅ (Retry) | ✅ (Extend timeout) | ✅ Retry button |
| OCR missing | <5% | ✅ (Disable OCR) | ✅ (Install Tesseract) | ⚠️ Fallback to non-OCR |
| OOM | <0.5% | ❌ | ❌ (System limit) | ⚠️ Warning only |

**Recommendation**: Implement detection + retry for top 3. OOM gets warning only.

---

## 📱 Mobile Optimization - Design Considerations

### Touch-First Interactions

**Phase 1 Additions**:

```typescript
// PDFViewer with touch support
import { useGesture } from '@use-gesture/react'

export function PDFViewer({ fileUrl, documentId }: PDFViewerProps) {
  const [scale, setScale] = useState(1.0)
  const [position, setPosition] = useState({ x: 0, y: 0 })

  // Pinch-to-zoom gesture
  const bind = useGesture({
    onPinch: ({ offset: [d] }) => {
      setScale(Math.max(0.5, Math.min(3.0, 1 + d / 200)))
    },
    onDrag: ({ offset: [x, y] }) => {
      setPosition({ x, y })
    }
  })

  return (
    <div {...bind()} className="touch-none">
      <Page pageNumber={pageNumber} scale={scale} />
    </div>
  )
}
```

**Key Patterns**:
- Pinch-to-zoom (native gesture)
- Swipe left/right for pages
- Long-press for annotation creation (replaces mouse hover)
- Double-tap for fit-width toggle

### Responsive Layout

**Breakpoints**:
```css
/* Mobile: Stack panels */
@media (max-width: 768px) {
  .reader-layout {
    flex-direction: column;
  }

  .left-panel, .right-panel {
    position: fixed;
    bottom: 0;
    transform: translateY(100%);
    transition: transform 0.3s;
  }

  .left-panel.open, .right-panel.open {
    transform: translateY(0);
  }
}

/* Tablet: Side panels collapsible */
@media (min-width: 769px) and (max-width: 1024px) {
  .left-panel, .right-panel {
    width: 280px;
  }
}

/* Desktop: Full panels */
@media (min-width: 1025px) {
  .left-panel {
    width: 300px;
  }

  .right-panel {
    width: 400px;
  }
}
```

### Mobile-Specific UI

**DocumentHeader Compact Mode**:
```typescript
// Mobile: Hide stats, show only title + toggle
{isMobile ? (
  <div className="flex items-center justify-between px-4 py-2">
    <h1 className="text-base font-medium truncate">{title}</h1>
    <button onClick={togglePanels}>☰</button>
  </div>
) : (
  // Desktop: Full header with stats
  <DesktopHeader />
)}
```

**Annotation Creation**:
```typescript
// Mobile: Bottom sheet instead of floating panel
{isMobile ? (
  <Sheet open={!!selection} onOpenChange={onClose}>
    <SheetContent side="bottom">
      <QuickCapturePanel selection={selection} />
    </SheetContent>
  </Sheet>
) : (
  // Desktop: Floating panel
  <QuickCapturePanel selection={selection} />
)}
```

### Testing Strategy

**Phase 6 Manual Testing**:
- [ ] iPhone Safari (iOS 17+)
- [ ] Android Chrome (latest)
- [ ] iPad Safari (landscape + portrait)
- [ ] Touch interactions smooth (60 FPS)
- [ ] Text selection works with long-press
- [ ] Zoom gestures responsive
- [ ] Panels slide in/out smoothly

**Performance Targets**:
- Mobile load time: <5 seconds (4G)
- Touch response: <100ms
- Pinch zoom: 60 FPS
- Page navigation: <300ms

---

## 📊 Updated Feature Priorities

### Phase 1: Foundation (Week 1-2)
**Add**:
- LeftPanel shell component (empty, collapsible)
- PDF metadata display in DocumentHeader
- Zoom presets (Fit Width, Fit Page, Actual Size)
- Page label display (use `getPageLabel()`)
- Password-protected PDF handling
- Touch gesture detection (prepare for mobile)
- File size warning (>50MB)

**Keep**:
- Basic PDF display
- Dual-mode toggle
- Navigation controls
- Worker configuration

### Phase 2: Text Layer & Selection (Week 3-4)
**Add**:
- Metadata tab in LeftPanel (PDF info, Rhizome stats)
- Mobile touch selection (long-press)

**Keep**:
- Text selection tracking
- Coordinate extraction

### Phase 3: ECS Annotation Integration (Week 5-6)
**Add**:
- Mobile annotation creation (bottom sheet)

**Keep**:
- PDF coordinates in Position component
- QuickCapturePanel integration
- Annotation overlays

### Phase 4: Chunk Visualization (Week 7-8)
**Add**:
- Outline tab in LeftPanel (PDF outline + extracted headings)
- Stale bbox detection (check `metadata_extracted_at`)
- "Refresh Chunk Boundaries" action in Admin Panel

**Keep**:
- Chunk boundary rendering with bboxes
- Navigation from ChunksTab

### Phase 5: Connection Integration (Week 9-10)
**Add**:
- Move ConnectionHeatmap to LeftPanel (new tab)
- Thumbnails tab in LeftPanel (page previews)
- Mobile-optimized connection navigation

**Keep**:
- Connection indicators on chunks
- Connection count badges
- Navigation between connected chunks

### Phase 6: Performance & Polish (Week 11-12)
**Add**:
- Continuous vs single-page toggle
- Page rotation controls (0°, 90°, 180°, 270°)
- Keyboard shortcuts: `Cmd+0` (fit width), `Cmd+1` (actual size)
- Mobile gesture optimization (pinch-zoom smoothness)
- Docling error classification + retry UI
- LeftPanel responsive behavior polish

**Keep**:
- React Virtuoso virtualization
- Memory monitoring
- Loading/error states

---

## 🎨 LeftPanel Implementation Details

### Component Structure

**File**: `src/components/layout/LeftPanel.tsx`

```typescript
'use client'

import { useState } from 'react'
import { useUIStore } from '@/stores/ui-store'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { MetadataTab } from './tabs/MetadataTab'
import { OutlineTab } from './tabs/OutlineTab'
import { ThumbnailsTab } from './tabs/ThumbnailsTab'
import { HeatmapTab } from './tabs/HeatmapTab'

interface LeftPanelProps {
  documentId: string
  pdfMetadata?: any
  outline?: any[]
  numPages?: number
  currentPage?: number
  onPageNavigate?: (page: number) => void
}

export function LeftPanel({
  documentId,
  pdfMetadata,
  outline,
  numPages,
  currentPage,
  onPageNavigate
}: LeftPanelProps) {
  const isOpen = useUIStore(state => state.leftPanelOpen)
  const activeTab = useUIStore(state => state.leftPanelTab)
  const setActiveTab = useUIStore(state => state.setLeftPanelTab)

  if (!isOpen) return null

  return (
    <div className="w-[300px] border-r bg-background overflow-hidden flex flex-col">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
        <TabsList className="w-full justify-start border-b rounded-none p-1">
          <TabsTrigger value="metadata" className="text-xs">Metadata</TabsTrigger>
          <TabsTrigger value="outline" className="text-xs">Outline</TabsTrigger>
          <TabsTrigger value="thumbnails" className="text-xs">Pages</TabsTrigger>
          <TabsTrigger value="heatmap" className="text-xs">Heatmap</TabsTrigger>
        </TabsList>

        <TabsContent value="metadata" className="flex-1 overflow-auto">
          <MetadataTab documentId={documentId} pdfMetadata={pdfMetadata} />
        </TabsContent>

        <TabsContent value="outline" className="flex-1 overflow-auto">
          <OutlineTab outline={outline} onPageNavigate={onPageNavigate} />
        </TabsContent>

        <TabsContent value="thumbnails" className="flex-1 overflow-auto">
          <ThumbnailsTab
            numPages={numPages}
            currentPage={currentPage}
            onPageNavigate={onPageNavigate}
          />
        </TabsContent>

        <TabsContent value="heatmap" className="flex-1 overflow-auto">
          <HeatmapTab documentId={documentId} currentPage={currentPage} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
```

### UIStore Updates

**File**: `src/stores/ui-store.ts`

```typescript
interface UIState {
  // Existing fields...
  viewMode: 'focus' | 'standard' | 'explore'
  sparkCaptureOpen: boolean

  // LeftPanel state (new)
  leftPanelOpen: boolean
  leftPanelTab: 'metadata' | 'outline' | 'thumbnails' | 'heatmap'

  // Actions
  toggleLeftPanel: () => void
  setLeftPanelTab: (tab: string) => void
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      // Existing state...
      viewMode: 'standard',
      sparkCaptureOpen: false,

      // LeftPanel (new)
      leftPanelOpen: true, // Open by default on desktop
      leftPanelTab: 'metadata',

      // Actions
      toggleLeftPanel: () => set(state => ({ leftPanelOpen: !state.leftPanelOpen })),
      setLeftPanelTab: (tab) => set({ leftPanelTab: tab }),
    }),
    {
      name: 'ui-storage',
      partialize: (state) => ({
        viewMode: state.viewMode,
        leftPanelOpen: state.leftPanelOpen,
        leftPanelTab: state.leftPanelTab,
      })
    }
  )
)
```

---

## 🔧 Personal Tool Optimizations

### No Artificial Limits

**Storage**:
- Supabase Storage limit: 50GB (free tier) or 100GB+ (paid)
- **No artificial file size limit** in code
- Show warning: "Large PDFs (>100MB) may take longer to load"
- Let Supabase reject if over quota (graceful error)

**Processing**:
- **No page limit** - Process 5000-page PDFs if user wants
- Show estimated time: "Large document (2000 pages). Estimated: 45-60 minutes."
- Allow background processing (close tab, continue later)

### Warnings Not Restrictions

**Pattern**:
```typescript
// ❌ Don't block
if (fileSizeM > 50) {
  throw new Error('File too large. Maximum 50MB.')
}

// ✅ Warn but allow
if (fileSizeM > 100) {
  console.warn(`Large file: ${fileSizeMB}MB`)
  toast.warning('Large PDF detected', {
    description: 'Processing may take 15-30 minutes. You can close this tab and return later.',
    duration: 10000
  })
}
// Continue processing...
```

**Admin Panel**:
- "Force Process" button for failed documents
- "Extend Timeout" option for large PDFs
- "Skip Enrichment" option to speed up processing

---

## 📝 Updated Success Criteria

### Phase 1
**Add to Manual Verification**:
- [ ] LeftPanel shell renders and collapses
- [ ] PDF metadata displays in header
- [ ] Zoom presets work (Fit Width, Fit Page, 100%)
- [ ] Page labels show: "Page iii (3 of 250)"
- [ ] Password prompt appears for protected PDFs
- [ ] Touch gestures detected on mobile (console log)
- [ ] File size warning appears for >100MB PDFs

### Phase 4
**Add to Manual Verification**:
- [ ] Outline tab in LeftPanel shows PDF TOC
- [ ] Stale bbox warning appears for reprocessed chunks
- [ ] "Refresh Chunk Boundaries" button in Admin Panel

### Phase 5
**Add to Manual Verification**:
- [ ] ConnectionHeatmap renders in LeftPanel
- [ ] Thumbnails tab shows page previews
- [ ] Mobile: Swipe left/right navigates pages

### Phase 6
**Add to Manual Verification**:
- [ ] Continuous scroll vs single-page toggle works
- [ ] Page rotation controls work (90°, 180°, 270°)
- [ ] Keyboard: `Cmd+0` fits width, `Cmd+1` actual size
- [ ] Mobile: Pinch-zoom smooth at 60 FPS
- [ ] Docling retry UI appears for failed documents
- [ ] LeftPanel responsive on mobile (bottom sheet)

---

## 🎯 Summary of Changes

### New Components
1. **LeftPanel** - Document-level navigation (Outline, Thumbnails, Heatmap, Metadata)
2. **Docling Error Classifier** - Categorize and handle extraction failures
3. **Mobile Gesture Handler** - Touch interactions (pinch, swipe, long-press)

### Enhanced Features
1. **Zoom Presets** - Fit Width, Fit Page, Actual Size (not just +/-)
2. **Page Labels** - Roman numerals + numbers: "Page iii (3 of 250)"
3. **Password Support** - Prompt for protected PDFs
4. **Rotation Controls** - 0°, 90°, 180°, 270° (rare but supported)
5. **Continuous vs Single Page** - Toggle viewing mode

### Mobile Optimizations
1. **Touch Gestures** - Pinch-zoom, swipe pages, long-press annotations
2. **Responsive Layout** - Panels → Bottom sheets on mobile
3. **Compact UI** - Smaller header, hidden stats, essential controls only

### Failure Handling
1. **Docling Error Detection** - 5 categories (Python, corruption, timeout, OCR, OOM)
2. **Retry Options** - Admin Panel buttons for extended timeout, no-OCR, etc.
3. **Graceful Fallbacks** - View PDF even if extraction fails
4. **Clear Warnings** - User-friendly error messages, no blocking

### Out of Scope (Unchanged)
- PDF generation (still not needed)
- Cross-document navigation (Phase 7+)
- Advanced search (Phase 7+)
- Mobile app (web mobile first)

---

## 📚 References

### New Documentation
- **Docling Errors**: `worker/lib/docling-error-classifier.ts` (to be created)
- **LeftPanel**: `src/components/layout/LeftPanel.tsx` (to be created)
- **Mobile Gestures**: `src/hooks/usePDFGestures.ts` (to be created)

### Existing Patterns
- **RightPanel**: `src/components/sidebar/RightPanel.tsx` (model for LeftPanel)
- **Touch Support**: `src/hooks/use-mobile.ts` (mobile detection)
- **Docling Integration**: `worker/lib/docling-extractor.ts` (error handling to enhance)

---

**Status**: Ready for implementation with these amendments integrated into base plan.
