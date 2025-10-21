'use server'

import { revalidatePath } from 'next/cache'
import { getCurrentUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createECS } from '@/lib/ecs'
import { SparkOperations } from '@/lib/ecs/sparks'
import {
  uploadSparkToStorage,
  buildSparkConnections,
  extractTags,
} from '@/lib/sparks'
import { generateSparkTitle, generateSparkFilename } from '@/lib/sparks/title-generator'
import type { SparkContext, SparkStorageJson, SparkSelection } from '@/lib/sparks/types'

interface CreateSparkInput {
  title?: string  // Optional - AI-generated if not provided
  content: string
  selections?: SparkSelection[]
  context?: SparkContext  // Optional - can create sparks without document context
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

  // 1. Generate title if not provided
  const title = input.title || await generateSparkTitle(input.content)

  // 2. Get document title if documentId provided (for denormalization)
  let documentTitle: string | undefined
  if (input.context?.documentId) {
    const { data: doc } = await supabase
      .from('documents')
      .select('title')
      .eq('id', input.context.documentId)
      .single()
    documentTitle = doc?.title
  }

  // 3. Extract metadata from content
  const tags = extractTags(input.content)
  const connections = input.context?.originChunkId
    ? await buildSparkConnections(input.content, input.context.originChunkId, user.id)
    : []

  // 4. Get origin chunk content for recovery (if context provided)
  let originChunkContent: string | undefined
  if (input.context?.originChunkId) {
    const { data: originChunk } = await supabase
      .from('chunks')
      .select('content')
      .eq('id', input.context.originChunkId)
      .single()
    originChunkContent = originChunk?.content?.slice(0, 500)
  }

  // 5. Create ECS entity using SparkOperations (3-4 component pattern)
  const ecs = createECS()
  const ops = new SparkOperations(ecs, user.id)

  const sparkId = await ops.create({
    title,
    content: input.content,
    selections: input.selections || [],
    tags,
    connections,
    // Optional fields (only if context provided)
    chunkId: input.context?.originChunkId,
    chunkIds: input.context?.visibleChunks,
    documentId: input.context?.documentId,
    documentTitle,  // Denormalized for orphan detection
    originChunkContent,
  })

  console.log(`[Sparks] ✓ Created ECS entity: ${sparkId} with title: "${title}"`)

  // 6. Generate filename with title
  const filename = generateSparkFilename(title)

  // 7. Build complete Storage JSON (with title)
  const sparkData: SparkStorageJson = {
    entity_id: sparkId,
    user_id: user.id,
    component_type: 'spark',
    data: {
      title,  // Include title
      content: input.content,
      createdAt: new Date().toISOString(),
      tags,
      connections,
      selections: input.selections || [],
    },
    context: input.context || null,
    source: input.context ? {
      chunk_id: input.context.originChunkId,
      document_id: input.context.documentId,
    } : null,
  }

  // 8. Upload to Storage with NEW naming convention (using admin client to bypass RLS)
  try {
    const adminClient = createAdminClient()
    const { error: uploadError } = await adminClient.storage
      .from('documents')
      .upload(`${user.id}/sparks/${filename}`, JSON.stringify(sparkData, null, 2), {
        contentType: 'application/json',
        upsert: true, // Allow overwriting existing files
      })

    if (uploadError) {
      throw uploadError
    }

    console.log(`[Sparks] ✓ Uploaded to Storage: ${user.id}/sparks/${filename}`)
  } catch (error) {
    console.error(`[Sparks] ⚠️ Storage upload failed:`, error)
    // Continue - Storage can be rebuilt from ECS if needed
    // But this should be investigated if it happens frequently
  }

  // 9. Update query cache (optional, non-fatal)
  try {
    await supabase.from('sparks_cache').insert({
      entity_id: sparkId,
      user_id: user.id,
      content: input.content,
      created_at: new Date().toISOString(),
      origin_chunk_id: input.context?.originChunkId || null,
      document_id: input.context?.documentId || null,
      tags,
      connections,
      selections: input.selections || [],
      annotation_refs: [],
      embedding: null,
      storage_path: `${user.id}/sparks/${filename}`,  // NEW path
      cached_at: new Date().toISOString(),
    })
    console.log(`[Sparks] ✓ Updated query cache`)
  } catch (error) {
    console.error(`[Sparks] Cache update failed (non-critical):`, error)
  }

  // 10. Revalidate paths
  revalidatePath('/sparks')
  if (input.context?.documentId) {
    revalidatePath(`/read/${input.context.documentId}`)
  }

  return { success: true, sparkId, title }
}

interface UpdateSparkInput {
  sparkId: string
  content?: string
  selections?: SparkSelection[]
  tags?: string[]
}

/**
 * Update existing spark
 *
 * Flow:
 * 1. Validate user authentication
 * 2. Extract updated metadata
 * 3. Update ECS components via SparkOperations
 * 4. Update Storage (source of truth)
 * 5. Update query cache
 * 6. Revalidate paths
 */
