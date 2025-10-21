# Neobrutalism Component Library Integration Plan

**Date**: 2025-10-20
**Status**: Comprehensive Implementation Plan
**Effort**: 16-24 hours over 1-2 weeks
**Risk Level**: Medium (unmaintained library, but stable codebase)

---

## Executive Summary

**What is Neobrutalism.dev?**
A collection of 50+ React components styled in the neobrutalism design philosophy—bold colors, thick borders (2-4px), hard shadows, and raw geometric aesthetics. Built on shadcn/ui and Radix UI primitives.

**Why Consider It for Rhizome V2?**
- ✅ **Distinctive Visual Identity**: Bold, memorable UI that stands out from typical SaaS apps
- ✅ **Perfect for Study App**: High contrast, clear boundaries aid focus and readability
- ✅ **shadcn/ui Compatible**: Integrates seamlessly with existing component system
- ✅ **Free & Open Source**: MIT licensed, zero cost
- ✅ **Registry Support**: Install via `npx shadcn@latest add https://neobrutalism.dev/r/[component].json`
- ✅ **React 19 + Next.js 15 Compatible**: Matches tech stack

**Critical Consideration: Maintenance Status**
⚠️ **Project is no longer maintained** (as of GitHub discussion #100)
- Last active development: ~2024
- 4.6k GitHub stars, 145 forks
- Code is stable but won't receive updates
- **Mitigation**: Fork and own the components (fits shadcn philosophy)

---

## Part 1: Strategic Assessment

### Design Philosophy Alignment

**Neobrutalism Characteristics**:
- Bold borders (2-4px) with high contrast
- Dramatic box shadows with translation effects (`hover:translate-x-boxShadowX`)
- Accessible color schemes (light/dark mode)
- Intentionally "uncomfortable" design vs conventional UX
- Raw, unapologetic visual elements

**Rhizome V2 Fit Assessment**:

| Aspect | Fit Score | Rationale |
|--------|-----------|-----------|
| **Reading Interface** | 🟡 Medium | High contrast aids readability, but bold borders may distract |
| **Study/Flashcards** | 🟢 High | Perfect for gamification, memorable card backs, clear CTAs |
| **Admin Panel** | 🟢 High | Bold UI works well for power-user tools, clear hierarchy |
| **Connection Viz** | 🟡 Medium | Brutalist cards good, but may need custom graph styling |
| **Quick Capture** | 🟢 High | Bold, attention-grabbing modals ideal for ⌘K workflows |
| **Processing Dock** | 🟢 High | Status indicators pop, clear progress feedback |

**Recommendation**: **Selective Integration**
- Use Neobrutalism for **study system**, **admin panel**, **quick capture**, **status UI**
- Keep current design for **reading interface** and **connection visualization**
- Hybrid approach maximizes strengths of both styles

### Risk Analysis

| Risk | Severity | Mitigation |
|------|----------|------------|
| **Unmaintained Library** | 🟡 Medium | Fork components to own codebase (shadcn philosophy) |
| **Breaking Changes** | 🟢 Low | CSS variables-based, unlikely to break with updates |
| **Design Cohesion** | 🟡 Medium | Selective integration, not wholesale replacement |
| **Accessibility** | 🟢 Low | Built on Radix UI (same as shadcn), ARIA compliant |
| **Performance** | 🟢 Low | Same footprint as shadcn (Radix primitives) |
| **Learning Curve** | 🟢 Low | Same API as shadcn/ui, familiar patterns |

**Overall Risk**: **Medium-Low** - Benefits outweigh risks with proper strategy

---

## Part 2: Component Mapping to Rhizome Features

### Available Components (50+)

#### Form & Input
- Accordion, Input, Textarea, Checkbox, Radio Group, Select, Combobox
- Date Picker, Input OTP, Label, Switch

#### Navigation
- Breadcrumb, Pagination, Tabs, Menubar, Navigation Menu
- Dropdown Menu, Context Menu

#### Display
- Alert, Alert Dialog, Avatar, Badge, Card, Image Card
- Carousel, Data Table, Table, Scroll Area, Skeleton
- Tooltip, Hover Card

#### Containers
- Dialog, Drawer, Popover, Sheet, Sidebar

#### Feedback
- Progress, Slider, Resizable, Collapsible, Marquee
- Sonner (toast notifications), Command, Calendar, Chart

### Rhizome V2 Feature Mapping

#### 🎯 High Priority (Immediate Use)

**1. Study System (Flashcards)**
- **Card** → Flashcard front/back with bold borders
- **Progress** → Study session tracking with dramatic progress bars
- **Badge** → Difficulty indicators (Easy/Hard/Again)
- **Carousel** → Card stack alternative with neobrutalist styling
- **Sonner** → Toast notifications for streak achievements
- **Chart** → Study stats visualization

**2. Admin Panel Enhancement**
- **Tabs** → Bold tab switching for 6 admin sections
- **Data Table** → Background jobs list with status badges
- **Alert** → Scanner warnings and conflict notifications
- **Dialog** → Confirmation dialogs for destructive actions
- **Progress** → Job progress bars with high contrast

**3. Quick Capture (⌘K)**
- **Command** → Enhanced ⌘K with neobrutalist styling
- **Input** → Quick spark capture input
- **Textarea** → Multi-line capture with bold borders
- **Checkbox** → Tag selection for sparks

**4. Processing Dock**
- **Card** → Job status cards with bold shadows
- **Progress** → Dramatic progress bars for active jobs
- **Badge** → Job type indicators
- **Collapsible** → Expandable job details

#### 🟡 Medium Priority (Future Features)

**5. LeftPanel Components**
- **Accordion** → Collapsible sections (Outline, Stats, Timeline, Themes)
- **Sidebar** → Panel container with bold styling
- **Scroll Area** → Scrollable lists with custom scrollbars
- **Skeleton** → Loading states for async data

**6. Forms & Settings**
- **Select** → Engine weight configuration dropdowns
- **Slider** → Weight adjustment sliders (0-100%)
- **Switch** → Feature toggles (dark mode, experimental)
- **Radio Group** → Chunking strategy selection

**7. Notifications & Feedback**
- **Sonner** → Toast system for background job completion
- **Alert** → Error states, warnings, success messages
- **Tooltip** → Contextual help for complex features

#### 🟢 Low Priority (Consider Later)

**8. Reading Interface**
- **Hover Card** → Chunk metadata preview
- **Popover** → Connection details on hover
- **Sheet** → Mobile-friendly panels

**9. Connection Visualization**
- **Resizable** → Adjustable graph panels
- **Drawer** → Connection details drawer

### Installation Priority List

**Week 1: Core Study System**
```bash
npx shadcn@latest add https://neobrutalism.dev/r/card.json
npx shadcn@latest add https://neobrutalism.dev/r/progress.json
npx shadcn@latest add https://neobrutalism.dev/r/badge.json
npx shadcn@latest add https://neobrutalism.dev/r/sonner.json
npx shadcn@latest add https://neobrutalism.dev/r/carousel.json
npx shadcn@latest add https://neobrutalism.dev/r/chart.json
```

**Week 2: Admin & Quick Capture**
```bash
npx shadcn@latest add https://neobrutalism.dev/r/tabs.json
npx shadcn@latest add https://neobrutalism.dev/r/data-table.json
npx shadcn@latest add https://neobrutalism.dev/r/alert.json
npx shadcn@latest add https://neobrutalism.dev/r/dialog.json
npx shadcn@latest add https://neobrutalism.dev/r/command.json
npx shadcn@latest add https://neobrutalism.dev/r/input.json
npx shadcn@latest add https://neobrutalism.dev/r/textarea.json
```

**Week 3+: Forms & Enhancements**
```bash
npx shadcn@latest add https://neobrutalism.dev/r/select.json
npx shadcn@latest add https://neobrutalism.dev/r/slider.json
npx shadcn@latest add https://neobrutalism.dev/r/switch.json
npx shadcn@latest add https://neobrutalism.dev/r/accordion.json
npx shadcn@latest add https://neobrutalism.dev/r/sidebar.json
npx shadcn@latest add https://neobrutalism.dev/r/tooltip.json
```

---

## Part 3: Registry Configuration

### Update components.json

Add Neobrutalism to your registry configuration:

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "new-york",
  "rsc": true,
  "tsx": true,
  "tailwind": {
    "config": "tailwind.config.ts",
    "css": "app/globals.css",
    "baseColor": "neutral",
    "cssVariables": true
  },
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils",
    "ui": "@/components/ui"
  },
  "registries": {
    "@shadcn": "https://ui.shadcn.com/r/{name}.json",
    "@magicui": "https://magicui.design/r/{name}.json",
    "@smoothui": "https://smoothui.dev/r/{name}.json",
    "@aceternity": "https://aceternity.com/r/{name}.json",
    "@cultui": "https://cult-ui.com/r/{name}.json",
    "@neobrutalism": "https://neobrutalism.dev/r/{name}.json"
  }
}
```

### Installation Patterns

**Via Registry Namespace** (after configuration):
```bash
npx shadcn@latest add @neobrutalism/card
npx shadcn@latest add @neobrutalism/progress
npx shadcn@latest add @neobrutalism/badge
```

**Via Direct URL** (works immediately):
```bash
npx shadcn@latest add https://neobrutalism.dev/r/card.json
npx shadcn@latest add https://neobrutalism.dev/r/progress.json
```

---

## Part 4: Setup & Installation Workflow

### Prerequisites

✅ Already in Rhizome V2:
- shadcn/ui initialized ✓
- Tailwind CSS v4 ✓
- CSS variables enabled ✓
- React 19 + Next.js 15 ✓

### Step 1: Update globals.css

**Current globals.css**: Already has OKLCH token system from design overhaul plan

**Add Neobrutalism Variables**:

Create new file: `src/styles/neobrutalism.css`

```css
/* Neobrutalism-specific design tokens */
@layer base {
  :root {
    /* Neobrutalism Border Widths */
    --neo-border-sm: 2px;
    --neo-border-md: 3px;
    --neo-border-lg: 4px;

    /* Neobrutalism Shadows (bold, offset shadows) */
    --neo-shadow-sm: 4px 4px 0px 0px hsl(var(--foreground));
    --neo-shadow-md: 6px 6px 0px 0px hsl(var(--foreground));
    --neo-shadow-lg: 8px 8px 0px 0px hsl(var(--foreground));

    /* Neobrutalism Colors (bold, high contrast) */
    --neo-primary: oklch(0.55 0.25 240); /* Bold blue */
    --neo-secondary: oklch(0.70 0.20 145); /* Bold green */
    --neo-accent: oklch(0.75 0.25 50); /* Bold orange */
    --neo-warning: oklch(0.80 0.25 85); /* Bold yellow */
    --neo-danger: oklch(0.65 0.30 25); /* Bold red */
  }

  .dark {
    /* Dark mode neobrutalism adjustments */
    --neo-shadow-sm: 4px 4px 0px 0px hsl(var(--background));
    --neo-shadow-md: 6px 6px 0px 0px hsl(var(--background));
    --neo-shadow-lg: 8px 8px 0px 0px hsl(var(--background));
  }
}

