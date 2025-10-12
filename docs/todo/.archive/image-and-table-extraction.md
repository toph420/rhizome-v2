# Image and Table Extraction - Implementation Plan

**Status**: Planning
**Priority**: High (Natural extension of local pipeline)
**Estimated Effort**: 4-6 days
**Dependencies**: Local Processing Pipeline v1 (Phases 1-10 complete)

---

## Overview

Extend the local processing pipeline to extract figures and tables from PDFs and EPUBs using Docling's image extraction capabilities. Store figures as separate image files in Supabase Storage, and tables as structured markdown with metadata tracking in the database.

**Key Decisions**:
- ✅ REFERENCED mode (separate files, not embedded base64)
- ✅ Tables as structured markdown (using DataFrame export, not images)
- ✅ 144 DPI image quality (`images_scale=2.0`)
- ✅ Both PDF and EPUB support in one implementation
- ✅ New database tables for `figures` and `tables`

---

## Database Schema Design

### Table: `figures`

Store metadata about extracted figures/diagrams.

```sql
CREATE TABLE figures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Relationships
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  chunk_id UUID REFERENCES chunks(id) ON DELETE SET NULL,  -- Which chunk contains this figure

  -- Storage
  storage_path TEXT NOT NULL,  -- e.g., 'user-id/doc-id/images/page1_pic0.png'

  -- Metadata
  page_number INTEGER,  -- NULL for EPUB
  section_marker TEXT,  -- For EPUB (e.g., 'chapter_003')
  caption TEXT,  -- Extracted caption if available
  alt_text TEXT,  -- For accessibility

  -- Position data (from Docling provenance)
  bbox JSONB,  -- Bounding box coordinates {page, l, t, r, b}
  self_ref TEXT,  -- Docling reference (e.g., '#/pictures/0')

  -- Technical metadata
  image_format TEXT DEFAULT 'PNG',
  width INTEGER,  -- Image dimensions
  height INTEGER,
  file_size INTEGER,  -- Bytes

  -- Tracking
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Indexes
  UNIQUE(document_id, self_ref)
);

CREATE INDEX idx_figures_document ON figures(document_id);
CREATE INDEX idx_figures_chunk ON figures(chunk_id);
CREATE INDEX idx_figures_page ON figures(document_id, page_number) WHERE page_number IS NOT NULL;
```

### Table: `tables`

Store metadata and structured data for extracted tables.

```sql
CREATE TABLE tables (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Relationships
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  chunk_id UUID REFERENCES chunks(id) ON DELETE SET NULL,

  -- Structured data
  markdown TEXT NOT NULL,  -- Formatted markdown table
  structured_data JSONB,  -- Original DataFrame as JSON (for search/export)

  -- Metadata
  page_number INTEGER,  -- NULL for EPUB
  section_marker TEXT,  -- For EPUB
  caption TEXT,

  -- Position data
  bbox JSONB,
  self_ref TEXT,  -- e.g., '#/tables/0'

  -- Table characteristics
  num_rows INTEGER,
  num_columns INTEGER,
  has_headers BOOLEAN DEFAULT TRUE,

  -- Tracking
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(document_id, self_ref)
);

CREATE INDEX idx_tables_document ON tables(document_id);
CREATE INDEX idx_tables_chunk ON tables(chunk_id);
CREATE INDEX idx_tables_structured_data ON tables USING GIN(structured_data);  -- For JSON queries
```

### Migration File

**File**: `supabase/migrations/046_add_figures_and_tables.sql`

---

## Storage Structure

Organize images in Supabase Storage alongside document markdown:

```
Bucket: documents
Path structure:
  {userId}/
    {documentId}/
      markdown.md              (main document)
      images/
        page1_pic0.png         (figures)
        page3_pic1.png
        page5_pic2.png
      obsidian/                (existing)
        {documentId}.md
```

**Naming Convention**:
- PDF figures: `page{N}_pic{index}.png` (e.g., `page1_pic0.png`)
- EPUB figures: `section{marker}_pic{index}.png` (e.g., `section_chapter_003_pic0.png`)

**Storage Configuration**:
- Content-Type: `image/png`
- Upsert: `true` (allow re-processing)
- Public access: `true` (for reader UI to load images)

---

## Implementation Phases

### Phase 1: Database Migration (0.5 days)

