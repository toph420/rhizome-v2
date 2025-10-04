# Complete Annotation System Fix - Implementation Guide

**Status**: 🟡 Ready for Implementation
**Priority**: Critical
**Estimated Time**: 7-10 hours
**Created**: 2025-10-04

---

## Overview

We're fixing three critical issues and adding multi-chunk support:

1. **Nested HTML breaking highlights** - Switch from `<mark>` tags to `<span>` + CSS
2. **Cross-paragraph selection failing** - Handle multi-block ranges properly
3. **Multi-chunk annotations missing** - Store array of chunk IDs for connection graph
4. **Bonus: Basic resize support** - Re-selection based approach

---

## Architecture Explanation

**The Problem:**
- HTML is a tree structure, not flat text
- You can't wrap arbitrary HTML elements with `<mark>` tags without breaking the tree
- Annotations can span multiple chunks and blocks

**The Solution:**
- Parse HTML as a DOM tree
- Find text nodes that overlap annotation ranges
- Wrap those text nodes in `<span>` elements with data attributes
- Use CSS to style the spans
- Store all affected chunk IDs for connection graph queries

**Why This Works:**
- Spans respect DOM structure (can wrap partial text nodes)
- CSS inheritance preserves nested formatting (`<em>`, `<strong>`, etc.)
- Markdown-absolute offsets align with blocks
- Multiple chunk IDs enable full connection graph coverage

---

## Part 1: Database Migration

**File**: `supabase/migrations/030_multi_chunk_annotations.sql`

```sql
-- Migration 030: Multi-chunk annotation support
-- Purpose: Enable annotations to span multiple chunks for connection graphs
-- Date: 2025-10-04

-- ============================================
-- COMPONENTS: Add Multi-Chunk Support
-- ============================================

-- Add chunk_ids array to source components
-- Uses JSONB array for flexibility with ECS pattern
ALTER TABLE components
  ADD COLUMN IF NOT EXISTS chunk_ids UUID[];

-- Backfill existing data (single chunk → array)
UPDATE components
SET chunk_ids = ARRAY[(data->>'chunk_id')::UUID]
WHERE component_type = 'source'
  AND chunk_ids IS NULL
  AND data->>'chunk_id' IS NOT NULL;

-- Create GIN index for efficient array queries
CREATE INDEX IF NOT EXISTS idx_components_chunk_ids
  ON components USING GIN (chunk_ids)
  WHERE component_type = 'source';

-- ============================================
-- CONNECTION GRAPH HELPER FUNCTION
-- ============================================

CREATE OR REPLACE FUNCTION find_annotation_connections(chunk_ids UUID[])
RETURNS TABLE (
  id UUID,
  source_chunk_id UUID,
  target_chunk_id UUID,
  strength FLOAT,
  engine_type TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.id,
    c.source_chunk_id,
    c.target_chunk_id,
    c.strength,
    c.engine_type
  FROM chunk_connections c
  WHERE c.source_chunk_id = ANY(chunk_ids)
     OR c.target_chunk_id = ANY(chunk_ids);
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- COMMENTS
-- ============================================

COMMENT ON COLUMN components.chunk_ids IS 'Array of chunk UUIDs for multi-chunk annotations (source component only)';
COMMENT ON FUNCTION find_annotation_connections IS 'Find all connections for annotation spanning multiple chunks';

-- ============================================
-- VERIFICATION
-- ============================================

DO $$
DECLARE
  chunk_ids_exists BOOLEAN;
  index_exists BOOLEAN;
  backfill_count INTEGER;
BEGIN
  -- Check column exists
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'components' AND column_name = 'chunk_ids'
  ) INTO chunk_ids_exists;

  -- Check index exists
  SELECT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE tablename = 'components' AND indexname = 'idx_components_chunk_ids'
  ) INTO index_exists;

  -- Check backfill count
  SELECT COUNT(*) INTO backfill_count
  FROM components
  WHERE component_type = 'source' AND chunk_ids IS NOT NULL;

  IF chunk_ids_exists AND index_exists THEN
    RAISE NOTICE 'Migration 030 completed successfully. Backfilled % source components.', backfill_count;
  ELSE
    RAISE WARNING 'Migration 030 incomplete: column=%, index=%', chunk_ids_exists, index_exists;
  END IF;
END $$;
```

**Run migration:**
```bash
# Apply via Supabase CLI
npx supabase migration new multi_chunk_annotations
# Copy SQL above into new migration file
npx supabase db reset  # Apply all migrations
```

---

## Part 2: Annotation Injection (Core Fix)

**File**: `src/lib/annotations/inject.ts` (NEW - replaces `highlight-injector.ts`)

