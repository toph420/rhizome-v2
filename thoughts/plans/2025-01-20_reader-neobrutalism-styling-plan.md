# Reader Interface Neobrutalism Styling Plan

**Date**: 2025-01-20
**Status**: Implementation Plan
**Effort**: 12-16 hours
**Related**: `docs/DESIGN_VISION.md`, `thoughts/plans/2025-10-20_neobrutalism-integration-plan.md`

---

## Executive Summary

Apply our established neobrutalist design system (3px borders, 6px hard shadows, strategic color) to the entire document reader interface while maintaining functionality and performance.

**Design Philosophy**: Flat beauty over visual complexity
- ✅ Bold 3px borders with high contrast
- ✅ Hard 6px offset shadows (no blur)
- ✅ Strategic color for meaning (difficulty, status, tags)
- ✅ Clean geometric shapes with 8px rounded corners
- ✅ Translation hover effects for interactive elements

**Scope**:
- Document header (title, stats, Obsidian controls)
- QuickCapturePanel (annotation creation)
- RightPanel (7-tab sidebar)
- All connection and annotation cards
- Filters and controls

**Out of Scope**:
- VirtualizedReader content area (keep clean for reading focus)
- BlockRenderer markdown (preserve readability)
- Admin panel (separate styling phase)

---

## Part 1: Component Inventory & Analysis

### 1.1 Document Header (`DocumentHeader.tsx`)

**Current State**:
- Standard border-b divider
- shadcn Button components (outline variant)
- Badge for chunker type
- ToggleGroup for view modes

**Brutalist Enhancements**:
```typescript
// Border: Add neo-border-lg bottom border instead of subtle border-b
className="border-b-4 border-foreground"  // Instead of border-b

// Buttons: Apply neo-button styling
<Button className="neo-border neo-shadow-sm neo-hover">
  Edit in Obsidian
</Button>

// Badge: Bold borders for chunker type
<Badge className="neo-border neo-badge bg-neo-accent">
  {chunkerLabels[chunkerType]}
</Badge>

// ToggleGroup: Bold active state
<ToggleGroupItem className="neo-border data-[state=on]:neo-bg-primary">
  <Compass />
</ToggleGroupItem>
```

**Impact**: Medium - Sets tone for entire reader
**Effort**: 1-2 hours

---

### 1.2 QuickCapturePanel (`QuickCapturePanel.tsx`)

**Current State**:
- Portal-based floating panel
- Draggable with grip handle
- Color picker (7 colors)
- Textarea for notes
- Tag input with badges
- Rounded-lg with shadow-2xl

**Brutalist Enhancements**:
```typescript
// Main panel container
<div className="neo-card neo-shadow-lg">  // Replace shadow-2xl

// Grip handle area - emphasize draggability
<div className="neo-border-sm p-4 cursor-grab active:cursor-grabbing">
  <GripVertical />
</div>

// Color buttons - bold, tactile
{COLOR_OPTIONS.map(option => (
  <button
    className={cn(
      "neo-border neo-rounded w-10 h-10",
      "transition-all hover:scale-110",
      selectedColor === option.color && "ring-4 ring-foreground ring-offset-2"
    )}
    style={{ backgroundColor: option.bgClass }}
  />
))}

// Save button - primary CTA with bold styling
<Button className="neo-border neo-shadow neo-hover neo-bg-primary">
  Save Note
</Button>

// Delete button - danger color with bold border
<Button className="neo-border neo-shadow-danger neo-bg-danger">
  <Trash2 /> Delete
</Button>
```

**Special Considerations**:
- Portal positioning must account for shadow offset
- Drag state needs visual feedback (increase shadow on drag)
- Color accessibility with 3px borders

**Impact**: High - Primary interaction point for annotations
**Effort**: 2-3 hours

---

### 1.3 RightPanel (`RightPanel.tsx`)

**Current State**:
- Fixed right sidebar with Framer Motion collapse
- 7 icon-only tabs in grid-cols-7
- AnimatePresence for content switching
- Border-l divider

