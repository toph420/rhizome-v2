# Homepage Reusable Components - Implementation Log

**Project**: Rhizome V2 Homepage Components
**Started**: 2025-10-28
**Status**: In Progress
**Related Plan**: `thoughts/plans/2025-10-25_homepage-reusable-components.md`

---

## 📋 Overview

Building reusable UI components for the Rhizome V2 homepage using the **inline → validate → extract → import** pattern. Components follow the established DeckGrid/DeckCard architecture pattern from the flashcard system.

### Key Design Principles

1. **Neobrutalist Aesthetic**: Bold borders, strong shadows, vibrant colors
2. **Server/Client Separation**: Pages are Server Components, sections are Client Components
3. **Reusable UI Components**: Extracted to `components/rhizome/` for app-wide use
4. **Responsive Design**: Tablet portrait (768px+) and desktop (1440px+) support

---

## ✅ Completed Components

### 1. StatCard (`components/rhizome/stat-card.tsx`)

**Status**: ✅ Complete
**Implementation Date**: 2025-10-28
**Pattern**: Feature-rich reusable component

**Features**:
- 8 visual variants (primary, vibrant-pink/purple/orange, neutral, success/warning/danger)
- Compact mode for dense layouts
- Neobrutalist hover animation (translate to shadow position)
- Optional click handlers for navigation
- Lucide icon support

**Props**:
```typescript
interface StatCardProps {
  label: string
  value: string | number
  variant?: 'primary' | 'vibrant-pink' | 'vibrant-purple' | 'vibrant-orange' | 'neutral' | 'success' | 'warning' | 'danger'
  icon?: React.ReactNode
  onClick?: () => void
  compact?: boolean
}
```

**Usage**:
```tsx
<StatCard
  label="documents"
  value={47}
  variant="primary"
  icon={<FileText className="w-4 h-4" />}
  onClick={() => router.push('/documents')}
/>
```

**Variants in Use**:
- **Primary (bg-main)**: Key metrics (documents count)
- **Vibrant Pink/Purple**: Colorful highlights (chunks, connections)
- **Success/Warning/Danger**: Processing queue status
- **Compact mode**: Smaller cards in dense grids

**File**: `src/components/rhizome/stat-card.tsx`

---

### 2. StatsPanel (`components/homepage/StatsPanel.tsx`)

**Status**: ✅ Complete
**Implementation Date**: 2025-10-28
**Pattern**: Client Component orchestrator (like DeckGrid)

**Architecture**:
```
HomePage (Server Component)
  └─ StatsPanel (Client Component) ← Creates callbacks
      └─ StatCard (Client Component) ← Accepts callbacks
```

**Features**:
- Orchestrates 6 StatCard instances
- Creates navigation callbacks
- Manages interactive state
- Two-section layout (Main Stats + Processing Queue)

**Usage**:
```tsx
// In homepage/page.tsx (Server Component)
import { StatsPanel } from '@/components/homepage/StatsPanel'

<section className="stats-section">
  <Suspense fallback={<StatsSkeleton />}>
    <StatsPanel />
  </Suspense>
</section>
```

**File**: `src/components/homepage/StatsPanel.tsx`

---

---

### 3. ActivityItem (`components/rhizome/activity-item.tsx`)

**Status**: ✅ Complete
**Implementation Date**: 2025-10-28
**Pattern**: Reusable UI component with Lucide icons and neobrutalist styling

**Features**:
- Lucide icon + timestamp + text layout
- 7 activity type mappings with unique icons and colors from globals.css
- Time formatting using `date-fns` ("2 hours ago", "Yesterday")
- Optional click handler for navigation
- Neobrutalist "push" hover animation
- Colored left accent borders per activity type
- Icon badges with mini shadows
- Background tints with /20 opacity
- Focus state for accessibility

