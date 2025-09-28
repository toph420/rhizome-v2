/**
 * Integration test for YouTube Processing & Metadata Enhancement (T16).
 * 
 * Tests the complete pipeline:
 * 1. YouTube transcript fetching
 * 2. AI cleaning (timestamp removal)
 * 3. Semantic rechunking with complete metadata
 * 4. Fuzzy matching for chunk positioning
 * 5. Database storage with all metadata fields
 * 
 * Validates:
 * - Metadata completeness (importance_score, summary, themes, word_count)
 * - Position context accuracy (start_offset, end_offset, confidence)
 * - Storage verification (source-raw.md and content.md)
 * - Timestamp removal in cleaned content
 * - Graceful degradation on AI failures
 */

import { processDocumentHandler } from '../handlers/process-document'
import type { TranscriptSegment } from '../types/multi-format'

// Mock external dependencies
jest.mock('@supabase/supabase-js')
jest.mock('@google/genai')
jest.mock('youtube-transcript-plus')

import { createClient } from '@supabase/supabase-js'
import { GoogleGenAI } from '@google/genai'
import { fetchTranscript } from 'youtube-transcript-plus'

describe('YouTube Processing & Metadata Enhancement (T16)', () => {
  let mockSupabase: any
  let mockAI: any

  // Sample YouTube transcript for testing
  const mockTranscript: TranscriptSegment[] = [
    {
      text: 'Welcome to this tutorial on TypeScript advanced patterns',
      offset: 0,
      duration: 4,
      lang: 'en'
    },
    {
      text: 'Today we will explore generics and type inference',
      offset: 125,
      duration: 3,
      lang: 'en'
    },
    {
      text: 'Let me show you some practical examples',
      offset: 250,
      duration: 3,
      lang: 'en'
    },
    {
      text: 'First, we need to understand the basic syntax',
      offset: 312,
      duration: 3,
      lang: 'en'
    },
    {
      text: 'Then we can move on to more advanced techniques',
      offset: 375,
      duration: 4,
      lang: 'en'
    }
  ]

  const mockYouTubeJob = {
    id: 'job-youtube-metadata-test',
    job_type: 'process_document',
    input_data: {
      document_id: 'doc-youtube-metadata-test',
      source_type: 'youtube',
      source_url: 'https://youtube.com/watch?v=test123',
      storage_path: 'user-123/doc-youtube-metadata-test'
    },
    progress: {},
    retry_count: 0,
    max_retries: 3
  }

  beforeEach(() => {
    jest.clearAllMocks()

    // Mock Supabase client with comprehensive methods
    mockSupabase = {
      from: jest.fn().mockReturnThis(),
      storage: {
        from: jest.fn().mockReturnThis(),
        download: jest.fn(),
        upload: jest.fn(),
        createSignedUrl: jest.fn()
      },
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({
        data: {
          storage_path: mockYouTubeJob.input_data.storage_path,
          user_id: 'user-123'
        },
        error: null
      }),
      insert: jest.fn().mockResolvedValue({ error: null }),
      update: jest.fn().mockResolvedValue({ error: null })
    }

    // Mock Gemini AI client
    mockAI = {
      models: {
        generateContent: jest.fn(),
        embedContent: jest.fn()
      }
    }

    // Setup mocks
    ;(createClient as jest.Mock).mockReturnValue(mockSupabase)
    ;(GoogleGenAI as jest.Mock).mockImplementation(() => mockAI)
  })

  describe('Full Pipeline Success', () => {
    it('processes YouTube video with complete metadata and fuzzy matching', async () => {
      // Mock YouTube transcript fetch
      ;(fetchTranscript as jest.Mock).mockResolvedValue(mockTranscript)

      // Mock AI cleaning response (timestamps removed)
      const cleanedMarkdown = `# TypeScript Advanced Patterns Tutorial

Welcome to this tutorial on TypeScript advanced patterns. Today we will explore generics and type inference.

## Practical Examples

Let me show you some practical examples. First, we need to understand the basic syntax.

## Advanced Techniques

Then we can move on to more advanced techniques.`

      // Mock AI rechunking with COMPLETE metadata
      const mockChunks = [
        {
          content: 'Welcome to this tutorial on TypeScript advanced patterns. Today we will explore generics and type inference.',
          themes: ['TypeScript', 'Tutorial', 'Generics'],
          importance_score: 0.9,
          summary: 'Introduction to TypeScript generics and type inference tutorial'
        },
        {
          content: 'Let me show you some practical examples. First, we need to understand the basic syntax.',
          themes: ['Examples', 'Syntax'],
          importance_score: 0.8,
          summary: 'Practical examples and basic syntax explanation'
        },
        {
          content: 'Then we can move on to more advanced techniques.',
          themes: ['Advanced', 'Techniques'],
          importance_score: 0.7,
          summary: 'Introduction to advanced TypeScript techniques'
        }
      ]

      // Mock AI cleaning call
      let cleaningCallCount = 0
      mockAI.models.generateContent.mockImplementation(async (req: any) => {
        cleaningCallCount++
        
        // First call: AI cleaning (returns cleaned text directly, not JSON)
        if (cleaningCallCount === 1) {
          return { text: cleanedMarkdown }
        }
        
        // Second call: Rechunking (returns JSON with chunks)
        return {
          text: JSON.stringify({
            chunks: mockChunks
          })
        }
      })

      // Mock storage upload for source-raw.md and content.md
      mockSupabase.storage.from().upload.mockResolvedValue({ 
        data: { path: 'uploaded' }, 
        error: null 
      })

      // Mock storage download for fuzzy matching (returns source-raw.md)
      const rawMarkdownWithTimestamps = `[00:00](https://youtube.com/watch?v=test123&t=0s) Welcome to this tutorial on TypeScript advanced patterns
[02:05](https://youtube.com/watch?v=test123&t=125s) Today we will explore generics and type inference
[04:10](https://youtube.com/watch?v=test123&t=250s) Let me show you some practical examples`

      mockSupabase.storage.from().download.mockResolvedValue({
        data: new Blob([rawMarkdownWithTimestamps], { type: 'text/markdown' }),
        error: null
      })

      // Mock chunk insertion tracking
      const insertedChunks: any[] = []
      mockSupabase.from().insert.mockImplementation((data: any) => {
        if (data && 'chunk_index' in data) {
          insertedChunks.push(data)
        }
        return Promise.resolve({ error: null })
      })

      // Process job
      await processDocumentHandler(mockSupabase, mockYouTubeJob)

      // ===== ACCEPTANCE CRITERIA VALIDATION =====

      // Scenario 1: Full pipeline processes YouTube video successfully
      expect(fetchTranscript).toHaveBeenCalledWith('test123')
      expect(mockSupabase.storage.from).toHaveBeenCalledWith('documents')
      expect(mockSupabase.storage.from().upload).toHaveBeenCalled()
      
      // Verify both source-raw.md and content.md were saved
      const uploadCalls = (mockSupabase.storage.from().upload as jest.Mock).mock.calls
      const uploadedPaths = uploadCalls.map((call: any) => call[0])
      expect(uploadedPaths).toEqual(
        expect.arrayContaining([
          expect.stringContaining('source-raw.md'),
          expect.stringContaining('content.md')
        ])
      )

      // Verify chunks were inserted
      expect(insertedChunks.length).toBeGreaterThan(0)

      // Scenario 2: Metadata is complete and valid
      insertedChunks.forEach((chunk, index) => {
        // All chunks must have importance_score between 0.0-1.0
        expect(chunk.importance_score).toBeGreaterThanOrEqual(0.0)
        expect(chunk.importance_score).toBeLessThanOrEqual(1.0)
        
        // All chunks must have non-empty summary
        expect(chunk.summary).toBeDefined()
        expect(chunk.summary.length).toBeGreaterThan(0)
        
        // All chunks must have non-empty themes array
        expect(chunk.themes).toBeDefined()
        expect(Array.isArray(chunk.themes)).toBe(true)
        expect(chunk.themes.length).toBeGreaterThan(0)
        
        // All chunks must have word_count > 0
        expect(chunk.word_count).toBeDefined()
        expect(chunk.word_count).toBeGreaterThan(0)
      })

      // Scenario 3: Position context is accurate
      const chunksWithPosition = insertedChunks.filter(c => c.position_context !== null)
      expect(chunksWithPosition.length).toBeGreaterThan(0)

      chunksWithPosition.forEach(chunk => {
        const posCtx = chunk.position_context
        
        // Confidence must be between 0.3-1.0
        expect(posCtx.confidence).toBeGreaterThanOrEqual(0.3)
        expect(posCtx.confidence).toBeLessThanOrEqual(1.0)
        
        // Method must be one of: exact, fuzzy, approximate
        expect(['exact', 'fuzzy', 'approximate']).toContain(posCtx.method)
        
        // Context before/after should exist and have words
        expect(posCtx.context_before).toBeDefined()
        expect(posCtx.context_after).toBeDefined()
        
        // Context should contain multiple words (typically ~5 words)
        const beforeWords = posCtx.context_before.trim().split(/\s+/)
        const afterWords = posCtx.context_after.trim().split(/\s+/)
        expect(beforeWords.length).toBeGreaterThan(0)
        expect(afterWords.length).toBeGreaterThan(0)
      })

      // Verify high confidence percentage (>70% should have confidence >= 0.7)
      const highConfidenceChunks = chunksWithPosition.filter(
        c => c.position_context.confidence >= 0.7
      )
      const highConfidencePercent = (highConfidenceChunks.length / chunksWithPosition.length) * 100
      expect(highConfidencePercent).toBeGreaterThanOrEqual(70)

      // Verify job completion
      expect(mockSupabase.from().update).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'completed',
          progress: expect.objectContaining({
            percent: 100,
            stage: 'complete'
          })
        })
      )
    })

    it('verifies timestamp removal in cleaned content', async () => {
      ;(fetchTranscript as jest.Mock).mockResolvedValue(mockTranscript)

      // Mock AI cleaning that successfully removes timestamps
      const cleanedWithoutTimestamps = 'Welcome to this tutorial. Today we will explore TypeScript.'
      
      mockAI.models.generateContent.mockResolvedValueOnce({
        text: cleanedWithoutTimestamps
      }).mockResolvedValueOnce({
        text: JSON.stringify({
          chunks: [{
            content: cleanedWithoutTimestamps,
            themes: ['TypeScript'],
            importance_score: 0.8,
            summary: 'TypeScript tutorial'
          }]
        })
      })

      mockSupabase.storage.from().upload.mockResolvedValue({ error: null })
      mockSupabase.storage.from().download.mockResolvedValue({
        data: new Blob(['[00:00](url) content'], { type: 'text/markdown' }),
        error: null
      })

      await processDocumentHandler(mockSupabase, mockYouTubeJob)

      // Verify content.md upload was called
      const uploadCalls = (mockSupabase.storage.from().upload as jest.Mock).mock.calls
      const contentMdCall = uploadCalls.find((call: any) => 
        call[0].includes('content.md')
      )
      
      expect(contentMdCall).toBeDefined()
      
      // Read the blob content
      const uploadedBlob = contentMdCall[1]
      const uploadedText = await uploadedBlob.text()
      
      // Verify NO timestamp patterns like [[MM:SS](url)]
      expect(uploadedText).not.toMatch(/\[\d{1,2}:\d{2}\]\(http/)
      expect(uploadedText).toContain('Welcome to this tutorial')
    })
  })

  describe('Graceful Degradation', () => {
    it('falls back to original transcript when AI cleaning fails', async () => {
      ;(fetchTranscript as jest.Mock).mockResolvedValue(mockTranscript)

      // Mock AI cleaning FAILURE
      let callCount = 0
      mockAI.models.generateContent.mockImplementation(() => {
        callCount++
        if (callCount === 1) {
          // First call (cleaning) returns empty - should trigger fallback
          return Promise.resolve({ text: '' })
        }
        // Second call (rechunking) succeeds
        return Promise.resolve({
          text: JSON.stringify({
            chunks: [{
              content: 'Fallback content',
              themes: ['general'],
              importance_score: 0.5,
              summary: 'Content from original transcript'
            }]
          })
        })
      })

      mockSupabase.storage.from().upload.mockResolvedValue({ error: null })
      mockSupabase.storage.from().download.mockResolvedValue({
        data: new Blob(['source content'], { type: 'text/markdown' }),
        error: null
      })

      // Should NOT throw error - graceful degradation
      await processDocumentHandler(mockSupabase, mockYouTubeJob)

      // Verify job completed despite cleaning failure
      expect(mockSupabase.from().update).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'completed' })
      )

      // Verify chunks were still created (using original transcript)
      expect(mockSupabase.from().insert).toHaveBeenCalled()
    })

    it('continues processing when fuzzy matching fails (storage error)', async () => {
      ;(fetchTranscript as jest.Mock).mockResolvedValue(mockTranscript)

      // Mock successful AI cleaning and chunking
      mockAI.models.generateContent.mockResolvedValueOnce({
        text: 'Cleaned content'
      }).mockResolvedValueOnce({
        text: JSON.stringify({
          chunks: [{
            content: 'Content',
            themes: ['Test'],
            importance_score: 0.8,
            summary: 'Test content'
          }]
        })
      })

      mockSupabase.storage.from().upload.mockResolvedValue({ error: null })
      
      // Mock storage download FAILURE (source-raw.md not accessible)
      mockSupabase.storage.from().download.mockResolvedValue({
        data: null,
        error: { message: 'File not found' }
      })

      // Should NOT throw error - continues without position data
      await processDocumentHandler(mockSupabase, mockYouTubeJob)

      // Verify job completed
      expect(mockSupabase.from().update).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'completed' })
      )

      // Verify chunks were inserted without position_context (NULL)
      const insertCalls = (mockSupabase.from().insert as jest.Mock).mock.calls
      const chunkInserts = insertCalls.filter((call: any) => 
        call[0] && 'chunk_index' in call[0]
      )
      
      if (chunkInserts.length > 0) {
        const chunk = chunkInserts[0][0]
        // Position context should be NULL when fuzzy matching fails
        expect(chunk.position_context).toBeNull()
        // But other metadata should still be present
        expect(chunk.importance_score).toBeDefined()
        expect(chunk.summary).toBeDefined()
        expect(chunk.themes).toBeDefined()
        expect(chunk.word_count).toBeDefined()
      }
    })
  })

  describe('Metadata Validation Edge Cases', () => {
    it('applies safe defaults when AI returns incomplete metadata', async () => {
      ;(fetchTranscript as jest.Mock).mockResolvedValue(mockTranscript)

      // Mock AI cleaning success
      mockAI.models.generateContent.mockResolvedValueOnce({
        text: 'Cleaned content'
      })

      // Mock AI rechunking with INCOMPLETE metadata (missing fields)
      mockAI.models.generateContent.mockResolvedValueOnce({
        text: JSON.stringify({
          chunks: [
            {
              content: 'Chunk with all metadata',
              themes: ['Complete'],
              importance_score: 0.9,
              summary: 'Full metadata'
            },
            {
              content: 'Chunk missing themes',
              // themes: MISSING - should default to ['general']
              importance_score: 0.8,
              summary: 'Partial metadata'
            },
            {
              content: 'Chunk missing importance and summary',
              themes: ['Test'],
              // importance_score: MISSING - should default to 0.5
              // summary: MISSING - should default to first 100 chars
            }
          ]
        })
      })

      mockSupabase.storage.from().upload.mockResolvedValue({ error: null })
      mockSupabase.storage.from().download.mockResolvedValue({
        data: new Blob(['source'], { type: 'text/markdown' }),
        error: null
      })

      const insertedChunks: any[] = []
      mockSupabase.from().insert.mockImplementation((data: any) => {
        if (data && 'chunk_index' in data) {
          insertedChunks.push(data)
        }
        return Promise.resolve({ error: null })
      })

      await processDocumentHandler(mockSupabase, mockYouTubeJob)

      // Verify all chunks have complete metadata after defaults applied
      expect(insertedChunks.length).toBe(3)

      insertedChunks.forEach((chunk, index) => {
        // All must have non-null themes
        expect(chunk.themes).toBeDefined()
        expect(Array.isArray(chunk.themes)).toBe(true)
        expect(chunk.themes.length).toBeGreaterThan(0)
        
        // All must have importance_score
        expect(chunk.importance_score).toBeDefined()
        expect(chunk.importance_score).toBeGreaterThanOrEqual(0.0)
        expect(chunk.importance_score).toBeLessThanOrEqual(1.0)
        
        // All must have summary
        expect(chunk.summary).toBeDefined()
        expect(chunk.summary.length).toBeGreaterThan(0)
        
        // All must have word_count
        expect(chunk.word_count).toBeDefined()
        expect(chunk.word_count).toBeGreaterThan(0)
      })

      // Verify safe defaults were applied where needed
      // Second chunk should have default themes
      expect(insertedChunks[1].themes).toEqual(['general'])
      
      // Third chunk should have default importance_score (0.5)
      expect(insertedChunks[2].importance_score).toBe(0.5)
      
      // Third chunk should have default summary (first 100 chars + '...')
      expect(insertedChunks[2].summary).toContain('Chunk missing importance')
    })
  })

  describe('Storage Verification', () => {
    it('saves both source-raw.md and content.md to storage', async () => {
      ;(fetchTranscript as jest.Mock).mockResolvedValue(mockTranscript)

      mockAI.models.generateContent.mockResolvedValueOnce({
        text: 'Cleaned content'
      }).mockResolvedValueOnce({
        text: JSON.stringify({
          chunks: [{
            content: 'Chunk',
            themes: ['Test'],
            importance_score: 0.8,
            summary: 'Summary'
          }]
        })
      })

      const uploadedFiles: string[] = []
      mockSupabase.storage.from().upload.mockImplementation((path: string, blob: Blob) => {
        uploadedFiles.push(path)
        return Promise.resolve({ data: { path }, error: null })
      })

      mockSupabase.storage.from().download.mockResolvedValue({
        data: new Blob(['source'], { type: 'text/markdown' }),
        error: null
      })

      await processDocumentHandler(mockSupabase, mockYouTubeJob)

      // Verify BOTH files were uploaded
      expect(uploadedFiles.length).toBeGreaterThanOrEqual(2)
      
      const hasSourceRaw = uploadedFiles.some(path => path.includes('source-raw.md'))
      const hasContentMd = uploadedFiles.some(path => path.includes('content.md'))
      
      expect(hasSourceRaw).toBe(true)
      expect(hasContentMd).toBe(true)

      // Verify correct storage bucket was used
      expect(mockSupabase.storage.from).toHaveBeenCalledWith('documents')
    })
  })
})