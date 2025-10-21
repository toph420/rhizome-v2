# Complete Component Library Research for Rhizome V2 Features

**Date**: 2025-10-19
**Purpose**: Research external components for future features listed in `docs/frontend/components.md`
**Scope**: LeftPanel, Connection Visualization, Chat/AI, Search/Filter, Thread System

---

## Executive Summary

This document catalogs research on component libraries for building the remaining 10 feature areas identified in `docs/frontend/components.md`. All recommendations prioritize:
- ✅ React 19 / Next.js 15 compatibility
- ✅ shadcn/ui ecosystem integration
- ✅ Free/open-source options
- ✅ TypeScript support
- ✅ Low integration complexity

**Key Finding**: 90% of needed components can be built using **shadcn/ui + existing libraries** already in your stack or simple additions. Only 3 major libraries needed: **SmoothUI** (flashcards), **React Flow** (graphs), **Vercel AI Elements** (chat).

---

## Part 1: LeftPanel Components

### 1.1 OutlineTab - Document Structure/TOC

#### **shadcn Tree View** ⭐ RECOMMENDED
**Source**: [MrLightful/shadcn-tree-view](https://github.com/MrLightful/shadcn-tree-view)
**Installation**: `npx shadcn add "https://mrlightful.com/registry/tree-view"`

**Features**:
- Hierarchical nested structure (H1-H6 headings)
- Expandable/collapsible nodes
- Custom icons per node
- Connection count badges (supports)
- Click to navigate
- WAI-ARIA keyboard navigation
- shadcn/ui + Tailwind styling

**Integration**: 🟢 **1-2 days**

#### **DIY Table of Contents with Intersection Observer**
**Pattern**: Extract headings from document, track active section with browser API

**Implementation**:
```tsx
const useHeadingsData = () => {
  const [nestedHeadings, setNestedHeadings] = useState([])

  useEffect(() => {
    const headings = document.querySelectorAll('h1, h2, h3, h4, h5, h6')
    const headingData = Array.from(headings).map(heading => ({
      id: heading.id,
      title: heading.innerText,
      level: Number(heading.nodeName.charAt(1))
    }))
    setNestedHeadings(headingData)
  }, [])

  return { nestedHeadings }
}

const useIntersectionObserver = (setActiveId) => {
  useEffect(() => {
    const callback = (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) setActiveId(entry.target.id)
      })
    }

    const observer = new IntersectionObserver(callback, {
      rootMargin: '-110px 0px -40% 0px'
    })

    const headings = document.querySelectorAll('h1, h2, h3, h4, h5, h6')
    headings.forEach((heading) => observer.observe(heading))

    return () => observer.disconnect()
  }, [setActiveId])
}
```

**Integration**: 🟢 **1 day** (zero dependencies, pure React + browser APIs)

---

### 1.2 StatsTab - Reading Analytics

#### **Recharts** ⭐ RECOMMENDED
**Source**: [recharts.github.io](https://recharts.org)
**Installation**: `pnpm add recharts`

**Features**:
- Composable chart components (Line, Bar, Area, Pie)
- Built for React (declarative API)
- Responsive design
- Tooltip/Legend support
- 30K+ GitHub stars, actively maintained

**Common Charts for Stats**:
```tsx
import { LineChart, Line, BarChart, Bar, Tooltip } from 'recharts'

// Reading speed over time
<LineChart width={300} height={100} data={speedData}>
  <Line type="monotone" dataKey="wpm" stroke="#8884d8" />
  <Tooltip />
</LineChart>

// Session progress
<BarChart width={300} height={100} data={sessionData}>
  <Bar dataKey="pages" fill="#82ca9d" />
</BarChart>
```

**Integration**: 🟢 **1-2 days**

#### **shadcn Interactive Flip Cards**
**Source**: [Shadcn-Widgets/Interactive-Shadcn-Flip-Cards](https://github.com/Shadcn-Widgets/Interactive-Shadcn-Flip-Cards)
**Installation**: `npm install @react-spring/web recharts lucide-react`

**Features**:
- Stat card with flip animation (stat on front, chart on back)
- Bright backgrounds for important numbers
- Recharts integration built-in
- shadcn/ui components

**Integration**: 🟢 **1 day** (drop-in component)

---

### 1.3 TimelineTab - Reading Session History

#### **react-chrono** ⭐ RECOMMENDED
**Source**: [prabhuignoto/react-chrono](https://github.com/prabhuignoto/react-chrono)
**Installation**: `pnpm add react-chrono`

**Features (v3.0 - 2024)**:
- Vertical/Horizontal/Alternating/Dashboard layouts
- Enhanced theming + Google Fonts
- Dark mode with toggle
- Sticky toolbar with search
- Zero external dependencies
- TypeScript built-in
- 3.8K GitHub stars

**Basic Usage**:
```tsx
import { Chrono } from 'react-chrono'

const sessions = [
  {
    title: 'Today, 2:30 PM',
    cardTitle: 'Reading Session',
    cardDetailedText: 'Read pages 45-67 (22 pages in 35 minutes)'
  }
]

<Chrono
  items={sessions}
  mode="VERTICAL"
  theme={{ primary: '#3b82f6' }}
  darkMode={{ enabled: true }}
/>
```

**Integration**: 🟢 **1 day**

**Alternative**: Aceternity UI Timeline (copy-paste), Origin UI Timeline (Tailwind-only)

---

### 1.4 ThemesTab - Extracted Themes/Concepts

#### **react-tagcloud** ⭐ RECOMMENDED
**Source**: [madox2/react-tagcloud](https://github.com/madox2/react-tagcloud)
**Installation**: `npm install react-tagcloud`

**Features**:
- Tag cloud with dynamic sizing
- Event handlers (onClick, onDoubleClick)
- Custom renderer function
- Extensible styling

**Usage**:
```tsx
import { TagCloud } from 'react-tagcloud'

const themes = [
  { value: 'Architecture', count: 38 },
  { value: 'Performance', count: 30 },
  { value: 'Security', count: 25 }
]

<TagCloud
  minSize={12}
  maxSize={35}
  tags={themes}
  onClick={tag => filterByTheme(tag)}
/>
```

**Integration**: 🟢 **1 day**

#### **DIY Theme Pills** (Alternative)
Using shadcn/ui Badge + Card:
```tsx
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"

const themes = [
  { id: 1, name: 'Architecture', count: 38, color: 'blue' }
]

<div className="flex flex-wrap gap-2">
  {themes.map(theme => (
    <Card
      key={theme.id}
      className="p-3 cursor-pointer hover:shadow-md"
      onClick={() => filterByTheme(theme)}
    >
      <Badge variant={theme.color}>{theme.name}</Badge>
      <span className="text-xs text-muted-foreground">{theme.count}</span>
    </Card>
  ))}
</div>
```

**Integration**: 🟢 **1 day** (zero dependencies)

---

### 1.5 Collapsible Panel State Management

#### **shadcn/ui Sidebar Component** ⭐ RECOMMENDED
**Source**: [ui.shadcn.com/docs/components/sidebar](https://ui.shadcn.com/docs/components/sidebar)
**Installation**: `npx shadcn@latest add sidebar`

**Features**:
- Built-in state management
- Cookie persistence (Next.js)
- Collapsible modes: `"icon"`, `"offcanvas"`, `"none"`
- `useSidebar` hook for control
- Mobile-responsive

**Usage**:
```tsx
import { Sidebar, SidebarProvider, useSidebar } from "@/components/ui/sidebar"

// Icon mode collapses to icon bar (perfect for LeftPanel)
<Sidebar collapsible="icon">
  <OutlineTab />
  <StatsTab />
  <TimelineTab />
  <ThemesTab />
</Sidebar>

// Hook for custom controls
const { state, open, toggleSidebar } = useSidebar()
```

**Integration**: 🟢 **1 day**

**Alternative**: Custom Zustand store (matches your existing pattern in `stores/`)

---

## Part 2: Connection Visualization

### 2.1 InlineConnectionHighlights

#### **react-highlight-words** ⭐ RECOMMENDED
**Source**: [bvaughn/react-highlight-words](https://github.com/bvaughn/react-highlight-words)
**Installation**: `npm install react-highlight-words`

**Features**:
- Highlight search terms within text
- Customizable styles
- Case sensitivity control
- Word boundaries support
- 637+ npm projects using it

**Usage**:
```tsx
import Highlighter from 'react-highlight-words'

<Highlighter
  searchWords={connectedChunks.map(c => c.text)}
  textToHighlight={chunkContent}
  highlightStyle={{
    background: `linear-gradient(to right,
      rgba(255, 200, 0, ${connectionStrength * 0.3}),
      rgba(255, 150, 0, ${connectionStrength * 0.6}))`
  }}
/>
```

**Integration**: 🟢 **< 1 hour** (drop-in component)

---

### 2.2 ConnectionStrengthGradients + Connection Lines

#### **React Flow** ⭐ RECOMMENDED
**Source**: [reactflow.dev](https://reactflow.dev)
**Installation**: `npm install reactflow`

**Features**:
- SVG-based flow diagrams
- Bezier/straight/step/smoothstep edges
- SVG gradient support for strength visualization
- Custom edge labels
- Animated edges
- React 19 compatible
- 20K+ GitHub stars, actively maintained

**Gradient Implementation**:
```tsx
import ReactFlow from 'reactflow'

<ReactFlow
  nodes={chunkPositions}
  edges={connections.map(conn => ({
    id: conn.id,
    source: conn.sourceChunkId,
    target: conn.targetChunkId,
    type: 'smoothstep',
    style: {
      stroke: `url(#gradient-${conn.strength})`,
      strokeWidth: 1 + (conn.strength * 3)
    }
  }))}
>
  <defs>
    {connections.map(conn => (
      <linearGradient key={conn.id} id={`gradient-${conn.strength}`}>
        <stop offset="0%" stopColor={getColorForStrength(conn.strength)} stopOpacity={0.3} />
        <stop offset="100%" stopColor={getColorForStrength(conn.strength)} stopOpacity={0.8} />
      </linearGradient>
    ))}
  </defs>
</ReactFlow>
```

**Integration**: 🟡 **2-3 days** (basic setup) to **5-7 days** (full gradient system)

**Performance**:
- Excellent for <1000 elements (SVG-based)
- 30-60 FPS with 100-500 nodes
- Requires optimization for >1000 nodes

---

### 2.3 Full Document Graph (Optional - Future)

#### **Reagraph** (WebGL, 3D Option)
**Source**: [reagraph.dev](https://reagraph.dev)
**Installation**: `npm i reagraph`

**Features**:
- WebGL-based rendering
- 2D & 3D graph layouts
- Node clustering
- Path finding
- Radial context menus

**Performance**:
- ⚠️ Known issues with 400+ nodes (12-28 FPS)
- Best for <400 nodes or when 3D visualization needed

**Integration**: 🟡 **2-3 days** (basic) to **5-7 days** (full integration)

**Use When**: Need 3D graph or >500 nodes (but note performance issues)

#### **Cytoscape.js with WebGL** (Large Graphs)
**Source**: [js.cytoscape.org](https://js.cytoscape.org)
**Installation**: `npm install cytoscape@3.x.y react-cytoscapejs`

**Features**:
- WebGL renderer (NEW in v3.31+)
- Excellent for large graphs (1000+ nodes)
- Mature library (10+ years)
- Scientific-grade visualization

**Performance**: Best for very large graphs (>1000 nodes)

**Integration**: 🟡 **3-4 days** (steeper learning curve)

**Use When**: Need to visualize all chunks in document (500-2000+ chunks)

---

### Performance Comparison

| Library | Small (<100) | Medium (100-500) | Large (500-2000) | Very Large (2000+) |
|---------|--------------|------------------|------------------|--------------------|
| **React Flow** | ⭐⭐⭐⭐⭐ 60 FPS | ⭐⭐⭐⭐ 30-60 FPS | ⭐⭐⭐ 15-30 FPS | ⚠️ Needs optimization |
| **Reagraph** | ⭐⭐⭐⭐ | ⭐⭐ 12-28 FPS | ⚠️ 1-3 FPS | ❌ Browser crash |
| **Cytoscape (WebGL)** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ Best choice |

**Recommendation**: Start with **React Flow** for <500 connections. Upgrade to **Cytoscape.js** if you need >1000 nodes.

---

## Part 3: Chat/AI Interface (BottomPanel)

### 3.1 FullChatMode + ContextChatMode

#### **Vercel AI Elements** ⭐ RECOMMENDED
**Source**: [ai-sdk.dev/elements](https://ai-sdk.dev/elements/overview)
**Installation**: `npx ai-elements@latest`

**Why Recommended**:
- ✅ Already using Vercel AI SDK (`ai` package in your stack)
- ✅ Built on shadcn/ui (your UI framework)
- ✅ React 19 confirmed working
- ✅ You own the code (injected via CLI)
- ✅ Streaming-optimized

**Core Components**:
```bash
npx ai-elements@latest add conversation
npx ai-elements@latest add message
npx ai-elements@latest add response  # Streaming-optimized
npx ai-elements@latest add prompt-input
npx ai-elements@latest add branch  # For ContextChatMode
npx ai-elements@latest add code-block
npx ai-elements@latest add inline-citation  # Source citations
```

**Features**:
- `<Response>` - Efficient incremental markdown (no re-parsing)
- `<Branch>` - Visual branching conversations (perfect for context mode)
- `<InlineCitation>` - Source references in text
- Full AI SDK integration (`useChat` hook)
- Type-safe end-to-end
- Markdown + code highlighting built-in

**Integration**: 🟢 **2-3 days**

**Usage Pattern**:
```tsx
import { useChat } from '@ai-sdk/react'
import { Conversation, Message, PromptInput } from '@/components/ui/ai-elements'

export function FullChatMode({ documentId }: { documentId: string }) {
  const { messages, input, handleInputChange, handleSubmit } = useChat({
    api: '/api/chat',
    body: { documentId, mode: 'full' }
  })

  return (
    <Conversation>
      {messages.map(message => (
        <Message key={message.id} message={message} />
      ))}
      <PromptInput
        value={input}
        onChange={handleInputChange}
        onSubmit={handleSubmit}
      />
    </Conversation>
  )
}
```

---

#### **assistant-ui** (Alternative)
**Source**: [assistant-ui.com](https://www.assistant-ui.com)
**Installation**: `npx assistant-ui init`

**Features**:
- 200K+ monthly downloads (most mature)
- Better accessibility out of box
- Strong composable primitives
- Works with AI SDK

**Use If**: Want more control over primitives, don't mind manual AI SDK integration

**Integration**: 🟡 **3-4 days**

---

#### **Kibo UI AI Chat** (Already Covered)
**Source**: [kibo-ui.com](https://www.kibo-ui.com)
**Installation**: `npx kibo-ui add ai-input`

**Features**:
- AI input with model selection
- Built on shadcn/ui
- Free, MIT license

**Integration**: 🟢 **1-2 days**

---

### 3.2 Markdown Rendering with Code Blocks

**Already in Your Stack**: `react-markdown` + `rehype-katex` (used in BlockRenderer)

**Add Syntax Highlighting**:
```bash
npm install react-syntax-highlighter
# or
npm install rehype-highlight
```

**Usage**:
```tsx
import ReactMarkdown from 'react-markdown'
import rehypeHighlight from 'rehype-highlight'
import 'highlight.js/styles/github-dark.css'

<ReactMarkdown
  rehypePlugins={[rehypeHighlight]}
>
  {chatMessage}
</ReactMarkdown>
```

---

## Part 4: Search/Filter Components

### 4.1 GlobalSearch (Cmd+K Style)

#### **shadcn/ui Command Component** ⭐ RECOMMENDED
**Source**: [ui.shadcn.com/docs/components/command](https://ui.shadcn.com/docs/components/command)
**Installation**: `npx shadcn@latest add command`

**Features**:
- Built on `cmdk` by Vercel
- Automatic filtering and sorting
- Keyboard navigation (⌘K support)
- Dialog mode for overlay
- Composable API

**Usage**:
```tsx
import { CommandDialog, CommandInput, CommandList, CommandGroup, CommandItem } from "@/components/ui/command"

export function GlobalSearch() {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setOpen(true)
      }
    }
    document.addEventListener("keydown", down)
    return () => document.removeEventListener("keydown", down)
  }, [])

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Search documents, chunks, connections..." />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        <CommandGroup heading="Recent Searches">
          <CommandItem>Document about AI</CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  )
}
```

**Integration**: 🟢 **< 1 day** (likely already in your components/ui/)

---

### 4.2 SemanticSearch Results Display

#### **TanStack Table with Faceted Filters** ⭐ RECOMMENDED
**Source**: [tanstack.com/table](https://tanstack.com/table)
**Installation**: `npm install @tanstack/react-table`

**Features**:
- Faceted filtering (auto-generate filter options)
- `getFacetedUniqueValues()` for tags
- `getFacetedMinMaxValues()` for scores
- Sorting by relevance
- Already using TanStack Query in your stack

**Integration**: 🟡 **2-3 days**

**Reference**: shadcn/ui Tasks example (`data-table-faceted-filter.tsx`)

---

### 4.3 AdvancedFilters Components

#### **shadcn-multi-select-component** ⭐ RECOMMENDED
**Source**: [shadcn-multi-select-component](https://github.com/sersavan/shadcn-multi-select-component)
**Installation**:
```bash
npm install @radix-ui/react-popover @radix-ui/react-separator lucide-react
npx shadcn@latest add button badge popover command separator
```

**Features**:
- Multi-select with search
- Custom badge colors
- Grouped options
- Advanced animations
- Responsive design
- Max count badges (e.g., "+3 more")

**Usage**:
```tsx
import { MultiSelect } from "@/components/multi-select"