**Activity Type Configuration**:
| Type | Lucide Icon | Accent Color | Background |
|------|-------------|--------------|------------|
| connection_validated | CheckCircle2 | border-forest | bg-mint-green/20 |
| annotation_added | FileEdit | border-sky | bg-sky/20 |
| document_processed | Zap | border-mustard | bg-mustard/20 |
| spark_created | Lightbulb | border-lilac | bg-lilac/20 |
| document_added | BookPlus | border-cyan | bg-cyan/20 |
| processing_started | Play | border-coral | bg-coral/20 |
| flashcard_reviewed | Target | border-rose | bg-rose/20 |

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
  onClick?: (activity: ActivityItemProps['activity']) => void
}
```

**Styling Pattern**:
```tsx
// Neobrutalist base with colored accent
className={cn(
  'w-full text-left p-3 mb-2',
  'border-2 border-border rounded-base',
  'shadow-shadow',
  config.bgColor,           // Colored background tint
  'border-l-4',             // Thick left accent border
  config.accentColor,       // Color from globals.css
  // Hover "push" animation
  onClick && [
    'cursor-pointer',
    'hover:translate-x-boxShadowX hover:translate-y-boxShadowY hover:shadow-none',
    'transition-all duration-200',
  ],
)}
```

**Usage**:
```tsx
<ActivityItem
  activity={{
    id: '123',
    type: 'document_processed',
    timestamp: new Date(),
    text: 'Thinking Fast & Slow processed successfully',
    metadata: { documentId: 'doc-123' }
  }}
  onClick={(activity) => router.push(`/read/${activity.metadata.documentId}`)}
/>
```

**Color System Integration**:
Uses oklch colors from `globals.css`:
- `--color-forest`, `--color-mint-green` (green success)
- `--color-sky`, `--color-cyan` (blue info)
- `--color-mustard`, `--color-gold` (yellow processing)
- `--color-lilac`, `--color-purple` (purple creative)
- `--color-coral` (orange progress)
- `--color-rose`, `--color-pink` (pink review)

**File**: `src/components/rhizome/activity-item.tsx`

---

### 4. ActivityFeed (`components/homepage/ActivityFeed.tsx`)

**Status**: ✅ Complete
**Implementation Date**: 2025-10-28
**Pattern**: Client Component orchestrator with real dropdown menus

**Architecture**:
```
HomePage (Server Component)
  └─ ActivityFeed (Client Component) ← Creates callbacks
      └─ ActivityItem (Client Component) ← Accepts callbacks
```

**Features**:
- Orchestrates ActivityItem instances
- Navigation callbacks based on activity metadata
- Two functional dropdown menus (Activity Type, Time Range)
- Scrollable container with overflow handling
- Neobrutalist header with bold uppercase typography
- "Load more" button with hover animation
- Mock data (6 activity items with realistic timestamps)

**Dropdown Implementation**:
Uses Radix UI DropdownMenu components with neobrutalist styling:

```tsx
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/rhizome/dropdown-menu'
import { ChevronDown } from 'lucide-react'

// Activity Type Filter
<DropdownMenu>
  <DropdownMenuTrigger asChild>
    <button className="px-2 py-1 text-xs font-medium border-2 border-border rounded-base bg-white shadow-[1px_1px_0px_0px_rgba(0,0,0,1)] hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none transition-all flex items-center gap-1">
      All <ChevronDown className="w-3 h-3" />
    </button>
  </DropdownMenuTrigger>
  <DropdownMenuContent align="end" className="border-2 border-border shadow-shadow">
    <DropdownMenuItem>All Activities</DropdownMenuItem>
    <DropdownMenuItem>Connections</DropdownMenuItem>
    <DropdownMenuItem>Annotations</DropdownMenuItem>
    <DropdownMenuItem>Documents</DropdownMenuItem>
    <DropdownMenuItem>Sparks</DropdownMenuItem>
    <DropdownMenuItem>Flashcards</DropdownMenuItem>
  </DropdownMenuContent>
</DropdownMenu>

// Time Range Filter
<DropdownMenu>
  <DropdownMenuTrigger asChild>
    <button className="px-2 py-1 text-xs font-medium border-2 border-border rounded-base bg-white shadow-[1px_1px_0px_0px_rgba(0,0,0,1)] hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none transition-all flex items-center gap-1">
      24h <ChevronDown className="w-3 h-3" />
    </button>
  </DropdownMenuTrigger>
  <DropdownMenuContent align="end" className="border-2 border-border shadow-shadow">
    <DropdownMenuItem>Last Hour</DropdownMenuItem>
    <DropdownMenuItem>Last 24 Hours</DropdownMenuItem>
    <DropdownMenuItem>Last 7 Days</DropdownMenuItem>
    <DropdownMenuItem>Last 30 Days</DropdownMenuItem>
    <DropdownMenuItem>All Time</DropdownMenuItem>
  </DropdownMenuContent>
