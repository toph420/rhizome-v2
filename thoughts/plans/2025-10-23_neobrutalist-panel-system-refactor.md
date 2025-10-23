# Neobrutalist Panel System Refactor

## Overview

Refactor Rhizome's panel system from custom framer-motion implementation to neobrutalism component library. Primary goal: create a unified Panel component supporting all 4 sides (left, right, bottom, top) with consistent collapse/expand behavior, state persistence, and reusable card patterns. Start with RightPanel refactor, establishing patterns for future LeftPanel and BottomPanel implementations.

**Why**: Current RightPanel uses custom framer-motion code without persistence or keyboard shortcuts. Neobrutalism sidebar component provides built-in state management, cookie persistence, keyboard shortcuts, and mobile responsiveness. Extending it to support all 4 sides enables consistent behavior across the entire UI.

---

## Current State Analysis

### RightPanel Implementation (`src/components/sidebar/RightPanel.tsx:75-242`)

**Animation**: framer-motion with spring transitions
```typescript
<motion.div animate={{ width: collapsed ? 48 : 384 }} />
```

**State Management**: Local `useState` only
```typescript
const [collapsed, setCollapsed] = useState(false)
const [activeTab, setActiveTab] = useState<TabId>('connections')
```

**Tab System**: 7-column icon grid (7 tabs total)
- connections, annotations, quality, sparks, cards, review, tune
- Badge counts for notifications
- Click to switch tabs

**Missing Features**:
- No state persistence (resets on refresh)
- No keyboard shortcuts
- UIStore has unused `sidebarCollapsed`/`activeTab` fields (`src/stores/ui-store.ts:13-14`)
- Not using neobrutalism sidebar component

### Neobrutalism Sidebar Component (`src/components/libraries/neobrutalism/sidebar.tsx:1-715`)

**Built-in Features**:
- SidebarProvider context with state management
- Cookie persistence (`SIDEBAR_COOKIE_NAME`, 7-day expiry)
- Keyboard shortcut (Cmd/Ctrl+B)
- Mobile responsive (Sheet component)
- Tooltip support for collapsed icons
- Badge support (`SidebarMenuBadge`)

**Current Constraints**:
- Only supports `side="left" | "right"` (line 156)
- Width transitions only (not height)
- Fixed positioning: `inset-y-0` for vertical panels

**Need to Add**:
- `side="bottom" | "top"` support
- Height transitions for horizontal panels
- Dynamic positioning logic

### Key Discoveries

1. **ProcessingDock Pattern** (`src/components/layout/ProcessingDock.tsx:45-408`): Bottom panel with 3 states (hidden, collapsed badge, expanded list) - reference for bottom panel behavior

2. **ConnectionCard Pattern** (`src/components/sidebar/ConnectionCard.tsx:1-260`): Card with dynamic border colors, badge+progress combo, hotkey hints - model for domain-specific cards

3. **ConnectionFilters Pattern** (`src/components/sidebar/ConnectionFilters.tsx:1-85`): Badge toggles with colored variants + Slider threshold - reuse in filters

4. **Tab Content Components**: All exist and work (`ConnectionsList`, `AnnotationsList`, `SparksTab`, `FlashcardsTab`, `TuneTab`, `AnnotationReviewTab`, `ChunkQualityPanel`)

---

## Desired End State

### Unified Panel Component

**File**: `src/components/rhizome/panel.tsx` (extended from neobrutalism sidebar)

**Features**:
- Supports all 4 sides: `left`, `right`, `bottom`, `top`
- Automatic width/height transitions based on orientation
- State persistence via cookies
- Keyboard shortcuts per panel
- Mobile responsive

**Usage Pattern**:
```typescript
// Right Panel (vertical)
<Panel side="right" collapsedSize={48} expandedSize={384}>

// Left Panel (vertical)
<Panel side="left" collapsedSize={48} expandedSize={320}>

// Bottom Panel (horizontal)
<Panel side="bottom" collapsedSize={48} expandedSize="auto">
```

### RightPanelV2 with Tab Transform

**Collapsed State** (48px width):
- Vertical icon stack with tooltips
- Click icon → expands panel AND activates tab
- Badge counts visible

**Expanded State** (384px width):
- Icons transform into horizontal tabs (icon + label)
- Traditional tab interface
- Full content area below

**File**: `src/components/sidebar/RightPanelV2.tsx`

### Card Component System

**Base Card**: `src/components/rhizome/card.tsx` (copied from neobrutalism)

**Domain Cards** (extend base):
- `src/components/rhizome/connection-card.tsx` - Dynamic borders, strength indicator, jump buttons
- `src/components/rhizome/annotation-card.tsx` - Color borders, edit mode, highlight jump
- `src/components/rhizome/spark-card.tsx` - Selection chips, link indicators, inline edit

### Verification

**Automated**:
- [ ] TypeScript compiles: `npm run type-check`
- [ ] Build succeeds: `npm run build`
- [ ] No console errors on page load

**Manual**:
- [ ] RightPanel collapses/expands smoothly
- [ ] Icon click expands + switches tab
- [ ] Horizontal tabs work when expanded
- [ ] State persists across page refresh
- [ ] All 7 tab contents render correctly
- [ ] Badge counts display
- [ ] ConnectionCard, AnnotationCard, SparkCard render

---

## Rhizome Architecture

- **Module**: Main App (`src/` directory only)
- **Storage**: Database only (UI state in cookies via neobrutalism persist)
- **Migration**: No (UI refactor only, no schema changes)
- **Test Tier**: Stable (fix when broken)
- **Component Libraries**: Neobrutalism (copy to `components/rhizome/`)

---

## What We're NOT Doing

- LeftPanel implementation (establish pattern only, build later)
- BottomPanel implementation (establish pattern only, build later)
- ProcessingDock refactor (already works with different pattern)
- AdminPanel refactor (uses Sheet, different pattern)
- Removing framer-motion entirely (may still use for specific animations)
- Flashcards tab functionality (already placeholder)

---

## Implementation Approach

### Strategy

**Build Alongside, Replace When Ready**:
1. Copy neobrutalism components to `components/rhizome/`
2. Extend Panel component for 4-side support
3. Build RightPanelV2 using new Panel + Tabs
4. Build domain card components
5. Test thoroughly side-by-side
6. Replace old RightPanel with V2
7. Delete old implementation

