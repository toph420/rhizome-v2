# Complete Annotation System Implementation Plan

**Total Time: 18-22 hours**

---

## Architecture Overview

**Core Principle:** Annotations use global markdown offsets. ChunkRef tracks ALL spanned chunks. Highlights inject during block parsing. Resize recalculates chunk spans.

**Data Flow:**

```
Text Selection → Calculate Offsets → Find Spanned Chunks → Create Annotation
                                                              ↓
                                    Blocks Parse ← Inject Highlights
                                                              ↓
                                    User Drags Edge → Recalc Offsets → Update Chunks
```

---

## Phase 1: Foundation (4-5 hours)

### 1.1: Database Schema Updates

**File:** `supabase/migrations/YYYYMMDDHHMMSS_annotation_system.sql`

```sql
-- Ensure documents have source metadata
ALTER TABLE documents 
  ADD COLUMN IF NOT EXISTS source_url TEXT,
  ADD COLUMN IF NOT EXISTS source_type TEXT,
  ADD COLUMN IF NOT EXISTS author TEXT,
  ADD COLUMN IF NOT EXISTS citation_data JSONB;

-- Ensure chunks have page info
ALTER TABLE chunks
  ADD COLUMN IF NOT EXISTS page_start INTEGER,
  ADD COLUMN IF NOT EXISTS page_end INTEGER,
  ADD COLUMN IF NOT EXISTS page_label TEXT;

-- Index for fast annotation lookups
CREATE INDEX IF NOT EXISTS idx_components_annotation_position ON components(
  (data->>'documentId'),
  (data->>'startOffset'),
  (data->>'endOffset')
) WHERE component_type = 'Position';

-- Index for chunk lookups
CREATE INDEX IF NOT EXISTS idx_components_chunk_ref ON components
USING GIN ((data->'chunkIds')) 
WHERE component_type = 'ChunkRef';
```

### 1.2: Multi-Chunk ChunkRef Component

**File:** `lib/ecs/components.ts`

```typescript
export interface ChunkRefComponent {
  chunkIds: string[]        // ALL chunks this annotation spans
  chunk_id: string          // Primary chunk for ECS class compatibility
  primaryChunkId: string    // Where annotation starts
  chunkPositions: number[]  // Positions of all spanned chunks
}

export interface PositionComponent {
  documentId: string
  document_id: string
  startOffset: number
  endOffset: number
  originalText: string
  pageLabel?: string
}

export interface VisualComponent {
  type: 'highlight' | 'underline' | 'margin-note' | 'comment'
  color: 'yellow' | 'green' | 'blue' | 'red' | 'purple' | 'orange' | 'pink'
}

export interface ContentComponent {
  note?: string
  tags: string[]
}

export interface TemporalComponent {
  createdAt: string
  updatedAt: string
  lastViewedAt?: string
}

export interface AnnotationEntity {
  id: string
  user_id: string
  created_at: string
  updated_at: string
  components: {
    Position: PositionComponent
    Visual: VisualComponent
    Content: ContentComponent
    Temporal: TemporalComponent
    ChunkRef: ChunkRefComponent
  }
}
```

### 1.3: Chunk Utilities

**File:** `lib/reader/chunk-utils.ts`

```typescript
import type { Chunk } from '@/types/annotations'
import type { ChunkRefComponent } from '@/lib/ecs/components'

/**
 * Find all chunks that an annotation spans.
 */
export function findSpannedChunks(
  startOffset: number,
  endOffset: number,
  chunks: Chunk[]
): Chunk[] {
  const sortedChunks = [...chunks].sort((a, b) => a.start_offset - b.start_offset)
  
  return sortedChunks.filter(chunk => 
    chunk.start_offset < endOffset && chunk.end_offset > startOffset
  )
}

/**
 * Create ChunkRef component from offsets.
 */
export function createChunkRef(
  startOffset: number,
  endOffset: number,
  chunks: Chunk[]
): ChunkRefComponent {
  const spanned = findSpannedChunks(startOffset, endOffset, chunks)
  
  if (spanned.length === 0) {
    throw new Error('No chunks found for annotation offsets')
  }
  
  return {
    chunkIds: spanned.map(c => c.id),
    chunk_id: spanned[0].id,  // For ECS compatibility
    primaryChunkId: spanned[0].id,
    chunkPositions: spanned.map(c => c.chunk_index)
  }
}

/**
 * Find chunk containing a specific offset.
 */
export function findChunkForOffset(chunks: Chunk[], offset: number): Chunk | null {
  return chunks.find(c => 
    offset >= c.start_offset && offset < c.end_offset
  ) || null
}
```

---

## Phase 2: Inline Highlights (5-6 hours)

### 2.1: Highlight Injection

**File:** `lib/reader/highlight-injector.ts`

