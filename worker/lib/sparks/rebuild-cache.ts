import type { SupabaseClient } from '@supabase/supabase-js'
import { generateSingleEmbedding } from '../embeddings.js'
import { readFromStorage } from '../storage-helpers.js'

/**
 * Spark storage types (matching main app types)
 */
interface SparkComponent {
  content: string
  created_at: string
  updated_at?: string
  tags: string[]
  connections: any[]
}

interface SparkStorageJson {
  entity_id: string
  user_id: string
  component_type: 'spark'
  data: SparkComponent
  context: any
  source: {
    chunk_id: string
    document_id: string
  }
}

/**
 * List all spark files in Storage for a user
 * Returns filenames (which are the sparkIds)
 */
async function listUserSparks(
  supabase: SupabaseClient,
  userId: string
): Promise<string[]> {
  const { data: files, error } = await supabase.storage
    .from('documents')
    .list(`${userId}/sparks`, {
      limit: 1000,
      offset: 0
    })

  if (error) {
    throw new Error(`Failed to list sparks: ${error.message}`)
  }

  // Return filenames (each file is a spark JSON)
  // Filter out .rhizome directory if it exists
  return (files || [])
    .filter(f => f.name !== '.rhizome' && f.name.endsWith('.json'))
    .map(f => f.name)
}

/**
 * Download spark from Storage
 * Uses flat structure: {userId}/sparks/{filename}.json
 * Filename is the sparkId (e.g., "2025-10-21-spark-title.json")
 */
async function downloadSparkFromStorage(
  supabase: SupabaseClient,
  userId: string,
  sparkId: string
): Promise<SparkStorageJson> {
  // Flat structure: files are directly in sparks/ folder
  const jsonPath = `${userId}/sparks/${sparkId}`

  try {
    const data = await readFromStorage<SparkStorageJson>(supabase, jsonPath)
    console.log(`[Sparks] ✓ Read from Storage: ${jsonPath}`)
    return data
  } catch (error) {
    throw new Error(`Failed to read spark from Storage: ${jsonPath}`)
  }
}

/**
 * Rebuild sparks cache from Storage
 * Used on startup or after data loss
 *
 * Pattern: Like cached_chunks, this is a rebuildable cache.
 * Storage is source of truth, this function restores queryable cache.
 */
export async function rebuildSparksCache(
  supabase: SupabaseClient,
  userId: string
): Promise<{
  rebuilt: number
  errors: string[]
  duration: number
}> {
  const startTime = Date.now()
  const errors: string[] = []
  let rebuilt = 0

  console.log(`[Sparks] Rebuilding cache for user ${userId}...`)

  // 1. Clear existing cache
  const { error: deleteError } = await supabase
    .from('sparks_cache')
    .delete()
    .eq('user_id', userId)

  if (deleteError) {
    throw new Error(`Failed to clear cache: ${deleteError.message}`)
  }

  // 2. List all spark files in Storage
  const sparkIds = await listUserSparks(supabase, userId)
  console.log(`[Sparks] Found ${sparkIds.length} sparks in Storage`)

  // 3. Download and cache each spark (batch in groups of 10 for rate limiting)
  const batchSize = 10
  for (let i = 0; i < sparkIds.length; i += batchSize) {
    const batch = sparkIds.slice(i, i + batchSize)

    await Promise.all(batch.map(async (sparkId) => {
      try {
        const sparkData = await downloadSparkFromStorage(supabase, userId, sparkId)

        // Generate embedding for search
        const embedding = await generateSingleEmbedding(sparkData.data.content)

        // Insert cache row
        const { error: insertError } = await supabase.from('sparks_cache').insert({
          entity_id: sparkData.entity_id,
          user_id: userId,
          content: sparkData.data.content,
          created_at: sparkData.data.created_at,
          updated_at: sparkData.data.updated_at,
          origin_chunk_id: sparkData.source.chunk_id,
          document_id: sparkData.source.document_id,
          tags: sparkData.data.tags,
          embedding,
          storage_path: `${userId}/sparks/${sparkId}`,
          cached_at: new Date().toISOString()
        })

        if (insertError) {
          throw insertError
        }

        rebuilt++
      } catch (error) {
        const errorMsg = `Failed to cache spark ${sparkId}: ${error}`
        console.error(`[Sparks] ${errorMsg}`)
        errors.push(errorMsg)
      }
    }))
  }

  const duration = Date.now() - startTime
  console.log(`[Sparks] Cache rebuild complete: ${rebuilt} sparks, ${errors.length} errors, ${duration}ms`)

  return { rebuilt, errors, duration }
}

/**
 * Update single spark in cache
 * Called after creating/updating a spark
 */
export async function updateSparkCache(
  supabase: SupabaseClient,
  userId: string,
  sparkId: string,
  sparkData: SparkStorageJson
): Promise<void> {
  // Generate embedding
  const embedding = await generateSingleEmbedding(sparkData.data.content)

  // Upsert cache row
  const { error } = await supabase.from('sparks_cache').upsert({
    entity_id: sparkId,
    user_id: userId,
    content: sparkData.data.content,
    created_at: sparkData.data.created_at,
    updated_at: sparkData.data.updated_at,
    origin_chunk_id: sparkData.source.chunk_id,
    document_id: sparkData.source.document_id,
    tags: sparkData.data.tags,
    embedding,
    storage_path: `${userId}/sparks/${sparkId}`,
    cached_at: new Date().toISOString()
  })

  if (error) {
    throw new Error(`Failed to update spark cache: ${error.message}`)
  }
}
