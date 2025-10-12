# Edge-Based Navigation - Implementation Gameplan

**Status**: Planning Phase
**Estimated Time**: 18-24 hours (2-3 weeks at 8 hours/week)
**Complexity**: Medium
**Risk Level**: Low

---

## Executive Summary

Replace the current ReaderLayout with the edge-based navigation system from EdgeNavigationDemo. This is a **direct replacement**, not a toggle—we're building a greenfield app and not concerned with backward compatibility.

**Key Principle**: Ship the brutalist/retro edge navigation as the primary (and only) reader UI.

---

## Phase 1: Foundation & Store Updates
**Duration**: 3-4 hours
**Files Modified**: 2
**New Files**: 1

### 1.1 Update UIStore (1 hour)

**File**: `src/stores/ui-store.ts`

**Add panel state**:
```typescript
interface UIStore {
  // EXISTING
  viewMode: 'explore' | 'focus' | 'study'
  quickCaptureOpen: boolean
  setViewMode: (mode: 'explore' | 'focus' | 'study') => void
  openQuickCapture: () => void
  closeQuickCapture: () => void

  // NEW - Edge panel controls
  leftPanelOpen: boolean
  rightPanelOpen: boolean
  showRetroDecorations: boolean

  // NEW - Actions
  toggleLeftPanel: () => void
  toggleRightPanel: () => void
  closeLeftPanel: () => void
  closeRightPanel: () => void
  toggleRetroDecorations: () => void
  resetPanelState: () => void
}
```

**Add persistence**:
```typescript
import { persist } from 'zustand/middleware'

export const useUIStore = create<UIStore>()(
  persist(
    (set) => ({
      // Existing state
      viewMode: 'explore',
      quickCaptureOpen: false,

      // NEW - Panel state (don't persist open/closed, only decorations preference)
      leftPanelOpen: false,
      rightPanelOpen: false,
      showRetroDecorations: true,

      // Existing actions
      setViewMode: (mode) => set({ viewMode: mode }),
      openQuickCapture: () => set({ quickCaptureOpen: true }),
      closeQuickCapture: () => set({ quickCaptureOpen: false }),

      // NEW - Panel actions
      toggleLeftPanel: () => set((state) => ({ leftPanelOpen: !state.leftPanelOpen })),
      toggleRightPanel: () => set((state) => ({ rightPanelOpen: !state.rightPanelOpen })),
      closeLeftPanel: () => set({ leftPanelOpen: false }),
      closeRightPanel: () => set({ rightPanelOpen: false }),
      toggleRetroDecorations: () => set((state) => ({ showRetroDecorations: !state.showRetroDecorations })),
      resetPanelState: () => set({ leftPanelOpen: false, rightPanelOpen: false }),
    }),
    {
      name: 'rhizome-ui-preferences',
      partialize: (state) => ({
        showRetroDecorations: state.showRetroDecorations,
        // Don't persist panel open state - reset on page load
      }),
    }
  )
)
```

**Testing**:
- [ ] Verify localStorage persistence for decorations
- [ ] Test panel toggle actions
- [ ] Ensure resetPanelState works

---

### 1.2 Extend ReaderStore for Outline (1-2 hours)

**File**: `src/stores/reader-store.ts`

**Add outline types and state**:
```typescript
export interface OutlineNode {
  id: string
  chunkId: string
  level: number // 1-6 for h1-h6
  title: string
  startOffset: number
  endOffset: number
  children?: OutlineNode[]
}

interface ReaderStore {
  // EXISTING
  documentId: string | null
  documentTitle: string
  markdownContent: string
  chunks: Chunk[]
  visibleChunks: Chunk[]
  scrollPosition: number
  loadDocument: (id: string, title: string, markdown: string, chunks: Chunk[]) => void
  updateScroll: (position: number) => void

  // NEW - Outline
  outline: OutlineNode[]
  activeOutlineNode: string | null
  generateOutline: () => void
  setActiveOutlineNode: (nodeId: string | null) => void
  scrollToOutlineNode: (nodeId: string) => void
}
```