**Why This Approach**:
- Zero risk to working RightPanel
- Easy rollback if issues
- Can A/B test both versions
- Clear git history

### Success Criteria Pattern

Each phase includes:

**Automated Verification**: Commands that can be run programmatically
- TypeScript compilation
- Build process
- Linting

**Manual Verification**: Requires human testing
- UI interactions
- Visual appearance
- Edge cases

**Implementation Note**: Pause after automated verification passes for manual confirmation before proceeding to next phase.

---

## Phase 1: Setup Foundation

### Overview

Create `components/rhizome/` folder and copy neobrutalism components. Extend Panel component to support all 4 sides with conditional width/height transitions.

### Changes Required

#### 1. Create Rhizome Components Folder

**Command**:
```bash
mkdir -p src/components/rhizome
```

#### 2. Copy Neobrutalism Components

**Files to Copy**:
```bash
cp src/components/libraries/neobrutalism/sidebar.tsx \
   src/components/rhizome/panel.tsx

cp src/components/libraries/neobrutalism/tabs.tsx \
   src/components/rhizome/tabs.tsx

cp src/components/libraries/neobrutalism/card.tsx \
   src/components/rhizome/card.tsx

cp src/components/libraries/neobrutalism/button.tsx \
   src/components/rhizome/button.tsx

cp src/components/libraries/neobrutalism/badge.tsx \
   src/components/rhizome/badge.tsx

cp src/components/libraries/neobrutalism/scroll-area.tsx \
   src/components/rhizome/scroll-area.tsx

cp src/components/libraries/neobrutalism/slider.tsx \
   src/components/rhizome/slider.tsx
```

#### 3. Extend Panel Component for 4-Side Support

**File**: `src/components/rhizome/panel.tsx`

**Changes**:

Add bottom/top to side type (line 162-164):
```typescript
function Sidebar({
  side = "left",
  variant = "sidebar",
  collapsible = "offcanvas",
  className,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  side?: "left" | "right" | "bottom" | "top"  // Add bottom | top
  variant?: "sidebar" | "floating" | "inset"
  collapsible?: "offcanvas" | "icon" | "none"
})
```

Add orientation detection:
```typescript
const isVertical = side === "left" || side === "right"
const isHorizontal = side === "bottom" || side === "top"
```

Update positioning logic (line 233-236):
```typescript
className={cn(
  "fixed inset-y-0 z-10 hidden h-svh w-(--sidebar-width) transition-[left,right,width] duration-200 ease-linear md:flex",
  // Vertical panels (left/right)
  isVertical && side === "left"
    ? "left-0 group-data-[collapsible=offcanvas]:left-[calc(var(--sidebar-width)*-1)]"
    : isVertical && side === "right"
    ? "right-0 group-data-[collapsible=offcanvas]:right-[calc(var(--sidebar-width)*-1)]"
    : "",
  // Horizontal panels (bottom/top)
  isHorizontal && side === "bottom"
    ? "bottom-0 inset-x-0 h-(--sidebar-height) w-full transition-[bottom,height]"
    : isHorizontal && side === "top"
    ? "top-0 inset-x-0 h-(--sidebar-height) w-full transition-[top,height]"
    : "",
  // ... rest of classes
)}
```

Add CSS variables for height (line 136-140):
```typescript
style={{
  "--sidebar-width": SIDEBAR_WIDTH,
  "--sidebar-width-icon": SIDEBAR_WIDTH_ICON,
  "--sidebar-height": SIDEBAR_HEIGHT,  // Add this
  "--sidebar-height-icon": SIDEBAR_HEIGHT_ICON,  // Add this
  ...style,
} as React.CSSProperties}
```

Add constants for height:
```typescript
const SIDEBAR_HEIGHT = "20rem"  // 320px for expanded horizontal panels
const SIDEBAR_HEIGHT_ICON = "3rem"  // 48px for collapsed
```

Rename exports for clarity:
```typescript
// At end of file, rename Sidebar → Panel for clarity
export {
  Sidebar as Panel,
  SidebarContent as PanelContent,
  SidebarFooter as PanelFooter,
  // ... all other exports with Panel prefix
}
```

#### 4. Create Empty Card Wrapper Files

**Files to Create**:
```bash
touch src/components/rhizome/connection-card.tsx
touch src/components/rhizome/annotation-card.tsx
touch src/components/rhizome/spark-card.tsx
```

**Purpose**: Placeholder files for Phase 4, prevents import errors during development.

### Success Criteria

#### Automated Verification:
- [ ] Files copied successfully: `ls src/components/rhizome/`
- [ ] TypeScript compiles: `npm run type-check`
- [ ] No import errors: `npm run lint`

#### Manual Verification:
- [ ] All 7 files exist in `components/rhizome/`
- [ ] Panel.tsx has 4-side support types
- [ ] Panel.tsx exports renamed (Sidebar → Panel, etc.)
- [ ] Empty card files created

**Implementation Note**: This phase is pure setup - no UI changes yet. Verify files exist and TypeScript is happy before proceeding.

---

## Phase 2: Build Panel Core with Tab Transform

### Overview

Create RightPanelV2 using new Panel component with icon stack (collapsed) → horizontal tabs (expanded) transform pattern. Implement state management and basic tab switching without content.

### Changes Required

#### 1. Create RightPanelV2 Component

**File**: `src/components/sidebar/RightPanelV2.tsx`

