# Document Type Detection & Metadata Preview

**Date:** 2025-10-03
**Status:** ✅ 90% Complete - Implementation Done, Testing Remaining
**Time Spent:** ~4 hours
**Remaining:** ~30 min (manual testing)

## Overview

Add synchronous metadata extraction during PDF upload with user-editable preview card before full processing. Implement type-specific chunking prompts to improve chunk quality for different document types.

## User Flow

```
Drop PDF → Extract first 10 pages (~15s) → Show preview card → User edits/confirms → Full processing
```

## Preview Card Features

- **Cover Image**: Upload optional, blank placeholder by default
- **Title**: Editable text field (auto-detected from first pages)
- **Author**: Editable text field (auto-detected)
- **Document Type**: Dropdown selector (auto-detected, user can override)
  - Fiction
  - Nonfiction Book
  - Academic Paper
  - Technical Manual
  - Article
  - Essay
- **Year**: Optional field (auto-detected if available)
- **Publisher**: Optional field (auto-detected if available)
- **Confirm/Cancel**: Buttons to proceed or abort

## Progress Summary

### ✅ Completed (4 hours)

1. **Database Schema** - Migration 025 applied ✅
2. **Metadata Extraction API** - `/api/extract-metadata` route created ✅
3. **DocumentPreview Component** - Full UI with cover upload ✅
4. **Type-Specific Prompts** - Extended existing `worker/lib/chunking/prompts.ts` ✅
5. **Chunking Integration** - `documentType` parameter threaded through entire pipeline ✅
6. **Upload Flow Integration** - DocumentPreview wired into UploadZone.tsx ✅
7. **Upload Action** - Save metadata, upload cover image ✅
8. **Worker Integration** - documentType passed from upload → worker → chunking ✅
9. **shadcn Components** - Installed missing Select component ✅

### 📋 Remaining (30 min)

10. **Manual Testing** - Validate on 3 real documents (fiction, academic, technical)

---

## Implementation Checklist

### 1. Database Schema ✅ COMPLETE

**Migration:** `supabase/migrations/025_document_metadata_and_cover_images.sql`

```sql
ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS document_type TEXT,
  ADD COLUMN IF NOT EXISTS author TEXT,
  ADD COLUMN IF NOT EXISTS publication_year INTEGER,
  ADD COLUMN IF NOT EXISTS publisher TEXT,
  ADD COLUMN IF NOT EXISTS cover_image_url TEXT,
  ADD COLUMN IF NOT EXISTS detected_metadata JSONB;

COMMENT ON COLUMN documents.document_type IS
  'Document type for chunking: fiction, nonfiction_book, academic_paper, technical_manual, article, essay';
```

**Status:** ✅ Applied successfully

---

### 2. Metadata Extraction API ✅ COMPLETE

**File:** `src/app/api/extract-metadata/route.ts`

**What it does:**
- Accepts PDF file via FormData
- Extracts first 10 pages using Gemini Files API
- Detects title, author, type, year, publisher
- Returns JSON with detected metadata

**Key functions:**
```typescript
extractFirstPages(file: File, pageCount: number): Promise<string>
  - Upload PDF to Gemini Files API
  - Extract pages 1-10 as markdown
  - Return markdown text

detectDocumentMetadata(markdown: string): Promise<DetectedMetadata>
  - Analyze first pages with structured prompt
  - Return JSON: { title, author, type, year, publisher, description }
```

**Cost:** ~$0.006 per document (10 pages + metadata detection)

**Status:** ✅ Fully implemented with validation and error handling

---

### 3. Type-Specific Chunking Prompts ✅ COMPLETE

**File:** `worker/lib/chunking/prompts.ts` (extended existing file)

**Document types and their chunking strategies:**

**Fiction:**
- Chunk by narrative beats (scene changes, perspective shifts)
- Preserve dialogue exchanges intact
- Keep descriptions with associated action
- Themes: character development, plot, symbolism
- Emotional tone is critical

**Nonfiction Book:**
- Chunk by argumentative units (claim + evidence + conclusion)
- Keep examples with explanations
- Preserve lists with context
- Themes: main arguments, subtopics
- Emotional tone: persuasive, informative

**Academic Paper:**
- Chunk by logical sections (intro, methods, results, discussion)
- Keep research questions with methodology
- Preserve citations with context
- Themes: research areas, findings
- Emotional tone: neutral, argumentative strength

**Technical Manual:**
- Chunk by procedural units (complete instructions)
- Keep steps with warnings/notes
- Preserve code blocks with explanations
- Themes: technical domains, procedures
- Emotional tone: instructional, cautionary

**Article:**
- Chunk by journalistic sections (lede, development, conclusion)
- Keep quotes with attribution
- Preserve context around key points
- Themes: topics, angles
- Emotional tone: objective, opinion

**Essay:**
- Chunk by argumentative movements (thesis, development, counterpoint)
- Keep examples with analysis
- Preserve rhetorical flow
- Themes: philosophical threads
- Emotional tone: argumentative, reflective

