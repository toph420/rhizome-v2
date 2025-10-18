import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { SparkStorageJson } from './types'

/**
 * Upload spark to Storage (source of truth)
 * Path: {userId}/sparks/{sparkId}/content.json
 *
 * Pattern: Like documents, sparks are exported to Storage for portability.
 * Database is queryable cache, Storage is source of truth.
 *
 * Uses admin client to bypass Storage RLS (personal tool pattern).
 */
export async function uploadSparkToStorage(
  userId: string,
  sparkId: string,
  sparkData: SparkStorageJson
): Promise<string> {
  // Use admin client to bypass Storage RLS
  const supabase = createAdminClient()
  const jsonPath = `${userId}/sparks/${sparkId}/content.json`

  // Use Blob wrapper to preserve JSON formatting (from storage-helpers pattern)
  const jsonBlob = new Blob([JSON.stringify(sparkData, null, 2)], {
    type: 'application/json'
  })

  const { error } = await supabase.storage
    .from('documents')
    .upload(jsonPath, jsonBlob, {
      contentType: 'application/json',
      upsert: true
    })

  if (error) {
    throw new Error(`Failed to upload spark to Storage: ${error.message}`)
  }

  console.log(`[Sparks] ✓ Uploaded to Storage: ${jsonPath}`)
  return jsonPath
}

/**
 * Download spark from Storage
 * Uses signed URLs with 1-hour expiry (from storage-helpers pattern)
 * Uses admin client to bypass Storage RLS.
 */
export async function downloadSparkFromStorage(
  userId: string,
  sparkId: string
): Promise<SparkStorageJson> {
  const supabase = createAdminClient()
  const jsonPath = `${userId}/sparks/${sparkId}/content.json`

  // Create signed URL
  const { data: signedUrlData, error: urlError } = await supabase.storage
    .from('documents')
    .createSignedUrl(jsonPath, 3600) // 1 hour

  if (urlError || !signedUrlData?.signedUrl) {
    throw new Error(`Failed to create signed URL for ${jsonPath}`)
  }

  // Fetch and parse JSON
  const response = await fetch(signedUrlData.signedUrl)
  if (!response.ok) {
    throw new Error(`Storage read failed for ${jsonPath}: ${response.statusText}`)
  }

  const data = await response.json()
  console.log(`[Sparks] ✓ Read from Storage: ${jsonPath}`)

  return data as SparkStorageJson
}

/**
 * List all spark files in Storage for a user
 * Uses admin client to bypass Storage RLS.
 */
export async function listUserSparks(userId: string): Promise<string[]> {
  const supabase = createAdminClient()

  const { data: folders, error } = await supabase.storage
    .from('documents')
    .list(`${userId}/sparks`, {
      limit: 1000,
      offset: 0
    })

  if (error) {
    throw new Error(`Failed to list sparks: ${error.message}`)
  }

  // Return folder names (each folder is a sparkId)
  return (folders || []).map(f => f.name)
}

/**
 * Verify Storage integrity (for diagnostics)
 * Returns true if Storage count matches ECS entity count
 */
export async function verifySparksIntegrity(userId: string): Promise<{
  storageCount: number
  entityCount: number
  matched: boolean
}> {
  const supabase = await createClient()

  // Count files in Storage
  const sparkIds = await listUserSparks(userId)
  const storageCount = sparkIds.length

  // Count ECS entities with spark component
  const { data: components } = await supabase
    .from('components')
    .select('entity_id')
    .eq('component_type', 'spark')
    .eq('user_id', userId)

  const entityCount = components?.length || 0

  return {
    storageCount,
    entityCount,
    matched: storageCount === entityCount
  }
}

/**
 * Verify cache freshness (detects stale or missing sparks)
 * Used for health checks and automatic cache repairs
 */
export async function verifyCacheFreshness(userId: string): Promise<{
  stale: string[]
  missing: string[]
}> {
  const supabase = await createClient()

  // Get all sparks from Storage
  const storageIds = await listUserSparks(userId)

  // Get all cached sparks
  const { data: cached } = await supabase
    .from('sparks_cache')
    .select('entity_id, cached_at, storage_path')
    .eq('user_id', userId)

  const cachedIds = new Set(cached?.map(c => c.entity_id) || [])

  // Detect missing sparks (in Storage but not cached)
  const missing = storageIds.filter(id => !cachedIds.has(id))

  // Detect stale sparks (cached but updated in Storage)
  const stale: string[] = []
  for (const cache of cached || []) {
    try {
      const sparkData = await downloadSparkFromStorage(userId, cache.entity_id)
      const storageUpdated = new Date(sparkData.data.updated_at || sparkData.data.created_at)
      const cacheUpdated = new Date(cache.cached_at)

      if (storageUpdated > cacheUpdated) {
        stale.push(cache.entity_id)
      }
    } catch (error) {
      // Storage file missing but cache exists - mark as stale
      stale.push(cache.entity_id)
    }
  }

  return { stale, missing }
}
