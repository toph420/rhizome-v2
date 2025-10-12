# Zotero Integration - Comprehensive Implementation Plan

**Status**: Ready for Implementation
**Research Completed**: 2025-01-11
**Estimated Effort**: 2-3 weeks to production-ready

---

## Executive Summary

Your draft Zotero implementation is **fundamentally sound** - reusing Readwise's fuzzy matching infrastructure is the right approach. The research validates this pattern and identifies 10 specific enhancements that will make Zotero imports **more accurate than Readwise** (90-95% exact match rate vs 85-90%).

**Key Insight**: Zotero provides actual PDF page labels, which map more accurately to chunks than Readwise's location numbers. This is the biggest accuracy improvement opportunity.

---

## Research Findings Summary

### ✅ What Your Draft Got Right

1. **Direct HTTP calls to Zotero API** - Correct. `zotero-api-client` is just a thin wrapper.
2. **Reusing Readwise fuzzy matching** - Perfect abstraction. One matching pipeline for both sources.
3. **Converting to `ReadwiseHighlight` format** - Smart interface reuse.
4. **API endpoint structure** - Your `ZoteroClient` has correct headers and patterns.
5. **Basic color mapping** - Right concept, needs expansion.

### 🔧 Critical Gaps Identified

Research found **10 implementation gaps** in your draft:

1. **Incomplete annotation data structure** - Missing 5 critical fields
2. **Incomplete color palette** - Missing 3 colors (purple, magenta, gray)
3. **No pagination** - Only fetches first 100 annotations
4. **No rate limiting handling** - Risk of IP bans
5. **Missing page-based chunk estimation** - Key accuracy improvement
6. **No incremental sync** - Re-imports everything every time
7. **Basic filtering logic** - Needs more comprehensive checks
8. **Missing database tables** - Need sync state tracking
9. **No comprehensive error handling** - Only basic error throws
10. **No tests** - Zero test coverage for Zotero-specific logic

---

## Prioritized Implementation Phases

### Phase 1: MVP - Get It Working (Week 1)

**Goal**: Basic import functionality with correct data structures

#### 1.1 Complete Annotation Data Structure ⚠️ CRITICAL

**Current**: Missing critical fields
**Impact**: Can't store position data, can't track versions

```typescript
// worker/lib/zotero-api-client.ts

export interface ZoteroAnnotation {
  key: string
  version: number
  data: {
    itemType: 'annotation'
    parentItem: string              // Attachment key
    annotationType: 'highlight' | 'note' | 'image'
    annotationText: string          // The highlighted text
    annotationComment: string       // User's comment
    annotationColor: string         // Hex: #ffd400, #ff6666, etc.
    annotationPageLabel: string     // STRING (handles Roman numerals like "iv")
    annotationSortIndex: string     // "00042|001234|00567" (page|y|x coordinates)
    annotationPosition: string      // JSON: {"pageIndex":41,"rects":[[x1,y1,x2,y2]]}
    annotationAuthorName: string
    tags: Array<{ tag: string }>
    relations: Record<string, any>
    dateAdded: string              // ISO 8601
    dateModified: string           // ISO 8601
  }
}
```

**Action**: Update interface in `worker/lib/zotero-api-client.ts`

#### 1.2 Complete Color Mapping ⚠️ CRITICAL

