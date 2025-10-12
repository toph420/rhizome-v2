# Image and Table Extraction v2 - Task Breakdown

**Source PRP**: [docs/todo/image-and-table-extraction-v2.md](/Users/topher/Code/rhizome-v2/docs/todo/image-and-table-extraction-v2.md)
**Feature**: Image and Table Extraction for Local Processing Pipeline
**Priority**: High
**Total Estimated Effort**: 5-6 days (38-46 hours)
**Dependencies**: Local Processing Pipeline v1 (Phases 1-10) ✅ COMPLETE

---

## Executive Summary

This task breakdown extends the local processing pipeline to extract figures and tables from PDFs and EPUBs using Docling's native image extraction capabilities. The implementation follows a 9-phase approach with 26 discrete tasks, emphasizing parallel processing, Obsidian integration, and zero data loss.

### Architectural Highlights

- **REFERENCED mode**: Images as `![caption](filename.png)` in markdown (not base64)
- **Storage as source of truth**: Images uploaded to Supabase Storage
- **Local Obsidian copies**: Images downloaded to `.attachments/{doc-id}/` in vault
- **AI cleanup preservation**: Markdown keeps local refs, AI instructed to preserve
- **Parallel upload**: 5 images at a time (6x speedup vs sequential)
- **Extract at Stage 2**: Figures extracted with Docling (no re-extraction)
- **144 DPI quality**: `images_scale=2.0` for readable diagrams
- **Tables as markdown**: Structured data from DataFrames, not images

### Success Metrics

**Functional**:
- ✅ Figures extracted from PDF and EPUB
- ✅ Images stored in Storage with correct paths
- ✅ Metadata tracked in database
- ✅ Markdown keeps local refs
- ✅ Obsidian export works with images

**Performance**:
- ✅ Image extraction adds <3 min (Stage 2)
- ✅ Image upload adds <2 min for 50 images (Stage 6)
- ✅ Total increase <5 min for 500-page PDF

**Quality**:
- ✅ 144 DPI image quality
- ✅ <5% extraction failures
- ✅ All tests passing
- ✅ No regression

---

## Task Organization

### Phase 1: Database Migration (0.5 days / 4 hours)

#### T-001: Create Database Migration for Figures and Tables

**Priority**: Critical
**Estimated Hours**: 4
**Dependencies**: None

**Context & Background**

**Purpose**: Create new database tables to store figure and table metadata extracted from documents.

**As a** document processing system
**I need** database tables for figures and tables
**So that** we can track extracted images and structured data with proper relationships

**Technical Requirements**

**Functional Requirements**:
- REQ-1: When a figure is extracted, the system shall store metadata in the `figures` table
- REQ-2: When a table is extracted, the system shall store structured data in the `tables` table
- REQ-3: Where a document is deleted, the system shall cascade delete associated figures and tables

**Non-Functional Requirements**:
- **Performance**: Indexes on `document_id`, `chunk_id`, and `page_number` for fast queries
- **Data Integrity**: Foreign key constraints with cascade deletes
- **Query Optimization**: GIN index on JSONB `structured_data` for table search

**Technical Constraints**:
- **Database**: PostgreSQL 14+ (Supabase)
- **Migration Number**: 046 (next in sequence after 045)
- **Code Standards**: Follow existing migration patterns

**Implementation Details**

**Files to Modify/Create**:
```
├── supabase/migrations/046_add_figures_and_tables.sql - [Purpose: Create new tables and indexes]
```

**Key Implementation Steps**:

1. **Create figures table** → Table with 10 columns for image metadata
   ```sql
   CREATE TABLE figures (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
     chunk_id UUID REFERENCES chunks(id) ON DELETE SET NULL,
     storage_path TEXT NOT NULL,
     page_number INTEGER,
     section_marker TEXT,
     caption TEXT,
     alt_text TEXT,
     bbox JSONB,
     self_ref TEXT,
     image_format TEXT DEFAULT 'PNG',
     width INTEGER,
     height INTEGER,
     file_size INTEGER,
     created_at TIMESTAMPTZ DEFAULT NOW(),
     updated_at TIMESTAMPTZ DEFAULT NOW(),
     UNIQUE(document_id, self_ref)
   );
   ```

2. **Create tables table** → Table with 11 columns for structured data
   ```sql
   CREATE TABLE tables (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
     chunk_id UUID REFERENCES chunks(id) ON DELETE SET NULL,
     markdown TEXT NOT NULL,
     structured_data JSONB,
     page_number INTEGER,
     section_marker TEXT,
     caption TEXT,
     bbox JSONB,
     self_ref TEXT,
     num_rows INTEGER,
     num_columns INTEGER,
     has_headers BOOLEAN DEFAULT TRUE,
     created_at TIMESTAMPTZ DEFAULT NOW(),
     updated_at TIMESTAMPTZ DEFAULT NOW(),
     UNIQUE(document_id, self_ref)
   );
   ```

3. **Create indexes** → 6 total indexes for query performance
   ```sql
   CREATE INDEX idx_figures_document ON figures(document_id);
   CREATE INDEX idx_figures_chunk ON figures(chunk_id);
   CREATE INDEX idx_figures_page ON figures(document_id, page_number) WHERE page_number IS NOT NULL;
   CREATE INDEX idx_tables_document ON tables(document_id);
   CREATE INDEX idx_tables_chunk ON tables(chunk_id);
   CREATE INDEX idx_tables_structured_data ON tables USING GIN(structured_data);
   ```

**Code Patterns to Follow**:
- **Migration Format**: `supabase/migrations/045_add_local_pipeline_columns.sql:1-30` - Standard migration structure
- **Table Creation**: `supabase/migrations/001_initial_schema.sql` - Use CASCADE deletes, TIMESTAMPTZ
- **JSONB Indexes**: `supabase/migrations/019_clean_chunk_schema_for_3_engines.sql` - GIN indexes for JSONB

**Acceptance Criteria**

**Given-When-Then Scenarios**:

```gherkin
Scenario 1: Migration applies successfully
  Given a fresh database with migration 045 applied
  When migration 046 is applied
  Then figures table exists with 10 columns
  And tables table exists with 11 columns
  And 6 indexes are created
  And no errors occur

Scenario 2: Cascade deletes work
  Given a document with associated figures and tables
  When the document is deleted
  Then all associated figures are deleted
  And all associated tables are deleted

Scenario 3: UNIQUE constraint enforced
  Given a figure with self_ref '#/pictures/0'
  When another figure with same document_id and self_ref is inserted
  Then the insert fails with UNIQUE violation
```

