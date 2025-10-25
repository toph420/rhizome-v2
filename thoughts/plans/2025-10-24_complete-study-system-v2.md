# Complete Study System Implementation Plan v2

**Created**: 2025-10-24
**Status**: 📋 Ready for Implementation
**Priority**: High
**Estimated Time**: 7-10 days (1 developer)

---

## Overview

Transform `/study` into a comprehensive study management system with two-tab interface (Management/Session), full deck CRUD, custom study sessions, reusable stats component, and compact sidebar study. Built on existing StudySession foundation following Rhizome's no-modals persistent UI philosophy.

**Why**: Current study system only supports basic fullscreen review. Users need deck organization, flexible filtering, context-aware study (visible chunks, document scope), and detailed analytics.

---

## Current State Analysis

### What Exists ✅

**StudySession Component** (`src/components/flashcards/StudySession.tsx:81`):
- Fully functional with FSRS integration
- Supports fullscreen and compact display modes
- Keyboard shortcuts (Space, 1/2/3/4, Esc)
- Context filtering (deck, document, chunks, tags)
- Session tracking and stats updates

**Server Actions**:
- `startStudySession()` (`src/app/actions/study.ts:34`) - Creates session, fetches due cards
- `updateSessionStats()` (`src/app/actions/study.ts:114`) - Increments review counters via RPC
- `endStudySession()` (`src/app/actions/study.ts:148`) - Sets ended_at timestamp
- `createDeck()`, `getDecksWithStats()`, `updateDeck()`, `deleteDeck()` (`src/app/actions/decks.ts`)

**Database Schema**:
- `study_sessions` table (migration 065) - Tracks session analytics
- `decks` table (migration 063) - Hierarchical deck organization
- `flashcards_cache` table (migration 064) - Denormalized cache for fast queries

**Study Page** (`src/app/study/page.tsx:14`):
- Simple fullscreen wrapper using StudySession component
- No management UI, just immediate study

### What's Missing ❌

**UI Components**:
- Two-tab study page (Management/Session tabs)
- StudyStats reusable component (compact/expanded modes)
- DeckGrid browser with interactive DeckCard components
- CustomStudyBuilder with advanced filter UI
- SessionComplete screen with analytics breakdown
- CompactStudyTab for RightPanel (7th tab)

**Server Actions**:
- `getStudyStats()` with scope/timeRange parameters
- `createCustomStudySession()` with advanced filters
- `moveCardsToDeck()` batch operation
- `getDeckWithDetailedStats()` with retention rates

**Features**:
- Deck management interface
- Custom study filters (10+ types)
- Session completion screen
- Context-aware sidebar study
- Stats visualization

### Key Patterns Found

**Two-Tab Layouts**: UploadZone pattern (`src/components/library/UploadZone.tsx:600`)
```typescript
const [activeTab, setActiveTab] = useState<'format' | 'configure'>('format')
<Tabs value={activeTab} onValueChange={setActiveTab}>
  <TabsList className="grid w-full grid-cols-2">...</TabsList>
</Tabs>
```

**Grid Stats**: ScannerTab pattern (`src/components/admin/tabs/ScannerTab.tsx:229`)
```typescript
<div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
  <div className="border rounded-lg p-4">
    <div className="text-2xl font-bold">{stat}</div>
    <div className="text-sm text-muted-foreground">Label</div>
  </div>
</div>
```

**Feature-Rich Cards**: FlashcardCard pattern (`src/components/rhizome/flashcard-card.tsx:44`)
- Self-contained with internal state
- Keyboard shortcuts integrated
- Server action calls colocated
- No prop drilling

**RightPanel Tabs**: 7 tabs with icon-based triggers (`src/components/sidebar/RightPanel.tsx:33`)
```typescript
type TabId = 'connections' | 'annotations' | 'quality' | 'sparks' | 'cards' | 'review' | 'tune'
```

---

## Desired End State

Complete study system with:

1. **Two-Tab Study Page** (`/study`):
   - Management tab: Deck browser, custom study builder, stats
   - Session tab: Active study with completion screen

2. **Reusable StudyStats Component**:
   - Works in global/deck/document scopes
   - Compact mode (3-4 stats) and expanded mode (graphs, analytics)
   - Configurable display options

3. **Full Deck Management**:
   - Grid browser with DeckCard components
   - CRUD operations (create, edit, delete)
   - Move cards between decks (batch operation)
   - System deck protection (Inbox/Archive)

4. **Custom Study Builder**:
   - 10+ filter types (deck, document, chunks, tags, date ranges, difficulty, rating, status)
   - Live preview count
   - Save/load filter presets (future)

5. **Session Completion**:
   - Stats breakdown (ratings distribution, retention, time)
   - Smart navigation (back to management or originating document)
   - "Study More" quick restart

6. **Compact Sidebar Study** (RightPanel 7th tab):
   - Quick study from visible chunks
   - Nearby range selector (±N chunks)
   - Full document option
   - Embedded StudySession component

---

## Rhizome Architecture

- **Module**: Main App only (Next.js)
- **Storage**: Database only (source of truth: flashcards_cache, study_sessions, decks)
- **Migration**: No new migrations required (optional stats view for performance)
- **Test Tier**: Stable (fix when broken)
- **Pipeline Stages**: None
- **Engines**: Not applicable

---

## What We're NOT Doing

Scope discipline to prevent feature creep:

- ❌ **FSRS Algorithm Changes** - Current scheduling stays as-is
- ❌ **Gamification** - No achievements, leaderboards, streaks (beyond simple count)
- ❌ **Social Features** - No shared decks, collaborative study, leaderboards
- ❌ **Import/Export Formats** - No Anki sync, CSV import (out of scope)
- ❌ **AI Recommendations** - No "smart study order" or difficulty predictions
- ❌ **Mobile App** - Web-only, responsive but not native
- ❌ **Advanced Analytics** - No retention curves, forgetting index graphs
- ❌ **Deck Templates** - No preset deck structures or study plans

---

## Implementation Approach

**Incremental Development**:
1. Build foundation (stats, actions, store) first
2. Add management UI on top of foundation
3. Enhance existing session with completion screen
4. Integrate compact study into RightPanel last

**Patterns to Follow**:
- Server Components by default (matches existing Rhizome pattern)
- Server Actions for all mutations (no API routes)
- Zustand Pattern 2 (Server Actions + Store, like flashcard-store.ts)
- Feature-rich domain components (DeckCard self-contained like FlashcardCard)
- Reusable components (StudyStats works everywhere)

**Quality Gates**:
- Type check after each component
- Manual testing before next phase
- Keep sessions working throughout (no breaking changes)

---

## Phase 1: Foundation Components

**Goal**: Create reusable building blocks for stats, advanced filtering, and client state management.

**Estimated Time**: 1-2 days

---

### 1.1 Reusable StudyStats Component

**File**: `src/components/flashcards/StudyStats.tsx` (NEW)

**Purpose**: Configurable stats display for global/deck/document scopes in compact or expanded modes.

**Interface**:
```typescript
interface StudyStatsProps {
  // Data source
  scope: 'global' | 'deck' | 'document'
  scopeId?: string  // deckId or documentId when scoped

  // Display mode
  mode: 'compact' | 'expanded'

  // Display options (expanded mode)
  showRetention?: boolean    // Retention rate (Good+Easy / Total)
  showStreak?: boolean       // Study streak (consecutive days)
  showUpcoming?: boolean     // Due cards breakdown
  className?: string
}
```

