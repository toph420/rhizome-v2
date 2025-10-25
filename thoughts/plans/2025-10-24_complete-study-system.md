# Complete Study System Implementation Plan

**Created**: 2025-10-24
**Status**: 📋 Planning
**Priority**: High
**Dependencies**: StudySession component (✅ Complete)

---

## Overview

Transform `/study` into a comprehensive study management system with two-tab interface (no modals!), full deck CRUD, custom study sessions, reusable stats component, and compact sidebar study.

### Goals

1. **Study Management Tab**: Deck browser, custom study builder, recent activity
2. **Study Session Tab**: Active study with completion UI and smart navigation
3. **Full Deck CRUD**: Create, edit, delete, move cards between decks
4. **Reusable Stats Component**: Configurable for study page, decks, documents, cards
5. **Compact Sidebar Study**: 7th RightPanel tab with context-aware options

### Design Principles

- ✅ **No modals** - Use tabs, panels, and persistent UI
- ✅ **Zustand Pattern 2** - Server Actions + Store (consistent with flashcard-store)
- ✅ **Reusable Components** - Stats, filters, session UI work across contexts
- ✅ **Context-Aware** - Study sessions remember where they came from
- ✅ **Neobrutalist Design** - Bold borders, shadows, consistent styling

---

## Phase 1: Foundation Components

### 1.1 Reusable Stats Component

**File**: `src/components/flashcards/StudyStats.tsx`

**Purpose**: Configurable stats display for study page, decks, documents, cards

**Interface**:
```typescript
interface StudyStatsProps {
  // Data source
  scope: 'global' | 'deck' | 'document' | 'card'
  scopeId?: string  // deckId, documentId, or cardId

  // Display mode
  mode: 'compact' | 'expanded'

  // Time range (expanded mode)
  timeRange?: 'today' | 'week' | 'month' | 'all'

  // Display options
  showGraphs?: boolean  // Weekly/monthly graphs (expanded mode)
  showRetention?: boolean  // Retention rate
  showStreak?: boolean  // Study streak
  showUpcoming?: boolean  // Upcoming reviews
}
```

**Modes**:

**Compact Mode** (quick summary):
```
┌─────────────────────────────────┐
│ Today: 15 cards reviewed        │
│ Due: 12 cards                   │
│ Streak: 5 days 🔥               │
└─────────────────────────────────┘
```

**Expanded Mode** (full analytics):
```
┌─────────────────────────────────────────┐
│ Study Statistics - Last Week            │
│                                         │
│ Cards Reviewed    [█████████░] 87/100   │
│ Retention Rate    94%                   │
│ Avg Time/Card     8s                    │
│                                         │
│ Weekly Activity Graph                   │
│ [Bar chart: Mon-Sun]                    │
│                                         │
│ Upcoming Reviews                        │
│ • Today: 12 cards                       │
│ • Tomorrow: 8 cards                     │
│ • This week: 34 cards                   │
└─────────────────────────────────────────┘
```

**Server Actions** (new):
```typescript
// src/app/actions/stats.ts

getStudyStats(scope, scopeId, timeRange): Promise<{
  reviewedCount: number
  dueCount: number
  retentionRate: number
  avgTimePerCard: number
  streak: number
  upcomingReviews: { date: string; count: number }[]
  dailyActivity: { date: string; count: number; avgRating: number }[]
}>
```

**Implementation Notes**:
- Uses `flashcards_cache` for fast queries
- Joins with `study_sessions` for historical data
- Calculates retention from rating distributions (Good/Easy vs Again/Hard)
- Caches daily aggregates for performance

---

### 1.2 Deck CRUD Server Actions

**File**: `src/app/actions/decks.ts` (extend existing)

**New Actions**:

```typescript
// Move cards between decks (batch operation)
moveCardsToDeck(
  cardIds: string[],
  targetDeckId: string
): Promise<Result>

// Get deck with full stats (retention, avg rating)
getDeckWithDetailedStats(deckId: string): Promise<{
  deck: Deck
  stats: {
    totalCards: number
    draftCards: number
    activeCards: number
    dueCards: number
    retentionRate: number
    avgRating: number
    lastStudied: Date | null
  }
}>

// Get nested deck tree (hierarchical structure)
getDeckTree(): Promise<DeckNode[]>

interface DeckNode {
  deck: Deck
  stats: DeckStats
  children: DeckNode[]
}
```

**Implementation**:
- Extends existing `src/app/actions/decks.ts`
- Uses `flashcards_cache` for stats
- Recursive query for nested decks
- Validates system deck protection

---

### 1.3 Custom Study Server Action

**File**: `src/app/actions/study.ts` (extend existing)

**New Action**:

```typescript
// Create custom study session with advanced filters
createCustomStudySession(filters: CustomStudyFilters): Promise<{
  success: boolean
  sessionId?: string
  cards?: FlashcardCacheRow[]
  error?: string
}>

interface CustomStudyFilters {
  // Existing filters
  deckId?: string
  documentId?: string
  chunkIds?: string[]
  tags?: string[]
  limit?: number
  dueOnly?: boolean

  // NEW: Advanced filters
  dateRange?: {
    start: Date
    end: Date
    field: 'created_at' | 'last_reviewed' | 'next_review'
  }
  status?: ('draft' | 'active' | 'suspended')[]
  difficulty?: {
    min: number  // 0-10
    max: number
  }
  rating?: {
    include: (1 | 2 | 3 | 4)[]  // Filter by last rating
  }
  notStudiedYet?: boolean  // Cards never reviewed
  failedCards?: boolean  // Cards rated Again (1) recently
  sourceDocument?: string  // Filter by source document
}
```

**Query Building**:
```typescript
let query = supabase
  .from('flashcards_cache')
  .select('*')
  .eq('user_id', userId)

// Apply all filters dynamically
if (filters.dateRange) {
  query = query
    .gte(filters.dateRange.field, filters.dateRange.start)
    .lte(filters.dateRange.field, filters.dateRange.end)
}

if (filters.difficulty) {
  query = query
    .gte('difficulty', filters.difficulty.min)
    .lte('difficulty', filters.difficulty.max)
}

if (filters.notStudiedYet) {
  query = query.is('last_review', null)
}

// ... etc
```

---

## Phase 2: Study Management Tab

### 2.1 Study Page Structure

**File**: `src/app/study/page.tsx`

**New Two-Tab Structure**:
```typescript
'use client'

import { useState } from 'react'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/rhizome/tabs'
import { StudyManagement } from '@/components/flashcards/StudyManagement'
import { StudySession } from '@/components/flashcards/StudySession'

type StudyTab = 'management' | 'session'

interface SessionContext {
  deckId?: string
  deckName?: string
  filters?: CustomStudyFilters
  returnTo: 'management' | { type: 'document'; id: string; title: string }
}

export default function StudyPage() {
  const [activeTab, setActiveTab] = useState<StudyTab>('management')
  const [sessionContext, setSessionContext] = useState<SessionContext | null>(null)

  const handleStartStudy = (context: SessionContext) => {
    setSessionContext(context)
    setActiveTab('session')
  }

  const handleSessionComplete = () => {
    setActiveTab('management')
    setSessionContext(null)
  }

  const handleExit = () => {
    if (sessionContext?.returnTo !== 'management') {
      // Navigate back to document
      const doc = sessionContext.returnTo as { type: 'document'; id: string }
      router.push(`/read/${doc.id}`)
    } else {
      setActiveTab('management')
    }
  }

  return (
    <div className="h-screen flex flex-col">
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as StudyTab)}>
        <TabsList className="border-b-2">
          <TabsTrigger value="management">Management</TabsTrigger>
          <TabsTrigger value="session" disabled={!sessionContext}>
            Study Session
          </TabsTrigger>
        </TabsList>

        <TabsContent value="management" className="flex-1">
          <StudyManagement onStartStudy={handleStartStudy} />
        </TabsContent>

        <TabsContent value="session" className="flex-1">
          {sessionContext && (
            <StudySession
              {...sessionContext.filters}
              mode="fullscreen"
              onComplete={handleSessionComplete}
              onExit={handleExit}
            />
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
```