export async function updateSpark(input: UpdateSparkInput) {
  const user = await getCurrentUser()
  if (!user) throw new Error('Unauthorized')

  const supabase = await createClient()
  const ecs = createECS()
  const ops = new SparkOperations(ecs, user.id)

  // 1. Get current spark data BEFORE update (for Storage rebuild)
  const entityBefore = await ecs.getEntity(input.sparkId, user.id)
  if (!entityBefore) throw new Error('Spark not found')

  const sparkComponentBefore = entityBefore.components?.find((c: any) => c.component_type === 'Spark')
  const chunkRefComponent = entityBefore.components?.find((c: any) => c.component_type === 'ChunkRef')

  // 2. Update ECS components
  await ops.update(input.sparkId, {
    content: input.content,
    tags: input.tags,
  })

  // 3. Get FRESH spark data after update
  const entity = await ecs.getEntity(input.sparkId, user.id)
  if (!entity) throw new Error('Spark not found')

  const sparkComponent = entity.components?.find((c: any) => c.component_type === 'Spark')
  const contentComponent = entity.components?.find((c: any) => c.component_type === 'Content')

  if (input.selections !== undefined && sparkComponent) {
    // Update selections in Spark component if provided
    await supabase
      .from('components')
      .update({
        data: {
          ...sparkComponent.data,
          selections: input.selections
        }
      })
      .eq('entity_id', input.sparkId)
      .eq('component_type', 'Spark')
  }

  // Use fresh data from refetch for Storage
  const sparkData: SparkStorageJson = {
    entity_id: input.sparkId,
    user_id: user.id,
    component_type: 'spark',
    data: {
      content: contentComponent?.data.note || '',  // ✅ FIX: Use fresh data
      createdAt: entity.created_at,
      updatedAt: new Date().toISOString(),
      tags: contentComponent?.data.tags || [],     // ✅ FIX: Use fresh data
      connections: sparkComponent?.data.connections || [],
      selections: input.selections !== undefined ? input.selections : (sparkComponent?.data.selections || []),
    },
    context: {} as SparkContext, // Context doesn't change on update
    source: {
      chunk_id: chunkRefComponent?.data.chunkId || '',
      document_id: chunkRefComponent?.data.documentId || '',
    },
  }

  // 4. Update Storage
  try {
    const storagePath = await uploadSparkToStorage(user.id, input.sparkId, sparkData)
    console.log(`[Sparks] ✓ Updated in Storage: ${storagePath}`)
  } catch (error) {
    console.error(`[Sparks] Storage update failed:`, error)
  }

  // 5. Update query cache with FRESH data
  try {
    await supabase
      .from('sparks_cache')
      .update({
        content: contentComponent?.data.note,  // ✅ FIX: Use fresh data from refetch
        tags: contentComponent?.data.tags,      // ✅ FIX: Use fresh data from refetch
        selections: input.selections !== undefined ? input.selections : sparkComponent?.data.selections,
        updated_at: new Date().toISOString(),
      })
      .eq('entity_id', input.sparkId)
    console.log(`[Sparks] ✓ Updated query cache`)
  } catch (error) {
    console.error(`[Sparks] Cache update failed (non-critical):`, error)
  }

  // 6. Revalidate paths
  revalidatePath('/sparks')
  if (chunkRefComponent?.data.documentId) {
    revalidatePath(`/read/${chunkRefComponent.data.documentId}`)
  }

  return { success: true, sparkId: input.sparkId }
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
  // Flat structure: files directly in sparks/ folder
  const storagePath = `${user.id}/sparks/${sparkId}`
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

  const supabase = await createClient()
  const ecs = createECS()
  const ops = new SparkOperations(ecs, user.id)

  // Update Spark component
  await ops.addAnnotationRef(sparkId, annotationId)

  // Get fresh annotation_refs from Spark component
  const entity = await ecs.getEntity(sparkId, user.id)
  const sparkComponent = entity?.components?.find((c: any) => c.component_type === 'Spark')
  const annotationRefs = sparkComponent?.data.annotationRefs || []

  // Update cache
  try {
    await supabase
      .from('sparks_cache')
      .update({ annotation_refs: annotationRefs })
      .eq('entity_id', sparkId)
    console.log(`[Sparks] ✓ Updated cache with annotation refs`)
  } catch (error) {
    console.error(`[Sparks] Cache update failed (non-critical):`, error)
  }

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

  const supabase = await createClient()
  const ecs = createECS()
  const ops = new SparkOperations(ecs, user.id)

  // Update Spark component
  await ops.removeAnnotationRef(sparkId, annotationId)

  // Get fresh annotation_refs from Spark component
  const entity = await ecs.getEntity(sparkId, user.id)
  const sparkComponent = entity?.components?.find((c: any) => c.component_type === 'Spark')
  const annotationRefs = sparkComponent?.data.annotationRefs || []

  // Update cache
  try {
    await supabase
      .from('sparks_cache')
      .update({ annotation_refs: annotationRefs })
      .eq('entity_id', sparkId)
    console.log(`[Sparks] ✓ Updated cache with annotation refs`)
  } catch (error) {
    console.error(`[Sparks] Cache update failed (non-critical):`, error)
  }

  revalidatePath('/sparks')
  return { success: true }
}

/**
 * Get sparks for timeline (uses cache for performance)
 *
 * Pattern: Query cache table, fallback to ECS if needed
 *
 * @param limit - Maximum number of sparks to return
 * @param offset - Offset for pagination
 * @param documentId - Optional document ID to filter sparks
 */
export async function getRecentSparks(limit = 50, offset = 0, documentId?: string) {
  const user = await getCurrentUser()
  if (!user) throw new Error('Unauthorized')

  const supabase = await createClient()

  let query = supabase
    .from('sparks_cache')
    .select('*')
    .eq('user_id', user.id)

  // Filter by document if provided
  if (documentId) {
    query = query.eq('document_id', documentId)
  }

  const { data: sparks, error } = await query
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
