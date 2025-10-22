# Neobrutalism Reader Implementation Plan v2

**Date**: 2025-10-22
**Timeline**: 5-6 weeks
**Focus**: Complete neobrutalist transformation using neobrutalism.dev components + LeftPanel navigation + session tracking + AI features

---

## Overview

Transform Rhizome V2 reader into a bold, neobrutalist interface by:
1. **Installing neobrutalism.dev components** via shadcn registry (sidebar, tabs, card, badge, button, progress, alert, etc.)
2. **Replacing existing shadcn/ui components** with neobrutalist versions for ownership and customization
3. **Building LeftPanel** with Outline/Stats/Heatmap tabs using neobrutalist sidebar patterns
4. **Adding session tracking** with engagement threshold (30s OR 10% scroll)
5. **Implementing StatsTab** with live reading metrics and neobrutalist cards
6. **Creating BottomPanel** with AI "Where Was I?" feature
7. **Globally restyling** all reader components with neobrutalist design tokens

**Why**: Achieve a distinctive, bold visual identity while adding powerful navigation and AI features. Neobrutalism.dev components provide source code ownership for complete customization.

**Key Advantage**: Install components as source code (not npm packages) → full ownership and customization without dependency hell.

---

## Current State Analysis

### What Exists

**Reader Architecture** (`src/components/reader/ReaderLayout.tsx:93`):
- 4-Store Zustand orchestration (reader, ui, connection, annotation stores)
- RightPanel with 7 icon-only tabs (connections, sparks, cards, tune, annotations, quality, review)
- 3 view modes (explore, focus, study) with conditional rendering
- Framer Motion spring animations for panel collapse/expand
- VirtualizedReader with scroll tracking (0-100%)

**UI Components**:
- 27 shadcn/ui components in `components/ui/` (standard styling)
- Custom reader components (ConnectionCard, AnnotationsList, SparksTab, etc.)
- ProcessingDock (bottom-right floating dock)
- AdminPanel (Cmd+Shift+A overlay with 6 tabs)
- QuickSparkCapture (Cmd+K slide-in panel)

**Existing Styling**:
- `styles/neobrutalism.css` exists with **comprehensive OKLCH-based tokens** (source of truth)
- Tokens: `--neo-border-sm/md/lg` (2-4px), `--neo-shadow-sm/md/lg` (4-8px), `--neo-radius-sm/md/lg` (6-12px)
- Dual palette system (Palette A: OKLCH Semantic, Palette B: Neobrutalism Bold)
- `components.json` configured for shadcn with CSS variables
- Neobrutalism registry configured ✓
- Design playground at `/design` with BrutalismPlayground tab

**Gemini Integration** (`lib/sparks/title-generator.ts:15`):
- Vercel AI SDK (`ai` + `@ai-sdk/google`) installed
- `generateText()` pattern with `google('gemini-2.0-flash-exp')`
- Server Action patterns ready

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
- ✅ Neobrutalism registry configured
- ✅ Neobrutalist design tokens exist (`src/styles/neobrutalism.css`)
- ❌ Neobrutalist components not installed (source ownership)
- ❌ Mapping layer missing (connect components to existing tokens)
- ❌ Existing components use standard shadcn styling (not neobrutalist)

**Key Discoveries**:
- Migration 062 is latest (`062_spark_portability_orphan_survival.sql`)
- `chunks` table has `heading_path` (TEXT[]) and `heading_level` (INTEGER) - ready for Outline
- No `reading_sessions` or `section_summaries` tables exist
- ReaderLayout already supports view mode switching - can enhance without breaking
- Neobrutalism registry: `https://v3.neobrutalism.dev/r/{name}.json`
- 77 total components available in neobrutalism registry

---

## Desired End State

### User Experience

1. **Opens document** → LeftPanel (neobrutalist sidebar) shows hierarchical outline with connection density indicators
2. **Scrolls/interacts for 30+ seconds OR scrolls >10%** → Session tracking begins silently
3. **Clicks section in outline** → Jumps to that section, connections auto-load in RightPanel
4. **Reads for 15 minutes** → StatsTab shows "15 min this session, 47 min total, 2h 13min this week" in bold neobrutalist cards
5. **Closes document, returns 2 days later** → Clicks "Where was I?" in BottomPanel → Gets rich AI summary in neobrutalist alert
6. **All UI components** → Bold 3-4px borders, hard 6px shadows (no blur), flat colors, neobrutalist aesthetic throughout
7. **Complete source ownership** → All neobrutalist components copied to our codebase for full customization

### Technical Specification

**Neobrutalism Design System**:
- **Borders**: `border-2` (2px), `border-b-4` and `border-r-4` (4px for depth effect)
- **Shadows**: Hard shadows with no blur - `shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]`
- **Colors**: High contrast, bold colors (no gradients) - `bg-main`, `bg-secondary-background`, `border-border`
- **Rounded**: Moderate rounding - `rounded-base` (CSS variable `--radius: 0.5rem`)
- **Typography**: Bold, clear hierarchy with `font-heading` for titles
- **Animations**: Quick, obvious transitions (300ms) with hover translations

**LeftPanel (Neobrutalist Sidebar)**:
- Uses neobrutalism sidebar component (source ownership)
- Fixed left position (mirrors RightPanel pattern)
- 3 tabs: Outline, Stats, Heatmap (neobrutalist tabs component)
- Collapse to 48px icon-only, expand to 320px
- Framer Motion spring animations
- Bold borders, hard shadows, flat colors

**Session Tracking**:
- Starts after threshold: 30 seconds OR 10% scroll (whichever first)
- Updates every 30 seconds (DB write)
- Tracks: time, position, sparks, annotations
- Ends on: blur, beforeunload, 5min idle

**Stats Display (Neobrutalist Cards)**:
- This session (live counter) - bold neobrutalist card with shadow
- This document (total from all sessions) - neobrutalist card
- This week (past 7 days aggregate) - neobrutalist card
- Progress bar (scroll position) - neobrutalist progress component
- Engagement counts (sparks, annotations) - neobrutalist badges

**"Where Was I?" (Neobrutalist Alert)**:
- BottomPanel compact bar (56px persistent) - neobrutalist card with bold shadow
- AI summary generation (~5-10 sec)
- Section summaries cached (reuse for speed)
- Anti-spoiler (only content before current position)
- Display in neobrutalist alert component with bold borders

