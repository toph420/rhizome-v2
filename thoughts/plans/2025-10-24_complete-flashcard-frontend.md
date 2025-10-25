# Complete Flashcard Frontend Implementation Plan

**Created**: 2025-10-24
**Status**: Ready to implement
**Priority**: Medium (Polish + UX improvements)
**Estimated Time**: 4-6 hours

---

## Current State Assessment

### ✅ What's Already Complete

**Backend (100%)**:
- ECS operations, storage, system decks
- All server actions (CRUD + batch + study)
- Worker handler for generation
- Cloze support, template rendering, multi-source loaders
- FSRS integration (ts-fsrs)
- Cache rebuild RPC function

**Frontend (85% Complete)**:
- ✅ FlashcardsTab with 2 tabs (Generate/Cards)
- ✅ GenerationPanelClient (working)
- ✅ FlashcardsListClient (working)
- ✅ FlashcardCard component (keyboard shortcuts, inline editing)
- ✅ Flashcard store (Pattern 2)
- ✅ **Study mode page (`/study`) - COMPLETE!**
  - Full keyboard shortcuts (Space, 1-4, Esc)
  - Session tracking
  - FSRS review integration
  - Progress display

**React Query Status**:
- ✅ NOT used anywhere (only in archived file)
- ✅ NOT installed in package.json
- ✅ NO QueryProvider in layout.tsx
- **Conclusion**: Nothing to remove! Already clean.

### ❌ What's Missing (15%)

1. **Batch Operations Toolbar** - Backend exists, no UI
2. **Deck Management Page** - Full deck browser
3. **Stats Dashboard** - Analytics and progress
4. **Prompt Template Editor** - Create custom prompts
5. **Navigation Improvements** - Better flow between study and cards

---

## Implementation Plan

### Phase 1: Batch Operations Toolbar (1.5 hours)

**Goal**: Enable multi-select and batch operations on flashcards

**Files to Create**:
1. `src/components/flashcards/BatchOperationsToolbar.tsx` - Floating toolbar
2. `src/hooks/useMultiSelect.ts` - Multi-select state management

**Files to Modify**:
1. `src/components/flashcards/FlashcardsListClient.tsx` - Add selection UI

**Implementation**:

```typescript
// src/hooks/useMultiSelect.ts
import { useState, useCallback } from 'react'

export function useMultiSelect<T extends { entity_id: string }>(items: T[]) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  const toggleSelection = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }, [])

  const selectAll = useCallback(() => {
    setSelectedIds(new Set(items.map(item => item.entity_id)))
  }, [items])

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set())
  }, [])

  const isSelected = useCallback((id: string) => {
    return selectedIds.has(id)
  }, [selectedIds])

  return {
    selectedIds,
    selectedCount: selectedIds.size,
    toggleSelection,
    selectAll,
    clearSelection,
    isSelected,
    hasSelection: selectedIds.size > 0,
  }
}
```

```typescript
// src/components/flashcards/BatchOperationsToolbar.tsx
'use client'

import { useState } from 'react'
import { Button } from '@/components/rhizome/button'
import { Badge } from '@/components/rhizome/badge'
import { Check, Trash, Tag, FolderInput, X } from 'lucide-react'
import { toast } from 'sonner'
import {
  batchApproveFlashcards,
  batchDeleteFlashcards,
  batchAddTags,
  batchMoveToDeck,
} from '@/app/actions/flashcards'

interface BatchOperationsToolbarProps {
  selectedIds: Set<string>
  selectedCount: number
  onClearSelection: () => void
  onOperationComplete: () => void
}

export function BatchOperationsToolbar({
  selectedIds,
  selectedCount,
  onClearSelection,
  onOperationComplete,
}: BatchOperationsToolbarProps) {
  const [loading, setLoading] = useState(false)

  const handleBatchApprove = async () => {
    setLoading(true)
    try {
      const result = await batchApproveFlashcards(Array.from(selectedIds))
      if (result.success) {
        toast.success(`Approved ${selectedCount} cards`)
        onOperationComplete()
      } else {
        toast.error(result.error || 'Batch approve failed')
      }
    } catch (error) {
      toast.error('Failed to approve cards')
    } finally {
      setLoading(false)
    }
  }

  const handleBatchDelete = async () => {
    if (!confirm(`Delete ${selectedCount} cards? This cannot be undone.`)) return

    setLoading(true)
    try {
      const result = await batchDeleteFlashcards(Array.from(selectedIds))
      if (result.success) {
        toast.success(`Deleted ${selectedCount} cards`)
        onOperationComplete()
      } else {
        toast.error(result.error || 'Batch delete failed')
      }
    } catch (error) {
      toast.error('Failed to delete cards')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50">
      <div className="flex items-center gap-2 bg-background border-2 border-border shadow-brutal p-3 rounded-lg">
        <Badge variant="default">{selectedCount} selected</Badge>

        <Button
          size="sm"
          variant="default"
          onClick={handleBatchApprove}
          disabled={loading}
        >
          <Check className="h-4 w-4 mr-1" />
          Approve All
        </Button>

        <Button
          size="sm"
          variant="neutral"
          onClick={handleBatchDelete}
          disabled={loading}
        >
          <Trash className="h-4 w-4 mr-1" />
          Delete
        </Button>

        <div className="w-px h-6 bg-border" />

        <Button
          size="sm"
          variant="noShadow"
          onClick={onClearSelection}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}
```

