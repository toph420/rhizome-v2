# Cross-Library Brutalist Restyling Guide

**Date**: 2025-10-20
**Purpose**: How to fork and restyle components from ANY library with Rhizome's brutalist design system

---

## Core Philosophy

**Brutalist Design Principles for Rhizome**:
1. **Flat Colors**: No gradients, no glowing effects
2. **Bold Borders**: 2-4px solid borders, high contrast
3. **Hard Shadows**: Offset box shadows (4px-8px), no blur
4. **Strategic Color**: Color for meaning (badges, tags, highlights), not decoration
5. **Geometric Shapes**: Rectangles and rounded corners, no complex curves
6. **Typography**: Bold headings, readable body text, monospace for code

---

## Restyling Pattern Library

### Pattern 1: SmoothUI → Rhizome Brutalist

**Original SmoothUI Component** (smooth, gradient-heavy):
```tsx
// From @smoothui/scrollable-stack
<div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-blue-500 via-purple-500 to-pink-500 shadow-2xl backdrop-blur-xl">
  <div className="absolute inset-0 bg-white/10 backdrop-blur-sm" />
  <div className="relative p-6">
    {children}
  </div>
</div>
```

**Rhizome Brutalist Version** (flat, bold):
```tsx
// Forked to src/components/rhizome/scrollable-stack.tsx
<div className="neo-border neo-shadow bg-background">
  <div className="p-6 border-b-neo-border border-neo-primary">
    {children}
  </div>
</div>
```

**Key Changes**:
- ❌ Remove: `bg-gradient-to-br`, `backdrop-blur`, `shadow-2xl`
- ✅ Add: `neo-border` (solid 3px), `neo-shadow` (hard offset)
- ✅ Replace: `rounded-xl` with `rounded-lg` (less extreme)
- ✅ Simplify: Flat `bg-background`, no overlays

---

### Pattern 2: Magic UI → Rhizome Brutalist

**Original Magic UI Component** (flashy, animated):
```tsx
// From @magicui/number-ticker
<div className="relative inline-block overflow-hidden rounded-full bg-gradient-to-r from-amber-400 to-orange-500 px-6 py-3 shadow-lg shadow-orange-500/50">
  <span className="bg-gradient-to-r from-white to-amber-100 bg-clip-text text-transparent font-bold text-4xl">
    {value}
  </span>
</div>
```

**Rhizome Brutalist Version** (flat, bold):
```tsx
// Forked to src/components/rhizome/number-ticker.tsx
<div className="inline-block neo-border bg-neo-accent px-6 py-3">
  <span className="font-bold text-4xl text-foreground">
    {value}
  </span>
</div>
```

**Key Changes**:
- ❌ Remove: `rounded-full`, gradient text, colored shadows
- ✅ Add: `neo-border`, flat background color
- ✅ Replace: Gradient text with solid `text-foreground`
- ✅ Keep: Bold typography, animation logic (just restyle visuals)

---

### Pattern 3: Kibo UI → Rhizome Brutalist

**Original Kibo UI Component** (clean, minimal):
```tsx
// From @kibo/kanban
<div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm hover:shadow-md transition-shadow">
  <h3 className="text-sm font-medium text-gray-900">{title}</h3>
</div>
```

**Rhizome Brutalist Version** (bold, high-contrast):
```tsx
// Forked to src/components/rhizome/kanban.tsx
<div className="neo-border neo-shadow bg-background p-4 neo-hover">
  <h3 className="text-sm font-bold text-foreground">{title}</h3>
</div>
```

**Key Changes**:
- ✅ Upgrade: `border-gray-200` → `neo-border` (thicker, bolder)
- ✅ Upgrade: `shadow-sm` → `neo-shadow` (hard offset)
- ✅ Add: `neo-hover` (translation effect)
- ✅ Enhance: `font-medium` → `font-bold`

---

## Restyling Workflow

### Step 1: Install Original Component

```bash
# Install from any registry
npx shadcn add @smoothui/scrollable-stack
npx shadcn add @magicui/number-ticker
npx kibo-ui add kanban
```

### Step 2: Fork to Rhizome Directory

```bash
# Create rhizome components directory
mkdir -p src/components/rhizome

# Move component
mv src/components/ui/scrollable-stack.tsx src/components/rhizome/scrollable-stack.tsx
```

### Step 3: Apply Brutalist Restyling

**Find and Replace Patterns**:

| Original Pattern | Brutalist Replacement |
|-----------------|----------------------|
| `rounded-xl`, `rounded-2xl` | `rounded-lg` or `rounded-md` |
| `bg-gradient-to-*` | `bg-[color]` (flat) |
| `shadow-lg`, `shadow-2xl` | `neo-shadow` |
| `border border-gray-*` | `neo-border` |
| `hover:shadow-*` | `neo-hover` |
| `backdrop-blur` | Remove entirely |
| Gradient text (`bg-clip-text`) | `text-foreground` |
| `ring-*` (focus rings) | `focus-visible:ring-2 ring-neo-primary` |

### Step 4: Update Imports

```tsx
// In your feature component
// BEFORE:
import { ScrollableStack } from '@/components/ui/scrollable-stack'

// AFTER:
import { ScrollableStack } from '@/components/rhizome/scrollable-stack'
```

### Step 5: Test & Refine

- [ ] Visual test: Does it match brutalist aesthetic?
- [ ] Functional test: Does it work the same?
- [ ] Accessibility test: Still keyboard navigable?
- [ ] Dark mode test: Looks good in both themes?

---

## Component-Specific Examples

### Example 1: Flashcard Stack (SmoothUI)

**Original SmoothUI Scrollable Stack**:
```tsx
<div className="perspective-1000 relative h-96">
  <div className="absolute inset-0 rounded-3xl bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 opacity-75 blur-3xl" />
  <div className="relative rounded-2xl border border-white/20 bg-white/10 p-6 backdrop-blur-xl">
    <div className="space-y-4">
      {cards.map(card => (
        <div key={card.id} className="rounded-xl bg-white/90 p-6 shadow-xl backdrop-blur-sm">
          {card.content}
        </div>
      ))}
    </div>
  </div>
</div>
```

**Rhizome Brutalist Version**:
```tsx
<div className="relative h-96">
  {/* Remove gradient blur background entirely */}
  <div className="neo-border neo-shadow bg-background p-6">
    <div className="space-y-4">
      {cards.map(card => (
        <div key={card.id} className="neo-border bg-card p-6 neo-hover">
          {card.content}
        </div>
      ))}
    </div>
  </div>
</div>
```

**Cleanup**:
- ❌ Removed: Gradient blur background (visual noise)
- ❌ Removed: `backdrop-blur`, `bg-white/10` (complexity)
- ✅ Simplified: Flat background, bold borders, hard shadows
- ✅ Kept: Layout structure, spacing, functionality

---

### Example 2: Progress Indicator (Magic UI)

**Original Magic UI Number Ticker**:
```tsx
<div className="flex items-center gap-4">
  <div className="relative">
    <div className="absolute inset-0 animate-ping rounded-full bg-blue-400 opacity-75" />
    <div className="relative rounded-full bg-gradient-to-r from-blue-500 to-cyan-500 p-4 shadow-lg shadow-blue-500/50">
      <span className="bg-gradient-to-r from-white to-blue-100 bg-clip-text text-3xl font-bold text-transparent">
        {count}
      </span>
    </div>
  </div>
  <div className="text-sm text-gray-600">Cards studied today</div>
</div>
```

**Rhizome Brutalist Version**:
```tsx
<div className="flex items-center gap-4">
  <div className="neo-border neo-shadow bg-neo-primary p-4">
    <span className="text-3xl font-bold text-foreground">
      {count}
    </span>
  </div>
  <div className="text-sm text-muted-foreground">Cards studied today</div>
</div>
```

**Cleanup**:
- ❌ Removed: Ping animation (distracting)
- ❌ Removed: Gradient background and text (complexity)
- ❌ Removed: Colored shadow (visual noise)
- ✅ Simplified: Flat color badge with bold number
- ✅ Added: Strategic color via `bg-neo-primary` (meaning)

---

### Example 3: Kanban Board (Kibo UI)

**Original Kibo UI Kanban**:
```tsx
<div className="grid grid-cols-3 gap-4">
  {columns.map(column => (
    <div key={column.id} className="rounded-lg border border-gray-200 bg-gray-50 p-4">
      <h3 className="mb-3 text-sm font-medium text-gray-700">{column.title}</h3>
      <div className="space-y-2">
        {column.cards.map(card => (
          <div key={card.id} className="rounded-md border border-gray-300 bg-white p-3 shadow-sm transition-all hover:shadow-md">
            {card.content}
          </div>
        ))}
      </div>
    </div>
  ))}
</div>
```