**Implementation**:
```typescript
// Helper: Build hierarchical outline tree
function buildOutlineTree(flatNodes: OutlineNode[]): OutlineNode[] {
  const root: OutlineNode[] = []
  const stack: OutlineNode[] = []

  for (const node of flatNodes) {
    // Pop stack until we find a parent with lower level
    while (stack.length > 0 && stack[stack.length - 1].level >= node.level) {
      stack.pop()
    }

    if (stack.length === 0) {
      // Top-level node
      root.push(node)
    } else {
      // Child node
      const parent = stack[stack.length - 1]
      if (!parent.children) parent.children = []
      parent.children.push(node)
    }

    stack.push(node)
  }

  return root
}

// Helper: Find node by ID in tree
function findNodeById(nodes: OutlineNode[], id: string): OutlineNode | null {
  for (const node of nodes) {
    if (node.id === id) return node
    if (node.children) {
      const found = findNodeById(node.children, id)
      if (found) return found
    }
  }
  return null
}

export const useReaderStore = create<ReaderStore>((set, get) => ({
  // Existing state and actions...
  outline: [],
  activeOutlineNode: null,

  generateOutline: () => {
    const { markdownContent, chunks } = get()
    const flatOutline: OutlineNode[] = []

    // Parse markdown for headings (H1-H6)
    const headingRegex = /^(#{1,6})\s+(.+)$/gm
    let match

    while ((match = headingRegex.exec(markdownContent)) !== null) {
      const level = match[1].length
      const title = match[2].trim()
      const startOffset = match.index

      // Find corresponding chunk
      const chunk = chunks.find(
        c => c.start_offset <= startOffset && c.end_offset >= startOffset
      )

      flatOutline.push({
        id: `outline-${startOffset}`,
        chunkId: chunk?.id || '',
        level,
        title,
        startOffset,
        endOffset: startOffset + match[0].length,
      })
    }

    // Build hierarchical tree
    const hierarchical = buildOutlineTree(flatOutline)
    set({ outline: hierarchical })
  },

  scrollToOutlineNode: (nodeId: string) => {
    const { outline } = get()
    const node = findNodeById(outline, nodeId)

    if (!node) return

    // Find Virtuoso scroll container
    const virtuosoContainer = document.querySelector('[data-virtuoso-scroller]') as HTMLElement
    if (!virtuosoContainer) return

    // Calculate proportional scroll position
    const markdownLength = get().markdownContent.length
    const targetScrollTop = (node.startOffset / markdownLength) * virtuosoContainer.scrollHeight

    // Smooth scroll
    virtuosoContainer.scrollTo({
      top: targetScrollTop,
      behavior: 'smooth'
    })

    // Set active node
    set({ activeOutlineNode: nodeId })
  },

  setActiveOutlineNode: (nodeId) => set({ activeOutlineNode: nodeId }),
}))
```

**Testing**:
- [ ] Test outline generation with various markdown structures
- [ ] Verify hierarchical nesting works (H1 > H2 > H3)
- [ ] Test scroll-to-section functionality
- [ ] Ensure outline updates when document changes

---

### 1.3 Create Brutalist CSS Module (1 hour)

**File**: `src/styles/brutalist.css`

```css
/* Brutalist Theme - Edge Navigation */

:root {
  --brutalist-border: 4px;
  --brutalist-border-thick: 6px;
  --brutalist-border-heavy: 8px;
  --brutalist-shadow: 6px;
  --brutalist-black: #000000;
  --brutalist-white: #ffffff;
  --brutalist-red: #ef4444;
  --brutalist-yellow: #fde047;
  --brutalist-bg: #e8f5e9;
}

/* Border Utilities */
.brutalist-border {
  border: var(--brutalist-border) solid var(--brutalist-black);
}

.brutalist-border-thick {
  border: var(--brutalist-border-thick) solid var(--brutalist-black);
}

.brutalist-border-heavy {
  border: var(--brutalist-border-heavy) solid var(--brutalist-black);
}

/* Shadow Utilities */
.brutalist-shadow {
  box-shadow: var(--brutalist-shadow) var(--brutalist-shadow) 0 0 var(--brutalist-black);
}

.brutalist-shadow-sm {
  box-shadow: 3px 3px 0 0 var(--brutalist-black);
}

.brutalist-shadow-lg {
  box-shadow: 8px 8px 0 0 var(--brutalist-black);
}

/* Interactive Button */
.brutalist-button {
  @apply brutalist-border-thick brutalist-shadow;
  transition: all 0.1s ease;
}

.brutalist-button:active {
  box-shadow: 3px 3px 0 0 var(--brutalist-black);
  transform: translate(3px, 3px);
}

/* Edge Trigger */
.brutalist-edge-trigger {
  @apply bg-black text-white brutalist-border;
  writing-mode: vertical-rl;
  text-orientation: mixed;
  transform: rotate(180deg);
  transition: width 0.2s ease, background-color 0.2s ease;
  will-change: width;
}

.brutalist-edge-trigger:hover {
  @apply bg-red-600;
}

/* Panel */
.brutalist-panel {
  @apply bg-white brutalist-border;
  will-change: transform;
}

/* Checkered Pattern */
.brutalist-checkered {
  background-image:
    linear-gradient(45deg, var(--brutalist-black) 25%, transparent 25%),
    linear-gradient(-45deg, var(--brutalist-black) 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, var(--brutalist-black) 75%),
    linear-gradient(-45deg, transparent 75%, var(--brutalist-black) 75%);
  background-size: 16px 16px;
  background-position: 0 0, 0 8px, 8px -8px, -8px 0px;
}
```

**Import in**: `src/app/globals.css`

```css
@import './brutalist.css';
```

**Testing**:
- [ ] Verify CSS variables work
- [ ] Test utilities on sample elements
- [ ] Ensure no conflicts with Tailwind

---

## Phase 2: Build Edge Navigation Components
**Duration**: 6-8 hours
**New Files**: 6

### 2.1 EdgeTrigger Component (1 hour)

**File**: `src/components/reader/edge-navigation/EdgeTrigger.tsx`

