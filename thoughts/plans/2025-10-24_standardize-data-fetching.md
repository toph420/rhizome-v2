# Data Fetching Standardization Plan

**Created**: 2025-10-24
**Status**: Ready to implement
**Priority**: Medium (Technical Debt)
**Estimated Time**: 2-3 hours

---

## Problem Statement

RightPanel tabs use **3 different data fetching patterns**, creating confusion and inconsistency:

### Pattern 1: Server-Fetched (Page Level) ❌
**Not currently used** - would require page-level data fetching with prop drilling

### Pattern 2: Client-Fetched with Zustand ✅ **RECOMMENDED**
**Used by:** `SparksTab`, `FlashcardsTab`
**Example:**
```typescript
export function FlashcardsTab({ documentId }) {
  const { cards, setCards } = useFlashcardStore()

  useEffect(() => {
    async function load() {
      const data = await getFlashcardsByDocument(documentId) // Server Action
      setCards(documentId, data) // Store in Zustand
    }
    load()
  }, [documentId])

  // Use store data...
}
```

### Pattern 3: Direct Supabase Queries ❌
**Used by:** `ConnectionsList`
**Example:**
```typescript
export function ConnectionsList({ visibleChunkIds }) {
  const [connections, setConnections] = useState([]) // Local state!

  useEffect(() => {
    const supabase = createClient() // Direct query!
    const { data } = await supabase
      .from('connections')
      .select('*')
      .in('source_chunk_id', visibleChunkIds)
    setConnections(data)
  }, [visibleChunkIds])
}
```

---

## Current State Audit

### ✅ Already Using Pattern 2 (Zustand + Server Actions)

| Tab | Store | Server Action | Status |
|-----|-------|--------------|--------|
| **SparksTab** | `spark-store.ts` | `getRecentSparks()` | ✅ Correct |
| **FlashcardsTab** | `flashcard-store.ts` | `getFlashcardsByDocument()` | ✅ Correct |
| **AnnotationReviewTab** | `annotation-store.ts` | Likely using actions | ✅ Probably correct |

### ❌ Using Pattern 3 (Direct Supabase)

| Tab | Current Pattern | Issue |
|-----|----------------|-------|
| **ConnectionsList** | Direct `createClient()` queries | No Server Action, local state |
| | Uses `connection-store` for **weights only** | Not using store for data |

### Store Capability Check

**connection-store.ts** HAS everything needed:
- ✅ `connections: Connection[]` state (line 35)
- ✅ `setConnections()` action (line 155)
- ✅ `applyFilters()` computed (line 161)
- ✅ `filteredConnections` derived state (line 36)

**But ConnectionsList doesn't use it!**

---

## Recommended Solution: Standardize on Pattern 2

### Why Pattern 2?

**Benefits:**
1. ✅ **Single Source of Truth** - Zustand stores cache data
2. ✅ **Automatic Deduplication** - Don't refetch if already loaded
3. ✅ **Optimistic Updates** - Update store immediately, sync later
4. ✅ **Better Security** - Server Actions enforce RLS
5. ✅ **Consistency** - Same pattern across all tabs
6. ✅ **Easier Testing** - Mock store instead of fetch calls
7. ✅ **Type Safety** - Server Actions validated with Zod

**Why Not Pattern 3?**
- ❌ Bypasses Server Actions (less secure)
- ❌ Client-side RLS can be bypassed
- ❌ No caching/deduplication
- ❌ Local state duplication
- ❌ Inconsistent with rest of codebase

---

## Implementation Plan

### Task 1: Create Server Action for Connections

**File:** `src/app/actions/connections.ts`

```typescript
'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentUser } from '@/lib/auth'

export async function getConnectionsForChunks(chunkIds: string[]) {
  const user = await getCurrentUser()
  if (!user) throw new Error('Unauthorized')

  // Filter out 'no-chunk' placeholders
  const validChunkIds = chunkIds.filter(id => id !== 'no-chunk')
  if (validChunkIds.length === 0) return []

  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('connections')
    .select('*')
    .in('source_chunk_id', validChunkIds)
    .order('strength', { ascending: false })
    .limit(100)

  if (error) {
    console.error('[getConnectionsForChunks] Error:', error)
    throw new Error('Failed to fetch connections')
  }

  return data || []
}
```

