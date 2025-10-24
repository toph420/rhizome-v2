'use server'

import { z } from 'zod'
import { createECS } from '@/lib/ecs'
import { FlashcardOperations } from '@/lib/ecs/flashcards'
import { getCurrentUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { uploadFlashcardToStorage } from '@/lib/flashcards/storage'
import { revalidatePath } from 'next/cache'

// ============================================
// ZOD SCHEMAS
// ============================================

const CreateFlashcardSchema = z.object({
  type: z.enum(['basic', 'cloze']),
  question: z.string().min(1).max(5000),
  answer: z.string().min(1).max(10000),
  content: z.string().max(10000).optional(),
  clozeIndex: z.number().int().min(1).optional(),
  clozeCount: z.number().int().min(1).optional(),
  deckId: z.string().uuid(),
  tags: z.array(z.string()).optional(),
  note: z.string().max(10000).optional(),
  documentId: z.string().uuid().optional(),
  chunkIds: z.array(z.string().uuid()).optional(),
  connectionId: z.string().uuid().optional(),
  annotationId: z.string().uuid().optional(),
  generationJobId: z.string().uuid().optional(),
  parentCardId: z.string().uuid().optional(),
})

const UpdateFlashcardSchema = z.object({
  question: z.string().min(1).max(5000).optional(),
  answer: z.string().min(1).max(10000).optional(),
  tags: z.array(z.string()).optional(),
  note: z.string().max(10000).optional(),
  status: z.enum(['draft', 'active', 'suspended']).optional(),
  deckId: z.string().uuid().optional(),
})

const ReviewCardSchema = z.object({
  rating: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
  timeSpentMs: z.number().int().min(0),
})

// ============================================
// SERVER ACTIONS
// ============================================

/**
 * Create flashcard entity with ECS + Storage upload
 * Pattern: Exactly like createSpark at src/app/actions/sparks.ts:36-166
 */
export async function createFlashcard(input: z.infer<typeof CreateFlashcardSchema>) {
  const user = await getCurrentUser()
  if (!user) throw new Error('Unauthorized')

  try {
    // 1. Validate input
    const validated = CreateFlashcardSchema.parse(input)

    // 2. Create ECS entity
    const ecs = createECS()
    const ops = new FlashcardOperations(ecs, user.id)

    const flashcardId = await ops.create({
      ...validated,
      generatedBy: 'manual',  // Manual creation from UI
    })

    console.log(`[Flashcards] ✓ Created ECS entity: ${flashcardId}`)

    // 3. Build Storage JSON (ECS structure)
    const flashcardData = {
      entityId: flashcardId,
      userId: user.id,
      card: {
        type: validated.type,
        question: validated.question,
        answer: validated.answer,
        content: validated.content,
        clozeIndex: validated.clozeIndex,
        clozeCount: validated.clozeCount,
        status: 'draft' as const,
        srs: null,
        deckId: validated.deckId,
        deckAddedAt: new Date().toISOString(),
        generatedBy: 'manual' as const,
      },
      content: {
        note: validated.note,
        tags: validated.tags || [],
      },
      temporal: {
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      chunkRef: validated.documentId || validated.chunkIds?.length ? {
        documentId: validated.documentId || null,
        document_id: validated.documentId || null,
        chunkId: validated.chunkIds?.[0] || null,
        chunk_id: validated.chunkIds?.[0] || null,
        chunkIds: validated.chunkIds || [],
        connectionId: validated.connectionId,
        annotationId: validated.annotationId,
        generationJobId: validated.generationJobId,
      } : undefined,
    }

    // 4. Upload to Storage (async, non-blocking)
    // Pattern from sparks.ts:117-135
    uploadFlashcardToStorage(user.id, flashcardId, flashcardData).catch(error => {
      console.error(`[Flashcards] ⚠️ Storage upload failed:`, error)
      // Continue - Storage can be rebuilt from ECS if needed
    })

    // 5. Update cache (async, non-fatal)
    // Pattern from sparks.ts:138-157
    try {
      const adminClient = createAdminClient()
      await adminClient.from('flashcards_cache').insert({
        entity_id: flashcardId,
        user_id: user.id,
        card_type: validated.type,
        question: validated.question,
        answer: validated.answer,
        content: validated.content,
        cloze_index: validated.clozeIndex,
        cloze_count: validated.clozeCount,
        status: 'draft',
        deck_id: validated.deckId,
        deck_added_at: new Date().toISOString(),
        tags: validated.tags || [],
        next_review: null,  // No review until approved
        document_id: validated.documentId || null,
        chunk_ids: validated.chunkIds || [],
        connection_id: validated.connectionId || null,
        annotation_id: validated.annotationId || null,
        generation_job_id: validated.generationJobId || null,
        storage_path: `${user.id}/flashcards/${flashcardId}.json`,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        cached_at: new Date().toISOString(),
      })
    } catch (error) {
      console.error(`[Flashcards] Cache update failed (non-critical):`, error)
    }

    // 6. Revalidate paths
    revalidatePath('/flashcards')
    if (validated.documentId) {
      revalidatePath(`/read/${validated.documentId}`)
    }

    return { success: true, flashcardId }

  } catch (error) {
    console.error('[Flashcards] Create failed:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

/**
 * Update flashcard content
 */
export async function updateFlashcard(
  flashcardId: string,
  updates: z.infer<typeof UpdateFlashcardSchema>
) {
  const user = await getCurrentUser()
  if (!user) throw new Error('Unauthorized')

  try {
    const validated = UpdateFlashcardSchema.parse(updates)

    const ecs = createECS()
    const ops = new FlashcardOperations(ecs, user.id)

    await ops.update(flashcardId, validated)

    // Fetch updated entity for Storage sync
    const entity = await ecs.getEntity(flashcardId, user.id)
    if (!entity) throw new Error('Flashcard not found')

    const card = entity.components?.find(c => c.component_type === 'Card')?.data
    const content = entity.components?.find(c => c.component_type === 'Content')?.data
    const temporal = entity.components?.find(c => c.component_type === 'Temporal')?.data
    const chunkRef = entity.components?.find(c => c.component_type === 'ChunkRef')?.data

    // Update Storage (async) - ECS structure
    const flashcardData = {
      entityId: flashcardId,
      userId: user.id,
      card: {
        type: card?.type || 'basic' as const,
        question: card?.question || '',
        answer: card?.answer || '',
        content: card?.content,
        clozeIndex: card?.clozeIndex,
        clozeCount: card?.clozeCount,
        status: (card?.status || 'draft') as 'draft' | 'active' | 'suspended',
        srs: card?.srs || null,
        deckId: card?.deckId || validated.deckId || '',
        deckAddedAt: card?.deckAddedAt || new Date().toISOString(),
        generatedBy: card?.generatedBy as 'manual' | 'ai' | 'import' | undefined,
        generationPromptVersion: card?.generationPromptVersion,
      },
      content: {
        tags: content?.tags || [],
        note: content?.note,
      },
      temporal: {
        createdAt: temporal?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      chunkRef: chunkRef ? {
        documentId: chunkRef.documentId || null,
        document_id: chunkRef.documentId || null,
        chunkId: chunkRef.chunkIds?.[0] || null,
        chunk_id: chunkRef.chunkIds?.[0] || null,
        chunkIds: chunkRef.chunkIds || [],
        connectionId: chunkRef.connectionId,
        annotationId: chunkRef.annotationId,
        generationJobId: chunkRef.generationJobId,
      } : undefined,
    }

    uploadFlashcardToStorage(user.id, flashcardId, flashcardData).catch(console.error)

    // Update cache
    try {
      const adminClient = createAdminClient()
      await adminClient
        .from('flashcards_cache')
        .update({
          question: validated.question,
          answer: validated.answer,
          status: validated.status,
          deck_id: validated.deckId,
          tags: validated.tags,
          updated_at: new Date().toISOString(),
        })
        .eq('entity_id', flashcardId)
    } catch (error) {
      console.error(`[Flashcards] Cache update failed:`, error)
    }

    revalidatePath('/flashcards')

    return { success: true }

  } catch (error) {
    console.error('[Flashcards] Update failed:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

/**
 * Approve flashcard (draft → active, adds SRS component)
 */
export async function approveFlashcard(flashcardId: string) {
  const user = await getCurrentUser()
  if (!user) throw new Error('Unauthorized')

  try {
    const ecs = createECS()
    const ops = new FlashcardOperations(ecs, user.id)

    await ops.approve(flashcardId)

    console.log(`[Flashcards] ✓ Approved: ${flashcardId}`)

    // Update cache with new SRS state
    // (Cache rebuild happens automatically)

    revalidatePath('/flashcards')

    return { success: true }

  } catch (error) {
    console.error('[Flashcards] Approve failed:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

/**
 * Review flashcard (updates SRS schedule)
 */
export async function reviewCard(
  flashcardId: string,
  input: z.infer<typeof ReviewCardSchema>
) {
  const user = await getCurrentUser()
  if (!user) throw new Error('Unauthorized')

  try {
    const validated = ReviewCardSchema.parse(input)

    const ecs = createECS()
    const ops = new FlashcardOperations(ecs, user.id)

    const updatedCard = await ops.review(flashcardId, {
      rating: validated.rating,
      timeSpentMs: validated.timeSpentMs,
    })

    console.log(`[Flashcards] ✓ Reviewed: ${flashcardId}, next: ${updatedCard.due}`)

    // Update cache with new SRS state
    try {
      const adminClient = createAdminClient()
      await adminClient
        .from('flashcards_cache')
        .update({
          next_review: updatedCard.due.toISOString(),
          last_review: new Date().toISOString(),
          stability: updatedCard.stability,
          difficulty: updatedCard.difficulty,
          reps: updatedCard.reps,
          lapses: updatedCard.lapses,
          srs_state: updatedCard.state,
          is_mature: updatedCard.stability > 21,  // Mature if stability > 21 days
          updated_at: new Date().toISOString(),
        })
        .eq('entity_id', flashcardId)
    } catch (error) {
      console.error(`[Flashcards] Cache update failed:`, error)
    }

    revalidatePath('/flashcards')

    return {
      success: true,
      nextReview: updatedCard.due,
      stability: updatedCard.stability,
      difficulty: updatedCard.difficulty,
    }

  } catch (error) {
    console.error('[Flashcards] Review failed:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

/**
 * Delete flashcard (hard delete from ECS)
 */
export async function deleteFlashcard(flashcardId: string) {
  const user = await getCurrentUser()
  if (!user) throw new Error('Unauthorized')

  try {
    const ecs = createECS()
    const ops = new FlashcardOperations(ecs, user.id)

    await ops.delete(flashcardId)

    console.log(`[Flashcards] ✓ Deleted: ${flashcardId}`)

    // Cache row will cascade delete (ON DELETE CASCADE)

    revalidatePath('/flashcards')

    return { success: true }

  } catch (error) {
    console.error('[Flashcards] Delete failed:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

/**
 * Get due flashcards (for study sessions)
 * Uses cache table for performance
 */
export async function getDueFlashcards(deckId?: string, limit: number = 50) {
  const user = await getCurrentUser()
  if (!user) throw new Error('Unauthorized')

  const adminClient = createAdminClient()
  const now = new Date().toISOString()

  let query = adminClient
    .from('flashcards_cache')
    .select('*')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .lte('next_review', now)
    .order('next_review', { ascending: true })
    .limit(limit)

  if (deckId) {
    query = query.eq('deck_id', deckId)
  }

  const { data, error } = await query

  if (error) throw error

  return data
}

// ============================================
// AI GENERATION
// ============================================

const GenerateFlashcardsSchema = z.object({
  sourceType: z.enum(['document', 'chunks', 'selection']),
  sourceIds: z.array(z.string().uuid()).min(1),
  cardCount: z.number().int().min(1).max(50),
  deckId: z.string().uuid(),
})

/**
 * Trigger background job to generate flashcards
 * AI-powered generation from documents or chunks
 *
 * @param input - Generation configuration
 * @returns Job ID for polling status
 */
export async function generateFlashcards(input: z.infer<typeof GenerateFlashcardsSchema>) {
  const user = await getCurrentUser()
  if (!user) throw new Error('Unauthorized')

  try {
    const validated = GenerateFlashcardsSchema.parse(input)
    const supabase = createAdminClient()

    // Create background job
    const { data: job, error } = await supabase
      .from('background_jobs')
      .insert({
        user_id: user.id,
        job_type: 'generate_flashcards',
        entity_type: 'flashcard',
        status: 'pending',
        input_data: {
          sourceType: validated.sourceType,
          sourceIds: validated.sourceIds,
          cardCount: validated.cardCount,
          userId: user.id,
          deckId: validated.deckId,
        },
      })
      .select()
      .single()

    if (error) throw error

    console.log(`[GenerateFlashcards] Created job: ${job.id}`)

    revalidatePath('/flashcards')

    return { success: true, jobId: job.id }

  } catch (error) {
    console.error('[GenerateFlashcards] Failed to create job:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

/**
 * Poll job status (for UI progress tracking)
 *
 * @param jobId - Background job ID
 * @returns Job status, progress, and output data
 */
export async function getGenerationJobStatus(jobId: string) {
  const user = await getCurrentUser()
  if (!user) throw new Error('Unauthorized')

  try {
    const supabase = createAdminClient()

    const { data: job, error } = await supabase
      .from('background_jobs')
      .select('status, progress, output_data, error_message')
      .eq('id', jobId)
      .eq('user_id', user.id)
      .single()

    if (error) throw error

    return {
      success: true,
      status: job.status,
      progress: job.progress,
      outputData: job.output_data,
      error: job.error_message,
    }

  } catch (error) {
    console.error('[GenerateFlashcards] Get status failed:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

// ============================================
// QUERY OPERATIONS
// ============================================

/**
 * Get flashcards by document
 * Uses flashcards_cache for performance
 */
export async function getFlashcardsByDocument(
  documentId: string,
  status?: 'draft' | 'approved'
) {
  const user = await getCurrentUser()
  if (!user) throw new Error('Unauthorized')

  const supabase = createAdminClient()

  let query = supabase
    .from('flashcards_cache')
    .select('*')
    .eq('user_id', user.id)
    .eq('document_id', documentId)
    .order('created_at', { ascending: false })

  if (status) {
    query = query.eq('status', status)
  }

  const { data, error } = await query

  if (error) throw error

  return data || []
}

// ============================================
// BATCH OPERATIONS
// ============================================

/**
 * Batch approve flashcards
 * Converts all cards from draft to active status with SRS
 */
export async function batchApproveFlashcards(entityIds: string[]) {
  const user = await getCurrentUser()
  if (!user) throw new Error('Unauthorized')

  try {
    const ecs = createECS()
    const ops = new FlashcardOperations(ecs, user.id)

    for (const id of entityIds) {
      await ops.approve(id)
    }

    // Rebuild cache
    const supabase = createAdminClient()
    await supabase.rpc('rebuild_flashcards_cache', { p_user_id: user.id })

    revalidatePath('/flashcards')

    return { success: true, approvedCount: entityIds.length }

  } catch (error) {
    console.error('[Flashcards] Batch approve failed:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

/**
 * Batch delete flashcards
 * Permanently removes cards from ECS and Storage
 */
export async function batchDeleteFlashcards(entityIds: string[]) {
  const user = await getCurrentUser()
  if (!user) throw new Error('Unauthorized')

  try {
    const ecs = createECS()
    const ops = new FlashcardOperations(ecs, user.id)

    for (const id of entityIds) {
      await ops.delete(id)
      // Also delete from Storage (fire-and-forget)
      try {
        const { deleteFlashcardFromStorage } = await import('@/lib/flashcards/storage')
        await deleteFlashcardFromStorage(user.id, id)
      } catch (err) {
        console.warn(`Failed to delete flashcard ${id} from Storage:`, err)
      }
    }

    revalidatePath('/flashcards')

    return { success: true, deletedCount: entityIds.length }

  } catch (error) {
    console.error('[Flashcards] Batch delete failed:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

/**
 * Batch add tags to flashcards
 * Appends tags to existing tags (no duplicates)
 */
export async function batchAddTags(entityIds: string[], tags: string[]) {
  const user = await getCurrentUser()
  if (!user) throw new Error('Unauthorized')

  try {
    const ecs = createECS()

    for (const entityId of entityIds) {
      const entity = await ecs.getEntity(entityId, user.id)
      if (!entity) continue

      const contentComp = entity.components?.find(c => c.component_type === 'Content')
      if (!contentComp) continue

      const existingTags = contentComp.data.tags || []
      const newTags = Array.from(new Set([...existingTags, ...tags]))

      await ecs.updateComponent(
        contentComp.id,
        { ...contentComp.data, tags: newTags },
        user.id
      )
    }

    const supabase = createAdminClient()
    await supabase.rpc('rebuild_flashcards_cache', { p_user_id: user.id })

    revalidatePath('/flashcards')

    return { success: true }

  } catch (error) {
    console.error('[Flashcards] Batch add tags failed:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

/**
 * Batch move flashcards to a different deck
 */
export async function batchMoveToDeck(entityIds: string[], deckId: string) {
  const user = await getCurrentUser()
  if (!user) throw new Error('Unauthorized')

  try {
    const ecs = createECS()

    for (const entityId of entityIds) {
      const entity = await ecs.getEntity(entityId, user.id)
      if (!entity) continue

      const cardComp = entity.components?.find(c => c.component_type === 'Card')
      if (!cardComp) continue

      await ecs.updateComponent(
        cardComp.id,
        { ...cardComp.data, deckId, deckAddedAt: new Date().toISOString() },
        user.id
      )
    }

    const supabase = createAdminClient()
    await supabase.rpc('rebuild_flashcards_cache', { p_user_id: user.id })

    revalidatePath('/flashcards')

    return { success: true }

  } catch (error) {
    console.error('[Flashcards] Batch move failed:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}