**Brutalist Enhancements**:
```typescript
// Panel container - bold left border
<motion.div className="neo-border-lg border-l-4 border-foreground">

// Tab buttons - bold active state with translation
<motion.button
  className={cn(
    "neo-rounded p-3 transition-all",
    isActive
      ? "neo-border neo-bg-primary text-white"
      : "border-2 border-transparent hover:neo-border hover:translate-x-1"
  )}
  whileHover={{ scale: 1.05 }}
  whileTap={{ scale: 0.95 }}
>
  <Icon className="h-5 w-5" />
  {badgeCount > 0 && (
    <Badge className="neo-border neo-bg-danger absolute -top-1 -right-1">
      {badgeCount}
    </Badge>
  )}
</motion.button>

// Collapse toggle button - floating with bold shadow
<Button className="neo-border neo-shadow-md neo-rounded-full">
  {collapsed ? <ChevronLeft /> : <ChevronRight />}
</Button>
```

**Animation Considerations**:
- Shadow must animate with width transition
- Tab content fade-in with bold entry
- Badge numbers with pop animation

**Impact**: High - Always visible, sets visual tone
**Effort**: 2-3 hours

---

### 1.4 ConnectionCard (`ConnectionCard.tsx`)

**Current State**:
- Card with 2px border (colored on feedback)
- Progress bar for strength
- Badge for engine type
- Validation icons (Check, X, Star)
- Hotkey hints on hover

**Brutalist Enhancements**:
```typescript
// Card container - bold border with feedback color
<Card className={cn(
  "neo-border neo-shadow neo-hover",
  "cursor-pointer transition-all",
  feedbackType === 'validate' && "border-green-500 neo-shadow-secondary",
  feedbackType === 'reject' && "border-red-500 neo-shadow-danger",
  feedbackType === 'star' && "border-yellow-500 neo-shadow-warning",
  isActive && "neo-border-lg border-primary"
)}>

// Engine badge - bold, colored by engine type
<Badge className={cn(
  "neo-border font-bold uppercase text-xs",
  engineColors[connection.connection_type]
)}>
  {connection.connection_type}
</Badge>

// Progress bar - bold border, flat fill
<div className="neo-border neo-rounded-sm h-3 bg-muted overflow-hidden">
  <div
    className="h-full transition-all bg-neo-primary"
    style={{ width: `${strength * 100}%` }}
  />
</div>

// Navigate button - bold icon button
<Button className="neo-border-sm neo-shadow-sm">
  <ExternalLink className="h-4 w-4" />
</Button>

// Validation icons - larger, bolder
{feedbackType === 'validate' && (
  <div className="neo-border neo-rounded-full p-1 bg-green-100 dark:bg-green-900/20">
    <Check className="h-5 w-5 text-green-600" />
  </div>
)}
```

**Keyboard Interaction**:
- Visual pulse on key press (v/r/s)
- Bold outline when active for keyboard input
- Hotkey hints with bold kbd styling

**Impact**: High - Primary connection display
**Effort**: 2-3 hours

---

### 1.5 ConnectionsList (`ConnectionsList.tsx`)

**Current State**:
- Grouped by engine type with CollapsibleSection
- AnimatePresence for filtering transitions
- Empty state messaging

**Brutalist Enhancements**:
```typescript
// Section headers - bold, collapsible
<div className="neo-border neo-rounded p-3 cursor-pointer neo-hover">
  <div className="flex items-center justify-between">
    <div className="flex items-center gap-3">
      <div className={cn(
        "w-3 h-3 neo-rounded",
        `bg-${engineColors[engineType]}`
      )} />
      <h3 className="font-bold uppercase text-sm">
        {engineLabels[engineType]}
      </h3>
      <Badge className="neo-border neo-badge">
        {conns.length}
      </Badge>
    </div>
    <ChevronDown className={cn(
      "transition-transform",
      isOpen && "rotate-180"
    )} />
  </div>
</div>

// Empty state - bold messaging
<div className="neo-border neo-rounded-lg p-8 text-center border-dashed">
  <p className="font-semibold text-muted-foreground">
    No connections match current filters
  </p>
</div>
```

