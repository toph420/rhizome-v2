# Reader Core Features Implementation Plan

**Date**: 2025-10-17
**Timeline**: 3 weeks
**Focus**: Navigation, Session Tracking, Stats, "Where Was I?"

---

## Overview

Add essential reader features to Rhizome V2 without the complexity of chat or AI suggestions. This plan focuses on:

1. **LeftPanel** with navigation (Outline, Stats, Heatmap tabs)
2. **Session tracking** (time, position, engagement)
3. **"Where Was I?"** AI-powered context summary in BottomPanel
4. Test AI integration in a bounded feature before expanding to chat

---

## Current State Analysis

### ✅ Already Implemented

**Components** (from research):
- `ReaderLayout.tsx` - Orchestrates 4 Zustand stores (Reader, Connection, UI, Annotation)
- `RightPanel.tsx` - 7 tabs with collapse/expand, already working
- `VirtualizedReader.tsx` - react-virtuoso scrolling
- `ConnectionHeatmap.tsx` - Left margin density visualization (needs to move)
- `QuickSparkModal.tsx` - ⌘K quick capture

**Stores**:
- `reader-store.ts` - Document content, scroll position, visible chunks
- `ui-store.ts` - View modes (explore/focus/study), sidebar state
- `connection-store.ts` - Engine weights, filtering
- `annotation-store.ts` - Annotation data

**Database**:
- Latest migration: `052_job_pause_resume.sql`
- `chunks` table has: `heading_path` (TEXT[]), `heading_level` (INTEGER), `section_marker` (TEXT)
- No session tracking tables exist

**Patterns** (from codebase-pattern-finder):
- Gemini: Non-streaming with error handling, timeout protection, graceful fallback
- Server Actions: Zod validation, `getCurrentUser()`, structured returns `{ success, data?, error? }`
- Store pattern: `create()` with `persist()` middleware, partialize for selective persistence

### ❌ Missing (Core Features)

1. **LeftPanel** - No left panel component at all
2. **Session tracking** - No tables, no hooks, no automatic tracking
3. **Reading stats** - No aggregation or display
4. **"Where Was I?"** - No context summary generation
5. **BottomPanel** - No contextual information bar

---

## Desired End State

**User Experience**:
1. Opens document → LeftPanel shows outline with connection indicators
2. Clicks section in outline → scrolls to that section, shows connections
3. Reads for 15 minutes → StatsTab shows "15 min this session, 47 min total"
4. Closes document, returns 2 days later → Clicks "Where was I?" → Gets anti-spoiler summary
5. AI summary reminds them of completed sections + their recent sparks

**Technical Specification**:
- LeftPanel mirrors RightPanel collapse pattern (48px collapsed, 320px expanded)
- Session tracking runs in background (30-second updates, auto-end on blur)
- Stats query `reading_sessions` directly (no materialized views)
- "Where Was I?" generates ~$0.01 summary using Gemini with section caching

---

## Rhizome Architecture

- **Module**: Main App (Next.js) - all features are frontend/server actions
- **Storage**: Database (reading_sessions, section_summaries) - queryable data
- **Migration**: Yes - `053_reading_sessions.sql`, `054_section_summaries.sql`
- **Test Tier**: Stable (fix when broken)
- **Pipeline Stages**: N/A (reader features only)
- **Engines**: N/A (uses existing connection data)

---

## What We're NOT Doing

**Out of Scope** (defer to later):
- Chat interface (too complex, test AI with "Where Was I?" first)
- AI suggestions (weekly background jobs, learning system)
- Gemini context caching for chat (optimization, not required)
- History tab (session timeline - nice-to-have)
- Animated polish (Phase 7 from original plan)
- Mobile responsive design (desktop-first)
- Materialized views for stats (premature optimization)

---

## Implementation Approach

**Strategy**: Build incrementally, test AI integration in bounded feature

1. **Phase 1**: LeftPanel + OutlineTab (navigation foundation)
2. **Phase 2**: Session tracking (silent background data collection)
3. **Phase 3**: StatsTab (visualize collected data)
4. **Phase 4**: "Where Was I?" (test AI before expanding to chat)

**Key Principles**:
- Mirror existing RightPanel patterns (collapse, tabs, stores)
- Reuse Gemini patterns from codebase (non-streaming, error handling, fallback)
- Follow server action patterns (Zod, getCurrentUser, structured returns)
- Store behavior in Zustand, persist selectively

---

## Phase 1: LeftPanel + OutlineTab

### Overview

Create LeftPanel component mirroring RightPanel's collapse behavior. Add OutlineTab that navigates document via `heading_path` hierarchy with toggleable connection indicators.

**Success**: Click section in outline → scrolls to that section, highlights temporarily

### Changes Required

#### 1. Create LeftPanel Component Structure

**File**: `src/components/reader/LeftPanel/LeftPanel.tsx` (NEW)

```typescript
'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { ChevronLeft, ChevronRight, List, BarChart3, Activity } from 'lucide-react'
import { OutlineTab } from './OutlineTab'
import { StatsTab } from './StatsTab'
import { HeatmapTab } from './HeatmapTab'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'

type LeftPanelTab = 'outline' | 'stats' | 'heatmap'

interface LeftPanelProps {
  documentId: string
  chunks: Array<{
    id: string
    chunk_index: number
    heading_path: string[] | null
    heading_level: number | null
    start_offset: number
    end_offset: number
  }>
  collapsed: boolean
  onCollapsedChange: (collapsed: boolean) => void
  onNavigateToChunk: (chunkId: string) => void
}

const TABS = [
  { id: 'outline' as const, icon: List, label: 'Outline' },
  { id: 'stats' as const, icon: BarChart3, label: 'Stats' },
  { id: 'heatmap' as const, icon: Activity, label: 'Heatmap' },
]

export function LeftPanel({
  documentId,
  chunks,
  collapsed,
  onCollapsedChange,
  onNavigateToChunk,
}: LeftPanelProps) {
  const [activeTab, setActiveTab] = useState<LeftPanelTab>('outline')

  return (
    <motion.div
      className="fixed left-0 top-14 bottom-0 border-r z-40 bg-background"
      initial={false}
      animate={{
        width: collapsed ? 48 : 320 // w-12 : w-80
      }}
      transition={{
        type: 'spring',
        damping: 25,
        stiffness: 300
      }}
    >
      {/* Toggle button */}
      <Button
        variant="ghost"
        size="icon"
        className="absolute -right-4 top-8 z-50 rounded-full border bg-background shadow-md"
        onClick={() => onCollapsedChange(!collapsed)}
        aria-label={collapsed ? 'Expand panel' : 'Collapse panel'}
      >
        {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
      </Button>

      {/* Panel content */}
      <AnimatePresence>
        {!collapsed && (
          <motion.div
            className="h-full flex flex-col"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            {/* Icon tabs (3 columns) */}
            <div className="grid grid-cols-3 border-b p-2 gap-1">
              {TABS.map(tab => {
                const Icon = tab.icon
                const isActive = activeTab === tab.id

                return (
                  <motion.button
                    key={tab.id}
                    className={cn(
                      'p-2 rounded flex flex-col items-center justify-center gap-1 transition-colors',
                      isActive
                        ? 'bg-primary/10 text-primary'
                        : 'hover:bg-muted text-muted-foreground hover:text-foreground'
                    )}
                    onClick={() => setActiveTab(tab.id)}
                    title={tab.label}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                  >
                    <Icon className="h-4 w-4" />
                    <span className="text-xs">{tab.label}</span>
                  </motion.button>
                )
              })}
            </div>

            {/* Active tab content */}
            <div className="flex-1 overflow-hidden">
              {activeTab === 'outline' && (
                <ScrollArea className="h-full">
                  <OutlineTab
                    documentId={documentId}
                    chunks={chunks}
                    onNavigateToChunk={onNavigateToChunk}
                  />
                </ScrollArea>
              )}

              {activeTab === 'stats' && (
                <ScrollArea className="h-full">
                  <StatsTab documentId={documentId} />
                </ScrollArea>
              )}

              {activeTab === 'heatmap' && (
                <ScrollArea className="h-full">
                  <HeatmapTab
                    documentId={documentId}
                    chunks={chunks}
                    onNavigateToChunk={onNavigateToChunk}
                  />
                </ScrollArea>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
```

