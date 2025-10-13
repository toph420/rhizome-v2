# Image and Table Extraction - Implementation Plan v2

**Status**: Ready for Implementation
**Priority**: High (Natural extension of local pipeline)
**Estimated Effort**: 5-6 days
**Dependencies**: Local Processing Pipeline v1 (Phases 1-10 complete)

**Last Updated**: 2025-10-11
**Version**: 2.0 (Revised with Obsidian integration and architectural fixes)

---

## Executive Summary

Extend the local processing pipeline to extract figures and tables from PDFs and EPUBs using Docling's image extraction capabilities. Store figures in Supabase Storage, tables as structured markdown in database, and provide seamless Obsidian integration with local image copies in vault.

### Key Architectural Decisions

✅ **REFERENCED mode** - Images referenced as `![caption](filename.png)` in markdown (not base64 embedded)
✅ **Storage as source of truth** - Images uploaded to Supabase Storage
✅ **Local copies for Obsidian** - Images downloaded to `.attachments/` folder in vault
✅ **AI cleanup preserves images** - Markdown keeps local refs, AI instructed to preserve syntax
✅ **Parallel upload** - Upload 5 images at a time (6x speedup vs sequential)
✅ **Extract during Stage 2** - Figures extracted with Docling (no re-extraction needed)
✅ **144 DPI quality** - `images_scale=2.0` for readable diagrams
✅ **Tables as markdown** - Structured data from DataFrames, not images
✅ **PDF + EPUB support** - Both formats in single implementation

---

## Architecture Overview

### Processing Pipeline Integration

```
┌──────────────────────────────────────────────────────────────────┐
│                   ENHANCED PDF PIPELINE (LOCAL MODE)             │
└──────────────────────────────────────────────────────────────────┘

Stage 1: Download (10-15%)
  ↓
Stage 2: Docling Extraction WITH FIGURES (15-50%)  ← MODIFIED
  • enableChunking=true
  • generateFigures=true  ← NEW
  • generateTables=true   ← NEW
  • Returns: markdown, chunks, figures[], tables[]
  • Cache ALL results in job.metadata.cached_extraction
  ↓
Stage 3: Regex Cleanup (50-55%)
  • Markdown has local refs: ![caption](page1_pic0.png)
  ↓
Stage 4: AI Cleanup (55-70%)
  • Instruction: PRESERVE ![...] syntax
  • Markdown still has: ![caption](page1_pic0.png)
  ↓
Stage 5: Review Checkpoint (optional)
  ↓
Stage 6: Image & Table Upload (70-76%)  ← NEW
  • Get cached figures/tables from job.metadata
  • Upload figures to storage (parallel batches of 5)
  • Insert figure metadata into database
  • Insert table data into database
  • DON'T remap markdown URLs (keep local refs)
  ↓
Stage 7: Bulletproof Matching (76-82%)  ← SHIFTED +6%
  ↓
Stage 8: Metadata Enrichment (82-92%)  ← SHIFTED +7%
  ↓
Stage 9: Local Embeddings (92-96%)  ← SHIFTED +2%
  ↓
Stage 10: Finalize (96-100%)  ← SHIFTED +1%

Total Time: ~20 min (+5 min from current 15 min)
```

### Obsidian Integration Flow

```
┌──────────────────────────────────────────────────────────────────┐
│                    OBSIDIAN EXPORT WITH IMAGES                   │
└──────────────────────────────────────────────────────────────────┘

exportToObsidian(documentId, userId):
  1. Download markdown from storage
     • Has local refs: ![caption](page1_pic0.png)

  2. Query figures table
     • Get storage_path and filename for all figures

  3. Download images to vault
     • Create .attachments/{document-id}/ directory
     • Download each figure to vault (parallel)
     • Example: .attachments/abc-123/page1_pic0.png

  4. Remap markdown for vault
     • FROM: ![caption](page1_pic0.png)
     • TO:   ![caption](.attachments/abc-123/page1_pic0.png)

  5. Write markdown to vault
     • User opens in Obsidian → sees images!

Vault Structure:
  /Rhizome/
    Gravity's Rainbow.md       ← Markdown with .attachments refs
    .attachments/
      abc-123/                 ← Document ID namespace
        page1_pic0.png
        page3_pic1.png
        page5_pic2.png
    .annotations/              ← Existing
      abc-123.json
```

### Sync Back Flow

```
syncFromObsidian(documentId, userId):
  1. Read edited markdown from vault
     • Has .attachments refs (Obsidian-specific)

  2. Upload to storage AS-IS
     • Don't strip .attachments refs (harmless)

  3. Reprocess document
     • New Docling extraction → new local refs
     • Old .attachments refs ignored (replaced)

  4. Re-export to Obsidian
     • Fresh .attachments/ download
     • Clean cycle

IMPORTANT: We DON'T need to reverse-remap markdown on sync.
Just upload as-is, reprocessing will create fresh refs.
```

---

## Database Schema Design

### Table: `figures`

```sql
CREATE TABLE figures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Relationships
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  chunk_id UUID REFERENCES chunks(id) ON DELETE SET NULL,

  -- Storage
  storage_path TEXT NOT NULL,  -- 'user-id/doc-id/images/page1_pic0.png'

  -- Metadata
  page_number INTEGER,  -- NULL for EPUB
  section_marker TEXT,  -- For EPUB (e.g., 'chapter_003')
  caption TEXT,
  alt_text TEXT,

  -- Position data (from Docling provenance)
  bbox JSONB,  -- {page, l, t, r, b}
  self_ref TEXT,  -- '#/pictures/0'

  -- Technical metadata
  image_format TEXT DEFAULT 'PNG',
  width INTEGER,
  height INTEGER,
  file_size INTEGER,

  -- Tracking
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(document_id, self_ref)
);

CREATE INDEX idx_figures_document ON figures(document_id);
CREATE INDEX idx_figures_chunk ON figures(chunk_id);
CREATE INDEX idx_figures_page ON figures(document_id, page_number)
  WHERE page_number IS NOT NULL;
```

### Table: `tables`

```sql
CREATE TABLE tables (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Relationships
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  chunk_id UUID REFERENCES chunks(id) ON DELETE SET NULL,

  -- Structured data
  markdown TEXT NOT NULL,        -- Formatted markdown table
  structured_data JSONB,          -- Original DataFrame as JSON

  -- Metadata
  page_number INTEGER,
  section_marker TEXT,
  caption TEXT,

  -- Position data
  bbox JSONB,
  self_ref TEXT,

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
CREATE INDEX idx_tables_structured_data ON tables USING GIN(structured_data);
```

### Storage Structure