**Implementation**:
```typescript
'use client'

import { useState } from 'react'
import {
  Panel,
  PanelProvider,
  PanelHeader,
  PanelContent,
  PanelTrigger,
  usePanelContext,
} from '@/components/rhizome/panel'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/rhizome/tabs'
import { Badge } from '@/components/rhizome/badge'
import {
  Network,
  Highlighter,
  CheckCircle,
  Zap,
  Brain,
  FileQuestion,
  Sliders,
} from 'lucide-react'
import { cn } from '@/lib/utils'

type TabId = 'connections' | 'annotations' | 'quality' | 'sparks' | 'cards' | 'review' | 'tune'

interface Tab {
  id: TabId
  icon: typeof Network
  label: string
}

const TABS: Tab[] = [
  { id: 'connections', icon: Network, label: 'Connections' },
  { id: 'annotations', icon: Highlighter, label: 'Annotations' },
  { id: 'quality', icon: CheckCircle, label: 'Quality' },
  { id: 'sparks', icon: Zap, label: 'Sparks' },
  { id: 'cards', icon: Brain, label: 'Cards' },
  { id: 'review', icon: FileQuestion, label: 'Review' },
  { id: 'tune', icon: Sliders, label: 'Tune' },
]

interface RightPanelV2Props {
  documentId: string
  reviewResults?: any | null
}

function RightPanelContent({ documentId, reviewResults }: RightPanelV2Props) {
  const { state, open, setOpen } = usePanelContext()
  const [activeTab, setActiveTab] = useState<TabId>('connections')

  // Badge counts
  const badgeCounts: Partial<Record<TabId, number>> = {
    review: reviewResults?.needsReview.length || 0,
  }

  return (
    <Panel side="right" collapsible="icon">
      <PanelHeader>
        <PanelTrigger />
      </PanelHeader>

      <PanelContent>
        {/* COLLAPSED: Vertical icon stack */}
        <div
          className={cn(
            "flex flex-col gap-2 p-2",
            "group-data-[state=collapsed]:flex",
            "group-data-[state=expanded]:hidden"
          )}
        >
          {TABS.map((tab) => {
            const Icon = tab.icon
            const badgeCount = badgeCounts[tab.id]

            return (
              <button
                key={tab.id}
                className={cn(
                  "relative p-2 rounded-base border-2 border-border",
                  "hover:bg-main hover:text-main-foreground",
                  "transition-all",
                  activeTab === tab.id && "bg-main text-main-foreground"
                )}
                onClick={() => {
                  setActiveTab(tab.id)
                  setOpen(true) // Expand on click
                }}
                title={tab.label}
              >
                <Icon className="h-4 w-4" />
                {badgeCount !== undefined && badgeCount > 0 && (
                  <Badge
                    variant="default"
                    className="absolute -top-1 -right-1 h-4 w-4 p-0 text-xs"
                  >
                    {badgeCount}
                  </Badge>
                )}
              </button>
            )
          })}
        </div>

        {/* EXPANDED: Horizontal tabs */}
        <div
          className={cn(
            "flex flex-col h-full",
            "group-data-[state=collapsed]:hidden",
            "group-data-[state=expanded]:flex"
          )}
        >
          <Tabs value={activeTab} onValueChange={setActiveTab as any}>
            <TabsList className="w-full grid grid-cols-7 gap-1 p-2 border-b-2 border-border">
              {TABS.map((tab) => {
                const Icon = tab.icon
                const badgeCount = badgeCounts[tab.id]

                return (
                  <TabsTrigger
                    key={tab.id}
                    value={tab.id}
                    className="flex flex-col items-center gap-1 text-xs relative"
                  >
                    <Icon className="h-4 w-4" />
                    <span className="hidden xl:inline">{tab.label}</span>
                    {badgeCount !== undefined && badgeCount > 0 && (
                      <Badge
                        variant="default"
                        className="absolute -top-1 -right-1 h-4 w-4 p-0"
                      >
                        {badgeCount}
                      </Badge>
                    )}
                  </TabsTrigger>
                )
              })}
            </TabsList>

            {/* Tab content placeholders */}
            <TabsContent value="connections" className="flex-1 overflow-auto">
              <div className="p-4 text-sm text-muted-foreground">
                Connections tab (Phase 3)
              </div>
            </TabsContent>

            <TabsContent value="annotations" className="flex-1 overflow-auto">
              <div className="p-4 text-sm text-muted-foreground">
                Annotations tab (Phase 3)
              </div>
            </TabsContent>

            {/* ... other tab placeholders */}
          </Tabs>
        </div>
      </PanelContent>
    </Panel>
  )
}

export function RightPanelV2(props: RightPanelV2Props) {
  return (
    <PanelProvider defaultOpen={false}>
      <RightPanelContent {...props} />
    </PanelProvider>
  )
}
```

**Key Implementation Details**:
- Two conditional sections: collapsed (vertical icons) vs expanded (horizontal tabs)
- `group-data-[state=collapsed]` / `group-data-[state=expanded]` for visibility
- Icon click: `setActiveTab(tab.id)` + `setOpen(true)` to expand
- Badge counts positioned absolutely
- Tab content placeholders for Phase 3

#### 2. Wire Up in ReaderLayout (Optional Test)

**File**: `src/components/reader/ReaderLayout.tsx:473-481`

**Change** (optional, for testing):
```typescript
// Temporarily import both for A/B testing
import { RightPanel } from '@/components/sidebar/RightPanel'
import { RightPanelV2 } from '@/components/sidebar/RightPanelV2'

// In render:
{viewMode !== 'focus' && (
  // Toggle between old and new for testing
  process.env.NODE_ENV === 'development' ? (
    <RightPanelV2
      documentId={documentId}
      reviewResults={reviewResults}
    />
  ) : (
    <RightPanel {...oldProps} />
  )
)}
```

**Purpose**: Test new panel without breaking production. Remove after Phase 3.

### Success Criteria

#### Automated Verification:
- [ ] TypeScript compiles: `npm run type-check`
- [ ] No console errors in dev mode
- [ ] Build succeeds: `npm run build`

#### Manual Verification:
- [ ] Panel renders on right side
- [ ] Collapsed state shows vertical icon stack
- [ ] Click icon expands panel AND activates tab
- [ ] Expanded state shows horizontal tabs
- [ ] Tab switching works (placeholder content visible)
- [ ] Badge counts display on both states
- [ ] Toggle button collapses/expands smoothly
- [ ] State persists across page refresh (cookie)

**Implementation Note**: Pause after manual verification. Test thoroughly before integrating real tab content in Phase 3.

### Service Restarts:
- [ ] Next.js: Auto-reload should work
- [ ] Clear browser cookies if state issues occur

---

## Phase 3: Integrate Tab Content

### Overview

Replace placeholder content with actual tab components. Update each tab to use neobrutalism components (ScrollArea, Card, Button, Badge, Slider).

### Changes Required

#### 1. Connections Tab

**File**: `src/components/sidebar/RightPanelV2.tsx` (TabsContent for connections)

