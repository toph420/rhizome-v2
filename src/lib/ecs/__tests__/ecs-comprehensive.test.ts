/**
 * Comprehensive ECS tests to boost coverage from 1.75% to 60%+
 * 
 * Tests all methods in the ECS class with proper mocking
 */

import { ECS } from '../ecs'
import type { ComponentData } from '../ecs'

// Create comprehensive mock for Supabase
const createMockResponse = (data: any, error: any = null) => ({ data, error })

const createComprehensiveMock = () => {
  const mockSupabase = {
    from: jest.fn((table: string) => {
      const mockQuery = {
        insert: jest.fn(() => mockQuery),
        select: jest.fn(() => mockQuery),
        update: jest.fn(() => mockQuery),
        delete: jest.fn(() => mockQuery),
        eq: jest.fn(() => mockQuery),
        in: jest.fn(() => mockQuery),
        single: jest.fn(() => createMockResponse({ id: 'test-123' }))
      }
      
      // Default to success responses
      mockQuery.insert.mockResolvedValue(createMockResponse([{ id: 'entity-123' }]))
      mockQuery.select.mockResolvedValue(createMockResponse([]))
      mockQuery.update.mockResolvedValue(createMockResponse([]))
      mockQuery.delete.mockResolvedValue(createMockResponse([]))
      
      return mockQuery
    })
  }
  return mockSupabase
}