**Rule-Based Criteria (Checklist)**:
- [ ] **Functional**: Migration applies without errors
- [ ] **Schema**: figures table has exactly 10 columns
- [ ] **Schema**: tables table has exactly 11 columns
- [ ] **Indexes**: 6 total indexes created (3 for figures, 3 for tables)
- [ ] **Constraints**: Foreign keys cascade delete properly
- [ ] **Performance**: GIN index on tables.structured_data for JSONB queries
- [ ] **Naming**: Migration numbered 046 in sequence
- [ ] **Documentation**: COMMENT ON COLUMN for key fields

**Validation & Quality Gates**

**Code Quality Checks**:
```bash
# Apply migration
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

# Expected output:
# figures | 16
# tables  | 15

# Verify indexes
npx supabase db execute "
SELECT tablename, indexname
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN ('figures', 'tables')
ORDER BY tablename, indexname
"

# Expected output:
# figures | idx_figures_document
# figures | idx_figures_chunk
# figures | idx_figures_page
# tables  | idx_tables_document
# tables  | idx_tables_chunk
# tables  | idx_tables_structured_data
```

**Definition of Done**:
- [ ] Migration file created and committed
- [ ] Migration applies cleanly in local dev environment
- [ ] Tables queryable with correct schema
- [ ] Indexes created and functional
- [ ] Foreign key constraints work (tested with DELETE)
- [ ] UNIQUE constraints enforced
- [ ] No regression in existing migrations

**Resources & References**

**Documentation Links**:
- **PostgreSQL JSONB**: https://www.postgresql.org/docs/14/datatype-json.html - JSONB storage and indexing
- **Supabase Migrations**: https://supabase.com/docs/guides/database/migrations - Migration guide
- **pgvector Indexes**: https://github.com/pgvector/pgvector#indexing - Index optimization patterns

**Code References**:
- **Migration Pattern**: `supabase/migrations/045_add_local_pipeline_columns.sql:1-30` - Column additions and indexes
- **Table Creation**: `supabase/migrations/001_initial_schema.sql` - Initial schema patterns
- **JSONB Indexing**: `supabase/migrations/019_clean_chunk_schema_for_3_engines.sql` - GIN index usage

---

### Phase 2: Python Script Enhancement - PDF (1.5 days / 12 hours)

#### T-002: Enable Image Extraction in Docling Pipeline

**Priority**: Critical
**Estimated Hours**: 0.5
**Dependencies**: T-001

**Context & Background**

**Purpose**: Configure Docling to extract figures and tables during PDF processing.

**As a** PDF processor
**I need** Docling configured to extract images
**So that** figures are available for storage and display

**Technical Requirements**

**Functional Requirements**:
- REQ-1: When Docling processes a PDF, the system shall extract pictures with 144 DPI quality
- REQ-2: When Docling processes a PDF, the system shall extract tables as DataFrames
- REQ-3: While extracting images, the system shall NOT generate full page images (memory optimization)

**Non-Functional Requirements**:
- **Performance**: Image extraction adds <3 min to Stage 2
- **Memory**: Use `images_scale=2.0` to balance quality vs memory usage
- **Quality**: 144 DPI sufficient for readable diagrams

**Implementation Details**

**Files to Modify/Create**:
```
├── worker/scripts/docling_extract.py - [Purpose: Enable image extraction in pipeline]
```

**Key Implementation Steps**:

1. **Import required modules** → Add image processing imports (lines 10-15)
   ```python
   from docling.datamodel.pipeline_options import PdfPipelineOptions
   from docling_core.types.doc import ImageRefMode, PictureItem, TableItem
   from io import BytesIO
   import base64
   ```

2. **Configure pipeline options** → Enable figure generation (lines 185-195)
   ```python
   pipeline_options = PdfPipelineOptions()
   pipeline_options.images_scale = 2.0  # 144 DPI
   pipeline_options.generate_picture_images = True   # Enable figures
   pipeline_options.generate_table_images = False    # Use structured data
   pipeline_options.generate_page_images = False     # Don't need full pages

   converter = DocumentConverter(
       format_options={
           InputFormat.PDF: PdfFormatOption(pipeline_options=pipeline_options)
       }
   )
   ```

**Code Patterns to Follow**:
- **Docling Config**: `worker/scripts/docling_extract.py:185-195` - Existing pipeline options pattern
- **Import Structure**: `worker/scripts/docling_extract.py:1-20` - Module organization

**Acceptance Criteria**

**Given-When-Then Scenarios**:

```gherkin
Scenario 1: Pipeline configured for images
  Given a PDF with figures
  When Docling extracts the PDF
  Then pictures are available in doc.pictures
  And images have 144 DPI quality (images_scale=2.0)

Scenario 2: Memory optimization enabled
  Given pipeline options configured
  When processing large PDF
  Then generate_page_images is False
  And memory usage stays under 4GB
```

**Rule-Based Criteria (Checklist)**:
- [ ] **Functional**: `generate_picture_images=True` set
- [ ] **Quality**: `images_scale=2.0` for 144 DPI
- [ ] **Memory**: `generate_page_images=False` to save memory
- [ ] **Tables**: `generate_table_images=False` (use DataFrames instead)
- [ ] **No Regression**: Existing extraction still works

**Validation & Quality Gates**:

```bash
# Test with real PDF
python3 worker/scripts/docling_extract.py test.pdf '{"enable_chunking": true}'

# Expected output includes:
# "figures": [...],  # Array with base64 images
# "tables": [...]    # Array with markdown tables
```

---

#### T-003: Implement Figure Extraction Function

**Priority**: Critical
**Estimated Hours**: 2
**Dependencies**: T-002

**Context & Background**

**Purpose**: Extract figure data from Docling document and encode for JSON transport.

**As a** PDF processor
**I need** a function to extract figure metadata and image data
**So that** figures can be uploaded to storage

**Technical Requirements**

**Functional Requirements**:
- REQ-1: When a picture is found, the system shall extract PIL image from Docling
- REQ-2: When converting image, the system shall encode as base64 PNG for JSON transport
- REQ-3: Where extraction fails for one image, the system shall continue processing others

