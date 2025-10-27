# PDF Viewer with Chunk Visualization & Connection Integration

**Date**: 2025-10-27
**Status**: Planning Complete
**Timeline**: 8-10 weeks for production-ready implementation

---

## Overview

Implement a reusable PDF viewer component using react-pdf (wojtekmaj) that serves as a **first-class view** alongside the existing markdown reader. The PDF viewer will integrate with Rhizome's ECS annotation system, visualize chunk boundaries using Docling-extracted bboxes, and display connections between chunks - enabling the full Rhizome experience (annotations, connections, sparks) in PDF view.

**Why This Matters**: When markdown extraction produces poor results (complex layouts, tables, multi-column PDFs), users can switch to native PDF view while maintaining full access to Rhizome's knowledge synthesis features.

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

**WebPDF.pro Comparison** (`thoughts/ideas/2025-10-27_webpdf-pro-vs-react-pdf-comparison.md`):
- Not recommended: No NPM package, zero community, minimal docs
- react-pdf wins on all criteria: proven scale, comprehensive docs, active community

### Constraints Identified

1. **Client-Only Limitation**: PDF.js requires browser APIs (no SSR)
2. **Memory Management**: Large PDFs (500+ pages) need virtualization
3. **Worker Configuration**: Must configure PDF.js worker before first render
4. **Coordinate Systems**: PDF uses bottom-left origin, need translation for overlays
5. **Development Time**: 8-10 weeks for production-ready viewer with full features

---

## Desired End State

### User Experience

**Dual-Mode Document Viewer**:
```
┌──────────────────────────────────────────────────┐
│ [Document Header]                    [View: PDF ▼]│ ← Toggle between Markdown/PDF
├──────────────────────────────────────────────────┤
│ ┌────────────────┐                    ┌─────────┐│
│ │                │                    │ Right   ││
│ │  PDF Viewer    │ ← Virtualized     │ Panel   ││
│ │  - Annotations │   scrolling       │ - Annot.││
│ │  - Chunk boxes │   (React Virtuoso)│ - Chunks││
│ │  - Connections │                    │ - Conn. ││
│ │                │                    │ - Sparks││
│ └────────────────┘                    └─────────┘│
│                                                   │
│ [ProcessingDock] ← Bottom-right (persistent)     │
└──────────────────────────────────────────────────┘
```

**Feature Parity Across Views**:
| Feature | Markdown View | PDF View | Status |
|---------|--------------|----------|--------|
| Text selection | ✅ | ✅ | Phase 2 |
| Annotations (ECS) | ✅ | ✅ | Phase 3 |
| Chunk boundaries | ❌ | ✅ | Phase 4 |
| Connection detection | ✅ | ✅ | Phase 5 |
| Sparks (Cmd+K) | ✅ | ✅ | Phase 3 |
| Navigation | ✅ | ✅ | Phase 5 |
| Search | ✅ | 🔄 | Phase 6 |

### Technical Goals

**Architecture**:
- Reusable `PDFViewer` component in `components/rhizome/pdf-viewer/`
- Parallel structure to VirtualizedReader (same patterns)
- ReaderStore tracks `viewerMode: 'markdown' | 'pdf'`
- No changes to worker, connection engines, or storage

**Integration**:
- Same ECS annotation system (Position component stores PDF coordinates)
- Same ConnectionStore (chunk-based detection is view-agnostic)
- Same RightPanel (annotations/connections/sparks tabs work in both views)
- Same keyboard shortcuts (Cmd+K for sparks, etc.)

