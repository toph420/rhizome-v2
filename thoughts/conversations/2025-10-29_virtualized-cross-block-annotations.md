Me: We use virtuoso for virtualized scrolling large documents. Our annotations inject span elements and we have a block renderer


Virtuoso changes everything. Your blocks are virtualized - DOM only exists for visible items. The resize hook needs major changes:

Architecture Changes Needed
1. Annotations Must Be Part of Block Rendering
Can't inject spans after render - Virtuoso recycles DOM. Annotations must be baked into block content:

tsx
// /components/reader/VirtualBlock.tsx

export function VirtualBlock({
  block,
  annotations, // Pre-filtered to this block
  isResizing,
  resizeState,
  hoveredEdge,
  onEdgeHover,
  onEdgeMouseDown,
}: {
  block: {
    id: string
    content: string
    startOffset: number
    endOffset: number
    type: 'paragraph' | 'heading' | 'code' | string
  }
  annotations: Array<{
    id: string
    startOffset: number
    endOffset: number
    color?: string
  }>
  isResizing: boolean
  resizeState: ResizeState | null
  hoveredEdge: { annotationId: string; edge: 'start' | 'end' } | null
  onEdgeHover: (annotationId: string, edge: 'start' | 'end' | null) => void
  onEdgeMouseDown: (annotationId: string, edge: 'start' | 'end', e: React.MouseEvent) => void
}) {
  
  // Build segments: [text, annotation, text, annotation, ...]
  const segments = buildAnnotationSegments(
    block.content,
    block.startOffset,
    block.endOffset,
    annotations
  )
  
  return (
    <div
      data-block-id={block.id}
      data-start-offset={block.startOffset}
      data-end-offset={block.endOffset}
      className="virtual-block"
    >
      {segments.map((segment, idx) =>
        segment.type === 'text' ? (
          <span key={idx}>{segment.content}</span>
        ) : (
          <AnnotationSpan
            key={segment.annotation.id}
            annotation={segment.annotation}
            blockStartOffset={block.startOffset}
            isStart={segment.isStart}
            isEnd={segment.isEnd}
            isResizing={isResizing && resizeState?.annotationId === segment.annotation.id}
            hoveredEdge={hoveredEdge?.annotationId === segment.annotation.id ? hoveredEdge.edge : null}
            onEdgeHover={onEdgeHover}
            onEdgeMouseDown={onEdgeMouseDown}
          >
            {segment.content}
          </AnnotationSpan>
        )
      )}
    </div>
  )
}

function buildAnnotationSegments(
  blockContent: string,
  blockStartOffset: number,
  blockEndOffset: number,
  annotations: Array<{ id: string; startOffset: number; endOffset: number }>
) {
  // Convert global offsets to block-relative offsets
  const blockAnnotations = annotations
    .filter(ann => 
      ann.startOffset < blockEndOffset && 
      ann.endOffset > blockStartOffset
    )
    .map(ann => ({
      ...ann,
      relativeStart: Math.max(0, ann.startOffset - blockStartOffset),
      relativeEnd: Math.min(blockContent.length, ann.endOffset - blockStartOffset),
    }))
    .sort((a, b) => a.relativeStart - b.relativeStart)
  
  const segments: Array
    | { type: 'text'; content: string }
    | { 
        type: 'annotation'; 
        annotation: typeof annotations[0];
        content: string;
        isStart: boolean; // First block of annotation
        isEnd: boolean;   // Last block of annotation
      }
  > = []
  
  let currentPos = 0
  
  for (const ann of blockAnnotations) {
    // Text before annotation
    if (ann.relativeStart > currentPos) {
      segments.push({
        type: 'text',
        content: blockContent.slice(currentPos, ann.relativeStart),
      })
    }
    
    // Annotation
    segments.push({
      type: 'annotation',
      annotation: annotations.find(a => a.id === ann.id)!,
      content: blockContent.slice(ann.relativeStart, ann.relativeEnd),
      isStart: ann.startOffset >= blockStartOffset, // Annotation starts in this block
      isEnd: ann.endOffset <= blockEndOffset,       // Annotation ends in this block
    })
    
    currentPos = ann.relativeEnd
  }
  
  // Remaining text
  if (currentPos < blockContent.length) {
    segments.push({
      type: 'text',
      content: blockContent.slice(currentPos),
    })
  }
  
  return segments
}
2. Annotation Span with Edge Handles
tsx
// /components/reader/AnnotationSpan.tsx

