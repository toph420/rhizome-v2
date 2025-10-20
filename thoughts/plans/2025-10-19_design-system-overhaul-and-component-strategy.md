# Design System Overhaul & Component Library Integration Strategy

**Date**: 2025-10-19
**Status**: Comprehensive Plan
**Effort**: 54-79 hours over 2-3 months
**Priority**: High - Foundation for future customization

---

## Executive Summary

Rhizome V2 has **excellent architectural foundations** (React 19, Server Components, shadcn/ui, Tailwind v4 with OKLCH) but suffers from **design system inconsistencies** that prevent easy theming and create maintenance burden.

### Current Problems

1. **Color System Fragmentation**: 4 different approaches (OKLCH tokens, RGBA hardcoded, Hex values, Tailwind direct classes)
2. **Annotation System Bloat**: 298 lines of duplicate CSS preventing easy theming
3. **Experimental Theme Pollution**: ~500 lines of unused CSS in production bundle
4. **Component Pattern Inconsistencies**: 8 categories of styling problems across custom components
5. **Missing Design System Components**: No flashcard/study interface built yet

### Solution Approach

**Incremental 4-Phase Migration** + **Component Library Integration** over 2-3 months:
- Phase 1: Establish complete OKLCH token system (4-6 hours)
- Phase 2: Migrate high-impact components, eliminate duplication (8-12 hours)
- Phase 3: Code-split experimental themes (2-4 hours)
- Phase 4: Complete system with documentation (6-8 hours)
- Flashcard System: Integrate external components (12-16 hours)

### Expected Outcomes

**Design System**:
- ✅ Complete OKLCH token system (50+ tokens)
- ✅ Reduce annotation CSS from 298 lines → 16 lines
- ✅ Remove 500 lines from production bundle
- ✅ Single source of truth for all colors
- ✅ Easy theme customization foundation
- ✅ Professional documentation

**Component Libraries**:
- ✅ Integrate SmoothUI (flashcard UI, animations) - FREE
- ✅ Integrate Kibo UI (Kanban, rich editor) - FREE
- ✅ Integrate Magic UI (progress animations) - FREE
- ✅ Complete flashcard/study system
- ✅ Enhanced Quick Capture (⌘K)

---

## Part 1: Design System Cleanup (4 Phases)

### Phase 1: Establish Complete Token System (4-6 hours)

**Goal**: Create single source of truth for all design tokens in OKLCH color space

#### File Structure

Create new token organization:
```
src/styles/tokens/
├── colors.css       # All color tokens (OKLCH)
├── spacing.css      # Border radius, spacing scale
├── typography.css   # Font family, size scale
├── shadows.css      # Elevation system
└── z-index.css      # Layer system
```

#### Step 1.1: Semantic Status Colors (colors.css)

Add missing status colors:
```css
/* Status colors - OKLCH for perceptual uniformity */
--success: oklch(0.65 0.15 145);
--success-foreground: oklch(0.98 0 0);
--warning: oklch(0.75 0.15 85);
--warning-foreground: oklch(0.2 0 0);
--info: oklch(0.60 0.20 240);
--info-foreground: oklch(0.98 0 0);
```

#### Step 1.2: Annotation Color Tokens (colors.css)

Replace 298 lines of RGBA with 16 token definitions:
```css
/* Annotation colors - 8 colors for highlighting */
--annotation-yellow: oklch(0.90 0.12 100);
--annotation-yellow-border: oklch(0.75 0.15 100);
--annotation-green: oklch(0.88 0.15 145);
--annotation-green-border: oklch(0.65 0.20 145);
--annotation-blue: oklch(0.85 0.15 240);
--annotation-blue-border: oklch(0.60 0.20 240);
--annotation-red: oklch(0.85 0.20 25);
--annotation-red-border: oklch(0.65 0.25 25);
--annotation-purple: oklch(0.80 0.18 300);
--annotation-purple-border: oklch(0.60 0.22 300);
--annotation-orange: oklch(0.85 0.18 50);
--annotation-orange-border: oklch(0.65 0.22 50);
--annotation-pink: oklch(0.85 0.18 350);
--annotation-pink-border: oklch(0.65 0.22 350);
--annotation-gray: oklch(0.85 0.02 0);
--annotation-gray-border: oklch(0.60 0.02 0);
```

#### Step 1.3: Surface Tokens (colors.css)

For cards, panels, overlays:
```css
/* Surface variants */
--surface: var(--background);
--surface-raised: oklch(from var(--background) calc(l + 0.02) c h);
--surface-overlay: oklch(from var(--background) calc(l + 0.04) c h);
--surface-sunken: oklch(from var(--background) calc(l - 0.02) c h);
```

#### Step 1.4: Shadow System (shadows.css)

Progressive elevation:
```css
/* Elevation shadows */
--shadow-xs: 0 1px 2px 0 rgb(0 0 0 / 0.05);
--shadow-sm: 0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1);
--shadow-md: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1);
--shadow-lg: 0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1);
--shadow-xl: 0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1);
--shadow-2xl: 0 25px 50px -12px rgb(0 0 0 / 0.25);
```

#### Step 1.5: Z-Index Scale (z-index.css)