/* Neobrutalism utility classes */
@layer utilities {
  .neo-border {
    border: var(--neo-border-md) solid hsl(var(--foreground));
  }

  .neo-shadow {
    box-shadow: var(--neo-shadow-md);
  }

  .neo-hover {
    transition: all 0.2s ease;
  }

  .neo-hover:hover {
    transform: translate(4px, 4px);
    box-shadow: 2px 2px 0px 0px hsl(var(--foreground));
  }
}
```

Import in `src/app/globals.css`:
```css
/* Existing imports */
@import "../styles/tokens/colors.css";
@import "../styles/tokens/spacing.css";
/* ... */

/* Add Neobrutalism */
@import "../styles/neobrutalism.css";
```

### Step 2: Install Core Components

```bash
# Study system essentials
npx shadcn@latest add https://neobrutalism.dev/r/card.json
npx shadcn@latest add https://neobrutalism.dev/r/progress.json
npx shadcn@latest add https://neobrutalism.dev/r/badge.json

# Quick capture enhancement
npx shadcn@latest add https://neobrutalism.dev/r/command.json
npx shadcn@latest add https://neobrutalism.dev/r/input.json

# Admin panel
npx shadcn@latest add https://neobrutalism.dev/r/tabs.json
npx shadcn@latest add https://neobrutalism.dev/r/alert.json
```

Components will be installed to: `src/components/ui/[component].tsx`

### Step 3: Create Neobrutalism Variants

Since components land in same `/ui/` directory as existing shadcn components, create namespaced variants:

**Option A: Rename on Install** (Recommended)
```bash
# Manually copy and rename after install
npx shadcn@latest add https://neobrutalism.dev/r/card.json
# Rename: card.tsx → neo-card.tsx
mv src/components/ui/card.tsx src/components/ui/neo-card.tsx
```

**Option B: Dedicated Directory**
```bash
# Create neobrutalism-specific directory
mkdir -p src/components/neo