```typescript
import DOMPurify from 'dompurify'
import type { AnnotationEntity } from '@/lib/ecs/components'
import type { Block } from './block-parser'

interface HighlightRange {
  start: number
  end: number
  annotationId: string
  color: string
  type: string
}

/**
 * Inject <mark> tags into block HTML for annotations.
 */
export function injectHighlights(
  block: Block,
  annotations: AnnotationEntity[]
): string {
  const overlapping = annotations.filter(ann => {
    const pos = ann.components.Position
    return (
      block.startOffset <= pos.endOffset &&
      block.endOffset >= pos.startOffset
    )
  })

  if (overlapping.length === 0) {
    return block.html
  }

  // Parse HTML to extract plain text
  const tempDiv = document.createElement('div')
  tempDiv.innerHTML = block.html
  const plainText = tempDiv.textContent || ''

  // Map annotations to block-relative positions
  const highlights: HighlightRange[] = overlapping.map(ann => {
    const pos = ann.components.Position
    const visual = ann.components.Visual
    
    const start = Math.max(0, pos.startOffset - block.startOffset)
    const end = Math.min(plainText.length, pos.endOffset - block.startOffset)
    
    return {
      start,
      end,
      annotationId: ann.id,
      color: visual.color,
      type: visual.type
    }
  }).sort((a, b) => a.start - b.start)

  return wrapTextNodes(block.html, highlights)
}

/**
 * Walk DOM tree and wrap text nodes with <mark> tags.
 */
function wrapTextNodes(html: string, highlights: HighlightRange[]): string {
  const parser = new DOMParser()
  const doc = parser.parseFromString(html, 'text/html')
  const body = doc.body
  
  let currentOffset = 0
  
  function walkNode(node: Node): void {
    if (node.nodeType === Node.TEXT_NODE) {
      const textContent = node.textContent || ''
      const nodeStart = currentOffset
      const nodeEnd = currentOffset + textContent.length
      
      const nodeHighlights = highlights.filter(h => 
        h.start < nodeEnd && h.end > nodeStart
      )
      
      if (nodeHighlights.length > 0) {
        const fragment = doc.createDocumentFragment()
        let lastIndex = 0
        
        for (const highlight of nodeHighlights) {
          const relStart = Math.max(0, highlight.start - nodeStart)
          const relEnd = Math.min(textContent.length, highlight.end - nodeStart)
          
          // Text before highlight
          if (relStart > lastIndex) {
            fragment.appendChild(
              doc.createTextNode(textContent.slice(lastIndex, relStart))
            )
          }
          
          // Highlighted text
          const mark = doc.createElement('mark')
          mark.className = `annotation-highlight annotation-${highlight.color}`
          mark.setAttribute('data-annotation-id', highlight.annotationId)
          mark.setAttribute('data-type', highlight.type)
          mark.textContent = textContent.slice(relStart, relEnd)
          fragment.appendChild(mark)
          
          lastIndex = relEnd
        }
        
        // Text after
        if (lastIndex < textContent.length) {
          fragment.appendChild(
            doc.createTextNode(textContent.slice(lastIndex))
          )
        }
        
        node.parentNode?.replaceChild(fragment, node)
      }
      
      currentOffset += textContent.length
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      Array.from(node.childNodes).forEach(walkNode)
    }
  }
  
  walkNode(body)
  return body.innerHTML
}
```

### 2.2: Update Block Parser

**File:** `lib/reader/block-parser.ts`

```typescript
import { marked } from './marked-config'
import { injectHighlights } from './highlight-injector'
import type { Chunk } from '@/types/annotations'
import type { AnnotationEntity } from '@/lib/ecs/components'

export interface Block {
  id: string
  type: 'heading' | 'paragraph' | 'code' | 'blockquote' | 'list' | 'table'
  level?: number
  html: string
  startOffset: number
  endOffset: number
  chunkId: string
  chunkPosition: number
}

export function parseMarkdownToBlocks(
  markdown: string,
  chunks: Chunk[],
  annotations: AnnotationEntity[] = []
): Block[] {
  const tokens = marked.lexer(markdown)
  const blocks: Block[] = []
  let offset = 0
  let blockIndex = 0

  const sortedChunks = [...chunks].sort((a, b) => a.start_offset - b.start_offset)

  for (const token of tokens) {
    const raw = token.raw
    const endOffset = offset + raw.length

    const chunk = findChunkForOffset(sortedChunks, offset)
    
    if (!chunk) {
      offset = endOffset
      continue
    }

    let html = ''
    try {
      html = marked.parse(raw, { async: false }) as string
    } catch (err) {
      console.error('Parse error:', err)
      html = `<p>${raw}</p>`
    }

    const block: Block = {
      id: `block_${blockIndex}`,
      type: mapTokenType(token.type),
      level: (token as any).depth,
      html,
      startOffset: offset,
      endOffset,
      chunkId: chunk.id,
      chunkPosition: chunk.chunk_index,
    }

    // Inject highlights
    block.html = injectHighlights(block, annotations)

    blocks.push(block)
    offset = endOffset
    blockIndex++
  }

  return blocks
}

function findChunkForOffset(chunks: Chunk[], offset: number): Chunk | null {
  let left = 0
  let right = chunks.length - 1

  while (left <= right) {
    const mid = Math.floor((left + right) / 2)
    const chunk = chunks[mid]

    if (offset >= chunk.start_offset && offset < chunk.end_offset) {
      return chunk
    } else if (offset < chunk.start_offset) {
      right = mid - 1
    } else {
      left = mid + 1
    }
  }

  return null
}

function mapTokenType(tokenType: string): Block['type'] {
  switch (tokenType) {
    case 'heading': return 'heading'
    case 'code': return 'code'
    case 'blockquote': return 'blockquote'
    case 'list': return 'list'
    case 'table': return 'table'
    default: return 'paragraph'
  }
}
```

