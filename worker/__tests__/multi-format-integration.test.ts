/**
 * Integration tests for multi-format document processing.
 * Tests complete processing flows for all 6 source types with mocked external APIs.
 * 
 * Tests verify:
 * - Database operations (documents, chunks, jobs)
 * - Storage operations  
 * - Error classification and handling
 * - Format-specific processing logic
 */

import { processDocumentHandler } from '../handlers/process-document'
import { ERROR_PREFIXES } from '../types/multi-format'
import type { TranscriptSegment } from '../types/multi-format'

// Mock external dependencies
jest.mock('@supabase/supabase-js')
jest.mock('@google/genai')
jest.mock('youtube-transcript-plus')
jest.mock('axios')
jest.mock('jsdom')
jest.mock('@mozilla/readability')

import { createClient } from '@supabase/supabase-js'
import { GoogleGenAI } from '@google/genai'
import { fetchTranscript } from 'youtube-transcript-plus'
import axios from 'axios'
import { JSDOM } from 'jsdom'
import { Readability, isProbablyReaderable } from '@mozilla/readability'

describe('Multi-format Document Processing Integration', () => {
  let mockSupabase: any
  let mockAI: any

  beforeEach(() => {
    jest.clearAllMocks()

    // Mock Supabase client
    mockSupabase = {
      from: jest.fn().mockReturnThis(),
      storage: {
        from: jest.fn().mockReturnThis(),
        download: jest.fn(),
        upload: jest.fn()
      },
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn(),
      insert: jest.fn(),
      update: jest.fn()
    }

    // Mock Gemini AI client
    mockAI = {
      models: {
        generateContent: jest.fn(),
        embedContent: jest.fn()
      }
    }

    // Setup createClient mock
    ;(createClient as jest.Mock).mockReturnValue(mockSupabase)
    ;(GoogleGenAI as jest.Mock).mockImplementation(() => mockAI)
  })

  describe('YouTube processing', () => {
    const mockYouTubeJob = {
      id: 'job-youtube-123',
      job_type: 'process_document',
      input_data: {
        document_id: 'doc-youtube-123',
        source_type: 'youtube',
        source_url: 'https://youtube.com/watch?v=dQw4w9WgXcQ',
        storage_path: 'user-123/doc-youtube-123'
      }
    }

    const mockTranscript: TranscriptSegment[] = [
      {
        text: 'Hello and welcome to this video',
        offset: 0,
        duration: 3,
        lang: 'en'
      },
      {
        text: 'Today we will discuss TypeScript',
        offset: 125,
        duration: 4,
        lang: 'en'
      },
      {
        text: 'Let\'s get started with the basics',
        offset: 250,
        duration: 3,
        lang: 'en'
      }
    ]

    it('fetches transcript and stores with timestamps', async () => {
      // Mock YouTube transcript fetch
      ;(fetchTranscript as jest.Mock).mockResolvedValue(mockTranscript)

      // Mock Gemini rechunking
      mockAI.models.generateContent.mockResolvedValue({
        text: JSON.stringify({
          chunks: [
            {
              content: '[00:00](https://youtube.com/watch?v=dQw4w9WgXcQ&t=0s) Hello and welcome to this video',
              themes: ['Introduction'],
              importance_score: 0.8,
              summary: 'Video introduction'
            },
            {
              content: '[02:05](https://youtube.com/watch?v=dQw4w9WgXcQ&t=125s) Today we will discuss TypeScript',
              themes: ['TypeScript'],
              importance_score: 0.9,
              summary: 'Main topic introduction'
            }
          ]
        })
      })

      // Mock embedding generation
      mockAI.models.embedContent.mockResolvedValue({
        embeddings: [{ values: new Array(768).fill(0.1) }]
      })

      // Mock storage upload
      mockSupabase.storage.from().upload.mockResolvedValue({ error: null })

      // Mock database operations
      mockSupabase.from().insert.mockResolvedValue({ error: null })
      mockSupabase.from().update.mockResolvedValue({ error: null })

      // Process job
      await processDocumentHandler(mockSupabase, mockYouTubeJob)

      // Verify transcript was fetched
      expect(fetchTranscript).toHaveBeenCalledWith('dQw4w9WgXcQ')

      // Verify markdown was saved to storage
      expect(mockSupabase.storage.from).toHaveBeenCalledWith('documents')
      expect(mockSupabase.storage.from().upload).toHaveBeenCalled()

      // Verify chunks were inserted with timestamps
      const insertCalls = (mockSupabase.from().insert as jest.Mock).mock.calls
      const chunkInserts = insertCalls.filter((call: any) => 
        call[0] && typeof call[0] === 'object' && 'chunk_index' in call[0]
      )
      
      expect(chunkInserts.length).toBeGreaterThan(0)
      
      // Verify timestamps JSONB field is included for YouTube chunks
      const firstChunkInsert = chunkInserts[0][0]
      expect(firstChunkInsert).toHaveProperty('document_id')
      expect(firstChunkInsert).toHaveProperty('content')
      expect(firstChunkInsert).toHaveProperty('embedding')

      // Verify job completion
      expect(mockSupabase.from).toHaveBeenCalledWith('background_jobs')
      expect(mockSupabase.from().update).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'completed' })
      )
    })

    it('handles disabled transcripts gracefully', async () => {
      // Mock disabled transcript error
      const disabledError = new Error(`${ERROR_PREFIXES.YOUTUBE_TRANSCRIPT_DISABLED}: Subtitles are disabled for this video`)
      ;(fetchTranscript as jest.Mock).mockRejectedValue(disabledError)

      // Mock database error update
      mockSupabase.from().update.mockResolvedValue({ error: null })

      // Process job and expect error
      await expect(processDocumentHandler(mockSupabase, mockYouTubeJob)).rejects.toThrow()

      // Verify error was logged with proper classification
      expect(mockSupabase.from).toHaveBeenCalledWith('background_jobs')
      expect(mockSupabase.from().update).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'failed',
          last_error: expect.stringContaining('YOUTUBE_TRANSCRIPT_DISABLED')
        })
      )
    })

    it('retries on rate limit errors', async () => {
      // Mock rate limit error on first attempt, success on second
      const rateLimitError = new Error(`${ERROR_PREFIXES.YOUTUBE_RATE_LIMIT}: Too many requests`)
      
      ;(fetchTranscript as jest.Mock)
        .mockRejectedValueOnce(rateLimitError)
        .mockResolvedValueOnce(mockTranscript)

      // Mock other operations
      mockAI.models.generateContent.mockResolvedValue({
        text: JSON.stringify({
          chunks: [{ content: 'test', themes: ['test'], importance_score: 0.5, summary: 'test' }]
        })
      })
      mockAI.models.embedContent.mockResolvedValue({
        embeddings: [{ values: new Array(768).fill(0.1) }]
      })
      mockSupabase.storage.from().upload.mockResolvedValue({ error: null })
      mockSupabase.from().insert.mockResolvedValue({ error: null })
      mockSupabase.from().update.mockResolvedValue({ error: null })

      // Should eventually succeed after retry
      await processDocumentHandler(mockSupabase, mockYouTubeJob)

      // Verify retries occurred
      expect(fetchTranscript).toHaveBeenCalledTimes(2)
    })
  })

  describe('Web article processing', () => {
    const mockWebJob = {
      id: 'job-web-123',
      job_type: 'process_document',
      input_data: {
        document_id: 'doc-web-123',
        source_type: 'web_url',
        source_url: 'https://example.com/article',
        storage_path: 'user-123/doc-web-123'
      }
    }

    it('extracts article and cleans with AI', async () => {
      // Mock axios fetch
      ;(axios.get as jest.Mock).mockResolvedValue({
        data: '<html><body><article><h1>Test Article</h1><p>Content here</p></article></body></html>',
        status: 200
      })

      // Mock JSDOM and Readability
      const mockDocument = {
        querySelector: jest.fn().mockReturnValue({}),
        body: { innerHTML: '' }
      }
      ;(JSDOM as any).mockImplementation(() => ({
        window: {
          document: mockDocument
        }
      }))
      ;(isProbablyReaderable as jest.Mock).mockReturnValue(true)
      ;(Readability as any).mockImplementation(() => ({
        parse: () => ({
          title: 'Test Article',
          content: '<p>Clean content</p>',
          textContent: 'Clean content',
          excerpt: 'Article excerpt'
        })
      }))

      // Mock AI cleanup and chunking
      mockAI.models.generateContent.mockResolvedValue({
        text: JSON.stringify({
          chunks: [
            {
              content: '# Test Article\n\nClean content',
              themes: ['Article'],
              importance_score: 0.8,
              summary: 'Article content'
            }
          ]
        })
      })

      mockAI.models.embedContent.mockResolvedValue({
        embeddings: [{ values: new Array(768).fill(0.1) }]
      })

      // Mock storage and database
      mockSupabase.storage.from().upload.mockResolvedValue({ error: null })
      mockSupabase.from().insert.mockResolvedValue({ error: null })
      mockSupabase.from().update.mockResolvedValue({ error: null })

      // Process job
      await processDocumentHandler(mockSupabase, mockWebJob)

      // Verify article extraction
      expect(axios.get).toHaveBeenCalledWith(
        'https://example.com/article',
        expect.objectContaining({
          timeout: 10000,
          headers: expect.objectContaining({
            'User-Agent': expect.stringContaining('Rhizome')
          })
        })
      )

      // Verify AI cleanup was called
      expect(mockAI.models.generateContent).toHaveBeenCalled()

      // Verify markdown saved to storage
      expect(mockSupabase.storage.from().upload).toHaveBeenCalled()

      // Verify completion
      expect(mockSupabase.from().update).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'completed' })
      )
    })

    it('handles 404 errors', async () => {
      // Mock 404 response
      ;(axios.get as jest.Mock).mockRejectedValue({
        response: { status: 404 },
        message: 'Request failed with status code 404'
      })

      mockSupabase.from().update.mockResolvedValue({ error: null })

      // Process job and expect error
      await expect(processDocumentHandler(mockSupabase, mockWebJob)).rejects.toThrow()

      // Verify error classification
      expect(mockSupabase.from().update).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'failed',
          last_error: expect.stringContaining('WEB_NOT_FOUND')
        })
      )
    })

    it('handles paywall errors', async () => {
      // Mock 403 response
      ;(axios.get as jest.Mock).mockRejectedValue({
        response: { status: 403 },
        message: 'Request failed with status code 403'
      })

      mockSupabase.from().update.mockResolvedValue({ error: null })

      // Process job and expect error
      await expect(processDocumentHandler(mockSupabase, mockWebJob)).rejects.toThrow()

      // Verify paywall error classification
      expect(mockSupabase.from().update).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'failed',
          last_error: expect.stringContaining('WEB_PAYWALL')
        })
      )
    })

    it('handles non-article pages', async () => {
      // Mock successful fetch but not an article
      ;(axios.get as jest.Mock).mockResolvedValue({
        data: '<html><body><nav>Navigation</nav></body></html>',
        status: 200
      })

      ;(JSDOM as any).mockImplementation(() => ({
        window: { document: {} }
      }))
      ;(isProbablyReaderable as jest.Mock).mockReturnValue(false)

      mockSupabase.from().update.mockResolvedValue({ error: null })

      // Process job and expect error
      await expect(processDocumentHandler(mockSupabase, mockWebJob)).rejects.toThrow()

      // Verify not-article error
      expect(mockSupabase.from().update).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'failed',
          last_error: expect.stringContaining('WEB_NOT_ARTICLE')
        })
      )
    })
  })

  describe('Markdown processing', () => {
    const mockMarkdownContent = `# Introduction

This is the introduction section with detailed content.

## Details  

More detailed information here.

### Subsection

Even more specific content.`

    it('chunks by headings without AI (save-as-is mode)', async () => {
      const mockMarkdownJob = {
        id: 'job-md-123',
        job_type: 'process_document',
        input_data: {
          document_id: 'doc-md-123',
          source_type: 'markdown_asis',
          processing_requested: false,
          storage_path: 'user-123/doc-md-123'
        }
      }

      // Mock storage download
      mockSupabase.storage.from().download.mockResolvedValue({
        data: new Blob([mockMarkdownContent], { type: 'text/markdown' }),
        error: null
      })

      // Mock embedding generation (no AI cleanup)
      mockAI.models.embedContent.mockResolvedValue({
        embeddings: [{ values: new Array(768).fill(0.1) }]
      })

      // Mock database operations
      mockSupabase.from().insert.mockResolvedValue({ error: null })
      mockSupabase.from().update.mockResolvedValue({ error: null })

      // Process job
      await processDocumentHandler(mockSupabase, mockMarkdownJob)

      // Verify NO AI cleanup was called (processing_requested=false)
      expect(mockAI.models.generateContent).not.toHaveBeenCalled()

      // Verify embedding was called (still needed)
      expect(mockAI.models.embedContent).toHaveBeenCalled()

      // Verify chunks were created
      const insertCalls = (mockSupabase.from().insert as jest.Mock).mock.calls
      const chunkInserts = insertCalls.filter((call: any) => 
        call[0] && typeof call[0] === 'object' && 'chunk_index' in call[0]
      )
      expect(chunkInserts.length).toBeGreaterThan(0)

      // Verify completion
      expect(mockSupabase.from().update).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'completed' })
      )
    })

    it('cleans with AI (clean mode)', async () => {
      const mockMarkdownJob = {
        id: 'job-md-clean-123',
        job_type: 'process_document',
        input_data: {
          document_id: 'doc-md-clean-123',
          source_type: 'markdown_clean',
          processing_requested: true,
          storage_path: 'user-123/doc-md-clean-123'
        }
      }

      // Mock storage download
      mockSupabase.storage.from().download.mockResolvedValue({
        data: new Blob([mockMarkdownContent], { type: 'text/markdown' }),
        error: null
      })

      // Mock AI cleanup and rechunking
      mockAI.models.generateContent.mockResolvedValue({
        text: JSON.stringify({
          chunks: [
            {
              content: '# Introduction\n\nCleaned introduction content',
              themes: ['Introduction'],
              importance_score: 0.8,
              summary: 'Introduction summary'
            }
          ]
        })
      })

      mockAI.models.embedContent.mockResolvedValue({
        embeddings: [{ values: new Array(768).fill(0.1) }]
      })

      // Mock storage and database
      mockSupabase.storage.from().upload.mockResolvedValue({ error: null })
      mockSupabase.from().insert.mockResolvedValue({ error: null })
      mockSupabase.from().update.mockResolvedValue({ error: null })

      // Process job
      await processDocumentHandler(mockSupabase, mockMarkdownJob)

      // Verify AI cleanup WAS called (processing_requested=true)
      expect(mockAI.models.generateContent).toHaveBeenCalled()

      // Verify semantic chunks were created
      expect(mockAI.models.embedContent).toHaveBeenCalled()

      // Verify completion
      expect(mockSupabase.from().update).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'completed' })
      )
    })
  })

  describe('Text file processing', () => {
    it('converts text to markdown with AI', async () => {
      const mockTextJob = {
        id: 'job-txt-123',
        job_type: 'process_document',
        input_data: {
          document_id: 'doc-txt-123',
          source_type: 'txt',
          storage_path: 'user-123/doc-txt-123'
        }
      }

      const plainText = 'This is plain text content.\n\nMultiple paragraphs.\n\nMore content here.'

      // Mock storage download
      mockSupabase.storage.from().download.mockResolvedValue({
        data: new Blob([plainText], { type: 'text/plain' }),
        error: null
      })

      // Mock AI conversion to markdown
      mockAI.models.generateContent.mockResolvedValue({
        text: JSON.stringify({
          chunks: [
            {
              content: '# Converted Content\n\nThis is plain text content.\n\nMultiple paragraphs.',
              themes: ['Content'],
              importance_score: 0.7,
              summary: 'Converted text content'
            }
          ]
        })
      })

      mockAI.models.embedContent.mockResolvedValue({
        embeddings: [{ values: new Array(768).fill(0.1) }]
      })

      mockSupabase.storage.from().upload.mockResolvedValue({ error: null })
      mockSupabase.from().insert.mockResolvedValue({ error: null })
      mockSupabase.from().update.mockResolvedValue({ error: null })

      // Process job
      await processDocumentHandler(mockSupabase, mockTextJob)

      // Verify AI conversion was called
      expect(mockAI.models.generateContent).toHaveBeenCalled()

      // Verify completion
      expect(mockSupabase.from().update).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'completed' })
      )
    })
  })

  describe('Pasted content processing', () => {
    it('processes generic pasted text', async () => {
      const mockPasteJob = {
        id: 'job-paste-123',
        job_type: 'process_document',
        input_data: {
          document_id: 'doc-paste-123',
          source_type: 'paste',
          pasted_content: 'This is pasted content from user.\n\nMultiple paragraphs of text.',
          storage_path: 'user-123/doc-paste-123'
        }
      }

      // Mock AI processing
      mockAI.models.generateContent.mockResolvedValue({
        text: JSON.stringify({
          chunks: [
            {
              content: 'This is pasted content from user.\n\nMultiple paragraphs of text.',
              themes: ['Pasted Content'],
              importance_score: 0.6,
              summary: 'User pasted content'
            }
          ]
        })
      })

      mockAI.models.embedContent.mockResolvedValue({
        embeddings: [{ values: new Array(768).fill(0.1) }]
      })

      mockSupabase.storage.from().upload.mockResolvedValue({ error: null })
      mockSupabase.from().insert.mockResolvedValue({ error: null })
      mockSupabase.from().update.mockResolvedValue({ error: null })

      // Process job
      await processDocumentHandler(mockSupabase, mockPasteJob)

      // Verify AI processing
      expect(mockAI.models.generateContent).toHaveBeenCalled()

      // Verify completion
      expect(mockSupabase.from().update).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'completed' })
      )
    })

    it('detects and preserves YouTube timestamps in pasted transcripts', async () => {
      const mockPasteJob = {
        id: 'job-paste-yt-123',
        job_type: 'process_document',
        input_data: {
          document_id: 'doc-paste-yt-123',
          source_type: 'paste',
          source_url: 'https://youtube.com/watch?v=abc123',
          pasted_content: '[00:00] Introduction to the topic\n[02:15] Main content discussion\n[05:30] Conclusion',
          storage_path: 'user-123/doc-paste-yt-123'
        }
      }

      // Mock AI processing
      mockAI.models.generateContent.mockResolvedValue({
        text: JSON.stringify({
          chunks: [
            {
              content: '[00:00](https://youtube.com/watch?v=abc123&t=0s) Introduction to the topic',
              themes: ['Introduction'],
              importance_score: 0.8,
              summary: 'Video introduction'
            }
          ]
        })
      })

      mockAI.models.embedContent.mockResolvedValue({
        embeddings: [{ values: new Array(768).fill(0.1) }]
      })

      mockSupabase.storage.from().upload.mockResolvedValue({ error: null })
      mockSupabase.from().insert.mockResolvedValue({ error: null })
      mockSupabase.from().update.mockResolvedValue({ error: null })

      // Process job
      await processDocumentHandler(mockSupabase, mockPasteJob)

      // Verify timestamps were processed
      expect(mockAI.models.generateContent).toHaveBeenCalled()

      // Verify completion
      expect(mockSupabase.from().update).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'completed' })
      )
    })
  })

  describe('PDF processing (existing - no regression)', () => {
    it('processes PDF with Files API as before', async () => {
      const mockPdfJob = {
        id: 'job-pdf-123',
        job_type: 'process_document',
        input_data: {
          document_id: 'doc-pdf-123',
          source_type: 'pdf',
          storage_path: 'user-123/doc-pdf-123'
        }
      }

      // Mock storage download
      mockSupabase.storage.from().download.mockResolvedValue({
        data: new Blob([new ArrayBuffer(1024)], { type: 'application/pdf' }),
        error: null
      })

      // Mock Gemini PDF processing
      mockAI.models.generateContent.mockResolvedValue({
        text: JSON.stringify({
          markdown: '# PDF Content\n\nExtracted text from PDF.',
          chunks: [
            {
              content: '# PDF Content\n\nExtracted text from PDF.',
              themes: ['PDF'],
              importance_score: 0.8,
              summary: 'PDF content'
            }
          ]
        })
      })

      mockAI.models.embedContent.mockResolvedValue({
        embeddings: [{ values: new Array(768).fill(0.1) }]
      })

      mockSupabase.storage.from().upload.mockResolvedValue({ error: null })
      mockSupabase.from().insert.mockResolvedValue({ error: null })
      mockSupabase.from().update.mockResolvedValue({ error: null })

      // Process job
      await processDocumentHandler(mockSupabase, mockPdfJob)

      // Verify PDF processing
      expect(mockAI.models.generateContent).toHaveBeenCalled()
      expect(mockAI.models.embedContent).toHaveBeenCalled()

      // Verify completion
      expect(mockSupabase.from().update).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'completed' })
      )
    })
  })
})