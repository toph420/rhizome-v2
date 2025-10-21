import { SupabaseClient } from '@supabase/supabase-js'

/**
 * Generate Sparks.md from spark entities
 * Format: YAML frontmatter + markdown for each spark
 */
export async function generateSparksMarkdown(
  documentId: string,
  documentTitle: string,
  supabase: SupabaseClient
): Promise<string> {
  // Get all spark entity IDs for this document (via ChunkRef component)
  const { data: chunkRefComponents } = await supabase
    .from('components')
    .select('entity_id')
    .eq('component_type', 'ChunkRef')
    .eq('data->>documentId', documentId)

  if (!chunkRefComponents || chunkRefComponents.length === 0) {
    return `# ${documentTitle} - Sparks\n\nNo sparks yet.\n`
  }

  const entityIds = chunkRefComponents.map(c => c.entity_id)

  // Get all components for these entities
  const { data: allComponents } = await supabase
    .from('components')
    .select('entity_id, component_type, data, created_at, updated_at')
    .in('entity_id', entityIds)

  if (!allComponents) {
    return `# ${documentTitle} - Sparks\n\nNo sparks yet.\n`
  }

  // Group components by entity_id
  const entityMap = new Map<string, any[]>()
  for (const comp of allComponents) {
    if (!entityMap.has(comp.entity_id)) {
      entityMap.set(comp.entity_id, [])
    }
    entityMap.get(comp.entity_id)!.push(comp)
  }

  // Filter to only complete spark entities (have Spark component)
  const sparkEntities = Array.from(entityMap.entries())
    .filter(([_, comps]) => comps.some(c => c.component_type === 'Spark'))
    .map(([entityId, comps]) => {
      const spark = comps.find(c => c.component_type === 'Spark')
      const content = comps.find(c => c.component_type === 'Content')
      const temporal = comps.find(c => c.component_type === 'Temporal')
      const chunkRef = comps.find(c => c.component_type === 'ChunkRef')

      return {
        id: entityId,
        content: content?.data.note || '',
        tags: content?.data.tags || [],
        selections: spark?.data.selections || [],
        connections: spark?.data.connections || [],
        chunkId: chunkRef?.data.chunkId,
        documentId: chunkRef?.data.documentId,
        createdAt: temporal?.data.createdAt,
        updatedAt: temporal?.data.updatedAt,
        orphaned: spark?.data.orphaned || false,
        needsReview: spark?.data.needsReview || false
      }
    })
    .sort((a, b) => {
      const aTime = new Date(a.createdAt).getTime()
      const bTime = new Date(b.createdAt).getTime()
      return aTime - bTime // Ascending (oldest first)
    })

  if (sparkEntities.length === 0) {
    return `# ${documentTitle} - Sparks\n\nNo complete spark entities to export.\n`
  }

  // Build header
  let markdown = `# ${documentTitle} - Sparks\n\n`
  markdown += `**Total**: ${sparkEntities.length}\n\n`
  markdown += `---\n\n`

  // Build markdown content with YAML frontmatter for each spark
  const sparksContent = sparkEntities.map(spark => {
    const frontmatter = {
      id: spark.id,
      created: spark.createdAt,
      updated: spark.updatedAt,
      tags: spark.tags,
      chunk: spark.chunkId,
      document: spark.documentId,
      selections: spark.selections.length,
      connections: spark.connections.length,
      orphaned: spark.orphaned || undefined,
      needsReview: spark.needsReview || undefined
    }

    let sparkMd = '---\n'
    for (const [key, value] of Object.entries(frontmatter)) {
      if (value !== undefined) {
        if (Array.isArray(value)) {
          sparkMd += `${key}: [${value.map(v => typeof v === 'string' ? `"${v}"` : v).join(', ')}]\n`
        } else {
          sparkMd += `${key}: ${typeof value === 'string' ? `"${value}"` : value}\n`
        }
      }
    }
    sparkMd += '---\n\n'

    // Add selections if any
    if (spark.selections.length > 0) {
      sparkMd += '## Selections\n\n'
      for (const sel of spark.selections) {
        sparkMd += `> "${sel.text}"\n`
        sparkMd += `> — Chunk: ${sel.chunkId}\n\n`
      }
    }

    // Add spark content
    sparkMd += '## Thought\n\n'
    sparkMd += spark.content + '\n\n'

    // Add connections summary
    if (spark.connections.length > 0) {
      sparkMd += '## Connections\n\n'
      sparkMd += `- ${spark.connections.length} connections to related chunks\n`

      const byType = spark.connections.reduce((acc: Record<string, number>, conn: any) => {
        acc[conn.type] = (acc[conn.type] || 0) + 1
        return acc
      }, {} as Record<string, number>)

      for (const [type, count] of Object.entries(byType)) {
        sparkMd += `  - ${count} ${type}\n`
      }
    }

    return sparkMd
  }).join('\n---\n\n')

  markdown += sparksContent

  return markdown
}
