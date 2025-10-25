# Handoff: Remove React Query from Flashcard System

**Date**: 2025-10-24
**Status**: Ready to implement
**Priority**: Medium
**Estimated Time**: 30-45 minutes

---

## Context

The flashcard system currently uses React Query (TanStack Query) for data fetching in client components. This adds unnecessary complexity since Next.js 15 has excellent Server Component support with built-in caching.

**Current Issue**: React Query requires:
- QueryProvider wrapper in layout
- Client components for all data fetching
- Extra dependency (~12KB)
- More complex mental model

**Goal**: Simplify by using Server Components + Client Islands pattern.

---

## 🚨 CRITICAL BUG TO FIX FIRST

**Problem**: Flashcards are being created in ECS but **NOT appearing in the cache table**.

**Evidence**:
- 3 generation jobs completed successfully
- 15 flashcard entities exist in `entities` table
- 0 rows in `flashcards_cache` table
- Function `rebuild_flashcards_cache()` doesn't exist

**Root Cause**: The generation handler creates ECS entities but never populates the cache table.

**Fix Required**:

### Option A: Create Cache Rebuild Function (Quick Fix)

Add migration: `supabase/migrations/068_flashcards_cache_rebuild.sql`

```sql
CREATE OR REPLACE FUNCTION rebuild_flashcards_cache(p_user_id UUID)
RETURNS void AS $$
BEGIN
  -- Delete existing cache for user
  DELETE FROM flashcards_cache WHERE user_id = p_user_id;

  -- Rebuild from ECS components
  INSERT INTO flashcards_cache (
    entity_id, user_id, card_type, question, answer, content,
    cloze_index, cloze_count, status, deck_id, deck_added_at,
    next_review, last_review, stability, difficulty, reps, lapses,
    srs_state, is_mature, document_id, chunk_ids, connection_id,
    annotation_id, generation_job_id, tags, storage_path,
    created_at, updated_at
  )
  SELECT
    e.id as entity_id,
    e.user_id,
    (card_comp.data->>'type')::text as card_type,
    (card_comp.data->>'question')::text as question,
    (card_comp.data->>'answer')::text as answer,
    (card_comp.data->>'content')::text as content,
    (card_comp.data->>'clozeIndex')::integer as cloze_index,
    (card_comp.data->>'clozeCount')::integer as cloze_count,
    CASE
      WHEN card_comp.data->>'srs' IS NULL THEN 'draft'
      ELSE 'active'
    END as status,
    (card_comp.data->>'deckId')::uuid as deck_id,
    (card_comp.data->>'deckAddedAt')::timestamptz as deck_added_at,
    (card_comp.data->'srs'->>'due')::timestamptz as next_review,
    (card_comp.data->'srs'->>'last_review')::timestamptz as last_review,
    (card_comp.data->'srs'->>'stability')::double precision as stability,
    (card_comp.data->'srs'->>'difficulty')::double precision as difficulty,
    (card_comp.data->'srs'->>'reps')::integer as reps,
    (card_comp.data->'srs'->>'lapses')::integer as lapses,
    (card_comp.data->'srs'->>'state')::integer as srs_state,
    (card_comp.data->'srs'->>'isMature')::boolean as is_mature,
    (chunk_ref_comp.data->>'documentId')::uuid as document_id,
    ARRAY(SELECT jsonb_array_elements_text(chunk_ref_comp.data->'chunkIds'))::uuid[] as chunk_ids,
    (chunk_ref_comp.data->>'connectionId')::uuid as connection_id,
    (chunk_ref_comp.data->>'annotationId')::uuid as annotation_id,
    (chunk_ref_comp.data->>'generationJobId')::uuid as generation_job_id,
    ARRAY(SELECT jsonb_array_elements_text(content_comp.data->'tags'))::text[] as tags,
    p_user_id || '/flashcards/card_' || e.id || '.json' as storage_path,
    (temporal_comp.data->>'createdAt')::timestamptz as created_at,
    (temporal_comp.data->>'updatedAt')::timestamptz as updated_at
  FROM entities e
  JOIN components card_comp ON card_comp.entity_id = e.id
    AND card_comp.component_type = 'Card'
  LEFT JOIN components content_comp ON content_comp.entity_id = e.id
    AND content_comp.component_type = 'Content'
  LEFT JOIN components temporal_comp ON temporal_comp.entity_id = e.id
    AND temporal_comp.component_type = 'Temporal'
  LEFT JOIN components chunk_ref_comp ON chunk_ref_comp.entity_id = e.id
    AND chunk_ref_comp.component_type = 'ChunkRef'
  WHERE e.user_id = p_user_id
    AND e.entity_type = 'flashcard';
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION rebuild_flashcards_cache TO authenticated;
```

Then run:
```sql
SELECT rebuild_flashcards_cache('00000000-0000-0000-0000-000000000000');
```

### Option B: Auto-Populate Cache During Creation (Better Long-Term)

