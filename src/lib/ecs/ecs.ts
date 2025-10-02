import { SupabaseClient } from '@supabase/supabase-js'

// ComponentData intentionally uses 'any' for maximum ECS flexibility
// Different component types have different data structures (flashcard, annotation, study, etc.)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ComponentData = Record<string, any>

export interface Entity {
  id: string
  user_id: string
  created_at: string
  updated_at: string
  components?: Component[]
}

export interface Component {
  id: string
  entity_id: string
  component_type: string
  data: ComponentData
  chunk_id?: string | null
  document_id?: string | null
  created_at: string
  updated_at: string
}

export class ECS {
  constructor(private supabase: SupabaseClient) {}

  /**
   * Create a new entity with components.
   * @param userId - The user ID who owns this entity.
   * @param components - Object with component types as keys and data as values.
   * @returns The created entity ID.
   */
  async createEntity(
    userId: string,
    components: Record<string, ComponentData>
  ): Promise<string> {
    // Create the entity first
    const { data: entity, error: entityError } = await this.supabase
      .from('entities')
      .insert({ user_id: userId })
      .select()
      .single()

    if (entityError) {
      throw new Error(`Failed to create entity: ${entityError.message}`)
    }

    // Prepare component inserts
    const componentInserts = Object.entries(components).map(
      ([type, data]) => ({
        entity_id: entity.id,
        component_type: type,
        data,
        chunk_id: data.chunk_id || null,
        document_id: data.document_id || null,
      })
    )

    // Insert all components
    if (componentInserts.length > 0) {
      const { error: componentError } = await this.supabase
        .from('components')
        .insert(componentInserts)

      if (componentError) {
        // Rollback by deleting the entity (cascade will delete components)
        await this.supabase.from('entities').delete().eq('id', entity.id)
        throw new Error(`Failed to create components: ${componentError.message}`)
      }
    }

    return entity.id
  }

  /**
   * Query entities by component types.
   * @param componentTypes - Array of component types to filter by.
   * @param userId - User ID to filter by.
   * @param filters - Additional filters.
   * @param filters.document_id - Optional document ID filter.
   * @param filters.chunk_id - Optional chunk ID filter.
   * @param filters.deck_id - Optional deck ID filter.
   * @returns Array of entities with their components.
   */
  async query(
    componentTypes: string[],
    userId: string,
    filters?: {
      document_id?: string
      chunk_id?: string
      deck_id?: string
    }
  ): Promise<Entity[]> {
    // STEP 1: Find entity IDs that match the filters
    // This avoids the PostgREST !inner join issue where filtering components
    // returns only matching components instead of all components for matching entities
    let entityIdQuery = this.supabase
      .from('components')
      .select('entity_id, entities!inner(user_id)')
      .eq('entities.user_id', userId)

    // Filter by component types if provided
    if (componentTypes.length > 0) {
      entityIdQuery = entityIdQuery.in('component_type', componentTypes)
    }

    // Apply additional filters
    if (filters?.document_id) {
      entityIdQuery = entityIdQuery.eq('document_id', filters.document_id)
    }
    if (filters?.chunk_id) {
      entityIdQuery = entityIdQuery.eq('chunk_id', filters.chunk_id)
    }

    const { data: entityIdData, error: entityIdError } = await entityIdQuery

    if (entityIdError) {
      throw new Error(`Failed to query entity IDs: ${entityIdError.message}`)
    }

    if (!entityIdData || entityIdData.length === 0) {
      return []
    }

    // Get unique entity IDs
    const entityIds = Array.from(
      new Set(entityIdData.map((row) => row.entity_id))
    )

    // STEP 2: Fetch full entities with ALL components
    const { data, error } = await this.supabase
      .from('entities')
      .select(`
        id,
        user_id,
        created_at,
        updated_at,
        components (
          id,
          entity_id,
          component_type,
          data,
          chunk_id,
          document_id,
          created_at,
          updated_at
        )
      `)
      .in('id', entityIds)
      .eq('user_id', userId)

    if (error) {
      throw new Error(`Failed to query entities: ${error.message}`)
    }

    return data || []
  }

