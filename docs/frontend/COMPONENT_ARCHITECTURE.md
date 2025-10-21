# Rhizome V2 Frontend Component Architecture Exploration

**Date**: October 19, 2025  
**Scope**: `src/components/` directory (58 component files)  
**Exploration Level**: Very thorough  
**Analysis**: Architecture, patterns, dependencies, styling approaches

---

## 1. COMPONENT ORGANIZATION OVERVIEW

### Directory Structure

```
src/components/
├── admin/                    # Admin Panel & Operations (8 files)
│   ├── AdminPanel.tsx       # Main admin container (Sheet wrapper)
│   ├── JobList.tsx          # Job display/control
│   ├── ConflictResolutionDialog.tsx
│   ├── KeyboardShortcutsDialog.tsx
│   ├── tabs/
│   │   ├── ScannerTab.tsx   # Storage vs DB comparison
│   │   ├── ImportTab.tsx    # Import with conflict resolution
│   │   ├── ExportTab.tsx    # ZIP export
│   │   ├── ConnectionsTab.tsx # Connection reprocessing
│   │   ├── IntegrationsTab.tsx # Obsidian/Readwise
│   │   ├── JobsTab.tsx      # Job history & control
│   │   └── index.ts         # Barrel export
│   └── __tests__/           # Test files
│
├── reader/                  # Document Reading UI (15 files)
│   ├── ReaderLayout.tsx     # Main orchestrator (4 Zustand stores)
│   ├── VirtualizedReader.tsx # Virtuoso-based rendering
│   ├── DocumentViewer.tsx   # Content wrapper
│   ├── DocumentHeader.tsx   # Title + metadata + Obsidian controls
│   ├── BlockRenderer.tsx    # Individual block rendering (memo)
│   ├── ConnectionHeatmap.tsx # Left margin density visualization
│   ├── QuickCapturePanel.tsx # Annotation creation (portal-based)
│   ├── QuickSparkCapture.tsx # ⌘K quick capture
│   ├── CorrectionModePanel.tsx # Chunk position correction
│   ├── CorrectionConfirmDialog.tsx
│   ├── ChunkMetadataIcon.tsx # Chunk boundary indicators
│   ├── AnnotationsDebugPanel.tsx
│   └── KeyboardHelp.tsx     # Hotkey documentation
│
├── sidebar/                 # Right Panel Components (14 files)
│   ├── RightPanel.tsx       # 7-tab icon UI
│   ├── ConnectionsList.tsx  # Visible chunks connections
│   ├── ConnectionCard.tsx   # Individual connection (v/r/s feedback)
│   ├── ConnectionFilters.tsx # Engine/threshold controls
│   ├── AnnotationsList.tsx  # Document annotations
│   ├── AnnotationReviewTab.tsx # Recovery review UI
│   ├── SparksTab.tsx        # Quick annotations
│   ├── FlashcardsTab.tsx    # Study system (placeholder)
│   ├── TuneTab.tsx          # Engine weights
│   ├── WeightTuning.tsx     # Slider controls
│   ├── ChunkQualityPanel.tsx # Confidence indicators
│   ├── CollapsibleSection.tsx # Reusable collapsible
│   └── WeightConfig.tsx     # Preferences
│
├── layout/                  # Navigation & Persistent UI (6 files)
│   ├── AppShell.tsx         # Global container (hotkey handler)
│   ├── TopNav.tsx           # Header navigation
│   ├── Navigation.tsx       # Mobile menu
│   └── ProcessingDock.tsx   # Active jobs display (bottom-right)
│
├── ui/                      # Shadcn/UI Components (31 files)
│   ├── button.tsx, card.tsx, badge.tsx
│   ├── dialog.tsx, sheet.tsx, dropdown-menu.tsx
│   ├── tabs.tsx, accordion.tsx, collapsible.tsx
│   ├── scroll-area.tsx, table.tsx
│   ├── input.tsx, textarea.tsx, label.tsx
│   ├── checkbox.tsx, radio-group.tsx, switch.tsx
│   ├── select.tsx, command.tsx, popover.tsx
│   ├── progress.tsx, slider.tsx, toggle.tsx, toggle-group.tsx
│   ├── tooltip.tsx, hover-card.tsx
│   ├── skeleton.tsx, separator.tsx, alert.tsx
│   └── (all use Radix UI primitives + Tailwind)
│
├── library/                 # Document Management (2 files)
│   ├── UploadZone.tsx       # Multi-method upload interface
│   └── DocumentList.tsx     # Document grid/table
│
├── upload/                  # Upload Utilities (1 file)
│   └── DocumentPreview.tsx  # Metadata preview before upload
│
├── preferences/             # User Settings (1 file)
│   └── WeightConfig.tsx     # Engine weight preferences
│
├── design/                  # Design System & Experiments (17 files)
│   ├── (Experimental UI patterns - NOT in production use)
│   ├── (Examples: BrutalistComponents, TacticalComponents, etc.)
│   └── (Ignored per exploration scope)
└── (end structure)
```

