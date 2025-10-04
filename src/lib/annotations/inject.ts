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