Modify `worker/handlers/generate-flashcards.ts` to insert into cache table after creating ECS entity:

```typescript
// After creating entity and components...
await supabase.from('flashcards_cache').insert({
  entity_id: entity.id,
  user_id: userId,
  card_type: 'basic',
  question: card.question,
  answer: card.answer,
  status: 'draft',
  deck_id: deckId,
  // ... all other fields
})
```

**Recommendation**: Do **Option A first** (quick fix to see existing cards), then **Option B** for future cards.

---

## What to Do

### Step 1: Remove QueryProvider from Layout

**File**: `src/app/layout.tsx`

**Remove**:
```typescript
import { QueryProvider } from "@/components/providers/QueryProvider"

// In return:
<QueryProvider>
  <AppShell>
    {children}
  </AppShell>
  <Toaster />
</QueryProvider>
```

**Replace with**:
```typescript
<AppShell>
  {children}
</AppShell>
<Toaster />
```

### Step 2: Delete QueryProvider

**File to delete**: `src/components/providers/QueryProvider.tsx`

```bash
rm src/components/providers/QueryProvider.tsx
```

### Step 3: Refactor GenerationPanel

**File**: `src/components/flashcards/GenerationPanel.tsx`

**Current** (Client Component with React Query):
```typescript
'use client'
import { useQuery } from '@tanstack/react-query'

const { data: prompts } = useQuery({
  queryKey: ['prompts'],
  queryFn: getPromptTemplates
})
```

**New Pattern** (Server Component wrapper + Client Island):

**3a. Create Server Wrapper**: `src/components/flashcards/GenerationPanelServer.tsx`
```typescript
import { getPromptTemplates } from '@/app/actions/prompts'
import { getDecksWithStats } from '@/app/actions/decks'
import { GenerationPanelClient } from './GenerationPanelClient'

export async function GenerationPanelServer({ documentId }: { documentId: string }) {
  const prompts = await getPromptTemplates()
  const decks = await getDecksWithStats()

  return (
    <GenerationPanelClient
      documentId={documentId}
      prompts={prompts}
      decks={decks}
    />
  )
}
```

**3b. Refactor Client Component**: Rename `GenerationPanel.tsx` to `GenerationPanelClient.tsx`

**Changes**:
- Remove `useQuery` imports
- Accept `prompts` and `decks` as props instead of fetching
- Keep all the form state management (useState for sourceType, count, etc.)
- Keep the `handleGenerate` function

```typescript
'use client'

interface GenerationPanelClientProps {
  documentId: string
  prompts: PromptTemplate[]
  decks: DeckWithStats[]
}

export function GenerationPanelClient({ documentId, prompts, decks }: GenerationPanelClientProps) {
  const [sourceType, setSourceType] = useState<'document' | 'chunks'>('document')
  const [promptId, setPromptId] = useState('')
  const [count, setCount] = useState(5)
  const [deckId, setDeckId] = useState('')
  const [customInstructions, setCustomInstructions] = useState('')
  const [generating, setGenerating] = useState(false)

  // Auto-select defaults
  useEffect(() => {
    if (prompts && !promptId) {
      const defaultPrompt = prompts.find(p => p.is_default)
      if (defaultPrompt) setPromptId(defaultPrompt.id)
    }
  }, [prompts, promptId])

  useEffect(() => {
    if (decks && !deckId) {
      const inbox = decks.find(d => d.name === 'Inbox' && d.is_system)
      if (inbox) setDeckId(inbox.id)
    }
  }, [decks, deckId])

  // ... rest of component (handleGenerate, JSX)
}
```

### Step 4: Refactor FlashcardsList

**File**: `src/components/flashcards/FlashcardsList.tsx`

**Current** (Client Component with React Query):
```typescript
'use client'
import { useQuery } from '@tanstack/react-query'

const { data: cards, refetch } = useQuery({
  queryKey: ['flashcards', documentId, filter],
  queryFn: async () => await getFlashcardsByDocument(documentId, filter)
})
```

**New Pattern**:

**4a. Create Server Wrapper**: `src/components/flashcards/FlashcardsListServer.tsx`
```typescript
import { getFlashcardsByDocument, getDueFlashcards } from '@/app/actions/flashcards'
import { FlashcardsListClient } from './FlashcardsListClient'

export async function FlashcardsListServer({
  documentId
}: {
  documentId: string
}) {
  const allCards = await getFlashcardsByDocument(documentId)
  const dueCards = await getDueFlashcards()

  return (
    <FlashcardsListClient
      documentId={documentId}
      initialCards={allCards}
      dueCount={dueCards.length}
    />
  )
}
```

**4b. Refactor Client Component**: Rename to `FlashcardsListClient.tsx`

