# Unified Preview for All Upload Types

**Status**: Ready to implement
**Priority**: High (UX consistency)
**Estimated Time**: 3-4 hours

## Overview

Currently, only PDFs show a preview/metadata detection stage before upload. EPUBs, Markdown, and Text files skip directly to upload. This plan adds consistent preview functionality for all file types.

## Why This Matters

1. **Consistent UX**: Same flow for all uploads (detect → preview → confirm → upload)
2. **User Control**: Users can correct auto-detected metadata before processing
3. **Better Metadata**: Especially important for EPUBs which have rich embedded metadata (ISBN, publisher, etc.)
4. **Minimal Overhead**: Preview parsing adds ~100ms to multi-minute processing jobs

## Current State

### PDF Flow (✅ Already Implemented)
```
User selects PDF
  ↓
Call /api/extract-metadata (Gemini Files API)
  ↓
Show DocumentPreview with title, author, type, cover
  ↓
User edits/confirms
  ↓
Upload to storage + create background job
```

### EPUB/Markdown/Text Flow (❌ Needs Implementation)
```
User selects file
  ↓
Immediately upload (no preview)
  ↓
Worker extracts metadata during processing
```

## Target State

### All File Types Flow
```
User selects file (PDF/EPUB/MD/TXT)
  ↓
Detect file type
  ↓
Call appropriate extraction:
  - PDF → /api/extract-metadata (Gemini Files API)
  - EPUB → extractEPUBMetadata (server action)
  - Markdown → extractMarkdownMetadata (server action)
  - Text → extractTextMetadata (server action)
  ↓
Show DocumentPreview with detected metadata
  ↓
User edits/confirms (title, author, type, cover)
  ↓
Upload with confirmed metadata
```

## Implementation Plan

### 1. Add Server Actions for Metadata Extraction

**File**: `src/app/actions/documents.ts`

#### 1.1 EPUB Metadata Extraction (High Priority)

```typescript
import { parseEPUB } from '@/../../worker/lib/epub/epub-parser'
import { inferDocumentType } from '@/../../worker/lib/epub/type-inference'

/**
 * Extract metadata from EPUB file for preview.
 * Fast operation (~100ms) that only parses OPF metadata and cover.
 * Does NOT parse chapters or convert HTML→Markdown.
 */
export async function extractEPUBMetadata(formData: FormData): Promise<{
  success: boolean
  metadata?: {
    title: string
    author: string
    type: DocumentType
    year?: number
    publisher?: string
    isbn?: string
    description?: string
    coverImage?: string // base64 encoded
  }
  error?: string
}> {
  try {
    const file = formData.get('file') as File
    if (!file) {
      return { success: false, error: 'No file provided' }
    }

    // Convert File to Buffer
    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    // Parse EPUB (only OPF metadata + cover, skip chapters)
    const { metadata, coverImage } = await parseEPUB(buffer)

    // Infer document type from metadata
    const documentType = inferDocumentType(metadata)

    // Extract publication year from date
    let year: number | undefined
    if (metadata.publicationDate) {
      const yearMatch = metadata.publicationDate.match(/\d{4}/)
      if (yearMatch) {
        year = parseInt(yearMatch[0])
      }
    }

    return {
      success: true,
      metadata: {
        title: metadata.title,
        author: metadata.author,
        type: mapToDocumentType(documentType),
        year,
        publisher: metadata.publisher,
        isbn: metadata.isbn,
        description: metadata.description,
        coverImage: coverImage ? coverImage.toString('base64') : undefined
      }
    }
  } catch (error) {
    console.error('EPUB metadata extraction failed:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to extract EPUB metadata'
    }
  }
}

/**
 * Map worker DocumentType to frontend DocumentType.
 */
function mapToDocumentType(workerType: 'fiction' | 'technical_manual' | 'academic_paper'): DocumentType {
  switch (workerType) {
    case 'fiction':
      return 'fiction'
    case 'technical_manual':
      return 'technical_manual'
    case 'academic_paper':
      return 'academic_paper'
    default:
      return 'nonfiction_book'
  }
}
```

#### 1.2 Markdown Metadata Extraction (Optional, Lower Priority)

```typescript
/**
 * Extract metadata from Markdown file for preview.
 * Simple parsing of frontmatter and first heading.
 */
export async function extractMarkdownMetadata(formData: FormData): Promise<{
  success: boolean
  metadata?: {
    title: string
    author: string
    type: DocumentType
    wordCount: number
  }
  error?: string
}> {
  try {
    const file = formData.get('file') as File
    if (!file) {
      return { success: false, error: 'No file provided' }
    }

    const text = await file.text()

    // Try to extract title from first # heading
    const headingMatch = text.match(/^#\s+(.+)$/m)
    const title = headingMatch ? headingMatch[1].trim() : file.name.replace(/\.md$/, '')

    // Calculate word count
    const wordCount = text.split(/\s+/).length

    return {
      success: true,
      metadata: {
        title,
        author: '', // User will fill in preview
        type: 'article', // Default, user can change
        wordCount
      }
    }
  } catch (error) {
    console.error('Markdown metadata extraction failed:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to extract Markdown metadata'
    }
  }
}
```