**Non-Functional Requirements**:
- **Error Handling**: Graceful degradation if one image corrupted
- **Progress**: Emit progress updates for UI feedback
- **Format**: PNG format with optimization

**Implementation Details**

**Files to Modify/Create**:
```
├── worker/scripts/docling_extract.py - [Purpose: Add extract_figures function]
```

**Key Implementation Steps**:

1. **Add extract_figures function** → ~60 lines (after line 200)
   ```python
   def extract_figures(doc) -> List[Dict[str, Any]]:
       """Extract figures from Docling document.

       Returns:
           List of figure metadata with base64-encoded image data.
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

               # Extract position metadata
               page_no = None
               bbox = None
               if picture.prov and len(picture.prov) > 0:
                   page_no = picture.prov[0].page_no
                   if hasattr(picture.prov[0], 'bbox'):
                       b = picture.prov[0].bbox
                       bbox = {
                           'page': page_no,
                           'l': float(b.l), 't': float(b.t),
                           'r': float(b.r), 'b': float(b.b)
                       }

               # Extract caption
               caption = picture.caption_text(doc) if hasattr(picture, 'caption_text') else None

               figures.append({
                   'data': base64.b64encode(img_bytes).decode('utf-8'),
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
               sys.stdout.flush()
               continue

       return figures
   ```

**Code Patterns to Follow**:
- **Error Handling**: `worker/processors/pdf-processor.ts:92-112` - withRetry pattern for robustness
- **Progress Updates**: `worker/scripts/docling_extract.py:103-107` - emit_progress pattern
- **Base64 Encoding**: Standard Python base64 module for JSON transport

**Acceptance Criteria**

**Given-When-Then Scenarios**:

```gherkin
Scenario 1: Successful figure extraction
  Given a PDF with 3 figures
  When extract_figures is called
  Then 3 figure objects returned
  And each has base64 data field
  And each has page_number and bbox
  And progress updates emitted

Scenario 2: Corrupted image handling
  Given a PDF with 2 valid and 1 corrupted figure
  When extract_figures is called
  Then 2 figures returned
  And warning logged for corrupted image
  And processing continues without error
```

**Rule-Based Criteria (Checklist)**:
- [ ] **Functional**: Extracts all valid figures
- [ ] **Format**: Base64-encoded PNG data
- [ ] **Metadata**: page_number, bbox, caption, dimensions
- [ ] **Error Handling**: Continues on individual failures
- [ ] **Progress**: Emits progress updates
- [ ] **Filename**: Format `page{N}_pic{idx}.png`

**Validation & Quality Gates**:

```python
# Unit test
result = extract_figures(doc)
assert len(result) > 0, "Should extract at least one figure"
assert result[0]['data'].startswith('iVBORw0KGgo'), "Should be valid base64 PNG"
assert result[0]['page_number'] is not None, "Should have page number"
```

---

#### T-004: Implement Table Extraction Function

**Priority**: Critical
**Estimated Hours**: 2.5
**Dependencies**: T-002

**Context & Background**

**Purpose**: Extract table data from Docling document as structured markdown and JSON.

**As a** PDF processor
**I need** a function to extract table data
**So that** tables can be stored and searched

**Technical Requirements**

**Functional Requirements**:
- REQ-1: When a table is found, the system shall export as Pandas DataFrame
- REQ-2: When converting table, the system shall generate markdown format for display
- REQ-3: When storing table, the system shall include JSON for programmatic access

**Implementation Details**

**Files to Modify/Create**:
```
├── worker/scripts/docling_extract.py - [Purpose: Add extract_tables function]
```

**Key Implementation Steps**:

1. **Add extract_tables function** → ~70 lines (after extract_figures)
   ```python
   def extract_tables(doc) -> List[Dict[str, Any]]:
       """Extract tables as structured markdown + JSON."""
       tables = []

       for idx, table in enumerate(doc.tables):
           try:
               # Get structured data (Pandas DataFrame)
               df = table.export_to_dataframe()

               # Convert to markdown table
               markdown = df.to_markdown(index=False)

               # Convert to JSON for storage/search
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
                           'l': float(b.l), 't': float(b.t),
                           'r': float(b.r), 'b': float(b.b)
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
                   'has_headers': True
               })

               emit_progress('tables', 88, f'Extracted table {idx + 1}/{len(doc.tables)}')

           except Exception as e:
               print(f"Warning: Failed to extract table {idx}: {e}", file=sys.stderr)
               sys.stdout.flush()
               continue

       return tables
   ```

**Acceptance Criteria**

**Given-When-Then Scenarios**:

```gherkin
Scenario 1: Successful table extraction
  Given a PDF with 2 tables
  When extract_tables is called
  Then 2 table objects returned
  And each has markdown field starting with '|'
  And each has structured_data as list of dicts
  And num_rows and num_columns populated

Scenario 2: Special characters in table
  Given a table with | and - characters in cells
  When table exported to markdown
  Then markdown properly escapes special characters
  And structured_data preserves original values
```

**Rule-Based Criteria (Checklist)**:
- [ ] **Functional**: Extracts all valid tables
- [ ] **Markdown**: Valid markdown table format
- [ ] **Structured**: JSON array of row objects
- [ ] **Metadata**: num_rows, num_columns, caption
- [ ] **Error Handling**: Continues on individual failures

---

#### T-005: Integrate Figure and Table Extraction into Main Function

**Priority**: Critical
**Estimated Hours**: 1
**Dependencies**: T-003, T-004

**Context & Background**

**Purpose**: Call extraction functions from main processing flow and return results.

**Implementation Details**

**Files to Modify/Create**:
```
├── worker/scripts/docling_extract.py - [Purpose: Integrate extraction into main flow]
```

**Key Implementation Steps**:

1. **Call extraction functions** → After chunk extraction (line 240)
   ```python
   # After markdown and chunks extraction
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

**Acceptance Criteria**:

```gherkin
Scenario: Full extraction with images
  Given a PDF with text, images, and tables
  When docling_extract.py is executed
  Then result contains markdown
  And result contains chunks
  And result contains figures with base64 data
  And result contains tables with markdown
```

**Validation & Quality Gates**:

```bash
# Integration test
python3 worker/scripts/docling_extract.py test.pdf '{
  "enable_chunking": true
}'

