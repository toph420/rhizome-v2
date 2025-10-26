# Homepage Redesign - Diagonal Cascade Layout

**Status**: Mockup Created
**Created**: 2025-10-25
**Mockup**: `src/app/homepage/page.tsx`
**Design Session**: Brainstorming with designer wireframes

---

## 🎯 Design Goals

### Primary User Behaviors
- **Balanced Exploration**: No single section dominates; all areas equally accessible
- **Z-Pattern Scanning**: Diagonal flow creates natural zigzag scanning pattern
- **High Information Density**: Maximize information per screen, minimize scrolling
- **Activity Prominence**: Activity Feed important but not dominant (prominent middle-right placement)

### Visual Flow
```
Hero (top-left) → Quick Capture (top-right) ↓
Library (mid-left) → Activity Feed (mid-right, ends halfway down Connections) ↓
Stats + Connections (left, 2-row span) → Flashcards (right, starts halfway down Connections) ↓
Sparks (bottom-left, full 66% width) ← Flashcards extends down (right side)
```

**Staggered Layout Diagram**:
```
┌─────────────────────────┬─────────────────┐
│ Hero (66%)              │ Quick Capture   │  Row 1 (360px)
│                         │ (200px)         │
├─────────────────────────┼─────────────────┤
│ Library (66%)           │ Activity Feed   │  Row 2 (240px)
│                         │ (540px total)   │
├──────────┬──────────────┤                 │
│ Stats    │ Connections  │                 │  Row 3 (140px)
│ (24%)    │ (42%)        ├─────────────────┤  <- Activity ends
│          │              │ Flashcards      │  Row 4 (140px)
├──────────┴──────────────┤ (460px total)   │  <- Flashcards starts
│ Sparks (66%)            │                 │  Row 5 (320px)
│                         │                 │
└─────────────────────────┴─────────────────┘
```

---

## 📐 Layout Architecture

### Grid System: Percentage-Based (Width) + 5-Row Structure

**Why Percentages for Width?**
- Responsive by default
- Scales naturally across viewport sizes
- Easier maintenance (no hardcoded pixel calculations)
- Future-proof for different screen sizes

**Why Fixed Heights (px)?**
- Content-driven: Sections need specific space for readability
- Predictable: Easier to design components knowing exact heights
- Responsive via media queries: Heights adjust at breakpoints, not continuously
- No container height required: Works without setting viewport constraints

**Grid Structure** (5 rows for precise staggering):
```css
.homepage-grid {
  display: grid;
  grid-template-columns: 66% 34%;
  grid-template-rows: 360px 240px 140px 140px 320px;
  gap: 0; /* No gaps - tight staggering */
}
```

**Alternative: Viewport Height (vh) Option**:
```css
/* For viewport-scaled heights (optional) */
.homepage-grid {
  grid-template-rows: 30vh 20vh 11.67vh 11.67vh 26.67vh;
  min-height: 100vh; /* Ensures grid fills viewport */
}
```
*Note: This makes heights scale with viewport, which may not be ideal for content sections.*

### Section Dimensions

| Section | Width | Height | Grid Position | Notes |
|---------|-------|--------|---------------|-------|
| **Hero** | 66% | 360px | Col 1, Row 1 | Primary CTA |
| **Quick Capture** | 34% | 200px | Col 2, Row 1 (top) | Inside flex container |
| **Library** | 66% | 240px | Col 1, Row 2 | Document grid |
| **Activity Feed** | 34% | 540px | Col 2, Rows 1-3 | Stacked with Capture, ends halfway down Connections |
| **Stats** | 24% (36% of 66%) | 280px | Col 1, Rows 3-4 (left) | Spans 2 rows |
| **Connections** | 42% (64% of 66%) | 280px | Col 1, Rows 3-4 (right) | Spans 2 rows |
| **Sparks** | 66% | 320px | Col 1, Row 5 | Full left column width |
| **Flashcards** | 34% | 460px | Col 2, Rows 4-5 | Starts halfway down Connections, spans 2 rows |

**Total Height**: 1200px (360 + 240 + 140 + 140 + 320)

### Key Layout Features

