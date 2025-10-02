/**
 * Comprehensive tests for ECS (Entity-Component-System) module.
 * 
 * Focus: Core business logic with 1.75% coverage → 80%+ coverage
 * Covers: Entity CRUD, Component management, Query system, User isolation
 */

import { ECS } from '../ecs'
import type { ComponentData, Component, Entity } from '../ecs'

// Mock Supabase client with comprehensive method chaining
const createMockSupabase = () => {
  const mockSupabase = {
    from: jest.fn(() => ({
      insert: jest.fn(() => ({
        select: jest.fn(() => ({
          single: jest.fn(() => ({ 
            data: { id: 'test-entity-123', user_id: 'user-1' }, 
            error: null 
          }))
        }))
      })),
      select: jest.fn(() => ({
        eq: jest.fn(() => ({
          single: jest.fn(() => ({ 
            data: { 
              id: 'test-entity-123', 
              user_id: 'user-1',
              created_at: '2025-01-30T10:00:00Z',
              updated_at: '2025-01-30T10:00:00Z',
              components: []
            }, 
            error: null 
          })),
          then: jest.fn(() => Promise.resolve({ 
            data: [], 
            error: null 
          }))
        })),
        in: jest.fn(() => ({
          eq: jest.fn(() => ({ 
            data: [], 
            error: null 
          }))
        })),
        then: jest.fn(() => Promise.resolve({ 
          data: [], 
          error: null 
        }))
      })),
      update: jest.fn(() => ({
        eq: jest.fn(() => ({ 
          data: [{ 
            id: 'comp-123', 
            data: { updated: true } 
          }], 
          error: null 
        }))
      })),
      delete: jest.fn(() => ({
        eq: jest.fn(() => ({ 
          data: [], 
          error: null 
        }))
      }))
    }))
  }
  return mockSupabase
}

