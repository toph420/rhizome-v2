# PDF Viewer with Dual-Panel Navigation Implementation Plan

**Date**: 2025-10-27
**Status**: Ready for Implementation
**Timeline**: 11-12 weeks for production-ready implementation

---

## Overview

Implement a reusable PDF viewer component using react-pdf (wojtekmaj) that serves as a **first-class view** alongside the existing markdown reader. The PDF viewer will integrate with Rhizome's ECS annotation system, visualize chunk boundaries using Docling-extracted bboxes, and display connections between chunks - enabling the full Rhizome experience (annotations, connections, sparks) in PDF view.

**Why This Matters**: When markdown extraction produces poor results (complex layouts, tables, multi-column PDFs), users can switch to native PDF view while maintaining full access to Rhizome's knowledge synthesis features.

**Key Architectural Addition**: Introduces **LeftPanel** (mirrors RightPanel) for document-level navigation: Outline, Thumbnails, Connection Heatmap, and Metadata.

---

## Current State Analysis

### What Exists Today

**Document Reader** (`src/app/read/[id]/page.tsx:1-259`):
- Server Component fetches document metadata + signed Storage URL
- ReaderLayout orchestrates 4 Zustand stores (Reader, Connection, UI, Annotation)
- VirtualizedReader renders markdown with React Virtuoso
- BlockRenderer injects annotations as overlays
- Annotations stored in ECS (5-component: Position, Visual, Content, Temporal, ChunkRef)

**Chunk System** (Already Perfect for PDF!):
```sql
chunks table:
- page_start, page_end (integer) - PDF page ranges ✅
- page_label (text) - Human-readable page numbers ✅
- bboxes (jsonb) - Precise coordinates from Docling ✅
- start_offset, end_offset - Markdown character offsets ✅
```

**Connection Detection** (`worker/engines/`):
- 3 engines: Semantic (25%), Contradiction (40%), Thematic (35%)
- Chunk-based detection (view-agnostic!)
- ConnectionStore manages weights, filtering, display

**Storage Pattern**:
- PDFs already in Supabase Storage: `${doc.storage_path}/source.pdf`
- Admin client creates signed URLs (1 hour expiry)
- Markdown stored alongside: `${doc.storage_path}/content.md`

### Key Discoveries from Research

**React-PDF Library** (`thoughts/ideas/2025-10-27_react-pdf-research.md`):
- React wrapper for PDF.js (Mozilla) - 400K weekly downloads
- Worker thread support (offloads parsing/rendering to separate thread)
- Canvas mode recommended (stable, fast, no memory leaks)
- Text layer API for selection/extraction
- No built-in UI (must build - perfect for custom integration)
- Virtualization required for >25 pages (PDF.js recommendation)
- TypeScript built-in, Next.js 15 / React 19 compatible

### Constraints Identified

1. **Client-Only Limitation**: PDF.js requires browser APIs (no SSR)
2. **Memory Management**: Large PDFs (500+ pages) need virtualization
3. **Worker Configuration**: Must configure PDF.js worker before first render
4. **Coordinate Systems**: PDF uses bottom-left origin, need translation for overlays
5. **Mobile Optimization**: Touch gestures, responsive panels, performance targets (60 FPS)

---

## Desired End State

### User Experience

**Dual-Panel Document Viewer**:
```
┌──────────────────────────────────────────────────────┐
│ [Document Header]                    [View: PDF ▼]   │
├──────┬────────────────────────────────────┬──────────┤
│ Left │                                    │ Right    │
│ Panel│  PDF/Markdown Viewer               │ Panel    │
│      │                                    │          │
│ - TOC│                                    │ - Annot. │
│ - Map│  - Annotations                     │ - Chunks │
│ - Meta│  - Chunk boxes                    │ - Conn.  │
│ - Thumb│  - Connections                   │ - Sparks │
│      │                                    │          │
└──────┴────────────────────────────────────┴──────────┘
```

**Feature Parity Across Views**:
| Feature | Markdown View | PDF View | Phase |
|---------|---------------|----------|-------|
| Text selection | ✅ | ✅ | Phase 2 |
| Annotations (ECS) | ✅ | ✅ | Phase 3 |
| Chunk boundaries | ❌ | ✅ | Phase 4 |
| Connection detection | ✅ | ✅ | Phase 5 |
| Sparks (Cmd+K) | ✅ | ✅ | Phase 3 |
| Navigation | ✅ | ✅ | Phase 5 |
| Search | ✅ | 🔄 | Phase 6 |
| LeftPanel | 🔄 | ✅ | Phase 2-5 |

### Technical Goals

**Architecture**:
- Reusable `PDFViewer` component in `components/rhizome/pdf-viewer/`
- **LeftPanel** component in `components/layout/LeftPanel.tsx` (new!)
- Parallel structure to VirtualizedReader (same patterns)
- ReaderStore tracks `viewerMode: 'markdown' | 'pdf'`
- UIStore tracks `leftPanelOpen`, `leftPanelTab`
- No changes to worker, connection engines, or storage

**Integration**:
- Same ECS annotation system (Position component stores PDF coordinates)
- Same ConnectionStore (chunk-based detection is view-agnostic)
- Same RightPanel (annotations/connections/sparks tabs work in both views)
- New LeftPanel (outline/thumbnails/heatmap/metadata tabs)
- Same keyboard shortcuts (Cmd+K for sparks, etc.)