**Tasks**:
1. Create migration `046_add_figures_and_tables.sql`
2. Add `figures` table with indexes
3. Add `tables` table with GIN index for JSONB
4. Test migration locally with `npx supabase db reset`

**Validation**:
```sql
-- Verify tables exist
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public' AND table_name IN ('figures', 'tables');

-- Verify indexes
SELECT indexname FROM pg_indexes
WHERE tablename IN ('figures', 'tables');
```

**Success Criteria**:
- [ ] Migration applies cleanly
- [ ] Both tables created with correct schema
- [ ] Indexes created (6 total: 3 for figures, 3 for tables)
- [ ] Foreign keys work (cascade deletes)

---

### Phase 2: Python Script Enhancement - PDF (1.5 days)

**File**: `worker/scripts/docling_extract.py`

**Tasks**:

1. **Add image extraction configuration** (lines 185-195)
```python
from docling.datamodel.pipeline_options import PdfPipelineOptions
from docling_core.types.doc import ImageRefMode, PictureItem, TableItem
from io import BytesIO
import base64

# Configure pipeline for images
pipeline_options = PdfPipelineOptions()
pipeline_options.images_scale = 2.0  # 144 DPI
pipeline_options.generate_picture_images = True
pipeline_options.generate_table_images = False  # We'll use structured data instead
pipeline_options.generate_page_images = False

converter = DocumentConverter(
    format_options={
        InputFormat.PDF: PdfFormatOption(pipeline_options=pipeline_options)
    }
)
```

2. **Extract figures** (new function ~50 lines)
```python
def extract_figures(doc) -> List[Dict[str, Any]]:
    """Extract figures from Docling document.

    Returns:
        List of figure metadata with base64-encoded image data
    """
    figures = []

    for idx, picture in enumerate(doc.pictures):
        try:
            # Get PIL image
            pil_image = picture.get_image(doc)

            # Convert to bytes
            img_buffer = BytesIO()
            pil_image.save(img_buffer, format="PNG")
            img_bytes = img_buffer.getvalue()

            # Extract metadata
            page_no = None
            bbox = None
            if picture.prov and len(picture.prov) > 0:
                page_no = picture.prov[0].page_no
                if hasattr(picture.prov[0], 'bbox'):
                    b = picture.prov[0].bbox
                    bbox = {
                        'page': page_no,
                        'l': float(b.l),
                        't': float(b.t),
                        'r': float(b.r),
                        'b': float(b.b)
                    }

            caption = picture.caption_text(doc) if hasattr(picture, 'caption_text') else None

            figures.append({
                'data': base64.b64encode(img_bytes).decode('utf-8'),  # Base64 for JSON transport
                'filename': f'page{page_no}_pic{idx}.png',
                'page_number': page_no,
                'self_ref': picture.self_ref,
                'caption': caption,
                'bbox': bbox,
                'width': pil_image.size[0],
                'height': pil_image.size[1],
                'file_size': len(img_bytes)
            })

            emit_progress('figures', 85, f'Extracted figure {idx + 1}/{len(doc.pictures)}')

        except Exception as e:
            print(f"Warning: Failed to extract figure {idx}: {e}", file=sys.stderr)
            continue

    return figures
```

3. **Extract tables as structured markdown** (new function ~60 lines)
```python
def extract_tables(doc) -> List[Dict[str, Any]]:
    """Extract tables as structured markdown + JSON.

    Returns:
        List of table metadata with markdown and structured data
    """
    tables = []

    for idx, table in enumerate(doc.tables):
        try:
            # Get structured data (Pandas DataFrame)
            df = table.export_to_dataframe()

            # Convert DataFrame to markdown table
            markdown = df.to_markdown(index=False)

            # Convert DataFrame to JSON for storage
            structured_data = df.to_dict('records')  # List of row dicts

            # Extract metadata
            page_no = None
            bbox = None
            if table.prov and len(table.prov) > 0:
                page_no = table.prov[0].page_no
                if hasattr(table.prov[0], 'bbox'):
                    b = table.prov[0].bbox
                    bbox = {
                        'page': page_no,
                        'l': float(b.l),
                        't': float(b.t),
                        'r': float(b.r),
                        'b': float(b.b)
                    }

            caption = table.caption_text(doc) if hasattr(table, 'caption_text') else None

            tables.append({
                'markdown': markdown,
                'structured_data': structured_data,
                'page_number': page_no,
                'self_ref': table.self_ref,
                'caption': caption,
                'bbox': bbox,
                'num_rows': len(df),
                'num_columns': len(df.columns)
            })

            emit_progress('tables', 88, f'Extracted table {idx + 1}/{len(doc.tables)}')

        except Exception as e:
            print(f"Warning: Failed to extract table {idx}: {e}", file=sys.stderr)
            continue

    return tables
```

