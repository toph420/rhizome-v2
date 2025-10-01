/**
 * Integration tests for batched PDF processing with AI metadata extraction.
 * Tests Task T-008: Integrate Batched Processing with PDF Processor
 */

import { describe, test, expect, beforeEach, jest } from '@jest/globals'
import { PDFProcessor } from '../../processors/pdf-processor'
import type { BackgroundJob } from '../../processors/base'

describe('PDF Batched Processing Integration (T-008)', () => {
  let mockGeminiAI: any
  let mockSupabase: any
  let mockJob: BackgroundJob

  beforeEach(() => {
    jest.clearAllMocks()

    // Setup mock Supabase
    mockSupabase = {
      storage: {
        from: jest.fn(() => ({
          createSignedUrl: jest.fn().mockResolvedValue({
            data: { signedUrl: 'https://example.com/test.pdf' },
            error: null
          }),
          download: jest.fn().mockResolvedValue({
            data: new Blob([new ArrayBuffer(15 * 1024 * 1024)]), // 15MB PDF
            error: null
          }),
          upload: jest.fn().mockResolvedValue({
            data: { path: 'test-path' },
            error: null
          })
        }))
      },
      from: jest.fn(() => ({
        update: jest.fn().mockReturnThis(),
        eq: jest.fn().mockResolvedValue({ data: [], error: null }),
        insert: jest.fn().mockResolvedValue({ data: [], error: null })
      }))
    }

    // Setup mock Gemini AI
    mockGeminiAI = {
      files: {
        upload: jest.fn().mockResolvedValue({
          uri: 'gemini://test-file',
          name: 'test-file'
        }),
        get: jest.fn().mockResolvedValue({
          state: 'ACTIVE'
        })
      },
      models: {
        generateContent: jest.fn()
          .mockResolvedValueOnce({
            // First call: page count
            text: '100'
          })
          .mockResolvedValue({
            // Subsequent calls: content extraction
            text: '# Test Content\n\nThis is extracted markdown from PDF batch processing.'
          })
      }
    }

    // Create test job
    mockJob = {
      id: 'test-job-id',
      document_id: 'test-doc-id',
      status: 'processing',
      input_data: {
        document_id: 'test-doc-id',
        source_type: 'pdf',
        storage_path: 'test-user/test-doc-id'
      }
    }

    // Mock environment variable
    process.env.GOOGLE_AI_API_KEY = 'test-api-key'
  })

  describe('Acceptance Criteria: Automatic batch routing', () => {
    test('should use batched extraction for PDFs >10MB', async () => {
      // Create 15MB PDF buffer
      const largePdfBuffer = new ArrayBuffer(15 * 1024 * 1024)
      global.fetch = jest.fn().mockResolvedValue({
        arrayBuffer: jest.fn().mockResolvedValue(largePdfBuffer)
      }) as any

      const consoleSpy = jest.spyOn(console, 'log')
      const processor = new PDFProcessor(mockGeminiAI, mockSupabase, mockJob)

      try {
        await processor.process()
      } catch (error) {
        // Expected to fail due to incomplete mocks, but we can still verify routing logic
      }

      // Verify batched processing was selected in logs
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[PDFProcessor] Large PDF detected')
      )
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('using batched extraction')
      )

      consoleSpy.mockRestore()
    })

    test('should use standard processing for PDFs <10MB', async () => {
      // Create 5MB PDF buffer
      const smallPdfBuffer = new ArrayBuffer(5 * 1024 * 1024)
      global.fetch = jest.fn().mockResolvedValue({
        arrayBuffer: jest.fn().mockResolvedValue(smallPdfBuffer)
      }) as any

      const processor = new PDFProcessor(mockGeminiAI, mockSupabase, mockJob)

      // Mock extractContent to verify standard path
      const extractContentSpy = jest.spyOn(processor as any, 'extractContent')

      await processor.process()

      // Verify standard processing was used
      expect(extractContentSpy).toHaveBeenCalled()
    })

    test('should use AI metadata extraction for markdown >50K chars', async () => {
      // Create small PDF buffer but large markdown output
      const smallPdfBuffer = new ArrayBuffer(5 * 1024 * 1024)
      global.fetch = jest.fn().mockResolvedValue({
        arrayBuffer: jest.fn().mockResolvedValue(smallPdfBuffer)
      }) as any

      // Mock large markdown extraction (>50K chars)
      const largeMarkdown = 'a'.repeat(60000)
      mockGeminiAI.models.generateContent.mockResolvedValue({
        text: largeMarkdown
      })

      const processor = new PDFProcessor(mockGeminiAI, mockSupabase, mockJob)

      const result = await processor.process()

      // Verify AI metadata was used
      expect(result.metadata?.extra?.usedAIMetadata).toBe(true)
    })

    test('should use standard metadata extraction for markdown <50K chars', async () => {
      // Create small PDF buffer with small markdown output
      const smallPdfBuffer = new ArrayBuffer(5 * 1024 * 1024)
      global.fetch = jest.fn().mockResolvedValue({
        arrayBuffer: jest.fn().mockResolvedValue(smallPdfBuffer)
      }) as any

      // Mock small markdown extraction (<50K chars)
      const smallMarkdown = '# Test\n\nSmall content.'
      mockGeminiAI.models.generateContent.mockResolvedValue({
        text: smallMarkdown
      })

      const processor = new PDFProcessor(mockGeminiAI, mockSupabase, mockJob)

      const result = await processor.process()

      // Verify standard metadata was used
      expect(result.metadata?.extra?.usedAIMetadata).toBe(false)
      expect(result.metadata?.extra?.processingMode).toBe('standard')
    })
  })

  describe('Acceptance Criteria: Progress tracking integration', () => {
    test('should report batched processing progress', async () => {
      const largePdfBuffer = new ArrayBuffer(15 * 1024 * 1024)
      global.fetch = jest.fn().mockResolvedValue({
        arrayBuffer: jest.fn().mockResolvedValue(largePdfBuffer)
      }) as any

      const progressUpdates: Array<{ percent: number; stage: string; details?: string }> = []

      // Capture progress updates
      const updateProgressSpy = jest.spyOn(mockSupabase.from().update(), 'eq')
        .mockImplementation((id: string) => {
          const updateCall = mockSupabase.from().update.mock.calls[mockSupabase.from().update.mock.calls.length - 1]
          if (updateCall?.[0]?.progress) {
            progressUpdates.push(updateCall[0].progress)
          }
          return Promise.resolve({ data: [], error: null })
        })

      const processor = new PDFProcessor(mockGeminiAI, mockSupabase, mockJob)
      await processor.process()

      // Verify progress includes batch information
      const batchProgress = progressUpdates.find(p =>
        p.stage === 'metadata' && p.details?.includes('AI extraction')
      )
      expect(batchProgress).toBeDefined()
    })

    test('should calculate accurate overall progress during AI extraction', async () => {
      const largePdfBuffer = new ArrayBuffer(15 * 1024 * 1024)
      global.fetch = jest.fn().mockResolvedValue({
        arrayBuffer: jest.fn().mockResolvedValue(largePdfBuffer)
      }) as any

      const processor = new PDFProcessor(mockGeminiAI, mockSupabase, mockJob)

      const progressUpdates: number[] = []
      const updateProgressSpy = jest.spyOn(processor as any, 'updateProgress')
        .mockImplementation(async (percent: number) => {
          progressUpdates.push(percent)
        })

      await processor.process()

      // Verify progress is in expected range (45-85% for AI extraction)
      const metadataProgress = progressUpdates.filter(p => p >= 45 && p <= 85)
      expect(metadataProgress.length).toBeGreaterThan(0)
    })
  })

  describe('Integration: End-to-end batched processing', () => {
    test('should complete full batched processing workflow', async () => {
      const largePdfBuffer = new ArrayBuffer(15 * 1024 * 1024)
      global.fetch = jest.fn().mockResolvedValue({
        arrayBuffer: jest.fn().mockResolvedValue(largePdfBuffer)
      }) as any

      // Mock batched extraction result
      mockGeminiAI.models.generateContent.mockResolvedValue({
        text: '# Batch Content\n\nExtracted from large PDF.'
      })

      const processor = new PDFProcessor(mockGeminiAI, mockSupabase, mockJob)
      const result = await processor.process()

      // Verify complete result structure
      expect(result).toHaveProperty('markdown')
      expect(result).toHaveProperty('chunks')
      expect(result).toHaveProperty('metadata')
      expect(result).toHaveProperty('wordCount')
      expect(result).toHaveProperty('outline')

      // Verify chunks have required fields
      expect(result.chunks.length).toBeGreaterThan(0)
      expect(result.chunks[0]).toHaveProperty('content')
      expect(result.chunks[0]).toHaveProperty('chunk_index')
      expect(result.chunks[0]).toHaveProperty('themes')
      expect(result.chunks[0]).toHaveProperty('importance_score')

      // Verify metadata contains processing info
      expect(result.metadata?.extra?.processingMode).toBe('batched')
      expect(result.metadata?.extra?.usedAIMetadata).toBe(true)
    })

    test('should handle mixed processing modes correctly', async () => {
      // Test 1: Small PDF with small markdown (standard + standard metadata)
      const smallBuffer1 = new ArrayBuffer(3 * 1024 * 1024)
      global.fetch = jest.fn().mockResolvedValue({
        arrayBuffer: jest.fn().mockResolvedValue(smallBuffer1)
      }) as any

      mockGeminiAI.models.generateContent.mockResolvedValue({
        text: '# Small Content\n\nNot much here.'
      })

      const processor1 = new PDFProcessor(mockGeminiAI, mockSupabase, mockJob)
      const result1 = await processor1.process()

      expect(result1.metadata?.extra?.processingMode).toBe('standard')
      expect(result1.metadata?.extra?.usedAIMetadata).toBe(false)

      // Test 2: Small PDF with large markdown (standard + AI metadata)
      const smallBuffer2 = new ArrayBuffer(3 * 1024 * 1024)
      global.fetch = jest.fn().mockResolvedValue({
        arrayBuffer: jest.fn().mockResolvedValue(smallBuffer2)
      }) as any

      mockGeminiAI.models.generateContent.mockResolvedValue({
        text: 'a'.repeat(60000) // >50K chars
      })

      const processor2 = new PDFProcessor(mockGeminiAI, mockSupabase, mockJob)
      const result2 = await processor2.process()

      expect(result2.metadata?.extra?.processingMode).toBe('standard')
      expect(result2.metadata?.extra?.usedAIMetadata).toBe(true)

      // Test 3: Large PDF (batched + AI metadata)
      const largeBuffer = new ArrayBuffer(15 * 1024 * 1024)
      global.fetch = jest.fn().mockResolvedValue({
        arrayBuffer: jest.fn().mockResolvedValue(largeBuffer)
      }) as any

      const processor3 = new PDFProcessor(mockGeminiAI, mockSupabase, mockJob)
      const result3 = await processor3.process()

      expect(result3.metadata?.extra?.processingMode).toBe('batched')
      expect(result3.metadata?.extra?.usedAIMetadata).toBe(true)
    })
  })

  describe('Logging verification', () => {
    test('should log routing decisions', async () => {
      const consoleSpy = jest.spyOn(console, 'log')

      const largePdfBuffer = new ArrayBuffer(15 * 1024 * 1024)
      global.fetch = jest.fn().mockResolvedValue({
        arrayBuffer: jest.fn().mockResolvedValue(largePdfBuffer)
      }) as any

      const processor = new PDFProcessor(mockGeminiAI, mockSupabase, mockJob)
      await processor.process()

      // Verify routing decision was logged
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[PDFProcessor] Large PDF detected')
      )

      consoleSpy.mockRestore()
    })

    test('should log AI metadata selection', async () => {
      const consoleSpy = jest.spyOn(console, 'log')

      const smallBuffer = new ArrayBuffer(5 * 1024 * 1024)
      global.fetch = jest.fn().mockResolvedValue({
        arrayBuffer: jest.fn().mockResolvedValue(smallBuffer)
      }) as any

      mockGeminiAI.models.generateContent.mockResolvedValue({
        text: 'a'.repeat(60000) // >50K chars triggers AI metadata
      })

      const processor = new PDFProcessor(mockGeminiAI, mockSupabase, mockJob)
      await processor.process()

      // Verify AI metadata decision was logged
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[PDFProcessor] Large markdown detected')
      )
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('using AI metadata extraction')
      )

      consoleSpy.mockRestore()
    })
  })
})
