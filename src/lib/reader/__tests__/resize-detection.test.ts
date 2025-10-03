/**
 * @jest-environment jsdom
 */

import {
  detectResizeHandle,
  isHighlightElement,
  getHighlightFromEvent,
  updateResizeCursor
} from '../resize-detection'

describe('resize-detection', () => {
  describe('detectResizeHandle', () => {
    it('detects near start edge (2px from start)', () => {
      const element = document.createElement('mark')
      element.dataset.annotationId = 'test-123'

      // Mock getBoundingClientRect to return a highlight from pixels 100-200
      jest.spyOn(element, 'getBoundingClientRect').mockReturnValue({
        left: 100,
        right: 200,
        top: 0,
        bottom: 20,
        width: 100,
        height: 20,
        x: 100,
        y: 0,
        toJSON: () => ({})
      })

      const mouseEvent = new MouseEvent('mousemove', {
        clientX: 102, // 2px from start
        clientY: 10
      })

      const result = detectResizeHandle(mouseEvent, element)

      expect(result).toEqual({
        annotationId: 'test-123',
        edge: 'start'
      })
    })

    it('detects near end edge (4px from end)', () => {
      const element = document.createElement('mark')
      element.dataset.annotationId = 'test-456'

      jest.spyOn(element, 'getBoundingClientRect').mockReturnValue({
        left: 100,
        right: 200,
        top: 0,
        bottom: 20,
        width: 100,
        height: 20,
        x: 100,
        y: 0,
        toJSON: () => ({})
      })

      const mouseEvent = new MouseEvent('mousemove', {
        clientX: 196, // 4px from end (200 - 4)
        clientY: 10
      })

      const result = detectResizeHandle(mouseEvent, element)

      expect(result).toEqual({
        annotationId: 'test-456',
        edge: 'end'
      })
    })

    it('returns null when outside 8px zone', () => {
      const element = document.createElement('mark')
      element.dataset.annotationId = 'test-789'

      jest.spyOn(element, 'getBoundingClientRect').mockReturnValue({
        left: 100,
        right: 200,
        top: 0,
        bottom: 20,
        width: 100,
        height: 20,
        x: 100,
        y: 0,
        toJSON: () => ({})
      })

      // Mouse at center of highlight (10px from any edge)
      const mouseEvent = new MouseEvent('mousemove', {
        clientX: 150,
        clientY: 10
      })

      const result = detectResizeHandle(mouseEvent, element)

      expect(result).toBeNull()
    })

    it('returns null when 10px from edge (outside threshold)', () => {
      const element = document.createElement('mark')
      element.dataset.annotationId = 'test-999'

      jest.spyOn(element, 'getBoundingClientRect').mockReturnValue({
        left: 100,
        right: 200,
        top: 0,
        bottom: 20,
        width: 100,
        height: 20,
        x: 100,
        y: 0,
        toJSON: () => ({})
      })

      const mouseEvent = new MouseEvent('mousemove', {
        clientX: 110, // 10px from start edge
        clientY: 10
      })

      const result = detectResizeHandle(mouseEvent, element)

      expect(result).toBeNull()
    })

    it('works with touch events', () => {
      const element = document.createElement('mark')
      element.dataset.annotationId = 'touch-123'

      jest.spyOn(element, 'getBoundingClientRect').mockReturnValue({
        left: 100,
        right: 200,
        top: 0,
        bottom: 20,
        width: 100,
        height: 20,
        x: 100,
        y: 0,
        toJSON: () => ({})
      })

      const touchEvent = new TouchEvent('touchmove', {
        touches: [
          {
            clientX: 198,
            clientY: 10
          } as Touch
        ]
      })

      const result = detectResizeHandle(touchEvent, element)

      expect(result).toEqual({
        annotationId: 'touch-123',
        edge: 'end'
      })
    })

    it('returns null when element has no annotation ID', () => {
      const element = document.createElement('mark')
      // No dataset.annotationId set

      jest.spyOn(element, 'getBoundingClientRect').mockReturnValue({
        left: 100,
        right: 200,
        top: 0,
        bottom: 20,
        width: 100,
        height: 20,
        x: 100,
        y: 0,
        toJSON: () => ({})
      })

      const mouseEvent = new MouseEvent('mousemove', {
        clientX: 102,
        clientY: 10
      })

      const result = detectResizeHandle(mouseEvent, element)

      expect(result).toBeNull()
    })

    it('detects at exact edge boundaries', () => {
      const element = document.createElement('mark')
      element.dataset.annotationId = 'boundary-test'

      jest.spyOn(element, 'getBoundingClientRect').mockReturnValue({
        left: 100,
        right: 200,
        top: 0,
        bottom: 20,
        width: 100,
        height: 20,
        x: 100,
        y: 0,
        toJSON: () => ({})
      })

      // Test exact 8px distance from start
      const startEdgeEvent = new MouseEvent('mousemove', {
        clientX: 108, // exactly 8px from start
        clientY: 10
      })

      expect(detectResizeHandle(startEdgeEvent, element)).toEqual({
        annotationId: 'boundary-test',
        edge: 'start'
      })

      // Test exact 8px distance from end
      const endEdgeEvent = new MouseEvent('mousemove', {
        clientX: 192, // exactly 8px from end (200 - 8)
        clientY: 10
      })

      expect(detectResizeHandle(endEdgeEvent, element)).toEqual({
        annotationId: 'boundary-test',
        edge: 'end'
      })
    })
  })

  describe('isHighlightElement', () => {
    it('returns true for mark with annotation ID', () => {
      const element = document.createElement('mark')
      element.dataset.annotationId = 'test-123'

      expect(isHighlightElement(element)).toBe(true)
    })

    it('returns false for mark without annotation ID', () => {
      const element = document.createElement('mark')

      expect(isHighlightElement(element)).toBe(false)
    })

    it('returns false for non-mark element', () => {
      const element = document.createElement('span')
      element.dataset.annotationId = 'test-123'

      expect(isHighlightElement(element)).toBe(false)
    })

    it('returns false for null', () => {
      expect(isHighlightElement(null)).toBe(false)
    })
  })

  describe('getHighlightFromEvent', () => {
    it('returns highlight when target is the mark', () => {
      const mark = document.createElement('mark')
      mark.dataset.annotationId = 'direct-123'

      const event = new MouseEvent('click', { bubbles: true })
      Object.defineProperty(event, 'target', { value: mark, enumerable: true })

      const result = getHighlightFromEvent(event)

      expect(result).toBe(mark)
      expect(result?.dataset.annotationId).toBe('direct-123')
    })

    it('returns highlight when target is inside mark', () => {
      const container = document.createElement('div')
      const mark = document.createElement('mark')
      mark.dataset.annotationId = 'nested-456'

      const span = document.createElement('span')
      span.textContent = 'nested content'

      mark.appendChild(span)
      container.appendChild(mark)

      const event = new MouseEvent('click', { bubbles: true })
      Object.defineProperty(event, 'target', { value: span, enumerable: true })

      const result = getHighlightFromEvent(event)

      expect(result).toBe(mark)
      expect(result?.dataset.annotationId).toBe('nested-456')
    })

    it('returns null when target is not in highlight', () => {
      const div = document.createElement('div')
      div.textContent = 'regular text'

      const event = new MouseEvent('click', { bubbles: true })
      Object.defineProperty(event, 'target', { value: div, enumerable: true })

      const result = getHighlightFromEvent(event)

      expect(result).toBeNull()
    })
  })

  describe('updateResizeCursor', () => {
    it('sets col-resize cursor when near edge', () => {
      const element = document.createElement('mark')
      element.dataset.annotationId = 'cursor-123'

      jest.spyOn(element, 'getBoundingClientRect').mockReturnValue({
        left: 100,
        right: 200,
        top: 0,
        bottom: 20,
        width: 100,
        height: 20,
        x: 100,
        y: 0,
        toJSON: () => ({})
      })

      const mouseEvent = new MouseEvent('mousemove', {
        clientX: 102,
        clientY: 10
      })

      updateResizeCursor(mouseEvent, element)

      expect(element.style.cursor).toBe('col-resize')
    })

    it('sets pointer cursor when not near edge', () => {
      const element = document.createElement('mark')
      element.dataset.annotationId = 'cursor-456'

      jest.spyOn(element, 'getBoundingClientRect').mockReturnValue({
        left: 100,
        right: 200,
        top: 0,
        bottom: 20,
        width: 100,
        height: 20,
        x: 100,
        y: 0,
        toJSON: () => ({})
      })

      const mouseEvent = new MouseEvent('mousemove', {
        clientX: 150,
        clientY: 10
      })

      updateResizeCursor(mouseEvent, element)

      expect(element.style.cursor).toBe('pointer')
    })
  })
})
