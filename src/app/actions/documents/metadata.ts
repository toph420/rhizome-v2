'use server'

import { revalidatePath } from 'next/cache'
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

/**
 * Updates editable metadata fields for a document
 * Supports inline editing of title, author, description, and publication_date
 *
 * @param documentId - Document ID to update
 * @param updates - Metadata fields to update
 * @returns Success/error result
 */
export async function updateDocumentMetadata(
  documentId: string,
  updates: {
    title?: string
    author?: string | null
    description?: string | null
    publication_date?: string | null
  }
): Promise<{ success: boolean; error?: string }> {
  return withErrorHandling(async () => {
    // Validate input
    await validateDocumentId(documentId)

    // Ensure at least one field is being updated
    if (Object.keys(updates).length === 0) {
      throw new Error('No fields to update')
    }

    // Validate title if provided (required field, cannot be empty)
    if (updates.title !== undefined) {
      const trimmed = updates.title.trim()
      if (!trimmed) {
        throw new Error('Title cannot be empty')
      }
      updates.title = trimmed
    }

    // Trim other string fields
    if (updates.author !== undefined && updates.author !== null) {
      updates.author = updates.author.trim() || null
    }
    if (updates.description !== undefined && updates.description !== null) {
      updates.description = updates.description.trim() || null
    }

    // Get authenticated user and Supabase client
    const { user, supabase } = await getAuthContext()

    // Update document metadata
    const { error } = await supabase
      .from('documents')
      .update(updates)
      .eq('id', documentId)
      .eq('user_id', user.id) // Ensure user owns the document

    if (error) {
      throw new Error(`Failed to update metadata: ${error.message}`)
    }

    // Revalidate library page to show updated metadata
    revalidatePath('/library')

    return {}
  })
}