```typescript
/**
 * Annotation injection system using span-based DOM traversal.
 *
 * This approach respects HTML structure and handles nested tags correctly.
 * Uses <span> elements with data attributes instead of <mark> tags.
 *
 * @module inject
 */

// ============================================
// TYPES
// ============================================

export interface AnnotationRange {
  id: string
  startOffset: number
  endOffset: number
  color: 'yellow' | 'green' | 'blue' | 'red' | 'purple' | 'orange' | 'pink'
}

// ============================================
// CORE FUNCTION
// ============================================

/**
 * Inject annotations into HTML by wrapping text nodes with spans.
 * This approach respects HTML structure and handles nested tags correctly.
 *
 * @param html - Raw HTML string from block
 * @param blockStartOffset - Block's starting offset in markdown
 * @param blockEndOffset - Block's ending offset in markdown
 * @param annotations - Annotations that might overlap this block
 * @returns HTML with annotation spans injected
 *
 * @example
 * ```typescript
 * const highlighted = injectAnnotations(
 *   '<p>Hello <em>world</em></p>',
 *   0,
 *   17,
 *   [{ id: 'ann-1', startOffset: 6, endOffset: 11, color: 'yellow' }]
 * )
 * // Returns: '<p>Hello <em><span data-annotation-id="ann-1" data-annotation-color="yellow">world</span></em></p>'
 * ```
 */
export function injectAnnotations(
  html: string,
  blockStartOffset: number,
  blockEndOffset: number,
  annotations: AnnotationRange[]
): string {
  if (annotations.length === 0) return html

  // Filter annotations that overlap this block
  const overlapping = annotations.filter(
    (ann) => ann.endOffset > blockStartOffset && ann.startOffset < blockEndOffset
  )

  if (overlapping.length === 0) return html

  // Parse HTML to DOM
  const parser = new DOMParser()
  const doc = parser.parseFromString(html, 'text/html')
  const body = doc.body

  // Sort annotations by start offset for consistent processing
  const sorted = [...overlapping].sort((a, b) => a.startOffset - b.startOffset)

  // Inject each annotation
  sorted.forEach((annotation, index) => {
    // Convert to block-relative offsets
    const relativeStart = Math.max(0, annotation.startOffset - blockStartOffset)
    const relativeEnd = Math.min(
      blockEndOffset - blockStartOffset,
      annotation.endOffset - blockStartOffset
    )

    const isFirst = index === 0 || annotation.startOffset !== sorted[index - 1].startOffset
    const isLast = index === sorted.length - 1 || annotation.endOffset !== sorted[index + 1].endOffset

    markTextRange(
      body,
      relativeStart,
      relativeEnd,
      annotation.id,
      annotation.color,
      isFirst,
      isLast
    )
  })

  return body.innerHTML
}

// ============================================
// INTERNAL HELPERS
// ============================================

/**
 * Mark a text range by wrapping text nodes in spans.
 * Traverses the DOM tree and splits text nodes as needed.
 *
 * @param root - Root element to traverse
 * @param startOffset - Start offset (block-relative)
 * @param endOffset - End offset (block-relative)
 * @param annotationId - Annotation ID for data attribute
 * @param color - Highlight color for data attribute
 * @param isFirstAnnotation - True if first annotation at this start offset
 * @param isLastAnnotation - True if last annotation at this end offset
 */
function markTextRange(
  root: HTMLElement,
  startOffset: number,
  endOffset: number,
  annotationId: string,
  color: string,
  isFirstAnnotation: boolean,
  isLastAnnotation: boolean
): void {
  let currentOffset = 0
  let isFirstSpan = true
  let isLastSpan = false

  function traverse(node: Node): void {
    if (node.nodeType === Node.TEXT_NODE) {
      const textContent = node.textContent || ''
      const nodeStart = currentOffset
      const nodeEnd = currentOffset + textContent.length

      // Check if this text node overlaps with annotation range
      if (nodeEnd > startOffset && nodeStart < endOffset) {
        // Calculate overlap within this text node
        const overlapStart = Math.max(0, startOffset - nodeStart)
        const overlapEnd = Math.min(textContent.length, endOffset - nodeStart)

        // Check if this is the last span we'll create
        isLastSpan = nodeEnd >= endOffset

        // Split text node into: [before] | highlighted | [after]
        const before = textContent.slice(0, overlapStart)
        const highlighted = textContent.slice(overlapStart, overlapEnd)
        const after = textContent.slice(overlapEnd)

        const parent = node.parentNode!
        const fragment = document.createDocumentFragment()

        // Create before text if exists
        if (before) {
          fragment.appendChild(document.createTextNode(before))
        }

        // Create span for highlighted portion
        const span = document.createElement('span')
        span.setAttribute('data-annotation-id', annotationId)
        span.setAttribute('data-annotation-color', color)

        // Mark first and last spans for resize handles
        if (isFirstAnnotation && isFirstSpan) {
          span.setAttribute('data-annotation-start', 'true')
        }
        if (isLastAnnotation && isLastSpan) {
          span.setAttribute('data-annotation-end', 'true')
        }

        span.textContent = highlighted
        fragment.appendChild(span)

        // Create after text if exists
        if (after) {
          fragment.appendChild(document.createTextNode(after))
        }

        // Replace original text node with fragment
        parent.replaceChild(fragment, node)

        isFirstSpan = false
      }

      currentOffset += textContent.length

    } else if (node.nodeType === Node.ELEMENT_NODE) {
      // Traverse children (making a copy since we're modifying the tree)
      const children = Array.from(node.childNodes)
      children.forEach(traverse)
    }
  }

  traverse(root)
}

/**
 * Validate HTML after injection.
 *
 * @param html - HTML string to validate
 * @returns True if valid HTML
 */
export function isValidHTML(html: string): boolean {
  try {
    const parser = new DOMParser()
    const doc = parser.parseFromString(html, 'text/html')
    const errors = doc.querySelector('parsererror')
    return !errors
  } catch {
    return false
  }
}
```

**What changed:**
- `<mark>` tags → `<span>` elements with data attributes
- Walks DOM tree to find overlapping text nodes
- Splits text nodes precisely at annotation boundaries
- Preserves HTML structure (nested tags work correctly)
- Adds markers for first/last spans (used for resize handles)

---

## Part 3: Block Renderer Updates

**File**: `src/components/reader/BlockRenderer.tsx`