# Expected JSON output:
# {
#   "type": "result",
#   "data": {
#     "markdown": "...",
#     "chunks": [...],
#     "figures": [{
#       "data": "iVBORw0KGgo...",
#       "filename": "page1_pic0.png",
#       ...
#     }],
#     "tables": [{
#       "markdown": "| Col1 | Col2 |\n...",
#       "structured_data": [...],
#       ...
#     }]
#   }
# }
```

---

### Phase 3: Python Script Enhancement - EPUB (1 day / 8 hours)

#### T-006: Copy Extraction Functions to EPUB Script

**Priority**: High
**Estimated Hours**: 1
**Dependencies**: T-005

**Context & Background**

**Purpose**: Replicate figure and table extraction for EPUB format.

**Implementation Details**

**Files to Modify/Create**:
```
├── worker/scripts/docling_extract_epub.py - [Purpose: Add figure/table extraction]
```

**Key Implementation Steps**:

1. **Copy extract_figures** → From PDF script with EPUB modifications
2. **Copy extract_tables** → From PDF script (identical logic)
3. **Update filename pattern** → Use section markers instead of page numbers

**Code Changes**:

```python
# EPUB-specific section marker extraction
def get_section_marker(picture) -> str:
    """Extract section marker from EPUB spine position."""
    if picture.prov and len(picture.prov) > 0:
        return f'section_{picture.prov[0].section_id or "unknown"}'
    return 'section_unknown'

# Updated filename generation
filename = f'{get_section_marker(picture)}_pic{idx}.png'
# Result: 'section_chapter_003_pic0.png'

# EPUB-specific metadata
figures.append({
    'data': base64.b64encode(img_bytes).decode('utf-8'),
    'filename': filename,
    'page_number': None,  # ALWAYS None for EPUB
    'section_marker': get_section_marker(picture),
    'self_ref': picture.self_ref,
    'caption': caption,
    'bbox': None,  # ALWAYS None for EPUB
    'width': pil_image.size[0],
    'height': pil_image.size[1],
    'file_size': len(img_bytes)
})
```

**Acceptance Criteria**:

```gherkin
Scenario: EPUB figure extraction
  Given an EPUB with images
  When figures extracted
  Then filenames use section markers
  And page_number is NULL
  And bbox is NULL
  And section_marker populated
```

---

#### T-007: Test EPUB Extraction Integration

**Priority**: High
**Estimated Hours**: 1
**Dependencies**: T-006

**Validation & Quality Gates**:

```bash
# Test with EPUB containing images
python3 worker/scripts/docling_extract_epub.py test.epub '{
  "enable_chunking": true
}'

# Verify output:
# - Figures have section_marker (not page_number)
# - Filenames: section_chapter_003_pic0.png
# - page_number and bbox are NULL
```

---

### Phase 4: TypeScript Image Upload Handler (1.5 days / 12 hours)

#### T-008: Create Type Definitions for Image Upload

**Priority**: Critical
**Estimated Hours**: 0.5
**Dependencies**: T-001

**Implementation Details**

**Files to Modify/Create**:
```
├── worker/lib/local/image-uploader.ts - [Purpose: NEW - Type definitions and upload logic]
```

**Code**:

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
    l: number, t: number, r: number, b: number
  }
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
  has_headers?: boolean
}

export interface UploadProgress {
  completed: number
  total: number
  currentBatch: number
  totalBatches: number
}
```

---

#### T-009: Implement Parallel Image Upload Function

**Priority**: Critical
**Estimated Hours**: 3
**Dependencies**: T-008

**Context & Background**

**Purpose**: Upload figures to Supabase Storage in parallel batches for performance.

**As a** document processor
**I need** parallel image upload
**So that** 50 images upload in <2 minutes (vs 8+ minutes sequential)

**Technical Requirements**

**Performance**:
- Sequential: 50 images × 10s = 8.3 min
- Parallel (5 at time): 10 batches × 10s = 1.7 min (80% faster)

**Implementation Details**:

```typescript
/**
 * Upload figures to Supabase Storage in parallel batches.
 * Pattern: worker/lib/local/bulletproof-matcher.ts (parallel processing)
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

  for (let i = 0; i < figures.length; i += batchSize) {
    const batch = figures.slice(i, i + batchSize)
    const currentBatch = Math.floor(i / batchSize) + 1

    // Upload batch in parallel using Promise.allSettled
    const results = await Promise.allSettled(
      batch.map(figure => uploadSingleFigure(supabase, figure, documentId, userId))
    )

    // Count successes/failures
    const succeeded = results.filter(r => r.status === 'fulfilled').length
    const failed = results.filter(r => r.status === 'rejected').length

    completed += succeeded

    if (failed > 0) {
      console.warn(`Batch ${currentBatch}: ${succeeded} succeeded, ${failed} failed`)
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
}

async function uploadSingleFigure(
  supabase: any,
  figure: FigureData,
  documentId: string,
  userId: string
): Promise<void> {
  // 1. Decode base64
  const imageBuffer = Buffer.from(figure.data, 'base64')

  // 2. Storage path
  const storagePath = `${userId}/${documentId}/images/${figure.filename}`

  // 3. Upload to storage
  const { error: uploadError } = await supabase.storage
    .from('documents')
    .upload(storagePath, imageBuffer, {
      contentType: 'image/png',
      upsert: true,
      cacheControl: '3600'
    })

  if (uploadError) throw new Error(`Storage upload failed: ${uploadError.message}`)

  // 4. Insert metadata to database
  const { error: dbError } = await supabase
    .from('figures')
    .insert({
      document_id: documentId,
      storage_path: storagePath,
      page_number: figure.page_number || null,
      section_marker: figure.section_marker || null,
      caption: figure.caption || null,
      alt_text: figure.caption || 'Figure',
      bbox: figure.bbox || null,
      self_ref: figure.self_ref,
      image_format: 'PNG',
      width: figure.width,
      height: figure.height,
      file_size: figure.file_size
    })

  if (dbError) {
    console.error(`Database insert failed for ${figure.filename}:`, dbError.message)
  }
}
```

**Code Patterns to Follow**:
- **Parallel Processing**: `worker/lib/local/bulletproof-matcher.ts:200-250` - Batch processing with Promise.allSettled
- **Supabase Upload**: `worker/processors/pdf-processor.ts:71-86` - Storage upload pattern
- **Progress Tracking**: `worker/handlers/process-document.ts:80-95` - Progress callback pattern

**Acceptance Criteria**:

```gherkin
Scenario 1: Parallel upload succeeds
  Given 10 figures to upload
  When uploadFiguresParallel called with batchSize=5
  Then 2 batches processed
  And 10 files in storage
  And 10 rows in figures table
  And progress callbacks invoked 2 times

Scenario 2: Partial failure handled
  Given 3 figures, 1 with corrupted base64
  When uploadFiguresParallel called
  Then 2 figures uploaded successfully
  And 1 failure logged
  And processing continues without crash
```

---

#### T-010: Implement Table Saver Function

**Priority**: High
**Estimated Hours**: 1
**Dependencies**: T-008

**Implementation Details**:

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
        console.error('Failed to insert table:', error.message)
      }
    } catch (error) {
      console.error('Table save error:', error)
      continue
    }
  }
}
```

---

#### T-011: Write Comprehensive Upload Tests

**Priority**: High
**Estimated Hours**: 2
**Dependencies**: T-009, T-010

**Implementation Details**:

**Files to Modify/Create**:
```
├── worker/lib/local/__tests__/image-uploader.test.ts - [Purpose: NEW - Unit tests]
```

**Test Cases**:

```typescript
describe('Image Upload', () => {
  test('uploads figures in parallel', async () => {
    const mockFigures = createMockFigures(10)

    await uploadFiguresParallel(mockFigures, 'doc-id', 'user-id', {
      batchSize: 5
    })

    // Verify storage uploads
    const { data: files } = await supabase.storage
      .from('documents')
      .list('user-id/doc-id/images')

    expect(files).toHaveLength(10)

    // Verify database entries
    const { data: figures } = await supabase
      .from('figures')
      .select('*')
      .eq('document_id', 'doc-id')

    expect(figures).toHaveLength(10)
  })

  test('handles upload failures gracefully', async () => {
    const figures = [
      createValidFigure(),
      createCorruptedFigure(),  // Invalid base64
      createValidFigure()
    ]

    await uploadFiguresParallel(figures, 'doc-id', 'user-id')

    // Should upload 2 valid images
    const { data } = await supabase
      .from('figures')
      .select('*')
      .eq('document_id', 'doc-id')

    expect(data).toHaveLength(2)
  })
})
```

---

### Phase 5: Obsidian Export Enhancement (1 day / 8 hours)

#### T-012: Add Image Export to Vault Function

**Priority**: High
**Estimated Hours**: 3
**Dependencies**: T-009

**Context & Background**

**Purpose**: Download figures from storage to Obsidian vault for local viewing.

**As a** user exporting to Obsidian
**I need** images downloaded to my vault
**So that** I can view documents with images in Obsidian

**Implementation Details**:

**Files to Modify/Create**:
```
├── worker/handlers/obsidian-sync.ts - [Purpose: Add image export after line 138]
```

**Key Implementation Steps**:

1. **Add exportFiguresToVault function** → After markdown written (line 138)
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
   }
   ```

2. **Implement exportFiguresToVault** → ~60 lines at end of file
   ```typescript
   async function exportFiguresToVault(
     supabase: any,
     documentId: string,
     vaultPath: string,
     exportPath: string,
     documentTitle: string
   ): Promise<boolean> {
     // Get figures for this document
     const { data: figures, error } = await supabase
       .from('figures')
       .select('storage_path, filename')
       .eq('document_id', documentId)

     if (!figures || figures.length === 0) return false

     // Create images directory
     const vaultImagesDir = path.join(
       vaultPath,
       exportPath,
       '.attachments',
       documentId
     )

     await fs.mkdir(vaultImagesDir, { recursive: true })

     // Download each image
     let successCount = 0
     for (const figure of figures) {
       try {
         const { data: imageBlob, error: downloadError } = await supabase.storage
           .from('documents')
           .download(figure.storage_path)

         if (downloadError) {
           console.warn(`Failed to download ${figure.filename}:`, downloadError.message)
           continue
         }

         const localPath = path.join(vaultImagesDir, figure.filename)
         const buffer = Buffer.from(await imageBlob.arrayBuffer())
         await fs.writeFile(localPath, buffer)

         successCount++
       } catch (error) {
         console.error(`Error downloading ${figure.filename}:`, error)
         continue
       }
     }

     return successCount > 0
   }
   ```

**Code Patterns to Follow**:
- **File Operations**: `worker/handlers/obsidian-sync.ts:120-138` - Vault file writing
- **Storage Download**: `worker/processors/pdf-processor.ts:71-86` - Storage access pattern
- **Error Handling**: `worker/lib/local/image-uploader.ts` - Graceful degradation

**Acceptance Criteria**:

```gherkin
Scenario: Images exported to vault
  Given a document with 3 figures
  When exportToObsidian is called
  Then .attachments/{doc-id}/ directory created
  And 3 PNG files downloaded to vault
  And markdown updated with vault-relative paths
```

---

#### T-013: Implement Markdown Path Remapping

**Priority**: High
**Estimated Hours**: 2
**Dependencies**: T-012

**Implementation Details**:

```typescript
/**
 * Remap image references to vault-relative paths.
 *
 * FROM: ![caption](page1_pic0.png)
 * TO:   ![caption](.attachments/doc-id/page1_pic0.png)
 */
function remapMarkdownToVaultPaths(
  markdown: string,
  documentId: string
): string {
  let result = markdown

  // Pattern 1: Local filename references
  const localPattern = /!\[([^\]]*)\]\(([^/)]+\.png)\)/g
  result = result.replace(localPattern, (match, caption, filename) => {
    return `![${caption}](.attachments/${documentId}/${filename})`
  })

  // Pattern 2: Storage URLs (if already remapped)
  const storageUrlPattern = /!\[([^\]]*)\]\(https:\/\/[^)]+\/([^/)]+\.png)\)/g
  result = result.replace(storageUrlPattern, (match, caption, filename) => {
    return `![${caption}](.attachments/${documentId}/${filename})`
  })

  return result
}
```

**Acceptance Criteria**:

```gherkin
Scenario: Local refs remapped
  Given markdown with ![Fig 1](page1_pic0.png)
  When remapMarkdownToVaultPaths called with doc-id 'abc-123'
  Then result contains ![Fig 1](.attachments/abc-123/page1_pic0.png)

Scenario: User opens in Obsidian
  Given exported markdown with vault-relative paths
  When user opens file in Obsidian
  Then images display inline
  And clicking image opens in preview
```

---

#### T-014: Write Obsidian Export Tests