```typescript
'use client'

import { motion } from 'framer-motion'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

interface EdgeTriggerProps {
  side: 'left' | 'right'
  label: string
  isOpen: boolean
  onClick: () => void
}

/**
 * Clickable edge panel trigger with vertical text.
 * @param props - Component props.
 * @returns Edge trigger button with animations.
 */
export function EdgeTrigger({ side, label, isOpen, onClick }: EdgeTriggerProps) {
  const ChevronIcon = side === 'left' ? ChevronRight : ChevronLeft

  return (
    <motion.button
      className={cn(
        'brutalist-edge-trigger relative group flex items-center justify-center',
        side === 'left' ? 'border-r-4' : 'border-l-4'
      )}
      onClick={onClick}
      whileHover={{ width: 56 }}
      initial={{ width: 48 }}
      animate={{ width: isOpen ? 56 : 48 }}
      aria-label={`${isOpen ? 'Close' : 'Open'} ${label}`}
      aria-expanded={isOpen}
    >
      <div className="text-xs font-black tracking-widest">
        {label.toUpperCase()}
      </div>
      <ChevronIcon
        className={cn(
          'absolute opacity-0 group-hover:opacity-100 transition-opacity',
          side === 'left' ? 'right-2' : 'left-2'
        )}
        size={16}
      />
    </motion.button>
  )
}
```

---

### 2.2 LeftEdgePanel Component (1-2 hours)

**File**: `src/components/reader/edge-navigation/LeftEdgePanel.tsx`

```typescript
'use client'

import { useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useReaderStore } from '@/stores/reader-store'
import { useUIStore } from '@/stores/ui-store'
import { cn } from '@/lib/utils'
import type { OutlineNode } from '@/stores/reader-store'

/**
 * Left edge panel showing document outline with hierarchical navigation.
 * @returns Left panel with outline tree.
 */
export function LeftEdgePanel() {
  const outline = useReaderStore(state => state.outline)
  const activeOutlineNode = useReaderStore(state => state.activeOutlineNode)
  const generateOutline = useReaderStore(state => state.generateOutline)
  const scrollToOutlineNode = useReaderStore(state => state.scrollToOutlineNode)
  const leftPanelOpen = useUIStore(state => state.leftPanelOpen)
  const closeLeftPanel = useUIStore(state => state.closeLeftPanel)

  // Generate outline when panel opens
  useEffect(() => {
    if (leftPanelOpen && outline.length === 0) {
      generateOutline()
    }
  }, [leftPanelOpen, outline.length, generateOutline])

  return (
    <AnimatePresence>
      {leftPanelOpen && (
        <motion.div
          className="w-80 bg-white brutalist-border-thick border-r-4 border-black h-full"
          initial={{ x: -320 }}
          animate={{ x: 0 }}
          exit={{ x: -320 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        >
          <div className="h-full flex flex-col">
            {/* Header */}
            <div className="p-4 border-b-4 border-black flex items-center justify-between bg-white">
              <h2 className="font-black text-lg uppercase">Outline</h2>
              <Button
                variant="ghost"
                size="icon"
                onClick={closeLeftPanel}
                className="brutalist-border"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
            </div>

            {/* Outline tree */}
            <ScrollArea className="flex-1">
              <div className="p-4 space-y-2">
                {outline.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">
                    No headings found in document
                  </p>
                ) : (
                  outline.map((node) => (
                    <OutlineTreeNode
                      key={node.id}
                      node={node}
                      activeId={activeOutlineNode}
                      onNodeClick={scrollToOutlineNode}
                    />
                  ))
                )}
              </div>
            </ScrollArea>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

/**
 * Recursive outline tree node component.
 */
function OutlineTreeNode({
  node,
  activeId,
  onNodeClick,
}: {
  node: OutlineNode
  activeId: string | null
  onNodeClick: (nodeId: string) => void
}) {
  const isActive = node.id === activeId

  return (
    <div>
      <button
        onClick={() => onNodeClick(node.id)}
        className={cn(
          'w-full text-left p-2 text-sm font-bold transition-all brutalist-border-thick border-2',
          isActive
            ? 'bg-yellow-300 border-black brutalist-shadow-sm'
            : 'bg-white border-transparent hover:border-black hover:bg-yellow-100'
        )}
        style={{
          paddingLeft: `${node.level * 12 + 8}px`,
        }}
      >
        <div className="flex items-center justify-between gap-2">
          <span className="flex-1 truncate">{node.title}</span>
          <Badge variant="outline" className="font-mono text-xs brutalist-border">
            H{node.level}
          </Badge>
        </div>
      </button>

      {/* Render children recursively */}
      {node.children && node.children.length > 0 && (
        <div className="ml-2 mt-1 space-y-1 border-l-2 border-black pl-2">
          {node.children.map((child) => (
            <OutlineTreeNode
              key={child.id}
              node={child}
              activeId={activeId}
              onNodeClick={onNodeClick}
            />
          ))}
        </div>
      )}
    </div>
  )
}
```

---

### 2.3 BrutalistTopBar Component (1 hour)

**File**: `src/components/reader/edge-navigation/BrutalistTopBar.tsx`

