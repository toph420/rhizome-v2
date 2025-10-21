import { SupabaseClient } from '@supabase/supabase-js'

/**
 * Export annotations to JSON format for vault storage
 * Exports complete ECS entities with all 5 components
 */
export async function exportAnnotationsToJson(
  documentId: string,
  supabase: SupabaseClient
): Promise<string> {
  // Get all annotation entity IDs for this document (via ChunkRef component)
  const { data: chunkRefComponents } = await supabase
    .from('components')
    .select('entity_id')
    .eq('component_type', 'ChunkRef')
    .eq('data->>documentId', documentId)

  if (!chunkRefComponents || chunkRefComponents.length === 0) {
    return JSON.stringify({
      version: '2.0',
      entity_type: 'annotation',
      exported_at: new Date().toISOString(),
      entities: []
    }, null, 2)
  }

  const entityIds = chunkRefComponents.map(c => c.entity_id)

  // Filter to only annotation entities (have Position component)
  const { data: positionComponents } = await supabase
    .from('components')
    .select('entity_id')
    .eq('component_type', 'Position')
    .in('entity_id', entityIds)

  if (!positionComponents || positionComponents.length === 0) {
    return JSON.stringify({
      version: '2.0',
      entity_type: 'annotation',
      exported_at: new Date().toISOString(),
      entities: []
    }, null, 2)
  }

  const annotationEntityIds = positionComponents.map(c => c.entity_id)

  // Fetch all 5 components for annotation entities
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
    .in('entity_id', annotationEntityIds)

  if (!allComponents) {
    return JSON.stringify({
      version: '2.0',
      entity_type: 'annotation',
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
      const aTime = a.components.Temporal?.data.createdAt || a.components.Position?.created_at
      const bTime = b.components.Temporal?.data.createdAt || b.components.Position?.created_at
      return new Date(aTime).getTime() - new Date(bTime).getTime()
    })

  // Build final JSON structure
  const exportData = {
    version: '2.0',
    entity_type: 'annotation',
    exported_at: new Date().toISOString(),
    document_id: documentId,
    entities
  }

  return JSON.stringify(exportData, null, 2)
}
