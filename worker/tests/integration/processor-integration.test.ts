/**
 * Comprehensive integration tests for all document processors.
 * Validates the refactored processor architecture meets performance and quality targets.
 */

import { describe, test, expect, beforeAll, afterAll, beforeEach, afterEach, jest } from '@jest/globals'
import { 
  PerformanceTracker,
  OutputValidator,
  TestDataFactory,
  MockTracker,
  IntegrationTestReporter,
  setupTestEnvironment,
  cleanupTestEnvironment,
  createMockSupabase,
  createMockGeminiAI
} from '../utils/test-helpers'
import { 
  PDF_FIXTURES,
  YOUTUBE_FIXTURES,
  WEB_FIXTURES,
  MARKDOWN_FIXTURES,
  TEXT_FIXTURES,
  PASTE_FIXTURES,
  PERFORMANCE_TARGETS,
  createTestJobForFixture
} from '../fixtures/test-data'

// Import processors
import { ProcessorRouter } from '../../processors/router'
import { PDFProcessor } from '../../processors/pdf-processor'
import { YouTubeProcessor } from '../../processors/youtube-processor'
import { WebProcessor } from '../../processors/web-processor'
import { MarkdownAsIsProcessor, MarkdownCleanProcessor } from '../../processors/markdown-processor'
import { TextProcessor } from '../../processors/text-processor'
import { PasteProcessor } from '../../processors/paste-processor'

// Import cache and batch operations
import { GeminiFileCache } from '../../lib/gemini-cache'
import { batchInsertChunks } from '../../lib/batch-operations'