4. **Integrate into main extraction function** (modify lines 240-244)
```python
# After chunking, before return
emit_progress('extraction', 80, 'Extracting figures')
figures = extract_figures(doc)

emit_progress('extraction', 85, 'Extracting tables')
tables_data = extract_tables(doc)

return {
    'markdown': markdown,
    'structure': structure,
    'chunks': chunks,
    'figures': figures,        # NEW
    'tables': tables_data      # NEW
}
```

**Validation**:
```bash
# Test with real PDF
python3 worker/scripts/docling_extract.py test.pdf '{"enable_chunking": true}'

# Verify output includes figures and tables
# Should see: {"type": "result", "data": {"markdown": "...", "figures": [...], "tables": [...]}}
```

**Success Criteria**:
- [ ] Figures extracted with metadata (page, bbox, caption)
- [ ] Images converted to base64 for JSON transport
- [ ] Tables converted to markdown format
- [ ] Structured data preserved as JSON
- [ ] Progress updates emitted
- [ ] Errors handled gracefully (don't fail extraction if image missing)

---

### Phase 3: Python Script Enhancement - EPUB (1 day)

**File**: `worker/scripts/docling_extract_epub.py`

**Tasks**:

1. **Add same image extraction logic**
   - Copy `extract_figures()` and `extract_tables()` functions
   - Modify for EPUB specifics (section markers instead of pages)

2. **Update filename pattern**
```python
# For EPUB, use section markers
filename = f'section_{section_marker}_pic{idx}.png'
# e.g., 'section_chapter_003_pic0.png'
```

3. **Handle EPUB structure**
```python
# EPUB sections don't have page numbers
figures.append({
    # ... other fields ...
    'page_number': None,  # Always None for EPUB
    'section_marker': section_marker,  # e.g., 'chapter_003'
    'filename': f'section_{section_marker}_pic{idx}.png'
})
```

**Validation**:
```bash
# Test with real EPUB
python3 worker/scripts/docling_extract_epub.py test.epub '{"enable_chunking": true}'

# Verify output includes figures with section markers
```

**Success Criteria**:
- [ ] Figures extracted from EPUB
- [ ] Section markers used instead of page numbers
- [ ] Filenames reflect EPUB structure
- [ ] Same metadata structure as PDF

---

### Phase 4: TypeScript Image Upload Handler (1 day)

**File**: `worker/lib/local/image-uploader.ts` (new file)

**Purpose**: Upload figure images to Supabase Storage and return public URLs.

```typescript
import { createClient } from '@supabase/supabase-js'

export interface FigureData {
  data: string          // Base64 encoded PNG
  filename: string      // e.g., 'page1_pic0.png'
  page_number?: number
  section_marker?: string
  self_ref: string
  caption?: string
  bbox?: any
  width: number
  height: number
  file_size: number
}

export interface TableData {
  markdown: string
  structured_data: any[]
  page_number?: number
  section_marker?: string
  self_ref: string
  caption?: string
  bbox?: any
  num_rows: number
  num_columns: number
}

/**
 * Upload figures to Supabase Storage and insert metadata into database.
 */
export async function uploadFigures(
  figures: FigureData[],
  documentId: string,
  userId: string
): Promise<void> {
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  for (const figure of figures) {
    try {
      // Decode base64 to buffer
      const imageBuffer = Buffer.from(figure.data, 'base64')

      // Storage path
      const storagePath = `${userId}/${documentId}/images/${figure.filename}`

      // Upload to storage
      const { error: uploadError } = await supabase.storage
        .from('documents')
        .upload(storagePath, imageBuffer, {
          contentType: 'image/png',
          upsert: true,
          cacheControl: '3600'  // 1 hour cache
        })

      if (uploadError) {
        console.error(`Failed to upload figure ${figure.filename}:`, uploadError)
        continue
      }

      // Insert metadata into database
      const { error: dbError } = await supabase
        .from('figures')
        .insert({
          document_id: documentId,
          storage_path: storagePath,
          page_number: figure.page_number,
          section_marker: figure.section_marker,
          caption: figure.caption,
          alt_text: figure.caption || 'Figure',  // Use caption as alt text
          bbox: figure.bbox,
          self_ref: figure.self_ref,
          image_format: 'PNG',
          width: figure.width,
          height: figure.height,
          file_size: figure.file_size
        })

      if (dbError) {
        console.error(`Failed to insert figure metadata:`, dbError)
      }

    } catch (error) {
      console.error(`Error processing figure ${figure.filename}:`, error)
      continue
    }
  }
}

/**
 * Insert tables into database with markdown and structured data.
 */
export async function saveTables(
  tables: TableData[],
  documentId: string
): Promise<void> {
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  for (const table of tables) {
    try {
      const { error } = await supabase
        .from('tables')
        .insert({
          document_id: documentId,
          markdown: table.markdown,
          structured_data: table.structured_data,
          page_number: table.page_number,
          section_marker: table.section_marker,
          caption: table.caption,
          bbox: table.bbox,
          self_ref: table.self_ref,
          num_rows: table.num_rows,
          num_columns: table.num_columns,
          has_headers: true  // Assume headers exist (can enhance later)
        })

      if (error) {
        console.error(`Failed to insert table:`, error)
      }

    } catch (error) {
      console.error(`Error processing table:`, error)
      continue
    }
  }
}

/**
 * Get public URLs for all figures in a document.
 * Used for markdown URL remapping.
 */
export async function getFigureUrls(
  documentId: string
): Promise<Map<string, string>> {
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: figures } = await supabase
    .from('figures')
    .select('storage_path, self_ref')
    .eq('document_id', documentId)

  const urlMap = new Map<string, string>()

  for (const figure of figures || []) {
    const { data: { publicUrl } } = supabase.storage
      .from('documents')
      .getPublicUrl(figure.storage_path)

    // Extract filename from storage path
    const filename = figure.storage_path.split('/').pop()!
    urlMap.set(filename, publicUrl)
  }

  return urlMap
}
```

**Validation**:
```typescript
// Test file: worker/lib/local/__tests__/image-uploader.test.ts

test('uploads figure to storage and database', async () => {
  const figures: FigureData[] = [{
    data: 'iVBORw0KGgo...', // base64 PNG
    filename: 'page1_pic0.png',
    page_number: 1,
    self_ref: '#/pictures/0',
    caption: 'Test figure',
    bbox: { page: 1, l: 0, t: 0, r: 100, b: 100 },
    width: 800,
    height: 600,
    file_size: 12345
  }]

  await uploadFigures(figures, 'doc-id', 'user-id')

  // Verify storage upload
  const { data: storageFile } = await supabase.storage
    .from('documents')
    .list('user-id/doc-id/images')

  expect(storageFile).toHaveLength(1)
  expect(storageFile[0].name).toBe('page1_pic0.png')

  // Verify database entry
  const { data: dbFigure } = await supabase
    .from('figures')
    .select('*')
    .eq('document_id', 'doc-id')
    .single()

  expect(dbFigure.page_number).toBe(1)
  expect(dbFigure.caption).toBe('Test figure')
})
```

**Success Criteria**:
- [ ] Images uploaded to correct storage path
- [ ] Metadata inserted into `figures` table
- [ ] Tables inserted into `tables` table with structured data
- [ ] Public URLs retrievable
- [ ] Error handling for upload/insert failures

---

### Phase 5: Markdown URL Remapping (0.5 days)

**File**: `worker/lib/local/markdown-remapper.ts` (new file)

**Purpose**: Replace figure references in markdown with Supabase Storage URLs.

```typescript
/**
 * Remap image references in markdown from local filenames to Storage URLs.
 *
 * Replaces:
 *   ![caption](page1_pic0.png)
 * With:
 *   ![caption](https://supabase.co/storage/v1/object/public/documents/user-id/doc-id/images/page1_pic0.png)
 */
export function remapImageUrls(
  markdown: string,
  imageUrls: Map<string, string>
): string {
  let result = markdown

  for (const [filename, url] of imageUrls.entries()) {
    // Match markdown image syntax: ![alt](filename)
    const regex = new RegExp(
      `!\\[([^\\]]*)\\]\\(${escapeRegex(filename)}\\)`,
      'g'
    )
    result = result.replace(regex, `![$1](${url})`)
  }

  return result
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
```