**Rhizome Brutalist Version**:
```tsx
<div className="grid grid-cols-3 gap-4">
  {columns.map(column => (
    <div key={column.id} className="neo-border bg-muted p-4">
      <h3 className="mb-3 border-b-2 border-foreground pb-2 text-sm font-bold uppercase tracking-wide">
        {column.title}
      </h3>
      <div className="space-y-2">
        {column.cards.map(card => (
          <div key={card.id} className="neo-border neo-shadow bg-card p-3 neo-hover">
            {card.content}
          </div>
        ))}
      </div>
    </div>
  ))}
</div>
```

**Cleanup**:
- ✅ Upgraded: Thin borders → `neo-border` (bold)
- ✅ Enhanced: Column headers with bottom border + uppercase
- ✅ Added: `neo-hover` for card interactions
- ✅ Simplified: Removed subtle gray variations, use semantic tokens

---

## Strategic Color Usage

### Where to Use Color Pops 🎨

**1. Annotation Highlights** (Primary Use Case)
```tsx
// Bold, flat color blocks for text selection
<span
  className="bg-[hsl(var(--annotation-yellow))] border-b-4 border-[hsl(var(--annotation-yellow-border))]"
  data-annotation-color="yellow"
>
  Highlighted text
</span>

// Color options: yellow, green, blue, red, purple, orange, pink, gray
```

**2. Status Badges**
```tsx
// Flashcard difficulty
<Badge className="neo-border bg-neo-danger text-white">Hard</Badge>
<Badge className="neo-border bg-neo-warning text-foreground">Medium</Badge>
<Badge className="neo-border bg-neo-secondary text-white">Easy</Badge>

// Job status
<Badge className="neo-border bg-neo-primary text-white">Processing</Badge>
<Badge className="neo-border bg-success text-white">Complete</Badge>
```

**3. Tag Pills**
```tsx
// Spark/annotation tags
<div className="flex gap-2">
  <span className="neo-border bg-neo-accent px-3 py-1 text-sm font-bold">
    #architecture
  </span>
  <span className="neo-border bg-neo-secondary px-3 py-1 text-sm font-bold">
    #performance
  </span>
</div>
```

**4. Progress Indicators**
```tsx
// Study session progress
<Progress
  value={75}
  className="neo-border h-4"
  indicatorClassName="bg-neo-primary"
/>

// Connection strength
<div className="h-2 w-full neo-border">
  <div
    className="h-full bg-neo-secondary transition-all"
    style={{ width: `${strength * 100}%` }}
  />
</div>
```

**5. Call-to-Action Buttons**
```tsx
// Primary actions
<Button className="neo-border neo-shadow neo-hover bg-neo-primary text-white font-bold">
  Start Study Session
</Button>

// Secondary actions
<Button className="neo-border bg-background hover:bg-muted">
  Cancel
</Button>
```

### Where NOT to Use Color ❌

- **Document Reader**: Keep clean white/dark background
- **Text Content**: No colored text (use semantic foreground)
- **Containers**: Flat background, no colored panels
- **Borders**: Black/foreground color, not decorative colors
- **Shadows**: Use foreground color for shadows, not colored shadows

---

## CSS Variable Strategy

### Neobrutalism Design Tokens

```css
/* src/styles/neobrutalism.css */
@layer base {
  :root {
    /* Brutalist Structure */
    --neo-border-sm: 2px;
    --neo-border-md: 3px;
    --neo-border-lg: 4px;
    --neo-shadow-offset: 6px;

    /* Flat Shadows (no blur) */
    --neo-shadow-sm: 4px 4px 0px 0px hsl(var(--foreground));
    --neo-shadow-md: 6px 6px 0px 0px hsl(var(--foreground));
    --neo-shadow-lg: 8px 8px 0px 0px hsl(var(--foreground));

    /* Strategic Color Pops (OKLCH for consistency) */
    --neo-primary: oklch(0.55 0.25 240);    /* Bold blue */
    --neo-secondary: oklch(0.70 0.20 145);  /* Bold green */
    --neo-accent: oklch(0.75 0.25 50);      /* Bold orange */
    --neo-warning: oklch(0.80 0.25 85);     /* Bold yellow */
    --neo-danger: oklch(0.65 0.30 25);      /* Bold red */
  }

  .dark {
    /* Invert shadows for dark mode */
    --neo-shadow-sm: 4px 4px 0px 0px hsl(var(--background));
    --neo-shadow-md: 6px 6px 0px 0px hsl(var(--background));
    --neo-shadow-lg: 8px 8px 0px 0px hsl(var(--background));
  }
}

/* Utility Classes */
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
    transform: translate(4px, 4px);
    box-shadow: 2px 2px 0px 0px hsl(var(--foreground));
  }
}
```

