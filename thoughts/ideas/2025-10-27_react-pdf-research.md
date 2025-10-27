# React-PDF (wojtekmaj) Comprehensive Research
**Date**: 2025-10-27
**Library**: react-pdf by Wojciech Maj
**NPM**: https://www.npmjs.com/package/react-pdf
**GitHub**: https://github.com/wojtekmaj/react-pdf
**Official Site**: https://projects.wojtekmaj.pl/react-pdf/
**Latest Version**: 10.2.0 (as of research date)
**Weekly Downloads**: ~400K
**Philosophy**: "Not a fully fledged PDF reader, but an easy way to display PDFs so you can build some UI around it"

---

## 1. Overview & Core Concepts

### What It Is
- **React wrapper for PDF.js** by Mozilla - provides React components for displaying PDFs
- **Client-side PDF viewer** (not a PDF generator - that's `@react-pdf/renderer`)
- **Minimal UI approach** - provides building blocks, you create the UI
- **Browser-based rendering** - depends on PDF.js browser compatibility

### Key Distinction
⚠️ **CRITICAL**: There are TWO different libraries with similar names:
- **`react-pdf`** (wojtekmaj) - PDF **viewer** for displaying PDFs (this research)
- **`@react-pdf/renderer`** - PDF **generator** for creating PDFs (different library)

### Philosophy
> "React PDF is not meant to be a 'fully fledged PDF reader,' but rather 'an easy way to display PDFs so that you can build some UI around it'."

This means:
- ✅ Provides core rendering components
- ✅ Handles PDF parsing and display
- ❌ No built-in UI (navigation, zoom controls, toolbars)
- ❌ No out-of-box annotation tools
- ❌ No built-in search interface

---

## 2. Installation & Setup

### Basic Installation
```bash
npm install react-pdf
# or
yarn add react-pdf
```

### TypeScript Support
✅ **Built-in TypeScript support** (as of v9.1.0+)
- No need for `@types/react-pdf` (deprecated, now just a stub)
- Types included in the package itself
- Supports `isolatedDeclarations` in TypeScript

### Worker Configuration (REQUIRED)
⚠️ **CRITICAL**: Must configure PDF.js worker before rendering components

```typescript
import { pdfjs } from 'react-pdf';

// Set worker in the SAME MODULE where you use PDF components
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();
```

**Important Notes:**
- Set worker in the same module as components (not in separate files)
- Worker runs in separate thread (doesn't block main thread)
- Default worker path is `/pdf.worker.js` (can cause issues if not configured)

### Optional Stylesheets
Enable interactive features by importing CSS:

```typescript
// For links and annotations
import 'react-pdf/dist/Page/AnnotationLayer.css';

// For text selection
import 'react-pdf/dist/Page/TextLayer.css';
```

---

## 3. Complete Component API

### Document Component
Container for PDF content - provides context for child components.

**Basic Usage:**
```typescript
import { Document, Page } from 'react-pdf';

<Document
  file="sample.pdf"
  onLoadSuccess={({ numPages }) => setNumPages(numPages)}
>
  <Page pageNumber={1} />
</Document>
```

**Key Props:**

| Prop | Type | Description |
|------|------|-------------|
| `file` | string \| object \| Uint8Array | PDF source (URL, base64, data, import) |
| `className` | string | CSS class (default: `react-pdf__Document`) |
| `loading` | React.ReactNode | Content while loading |
| `error` | React.ReactNode | Content on error |
| `noData` | React.ReactNode | Content when no data |
| `onLoadSuccess` | function | Called when document loads |
| `onLoadError` | function | Called on loading error |
| `onLoadProgress` | function | Called during loading progress |
| `onPassword` | function | Called for password-protected PDFs |
| `onSourceSuccess` | function | Called when source is loaded |
| `onSourceError` | function | Called on source error |
| `options` | object | Configuration (cMapUrl, standardFontDataUrl, etc.) |
| `externalLinkRel` | string | `rel` attribute for links |
| `externalLinkTarget` | string | `target` attribute for links |
| `imageResourcesPath` | string | Path to image resources |
| `renderMode` | "canvas" \| "custom" \| "none" | Rendering mode for all pages |

**File Prop Formats:**
```typescript
// URL string
file="https://example.com/sample.pdf"

// File import
file={import('./sample.pdf')}

// Object with URL
file={{ url: 'https://example.com/sample.pdf' }}

// Base64 data URL
file="data:application/pdf;base64,..."

// Uint8Array
file={new Uint8Array([...])}

// Object with data
file={{ data: new Uint8Array([...]) }}

// Object with range (for HTTP range requests)
file={{ url: 'url', range: { length: 1024 } }}
```

---

### Page Component
Renders individual PDF pages.

**Basic Usage:**
```typescript
<Page
  pageNumber={1}
  width={600}
  renderTextLayer={true}
  renderAnnotationLayer={true}
/>
```

**Key Props:**

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `pageNumber` | number | 1 | Page to display (1-indexed) |
| `pageIndex` | number | 0 | Page to display (0-indexed) |
| `width` | number | - | Page width (auto-calculates height) |
| `height` | number | - | Page height (auto-calculates width) |
| `scale` | number | 1.0 | Scaling factor |
| `rotate` | number | 0 | Rotation angle (0, 90, 180, 270) |
| `renderMode` | "canvas" \| "custom" \| "svg" \| "none" | "canvas" | Rendering mode |
| `renderTextLayer` | boolean | true | Render text layer for selection |
| `renderAnnotationLayer` | boolean | true | Render annotations/links |
| `renderForms` | boolean | false | Render form elements |
| `devicePixelRatio` | number | window.devicePixelRatio | Pixel density |
| `className` | string | - | CSS class |
| `loading` | React.ReactNode | - | Loading content |
| `error` | React.ReactNode | - | Error content |
| `noData` | React.ReactNode | - | No data content |
| `canvasBackground` | string | - | Canvas background color |
| `canvasRef` | React.Ref | - | Ref to canvas element |
| `customTextRenderer` | function | - | Custom text rendering |
| `customRenderer` | function | - | Custom rendering (requires renderMode="custom") |

**Event Callbacks:**

| Callback | Description |
|----------|-------------|
| `onLoadSuccess` | Called when page loads successfully |
| `onLoadError` | Called on page loading error |
| `onRenderSuccess` | Called when page renders successfully |
| `onRenderError` | Called on rendering error |
| `onGetTextSuccess` | Called when text layer loads |
| `onGetTextError` | Called on text layer error |
| `onRenderTextLayerSuccess` | Called when text layer renders |
| `onRenderTextLayerError` | Called on text layer render error |
| `onGetAnnotationsSuccess` | Called when annotations load |
| `onGetAnnotationsError` | Called on annotation loading error |
| `onRenderAnnotationLayerSuccess` | Called when annotation layer renders |
| `onRenderAnnotationLayerError` | Called on annotation layer render error |

**Critical Best Practice:**
⚠️ **Never use CSS to auto-resize the canvas** - always provide explicit `scale`, `width`, or `height` props. Use `ResizeObserver` for responsive sizing.

---

### Outline Component
Displays PDF outline/table of contents.

**Basic Usage:**
```typescript
<Document file="sample.pdf">
  <Outline
    onItemClick={({ pageNumber }) => {
      setCurrentPage(pageNumber);
    }}
  />
</Document>
```

**Key Props:**

| Prop | Type | Description |
|------|------|-------------|
| `className` | string | CSS class (default: `react-pdf__Outline`) |
| `inputRef` | React.Ref | Ref to main div |
| `onItemClick` | function | Called when outline item clicked |
| `onLoadSuccess` | function | Called when outline loads |
| `onLoadError` | function | Called on outline loading error |

**Notes:**
- Should be placed inside `<Document>` or have `pdf` prop passed from `<Document>`'s `onLoadSuccess`
- Renders as simple nested HTML list (fully customizable with CSS)
- Some PDFs don't have outlines (will return null)

---

### Thumbnail Component
Displays page thumbnails (simplified Page component).

**Basic Usage:**
```typescript
<Document file="sample.pdf">
  <Thumbnail
    pageNumber={1}
    width={150}
    onItemClick={() => setCurrentPage(1)}
  />
</Document>
```

**Key Props:**
- Same as `<Page>` component EXCEPT:
  - ❌ No `renderAnnotationLayer` prop
  - ❌ No `renderTextLayer` prop
  - ❌ No annotation/text layer callbacks
  - ✅ Includes `onItemClick` for navigation

**Notes:**
- Does not render annotation or text layers (optimized for performance)
- Automatically navigates when clicked (similar to Outline items)
- Should be placed inside `<Document>` or have `pdf` prop passed

---

## 4. Worker Threads & Performance

### Worker Thread Architecture

**How It Works:**
- PDF.js uses Web Workers to offload heavy processing (parsing, rendering)
- Worker runs in separate thread → **doesn't block main thread**
- Critical for large documents (30+ pages)

**Configuration:**
```typescript
import { pdfjs } from 'react-pdf';

// Option 1: Import from node_modules (recommended)
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

// Option 2: External CDN (for CRA without ejecting)
pdfjs.GlobalWorkerOptions.workerSrc =
  '//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js';
```

**Worker Cleanup:**
```typescript
// Clean up worker resources when done
const loadingTask = pdfjs.getDocument(url);
// ... use document ...
loadingTask.destroy(); // Releases worker thread resources
```

### Large Document Performance

**Critical Threshold:**
> "If you need to render documents with 30 pages or more in the browser, using react-pdf directly can occupy the browser's main thread for a long time."

**PDF.js Recommendation:**
> "PDF.js recommends not rendering more than 25 pages at a time"

**Performance Issues:**
- Memory keeps increasing when loading pages or switching between pages
- Memory is not released until browser tab is closed
- With huge PDFs, can cause page crashes (memory up to 5GB)
- Potential memory leak with virtualization

**Solutions:**

1. **Virtualization** (react-window, react-virtuoso)
   ```typescript
   import { VariableSizeList } from 'react-window';

   // Only render visible pages
   <VariableSizeList
     height={800}
     itemCount={numPages}
     itemSize={index => pageHeights[index]}
   >
     {({ index, style }) => (
       <div style={style}>
         <Page pageNumber={index + 1} />
       </div>
     )}
   </VariableSizeList>
   ```

   **Trade-off**: ⚠️ Virtualization breaks text search (requires all text layers rendered)

2. **Progressive Loading**
   - Use HTTP range requests for partial content
   - Enable server support for `Partial Content` (HTTP 206)
   ```typescript
   <Document
     file={{
       url: 'https://example.com/large.pdf',
       range: { length: 1024 } // Initial chunk size
     }}
   />
   ```

3. **Optimize Pixel Density**
   ```typescript
   <Page
     pageNumber={1}
     devicePixelRatio={Math.min(2, window.devicePixelRatio)}
   />
   ```
   Caps pixel density to prevent excessive memory usage on high-DPI displays.

4. **Page Caching**
   - Cache rendered pages to avoid redundant rendering
   - Store rendered canvases in component state or context

5. **Lazy Loading**
   - Only render pages when they're in viewport
   - Use intersection observer for visibility detection

---

## 5. Annotations & Text Layer

### Annotation Layer

**What It Provides:**
- Clickable links (internal and external)
- Form fields (if enabled)
- Interactive PDF elements

**Enabling Annotations:**
```typescript
<Page
  pageNumber={1}
  renderAnnotationLayer={true}
  renderForms={false} // Forms require annotation layer
/>
```

**Styling Annotations:**
```typescript
import 'react-pdf/dist/Page/AnnotationLayer.css';
```

**Link Configuration:**
```typescript
<Document
  file="sample.pdf"
  externalLinkTarget="_blank"
  externalLinkRel="noopener noreferrer"
/>
```

**Callbacks:**
- `onGetAnnotationsSuccess` - Annotations loaded
- `onGetAnnotationsError` - Error loading annotations
- `onRenderAnnotationLayerSuccess` - Annotation layer rendered
- `onRenderAnnotationLayerError` - Error rendering annotation layer

**Custom Annotations:**
While react-pdf doesn't provide built-in annotation creation tools, you can overlay custom UI:

```typescript
<div style={{ position: 'relative' }}>
  <Page pageNumber={1} />
  <div
    style={{
      position: 'absolute',
      top: annotationY,
      left: annotationX,
      pointerEvents: 'none', // Don't interfere with PDF interactions
    }}
  >
    {/* Custom annotation UI */}
  </div>
</div>
```

### Text Layer

**What It Provides:**
- Text selection capability
- Copy/paste functionality
- Search foundation (requires all pages rendered)
- Accessibility features

**Enabling Text Layer:**
```typescript
<Page
  pageNumber={1}
  renderTextLayer={true}
/>
```

**Styling Text Layer:**
```typescript
import 'react-pdf/dist/Page/TextLayer.css';
```

**Getting Text Content:**
```typescript
function MyPage({ pageNumber }) {
  const [text, setText] = useState('');

  const onLoadSuccess = async (page) => {
    const textContent = await page.getTextContent({
      includeMarkedContent: true
    });

    // textContent.items contains:
    // - str: text string
    // - transform: positioning matrix
    // - width, height: dimensions
    // - dir: text direction

    const pageText = textContent.items
      .map(item => item.str)
      .join(' ');

    setText(pageText);
  };

  return <Page pageNumber={pageNumber} onLoadSuccess={onLoadSuccess} />;
}
```

**Text Layer Coordinates:**
The text layer uses viewport transforms to position text over the canvas. Each text item has:
- `transform`: 6-element matrix `[a, b, c, d, e, f]` for positioning
- Coordinates relative to PDF coordinate system (bottom-left origin)
- Need viewport transform to convert to screen coordinates

**Known Issues:**
- Text selection accuracy can be poor (inherits from PDF.js limitations)
- Text layer misalignment if canvas is CSS-resized (always use props for sizing)
- Text search requires all pages rendered (incompatible with virtualization)

---

## 6. Event System & Interactions

### Mouse Events

**Basic Click Handling:**
```typescript
<Page
  pageNumber={1}
  onClick={(event) => {
    console.log('Click at:', event.pageX, event.pageY);
  }}
  onDoubleClick={(event) => {
    // Handle double-click
  }}
/>
```

**Coordinate Mapping:**
```typescript
function handlePageClick(event, page) {
  // Get click position relative to page
  const rect = event.currentTarget.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;

  // Convert to PDF coordinates (requires viewport)
  const viewport = page.getViewport({ scale: 1.0 });
  const [pdfX, pdfY] = viewport.convertToPdfPoint(x, y);

  console.log('PDF coordinates:', pdfX, pdfY);
}
```

### Text Selection Events

**Detecting Selection:**
```typescript
useEffect(() => {
  const handleSelectionChange = () => {
    const selection = window.getSelection();
    const selectedText = selection?.toString();

    if (selectedText) {
      console.log('Selected text:', selectedText);
      // Get selection position for annotation overlay
      const range = selection.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      // Position annotation UI
    }
  };

  document.addEventListener('selectionchange', handleSelectionChange);
  return () => document.removeEventListener('selectionchange', handleSelectionChange);
}, []);
```

### Loading Events

**Document-Level:**
- `onLoadSuccess({ numPages })` - Document fully loaded
- `onLoadError(error)` - Error loading document
- `onLoadProgress({ loaded, total })` - Loading progress
- `onSourceSuccess` - PDF source loaded
- `onSourceError` - Error loading source

**Page-Level:**
- `onLoadSuccess(page)` - Page data loaded
- `onLoadError(error)` - Error loading page
- `onRenderSuccess` - Page rendered to canvas
- `onRenderError(error)` - Error rendering page

### Password-Protected PDFs

```typescript
<Document
  file="protected.pdf"
  onPassword={(callback, reason) => {
    const password = prompt('Enter PDF password:');
    callback(password);
  }}
/>
```

**Reasons for password request:**
- `1` - Need password (first attempt)
- `2` - Incorrect password (retry)

---

## 7. Styling & Customization

### CSS Classes

**Default Classes:**
- `.react-pdf__Document` - Document container
- `.react-pdf__Page` - Page container
- `.react-pdf__Page__canvas` - Canvas element
- `.react-pdf__Page__textContent` - Text layer container
- `.react-pdf__Page__annotations` - Annotation layer container
- `.react-pdf__Outline` - Outline container
- `.react-pdf__Thumbnail` - Thumbnail container

### Custom Styling Examples

**Responsive Page Width:**
```typescript
import { useState, useEffect, useRef } from 'react';

function ResponsivePage({ pageNumber }) {
  const [width, setWidth] = useState(0);
  const containerRef = useRef(null);

  useEffect(() => {
    const observer = new ResizeObserver(entries => {
      const { width } = entries[0].contentRect;
      setWidth(width);
    });

    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

    return () => observer.disconnect();
  }, []);

  return (
    <div ref={containerRef} style={{ width: '100%' }}>
      <Page pageNumber={pageNumber} width={width} />
    </div>
  );
}
```

**Custom Loading/Error States:**
```typescript
<Page
  pageNumber={1}
  loading={
    <div className="flex items-center justify-center h-96">
      <Spinner />
      <span>Loading page...</span>
    </div>
  }
  error={
    <div className="text-red-500">
      Failed to load page. Please try again.
    </div>
  }
  noData={
    <div className="text-gray-500">
      No page data available.
    </div>
  }
/>
```

**Custom Overlays:**
```typescript
<div className="relative">
  <Page pageNumber={1} />

  {/* Watermark overlay */}
  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
    <span className="text-6xl text-gray-300 opacity-20 rotate-45">
      CONFIDENTIAL
    </span>
  </div>

  {/* Annotation overlays */}
  {annotations.map(ann => (
    <div
      key={ann.id}
      className="absolute border-2 border-yellow-400 bg-yellow-100 bg-opacity-30"
      style={{
        top: ann.y,
        left: ann.x,
        width: ann.width,
        height: ann.height,
      }}
    />
  ))}
</div>
```

**Integration with Tailwind CSS:**
```typescript
<Document
  file={pdfFile}
  className="flex flex-col items-center gap-4 p-4"
>
  <Page
    pageNumber={1}
    className="shadow-lg rounded-lg overflow-hidden"
  />
</Document>
```

**Integration with Chakra UI:**
```typescript
import { Box, Center, Spinner } from '@chakra-ui/react';

<Document file={pdfFile}>
  <Page
    pageNumber={1}
    loading={
      <Center h="600px">
        <Spinner size="xl" />
      </Center>
    }
    className="chakra-pdf-page"
  />
</Document>
```

---

## 8. Rendering Modes

### Canvas Mode (Default, Recommended)

**Characteristics:**
- ✅ **Stable and performant**
- ✅ **Best browser compatibility**
- ✅ **No memory leaks**
- ✅ **Faster initial render**
- ❌ Requires re-paint on resize

**Usage:**
```typescript
<Page pageNumber={1} renderMode="canvas" />
```

**Performance:**
- Faster to load than SVG
- Can be viewed while painting/rendering
- Better for large documents
- Better scaling performance

### SVG Mode (Experimental, Not Recommended)

**Characteristics:**
- ✅ Can resize without re-painting
- ✅ Vector-based (crisp at any zoom)
- ❌ **Memory leak issues** (500-600 MB for 14 pages)
- ❌ **Can crash mobile apps**
- ❌ Safari rendering bugs
- ❌ Slow scale changes (all children re-render)
- ❌ Not officially supported by Mozilla

**Usage:**
```typescript
<Page pageNumber={1} renderMode="svg" />
```

**Known Issues:**
- Warning: "TT: undefined function" in console
- Backgrounds not displayed on Safari
- Image-based PDFs flash white during scroll
- Complete render required before viewing (vs canvas progressive)

**When to Use:**
- Simple PDFs only
- Specific text rendering requirements
- User explicitly opts in with understanding of risks

### Custom Mode

**For advanced custom rendering:**
```typescript
<Page
  pageNumber={1}
  renderMode="custom"
  customRenderer={({ viewport, page }) => {
    // Custom rendering logic
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');

    const renderContext = {
      canvasContext: context,
      viewport: viewport,
    };

    return page.render(renderContext).promise;
  }}
/>
```

### None Mode

**When you only need data, not rendering:**
```typescript
<Page
  pageNumber={1}
  renderMode="none"
  onLoadSuccess={async (page) => {
    // Get text content without rendering
    const text = await page.getTextContent();
    // Process text data...
  }}
/>
```

**Recommendation:**
> 🎯 **Always use Canvas mode for production** unless you have specific requirements and understand SVG limitations.

---

## 9. Browser Compatibility & SSR

### Browser Support

**Compatibility depends on PDF.js support:**
- ✅ Chrome (latest)
- ✅ Firefox (latest)
- ✅ Safari (latest)
- ✅ Edge (latest)
- ⚠️ Older browsers may need polyfills

**React Requirements:**
- React 16.8+ (hooks support)
- Works with Preact as alternative

### Next.js Integration

**Critical Requirement:**
⚠️ **Must disable SSR** - react-pdf requires browser APIs

**Pages Router:**
```typescript
import dynamic from 'next/dynamic';

const PDFViewer = dynamic(
  () => import('../components/PDFViewer'),
  { ssr: false }
);

export default function Page() {
  return <PDFViewer />;
}
```

**App Router:**
```typescript
// PDFViewer.tsx
'use client';

import { Document, Page } from 'react-pdf';
import { pdfjs } from 'react-pdf';

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

export default function PDFViewer({ file }) {
  return (
    <Document file={file}>
      <Page pageNumber={1} />
    </Document>
  );
}
```

**Next.js 15 Compatibility:**
- Next.js 15 uses React 19 RC in App Router
- Must use client components (`'use client'`)
- No SSR support (fundamental limitation)
- Dynamic imports with `ssr: false` for Pages Router

### React 19 Compatibility

**Status:**
- ❌ **No explicit React 19 support documented**
- ⚠️ Latest version (10.2.0) designed for React 18
- May work with React 19 but not officially tested

**Note:** Different from `@react-pdf/renderer` which supports React 19 as of v4.1.0.

---

## 10. Known Issues & Gotchas

### 1. Worker Configuration Issues

**Problem:** PDF fails to load with "Failed to load PDF file" error
**Cause:** Worker not configured or returning HTML instead of JS

**Solution:**
```typescript
// Configure worker properly
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

// Or use CDN for CRA
pdfjs.GlobalWorkerOptions.workerSrc =
  `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;
```

### 2. File Object Re-rendering

**Problem:** PDF reloads constantly or fetches twice
**Cause:** Object references change every render

**Solution:**
```typescript
// ❌ Bad - creates new object every render
<Document file={{ url: 'path.pdf' }} />

// ✅ Good - memoize the file object
const fileConfig = useMemo(() => ({ url: 'path.pdf' }), []);
<Document file={fileConfig} />

// ✅ Good - use state
const [file] = useState({ url: 'path.pdf' });
<Document file={file} />
```

### 3. Text Layer Misalignment

**Problem:** Text selection doesn't match visible text
**Cause:** Canvas resized with CSS instead of props

**Solution:**
```typescript
// ❌ Bad - CSS resizing
<Page pageNumber={1} style={{ width: '100%' }} />

// ✅ Good - explicit width/scale
<Page pageNumber={1} width={600} />

// ✅ Good - responsive with ResizeObserver
const [width, setWidth] = useState(0);
useEffect(() => {
  const observer = new ResizeObserver(entries => {
    setWidth(entries[0].contentRect.width);
  });
  // ... observe container
}, []);
<Page pageNumber={1} width={width} />
```

### 4. CORS / Same-Origin Issues

**Problem:** "Failed to load PDF file" for external URLs
**Cause:** Same-Origin Policy restrictions

**Solutions:**
1. Add CORS headers on PDF server: `Access-Control-Allow-Origin: *`
2. Use server-side proxy to fetch PDF
3. Convert to base64 data URL

### 5. Nothing Renders

**Problem:** Document component shows nothing
**Cause:** Document only provides context, doesn't render by itself

**Solution:**
```typescript
// ❌ Bad - no pages to render
<Document file="pdf.pdf" />

// ✅ Good - specify what to render
<Document file="pdf.pdf">
  <Page pageNumber={1} />
</Document>
```

### 6. Large PDF Memory Issues

**Problem:** Browser crashes or freezes with large PDFs
**Symptoms:**
- Memory keeps increasing
- Memory not released until tab closed
- Can reach 5GB+ memory usage

**Solutions:**
1. Implement virtualization (only render visible pages)
2. Limit to 25 pages rendered at once
3. Use progressive loading with HTTP range requests
4. Cap `devicePixelRatio` to prevent excessive memory
5. Destroy loading tasks when done: `loadingTask.destroy()`

### 7. PDF.js Limitations

**Warnings You'll See:**
- "Warning: Knockout groups not supported"
- "Warning: TT: undefined function" (SVG mode)
- Chrome validation warnings about XMLHttpRequestResponseType

**Note:** These are PDF.js upstream issues, not react-pdf bugs.

### 8. Compatibility with react-file-viewer

**Problem:** Installing both libraries causes errors
**Solution:** Don't use both in same project (mutual incompatibility)

### 9. Base64 PDFs Format

**Problem:** Base64 PDFs don't load
**Cause:** Incorrect format

**Solution:**
```typescript
// ❌ Bad - raw base64
file={base64String}

// ✅ Good - data URL format
file={`data:application/pdf;base64,${base64String}`}
```

### 10. Webpack/Bundler Issues

**Problem:** Slow bundling or build failures
**Solutions:**
- Update Node.js and bundler versions
- Enable parallel minification: `parallel: true`
- Cache minification results

### 11. pnpm Specific Issue

**Problem:** Module not found errors with pnpm
**Solution:** Add to `.npmrc`:
```
public-hoist-pattern[]=pdfjs-dist
```

---

## 11. Common Patterns & Best Practices

### Pattern 1: Complete PDF Viewer Component

```typescript
'use client';

import { useState } from 'react';
import { Document, Page, Outline } from 'react-pdf';
import { pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

export default function PDFViewer({ fileUrl }) {
  const [numPages, setNumPages] = useState<number>();
  const [pageNumber, setPageNumber] = useState(1);
  const [scale, setScale] = useState(1.0);

  return (
    <div className="pdf-viewer">
      {/* Controls */}
      <div className="controls">
        <button onClick={() => setPageNumber(p => Math.max(1, p - 1))}>
          Previous
        </button>
        <span>
          Page {pageNumber} of {numPages}
        </span>
        <button onClick={() => setPageNumber(p => Math.min(numPages || 1, p + 1))}>
          Next
        </button>

        <button onClick={() => setScale(s => s * 1.2)}>Zoom In</button>
        <button onClick={() => setScale(s => s / 1.2)}>Zoom Out</button>
      </div>

      {/* PDF Document */}
      <Document
        file={fileUrl}
        onLoadSuccess={({ numPages }) => setNumPages(numPages)}
        loading={<div>Loading PDF...</div>}
        error={<div>Failed to load PDF</div>}
      >
        <Page
          pageNumber={pageNumber}
          scale={scale}
          renderTextLayer={true}
          renderAnnotationLayer={true}
        />
      </Document>
    </div>
  );
}
```

### Pattern 2: Virtualized Multi-Page Viewer

```typescript
import { VariableSizeList } from 'react-window';
import { Document, Page } from 'react-pdf';

function VirtualizedPDF({ fileUrl }) {
  const [numPages, setNumPages] = useState(0);
  const [pageHeights, setPageHeights] = useState<number[]>([]);

  const onPageLoadSuccess = (pageNumber: number, page) => {
    const viewport = page.getViewport({ scale: 1.0 });
    setPageHeights(prev => {
      const updated = [...prev];
      updated[pageNumber - 1] = viewport.height;
      return updated;
    });
  };

  return (
    <Document
      file={fileUrl}
      onLoadSuccess={({ numPages }) => {
        setNumPages(numPages);
        setPageHeights(new Array(numPages).fill(600)); // Initial estimate
      }}
    >
      <VariableSizeList
        height={800}
        itemCount={numPages}
        itemSize={index => pageHeights[index] || 600}
        width="100%"
      >
        {({ index, style }) => (
          <div style={style}>
            <Page
              pageNumber={index + 1}
              onLoadSuccess={(page) => onPageLoadSuccess(index + 1, page)}
            />
          </div>
        )}
      </VariableSizeList>
    </Document>
  );
}
```

**Trade-off:** ⚠️ Breaks text search across all pages

### Pattern 3: Text Extraction

```typescript
function TextExtractor({ fileUrl }) {
  const [extractedText, setExtractedText] = useState<string[]>([]);

  const onDocumentLoadSuccess = async ({ numPages }) => {
    const texts: string[] = [];

    for (let i = 1; i <= numPages; i++) {
      // Get page proxy
      const page = await document.getPage(i);

      // Extract text content
      const textContent = await page.getTextContent({
        includeMarkedContent: true
      });

      const pageText = textContent.items
        .map((item: any) => item.str)
        .join(' ');

      texts.push(pageText);
    }

    setExtractedText(texts);
  };

  return (
    <Document
      file={fileUrl}
      onLoadSuccess={onDocumentLoadSuccess}
    >
      {/* Render pages or just extract text */}
    </Document>
  );
}
```

### Pattern 4: Custom Annotations

```typescript
interface Annotation {
  id: string;
  pageNumber: number;
  x: number;
  y: number;
  width: number;
  height: number;
  text: string;
}

function AnnotatablePDF({ fileUrl }) {
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [selecting, setSelecting] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);

  const handleMouseDown = (e: React.MouseEvent) => {
    setSelecting(true);
    // Start selection...
  };

  const handleMouseUp = (e: React.MouseEvent) => {
    if (selecting) {
      // Create annotation from selection
      const selection = window.getSelection();
      const text = selection?.toString() || '';

      if (text) {
        const range = selection!.getRangeAt(0);
        const rect = range.getBoundingClientRect();

        const newAnnotation: Annotation = {
          id: Date.now().toString(),
          pageNumber: currentPage,
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height,
          text,
        };

        setAnnotations(prev => [...prev, newAnnotation]);
      }

      setSelecting(false);
    }
  };

  return (
    <div onMouseDown={handleMouseDown} onMouseUp={handleMouseUp}>
      <Document file={fileUrl}>
        <div style={{ position: 'relative' }}>
          <Page pageNumber={currentPage} />

          {/* Render annotation overlays */}
          {annotations
            .filter(ann => ann.pageNumber === currentPage)
            .map(ann => (
              <div
                key={ann.id}
                style={{
                  position: 'absolute',
                  top: ann.y,
                  left: ann.x,
                  width: ann.width,
                  height: ann.height,
                  border: '2px solid yellow',
                  backgroundColor: 'rgba(255, 255, 0, 0.3)',
                  pointerEvents: 'none',
                }}
                title={ann.text}
              />
            ))}
        </div>
      </Document>
    </div>
  );
}
```

### Pattern 5: Responsive with Outline

```typescript
function ResponsivePDFWithOutline({ fileUrl }) {
  const [numPages, setNumPages] = useState(0);
  const [pageNumber, setPageNumber] = useState(1);
  const [containerWidth, setContainerWidth] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new ResizeObserver(entries => {
      const { width } = entries[0].contentRect;
      setContainerWidth(width * 0.7); // 70% for PDF, 30% for outline
    });

    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

    return () => observer.disconnect();
  }, []);

  return (
    <div ref={containerRef} className="flex gap-4">
      {/* Outline sidebar (30%) */}
      <div className="w-[30%] overflow-auto">
        <Document file={fileUrl}>
          <Outline
            onItemClick={({ pageNumber }) => setPageNumber(pageNumber)}
          />
        </Document>
      </div>

      {/* PDF viewer (70%) */}
      <div className="w-[70%]">
        <Document
          file={fileUrl}
          onLoadSuccess={({ numPages }) => setNumPages(numPages)}
        >
          <Page
            pageNumber={pageNumber}
            width={containerWidth}
          />
        </Document>
      </div>
    </div>
  );
}
```

### Pattern 6: Progressive Loading

```typescript
function ProgressiveLoadingPDF({ fileUrl }) {
  const [progress, setProgress] = useState(0);
  const [loaded, setLoaded] = useState(false);

  return (
    <Document
      file={{
        url: fileUrl,
        range: { length: 1024 }, // Initial chunk
      }}
      onLoadProgress={({ loaded, total }) => {
        setProgress((loaded / total) * 100);
      }}
      onLoadSuccess={() => {
        setLoaded(true);
      }}
      loading={
        <div>
          Loading: {progress.toFixed(0)}%
          <progress value={progress} max={100} />
        </div>
      }
    >
      {loaded && <Page pageNumber={1} />}
    </Document>
  );
}
```

---

## 12. Comparison with Alternatives

### react-pdf vs pdfjs-dist

| Feature | react-pdf | pdfjs-dist |
|---------|-----------|------------|
| **Framework** | React-specific | Framework-agnostic |
| **API Style** | Declarative components | Imperative API |
| **Setup Complexity** | Low (components ready) | Medium (manual setup) |
| **UI** | None (build your own) | Optional Mozilla UI |
| **Flexibility** | Medium (React patterns) | High (full control) |
| **TypeScript** | Built-in types | @types package |
| **Bundle Size** | Larger (React + PDF.js) | Smaller (PDF.js only) |
| **Learning Curve** | Low (React developers) | Medium |
| **Use Case** | React apps needing basic PDF display | Custom implementations, non-React apps |

### react-pdf vs @react-pdf-viewer/core

| Feature | react-pdf (wojtekmaj) | @react-pdf-viewer/core |
|---------|----------------------|------------------------|
| **Built-in UI** | ❌ None | ✅ Full viewer UI |
| **Components** | Document, Page, Outline, Thumbnail | Complete viewer with plugins |
| **Customization** | Full (build from scratch) | Plugin system |
| **Development Time** | 2-4 months for production | Faster (pre-built features) |
| **File Size** | Smaller | Larger (includes UI) |
| **Annotations** | DIY | Built-in support |
| **Search** | DIY | Built-in |
| **Thumbnails** | Basic component | Full sidebar |
| **Use Case** | Custom PDF viewers, minimal UI | Full-featured PDF readers |

### Commercial Alternatives

**PSPDFKit / Nutrient:**
- ✅ Production-ready UI
- ✅ Advanced annotations
- ✅ Form filling
- ✅ Mobile SDKs
- ❌ License cost
- **Factor:** Minutes to production vs months with react-pdf

**Apryse (PDFTron):**
- ✅ Enterprise features
- ✅ Redaction, signatures
- ✅ Collaboration tools
- ❌ High licensing cost

**When to use react-pdf:**
- ✅ Simple PDF viewing needs
- ✅ Custom UI requirements
- ✅ Budget constraints
- ✅ Full control over implementation

**When to use commercial:**
- ❌ Need annotations/forms quickly
- ❌ Enterprise requirements (redaction, signatures)
- ❌ Limited development time
- ❌ Mobile apps required

---

## 13. Integration with Rhizome Architecture

### Compatibility Assessment

**✅ Compatible:**
- React 19 (App Router) - requires `'use client'`
- Next.js 15 - dynamic imports with `ssr: false`
- TypeScript - built-in types
- Tailwind CSS - standard CSS classes
- Server Actions - for PDF metadata operations
- Component-based architecture

**⚠️ Considerations:**
- Must be client component (no SSR)
- Worker configuration in browser only
- Need custom UI (no built-in controls)
- Memory management for large PDFs critical

### Recommended Architecture

**File Structure:**
```
src/
├── components/
│   ├── rhizome/
│   │   ├── pdf-viewer/
│   │   │   ├── PDFViewer.tsx          # Main viewer wrapper
│   │   │   ├── PDFPage.tsx            # Single page component
│   │   │   ├── PDFControls.tsx        # Navigation, zoom controls
│   │   │   ├── PDFOutline.tsx         # Table of contents
│   │   │   ├── PDFThumbnails.tsx      # Thumbnail sidebar
│   │   │   ├── PDFAnnotationLayer.tsx # Custom annotation overlay
│   │   │   └── pdf-viewer.css         # Viewer styles
│   └── reader/
│       └── PDFReader.tsx              # Document reader integration
├── app/
│   └── read/[id]/
│       └── page.tsx                   # PDF document page (Server Component)
└── lib/
    └── pdf/
        ├── worker-config.ts           # Worker initialization
        ├── pdf-utils.ts               # Text extraction, coordinates
        └── pdf-annotations.ts         # Annotation helpers