**Priority**: High
**Estimated Hours**: 1.5
**Dependencies**: T-013

**Test Cases**:

```typescript
describe('Obsidian Image Export', () => {
  test('remaps local refs to vault paths', () => {
    const markdown = `
# Chapter 1

![Figure 1](page1_pic0.png)

![Figure 2](page3_pic1.png)
`

    const result = remapMarkdownToVaultPaths(markdown, 'abc-123')

    expect(result).toContain('![Figure 1](.attachments/abc-123/page1_pic0.png)')
    expect(result).toContain('![Figure 2](.attachments/abc-123/page3_pic1.png)')
    expect(result).not.toContain('](page1_pic0.png)')
  })

  test('downloads images to vault', async () => {
    await uploadTestFigures('doc-id', 'user-id', 3)

    const result = await exportToObsidian('doc-id', 'user-id')

    expect(result.success).toBe(true)

    const vaultImagesDir = path.join(
      testVaultPath,
      'Rhizome',
      '.attachments',
      'doc-id'
    )

    const files = await fs.readdir(vaultImagesDir)
    expect(files).toHaveLength(3)
  })
})
```

---

### Phase 6: PDF Processor Integration (1 day / 8 hours)

#### T-015: Cache Extraction Results in Job Metadata

**Priority**: Critical
**Estimated Hours**: 0.5
**Dependencies**: T-005

**Implementation Details**:

**Files to Modify/Create**:
```
├── worker/processors/pdf-processor.ts - [Purpose: Cache figures/tables in job metadata]
```

**Code Changes** (around line 126):