**Implementation**:
```typescript
import { ScrollArea } from '@/components/rhizome/scroll-area'
import { ConnectionsList } from './ConnectionsList'
import { ConnectionFilters } from './ConnectionFilters'

// In RightPanelContent:
<TabsContent value="connections" className="flex-1 flex flex-col overflow-hidden">
  <div className="border-b-2 border-border flex-shrink-0">
    <ConnectionFilters />
  </div>
  <div className="flex-1 overflow-auto">
    <ConnectionsList
      documentId={documentId}
      visibleChunkIds={visibleChunkIds}
      onNavigateToChunk={onNavigateToChunk}
      onConnectionsChange={onConnectionsChange}
      onActiveConnectionCountChange={onActiveConnectionCountChange}
    />
  </div>
</TabsContent>
```

**Note**: Keep existing ConnectionsList and ConnectionFilters as-is for now (Phase 4 refactors to use ConnectionCard).

#### 2. Annotations Tab

**File**: `src/components/sidebar/RightPanelV2.tsx` (TabsContent for annotations)

**Implementation**:
```typescript
import { AnnotationsList } from './AnnotationsList'

<TabsContent value="annotations" className="flex-1 overflow-hidden">
  <ScrollArea className="h-full">
    <AnnotationsList
      documentId={documentId}
      onAnnotationClick={onAnnotationClick}
    />
  </ScrollArea>
</TabsContent>
```

#### 3. Quality Tab

**File**: `src/components/sidebar/RightPanelV2.tsx` (TabsContent for quality)

**Implementation**:
```typescript
import { ChunkQualityPanel } from './ChunkQualityPanel'

<TabsContent value="quality" className="flex-1 overflow-hidden">
  <ScrollArea className="h-full">
    <ChunkQualityPanel
      documentId={documentId}
      onNavigateToChunk={onNavigateToChunk}
    />
  </ScrollArea>
</TabsContent>
```

#### 4. Sparks Tab

**File**: `src/components/sidebar/RightPanelV2.tsx` (TabsContent for sparks)

**Implementation**:
```typescript
import { SparksTab } from './SparksTab'

<TabsContent value="sparks" className="flex-1 overflow-hidden">
  <ScrollArea className="h-full">
    <SparksTab documentId={documentId} />
  </ScrollArea>
</TabsContent>
```

#### 5. Cards Tab

**File**: `src/components/sidebar/RightPanelV2.tsx` (TabsContent for cards)

**Implementation**:
```typescript
import { FlashcardsTab } from './FlashcardsTab'

<TabsContent value="cards" className="flex-1 overflow-hidden">
  <ScrollArea className="h-full">
    <FlashcardsTab documentId={documentId} />
  </ScrollArea>
</TabsContent>
```

#### 6. Review Tab

**File**: `src/components/sidebar/RightPanelV2.tsx` (TabsContent for review)

**Implementation**:
```typescript
import { AnnotationReviewTab } from './AnnotationReviewTab'

<TabsContent value="review" className="flex-1 overflow-hidden">
  <AnnotationReviewTab
    documentId={documentId}
    results={reviewResults}
    onHighlightAnnotation={onHighlightAnnotation}
    onAnnotationClick={onAnnotationClick}
  />
</TabsContent>
```

#### 7. Tune Tab

**File**: `src/components/sidebar/RightPanelV2.tsx` (TabsContent for tune)

**Implementation**:
```typescript
import { TuneTab } from './TuneTab'

<TabsContent value="tune" className="flex-1 overflow-hidden">
  <ScrollArea className="h-full">
    <TuneTab />
  </ScrollArea>
</TabsContent>
```

#### 8. Update RightPanelV2 Props Interface

**File**: `src/components/sidebar/RightPanelV2.tsx` (top of file)

**Add missing props**:
```typescript
interface RightPanelV2Props {
  documentId: string
  visibleChunkIds?: string[]
  reviewResults?: RecoveryResults | null
  onHighlightAnnotation?: (annotationId: string) => void
  onAnnotationClick?: (annotationId: string, startOffset: number) => void
  onNavigateToChunk?: (chunkId: string) => void
  onConnectionsChange?: (connections: Array<{
    id: string
    source_chunk_id: string
    target_chunk_id: string
    strength: number
  }>) => void
  onActiveConnectionCountChange?: (count: number) => void
  chunks?: any[]
}
```

**Pass props down**:
```typescript
function RightPanelContent({
  documentId,
  visibleChunkIds = [],
  reviewResults = null,
  onHighlightAnnotation,
  onAnnotationClick,
  onNavigateToChunk,
  onConnectionsChange,
  onActiveConnectionCountChange,
  chunks = [],
}: RightPanelV2Props) {
  // ... component body
}
```

### Success Criteria

#### Automated Verification:
- [ ] TypeScript compiles: `npm run type-check`
- [ ] No console errors in dev mode
- [ ] Build succeeds: `npm run build`

#### Manual Verification:
- [ ] All 7 tabs render content correctly
- [ ] Connections tab shows connections with filters
- [ ] Annotations tab shows annotation list
- [ ] Quality tab shows chunk quality panel
- [ ] Sparks tab shows spark list
- [ ] Cards tab shows placeholder
- [ ] Review tab shows annotation review (when results available)
- [ ] Tune tab shows weight sliders + settings
- [ ] Scrolling works in all tabs
- [ ] Tab switching maintains scroll position
- [ ] All callbacks work (navigate, click, etc.)

**Implementation Note**: Test each tab individually. Verify data loads and interactions work before proceeding.

### Service Restarts:
- [ ] Next.js: Auto-reload should work

---

## Phase 4: Build Domain Card Components

### Overview

Create ConnectionCard, AnnotationCard, and SparkCard components extending neobrutalism Card. Update list components to use new cards.

### Changes Required

#### 1. ConnectionCard Component

**File**: `src/components/rhizome/connection-card.tsx`