**Performance**:
- React Virtuoso for page virtualization (proven in markdown reader)
- Worker thread for PDF parsing (doesn't block main thread)
- Lazy rendering (only visible pages + overscan)
- Memory efficient for 500+ page books

---

## Rhizome Architecture

**Module**: Main App only (Next.js)
**Storage**: Supabase Storage (PDFs already there)
**Source of Truth**: Storage (PDFs) + Database (annotations with PDF coordinates)
**Migration**: Optional enhancement (can formalize PDF coordinate fields later)
**Test Tier**: Stable (fix when broken, not deployment-blocking)
**Pipeline Stages**: None affected (viewer is UI-only, no worker changes)
**Engines**: None affected (connections are chunk-based, view-agnostic)

---

## What We're NOT Doing

**Out of Scope for Initial Implementation**:

1. **PDF Generation** - No `@react-pdf/renderer` (different library, different use case)
2. **Dual-Pane View** - No side-by-side markdown + PDF (single view mode at a time)
3. **PDF Editing** - No form filling, redaction, or modification (read-only viewer)
4. **Mobile-First** - Desktop focus first, mobile optimization in future iteration
5. **OCR** - Assume text-based PDFs (Docling already extracted text)
6. **Cross-Document Navigation** - Connections to other documents deferred to Phase 7+
7. **Search Across All Pages** - Initial search limited to visible pages (virtualization trade-off)
8. **Annotation Import** - No reading existing PDF annotations (only create new via Rhizome)
9. **Print/Download** - View-only initially, export features come later
10. **Thumbnail Sidebar** - Focus on main viewer first, thumbnails in future enhancement

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

**Integration Points**:
1. **Server Component** (`read/[id]/page.tsx`) - Add PDF signed URL alongside markdown URL
2. **ReaderLayout** - Add viewerMode state, conditional rendering
3. **DocumentHeader** - Add view mode toggle button
4. **ReaderStore** - Add `viewerMode`, `pdfUrl`, `currentPage` fields
5. **AnnotationStore** - Position component stores both markdown offsets AND PDF coordinates

**Technology Stack**:
- `react-pdf` v10.2.0+ (wojtekmaj, PDF viewer)
- `pdfjs-dist` (peer dependency, Mozilla PDF.js)
- React Virtuoso (reuse existing, page virtualization)
- Zustand (reuse existing stores)
- Supabase Storage (PDFs already there)

---

## Phase 1: Foundation - Basic PDF Display (Week 1-2)

### Overview
Set up react-pdf, configure worker, display single PDF page. Establish integration with existing ReaderLayout and Server Component patterns.

### Changes Required

#### 1. Install Dependencies

**File**: `package.json`
**Changes**: Add react-pdf and peer dependencies

```bash
npm install react-pdf pdfjs-dist
```

**package.json additions**:
```json
{
  "dependencies": {
    "react-pdf": "^10.2.0",
    "pdfjs-dist": "^4.0.0"
  }
}
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

**Why this works**: Worker runs in separate thread, handles PDF parsing/rendering without blocking UI. Configuration must happen before first render.

#### 3. Basic PDF Viewer Component

**File**: `src/components/rhizome/pdf-viewer/PDFViewer.tsx` (new)
**Changes**: Core PDF viewing component

```typescript
'use client'

import { useState, useCallback } from 'react'
import { Document, Page } from 'react-pdf'
import 'react-pdf/dist/Page/AnnotationLayer.css'
import 'react-pdf/dist/Page/TextLayer.css'
import '@/lib/pdf/worker-config' // Initialize worker

interface PDFViewerProps {
  fileUrl: string
  documentId: string
}

export function PDFViewer({ fileUrl, documentId }: PDFViewerProps) {
  const [numPages, setNumPages] = useState<number>(0)
  const [pageNumber, setPageNumber] = useState(1)
  const [scale, setScale] = useState(1.0)

  const onDocumentLoadSuccess = useCallback(({ numPages }: { numPages: number }) => {
    setNumPages(numPages)
    console.log(`[PDFViewer] Loaded PDF with ${numPages} pages`)
  }, [])

  return (
    <div className="pdf-viewer-container flex flex-col h-full">
      {/* Simple controls */}
      <div className="pdf-controls flex items-center gap-4 p-4 border-b bg-background">
        <button
          onClick={() => setPageNumber(p => Math.max(1, p - 1))}
          disabled={pageNumber <= 1}
          className="px-3 py-1 border rounded"
        >
          Previous
        </button>

        <span className="text-sm">
          Page {pageNumber} of {numPages}
        </span>

        <button
          onClick={() => setPageNumber(p => Math.min(numPages, p + 1))}
          disabled={pageNumber >= numPages}
          className="px-3 py-1 border rounded"
        >
          Next
        </button>

        <div className="flex-1" />

        <button onClick={() => setScale(s => s * 1.2)} className="px-3 py-1 border rounded">
          Zoom In
        </button>
        <button onClick={() => setScale(s => s / 1.2)} className="px-3 py-1 border rounded">
          Zoom Out
        </button>
      </div>

      {/* PDF document */}
      <div className="pdf-content flex-1 overflow-auto flex items-center justify-center bg-gray-100 dark:bg-gray-900">
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
          />
        </Document>
      </div>
    </div>
  )
}
```

#### 4. Integrate with Server Component

**File**: `src/app/read/[id]/page.tsx:114-141`
**Changes**: Add PDF signed URL generation alongside markdown

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

  // ... rest of existing code (chunks, annotations, etc.)

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

#### 5. Update ReaderLayout with View Mode Toggle

**File**: `src/components/reader/ReaderLayout.tsx:31-38`
**Changes**: Add pdfUrl prop

```typescript
interface ReaderLayoutProps {
  documentId: string
  markdownUrl: string
  pdfUrl: string | null  // 🆕 ADD
  chunks: Chunk[]
  annotations: StoredAnnotation[]
  documentTitle: string
  // ... rest of props
}
```

**File**: `src/components/reader/ReaderLayout.tsx:96-155`
**Changes**: Add viewerMode state and conditional rendering

```typescript
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
  const visibleChunks = useReaderStore(state => state.visibleChunks)

  // ... existing effects (loadMarkdown, fetchConnections, etc.)

  return (
    <div className="flex flex-col h-screen">
      {/* Header with view mode toggle */}
      <div className="sticky top-14 z-40 bg-background">
        <DocumentHeader
          documentId={documentId}
          title={documentTitle}
          // ... other props

          {/* 🆕 ADD: View mode toggle (only show if PDF available) */}
          viewerMode={viewerMode}
          onViewerModeChange={setViewerMode}
          pdfAvailable={!!pdfUrl}
        />
      </div>

      <div className="flex-1 overflow-hidden relative">
        {/* 🆕 ADD: Conditional viewer rendering */}
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

      {/* Right panel - same in both modes */}
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
  )
}
```

#### 6. Update DocumentHeader with Toggle

**File**: `src/components/reader/DocumentHeader.tsx` (existing)
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

        {/* Existing controls (view mode, quick spark, etc.) */}
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
- [ ] Toggle between Markdown and PDF views works
- [ ] PDF loads from Supabase Storage signed URL
- [ ] Worker thread doesn't block main thread during PDF load
- [ ] Error states display correctly (file not found, load failure)
- [ ] Toggle only appears when PDF is available

**Implementation Note**: Pause after automated verification passes for manual confirmation before proceeding to Phase 2.

### Service Restarts:
- [ ] Next.js: Auto-reload should handle client component changes
- [ ] Supabase: No schema changes, no restart needed
- [ ] Worker: No worker changes, no restart needed

---

## Phase 2: Text Layer & Selection (Week 3-4)

### Overview
Enable text selection in PDF viewer, extract selection coordinates, prepare for annotation creation. Mirror `useTextSelection` hook behavior from markdown reader.

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
      // For now, store screen coordinates - will enhance in annotation integration
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

    document.addEventListener('selectionchange', handleSelectionChange)
    return () => document.removeEventListener('selectionchange', handleSelectionChange)
  }, [enabled, pageNumber])

  const clearSelection = useCallback(() => {
    window.getSelection()?.removeAllRanges()
    setSelection(null)
  }, [])

  return { selection, clearSelection }
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
  const { selection, clearSelection } = usePDFSelection({
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

      {/* PDF document with text layer enabled */}
      <div className="pdf-content flex-1 overflow-auto flex items-center justify-center bg-gray-100 dark:bg-gray-900">
        <Document
          file={fileUrl}
          onLoadSuccess={onDocumentLoadSuccess}
        >
          <Page
            pageNumber={pageNumber}
            scale={scale}
            renderTextLayer={true}  // ✅ Already enabled in Phase 1
            renderAnnotationLayer={true}
          />
        </Document>
      </div>
    </div>
  )
}
```