### Task 2: Update ConnectionsList to Use Store

**File:** `src/components/sidebar/ConnectionsList.tsx`

**Changes:**
```typescript
// BEFORE (Pattern 3 - Direct Supabase)
const [connections, setConnections] = useState<Connection[]>([])

useEffect(() => {
  const supabase = createClient()
  const { data } = await supabase.from('connections').select('*')
  setConnections(data)
}, [debouncedChunkIds])

const filteredConnections = useMemo(() => {
  return connections
    .filter(c => enabledEngines.has(c.connection_type))
    .filter(c => c.strength >= strengthThreshold)
    // ...
}, [connections, weights, enabledEngines])

// AFTER (Pattern 2 - Zustand + Server Action)
const { setConnections, filteredConnections } = useConnectionStore()

useEffect(() => {
  async function load() {
    const data = await getConnectionsForChunks(debouncedChunkIds) // Server Action
    setConnections(data) // Store automatically calls applyFilters()
  }
  load()
}, [debouncedChunkIds, setConnections])

// Use filteredConnections from store (already computed!)
```

**Benefits of This Change:**
1. Remove local `useState` - use store instead
2. Remove local `useMemo` - use store's `filteredConnections`
3. Call Server Action instead of direct Supabase
4. Store handles filtering automatically via `applyFilters()`

### Task 3: Verify Other Tabs

**Check if any other tabs need updating:**
- `AnnotationsList.tsx` - verify uses `annotation-store`
- `ChunkQualityPanel.tsx` - verify pattern
- `TuneTab.tsx` - only uses weights, no data fetching

---

## Testing Checklist

After implementation, verify:

- [ ] ConnectionsList loads connections from store
- [ ] Weight changes trigger re-filtering (via `applyFilters()`)
- [ ] Engine toggles update display immediately
- [ ] Strength threshold slider works
- [ ] No direct Supabase client imports in ConnectionsList
- [ ] Server Action enforces RLS properly
- [ ] Debouncing still works (300ms)
- [ ] Performance unchanged (<100ms re-ranking)

---

## Rollback Plan

If issues occur:
1. Revert `ConnectionsList.tsx` changes
2. Keep Server Action (doesn't hurt)
3. Connection-store already has all needed capabilities

---

## Future Consistency Guidelines

**For all new RightPanel tabs:**

1. ✅ Create Zustand store in `src/stores/{domain}-store.ts`
2. ✅ Create Server Actions in `src/app/actions/{domain}.ts`
3. ✅ Components call Server Actions, store in Zustand
4. ✅ Use computed/derived state from store (don't duplicate with useMemo)
5. ❌ Never use `createClient()` directly in components
6. ❌ Never use local `useState` for fetched data

**Pattern Template:**
```typescript
// {domain}-store.ts
export const use{Domain}Store = create((set) => ({
  items: {},
  setItems: (documentId, items) => set((state) => ({
    items: { ...state.items, [documentId]: items }
  }))
}))

// actions/{domain}.ts
'use server'
export async function get{Domain}ByDocument(documentId) {
  const user = await getCurrentUser()
  const supabase = createAdminClient()
  const { data } = await supabase.from('{domain}').select()
  return data
}

// components/{Domain}Tab.tsx
'use client'
export function {Domain}Tab({ documentId }) {
  const { items, setItems } = use{Domain}Store()

  useEffect(() => {
    async function load() {
      const data = await get{Domain}ByDocument(documentId)
      setItems(documentId, data)
    }
    load()
  }, [documentId, setItems])

  return <div>{items[documentId]?.map(...)}</div>
}
```

---

## Success Metrics

**Consistency Achieved When:**
- ✅ All tabs use Zustand stores
- ✅ All data fetching via Server Actions
- ✅ No direct Supabase `createClient()` in components
- ✅ All stores follow same pattern (document-keyed, setters, computed)
- ✅ Pattern documented for future features

---

## Estimated Effort

- Task 1 (Server Action): 15 minutes
- Task 2 (Update ConnectionsList): 30 minutes
- Task 3 (Verify others): 15 minutes
- Testing: 30 minutes
- Documentation: 30 minutes

**Total: ~2 hours**

---

**Ready to implement!** This will bring ConnectionsList in line with the rest of the codebase and establish a clear pattern for future tabs.