Document existing usage:
```css
/* Z-index layering system */
--z-base: 0;
--z-heatmap: 20;          /* ConnectionHeatmap overlay */
--z-dock: 40;             /* ProcessingDock bottom-right */
--z-overlay: 50;          /* Panels, tooltips, QuickSparkCapture */
--z-modal: 60;            /* Future: full-screen modals */
--z-toast: 70;            /* Future: notifications */
```

#### Step 1.6: Update globals.css

Import all token files:
```css
/* In src/app/globals.css */
@import "../styles/tokens/colors.css";
@import "../styles/tokens/spacing.css";
@import "../styles/tokens/typography.css";
@import "../styles/tokens/shadows.css";
@import "../styles/tokens/z-index.css";
```

#### Validation Checklist

- [ ] Existing components still work (backward compatible)
- [ ] Dark mode functions correctly
- [ ] No visual regressions
- [ ] `npm run type-check` passes

**DELIVERABLE**: Complete token system, organized in logical files, backward compatible.

---

### Phase 2: Migrate High-Impact Components (8-12 hours)

**Goal**: Eliminate color duplication, create single source of truth

#### Priority 1: Annotation Color System (HIGHEST ROI)

**Problem**: 298 lines of duplicate CSS, 4 different color definitions for same colors.

##### Step 2.1: Refactor globals.css Annotation Styles

**Current (298 lines)**:
```css
/* Lines 129-298: Massive duplication */
[data-annotation-color="yellow"] {
  background: rgba(254, 240, 138, 0.4);
  border-bottom: 2px solid rgba(234, 179, 8, 0.5);
  /* ... multiple states ... */
}
/* Repeat for 8 colors × light mode = 72 lines */
.dark [data-annotation-color="yellow"] { /* ... */ }
/* Repeat for 8 colors × dark mode = 72 lines */
/* Plus hover, selection, active states = 154+ more lines */
```

**New (16 lines using tokens)**:
```css
/* 8 colors × 2 lines = 16 lines total */
[data-annotation-color="yellow"] {
  background-color: hsl(var(--annotation-yellow) / 0.4);
  border-bottom: 2px solid hsl(var(--annotation-yellow-border));
}
[data-annotation-color="green"] {
  background-color: hsl(var(--annotation-green) / 0.4);
  border-bottom: 2px solid hsl(var(--annotation-green-border));
}
/* Repeat for remaining 6 colors */

/* Dark mode automatically handled by token definitions in dark mode */
/* Hover/selection states use same tokens with opacity changes */
```

**Impact**: **Reduce from 298 lines → 16 lines (94% reduction!)**

##### Step 2.2: Update QuickSparkCapture.tsx

**File**: `src/components/reader/QuickSparkCapture.tsx` (lines 428-436)

**Current**: Hardcoded hex color map
```typescript
const colorMap: Record<string, string> = {
  yellow: '#fbbf24',
  blue: '#3b82f6',
  green: '#10b981',
  red: '#ef4444',
  purple: '#a855f7',
  orange: '#f97316',
  pink: '#ec4899',
}
```

**New**: Token-based references
```typescript
const ANNOTATION_COLORS = [
  { name: 'yellow', tokenBg: 'annotation-yellow', tokenBorder: 'annotation-yellow-border' },
  { name: 'green', tokenBg: 'annotation-green', tokenBorder: 'annotation-green-border' },
  { name: 'blue', tokenBg: 'annotation-blue', tokenBorder: 'annotation-blue-border' },
  { name: 'red', tokenBg: 'annotation-red', tokenBorder: 'annotation-red-border' },
  { name: 'purple', tokenBg: 'annotation-purple', tokenBorder: 'annotation-purple-border' },
  { name: 'orange', tokenBg: 'annotation-orange', tokenBorder: 'annotation-orange-border' },
  { name: 'pink', tokenBg: 'annotation-pink', tokenBorder: 'annotation-pink-border' },
  { name: 'gray', tokenBg: 'annotation-gray', tokenBorder: 'annotation-gray-border' },
] as const

// In component render:
<button
  style={{
    backgroundColor: `hsl(var(--${color.tokenBg}) / 0.4)`,
    borderColor: `hsl(var(--${color.tokenBorder}))`
  }}
>
```

##### Step 2.3: Update AnnotationsList.tsx

**File**: `src/components/sidebar/AnnotationsList.tsx` (lines 330-338, 241-250)

**Current**: Two separate color maps (inline styles + Tailwind border classes)

**New**: Tailwind arbitrary values with tokens
```tsx
// Remove colorMap variable entirely

// Color picker buttons:
<button
  className={cn(
    "w-8 h-8 rounded-full border-2 transition-all",
    `bg-[hsl(var(--annotation-${c})_/_0.4)]`,
    `border-[hsl(var(--annotation-${c}-border))]`,
    `hover:bg-[hsl(var(--annotation-${c})_/_0.6)]`
  )}
/>

// Annotation card border:
<div
  className={cn(
    "border-l-4",
    `border-l-[hsl(var(--annotation-${color}-border))]`
  )}
/>
```

##### Step 2.4: Update QuickCapturePanel.tsx

**File**: `src/components/reader/QuickCapturePanel.tsx` (lines 38-44)

**Current**: Tailwind classes (bg-yellow-200)