---

## Restyling Checklist

When forking and restyling any component:

### Visual Cleanup
- [ ] Remove gradients (`bg-gradient-*`)
- [ ] Remove blur effects (`backdrop-blur`, `blur-*`)
- [ ] Remove colored shadows (`shadow-blue-500/50`)
- [ ] Simplify border radius (`rounded-xl` → `rounded-lg`)
- [ ] Remove decorative animations (ping, pulse) unless functional

### Brutalist Enhancement
- [ ] Add bold borders (`neo-border`)
- [ ] Add hard shadows (`neo-shadow`)
- [ ] Add hover translation (`neo-hover`)
- [ ] Use flat backgrounds (`bg-background`, `bg-card`)
- [ ] Use semantic text colors (`text-foreground`, `text-muted-foreground`)

### Strategic Color
- [ ] Identify functional color needs (status, priority, category)
- [ ] Replace decorative color with flat semantic color
- [ ] Use `--neo-*` variables for accent colors
- [ ] Ensure color has meaning, not decoration

### Accessibility
- [ ] Maintain WCAG contrast ratios
- [ ] Keep keyboard focus states visible
- [ ] Preserve ARIA attributes
- [ ] Test with dark mode

### Functionality
- [ ] Preserve original component behavior
- [ ] Keep animations that aid understanding (loading, transitions)
- [ ] Maintain responsive design
- [ ] Test with real data

---

## Real-World Example: Complete Flashcard Component

### Combining Neobrutalism + SmoothUI + Magic UI

**Functionality from SmoothUI**: Scrollable stack behavior
**Animations from Magic UI**: Number ticker
**Styling from Neobrutalism**: Bold, flat aesthetic

```tsx
// src/components/study/FlashcardReviewMode.tsx
'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'

// Forked and restyled components
import { Card, CardContent, CardHeader } from '@/components/rhizome/card'
import { Badge } from '@/components/rhizome/badge'
import { Progress } from '@/components/rhizome/progress'
import { NumberTicker } from '@/components/rhizome/number-ticker'

interface Flashcard {
  id: string
  question: string
  answer: string
  difficulty: 'easy' | 'medium' | 'hard'
}

export function FlashcardReviewMode({ cards }: { cards: Flashcard[] }) {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [flipped, setFlipped] = useState(false)
  const [studiedCount, setStudiedCount] = useState(0)

  const currentCard = cards[currentIndex]
  const progress = ((currentIndex + 1) / cards.length) * 100

  const handleNext = (rating: 'easy' | 'medium' | 'hard') => {
    setStudiedCount(prev => prev + 1)
    setFlipped(false)
    setCurrentIndex(prev => (prev + 1) % cards.length)
    // Update FSRS algorithm here
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {/* Progress Header */}
      <div className="neo-border neo-shadow bg-background p-4">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="neo-border bg-neo-primary px-4 py-2">
              <NumberTicker value={studiedCount} className="text-2xl font-bold text-white" />
            </div>
            <span className="text-sm font-medium text-muted-foreground">
              Cards studied today
            </span>
          </div>
          <div className="text-sm font-medium">
            {currentIndex + 1} / {cards.length}
          </div>
        </div>
        <Progress value={progress} className="h-3 neo-border" />
      </div>

      {/* Flashcard Stack */}
      <AnimatePresence mode="wait">
        <motion.div
          key={currentCard.id}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          transition={{ duration: 0.2 }}
        >
          <Card
            className={cn(
              "neo-border neo-shadow neo-hover cursor-pointer min-h-[400px]",
              "transition-all duration-300"
            )}
            onClick={() => setFlipped(!flipped)}
          >
            <CardHeader className="border-b-2 border-foreground">
              <Badge
                className={cn(
                  "neo-border",
                  currentCard.difficulty === 'hard' && "bg-neo-danger text-white",
                  currentCard.difficulty === 'medium' && "bg-neo-warning text-foreground",
                  currentCard.difficulty === 'easy' && "bg-neo-secondary text-white"
                )}
              >
                {currentCard.difficulty.toUpperCase()}
              </Badge>
            </CardHeader>

            <CardContent className="flex min-h-[300px] items-center justify-center p-8">
              <motion.div
                animate={{ rotateY: flipped ? 180 : 0 }}
                transition={{ duration: 0.3 }}
                className="text-center"
              >
                <p className="text-2xl font-bold">
                  {flipped ? currentCard.answer : currentCard.question}
                </p>
              </motion.div>
            </CardContent>
          </Card>
        </motion.div>
      </AnimatePresence>

      {/* Rating Buttons (only show after flip) */}
      {flipped && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex gap-4"
        >
          <button
            onClick={() => handleNext('easy')}
            className="neo-border neo-shadow neo-hover flex-1 bg-neo-secondary p-4 font-bold text-white"
          >
            Easy
          </button>
          <button
            onClick={() => handleNext('medium')}
            className="neo-border neo-shadow neo-hover flex-1 bg-neo-warning p-4 font-bold text-foreground"
          >
            Medium
          </button>
          <button
            onClick={() => handleNext('hard')}
            className="neo-border neo-shadow neo-hover flex-1 bg-neo-danger p-4 font-bold text-white"
          >
            Hard
          </button>
        </motion.div>
      )}
    </div>
  )
}
```

