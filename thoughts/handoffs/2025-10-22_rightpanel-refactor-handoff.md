# RightPanel Neobrutalism Refactor - Session Handoff

**Date**: 2025-10-22
**Session Goal**: Refactor RightPanel to use neobrutalism Sidebar component
**Estimated Duration**: 2-3 hours
**Priority**: High (establishes pattern for all reader UI)

---

## Context & Background

### What Happened Previously

In the initial session, we attempted to implement LeftPanel from scratch using custom framer-motion code. This was a mistake. Key lessons learned:

1. **Don't reinvent components** - Use existing libraries
2. **Use shadcn MCP tools** - Search registries before building
3. **Separate component folders** - `components/ui/` for shadcn, `components/libraries/neobrutalist/` for neobrutalism
4. **Read docs first** - Component documentation shows proper usage

**Decision**: Start with RightPanel refactor instead of LeftPanel implementation.

**Why RightPanel first**:
- Already has 6 working tabs with real functionality
- More complex = better test of neobrutalism Sidebar component
- Patterns proven here can be replicated everywhere
- Lower risk than building greenfield LeftPanel

### Current State

**RightPanel Location**: `src/components/sidebar/RightPanel.tsx`

**Current Implementation**:
- Custom panel with framer-motion collapse animation
- 6 tabs: Connections, Sparks, Flashcards, Tune, Annotations, Quality
- Icon-only tab design in 6-column grid
- Integrated with reader-store, connection-store, ui-store
- Collapse state managed locally with `useState`


---

## Objective

**Goal**: Refactor RightPanel to use neobrutalism `Sidebar` component while preserving ALL existing functionality.

**Success Criteria**:
1. ✅ RightPanel uses `Sidebar` from `@/components/libraries/neobrutalist/sidebar`
2. ✅ All 6 tabs still work (Connections, Sparks, Flashcards, Tune, Annotations, Quality)
3. ✅ Collapse/expand animation works (provided by Sidebar component)
4. ✅ Mobile responsiveness works (Sheet on mobile)
5. ✅ Integration with stores unchanged (reader, connection, ui, annotation)
6. ✅ No functionality lost or broken
7. ✅ Neobrutalist styling applied (bold borders, hard shadows, flat colors)

**Non-Goals** (for this session):
- ❌ Don't add new features
- ❌ Don't change tab functionality
- ❌ Don't refactor tab content components yet (just the shell)

---

## Implementation Strategy

### Phase 1: Analysis (30 min)

**Step 1: Read Current RightPanel Code**
```bash
# Read the current implementation
Read src/components/sidebar/RightPanel.tsx

# Understand:
- How tabs are structured
- How collapse state is managed
- How it integrates with stores
- What props it receives from ReaderLayout
```

**Step 2: Study Neobrutalism Sidebar**
```bash
# Read the sidebar component
Read src/components/libraries/neobrutalist/sidebar.tsx

# Understand:
- SidebarProvider - Context for sidebar state
- Sidebar - Main container
- SidebarContent - Content wrapper
- SidebarHeader/Footer - Optional sections
- SidebarTrigger - Toggle button
```

**Step 3: Study Example Usage**
```bash
# Check neobrutalism docs for usage example
WebFetch https://www.neobrutalism.dev/components/sidebar
  prompt: "Show complete usage example with multiple sections"
```

**Step 4: Plan Component Structure**
```
RightPanel (refactored):
├── SidebarProvider (from brutalist)
│   └── Sidebar (side="right")
│       ├── SidebarHeader
│       │   └── Tabs navigation (6 icon buttons)
│       └── SidebarContent
│           ├── ConnectionsTab content
│           ├── SparksTab content
│           ├── FlashcardsTab content
│           ├── TuneTab content
│           ├── AnnotationsTab content
│           └── QualityTab content
```

### Phase 2: Refactor Shell (1 hour)

**Step 1: Update Imports**
```typescript
// OLD
import { motion, AnimatePresence } from 'framer-motion'

// NEW
import {
  Sidebar,
  SidebarProvider,
  SidebarContent,
  SidebarHeader,
  SidebarTrigger,
  useSidebar
} from '@/components/libraries/neobrutalist/sidebar'
```

**Step 2: Replace Container**
```typescript
// OLD
<motion.div className="fixed right-0 top-14..." animate={{ width: collapsed ? 56 : 384 }}>

// NEW
<SidebarProvider>
  <Sidebar side="right" collapsible="offcanvas">
    {/* content */}
  </Sidebar>
</SidebarProvider>
```

**Step 3: Migrate Collapse State**
```typescript
// OLD
const [collapsed, setCollapsed] = useState(false)

// NEW - Use sidebar's built-in state
const { open, setOpen, toggleSidebar } = useSidebar()
```

**Step 4: Update Tab Navigation**
```typescript
// Keep existing tab logic but apply neobrutalist styling
// Use SidebarHeader for tab buttons
<SidebarHeader>
  <div className="grid grid-cols-6 gap-1 p-2">
    {TABS.map(tab => (
      <button className="neo-border neo-hover..." />
    ))}
  </div>
</SidebarHeader>
```

**Step 5: Wrap Tab Content**
```typescript
<SidebarContent>
  {activeTab === 'connections' && <ConnectionsTab />}
  {activeTab === 'sparks' && <SparksTab />}
  {/* ... other tabs */}
</SidebarContent>
```

