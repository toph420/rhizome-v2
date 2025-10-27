# Fix PDF Upload 413 Error - Storage-First Metadata Extraction

**Date**: 2025-01-27
**Status**: Planning
**Priority**: High (blocking PDF uploads on production)

---

## Problem Analysis

### Symptoms
- 5MB PDF uploads fail with **413 Payload Too Large** error
- Error occurs during metadata detection phase
- Prevents documents from reaching worker (upload never completes)
- Manifests as: `(index):1 Failed to load resource: the server responded with a status of 413`

### Root Cause
Current flow sends entire PDF through HTTP request body to Server Action:

```typescript
// ❌ Current: Sends 5MB through HTTP
const fileBuffer = await file.arrayBuffer()  // 5MB in memory
const metadata = await extractPdfMetadata(fileBuffer)  // Sends 5MB via HTTP
```

**Vercel Production Limits**:
- Hobby/Pro plans: **4.5MB hard limit** on request body size
- Cannot be increased via `next.config.ts` on Vercel
- Our `bodySizeLimit: '50mb'` only affects local dev

**Why it blocks everything**:
1. User drops PDF → Frontend calls `extractPdfMetadata(buffer)`
2. Server Action receives 5MB body → ❌ 413 error
3. Metadata detection fails → Upload phase stuck on "detecting"
4. Job never created → Worker never sees document

---

## Solution: Storage-First Metadata Extraction

**Key Insight**: Don't send files through HTTP - use Storage as intermediary.

### New Flow
```
1. User drops PDF
2. Upload to temp storage immediately (no HTTP body limit)
3. Pass storage PATH to Server Action (tiny request)
4. Server Action downloads from storage internally
5. Extract metadata from downloaded file
6. Return metadata to frontend
7. Continue normal upload flow
```

**Benefits**:
- ✅ Works on both local dev and production
- ✅ No HTTP body size limits (Storage → 5GB limit)
- ✅ Same user experience (metadata still extracted)
- ✅ Cleaner architecture (Storage is already source of truth)

---

## Implementation Plan

### Phase 1: Server Action Updates

**File**: `src/app/actions/metadata-extraction.ts`

**Add new function**:
```typescript
/**
 * Extract metadata from PDF already in storage.
 * Avoids 413 errors by downloading from storage instead of HTTP body.
 */
export async function extractPdfMetadataFromStorage(storagePath: string) {
  // 1. Download from storage
  const supabase = createClient()
  const { data, error } = await supabase.storage
    .from('documents')
    .download(storagePath)

  if (error) throw error

  // 2. Convert to buffer
  const fileBuffer = await data.arrayBuffer()

  // 3. Extract metadata (existing logic)
  const apiKey = process.env.GOOGLE_AI_API_KEY
  if (!apiKey) throw new Error('GOOGLE_AI_API_KEY not configured')

  const firstPages = await extractFirstPagesFromPDF(fileBuffer, 10, apiKey)
  const metadata = await detectDocumentMetadata(firstPages, apiKey)

  return metadata
}
```

**Status**: ✅ Implemented

---

### Phase 2: Frontend Upload Flow

**File**: `src/components/library/UploadZone.tsx`

**Current flow (lines 150-175)**:
```typescript
// ❌ Current: Sends file buffer through HTTP
if (extractionType === 'pdf') {
  const fileBuffer = await file.arrayBuffer()
  metadata = await extractPdfMetadata(fileBuffer)  // 413 here!
}
```

**New flow**:
```typescript
// ✅ New: Upload to storage first
if (extractionType === 'pdf') {
  // 1. Generate temp path
  const tempId = crypto.randomUUID()
  const tempPath = `temp/${userId}/${tempId}.pdf`

  // 2. Upload to storage (no size limit)
  const { error: uploadError } = await supabase.storage
    .from('documents')
    .upload(tempPath, file)

  if (uploadError) throw uploadError

  // 3. Extract metadata from storage (tiny HTTP request)
  metadata = await extractPdfMetadataFromStorage(tempPath)

  // 4. Store tempPath for later cleanup
  setTempStoragePath(tempPath)
}
```

**Changes needed**:
1. Add `tempStoragePath` state variable
2. Update PDF metadata detection to use storage
3. Clean up temp file after final upload completes
4. Handle errors (cleanup temp file on failure)