✅ **Tight Staggering**: Sections share borders, no weird gaps
✅ **5-Row Precision**: Row 3 & 4 are 140px each for precise overlap positioning
✅ **Activity Feed Stagger**: Ends halfway down Connections (rows 1-3)
✅ **Flashcards Stagger**: Starts halfway down Connections (rows 4-5)
✅ **Stats + Connections = 66%**: Nested grid (24% + 42% = 66% total), spans rows 3-4
✅ **Percentage-Based Width**: All widths use % (responsive from start)
✅ **Diagonal Cascade**: Multiple offset points create dynamic Z-pattern

---

## 🧩 Component Breakdown

### Implementation Status

| Section | Component Location | Status | Client/Server | Priority |
|---------|-------------------|--------|---------------|----------|
| Hero Card | `HeroCard` (placeholder) | 🔴 TODO | Client | P0 - Critical |
| Library Grid | `LibraryGrid` (placeholder) | 🔴 TODO | Client | P0 - Critical |
| Quick Capture | `QuickCaptureForm` (placeholder) | 🔴 TODO | Client | P0 - Critical |
| Activity Feed | `ActivityFeed` (placeholder) | 🔴 TODO | Server + Client | P1 - High |
| Stats Panel | `StatsPanel` (placeholder) | 🔴 TODO | Server | P1 - High |
| Connections Panel | `ConnectionsPanel` (placeholder) | 🔴 TODO | Server + Client | P0 - Critical |
| Sparks Grid | `SparksGrid` (placeholder) | 🔴 TODO | Client | P2 - Medium |
| Flashcards Panel | `FlashcardsPanel` (placeholder) | 🔴 TODO | Server + Client | P2 - Medium |

### Component Dependencies

**Existing Components** (from `src/components/rhizome/`):
- ✅ `Card`, `CardContent`, `CardHeader`, `CardTitle` - Neobrutalist card components
- ✅ `Button` - Primary/secondary/ghost variants
- ✅ `Badge` - For status indicators
- ✅ `Skeleton` - Loading states (already implemented)
- ✅ `Input`, `Textarea` - Form components
- ✅ `FlashcardCard`, `ConnectionCard`, `SparkCard`, `AnnotationCard` - Feature-rich cards

**New Components Needed**:
- 🔴 `HeroCard` - Currently Reading hero with progress visualization
- 🔴 `DocumentCard` - Library grid item with thumbnail/metadata
- 🔴 `ActivityItem` - Timeline item for Activity Feed
- 🔴 `DeckSummaryCard` - Flashcard deck summary

---

## 📝 Section Design Specifications

### 1. Hero Card (Currently Reading)

**Purpose**: Primary CTA - encourage user to continue reading current document

**Layout**: Flex layout with cover image on left, content on right

**Design Elements**:
- **Cover Image** (left side):
  - Fixed size: 180px × 260px
  - Border: 2px border-border
  - Rounded corners (rounded-base)
  - Placeholder for documents without covers
- **Content** (right side):
  - Large book title (text-2xl font-bold)
  - Author name (text-muted-foreground)
  - Progress indicators:
    - Chapter X of Y
    - Percentage complete (35%)
    - Chunk count (234 chunks)
    - Connection count (45 connections)
  - Primary CTA button: "CONTINUE READING →" (full width)

**Interactions**:
- Click anywhere on card → Navigate to `/read/[documentId]`
- Hover → Subtle lift effect (shadow increase)
- Progress ring animation (optional enhancement)
- Recent connections badge (e.g., "+3 new connections" pill)

**Data Requirements**:
```typescript
interface CurrentReading {
  documentId: string
  title: string
  author?: string
  coverImageUrl?: string // URL to cover image (optional)
  currentChapter?: number
  totalChapters?: number
  progressPercent: number
  chunkCount: number
  connectionCount: number
  lastReadAt: Date
}
```

**Server Action**: `getCurrentReading()` → Returns most recently read document

---

### 2. Library Grid

**Purpose**: Quick access to document collection with visual scanning

**Design Elements**:
- Grid layout: 4 columns × 2 rows (8 documents visible)
- Document card:
  - Title (truncated)
  - Chunk count
  - Connection count (e.g., "45c")
  - Processing status badge (⚡ if processing)
- Filter/sort controls:
  - Recent▾ (default)
  - A-Z▾ (alphabetical)
  - Connected▾ (most connections first)
- "View all 47 documents →" footer button