```typescript
'use client'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { motion } from 'framer-motion'
import { User, RefreshCw } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

interface BrutalistTopBarProps {
  documentId: string
  title: string
  wordCount?: number
  chunkCount?: number
  connectionCount?: number
}

/**
 * Brutalist-styled top navigation bar.
 * @param props - Component props.
 * @returns Top bar component.
 */
export function BrutalistTopBar({
  documentId,
  title,
  wordCount,
  chunkCount,
  connectionCount,
}: BrutalistTopBarProps) {
  const [isReprocessing, setIsReprocessing] = useState(false)

  const handleReprocess = async () => {
    setIsReprocessing(true)
    toast.info('Document reprocessing', {
      description: 'This may take a few minutes...',
    })

    try {
      const response = await fetch('/api/documents/reprocess', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentId }),
      })

      if (response.ok) {
        toast.success('Reprocessing started')
      } else {
        throw new Error('Reprocessing failed')
      }
    } catch (error) {
      toast.error('Failed to reprocess document')
      console.error(error)
    } finally {
      setIsReprocessing(false)
    }
  }

  return (
    <motion.div
      className="h-16 bg-white brutalist-border-heavy border-b-4 border-black flex items-center justify-between px-6"
      initial={{ y: -100 }}
      animate={{ y: 0 }}
      transition={{ type: 'spring', damping: 20 }}
    >
      {/* Logo */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-black rounded-full flex items-center justify-center brutalist-border">
          <div className="w-6 h-6 bg-[#e8f5e9] rounded-full" />
        </div>
        <span className="text-2xl font-black tracking-tight">RHIZOME</span>
      </div>

      {/* Document title */}
      <div className="flex-1 mx-8 text-center">
        <h1 className="font-black text-lg truncate uppercase">{title}</h1>
      </div>

      {/* Stats */}
      <div className="flex items-center gap-3">
        {wordCount && (
          <Badge className="brutalist-border font-mono" variant="outline">
            {wordCount.toLocaleString()} words
          </Badge>
        )}
        {chunkCount && (
          <Badge className="brutalist-border font-mono" variant="outline">
            {chunkCount} chunks
          </Badge>
        )}
        {connectionCount !== undefined && (
          <Badge className="brutalist-border font-mono bg-yellow-300" variant="outline">
            {connectionCount} connections
          </Badge>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 ml-4">
        <Button
          variant="outline"
          size="icon"
          className="brutalist-border-thick border-black"
          onClick={handleReprocess}
          disabled={isReprocessing}
          title="Reprocess document"
        >
          <RefreshCw className={cn('h-4 w-4', isReprocessing && 'animate-spin')} />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="rounded-full brutalist-border"
        >
          <User className="h-5 w-5" />
        </Button>
      </div>
    </motion.div>
  )
}
```

---

### 2.4 BottomControlPanel Component (1-2 hours)

**File**: `src/components/reader/edge-navigation/BottomControlPanel.tsx`

```typescript
'use client'

import { Button } from '@/components/ui/button'
import { motion } from 'framer-motion'
import {
  MessageSquare,
  Eye,
  Type as TypeIcon,
  Brain,
  Sparkles,
  Gauge,
} from 'lucide-react'
import { useUIStore } from '@/stores/ui-store'
import { useReaderStore } from '@/stores/reader-store'
import { cn } from '@/lib/utils'

interface BottomControlPanelProps {
  documentId: string
  wordCount?: number
}

/**
 * Bottom control panel with view modes, chat, spark, and progress.
 * @param props - Component props.
 * @returns Bottom panel component.
 */
export function BottomControlPanel({ documentId, wordCount }: BottomControlPanelProps) {
  const viewMode = useUIStore(state => state.viewMode)
  const setViewMode = useUIStore(state => state.setViewMode)
  const openQuickCapture = useUIStore(state => state.openQuickCapture)
  const scrollPosition = useReaderStore(state => state.scrollPosition)
  const markdownContent = useReaderStore(state => state.markdownContent)

  // Calculate reading progress
  const totalChars = markdownContent.length
  const estimatedScrolledChars = Math.floor((scrollPosition / 100) * totalChars)
  const progressPercent = totalChars > 0
    ? Math.min(Math.floor((estimatedScrolledChars / totalChars) * 100), 100)
    : 0

  return (
    <motion.div
      className="h-20 bg-white brutalist-border-heavy brutalist-shadow-lg flex items-center justify-between px-6 gap-4"
      initial={{ y: 100 }}
      animate={{ y: 0 }}
      transition={{ type: 'spring', damping: 20, delay: 0.2 }}
    >
      {/* Chat button (bottom left) */}
      <Button
        className="brutalist-button bg-red-600 hover:bg-red-700 text-white font-black px-6 h-auto py-3"
        onClick={() => {
          // TODO: Implement chat functionality
          console.log('Chat with document:', documentId)
        }}
      >
        <MessageSquare className="h-4 w-4 mr-2" />
        CHAT
      </Button>

      {/* View mode controls (center) */}
      <div className="flex items-center gap-2">
        {(['explore', 'focus', 'study'] as const).map((mode) => {
          const Icon = mode === 'explore' ? Eye : mode === 'focus' ? TypeIcon : Brain
          const isActive = viewMode === mode

          return (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              className={cn(
                'px-4 py-2 font-black text-sm brutalist-border-thick uppercase transition-all',
                isActive
                  ? 'bg-yellow-300 border-black brutalist-shadow-sm'
                  : 'bg-white border-black hover:bg-gray-100'
              )}
            >
              <Icon className="h-4 w-4 inline mr-1" />
              {mode}
            </button>
          )
        })}
      </div>

      {/* Text options */}
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="icon"
          className="brutalist-border-thick border-black hover:bg-gray-100"
          title="Text formatting"
        >
          <TypeIcon className="h-4 w-4" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          className="brutalist-border-thick border-black hover:bg-gray-100"
          title="Reading speed"
        >
          <Gauge className="h-4 w-4" />
        </Button>
      </div>

      {/* Progress indicator */}
      <div className="flex items-center gap-3">
        <div className="flex flex-col items-end">
          <span className="text-xs font-mono font-bold">PROGRESS</span>
          <span className="text-lg font-black">{progressPercent}%</span>
        </div>
        <div className="w-32 h-3 brutalist-border-thick border-black bg-white overflow-hidden">
          <motion.div
            className="h-full bg-red-600"
            initial={{ width: 0 }}
            animate={{ width: `${progressPercent}%` }}
            transition={{ duration: 0.3 }}
          />
        </div>
      </div>

      {/* Spark button (bottom right) */}
      <Button
        className="brutalist-button bg-yellow-300 hover:bg-yellow-400 text-black font-black px-6 h-auto py-3"
        onClick={openQuickCapture}
      >
        <Sparkles className="h-4 w-4 mr-2" />
        SPARK
      </Button>
    </motion.div>
  )
}
```