  /**
   * Get a single entity by ID with all its components.
   * @param entityId - The entity ID.
   * @param userId - User ID for security.
   * @returns The entity with components or null.
   */
  async getEntity(
    entityId: string,
    userId: string
  ): Promise<Entity | null> {
    const { data, error } = await this.supabase
      .from('entities')
      .select(`
        id,
        user_id,
        created_at,
        updated_at,
        components (
          id,
          entity_id,
          component_type,
          data,
          chunk_id,
          document_id,
          created_at,
          updated_at
        )
      `)
      .eq('id', entityId)
      .eq('user_id', userId)
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return null // Not found
      }
      throw new Error(`Failed to get entity: ${error.message}`)
    }

    return data
  }

  /**
   * Update a component's data.
   * @param componentId - The component ID.
   * @param data - New data for the component.
   * @param userId - User ID for security.
   */
  async updateComponent(
    componentId: string,
    data: ComponentData,
    userId: string
  ): Promise<void> {
    // Verify ownership through entity
    const { error: verifyError } = await this.supabase
      .from('components')
      .select(`
        entity:entities!inner(user_id)
      `)
      .eq('id', componentId)
      .eq('entity.user_id', userId)
      .single()

    if (verifyError) {
      throw new Error(`Unauthorized or component not found: ${verifyError.message}`)
    }

    // Update the component
    const { error } = await this.supabase
      .from('components')
      .update({ data })
      .eq('id', componentId)

    if (error) {
      throw new Error(`Failed to update component: ${error.message}`)
    }
  }

  /**
   * Delete an entity and all its components (cascade).
   * @param entityId - The entity ID to delete.
   * @param userId - User ID for security.
   */
  async deleteEntity(entityId: string, userId: string): Promise<void> {
    const { error } = await this.supabase
      .from('entities')
      .delete()
      .eq('id', entityId)
      .eq('user_id', userId)

    if (error) {
      throw new Error(`Failed to delete entity: ${error.message}`)
    }
  }

  /**
   * Add a component to an existing entity.
   * @param entityId - The entity to add component to.
   * @param componentType - Type of component.
   * @param data - Component data.
   * @param userId - User ID for security.
   * @returns The created component ID.
   */
  async addComponent(
    entityId: string,
    componentType: string,
    data: ComponentData,
    userId: string
  ): Promise<string> {
    // Verify entity ownership
    const { error: verifyError } = await this.supabase
      .from('entities')
      .select('id')
      .eq('id', entityId)
      .eq('user_id', userId)
      .single()

    if (verifyError) {
      throw new Error(`Entity not found or unauthorized: ${verifyError.message}`)
    }

    // Add the component
    const { data: component, error } = await this.supabase
      .from('components')
      .insert({
        entity_id: entityId,
        component_type: componentType,
        data,
        chunk_id: data.chunk_id || null,
        document_id: data.document_id || null,
      })
      .select()
      .single()

    if (error) {
      throw new Error(`Failed to add component: ${error.message}`)
    }

    return component.id
  }

  /**
   * Remove a component from an entity.
   * @param componentId - The component ID to remove.
   * @param userId - User ID for security.
   */
  async removeComponent(componentId: string, userId: string): Promise<void> {
    // Verify ownership through entity
    const { error: verifyError } = await this.supabase
      .from('components')
      .select(`
        entity:entities!inner(user_id)
      `)
      .eq('id', componentId)
      .eq('entity.user_id', userId)
      .single()

    if (verifyError) {
      throw new Error(`Unauthorized or component not found: ${verifyError.message}`)
    }

    // Delete the component
    const { error } = await this.supabase
      .from('components')
      .delete()
      .eq('id', componentId)

    if (error) {
      throw new Error(`Failed to remove component: ${error.message}`)
    }
  }
}