### 2.3: Highlight Style CSS Variables

**File:** `lib/reader/highlight-injector.ts` (updated)

```typescript
// Use data attributes instead of classes for colors
const mark = doc.createElement('mark')
mark.className = 'annotation-highlight'
mark.setAttribute('data-annotation-id', highlight.annotationId)
mark.setAttribute('data-color', highlight.color)  // Add this
mark.textContent = textContent.slice(relStart, relEnd)
```

**File:** `app/globals.css`

```css
@layer components {
  .annotation-highlight {
    @apply cursor-pointer rounded-sm px-0.5 transition-opacity hover:opacity-80;
    position: relative;
  }

  /* Use data attributes for colors */
  .annotation-highlight[data-color="yellow"] {
    @apply bg-yellow-200/30 dark:bg-yellow-200/20;
  }
  .annotation-highlight[data-color="green"] {
    @apply bg-green-200/30 dark:bg-green-200/20;
  }
  .annotation-highlight[data-color="blue"] {
    @apply bg-blue-200/30 dark:bg-blue-200/20;
  }
  .annotation-highlight[data-color="red"] {
    @apply bg-red-200/30 dark:bg-red-200/20;
  }
  .annotation-highlight[data-color="purple"] {
    @apply bg-purple-200/30 dark:bg-purple-200/20;
  }
  .annotation-highlight[data-color="orange"] {
    @apply bg-orange-200/30 dark:bg-orange-200/20;
  }
  .annotation-highlight[data-color="pink"] {
    @apply bg-pink-200/30 dark:bg-pink-200/20;
  }

  /* Resize handles */
  .annotation-highlight::before,
  .annotation-highlight::after {
    @apply absolute top-0 bottom-0 w-2 opacity-0 transition-opacity cursor-col-resize;
    content: '';
  }

  .annotation-highlight::before {
    @apply -left-1;
    background: linear-gradient(to right, transparent, rgba(0,0,0,0.15));
  }

  .annotation-highlight::after {
    @apply -right-1;
    background: linear-gradient(to left, transparent, rgba(0,0,0,0.15));
  }

  .annotation-highlight:hover::before,
  .annotation-highlight:hover::after {
    @apply opacity-100;
  }

  .dark .annotation-highlight::before,
  .dark .annotation-highlight::after {
    background-image: linear-gradient(to right, transparent, rgba(255,255,255,0.15));
  }
}
```
---

## Phase 3: Resizable Highlights (6-7 hours)

### 3.1: Resize Detection

**File:** `lib/reader/resize-detection.ts`

```typescript
interface ResizeHandle {
  annotationId: string
  edge: 'start' | 'end'
  element: HTMLElement
}

export function detectResizeHandle(
  e: MouseEvent,
  annotations: any[]
): ResizeHandle | null {
  const target = e.target as HTMLElement
  
  if (!target.classList.contains('annotation-highlight')) {
    return null
  }
  
  const annotationId = target.getAttribute('data-annotation-id')
  if (!annotationId) return null
  
  const rect = target.getBoundingClientRect()
  const mouseX = e.clientX
  
  const distanceFromStart = mouseX - rect.left
  const distanceFromEnd = rect.right - mouseX
  
  const EDGE_THRESHOLD = 8
  
  if (distanceFromStart <= EDGE_THRESHOLD) {
    return { annotationId, edge: 'start', element: target }
  }
  
  if (distanceFromEnd <= EDGE_THRESHOLD) {
    return { annotationId, edge: 'end', element: target }
  }
  
  return null
}
```

### 3.2: Offset Calculation from Range

**File:** `lib/reader/offset-calculator.ts`

```typescript
import type { Block } from './block-parser'
import type { Chunk } from '@/types/annotations'

/**
 * Calculate markdown offsets from a DOM Range.
 */
export function calculateOffsetsFromRange(
  range: Range,
  blocks: Block[]
): { start: number; end: number } | null {
  let blockEl = range.commonAncestorContainer as HTMLElement
  
  while (blockEl && !blockEl.hasAttribute('data-start-offset')) {
    blockEl = blockEl.parentElement as HTMLElement
  }
  
  if (!blockEl) return null
  
  const blockStartOffset = parseInt(blockEl.getAttribute('data-start-offset') || '0')
  const blockText = blockEl.textContent || ''
  
  // Calculate offset within block
  const beforeRange = range.cloneRange()
  beforeRange.selectNodeContents(blockEl)
  beforeRange.setEnd(range.startContainer, range.startOffset)
  const startOffsetInBlock = beforeRange.toString().length
  
  const rangeText = range.toString()
  
  return {
    start: blockStartOffset + startOffsetInBlock,
    end: blockStartOffset + startOffsetInBlock + rangeText.length
  }
}

/**
 * Snap offsets to word boundaries.
 */
export function snapToWordBoundaries(
  start: number,
  end: number,
  text: string
): { start: number; end: number } {
  // Trim leading whitespace
  let startAdjust = 0
  while (startAdjust < text.length && /\s/.test(text[startAdjust])) {
    startAdjust++
  }
  
  // Trim trailing whitespace
  let endAdjust = 0
  while (endAdjust < text.length && /\s/.test(text[text.length - 1 - endAdjust])) {
    endAdjust++
  }
  
  return {
    start: start + startAdjust,
    end: end - endAdjust
  }
}
```