```
Supabase Storage Bucket: documents
Path: {userId}/{documentId}/
  ├── content.md              (source of truth)
  ├── images/                  (NEW)
  │   ├── page1_pic0.png
  │   ├── page3_pic1.png
  │   └── page5_pic2.png
  └── obsidian/
      └── {documentId}.md      (backup copy)

Obsidian Vault:
Path: {vaultPath}/{exportPath}/
  ├── Document.md
  ├── .attachments/
  │   └── {documentId}/        (namespace by doc ID)
  │       ├── page1_pic0.png
  │       └── page3_pic1.png
  └── .annotations/
      └── {documentId}.json
```

---

## Implementation Phases

### Phase 1: Database Migration (0.5 days)

**File**: `supabase/migrations/046_add_figures_and_tables.sql`

**Tasks**:
1. Create `figures` table with indexes (3 indexes)
2. Create `tables` table with GIN index for JSONB (3 indexes)
3. Test migration locally

**Validation**:
```bash
# Reset database with new migration
npx supabase db reset

# Verify tables exist
npx supabase db execute "
SELECT table_name,
       (SELECT COUNT(*) FROM information_schema.columns
        WHERE table_name = t.table_name) as column_count
FROM information_schema.tables t
WHERE table_schema = 'public'
  AND table_name IN ('figures', 'tables')
"

# Verify indexes
npx supabase db execute "
SELECT tablename, indexname
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN ('figures', 'tables')
ORDER BY tablename, indexname
"
```

**Success Criteria**:
- [ ] Migration applies cleanly (no errors)
- [ ] `figures` table created with 10 columns
- [ ] `tables` table created with 11 columns
- [ ] 6 total indexes created (3 for figures, 3 for tables)
- [ ] Foreign keys work (cascade deletes)
- [ ] GIN index on `tables.structured_data` for JSON queries

**Deliverable**: Migration file committed

---

### Phase 2: Python Script Enhancement - PDF (1.5 days)

**File**: `worker/scripts/docling_extract.py`

**Goal**: Extract figures and tables during Docling call (Stage 2).

**Tasks**:

#### Task 2.1: Enable Image Extraction in Pipeline (30 min)

**Modify lines 185-195** (pipeline configuration):
```python
from docling.datamodel.pipeline_options import PdfPipelineOptions
from docling_core.types.doc import ImageRefMode, PictureItem, TableItem
from io import BytesIO
import base64

# Configure pipeline for images AND tables
pipeline_options = PdfPipelineOptions()
pipeline_options.images_scale = 2.0  # 144 DPI (balance quality vs size)
pipeline_options.generate_picture_images = True   # ← Enable figures
pipeline_options.generate_table_images = False    # ← Use structured data instead
pipeline_options.generate_page_images = False     # ← Don't need full pages

converter = DocumentConverter(
    format_options={
        InputFormat.PDF: PdfFormatOption(pipeline_options=pipeline_options)
    }
)
```

**Validation**:
```bash
python3 worker/scripts/docling_extract.py test.pdf '{"enable_chunking": true}'
# Should see additional logs about picture/table extraction
```

#### Task 2.2: Extract Figures Function (1 hour)

**Add new function** (~60 lines):
```python
def extract_figures(doc) -> List[Dict[str, Any]]:
    """Extract figures from Docling document.

    Returns:
        List of figure metadata with base64-encoded image data.

    Note: Images are base64-encoded for JSON transport to TypeScript.
    TypeScript will decode and upload to storage.
    """
    figures = []

    for idx, picture in enumerate(doc.pictures):
        try:
            # Get PIL image from Docling
            pil_image = picture.get_image(doc)

            # Convert to PNG bytes
            img_buffer = BytesIO()
            pil_image.save(img_buffer, format="PNG", optimize=True)
            img_bytes = img_buffer.getvalue()

            # Extract position metadata (page, bbox)
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

            # Extract caption if available
            caption = picture.caption_text(doc) if hasattr(picture, 'caption_text') else None

            figures.append({
                'data': base64.b64encode(img_bytes).decode('utf-8'),  # Base64 for JSON
                'filename': f'page{page_no}_pic{idx}.png',
                'page_number': page_no,
                'self_ref': picture.self_ref,
                'caption': caption,
                'bbox': bbox,
                'width': pil_image.size[0],
                'height': pil_image.size[1],
                'file_size': len(img_bytes)
            })

            # Progress update
            emit_progress('figures', 85, f'Extracted figure {idx + 1}/{len(doc.pictures)}')

        except Exception as e:
            # Don't fail entire extraction if one image fails
            print(f"Warning: Failed to extract figure {idx}: {e}", file=sys.stderr)
            sys.stdout.flush()
            continue

    return figures
```

**Validation**:
```python
# Test with PDF containing images
result = extract_figures(doc)
assert len(result) > 0, "Should extract at least one figure"
assert result[0]['data'].startswith('iVBORw0KGgo'), "Should be valid base64 PNG"
assert result[0]['page_number'] is not None, "Should have page number"
```

#### Task 2.3: Extract Tables Function (1.5 hours)

**Add new function** (~70 lines):
```python
def extract_tables(doc) -> List[Dict[str, Any]]:
    """Extract tables as structured markdown + JSON.

    Returns:
        List of table metadata with markdown and structured data.

    Note: We export to markdown (for display) AND JSON (for search/export).
    """
    tables = []

    for idx, table in enumerate(doc.tables):
        try:
            # Get structured data (Pandas DataFrame)
            df = table.export_to_dataframe()

            # Convert DataFrame to markdown table
            markdown = df.to_markdown(index=False)

            # Convert DataFrame to JSON for storage/search
            # Use 'records' format: [{col1: val1, col2: val2}, ...]
            structured_data = df.to_dict('records')

            # Extract position metadata
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

            # Extract caption
            caption = table.caption_text(doc) if hasattr(table, 'caption_text') else None

            tables.append({
                'markdown': markdown,
                'structured_data': structured_data,
                'page_number': page_no,
                'self_ref': table.self_ref,
                'caption': caption,
                'bbox': bbox,
                'num_rows': len(df),
                'num_columns': len(df.columns),
                'has_headers': True  # Assume headers exist (can enhance later)
            })

            # Progress update
            emit_progress('tables', 88, f'Extracted table {idx + 1}/{len(doc.tables)}')

        except Exception as e:
            # Don't fail entire extraction if one table fails
            print(f"Warning: Failed to extract table {idx}: {e}", file=sys.stderr)
            sys.stdout.flush()
            continue

    return tables
```

**Validation**:
```python
# Test with PDF containing tables
result = extract_tables(doc)
assert len(result) > 0, "Should extract at least one table"
assert result[0]['markdown'].startswith('|'), "Should be valid markdown table"
assert result[0]['num_rows'] > 0, "Should have rows"
assert isinstance(result[0]['structured_data'], list), "Should be list of dicts"
```

#### Task 2.4: Integrate into Main Function (30 min)

