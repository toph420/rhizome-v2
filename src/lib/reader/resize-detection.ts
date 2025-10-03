/**
 * Resize Detection Utilities.
 *
 * Detects when user is near a highlight edge for resize operations.
 * Supports both mouse and touch events with 8px edge detection zones.
 */

/**
 * Resize handle information.
 */
export interface ResizeHandle {
  annotationId: string
  edge: 'start' | 'end'
}

const EDGE_THRESHOLD = 8 // 8px edge detection zone

/**
 * Get coordinates from mouse or touch event.
 * @param event - Mouse or touch event.
 * @returns X and y coordinates.
 */
function getEventCoordinates(event: MouseEvent | TouchEvent): { x: number; y: number } {
  if ('touches' in event && event.touches.length > 0) {
    return {
      x: event.touches[0].clientX,
      y: event.touches[0].clientY
    }
  }

  if ('clientX' in event) {
    return {
      x: event.clientX,
      y: event.clientY
    }
  }

  return { x: 0, y: 0 }
}

/**
 * Detect if pointer is near a highlight edge for resize.
 * @param event - Mouse or touch event.
 * @param highlightElement - The highlight mark element.
 * @returns ResizeHandle if near edge, null otherwise.
 */
export function detectResizeHandle(
  event: MouseEvent | TouchEvent,
  highlightElement: HTMLElement
): ResizeHandle | null {
  const annotationId = highlightElement.dataset.annotationId

  if (!annotationId) {
    return null
  }

  const { x } = getEventCoordinates(event)
  const rect = highlightElement.getBoundingClientRect()

  const distanceFromStart = x - rect.left
  const distanceFromEnd = rect.right - x

  // Check if within 8px of start edge
  if (distanceFromStart >= 0 && distanceFromStart <= EDGE_THRESHOLD) {
    return {
      annotationId,
      edge: 'start'
    }
  }

  // Check if within 8px of end edge
  if (distanceFromEnd >= 0 && distanceFromEnd <= EDGE_THRESHOLD) {
    return {
      annotationId,
      edge: 'end'
    }
  }

  return null
}

/**
 * Check if element is a highlight mark.
 * @param element - Element to check.
 * @returns True if element is a highlight mark.
 */
export function isHighlightElement(element: HTMLElement | null): element is HTMLElement {
  return element?.tagName === 'MARK' && element.hasAttribute('data-annotation-id')
}

/**
 * Find highlight element from event target.
 * @param event - Mouse or touch event.
 * @returns Highlight element if found, null otherwise.
 */
export function getHighlightFromEvent(
  event: MouseEvent | TouchEvent
): HTMLElement | null {
  const target = event.target

  if (!(target instanceof HTMLElement)) {
    return null
  }

  // Check if target is the highlight
  if (target.tagName === 'MARK' && target.hasAttribute('data-annotation-id')) {
    return target
  }

  // Check if target is inside a highlight
  const highlight = target.closest('mark[data-annotation-id]')

  if (highlight instanceof HTMLElement && highlight.hasAttribute('data-annotation-id')) {
    return highlight
  }

  return null
}

/**
 * Update cursor style based on resize handle detection.
 * @param event - Mouse or touch event.
 * @param highlightElement - The highlight mark element.
 */
export function updateResizeCursor(
  event: MouseEvent | TouchEvent,
  highlightElement: HTMLElement
): void {
  const handle = detectResizeHandle(event, highlightElement)

  if (handle) {
    highlightElement.style.cursor = 'col-resize'
  } else {
    highlightElement.style.cursor = 'pointer'
  }
}
