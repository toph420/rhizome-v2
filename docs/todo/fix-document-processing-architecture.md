# Fix Document Processing Architecture

## Problem Summary

### Current Issues
1. **Architecture Violation**: Processors are mixing responsibilities (PDFProcessor saves to storage/DB, YouTubeProcessor doesn't)
2. **Storage Path Bug**: YouTubeProcessor saves `source-raw.md` to wrong path (root instead of userId/docId/)
3. **Missing Database Flags**: Neither processors nor handler set `markdown_available` and `embeddings_available` flags
4. **Missing Operations**: Handler doesn't save markdown or chunks that processors return
5. **Inconsistent Behavior**: Each processor behaves differently, making system unpredictable

### Root Cause
The document processing system violates separation of concerns. Processors should ONLY transform data, but currently:
- PDFProcessor: Saves to storage AND database directly
- YouTubeProcessor: Only saves raw transcript, returns everything else
- Handler: Assumes processors handle everything but doesn't actually save returned data
- No component sets the critical `markdown_available` flag needed for the reader to work

## Solution: Clean Architecture Separation

### Correct Architecture
```
Handler (orchestrator):
  1. Create processor
  2. Call processor.process()
  3. Get ProcessResult (markdown, chunks, metadata)
  4. Save markdown to storage
  5. Generate embeddings 
  6. Save chunks + embeddings to database
  7. Update document status with flags

Processors (data transformers):
  - ONLY process and return data
  - NO direct storage/database operations
  - Return ProcessResult with all necessary data
```

## Implementation Plan

### Part 1: Fix the Handler (`worker/handlers/process-document.ts`)

**After line 86** (after getting ProcessResult), add the complete orchestration logic:

```typescript
// After line 86: console.log(`   - Outline sections: ${result.outline?.length || 0}`)

// Stage 1: Save markdown to storage
const storagePath = `${doc.user_id}/${document_id}`
const markdownPath = `${storagePath}/content.md`

console.log(`💾 Saving markdown to storage: ${markdownPath}`)
const { error: uploadError } = await supabase.storage
  .from('documents')
  .upload(markdownPath, result.markdown, {
    contentType: 'text/markdown',
    upsert: true
  })

if (uploadError) {
  throw new Error(`Failed to save markdown: ${uploadError.message}`)
}

// Stage 2: Generate embeddings for chunks
console.log(`🧮 Generating embeddings for ${result.chunks.length} chunks`)
const { generateEmbeddings } = await import('../lib/embeddings.js')
const chunkContents = result.chunks.map(chunk => chunk.content)
const embeddings = await generateEmbeddings(chunkContents)

// Stage 3: Prepare chunks for database insertion
const chunksForDb = result.chunks.map((chunk, index) => ({
  document_id,
  content: chunk.content,
  embedding: embeddings[index],
  chunk_index: chunk.chunkIndex ?? index,
  start_offset: chunk.startOffset,
  end_offset: chunk.endOffset,
  themes: chunk.themes,
  importance_score: chunk.importance ?? 0.5,
  summary: chunk.summary,
  position_context: chunk.positionContext,
  // Include any additional metadata
  ...(chunk.metadata && { metadata: chunk.metadata })
}))

// Stage 4: Insert chunks to database
console.log(`📊 Inserting ${chunksForDb.length} chunks to database`)
const { error: insertError } = await supabase
  .from('chunks')
  .insert(chunksForDb)

if (insertError) {
  throw new Error(`Failed to insert chunks: ${insertError.message}`)
}

// Stage 5: Update document with metadata and flags
console.log(`✅ Updating document status and metadata`)
const { error: updateError } = await supabase
  .from('documents')
  .update({
    processing_status: 'completed',
    markdown_available: true,
    embeddings_available: true,
    word_count: result.wordCount,
    outline: result.outline,
    // Clear any previous error
    processing_error: null
  })
  .eq('id', document_id)

if (updateError) {
  throw new Error(`Failed to update document: ${updateError.message}`)
}

// Remove the old updateDocumentStatus call at line 92 since we're doing it above
```

**Update the `updateDocumentStatus` function** (lines 167-189) to handle flags properly for error cases:

```typescript
async function updateDocumentStatus(
  supabase: any, 
  documentId: string, 
  status: string, 
  errorMessage?: string
) {
  const updateData: any = {
    processing_status: status
  }
  
  // Set flags based on status
  if (status === 'completed') {
    updateData.markdown_available = true
    updateData.embeddings_available = true
  } else if (status === 'failed') {
    updateData.markdown_available = false
    updateData.embeddings_available = false
    updateData.processing_error = errorMessage
  }
  
  const { error } = await supabase
    .from('documents')
    .update(updateData)
    .eq('id', documentId)
    
  if (error) {
    console.error('Failed to update document status:', error)
  }
}
```

### Part 2: Fix YouTubeProcessor Storage Path (`worker/processors/youtube-processor.ts`)

**Line 62**: Fix the storage path for source-raw.md:

```typescript
// OLD (line 62):
await this.uploadToStorage('source-raw.md', rawBlob, 'text/markdown')

// NEW:
await this.uploadToStorage(`${storagePath}/source-raw.md`, rawBlob, 'text/markdown')
```

### Part 3: Remove Storage/DB Operations from PDFProcessor (`worker/processors/pdf-processor.ts`)

1. **Remove lines 164-172** (save markdown to storage section)
2. **Remove lines 174-197** (generate embeddings and insert to DB section)
3. **Update the return statement** to return raw chunks without embeddings:

```typescript
// Line 199-209 should now be:
return {
  markdown,
  chunks,  // Just the chunks, no embeddings
  metadata: {
    title: this.extractTitle(markdown),
    extra: {
      source_type: 'pdf',
      file_size_bytes: pdfData.size,
      upload_name: fileUploadResult.name,
      display_name: fileUploadResult.displayName,
      uri: fileUploadResult.uri,
      state: fileUploadResult.state,
      error: fileUploadResult.error
    }
  },
  wordCount: markdown.split(/\s+/).filter(word => word.length > 0).length,
  outline
}
```

### Part 4: Ensure All Processors Return Consistent ProcessResult

Verify all processors ONLY return data, never save to storage/DB:

| Processor | Current State | Action Needed |
|-----------|--------------|---------------|
| YouTubeProcessor | Saves source-raw.md | Move to handler or keep with fixed path |
| PDFProcessor | Saves everything | Remove all storage/DB operations |
| WebProcessor | Returns data only ✅ | None |
| MarkdownProcessor | Returns data only ✅ | None |
| TextProcessor | Returns data only ✅ | None |
| PasteProcessor | Returns data only ✅ | None |

### Part 5: Optional - Move YouTube source-raw.md Save to Handler

If we want complete consistency, move the YouTube processor's source-raw.md save to the handler:

```typescript
// In handler, after saving content.md:
if (sourceType === 'youtube' && job.input_data.source_raw) {
  const sourceRawPath = `${storagePath}/source-raw.md`
  await supabase.storage
    .from('documents')
    .upload(sourceRawPath, job.input_data.source_raw, {
      contentType: 'text/markdown',
      upsert: true
    })
}
```

## Benefits of This Architecture

1. **Single Responsibility**: Processors transform data, handler orchestrates storage
2. **Consistency**: All document types handled the same way
3. **Maintainability**: Storage/DB logic in one place (handler)
4. **Debugging**: Clear flow - processor → handler → storage/DB
5. **Flags Always Set**: Handler ensures markdown_available and embeddings_available are set
6. **Correct Paths**: Handler controls storage paths, ensuring consistency

## Testing Checklist

After implementation, test all document types:

- [ ] Process a YouTube video → Should display in reader
- [ ] Process a PDF → Should continue working
- [ ] Process a web article → Should display correctly
- [ ] Process markdown (as-is) → Should display correctly
- [ ] Process markdown (with cleaning) → Should display correctly
- [ ] Process plain text → Should display correctly
- [ ] Process pasted content → Should display correctly

Verify storage and database:

- [ ] Check storage paths → All files under userId/documentId/
- [ ] Check database flags → markdown_available and embeddings_available should be true
- [ ] Check reader page → Documents load without "Processing Document" message
- [ ] Verify chunks have embeddings → All chunks in DB should have embedding vectors

## Migration for Existing Documents

For documents already processed but missing flags:

```sql
-- Fix documents that are completed but missing flags
UPDATE documents 
SET 
  markdown_available = true,
  embeddings_available = true
WHERE 
  processing_status = 'completed'
  AND markdown_available = false;
```

## Priority

**HIGH PRIORITY** - This bug prevents all documents from being readable after processing.

## Estimated Time

- Implementation: 2-3 hours
- Testing: 1 hour
- Total: 3-4 hours