'use server'

import { getCurrentUser, getSupabaseClient } from '@/lib/auth'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Standard error response type for all document actions
 */
export type ActionResult<T extends Record<string, unknown> = Record<string, never>> =
  | ({ success: true } & T)
  | { success: false; error: string }

/**
 * Gets authenticated user and Supabase client
 * Throws error if not authenticated
 */
export async function getAuthContext() {
  const user = await getCurrentUser()
  if (!user) {
    throw new Error('Authentication required')
  }
  const supabase = getSupabaseClient()
  return { user, supabase }
}

/**
 * Creates a background job for document processing
 * @param userId - User ID
 * @param jobType - Type of job to create
 * @param entityId - Document ID or primary entity ID
 * @param inputData - Job input data
 * @returns Job ID
 */
export async function createBackgroundJob(
  userId: string,
  jobType: string,
  entityId: string,
  inputData: Record<string, unknown>
): Promise<string> {
  const supabase = getSupabaseClient()

  const { data: job, error } = await supabase
    .from('background_jobs')
    .insert({
      user_id: userId,
      job_type: jobType,
      entity_type: 'document',
      entity_id: entityId,
      input_data: inputData
    })
    .select()
    .single()

  if (error) {
    throw new Error(`Job creation failed: ${error.message}`)
  }

  return job.id
}

/**
 * Validates that user owns the specified documents
 * @param supabase - Supabase client
 * @param userId - User ID to check ownership
 * @param documentId - Single document ID or array of IDs
 * @returns Array of document records
 * @throws Error if user doesn't own any of the documents
 */
export async function validateDocumentOwnership(
  supabase: SupabaseClient,
  userId: string,
  documentId: string | string[]
) {
  const ids = Array.isArray(documentId) ? documentId : [documentId]

  const { data: docs, error } = await supabase
    .from('documents')
    .select('id, user_id, title')
    .in('id', ids)

  if (error) {
    throw new Error(`Database error: ${error.message}`)
  }

  if (!docs || docs.length === 0) {
    throw new Error('Documents not found')
  }

  const unauthorized = docs.filter(doc => doc.user_id !== userId)
  if (unauthorized.length > 0) {
    throw new Error(`Not authorized to access: ${unauthorized.map(d => d.title).join(', ')}`)
  }

  return docs
}

/**
 * Validates a document ID is a valid non-empty string
 * @param documentId - Document ID to validate
 * @throws Error if invalid
 * @internal Not exported - internal helper only
 */
function validateDocumentIdInternal(documentId: unknown): asserts documentId is string {
  if (!documentId || typeof documentId !== 'string') {
    throw new Error('Invalid document ID')
  }
}

/**
 * Validates a document ID is a valid non-empty string
 * Server Action compatible async version
 * @param documentId - Document ID to validate
 * @throws Error if invalid
 */
export async function validateDocumentId(documentId: unknown): Promise<void> {
  validateDocumentIdInternal(documentId)
}

/**
 * Wraps an async function with standard error handling
 * Returns { success: true, ...result } on success
 * Returns { success: false, error: string } on failure
 */
export async function withErrorHandling<T extends Record<string, unknown>>(
  fn: () => Promise<T>
): Promise<ActionResult<T>> {
  try {
    const result = await fn()
    return { success: true, ...result }
  } catch (error) {
    console.error('[withErrorHandling] Error:', error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    return { success: false, error: message }
  }
}