**Pattern**: Similar to FlashcardsTab (Generate/Cards tabs) but page-level

---

### 2.2 Study Management Component

**File**: `src/components/flashcards/StudyManagement.tsx`

**Structure**:
```typescript
interface StudyManagementProps {
  onStartStudy: (context: SessionContext) => void
}

export function StudyManagement({ onStartStudy }: StudyManagementProps) {
  return (
    <ScrollArea className="h-full">
      <div className="p-6 space-y-6">
        {/* Stats Summary */}
        <StudyStats scope="global" mode="expanded" showGraphs />

        {/* Deck Grid */}
        <DeckGrid onStudyDeck={(deckId, deckName) =>
          onStartStudy({
            deckId,
            deckName,
            returnTo: 'management'
          })
        } />

        {/* Custom Study Builder */}
        <CustomStudyBuilder onStartSession={(filters) =>
          onStartStudy({
            filters,
            returnTo: 'management'
          })
        } />
      </div>
    </ScrollArea>
  )
}
```

---

### 2.3 Deck Grid Component

**File**: `src/components/flashcards/DeckGrid.tsx`

**Layout**:
```
┌────────────────────────────────────────────┐
│ My Decks                     [+ New Deck]  │
├────────────────────────────────────────────┤
│ ┌──────────────┐  ┌──────────────┐        │
│ │ Inbox        │  │ Philosophy   │        │
│ │ (system)     │  │              │        │
│ │              │  │              │        │
│ │ 23 cards     │  │ 45 cards     │        │
│ │ 12 due       │  │ 8 due        │        │
│ │ 94% retention│  │ 89% retention│        │
│ │              │  │              │        │
│ │ [Study Now]  │  │ [Study Now]  │        │
│ │ [••• Menu]   │  │ [••• Menu]   │        │
│ └──────────────┘  └──────────────┘        │
│                                            │
│ ┌──────────────┐  ┌──────────────┐        │
│ │ Archive      │  │ CS Theory    │        │
│ │ (system)     │  │ └─ Algorithms│        │
│ │ ...          │  │ ...          │        │
│ └──────────────┘  └──────────────┘        │
└────────────────────────────────────────────┘
```

**Features**:
- Grid layout (2-3 columns responsive)
- Deck card with stats (uses StudyStats in compact mode)
- "Study Now" button → triggers onStudyDeck
- Dropdown menu (Edit, Delete, Move Cards, View Details)
- Shows nested deck hierarchy (indentation or tree view)
- System deck badge
- Create new deck button

**Card Menu Actions**:
```typescript
interface DeckCardProps {
  deck: Deck
  stats: DeckStats
  onStudy: () => void
  onEdit: () => void
  onDelete: () => void
  onMoveCards: () => void
}

// Menu items
- Study Now (primary action)
- Edit Deck (name, description, parent)
- Move Cards (batch select + move to another deck)
- View Details (expand stats)
- Delete Deck (non-system only, confirm modal alternative: sheet overlay)
```

---

### 2.4 Custom Study Builder Component

**File**: `src/components/flashcards/CustomStudyBuilder.tsx`

