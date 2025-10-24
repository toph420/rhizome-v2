import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { FlashcardStorageJson } from './types'

/**
 * Upload flashcard to Storage (source of truth)
 * Path: {userId}/flashcards/{cardId}.json (flat structure)
 *
 * Pattern: Exactly like sparks at src/lib/sparks/storage.ts:14-42
 */
export async function uploadFlashcardToStorage(
  userId: string,
  flashcardId: string,
  flashcardData: FlashcardStorageJson
): Promise<string> {
  // Use admin client to bypass Storage RLS (personal tool pattern)
  const supabase = createAdminClient()

  // Flat structure: files directly in flashcards/ folder
  const jsonPath = `${userId}/flashcards/${flashcardId}.json`

  // Use Blob wrapper to preserve JSON formatting
  const jsonBlob = new Blob([JSON.stringify(flashcardData, null, 2)], {
    type: 'application/json'
  })

  const { error } = await supabase.storage
    .from('documents')
    .upload(jsonPath, jsonBlob, {
      contentType: 'application/json',
      upsert: true
    })

  if (error) {
    throw new Error(`Failed to upload flashcard to Storage: ${error.message}`)
  }

  console.log(`[Flashcards] ✓ Uploaded to Storage: ${jsonPath}`)
  return jsonPath
}

/**
 * Download flashcard from Storage
 */
export async function downloadFlashcardFromStorage(
  userId: string,
  flashcardId: string
): Promise<FlashcardStorageJson> {
  const supabase = createAdminClient()
  const jsonPath = `${userId}/flashcards/${flashcardId}.json`

  // Create signed URL (1 hour expiry)
  const { data: signedUrlData, error: urlError } = await supabase.storage
    .from('documents')
    .createSignedUrl(jsonPath, 3600)

  if (urlError || !signedUrlData?.signedUrl) {
    throw new Error(`Failed to create signed URL for ${jsonPath}`)
  }

  // Fetch and parse JSON
  const response = await fetch(signedUrlData.signedUrl)
  if (!response.ok) {
    throw new Error(`Storage read failed for ${jsonPath}: ${response.statusText}`)
  }

  const data = await response.json()
  console.log(`[Flashcards] ✓ Read from Storage: ${jsonPath}`)

  return data as FlashcardStorageJson
}

/**
 * List all flashcard files in Storage for a user
 * Returns filenames (which are the flashcardIds)
 */
export async function listUserFlashcards(userId: string): Promise<string[]> {
  const supabase = createAdminClient()

  const { data: files, error } = await supabase.storage
    .from('documents')
    .list(`${userId}/flashcards`, {
      limit: 10000,
      offset: 0
    })

  if (error) {
    throw new Error(`Failed to list flashcards: ${error.message}`)
  }

  // Return filenames (filter out directories)
  return (files || [])
    .filter(f => f.name.endsWith('.json'))
    .map(f => f.name.replace('.json', ''))
}

/**
 * Verify Storage integrity (for diagnostics)
 * Returns true if Storage count matches ECS entity count
 */
export async function verifyFlashcardsIntegrity(userId: string): Promise<{
  storageCount: number
  entityCount: number
  matched: boolean
}> {
  const supabase = await createClient()

  // Count files in Storage
  const flashcardIds = await listUserFlashcards(userId)
  const storageCount = flashcardIds.length

  // Count ECS entities with Card component
  const { data: components } = await supabase
    .from('components')
    .select('entity_id')
    .eq('component_type', 'Card')
    .eq('user_id', userId)

  const entityCount = components?.length || 0

  return {
    storageCount,
    entityCount,
    matched: storageCount === entityCount
  }
}