```typescript
'use client'

import { memo } from 'react'
import DOMPurify from 'dompurify'
import { injectAnnotations } from '@/lib/annotations/inject'
import type { Block } from '@/lib/reader/block-parser'

interface BlockRendererProps {
  block: Block
  annotations: Array<{
    id: string
    startOffset: number
    endOffset: number
    color: string
  }>
}

const ALLOWED_TAGS = [
  'p', 'br', 'strong', 'em', 'u', 's', 'code', 'pre',
  'a', 'span', 'div',  // ← span is critical
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'ul', 'ol', 'li',
  'blockquote',
  'table', 'thead', 'tbody', 'tr', 'th', 'td',
  'img',
]

const ALLOWED_ATTR = [
  'href', 'src', 'alt', 'target', 'rel', 'class', 'id', 'style',
  'data-annotation-id',       // ← For click handlers
  'data-annotation-color',    // ← For CSS styling
  'data-annotation-start',    // ← For resize handles
  'data-annotation-end',      // ← For resize handles
]

export const BlockRenderer = memo(function BlockRenderer({
  block,
  annotations
}: BlockRendererProps) {
  // Find annotations that overlap this block
  const overlappingAnnotations = annotations.filter(
    (ann) =>
      ann.endOffset > block.startOffset &&
      ann.startOffset < block.endOffset
  )

  // Inject annotations into HTML
  const annotatedHtml = injectAnnotations(
    block.html,
    block.startOffset,
    block.endOffset,
    overlappingAnnotations
  )

  // Sanitize (now allows span + data attributes)
  const safeHtml = DOMPurify.sanitize(annotatedHtml, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
  })

  // Prose classes for everything except code blocks
  const proseClass =
    block.type === 'code'
      ? 'not-prose'
      : 'prose prose-sm lg:prose-base dark:prose-invert max-w-none'

  return (
    <div
      data-block-id={block.id}
      data-chunk-id={block.chunkId}
      data-start-offset={block.startOffset}
      data-end-offset={block.endOffset}
      className={`${proseClass} py-2 min-h-[1rem]`}
      dangerouslySetInnerHTML={{ __html: safeHtml }}
    />
  )
})
```

**Key changes:**
- Added `annotations` prop
- Import new `injectAnnotations()` from `inject.ts`
- Filter annotations by block overlap
- Updated `ALLOWED_ATTR` to include resize handle attributes
- Inject before sanitization

---

## Part 4: CSS Styles

**File**: `src/app/globals.css` (add to existing file)

```css
/* ============================================
   Annotation Highlighting Styles
   ============================================ */

/* Yellow */
[data-annotation-color="yellow"] {
  background-color: rgba(254, 240, 138, 0.4);
  border-bottom: 2px solid rgba(234, 179, 8, 0.5);
  transition: all 0.15s ease;
}

/* Green */
[data-annotation-color="green"] {
  background-color: rgba(187, 247, 208, 0.4);
  border-bottom: 2px solid rgba(34, 197, 94, 0.5);
  transition: all 0.15s ease;
}

/* Blue */
[data-annotation-color="blue"] {
  background-color: rgba(191, 219, 254, 0.4);
  border-bottom: 2px solid rgba(59, 130, 246, 0.5);
  transition: all 0.15s ease;
}

/* Red */
[data-annotation-color="red"] {
  background-color: rgba(254, 202, 202, 0.4);
  border-bottom: 2px solid rgba(239, 68, 68, 0.5);
  transition: all 0.15s ease;
}

/* Purple */
[data-annotation-color="purple"] {
  background-color: rgba(233, 213, 255, 0.4);
  border-bottom: 2px solid rgba(168, 85, 247, 0.5);
  transition: all 0.15s ease;
}

/* Orange */
[data-annotation-color="orange"] {
  background-color: rgba(254, 215, 170, 0.4);
  border-bottom: 2px solid rgba(249, 115, 22, 0.5);
  transition: all 0.15s ease;
}

/* Pink */
[data-annotation-color="pink"] {
  background-color: rgba(252, 231, 243, 0.4);
  border-bottom: 2px solid rgba(236, 72, 153, 0.5);
  transition: all 0.15s ease;
}

/* Dark mode variants */
.dark [data-annotation-color="yellow"] {
  background-color: rgba(254, 240, 138, 0.2);
  border-bottom-color: rgba(234, 179, 8, 0.3);
}

.dark [data-annotation-color="green"] {
  background-color: rgba(187, 247, 208, 0.2);
  border-bottom-color: rgba(34, 197, 94, 0.3);
}

.dark [data-annotation-color="blue"] {
  background-color: rgba(191, 219, 254, 0.2);
  border-bottom-color: rgba(59, 130, 246, 0.3);
}

.dark [data-annotation-color="red"] {
  background-color: rgba(254, 202, 202, 0.2);
  border-bottom-color: rgba(239, 68, 68, 0.3);
}

.dark [data-annotation-color="purple"] {
  background-color: rgba(233, 213, 255, 0.2);
  border-bottom-color: rgba(168, 85, 247, 0.3);
}

.dark [data-annotation-color="orange"] {
  background-color: rgba(254, 215, 170, 0.2);
  border-bottom-color: rgba(249, 115, 22, 0.3);
}

.dark [data-annotation-color="pink"] {
  background-color: rgba(252, 231, 243, 0.2);
  border-bottom-color: rgba(236, 72, 153, 0.3);
}

/* Hover effects */
[data-annotation-id] {
  cursor: pointer;
}

[data-annotation-id]:hover {
  filter: brightness(0.95);
}

.dark [data-annotation-id]:hover {
  filter: brightness(1.15);
}

/* Resize handle indicators */
[data-annotation-start] {
  position: relative;
}

[data-annotation-start]::before {
  content: '';
  position: absolute;
  left: -2px;
  top: 0;
  bottom: 0;
  width: 2px;
  background: currentColor;
  opacity: 0.3;
  transition: all 0.2s ease;
}

[data-annotation-start]:hover::before {
  width: 4px;
  opacity: 0.6;
  cursor: ew-resize;
}

[data-annotation-end] {
  position: relative;
}

[data-annotation-end]::after {
  content: '';
  position: absolute;
  right: -2px;
  top: 0;
  bottom: 0;
  width: 2px;
  background: currentColor;
  opacity: 0.3;
  transition: all 0.2s ease;
}

[data-annotation-end]:hover::after {
  width: 4px;
  opacity: 0.6;
  cursor: ew-resize;
}
```

---

## Part 5: Text Selection Fix (Multi-Block Support)

**File**: `src/hooks/useTextSelection.ts`