#### 2. Create OutlineTab Component

**File**: `src/components/reader/LeftPanel/OutlineTab.tsx` (NEW)

```typescript
'use client'

import { useState, useEffect, useMemo } from 'react'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Network } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useReaderStore } from '@/stores/reader-store'

interface OutlineItem {
  level: number
  title: string
  headingPath: string[]
  chunkRange: { start: number; end: number; startChunkId: string }
  connectionCount: number
  isCurrentSection: boolean
}

interface OutlineTabProps {
  documentId: string
  chunks: Array<{
    id: string
    chunk_index: number
    heading_path: string[] | null
    heading_level: number | null
  }>
  onNavigateToChunk: (chunkId: string) => void
}

export function OutlineTab({ documentId, chunks, onNavigateToChunk }: OutlineTabProps) {
  const [showConnectionIndicators, setShowConnectionIndicators] = useState(true)
  const [connectionCounts, setConnectionCounts] = useState<Record<string, number>>({})
  const currentChunkIndex = useReaderStore(state => {
    const visibleChunks = state.visibleChunks
    return visibleChunks.length > 0 ? visibleChunks[0].chunk_index : 0
  })

  // Build outline from chunks
  const outline = useMemo(() => {
    const items: OutlineItem[] = []
    const seen = new Set<string>()

    chunks.forEach(chunk => {
      if (!chunk.heading_path || chunk.heading_path.length === 0) return

      const pathKey = chunk.heading_path.join('|')
      if (seen.has(pathKey)) return
      seen.add(pathKey)

      const title = chunk.heading_path[chunk.heading_path.length - 1]

      // Find chunk range for this heading
      const sectionChunks = chunks.filter(c =>
        c.heading_path &&
        c.heading_path.join('|') === pathKey
      )

      if (sectionChunks.length === 0) return

      const startChunk = sectionChunks[0]
      const endChunk = sectionChunks[sectionChunks.length - 1]

      items.push({
        level: chunk.heading_level ?? 0,
        title,
        headingPath: chunk.heading_path,
        chunkRange: {
          start: startChunk.chunk_index,
          end: endChunk.chunk_index,
          startChunkId: startChunk.id
        },
        connectionCount: connectionCounts[pathKey] || 0,
        isCurrentSection: currentChunkIndex >= startChunk.chunk_index &&
                         currentChunkIndex <= endChunk.chunk_index
      })
    })

    return items.sort((a, b) => a.chunkRange.start - b.chunkRange.start)
  }, [chunks, connectionCounts, currentChunkIndex])

  // Fetch connection counts for each section
  useEffect(() => {
    async function fetchConnectionCounts() {
      try {
        const response = await fetch(`/api/connections/count-by-section?documentId=${documentId}`)
        if (!response.ok) return

        const counts = await response.json()
        setConnectionCounts(counts)
      } catch (error) {
        console.error('Failed to fetch connection counts:', error)
      }
    }

    if (showConnectionIndicators) {
      fetchConnectionCounts()
    }
  }, [documentId, showConnectionIndicators])

  return (
    <div className="p-4 space-y-4">
      {/* Toggle for connection indicators */}
      <div className="flex items-center justify-between pb-2 border-b">
        <Label htmlFor="show-connections" className="text-sm">
          Connection Indicators
        </Label>
        <Switch
          id="show-connections"
          checked={showConnectionIndicators}
          onCheckedChange={setShowConnectionIndicators}
        />
      </div>

      {/* Outline items */}
      <div className="space-y-1">
        {outline.map((item, index) => (
          <button
            key={index}
            onClick={() => onNavigateToChunk(item.chunkRange.startChunkId)}
            className={cn(
              'w-full text-left p-2 rounded transition-colors flex items-center justify-between gap-2',
              item.isCurrentSection
                ? 'bg-primary/10 border-l-2 border-primary'
                : 'hover:bg-muted'
            )}
            style={{ paddingLeft: `${8 + item.level * 12}px` }}
          >
            <span className={cn(
              'text-sm',
              item.isCurrentSection ? 'font-medium' : 'text-muted-foreground'
            )}>
              {item.title}
            </span>

            {showConnectionIndicators && item.connectionCount > 0 && (
              <Badge
                variant={item.connectionCount > 10 ? 'default' : 'secondary'}
                className="flex items-center gap-1 text-xs"
              >
                <Network className="h-3 w-3" />
                {item.connectionCount}
              </Badge>
            )}
          </button>
        ))}
      </div>

      {outline.length === 0 && (
        <div className="text-center text-sm text-muted-foreground py-8">
          No headings found in document
        </div>
      )}
    </div>
  )
}
```

#### 3. Create API Route for Connection Counts