### File Count Summary

| Category | Count | Notes |
|----------|-------|-------|
| **Total Components** | 58 | Active production components |
| **Reader** | 15 | Document viewing & annotations |
| **Sidebar** | 14 | Connection/annotation display |
| **Admin** | 8 | Panel tabs & controls |
| **UI (shadcn)** | 31 | Radix UI primitives |
| **Layout** | 6 | Navigation & persistent UI |
| **Library** | 2 | Document upload/list |
| **Upload** | 1 | Preview utilities |
| **Preferences** | 1 | Settings |
| **Design** | 17 | Experimental (ignored) |

---

## 2. SHADCN/UI COMPONENT USAGE

### Components Using shadcn/ui

All 31 shadcn/ui components are installed via `npx shadcn@latest add <component>`:

```typescript
// Pattern: All components from src/components/ui/ use Radix UI + Tailwind
import { Button } from '@/components/ui/button'      // Radix Slot + CVA
import { Card, CardHeader, CardContent } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import { ScrollArea } from '@/components/ui/scroll-area'
```

### Integration Pattern

**shadcn/ui**: Primary foundation for all structured UI
- Used in 72 imports across application
- Provides consistent Radix UI primitives
- All components use `cn()` utility for class merging
- CVA (Class Variance Authority) for variant management

### Custom Implementations

**Reader Components**: Heavy custom logic with shadcn/ui integration
- `BlockRenderer.tsx` - Custom markdown + annotation injection
- `VirtualizedReader.tsx` - Virtuoso + custom block management
- `QuickCapturePanel.tsx` - Portal-based draggable panel

**Sidebar Components**: Mostly composition of shadcn/ui
- `ConnectionCard.tsx` - Card + Badge + Progress + custom styling
- `RightPanel.tsx` - Sheet + Tabs + motion animations
- `AnnotationsList.tsx` - Custom list with Edit mode

**Admin Components**: Heavy use of shadcn/ui primitives
- `AdminPanel.tsx` - Sheet + Tabs (6 tabs)
- Tab contents mix shadcn/ui (Table, Card) with custom logic

---

## 3. STYLING APPROACHES

### Tailwind CSS (Primary)

**All components use Tailwind with these patterns:**

```typescript
// 1. Direct Tailwind classes
className="flex flex-col h-screen gap-2 p-4"

// 2. cn() utility for conditional merging
className={cn(
  "base classes",
  isActive ? "active-classes" : "inactive-classes",
  className // Allow override
)}

// 3. Data attributes for styling
data-slot="button"  // Used for Radix integration

// 4. Dark mode support
className="dark:bg-gray-800 dark:text-white"
```

### CSS Variables (Design System)

Defined in Tailwind config:

```css
--primary, --primary-foreground
--secondary, --secondary-foreground
--muted, --muted-foreground
--accent, --accent-foreground
--destructive
--card, --card-foreground
--popover, --popover-foreground
--border, --background
```

### Inline Styles (Motion + Dynamics)

```typescript
// Motion animations
style={{
  backgroundColor: intensityColor,
  top: `${point.position}%`,
}}

// Calculated positions
style={
  calculatedPosition !== undefined
    ? { top: `${calculatedPosition}px` }
    : undefined
}
```

### CVA (Class Variance Authority)

Used in shadcn/ui components:

```typescript
// src/components/ui/button.tsx
const buttonVariants = cva(
  "base classes",
  {
    variants: {
      variant: {
        default: "...",
        outline: "...",
        ghost: "...",
      },
      size: {
        sm: "...",
        default: "...",
        lg: "...",
      }
    }
  }
)

// Usage
<Button variant="outline" size="sm" />
```

### Motion & Framer Motion

```typescript
import { motion, AnimatePresence } from 'framer-motion'

// Used in:
// - RightPanel - collapse/expand animation (spring physics)
// - ConnectionHeatmap - hover scale effects
// - ConnectionsList - AnimatePresence for transitions

<motion.div
  animate={{ width: collapsed ? 48 : 384 }}
  transition={{ type: 'spring', damping: 25, stiffness: 300 }}
/>

<motion.button
  whileHover={{ scale: 1.05 }}
  whileTap={{ scale: 0.95 }}
/>
```

### Typography

**Prose classes** for markdown rendering:

```typescript
const proseClass = block.type === 'code'
  ? 'not-prose'
  : 'prose prose-sm lg:prose-base dark:prose-invert'
```

---

## 4. COMPONENT PATTERNS & PATTERNS

### 4.1 Client vs Server Components

**All active components are Client Components** (`'use client'`)

| Type | Count | Usage |
|------|-------|-------|
| Client | 58 | All reader, sidebar, admin, layout |
| Server | 0 | None in this directory |

**Reason**: Interactive features (hooks, event handlers, Zustand stores)

### 4.2 React Hooks Patterns

**High usage of optimized hooks** (138 occurrences):

| Hook | Uses | Pattern |
|------|------|---------|
| `useState` | Extensive | Local UI state (collapsed, editing, etc.) |
| `useCallback` | Heavy | Memoized event handlers for performance |
| `useMemo` | Heavy | Expensive calculations (filtering, sorting) |
| `useEffect` | Moderate | Side effects (fetch, setup/cleanup) |
| `useRef` | Heavy | DOM access (Virtuoso, portals, scroll) |
| `memo()` | 3 cases | `BlockRenderer.tsx` + custom |

### 4.3 Memoization for Performance

```typescript
// Pattern 1: React.memo for pure components
export const BlockRenderer = memo(function BlockRenderer({...}) {
  // BlockRenderer memoized - only re-renders on annotation changes
})

// Pattern 2: useMemo for calculations
const blocks = useMemo(() => {
  return parseMarkdownToBlocks(markdown, chunks)
}, [markdown, chunks])

// Pattern 3: useCallback for event handlers
const handleNavigateToChunk = useCallback((chunkId: string) => {
  // Implementation
}, [chunks, setCorrectionModeStore, setScrollToChunkId])
```

**Critical Usage:**
- `VirtualizedReader`: useCallback + useMemo for scroll performance
- `BlockRenderer`: memo() prevents re-renders during virtualization
- `ConnectionsList`: useMemo for re-ranking connections (real-time filtering)

### 4.4 Store Integration (Zustand)

**4 Zustand stores** in active use:

```typescript
// Pattern: Store-first architecture
const markdown = useReaderStore(state => state.markdownContent)
const chunks = useReaderStore(state => state.chunks)
const annotations = useAnnotationStore(state => state.annotations[documentId])
const weights = useConnectionStore(state => state.weights)
const viewMode = useUIStore(state => state.viewMode)

// Pattern: Prop-free component initialization
export function VirtualizedReader() {
  // No props - reads directly from ReaderStore
  const markdown = useReaderStore(state => state.markdownContent)
  const chunks = useReaderStore(state => state.chunks)
}
```