### 3.3: Resize Hook

**File:** `hooks/useHighlightResize.ts`

```typescript
import { useState, useEffect, useCallback, useMemo } from 'react'
import { debounce } from 'lodash'
import type { AnnotationEntity } from '@/lib/ecs/components'
import type { Block } from '@/lib/reader/block-parser'
import type { Chunk } from '@/types/annotations'
import { detectResizeHandle } from '@/lib/reader/resize-detection'
import { calculateOffsetsFromRange, snapToWordBoundaries } from '@/lib/reader/offset-calculator'
import { findSpannedChunks } from '@/lib/reader/chunk-utils'

const MAX_SPANNED_CHUNKS = 5

export function useHighlightResize(
  annotations: AnnotationEntity[],
  blocks: Block[],
  chunks: Chunk[],
  onResize: (annotationId: string, newStart: number, newEnd: number) => void
) {
  const [resizing, setResizing] = useState<{
    annotationId: string
    edge: 'start' | 'end'
    range: Range
    initialStart: number
    initialEnd: number
  } | null>(null)

  const handleMouseDown = useCallback((e: MouseEvent) => {
    const handle = detectResizeHandle(e, annotations)
    
    if (!handle) return
    
    e.preventDefault()
    e.stopPropagation()
    
    const annotation = annotations.find(a => a.id === handle.annotationId)
    if (!annotation) return
    
    const pos = annotation.components.Position
    
    const range = document.createRange()
    range.selectNodeContents(handle.element)
    
    setResizing({
      annotationId: handle.annotationId,
      edge: handle.edge,
      range,
      initialStart: pos.startOffset,
      initialEnd: pos.endOffset,
    })
  }, [annotations])

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!resizing) return
    
    e.preventDefault()
    
    const caretRange = document.caretRangeFromPoint(e.clientX, e.clientY)
    if (!caretRange) return
    
    try {
      if (resizing.edge === 'start') {
        resizing.range.setStart(caretRange.startContainer, caretRange.startOffset)
      } else {
        resizing.range.setEnd(caretRange.startContainer, caretRange.startOffset)
      }
    } catch (err) {
      // Ignore invalid range errors during drag
    }
  }, [resizing])

  const handleMouseUp = useCallback(() => {
    if (!resizing) return
    
    const newOffsets = calculateOffsetsFromRange(resizing.range, blocks)
    
    if (!newOffsets) {
      setResizing(null)
      return
    }
    
    // Check chunk span limit
    const spannedChunks = findSpannedChunks(newOffsets.start, newOffsets.end, chunks)
    
    if (spannedChunks.length > MAX_SPANNED_CHUNKS) {
      console.warn(`Highlight spans ${spannedChunks.length} chunks, max is ${MAX_SPANNED_CHUNKS}`)
      setResizing(null)
      return
    }
    
    // Snap to word boundaries
    const rangeText = resizing.range.toString()
    const snapped = snapToWordBoundaries(
      newOffsets.start,
      newOffsets.end,
      rangeText
    )
    
    // Minimum 3 characters
    if (snapped.end - snapped.start < 3) {
      setResizing(null)
      return
    }
    
    onResize(resizing.annotationId, snapped.start, snapped.end)
    setResizing(null)
  }, [resizing, blocks, chunks, onResize])

  useEffect(() => {
    document.addEventListener('mousedown', handleMouseDown)
    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
    
    return () => {
      document.removeEventListener('mousedown', handleMouseDown)
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [handleMouseDown, handleMouseMove, handleMouseUp])

  return { 
    isResizing: !!resizing,
    resizingAnnotationId: resizing?.annotationId 
  }
}
```

---

## Phase 4: Text Selection & Quick Capture (4-5 hours)

### 4.1: Selection Hook

**File:** `hooks/useTextSelection.ts`

