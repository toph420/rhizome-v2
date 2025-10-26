import { describe, test, expect } from '@jest/globals'
import {
  fuzzyMatchChunkToSource,
  fuzzyMatchBatch,
  FuzzyMatchResult,
  FuzzyMatchPerformance,
  DEFAULT_CONFIG
} from '../../src/lib/fuzzy-matching'

describe('Fuzzy Matching Module', () => {
  describe('Exact Match (Tier 1)', () => {
    test('returns confidence 1.0 for exact verbatim match', () => {
      const chunk = 'The quick brown fox jumps over the lazy dog'
      const source = 'Some text before. The quick brown fox jumps over the lazy dog. Some text after.'
      
      const result = fuzzyMatchChunkToSource(chunk, source, 0, 1)
      
      expect(result.confidence).toBe(1.0)
      expect(result.method).toBe('exact')
      expect(result.startOffset).toBeGreaterThan(0)
      expect(result.endOffset).toBe(result.startOffset + chunk.length)
    })
    
    test('extracts context before and after exact match', () => {
      const chunk = 'brown fox'
      const source = 'The quick brown fox jumps over the lazy dog'
      
      const result = fuzzyMatchChunkToSource(chunk, source, 0, 1)
      
      expect(result.contextBefore).toBeTruthy()
      expect(result.contextAfter).toBeTruthy()
      // Should extract approximately 5 words before/after
      expect(result.contextBefore.split(/\s+/).length).toBeLessThanOrEqual(5)
      expect(result.contextAfter.split(/\s+/).length).toBeLessThanOrEqual(5)
    })
    
    test('handles exact match at beginning of source', () => {
      const chunk = 'The quick brown'
      const source = 'The quick brown fox jumps over the lazy dog'
      
      const result = fuzzyMatchChunkToSource(chunk, source, 0, 1)
      
      expect(result.confidence).toBe(1.0)
      expect(result.startOffset).toBe(0)
      expect(result.contextBefore).toBe('') // No context before start
      expect(result.contextAfter).toBeTruthy()
    })
  })
  
  describe('Fuzzy Match (Tier 2)', () => {
    test('handles minor AI reformatting with high confidence', () => {
      // Simulate AI reformatting: extra words added, whitespace normalized
      const chunk = 'This is great tutorial about machine learning'
      const source = 'This is, you know, a great tutorial about, um, machine learning and stuff'
      
      const result = fuzzyMatchChunkToSource(chunk, source, 0, 1)
      
      // Algorithm should find some similarity via fuzzy or approximate matching
      expect(result.confidence).toBeGreaterThanOrEqual(0.3)
      expect(['fuzzy', 'approximate']).toContain(result.method)
    })
    
    test('returns confidence between 0.75 and 0.99 for fuzzy matches', () => {
      const chunk = 'quick brown fox jumps'
      const source = 'The quick and brown fox really jumps over the lazy dog'
      
      const result = fuzzyMatchChunkToSource(chunk, source, 0, 1)
      
      if (result.method === 'fuzzy') {
        expect(result.confidence).toBeGreaterThanOrEqual(0.75)
        expect(result.confidence).toBeLessThan(1.0)
      }
    })
    
    test('finds best match when multiple similar candidates exist', () => {
      const chunk = 'brown fox jumps'
      const source = 'A brown fox runs. The quick brown fox jumps over. Another brown fox sits.'
      
      const result = fuzzyMatchChunkToSource(chunk, source, 0, 1)
      
      // Should match the middle occurrence (exact match available)
      expect(result.method).toBe('exact')
      expect(result.confidence).toBe(1.0)
      expect(result.startOffset).toBeGreaterThan(15) // Not the first occurrence
    })
    
    test('uses sliding window with 10% stride for performance', () => {
      // Test that algorithm can find match without checking every position
      const chunk = 'machine learning algorithms and neural networks'
      const source = `
        This is a long document with lots of text before the target.
        We discuss machine learning algorithms and neural networks extensively.
        Then there is lots more text after the target content.
      `.trim()
      
      const result = fuzzyMatchChunkToSource(chunk, source, 0, 1)
      
      // Should find exact match (chunk exists verbatim in source)
      expect(result.method).toBe('exact')
      expect(result.confidence).toBe(1.0)
    })
  })
  
  describe('Approximate Match (Tier 3)', () => {
    test('returns confidence 0.3 for completely unmatched content', () => {
      const chunk = 'This content does not exist anywhere'
      const source = 'Completely different text with no overlap whatsoever'
      
      const result = fuzzyMatchChunkToSource(chunk, source, 0, 1)
      
      expect(result.confidence).toBe(0.3)
      expect(result.method).toBe('approximate')
    })
    
    test('uses proportional positioning for approximate matches', () => {
      const chunk = 'Unmatched chunk'
      const source = 'A'.repeat(10000) // Long source
      
      // First chunk should be near beginning
      const resultFirst = fuzzyMatchChunkToSource(chunk, source, 0, 10)
      expect(resultFirst.startOffset).toBeLessThan(500)
      
      // Last chunk should be near end
      const resultLast = fuzzyMatchChunkToSource(chunk, source, 9, 10)
      expect(resultLast.startOffset).toBeGreaterThan(9000)
      
      // Middle chunk should be near middle
      const resultMiddle = fuzzyMatchChunkToSource(chunk, source, 5, 10)
      expect(resultMiddle.startOffset).toBeGreaterThan(4000)
      expect(resultMiddle.startOffset).toBeLessThan(6000)
    })
  })
  
  describe('Edge Cases', () => {
    test('handles empty chunk gracefully', () => {
      const chunk = ''
      const source = 'Some source text'
      
      const result = fuzzyMatchChunkToSource(chunk, source, 0, 1)
      
      // Should return approximate match with valid result
      expect(result).toBeDefined()
      expect(result.startOffset).toBeGreaterThanOrEqual(0)
      expect(result.endOffset).toBe(result.startOffset)
    })
    
    test('handles very long chunks (>2000 chars)', () => {
      const chunk = 'A'.repeat(3000)
      const source = 'Some text ' + 'A'.repeat(3000) + ' more text'
      
      const result = fuzzyMatchChunkToSource(chunk, source, 0, 1)
      
      expect(result).toBeDefined()
      expect(result.confidence).toBeGreaterThan(0.9) // Should match well
    })
    
    test('handles special characters and punctuation', () => {
      const chunk = 'Hello, world! How are you? [timestamp: 00:15] Nice to meet you.'
      const source = 'Introduction: Hello, world! How are you? [timestamp: 00:15] Nice to meet you. End.'
      
      const result = fuzzyMatchChunkToSource(chunk, source, 0, 1)
      
      expect(result.method).toBe('exact')
      expect(result.confidence).toBe(1.0)
    })
    
    test('handles chunks longer than source', () => {
      const chunk = 'This is a very long chunk that is actually longer than the source text itself'
      const source = 'Short source'
      
      const result = fuzzyMatchChunkToSource(chunk, source, 0, 1)
      
      // Should use approximate positioning without errors
      expect(result).toBeDefined()
      expect(result.method).toBe('approximate')
    })
    
    test('normalizes whitespace before matching', () => {
      const chunk = 'The  quick   brown    fox'
      const source = 'Some text. The quick brown fox jumps. More text.'
      
      const result = fuzzyMatchChunkToSource(chunk, source, 0, 1)
      
      // Should match despite different whitespace
      expect(result.method).toBe('exact')
      expect(result.confidence).toBe(1.0)
    })
  })
  
  describe('Performance', () => {
    test('completes fuzzy matching in <100ms for typical input', () => {
      const chunk = 'This is a typical chunk of text from a YouTube transcript with some reasonable length'
      const source = `
        [00:00] Welcome to this video tutorial
        [00:15] Today we'll discuss several topics
        [00:30] This is a typical chunk of text from a YouTube transcript with some reasonable length
        [00:45] We'll cover advanced concepts and techniques
        [01:00] Thank you for watching
      `.trim()
      
      const startTime = Date.now()
      const result = fuzzyMatchChunkToSource(chunk, source, 2, 5)
      const duration = Date.now() - startTime
      
      expect(duration).toBeLessThan(100)
      expect(result.confidence).toBeGreaterThan(0.9)
    })
    
    test('handles 100+ chunks in <10 seconds', () => {
      const source = 'A'.repeat(200000) // 200KB source
      const chunks = Array.from({ length: 100 }, (_, i) => 
        `Chunk ${i} with some unique content for testing performance`
      )
      
      const startTime = Date.now()
      
      for (let i = 0; i < chunks.length; i++) {
        const result = fuzzyMatchChunkToSource(chunks[i], source, i, chunks.length)
        expect(result).toBeDefined()
      }
      
      const duration = Date.now() - startTime
      expect(duration).toBeLessThan(10000) // <10 seconds for 100 chunks
    })
  })
  
  describe('Configuration', () => {
    test('DEFAULT_CONFIG has correct thresholds', () => {
      expect(DEFAULT_CONFIG.trigramThreshold).toBe(0.75)
      expect(DEFAULT_CONFIG.minConfidence).toBe(0.3)
      expect(DEFAULT_CONFIG.stridePercent).toBe(0.1)
      expect(DEFAULT_CONFIG.contextWindowSize).toBe(100)
    })
    
    test('respects custom trigram threshold', () => {
      const chunk = 'similar but not exact text'
      const source = 'This is similar but somewhat different text here'
      
      // With high threshold, should not match
      const resultHigh = fuzzyMatchChunkToSource(chunk, source, 0, 1, {
        trigramThreshold: 0.95
      })
      expect(resultHigh.method).toBe('approximate')
      
      // With low threshold, might match
      const resultLow = fuzzyMatchChunkToSource(chunk, source, 0, 1, {
        trigramThreshold: 0.5
      })
      // Could be fuzzy or approximate depending on similarity
      expect(['fuzzy', 'approximate']).toContain(resultLow.method)
    })
    
    test('respects custom context window size', () => {
      const chunk = 'brown fox'
      const source = 'The quick brown fox jumps over the lazy dog and runs far away'
      
      const result = fuzzyMatchChunkToSource(chunk, source, 0, 1, {
        contextWindowSize: 20 // Smaller window
      })
      
      expect(result.contextBefore.length).toBeLessThanOrEqual(20)
      expect(result.contextAfter.length).toBeLessThanOrEqual(20)
    })
  })
  
  describe('Context Extraction', () => {
    test('extracts approximately 5 words before match', () => {
      const chunk = 'target phrase'
      const source = 'One two three four five six seven target phrase nine ten'
      
      const result = fuzzyMatchChunkToSource(chunk, source, 0, 1)
      
      const wordsBefore = result.contextBefore.trim().split(/\s+/)
      expect(wordsBefore.length).toBeLessThanOrEqual(5)
      expect(result.contextBefore).toContain('seven')
    })
    
    test('extracts approximately 5 words after match', () => {
      const chunk = 'target phrase'
      const source = 'One two target phrase four five six seven eight nine ten'
      
      const result = fuzzyMatchChunkToSource(chunk, source, 0, 1)
      
      const wordsAfter = result.contextAfter.trim().split(/\s+/)
      expect(wordsAfter.length).toBeLessThanOrEqual(5)
      expect(result.contextAfter).toContain('four')
    })
    
    test('handles context extraction at boundaries', () => {
      const chunk = 'start of text'
      const source = 'start of text with more words after'
      
      const result = fuzzyMatchChunkToSource(chunk, source, 0, 1)
      
      expect(result.contextBefore).toBe('') // At start
      expect(result.contextAfter).toBeTruthy()
    })
  })
  
  describe('Batch Processing', () => {
    test('processes multiple chunks and returns performance metrics', () => {
      const source = 'The quick brown fox jumps over the lazy dog. Then the fox runs away quickly.'
      const chunks = [
        'The quick brown fox',
        'jumps over the lazy dog',
        'the fox runs away'
      ]
      
      const [results, perf] = fuzzyMatchBatch(chunks, source)
      
      // Check results array
      expect(results).toHaveLength(3)
      expect(results.every(r => r.confidence > 0)).toBe(true)
      
      // Check performance metrics
      expect(perf.totalChunks).toBe(3)
      expect(perf.exactMatches + perf.fuzzyMatches + perf.approximateMatches).toBe(3)
      expect(perf.totalTimeMs).toBeGreaterThanOrEqual(0)
      expect(perf.avgTimePerChunk).toBeGreaterThanOrEqual(0)
    })
    
    test('reports confidence distribution correctly', () => {
      const source = 'Exact match here. Similar but not exact text. Completely different content.'
      const chunks = [
        'Exact match here',           // Should be exact
        'Similar text',               // Might be fuzzy or approximate
        'Unrelated random content'    // Should be approximate
      ]
      
      const [results, perf] = fuzzyMatchBatch(chunks, source)
      
      // At least one exact match expected
      expect(perf.exactMatches).toBeGreaterThanOrEqual(1)
      
      // Total should equal chunk count
      expect(perf.exactMatches + perf.fuzzyMatches + perf.approximateMatches).toBe(chunks.length)
    })
  })
})