---

### 2.5 RetroDecorations Component (30 min)

**File**: `src/components/reader/edge-navigation/RetroDecorations.tsx`

```typescript
'use client'

import { motion } from 'framer-motion'
import { useUIStore } from '@/stores/ui-store'
import { cn } from '@/lib/utils'

/**
 * Retro decorations overlay (pixels, corners, checkered footer).
 * @returns Decorations overlay component.
 */
export function RetroDecorations() {
  const showDecorations = useUIStore(state => state.showRetroDecorations)

  if (!showDecorations) return null

  return (
    <div className="absolute inset-0 pointer-events-none z-10">
      {/* Corner squares */}
      <div className="absolute top-4 right-4 w-3 h-3 bg-black" />
      <div className="absolute top-8 right-8 w-2 h-2 bg-black" />
      <div className="absolute top-12 right-12 w-4 h-4 bg-black" />
      <div className="absolute bottom-20 left-4 w-3 h-3 bg-black" />
      <div className="absolute bottom-24 left-8 w-2 h-2 bg-black" />

      {/* Animated pixel decorations */}
      {[...Array(8)].map((_, i) => (
        <motion.div
          key={i}
          className="absolute w-2 h-2 bg-black"
          style={{
            top: `${20 + i * 10}%`,
            right: `${5 + (i % 3) * 15}%`,
          }}
          initial={{ opacity: 0.3 }}
          animate={{ opacity: [0.3, 0.8, 0.3] }}
          transition={{
            duration: 2,
            delay: i * 0.2,
            repeat: Infinity,
          }}
        />
      ))}

      {/* Checkered footer (above bottom panel) */}
      <div className="absolute bottom-20 left-0 right-0 h-2 flex">
        {[...Array(40)].map((_, i) => (
          <div
            key={i}
            className={cn('flex-1', i % 2 === 0 ? 'bg-black' : 'bg-white')}
          />
        ))}
      </div>
    </div>
  )
}
```

---

### 2.6 Barrel Export (5 min)

**File**: `src/components/reader/edge-navigation/index.ts`

```typescript
export { EdgeTrigger } from './EdgeTrigger'
export { LeftEdgePanel } from './LeftEdgePanel'
export { BrutalistTopBar } from './BrutalistTopBar'
export { BottomControlPanel } from './BottomControlPanel'
export { RetroDecorations } from './RetroDecorations'
```

---

## Phase 3: Replace ReaderLayout
**Duration**: 4-6 hours
**Files Modified**: 2

### 3.1 Refactor RightPanel for Edge Mode (1-2 hours)

**File**: `src/components/sidebar/RightPanel.tsx`

**Strategy**: Simplify to always use edge trigger, remove standard mode code