#### 1.3 Text Metadata Extraction (Optional, Lower Priority)

```typescript
/**
 * Extract metadata from text file for preview.
 * Minimal metadata - just filename and word count.
 */
export async function extractTextMetadata(formData: FormData): Promise<{
  success: boolean
  metadata?: {
    title: string
    author: string
    type: DocumentType
    wordCount: number
  }
  error?: string
}> {
  try {
    const file = formData.get('file') as File
    if (!file) {
      return { success: false, error: 'No file provided' }
    }

    const text = await file.text()
    const wordCount = text.split(/\s+/).length

    return {
      success: true,
      metadata: {
        title: file.name.replace(/\.txt$/, ''),
        author: '', // User will fill in preview
        type: 'article', // Default, user can change
        wordCount
      }
    }
  } catch (error) {
    console.error('Text metadata extraction failed:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to extract text metadata'
    }
  }
}
```

### 2. Update UploadZone Component

**File**: `src/components/library/UploadZone.tsx`

#### 2.1 Update handleFileSelect Function

```typescript
/**
 * Handles file selection and triggers metadata detection for ALL file types.
 * @param file - Selected file.
 */
const handleFileSelect = useCallback(async (file: File) => {
  setSelectedFile(file)
  setError(null)

  // Estimate cost
  const estimate = await estimateProcessingCost(file.size)
  setCostEstimate(estimate)

  // Detect source type
  const sourceType = getSourceTypeForFile(file)

  // START METADATA DETECTION FOR ALL TYPES
  setUploadPhase('detecting')

  try {
    let metadata: DetectedMetadata | null = null

    // Route to appropriate extraction based on source type
    if (sourceType === 'pdf') {
      // Use existing API route for PDF (requires Gemini Files API)
      const formData = new FormData()
      formData.append('file', file)

      console.log('🔍 Extracting PDF metadata from first 10 pages...')
      const response = await fetch('/api/extract-metadata', {
        method: 'POST',
        body: formData
      })

      if (!response.ok) {
        throw new Error('PDF metadata extraction failed')
      }

      metadata = await response.json()

    } else if (sourceType === 'epub') {
      // Use new server action for EPUB
      const formData = new FormData()
      formData.append('file', file)

      console.log('📚 Extracting EPUB metadata...')
      const result = await extractEPUBMetadata(formData)

      if (!result.success || !result.metadata) {
        throw new Error(result.error || 'EPUB metadata extraction failed')
      }

      metadata = result.metadata

    } else if (sourceType === 'markdown_asis' || sourceType === 'markdown_clean') {
      // Use server action for Markdown (optional)
      const formData = new FormData()
      formData.append('file', file)

      console.log('📝 Extracting Markdown metadata...')
      const result = await extractMarkdownMetadata(formData)

      if (!result.success || !result.metadata) {
        throw new Error(result.error || 'Markdown metadata extraction failed')
      }

      metadata = result.metadata

    } else if (sourceType === 'txt') {
      // Use server action for Text (optional)
      const formData = new FormData()
      formData.append('file', file)

      console.log('📄 Extracting text metadata...')
      const result = await extractTextMetadata(formData)

      if (!result.success || !result.metadata) {
        throw new Error(result.error || 'Text metadata extraction failed')
      }

      metadata = result.metadata
    }

    // Show preview with detected metadata
    if (metadata) {
      setDetectedMetadata(metadata)
      setUploadPhase('preview')
    } else {
      // Fallback: if no metadata detected, skip to upload
      setUploadPhase('idle')
    }

  } catch (error) {
    console.error('Metadata extraction error:', error)
    setError(error instanceof Error ? error.message : 'Metadata extraction failed')
    setUploadPhase('idle')
  }
}, [getSourceTypeForFile])
```

#### 2.2 Import New Server Actions

Add to imports at top of file:

```typescript
import {
  uploadDocument,
  estimateProcessingCost,
  extractEPUBMetadata,
  extractMarkdownMetadata,
  extractTextMetadata
} from '@/app/actions/documents'
```

### 3. Update DocumentPreview Component (if needed)

**File**: `src/components/upload/DocumentPreview.tsx`

The component should already handle all metadata fields. May need to:
- Add display for ISBN (for EPUBs)
- Add display for word count (for Markdown/Text)
- Handle optional cover images