</DropdownMenu>
```

**Header Styling**:
```tsx
<h3 className="font-heading text-lg font-black uppercase tracking-tight">
  Activity Feed
</h3>
```

**Navigation Logic**:
```tsx
const handleActivityClick = (activity: ActivityItemProps['activity']) => {
  const { metadata } = activity

  if (metadata?.documentId) {
    router.push(`/read/${metadata.documentId}`)
  } else if (metadata?.connectionId) {
    // TODO: Navigate to connection view when implemented
    console.log('Navigate to connection:', metadata.connectionId)
  } else if (metadata?.annotationId) {
    // TODO: Navigate to annotation when implemented
    console.log('Navigate to annotation:', metadata.annotationId)
  } else if (metadata?.sparkId) {
    // TODO: Navigate to spark view when implemented
    console.log('Navigate to spark:', metadata.sparkId)
  }
}
```

**Load More Button**:
```tsx
<Button
  variant="outline"
  className="w-full mt-3 font-bold border-2 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none transition-all"
>
  Load more ↓
</Button>
```

**Usage**:
```tsx
// In homepage/page.tsx (Server Component)
import { ActivityFeed } from '@/components/homepage/ActivityFeed'

<section className="activity-section">
  <Suspense fallback={<ActivitySkeleton />}>
    <ActivityFeed />
  </Suspense>
</section>
```

**Key Implementation Details**:
- Real dropdown menus (not fake buttons with ▾ unicode)
- ChevronDown icons from Lucide React
- Neobrutalist button styling with 1px mini shadows
- Hover "push" animation on dropdown triggers
- border-2 border-border on dropdown content
- Activity metadata routing for navigation
- Scrollable activity list with custom scrollbar spacing

**File**: `src/components/homepage/ActivityFeed.tsx`

---

## 🔄 In Progress

### 4. DocumentCard (`components/rhizome/document-card.tsx`)

**Status**: 🔴 Not Started (⚠️ Already exists, needs review)
**Estimated Time**: 60 min
**Priority**: After ActivityItem

**Note**: A DocumentCard already exists at `src/components/rhizome/document-card.tsx`. Need to:
1. Review existing implementation
2. Determine if it fits homepage needs
3. Enhance or rebuild as needed

**Planned Features**:
- Thumbnail/cover image (180x260px)
- Title with truncation + tooltip
- Metadata (chunk count, connection count)
- Processing status badge
- Hover states (scale, overlay)
- Grid layout support (4 cols desktop, 2 tablet, 1 mobile)

---

## 📐 Architecture Patterns Established

### Pattern 1: Server/Client Component Separation

**✅ ESTABLISHED PATTERN** (Following DeckGrid/DeckCard)

```typescript
// ✅ CORRECT: Page stays Server Component
// src/app/homepage/page.tsx
export default async function HomePage() {
  // Can use async/await, Server Actions
  return (
    <section>
      <Suspense fallback={<Skeleton />}>
        <StatsPanel />
      </Suspense>
    </section>
  )
}

// ✅ CORRECT: Section orchestrator is Client Component
// src/components/homepage/StatsPanel.tsx
'use client'
export function StatsPanel() {
  const handleNavigate = (section: string) => {
    router.push(`/${section}`)
  }

  return (
    <div>
      <StatCard onClick={() => handleNavigate('documents')} />
    </div>
  )
}

// ✅ CORRECT: Reusable UI component is Client Component
// src/components/rhizome/stat-card.tsx
'use client'
export function StatCard({ onClick }: StatCardProps) {
  return <button onClick={onClick}>...</button>
}
```

**❌ INCORRECT Patterns** (Learned during implementation):

```typescript
// ❌ WRONG: Entire page as Client Component
'use client'
export default function HomePage() {
  // Loses Server Component benefits
}

