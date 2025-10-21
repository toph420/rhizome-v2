import { promises as fs } from 'fs'
import * as path from 'path'
import { SupabaseClient } from '@supabase/supabase-js'

/**
 * Export ALL user sparks to global Rhizome/Sparks/ folder
 * Creates both .md (readable) and .json (portable) files
 *
 * Pattern: Sparks are user-level entities, not document-level
 * Location:
 *   - Markdown: Rhizome/Sparks/{date}-spark-{title}.md
 *   - JSON: Rhizome/Sparks/.rhizome/{date}-spark-{title}.json
 */
export async function exportSparksToVault(
  userId: string,
  vaultPath: string,
  supabase: SupabaseClient
): Promise<{ exported: number }> {
  const sparksDir = path.join(vaultPath, 'Rhizome/Sparks')
  const rhizomeDir = path.join(sparksDir, '.rhizome')
  await fs.mkdir(sparksDir, { recursive: true })
  await fs.mkdir(rhizomeDir, { recursive: true })

  // List all spark files in Storage
  const { data: sparkFiles } = await supabase.storage
    .from('documents')
    .list(`${userId}/sparks/`)

  if (!sparkFiles || sparkFiles.length === 0) {
    console.log('[ExportSparks] No sparks to export')
    return { exported: 0 }
  }

  let exported = 0

  for (const file of sparkFiles) {
    if (!file.name.endsWith('.json')) continue

    try {
      // Download JSON from Storage
      const { data: blob } = await supabase.storage
        .from('documents')
        .download(`${userId}/sparks/${file.name}`)

      if (!blob) {
        console.warn(`[ExportSparks] No blob for ${file.name}`)
        continue
      }

      const sparkData = JSON.parse(await blob.text())

      // Write JSON to vault .rhizome subfolder (portable format, hidden)
      await fs.writeFile(
        path.join(rhizomeDir, file.name),
        JSON.stringify(sparkData, null, 2)
      )

      // Generate and write Markdown to main folder (readable format)
      const markdown = generateSparkMarkdown(sparkData)
      const mdFilename = file.name.replace('.json', '.md')
      await fs.writeFile(
        path.join(sparksDir, mdFilename),
        markdown
      )

      exported++
    } catch (error) {
      console.error(`[ExportSparks] Failed to export ${file.name}:`, error)
    }
  }

  console.log(`[ExportSparks] ✓ Exported ${exported} sparks`)
  return { exported }
}

function generateSparkMarkdown(sparkData: any): string {
  const components = sparkData.components || {}
  const spark = components.Spark?.data || {}
  const content = components.Content?.data || {}
  const temporal = components.Temporal?.data || {}
  const chunkRef = components.ChunkRef?.data || {}

  let md = `# ${spark.title || sparkData.data?.title || 'Untitled Spark'}\n\n`
  md += `**Created**: ${new Date(temporal.createdAt || sparkData.data?.createdAt).toLocaleDateString()}\n`

  if (content.tags && content.tags.length > 0) {
    md += `**Tags**: ${content.tags.map((t: string) => `#${t}`).join(' ')}\n`
  }

  if (chunkRef.documentTitle) {
    md += `**From**: [[${chunkRef.documentTitle}]]\n`
  }

  md += `\n---\n\n`
  md += `${content.note || sparkData.data?.content}\n\n`

  if (spark.selections && spark.selections.length > 0) {
    md += `## Selections\n\n`
    spark.selections.forEach((sel: any) => {
      md += `> "${sel.text}"\n\n`
      if (chunkRef.documentTitle) {
        md += `*From [[${chunkRef.documentTitle}]]*\n\n`
      }
    })
  }

  return md
}
