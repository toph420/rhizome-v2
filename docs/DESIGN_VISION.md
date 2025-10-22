# Rhizome V2 Design Vision

**Last Updated**: 2025-10-20
**Status**: Foundation Phase
**Aesthetic**: Flat Brutalism with Strategic Color

---

## Core Philosophy

**Flat Beauty Over Visual Complexity**

Rhizome V2 embraces a **brutalist design aesthetic** that prioritizes clarity, boldness, and functional beauty over decorative complexity. Our design system is built on three foundational principles:

1. **Flat Design**: No gradients, no glowing effects, no visual noise
2. **Bold Structure**: Thick borders (3px), hard shadows (6px offset), geometric shapes
3. **Strategic Color**: Color communicates meaning (difficulty, status, category), not decoration

---

## Design Principles

### 1. Flat First

**What We Avoid**:
- ❌ Gradient backgrounds (`bg-gradient-to-*`)
- ❌ Blur effects (`backdrop-blur`, `blur-*`)
- ❌ Colored/blurred shadows (`shadow-blue-500/50`)
- ❌ Complex curves and organic shapes
- ❌ Decorative animations (ping, pulse, glow)

**What We Use**:
- ✅ Flat, solid backgrounds
- ✅ Sharp, geometric shapes
- ✅ Hard offset shadows (no blur)
- ✅ Bold borders with high contrast
- ✅ Functional animations (transitions, interactions)

### 2. Bold Structure

**Brutalist Elements**:
- **Borders**: 3px solid borders (balanced, not subtle)
- **Shadows**: 6px offset shadows with no blur (standard depth)
- **Corners**: `rounded-lg` (8px) for modern feel, not extreme
- **Typography**: Bold headings, readable body text, monospace for code
- **Spacing**: Generous padding, clear visual hierarchy

**Visual Language**:
```
┌───────────────────────┐  ← 3px border
│                       │
│   Content Area        │  ← Flat background
│                       │
└───────────────────────┘
      └─────┘             ← 6px hard shadow
```

### 3. Strategic Color

**Color Has Meaning**:

| Use Case | Purpose | Colors |
|----------|---------|--------|
| **Annotation Highlights** | Text selection categories | Yellow, Green, Blue, Red, Purple, Orange, Pink, Gray |
| **Difficulty Badges** | Flashcard difficulty | Red (Hard), Yellow (Medium), Green (Easy) |
| **Status Indicators** | Job/process state | Blue (Processing), Green (Complete), Red (Failed) |
| **Tag Pills** | Content categorization | Bold accent colors per category |
| **Progress Bars** | Completion tracking | Primary blue fill |
| **CTA Buttons** | Primary actions | Bold primary color |

**Where NOT to Use Color**:
- Document reader background (flat white/dark only)
- Container/panel backgrounds (use semantic tokens)
- Decorative borders (use foreground color)
- Text content (use semantic text colors)

---

## Technical Foundation

### Component Library Strategy

**Multi-Library Approach**: Fork components from best-in-class libraries, restyle with brutalist aesthetic

#### Primary Sources

**1. Neobrutalism.dev** (Foundation)
- **URL**: https://www.neobrutalism.dev
- **Status**: No longer maintained (4.6k stars, MIT license)
- **Strategy**: Fork core components, own the code
- **Components**: Card, Badge, Progress, Button, Input, Dialog, Tabs
- **Use For**: Base UI framework, structural components

**2. SmoothUI** (Advanced Animations)
- **URL**: https://smoothui.dev
- **Registry**: `https://smoothui.dev/r/{name}.json`
- **Strategy**: Fork and restyle flat (remove gradients)
- **Components**: Scrollable Stack, Expandable Cards, Number Flow
- **Use For**: Flashcard animations, study interface

**3. Magic UI** (Effects & Enhancements)
- **URL**: https://magicui.design
- **Registry**: `https://magicui.design/r/{name}.json`
- **Strategy**: Fork and simplify (remove gradient text, colored shadows)
- **Components**: Number Ticker, Flip Text, Confetti
- **Use For**: Progress animations, achievement effects

**4. Kibo UI** (Advanced Components)
- **URL**: https://kibo-ui.com
- **Strategy**: Fork and apply bold borders
- **Components**: Kanban Board, Rich Text Editor
- **Use For**: Deck management, annotation editing

### Installation via shadcn Registry + MCP

**Registry Configuration** (`components.json`):
```json
{
  "registries": {
    "@shadcn": "https://ui.shadcn.com/r/{name}.json",
    "@neobrutalism": "https://neobrutalism.dev/r/{name}.json",
    "@smoothui": "https://smoothui.dev/r/{name}.json",
    "@magicui": "https://magicui.design/r/{name}.json"
  }
}
```

**MCP-Enabled Installation**:
```
User: "Add neobrutalist card component"
Claude (via MCP): *searches registry, installs automatically*
```

**Workflow**:
1. Install component via registry (MCP or CLI)
2. Move to `src/components/rhizome/` (fork to own codebase)
3. Restyle with brutalist CSS variables
4. Document origin and modifications
5. Maintain independently

