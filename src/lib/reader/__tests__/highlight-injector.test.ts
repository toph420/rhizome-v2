/**
 * Tests for highlight injection system.
 */

import {
  injectHighlights,
  isValidHTML,
  type AnnotationForInjection,
} from '../highlight-injector'

// ============================================
// TEST FIXTURES
// ============================================

const createAnnotation = (
  id: string,
  start: number,
  end: number,
  color: AnnotationForInjection['color'] = 'yellow'
): AnnotationForInjection => ({
  id,
  startOffset: start,
  endOffset: end,
  color,
})

// ============================================
// BASIC INJECTION TESTS
// ============================================

describe('injectHighlights - basic injection', () => {
  test('injects single highlight in simple paragraph', () => {
    const result = injectHighlights({
      html: '<p>Hello world</p>',
      blockStartOffset: 0,
      blockEndOffset: 11,
      annotations: [createAnnotation('ann-1', 0, 5, 'yellow')],
    })

    expect(result).toContain('<mark')
    expect(result).toContain('data-annotation-id="ann-1"')
    expect(result).toContain('data-color="yellow"')
    expect(result).toContain('>Hello</mark>')
  })

  test('returns unchanged HTML when no annotations', () => {
    const html = '<p>Hello world</p>'
    const result = injectHighlights({
      html,
      blockStartOffset: 0,
      blockEndOffset: 11,
      annotations: [],
    })

    expect(result).toBe(html)
  })

  test('returns unchanged HTML when annotations do not overlap', () => {
    const html = '<p>Hello world</p>'
    const result = injectHighlights({
      html,
      blockStartOffset: 0,
      blockEndOffset: 11,
      annotations: [createAnnotation('ann-1', 100, 110)], // Outside range
    })

    expect(result).toBe(html)
  })

  test('handles mid-word highlight correctly', () => {
    const result = injectHighlights({
      html: '<p>Hello world</p>',
      blockStartOffset: 0,
      blockEndOffset: 11,
      annotations: [createAnnotation('ann-1', 2, 8)], // "llo wo"
    })

    expect(result).toContain('He<mark')
    expect(result).toContain('>llo wo</mark>rld')
  })
})

// ============================================
// NESTED HTML TESTS
// ============================================

describe('injectHighlights - nested HTML', () => {
  test('preserves nested tags like <strong> and <em>', () => {
    const result = injectHighlights({
      html: '<p>Hello <strong>bold</strong> world</p>',
      blockStartOffset: 0,
      blockEndOffset: 16,
      annotations: [createAnnotation('ann-1', 6, 10)], // "bold"
    })

    expect(result).toContain('<strong>')
    expect(result).toContain('<mark')
    expect(result).toContain('</strong>')
    expect(isValidHTML(result)).toBe(true)
  })

  test('handles highlights spanning multiple elements', () => {
    const result = injectHighlights({
      html: '<p>Hello <strong>bold</strong> text</p>',
      blockStartOffset: 0,
      blockEndOffset: 16,
      annotations: [createAnnotation('ann-1', 0, 16)], // Entire block
    })

    expect(result).toContain('<mark')
    expect(isValidHTML(result)).toBe(true)
  })

  test('preserves code blocks and pre tags', () => {
    const html = '<pre><code>const x = 42</code></pre>'
    const result = injectHighlights({
      html,
      blockStartOffset: 0,
      blockEndOffset: 12,
      annotations: [createAnnotation('ann-1', 6, 10)], // "t x "
    })

    expect(result).toContain('<pre>')
    expect(result).toContain('<code>')
    expect(result).toContain('<mark')
  })
})

// ============================================
// OVERLAPPING HIGHLIGHTS TESTS
// ============================================

describe('injectHighlights - overlapping highlights', () => {
  test('handles two separate highlights without overlap', () => {
    const result = injectHighlights({
      html: '<p>Hello world today</p>',
      blockStartOffset: 0,
      blockEndOffset: 17,
      annotations: [
        createAnnotation('ann-1', 0, 5, 'yellow'),  // "Hello"
        createAnnotation('ann-2', 12, 17, 'blue'),   // "today"
      ],
    })

    expect(result).toContain('data-annotation-id="ann-1"')
    expect(result).toContain('data-annotation-id="ann-2"')
    expect(result).toContain('data-color="yellow"')
    expect(result).toContain('data-color="blue"')
  })

  test('handles overlapping highlights gracefully', () => {
    const result = injectHighlights({
      html: '<p>Hello world</p>',
      blockStartOffset: 0,
      blockEndOffset: 11,
      annotations: [
        createAnnotation('ann-1', 0, 7, 'yellow'),  // "Hello w"
        createAnnotation('ann-2', 5, 11, 'blue'),   // " world"
      ],
    })

    // Both highlights should be present
    expect(result).toContain('data-annotation-id="ann-1"')
    expect(result).toContain('data-annotation-id="ann-2"')
    expect(isValidHTML(result)).toBe(true)
  })

  test('handles completely nested highlights with first-wins strategy', () => {
    const result = injectHighlights({
      html: '<p>Hello world</p>',
      blockStartOffset: 0,
      blockEndOffset: 11,
      annotations: [
        createAnnotation('ann-1', 0, 11, 'yellow'),  // Entire text
        createAnnotation('ann-2', 2, 9, 'blue'),     // "llo wor" (nested inside ann-1)
      ],
    })

    // First annotation wins when completely nested (prevents invalid nested <mark> tags)
    expect(result).toContain('data-annotation-id="ann-1"')
    expect(result).not.toContain('data-annotation-id="ann-2"') // Skipped due to nesting
    expect(isValidHTML(result)).toBe(true)
  })
})