```typescript
import { useState, useEffect, useCallback } from 'react'
import type { Block } from '@/lib/reader/block-parser'
import type { Chunk } from '@/types/annotations'
import { createChunkRef } from '@/lib/reader/chunk-utils'
import type { ChunkRefComponent } from '@/lib/ecs/components'

export interface TextSelection {
  text: string
  startOffset: number
  endOffset: number
  chunkRef: ChunkRefComponent
}

export function useTextSelection(blocks: Block[], chunks: Chunk[]) {
  const [selection, setSelection] = useState<TextSelection | null>(null)

  const handleSelection = useCallback(() => {
    const sel = window.getSelection()
    
    if (!sel || sel.isCollapsed) {
      setSelection(null)
      return
    }

    const range = sel.getRangeAt(0)
    const selectedText = range.toString().trim()
    
    if (selectedText.length === 0) {
      setSelection(null)
      return
    }

    // Find block containing selection
    let blockEl = range.startContainer as HTMLElement
    while (blockEl && !blockEl.hasAttribute('data-start-offset')) {
      blockEl = blockEl.parentElement as HTMLElement
    }
    
    if (!blockEl) return
    
    const blockStartOffset = parseInt(blockEl.getAttribute('data-start-offset') || '0')
    
    // Calculate offset within block
    const textBeforeSelection = range.cloneRange()
    textBeforeSelection.selectNodeContents(blockEl)
    textBeforeSelection.setEnd(range.startContainer, range.startOffset)
    const offsetInBlock = textBeforeSelection.toString().length
    
    const startOffset = blockStartOffset + offsetInBlock
    const endOffset = startOffset + selectedText.length
    
    try {
      const chunkRef = createChunkRef(startOffset, endOffset, chunks)
      
      setSelection({
        text: selectedText,
        startOffset,
        endOffset,
        chunkRef
      })
    } catch (err) {
      console.error('Failed to create chunk ref:', err)
      setSelection(null)
    }
  }, [blocks, chunks])

  useEffect(() => {
    document.addEventListener('mouseup', handleSelection)
    document.addEventListener('keyup', handleSelection)
    
    return () => {
      document.removeEventListener('mouseup', handleSelection)
      document.removeEventListener('keyup', handleSelection)
    }
  }, [handleSelection])

  const clearSelection = useCallback(() => {
    setSelection(null)
    window.getSelection()?.removeAllRanges()
  }, [])

  return { selection, clearSelection }
}
```

### 4.2: QuickCapture (Using shadcn)

**File:** `components/reader/QuickCapture.tsx`

```tsx
'use client'

import { useState } from 'react'
import { X, Tag, Palette, Sparkles } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import type { TextSelection } from '@/hooks/useTextSelection'
import type { VisualComponent } from '@/lib/ecs/components'

interface QuickCaptureProps {
  selection: TextSelection
  onSave: (data: {
    color: VisualComponent['color']
    note?: string
    tags: string[]
  }) => void
  onCancel: () => void
}

const COLORS: Array<{ value: VisualComponent['color']; class: string }> = [
  { value: 'yellow', class: 'bg-yellow-200/50 hover:bg-yellow-200/70' },
  { value: 'green', class: 'bg-green-200/50 hover:bg-green-200/70' },
  { value: 'blue', class: 'bg-blue-200/50 hover:bg-blue-200/70' },
  { value: 'red', class: 'bg-red-200/50 hover:bg-red-200/70' },
  { value: 'purple', class: 'bg-purple-200/50 hover:bg-purple-200/70' },
  { value: 'orange', class: 'bg-orange-200/50 hover:bg-orange-200/70' },
  { value: 'pink', class: 'bg-pink-200/50 hover:bg-pink-200/70' },
]

export function QuickCapture({ selection, onSave, onCancel }: QuickCaptureProps) {
  const [color, setColor] = useState<VisualComponent['color']>('yellow')
  const [note, setNote] = useState('')
  const [tagInput, setTagInput] = useState('')
  const [tags, setTags] = useState<string[]>([])

  const handleAddTag = () => {
    if (tagInput.trim() && !tags.includes(tagInput.trim())) {
      setTags([...tags, tagInput.trim()])
      setTagInput('')
    }
  }

  const handleRemoveTag = (tag: string) => {
    setTags(tags.filter(t => t !== tag))
  }

  const handleSave = () => {
    onSave({ color, note: note.trim() || undefined, tags })
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 10 }}
      className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 w-[480px]"
    >
      <div className="bg-background border rounded-lg shadow-2xl p-4 space-y-3">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex-1 space-y-1">
            <p className="text-sm text-muted-foreground line-clamp-2">
              "{selection.text}"
            </p>
            <div className="flex items-center gap-2">
              <Sparkles className="w-3 h-3 text-muted-foreground" />
              <p className="text-xs text-muted-foreground">
                Spans {selection.chunkRef.chunkIds.length} chunk{selection.chunkRef.chunkIds.length > 1 ? 's' : ''}
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={onCancel}
          >
            <X className="w-4 h-4" />
          </Button>
        </div>

        {/* Color picker */}
        <div className="flex items-center gap-2">
          <Palette className="w-4 h-4 text-muted-foreground" />
          <div className="flex gap-1">
            {COLORS.map(c => (
              <button
                key={c.value}
                onClick={() => setColor(c.value)}
                className={`
                  w-7 h-7 rounded transition-all
                  ${c.class}
                  ${color === c.value ? 'ring-2 ring-foreground ring-offset-2' : ''}
                `}
              />
            ))}
          </div>
        </div>

        {/* Note */}
        <Textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Add a note (optional)..."
          className="resize-none min-h-[60px]"
          rows={2}
        />

        {/* Tags */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Tag className="w-4 h-4 text-muted-foreground" />
            <Input
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  handleAddTag()
                }
              }}
              placeholder="Add tags (press Enter)..."
              className="h-8"
            />
          </div>
          {tags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {tags.map(tag => (
                <Badge key={tag} variant="secondary" className="gap-1">
                  {tag}
                  <button
                    onClick={() => handleRemoveTag(tag)}
                    className="ml-1 hover:text-foreground"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </Badge>
              ))}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button onClick={handleSave}>
            Save Highlight
          </Button>
        </div>
      </div>
    </motion.div>
  )
}
```

