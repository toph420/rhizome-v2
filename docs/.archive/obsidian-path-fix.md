# Obsidian Path Error Fix

## Problem Summary

**Error**: `"The "path" argument must be of type string. Received null"`

**When**: Trying to review document in Obsidian (export to vault)

**Where**: Node.js `fs` module when calling `supabase.storage.download()`

## Root Cause

The `exportToObsidian` and `syncFromObsidian` functions were trying to download markdown from storage using `document.markdown_path`, which can be **null** in certain cases:

1. **Documents created before migration 031/039** - These migrations added the `markdown_path` column
2. **markdown_path update failed** - In `process-document.ts` line 228-229, if the database update fails, only a warning is logged
3. **Document still processing** - If export is called before processing completes

### The Problematic Code

```typescript
// worker/handlers/obsidian-sync.ts (line 100)
const { data: markdownBlob, error: downloadError } = await supabase.storage
  .from('documents')
  .download(document.markdown_path)  // ❌ Can be null!
```

When `document.markdown_path` is `null`, Node's `fs.download()` throws:
```
Error: The "path" argument must be of type string. Received null
```

## Solution

Implement a **fallback pattern**: if `markdown_path` is null, construct the path from `storage_path` (which is always set).

### The Fix

**Pattern**: `{storage_path}/content.md` = `{userId}/{documentId}/content.md`

```typescript
// Construct path: use markdown_path if available, otherwise fallback
const markdownStoragePath = document.markdown_path || `${document.storage_path}/content.md`

if (!markdownStoragePath) {
  throw new Error('Cannot determine markdown storage path: both markdown_path and storage_path are null')
}

console.log(`[Obsidian Export] Downloading markdown from: ${markdownStoragePath}`)

const { data: markdownBlob, error: downloadError } = await supabase.storage
  .from('documents')
  .download(markdownStoragePath)  // ✅ Never null
```

## Files Modified

### 1. `worker/handlers/obsidian-sync.ts`

**Function: `exportToObsidian`** (lines 75-113)
- Added `storage_path` to SELECT query
- Implemented fallback logic for download path
- Added logging for debugging

**Function: `syncFromObsidian`** (lines 190-270)
- Added `storage_path` to SELECT query
- Implemented fallback logic for download path
- Implemented fallback logic for upload path
- Added logging for debugging

## Changes Summary

### Before (Broken)
```typescript
const { data: document } = await supabase
  .from('documents')
  .select('title, markdown_path, obsidian_path')  // ❌ Missing storage_path
  .eq('id', documentId)
  .single()

// Download markdown
const { data: blob } = await supabase.storage
  .from('documents')
  .download(document.markdown_path)  // ❌ Crashes if null
```

### After (Fixed)
```typescript
const { data: document } = await supabase
  .from('documents')
  .select('title, markdown_path, obsidian_path, storage_path')  // ✅ Include storage_path
  .eq('id', documentId)
  .single()

// Construct path with fallback
const markdownStoragePath = document.markdown_path || `${document.storage_path}/content.md`  // ✅

if (!markdownStoragePath) {
  throw new Error('Cannot determine markdown storage path')
}

console.log(`[Obsidian Export] Downloading markdown from: ${markdownStoragePath}`)

// Download markdown
const { data: blob } = await supabase.storage
  .from('documents')
  .download(markdownStoragePath)  // ✅ Never null
```

## Testing

### Manual Test

```bash
# 1. Process a document
# 2. Try to export to Obsidian for review
# 3. Should no longer see "path argument must be of type string" error
```

### Expected Behavior

**Logs should show:**
```
[Obsidian Export] Starting export for document abc-123
[Obsidian Export] Downloading markdown from: {userId}/{documentId}/content.md
[Obsidian Export] Markdown written to /path/to/vault/Document.md
[Obsidian Export] ✅ Export complete
```

## Why `storage_path` is Always Set

The `storage_path` column is set during document creation (before processing starts):

```typescript
// When document is created
const storagePath = `${userId}/${documentId}`

await supabase
  .from('documents')
  .insert({
    id: documentId,
    user_id: userId,
    storage_path: storagePath,  // ✅ Always set immediately
    markdown_path: null,         // ❌ Set later during processing
    // ... other fields
  })
```

Thus, `storage_path` is a reliable fallback.

## Related Code

### Where `markdown_path` Gets Set

**File**: `worker/handlers/process-document.ts` (lines 222-232)

```typescript
// After markdown is uploaded to storage
const markdownPath = `${userId}/${documentId}/content.md`

const { error: pathUpdateError } = await supabase
  .from('documents')
  .update({ markdown_path: markdownPath })
  .eq('id', document_id)

if (pathUpdateError) {
  console.warn(`⚠️ Failed to update markdown_path: ${pathUpdateError.message}`)
  // ⚠️ Only warns, doesn't fail - this is why markdown_path can be null
}
```

## Database Schema

### Migration 031: `document_paths.sql`
```sql
-- Add markdown_path column
ALTER TABLE documents
ADD COLUMN markdown_path TEXT;

-- Populate for existing documents
UPDATE documents
SET markdown_path = 'documents/' || id || '/content.md'
WHERE processing_status = 'completed'
AND markdown_path IS NULL;
```

### Migration 039: `fix_markdown_path.sql`
```sql
-- Fix incorrect pattern from migration 031
UPDATE documents
SET markdown_path = storage_path || '/content.md'
WHERE storage_path IS NOT NULL
  AND (markdown_path IS NULL OR markdown_path != storage_path || '/content.md');
```

## Lessons Learned

### 1. Always Have a Fallback for Nullable Database Columns

When a database column can be `null`, either:
- Ensure it's set during creation (like `storage_path`)
- Provide a fallback pattern (like `storage_path + '/content.md'`)
- Validate it's not null before using

### 2. Database Updates Can Fail Silently

In `process-document.ts`, the `markdown_path` update only logs a warning if it fails. This is intentional (don't fail the entire pipeline for a metadata update), but it means we need robust fallbacks.

### 3. Test with Real Data

This bug wouldn't be caught by unit tests with perfect test data. It only manifests with:
- Documents from before migrations
- Failed database updates
- Race conditions during processing

### 4. Log Critical Paths

The added logging helps diagnose issues:
```typescript
console.log(`[Obsidian Export] Downloading markdown from: ${markdownStoragePath}`)
```

This immediately shows which path is being used (fallback vs. explicit).

## Summary

- **Problem**: `markdown_path` can be null → crashes when used as file path
- **Solution**: Fallback to `storage_path/content.md` pattern
- **Impact**: Obsidian export now works for all documents, even those with null `markdown_path`
- **Files Changed**: `worker/handlers/obsidian-sync.ts` (2 functions updated)
- **Testing**: Manual testing with document export to Obsidian

The fix is **backward compatible** and **future-proof** - it works with both old and new documents.