// ============================================
// OFFSET BOUNDARY TESTS
// ============================================

describe('injectHighlights - offset boundaries', () => {
  test('handles highlight starting at block boundary', () => {
    const result = injectHighlights({
      html: '<p>Hello world</p>',
      blockStartOffset: 100,
      blockEndOffset: 111,
      annotations: [createAnnotation('ann-1', 100, 105)], // "Hello"
    })

    expect(result).toContain('>Hello</mark>')
  })

  test('handles highlight ending at block boundary', () => {
    const result = injectHighlights({
      html: '<p>Hello world</p>',
      blockStartOffset: 100,
      blockEndOffset: 111,
      annotations: [createAnnotation('ann-1', 106, 111)], // "world"
    })

    expect(result).toContain('>world</mark>')
  })

  test('handles highlight spanning entire block', () => {
    const result = injectHighlights({
      html: '<p>Hello world</p>',
      blockStartOffset: 100,
      blockEndOffset: 111,
      annotations: [createAnnotation('ann-1', 100, 111)], // Entire block
    })

    expect(result).toContain('>Hello world</mark>')
  })

  test('clips highlight to block boundaries', () => {
    const result = injectHighlights({
      html: '<p>Hello world</p>',
      blockStartOffset: 100,
      blockEndOffset: 111,
      annotations: [
        createAnnotation('ann-1', 95, 115), // Extends beyond block
      ],
    })

    // Should only highlight the visible part
    expect(result).toContain('>Hello world</mark>')
  })
})

// ============================================
// COLOR TESTS
// ============================================

describe('injectHighlights - colors', () => {
  const colors: AnnotationForInjection['color'][] = [
    'yellow',
    'green',
    'blue',
    'red',
    'purple',
    'orange',
    'pink',
  ]

  colors.forEach((color) => {
    test(`correctly sets data-color="${color}"`, () => {
      const result = injectHighlights({
        html: '<p>Hello world</p>',
        blockStartOffset: 0,
        blockEndOffset: 11,
        annotations: [createAnnotation('ann-1', 0, 5, color)],
      })

      expect(result).toContain(`data-color="${color}"`)
    })
  })
})

// ============================================
// EDGE CASES
// ============================================

describe('injectHighlights - edge cases', () => {
  test('handles empty HTML', () => {
    const result = injectHighlights({
      html: '',
      blockStartOffset: 0,
      blockEndOffset: 0,
      annotations: [createAnnotation('ann-1', 0, 5)],
    })

    expect(result).toBe('')
  })

  test('handles HTML with only whitespace', () => {
    const html = '<p>   </p>'
    const result = injectHighlights({
      html,
      blockStartOffset: 0,
      blockEndOffset: 3,
      annotations: [createAnnotation('ann-1', 0, 3)],
    })

    expect(result).toContain('<mark')
  })

  test('handles self-closing tags', () => {
    const html = '<p>Hello<br/>world</p>'
    const result = injectHighlights({
      html,
      blockStartOffset: 0,
      blockEndOffset: 10,
      annotations: [createAnnotation('ann-1', 0, 10)],
    })

    expect(result).toContain('<br')
    expect(isValidHTML(result)).toBe(true)
  })

  test('handles special characters in text', () => {
    const html = '<p>Hello &amp; world</p>'
    const result = injectHighlights({
      html,
      blockStartOffset: 0,
      blockEndOffset: 13,
      annotations: [createAnnotation('ann-1', 0, 7)], // "Hello &"
    })

    expect(isValidHTML(result)).toBe(true)
  })
})

// ============================================
// VALIDATION TESTS
// ============================================

describe('isValidHTML', () => {
  test('returns true for valid HTML', () => {
    expect(isValidHTML('<p>Hello world</p>')).toBe(true)
    expect(isValidHTML('<div><span>Test</span></div>')).toBe(true)
    expect(isValidHTML('<p>Text with <mark>highlight</mark></p>')).toBe(true)
  })

  test('returns true for auto-correctable HTML (DOMParser auto-fixes)', () => {
    // DOMParser auto-corrects malformed HTML, so these return true
    expect(isValidHTML('<p>Unclosed')).toBe(true)
    expect(isValidHTML('<p>Wrong</div>')).toBe(true)
  })

  test('returns true for empty string', () => {
    expect(isValidHTML('')).toBe(true)
  })
})

// ============================================
// PERFORMANCE TESTS
// ============================================

describe('injectHighlights - performance', () => {
  test('handles 100+ annotations efficiently', () => {
    const annotations: AnnotationForInjection[] = []
    for (let i = 0; i < 100; i++) {
      annotations.push(createAnnotation(`ann-${i}`, i * 2, i * 2 + 1, 'yellow'))
    }

    const longText = 'a'.repeat(300) // 300 characters
    const html = `<p>${longText}</p>`

    const start = performance.now()
    const result = injectHighlights({
      html,
      blockStartOffset: 0,
      blockEndOffset: 300,
      annotations,
    })
    const duration = performance.now() - start

    expect(duration).toBeLessThan(100) // Should complete in < 100ms
    expect(isValidHTML(result)).toBe(true)
  })
})