export function AnnotationSpan({
  annotation,
  blockStartOffset,
  isStart,
  isEnd,
  isResizing,
  hoveredEdge,
  children,
  onEdgeHover,
  onEdgeMouseDown,
}: {
  annotation: { id: string; startOffset: number; endOffset: number; color?: string }
  blockStartOffset: number
  isStart: boolean
  isEnd: boolean
  isResizing: boolean
  hoveredEdge: 'start' | 'end' | null
  children: React.ReactNode
  onEdgeHover: (annotationId: string, edge: 'start' | 'end' | null) => void
  onEdgeMouseDown: (annotationId: string, edge: 'start' | 'end', e: React.MouseEvent) => void
}) {
  const spanRef = useRef<HTMLSpanElement>(null)
  
  const handleMouseMove = (e: React.MouseEvent) => {
    if (isResizing) return // Don't detect edges while resizing
    
    const edge = detectEdge(e, spanRef.current!, isStart, isEnd)
    onEdgeHover(annotation.id, edge)
  }
  
  const handleMouseLeave = () => {
    onEdgeHover(annotation.id, null)
  }
  
  return (
    <span
      ref={spanRef}
      data-annotation-id={annotation.id}
      data-annotation-start={isStart || undefined}
      data-annotation-end={isEnd || undefined}
      data-start-offset={blockStartOffset}
      className={cn(
        "relative inline bg-yellow-200/40 cursor-pointer transition-opacity",
        isResizing && "opacity-30", // Dim while showing preview
        hoveredEdge && "ring-1 ring-yellow-500"
      )}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      {/* Start edge handle - only on first block */}
      {isStart && (
        <span
          className={cn(
            "absolute left-0 top-0 bottom-0 w-1 bg-yellow-500 cursor-col-resize transition-opacity",
            hoveredEdge === 'start' ? "opacity-100" : "opacity-0 hover:opacity-100"
          )}
          style={{ marginLeft: '-2px' }}
          onMouseDown={(e) => {
            e.preventDefault()
            e.stopPropagation()
            onEdgeMouseDown(annotation.id, 'start', e)
          }}
        />
      )}
      
      {children}
      
      {/* End edge handle - only on last block */}
      {isEnd && (
        <span
          className={cn(
            "absolute right-0 top-0 bottom-0 w-1 bg-yellow-500 cursor-col-resize transition-opacity",
            hoveredEdge === 'end' ? "opacity-100" : "opacity-0 hover:opacity-100"
          )}
          style={{ marginRight: '-2px' }}
          onMouseDown={(e) => {
            e.preventDefault()
            e.stopPropagation()
            onEdgeMouseDown(annotation.id, 'end', e)
          }}
        />
      )}
    </span>
  )
}

function detectEdge(
  e: React.MouseEvent,
  element: HTMLSpanElement,
  isStart: boolean,
  isEnd: boolean
): 'start' | 'end' | null {
  const rect = element.getBoundingClientRect()
  const mouseX = e.clientX
  const threshold = 8 // pixels
  
  if (isStart && Math.abs(mouseX - rect.left) <= threshold) {
    return 'start'
  }
  
  if (isEnd && Math.abs(mouseX - rect.right) <= threshold) {
    return 'end'
  }
  
  return null
}
3. Updated Resize Hook for Virtuoso
typescript
// /hooks/useAnnotationResize.ts