---

## Directory Structure

### Component Organization

```
src/
├── components/
│   ├── rhizome/                    # Forked brutalist components
│   │   ├── README.md              # Origin tracking + modifications
│   │   ├── card.tsx               # From: neobrutalism/card
│   │   ├── badge.tsx              # From: neobrutalism/badge
│   │   ├── progress.tsx           # From: neobrutalism/progress
│   │   ├── button.tsx             # From: neobrutalism/button
│   │   ├── scrollable-stack.tsx   # From: smoothui (restyled flat)
│   │   ├── number-ticker.tsx      # From: magicui (simplified)
│   │   └── kanban.tsx             # From: kiboui (bold borders)
│   ├── ui/                        # shadcn/ui components (unchanged)
│   ├── reader/                    # Reading interface (clean design)
│   ├── study/                     # Study system (brutalist)
│   └── admin/                     # Admin panel (brutalist)
├── styles/
│   ├── tokens/                    # Existing OKLCH token system
│   │   ├── colors.css
│   │   ├── spacing.css
│   │   └── ...
│   └── neobrutalism.css           # Brutalist design tokens
└── app/
    └── design/
        └── page.tsx               # Component playground
```

### Design Token Files

**Existing**: `src/styles/tokens/` (OKLCH semantic colors)
**New**: `src/styles/neobrutalism.css` (Brutalist structure + dual palettes)

---

## Color Palette Strategy

### Dual Palette System

We maintain **TWO color palettes** for experimentation and flexibility:

#### Palette A: OKLCH Semantic (Existing)
```css
--primary: oklch(0.60 0.20 240);        /* Perceptually uniform */
--success: oklch(0.65 0.15 145);
--warning: oklch(0.75 0.15 85);
--destructive: oklch(0.577 0.245 27.325);
```

**Use For**: Integration with existing design system, accessibility

#### Palette B: Neobrutalism Bold (New)
```css
--neo-primary: oklch(0.55 0.25 240);    /* Bolder, more saturated */
--neo-secondary: oklch(0.70 0.20 145);
--neo-accent: oklch(0.75 0.25 50);
--neo-warning: oklch(0.80 0.25 85);
--neo-danger: oklch(0.65 0.30 25);
```

**Use For**: Brutalist components, high-impact UI elements

**Toggle Between Palettes**: Design playground allows switching to compare aesthetics

---

## Implementation Phases

### Phase 1: Foundation (Week 1) ✅ Current

**Goals**:
- [x] Create design vision document
- [ ] Set up neobrutalism CSS variables (dual palettes)
- [ ] Create `src/components/rhizome/` directory
- [ ] Fork core components (card, badge, progress, button)
- [ ] Build component playground (`/design` page)

**Deliverable**: Working prototype with brutalist components in playground

### Phase 2: Study System (Week 2-3)

**Goals**:
- [ ] Fork SmoothUI scrollable-stack (restyle flat)
- [ ] Build flashcard review interface with brutalist cards
- [ ] Implement difficulty badges with strategic color
- [ ] Add progress tracking with bold progress bars
- [ ] Fork Magic UI number-ticker for study stats

**Deliverable**: Complete flashcard system with brutalist aesthetic

### Phase 3: Admin & Power Tools (Week 3-4)

**Goals**:
- [ ] Restyle admin panel tabs with neobrutalism
- [ ] Apply brutalist styling to background jobs table
- [ ] Bold status badges for job states
- [ ] Enhance quick capture (⌘K) with brutalist modal

**Deliverable**: High-contrast admin interface

### Phase 4: Refinement & Polish (Week 4+)

**Goals**:
- [ ] User testing with brutalist aesthetic
- [ ] Refine color palette based on real usage
- [ ] Optimize CSS variables and utilities
- [ ] Document customization patterns
- [ ] Finalize design system

**Deliverable**: Production-ready brutalist design system

---

## Component Playground

### Design Page (`/design`)

**Purpose**: Experiment with brutalist components before production integration

**Features**:
- Side-by-side comparison (OKLCH vs Neobrutalism palettes)
- Interactive component showcase
- Real-time CSS variable editing
- Dark mode toggle
- Export component code

**Components to Test**:
1. **Cards**: Various sizes, with/without shadows
2. **Badges**: Status indicators, difficulty levels, tags
3. **Progress Bars**: Different states, animated
4. **Buttons**: Primary, secondary, destructive
5. **Forms**: Inputs, selects, checkboxes
6. **Flashcards**: Complete study card with flip animation

**Workflow**:
1. Test component with both color palettes
2. Adjust CSS variables in real-time
3. Compare against current shadcn/ui components
4. Get user feedback
5. Finalize styling, copy to production

---

## Design Decisions

### Answered Questions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **Border Width** | 3px (balanced) | Not too subtle, not extreme |
| **Shadow Offset** | 6px (standard) | Clear depth without drama |
| **Border Radius** | `rounded-lg` (8px) | Modern feel, not excessive |
| **Color Palette** | Dual (OKLCH + Neo) | Flexibility for experimentation |
| **Component Ownership** | Fork everything | Full control, no dependencies |
| **Library Strategy** | Multi-library | Best components from each |