**Component Ownership**:
- All neobrutalist components installed as source files in `src/components/ui/`
- Full customization capability without npm dependency management
- Version control tracks all component changes
- Can fork and modify any component for Rhizome-specific needs

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
- ❌ Dark mode variants (implement light mode first, dark later)

---

## Implementation Approach

**Strategy**: Install neobrutalist components as source → Replace existing UI → Build new features with neobrutalist styling

### Phase Sequence:

1. **Neobrutalism Setup** - Add mapping layer, install core components (preserves existing tokens)
2. **Core Component Replacement** - Replace existing shadcn/ui with neobrutalist versions (button, card, tabs, badge, etc.)
3. **LeftPanel Foundation** - Build sidebar with Outline/Stats/Heatmap tabs using neobrutalist components
4. **Session Tracking** - Silent background tracking with threshold trigger
5. **StatsTab Implementation** - Populate with live metrics using neobrutalist cards/progress
6. **BottomPanel + "Where Was I?"** - AI-powered context summary with neobrutalist alert
7. **Global Restyling** - Apply neobrutalist styling to all remaining reader components

**Token Management**: Your `src/styles/neobrutalism.css` remains the single source of truth. All changes to colors, shadows, borders, and radius happen there and automatically propagate to all installed components via the mapping layer.

### Key Principles:

- **Single Source of Truth**: Your `neobrutalism.css` tokens control all styling (change once, update everywhere)
- **Mapping Layer**: Components use expected variable names, but values come from your tokens
- **Source Ownership**: Install all components as source files for full customization
- **Replace Before Build**: Replace existing UI components before building new features
- **Your Bold Visual Identity**: 2-4px borders, 6px hard shadows (your choice, not theirs), OKLCH colors throughout
- **Mirror RightPanel Patterns**: Fixed positioning, framer-motion animations, icon grid tabs
- **Gemini via Vercel AI SDK**: `generateText()` with `google('gemini-2.0-flash-exp')`
- **Server Actions for Mutations**: Multi-step pipeline (AI → Database → Storage → Cache)
- **Zustand for State**: New `session-store.ts` for tracking, extend `ui-store.ts` for LeftPanel
- **Threshold Tracking**: Prevent accidental session starts (30s OR 10% scroll)

---

## Phase 1: Neobrutalism Setup & Component Installation

### Overview

Configure neobrutalism registry, install core components as source files, add mapping layer to connect neobrutalism.dev component expectations to your existing design tokens.

**Success**: Registry configured, 15+ components installed as source, mapping layer connects components to your tokens, test page renders with your bold borders and hard shadows

**Key Principle**: Your `neobrutalism.css` tokens are the **single source of truth**. Changes there propagate to all components via mapping layer.

### Changes Required

#### 1. Configure Neobrutalism Registry

**File**: `components.json` (ALREADY DONE ✓)

Already updated with:
```json
"registries": {
  "@neobrutalism": "https://v3.neobrutalism.dev/r/{name}.json"
}
```

#### 2. Add Mapping Layer for Component Compatibility

**File**: `src/app/globals.css` (ADD at the end)

**Add mapping layer that aliases neobrutalism.dev expected names to your existing tokens**:

```css
/* ========================================
   NEOBRUTALISM.DEV COMPONENT MAPPING
   Maps component expectations to our tokens
   Source of truth: src/styles/neobrutalism.css
   ======================================== */

@layer base {
  :root {
    /* Map neobrutalism.dev component variables to our existing tokens */

    /* Primary colors (map to --neo-primary) */
    --main: var(--neo-primary);
    --main-foreground: var(--neo-primary-foreground);

    /* Secondary background (map to --neo-secondary) */
    --secondary-background: var(--neo-secondary);

    /* Structural tokens (map to our --neo-* tokens) */
    --shadow: var(--neo-shadow-md);          /* 6px 6px 0px 0px */
    --radius: var(--neo-radius-md);          /* 0.5rem (8px) */
    --border: hsl(var(--foreground));        /* Black borders */

    /* Radius alias for rounded-base class */
    --radius-base: var(--neo-radius-md);
  }

  .dark {
    /* Dark mode inherits from neobrutalism.css dark mode adjustments */
    --shadow: var(--neo-shadow-md); /* Uses dark mode shadow from neobrutalism.css */
  }
}

/* Import your existing neobrutalism tokens */
@import "../styles/neobrutalism.css";
```

**Why This Works**:
- Your `neobrutalism.css` defines all the values
- This mapping layer creates aliases that neobrutalism.dev components expect
- Change `--neo-shadow-md` in `neobrutalism.css` → automatically updates all components
- Single source of truth maintained

#### 3. Update Tailwind Config for Component Class Names

**File**: `tailwind.config.ts` (MODIFY)

**Add color mappings so Tailwind classes work**:

```typescript
import type { Config } from "tailwindcss"

const config = {
  darkMode: ["class"],
  content: [
    './pages/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './app/**/*.{ts,tsx}',
    './src/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        // Neobrutalism.dev component colors (mapped to your tokens)
        main: {
          DEFAULT: "var(--main)",
          foreground: "var(--main-foreground)",
        },
        "secondary-background": "var(--secondary-background)",
        border: "var(--border)",

        // Keep existing shadcn tokens for backward compatibility
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
      },
      borderRadius: {
        base: "var(--radius-base)", // Maps to --neo-radius-md
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      boxShadow: {
        shadow: "var(--shadow)", // Maps to --neo-shadow-md
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config

export default config
```

#### 4. Install Core Neobrutalism Components

**Commands**: Run sequentially, installing components as source files