**Interactions**:
- Click document → Navigate to `/read/[documentId]`
- Hover → Show connection count overlay + scale up 2%
- Sort persistence → Remember user's preferred sort in localStorage

**Data Requirements**:
```typescript
interface LibraryDocument {
  id: string
  title: string
  chunkCount: number
  connectionCount: number
  processingStatus: 'completed' | 'processing' | 'failed'
  lastReadAt?: Date
}
```

**Server Action**: `getLibrary({ limit: 8, sort: 'recent' | 'alphabetical' | 'connected' })`

---

### 3. Quick Capture Form

**Purpose**: Frictionless spark creation (Cmd+K accessible)

**Design Elements**:
- Single input field: "New spark:"
- "SAVE NOW" button (primary)
- Recent sparks list (3 items):
  - Clickable chips/links
  - Navigate to spark detail on click
- "View all 23 →" footer link

**Interactions**:
- Cmd+K → Auto-focus input (global shortcut)
- Enter key → Save spark
- Auto-suggest document linking (optional checkbox)
- Live spark count update after save

**Data Requirements**:
```typescript
interface SparkInput {
  content: string
  documentId?: string // Optional link to current document
  chunkIds?: string[] // Optional link to specific chunks
}
```

**Server Action**: `createSpark(data: SparkInput)` → Optimistic update

---

### 4. Activity Feed

**Purpose**: Real-time visibility into system activity (processing, connections, annotations)

**Design Elements**:
- Timeline layout (vertical scroll)
- Time grouping:
  - "Today" (2h ago, 3h ago, etc.)
  - "Yesterday"
  - "2 days ago"
  - Collapsible groups (optional enhancement)
- Activity icons:
  - ✓ Validated connection
  - 📝 Annotation added
  - ⚡ Document processed
  - 💭 Spark captured
  - 📚 Document added
- Click to navigate → Jump to relevant section

**Interactions**:
- Click activity item → Navigate to relevant page (e.g., `/read/[docId]#annotation-[id]`)
- Real-time updates → Polling or WebSocket (future enhancement)
- "Load more ↓" button for pagination

**Data Requirements**:
```typescript
interface ActivityItem {
  id: string
  type: 'connection_validated' | 'annotation_added' | 'document_processed' | 'spark_created' | 'document_added'
  timestamp: Date
  metadata: {
    documentId?: string
    connectionId?: string
    annotationId?: string
    sparkId?: string
  }
}
```

**Server Action**: `getActivityFeed({ limit: 20, since?: Date })`

---

### 5. Stats & Processing Panel

**Purpose**: At-a-glance metrics and system health

**Design Elements**:
- Document count: "47 documents"
- Chunk count: "12,483 chunks"
- Connection count: "891 connections"
- Processing queue status:
  - ✓ 44 (completed)
  - ⚡ 2 (processing)
  - ⚠ 1 (failed)
- "View graph →" button (future: knowledge graph visualization)

**Interactions**:
- Click counts → Navigate to filtered views (e.g., `/documents`, `/connections`)
- Click processing status → Navigate to Admin Panel Jobs tab

**Data Requirements**:
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

**Server Action**: `getStats()` → Cached for 5 minutes

---

### 6. Connections Panel

**Purpose**: Discovery of validated connections (primary value proposition)

**Design Elements**:
- Filter controls:
  - Valid▾ (validated only / all)
  - Engine▾ (semantic / contradiction / thematic)
  - Type▾ (bridge / tension / similar)
- Connection cards (3 visible):
  - Connection type badge (BRIDGE / TENSION / SIMILAR)
  - Strength score (0.89, 0.92, 0.84)
  - Connection description (e.g., "Buddhism → CogSci")
  - "VIEW IN READER" button
- "Showing: 12 validated" count
- "View all 891 →" footer button

**Interactions**:
- Click "VIEW IN READER" → Navigate to `/read/[docId]` with connection highlighted
- Hover card → Lift effect + show full connection context
- Filter persistence → Remember user's preferred filters

