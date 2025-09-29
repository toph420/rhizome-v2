# Upload & Processing Workflow Documentation

## Overview

This document serves as the source of truth for the document upload and processing workflow in Rhizome V2. It maps the complete flow from user interaction through background processing to final storage.

## Source Type Mapping

### Frontend → Backend Mapping

| User Interface | Frontend Value | Backend Expected | Processor Class | Status |
|---------------|---------------|------------------|-----------------|--------|
| PDF Upload | `pdf` | `pdf` | `PDFProcessor` | ✅ Working |
| YouTube URL | `youtube` | `youtube` | `YouTubeProcessor` | ✅ Working* |
| Web Article URL | `web` | `web_url` | `WebProcessor` | ❌ **MISMATCH** |
| Markdown (As-Is) | `markdown_asis` | `markdown_asis` | `MarkdownAsIsProcessor` | ✅ Working |
| Markdown (Clean) | `markdown_clean` | `markdown_clean` | `MarkdownCleanProcessor` | ✅ Working |
| Text File | `txt` | `txt` | `TextProcessor` | ✅ Working |
| Paste Content | `paste` | `paste` | `PasteProcessor` | ✅ Working |

**Critical Issue**: Frontend sends `web` but backend expects `web_url`, causing "Invalid source type" error.

## Complete Processing Flow

### Stage 1: User Upload (Frontend)

1. **User selects upload method** in `UploadZone.tsx`:
   - File tab: PDF, Markdown, Text
   - URL tab: YouTube, Web Article
   - Paste tab: Direct content

2. **Frontend determines source type**:
   ```typescript
   // File upload
   if (file.name.endsWith('.pdf')) → 'pdf'
   if (file.name.endsWith('.md')) → 'markdown_asis' or 'markdown_clean'
   if (file.name.endsWith('.txt')) → 'txt'
   
   // URL detection
   if (url.includes('youtube.com') || url.includes('youtu.be')) → 'youtube' 
   else if (url.startsWith('http')) → 'web' ❌ (should be 'web_url')
   
   // Paste
   Always → 'paste'
   ```

3. **Server Action** (`uploadDocument` in `src/app/actions/documents.ts`):
   - Creates document record in database
   - Uploads source file to Supabase Storage (if file upload)
   - Creates background job with `source_type` in `input_data`

### Stage 2: Background Processing (Worker)

1. **Job Pickup** (`worker/index.ts`):
   - Polls `background_jobs` table every 5 seconds
   - Finds pending jobs or failed jobs ready for retry
   - Marks job as `processing`

2. **Handler Routing** (`worker/handlers/process-document.ts`):
   - Extracts `source_type` from job input data
   - Validates source type against allowed list
   - Creates processor via `ProcessorRouter`

3. **Processor Execution** (`worker/processors/`):
   - Each processor transforms content to markdown
   - Creates chunks with metadata
   - Returns `ProcessResult` with:
     - `markdown`: Clean content
     - `chunks`: Array of processed chunks
     - `metadata`: Document metadata
     - `wordCount`: Total words
     - `outline`: Document structure

### Stage 3: Storage & Database Operations

#### Current State (BROKEN)

**Problem**: Inconsistent behavior across processors:

| Processor | Current Behavior | Issue |
|-----------|-----------------|-------|
| PDFProcessor | Saves markdown to storage, generates embeddings, inserts chunks | Violates separation of concerns |
| YouTubeProcessor | Saves source-raw.md to wrong path, returns other data | Wrong storage path, incomplete |
| Others | Return data only | Handler doesn't save returned data |

**Result**: No processor sets `markdown_available` or `embeddings_available` flags.

#### Correct Architecture (TO BE IMPLEMENTED)

**Handler should orchestrate all storage/DB operations**:

```typescript
// After processor.process() returns result:

1. Save markdown to storage:
   - Path: `${userId}/${documentId}/content.md`
   
2. Generate embeddings:
   - Use result.chunks to generate embeddings
   
3. Insert chunks with embeddings to database:
   - Table: `chunks`
   - Include all metadata from processor
   
4. Update document record:
   - Set `markdown_available = true`
   - Set `embeddings_available = true`
   - Set `processing_status = 'completed'`
   - Clear `processing_error`
```

## Storage Paths

### Correct Path Structure
```
documents/ (Supabase Storage bucket)
├── {userId}/
│   └── {documentId}/
│       ├── source.pdf         # Original upload (if PDF)
│       ├── source.md          # Original upload (if Markdown)
│       ├── source.txt         # Original upload (if Text)
│       ├── content.md         # Processed markdown (ALL types)
│       └── source-raw.md      # Original transcript (YouTube only)
```