**Store Usage by Component:**

| Store | Components | Purpose |
|-------|-----------|---------|
| **ReaderStore** | ReaderLayout, VirtualizedReader, BlockRenderer | Document + scroll state |
| **ConnectionStore** | RightPanel, ConnectionsList, TuneTab | Weights + filtering |
| **AnnotationStore** | VirtualizedReader, AnnotationsList, QuickCapturePanel | Annotation persistence |
| **UIStore** | ReaderLayout, VirtualizedReader, QuickSparkCapture | View modes + UI state |
| **AdminPanelStore** | AdminPanel, AppShell | Admin panel open/tab |
| **BackgroundJobsStore** | ProcessingDock, UploadZone | Job tracking |

### 4.5 Keyboard Hotkey Patterns

Multiple components implement hotkey handlers:

```typescript
// Pattern 1: Global hotkeys via useHotkeys()
useHotkeys('mod+shift+a', (e) => {
  e.preventDefault()
  toggle()  // Toggle admin panel
})

// Pattern 2: Keyboard in render
useEffect(() => {
  function handleKeyDown(e: KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault()
      openSparkCapture()
    }
  }
  window.addEventListener('keydown', handleKeyDown)
  return () => window.removeEventListener('keydown', handleKeyDown)
}, [])

// Pattern 3: Card-level hotkey feedback
// ConnectionCard shows "Press: v validate • r reject • s star"
// Only active when card is selected
```

### 4.6 Portal-Based Components

```typescript
// QuickCapturePanel uses createPortal for floating UI
import { createPortal } from 'react-dom'

return createPortal(
  <div className="fixed z-50">
    {/* Floating panel content */}
  </div>,
  document.body
)

// Allows dragging + positioning outside normal DOM flow
```

### 4.7 Event Delegation Patterns

```typescript
// BlockRenderer uses event delegation for annotation clicks
const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
  const target = e.target as HTMLElement
  const annotationSpan = target.closest('[data-annotation-id]')
  
  if (annotationSpan) {
    const annotationId = annotationSpan.getAttribute('data-annotation-id')
    onAnnotationClick(annotationId, annotationSpan)
  }
}
```

### 4.8 Virtualization Pattern (Virtuoso)

```typescript
// VirtualizedReader with virtualization
<Virtuoso
  ref={virtuosoRef}
  data={blocks}
  itemContent={(index, block) => <BlockRenderer ... />}
  rangeChanged={handleVisibleRangeChange}
  overscan={2000}
  style={{ height: '100%', width: '100%' }}
/>

// Tracks visible range for connection fetching
// Debounces to prevent query spam during scrolling
```

---

## 5. ARCHITECTURAL PATTERNS

### 5.1 Orchestration Pattern (ReaderLayout)

**ReaderLayout** is the orchestrator for 4 Zustand stores:

```typescript
export function ReaderLayout({ documentId, chunks, annotations, ... }) {
  // 1. Load document into ReaderStore
  useEffect(() => {
    loadDocument(documentId, title, markdown, chunks)
  }, [documentId, ...])

  // 2. Fetch connections when visible chunks change (debounced 300ms)
  useEffect(() => {
    if (visibleChunks.length === 0) return
    setConnections(connections)  // → ConnectionStore
  }, [visibleChunks, ...])

  // 3. Keyboard shortcuts (⌘K for spark, Esc)
  useEffect(() => {
    // ⌘K → openSparkCapture()
    // Esc → closeSparkCapture()
  }, [])

  return (
    <DocumentHeader />
    <DocumentViewer /> {/* Contains VirtualizedReader */}
    <RightPanel /> {/* Reads from ConnectionStore + UIStore */}
    <QuickSparkCapture /> {/* ⌘K popup */}
    <CorrectionModePanel /> {/* Optional correction UI */}
  )
}
```