**Accordion-Style Filters**:
```
┌────────────────────────────────────────┐
│ Custom Study Session                   │
├────────────────────────────────────────┤
│ ▼ Deck & Source                        │
│   □ Deck: [All Decks ▼]                │
│   □ Document: [Select Document ▼]      │
│   □ Tags: [philosophy] [ethics] [+]    │
│                                        │
│ ▼ Time Range                           │
│   □ Created: [Last 7 days ▼]           │
│   □ Last Reviewed: [Never ▼]           │
│   □ Next Review: [Due today ▼]         │
│                                        │
│ ▼ Status & Difficulty                  │
│   □ Status: [☑ Draft] [☑ Active]       │
│   □ Difficulty: [0 ──●────── 10]       │
│   □ Last Rating: [1][2][3][4]          │
│                                        │
│ ▼ Special Filters                      │
│   □ Not studied yet                    │
│   □ Failed cards (rated "Again")       │
│   □ High difficulty (>7)               │
│                                        │
│ Limit: [20] cards                      │
│                                        │
│ [Preview (0 cards)] [Start Session]    │
└────────────────────────────────────────┘
```

**Features**:
- Collapsible filter sections (accordion pattern)
- Live preview count (updates as filters change)
- Tag autocomplete from existing tags
- Document dropdown (recent documents)
- Difficulty slider (0-10 range)
- Checkbox filters for common cases
- "Start Session" triggers onStartSession with filters

**State Management**:
```typescript
const [filters, setFilters] = useState<CustomStudyFilters>({})
const [previewCount, setPreviewCount] = useState(0)

// Debounced preview update
useEffect(() => {
  const timer = setTimeout(async () => {
    const count = await getFilteredCardCount(filters)
    setPreviewCount(count)
  }, 300)
  return () => clearTimeout(timer)
}, [filters])
```

---

## Phase 3: Study Session Enhancements

### 3.1 Session Completion UI

**File**: `src/components/flashcards/StudySession.tsx` (modify existing)

**Add Completion State**:
```typescript
const [sessionComplete, setSessionComplete] = useState(false)
const [sessionStats, setSessionStats] = useState<SessionStats | null>(null)

// After last card rated
if (currentIndex >= session.cards.length - 1) {
  await endStudySession(session.id)
  const stats = await getSessionStats(session.id)
  setSessionStats(stats)
  setSessionComplete(true)
}

// Render completion UI
{sessionComplete ? (
  <SessionComplete
    stats={sessionStats}
    onStudyMore={() => {
      // Reset and start new session
      setSessionComplete(false)
      initSession()
    }}
    onExit={onExit}
    returnTo={returnContext}
  />
) : (
  // ... existing card display
)}
```

---

### 3.2 Session Complete Component

**File**: `src/components/flashcards/SessionComplete.tsx`

**Layout**:
```
┌─────────────────────────────────────────┐
│                                         │
│            🎉 Session Complete!         │
│                                         │
│  You reviewed 20 cards in 8 minutes    │
│                                         │
│  ┌───────────────────────────────────┐ │
│  │ Ratings Breakdown                 │ │
│  │                                   │ │
│  │ ●●  Again (2)  - 10%              │ │
│  │ ●●●●● Hard (5)  - 25%             │ │
│  │ ●●●●●●●●●● Good (10) - 50%        │ │
│  │ ●●● Easy (3)  - 15%               │ │
│  │                                   │ │
│  │ Retention: 90% (Good + Easy)      │ │
│  └───────────────────────────────────┘ │
│                                         │
│  Next review: 8 cards due tomorrow     │
│                                         │
│  [Study More]  [Back to Management]    │
│                                         │
│  OR (if from document):                │
│  [Study More]  [Back to "Doc Title"]   │
│                                         │
└─────────────────────────────────────────┘
```

**Props**:
```typescript
interface SessionCompleteProps {
  stats: {
    reviewedCount: number
    timeSpentMs: number
    againCount: number
    hardCount: number
    goodCount: number
    easyCount: number
  }
  onStudyMore: () => void
  onExit: () => void
  returnTo?: 'management' | { type: 'document'; id: string; title: string }
}
```

---

## Phase 4: Compact Sidebar Study

### 4.1 Add 7th Tab to RightPanel

**File**: `src/components/sidebar/RightPanel.tsx` (modify existing)