## Color Picker Component (shadcn Enhancement)

If you want a fancier color picker:

**File:** `components/reader/ColorPicker.tsx`

```tsx
import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { VisualComponent } from '@/lib/ecs/components'

interface ColorPickerProps {
  value: VisualComponent['color']
  onChange: (color: VisualComponent['color']) => void
}

const COLORS: Array<{
  value: VisualComponent['color']
  label: string
  bg: string
  ring: string
}> = [
  { value: 'yellow', label: 'Yellow', bg: 'bg-yellow-200', ring: 'ring-yellow-500' },
  { value: 'green', label: 'Green', bg: 'bg-green-200', ring: 'ring-green-500' },
  { value: 'blue', label: 'Blue', bg: 'bg-blue-200', ring: 'ring-blue-500' },
  { value: 'red', label: 'Red', bg: 'bg-red-200', ring: 'ring-red-500' },
  { value: 'purple', label: 'Purple', bg: 'bg-purple-200', ring: 'ring-purple-500' },
  { value: 'orange', label: 'Orange', bg: 'bg-orange-200', ring: 'ring-orange-500' },
  { value: 'pink', label: 'Pink', bg: 'bg-pink-200', ring: 'ring-pink-500' },
]

export function ColorPicker({ value, onChange }: ColorPickerProps) {
  return (
    <div className="grid grid-cols-7 gap-2">
      {COLORS.map(color => (
        <button
          key={color.value}
          onClick={() => onChange(color.value)}
          className={cn(
            'relative h-8 w-8 rounded-md transition-all',
            color.bg,
            value === color.value && `ring-2 ${color.ring} ring-offset-2`
          )}
          title={color.label}
        >
          {value === color.value && (
            <Check className="absolute inset-0 m-auto w-4 h-4 text-foreground" />
          )}
        </button>
      ))}
    </div>
  )
}
```

---

## Phase 5: Integration (3-4 hours)

### 5.1: Update Annotation Operations

**File:** `lib/ecs/annotations.ts` (additions)

```typescript
export interface CreateAnnotationInput {
  documentId: string
  startOffset: number
  endOffset: number
  originalText: string
  chunkRef: ChunkRefComponent
  type: VisualComponent['type']
  color?: VisualComponent['color']
  note?: string
  tags?: string[]
  pageLabel?: string
}

export class AnnotationOperations {
  // ... existing methods

  async create(input: CreateAnnotationInput): Promise<string> {
    const now = new Date().toISOString()
    
    const entityId = await this.ecs.createEntity(this.userId, {
      Position: {
        documentId: input.documentId,
        document_id: input.documentId,
        startOffset: input.startOffset,
        endOffset: input.endOffset,
        originalText: input.originalText,
        pageLabel: input.pageLabel,
      },
      Visual: {
        type: input.type,
        color: input.color || 'yellow',
      },
      Content: {
        note: input.note,
        tags: input.tags || [],
      },
      Temporal: {
        createdAt: now,
        updatedAt: now,
        lastViewedAt: now,
      },
      ChunkRef: {
        chunkIds: input.chunkRef.chunkIds,
        chunk_id: input.chunkRef.primaryChunkId,
        primaryChunkId: input.chunkRef.primaryChunkId,
        chunkPositions: input.chunkRef.chunkPositions,
      },
    })
    
    return entityId
  }

  async updateOffsets(
    entityId: string,
    newStart: number,
    newEnd: number,
    chunks: Chunk[]
  ): Promise<void> {
    const entity = await this.ecs.getEntity(entityId, this.userId)
    if (!entity) throw new Error('Annotation not found')
    
    const components = this.extractComponents(entity)
    const newChunkRef = createChunkRef(newStart, newEnd, chunks)
    
    // Update Position
    const posComponent = components.find(c => c.component_type === 'Position')
    if (posComponent) {
      await this.ecs.updateComponent(
        posComponent.id,
        {
          ...posComponent.data,
          startOffset: newStart,
          endOffset: newEnd,
        },
        this.userId
      )
    }
    
    // Update ChunkRef
    const chunkRefComponent = components.find(c => c.component_type === 'ChunkRef')
    if (chunkRefComponent) {
      await this.ecs.updateComponent(
        chunkRefComponent.id,
        {
          chunkIds: newChunkRef.chunkIds,
          chunk_id: newChunkRef.primaryChunkId,
          primaryChunkId: newChunkRef.primaryChunkId,
          chunkPositions: newChunkRef.chunkPositions,
        },
        this.userId
      )
    }
    
    // Update Temporal
    const temporalComponent = components.find(c => c.component_type === 'Temporal')
    if (temporalComponent) {
      await this.ecs.updateComponent(
        temporalComponent.id,
        {
          ...temporalComponent.data,
          updatedAt: new Date().toISOString(),
        },
        this.userId
      )
    }
  }
}
```