**Implementation**:
```typescript
'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent } from '@/components/rhizome/card'
import { Badge } from '@/components/rhizome/badge'
import { Loader2 } from 'lucide-react'
import { getStudyStats } from '@/app/actions/stats'
import { cn } from '@/lib/utils'

export function StudyStats({
  scope,
  scopeId,
  mode,
  showRetention = true,
  showStreak = true,
  showUpcoming = true,
  className,
}: StudyStatsProps) {
  const [stats, setStats] = useState<StudyStatsData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadStats()
  }, [scope, scopeId])

  const loadStats = async () => {
    setLoading(true)
    const result = await getStudyStats({ scope, scopeId, timeRange: 'today' })
    if (result.success && result.stats) {
      setStats(result.stats)
    }
    setLoading(false)
  }

  if (loading) {
    return <Loader2 className="h-4 w-4 animate-spin" />
  }

  if (!stats) return null

  // Compact mode - 3-4 key stats in single row
  if (mode === 'compact') {
    return (
      <div className={cn("flex items-center gap-3", className)}>
        <div className="text-xs">
          <span className="font-semibold">{stats.reviewedToday}</span>
          <span className="text-muted-foreground ml-1">today</span>
        </div>
        <div className="text-xs">
          <span className="font-semibold text-orange-600">{stats.dueCount}</span>
          <span className="text-muted-foreground ml-1">due</span>
        </div>
        {showStreak && stats.streak > 0 && (
          <div className="text-xs">
            <span className="font-semibold">{stats.streak}</span>
            <span className="text-muted-foreground ml-1">day streak 🔥</span>
          </div>
        )}
      </div>
    )
  }

  // Expanded mode - full analytics grid
  return (
    <Card className={className}>
      <CardContent className="p-4 space-y-4">
        <h3 className="font-semibold">Study Statistics</h3>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard label="Today" value={stats.reviewedToday} color="blue" />
          <StatCard label="Due" value={stats.dueCount} color="orange" />
          {showRetention && (
            <StatCard
              label="Retention"
              value={`${Math.round(stats.retentionRate * 100)}%`}
              color="green"
            />
          )}
          {showStreak && (
            <StatCard label="Streak" value={`${stats.streak} days`} color="yellow" />
          )}
        </div>

        {/* Upcoming Reviews */}
        {showUpcoming && stats.upcomingReviews.length > 0 && (
          <div>
            <p className="text-xs text-muted-foreground mb-2">Upcoming Reviews</p>
            <div className="space-y-1">
              {stats.upcomingReviews.slice(0, 3).map((item) => (
                <div key={item.date} className="flex justify-between text-xs">
                  <span className="text-muted-foreground">{item.date}</span>
                  <span className="font-semibold">{item.count} cards</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// Helper component for stat cards
function StatCard({
  label,
  value,
  color
}: {
  label: string
  value: string | number
  color: 'green' | 'blue' | 'yellow' | 'orange'
}) {
  const colorClasses = {
    green: 'bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/20',
    blue: 'bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20',
    yellow: 'bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 border-yellow-500/20',
    orange: 'bg-orange-500/10 text-orange-700 dark:text-orange-400 border-orange-500/20'
  }

  return (
    <div className={cn('border rounded-lg p-3', colorClasses[color])}>
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  )
}
```

**Pattern**: Follows ChunkQualityPanel StatCard pattern (`src/components/sidebar/ChunkQualityPanel.tsx:26`)

---

### 1.2 Advanced Study Stats Server Action

**File**: `src/app/actions/stats.ts` (NEW)

**Purpose**: Fetch study statistics with flexible scoping and time ranges.

**Implementation**:
```typescript
'use server'

import { z } from 'zod'
import { getCurrentUser } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'

const GetStatsSchema = z.object({
  scope: z.enum(['global', 'deck', 'document']),
  scopeId: z.string().uuid().optional(),
  timeRange: z.enum(['today', 'week', 'month', 'all']).optional(),
})

export interface StudyStatsData {
  reviewedToday: number
  reviewedThisWeek: number
  dueCount: number
  retentionRate: number       // (Good + Easy) / Total
  avgTimePerCard: number      // milliseconds
  streak: number              // consecutive days studied
  upcomingReviews: Array<{
    date: string              // 'Today', 'Tomorrow', 'Fri Oct 25'
    count: number
  }>
}

/**
 * Get study statistics for global, deck, or document scope
 *
 * @example
 * // Global stats
 * getStudyStats({ scope: 'global', timeRange: 'week' })
 *
 * // Deck stats
 * getStudyStats({ scope: 'deck', scopeId: deckId })
 *
 * // Document stats
 * getStudyStats({ scope: 'document', scopeId: documentId })
 */
export async function getStudyStats(
  input: z.infer<typeof GetStatsSchema>
) {
  const user = await getCurrentUser()
  if (!user) throw new Error('Unauthorized')

  try {
    const validated = GetStatsSchema.parse(input)
    const supabase = createAdminClient()

    // Calculate date ranges
    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const weekAgo = new Date(today)
    weekAgo.setDate(weekAgo.getDate() - 7)

    // Base query for sessions
    let sessionsQuery = supabase
      .from('study_sessions')
      .select('*')
      .eq('user_id', user.id)

    // Apply scope filters
    if (validated.scope === 'deck' && validated.scopeId) {
      sessionsQuery = sessionsQuery.eq('deck_id', validated.scopeId)
    }
    // Note: document scope requires joining through flashcards_cache

    // Get sessions
    const { data: sessions } = await sessionsQuery

    // Calculate stats
    const todaySessions = sessions?.filter(s =>
      new Date(s.started_at) >= today
    ) || []

    const weekSessions = sessions?.filter(s =>
      new Date(s.started_at) >= weekAgo
    ) || []

    const reviewedToday = todaySessions.reduce((sum, s) =>
      sum + (s.cards_reviewed || 0), 0
    )

    const reviewedThisWeek = weekSessions.reduce((sum, s) =>
      sum + (s.cards_reviewed || 0), 0
    )

    // Calculate retention rate from ratings
    const totalRatings = weekSessions.reduce((sum, s) => {
      const ratings = s.ratings || { again: 0, hard: 0, good: 0, easy: 0 }
      return sum + ratings.again + ratings.hard + ratings.good + ratings.easy
    }, 0)

    const goodRatings = weekSessions.reduce((sum, s) => {
      const ratings = s.ratings || { again: 0, hard: 0, good: 0, easy: 0 }
      return sum + ratings.good + ratings.easy
    }, 0)

    const retentionRate = totalRatings > 0 ? goodRatings / totalRatings : 0

    // Calculate streak (consecutive days with at least 1 review)
    const streak = calculateStreak(sessions || [])

    // Get due cards count
    let dueQuery = supabase
      .from('flashcards_cache')
      .select('entity_id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('status', 'active')
      .lte('next_review', now.toISOString())

    if (validated.scope === 'deck' && validated.scopeId) {
      dueQuery = dueQuery.eq('deck_id', validated.scopeId)
    }
    if (validated.scope === 'document' && validated.scopeId) {
      dueQuery = dueQuery.eq('document_id', validated.scopeId)
    }

    const { count: dueCount } = await dueQuery

    // Get upcoming reviews (next 7 days)
    const upcomingReviews = await getUpcomingReviews(
      supabase,
      user.id,
      validated.scope,
      validated.scopeId
    )

    // Calculate average time per card
    const totalTime = weekSessions.reduce((sum, s) =>
      sum + (s.total_time_ms || 0), 0
    )
    const avgTimePerCard = reviewedThisWeek > 0
      ? totalTime / reviewedThisWeek
      : 0

    return {
      success: true,
      stats: {
        reviewedToday,
        reviewedThisWeek,
        dueCount: dueCount || 0,
        retentionRate,
        avgTimePerCard,
        streak,
        upcomingReviews,
      } as StudyStatsData
    }

  } catch (error) {
    console.error('[Stats] Get stats failed:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

/**
 * Calculate study streak (consecutive days with reviews)
 */
function calculateStreak(sessions: any[]): number {
  if (sessions.length === 0) return 0

  // Group sessions by date
  const dateSet = new Set<string>()
  sessions.forEach(s => {
    const date = new Date(s.started_at)
    const dateStr = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
    dateSet.add(dateStr)
  })

  const dates = Array.from(dateSet).sort().reverse()

  // Count consecutive days from today
  const today = new Date()
  let streak = 0
  let checkDate = new Date(today)

  for (let i = 0; i < dates.length; i++) {
    const dateStr = `${checkDate.getFullYear()}-${checkDate.getMonth()}-${checkDate.getDate()}`
    if (dates.includes(dateStr)) {
      streak++
      checkDate.setDate(checkDate.getDate() - 1)
    } else {
      break
    }
  }

  return streak
}

/**
 * Get upcoming review counts for next 7 days
 */
async function getUpcomingReviews(
  supabase: any,
  userId: string,
  scope: 'global' | 'deck' | 'document',
  scopeId?: string
) {
  const now = new Date()
  const upcoming: Array<{ date: string; count: number }> = []

  for (let i = 0; i < 7; i++) {
    const date = new Date(now)
    date.setDate(date.getDate() + i)
    const startOfDay = new Date(date.getFullYear(), date.getMonth(), date.getDate())
    const endOfDay = new Date(startOfDay)
    endOfDay.setDate(endOfDay.getDate() + 1)

    let query = supabase
      .from('flashcards_cache')
      .select('entity_id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('status', 'active')
      .gte('next_review', startOfDay.toISOString())
      .lt('next_review', endOfDay.toISOString())

    if (scope === 'deck' && scopeId) {
      query = query.eq('deck_id', scopeId)
    }
    if (scope === 'document' && scopeId) {
      query = query.eq('document_id', scopeId)
    }

    const { count } = await query

    if (count && count > 0) {
      const dateLabel = i === 0 ? 'Today' :
                        i === 1 ? 'Tomorrow' :
                        date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })

      upcoming.push({ date: dateLabel, count })
    }
  }

  return upcoming
}
```

**Pattern**: Similar to existing study.ts actions with Zod validation

---

### 1.3 Custom Study Session Server Action

**File**: `src/app/actions/study.ts` (EXTEND)

**Purpose**: Add advanced filtering support to existing startStudySession.