**New**: Token-based arbitrary values
```tsx
const COLOR_OPTIONS = [
  {
    key: 'y',
    color: 'yellow',
    label: 'Yellow',
    bgClass: 'bg-[hsl(var(--annotation-yellow)_/_0.4)] hover:bg-[hsl(var(--annotation-yellow)_/_0.6)] dark:bg-[hsl(var(--annotation-yellow)_/_0.3)]'
  },
  // ... consistent pattern for all colors
]
```

#### Priority 2: Chunker Strategy Colors

##### Step 2.5: Refactor Chunker Badge Colors

**File**: `src/types/chunker.ts` (lines 75-86)

**Current**: Hardcoded Tailwind classes
```typescript
const getBadgeClasses = (strategy: ChunkingStrategy) => {
  const classMap: Record<ChunkingStrategy, string> = {
    hybrid: 'bg-gray-100 text-gray-700 border-gray-300',
    recursive: 'bg-green-100 text-green-700 border-green-300',
    semantic: 'bg-blue-100 text-blue-700 border-blue-300',
    // ...
  }
  return classMap[strategy]
}
```

**New**: CVA variants using semantic tokens

Create new file: `src/components/ui/chunker-badge.tsx`
```typescript
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const chunkerBadgeVariants = cva(
  "inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold transition-colors",
  {
    variants: {
      strategy: {
        token: "bg-muted/50 text-foreground border-border",
        sentence: "bg-info/10 text-info border-info/20",
        recursive: "bg-success/10 text-success border-success/20",
        semantic: "bg-info/10 text-info border-info/20",
        late: "bg-primary/10 text-primary border-primary/20",
        code: "bg-accent/10 text-accent border-accent/20",
        neural: "bg-warning/10 text-warning border-warning/20",
        slumber: "bg-primary/10 text-primary border-primary/20",
        table: "bg-muted/50 text-foreground border-border",
      }
    },
    defaultVariants: {
      strategy: "recursive"
    }
  }
)

export interface ChunkerBadgeProps extends VariantProps<typeof chunkerBadgeVariants> {
  strategy: ChunkingStrategy
  className?: string
}

export function ChunkerBadge({ strategy, className }: ChunkerBadgeProps) {
  return (
    <div className={cn(chunkerBadgeVariants({ strategy }), className)}>
      {strategyLabels[strategy]}
    </div>
  )
}
```

##### Step 2.6: Update Components Using Chunker Colors

Search and replace:
```bash
# Find all usage
grep -r "getBadgeClasses\|chunker.*class" src/

# Replace with ChunkerBadge component
<ChunkerBadge strategy={chunkingStrategy} />
```

#### Priority 3: Component Pattern Standardization

##### Step 2.7: Standardize className Construction

Create pattern guide: `docs/COMPONENT_PATTERNS.md`
```markdown
# className Construction Pattern

Always use `cn()` utility from lib/utils:

```tsx
import { cn } from "@/lib/utils"

// ✅ Recommended pattern
<div className={cn(
  "base classes",
  condition && "conditional classes",
  anotherCondition ? "true classes" : "false classes",
  propClassName
)} />

// ❌ Avoid template literals
<div className={`base ${condition ? 'a' : 'b'} ${propClassName}`} />
```
```

##### Step 2.8: Audit and Refactor Components

Find components using incorrect patterns:
```bash
# Find template literal classNames
grep -r "className={\`" src/components/ --exclude-dir=ui

# Refactor each to use cn() utility
```

#### Validation Checklist

- [ ] `npm run type-check` passes
- [ ] Visual regression test: Check annotation colors in document reader
- [ ] Test dark mode: Verify all colors work correctly
- [ ] Test hover states: Ensure interactive elements respond
- [ ] Test chunker badges: Verify all strategies display correctly

**DELIVERABLE**: 280+ lines of CSS removed, single source of truth for colors, consistent component patterns.

---

### Phase 3: Experimental Theme Code-Splitting (2-4 hours)

**Goal**: Keep experimental themes but only load when needed, remove from production bundle

**Problem**: 3 experimental theme files (~500 lines) loaded for all users but only used in /design page.

#### Step 3.1: Remove Experimental Theme Imports

**File**: `src/app/globals.css`

**Remove these lines**:
```css
@import "./styles/brutalist.css"
@import "./styles/tactical.css"
@import "./styles/experimental.css"
```

#### Step 3.2: Create Experimental Theme Loader

**File**: `src/app/design/ExperimentalThemeLoader.tsx`

```typescript
'use client'

import { useEffect } from 'react'

export function ExperimentalThemeLoader() {
  useEffect(() => {
    // Dynamically load experimental CSS only on this page
    const themes = [
      '/styles/brutalist.css',
      '/styles/tactical.css',
      '/styles/experimental.css'
    ]

    const links = themes.map(href => {
      const link = document.createElement('link')
      link.rel = 'stylesheet'
      link.href = href
      document.head.appendChild(link)
      return link
    })

    // Cleanup on unmount
    return () => {
      links.forEach(link => document.head.removeChild(link))
    }
  }, [])

  return null
}
```

#### Step 3.3: Add Loader to Design Page Layout

**File**: `src/app/design/layout.tsx`

