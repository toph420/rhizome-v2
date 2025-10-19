'use server'

import { revalidatePath } from 'next/cache'
import { getCurrentUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { createECS } from '@/lib/ecs'
import { SparkOperations } from '@/lib/ecs/sparks'
import {
  uploadSparkToStorage,
  buildSparkConnections,
  extractTags,
} from '@/lib/sparks'
import type { SparkContext, SparkStorageJson, SparkSelection } from '@/lib/sparks/types'

interface CreateSparkInput {
  content: string
  selections?: SparkSelection[]  // NEW - multiple selections
  context: SparkContext
}

/**
 * Create a new spark (ECS-native with SparkOperations)
 *
 * Flow:
 * 1. Validate user authentication
 * 2. Extract metadata from content (tags, chunk mentions)
 * 3. Build connection graph (origin + mentions + inherited)
 * 4. Create ECS entity with 4 components via SparkOperations
 * 5. Upload complete data to Storage (source of truth)
 * 6. Update query cache (optional, non-fatal)
 * 7. Revalidate paths for UI refresh
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

  // 2. Get origin chunk content for recovery
  const { data: originChunk } = await supabase
    .from('chunks')
    .select('content')
    .eq('id', input.context.originChunkId)
    .single()

  // 3. Create ECS entity using SparkOperations (4-component pattern)
  const ecs = createECS()
  const ops = new SparkOperations(ecs, user.id)

  const sparkId = await ops.create({
    content: input.content,
    selections: input.selections || [],
    tags,
    connections,
    chunkId: input.context.originChunkId,
    chunkIds: input.context.visibleChunks,
    documentId: input.context.documentId,
    originChunkContent: originChunk?.content?.slice(0, 500),
  })

  console.log(`[Sparks] ✓ Created ECS entity: ${sparkId}`)

  // 4. Build complete Storage JSON
  const sparkData: SparkStorageJson = {
    entity_id: sparkId,
    user_id: user.id,
    component_type: 'spark',
    data: {
      content: input.content,
      createdAt: new Date().toISOString(),
      tags,
      connections,
      selections: input.selections || [],
    },
    context: input.context,
    source: {
      chunk_id: input.context.originChunkId,
      document_id: input.context.documentId,
    },
  }

  // 5. Upload to Storage (source of truth)
  try {
    const storagePath = await uploadSparkToStorage(user.id, sparkId, sparkData)
    console.log(`[Sparks] ✓ Uploaded to Storage: ${storagePath}`)
  } catch (error) {
    console.error(`[Sparks] Storage upload failed:`, error)
    // Continue - Storage can be rebuilt from ECS if needed
  }

  // 6. Update query cache (optional, non-fatal)
  try {
    await supabase.from('sparks_cache').insert({
      entity_id: sparkId,
      user_id: user.id,
      content: input.content,
      created_at: new Date().toISOString(),
      origin_chunk_id: input.context.originChunkId,
      document_id: input.context.documentId,
      tags,
      connections,
      embedding: null, // TODO: Generate via background job
      storage_path: `${user.id}/sparks/${sparkId}/content.json`,
      cached_at: new Date().toISOString(),
    })
    console.log(`[Sparks] ✓ Updated query cache`)
  } catch (error) {
    console.error(`[Sparks] Cache update failed (non-critical):`, error)
  }

  // 7. Revalidate paths
  revalidatePath('/sparks')
  revalidatePath(`/read/${input.context.documentId}`)

  return { success: true, sparkId }
}

/**
 * Delete spark (cascade delete)
 */
export async function deleteSpark(sparkId: string) {
  const user = await getCurrentUser()
  if (!user) throw new Error('Unauthorized')

  const supabase = await createClient()
  const ecs = createECS()
  const ops = new SparkOperations(ecs, user.id)

  // 1. Delete from Storage
  const storagePath = `${user.id}/sparks/${sparkId}/content.json`
  try {
    await supabase.storage.from('documents').remove([storagePath])
  } catch (error) {
    console.error(`[Sparks] Storage delete failed (non-critical):`, error)
  }

  // 2. Delete ECS entity (cascades to components)
  await ops.delete(sparkId)

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
 * Link annotation to spark
 */
export async function linkAnnotationToSpark(
  sparkId: string,
  annotationId: string
) {
  const user = await getCurrentUser()
  if (!user) throw new Error('Unauthorized')

  const ecs = createECS()
  const ops = new SparkOperations(ecs, user.id)

  await ops.addAnnotationRef(sparkId, annotationId)

  revalidatePath('/sparks')
  return { success: true }
}

/**
 * Unlink annotation from spark
 */
export async function unlinkAnnotationFromSpark(
  sparkId: string,
  annotationId: string
) {
  const user = await getCurrentUser()
  if (!user) throw new Error('Unauthorized')

  const ecs = createECS()
  const ops = new SparkOperations(ecs, user.id)

  await ops.removeAnnotationRef(sparkId, annotationId)

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