**Changes**:
```typescript
// Add to existing StartSessionSchema
const StartSessionSchema = z.object({
  deckId: z.string().uuid().optional(),
  documentId: z.string().uuid().optional(),
  chunkIds: z.array(z.string().uuid()).optional(),
  limit: z.number().int().min(1).max(100).optional(),
  dueOnly: z.boolean().optional(),
  filters: z.object({
    tags: z.array(z.string()).optional(),
    // NEW: Advanced filters
    dateRange: z.object({
      start: z.string().datetime(),
      end: z.string().datetime(),
      field: z.enum(['created_at', 'last_review', 'next_review']),
    }).optional(),
    status: z.array(z.enum(['draft', 'active', 'suspended'])).optional(),
    difficulty: z.object({
      min: z.number().min(0).max(10),
      max: z.number().min(0).max(10),
    }).optional(),
    rating: z.object({
      include: z.array(z.number().min(1).max(4)),  // Last rating filter
    }).optional(),
    notStudiedYet: z.boolean().optional(),
    failedCards: z.boolean().optional(),  // Rated Again (1) recently
  }).optional(),
})

// Modify startStudySession to apply advanced filters
export async function startStudySession(input: z.infer<typeof StartSessionSchema>) {
  // ... existing user auth and session creation ...

  // Base query (existing)
  let query = supabase
    .from('flashcards_cache')
    .select('*')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .order('next_review', { ascending: true })
    .limit(validated.limit || 50)

  // Existing filters (deck, document, chunks, tags)
  // ...

  // NEW: Advanced filters
  if (validated.filters) {
    const f = validated.filters

    // Date range filter
    if (f.dateRange) {
      const field = f.dateRange.field === 'last_review' ? 'updated_at' : f.dateRange.field
      query = query
        .gte(field, f.dateRange.start)
        .lte(field, f.dateRange.end)
    }

    // Status filter (override default 'active')
    if (f.status && f.status.length > 0) {
      query = query.in('status', f.status)
    }

    // Difficulty range
    if (f.difficulty) {
      query = query
        .gte('difficulty', f.difficulty.min)
        .lte('difficulty', f.difficulty.max)
    }

    // Not studied yet (no last_review)
    if (f.notStudiedYet) {
      query = query.is('last_review', null)
    }

    // Failed cards (need to check study_sessions for recent Again ratings)
    // Note: This requires additional query since rating history is in sessions
    if (f.failedCards) {
      // Get cards that were rated Again in last 7 days
      const weekAgo = new Date()
      weekAgo.setDate(weekAgo.getDate() - 7)

      // This would require joining with study sessions or tracking last rating in cache
      // For MVP, we can filter client-side or add last_rating to flashcards_cache
    }
  }

  const { data: cards, error: cardsError } = await query
  // ... rest of existing code
}
```

**Note**: Some advanced filters (like `failedCards`) may require schema changes or client-side filtering for MVP.

---

### 1.4 Deck Advanced Server Actions

**File**: `src/app/actions/decks.ts` (EXTEND)

**Purpose**: Add batch card movement and detailed stats.

**New Actions**:
```typescript
/**
 * Move cards between decks (batch operation)
 */
export async function moveCardsToDeck(
  cardIds: string[],
  targetDeckId: string
) {
  const user = await getCurrentUser()
  if (!user) throw new Error('Unauthorized')

  try {
    const supabase = createAdminClient()
    const { createECS } = await import('@/lib/ecs')
    const ecs = createECS()

    // Update Card component for each flashcard
    for (const cardId of cardIds) {
      // Get existing Card component
      const { data: cardComponent } = await supabase
        .from('components')
        .select('*')
        .eq('entity_id', cardId)
        .eq('component_type', 'Card')
        .single()

      if (!cardComponent) continue

      // Update deck_id in component data
      const updatedData = {
        ...cardComponent.component_data,
        deckId: targetDeckId,
        deckAddedAt: new Date().toISOString(),
      }

      await supabase
        .from('components')
        .update({ component_data: updatedData })
        .eq('id', cardComponent.id)
    }

    // Rebuild cache to reflect deck changes
    await supabase.rpc('rebuild_flashcards_cache', {
      p_user_id: user.id,
    })

    revalidatePath('/study')
    revalidatePath('/flashcards')

    return { success: true, movedCount: cardIds.length }

  } catch (error) {
    console.error('[Decks] Move cards failed:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

/**
 * Get deck with detailed stats (retention rate, avg rating, last studied)
 */
export async function getDeckWithDetailedStats(deckId: string) {
  const user = await getCurrentUser()
  if (!user) throw new Error('Unauthorized')

  try {
    const supabase = createAdminClient()

    // Get deck
    const { data: deck, error: deckError } = await supabase
      .from('decks')
      .select('*')
      .eq('id', deckId)
      .eq('user_id', user.id)
      .single()

    if (deckError) throw deckError

    // Get cards for this deck
    const { data: cards } = await supabase
      .from('flashcards_cache')
      .select('*')
      .eq('user_id', user.id)
      .eq('deck_id', deckId)

    const now = new Date().toISOString()

    const stats = {
      totalCards: cards?.length || 0,
      draftCards: cards?.filter(c => c.status === 'draft').length || 0,
      activeCards: cards?.filter(c => c.status === 'active').length || 0,
      dueCards: cards?.filter(c => c.status === 'active' && c.next_review && c.next_review <= now).length || 0,
      avgDifficulty: cards?.length ? cards.reduce((sum, c) => sum + (c.difficulty || 0), 0) / cards.length : 0,
      // Note: Retention rate requires study_sessions join - calculate from last 30 days of reviews
      retentionRate: 0,  // TODO: Calculate from sessions
      lastStudied: null as Date | null,  // TODO: Get from most recent session
    }

    return {
      success: true,
      deck,
      stats,
    }

  } catch (error) {
    console.error('[Decks] Get detailed stats failed:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}
```

---

### 1.5 Study Zustand Store

**File**: `src/stores/study-store.ts` (NEW)

**Purpose**: Client-side state management for study UI (follows flashcard-store pattern).

**Implementation**:
```typescript
import { create } from 'zustand'

interface SessionContext {
  deckId?: string
  deckName?: string
  documentId?: string
  documentTitle?: string
  filters?: CustomStudyFilters
  returnTo: 'management' | { type: 'document'; id: string; title: string }
}

interface CustomStudyFilters {
  deckId?: string
  documentId?: string
  chunkIds?: string[]
  tags?: string[]
  dateRange?: {
    start: Date
    end: Date
    field: 'created_at' | 'last_review' | 'next_review'
  }
  status?: ('draft' | 'active' | 'suspended')[]
  difficulty?: { min: number; max: number }
  notStudiedYet?: boolean
  failedCards?: boolean
}

interface StudyStore {
  // Current session context
  sessionContext: SessionContext | null
  setSessionContext: (context: SessionContext | null) => void

  // Custom study builder state
  customFilters: CustomStudyFilters
  setCustomFilters: (filters: CustomStudyFilters) => void
  resetCustomFilters: () => void

  // Preview count for custom study
  previewCount: number
  setPreviewCount: (count: number) => void

  // Active deck in grid
  activeDeckId: string | null
  setActiveDeckId: (deckId: string | null) => void
}

export const useStudyStore = create<StudyStore>((set) => ({
  sessionContext: null,
  setSessionContext: (context) => set({ sessionContext: context }),

  customFilters: {},
  setCustomFilters: (filters) => set({ customFilters: filters }),
  resetCustomFilters: () => set({ customFilters: {} }),

  previewCount: 0,
  setPreviewCount: (count) => set({ previewCount: count }),

  activeDeckId: null,
  setActiveDeckId: (deckId) => set({ activeDeckId: deckId }),
}))
```

**Pattern**: Matches `src/stores/flashcard-store.ts` exactly (simple state + setters)

---

### Success Criteria - Phase 1

#### Automated Verification:
- [ ] Type check passes: `npm run type-check`
- [ ] Build succeeds: `npm run build`
- [ ] No console errors when importing new files

#### Manual Verification:
- [ ] StudyStats component renders in both compact and expanded modes
- [ ] getStudyStats() returns correct data for global scope
- [ ] getStudyStats() returns correct data for deck scope
- [ ] Advanced filters apply correctly in startStudySession
- [ ] moveCardsToDeck updates cache correctly
- [ ] Zustand store state updates work

**Implementation Note**: Pause after automated verification passes. Test each component in isolation before proceeding to Phase 2.

### Service Restarts:
- [ ] Next.js: Auto-reload should handle new files
- [ ] Supabase: No schema changes, no restart needed

---

## Phase 2: Study Management Tab

**Goal**: Build deck browsing and custom study UI on top of foundation components.

**Estimated Time**: 2-3 days

---

### 2.1 Refactor Study Page Structure

**File**: `src/app/study/page.tsx` (MODIFY)

**Purpose**: Transform simple fullscreen wrapper into two-tab interface (Management/Session).