```

**Worker Configuration:**
```typescript
// lib/pdf/worker-config.ts
'use client';

import { pdfjs } from 'react-pdf';

// Initialize worker once
if (typeof window !== 'undefined') {
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url,
  ).toString();
}

export { pdfjs };
```

**Integration with ECS Annotations:**
```typescript
// components/reader/PDFReader.tsx
'use client';

import { useState, useEffect } from 'react';
import { Document, Page } from 'react-pdf';
import { AnnotationOperations } from '@/lib/ecs/annotations';
import { createECS } from '@/lib/ecs';

export function PDFReader({ documentId, userId }) {
  const [annotations, setAnnotations] = useState([]);
  const [numPages, setNumPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);

  // Load annotations from ECS
  useEffect(() => {
    const ecs = createECS();
    const ops = new AnnotationOperations(ecs, userId);

    // Query annotations for this document
    const docAnnotations = ops.getByDocument(documentId);
    setAnnotations(docAnnotations);
  }, [documentId, userId]);

  const handleTextSelection = async () => {
    const selection = window.getSelection();
    const text = selection?.toString();

    if (text && text.trim()) {
      // Create annotation via Server Action
      const result = await createAnnotation({
        documentId,
        chunkId: getCurrentChunkId(), // Map page to chunk
        text,
        pageNumber: currentPage,
        // ... position data
      });

      if (result.success) {
        setAnnotations(prev => [...prev, result.annotation]);
      }
    }
  };

  return (
    <div onMouseUp={handleTextSelection}>
      <Document
        file={`/api/documents/${documentId}/pdf`}
        onLoadSuccess={({ numPages }) => setNumPages(numPages)}
      >
        <div style={{ position: 'relative' }}>
          <Page
            pageNumber={currentPage}
            renderTextLayer={true}
            renderAnnotationLayer={true}
          />

          {/* Overlay ECS annotations */}
          <AnnotationLayer
            annotations={annotations.filter(
              ann => ann.pageNumber === currentPage
            )}
          />
        </div>
      </Document>
    </div>
  );
}
```

**Storage-First Integration:**
```typescript
// Markdown storage (primary source)
// PDF display (from Supabase Storage)
// Text extraction → chunks → embeddings