export function useAnnotationResize({
  enabled = true,
  virtuosoRef, // NEW: Need ref to Virtuoso
  annotations,
  onResizeComplete,
}: {
  enabled: boolean
  virtuosoRef: React.RefObject<VirtuosoHandle>
  annotations: Array<{ id: string; startOffset: number; endOffset: number }>
  onResizeComplete: (annotationId: string, newRange: { startOffset: number; endOffset: number }) => Promise<void>
}) {
  const [isResizing, setIsResizing] = useState(false)
  const [resizeState, setResizeState] = useState<ResizeState | null>(null)
  const [hoveredEdge, setHoveredEdge] = useState<{ annotationId: string; edge: 'start' | 'end' } | null>(null)
  
  // NEW: Handle scroll during resize - cancel or follow
  useEffect(() => {
    if (!isResizing || !virtuosoRef.current) return
    
    const handleScroll = () => {
      // Option 1: Cancel resize on scroll (simpler)
      console.log('[resize] Scroll detected, canceling resize')
      setIsResizing(false)
      setResizeState(null)
      document.querySelectorAll('.annotation-resize-preview').forEach(el => el.remove())
      
      // Option 2: Follow scroll (more complex, better UX)
      // - Keep resize state
      // - Update preview overlay positions
      // - This requires tracking which blocks are visible
    }
    
    // Listen to Virtuoso scroll events
    const scrollContainer = document.querySelector('.virtuoso-scroller')
    scrollContainer?.addEventListener('scroll', handleScroll, { passive: true })
    
    return () => {
      scrollContainer?.removeEventListener('scroll', handleScroll)
    }
  }, [isResizing, virtuosoRef])
  
  // Preview overlay only for visible blocks
  const updatePreviewOverlay = useCallback((startOffset: number, endOffset: number) => {
    document.querySelectorAll('.annotation-resize-preview').forEach(el => el.remove())
    
    // Only query visible blocks (Virtuoso only renders these)
    const visibleBlocks = document.querySelectorAll('[data-start-offset]')
    
    for (const blockEl of Array.from(visibleBlocks)) {
      const block = blockEl as HTMLElement
      const blockStart = parseInt(block.dataset.startOffset || '0', 10)
      const blockEnd = parseInt(block.dataset.endOffset || '0', 10)
      
      if (startOffset < blockEnd && endOffset > blockStart) {
        // ... rest of your preview logic (same as before)
      }
    }
  }, [])
  
  // Rest of hook logic stays similar, but works with only visible DOM
  
  return {
    isResizing,
    resizeState,
    hoveredEdge,
    // NEW: Callbacks for child components
    handleEdgeHover: setHoveredEdge,
    handleEdgeMouseDown: (annotationId: string, edge: 'start' | 'end', e: React.MouseEvent) => {
      e.preventDefault()
      e.stopPropagation()
      
      const annotation = annotations.find(a => a.id === annotationId)
      if (!annotation) return
      
      setResizeState({
        annotationId,
        edge,
        initialStartOffset: annotation.startOffset,
        initialEndOffset: annotation.endOffset,
        currentStartOffset: annotation.startOffset,
        currentEndOffset: annotation.endOffset,
        text: '',
      })
      setIsResizing(true)
      document.body.classList.add('annotation-resizing')
    },
  }
}
4. Wire It Up in Reader Component
tsx
// /components/reader/MarkdownReader.tsx

export function MarkdownReader({ document }: { document: Document }) {
  const virtuosoRef = useRef<VirtuosoHandle>(null)
  const [annotations, setAnnotations] = useState<Annotation[]>([])
  
  const {
    isResizing,
    resizeState,
    hoveredEdge,
    handleEdgeHover,
    handleEdgeMouseDown,
  } = useAnnotationResize({
    enabled: true,
    virtuosoRef,
    annotations,
    onResizeComplete: async (annotationId, newRange) => {
      await resizeAnnotation(annotationId, newRange.startOffset, newRange.endOffset)
      // Refresh annotations
      setAnnotations(await fetchAnnotations(document.id))
    },
  })
  
  // Build blocks from markdown
  const blocks = useMemo(() => buildBlocks(document.content), [document.content])
  
  return (
    <Virtuoso
      ref={virtuosoRef}
      data={blocks}
      itemContent={(index, block) => {
        // Filter annotations for this block
        const blockAnnotations = annotations.filter(ann =>
          ann.startOffset < block.endOffset &&
          ann.endOffset > block.startOffset
        )
        
        return (
          <VirtualBlock
            block={block}
            annotations={blockAnnotations}
            isResizing={isResizing}
            resizeState={resizeState}
            hoveredEdge={hoveredEdge}
            onEdgeHover={handleEdgeHover}
            onEdgeMouseDown={handleEdgeMouseDown}
          />
        )
      }}
    />
  )
}
Key Changes Summary
Before (non-virtualized):

✅ Query all blocks with querySelectorAll
✅ Cache block info
✅ Preview overlay uses all blocks
After (Virtuoso):