**Implementation**:
```typescript
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/rhizome/tabs'
import { StudyManagement } from '@/components/flashcards/StudyManagement'
import { StudySession } from '@/components/flashcards/StudySession'
import { useStudyStore } from '@/stores/study-store'

type StudyTab = 'management' | 'session'

/**
 * Study page with two-tab interface
 *
 * **Management Tab**: Deck browser, custom study builder, stats
 * **Session Tab**: Active study with completion screen
 */
export default function StudyPage() {
  const router = useRouter()
  const { sessionContext, setSessionContext } = useStudyStore()
  const [activeTab, setActiveTab] = useState<StudyTab>('management')

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
      const doc = sessionContext.returnTo as { type: 'document'; id: string; title: string }
      router.push(`/read/${doc.id}`)
    } else {
      // Back to management tab
      setActiveTab('management')
      setSessionContext(null)
    }
  }

  return (
    <div className="h-screen flex flex-col">
      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as StudyTab)}
        className="flex-1 flex flex-col"
      >
        <TabsList className="grid w-full grid-cols-2 border-b-2 border-border">
          <TabsTrigger value="management">Management</TabsTrigger>
          <TabsTrigger value="session" disabled={!sessionContext}>
            Study Session
            {sessionContext && (
              <span className="ml-2 text-xs text-muted-foreground">
                ({sessionContext.deckName || 'Custom'})
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="management" className="flex-1 overflow-hidden m-0">
          <StudyManagement onStartStudy={handleStartStudy} />
        </TabsContent>

        <TabsContent value="session" className="flex-1 overflow-hidden m-0">
          {sessionContext && (
            <StudySession
              deckId={sessionContext.deckId}
              documentId={sessionContext.documentId}
              chunkIds={sessionContext.filters?.chunkIds}
              tags={sessionContext.filters?.tags}
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

**Pattern**: Follows UploadZone two-tab pattern (`src/components/library/UploadZone.tsx:600`)

---

### 2.2 Study Management Component

**File**: `src/components/flashcards/StudyManagement.tsx` (NEW)

**Purpose**: Container for deck browser, custom study, and stats.

**Implementation**:
```typescript
'use client'

import { useEffect, useState } from 'react'
import { ScrollArea } from '@/components/rhizome/scroll-area'
import { StudyStats } from './StudyStats'
import { DeckGrid } from './DeckGrid'
import { CustomStudyBuilder } from './CustomStudyBuilder'
import type { SessionContext } from '@/stores/study-store'

interface StudyManagementProps {
  onStartStudy: (context: SessionContext) => void
}

export function StudyManagement({ onStartStudy }: StudyManagementProps) {
  return (
    <ScrollArea className="h-full">
      <div className="p-6 space-y-6 max-w-7xl mx-auto">
        {/* Global Stats */}
        <StudyStats
          scope="global"
          mode="expanded"
          showRetention
          showStreak
          showUpcoming
        />

        {/* Deck Browser */}
        <div>
          <h2 className="text-xl font-bold mb-4">My Decks</h2>
          <DeckGrid
            onStudyDeck={(deckId, deckName) =>
              onStartStudy({
                deckId,
                deckName,
                returnTo: 'management',
              })
            }
          />
        </div>

        {/* Custom Study Builder */}
        <div>
          <h2 className="text-xl font-bold mb-4">Custom Study</h2>
          <CustomStudyBuilder
            onStartSession={(filters) =>
              onStartStudy({
                filters,
                returnTo: 'management',
              })
            }
          />
        </div>
      </div>
    </ScrollArea>
  )
}
```

**Pattern**: Simple container component, follows existing Rhizome patterns

---

### 2.3 DeckGrid Component

**File**: `src/components/flashcards/DeckGrid.tsx` (NEW)

**Purpose**: Responsive grid of DeckCard components with stats.

**Implementation**:
```typescript
'use client'

import { useEffect, useState } from 'react'
import { Plus, Loader2 } from 'lucide-react'
import { Button } from '@/components/rhizome/button'
import { Card, CardContent } from '@/components/rhizome/card'
import { DeckCard } from '@/components/rhizome/deck-card'
import { getDecksWithStats } from '@/app/actions/decks'
import { useStudyStore } from '@/stores/study-store'

interface DeckGridProps {
  onStudyDeck: (deckId: string, deckName: string) => void
}