**Implementation**:
```typescript
'use client'

import { useState } from 'react'
import {
  Card,
  CardHeader,
  CardContent,
  CardFooter,
} from '@/components/rhizome/card'
import { Badge } from '@/components/rhizome/badge'
import { Button } from '@/components/rhizome/button'
import { Progress } from '@/components/ui/progress'
import { ExternalLink, Check, X, Star } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ConnectionCardProps {
  connection: {
    id: string
    connection_type: string
    strength: number
    metadata: {
      target_snippet: string
      target_chunk_id: string
    }
    user_validated?: boolean | null
  }
  isActive?: boolean
  onClick?: () => void
  onNavigate?: () => void
}

export function ConnectionCard({
  connection,
  isActive = false,
  onClick,
  onNavigate,
}: ConnectionCardProps) {
  const [feedbackType, setFeedbackType] = useState<
    'validate' | 'reject' | 'star' | null
  >(connection.user_validated === true ? 'validate' :
     connection.user_validated === false ? 'reject' : null)

  const strength = connection.strength

  // Border color based on feedback
  const borderClass =
    feedbackType === 'validate'
      ? 'border-green-500'
      : feedbackType === 'reject'
      ? 'border-red-500'
      : feedbackType === 'star'
      ? 'border-yellow-500'
      : isActive
      ? 'border-main'
      : 'border-border'

  // Engine color mapping
  const engineColors: Record<string, string> = {
    semantic_similarity: 'bg-blue-500',
    thematic_bridge: 'bg-purple-500',
    contradiction_detection: 'bg-red-500',
  }

  return (
    <Card
      className={cn(
        'cursor-pointer hover:bg-muted/50 transition-all border-2',
        borderClass
      )}
      onClick={onClick}
    >
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 space-y-1">
            {/* Badge + Progress */}
            <div className="flex items-center gap-2">
              <Badge
                variant="default"
                className={engineColors[connection.connection_type]}
              >
                {connection.connection_type.replace(/_/g, ' ')}
              </Badge>
              <Progress value={strength * 100} className="w-16 h-2" />
              <span className="text-xs text-muted-foreground font-mono">
                {(strength * 100).toFixed(0)}%
              </span>
              {/* Feedback icons */}
              {feedbackType === 'validate' && (
                <Check className="w-4 h-4 text-green-500" />
              )}
              {feedbackType === 'reject' && (
                <X className="w-4 h-4 text-red-500" />
              )}
              {feedbackType === 'star' && (
                <Star className="w-4 h-4 text-yellow-500 fill-yellow-500" />
              )}
            </div>
          </div>
          <Button
            variant="noShadow"
            size="icon"
            onClick={(e) => {
              e.stopPropagation()
              onNavigate?.()
            }}
          >
            <ExternalLink className="h-3 w-3" />
          </Button>
        </div>
      </CardHeader>

      <CardContent className="pb-3">
        <p className="text-sm text-muted-foreground line-clamp-2">
          {connection.metadata.target_snippet}
        </p>

        {/* Hotkey hints when active */}
        {isActive && (
          <div className="mt-2 pt-2 border-t text-xs text-muted-foreground">
            <kbd className="px-1 bg-muted rounded">v</kbd> validate ·{' '}
            <kbd className="px-1 bg-muted rounded">x</kbd> reject ·{' '}
            <kbd className="px-1 bg-muted rounded">s</kbd> star
          </div>
        )}
      </CardContent>
    </Card>
  )
}
```

**Key Features**:
- Dynamic border colors based on feedback state
- Badge with engine-specific colors
- Progress bar for strength
- Feedback icons (check, x, star)
- Jump button with external link icon
- Hotkey hints when active
- Line clamp for text truncation

#### 2. AnnotationCard Component

**File**: `src/components/rhizome/annotation-card.tsx`

**Implementation**:
```typescript
'use client'

import { useState } from 'react'
import {
  Card,
  CardHeader,
  CardContent,
  CardFooter,
} from '@/components/rhizome/card'
import { Badge } from '@/components/rhizome/badge'
import { Button } from '@/components/rhizome/button'
import { Pencil, Trash, ExternalLink } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatDistanceToNow } from 'date-fns'

interface AnnotationCardProps {
  annotation: {
    entity_id: string
    text: string
    note?: string
    color: string
    tags: string[]
    created_at: string
    chunk_ids: string[]
  }
  onEdit?: () => void
  onDelete?: () => void
  onJump?: () => void
}

export function AnnotationCard({
  annotation,
  onEdit,
  onDelete,
  onJump,
}: AnnotationCardProps) {
  const [isHovered, setIsHovered] = useState(false)

  // Color mapping for left border
  const colorClasses: Record<string, string> = {
    yellow: 'border-l-yellow-400',
    green: 'border-l-green-400',
    blue: 'border-l-blue-400',
    purple: 'border-l-purple-400',
    pink: 'border-l-pink-400',
  }

  return (
    <Card
      className={cn(
        'cursor-pointer hover:bg-muted/50 transition-all border-l-4',
        colorClasses[annotation.color] || 'border-l-border'
      )}
      onClick={onJump}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1">
            <p className="text-sm font-medium line-clamp-2">
              {annotation.text}
            </p>
          </div>
          {isHovered && (
            <div className="flex gap-1">
              <Button
                variant="noShadow"
                size="icon"
                onClick={(e) => {
                  e.stopPropagation()
                  onEdit?.()
                }}
              >
                <Pencil className="h-3 w-3" />
              </Button>
              <Button
                variant="noShadow"
                size="icon"
                onClick={(e) => {
                  e.stopPropagation()
                  onDelete?.()
                }}
              >
                <Trash className="h-3 w-3" />
              </Button>
            </div>
          )}
        </div>
      </CardHeader>

      {annotation.note && (
        <CardContent className="pb-2">
          <p className="text-xs text-muted-foreground line-clamp-2">
            {annotation.note}
          </p>
        </CardContent>
      )}

      <CardFooter className="pt-2">
        <div className="flex items-center gap-2 text-xs text-muted-foreground w-full">
          <span>
            {formatDistanceToNow(new Date(annotation.created_at), {
              addSuffix: true,
            })}
          </span>
          {annotation.tags.map((tag) => (
            <Badge key={tag} variant="neutral" className="h-4 text-xs">
              #{tag}
            </Badge>
          ))}
        </div>
      </CardFooter>
    </Card>
  )
}
```

**Key Features**:
- Colored left border based on highlight color
- Hover to show edit/delete buttons
- Tag badges in footer
- Relative timestamp
- Line clamp for text and note
- Click to jump to annotation

#### 3. SparkCard Component

**File**: `src/components/rhizome/spark-card.tsx`

