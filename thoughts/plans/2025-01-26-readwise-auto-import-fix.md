# Readwise Auto-Import Fix Plan

**Date**: 2025-01-26
**Status**: 📋 **READY TO IMPLEMENT**
**Priority**: 🟡 Medium (Feature enhancement, workaround exists)
**Estimated Time**: 1-2 hours

---

## 🎯 Objective

Re-enable automatic Readwise import functionality that searches the Readwise library for a matching book and imports highlights automatically, without requiring manual JSON export.

---

## 📊 Current State

### ✅ What Works
- **Manual Readwise Import**: Users can export JSON from Readwise.io and upload via Admin Panel
- **Background Job**: `readwise_import` job type processes uploaded JSON
- **Fuzzy Matching**: Import handler with chunk-bounded fuzzy matching
- **Server Action**: `importReadwiseHighlights(documentId, readwiseJson)` ✅

### ❌ What's Broken
- **Auto-Import**: Automatic search and import from Readwise API
- **Old Implementation**: Used API route + spawned worker script
- **Current Behavior**: Shows error: "Auto-import temporarily unavailable"

### 🗂️ Existing Infrastructure
```
worker/
├── handlers/
│   └── readwise-import.ts          # ✅ Works (processes JSON)
├── lib/
│   └── readwise-export-api.ts      # ✅ Has ReadwiseExportClient
└── scripts/
    └── import-readwise.ts          # 🔧 CLI script (was spawned by old API route)

src/app/actions/
└── integrations.ts                 # ✅ Has importReadwiseHighlights()

src/components/
├── reader/DocumentHeader.tsx       # ❌ Auto-import button disabled
└── admin/tabs/IntegrationsTab.tsx  # ❌ Auto-import button disabled
```

---

## 🏗️ Implementation Plan

### **Option A: Server Action + Inline Search (Recommended)**

**Pros:**
- ✅ Simpler architecture (no new job type)
- ✅ Reuses existing `readwise_import` background job
- ✅ Faster user feedback (search is quick ~2-3 seconds)
- ✅ Aligns with Next.js 15 + React 19 patterns

**Cons:**
- ⚠️ Search happens in Server Action (blocks for 2-3s)
- ⚠️ If search fails, user sees error immediately

**Flow:**
```
User clicks "Auto-Import"
  ↓
Server Action: searchAndImportFromReadwise(documentId)
  ↓
1. Fetch document metadata (title, author)
2. Search Readwise library via ReadwiseExportClient
3. Find matching book
4. Download highlights JSON
5. Create background job with JSON (existing flow)
  ↓
Return { success: true, jobId }
```

---

### **Option B: Background Job for Everything**

**Pros:**
- ✅ Non-blocking (immediate response)
- ✅ Better for slow Readwise API responses

**Cons:**
- ❌ More complex (new job type + handler)
- ❌ User doesn't know if search succeeded until job completes
- ❌ Search errors only visible in job output

**Flow:**
```
User clicks "Auto-Import"
  ↓
Server Action: queueReadwiseAutoImport(documentId)
  ↓
Creates job type 'readwise_auto_import' with { documentId }
  ↓
Worker Handler:
  1. Fetch document metadata
  2. Search Readwise library
  3. Download highlights
  4. Import with fuzzy matching
  ↓
Return { success: true, jobId }
```

---

## ✅ Recommended Approach: Option A (Inline Search)

**Why?**
- Readwise search is fast (2-3 seconds typical)
- Reuses existing proven infrastructure
- Simpler to maintain
- Better user experience (know immediately if search fails)

---

## 📝 Implementation Steps

### **Phase 1: Create Server Action** (30 min)

**File**: `src/app/actions/integrations.ts`

