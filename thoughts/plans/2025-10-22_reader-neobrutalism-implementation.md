# Reader + Neobrutalism Implementation Plan

**Date**: 2025-10-22
**Timeline**: 4-5 weeks
**Focus**: LeftPanel navigation, session tracking, AI "Where Was I?" feature, comprehensive neobrutalist styling

---

## Overview

Implement complete reader enhancement with neobrutalist design system: add LeftPanel (Outline/Stats/Heatmap tabs), automatic session tracking with engagement threshold, StatsTab with reading metrics, AI-powered "Where Was I?" context summary in BottomPanel, and comprehensive neobrutalist restyling of all reader components.

**Why**: Transform the reader from basic document viewer into sophisticated reading environment with navigation aids, activity tracking, and contextual AI assistance, all wrapped in bold, flat neobrutalist aesthetic.

---

## Current State Analysis

### What Exists

**Reader Architecture** (`src/components/reader/ReaderLayout.tsx:93`):
- 4-Store Zustand orchestration (reader, ui, connection, annotation stores)
- RightPanel with 7 icon-only tabs (connections, sparks, cards, tune, annotations, quality, review)
- 3 view modes (explore, focus, study) with conditional rendering
- Framer Motion spring animations for panel collapse/expand
- VirtualizedReader with scroll tracking (0-100%)

**Styling System**:
- `styles/neobrutalism.css` - Already exists with design tokens!
- `components.json` - shadcn/ui configured with Tailwind 4.0
- 27 shadcn/ui components in `components/ui/`
- Existing patterns: brutalist.css, tactical.css, neobrutalism.css

**Gemini Integration** (`lib/sparks/title-generator.ts:15`):
- Vercel AI SDK (`ai` + `@ai-sdk/google`) already installed
- `generateText()` pattern with `google('gemini-2.0-flash-exp')`
- Server Action pattern with fallback logic

**Patterns to Copy**:
- **Panel Collapse**: RightPanel spring animation (`RightPanel.tsx:112-115`)
- **Icon Grid Tabs**: 7-column grid with badges (`RightPanel.tsx:139-170`)
- **Server Actions**: Multi-step pipeline (`app/actions/sparks.ts:36-165`)
- **Zustand Stores**: Persistence with partialize (`stores/admin/admin-panel.ts:1-73`)

### What's Missing