**Performance**:
- AnimatePresence with neo-shadow transitions
- Stagger animations for card appearance

**Impact**: Medium - Container for ConnectionCards
**Effort**: 1-2 hours

---

### 1.6 AnnotationsList (`AnnotationsList.tsx`)

**Current State**:
- Cards with colored left border (4px)
- Inline edit mode with Textarea
- Badge for tags
- Pencil/Delete icons on hover
- "In view" badge for visible annotations

**Brutalist Enhancements**:
```typescript
// Annotation card - bold left accent with shadow
<Card className={cn(
  "neo-border border-l-4 neo-shadow",
  "cursor-pointer neo-hover group",
  colorBorderClass,  // Left border color
  isVisible && "neo-bg-primary/10 border-primary"
)}>

// Tag badges - bold, colorful
{contentData.tags.map(tag => (
  <Badge className="neo-border neo-badge neo-bg-accent">
    {tag}
  </Badge>
))}

// "In view" indicator - bold, prominent
{isVisible && (
  <Badge className="neo-border neo-bg-primary text-white font-bold animate-pulse">
    IN VIEW
  </Badge>
)}

// Edit button - appears on hover with bold styling
<Button className={cn(
  "neo-border-sm neo-shadow-sm",
  "opacity-0 group-hover:opacity-100 transition-all"
)}>
  <Pencil className="h-4 w-4" />
</Button>

// Edit mode textarea - bold border
<Textarea className="neo-border neo-rounded focus:neo-border-primary" />

// Color selector in edit mode - bold swatches
<div className="flex gap-2">
  {colors.map(c => (
    <button
      className={cn(
        "neo-border neo-rounded w-8 h-8",
        editColor === c && "ring-4 ring-foreground scale-110"
      )}
      style={{ backgroundColor: c.value }}
    />
  ))}
</div>

// Save/Cancel buttons - bold CTAs
<Button className="neo-border neo-shadow-sm neo-bg-secondary">
  <Save /> Save
</Button>
<Button className="neo-border neo-hover bg-background">
  <X /> Cancel
</Button>
```

**Scroll Behavior**:
- Bold highlight for scroll-into-view
- Smooth animation with shadow transition

**Impact**: High - Primary annotation management
**Effort**: 2-3 hours

---

### 1.7 ConnectionFilters (`ConnectionFilters.tsx`)

**Current State**:
- Engine toggles (checkbox style)
- Strength threshold slider
- Compact, minimal styling

**Brutalist Enhancements**:
```typescript
// Filter container - bold section
<div className="neo-border-sm p-4 bg-muted/30">
  <h4 className="font-bold uppercase text-sm mb-3">Filters</h4>

  // Engine toggles - bold checkbox style
  <div className="space-y-2">
    {engines.map(engine => (
      <label className="flex items-center gap-2 cursor-pointer group">
        <div className={cn(
          "neo-border neo-rounded w-5 h-5 flex items-center justify-center",
          "transition-all group-hover:scale-110",
          enabled && "neo-bg-primary"
        )}>
          {enabled && <Check className="h-3 w-3 text-white" />}
        </div>
        <span className="text-sm font-medium">{engine.label}</span>
      </label>
    ))}
  </div>

  // Strength slider - bold track with handle
  <div className="mt-4">
    <div className="flex items-center justify-between mb-2">
      <label className="text-sm font-bold">Strength Threshold</label>
      <span className="neo-border neo-badge px-2 py-1">
        {(threshold * 100).toFixed(0)}%
      </span>
    </div>
    <div className="neo-border neo-rounded h-3 bg-muted relative">
      <div
        className="absolute inset-0 neo-bg-primary transition-all"
        style={{ width: `${threshold * 100}%` }}
      />
      <div
        className="absolute top-1/2 -translate-y-1/2 neo-border neo-shadow-sm bg-background w-6 h-6 neo-rounded cursor-grab active:cursor-grabbing"
        style={{ left: `calc(${threshold * 100}% - 12px)` }}
      />
    </div>
  </div>
</div>
```

