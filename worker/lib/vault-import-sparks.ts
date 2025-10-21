import { promises as fs } from 'fs'
import * as path from 'path'
import { SupabaseClient } from '@supabase/supabase-js'

/**
 * Import sparks from global Rhizome/Sparks/ location
 * Uploads to Storage with date-title naming, populates cache
 *
 * Pattern: Sparks are user-level entities, not document-level
 * Location:
 *   - Markdown: Rhizome/Sparks/{date}-spark-{title}.md (ignored by import)
 *   - JSON: Rhizome/Sparks/.rhizome/{date}-spark-{title}.json (imported)
 */
export async function importSparksFromVault(
  vaultPath: string,
  userId: string,
  supabase: SupabaseClient
): Promise<{ imported: number; errors: string[] }> {
  const sparksDir = path.join(vaultPath, 'Rhizome/Sparks')
  const rhizomeDir = path.join(sparksDir, '.rhizome')

  // Check if .rhizome directory exists
  try {
    await fs.access(rhizomeDir)
  } catch {
    console.log('[ImportSparks] No .rhizome directory in vault sparks folder')
    return { imported: 0, errors: [] }
  }

  const files = await fs.readdir(rhizomeDir)
  const jsonFiles = files.filter(f => f.endsWith('.json'))

  let imported = 0
  const errors: string[] = []

  for (const file of jsonFiles) {
    try {
      const sparkData = JSON.parse(
        await fs.readFile(path.join(rhizomeDir, file), 'utf-8')
      )

      // Create ECS entity
      const { error: entityError } = await supabase
        .from('entities')
        .insert({
          id: sparkData.entity_id,
          user_id: userId,
          entity_type: 'spark'
        })

      if (entityError) {
        errors.push(`Failed to create entity ${sparkData.entity_id}: ${entityError.message}`)
        continue
      }

      // Insert components (Spark, Content, Temporal, ChunkRef if present)
      const components = sparkData.components || {}

      if (components.Spark) {
        await supabase.from('components').insert({
          entity_id: sparkData.entity_id,
          component_type: 'Spark',
          data: components.Spark.data
        })
      }

      if (components.Content) {
        await supabase.from('components').insert({
          entity_id: sparkData.entity_id,
          component_type: 'Content',
          data: components.Content.data
        })
      }

      if (components.Temporal) {
        await supabase.from('components').insert({
          entity_id: sparkData.entity_id,
          component_type: 'Temporal',
          data: components.Temporal.data
        })
      }

      if (components.ChunkRef) {
        await supabase.from('components').insert({
          entity_id: sparkData.entity_id,
          component_type: 'ChunkRef',
          document_id: components.ChunkRef.data.documentId || null,
          chunk_id: components.ChunkRef.data.chunkId || null,
          data: components.ChunkRef.data
        })
      }

      // Upload to Storage (use original filename from vault)
      await supabase.storage
        .from('documents')
        .upload(`${userId}/sparks/${file}`, JSON.stringify(sparkData, null, 2), {
          contentType: 'application/json',
          upsert: true
        })

      // Update cache
      await supabase.from('sparks_cache').insert({
        entity_id: sparkData.entity_id,
        user_id: userId,
        content: components.Content?.data.note || '',
        created_at: components.Temporal?.data.createdAt,
        updated_at: components.Temporal?.data.updatedAt,
        origin_chunk_id: components.ChunkRef?.data.chunkId || null,
        document_id: components.ChunkRef?.data.documentId || null,
        tags: components.Content?.data.tags || [],
        storage_path: `${userId}/sparks/${file}`,
        cached_at: new Date().toISOString()
      })

      imported++
    } catch (error) {
      errors.push(`Failed to import ${file}: ${error}`)
    }
  }

  console.log(`[ImportSparks] ✓ Imported ${imported} sparks, ${errors.length} errors`)
  return { imported, errors }
}