#### 3. Enhanced Coordinate Extraction

**File**: `src/lib/pdf/coordinates.ts` (new)
**Changes**: Utilities for PDF coordinate transformation

```typescript
/**
 * PDF coordinate system utilities.
 *
 * PDF.js uses bottom-left origin, web uses top-left.
 * Need viewport transforms to convert between coordinate systems.
 */

import type { PDFPageProxy } from 'pdfjs-dist'

export interface PDFCoordinates {
  x: number
  y: number
  width: number
  height: number
  pageNumber: number
}

/**
 * Convert screen coordinates to PDF coordinates.
 * Requires page viewport from PDF.js.
 */
export function screenToPDFCoordinates(
  screenX: number,
  screenY: number,
  page: PDFPageProxy,
  scale: number
): { x: number; y: number } {
  const viewport = page.getViewport({ scale })

  // Use viewport.convertToPdfPoint for accurate transformation
  const [pdfX, pdfY] = viewport.convertToPdfPoint(screenX, screenY)

  return { x: pdfX, y: pdfY }
}

/**
 * Convert PDF coordinates to screen coordinates.
 * Useful for positioning overlays.
 */
export function pdfToScreenCoordinates(
  pdfX: number,
  pdfY: number,
  page: PDFPageProxy,
  scale: number
): { x: number; y: number } {
  const viewport = page.getViewport({ scale })

  // Use viewport.convertToViewportPoint for accurate transformation
  const [screenX, screenY] = viewport.convertToViewportPoint(pdfX, pdfY)

  return { x: screenX, y: screenY }
}

/**
 * Extract text content and positions from PDF page.
 * Returns text items with their coordinates.
 */
export async function extractTextWithPositions(page: PDFPageProxy) {
  const textContent = await page.getTextContent({
    includeMarkedContent: true,
  })

  return textContent.items.map((item: any) => ({
    str: item.str,
    // Transform matrix [a, b, c, d, e, f]
    // Position: (e, f), Rotation: atan2(b, a)
    x: item.transform[4],
    y: item.transform[5],
    width: item.width,
    height: item.height,
    dir: item.dir, // Text direction
  }))
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

**Implementation Note**: Phase 2 focuses on selection infrastructure. Annotation creation comes in Phase 3.

### Service Restarts:
- [ ] Next.js: Auto-reload for new components/hooks
- [ ] No other services affected

---

## Phase 3: ECS Annotation Integration (Week 5-6)

### Overview
Integrate PDF viewer with existing ECS annotation system. Store PDF coordinates in Position component, enable annotation creation via QuickCapturePanel, display annotation overlays on PDF pages.

### Changes Required

#### 1. Extend Position Component

**File**: `src/lib/ecs/components.ts:16-44`
**Changes**: Add optional PDF coordinate fields

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

**Note**: No migration required - JSONB components accept new fields dynamically. If we want to formalize later, can create migration.

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
    // ... rest of components (Visual, Content, Temporal, ChunkRef)
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

interface PDFViewerProps {
  fileUrl: string
  documentId: string
}

export function PDFViewer({ fileUrl, documentId }: PDFViewerProps) {
  const [numPages, setNumPages] = useState<number>(0)
  const [pageNumber, setPageNumber] = useState(1)
  const [scale, setScale] = useState(1.0)

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
    // TODO: Open edit panel (Phase 3 continuation)
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
    </div>
  )
}
```