**Changes**:
```typescript
// Line 33: Add 'study' to TabId type
type TabId = 'connections' | 'annotations' | 'quality' | 'sparks' | 'cards' | 'review' | 'tune' | 'study'

// Line 41-49: Add study tab to TABS array
const TABS: Tab[] = [
  // ... existing tabs
  { id: 'study', icon: GraduationCap, label: 'Study' },  // NEW
]

// After line 329: Add TabsContent for study
<TabsContent value="study" className="flex-1 overflow-hidden m-0 h-full">
  <CompactStudyTab documentId={documentId} />
</TabsContent>
```

**Note**: Grid changes from `grid-cols-7` to `grid-cols-8`

---

### 4.2 Compact Study Tab Component

**File**: `src/components/sidebar/CompactStudyTab.tsx`

**Layout**:
```
┌─────────────────────────────────┐
│ Quick Study                     │
├─────────────────────────────────┤
│ Study from this document:       │
│                                 │
│ ○ Visible chunks (3 cards)      │
│ ○ Nearby range (8 cards)        │
│   ├─ Range: [± 5] chunks        │
│ ○ Full document (23 cards)      │
│                                 │
│ [Start Quick Study]             │
│                                 │
│ ─────── OR ──────               │
│                                 │
│ Recent Activity                 │
│ • Studied 5 cards today         │
│ • 12 cards due                  │
│                                 │
│ [Open Full Study Page →]        │
└─────────────────────────────────┘
```

**Features**:
- Radio button selection (visible/nearby/full)
- Nearby range slider (±N chunks, default ±5)
- Heading-aware option ("Current section")
- Start button → embeds `<StudySession mode="compact" />`
- Shows compact stats
- Link to full study page

**State Flow**:
```typescript
const [studyMode, setStudyMode] = useState<'select' | 'studying'>('select')
const [source, setSource] = useState<'visible' | 'nearby' | 'full'>('visible')
const [nearbyRange, setNearbyRange] = useState(5)

const handleStart = () => {
  setStudyMode('studying')
}

{studyMode === 'select' ? (
  <SourceSelector ... />
) : (
  <StudySession
    mode="compact"
    documentId={documentId}
    chunkIds={getChunkIds(source, nearbyRange)}
    limit={20}
    onComplete={() => setStudyMode('select')}
    onExit={() => setStudyMode('select')}
  />
)}
```

**Chunk ID Calculation**:
```typescript
function getChunkIds(
  source: 'visible' | 'nearby' | 'full',
  nearbyRange: number
): string[] | undefined {
  if (source === 'visible') {
    return visibleChunks.map(c => c.id)
  }
  if (source === 'nearby') {
    const currentChunk = getCurrentChunk()
    const nearby = chunks.filter(c =>
      Math.abs(c.chunk_index - currentChunk.chunk_index) <= nearbyRange
    )
    return nearby.map(c => c.id)
  }
  // full document - no filter
  return undefined
}
```

---

## Phase 5: Database Schema Updates

### 5.1 Study Sessions Table Enhancement

**Migration**: `064_study_sessions_enhancements.sql`

**Add columns for advanced stats**:
```sql
ALTER TABLE study_sessions ADD COLUMN IF NOT EXISTS
  session_type TEXT DEFAULT 'standard';  -- 'standard' | 'custom' | 'quick'

ALTER TABLE study_sessions ADD COLUMN IF NOT EXISTS
  filters_json JSONB;  -- Store CustomStudyFilters for replay

-- Add index for fast stats queries
CREATE INDEX IF NOT EXISTS idx_study_sessions_user_date
  ON study_sessions (user_id, started_at DESC);
```

---

### 5.2 Deck Statistics Materialized View (Optional)