**Implementation:**
```typescript
export function generateSemanticChunkingPrompt(
  batch: MetadataExtractionBatch,
  maxChunkSize: number = 10000,
  documentType?: DocumentType // Optional parameter added
): string {
  const typeSpecificGuidance = documentType
    ? getTypeSpecificGuidance(documentType)
    : ''
  // ... existing prompt with injected type-specific guidance
}
```

**Status:** ✅ All 6 document types implemented with emoji indicators and examples

---

### 4. DocumentPreview Component ✅ COMPLETE

**File:** `src/components/upload/DocumentPreview.tsx`

**Props:**
```typescript
interface DocumentPreviewProps {
  metadata: DetectedMetadata
  onConfirm: (edited: DetectedMetadata, coverImage?: File) => void
  onCancel: () => void
}
```

**UI Layout:**
```
┌─────────────────────────────────────┐
│  Confirm Document Details           │
├─────────────────────────────────────┤
│  ┌───────┐  Title: [          ]    │
│  │       │  Author: [          ]    │
│  │ Cover │  Type: [Dropdown    ]    │
│  │ Image │  Year: [    ] (opt)      │
│  │       │  Publisher: [  ] (opt)   │
│  └───────┘                          │
│  [Upload Cover] (optional)          │
│                                      │
│  Description: "AI-detected 1-2      │
│  sentence description..."           │
│                                      │
│  [Cancel]  [Process Document]       │
└─────────────────────────────────────┘
```

**Cover Image Upload:**
- Optional file input with preview
- Image preview with remove button
- Cover uploaded to Supabase Storage
- URL saved to `documents.cover_image_url`

**Status:** ✅ Full two-column layout with cover upload, all fields editable

---

### 5. Update Upload Flow 🚧 IN PROGRESS

**File:** `src/components/upload/FileUpload.tsx` (needs modification)

**State machine:**
```typescript
type UploadState =
  | { phase: 'idle' }
  | { phase: 'detecting'; file: File }
  | { phase: 'preview'; file: File; metadata: DetectedMetadata }
  | { phase: 'processing'; file: File; metadata: DetectedMetadata }
```

**Flow:**
```typescript
handleFileDrop(file: File)
  → setState({ phase: 'detecting', file })
  → fetch('/api/extract-metadata', { file })
  → setState({ phase: 'preview', metadata })

handleConfirm(editedMetadata, coverImage?)
  → uploadCoverImage() // if provided
  → uploadDocument() with metadata
  → setState({ phase: 'processing' })
```

**Status:** 🚧 Component created, needs integration into existing upload component

**Next Step:** Wire DocumentPreview into FileUpload state machine

---

### 6. Update Chunking to Use Document Type ✅ COMPLETE

**File:** `worker/lib/ai-chunking-batch.ts`

**Changes Made:**
- Added `documentType?: DocumentType` parameter to `batchChunkAndExtractMetadata()`
- Passed through to `extractBatchMetadata()` → `callGeminiForMetadata()` → `generateSemanticChunkingPrompt()`
- Added logging when type-specific chunking is active
- Handles optional parameter gracefully (falls back to generic prompt)

**Full call chain updated:**
```typescript
batchChunkAndExtractMetadata(markdown, config, onProgress, documentType?)
  → extractBatchMetadata(..., documentType)
    → callGeminiForMetadata(..., documentType)
      → generateSemanticChunkingPrompt(batch, maxSize, documentType)
```

**Status:** ✅ Complete - all function signatures updated, parameter threaded through entire pipeline

**Next Step:** Pass `documentType` from upload action → background job → processor

---

### 7. Testing 📋 NOT STARTED

**Test Documents:**
1. Fiction: Gravity's Rainbow (or similar literary fiction)
2. Academic: ML research paper
3. Technical: API documentation

**What to validate:**

**Fiction:**
- ✓ Scenes stay intact (no mid-scene splits)
- ✓ Dialogue not broken across chunks
- ✓ Descriptions with their associated action

**Academic:**
- ✓ Methodology sections complete (not split mid-procedure)
- ✓ Citations with surrounding context
- ✓ Results/discussion logically bounded

**Technical:**
- ✓ Code blocks with their explanations
- ✓ Step-by-step instructions intact
- ✓ Warnings/notes with their procedures

**Manual validation method:**
- Process each document type
- Export chunks to markdown files
- Visual inspection of chunk boundaries
- Note improvements over generic chunking

**Status:** 📋 Waiting for upload flow completion

---

## Current Status Details

### What's Working

1. **Database** - Schema supports all metadata fields including cover images
2. **API** - `/api/extract-metadata` extracts and detects metadata from first 10 pages
3. **UI Component** - DocumentPreview shows editable preview with cover upload
4. **Prompts** - Type-specific chunking guidance for all 6 document types
5. **Worker** - Chunking pipeline accepts and uses documentType parameter

