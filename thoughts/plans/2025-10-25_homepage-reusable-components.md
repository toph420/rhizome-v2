# Homepage Reusable Components - Iterative Build Plan

**Status**: In Progress (Phase 1 Complete ✅)
**Created**: 2025-10-25
**Updated**: 2025-10-28
**Related**: `home-page-redesign-2025-10-25.md`
**Implementation Log**: `docs/frontend/HOMEPAGE_COMPONENTS.md`

---

## 🎉 Progress Update (2025-10-28)

**Completed**: ✅ Phase 1 (StatCard + StatsPanel) ✅ Phase 2 (ActivityItem + ActivityFeed)
**Architecture Pattern Established**: Server/Client Component separation (DeckGrid pattern)
**Pattern Changes**: Documented in implementation log
**Next**: Phase 3 (DocumentCard + LibraryGrid)

---

## 🎯 Overview

Build reusable UI components by implementing them inline in the homepage mockup first, then extracting to `components/rhizome/` when working. We'll work component-by-component, building aesthetics together iteratively.

## 📐 Approach: Inline → Validate → Extract → Import

**Why this approach?**
- ✅ See components in real context immediately
- ✅ Validate layout, spacing, interactions live
- ✅ Catch edge cases early (long titles, missing data)
- ✅ End up with extracted, reusable components
- ✅ Don't break mockup during development

**Pattern (UPDATED 2025-10-28):**
```
1. Replace placeholder inline in homepage/page.tsx
2. Implement with real structure and Rhizome styling
3. Test with mock data initially
4. Validate layout, spacing, interactions, aesthetics
5. Extract to appropriate location:
   - Reusable UI → components/rhizome/[component].tsx
   - Section orchestrator → components/homepage/[Section].tsx ⭐ NEW
6. Import back to homepage
7. Add Server Action for data fetching (future phase)
8. Mark TODO as complete ✅
```

### 🏗️ Architecture Pattern Established (2025-10-28)

**Following DeckGrid/DeckCard Pattern** (from flashcard system):

```typescript
// ✅ ESTABLISHED PATTERN
src/app/homepage/page.tsx (Server Component)
  └─ Imports section orchestrators

src/components/homepage/StatsPanel.tsx (Client Component)
  └─ Creates callback functions
  └─ Manages interactive state
  └─ Imports reusable UI components

src/components/rhizome/stat-card.tsx (Client Component)
  └─ Accepts callbacks as props
  └─ Reusable across entire app
```

**Key Learnings**:
- `'use client'` applies to entire file, not individual functions
- Section orchestrators need separate files in `components/homepage/`
- Cannot pass callback functions from Server Component to Client Component
- Pattern matches existing DeckGrid/DeckCard implementation

**See**: `docs/frontend/HOMEPAGE_COMPONENTS.md` for complete architecture documentation

---

## 🧩 Components to Build

### Already Built ✅
- `DeckCard` - Feature-rich with shortcuts, stats, study actions
- `QuickSparkCapture` - Full panel with form, selections, metadata
- **`StatCard`** ✅ (2025-10-28) - 8 variants, neobrutalist styling, compact mode
- **`StatsPanel`** ✅ (2025-10-28) - Client Component orchestrator pattern established

### Need to Build 🔴

#### 1. StatCard ✅ COMPLETE (Actual: 45 min)
**Location**: Inline in `src/app/homepage/page.tsx` (StatsPanel section)
**Why first**: Clear contract, simple UI, immediate value

**Features**:
- Label, value, optional icon
- Click handler for navigation
- Hover states
- Color variations (optional)

**Props**:
```typescript
interface StatCardProps {
  label: string
  value: string | number
  icon?: React.ReactNode
  onClick?: () => void
  variant?: 'default' | 'success' | 'warning' | 'danger'
}
```

**Extraction target**: `src/components/rhizome/stat-card.tsx` ✅

**Used in**: Homepage Stats, Dashboard, Admin Panel, any metrics display

**Implementation Status**: ✅ Complete
- 8 variants implemented (primary, vibrant-pink/purple/orange, neutral, success/warning/danger)
- Compact mode working
- Neobrutalist hover animation functional
- Optional click handlers integrated
- Fully documented in `docs/frontend/HOMEPAGE_COMPONENTS.md`

