/**
 * @jest-environment jsdom
 */

import {
  calculateOffsetsFromRange,
  getCurrentSelectionRange,
  isValidSelection,
  calculateOffsetsFromCurrentSelection
} from '../offset-calculator'

describe('offset-calculator', () => {
  describe('calculateOffsetsFromRange', () => {
    it('calculates simple selection in paragraph', () => {
      // Create a block element with offset data
      const block = document.createElement('div')
      block.dataset.startOffset = '0'
      block.textContent = 'Hello world, this is a test paragraph.'

      document.body.appendChild(block)

      // Create a range selecting "Hello"
      const range = document.createRange()
      const textNode = block.firstChild as Text
      range.setStart(textNode, 0)
      range.setEnd(textNode, 5)

      const result = calculateOffsetsFromRange(range, false)

      expect(result.startOffset).toBe(0)
      expect(result.endOffset).toBe(5)
      expect(result.selectedText).toBe('Hello')
      expect(result.snapped).toBe(false)

      document.body.removeChild(block)
    })

    it('calculates selection with block offset', () => {
      const block = document.createElement('div')
      block.dataset.startOffset = '1000' // Block starts at offset 1000
      block.textContent = 'This block has an offset.'

      document.body.appendChild(block)

      const range = document.createRange()
      const textNode = block.firstChild as Text
      range.setStart(textNode, 11) // "has"
      range.setEnd(textNode, 14)

      const result = calculateOffsetsFromRange(range, false)

      expect(result.startOffset).toBe(1011) // 1000 + 11
      expect(result.endOffset).toBe(1014) // 1000 + 14
      expect(result.selectedText).toBe('has')

      document.body.removeChild(block)
    })

    it('snaps to word boundaries with leading whitespace', () => {
      const block = document.createElement('div')
      block.dataset.startOffset = '0'
      block.textContent = 'Hello world test'

      document.body.appendChild(block)

      const range = document.createRange()
      const textNode = block.firstChild as Text
      range.setStart(textNode, 5) // Start at space before "world"
      range.setEnd(textNode, 11) // End after "world "

      const result = calculateOffsetsFromRange(range, true)

      expect(result.startOffset).toBe(6) // Snapped to "w" in "world"
      expect(result.endOffset).toBe(11) // Snapped to end of "world"
      expect(result.snapped).toBe(true)

      document.body.removeChild(block)
    })

    it('snaps to word boundaries with trailing whitespace', () => {
      const block = document.createElement('div')
      block.dataset.startOffset = '0'
      block.textContent = 'Hello world test'

      document.body.appendChild(block)

      const range = document.createRange()
      const textNode = block.firstChild as Text
      range.setStart(textNode, 6) // "world "
      range.setEnd(textNode, 12) // includes space

      const result = calculateOffsetsFromRange(range, true)

      expect(result.startOffset).toBe(6)
      expect(result.endOffset).toBe(11) // Trimmed trailing space
      expect(result.snapped).toBe(true)

      document.body.removeChild(block)
    })

    it('handles selection with nested HTML', () => {
      const block = document.createElement('div')
      block.dataset.startOffset = '0'
      block.innerHTML = 'Hello <strong>bold</strong> world'

      document.body.appendChild(block)

      // Select "bold world"
      const range = document.createRange()
      const strongElement = block.querySelector('strong') as HTMLElement
      const strongText = strongElement.firstChild as Text
      const worldText = block.childNodes[2] as Text

      range.setStart(strongText, 0)
      range.setEnd(worldText, 6)

      const result = calculateOffsetsFromRange(range, false)

      expect(result.startOffset).toBe(6) // "Hello " = 6 chars
      expect(result.endOffset).toBe(16) // "bold world" = 10 chars
      expect(result.selectedText).toBe('bold world')

      document.body.removeChild(block)
    })

    it('throws error when not in a block with offset', () => {
      const div = document.createElement('div')
      // No data-start-offset attribute
      div.textContent = 'Test'

      document.body.appendChild(div)

      const range = document.createRange()
      const textNode = div.firstChild as Text
      range.setStart(textNode, 0)
      range.setEnd(textNode, 4)

      expect(() => {
        calculateOffsetsFromRange(range)
      }).toThrow('Selection must be within a block with data-start-offset attribute')

      document.body.removeChild(div)
    })

    it('handles cross-element selection', () => {
      const block = document.createElement('div')
      block.dataset.startOffset = '100'
      block.innerHTML = '<p>First paragraph</p><p>Second paragraph</p>'

      document.body.appendChild(block)

      const range = document.createRange()
      const firstP = block.querySelector('p:first-child') as HTMLElement
      const secondP = block.querySelector('p:last-child') as HTMLElement

      range.setStart(firstP.firstChild as Text, 6) // "paragraph"
      range.setEnd(secondP.firstChild as Text, 6) // "Second"

      const result = calculateOffsetsFromRange(range, false)

      expect(result.startOffset).toBeGreaterThanOrEqual(100)
      expect(result.endOffset).toBeGreaterThan(result.startOffset)

      document.body.removeChild(block)
    })

    it('returns empty selection for collapsed range', () => {
      const block = document.createElement('div')
      block.dataset.startOffset = '0'
      block.textContent = 'Test'

      document.body.appendChild(block)

      const range = document.createRange()
      const textNode = block.firstChild as Text
      range.setStart(textNode, 2)
      range.setEnd(textNode, 2) // Collapsed

      const result = calculateOffsetsFromRange(range, false)

      expect(result.startOffset).toBe(2)
      expect(result.endOffset).toBe(2)
      expect(result.selectedText).toBe('')

      document.body.removeChild(block)
    })
  })

  describe('getCurrentSelectionRange', () => {
    it('returns null when no selection', () => {
      window.getSelection()?.removeAllRanges()

      const result = getCurrentSelectionRange()

      expect(result).toBeNull()
    })

    it('returns null when selection is collapsed', () => {
      const block = document.createElement('div')
      block.textContent = 'Test'
      document.body.appendChild(block)

      const range = document.createRange()
      const textNode = block.firstChild as Text
      range.setStart(textNode, 2)
      range.setEnd(textNode, 2)

      const selection = window.getSelection()
      selection?.removeAllRanges()
      selection?.addRange(range)

      const result = getCurrentSelectionRange()

      expect(result).toBeNull()

      document.body.removeChild(block)
    })

    it('returns range when valid selection exists', () => {
      const block = document.createElement('div')
      block.textContent = 'Test selection'
      document.body.appendChild(block)

      const range = document.createRange()
      const textNode = block.firstChild as Text
      range.setStart(textNode, 0)
      range.setEnd(textNode, 4)

      const selection = window.getSelection()
      selection?.removeAllRanges()
      selection?.addRange(range)

      const result = getCurrentSelectionRange()

      expect(result).not.toBeNull()
      expect(result?.toString()).toBe('Test')

      document.body.removeChild(block)
    })
  })

  describe('isValidSelection', () => {
    it('returns true when selection is in block with offset', () => {
      const block = document.createElement('div')
      block.dataset.startOffset = '0'
      block.textContent = 'Valid block'

      document.body.appendChild(block)

      const range = document.createRange()
      const textNode = block.firstChild as Text
      range.setStart(textNode, 0)
      range.setEnd(textNode, 5)

      expect(isValidSelection(range)).toBe(true)

      document.body.removeChild(block)
    })

    it('returns false when selection is not in block with offset', () => {
      const div = document.createElement('div')
      div.textContent = 'Invalid block'

      document.body.appendChild(div)

      const range = document.createRange()
      const textNode = div.firstChild as Text
      range.setStart(textNode, 0)
      range.setEnd(textNode, 5)

      expect(isValidSelection(range)).toBe(false)

      document.body.removeChild(div)
    })
  })

  describe('calculateOffsetsFromCurrentSelection', () => {
    it('returns null when no selection', () => {
      window.getSelection()?.removeAllRanges()

      const result = calculateOffsetsFromCurrentSelection()

      expect(result).toBeNull()
    })

    it('returns offsets when valid selection exists', () => {
      const block = document.createElement('div')
      block.dataset.startOffset = '0'
      block.textContent = 'Current selection test'

      document.body.appendChild(block)

      const range = document.createRange()
      const textNode = block.firstChild as Text
      range.setStart(textNode, 8)
      range.setEnd(textNode, 17)

      const selection = window.getSelection()
      selection?.removeAllRanges()
      selection?.addRange(range)

      const result = calculateOffsetsFromCurrentSelection()

      expect(result).not.toBeNull()
      expect(result?.startOffset).toBe(8)
      expect(result?.endOffset).toBe(17)
      expect(result?.selectedText).toBe('selection')

      document.body.removeChild(block)
    })
  })
})