✅ Annotations baked into block rendering
✅ Only visible blocks exist in DOM
✅ Preview overlay only for visible range
✅ Handle scroll during resize (cancel or follow)
✅ Edge detection per-block, not global
Critical insight: Your resize state (offsets) is document-global, but rendering is viewport-local. Separate these concerns - state lives in the hook, rendering happens per-block.

Does your block renderer already handle annotations, or do you need help implementing buildAnnotationSegments?

Currently the issue is cross-block resizing/annotating. We're also using zustand.


Architected virtualization-aware cross-block selection using offset tracking and autoscroll.






Cross-block resizing with Virtuoso is gnarly. The issue: blocks aren't in DOM until scrolled into view, but user needs to resize across them.

Solution: Offset-Based Tracking + Autoscroll
1. Zustand Store for Resize State
typescript
// /stores/annotation-resize-store.ts

import { create } from 'zustand'

interface ResizeState {
  isResizing: boolean
  annotationId: string | null
  edge: 'start' | 'end' | null
  initialStartOffset: number
  initialEndOffset: number
  currentStartOffset: number
  currentEndOffset: number
  
  // Hovered edge (for cursor feedback)
  hoveredEdge: { annotationId: string; edge: 'start' | 'end' } | null
  
  // Actions
  startResize: (annotationId: string, edge: 'start' | 'end', startOffset: number, endOffset: number) => void
  updateResize: (newStartOffset: number, newEndOffset: number) => void
  cancelResize: () => void
  completeResize: () => void
  setHoveredEdge: (annotationId: string | null, edge: 'start' | 'end' | null) => void
}

export const useAnnotationResizeStore = create<ResizeState>((set) => ({
  isResizing: false,
  annotationId: null,
  edge: null,
  initialStartOffset: 0,
  initialEndOffset: 0,
  currentStartOffset: 0,
  currentEndOffset: 0,
  hoveredEdge: null,
  
  startResize: (annotationId, edge, startOffset, endOffset) => {
    set({
      isResizing: true,
      annotationId,
      edge,
      initialStartOffset: startOffset,
      initialEndOffset: endOffset,
      currentStartOffset: startOffset,
      currentEndOffset: endOffset,
    })
    document.body.classList.add('annotation-resizing')
    window.getSelection()?.removeAllRanges()
  },
  
  updateResize: (newStartOffset, newEndOffset) => {
    set(state => {
      if (!state.isResizing) return state
      
      // Validate based on edge being dragged
      if (state.edge === 'start') {
        newStartOffset = Math.min(newStartOffset, state.initialEndOffset - 3)
      } else {
        newEndOffset = Math.max(newEndOffset, state.initialStartOffset + 3)
      }
      
      return {
        currentStartOffset: newStartOffset,
        currentEndOffset: newEndOffset,
      }
    })
  },
  
  cancelResize: () => {
    set({
      isResizing: false,
      annotationId: null,
      edge: null,
      hoveredEdge: null,
    })
    document.body.classList.remove('annotation-resizing')
    document.querySelectorAll('.annotation-resize-preview').forEach(el => el.remove())
  },
  
  completeResize: () => {
    // Don't clear state here - parent will handle save then clear
    document.body.classList.remove('annotation-resizing')
    document.querySelectorAll('.annotation-resize-preview').forEach(el => el.remove())
  },
  
  setHoveredEdge: (annotationId, edge) => {
    set({
      hoveredEdge: annotationId && edge ? { annotationId, edge } : null,
    })
  },
}))
2. Global Mousemove Handler with Autoscroll
typescript
// /hooks/useGlobalResizeHandler.ts

import { useEffect, useRef } from 'react'
import { useAnnotationResizeStore } from '@/stores/annotation-resize-store'
import type { VirtuosoHandle } from 'react-virtuoso'

const AUTOSCROLL_THRESHOLD = 100 // pixels from edge
const AUTOSCROLL_SPEED = 10 // pixels per frame