```bash
# Core UI components (15 total)
npx shadcn@latest add https://v3.neobrutalism.dev/r/button.json
npx shadcn@latest add https://v3.neobrutalism.dev/r/card.json
npx shadcn@latest add https://v3.neobrutalism.dev/r/tabs.json
npx shadcn@latest add https://v3.neobrutalism.dev/r/badge.json
npx shadcn@latest add https://v3.neobrutalism.dev/r/progress.json
npx shadcn@latest add https://v3.neobrutalism.dev/r/alert.json
npx shadcn@latest add https://v3.neobrutalism.dev/r/sidebar.json
npx shadcn@latest add https://v3.neobrutalism.dev/r/scroll-area.json
npx shadcn@latest add https://v3.neobrutalism.dev/r/accordion.json
npx shadcn@latest add https://v3.neobrutalism.dev/r/separator.json
npx shadcn@latest add https://v3.neobrutalism.dev/r/input.json
npx shadcn@latest add https://v3.neobrutalism.dev/r/textarea.json
npx shadcn@latest add https://v3.neobrutalism.dev/r/label.json
npx shadcn@latest add https://v3.neobrutalism.dev/r/switch.json
npx shadcn@latest add https://v3.neobrutalism.dev/r/slider.json
```

**Note**: Components will be installed to `src/components/ui/` as source files. Some may have "n" prefix (nbutton, ncard) or standard names depending on registry.

#### 5. Create Component Aliases for Neobrutalist Versions

**File**: `src/components/neobrutalism/index.ts` (NEW)

Create re-export file for clarity:

```typescript
// Re-export neobrutalist components with clear naming
// This makes it easy to distinguish from original shadcn components

export { Button } from '@/components/ui/button'
export { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card'
export { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
export { Badge } from '@/components/ui/badge'
export { Progress } from '@/components/ui/progress'
export { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert'
export {
  Sidebar,
  SidebarProvider,
  SidebarTrigger,
  SidebarInset,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton
} from '@/components/ui/sidebar'
export { ScrollArea } from '@/components/ui/scroll-area'
export { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '@/components/ui/accordion'
export { Separator } from '@/components/ui/separator'
export { Input } from '@/components/ui/input'
export { Textarea } from '@/components/ui/textarea'
export { Label } from '@/components/ui/label'
export { Switch } from '@/components/ui/switch'
export { Slider } from '@/components/ui/slider'
```

#### 6. Update Existing Design Playground for Verification

**File**: `src/components/design/BrutalismPlayground.tsx` (MODIFY - enhance existing component)

**Add section testing installed components**:

```tsx
import {
  Button,
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  Badge,
  Progress,
  Alert,
  AlertTitle,
  AlertDescription,
} from '@/components/neobrutalism'
import { AlertCircle, CheckCircle } from 'lucide-react'

export function BrutalismPlayground() {
  return (
    <div className="space-y-8">
      {/* Existing content... */}

      {/* NEW: Installed Component Tests */}
      <section className="space-y-6">
        <div>
          <h2 className="text-3xl font-bold mb-2">Installed Neobrutalism.dev Components</h2>
          <p className="text-muted-foreground">
            Testing components installed from neobrutalism.dev registry with your token mapping.
          </p>
        </div>

        {/* Button variants */}
        <div className="space-y-4">
          <h3 className="text-xl font-semibold">Buttons (Using Your 6px Shadows)</h3>
          <div className="flex gap-3 flex-wrap">
            <Button>Default</Button>
            <Button variant="reverse">Reverse</Button>
            <Button variant="neutral">Neutral</Button>
            <Button variant="noShadow">No Shadow</Button>
          </div>
        </div>

        {/* Card showcase */}
        <div className="space-y-4">
          <h3 className="text-xl font-semibold">Cards (Using Your OKLCH Colors)</h3>
          <div className="grid grid-cols-2 gap-4">
            <Card className="shadow-shadow">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  Standard Card
                  <Badge>Your Tokens</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  This card uses your <code>--neo-shadow-md</code> (6px) via mapping layer.
                </p>
              </CardContent>
            </Card>

            <Card className="shadow-shadow">
              <CardHeader>
                <CardTitle>Progress Example</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <Progress value={65} />
                <p className="text-xs text-muted-foreground">
                  Progress bar with your radius (<code>--neo-radius-md</code> = 8px)
                </p>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Alert */}
        <div className="space-y-4">
          <h3 className="text-xl font-semibold">Alerts (Bold Borders)</h3>
          <Alert>
            <CheckCircle className="h-4 w-4" />
            <AlertTitle>Mapping Layer Active</AlertTitle>
            <AlertDescription>
              Components use neobrutalism.dev patterns but styled with your tokens from{' '}
              <code className="text-xs bg-muted px-1 py-0.5 rounded">
                neobrutalism.css
              </code>
            </AlertDescription>
          </Alert>
        </div>

        {/* Token Display */}
        <div className="space-y-4">
          <h3 className="text-xl font-semibold">Active Token Values</h3>
          <div className="grid grid-cols-3 gap-4">
            <Card className="shadow-shadow">
              <CardContent className="pt-6 space-y-2">
                <p className="text-xs font-mono text-muted-foreground">--shadow</p>
                <p className="text-sm font-bold">6px 6px 0px 0px</p>
                <p className="text-xs text-muted-foreground">From your --neo-shadow-md</p>
              </CardContent>
            </Card>

            <Card className="shadow-shadow">
              <CardContent className="pt-6 space-y-2">
                <p className="text-xs font-mono text-muted-foreground">--radius-base</p>
                <p className="text-sm font-bold">0.5rem (8px)</p>
                <p className="text-xs text-muted-foreground">From your --neo-radius-md</p>
              </CardContent>
            </Card>

            <Card className="shadow-shadow">
              <CardContent className="pt-6 space-y-2">
                <p className="text-xs font-mono text-muted-foreground">--main</p>
                <div className="w-12 h-12 rounded border-2 border-border" style={{ backgroundColor: 'var(--main)' }} />
                <p className="text-xs text-muted-foreground">From your --neo-primary</p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>
    </div>
  )
}
```

**Note**: This adds tests to your existing BrutalismPlayground component. Navigate to `/design` and check the "Brutalism" tab (already the default).

### Success Criteria

#### Automated Verification:
- [ ] Build succeeds: `npm run build`
- [ ] Type check: `npm run type-check`
- [ ] No console errors when navigating to `/design`

#### Manual Verification:
- [ ] Navigate to `/design` → "Brutalism" tab (default)
- [ ] **Mapping Layer Confirmation**:
  - Alert shows "Mapping Layer Active" message
  - Token display cards show your values (6px shadow, 8px radius)
  - Color swatch shows your OKLCH primary color