```typescript
import { ExperimentalThemeLoader } from './ExperimentalThemeLoader'

export default function DesignLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <>
      <ExperimentalThemeLoader />
      {children}
    </>
  )
}
```

#### Step 3.4: Move CSS Files to Public Directory

```bash
# Move experimental styles to public for dynamic loading
mkdir -p public/styles
mv src/styles/brutalist.css public/styles/
mv src/styles/tactical.css public/styles/
mv src/styles/experimental.css public/styles/
```

#### Step 3.5: Test Experimental Themes

- [ ] Navigate to /design page
- [ ] Verify experimental theme styles load
- [ ] Test all 3 themes (brutalist, tactical, experimental)
- [ ] Navigate to main app (/)
- [ ] Verify experimental styles NOT loaded

#### Validation Checklist

- [ ] Production bundle size decreased (check with `npm run build`)
- [ ] /design page shows experimental themes correctly
- [ ] Main app doesn't load experimental CSS
- [ ] No console errors when loading/unloading themes

**DELIVERABLE**: -500 lines from production bundle, experimental themes still available for development.

---

### Phase 4: Complete the System (6-8 hours)

**Goal**: Standardize remaining patterns, add missing features, create comprehensive documentation

#### Part A: Responsive Variants (2-3 hours)

##### Step 4.1: Audit Fixed-Width Components

```bash
# Find all fixed widths
grep -r "w-\[400px\]\|w-96\|w-80\|w-\[" src/components/ --exclude-dir=ui
```

##### Step 4.2: Add Responsive Variants to QuickSparkCapture

**File**: `src/components/reader/QuickSparkCapture.tsx` (line 357)

**Current**: `fixed left-0 top-20 bottom-20 z-50 w-[400px]`

**New**: Responsive with mobile support
```tsx
className={cn(
  "fixed left-0 z-50",
  "top-20 bottom-20",
  // Mobile: full width, Tablet: 384px, Desktop: 400px
  "w-full sm:w-96 lg:w-[400px]",
  "max-w-full" // Prevent overflow
)}
```

##### Step 4.3: Add Responsive Variants to ProcessingDock

**File**: `src/components/layout/ProcessingDock.tsx` (line 215)

**Current**: `fixed left-4 bottom-4 w-96`

**New**: Mobile-friendly
```tsx
className={cn(
  "fixed z-40 space-y-2",
  // Mobile: full width with margins
  "left-2 bottom-2 right-2",
  // Tablet+: left-aligned, fixed width
  "sm:left-4 sm:bottom-4 sm:right-auto sm:w-96"
)}
```

#### Part B: Pattern Standardization (2-3 hours)

##### Step 4.4: Create Animation Pattern Guide

**File**: `docs/COMPONENT_PATTERNS.md` (append to existing file)

```markdown
## Animation Patterns

### When to use Framer Motion
- Micro-interactions on icons/buttons (scale, rotate)
- Panel slide-in/slide-out (AnimatePresence)
- Complex multi-step animations
- Physics-based animations (spring)

**Examples**: ConnectionHeatmap, ChunkMetadataIcon, QuickSparkCapture

```tsx
// Framer Motion for micro-interactions
<motion.button
  whileHover={{ scale: 1.2 }}
  whileTap={{ scale: 0.95 }}
  transition={{ type: 'spring', stiffness: 400, damping: 25 }}
>
```

### When to use Tailwind Transitions
- Hover states on cards/lists
- Background color changes
- Border color changes
- Simple opacity/transform changes

**Examples**: AnnotationsList, ConnectionCard

```tsx
// Tailwind for simple hovers
<button className="hover:bg-muted/50 transition-all">
```
```

##### Step 4.5: Standardize Progress Bar Heights

**Decision**: Use `h-2` consistently (better visibility, still compact)

**Files to Update**:
- `src/components/sidebar/ConnectionCard.tsx` (line 211): Keep h-2 ✓
- `src/components/admin/JobList.tsx` (line 441): Keep h-2 ✓
- `src/components/layout/ProcessingDock.tsx` (line 371): Change `h-1.5` → `h-2`

#### Part C: Accessibility (1-2 hours)

##### Step 4.6: Add Missing ARIA Labels

**File**: `src/components/reader/ConnectionHeatmap.tsx` (line 127)
```tsx
<motion.button
  aria-label={`Jump to connection cluster ${i + 1} with ${point.connections.length} connections`}
  role="button"
  // ... existing props
>
```

**File**: `src/components/reader/ChunkMetadataIcon.tsx` (line 72)
```tsx
<motion.button
  aria-label={`View metadata for chunk ${chunkIndex}`}
  // ... existing props
>
```

##### Step 4.7: Audit and Add Focus States

```bash
# Find components with hover but missing focus-visible
grep -r "hover:" src/components/ | grep -v "focus-visible:"
```

Add focus states to interactive elements:
```tsx
className={cn(
  "hover:bg-muted/50 transition-all",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
)}
```

#### Part D: Documentation (1-2 hours)

##### Step 4.8: Create Design System Documentation

**File**: `docs/DESIGN_SYSTEM.md`