**Data Requirements**:
```typescript
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

**Server Action**: `getConnections({ validated: true, limit: 12, filters })`

---

### 7. Sparks Grid

**Purpose**: Quick access to captured sparks (quick thoughts)

**Design Elements**:
- Grid layout: 3 columns × 2 rows (6 sparks visible)
- Spark card:
  - Title/first line (truncated)
  - Preview text (1 line)
  - Linked document indicator (optional)
- Filter controls:
  - Recent▾ (default)
  - Theme▾ (group by theme/topic)
  - "Unlinked only" checkbox (show orphan sparks)
- "View all 23 sparks →" footer button

**Interactions**:
- Click spark → Expand inline or navigate to spark detail
- Hover → Show full preview tooltip
- Drag to reorder (future enhancement)

**Data Requirements**:
```typescript
interface Spark {
  id: string
  content: string
  documentId?: string
  chunkIds?: string[]
  createdAt: Date
  theme?: string
}
```

**Server Action**: `getSparks({ limit: 6, filters })`

---

### 8. Flashcards Panel

**Purpose**: Study system entry point (FSRS-based spaced repetition)

**Design Elements**:
- Deck summary cards (4 visible):
  - Deck name
  - Card count (e.g., "45 cards")
  - Due count (e.g., "12 due" or "None due")
  - "PRACTICE NOW →" button
- Filter controls:
  - "Due only▾" (show only decks with due cards)
  - "Deck: All▾" (filter by specific deck)
- "Create new deck +" button

**Interactions**:
- Click "PRACTICE NOW" → Navigate to `/study/deck/[deckId]`
- Click deck name → Navigate to deck detail/management
- Due count badge → Red highlight if cards overdue

**Data Requirements**:
```typescript
interface FlashcardDeck {
  id: string
  name: string
  cardCount: number
  dueCount: number
  nextReviewAt?: Date
}
```

**Server Action**: `getFlashcards({ dueOnly: false })`

---

## 🎨 Visual Design System

### Color & Typography Hierarchy

**Primary Actions** (Hero, Quick Capture):
- Accent color for CTAs (e.g., "CONTINUE READING" button)
- Slightly elevated cards (shadow: `0 2px 8px rgba(0,0,0,0.1)`)

**Secondary Content** (Library, Connections, Sparks, Flashcards):
- Neutral background (`bg-gray-50` or `bg-white`)
- Flat cards or minimal border (`border-2 border-border`)

**Tertiary/Contextual** (Activity Feed, Stats):
- Muted backgrounds (`bg-gray-100`)
- Smaller font sizes (14px vs 16px for primary)

### Interactive States

**Hover States**:
- Library docs: Scale up 2% + show connection count overlay
- Connection cards: Lift up 4px + show "VIEW IN READER" button
- Spark/Flashcard cards: Dim background + show action icons (edit, delete)

**Loading States**:
- Activity Feed: Skeleton loaders for new items
- Library: Pulse animation on processing docs (⚡ badge)
- Stats: Animated counter increments (e.g., "891 → 892 connections")

### Border Strategy (Tight Staggering)

```css
/* Add subtle borders where sections meet */
.hero-section, .library-section, .connections-section {
  border-right: 1px solid var(--border-color);
}

.capture-section {
  border-bottom: 1px solid var(--border-color);
}

.activity-section {
  border-left: 1px solid var(--border-color);
  border-bottom: 1px solid var(--border-color);
}