```typescript
/**
 * Auto-import highlights from Readwise by searching library
 *
 * Flow:
 * 1. Fetch document metadata (title, author)
 * 2. Search Readwise library for matching book
 * 3. Download highlights from matched book
 * 4. Create background job to import highlights
 *
 * @param documentId - Rhizome document ID
 * @returns Result with job ID if successful
 */
export async function autoImportFromReadwise(
  documentId: string
): Promise<ReadwiseAutoImportResult> {
  try {
    const supabase = getSupabaseClient()
    const user = await getCurrentUser()

    if (!user) {
      return { success: false, error: 'Not authenticated' }
    }

    // 1. Fetch document metadata
    const { data: doc, error: docError } = await supabase
      .from('documents')
      .select('id, title, author, user_id')
      .eq('id', documentId)
      .single()

    if (docError || !doc) {
      return { success: false, error: 'Document not found' }
    }

    if (doc.user_id !== user.id) {
      return { success: false, error: 'Not authorized' }
    }

    if (!doc.title || !doc.author) {
      return {
        success: false,
        error: 'Document metadata incomplete. Please set title and author first.'
      }
    }

    // 2. Check for Readwise token
    const readwiseToken = process.env.READWISE_ACCESS_TOKEN
    if (!readwiseToken) {
      return {
        success: false,
        error: 'READWISE_ACCESS_TOKEN not configured. Add to .env.local'
      }
    }

    // 3. Search Readwise library
    const { ReadwiseExportClient } = await import('@/../../worker/lib/readwise-export-api.js')
    const client = new ReadwiseExportClient(readwiseToken)

    console.log(`[autoImportFromReadwise] Searching for: "${doc.title}" by ${doc.author}`)

    const books = await client.searchBooks(doc.title, doc.author)

    if (books.length === 0) {
      return {
        success: false,
        error: `No matching book found in Readwise library for "${doc.title}"`,
        suggestion: 'Try manual JSON upload instead'
      }
    }

    // Use first match (could add fuzzy scoring later)
    const matchedBook = books[0]
    console.log(`[autoImportFromReadwise] Found match: ${matchedBook.title} (ID: ${matchedBook.id})`)

    // 4. Download highlights
    const highlights = await client.getBookHighlights(matchedBook.id)

    if (highlights.length === 0) {
      return {
        success: false,
        error: `Book found but has no highlights: "${matchedBook.title}"`,
        bookId: matchedBook.id
      }
    }

    console.log(`[autoImportFromReadwise] Downloaded ${highlights.length} highlights`)

    // 5. Create background job (reuse existing readwise_import)
    const { data: job, error: jobError } = await supabase
      .from('background_jobs')
      .insert({
        user_id: user.id,
        job_type: 'readwise_import',
        entity_type: 'document',
        entity_id: documentId,
        input_data: {
          documentId: documentId,
          readwiseData: highlights
        }
      })
      .select()
      .single()

    if (jobError) {
      console.error('[autoImportFromReadwise] Job creation failed:', jobError)
      return { success: false, error: `Job creation failed: ${jobError.message}` }
    }

    console.log(`[autoImportFromReadwise] Job created: ${job.id}`)

    return {
      success: true,
      jobId: job.id,
      bookTitle: matchedBook.title,
      bookAuthor: matchedBook.author,
      highlightCount: highlights.length
    }

  } catch (error) {
    console.error('[autoImportFromReadwise] Error:', error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    return { success: false, error: message }
  }
}

export interface ReadwiseAutoImportResult {
  success: boolean
  jobId?: string
  bookTitle?: string
  bookAuthor?: string
  highlightCount?: number
  bookId?: number
  error?: string
  suggestion?: string
}
```

**Key Points:**
- ✅ Validates document metadata exists (title + author required)
- ✅ Checks for `READWISE_ACCESS_TOKEN` environment variable
- ✅ Searches Readwise library using existing `ReadwiseExportClient`
- ✅ Downloads highlights if book found
- ✅ Creates existing `readwise_import` background job
- ✅ Returns helpful errors with suggestions

---

### **Phase 2: Update DocumentHeader.tsx** (10 min)

**File**: `src/components/reader/DocumentHeader.tsx`

**Replace temporary error with:**

```typescript
import { autoImportFromReadwise } from '@/app/actions/integrations'

async function handleImportFromReadwise() {
  setIsImporting(true)

  try {
    const result = await autoImportFromReadwise(documentId)

    if (!result.success) {
      throw new Error(result.error || 'Import failed')
    }

    toast.success('Readwise Import Started', {
      description: `Found: ${result.bookTitle} by ${result.bookAuthor}\n${result.highlightCount} highlights queued for import`,
      duration: 5000
    })

    // Note: Monitor progress in ProcessingDock
    // Job will import highlights with fuzzy matching

  } catch (error) {
    console.error('[DocumentHeader] Readwise import failed:', error)
    toast.error('Import Failed', {
      description: error instanceof Error ? error.message : 'Failed to import from Readwise'
    })
  } finally {
    setIsImporting(false)
  }
}
```

---

### **Phase 3: Update IntegrationsTab.tsx** (10 min)

**File**: `src/components/admin/tabs/IntegrationsTab.tsx`

**Replace temporary error with:**

```typescript
import { autoImportFromReadwise } from '@/app/actions/integrations'

const handleReadwiseAutoImport = async () => {
  if (!selectedDoc) {
    setMessage({ type: 'error', text: 'Please select a document first' })
    return
  }

  setIsOperating(true)
  setMessage(null)

  try {
    const result = await autoImportFromReadwise(selectedDoc)

    if (!result.success) {
      throw new Error(result.error || 'Import failed')
    }

    setMessage({
      type: 'success',
      text: `Auto-import started: ${result.bookTitle} by ${result.bookAuthor}\n${result.highlightCount} highlights queued\nJob ID: ${result.jobId}`,
    })

    // Reload history to show new job
    setTimeout(() => loadOperationHistory(), 1000)

  } catch (error) {
    console.error('[IntegrationsTab] Readwise auto-import failed:', error)
    const errorMsg = error instanceof Error ? error.message : 'Failed to import'
    setMessage({
      type: 'error',
      text: errorMsg,
    })
  } finally {
    setIsOperating(false)
  }
}
```