```typescript
'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Network, Highlighter, Zap, Brain, FileQuestion, Sliders } from 'lucide-react'
import { useUIStore } from '@/stores/ui-store'
import { EdgeTrigger } from '../reader/edge-navigation'
import { ConnectionsList } from './ConnectionsList'
import { AnnotationsList } from './AnnotationsList'
import { SparksTab } from './SparksTab'
import { FlashcardsTab } from './FlashcardsTab'
import { TuneTab } from './TuneTab'
import { ConnectionFilters } from './ConnectionFilters'
import { AnnotationReviewTab } from './AnnotationReviewTab'
import { cn } from '@/lib/utils'
import type { RecoveryResults } from '../../../worker/types/recovery'

interface RightPanelProps {
  documentId: string
  visibleChunkIds?: string[]
  reviewResults?: RecoveryResults | null
  onHighlightAnnotation?: (annotationId: string) => void
  onAnnotationClick?: (annotationId: string, startOffset: number) => void
  onNavigateToChunk?: (chunkId: string) => void
  onConnectionsChange?: (connections: Array<{
    id: string
    source_chunk_id: string
    target_chunk_id: string
    strength: number
  }>) => void
  onActiveConnectionCountChange?: (count: number) => void
  chunks?: any[]
}

type TabId = 'connections' | 'annotations' | 'sparks' | 'cards' | 'review' | 'tune'

interface Tab {
  id: TabId
  icon: typeof Network
  label: string
}

const TABS: Tab[] = [
  { id: 'connections', icon: Network, label: 'Connections' },
  { id: 'annotations', icon: Highlighter, label: 'Annotations' },
  { id: 'sparks', icon: Zap, label: 'Sparks' },
  { id: 'cards', icon: Brain, label: 'Cards' },
  { id: 'review', icon: FileQuestion, label: 'Review' },
  { id: 'tune', icon: Sliders, label: 'Tune' }
]

/**
 * Right edge panel with 6-tab interface for reader sidebar.
 * @param props - Component props.
 * @returns Right panel component.
 */
export function RightPanel({
  documentId,
  visibleChunkIds = [],
  reviewResults = null,
  onHighlightAnnotation,
  onAnnotationClick,
  onNavigateToChunk,
  onConnectionsChange,
  onActiveConnectionCountChange,
  chunks = []
}: RightPanelProps) {
  const rightPanelOpen = useUIStore(state => state.rightPanelOpen)
  const toggleRightPanel = useUIStore(state => state.toggleRightPanel)
  const closeRightPanel = useUIStore(state => state.closeRightPanel)

  const [activeTab, setActiveTab] = useState<TabId>('connections')

  // Auto-switch to review tab when recovery results have items needing review
  useEffect(() => {
    if (reviewResults && reviewResults.needsReview.length > 0) {
      setActiveTab('review')
    }
  }, [reviewResults])

  const badgeCounts: Partial<Record<TabId, number>> = {
    review: reviewResults?.needsReview.length || 0
  }

  return (
    <div className="fixed right-0 top-16 bottom-20 z-40 flex flex-row-reverse">
      <EdgeTrigger
        side="right"
        label="Reader Sidebar"
        isOpen={rightPanelOpen}
        onClick={toggleRightPanel}
      />

      <AnimatePresence>
        {rightPanelOpen && (
          <motion.div
            className="w-96 bg-white brutalist-border-thick border-l-4 border-black h-full"
            initial={{ x: 384 }}
            animate={{ x: 0 }}
            exit={{ x: 384 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          >
            <motion.div
              className="h-full flex flex-col"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              {/* Header with close button */}
              <div className="p-4 border-b-4 border-black flex items-center justify-between bg-white">
                <h2 className="font-black text-lg uppercase">Sidebar</h2>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={closeRightPanel}
                  className="brutalist-border"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>

              {/* Icon-only tabs (6 columns) */}
              <div className="grid grid-cols-6 border-b-4 border-black bg-gray-50">
                {TABS.map(tab => {
                  const Icon = tab.icon
                  const isActive = activeTab === tab.id
                  const badgeCount = badgeCounts[tab.id]

                  return (
                    <motion.button
                      key={tab.id}
                      className={cn(
                        'relative p-3 border-r-2 border-black last:border-r-0 transition-colors flex flex-col items-center justify-center gap-1',
                        isActive
                          ? 'bg-yellow-300'
                          : 'hover:bg-yellow-100'
                      )}
                      onClick={() => setActiveTab(tab.id)}
                      title={tab.label}
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                    >
                      <Icon className="h-5 w-5" />
                      {badgeCount !== undefined && badgeCount > 0 && (
                        <Badge className="absolute -top-1 -right-1 h-5 w-5 p-0 flex items-center justify-center text-xs bg-red-600">
                          {badgeCount}
                        </Badge>
                      )}
                      <span className="text-[8px] font-bold uppercase">
                        {tab.label.slice(0, 4)}
                      </span>
                    </motion.button>
                  )
                })}
              </div>

              {/* Tab content */}
              <div className="flex-1 overflow-hidden">
                {activeTab === 'connections' && (
                  <div className="h-full flex flex-col">
                    <div className="border-b flex-shrink-0">
                      <ConnectionFilters />
                    </div>
                    <div className="flex-1 overflow-auto">
                      <ConnectionsList
                        documentId={documentId}
                        visibleChunkIds={visibleChunkIds}
                        onNavigateToChunk={onNavigateToChunk}
                        onConnectionsChange={onConnectionsChange}
                        onActiveConnectionCountChange={onActiveConnectionCountChange}
                      />
                    </div>
                  </div>
                )}

                {activeTab === 'annotations' && (
                  <ScrollArea className="h-full">
                    <AnnotationsList
                      documentId={documentId}
                      onAnnotationClick={onAnnotationClick}
                    />
                  </ScrollArea>
                )}

                {activeTab === 'sparks' && (
                  <ScrollArea className="h-full">
                    <SparksTab documentId={documentId} />
                  </ScrollArea>
                )}

                {activeTab === 'cards' && (
                  <ScrollArea className="h-full">
                    <FlashcardsTab documentId={documentId} />
                  </ScrollArea>
                )}

                {activeTab === 'review' && (
                  <AnnotationReviewTab
                    documentId={documentId}
                    results={reviewResults}
                    onHighlightAnnotation={onHighlightAnnotation}
                  />
                )}

                {activeTab === 'tune' && (
                  <ScrollArea className="h-full">
                    <TuneTab />
                  </ScrollArea>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
```

**Testing**:
- [ ] Verify panel expands/collapses smoothly
- [ ] Test all 6 tabs render correctly
- [ ] Ensure badge counts display

---

### 3.2 Replace ReaderLayout with Edge Mode (3-4 hours)

**File**: `src/components/reader/ReaderLayout.tsx`

**Strategy**: Remove all conditional rendering, ship edge layout only