```typescript
// Stage 2: Extract PDF with Docling (15-50%)
// ...existing extraction code...

// Phase 2: Cache extraction result in job metadata
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

**Code Patterns to Follow**:
- **Metadata Caching**: `worker/processors/pdf-processor.ts:126-134` - Existing cached_extraction pattern

---

#### T-016: Add Stage 6 for Image and Table Upload

**Priority**: Critical
**Estimated Hours**: 3
**Dependencies**: T-015, T-009, T-010

**Context & Background**

**Purpose**: Upload figures and tables after AI cleanup, before chunk matching.

**Implementation Details**:

**Files to Modify/Create**:
```
├── worker/processors/pdf-processor.ts - [Purpose: Insert Stage 6 after Stage 5 (review checkpoint)]
```

**Code Changes** (insert after Stage 5, before bulletproof matching):

```typescript
// Stage 6: Image & Table Upload (70-76%)
if (isLocalMode && this.job.metadata?.cached_extraction) {
  const { figures, tables } = this.job.metadata.cached_extraction

  if (figures && figures.length > 0) {
    console.log(`[PDFProcessor] Uploading ${figures.length} figures and ${tables?.length || 0} tables`)

    await this.updateProgress(70, 'upload_figures', 'processing', 'Uploading figures to storage')

    const { uploadFiguresParallel, saveTables } = await import('../lib/local/image-uploader.js')

    // Upload figures in parallel
    await uploadFiguresParallel(
      figures,
      this.job.document_id,
      this.job.user_id,
      {
        batchSize: 5,
        onProgress: async (progress) => {
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
  } else {
    await this.updateProgress(76, 'upload_figures', 'skipped', 'No images in document')
  }
}
```

**Code Patterns to Follow**:
- **Stage Structure**: `worker/processors/pdf-processor.ts:262-340` - Existing stage pattern with progress updates
- **Dynamic Import**: `worker/processors/pdf-processor.ts:197` - Import pattern for conditional modules

---

#### T-017: Shift Subsequent Stage Progress Percentages

**Priority**: Critical
**Estimated Hours**: 1
**Dependencies**: T-016

**Implementation Details**:

Update all subsequent stage progress percentages:

```typescript
// OLD: Stage 6: Bulletproof Matching (70-75%)
// NEW: Stage 7: Bulletproof Matching (76-82%)
await this.updateProgress(78, 'matching', 'processing', 'Remapping chunks...')
await this.updateProgress(82, 'matching', 'complete', `${finalChunks.length} chunks matched`)

// OLD: Stage 7: Metadata Enrichment (75-90%)
// NEW: Stage 8: Metadata Enrichment (82-92%)
await this.updateProgress(84, 'metadata', 'processing', 'Extracting metadata...')
await this.updateProgress(92, 'metadata', 'complete', 'Metadata enrichment done')

// OLD: Stage 8: Local Embeddings (90-95%)
// NEW: Stage 9: Local Embeddings (92-96%)
await this.updateProgress(93, 'embeddings', 'processing', 'Generating embeddings...')
await this.updateProgress(96, 'embeddings', 'complete', 'Embeddings generated')

// OLD: Stage 9: Finalize (95-100%)
// NEW: Stage 10: Finalize (96-100%)
await this.updateProgress(97, 'finalize', 'formatting', 'Finalizing')
await this.updateProgress(100, 'finalize', 'complete', 'Processing complete')
```

**Acceptance Criteria**:

```gherkin
Scenario: Pipeline progress accurate
  Given a PDF with images processing
  When monitoring progress updates
  Then Stage 6 shows 70-76% (image upload)
  And Stage 7 shows 76-82% (matching)
  And Stage 8 shows 82-92% (metadata)
  And Stage 9 shows 92-96% (embeddings)
  And Stage 10 shows 96-100% (finalize)
```

---

#### T-018: Test PDF Processor with Images

**Priority**: Critical
**Estimated Hours**: 2
**Dependencies**: T-017

**Validation & Quality Gates**:

```bash
# Process PDF with images locally
cd worker
PROCESSING_MODE=local npm run dev

# Upload PDF via UI or API

# Monitor logs - should see:
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

---

### Phase 7: EPUB Processor Integration (0.5 days / 4 hours)

#### T-019: Copy Stage 6 to EPUB Processor

**Priority**: High
**Estimated Hours**: 1.5
**Dependencies**: T-016

**Implementation Details**:

**Files to Modify/Create**:
```
├── worker/processors/epub-processor.ts - [Purpose: Add Stage 6 for image upload]
```

**Code Changes**:
- Copy entire Stage 6 from PDF processor
- No EPUB-specific changes needed (logic identical)
- Figures will have `section_marker` instead of `page_number` (already handled)

---

#### T-020: Test EPUB Processor with Images

**Priority**: High
**Estimated Hours**: 1
**Dependencies**: T-019

**Validation**:

```bash
# Test with EPUB containing images
# Upload via UI

# Verify:
# - Figures have section_marker (not page_number)
# - Filenames: section_chapter_003_pic0.png
# - Images display in Obsidian export
```

---

### Phase 8: AI Cleanup Enhancement (0.5 days / 4 hours)

#### T-021: Update Cleanup Prompt to Preserve Images

**Priority**: Critical
**Estimated Hours**: 1
**Dependencies**: T-005

**Context & Background**

**Purpose**: Instruct Ollama to preserve image markdown syntax during cleanup.

**As a** AI cleanup process
**I need** explicit instructions to preserve images
**So that** figures aren't removed during text processing

**Implementation Details**:

**Files to Modify/Create**:
```
├── worker/lib/local/ollama-cleanup.ts - [Purpose: Update cleanSection prompt]
```

**Code Changes** (around line 124):

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

**Code Patterns to Follow**:
- **Prompt Engineering**: `worker/lib/local/ollama-cleanup.ts:124-146` - Existing prompt structure
- **Preservation Rules**: Add specific image syntax rules to existing preservation directives

**Acceptance Criteria**:

```gherkin
Scenario: Images preserved during cleanup
  Given markdown with OCR artifacts and images
  When cleanMarkdownLocal is called
  Then OCR artifacts are fixed
  And ![caption](filename.png) syntax preserved exactly
  And no image references removed

Scenario: Verification test
  Given markdown:
    """
    Some text with OCR: ﬁrst word.

    ![Diagram](page1_pic0.png)

    More text here.
    """
  When cleaned with Ollama
  Then result contains 'first word' (OCR fixed)
  And result contains '![Diagram](page1_pic0.png)' (image preserved)
```

---

#### T-022: Write Image Preservation Tests

**Priority**: High
**Estimated Hours**: 1.5
**Dependencies**: T-021

**Implementation Details**:

**Files to Modify/Create**:
```
├── worker/lib/local/__tests__/ollama-cleanup.test.ts - [Purpose: Add image preservation tests]
```

**Test Cases**:

```typescript
describe('Image Preservation', () => {
  test('preserves image syntax during cleanup', async () => {
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
    expect(cleaned).toContain('first')
    expect(cleaned).not.toContain('ﬁrst')
  })

  test('handles multiple images in section', async () => {
    const markdown = `
Text before.

![Fig 1](page1_pic0.png)
![Fig 2](page1_pic1.png)
![Fig 3](page2_pic0.png)

Text after.
`

    const cleaned = await cleanMarkdownLocal(markdown)

    const imageCount = (cleaned.match(/!\[.*?\]\(.*?\.png\)/g) || []).length
    expect(imageCount).toBe(3)
  })
})
```

---

### Phase 9: Testing & Validation (1 day / 8 hours)

#### T-023: Write Unit Tests for Python Extraction

**Priority**: High
**Estimated Hours**: 1.5
**Dependencies**: T-005, T-007

**Implementation Details**:

**Files to Modify/Create**:
```
├── worker/scripts/tests/test_figure_extraction.py - [Purpose: NEW - Python unit tests]
├── worker/scripts/tests/test_table_extraction.py - [Purpose: NEW - Python unit tests]
```

**Test Cases**:

```python
# test_figure_extraction.py
def test_extract_figures():
    doc = load_test_pdf_with_images()
    figures = extract_figures(doc)

    assert len(figures) > 0, "Should extract at least one figure"
    assert figures[0]['data'].startswith('iVBORw0KGgo'), "Should be valid base64 PNG"
    assert figures[0]['page_number'] is not None, "Should have page number"
    assert figures[0]['width'] > 0, "Should have dimensions"

def test_corrupted_image_handling():
    # Mock document with one corrupted image
    doc = create_mock_doc_with_corrupted_image()
    figures = extract_figures(doc)

    # Should skip corrupted, extract valid ones
    assert 'warning' in captured_stderr
    assert len(figures) >= 0  # Doesn't crash

# test_table_extraction.py
def test_extract_tables():
    doc = load_test_pdf_with_tables()
    tables = extract_tables(doc)

    assert len(tables) > 0, "Should extract at least one table"
    assert tables[0]['markdown'].startswith('|'), "Should be valid markdown table"
    assert isinstance(tables[0]['structured_data'], list), "Should have JSON data"
    assert tables[0]['num_rows'] > 0, "Should have row count"
```

---

#### T-024: Write Integration Tests for Full Pipeline

**Priority**: Critical
**Estimated Hours**: 2.5
**Dependencies**: T-018, T-020

**Implementation Details**:

**Files to Modify/Create**:
```
├── worker/tests/integration/image-extraction.test.ts - [Purpose: NEW - End-to-end tests]
```

**Test Cases**:

```typescript
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

    // 5. Verify tables
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

---

#### T-025: Execute Manual Testing Checklist

**Priority**: High
**Estimated Hours**: 2
**Dependencies**: T-024

**Manual Testing Checklist**:

```markdown
## PDF Processing
- [ ] Upload PDF with figures (use textbook or technical paper)
- [ ] Verify figures in Storage (Supabase UI → documents → user/doc/images)
- [ ] Check figures table metadata (page_number, bbox, caption)
- [ ] Verify tables in database with structured_data
- [ ] Export to Obsidian
- [ ] Open in Obsidian → verify images display
- [ ] Check tables render as markdown

## EPUB Processing
- [ ] Upload EPUB with images
- [ ] Verify section_marker used (not page_number)
- [ ] Check images in Obsidian
- [ ] Verify tables work

## Edge Cases
- [ ] PDF with no images (should not error)
- [ ] PDF with only tables (no figures)
- [ ] Large images >2MB (should handle)
- [ ] Corrupted image in PDF (should skip, not fail)
- [ ] Table with special characters (|, -)

## Performance
- [ ] 50-page PDF with 10 images: <20 min total
- [ ] 500-page PDF with 50 images: <25 min total
- [ ] Storage usage reasonable (~17MB for 500-page book)
```

---

#### T-026: Run Performance Benchmarks

**Priority**: Medium
**Estimated Hours**: 1.5
**Dependencies**: T-025

**Implementation Details**:

**Files to Modify/Create**:
```
├── worker/benchmarks/image-extraction-benchmark.ts - [Purpose: NEW - Performance tests]
```

**Benchmark Script**:

```typescript
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
  }
}
```

**Performance Targets**:
- Extraction: <3 min added to Stage 2
- Upload (50 images): <2 min for Stage 6
- Total overhead: <5 min for 500-page PDF

---

## Implementation Timeline

### Week 1 (Days 1-3)

**Day 1: Database + Python PDF** (8 hours)
- Morning: T-001 (Database migration) - 4 hours
- Afternoon: T-002, T-003 (Python PDF figures) - 2.5 hours

**Day 2: Python PDF + EPUB** (8 hours)
- Morning: T-004, T-005 (Python PDF tables + integration) - 3.5 hours
- Afternoon: T-006, T-007 (EPUB enhancement) - 2 hours

**Day 3: TypeScript Upload** (8 hours)
- Morning: T-008, T-009 (Type defs + parallel upload) - 3.5 hours
- Afternoon: T-010, T-011 (Table saver + tests) - 3 hours

### Week 2 (Days 4-6)

**Day 4: Obsidian + PDF Integration** (8 hours)
- Morning: T-012, T-013, T-014 (Obsidian export) - 6.5 hours
- Afternoon: T-015, T-016 (PDF processor Stage 6) - 3.5 hours

**Day 5: Processor Integration + AI Cleanup** (8 hours)
- Morning: T-017, T-018 (PDF processor testing) - 3 hours
- Afternoon: T-019, T-020 (EPUB processor) - 2.5 hours
- Evening: T-021, T-022 (AI cleanup enhancement) - 2.5 hours

**Day 6: Testing & Validation** (8 hours)
- Morning: T-023, T-024 (Unit + integration tests) - 4 hours
- Afternoon: T-025, T-026 (Manual testing + benchmarks) - 3.5 hours

**Total: 6 days (48 hours)**

---

## Critical Path Analysis

### Critical Path (Must complete in sequence):

1. **T-001** (Database) → Blocks all database operations
2. **T-002** → **T-003** → **T-004** → **T-005** (Python PDF) → Blocks Python integration
3. **T-005** → **T-006** → **T-007** (EPUB) → Extends Python work
4. **T-008** → **T-009** → **T-010** (TypeScript upload) → Blocks processor integration
5. **T-015** → **T-016** → **T-017** → **T-018** (PDF processor) → Blocks EPUB processor
6. **T-019** → **T-020** (EPUB processor) → Final processor work
7. **T-024** → **T-025** → **T-026** (Testing) → Validation sequence

### Parallelization Opportunities:

- **T-006, T-007** (EPUB) can start while **T-008** (TypeScript types) in progress
- **T-012, T-013, T-014** (Obsidian) parallel with **T-015, T-016** (PDF processor caching)
- **T-021, T-022** (AI cleanup) parallel with **T-019, T-020** (EPUB processor)
- **T-023** (Python tests) parallel with **T-024** (TypeScript integration tests)

### Potential Bottlenecks:

1. **T-009** (Parallel upload implementation) - Complex logic, 3 hours
2. **T-018** (PDF processor testing) - Integration testing, 2 hours
3. **T-024** (Full integration tests) - End-to-end validation, 2.5 hours
4. **T-025** (Manual testing) - Human validation required, 2 hours

---

## Risk Mitigation

### Risk 1: Memory Issues with Large Images
**Mitigation**:
- Use `images_scale=2.0` (tested optimal)
- Process images one at a time (not batch in memory)
- Monitor during T-018, T-020 testing

### Risk 2: Upload Time Longer Than Expected
**Mitigation**:
- Parallel upload (5 at time) = 80% time savings
- Benchmark in T-026 with real network
- Consider background upload for future (not this sprint)

### Risk 3: AI Cleanup Removes Images
**Mitigation**:
- Explicit preservation in prompt (T-021)
- Validation tests (T-022)
- If >5% removal rate, add validation step

### Risk 4: Storage Costs
**Mitigation**:
- PNG compression (default)
- Monitor in T-025 manual testing
- Document typical costs in user guide

---

## Success Metrics

### Functional Metrics
- ✅ Figures extracted from PDF and EPUB
- ✅ Images stored in Storage with correct paths
- ✅ Metadata tracked in database
- ✅ Markdown keeps local refs
- ✅ Obsidian export works

### Performance Metrics
- ✅ Image extraction adds <3 min (Stage 2)
- ✅ Image upload adds <2 min for 50 images (Stage 6)
- ✅ Total increase <5 min for 500-page PDF

### Quality Metrics
- ✅ 144 DPI image quality
- ✅ <5% extraction failures
- ✅ All tests passing
- ✅ No regression in existing pipeline

---

## Documentation Updates Required

After implementation complete:

1. **PROCESSING_PIPELINE.md** - Add Stage 6 to pipeline diagrams
2. **CLAUDE.md** - Add section on image/table extraction
3. **docs/image-table-extraction.md** - Create user guide (NEW)
4. **docs/API.md** - Document new tables schema (UPDATE)
5. **README.md** - Update features list (UPDATE)

---

## Appendix: Reference Files

### Code Patterns
- **Migration**: `supabase/migrations/045_add_local_pipeline_columns.sql`
- **Python Extraction**: `worker/scripts/docling_extract.py`
- **TypeScript Upload**: `worker/lib/local/bulletproof-matcher.ts` (parallel pattern)
- **Obsidian Export**: `worker/handlers/obsidian-sync.ts`
- **PDF Processor**: `worker/processors/pdf-processor.ts`
- **AI Cleanup**: `worker/lib/local/ollama-cleanup.ts`

### External Dependencies
- Docling 2.55.1 (already installed)
- PIL/Pillow (auto-installed with Docling)
- Pandas (already installed)
- Supabase Storage (already configured)

### Environment Variables
- `PROCESSING_MODE=local` (already used)
- `SUPABASE_URL` (already configured)
- `SUPABASE_SERVICE_ROLE_KEY` (already configured)
- Optional: `MAX_IMAGE_SIZE` for limits (future)

---

**Status**: ✅ Ready for Implementation
**Next Steps**:
1. Create git branch: `feature/image-table-extraction-v2`
2. Start with T-001 (Database migration)
3. Work through tasks sequentially per timeline
4. Test incrementally after each phase
5. Document as you go (inline comments)

---

*Generated from PRP: docs/todo/image-and-table-extraction-v2.md*
*Task Template: docs/templates/technical-task-template.md*
*Date: 2025-10-11*