### 5.2: Complete VirtualizedReader

**File:** `components/reader/VirtualizedReader.tsx`

```tsx
'use client'

import { useMemo, useState, useCallback } from 'react'
import { Virtuoso } from 'react-virtuoso'
import { AnimatePresence } from 'framer-motion'
import { parseMarkdownToBlocks } from '@/lib/reader/block-parser'
import { BlockRenderer } from './BlockRenderer'
import { QuickCapture } from './QuickCapture'
import { useTextSelection } from '@/hooks/useTextSelection'
import { useHighlightResize } from '@/hooks/useHighlightResize'
import { useAnnotations } from '@/hooks/useAnnotations'
import type { Chunk } from '@/types/annotations'
import type { AnnotationEntity } from '@/lib/ecs/components'

interface VirtualizedReaderProps {
  documentId: string
  markdown: string
  chunks: Chunk[]
  onVisibleChunksChange?: (chunkIds: string[]) => void
}

export function VirtualizedReader({
  documentId,
  markdown,
  chunks,
  onVisibleChunksChange,
}: VirtualizedReaderProps) {
  const { annotations, create, refresh } = useAnnotations(documentId)
  const [localAnnotations, setLocalAnnotations] = useState<AnnotationEntity[]>([])

  // Sync annotations
  useMemo(() => {
    setLocalAnnotations(annotations)
  }, [annotations])

  // Parse blocks with annotations
  const blocks = useMemo(() => {
    console.log(`📖 Parsing ${markdown.length} chars with ${localAnnotations.length} annotations`)
    const parsed = parseMarkdownToBlocks(markdown, chunks, localAnnotations)
    console.log(`✅ Parsed ${parsed.length} blocks`)
    return parsed
  }, [markdown, chunks, localAnnotations])

  // Text selection
  const { selection, clearSelection } = useTextSelection(blocks, chunks)

  // Resize handling
  const handleResize = useCallback(
    async (annotationId: string, newStart: number, newEnd: number) => {
      // Optimistic update
      setLocalAnnotations(prev =>
        prev.map(ann =>
          ann.id === annotationId
            ? {
                ...ann,
                components: {
                  ...ann.components,
                  Position: {
                    ...ann.components.Position,
                    startOffset: newStart,
                    endOffset: newEnd,
                  }
                }
              }
            : ann
        )
      )
      
      // Update database
      const ops = new AnnotationOperations(createECS(), userId)
      await ops.updateOffsets(annotationId, newStart, newEnd, chunks)
      
      // Refresh from DB
      await refresh()
    },
    [chunks, refresh]
  )

  const { isResizing } = useHighlightResize(
    localAnnotations,
    blocks,
    chunks,
    handleResize
  )

  // Create annotation from selection
  const handleSaveAnnotation = useCallback(
    async (data: { color: any; note?: string; tags: string[] }) => {
      if (!selection) return
      
      await create({
        documentId,
        startOffset: selection.startOffset,
        endOffset: selection.endOffset,
        originalText: selection.text,
        chunkRef: selection.chunkRef,
        type: 'highlight',
        color: data.color,
        note: data.note,
        tags: data.tags,
      })
      
      clearSelection()
    },
    [selection, documentId, create, clearSelection]
  )

  // Track visible chunks
  const handleRangeChange = useCallback(
    (range: { startIndex: number; endIndex: number }) => {
      if (!onVisibleChunksChange) return
      
      const visibleChunkIds = new Set<string>()
      for (let i = range.startIndex; i <= range.endIndex; i++) {
        const block = blocks[i]
        if (block) visibleChunkIds.add(block.chunkId)
      }
      
      onVisibleChunksChange(Array.from(visibleChunkIds))
    },
    [blocks, onVisibleChunksChange]
  )

  return (
    <>
      <div className={isResizing ? 'cursor-col-resize' : ''}>
        <Virtuoso
          data={blocks}
          itemContent={(index, block) => (
            <BlockRenderer
              block={block}
              annotations={localAnnotations}
            />
          )}
          rangeChanged={handleRangeChange}
          overscan={2000}
          style={{ height: '100vh' }}
          className="container mx-auto px-8 max-w-4xl"
        />
      </div>

      <AnimatePresence>
        {selection && !isResizing && (
          <QuickCapture
            selection={selection}
            onSave={handleSaveAnnotation}
            onCancel={clearSelection}
          />
        )}
      </AnimatePresence>
    </>
  )
}
```

### 5.3: Updated BlockRenderer

**File:** `components/reader/BlockRenderer.tsx`

