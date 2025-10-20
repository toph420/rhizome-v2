import { SupabaseClient } from '@supabase/supabase-js'

/**
 * Generate highlights.md from annotations
 * Format: Obsidian callouts with metadata
 */
export async function generateHighlightsMarkdown(
  documentId: string,
  documentTitle: string,
  supabase: SupabaseClient
): Promise<string> {
  // Fetch annotation entities via ChunkRef component (5-component ECS: Position + Visual + Content + Temporal + ChunkRef)
  // First get entity IDs that have ChunkRef components for this document
  const { data: chunkRefComponents } = await supabase
    .from('components')
    .select('entity_id')
    .eq('component_type', 'ChunkRef')
    .eq('data->>documentId', documentId)

  if (!chunkRefComponents || chunkRefComponents.length === 0) {
    return `# ${documentTitle} - Highlights\n\nNo highlights yet.\n`
  }

  const entityIds = chunkRefComponents.map(c => c.entity_id)

  // Now get all Position components for these entities (Position distinguishes annotations from sparks)
  const { data: positionComponents } = await supabase
    .from('components')
    .select('entity_id')
    .eq('component_type', 'Position')
    .in('entity_id', entityIds)

  if (!positionComponents || positionComponents.length === 0) {
    return `# ${documentTitle} - Highlights\n\nNo highlights yet.\n`
  }

  const annotationEntityIds = positionComponents.map(c => c.entity_id)

  // Fetch all 5 components for these annotation entities
  const { data: allComponents } = await supabase
    .from('components')
    .select(`
      id,
      entity_id,
      component_type,
      data,
      created_at
    `)
    .in('entity_id', annotationEntityIds)
    .order('created_at', { ascending: true })

  if (!allComponents || allComponents.length === 0) {
    return `# ${documentTitle} - Highlights\n\nNo highlights yet.\n`
  }

  // Group components by entity_id to reconstruct annotation entities
  const entityMap = new Map<string, any>()
  for (const comp of allComponents) {
    if (!entityMap.has(comp.entity_id)) {
      entityMap.set(comp.entity_id, {})
    }
    entityMap.get(comp.entity_id)[comp.component_type] = comp
  }

  // Build annotation objects from components
  const annotations = Array.from(entityMap.values())
    .map(components => {
      const position = components.Position?.data
      const visual = components.Visual?.data
      const content = components.Content?.data
      const temporal = components.Temporal?.data

      if (!position) return null // Must have Position component

      return {
        text: position.originalText || '',
        note: content?.note || '',
        tags: content?.tags || [],
        color: visual?.color || 'yellow',
        createdAt: temporal?.createdAt || components.Position?.created_at,
        recoveryMethod: position.recoveryMethod,
        recoveryConfidence: position.recoveryConfidence
      }
    })
    .filter(ann => ann !== null)
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())

  let markdown = `# ${documentTitle} - Highlights\n\n`
  markdown += `**Total**: ${annotations.length}\n\n`
  markdown += `---\n\n`

  for (const ann of annotations) {
    // Obsidian callout format
    markdown += `> [!${getCalloutType(ann.color)}] Highlight\n`
    markdown += `> "${ann.text}"\n`

    if (ann.note) {
      markdown += `>\n`
      markdown += `> **Note**: ${ann.note}\n`
    }

    if (ann.tags && ann.tags.length > 0) {
      markdown += `>\n`
      markdown += `> **Tags**: ${ann.tags.map((t: string) => `#${t}`).join(' ')}\n`
    }

    if (ann.recoveryMethod) {
      markdown += `>\n`
      markdown += `> *Recovered via ${ann.recoveryMethod} (${(ann.recoveryConfidence * 100).toFixed(0)}% confidence)*\n`
    }

    markdown += `\n`
  }

  return markdown
}

/**
 * Map color to Obsidian callout type
 */
function getCalloutType(color: string): string {
  const mapping: Record<string, string> = {
    yellow: 'quote',
    red: 'important',
    green: 'success',
    blue: 'info',
    purple: 'abstract'
  }
  return mapping[color] || 'quote'
}