### What Needs Completion

1. **Upload Flow** - Integrate DocumentPreview into FileUpload component
   - Add 'detecting' and 'preview' states to upload state machine
   - Call `/api/extract-metadata` on file drop
   - Show DocumentPreview component
   - Handle confirm/cancel actions
   - Upload cover image to Supabase Storage if provided
   - Pass metadata to document creation

2. **Worker Integration** - Pass document_type from job to processor
   - Modify `uploadDocument()` action to save metadata fields
   - Update background job to include document_type in input_data
   - Modify pdf-processor to extract type from job and pass to chunking

3. **Testing** - Validate chunk quality improvements
   - Process fiction book (test scene preservation)
   - Process academic paper (test methodology completeness)
   - Process technical manual (test code block preservation)

---

## Cost Analysis

**Per Document:**
- Metadata extraction (10 pages): ~$0.005
- Metadata detection: ~$0.001
- **Total added cost:** ~$0.006

**Full processing:** ~$0.50 (unchanged)
**Total:** ~$0.506 per document

**For 100 books:** ~$0.60 added cost (negligible)

---

## Files Created/Modified

**✅ New Files:**
- `supabase/migrations/025_document_metadata_and_cover_images.sql` ✅
- `src/app/api/extract-metadata/route.ts` ✅
- `src/components/upload/DocumentPreview.tsx` ✅

**✅ Modified Files:**
- `worker/lib/chunking/prompts.ts` ✅ - Added type-specific guidance
- `worker/lib/ai-chunking-batch.ts` ✅ - Added documentType parameter throughout

**🚧 Needs Modification:**
- `src/components/upload/FileUpload.tsx` - Add preview state machine
- `src/app/actions/documents.ts` - Save metadata fields
- `worker/processors/pdf-processor.ts` - Pass documentType to chunking

---

## Next Steps After Implementation

1. **Process test documents** - Validate chunking quality improvement
2. **Tune type detection** - Adjust if AI misidentifies document types frequently
3. **Add type filter to library** - Group/filter documents by type
4. **Consider additional types** - Poetry, screenplay, legal, etc. if needed

---

## Questions/Decisions

**Q:** Should cover image be required?
**A:** No, optional. Blank placeholder by default.

**Q:** Should we support bulk upload with metadata detection?
**A:** No, focus on single document upload first. Batch upload later if needed.

**Q:** What if metadata detection fails?
**A:** Default to "Untitled Document", "Unknown" author, "nonfiction_book" type. User can edit.

**Q:** Can user change metadata after processing?
**A:** Yes, add "Edit Metadata" to document cards. Trigger reprocessing if type changes.

---

## Implementation Timeline

- ✅ **Migration + Schema:** 5 min (complete)
- ✅ **API Endpoint:** 1 hour (complete)
- ✅ **Type Prompts:** 1 hour (complete)
- ✅ **Preview Component:** 1 hour (complete)
- ✅ **Update Chunking:** 30 min (complete - more thorough than estimated)
- 🚧 **Wire to Upload:** 30 min (in progress)
- 📋 **Testing:** 30 min (not started)

**Estimated:** 4-5 hours
**Actual So Far:** ~3 hours
**Remaining:** ~1 hour

---

## Success Criteria

**Backend (5/5 complete):**
- ✅ Database schema supports metadata and cover images
- ✅ API extracts and detects metadata from first 10 pages
- ✅ Type-specific chunking prompts for 6 document types
- ✅ Chunking pipeline accepts documentType parameter
- ✅ Preview component UI complete with cover upload

**Frontend (2/5 complete):**
- ✅ DocumentPreview component built and styled
- ✅ Cover image upload with preview
- 🚧 Upload flow shows preview after metadata detection
- 📋 User can edit and confirm metadata
- 📋 Cover image uploaded to Supabase Storage

**Validation (0/3 complete):**
- 📋 Fiction chunks preserve scenes and dialogue
- 📋 Academic chunks keep methodology sections intact
- 📋 Technical chunks keep code with explanations

---

## Next Steps (Priority Order)

1. **Wire DocumentPreview into FileUpload** (~30 min)
   - Add state machine with 'detecting' and 'preview' phases
   - Call `/api/extract-metadata` on PDF drop
   - Show DocumentPreview with detected metadata
   - Handle confirm action (upload cover + create job with metadata)

2. **Update Upload Action** (~15 min)
   - Save document_type, author, year, publisher to database
   - Upload cover image to Storage if provided
   - Pass metadata to background job input_data

3. **Update PDF Processor** (~15 min)
   - Extract document_type from job input_data
   - Pass to batchChunkAndExtractMetadata()

4. **Test on Real Documents** (~30 min)
   - Process Gravity's Rainbow (fiction)
   - Process ML paper (academic)
   - Process API docs (technical)
   - Visual validation of chunk boundaries

**Total Remaining:** ~1.5 hours