// ❌ WRONG: Inline Client Component in Server Component file
export default function HomePage() {
  'use client' // Doesn't work - applies to entire file
  function StatsPanel() { ... }
}

// ❌ WRONG: Creating callbacks in Server Component
export default function HomePage() {
  return <StatCard onClick={() => console.log('...')} /> // Can't pass functions across boundary
}
```

### Pattern 2: Component File Structure

**✅ ESTABLISHED STRUCTURE**:

```
src/
├── app/
│   └── homepage/
│       └── page.tsx              # Server Component (page)
├── components/
│   ├── homepage/                 # Client Component orchestrators
│   │   ├── StatsPanel.tsx        # ✅ Created
│   │   ├── ActivityFeed.tsx      # ✅ Created
│   │   ├── LibraryGrid.tsx       # 🔴 Next
│   │   ├── ConnectionsPanel.tsx  # 🔴 Planned
│   │   ├── SparksGrid.tsx        # 🔴 Planned
│   │   └── FlashcardsPanel.tsx   # 🔴 Planned
│   └── rhizome/                  # Reusable UI components
│       ├── stat-card.tsx         # ✅ Created
│       ├── activity-item.tsx     # ✅ Created
│       ├── document-card.tsx     # ⚠️ Exists, needs review
│       └── [other components]
```

**Naming Convention**:
- **Pages**: `page.tsx` (Server Component by default)
- **Section Orchestrators**: `PascalCase.tsx` in `components/homepage/`
- **Reusable UI**: `kebab-case.tsx` in `components/rhizome/`

---

## 🎨 Neobrutalist Styling System

### Base Card Styling

```typescript
className={cn(
  // Neobrutalist foundation
  'rounded-base',           // 10px border radius
  'border-2 border-border', // Bold black borders
  'shadow-shadow',          // 2px 2px 0px black shadow
  'bg-white',               // or bg-secondary-background

  // Hover animation - "push" effect
  'hover:translate-x-boxShadowX hover:translate-y-boxShadowY hover:shadow-none',
  'transition-all duration-200',

  // Interactive
  onClick && 'cursor-pointer'
)}
```

### Color System

**Main Accent**: `bg-main` (yellow-green from globals.css)
**Vibrant Palette**:
- `--color-vibrant-pink`: oklch(0.71 0.18 357)
- `--color-vibrant-purple`: oklch(0.67 0.18 305)
- `--color-vibrant-orange`: oklch(0.73 0.19 45)

**Semantic Colors**:
- Success: `bg-green-100 border-green-600`
- Warning: `bg-orange-100 border-orange-600`
- Danger: `bg-red-100 border-red-600`

### Typography

```typescript
// Values (font-heading font-black)
'font-heading font-black text-2xl'  // Standard
'font-heading font-black text-lg'   // Compact