describe('ECS Comprehensive Tests', () => {
  let ecs: ECS
  let mockSupabase: any
  
  beforeEach(() => {
    jest.clearAllMocks()
    mockSupabase = createComprehensiveMock()
    ecs = new ECS(mockSupabase as any)
  })

  describe('createEntity method', () => {
    it('creates entity with components successfully', async () => {
      // Mock entity creation
      const entityMock = mockSupabase.from('entities')
      entityMock.insert.mockReturnValue({
        select: jest.fn(() => ({
          single: jest.fn(() => createMockResponse({ id: 'entity-123', user_id: 'user-1' }))
        }))
      })

      // Mock component creation
      const componentMock = mockSupabase.from('components')
      componentMock.insert.mockResolvedValue(createMockResponse([{ id: 'comp-123' }]))

      const components = {
        flashcard: { question: 'Test', answer: 'Answer' }
      }

      const result = await ecs.createEntity('user-1', components)
      
      expect(result).toBe('entity-123')
      expect(mockSupabase.from).toHaveBeenCalledWith('entities')
      expect(mockSupabase.from).toHaveBeenCalledWith('components')
    })

    it('handles empty components object', async () => {
      const entityMock = mockSupabase.from('entities')
      entityMock.insert.mockReturnValue({
        select: jest.fn(() => ({
          single: jest.fn(() => createMockResponse({ id: 'entity-empty', user_id: 'user-1' }))
        }))
      })

      const result = await ecs.createEntity('user-1', {})
      expect(result).toBe('entity-empty')
    })

    it('extracts chunk_id and document_id from component data', async () => {
      const entityMock = mockSupabase.from('entities')
      entityMock.insert.mockReturnValue({
        select: jest.fn(() => ({
          single: jest.fn(() => createMockResponse({ id: 'entity-456', user_id: 'user-1' }))
        }))
      })

      const componentMock = mockSupabase.from('components')
      const mockInsert = jest.fn().mockResolvedValue(createMockResponse([{ id: 'comp-456' }]))
      componentMock.insert = mockInsert

      const components = {
        annotation: { 
          text: 'Note',
          chunk_id: 'chunk-123',
          document_id: 'doc-456'
        }
      }

      await ecs.createEntity('user-1', components)
      
      expect(mockInsert).toHaveBeenCalledWith([
        expect.objectContaining({
          chunk_id: 'chunk-123',
          document_id: 'doc-456'
        })
      ])
    })

    it('performs rollback on component creation failure', async () => {
      const entityMock = mockSupabase.from('entities')
      entityMock.insert.mockReturnValue({
        select: jest.fn(() => ({
          single: jest.fn(() => createMockResponse({ id: 'entity-rollback', user_id: 'user-1' }))
        }))
      })

      const componentMock = mockSupabase.from('components')
      componentMock.insert.mockResolvedValue(createMockResponse(null, { message: 'Component error' }))

      const deleteMock = jest.fn().mockReturnValue({
        eq: jest.fn().mockResolvedValue(createMockResponse([]))
      })
      entityMock.delete = deleteMock

      await expect(ecs.createEntity('user-1', { test: {} }))
        .rejects.toThrow('Failed to create components: Component error')

      expect(deleteMock).toHaveBeenCalled()
    })
  })

  describe('query method', () => {
    it('constructs query with component types filter', async () => {
      const mockQuery = mockSupabase.from('entities')
      const mockIn = jest.fn().mockResolvedValue(createMockResponse([]))
      mockQuery.select.mockReturnValue({
        eq: jest.fn(() => ({
          in: mockIn
        }))
      })

      await ecs.query(['flashcard', 'study'], 'user-1')
      
      expect(mockQuery.select).toHaveBeenCalled()
      expect(mockIn).toHaveBeenCalledWith('components.component_type', ['flashcard', 'study'])
    })

    it('applies document_id filter when provided', async () => {
      const mockQuery = mockSupabase.from('entities')
      const mockEq = jest.fn().mockResolvedValue(createMockResponse([]))
      mockQuery.select.mockReturnValue({
        eq: jest.fn(() => ({
          in: jest.fn(() => ({
            eq: mockEq
          }))
        }))
      })

      await ecs.query(['annotation'], 'user-1', { document_id: 'doc-123' })
      
      expect(mockEq).toHaveBeenCalledWith('components.document_id', 'doc-123')
    })

    it('applies chunk_id filter when provided', async () => {
      const mockQuery = mockSupabase.from('entities')
      const mockEq = jest.fn().mockResolvedValue(createMockResponse([]))
      mockQuery.select.mockReturnValue({
        eq: jest.fn(() => ({
          in: jest.fn(() => ({
            eq: mockEq
          }))
        }))
      })

      await ecs.query(['annotation'], 'user-1', { chunk_id: 'chunk-456' })
      
      expect(mockEq).toHaveBeenCalledWith('components.chunk_id', 'chunk-456')
    })

    it('handles empty component types array', async () => {
      const mockQuery = mockSupabase.from('entities')
      mockQuery.select.mockReturnValue({
        eq: jest.fn().mockResolvedValue(createMockResponse([]))
      })

      const result = await ecs.query([], 'user-1')
      expect(result).toEqual([])
    })

    it('throws error on query failure', async () => {
      const mockQuery = mockSupabase.from('entities')
      mockQuery.select.mockReturnValue({
        eq: jest.fn().mockResolvedValue(createMockResponse(null, { message: 'Query failed' }))
      })

      await expect(ecs.query(['test'], 'user-1'))
        .rejects.toThrow('Failed to query entities: Query failed')
    })
  })

  describe('getEntity method', () => {
    it('retrieves single entity by ID', async () => {
      const mockEntity = {
        id: 'entity-123',
        user_id: 'user-1',
        created_at: '2025-01-30T10:00:00Z',
        updated_at: '2025-01-30T10:00:00Z',
        components: []
      }

      const mockQuery = mockSupabase.from('entities')
      mockQuery.select.mockReturnValue({
        eq: jest.fn(() => ({
          eq: jest.fn(() => ({
            single: jest.fn(() => createMockResponse(mockEntity))
          }))
        }))
      })

      const result = await ecs.getEntity('entity-123', 'user-1')
      expect(result).toEqual(mockEntity)
    })

    it('returns null for not found entity (PGRST116)', async () => {
      const mockQuery = mockSupabase.from('entities')
      mockQuery.select.mockReturnValue({
        eq: jest.fn(() => ({
          eq: jest.fn(() => ({
            single: jest.fn(() => createMockResponse(null, { code: 'PGRST116' }))
          }))
        }))
      })

      const result = await ecs.getEntity('nonexistent', 'user-1')
      expect(result).toBeNull()
    })

    it('throws error for other database errors', async () => {
      const mockQuery = mockSupabase.from('entities')
      mockQuery.select.mockReturnValue({
        eq: jest.fn(() => ({
          eq: jest.fn(() => ({
            single: jest.fn(() => createMockResponse(null, { message: 'DB error', code: 'OTHER' }))
          }))
        }))
      })

      await expect(ecs.getEntity('entity-123', 'user-1'))
        .rejects.toThrow('Failed to get entity: DB error')
    })
  })

  describe('updateComponent method', () => {
    it('verifies ownership before updating', async () => {
      const mockQuery = mockSupabase.from('components')
      
      // Mock ownership verification
      const mockVerify = jest.fn(() => ({
        eq: jest.fn(() => ({
          eq: jest.fn(() => ({
            single: jest.fn(() => createMockResponse({ entity: { user_id: 'user-1' } }))
          }))
        }))
      }))
      
      // Mock update operation
      const mockUpdate = jest.fn(() => ({
        eq: jest.fn(() => createMockResponse([]))
      }))

      mockQuery.select.mockReturnValue(mockVerify())
      mockQuery.update.mockReturnValue(mockUpdate())

      await ecs.updateComponent('comp-123', { updated: true }, 'user-1')
      
      expect(mockQuery.select).toHaveBeenCalled()
      expect(mockQuery.update).toHaveBeenCalledWith({ data: { updated: true } })
    })

    it('throws error on unauthorized update', async () => {
      const mockQuery = mockSupabase.from('components')
      mockQuery.select.mockReturnValue({
        eq: jest.fn(() => ({
          eq: jest.fn(() => ({
            single: jest.fn(() => createMockResponse(null, { message: 'Unauthorized' }))
          }))
        }))
      })

      await expect(ecs.updateComponent('comp-123', {}, 'wrong-user'))
        .rejects.toThrow('Unauthorized or component not found: Unauthorized')
    })

    it('throws error on update failure', async () => {
      const mockQuery = mockSupabase.from('components')
      
      // Mock successful verification
      mockQuery.select.mockReturnValue({
        eq: jest.fn(() => ({
          eq: jest.fn(() => ({
            single: jest.fn(() => createMockResponse({}))
          }))
        }))
      })

      // Mock failed update
      mockQuery.update.mockReturnValue({
        eq: jest.fn(() => createMockResponse(null, { message: 'Update failed' }))
      })

      await expect(ecs.updateComponent('comp-123', {}, 'user-1'))
        .rejects.toThrow('Failed to update component: Update failed')
    })
  })

  describe('deleteEntity method', () => {
    it('deletes entity with user validation', async () => {
      const mockQuery = mockSupabase.from('entities')
      const mockDelete = jest.fn(() => ({
        eq: jest.fn(() => createMockResponse([]))
      }))
      mockQuery.delete.mockReturnValue(mockDelete())

      await ecs.deleteEntity('entity-123', 'user-1')
      
      expect(mockQuery.delete).toHaveBeenCalled()
      expect(mockDelete().eq).toHaveBeenCalledWith('id', 'entity-123')
    })

    it('throws error on delete failure', async () => {
      const mockQuery = mockSupabase.from('entities')
      mockQuery.delete.mockReturnValue({
        eq: jest.fn(() => createMockResponse(null, { message: 'Delete failed' }))
      })

      await expect(ecs.deleteEntity('entity-123', 'user-1'))
        .rejects.toThrow('Failed to delete entity: Delete failed')
    })
  })

  describe('addComponent method', () => {
    it('verifies entity ownership before adding component', async () => {
      const mockQuery = mockSupabase.from('entities')
      
      // Mock ownership verification
      mockQuery.select.mockReturnValue({
        eq: jest.fn(() => ({
          eq: jest.fn(() => ({
            single: jest.fn(() => createMockResponse({ id: 'entity-123' }))
          }))
        }))
      })

      // Mock component insertion
      const mockComponentQuery = mockSupabase.from('components')
      mockComponentQuery.insert.mockReturnValue({
        select: jest.fn(() => ({
          single: jest.fn(() => createMockResponse({ id: 'comp-new' }))
        }))
      })

      const result = await ecs.addComponent('entity-123', 'note', { content: 'Test' }, 'user-1')
      
      expect(result).toBe('comp-new')
      expect(mockQuery.select).toHaveBeenCalled()
      expect(mockComponentQuery.insert).toHaveBeenCalled()
    })

    it('throws error for unauthorized entity access', async () => {
      const mockQuery = mockSupabase.from('entities')
      mockQuery.select.mockReturnValue({
        eq: jest.fn(() => ({
          eq: jest.fn(() => ({
            single: jest.fn(() => createMockResponse(null, { message: 'Not found' }))
          }))
        }))
      })

      await expect(ecs.addComponent('entity-123', 'note', {}, 'wrong-user'))
        .rejects.toThrow('Entity not found or unauthorized: Not found')
    })

    it('extracts chunk_id and document_id from component data', async () => {
      const mockQuery = mockSupabase.from('entities')
      mockQuery.select.mockReturnValue({
        eq: jest.fn(() => ({
          eq: jest.fn(() => ({
            single: jest.fn(() => createMockResponse({ id: 'entity-123' }))
          }))
        }))
      })

      const mockComponentQuery = mockSupabase.from('components')
      const mockInsert = jest.fn(() => ({
        select: jest.fn(() => ({
          single: jest.fn(() => createMockResponse({ id: 'comp-new' }))
        }))
      }))
      mockComponentQuery.insert = mockInsert

      await ecs.addComponent('entity-123', 'annotation', { 
        text: 'Note',
        chunk_id: 'chunk-789',
        document_id: 'doc-123'
      }, 'user-1')
      
      expect(mockInsert).toHaveBeenCalledWith({
        entity_id: 'entity-123',
        component_type: 'annotation',
        data: { text: 'Note', chunk_id: 'chunk-789', document_id: 'doc-123' },
        chunk_id: 'chunk-789',
        document_id: 'doc-123'
      })
    })

    it('handles component insertion failure', async () => {
      const mockQuery = mockSupabase.from('entities')
      mockQuery.select.mockReturnValue({
        eq: jest.fn(() => ({
          eq: jest.fn(() => ({
            single: jest.fn(() => createMockResponse({ id: 'entity-123' }))
          }))
        }))
      })

      const mockComponentQuery = mockSupabase.from('components')
      mockComponentQuery.insert.mockReturnValue({
        select: jest.fn(() => ({
          single: jest.fn(() => createMockResponse(null, { message: 'Insert failed' }))
        }))
      })

      await expect(ecs.addComponent('entity-123', 'note', {}, 'user-1'))
        .rejects.toThrow('Failed to add component: Insert failed')
    })
  })

  describe('removeComponent method', () => {
    it('verifies ownership before removing component', async () => {
      const mockQuery = mockSupabase.from('components')
      
      // Mock ownership verification
      mockQuery.select.mockReturnValue({
        eq: jest.fn(() => ({
          eq: jest.fn(() => ({
            single: jest.fn(() => createMockResponse({ entity: { user_id: 'user-1' } }))
          }))
        }))
      })

      // Mock component deletion
      mockQuery.delete.mockReturnValue({
        eq: jest.fn(() => createMockResponse([]))
      })

      await ecs.removeComponent('comp-123', 'user-1')
      
      expect(mockQuery.select).toHaveBeenCalled()
      expect(mockQuery.delete).toHaveBeenCalled()
    })

    it('throws error on unauthorized removal', async () => {
      const mockQuery = mockSupabase.from('components')
      mockQuery.select.mockReturnValue({
        eq: jest.fn(() => ({
          eq: jest.fn(() => ({
            single: jest.fn(() => createMockResponse(null, { message: 'Unauthorized' }))
          }))
        }))
      })

      await expect(ecs.removeComponent('comp-123', 'wrong-user'))
        .rejects.toThrow('Unauthorized or component not found: Unauthorized')
    })

    it('throws error on removal failure', async () => {
      const mockQuery = mockSupabase.from('components')
      
      // Mock successful verification
      mockQuery.select.mockReturnValue({
        eq: jest.fn(() => ({
          eq: jest.fn(() => ({
            single: jest.fn(() => createMockResponse({}))
          }))
        }))
      })

      // Mock failed deletion
      mockQuery.delete.mockReturnValue({
        eq: jest.fn(() => createMockResponse(null, { message: 'Delete failed' }))
      })

      await expect(ecs.removeComponent('comp-123', 'user-1'))
        .rejects.toThrow('Failed to remove component: Delete failed')
    })
  })

  describe('Edge Cases and Data Handling', () => {
    it('handles null and undefined in component data', async () => {
      const entityMock = mockSupabase.from('entities')
      entityMock.insert.mockReturnValue({
        select: jest.fn(() => ({
          single: jest.fn(() => createMockResponse({ id: 'entity-null', user_id: 'user-1' }))
        }))
      })

      const componentMock = mockSupabase.from('components')
      const mockInsert = jest.fn().mockResolvedValue(createMockResponse([{ id: 'comp-null' }]))
      componentMock.insert = mockInsert

      const components = {
        test: {
          nullValue: null,
          undefinedValue: undefined,
          chunk_id: null,
          document_id: undefined
        }
      }

      await ecs.createEntity('user-1', components)
      
      expect(mockInsert).toHaveBeenCalledWith([
        expect.objectContaining({
          chunk_id: null,
          document_id: null
        })
      ])
    })

    it('handles complex nested component data', async () => {
      const entityMock = mockSupabase.from('entities')
      entityMock.insert.mockReturnValue({
        select: jest.fn(() => ({
          single: jest.fn(() => createMockResponse({ id: 'entity-complex', user_id: 'user-1' }))
        }))
      })

      const componentMock = mockSupabase.from('components')
      componentMock.insert.mockResolvedValue(createMockResponse([{ id: 'comp-complex' }]))

      const complexData = {
        nested: {
          array: [1, 2, 3],
          object: { key: 'value' },
          boolean: true,
          number: 42
        }
      }

      const result = await ecs.createEntity('user-1', { complex: complexData })
      expect(result).toBe('entity-complex')
    })

    it('preserves data types in component updates', async () => {
      const mockQuery = mockSupabase.from('components')
      
      mockQuery.select.mockReturnValue({
        eq: jest.fn(() => ({
          eq: jest.fn(() => ({
            single: jest.fn(() => createMockResponse({}))
          }))
        }))
      })

      const mockUpdate = jest.fn(() => ({
        eq: jest.fn(() => createMockResponse([]))
      }))
      mockQuery.update = mockUpdate

      const updateData = {
        number: 123,
        boolean: false,
        array: ['a', 'b', 'c'],
        object: { nested: true }
      }

      await ecs.updateComponent('comp-123', updateData, 'user-1')
      
      expect(mockUpdate).toHaveBeenCalledWith({ data: updateData })
    })
  })
})