```typescript
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { getFlashcardsByDocument } from '@/app/actions/flashcards'
// ... other imports

interface FlashcardsListClientProps {
  documentId: string
  initialCards: FlashcardCache[]
  dueCount: number
}

export function FlashcardsListClient({
  documentId,
  initialCards,
  dueCount
}: FlashcardsListClientProps) {
  const [filter, setFilter] = useState<'all' | 'draft' | 'approved'>('all')
  const [cards, setCards] = useState(initialCards)
  const [activeCardId, setActiveCardId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  // Refetch when filter changes
  useEffect(() => {
    async function load() {
      setLoading(true)
      const filtered = await getFlashcardsByDocument(
        documentId,
        filter === 'all' ? undefined : filter
      )
      setCards(filtered)
      setLoading(false)
    }
    load()
  }, [documentId, filter])

  const handleRefetch = async () => {
    const updated = await getFlashcardsByDocument(documentId)
    setCards(updated)
  }

  // ... rest of component JSX
  // Replace refetch() calls with handleRefetch()
}
```

### Step 5: Update FlashcardsTab

**File**: `src/components/sidebar/FlashcardsTab.tsx`

**Current**:
```typescript
'use client'

import { GenerationPanel } from '@/components/flashcards/GenerationPanel'
import { FlashcardsList } from '@/components/flashcards/FlashcardsList'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

export function FlashcardsTab({ documentId }: { documentId: string }) {
  return (
    <Tabs defaultValue="generate" className="w-full">
      <TabsList className="w-full grid grid-cols-2">
        <TabsTrigger value="generate">Generate</TabsTrigger>
        <TabsTrigger value="cards">Cards</TabsTrigger>
      </TabsList>

      <TabsContent value="generate" className="mt-4">
        <GenerationPanel documentId={documentId} />
      </TabsContent>

      <TabsContent value="cards" className="mt-4">
        <FlashcardsList documentId={documentId} />
      </TabsContent>
    </Tabs>
  )
}
```

**New** (Server Component):
```typescript
// Remove 'use client' directive

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { GenerationPanelServer } from '@/components/flashcards/GenerationPanelServer'
import { FlashcardsListServer } from '@/components/flashcards/FlashcardsListServer'

export async function FlashcardsTab({ documentId }: { documentId: string }) {
  return (
    <Tabs defaultValue="generate" className="w-full">
      <TabsList className="w-full grid grid-cols-2">
        <TabsTrigger value="generate">Generate</TabsTrigger>
        <TabsTrigger value="cards">Cards</TabsTrigger>
      </TabsList>

      <TabsContent value="generate" className="mt-4">
        <GenerationPanelServer documentId={documentId} />
      </TabsContent>

      <TabsContent value="cards" className="mt-4">
        <FlashcardsListServer documentId={documentId} />
      </TabsContent>
    </Tabs>
  )
}
```

### Step 6: Uninstall React Query

```bash
npm uninstall @tanstack/react-query
```

---

## Testing Checklist

After making changes, test the following:

- [ ] Open document in reader
- [ ] Click FlashcardsTab in sidebar
- [ ] Generate tab loads with prompts dropdown populated
- [ ] Generate tab loads with decks dropdown populated (Inbox selected)
- [ ] Adjust count slider works
- [ ] Click "Generate" → Job starts successfully
- [ ] Switch to Cards tab → Cards load (if any exist)
- [ ] Filter dropdown works (all/draft/approved)
- [ ] Click card → Makes active
- [ ] Click Approve → Card updates (refetch works)
- [ ] Study button appears when due cards exist

---

## Benefits After Refactor

1. ✅ **Simpler**: No QueryProvider setup
2. ✅ **Smaller Bundle**: Remove ~12KB dependency
3. ✅ **Better SSR**: Server Components render faster
4. ✅ **Easier to Understand**: Standard React patterns
5. ✅ **Next.js 15 Best Practices**: Align with framework recommendations

---

## Files to Change

1. `src/app/layout.tsx` - Remove QueryProvider
2. `src/components/providers/QueryProvider.tsx` - DELETE
3. `src/components/flashcards/GenerationPanel.tsx` → Split into:
   - `GenerationPanelServer.tsx` (new)
   - `GenerationPanelClient.tsx` (refactored)
4. `src/components/flashcards/FlashcardsList.tsx` → Split into:
   - `FlashcardsListServer.tsx` (new)
   - `FlashcardsListClient.tsx` (refactored)
5. `src/components/sidebar/FlashcardsTab.tsx` - Make Server Component
6. `package.json` - Remove @tanstack/react-query

---

## Rollback Plan

If issues occur:
1. Git revert the changes
2. Or restore from this commit: `git log --oneline | head -1`
3. Re-run `npm install` to restore dependencies

---

## Additional Notes

- The Server Component pattern is **not** more verbose - it's actually cleaner
- Server Components have **automatic deduplication** (React caches fetch calls)
- Client Components only used for **interactivity** (form state, filters)
- This aligns with **Next.js 15 best practices** and React 19 patterns

---

**Ready to implement!** This is a straightforward refactor with clear benefits.
