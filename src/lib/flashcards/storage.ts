import { createAdminClient } from '@/lib/supabase/admin'
import { z } from 'zod'

/**
 * Storage JSON schema (matches 4-component structure)
 *
 * Pattern: Exactly like src/lib/sparks/storage.ts
 * Storage is source of truth, Database is queryable cache.
 */
export const FlashcardStorageSchema = z.object({
  entityId: z.string().uuid(),
  userId: z.string().uuid(),
  card: z.object({
    type: z.enum(['basic', 'cloze']),
    question: z.string(),
    answer: z.string(),
    content: z.string().optional(),
    clozeIndex: z.number().optional(),
    clozeCount: z.number().optional(),
    status: z.enum(['draft', 'active', 'suspended']).default('draft'),
    srs: z.object({
      due: z.string(),
      stability: z.number(),
      difficulty: z.number(),
      elapsed_days: z.number(),
      scheduled_days: z.number(),
      learning_steps: z.number(),
      reps: z.number(),
      lapses: z.number(),
      state: z.number(),
      last_review: z.string().nullable(),
    }).nullable(),
    deckId: z.string().uuid(),
    deckAddedAt: z.string(),
    parentCardId: z.string().uuid().optional(),
    generatedBy: z.enum(['manual', 'ai', 'import']).optional(),
    generationPromptVersion: z.string().optional(),
  }),
  content: z.object({
    note: z.string().optional(),
    tags: z.array(z.string()),
  }),
  temporal: z.object({
    createdAt: z.string(),
    updatedAt: z.string(),
  }),
  chunkRef: z.object({
    documentId: z.string().uuid().nullable(),
    document_id: z.string().uuid().nullable(),
    chunkId: z.string().uuid().nullable(),
    chunk_id: z.string().uuid().nullable(),
    chunkIds: z.array(z.string().uuid()),
    chunkPosition: z.number().optional(),
    connectionId: z.string().uuid().optional(),
    annotationId: z.string().uuid().optional(),
    generationJobId: z.string().uuid().optional(),
  }).optional(),
})

export type FlashcardStorage = z.infer<typeof FlashcardStorageSchema>

/**
 * Upload flashcard to Storage
 * Path: {userId}/flashcards/card_{entityId}.json
 *
 * Uses admin client to bypass Storage RLS (personal tool pattern).
 */
export async function uploadFlashcardToStorage(
  userId: string,
  entityId: string,
  data: FlashcardStorage
): Promise<string> {
  const supabase = createAdminClient()
  const path = `${userId}/flashcards/card_${entityId}.json`

  const jsonBlob = new Blob([JSON.stringify(data, null, 2)], {
    type: 'application/json'
  })

  const { error } = await supabase.storage
    .from('documents')
    .upload(path, jsonBlob, {
      contentType: 'application/json',
      upsert: true
    })

  if (error) {
    throw new Error(`Failed to upload flashcard to Storage: ${error.message}`)
  }

  console.log(`[Flashcards] ✓ Uploaded to Storage: ${path}`)
  return path
}

/**
 * Download flashcard from Storage
 */
export async function downloadFlashcardFromStorage(
  userId: string,
  entityId: string
): Promise<FlashcardStorage> {
  const supabase = createAdminClient()
  const path = `${userId}/flashcards/card_${entityId}.json`

  const { data: signedUrl } = await supabase.storage
    .from('documents')
    .createSignedUrl(path, 3600)

  if (!signedUrl?.signedUrl) {
    throw new Error(`Failed to create signed URL for ${path}`)
  }

  const response = await fetch(signedUrl.signedUrl)
  if (!response.ok) {
    throw new Error(`Storage read failed for ${path}: ${response.statusText}`)
  }

  const json = await response.json()
  console.log(`[Flashcards] ✓ Read from Storage: ${path}`)

  return FlashcardStorageSchema.parse(json)
}

/**
 * List all flashcard files for user
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

  return files
    .filter(f => f.name.startsWith('card_') && f.name.endsWith('.json'))
    .map(f => f.name.replace('card_', '').replace('.json', ''))
}

/**
 * Delete flashcard from Storage
 */
export async function deleteFlashcardFromStorage(
  userId: string,
  entityId: string
): Promise<void> {
  const supabase = createAdminClient()
  const path = `${userId}/flashcards/card_${entityId}.json`

  const { error } = await supabase.storage
    .from('documents')
    .remove([path])

  if (error) {
    throw new Error(`Failed to delete from Storage: ${error.message}`)
  }

  console.log(`[Flashcards] ✓ Deleted from Storage: ${path}`)
}

/**
 * Verify storage integrity
 */
export async function verifyFlashcardsIntegrity(
  userId: string
): Promise<{ total: number; valid: number; invalid: string[] }> {
  const entityIds = await listUserFlashcards(userId)
  let valid = 0
  const invalid: string[] = []

  for (const id of entityIds) {
    try {
      await downloadFlashcardFromStorage(userId, id)
      valid++
    } catch (error) {
      invalid.push(id)
    }
  }

  return { total: entityIds.length, valid, invalid }
}