#### 6. Enable QuickCapturePanel in PDF View

**File**: `src/components/reader/ReaderLayout.tsx`
**Changes**: Show QuickCapturePanel for PDF selections

```typescript
export function ReaderLayout({
  documentId,
  markdownUrl,
  pdfUrl,
  chunks,
  // ...
}: ReaderLayoutProps) {
  const [viewerMode, setViewerMode] = useState<'markdown' | 'pdf'>('markdown')

  // 🆕 ADD: Track PDF selection for annotation creation
  const [pdfSelection, setPdfSelection] = useState<PDFSelection | null>(null)

  return (
    <div className="flex flex-col h-screen">
      {/* Header */}

      <div className="flex-1 overflow-hidden relative">
        {/* Conditional viewer */}
        {viewerMode === 'markdown' ? (
          <DocumentViewer {...} />
        ) : (
          pdfUrl && (
            <PDFViewer
              fileUrl={pdfUrl}
              documentId={documentId}
              onSelectionChange={setPdfSelection}  // 🆕 ADD: Capture selection
            />
          )
        )}
      </div>

      {/* Right panel */}

      {/* 🆕 ADD: QuickCapturePanel for PDF selections */}
      {viewerMode === 'pdf' && pdfSelection && (
        <QuickCapturePanel
          selection={{
            text: pdfSelection.text,
            range: {
              startOffset: 0, // Not used for PDF annotations
              endOffset: 0,
              chunkIds: [], // Will be calculated from page number
            },
            rect: pdfSelection.rect,
            // 🆕 ADD: Pass PDF coordinates
            pdfCoordinates: pdfSelection.pdfRect,
          }}
          documentId={documentId}
          onClose={() => setPdfSelection(null)}
          onAnnotationCreated={(annotation) => {
            // Handle optimistic update
            setPdfSelection(null)
          }}
          chunks={chunks}
          markdown="" // Not used in PDF mode
          mode="create"
        />
      )}
    </div>
  )
}
```

#### 7. Update QuickCapturePanel for PDF Mode

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
- [ ] Click annotation → Logs annotation ID (edit panel in next phase)
- [ ] Switch to Markdown view → Same annotation not visible (no markdown offsets for PDF-only annotations)
- [ ] Annotations persist after page reload
- [ ] Multiple annotations on same page render correctly
- [ ] Annotations scale correctly with zoom in/out

**Implementation Note**: Phase 3 establishes annotation creation. Editing and advanced features come in later phases.

### Service Restarts:
- [ ] Next.js: Auto-reload for component changes
- [ ] Supabase: No schema changes (JSONB accepts new fields dynamically)

---

## Phase 4: Chunk Visualization with Bboxes (Week 7-8)

### Overview
Render chunk boundaries on PDF pages using Docling-extracted bboxes. Enable chunk navigation from RightPanel → PDF page. Visual feedback for chunks with connections.

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

#### 3. Navigation from ChunksTab

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

#### 4. Update ReaderLayout with Chunk Navigation

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

#### 5. Update ReaderStore for PDF Navigation

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

### Service Restarts:
- [ ] Next.js: Auto-reload for new components

---

## Phase 5: Connection Integration (Week 9-10)

### Overview
Display connections in PDF view using existing ConnectionStore. Show connection indicators on chunks with connections. Enable navigation between connected chunks across pages.

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

#### 3. Fetch Connections for Visible PDF Pages

**File**: `src/components/reader/ReaderLayout.tsx`
**Changes**: Fetch connections for PDF mode

```typescript
// Existing connection fetching for markdown view (lines 157-175)
useEffect(() => {
  if (visibleChunks.length === 0) return

  const fetchConnections = async () => {
    try {
      const chunkIds = visibleChunks.map(c => c.id)
      const connections = await getConnectionsForChunks(chunkIds)
      setConnections(connections)
    } catch (error) {
      console.error('[ReaderLayout] Failed to fetch connections:', error)
    }
  }

  const timer = setTimeout(fetchConnections, 300)
  return () => clearTimeout(timer)
}, [visibleChunks, setConnections])

// 🆕 ADD: Fetch connections for PDF page changes
useEffect(() => {
  if (viewerMode !== 'pdf' || !pdfPageNumber) return

  const fetchPDFConnections = async () => {
    try {
      // Find chunks on current PDF page
      const pageChunks = chunks.filter(chunk =>
        chunk.page_start && chunk.page_end &&
        pdfPageNumber >= chunk.page_start && pdfPageNumber <= chunk.page_end
      )

      if (pageChunks.length === 0) return

      const chunkIds = pageChunks.map(c => c.id)
      const connections = await getConnectionsForChunks(chunkIds)
      setConnections(connections)
    } catch (error) {
      console.error('[ReaderLayout] Failed to fetch PDF connections:', error)
    }
  }

  const timer = setTimeout(fetchPDFConnections, 300)
  return () => clearTimeout(timer)
}, [viewerMode, pdfPageNumber, chunks, setConnections])
```