```typescript
'use client'

import { useCallback, useEffect } from 'react'
import { DocumentViewer } from './DocumentViewer'
import { RightPanel } from '../sidebar/RightPanel'
import { QuickSparkModal } from './QuickSparkModal'
import { toast } from 'sonner'
import { useReaderStore } from '@/stores/reader-store'
import { useConnectionStore } from '@/stores/connection-store'
import { useUIStore } from '@/stores/ui-store'
import {
  BrutalistTopBar,
  LeftEdgePanel,
  BottomControlPanel,
  RetroDecorations,
  EdgeTrigger,
} from './edge-navigation'
import type { Chunk, StoredAnnotation } from '@/types/annotations'

// ... existing interfaces

/**
 * Client-side layout with edge-based navigation.
 * Uses brutalist/retro aesthetic with edge panel triggers.
 */
export function ReaderLayout({
  documentId,
  markdownUrl,
  chunks,
  annotations,
  documentTitle,
  wordCount,
  connectionCount,
  reviewResults = null,
}: ReaderLayoutProps) {
  // Store subscriptions
  const loadDocument = useReaderStore(state => state.loadDocument)
  const visibleChunks = useReaderStore(state => state.visibleChunks)
  const scrollPosition = useReaderStore(state => state.scrollPosition)
  const setConnections = useConnectionStore(state => state.setConnections)
  const filteredConnections = useConnectionStore(state => state.filteredConnections)
  const viewMode = useUIStore(state => state.viewMode)
  const showQuickSpark = useUIStore(state => state.quickCaptureOpen)
  const closeQuickCapture = useUIStore(state => state.closeQuickCapture)
  const leftPanelOpen = useUIStore(state => state.leftPanelOpen)
  const toggleLeftPanel = useUIStore(state => state.toggleLeftPanel)

  // Initialize document in ReaderStore on mount
  useEffect(() => {
    async function loadMarkdown() {
      try {
        const response = await fetch(markdownUrl)
        const markdown = await response.text()
        loadDocument(documentId, documentTitle, markdown, chunks)
      } catch (error) {
        console.error('[ReaderLayout] Failed to load markdown:', error)
        toast.error('Failed to load document content')
      }
    }

    loadMarkdown()
  }, [documentId, markdownUrl, documentTitle, chunks, loadDocument])

  // Fetch connections when visible chunks change (debounced 300ms)
  useEffect(() => {
    if (visibleChunks.length === 0) return

    const fetchConnections = async () => {
      try {
        const response = await fetch('/api/connections/for-chunks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chunkIds: visibleChunks.map(c => c.id)
          })
        })

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`)
        }

        const connections = await response.json()
        setConnections(connections)
      } catch (error) {
        console.error('[ReaderLayout] Failed to fetch connections:', error)
        // Silent fail - connections are supplementary
      }
    }

    // Debounce connection fetching (avoid spam during scroll)
    const timer = setTimeout(fetchConnections, 300)
    return () => clearTimeout(timer)
  }, [visibleChunks, setConnections])

  // Keyboard shortcuts
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // ⌘K or Ctrl+K for Quick Spark
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        useUIStore.getState().openQuickCapture()
      }

      // Escape to close modal
      if (e.key === 'Escape' && showQuickSpark) {
        closeQuickCapture()
      }

      // [ to toggle left panel
      if (e.key === '[') {
        e.preventDefault()
        toggleLeftPanel()
      }

      // ] to toggle right panel
      if (e.key === ']') {
        e.preventDefault()
        useUIStore.getState().toggleRightPanel()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [showQuickSpark, closeQuickCapture, toggleLeftPanel])

  const handleNavigateToChunk = useCallback((chunkId: string) => {
    // ... existing implementation
  }, [])

  const handleAnnotationClick = useCallback((annotationId: string, startOffset: number) => {
    // ... existing implementation
  }, [])

  return (
    <div className="relative w-full h-screen overflow-hidden bg-[#e8f5e9]">
      {/* Retro decorations overlay */}
      <RetroDecorations />

      {/* Top bar */}
      <BrutalistTopBar
        documentId={documentId}
        title={documentTitle}
        wordCount={wordCount}
        chunkCount={chunks.length}
        connectionCount={connectionCount}
      />

      {/* Left edge panel (document outline) */}
      <div className="absolute left-0 top-16 bottom-20 z-40 flex">
        <EdgeTrigger
          side="left"
          label="Document Outline"
          isOpen={leftPanelOpen}
          onClick={toggleLeftPanel}
        />
        <LeftEdgePanel />
      </div>

      {/* Right edge panel (sidebar) - hidden in Focus mode */}
      {viewMode !== 'focus' && (
        <RightPanel
          documentId={documentId}
          visibleChunkIds={visibleChunks.map(c => c.id)}
          reviewResults={reviewResults}
          onAnnotationClick={handleAnnotationClick}
          onNavigateToChunk={handleNavigateToChunk}
          chunks={chunks}
        />
      )}

      {/* Center content area */}
      <div className="absolute top-16 left-12 right-12 bottom-20 overflow-hidden">
        <DocumentViewer
          documentId={documentId}
          markdownUrl={markdownUrl}
          chunks={chunks}
          annotations={annotations}
        />
      </div>

      {/* Bottom control panel */}
      <div className="absolute bottom-0 left-12 right-12 z-50">
        <BottomControlPanel
          documentId={documentId}
          wordCount={wordCount}
        />
      </div>

      {/* Quick Spark modal (⌘K) */}
      {showQuickSpark && (
        <QuickSparkModal
          documentId={documentId}
          documentTitle={documentTitle}
          visibleChunks={visibleChunks}
          activeConnections={filteredConnections.length}
          scrollPosition={scrollPosition}
          onClose={closeQuickCapture}
        />
      )}
    </div>
  )
}
```

**Testing**:
- [ ] Verify all existing functionality works
- [ ] Test VirtualizedReader within new constraints
- [ ] Ensure annotations display correctly
- [ ] Test connections load in sidebar

---

## Phase 4: Polish & Mobile
**Duration**: 4-6 hours

### 4.1 Add Settings Toggle (30 min)

**File**: `src/components/sidebar/TuneTab.tsx`

Add decoration toggle:

```typescript
import { useUIStore } from '@/stores/ui-store'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Separator } from '@/components/ui/separator'