**Implementation Notes (Original)**:
- Use existing `Card` component as base
- Follow neobrutalism styling (rounded-base, border-2, shadow-shadow)
- Hover effect: translate + shadow removal
- Click: cursor-pointer + onClick callback
- No complex state needed

---

#### 2. ActivityItem ✅ COMPLETE (Actual: 20 min)
**Location**: `src/components/rhizome/activity-item.tsx` ✅
**Why second**: Reusable across Activity Feed, Notifications, Document history

**Features**:
- Lucide icon + timestamp + text layout
- 7 activity type mappings with unique icons and colors
- Click navigation with metadata routing
- Time formatting using date-fns
- Neobrutalist styling with colored accent borders

**Props**:
```typescript
interface ActivityItemProps {
  activity: {
    id: string
    type: 'connection_validated' | 'annotation_added' | 'document_processed' | 'spark_created' | 'document_added' | 'processing_started' | 'flashcard_reviewed'
    timestamp: Date | string
    text: string
    metadata?: {
      documentId?: string
      connectionId?: string
      annotationId?: string
      sparkId?: string
      entityId?: string
    }
  }
  onClick?: (activity: ActivityItem) => void
}
```

**Extraction target**: `src/components/rhizome/activity-item.tsx` ✅

**Used in**: Homepage feed, Notifications, Document history, Recent activity lists

**Implementation Status**: ✅ Complete
- 7 Lucide icons: CheckCircle2, FileEdit, Zap, Lightbulb, BookPlus, Play, Target
- Color system using globals.css palette (forest, sky, mustard, lilac, cyan, coral, rose)
- Colored left accent borders (border-l-4) per activity type
- Icon badges with neobrutalist mini shadows
- Background tints with /20 opacity
- Hover "push" animation: translate-x/y + shadow-none
- Time formatting: "2 hours ago", "Yesterday" via date-fns
- Fully documented in `docs/frontend/HOMEPAGE_COMPONENTS.md`

**Implementation Notes (Original)**:
- Icon mapping per activity type (✓, 📝, ⚡, 💭, 📚)
- Time formatting: "2h ago", "Yesterday", "2 days ago"
- Border-b between items (not in component, in list container)
- Hover: bg-muted transition
- Click: navigate to relevant section (pass metadata to onClick)

---

#### 2b. ActivityFeed ✅ COMPLETE (Actual: 15 min)
**Location**: `src/components/homepage/ActivityFeed.tsx` ✅
**Pattern**: Client Component orchestrator (following StatsPanel pattern)

**Features**:
- Orchestrates ActivityItem instances
- Navigation callbacks based on activity metadata
- Real dropdown menu components (not fake buttons)
- Scrollable container with overflow handling
- Neobrutalist header with filter controls
- "Load more" button with hover animation

**Architecture**:
```
HomePage (Server Component)
  └─ ActivityFeed (Client Component) ← Creates callbacks
      └─ ActivityItem (Client Component) ← Accepts callbacks
```

**Implementation Status**: ✅ Complete
- Two functional dropdown menus:
  - Activity Type Filter (All/Connections/Annotations/Documents/Sparks/Flashcards)
  - Time Range Filter (Last Hour/24 Hours/7 Days/30 Days/All Time)
- DropdownMenu components from design system (Radix UI)
- ChevronDown icons from Lucide React
- Neobrutalist button styling with mini shadows
- Mock data with 6 activity items and realistic timestamps
- Navigation routing: documents, connections, annotations, sparks
- Header: bold uppercase tracking-tight font-heading
- Fully documented in `docs/frontend/HOMEPAGE_COMPONENTS.md`

**Key Implementation Details**:
```typescript
// Real dropdown implementation
<DropdownMenu>
  <DropdownMenuTrigger asChild>
    <button className="px-2 py-1 text-xs font-medium border-2 border-border rounded-base bg-white shadow-[1px_1px_0px_0px_rgba(0,0,0,1)] hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none transition-all flex items-center gap-1">
      All <ChevronDown className="w-3 h-3" />
    </button>
  </DropdownMenuTrigger>
  <DropdownMenuContent align="end" className="border-2 border-border shadow-shadow">
    <DropdownMenuItem>All Activities</DropdownMenuItem>
    {/* More items... */}
  </DropdownMenuContent>
</DropdownMenu>
```