#### 4. Connection Navigation in PDF

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

          {/* Source chunk */}
          <div className="text-xs text-muted-foreground mb-1">
            Source: Chunk {conn.source_chunk_index}
          </div>

          {/* Target chunk */}
          <div className="text-xs text-muted-foreground mb-3">
            Target: Chunk {conn.target_chunk_index}
          </div>

          {/* Navigation buttons */}
          <div className="flex gap-2">
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

#### 5. Connection Heatmap for PDF

**File**: `src/components/reader/ConnectionHeatmap.tsx` (existing)
**Changes**: Adapt for PDF mode

```typescript
export function ConnectionHeatmap({
  documentId,
  chunks,
  viewerMode,  // 🆕 ADD
  currentPage,  // 🆕 ADD: For PDF mode
}: ConnectionHeatmapProps) {
  const connections = useConnectionStore(state => state.filteredConnections)

  // 🆕 ADD: Calculate density by page for PDF mode
  const pageDensity = useMemo(() => {
    if (viewerMode !== 'pdf') return null

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
  }, [viewerMode, chunks, connections])

  // Existing markdown mode rendering...

  // 🆕 ADD: PDF mode rendering
  if (viewerMode === 'pdf' && pageDensity) {
    return (
      <div className="absolute left-2 top-20 w-2 rounded overflow-hidden bg-gray-200 dark:bg-gray-800">
        {Array.from(pageDensity.entries()).map(([page, density]) => {
          const maxDensity = Math.max(...Array.from(pageDensity.values()))
          const opacity = density / maxDensity
          const isCurrentPage = page === currentPage

          return (
            <div
              key={page}
              className="h-1 cursor-pointer transition-all hover:scale-110"
              style={{
                backgroundColor: `rgba(59, 130, 246, ${opacity})`,
                borderLeft: isCurrentPage ? '3px solid blue' : 'none',
              }}
              title={`Page ${page}: ${density} connections`}
              onClick={() => {
                // Navigate to page
              }}
            />
          )
        })}
      </div>
    )
  }

  return null
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
- [ ] Connection heatmap shows density by page in PDF mode
- [ ] Connections fetched when PDF page changes
- [ ] ConnectionStore state shared between markdown and PDF views
- [ ] "View in PDF" buttons work from sidebar connections list

### Service Restarts:
- [ ] Next.js: Auto-reload for updated components

---

## Phase 6: Performance & Polish (Week 11-12)

### Overview
Optimize for large PDFs (500+ pages) with React Virtuoso, add keyboard shortcuts, implement search, polish UI/UX. Final integration testing.

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
        error={
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center p-8">
              <p className="text-destructive mb-2 font-medium">Failed to load PDF</p>
              <p className="text-sm text-muted-foreground">Please refresh the page or try a different document</p>
            </div>
          </div>
        }
      >
        <Virtuoso
          ref={virtuosoRef}
          data={pages}
          rangeChanged={handleRangeChanged}
          overscan={2} // Render 2 pages above/below viewport
          itemContent={(index, pageNumber) => (
            <div key={pageNumber} className="flex justify-center p-8 bg-gray-100 dark:bg-gray-900">
              <div className="relative shadow-2xl">
                <Page
                  pageNumber={pageNumber}
                  scale={scale}
                  renderTextLayer={true}
                  renderAnnotationLayer={true}
                  loading={
                    <div className="w-[600px] h-[800px] bg-white dark:bg-gray-800 flex items-center justify-center">
                      <div className="animate-pulse text-sm text-muted-foreground">
                        Loading page {pageNumber}...
                      </div>
                    </div>
                  }
                />

                {/* Annotation overlay */}
                <PDFAnnotationOverlay
                  annotations={annotations}
                  pageNumber={pageNumber}
                  scale={scale}
                />

                {/* Chunk overlay */}
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
          style={{ height: '100%', width: '100%' }}
        />
      </Document>
    </div>
  )
}
```

#### 2. Keyboard Shortcuts

**File**: `src/components/rhizome/pdf-viewer/VirtualizedPDFReader.tsx`
**Changes**: Add keyboard navigation

```typescript
export function VirtualizedPDFReader(props: VirtualizedPDFReaderProps) {
  // ... existing state

  // 🆕 ADD: Keyboard shortcuts
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Arrow keys for navigation
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault()
        virtuosoRef.current?.scrollToIndex({
          index: Math.max(0, currentPage - 2),
          align: 'start',
          behavior: 'smooth'
        })
      }

      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault()
        virtuosoRef.current?.scrollToIndex({
          index: Math.min(numPages - 1, currentPage),
          align: 'start',
          behavior: 'smooth'
        })
      }

      // Home/End for first/last page
      if (e.key === 'Home') {
        e.preventDefault()
        virtuosoRef.current?.scrollToIndex({ index: 0, align: 'start' })
      }

      if (e.key === 'End') {
        e.preventDefault()
        virtuosoRef.current?.scrollToIndex({ index: numPages - 1, align: 'start' })
      }

      // +/- for zoom
      if (e.key === '+' || e.key === '=') {
        e.preventDefault()
        setScale(s => Math.min(3.0, s * 1.2))
      }

      if (e.key === '-') {
        e.preventDefault()
        setScale(s => Math.max(0.5, s / 1.2))
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [currentPage, numPages])

  // ... rest of component
}
```