# Install components
npx shadcn@latest add https://neobrutalism.dev/r/card.json
# Move after install
mv src/components/ui/card.tsx src/components/neo/card.tsx
```

**Option C: Coexist with Aliases**
```typescript
// In study components, import with alias
import { Card as NeoCard } from '@/components/ui/card-neo'
import { Card as DefaultCard } from '@/components/ui/card'
```

**Recommendation**: **Option B** (dedicated directory) for clear separation

### Step 4: Update Tailwind Config

Ensure Tailwind v4 is configured for neobrutalism utilities:

```typescript
// tailwind.config.ts
import type { Config } from "tailwindcss"

const config: Config = {
  // ... existing config
  theme: {
    extend: {
      // Neobrutalism-specific extensions
      borderWidth: {
        'neo': '3px',
        'neo-thick': '4px',
      },
      boxShadow: {
        'neo-sm': '4px 4px 0px 0px currentColor',
        'neo-md': '6px 6px 0px 0px currentColor',
        'neo-lg': '8px 8px 0px 0px currentColor',
      },
      translate: {
        'neo': '4px',
      }
    }
  }
}
```

---

## Part 5: MCP Integration Strategy

### Enable Neobrutalism Discovery via MCP

Since you already have the shadcn MCP server configured, it should automatically detect the Neobrutalism registry.

**Verify MCP Configuration** (`.mcp.json`):
```json
{
  "mcpServers": {
    "shadcn": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "https://www.shadcn.io/api/mcp"]
    }
  }
}
```

### Natural Language Installation

After configuration, you can use Claude to install components:

```
User: "Add a neobrutalist card component for flashcards"
Claude: *searches neobrutalism registry via MCP*
Claude: "Installing @neobrutalism/card component..."
Claude: *runs npx shadcn add https://neobrutalism.dev/r/card.json*
```

### MCP-Enabled Workflow

**Component Discovery**:
```
User: "Show me all neobrutalism components for study interfaces"
Claude: *uses MCP to list components*
Claude: "Found: card, progress, badge, carousel, sonner"
```

**Automatic Installation**:
```
User: "Set up flashcard UI with neobrutalism styling"
Claude: *installs card, progress, badge via MCP*
Claude: *generates FlashcardReviewMode component*
```

**Documentation Lookup**:
```
User: "How do I customize neobrutalism card shadows?"
Claude: *fetches component docs via MCP*
Claude: "Use className to override --neo-shadow-* CSS variables..."
```

---

## Part 6: Implementation Roadmap

### Phase 1: Foundation Setup (2-3 hours)

**Week 1, Day 1-2**

**Tasks**:
- [ ] Update `components.json` with Neobrutalism registry
- [ ] Create `src/styles/neobrutalism.css` with design tokens
- [ ] Import neobrutalism styles in `globals.css`
- [ ] Update Tailwind config with neobrutalism utilities
- [ ] Install core components (card, progress, badge)
- [ ] Create `/components/neo/` directory structure
- [ ] Test component installation and rendering

**Deliverable**: Neobrutalism components installed and styled correctly

**Validation**:
```bash
# Check components installed
ls src/components/neo/
# Should show: card.tsx, progress.tsx, badge.tsx