```typescript
import { useState, useEffect, useCallback, useRef } from 'react'

export interface TextSelection {
  text: string
  rect: DOMRect
  range: {
    startOffset: number
    endOffset: number
    chunkIds: string[]  // ← Now array for multi-chunk
  }
}

interface UseTextSelectionProps {
  documentId: string
  chunks: Array<{ id: string; start_offset: number; end_offset: number }>
  onSelectionChange?: (selection: TextSelection | null) => void
}

export function useTextSelection({
  documentId,
  chunks,
  onSelectionChange
}: UseTextSelectionProps) {
  const [selection, setSelection] = useState<TextSelection | null>(null)
  const selectionTimeoutRef = useRef<NodeJS.Timeout>()

  const handleSelectionChange = useCallback(() => {
    // Debounce selection changes
    if (selectionTimeoutRef.current) {
      clearTimeout(selectionTimeoutRef.current)
    }

    selectionTimeoutRef.current = setTimeout(() => {
      const sel = window.getSelection()

      if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
        setSelection(null)
        onSelectionChange?.(null)
        return
      }

      const range = sel.getRangeAt(0)
      const selectedText = range.toString().trim()

      if (selectedText.length === 0) {
        setSelection(null)
        onSelectionChange?.(null)
        return
      }

      try {
        // Find START block (may be different from end block!)
        let startNode = range.startContainer
        let startBlockEl = (startNode.nodeType === Node.TEXT_NODE
          ? startNode.parentElement
          : startNode) as HTMLElement

        while (startBlockEl && !startBlockEl.hasAttribute('data-start-offset')) {
          startBlockEl = startBlockEl.parentElement as HTMLElement
        }

        if (!startBlockEl) {
          console.warn('Could not find start block')
          return
        }

        // Find END block
        let endNode = range.endContainer
        let endBlockEl = (endNode.nodeType === Node.TEXT_NODE
          ? endNode.parentElement
          : endNode) as HTMLElement

        while (endBlockEl && !endBlockEl.hasAttribute('data-start-offset')) {
          endBlockEl = endBlockEl.parentElement as HTMLElement
        }

        if (!endBlockEl) {
          console.warn('Could not find end block')
          return
        }

        // Calculate START offset (markdown-absolute)
        const startBlockOffset = parseInt(
          startBlockEl.getAttribute('data-start-offset') || '0'
        )
        const startRange = range.cloneRange()
        startRange.selectNodeContents(startBlockEl)
        startRange.setEnd(range.startContainer, range.startOffset)
        const offsetInStartBlock = startRange.toString().length
        const absoluteStartOffset = startBlockOffset + offsetInStartBlock

        // Calculate END offset (markdown-absolute)
        const endBlockOffset = parseInt(
          endBlockEl.getAttribute('data-start-offset') || '0'
        )
        const endRange = range.cloneRange()
        endRange.selectNodeContents(endBlockEl)
        endRange.setEnd(range.endContainer, range.endOffset)
        const offsetInEndBlock = endRange.toString().length
        const absoluteEndOffset = endBlockOffset + offsetInEndBlock

        // Find ALL chunks that overlap this range
        const affectedChunks = chunks.filter(
          (chunk) =>
            chunk.end_offset > absoluteStartOffset &&
            chunk.start_offset < absoluteEndOffset
        )

        if (affectedChunks.length === 0) {
          console.warn('Selection does not overlap any chunks')
          return
        }

        const chunkIds = affectedChunks.map((c) => c.id)

        // Get bounding rect for popover positioning
        const rect = range.getBoundingClientRect()

        const newSelection: TextSelection = {
          text: selectedText,
          rect,
          range: {
            startOffset: absoluteStartOffset,
            endOffset: absoluteEndOffset,
            chunkIds,  // ← Array of all affected chunks
          }
        }

        console.log('📍 Selection calculated:', {
          text: selectedText.slice(0, 50) + '...',
          offsets: `${absoluteStartOffset}-${absoluteEndOffset}`,
          chunks: chunkIds.length,
        })

        setSelection(newSelection)
        onSelectionChange?.(newSelection)

      } catch (error) {
        console.error('Selection calculation failed:', error)
        setSelection(null)
        onSelectionChange?.(null)
      }
    }, 100)
  }, [chunks, onSelectionChange])

  useEffect(() => {
    document.addEventListener('mouseup', handleSelectionChange)
    document.addEventListener('keyup', handleSelectionChange)

    return () => {
      document.removeEventListener('mouseup', handleSelectionChange)
      document.removeEventListener('keyup', handleSelectionChange)
      if (selectionTimeoutRef.current) {
        clearTimeout(selectionTimeoutRef.current)
      }
    }
  }, [handleSelectionChange])

  const clearSelection = useCallback(() => {
    setSelection(null)
    onSelectionChange?.(null)
    window.getSelection()?.removeAllRanges()
  }, [onSelectionChange])

  return { selection, clearSelection }
}
```

**Key changes:**
- Finds start and end blocks independently (handles cross-paragraph)
- Calculates markdown-absolute offsets for both boundaries
- Finds ALL chunks that overlap the range
- Returns `chunkIds` array instead of single `chunkId`

---

## Part 6: Quick Capture Panel Update

**File**: `src/components/reader/QuickCapturePanel.tsx`