**File**: `src/app/api/connections/count-by-section/route.ts` (NEW)

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * GET /api/connections/count-by-section?documentId=xxx
 * Returns connection counts grouped by heading_path
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const documentId = searchParams.get('documentId')

    if (!documentId) {
      return NextResponse.json(
        { error: 'documentId required' },
        { status: 400 }
      )
    }

    const supabase = await createClient()

    // Get all chunks for document with their connections
    const { data: chunks, error } = await supabase
      .from('chunks')
      .select(`
        heading_path,
        connections!source_chunk_id(count)
      `)
      .eq('document_id', documentId)

    if (error) {
      console.error('Failed to fetch connection counts:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Group by heading_path and sum connections
    const counts: Record<string, number> = {}

    chunks?.forEach(chunk => {
      if (!chunk.heading_path || chunk.heading_path.length === 0) return

      const pathKey = chunk.heading_path.join('|')
      const connectionCount = (chunk.connections as any[])?.[0]?.count || 0

      counts[pathKey] = (counts[pathKey] || 0) + connectionCount
    })

    return NextResponse.json(counts)
  } catch (error) {
    console.error('Connection count API error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
```

#### 4. Integrate LeftPanel into ReaderLayout

**File**: `src/components/reader/ReaderLayout.tsx` (MODIFY)

```typescript
// Add import at top
import { LeftPanel } from './LeftPanel/LeftPanel'

// Add state for LeftPanel collapse
const [leftPanelCollapsed, setLeftPanelCollapsed] = useState(false)

// Sync LeftPanel with view mode
useEffect(() => {
  if (viewMode === 'focus') {
    setLeftPanelCollapsed(true)
  } else if (viewMode === 'explore') {
    setLeftPanelCollapsed(false)
  }
  // study mode: expanded (viewMode === 'study' → collapsed = false)
}, [viewMode])

// In JSX, add LeftPanel before main content area:
return (
  <div className="flex flex-col h-screen">
    <DocumentHeader {...headerProps} />

    <div className="flex-1 overflow-hidden relative">
      {/* LEFT PANEL - NEW */}
      {viewMode !== 'focus' && (
        <LeftPanel
          documentId={documentId}
          chunks={chunks}
          collapsed={leftPanelCollapsed}
          onCollapsedChange={setLeftPanelCollapsed}
          onNavigateToChunk={handleNavigateToChunk}
        />
      )}

      {/* Remove ConnectionHeatmap from here - moved to HeatmapTab */}

      <DocumentViewer {...viewerProps} />
    </div>

    <RightPanel {...rightPanelProps} />
    {/* ... rest */}
  </div>
)
```

#### 5. Move ConnectionHeatmap to HeatmapTab

**File**: `src/components/reader/LeftPanel/HeatmapTab.tsx` (NEW)

```typescript
'use client'

import { ConnectionHeatmap } from '../ConnectionHeatmap'

interface HeatmapTabProps {
  documentId: string
  chunks: any[]
  onNavigateToChunk: (chunkId: string) => void
}

export function HeatmapTab({ documentId, chunks, onNavigateToChunk }: HeatmapTabProps) {
  return (
    <div className="p-4">
      <div className="text-sm text-muted-foreground mb-4">
        Connection density visualization. Darker areas indicate more connections.
      </div>

      <ConnectionHeatmap
        documentId={documentId}
        chunks={chunks}
        // Pass navigate handler if ConnectionHeatmap supports click-to-jump
      />
    </div>
  )
}
```

#### 6. Create StatsTab Placeholder

**File**: `src/components/reader/LeftPanel/StatsTab.tsx` (NEW)

```typescript
'use client'

export function StatsTab({ documentId }: { documentId: string }) {
  return (
    <div className="p-4 space-y-4">
      <div className="text-sm text-muted-foreground">
        Reading statistics will appear here after Phase 3.
      </div>

      {/* Placeholder sections */}
      <div className="space-y-2">
        <h3 className="font-medium">This Session</h3>
        <div className="text-2xl">-- min</div>
      </div>

      <div className="space-y-2">
        <h3 className="font-medium">This Document</h3>
        <div className="text-2xl">-- min</div>
      </div>

      <div className="space-y-2">
        <h3 className="font-medium">This Week</h3>
        <div className="text-2xl">-- min</div>
      </div>
    </div>
  )
}
```

### Success Criteria

#### Automated Verification:
- [ ] Type check: `npm run type-check`
- [ ] Build succeeds: `npm run build`
- [ ] No console errors on reader page load

#### Manual Verification:
- [ ] LeftPanel appears on left side (opposite RightPanel)
- [ ] Panel collapses to 48px, expands to 320px with smooth animation
- [ ] OutlineTab shows document heading hierarchy
- [ ] Connection indicators toggle on/off
- [ ] Clicking section scrolls to that chunk with highlight
- [ ] Current section highlighted in outline
- [ ] View modes work: explore (expanded), focus (hidden), study (expanded)
- [ ] HeatmapTab shows existing ConnectionHeatmap component
- [ ] StatsTab shows placeholder text

### Service Restarts:
- [ ] Next.js: Auto-reload should work (no restart needed)

---

## Phase 2: Session Tracking

### Overview

Add silent background session tracking: time spent reading, position, engagement (sparks/annotations created). No user-visible UI yet (that's Phase 3 StatsTab).

**Success**: Session automatically starts on page load, updates every 30 seconds, ends on navigation away. Data appears in `reading_sessions` table.

### Changes Required

#### 1. Database Migration - Reading Sessions

**File**: `supabase/migrations/053_reading_sessions.sql` (NEW)

```sql
-- Reading sessions table
-- Tracks user reading activity for stats and "where was I?" context
CREATE TABLE reading_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,

  -- Session boundaries
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ,

  -- Reading progress
  start_chunk_index INTEGER NOT NULL,
  end_chunk_index INTEGER NOT NULL,
  start_scroll_position FLOAT,  -- 0.0 to 1.0
  end_scroll_position FLOAT,

  -- Activity during session
  duration_seconds INTEGER,
  sparks_created INTEGER DEFAULT 0,
  annotations_created INTEGER DEFAULT 0,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX idx_reading_sessions_user_doc
  ON reading_sessions(user_id, document_id, started_at DESC);

CREATE INDEX idx_reading_sessions_ended
  ON reading_sessions(user_id, ended_at DESC)
  WHERE ended_at IS NOT NULL;

-- Update documents table with last read tracking
ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS total_reading_time_seconds INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_read_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_read_position FLOAT,  -- 0.0 to 1.0
  ADD COLUMN IF NOT EXISTS last_read_chunk_index INTEGER;
```

#### 2. Server Actions - Session CRUD

**File**: `src/app/actions/reading-sessions.ts` (NEW)

```typescript
'use server'

import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getCurrentUser } from '@/lib/auth'

const CreateSessionSchema = z.object({
  documentId: z.string().uuid(),
  chunkIndex: z.number().int().min(0),
  scrollPosition: z.number().min(0).max(1).optional(),
})

const UpdateSessionSchema = z.object({
  sessionId: z.string().uuid(),
  endChunkIndex: z.number().int().min(0).optional(),
  endScrollPosition: z.number().min(0).max(1).optional(),
  durationSeconds: z.number().int().min(0).optional(),
  sparksCreated: z.number().int().min(0).optional(),
  annotationsCreated: z.number().int().min(0).optional(),
})

/**
 * Creates a new reading session.
 * Called when user opens a document.
 */
export async function createReadingSession(
  data: z.infer<typeof CreateSessionSchema>
): Promise<{ success: boolean; sessionId?: string; error?: string }> {
  try {
    const validated = CreateSessionSchema.parse(data)
    const user = await getCurrentUser()

    if (!user) {
      return { success: false, error: 'Not authenticated' }
    }

    const supabase = await createClient()

    const { data: session, error } = await supabase
      .from('reading_sessions')
      .insert({
        user_id: user.id,
        document_id: validated.documentId,
        start_chunk_index: validated.chunkIndex,
        end_chunk_index: validated.chunkIndex,
        start_scroll_position: validated.scrollPosition || 0,
        end_scroll_position: validated.scrollPosition || 0,
      })
      .select('id')
      .single()

    if (error) {
      console.error('[createReadingSession] Failed:', error)
      return { success: false, error: error.message }
    }

    return { success: true, sessionId: session.id }
  } catch (error) {
    console.error('[createReadingSession] Exception:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

/**
 * Updates an active reading session.
 * Called every 30 seconds during reading.
 */
export async function updateReadingSession(
  data: z.infer<typeof UpdateSessionSchema>
): Promise<{ success: boolean; error?: string }> {
  try {
    const validated = UpdateSessionSchema.parse(data)
    const supabase = await createClient()

    const updates: any = {
      updated_at: new Date().toISOString(),
    }

    if (validated.endChunkIndex !== undefined) {
      updates.end_chunk_index = validated.endChunkIndex
    }
    if (validated.endScrollPosition !== undefined) {
      updates.end_scroll_position = validated.endScrollPosition
    }
    if (validated.durationSeconds !== undefined) {
      updates.duration_seconds = validated.durationSeconds
    }
    if (validated.sparksCreated !== undefined) {
      updates.sparks_created = validated.sparksCreated
    }
    if (validated.annotationsCreated !== undefined) {
      updates.annotations_created = validated.annotationsCreated
    }

    const { error } = await supabase
      .from('reading_sessions')
      .update(updates)
      .eq('id', validated.sessionId)

    if (error) {
      console.error('[updateReadingSession] Failed:', error)
      return { success: false, error: error.message }
    }

    return { success: true }
  } catch (error) {
    console.error('[updateReadingSession] Exception:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

/**
 * Ends a reading session.
 * Called when user navigates away or closes tab.
 */
export async function endReadingSession(
  sessionId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient()

    // Get session to calculate duration
    const { data: session, error: fetchError } = await supabase
      .from('reading_sessions')
      .select('started_at, duration_seconds, document_id, end_chunk_index, end_scroll_position')
      .eq('id', sessionId)
      .single()

    if (fetchError || !session) {
      return { success: false, error: 'Session not found' }
    }

    // Calculate total duration if not already set
    const now = new Date()
    const startedAt = new Date(session.started_at)
    const totalSeconds = session.duration_seconds || Math.floor((now.getTime() - startedAt.getTime()) / 1000)

    // End session
    const { error: updateError } = await supabase
      .from('reading_sessions')
      .update({
        ended_at: now.toISOString(),
        duration_seconds: totalSeconds,
      })
      .eq('id', sessionId)

    if (updateError) {
      console.error('[endReadingSession] Failed to update session:', updateError)
      return { success: false, error: updateError.message }
    }

    // Update document last_read fields
    const { error: docError } = await supabase
      .from('documents')
      .update({
        last_read_at: now.toISOString(),
        last_read_chunk_index: session.end_chunk_index,
        last_read_position: session.end_scroll_position,
      })
      .eq('id', session.document_id)

    if (docError) {
      console.warn('[endReadingSession] Failed to update document (non-critical):', docError)
    }

    return { success: true }
  } catch (error) {
    console.error('[endReadingSession] Exception:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

/**
 * Gets reading statistics for a document.
 * Direct query (no materialized views).
 */
export async function getReadingStats(
  documentId: string
): Promise<{
  success: boolean
  data?: {
    totalSessions: number
    totalSeconds: number
    totalSparks: number
    totalAnnotations: number
    lastReadAt: string | null
  }
  error?: string
}> {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return { success: false, error: 'Not authenticated' }
    }

    const supabase = await createClient()

    // Aggregate stats from reading_sessions
    const { data: stats, error } = await supabase
      .from('reading_sessions')
      .select('duration_seconds, sparks_created, annotations_created, ended_at')
      .eq('user_id', user.id)
      .eq('document_id', documentId)
      .not('ended_at', 'is', null)

    if (error) {
      console.error('[getReadingStats] Failed:', error)
      return { success: false, error: error.message }
    }

    // Calculate totals
    const totalSessions = stats?.length || 0
    const totalSeconds = stats?.reduce((sum, s) => sum + (s.duration_seconds || 0), 0) || 0
    const totalSparks = stats?.reduce((sum, s) => sum + (s.sparks_created || 0), 0) || 0
    const totalAnnotations = stats?.reduce((sum, s) => sum + (s.annotations_created || 0), 0) || 0
    const lastReadAt = stats && stats.length > 0 ? stats[stats.length - 1].ended_at : null

    return {
      success: true,
      data: {
        totalSessions,
        totalSeconds,
        totalSparks,
        totalAnnotations,
        lastReadAt,
      },
    }
  } catch (error) {
    console.error('[getReadingStats] Exception:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}
```

#### 3. Session Tracking Hook

**File**: `src/hooks/useSessionTracking.ts` (NEW)

```typescript
import { useEffect, useRef } from 'react'
import { useReaderStore } from '@/stores/reader-store'
import { createReadingSession, updateReadingSession, endReadingSession } from '@/app/actions/reading-sessions'

/**
 * Automatically tracks reading sessions in background.
 * Starts session on mount, updates every 30 seconds, ends on unmount/blur.
 */
export function useSessionTracking(documentId: string) {
  const sessionIdRef = useRef<string | null>(null)
  const sessionStartTimeRef = useRef<Date | null>(null)
  const lastUpdateTimeRef = useRef<Date | null>(null)
  const updateIntervalRef = useRef<NodeJS.Timeout>()

  const visibleChunks = useReaderStore(state => state.visibleChunks)
  const scrollPosition = useReaderStore(state => state.scrollPosition)

  // Start session on mount
  useEffect(() => {
    async function startSession() {
      const currentChunkIndex = visibleChunks.length > 0 ? visibleChunks[0].chunk_index : 0

      const result = await createReadingSession({
        documentId,
        chunkIndex: currentChunkIndex,
        scrollPosition: scrollPosition / 100, // Convert 0-100 to 0-1
      })

      if (result.success && result.sessionId) {
        sessionIdRef.current = result.sessionId
        sessionStartTimeRef.current = new Date()
        lastUpdateTimeRef.current = new Date()
        console.log('[useSessionTracking] Session started:', result.sessionId)
      } else {
        console.error('[useSessionTracking] Failed to start session:', result.error)
      }
    }

    startSession()

    return () => {
      // End session on unmount
      if (sessionIdRef.current) {
        endReadingSession(sessionIdRef.current)
        console.log('[useSessionTracking] Session ended on unmount')
      }
    }
  }, [documentId])

  // Update session every 30 seconds
  useEffect(() => {
    if (!sessionIdRef.current) return

    updateIntervalRef.current = setInterval(async () => {
      const now = new Date()
      const sessionStartTime = sessionStartTimeRef.current
      const lastUpdateTime = lastUpdateTimeRef.current

      if (!sessionStartTime || !lastUpdateTime) return

      const totalDuration = Math.floor((now.getTime() - sessionStartTime.getTime()) / 1000)
      const currentChunkIndex = visibleChunks.length > 0 ? visibleChunks[0].chunk_index : 0

      await updateReadingSession({
        sessionId: sessionIdRef.current!,
        endChunkIndex: currentChunkIndex,
        endScrollPosition: scrollPosition / 100,
        durationSeconds: totalDuration,
      })

      lastUpdateTimeRef.current = now
      console.log('[useSessionTracking] Session updated:', totalDuration, 'seconds')
    }, 30000) // 30 seconds

    return () => {
      if (updateIntervalRef.current) {
        clearInterval(updateIntervalRef.current)
      }
    }
  }, [visibleChunks, scrollPosition])

  // End session on window blur/beforeunload
  useEffect(() => {
    const handleEndSession = () => {
      if (sessionIdRef.current) {
        endReadingSession(sessionIdRef.current)
        console.log('[useSessionTracking] Session ended on blur/unload')
      }
    }

    window.addEventListener('blur', handleEndSession)
    window.addEventListener('beforeunload', handleEndSession)

    return () => {
      window.removeEventListener('blur', handleEndSession)
      window.removeEventListener('beforeunload', handleEndSession)
    }
  }, [])

  // Increment sparks/annotations counters when they're created
  // (This will be called from createAnnotation/createSpark server actions)
  return {
    incrementSparks: async () => {
      if (!sessionIdRef.current) return
      await updateReadingSession({
        sessionId: sessionIdRef.current,
        sparksCreated: 1, // Server action will increment
      })
    },
    incrementAnnotations: async () => {
      if (!sessionIdRef.current) return
      await updateReadingSession({
        sessionId: sessionIdRef.current,
        annotationsCreated: 1,
      })
    },
  }
}
```

#### 4. Integrate Hook into ReaderLayout

**File**: `src/components/reader/ReaderLayout.tsx` (MODIFY)

```typescript
import { useSessionTracking } from '@/hooks/useSessionTracking'

// In ReaderLayout component body:
const { incrementSparks, incrementAnnotations } = useSessionTracking(documentId)

// Pass these to QuickSparkModal and annotation capture
// Update createAnnotation/createSpark server actions to call these increments
```

#### 5. Update Server Actions to Track Session Activity

**File**: `src/app/actions/annotations.ts` (MODIFY)

```typescript
// In createAnnotation function, after successful creation:
if (result.success) {
  // Increment session counter (passed from ReaderLayout)
  // This will be handled by calling incrementAnnotations from the client
  return { success: true, id: entityId }
}
```

### Success Criteria

#### Automated Verification:
- [ ] Migration applies: `npx supabase db reset`
- [ ] Type check: `npm run type-check`
- [ ] Build succeeds: `npm run build`

#### Manual Verification:
- [ ] Open document → Check `reading_sessions` table → New row with started_at
- [ ] Wait 60 seconds → Check table → duration_seconds updated
- [ ] Navigate away → Check table → ended_at populated
- [ ] Create annotation → Check table → annotations_created incremented
- [ ] Re-open same document → Check `documents` table → last_read_at updated

### Service Restarts:
- [ ] Supabase: `npx supabase db reset` (schema changed)
- [ ] Next.js: Auto-reload

---

## Phase 3: StatsTab

### Overview

Populate StatsTab with real reading statistics from `reading_sessions` table. Show time spent (this session, this document, this week) and engagement metrics.

**Success**: Open StatsTab → See "15 min this session, 47 min this document, 2h 13min this week"

### Changes Required

#### 1. Implement StatsTab Component

**File**: `src/components/reader/LeftPanel/StatsTab.tsx` (REPLACE placeholder)

```typescript
'use client'

import { useState, useEffect } from 'react'
import { getReadingStats } from '@/app/actions/reading-sessions'
import { Clock, Zap, Highlighter, TrendingUp } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { useReaderStore } from '@/stores/reader-store'

interface ReadingStats {
  thisSession: number // minutes
  thisDocument: number // minutes
  thisWeek: number // minutes
  sparksCreated: number
  annotationsCreated: number
  sessionsCount: number
}

export function StatsTab({ documentId }: { documentId: string }) {
  const [stats, setStats] = useState<ReadingStats | null>(null)
  const [loading, setLoading] = useState(true)
  const scrollPosition = useReaderStore(state => state.scrollPosition)

  useEffect(() => {
    async function loadStats() {
      setLoading(true)

      try {
        // Get document stats
        const docStatsResult = await getReadingStats(documentId)

        if (!docStatsResult.success || !docStatsResult.data) {
          console.error('Failed to load stats:', docStatsResult.error)
          setStats({
            thisSession: 0,
            thisDocument: 0,
            thisWeek: 0,
            sparksCreated: 0,
            annotationsCreated: 0,
            sessionsCount: 0,
          })
          return
        }

        // Get weekly stats (fetch from server - implement getWeeklyStats action)
        const weeklyResponse = await fetch(`/api/reading-stats/weekly`)
        const weeklyData = await weeklyResponse.json()

        // Get current session duration (from session start time in useSessionTracking)
        // For now, approximate from scroll position changes
        const currentSessionMinutes = Math.floor(Math.random() * 20) // TODO: Get from session tracking

        setStats({
          thisSession: currentSessionMinutes,
          thisDocument: Math.floor(docStatsResult.data.totalSeconds / 60),
          thisWeek: Math.floor((weeklyData?.totalSeconds || 0) / 60),
          sparksCreated: docStatsResult.data.totalSparks,
          annotationsCreated: docStatsResult.data.totalAnnotations,
          sessionsCount: docStatsResult.data.totalSessions,
        })
      } catch (error) {
        console.error('Failed to load stats:', error)
      } finally {
        setLoading(false)
      }
    }

    loadStats()
  }, [documentId])

  if (loading) {
    return (
      <div className="p-4 space-y-4">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
      </div>
    )
  }

  return (
    <div className="p-4 space-y-6">
      {/* Reading Time Section */}
      <div className="space-y-4">
        <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
          <Clock className="h-4 w-4" />
          Reading Time
        </h3>

        <div className="space-y-3">
          <div className="space-y-1">
            <div className="text-xs text-muted-foreground">This Session</div>
            <div className="text-2xl font-semibold">{stats?.thisSession || 0} min</div>
          </div>

          <div className="space-y-1">
            <div className="text-xs text-muted-foreground">This Document</div>
            <div className="text-2xl font-semibold">{stats?.thisDocument || 0} min</div>
            <div className="text-xs text-muted-foreground">
              {stats?.sessionsCount || 0} sessions
            </div>
          </div>

          <div className="space-y-1">
            <div className="text-xs text-muted-foreground">This Week</div>
            <div className="text-2xl font-semibold">
              {stats?.thisWeek ? Math.floor(stats.thisWeek / 60) : 0}h {stats?.thisWeek ? stats.thisWeek % 60 : 0}m
            </div>
          </div>
        </div>
      </div>

      {/* Engagement Section */}
      <div className="space-y-4 pt-4 border-t">
        <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
          <TrendingUp className="h-4 w-4" />
          Engagement
        </h3>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <Zap className="h-4 w-4 text-yellow-500" />
            <div className="text-2xl font-semibold">{stats?.sparksCreated || 0}</div>
            <div className="text-xs text-muted-foreground">Sparks</div>
          </div>

          <div className="space-y-1">
            <Highlighter className="h-4 w-4 text-blue-500" />
            <div className="text-2xl font-semibold">{stats?.annotationsCreated || 0}</div>
            <div className="text-xs text-muted-foreground">Annotations</div>
          </div>
        </div>
      </div>

      {/* Progress Section */}
      <div className="space-y-4 pt-4 border-t">
        <h3 className="text-sm font-medium text-muted-foreground">Progress</h3>
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Document</span>
            <span className="font-medium">{Math.round(scrollPosition)}%</span>
          </div>
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-primary transition-all duration-300"
              style={{ width: `${scrollPosition}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
```

#### 2. Add Weekly Stats API Route

**File**: `src/app/api/reading-stats/weekly/route.ts` (NEW)

```typescript
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getCurrentUser } from '@/lib/auth'

/**
 * GET /api/reading-stats/weekly
 * Returns reading stats for the past 7 days
 */
export async function GET() {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 }
      )
    }

    const supabase = await createClient()

    // Get sessions from past 7 days
    const sevenDaysAgo = new Date()
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

    const { data: sessions, error } = await supabase
      .from('reading_sessions')
      .select('duration_seconds')
      .eq('user_id', user.id)
      .gte('ended_at', sevenDaysAgo.toISOString())
      .not('ended_at', 'is', null)

    if (error) {
      console.error('Failed to fetch weekly stats:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const totalSeconds = sessions?.reduce((sum, s) => sum + (s.duration_seconds || 0), 0) || 0

    return NextResponse.json({ totalSeconds })
  } catch (error) {
    console.error('Weekly stats API error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
```

#### 3. Update useSessionTracking to Expose Session Duration

**File**: `src/hooks/useSessionTracking.ts` (MODIFY)

```typescript
// Add state to track current session duration
const [currentSessionMinutes, setCurrentSessionMinutes] = useState(0)

// Update interval to also update local state
useEffect(() => {
  if (!sessionIdRef.current) return

  updateIntervalRef.current = setInterval(async () => {
    const now = new Date()
    const sessionStartTime = sessionStartTimeRef.current

    if (!sessionStartTime) return

    const totalSeconds = Math.floor((now.getTime() - sessionStartTime.getTime()) / 1000)
    const minutes = Math.floor(totalSeconds / 60)

    setCurrentSessionMinutes(minutes)

    // ... rest of update logic
  }, 30000)
}, [])

// Return current session duration
return {
  incrementSparks,
  incrementAnnotations,
  currentSessionMinutes, // NEW
}
```

#### 4. Pass Session Duration to StatsTab

**File**: `src/components/reader/ReaderLayout.tsx` (MODIFY)

```typescript
const { currentSessionMinutes } = useSessionTracking(documentId)

// Pass to LeftPanel, which passes to StatsTab
<LeftPanel
  currentSessionMinutes={currentSessionMinutes}
  // ... other props
/>
```

### Success Criteria

#### Automated Verification:
- [ ] Type check: `npm run type-check`
- [ ] Build succeeds: `npm run build`

#### Manual Verification:
- [ ] StatsTab shows current session time (increments every 30 seconds)
- [ ] StatsTab shows total document time from all sessions
- [ ] StatsTab shows weekly total from past 7 days
- [ ] Progress bar shows scroll position (0-100%)
- [ ] Sparks and annotations counts accurate
- [ ] Loading skeleton appears while fetching

### Service Restarts:
- [ ] Next.js: Auto-reload

---

## Phase 4: "Where Was I?" in BottomPanel

### Overview

Add BottomPanel with "Where was I?" button that generates AI-powered context summary. Uses Gemini to summarize completed sections and remind user of their recent sparks/annotations. Anti-spoiler: only summarizes content before current position.

**Success**: Click "Where was I?" → 5-10 second generation → Rich summary appears with sections completed + user's recent activity

### Changes Required

#### 1. Database Migration - Section Summaries

**File**: `supabase/migrations/054_section_summaries.sql` (NEW)

```sql
-- Section summaries table
-- Caches AI-generated summaries of completed sections for "Where was I?" feature
CREATE TABLE section_summaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Section identification
  heading_path TEXT[] NOT NULL,
  chunk_range_start INTEGER NOT NULL,
  chunk_range_end INTEGER NOT NULL,

  -- Summary content
  summary TEXT NOT NULL,
  summary_tokens INTEGER,

  -- Validity tracking
  valid_up_to_chunk INTEGER NOT NULL,  -- Summary valid until this chunk
  generated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(document_id, user_id, heading_path)
);

CREATE INDEX idx_section_summaries_doc_user
  ON section_summaries(document_id, user_id, valid_up_to_chunk DESC);
```

#### 2. Server Action - Generate "Where Was I?" Summary

**File**: `src/app/actions/where-was-i.ts` (NEW)

```typescript
'use server'

import { getCurrentUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { google } from '@ai-sdk/google'
import { generateText } from 'ai'

interface WhereWasISummary {
  completedSections: Array<{
    heading: string
    summary: string
  }>
  currentSection: {
    heading: string
    position: string
  }
  recentActivity: {
    sparks: Array<{ content: string }>
    annotations: Array<{ text: string }>
  }
  aiSummary: string
  generatedAt: Date
}

/**
 * Generates "Where was I?" context summary.
 * Anti-spoiler: Only includes content before current position.
 *
 * Cost: ~$0.01 per summary (13k input tokens + 500 output tokens)
 */
export async function generateWhereWasI(
  documentId: string,
  currentChunkIndex: number
): Promise<{
  success: boolean
  data?: WhereWasISummary
  error?: string
}> {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return { success: false, error: 'Not authenticated' }
    }

    const supabase = await createClient()

    // 1. Get all chunks up to current position
    const { data: allChunks, error: chunksError } = await supabase
      .from('chunks')
      .select('id, chunk_index, content, heading_path')
      .eq('document_id', documentId)
      .lte('chunk_index', currentChunkIndex)
      .order('chunk_index')

    if (chunksError || !allChunks) {
      return { success: false, error: 'Failed to load chunks' }
    }

    // 2. Get current chunk to identify current section
    const currentChunk = allChunks.find(c => c.chunk_index === currentChunkIndex)
    const currentSectionHeading = currentChunk?.heading_path?.[0] || 'Unknown'

    // 3. Group chunks by top-level section
    const sectionMap = new Map<string, typeof allChunks>()

    allChunks.forEach(chunk => {
      const heading = chunk.heading_path?.[0] || 'Unknown'
      if (!sectionMap.has(heading)) {
        sectionMap.set(heading, [])
      }
      sectionMap.get(heading)!.push(chunk)
    })

    // 4. For completed sections, get or generate summaries
    const completedSections: Array<{ heading: string; summary: string }> = []

    for (const [heading, chunks] of sectionMap.entries()) {
      if (heading === currentSectionHeading) continue // Skip current section

      // Check for cached summary
      const { data: cached } = await supabase
        .from('section_summaries')
        .select('summary')
        .eq('document_id', documentId)
        .eq('user_id', user.id)
        .contains('heading_path', [heading])
        .single()

      if (cached) {
        completedSections.push({ heading, summary: cached.summary })
        continue
      }

      // Generate new summary for this section
      const sectionText = chunks.map(c => c.content).join('\n\n')
      const summary = await generateSectionSummary(heading, sectionText)

      // Cache it
      await supabase.from('section_summaries').insert({
        document_id: documentId,
        user_id: user.id,
        heading_path: [heading],
        chunk_range_start: chunks[0].chunk_index,
        chunk_range_end: chunks[chunks.length - 1].chunk_index,
        summary,
        summary_tokens: Math.ceil(summary.length / 4), // Rough estimate
        valid_up_to_chunk: currentChunkIndex,
      })

      completedSections.push({ heading, summary })
    }

    // 5. Get user's recent sparks and annotations (last 5 of each)
    const recentChunkIds = allChunks.slice(-10).map(c => c.id)

    const { data: sparks } = await supabase
      .from('entities')
      .select(`
        id,
        components!inner(data)
      `)
      .eq('user_id', user.id)
      .contains('components.component_type', ['spark'])
      .in('components.source_chunk_id', recentChunkIds)
      .order('created_at', { ascending: false })
      .limit(5)

    const { data: annotations } = await supabase
      .from('entities')
      .select(`
        id,
        components!inner(data)
      `)
      .eq('user_id', user.id)
      .contains('components.component_type', ['annotation'])
      .in('components.source_chunk_id', recentChunkIds)
      .order('created_at', { ascending: false })
      .limit(5)

    // 6. Generate final AI summary
    const aiSummary = await generateAISummary(
      documentId,
      completedSections,
      currentSectionHeading,
      Math.round((currentChunkIndex / allChunks.length) * 100),
      sparks || [],
      annotations || []
    )

    return {
      success: true,
      data: {
        completedSections,
        currentSection: {
          heading: currentSectionHeading,
          position: `${Math.round((currentChunkIndex / allChunks.length) * 100)}% through section`,
        },
        recentActivity: {
          sparks: (sparks || []).map(s => ({
            content: (s.components as any[])?.[0]?.data?.content || '',
          })),
          annotations: (annotations || []).map(a => ({
            text: (a.components as any[])?.[0]?.data?.text || '',
          })),
        },
        aiSummary,
        generatedAt: new Date(),
      },
    }
  } catch (error) {
    console.error('[generateWhereWasI] Exception:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

/**
 * Generates summary for a single section (150-200 words).
 * Used for caching completed sections.
 */
async function generateSectionSummary(heading: string, text: string): Promise<string> {
  const prompt = `Summarize this section in 150-200 words, focusing on key themes, events, and concepts. Do not spoil future content.

Section: ${heading}

Content:
${text.slice(0, 50000)}  // Limit to ~50k chars

Summary:`

  try {
    const { text: summaryText } = await generateText({
      model: google('gemini-2.0-flash-exp'),
      prompt,
      maxTokens: 300,
      temperature: 0.1,
    })

    return summaryText.trim()
  } catch (error: any) {
    console.error('Section summary generation failed:', error.message)
    // Fallback: Return first 200 words of section
    return text.split(' ').slice(0, 200).join(' ') + '...'
  }
}

/**
 * Generates final "Where was I?" summary using all context.
 */
async function generateAISummary(
  documentId: string,
  completedSections: Array<{ heading: string; summary: string }>,
  currentSection: string,
  positionPercent: number,
  sparks: any[],
  annotations: any[]
): Promise<string> {
  const supabase = await createClient()
  const { data: doc } = await supabase
    .from('documents')
    .select('title')
    .eq('id', documentId)
    .single()

  const prompt = `You're helping a reader resume reading "${doc?.title || 'this document'}". They left off at ${positionPercent}% through the current section "${currentSection}".

Give them a warm, conversational "where you left off" summary that:
1. Briefly reminds them of major themes/events from completed sections
2. Mentions their own recent sparks/annotations to jog memory
3. CRITICAL: Do not mention or hint at anything beyond their current position

Completed Sections:
${completedSections.map(s => `${s.heading}: ${s.summary}`).join('\n\n')}

Current Section: ${currentSection} (${positionPercent}% through)

Their recent sparks:
${sparks.map((s, i) => `${i + 1}. ${s.content}`).join('\n')}

Their recent annotations:
${annotations.map((a, i) => `${i + 1}. ${a.text}`).join('\n')}

Provide a warm, conversational summary (200-300 words):`

  try {
    const { text: summaryText } = await generateText({
      model: google('gemini-2.0-flash-exp'),
      prompt,
      maxTokens: 500,
      temperature: 0.3,
    })

    return summaryText.trim()
  } catch (error: any) {
    console.error('AI summary generation failed:', error.message)
    // Fallback: Simple text summary
    return `You're reading "${doc?.title}" and left off ${positionPercent}% through "${currentSection}". You've completed ${completedSections.length} sections and created ${sparks.length} sparks and ${annotations.length} annotations.`
  }
}
```

#### 3. Create BottomPanel Component

**File**: `src/components/reader/BottomPanel/BottomPanel.tsx` (NEW)

```typescript
'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { MapPin, Loader2 } from 'lucide-react'
import { WhereWasIModal } from './WhereWasIModal'
import { generateWhereWasI } from '@/app/actions/where-was-i'
import { useReaderStore } from '@/stores/reader-store'
import { toast } from 'sonner'

interface BottomPanelProps {
  documentId: string
}

export function BottomPanel({ documentId }: BottomPanelProps) {
  const [showModal, setShowModal] = useState(false)
  const [summary, setSummary] = useState<any>(null)
  const [loading, setLoading] = useState(false)

  const visibleChunks = useReaderStore(state => state.visibleChunks)
  const currentChunkIndex = visibleChunks.length > 0 ? visibleChunks[0].chunk_index : 0

  async function handleWhereWasI() {
    setLoading(true)

    try {
      const result = await generateWhereWasI(documentId, currentChunkIndex)

      if (!result.success || !result.data) {
        toast.error('Failed to generate summary', {
          description: result.error || 'Unknown error',
        })
        return
      }

      setSummary(result.data)
      setShowModal(true)
    } catch (error) {
      toast.error('Failed to generate summary')
      console.error(error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      {/* Compact bar */}
      <div className="fixed bottom-0 left-0 right-0 h-14 border-t bg-background z-30 flex items-center justify-center">
        <Button
          variant="ghost"
          onClick={handleWhereWasI}
          disabled={loading}
          className="flex items-center gap-2"
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <MapPin className="h-4 w-4" />
          )}
          {loading ? 'Generating summary...' : 'Where was I?'}
        </Button>
      </div>

      {/* Summary modal */}
      {showModal && summary && (
        <WhereWasIModal
          open={showModal}
          onOpenChange={setShowModal}
          summary={summary}
        />
      )}
    </>
  )
}
```

#### 4. Create WhereWasIModal Component

**File**: `src/components/reader/BottomPanel/WhereWasIModal.tsx` (NEW)

```typescript
'use client'

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { Zap, Highlighter } from 'lucide-react'

interface WhereWasIModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  summary: {
    completedSections: Array<{ heading: string; summary: string }>
    currentSection: { heading: string; position: string }
    recentActivity: {
      sparks: Array<{ content: string }>
      annotations: Array<{ text: string }>
    }
    aiSummary: string
    generatedAt: Date
  }
}

export function WhereWasIModal({ open, onOpenChange, summary }: WhereWasIModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle>Where You Left Off</DialogTitle>
        </DialogHeader>

        <ScrollArea className="h-full max-h-[60vh]">
          <div className="space-y-6 p-4">
            {/* AI Summary */}
            <div className="prose prose-sm dark:prose-invert">
              <p className="text-base leading-relaxed">{summary.aiSummary}</p>
            </div>

            {/* Current Section */}
            <div className="p-4 bg-primary/5 rounded-lg border">
              <div className="text-sm font-medium text-primary">Current Section</div>
              <div className="text-lg font-semibold mt-1">{summary.currentSection.heading}</div>
              <div className="text-sm text-muted-foreground mt-1">
                {summary.currentSection.position}
              </div>
            </div>

            {/* Recent Activity */}
            {(summary.recentActivity.sparks.length > 0 || summary.recentActivity.annotations.length > 0) && (
              <div className="space-y-3">
                <div className="text-sm font-medium">Your Recent Activity</div>

                {summary.recentActivity.sparks.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Zap className="h-3 w-3" />
                      Recent Sparks
                    </div>
                    {summary.recentActivity.sparks.map((spark, i) => (
                      <div key={i} className="text-sm p-2 bg-muted rounded">
                        {spark.content}
                      </div>
                    ))}
                  </div>
                )}

                {summary.recentActivity.annotations.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Highlighter className="h-3 w-3" />
                      Recent Annotations
                    </div>
                    {summary.recentActivity.annotations.map((annotation, i) => (
                      <div key={i} className="text-sm p-2 bg-muted rounded">
                        {annotation.text}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Completed Sections */}
            {summary.completedSections.length > 0 && (
              <div className="space-y-3">
                <div className="text-sm font-medium">Completed Sections</div>
                {summary.completedSections.map((section, i) => (
                  <div key={i} className="space-y-1">
                    <div className="text-sm font-medium">{section.heading}</div>
                    <div className="text-sm text-muted-foreground">{section.summary}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  )
}
```

#### 5. Integrate BottomPanel into ReaderLayout

**File**: `src/components/reader/ReaderLayout.tsx` (MODIFY)

```typescript
import { BottomPanel } from './BottomPanel/BottomPanel'

// In JSX, add BottomPanel at the end:
return (
  <div className="flex flex-col h-screen">
    <DocumentHeader {...props} />

    <div className="flex-1 overflow-hidden relative">
      <LeftPanel {...props} />
      <DocumentViewer {...props} />
    </div>

    <RightPanel {...props} />

    {/* Bottom panel with "Where was I?" */}
    <BottomPanel documentId={documentId} />

    {/* ... modals */}
  </div>
)
```

### Success Criteria

#### Automated Verification:
- [ ] Migration applies: `npx supabase db reset`
- [ ] Type check: `npm run type-check`
- [ ] Build succeeds: `npm run build`

#### Manual Verification:
- [ ] BottomPanel appears at bottom of screen
- [ ] Click "Where was I?" → Loading state shows
- [ ] After 5-10 seconds → Modal opens with summary
- [ ] Summary includes: AI narrative, current section, completed sections, recent sparks/annotations
- [ ] Summary does NOT mention content after current position (anti-spoiler)
- [ ] Check `section_summaries` table → Summaries cached for completed sections
- [ ] Click again → Faster (uses cached summaries)
- [ ] Cost reasonable: ~$0.01 per generation

### Service Restarts:
- [ ] Supabase: `npx supabase db reset` (schema changed)
- [ ] Next.js: Auto-reload

---

## Testing Strategy

### Unit Tests

**Focus areas**:
- Session tracking logic (start/update/end)
- Stats aggregation calculations
- Outline building from heading_path
- Summary caching logic

**Skip**:
- UI component rendering (tested manually)
- API routes (integration tests)

### Integration Tests

**Critical paths**:
1. Session lifecycle: Create → Update → End
2. Stats calculation: Weekly totals, document totals
3. "Where Was I?" generation: Cache hit/miss, summary quality

### Manual Testing Checklist

**Phase 1 - LeftPanel**:
- [ ] Panel collapses/expands smoothly
- [ ] Outline shows all sections
- [ ] Click section scrolls to chunk
- [ ] Connection indicators toggle
- [ ] View modes work (explore/focus/study)

**Phase 2 - Session Tracking**:
- [ ] Session starts automatically
- [ ] Updates every 30 seconds
- [ ] Ends on blur/close
- [ ] Counters increment (sparks/annotations)

**Phase 3 - Stats**:
- [ ] Current session time accurate
- [ ] Document total correct
- [ ] Weekly total sums past 7 days
- [ ] Progress bar matches scroll

**Phase 4 - Where Was I?**:
- [ ] Summary generates in <10 seconds
- [ ] Anti-spoiler: no future content
- [ ] Cached summaries used on re-generation
- [ ] Modal displays all sections

---

## Performance Considerations

**Session Tracking**:
- 30-second update interval (not real-time, but sufficient)
- Single DB write every 30s (negligible load)
- End session on blur/beforeunload (graceful)

**Stats Queries**:
- Direct queries to `reading_sessions` (no caching needed for personal tool)
- Weekly query: ~10-50 rows max (fast)
- Document query: ~5-20 rows max (fast)

**"Where Was I?"**:
- First generation: 5-10 seconds (Gemini API calls)
- Cached sections: Instant (DB lookup)
- Cost: ~$0.01 per generation (~13k input + 500 output tokens)
- Heavy user (20 generations/month): ~$0.20/month

---

## Migration Notes

**Database Changes**:
1. `053_reading_sessions.sql` - Session tracking
2. `054_section_summaries.sql` - AI summary caching

**No Data Migration Required**:
- New tables, no changes to existing data
- Safe to apply with `npx supabase db reset`

**Rollback Strategy**:
- If issues arise, drop new tables:
  ```sql
  DROP TABLE IF EXISTS reading_sessions;
  DROP TABLE IF EXISTS section_summaries;
  ```

---

## References

- **Architecture**: `docs/ARCHITECTURE.md`
- **Pipeline**: `docs/PROCESSING_PIPELINE.md`
- **Testing**: `docs/testing/TESTING_RULES.md`
- **Zustand**: `docs/ZUSTAND_RULES.md`
- **Server Actions**: `src/app/actions/annotations.ts:39-135` (pattern example)
- **Gemini Integration**: `worker/lib/markdown-cleanup-ai.ts:76-146` (non-streaming pattern)
- **RightPanel**: `src/components/sidebar/RightPanel.tsx:1-241` (collapse pattern)

---

## Next Steps (Post-MVP)

After core features are working:

1. **Chat Interface** - Multi-turn conversation with document context
2. **Gemini Context Caching** - 75% cost reduction for chat
3. **AI Suggestions** - Proactive spark/connection generation
4. **History Tab** - Session timeline visualization
5. **Animations & Polish** - Smooth transitions, loading states
6. **Mobile Responsive** - Adapt panels for smaller screens

---

**End of Plan**

This focused 3-week plan delivers the core reader features without the complexity of the full 8-week vision. It tests AI integration in a bounded feature ("Where Was I?") before expanding to more complex systems like chat.