# Test rendering
npm run dev
# Navigate to test page, verify bold borders and shadows
```

### Phase 2: Study System Integration (6-8 hours)

**Week 1, Day 3-5**

**Tasks**:
- [ ] Install remaining study components (carousel, sonner, chart)
- [ ] Create `FlashcardCard` component using neo/card.tsx
- [ ] Build `StudyProgress` component using neo/progress.tsx
- [ ] Implement `DifficultyBadge` using neo/badge.tsx
- [ ] Add toast notifications for achievements (sonner)
- [ ] Style flashcard flip animations with neobrutalism
- [ ] Integrate with existing FSRS algorithm
- [ ] Test study session workflow

**Deliverable**: Complete flashcard system with neobrutalist UI

**Example Component**:
```typescript
// src/components/study/FlashcardCard.tsx
'use client'

import { motion } from 'framer-motion'
import { Card, CardContent, CardHeader } from '@/components/neo/card'
import { Badge } from '@/components/neo/badge'
import { Progress } from '@/components/neo/progress'

interface FlashcardCardProps {
  question: string
  answer: string
  difficulty: 'easy' | 'medium' | 'hard'
  progress: number
}

export function FlashcardCard({ question, answer, difficulty, progress }: FlashcardCardProps) {
  const [flipped, setFlipped] = useState(false)

  return (
    <motion.div
      animate={{ rotateY: flipped ? 180 : 0 }}
      transition={{ duration: 0.6 }}
      onClick={() => setFlipped(!flipped)}
      className="perspective-1000"
    >
      <Card className="neo-border neo-shadow neo-hover cursor-pointer">
        <CardHeader>
          <Badge variant={difficulty}>{difficulty}</Badge>
        </CardHeader>
        <CardContent>
          {!flipped ? question : answer}
        </CardContent>
        <Progress value={progress} className="mt-4" />
      </Card>
    </motion.div>
  )
}
```

### Phase 3: Admin Panel Enhancement (4-6 hours)

**Week 2, Day 1-3**

**Tasks**:
- [ ] Install admin components (tabs, data-table, alert, dialog)
- [ ] Refactor AdminPanel tabs with neo/tabs.tsx
- [ ] Style background jobs table with neo/data-table.tsx
- [ ] Add confirmation dialogs with neo/dialog.tsx
- [ ] Implement alert notifications for scanner warnings
- [ ] Update job status badges with neobrutalist styling
- [ ] Test all 6 admin tabs (Scanner, Import, Export, Connections, Integrations, Jobs)

**Deliverable**: Bold, high-contrast admin interface

### Phase 4: Quick Capture Enhancement (2-3 hours)

**Week 2, Day 4-5**

**Tasks**:
- [ ] Install quick capture components (command, input, textarea)
- [ ] Refactor QuickSparkModal with neo/command.tsx
- [ ] Style spark input with neo/input.tsx
- [ ] Add multi-line support with neo/textarea.tsx
- [ ] Test ⌘K shortcut with new styling
- [ ] Verify tag selection and submission

**Deliverable**: Eye-catching ⌘K quick capture with bold styling

### Phase 5: Processing Dock Update (2-3 hours)

**Week 2, Day 5**

**Tasks**:
- [ ] Refactor ProcessingDock cards with neo/card.tsx
- [ ] Update progress bars with neo/progress.tsx
- [ ] Style job badges with neo/badge.tsx
- [ ] Add collapsible details with neo/collapsible.json
- [ ] Test active job display and auto-hide behavior

**Deliverable**: Dramatic processing status indicators

### Phase 6: Optional Enhancements (4-6 hours)

**Week 3+**

**Tasks**:
- [ ] Install form components (select, slider, switch, radio-group)
- [ ] Add engine weight sliders with neo/slider.tsx
- [ ] Create settings toggles with neo/switch.tsx
- [ ] Build chunking strategy selector with neo/radio-group.tsx
- [ ] Install notification system (sonner) for background jobs
- [ ] Add tooltips for complex features (neo/tooltip.tsx)
- [ ] Install accordion for LeftPanel sections (neo/accordion.tsx)

**Deliverable**: Complete neobrutalist form and notification system

---

## Part 7: Customization Strategy

### When to Customize

**Fork Components When**:
- Need to modify core behavior (e.g., card flip animations)
- Want to add Rhizome-specific features
- Styling needs don't match defaults

**Keep As-Is When**:
- Default behavior is sufficient
- Only need color/size tweaks (use CSS variables)
- Component is rarely used

### Customization Workflow

**1. Fork Component to Own Codebase**
```bash
# Component installed to src/components/neo/card.tsx
# You now own this code—customize freely!
```

**2. Adjust CSS Variables**
```css
/* In src/styles/neobrutalism.css */
:root {
  /* Override default shadow */
  --neo-shadow-md: 8px 8px 0px 0px hsl(var(--neo-primary)); /* Colored shadow */

  /* Adjust border width */
  --neo-border-md: 4px; /* Thicker borders */
}
```

**3. Extend with Tailwind Classes**
```typescript
<Card className="neo-border neo-shadow bg-neo-primary text-white">
  {/* Custom styling via utility classes */}