**Implementation**:
```typescript
'use client'

import {
  Card,
  CardHeader,
  CardContent,
  CardFooter,
} from '@/components/rhizome/card'
import { Badge } from '@/components/rhizome/badge'
import { Button } from '@/components/rhizome/button'
import { Link as LinkIcon, Zap } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatDistanceToNow } from 'date-fns'

interface SparkCardProps {
  spark: {
    entity_id: string
    content: string
    tags: string[]
    created_at: string
    selections?: Array<{
      text: string
      chunkId: string
    }>
    connections?: string[]
  }
  onJump?: () => void
}

export function SparkCard({ spark, onJump }: SparkCardProps) {
  const selectionCount = spark.selections?.length || 0
  const connectionCount = spark.connections?.length || 0

  return (
    <Card className="hover:bg-muted/50 transition-all cursor-pointer" onClick={onJump}>
      <CardHeader className="pb-2">
        <div className="flex items-start gap-2">
          <Zap className="h-4 w-4 text-yellow-500 flex-shrink-0 mt-0.5" />
          <p className="text-sm flex-1">{spark.content}</p>
        </div>
      </CardHeader>

      {selectionCount > 0 && (
        <CardContent className="pb-2">
          <div className="flex flex-wrap gap-1">
            {spark.selections?.map((selection, idx) => (
              <Badge
                key={idx}
                variant="neutral"
                className="text-xs max-w-[150px] truncate"
              >
                <LinkIcon className="h-3 w-3 mr-1" />
                {selection.text.substring(0, 20)}...
              </Badge>
            ))}
          </div>
        </CardContent>
      )}

      <CardFooter className="pt-2">
        <div className="flex items-center justify-between w-full text-xs text-muted-foreground">
          <span>
            {formatDistanceToNow(new Date(spark.created_at), {
              addSuffix: true,
            })}
          </span>
          <div className="flex items-center gap-2">
            {spark.tags.map((tag) => (
              <Badge key={tag} variant="neutral" className="h-4 text-xs">
                #{tag}
              </Badge>
            ))}
            {connectionCount > 0 && (
              <Badge variant="default" className="h-4 text-xs">
                {connectionCount} links
              </Badge>
            )}
          </div>
        </div>
      </CardFooter>
    </Card>
  )
}
```

**Key Features**:
- Zap icon indicator
- Selection badges with link icon
- Tag badges in footer
- Connection count badge
- Relative timestamp
- Click to jump to spark origin

#### 4. Update ConnectionsList to Use ConnectionCard

**File**: `src/components/sidebar/ConnectionsList.tsx` (around line 257-282)

**Replace existing card rendering**:
```typescript
import { ConnectionCard } from '@/components/rhizome/connection-card'

// In render:
{groupedConnections.map(({ engine, connections: engineConnections }) => (
  <div key={engine}>
    <h4 className="text-sm font-medium px-4 py-2">
      {ENGINE_LABELS[engine]}
    </h4>
    <div className="space-y-2 px-4">
      {engineConnections.map((connection) => (
        <ConnectionCard
          key={connection.id}
          connection={connection}
          isActive={activeConnectionId === connection.id}
          onClick={() => handleConnectionClick(connection)}
          onNavigate={() => handleNavigateToChunk(connection.metadata.target_chunk_id)}
        />
      ))}
    </div>
  </div>
))}
```

#### 5. Update AnnotationsList to Use AnnotationCard

**File**: `src/components/sidebar/AnnotationsList.tsx`

**Replace existing annotation rendering**:
```typescript
import { AnnotationCard } from '@/components/rhizome/annotation-card'

// In render:
{annotations.map((annotation) => (
  <AnnotationCard
    key={annotation.entity_id}
    annotation={annotation}
    onJump={() => handleAnnotationClick(annotation)}
    onEdit={() => handleEditAnnotation(annotation)}
    onDelete={() => handleDeleteAnnotation(annotation.entity_id)}
  />
))}
```

#### 6. Update SparksTab to Use SparkCard

**File**: `src/components/sidebar/SparksTab.tsx` (around line 119-246)

**Replace existing spark rendering**:
```typescript
import { SparkCard } from '@/components/rhizome/spark-card'

// In render:
{sparks.map((spark) => (
  <SparkCard
    key={spark.entity_id}
    spark={spark}
    onJump={() => handleSparkClick(spark)}
  />
))}
```

### Success Criteria

#### Automated Verification:
- [ ] TypeScript compiles: `npm run type-check`
- [ ] No console errors in dev mode
- [ ] Build succeeds: `npm run build`

#### Manual Verification:
- [ ] ConnectionCard renders with correct colors and badges
- [ ] AnnotationCard shows colored left border
- [ ] SparkCard displays selection badges
- [ ] Hover states work (edit/delete buttons on AnnotationCard)
- [ ] Click handlers work (jump, edit, delete, navigate)
- [ ] Progress bars and badges display correctly
- [ ] Hotkey hints show on active ConnectionCard
- [ ] All cards use neobrutalism styling (bold borders, shadows)

**Implementation Note**: Test each card type individually. Verify styling matches neobrutalism aesthetic before proceeding.

### Service Restarts:
- [ ] Next.js: Auto-reload should work

---

## Phase 5: Replace Old RightPanel

### Overview

Replace old RightPanel with RightPanelV2, delete old implementation, clean up imports.

### Changes Required

#### 1. Update ReaderLayout Import

**File**: `src/components/reader/ReaderLayout.tsx:473-481`

**Before**:
```typescript
import { RightPanel } from '@/components/sidebar/RightPanel'
```

**After**:
```typescript
import { RightPanel } from '@/components/sidebar/RightPanelV2'
```

**Update usage** (remove V2 suffix):
```typescript
{viewMode !== 'focus' && (
  <RightPanel
    documentId={documentId}
    visibleChunkIds={visibleChunks.map(c => c.id)}
    reviewResults={reviewResults}
    onHighlightAnnotation={onHighlightAnnotation}
    onAnnotationClick={handleAnnotationClick}
    onNavigateToChunk={handleNavigateToChunk}
    onConnectionsChange={setConnections}
    onActiveConnectionCountChange={setActiveConnectionCount}
    chunks={chunks}
  />
)}
```

#### 2. Rename RightPanelV2 to RightPanel