**For performance**:
```sql
-- Materialized view for fast deck stats
CREATE MATERIALIZED VIEW IF NOT EXISTS deck_stats AS
SELECT
  d.id as deck_id,
  d.user_id,
  COUNT(fc.entity_id) as total_cards,
  COUNT(CASE WHEN fc.status = 'draft' THEN 1 END) as draft_cards,
  COUNT(CASE WHEN fc.status = 'active' THEN 1 END) as active_cards,
  COUNT(CASE WHEN fc.next_review <= NOW() THEN 1 END) as due_cards,
  AVG(fc.difficulty) as avg_difficulty,
  MAX(fc.updated_at) as last_modified
FROM decks d
LEFT JOIN flashcards_cache fc ON fc.deck_id = d.id
GROUP BY d.id, d.user_id;

-- Refresh function
CREATE OR REPLACE FUNCTION refresh_deck_stats()
RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY deck_stats;
END;
$$ LANGUAGE plpgsql;

-- Trigger to refresh after flashcard changes
-- (Or refresh manually after batch operations)
```

**Note**: Only use if query performance becomes an issue

---

## Implementation Order

### Week 1: Foundation
1. ✅ **Day 1-2**: Reusable `StudyStats` component (compact + expanded modes)
2. ✅ **Day 3**: Extend deck actions (moveCardsToDeck, getDeckWithDetailedStats)
3. ✅ **Day 4**: Custom study server action (createCustomStudySession)
4. ✅ **Day 5**: Database migration for study_sessions enhancements

### Week 2: Study Management
5. ✅ **Day 1**: Refactor `/study` page structure (two-tab layout)
6. ✅ **Day 2**: `StudyManagement` component shell
7. ✅ **Day 3-4**: `DeckGrid` component (deck cards, menus, CRUD)
8. ✅ **Day 5**: `CustomStudyBuilder` component (filter accordion)

### Week 3: Session Enhancements
9. ✅ **Day 1-2**: `SessionComplete` component
10. ✅ **Day 3**: Modify `StudySession` for completion UI
11. ✅ **Day 4**: Session context tracking (returnTo logic)
12. ✅ **Day 5**: Testing & bug fixes

### Week 4: Compact Study
13. ✅ **Day 1**: Add 7th tab to RightPanel
14. ✅ **Day 2-3**: `CompactStudyTab` component
15. ✅ **Day 4**: Chunk range calculation logic
16. ✅ **Day 5**: Integration testing

### Week 5: Polish & Testing
17. ✅ **Day 1**: Stats component graphs (weekly/monthly)
18. ✅ **Day 2**: Deck hierarchy visualization
19. ✅ **Day 3**: Comprehensive testing (all flows)
20. ✅ **Day 4**: Performance optimization
21. ✅ **Day 5**: Documentation updates

---

## File Structure

```
src/
├── app/
│   ├── study/
│   │   └── page.tsx  (two-tab interface)
│   └── actions/
│       ├── stats.ts  (NEW - getStudyStats)
│       ├── decks.ts  (EXTEND - moveCardsToDeck, detailed stats)
│       └── study.ts  (EXTEND - createCustomStudySession)
│
├── components/
│   ├── flashcards/
│   │   ├── StudyStats.tsx  (NEW - reusable stats)
│   │   ├── StudyManagement.tsx  (NEW - management tab)
│   │   ├── DeckGrid.tsx  (NEW - deck browser)
│   │   ├── DeckCard.tsx  (NEW - individual deck card)
│   │   ├── CustomStudyBuilder.tsx  (NEW - filter builder)
│   │   ├── SessionComplete.tsx  (NEW - completion UI)
│   │   └── StudySession.tsx  (MODIFY - add completion)
│   │
│   └── sidebar/
│       ├── RightPanel.tsx  (MODIFY - add 7th tab)
│       └── CompactStudyTab.tsx  (NEW - sidebar study)
│
└── stores/
    └── flashcard-store.ts  (EXTEND - add deck stats cache)
```

---

## Testing Checklist