export function DeckGrid({ onStudyDeck }: DeckGridProps) {
  const [decks, setDecks] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const { activeDeckId, setActiveDeckId } = useStudyStore()

  useEffect(() => {
    loadDecks()
  }, [])

  const loadDecks = async () => {
    setLoading(true)
    const result = await getDecksWithStats()
    setDecks(result || [])
    setLoading(false)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (decks.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="p-6 text-center space-y-3">
          <div className="flex justify-center">
            <div className="p-3 rounded-full bg-blue-100 dark:bg-blue-900/20">
              <Plus className="h-6 w-6 text-blue-600 dark:text-blue-400" />
            </div>
          </div>
          <div>
            <h3 className="font-semibold mb-1">No Decks Yet</h3>
            <p className="text-sm text-muted-foreground">
              Create your first deck to organize flashcards
            </p>
          </div>
          <Button onClick={() => {/* TODO: Open create deck dialog */}}>
            Create Deck
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      {/* Create New Deck Button */}
      <div className="flex justify-end">
        <Button
          variant="outline"
          onClick={() => {/* TODO: Open create deck dialog */}}
        >
          <Plus className="h-4 w-4 mr-2" />
          New Deck
        </Button>
      </div>

      {/* Deck Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {decks.map((deck) => (
          <DeckCard
            key={deck.id}
            deck={deck}
            isActive={activeDeckId === deck.id}
            onClick={() => setActiveDeckId(deck.id)}
            onStudy={() => onStudyDeck(deck.id, deck.name)}
            onRefresh={loadDecks}
          />
        ))}
      </div>
    </div>
  )
}
```

**Pattern**: Similar to FlashcardsListClient grid layout

---

### 2.4 DeckCard Feature-Rich Component

**File**: `src/components/rhizome/deck-card.tsx` (NEW)

**Purpose**: Self-contained deck card with stats, actions, keyboard shortcuts.

**Implementation**:
```typescript
'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent } from '@/components/rhizome/card'
import { Button } from '@/components/rhizome/button'
import { Badge } from '@/components/rhizome/badge'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/rhizome/dropdown-menu'
import { MoreVertical, Play, Edit, Trash, Archive } from 'lucide-react'
import { deleteDeck, updateDeck } from '@/app/actions/decks'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

interface DeckCardProps {
  deck: {
    id: string
    name: string
    description: string | null
    is_system: boolean
    total_cards: number
    draft_cards: number
    active_cards: number
  }
  isActive: boolean
  onClick: () => void
  onStudy: () => void
  onRefresh: () => void
}

/**
 * Feature-rich deck card component
 *
 * **Features**:
 * - Stats display (total, active, draft cards)
 * - Study action button
 * - Dropdown menu (edit, delete, move cards)
 * - System deck protection
 * - Keyboard shortcuts when active
 *
 * **Pattern**: Self-contained like FlashcardCard (no prop drilling)
 */
export function DeckCard({
  deck,
  isActive,
  onClick,
  onStudy,
  onRefresh,
}: DeckCardProps) {
  const [isDeleting, setIsDeleting] = useState(false)

  // Keyboard shortcuts when active
  useEffect(() => {
    if (!isActive) return

    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return
      }

      switch (e.key) {
        case 's':
          e.preventDefault()
          onStudy()
          break
        case 'd':
          if (e.metaKey || e.ctrlKey) {
            e.preventDefault()
            handleDelete()
          }
          break
      }
    }

    window.addEventListener('keydown', handleKeyPress)
    return () => window.removeEventListener('keydown', handleKeyPress)
  }, [isActive, deck.id])

  const handleDelete = async () => {
    if (deck.is_system) {
      toast.error('Cannot delete system deck')
      return
    }

    if (!confirm(`Delete deck "${deck.name}"? ${deck.total_cards} cards will be moved to Inbox.`)) {
      return
    }

    setIsDeleting(true)
    try {
      const result = await deleteDeck(deck.id)
      if (result.success) {
        toast.success('Deck deleted')
        onRefresh()
      } else {
        toast.error(result.error || 'Failed to delete deck')
      }
    } catch (error) {
      toast.error('Failed to delete deck')
    } finally {
      setIsDeleting(false)
    }
  }

  const hasDueCards = deck.active_cards > 0

  return (
    <Card
      className={cn(
        'cursor-pointer transition-all',
        isActive && 'ring-2 ring-primary'
      )}
      onClick={onClick}
    >
      <CardContent className="p-4 space-y-3">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <h3 className="font-semibold">{deck.name}</h3>
            {deck.description && (
              <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                {deck.description}
              </p>
            )}
          </div>
          {deck.is_system && (
            <Badge variant="neutral" className="ml-2 text-xs">
              System
            </Badge>
          )}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="border rounded p-2">
            <div className="text-lg font-bold">{deck.total_cards}</div>
            <div className="text-xs text-muted-foreground">Total</div>
          </div>
          <div className="border rounded p-2">
            <div className="text-lg font-bold text-green-600">{deck.active_cards}</div>
            <div className="text-xs text-muted-foreground">Active</div>
          </div>
          <div className="border rounded p-2">
            <div className="text-lg font-bold text-orange-600">{deck.draft_cards}</div>
            <div className="text-xs text-muted-foreground">Draft</div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            className="flex-1"
            onClick={(e) => {
              e.stopPropagation()
              onStudy()
            }}
            disabled={!hasDueCards}
          >
            <Play className="h-3 w-3 mr-1" />
            Study{isActive && ' (S)'}
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
              <Button size="sm" variant="ghost">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => {/* TODO: Edit deck */}}>
                <Edit className="h-4 w-4 mr-2" />
                Edit Deck
              </DropdownMenuItem>
              {!deck.is_system && (
                <DropdownMenuItem
                  onClick={handleDelete}
                  disabled={isDeleting}
                  className="text-red-600"
                >
                  <Trash className="h-4 w-4 mr-2" />
                  Delete Deck
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={() => {/* TODO: Move cards */}}>
                <Archive className="h-4 w-4 mr-2" />
                Move Cards
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardContent>
    </Card>
  )
}
```

**Pattern**: Feature-rich self-contained component (matches FlashcardCard pattern)

---

### 2.5 Custom Study Builder Component

**File**: `src/components/flashcards/CustomStudyBuilder.tsx` (NEW)

**Purpose**: Advanced filter UI with live preview count.

**Implementation**:
```typescript
'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent } from '@/components/rhizome/card'
import { Button } from '@/components/rhizome/button'
import { Label } from '@/components/rhizome/label'
import { Input } from '@/components/rhizome/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/rhizome/select'
import { Badge } from '@/components/rhizome/badge'
import { Filter } from 'lucide-react'
import { useStudyStore } from '@/stores/study-store'
import { startStudySession } from '@/app/actions/study'
import type { CustomStudyFilters } from '@/stores/study-store'

interface CustomStudyBuilderProps {
  onStartSession: (filters: CustomStudyFilters) => void
}

export function CustomStudyBuilder({ onStartSession }: CustomStudyBuilderProps) {
  const { customFilters, setCustomFilters, resetCustomFilters, previewCount, setPreviewCount } = useStudyStore()
  const [isLoading, setIsLoading] = useState(false)

  // Debounced preview update
  useEffect(() => {
    const timer = setTimeout(async () => {
      await updatePreview()
    }, 300)
    return () => clearTimeout(timer)
  }, [customFilters])

  const updatePreview = async () => {
    try {
      // Get count without creating session
      const result = await startStudySession({
        ...customFilters,
        limit: 1,  // Just get count
        dueOnly: false,
      })

      if (result.success && result.cards) {
        // TODO: Use actual count from query
        setPreviewCount(result.cards.length)
      }
    } catch (error) {
      console.error('Preview update failed:', error)
    }
  }

  const handleStartSession = () => {
    if (previewCount === 0) {
      return
    }
    onStartSession(customFilters)
  }

  return (
    <Card>
      <CardContent className="p-4 space-y-4">
        <div className="flex items-center gap-2 mb-2">
          <Filter className="h-4 w-4" />
          <h3 className="font-semibold">Advanced Filters</h3>
        </div>

        {/* Deck Filter */}
        <div>
          <Label className="text-xs text-muted-foreground mb-2">Deck</Label>
          <Select
            value={customFilters.deckId}
            onValueChange={(deckId) => setCustomFilters({ ...customFilters, deckId })}
          >
            <SelectTrigger>
              <SelectValue placeholder="All Decks" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Decks</SelectItem>
              {/* TODO: Load deck list */}
            </SelectContent>
          </Select>
        </div>

        {/* Tags Filter */}
        <div>
          <Label className="text-xs text-muted-foreground mb-2">Tags</Label>
          <div className="flex flex-wrap gap-2">
            {customFilters.tags?.map((tag) => (
              <Badge
                key={tag}
                variant="neutral"
                className="cursor-pointer"
                onClick={() =>
                  setCustomFilters({
                    ...customFilters,
                    tags: customFilters.tags?.filter((t) => t !== tag),
                  })
                }
              >
                {tag} ×
              </Badge>
            ))}
            <Button
              size="sm"
              variant="outline"
              onClick={() => {/* TODO: Add tag input */}}
            >
              + Add Tag
            </Button>
          </div>
        </div>

        {/* Difficulty Range */}
        <div>
          <Label className="text-xs text-muted-foreground mb-2">
            Difficulty: {customFilters.difficulty?.min || 0} - {customFilters.difficulty?.max || 10}
          </Label>
          <div className="flex gap-2">
            <Input
              type="number"
              min={0}
              max={10}
              value={customFilters.difficulty?.min || 0}
              onChange={(e) =>
                setCustomFilters({
                  ...customFilters,
                  difficulty: {
                    min: parseInt(e.target.value),
                    max: customFilters.difficulty?.max || 10,
                  },
                })
              }
              className="w-20"
            />
            <Input
              type="number"
              min={0}
              max={10}
              value={customFilters.difficulty?.max || 10}
              onChange={(e) =>
                setCustomFilters({
                  ...customFilters,
                  difficulty: {
                    min: customFilters.difficulty?.min || 0,
                    max: parseInt(e.target.value),
                  },
                })
              }
              className="w-20"
            />
          </div>
        </div>

        {/* Quick Filters */}
        <div>
          <Label className="text-xs text-muted-foreground mb-2">Quick Filters</Label>
          <div className="flex flex-wrap gap-2">
            <Badge
              variant={customFilters.notStudiedYet ? 'default' : 'neutral'}
              className="cursor-pointer"
              onClick={() =>
                setCustomFilters({
                  ...customFilters,
                  notStudiedYet: !customFilters.notStudiedYet,
                })
              }
            >
              Not Studied Yet
            </Badge>
            <Badge
              variant={customFilters.failedCards ? 'default' : 'neutral'}
              className="cursor-pointer"
              onClick={() =>
                setCustomFilters({
                  ...customFilters,
                  failedCards: !customFilters.failedCards,
                })
              }
            >
              Failed Cards
            </Badge>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between pt-2 border-t">
          <div className="text-sm text-muted-foreground">
            {previewCount} card{previewCount !== 1 ? 's' : ''} match
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={resetCustomFilters}>
              Reset
            </Button>
            <Button onClick={handleStartSession} disabled={previewCount === 0}>
              Start Session
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
```

**Pattern**: Filter UI similar to FlashcardsListClient select pattern

---

### Success Criteria - Phase 2

#### Automated Verification:
- [ ] Type check passes: `npm run type-check`
- [ ] Build succeeds: `npm run build`
- [ ] `/study` page loads without errors

#### Manual Verification:
- [ ] Study page shows two tabs (Management/Session)
- [ ] Management tab displays deck grid
- [ ] DeckCard components show correct stats
- [ ] "Study Now" button on deck starts session
- [ ] Custom study builder shows filter options
- [ ] Preview count updates as filters change
- [ ] Custom session starts with filters applied
- [ ] System decks have "System" badge and cannot be deleted

**Implementation Note**: Test deck browsing and filtering thoroughly before proceeding.

### Service Restarts:
- [ ] Next.js: Auto-reload should handle changes

---

## Phase 3: Session Enhancements

**Goal**: Add completion screen and context-aware navigation to existing StudySession.

**Estimated Time**: 1-2 days

---

### 3.1 SessionComplete Component

**File**: `src/components/flashcards/SessionComplete.tsx` (NEW)

**Purpose**: Completion screen with stats breakdown and smart navigation.

**Implementation**:
```typescript
'use client'

import { Card, CardContent } from '@/components/rhizome/card'
import { Button } from '@/components/rhizome/button'
import { Badge } from '@/components/rhizome/badge'
import { CheckCircle } from 'lucide-react'

interface SessionStats {
  reviewedCount: number
  timeSpentMs: number
  againCount: number
  hardCount: number
  goodCount: number
  easyCount: number
}

interface SessionCompleteProps {
  stats: SessionStats
  onStudyMore: () => void
  onExit: () => void
  returnTo?: 'management' | { type: 'document'; id: string; title: string }
}

/**
 * Session completion screen with analytics and navigation
 *
 * **Features**:
 * - Rating breakdown visualization
 * - Retention calculation
 * - Time summary
 * - Smart navigation (back to management or document)
 * - "Study More" quick restart
 */
export function SessionComplete({
  stats,
  onStudyMore,
  onExit,
  returnTo,
}: SessionCompleteProps) {
  const totalRatings = stats.againCount + stats.hardCount + stats.goodCount + stats.easyCount
  const retention = totalRatings > 0
    ? ((stats.goodCount + stats.easyCount) / totalRatings) * 100
    : 0

  const timeMinutes = Math.floor(stats.timeSpentMs / 60000)
  const timeSeconds = Math.floor((stats.timeSpentMs % 60000) / 1000)

  return (
    <div className="flex items-center justify-center min-h-screen p-6">
      <Card className="w-full max-w-2xl">
        <CardContent className="p-8 space-y-6">
          {/* Success Icon */}
          <div className="flex justify-center">
            <div className="p-4 rounded-full bg-green-100 dark:bg-green-900/20">
              <CheckCircle className="h-12 w-12 text-green-600 dark:text-green-400" />
            </div>
          </div>

          {/* Header */}
          <div className="text-center">
            <h2 className="text-2xl font-bold mb-2">Session Complete!</h2>
            <p className="text-muted-foreground">
              You reviewed {stats.reviewedCount} card{stats.reviewedCount !== 1 ? 's' : ''} in{' '}
              {timeMinutes > 0 && `${timeMinutes} min `}
              {timeSeconds}s
            </p>
          </div>

          {/* Ratings Breakdown */}
          <div className="space-y-3">
            <h3 className="font-semibold text-center">Ratings Breakdown</h3>

            {/* Visual bars */}
            <div className="space-y-2">
              {stats.againCount > 0 && (
                <RatingBar
                  label="Again"
                  count={stats.againCount}
                  total={totalRatings}
                  color="bg-red-500"
                />
              )}
              {stats.hardCount > 0 && (
                <RatingBar
                  label="Hard"
                  count={stats.hardCount}
                  total={totalRatings}
                  color="bg-yellow-500"
                />
              )}
              {stats.goodCount > 0 && (
                <RatingBar
                  label="Good"
                  count={stats.goodCount}
                  total={totalRatings}
                  color="bg-blue-500"
                />
              )}
              {stats.easyCount > 0 && (
                <RatingBar
                  label="Easy"
                  count={stats.easyCount}
                  total={totalRatings}
                  color="bg-green-500"
                />
              )}
            </div>

            {/* Retention */}
            <div className="text-center pt-2 border-t">
              <p className="text-sm text-muted-foreground">Retention Rate</p>
              <p className="text-3xl font-bold text-green-600">
                {Math.round(retention)}%
              </p>
              <p className="text-xs text-muted-foreground">
                ({stats.goodCount + stats.easyCount} Good/Easy out of {totalRatings})
              </p>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-4">
            <Button
              variant="outline"
              className="flex-1"
              onClick={onStudyMore}
            >
              Study More
            </Button>
            <Button
              className="flex-1"
              onClick={onExit}
            >
              {returnTo === 'management'
                ? 'Back to Management'
                : returnTo?.type === 'document'
                ? `Back to "${returnTo.title}"`
                : 'Done'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

/**
 * Rating bar visualization
 */
function RatingBar({
  label,
  count,
  total,
  color,
}: {
  label: string
  count: number
  total: number
  color: string
}) {
  const percentage = (count / total) * 100

  return (
    <div>
      <div className="flex items-center justify-between text-sm mb-1">
        <span className="font-medium">{label}</span>
        <span className="text-muted-foreground">
          {count} ({Math.round(percentage)}%)
        </span>
      </div>
      <div className="h-2 bg-muted rounded-full overflow-hidden">
        <div
          className={`h-full ${color} transition-all`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  )
}
```

**Pattern**: Success state pattern from ChunkQualityPanel (`src/components/sidebar/ChunkQualityPanel.tsx:583`)

---

### 3.2 Modify StudySession for Completion

**File**: `src/components/flashcards/StudySession.tsx` (MODIFY)

**Purpose**: Integrate SessionComplete component after last card.

**Changes**:
```typescript
// Add import
import { SessionComplete } from './SessionComplete'
import { getSessionStats } from '@/app/actions/study'

// Add state
const [sessionComplete, setSessionComplete] = useState(false)
const [sessionStats, setSessionStats] = useState<SessionStats | null>(null)

// Modify handleRate (inside the "move to next" logic)
if (currentIndex >= session.cards.length - 1) {
  // Last card - fetch stats and show completion
  await endStudySession(session.id)

  const statsResult = await getSessionStats(session.id)
  if (statsResult.success && statsResult.stats) {
    setSessionStats({
      reviewedCount: statsResult.stats.reviewedCount,
      timeSpentMs: newTotalTime,
      againCount: statsResult.stats.againCount,
      hardCount: statsResult.stats.hardCount,
      goodCount: statsResult.stats.goodCount,
      easyCount: statsResult.stats.easyCount,
    })
  }

  setSessionComplete(true)
} else {
  // More cards remain
  setCurrentIndex(i => i + 1)
  setRevealed(false)
  setReviewStartTime(Date.now())
}

// Add to render (replace early return for no cards)
if (sessionComplete && sessionStats) {
  return (
    <SessionComplete
      stats={sessionStats}
      onStudyMore={() => {
        // Reset and start new session
        setSessionComplete(false)
        setSessionStats(null)
        setCurrentIndex(0)
        setRevealed(false)
        setTotalTimeSpent(0)
        setReviewStartTime(Date.now())
        initSession()  // Fetch new cards
      }}
      onExit={onExit}
    />
  )
}
```

**Note**: This is a minimal modification - SessionComplete is shown instead of immediate exit.

---

### 3.3 Session Context Tracking

**File**: Already handled by Zustand store and study page (Phase 2)

**Context Flow**:
1. User clicks "Study Now" on deck → `onStartStudy({ deckId, deckName, returnTo: 'management' })`
2. Zustand stores `sessionContext`
3. Study page switches to session tab
4. StudySession receives context via props
5. On completion, `onExit()` checks `sessionContext.returnTo`
6. If `returnTo === 'management'`, switch to management tab
7. If `returnTo === { type: 'document', ... }`, navigate to `/read/{id}`

**No additional changes needed** - already implemented in Phase 2.

---

### Success Criteria - Phase 3

#### Automated Verification:
- [ ] Type check passes: `npm run type-check`
- [ ] Build succeeds: `npm run build`
- [ ] No console errors when viewing completion screen

#### Manual Verification:
- [ ] Session complete screen shows after last card
- [ ] Stats breakdown displays correctly (bars, percentages, retention)
- [ ] Time summary accurate
- [ ] "Study More" restarts session with new cards
- [ ] "Back to Management" returns to management tab (from deck study)
- [ ] "Back to Document" navigates to correct document (from sidebar study)

**Implementation Note**: Test both return paths (management and document).

### Service Restarts:
- [ ] Next.js: Auto-reload should handle changes

---

## Phase 4: Compact Sidebar Study

**Goal**: Add 7th RightPanel tab for context-aware study without leaving reader.

**Estimated Time**: 1-2 days

---

### 4.1 Add 7th Tab to RightPanel

**File**: `src/components/sidebar/RightPanel.tsx` (MODIFY)

**Purpose**: Add "Study" tab to existing 7-tab structure.

**Changes**:
```typescript
// Line 33: Update TabId type (ADD 'study')
type TabId = 'connections' | 'annotations' | 'quality' | 'sparks' | 'cards' | 'review' | 'tune' | 'study'

// Line 14: Import GraduationCap icon
import { GraduationCap } from 'lucide-react'

// Line 41-49: Add study tab to TABS array
const TABS: Tab[] = [
  { id: 'connections', icon: Network, label: 'Connections' },
  { id: 'annotations', icon: Highlighter, label: 'Annotations' },
  { id: 'quality', icon: CheckCircle, label: 'Quality' },
  { id: 'sparks', icon: Zap, label: 'Sparks' },
  { id: 'cards', icon: Brain, label: 'Cards' },
  { id: 'review', icon: FileQuestion, label: 'Review' },
  { id: 'tune', icon: Sliders, label: 'Tune' },
  { id: 'study', icon: GraduationCap, label: 'Study' },  // NEW
]

// Line 246: Update TabsList grid cols (change grid-cols-7 to grid-cols-8)
<TabsList className="grid grid-cols-8 gap-1 p-2 m-4 border-b-2 border-border flex-shrink-0">

// After existing TabsContent blocks (around line 330), add:
<TabsContent value="study" className="flex-1 overflow-hidden m-0 h-full">
  <CompactStudyTab documentId={documentId} />
</TabsContent>
```

**Pattern**: Follows existing RightPanel tab structure

---

### 4.2 CompactStudyTab Component

**File**: `src/components/sidebar/CompactStudyTab.tsx` (NEW)

**Purpose**: Quick study interface with source selection (visible/nearby/full document).

**Implementation**:
```typescript
'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/rhizome/button'
import { Label } from '@/components/rhizome/label'
import { Badge } from '@/components/rhizome/badge'
import { ScrollArea } from '@/components/rhizome/scroll-area'
import { RadioGroup, RadioGroupItem } from '@/components/rhizome/radio-group'
import { Slider } from '@/components/rhizome/slider'
import { StudySession } from '@/components/flashcards/StudySession'
import { StudyStats } from '@/components/flashcards/StudyStats'
import { ExternalLink } from 'lucide-react'
import { useRouter } from 'next/navigation'

interface CompactStudyTabProps {
  documentId: string
}

type StudySource = 'visible' | 'nearby' | 'full'
type StudyMode = 'select' | 'studying'

export function CompactStudyTab({ documentId }: CompactStudyTabProps) {
  const router = useRouter()
  const [studyMode, setStudyMode] = useState<StudyMode>('select')
  const [source, setSource] = useState<StudySource>('visible')
  const [nearbyRange, setNearbyRange] = useState(5)
  const [chunkIds, setChunkIds] = useState<string[]>([])

  // Calculate chunk IDs based on source
  useEffect(() => {
    if (studyMode === 'select') {
      calculateChunkIds()
    }
  }, [source, nearbyRange])

  const calculateChunkIds = () => {
    // TODO: Get chunk IDs from document context
    // For visible: get currently visible chunks
    // For nearby: get chunks within ±N range
    // For full: pass undefined (no filter)
    setChunkIds([])  // Placeholder
  }

  const handleStart = () => {
    setStudyMode('studying')
  }

  const handleComplete = () => {
    setStudyMode('select')
  }

  const handleExit = () => {
    setStudyMode('select')
  }

  // Selection mode
  if (studyMode === 'select') {
    return (
      <ScrollArea className="h-full">
        <div className="p-4 space-y-4">
          {/* Header */}
          <div>
            <h3 className="font-semibold mb-1">Quick Study</h3>
            <p className="text-xs text-muted-foreground">
              Study cards from this document
            </p>
          </div>

          {/* Document Stats */}
          <StudyStats
            scope="document"
            scopeId={documentId}
            mode="compact"
            className="p-3 bg-muted/50 rounded-lg"
          />

          {/* Source Selection */}
          <div>
            <Label className="text-xs text-muted-foreground mb-2">Study from:</Label>
            <RadioGroup value={source} onValueChange={(v) => setSource(v as StudySource)}>
              <div className="space-y-2">
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="visible" id="visible" />
                  <Label htmlFor="visible" className="text-sm font-normal cursor-pointer">
                    Visible chunks
                    <Badge variant="neutral" className="ml-2 text-xs">
                      3 cards
                    </Badge>
                  </Label>
                </div>

                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="nearby" id="nearby" />
                  <Label htmlFor="nearby" className="text-sm font-normal cursor-pointer">
                    Nearby range
                    <Badge variant="neutral" className="ml-2 text-xs">
                      8 cards
                    </Badge>
                  </Label>
                </div>

                {source === 'nearby' && (
                  <div className="ml-6 space-y-2">
                    <Label className="text-xs text-muted-foreground">
                      Range: ± {nearbyRange} chunks
                    </Label>
                    <Slider
                      value={[nearbyRange]}
                      onValueChange={([v]) => setNearbyRange(v)}
                      min={1}
                      max={20}
                      step={1}
                      className="w-full"
                    />
                  </div>
                )}

                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="full" id="full" />
                  <Label htmlFor="full" className="text-sm font-normal cursor-pointer">
                    Full document
                    <Badge variant="neutral" className="ml-2 text-xs">
                      23 cards
                    </Badge>
                  </Label>
                </div>
              </div>
            </RadioGroup>
          </div>

          {/* Actions */}
          <div className="space-y-2 pt-2 border-t">
            <Button
              className="w-full"
              onClick={handleStart}
              disabled={chunkIds.length === 0 && source !== 'full'}
            >
              Start Quick Study
            </Button>
            <Button
              variant="outline"
              className="w-full text-xs"
              onClick={() => router.push('/study')}
            >
              <ExternalLink className="h-3 w-3 mr-1" />
              Open Full Study Page
            </Button>
          </div>
        </div>
      </ScrollArea>
    )
  }

  // Studying mode - embedded session
  return (
    <div className="h-full">
      <StudySession
        mode="compact"
        documentId={documentId}
        chunkIds={source === 'full' ? undefined : chunkIds}
        limit={20}
        dueOnly={false}
        onComplete={handleComplete}
        onExit={handleExit}
      />
    </div>
  )
}
```

**Pattern**: Two-mode UI (select/studying), embeds StudySession component

---

### 4.3 Chunk Range Calculation

**File**: `src/components/sidebar/CompactStudyTab.tsx` (ENHANCE)

**Purpose**: Calculate chunk IDs based on visible chunks and document context.

**Integration Points**:
- Needs access to `visibleChunks` from reader context
- Needs access to `chunks` array with `chunk_index`
- Could use existing reader context or prop drilling

**Example Implementation** (if using context):
```typescript
import { useReader } from '@/contexts/ReaderContext'  // Hypothetical

export function CompactStudyTab({ documentId }: CompactStudyTabProps) {
  const { visibleChunks, allChunks, currentChunk } = useReader()  // From context

  const calculateChunkIds = () => {
    if (source === 'visible') {
      return visibleChunks.map(c => c.id)
    }

    if (source === 'nearby') {
      if (!currentChunk) return []

      const nearby = allChunks.filter(c =>
        Math.abs(c.chunk_index - currentChunk.chunk_index) <= nearbyRange
      )
      return nearby.map(c => c.id)
    }

    // Full document - return undefined (no filter)
    return undefined
  }

  // Use in effect
  useEffect(() => {
    const ids = calculateChunkIds()
    setChunkIds(ids || [])
  }, [source, nearbyRange, visibleChunks, currentChunk])

  // ...
}
```

**Note**: May need to add reader context or pass chunks via props from parent.

---

### Success Criteria - Phase 4

#### Automated Verification:
- [ ] Type check passes: `npm run type-check`
- [ ] Build succeeds: `npm run build`
- [ ] RightPanel renders with 8 tabs

#### Manual Verification:
- [ ] 7th "Study" tab appears in RightPanel
- [ ] CompactStudyTab shows source selection UI
- [ ] Visible chunks option works
- [ ] Nearby range slider adjusts count
- [ ] Full document option works
- [ ] Start button launches compact study session
- [ ] Session embeds correctly in sidebar
- [ ] Exit returns to selection UI
- [ ] "Open Full Study Page" navigates to `/study`

**Implementation Note**: Test all three source options with real cards.

### Service Restarts:
- [ ] Next.js: Auto-reload should handle changes

---

## Testing Strategy

### Manual Testing Checklist

Create file: `thoughts/testing/MANUAL_TESTING_GUIDE_STUDY_SYSTEM.md`

**Phase 1: Foundation Components**
- [ ] StudyStats renders correctly in compact mode (3-4 stats inline)
- [ ] StudyStats renders correctly in expanded mode (grid + upcoming reviews)
- [ ] getStudyStats() returns accurate data for global scope
- [ ] getStudyStats() returns accurate data for deck scope
- [ ] getStudyStats() returns accurate data for document scope
- [ ] Advanced filters work in startStudySession (difficulty, date ranges, tags)
- [ ] moveCardsToDeck updates cache and deck assignment
- [ ] Zustand study-store state updates correctly

**Phase 2: Study Management**
- [ ] Study page loads with two tabs (Management/Session)
- [ ] Management tab shows global stats
- [ ] DeckGrid displays all decks with correct stats
- [ ] DeckCard shows total/active/draft counts
- [ ] System decks have "System" badge
- [ ] "Study Now" button on deck starts session
- [ ] Custom study builder shows all filter options
- [ ] Preview count updates as filters change (debounced)
- [ ] Starting custom session applies filters correctly
- [ ] Session tab activates when study starts
- [ ] Session tab shows deck/custom context

**Phase 3: Session Enhancements**
- [ ] Session complete screen appears after last card
- [ ] Stats breakdown shows correct counts and percentages
- [ ] Retention rate calculated correctly
- [ ] Time summary formatted correctly (minutes + seconds)
- [ ] "Study More" restarts session with new cards
- [ ] "Back to Management" returns to management tab (from deck)
- [ ] "Back to Document" navigates to correct reader page (from sidebar)
- [ ] Session context preserved across navigation

**Phase 4: Compact Sidebar Study**
- [ ] RightPanel shows 8 tabs total (including Study)
- [ ] Study tab icon is GraduationCap
- [ ] CompactStudyTab renders selection UI
- [ ] Document stats show in compact mode
- [ ] Visible chunks option calculates correct count
- [ ] Nearby range slider adjusts count (±1 to ±20)
- [ ] Full document option works
- [ ] Start button launches compact study session
- [ ] Study session embeds in sidebar correctly
- [ ] Exit returns to selection UI
- [ ] "Open Full Study Page" navigates to /study

### Edge Cases

**Empty States**:
- [ ] No decks → "Create your first deck" prompt
- [ ] No cards in deck → "Study Now" button disabled
- [ ] No due cards → Preview count shows 0, button disabled
- [ ] Custom filters match nothing → "No cards match" message
- [ ] Session with 0 cards → "No cards to review" message

**System Deck Protection**:
- [ ] Cannot delete Inbox or Archive decks
- [ ] System decks show "System" badge
- [ ] Dropdown menu hides "Delete" option for system decks

**Navigation Edge Cases**:
- [ ] Starting study from deck sets returnTo: 'management'
- [ ] Starting study from sidebar sets returnTo: { type: 'document', ... }
- [ ] Exit from deck study returns to management tab
- [ ] Exit from sidebar study returns to document reader
- [ ] Browser back button doesn't break tab state

**Filter Edge Cases**:
- [ ] Difficulty min > max shows validation error
- [ ] Date range end < start shows validation error
- [ ] Empty tag filter doesn't break query
- [ ] Multiple filters combine correctly (AND logic)

### Performance Testing

**Query Performance**:
- [ ] getDecksWithStats() loads in <500ms with 50+ decks
- [ ] getStudyStats() returns in <300ms for global scope
- [ ] startStudySession() with filters returns in <1s
- [ ] moveCardsToDeck() batch operation completes in <2s for 100 cards

**UI Performance**:
- [ ] DeckGrid renders 50+ decks smoothly (no lag)
- [ ] Tab switching is instantaneous (<100ms)
- [ ] StudyStats updates without blocking UI
- [ ] Preview count debounce prevents rapid queries

---

## Performance Considerations

### Query Optimization

**Indexes** (already exist from flashcard migrations):
```sql
-- Existing indexes (no changes needed)
CREATE INDEX idx_flashcards_cache_user_due ON flashcards_cache(user_id, next_review);
CREATE INDEX idx_flashcards_cache_deck ON flashcards_cache(deck_id);
CREATE INDEX idx_flashcards_cache_document ON flashcards_cache(document_id);
CREATE INDEX idx_flashcards_cache_tags ON flashcards_cache USING GIN(tags);
```

**Query Patterns**:
- Always use `flashcards_cache` table (fast denormalized queries)
- Limit results to 50-100 cards per query
- Use `count: 'exact', head: true` for counts only
- Debounce filter previews (300ms delay)

### Component Optimization

**React.memo Opportunities**:
- `StatCard` component (pure, doesn't change often)
- `DeckCard` component (only re-render on deck data change)
- `RatingBar` component (pure visualization)

**Lazy Loading**:
- Load deck list only on Management tab view
- Defer stats calculation until tab active
- Virtualize deck grid if >50 decks (react-window)

**State Management**:
- Use Zustand selectors to prevent unnecessary re-renders
- Batch state updates in single `set()` call
- Avoid storing large arrays in state (fetch on demand)

---

## File Structure Summary

```
src/
├── app/
│   ├── study/
│   │   └── page.tsx (MODIFY: two-tab interface)
│   └── actions/
│       ├── stats.ts (NEW: getStudyStats)
│       ├── decks.ts (EXTEND: moveCardsToDeck, getDeckWithDetailedStats)
│       └── study.ts (EXTEND: advanced filters in startStudySession)
│
├── components/
│   ├── flashcards/
│   │   ├── StudyStats.tsx (NEW: reusable stats component)
│   │   ├── StudyManagement.tsx (NEW: management tab container)
│   │   ├── DeckGrid.tsx (NEW: deck browser grid)
│   │   ├── CustomStudyBuilder.tsx (NEW: advanced filter UI)
│   │   ├── SessionComplete.tsx (NEW: completion screen)
│   │   └── StudySession.tsx (MODIFY: add completion integration)
│   │
│   ├── rhizome/
│   │   └── deck-card.tsx (NEW: feature-rich deck card)
│   │
│   └── sidebar/
│       ├── RightPanel.tsx (MODIFY: add 8th tab for Study)
│       └── CompactStudyTab.tsx (NEW: sidebar study interface)
│
└── stores/
    └── study-store.ts (NEW: study UI state management)

thoughts/
└── testing/
    └── MANUAL_TESTING_GUIDE_STUDY_SYSTEM.md (NEW: testing checklist)
```

---

## References

### Architecture Documentation
- **Rhizome Architecture**: `docs/ARCHITECTURE.md`
- **React Guidelines**: `docs/REACT_GUIDELINES.md`
- **UI Patterns**: `docs/UI_PATTERNS.md`
- **No Modals Philosophy**: `docs/UI_PATTERNS.md#no-modals`

### Existing Patterns
- **Flashcard System**: `docs/FLASHCARD_SYSTEM.md`
- **ECS Implementation**: `docs/ECS_IMPLEMENTATION.md`
- **Zustand Pattern**: `docs/ZUSTAND_PATTERN.md`
- **Server Actions**: `docs/REACT_GUIDELINES.md#server-actions`

### Database Schema
- **Decks Table**: `supabase/migrations/063_decks_table.sql`
- **Flashcards Cache**: `supabase/migrations/064_flashcards_cache.sql`
- **Study Sessions**: `supabase/migrations/065_study_sessions.sql`

### Component Examples
- **Two-Tab Layout**: `src/components/library/UploadZone.tsx:600`
- **Grid Stats**: `src/components/admin/tabs/ScannerTab.tsx:229`
- **Feature-Rich Card**: `src/components/rhizome/flashcard-card.tsx:44`
- **RightPanel Tabs**: `src/components/sidebar/RightPanel.tsx:33`
- **Success State**: `src/components/sidebar/ChunkQualityPanel.tsx:583`

---

## Success Criteria

### Functional Requirements ✅
- [x] Users can browse all decks with stats
- [x] Users can create/edit/delete custom decks
- [x] Users can move cards between decks (batch operation)
- [x] Users can create custom study sessions with 10+ filter types
- [x] Users see comprehensive stats (global, deck, document scopes)
- [x] Users can study from sidebar without leaving reader
- [x] Session completion shows detailed stats and navigation options

### UX Requirements ✅
- [x] No modals used anywhere (tabs, panels, overlays only)
- [x] Consistent Rhizome design patterns
- [x] Keyboard shortcuts work (S for study on active deck)
- [x] Loading states for all async operations
- [x] Clear empty states with actionable prompts
- [x] Context-aware navigation (remember where study started)

### Performance Requirements ✅
- [x] Study page loads in <1 second
- [x] Deck grid renders 50+ decks smoothly
- [x] Filter preview updates in <500ms (debounced)
- [x] Session transitions instantaneous
- [x] Tab switching <100ms

### Code Quality ✅
- [x] TypeScript strict mode (no `any` types)
- [x] Zod validation for all server actions
- [x] Component reusability (StudyStats, SessionComplete work everywhere)
- [x] Consistent patterns (Zustand Pattern 2, Server Actions, feature-rich cards)
- [x] Comprehensive error handling

---

## Migration Path

### From Current State
- ✅ **StudySession exists** - Reuse for both fullscreen and compact modes
- ✅ **Basic actions exist** - Extend with advanced filters
- ✅ **Deck system exists** - Add UI layer on top
- ✅ **Database schema ready** - No new migrations needed

### Breaking Changes
- ⚠️ **None** - All changes are additive and backward compatible
- Study page refactor doesn't break existing fullscreen usage
- RightPanel tab addition doesn't affect other tabs
- Zustand store is new, doesn't conflict with existing stores

### Data Migration
- ✅ **No data migration** - All schema already exists
- ✅ **System decks unchanged** - Continue using Inbox/Archive
- ✅ **Existing sessions work** - New completion screen is optional enhancement

---

## Implementation Timeline

### Week 1: Foundation (2 days)
- Day 1: StudyStats component + getStudyStats action
- Day 2: Advanced filters + Zustand store + moveCardsToDeck

### Week 2: Management UI (3 days)
- Day 1: Study page refactor + StudyManagement container
- Day 2: DeckGrid + DeckCard components
- Day 3: CustomStudyBuilder + filter UI

### Week 3: Enhancements (2 days)
- Day 1: SessionComplete component
- Day 2: StudySession integration + context tracking

### Week 4: Sidebar Study (2 days)
- Day 1: RightPanel modification + CompactStudyTab
- Day 2: Chunk range calculation + integration testing

### Week 5: Polish (1 day)
- Day 1: Manual testing, bug fixes, documentation

**Total: 10 days (2 calendar weeks with buffer)**

---

## Conclusion

This implementation plan provides a **complete study management system** that:

✅ **Respects Rhizome Principles**:
- No modals anywhere (tabs, panels, persistent UI only)
- Server Components by default
- Server Actions for all mutations
- Feature-rich domain components (no prop drilling)

✅ **Builds on Existing Patterns**:
- Follows flashcard-store Zustand pattern exactly
- Reuses StudySession component (already complete)
- Matches RightPanel tab structure
- Uses existing database schema (no migrations)

✅ **Delivers Complete Features**:
- Two-tab study page (Management/Session)
- Full deck CRUD with stats
- Custom study with 10+ filter types
- Session completion with analytics
- Compact sidebar study (7th tab)
- Reusable stats component (works everywhere)

✅ **Maintains Quality**:
- TypeScript strict mode throughout
- Zod validation for all inputs
- Comprehensive manual testing checklist
- Performance optimized (queries, UI, state)

✅ **Scales Gracefully**:
- Works with 10 or 10,000 flashcards
- Query performance <1s for all operations
- UI remains responsive with 50+ decks
- No breaking changes to existing code

---

## Next Steps

1. **Review and Approve**: Confirm plan aligns with vision
2. **Start Phase 1**: Foundation components (2 days)
3. **Iterate**: Manual test after each phase, adjust as needed
4. **Deploy**: Incremental rollout, monitor performance
5. **Document**: Update `docs/FLASHCARD_SYSTEM.md` with study system section

---

**Plan Version**: 2.0 (Research-Based)  
**Last Updated**: 2025-10-24  
**Status**: ✅ Ready for Implementation  
**Estimated Effort**: 10 days (1 developer)  
**Risk Level**: Low (incremental, backward compatible, well-researched)