```typescript
'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Popover, PopoverContent } from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { Loader2, X, Tag, Palette } from 'lucide-react'
import { createAnnotation } from '@/app/actions/annotations'
import { extractContext } from '@/lib/annotations/text-range'
import type { TextSelection } from '@/hooks/useTextSelection'
import { cn } from '@/lib/utils'

interface QuickCapturePanelProps {
  selection: TextSelection
  documentId: string
  onClose: () => void
  chunks: Array<{
    id: string
    content: string
    start_offset: number
    end_offset: number
  }>
}

type HighlightColor = 'yellow' | 'green' | 'blue' | 'red' | 'purple' | 'orange' | 'pink'

const COLOR_OPTIONS: Array<{
  key: string
  color: HighlightColor
  label: string
  bgClass: string
}> = [
  { key: 'y', color: 'yellow', label: 'Yellow', bgClass: 'bg-yellow-200 hover:bg-yellow-300' },
  { key: 'g', color: 'green', label: 'Green', bgClass: 'bg-green-200 hover:bg-green-300' },
  { key: 'b', color: 'blue', label: 'Blue', bgClass: 'bg-blue-200 hover:bg-blue-300' },
  { key: 'r', color: 'red', label: 'Red', bgClass: 'bg-red-200 hover:bg-red-300' },
  { key: 'p', color: 'purple', label: 'Purple', bgClass: 'bg-purple-200 hover:bg-purple-300' },
  { key: 'o', color: 'orange', label: 'Orange', bgClass: 'bg-orange-200 hover:bg-orange-300' },
  { key: 'k', color: 'pink', label: 'Pink', bgClass: 'bg-pink-200 hover:bg-pink-300' },
]

export function QuickCapturePanel({
  selection,
  documentId,
  onClose,
  chunks,
}: QuickCapturePanelProps) {
  const [note, setNote] = useState('')
  const [tagInput, setTagInput] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [selectedColor, setSelectedColor] = useState<HighlightColor>('yellow')
  const [retryCount, setRetryCount] = useState(0)

  const noteRef = useRef<HTMLTextAreaElement>(null)
  const tagInputRef = useRef<HTMLInputElement>(null)

  const saveAnnotation = useCallback(async (color: HighlightColor) => {
    if (saving) return

    setSaving(true)
    setSelectedColor(color)

    try {
      // Extract context from PRIMARY chunk (first one in range)
      const primaryChunk = chunks.find(
        (c) => c.id === selection.range.chunkIds[0]
      )

      if (!primaryChunk) {
        throw new Error('Primary chunk not found')
      }

      // Convert to chunk-relative offsets for context extraction
      const chunkRelativeStart = Math.max(
        0,
        selection.range.startOffset - primaryChunk.start_offset
      )
      const chunkRelativeEnd = Math.min(
        primaryChunk.content.length,
        selection.range.endOffset - primaryChunk.start_offset
      )

      const textContext = extractContext(
        primaryChunk.content,
        chunkRelativeStart,
        chunkRelativeEnd
      )

      const result = await createAnnotation({
        text: selection.text,
        chunkIds: selection.range.chunkIds,  // ← Array of chunks
        documentId,
        startOffset: selection.range.startOffset,  // ← Markdown-absolute
        endOffset: selection.range.endOffset,      // ← Markdown-absolute
        color,
        note: note.trim() || undefined,
        tags: tags.length > 0 ? tags : undefined,
        textContext,
      })

      if (result.success) {
        toast.success('Highlight saved', {
          description: `${color.charAt(0).toUpperCase() + color.slice(1)} highlight created`,
          duration: 2000,
        })
        setRetryCount(0)
        onClose()
      } else {
        console.error('Server validation error:', result.error)
        toast.error('Failed to save highlight', {
          description: result.error || 'Please try again',
          action: retryCount < 3 ? {
            label: 'Retry',
            onClick: () => {
              setRetryCount(retryCount + 1)
              void saveAnnotation(color)
            },
          } : undefined,
          duration: 5000,
        })
      }
    } catch (error) {
      console.error('Failed to save annotation:', error)

      toast.error('Network error', {
        description: 'Could not reach server. Check your connection.',
        action: retryCount < 3 ? {
          label: 'Retry',
          onClick: () => {
            setRetryCount(retryCount + 1)
            void saveAnnotation(color)
          },
        } : undefined,
        duration: 5000,
      })
    } finally {
      setSaving(false)
    }
  }, [saving, chunks, selection, documentId, note, tags, retryCount, onClose])

  const handleAddTag = useCallback(() => {
    const trimmed = tagInput.trim()
    if (trimmed && !tags.includes(trimmed)) {
      setTags([...tags, trimmed])
      setTagInput('')
    }
  }, [tagInput, tags])

  const handleRemoveTag = useCallback((tag: string) => {
    setTags(tags.filter((t) => t !== tag))
  }, [tags])

  // Keyboard shortcuts
  useEffect(() => {
    function handleKeyPress(e: KeyboardEvent) {
      // Don't capture if typing in inputs
      if (
        document.activeElement === noteRef.current ||
        document.activeElement === tagInputRef.current
      ) {
        return
      }

      // Escape to close
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
        return
      }

      // Color shortcuts
      const colorOption = COLOR_OPTIONS.find(
        (opt) => opt.key === e.key.toLowerCase()
      )
      if (colorOption) {
        e.preventDefault()
        void saveAnnotation(colorOption.color)
      }
    }

    window.addEventListener('keydown', handleKeyPress)
    return () => window.removeEventListener('keydown', handleKeyPress)
  }, [saveAnnotation, onClose])

  // Calculate position
  const style: React.CSSProperties = {
    position: 'fixed',
    top: Math.min(selection.rect.bottom + 10, window.innerHeight - 350),
    left: selection.rect.left + selection.rect.width / 2,
    transform: 'translateX(-50%)',
    zIndex: 50,
  }

  return (
    <Popover open={true} onOpenChange={(open) => !open && onClose()}>
      <PopoverContent
        side="bottom"
        align="center"
        className="w-[420px]"
        style={style}
      >
        <div className="space-y-3">
          {/* Header */}
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <p className="text-sm text-muted-foreground line-clamp-2 break-words">
                "{selection.text}"
              </p>
              {selection.range.chunkIds.length > 1 && (
                <p className="text-xs text-muted-foreground mt-1">
                  Spans {selection.range.chunkIds.length} chunks
                </p>
              )}
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 flex-shrink-0"
              onClick={onClose}
              disabled={saving}
            >
              <X className="w-4 h-4" />
            </Button>
          </div>

          {/* Color picker */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Palette className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm font-medium">Highlight Color</span>
            </div>
            <div className="flex gap-1.5">
              {COLOR_OPTIONS.map((option) => (
                <button
                  key={option.color}
                  onClick={() => void saveAnnotation(option.color)}
                  disabled={saving}
                  title={`${option.label} (${option.key})`}
                  className={cn(
                    'w-8 h-8 rounded-md transition-all',
                    option.bgClass,
                    saving && 'opacity-50 cursor-not-allowed'
                  )}
                >
                  {saving && selectedColor === option.color ? (
                    <Loader2 className="w-4 h-4 animate-spin mx-auto" />
                  ) : (
                    <span className="text-xs font-semibold">
                      {option.key.toUpperCase()}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Note */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Note (optional)</label>
            <Textarea
              ref={noteRef}
              placeholder="Add context, thoughts, questions..."
              value={note}
              onChange={(e) => setNote(e.target.value)}
              disabled={saving}
              className="min-h-[80px] resize-none"
            />
          </div>

          {/* Tags */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Tag className="w-4 h-4 text-muted-foreground" />
              <label className="text-sm font-medium">Tags</label>
            </div>
            <Input
              ref={tagInputRef}
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  handleAddTag()
                }
              }}
              placeholder="Add tags (press Enter)..."
              disabled={saving}
            />
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {tags.map((tag) => (
                  <Badge key={tag} variant="secondary" className="gap-1">
                    {tag}
                    <button
                      onClick={() => handleRemoveTag(tag)}
                      disabled={saving}
                      className="hover:text-foreground disabled:opacity-50"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex justify-between items-center pt-2">
            <p className="text-xs text-muted-foreground">
              Press a letter key to save with that color
            </p>
            <div className="flex gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={onClose}
                disabled={saving}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={() => saveAnnotation(selectedColor)}
                disabled={saving}
              >
                {saving ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  'Save with Note'
                )}
              </Button>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
```

