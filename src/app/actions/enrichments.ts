'use server'

import { createClient } from '@/lib/supabase/server'
import { getCurrentUser } from '@/lib/auth'
import { revalidatePath } from 'next/cache'

/**
 * Trigger enrichment for specific chunks (batch mode).
 * Called from UI components for selected chunks.
 */
export async function enrichChunksForDocument(
  documentId: string,
  chunkIds: string[]
): Promise<{ success: boolean; jobId?: string; error?: string }> {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return { success: false, error: 'Not authenticated' }
    }

    const supabase = await createClient()

    console.log(`[enrichChunksForDocument] Starting for ${chunkIds.length} chunks`)

    // Create background job for enrichment
    const { data: job, error: jobError } = await supabase
      .from('background_jobs')
      .insert({
        job_type: 'enrich_chunks',
        input_data: {
          document_id: documentId,
          chunk_ids: chunkIds
        },
        entity_id: documentId,
        user_id: user.id,
        status: 'pending'
      })
      .select()
      .single()

    if (jobError) {
      return { success: false, error: `Failed to create job: ${jobError.message}` }
    }

    // Revalidate reader page to show enrichment started
    revalidatePath(`/read/${documentId}`)

    return { success: true, jobId: job.id }
  } catch (error) {
    console.error('[enrichChunksForDocument] Error:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

/**
 * Trigger enrichment AND connection detection for specific chunks.
 * Called from "Enrich & Connect" button.
 */
export async function enrichAndConnectChunks(
  documentId: string,
  chunkIds: string[]
): Promise<{ success: boolean; jobId?: string; error?: string }> {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return { success: false, error: 'Not authenticated' }
    }

    const supabase = await createClient()

    console.log(`[enrichAndConnectChunks] Starting for ${chunkIds.length} chunks`)

    // Create background job (handler will run enrichment THEN connections)
    const { data: job, error: jobError } = await supabase
      .from('background_jobs')
      .insert({
        job_type: 'enrich_and_connect',
        input_data: {
          document_id: documentId,
          chunk_ids: chunkIds
        },
        entity_id: documentId,
        user_id: user.id,
        status: 'pending'
      })
      .select()
      .single()

    if (jobError) {
      return { success: false, error: `Failed to create job: ${jobError.message}` }
    }

    revalidatePath(`/read/${documentId}`)

    return { success: true, jobId: job.id }
  } catch (error) {
    console.error('[enrichAndConnectChunks] Error:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

/**
 * Trigger enrichment for all unenriched chunks in a document.
 * Called from Admin Panel batch operations.
 */
export async function enrichAllUnenrichedChunks(
  documentId: string
): Promise<{ success: boolean; jobId?: string; chunkCount?: number; error?: string }> {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return { success: false, error: 'Not authenticated' }
    }

    const supabase = await createClient()

    // Get all unenriched chunk IDs using RPC function
    const { data: chunkIds, error: rpcError } = await supabase
      .rpc('get_unenriched_chunk_ids', { doc_id: documentId })

    if (rpcError) {
      return { success: false, error: `RPC failed: ${rpcError.message}` }
    }

    if (!chunkIds || chunkIds.length === 0) {
      return { success: true, error: 'All chunks already enriched', chunkCount: 0 }
    }

    // Create batch enrichment job
    const { data: job, error: jobError } = await supabase
      .from('background_jobs')
      .insert({
        job_type: 'enrich_chunks',
        input_data: {
          document_id: documentId,
          chunk_ids: chunkIds.map((c: any) => c.chunk_id),
          trigger: 'admin_enrich_all'
        },
        entity_id: documentId,
        user_id: user.id,
        status: 'pending'
      })
      .select()
      .single()

    if (jobError) {
      return { success: false, error: `Failed to create job: ${jobError.message}` }
    }

    revalidatePath(`/read/${documentId}`)

    return { success: true, jobId: job.id, chunkCount: chunkIds.length }
  } catch (error) {
    console.error('[enrichAllUnenrichedChunks] Error:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

/**
 * Load enrichment statistics for a document.
 * Called by UI to show enrichment progress.
 */
export async function loadChunkEnrichmentStats(
  documentId: string
): Promise<{
  total: number
  enriched: number
  skipped: number
  pending: number
  error: number
} | null> {
  try {
    const supabase = await createClient()

    const { data, error } = await supabase
      .rpc('get_chunk_enrichment_stats', { doc_id: documentId })

    if (error) {
      console.error('[loadChunkEnrichmentStats] RPC failed:', error)
      return null
    }

    if (!data || data.length === 0) {
      return null
    }

    const stats = data[0]
    return {
      total: Number(stats.total_chunks),
      enriched: Number(stats.enriched_chunks),
      skipped: Number(stats.skipped_chunks),
      pending: Number(stats.pending_chunks),
      error: Number(stats.error_chunks)
    }
  } catch (error) {
    console.error('[loadChunkEnrichmentStats] Error:', error)
    return null
  }
}