**Commands**:
```bash
mv src/components/sidebar/RightPanelV2.tsx \
   src/components/sidebar/RightPanel.tsx
```

**Update exports in file**:
```typescript
// Change from:
export function RightPanelV2(props: RightPanelV2Props) {

// To:
export function RightPanel(props: RightPanelProps) {
```

**Update interface name**:
```typescript
// Change from:
interface RightPanelV2Props {

// To:
interface RightPanelProps {
```

#### 3. Delete Old RightPanel Backup

**Command**:
```bash
# Keep backup temporarily in case rollback needed
mv src/components/sidebar/RightPanel.old.tsx \
   src/components/sidebar/RightPanel.backup.tsx

# After successful testing, delete:
rm src/components/sidebar/RightPanel.backup.tsx
```

#### 4. Update Imports in Tab Components

**Files to Check**:
- `src/components/sidebar/ConnectionsList.tsx`
- `src/components/sidebar/AnnotationsList.tsx`
- `src/components/sidebar/SparksTab.tsx`

**Ensure using rhizome components**:
```typescript
// Replace shadcn imports with rhizome
import { Card } from '@/components/rhizome/card'
import { Badge } from '@/components/rhizome/badge'
import { Button } from '@/components/rhizome/button'
import { ScrollArea } from '@/components/rhizome/scroll-area'
```

### Success Criteria

#### Automated Verification:
- [ ] TypeScript compiles: `npm run type-check`
- [ ] No import errors: `npm run lint`
- [ ] Build succeeds: `npm run build`
- [ ] No dead code detected

#### Manual Verification:
- [ ] RightPanel renders correctly in reader
- [ ] All 7 tabs work as before
- [ ] State persists across page refresh
- [ ] Collapse/expand animations smooth
- [ ] Icon stack → horizontal tabs transform works
- [ ] All callbacks function (navigate, click, etc.)
- [ ] No regression in existing features
- [ ] Performance comparable to old panel

**Implementation Note**: This is the critical replacement step. Test exhaustively before deleting old backup file.

### Service Restarts:
- [ ] Next.js: Auto-reload should work
- [ ] Clear browser cache if state issues occur

---

## Phase 6: Refactor ConnectionFilters and TuneTab

### Overview

Update ConnectionFilters and TuneTab to use neobrutalism Badge, Button, and Slider components with improved styling.

### Changes Required

#### 1. Update ConnectionFilters

**File**: `src/components/sidebar/ConnectionFilters.tsx`

**Replace imports**:
```typescript
import { Badge } from '@/components/rhizome/badge'
import { Button } from '@/components/rhizome/button'
import { Slider } from '@/components/rhizome/slider'
```

**Update badge toggle styling**:
```typescript
{(Object.keys(weights) as SynthesisEngine[]).map((engine) => {
  const isEnabled = enabledEngines.has(engine)
  return (
    <Badge
      key={engine}
      variant={isEnabled ? 'default' : 'neutral'}
      className={cn(
        'cursor-pointer transition-all',
        isEnabled && ENGINE_COLORS[engine]
      )}
      onClick={() => toggleEngine(engine)}
    >
      {ENGINE_LABELS[engine]}
    </Badge>
  )
})}
```

**Update slider styling**:
```typescript
<Slider
  id="strength-threshold"
  value={[strengthThreshold]}
  onValueChange={([value]) => setStrengthThreshold(value)}
  min={0.3}
  max={1}
  step={0.05}
  className="my-2"
/>
```

#### 2. Update TuneTab with Auto-Balancing Sliders

**File**: `src/components/sidebar/TuneTab.tsx`

**Add auto-balance logic**:
```typescript
import { useState, useEffect } from 'react'
import { Slider } from '@/components/rhizome/slider'
import { Button } from '@/components/rhizome/button'
import { Badge } from '@/components/rhizome/badge'

export function TuneTab() {
  const weights = useConnectionStore((state) => state.weights)
  const setWeight = useConnectionStore((state) => state.setWeight)
  const applyPreset = useConnectionStore((state) => state.applyPreset)

  // Auto-balance: when one weight changes, distribute remainder
  const handleWeightChange = (
    engine: keyof EngineWeights,
    newValue: number
  ) => {
    const otherEngines = (
      Object.keys(weights) as Array<keyof EngineWeights>
    ).filter((e) => e !== engine)

    const otherTotal = otherEngines.reduce(
      (sum, e) => sum + weights[e],
      0
    )
    const remaining = 1 - newValue

    // Distribute remaining weight proportionally
    if (otherTotal > 0 && remaining > 0) {
      otherEngines.forEach((e) => {
        const proportion = weights[e] / otherTotal
        setWeight(e, remaining * proportion)
      })
    }

    setWeight(engine, newValue)
  }

  // Calculate total (should always be ~1.0)
  const total = Object.values(weights).reduce((sum, w) => sum + w, 0)

  return (
    <div className="space-y-6 p-4">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h4 className="font-semibold text-sm">Engine Weights</h4>
          <Badge variant={Math.abs(total - 1.0) < 0.01 ? 'default' : 'neutral'}>
            Total: {(total * 100).toFixed(0)}%
          </Badge>
        </div>

        {/* Individual sliders */}
        {(Object.entries(weights) as [keyof EngineWeights, number][]).map(
          ([engine, value]) => (
            <div key={engine} className="space-y-2">
              <div className="flex justify-between items-center">
                <label className="text-sm font-medium">
                  {ENGINE_LABELS[engine]}
                </label>
                <span className="text-sm text-muted-foreground font-mono">
                  {(value * 100).toFixed(0)}%
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                {ENGINE_DESCRIPTIONS[engine]}
              </p>
              <Slider
                value={[value]}
                onValueChange={([newValue]) =>
                  handleWeightChange(engine, newValue)
                }
                min={0}
                max={1}
                step={0.05}
              />
            </div>
          )
        )}
      </div>

      {/* Preset buttons */}
      <div className="space-y-2">
        <label className="text-sm font-medium">Presets</label>
        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="neutral"
            size="sm"
            onClick={() => applyPreset('max-friction')}
          >
            Max Friction
          </Button>
          <Button
            variant="neutral"
            size="sm"
            onClick={() => applyPreset('balanced')}
          >
            Balanced
          </Button>
        </div>
      </div>

      {/* Connection count preview (future) */}
      <div className="text-xs text-muted-foreground border-t pt-4">
        <p>
          Adjusting weights will affect which connections are shown.
          Higher weights prioritize that engine's findings.
        </p>
      </div>
    </div>
  )
}
```