// Server Action for PDF processing
export async function processPDFDocument(documentId: string) {
  // 1. Extract text from PDF pages
  const pdfText = await extractPDFText(documentId);

  // 2. Convert to markdown (via Docling)
  const markdown = await convertToMarkdown(pdfText);

  // 3. Store markdown in Supabase Storage (source of truth)
  await uploadMarkdown(documentId, markdown);

  // 4. Chunk and embed
  await processDocument(documentId);

  // 5. PDF remains in storage for viewing
  // react-pdf loads from Supabase Storage URL
}
```

### Performance Considerations for Rhizome

**Large Document Strategy:**
```typescript
// For documents > 30 pages, use virtualization
import { VariableSizeList } from 'react-window';

function RhizomePDFViewer({ documentId }) {
  const { chunks } = useDocument(documentId);

  // Map pages to chunks for annotation context
  const pageToChunk = useMemo(() => {
    const mapping = new Map();
    chunks.forEach(chunk => {
      if (chunk.page_start && chunk.page_end) {
        for (let i = chunk.page_start; i <= chunk.page_end; i++) {
          mapping.set(i, chunk.id);
        }
      }
    });
    return mapping;
  }, [chunks]);

  return (
    <VariableSizeList
      height={800}
      itemCount={numPages}
      itemSize={index => pageHeights[index] || 600}
    >
      {({ index, style }) => (
        <div style={style} data-chunk-id={pageToChunk.get(index + 1)}>
          <Page
            pageNumber={index + 1}
            devicePixelRatio={Math.min(2, window.devicePixelRatio)}
          />
        </div>
      )}
    </VariableSizeList>
  );
}
```

**Memory Management:**
- Cap at 25 rendered pages (PDF.js recommendation)
- Use virtualization for large documents
- Destroy loading tasks when switching documents
- Monitor memory usage in development

**Persistent UI Integration:**
```typescript
// No modals - use ProcessingDock, RightPanel
function PDFWithRhizomeUI({ documentId }) {
  return (
    <div className="flex">
      {/* Main PDF viewer */}
      <div className="flex-1">
        <PDFViewer documentId={documentId} />
      </div>

      {/* RightPanel (6 tabs) */}
      <RightPanel>
        <AnnotationsTab documentId={documentId} />
        <OutlineTab /> {/* PDF outline */}
        <ConnectionsTab documentId={documentId} />
        {/* ... other tabs */}
      </RightPanel>

      {/* ProcessingDock (bottom-right) */}
      <ProcessingDock />
    </div>
  );
}
```

### Potential Challenges

1. **Text Selection → Annotation Mapping**
   - Need to map PDF coordinates to chunk IDs
   - Page numbers → chunk page_start/page_end
   - Text selection → ECS Position component

2. **Search Integration**
   - PDF text layer search vs chunk-based search
   - May need hybrid approach (search markdown, display in PDF)

3. **Annotation Persistence**
   - Store PDF coordinates in ECS Position component
   - Recalculate on zoom/scale changes
   - Handle page rotations

4. **Performance with Large PDFs**
   - Rhizome processes large documents (500+ pages)
   - Must use virtualization + memory management
   - Consider progressive loading from Supabase Storage

---

## 14. Recommendations for Rhizome

### ✅ Use react-pdf If:
1. You need full control over UI/UX
2. Custom annotation system required (ECS integration)
3. Want to build around existing Rhizome UI patterns
4. Budget constraints (no licensing costs)
5. Development time available (2-4 months for production UI)

### ⚠️ Consider Alternatives If:
1. Need annotations/forms immediately
2. Limited development resources
3. Mobile apps required
4. Enterprise features needed (redaction, signatures)

### Recommended Implementation Path

**Phase 1: Basic PDF Display (Week 1-2)**
- Set up worker configuration
- Basic Document + Page rendering
- Navigation controls (prev/next, zoom)
- Integration with RightPanel for controls

**Phase 2: Text Layer & Selection (Week 3-4)**
- Enable text layer rendering
- Text selection handling
- Basic highlight overlay
- Text extraction for chunks

**Phase 3: Annotation Integration (Week 5-6)**
- Map text selections to ECS annotations
- PDF coordinate → chunk mapping
- Position persistence
- Annotation overlay rendering

**Phase 4: Performance & UX (Week 7-8)**
- Implement virtualization for large PDFs
- Progressive loading optimization
- Responsive sizing with ResizeObserver
- Memory management

**Phase 5: Advanced Features (Week 9-10)**
- Outline/table of contents integration
- Thumbnail sidebar (optional)
- Search integration with chunks
- Print/export functionality

### Code Examples for Rhizome

See detailed integration examples in Section 13 above.

---

## 15. Additional Resources

**Official Documentation:**
- GitHub: https://github.com/wojtekmaj/react-pdf
- NPM: https://www.npmjs.com/package/react-pdf
- Website: https://projects.wojtekmaj.pl/react-pdf/

**Wikis:**
- Known Issues: https://github.com/wojtekmaj/react-pdf/wiki/Known-issues
- FAQ: https://github.com/wojtekmaj/react-pdf/wiki/Frequently-Asked-Questions

**Underlying Technology:**
- PDF.js by Mozilla: https://mozilla.github.io/pdf.js/

**Related Libraries:**
- pdfjs-dist: https://www.npmjs.com/package/pdfjs-dist
- @react-pdf-viewer/core: https://react-pdf-viewer.dev/
- react-window: https://github.com/bvaughn/react-window

**Tutorials:**
- Building React PDF viewer: https://www.nutrient.io/blog/how-to-build-a-reactjs-pdf-viewer-with-react-pdf/
- PDF.js + Next.js: https://pspdfkit.com/blog/2021/how-to-build-a-reactjs-viewer-with-pdfjs/

---

## 16. Summary & Key Takeaways

### Core Strengths
✅ Simple React integration with declarative components
✅ Built on solid foundation (PDF.js by Mozilla)
✅ TypeScript support out of the box
✅ Flexible - full control over UI/UX
✅ Active maintenance (400K weekly downloads)
✅ Free and open source

### Key Limitations
❌ No built-in UI (must build yourself)
❌ No SSR support (client-only)
❌ Memory issues with large PDFs (>30 pages needs virtualization)
❌ Text selection can be inaccurate (PDF.js limitation)
❌ No annotation tools out of box
❌ 2-4 months development for production-ready viewer

### Critical Requirements
🔴 Configure worker in browser (required)
🔴 Disable SSR for Next.js (fundamental limitation)
🔴 Memoize file objects (prevent re-renders)
🔴 Use props for sizing (never CSS resize)
🔴 Implement virtualization for large PDFs

### Best For
- Custom PDF viewers with specific UI requirements
- Integration with existing component systems (like Rhizome)
- Budget-conscious projects
- React applications needing basic PDF display
- Projects where full control is more important than speed to market

### Not Best For
- Quick prototypes needing full features immediately
- Projects without React development resources
- Mobile-first applications (consider native SDKs)
- Enterprise requirements (forms, signatures, redaction)

### Decision for Rhizome
Given Rhizome's requirements:
- ✅ Custom ECS annotation system
- ✅ Existing persistent UI patterns (RightPanel, ProcessingDock)
- ✅ React 19 + Next.js 15 architecture
- ✅ Storage-first portability approach
- ✅ Full control over UX

**Recommendation**: react-pdf is a **strong fit** for Rhizome's PDF viewer needs, with the understanding that significant custom development will be required for production-ready features (2-4 months estimated). The flexibility aligns well with Rhizome's architecture patterns and allows for deep integration with the ECS annotation system.

---

## Appendix: Quick Reference

### Installation
```bash
npm install react-pdf
```

### Worker Setup
```typescript
import { pdfjs } from 'react-pdf';
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();
```

### Basic Usage
```typescript
import { Document, Page } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

<Document file="sample.pdf" onLoadSuccess={({ numPages }) => {}}>
  <Page pageNumber={1} />
</Document>
```

### Common Props
```typescript
// Document
file: string | { url: string } | Uint8Array
onLoadSuccess: ({ numPages }) => void

// Page
pageNumber: number
width: number
scale: number
renderTextLayer: boolean
renderAnnotationLayer: boolean
```

### Performance Tips
- Use virtualization for >25 pages
- Cap devicePixelRatio to 2
- Enable HTTP range requests
- Memoize file objects
- Use ResizeObserver for responsive sizing

### Next.js Integration
```typescript
// Pages Router
const PDFViewer = dynamic(() => import('./PDFViewer'), { ssr: false });

// App Router
'use client';
// ... component code
```