</Card>
```

**4. Create Rhizome-Specific Variants**
```typescript
// src/components/neo/flashcard-card.tsx
import { Card } from './card'

export function FlashcardCard({ children, difficulty, ...props }) {
  return (
    <Card
      className={cn(
        "neo-border neo-shadow neo-hover",
        difficulty === 'hard' && "border-neo-danger shadow-neo-danger",
        difficulty === 'medium' && "border-neo-warning shadow-neo-warning",
        difficulty === 'easy' && "border-neo-secondary shadow-neo-secondary"
      )}
      {...props}
    >
      {children}
    </Card>
  )
}
```

### Maintenance Strategy

**Since the library is unmaintained**:

1. **Fork Components to Own Repo** (Optional)
   - Create `rhizome-v2-neobrutalism-components` repo
   - Copy all used components
   - Maintain independently

2. **Document Customizations**
   - Create `docs/NEOBRUTALISM_CUSTOMIZATIONS.md`
   - List all modified components
   - Track reasons for changes

3. **Version Lock**
   - Components are copied into codebase (not installed as dependency)
   - No breaking changes from upstream
   - Full control over updates

---

## Part 8: Testing & Validation

### Visual Regression Testing

**Manual Testing Checklist**:
- [ ] Light mode: All neobrutalism components render with bold borders
- [ ] Dark mode: Shadows invert correctly, contrast maintained
- [ ] Hover states: Translation effects work smoothly
- [ ] Focus states: Keyboard navigation visible with bold outlines
- [ ] Mobile: Components scale appropriately, touch targets sufficient

**Automated Testing** (Optional):
```bash
# Install Playwright for visual testing
npm install -D @playwright/test

# Create visual regression tests
npx playwright test tests/visual/neobrutalism.spec.ts
```

### Component Integration Testing

**Test Study System**:
```typescript
// tests/components/flashcard-card.test.tsx
import { render, screen } from '@testing-library/react'
import { FlashcardCard } from '@/components/study/FlashcardCard'

describe('FlashcardCard with Neobrutalism', () => {
  it('renders with bold borders', () => {
    render(<FlashcardCard question="Test" answer="Answer" difficulty="easy" progress={50} />)
    const card = screen.getByRole('article')
    expect(card).toHaveClass('neo-border')
    expect(card).toHaveClass('neo-shadow')
  })

  it('applies difficulty-specific styling', () => {
    render(<FlashcardCard difficulty="hard" {...otherProps} />)
    expect(screen.getByText('hard')).toHaveClass('border-neo-danger')
  })
})
```

### Performance Testing

**Bundle Size Impact**:
```bash
# Before neobrutalism
npm run build
# Check .next/static bundle sizes

# After neobrutalism
npm run build
# Compare bundle sizes