**Modify main extraction function** (around line 240):
```python
# After markdown and chunks extraction, before return

# Extract figures and tables (if enabled)
figures = []
tables_data = []

if options.get('enable_chunking', False):
    emit_progress('extraction', 80, 'Extracting figures')
    figures = extract_figures(doc)

    emit_progress('extraction', 85, 'Extracting tables')
    tables_data = extract_tables(doc)

# Return with new fields
return {
    'markdown': markdown,
    'structure': structure,
    'chunks': chunks if options.get('enable_chunking') else None,
    'figures': figures,      # NEW
    'tables': tables_data    # NEW
}
```

**Full Integration Test**:
```bash
# Test with real PDF containing images and tables
python3 worker/scripts/docling_extract.py test.pdf '{
  "enable_chunking": true
}'

# Expected output:
# {
#   "type": "result",
#   "data": {
#     "markdown": "...",
#     "chunks": [...],
#     "figures": [{
#       "data": "iVBORw0KGgo...",
#       "filename": "page1_pic0.png",
#       "page_number": 1,
#       ...
#     }],
#     "tables": [{
#       "markdown": "| Col1 | Col2 |\n|------|------|\n...",
#       "structured_data": [{"Col1": "val1", "Col2": "val2"}],
#       ...
#     }]
#   }
# }
```