describe('ECS (Entity-Component-System)', () => {
  let ecs: ECS
  let mockSupabase: any
  
  beforeEach(() => {
    jest.clearAllMocks()
    mockSupabase = createMockSupabase()
    ecs = new ECS(mockSupabase as any)
  })

  describe('createEntity', () => {
    it('should create entity with single component', async () => {
      // Mock successful entity creation
      const entityResponse = {
        data: { id: 'entity-123', user_id: 'user-1' },
        error: null
      }
      const componentResponse = { data: [{ id: 'comp-123' }], error: null }

      mockSupabase.from
        .mockReturnValueOnce({
          insert: jest.fn(() => ({
            select: jest.fn(() => ({
              single: jest.fn(() => entityResponse)
            }))
          }))
        })
        .mockReturnValueOnce({
          insert: jest.fn(() => componentResponse)
        })

      const components = {
        flashcard: {
          question: 'What is ECS?',
          answer: 'Entity-Component-System'
        }
      }

      const entityId = await ecs.createEntity('user-1', components)

      expect(entityId).toBe('entity-123')
      expect(mockSupabase.from).toHaveBeenCalledWith('entities')
      expect(mockSupabase.from).toHaveBeenCalledWith('components')
    })

    it('should handle entity creation errors', async () => {
      mockSupabase.from.mockReturnValueOnce({
        insert: jest.fn(() => ({
          select: jest.fn(() => ({
            single: jest.fn(() => ({ 
              data: null, 
              error: { message: 'User not found' } 
            }))
          }))
        }))
      })

      const components = { flashcard: { question: 'Test', answer: 'Test' } }

      await expect(ecs.createEntity('invalid-user', components))
        .rejects.toThrow('Failed to create entity: User not found')
    })

    it('should rollback on component creation failure', async () => {
      // Mock successful entity creation
      const entityResponse = {
        data: { id: 'entity-789', user_id: 'user-1' },
        error: null
      }
      
      mockSupabase.from
        .mockReturnValueOnce({
          insert: jest.fn(() => ({
            select: jest.fn(() => ({
              single: jest.fn(() => entityResponse)
            }))
          }))
        })
        .mockReturnValueOnce({
          insert: jest.fn(() => ({ 
            data: null, 
            error: { message: 'Invalid component data' } 
          }))
        })
        .mockReturnValueOnce({
          delete: jest.fn(() => ({
            eq: jest.fn(() => ({ data: [], error: null }))
          }))
        })

      const components = { flashcard: { question: '', answer: '' } }

      await expect(ecs.createEntity('user-1', components))
        .rejects.toThrow('Failed to create components: Invalid component data')
    })
  })

  describe('2. Querying Entities by Component Types', () => {
    it('queries entities with specific component types', async () => {
      const entities = await ecs.query(['flashcard', 'study'], testUserId)

      expect(entities).toHaveLength(1)
      expect(entities[0].id).toBe('entity-001')
      expect(entities[0].components).toHaveLength(1)
      expect(entities[0].components[0].component_type).toBe('flashcard')
    })

    it('filters by additional criteria', async () => {
      const entities = await ecs.query(
        ['flashcard'],
        testUserId,
        { document_id: 'doc-001' }
      )

      expect(mockSupabase.from('entities').select).toHaveBeenCalled()
      expect(mockSupabase.from('entities').eq).toHaveBeenCalledWith('user_id', testUserId)
    })

    it('returns empty array when no entities match', async () => {
      mockSupabase.from('entities').select.mockResolvedValue({
        data: [],
        error: null
      })

      const entities = await ecs.query(['nonexistent'], testUserId)

      expect(entities).toHaveLength(0)
    })
  })

  describe('3. Updating Components', () => {
    it('updates a single component', async () => {
      const componentId = 'comp-001'
      const updates = { ease: 3.0, interval: 2 }

      await ecs.updateComponent(componentId, updates, testUserId)

      expect(mockSupabase.from('components').update).toHaveBeenCalledWith({
        data: updates,
        updated_at: expect.any(Date)
      })
      expect(mockSupabase.from('components').eq).toHaveBeenCalledWith('id', componentId)
    })

    it('validates user ownership before updating', async () => {
      // Mock ownership check
      mockSupabase.from('components').select.mockResolvedValue({
        data: [{ entity: { user_id: 'different-user' } }],
        error: null
      })

      await expect(
        ecs.updateComponent('comp-001', { data: 'new' }, testUserId)
      ).rejects.toThrow('Unauthorized')
    })

    it('handles update failures', async () => {
      mockSupabase.from('components').update.mockResolvedValue({
        data: null,
        error: { message: 'Update failed' }
      })

      await expect(
        ecs.updateComponent('comp-001', { data: 'new' }, testUserId)
      ).rejects.toThrow('Update failed')
    })
  })

  describe('4. Managing Entity Lifecycle', () => {
    it('deletes an entity and all its components', async () => {
      await ecs.deleteEntity('entity-001', testUserId)

      // Should delete components first
      expect(mockSupabase.from('components').delete).toHaveBeenCalled()
      expect(mockSupabase.from('components').eq).toHaveBeenCalledWith('entity_id', 'entity-001')

      // Then delete entity
      expect(mockSupabase.from('entities').delete).toHaveBeenCalled()
      expect(mockSupabase.from('entities').eq).toHaveBeenCalledWith('id', 'entity-001')
    })

    it('adds a component to existing entity', async () => {
      const newComponent = {
        component_type: 'annotation',
        data: { text: 'Note text', range: { start: 0, end: 10 } }
      }

      await ecs.addComponent('entity-001', newComponent, testUserId)

      expect(mockSupabase.from('components').insert).toHaveBeenCalledWith({
        entity_id: 'entity-001',
        ...newComponent,
        created_at: expect.any(Date),
        updated_at: expect.any(Date)
      })
    })

    it('removes a component from entity', async () => {
      await ecs.removeComponent('comp-001', testUserId)

      expect(mockSupabase.from('components').delete).toHaveBeenCalled()
      expect(mockSupabase.from('components').eq).toHaveBeenCalledWith('id', 'comp-001')
    })
  })

  describe('5. Enforcing User Isolation', () => {
    it('prevents access to other users entities', async () => {
      // Mock entity owned by different user
      mockSupabase.from('entities').select.mockResolvedValue({
        data: [{ id: 'entity-001', user_id: 'other-user' }],
        error: null
      })

      const entities = await ecs.query(['flashcard'], testUserId)

      // Should filter by user_id
      expect(mockSupabase.from('entities').eq).toHaveBeenCalledWith('user_id', testUserId)
      expect(entities).toHaveLength(0) // No results for wrong user
    })

    it('validates ownership on entity operations', async () => {
      // Mock ownership check
      mockSupabase.from('entities').select.mockResolvedValue({
        data: [{ id: 'entity-001', user_id: 'other-user' }],
        error: null
      })

      await expect(
        ecs.deleteEntity('entity-001', testUserId)
      ).rejects.toThrow('Unauthorized')
    })

    it('ensures user_id is required for all operations', async () => {
      // @ts-expect-error - Testing missing user_id
      await expect(ecs.createEntity(null, {})).rejects.toThrow()

      // @ts-expect-error - Testing missing user_id
      await expect(ecs.query(['flashcard'], null)).rejects.toThrow()

      // @ts-expect-error - Testing missing user_id
      await expect(ecs.updateComponent('comp-001', {}, null)).rejects.toThrow()
    })

    it('isolates queries to user data only', async () => {
      // Mock mixed user data
      mockSupabase.from('entities').select.mockResolvedValue({
        data: [
          { id: 'e1', user_id: testUserId },
          { id: 'e2', user_id: 'other-user' },
          { id: 'e3', user_id: testUserId }
        ],
        error: null
      })

      const entities = await ecs.query(['flashcard'], testUserId)

      // Should have filtered by user_id
      expect(mockSupabase.from('entities').eq).toHaveBeenCalledWith('user_id', testUserId)
    })

    it('prevents component updates across user boundaries', async () => {
      // Mock component belonging to another user's entity
      mockSupabase.from('components').select.mockResolvedValue({
        data: [{
          id: 'comp-001',
          entity: { user_id: 'other-user' }
        }],
        error: null
      })

      await expect(
        ecs.updateComponent('comp-001', { data: 'hack' }, testUserId)
      ).rejects.toThrow('Unauthorized')
    })
  })

  // Additional edge cases and error handling
  describe('Edge Cases', () => {
    it('handles empty component data gracefully', async () => {
      const entityId = await ecs.createEntity(testUserId, {})

      expect(entityId).toBe('entity-001')
      // Should create entity but no components
      const componentCalls = mockSupabase.from.mock.calls.filter(
        (call: any) => call[0] === 'components'
      )
      expect(componentCalls.length).toBe(0)
    })

    it('handles network errors with retry', async () => {
      let attempts = 0
      mockSupabase.from('entities').insert.mockImplementation(() => {
        attempts++
        if (attempts < 3) {
          return Promise.reject(new Error('Network error'))
        }
        return Promise.resolve({ data: [{ id: 'entity-001' }], error: null })
      })

      const entityId = await ecs.createEntity(testUserId, {}, { retry: true })

      expect(entityId).toBe('entity-001')
      expect(attempts).toBe(3)
    })

    it('validates component data types', async () => {
      const invalidComponents = {
        flashcard: 'not an object' // Should be an object
      }

      // @ts-expect-error - Testing invalid type
      await expect(
        ecs.createEntity(testUserId, invalidComponents)
      ).rejects.toThrow('Invalid component data')
    })
  })
})

// Export mock helpers for use in other tests
export const mockECS = {
  createEntity: jest.fn().mockResolvedValue('mock-entity-001'),
  query: jest.fn().mockResolvedValue([]),
  updateComponent: jest.fn().mockResolvedValue(true),
  deleteEntity: jest.fn().mockResolvedValue(true),
  addComponent: jest.fn().mockResolvedValue('mock-comp-001'),
  removeComponent: jest.fn().mockResolvedValue(true)
}