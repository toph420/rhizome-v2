/**
 * Offset Calculator from DOM Range.
 *
 * Converts DOM Range selections to markdown offsets for consistent annotation positioning.
 * Includes word boundary snapping for clean text selections.
 */

/**
 * Offset result with word boundary snapping.
 */
export interface OffsetResult {
  startOffset: number
  endOffset: number
  selectedText: string
  snapped: boolean
}

/**
 * Calculate markdown offsets from a DOM Range.
 *
 * This function:
 * 1. Finds the parent block with data-start-offset.
 * 2. Calculates offset within the block using Range API.
 * 3. Adds block offset to get global position.
 * 4. Optionally snaps to word boundaries.
 * @param range - DOM Range from window.getSelection().
 * @param snapToWord - Whether to snap to word boundaries.
 * @returns Offset result with start/end positions and selected text.
 */
export function calculateOffsetsFromRange(
  range: Range,
  snapToWord = true
): OffsetResult {
  // Find the parent block element with offset data
  const blockElement = findBlockElement(range.commonAncestorContainer)

  if (!blockElement) {
    throw new Error('Selection must be within a block with data-start-offset attribute')
  }

  const blockStartOffset = parseInt(blockElement.dataset.startOffset || '0', 10)

  // Calculate offset within block using Range API
  const blockRange = document.createRange()
  blockRange.selectNodeContents(blockElement)
  blockRange.setEnd(range.startContainer, range.startOffset)

  const offsetInBlock = blockRange.toString().length
  const selectedText = range.toString()

  // Calculate global offsets
  let startOffset = blockStartOffset + offsetInBlock
  let endOffset = startOffset + selectedText.length

  // Snap to word boundaries if requested
  let snapped = false
  if (snapToWord && selectedText.length > 0) {
    const snappedResult = snapToWordBoundaries(selectedText, startOffset)
    if (snappedResult) {
      startOffset = snappedResult.startOffset
      endOffset = snappedResult.endOffset
      snapped = true
    }
  }

  return {
    startOffset,
    endOffset,
    selectedText: selectedText.substring(
      startOffset - (blockStartOffset + offsetInBlock),
      endOffset - (blockStartOffset + offsetInBlock)
    ),
    snapped
  }
}

/**
 * Find the closest parent block element with offset data.
 * @param node - Starting DOM node (usually from range.commonAncestorContainer).
 * @returns Block element with data-start-offset, or null if not found.
 */
function findBlockElement(node: Node): HTMLElement | null {
  let current: Node | null = node

  // If starting node is a text node, start with its parent
  if (current.nodeType === Node.TEXT_NODE) {
    current = current.parentNode
  }

  // Walk up the tree until we find an element with data-start-offset
  while (current && current.nodeType === Node.ELEMENT_NODE) {
    const element = current as HTMLElement
    if (element.hasAttribute('data-start-offset')) {
      return element
    }
    current = element.parentElement
  }

  return null
}

/**
 * Snap selection to word boundaries.
 *
 * Removes leading/trailing whitespace and ensures selection starts/ends on word boundaries.
 * @param text - Selected text.
 * @param startOffset - Original start offset.
 * @returns Snapped offsets or null if no snapping needed.
 */
function snapToWordBoundaries(
  text: string,
  startOffset: number
): { startOffset: number; endOffset: number } | null {
  // Trim leading whitespace
  const leadingWhitespace = text.match(/^\s*/)?.[0].length || 0

  // Trim trailing whitespace
  const trailingWhitespace = text.match(/\s*$/)?.[0].length || 0

  if (leadingWhitespace === 0 && trailingWhitespace === 0) {
    // No whitespace to trim
    return null
  }

  const trimmedStart = startOffset + leadingWhitespace
  const trimmedEnd = startOffset + text.length - trailingWhitespace

  return {
    startOffset: trimmedStart,
    endOffset: trimmedEnd
  }
}

/**
 * Get current DOM selection as a Range.
 * @returns Current Range from window.getSelection(), or null if no selection.
 */
export function getCurrentSelectionRange(): Range | null {
  const selection = window.getSelection()

  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
    return null
  }

  return selection.getRangeAt(0)
}

/**
 * Check if selection is within a valid block element.
 * @param range - DOM Range to check.
 * @returns True if selection is within a block with offset data.
 */
export function isValidSelection(range: Range): boolean {
  const blockElement = findBlockElement(range.commonAncestorContainer)
  return blockElement !== null
}

/**
 * Calculate offsets from current window selection.
 *
 * Convenience function that gets current selection and calculates offsets.
 * @param snapToWord - Whether to snap to word boundaries.
 * @returns Offset result or null if no valid selection.
 */
export function calculateOffsetsFromCurrentSelection(
  snapToWord = true
): OffsetResult | null {
  const range = getCurrentSelectionRange()

  if (!range || !isValidSelection(range)) {
    return null
  }

  return calculateOffsetsFromRange(range, snapToWord)
}

/**
 * Calculate markdown offsets for multi-block selections.
 *
 * Handles selections spanning multiple blocks (e.g., paragraph 1 to paragraph 3).
 * Independently finds start/end blocks and calculates absolute offsets.
 * @param range - DOM Range from window.getSelection().
 * @param snapToWord - Whether to snap to word boundaries.
 * @returns Offset result with absolute start/end positions.
 */
export function calculateMultiBlockOffsets(
  range: Range,
  snapToWord = true
): OffsetResult {
  // Find start and end blocks independently
  const startBlock = findBlockElement(range.startContainer)
  const endBlock = findBlockElement(range.endContainer)

  if (!startBlock) {
    throw new Error('Start of selection must be within a block with data-start-offset')
  }

  if (!endBlock) {
    throw new Error('End of selection must be within a block with data-start-offset')
  }

  // Get block start offsets (markdown-absolute)
  const startBlockOffset = parseInt(startBlock.dataset.startOffset || '0', 10)
  const endBlockOffset = parseInt(endBlock.dataset.startOffset || '0', 10)

  // Calculate offset within start block
  const startRange = document.createRange()
  startRange.selectNodeContents(startBlock)
  startRange.setEnd(range.startContainer, range.startOffset)
  const offsetInStartBlock = startRange.toString().length

  // Calculate offset within end block
  const endRange = document.createRange()
  endRange.selectNodeContents(endBlock)
  endRange.setEnd(range.endContainer, range.endOffset)
  const offsetInEndBlock = endRange.toString().length

  // Calculate markdown-absolute offsets
  let startOffset = startBlockOffset + offsetInStartBlock
  let endOffset = endBlockOffset + offsetInEndBlock

  // Get selected text
  const selectedText = range.toString()

  // Snap to word boundaries if requested
  let snapped = false
  if (snapToWord && selectedText.length > 0) {
    const snappedResult = snapToWordBoundaries(selectedText, startOffset)
    if (snappedResult) {
      startOffset = snappedResult.startOffset
      endOffset = snappedResult.endOffset
      snapped = true
    }
  }

  return {
    startOffset,
    endOffset,
    selectedText: selectedText.trim(),
    snapped,
  }
}