---

#### 3. DocumentCard (Complex - 60 min)
**Location**: Inline in `src/app/homepage/page.tsx` (LibraryGrid section)
**Why third**: Most complex, needs thumbnail logic, processing status, hover states

**Features**:
- Thumbnail/cover image (placeholder support)
- Title (truncated with tooltip)
- Metadata (chunk count, connection count)
- Processing status badge
- Hover states (scale, connection overlay)
- Click navigation

**Props**:
```typescript
interface DocumentCardProps {
  document: {
    id: string
    title: string
    chunkCount: number
    connectionCount: number
    processingStatus: 'completed' | 'processing' | 'failed'
    lastReadAt?: Date
    coverImageUrl?: string
  }
  onClick?: () => void
}
```

**Extraction target**: `src/components/rhizome/document-card.tsx`

**Used in**: Homepage Library, Documents page, Search results, Collections

**Implementation Notes**:
- Cover image: 180px × 260px (same as HeroCard)
- Placeholder: gray bg with "No Cover" text
- Processing badge: ⚡ icon with pulse animation
- Hover: `hover:scale-102` + show connection count overlay
- Title: `truncate` with `title` attribute for tooltip
- Grid layout: 4 columns on desktop, 2 on tablet, 1 on mobile

---

#### 4. SparkCaptureForm (Extraction - 45 min)
**Location**: Extract from `src/components/sparks/QuickSparkCapture.tsx`
**Why last**: Validates extraction pattern, already working

**Strategy**:
1. Extract form logic from panel wrapper
2. Create pure form component
3. Use in both QuickSparkCapture (panel) and Homepage (compact)

**Current structure** (QuickSparkCapture):
```
QuickSparkCapture (400 lines)
├─ Panel wrapper (AnimatePresence, motion.div)
├─ Form logic (textarea, submit, validation)
├─ Selection handling (Quote This, Create Annotation)
├─ Metadata extraction (tags, chunk IDs)
└─ Linked annotations display
```

**New structure**:
```
QuickSparkCapture (150 lines) - Panel wrapper only
└─ Uses SparkCaptureForm (250 lines) - Pure form logic

HomePage QuickCaptureSection (50 lines) - Simple wrapper
└─ Uses SparkCaptureForm (same component!)
```

**Extraction target**: `src/components/rhizome/spark-capture-form.tsx`

**Used in**: QuickSparkCapture panel, Homepage quick capture, Inline spark forms

**Implementation Notes**:
- Extract all form logic WITHOUT panel animation
- Props: documentId?, onSubmit, onCancel, initialContent, initialSelections, compact?
- Compact mode: Simplified UI for homepage (no selection tools)
- Full mode: All features (selections, annotations, metadata)

---

## 🎨 Styling Patterns to Follow

### Neobrutalism (from existing components)

**Base Card Styling**:
- `rounded-base` (10px border radius)
- `border-2 border-border` (bold black borders)
- `shadow-shadow` (2px 2px 0px black shadow)
- `bg-white` or `bg-secondary-background`

**Hover Animation**:
```css
hover:translate-x-boxShadowX
hover:translate-y-boxShadowY
hover:shadow-none
```
This creates the neobrutalist "push" effect - button moves into shadow position.

**Typography**:
- Font family: `font-base` (DM Sans)
- Headings: `font-heading` (Inter)
- Sizes: `text-xs`, `text-sm`, `text-lg`, `text-2xl`
- Weights: `font-base` (500), `font-heading` (800)

**Color System**:
- Primary text: `text-foreground` (black)
- Secondary text: `text-muted-foreground` (gray)
- Card backgrounds: `bg-white`, `bg-secondary-background`
- Main accent: `bg-main` (yellow-green)
- Status colors:
  - Success: `text-green-600`, `bg-green-100`
  - Warning: `text-orange-600`, `bg-orange-100`
  - Danger: `text-red-600`, `bg-red-100`

**Interactive States**:
- Clickable: `cursor-pointer`
- Active: `ring-2 ring-primary`
- Hover: `hover:bg-muted` (for list items)
- Disabled: `opacity-50 pointer-events-none`

