/**
 * Unit tests for import-document handler.
 *
 * Tests all three import strategies (skip, replace, merge_smart) and optional features.
 */

import { importDocumentHandler } from '../import-document'
import * as storageHelpers from '../../lib/storage-helpers'
import * as embeddings from '../../lib/embeddings'
import type { ChunksExport } from '../../types/storage'

// Mock dependencies
jest.mock('../../lib/storage-helpers')
jest.mock('../../lib/embeddings')

describe('import-document handler', () => {
  let mockSupabase: any
  let mockJob: any

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks()

    // Mock Supabase client
    mockSupabase = {
      from: jest.fn((table: string) => ({
        select: jest.fn(() => ({
          eq: jest.fn(() => ({
            order: jest.fn(() => ({
              limit: jest.fn(() => Promise.resolve({ data: [], error: null }))
            })),
            single: jest.fn(() => Promise.resolve({ data: null, error: null }))
          })),
          head: jest.fn(() => ({
            eq: jest.fn(() => Promise.resolve({ count: 0, error: null }))
          }))
        })),
        delete: jest.fn(() => ({
          eq: jest.fn(() => Promise.resolve({ error: null }))
        })),
        insert: jest.fn(() => Promise.resolve({ error: null })),
        update: jest.fn(() => ({
          eq: jest.fn(() => ({
            eq: jest.fn(() => Promise.resolve({ error: null }))
          }))
        }))
      }))
    }

    // Mock job
    mockJob = {
      id: 'job-123',
      input_data: {
        document_id: 'doc-456',
        storage_path: 'user-1/doc-456',
        strategy: 'replace',
        regenerateEmbeddings: false,
        reprocessConnections: false
      }
    }
  })

  describe('Scenario 1: Replace strategy import', () => {
    it('should delete existing chunks and insert from Storage', async () => {
      // Arrange: Mock Storage data
      const mockChunksData: ChunksExport = {
        version: '1.0',
        document_id: 'doc-456',
        processing_mode: 'cloud',
        created_at: new Date().toISOString(),
        chunks: [
          {
            content: 'Chunk 1 content',
            chunk_index: 0,
            themes: ['theme1'],
            importance_score: 0.8,
            summary: 'Summary 1'
          },
          {
            content: 'Chunk 2 content',
            chunk_index: 1,
            themes: ['theme2'],
            importance_score: 0.7,
            summary: 'Summary 2'
          }
        ]
      }

      ;(storageHelpers.readFromStorage as jest.Mock).mockResolvedValue(mockChunksData)

      // Mock DELETE operation
      const mockDelete = jest.fn(() => ({
        eq: jest.fn(() => Promise.resolve({ error: null }))
      }))
      mockSupabase.from = jest.fn(() => ({
        select: jest.fn(() => ({
          eq: jest.fn(() => ({
            order: jest.fn(() => ({
              limit: jest.fn(() => Promise.resolve({ data: [], error: null }))
            }))
          }))
        })),
        delete: mockDelete,
        insert: jest.fn(() => Promise.resolve({ error: null })),
        update: jest.fn(() => ({
          eq: jest.fn(() => Promise.resolve({ error: null }))
        }))
      }))

      // Act
      await importDocumentHandler(mockSupabase, mockJob)

      // Assert
      expect(storageHelpers.readFromStorage).toHaveBeenCalledWith(
        mockSupabase,
        'user-1/doc-456/chunks.json'
      )
      expect(mockDelete).toHaveBeenCalled() // DELETE called
      expect(mockSupabase.from).toHaveBeenCalledWith('chunks')
    })

    it('should complete with status "completed" and show imported count', async () => {
      // Arrange
      const mockChunksData: ChunksExport = {
        version: '1.0',
        document_id: 'doc-456',
        processing_mode: 'cloud',
        created_at: new Date().toISOString(),
        chunks: Array.from({ length: 200 }, (_, i) => ({
          content: `Chunk ${i}`,
          chunk_index: i,
          themes: ['theme'],
          importance_score: 0.5
        }))
      }

      ;(storageHelpers.readFromStorage as jest.Mock).mockResolvedValue(mockChunksData)

      // Mock update to capture output_data
      let capturedOutputData: any = null
      mockSupabase.from = jest.fn((table: string) => {
        if (table === 'background_jobs') {
          return {
            update: jest.fn((data: any) => {
              if (data.status === 'completed') {
                capturedOutputData = data.output_data
              }
              return {
                eq: jest.fn(() => Promise.resolve({ error: null }))
              }
            })
          }
        }
        return {
          delete: jest.fn(() => ({ eq: jest.fn(() => Promise.resolve({ error: null })) })),
          insert: jest.fn(() => Promise.resolve({ error: null })),
          update: jest.fn(() => ({ eq: jest.fn(() => Promise.resolve({ error: null })) }))
        }
      })

      // Act
      await importDocumentHandler(mockSupabase, mockJob)

      // Assert
      expect(capturedOutputData).toMatchObject({
        success: true,
        document_id: 'doc-456',
        strategy: 'replace',
        imported: 200
      })
    })
  })

  describe('Scenario 2: Merge Smart strategy', () => {
    it('should preserve chunk IDs and update metadata only', async () => {
      // Arrange
      mockJob.input_data.strategy = 'merge_smart'

      const mockChunksData: ChunksExport = {
        version: '1.0',
        document_id: 'doc-456',
        processing_mode: 'cloud',
        created_at: new Date().toISOString(),
        chunks: [
          {
            content: 'Chunk 1 content',
            chunk_index: 0,
            themes: ['new_theme'],
            importance_score: 0.9,
            summary: 'Updated summary'
          }
        ]
      }

      ;(storageHelpers.readFromStorage as jest.Mock).mockResolvedValue(mockChunksData)

      // Mock UPDATE operation
      const mockUpdate = jest.fn(() => ({
        eq: jest.fn(() => ({
          eq: jest.fn(() => Promise.resolve({ error: null }))
        }))
      }))

      mockSupabase.from = jest.fn((table: string) => {
        if (table === 'chunks') {
          return {
            update: mockUpdate,
            delete: jest.fn(() => ({ eq: jest.fn(() => Promise.resolve({ error: null })) })),
            insert: jest.fn(() => Promise.resolve({ error: null }))
          }
        }
        return {
          update: jest.fn(() => ({ eq: jest.fn(() => Promise.resolve({ error: null })) }))
        }
      })

      // Act
      await importDocumentHandler(mockSupabase, mockJob)

      // Assert: UPDATE called, not DELETE
      expect(mockUpdate).toHaveBeenCalledWith({
        themes: ['new_theme'],
        importance_score: 0.9,
        summary: 'Updated summary',
        emotional_metadata: undefined,
        conceptual_metadata: undefined,
        domain_metadata: undefined,
        metadata_extracted_at: undefined
      })
    })
  })

  describe('Scenario 3: Regenerate embeddings', () => {
    it('should generate and update embeddings when flag is true', async () => {
      // Arrange
      mockJob.input_data.regenerateEmbeddings = true

      const mockChunksData: ChunksExport = {
        version: '1.0',
        document_id: 'doc-456',
        processing_mode: 'cloud',
        created_at: new Date().toISOString(),
        chunks: [
          { content: 'Chunk 1', chunk_index: 0 },
          { content: 'Chunk 2', chunk_index: 1 }
        ]
      }

      ;(storageHelpers.readFromStorage as jest.Mock).mockResolvedValue(mockChunksData)

      // Mock chunks query for embedding regeneration
      const mockChunksForEmbeddings = [
        { id: 'chunk-1', content: 'Chunk 1' },
        { id: 'chunk-2', content: 'Chunk 2' }
      ]

      const mockEmbeddings = [
        Array(768).fill(0.1),
        Array(768).fill(0.2)
      ]

      ;(embeddings.generateEmbeddings as jest.Mock).mockResolvedValue(mockEmbeddings)

      // Mock select for chunks query
      mockSupabase.from = jest.fn((table: string) => {
        if (table === 'chunks' && mockJob.input_data.regenerateEmbeddings) {
          return {
            select: jest.fn(() => ({
              eq: jest.fn(() => ({
                order: jest.fn(() => Promise.resolve({
                  data: mockChunksForEmbeddings,
                  error: null
                }))
              }))
            })),
            update: jest.fn(() => ({
              eq: jest.fn(() => Promise.resolve({ error: null }))
            })),
            delete: jest.fn(() => ({ eq: jest.fn(() => Promise.resolve({ error: null })) })),
            insert: jest.fn(() => Promise.resolve({ error: null }))
          }
        }
        return {
          update: jest.fn(() => ({ eq: jest.fn(() => Promise.resolve({ error: null })) })),
          delete: jest.fn(() => ({ eq: jest.fn(() => Promise.resolve({ error: null })) })),
          insert: jest.fn(() => Promise.resolve({ error: null }))
        }
      })

      // Act
      await importDocumentHandler(mockSupabase, mockJob)

      // Assert
      expect(embeddings.generateEmbeddings).toHaveBeenCalledWith(['Chunk 1', 'Chunk 2'])
    })

    it('should show "Regenerating embeddings" progress stage', async () => {
      // Arrange
      mockJob.input_data.regenerateEmbeddings = true

      const mockChunksData: ChunksExport = {
        version: '1.0',
        document_id: 'doc-456',
        processing_mode: 'cloud',
        created_at: new Date().toISOString(),
        chunks: [{ content: 'Chunk 1', chunk_index: 0 }]
      }

      ;(storageHelpers.readFromStorage as jest.Mock).mockResolvedValue(mockChunksData)
      ;(embeddings.generateEmbeddings as jest.Mock).mockResolvedValue([Array(768).fill(0.1)])

      // Capture progress updates
      const progressUpdates: any[] = []
      mockSupabase.from = jest.fn((table: string) => {
        if (table === 'background_jobs') {
          return {
            update: jest.fn((data: any) => {
              if (data.progress) {
                progressUpdates.push(data.progress)
              }
              return {
                eq: jest.fn(() => Promise.resolve({ error: null }))
              }
            })
          }
        }
        return {
          select: jest.fn(() => ({
            eq: jest.fn(() => ({
              order: jest.fn(() => Promise.resolve({ data: [{ id: 'chunk-1', content: 'Chunk 1' }], error: null }))
            }))
          })),
          update: jest.fn(() => ({ eq: jest.fn(() => Promise.resolve({ error: null })) })),
          delete: jest.fn(() => ({ eq: jest.fn(() => Promise.resolve({ error: null })) })),
          insert: jest.fn(() => Promise.resolve({ error: null }))
        }
      })

      // Act
      await importDocumentHandler(mockSupabase, mockJob)

      // Assert: Check for embeddings stage
      const embeddingsStage = progressUpdates.find(p => p.stage === 'embeddings')
      expect(embeddingsStage).toBeDefined()
      expect(embeddingsStage.details).toContain('Regenerating embeddings')
    })
  })

  describe('Scenario 4: Schema validation failure', () => {
    it('should fail with error when version is unsupported', async () => {
      // Arrange
      const invalidChunksData = {
        version: '2.0',  // Unsupported version
        document_id: 'doc-456',
        processing_mode: 'cloud',
        created_at: new Date().toISOString(),
        chunks: []
      }

      ;(storageHelpers.readFromStorage as jest.Mock).mockResolvedValue(invalidChunksData)

      // Capture error
      let capturedError: any = null
      mockSupabase.from = jest.fn((table: string) => {
        if (table === 'background_jobs') {
          return {
            update: jest.fn((data: any) => {
              if (data.status === 'failed') {
                capturedError = data.last_error
              }
              return {
                eq: jest.fn(() => Promise.resolve({ error: null }))
              }
            })
          }
        }
        return {
          update: jest.fn(() => ({ eq: jest.fn(() => Promise.resolve({ error: null })) })),
          delete: jest.fn(() => ({ eq: jest.fn(() => Promise.resolve({ error: null })) })),
          insert: jest.fn(() => Promise.resolve({ error: null }))
        }
      })

      // Act & Assert
      await expect(importDocumentHandler(mockSupabase, mockJob)).rejects.toThrow('Unsupported chunks.json version: 2.0')
      expect(capturedError).toContain('Unsupported chunks.json version')
    })
  })

  describe('Skip strategy', () => {
    it('should perform no operations and return 0 imported count', async () => {
      // Arrange
      mockJob.input_data.strategy = 'skip'

      const mockChunksData: ChunksExport = {
        version: '1.0',
        document_id: 'doc-456',
        processing_mode: 'cloud',
        created_at: new Date().toISOString(),
        chunks: [{ content: 'Chunk 1', chunk_index: 0 }]
      }

      ;(storageHelpers.readFromStorage as jest.Mock).mockResolvedValue(mockChunksData)

      // Track database operations
      const deleteCallCount = jest.fn()
      const insertCallCount = jest.fn()
      const updateCallCount = jest.fn()

      mockSupabase.from = jest.fn((table: string) => {
        if (table === 'chunks') {
          return {
            delete: jest.fn(() => {
              deleteCallCount()
              return { eq: jest.fn(() => Promise.resolve({ error: null })) }
            }),
            insert: jest.fn(() => {
              insertCallCount()
              return Promise.resolve({ error: null })
            }),
            update: jest.fn(() => {
              updateCallCount()
              return { eq: jest.fn(() => ({ eq: jest.fn(() => Promise.resolve({ error: null })) })) }
            })
          }
        }
        return {
          update: jest.fn(() => ({ eq: jest.fn(() => Promise.resolve({ error: null })) }))
        }
      })

      // Act
      await importDocumentHandler(mockSupabase, mockJob)

      // Assert: No database operations on chunks
      expect(deleteCallCount).not.toHaveBeenCalled()
      expect(insertCallCount).not.toHaveBeenCalled()
      expect(updateCallCount).not.toHaveBeenCalled()
    })
  })
})