### 5.2 Persistent UI Philosophy

**No Modals** - uses persistent docks/panels instead:

```typescript
// ✅ Persistent approach
<ProcessingDock />      // Bottom-right dock for active jobs
<RightPanel />          // Collapsible side panel (7 tabs)
<QuickSparkCapture />   // ⌘K quick capture
<AdminPanel />          // Cmd+Shift+A sheet overlay

// ❌ NOT used
// <Dialog> for main workflows
// Modals only for confirmation (CorrectionConfirmDialog)
```

### 5.3 Data Flow Architecture

```
USER ACTION
    ↓
EVENT HANDLER (onClick, onChange)
    ↓
SERVER ACTION (createAnnotation, updateConnection)
    ↓
DATABASE (Supabase)
    ↓
ZUSTAND STORE (optimistic update)
    ↓
COMPONENT RE-RENDER
    ↓
UI UPDATE
```

### 5.4 Annotation Rendering Pipeline

```
1. VirtualizedReader loads annotations from database → AnnotationStore
2. BlockRenderer receives annotations as props
3. injectAnnotations() embeds spans into markdown HTML
4. DOMPurify sanitizes (allows data-annotation-id)
5. dangerouslySetInnerHTML renders with injected spans
6. Event delegation catches annotation clicks → edit mode

// Performance optimized:
// - Memoization prevents re-renders
// - Offset-based visibility detection
// - Debounced connection fetching
```

### 5.5 Right Panel Architecture (7 Tabs)

```typescript
const TABS = [
  { id: 'connections', icon: Network, label: 'Connections' },
  { id: 'annotations', icon: Highlighter, label: 'Annotations' },
  { id: 'quality', icon: CheckCircle, label: 'Quality' },
  { id: 'sparks', icon: Zap, label: 'Sparks' },
  { id: 'cards', icon: Brain, label: 'Cards' },
  { id: 'review', icon: FileQuestion, label: 'Review' },
  { id: 'tune', icon: Sliders, label: 'Tune' }
]

// Collapsible with spring animation
// Icon-only in collapsed state
// Tab content lazy-rendered (only active tab)
// Badges show counts (review tab shows recovery items)
```

---

## 6. ADVANCED TECHNIQUES

### 6.1 DOMPurify Integration

```typescript
// BlockRenderer sanitizes rendered HTML
import DOMPurify from 'dompurify'

const cleanHtml = DOMPurify.sanitize(annotatedHtml, {
  ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'span', 'div', ...],
  ALLOWED_ATTR: ['href', 'data-annotation-id', 'data-annotation-color', ...]
})
```

### 6.2 Offset-Based Visibility Detection

```typescript
// ReaderLayout debounces visible chunks calculation
const handleVisibleRangeChange = (range) => {
  const viewportStart = firstBlock?.startOffset || 0
  const viewportEnd = lastBlock?.endOffset || markdown.length
  
  updateScroll(scrollPosition, { start: viewportStart, end: viewportEnd })
}

// Used for:
// - Fetching connections for visible chunks only
// - AnnotationsList highlighting visible annotations
// - Chunk quality indicators
```

### 6.3 Chunk Position Correction

**CorrectionModePanel** allows fixing chunk boundaries:

```typescript
// 1. Enable correction mode on chunk
setCorrectionMode({ chunkId, chunkIndex, ... })

// 2. User selects corrected text
// 3. calculateOffsetsFromCurrentSelection() gets new offsets
// 4. CorrectionConfirmDialog shows old vs new
// 5. Server action updates chunk metadata
```

### 6.4 Optimistic Updates Pattern

```typescript
// QuickCapturePanel creates annotation with optimistic ID
const tempId = `temp-${Date.now()}`
setOptimisticAnnotations(new Map([...prev, [tempId, annotation]]))

// Server confirms with real ID
// On success: replace temp ID with real ID in UI
// On failure: remove temp annotation and show error
```