### CSS Variables Reference

From `src/app/globals.css`:
```css
:root {
  --background: oklch(96.79% 0.0654 102.26);  /* Light cream */
  --secondary-background: oklch(100% 0 0);    /* Pure white */
  --foreground: oklch(0% 0 0);                /* Pure black */
  --main: oklch(86.03% 0.176 92.36);          /* Yellow-green */
  --border: oklch(0% 0 0);                    /* Black borders */
  --shadow: 2px 2px 0px 0px var(--border);
  --radius-val: 10px;
}
```

---

## 🔄 Iterative Workflow Per Component

### Step 1: Design Discussion (5-10 min)
- Review mockup design for component
- Discuss layout, spacing, colors
- Agree on feature set (MVP vs full)
- Identify edge cases

### Step 2: Inline Implementation (15-30 min)
- Replace placeholder in `homepage/page.tsx`
- Implement component with Rhizome styling
- Add basic interactivity
- Use mock data initially

**Example for StatCard**:
```typescript
// In homepage/page.tsx - StatsPanel section
function StatCard({ label, value, onClick }: StatCardProps) {
  return (
    <button
      onClick={onClick}
      className="border-2 border-border rounded-base p-2 bg-white shadow-shadow hover:translate-x-boxShadowX hover:translate-y-boxShadowY hover:shadow-none transition-all cursor-pointer"
    >
      <div className="text-lg font-bold font-heading">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </button>
  )
}
```

### Step 3: Data Integration (10-15 min)
- Create Server Action in `app/actions/homepage.ts`
- Connect component to real data
- Handle loading/error states

**Example Server Action**:
```typescript
// src/app/actions/homepage.ts
'use server'

export async function getStats(): Promise<Stats> {
  const supabase = await createClient()

  const [docCount, chunkCount, connCount] = await Promise.all([
    supabase.from('documents').select('id', { count: 'exact', head: true }),
    supabase.from('chunks').select('id', { count: 'exact', head: true }),
    supabase.from('connections').select('id', { count: 'exact', head: true }),
  ])

  return {
    documentCount: docCount.count || 0,
    chunkCount: chunkCount.count || 0,
    connectionCount: connCount.count || 0,
  }
}
```

### Step 4: Aesthetic Refinement (10-15 min)
- Review together
- Adjust spacing, colors, sizes
- Add hover states, animations
- Polish interactions

**Refinement checklist**:
- [ ] Spacing feels balanced (not cramped, not too loose)
- [ ] Text sizes readable (not too small, not too large)
- [ ] Colors match Rhizome palette
- [ ] Hover states smooth and clear
- [ ] Borders and shadows consistent
- [ ] Mobile responsive

### Step 5: Extraction (5-10 min)
- Copy working component to `components/rhizome/`
- Add TypeScript interfaces
- Add JSDoc documentation
- Import back to homepage

**Extraction template**:
```typescript
// src/components/rhizome/stat-card.tsx
'use client'

/**
 * StatCard Component
 *
 * Displays a metric with label and optional click action.
 * Used for dashboard stats, analytics displays, and homepage metrics.
 *
 * @example
 * ```tsx
 * <StatCard
 *   label="documents"
 *   value={47}
 *   onClick={() => router.push('/documents')}
 * />
 * ```
 */
export function StatCard({ label, value, onClick }: StatCardProps) {
  // Component implementation
}
```

### Step 6: Validation (5 min)
- Test in homepage
- Verify extraction didn't break anything
- Commit component

```bash
git add src/components/rhizome/stat-card.tsx src/app/homepage/page.tsx
git commit -m "feat: add StatCard reusable component

- Displays metric with label
- Click handler for navigation
- Neobrutalism styling (shadow, borders)
- Used in homepage stats panel"
```

---

## 🏗️ Rhizome Architecture Context

- **Module**: Main App only (Next.js 15 + React 19)
- **Storage**: Database for queryable data (no Storage needed)
- **Migration**: No database changes needed (using existing tables)
- **Test Tier**: Stable (fix when broken, not critical path)
- **Server Actions**: Create new file `src/app/actions/homepage.ts`
- **Component Pattern**: Server Components by default, 'use client' only when needed