**Integration Point**: After Ollama cleanup, before storing markdown in Storage.

**Validation**:
```typescript
test('remaps image URLs in markdown', () => {
  const markdown = `
# Chapter 1

Some text here.

![Figure 1](page1_pic0.png)

More text.

![Figure 2](page3_pic1.png)
`

  const imageUrls = new Map([
    ['page1_pic0.png', 'https://storage.example.com/images/page1_pic0.png'],
    ['page3_pic1.png', 'https://storage.example.com/images/page3_pic1.png']
  ])

  const result = remapImageUrls(markdown, imageUrls)

  expect(result).toContain('![Figure 1](https://storage.example.com/images/page1_pic0.png)')
  expect(result).toContain('![Figure 2](https://storage.example.com/images/page3_pic1.png)')
})
```

**Success Criteria**:
- [ ] All image references remapped correctly
- [ ] Markdown syntax preserved
- [ ] Special characters in filenames handled

---

### Phase 6: Processor Integration - PDF (1 day)

**File**: `worker/processors/pdf-processor.ts`

**Tasks**:

1. **Add new stage after Ollama cleanup** (Stage 7)
```typescript
// Stage 7: Image and Table Extraction (72-78%)
if (processingMode === 'local' && result.figures) {
  await updateJobProgress(job.id, {
    stage: 'extracting_images',
    status: 'in_progress',
    progress: 72,
    metadata: {
      ...job.metadata,
      stats: {
        ...job.metadata?.stats,
        figures_count: result.figures.length,
        tables_count: result.tables.length
      }
    }
  })

  // Upload figures
  await uploadFigures(result.figures, documentId, userId)

  await updateJobProgress(job.id, { progress: 74 })

  // Save tables
  await saveTables(result.tables, documentId)

  await updateJobProgress(job.id, { progress: 76 })

  // Remap markdown URLs
  const figureUrls = await getFigureUrls(documentId)
  cleanedMarkdown = remapImageUrls(cleanedMarkdown, figureUrls)

  await updateJobProgress(job.id, { progress: 78 })
}
```