export function TuneTab() {
  const showRetroDecorations = useUIStore(state => state.showRetroDecorations)
  const toggleRetroDecorations = useUIStore(state => state.toggleRetroDecorations)

  return (
    <div className="p-6 space-y-6">
      {/* Existing weight tuning controls */}
      <WeightTuning />

      <Separator />

      {/* NEW - Decorations Section */}
      <div className="space-y-4">
        <div>
          <h3 className="font-semibold mb-2">Visual Style</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Customize the retro aesthetic
          </p>
        </div>

        <div className="flex items-center justify-between">
          <Label htmlFor="retro-decorations">Retro Decorations</Label>
          <Switch
            id="retro-decorations"
            checked={showRetroDecorations}
            onCheckedChange={toggleRetroDecorations}
          />
        </div>

        <div className="p-3 bg-muted rounded-lg text-sm">
          <p className="font-medium mb-1">📐 Edge-Based Navigation</p>
          <p className="text-xs text-muted-foreground">
            Press <kbd className="px-1 py-0.5 bg-background rounded border text-xs">[</kbd> for outline,
            <kbd className="px-1 py-0.5 bg-background rounded border text-xs ml-1">]</kbd> for sidebar,
            <kbd className="px-1 py-0.5 bg-background rounded border text-xs ml-1">⌘K</kbd> for spark
          </p>
        </div>
      </div>
    </div>
  )
}
```

---

### 4.2 Mobile Responsive (2-3 hours)

**Strategy**: Use Sheet components for mobile, edge panels for desktop

Update each edge component with responsive variants:

```typescript
// Example for LeftEdgePanel.tsx
import { Sheet, SheetContent } from '@/components/ui/sheet'

export function LeftEdgePanel() {
  // ... existing code

  return (
    <>
      {/* Mobile: Bottom sheet */}
      <div className="lg:hidden">
        <Sheet open={leftPanelOpen} onOpenChange={toggleLeftPanel}>
          <SheetContent side="bottom" className="h-[80vh]">
            {/* Outline content (same as desktop) */}
          </SheetContent>
        </Sheet>
      </div>

      {/* Desktop: Edge panel */}
      <div className="hidden lg:block">
        <AnimatePresence>
          {leftPanelOpen && (
            <motion.div className="w-80 ...">
              {/* Outline content */}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </>
  )
}
```

**Testing**:
- [ ] Test on mobile browsers (iOS Safari, Chrome Android)
- [ ] Verify touch gestures work
- [ ] Ensure bottom sheets don't conflict

---

### 4.3 Accessibility (1-2 hours)

Add ARIA labels and keyboard navigation:

```typescript
// Example improvements
<button
  aria-label={`${isOpen ? 'Close' : 'Open'} ${label}`}
  aria-expanded={isOpen}
  role="button"
>

<nav aria-label="Document outline">
  <h2 id="outline-heading">Outline</h2>
  <div role="tree" aria-labelledby="outline-heading">
    {/* ... */}
  </div>
</nav>

<div role="toolbar" aria-label="Reading controls">
  {/* Bottom panel controls */}
</div>
```

**Testing**:
- [ ] Test with screen readers (VoiceOver)
- [ ] Verify keyboard-only navigation
- [ ] Check focus indicators are visible

---

## Timeline Summary

| Phase | Duration | Milestone |
|-------|----------|-----------|
| Phase 1: Foundation | 3-4 hours | Stores + CSS ready |
| Phase 2: Components | 6-8 hours | All edge components built |
| Phase 3: Integration | 4-6 hours | ReaderLayout replaced |
| Phase 4: Polish | 4-6 hours | Mobile + a11y complete |
| **TOTAL** | **17-24 hours** | **Production-ready** |

**Suggested Schedule** (8 hours/week):
- **Week 1**: Phases 1-2 complete
- **Week 2**: Phase 3 complete
- **Week 3**: Phase 4 + buffer

---

## Success Criteria

**Technical**:
- ✅ 60fps panel animations
- ✅ <2 second panel open/close
- ✅ VirtualizedReader works in edge layout
- ✅ Works on mobile (responsive bottom sheets)

**Functional**:
- ✅ All existing features work (annotations, connections, sparks)
- ✅ Outline generation accurate
- ✅ Keyboard shortcuts work ([], ⌘K)

**User Experience**:
- ✅ Panels feel snappy and responsive
- ✅ Brutalist theme is visually consistent
- ✅ Mobile experience is touch-friendly

---

## Developer Checklist

Before starting:
- [ ] Read this entire document
- [ ] Review EdgeNavigationDemo for visual reference
- [ ] Create feature branch: `git checkout -b edge-navigation-replacement`

During development:
- [ ] Follow phase order
- [ ] Test continuously
- [ ] Commit frequently

Before shipping:
- [ ] All tests passing
- [ ] No console errors
- [ ] Performance acceptable (60fps)
- [ ] Accessibility tested

---

**Ready to ship! 🚀**