**Key changes:**
- Accepts `chunks` array prop
- Uses `selection.range.chunkIds` (array)
- Shows "Spans X chunks" if multi-chunk
- Extracts context from primary chunk
- Passes `chunkIds` array to server action

---

## Part 7: Server Action Update

**File**: `src/app/actions/annotations.ts`

```typescript
'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createECS } from '@/lib/ecs'
import { getCurrentUser } from '@/lib/auth'

/**
 * Zod schema for annotation creation.
 */
const CreateAnnotationSchema = z.object({
  text: z.string().min(1).max(5000),
  chunkIds: z.array(z.string().uuid()).min(1),  // ← Changed to array
  documentId: z.string().uuid(),
  startOffset: z.number().int().min(0),
  endOffset: z.number().int().min(0),
  color: z.enum(['yellow', 'green', 'blue', 'red', 'purple', 'orange', 'pink']),
  note: z.string().max(10000).optional(),
  tags: z.array(z.string()).optional(),
  textContext: z.object({
    before: z.string(),
    content: z.string(),
    after: z.string(),
  }),
})

/**
 * Creates annotation entity with 3 components (annotation, position, source).
 * @param data - Annotation creation data.
 * @returns Success with entity ID or error.
 */
export async function createAnnotation(
  data: z.infer<typeof CreateAnnotationSchema>
): Promise<{ success: boolean; id?: string; error?: string }> {
  try {
    // Validate input
    const validated = CreateAnnotationSchema.parse(data)

    // Get authenticated user
    const user = await getCurrentUser()
    if (!user) {
      return { success: false, error: 'Not authenticated' }
    }

    // Create ECS instance
    const ecs = createECS()

    // Create entity with 3 components
    const entityId = await ecs.createEntity(user.id, {
      annotation: {
        text: validated.text,
        note: validated.note,
        tags: validated.tags || [],
        color: validated.color,
        range: {
          startOffset: validated.startOffset,
          endOffset: validated.endOffset,
          chunkIds: validated.chunkIds,  // ← Store array
        },
        textContext: validated.textContext,
      },
      position: {
        chunkIds: validated.chunkIds,  // ← Multi-chunk support
        startOffset: validated.startOffset,
        endOffset: validated.endOffset,
        confidence: 1.0,
        method: 'exact',
        textContext: {
          before: validated.textContext.before,
          after: validated.textContext.after,
        },
      },
      source: {
        chunk_ids: validated.chunkIds,  // ← Array for connection graph
        document_id: validated.documentId,
      },
    })

    // Revalidate document page
    revalidatePath(`/read/${validated.documentId}`)

    return { success: true, id: entityId }
  } catch (error) {
    console.error('Failed to create annotation:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

// ... other functions (getAnnotations, updateAnnotation, deleteAnnotation) unchanged
```

**Key changes:**
- `chunkId: string` → `chunkIds: string[]` in schema
- Validate array has at least one chunk
- Store array in all three components (annotation, position, source)
- Connection graph queries will use `chunk_ids` array

---

## Part 8: VirtualizedReader Integration

**File**: `src/components/reader/VirtualizedReader.tsx`