2. **Update progress ranges**
```typescript
// OLD: Bulletproof matching at 72-78%
// NEW: Bulletproof matching at 78-84%, images at 72-78%
```

**Validation**:
```bash
# Process a PDF with images locally
PROCESSING_MODE=local npm run dev:worker

# Upload PDF via UI
# Verify:
# 1. Figures uploaded to storage (check Supabase Storage UI)
# 2. Figures metadata in database (check Supabase Table Editor)
# 3. Tables in database with markdown
# 4. Markdown has correct image URLs
```

**Success Criteria**:
- [ ] Images extracted and uploaded
- [ ] Tables extracted and saved
- [ ] Markdown URLs remapped
- [ ] Progress updates accurate
- [ ] No errors in worker logs

---

### Phase 7: Processor Integration - EPUB (0.5 days)

**File**: `worker/processors/epub-processor.ts`

**Tasks**:
- Copy Stage 7 from PDF processor
- Adjust for EPUB specifics (section markers)
- Test with EPUB files

**Success Criteria**:
- [ ] EPUB images extracted
- [ ] Section markers used correctly
- [ ] Same functionality as PDF

---

### Phase 8: Reader UI Enhancement (1 day)

**Files**:
- `src/components/reader/DocumentReader.tsx`
- `src/components/reader/FigureViewer.tsx` (new)
- `src/components/reader/TableViewer.tsx` (new)

**Tasks**:

1. **Markdown renderer already supports images**
```typescript
// react-markdown automatically renders ![](url) syntax
// No changes needed to base renderer
```

2. **Add figure lightbox component**
```typescript
// Click on image → full screen lightbox with caption
export function FigureViewer({ figure }: { figure: Figure }) {
  return (
    <Dialog>
      <DialogTrigger>
        <img
          src={figure.storage_url}
          alt={figure.alt_text}
          className="cursor-zoom-in"
        />
      </DialogTrigger>
      <DialogContent className="max-w-6xl">
        <img src={figure.storage_url} alt={figure.alt_text} />
        {figure.caption && (
          <p className="text-sm text-muted-foreground mt-2">
            {figure.caption}
          </p>
        )}
      </DialogContent>
    </Dialog>
  )
}
```