#### 3. Basic PDF Search

**File**: `src/components/rhizome/pdf-viewer/PDFSearchPanel.tsx` (new)
**Changes**: Search within visible pages

```typescript
'use client'

import { useState } from 'react'
import { Search } from 'lucide-react'

interface PDFSearchPanelProps {
  onSearch: (query: string) => void
  resultCount?: number
}

export function PDFSearchPanel({ onSearch, resultCount }: PDFSearchPanelProps) {
  const [query, setQuery] = useState('')

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    if (query.trim()) {
      onSearch(query.trim())
    }
  }

  return (
    <div className="border-b bg-background p-2">
      <form onSubmit={handleSearch} className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search in PDF..."
            className="w-full pl-8 pr-3 py-1 border rounded text-sm"
          />
        </div>
        <button
          type="submit"
          className="px-3 py-1 bg-primary text-primary-foreground rounded text-sm hover:bg-primary/90"
        >
          Search
        </button>
        {resultCount !== undefined && (
          <span className="text-sm text-muted-foreground">
            {resultCount} result{resultCount !== 1 ? 's' : ''}
          </span>
        )}
      </form>

      <p className="text-xs text-muted-foreground mt-1 px-1">
        Note: Search limited to rendered pages (virtualization trade-off)
      </p>
    </div>
  )
}
```

#### 4. Memory Management

**File**: `src/lib/pdf/memory-utils.ts` (new)
**Changes**: Monitor and optimize memory usage

```typescript
/**
 * PDF memory management utilities.
 *
 * Large PDFs can consume significant memory (5GB+ without optimization).
 * These utilities help monitor and optimize memory usage.
 */

/**
 * Get current memory usage (if available).
 * Only works in Chrome with performance.memory API.
 */
export function getMemoryUsage() {
  if ('memory' in performance) {
    const memory = (performance as any).memory
    return {
      usedJSHeapSize: memory.usedJSHeapSize,
      totalJSHeapSize: memory.totalJSHeapSize,
      jsHeapSizeLimit: memory.jsHeapSizeLimit,
      usedPercentage: (memory.usedJSHeapSize / memory.jsHeapSizeLimit) * 100,
    }
  }
  return null
}

/**
 * Log memory usage for debugging.
 */
export function logMemoryUsage(label: string) {
  const usage = getMemoryUsage()
  if (usage) {
    console.log(`[Memory] ${label}:`, {
      used: `${(usage.usedJSHeapSize / 1024 / 1024).toFixed(2)} MB`,
      total: `${(usage.totalJSHeapSize / 1024 / 1024).toFixed(2)} MB`,
      limit: `${(usage.jsHeapSizeLimit / 1024 / 1024).toFixed(2)} MB`,
      percent: `${usage.usedPercentage.toFixed(1)}%`,
    })
  }
}

/**
 * Warn if memory usage is high.
 */
export function checkMemoryPressure(): 'low' | 'medium' | 'high' | null {
  const usage = getMemoryUsage()
  if (!usage) return null

  if (usage.usedPercentage > 85) {
    console.warn('[Memory] High memory usage:', usage.usedPercentage.toFixed(1) + '%')
    return 'high'
  }

  if (usage.usedPercentage > 70) {
    console.warn('[Memory] Medium memory usage:', usage.usedPercentage.toFixed(1) + '%')
    return 'medium'
  }

  return 'low'
}
```

#### 5. Loading States & Error Handling

**File**: `src/components/rhizome/pdf-viewer/VirtualizedPDFReader.tsx`
**Changes**: Polish loading and error states

```typescript
export function VirtualizedPDFReader(props: VirtualizedPDFReaderProps) {
  // ... existing state

  const [loadError, setLoadError] = useState<Error | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const onDocumentLoadSuccess = useCallback(({ numPages }: { numPages: number }) => {
    setNumPages(numPages)
    setIsLoading(false)
    setLoadError(null)
    console.log(`[VirtualizedPDFReader] Successfully loaded ${numPages} pages`)

    // Log memory usage after load
    logMemoryUsage('PDF loaded')
  }, [])

  const onDocumentLoadError = useCallback((error: Error) => {
    setLoadError(error)
    setIsLoading(false)
    console.error('[VirtualizedPDFReader] Load error:', error)
  }, [])

  // Show error state
  if (loadError) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="text-center p-8 max-w-md">
          <div className="text-6xl mb-4">📄❌</div>
          <h3 className="text-lg font-semibold mb-2 text-destructive">Failed to Load PDF</h3>
          <p className="text-sm text-muted-foreground mb-4">{loadError.message}</p>
          <div className="space-y-2 text-xs text-left bg-muted p-3 rounded">
            <p><strong>Common causes:</strong></p>
            <ul className="list-disc list-inside space-y-1 ml-2">
              <li>PDF file is corrupted or incomplete</li>
              <li>Network connection interrupted</li>
              <li>Storage URL expired (refresh page to regenerate)</li>
              <li>Browser security settings blocking PDF.js worker</li>
            </ul>
          </div>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 px-4 py-2 bg-primary text-primary-foreground rounded hover:bg-primary/90"
          >
            Refresh Page
          </button>
        </div>
      </div>
    )
  }

  // Show loading state
  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="text-center p-8">
          <div className="animate-spin h-16 w-16 border-4 border-primary border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-lg font-medium mb-2">Loading PDF...</p>
          <p className="text-sm text-muted-foreground">
            Initializing PDF.js worker and parsing document
          </p>
        </div>
      </div>
    )
  }

  // ... rest of component (virtualized pages)
}
```