**Impact**: Medium - Controls connection display
**Effort**: 1-2 hours

---

### 1.8 Supporting Components

**CollapsibleSection** - Bold expand/collapse
**ChunkQualityPanel** - Confidence indicators with bold styling
**SparksTab** - Quick captures with brutalist cards
**TuneTab** - Engine weight sliders with bold styling
**AnnotationReviewTab** - Recovery results with bold status

**Total Effort**: 2-3 hours for all supporting components

---

## Part 2: Implementation Strategy

### Phase 1: Foundation (2-3 hours)

**Goals**:
- Apply brutalist styling to DocumentHeader
- Test shadow/border performance with Framer Motion
- Establish pattern for hover states

**Tasks**:
1. Update DocumentHeader with neo-border, neo-shadow classes
2. Restyle buttons (Obsidian controls, view mode toggles)
3. Bold badge for chunker type
4. Test animation performance

**Validation**:
- Header looks bold and distinctive
- Buttons have satisfying hover feedback
- No layout shift from shadow offset

---

### Phase 2: QuickCapturePanel (2-3 hours)

**Goals**:
- Bold, tactile annotation creation
- Maintain portal positioning accuracy
- Enhance color picker with bold swatches

**Tasks**:
1. Apply neo-card styling to panel container
2. Bold color buttons with ring focus
3. Neo-shadow on drag handle
4. Bold Save/Delete buttons
5. Test portal positioning with shadow offset

**Validation**:
- Panel feels solid and responsive
- Dragging has clear visual feedback
- Color selection is bold and clear
- Shadow doesn't break positioning

---

### Phase 3: RightPanel & Tabs (2-3 hours)

**Goals**:
- Bold tab selection with translation
- Smooth collapse animation with shadow
- Badge numbers pop with bold styling

**Tasks**:
1. Neo-border on panel container
2. Bold tab buttons with active state
3. Badge styling with neo-border
4. Collapse button with floating shadow
5. Test AnimatePresence with brutalist transitions

**Validation**:
- Tab switching feels responsive
- Active tab is clearly highlighted
- Collapse animation is smooth
- Badges are prominent but not distracting

---

### Phase 4: ConnectionCard & ConnectionsList (3-4 hours)

**Goals**:
- Bold connection cards with feedback colors
- Keyboard validation with visual punch
- Smooth re-ranking animations

**Tasks**:
1. ConnectionCard with neo-border, neo-shadow
2. Colored shadows for validation feedback
3. Bold progress bar with flat fill
4. Engine badge with strategic color
5. CollapsibleSection headers with bold styling
6. Test keyboard shortcuts with visual feedback

**Validation**:
- Connections feel substantial and clickable
- Validation feedback is immediate and clear
- Progress bars are bold and readable
- Re-ranking animations are smooth

---

### Phase 5: AnnotationsList (2-3 hours)

**Goals**:
- Bold annotation cards with edit mode
- Clear "in view" indicator
- Smooth scroll-into-view

**Tasks**:
1. Annotation card with neo-border, colored left accent
2. Bold "In view" badge with pulse
3. Edit mode with bold color swatches
4. Save/Cancel buttons with neo-styling
5. Test scroll behavior with animations

**Validation**:
- Annotations are easy to scan
- Edit mode is clear and functional
- Visible annotations stand out
- Scroll behavior is smooth

---

### Phase 6: Filters & Supporting Components (2-3 hours)

**Goals**:
- Bold filter controls
- Clean supporting component styling
- Consistent brutalist language

**Tasks**:
1. ConnectionFilters with bold checkboxes
2. Strength slider with bold track/handle
3. ChunkQualityPanel indicators
4. SparksTab card styling
5. TuneTab slider styling
6. AnnotationReviewTab status indicators

**Validation**:
- Filters are clear and tactile
- Sliders feel responsive
- All components match brutalist aesthetic

---

## Part 3: Design Specifications

### 3.1 Border Standards