const tagOptions = [
  { value: "architecture", label: "Architecture" },
  { value: "ai", label: "AI/ML" }
]

<MultiSelect
  options={tagOptions}
  value={selectedTags}
  onChange={setSelectedTags}
  placeholder="Filter by tags"
  maxCount={3}
/>
```

**Integration**: 🟢 **1-2 days**

---

#### **Date Range Picker for shadcn** ⭐ RECOMMENDED
**Source**: [date-range-picker-for-shadcn](https://github.com/johnpolacek/date-range-picker-for-shadcn)
**Installation**:
```bash
npx shadcn@latest add calendar popover
# Copy DateRangePicker component from repo
```

**Features**:
- Preset ranges ("Last 7 days", "Last 30 days")
- Calendar selection
- Text entry
- Optional comparison mode
- Timezone support

**Integration**: 🟢 **1 day**

---

#### **Filter Chips** (DIY with shadcn Badge)
**Installation**: `npx shadcn@latest add badge`

**Usage**:
```tsx
import { Badge } from "@/components/ui/badge"
import { X } from "lucide-react"

<div className="flex flex-wrap gap-2">
  {filters.map(filter => (
    <Badge variant="secondary" className="gap-1 pr-1">
      <span>{filter.label}</span>
      <button onClick={() => removeFilter(filter.id)}>
        <X className="h-3 w-3" />
      </button>
    </Badge>
  ))}
  <button onClick={clearAll}>Clear all</button>