- [ ] **Buttons**: YOUR 6px shadows visible (not 4px), hover effects work
- [ ] **Cards**: YOUR 8px rounded corners (not 5px), bold borders
- [ ] **Progress**: Hard border, flat color fill (no gradients), YOUR radius
- [ ] **Alert**: Bold borders, icon positioning correct
- [ ] **Overall**: YOUR design tokens applied via mapping layer

**Visual Checklist (YOUR Tokens, Not Theirs)**:
- ✅ Shadows are 6px offset (YOUR `--neo-shadow-md`)
- ✅ Radius is 8px (YOUR `--neo-radius-md`)
- ✅ Borders are 2-4px (YOUR `--neo-border` variants)
- ✅ Colors match YOUR OKLCH definitions
- ✅ Components render without errors
- ✅ Hover effects use YOUR transition timing

**Validation**: Change a token in `neobrutalism.css` (e.g., `--neo-shadow-md: 8px 8px 0px 0px`), refresh `/design`, verify all components update automatically.

**Implementation Note**: The mapping layer is the key - if components don't reflect your tokens, troubleshoot the mapping in `globals.css` before proceeding to Phase 2.

### Service Restarts:
- [ ] Next.js: `npm run dev` (should auto-reload)

---

## Phase 2: Core Component Replacement

### Overview

Replace existing shadcn/ui components with neobrutalist versions throughout the reader UI. Focus on high-impact components used in RightPanel, ProcessingDock, and reader interface.

**Success**: All major UI components use neobrutalist styling, existing functionality preserved, bold visual transformation visible

### Changes Required

#### 1. Update RightPanel to Use Neobrutalist Components

**File**: `src/components/sidebar/RightPanel.tsx` (MODIFY)

**Replace imports**:
```typescript
// OLD
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'

// NEW
import { Button, Badge, ScrollArea } from '@/components/neobrutalism'
```

**Update panel border styling**:
```tsx
<motion.div
  className="fixed right-0 top-14 bottom-0 border-l-2 border-border z-40 bg-background shadow-[-4px_0_0_0_rgba(0,0,0,1)]"
  // Added: border-l-2 (was border-l), added hard shadow on left
```

**Update tab button styling**:
```tsx
<motion.button
  className={cn(
    'relative p-2 rounded-base flex flex-col items-center justify-center gap-1 border-2 border-transparent transition-colors',
    isActive
      ? 'bg-main text-main-foreground border-border shadow-shadow'
      : 'hover:bg-secondary-background text-muted-foreground hover:text-foreground'
  )}
  whileHover={{ scale: 1.05 }}
  whileTap={{ scale: 0.95 }}
>
```

**Update toggle button**:
```tsx
<Button
  variant="default"
  size="icon"
  className="absolute -left-4 top-8 z-50 rounded-full border-2 border-border bg-background shadow-shadow"
  onClick={() => setCollapsed(!collapsed)}
>
```

#### 2. Update ProcessingDock to Use Neobrutalist Components

**File**: `src/components/layout/ProcessingDock.tsx` (MODIFY)

**Replace imports**:
```typescript
import { Button, Card, Progress, Badge } from '@/components/neobrutalism'
```

**Update main dock card**:
```tsx
<Card className="p-3 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] border-2 border-border">
  {/* Larger shadow for floating effect */}
```

**Update job cards**:
```tsx
<Card className="p-3 shadow-shadow border-2 border-border">
  {/* Bold borders on each job card */}
```

**Update mini badge button**:
```tsx
<Button
  variant="default"
  className="shadow-shadow border-2 border-border"
  onClick={() => setIsExpanded(true)}
>
```

#### 3. Update ConnectionCard to Use Neobrutalist Components

**File**: `src/components/sidebar/ConnectionCard.tsx` (MODIFY)

**Replace imports**:
```typescript
import { Card, CardContent, Badge } from '@/components/neobrutalism'
```

**Update card styling**:
```tsx
<Card className="border-2 border-border shadow-shadow hover:shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] transition-all duration-300">
  <CardContent className="p-3">
    {/* Content */}
  </CardContent>
</Card>
```

**Update strength badge**:
```tsx
<Badge
  variant={strength > 0.7 ? 'default' : 'neutral'}
  className="border-2 border-border"
>
  {Math.round(strength * 100)}%
</Badge>
```

#### 4. Update AdminPanel to Use Neobrutalist Components

**File**: `src/components/admin/AdminPanel.tsx` (MODIFY)

**Replace imports**:
```typescript
import { Tabs, TabsList, TabsTrigger, TabsContent, Button } from '@/components/neobrutalism'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet'
// Note: Keep Sheet from original shadcn (neobrutalism doesn't change overlay behavior much)
```

**Update tabs styling**:
```tsx
<Tabs value={activeTab} onValueChange={setActiveTab}>
  <TabsList className="grid w-full grid-cols-6 border-2 border-border shadow-shadow">
    <TabsTrigger value="scanner">Scanner</TabsTrigger>
    {/* ... other tabs */}
  </TabsList>
  {/* Tab contents */}
</Tabs>
```

#### 5. Update QuickSparkCapture to Use Neobrutalist Components

**File**: `src/components/sparks/QuickSparkCapture.tsx` (MODIFY)

**Replace imports**:
```typescript
import { Card, Button, Textarea, Badge, Input, Label } from '@/components/neobrutalism'
```

**Update panel card**:
```tsx
<Card className="border-2 border-border shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] rounded-base bg-background">
  {/* Bold shadow for floating panel effect */}
```

**Update selection display cards**:
```tsx
<div className="p-2 bg-secondary-background rounded-base border-2 border-border relative group">
  <p className="pr-6 italic">&ldquo;{sel.text}&rdquo;</p>
  <Badge variant="neutral" className="mt-1">Chunk {sel.chunkId}</Badge>
</div>
```

#### 6. Create Neobrutalist Component Migration Checklist

**File**: `thoughts/plans/neobrutalism-migration-checklist.md` (NEW)

Track which components have been migrated:

```markdown
# Neobrutalism Component Migration Checklist

## Phase 2: Core Component Replacement

### High Priority (Reader UI)
- [x] RightPanel - tabs, buttons, badges
- [x] ProcessingDock - cards, progress, badges
- [x] ConnectionCard - cards, badges
- [x] AdminPanel - tabs
- [x] QuickSparkCapture - cards, buttons, inputs

### Medium Priority
- [ ] ConnectionsList - scrollarea, separator
- [ ] AnnotationsList - scrollarea, cards
- [ ] SparksTab - cards, badges
- [ ] TuneTab - slider, labels, cards
- [ ] ChunkQualityPanel - cards, progress, alerts

### Lower Priority
- [ ] DocumentHeader - buttons, badges
- [ ] TopNav - buttons
- [ ] Various dialogs - alerts

## Component Inventory

| Component | Original | Neobrutalist | Status |
|-----------|----------|--------------|--------|
| Button | ✅ | ✅ | Migrated |
| Card | ✅ | ✅ | Migrated |
| Tabs | ✅ | ✅ | Migrated |
| Badge | ✅ | ✅ | Migrated |
| Progress | ✅ | ✅ | Migrated |
| Alert | ✅ | ✅ | Installed |
| Sidebar | ❌ | ✅ | Installed |
| ScrollArea | ✅ | ✅ | Installed |
| Accordion | ✅ | ✅ | Installed |
| Input | ✅ | ✅ | Installed |
| Textarea | ✅ | ✅ | Installed |
| Label | ✅ | ✅ | Installed |
| Switch | ✅ | ✅ | Installed |
| Slider | ✅ | ✅ | Installed |
```

### Success Criteria

#### Automated Verification:
- [ ] Build succeeds: `npm run build`
- [ ] Type check: `npm run type-check`
- [ ] No console errors when navigating reader

#### Manual Verification:
- [ ] Open document in reader (`/read/[id]`)
- [ ] **RightPanel**: Bold borders visible, tabs have hard shadows when active
- [ ] **ConnectionCard**: Each card has bold border and shadow, hover effect works
- [ ] **ProcessingDock** (trigger by starting a job): Large shadow visible, bold borders on job cards
- [ ] **AdminPanel** (Cmd+Shift+A): Tabs have neobrutalist styling
- [ ] **QuickSparkCapture** (Cmd+K): Panel has large shadow, selections have bold borders
- [ ] **Overall**: Consistent neobrutalist aesthetic across all components
- [ ] **Functionality**: All existing features work (no regressions)

**Visual Checklist**:
- ✅ RightPanel has 2px left border + left shadow
- ✅ Active tabs have hard shadows
- ✅ Floating elements (dock, capture panel) have large shadows (8px)
- ✅ All cards have 2px borders
- ✅ Badges have bold borders
- ✅ Progress bars have hard borders and flat fills

**Implementation Note**: Test each component thoroughly before proceeding to Phase 3. Fix any styling or functional regressions.

### Service Restarts:
- [ ] Next.js: Auto-reload should work

---

## Phase 3: LeftPanel with Neobrutalist Sidebar

### Overview

Build LeftPanel using neobrutalist sidebar component with 3 tabs (Outline, Stats, Heatmap). Mirror RightPanel's collapse behavior with bold neobrutalist styling.

**Success**: LeftPanel appears on left, shows document outline, collapses smoothly, uses neobrutalist sidebar component

### Changes Required

#### 1. Create LeftPanel Container Using Neobrutalist Sidebar

**File**: `src/components/reader/LeftPanel/LeftPanel.tsx` (NEW)

```tsx
'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronLeft, ChevronRight, List, BarChart3, Activity } from 'lucide-react'
import { Button, Tabs, TabsList, TabsTrigger, TabsContent, ScrollArea } from '@/components/neobrutalism'
import { OutlineTab } from './OutlineTab'
import { StatsTab } from './StatsTab'
import { HeatmapTab } from './HeatmapTab'
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
      className="fixed left-0 top-14 bottom-0 border-r-2 border-border z-40 bg-background shadow-[4px_0_0_0_rgba(0,0,0,1)]"
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
      {/* Floating toggle button with bold shadow */}
      <Button
        variant="default"
        size="icon"
        className="absolute -right-4 top-8 z-50 rounded-full border-2 border-border shadow-shadow bg-background"
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
            {/* Neobrutalist tabs - 3 columns */}
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as LeftPanelTab)} className="flex-1 flex flex-col">
              <TabsList className="grid w-full grid-cols-3 border-b-2 border-border rounded-none shadow-[0_4px_0_0_rgba(0,0,0,0.1)]">
                {TABS.map(tab => {
                  const Icon = tab.icon
                  return (
                    <TabsTrigger
                      key={tab.id}
                      value={tab.id}
                      className="flex flex-col items-center gap-1 py-3"
                    >
                      <Icon className="h-4 w-4" />
                      <span className="text-xs font-bold">{tab.label}</span>
                    </TabsTrigger>
                  )
                })}
              </TabsList>

              {/* Tab content with ScrollArea */}
              <TabsContent value="outline" className="flex-1 m-0">
                <ScrollArea className="h-full">
                  <OutlineTab
                    documentId={documentId}
                    chunks={chunks}
                    onNavigateToChunk={onNavigateToChunk}
                  />
                </ScrollArea>
              </TabsContent>

              <TabsContent value="stats" className="flex-1 m-0">
                <ScrollArea className="h-full">
                  <StatsTab documentId={documentId} />
                </ScrollArea>
              </TabsContent>

              <TabsContent value="heatmap" className="flex-1 m-0">
                <ScrollArea className="h-full">
                  <HeatmapTab
                    documentId={documentId}
                    chunks={chunks}
                    onNavigateToChunk={onNavigateToChunk}
                  />
                </ScrollArea>
              </TabsContent>
            </Tabs>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
```

#### 2. Create OutlineTab with Neobrutalist Components

**File**: `src/components/reader/LeftPanel/OutlineTab.tsx` (NEW)