# Expected: +5-10KB per component (same as shadcn)
```

**Runtime Performance**:
- Neobrutalism components have identical performance to shadcn/ui (same Radix primitives)
- CSS variables add negligible overhead
- Shadows and borders are GPU-accelerated

---

## Part 9: Migration from Existing Components

### Coexistence Strategy

**During transition period, run both styles**:

**Old (Default shadcn)**:
```typescript
import { Card } from '@/components/ui/card'  // Existing components
```

**New (Neobrutalism)**:
```typescript
import { Card } from '@/components/neo/card'  // Neobrutalist variants
```

### Migration Checklist

**Study System** (High Priority):
- [ ] Migrate `FlashcardReviewMode` to neo/card
- [ ] Update `StudySessionStats` to neo/progress + neo/chart
- [ ] Replace badges with neo/badge

**Admin Panel** (High Priority):
- [ ] Migrate AdminPanel tabs to neo/tabs
- [ ] Update JobList to neo/data-table
- [ ] Replace alerts with neo/alert

**Quick Capture** (Medium Priority):
- [ ] Migrate QuickSparkModal to neo/command
- [ ] Update input fields to neo/input

**Processing Dock** (Medium Priority):
- [ ] Migrate job cards to neo/card
- [ ] Update progress bars to neo/progress

**Keep Existing** (Low Priority):
- [ ] Reading interface (VirtualizedReader)
- [ ] Connection visualization (ConnectionHeatmap)
- [ ] RightPanel (current shadcn tabs)

---

## Part 10: Alternative & Fallback Strategies

### If Neobrutalism Doesn't Fit

**Option 1: Selective Components Only**
- Use neobrutalism for study system only
- Keep default shadcn for everything else
- Minimal integration effort

**Option 2: Extract Styling Patterns**
- Don't install components
- Copy neobrutalism CSS variables to own design system
- Apply bold borders/shadows to existing components

**Example**:
```css
/* Add to existing design system */
.rhizome-card-bold {
  border: 3px solid hsl(var(--foreground));
  box-shadow: 6px 6px 0px 0px hsl(var(--foreground));
  transition: all 0.2s ease;
}

.rhizome-card-bold:hover {
  transform: translate(4px, 4px);
  box-shadow: 2px 2px 0px 0px hsl(var(--foreground));
}
```

**Option 3: Hybrid Approach**
- Neobrutalism for "action" UI (study, admin, quick capture)
- Default shadcn for "reading" UI (document viewer, connections)
- Clear visual separation between modes

### Alternative Libraries

If neobrutalism proves unsuitable:

**1. SmoothUI** (from your research)
- Modern, animated components
- Active maintenance
- Perfect for study/flashcard interfaces
- Registry: `https://smoothui.dev/r/{name}.json`

**2. Magic UI** (from your research)
- Progress animations ideal for study stats
- Number tickers for streak counters
- Registry: `https://magicui.design/r/{name}.json`

**3. Cult UI** (from your research)
- Animated interactions
- Side panels and floating UI
- Registry: `https://cult-ui.com/r/{name}.json` (verify)

**4. Custom Design System**
- Extract best ideas from all libraries
- Build custom components with Radix primitives
- Maximum control, most effort

---

## Part 11: Success Criteria

### Visual Design Goals

- [ ] **Bold Visual Identity**: Rhizome V2 has distinctive, memorable UI
- [ ] **High Contrast**: All interactive elements clearly defined
- [ ] **Consistent Brutalism**: Neobrutalist components follow same design language
- [ ] **Accessible**: WCAG 2.1 AA compliance maintained
- [ ] **Dark Mode**: Neobrutalism works perfectly in both light and dark themes

### Functional Goals

- [ ] **Study System**: Flashcard UI is engaging and encourages daily use
- [ ] **Admin Panel**: Power-user tools are clear and efficient
- [ ] **Quick Capture**: ⌘K modal is attention-grabbing and fast
- [ ] **Processing Dock**: Job status is immediately obvious
- [ ] **No Regressions**: Existing features continue to work

### Performance Goals

- [ ] **Bundle Size**: <15KB increase per component
- [ ] **Load Time**: No perceptible slowdown
- [ ] **Animations**: Smooth 60fps hover effects
- [ ] **Mobile**: Responsive design, touch-friendly

### Developer Experience Goals

- [ ] **Easy Installation**: Registry-based install works via MCP
- [ ] **Clear Documentation**: Customization guide complete
- [ ] **Maintainable**: Components owned in codebase, can modify freely
- [ ] **Type Safety**: Full TypeScript support maintained

---

## Part 12: Effort Estimation

| Phase | Tasks | Hours | Risk |
|-------|-------|-------|------|
| **Phase 1: Foundation** | Setup, config, core installs | 2-3 | Low |
| **Phase 2: Study System** | Flashcard UI, progress, badges | 6-8 | Medium |
| **Phase 3: Admin Panel** | Tabs, tables, alerts, dialogs | 4-6 | Low |
| **Phase 4: Quick Capture** | Command, inputs, textarea | 2-3 | Low |
| **Phase 5: Processing Dock** | Cards, progress, badges | 2-3 | Low |
| **Phase 6: Enhancements** | Forms, tooltips, accordion | 4-6 | Low |
| **Testing & Polish** | Visual tests, docs, refinement | 2-4 | Low |
| **TOTAL** | **All phases** | **22-33 hours** | **Low-Medium** |