**Reader Features**:
- ❌ No LeftPanel component
- ❌ No Outline tab (document navigation via heading_path)
- ❌ No session tracking (reading_sessions table doesn't exist)
- ❌ No StatsTab (reading time, engagement metrics)
- ❌ No "Where Was I?" AI feature
- ❌ No BottomPanel (contextual bar)

**Styling**:
- ❌ Neobrutalist tokens defined but not applied to reader components
- ❌ RightPanel uses default shadcn styling (not brutalist)
- ❌ DocumentHeader uses standard Tailwind (no bold borders/shadows)
- ❌ Modals (QuickSparkCapture) not brutalist-styled

**Key Discoveries**:
- Migration 062 is latest (`062_spark_portability_orphan_survival.sql`)
- `chunks` table has `heading_path` (TEXT[]) and `heading_level` (INTEGER) - ready for Outline
- No `reading_sessions` or `section_summaries` tables exist
- ReaderLayout already supports view mode switching - can enhance without breaking

---

## Desired End State

### User Experience

1. **Opens document** → LeftPanel shows hierarchical outline with connection density indicators
2. **Scrolls/interacts for 30+ seconds OR scrolls >10%** → Session tracking begins silently
3. **Clicks section in outline** → Jumps to that section, connections auto-load in RightPanel
4. **Reads for 15 minutes** → StatsTab shows "15 min this session, 47 min total, 2h 13min this week"
5. **Closes document, returns 2 days later** → Clicks "Where was I?" in BottomPanel → Gets rich AI summary
6. **All panels and UI** → Bold 3-4px borders, hard 6px shadows, flat colors, neobrutalist aesthetic throughout

### Technical Specification

**LeftPanel**:
- Fixed left position (mirrors RightPanel pattern)
- 3 tabs: Outline, Stats, Heatmap
- Collapse to 48px, expand to 320px
- Framer Motion spring animations
- Neobrutalist styling (bold borders, flat colors, hard shadows)

**Session Tracking**:
- Starts after threshold: 30 seconds OR 10% scroll (whichever first)
- Updates every 30 seconds (DB write)
- Tracks: time, position, sparks, annotations
- Ends on: blur, beforeunload, 5min idle

**Stats Display**:
- This session (live counter)
- This document (total from all sessions)
- This week (past 7 days aggregate)
- Progress bar (scroll position)
- Engagement counts (sparks, annotations)

**"Where Was I?"**:
- BottomPanel compact bar (56px persistent)
- AI summary generation (~5-10 sec)
- Section summaries cached (reuse for speed)
- Anti-spoiler (only content before current position)

**Neobrutalist Styling**:
- All reader components restyled
- RightPanel option to replace with brutalist versions
- DocumentHeader with bold borders
- Modals and overlays brutalist-styled

---

## Rhizome Architecture

- **Module**: Main App (Next.js) - All reader features are frontend
- **Storage**: Database (queryable data) for sessions/summaries
  - Source of truth: Database for sessions, Storage for cached summaries (portability)
- **Migration**: Yes - **063_reading_sessions.sql**, **064_section_summaries.sql**
- **Test Tier**: Stable (fix when broken) - Reader features, not deployment-critical
- **Pipeline Stages**: N/A (reader UI only, no document processing changes)
- **Engines**: N/A (uses existing connections, no new engine logic)

---

## What We're NOT Doing

**Out of Scope** (defer to later):
- ❌ Chat interface (too complex, test AI with "Where Was I?" first)
- ❌ AI suggestions (weekly background jobs, learning system)
- ❌ Gemini context caching for chat (optimization, not required for MVP)
- ❌ History tab (session timeline visualization - nice-to-have)
- ❌ Mobile responsive design (desktop-first, responsive later)
- ❌ Materialized views for stats (direct queries sufficient for personal tool)
- ❌ Flashcard system enhancements (UI placeholder already exists)
- ❌ Study mode implementation (view mode exists but functionality incomplete)

---

## Implementation Approach

**Strategy**: Incremental, testable phases with neobrutalist styling applied throughout

### Phase Sequence:

1. **Neobrutalism Setup** - Configure registry, install base components, create design tokens
2. **LeftPanel Foundation** - Panel container + Outline/Stats/Heatmap tabs (brutalist-styled)
3. **Session Tracking** - Silent background tracking with threshold trigger
4. **StatsTab** - Populate with live reading metrics
5. **BottomPanel + "Where Was I?"** - AI-powered context summary
6. **Neobrutalist Restyling** - Apply brutalist styling to existing reader components

### Key Principles:

- **Mirror RightPanel patterns**: Fixed positioning, framer-motion animations, icon grid tabs
- **Neobrutalist throughout**: Bold borders (3-4px), hard shadows (6px offset), flat colors
- **Gemini via Vercel AI SDK**: `generateText()` with `google('gemini-2.0-flash-exp')`
- **Server Actions for mutations**: Multi-step pipeline (AI → Database → Storage → Cache)
- **Zustand for state**: New `session-store.ts` for tracking, extend `ui-store.ts` for LeftPanel
- **Threshold tracking**: Prevent accidental session starts (30s OR 10% scroll)

---

## Phase 1: Neobrutalism Setup & Registry Integration

### Overview

Configure neobrutalism component registry, install base components, verify `neobrutalism.css` tokens, and create utility classes for brutalist styling.

**Success**: Registry configured, base components installed, `neo-border` and `neo-shadow` classes work

### Changes Required

#### 1. Verify Neobrutalism CSS Tokens

**File**: `src/styles/neobrutalism.css` (VERIFY)

**Check for** (should already exist):
```css
@layer base {
  :root {
    --neo-border-sm: 2px;
    --neo-border-md: 3px;
    --neo-border-lg: 4px;
    --neo-shadow-offset: 6px;
    --neo-shadow-sm: 4px 4px 0px 0px hsl(var(--foreground));
    --neo-shadow-md: 6px 6px 0px 0px hsl(var(--foreground));
    --neo-shadow-lg: 8px 8px 0px 0px hsl(var(--foreground));
  }
}

@layer utilities {
  .neo-border {
    border: var(--neo-border-md) solid hsl(var(--foreground));
  }
  .neo-shadow {
    box-shadow: var(--neo-shadow-md);
  }
  .neo-hover {
    transition: all 0.15s ease;
  }
  .neo-hover:hover {
    transform: translate(2px, 2px);
    box-shadow: 3px 3px 0px 0px hsl(var(--foreground));
  }
}
```

**If missing**: Add all neobrutalist design tokens and utility classes.

#### 2. Configure Neobrutalism Registry

**File**: `components.json` (MODIFY)

**Add neobrutalism registry**:
```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "new-york",
  "tailwind": {
    "config": "tailwind.config.ts",
    "css": "src/app/globals.css",
    "baseColor": "neutral",
    "cssVariables": true,
    "prefix": ""
  },
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils",
    "ui": "@/components/ui",
    "lib": "@/lib",
    "hooks": "@/hooks"
  },
  "registries": {
    "@neobrutalism": "https://v3.neobrutalism.dev/r/{name}.json"
  }
}
```

#### 3. Install Base Neobrutalist Components

**Commands**:
```bash
# Install neobrutalist button (test installation)
npx shadcn add @neobrutalism/button

# Install neobrutalist card
npx shadcn add @neobrutalism/card

# Install neobrutalist tabs
npx shadcn add @neobrutalism/tabs

# Install neobrutalist badge
npx shadcn add @neobrutalism/badge
```

**Verify**: Components appear in `src/components/ui/` with `-neo` suffix or in `src/components/neobrutalism/`

**Note**: If registry doesn't support `@neobrutalism/` prefix, manually fork components following patterns from `thoughts/ideas/2025-10-20_cross-library-brutalist-restyling.md`.

#### 4. Create Brutalist Component Directory

**File**: `src/components/brutalist/README.md` (NEW)

```markdown
# Brutalist Components for Rhizome Reader

Neobrutalist-styled components forked from registry or restyled from shadcn/ui.

## Design Principles
- Flat colors (no gradients)
- Bold borders (3-4px)
- Hard shadows (6px offset, no blur)
- Strategic color for meaning (badges, highlights, status)
- Geometric shapes (rectangles, minimal rounding)

## Components

| Component | Origin | Modifications |
|-----------|--------|---------------|
| button-neo.tsx | @neobrutalism/button | Minimal (kept as-is) |
| card-neo.tsx | @neobrutalism/card | Minimal (kept as-is) |
| panel-neo.tsx | Custom | Based on RightPanel pattern |
| tabs-neo.tsx | @neobrutalism/tabs | Enhanced with icon grid |

## Usage

Import from `@/components/brutalist/`:
\`\`\`tsx
import { ButtonNeo } from '@/components/brutalist/button-neo'
import { CardNeo } from '@/components/brutalist/card-neo'
\`\`\`
```

#### 5. Test Brutalist Styling

**File**: `src/app/design/page.tsx` (MODIFY - add test section)

**Add to BrutalismPlayground tab**:
```tsx
<div className="space-y-6">
  <h3 className="text-lg font-semibold">Neobrutalist Components Test</h3>

  {/* Test neo-border */}
  <div className="neo-border p-4 bg-background">
    <p>This div has neo-border (3px solid)</p>
  </div>

  {/* Test neo-shadow */}
  <div className="neo-border neo-shadow p-4 bg-background">
    <p>This div has neo-border + neo-shadow (6px offset)</p>
  </div>

  {/* Test neo-hover */}
  <button className="neo-border neo-shadow neo-hover p-4 bg-background">
    Hover me for translation effect
  </button>

  {/* Test installed components */}
  {typeof ButtonNeo !== 'undefined' && (
    <ButtonNeo variant="default" size="lg">
      Neobrutalist Button
    </ButtonNeo>
  )}
</div>
```

### Success Criteria

#### Automated Verification:
- [ ] Build succeeds: `npm run build`
- [ ] Type check: `npm run type-check`
- [ ] No console errors on /design page load

#### Manual Verification:
- [ ] `/design` page → BrutalismPlayground tab visible
- [ ] `neo-border` class applies 3px solid border
- [ ] `neo-shadow` class applies 6px hard shadow
- [ ] `neo-hover` class translates on hover (2px, 2px)
- [ ] Installed neobrutalist components render (if registry worked)
- [ ] Borders are bold and flat (no blur or gradients)

**Implementation Note**: If neobrutalism registry installation fails, proceed with manual forking from shadcn components using restyling patterns. Document which approach was used in `components/brutalist/README.md`.

### Service Restarts:
- [ ] Next.js: Auto-reload should work (verify HMR)

---

## Phase 2: LeftPanel with Outline/Stats/Heatmap Tabs

### Overview

Create LeftPanel component mirroring RightPanel's collapse pattern, add Outline tab for document navigation, move ConnectionHeatmap to HeatmapTab, create StatsTab placeholder. Apply neobrutalist styling throughout.

**Success**: LeftPanel appears, collapses smoothly, Outline shows sections, click-to-jump works

### Changes Required

#### 1. Create LeftPanel Container Component

**File**: `src/components/reader/LeftPanel/LeftPanel.tsx` (NEW)

```tsx
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
      className="fixed left-0 top-14 bottom-0 border-r neo-border z-40 bg-background"
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
      {/* Floating toggle button */}
      <Button
        variant="ghost"
        size="icon"
        className="absolute -right-4 top-8 z-50 rounded-full border neo-border neo-shadow bg-background"
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
            <div className="grid grid-cols-3 border-b neo-border p-2 gap-1">
              {TABS.map(tab => {
                const Icon = tab.icon
                const isActive = activeTab === tab.id

                return (
                  <motion.button
                    key={tab.id}
                    className={cn(
                      'p-2 rounded flex flex-col items-center justify-center gap-1 transition-colors neo-border',
                      isActive
                        ? 'bg-primary/10 text-primary neo-shadow'
                        : 'hover:bg-muted text-muted-foreground hover:text-foreground'
                    )}
                    onClick={() => setActiveTab(tab.id)}
                    title={tab.label}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                  >
                    <Icon className="h-4 w-4" />
                    <span className="text-xs font-bold">{tab.label}</span>
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

**Neobrutalist Styling**:
- Border: `neo-border` on panel and tabs
- Shadow: `neo-shadow` on active tabs and toggle button
- Typography: `font-bold` on tab labels
- No rounded corners on panel (brutalist rectangles)

#### 2. Create OutlineTab Component

**File**: `src/components/reader/LeftPanel/OutlineTab.tsx` (NEW)

```tsx
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
      <div className="flex items-center justify-between pb-2 border-b neo-border">
        <Label htmlFor="show-connections" className="text-sm font-bold">
          Connections
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
              'w-full text-left p-2 rounded transition-colors flex items-center justify-between gap-2 neo-border',
              item.isCurrentSection
                ? 'bg-primary/10 border-l-4 border-primary neo-shadow'
                : 'hover:bg-muted neo-hover'
            )}
            style={{ paddingLeft: `${8 + item.level * 12}px` }}
          >
            <span className={cn(
              'text-sm font-bold',
              item.isCurrentSection ? 'text-primary' : 'text-muted-foreground'
            )}>
              {item.title}
            </span>

            {showConnectionIndicators && item.connectionCount > 0 && (
              <Badge
                variant={item.connectionCount > 10 ? 'default' : 'secondary'}
                className="flex items-center gap-1 text-xs neo-border"
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

**Neobrutalist Styling**:
- All buttons: `neo-border` with `neo-hover` effect
- Current section: `neo-shadow` + bold left border
- Badges: `neo-border` on connection counts
- Typography: `font-bold` throughout

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

    // Get all chunks for document
    const { data: chunks, error: chunksError } = await supabase
      .from('chunks')
      .select('id, heading_path')
      .eq('document_id', documentId)

    if (chunksError || !chunks) {
      console.error('Failed to fetch chunks:', chunksError)
      return NextResponse.json({ error: chunksError?.message }, { status: 500 })
    }

    // Get connection counts for all chunks
    const chunkIds = chunks.map(c => c.id)
    const { data: connections, error: connError } = await supabase
      .from('connections')
      .select('source_chunk_id')
      .in('source_chunk_id', chunkIds)

    if (connError) {
      console.error('Failed to fetch connections:', connError)
      return NextResponse.json({ error: connError.message }, { status: 500 })
    }

    // Group by heading_path and count connections
    const counts: Record<string, number> = {}

    chunks.forEach(chunk => {
      if (!chunk.heading_path || chunk.heading_path.length === 0) return

      const pathKey = chunk.heading_path.join('|')
      const chunkConnections = connections?.filter(c => c.source_chunk_id === chunk.id).length || 0

      counts[pathKey] = (counts[pathKey] || 0) + chunkConnections
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

#### 4. Move ConnectionHeatmap to HeatmapTab

**File**: `src/components/reader/LeftPanel/HeatmapTab.tsx` (NEW)

```tsx
'use client'

import { ConnectionHeatmap } from '../ConnectionHeatmap'

interface HeatmapTabProps {
  documentId: string
  chunks: any[]
  onNavigateToChunk: (chunkId: string) => void
}

export function HeatmapTab({ documentId, chunks, onNavigateToChunk }: HeatmapTabProps) {
  return (
    <div className="p-4 space-y-4">
      <div className="text-sm text-muted-foreground font-bold">
        Connection density visualization. Darker areas = more connections.
      </div>

      <div className="neo-border p-2">
        <ConnectionHeatmap
          documentId={documentId}
          chunks={chunks}
        />
      </div>
    </div>
  )
}
```

#### 5. Create StatsTab Placeholder

**File**: `src/components/reader/LeftPanel/StatsTab.tsx` (NEW)

```tsx
'use client'

export function StatsTab({ documentId }: { documentId: string }) {
  return (
    <div className="p-4 space-y-4">
      <div className="text-sm text-muted-foreground font-bold">
        Reading statistics will appear here after Phase 4.
      </div>

      {/* Placeholder sections with neobrutalist styling */}
      <div className="space-y-2 neo-border p-4">
        <h3 className="font-bold text-sm">This Session</h3>
        <div className="text-2xl font-bold">-- min</div>
      </div>

      <div className="space-y-2 neo-border p-4">
        <h3 className="font-bold text-sm">This Document</h3>
        <div className="text-2xl font-bold">-- min</div>
      </div>

      <div className="space-y-2 neo-border p-4">
        <h3 className="font-bold text-sm">This Week</h3>
        <div className="text-2xl font-bold">-- min</div>
      </div>
    </div>
  )
}
```

**Neobrutalist Styling**: `neo-border` on all stat cards, `font-bold` typography

#### 6. Integrate LeftPanel into ReaderLayout

**File**: `src/components/reader/ReaderLayout.tsx` (MODIFY)

Add imports:
```tsx
import { LeftPanel } from './LeftPanel/LeftPanel'
```

Add state for LeftPanel:
```tsx
const [leftPanelCollapsed, setLeftPanelCollapsed] = useState(false)
```

Sync LeftPanel with view mode:
```tsx
useEffect(() => {
  if (viewMode === 'focus') {
    setLeftPanelCollapsed(true)
  } else if (viewMode === 'explore') {
    setLeftPanelCollapsed(false)
  }
}, [viewMode])
```

Add handler for navigation:
```tsx
const handleNavigateToChunk = (chunkId: string) => {
  // Trigger scroll to chunk
  const scrollToChunk = useReaderStore.getState().scrollToChunk
  scrollToChunk(chunkId)
}
```

In JSX, add LeftPanel before main content area:
```tsx
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

  {/* Remove ConnectionHeatmap from here - now in HeatmapTab */}

  <DocumentViewer {...viewerProps} />
</div>
```

#### 7. Update ReaderStore for Scroll-to-Chunk

**File**: `src/stores/reader-store.ts` (MODIFY)

Add action:
```tsx
scrollToChunk: (chunkId: string) => {
  set({ scrollToChunkId: chunkId })
  // Clear after 100ms (VirtualizedReader will handle scroll)
  setTimeout(() => set({ scrollToChunkId: null }), 100)
}
```

### Success Criteria

#### Automated Verification:
- [ ] Build succeeds: `npm run build`
- [ ] Type check: `npm run type-check`
- [ ] No console errors on reader page load

#### Manual Verification:
- [ ] LeftPanel appears on left side (opposite RightPanel)
- [ ] Panel collapses to 48px, expands to 320px with smooth animation
- [ ] Toggle button has neobrutalist styling (bold border + shadow)
- [ ] 3 tabs visible: Outline, Stats, Heatmap
- [ ] OutlineTab shows document heading hierarchy with bold borders
- [ ] Connection indicators toggle on/off
- [ ] Clicking section scrolls to that chunk with highlight
- [ ] Current section highlighted with shadow + bold left border
- [ ] HeatmapTab shows existing ConnectionHeatmap component
- [ ] StatsTab shows placeholder text with brutalist cards
- [ ] View modes work: explore (expanded), focus (hidden), study (expanded)
- [ ] All components have neobrutalist styling (bold borders, hard shadows, flat colors)

**Implementation Note**: Pause after automated verification passes for manual confirmation before proceeding to Phase 3.

### Service Restarts:
- [ ] Next.js: Auto-reload should work (verify HMR)

---

## Phase 3: Session Tracking with Threshold Trigger

### Overview

Add silent background session tracking: time spent reading, position, engagement (sparks/annotations created). Starts only after threshold (30 seconds OR 10% scroll). Updates every 30 seconds. Ends on navigation away or 5min idle.

**Success**: Session automatically starts after threshold, updates silently, data appears in `reading_sessions` table

### Changes Required

#### 1. Database Migration - Reading Sessions

**File**: `supabase/migrations/063_reading_sessions.sql` (NEW)

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
  duration_seconds INTEGER DEFAULT 0,
  sparks_created INTEGER DEFAULT 0,
  annotations_created INTEGER DEFAULT 0,

  -- Threshold tracking
  threshold_met_at TIMESTAMPTZ,  -- When threshold was met (30s or 10% scroll)

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

-- Function to check for idle sessions (>5 minutes without update)
CREATE OR REPLACE FUNCTION end_idle_sessions()
RETURNS void AS $$
BEGIN
  UPDATE reading_sessions
  SET ended_at = updated_at + INTERVAL '5 minutes',
      duration_seconds = EXTRACT(EPOCH FROM (updated_at + INTERVAL '5 minutes' - started_at))::INTEGER
  WHERE ended_at IS NULL
    AND updated_at < NOW() - INTERVAL '5 minutes';
END;
$$ LANGUAGE plpgsql;

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
  thresholdMet: z.boolean().optional(),
})

/**
 * Creates a new reading session.
 * Called when threshold is met (30s OR 10% scroll).
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
    if (validated.thresholdMet) {
      updates.threshold_met_at = new Date().toISOString()
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
      .select('started_at, duration_seconds, document_id, end_chunk_index, end_scroll_position, user_id')
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
      .eq('user_id', session.user_id)

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

/**
 * Gets weekly reading stats (past 7 days).
 */
export async function getWeeklyStats(): Promise<{
  success: boolean
  data?: { totalSeconds: number }
  error?: string
}> {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return { success: false, error: 'Not authenticated' }
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
      console.error('[getWeeklyStats] Failed:', error)
      return { success: false, error: error.message }
    }

    const totalSeconds = sessions?.reduce((sum, s) => sum + (s.duration_seconds || 0), 0) || 0

    return {
      success: true,
      data: { totalSeconds },
    }
  } catch (error) {
    console.error('[getWeeklyStats] Exception:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}
```

#### 3. Session Tracking Hook with Threshold

**File**: `src/hooks/useSessionTracking.ts` (NEW)

```typescript
import { useEffect, useRef, useState } from 'react'
import { useReaderStore } from '@/stores/reader-store'
import { createReadingSession, updateReadingSession, endReadingSession } from '@/app/actions/reading-sessions'

/**
 * Automatically tracks reading sessions with threshold trigger.
 *
 * Threshold: Starts session after 30 seconds OR 10% scroll (whichever first)
 * Updates: Every 30 seconds
 * Ends: On unmount, blur, or 5min idle
 */
export function useSessionTracking(documentId: string) {
  const sessionIdRef = useRef<string | null>(null)
  const sessionStartTimeRef = useRef<Date | null>(null)
  const pageLoadTimeRef = useRef<Date>(new Date())
  const initialScrollRef = useRef<number>(0)
  const [thresholdMet, setThresholdMet] = useState(false)
  const [currentSessionMinutes, setCurrentSessionMinutes] = useState(0)

  const visibleChunks = useReaderStore(state => state.visibleChunks)
  const scrollPosition = useReaderStore(state => state.scrollPosition)

  // Check if threshold met (30 seconds OR 10% scroll)
  useEffect(() => {
    if (thresholdMet) return

    const timeThreshold = 30 // seconds
    const scrollThreshold = 10 // percent

    const checkThreshold = () => {
      const now = new Date()
      const timeSinceLoad = (now.getTime() - pageLoadTimeRef.current.getTime()) / 1000

      const scrollDelta = Math.abs(scrollPosition - initialScrollRef.current)

      if (timeSinceLoad >= timeThreshold || scrollDelta >= scrollThreshold) {
        console.log('[useSessionTracking] Threshold met - starting session')
        setThresholdMet(true)
      }
    }

    const interval = setInterval(checkThreshold, 1000) // Check every second
    return () => clearInterval(interval)
  }, [thresholdMet, scrollPosition])

  // Store initial scroll position
  useEffect(() => {
    initialScrollRef.current = scrollPosition
  }, []) // Run once on mount

  // Start session when threshold met
  useEffect(() => {
    if (!thresholdMet) return

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
  }, [thresholdMet, documentId])

  // Update session every 30 seconds
  useEffect(() => {
    if (!sessionIdRef.current || !thresholdMet) return

    const updateInterval = setInterval(async () => {
      const now = new Date()
      const sessionStartTime = sessionStartTimeRef.current

      if (!sessionStartTime) return

      const totalSeconds = Math.floor((now.getTime() - sessionStartTime.getTime()) / 1000)
      const minutes = Math.floor(totalSeconds / 60)
      setCurrentSessionMinutes(minutes)

      const currentChunkIndex = visibleChunks.length > 0 ? visibleChunks[0].chunk_index : 0

      await updateReadingSession({
        sessionId: sessionIdRef.current!,
        endChunkIndex: currentChunkIndex,
        endScrollPosition: scrollPosition / 100,
        durationSeconds: totalSeconds,
      })

      console.log('[useSessionTracking] Session updated:', totalSeconds, 'seconds')
    }, 30000) // 30 seconds

    return () => clearInterval(updateInterval)
  }, [thresholdMet, visibleChunks, scrollPosition])

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

  // Return current session minutes for StatsTab
  return {
    currentSessionMinutes,
    thresholdMet,
  }
}
```

#### 4. Integrate Hook into ReaderLayout

**File**: `src/components/reader/ReaderLayout.tsx` (MODIFY)

Add import:
```tsx
import { useSessionTracking } from '@/hooks/useSessionTracking'
```

Add hook call:
```tsx
const { currentSessionMinutes, thresholdMet } = useSessionTracking(documentId)
```

Pass to LeftPanel:
```tsx
<LeftPanel
  documentId={documentId}
  chunks={chunks}
  collapsed={leftPanelCollapsed}
  onCollapsedChange={setLeftPanelCollapsed}
  onNavigateToChunk={handleNavigateToChunk}
  currentSessionMinutes={currentSessionMinutes}  // NEW
/>
```

### Success Criteria

#### Automated Verification:
- [ ] Migration applies: `npx supabase db reset`
- [ ] Build succeeds: `npm run build`
- [ ] Type check: `npm run type-check`

#### Manual Verification:
- [ ] Open document → Wait 30 seconds → Check `reading_sessions` table → New row appears
- [ ] OR scroll >10% → Check table → New row appears (whichever first)
- [ ] Check row → `threshold_met_at` is NULL initially
- [ ] Wait for first 30s update → `threshold_met_at` populated
- [ ] Wait 60 seconds → Check table → `duration_seconds` updated (~60)
- [ ] Navigate away → Check table → `ended_at` populated
- [ ] Re-open same document → Check `documents` table → `last_read_at` updated
- [ ] Check console logs → Should see "Threshold met - starting session" message

**Implementation Note**: Pause after automated verification passes for manual confirmation before proceeding to Phase 4.

### Service Restarts:
- [ ] Supabase: `npx supabase db reset` (schema changed)
- [ ] Next.js: Auto-reload

---

## Phase 4: StatsTab Implementation

### Overview

Populate StatsTab with real reading statistics from `reading_sessions` table. Show time spent (this session, this document, this week) and engagement metrics. Apply neobrutalist styling.

**Success**: Open StatsTab → See live reading time, document total, weekly aggregate, engagement counts

### Changes Required

#### 1. Implement StatsTab Component

**File**: `src/components/reader/LeftPanel/StatsTab.tsx` (REPLACE placeholder)

```tsx
'use client'

import { useState, useEffect } from 'react'
import { getReadingStats, getWeeklyStats } from '@/app/actions/reading-sessions'
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
  progressPercent: number
}

interface StatsTabProps {
  documentId: string
  currentSessionMinutes: number
}

export function StatsTab({ documentId, currentSessionMinutes }: StatsTabProps) {
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
            thisSession: currentSessionMinutes,
            thisDocument: 0,
            thisWeek: 0,
            sparksCreated: 0,
            annotationsCreated: 0,
            sessionsCount: 0,
            progressPercent: Math.round(scrollPosition),
          })
          return
        }

        // Get weekly stats
        const weeklyResult = await getWeeklyStats()
        const weeklySeconds = weeklyResult.success && weeklyResult.data
          ? weeklyResult.data.totalSeconds
          : 0

        setStats({
          thisSession: currentSessionMinutes,
          thisDocument: Math.floor(docStatsResult.data.totalSeconds / 60),
          thisWeek: Math.floor(weeklySeconds / 60),
          sparksCreated: docStatsResult.data.totalSparks,
          annotationsCreated: docStatsResult.data.totalAnnotations,
          sessionsCount: docStatsResult.data.totalSessions,
          progressPercent: Math.round(scrollPosition),
        })
      } catch (error) {
        console.error('Failed to load stats:', error)
      } finally {
        setLoading(false)
      }
    }

    loadStats()
  }, [documentId, currentSessionMinutes, scrollPosition])

  if (loading) {
    return (
      <div className="p-4 space-y-4">
        <Skeleton className="h-20 w-full neo-border" />
        <Skeleton className="h-20 w-full neo-border" />
        <Skeleton className="h-20 w-full neo-border" />
      </div>
    )
  }

  return (
    <div className="p-4 space-y-6">
      {/* Reading Time Section */}
      <div className="space-y-4">
        <h3 className="text-sm font-bold text-muted-foreground flex items-center gap-2">
          <Clock className="h-4 w-4" />
          Reading Time
        </h3>

        <div className="space-y-3">
          <div className="space-y-1 neo-border neo-shadow p-3 bg-background">
            <div className="text-xs font-bold text-muted-foreground">This Session</div>
            <div className="text-2xl font-bold">{stats?.thisSession || 0} min</div>
          </div>

          <div className="space-y-1 neo-border p-3 bg-background">
            <div className="text-xs font-bold text-muted-foreground">This Document</div>
            <div className="text-2xl font-bold">{stats?.thisDocument || 0} min</div>
            <div className="text-xs font-bold text-muted-foreground">
              {stats?.sessionsCount || 0} sessions
            </div>
          </div>

          <div className="space-y-1 neo-border p-3 bg-background">
            <div className="text-xs font-bold text-muted-foreground">This Week</div>
            <div className="text-2xl font-bold">
              {stats?.thisWeek ? Math.floor(stats.thisWeek / 60) : 0}h{' '}
              {stats?.thisWeek ? stats.thisWeek % 60 : 0}m
            </div>
          </div>
        </div>
      </div>

      {/* Engagement Section */}
      <div className="space-y-4 pt-4 border-t neo-border">
        <h3 className="text-sm font-bold text-muted-foreground flex items-center gap-2">
          <TrendingUp className="h-4 w-4" />
          Engagement
        </h3>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1 neo-border p-3 bg-background">
            <Zap className="h-4 w-4 text-yellow-500" />
            <div className="text-2xl font-bold">{stats?.sparksCreated || 0}</div>
            <div className="text-xs font-bold text-muted-foreground">Sparks</div>
          </div>

          <div className="space-y-1 neo-border p-3 bg-background">
            <Highlighter className="h-4 w-4 text-blue-500" />
            <div className="text-2xl font-bold">{stats?.annotationsCreated || 0}</div>
            <div className="text-xs font-bold text-muted-foreground">Annotations</div>
          </div>
        </div>
      </div>

      {/* Progress Section */}
      <div className="space-y-4 pt-4 border-t neo-border">
        <h3 className="text-sm font-bold text-muted-foreground">Progress</h3>
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="font-bold text-muted-foreground">Document</span>
            <span className="font-bold">{stats?.progressPercent || 0}%</span>
          </div>
          <div className="h-3 bg-muted neo-border overflow-hidden">
            <div
              className="h-full bg-primary transition-all duration-300"
              style={{ width: `${stats?.progressPercent || 0}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
```

**Neobrutalist Styling**:
- All stat cards: `neo-border` with optional `neo-shadow` for emphasis
- Typography: `font-bold` throughout
- Progress bar: `neo-border` with flat color fill (no gradients)
- Section dividers: Bold borders instead of subtle lines

#### 2. Update LeftPanel Props

**File**: `src/components/reader/LeftPanel/LeftPanel.tsx` (MODIFY)

Add prop:
```tsx
interface LeftPanelProps {
  // ... existing props
  currentSessionMinutes: number  // NEW
}
```

Pass to StatsTab:
```tsx
{activeTab === 'stats' && (
  <ScrollArea className="h-full">
    <StatsTab
      documentId={documentId}
      currentSessionMinutes={currentSessionMinutes}  // NEW
    />
  </ScrollArea>
)}
```

### Success Criteria

#### Automated Verification:
- [ ] Build succeeds: `npm run build`
- [ ] Type check: `npm run type-check`

#### Manual Verification:
- [ ] StatsTab shows current session time (increments every 30 seconds)
- [ ] StatsTab shows total document time from all sessions
- [ ] StatsTab shows weekly total from past 7 days
- [ ] Progress bar shows scroll position (0-100%)
- [ ] Sparks and annotations counts accurate
- [ ] Loading skeleton appears while fetching
- [ ] All stat cards have neobrutalist styling (bold borders, flat colors)
- [ ] Current session card has shadow for emphasis
- [ ] Typography is bold throughout

**Implementation Note**: Pause after automated verification passes for manual confirmation before proceeding to Phase 5.

### Service Restarts:
- [ ] Next.js: Auto-reload

---

## Phase 5: BottomPanel with "Where Was I?" AI Feature

### Overview

Add BottomPanel with persistent compact bar (56px), "Where was I?" button that generates AI-powered context summary using Gemini. Caches section summaries for speed, anti-spoiler design (only content before current position). Apply neobrutalist styling.

**Success**: Click "Where was I?" → 5-10 second generation → Rich AI summary appears in neobrutalist modal

### Changes Required

#### 1. Database Migration - Section Summaries

**File**: `supabase/migrations/064_section_summaries.sql` (NEW)

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

    // Get sparks (simplified - adjust based on actual ECS schema)
    const { data: sparksData } = await supabase
      .from('entities')
      .select(`
        id,
        components!inner(component_type, data)
      `)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(5)

    const sparks = sparksData
      ?.filter((e: any) =>
        e.components?.some((c: any) => c.component_type === 'spark')
      )
      .map((e: any) => {
        const sparkComp = e.components?.find((c: any) => c.component_type === 'spark')
        return { content: sparkComp?.data?.content || '' }
      }) || []

    // Get annotations (simplified)
    const { data: annotationsData } = await supabase
      .from('entities')
      .select(`
        id,
        components!inner(component_type, data)
      `)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(5)

    const annotations = annotationsData
      ?.filter((e: any) =>
        e.components?.some((c: any) => c.component_type === 'annotation')
      )
      .map((e: any) => {
        const annotComp = e.components?.find((c: any) => c.component_type === 'annotation')
        return { text: annotComp?.data?.text || '' }
      }) || []

    // 6. Generate final AI summary
    const aiSummary = await generateAISummary(
      documentId,
      completedSections,
      currentSectionHeading,
      Math.round((currentChunkIndex / allChunks.length) * 100),
      sparks,
      annotations
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
          sparks,
          annotations,
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
${text.slice(0, 50000)}

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

```tsx
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
      {/* Compact bar - neobrutalist styling */}
      <div className="fixed bottom-0 left-0 right-0 h-14 border-t neo-border bg-background z-30 flex items-center justify-center neo-shadow">
        <Button
          variant="ghost"
          onClick={handleWhereWasI}
          disabled={loading}
          className="flex items-center gap-2 neo-border neo-hover font-bold"
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

**Neobrutalist Styling**:
- Bottom bar: `neo-border` on top edge, `neo-shadow` for depth
- Button: `neo-border` with `neo-hover` effect, `font-bold` text
- Flat background (no gradients)

#### 4. Create WhereWasIModal Component

**File**: `src/components/reader/BottomPanel/WhereWasIModal.tsx` (NEW)

```tsx
'use client'

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { Zap, Highlighter, CheckCircle } from 'lucide-react'

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
      <DialogContent className="max-w-2xl max-h-[80vh] neo-border neo-shadow">
        <DialogHeader className="border-b neo-border pb-4">
          <DialogTitle className="text-xl font-bold">Where You Left Off</DialogTitle>
        </DialogHeader>

        <ScrollArea className="h-full max-h-[60vh]">
          <div className="space-y-6 p-4">
            {/* AI Summary - primary content */}
            <div className="prose prose-sm dark:prose-invert neo-border p-4 bg-background">
              <p className="text-base leading-relaxed font-medium">{summary.aiSummary}</p>
            </div>

            {/* Current Section - emphasized */}
            <div className="p-4 bg-primary/5 neo-border neo-shadow">
              <div className="text-sm font-bold text-primary flex items-center gap-2">
                <CheckCircle className="h-4 w-4" />
                Current Section
              </div>
              <div className="text-lg font-bold mt-2">{summary.currentSection.heading}</div>
              <div className="text-sm font-bold text-muted-foreground mt-1">
                {summary.currentSection.position}
              </div>
            </div>

            {/* Recent Activity */}
            {(summary.recentActivity.sparks.length > 0 || summary.recentActivity.annotations.length > 0) && (
              <div className="space-y-3 neo-border p-4">
                <div className="text-sm font-bold">Your Recent Activity</div>

                {summary.recentActivity.sparks.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-xs font-bold text-muted-foreground">
                      <Zap className="h-3 w-3" />
                      Recent Sparks
                    </div>
                    {summary.recentActivity.sparks.map((spark, i) => (
                      <div key={i} className="text-sm p-2 bg-muted neo-border font-medium">
                        {spark.content}
                      </div>
                    ))}
                  </div>
                )}

                {summary.recentActivity.annotations.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-xs font-bold text-muted-foreground">
                      <Highlighter className="h-3 w-3" />
                      Recent Annotations
                    </div>
                    {summary.recentActivity.annotations.map((annotation, i) => (
                      <div key={i} className="text-sm p-2 bg-muted neo-border font-medium">
                        {annotation.text}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Completed Sections - collapsed by default */}
            {summary.completedSections.length > 0 && (
              <details className="neo-border p-4">
                <summary className="text-sm font-bold cursor-pointer">
                  Completed Sections ({summary.completedSections.length})
                </summary>
                <div className="space-y-3 mt-3">
                  {summary.completedSections.map((section, i) => (
                    <div key={i} className="space-y-1 p-3 bg-muted neo-border">
                      <div className="text-sm font-bold">{section.heading}</div>
                      <div className="text-sm text-muted-foreground">{section.summary}</div>
                    </div>
                  ))}
                </div>
              </details>
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  )
}
```

**Neobrutalist Styling**:
- Modal: `neo-border` and `neo-shadow` on DialogContent
- Section cards: `neo-border` with flat backgrounds
- Current section: `neo-shadow` for emphasis
- Typography: `font-bold` and `font-medium` throughout
- Flat colors, no gradients

#### 5. Integrate BottomPanel into ReaderLayout

**File**: `src/components/reader/ReaderLayout.tsx` (MODIFY)

Add import:
```tsx
import { BottomPanel } from './BottomPanel/BottomPanel'
```

In JSX, add BottomPanel at the end:
```tsx
<div className="flex flex-col h-screen">
  <DocumentHeader {...props} />

  <div className="flex-1 overflow-hidden relative">
    <LeftPanel {...props} />
    <DocumentViewer {...props} />
  </div>

  <RightPanel {...props} />

  {/* Bottom panel with "Where was I?" */}
  <BottomPanel documentId={documentId} />

  {/* Modals */}
  <QuickSparkCapture {...props} />
</div>
```

### Success Criteria

#### Automated Verification:
- [ ] Migration applies: `npx supabase db reset`
- [ ] Build succeeds: `npm run build`
- [ ] Type check: `npm run type-check`

#### Manual Verification:
- [ ] BottomPanel appears at bottom of screen with neobrutalist styling
- [ ] Bottom bar has bold border on top, hard shadow
- [ ] Click "Where was I?" → Button shows loading state
- [ ] After 5-10 seconds → Modal opens with AI summary
- [ ] Modal has neobrutalist styling (bold borders, hard shadow, flat colors)
- [ ] Summary includes: AI narrative, current section (with shadow), completed sections, recent sparks/annotations
- [ ] Summary does NOT mention content after current position (anti-spoiler verified)
- [ ] Check `section_summaries` table → Summaries cached for completed sections
- [ ] Click "Where was I?" again → Faster (uses cached summaries, only generates final AI summary)
- [ ] All text is bold/medium weight (brutalist typography)
- [ ] No gradients or soft shadows anywhere

**Implementation Note**: Pause after automated verification passes for manual confirmation before proceeding to Phase 6.

### Service Restarts:
- [ ] Supabase: `npx supabase db reset` (schema changed)
- [ ] Next.js: Auto-reload

---

## Phase 6: Neobrutalist Restyling of Existing Components

### Overview

Apply neobrutalist design system to existing reader components: RightPanel (with option to replace with brutalist versions), DocumentHeader, QuickSparkCapture modal, ConnectionHeatmap. Comprehensive restyling for visual consistency.

**Success**: All reader components have bold borders, hard shadows, flat colors, brutalist typography

### Changes Required

#### 1. RightPanel Neobrutalist Restyling

**File**: `src/components/sidebar/RightPanel.tsx` (MODIFY)

**Option A: In-place restyling** (faster, preserves logic):

Update panel container:
```tsx
<motion.div
  className="fixed right-0 top-14 bottom-0 border-r neo-border z-40 bg-background neo-shadow"  // Added neo-border, neo-shadow
  // ... rest unchanged
>
```

Update toggle button:
```tsx
<Button
  variant="ghost"
  size="icon"
  className="absolute -left-4 top-8 z-50 rounded-full border neo-border neo-shadow bg-background"  // Added neo-border, neo-shadow
  // ... rest unchanged
>
```

Update tab buttons:
```tsx
<motion.button
  className={cn(
    'relative p-2 rounded flex flex-col items-center justify-center gap-1 transition-colors neo-border',  // Added neo-border
    isActive
      ? 'bg-primary/10 text-primary neo-shadow'  // Added neo-shadow
      : 'hover:bg-muted text-muted-foreground hover:text-foreground neo-hover'  // Added neo-hover
  )}
  // ... rest unchanged
>
```

Update tab labels (make bold):
```tsx
<span className="text-xs font-bold">{tab.label}</span>  // Added font-bold
```

**Option B: Replace with brutalist component registry versions** (cleaner, requires registry):

**DECISION POINT**: Ask user which approach to take for RightPanel.

If registry components available:
1. Install `@neobrutalism/tabs`
2. Replace Radix UI tab primitives with brutalist versions
3. Keep existing logic, swap UI components

If registry NOT available:
1. Proceed with Option A (in-place restyling)
2. Document in `components/brutalist/README.md`

**Add decision checkpoint in plan**: After attempting registry installation in Phase 1, document which approach succeeded. Update this step accordingly.

#### 2. DocumentHeader Neobrutalist Restyling

**File**: `src/components/reader/DocumentHeader.tsx` (MODIFY)

Update header container:
```tsx
<div className="flex items-center justify-between px-6 py-4 border-b neo-border bg-background neo-shadow">  // Added neo-border, neo-shadow
```

Update title typography:
```tsx
<h1 className="text-xl font-bold">{documentTitle}</h1>  // Ensure font-bold
```

Update view mode toggle buttons:
```tsx
<ToggleGroupItem
  value="explore"
  title="Explore (sidebar visible)"
  className="neo-border neo-hover"  // Added neo-border, neo-hover
>
  <Compass className="h-4 w-4" />
</ToggleGroupItem>
```

Update action buttons:
```tsx
<Button
  variant="outline"
  size="sm"
  className="gap-2 neo-border neo-hover font-bold"  // Added neo-border, neo-hover, font-bold
>
  <ExternalLink className="h-4 w-4" />
  Edit in Obsidian
</Button>
```

#### 3. QuickSparkCapture Modal Neobrutalist Restyling

**File**: `src/components/sparks/QuickSparkCapture.tsx` (MODIFY)

Update card container:
```tsx
<Card className="border neo-border neo-shadow rounded-lg bg-background">  // Added neo-border, neo-shadow
```

Update header:
```tsx
<div className="flex items-center justify-between px-4 py-3 border-b neo-border">  // Added neo-border
  <div className="flex items-center gap-2">
    <Zap className="w-5 h-5 text-yellow-500" />
    <h3 className="font-bold">Capture Spark</h3>  // Changed to font-bold
    <kbd className="ml-2 text-xs px-2 py-1 bg-muted rounded neo-border font-bold">⌘K</kbd>  // Added neo-border, font-bold
  </div>
  // ... rest
</div>
```

Update form fields:
```tsx
<Textarea
  className="neo-border font-medium"  // Added neo-border, font-medium
  placeholder="What sparked your interest?"
  // ... rest
/>
```

Update buttons:
```tsx
<Button
  type="submit"
  className="neo-border neo-shadow neo-hover font-bold"  // Added neo-border, neo-shadow, neo-hover, font-bold
>
  Capture
</Button>
```

#### 4. ConnectionHeatmap Neobrutalist Restyling

**File**: `src/components/reader/ConnectionHeatmap.tsx` (MODIFY)

Update container:
```tsx
<div className="absolute left-0 top-0 bottom-0 w-12 border-r neo-border bg-background/95 backdrop-blur-sm">  // Added neo-border
```

Update connection density bars (flat colors):
```tsx
<div
  className="w-full bg-primary transition-all neo-border"  // Added neo-border
  style={{
    height: `${density * 100}%`,
    opacity: density  // Flat color with opacity for density (no gradients)
  }}
/>
```

Update tooltip:
```tsx
<div className="absolute left-14 p-2 bg-background border neo-border neo-shadow rounded text-xs font-bold">  // Added neo-border, neo-shadow, font-bold
  {connectionCount} connections
</div>
```

#### 5. Tab Content Components Neobrutalist Restyling

**Files to update**:
- `src/components/sidebar/ConnectionsList.tsx`
- `src/components/sidebar/ConnectionCard.tsx`
- `src/components/sidebar/SparksTab.tsx`
- `src/components/sidebar/AnnotationsList.tsx`
- `src/components/sidebar/ChunkQualityPanel.tsx`
- `src/components/sidebar/TuneTab.tsx`

**Pattern for all**:
1. Add `neo-border` to all card/panel containers
2. Add `neo-shadow` to emphasized elements
3. Add `neo-hover` to interactive elements
4. Change all typography to `font-bold` or `font-medium`
5. Ensure flat colors (no gradients)

**Example (ConnectionCard.tsx)**:
```tsx
<div className="p-3 border neo-border rounded-lg hover:bg-muted neo-hover">  // Added neo-border, neo-hover
  <div className="flex items-start justify-between gap-2">
    <div className="flex-1">
      <div className="flex items-center gap-2 mb-1">
        <Badge variant="outline" className="neo-border font-bold">  // Added neo-border, font-bold
          {connection.connection_type}
        </Badge>
        <span className="text-xs font-bold text-muted-foreground">  // Changed to font-bold
          Strength: {(connection.strength * 100).toFixed(0)}%
        </span>
      </div>
      <p className="text-sm font-medium">{connection.reason}</p>  // Changed to font-medium
    </div>
  </div>
</div>
```

#### 6. Global CSS Verification

**File**: `src/app/globals.css` (VERIFY)

Ensure neobrutalism.css is imported:
```css
@import '../styles/neobrutalism.css';
```

If using CSS layers, ensure proper order:
```css
@layer base, components, utilities;

@import 'tailwindcss';
@import '../styles/neobrutalism.css';
```

### Success Criteria

#### Automated Verification:
- [ ] Build succeeds: `npm run build`
- [ ] Type check: `npm run type-check`
- [ ] No console errors

#### Manual Verification:

**RightPanel**:
- [ ] Panel has bold right border (`neo-border`)
- [ ] Toggle button has bold border and shadow
- [ ] All 7 tabs have bold borders
- [ ] Active tab has hard shadow for emphasis
- [ ] Tab icons and labels clearly visible
- [ ] Typography is bold throughout

**DocumentHeader**:
- [ ] Header has bold bottom border and shadow
- [ ] Title is bold
- [ ] View mode toggle buttons have borders and hover effects
- [ ] Action buttons have bold borders and hover translation

**QuickSparkCapture**:
- [ ] Modal card has bold border and shadow
- [ ] Header has bold border separator
- [ ] Form fields have bold borders
- [ ] Buttons have borders, shadows, and hover effects
- [ ] Keyboard shortcut badge has border

**ConnectionHeatmap**:
- [ ] Heatmap container has bold border
- [ ] Density bars have flat colors (no gradients)
- [ ] Tooltip has border and shadow

**Tab Components**:
- [ ] All connection cards have bold borders
- [ ] Hover effects translate elements (neo-hover)
- [ ] Badges and labels are bold
- [ ] No gradients or soft shadows anywhere

**Overall**:
- [ ] Entire reader interface has consistent brutalist aesthetic
- [ ] Bold 3-4px borders everywhere
- [ ] Hard 6px shadows on emphasized elements
- [ ] Flat colors, no gradients
- [ ] Bold typography throughout
- [ ] Hover effects translate elements

**DECISION CHECKPOINT**: Document in `components/brutalist/README.md` which components were:
- Restyled in-place (Option A)
- Replaced with registry components (Option B)
- Include rationale for each decision

### Service Restarts:
- [ ] Next.js: Auto-reload

---

## Testing Strategy

### Unit Tests

**Focus areas** (write as needed, not comprehensive):
- Session tracking threshold logic
- Stats aggregation calculations
- Outline building from heading_path
- Summary caching logic

**Skip** (tested manually):
- UI component rendering
- Framer Motion animations
- Neobrutalist styling

### Integration Tests

**Critical paths** (manual testing):
1. **Session lifecycle**: Page load → Threshold met (30s OR 10% scroll) → Session created → Updates every 30s → Ends on blur
2. **Stats calculation**: Read for 2min → Check StatsTab → Should show ~2min this session
3. **"Where Was I?" generation**: Click button → Wait 5-10s → Modal appears → Summary accurate and anti-spoiler
4. **Outline navigation**: Click section → Scrolls to chunk → Connections load in RightPanel

### Manual Testing Checklist

**Phase 1 - Neobrutalism Setup**:
- [ ] `/design` page shows brutalist styling examples
- [ ] `neo-border`, `neo-shadow`, `neo-hover` classes work
- [ ] Registry components installed (or documented as failed)

**Phase 2 - LeftPanel**:
- [ ] Panel collapses/expands smoothly
- [ ] Outline shows all sections with bold borders
- [ ] Click section scrolls to chunk
- [ ] Connection indicators toggle
- [ ] Neobrutalist styling throughout

**Phase 3 - Session Tracking**:
- [ ] Session ONLY starts after 30s OR 10% scroll
- [ ] Updates every 30 seconds
- [ ] Ends on blur/close
- [ ] No session created on accidental page load

**Phase 4 - Stats**:
- [ ] Current session time accurate (live updates)
- [ ] Document total correct
- [ ] Weekly total sums past 7 days
- [ ] Progress bar matches scroll
- [ ] Bold borders and flat colors

**Phase 5 - Where Was I?**:
- [ ] Summary generates in <10 seconds
- [ ] Anti-spoiler verified (no future content)
- [ ] Cached summaries used on re-generation
- [ ] Modal has neobrutalist styling
- [ ] Typography is bold

**Phase 6 - Full Restyling**:
- [ ] RightPanel brutalist-styled
- [ ] DocumentHeader brutalist-styled
- [ ] QuickSparkCapture brutalist-styled
- [ ] All tab components brutalist-styled
- [ ] No gradients or soft shadows anywhere
- [ ] Consistent bold typography

---

## Performance Considerations

**Session Tracking**:
- 30-second update interval (not real-time, sufficient for personal tool)
- Single DB write every 30s (negligible load)
- Threshold prevents accidental sessions (saves DB space)

**Stats Queries**:
- Direct queries to `reading_sessions` (no caching needed)
- Weekly query: ~10-50 rows max (fast)
- Document query: ~5-20 rows max (fast)

**"Where Was I?"**:
- First generation: 5-10 seconds (multiple Gemini API calls)
- Cached sections: Instant (DB lookup)
- Cost: ~$0.01 per generation (~13k input + 500 output tokens)
- Heavy user (20 generations/month): ~$0.20/month

**Neobrutalist Styling**:
- CSS-only (no runtime performance impact)
- Hard shadows are performant (no blur calculations)
- Flat colors reduce GPU compositing

---

## Migration Notes

**Database Changes**:
1. `063_reading_sessions.sql` - Session tracking with threshold
2. `064_section_summaries.sql` - AI summary caching

**No Data Migration Required**:
- New tables, no changes to existing data
- Safe to apply with `npx supabase db reset`

**Rollback Strategy**:
If issues arise, drop new tables:
```sql
DROP TABLE IF EXISTS reading_sessions CASCADE;
DROP TABLE IF EXISTS section_summaries CASCADE;

-- Rollback documents table changes
ALTER TABLE documents
  DROP COLUMN IF EXISTS total_reading_time_seconds,
  DROP COLUMN IF EXISTS last_read_at,
  DROP COLUMN IF EXISTS last_read_position,
  DROP COLUMN IF EXISTS last_read_chunk_index;
```

---

## References

**Architecture**:
- `docs/ARCHITECTURE.md` - System architecture
- `docs/PROCESSING_PIPELINE.md` - Document processing
- `docs/AI_DOCUMENTATION.md` - Gemini integration patterns

**Reader Patterns**:
- `src/components/sidebar/RightPanel.tsx:1-242` - Panel collapse pattern
- `src/stores/reader-store.ts:60-165` - Reader state management
- `src/hooks/useTextSelection.ts` - Selection handling pattern

**Gemini Integration**:
- `src/lib/sparks/title-generator.ts:15-56` - Vercel AI SDK pattern
- `src/app/actions/sparks.ts:36-165` - Server Action pattern
- `docs/AI_DOCUMENTATION.md:1-150` - SDK usage matrix

**Neobrutalism Design**:
- `thoughts/ideas/2025-10-20_cross-library-brutalist-restyling.md` - Complete restyling guide
- `styles/neobrutalism.css` - Design tokens and utility classes
- `src/app/design/page.tsx` - Live examples

**Testing**:
- `docs/testing/TESTING_RULES.md` - Testing philosophy
- `docs/testing/TESTING_README.md` - Quick start guide

**Similar Implementations**:
- Admin Panel: `src/components/admin/AdminPanel.tsx:1-135` - Sheet panel pattern
- Session tracking: N/A (new feature)
- AI features: `src/lib/sparks/title-generator.ts:1-56` - Gemini text generation

---

## Next Steps (Post-Implementation)

After core features are working and brutalist styling applied:

1. **Chat Interface** - Multi-turn conversation with document context (deferred from this plan)
2. **AI Suggestions** - Proactive spark/connection generation (deferred from this plan)
3. **Gemini Context Caching** - 75% cost reduction for chat (deferred from this plan)
4. **History Tab** - Session timeline visualization
5. **Mobile Responsive** - Adapt panels for smaller screens
6. **Animations & Polish** - Enhanced micro-interactions
7. **Performance Optimization** - If needed based on real usage

---

**End of Plan**

This comprehensive 4-5 week plan delivers complete reader enhancement with neobrutalist design system. Phases are incremental and testable, with clear success criteria (automated vs manual). Each phase builds on previous work without breaking existing functionality.

**Key Achievements**:
- ✅ LeftPanel with Outline/Stats/Heatmap navigation
- ✅ Session tracking with smart threshold (30s OR 10% scroll)
- ✅ Live reading statistics and engagement metrics
- ✅ AI-powered "Where Was I?" context summary
- ✅ Comprehensive neobrutalist restyling (bold borders, hard shadows, flat colors, brutalist typography)
- ✅ Gemini integration via Vercel AI SDK
- ✅ Storage-first approach with summary caching
