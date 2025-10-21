'use server'

import { getAuthContext } from './utils'
import type { JobProgress } from './types'

/**
 * Gets the active background job for a document.
 * @param documentId - Document ID to check
 * @returns Job info or null
 */
export async function getDocumentJob(documentId: string): Promise<{
  id: string
  status: string
  progress: JobProgress
  last_error: string | null
} | null> {
  try {
    const { user, supabase } = await getAuthContext()

    const { data, error } = await supabase
      .from('background_jobs')
      .select('id, status, progress, last_error')
      .eq('entity_type', 'document')
      .eq('entity_id', documentId)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (error) return null
    return data
  } catch {
    return null
  }
}