3. **Add table metadata display**
```typescript
// Show table info on hover
export function TableViewer({ table }: { table: Table }) {
  return (
    <div className="relative group">
      <div dangerouslySetInnerHTML={{ __html: marked(table.markdown) }} />

      {table.caption && (
        <p className="text-sm text-muted-foreground mt-1">
          {table.caption}
        </p>
      )}

      {/* Show metadata on hover */}
      <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
        <Badge variant="outline">
          {table.num_rows} × {table.num_columns}
        </Badge>
      </div>
    </div>
  )
}
```

**Success Criteria**:
- [ ] Images render in markdown
- [ ] Click image → lightbox view
- [ ] Tables render as markdown
- [ ] Table metadata visible on hover

---

### Phase 9: Testing & Validation (1 day)

**Tests to Create**:

1. **Python script tests** (`worker/scripts/__tests__/`)
```python
# test_figure_extraction.py
def test_extract_figures_from_pdf():
    result = extract_with_chunking('test.pdf', {'enable_chunking': True})
    assert 'figures' in result
    assert len(result['figures']) > 0
    assert result['figures'][0]['data']  # Base64
    assert result['figures'][0]['page_number'] is not None

def test_extract_tables_as_markdown():
    result = extract_with_chunking('test.pdf', {'enable_chunking': True})
    assert 'tables' in result
    if len(result['tables']) > 0:
        assert result['tables'][0]['markdown'].startswith('|')
        assert result['tables'][0]['num_rows'] > 0
```

2. **TypeScript integration tests** (`worker/tests/integration/`)
```typescript
// image-extraction.test.ts
test('uploads figures to storage', async () => {
  const figures: FigureData[] = [mockFigure()]
  await uploadFigures(figures, 'doc-id', 'user-id')

  const { data } = await supabase
    .from('figures')
    .select('*')
    .eq('document_id', 'doc-id')

  expect(data).toHaveLength(1)
})

test('saves tables with structured data', async () => {
  const tables: TableData[] = [mockTable()]
  await saveTables(tables, 'doc-id')

  const { data } = await supabase
    .from('tables')
    .select('*')
    .eq('document_id', 'doc-id')

  expect(data).toHaveLength(1)
  expect(data[0].structured_data).toBeInstanceOf(Array)
})
```

3. **Manual testing checklist**
```markdown
## Manual Testing Checklist

### PDF Processing
- [ ] Upload PDF with figures (test with textbook or technical paper)
- [ ] Verify figures appear in Storage (Supabase UI)
- [ ] Check figures table has correct metadata
- [ ] Open document in reader, verify images load
- [ ] Click image → lightbox opens
- [ ] Verify tables render as markdown

### EPUB Processing
- [ ] Upload EPUB with images (test with illustrated ebook)
- [ ] Verify section markers used (not page numbers)
- [ ] Check images in reader
- [ ] Verify tables work

### Edge Cases
- [ ] PDF with no images (should not error)
- [ ] PDF with only tables
- [ ] Large images (>2MB)
- [ ] Corrupted image in PDF (should skip, not fail)
- [ ] Table with special characters

### Performance
- [ ] 50-page PDF with 10 images (<5 min total)
- [ ] 500-page PDF with 50 images (<80 min total)
- [ ] Check storage usage (images shouldn't bloat database)
```

**Success Criteria**:
- [ ] All unit tests pass
- [ ] Integration tests pass
- [ ] Manual checklist complete
- [ ] No errors in production-like environment

---

## Timeline & Milestones

### Week 1 (Days 1-3)
- **Day 1**: Phase 1 (Database migration) + Phase 2 start (PDF Python)
- **Day 2**: Phase 2 complete + Phase 3 (EPUB Python)
- **Day 3**: Phase 4 (TypeScript upload handler)

### Week 2 (Days 4-6)
- **Day 4**: Phase 5 (Markdown remapping) + Phase 6 (PDF processor)
- **Day 5**: Phase 7 (EPUB processor) + Phase 8 start (Reader UI)
- **Day 6**: Phase 8 complete + Phase 9 (Testing)

**Total: 6 days** (can compress to 4-5 days if needed)

---