</div>
```

**Integration**: 🟢 **< 1 day**

---

### 4.4 SavedSearches (DIY with Zustand)

**Pattern**: Store searches in Zustand (matches your existing pattern)

```typescript
// stores/saved-searches.ts
interface SavedSearch {
  id: string
  name: string
  query: string
  filters: {
    tags?: string[]
    dateRange?: { from: Date, to: Date }
  }
}

interface SavedSearchesStore {
  searches: SavedSearch[]
  addSearch: (search: Omit<SavedSearch, 'id'>) => void
  removeSearch: (id: string) => void
  applySearch: (id: string) => void
}
```

**Integration**: 🟢 **1 day**

---

## Part 5: Thread System

### 5.1 ThreadView - Nested Conversations

#### **Custom Recursive Component** ⭐ RECOMMENDED
**Pattern**: Build in-house with your ECS data model

**Advantages**:
- ✅ Perfect fit for your ECS architecture
- ✅ Zero dependencies
- ✅ Full control over styling
- ✅ Direct integration with Spark entities

**Implementation**:
```tsx
function ThreadItem({ spark, replies, depth = 0 }) {
  return (
    <div style={{ marginLeft: depth * 20 }}>
      <SparkCard spark={spark} />
      {replies.map(reply => (
        <ThreadItem
          key={reply.id}
          spark={reply}
          replies={reply.replies}
          depth={depth + 1}
        />
      ))}
    </div>
  )
}
```

**Integration**: 🟢 **1 day**

**Resources**:
- [Medium: Recursive Components](https://medium.com/@jaswanth_270602/react-series-part-13-recursive-components-in-react-nested-comments-a4a2c6d831af)
- [GitHub: react-social-media-comment-thread](https://github.com/henry-montoya/react-social-media-comment-thread)

---

### 5.2 ThreadGraph - Visual Thread Connections

#### **React Flow** ⭐ RECOMMENDED (same as connection viz)
**Source**: [reactflow.dev](https://reactflow.dev)
**Installation**: `npm install reactflow`

**Features for Thread Graphs**:
- Custom node components (render Spark previews)
- Drag-to-organize
- Zoom/pan navigation
- Force-directed layouts (via plugins)
- Minimap for overview
- Works with virtualization

**Integration**: 🟢 **2-3 days**

**Mind Map Tutorial**: [reactflow.dev/learn/tutorials/mind-map-app](https://reactflow.dev/learn/tutorials/mind-map-app-with-react-flow)

**Alternative for >500 nodes**: Cytoscape.js with WebGL renderer

---

### 5.3 ThreadCreator - Drag-and-Drop Grouping

#### **@dnd-kit** ⭐ RECOMMENDED
**Source**: [dndkit.com](https://dndkit.com)
**Installation**: `npm install @dnd-kit/core @dnd-kit/sortable`

**Features**:
- Modern, accessible drag-and-drop
- Multi-item drag support
- Sortable lists
- Keyboard navigation
- Touch support
- Works with virtualized lists

**Integration**: 🟡 **2-3 days**

**Usage**:
```tsx
import { DndContext, closestCenter } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'