### Success Criteria

#### Automated Verification:
- [ ] Type check: `npm run type-check` passes
- [ ] Build: `npm run build` succeeds (production build)
- [ ] Lint: `npm run lint` passes with no warnings
- [ ] Bundle size: Check PDF viewer doesn't bloat bundle excessively

#### Manual Verification:
- [ ] Large PDF (500+ pages) loads and scrolls smoothly
- [ ] Memory usage stays reasonable (<2GB for 500-page PDF)
- [ ] Keyboard shortcuts work (arrows, +/-, home/end)
- [ ] Search panel finds text in visible pages
- [ ] Loading states show during PDF parsing
- [ ] Error states display helpful messages
- [ ] Virtualization prevents rendering all pages at once
- [ ] Smooth scrolling with overscan (no white flashes)
- [ ] All Phase 1-5 features still work correctly
- [ ] No console errors or warnings

### Service Restarts:
- [ ] Next.js: Final production build test
- [ ] All services: Full integration test

---

## Testing Strategy

### Unit Tests

**Utilities**:
- [ ] `src/lib/pdf/coordinates.ts` - Coordinate transformation functions
- [ ] `src/lib/pdf/memory-utils.ts` - Memory monitoring utilities
- [ ] `src/hooks/usePDFSelection.ts` - Selection tracking logic

**Components** (if time permits):
- [ ] `PDFAnnotationOverlay` - Annotation rendering with mocked data
- [ ] `PDFChunkOverlay` - Chunk boundary rendering

### Integration Tests

**Critical Paths**:
1. **PDF Loading**:
   - Server Component generates signed URL → ReaderLayout receives URL → PDFViewer displays first page

2. **Annotation Creation**:
   - User selects text → QuickCapturePanel appears → Creates annotation → Annotation appears on PDF

3. **Chunk Navigation**:
   - Click chunk in ChunksTab → PDF scrolls to page → Chunk highlights for 2 seconds

4. **Connection Display**:
   - Load document with connections → Chunks show connection count badges → Click chunk → Navigate to connected chunk

5. **View Mode Toggle**:
   - Switch from Markdown to PDF → PDF loads → Switch back → Markdown still works

### Manual Testing Checklist

**Phase 1 (Foundation)**:
- [ ] Upload new PDF → Processes successfully → Toggle shows "PDF" option
- [ ] Click PDF toggle → PDF displays → Click Markdown toggle → Returns to markdown
- [ ] Zoom in/out → PDF scales correctly
- [ ] Navigate pages → Previous/Next buttons work

**Phase 2 (Text Layer)**:
- [ ] Select text in PDF → Selection indicator appears
- [ ] Selection works across multiple lines
- [ ] Selection survives zoom changes
- [ ] Clear selection button works

**Phase 3 (Annotations)**:
- [ ] Select text → Create annotation → Annotation appears on PDF
- [ ] Click annotation → Opens edit panel (future)
- [ ] Reload page → Annotations persist
- [ ] Create annotation in PDF → Doesn't appear in Markdown (no markdown offsets)

**Phase 4 (Chunks)**:
- [ ] Chunks with bboxes show precise boundaries
- [ ] Chunks without bboxes show fallback indicators
- [ ] Hover chunk → Border highlights
- [ ] Navigate from ChunksTab → PDF scrolls to correct page
- [ ] Highlighted chunk visible for 2 seconds

**Phase 5 (Connections)**:
- [ ] Chunks with connections show blue border + count badge
- [ ] Hover chunk with connections → Tooltip shows count
- [ ] Navigate from ConnectionsList → Correct chunk highlights
- [ ] Connection heatmap shows page density

**Phase 6 (Performance)**:
- [ ] Large PDF (100+ pages) loads without freezing browser
- [ ] Scroll through 500-page PDF smoothly
- [ ] Memory usage stays under 2GB
- [ ] Keyboard shortcuts work (arrows, +/-, home/end)
- [ ] Search finds text in visible pages

### Performance Benchmarks

**Target Metrics**:
- Small PDFs (<50 pages): Load < 3 seconds, <500MB memory
- Medium PDFs (200 pages): Load < 10 seconds, <1GB memory
- Large PDFs (500+ pages): Load < 30 seconds, <2GB memory
- Scroll performance: 60 FPS with virtualization
- Page navigation: <500ms to display new page

### Test Documents

**Recommended Test PDFs**:
1. **Simple**: 10-page research paper (clean layout)
2. **Medium**: 50-page technical book (chapters, headings)
3. **Complex**: 200-page textbook (tables, images, multi-column)
4. **Large**: 500+ page novel (stress test virtualization)
5. **Challenging**: PDF with poor OCR (test error handling)