```css
/* Default border for all interactive elements */
.neo-border {
  border: 3px solid hsl(var(--foreground));
}

/* Small border for compact elements */
.neo-border-sm {
  border: 2px solid hsl(var(--foreground));
}

/* Large border for emphasis */
.neo-border-lg {
  border: 4px solid hsl(var(--foreground));
}
```

**Usage**:
- Cards: `neo-border` (3px)
- Buttons: `neo-border` (3px)
- Inputs: `neo-border` (3px)
- Icons: `neo-border-sm` (2px)
- Headers: `neo-border-lg` (4px bottom border)

---

### 3.2 Shadow Standards

```css
/* Standard shadow for cards and panels */
.neo-shadow {
  box-shadow: 6px 6px 0px 0px hsl(var(--foreground));
}

/* Small shadow for compact elements */
.neo-shadow-sm {
  box-shadow: 4px 4px 0px 0px hsl(var(--foreground));
}

/* Large shadow for prominent elements */
.neo-shadow-lg {
  box-shadow: 8px 8px 0px 0px hsl(var(--foreground));
}

/* Colored shadows for strategic emphasis */
.neo-shadow-primary {
  box-shadow: 6px 6px 0px 0px hsl(var(--neo-primary));
}
.neo-shadow-danger {
  box-shadow: 6px 6px 0px 0px hsl(var(--neo-danger));
}
.neo-shadow-warning {
  box-shadow: 6px 6px 0px 0px hsl(var(--neo-warning));
}
```

**Usage**:
- Cards: `neo-shadow` (6px)
- Buttons: `neo-shadow-sm` (4px)
- Panels: `neo-shadow-lg` (8px)
- Validation feedback: Colored shadows

---

### 3.3 Hover Behavior

```css
/* Standard hover with translation */
.neo-hover {
  transition: all 0.15s ease;
  cursor: pointer;
}

.neo-hover:hover {
  transform: translate(4px, 4px);
  box-shadow: 2px 2px 0px 0px hsl(var(--foreground));
}

.neo-hover:active {
  transform: translate(6px, 6px);
  box-shadow: 0px 0px 0px 0px hsl(var(--foreground));
}
```

**Usage**:
- Apply to all clickable cards
- Buttons get same translation
- Reduced shadow on hover creates "press" effect

---

### 3.4 Color Strategy

**Strategic Color Only**:
- ✅ Validation badges (green, red, yellow for validate/reject/star)
- ✅ Status indicators (blue processing, green complete, red failed)
- ✅ Tag pills (accent colors per category)
- ✅ Progress bars (primary color fill)
- ✅ Difficulty badges (hard/medium/easy)

**Avoid Color**:
- ❌ Document background (keep flat white/dark)
- ❌ Card backgrounds (use semantic bg-background)
- ❌ Decorative borders (use foreground color)
- ❌ Text content (use semantic text colors)

---

### 3.5 Typography

**Headers**:
```typescript
className="text-xl font-bold uppercase tracking-wide"
```

**Body Text**:
```typescript
className="text-sm font-medium"  // Slightly bolder than normal
```

**Labels**:
```typescript
className="text-xs font-bold uppercase"
```

**Monospace** (for stats, numbers):
```typescript
className="font-mono font-bold text-lg"
```

---

## Part 4: Animation Guidelines

### 4.1 Framer Motion Transitions

```typescript
// Card hover - spring physics
<motion.div
  whileHover={{
    scale: 1.02,
    x: 4,
    y: 4,
    boxShadow: "2px 2px 0px 0px hsl(var(--foreground))"
  }}
  transition={{
    type: "spring",
    stiffness: 400,
    damping: 25
  }}
>
```

### 4.2 AnimatePresence Patterns

```typescript
// Connections re-ranking
<AnimatePresence mode="popLayout">
  {connections.map(conn => (
    <motion.div
      key={conn.id}
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{
        layout: { type: "spring", damping: 25, stiffness: 300 },
        opacity: { duration: 0.2 }
      }}
    />
  ))}
</AnimatePresence>
```