### 6.5 Annotation Recovery UI

```typescript
// AnnotationReviewTab displays recovery results
// Shows 3 categories:
// 1. success - annotations found exactly
// 2. needsReview - fuzzy matches for validation
// 3. lost - annotations that couldn't be recovered

// User can:
// - Accept fuzzy match
// - Manually re-highlight
// - Skip recovery
```

---

## 7. SHARED COMPONENT PATTERNS

### 7.1 Card Component (Composition)

```typescript
// Used 20+ times with consistent pattern
<Card>
  <CardHeader>
    <CardTitle>Title</CardTitle>
    <CardDescription>Description</CardDescription>
  </CardHeader>
  <CardContent>Content</CardContent>
  <CardFooter>Actions</CardFooter>
</Card>

// Supports:
// - CardAction (right-aligned slot)
// - Flexible layouts
// - Container queries support
```

### 7.2 ConnectionCard Pattern

```typescript
// Keyboard-driven validation workflow
const [feedbackType, setFeedbackType] = useState<'validate' | 'reject' | 'star'>()

// Hotkey handlers:
// v - validate (green border)
// r - reject (red border)
// s - star (yellow border)

// Shows border color based on feedback
// Optimistic updates to database
```

### 7.3 Tab System Pattern

```typescript
// RightPanel uses Tabs component
<Tabs value={activeTab} onValueChange={setActiveTab}>
  <TabsList className="grid grid-cols-7">
    {TABS.map(tab => <TabsTrigger key={tab.id} />)}
  </TabsList>
  
  <TabsContent value="connections">
    <ConnectionsList />
  </TabsContent>
  // ... other tabs
</Tabs>

// Admin uses same pattern with 6 tabs
```

### 7.4 Badge System

```typescript
// Used for:
// - Engine type display (small badge)
// - Connection strength indicators
// - Review counts (notification badge)
// - Tags in annotations

<Badge variant="outline">semantic</Badge>
<Badge variant="destructive" className="absolute -top-1 -right-1">5</Badge>
```

---

## 8. STYLING DETAILS

### 8.1 Layout Classes

```typescript
// Flexbox patterns
'flex flex-col h-screen'      // Vertical stack, full height
'flex items-center gap-2'     // Centered with spacing
'absolute -left-4 top-8'     // Positioning

// Grid patterns
'grid grid-cols-7 gap-1'      // 7-column grid (RightPanel tabs)
'grid grid-cols-6'            // 6-column grid (Admin tabs)
'grid auto-rows-min'          // Auto-sized rows

// Spacing
'p-6 px-8'                    // Padding
'gap-2 gap-4'                 // Gap between items
'mt-6 border-b'               // Margin + border
```

### 8.2 Visual Effects

```typescript
// Shadows
'shadow-sm shadow-md shadow-lg'

// Transparency
'bg-primary/10 text-primary'
'bg-accent/50'
'hover:bg-muted/50'

// Transitions
'transition-all duration-300'
'transition-colors duration-300'

// Borders
'border border-2'
'border-primary border-green-500'
'rounded-lg rounded-full rounded-md'
```

### 8.3 Dark Mode

All components support dark mode:

```typescript
'bg-card dark:bg-card-foreground'
'text-foreground dark:text-muted'
'bg-gray-100 dark:bg-gray-800'
```

---

## 9. DEPENDENCIES SUMMARY

### Core UI Libraries

| Library | Version | Usage |
|---------|---------|-------|
| React | 19.x | Component framework |
| Next.js | 15.x | Framework (App Router) |
| TypeScript | 5.x | Type safety |
| Tailwind CSS | ^4.0.0 | Styling |
| Radix UI | Latest | Unstyled primitives |
| shadcn/ui | Latest | Pre-styled components |
| Framer Motion | ^11.0.0 | Animations |
| Lucide Icons | Latest | Icon library (100+ icons used) |
| Sonner | Latest | Toast notifications |
| Zustand | ^5.0.0 | State management |
| React Query | ^5.0.0 | Server state (in pages) |
| Virtuoso | Latest | Virtual scrolling |
| React Hotkeys Hook | Latest | Keyboard shortcuts |
| Date-fns | Latest | Date formatting |
| CVA | Latest | Class variants |
| DOMPurify | Latest | HTML sanitization |