```markdown
# Rhizome V2 Design System

## Overview

Rhizome V2 uses **OKLCH color space** for perceptually uniform colors with **Tailwind CSS v4** for styling.

## Color System

### Semantic Colors

All colors defined in OKLCH for accessibility and consistency:

```css
/* Status Colors */
--success: oklch(0.65 0.15 145)  /* Green for positive actions */
--warning: oklch(0.75 0.15 85)   /* Yellow for caution */
--info: oklch(0.60 0.20 240)     /* Blue for information */
--destructive: oklch(0.577 0.245 27.325)  /* Red for destructive actions */
```

### Annotation Colors

8 highlight colors for document annotations:

```css
--annotation-yellow: oklch(0.90 0.12 100)
--annotation-green: oklch(0.88 0.15 145)
--annotation-blue: oklch(0.85 0.15 240)
--annotation-red: oklch(0.85 0.20 25)
--annotation-purple: oklch(0.80 0.18 300)
--annotation-orange: oklch(0.85 0.18 50)
--annotation-pink: oklch(0.85 0.18 350)
--annotation-gray: oklch(0.85 0.02 0)
```

**Usage**:
```tsx
// In component
<div
  className="bg-[hsl(var(--annotation-yellow)_/_0.4)]"
  style={{ borderColor: `hsl(var(--annotation-yellow-border))` }}
/>
```

## Spacing System

### Border Radius
```css
--radius: 0.625rem (10px)
--radius-sm: 6px
--radius-md: 8px
--radius-lg: 10px
--radius-xl: 14px
```

### Shadows
```css
--shadow-sm: Subtle shadow for cards
--shadow-md: Standard elevation
--shadow-lg: Prominent panels
--shadow-xl: Floating UI elements
```

## Z-Index Scale

Consistent layering for overlays:

```css
--z-base: 0          /* Default layer */
--z-heatmap: 20      /* ConnectionHeatmap */
--z-dock: 40         /* ProcessingDock */
--z-overlay: 50      /* Panels, tooltips */
--z-modal: 60        /* Full-screen modals */
--z-toast: 70        /* Notifications */
```

## Typography

### Fonts
- Sans: Geist Sans (primary)
- Mono: Geist Mono (code)

### Usage
```tsx
<p className="text-sm font-sans">Body text</p>
<code className="font-mono">Code snippet</code>
```

## Component Patterns

### className Construction

Always use `cn()` utility:
```tsx
import { cn } from "@/lib/utils"

<div className={cn(
  "base classes",
  condition && "conditional classes",
  propClassName
)} />
```

### Animation Guidelines

- **Framer Motion**: Micro-interactions, complex animations
- **Tailwind**: Simple hover states, color transitions

### Accessibility

All interactive elements must have:
- ARIA labels for icon buttons
- Focus states (`focus-visible:ring-2`)
- Keyboard navigation support

## Migration Guide

When creating new components:

1. Use semantic tokens (not hardcoded colors)
2. Use `cn()` for className construction
3. Add ARIA labels to interactive elements
4. Choose appropriate animation method
5. Test responsive behavior
6. Verify dark mode compatibility
```

##### Step 4.9: Complete Component Pattern Documentation

**File**: `docs/COMPONENT_PATTERNS.md`

Add sections for:
- Responsive design patterns
- Accessibility requirements
- Performance considerations
- Common pitfalls to avoid

#### Validation Checklist

- [ ] All components responsive: Test on mobile/tablet/desktop
- [ ] Progress bars consistent: Visual check h-2 everywhere
- [ ] ARIA labels present: Accessibility audit with React DevTools
- [ ] Focus states visible: Tab through all interactive elements
- [ ] Documentation complete: Review by team member

**DELIVERABLE**: Production-ready design system with clear patterns for future development.

---

## Part 2: Component Library Integration

### Research Summary: 16 Libraries Evaluated

#### Tier 1: IMMEDIATE USE (Free, High Quality, Perfect Fit)

**1. SmoothUI** - Study/Flashcard Interfaces ⭐⭐⭐
- **Website**: https://smoothui.dev
- **License**: 100% FREE, MIT
- **Tech Stack**: React 19, Next.js 15, Tailwind v4, Framer Motion
- **Components**:
  - Scrollable Card Stack (flashcard review)
  - Expandable Cards (answer reveal)
  - Number Flow (progress tracking)
  - AI Input with Siri Orb (Quick Capture enhancement)
  - Tag Animations (flashcard categories)
  - Toast notifications
  - Interactive Image Selector

**Best for Rhizome**: Primary flashcard UI, animations, Quick Capture enhancement

**2. Kibo UI** - Advanced Application Components ⭐⭐⭐
- **Website**: https://www.kibo-ui.com
- **License**: 100% FREE, MIT
- **GitHub**: 3.2k stars (most popular), actively maintained (Oct 2025)
- **Tech Stack**: Next.js 15, TypeScript, shadcn/ui extension
- **Components**:
  - Kanban Board (study session planning, deck organization)
  - Rich Text Editor (enhanced annotation editing)
  - Color Picker (Figma-style)
  - Code Block (syntax highlighting)
  - Dropzone (drag-drop uploads)
  - AI Chat primitives

**Best for Rhizome**: Kanban for deck management, rich editor for annotations