export function useGlobalResizeHandler(
  virtuosoRef: React.RefObject<VirtuosoHandle>,
  onResizeComplete: (annotationId: string, startOffset: number, endOffset: number) => Promise<void>
) {
  const isResizing = useAnnotationResizeStore(s => s.isResizing)
  const annotationId = useAnnotationResizeStore(s => s.annotationId)
  const edge = useAnnotationResizeStore(s => s.edge)
  const updateResize = useAnnotationResizeStore(s => s.updateResize)
  const cancelResize = useAnnotationResizeStore(s => s.cancelResize)
  const completeResize = useAnnotationResizeStore(s => s.completeResize)
  const currentStartOffset = useAnnotationResizeStore(s => s.currentStartOffset)
  const currentEndOffset = useAnnotationResizeStore(s => s.currentEndOffset)
  
  const autoscrollIntervalRef = useRef<number | null>(null)
  
  // Mousemove handler
  useEffect(() => {
    if (!isResizing) return
    
    const handleMouseMove = (e: MouseEvent) => {
      e.preventDefault()
      
      // Get offset at mouse position
      const offset = getOffsetFromPoint(e.clientX, e.clientY)
      if (offset === null) return
      
      // Update resize state
      if (edge === 'start') {
        updateResize(offset, currentEndOffset)
      } else {
        updateResize(currentStartOffset, offset)
      }
      
      // Check if near viewport edge - trigger autoscroll
      const viewportHeight = window.innerHeight
      const mouseY = e.clientY
      
      if (mouseY < AUTOSCROLL_THRESHOLD) {
        // Near top - scroll up
        startAutoscroll('up')
      } else if (mouseY > viewportHeight - AUTOSCROLL_THRESHOLD) {
        // Near bottom - scroll down
        startAutoscroll('down')
      } else {
        // Not near edge - stop autoscroll
        stopAutoscroll()
      }
    }
    
    document.addEventListener('mousemove', handleMouseMove, { capture: true, passive: false })
    
    return () => {
      document.removeEventListener('mousemove', handleMouseMove, true)
      stopAutoscroll()
    }
  }, [isResizing, edge, currentStartOffset, currentEndOffset, updateResize])
  
  // Mouseup handler
  useEffect(() => {
    if (!isResizing) return
    
    const handleMouseUp = async () => {
      if (!annotationId) return
      
      stopAutoscroll()
      
      try {
        await onResizeComplete(annotationId, currentStartOffset, currentEndOffset)
        completeResize()
      } catch (error) {
        console.error('[resize] Save failed:', error)
        cancelResize()
      }
    }
    
    document.addEventListener('mouseup', handleMouseUp)
    return () => document.removeEventListener('mouseup', handleMouseUp)
  }, [isResizing, annotationId, currentStartOffset, currentEndOffset, onResizeComplete, completeResize, cancelResize])
  
  // Escape to cancel
  useEffect(() => {
    if (!isResizing) return
    
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        cancelResize()
      }
    }
    
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isResizing, cancelResize])
  
  // Autoscroll implementation
  function startAutoscroll(direction: 'up' | 'down') {
    if (autoscrollIntervalRef.current) return // Already scrolling
    
    autoscrollIntervalRef.current = window.setInterval(() => {
      if (!virtuosoRef.current) return
      
      // Get current scroll position
      virtuosoRef.current.getState((state) => {
        const scrollTop = state.scrollTop || 0
        const newScrollTop = direction === 'up'
          ? scrollTop - AUTOSCROLL_SPEED
          : scrollTop + AUTOSCROLL_SPEED
        
        virtuosoRef.current?.scrollTo({
          top: newScrollTop,
          behavior: 'auto', // Smooth scrolling interferes with drag
        })
      })
    }, 16) // ~60fps
  }
  
  function stopAutoscroll() {
    if (autoscrollIntervalRef.current) {
      clearInterval(autoscrollIntervalRef.current)
      autoscrollIntervalRef.current = null
    }
  }
}

/**
 * Get document offset from mouse coordinates.
 * Only works for visible (rendered) blocks.
 */
function getOffsetFromPoint(x: number, y: number): number | null {
  const range = getCaretRangeFromPoint(x, y)
  if (!range) return null
  
  // Find the block containing this range
  let node: Node | null = range.startContainer
  while (node && node.nodeType !== Node.ELEMENT_NODE) {
    node = node.parentNode
  }
  
  let blockEl = node as HTMLElement | null
  while (blockEl && !blockEl.dataset.startOffset) {
    blockEl = blockEl.parentElement
  }
  
  if (!blockEl) return null
  
  const blockStart = parseInt(blockEl.dataset.startOffset || '0', 10)
  
  // Calculate offset within block
  const relativeOffset = getRelativeOffsetInBlock(range, blockEl)
  
  return blockStart + relativeOffset
}