### Phase 3: Test Integration (30 min)

**Step 1: Build Test**
```bash
npx next build --no-lint
# Verify no TypeScript errors
```

**Step 2: Manual Testing Checklist**
- [ ] Panel appears on right side
- [ ] Collapse/expand works smoothly
- [ ] All 6 tabs clickable
- [ ] ConnectionsTab shows connections
- [ ] SparksTab shows sparks
- [ ] FlashcardsTab shows placeholder
- [ ] TuneTab shows engine weights
- [ ] AnnotationsTab shows annotations
- [ ] QualityTab shows quality metrics
- [ ] Mobile: Sheet overlay works
- [ ] View modes: Hidden in Focus mode

**Step 3: Store Integration**
- [ ] reader-store: visibleChunks still passed correctly
- [ ] connection-store: connections still load
- [ ] ui-store: viewMode still controls visibility
- [ ] annotation-store: annotations still display

### Phase 4: Styling Polish (30 min)

**Apply Neobrutalist Styling**:
```typescript
// Tab buttons
className="neo-border neo-shadow neo-hover p-2 rounded"

// Active tab
className="neo-border neo-shadow bg-primary/10 text-primary"

// Panel container
// (Sidebar component handles this automatically)
```

**Verify Design Tokens**:
- Bold borders (3-4px)
- Hard shadows (6px offset, no blur)
- Flat colors (no gradients)
- Bold typography

---

## Critical Files to Understand

### 1. Current RightPanel
**Path**: `src/components/sidebar/RightPanel.tsx`

**Key Sections**:
- Tab definitions (TABS array)
- State management (activeTab, collapsed)
- Store integrations (useReaderStore, useConnectionStore, etc.)
- Tab content rendering (ConnectionsTab, SparksTab, etc.)

### 2. Tab Components (Don't change yet)
**Locations**:
- `src/components/sidebar/ConnectionsTab.tsx`
- `src/components/sidebar/SparksTab.tsx`
- `src/components/sidebar/FlashcardsTab.tsx`
- `src/components/sidebar/TuneTab.tsx`
- `src/components/sidebar/AnnotationsTab.tsx`
- `src/components/sidebar/QualityTab.tsx`

**Note**: Keep these unchanged for now. Only refactor the RightPanel shell.

---

## Common Pitfalls to Avoid

### 1. Import Path Mistakes
❌ `from '@/components/ui/sidebar'` (wrong - this is shadcn)
✅ `from '@/components/libraries/neobrutalist/sidebar'` (correct - neobrutalism)

### 2. State Management
❌ Keeping custom `useState` for collapse
✅ Use `useSidebar()` hook from component

### 3. Breaking Store Integration
❌ Changing prop names that stores expect
✅ Keep all existing props, just wrap in Sidebar component

### 4. Over-Refactoring
❌ Trying to refactor tab content components too
✅ Focus on shell only - tabs can be updated later

### 5. Missing Mobile Support
❌ Only testing desktop collapse
✅ Test mobile Sheet overlay (Sidebar handles this automatically)

---

## Reference Documentation

### Neobrutalism Component Docs
- Sidebar: https://www.neobrutalism.dev/components/sidebar
- Installation: https://www.neobrutalism.dev/docs/installation
- Styling: https://www.neobrutalism.dev/styling

### Internal Docs
- Component Usage Rules: `CLAUDE.md` (section: "Component Usage Rules")
- Lessons Learned: `thoughts/plans/2025-10-22_LESSONS_LEARNED.md`
- Original Plan: `thoughts/plans/2025-10-22_reader-neobrutalism-implementation.md` (paused)

### Store Documentation
- Reader Store: `src/stores/reader-store.ts`
- Connection Store: `src/stores/connection-store.ts`
- UI Store: `src/stores/ui-store.ts`
- Annotation Store: `src/stores/annotation-store.ts`

---

## Expected Outcome

**Before** (Current):
- Custom framer-motion panel
- ~200 lines of custom collapse logic
- Custom animation configuration
- Manual mobile handling

**After** (Refactored):
- Neobrutalism Sidebar component
- ~100 lines (50% reduction)
- Built-in collapse/animation/mobile
- Consistent neobrutalist styling

**Benefits**:
- Less code to maintain
- Mobile responsive out of the box
- Consistent with future LeftPanel
- Bold neobrutalist aesthetic
- Proven component patterns

---

## Next Steps After Completion

1. ✅ Verify all RightPanel functionality works
2. ✅ Document refactor patterns used
3. ✅ Update LESSONS_LEARNED.md with success notes
4. 🔄 Apply same pattern to LeftPanel implementation
5. 🔄 Revisit original plan and update phases
6. 🔄 Continue with session tracking, stats, etc.

---

## Session Starter Checklist

Before starting refactor:
- [ ] Read this handoff completely
- [ ] Review `CLAUDE.md` Component Usage Rules
- [ ] Review `LESSONS_LEARNED.md`
- [ ] Read current `RightPanel.tsx` implementation
- [ ] Read `sidebar.tsx` from brutalist components
- [ ] Check neobrutalism sidebar docs
- [ ] Understand the goal: Shell refactor only, preserve all functionality

**Ready to start? Begin with Phase 1: Analysis**