**3. Magic UI** - Animation Enhancement ⭐⭐
- **Website**: https://magicui.design
- **License**: 150+ components FREE, MIT
- **Tech Stack**: React, TypeScript, Tailwind, Framer Motion
- **Components**:
  - Number Ticker (streaks, score counters)
  - Flip Text (flashcard reveals)
  - Text Reveal (progressive content)
  - Box Reveal (smooth reveals)
  - Scratch To Reveal (gamification)
  - Confetti (celebrations)

**Best for Rhizome**: Progress animations, text effects, gamification

#### Tier 2: SELECTIVE USE (Free, Good Quality)

**4. Cult UI** - Animated Interactions
- **Website**: https://www.cult-ui.com
- **License**: 100% FREE, MIT
- **GitHub**: 2.7k stars
- **Components**: Side panels, floating panels, timer, dynamic island, sortable lists
- **Best for**: Alternative UI patterns, study timer

**5. Origin UI** - Subtle Professional UI
- **Website**: https://originui.com
- **License**: 400+ components FREE, MIT
- **Components**: 20+ accordion variants, tabs, cards, micro-interactions
- **Best for**: Settings/admin interfaces, Q&A patterns

**6. Shadcnblocks** - Admin/Dashboard
- **Website**: https://www.shadcnblocks.com
- **License**: 39 FREE blocks, $149 Pro (829+ blocks)
- **Components**: Timeline blocks, admin dashboard, data tables, settings panels
- **Best for**: Admin panel enhancement (if budget allows)

#### Tier 3: NOT RECOMMENDED

- **Aceternity UI**: Too flashy for study app (spotlights, beams)
- **Blocks.so**: Admin-focused, overlaps with Shadcnblocks
- **Skiper UI**: Good but $129 (evaluate if SmoothUI insufficient)
- **Tailark**: Marketing sites only
- **Solace UI**: Insufficient information
- **NexUI**: Too early stage
- **Shadcraft**: Figma tool, not code
- **Shadcndesign**: Design-first, not needed
- **Shadcnstudio**: Good but overlaps with SmoothUI/Kibo
- **Hexta UI**: Similar to shadcn/ui, no unique value

---

### Flashcard System Architecture

Using researched components, here's the complete implementation plan:

#### 1. FlashcardReviewMode (SmoothUI)

**Component**: Scrollable Card Stack
**Installation**: `npx shadcn@latest add @smoothui/scrollable-card-stack`

**Features**:
- Swipe through flashcards (touch + mouse)
- Shows front of card
- Tap/click to reveal answer (Expandable Cards component)
- Mark as Easy/Hard/Again (FSRS integration)

**Implementation**:
```tsx
// src/components/study/FlashcardReviewMode.tsx
import { ScrollableCardStack } from '@/components/ui/scrollable-card-stack'
import { ExpandableCard } from '@/components/ui/expandable-cards'

export function FlashcardReviewMode({ cards }: { cards: Flashcard[] }) {
  return (
    <ScrollableCardStack>
      {cards.map(card => (
        <ExpandableCard
          front={card.question}
          back={card.answer}
          onRate={(rating) => updateFSRS(card.id, rating)}
        />
      ))}
    </ScrollableCardStack>
  )
}
```

#### 2. FlashcardDeckManager (Kibo UI)

**Component**: Kanban Board
**Installation**: `npx kibo-ui add kanban`

**Features**:
- Columns: To Study, In Progress, Mastered
- Drag cards between decks
- Visual deck organization
- Study session planning

**Implementation**:
```tsx
// src/components/study/FlashcardDeckManager.tsx
import { KanbanBoard } from '@/components/ui/kanban'

export function FlashcardDeckManager() {
  const columns = [
    { id: 'to-study', title: 'To Study', cards: toStudyCards },
    { id: 'in-progress', title: 'In Progress', cards: inProgressCards },
    { id: 'mastered', title: 'Mastered', cards: masteredCards }
  ]

  return (
    <KanbanBoard
      columns={columns}
      onCardMove={handleCardMove}
    />
  )
}
```

#### 3. StudySessionStats (SmoothUI + Magic UI)

**Components**: Number Flow + Number Ticker
**Installation**:
```bash
npx shadcn@latest add @smoothui/number-flow
npx shadcn@latest add @magicui/number-ticker
```

**Features**:
- Cards studied today (animated counter)
- Current streak (animated)
- Accuracy percentage (progress bar)
- Time spent studying

**Implementation**:
```tsx
// src/components/study/StudySessionStats.tsx
import { NumberFlow } from '@/components/ui/number-flow'
import { NumberTicker } from '@/components/ui/number-ticker'

export function StudySessionStats({ stats }: { stats: StudyStats }) {
  return (
    <div className="grid grid-cols-4 gap-4">
      <StatCard
        label="Studied Today"
        value={<NumberTicker value={stats.cardsToday} />}
      />
      <StatCard
        label="Current Streak"
        value={<NumberFlow value={stats.streak} />}
        suffix="days"
      />
      <StatCard
        label="Accuracy"
        value={`${stats.accuracy}%`}
      />
      <StatCard
        label="Time Studying"
        value={formatTime(stats.timeSpent)}
      />
    </div>
  )
}
```

#### 4. QuickCaptureEnhanced (SmoothUI)

