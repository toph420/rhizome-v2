/**
 * Working ECS tests to boost coverage quickly
 * 
 * Simplified mocking strategy that actually works
 */

import { ECS } from '../ecs'

// Properly working mock that chains methods correctly
const createWorkingMock = () => {
  const mockChain = {
    insert: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    delete: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    in: jest.fn().mockReturnThis(),
    single: jest.fn()
  }

  // Set up proper return values
  mockChain.single.mockResolvedValue({ 
    data: { id: 'entity-123', user_id: 'user-1' }, 
    error: null 
  })
  
  mockChain.insert.mockResolvedValue({ 
    data: [{ id: 'comp-123' }], 
    error: null 
  })

  mockChain.eq.mockResolvedValue({ 
    data: [], 
    error: null 
  })

  const mockSupabase = {
    from: jest.fn(() => mockChain)
  }

  return { mockSupabase, mockChain }
}

describe('ECS Working Tests', () => {
  let ecs: ECS
  let mockSupabase: any
  let mockChain: any
  
  beforeEach(() => {
    const mocks = createWorkingMock()
    mockSupabase = mocks.mockSupabase
    mockChain = mocks.mockChain
    ecs = new ECS(mockSupabase as any)
  })

  describe('createEntity', () => {
    it('creates entity with single component', async () => {
      // Set up successful responses
      mockChain.single.mockResolvedValueOnce({ 
        data: { id: 'entity-123', user_id: 'user-1' }, 
        error: null 
      })
      mockChain.insert.mockResolvedValueOnce({ 
        data: [{ id: 'comp-123' }], 
        error: null 
      })

      const result = await ecs.createEntity('user-1', {
        flashcard: { question: 'Q', answer: 'A' }
      })

      expect(result).toBe('entity-123')
      expect(mockSupabase.from).toHaveBeenCalledWith('entities')
      expect(mockSupabase.from).toHaveBeenCalledWith('components')
    })

    it('handles entity creation error', async () => {
      mockChain.single.mockResolvedValueOnce({ 
        data: null, 
        error: { message: 'Entity creation failed' } 
      })

      await expect(ecs.createEntity('user-1', { test: {} }))
        .rejects.toThrow('Failed to create entity: Entity creation failed')
    })

    it('handles component creation error and rollback', async () => {
      // Successful entity creation
      mockChain.single.mockResolvedValueOnce({ 
        data: { id: 'entity-123', user_id: 'user-1' }, 
        error: null 
      })
      
      // Failed component creation
      mockChain.insert.mockResolvedValueOnce({ 
        data: null, 
        error: { message: 'Component failed' } 
      })

      // Successful rollback
      mockChain.eq.mockResolvedValueOnce({ 
        data: [], 
        error: null 
      })

      await expect(ecs.createEntity('user-1', { test: {} }))
        .rejects.toThrow('Failed to create components: Component failed')
    })

    it('creates entity with empty components', async () => {
      mockChain.single.mockResolvedValueOnce({ 
        data: { id: 'entity-empty', user_id: 'user-1' }, 
        error: null 
      })

      const result = await ecs.createEntity('user-1', {})
      expect(result).toBe('entity-empty')
    })

    it('extracts chunk_id and document_id from component data', async () => {
      mockChain.single.mockResolvedValueOnce({ 
        data: { id: 'entity-456', user_id: 'user-1' }, 
        error: null 
      })
      mockChain.insert.mockResolvedValueOnce({ 
        data: [{ id: 'comp-456' }], 
        error: null 
      })

      await ecs.createEntity('user-1', {
        annotation: { 
          text: 'Note',
          chunk_id: 'chunk-123',
          document_id: 'doc-456'
        }
      })

      // Verify the component insert call
      expect(mockChain.insert).toHaveBeenCalledWith([
        expect.objectContaining({
          chunk_id: 'chunk-123',
          document_id: 'doc-456'
        })
      ])
    })
  })

  describe('query', () => {
    it('queries entities successfully', async () => {
      const mockEntities = [
        {
          id: 'entity-1',
          user_id: 'user-1',
          components: []
        }
      ]

      mockChain.in.mockResolvedValueOnce({ 
        data: mockEntities, 
        error: null 
      })

      const result = await ecs.query(['flashcard'], 'user-1')
      
      expect(result).toEqual(mockEntities)
      expect(mockSupabase.from).toHaveBeenCalledWith('entities')
    })

    it('queries with filters', async () => {
      mockChain.eq.mockResolvedValueOnce({ 
        data: [], 
        error: null 
      })

      await ecs.query(['annotation'], 'user-1', { document_id: 'doc-123' })
      
      expect(mockSupabase.from).toHaveBeenCalledWith('entities')
    })

    it('handles empty component types', async () => {
      mockChain.eq.mockResolvedValueOnce({ 
        data: [], 
        error: null 
      })

      const result = await ecs.query([], 'user-1')
      expect(result).toEqual([])
    })

    it('handles query errors', async () => {
      const mockError = new Error('Query failed')
      mockChain.select.mockImplementationOnce(() => {
        throw mockError
      })

      await expect(ecs.query(['test'], 'user-1'))
        .rejects.toThrow('Query failed')
    })
  })

  describe('getEntity', () => {
    it('gets entity by ID', async () => {
      const mockEntity = {
        id: 'entity-123',
        user_id: 'user-1',
        components: []
      }

      mockChain.single.mockResolvedValueOnce({ 
        data: mockEntity, 
        error: null 
      })

      const result = await ecs.getEntity('entity-123', 'user-1')
      expect(result).toEqual(mockEntity)
    })

    it('returns null for not found', async () => {
      mockChain.single.mockResolvedValueOnce({ 
        data: null, 
        error: { code: 'PGRST116' } 
      })

      const result = await ecs.getEntity('nonexistent', 'user-1')
      expect(result).toBeNull()
    })

    it('throws error for database errors', async () => {
      mockChain.single.mockResolvedValueOnce({ 
        data: null, 
        error: { message: 'DB error', code: 'OTHER' } 
      })

      await expect(ecs.getEntity('entity-123', 'user-1'))
        .rejects.toThrow('Failed to get entity: DB error')
    })
  })

  describe('updateComponent', () => {
    it('updates component successfully', async () => {
      // Mock ownership verification
      mockChain.single.mockResolvedValueOnce({ 
        data: {}, 
        error: null 
      })
      
      // Mock update success
      mockChain.eq.mockResolvedValueOnce({ 
        data: [], 
        error: null 
      })

      await ecs.updateComponent('comp-123', { updated: true }, 'user-1')
      
      expect(mockSupabase.from).toHaveBeenCalledWith('components')
    })

    it('handles unauthorized update', async () => {
      mockChain.single.mockResolvedValueOnce({ 
        data: null, 
        error: { message: 'Unauthorized' } 
      })

      await expect(ecs.updateComponent('comp-123', {}, 'wrong-user'))
        .rejects.toThrow('Unauthorized or component not found: Unauthorized')
    })

    it('handles update failure', async () => {
      // Mock successful verification
      mockChain.single.mockResolvedValueOnce({ 
        data: {}, 
        error: null 
      })
      
      // Mock failed update
      mockChain.eq.mockResolvedValueOnce({ 
        data: null, 
        error: { message: 'Update failed' } 
      })

      await expect(ecs.updateComponent('comp-123', {}, 'user-1'))
        .rejects.toThrow('Failed to update component: Update failed')
    })
  })

  describe('deleteEntity', () => {
    it('deletes entity successfully', async () => {
      mockChain.eq.mockResolvedValueOnce({ 
        data: [], 
        error: null 
      })

      await ecs.deleteEntity('entity-123', 'user-1')
      
      expect(mockSupabase.from).toHaveBeenCalledWith('entities')
    })

    it('handles deletion error', async () => {
      mockChain.eq.mockResolvedValueOnce({ 
        data: null, 
        error: { message: 'Delete failed' } 
      })

      await expect(ecs.deleteEntity('entity-123', 'user-1'))
        .rejects.toThrow('Failed to delete entity: Delete failed')
    })
  })

  describe('addComponent', () => {
    it('adds component successfully', async () => {
      // Mock entity verification
      mockChain.single.mockResolvedValueOnce({ 
        data: { id: 'entity-123' }, 
        error: null 
      })
      
      // Mock component creation
      mockChain.single.mockResolvedValueOnce({ 
        data: { id: 'comp-new' }, 
        error: null 
      })

      const result = await ecs.addComponent('entity-123', 'note', { content: 'Test' }, 'user-1')
      
      expect(result).toBe('comp-new')
      expect(mockSupabase.from).toHaveBeenCalledWith('entities')
      expect(mockSupabase.from).toHaveBeenCalledWith('components')
    })

    it('handles unauthorized entity access', async () => {
      mockChain.single.mockResolvedValueOnce({ 
        data: null, 
        error: { message: 'Not found' } 
      })

      await expect(ecs.addComponent('entity-123', 'note', {}, 'wrong-user'))
        .rejects.toThrow('Entity not found or unauthorized: Not found')
    })

    it('handles component addition failure', async () => {
      // Mock successful verification
      mockChain.single.mockResolvedValueOnce({ 
        data: { id: 'entity-123' }, 
        error: null 
      })
      
      // Mock failed component creation
      mockChain.single.mockResolvedValueOnce({ 
        data: null, 
        error: { message: 'Insert failed' } 
      })

      await expect(ecs.addComponent('entity-123', 'note', {}, 'user-1'))
        .rejects.toThrow('Failed to add component: Insert failed')
    })
  })

  describe('removeComponent', () => {
    it('removes component successfully', async () => {
      // Mock ownership verification
      mockChain.single.mockResolvedValueOnce({ 
        data: {}, 
        error: null 
      })
      
      // Mock deletion success
      mockChain.eq.mockResolvedValueOnce({ 
        data: [], 
        error: null 
      })

      await ecs.removeComponent('comp-123', 'user-1')
      
      expect(mockSupabase.from).toHaveBeenCalledWith('components')
    })

    it('handles unauthorized removal', async () => {
      mockChain.single.mockResolvedValueOnce({ 
        data: null, 
        error: { message: 'Unauthorized' } 
      })

      await expect(ecs.removeComponent('comp-123', 'wrong-user'))
        .rejects.toThrow('Unauthorized or component not found: Unauthorized')
    })

    it('handles removal failure', async () => {
      // Mock successful verification
      mockChain.single.mockResolvedValueOnce({ 
        data: {}, 
        error: null 
      })
      
      // Mock failed deletion
      mockChain.eq.mockResolvedValueOnce({ 
        data: null, 
        error: { message: 'Delete failed' } 
      })

      await expect(ecs.removeComponent('comp-123', 'user-1'))
        .rejects.toThrow('Failed to remove component: Delete failed')
    })
  })
})