**Performance**:
- React Virtuoso for page virtualization (proven in markdown reader)
- Worker thread for PDF parsing (doesn't block main thread)
- Lazy rendering (only visible pages + overscan)
- Memory efficient for 500+ page books
- Mobile: 60 FPS pinch-zoom, <100ms touch response

---

## Rhizome Architecture

**Module**: Main App only (Next.js)
**Storage**: Supabase Storage (PDFs already there)
**Source of Truth**: Storage (PDFs) + Database (annotations with PDF coordinates)
**Migration**: No migration required (JSONB accepts new fields dynamically)
**Test Tier**: Stable (fix when broken, not deployment-blocking)
**Pipeline Stages**: None affected (viewer is UI-only, no worker changes)
**Engines**: None affected (connections are chunk-based, view-agnostic)

---

## What We're NOT Doing

**Out of Scope for Initial Implementation**:

1. **PDF Generation** - No `@react-pdf/renderer` (different library, different use case)
2. **Dual-Pane View** - No side-by-side markdown + PDF (single view mode at a time)
3. **PDF Editing** - No form filling, redaction, or modification (read-only viewer)
4. **OCR** - Assume text-based PDFs (Docling already extracted text)
5. **Cross-Document Navigation** - Connections to other documents deferred to Phase 7+
6. **Annotation Import** - No reading existing PDF annotations (only create new via Rhizome)
7. **Print/Download** - View-only initially, export features come later

---

## Implementation Approach

### High-Level Strategy

**Parallel Structure to Markdown Reader**:
```
Markdown Reader                PDF Reader
├─ VirtualizedReader.tsx  →  ├─ VirtualizedPDFReader.tsx
├─ BlockRenderer.tsx      →  ├─ PDFPageRenderer.tsx
├─ parseMarkdownToBlocks  →  ├─ (react-pdf Document/Page)
├─ injectAnnotations()    →  ├─ <AnnotationOverlay /> component
└─ Virtuoso (blocks)      →  └─ Virtuoso (pages)
```

**New Architecture Components**:
```
LeftPanel (new!)              RightPanel (existing)
├─ MetadataTab           →   ├─ AnnotationsTab
├─ OutlineTab            →   ├─ ChunksTab
├─ ThumbnailsTab         →   ├─ ConnectionsTab
├─ HeatmapTab            →   ├─ SparksTab
└─ (future tabs)         →   └─ (future tabs)
```

**Technology Stack**:
- `react-pdf` v10.2.0+ (wojtekmaj, PDF viewer)
- `pdfjs-dist` (peer dependency, Mozilla PDF.js)
- `@use-gesture/react` (touch gestures for mobile)
- React Virtuoso (reuse existing, page virtualization)
- Zustand (reuse existing stores + extend UIStore)
- Supabase Storage (PDFs already there)

---

## Phase 1: Foundation - Basic PDF Display (Week 1-2)

### Overview

Set up react-pdf, configure worker, display single PDF page, create LeftPanel shell. Establish integration with existing ReaderLayout and Server Component patterns. Add mobile touch gesture detection.

### Changes Required

#### 1. Install Dependencies

**File**: `package.json`
**Changes**: Add react-pdf, pdfjs-dist, and gesture library

```bash
npm install react-pdf pdfjs-dist @use-gesture/react
```

#### 2. Worker Configuration

**File**: `src/lib/pdf/worker-config.ts` (new)
**Changes**: Configure PDF.js worker for browser usage

```typescript
'use client'

import { pdfjs } from 'react-pdf'

// Initialize worker once (runs in separate thread, doesn't block main thread)
if (typeof window !== 'undefined') {
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url,
  ).toString()
}

export { pdfjs }
```

#### 3. Basic PDF Viewer Component

**File**: `src/components/rhizome/pdf-viewer/PDFViewer.tsx` (new)
**Changes**: Core PDF viewing component with zoom presets and touch gesture detection

```typescript
'use client'

import { useState, useCallback, useEffect } from 'react'
import { Document, Page } from 'react-pdf'
import { useGesture } from '@use-gesture/react'
import 'react-pdf/dist/Page/AnnotationLayer.css'
import 'react-pdf/dist/Page/TextLayer.css'
import '@/lib/pdf/worker-config' // Initialize worker

interface PDFViewerProps {
  fileUrl: string
  documentId: string
  onMetadataLoad?: (metadata: any) => void
}

export function PDFViewer({ fileUrl, documentId, onMetadataLoad }: PDFViewerProps) {
  const [numPages, setNumPages] = useState<number>(0)
  const [pageNumber, setPageNumber] = useState(1)
  const [scale, setScale] = useState(1.0)
  const [pageWidth, setPageWidth] = useState<number>(0)
  const [pdfMetadata, setPdfMetadata] = useState<any>(null)

  const onDocumentLoadSuccess = useCallback(({ numPages }: { numPages: number }) => {
    setNumPages(numPages)
    console.log(`[PDFViewer] Loaded PDF with ${numPages} pages`)
  }, [])

  // Touch gesture detection for mobile
  const bind = useGesture({
    onPinch: ({ offset: [d] }) => {
      setScale(Math.max(0.5, Math.min(3.0, 1 + d / 200)))
    },
    onDrag: ({ offset: [x, y] }) => {
      // Pan handling for mobile (future enhancement)
      console.log('[PDFViewer] Pan gesture detected:', x, y)
    }
  })

  // Load PDF metadata
  useEffect(() => {
    const loadMetadata = async () => {
      try {
        // PDF.js provides getMetadata() - we'll enhance this in Phase 2
        console.log('[PDFViewer] Metadata loading placeholder')
      } catch (error) {
        console.error('[PDFViewer] Failed to load metadata:', error)
      }
    }
    loadMetadata()
  }, [fileUrl])

  // Zoom presets
  const handleFitWidth = () => {
    if (pageWidth > 0) {
      const containerWidth = window.innerWidth - 400 // Account for panels
      setScale(containerWidth / pageWidth)
    }
  }

  const handleFitPage = () => {
    // Fit to visible viewport height
    const containerHeight = window.innerHeight - 200
    setScale(containerHeight / 1000) // Rough estimate, will refine in Phase 2
  }

  const handleActualSize = () => {
    setScale(1.0)
  }

  return (
    <div className="pdf-viewer-container flex flex-col h-full">
      {/* Controls */}
      <div className="pdf-controls flex items-center gap-4 p-4 border-b bg-background">
        <button
          onClick={() => setPageNumber(p => Math.max(1, p - 1))}
          disabled={pageNumber <= 1}
          className="px-3 py-1 border rounded disabled:opacity-50"
        >
          Previous
        </button>

        <span className="text-sm">
          Page {pageNumber} of {numPages}
        </span>

        <button
          onClick={() => setPageNumber(p => Math.min(numPages, p + 1))}
          disabled={pageNumber >= numPages}
          className="px-3 py-1 border rounded disabled:opacity-50"
        >
          Next
        </button>

        <div className="flex-1" />

        {/* Zoom presets */}
        <button onClick={handleFitWidth} className="px-3 py-1 border rounded text-xs">
          Fit Width
        </button>
        <button onClick={handleFitPage} className="px-3 py-1 border rounded text-xs">
          Fit Page
        </button>
        <button onClick={handleActualSize} className="px-3 py-1 border rounded text-xs">
          100%
        </button>

        <button onClick={() => setScale(s => s * 1.2)} className="px-3 py-1 border rounded">
          Zoom In
        </button>
        <button onClick={() => setScale(s => s / 1.2)} className="px-3 py-1 border rounded">
          Zoom Out
        </button>
      </div>

      {/* PDF document */}
      <div
        {...bind()}
        className="pdf-content flex-1 overflow-auto flex items-center justify-center bg-gray-100 dark:bg-gray-900 touch-none"
      >
        <Document
          file={fileUrl}
          onLoadSuccess={onDocumentLoadSuccess}
          loading={
            <div className="text-center p-8">
              <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">Loading PDF...</p>
            </div>
          }
          error={
            <div className="text-center p-8">
              <p className="text-destructive mb-2">Failed to load PDF</p>
              <p className="text-sm text-muted-foreground">Please try refreshing the page</p>
            </div>
          }
        >
          <Page
            pageNumber={pageNumber}
            scale={scale}
            renderTextLayer={true}
            renderAnnotationLayer={true}
            className="shadow-lg"
            onLoadSuccess={(page) => {
              setPageWidth(page.width)
            }}
          />
        </Document>
      </div>
    </div>
  )
}
```

#### 4. LeftPanel Shell Component

**File**: `src/components/layout/LeftPanel.tsx` (new)
**Changes**: Create collapsible panel shell (tabs added in later phases)

```typescript
'use client'

import { useUIStore } from '@/stores/ui-store'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/rhizome/tabs'

interface LeftPanelProps {
  documentId: string
}

export function LeftPanel({ documentId }: LeftPanelProps) {
  const isOpen = useUIStore(state => state.leftPanelOpen)
  const activeTab = useUIStore(state => state.leftPanelTab)
  const setActiveTab = useUIStore(state => state.setLeftPanelTab)

  if (!isOpen) return null

  return (
    <div className="w-[300px] border-r bg-background overflow-hidden flex flex-col">
      <div className="p-4 border-b">
        <h2 className="text-sm font-semibold">Document Navigation</h2>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
        <TabsList className="w-full justify-start border-b rounded-none p-1">
          {/* Tabs will be added in Phases 2-5 */}
          <TabsTrigger value="placeholder" className="text-xs">Placeholder</TabsTrigger>
        </TabsList>

        <TabsContent value="placeholder" className="flex-1 overflow-auto p-4">
          <p className="text-sm text-muted-foreground">
            Metadata, Outline, Thumbnails, and Heatmap tabs will be added in upcoming phases.
          </p>
        </TabsContent>
      </Tabs>
    </div>
  )
}
```

#### 5. UIStore Updates

**File**: `src/stores/ui-store.ts`
**Changes**: Add LeftPanel state

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

#### 6. Integrate with Server Component

**File**: `src/app/read/[id]/page.tsx:114-141`
**Changes**: Add PDF signed URL generation

```typescript
// Existing markdown URL generation (line 114-141)
if (doc.markdown_available) {
  const adminClient = createAdminClient()
  const { data, error: storageError } = await adminClient.storage
    .from('documents')
    .createSignedUrl(`${doc.storage_path}/content.md`, 3600)

  if (storageError || !data) {
    return <ErrorCard />
  }

  const markdownSignedUrl = data.signedUrl

  // 🆕 ADD: Generate PDF signed URL
  let pdfSignedUrl: string | null = null

  // Check if original PDF exists in storage
  const { data: pdfData, error: pdfError } = await adminClient.storage
    .from('documents')
    .createSignedUrl(`${doc.storage_path}/source.pdf`, 3600)

  if (!pdfError && pdfData) {
    pdfSignedUrl = pdfData.signedUrl
  }

  // File size warning for large PDFs (personal tool philosophy)
  if (pdfSignedUrl) {
    const { data: fileData } = await adminClient.storage
      .from('documents')
      .list(doc.storage_path, { search: 'source.pdf' })

    const fileSizeMB = fileData?.[0]?.metadata?.size ? fileData[0].metadata.size / (1024 * 1024) : 0

    // No artificial limits, just warnings
    if (fileSizeMB > 100) {
      console.warn(`[PDF Viewer] Large PDF: ${fileSizeMB.toFixed(2)}MB - may take longer to load`)
    }
  }

  return (
    <ReaderLayout
      documentId={id}
      markdownUrl={markdownSignedUrl}
      pdfUrl={pdfSignedUrl}  // 🆕 ADD: Pass PDF URL
      chunks={chunks}
      annotations={annotations}
      documentTitle={doc.title}
      wordCount={doc.word_count}
      connectionCount={connectionCount || 0}
      reviewResults={reviewResults}
      chunkerType={doc.chunker_type}
    />
  )
}
```

#### 7. Update ReaderLayout with Dual-Panel Support

**File**: `src/components/reader/ReaderLayout.tsx:31-38`
**Changes**: Add pdfUrl prop and LeftPanel

```typescript
import { LeftPanel } from '@/components/layout/LeftPanel'

interface ReaderLayoutProps {
  documentId: string
  markdownUrl: string
  pdfUrl: string | null  // 🆕 ADD
  chunks: Chunk[]
  annotations: StoredAnnotation[]
  documentTitle: string
  // ... rest of props
}

export function ReaderLayout({
  documentId,
  markdownUrl,
  pdfUrl,  // 🆕 ADD
  chunks,
  // ... rest of props
}: ReaderLayoutProps) {
  // 🆕 ADD: Viewer mode state
  const [viewerMode, setViewerMode] = useState<'markdown' | 'pdf'>('markdown')

  // Existing store subscriptions...
  const loadDocument = useReaderStore(state => state.loadDocument)
  const leftPanelOpen = useUIStore(state => state.leftPanelOpen)

  return (
    <div className="flex flex-col h-screen">
      {/* Header with view mode toggle */}
      <div className="sticky top-14 z-40 bg-background">
        <DocumentHeader
          documentId={documentId}
          title={documentTitle}
          viewerMode={viewerMode}
          onViewerModeChange={setViewerMode}
          pdfAvailable={!!pdfUrl}
        />
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* 🆕 ADD: LeftPanel */}
        {leftPanelOpen && <LeftPanel documentId={documentId} />}

        {/* Main viewer */}
        <div className="flex-1 overflow-hidden relative">
          {viewerMode === 'markdown' ? (
            <DocumentViewer
              documentId={documentId}
              markdownUrl={markdownUrl}
              chunks={chunks}
              annotations={annotations}
            />
          ) : (
            pdfUrl && (
              <PDFViewer
                fileUrl={pdfUrl}
                documentId={documentId}
              />
            )
          )}
        </div>

        {/* RightPanel - same in both modes */}
        {viewMode !== 'focus' && (
          <RightPanel
            documentId={documentId}
            visibleChunkIds={visibleChunks.map(c => c.id)}
            reviewResults={reviewResults}
            onAnnotationClick={handleAnnotationClick}
            onNavigateToChunk={handleNavigateToChunk}
            chunks={chunks}
          />
        )}
      </div>
    </div>
  )
}
```

#### 8. Update DocumentHeader with Toggle

**File**: `src/components/reader/DocumentHeader.tsx`
**Changes**: Add view mode toggle buttons

```typescript
interface DocumentHeaderProps {
  // ... existing props
  viewerMode?: 'markdown' | 'pdf'  // 🆕 ADD
  onViewerModeChange?: (mode: 'markdown' | 'pdf') => void  // 🆕 ADD
  pdfAvailable?: boolean  // 🆕 ADD
}

export function DocumentHeader({
  // ... existing props
  viewerMode = 'markdown',
  onViewerModeChange,
  pdfAvailable = false,
}: DocumentHeaderProps) {
  return (
    <div className="border-b bg-background/95 backdrop-blur">
      <div className="flex items-center justify-between px-6 py-3">
        {/* Existing title and stats */}
        <div className="flex items-center gap-4">
          <h1 className="text-xl font-semibold">{title}</h1>
          {/* ... existing stats */}
        </div>

        {/* 🆕 ADD: View mode toggle (only if PDF available) */}
        {pdfAvailable && onViewerModeChange && (
          <div className="flex items-center gap-2 border rounded-md p-1">
            <button
              onClick={() => onViewerModeChange('markdown')}
              className={cn(
                'px-3 py-1 rounded text-sm transition-colors',
                viewerMode === 'markdown'
                  ? 'bg-primary text-primary-foreground'
                  : 'hover:bg-muted'
              )}
            >
              Markdown
            </button>
            <button
              onClick={() => onViewerModeChange('pdf')}
              className={cn(
                'px-3 py-1 rounded text-sm transition-colors',
                viewerMode === 'pdf'
                  ? 'bg-primary text-primary-foreground'
                  : 'hover:bg-muted'
              )}
            >
              PDF
            </button>
          </div>
        )}

        {/* Existing controls */}
      </div>
    </div>
  )
}
```

### Success Criteria

#### Automated Verification:
- [ ] Installation: `npm install` completes without errors
- [ ] Build: `npm run build` succeeds with new PDF components
- [ ] Type check: `npm run type-check` passes
- [ ] Lint: `npm run lint` passes with no errors

#### Manual Verification:
- [ ] PDF displays correctly for single-page document
- [ ] Navigation buttons work (previous/next page)
- [ ] Zoom controls work (in/out)
- [ ] Zoom presets work (Fit Width, Fit Page, 100%)
- [ ] Toggle between Markdown and PDF views works
- [ ] PDF loads from Supabase Storage signed URL
- [ ] Worker thread doesn't block main thread during PDF load
- [ ] Error states display correctly (file not found, load failure)
- [ ] Toggle only appears when PDF is available
- [ ] LeftPanel shell renders and collapses
- [ ] Touch gestures detected on mobile (console log verification)
- [ ] File size warning appears in console for >100MB PDFs

**Implementation Note**: Pause after automated verification passes for manual confirmation before proceeding to Phase 2.

### Service Restarts:
- [ ] Next.js: Auto-reload should handle client component changes
- [ ] Supabase: No schema changes, no restart needed
- [ ] Worker: No worker changes, no restart needed

---

## Phase 2: Text Layer & Metadata Display (Week 3-4)

### Overview

Enable text selection in PDF viewer, extract selection coordinates, add Metadata tab to LeftPanel. Prepare for annotation creation with mobile touch selection support.

### Changes Required

#### 1. PDF Selection Hook

**File**: `src/hooks/usePDFSelection.ts` (new)
**Changes**: Track text selection with PDF coordinates

```typescript
'use client'

import { useState, useEffect, useCallback } from 'react'

export interface PDFSelection {
  text: string
  pageNumber: number
  rect: DOMRect
  // PDF.js coordinates (bottom-left origin)
  pdfRect: {
    x: number
    y: number
    width: number
    height: number
    pageNumber: number
  }
}

interface UsePDFSelectionOptions {
  enabled?: boolean
  pageNumber: number
}

export function usePDFSelection({
  enabled = true,
  pageNumber,
}: UsePDFSelectionOptions) {
  const [selection, setSelection] = useState<PDFSelection | null>(null)
  const [longPressActive, setLongPressActive] = useState(false)

  useEffect(() => {
    if (!enabled) return

    function handleSelectionChange() {
      const browserSelection = window.getSelection()
      const selectedText = browserSelection?.toString().trim()

      if (!selectedText || selectedText.length === 0) {
        setSelection(null)
        return
      }

      // Get selection rect
      const range = browserSelection!.getRangeAt(0)
      const rect = range.getBoundingClientRect()

      // Find PDF page element to get viewport transform
      const pageElement = range.commonAncestorContainer.parentElement?.closest('.react-pdf__Page')

      if (!pageElement) {
        console.warn('[usePDFSelection] Could not find PDF page element')
        return
      }

      // Get page canvas to calculate PDF coordinates
      const canvas = pageElement.querySelector('canvas')
      if (!canvas) return

      const canvasRect = canvas.getBoundingClientRect()

      // Calculate relative position within canvas
      const relativeX = rect.left - canvasRect.left
      const relativeY = rect.top - canvasRect.top

      // Convert to PDF coordinates (requires viewport transform from PDF.js)
      // For now, store screen coordinates - will enhance in Phase 3
      const pdfRect = {
        x: relativeX,
        y: relativeY,
        width: rect.width,
        height: rect.height,
        pageNumber,
      }

      setSelection({
        text: selectedText,
        pageNumber,
        rect,
        pdfRect,
      })
    }

    // Mobile: Long-press detection
    function handleTouchStart(e: TouchEvent) {
      const timeout = setTimeout(() => {
        setLongPressActive(true)
        console.log('[usePDFSelection] Long-press detected - selection mode active')
      }, 500)

      function handleTouchEnd() {
        clearTimeout(timeout)
        setLongPressActive(false)
      }

      e.target?.addEventListener('touchend', handleTouchEnd, { once: true })
    }

    document.addEventListener('selectionchange', handleSelectionChange)
    document.addEventListener('touchstart', handleTouchStart)

    return () => {
      document.removeEventListener('selectionchange', handleSelectionChange)
      document.removeEventListener('touchstart', handleTouchStart)
    }
  }, [enabled, pageNumber])

  const clearSelection = useCallback(() => {
    window.getSelection()?.removeAllRanges()
    setSelection(null)
  }, [])

  return { selection, clearSelection, longPressActive }
}
```

#### 2. Update PDFViewer with Selection

**File**: `src/components/rhizome/pdf-viewer/PDFViewer.tsx`
**Changes**: Add text selection tracking

```typescript
import { usePDFSelection } from '@/hooks/usePDFSelection'

export function PDFViewer({ fileUrl, documentId }: PDFViewerProps) {
  const [numPages, setNumPages] = useState<number>(0)
  const [pageNumber, setPageNumber] = useState(1)
  const [scale, setScale] = useState(1.0)

  // 🆕 ADD: Text selection tracking
  const { selection, clearSelection, longPressActive } = usePDFSelection({
    enabled: true,
    pageNumber,
  })

  // 🆕 ADD: Log selection for testing
  useEffect(() => {
    if (selection) {
      console.log('[PDFViewer] Text selected:', {
        text: selection.text.substring(0, 50),
        page: selection.pageNumber,
        rect: selection.pdfRect,
      })
    }
  }, [selection])

  return (
    <div className="pdf-viewer-container flex flex-col h-full">
      {/* Existing controls */}

      {/* 🆕 ADD: Selection indicator */}
      {selection && (
        <div className="bg-blue-50 dark:bg-blue-900/20 border-b px-4 py-2 text-sm">
          Selected: "{selection.text.substring(0, 60)}{selection.text.length > 60 ? '...' : ''}"
          <button
            onClick={clearSelection}
            className="ml-4 text-blue-600 hover:underline"
          >
            Clear
          </button>
        </div>
      )}

      {/* 🆕 ADD: Long-press indicator for mobile */}
      {longPressActive && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-blue-600 text-white px-4 py-2 rounded-full text-xs">
          Selection Mode Active
        </div>
      )}

      {/* PDF document with text layer enabled */}
      <div className="pdf-content flex-1 overflow-auto flex items-center justify-center bg-gray-100 dark:bg-gray-900">
        <Document
          file={fileUrl}
          onLoadSuccess={onDocumentLoadSuccess}
        >
          <Page
            pageNumber={pageNumber}
            scale={scale}
            renderTextLayer={true}  // ✅ Text layer for selection
            renderAnnotationLayer={true}
          />
        </Document>
      </div>
    </div>
  )
}
```

#### 3. Metadata Tab Component

**File**: `src/components/layout/tabs/MetadataTab.tsx` (new)
**Changes**: Display PDF metadata and Rhizome stats

```typescript
'use client'

import { useEffect, useState } from 'react'

interface MetadataTabProps {
  documentId: string
  pdfMetadata?: any
}

export function MetadataTab({ documentId, pdfMetadata }: MetadataTabProps) {
  const [rhizomeStats, setRhizomeStats] = useState<any>(null)

  useEffect(() => {
    // Fetch Rhizome-specific stats from database
    async function loadStats() {
      try {
        // Will implement in Phase 3 - fetch chunk count, connection count, etc.
        console.log('[MetadataTab] Loading Rhizome stats for', documentId)
      } catch (error) {
        console.error('[MetadataTab] Failed to load stats:', error)
      }
    }
    loadStats()
  }, [documentId])

  return (
    <div className="p-4 space-y-6">
      {/* PDF Metadata */}
      <div>
        <h3 className="text-sm font-semibold mb-3">PDF Information</h3>
        <div className="space-y-2 text-sm">
          {pdfMetadata?.title && (
            <div>
              <span className="text-muted-foreground">Title:</span>
              <p className="mt-1">{pdfMetadata.title}</p>
            </div>
          )}
          {pdfMetadata?.author && (
            <div>
              <span className="text-muted-foreground">Author:</span>
              <p className="mt-1">{pdfMetadata.author}</p>
            </div>
          )}
          {pdfMetadata?.creator && (
            <div>
              <span className="text-muted-foreground">Creator:</span>
              <p className="mt-1">{pdfMetadata.creator}</p>
            </div>
          )}
          {pdfMetadata?.pageCount && (
            <div>
              <span className="text-muted-foreground">Pages:</span>
              <p className="mt-1">{pdfMetadata.pageCount}</p>
            </div>
          )}
        </div>
      </div>

      {/* Rhizome Stats */}
      <div>
        <h3 className="text-sm font-semibold mb-3">Rhizome Statistics</h3>
        <div className="space-y-2 text-sm">
          {/* Will populate in Phase 3 */}
          <p className="text-muted-foreground text-xs">
            Chunk count, connection count, and processing details will appear here.
          </p>
        </div>
      </div>
    </div>
  )
}
```

#### 4. Update LeftPanel with Metadata Tab

**File**: `src/components/layout/LeftPanel.tsx`
**Changes**: Add Metadata tab

```typescript
'use client'

import { useUIStore } from '@/stores/ui-store'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/rhizome/tabs'
import { MetadataTab } from './tabs/MetadataTab'

interface LeftPanelProps {
  documentId: string
  pdfMetadata?: any  // 🆕 ADD
}

export function LeftPanel({ documentId, pdfMetadata }: LeftPanelProps) {
  const isOpen = useUIStore(state => state.leftPanelOpen)
  const activeTab = useUIStore(state => state.leftPanelTab)
  const setActiveTab = useUIStore(state => state.setLeftPanelTab)

  if (!isOpen) return null

  return (
    <div className="w-[300px] border-r bg-background overflow-hidden flex flex-col">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
        <TabsList className="w-full justify-start border-b rounded-none p-1">
          <TabsTrigger value="metadata" className="text-xs">Metadata</TabsTrigger>
          {/* More tabs in Phases 4-5 */}
        </TabsList>

        <TabsContent value="metadata" className="flex-1 overflow-auto">
          <MetadataTab documentId={documentId} pdfMetadata={pdfMetadata} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
```

### Success Criteria

#### Automated Verification:
- [ ] Type check: `npm run type-check` passes with new hook
- [ ] Build: `npm run build` succeeds
- [ ] Lint: `npm run lint` passes

#### Manual Verification:
- [ ] Text selection works on PDF pages
- [ ] Selection indicator appears with selected text
- [ ] Clear selection button works
- [ ] Selection coordinates logged to console
- [ ] Text layer aligns with PDF canvas (no misalignment)
- [ ] Selection works across multiple lines
- [ ] Selection works with different zoom levels
- [ ] Metadata tab in LeftPanel shows PDF info
- [ ] Long-press detection works on mobile (console log + UI indicator)

**Implementation Note**: Phase 2 focuses on selection infrastructure. Annotation creation comes in Phase 3.

### Service Restarts:
- [ ] Next.js: Auto-reload for new components/hooks

---

## Phase 3: ECS Annotation Integration (Week 5-6)

### Overview

Integrate PDF viewer with existing ECS annotation system. Store PDF coordinates in Position component, enable annotation creation via QuickCapturePanel, display annotation overlays on PDF pages. Support mobile annotation creation with bottom sheet.

### Changes Required

#### 1. Extend Position Component

**File**: `src/lib/ecs/components.ts:16-44`
**Changes**: Add optional PDF coordinate fields (no migration needed - JSONB accepts dynamically)

```typescript
export interface PositionComponent extends Component {
  // Existing markdown offset fields
  documentId: string
  document_id: string
  startOffset: number
  endOffset: number
  originalText: string
  pageLabel?: string

  // PDF coordinate fields (all optional - null for markdown-only annotations)
  pdfPageNumber?: number | null  // 🆕 ADD: PDF page (1-indexed)
  pdfX?: number | null           // 🆕 ADD: X coordinate (PDF coordinate system)
  pdfY?: number | null           // 🆕 ADD: Y coordinate (PDF coordinate system)
  pdfWidth?: number | null       // 🆕 ADD: Selection width
  pdfHeight?: number | null      // 🆕 ADD: Selection height

  // Existing recovery fields
  textContext?: { before: string; after: string }
  originalChunkIndex?: number
  recoveryConfidence: number
  recoveryMethod: 'exact' | 'context' | 'chunk_bounded' | 'lost'
  needsReview: boolean
}
```

**Note**: No migration required! JSONB components accept new fields dynamically. If we want to formalize later, can create migration.

#### 2. Update CreateAnnotationInput

**File**: `src/lib/ecs/annotations.ts:22-58`
**Changes**: Accept PDF coordinates

```typescript
export interface CreateAnnotationInput {
  documentId: string
  startOffset: number
  endOffset: number
  originalText: string
  chunkIds: string[]
  chunkPosition?: number
  type: VisualComponent['type']
  color?: VisualComponent['color']
  note?: string
  tags?: string[]
  pageLabel?: string
  textContext?: { before: string; after: string }
  originalChunkIndex?: number
  sparkRefs?: string[]

  // 🆕 ADD: PDF coordinate fields (optional)
  pdfPageNumber?: number
  pdfX?: number
  pdfY?: number
  pdfWidth?: number
  pdfHeight?: number
}
```

#### 3. Update AnnotationOperations.create()

**File**: `src/lib/ecs/annotations.ts:104-146`
**Changes**: Store PDF coordinates in Position component

```typescript
async create(input: CreateAnnotationInput): Promise<string> {
  const now = new Date().toISOString()
  const primaryChunkId = input.chunkIds[0]

  const entityId = await this.ecs.createEntity(this.userId, {
    Position: {
      documentId: input.documentId,
      document_id: input.documentId,
      startOffset: input.startOffset,
      endOffset: input.endOffset,
      originalText: input.originalText,
      pageLabel: input.pageLabel,
      textContext: input.textContext,
      originalChunkIndex: input.originalChunkIndex,

      // 🆕 ADD: PDF coordinates (optional)
      pdfPageNumber: input.pdfPageNumber ?? null,
      pdfX: input.pdfX ?? null,
      pdfY: input.pdfY ?? null,
      pdfWidth: input.pdfWidth ?? null,
      pdfHeight: input.pdfHeight ?? null,

      // Recovery fields
      recoveryConfidence: 1.0,
      recoveryMethod: 'exact',
      needsReview: false,
    },
    Visual: {
      type: input.type,
      color: input.color || 'yellow',
    },
    Content: {
      note: input.note,
      tags: input.tags || [],
      sparkRefs: input.sparkRefs || [],
    },
    Temporal: {
      created_at: now,
      updated_at: now,
    },
    ChunkRef: {
      chunk_ids: input.chunkIds,
      document_id: input.documentId,
      primary_chunk_id: primaryChunkId,
      chunk_position: input.chunkPosition,
    },
  }, 'annotation')

  return entityId
}
```

#### 4. Annotation Overlay Component

**File**: `src/components/rhizome/pdf-viewer/PDFAnnotationOverlay.tsx` (new)
**Changes**: Render annotation highlights on PDF pages

```typescript
'use client'

import { useMemo } from 'react'
import type { AnnotationEntity } from '@/types/annotations'

interface PDFAnnotationOverlayProps {
  annotations: AnnotationEntity[]
  pageNumber: number
  scale: number
  onAnnotationClick?: (annotationId: string) => void
}

export function PDFAnnotationOverlay({
  annotations,
  pageNumber,
  scale,
  onAnnotationClick,
}: PDFAnnotationOverlayProps) {
  // Filter annotations for this page
  const pageAnnotations = useMemo(() => {
    return annotations.filter(ann => {
      const position = ann.components.Position
      return position?.pdfPageNumber === pageNumber
    })
  }, [annotations, pageNumber])

  if (pageAnnotations.length === 0) {
    return null
  }

  return (
    <div className="absolute inset-0 pointer-events-none">
      {pageAnnotations.map(annotation => {
        const position = annotation.components.Position
        const visual = annotation.components.Visual

        if (!position?.pdfX || !position?.pdfY) {
          return null // Skip annotations without PDF coordinates
        }

        // Apply scale to coordinates
        const x = position.pdfX * scale
        const y = position.pdfY * scale
        const width = (position.pdfWidth ?? 0) * scale
        const height = (position.pdfHeight ?? 0) * scale

        return (
          <div
            key={annotation.id}
            data-annotation-id={annotation.id}
            className="absolute pointer-events-auto cursor-pointer transition-opacity hover:opacity-80"
            style={{
              left: `${x}px`,
              top: `${y}px`,
              width: `${width}px`,
              height: `${height}px`,
              backgroundColor: getColorValue(visual?.color || 'yellow', 0.3),
              border: `2px solid ${getColorValue(visual?.color || 'yellow', 0.6)}`,
            }}
            onClick={() => onAnnotationClick?.(annotation.id)}
            title={annotation.components.Content?.note || 'Click to edit'}
          />
        )
      })}
    </div>
  )
}

function getColorValue(color: string, opacity: number): string {
  const colors: Record<string, string> = {
    yellow: `rgba(254, 240, 138, ${opacity})`,
    green: `rgba(187, 247, 208, ${opacity})`,
    blue: `rgba(191, 219, 254, ${opacity})`,
    red: `rgba(254, 202, 202, ${opacity})`,
    purple: `rgba(233, 213, 255, ${opacity})`,
    orange: `rgba(254, 215, 170, ${opacity})`,
    pink: `rgba(251, 207, 232, ${opacity})`,
  }
  return colors[color] || colors.yellow
}
```

#### 5. Update PDFViewer with Annotations

**File**: `src/components/rhizome/pdf-viewer/PDFViewer.tsx`
**Changes**: Load annotations, display overlays, handle clicks

```typescript
import { useEffect, useState } from 'react'
import { useAnnotationStore } from '@/stores/annotation-store'
import { getAnnotations } from '@/app/actions/annotations'
import { PDFAnnotationOverlay } from './PDFAnnotationOverlay'
import { Sheet, SheetContent } from '@/components/rhizome/sheet'
import { useMediaQuery } from '@/hooks/use-media-query'

interface PDFViewerProps {
  fileUrl: string
  documentId: string
}

export function PDFViewer({ fileUrl, documentId }: PDFViewerProps) {
  const [numPages, setNumPages] = useState<number>(0)
  const [pageNumber, setPageNumber] = useState(1)
  const [scale, setScale] = useState(1.0)
  const isMobile = useMediaQuery('(max-width: 768px)')

  // Text selection
  const { selection, clearSelection } = usePDFSelection({ enabled: true, pageNumber })

  // 🆕 ADD: Annotation store
  const annotations = useAnnotationStore(
    state => state.annotations[documentId] ?? []
  )
  const setAnnotations = useAnnotationStore(state => state.setAnnotations)

  // 🆕 ADD: Load annotations on mount
  useEffect(() => {
    async function loadAnnotations() {
      try {
        const annotations = await getAnnotations(documentId)
        setAnnotations(documentId, annotations)
      } catch (error) {
        console.error('[PDFViewer] Failed to load annotations:', error)
      }
    }
    loadAnnotations()
  }, [documentId, setAnnotations])

  // 🆕 ADD: Annotation click handler
  const handleAnnotationClick = (annotationId: string) => {
    console.log('[PDFViewer] Annotation clicked:', annotationId)
    // TODO: Open edit panel
  }

  return (
    <div className="pdf-viewer-container flex flex-col h-full">
      {/* Controls */}

      {/* PDF document with annotation overlay */}
      <div className="pdf-content flex-1 overflow-auto flex items-center justify-center bg-gray-100 dark:bg-gray-900">
        <div className="relative">
          <Document
            file={fileUrl}
            onLoadSuccess={onDocumentLoadSuccess}
          >
            <Page
              pageNumber={pageNumber}
              scale={scale}
              renderTextLayer={true}
              renderAnnotationLayer={true}
            />
          </Document>

          {/* 🆕 ADD: Annotation overlay layer */}
          <PDFAnnotationOverlay
            annotations={annotations}
            pageNumber={pageNumber}
            scale={scale}
            onAnnotationClick={handleAnnotationClick}
          />
        </div>
      </div>

      {/* 🆕 ADD: QuickCapturePanel - Desktop: Floating, Mobile: Bottom Sheet */}
      {selection && (
        isMobile ? (
          <Sheet open={!!selection} onOpenChange={() => clearSelection()}>
            <SheetContent side="bottom">
              <QuickCapturePanel
                selection={{
                  text: selection.text,
                  range: {
                    startOffset: 0, // Not used for PDF
                    endOffset: 0,
                    chunkIds: [], // Will be calculated
                  },
                  rect: selection.rect,
                  pdfCoordinates: selection.pdfRect,
                }}
                documentId={documentId}
                onClose={() => clearSelection()}
                chunks={[]}
                markdown=""
                mode="create"
              />
            </SheetContent>
          </Sheet>
        ) : (
          <QuickCapturePanel
            selection={{
              text: selection.text,
              range: {
                startOffset: 0,
                endOffset: 0,
                chunkIds: [],
              },
              rect: selection.rect,
              pdfCoordinates: selection.pdfRect,
            }}
            documentId={documentId}
            onClose={() => clearSelection()}
            chunks={[]}
            markdown=""
            mode="create"
          />
        )
      )}
    </div>
  )
}
```

#### 6. Update QuickCapturePanel for PDF Mode

**File**: `src/components/reader/QuickCapturePanel.tsx`
**Changes**: Handle PDF coordinate storage

```typescript
interface QuickCapturePanelProps {
  selection: TextSelection & {
    pdfCoordinates?: {  // 🆕 ADD
      x: number
      y: number
      width: number
      height: number
      pageNumber: number
    }
  }
  documentId: string
  onClose: () => void
  // ...
}

export function QuickCapturePanel({
  selection,
  documentId,
  // ...
}: QuickCapturePanelProps) {
  // ... existing state

  const handleSave = async () => {
    // Build annotation data
    const annotationData: CreateAnnotationInput = {
      documentId,
      startOffset: selection.range.startOffset,
      endOffset: selection.range.endOffset,
      originalText: selection.text,
      chunkIds: selection.range.chunkIds,
      type: 'highlight',
      color: selectedColor,
      note,
      tags,

      // 🆕 ADD: PDF coordinates if present
      ...(selection.pdfCoordinates && {
        pdfPageNumber: selection.pdfCoordinates.pageNumber,
        pdfX: selection.pdfCoordinates.x,
        pdfY: selection.pdfCoordinates.y,
        pdfWidth: selection.pdfCoordinates.width,
        pdfHeight: selection.pdfCoordinates.height,
      }),
    }

    // Call createAnnotation server action
    const result = await createAnnotation(annotationData)

    // ... handle result
  }

  // ... rest of component
}
```

### Success Criteria

#### Automated Verification:
- [ ] Type check: `npm run type-check` passes with updated Position component
- [ ] Build: `npm run build` succeeds
- [ ] Lint: `npm run lint` passes

#### Manual Verification:
- [ ] Select text in PDF → QuickCapturePanel appears
- [ ] Create annotation → Stores PDF coordinates in Position component
- [ ] Annotation overlay appears on correct page at correct position
- [ ] Click annotation → Logs annotation ID
- [ ] Switch to Markdown view → Same annotation not visible (no markdown offsets for PDF-only annotations)
- [ ] Annotations persist after page reload
- [ ] Multiple annotations on same page render correctly
- [ ] Annotations scale correctly with zoom in/out
- [ ] Mobile: Bottom sheet appears for annotation creation
- [ ] Mobile: Touch interactions work smoothly

**Implementation Note**: Phase 3 establishes annotation creation. Editing and advanced features come in later phases.

### Service Restarts:
- [ ] Next.js: Auto-reload for component changes

---

## Phase 4: Chunk Visualization with Bboxes (Week 7-8)

### Overview

Render chunk boundaries on PDF pages using Docling-extracted bboxes. Enable chunk navigation from ChunksTab → PDF page. Add Outline tab to LeftPanel. Visual feedback for chunks with connections.

### Changes Required

#### 1. Chunk Overlay Component

**File**: `src/components/rhizome/pdf-viewer/PDFChunkOverlay.tsx` (new)
**Changes**: Render chunk boundaries on PDF pages

```typescript
'use client'

import { useMemo, useState } from 'react'
import type { Chunk } from '@/types/annotations'

interface PDFChunkOverlayProps {
  chunks: Chunk[]
  pageNumber: number
  scale: number
  highlightedChunkId?: string | null
  onChunkClick?: (chunkId: string) => void
}

interface BBox {
  page: number
  x: number
  y: number
  width: number
  height: number
}

export function PDFChunkOverlay({
  chunks,
  pageNumber,
  scale,
  highlightedChunkId,
  onChunkClick,
}: PDFChunkOverlayProps) {
  const [hoveredChunkId, setHoveredChunkId] = useState<string | null>(null)

  // Filter chunks for this page
  const pageChunks = useMemo(() => {
    return chunks.filter(chunk => {
      // Check if chunk overlaps this page
      if (chunk.page_start && chunk.page_end) {
        return pageNumber >= chunk.page_start && pageNumber <= chunk.page_end
      }
      return false
    })
  }, [chunks, pageNumber])

  if (pageChunks.length === 0) {
    return null
  }

  return (
    <div className="absolute inset-0 pointer-events-none">
      {pageChunks.map(chunk => {
        const isHighlighted = chunk.id === highlightedChunkId
        const isHovered = chunk.id === hoveredChunkId

        // Parse bboxes from JSONB
        const bboxes: BBox[] = chunk.bboxes ? (Array.isArray(chunk.bboxes) ? chunk.bboxes : []) : []

        // Filter bboxes for this page
        const pageBboxes = bboxes.filter(bbox => bbox.page === pageNumber)

        if (pageBboxes.length === 0) {
          // Fallback: whole-page indicator if no precise bboxes
          return (
            <div
              key={chunk.id}
              className="absolute top-0 left-0 right-0 h-1 pointer-events-auto cursor-pointer transition-all"
              style={{
                backgroundColor: isHighlighted || isHovered
                  ? 'rgba(59, 130, 246, 0.5)'  // blue
                  : 'rgba(156, 163, 175, 0.2)', // gray
              }}
              onMouseEnter={() => setHoveredChunkId(chunk.id)}
              onMouseLeave={() => setHoveredChunkId(null)}
              onClick={() => onChunkClick?.(chunk.id)}
              title={`Chunk ${chunk.chunk_index}`}
            />
          )
        }

        // Render precise bboxes
        return pageBboxes.map((bbox, idx) => {
          const x = bbox.x * scale
          const y = bbox.y * scale
          const width = bbox.width * scale
          const height = bbox.height * scale

          return (
            <div
              key={`${chunk.id}-${idx}`}
              data-chunk-id={chunk.id}
              className="absolute pointer-events-auto cursor-pointer transition-all"
              style={{
                left: `${x}px`,
                top: `${y}px`,
                width: `${width}px`,
                height: `${height}px`,
                border: isHighlighted
                  ? '3px solid rgba(59, 130, 246, 0.8)'  // blue, thick
                  : isHovered
                  ? '2px solid rgba(59, 130, 246, 0.5)'  // blue, medium
                  : '1px solid rgba(156, 163, 175, 0.3)', // gray, thin
                backgroundColor: isHighlighted || isHovered
                  ? 'rgba(59, 130, 246, 0.1)'
                  : 'transparent',
                borderRadius: '2px',
              }}
              onMouseEnter={() => setHoveredChunkId(chunk.id)}
              onMouseLeave={() => setHoveredChunkId(null)}
              onClick={() => onChunkClick?.(chunk.id)}
              title={`Chunk ${chunk.chunk_index}${chunk.summary ? `: ${chunk.summary.substring(0, 60)}...` : ''}`}
            />
          )
        })
      })}
    </div>
  )
}
```

#### 2. Update PDFViewer with Chunk Overlay

**File**: `src/components/rhizome/pdf-viewer/PDFViewer.tsx`
**Changes**: Add chunk visualization layer

```typescript
import { PDFChunkOverlay } from './PDFChunkOverlay'

interface PDFViewerProps {
  fileUrl: string
  documentId: string
  chunks: Chunk[]  // 🆕 ADD: Pass chunks
  highlightedChunkId?: string | null  // 🆕 ADD: For navigation highlighting
  onSelectionChange?: (selection: PDFSelection | null) => void
}

export function PDFViewer({
  fileUrl,
  documentId,
  chunks,
  highlightedChunkId,
  onSelectionChange,
}: PDFViewerProps) {
  const [numPages, setNumPages] = useState<number>(0)
  const [pageNumber, setPageNumber] = useState(1)
  const [scale, setScale] = useState(1.0)

  // Selection
  const { selection, clearSelection } = usePDFSelection({ enabled: true, pageNumber })

  // Annotations
  const annotations = useAnnotationStore(state => state.annotations[documentId] ?? [])

  // 🆕 ADD: Notify parent of selection changes
  useEffect(() => {
    onSelectionChange?.(selection)
  }, [selection, onSelectionChange])

  // 🆕 ADD: Chunk click handler
  const handleChunkClick = (chunkId: string) => {
    console.log('[PDFViewer] Chunk clicked:', chunkId)
    // TODO: Navigate to chunk in sidebar or show chunk details
  }

  return (
    <div className="pdf-viewer-container flex flex-col h-full">
      {/* Controls */}

      <div className="pdf-content flex-1 overflow-auto flex items-center justify-center bg-gray-100 dark:bg-gray-900">
        <div className="relative">
          <Document file={fileUrl} onLoadSuccess={onDocumentLoadSuccess}>
            <Page
              pageNumber={pageNumber}
              scale={scale}
              renderTextLayer={true}
              renderAnnotationLayer={true}
            />
          </Document>

          {/* Annotation overlay (underneath chunks) */}
          <PDFAnnotationOverlay
            annotations={annotations}
            pageNumber={pageNumber}
            scale={scale}
            onAnnotationClick={handleAnnotationClick}
          />

          {/* 🆕 ADD: Chunk overlay (on top of annotations) */}
          <PDFChunkOverlay
            chunks={chunks}
            pageNumber={pageNumber}
            scale={scale}
            highlightedChunkId={highlightedChunkId}
            onChunkClick={handleChunkClick}
          />
        </div>
      </div>
    </div>
  )
}
```

#### 3. Outline Tab Component

**File**: `src/components/layout/tabs/OutlineTab.tsx` (new)
**Changes**: Display PDF outline (table of contents)

```typescript
'use client'

interface OutlineTabProps {
  outline?: any[]
  onPageNavigate?: (page: number) => void
}

export function OutlineTab({ outline, onPageNavigate }: OutlineTabProps) {
  if (!outline || outline.length === 0) {
    return (
      <div className="p-4">
        <p className="text-sm text-muted-foreground">
          No outline available for this PDF.
        </p>
      </div>
    )
  }

  return (
    <div className="p-4">
      <ul className="space-y-1">
        {outline.map((item, idx) => (
          <li key={idx}>
            <button
              onClick={() => item.dest && onPageNavigate?.(item.dest.page)}
              className="text-left w-full px-2 py-1 text-sm hover:bg-muted rounded transition-colors"
              style={{ paddingLeft: `${(item.level || 0) * 12 + 8}px` }}
            >
              {item.title}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
```

#### 4. Update LeftPanel with Outline Tab

**File**: `src/components/layout/LeftPanel.tsx`
**Changes**: Add Outline tab

```typescript
'use client'

import { useUIStore } from '@/stores/ui-store'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/rhizome/tabs'
import { MetadataTab } from './tabs/MetadataTab'
import { OutlineTab } from './tabs/OutlineTab'

interface LeftPanelProps {
  documentId: string
  pdfMetadata?: any
  outline?: any[]  // 🆕 ADD
  onPageNavigate?: (page: number) => void  // 🆕 ADD
}

export function LeftPanel({
  documentId,
  pdfMetadata,
  outline,
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
          {/* More tabs in Phase 5 */}
        </TabsList>

        <TabsContent value="metadata" className="flex-1 overflow-auto">
          <MetadataTab documentId={documentId} pdfMetadata={pdfMetadata} />
        </TabsContent>

        <TabsContent value="outline" className="flex-1 overflow-auto">
          <OutlineTab outline={outline} onPageNavigate={onPageNavigate} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
```

#### 5. Navigation from ChunksTab

**File**: `src/components/sidebar/ChunksTab.tsx`
**Changes**: Add "View in PDF" button

```typescript
export function ChunksTab({
  documentId,
  chunks,
  onNavigateToChunk,
  viewerMode,  // 🆕 ADD: Know which mode we're in
}: ChunksTabProps) {
  // ... existing chunk list rendering

  return (
    <div className="p-4 space-y-2">
      {chunks.map(chunk => (
        <div key={chunk.id} className="border rounded p-3">
          {/* Chunk info */}
          <div className="flex items-start justify-between">
            <div>
              <div className="text-sm font-medium">Chunk {chunk.chunk_index}</div>
              {chunk.page_start && (
                <div className="text-xs text-muted-foreground">
                  Pages {chunk.page_start}-{chunk.page_end}
                </div>
              )}
            </div>

            {/* 🆕 ADD: View in PDF button (only show in PDF mode and if chunk has page info) */}
            {viewerMode === 'pdf' && chunk.page_start && (
              <button
                onClick={() => onNavigateToChunk(chunk.id, 'pdf')}
                className="text-xs px-2 py-1 border rounded hover:bg-muted"
              >
                View in PDF
              </button>
            )}
          </div>

          {/* Chunk summary, themes, etc. */}
        </div>
      ))}
    </div>
  )
}
```

#### 6. Update ReaderLayout with Chunk Navigation

**File**: `src/components/reader/ReaderLayout.tsx:270-338`
**Changes**: Handle PDF page navigation

```typescript
/**
 * Navigate to chunk - handles both markdown and PDF modes.
 */
const handleNavigateToChunk = useCallback((chunkId: string, mode?: 'markdown' | 'pdf') => {
  const chunk = chunks.find(c => c.id === chunkId)

  if (!chunk) {
    toast.error('Chunk not found')
    return
  }

  // 🆕 ADD: Switch to PDF mode if requested
  if (mode === 'pdf' && viewerMode !== 'pdf') {
    setViewerMode('pdf')
  }

  // 🆕 ADD: For PDF mode, navigate to page
  if (viewerMode === 'pdf' || mode === 'pdf') {
    if (!chunk.page_start) {
      toast.error('Chunk has no page information')
      return
    }

    // Set page number in PDFViewer (via ReaderStore or prop)
    setPdfPageNumber(chunk.page_start)
    setHighlightedChunkId(chunk.id)

    // Clear highlight after 2 seconds
    setTimeout(() => {
      setHighlightedChunkId(null)
    }, 2000)

    toast.success(`Navigated to page ${chunk.page_start}`)
    return
  }

  // Existing markdown navigation logic...
  setScrollToChunkId(chunkId)
  // ...
}, [chunks, viewerMode, setViewerMode])
```

#### 7. Update ReaderStore for PDF Navigation

**File**: `src/stores/reader-store.ts`
**Changes**: Add PDF-specific navigation state

```typescript
interface ReaderState {
  // Existing fields...
  documentId: string | null
  documentTitle: string
  markdownContent: string
  chunks: Chunk[]
  scrollPosition: number
  viewportOffsets: { start: number; end: number }

  // 🆕 ADD: PDF viewer state
  pdfPageNumber: number  // Current page in PDF view
  highlightedChunkId: string | null  // Temporarily highlighted chunk

  // Actions
  setPdfPageNumber: (page: number) => void
  setHighlightedChunkId: (chunkId: string | null) => void
  // ... existing actions
}

export const useReaderStore = create<ReaderState>()(
  persist(
    (set, get) => ({
      // Initial state
      documentId: null,
      markdownContent: '',
      chunks: [],
      pdfPageNumber: 1,
      highlightedChunkId: null,

      // PDF navigation
      setPdfPageNumber: (page) => set({ pdfPageNumber: page }),
      setHighlightedChunkId: (chunkId) => set({ highlightedChunkId: chunkId }),

      // ... existing actions
    }),
    {
      name: 'reader-storage',
      partialize: (state) => ({
        documentId: state.documentId,
        scrollPosition: state.scrollPosition,
        pdfPageNumber: state.pdfPageNumber,  // 🆕 ADD: Persist page number
      }),
    }
  )
)
```

### Success Criteria

#### Automated Verification:
- [ ] Type check: `npm run type-check` passes
- [ ] Build: `npm run build` succeeds
- [ ] Lint: `npm run lint` passes

#### Manual Verification:
- [ ] Chunk boundaries render on PDF pages (with bboxes)
- [ ] Fallback indicators show for chunks without bboxes
- [ ] Hover over chunk → Border highlights
- [ ] Click chunk → Logs chunk ID
- [ ] Navigate from ChunksTab → PDF scrolls to correct page
- [ ] Highlighted chunk has thicker blue border for 2 seconds
- [ ] Chunks scale correctly with zoom in/out
- [ ] Multiple chunks on same page render correctly
- [ ] Chunk tooltips show chunk index and summary
- [ ] Outline tab in LeftPanel shows PDF TOC
- [ ] Click outline item → Navigates to page

### Service Restarts:
- [ ] Next.js: Auto-reload for new components

---

## Phase 5: Connection Integration & Heatmap (Week 9-10)

### Overview

Display connections in PDF view using existing ConnectionStore. Show connection indicators on chunks with connections. Enable navigation between connected chunks across pages. Move ConnectionHeatmap to LeftPanel, add Thumbnails tab.

### Changes Required

#### 1. Enhance Chunk Overlay with Connection Indicators

**File**: `src/components/rhizome/pdf-viewer/PDFChunkOverlay.tsx`
**Changes**: Add visual indicators for chunks with connections

```typescript
interface PDFChunkOverlayProps {
  chunks: Chunk[]
  pageNumber: number
  scale: number
  highlightedChunkId?: string | null
  connections: Connection[]  // 🆕 ADD: Connections for visual indicators
  onChunkClick?: (chunkId: string) => void
}

export function PDFChunkOverlay({
  chunks,
  pageNumber,
  scale,
  highlightedChunkId,
  connections,  // 🆕 ADD
  onChunkClick,
}: PDFChunkOverlayProps) {
  const [hoveredChunkId, setHoveredChunkId] = useState<string | null>(null)

  // Filter chunks for this page
  const pageChunks = useMemo(() => {
    return chunks.filter(chunk => {
      if (chunk.page_start && chunk.page_end) {
        return pageNumber >= chunk.page_start && pageNumber <= chunk.page_end
      }
      return false
    })
  }, [chunks, pageNumber])

  // 🆕 ADD: Calculate connection counts per chunk
  const chunkConnectionCounts = useMemo(() => {
    const counts = new Map<string, number>()

    connections.forEach(conn => {
      const sourceCount = counts.get(conn.source_chunk_id) || 0
      const targetCount = counts.get(conn.target_chunk_id) || 0

      counts.set(conn.source_chunk_id, sourceCount + 1)
      counts.set(conn.target_chunk_id, targetCount + 1)
    })

    return counts
  }, [connections])

  return (
    <div className="absolute inset-0 pointer-events-none">
      {pageChunks.map(chunk => {
        const isHighlighted = chunk.id === highlightedChunkId
        const isHovered = chunk.id === hoveredChunkId
        const connectionCount = chunkConnectionCounts.get(chunk.id) || 0
        const hasConnections = connectionCount > 0

        const bboxes: BBox[] = chunk.bboxes ? (Array.isArray(chunk.bboxes) ? chunk.bboxes : []) : []
        const pageBboxes = bboxes.filter(bbox => bbox.page === pageNumber)

        if (pageBboxes.length === 0) {
          // Fallback: whole-page indicator
          return (
            <div
              key={chunk.id}
              className="absolute top-0 left-0 right-0 h-1 pointer-events-auto cursor-pointer transition-all"
              style={{
                backgroundColor: hasConnections
                  ? 'rgba(59, 130, 246, 0.6)'  // Blue if has connections
                  : 'rgba(156, 163, 175, 0.2)',
              }}
              onMouseEnter={() => setHoveredChunkId(chunk.id)}
              onMouseLeave={() => setHoveredChunkId(null)}
              onClick={() => onChunkClick?.(chunk.id)}
              title={`Chunk ${chunk.chunk_index}${hasConnections ? ` (${connectionCount} connections)` : ''}`}
            />
          )
        }

        // Render precise bboxes with connection indicators
        return pageBboxes.map((bbox, idx) => {
          const x = bbox.x * scale
          const y = bbox.y * scale
          const width = bbox.width * scale
          const height = bbox.height * scale

          return (
            <div key={`${chunk.id}-${idx}`} className="absolute">
              {/* Chunk boundary */}
              <div
                data-chunk-id={chunk.id}
                className="pointer-events-auto cursor-pointer transition-all"
                style={{
                  position: 'absolute',
                  left: `${x}px`,
                  top: `${y}px`,
                  width: `${width}px`,
                  height: `${height}px`,
                  border: isHighlighted
                    ? '3px solid rgba(59, 130, 246, 0.8)'
                    : hasConnections
                    ? '2px solid rgba(59, 130, 246, 0.5)'  // 🆕 Thicker border if has connections
                    : isHovered
                    ? '2px solid rgba(156, 163, 175, 0.5)'
                    : '1px solid rgba(156, 163, 175, 0.3)',
                  backgroundColor: isHighlighted || isHovered
                    ? 'rgba(59, 130, 246, 0.1)'
                    : hasConnections
                    ? 'rgba(59, 130, 246, 0.05)'  // 🆕 Subtle blue tint
                    : 'transparent',
                  borderRadius: '2px',
                }}
                onMouseEnter={() => setHoveredChunkId(chunk.id)}
                onMouseLeave={() => setHoveredChunkId(null)}
                onClick={() => onChunkClick?.(chunk.id)}
                title={`Chunk ${chunk.chunk_index}${hasConnections ? ` (${connectionCount} connections)` : ''}${chunk.summary ? `\n${chunk.summary.substring(0, 80)}...` : ''}`}
              />

              {/* 🆕 ADD: Connection count badge (top-right corner) */}
              {hasConnections && (
                <div
                  className="absolute pointer-events-none"
                  style={{
                    left: `${x + width - 20}px`,
                    top: `${y - 10}px`,
                  }}
                >
                  <div className="bg-blue-600 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold shadow-md">
                    {connectionCount}
                  </div>
                </div>
              )}
            </div>
          )
        })
      })}
    </div>
  )
}
```

#### 2. Update PDFViewer with Connections

**File**: `src/components/rhizome/pdf-viewer/PDFViewer.tsx`
**Changes**: Pass connections to chunk overlay

```typescript
import { useConnectionStore } from '@/stores/connection-store'

export function PDFViewer({
  fileUrl,
  documentId,
  chunks,
  highlightedChunkId,
  onSelectionChange,
}: PDFViewerProps) {
  // ... existing state

  // 🆕 ADD: Get connections from store
  const connections = useConnectionStore(state => state.filteredConnections)

  return (
    <div className="pdf-viewer-container flex flex-col h-full">
      {/* Controls */}

      <div className="pdf-content flex-1 overflow-auto flex items-center justify-center bg-gray-100 dark:bg-gray-900">
        <div className="relative">
          <Document file={fileUrl} onLoadSuccess={onDocumentLoadSuccess}>
            <Page
              pageNumber={pageNumber}
              scale={scale}
              renderTextLayer={true}
              renderAnnotationLayer={true}
            />
          </Document>

          <PDFAnnotationOverlay
            annotations={annotations}
            pageNumber={pageNumber}
            scale={scale}
            onAnnotationClick={handleAnnotationClick}
          />

          {/* 🆕 ADD: Pass connections to chunk overlay */}
          <PDFChunkOverlay
            chunks={chunks}
            pageNumber={pageNumber}
            scale={scale}
            highlightedChunkId={highlightedChunkId}
            connections={connections}
            onChunkClick={handleChunkClick}
          />
        </div>
      </div>
    </div>
  )
}
```

#### 3. Heatmap Tab Component

**File**: `src/components/layout/tabs/HeatmapTab.tsx` (new)
**Changes**: Move connection heatmap to LeftPanel

```typescript
'use client'

import { useMemo } from 'react'
import { useConnectionStore } from '@/stores/connection-store'
import type { Chunk } from '@/types/annotations'

interface HeatmapTabProps {
  documentId: string
  currentPage?: number
  chunks: Chunk[]
}

export function HeatmapTab({ documentId, currentPage, chunks }: HeatmapTabProps) {
  const connections = useConnectionStore(state => state.filteredConnections)

  // Calculate density by page
  const pageDensity = useMemo(() => {
    const densityMap = new Map<number, number>()

    chunks.forEach(chunk => {
      if (!chunk.page_start || !chunk.page_end) return

      // Count connections for this chunk
      const chunkConnections = connections.filter(conn =>
        conn.source_chunk_id === chunk.id || conn.target_chunk_id === chunk.id
      )

      // Distribute density across pages
      for (let page = chunk.page_start; page <= chunk.page_end; page++) {
        const current = densityMap.get(page) || 0
        densityMap.set(page, current + chunkConnections.length)
      }
    })

    return densityMap
  }, [chunks, connections])

  if (pageDensity.size === 0) {
    return (
      <div className="p-4">
        <p className="text-sm text-muted-foreground">
          No connections detected yet.
        </p>
      </div>
    )
  }

  const maxDensity = Math.max(...Array.from(pageDensity.values()))

  return (
    <div className="p-4">
      <h3 className="text-sm font-semibold mb-3">Connection Density by Page</h3>
      <div className="space-y-1">
        {Array.from(pageDensity.entries())
          .sort(([a], [b]) => a - b)
          .map(([page, density]) => {
            const percentage = (density / maxDensity) * 100
            const isCurrentPage = page === currentPage

            return (
              <div
                key={page}
                className={`flex items-center gap-2 p-2 rounded transition-colors ${
                  isCurrentPage ? 'bg-blue-50 dark:bg-blue-900/20' : 'hover:bg-muted'
                }`}
              >
                <span className="text-xs font-mono w-12">
                  Page {page}
                </span>
                <div className="flex-1 h-2 bg-gray-200 dark:bg-gray-800 rounded overflow-hidden">
                  <div
                    className="h-full bg-blue-600 transition-all"
                    style={{ width: `${percentage}%` }}
                  />
                </div>
                <span className="text-xs text-muted-foreground w-8 text-right">
                  {density}
                </span>
              </div>
            )
          })}
      </div>
    </div>
  )
}
```

#### 4. Thumbnails Tab Component

**File**: `src/components/layout/tabs/ThumbnailsTab.tsx` (new)
**Changes**: Display page thumbnails for navigation

```typescript
'use client'

import { Page } from 'react-pdf'

interface ThumbnailsTabProps {
  numPages?: number
  currentPage?: number
  onPageNavigate?: (page: number) => void
}

export function ThumbnailsTab({
  numPages,
  currentPage,
  onPageNavigate,
}: ThumbnailsTabProps) {
  if (!numPages || numPages === 0) {
    return (
      <div className="p-4">
        <p className="text-sm text-muted-foreground">
          No pages available.
        </p>
      </div>
    )
  }

  return (
    <div className="p-4 grid grid-cols-2 gap-4">
      {Array.from({ length: numPages }, (_, i) => i + 1).map(pageNum => {
        const isCurrentPage = pageNum === currentPage

        return (
          <button
            key={pageNum}
            onClick={() => onPageNavigate?.(pageNum)}
            className={`border-2 rounded overflow-hidden transition-all ${
              isCurrentPage
                ? 'border-blue-600 ring-2 ring-blue-200'
                : 'border-gray-300 hover:border-blue-400'
            }`}
          >
            <Page
              pageNumber={pageNum}
              width={120}
              renderTextLayer={false}
              renderAnnotationLayer={false}
            />
            <div className="p-1 text-xs text-center bg-gray-100 dark:bg-gray-800">
              {pageNum}
            </div>
          </button>
        )
      })}
    </div>
  )
}
```

#### 5. Update LeftPanel with Heatmap and Thumbnails

**File**: `src/components/layout/LeftPanel.tsx`
**Changes**: Add new tabs

```typescript
'use client'

import { useUIStore } from '@/stores/ui-store'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/rhizome/tabs'
import { MetadataTab } from './tabs/MetadataTab'
import { OutlineTab } from './tabs/OutlineTab'
import { ThumbnailsTab } from './tabs/ThumbnailsTab'
import { HeatmapTab } from './tabs/HeatmapTab'

interface LeftPanelProps {
  documentId: string
  pdfMetadata?: any
  outline?: any[]
  numPages?: number  // 🆕 ADD
  currentPage?: number  // 🆕 ADD
  chunks: Chunk[]  // 🆕 ADD
  onPageNavigate?: (page: number) => void
}

export function LeftPanel({
  documentId,
  pdfMetadata,
  outline,
  numPages,
  currentPage,
  chunks,
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
          <HeatmapTab documentId={documentId} currentPage={currentPage} chunks={chunks} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
```

#### 6. Connection Navigation in PDF

**File**: `src/components/sidebar/ConnectionsList.tsx`
**Changes**: Add "View in PDF" for connections

```typescript
export function ConnectionsList({
  documentId,
  connections,
  onNavigateToChunk,
  viewerMode,  // 🆕 ADD
}: ConnectionsListProps) {
  return (
    <div className="p-4 space-y-3">
      {connections.map(conn => (
        <div key={conn.id} className="border rounded p-3">
          {/* Connection info */}
          <div className="text-sm font-medium mb-2">
            {conn.connection_type} ({(conn.strength * 100).toFixed(0)}%)
          </div>

          {/* Navigation buttons */}
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => onNavigateToChunk(conn.source_chunk_id)}
              className="text-xs px-2 py-1 border rounded hover:bg-muted"
            >
              View Source
            </button>
            <button
              onClick={() => onNavigateToChunk(conn.target_chunk_id)}
              className="text-xs px-2 py-1 border rounded hover:bg-muted"
            >
              View Target
            </button>

            {/* 🆕 ADD: View in PDF button (if in PDF mode) */}
            {viewerMode === 'pdf' && (
              <>
                <button
                  onClick={() => onNavigateToChunk(conn.source_chunk_id, 'pdf')}
                  className="text-xs px-2 py-1 border rounded hover:bg-muted"
                >
                  Source (PDF)
                </button>
                <button
                  onClick={() => onNavigateToChunk(conn.target_chunk_id, 'pdf')}
                  className="text-xs px-2 py-1 border rounded hover:bg-muted"
                >
                  Target (PDF)
                </button>
              </>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
```

### Success Criteria

#### Automated Verification:
- [ ] Type check: `npm run type-check` passes
- [ ] Build: `npm run build` succeeds
- [ ] Lint: `npm run lint` passes

#### Manual Verification:
- [ ] Chunks with connections show thicker blue border
- [ ] Connection count badge appears on chunks with connections
- [ ] Hover chunk with connections → Tooltip shows count
- [ ] Navigate from ConnectionsList → PDF page with highlighted chunk
- [ ] Connection heatmap renders in LeftPanel
- [ ] Heatmap shows density by page
- [ ] Current page highlighted in heatmap
- [ ] Thumbnails tab shows page previews
- [ ] Click thumbnail → Navigates to page
- [ ] ConnectionStore state shared between markdown and PDF views
- [ ] Mobile: Swipe left/right navigates pages

### Service Restarts:
- [ ] Next.js: Auto-reload for updated components

---

## Phase 6: Performance & Polish (Week 11-12)

### Overview

Optimize for large PDFs (500+ pages) with React Virtuoso, add keyboard shortcuts, implement continuous scroll mode, add page rotation controls, polish mobile gestures, finalize LeftPanel responsive behavior, integrate Docling error handling UI.

### Changes Required

#### 1. Virtualized PDF Reader

**File**: `src/components/rhizome/pdf-viewer/VirtualizedPDFReader.tsx` (new)
**Changes**: Replace single-page viewer with virtualized multi-page

```typescript
'use client'

import { useRef, useState, useCallback, useMemo } from 'react'
import { Virtuoso, VirtuosoHandle } from 'react-virtuoso'
import { Document, Page } from 'react-pdf'
import { PDFAnnotationOverlay } from './PDFAnnotationOverlay'
import { PDFChunkOverlay } from './PDFChunkOverlay'
import type { Chunk, AnnotationEntity } from '@/types/annotations'
import type { Connection } from '@/types/connections'

interface VirtualizedPDFReaderProps {
  fileUrl: string
  documentId: string
  chunks: Chunk[]
  annotations: AnnotationEntity[]
  connections: Connection[]
  highlightedChunkId?: string | null
  onPageChange?: (pageNumber: number) => void
}

export function VirtualizedPDFReader({
  fileUrl,
  documentId,
  chunks,
  annotations,
  connections,
  highlightedChunkId,
  onPageChange,
}: VirtualizedPDFReaderProps) {
  const virtuosoRef = useRef<VirtuosoHandle>(null)
  const [numPages, setNumPages] = useState<number>(0)
  const [scale, setScale] = useState(1.0)
  const [currentPage, setCurrentPage] = useState(1)
  const [rotation, setRotation] = useState(0)  // 🆕 ADD: Page rotation
  const [continuousScroll, setContinuousScroll] = useState(true)  // 🆕 ADD: View mode

  // Generate page array for Virtuoso
  const pages = useMemo(() => {
    return Array.from({ length: numPages }, (_, i) => i + 1)
  }, [numPages])

  const onDocumentLoadSuccess = useCallback(({ numPages }: { numPages: number }) => {
    setNumPages(numPages)
    console.log(`[VirtualizedPDFReader] Loaded ${numPages} pages`)
  }, [])

  // Track visible pages
  const handleRangeChanged = useCallback((range: { startIndex: number; endIndex: number }) => {
    const midpoint = Math.floor((range.startIndex + range.endIndex) / 2)
    const pageNumber = midpoint + 1

    if (pageNumber !== currentPage) {
      setCurrentPage(pageNumber)
      onPageChange?.(pageNumber)
    }
  }, [currentPage, onPageChange])

  // Keyboard shortcuts
  useEffect(() => {
    function handleKeyPress(e: KeyboardEvent) {
      // Cmd+0 (fit width)
      if ((e.metaKey || e.ctrlKey) && e.key === '0') {
        e.preventDefault()
        // Calculate fit-width scale
        const containerWidth = window.innerWidth - 700 // Account for panels
        setScale(containerWidth / 612) // US Letter width
      }

      // Cmd+1 (actual size)
      if ((e.metaKey || e.ctrlKey) && e.key === '1') {
        e.preventDefault()
        setScale(1.0)
      }
    }

    window.addEventListener('keydown', handleKeyPress)
    return () => window.removeEventListener('keydown', handleKeyPress)
  }, [])

  return (
    <div className="pdf-viewer-container flex flex-col h-full">
      {/* Controls */}
      <div className="pdf-controls flex items-center gap-4 p-4 border-b bg-background sticky top-0 z-10">
        <button
          onClick={() => virtuosoRef.current?.scrollToIndex({
            index: Math.max(0, currentPage - 2),
            align: 'start',
            behavior: 'smooth'
          })}
          disabled={currentPage <= 1}
          className="px-3 py-1 border rounded disabled:opacity-50"
        >
          ← Previous
        </button>

        <span className="text-sm font-medium">
          Page {currentPage} / {numPages}
        </span>

        <button
          onClick={() => virtuosoRef.current?.scrollToIndex({
            index: Math.min(numPages - 1, currentPage),
            align: 'start',
            behavior: 'smooth'
          })}
          disabled={currentPage >= numPages}
          className="px-3 py-1 border rounded disabled:opacity-50"
        >
          Next →
        </button>

        <div className="flex-1" />

        {/* 🆕 ADD: Continuous vs single-page toggle */}
        <button
          onClick={() => setContinuousScroll(!continuousScroll)}
          className="px-3 py-1 border rounded text-xs"
          title={continuousScroll ? 'Switch to single-page' : 'Switch to continuous scroll'}
        >
          {continuousScroll ? 'Continuous' : 'Single Page'}
        </button>

        {/* 🆕 ADD: Rotation controls */}
        <button
          onClick={() => setRotation((r) => (r + 90) % 360)}
          className="px-3 py-1 border rounded text-xs"
          title="Rotate 90°"
        >
          ↻ {rotation}°
        </button>

        {/* Zoom controls */}
        <button onClick={() => setScale(s => Math.min(3.0, s * 1.2))} className="px-3 py-1 border rounded">
          Zoom In
        </button>
        <span className="text-sm">{(scale * 100).toFixed(0)}%</span>
        <button onClick={() => setScale(s => Math.max(0.5, s / 1.2))} className="px-3 py-1 border rounded">
          Zoom Out
        </button>
      </div>

      {/* Virtualized PDF pages */}
      <Document
        file={fileUrl}
        onLoadSuccess={onDocumentLoadSuccess}
        loading={
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center p-8">
              <div className="animate-spin h-12 w-12 border-4 border-primary border-t-transparent rounded-full mx-auto mb-4" />
              <p className="text-sm text-muted-foreground">Loading PDF...</p>
            </div>
          </div>
        }
      >
        {continuousScroll ? (
          <Virtuoso
            ref={virtuosoRef}
            data={pages}
            rangeChanged={handleRangeChanged}
            overscan={200}
            itemContent={(index, pageNumber) => (
              <div className="flex justify-center py-4" key={pageNumber}>
                <div className="relative">
                  <Page
                    pageNumber={pageNumber}
                    scale={scale}
                    rotate={rotation}
                    renderTextLayer={true}
                    renderAnnotationLayer={true}
                    className="shadow-lg"
                  />

                  <PDFAnnotationOverlay
                    annotations={annotations}
                    pageNumber={pageNumber}
                    scale={scale}
                  />

                  <PDFChunkOverlay
                    chunks={chunks}
                    pageNumber={pageNumber}
                    scale={scale}
                    highlightedChunkId={highlightedChunkId}
                    connections={connections}
                  />
                </div>
              </div>
            )}
          />
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="relative">
              <Page
                pageNumber={currentPage}
                scale={scale}
                rotate={rotation}
                renderTextLayer={true}
                renderAnnotationLayer={true}
                className="shadow-lg"
              />

              <PDFAnnotationOverlay
                annotations={annotations}
                pageNumber={currentPage}
                scale={scale}
              />

              <PDFChunkOverlay
                chunks={chunks}
                pageNumber={currentPage}
                scale={scale}
                highlightedChunkId={highlightedChunkId}
                connections={connections}
              />
            </div>
          </div>
        )}
      </Document>
    </div>
  )
}
```

#### 2. Mobile Gesture Optimization

**File**: `src/hooks/usePDFGestures.ts` (new)
**Changes**: Optimize pinch-zoom smoothness

```typescript
'use client'

import { useState } from 'react'
import { useGesture } from '@use-gesture/react'

interface UsePDFGesturesOptions {
  onZoom?: (scale: number) => void
  onPan?: (position: { x: number; y: number }) => void
  onPageChange?: (direction: 'prev' | 'next') => void
}

export function usePDFGestures({
  onZoom,
  onPan,
  onPageChange,
}: UsePDFGesturesOptions) {
  const [scale, setScale] = useState(1.0)
  const [position, setPosition] = useState({ x: 0, y: 0 })

  const bind = useGesture(
    {
      onPinch: ({ offset: [d], velocity: [vd], memo }) => {
        // Smooth pinch-to-zoom with velocity consideration
        const newScale = Math.max(0.5, Math.min(3.0, 1 + d / 200))
        setScale(newScale)
        onZoom?.(newScale)

        return memo
      },
      onDrag: ({ offset: [x, y], swipe: [swipeX] }) => {
        // Pan gesture
        setPosition({ x, y })
        onPan?.({ x, y })

        // Swipe detection for page navigation
        if (swipeX !== 0) {
          onPageChange?.(swipeX > 0 ? 'prev' : 'next')
        }
      },
      onDoubleTap: () => {
        // Double-tap to toggle fit-width
        const newScale = scale === 1.0 ? 1.5 : 1.0
        setScale(newScale)
        onZoom?.(newScale)
      },
    },
    {
      pinch: {
        scaleBounds: { min: 0.5, max: 3.0 },
        rubberband: true,
      },
      drag: {
        filterTaps: true,
        rubberband: true,
      },
    }
  )

  return { bind, scale, position }
}
```

#### 3. Docling Error Classification UI

**File**: `worker/lib/docling-error-classifier.ts` (new)
**Changes**: Categorize and handle extraction failures

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

#### 4. Admin Panel Retry UI

**File**: `src/components/admin/tabs/ScannerTab.tsx`
**Changes**: Add retry options for failed processing

```typescript
// Add to Scanner Tab for failed documents
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

#### 5. Responsive LeftPanel

**File**: `src/components/layout/LeftPanel.tsx`
**Changes**: Polish mobile behavior

```typescript
'use client'

import { useUIStore } from '@/stores/ui-store'
import { useMediaQuery } from '@/hooks/use-media-query'
import { Sheet, SheetContent } from '@/components/rhizome/sheet'
// ... other imports

export function LeftPanel({ documentId, ...props }: LeftPanelProps) {
  const isOpen = useUIStore(state => state.leftPanelOpen)
  const isMobile = useMediaQuery('(max-width: 768px)')

  const panelContent = (
    <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
      {/* Tabs content */}
    </Tabs>
  )

  // Mobile: Bottom sheet
  if (isMobile) {
    return (
      <Sheet open={isOpen} onOpenChange={(open) => !open && toggleLeftPanel()}>
        <SheetContent side="bottom" className="h-[60vh]">
          {panelContent}
        </SheetContent>
      </Sheet>
    )
  }

  // Desktop: Side panel
  if (!isOpen) return null

  return (
    <div className="w-[300px] border-r bg-background overflow-hidden flex flex-col">
      {panelContent}
    </div>
  )
}
```

### Success Criteria

#### Automated Verification:
- [ ] Type check: `npm run type-check` passes
- [ ] Build: `npm run build` succeeds
- [ ] Lint: `npm run lint` passes

#### Manual Verification:
- [ ] React Virtuoso virtualizes pages for 500+ page PDFs
- [ ] Memory usage stays <2GB for 500-page PDF
- [ ] Keyboard: `Cmd+0` fits width, `Cmd+1` actual size
- [ ] Continuous scroll vs single-page toggle works
- [ ] Page rotation controls work (90°, 180°, 270°)
- [ ] Mobile: Pinch-zoom smooth at 60 FPS
- [ ] Mobile: Swipe left/right navigates pages
- [ ] Mobile: Double-tap toggles fit-width
- [ ] Docling retry UI appears for failed documents
- [ ] LeftPanel responsive on mobile (bottom sheet)
- [ ] Performance: Page navigation <300ms
- [ ] Performance: Zoom response <100ms

### Service Restarts:
- [ ] Next.js: Auto-reload for final components

---

## Testing Strategy

### Unit Tests:

**Test**: `src/hooks/usePDFSelection.test.ts`
- Test text selection extraction
- Test PDF coordinate calculation
- Test long-press detection on mobile
- Test selection clearing

**Test**: `src/components/rhizome/pdf-viewer/PDFViewer.test.tsx`
- Test PDF loading (success/error states)
- Test zoom controls
- Test page navigation
- Test touch gesture detection

**Test**: `src/lib/ecs/annotations.test.ts`
- Test PDF coordinate storage in Position component
- Test annotation creation with PDF coordinates
- Test coordinate validation

### Integration Tests:

**Test**: `tests/integration/pdf-viewer.test.ts`
- Full PDF viewer rendering flow
- Annotation creation → storage → display
- Chunk visualization with bboxes
- Connection detection and display
- View mode switching (markdown ↔ PDF)

### Manual Testing:

**Desktop Testing**:
1. [ ] Load 50-page PDF → Verify smooth scrolling
2. [ ] Load 500-page PDF → Verify virtualization, memory <2GB
3. [ ] Create annotations → Verify persistence across page reloads
4. [ ] Navigate via ChunksTab → Verify chunk highlighting
5. [ ] Navigate via ConnectionsList → Verify page navigation
6. [ ] Toggle between Markdown and PDF views
7. [ ] Use all LeftPanel tabs (Metadata, Outline, Thumbnails, Heatmap)

**Mobile Testing** (Phase 6):
1. [ ] iPhone Safari (iOS 17+) - All gestures work
2. [ ] Android Chrome (latest) - All gestures work
3. [ ] iPad Safari (landscape + portrait) - Layout adapts
4. [ ] Pinch-zoom smooth at 60 FPS
5. [ ] Long-press enables selection mode
6. [ ] Bottom sheets work for panels and annotation creation

---

## Performance Considerations

**Memory Optimization**:
- React Virtuoso only renders visible pages + overscan (2-3 pages)
- Worker thread prevents main thread blocking during PDF parsing
- Cap `devicePixelRatio` to prevent excessive memory on high-DPI displays
- Target: <500MB (50 pages), <1GB (200 pages), <2GB (500+ pages)

**Rendering Optimization**:
- Canvas mode (no SVG memory leaks)
- Lazy rendering (only visible pages)
- Debounced connection fetching (300ms)
- Throttled scroll events

**Mobile Optimization**:
- Touch gestures use native browser APIs
- Pinch-zoom target: 60 FPS
- Touch response target: <100ms
- Progressive image loading for thumbnails

---

## Personal Tool Philosophy - No Artificial Limits

**Storage**:
- Supabase Storage limit: 50GB (free tier) or 100GB+ (paid)
- **No artificial file size limit** in code
- Show warning: "Large PDFs (>100MB) may take longer to load"
- Let Supabase reject if over quota (graceful error)

**Processing**:
- **No page limit** - Process 5000-page PDFs if user wants
- Show estimated time: "Large document (2000 pages). Estimated: 45-60 minutes."
- Allow background processing (close tab, continue later)

**Warnings Not Restrictions**:
```typescript
// ❌ Don't block
if (fileSizeMB > 50) {
  throw new Error('File too large. Maximum 50MB.')
}

// ✅ Warn but allow
if (fileSizeMB > 100) {
  console.warn(`Large file: ${fileSizeMB}MB`)
  toast.warning('Large PDF detected', {
    description: 'Processing may take 15-30 minutes. You can close this tab and return later.',
    duration: 10000
  })
}
// Continue processing...
```

---

## Docling Failure Scenarios

### 5 Categories with Handling

1. **Python missing** (Common during setup) → Detection + setup guide
2. **PDF corrupted** (1-2%) → Graceful fallback, "Delete & Re-upload" button
3. **Timeout** (<1%) → Retry with extended timeout (30 min)
4. **OCR missing** (<5%) → Fallback to non-OCR, install instructions
5. **OOM** (<0.5%) → Warning only, suggest splitting PDF

**See**: `thoughts/plans/2025-10-27_pdf-viewer-amendments.md` for complete failure analysis

---

## References

**Architecture**:
- `docs/ARCHITECTURE.md` - Rhizome architecture
- `docs/rEACT_GUIDELINES.md` - Server/Client component rules
- `docs/UI_PATTERNS.md` - No modals, persistent UI

**Existing Patterns**:
- `src/components/reader/VirtualizedReader.tsx` - Markdown reader pattern
- `src/components/reader/ReaderLayout.tsx` - Layout orchestration
- `src/components/sidebar/RightPanel.tsx` - Model for LeftPanel
- `src/lib/ecs/annotations.ts` - ECS annotation system

**Research**:
- `thoughts/ideas/2025-10-27_react-pdf-research.md` - Complete react-pdf analysis
- `thoughts/ideas/2025-10-27_webpdf-pro-vs-react-pdf-comparison.md` - Library comparison

**Plans**:
- `thoughts/plans/2025-10-27_pdf-viewer-with-chunk-visualization.md` - Base plan
- `thoughts/plans/2025-10-27_pdf-viewer-amendments.md` - Amendments and clarifications

---

**Status**: Ready for Implementation! All phases detailed with code examples, success criteria, and Rhizome architecture integration.