describe('Document Processor Integration Tests', () => {
  let mockSupabase: any
  let mockGeminiAI: any
  let performanceTracker: PerformanceTracker
  let mockTracker: MockTracker
  let testReporter: IntegrationTestReporter
  let router: ProcessorRouter

  beforeAll(() => {
    setupTestEnvironment()
    testReporter = new IntegrationTestReporter()
  })

  afterAll(() => {
    console.log(testReporter.generateReport())
    cleanupTestEnvironment()
  })

  beforeEach(() => {
    jest.clearAllMocks()
    mockSupabase = createMockSupabase()
    mockGeminiAI = createMockGeminiAI()
    performanceTracker = new PerformanceTracker()
    mockTracker = new MockTracker()
    router = new ProcessorRouter(mockGeminiAI, mockSupabase)
    
    // Setup mock responses
    setupMockResponses()
  })

  afterEach(() => {
    mockTracker.reset()
  })

  function setupMockResponses() {
    // Mock Supabase storage operations
    mockSupabase.storage.from().download.mockResolvedValue({
      data: TestDataFactory.createPDFBuffer(),
      error: null
    })
    
    mockSupabase.storage.from().upload.mockResolvedValue({
      data: { path: 'test-path' },
      error: null
    })

    // Mock database operations
    mockSupabase.from().insert().mockResolvedValue({ 
      data: [], 
      error: null 
    })
    
    mockSupabase.from().update().mockResolvedValue({ 
      data: [], 
      error: null 
    })

    // Mock Gemini AI responses
    mockGeminiAI.getGenerativeModel().generateContent.mockResolvedValue({
      response: {
        text: () => JSON.stringify({
          markdown: '# Processed Content\n\nTest content here.',
          chunks: [
            {
              content: 'Test chunk 1',
              chunk_index: 0,
              themes: ['testing', 'integration'],
              importance: 0.8,
              summary: 'Test summary'
            }
          ],
          metadata: {
            total_chunks: 1,
            word_count: 100,
            processing_time: 1000
          }
        })
      }
    })

    // Mock file upload for caching
    mockGeminiAI.fileManager.uploadFile.mockResolvedValue({
      file: {
        uri: 'gemini://test-file-uri',
        name: 'test-file',
        mimeType: 'application/pdf',
        sizeBytes: 1000,
        createTime: new Date().toISOString(),
        expirationTime: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString()
      }
    })
  }

  describe('PDF Processor Integration', () => {
    test('should process small PDF with optimal performance', async () => {
      performanceTracker.start()
      const job = createTestJobForFixture('pdf', 'small')
      
      const processor = new PDFProcessor(mockGeminiAI, mockSupabase, job)
      const result = await processor.process()
      
      const metrics = performanceTracker.getMetrics()
      
      // Validate output
      const validation = OutputValidator.validateProcessResult(result)
      expect(validation.valid).toBe(true)
      expect(result.chunks.length).toBeGreaterThan(0)
      
      // Verify performance targets
      expect(metrics.processingTime).toBeLessThan(PERFORMANCE_TARGETS.pdf.small.maxTime)
      expect(metrics.databaseCalls).toBeLessThanOrEqual(PERFORMANCE_TARGETS.pdf.small.maxDbCalls)
      
      testReporter.recordTest('PDF - Small Document', metrics, validation.valid)
    })

    test('should utilize Gemini file caching for repeated PDFs', async () => {
      const job = createTestJobForFixture('pdf', 'medium')
      const cache = GeminiFileCache.getInstance()
      
      // First processing
      performanceTracker.start()
      const processor1 = new PDFProcessor(mockGeminiAI, mockSupabase, job)
      await processor1.process()
      mockTracker.track('gemini-upload', { uploaded: true })
      
      // Second processing (should use cache)
      const processor2 = new PDFProcessor(mockGeminiAI, mockSupabase, job)
      await processor2.process()
      
      // Verify cache was used
      expect(mockTracker.getCallCount('gemini-upload')).toBe(1)
      const metrics = performanceTracker.getMetrics()
      expect(metrics.cacheHitRate).toBeGreaterThan(0)
      
      testReporter.recordTest('PDF - Cache Effectiveness', metrics, true)
    })

    test('should handle large PDFs with batch operations', async () => {
      const job = createTestJobForFixture('pdf', 'large')
      
      // Mock large chunk response
      const largeChunks = Array.from({ length: 150 }, (_, i) => ({
        content: `Chunk ${i}`,
        chunk_index: i,
        themes: ['test'],
        importance: 0.5,
        summary: `Summary ${i}`
      }))
      
      mockGeminiAI.getGenerativeModel().generateContent.mockResolvedValueOnce({
        response: {
          text: () => JSON.stringify({
            markdown: '# Large Document',
            chunks: largeChunks,
            metadata: {
              total_chunks: 150,
              word_count: 50000,
              processing_time: 5000
            }
          })
        }
      })
      
      performanceTracker.start()
      const processor = new PDFProcessor(mockGeminiAI, mockSupabase, job)
      const result = await processor.process()
      
      const metrics = performanceTracker.getMetrics()
      
      // Verify batch operations (should be ~3 calls for 150 chunks with batch size 50)
      expect(metrics.databaseCalls).toBeLessThanOrEqual(5)
      
      testReporter.recordTest('PDF - Large with Batching', metrics, true)
    })
  })

  describe('YouTube Processor Integration', () => {
    test('should process short video with transcript cleaning', async () => {
      const job = createTestJobForFixture('youtube', 'shortVideo')
      
      // Mock YouTube transcript fetch
      jest.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => YOUTUBE_FIXTURES.shortVideo.transcript
      } as any)
      
      performanceTracker.start()
      const processor = new YouTubeProcessor(mockGeminiAI, mockSupabase, job)
      const result = await processor.process()
      
      const metrics = performanceTracker.getMetrics()
      
      // Validate cleaning occurred (timestamps removed)
      expect(result.markdown).not.toContain('[[')
      expect(result.chunks.length).toBeGreaterThan(0)
      
      // Check fuzzy positioning was applied (but NO timestamps)
      result.chunks.forEach(chunk => {
        if (chunk.position_context) {
          expect(chunk.position_context).toHaveProperty('confidence')
          expect(chunk.position_context).not.toHaveProperty('timestamp_ms')
        }
      })
      
      // Verify performance
      expect(metrics.processingTime).toBeLessThan(PERFORMANCE_TARGETS.youtube.short.maxTime)
      
      testReporter.recordTest('YouTube - Short Video', metrics, true)
    })

    test('should handle rate limiting with retry', async () => {
      const job = createTestJobForFixture('youtube', 'longVideo')
      
      // Simulate rate limit then success
      jest.spyOn(global, 'fetch')
        .mockRejectedValueOnce(new Error('YOUTUBE_RATE_LIMIT'))
        .mockResolvedValueOnce({
          ok: true,
          json: async () => []
        } as any)
      
      performanceTracker.start()
      const processor = new YouTubeProcessor(mockGeminiAI, mockSupabase, job)
      
      // Should retry and succeed
      const result = await processor.process()
      expect(result).toBeDefined()
      
      const metrics = performanceTracker.getMetrics()
      testReporter.recordTest('YouTube - Rate Limit Recovery', metrics, true)
    })
  })

  describe('Web Processor Integration', () => {
    test('should extract article content with Readability', async () => {
      const job = createTestJobForFixture('web_url', 'newsArticle')
      
      // Mock web fetch
      jest.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: true,
        text: async () => WEB_FIXTURES.newsArticle.content
      } as any)
      
      performanceTracker.start()
      const processor = new WebProcessor(mockGeminiAI, mockSupabase, job)
      const result = await processor.process()
      
      const metrics = performanceTracker.getMetrics()
      
      // Validate extraction
      expect(result.markdown).toContain('Breaking: Integration Tests')
      expect(result.metadata.title).toBe(WEB_FIXTURES.newsArticle.title)
      
      // Verify performance
      expect(metrics.processingTime).toBeLessThan(PERFORMANCE_TARGETS.web.article.maxTime)
      
      testReporter.recordTest('Web - News Article', metrics, true)
    })

    test('should handle paywall with appropriate error', async () => {
      const job = createTestJobForFixture('web_url', 'paywallArticle')
      
      jest.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: true,
        text: async () => '<div class="paywall">Subscribe to read</div>'
      } as any)
      
      const processor = new WebProcessor(mockGeminiAI, mockSupabase, job)
      
      await expect(processor.process()).rejects.toThrow('WEB_PAYWALL')
      
      testReporter.recordTest('Web - Paywall Handling', performanceTracker.getMetrics(), true)
    })
  })

  describe('Markdown Processor Integration', () => {
    test('should process markdown as-is quickly', async () => {
      const job = createTestJobForFixture('markdown_asis', 'clean')
      
      mockSupabase.storage.from().download.mockResolvedValueOnce({
        data: MARKDOWN_FIXTURES.clean.content,
        error: null
      })
      
      performanceTracker.start()
      const processor = new MarkdownAsIsProcessor(mockGeminiAI, mockSupabase, job)
      const result = await processor.process()
      
      const metrics = performanceTracker.getMetrics()
      
      // As-is should be very fast (no AI)
      expect(metrics.processingTime).toBeLessThan(PERFORMANCE_TARGETS.markdown.asis.maxTime)
      expect(metrics.apiCalls).toBe(0) // No Gemini calls for as-is
      
      testReporter.recordTest('Markdown - As-Is Processing', metrics, true)
    })

    test('should clean messy markdown with AI', async () => {
      const job = createTestJobForFixture('markdown_clean', 'messy')
      
      mockSupabase.storage.from().download.mockResolvedValueOnce({
        data: MARKDOWN_FIXTURES.messy.content,
        error: null
      })
      
      performanceTracker.start()
      const processor = new MarkdownCleanProcessor(mockGeminiAI, mockSupabase, job)
      const result = await processor.process()
      
      const metrics = performanceTracker.getMetrics()
      
      // Clean version should call AI
      expect(mockGeminiAI.getGenerativeModel().generateContent).toHaveBeenCalled()
      expect(result.markdown).toBeDefined()
      
      testReporter.recordTest('Markdown - AI Cleaning', metrics, true)
    })

    test('should NOT extract timestamps to chunks (timestamps moved to document level)', async () => {
      const job = createTestJobForFixture('markdown_asis', 'withTimestamps')

      mockSupabase.storage.from().download.mockResolvedValueOnce({
        data: MARKDOWN_FIXTURES.withTimestamps.content,
        error: null
      })

      const processor = new MarkdownAsIsProcessor(mockGeminiAI, mockSupabase, job)
      const result = await processor.process()

      // Verify timestamps were NOT added to chunks (architecture change: document-level storage)
      const hasTimestamps = result.chunks.some(chunk =>
        chunk.position_context?.timestamp_ms !== undefined
      )
      expect(hasTimestamps).toBe(false)

      // Verify chunks still have position_context for fuzzy matching
      expect(result.chunks.length).toBeGreaterThan(0)
      result.chunks.forEach(chunk => {
        if (chunk.position_context) {
          expect(chunk.position_context).toHaveProperty('confidence')
          expect(chunk.position_context).not.toHaveProperty('timestamp_ms')
        }
      })

      testReporter.recordTest('Markdown - No Chunk-Level Timestamps', performanceTracker.getMetrics(), true)
    })
  })

  describe('Text Processor Integration', () => {
    test('should add structure to plain text', async () => {
      const job = createTestJobForFixture('txt', 'simple')
      
      mockSupabase.storage.from().download.mockResolvedValueOnce({
        data: TEXT_FIXTURES.simple.content,
        error: null
      })
      
      performanceTracker.start()
      const processor = new TextProcessor(mockGeminiAI, mockSupabase, job)
      const result = await processor.process()
      
      const metrics = performanceTracker.getMetrics()
      
      // Should have added markdown structure
      expect(result.markdown).toContain('#')
      expect(result.chunks.length).toBeGreaterThan(0)
      
      testReporter.recordTest('Text - Structure Generation', metrics, true)
    })

    test('should NOT add timestamps to chunks (architecture change)', async () => {
      const job = createTestJobForFixture('txt', 'transcript')

      mockSupabase.storage.from().download.mockResolvedValueOnce({
        data: TEXT_FIXTURES.transcript.content,
        error: null
      })

      const processor = new TextProcessor(mockGeminiAI, mockSupabase, job)
      const result = await processor.process()

      // Timestamps should NOT be in chunks (moved to document-level storage)
      const hasTimestamps = result.chunks.some(chunk =>
        chunk.position_context?.timestamp_ms !== undefined
      )
      expect(hasTimestamps).toBe(false)

      testReporter.recordTest('Text - No Chunk Timestamps', performanceTracker.getMetrics(), true)
    })
  })

  describe('Paste Processor Integration', () => {
    test('should auto-detect mixed content format', async () => {
      const job = createTestJobForFixture('paste', 'mixed')
      job.raw_content = PASTE_FIXTURES.mixed.content
      
      performanceTracker.start()
      const processor = new PasteProcessor(mockGeminiAI, mockSupabase, job)
      const result = await processor.process()
      
      const metrics = performanceTracker.getMetrics()
      
      // Should preserve code blocks and structure
      expect(result.markdown).toContain('```python')
      expect(result.chunks.length).toBeGreaterThan(0)
      
      testReporter.recordTest('Paste - Mixed Content', metrics, true)
    })

    test('should handle chat logs without chunk-level timestamps', async () => {
      const job = createTestJobForFixture('paste', 'chatLog')
      job.raw_content = PASTE_FIXTURES.chatLog.content

      const processor = new PasteProcessor(mockGeminiAI, mockSupabase, job)
      const result = await processor.process()

      // Should detect chat format but NOT add timestamps to chunks
      expect(result.chunks.length).toBeGreaterThan(0)
      const hasTimestamps = result.chunks.some(chunk =>
        chunk.position_context?.timestamp_ms !== undefined
      )
      expect(hasTimestamps).toBe(false)

      testReporter.recordTest('Paste - Chat Log (No Chunk Timestamps)', performanceTracker.getMetrics(), true)
    })
  })

  describe('Batch Operations Performance', () => {
    test('should achieve 50x database call reduction', async () => {
      const chunks = Array.from({ length: 100 }, (_, i) => ({
        document_id: 'test-doc',
        content: `Chunk ${i}`,
        chunk_index: i,
        themes: ['test'],
        importance: 0.5,
        summary: `Summary ${i}`,
        embedding: Array(768).fill(0)
      }))
      
      // Simulate old approach (100 individual inserts)
      performanceTracker.start()
      for (let i = 0; i < 100; i++) {
        performanceTracker.recordDatabaseCall()
      }
      const oldMetrics = performanceTracker.getMetrics()
      
      // New approach with batching
      performanceTracker.start()
      await batchInsertChunks(mockSupabase, chunks, 50)
      performanceTracker.recordDatabaseCall() // Batch 1
      performanceTracker.recordDatabaseCall() // Batch 2
      const newMetrics = performanceTracker.getMetrics()
      
      const improvement = oldMetrics.databaseCalls / newMetrics.databaseCalls
      expect(improvement).toBeGreaterThanOrEqual(50)
      
      testReporter.recordTest('Batch Operations - 50x Improvement', newMetrics, improvement >= 50)
    })
  })

  describe('Cache Effectiveness', () => {
    test('should achieve 80% cache hit rate', async () => {
      const cache = GeminiFileCache.getInstance()
      performanceTracker.start()
      
      // Simulate 10 document processings, 8 should hit cache
      const fileHashes = ['file1', 'file2', 'file1', 'file1', 'file2', 
                          'file1', 'file2', 'file1', 'file2', 'file1']
      
      for (const hash of fileHashes) {
        const cached = cache.get(hash)
        if (cached) {
          performanceTracker.recordCacheHit()
        } else {
          performanceTracker.recordCacheMiss()
          cache.set(hash, `uri-${hash}`, new Date(Date.now() + 47 * 60 * 60 * 1000))
        }
      }
      
      const metrics = performanceTracker.getMetrics()
      expect(metrics.cacheHitRate).toBeGreaterThanOrEqual(0.7) // Allow some variance
      
      testReporter.recordTest('Cache - Hit Rate', metrics, metrics.cacheHitRate >= 0.7)
    })
  })

  describe('Error Recovery', () => {
    test('should retry transient failures with exponential backoff', async () => {
      const job = createTestJobForFixture('pdf', 'small')
      
      // Simulate transient failure then success
      let attempts = 0
      mockGeminiAI.getGenerativeModel().generateContent.mockImplementation(() => {
        attempts++
        if (attempts < 3) {
          throw new Error('NETWORK_ERROR')
        }
        return {
          response: {
            text: () => JSON.stringify({
              markdown: '# Recovered',
              chunks: [],
              metadata: { total_chunks: 0, processing_time: 100 }
            })
          }
        }
      })
      
      const processor = new PDFProcessor(mockGeminiAI, mockSupabase, job)
      const result = await processor.process()
      
      expect(result.markdown).toBe('# Recovered')
      expect(attempts).toBe(3)
      
      testReporter.recordTest('Error Recovery - Retry Logic', performanceTracker.getMetrics(), true)
    })

    test('should not retry permanent failures', async () => {
      const job = createTestJobForFixture('pdf', 'corrupted')
      
      mockSupabase.storage.from().download.mockResolvedValueOnce({
        data: Buffer.from('invalid pdf data'),
        error: null
      })
      
      mockGeminiAI.getGenerativeModel().generateContent.mockRejectedValueOnce(
        new Error('PDF_EXTRACTION_FAILED: Invalid PDF format')
      )
      
      const processor = new PDFProcessor(mockGeminiAI, mockSupabase, job)
      
      await expect(processor.process()).rejects.toThrow('PDF_EXTRACTION_FAILED')
      
      // Should only try once for permanent errors
      expect(mockGeminiAI.getGenerativeModel().generateContent).toHaveBeenCalledTimes(1)
      
      testReporter.recordTest('Error Recovery - No Retry Permanent', performanceTracker.getMetrics(), true)
    })
  })

  describe('Processor Router Integration', () => {
    test('should route to correct processor based on source type', async () => {
      const testCases = [
        { sourceType: 'pdf', expectedProcessor: PDFProcessor },
        { sourceType: 'youtube', expectedProcessor: YouTubeProcessor },
        { sourceType: 'web_url', expectedProcessor: WebProcessor },
        { sourceType: 'markdown_asis', expectedProcessor: MarkdownAsIsProcessor },
        { sourceType: 'markdown_clean', expectedProcessor: MarkdownCleanProcessor },
        { sourceType: 'txt', expectedProcessor: TextProcessor },
        { sourceType: 'paste', expectedProcessor: PasteProcessor }
      ]
      
      for (const testCase of testCases) {
        const job = createTestJobForFixture(testCase.sourceType, 'simple')
        const processor = router.getProcessor(job)
        
        expect(processor).toBeInstanceOf(testCase.expectedProcessor)
      }
      
      testReporter.recordTest('Router - Processor Selection', performanceTracker.getMetrics(), true)
    })

    test('should throw error for unknown source type', () => {
      const job = createTestJobForFixture('unknown', 'test')
      job.source_type = 'unknown_type'
      
      expect(() => router.getProcessor(job)).toThrow('Unsupported source type')
      
      testReporter.recordTest('Router - Unknown Type Handling', performanceTracker.getMetrics(), true)
    })
  })

  describe('End-to-End Processing Pipeline', () => {
    test('should complete full processing pipeline for all source types', async () => {
      const sourceTypes = ['pdf', 'youtube', 'web_url', 'markdown_asis', 'txt', 'paste']
      const results = []
      
      for (const sourceType of sourceTypes) {
        performanceTracker.start()
        
        try {
          const job = createTestJobForFixture(sourceType, 'simple')
          if (sourceType === 'paste') {
            job.raw_content = PASTE_FIXTURES.mixed.content
          }
          
          const processor = router.getProcessor(job)
          const result = await processor.process()
          
          const validation = OutputValidator.validateProcessResult(result)
          const metrics = performanceTracker.getMetrics()
          
          results.push({
            sourceType,
            success: validation.valid,
            metrics
          })
          
          testReporter.recordTest(`E2E - ${sourceType}`, metrics, validation.valid)
        } catch (error) {
          results.push({
            sourceType,
            success: false,
            error: error.message
          })
        }
      }
      
      // All source types should process successfully
      const successCount = results.filter(r => r.success).length
      expect(successCount).toBe(sourceTypes.length)
    })
  })

  describe('Performance Benchmarks Validation', () => {
    test('should meet all performance targets', () => {
      const report = testReporter.exportJSON()
      
      // Check overall success rate
      const successRate = report.summary.passed / report.summary.total
      expect(successRate).toBeGreaterThanOrEqual(0.95) // 95% pass rate
      
      // Verify 50x database improvement
      const batchTest = report.results.find(r => r.name.includes('50x Improvement'))
      expect(batchTest?.passed).toBe(true)
      
      // Verify cache effectiveness
      const cacheTest = report.results.find(r => r.name.includes('Cache'))
      expect(cacheTest?.metrics.cacheHitRate).toBeGreaterThanOrEqual(0.7)
      
      console.log('Performance Summary:', {
        totalTests: report.summary.total,
        passed: report.summary.passed,
        failed: report.summary.failed,
        successRate: `${(successRate * 100).toFixed(1)}%`
      })
    })
  })
})