```tsx
'use client'

import { useState, useEffect, useMemo } from 'react'
import { Badge, Switch, Label, Button } from '@/components/neobrutalism'
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

  // Fetch connection counts
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
      {/* Toggle for connection indicators with neobrutalist styling */}
      <div className="flex items-center justify-between pb-2 border-b-2 border-border">
        <Label htmlFor="show-connections" className="text-sm font-bold">
          Show Connections
        </Label>
        <Switch
          id="show-connections"
          checked={showConnectionIndicators}
          onCheckedChange={setShowConnectionIndicators}
        />
      </div>

      {/* Outline items with neobrutalist buttons */}
      <div className="space-y-2">
        {outline.map((item, index) => (
          <Button
            key={index}
            variant={item.isCurrentSection ? 'default' : 'noShadow'}
            onClick={() => onNavigateToChunk(item.chunkRange.startChunkId)}
            className={cn(
              'w-full justify-start text-left p-3 h-auto border-2 border-border transition-all',
              item.isCurrentSection
                ? 'shadow-shadow border-l-4 border-l-main'
                : 'hover:shadow-shadow'
            )}
            style={{ paddingLeft: `${12 + item.level * 16}px` }}
          >
            <div className="flex items-center justify-between w-full gap-2">
              <span className={cn(
                'text-sm font-bold flex-1',
                item.isCurrentSection ? 'text-main-foreground' : 'text-foreground'
              )}>
                {item.title}
              </span>

              {showConnectionIndicators && item.connectionCount > 0 && (
                <Badge
                  variant={item.connectionCount > 10 ? 'default' : 'neutral'}
                  className="flex items-center gap-1 text-xs border-2 border-border"
                >
                  <Network className="h-3 w-3" />
                  {item.connectionCount}
                </Badge>
              )}
            </div>
          </Button>
        ))}
      </div>

      {outline.length === 0 && (
        <div className="text-center text-sm text-muted-foreground py-8 border-2 border-dashed border-border rounded-base p-4">
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

#### 4. Create Placeholder Tabs

**File**: `src/components/reader/LeftPanel/StatsTab.tsx` (NEW - Placeholder for Phase 5)

```tsx
'use client'

import { Card, CardContent } from '@/components/neobrutalism'

export function StatsTab({ documentId }: { documentId: string }) {
  return (
    <div className="p-4 space-y-4">
      <div className="text-sm text-muted-foreground font-bold border-2 border-dashed border-border rounded-base p-4 text-center">
        Reading statistics will appear here after Phase 5.
      </div>

      {/* Placeholder sections with neobrutalist styling */}
      <Card className="border-2 border-border shadow-shadow">
        <CardContent className="p-4 space-y-2">
          <h3 className="font-bold text-sm">This Session</h3>
          <div className="text-2xl font-bold text-muted-foreground">-- min</div>
        </CardContent>
      </Card>

      <Card className="border-2 border-border shadow-shadow">
        <CardContent className="p-4 space-y-2">
          <h3 className="font-bold text-sm">This Document</h3>
          <div className="text-2xl font-bold text-muted-foreground">-- min</div>
        </CardContent>
      </Card>

      <Card className="border-2 border-border shadow-shadow">
        <CardContent className="p-4 space-y-2">
          <h3 className="font-bold text-sm">This Week</h3>
          <div className="text-2xl font-bold text-muted-foreground">-- min</div>
        </CardContent>
      </Card>
    </div>
  )
}
```

**File**: `src/components/reader/LeftPanel/HeatmapTab.tsx` (NEW)

```tsx
'use client'

import { ConnectionHeatmap } from '../ConnectionHeatmap'
import { Card, CardContent } from '@/components/neobrutalism'

interface HeatmapTabProps {
  documentId: string
  chunks: any[]
  onNavigateToChunk: (chunkId: string) => void
}

