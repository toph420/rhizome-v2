'use server'

import { getAuthContext, validateDocumentId, withErrorHandling } from './utils'

/**
 * Updates the last_viewed timestamp for a document
 * Called when user opens a document in the reader
 *
 * @param documentId - Document ID to update
 * @returns Success/error result
 */
export async function updateLastViewed(
  documentId: string
): Promise<{ success: boolean; error?: string }> {
  return withErrorHandling(async () => {
    // Validate input
    await validateDocumentId(documentId)

    // Get authenticated user and Supabase client
    const { user, supabase } = await getAuthContext()

    // Update last_viewed timestamp
    const { error } = await supabase
      .from('documents')
      .update({ last_viewed: new Date().toISOString() })
      .eq('id', documentId)
      .eq('user_id', user.id) // Ensure user owns the document

    if (error) {
      throw new Error(`Failed to update last_viewed: ${error.message}`)
    }

    // No need to revalidate - last_viewed is a background tracking field
    // that doesn't affect the current page UI

    return {}
  })
}
