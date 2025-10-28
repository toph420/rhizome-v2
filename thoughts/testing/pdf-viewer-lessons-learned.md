# PDF Viewer Implementation - Lessons Learned

**Date:** October 27, 2025
**Implementation:** PDF viewer with react-pdf + pdfjs-dist

---

## 🔴 Critical Lesson: Version Compatibility

### The Problem

**pdfjs-dist v5.x is INCOMPATIBLE with Next.js 15 webpack bundling**

**Error:** `Uncaught TypeError: Object.defineProperty called on non-object`

**Root Cause:**
- pdfjs-dist v5.4.296 uses ES modules (`.mjs`) with module-level code
- This code executes during webpack BUNDLING (not runtime)
- The code calls `Object.defineProperty()` on objects that don't exist in webpack context
- Even with dynamic imports + SSR disabled, webpack still bundles the module

### The Solution

**Use stable versions:**
```json
{
  "react-pdf": "9.1.1",
  "pdfjs-dist": "4.4.168"
}
```

**Key:** Match react-pdf's peer dependency exactly (not latest pdfjs-dist)

---

## ✅ Working Configuration

### 1. Package Versions
```bash
npm install react-pdf@9.1.1 pdfjs-dist@4.4.168
npm install @emotion/is-prop-valid  # framer-motion peer dep
```

### 2. Copy Static Assets
```javascript
// scripts/copy-pdf-assets.js
// Copy worker, cmaps, and standard_fonts to public/
node scripts/copy-pdf-assets.js
```

### 3. Component Configuration
```typescript
// PDFViewer.tsx and ThumbnailsTab.tsx
'use client'
import { pdfjs } from 'react-pdf'

// Configure worker - use local file
pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'
```

### 4. Dynamic Imports
```typescript
// ReaderLayout.tsx (client component with 'use client')
const PDFViewer = dynamic(
  () => import('@/components/rhizome/pdf-viewer/PDFViewer').then(mod => ({ default: mod.PDFViewer })),
  { ssr: false }
)

// LeftPanel.tsx
const ThumbnailsTab = dynamic(
  () => import('./tabs/ThumbnailsTab').then(mod => ({ default: mod.ThumbnailsTab })),
  { ssr: false }
)
```

### 5. Conditional Rendering
```typescript
// LeftPanel.tsx - only load when tab is active
<TabsContent value="thumbnails">
  {activeTab === 'thumbnails' && (
    <ThumbnailsTab {...props} />
  )}
</TabsContent>
```

### 6. Webpack Config
```typescript
// next.config.ts
webpack: (config) => {
  config.resolve.alias = {
    ...config.resolve.alias,
    canvas: false,  // Disable canvas (not needed for web)
  }
  return config
}
```

---

## ❌ What DOESN'T Work

### Attempts That Failed

1. **CDN URLs** - `//unpkg.com/pdfjs-dist@${version}/...`
   - Unreliable, protocol-relative URLs
   - External dependency

2. **`import.meta.url`** - Per official docs
   - Doesn't work in Next.js webpack context
   - Causes same bundling error

3. **Webpack externals** - Trying to skip bundling
   - Components still import the module
   - Module still gets parsed by webpack

4. **Module resolution rules** - `fullySpecified: false`
   - Doesn't fix the underlying ES module issue

5. **Latest versions** - react-pdf v10.x + pdfjs-dist v5.x
   - Breaking changes, incompatible with Next.js

### Key Insight

**The error happens at WEBPACK COMPILE TIME, not runtime.**

Even with:
- ✅ Dynamic imports (`{ ssr: false }`)
- ✅ Client-only rendering (`'use client'`)
- ✅ Conditional mounting

Webpack still needs to PARSE and BUNDLE the module, and that's where it fails with v5.x.

---

## 📋 Checklist for Future PDF Integration

When adding PDF support to a Next.js project:

- [ ] Use react-pdf v9.x (not v10.x)
- [ ] Use pdfjs-dist v4.4.168 (match peer dependency)
- [ ] Copy worker file to `public/` directory
- [ ] Configure worker with local path: `/pdf.worker.min.mjs`
- [ ] Use dynamic imports with `{ ssr: false }`
- [ ] Add `'use client'` to all components using react-pdf
- [ ] Set `canvas: false` in webpack config
- [ ] Test with real PDFs (both text-based and scanned)
- [ ] Clear `.next` cache when making config changes

---

## 🔍 Testing Notes

### Test Document Issues

**War Fever PDF:**
- 8.9 MB, 179 chunks
- Only 1 chunk has bbox data (likely scanned/image-based)
- No connections detected
- No PDF outline/TOC

**Recommendation for next test:**
- Use a **text-based PDF** (not scanned)
- Should have native text layer
- Should have table of contents
- Test with multiple formats (academic paper, book, article)

### OCR Support

**Current:** No OCR implemented
**Impact:** Scanned PDFs won't have selectable text
**Future:** Consider adding OCR pipeline (Tesseract.js or cloud OCR)

---

## 🎯 Success Criteria

✅ **Achieved:**
- PDF loads without errors
- Worker initializes correctly
- View toggles between Markdown and PDF
- Component architecture supports future features

⏳ **Pending Testing:**
- Text selection (needs text-based PDF)
- Annotation creation
- Chunk visualization
- Page navigation
- Zoom controls
- Thumbnail generation

---

## 📚 Resources

**Official Docs:**
- react-pdf: https://github.com/wojtekmaj/react-pdf
- PDF.js: https://mozilla.github.io/pdf.js/
- Next.js dynamic imports: https://nextjs.org/docs/app/guides/lazy-loading

**Working Example:**
- react-pdf v9.1.1 + pdfjs-dist v4.4.168
- Next.js 15.5.4
- This implementation!

---

## 💡 Key Takeaway

**Always match peer dependencies exactly.** Don't assume "latest" versions are compatible. When react-pdf says it needs pdfjs-dist v4.4.168, use exactly that version - not v4.8.69, not v5.x.

Version mismatches cause:
- API/Worker version errors
- Webpack bundling failures
- Subtle runtime issues
- Hours of debugging

**Trust the peer dependencies.**