**Success Criteria**:
- [ ] Figures extracted with base64 data
- [ ] Tables extracted as markdown + JSON
- [ ] Progress updates emitted (80%, 85%, 88%)
- [ ] Errors handled gracefully (don't crash on corrupted images)
- [ ] Script completes in <12 min for 500-page PDF with 50 images

**Deliverable**: Python script committed with figure/table extraction

---

### Phase 3: Python Script Enhancement - EPUB (1 day)

**File**: `worker/scripts/docling_extract_epub.py`

**Goal**: Same extraction logic for EPUBs.

**Tasks**:

1. **Copy functions from PDF script** (30 min)
   - Copy `extract_figures()` function
   - Copy `extract_tables()` function
   - Modify for EPUB specifics

2. **Update filename pattern** (15 min)
   ```python
   # For EPUB, use section markers instead of page numbers
   def get_section_marker(picture) -> str:
       """Extract section marker from EPUB (e.g., 'chapter_003')"""
       # EPUB sections are identified differently
       if picture.prov and len(picture.prov) > 0:
           # Extract from EPUB spine position
           return f'section_{picture.prov[0].section_id or "unknown"}'
       return 'section_unknown'

   # Update filename generation
   filename = f'{get_section_marker(picture)}_pic{idx}.png'
   # Result: 'section_chapter_003_pic0.png'
   ```

3. **Handle EPUB structure** (30 min)
   ```python
   # EPUB-specific metadata
   figures.append({
       'data': base64.b64encode(img_bytes).decode('utf-8'),
       'filename': filename,
       'page_number': None,  # ALWAYS None for EPUB
       'section_marker': get_section_marker(picture),  # EPUB spine position
       'self_ref': picture.self_ref,
       'caption': caption,
       'bbox': None,  # ALWAYS None for EPUB (no PDF coordinates)
       'width': pil_image.size[0],
       'height': pil_image.size[1],
       'file_size': len(img_bytes)
   })
   ```

4. **Integration test** (45 min)
   ```bash
   # Test with EPUB containing images
   python3 worker/scripts/docling_extract_epub.py test.epub '{
     "enable_chunking": true
   }'

   # Verify:
   # - Figures have section_marker (not page_number)
   # - Filenames reflect EPUB structure
   # - page_number and bbox are NULL
   ```

**Success Criteria**:
- [ ] Figures extracted from EPUB
- [ ] Section markers used instead of page numbers
- [ ] Filenames: `section_chapter_003_pic0.png`
- [ ] Same metadata structure as PDF (compatible)

**Deliverable**: EPUB script committed with figure/table extraction

---

### Phase 4: TypeScript Image Upload Handler (1.5 days)

**File**: `worker/lib/local/image-uploader.ts` (NEW)

**Goal**: Upload images to Supabase Storage in parallel batches.

**Tasks**:

#### Task 4.1: Type Definitions (15 min)

```typescript
export interface FigureData {
  data: string          // Base64 encoded PNG
  filename: string      // e.g., 'page1_pic0.png'
  page_number?: number  // NULL for EPUB
  section_marker?: string  // For EPUB
  self_ref: string      // Docling reference
  caption?: string
  bbox?: {
    page: number
    l: number
    t: number
    r: number
    b: number
  }
  width: number
  height: number
  file_size: number
}

export interface TableData {
  markdown: string
  structured_data: any[]  // List of row objects
  page_number?: number
  section_marker?: string
  self_ref: string
  caption?: string
  bbox?: any
  num_rows: number
  num_columns: number
  has_headers?: boolean
}

export interface UploadProgress {
  completed: number
  total: number
  currentBatch: number
  totalBatches: number
}
```

#### Task 4.2: Parallel Upload Implementation (2 hours)

```typescript
import { createClient } from '@supabase/supabase-js'

/**
 * Upload figures to Supabase Storage in parallel batches.
 *
 * Performance: Uploads 5 images at a time (balance speed vs memory).
 * 50 images sequential: ~8 minutes
 * 50 images parallel (5 at time): ~1.7 minutes (80% faster)
 *
 * @param figures - Array of figure data from Python extraction
 * @param documentId - Document ID for storage path
 * @param userId - User ID for storage path
 * @param options - Upload configuration
 */
export async function uploadFiguresParallel(
  figures: FigureData[],
  documentId: string,
  userId: string,
  options: {
    batchSize?: number
    onProgress?: (progress: UploadProgress) => Promise<void>
  } = {}
): Promise<void> {
  const { batchSize = 5, onProgress } = options

  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const totalBatches = Math.ceil(figures.length / batchSize)
  let completed = 0

  console.log(`[Image Upload] Starting parallel upload: ${figures.length} figures, ${totalBatches} batches`)

  for (let i = 0; i < figures.length; i += batchSize) {
    const batch = figures.slice(i, i + batchSize)
    const currentBatch = Math.floor(i / batchSize) + 1

    console.log(`[Image Upload] Batch ${currentBatch}/${totalBatches}: uploading ${batch.length} images`)

    // Upload batch in parallel using Promise.allSettled
    // (doesn't fail entire batch if one image fails)
    const results = await Promise.allSettled(
      batch.map(figure => uploadSingleFigure(supabase, figure, documentId, userId))
    )

    // Count successes
    const succeeded = results.filter(r => r.status === 'fulfilled').length
    const failed = results.filter(r => r.status === 'rejected').length

    completed += succeeded

    if (failed > 0) {
      console.warn(`[Image Upload] Batch ${currentBatch}: ${succeeded} succeeded, ${failed} failed`)
      // Log individual failures
      results.forEach((result, idx) => {
        if (result.status === 'rejected') {
          console.error(`[Image Upload] Failed to upload ${batch[idx].filename}:`, result.reason)
        }
      })
    }

    // Progress callback
    if (onProgress) {
      await onProgress({
        completed,
        total: figures.length,
        currentBatch,
        totalBatches
      })
    }
  }

  console.log(`[Image Upload] ✅ Complete: ${completed}/${figures.length} images uploaded`)
}

/**
 * Upload single figure to storage and insert metadata to database.
 * Used internally by uploadFiguresParallel.
 */
async function uploadSingleFigure(
  supabase: any,
  figure: FigureData,
  documentId: string,
  userId: string
): Promise<void> {
  // 1. Decode base64 to buffer
  const imageBuffer = Buffer.from(figure.data, 'base64')

  // 2. Storage path: {userId}/{documentId}/images/{filename}
  const storagePath = `${userId}/${documentId}/images/${figure.filename}`

  // 3. Upload to storage
  const { error: uploadError } = await supabase.storage
    .from('documents')
    .upload(storagePath, imageBuffer, {
      contentType: 'image/png',
      upsert: true,
      cacheControl: '3600'  // 1 hour cache
    })

  if (uploadError) {
    throw new Error(`Storage upload failed: ${uploadError.message}`)
  }

  // 4. Insert metadata into database
  const { error: dbError } = await supabase
    .from('figures')
    .insert({
      document_id: documentId,
      storage_path: storagePath,
      page_number: figure.page_number || null,
      section_marker: figure.section_marker || null,
      caption: figure.caption || null,
      alt_text: figure.caption || 'Figure',  // Use caption as alt text
      bbox: figure.bbox || null,
      self_ref: figure.self_ref,
      image_format: 'PNG',
      width: figure.width,
      height: figure.height,
      file_size: figure.file_size
    })

  if (dbError) {
    // Log error but don't throw (storage upload succeeded)
    console.error(`[Image Upload] Database insert failed for ${figure.filename}:`, dbError.message)
  }
}
```

#### Task 4.3: Table Saver (30 min)

```typescript
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

  console.log(`[Table Save] Saving ${tables.length} tables`)

  for (const table of tables) {
    try {
      const { error } = await supabase
        .from('tables')
        .insert({
          document_id: documentId,
          markdown: table.markdown,
          structured_data: table.structured_data,
          page_number: table.page_number || null,
          section_marker: table.section_marker || null,
          caption: table.caption || null,
          bbox: table.bbox || null,
          self_ref: table.self_ref,
          num_rows: table.num_rows,
          num_columns: table.num_columns,
          has_headers: table.has_headers ?? true
        })

      if (error) {
        console.error(`[Table Save] Failed to insert table:`, error.message)
      }

    } catch (error) {
      console.error(`[Table Save] Error:`, error)
      continue
    }
  }

  console.log(`[Table Save] ✅ Complete`)
}
```

**Validation**:
```typescript
// Test file: worker/lib/local/__tests__/image-uploader.test.ts

describe('Image Upload', () => {
  test('uploads figures in parallel', async () => {
    const mockFigures = createMockFigures(10)

    await uploadFiguresParallel(mockFigures, 'doc-id', 'user-id', {
      batchSize: 5
    })

    // Verify storage uploads (10 files)
    const { data: files } = await supabase.storage
      .from('documents')
      .list('user-id/doc-id/images')

    expect(files).toHaveLength(10)

    // Verify database entries (10 rows)
    const { data: figures } = await supabase
      .from('figures')
      .select('*')
      .eq('document_id', 'doc-id')

    expect(figures).toHaveLength(10)
  })

  test('handles upload failures gracefully', async () => {
    // One corrupted image in batch
    const figures = [
      createValidFigure(),
      createCorruptedFigure(),  // Invalid base64
      createValidFigure()
    ]

    await uploadFiguresParallel(figures, 'doc-id', 'user-id')

    // Should upload 2 valid images, log error for 1 corrupted
    const { data } = await supabase
      .from('figures')
      .select('*')
      .eq('document_id', 'doc-id')

    expect(data).toHaveLength(2)  // Only valid images
  })
})
```

**Success Criteria**:
- [ ] Parallel upload works (5 images at time)
- [ ] Progress callbacks invoked
- [ ] Failed uploads don't crash entire batch
- [ ] Images stored in correct path
- [ ] Metadata inserted correctly
- [ ] 50 images upload in <2 minutes

**Deliverable**: image-uploader.ts committed with tests

---

### Phase 5: Obsidian Export Enhancement (1 day)

**File**: `worker/handlers/obsidian-sync.ts`

**Goal**: Download images to vault when exporting, remap markdown paths.

**Tasks**:

#### Task 5.1: Add Export Figures Helper (1.5 hours)

**Insert after line 138** (after markdown written):

```typescript
// 4.5 Export figures to vault (NEW)
const hasFigures = await exportFiguresToVault(
  supabase,
  documentId,
  obsidianSettings.vaultPath,
  obsidianSettings.exportPath || '',
  document.title
)

if (hasFigures) {
  // Remap markdown to use vault-relative paths
  const markdownWithLocalImages = remapMarkdownToVaultPaths(
    markdown,
    documentId
  )

  // Re-write markdown with local image references
  await fs.writeFile(vaultFilePath, markdownWithLocalImages, 'utf-8')
  console.log(`[Obsidian Export] Markdown updated with local image references`)
}
```

**Add helper function** (at end of file):

```typescript
/**
 * Export figures to Obsidian vault.
 * Downloads images from storage to .attachments directory.
 *
 * Vault Structure:
 *   /Rhizome/
 *     Document.md
 *     .attachments/
 *       {document-id}/
 *         page1_pic0.png
 *         page3_pic1.png
 *
 * @returns true if figures were exported, false if none found
 */
async function exportFiguresToVault(
  supabase: any,
  documentId: string,
  vaultPath: string,
  exportPath: string,
  documentTitle: string
): Promise<boolean> {
  try {
    // Get figures for this document
    const { data: figures, error } = await supabase
      .from('figures')
      .select('storage_path, filename')
      .eq('document_id', documentId)

    if (error) {
      console.warn('[Obsidian Export] Failed to fetch figures:', error.message)
      return false
    }

    if (!figures || figures.length === 0) {
      console.log('[Obsidian Export] No figures to export')
      return false
    }

    console.log(`[Obsidian Export] Exporting ${figures.length} figures to vault`)

    // Create images directory: .attachments/{document-id}/
    const vaultImagesDir = path.join(
      vaultPath,
      exportPath,
      '.attachments',
      documentId
    )

    await fs.mkdir(vaultImagesDir, { recursive: true })

    // Download each image to vault
    let successCount = 0
    for (const figure of figures) {
      try {
        const { data: imageBlob, error: downloadError } = await supabase.storage
          .from('documents')
          .download(figure.storage_path)

        if (downloadError) {
          console.warn(`[Obsidian Export] Failed to download ${figure.filename}:`, downloadError.message)
          continue
        }

        const localPath = path.join(vaultImagesDir, figure.filename)
        const buffer = Buffer.from(await imageBlob.arrayBuffer())
        await fs.writeFile(localPath, buffer)

        successCount++
        console.log(`[Obsidian Export] Downloaded ${figure.filename} (${Math.round(buffer.length / 1024)}KB)`)

      } catch (error) {
        console.error(`[Obsidian Export] Error downloading ${figure.filename}:`, error)
        continue
      }
    }

    console.log(`[Obsidian Export] ✅ Exported ${successCount}/${figures.length} figures`)
    return successCount > 0

  } catch (error) {
    console.error('[Obsidian Export] Failed to export figures:', error)
    return false
  }
}
```

#### Task 5.2: Add Markdown Remapping Helper (1 hour)

```typescript
/**
 * Remap image references in markdown to vault-relative paths.
 *
 * Transforms:
 *   FROM: ![caption](page1_pic0.png)
 *   TO:   ![caption](.attachments/doc-id/page1_pic0.png)
 *
 * Also handles storage URLs (if markdown was already remapped):
 *   FROM: ![caption](https://storage.supabase.co/.../page1_pic0.png)
 *   TO:   ![caption](.attachments/doc-id/page1_pic0.png)
 *
 * @param markdown - Markdown content with image references
 * @param documentId - Document ID for namespacing
 * @returns Markdown with vault-relative image paths
 */
function remapMarkdownToVaultPaths(
  markdown: string,
  documentId: string
): string {
  let result = markdown

  // Pattern 1: Local filename references
  // ![caption](page1_pic0.png) → ![caption](.attachments/doc-id/page1_pic0.png)
  const localPattern = /!\[([^\]]*)\]\(([^/)]+\.png)\)/g
  result = result.replace(localPattern, (match, caption, filename) => {
    return `![${caption}](.attachments/${documentId}/${filename})`
  })

  // Pattern 2: Storage URLs (if already remapped by processor)
  // ![caption](https://storage.supabase.co/.../page1_pic0.png)
  // → ![caption](.attachments/doc-id/page1_pic0.png)
  const storageUrlPattern = /!\[([^\]]*)\]\(https:\/\/[^)]+\/([^/)]+\.png)\)/g
  result = result.replace(storageUrlPattern, (match, caption, filename) => {
    return `![${caption}](.attachments/${documentId}/${filename})`
  })

  return result
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
```

**Validation**:
```typescript
// Test file: worker/handlers/__tests__/obsidian-sync.test.ts

describe('Obsidian Image Export', () => {
  test('remaps local refs to vault paths', () => {
    const markdown = `
# Chapter 1

Some text here.

![Figure 1](page1_pic0.png)

More text.

![Figure 2](page3_pic1.png)
`

    const result = remapMarkdownToVaultPaths(markdown, 'abc-123')

    expect(result).toContain('![Figure 1](.attachments/abc-123/page1_pic0.png)')
    expect(result).toContain('![Figure 2](.attachments/abc-123/page3_pic1.png)')
    expect(result).not.toContain('](page1_pic0.png)')  // All refs remapped
  })

  test('downloads images to vault', async () => {
    // Setup: Upload test images to storage
    await uploadTestFigures('doc-id', 'user-id', 3)

    // Export to vault
    const result = await exportToObsidian('doc-id', 'user-id')

    expect(result.success).toBe(true)

    // Verify images exist in vault
    const vaultImagesDir = path.join(
      testVaultPath,
      'Rhizome',
      '.attachments',
      'doc-id'
    )

    const files = await fs.readdir(vaultImagesDir)
    expect(files).toHaveLength(3)
    expect(files).toContain('page1_pic0.png')
  })
})
```

**Success Criteria**:
- [ ] Images downloaded to `.attachments/{doc-id}/` in vault
- [ ] Markdown remapped to vault-relative paths
- [ ] User opens file in Obsidian → images display
- [ ] Export adds <5 seconds for document with 20 images

**Deliverable**: obsidian-sync.ts committed with image export

---

### Phase 6: PDF Processor Integration (1 day)

**File**: `worker/processors/pdf-processor.ts`

**Goal**: Integrate image upload at Stage 6, shift other stages.

**Tasks**:

#### Task 6.1: Cache Extraction Results (15 min)

**Modify Stage 2** (around line 126):

```typescript
// Stage 2: Extract PDF with Docling (15-50%)
// ...existing extraction code...

// Phase 2: Cache extraction result in job metadata
// CRITICAL: Must store figures AND tables for Stage 6
this.job.metadata = {
  ...this.job.metadata,
  cached_extraction: {
    markdown: extractionResult.markdown,
    structure: extractionResult.structure,
    doclingChunks: extractionResult.chunks,
    figures: extractionResult.figures || [],      // NEW
    tables: extractionResult.tables || []         // NEW
  }
}

console.log(
  `[PDFProcessor] Cached extraction: ` +
  `${extractionResult.chunks?.length || 0} chunks, ` +
  `${extractionResult.figures?.length || 0} figures, ` +
  `${extractionResult.tables?.length || 0} tables`
)
```

#### Task 6.2: Add Stage 6 - Image Upload (1.5 hours)

**Insert after Stage 5** (review checkpoint), before bulletproof matching:

```typescript
// Stage 6: Image & Table Upload (70-76%)
if (isLocalMode && this.job.metadata?.cached_extraction) {
  const { figures, tables } = this.job.metadata.cached_extraction

  if (figures && figures.length > 0) {
    console.log(`[PDFProcessor] LOCAL MODE: Uploading ${figures.length} figures and ${tables?.length || 0} tables`)

    await this.updateProgress(70, 'upload_figures', 'processing', 'Uploading figures to storage')

    // Import upload functions
    const { uploadFiguresParallel, saveTables } = await import('../lib/local/image-uploader.js')

    // Upload figures in parallel (batches of 5)
    await uploadFiguresParallel(
      figures,
      this.job.document_id,
      this.job.user_id,
      {
        batchSize: 5,
        onProgress: async (progress) => {
          // Map 0-100% to 70-74%
          const percent = 70 + Math.floor((progress.completed / progress.total) * 4)
          await this.updateProgress(
            percent,
            'upload_figures',
            'processing',
            `Uploading batch ${progress.currentBatch}/${progress.totalBatches}`
          )
        }
      }
    )

    await this.updateProgress(74, 'upload_figures', 'complete', `${figures.length} figures uploaded`)

    // Save tables
    if (tables && tables.length > 0) {
      await this.updateProgress(75, 'save_tables', 'processing', 'Saving tables')
      await saveTables(tables, this.job.document_id)
      await this.updateProgress(76, 'save_tables', 'complete', `${tables.length} tables saved`)
    }

    console.log(`[PDFProcessor] ✅ Image & table upload complete`)
  } else {
    console.log(`[PDFProcessor] No figures or tables to upload`)
    await this.updateProgress(76, 'upload_figures', 'skipped', 'No images in document')
  }
}
```

#### Task 6.3: Shift Existing Stages (30 min)

Update all subsequent stage progress percentages:

```typescript
// OLD: Stage 6: Bulletproof Matching (70-75%)
// NEW: Stage 7: Bulletproof Matching (76-82%)
await this.updateProgress(78, 'matching', 'processing', 'Remapping chunks...')
// ...matching code...
await this.updateProgress(82, 'matching', 'complete', `${finalChunks.length} chunks matched`)

// OLD: Stage 7: Metadata Enrichment (75-90%)
// NEW: Stage 8: Metadata Enrichment (82-92%)
await this.updateProgress(84, 'metadata', 'processing', 'Extracting metadata...')
// ...metadata code...
await this.updateProgress(92, 'metadata', 'complete', 'Metadata enrichment done')

// OLD: Stage 8: Local Embeddings (90-95%)
// NEW: Stage 9: Local Embeddings (92-96%)
await this.updateProgress(93, 'embeddings', 'processing', 'Generating embeddings...')
// ...embeddings code...
await this.updateProgress(96, 'embeddings', 'complete', 'Embeddings generated')

// OLD: Stage 9: Finalize (95-100%)
// NEW: Stage 10: Finalize (96-100%)
await this.updateProgress(97, 'finalize', 'formatting', 'Finalizing')
await this.updateProgress(100, 'finalize', 'complete', 'Processing complete')
```

**Validation**:
```bash
# Process PDF with images locally
cd worker
PROCESSING_MODE=local npm run dev

# In another terminal, upload PDF via UI
# curl or use web interface

# Monitor logs:
# Should see:
# [PDFProcessor] Cached extraction: 382 chunks, 12 figures, 3 tables
# [PDFProcessor] LOCAL MODE: Uploading 12 figures and 3 tables
# [Image Upload] Batch 1/3: uploading 5 images
# [Image Upload] Batch 2/3: uploading 5 images
# [Image Upload] Batch 3/3: uploading 2 images
# [Image Upload] ✅ Complete: 12/12 images uploaded

# Verify in Supabase:
# 1. Storage: user-id/doc-id/images/ has 12 PNG files
# 2. Database: figures table has 12 rows
# 3. Database: tables table has 3 rows
```

**Success Criteria**:
- [ ] Stage 6 added for image upload
- [ ] Figures uploaded in parallel
- [ ] Tables saved to database
- [ ] All stages shifted correctly
- [ ] Progress updates accurate (70% → 100%)
- [ ] No regression in existing pipeline

**Deliverable**: pdf-processor.ts committed with Stage 6

---

### Phase 7: EPUB Processor Integration (0.5 days)

**File**: `worker/processors/epub-processor.ts`

**Tasks**:
1. Copy Stage 6 from PDF processor
2. Adjust for EPUB specifics (section markers)
3. Test with EPUB files

**Success Criteria**:
- [ ] Same functionality as PDF
- [ ] Section markers used correctly
- [ ] Images have NULL page numbers

**Deliverable**: epub-processor.ts committed

---

### Phase 8: AI Cleanup Enhancement (0.5 days)

**File**: `worker/lib/local/ollama-cleanup.ts`

**Goal**: Instruct AI to preserve image syntax during cleanup.

**Tasks**:

#### Task 8.1: Update Cleanup Prompt (30 min)

**Modify cleanSection function** (around line 124):

```typescript
async function cleanSection(
  ollama: OllamaClient,
  text: string,
  temperature: number
): Promise<string> {
  const prompt = `You are a markdown cleanup assistant. Your ONLY job is to fix formatting errors from PDF extraction.

CRITICAL RULES - READ CAREFULLY:
1. PRESERVE EVERY WORD - Do NOT summarize, condense, or shorten ANY text
2. PRESERVE EVERY SENTENCE - Keep all paragraphs exactly as they are
3. PRESERVE IMAGE REFERENCES - Keep ALL ![caption](filename) syntax EXACTLY as written
4. ONLY fix these specific issues:
   - Remove OCR artifacts (misplaced characters like "ﬁ" → "fi")
   - Fix broken words across lines
   - Fix inconsistent spacing (but keep paragraph breaks)
5. PRESERVE ALL headings, lists, and structure EXACTLY as written
6. Output ONLY the cleaned markdown with NO explanations or comments

WRONG: Removing or changing ![Figure 1](page1_pic0.png)
RIGHT: Keeping ![Figure 1](page1_pic0.png) EXACTLY as is

WRONG: Summarizing "This is a long paragraph about X, Y, and Z" → "Discussion of X, Y, Z"
RIGHT: Keeping "This is a long paragraph about X, Y, and Z" exactly as is (just fix OCR)

If you summarize, omit ANY content, or remove image references, this is a FAILURE.

Markdown to clean:

${text}

Cleaned markdown (with ALL original content AND image references preserved):`

  // ...rest of function unchanged...
}
```

**Validation**:
```typescript
// Test that images are preserved
const markdown = `
# Chapter 1

Some text with OCR artifacts: ﬁrst, second.

![Diagram of process](page1_pic0.png)

More text here.

![Another figure](page3_pic1.png)
`

const cleaned = await cleanMarkdownLocal(markdown)

// Verify image refs preserved
expect(cleaned).toContain('![Diagram of process](page1_pic0.png)')
expect(cleaned).toContain('![Another figure](page3_pic1.png)')

// Verify OCR fixed
expect(cleaned).toContain('first')  // ﬁ → fi
expect(cleaned).not.toContain('ﬁrst')
```

**Success Criteria**:
- [ ] Image syntax preserved by AI
- [ ] OCR artifacts still fixed
- [ ] No regression in cleanup quality

**Deliverable**: ollama-cleanup.ts committed with updated prompt

---

### Phase 9: Testing & Validation (1 day)

**Goal**: Comprehensive testing across all components.

**Tasks**:

#### Task 9.1: Unit Tests (2 hours)

```bash
# Python tests
cd worker/scripts
pytest test_figure_extraction.py
pytest test_table_extraction.py

# TypeScript tests
cd worker
npm run test:unit -- image-uploader.test.ts
npm run test:unit -- obsidian-sync.test.ts
```

#### Task 9.2: Integration Tests (2 hours)

```typescript
// worker/tests/integration/image-extraction.test.ts

describe('Image Extraction Integration', () => {
  test('full pipeline with images', async () => {
    // 1. Upload PDF with images
    const pdfPath = 'fixtures/test-with-images.pdf'
    const documentId = await uploadDocument(pdfPath, 'user-id')

    // 2. Process with local mode
    process.env.PROCESSING_MODE = 'local'
    await processDocument(documentId)

    // 3. Verify figures in storage
    const { data: storageFiles } = await supabase.storage
      .from('documents')
      .list(`user-id/${documentId}/images`)

    expect(storageFiles.length).toBeGreaterThan(0)

    // 4. Verify figures in database
    const { data: figures } = await supabase
      .from('figures')
      .select('*')
      .eq('document_id', documentId)

    expect(figures.length).toBeGreaterThan(0)
    expect(figures[0].page_number).toBeDefined()
    expect(figures[0].storage_path).toContain('/images/')

    // 5. Verify tables in database
    const { data: tables } = await supabase
      .from('tables')
      .select('*')
      .eq('document_id', documentId)

    if (tables.length > 0) {
      expect(tables[0].markdown).toContain('|')
      expect(tables[0].structured_data).toBeInstanceOf(Array)
    }

    // 6. Export to Obsidian
    const exportResult = await exportToObsidian(documentId, 'user-id')
    expect(exportResult.success).toBe(true)

    // 7. Verify images in vault
    const vaultImagesDir = path.join(
      testVaultPath,
      'Rhizome',
      '.attachments',
      documentId
    )

    const vaultFiles = await fs.readdir(vaultImagesDir)
    expect(vaultFiles.length).toBe(storageFiles.length)

    // 8. Verify markdown has local refs
    const markdownPath = path.join(testVaultPath, 'Rhizome', 'Test Document.md')
    const markdown = await fs.readFile(markdownPath, 'utf-8')
    expect(markdown).toContain(`.attachments/${documentId}/`)
  })
})
```

#### Task 9.3: Manual Testing Checklist (2 hours)

```markdown
## Manual Testing Checklist

### PDF Processing
- [ ] Upload PDF with figures (test with textbook or technical paper)
  - File: test-fixtures/textbook-chapter.pdf
- [ ] Verify figures appear in Storage (Supabase UI → Storage → documents → user/doc/images)
- [ ] Check figures table has correct metadata
  - Query: SELECT * FROM figures WHERE document_id = '...'
  - Verify: page_number, bbox, caption populated
- [ ] Open document in reader UI
- [ ] Verify images DON'T load yet (local refs, not storage URLs) ← Expected!
- [ ] Export to Obsidian
- [ ] Open in Obsidian → images should display
- [ ] Click image → should zoom (if lightbox implemented)
- [ ] Verify tables render as markdown in reader

### EPUB Processing
- [ ] Upload EPUB with images (test with illustrated ebook)
  - File: test-fixtures/illustrated-book.epub
- [ ] Verify section markers used (not page numbers)
  - Query: SELECT section_marker, page_number FROM figures WHERE document_id = '...'
  - Verify: page_number IS NULL, section_marker IS NOT NULL
- [ ] Check images in Obsidian
- [ ] Verify tables work

### Edge Cases
- [ ] PDF with no images (should not error)
- [ ] PDF with only tables (no figures)
- [ ] Large images (>2MB) - should compress or handle
- [ ] Corrupted image in PDF (should skip, not fail)
- [ ] Table with special characters (|, -, etc.)
- [ ] EPUB with no cover image

### Performance
- [ ] 50-page PDF with 10 images
  - Expected: <20 min total
  - Actual: ___ min
- [ ] 500-page PDF with 50 images
  - Expected: <25 min total
  - Actual: ___ min
- [ ] Check storage usage
  - 500-page book with 50 images: ~17MB (acceptable)

### Obsidian Sync
- [ ] Export document with images
- [ ] Edit markdown in Obsidian (change text, not images)
- [ ] Sync back to Rhizome
- [ ] Verify markdown updated
- [ ] Verify images NOT duplicated (still in same .attachments folder)
- [ ] Re-export → images should still work
```

#### Task 9.4: Performance Benchmarking (2 hours)

```typescript
// worker/benchmarks/image-extraction-benchmark.ts

async function benchmarkImageExtraction() {
  const testFiles = [
    { name: 'small.pdf', pages: 50, expectedImages: 10 },
    { name: 'medium.pdf', pages: 200, expectedImages: 30 },
    { name: 'large.pdf', pages: 500, expectedImages: 50 }
  ]

  for (const testFile of testFiles) {
    console.log(`\n=== Benchmarking: ${testFile.name} ===`)

    const startTime = Date.now()

    // Stage 2: Docling extraction
    const extractStart = Date.now()
    const result = await extractPdfBuffer(getTestFile(testFile.name), {
      enableChunking: true,
      generateFigures: true
    })
    const extractTime = Date.now() - extractStart

    // Stage 6: Image upload
    const uploadStart = Date.now()
    await uploadFiguresParallel(result.figures, 'test-doc', 'test-user', {
      batchSize: 5
    })
    const uploadTime = Date.now() - uploadStart

    const totalTime = Date.now() - startTime

    console.log(`Results:`)
    console.log(`  Figures extracted: ${result.figures.length}`)
    console.log(`  Extraction time: ${(extractTime / 1000).toFixed(1)}s`)
    console.log(`  Upload time: ${(uploadTime / 1000).toFixed(1)}s`)
    console.log(`  Total time: ${(totalTime / 1000).toFixed(1)}s`)
    console.log(`  Time per image: ${(uploadTime / result.figures.length / 1000).toFixed(2)}s`)

    // Verify expectations
    expect(result.figures.length).toBeGreaterThanOrEqual(testFile.expectedImages * 0.8)  // 80% threshold
    expect(totalTime).toBeLessThan(testFile.pages * 3000)  // <3s per page
  }
}
```

**Success Criteria**:
- [ ] All unit tests pass (>95% coverage)
- [ ] Integration tests pass
- [ ] Manual checklist 100% complete
- [ ] Performance benchmarks meet targets
- [ ] No regressions in existing pipeline

**Deliverable**: Test suite committed, benchmark results documented

---

## Timeline & Milestones

### Week 1 (Days 1-3)

**Day 1: Database + Python PDF**
- Morning: Phase 1 - Database migration (0.5 days)
- Afternoon: Phase 2 start - Python PDF enhancement (1 day)
  - Task 2.1: Enable pipeline (30 min)
  - Task 2.2: Extract figures (1 hour)
  - Task 2.3 start: Extract tables

**Day 2: Python EPUB + TypeScript Upload**
- Morning: Phase 2 complete
  - Task 2.3 complete: Extract tables (1.5 hours)
  - Task 2.4: Integrate (30 min)
- Afternoon: Phase 3 - EPUB enhancement (1 day)

**Day 3: TypeScript Upload + Obsidian**
- Morning: Phase 4 - TypeScript upload handler (1.5 days)
- Afternoon: Phase 5 start - Obsidian export (1 day)

### Week 2 (Days 4-6)

**Day 4: Processor Integration**
- Morning: Phase 5 complete - Obsidian export
- Afternoon: Phase 6 - PDF processor integration (1 day)

**Day 5: EPUB + AI Cleanup**
- Morning: Phase 7 - EPUB processor (0.5 days)
- Afternoon: Phase 8 - AI cleanup enhancement (0.5 days)

**Day 6: Testing & Validation**
- Full day: Phase 9 - Comprehensive testing (1 day)
  - Unit tests
  - Integration tests
  - Manual testing
  - Performance benchmarks

**Total: 6 days** (same as v1, but with architectural fixes)

---

## Success Metrics

### Functional Metrics
✅ Figures extracted from both PDF and EPUB
✅ Images stored in Supabase Storage with correct paths
✅ Metadata tracked in `figures` and `tables` tables
✅ Markdown keeps local refs (not storage URLs)
✅ Obsidian export downloads images to vault
✅ Tables rendered as structured markdown
✅ Reader UI displays markdown (images via local refs)

### Quality Metrics
✅ 144 DPI image quality (images_scale=2.0)
✅ <5% extraction failures (graceful error handling)
✅ All tests passing (unit + integration)
✅ No regression in existing pipeline
✅ AI cleanup preserves image syntax

### Performance Metrics
✅ Image extraction adds <3 min to extraction (Stage 2)
✅ Image upload adds <2 min for 50 images (Stage 6, parallel)
✅ Total increase: <5 min for 500-page PDF
✅ Obsidian export adds <5 sec (image download)
✅ Storage usage reasonable (<50MB for typical book)

---

## Risks & Mitigations

### Risk 1: Memory Issues with Large Images
**Probability**: Medium
**Impact**: High (OOM errors)

**Mitigation**:
- Use `images_scale=2.0` (not higher) - tested sweet spot
- Don't enable `generate_page_images` (too large)
- Process images one at a time (streaming, not all in memory)
- Parallel upload uses batches of 5 (not all 50 at once)
- Monitor memory usage during testing

**Action Items**:
- [ ] Test with 500-page PDF on 24GB RAM machine
- [ ] Document memory requirements in README
- [ ] Add memory monitoring to worker logs

### Risk 2: Upload Time Longer Than Expected
**Probability**: Low (mitigated by parallel upload)
**Impact**: Medium (user waits longer)

**Mitigation**:
- Parallel upload (5 at time) = 80% time savings
- Sequential: 50 images × 10s = 8.3 min
- Parallel: 10 batches × 10s = 1.7 min
- Background upload (future): Don't block reader UI

**Action Items**:
- [ ] Benchmark upload time with real network
- [ ] Consider background upload for future (Phase 10)

### Risk 3: AI Cleanup Removes Images
**Probability**: Low (mitigated by explicit instruction)
**Impact**: High (data loss)

**Mitigation**:
- Updated prompt explicitly preserves ![...] syntax
- Test with multiple documents before release
- Validation checks for image refs before/after cleanup
- If images removed, log warning and skip cleanup

**Action Items**:
- [ ] Create test suite with 10 documents
- [ ] Verify image preservation rate >95%
- [ ] Add validation step after AI cleanup

### Risk 4: Storage Costs
**Probability**: Low
**Impact**: Low (acceptable for personal tool)

**Mitigation**:
- PNG compression (already default)
- Monitor storage usage
- Document typical costs:
  - 100 books × 16MB = 1.6GB (~$0 on Pro tier)
  - 1000 books × 16MB = 16GB (~$0 on Pro tier)

**Action Items**:
- [ ] Add storage usage dashboard
- [ ] Document costs in user guide

---

## Dependencies

### External Libraries
✅ Docling 2.55.1 (already installed)
✅ PIL/Pillow (auto-installed with Docling)
✅ Pandas (for DataFrame export, already installed)

### Supabase Configuration
✅ Storage bucket `documents` (already exists)
🔲 Verify public access for images (may need policy update)
🔲 CORS configuration (may need update for image URLs)

### Environment Variables
✅ All existing variables sufficient
🔲 Optional: `MAX_IMAGE_SIZE` for limits (future)

---

## Documentation Updates

After implementation, update these files:

### 1. Update PROCESSING_PIPELINE.md
Add Stage 6 to pipeline diagrams:
```markdown
Stage 6: Image & Table Upload (70-76%)
  • Upload figures to storage (parallel)
  • Insert metadata into database
  • Keep local refs in markdown
```

### 2. Update CLAUDE.md
Add section on image/table extraction:
```markdown
## Image & Table Extraction

Docling extracts figures and tables during Stage 2:
- Figures: Uploaded to storage, metadata in database
- Tables: Structured markdown + JSON in database
- Obsidian: Images downloaded to .attachments/ folder
```

### 3. Create User Guide
**File**: `docs/image-table-extraction.md`
- How images are extracted
- How to view images in Obsidian
- How tables are structured
- Storage costs estimation

### 4. Update API Documentation
**File**: `docs/API.md`
- New database tables schema
- Storage paths structure
- Query patterns for figures/tables

---

## Future Enhancements (Post-MVP)

Not included in this plan, worth considering later:

1. **OCR for scanned PDFs**
   - Enable Docling OCR (`ocr: true`)
   - Extract text from images

2. **Image search**
   - Generate embeddings for figure captions
   - Semantic search across images

3. **Table search**
   - Full-text search in `structured_data` JSONB
   - Query tables across all documents

4. **Image annotations**
   - Allow user to annotate images
   - Store annotations separately

5. **Export with images**
   - Include images in ZIP exports
   - Maintain folder structure

6. **Background upload**
   - Upload figures in background job
   - Don't block reader UI on image upload

7. **Reader UI image display**
   - Download images on-demand when viewing
   - Show inline in markdown renderer
   - Lightbox for full-screen viewing

---

## Validation Checklist

Before starting implementation:

✅ Storage preference: REFERENCED (confirmed)
✅ Table strategy: Structured markdown (confirmed)
✅ Image quality: 144 DPI (confirmed)
✅ PDF + EPUB support: Both together (confirmed)
✅ Database tables: Yes for figures and tables (confirmed)
✅ Obsidian integration: Download to .attachments/ (confirmed)
✅ AI cleanup: Preserve image syntax (confirmed)
✅ Parallel upload: 5 at a time (confirmed)
✅ Extract timing: During Stage 2 (confirmed)

---

## Ready to Start

All decisions made, all architectural issues addressed. Ready for implementation.

**Next Steps**:
1. ✅ Review this plan (DONE)
2. 🔲 Create git branch: `feature/image-table-extraction`
3. 🔲 Start Phase 1: Database migration
4. 🔲 Work through phases sequentially
5. 🔲 Test incrementally after each phase

---

**Status**: ✅ Plan v2 Complete - Ready for Implementation
**Estimated Start Date**: TBD
**Estimated Completion**: 6 days after start
**Key Improvements from v1**:
- ✅ Fixed extraction timing (Stage 2, not Stage 7)
- ✅ Added parallel upload (6x speedup)
- ✅ Obsidian integration designed
- ✅ AI cleanup preservation strategy
- ✅ Accurate performance estimates