/* Bottom row has top border only */
.sparks-section, .flashcards-section {
  border-top: 1px solid var(--border-color);
}
```

---

## 📱 Responsive Breakpoints

### Desktop (1200px+): Full Layout
```css
@media (min-width: 1200px) {
  .homepage-grid {
    grid-template-columns: 66% 34%;
  }
}
```

### Laptop (900px - 1199px): Adjust Row Heights
```css
@media (max-width: 1199px) {
  .homepage-grid {
    grid-template-rows:
      320px    /* Shorter hero */
      220px    /* Shorter library */
      280px    /* Shorter stats+connections */
      260px;   /* Shorter bottom row */
  }
}
```

### Tablet (600px - 899px): Single Column
```css
@media (max-width: 899px) {
  .homepage-grid {
    grid-template-columns: 100%;
    grid-template-rows: auto;
  }

  /* Stack in order */
  .hero-section { order: 1; }
  .capture-section { order: 2; height: auto; }
  .library-section { order: 3; }
  .activity-section { order: 4; height: auto; }
  .stats-connections-container {
    order: 5;
    grid-template-columns: 100%;
  }
  .sparks-section { order: 6; width: 100%; }
  .flashcards-section { order: 7; }
}
```

### Mobile (<600px): Full Stack
```css
@media (max-width: 599px) {
  .stats-connections-container {
    grid-template-columns: 100%;
  }
}
```

---

## 🚀 Implementation Roadmap

### Phase 1: Foundation (Week 1) - P0 Critical
- [x] Create homepage mockup structure (`src/app/homepage/page.tsx`)
- [ ] Move placeholder components to `/components/homepage/` directory
- [ ] Implement CSS Grid layout with responsive breakpoints
- [ ] Create skeleton loaders for all sections (already done in mockup)

### Phase 2: Core Sections (Week 2) - P0 Critical
- [ ] **Hero Card**: Implement with Server Actions
  - [ ] Create `getCurrentReading()` Server Action
  - [ ] Add progress visualization (progress bar or ring)
  - [ ] Implement click navigation to reader
- [ ] **Library Grid**: Implement with filters
  - [ ] Create `getLibrary()` Server Action
  - [ ] Add sort/filter controls (Recent/A-Z/Connected)
  - [ ] Implement hover states and navigation
- [ ] **Connections Panel**: Implement with filters
  - [ ] Create `getConnections()` Server Action
  - [ ] Add connection type badges and strength scores
  - [ ] Implement "VIEW IN READER" navigation
- [ ] **Quick Capture**: Implement spark creation
  - [ ] Create `createSpark()` Server Action
  - [ ] Add Cmd+K global shortcut
  - [ ] Implement optimistic updates

### Phase 3: Secondary Sections (Week 3) - P1 High
- [ ] **Activity Feed**: Implement timeline
  - [ ] Create `getActivityFeed()` Server Action
  - [ ] Add time grouping and collapsible sections
  - [ ] Implement click-to-navigate for each activity type
- [ ] **Stats Panel**: Implement metrics
  - [ ] Create `getStats()` Server Action
  - [ ] Add caching (5-minute cache)
  - [ ] Implement navigation to filtered views

### Phase 4: Study System (Week 4) - P2 Medium
- [ ] **Sparks Grid**: Implement spark display
  - [ ] Create `getSparks()` Server Action
  - [ ] Add theme grouping and filtering
  - [ ] Implement inline expand/detail navigation
- [ ] **Flashcards Panel**: Implement deck summaries
  - [ ] Create `getFlashcards()` Server Action
  - [ ] Add due count highlighting
  - [ ] Implement navigation to study mode

### Phase 5: Polish & Enhancement (Week 5)
- [ ] Add real-time updates for Activity Feed (polling or WebSocket)
- [ ] Implement knowledge graph visualization ("View graph →" button)
- [ ] Add animations and transitions
- [ ] Performance optimization (lazy loading, virtualization)
- [ ] Accessibility audit (keyboard navigation, screen readers)

---

## 🔧 Technical Implementation Notes

### Server Components by Default
✅ Homepage is a Server Component (async function)
✅ Data fetching happens server-side with Server Actions
✅ Only interactive sections marked 'use client'

### Component Organization
```
src/
├── app/
│   └── homepage/
│       └── page.tsx (Server Component - layout)
├── components/
│   └── homepage/
│       ├── HeroCard.tsx ('use client')
│       ├── LibraryGrid.tsx ('use client')
│       ├── QuickCaptureForm.tsx ('use client')
│       ├── ActivityFeed.tsx ('use client')
│       ├── StatsPanel.tsx (Server Component)
│       ├── ConnectionsPanel.tsx ('use client')
│       ├── SparksGrid.tsx ('use client')
│       └── FlashcardsPanel.tsx ('use client')
└── app/actions/
    └── homepage.ts (Server Actions)
```

### Server Actions Required
```typescript
// src/app/actions/homepage.ts
'use server'