---

### **Phase 4: Environment Variable Documentation** (5 min)

**File**: `.env.local.example` (or create if doesn't exist)

```bash
# Readwise Integration (optional)
# Get your token from: https://readwise.io/access_token
READWISE_ACCESS_TOKEN=your_token_here
```

**File**: `docs/INTEGRATIONS.md` (update or create)

```markdown
## Readwise Integration

### Setup

1. Get your access token: https://readwise.io/access_token
2. Add to `.env.local`:
   ```
   READWISE_ACCESS_TOKEN=your_token_here
   ```
3. Restart dev server

### Usage

**Auto-Import** (recommended):
- Click "Import from Readwise" button in document header
- System searches your Readwise library
- Matches by title and author
- Imports highlights automatically

**Manual Import** (fallback):
- Export JSON from Readwise.io/export
- Upload via Admin Panel > Integrations tab
- Use when auto-import can't find match
```

---

### **Phase 5: Testing** (15 min)

**Test Cases:**

1. **✅ Success Case**
   - Document with complete metadata (title + author)
   - Matching book in Readwise library
   - Expected: Job created, toast shows book title + highlight count

2. **❌ No Token**
   - No `READWISE_ACCESS_TOKEN` in environment
   - Expected: Error "READWISE_ACCESS_TOKEN not configured"

3. **❌ No Match**
   - Document metadata doesn't match any Readwise book
   - Expected: Error "No matching book found" + suggestion for manual upload

4. **❌ Incomplete Metadata**
   - Document missing title or author
   - Expected: Error "Document metadata incomplete"

5. **❌ No Highlights**
   - Book found but has zero highlights
   - Expected: Error "Book found but has no highlights"

---

## 📊 Success Criteria

- ✅ Auto-import button functional in DocumentHeader
- ✅ Auto-import button functional in IntegrationsTab
- ✅ Successful imports create background jobs
- ✅ Error messages are helpful and actionable
- ✅ No TypeScript compilation errors
- ✅ Graceful fallback to manual import suggested

---

## 🔄 Migration Path

**For Users:**
- No action required
- Feature automatically re-enabled
- Both auto and manual import work

**For Developers:**
```bash
# 1. Add Readwise token to .env.local
echo "READWISE_ACCESS_TOKEN=your_token" >> .env.local

# 2. Restart dev server
npm run dev

# 3. Test auto-import
# - Navigate to any document
# - Click "Import from Readwise" button
# - Monitor ProcessingDock for job progress
```

---

## 🚀 Future Enhancements (Optional)

### **V1.1: Better Book Matching**
- Use fuzzy string matching for title/author
- Show multiple matches if ambiguous
- Let user select correct book

### **V1.2: Progress Feedback**
```typescript
// Stream progress from Server Action
for await (const progress of autoImportStream(documentId)) {
  toast.loading(`Searching... ${progress.step}`)
}
```

### **V1.3: Batch Import**
- Import all Readwise highlights at once
- Match multiple documents automatically
- Show summary of matches/mismatches

---

## 📁 Files to Modify

```
src/app/actions/integrations.ts          # Add autoImportFromReadwise()
src/components/reader/DocumentHeader.tsx  # Update handleImportFromReadwise()
src/components/admin/tabs/IntegrationsTab.tsx  # Update handleReadwiseAutoImport()
.env.local.example                       # Document READWISE_ACCESS_TOKEN
docs/INTEGRATIONS.md                     # Add setup instructions
```

---

## ⏱️ Time Breakdown

- Phase 1: Server Action implementation → **30 min**
- Phase 2: DocumentHeader update → **10 min**
- Phase 3: IntegrationsTab update → **10 min**
- Phase 4: Documentation → **5 min**
- Phase 5: Testing → **15 min**

**Total**: ~1-2 hours (depending on testing thoroughness)

---

## 🎯 Next Steps

When ready to implement:

1. Run: `/rhizome:implement-plan thoughts/plans/2025-01-26-readwise-auto-import-fix.md`
2. Or manually follow phases 1-5 above
3. Test with real Readwise account
4. Update user-facing documentation

---

## 💡 Notes

- **API Key Security**: Token stays server-side (never exposed to client)
- **Rate Limits**: Readwise API has limits, but search + download is ~2 requests
- **Reusability**: Same pattern can be used for other integrations (Kindle, Instapaper)
- **Backwards Compatible**: Manual JSON upload still works
- **No Breaking Changes**: Only re-enables existing functionality

---

**Status**: Ready to implement! 🚀