---

## Performance Considerations

### Memory Optimization

**React Virtuoso Settings**:
```typescript
<Virtuoso
  data={pages}
  overscan={2}  // Only render 2 pages above/below viewport
  // Memory: ~5MB per page × 4-5 rendered pages = ~20-25MB total
/>
```

**PDF.js Configuration**:
```typescript
// Cap device pixel ratio to prevent excessive memory
<Page
  pageNumber={pageNumber}
  scale={scale}
  devicePixelRatio={Math.min(2, window.devicePixelRatio)}
/>
```

### Bundle Size

**Expected Additions**:
- `react-pdf`: ~150KB gzipped
- `pdfjs-dist`: ~500KB gzipped (worker separate file)
- Total bundle increase: ~650KB

**Optimization**:
- Worker loaded separately (not in main bundle)
- PDF.js uses CDN fallback if worker fails to load locally
- Tree-shaking removes unused PDF.js features

### Rendering Performance

**Canvas Mode** (Recommended):
- Faster initial render than SVG
- Stable memory usage
- No memory leaks
- Works well with virtualization

**Text Layer** (Optional):
- Adds ~20-30% overhead per page
- Required for text selection and search
- Can disable if only displaying PDF (no annotations)

**Trade-offs**:
- Virtualization breaks "search all pages" (only visible pages searchable)
- Solution: Option to "Load all pages" for global search (with memory warning)

---

## Migration Notes

**No Database Migration Required**:
- Position component JSONB accepts new fields dynamically
- Existing annotations unaffected (PDF fields are optional)
- Can formalize with migration later if needed:

```sql
-- Optional future migration: 068_pdf_coordinates.sql
-- Adds explicit PDF coordinate fields to Position component validation

-- This migration is NOT REQUIRED for Phase 1-6
-- Include only if want to enforce schema validation later

ALTER TABLE components
ADD CONSTRAINT position_pdf_coords_check
CHECK (
  component_type != 'Position' OR
  (
    (data->>'pdfPageNumber' IS NULL OR
     (data->>'pdfPageNumber')::int > 0) AND
    (data->>'pdfX' IS NULL OR
     (data->>'pdfX')::float >= 0) AND
    (data->>'pdfY' IS NULL OR
     (data->>'pdfY')::float >= 0)
  )
);
```

**Data Flow**:
- Existing markdown-only annotations: `pdfPageNumber`, `pdfX`, `pdfY` all null
- New PDF annotations: All PDF coordinate fields populated
- Hybrid annotations (future): Both markdown offsets AND PDF coordinates

---

## References

### Architecture
- **Current Reader**: `src/app/read/[id]/page.tsx`, `src/components/reader/VirtualizedReader.tsx`
- **ECS System**: `docs/ECS_IMPLEMENTATION.md`, `docs/ANNOTATIONS_SYSTEM.md`
- **Storage Patterns**: `docs/STORAGE_PATTERNS.md`, `docs/STORAGE_FIRST_PORTABILITY_GUIDE.md`

### Research
- **React-PDF**: `thoughts/ideas/2025-10-27_react-pdf-research.md` (1800+ lines)
- **WebPDF Comparison**: `thoughts/ideas/2025-10-27_webpdf-pro-vs-react-pdf-comparison.md`
- **Official Docs**: https://projects.wojtekmaj.pl/react-pdf/, https://mozilla.github.io/pdf.js/

### Implementation Patterns
- **Virtualization**: `src/components/reader/VirtualizedReader.tsx` (Virtuoso patterns)
- **Annotations**: `src/lib/ecs/annotations.ts` (5-component ECS)
- **Overlays**: `src/lib/annotations/inject.ts` (DOM overlay injection)

### Testing
- **Testing Rules**: `docs/testing/TESTING_RULES.md`
- **Critical Tests**: `docs/testing/critical-patterns.md`

---

## Summary

This implementation plan delivers a **production-ready PDF viewer** integrated with Rhizome's existing annotation and connection systems. The phased approach ensures incremental progress with validation at each step.

**Key Achievements**:
- ✅ Dual-mode viewer (markdown + PDF toggle)
- ✅ ECS annotation system works in both views
- ✅ Chunk visualization using Docling-extracted bboxes
- ✅ Connection detection displayed in PDF (reuses ConnectionStore)
- ✅ Performance optimized for 500+ page books (React Virtuoso)
- ✅ Zero changes to worker, detection engines, or storage

**Timeline**: 8-10 weeks (2 weeks per phase × 6 phases)

**Next Steps After Phase 6**:
1. **Phase 7**: Annotation editing in PDF view (open QuickCapturePanel on annotation click)
2. **Phase 8**: Thumbnail sidebar for quick navigation
3. **Phase 9**: Global PDF search (load all pages option with memory warning)
4. **Phase 10**: Cross-document navigation (follow connections to other PDFs)
5. **Phase 11**: Mobile optimization (touch gestures, responsive layout)
6. **Phase 12**: Export annotations as new PDF (requires `@react-pdf/renderer` integration)

**Implementation Philosophy**: Build incrementally, validate at each phase, reuse existing patterns, maintain consistency with markdown reader architecture.