**Status**: 🔄 In Progress

---

### Phase 3: Cleanup Temp Files

**Add cleanup logic**:

**After successful upload**:
```typescript
// In handleUpload function
if (tempStoragePath) {
  await supabase.storage.from('documents').remove([tempStoragePath])
  setTempStoragePath(null)
}
```

**On error/cancel**:
```typescript
// In error handlers
if (tempStoragePath) {
  await supabase.storage.from('documents').remove([tempStoragePath])
  setTempStoragePath(null)
}
```

**Status**: ⏳ Pending

---

## Testing Strategy

### Test Cases

**1. Small PDFs (<1MB)**:
- ✅ Should work as before
- ✅ Metadata extracted correctly
- ✅ Upload completes

**2. Medium PDFs (1-5MB)**:
- ✅ Should work on both local and production
- ✅ Metadata extracted correctly
- ✅ No 413 errors

**3. Large PDFs (5-50MB)**:
- ✅ Should work on production (Vercel limit bypassed)
- ✅ Metadata extracted correctly
- ✅ Upload completes and reaches worker

**4. Error Scenarios**:
- ❌ Storage upload fails → Show error, no temp file left behind
- ❌ Metadata extraction fails → Continue with fallback, cleanup temp file
- ❌ User cancels during detection → Cleanup temp file

**Test Environment**:
- Local dev: Already has 50MB body limit (works as failsafe)
- Production: Must test on actual Vercel deployment

**Status**: ⏳ Pending

---

## Deployment Considerations

### 1. Backward Compatibility
- Keep old `extractPdfMetadata(buffer)` function for EPUBs
- Only PDFs use new storage-first approach
- No breaking changes for existing code

### 2. Storage Costs
- Temp files are small (<50MB) and deleted immediately
- Negligible cost impact (~$0.000001 per upload)
- Cleaner than sending large files through HTTP repeatedly

### 3. Vercel Deployment
- No Vercel config changes needed
- Works immediately after deploy
- Fixes production issue without requiring plan upgrade

### 4. Temp File Cleanup
- Happy path: Deleted after upload completes
- Error path: Deleted on error
- Orphaned files: Consider cron job to cleanup `temp/` older than 1 hour

---

## Rollout Plan

### Step 1: Implement Frontend Changes
- Update UploadZone.tsx with storage-first flow
- Add temp file cleanup logic
- Add error handling

### Step 2: Local Testing
- Test with 5MB PDF
- Verify metadata extraction works
- Verify temp file cleanup works
- Test error scenarios

### Step 3: Deploy to Production
- Commit changes
- Deploy via `/rhizome:deploy`
- Test on production with 5MB PDF
- Verify 413 error is resolved

### Step 4: Monitor
- Check for orphaned temp files
- Monitor error rates
- Verify worker receives jobs

---

## Alternative Approaches Considered

### Option 1: Increase Body Size Limit ❌
- **Pros**: Simple config change
- **Cons**: Only works on local dev, Vercel has hard 4.5MB limit
- **Verdict**: Not viable for production

### Option 2: Skip Metadata Detection for Large Files ❌
- **Pros**: Simple fallback
- **Cons**: Poor UX, no metadata for large PDFs
- **Verdict**: Acceptable as fallback, but not primary solution

### Option 3: Storage-First (Chosen) ✅
- **Pros**: Works everywhere, cleaner architecture, scales to 5GB
- **Cons**: Slightly more complex, requires cleanup logic
- **Verdict**: Best long-term solution

---

## Success Criteria

- ✅ 5MB PDFs upload successfully on production
- ✅ Metadata still extracted via Gemini
- ✅ No 413 errors in console
- ✅ Jobs reach worker and process correctly
- ✅ Temp files cleaned up properly
- ✅ No regression for small PDFs or EPUBs

---

## Related Issues

- **Enrichment Skip Feature**: Recently implemented (Jan 2026)
- **Dual-Worktree Deployment**: Use `/rhizome:deploy` for production
- **Production Worker**: Needs restart after code changes

---

## Notes

- This pattern should be applied to EPUB uploads as well (future)
- Consider making this the default for ALL file uploads (not just PDFs)
- Storage-first aligns with existing "Storage as source of truth" architecture

---

**Status**: Implementation in progress
**Next Step**: Complete UploadZone.tsx changes and test locally