```tsx
import { memo } from 'react'
import DOMPurify from 'dompurify'
import type { Block } from '@/lib/reader/block-parser'
import type { AnnotationEntity } from '@/lib/ecs/components'

interface BlockRendererProps {
  block: Block
  annotations: AnnotationEntity[]
}

export const BlockRenderer = memo(function BlockRenderer({
  block,
  annotations,
}: BlockRendererProps) {
  const cleanHtml = DOMPurify.sanitize(block.html, {
    ALLOWED_TAGS: [
      'p', 'br', 'strong', 'em', 'u', 's', 'code', 'pre',
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'ul', 'ol', 'li', 'blockquote',
      'table', 'thead', 'tbody', 'tr', 'th', 'td',
      'a', 'img', 'span', 'div',
      'mark',
    ],
    ALLOWED_ATTR: [
      'href', 'src', 'alt', 'class', 'style',
      'data-annotation-id', 'data-type',
    ],
  })

  const proseClass = block.type === 'code' 
    ? 'not-prose font-mono' 
    : 'prose prose-sm lg:prose-base dark:prose-invert max-w-none'

  return (
    <div
      data-block-id={block.id}
      data-chunk-id={block.chunkId}
      data-start-offset={block.startOffset}
      data-end-offset={block.endOffset}
      className={proseClass}
      dangerouslySetInnerHTML={{ __html: cleanHtml }}
    />
  )
})
```

---

## Phase 6: Connection Surfacing (2 hours)

**File:** `components/sidebar/ConnectionsList.tsx` (update)

```typescript
// Fetch connections for ALL chunks in visible annotations
useEffect(() => {
  async function fetchConnections() {
    if (visibleChunkIds.length === 0) return
    
    // Get chunk IDs from visible annotations
    const annotationChunkIds = new Set<string>()
    annotations.forEach(ann => {
      const chunkRef = ann.components.ChunkRef
      chunkRef.chunkIds.forEach(id => annotationChunkIds.add(id))
    })
    
    // Combine visible chunks + annotation chunks
    const allRelevantChunks = Array.from(
      new Set([...visibleChunkIds, ...annotationChunkIds])
    )
    
    setLoading(true)
    const supabase = createClient()
    
    const { data } = await supabase
      .from('connections')
      .select('*')
      .in('source_chunk_id', allRelevantChunks)
      .order('strength', { ascending: false })
      .limit(100)
    
    setConnections(data || [])
    setLoading(false)
  }
  
  const debouncedFetch = debounce(fetchConnections, 300)
  debouncedFetch()
}, [visibleChunkIds, annotations])
```

---

## Testing Checklist

### Phase 1 (Foundation)

- [ ] Run migration: `npx supabase db push`
- [ ] Create test annotation with multi-chunk ChunkRef
- [ ] Verify `chunkIds` array populates correctly

### Phase 2 (Highlights)

- [ ] Process document with chunks
- [ ] Create annotation
- [ ] Verify inline highlight appears with correct color
- [ ] Test overlapping annotations (same text, different colors)
- [ ] Verify highlights survive re-parsing

### Phase 3 (Resize)

- [ ] Hover near highlight edge → see resize cursor
- [ ] Drag start edge → verify highlight shrinks/expands
- [ ] Drag end edge → verify highlight shrinks/expands
- [ ] Resize across chunk boundary → verify ChunkRef updates
- [ ] Try to resize beyond 5 chunks → should prevent
- [ ] Verify word boundary snapping works

### Phase 4 (Selection & Capture)

- [ ] Select text → QuickCapture appears
- [ ] Choose color → save → verify highlight appears
- [ ] Add note and tags → verify stored in annotation
- [ ] Select text spanning 3 chunks → verify ChunkRef has 3 chunk IDs
- [ ] ESC key cancels capture

### Phase 5 (Integration)

- [ ] Create → resize → verify offset updates in database
- [ ] Resize across chunks → verify connections update in sidebar
- [ ] Multiple annotations on same block → all render correctly
- [ ] Scroll performance: 60fps with 100+ annotations

### Phase 6 (Connections)

- [ ] Highlight spanning chunks 42-44
- [ ] Verify sidebar shows connections for all 3 chunks
- [ ] Resize to add chunk 45 → verify new connections appear
- [ ] Resize to remove chunk 44 → verify those connections removed

---

## Time Breakdown

- **Phase 1: Foundation** - 4-5 hours
- **Phase 2: Inline Highlights** - 5-6 hours
- **Phase 3: Resizable Highlights** - 6-7 hours
- **Phase 4: Selection & Capture** - 4-5 hours
- **Phase 5: Integration** - 3-4 hours
- **Phase 6: Connections** - 2 hours

**Total: 24-29 hours of implementation**

**Realistic timeline with testing:** 30-35 hours

---

## What You Get

1. **Multi-chunk annotations** - Highlights span arbitrary chunks, ChunkRef tracks all
2. **Inline highlights** - Accurate color-coded overlays on actual text
3. **Resizable by dragging edges** - 8px detection zone, live preview
4. **Cross-chunk resize** - Automatically recalculates spanned chunks (max 5)
5. **Word boundary snapping** - No mid-word highlights
6. **Quick capture** - Select text → choose color/note/tags → save
7. **Connection discovery** - Sidebar shows connections for ALL spanned chunks
8. **Optimistic updates** - Immediate UI, async database writes
9. **Virtualized rendering** - Smooth scrolling with 1000+ annotations

Ship Phase 1-2 first (highlights work). Then add resize in Phase 3. Everything else builds on that foundation.