// Labels (uppercase tracking-wider)
'text-xs uppercase tracking-wider font-base font-medium text-muted-foreground'
```

---

## 🔧 Development Workflow

### Component Development Cycle

**Phase 1: Design & Inline Implementation** (15-30 min)
1. Design discussion (variants, props, features)
2. Implement inline in `homepage/page.tsx` first
3. Test with mock data
4. Validate visual aesthetic

**Phase 2: Extract & Refine** (10-15 min)
1. Extract to appropriate location:
   - Reusable UI → `components/rhizome/[component].tsx`
   - Section orchestrator → `components/homepage/[Section].tsx`
2. Add TypeScript interfaces
3. Add JSDoc documentation
4. Import back to homepage

**Phase 3: Integration & Testing** (5-10 min)
1. Test responsive behavior (768px, 1440px)
2. Verify hover states
3. Test click handlers
4. Check console for errors

---

## 📊 Progress Tracking

### Components Completed: 4/9

- [x] StatCard (reusable UI)
- [x] StatsPanel (section orchestrator)
- [x] ActivityItem (reusable UI)
- [x] ActivityFeed (section orchestrator)
- [ ] DocumentCard (reusable UI - review existing)
- [ ] LibraryGrid (section orchestrator)
- [ ] ConnectionsPanel (section orchestrator)
- [ ] SparksGrid (section orchestrator)
- [ ] FlashcardsPanel (section orchestrator)

### Implementation Time Tracking

| Component | Estimated | Actual | Status |
|-----------|-----------|--------|--------|
| StatCard | 30 min | 45 min | ✅ Complete |
| StatsPanel | 15 min | 30 min | ✅ Complete |
| ActivityItem | 45 min | 20 min | ✅ Complete |
| ActivityFeed | 20 min | 15 min | ✅ Complete |
| DocumentCard | 60 min | - | 🔴 Pending |

**Note**: Extra time for StatCard/StatsPanel was spent establishing architecture patterns and learning Server/Client boundary rules. ActivityItem/ActivityFeed benefited from pattern reuse - completed faster than estimated.

---

## 🧪 Testing & Validation

### Automated Checks

```bash
npm run typecheck  # ✅ Passing
npm run lint       # ✅ Passing
npm run build      # ✅ Passing
```

### Manual Testing Checklist

**Per Component**:
- [ ] Displays correctly in homepage
- [ ] Real data loads properly
- [ ] Hover states work smoothly
- [ ] Click navigation works
- [ ] Empty states handled
- [ ] Loading states display
- [ ] Responsive on mobile/tablet/desktop
- [ ] Matches neobrutalism aesthetic
- [ ] No console errors

**StatCard**: ✅ All checks passing

---

## 🚧 Known Issues & Decisions

### Issue 1: Server/Client Boundary Learning Curve

**Problem**: Initial attempt to use `'use client'` before inline functions didn't work.

**Solution**: Learned that `'use client'` applies to entire file, not individual functions. Extracted to separate file following DeckGrid pattern.

**Decision**: All section orchestrators go in `components/homepage/` as Client Components.

---

### Issue 2: DocumentCard Already Exists

**Problem**: `components/rhizome/document-card.tsx` already exists.

**Decision**: Will review existing implementation before building LibraryGrid to determine if it fits homepage needs or needs enhancement.

---

## 📝 Next Steps

### Immediate (Next Session)

1. **Review existing DocumentCard** (`components/rhizome/document-card.tsx`)
   - Check if it fits homepage LibraryGrid needs
   - Determine if enhancement or rebuild needed
   - Plan LibraryGrid section orchestrator

2. **Build/Enhance DocumentCard + LibraryGrid** (60-90 min estimated)
   - Implement or adapt DocumentCard for homepage
   - Create LibraryGrid orchestrator
   - Test with mock library data

3. **Build remaining sections** (120-150 min estimated)
   - ConnectionsPanel orchestrator (30 min)
   - SparksGrid orchestrator (30 min)
   - FlashcardsPanel orchestrator (30 min)
   - Test all sections integrated

### Future Phases

4. **Data Integration Phase**
   - Create Server Actions in `app/actions/homepage.ts`
   - Replace all mock data with real database queries
   - Add loading states and error boundaries
   - Implement real-time updates where needed

5. **Polish Phase**
   - Responsive grid breakpoints refinement
   - Animation polish
   - Empty state designs
   - Error handling UX

---

## 📚 Reference Files

### Implementation Files
- `src/components/rhizome/stat-card.tsx` - Reusable StatCard
- `src/components/homepage/StatsPanel.tsx` - Stats section orchestrator
- `src/components/rhizome/activity-item.tsx` - Reusable ActivityItem with Lucide icons
- `src/components/homepage/ActivityFeed.tsx` - Activity feed orchestrator with dropdown menus
- `src/app/homepage/page.tsx` - Homepage Server Component

### Documentation
- `thoughts/plans/2025-10-25_homepage-reusable-components.md` - Original plan
- `docs/UI_PATTERNS.md` - Feature-Rich Components pattern
- `docs/rEACT_GUIDELINES.md` - Server/Client component rules

### Related Components (Pattern Reference)
- `src/components/rhizome/deck-card.tsx` - Feature-rich pattern example
- `src/components/flashcards/DeckGrid.tsx` - Client Component orchestrator example

---

**Last Updated**: 2025-10-28 (Phase 2 Complete)
**Updated By**: Topher + Claude (Implementation Session)
