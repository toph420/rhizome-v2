'use server'

import { revalidatePath } from 'next/cache'
import { getCurrentUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { createECS } from '@/lib/ecs'
import {
  uploadSparkToStorage,
  buildSparkConnections,
  extractTags
} from '@/lib/sparks'
import type { SparkContext, SparkStorageJson } from '@/lib/sparks/types'

interface CreateSparkInput {
  content: string
  context: SparkContext
}

/**
 * Create a new spark (ECS-native)
 *
 * Flow (follows annotation pattern exactly):
 * 1. Validate user authentication
 * 2. Extract metadata from content (tags, chunk mentions)
 * 3. Build connection graph (origin + mentions + inherited)
 * 4. Create ECS entity with spark + source components
 * 5. Upload complete data to Storage (source of truth)
 * 6. Update query cache (optional, non-fatal) - TODO: implement via background job
 * 7. Revalidate paths for UI refresh
 *
 * Pattern: src/app/actions/annotations.ts:39-135
 */
export async function createSpark(input: CreateSparkInput) {
  const user = await getCurrentUser()
  if (!user) throw new Error('Unauthorized')

  const supabase = await createClient()

  // 1. Extract metadata from content
  const tags = extractTags(input.content)
  const connections = await buildSparkConnections(
    input.content,
    input.context.originChunkId,
    user.id
  )

  // 2. Create ECS entity (NO domain tables)
  // Pattern: Two-component pattern (spark + source)
  const ecs = createECS()
  const sparkId = await ecs.createEntity(user.id, {
    spark: {
      content: input.content,
      created_at: new Date().toISOString(),
      tags,
      connections // Complete connection graph stored here
    },
    source: {
      chunk_id: input.context.originChunkId,
      document_id: input.context.documentId
    }
  })

  console.log(`[Sparks] ✓ Created ECS entity: ${sparkId}`)

  // 3. Build complete Storage JSON
  const sparkData: SparkStorageJson = {
    entity_id: sparkId,
    user_id: user.id,
    component_type: 'spark',
    data: {
      content: input.content,
      created_at: new Date().toISOString(),
      tags,
      connections
    },
    context: input.context,
    source: {
      chunk_id: input.context.originChunkId,
      document_id: input.context.documentId
    }
  }

  // 4. Upload to Storage (source of truth)
  try {
    const storagePath = await uploadSparkToStorage(user.id, sparkId, sparkData)
    console.log(`[Sparks] ✓ Uploaded to Storage: ${storagePath}`)
  } catch (error) {
    console.error(`[Sparks] Storage upload failed:`, error)
    // Continue - Storage can be rebuilt from ECS if needed
  }

  // 5. Update query cache (optional, non-fatal)
  // Note: Embedding generation deferred to background job
  try {
    await supabase.from('sparks_cache').insert({
      entity_id: sparkId,
      user_id: user.id,
      content: input.content,
      created_at: new Date().toISOString(),
      origin_chunk_id: input.context.originChunkId,
      document_id: input.context.documentId,
      tags,
      connections, // Save connections array to cache (migration 056)
      embedding: null, // TODO: Generate via background job
      storage_path: `${user.id}/sparks/${sparkId}/content.json`,
      cached_at: new Date().toISOString()
    })
    console.log(`[Sparks] ✓ Updated query cache with ${connections.length} connections`)
  } catch (error) {
    console.error(`[Sparks] Cache update failed (non-critical):`, error)
    // Don't fail the operation - cache is rebuildable
  }

  // 6. Revalidate paths
  revalidatePath('/sparks')
  revalidatePath(`/read/${input.context.documentId}`)

  return { success: true, sparkId }
}

/**
 * Delete spark (cascade delete)
 *
 * Pattern: src/app/actions/annotations.ts:198-221
 */
export async function deleteSpark(sparkId: string) {
  const user = await getCurrentUser()
  if (!user) throw new Error('Unauthorized')

  const supabase = await createClient()
  const ecs = createECS()

  // 1. Delete from Storage
  const storagePath = `${user.id}/sparks/${sparkId}/content.json`
  try {
    await supabase.storage.from('documents').remove([storagePath])
  } catch (error) {
    console.error(`[Sparks] Storage delete failed (non-critical):`, error)
  }

  // 2. Delete ECS entity (cascades to components)
  await ecs.deleteEntity(sparkId, user.id)

  // 3. Delete from cache (optional, non-fatal)
  try {
    await supabase.from('sparks_cache').delete().eq('entity_id', sparkId)
  } catch (error) {
    console.error(`[Sparks] Cache delete failed (non-critical):`, error)
  }

  revalidatePath('/sparks')
  return { success: true }
}

/**
 * Get sparks for timeline (uses cache for performance)
 *
 * Pattern: Query cache table, fallback to ECS if needed
 */
export async function getRecentSparks(limit = 50, offset = 0) {
  const user = await getCurrentUser()
  if (!user) throw new Error('Unauthorized')

  const supabase = await createClient()

  const { data: sparks, error } = await supabase
    .from('sparks_cache')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (error) throw error

  return sparks || []
}

/**
 * Search sparks by content (uses cache for performance)
 *
 * Pattern: Full-text search on cache table
 */
export async function searchSparks(query: string, limit = 20) {
  const user = await getCurrentUser()
  if (!user) throw new Error('Unauthorized')

  const supabase = await createClient()

  // Full-text search on content
  const { data: sparks, error } = await supabase
    .from('sparks_cache')
    .select('*')
    .eq('user_id', user.id)
    .textSearch('content', query)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) throw error

  return sparks || []
}