**Timeline**: 2-3 weeks at 10 hours/week or 1 week at 25 hours/week

---

## Part 13: Integration with Existing Plans

### Relationship to Design System Overhaul Plan

**From `2025-10-19_design-system-overhaul-and-component-strategy.md`**:

**Synergies**:
- ✅ **Phase 1 (Token System)**: Neobrutalism CSS variables integrate with OKLCH tokens
- ✅ **Phase 2 (Component Migration)**: Neobrutalism provides bold alternatives to existing components
- ✅ **Phase 4 (System Completion)**: Neobrutalism completes design system with distinctive styling
- ✅ **Flashcard System**: Neobrutalism perfect for study UI (SmoothUI alternative)

**Recommended Approach**:
1. Complete **Design System Overhaul Phase 1-2** first (token system, color cleanup)
2. Then **install Neobrutalism** for study system and admin panel
3. Finally **integrate SmoothUI** for advanced animations (complement, not replace)

**Combined Timeline**:
- Weeks 1-2: Design System Overhaul (Phases 1-2)
- Weeks 3-4: Neobrutalism Integration (Study + Admin)
- Weeks 5-6: SmoothUI Enhancements (Animations + Advanced Features)

### Relationship to Component Library Research

**From `2025-10-19_component-library-research-full.md`**:

**Neobrutalism vs Researched Libraries**:

| Feature | Neobrutalism | SmoothUI | Kibo UI | Magic UI |
|---------|-------------|----------|---------|----------|
| **Flashcard UI** | 🟢 Card, Carousel | 🟢 Scrollable Stack | 🟡 Kanban | 🟡 Flip Text |
| **Progress** | 🟢 Progress, Chart | 🟢 Number Flow | ❌ None | 🟢 Number Ticker |
| **Admin Tools** | 🟢 Tabs, Data Table | ❌ None | 🟢 Kanban | ❌ None |
| **Forms** | 🟢 Complete | 🟡 AI Input | 🟢 Rich Editor | ❌ None |
| **Animations** | 🟡 Basic | 🟢 Advanced | 🟡 Basic | 🟢 Advanced |
| **Brutalist Style** | 🟢 Core | ❌ Smooth | ❌ Clean | ❌ Flashy |

**Recommendation**: **Use Both**
- **Neobrutalism**: Base UI framework (cards, forms, admin)
- **SmoothUI**: Advanced animations (scrollable stacks, expandable cards)
- **Magic UI**: Progress effects (number tickers, confetti)
- **Kibo UI**: Rich editor (if needed for annotations)

**Combined Power**:
```typescript
// Flashcard component using BOTH libraries
import { Card } from '@/components/neo/card'  // Neobrutalism base
import { ScrollableStack } from '@/components/ui/scrollable-stack'  // SmoothUI animation
import { NumberTicker } from '@/components/ui/number-ticker'  // Magic UI effect

<ScrollableStack className="neo-border neo-shadow">
  <Card className="neo-hover">
    <NumberTicker value={cardsStudied} />
  </Card>
</ScrollableStack>
```

### Relationship to shadcn Registry Research

**From `2025-10-19_shadcn-registry-mcp-integration.md`**:

**Perfect Fit**:
- ✅ Neobrutalism uses registry system: `https://neobrutalism.dev/r/{name}.json`
- ✅ Works with MCP for AI-powered installation
- ✅ Follows shadcn patterns (Radix primitives, CSS variables)
- ✅ Components install to same directory structure

**Registry Configuration**:
```json
{
  "registries": {
    "@neobrutalism": "https://neobrutalism.dev/r/{name}.json",
    "@smoothui": "https://smoothui.dev/r/{name}.json",
    "@magicui": "https://magicui.design/r/{name}.json",
    "@kibo": "https://kibo-ui.com/r/{name}.json"  // verify URL
  }
}
```

**MCP-Powered Workflow**:
```
User: "Build flashcard system with neobrutalist cards and smooth animations"

Claude: *searches registries via MCP*
Claude: "Installing components:
         - @neobrutalism/card (bold styling)
         - @smoothui/scrollable-stack (animations)
         - @magicui/number-ticker (progress effects)"

Claude: *generates integrated component code*
```

---

## Part 14: Decision Points

### Key Questions to Answer

**1. Commitment Level**
- [ ] **Full Integration**: Use neobrutalism for all new features
- [ ] **Selective Integration**: Study system + admin panel only
- [ ] **Experimental**: Install 2-3 components, test user reaction

**Recommendation**: **Selective Integration** (study + admin + quick capture)

**2. Coexistence Strategy**
- [ ] **Replace Existing**: Migrate all components to neobrutalism
- [ ] **Hybrid Approach**: Neobrutalism for "action" UI, shadcn for "reading" UI
- [ ] **Gradual Migration**: New features use neobrutalism, old features unchanged