### Development Tools

- TypeScript for type safety
- ESLint for code quality
- Prettier for formatting
- Next.js built-in optimizations

---

## 10. ARCHITECTURAL STRENGTHS

### 1. **Store-First Architecture**
- Eliminates prop drilling
- Single source of truth for shared state
- Easy to test individual components

### 2. **Performance Optimization**
- React.memo for pure components
- useMemo for expensive calculations
- Debounced data fetching (300ms)
- Virtualization for large lists
- Event delegation for annotation clicks

### 3. **Accessibility**
- Keyboard hotkeys (v/r/s for validation, ⌘K for capture)
- Aria labels on buttons
- Focus management
- Semantic HTML elements (via shadcn/ui)

### 4. **Persistent UI**
- No modal disruptions
- Collapsible panels for screen real estate
- Bottom-right dock for transient jobs
- Keyboard shortcuts for power users

### 5. **Type Safety**
- Full TypeScript coverage
- ECS entity types
- Zod validation for recovery
- Connection/annotation interfaces

### 6. **Animation Polish**
- Framer Motion for smooth transitions
- Spring physics for natural feel
- Hover states for affordance
- Fade in/out for content changes

---

## 11. PATTERNS TO FOLLOW WHEN ADDING COMPONENTS

### Checklist for New Components

```typescript
// 1. Start with 'use client'
'use client'

// 2. Import from ui/ for base components
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardContent } from '@/components/ui/card'

// 3. Use Tailwind + cn() for styling
import { cn } from '@/lib/utils'
className={cn('base-classes', isActive && 'active-classes')}

// 4. Prefer useCallback + useMemo
const handleClick = useCallback(() => { ... }, [deps])
const filtered = useMemo(() => [...].filter(...), [deps])

// 5. Use Zustand stores (not prop drilling)
const store = useXxxStore(state => state.field)

// 6. Add keyboard shortcuts if interactive
useHotkeys('key', handler, { enabled: condition })

// 7. Use optimistic updates for instant feedback
setState(optimisticValue)
serverAction().then(real => setState(real))

// 8. Memoize if component is pure
export const Component = memo(function Component(props) { ... })

// 9. Use event delegation for dynamic elements
const target = e.target as HTMLElement
const item = target.closest('[data-id]')

// 10. Add loading states + error handling
{isLoading && <Loader2 className="animate-spin" />}
{error && <Alert>Error message</Alert>}
```

---

## 12. CONCLUSION

### Architecture Summary

Rhizome V2 uses a **modern, performance-optimized** React architecture:

- **Component Organization**: Logical separation by feature (reader, sidebar, admin)
- **UI Foundation**: Heavy use of shadcn/ui + Radix UI primitives
- **State Management**: Zustand stores eliminate prop drilling
- **Styling**: Tailwind CSS with CVA for variants + Framer Motion for polish
- **Performance**: Memoization, debouncing, virtualization, event delegation
- **Interactivity**: Keyboard hotkeys, optimistic updates, persistent UI
- **Type Safety**: Full TypeScript coverage with Zod validation

### Key Numbers

- **58 active components** across 8 logical directories
- **31 shadcn/ui components** providing consistent UI primitives
- **138 hook usages** (useState, useCallback, useMemo, useEffect)
- **6 Zustand stores** managing application state
- **72 shadcn/ui imports** showing heavy reliance on design system
- **3 React.memo components** for performance-critical paths

This architecture is **scalable, maintainable, and optimized** for the knowledge synthesis use case.