```typescript
// Add to DetectedMetadata interface if not present
export interface DetectedMetadata {
  title: string
  author: string
  type: DocumentType
  year?: number
  publisher?: string
  description?: string
  isbn?: string        // For EPUBs
  wordCount?: number   // For Markdown/Text
  coverImage?: string  // base64 encoded image
}
```

## Files to Touch

### Backend
1. **`src/app/actions/documents.ts`**
   - Add `extractEPUBMetadata()` server action
   - Add `extractMarkdownMetadata()` server action (optional)
   - Add `extractTextMetadata()` server action (optional)
   - Add `mapToDocumentType()` helper function

### Frontend
2. **`src/components/library/UploadZone.tsx`**
   - Update `handleFileSelect()` to detect all file types
   - Add calls to new server actions
   - Import new server actions

3. **`src/components/upload/DocumentPreview.tsx`** (minor updates)
   - Update `DetectedMetadata` interface to include ISBN, wordCount
   - Add display for new metadata fields
   - Ensure cover image handling works for all types

### Worker (No Changes Needed)
- EPUB parser already exists and works
- Type inference already exists and works
- Just import these from worker in server actions

## Type Definitions

### Unified DetectedMetadata Interface

```typescript
// src/components/upload/DocumentPreview.tsx
export type DocumentType =
  | 'fiction'
  | 'nonfiction_book'
  | 'academic_paper'
  | 'technical_manual'
  | 'article'
  | 'essay'

export interface DetectedMetadata {
  title: string
  author: string
  type: DocumentType
  year?: number
  publisher?: string
  description?: string
  isbn?: string        // EPUB-specific
  wordCount?: number   // Markdown/Text-specific
  coverImage?: string  // base64 encoded (PDF via Gemini, EPUB from OPF)
}
```

## Performance Considerations

### EPUB Preview Parsing
- **OPF parsing**: ~50ms (XML parsing)
- **Cover extraction**: ~50ms (read image from ZIP)
- **Total**: ~100ms

### Worker Processing (Full EPUB)
- **Chapter HTML→MD conversion**: ~500ms
- **AI chunking 29 chapters**: ~30 seconds
- **Embedding generation**: ~10 seconds
- **Total**: ~40 seconds

**Overhead**: 100ms / 40,000ms = **0.25%** (negligible)

### Markdown/Text Preview
- **File reading**: ~10ms
- **Regex parsing**: ~5ms
- **Total**: ~15ms (virtually instant)

## Testing Plan

### 1. EPUB Testing
- [ ] Upload Moby Dick (Project Gutenberg)
- [ ] Verify metadata displays: title, author, publisher, description
- [ ] Verify cover image displays
- [ ] Verify type inference (should be 'fiction')
- [ ] Edit metadata and confirm changes persist
- [ ] Verify processing completes successfully

### 2. PDF Testing (Regression)
- [ ] Upload PDF to ensure existing flow still works
- [ ] Verify metadata extraction via Gemini
- [ ] Verify preview and confirm flow

### 3. Markdown Testing (Optional)
- [ ] Upload Markdown file
- [ ] Verify title extracted from heading
- [ ] Verify word count displayed
- [ ] Edit metadata and confirm

### 4. Text Testing (Optional)
- [ ] Upload text file
- [ ] Verify filename used as title
- [ ] Verify word count displayed
- [ ] Add author and type manually

## Implementation Order

### Phase 1: EPUB Preview (High Priority)
1. Add `extractEPUBMetadata` server action
2. Update `UploadZone.tsx` to call it for EPUBs
3. Update `DetectedMetadata` interface if needed
4. Test with Moby Dick

**Time**: 2 hours

### Phase 2: Markdown/Text Preview (Optional)
1. Add `extractMarkdownMetadata` server action
2. Add `extractTextMetadata` server action
3. Update `UploadZone.tsx` to call them
4. Test with sample files

**Time**: 1-2 hours

## Success Criteria

✅ All file types (PDF, EPUB, Markdown, Text) show preview before upload
✅ Users can edit metadata (title, author, type, cover) for all types
✅ EPUB metadata includes ISBN, publisher, description when available
✅ Cover images display correctly for both PDFs and EPUBs
✅ No regression in PDF upload flow
✅ Preview parsing adds <200ms overhead

## Notes

- **Keep PDF API route**: The async Gemini Files API pattern works well, no need to migrate
- **Server actions for EPUB/MD/TXT**: Fast local parsing doesn't need API routes
- **Reuse components**: `DocumentPreview` already handles all metadata fields
- **Graceful degradation**: If metadata extraction fails, allow upload anyway

## Future Enhancements

- Add frontmatter parsing for Markdown (YAML metadata)
- Extract author from PDF metadata when available
- Allow multiple cover image upload formats
- Add preview for YouTube videos (thumbnail + channel)
- Cache extracted metadata to avoid re-parsing on errors

---

**Status**: Ready to implement
**Next Step**: Start with Phase 1 (EPUB Preview)