export async function getCurrentReading(): Promise<CurrentReading | null>
export async function getLibrary(params: LibraryParams): Promise<LibraryDocument[]>
export async function getConnections(params: ConnectionParams): Promise<Connection[]>
export async function createSpark(data: SparkInput): Promise<Spark>
export async function getSparks(params: SparkParams): Promise<Spark[]>
export async function getFlashcards(params: FlashcardParams): Promise<FlashcardDeck[]>
export async function getActivityFeed(params: ActivityParams): Promise<ActivityItem[]>
export async function getStats(): Promise<Stats>
```

### Performance Considerations
- **Suspense Boundaries**: Each section has its own Suspense boundary (parallel data fetching)
- **Skeleton Loaders**: Already implemented for all sections
- **Caching Strategy**:
  - Stats: 5-minute cache
  - Library: 1-minute cache
  - Activity Feed: No cache (real-time)
  - Connections: 2-minute cache

### State Management
- **Server State**: React Query for Server Action caching (future enhancement)
- **Client State**: Minimal - only for UI interactions (filters, sorts)
- **Optimistic Updates**: Quick Capture form (createSpark)

---

## 🎯 Success Criteria

### Performance
- [ ] First Contentful Paint < 1s
- [ ] Largest Contentful Paint < 2.5s
- [ ] Time to Interactive < 3s
- [ ] All sections load in parallel (Suspense boundaries)

### Accessibility
- [ ] Keyboard navigation works for all interactive elements
- [ ] Focus indicators visible and clear
- [ ] Screen reader announcements for dynamic content
- [ ] Color contrast meets WCAG AA standards

### User Experience
- [ ] Z-pattern scanning feels natural
- [ ] All sections above fold on 1440px viewport
- [ ] Hover states provide clear affordance
- [ ] Loading states prevent layout shift

---

## 📊 Design Variations Considered

### Variation 1: Diagonal Cascade (SELECTED)
✅ **Pros**: Dynamic flow, balanced exploration, Z-pattern scanning
✅ **Activity Feed**: Prominent but not dominant (480px)
✅ **Connections**: Good space (440×320)

### Variation 2: L-Shape (NOT SELECTED)
❌ **Cons**: Activity Feed too dominant (660px full height)
❌ **Cons**: Strong left bias reduces balanced exploration
✅ **Pros**: Maximum connections space (380×320)

### Variation 3: Split Stack (NOT SELECTED)
❌ **Cons**: F-pattern scanning (not desired Z-pattern)
❌ **Cons**: Right column tight stacks feel cramped
✅ **Pros**: Clean columnar structure, most readable

---

## 🔄 Future Enhancements

### Short-term (Next Quarter)
- [ ] Real-time Activity Feed (WebSocket integration)
- [ ] Knowledge graph visualization
- [ ] Advanced filtering and search
- [ ] Customizable section visibility (user preferences)

### Long-term (Future)
- [ ] Drag-and-drop section reordering
- [ ] Multiple homepage layouts (user-selectable)
- [ ] Widget system (custom sections)
- [ ] AI-powered recommendations

---

## 📚 References

- **Mockup File**: `src/app/homepage/page.tsx`
- **Component Library**: `src/components/rhizome/`
- **Design Patterns**: Neobrutalist (rounded-base, shadow-shadow, border-2)
- **Architecture Docs**: `/docs/rEACT_GUIDELINES.md`, `/docs/UI_PATTERNS.md`
- **Feature-Rich Card Pattern**: `src/components/rhizome/connection-card.tsx:47-180`

---

## 🤝 Next Session Guidance

### To Work on Hero Card
1. Read this document (Section Design Specifications → Hero Card)
2. Create `src/components/homepage/HeroCard.tsx`
3. Create Server Action `getCurrentReading()` in `src/app/actions/homepage.ts`
4. Check existing document schema: `psql -c "\d documents"`
5. Implement component following feature-rich card pattern
6. Test with real data from database

### To Work on Library Grid
1. Read this document (Section Design Specifications → Library Grid)
2. Create `src/components/homepage/LibraryGrid.tsx`
3. Create Server Action `getLibrary()` in `src/app/actions/homepage.ts`
4. Implement sort/filter controls with client state
5. Add hover states and navigation
6. Test with multiple documents

### To Work on Any Section
1. **Read**: Section Design Specifications (this document)
2. **Check**: Component Dependencies (existing vs. new)
3. **Create**: Component file in `src/components/homepage/`
4. **Implement**: Server Action in `src/app/actions/homepage.ts`
5. **Test**: With real database data
6. **Replace**: Placeholder in `src/app/homepage/page.tsx`

---

**Document Version**: 1.0
**Last Updated**: 2025-10-25
**Author**: Topher + Claude (Brainstorming Session)
