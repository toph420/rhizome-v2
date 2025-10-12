# Zotero Integration - Quick Start Checklist

**Start Here**: Minimal changes to get Zotero import working with improved accuracy

---

## 🚀 Phase 1 MVP: 5 Critical Changes (2-4 hours)

### 1. Update Annotation Interface (5 min)

**File**: `worker/lib/zotero-api-client.ts`

Add these fields to `ZoteroAnnotation`:
```typescript
annotationSortIndex: string     // "00042|001234|00567"
annotationPosition: string      // JSON: {"pageIndex":41,"rects":[[x1,y1,x2,y2]]}
annotationAuthorName: string
tags: Array<{ tag: string }>
relations: Record<string, any>
```

### 2. Add 3 Missing Colors (2 min)

**File**: `worker/lib/zotero-api-client.ts`

Add these lines to `mapZoteroColor()`:
```typescript
'#a28ae5': 'blue',     // purple → blue
'#e56eee': 'red',      // magenta → red
'#aaaaaa': 'yellow'    // gray → yellow
```

### 3. Store Position Metadata (5 min)

**File**: `worker/handlers/zotero-import.ts`

Add metadata object when converting to ReadwiseHighlight:
```typescript
metadata: {
  zotero_key: a.key,
  zotero_version: a.version,
  zotero_position: a.annotationPosition,
  zotero_sort_index: a.annotationSortIndex,
  zotero_page_label: a.annotationPageLabel
}
```

### 4. Add Filtering Function (10 min)

**File**: `worker/handlers/zotero-import.ts`

Create function:
```typescript
function shouldProcessAnnotation(annotation: ZoteroAnnotation): boolean {
  if (annotation.data.annotationType !== 'highlight') return false
  if (!annotation.data.annotationText || annotation.data.annotationText.trim() === '') return false
  if (annotation.data.annotationText.length < 10) return false
  return true
}
```

Use it:
```typescript
const highlights = annotations.filter(shouldProcessAnnotation)
```

### 5. Page-Based Chunk Estimation (30 min)

**File**: `worker/handlers/zotero-import.ts`

Add function:
```typescript
function estimateChunkFromPage(
  pageLabel: string,
  totalPages: number,
  totalChunks: number
): number {
  const pageNum = parseInt(pageLabel)
  if (isNaN(pageNum)) return 0

  const estimatedChunk = Math.floor((pageNum / totalPages) * totalChunks)
  return Math.max(0, Math.min(estimatedChunk, totalChunks - 1))
}
```

Update matching logic to search in ±2 chunk window around estimated position.

---

## ⚠️ Phase 2 Required: Pagination (1 hour)

**File**: `worker/lib/zotero-api-client.ts`

Replace `getAnnotations()` with:
```typescript
async getAnnotations(parentItemKey: string): Promise<ZoteroAnnotation[]> {
  const allAnnotations: ZoteroAnnotation[] = []
  let start = 0
  const limit = 100

  while (true) {
    const url = `${ZOTERO_API_BASE}/users/${this.userId}/items?` +
                `itemType=annotation&limit=${limit}&start=${start}`

    const response = await fetch(url, { headers: this.getHeaders() })
    if (!response.ok) throw new Error(`Zotero API error: ${response.status}`)

    const items = await response.json()
    const filtered = items
      .filter((item: any) => item.data.parentItem === parentItemKey)
      .map((item: any) => item.data as ZoteroAnnotation)

    allAnnotations.push(...filtered)

    // Check for next page
    const linkHeader = response.headers.get('Link')
    if (!linkHeader || !linkHeader.includes('rel="next"')) break

    start += limit
  }

  return allAnnotations
}
```

---

## 🔧 Phase 2 Important: Rate Limiting (30 min)

**File**: `worker/lib/zotero-api-client.ts`