**Component**: AI Input with Siri Orb
**Installation**: `npx shadcn@latest add @smoothui/ai-input`

**Features**:
- Replace current QuickSparkModal
- Siri orb animation for visual appeal
- Maintain existing ⌘K shortcut
- Quick create flashcard or spark

**Implementation**:
```tsx
// src/components/reader/QuickCaptureEnhanced.tsx
import { AIInput } from '@/components/ui/ai-input'

export function QuickCaptureEnhanced() {
  return (
    <AIInput
      placeholder="Quick capture idea or flashcard..."
      onSubmit={handleSubmit}
      showSiriOrb
      shortcut="⌘K"
    />
  )
}
```

---

### Component Installation Plan

#### Phase 1: Core Study Components (Week 1)

```bash
# SmoothUI - Primary study interface
npx shadcn@latest add @smoothui/scrollable-card-stack
npx shadcn@latest add @smoothui/expandable-cards
npx shadcn@latest add @smoothui/number-flow
npx shadcn@latest add @smoothui/tag-animations

# Magic UI - Progress animations
npx shadcn@latest add @magicui/number-ticker
npx shadcn@latest add @magicui/flip-text
```

**Tasks**:
- [ ] Install components
- [ ] Create FlashcardReviewMode component
- [ ] Create StudySessionStats component
- [ ] Test flashcard flip animations
- [ ] Integrate with FSRS algorithm

#### Phase 2: Enhanced Capture (Week 2)

```bash
# SmoothUI - Quick Capture enhancement
npx shadcn@latest add @smoothui/ai-input
```

**Tasks**:
- [ ] Install AI Input component
- [ ] Create QuickCaptureEnhanced component
- [ ] Replace existing QuickSparkModal
- [ ] Test ⌘K shortcut functionality
- [ ] Verify Siri orb animation

#### Phase 3: Deck Management (Week 3)

```bash
# Kibo UI - Kanban for deck organization
npx kibo-ui add kanban
```

**Tasks**:
- [ ] Install Kanban component
- [ ] Create FlashcardDeckManager component
- [ ] Implement drag-and-drop logic
- [ ] Connect to ECS backend
- [ ] Test deck organization workflow

#### Phase 4: Optional Enhancements (Week 4+)

```bash
# Cult UI - Timer for study sessions
# Magic UI - Gamification
npx shadcn@latest add @magicui/confetti
npx shadcn@latest add @magicui/scratch-to-reveal

# Kibo UI - Rich text editor (if needed)
npx kibo-ui add editor
```

**Tasks**:
- [ ] Evaluate need for study timer
- [ ] Consider gamification elements (confetti for achievements)
- [ ] Test scratch-to-reveal for answer mechanism
- [ ] Decide on rich text editor for annotations

---

## Part 3: Implementation Timeline

### Month 1: Foundation

**Week 1: Phase 1 - Token System** (4-6 hours)
- Create token file structure
- Define all semantic tokens (colors, spacing, shadows, z-index)
- Test backward compatibility
- **DELIVERABLE**: Complete OKLCH token system

**Week 2: Component Library Evaluation** (4-6 hours)
- Install and test SmoothUI components locally
- Install and test Kibo UI Kanban
- Install and test Magic UI animations
- Create proof-of-concept flashcard component
- **DELIVERABLE**: Working prototypes

**Week 3: Phase 2 Part 1 - Annotation System** (6-8 hours)
- Refactor globals.css (298 lines → 16 lines)
- Update QuickSparkCapture.tsx
- Update AnnotationsList.tsx
- Update QuickCapturePanel.tsx
- **DELIVERABLE**: Single source of truth for colors

**Week 4: Phase 2 Part 2 - Component Patterns** (4-6 hours)
- Refactor chunker badge colors (CVA variants)
- Standardize className construction
- Create component pattern documentation
- **DELIVERABLE**: Consistent styling patterns

### Month 2: System Completion + Flashcard Build

**Week 5: Phase 3 - Theme Code-Splitting** (2-4 hours)
- Create ExperimentalThemeLoader
- Move CSS to public directory
- Test dynamic loading
- **DELIVERABLE**: -500 lines from production bundle

**Week 6: Phase 4 - System Completion** (6-8 hours)
- Add responsive variants
- Standardize progress bars
- Add ARIA labels
- Create documentation
- **DELIVERABLE**: Production-ready design system

**Week 7-8: Flashcard System** (12-16 hours)
- Build FlashcardReviewMode (SmoothUI)
- Build FlashcardDeckManager (Kibo UI)
- Build StudySessionStats (Number animations)
- Integrate FSRS algorithm
- **DELIVERABLE**: Complete flashcard system

### Month 3: Polish + Advanced Features

**Week 9: Quick Capture Enhancement** (4-6 hours)
- Replace QuickSparkModal with AI Input
- Add Siri orb animation
- Test UX
- **DELIVERABLE**: Enhanced quick capture

**Week 10-11: Advanced Study Features** (8-12 hours)
- Study session timer
- Tag system for flashcards
- Gamification elements
- Achievement tracking
- **DELIVERABLE**: Complete study system

**Week 12: Final Polish** (4-6 hours)
- Visual design refinement
- Performance optimization
- Accessibility audit
- User testing
- **DELIVERABLE**: Production-ready app