**Modify FlashcardsListClient**:
```typescript
// Add to imports
import { useMultiSelect } from '@/hooks/useMultiSelect'
import { BatchOperationsToolbar } from './BatchOperationsToolbar'

// In component:
const {
  selectedIds,
  selectedCount,
  toggleSelection,
  selectAll,
  clearSelection,
  isSelected,
  hasSelection,
} = useMultiSelect(cards)

// Add keyboard shortcut for select all (Ctrl/Cmd+A)
useEffect(() => {
  const handleKeyPress = (e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'a') {
      e.preventDefault()
      selectAll()
    }
  }
  window.addEventListener('keydown', handleKeyPress)
  return () => window.removeEventListener('keydown', handleKeyPress)
}, [selectAll])

// Add checkbox to FlashcardCard or add wrapper div with checkbox
```

**Testing**:
- [ ] Click cards → Selection works
- [ ] Ctrl/Cmd+A → Select all
- [ ] Batch approve → All selected become active
- [ ] Batch delete → All selected removed
- [ ] Toolbar appears when cards selected
- [ ] Clear selection works

---

### Phase 2: Deck Management Page (2 hours)

**Goal**: Full deck browser with create/edit/delete

**Files to Create**:
1. `src/app/decks/page.tsx` - Deck management page
2. `src/components/decks/DeckCard.tsx` - Individual deck display
3. `src/components/decks/CreateDeckDialog.tsx` - Create/edit dialog

**Route**: `/decks`

**Implementation**:

```typescript
// src/app/decks/page.tsx
import { getDecksWithStats } from '@/app/actions/decks'
import { getDueFlashcards } from '@/app/actions/flashcards'
import { DecksPageClient } from '@/components/decks/DecksPageClient'

export default async function DecksPage() {
  const decks = await getDecksWithStats()
  const dueCards = await getDueFlashcards()

  return (
    <div className="container mx-auto p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Decks</h1>
        <p className="text-muted-foreground">
          Manage your flashcard decks
        </p>
      </div>

      <DecksPageClient
        initialDecks={decks}
        initialDueCount={dueCards.length}
      />
    </div>
  )
}
```

```typescript
// src/components/decks/DecksPageClient.tsx
'use client'

import { useState } from 'react'
import { DeckCard } from './DeckCard'
import { CreateDeckDialog } from './CreateDeckDialog'
import { Button } from '@/components/rhizome/button'
import { Plus } from 'lucide-react'
import type { Deck } from '@/lib/flashcards/types'

export function DecksPageClient({ initialDecks, initialDueCount }) {
  const [decks, setDecks] = useState(initialDecks)
  const [createOpen, setCreateOpen] = useState(false)

  return (
    <div>
      <div className="mb-6 flex justify-between items-center">
        <div className="text-sm text-muted-foreground">
          {initialDueCount} cards due for review
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4 mr-1" />
          New Deck
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {decks.map(deck => (
          <DeckCard
            key={deck.id}
            deck={deck}
            onUpdate={() => {
              // Refetch decks
            }}
          />
        ))}
      </div>

      <CreateDeckDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSuccess={() => {
          // Refetch decks
        }}
      />
    </div>
  )
}
```

**Features**:
- Grid of deck cards showing stats (total, draft, active, due)
- System decks (Inbox, Archive) marked with badge
- Click deck → Navigate to filtered flashcard list
- Create/edit/delete operations
- Nested deck support (future)

**Testing**:
- [ ] Navigate to `/decks` → Page loads
- [ ] See all decks with stats
- [ ] Click "New Deck" → Dialog opens
- [ ] Create deck → Appears in list
- [ ] Click deck → Navigate to `/decks/[id]` or filter on flashcards tab
- [ ] Delete non-system deck works
- [ ] Cannot delete system decks

---

### Phase 3: Stats Dashboard (1.5 hours)

**Goal**: Display study statistics and progress

**Files to Create**:
1. `src/components/flashcards/StatsDashboard.tsx` - Stats display
2. `src/app/actions/stats.ts` - Stats server actions

**Add to FlashcardsTab or create `/stats` page**

**Implementation**:

```typescript
// src/app/actions/stats.ts
'use server'

import { getCurrentUser } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'

export async function getUserStats() {
  const user = await getCurrentUser()
  if (!user) throw new Error('Unauthorized')

  const supabase = createAdminClient()

  // Get counts from cache
  const { data: cards } = await supabase
    .from('flashcards_cache')
    .select('status, next_review')
    .eq('user_id', user.id)

  const total = cards?.length || 0
  const draft = cards?.filter(c => c.status === 'draft').length || 0
  const active = cards?.filter(c => c.status === 'active').length || 0
  const due = cards?.filter(c =>
    c.status === 'active' &&
    c.next_review &&
    new Date(c.next_review) <= new Date()
  ).length || 0

  // Get recent sessions
  const { data: sessions } = await supabase
    .from('study_sessions')
    .select('*')
    .eq('user_id', user.id)
    .order('started_at', { ascending: false })
    .limit(10)

  // Calculate streaks, retention, etc.
  const last7Days = sessions?.filter(s => {
    const diff = Date.now() - new Date(s.started_at).getTime()
    return diff < 7 * 24 * 60 * 60 * 1000
  }) || []

  const cardsReviewedLast7Days = last7Days.reduce((sum, s) => sum + (s.reviewed_count || 0), 0)

  return {
    total,
    draft,
    active,
    due,
    sessions: sessions || [],
    cardsReviewedLast7Days,
  }
}
```

```typescript
// src/components/flashcards/StatsDashboard.tsx
'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/rhizome/card'
import { Badge } from '@/components/rhizome/badge'

export function StatsDashboard({ stats }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Total Cards</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{stats.total}</div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Due Today</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-blue-500">{stats.due}</div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Active</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-green-500">{stats.active}</div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Drafts</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-yellow-500">{stats.draft}</div>
        </CardContent>
      </Card>
    </div>
  )
}
```

**Add to FlashcardsTab as 3rd tab or show in header**

**Testing**:
- [ ] Stats display correctly
- [ ] Updates after approving cards
- [ ] Shows recent sessions
- [ ] 7-day progress visible

---

### Phase 4: Navigation Improvements (1 hour)

**Goal**: Better flow between study and flashcard management

**Changes**:

1. **Add "Study Now" button to FlashcardsTab**:
```typescript
// In FlashcardsTab header
{dueCount > 0 && (
  <Button
    variant="default"
    onClick={() => router.push('/study')}
  >
    Study Now ({dueCount} due)
  </Button>
)}
```

2. **Add back navigation from /study to document**:
```typescript
// In StudyPage, track where user came from
const returnPath = searchParams?.from || '/flashcards'

// In handleExit
router.push(returnPath)
```

3. **Update FlashcardsListClient Study button**:
```typescript
<Button onClick={() => router.push('/study')}>
  Study ({dueCount} due)
</Button>
```

4. **Add breadcrumbs/navigation**:
```typescript
// In /study header
<Breadcrumb>
  <BreadcrumbItem href="/flashcards">Flashcards</BreadcrumbItem>
  <BreadcrumbItem current>Study</BreadcrumbItem>
</Breadcrumb>
```

**Testing**:
- [ ] Click "Study Now" from FlashcardsTab → Goes to /study
- [ ] Complete study → Returns to flashcards
- [ ] Esc from study → Returns to flashcards
- [ ] Breadcrumbs work

---

### Phase 5: Prompt Template Editor (Optional - 1 hour)

**Goal**: UI for creating/editing custom prompt templates

**Files to Create**:
1. `src/components/flashcards/PromptTemplateEditor.tsx` - Template editor
2. Add to Admin Panel or create `/prompts` page

**Implementation**:

```typescript
// src/components/flashcards/PromptTemplateEditor.tsx
'use client'

import { useState } from 'react'
import { Card, CardContent } from '@/components/rhizome/card'
import { Button } from '@/components/rhizome/button'
import { Input } from '@/components/rhizome/input'
import { Textarea } from '@/components/rhizome/textarea'
import { Label } from '@/components/rhizome/label'
import { Badge } from '@/components/rhizome/badge'
import { createPromptTemplate } from '@/app/actions/prompts'
import { toast } from 'sonner'

export function PromptTemplateEditor() {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [template, setTemplate] = useState('')
  const [variables, setVariables] = useState(['count', 'content', 'custom'])
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async () => {
    setSubmitting(true)
    try {
      const result = await createPromptTemplate({
        name,
        description,
        template,
        variables,
      })

      if (result.success) {
        toast.success('Prompt template created')
        // Reset form
        setName('')
        setDescription('')
        setTemplate('')
      } else {
        toast.error(result.error || 'Failed to create template')
      }
    } catch (error) {
      toast.error('Failed to create template')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Card>
      <CardContent className="p-6 space-y-4">
        <div>
          <Label>Template Name</Label>
          <Input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Technical Deep Dive"
          />
        </div>

        <div>
          <Label>Description</Label>
          <Input
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="Detailed technical questions for engineering content"
          />
        </div>

        <div>
          <Label>Template</Label>
          <Textarea
            value={template}
            onChange={e => setTemplate(e.target.value)}
            rows={10}
            placeholder="Generate {{count}} cards from {{content}}..."
          />
          <p className="text-xs text-muted-foreground mt-1">
            Variables: {{count}}, {{content}}, {{chunks}}, {{custom}}
          </p>
        </div>

        <Button
          onClick={handleSubmit}
          disabled={!name || !template || submitting}
        >
          Create Template
        </Button>
      </CardContent>
    </Card>
  )
}
```

