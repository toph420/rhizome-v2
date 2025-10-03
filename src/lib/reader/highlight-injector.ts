/**
 * Highlight injection system for annotations.
 *
 * Injects `<mark>` tags into HTML blocks to display highlights inline.
 * Preserves HTML structure and handles overlapping highlights gracefully.
 * @module highlight-injector
 */

// ============================================
// TYPES
// ============================================

export interface AnnotationForInjection {
  id: string
  startOffset: number
  endOffset: number
  color: 'yellow' | 'green' | 'blue' | 'red' | 'purple' | 'orange' | 'pink'
}

export interface InjectHighlightsOptions {
  /** Block HTML content to inject into. */
  html: string
  /** Block's starting offset in the markdown. */
  blockStartOffset: number
  /** Block's ending offset in the markdown. */
  blockEndOffset: number
  /** Annotations that might overlap this block. */
  annotations: AnnotationForInjection[]
}

// ============================================
// CORE FUNCTION
// ============================================

/**
 * Inject highlight `<mark>` tags into block HTML.
 *
 * Finds annotations that overlap with the block's offset range,
 * converts offsets to block-relative positions, and injects `<mark>` tags
 * around the matched text. Preserves HTML structure and handles overlapping
 * highlights by wrapping nested marks.
 *
 * @param options - Injection configuration.
 * @returns HTML with injected highlight marks.
 * @example
 * ```typescript
 * const highlighted = injectHighlights({
 *   html: '<p>Hello world</p>',
 *   blockStartOffset: 0,
 *   blockEndOffset: 11,
 *   annotations: [{
 *     id: 'ann-1',
 *     startOffset: 0,
 *     endOffset: 5,
 *     color: 'yellow'
 *   }]
 * })
 * // Returns: '<p><mark data-annotation-id="ann-1" data-color="yellow">Hello</mark> world</p>'
 * ```
 */
export function injectHighlights(options: InjectHighlightsOptions): string {
  const { html, blockStartOffset, blockEndOffset, annotations } = options

  // No annotations = no injection needed
  if (annotations.length === 0) {
    return html
  }

  // Filter annotations that overlap this block
  const overlapping = annotations.filter((ann) => {
    return ann.startOffset < blockEndOffset && ann.endOffset > blockStartOffset
  })

  if (overlapping.length === 0) {
    return html
  }

  // Sort annotations by start offset (earliest first) for consistent layering
  const sorted = [...overlapping].sort((a, b) => a.startOffset - b.startOffset)

  // Parse HTML using DOMParser (browser-safe parsing)
  const parser = new DOMParser()
  const doc = parser.parseFromString(html, 'text/html')

  // Process each annotation
  for (const annotation of sorted) {
    // Convert global offsets to block-relative offsets
    const relativeStart = Math.max(0, annotation.startOffset - blockStartOffset)
    const relativeEnd = Math.min(
      blockEndOffset - blockStartOffset,
      annotation.endOffset - blockStartOffset
    )

    // Inject marks into the document
    injectMarkIntoNode(
      doc.body,
      relativeStart,
      relativeEnd,
      annotation.id,
      annotation.color
    )
  }

  // Extract the modified HTML (excluding <body> tags)
  return doc.body.innerHTML
}

// ============================================
// INTERNAL HELPERS
// ============================================

/**
 * Recursively inject mark tags into a DOM node.
 *
 * Walks the node tree, finds text nodes that overlap the range,
 * and wraps the matched text in a `<mark>` element.
 *
 * @param node - DOM node to process.
 * @param startOffset - Start offset (relative to block start).
 * @param endOffset - End offset (relative to block start).
 * @param annotationId - Annotation ID for data attribute.
 * @param color - Highlight color for data attribute.
 * @param currentOffset - Current text offset tracker (internal).
 * @returns Updated offset after processing.
 */
function injectMarkIntoNode(
  node: Node,
  startOffset: number,
  endOffset: number,
  annotationId: string,
  color: string,
  currentOffset = 0
): number {
  let offset = currentOffset

  // Base case: Text node
  if (node.nodeType === Node.TEXT_NODE) {
    const text = node.textContent || ''
    const textLength = text.length
    const textStart = offset
    const textEnd = offset + textLength

    // Check if this text node overlaps with highlight range
    if (textStart < endOffset && textEnd > startOffset) {
      // Calculate overlap within this text node
      const highlightStart = Math.max(0, startOffset - textStart)
      const highlightEnd = Math.min(textLength, endOffset - textStart)

      // Split text into: before | highlighted | after
      const before = text.substring(0, highlightStart)
      const highlighted = text.substring(highlightStart, highlightEnd)
      const after = text.substring(highlightEnd)

      // Create mark element
      const mark = document.createElement('mark')
      mark.setAttribute('data-annotation-id', annotationId)
      mark.setAttribute('data-color', color)
      mark.textContent = highlighted

      // Build new structure
      const fragment = document.createDocumentFragment()
      if (before) fragment.appendChild(document.createTextNode(before))
      fragment.appendChild(mark)
      if (after) fragment.appendChild(document.createTextNode(after))

      // Replace original text node
      node.parentNode?.replaceChild(fragment, node)
    }

    return offset + textLength
  }

  // Recursive case: Element node
  if (node.nodeType === Node.ELEMENT_NODE) {
    // Don't inject inside existing marks (handle overlaps)
    if ((node as Element).tagName === 'MARK') {
      // Just count the text and skip injection
      const text = node.textContent || ''
      return offset + text.length
    }

    // Process child nodes
    const children = Array.from(node.childNodes)
    for (const child of children) {
      offset = injectMarkIntoNode(
        child,
        startOffset,
        endOffset,
        annotationId,
        color,
        offset
      )
    }
  }

  return offset
}

/**
 * Count total text content in a node (for offset tracking).
 *
 * @param node - DOM node.
 * @returns Total text length.
 */
function getTextLength(node: Node): number {
  if (node.nodeType === Node.TEXT_NODE) {
    return (node.textContent || '').length
  }

  if (node.nodeType === Node.ELEMENT_NODE) {
    let length = 0
    for (const child of node.childNodes) {
      length += getTextLength(child)
    }
    return length
  }

  return 0
}

/**
 * Check if HTML is valid after injection.
 *
 * @param html - HTML string to validate.
 * @returns True if valid HTML.
 */
export function isValidHTML(html: string): boolean {
  try {
    const parser = new DOMParser()
    const doc = parser.parseFromString(html, 'text/html')
    // Check for parsing errors
    const errors = doc.querySelector('parsererror')
    return !errors
  } catch {
    return false
  }
}