### Phase 1: Foundation
- [ ] StudyStats renders in compact mode
- [ ] StudyStats renders in expanded mode with graphs
- [ ] Stats accurate for global scope
- [ ] Stats accurate for deck scope
- [ ] Stats accurate for document scope
- [ ] Move cards between decks works
- [ ] Deck detailed stats calculated correctly
- [ ] Custom study filters return correct cards

### Phase 2: Study Management
- [ ] Study page shows two tabs
- [ ] Management tab loads deck grid
- [ ] Deck cards show correct stats
- [ ] "Study Now" on deck starts session
- [ ] Custom study builder shows filter options
- [ ] Preview count updates as filters change
- [ ] Custom session starts with filters applied

### Phase 3: Session Enhancements
- [ ] Session complete screen shows after last card
- [ ] Stats breakdown displays correctly
- [ ] "Study More" restarts session
- [ ] "Back to Management" returns to management tab
- [ ] "Back to Document" navigates to correct doc
- [ ] Session context preserved across flows

### Phase 4: Compact Study
- [ ] 7th tab appears in RightPanel
- [ ] Visible chunks option calculates correctly
- [ ] Nearby range slider works
- [ ] Full document option works
- [ ] Compact study session embeds correctly
- [ ] Returns to selection after completion

### Phase 5: Integration
- [ ] All flows work end-to-end
- [ ] No console errors
- [ ] Performance acceptable (<1s load)
- [ ] Mobile responsive
- [ ] Keyboard shortcuts work

---

## Edge Cases & Error Handling

### Empty States
- ✅ **No decks**: Show "Create your first deck" prompt
- ✅ **No cards in deck**: Show "Add cards to start studying"
- ✅ **No due cards**: Show "All caught up! Next review: [date]"
- ✅ **Custom filters match nothing**: Show "No cards match filters" with suggestions

### System Deck Protection
- ✅ **Delete system deck**: Show error "Cannot delete system decks"
- ✅ **Rename system deck**: Show warning "Renaming system deck not recommended"
- ✅ **Move system deck**: Disable parent selection for Inbox/Archive

### Deck Deletion with Cards
- ✅ **Delete deck with cards**: Show confirmation with card count
- ✅ **Option 1**: Move cards to Inbox (recommended)
- ✅ **Option 2**: Archive cards
- ✅ **Option 3**: Delete cards (permanent)

### Session Interruption
- ✅ **Close tab during session**: Save progress via beforeunload
- ✅ **Network error**: Retry review submission
- ✅ **Session timeout**: Auto-end after 30 min inactive

---

## Performance Considerations

### Query Optimization
1. **Use flashcards_cache** - Fast indexed queries instead of ECS joins
2. **Limit results** - Default 50 cards per query, pagination for large sets
3. **Debounce filters** - 300ms delay before preview update
4. **Cache deck stats** - Update only after modifications

### Component Optimization
1. **Virtualize deck grid** - Use react-window for >50 decks
2. **Lazy load graphs** - Only render when expanded mode visible
3. **Memoize stats** - React.memo on StudyStats component
4. **Batch updates** - Group zustand actions in single setState

### Database Indexes
```sql
-- Already exist from previous migrations
CREATE INDEX idx_flashcards_cache_user_due ON flashcards_cache(user_id, next_review);
CREATE INDEX idx_flashcards_cache_deck ON flashcards_cache(deck_id);
CREATE INDEX idx_flashcards_cache_document ON flashcards_cache(document_id);

-- NEW: For custom filters
CREATE INDEX idx_flashcards_cache_difficulty ON flashcards_cache(user_id, difficulty);
CREATE INDEX idx_flashcards_cache_created ON flashcards_cache(user_id, created_at);
CREATE INDEX idx_flashcards_cache_tags ON flashcards_cache USING GIN(tags);
```

---

## Future Enhancements (Post-MVP)

### Advanced Features
- **Study Plans**: Preset study schedules (e.g., "30 cards/day")
- **Deck Import/Export**: Share decks with others
- **Collaborative Decks**: Share decks within team
- **Gamification**: Achievements, leaderboards, streaks
- **Mobile App**: Native iOS/Android using same backend

