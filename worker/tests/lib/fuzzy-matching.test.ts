/**
 * Tests for fuzzy matching and batch stitching algorithms.
 */

import { describe, it, expect } from '@jest/globals'
import {
  normalizeForMatching,
  findBestOverlap,
  stitchMarkdownBatches,
  type OverlapResult
} from "../lib/fuzzy-matching.js"

describe('normalizeForMatching', () => {
  it('should remove extra whitespace', () => {
    const input = '  Hello   World  '
    const result = normalizeForMatching(input)
    expect(result).toBe('Hello World')
  })

  it('should normalize multiple newlines to double newlines', () => {
    const input = 'Para 1\n\n\n\nPara 2'
    const result = normalizeForMatching(input)
    expect(result).toBe('Para 1\n\nPara 2')
  })

  it('should normalize mixed line endings', () => {
    const input = 'Line 1\r\nLine 2\nLine 3'
    const result = normalizeForMatching(input)
    expect(result).toBe('Line 1\nLine 2\nLine 3')
  })

  it('should remove trailing whitespace from lines', () => {
    const input = 'Line 1   \nLine 2  \nLine 3'
    const result = normalizeForMatching(input)
    expect(result).toBe('Line 1\nLine 2\nLine 3')
  })

  it('should handle empty input', () => {
    expect(normalizeForMatching('')).toBe('')
  })
})

describe('findBestOverlap', () => {
  describe('exact overlap detection', () => {
    it('should find exact overlap at batch boundaries', () => {
      const batch1 = '# Chapter 1\n\nSome content here.\n\nOverlapping text that appears in both batches.'
      const batch2 = 'Overlapping text that appears in both batches.\n\n# Chapter 2\n\nMore content.'

      const overlap = findBestOverlap(batch1, batch2)

      expect(overlap.method).toBe('exact')
      expect(overlap.confidence).toBe(1.0)
      expect(overlap.overlapLength).toBeGreaterThan(40)
      expect(overlap.overlapText).toContain('Overlapping text')
    })

    it('should handle perfect overlap with whitespace variations', () => {
      const batch1 = 'Text before overlap.\n\nExact  overlap   text.'
      const batch2 = 'Exact overlap text.\n\nText after overlap.'

      const overlap = findBestOverlap(batch1, batch2)

      expect(overlap.method).toBe('exact')
      expect(overlap.confidence).toBe(1.0)
    })

    it('should find largest possible overlap', () => {
      const sharedText = 'This is a long overlapping section with multiple sentences. It spans several lines and contains detailed information.'
      const batch1 = '# Intro\n\n' + sharedText
      const batch2 = sharedText + '\n\n# Conclusion'

      const overlap = findBestOverlap(batch1, batch2)

      expect(overlap.method).toBe('exact')
      expect(overlap.overlapLength).toBe(sharedText.length)
    })
  })

  describe('fuzzy overlap detection', () => {
    it('should find fuzzy overlap with minor differences', () => {
      const batch1 = 'Before text.\n\nThis is the overlaping content with a typo.'
      const batch2 = 'This is the overlapping content with a typo.\n\nAfter text.'

      const overlap = findBestOverlap(batch1, batch2)

      // Should find fuzzy match (typo: "overlaping" vs "overlapping")
      expect(overlap.method).toBe('fuzzy')
      expect(overlap.confidence).toBeGreaterThanOrEqual(0.80)
      expect(overlap.overlapLength).toBeGreaterThan(30)
    })

    it('should handle whitespace variations in fuzzy matching', () => {
      const batch1 = 'Text before.\n\nOverlap with different  spacing.'
      const batch2 = 'Overlap   with   different spacing.\n\nText after.'

      const overlap = findBestOverlap(batch1, batch2)

      expect(overlap.confidence).toBeGreaterThanOrEqual(0.75)
      expect(overlap.overlapLength).toBeGreaterThan(0)
    })
  })

  describe('no overlap scenarios', () => {
    it('should return method="none" when no overlap found', () => {
      const batch1 = '# Chapter 1\n\nCompletely different content in batch 1.'
      const batch2 = '# Chapter 2\n\nTotally unrelated content in batch 2.'

      const overlap = findBestOverlap(batch1, batch2)

      expect(overlap.method).toBe('none')
      expect(overlap.confidence).toBe(0.0)
      expect(overlap.overlapLength).toBe(0)
    })

    it('should handle empty batches', () => {
      const overlap = findBestOverlap('', 'Some content')
      expect(overlap.method).toBe('none')
    })

    it('should handle very short batches', () => {
      const overlap = findBestOverlap('A', 'B')
      expect(overlap.method).toBe('none')
    })
  })

  describe('edge cases', () => {
    it('should handle batch1 completely contained in batch2', () => {
      const batch1 = 'Short text'
      const batch2 = 'This includes the Short text and more content after it.'

      const overlap = findBestOverlap(batch1, batch2)

      expect(overlap.method).not.toBe('none')
      expect(overlap.confidence).toBeGreaterThan(0.5)
    })

    it('should respect minimum overlap length configuration', () => {
      const batch1 = 'Before text.\n\nABC'
      const batch2 = 'ABC\n\nAfter text.'

      // Default min overlap is 50 chars, this is only 3 chars
      const overlap = findBestOverlap(batch1, batch2, { minOverlapLength: 100 })

      expect(overlap.method).toBe('none')
    })

    it('should respect maximum overlap window configuration', () => {
      const longBatch1 = 'A'.repeat(1000) + 'OVERLAP'
      const longBatch2 = 'OVERLAP' + 'B'.repeat(1000)

      // With 10% window, might not find overlap at end of 1000 chars
      const overlap = findBestOverlap(longBatch1, longBatch2, { maxOverlapPercent: 0.1 })

      // Overlap is in the window, should be found
      expect(overlap.method).not.toBe('none')
    })
  })
})