---

## Effort Summary

| Phase | Effort | Risk | Impact |
|-------|--------|------|--------|
| Phase 1: Token System | 4-6 hours | Low | High (foundation) |
| Phase 2: Component Migration | 8-12 hours | Medium | Very High (cleanup) |
| Phase 3: Theme Code-Split | 2-4 hours | Low | Medium (maintenance) |
| Phase 4: System Completion | 6-8 hours | Low | High (polish) |
| Component Evaluation | 4-6 hours | Low | High (validation) |
| Flashcard System | 12-16 hours | Medium | Very High (features) |
| Quick Capture Enhancement | 4-6 hours | Low | Medium (UX) |
| Advanced Features | 8-12 hours | Low | Medium (polish) |
| Final Polish | 4-6 hours | Low | High (quality) |
| **TOTAL** | **54-79 hours** | **Medium** | **Very High** |

**Timeline**: 2-3 months at 10 hours/week or 1 month at 20 hours/week

---

## Success Criteria

### Design System

- [ ] Complete OKLCH token system (50+ tokens)
- [ ] Annotation CSS reduced from 298 lines → 16 lines
- [ ] 500 lines removed from production bundle
- [ ] Single source of truth for all colors
- [ ] Easy theme customization enabled
- [ ] Professional documentation complete

### Component Libraries

- [ ] SmoothUI integrated (flashcard UI, animations)
- [ ] Kibo UI integrated (Kanban, optional rich editor)
- [ ] Magic UI integrated (progress animations)
- [ ] All components work with React 19, Next.js 15, Tailwind v4
- [ ] No breaking changes to existing features

### Flashcard System

- [ ] Fully functional card review interface (swipe, flip, rate)
- [ ] Deck management with Kanban board
- [ ] Progress tracking with animated stats
- [ ] FSRS spaced repetition integrated
- [ ] Quick capture enhanced with AI Input
- [ ] Tag-based organization working

### Quality

- [ ] All components responsive (mobile, tablet, desktop)
- [ ] Full accessibility (ARIA, keyboard nav, focus states)
- [ ] Dark mode working correctly
- [ ] No visual regressions
- [ ] Performance acceptable (no jank, smooth animations)
- [ ] User testing positive feedback

---

## Risk Mitigation

### Risk 1: Breaking Changes Disrupt Workflow
**Mitigation**:
- Phase 1 is fully backward compatible
- Thorough testing before Phase 2
- Incremental migration allows rollback

### Risk 2: Component Libraries Don't Fit
**Mitigation**:
- Early prototyping in Week 2
- Fallback to custom components if needed
- All libraries are free (no sunk cost)

### Risk 3: Timeline Slips
**Mitigation**:
- Can pause after any phase
- Incremental value delivery
- Focus on Phase 1-2 first (highest value)

### Risk 4: User Preferences Change
**Mitigation**:
- Frequent check-ins
- Flexible architecture
- Document decisions for future reference

---

## Next Steps

### Immediate Actions (This Week)

1. **User Approval**
   - Review this comprehensive plan
   - Provide feedback/adjustments
   - Approve to proceed

2. **Project Setup**
   - Create GitHub issues for each phase
   - Set up project board for tracking
   - Schedule weekly check-ins

3. **Start Phase 1** (4-6 hours)
   - Create token file structure
   - Define all semantic tokens
   - Test backward compatibility

4. **Parallel Testing** (2-3 hours)
   - Install SmoothUI components
   - Create flashcard prototype
   - Validate approach

### Week 2 Checkpoint

- Complete Phase 1 validation
- Review flashcard prototypes
- Decide: Proceed with Phase 2 or iterate?

---

## Appendix: Component Library Comparison

| Library | Stars | Free? | Best For | Install Method |
|---------|-------|-------|----------|----------------|
| **Kibo UI** | 3.2k | ✅ Yes | Advanced app components | `npx kibo-ui add` |
| **Cult UI** | 2.7k | ✅ Yes | Animated interactions | Copy-paste |
| **SmoothUI** | Active | ✅ Yes | Study/flashcard UI | `npx shadcn add @smoothui` |
| **Magic UI** | Active | ✅ Yes | Progress animations | `npx shadcn add @magicui` |
| **Origin UI** | 1.8k | ✅ Yes | Professional subtle UI | Copy-paste |
| **Shadcnblocks** | Active | 39 free / $149 Pro | Admin/dashboard | CLI (Pro) or copy-paste |
| **Aceternity** | Active | 70+ free / $129 Pro | Flashy animations | CLI or copy-paste |
| **Skiper UI** | Active | Limited / $129 Pro | Advanced card animations | Copy-paste |

**Recommendation**: Start with free tier (SmoothUI + Kibo UI + Magic UI), evaluate paid options later if needed.

---

## Questions or Concerns?

This is a comprehensive, 54-79 hour plan. If you have any questions, concerns, or want to adjust priorities, let's discuss before starting implementation.

**Key decisions needed**:
1. Approve overall approach?
2. Start with Phase 1 this week?
3. Any component libraries to add/remove?
4. Timeline flexibility confirmed?

Let's discuss and refine before diving in! 🚀
