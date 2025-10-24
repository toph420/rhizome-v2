/**
 * Flashcard Storage JSON schema
 * Stored at: {userId}/flashcards/{cardId}.json
 */
export interface FlashcardStorageJson {
  entity_id: string
  user_id: string
  component_type: 'flashcard'
  data: {
    // Card data
    type: 'basic' | 'cloze'
    question: string
    answer: string
    content?: string
    clozeIndex?: number
    clozeCount?: number
    status: 'draft' | 'active' | 'suspended'

    // SRS state
    srs: {
      due: string
      stability: number
      difficulty: number
      elapsed_days: number
      scheduled_days: number
      learning_steps: number
      reps: number
      lapses: number
      state: number
      last_review: string | null
    } | null

    // Metadata
    deckId: string
    deckAddedAt: string
    tags: string[]
    note?: string

    // Timestamps
    createdAt: string
    updatedAt: string
  }

  // Context (optional)
  context: {
    documentId?: string
    chunkIds?: string[]
    connectionId?: string
    annotationId?: string
  } | null
}
