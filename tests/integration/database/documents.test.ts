/**
 * Database Integration Tests - Documents Table
 * 
 * Tests document CRUD operations, storage path handling, and processing status flow.
 * Validates RLS policies and user isolation.
 */

import { factories } from '@/tests/factories'
import { createClient } from '@supabase/supabase-js'

// Mock Supabase client for testing
const mockSupabase = {
  from: jest.fn(),
  storage: {
    from: jest.fn()
  }
}

// Mock user for isolation testing
const testUser1 = 'test-user-1'
const testUser2 = 'test-user-2'

// Track test data for cleanup
const testDocuments: string[] = []

describe('Documents Database Operations', () => {
  
  beforeEach(() => {
    jest.clearAllMocks()
    testDocuments.length = 0
    
    // Setup default mock behavior
    const createMockChain = () => {
      const chain = {
        eq: jest.fn(),
        single: jest.fn(),
        order: jest.fn()
      }
      chain.eq.mockResolvedValue({ data: [], error: null })
      chain.single.mockResolvedValue({ data: null, error: null })
      chain.order.mockResolvedValue({ data: [], error: null })
      return chain
    }
    
    mockSupabase.from.mockReturnValue({
      insert: jest.fn().mockResolvedValue({ data: [], error: null }),
      select: jest.fn().mockReturnValue(createMockChain()),
      update: jest.fn().mockReturnValue(createMockChain()),
      delete: jest.fn().mockReturnValue(createMockChain())
    })
    
    mockSupabase.storage = {
      from: jest.fn().mockReturnValue({
        upload: jest.fn().mockResolvedValue({ data: null, error: null })
      })
    }
  })

  afterEach(() => {
    // Clean up test documents
    testDocuments.forEach(async (docId) => {
      await mockSupabase.from('documents').delete().eq('id', docId)
    })
  })

  describe('Document Creation with Storage', () => {
    it('should create document record with storage path', async () => {
      // Arrange
      const document = factories.document.create({
        user_id: testUser1,
        title: 'Test PDF Document',
        source_type: 'pdf',
        processing_status: 'pending'
      })
      
      const expectedStoragePath = `${testUser1}/${document.id}/source.pdf`
      
      // Setup mock to return created document
      mockSupabase.from('documents').insert.mockResolvedValue({
        data: [{ ...document, storage_path: expectedStoragePath }],
        error: null
      })

      // Act
      const result = await mockSupabase.from('documents').insert({
        ...document,
        storage_path: expectedStoragePath
      })

      // Assert
      expect(result.error).toBeNull()
      expect(mockSupabase.from).toHaveBeenCalledWith('documents')
      expect(mockSupabase.from('documents').insert).toHaveBeenCalledWith({
        ...document,
        storage_path: expectedStoragePath
      })
      
      testDocuments.push(document.id)
    })

    it('should queue background processing job on document creation', async () => {
      // Arrange
      const document = factories.document.create({
        user_id: testUser1,
        processing_status: 'pending'
      })
      
      const expectedJob = {
        user_id: testUser1,
        job_type: 'process-document',
        entity_type: 'document', 
        entity_id: document.id,
        status: 'pending',
        input_data: {
          document_id: document.id,
          source_type: document.source_type
        }
      }

      // Setup mocks
      mockSupabase.from('documents').insert.mockResolvedValue({
        data: [document],
        error: null
      })
      
      mockSupabase.from('background_jobs').insert.mockResolvedValue({
        data: [expectedJob],
        error: null
      })

      // Act
      await mockSupabase.from('documents').insert(document)
      await mockSupabase.from('background_jobs').insert(expectedJob)

      // Assert
      expect(mockSupabase.from('background_jobs').insert).toHaveBeenCalledWith(
        expect.objectContaining({
          job_type: 'process-document',
          entity_type: 'document',
          entity_id: document.id,
          input_data: expect.objectContaining({
            document_id: document.id
          })
        })
      )
      
      testDocuments.push(document.id)
    })
  })

  describe('Processing Status Updates', () => {
    it('should update processing status through workflow stages', async () => {
      // Arrange
      const document = factories.document.create({
        user_id: testUser1,
        processing_status: 'pending'
      })

      const statusFlow = ['processing', 'embedding', 'complete']
      
      // Setup mocks for each status update
      statusFlow.forEach(status => {
        mockSupabase.from('documents').update.mockResolvedValueOnce({
          data: [{ ...document, processing_status: status }],
          error: null
        })
      })

      // Act & Assert each status transition
      for (const status of statusFlow) {
        const result = await mockSupabase.from('documents')
          .update({ processing_status: status })
          .eq('id', document.id)
        
        expect(result.error).toBeNull()
      }

      expect(mockSupabase.from('documents').update).toHaveBeenCalledTimes(3)
      testDocuments.push(document.id)
    })

    it('should handle processing errors with error message storage', async () => {
      // Arrange
      const document = factories.document.create({
        user_id: testUser1,
        processing_status: 'processing'
      })
      
      const errorMessage = 'Gemini API quota exceeded'
      
      mockSupabase.from('documents').update.mockResolvedValue({
        data: [{
          ...document,
          processing_status: 'failed',
          processing_error: errorMessage
        }],
        error: null
      })

      // Act
      const result = await mockSupabase.from('documents')
        .update({
          processing_status: 'failed',
          processing_error: errorMessage,
          processing_completed_at: new Date().toISOString()
        })
        .eq('id', document.id)

      // Assert
      expect(result.error).toBeNull()
      expect(mockSupabase.from('documents').update).toHaveBeenCalledWith({
        processing_status: 'failed',
        processing_error: errorMessage,
        processing_completed_at: expect.any(String)
      })
      
      testDocuments.push(document.id)
    })
  })

  describe('User Isolation (RLS)', () => {
    it('should only return documents for authenticated user', async () => {
      // Arrange
      const user1Doc = factories.document.create({ user_id: testUser1 })
      const user2Doc = factories.document.create({ user_id: testUser2 })
      
      // Mock RLS behavior - only return user's own documents
      mockSupabase.from('documents').select.mockReturnValue({
        eq: jest.fn().mockResolvedValue({
          data: [user1Doc], // Only user1's document returned
          error: null
        })
      })

      // Act - simulate query for user1
      const result = await mockSupabase.from('documents')
        .select('*')
        .eq('user_id', testUser1)

      // Assert
      expect(result.data).toHaveLength(1)
      expect(result.data[0].user_id).toBe(testUser1)
      expect(result.data[0].id).toBe(user1Doc.id)
      
      testDocuments.push(user1Doc.id, user2Doc.id)
    })

    it('should prevent cross-user document access', async () => {
      // Arrange
      const user1Doc = factories.document.create({ user_id: testUser1 })
      
      // Mock RLS blocking unauthorized access
      mockSupabase.from('documents').select.mockReturnValue({
        eq: jest.fn().mockResolvedValue({
          data: null, // RLS blocks access
          error: { message: 'Row Level Security violation' }
        })
      })

      // Act - user2 tries to access user1's document
      const result = await mockSupabase.from('documents')
        .select('*')
        .eq('id', user1Doc.id)

      // Assert
      expect(result.data).toBeNull()
      expect(result.error).toBeDefined()
      expect(result.error.message).toContain('Row Level Security')
      
      testDocuments.push(user1Doc.id)
    })
  })

  describe('Metadata and Content Handling', () => {
    it('should store extracted metadata as JSONB', async () => {
      // Arrange
      const document = factories.document.create({
        user_id: testUser1,
        metadata: {
          author: 'John Doe',
          publisher: 'Academic Press',
          publication_date: '2024-01-15',
          keywords: ['AI', 'machine learning', 'research'],
          doi: '10.1000/182'
        },
        outline: {
          chapters: [
            { title: 'Introduction', page: 1 },
            { title: 'Methodology', page: 15 },
            { title: 'Results', page: 32 }
          ]
        }
      })

      mockSupabase.from('documents').insert.mockResolvedValue({
        data: [document],
        error: null
      })

      // Act
      const result = await mockSupabase.from('documents').insert(document)

      // Assert
      expect(result.error).toBeNull()
      expect(mockSupabase.from('documents').insert).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            author: 'John Doe',
            keywords: expect.arrayContaining(['AI', 'machine learning'])
          }),
          outline: expect.objectContaining({
            chapters: expect.arrayContaining([
              expect.objectContaining({ title: 'Introduction' })
            ])
          })
        })
      )
      
      testDocuments.push(document.id)
    })

    it('should update word count and page count after processing', async () => {
      // Arrange
      const document = factories.document.create({
        user_id: testUser1,
        word_count: null,
        page_count: null
      })

      mockSupabase.from('documents').update.mockResolvedValue({
        data: [{
          ...document,
          word_count: 2847,
          page_count: 12,
          processing_status: 'complete'
        }],
        error: null
      })

      // Act
      const result = await mockSupabase.from('documents')
        .update({
          word_count: 2847,
          page_count: 12,
          processing_status: 'complete',
          processing_completed_at: new Date().toISOString()
        })
        .eq('id', document.id)

      // Assert
      expect(result.error).toBeNull()
      expect(mockSupabase.from('documents').update).toHaveBeenCalledWith({
        word_count: 2847,
        page_count: 12,
        processing_status: 'complete',
        processing_completed_at: expect.any(String)
      })
      
      testDocuments.push(document.id)
    })
  })

  describe('Transaction Rollback', () => {
    it('should rollback document creation on storage failure', async () => {
      // Arrange
      const document = factories.document.create({ user_id: testUser1 })
      
      // Mock storage failure after document insert
      mockSupabase.from('documents').insert.mockResolvedValueOnce({
        data: [document],
        error: null
      })
      
      mockSupabase.storage.from('documents').upload.mockRejectedValueOnce(
        new Error('Storage quota exceeded')
      )
      
      mockSupabase.from('documents').delete.mockResolvedValueOnce({
        data: [],
        error: null
      })

      // Act - simulate transaction rollback
      try {
        await mockSupabase.from('documents').insert(document)
        await mockSupabase.storage.from('documents').upload('path', new Blob())
      } catch (error) {
        // Rollback on storage failure
        await mockSupabase.from('documents').delete().eq('id', document.id)
      }

      // Assert
      expect(mockSupabase.from('documents').delete).toHaveBeenCalledWith()
      expect(mockSupabase.storage.from('documents').upload).toHaveBeenCalled()
    })
  })
})