**Key Features**:
- Auto-balance: changing one slider redistributes others proportionally
- Total weight badge (shows 100% when balanced)
- Percentage display for each weight
- Preset buttons using neobrutalism Button
- Description text for each engine

### Success Criteria

#### Automated Verification:
- [ ] TypeScript compiles: `npm run type-check`
- [ ] Build succeeds: `npm run build`

#### Manual Verification:
- [ ] ConnectionFilters badge toggles work
- [ ] Slider threshold adjusts properly
- [ ] TuneTab sliders auto-balance to 100%
- [ ] Total weight badge shows 100% when balanced
- [ ] Preset buttons apply correct weights
- [ ] All components use neobrutalism styling
- [ ] Percentage displays are accurate

**Implementation Note**: Test auto-balance logic thoroughly. Total should always equal 100%.

### Service Restarts:
- [ ] Next.js: Auto-reload should work

---

## Testing Strategy

### Unit Tests

**Not Required**: This is a UI refactor without business logic changes. Visual/interaction testing is manual.

### Integration Tests

**Not Required**: Tab content components already tested, just using new wrapper.

### Manual Testing Checklist

#### Panel Behavior
- [ ] Panel collapses to 48px width
- [ ] Panel expands to 384px width
- [ ] Collapse/expand animation smooth (spring physics)
- [ ] Toggle button works from both states
- [ ] State persists across page refresh (cookie)
- [ ] Mobile: Panel becomes Sheet overlay

#### Tab System
- [ ] Icon stack visible when collapsed
- [ ] Click icon expands AND activates tab
- [ ] Horizontal tabs visible when expanded
- [ ] Tab switching works (7 tabs)
- [ ] Active tab highlighted
- [ ] Badge counts display on both states

#### Tab Content
- [ ] Connections: List loads, filters work, cards clickable
- [ ] Annotations: List loads, edit/delete work, jump works
- [ ] Quality: Chunk quality panel loads
- [ ] Sparks: List loads, cards clickable
- [ ] Cards: Placeholder shows
- [ ] Review: Annotation review loads (when results available)
- [ ] Tune: Sliders auto-balance, presets work

#### Card Components
- [ ] ConnectionCard: Border colors, badges, progress bar, jump button
- [ ] AnnotationCard: Colored border, hover actions, tags
- [ ] SparkCard: Zap icon, selection badges, timestamps

#### Filters & Controls
- [ ] ConnectionFilters: Badge toggles, slider threshold
- [ ] TuneTab: Auto-balancing sliders, total = 100%, presets

#### Performance
- [ ] No lag during collapse/expand
- [ ] Tab switching instant (<100ms)
- [ ] Scroll performance smooth in all tabs
- [ ] No memory leaks (check DevTools)

#### Edge Cases
- [ ] No connections: Empty state shows
- [ ] No annotations: Empty state shows
- [ ] Review results null: Tab handles gracefully
- [ ] Large lists (1000+ items): Scroll works
- [ ] Rapid tab switching: No glitches
- [ ] Resize window: Panel adapts

---

## Performance Considerations

### Animation Performance

**Framer Motion Removed**: Neobrutalism sidebar uses CSS transitions, lighter than framer-motion spring animations.

**Expected Improvement**: Reduced bundle size (~50KB), smoother 60fps animations.

### State Management

**Cookie Persistence**: Panel state persisted in cookies (7-day expiry), reduces localStorage pressure.

**Zustand for Filters**: ConnectionStore and UIStore continue managing filter/weight state with localStorage.

### Rendering Optimization

**Tab Content Lazy Rendering**: Only active tab content rendered (conditional mounting).

**Card Virtualization**: Consider `react-window` for ConnectionsList if >500 connections (future optimization).

---

## Migration Notes

### Breaking Changes

**None**: RightPanelV2 is drop-in replacement with same props interface.

### Rollback Plan

If issues occur after Phase 5:

```bash
# Restore old RightPanel
mv src/components/sidebar/RightPanel.backup.tsx \
   src/components/sidebar/RightPanel.tsx

# Update ReaderLayout import back to old version
# Restart Next.js dev server
```

### Data Migration

**Not Applicable**: No database changes, UI only.

---

## Future Enhancements

### LeftPanel Implementation

**Pattern Established**: Use same Panel component with `side="left"`

**Tabs** (from spec):
1. Chapter Outline
2. Source Info
3. Source Stats
4. Session Tracking
5. Heatmap

**File**: `src/components/sidebar/LeftPanel.tsx` (future)

### BottomPanel Implementation

**Pattern Established**: Use same Panel component with `side="bottom"`

**Content** (from spec):
- Horizontal widget layout (Toggle, Help, Section Title, Top Connection, "Where was I?", Export, Chat)
- Collapsed: 48px height
- Expanded: Variable height (or 40% for chat)

**File**: `src/components/layout/BottomPanel.tsx` (future)

### Keyboard Shortcuts

**Current**: Cmd/Ctrl+B toggles panel (neobrutalism default)

**Future Enhancements**:
- Numeric keys (1-7) to switch tabs
- Cmd+Shift+arrows to navigate between connections
- Custom shortcut per panel (Cmd+L for left, Cmd+R for right, Cmd+B for bottom)

---

## References

- **Architecture**: `docs/ARCHITECTURE.md`
- **UI Patterns**: `docs/UI_PATTERNS.md`
- **Current RightPanel**: `src/components/sidebar/RightPanel.tsx:75-242`
- **Neobrutalism Sidebar**: `src/components/libraries/neobrutalism/sidebar.tsx:1-715`
- **ProcessingDock Pattern**: `src/components/layout/ProcessingDock.tsx:45-408`
- **ConnectionCard Pattern**: `src/components/sidebar/ConnectionCard.tsx:1-260`
- **ConnectionFilters Pattern**: `src/components/sidebar/ConnectionFilters.tsx:1-85`
- **Neobrutalism Docs**: https://www.neobrutalism.dev/docs
- **Similar Plan**: `thoughts/plans/2025-10-17_cached-chunks-storage.md` (storage refactor example)