export function HeatmapTab({ documentId, chunks, onNavigateToChunk }: HeatmapTabProps) {
  return (
    <div className="p-4 space-y-4">
      <div className="text-sm text-muted-foreground font-bold">
        Connection density visualization. Darker areas indicate more connections.
      </div>

      <Card className="border-2 border-border shadow-shadow">
        <CardContent className="p-2">
          <ConnectionHeatmap
            documentId={documentId}
            chunks={chunks}
          />
        </CardContent>
      </Card>
    </div>
  )
}
```

#### 5. Integrate LeftPanel into ReaderLayout

**File**: `src/components/reader/ReaderLayout.tsx` (MODIFY)

Add imports:
```tsx
import { LeftPanel } from './LeftPanel/LeftPanel'
```

Add state:
```tsx
const [leftPanelCollapsed, setLeftPanelCollapsed] = useState(false)
```

Sync with view mode:
```tsx
useEffect(() => {
  if (viewMode === 'focus') {
    setLeftPanelCollapsed(true)
  } else if (viewMode === 'explore') {
    setLeftPanelCollapsed(false)
  }
}, [viewMode])
```

Add navigation handler:
```tsx
const handleNavigateToChunk = (chunkId: string) => {
  const scrollToChunk = useReaderStore.getState().scrollToChunk
  scrollToChunk(chunkId)
}
```

Add LeftPanel to JSX (before DocumentViewer):
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

#### 6. Update ReaderStore for Scroll-to-Chunk

**File**: `src/stores/reader-store.ts` (MODIFY)

Add state:
```tsx
scrollToChunkId: null as string | null,
```

Add action:
```tsx
scrollToChunk: (chunkId: string) => {
  set({ scrollToChunkId: chunkId })
  // Clear after 100ms (VirtualizedReader will handle scroll)
  setTimeout(() => set({ scrollToChunkId: null }), 100)
},
```

### Success Criteria

#### Automated Verification:
- [ ] Build succeeds: `npm run build`
- [ ] Type check: `npm run type-check`
- [ ] No console errors on reader page load

#### Manual Verification:
- [ ] Open document in reader
- [ ] **LeftPanel visible**: Panel appears on left side (opposite RightPanel)
- [ ] **Bold styling**: Panel has 2px right border + right shadow
- [ ] **Tabs**: 3 tabs visible (Outline, Stats, Heatmap) with neobrutalist styling
- [ ] **Active tab**: Active tab has bold shadow, inactive tabs subtle
- [ ] **Collapse/Expand**: Toggle button works, smooth spring animation (48px ↔ 320px)
- [ ] **Outline Tab**:
  - Shows document heading hierarchy
  - Headings indented by level
  - Connection indicators toggle on/off
  - Click section scrolls to that chunk
  - Current section highlighted with bold left border + shadow
  - Bold borders on all section buttons
- [ ] **Stats Tab**: Shows placeholder message and empty cards
- [ ] **Heatmap Tab**: Shows existing ConnectionHeatmap component in card
- [ ] **View modes work**: Explore (expanded), Focus (hidden), Study (expanded)
- [ ] **No regressions**: RightPanel still works, document scrolling unaffected

**Visual Checklist**:
- ✅ LeftPanel has 2px right border + hard shadow
- ✅ Toggle button has bold border + shadow
- ✅ Tabs have neobrutalist styling (bold when active)
- ✅ Outline buttons have 2px borders
- ✅ Current section has bold left border (4px) + shadow
- ✅ Connection badges have bold borders
- ✅ Placeholder cards have borders + shadows

**Implementation Note**: Pause after manual verification passes before proceeding to Phase 4.

### Service Restarts:
- [ ] Next.js: Auto-reload should work

---

## Phase 4: Session Tracking with Threshold Trigger

> **📄 REFERENCE**: Follow original plan `2025-10-22_reader-neobrutalism-implementation.md`
> **📍 START**: Line 922 - Phase 3: Session Tracking with Threshold Trigger
> **📍 END**: Line 1489
> **⚠️ NO MODIFICATIONS NEEDED**: Backend tracking doesn't require neobrutalist styling

### Overview

Add silent background session tracking: time spent reading, position, engagement (sparks/annotations created). Starts only after threshold (30 seconds OR 10% scroll). Updates every 30 seconds. Ends on navigation away or 5min idle.

**Success**: Session automatically starts after threshold, updates silently, data appears in `reading_sessions` table

### Implementation Instructions

**Follow these sections from the original plan verbatim:**

1. **Database Migration** (lines 933-993)
   - File: `supabase/migrations/063_reading_sessions.sql`
   - Creates `reading_sessions` table with threshold tracking
   - Adds indexes for common queries
   - Updates `documents` table with `last_read_at` fields

2. **Server Actions** (lines 995-1295)
   - File: `src/app/actions/reading-sessions.ts`
   - `createReadingSession()` - Start tracking after threshold
   - `updateReadingSession()` - Update every 30 seconds
   - `endReadingSession()` - End on navigation/idle
   - `getReadingStats()` - Document statistics
   - `getWeeklyStats()` - Past 7 days aggregate

3. **Session Tracking Hook** (lines 1298-1438)
   - File: `src/hooks/useSessionTracking.ts`
   - Threshold detection (30s OR 10% scroll)
   - Automatic updates every 30 seconds
   - Cleanup on unmount/blur/beforeunload

4. **ReaderLayout Integration** (lines 1442-1466)
   - File: `src/components/reader/ReaderLayout.tsx`
   - Add `useSessionTracking` hook
   - Pass `currentSessionMinutes` to LeftPanel

### Success Criteria

**Copy from original plan lines 1468-1488** - No changes needed for backend tracking.

---

## Phase 5: StatsTab with Neobrutalist Cards

> **📄 REFERENCE**: Follow original plan `2025-10-22_reader-neobrutalism-implementation.md`
> **📍 START**: Line 1492 - Phase 4: StatsTab Implementation
> **📍 END**: Line 1719
> **✏️ MODIFICATIONS**: Use neobrutalist components instead of standard shadcn

### Overview

Populate StatsTab with real reading statistics from `reading_sessions` table. Show time spent (this session, this document, this week) and engagement metrics using neobrutalist cards and progress bars.

**Success**: Open StatsTab → See live reading time in bold neobrutalist cards, document total, weekly aggregate, engagement counts

### Implementation Instructions

**Follow the original plan with these component replacements:**

1. **StatsTab Component** (lines 1504-1666)
   - File: `src/components/reader/LeftPanel/StatsTab.tsx`
   - **REPLACE** imports:
     ```tsx
     // OLD (original plan)
     import { Card, CardContent } from '@/components/ui/card'

     // NEW (use neobrutalist versions)
     import { Card, CardContent, Progress, Badge } from '@/components/neobrutalism'
     ```
   - **ADD** neobrutalist styling classes:
     - Cards: `border-2 border-border shadow-shadow`
     - Current session card: `shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]` (emphasis)
     - Progress: Uses your `--neo-shadow-md` and `--neo-radius-md`
     - Badges: `border-2 border-border`
   - Follow rest of implementation as written in original plan

2. **LeftPanel Props Update** (lines 1674-1697)
   - File: `src/components/reader/LeftPanel/LeftPanel.tsx`
   - Follow original plan exactly - no styling changes needed

### Key Styling Differences from Original Plan

| Element | Original Plan | Neobrutalist Version |
|---------|--------------|---------------------|
| Stat cards | `neo-border p-4` | `border-2 border-border shadow-shadow p-4` |
| Current session | `neo-shadow` | `shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]` (larger) |
| Progress bar | `neo-border` | Hard border with `border-border` class |
| Typography | `font-bold` | `font-bold` (same) |

### Success Criteria

**Copy from original plan lines 1699-1719** with this addition:
- [ ] **Neobrutalist styling**: All cards have YOUR 6px shadows (or 8px for emphasis), YOUR 8px radius, bold borders

---

## Phase 6: BottomPanel with "Where Was I?" AI Feature

> **📄 REFERENCE**: Follow original plan `2025-10-22_reader-neobrutalism-implementation.md`
> **📍 START**: Line 1722 - Phase 5: BottomPanel with "Where Was I?" AI Feature
> **📍 END**: Line 2310
> **✏️ MODIFICATIONS**: Use neobrutalist components for UI, backend unchanged

### Overview

Add BottomPanel with persistent compact bar (56px) using neobrutalist card with large shadow. "Where was I?" button generates AI-powered context summary displayed in neobrutalist alert. Caches section summaries for speed, anti-spoiler design.

**Success**: Click "Where was I?" → 5-10 second generation → Rich AI summary appears in bold neobrutalist alert

### Implementation Instructions

**Follow the original plan with these component replacements:**

1. **Database Migration** (lines 1734-1762)
   - File: `supabase/migrations/064_section_summaries.sql`
   - Follow exactly as written - no changes needed

2. **Server Action - Generate Summary** (lines 1766-2171)
   - File: `src/app/actions/where-was-i.ts`
   - Follow exactly as written - backend logic unchanged
   - AI generation uses Gemini as specified

3. **BottomPanel Component** (original plan lines 2173+)
   - **REPLACE** imports:
     ```tsx
     // OLD
     import { Card, Button, Alert } from '@/components/ui/...'

     // NEW
     import { Card, CardContent, Button, Alert, AlertTitle, AlertDescription, Badge } from '@/components/neobrutalism'
     ```
   - **ADD** neobrutalist styling:
     - BottomPanel card: `border-2 border-border shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]` (floating effect)
     - Alert for summary: `border-2 border-border shadow-shadow`
     - "Where was I?" button: Default neobrutalist button with shadow
     - Section badges: `border-2 border-border`

4. **ReaderLayout Integration**
   - Follow original plan for layout integration
   - BottomPanel appears above ProcessingDock (z-index coordination)

### Key Styling Differences from Original Plan

| Element | Original Plan | Neobrutalist Version |
|---------|--------------|---------------------|
| BottomPanel card | Standard card | `shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]` (large floating shadow) |
| Summary alert | Standard alert | `border-2 border-border shadow-shadow` |
| Section badges | Standard badge | `border-2 border-border` (bold) |
| Button | Standard button | Neobrutalist button (YOUR 6px shadow) |

### Success Criteria

**Copy from original plan** with this addition:
- [ ] **Neobrutalist styling**: BottomPanel has large shadow (8px), alert has bold borders, all components use YOUR tokens

---

## Phase 7: Global Neobrutalist Restyling

> **📄 REFERENCE**: Follow original plan `2025-10-22_reader-neobrutalism-implementation.md`
> **📍 START**: Line 2313 - Phase 6: Neobrutalist Restyling of Existing Components
> **📍 END**: End of document
> **✏️ MODIFICATIONS**: Apply YOUR tokens (not theirs) throughout

### Overview

Apply neobrutalist styling to all remaining reader components not yet covered. Focus on DocumentHeader, ConnectionCard, existing RightPanel tabs, and any remaining UI elements.

**Success**: Entire reader interface has consistent neobrutalist aesthetic with bold borders, hard shadows, and flat colors using YOUR design tokens

### Implementation Instructions

**Follow Phase 6 from the original plan** with these principles:

1. **Component-by-Component Restyling**
   - Use the component list from original plan as a checklist
   - For each component:
     - Replace standard shadcn imports with neobrutalist versions
     - Add `border-2 border-border shadow-shadow` classes
     - Use YOUR tokens via mapping layer (automatic)

2. **Priority Components** (from original plan):
   - DocumentHeader
   - ConnectionCard (if not done in Phase 2)
   - ConnectionsList
   - AnnotationsList
   - ChunkQualityPanel
   - TuneTab components
   - Any remaining modals/dialogs

3. **Styling Pattern to Apply**:
   ```tsx
   // Containers
   className="border-2 border-border shadow-shadow rounded-base p-4"

   // Interactive elements
   className="border-2 border-border shadow-shadow hover:shadow-sm transition-all"

   // Emphasis elements (current state, selected)
   className="border-2 border-border shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] border-l-4 border-l-main"
   ```

4. **Verification Checklist**:
   - [ ] All components use neobrutalist imports
   - [ ] All borders are 2-4px (YOUR tokens)
   - [ ] All shadows are hard (YOUR 6px standard, 8px for emphasis)
   - [ ] All rounded corners use YOUR 8px radius
   - [ ] No soft shadows remain
   - [ ] No gradients remain

### Success Criteria

**Global Visual Consistency**:
- [ ] Every reader component has bold borders
- [ ] Every shadow is hard (no blur)
- [ ] Every color is flat (no gradients)
- [ ] Every border/shadow/radius uses YOUR tokens from `neobrutalism.css`
- [ ] Changing a token in `neobrutalism.css` updates ALL components

### Final Validation

1. Open document in reader
2. Navigate through all tabs (LeftPanel: 3 tabs, RightPanel: 7 tabs)
3. Verify consistent neobrutalist aesthetic
4. Modify `--neo-shadow-md` from 6px → 8px in `neobrutalism.css`
5. Refresh → verify ALL components update
6. Revert to 6px → verify ALL components revert

**Success**: Single source of truth works - all components reflect YOUR token changes instantly.

---

## Testing Strategy

### Visual Regression Testing

Create visual reference for neobrutalist styling:

1. **Take screenshots** of each component at `/test-neobrutalism`
2. **Document expected visual characteristics**:
   - Border thickness: 2px standard, 4px for depth
   - Shadow: Hard 4-6px offset, no blur
   - Colors: Flat, high contrast
   - Rounded corners: 8px (moderate)

### Manual Testing Checklist

**Before each phase completion**:
- [ ] Visual inspection of new components
- [ ] Verify bold borders (2-4px)
- [ ] Verify hard shadows (no blur)
- [ ] Verify flat colors (no gradients)
- [ ] Test hover effects (quick, obvious)
- [ ] Test functionality (no regressions)

---

## Performance Considerations

**Component Source Ownership**:
- Installing as source files increases bundle size slightly vs npm packages
- Trade-off: Full customization capability vs smaller bundle
- Acceptable for personal tool (not multi-tenant SaaS)

**Hard Shadows Performance**:
- CSS hard shadows (no blur) are more performant than soft shadows
- Neobrutalism shadows don't trigger expensive blur calculations

---

## Migration Notes

**Gradual Migration Strategy**:
1. Install neobrutalist components (Phase 1)
2. Replace high-visibility components first (Phase 2)
3. Build new features with neobrutalist components (Phases 3-6)
4. Update remaining components (Phase 7)

**Rollback Strategy**:
- Keep original shadcn components in git history
- Can revert individual components if needed
- Components are source files, easy to modify/revert

---

## References

- **Neobrutalism.dev**: https://www.neobrutalism.dev/
- **Component Registry**: https://v3.neobrutalism.dev/r/
- **shadcn Registry Docs**: https://ui.shadcn.com/docs/registry
- **Original Plan**: `thoughts/plans/2025-10-22_reader-neobrutalism-implementation.md`
- **shadcn MCP Integration**: `thoughts/ideas/2025-10-19_shadcn-registry-mcp-integration.md`
- **Existing Patterns**: Codebase research from agents
- **Architecture**: `docs/ARCHITECTURE.md`
- **UI Patterns**: `docs/UI_PATTERNS.md`