Add to all fetch calls:
```typescript
const response = await fetch(url, { headers })

// Check rate limiting
const backoff = response.headers.get('Backoff')
if (backoff) {
  console.warn(`⚠️  Zotero API backoff: ${backoff} seconds`)
}

if (response.status === 429) {
  const retryAfter = response.headers.get('Retry-After')
  throw new Error(`Rate limited. Retry after ${retryAfter} seconds`)
}

if (response.status === 403) {
  throw new Error('Invalid Zotero API key')
}
```

---

## 📊 Phase 2 Optional: Database Tables (1 hour)

**File**: `supabase/migrations/042_zotero_sync_tables.sql`

```sql
CREATE TABLE zotero_sync_state (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id),
  zotero_user_id TEXT NOT NULL,
  last_modified_version INTEGER NOT NULL DEFAULT 0,
  last_sync_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  annotation_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE zotero_annotations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  zotero_key TEXT NOT NULL,
  zotero_version INTEGER NOT NULL,
  entity_id UUID REFERENCES entities(id),
  document_id UUID REFERENCES documents(id),
  import_status TEXT NOT NULL CHECK (import_status IN ('pending', 'matched', 'failed')),
  match_confidence TEXT CHECK (match_confidence IN ('exact', 'high', 'medium', 'low')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, zotero_key)
);

CREATE INDEX idx_zotero_annotations_user ON zotero_annotations(user_id);
CREATE INDEX idx_zotero_annotations_status ON zotero_annotations(import_status);
```

---

## ✅ Testing Checklist

### Quick Test (5 min)
```bash
# 1. Test API connection
cd worker
npx tsx scripts/test-zotero.ts

# 2. Test specific item
npx tsx scripts/test-zotero.ts <YOUR_ITEM_KEY>
```

### Full Test (15 min)
```bash
# 1. Start dev environment
npm run dev

# 2. Test import via UI
# - Open document in Rhizome
# - Click "Import from Zotero"
# - Enter item key
# - Verify annotations appear

# 3. Check match rates
# - Should see 90-95% exact matches
# - <5% need review
# - <1% failed
```

---

## 🎯 Success Criteria

After Phase 1 + Phase 2 Required:

- [ ] Successfully imports 100+ annotations without errors
- [ ] Handles pagination for large libraries
- [ ] Maps all 8 Zotero colors correctly
- [ ] Page-based estimation improves match rate by 5-10%
- [ ] Rate limiting doesn't cause failures
- [ ] Position metadata stored for future features

---

## 🚨 Known Issues & Workarounds

### Issue: "UnsupportedParams" error
**Cause**: Using `/children` endpoint
**Fix**: Use `?itemType=annotation` with client-side filtering (already in draft)

### Issue: Only 100 annotations imported
**Cause**: No pagination
**Fix**: Implement Phase 2 pagination (required)

### Issue: Rate limited by Zotero
**Cause**: Too many rapid requests
**Fix**: Implement Phase 2 rate limiting handling

### Issue: Non-numeric page labels ("iv", "A-1")
**Cause**: Complex page numbering
**Fix**: `estimateChunkFromPage()` handles with fallback to 0

---

## 📚 Additional Resources

- **Full Implementation Plan**: `docs/todo/zotero/zotero-implementation-plan.md`
- **Research Report**: (Embedded in implementation plan)
- **Zotero API Docs**: https://www.zotero.org/support/dev/web_api/v3/start
- **Your Draft Code**:
  - `docs/todo/zotero/zotero-api-client.md`
  - `docs/todo/zotero/zotero-import-handler.md`

---

## ⏱️ Time Estimates

- **Phase 1 (MVP)**: 2-4 hours
- **Phase 2 Required (Pagination + Rate Limiting)**: 1.5 hours
- **Phase 2 Optional (Database + Tests)**: 2-3 hours
- **Total to working integration**: 4-6 hours
- **Total to production-ready**: 8-10 hours

---

## 💬 Questions?

Before starting:
1. Do you actively annotate in Zotero? (Affects incremental sync priority)
2. What's your average annotations per book? (Affects pagination priority)
3. Do you have a test Zotero item ready? (Need item key for testing)

Start with Phase 1, test with your library, then decide on Phase 2-4 priorities based on results.