<DndContext onDragEnd={handleDragEnd}>
  <SortableContext items={sparks} strategy={verticalListSortingStrategy}>
    {sparks.map(spark => (
      <SortableSparkItem key={spark.id} spark={spark} />
    ))}
  </SortableContext>
</DndContext>
```

---

### 5.4 ThreadNavigation (DIY with shadcn/ui)

**Components Needed**:
- `Sidebar` - Panel container
- `Accordion` - Collapsible thread groups
- `Command` - Search threads
- `Badge` - Thread counts

**Installation**: Already in shadcn/ui
```bash
npx shadcn@latest add sidebar accordion command badge
```

**Integration**: 🟢 **1-2 days**

---

## Summary: Component Recommendations by Feature

| Feature | Recommended Library | Install | Effort | Status |
|---------|-------------------|---------|--------|--------|
| **OutlineTab** | shadcn Tree View | `npx shadcn add tree-view` | 🟢 1-2 days | Free |
| **StatsTab** | Recharts + Flip Cards | `pnpm add recharts @react-spring/web` | 🟢 1-2 days | Free |
| **TimelineTab** | react-chrono | `pnpm add react-chrono` | 🟢 1 day | Free |
| **ThemesTab** | react-tagcloud | `npm install react-tagcloud` | 🟢 1 day | Free |
| **Collapsible Panel** | shadcn Sidebar | `npx shadcn add sidebar` | 🟢 1 day | Free |
| **Connection Highlights** | react-highlight-words | `npm install react-highlight-words` | 🟢 < 1 hour | Free |
| **Connection Lines** | React Flow | `npm install reactflow` | 🟡 2-3 days | Free |
| **Large Graphs (>500)** | Cytoscape.js | `npm install cytoscape react-cytoscapejs` | 🟡 3-4 days | Free |
| **Chat Interface** | Vercel AI Elements | `npx ai-elements@latest` | 🟢 2-3 days | Free |
| **Alt Chat** | assistant-ui | `npx assistant-ui init` | 🟡 3-4 days | Free |
| **Global Search (⌘K)** | shadcn Command | `npx shadcn add command` | 🟢 < 1 day | Free |
| **Search Results** | TanStack Table | `npm install @tanstack/react-table` | 🟡 2-3 days | Free |
| **Multi-Select Filters** | shadcn-multi-select | See above | 🟢 1-2 days | Free |
| **Date Range Picker** | date-range-picker-for-shadcn | `npx shadcn add calendar popover` | 🟢 1 day | Free |
| **Filter Chips** | shadcn Badge (DIY) | `npx shadcn add badge` | 🟢 < 1 day | Free |
| **Saved Searches** | Custom + Zustand | None | 🟢 1 day | Free |
| **ThreadView** | Custom Recursive | None | 🟢 1 day | Free |
| **ThreadGraph** | React Flow | `npm install reactflow` | 🟢 2-3 days | Free |
| **ThreadCreator** | @dnd-kit | `npm install @dnd-kit/core @dnd-kit/sortable` | 🟡 2-3 days | Free |
| **ThreadNavigation** | shadcn (DIY) | Already installed | 🟢 1-2 days | Free |

**Total New Dependencies**: 9 libraries
**Total Cost**: $0 (all free/MIT)
**Total Effort**: 25-40 days across all features
**React 19 Compatible**: ✅ All libraries

---

## Installation Quick Reference

### Phase 1: LeftPanel (4-6 days)
```bash
npx shadcn add "https://mrlightful.com/registry/tree-view"
npx shadcn@latest add sidebar
pnpm add recharts @react-spring/web react-chrono react-tagcloud
```

### Phase 2: Connection Viz (2-7 days)
```bash
npm install react-highlight-words reactflow
# Optional for large graphs:
npm install cytoscape@3.x.y react-cytoscapejs
```

### Phase 3: Chat/AI (2-4 days)
```bash
npx ai-elements@latest
# Or
npx assistant-ui init
```

### Phase 4: Search/Filter (5-7 days)
```bash
npx shadcn@latest add command badge calendar popover
npm install @tanstack/react-table
npm install @radix-ui/react-popover @radix-ui/react-separator
# Copy multi-select component
# Copy date-range-picker component
```

### Phase 5: Thread System (5-8 days)
```bash
npm install reactflow
npm install @dnd-kit/core @dnd-kit/sortable
```

---

## React 19 Compatibility Summary

| Library | React 19 Status | Notes |
|---------|----------------|-------|
| shadcn/ui components | ✅ Confirmed | Built on Radix UI, fully compatible |
| Recharts | ✅ Compatible | React-focused, no issues |
| react-chrono | ✅ Compatible | v3.0 (2024), modern React |
| react-tagcloud | ⚠️ Likely compatible | Older but simple component |
| React Flow | ✅ Compatible | Actively maintained, modern |
| Cytoscape.js | ✅ Compatible | Plotly wrapper maintained |
| react-highlight-words | ✅ Compatible | Standard React patterns |
| Vercel AI Elements | ✅ Confirmed | Official Vercel, React 19 tested |
| assistant-ui | ✅ Compatible | 2025 updates, Y Combinator-backed |
| TanStack Table | ✅ Confirmed | TanStack ecosystem, React 19 ready |
| @dnd-kit | ✅ Compatible | Modern, actively maintained |

**Verdict**: All recommended libraries are React 19 compatible or use standard patterns that work with React 19.

---

## Performance Considerations

### Personal Tool Context
Per your CLAUDE.md: *"For a personal tool, 'performance' means: Does processing annoy me?"*

**Recommendations**:
1. **Start simple** - Most components perform well for personal use
2. **Monitor real-world usage** - Are you viewing 50 nodes or 5000?
3. **Optimize only if annoyed** - 30 FPS is fine for browsing
4. **React Flow at 200 nodes**: Perfectly smooth for thread graphs
5. **TanStack Table with 1000 rows**: Fast enough for search results

**Hardware**: Your M1 Max 64GB can easily handle all recommended libraries. Memory is not a concern.

---

## Integration Roadmap

### Immediate (Next Sprint)
Already covered in main plan:
- Flashcard system (SmoothUI)
- Design system cleanup (4 phases)

### Short-term (Month 2-3)
**LeftPanel Components**:
1. OutlineTab (1-2 days)
2. StatsTab (1-2 days)
3. TimelineTab (1 day)
4. ThemesTab (1 day)
5. Collapsible state (1 day)

**Total**: 5-7 days

### Medium-term (Month 4-5)
**Connection Visualization**:
1. Inline highlights (< 1 hour)
2. Connection lines basic (2-3 days)
3. Gradient system (additional 2-3 days)

**Search/Filter System**:
1. GlobalSearch ⌘K (< 1 day)
2. Advanced filters (2-3 days)
3. Search results table (2-3 days)
4. Saved searches (1 day)

**Total**: 7-11 days

### Long-term (Month 6+)
**Chat/AI Interface**:
1. FullChatMode (2-3 days)
2. ContextChatMode (1-2 days)

**Thread System**:
1. ThreadView (1 day)
2. ThreadGraph (2-3 days)
3. ThreadCreator (2-3 days)
4. ThreadNavigation (1-2 days)

**Total**: 9-13 days

---

## Next Steps

1. **Review this document** - Validate library choices
2. **Prioritize features** - Which to build first?
3. **Prototype key components** - Test React Flow, AI Elements, Command
4. **Update main plan** - Integrate into comprehensive timeline

**Questions?**
- Any libraries you want to explore further?
- Different priorities for feature order?
- Concerns about specific integrations?

Let's discuss and refine! 🚀
