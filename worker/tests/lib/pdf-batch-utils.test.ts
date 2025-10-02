/**
 * Tests for PDF batch processing utilities.
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals'
import {
  calculateBatchRanges,
  countPdfPages,
  extractBatch,
  extractLargePDF,
  DEFAULT_BATCH_CONFIG,
  type BatchConfig,
  type ExtractionBatch
} from '../../lib/pdf-batch-utils.js'
import type { GoogleGenAI } from '@google/genai'

describe('PDF Batch Utils', () => {
  describe('calculateBatchRanges', () => {
    it('should return single batch for small PDFs', () => {
      const ranges = calculateBatchRanges(50)
      expect(ranges).toEqual([[1, 50]])
    })

    it('should return single batch for exactly batch-size pages', () => {
      const ranges = calculateBatchRanges(100)
      expect(ranges).toEqual([[1, 100]])
    })

    it('should create batches with overlap for large PDFs', () => {
      const ranges = calculateBatchRanges(250, {
        pagesPerBatch: 100,
        overlapPages: 10
      })

      // Expected: [1-100], [91-190], [181-250]
      expect(ranges).toHaveLength(3)
      expect(ranges[0]).toEqual([1, 100])
      expect(ranges[1]).toEqual([91, 190])
      expect(ranges[2]).toEqual([181, 250])
    })

    it('should handle 500-page PDF correctly', () => {
      const ranges = calculateBatchRanges(500, {
        pagesPerBatch: 100,
        overlapPages: 10
      })

      expect(ranges).toHaveLength(6)
      expect(ranges[0]).toEqual([1, 100])
      expect(ranges[1]).toEqual([91, 190])
      expect(ranges[2]).toEqual([181, 280])
      expect(ranges[3]).toEqual([271, 370])
      expect(ranges[4]).toEqual([361, 460])
      expect(ranges[5]).toEqual([451, 500])
    })

    it('should handle edge case: 201 pages', () => {
      const ranges = calculateBatchRanges(201, {
        pagesPerBatch: 100,
        overlapPages: 10
      })

      expect(ranges).toHaveLength(3)
      expect(ranges[0]).toEqual([1, 100])
      expect(ranges[1]).toEqual([91, 190])
      expect(ranges[2]).toEqual([181, 201])
    })

    it('should handle edge case: 199 pages', () => {
      const ranges = calculateBatchRanges(199, {
        pagesPerBatch: 100,
        overlapPages: 10
      })

      // 199 pages with 100 per batch and 10 overlap creates 3 batches
      // [1-100], [91-190], [181-199]
      expect(ranges).toHaveLength(3)
      expect(ranges[0]).toEqual([1, 100])
      expect(ranges[1]).toEqual([91, 190])
      expect(ranges[2]).toEqual([181, 199])
    })

    it('should use default config when not provided', () => {
      const ranges = calculateBatchRanges(250)

      // Should use DEFAULT_BATCH_CONFIG (100 pages, 10 overlap)
      expect(ranges).toHaveLength(3)
      expect(ranges[0][1] - ranges[0][0] + 1).toBe(100) // First batch = 100 pages
    })

    it('should prevent infinite loop with large overlap', () => {
      // Overlap >= batch size should be automatically reduced
      const ranges = calculateBatchRanges(300, {
        pagesPerBatch: 100,
        overlapPages: 120 // Invalid: overlap > batch size
      })

      // Should still complete without infinite loop
      expect(ranges.length).toBeGreaterThan(0)
      expect(ranges[ranges.length - 1][1]).toBe(300) // Should reach end
    })
  })

  describe('countPdfPages', () => {
    it('should parse page count from AI response', async () => {
      const mockAI = {
        models: {
          generateContent: jest.fn().mockResolvedValue({
            text: '250'
          })
        }
      } as unknown as GoogleGenAI

      const pageCount = await countPdfPages(mockAI, 'files/test.pdf')

      expect(pageCount).toBe(250)
      expect(mockAI.models.generateContent).toHaveBeenCalledWith(
        expect.objectContaining({
          model: DEFAULT_BATCH_CONFIG.model,
          contents: expect.arrayContaining([
            expect.objectContaining({
              parts: expect.arrayContaining([
                expect.objectContaining({ fileData: expect.any(Object) }),
                expect.objectContaining({ text: expect.stringContaining('How many pages') })
              ])
            })
          ])
        })
      )
    })

    it('should handle page count with whitespace', async () => {
      const mockAI = {
        models: {
          generateContent: jest.fn().mockResolvedValue({
            text: '  350  \n'
          })
        }
      } as unknown as GoogleGenAI

      const pageCount = await countPdfPages(mockAI, 'files/test.pdf')
      expect(pageCount).toBe(350)
    })

    it('should throw on invalid page count response', async () => {
      const mockAI = {
        models: {
          generateContent: jest.fn().mockResolvedValue({
            text: 'many pages'
          })
        }
      } as unknown as GoogleGenAI

      await expect(countPdfPages(mockAI, 'files/test.pdf')).rejects.toThrow(
        'Invalid page count response'
      )
    })

    it('should throw on zero page count', async () => {
      const mockAI = {
        models: {
          generateContent: jest.fn().mockResolvedValue({
            text: '0'
          })
        }
      } as unknown as GoogleGenAI

      await expect(countPdfPages(mockAI, 'files/test.pdf')).rejects.toThrow(
        'Invalid page count response'
      )
    })

    it('should throw on negative page count', async () => {
      const mockAI = {
        models: {
          generateContent: jest.fn().mockResolvedValue({
            text: '-5'
          })
        }
      } as unknown as GoogleGenAI

      await expect(countPdfPages(mockAI, 'files/test.pdf')).rejects.toThrow(
        'Invalid page count response'
      )
    })
  })

  describe('extractBatch', () => {
    it('should extract batch successfully', async () => {
      const mockMarkdown = '# Chapter 5\n\nThis is content from pages 51-60.'

      const mockAI = {
        models: {
          generateContent: jest.fn().mockResolvedValue({
            text: mockMarkdown
          })
        }
      } as unknown as GoogleGenAI

      const result = await extractBatch(
        mockAI,
        'files/test.pdf',
        51,
        60,
        2
      )

      expect(result).toMatchObject({
        batchNumber: 2,
        startPage: 51,
        endPage: 60,
        markdown: mockMarkdown,
        success: true
      })
      expect(result.extractionTime).toBeGreaterThanOrEqual(0)
      expect(result.error).toBeUndefined()
    })

    it('should clean markdown code blocks', async () => {
      const mockAI = {
        models: {
          generateContent: jest.fn().mockResolvedValue({
            text: '```markdown\n# Heading\n\nContent here with more text\n```'
          })
        }
      } as unknown as GoogleGenAI

      const result = await extractBatch(mockAI, 'files/test.pdf', 1, 10, 1)

      expect(result.markdown).toBe('# Heading\n\nContent here with more text')
      expect(result.markdown).not.toContain('```')
    })

    it('should handle extraction failure', async () => {
      const mockError = new Error('API rate limit exceeded')

      const mockAI = {
        models: {
          generateContent: jest.fn().mockRejectedValue(mockError)
        }
      } as unknown as GoogleGenAI

      const result = await extractBatch(mockAI, 'files/test.pdf', 1, 10, 1)

      expect(result).toMatchObject({
        batchNumber: 1,
        startPage: 1,
        endPage: 10,
        markdown: '',
        success: false,
        error: mockError
      })
      expect(result.extractionTime).toBeGreaterThanOrEqual(0)
    })

    it('should reject insufficient content', async () => {
      const mockAI = {
        models: {
          generateContent: jest.fn().mockResolvedValue({
            text: 'short' // < 20 chars
          })
        }
      } as unknown as GoogleGenAI

      const result = await extractBatch(mockAI, 'files/test.pdf', 1, 10, 1)

      expect(result.success).toBe(false)
      expect(result.error?.message).toContain('Insufficient content')
    })

    it('should include page range in prompt', async () => {
      const mockAI = {
        models: {
          generateContent: jest.fn().mockResolvedValue({
            text: '# Content from pages 101-200'
          })
        }
      } as unknown as GoogleGenAI

      await extractBatch(mockAI, 'files/test.pdf', 101, 200, 2)

      const callArgs = (mockAI.models.generateContent as jest.Mock).mock.calls[0][0]
      const promptText = callArgs.contents[0].parts[1].text

      expect(promptText).toContain('pages 101 to 200')
      expect(promptText).toContain('ONLY pages 101-200')
    })
  })

  describe('extractLargePDF', () => {
    it('should process small PDF without batching', async () => {
      const mockMarkdown = '# Small PDF\n\nContent here.'

      const mockAI = {
        files: {
          upload: jest.fn().mockResolvedValue({ uri: 'files/small.pdf' })
        },
        models: {
          generateContent: jest.fn()
            .mockResolvedValueOnce({ text: '50' }) // Page count
            .mockResolvedValueOnce({ text: mockMarkdown }) // Extraction
        }
      } as unknown as GoogleGenAI

      const fileBuffer = new ArrayBuffer(1024)
      const progressCallback = jest.fn()

      const result = await extractLargePDF(
        mockAI,
        fileBuffer,
        progressCallback
      )

      expect(result.totalPages).toBe(50)
      expect(result.batches).toHaveLength(1)
      expect(result.successCount).toBe(1)
      expect(result.failedCount).toBe(0)
      expect(result.markdown).toBe(mockMarkdown)
      expect(progressCallback).toHaveBeenCalledWith(1, 1, mockMarkdown)
    })

    it('should process large PDF in multiple batches', async () => {
      const mockAI = {
        files: {
          upload: jest.fn().mockResolvedValue({ uri: 'files/large.pdf' })
        },
        models: {
          generateContent: jest.fn()
            .mockResolvedValueOnce({ text: '250' }) // Page count
            .mockResolvedValueOnce({ text: '# Batch 1' }) // Batch 1
            .mockResolvedValueOnce({ text: '# Batch 2' }) // Batch 2
            .mockResolvedValueOnce({ text: '# Batch 3' }) // Batch 3
        }
      } as unknown as GoogleGenAI

      const fileBuffer = new ArrayBuffer(1024 * 1024 * 15) // 15MB
      const progressCallback = jest.fn()

      const result = await extractLargePDF(
        mockAI,
        fileBuffer,
        progressCallback,
        { pagesPerBatch: 100, overlapPages: 10 }
      )

      expect(result.totalPages).toBe(250)
      expect(result.batches).toHaveLength(3)
      expect(result.successCount).toBe(3)
      expect(result.failedCount).toBe(0)
      expect(result.markdown).toContain('# Batch 1')
      expect(result.markdown).toContain('# Batch 2')
      expect(result.markdown).toContain('# Batch 3')
      expect(progressCallback).toHaveBeenCalledTimes(3)
    })

    it('should handle partial batch failures', async () => {
      const mockError = new Error('Extraction failed')

      const mockAI = {
        files: {
          upload: jest.fn().mockResolvedValue({ uri: 'files/large.pdf' })
        },
        models: {
          generateContent: jest.fn()
            .mockResolvedValueOnce({ text: '250' }) // Page count
            .mockResolvedValueOnce({ text: '# Batch 1 Success' }) // Batch 1 success
            .mockRejectedValueOnce(mockError) // Batch 2 failure
            .mockResolvedValueOnce({ text: '# Batch 3 Success' }) // Batch 3 success
        }
      } as unknown as GoogleGenAI

      const fileBuffer = new ArrayBuffer(1024)

      const result = await extractLargePDF(mockAI, fileBuffer, undefined, {
        pagesPerBatch: 100,
        overlapPages: 10
      })

      expect(result.batches).toHaveLength(3)
      expect(result.successCount).toBe(2)
      expect(result.failedCount).toBe(1)
      expect(result.markdown).toContain('# Batch 1 Success')
      expect(result.markdown).not.toContain('# Batch 2') // Failed batch excluded
      expect(result.markdown).toContain('# Batch 3 Success')
    })

    it('should report progress after each batch', async () => {
      const mockAI = {
        files: {
          upload: jest.fn().mockResolvedValue({ uri: 'files/test.pdf' })
        },
        models: {
          generateContent: jest.fn()
            .mockResolvedValueOnce({ text: '150' })
            .mockResolvedValueOnce({ text: '# B1' })
            .mockResolvedValueOnce({ text: '# B2' })
        }
      } as unknown as GoogleGenAI

      const fileBuffer = new ArrayBuffer(1024)
      const progressCallback = jest.fn()

      await extractLargePDF(mockAI, fileBuffer, progressCallback, {
        pagesPerBatch: 100,
        overlapPages: 10
      })

      expect(progressCallback).toHaveBeenCalledWith(1, 2, '# B1')
      expect(progressCallback).toHaveBeenCalledWith(2, 2, '# B2')
    })

    it('should use custom batch configuration', async () => {
      const mockAI = {
        files: {
          upload: jest.fn().mockResolvedValue({ uri: 'files/test.pdf' })
        },
        models: {
          generateContent: jest.fn()
            .mockResolvedValueOnce({ text: '300' })
            .mockResolvedValueOnce({ text: '# B1' })
            .mockResolvedValueOnce({ text: '# B2' })
            .mockResolvedValueOnce({ text: '# B3' })
        }
      } as unknown as GoogleGenAI

      const fileBuffer = new ArrayBuffer(1024)

      const result = await extractLargePDF(mockAI, fileBuffer, undefined, {
        pagesPerBatch: 150,
        overlapPages: 20,
        model: 'gemini-2.5-flash-lite',
        maxOutputTokens: 32768
      })

      expect(result.batches).toHaveLength(2) // 150 pages per batch = 2 batches for 300 pages
      expect(result.successCount).toBe(2)
    })

    it('should measure total processing time', async () => {
      const mockAI = {
        files: {
          upload: jest.fn().mockResolvedValue({ uri: 'files/test.pdf' })
        },
        models: {
          generateContent: jest.fn()
            .mockResolvedValueOnce({ text: '100' })
            .mockResolvedValueOnce({ text: '# Content' })
        }
      } as unknown as GoogleGenAI

      const fileBuffer = new ArrayBuffer(1024)

      const result = await extractLargePDF(mockAI, fileBuffer)

      expect(result.totalTime).toBeGreaterThanOrEqual(0)
      expect(typeof result.totalTime).toBe('number')
    })
  })
})