### 4.3 Shadow Transitions

```typescript
// Smooth shadow change on state update
className="transition-all duration-200"
style={{
  boxShadow: feedbackType === 'validate'
    ? '6px 6px 0px 0px hsl(var(--neo-secondary))'
    : '6px 6px 0px 0px hsl(var(--foreground))'
}}
```

---

## Part 5: Performance Considerations

### 5.1 Shadow Rendering

**Issue**: Hard shadows with 6px offset can trigger repaints
**Solution**: Use GPU-accelerated transforms for hover
**Implementation**:
```css
.neo-hover:hover {
  transform: translate(4px, 4px);  /* GPU accelerated */
  box-shadow: 2px 2px 0px 0px hsl(var(--foreground));
}
```

### 5.2 Animation Budget

**Target**: 60fps for all interactions
**Monitoring**:
```typescript
const startTime = performance.now()
// ... animation logic
const duration = performance.now() - startTime
if (duration > 16.67) {  // 60fps = 16.67ms per frame
  console.warn('Animation frame budget exceeded:', duration)
}
```

### 5.3 Layout Shift Prevention

**Issue**: Shadow offset can cause layout shift
**Solution**: Add padding/margin compensation
```typescript
// Add shadow offset to right/bottom margin
className="mr-[6px] mb-[6px]"  // Compensate for 6px shadow
```

---

## Part 6: Testing Strategy

### 6.1 Visual Testing

**Checklist**:
- [ ] All borders are 3px (or 2px/4px for variants)
- [ ] All shadows are hard offset (no blur)
- [ ] Hover states translate and reduce shadow
- [ ] Active states have clear visual feedback
- [ ] Colors are strategic (badges, status, validation)
- [ ] Typography is bold and readable
- [ ] Spacing is generous (not cramped)

### 6.2 Interaction Testing

**Keyboard Navigation**:
- [ ] Tab order is logical
- [ ] Focus states are bold and visible
- [ ] Keyboard shortcuts (v/r/s) have visual feedback
- [ ] Enter/Escape work as expected

**Mouse Interaction**:
- [ ] Hover states feel responsive
- [ ] Click targets are large enough (min 44px)
- [ ] Dragging (QuickCapturePanel) feels natural
- [ ] Scroll behavior is smooth

### 6.3 Accessibility Testing

**WCAG 2.1 AA Compliance**:
- [ ] Color contrast ≥ 4.5:1 for text
- [ ] Color contrast ≥ 3:1 for UI components
- [ ] Focus indicators visible (3px outline)
- [ ] Touch targets ≥ 44x44px
- [ ] No animation-only information
- [ ] Keyboard accessible

### 6.4 Performance Testing

**Metrics**:
- [ ] ConnectionsList re-ranking: <100ms
- [ ] RightPanel collapse: 60fps
- [ ] QuickCapturePanel drag: 60fps
- [ ] AnimatePresence transitions: smooth
- [ ] No layout thrashing on scroll

---

## Part 7: Migration Checklist

### 7.1 Component-by-Component

- [ ] **DocumentHeader.tsx** - Bold header, buttons, badges
- [ ] **QuickCapturePanel.tsx** - Bold panel, color picker, buttons
- [ ] **RightPanel.tsx** - Bold tabs, collapse button, badges
- [ ] **ConnectionCard.tsx** - Bold card, progress, validation
- [ ] **ConnectionsList.tsx** - Bold sections, empty state
- [ ] **AnnotationsList.tsx** - Bold cards, edit mode, badges
- [ ] **ConnectionFilters.tsx** - Bold checkboxes, slider
- [ ] **CollapsibleSection.tsx** - Bold headers, expand icon
- [ ] **ChunkQualityPanel.tsx** - Bold confidence indicators
- [ ] **SparksTab.tsx** - Bold spark cards
- [ ] **TuneTab.tsx** - Bold sliders, labels
- [ ] **AnnotationReviewTab.tsx** - Bold status indicators

### 7.2 Cross-Component Consistency

