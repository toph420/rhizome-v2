import { SupabaseClient } from '@supabase/supabase-js'

/**
 * Export sparks to JSON format for vault storage
 * Exports complete ECS entities with all 4 components (Spark, Content, Temporal, ChunkRef)
 */
export async function exportSparksToJson(
  documentId: string,
  supabase: SupabaseClient
): Promise<string> {
  // Get all spark entity IDs for this document (via ChunkRef component)
  const { data: chunkRefComponents } = await supabase
    .from('components')
    .select('entity_id')
    .eq('component_type', 'ChunkRef')
    .eq('data->>documentId', documentId)

  if (!chunkRefComponents || chunkRefComponents.length === 0) {
    return JSON.stringify({
      version: '2.0',
      entity_type: 'spark',
      exported_at: new Date().toISOString(),
      entities: []
    }, null, 2)
  }

  const entityIds = chunkRefComponents.map(c => c.entity_id)

  // Filter to only spark entities (have Spark component, not Position)
  const { data: sparkComponents } = await supabase
    .from('components')
    .select('entity_id')
    .eq('component_type', 'Spark')
    .in('entity_id', entityIds)

  if (!sparkComponents || sparkComponents.length === 0) {
    return JSON.stringify({
      version: '2.0',
      entity_type: 'spark',
      exported_at: new Date().toISOString(),
      entities: []
    }, null, 2)
  }

  const sparkEntityIds = sparkComponents.map(c => c.entity_id)

  // Fetch all 4 components for spark entities
  const { data: allComponents } = await supabase
    .from('components')
    .select(`
      id,
      entity_id,
      component_type,
      data,
      created_at,
      updated_at
    `)
    .in('entity_id', sparkEntityIds)

  if (!allComponents) {
    return JSON.stringify({
      version: '2.0',
      entity_type: 'spark',
      exported_at: new Date().toISOString(),
      entities: []
    }, null, 2)
  }

  // Group components by entity_id
  const entityMap = new Map<string, any>()
  for (const comp of allComponents) {
    if (!entityMap.has(comp.entity_id)) {
      entityMap.set(comp.entity_id, {
        entity_id: comp.entity_id,
        components: {}
      })
    }
    entityMap.get(comp.entity_id).components[comp.component_type] = {
      data: comp.data,
      created_at: comp.created_at,
      updated_at: comp.updated_at
    }
  }

  // Convert to array and sort by creation time
  const entities = Array.from(entityMap.values())
    .sort((a, b) => {
      const aTime = a.components.Temporal?.data.createdAt || a.components.Spark?.created_at
      const bTime = b.components.Temporal?.data.createdAt || b.components.Spark?.created_at
      return new Date(aTime).getTime() - new Date(bTime).getTime()
    })

  // Build final JSON structure
  const exportData = {
    version: '2.0',
    entity_type: 'spark',
    exported_at: new Date().toISOString(),
    document_id: documentId,
    entities
  }

  return JSON.stringify(exportData, null, 2)
}