### Current Issues
- YouTubeProcessor saves `source-raw.md` to root instead of `${userId}/${documentId}/`
- PDFProcessor saves correctly but shouldn't be saving at all
- Other processors don't save anything (handler should do it)

## Database Schema

### Key Tables

**documents**
- `id`: UUID
- `user_id`: UUID
- `title`: String
- `storage_path`: String (base path like `userId/docId`)
- `source_type`: String (must match backend expectations)
- `source_url`: String (optional)
- `processing_status`: pending | processing | completed | failed
- `processing_error`: String (error message if failed)
- `markdown_available`: Boolean (**CRITICAL** - not being set)
- `embeddings_available`: Boolean (**CRITICAL** - not being set)

**chunks**
- `id`: UUID
- `document_id`: UUID
- `content`: Text
- `embedding`: Vector (768 dimensions)
- `chunk_index`: Integer
- `themes`: Array
- `importance_score`: Float
- `summary`: Text
- `position_context`: JSONB

**background_jobs**
- `id`: UUID
- `job_type`: String (always 'process_document')
- `status`: pending | processing | completed | failed
- `input_data`: JSONB (contains document_id, source_type, etc.)
- `progress`: JSONB (stage info and percentage)

## Error Scenarios & Recovery

### Current Errors

1. **"Invalid source type"** - Web articles
   - Cause: Frontend sends 'web', backend expects 'web_url'
   - Fix: Update frontend to send 'web_url'

2. **Documents process but don't appear**
   - Cause: `markdown_available` flag not set
   - Fix: Handler must set flags after processing

3. **YouTube source-raw.md in wrong location**
   - Cause: Processor uses wrong path
   - Fix: Use full path with userId/docId

### Recovery Mechanisms

- **Automatic retry**: Failed jobs retry with exponential backoff
- **Manual retry**: User can trigger via UI
- **Stale job recovery**: Jobs stuck >10 minutes are reprocessed
- **Error messages**: User-friendly errors stored in `processing_error`

## Implementation Priority

### Phase 1: Critical Fixes (Immediate)
1. ✅ Fix frontend to send 'web_url' instead of 'web'
2. ✅ Update handler to save markdown and set database flags
3. ✅ Fix YouTubeProcessor storage path

### Phase 2: Architecture Cleanup (Next Sprint)
1. Remove storage/DB operations from PDFProcessor
2. Ensure all processors only return data
3. Centralize all orchestration in handler

### Phase 3: Testing & Validation (After Fixes)
1. Test all 7 document types
2. Verify storage paths are correct
3. Confirm flags are set properly
4. Check reader displays documents

## Testing Checklist

After implementation, verify:

- [ ] PDF upload → processes → appears in reader
- [ ] YouTube URL → processes → appears with clean markdown
- [ ] Web article URL → processes → appears with extracted content
- [ ] Markdown (as-is) → processes → appears unchanged
- [ ] Markdown (clean) → processes → appears enhanced
- [ ] Text file → processes → appears formatted
- [ ] Paste content → processes → appears structured

For each type, check:
- [ ] Storage path is `userId/docId/content.md`
- [ ] Database has `markdown_available = true`
- [ ] Database has `embeddings_available = true`
- [ ] Chunks have embedding vectors
- [ ] Document appears in reader without "Processing" message

## Code References

- Frontend upload: `src/components/library/UploadZone.tsx:14-230`
- Server action: `src/app/actions/documents.ts:50-193`
- Handler routing: `worker/handlers/process-document.ts:50-68`
- Processor router: `worker/processors/router.ts:26-69`
- Processor base: `worker/processors/base.ts`

## Migration for Existing Documents

For documents already processed but missing flags:

```sql
-- Fix completed documents missing flags
UPDATE documents 
SET 
  markdown_available = true,
  embeddings_available = true
WHERE 
  processing_status = 'completed'
  AND (markdown_available = false OR embeddings_available = false);
```

## Monitoring

Key metrics to track:
- Processing success rate by source type
- Average processing time per type
- Storage usage patterns
- Failed job reasons

## Future Improvements

1. **Unified source type enum**: Share between frontend and backend
2. **Progress streaming**: Real-time updates via WebSocket
3. **Partial processing**: Resume interrupted jobs
4. **Batch processing**: Handle multiple documents efficiently