function getRelativeOffsetInBlock(range: Range, blockEl: HTMLElement): number {
  let offset = 0
  
  function walk(node: Node): boolean {
    if (node === range.startContainer) {
      offset += range.startOffset
      return true
    }
    
    if (node.nodeType === Node.TEXT_NODE) {
      offset += node.textContent?.length || 0
    }
    
    for (const child of node.childNodes) {
      if (walk(child)) return true
    }
    
    return false
  }
  
  walk(blockEl)
  return offset
}

function getCaretRangeFromPoint(x: number, y: number): Range | null {
  if (document.caretPositionFromPoint) {
    const position = document.caretPositionFromPoint(x, y)
    if (!position) return null
    const range = document.createRange()
    range.setStart(position.offsetNode, position.offset)
    range.collapse(true)
    return range
  }
  
  if (document.caretRangeFromPoint) {
    return document.caretRangeFromPoint(x, y)
  }
  
  return null
}
3. Preview Overlay That Updates on Scroll
typescript
// /hooks/useResizePreviewOverlay.ts

import { useEffect } from 'react'
import { useAnnotationResizeStore } from '@/stores/annotation-resize-store'
import { throttle } from 'lodash'

export function useResizePreviewOverlay() {
  const isResizing = useAnnotationResizeStore(s => s.isResizing)
  const currentStartOffset = useAnnotationResizeStore(s => s.currentStartOffset)
  const currentEndOffset = useAnnotationResizeStore(s => s.currentEndOffset)
  
  useEffect(() => {
    if (!isResizing) {
      // Clean up previews when not resizing
      document.querySelectorAll('.annotation-resize-preview').forEach(el => el.remove())
      return
    }
    
    // Throttled update function
    const updatePreview = throttle(() => {
      updatePreviewOverlay(currentStartOffset, currentEndOffset)
    }, 16) // ~60fps
    
    // Initial update
    updatePreview()
    
    // Update on scroll (as new blocks come into view)
    const scrollContainer = document.querySelector('.virtuoso-scroller')
    scrollContainer?.addEventListener('scroll', updatePreview, { passive: true })
    
    return () => {
      scrollContainer?.removeEventListener('scroll', updatePreview)
      updatePreview.cancel()
      document.querySelectorAll('.annotation-resize-preview').forEach(el => el.remove())
    }
  }, [isResizing, currentStartOffset, currentEndOffset])
}

function updatePreviewOverlay(startOffset: number, endOffset: number) {
  // Remove old previews
  document.querySelectorAll('.annotation-resize-preview').forEach(el => el.remove())
  
  // Only render preview for VISIBLE blocks (Virtuoso only renders these)
  const visibleBlocks = document.querySelectorAll('[data-start-offset]')
  
  for (const blockEl of Array.from(visibleBlocks)) {
    const block = blockEl as HTMLElement
    const blockStart = parseInt(block.dataset.startOffset || '0', 10)
    const blockEnd = parseInt(block.dataset.endOffset || '0', 10)
    
    // Check if this block overlaps with annotation range
    if (startOffset < blockEnd && endOffset > blockStart) {
      const relativeStart = Math.max(0, startOffset - blockStart)
      const relativeEnd = Math.min(endOffset - blockStart, block.textContent?.length || 0)
      
      try {
        const range = createRangeInBlock(block, relativeStart, relativeEnd)
        if (!range) continue
        
        const rects = range.getClientRects()
        
        for (const rect of Array.from(rects)) {
          if (rect.width === 0 || rect.height === 0) continue
          
          const previewSpan = document.createElement('span')
          previewSpan.className = 'annotation-resize-preview'
          previewSpan.style.cssText = `
            position: fixed;
            left: ${rect.left}px;
            top: ${rect.top}px;
            width: ${rect.width}px;
            height: ${rect.height}px;
            border: 2px solid rgb(59, 130, 246);
            background: rgba(59, 130, 246, 0.15);
            pointer-events: none;
            z-index: 9999;
            box-sizing: border-box;
          `
          document.body.appendChild(previewSpan)
        }
      } catch (err) {
        console.warn('[preview] Failed to create range:', err)
      }
    }
  }
}