**Testing**:
- [ ] Create custom template → Saves
- [ ] Template appears in generation dropdown
- [ ] Variables substitute correctly
- [ ] Template used for generation works

---

## Summary of What We Need

### Already Complete ✅
1. ✅ Study mode UI (`/study` page with full implementation)
2. ✅ Study session tracking (server actions complete)
3. ✅ FSRS review integration (backend complete)
4. ✅ Keyboard shortcuts in study mode (Space, 1-4, Esc)
5. ✅ FlashcardCard with keyboard shortcuts (e/a/d)
6. ✅ All backend server actions
7. ✅ No React Query to remove (already clean)

### To Implement (15% remaining)
1. ⚠️ Batch operations toolbar (1.5 hours)
2. ⚠️ Deck management page (2 hours)
3. ⚠️ Stats dashboard (1.5 hours)
4. ⚠️ Navigation improvements (1 hour)
5. 🔵 Prompt template editor (optional, 1 hour)

**Total**: ~6 hours for complete polish

---

## Priority Recommendation

**High Priority** (Must have):
1. ✅ Study mode - ALREADY DONE!
2. Navigation improvements (1 hour) - Better UX flow
3. Stats dashboard (1.5 hours) - User motivation

**Medium Priority** (Nice to have):
4. Batch operations toolbar (1.5 hours) - Power user feature
5. Deck management page (2 hours) - Organization

**Low Priority** (Can wait):
6. Prompt template editor (1 hour) - Advanced feature

---

## Implementation Order

### Sprint 1: Polish Study Experience (2.5 hours)
1. Navigation improvements - Better flow to/from study
2. Stats dashboard - Show progress and motivation

### Sprint 2: Power User Features (3.5 hours)
3. Batch operations toolbar - Multi-select and bulk actions
4. Deck management page - Full deck browser

### Sprint 3: Advanced Features (1 hour)
5. Prompt template editor - Custom prompts

---

## Testing Checklist

After implementation, verify end-to-end flow:

### Generation → Study Flow
- [ ] Open FlashcardsTab → Generate tab
- [ ] Generate 5 cards → Job completes
- [ ] Switch to Cards tab → 5 drafts appear
- [ ] Select cards → Batch approve toolbar appears
- [ ] Batch approve → All become active
- [ ] Click "Study Now" → Navigate to /study
- [ ] Review cards with keyboard shortcuts
- [ ] Complete session → Return to flashcards
- [ ] Stats update correctly

### Deck Management Flow
- [ ] Navigate to /decks
- [ ] Create new deck → Appears in list
- [ ] Generate cards to new deck
- [ ] Filter flashcards by deck
- [ ] Study from specific deck
- [ ] View deck stats

---

## Files Summary

### New Files to Create (12 files)
1. `src/hooks/useMultiSelect.ts`
2. `src/components/flashcards/BatchOperationsToolbar.tsx`
3. `src/app/decks/page.tsx`
4. `src/components/decks/DecksPageClient.tsx`
5. `src/components/decks/DeckCard.tsx`
6. `src/components/decks/CreateDeckDialog.tsx`
7. `src/app/actions/stats.ts`
8. `src/components/flashcards/StatsDashboard.tsx`
9. `src/components/flashcards/PromptTemplateEditor.tsx`
10. `src/components/ui/breadcrumb.tsx` (if doesn't exist)

### Files to Modify (3 files)
1. `src/components/flashcards/FlashcardsListClient.tsx` - Add multi-select
2. `src/components/sidebar/FlashcardsTab.tsx` - Add stats + study button
3. `src/app/study/page.tsx` - Add return path tracking

---

## Success Criteria

**System is complete when**:
- ✅ User can generate flashcards from documents
- ✅ User can review/edit/approve drafts
- ✅ User can study with FSRS scheduling
- ✅ User can batch approve/delete cards
- ✅ User can organize cards into decks
- ✅ User can see progress stats
- ✅ Navigation feels smooth and intuitive

**All of this with Pattern 2** (Zustand + Server Actions) - No React Query needed!

---

**Ready to implement!** The study mode is already complete, so we're 85% done. Just need polish and power user features.