describe('stitchMarkdownBatches', () => {
  describe('successful stitching', () => {
    it('should stitch two batches with exact overlap', () => {
      const batches = [
        '# Part 1\n\nContent before overlap.\n\nShared overlapping text.',
        'Shared overlapping text.\n\n# Part 2\n\nContent after overlap.'
      ]

      const result = stitchMarkdownBatches(batches)

      // Overlap should appear only once
      const occurrences = (result.match(/Shared overlapping text/g) || []).length
      expect(occurrences).toBe(1)

      // All unique content should be present
      expect(result).toContain('Part 1')
      expect(result).toContain('Part 2')
      expect(result).toContain('Content before overlap')
      expect(result).toContain('Content after overlap')
    })

    it('should stitch multiple batches sequentially', () => {
      const batches = [
        'Batch 1 content.\n\nOverlap 1-2',
        'Overlap 1-2\n\nBatch 2 content.\n\nOverlap 2-3',
        'Overlap 2-3\n\nBatch 3 content.'
      ]

      const result = stitchMarkdownBatches(batches)

      // Each overlap should appear exactly once
      expect((result.match(/Overlap 1-2/g) || []).length).toBe(1)
      expect((result.match(/Overlap 2-3/g) || []).length).toBe(1)

      // All content should be present
      expect(result).toContain('Batch 1 content')
      expect(result).toContain('Batch 2 content')
      expect(result).toContain('Batch 3 content')
    })

    it('should preserve content order', () => {
      const batches = [
        'First section.\n\nMiddle overlap',
        'Middle overlap\n\nLast section'
      ]

      const result = stitchMarkdownBatches(batches)

      const firstIndex = result.indexOf('First section')
      const middleIndex = result.indexOf('Middle overlap')
      const lastIndex = result.indexOf('Last section')

      expect(firstIndex).toBeLessThan(middleIndex)
      expect(middleIndex).toBeLessThan(lastIndex)
    })

    it('should handle large batches efficiently', () => {
      const largeBatch1 = 'Content 1.\n\n' + 'A'.repeat(10000) + '\n\nOverlap text'
      const largeBatch2 = 'Overlap text\n\n' + 'B'.repeat(10000) + '\n\nContent 2'

      const result = stitchMarkdownBatches([largeBatch1, largeBatch2])

      // Should complete without timeout
      expect(result).toContain('Content 1')
      expect(result).toContain('Content 2')
      expect((result.match(/Overlap text/g) || []).length).toBe(1)
    })
  })

  describe('fuzzy overlap stitching', () => {
    it('should stitch batches with fuzzy overlap', () => {
      const batches = [
        'Content before.\n\nFuzzy overlaping text',
        'Fuzzy overlapping text\n\nContent after'
      ]

      const result = stitchMarkdownBatches(batches)

      // Should find and handle fuzzy match
      expect(result).toContain('Content before')
      expect(result).toContain('Content after')
      // One or both variants should be present
      expect(result.includes('overlaping') || result.includes('overlapping')).toBe(true)
    })

    it('should handle whitespace normalization in fuzzy matching', () => {
      const batches = [
        'Text 1.\n\nOverlap  with   extra   spaces',
        'Overlap with extra spaces\n\nText 2'
      ]

      const result = stitchMarkdownBatches(batches)

      expect(result).toContain('Text 1')
      expect(result).toContain('Text 2')
    })
  })

  describe('no overlap handling', () => {
    it('should use separator when no overlap found', () => {
      const batches = [
        'Completely separate batch 1.',
        'Totally different batch 2.'
      ]

      const result = stitchMarkdownBatches(batches)

      // Default separator is '\n\n---\n\n'
      expect(result).toContain('---')
      expect(result).toContain('batch 1')
      expect(result).toContain('batch 2')
    })

    it('should use custom separator when configured', () => {
      const batches = [
        'Batch 1 content',
        'Batch 2 content'
      ]

      const result = stitchMarkdownBatches(batches, {
        noOverlapSeparator: '\n\n*** SEPARATOR ***\n\n'
      })

      expect(result).toContain('*** SEPARATOR ***')
    })
  })

  describe('edge cases', () => {
    it('should handle empty array', () => {
      const result = stitchMarkdownBatches([])
      expect(result).toBe('')
    })

    it('should handle single batch', () => {
      const batches = ['Single batch content']
      const result = stitchMarkdownBatches(batches)
      expect(result).toBe('Single batch content')
    })

    it('should handle empty batches in array', () => {
      const batches = ['Content 1', '', 'Content 2']
      const result = stitchMarkdownBatches(batches)

      // Should still process non-empty batches
      expect(result).toContain('Content 1')
      expect(result).toContain('Content 2')
    })

    it('should preserve markdown formatting', () => {
      const batches = [
        '# Heading 1\n\n**Bold text**\n\nOverlap',
        'Overlap\n\n## Heading 2\n\n- List item'
      ]

      const result = stitchMarkdownBatches(batches)

      expect(result).toContain('# Heading 1')
      expect(result).toContain('**Bold text**')
      expect(result).toContain('## Heading 2')
      expect(result).toContain('- List item')
    })

    it('should handle batches with only overlap content', () => {
      const batches = [
        'Overlap text only',
        'Overlap text only'
      ]

      const result = stitchMarkdownBatches(batches)

      // Should recognize complete overlap and not duplicate
      expect(result).toBe('Overlap text only')
    })
  })

  describe('real-world PDF scenarios', () => {
    it('should handle typical 10-page overlap from PDF batching', () => {
      // Simulate page content with overlap
      const batch1 =
        '# Chapter 1\n\n' +
        'Page 1 content.\n\nPage 2 content.\n\n...\n\n' +
        'Page 90 content.\n\n' +
        '## Overlap Section\n\nPage 91 overlapping content.'

      const batch2 =
        '## Overlap Section\n\nPage 91 overlapping content.\n\n' +
        'Page 92 content.\n\n...\n\n' +
        '# Chapter 2'

      const result = stitchMarkdownBatches([batch1, batch2])

      // Overlap section should appear once
      expect((result.match(/Overlap Section/g) || []).length).toBe(1)
      expect((result.match(/Page 91 overlapping content/g) || []).length).toBe(1)
    })

    it('should handle failed batch recovery scenario', () => {
      // When a batch fails, we skip it and stitch remaining batches
      const batches = [
        'Batch 1 success\n\nOverlap A',
        // Batch 2 failed (not in array)
        'Batch 3 success\n\nDifferent content' // No overlap with batch 1
      ]

      const result = stitchMarkdownBatches(batches)

      // Should use separator for missing overlap
      expect(result).toContain('---')
      expect(result).toContain('Batch 1 success')
      expect(result).toContain('Batch 3 success')
    })

    it('should handle code blocks in overlap regions', () => {
      const batches = [
        'Text before.\n\n```python\ndef example():\n    return 42\n```',
        '```python\ndef example():\n    return 42\n```\n\nText after.'
      ]

      const result = stitchMarkdownBatches(batches)

      // Code block should appear once
      const codeBlockCount = (result.match(/def example/g) || []).length
      expect(codeBlockCount).toBe(1)
    })

    it('should handle tables in overlap regions', () => {
      const table = '| Col1 | Col2 |\n|------|------|\n| A    | B    |'
      const batches = [
        'Before table.\n\n' + table,
        table + '\n\nAfter table.'
      ]

      const result = stitchMarkdownBatches(batches)

      // Table should appear once
      expect((result.match(/\| Col1 \| Col2 \|/g) || []).length).toBe(1)
    })
  })

  describe('performance and validation', () => {
    it('should complete stitching within reasonable time', () => {
      const batches = Array.from({ length: 6 }, (_, i) =>
        `Batch ${i} content.\n\n` + 'X'.repeat(5000) + `\n\nOverlap ${i}`
      )

      const start = Date.now()
      const result = stitchMarkdownBatches(batches)
      const duration = Date.now() - start

      // Should complete in under 5 seconds for 6 batches
      expect(duration).toBeLessThan(5000)
      expect(result.length).toBeGreaterThan(0)
    })

    it('should not lose content during stitching', () => {
      const batch1 = 'A'.repeat(1000) + 'OVERLAP' + 'B'.repeat(500)
      const batch2 = 'OVERLAP' + 'C'.repeat(1000)

      const result = stitchMarkdownBatches([batch1, batch2])

      // Result should be approximately the sum minus one overlap
      const expectedMinLength = 1000 + 7 + 500 + 1000 - 7 // -7 for removed duplicate
      expect(result.length).toBeGreaterThanOrEqual(expectedMinLength - 50) // Allow some normalization
    })

    it('should normalize consistently across batches', () => {
      const batches = [
        'Text   with    spaces\n\n\n\nAnd newlines',
        'More  text   with    spaces'
      ]

      const result = stitchMarkdownBatches(batches)

      // Should have consistent single spaces and double newlines
      expect(result).not.toMatch(/   /) // No triple spaces
      expect(result).not.toMatch(/\n{3,}/) // No triple+ newlines
    })
  })
})