### Open Questions

- [ ] Final color palette: OKLCH, Neobrutalism, or hybrid?
- [ ] Shadow behavior in dark mode: Invert or keep consistent?
- [ ] Animation speed: Current defaults or faster/slower?
- [ ] Typography scale: Current or bolder headings?

**Resolution**: Test in playground, decide based on user feedback

---

## Success Criteria

### Visual Design Goals

- [ ] **Distinctive Identity**: Rhizome has bold, memorable visual language
- [ ] **Reading Focus**: Clean document viewer, no visual competition
- [ ] **High Contrast**: Clear boundaries, easy to scan
- [ ] **Strategic Color**: Color communicates meaning, not decoration
- [ ] **Consistent Brutalism**: All components follow same design language

### Functional Goals

- [ ] **No Regressions**: Existing features continue to work
- [ ] **Improved Clarity**: Bold structure aids navigation
- [ ] **Faster Development**: Flat design = simpler CSS
- [ ] **Easy Customization**: CSS variables enable theming
- [ ] **Accessible**: WCAG 2.1 AA maintained

### Developer Experience Goals

- [ ] **Clear Patterns**: Documentation for brutalist styling
- [ ] **Reusable Components**: Forked library in `rhizome/`
- [ ] **Easy Maintenance**: Own code, no upstream breakage
- [ ] **Fast Prototyping**: Playground for testing ideas

---

## Related Documentation

### Planning Documents
- **Neobrutalism Integration Plan**: `thoughts/plans/2025-10-20_neobrutalism-integration-plan.md`
  - Complete 16-24 hour implementation roadmap
  - Component-by-component mapping to Rhizome features
  - Phase-by-phase execution plan

- **Cross-Library Brutalist Restyling**: `thoughts/ideas/2025-10-20_cross-library-brutalist-restyling.md`
  - How to fork and restyle components from ANY library
  - Pattern library (SmoothUI → Brutalist, Magic UI → Brutalist)
  - Complete flashcard example combining multiple libraries

- **Design System Overhaul**: `thoughts/plans/2025-10-19_design-system-overhaul-and-component-strategy.md`
  - Existing OKLCH token system (Phase 1-2 complete)
  - Color cleanup and pattern standardization
  - Integration with brutalist approach

### Research Documents
- **shadcn Registry & MCP Integration**: `thoughts/ideas/2025-10-19_shadcn-registry-mcp-integration.md`
  - Registry system fundamentals
  - MCP-powered component installation
  - Multi-registry configuration

- **Component Library Research**: `thoughts/ideas/2025-10-19_component-library-research-full.md`
  - Comprehensive review of 16 libraries
  - SmoothUI, Magic UI, Kibo UI, and others
  - Component recommendations by feature

### Technical Documentation
- **UI Patterns**: `docs/UI_PATTERNS.md`
  - No modals philosophy (persistent UI only)
  - Docks, panels, overlays

- **React Guidelines**: `docs/rEACT_GUIDELINES.md`
  - Server Components by default
  - Client component patterns

---

## Design Philosophy in Action

### Example: Flashcard Component

**Current Design** (before brutalism):
```tsx
<div className="rounded-xl bg-white shadow-md hover:shadow-lg transition-shadow">
  <div className="p-6">
    <span className="text-sm text-gray-500">Medium</span>
    <p className="mt-2 text-lg">Question text</p>
  </div>
</div>
```

**Brutalist Design** (after):
```tsx
<div className="neo-border neo-shadow neo-hover bg-background">
  <div className="border-b-2 border-foreground p-4">
    <Badge className="bg-neo-warning text-foreground font-bold">MEDIUM</Badge>
  </div>
  <div className="p-6">
    <p className="text-lg font-semibold">Question text</p>
  </div>
</div>
```

**Changes**:
- ❌ Removed: Subtle rounded corners, soft shadow, gray text
- ✅ Added: Bold 3px border, hard 6px shadow, translation hover
- ✅ Enhanced: Color badge (strategic meaning), bold typography
- ✅ Simplified: Flat background, clean structure

---

## Conclusion

Rhizome V2's brutalist design vision prioritizes **functional beauty** over decorative complexity. By embracing flat design, bold structure, and strategic color, we create a distinctive visual identity that serves the core mission: **focused reading and knowledge synthesis**.

**Core Tenets**:
1. **Flat First**: No gradients, no blur, no visual noise
2. **Bold Structure**: 3px borders, 6px shadows, geometric shapes
3. **Strategic Color**: Color communicates meaning, not decoration
4. **Component Ownership**: Fork everything, maintain independently
5. **Experimentation**: Playground testing before production

**Next Steps**:
1. Complete Phase 1 (foundation setup)
2. Test components in design playground
3. Refine based on user feedback
4. Integrate into study system
5. Expand to admin panel and beyond

---

**Last Updated**: 2025-10-20 | **Status**: Foundation Phase | **Vision Owner**: Topher