```typescript
'use client'

import { useMemo, useCallback, useState, useEffect } from 'react'
import { Virtuoso } from 'react-virtuoso'
import { parseMarkdownToBlocks } from '@/lib/reader/block-parser'
import { BlockRenderer } from './BlockRenderer'
import { QuickCapturePanel } from './QuickCapturePanel'
import { useTextSelection } from '@/hooks/useTextSelection'
import { getAnnotations } from '@/app/actions/annotations'
import type { Chunk, StoredAnnotation } from '@/types/annotations'

interface VirtualizedReaderProps {
  markdown: string
  chunks: Chunk[]
  documentId: string
  onVisibleChunksChange?: (chunkIds: string[]) => void
}

export function VirtualizedReader({
  markdown,
  chunks,
  documentId,
  onVisibleChunksChange,
}: VirtualizedReaderProps) {
  // State for annotations (progressive loading)
  const [annotations, setAnnotations] = useState<StoredAnnotation[]>([])

  // Text selection tracking for new annotations
  const { selection, clearSelection } = useTextSelection({
    documentId,
    chunks,
  })

  // Load annotations from database
  useEffect(() => {
    async function loadAnnotations() {
      try {
        const result = await getAnnotations(documentId)
        if (result.success) {
          setAnnotations(result.data)
        } else {
          console.error('[VirtualizedReader] Failed to load annotations:', result.error)
        }
      } catch (error) {
        console.error('[VirtualizedReader] Error loading annotations:', error)
      }
    }

    void loadAnnotations()
  }, [documentId])

  // Parse markdown into blocks with annotations (memoized)
  const blocks = useMemo(() => {
    console.time('parse-blocks')

    // Convert StoredAnnotation[] to AnnotationForInjection[]
    const annotationsForInjection = annotations
      .filter(ann => ann.components.annotation && ann.components.position)
      .map(ann => ({
        id: ann.id,
        startOffset: ann.components.annotation!.range.startOffset,
        endOffset: ann.components.annotation!.range.endOffset,
        color: ann.components.annotation!.color,
      }))

    const parsed = parseMarkdownToBlocks(markdown, chunks, annotationsForInjection)
    console.timeEnd('parse-blocks')
    console.log(`📝 Rendering ${annotationsForInjection.length} annotations in ${parsed.length} blocks`)
    return parsed
  }, [markdown, chunks, annotations])

  // Track visible chunk IDs
  const handleVisibleRangeChange = useCallback(
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

  // Get chunk content for QuickCapture textContext extraction
  const getChunkContent = useCallback((chunkId: string): string => {
    const chunk = chunks.find(c => c.id === chunkId)
    return chunk?.content || ''
  }, [chunks])

  // Handle annotation refresh after creation
  const handleAnnotationCreated = useCallback(() => {
    // Reload annotations to show new highlight
    async function refresh() {
      const result = await getAnnotations(documentId)
      if (result.success) {
        setAnnotations(result.data)
      }
    }
    void refresh()
  }, [documentId])

  if (blocks.length === 0) {
    return (
      <div className="container mx-auto p-8">
        <p className="text-muted-foreground">No content to display</p>
      </div>
    )
  }

  return (
    <>
      <Virtuoso
        data={blocks}
        itemContent={(index, block) => {
          // Filter annotations for this block
          const blockAnnotations = annotations
            .filter(ann => ann.components.annotation)
            .map(ann => ({
              id: ann.id,
              startOffset: ann.components.annotation!.range.startOffset,
              endOffset: ann.components.annotation!.range.endOffset,
              color: ann.components.annotation!.color,
            }))
            .filter(ann =>
              ann.endOffset > block.startOffset &&
              ann.startOffset < block.endOffset
            )

          return (
            <div className="max-w-4xl mx-auto px-8">
              <BlockRenderer block={block} annotations={blockAnnotations} />
            </div>
          )
        }}
        rangeChanged={handleVisibleRangeChange}
        overscan={2000}
        style={{ height: '100%', width: '100%' }}
      />

      {/* QuickCapture panel appears when text is selected */}
      {selection && (
        <QuickCapturePanel
          selection={selection}
          documentId={documentId}
          chunks={chunks}  // ← Pass full chunks array
          onClose={() => {
            clearSelection()
            handleAnnotationCreated()
          }}
        />
      )}
    </>
  )
}
```

**Key changes:**
- Import new `injectAnnotations()` will be called by BlockRenderer
- Pass `annotations` prop to BlockRenderer
- Pass full `chunks` array to QuickCapturePanel
- Filter annotations per block in `itemContent`

---

## Part 9: Type Updates

**File**: `src/types/annotations.ts`

```typescript
// Update TextSelection interface
export interface TextSelection {
  text: string
  range: {
    startOffset: number
    endOffset: number
    chunkIds: string[]  // ← Changed from chunkId to chunkIds array
  }
  rect: DOMRect
}

// Update AnnotationData interface
export interface AnnotationData {
  text: string
  note?: string
  tags?: string[]
  color: 'yellow' | 'green' | 'blue' | 'red' | 'purple' | 'orange' | 'pink'
  range: {
    startOffset: number
    endOffset: number
    chunkIds: string[]  // ← Changed to array
  }
  textContext: TextContext
}

// Update SourceData interface
export interface SourceData {
  chunk_ids: string[]  // ← Changed to array
  document_id: string
}

// Keep Chunk interface with offsets for filtering
export interface Chunk {
  id: string
  content: string
  chunk_index: number
  start_offset: number  // ← Required for multi-chunk detection
  end_offset: number    // ← Required for multi-chunk detection
  position_context?: {
    confidence: number
    method: 'exact' | 'fuzzy' | 'approximate'
    context_before: string
    context_after: string
  }
}
```

---

## Testing Checklist

### 1. Nested HTML Test
```bash
✅ Navigate to document with formatted text
✅ Highlight text containing <em>italic</em> or <strong>bold</strong>
✅ Verify continuous highlight (no fragmented spans)
✅ Inspect HTML: should see <span> wrapping text nodes, not broken <mark> tags
✅ Check console for "Injecting" logs with correct offsets
```

### 2. Cross-Paragraph Test
```bash
✅ Select from middle of paragraph 1 to middle of paragraph 3
✅ Quick capture panel should appear
✅ Panel should show "Spans X chunks" if multi-chunk
✅ Press 'y' to create yellow highlight
✅ Verify highlight appears across all 3 paragraphs cleanly
✅ Refresh page → highlight persists
✅ Check database: chunk_ids array should contain multiple IDs
```

### 3. Multi-Chunk Test
```bash
✅ Find chunk boundary (use chunk inspector or logs)
✅ Create annotation that spans chunk boundary
✅ Check database: components.chunk_ids should contain multiple UUIDs
✅ Query connections: should find annotation via either chunk ID
✅ Verify connection graph queries work with array
```

### 4. Persistence Test
```bash
✅ Create annotation
✅ Refresh page (hard reload)
✅ Highlight appears in correct position
✅ No console errors about offset mismatches
✅ Highlight color and styling correct
```

### 5. Color & Styling Test
```bash
✅ Try all 7 colors (y/g/b/r/p/o/k)
✅ Verify CSS background + border-bottom
✅ Test dark mode variants
✅ Hover over highlight (should show hover effect)
✅ Check resize handles appear on first/last spans
✅ Test hover on resize handles (cursor changes to ew-resize)
```

### 6. Performance Test
```bash
✅ Create 50+ annotations in a document
✅ Scroll through document (should maintain 60fps)
✅ Check parse-blocks timing in console
✅ Verify no memory leaks (DevTools Memory profiler)
```