**Recommendation**: **Hybrid Approach** (best of both worlds)

**3. Customization Depth**
- [ ] **Use As-Is**: Install components, minimal customization
- [ ] **Rhizome Variants**: Create custom variants for project-specific needs
- [ ] **Deep Fork**: Maintain own fork with extensive modifications

**Recommendation**: **Rhizome Variants** (balance flexibility and maintenance)

**4. Alternative Libraries**
- [ ] **Neobrutalism Only**: Single library for consistency
- [ ] **Multi-Library**: Neobrutalism + SmoothUI + Magic UI
- [ ] **Custom Hybrid**: Extract patterns, build custom

**Recommendation**: **Multi-Library** (leverage strengths of each)

---

## Part 15: Next Steps

### Immediate Actions (This Week)

1. **Review & Approve Plan**
   - Read this comprehensive plan
   - Decide on commitment level (full/selective/experimental)
   - Approve coexistence strategy
   - Set timeline expectations

2. **Phase 1: Foundation Setup** (2-3 hours)
   - Update `components.json` with Neobrutalism registry
   - Create `src/styles/neobrutalism.css`
   - Install 3 core components (card, progress, badge)
   - Test rendering and styling

3. **Prototype Flashcard Component** (2-3 hours)
   - Build single `FlashcardCard` component with neobrutalism
   - Test flip animation, styling, interactivity
   - Get user feedback on visual style
   - Decide: proceed or pivot?

### Week 1 Checkpoint

**After prototype**:
- Does neobrutalism style fit Rhizome's vision?
- Is the bold aesthetic helpful or distracting?
- Should we proceed with full integration?

**Decision Tree**:
- ✅ **Love it** → Proceed with Phase 2 (Study System)
- 🤔 **Like it** → Selective integration only (study + admin)
- ❌ **Don't like it** → Fallback to SmoothUI + Magic UI instead

---

## Part 16: Resources & References

### Official Documentation
- **Neobrutalism Docs**: https://www.neobrutalism.dev/docs
- **GitHub Repository**: https://github.com/ekmas/neobrutalism-components
- **Installation Guide**: https://www.neobrutalism.dev/docs/installation
- **Component Showcase**: https://www.neobrutalism.dev (homepage)

### Registry & Installation
- **Registry URL**: `https://neobrutalism.dev/r/{name}.json`
- **CLI Install**: `npx shadcn@latest add https://neobrutalism.dev/r/[component].json`
- **Registry Template**: Based on shadcn/ui registry system

### Related Projects
- **shadcn/ui**: https://ui.shadcn.com
- **Radix UI**: https://www.radix-ui.com (underlying primitives)
- **SmoothUI**: https://smoothui.dev (complementary animations)
- **Magic UI**: https://magicui.design (complementary effects)

### Design Resources
- **Neobrutalism Style Guide**: https://brutalistwebsites.com
- **Color Palette Tools**: https://oklch.com (OKLCH color picker)
- **Accessibility**: https://www.w3.org/WAI/WCAG21/quickref/ (WCAG 2.1)

---

## Conclusion

Neobrutalism.dev offers a **bold, distinctive design language** perfect for Rhizome V2's study system and power-user interfaces. While the library is no longer actively maintained, its **stable codebase**, **shadcn/ui compatibility**, and **registry integration** make it a viable choice for selective integration.

**Key Advantages**:
1. ✅ **Distinctive Visual Identity**: Memorable, bold UI that stands out
2. ✅ **Perfect for Study Apps**: High contrast, clear boundaries, engaging design
3. ✅ **Free & Open Source**: MIT licensed, zero cost, own the code
4. ✅ **Registry Integration**: MCP-enabled, AI-powered installation
5. ✅ **shadcn Compatible**: Drop-in replacement, same API
6. ✅ **Customizable**: Full control over components in codebase

**Recommended Approach**:
- **Selective Integration**: Study system, admin panel, quick capture, processing dock
- **Hybrid Strategy**: Neobrutalism for "action" UI, current design for "reading" UI
- **Multi-Library**: Combine with SmoothUI (animations) and Magic UI (effects)
- **Prototype First**: Build single flashcard component, validate style, then decide

**Total Effort**: 16-24 hours over 1-2 weeks
**Risk Level**: Medium-Low (stable but unmaintained)
**ROI**: High (distinctive UI, engaging study experience, clear visual hierarchy)

---

## Questions or Concerns?

This is a comprehensive plan for integrating Neobrutalism components into Rhizome V2. Before starting implementation, please consider:

1. **Visual Style Fit**: Does the bold, brutalist aesthetic align with your vision?
2. **Maintenance Burden**: Comfortable owning unmaintained components?
3. **Integration Scope**: Full integration or selective (study + admin only)?
4. **Timeline**: 2-3 weeks realistic for your schedule?
5. **Alternative Preferences**: Prefer SmoothUI/Magic UI instead?

Let's discuss and refine this plan before diving into implementation! 🚀