- [ ] All cards use neo-border + neo-shadow
- [ ] All buttons use neo-button pattern
- [ ] All badges use neo-badge pattern
- [ ] All hover states use neo-hover
- [ ] All focus states use 3px outline
- [ ] All animations use spring physics

### 7.3 Dark Mode Testing

- [ ] Shadows invert correctly (background color)
- [ ] Colors adjust for dark mode
- [ ] Borders remain visible
- [ ] Hover states work in dark mode
- [ ] Focus indicators visible in dark mode

---

## Part 8: Rollout Strategy

### Phase 1: Prototype (Week 1)
- Apply to DocumentHeader only
- Test with real document
- Get user feedback on bold aesthetic
- Adjust if needed

### Phase 2: Core Components (Week 1-2)
- QuickCapturePanel (most used)
- ConnectionCard & ConnectionsList
- AnnotationsList

### Phase 3: Supporting Components (Week 2)
- RightPanel tabs
- ConnectionFilters
- All other sidebar components

### Phase 4: Polish & Refinement (Week 2-3)
- Animation tuning
- Performance optimization
- Accessibility audit
- User testing

---

## Part 9: Success Criteria

### Visual Goals
- [ ] Reader has **distinctive brutalist identity**
- [ ] Borders are **bold and visible** (3px standard)
- [ ] Shadows create **clear depth** (6px offset)
- [ ] Hover states are **satisfying and tactile**
- [ ] Color is **strategic and meaningful** (not decorative)

### Functional Goals
- [ ] **No regressions** - all features work as before
- [ ] **Performance maintained** - 60fps interactions
- [ ] **Accessibility preserved** - WCAG 2.1 AA compliance
- [ ] **Dark mode works** - shadows, colors, borders

### User Experience Goals
- [ ] **Easier to scan** - bold structure aids navigation
- [ ] **More engaging** - tactile interactions feel rewarding
- [ ] **Clearer hierarchy** - important elements stand out
- [ ] **Distinctive identity** - Rhizome looks unique

---

## Part 10: Known Challenges & Solutions

### Challenge 1: Shadow Layout Shift
**Problem**: 6px shadow creates layout shift on hover
**Solution**: Pre-allocate space with margin compensation
```css
.neo-card {
  margin-right: 6px;
  margin-bottom: 6px;
}
```

### Challenge 2: Portal Positioning
**Problem**: QuickCapturePanel shadow affects portal positioning
**Solution**: Adjust position calculation to account for shadow
```typescript
const style = {
  top: rect.bottom + 10 + 6,  // +6 for shadow offset
  left: rect.left + rect.width / 2
}
```

### Challenge 3: Animation Performance
**Problem**: Multiple shadows animating simultaneously
**Solution**: Use transform instead of box-shadow for animation
```css
.neo-hover:hover {
  transform: translate(4px, 4px);  /* Fast */
  /* Not: box-shadow animation (slow) */
}
```

### Challenge 4: Framer Motion Conflicts
**Problem**: Neo-shadow + Framer Motion whileHover
**Solution**: Combine in single motion config
```typescript
<motion.div
  className="neo-border neo-shadow"
  whileHover={{
    x: 4,
    y: 4,
    boxShadow: "2px 2px 0px 0px hsl(var(--foreground))"
  }}
/>
```

---

## Conclusion

This plan transforms the Rhizome reader from subtle and minimal to **bold and distinctive** while maintaining:
- ✅ Full functionality (no regressions)
- ✅ Excellent performance (60fps)
- ✅ Accessibility compliance (WCAG 2.1 AA)
- ✅ Dark mode support

**Total Effort**: 12-16 hours over 2 weeks
**Risk Level**: Low (CSS-only, no logic changes)
**Impact**: High (distinctive visual identity)

**Next Steps**:
1. Review this plan for approval
2. Start with Phase 1 (DocumentHeader prototype)
3. Get user feedback on bold aesthetic
4. Continue with Phases 2-4 if approved

---

**Last Updated**: 2025-01-20 | **Author**: Claude | **Status**: Ready for Implementation