### Server Component Rules

**Default to Server Components**:
```typescript
// src/app/homepage/page.tsx
export default async function HomePage() {
  const stats = await getStats()  // Server Action call
  const library = await getLibrary({ limit: 8 })

  return <div>{/* Render with server-fetched data */}</div>
}
```

**Use 'use client' only for**:
- Event handlers (onClick, onChange)
- Browser APIs (window, document)
- React hooks (useState, useEffect)
- Interactive components

**Pattern for interactive components**:
```typescript
// src/components/rhizome/stat-card.tsx
'use client'  // Needed for onClick handler

export function StatCard({ onClick }: StatCardProps) {
  return <button onClick={onClick}>...</button>
}
```

---

## ✅ Success Criteria

### Automated Verification:
- [ ] TypeScript: `npm run type-check` (no errors)
- [ ] Build: `npm run build` (succeeds)
- [ ] Lint: `npm run lint` (no errors)

### Manual Verification (Per Component):
- [ ] Component displays correctly in homepage
- [ ] Real data loads properly (not mock data)
- [ ] Hover states work smoothly
- [ ] Click navigation works
- [ ] Empty states handled gracefully
- [ ] Loading states show correctly
- [ ] Responsive on mobile/tablet/desktop
- [ ] Matches Rhizome neobrutalism aesthetic
- [ ] No console errors or warnings

### Overall Homepage Success:
- [ ] All 8 sections working with real data
- [ ] Layout matches mockup design
- [ ] Diagonal cascade grid works (66%/34% split)
- [ ] All components extracted to `components/rhizome/`
- [ ] Homepage imports extracted components
- [ ] No placeholder data remaining

---

## 🚫 What We're NOT Doing

❌ Building all components at once (work iteratively)
❌ Extracting before validating in context
❌ Adding features beyond homepage needs initially
❌ Creating new database migrations (use existing schema)
❌ Building complex animations (keep simple, performant)
❌ Over-engineering before we know usage patterns
❌ Using modals (follow No Modals Rule - use panels/docks)
❌ Rebuilding existing components (DeckCard, QuickSparkCapture already done)

---

## 📁 Files to Create/Modify

### New Files (Components):
- `src/components/rhizome/stat-card.tsx` - Metric display card
- `src/components/rhizome/activity-item.tsx` - Timeline item
- `src/components/rhizome/document-card.tsx` - Library grid item
- `src/components/rhizome/spark-capture-form.tsx` - Extracted form from QuickSparkCapture

### New Files (Server Actions):
- `src/app/actions/homepage.ts` - All homepage data fetching

### Modified Files:
- `src/app/homepage/page.tsx` - Replace placeholders with components

### Reference Files (Don't Modify):
- `thoughts/plans/home-page-redesign-2025-10-25.md` - Design spec
- `src/components/rhizome/deck-card.tsx` - Feature-rich pattern reference
- `src/components/rhizome/connection-card.tsx` - Keyboard shortcuts pattern
- `src/components/rhizome/flashcard-card.tsx` - Optimistic updates pattern
- `src/components/sparks/QuickSparkCapture.tsx` - Extraction source

---

## 📊 Server Actions to Create

### 1. getStats()
**Returns**: Document/chunk/connection counts + processing queue status

```typescript
interface Stats {
  documentCount: number
  chunkCount: number
  connectionCount: number
  processingQueue: {
    completed: number
    processing: number
    failed: number
  }
}
```

### 2. getCurrentReading()
**Returns**: Most recently read document with progress

```typescript
interface CurrentReading {
  documentId: string
  title: string
  author?: string
  coverImageUrl?: string
  currentChapter?: number
  totalChapters?: number
  progressPercent: number
  chunkCount: number
  connectionCount: number
  lastReadAt: Date
}
```

### 3. getLibrary()
**Returns**: Recent documents for library grid

```typescript
interface LibraryParams {
  limit: number
  sort?: 'recent' | 'alphabetical' | 'connected'
}

interface LibraryDocument {
  id: string
  title: string
  chunkCount: number
  connectionCount: number
  processingStatus: 'completed' | 'processing' | 'failed'
  lastReadAt?: Date
}
```

