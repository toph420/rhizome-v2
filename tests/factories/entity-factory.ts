// Type definitions (will be imported from actual types when available)
type Entity = {
  id: string
  user_id: string
  created_at: Date
  updated_at: Date
}

type Component = {
  id: string
  entity_id: string
  component_type: string
  data: Record<string, any>
  created_at: Date
  updated_at: Date
}

interface EntityOverrides {
  id?: string
  user_id?: string
  created_at?: Date
  updated_at?: Date
}

interface ComponentOverrides {
  id?: string
  entity_id?: string
  component_type?: string
  data?: Record<string, any>
  created_at?: Date
  updated_at?: Date
}

export function createEntityFactory() {
  let entityIdCounter = 1
  let componentIdCounter = 1

  return {
    /**
     * Create a single entity
     */
    createEntity(overrides: EntityOverrides = {}): Entity {
      const id = overrides.id || `entity-test-${entityIdCounter++}`
      const now = new Date()

      return {
        id,
        user_id: overrides.user_id || 'test-user-001',
        created_at: overrides.created_at || now,
        updated_at: overrides.updated_at || now
      }
    },

    /**
     * Create a component for an entity
     */
    createComponent(
      entityId: string,
      type: string,
      data: Record<string, any>,
      overrides: ComponentOverrides = {}
    ): Component {
      const id = overrides.id || `component-test-${componentIdCounter++}`
      const now = new Date()

      return {
        id,
        entity_id: overrides.entity_id || entityId,
        component_type: overrides.component_type || type,
        data: overrides.data || data,
        created_at: overrides.created_at || now,
        updated_at: overrides.updated_at || now
      }
    },

    /**
     * Create a flashcard entity with components
     */
    createFlashcard(
      overrides: {
        entity?: EntityOverrides
        question?: string
        answer?: string
        ease?: number
        due?: Date
        chunkId?: string
        documentId?: string
      } = {}
    ) {
      const entity = this.createEntity(overrides.entity)
      const components = [
        this.createComponent(entity.id, 'flashcard', {
          question: overrides.question || 'What is the test question?',
          answer: overrides.answer || 'This is the test answer.'
        }),
        this.createComponent(entity.id, 'study', {
          ease: overrides.ease ?? 2.5,
          due: overrides.due || new Date(),
          interval: 1,
          reviews: 0
        }),
        this.createComponent(entity.id, 'source', {
          chunk_id: overrides.chunkId || 'chunk-test-001',
          document_id: overrides.documentId || 'doc-test-001'
        })
      ]

      return { entity, components }
    },

    /**
     * Create an annotation entity with components
     */
    createAnnotation(
      overrides: {
        entity?: EntityOverrides
        text?: string
        note?: string
        range?: { start: number; end: number }
        chunkId?: string
        documentId?: string
      } = {}
    ) {
      const entity = this.createEntity(overrides.entity)
      const components = [
        this.createComponent(entity.id, 'annotation', {
          text: overrides.text || 'Highlighted text',
          note: overrides.note || 'This is an annotation note',
          range: overrides.range || { start: 0, end: 15 }
        }),
        this.createComponent(entity.id, 'source', {
          chunk_id: overrides.chunkId || 'chunk-test-001',
          document_id: overrides.documentId || 'doc-test-001'
        })
      ]

      return { entity, components }
    },

    /**
     * Create a connection entity between chunks
     */
    createConnection(
      overrides: {
        entity?: EntityOverrides
        sourceChunkId?: string
        targetChunkId?: string
        score?: number
        engineType?: string
      } = {}
    ) {
      const entity = this.createEntity(overrides.entity)
      const components = [
        this.createComponent(entity.id, 'connection', {
          source_chunk_id: overrides.sourceChunkId || 'chunk-test-001',
          target_chunk_id: overrides.targetChunkId || 'chunk-test-002',
          score: overrides.score ?? 0.85,
          engine_type: overrides.engineType || 'semantic-similarity'
        })
      ]

      return { entity, components }
    },

    /**
     * Create multiple entities
     */
    createManyEntities(count: number, userId: string = 'test-user-001'): Entity[] {
      return Array.from({ length: count }, () =>
        this.createEntity({ user_id: userId })
      )
    },

    /**
     * Reset ID counters for test isolation
     */
    reset() {
      entityIdCounter = 1
      componentIdCounter = 1
    }
  }
}