**What We Did**:
1. ✅ **Forked Components**: Card, Badge, Progress, NumberTicker from different libraries
2. ✅ **Applied Brutalist Styling**: Bold borders, flat colors, hard shadows
3. ✅ **Strategic Color**: Difficulty badges use color for meaning
4. ✅ **Kept Functionality**: SmoothUI stack behavior, Magic UI animations
5. ✅ **Flat Design**: No gradients, no glowing effects, pure geometric beauty

---

## Maintenance Strategy

### Component Organization
```
src/components/rhizome/
├── README.md                 # Origin tracking and customizations
├── card.tsx                  # Forked from: neobrutalism/card
├── progress.tsx              # Forked from: neobrutalism/progress
├── badge.tsx                 # Forked from: neobrutalism/badge
├── scrollable-stack.tsx      # Forked from: smoothui/scrollable-stack (restyled)
├── number-ticker.tsx         # Forked from: magicui/number-ticker (restyled)
└── kanban.tsx                # Forked from: kiboui/kanban (restyled)
```

### Documentation Template

**src/components/rhizome/README.md**:
```markdown
# Rhizome Brutalist Component Library

Components forked from various libraries and restyled with Rhizome's brutalist design system.

## Design Principles
- Flat colors, no gradients
- Bold borders (2-4px)
- Hard shadows (no blur)
- Strategic color for meaning
- Geometric shapes

## Component Origins

| Component | Forked From | Original License | Modifications |
|-----------|-------------|------------------|---------------|
| card.tsx | neobrutalism/card | MIT | Minimal, kept as-is |
| progress.tsx | neobrutalism/progress | MIT | Minimal, kept as-is |
| scrollable-stack.tsx | smoothui/scrollable-stack | MIT | Removed gradients, added neo-border |
| number-ticker.tsx | magicui/number-ticker | MIT | Removed gradient text, flat colors |
| kanban.tsx | kiboui/kanban | MIT | Bold borders, hard shadows |

## Usage

Import from `@/components/rhizome/`:
\`\`\`tsx
import { Card } from '@/components/rhizome/card'
import { Badge } from '@/components/rhizome/badge'
\`\`\`

## Customization

All components use CSS variables from `src/styles/neobrutalism.css`.
Modify variables to adjust global styling.
```

---

## Conclusion

**Your Brutalist Vision is Perfect for Rhizome!**

✅ **Flat Design**: No visual noise, let content shine
✅ **Strategic Color**: Pops of color for meaning (badges, highlights, tags)
✅ **Cross-Library Forking**: Mix-and-match best components, restyle all
✅ **Full Ownership**: Fork everything, maintain independently
✅ **Developer Joy**: Clean, simple, easy to customize

**Next Steps**:
1. Fork neobrutalism components (card, progress, badge)
2. Fork SmoothUI scrollable-stack and restyle
3. Build flashcard prototype with brutalist aesthetic
4. Test and refine visual language
5. Apply pattern to all future components

This approach gives you **complete creative control** while leveraging proven component logic from multiple libraries. Beautiful! 🎨