### AI Enhancements
- **Smart Difficulty**: AI predicts card difficulty before first review
- **Personalized Prompts**: Generate prompts based on study history
- **Weak Point Detection**: Identify topic areas needing more focus
- **Content Suggestions**: Recommend new cards based on gaps

### Integration
- **Anki Sync**: Bidirectional sync with Anki desktop
- **Obsidian Plugin**: Inline flashcard review in Obsidian
- **Browser Extension**: Study cards in new tab
- **API**: Public API for third-party integrations

---

## Success Criteria

### Functional Requirements
- ✅ Users can browse all decks with stats
- ✅ Users can create/edit/delete custom decks
- ✅ Users can move cards between decks
- ✅ Users can create custom study sessions with 10+ filter types
- ✅ Users see comprehensive stats (global, deck, document levels)
- ✅ Users can study from sidebar without leaving reader
- ✅ Session completion shows detailed stats and navigation options

### UX Requirements
- ✅ No modals used (tabs, panels, sheets only)
- ✅ Consistent neobrutalist design system
- ✅ Keyboard shortcuts work everywhere
- ✅ Loading states for all async operations
- ✅ Clear empty states with actionable prompts

### Performance Requirements
- ✅ Study page loads in <1 second
- ✅ Deck grid renders 50+ decks smoothly
- ✅ Filter preview updates in <500ms
- ✅ Session transitions instantaneous

### Code Quality
- ✅ TypeScript strict mode (no any types)
- ✅ Zod validation for all server actions
- ✅ Component reusability (StudyStats, SessionComplete)
- ✅ Consistent patterns (Zustand Pattern 2, Server Actions)
- ✅ Comprehensive error handling

---

## Migration Path

### From Current State
1. ✅ **StudySession component exists** - Reuse for both modes
2. ✅ **Flashcard store exists** - Extend with deck stats
3. ✅ **Deck actions exist** - Add new CRUD operations
4. ✅ **Study actions exist** - Add custom filter support

### Breaking Changes
- ⚠️ **None** - All changes additive, backward compatible

### Data Migration
- ✅ **No data migration needed** - New columns optional
- ✅ **System decks unchanged** - Continue using Inbox/Archive
- ✅ **Existing sessions** - Continue working with new enhancements

---

## Documentation Updates

### Files to Update
1. ✅ `docs/FLASHCARD_SYSTEM.md` - Add study system section
2. ✅ `docs/USER_FLOW.md` - Add study workflows
3. ✅ `thoughts/testing/MANUAL_TESTING_GUIDE_FLASHCARD_SYSTEM.md` - Add study tests
4. ✅ `CLAUDE.md` - Update implementation status

### New Documentation
1. ✅ `docs/STUDY_SYSTEM.md` - Complete study system guide
2. ✅ `docs/DECK_MANAGEMENT.md` - Deck CRUD operations
3. ✅ `docs/CUSTOM_STUDY.md` - Filter guide and examples

---

## Conclusion

This implementation plan provides a **complete study system** that:
- ✅ **Respects design principles** (no modals, persistent UI)
- ✅ **Follows existing patterns** (Zustand Pattern 2, Server Actions)
- ✅ **Reuses components** (StudySession, stats across contexts)
- ✅ **Scales gracefully** (works for 10 or 10,000 cards)
- ✅ **Enables flexible study** (global, deck, document, custom filters)

**Estimated Timeline**: 5 weeks (1 developer)
**Complexity**: Medium-High (multiple integrated systems)
**Risk**: Low (incremental, backward compatible)

**Next Steps**:
1. Review and approve plan
2. Start Phase 1 (Foundation components)
3. Iterate based on user feedback

---

**Plan Version**: 1.0
**Last Updated**: 2025-10-24
**Status**: Ready for Implementation