### 4. getActivityFeed()
**Returns**: Recent activity items

```typescript
interface ActivityParams {
  limit: number
  since?: Date
}

interface ActivityItem {
  id: string
  type: 'connection_validated' | 'annotation_added' | 'document_processed' | 'spark_created' | 'document_added'
  timestamp: Date
  text: string
  metadata: {
    documentId?: string
    connectionId?: string
    annotationId?: string
    sparkId?: string
  }
}
```

### 5. getConnections()
**Returns**: Validated connections

```typescript
interface ConnectionParams {
  validated: boolean
  limit: number
  filters?: {
    engine?: 'semantic' | 'contradiction' | 'thematic'
    type?: 'bridge' | 'tension' | 'similar'
  }
}

interface Connection {
  id: string
  type: 'bridge' | 'tension' | 'similar'
  strength: number
  sourceChunkId: string
  targetChunkId: string
  description: string
  engine: 'semantic' | 'contradiction' | 'thematic'
  validated: boolean
}
```

### 6. getSparks()
**Returns**: Recent sparks

```typescript
interface SparkParams {
  limit: number
  filters?: {
    theme?: string
    unlinkedOnly?: boolean
  }
}

interface Spark {
  id: string
  content: string
  documentId?: string
  chunkIds?: string[]
  createdAt: Date
  theme?: string
}
```

### 7. getFlashcards()
**Returns**: Deck summaries

```typescript
interface FlashcardParams {
  dueOnly: boolean
}

interface FlashcardDeck {
  id: string
  name: string
  cardCount: number
  dueCount: number
  nextReviewAt?: Date
}
```

---

## 🎯 Implementation Order

### Phase 1: StatCard ✨
**Time**: 30 min
**Goal**: Validate inline → extract → import pattern

1. Design discussion (5 min)
2. Inline implementation (10 min)
3. Server Action for getStats() (5 min)
4. Aesthetic refinement (5 min)
5. Extraction (3 min)
6. Validation (2 min)

**Deliverable**: Working StatCard in homepage + extracted component

---

### Phase 2: ActivityItem 📰
**Time**: 45 min
**Goal**: Build timeline component with icons

1. Design discussion (5 min)
2. Inline implementation (15 min)
3. Server Action for getActivityFeed() (10 min)
4. Aesthetic refinement (10 min)
5. Extraction (3 min)
6. Validation (2 min)

**Deliverable**: Working ActivityItem in homepage + extracted component

---

### Phase 3: DocumentCard 📚
**Time**: 60 min
**Goal**: Complex card with hover states and thumbnails

1. Design discussion (10 min)
2. Inline implementation (20 min)
3. Server Action for getLibrary() (10 min)
4. Aesthetic refinement (15 min)
5. Extraction (3 min)
6. Validation (2 min)

**Deliverable**: Working DocumentCard in homepage + extracted component

---

### Phase 4: SparkCaptureForm 💭
**Time**: 45 min
**Goal**: Validate extraction from existing component

1. Analyze QuickSparkCapture structure (10 min)
2. Extract form logic to new component (20 min)
3. Update QuickSparkCapture to use extracted form (5 min)
4. Add to homepage with compact mode (5 min)
5. Validation (5 min)

**Deliverable**: SparkCaptureForm used in both panel and homepage

---

## 🚀 Ready to Start?

We'll work on **StatCard first** - the simplest component to validate our pattern. Once we nail the aesthetic and extraction workflow, the rest will flow smoothly.

**Next steps:**
1. Review StatCard design from mockup
2. Implement inline in homepage
3. Discuss aesthetic together
4. Extract when working
5. Move to ActivityItem

---

## 📚 References

- **Homepage Design**: `thoughts/plans/home-page-redesign-2025-10-25.md`
- **Homepage Mockup**: `src/app/homepage/page.tsx`
- **Feature-Rich Pattern**: `src/components/rhizome/deck-card.tsx`
- **Neobrutalism Styling**: `src/app/globals.css`
- **Server Actions Guide**: `docs/rEACT_GUIDELINES.md`
- **UI Patterns**: `docs/UI_PATTERNS.md`

---

**Document Version**: 1.0
**Last Updated**: 2025-10-25
**Author**: Topher + Claude (Planning Session)