## Success Metrics

### Functional Metrics
- ✅ Figures extracted from both PDF and EPUB
- ✅ Images stored in Supabase Storage with correct paths
- ✅ Metadata tracked in `figures` and `tables` tables
- ✅ Markdown URLs remapped to storage URLs
- ✅ Tables rendered as structured markdown
- ✅ Reader UI displays images and tables correctly

### Quality Metrics
- ✅ 144 DPI image quality (images_scale=2.0)
- ✅ <5% extraction failures (graceful error handling)
- ✅ All tests passing (unit + integration)
- ✅ No regression in existing pipeline

### Performance Metrics
- ✅ Image extraction adds <5 min to 50-page PDF
- ✅ Image extraction adds <15 min to 500-page PDF
- ✅ Storage usage reasonable (<50MB for typical book)

---

## Risks & Mitigations

### Risk 1: Memory Issues with Large Images
**Probability**: Medium
**Impact**: High (OOM errors)

**Mitigation**:
- Use `images_scale=2.0` (not higher)
- Don't enable `generate_page_images` (too large)
- Process images one at a time (not all in memory)
- Monitor memory usage during testing

### Risk 2: EPUB Image Extraction Less Mature
**Probability**: Medium
**Impact**: Medium (EPUB images might not work)

**Mitigation**:
- Implement PDF first, validate thoroughly
- Test EPUB extraction early in Phase 3
- Have fallback: skip images for EPUB if not working
- Document EPUB limitations if needed

### Risk 3: Storage Costs
**Probability**: Low
**Impact**: Medium (costs for image storage)

**Mitigation**:
- Use PNG compression (already default)
- Monitor storage usage
- Document typical costs (e.g., 1000 books = ~10GB)
- Personal tool = acceptable costs

### Risk 4: Markdown URL Remapping Complexity
**Probability**: Low
**Impact**: Medium (broken image links)

**Mitigation**:
- Comprehensive regex testing
- Validate with various filename patterns
- Integration test with real documents
- Error logging for failed remaps

---

## Dependencies

### External Libraries
- ✅ Docling 2.55.1 (already installed)
- ✅ PIL/Pillow (auto-installed with Docling)
- ✅ Pandas (for DataFrame export, already installed)

### Supabase Configuration
- ✅ Storage bucket `documents` (already exists)
- ✅ Public access for images (needs verification)
- 🔲 CORS configuration (may need update for image URLs)

### Environment Variables
- ✅ All existing variables sufficient
- 🔲 Optional: `MAX_IMAGE_SIZE` for limits

---

## Documentation Updates

After implementation:

1. **Update CLAUDE.md**
   - Add section on image/table extraction
   - Document new database tables
   - Update storage structure diagram

2. **Create user guide** (`docs/image-table-extraction.md`)
   - How images are extracted
   - How tables are structured
   - Storage costs estimation

3. **Update API documentation**
   - New database tables schema
   - Storage paths structure
   - Query patterns for figures/tables

---

## Future Enhancements (Post-MVP)

Not included in this plan, but worth considering later:

1. **OCR for scanned PDFs**
   - Use Docling's OCR capabilities
   - Extract text from images

2. **Image search**
   - Generate embeddings for figure captions
   - Enable semantic search across images

3. **Table search**
   - Full-text search in `structured_data` JSONB
   - Query tables across all documents

4. **Image annotations**
   - Allow user to annotate images
   - Store annotations separately

5. **Export with images**
   - Include images in ZIP exports
   - Maintain folder structure

---

## Questions to Resolve

Before starting implementation:

1. ✅ Storage preference: REFERENCED (confirmed)
2. ✅ Table strategy: Structured markdown (confirmed)
3. ✅ Image quality: 144 DPI (confirmed)
4. ✅ PDF + EPUB support: Both together (confirmed)
5. ✅ Database tables: Yes for figures and tables (confirmed)

---

## Ready to Start

All decisions made, plan is complete. Ready to begin Phase 1 (Database Migration).

**Next Steps**:
1. Review this plan
2. Create git branch: `feature/image-table-extraction`
3. Start Phase 1: Database migration
4. Work through phases sequentially
5. Test incrementally after each phase

---

**Status**: ✅ Plan Complete - Ready for Implementation
**Estimated Start Date**: TBD
**Estimated Completion**: 4-6 days after start