function createRangeInBlock(blockEl: HTMLElement, startOffset: number, endOffset: number): Range | null {
  const range = document.createRange()
  const walker = document.createTreeWalker(blockEl, NodeFilter.SHOW_TEXT, null)
  
  let currentOffset = 0
  let startNode: Node | null = null
  let startNodeOffset = 0
  let endNode: Node | null = null
  let endNodeOffset = 0
  
  while (walker.nextNode()) {
    const textNode = walker.currentNode
    const textLength = textNode.textContent?.length || 0
    
    if (!startNode && currentOffset + textLength > startOffset) {
      startNode = textNode
      startNodeOffset = startOffset - currentOffset
    }
    
    if (currentOffset + textLength >= endOffset) {
      endNode = textNode
      endNodeOffset = endOffset - currentOffset
      break
    }
    
    currentOffset += textLength
  }
  
  if (!startNode || !endNode) return null
  
  range.setStart(startNode, startNodeOffset)
  range.setEnd(endNode, endNodeOffset)
  
  return range
}
4. Wire It Up
tsx
// /components/reader/MarkdownReader.tsx

export function MarkdownReader({ document }: { document: Document }) {
  const virtuosoRef = useRef<VirtuosoHandle>(null)
  const [annotations, setAnnotations] = useState<Annotation[]>([])
  
  // Global resize handlers
  useGlobalResizeHandler(virtuosoRef, async (annotationId, startOffset, endOffset) => {
    await resizeAnnotation(annotationId, startOffset, endOffset)
    setAnnotations(await fetchAnnotations(document.id))
  })
  
  // Preview overlay
  useResizePreviewOverlay()
  
  // Zustand state
  const isResizing = useAnnotationResizeStore(s => s.isResizing)
  const resizeAnnotationId = useAnnotationResizeStore(s => s.annotationId)
  const currentStartOffset = useAnnotationResizeStore(s => s.currentStartOffset)
  const currentEndOffset = useAnnotationResizeStore(s => s.currentEndOffset)
  const hoveredEdge = useAnnotationResizeStore(s => s.hoveredEdge)
  
  const blocks = useMemo(() => buildBlocks(document.content), [document.content])
  
  return (
    <Virtuoso
      ref={virtuosoRef}
      data={blocks}
      itemContent={(index, block) => {
        // Filter annotations for this block
        let blockAnnotations = annotations.filter(ann =>
          ann.startOffset < block.endOffset &&
          ann.endOffset > block.startOffset
        )
        
        // If resizing, show preview annotation
        if (isResizing && resizeAnnotationId) {
          // Add temporary preview annotation
          const isPreviewInBlock = 
            currentStartOffset < block.endOffset &&
            currentEndOffset > block.startOffset
          
          if (isPreviewInBlock) {
            // Filter out the annotation being resized
            blockAnnotations = blockAnnotations.filter(a => a.id !== resizeAnnotationId)
            
            // Add preview version
            blockAnnotations.push({
              id: resizeAnnotationId,
              startOffset: currentStartOffset,
              endOffset: currentEndOffset,
              isPreview: true, // Flag for rendering
            } as any)
          }
        }
        
        return (
          <VirtualBlock
            block={block}
            annotations={blockAnnotations}
            isResizing={isResizing}
            hoveredEdge={hoveredEdge}
          />
        )
      }}
    />
  )
}
Key Architecture Points
State Management:

✅ Zustand stores resize state globally (survives virtualization)
✅ Offsets tracked, not DOM nodes
✅ Preview updates as blocks come into view
Cross-Block Handling:

✅ Autoscroll when dragging near edges
✅ Preview only renders on visible blocks
✅ Final save uses offsets, not DOM
Performance:

✅ Throttled preview updates (60fps max)
✅ Only queries visible blocks
✅ No DOM caching needed
UX:

✅ Smooth autoscroll reveals content
✅ Preview follows scroll
✅ Escape to cancel
✅ Can resize across 100+ blocks
The critical insight: Separate logical state (offsets in Zustand) from visual state (preview overlay on visible blocks). Virtuoso virtualizes the DOM, but your offsets are always valid.

Test on a 10,000-line document with annotations spanning 50 blocks. Should feel instant.