---

## Migration Strategy

### Recommended: Clean Break Approach

**Day 1 (Development)**
1. Create migration 030 locally
2. Run `npx supabase db reset`
3. Deploy new code to development environment
4. Test all scenarios above

**Day 2 (Staging)**
1. Apply migration to staging database
2. Deploy new code
3. Backfill existing annotations (if any)
4. Smoke test all functionality

**Day 3 (Production)**
1. Create database backup
2. Apply migration during low-traffic window
3. Deploy new code
4. Monitor error logs for 24 hours
5. Verify connection graph queries work

**Rollback Plan**
- Keep `highlight-injector.ts` for 1 week
- Feature flag to switch between old/new injection
- If critical issues: revert to mark-based injection
- Database migration is additive (safe to keep chunk_ids)

---

## Success Criteria

1. ✅ Annotations work with nested HTML (`<em>`, `<strong>`, `<code>`)
2. ✅ Cross-paragraph selections create valid annotations
3. ✅ Multi-chunk annotations stored with array of chunk IDs
4. ✅ Connection graph queries find annotations via any chunk
5. ✅ All 7 colors render correctly with CSS
6. ✅ Dark mode variants work
7. ✅ Resize handles appear on first/last spans
8. ✅ Hover effects functional
9. ✅ No TypeScript errors
10. ✅ No linting warnings
11. ✅ Virtuoso performance maintained (60fps)
12. ✅ Existing annotations continue to work
13. ✅ QuickCapture shows multi-chunk indicator
14. ✅ Database queries efficient (GIN index)

---

## Files Summary

### New Files (2)
- `supabase/migrations/030_multi_chunk_annotations.sql` - Database schema
- `src/lib/annotations/inject.ts` - Span-based injection engine

### Modified Files (7)
- `src/components/reader/BlockRenderer.tsx` - Use new injection, add annotations prop
- `src/app/globals.css` - Annotation CSS styles (7 colors + dark mode + resize)
- `src/hooks/useTextSelection.ts` - Multi-block support, return chunkIds array
- `src/components/reader/QuickCapturePanel.tsx` - Accept chunks, show multi-chunk UI
- `src/app/actions/annotations.ts` - chunkIds array parameter and storage
- `src/components/reader/VirtualizedReader.tsx` - Pass annotations to blocks
- `src/types/annotations.ts` - Update interfaces for arrays

### Deprecated Files (1)
- `src/lib/reader/highlight-injector.ts` - Replace with `inject.ts` (keep for 1 week)

---

## Estimated Effort

- **Database migration**: 30 minutes (write + test + verify)
- **inject.ts implementation**: 2-3 hours (complex DOM logic + edge cases)
- **Component updates**: 1-2 hours (7 files, mostly straightforward)
- **CSS styling**: 30 minutes (copy-paste with dark mode adjustments)
- **Type updates**: 15 minutes (interface changes)
- **Testing**: 2-3 hours (all 6 test scenarios + edge cases)
- **Documentation**: 1 hour (inline comments + this doc)

**Total**: 7-10 hours for complete implementation and testing

---

## Risk Assessment

### Low Risk ✅
- Span-based injection (standard DOM API)
- CSS styling (pure presentation change)
- Multi-chunk arrays (ECS JSONB flexibility)
- Backward compatible queries (array contains single ID)

### Medium Risk ⚠️
- DOM traversal complexity (need thorough testing)
- Cross-block selection edge cases (empty blocks, code blocks)
- Performance with 100+ annotations per document
- Migration backfill (if production has many annotations)

### Mitigation Strategies
- Comprehensive test fixtures with real book content
- Logging at each traversal step for debugging
- Performance profiling with large annotation sets
- Gradual rollout to test documents first
- Feature flag for old vs new injection (rollback safety)

---

## Connection Graph Bonus (Optional)

**File**: `src/lib/annotations/connections.ts` (NEW - optional enhancement)

```typescript
import { createClient } from '@/lib/supabase/client'

/**
 * Find all connections for an annotation spanning multiple chunks.
 *
 * @param chunkIds - Array of chunk IDs from annotation
 * @returns Connections array
 */
export async function findAnnotationConnections(chunkIds: string[]) {
  const supabase = createClient()

  const { data, error } = await supabase.rpc('find_annotation_connections', {
    chunk_ids: chunkIds
  })

  if (error) {
    console.error('Failed to find connections:', error)
    return []
  }

  return data || []
}

/**
 * Alternative: Direct query with array overlap operator.
 * Use this if RPC function not available.
 */
export async function findAnnotationConnectionsDirect(chunkIds: string[]) {
  const supabase = createClient()

  const { data, error } = await supabase
    .from('chunk_connections')
    .select('*')
    .or(
      `source_chunk_id.in.(${chunkIds.join(',')}),` +
      `target_chunk_id.in.(${chunkIds.join(',')})`
    )

  if (error) {
    console.error('Failed to find connections:', error)
    return []
  }

  return data || []
}
```

---

## What This Achieves

**Fixed issues:**
1. ✅ Nested HTML no longer breaks highlights
2. ✅ Cross-paragraph selection works
3. ✅ Multi-chunk annotations fully supported
4. ✅ Markdown-absolute offsets align with blocks
5. ✅ DOMPurify allows annotation spans
6. ✅ CSS-based styling (maintainable, flexible)

**Architecture wins:**
- Annotations store global positions (portable to content.md)
- Multiple chunk references (full connection graph coverage)
- Span-based rendering (respects DOM structure)
- Resize-ready (can update offsets and re-render)
- Performance optimized (CSS GPU acceleration)

**Future-ready:**
- Resize handles built-in (just wire up mouse events)
- Click handlers via event delegation (data-annotation-id)
- Export-ready (markdown positions + chunk IDs)
- Connection graph queries efficient (GIN index)

**Cost:** One database migration, ~9 file changes, zero compromises on the vision.

**Ship it.** This is the architecturally correct solution.
