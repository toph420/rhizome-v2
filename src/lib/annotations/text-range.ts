/**
 * Text range utilities for annotation capture and restoration.
 * Provides Range API helpers for precise text selection handling.
 */

import type { TextSelection, TextContext } from '@/types/annotations'

/**
 * Finds the closest chunk element ancestor from a DOM node.
 * @param node - Starting DOM node.
 * @returns Chunk element or null if not found.
 */
function findChunkElement(node: Node): HTMLElement | null {
  let current: Node | null = node

  // Traverse up the DOM tree
  while (current && current !== document.body) {
    if (current instanceof HTMLElement && current.hasAttribute('data-chunk-id')) {
      return current
    }
    current = current.parentNode
  }

  return null
}

/**
 * Captures current text selection with offsets and bounding rectangle.
 * @returns TextSelection if valid selection exists, null if collapsed.
 */
export function captureSelection(): TextSelection | null {
  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0) return null

  const range = selection.getRangeAt(0)
  if (range.collapsed) return null

  const text = selection.toString().trim()
  if (text.length === 0) return null

  // Extract chunk ID from DOM
  const container = range.commonAncestorContainer
  const chunkElement = findChunkElement(container)
  if (!chunkElement) return null

  const chunkId = chunkElement.getAttribute('data-chunk-id')
  if (!chunkId) return null

  // Get position within chunk element
  const chunkContent = chunkElement.textContent || ''
  const selectionText = range.toString()
  const startOffset = chunkContent.indexOf(selectionText)
  
  if (startOffset === -1) {
    console.warn('Failed to find selection in chunk content')
    return null
  }

  return {
    text,
    range: {
      startOffset,
      endOffset: startOffset + selectionText.length,
      chunkId,
    },
    rect: range.getBoundingClientRect(),
  }
}

/**
 * Extracts context before and after selection (~5 words each).
 * @param fullText - Complete text content.
 * @param startOffset - Selection start position.
 * @param endOffset - Selection end position.
 * @returns Object with before, content, after strings.
 */
export function extractContext(
  fullText: string,
  startOffset: number,
  endOffset: number
): TextContext {
  const contextSize = 100 // ~5 words

  const beforeStart = Math.max(0, startOffset - contextSize)
  const beforeText = fullText.substring(beforeStart, startOffset)
  const beforeWords = beforeText.trim().split(/\s+/).slice(-5).join(' ')

  const content = fullText.substring(startOffset, endOffset)

  const afterEnd = Math.min(fullText.length, endOffset + contextSize)
  const afterText = fullText.substring(endOffset, afterEnd)
  const afterWords = afterText.trim().split(/\s+/).slice(0, 5).join(' ')

  return {
    before: beforeWords,
    content,
    after: afterWords,
  }
}

/**
 * Finds a text node at the given offset within an element.
 * @param element - Container element.
 * @param offset - Character offset to find.
 * @returns Text node and adjusted offset, or null if not found.
 */
function findTextNode(
  element: HTMLElement,
  offset: number
): { node: Text; offset: number } | null {
  const walker = document.createTreeWalker(
    element,
    NodeFilter.SHOW_TEXT,
    null
  )

  let currentOffset = 0
  let node = walker.nextNode()

  while (node) {
    const textLength = node.textContent?.length || 0
    if (currentOffset + textLength >= offset) {
      return {
        node: node as Text,
        offset: offset - currentOffset,
      }
    }
    currentOffset += textLength
    node = walker.nextNode()
  }

  return null
}

/**
 * Restores Range object from offsets within chunk element.
 * @param chunkElement - DOM element containing text.
 * @param startOffset - Character start position.
 * @param endOffset - Character end position.
 * @returns Range if valid, null if offsets invalid.
 */
export function restoreRange(
  chunkElement: HTMLElement,
  startOffset: number,
  endOffset: number
): Range | null {
  try {
    const range = document.createRange()
    
    const startNode = findTextNode(chunkElement, startOffset)
    const endNode = findTextNode(chunkElement, endOffset)

    if (!startNode || !endNode) {
      console.warn('Failed to find text nodes for offsets:', { startOffset, endOffset })
      return null
    }

    range.setStart(startNode.node, startNode.offset)
    range.setEnd(endNode.node, endNode.offset)

    return range
  } catch (error) {
    console.error('Failed to restore range:', error)
    return null
  }
}

/**
 * Clears the current text selection.
 * @returns {void}
 */
export function clearSelection(): void {
  const selection = window.getSelection()
  if (selection) {
    selection.removeAllRanges()
  }
}