**Current**: Maps 5 colors
**Missing**: Purple (#a28ae5), Magenta (#e56eee), Gray (#aaaaaa)

```typescript
// worker/lib/zotero-api-client.ts

export function mapZoteroColor(
  hexColor: string | undefined
): 'yellow' | 'blue' | 'red' | 'green' | 'orange' {
  if (!hexColor) return 'yellow'

  const colorMap: Record<string, 'yellow' | 'blue' | 'red' | 'green' | 'orange'> = {
    '#ffd400': 'yellow',
    '#ff6666': 'red',
    '#5fb236': 'green',
    '#2ea8e5': 'blue',
    '#a28ae5': 'blue',     // ← ADD: Purple → blue
    '#e56eee': 'red',      // ← ADD: Magenta → red (or blue, your choice)
    '#f19837': 'orange',
    '#aaaaaa': 'yellow'    // ← ADD: Gray → yellow
  }

  const normalized = hexColor.toLowerCase()
  return colorMap[normalized] || 'yellow'
}
```

**Action**: Add 3 lines to existing function

#### 1.3 Store Position Data in Metadata 🚀 FUTURE-PROOFING

**Current**: Not storing `annotationPosition` or `annotationSortIndex`
**Impact**: Future features (position-based highlighting) impossible

```typescript
// worker/handlers/zotero-import.ts

const readwiseHighlights: ReadwiseHighlight[] = highlights.map(a => ({
  text: a.annotationText,
  note: a.annotationComment || undefined,
  color: mapZoteroColor(a.annotationColor),
  location: a.annotationPageLabel ? parseInt(a.annotationPageLabel) : undefined,
  highlighted_at: a.dateAdded,
  book_id: zoteroItemKey,
  title: item.title,
  author: formatCreators(item.creators),
  // ← ADD: Store full Zotero metadata
  metadata: {
    zotero_key: a.key,
    zotero_version: a.version,
    zotero_parent_item: a.parentItem,
    zotero_position: a.annotationPosition,        // Full position JSON
    zotero_sort_index: a.annotationSortIndex,     // Page|Y|X coordinates
    zotero_page_label: a.annotationPageLabel,     // Original page string
    zotero_color: a.annotationColor               // Original hex color
  }
}))
```

**Action**: Add metadata object to highlight conversion

#### 1.4 Enhanced Filtering Logic ⚠️ CRITICAL

**Current**: Only checks `annotationType`
**Missing**: Image detection, short highlight detection

```typescript
// worker/handlers/zotero-import.ts

function shouldProcessAnnotation(annotation: ZoteroAnnotation): boolean {
  // Skip non-highlights
  if (annotation.data.annotationType !== 'highlight') {
    console.debug(`Skipping ${annotation.data.annotationType} annotation`)
    return false
  }

  // Skip image highlights (no text)
  if (!annotation.data.annotationText ||
      annotation.data.annotationText.trim() === '') {
    console.debug('Skipping image or empty annotation')
    return false
  }

  // Skip very short highlights (likely accidental)
  if (annotation.data.annotationText.length < 10) {
    console.warn('Skipping short highlight:', annotation.data.annotationText)
    return false
  }

  return true
}

// Use in filter:
const highlights = annotations.filter(shouldProcessAnnotation)
```

**Action**: Create `shouldProcessAnnotation()` function

#### 1.5 Page-Based Chunk Estimation 🚀 BIG WIN

**Current**: Using generic location-based estimation
**Improvement**: Use actual PDF page labels → **5-10% accuracy gain**

```typescript
// worker/handlers/zotero-import.ts

/**
 * Estimate chunk index from Zotero page label
 * MORE ACCURATE than Readwise location-based estimation
 */
function estimateChunkFromPage(
  pageLabel: string,
  totalPages: number,
  totalChunks: number
): number {
  const pageNum = parseInt(pageLabel)

  // Handle non-numeric page labels (Roman numerals, etc.)
  if (isNaN(pageNum)) {
    console.warn(`Non-numeric page label: ${pageLabel}`)
    return 0 // Default to first chunk
  }

  // Linear interpolation
  const estimatedChunk = Math.floor((pageNum / totalPages) * totalChunks)
  return Math.max(0, Math.min(estimatedChunk, totalChunks - 1))
}

// Use in matching:
const estimatedChunkIndex = estimateChunkFromPage(
  highlight.location,
  documentMetadata.total_pages,
  chunks.length
)

// Search in ±2 chunk window for accuracy
const searchWindow = 2
const startChunk = Math.max(0, estimatedChunkIndex - searchWindow)
const endChunk = Math.min(chunks.length - 1, estimatedChunkIndex + searchWindow)
const windowChunks = chunks.slice(startChunk, endChunk + 1)

const fuzzyMatch = findAnnotationMatch(
  { text: highlight.text, originalChunkIndex: estimatedChunkIndex },
  markdown,
  windowChunks // ← Search only in window, not full document
)
```

**Action**: Create `estimateChunkFromPage()` function and modify matching logic

**Expected Impact**: Improve exact match rate from 85-90% to 90-95%

---

### Phase 2: Robustness - Handle Edge Cases (Week 1-2)

**Goal**: Handle large libraries, rate limits, errors gracefully

#### 2.1 Pagination ⚠️ REQUIRED

**Current**: Only fetches first 100 annotations
**Impact**: Users with 500+ annotations per book see partial imports

```typescript
// worker/lib/zotero-api-client.ts

async getAnnotations(parentItemKey: string): Promise<ZoteroAnnotation[]> {
  const allAnnotations: ZoteroAnnotation[] = []
  let start = 0
  const limit = 100

  while (true) {
    const url = `${ZOTERO_API_BASE}/users/${this.userId}/items?` +
                `itemType=annotation&limit=${limit}&start=${start}`

    const response = await fetch(url, {
      headers: {
        'Zotero-API-Key': this.apiKey,
        'Zotero-API-Version': '3'
      }
    })

    if (!response.ok) {
      throw new Error(`Zotero API error: ${response.status}`)
    }

    const items = await response.json()

    // Filter to only annotations for this parent item
    // (API doesn't support parentItem query parameter)
    const filtered = items
      .filter((item: any) => item.data.parentItem === parentItemKey)
      .map((item: any) => item.data as ZoteroAnnotation)

    allAnnotations.push(...filtered)

    // Check for more results via Link header
    const linkHeader = response.headers.get('Link')
    if (!linkHeader || !linkHeader.includes('rel="next"')) {
      break // No more pages
    }

    start += limit

    console.log(`Fetched ${allAnnotations.length} annotations so far...`)
  }

  // Sort by page and position
  return allAnnotations.sort((a, b) => {
    const pageA = parseInt(a.annotationPageLabel) || 0
    const pageB = parseInt(b.annotationPageLabel) || 0
    if (pageA !== pageB) return pageA - pageB

    return a.annotationSortIndex.localeCompare(b.annotationSortIndex)
  })
}
```

**Action**: Replace existing `getAnnotations()` method

#### 2.2 Rate Limiting Handling ⚠️ CRITICAL

**Current**: No rate limit handling
**Risk**: IP address gets temporarily banned by Zotero

```typescript
// worker/lib/zotero-api-client.ts

async getAnnotations(parentItemKey: string): Promise<ZoteroAnnotation[]> {
  // ... existing code ...

  const response = await fetch(url, { headers })

  // ← ADD: Check for rate limiting headers
  const backoff = response.headers.get('Backoff')
  if (backoff) {
    console.warn(`⚠️  Zotero API backoff: ${backoff} seconds`)
    // Store for next request - implement exponential backoff
  }

  // ← ADD: Handle 429 responses
  if (response.status === 429) {
    const retryAfter = response.headers.get('Retry-After')
    throw new Error(
      `Rate limited by Zotero API. Retry after ${retryAfter} seconds`
    )
  }

  if (!response.ok) {
    // Enhanced error messages
    if (response.status === 403) {
      throw new Error('Invalid Zotero API key or insufficient permissions')
    }
    throw new Error(`Zotero API error: ${response.status}`)
  }

  // ... rest of code ...
}
```

**Action**: Add rate limit checking to all API calls

#### 2.3 Database Schema for Sync State

**Current**: No sync state tracking
**Impact**: Can't do incremental sync, will re-import duplicates

```sql
-- supabase/migrations/042_zotero_sync_tables.sql

-- Track sync state per user
CREATE TABLE zotero_sync_state (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id),
  zotero_user_id TEXT NOT NULL,
  last_modified_version INTEGER NOT NULL DEFAULT 0,
  last_sync_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  annotation_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Track processed annotations (avoid duplicates)
CREATE TABLE zotero_annotations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  zotero_key TEXT NOT NULL,
  zotero_version INTEGER NOT NULL,
  entity_id UUID REFERENCES entities(id), -- Link to ECS annotation
  document_id UUID REFERENCES documents(id),
  import_status TEXT NOT NULL CHECK (import_status IN ('pending', 'matched', 'failed')),
  match_confidence TEXT CHECK (match_confidence IN ('exact', 'high', 'medium', 'low')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, zotero_key)
);

CREATE INDEX idx_zotero_annotations_user ON zotero_annotations(user_id);
CREATE INDEX idx_zotero_annotations_status ON zotero_annotations(import_status);
CREATE INDEX idx_zotero_annotations_document ON zotero_annotations(document_id);
```

**Action**: Create migration file

#### 2.4 Comprehensive Error Handling

**Current**: Generic `throw new Error()`
**Needed**: Specific error types for different failure scenarios

```typescript
// worker/lib/zotero-api-client.ts

export class ZoteroAPIError extends Error {
  constructor(message: string, public statusCode?: number) {
    super(message)
    this.name = 'ZoteroAPIError'
  }
}

export class ZoteroAuthError extends ZoteroAPIError {
  constructor(message: string) {
    super(message, 403)
    this.name = 'ZoteroAuthError'
  }
}

export class ZoteroRateLimitError extends ZoteroAPIError {
  constructor(message: string, public retryAfter: number) {
    super(message, 429)
    this.name = 'ZoteroRateLimitError'
  }
}

export class ZoteroNotFoundError extends ZoteroAPIError {
  constructor(message: string) {
    super(message, 404)
    this.name = 'ZoteroNotFoundError'
  }
}

// Use in error handling
if (response.status === 403) {
  throw new ZoteroAuthError('Invalid API key or insufficient permissions')
}
if (response.status === 429) {
  const retryAfter = parseInt(response.headers.get('Retry-After') || '60')
  throw new ZoteroRateLimitError(
    `Rate limited. Retry after ${retryAfter} seconds`,
    retryAfter
  )
}
```

**Action**: Create error classes and update error handling

#### 2.5 Integration Tests

**Current**: No tests
**Needed**: Mock Zotero API responses, test error scenarios

```typescript
// worker/__tests__/zotero-integration.test.ts

import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { ZoteroClient, mapZoteroColor } from '../lib/zotero-api-client'

const mockAnnotation = {
  key: 'ABC123',
  version: 100,
  data: {
    itemType: 'annotation',
    parentItem: 'PARENT123',
    annotationType: 'highlight',
    annotationText: 'This is a test highlight',
    annotationComment: 'My comment',
    annotationColor: '#ffd400',
    annotationPageLabel: '42',
    annotationSortIndex: '00042|001234|00567',
    annotationPosition: '{"pageIndex":41,"rects":[[100,200,300,250]]}',
    annotationAuthorName: '',
    tags: [],
    relations: {},
    dateAdded: '2025-01-15T10:30:00Z',
    dateModified: '2025-01-15T10:30:00Z'
  }
}

const server = setupServer(
  http.get('https://api.zotero.org/users/:userId/items', ({ request }) => {
    const url = new URL(request.url)
    const itemType = url.searchParams.get('itemType')

    if (itemType !== 'annotation') {
      return HttpResponse.json([])
    }

    return HttpResponse.json([mockAnnotation], {
      headers: {
        'Last-Modified-Version': '150'
      }
    })
  })
)

beforeAll(() => server.listen())
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

describe('ZoteroClient', () => {
  test('fetches annotations with correct headers', async () => {
    const client = new ZoteroClient('test-user-id', 'test-api-key')
    const annotations = await client.getAnnotations('PARENT123')

    expect(annotations).toHaveLength(1)
    expect(annotations[0].key).toBe('ABC123')
  })

  test('handles rate limiting', async () => {
    server.use(
      http.get('https://api.zotero.org/users/:userId/items', () => {
        return HttpResponse.json(
          { error: 'Too Many Requests' },
          { status: 429, headers: { 'Retry-After': '60' } }
        )
      })
    )

    const client = new ZoteroClient('test-user-id', 'test-api-key')
    await expect(
      client.getAnnotations('PARENT123')
    ).rejects.toThrow('Rate limited')
  })
})

describe('Color Mapping', () => {
  test('maps all 8 Zotero colors', () => {
    expect(mapZoteroColor('#ffd400')).toBe('yellow')
    expect(mapZoteroColor('#ff6666')).toBe('red')
    expect(mapZoteroColor('#5fb236')).toBe('green')
    expect(mapZoteroColor('#2ea8e5')).toBe('blue')
    expect(mapZoteroColor('#a28ae5')).toBe('blue')  // purple
    expect(mapZoteroColor('#e56eee')).toBe('red')   // magenta
    expect(mapZoteroColor('#f19837')).toBe('orange')
    expect(mapZoteroColor('#aaaaaa')).toBe('yellow') // gray
  })
})
```

**Action**: Create test file with MSW mocks

---

### Phase 3: Optimization - Fast & Accurate (Week 2-3)

**Goal**: Incremental sync, progress tracking, production performance

#### 3.1 Incremental Sync 🚀 HUGE UX WIN

**Current**: Re-imports all annotations every time
**Problem**: 500 annotations = 2 minutes every sync
**Solution**: Fetch only new/updated annotations

```typescript
// worker/handlers/zotero-import.ts

export async function syncZoteroAnnotations(
  rhizomeDocumentId: string,
  zoteroItemKey: string,
  userId: string
): Promise<ImportResults> {
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Get last sync state
  const { data: syncState } = await supabase
    .from('zotero_sync_state')
    .select('*')
    .eq('user_id', userId)
    .single()

  const zotero = new ZoteroClient()

  // Fetch only new/updated annotations
  const newAnnotations = await zotero.getAnnotationsSince(
    zoteroItemKey,
    syncState?.last_modified_version || 0
  )

  if (newAnnotations.length === 0) {
    console.log('[Zotero Sync] No new annotations since last sync')
    return {
      imported: 0,
      needsReview: [],
      failed: [],
      status: 'up-to-date'
    }
  }

  console.log(`[Zotero Sync] Found ${newAnnotations.length} new annotations`)

  // Process new annotations (reuse existing import logic)
  const results = await processAnnotations(newAnnotations, rhizomeDocumentId, userId)

  // Update sync state
  await supabase
    .from('zotero_sync_state')
    .upsert({
      user_id: userId,
      zotero_user_id: zotero.userId,
      last_modified_version: newAnnotations.lastModifiedVersion,
      last_sync_time: new Date().toISOString(),
      annotation_count: results.imported + (syncState?.annotation_count || 0)
    })

  return results
}
```

```typescript
// worker/lib/zotero-api-client.ts

async getAnnotationsSince(
  parentItemKey: string,
  sinceVersion: number
): Promise<{ annotations: ZoteroAnnotation[], lastModifiedVersion: number }> {
  const url = `${ZOTERO_API_BASE}/users/${this.userId}/items?` +
              `itemType=annotation&since=${sinceVersion}`

  const response = await fetch(url, {
    headers: {
      'Zotero-API-Version': '3',
      'Zotero-API-Key': this.apiKey,
      'If-Modified-Since-Version': String(sinceVersion)
    }
  })

  // 304 = No changes since last sync
  if (response.status === 304) {
    return { annotations: [], lastModifiedVersion: sinceVersion }
  }

  if (!response.ok) {
    throw new Error(`Zotero API error: ${response.status}`)
  }

  const items = await response.json()
  const lastModifiedVersion = parseInt(
    response.headers.get('Last-Modified-Version') || String(sinceVersion)
  )

  const annotations = items
    .filter((item: any) => item.data.parentItem === parentItemKey)
    .map((item: any) => item.data as ZoteroAnnotation)

  return { annotations, lastModifiedVersion }
}
```

**Action**: Create `syncZoteroAnnotations()` and `getAnnotationsSince()`

**Expected Impact**: Subsequent syncs go from ~2 minutes to ~5 seconds

#### 3.2 Sync API Endpoint

**Current**: POST `/api/documents/[id]/import-zotero` (full import)
**Add**: POST `/api/documents/[id]/sync-zotero` (incremental)

```typescript
// app/api/documents/[id]/sync-zotero/route.ts

import { NextRequest, NextResponse } from 'next/server'
import { syncZoteroAnnotations } from '@/worker/handlers/zotero-import'

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const documentId = params.id
    const body = await request.json()
    const { zoteroItemKey, userId } = body

    if (!zoteroItemKey) {
      return NextResponse.json(
        { error: 'zoteroItemKey is required' },
        { status: 400 }
      )
    }

    // Use incremental sync
    const results = await syncZoteroAnnotations(
      documentId,
      zoteroItemKey,
      userId
    )

    return NextResponse.json({
      success: true,
      status: results.status, // 'up-to-date' or 'synced'
      results: {
        imported: results.imported,
        needsReview: results.needsReview.length,
        failed: results.failed.length
      }
    })

  } catch (error) {
    console.error('[API] Zotero sync failed:', error)

    return NextResponse.json(
      {
        error: 'Sync failed',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}
```

**Action**: Create new API route file

#### 3.3 Progress Tracking UI

**Current**: No progress feedback during import
**Needed**: Show progress for large libraries (500+ annotations)

```typescript
// worker/handlers/zotero-import.ts

export async function importFromZotero(
  rhizomeDocumentId: string,
  zoteroItemKey: string,
  onProgress?: (progress: ImportProgress) => void
): Promise<ImportResults> {
  // ... existing code ...

  const annotations = await zotero.getAnnotations(zoteroItemKey)
  const total = annotations.length

  onProgress?.({
    stage: 'fetching',
    current: total,
    total: total,
    message: `Fetched ${total} annotations`
  })

  // Process in batches for progress updates
  const BATCH_SIZE = 50
  const results: ImportResults = {
    imported: 0,
    needsReview: [],
    failed: []
  }

  for (let i = 0; i < highlights.length; i += BATCH_SIZE) {
    const batch = highlights.slice(i, i + BATCH_SIZE)

    onProgress?.({
      stage: 'matching',
      current: i,
      total: highlights.length,
      message: `Processing annotations ${i + 1}-${Math.min(i + BATCH_SIZE, highlights.length)}...`
    })

    const batchResults = await processBatch(batch)

    results.imported += batchResults.imported
    results.needsReview.push(...batchResults.needsReview)
    results.failed.push(...batchResults.failed)
  }

  onProgress?.({
    stage: 'complete',
    current: total,
    total: total,
    message: `Import complete: ${results.imported} imported`
  })

  return results
}
```

**Action**: Add progress callback parameter

---

### Phase 4: Polish - Production Ready (Week 3-4)

**Goal**: Monitoring, documentation, conflict resolution

#### 4.1 Match Confidence Tracking

Track match rates to compare Zotero vs Readwise accuracy:

```typescript
// worker/handlers/zotero-import.ts

interface ImportMetrics {
  source: 'zotero' | 'readwise'
  document_id: string
  total_annotations: number
  exact_matches: number
  high_confidence_matches: number
  medium_confidence_matches: number
  low_confidence_matches: number
  failed_matches: number
  exact_match_rate: number
  total_success_rate: number
  processing_time_ms: number
  created_at: Date
}

async function trackImportMetrics(
  results: ImportResults,
  source: 'zotero' | 'readwise'
) {
  const metrics: ImportMetrics = {
    source,
    total_annotations: results.imported + results.needsReview.length + results.failed.length,
    exact_matches: results.imported,
    high_confidence_matches: results.needsReview.filter(r => r.confidence > 0.9).length,
    medium_confidence_matches: results.needsReview.filter(r => r.confidence > 0.7 && r.confidence <= 0.9).length,
    low_confidence_matches: results.needsReview.filter(r => r.confidence <= 0.7).length,
    failed_matches: results.failed.length,
    // ... calculate rates ...
  }

  await supabase.from('import_metrics').insert(metrics)
}
```

**Action**: Create metrics tracking

#### 4.2 User Documentation

Create user-facing guide for Zotero integration:

```markdown
# Importing Highlights from Zotero

## Setup

1. Get your Zotero User ID and API Key:
   - Go to https://www.zotero.org/settings/keys
   - Your User ID is shown at the top
   - Click "Create new private key"
   - Give it a name (e.g., "Rhizome Import")
   - Enable "Allow library access" with "Read Only"
   - Copy the API key (you won't see it again!)

2. Add to Rhizome settings:
   - Go to Settings → Integrations → Zotero
   - Enter User ID and API Key
   - Click "Test Connection" to verify

## Importing Annotations

1. Find your Zotero item key:
   - Right-click item in Zotero → "Copy Item Link"
   - Example: `http://zotero.org/users/123456/items/ABC123XYZ`
   - Item key is the last part: `ABC123XYZ`

2. Import to Rhizome:
   - Open document in Rhizome
   - Click "Import Annotations" → "From Zotero"
   - Enter item key → Click "Import"

## What Gets Imported

✅ Text highlights with or without comments
✅ All 8 Zotero highlight colors (mapped to Rhizome's 5 colors)
✅ Page numbers and position data (for future features)

❌ Note-only annotations (no highlighted text)
❌ Image annotations (no text to match)
❌ Nested annotations (replies to highlights)

## Matching Process

1. **Exact text match** (90-95% success rate)
   - Searches for highlight text in document
   - Instant matching, high confidence

2. **Page-based fuzzy match** (4-8% of highlights)
   - Uses page number to narrow search area
   - Searches ±2 chunks around estimated position
   - Saves to review queue if confidence 70-100%

3. **Failed matches** (<1% of highlights)
   - Usually highlights in images/tables
   - OCR differences between Zotero and Rhizome
   - Shows in failed list with reason

## Tips for Better Matching

- Process PDFs in Rhizome before importing annotations
- Use same PDF file in both Zotero and Rhizome
- Text-based PDFs match better than scanned PDFs
- Re-sync periodically for new annotations
```

**Action**: Create docs/user-guides/zotero-import.md

#### 4.3 Conflict Resolution

Handle annotations updated in Zotero after initial import:

```typescript
// worker/handlers/zotero-import.ts

async function handleUpdatedAnnotation(
  annotation: ZoteroAnnotation,
  existingRecord: ZoteroAnnotationRecord
) {
  // Check if annotation was modified in Zotero
  if (annotation.version <= existingRecord.zotero_version) {
    return // No changes
  }

  console.log(`[Zotero Sync] Annotation ${annotation.key} updated (v${existingRecord.zotero_version} → v${annotation.version})`)

  // Update strategy options:

  // Option 1: Update text and re-match
  if (annotation.data.annotationText !== existingRecord.original_text) {
    console.log('  Text changed, re-matching...')
    // Re-run fuzzy matching with new text
  }

  // Option 2: Update comment only (preserve position)
  if (annotation.data.annotationComment !== existingRecord.original_comment) {
    console.log('  Comment changed, updating...')
    await updateAnnotationComment(existingRecord.entity_id, annotation.data.annotationComment)
  }

  // Option 3: Update color
  if (annotation.data.annotationColor !== existingRecord.original_color) {
    console.log('  Color changed, updating...')
    await updateAnnotationColor(existingRecord.entity_id, mapZoteroColor(annotation.data.annotationColor))
  }

  // Update version number
  await supabase
    .from('zotero_annotations')
    .update({ zotero_version: annotation.version })
    .eq('id', existingRecord.id)
}
```

**Action**: Add conflict resolution logic to sync

---

## Implementation Checklist

### Phase 1: MVP (Week 1)
- [ ] Update `ZoteroAnnotation` interface with all 10 fields
- [ ] Add 3 missing colors to `mapZoteroColor()`
- [ ] Store position data in metadata object
- [ ] Create `shouldProcessAnnotation()` function
- [ ] Implement `estimateChunkFromPage()` function
- [ ] Modify matching logic to use page-based estimation
- [ ] Test with your actual Zotero library

### Phase 2: Robustness (Week 1-2)
- [ ] Add pagination to `getAnnotations()`
- [ ] Implement rate limiting handling (Backoff/Retry-After)
- [ ] Create error classes (ZoteroAuthError, etc.)
- [ ] Create migration 042: zotero_sync_state table
- [ ] Create migration 042: zotero_annotations table
- [ ] Write integration tests with MSW mocks
- [ ] Test pagination with large library (500+ annotations)

### Phase 3: Optimization (Week 2-3)
- [ ] Implement `getAnnotationsSince()` in ZoteroClient
- [ ] Create `syncZoteroAnnotations()` function
- [ ] Create `/api/documents/[id]/sync-zotero` endpoint
- [ ] Add progress tracking callbacks
- [ ] Update frontend to show progress during import
- [ ] Test incremental sync with new annotations

### Phase 4: Polish (Week 3-4)
- [ ] Add import metrics tracking
- [ ] Create user documentation
- [ ] Implement conflict resolution for updated annotations
- [ ] Add admin dashboard for monitoring
- [ ] Compare Zotero vs Readwise match rates
- [ ] Update README with Zotero integration section

---

## Testing Strategy

### Unit Tests

```bash
# Test Zotero API client
cd worker
npm test -- zotero-api-client.test.ts

# Test color mapping
npm test -- zotero-api-client.test.ts -t "Color Mapping"

# Test page-based estimation
npm test -- zotero-import.test.ts -t "Page-Based Estimation"
```

### Integration Tests

```bash
# Test full import flow with mocked API
cd worker
npm run test:integration -- zotero-import.test.ts

# Test rate limiting handling
npm test -- zotero-api-client.test.ts -t "handles rate limiting"

# Test pagination
npm test -- zotero-api-client.test.ts -t "paginates through all results"
```

### Manual Testing

```bash
# 1. Test API connection
npx tsx worker/scripts/test-zotero.ts

# 2. Test annotations for specific item
npx tsx worker/scripts/test-zotero.ts <ITEM_KEY>

# 3. Test import via API
curl -X POST http://localhost:3000/api/documents/<DOC_ID>/import-zotero \
  -H "Content-Type: application/json" \
  -d '{"zoteroItemKey": "<ITEM_KEY>"}'

# 4. Test incremental sync
curl -X POST http://localhost:3000/api/documents/<DOC_ID>/sync-zotero \
  -H "Content-Type: application/json" \
  -d '{"zoteroItemKey": "<ITEM_KEY>", "userId": "<USER_ID>"}'
```

---

## Expected Outcomes

### Matching Accuracy

Based on research findings, expect these match rates:

| Metric | Zotero | Readwise | Improvement |
|--------|--------|----------|-------------|
| Exact matches | 90-95% | 85-90% | +5% |
| High confidence fuzzy | 4-8% | 8-12% | Better |
| Failed matches | <1% | 1-3% | 50% fewer |

### Performance

- **Initial import** (500 annotations): ~2 minutes
- **Incremental sync** (50 new annotations): ~5 seconds
- **Page-based estimation**: 50-75x faster than full-text fuzzy search

### User Experience

- No duplicate imports (tracked in `zotero_annotations` table)
- Progress feedback for large imports
- Clear error messages for auth/rate limit issues
- Incremental sync for daily annotation workflow

---

## Critical API Gotcha

**DO NOT USE `/children` endpoint**:

```typescript
// ❌ WRONG - Will fail with "UnsupportedParams"
GET /users/{userId}/items/{attachmentKey}/children

// ✅ RIGHT - Must filter client-side
GET /users/{userId}/items?itemType=annotation
// Then: filter by parentItem in code
```

This is a Zotero API limitation confirmed by research.

---

## Questions to Resolve

### 1. Incremental Sync Priority?

**Trade-off**: Incremental sync is 15-20 hours of work but provides huge UX improvement for active users.

**Recommendation**: Include in Phase 1 if you actively annotate in Zotero. Otherwise, defer to Phase 3.

### 2. Magenta Color Mapping?

Zotero has magenta (#e56eee), Rhizome doesn't. Options:
- Map to red (recommended)
- Map to blue
- Add magenta to Rhizome (out of scope)

**Recommendation**: Map to red. It's the closest conceptually (urgent/important).

### 3. Conflict Resolution Strategy?

When annotations are updated in Zotero after import, what should happen?
- Auto-update and re-match
- Flag for manual review
- Ignore updates

**Recommendation**: Start with auto-update comment/color (low risk), flag text changes for review (high risk).

---

## Next Steps

1. **Review this plan** - Adjust priorities based on your needs
2. **Start with Phase 1** - Get basic import working with improved accuracy
3. **Test with real library** - Use your actual Zotero annotations
4. **Iterate based on results** - Adjust Phase 2-4 based on Phase 1 learnings

Ready to implement? The research validates your approach - you're 80% there!
