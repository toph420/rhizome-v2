/**
 * Flashcard operations built on top of ECS
 *
 * Provides type-safe CRUD operations for flashcard entities.
 * Each flashcard is an entity with 4 components: Card, Content, Temporal, ChunkRef (optional)
 *
 * Pattern: Follows src/lib/ecs/sparks.ts exactly
 */

import { ECS, type Entity, type Component } from './ecs'
import type {
  FlashcardEntity,
  CardComponent,
  ContentComponent,
  TemporalComponent,
  ChunkRefComponent,
} from './components'
import { fsrs, generatorParameters, type Grade, createEmptyCard, type Card as FSRSCard } from 'ts-fsrs'

// ============================================
// INPUT TYPES
// ============================================

export interface CreateFlashcardInput {
  // Card content
  type: 'basic' | 'cloze'
  question: string
  answer: string
  content?: string  // For cloze
  clozeIndex?: number
  clozeCount?: number

  // Deck assignment
  deckId: string  // Required (use system Inbox if unsure)

  // Optional metadata
  tags?: string[]
  note?: string

  // Optional source context
  documentId?: string
  chunkIds?: string[]
  connectionId?: string
  annotationId?: string
  generationJobId?: string

  // Generation tracking
  generatedBy?: CardComponent['generatedBy']
  generationPromptVersion?: string

  // Cloze grouping
  parentCardId?: string
}

export interface UpdateFlashcardInput {
  question?: string
  answer?: string
  tags?: string[]
  note?: string
  status?: 'draft' | 'active' | 'suspended'
  deckId?: string
}

export interface ReviewCardInput {
  rating: Grade  // 1=Again, 2=Hard, 3=Good, 4=Easy (from ts-fsrs)
  timeSpentMs: number
}

// ============================================
// FLASHCARD OPERATIONS
// ============================================

export class FlashcardOperations {
  private fsrsScheduler

  constructor(
    private ecs: ECS,
    private userId: string
  ) {
    // Initialize FSRS with recommended defaults
    this.fsrsScheduler = fsrs(generatorParameters({
      maximum_interval: 365,  // Max 1 year between reviews
      enable_fuzz: true,      // Add randomization to intervals
      enable_short_term: false
    }))
  }

  /**
   * Create a new flashcard entity (draft status by default)
   *
   * @param input - Flashcard creation parameters
   * @returns Entity ID of the created flashcard
   *
   * @example
   * ```typescript
   * const id = await ops.create({
   *   type: 'basic',
   *   question: 'What is a rhizome?',
   *   answer: 'A non-hierarchical network structure',
   *   deckId: inboxDeckId,
   *   tags: ['philosophy'],
   *   chunkIds: ['chunk-123']
   * })
   * ```
   */
  async create(input: CreateFlashcardInput): Promise<string> {
    const now = new Date().toISOString()

    const entityId = await this.ecs.createEntity(this.userId, {
      Card: {
        type: input.type,
        question: input.question,
        answer: input.answer,
        content: input.content,
        clozeIndex: input.clozeIndex,
        clozeCount: input.clozeCount,
        status: 'draft',  // All new cards start as drafts
        srs: null,  // No SRS until approved
        deckId: input.deckId,
        deckAddedAt: now,
        parentCardId: input.parentCardId,
        generatedBy: input.generatedBy || 'manual',
        generationPromptVersion: input.generationPromptVersion,
      },
      Content: {
        note: input.note,
        tags: input.tags || [],
      },
      Temporal: {
        createdAt: now,
        updatedAt: now,
      },
      // ChunkRef is optional - only add if context provided
      ...(input.documentId || input.chunkIds ? {
        ChunkRef: {
          documentId: input.documentId || null,
          document_id: input.documentId || null,  // Duplicate for ECS filtering
          chunkId: input.chunkIds?.[0] || null,
          chunk_id: input.chunkIds?.[0] || null,  // Duplicate for ECS filtering
          chunkIds: input.chunkIds || [],
          chunkPosition: 0,
          connectionId: input.connectionId,
          annotationId: input.annotationId,
          generationJobId: input.generationJobId,
        }
      } : {}),
    }, 'flashcard')

    return entityId
  }

  /**
   * Approve a flashcard (draft → active, adds SRS component)
   *
   * @param entityId - Entity ID of the flashcard
   */
  async approve(entityId: string): Promise<void> {
    const entity = await this.ecs.getEntity(entityId, this.userId)
    if (!entity) {
      throw new Error('Flashcard not found')
    }

    const components = this.extractComponents(entity)
    const cardComponent = components.find(c => c.component_type === 'Card')

    if (!cardComponent) {
      throw new Error('Card component not found')
    }

    // Initialize FSRS state for new card
    const fsrsCard = createEmptyCard(new Date())

    // Update Card component with SRS state and active status
    await this.ecs.updateComponent(
      cardComponent.id,
      {
        ...cardComponent.data,
        status: 'active',
        srs: {
          due: fsrsCard.due.toISOString(),
          stability: fsrsCard.stability,
          difficulty: fsrsCard.difficulty,
          elapsed_days: fsrsCard.elapsed_days,
          scheduled_days: fsrsCard.scheduled_days,
          learning_steps: fsrsCard.learning_steps,
          reps: fsrsCard.reps,
          lapses: fsrsCard.lapses,
          state: fsrsCard.state,
          last_review: null,
        }
      },
      this.userId
    )

    // Update Temporal.updatedAt
    const temporalComponent = components.find(c => c.component_type === 'Temporal')
    if (temporalComponent) {
      await this.ecs.updateComponent(
        temporalComponent.id,
        {
          ...temporalComponent.data,
          updatedAt: new Date().toISOString(),
        },
        this.userId
      )
    }
  }

  /**
   * Review a flashcard (updates SRS schedule)
   *
   * @param entityId - Entity ID of the flashcard
   * @param input - Review parameters (rating, time spent)
   * @returns Updated FSRS state
   */
  async review(entityId: string, input: ReviewCardInput): Promise<FSRSCard> {
    const entity = await this.ecs.getEntity(entityId, this.userId)
    if (!entity) {
      throw new Error('Flashcard not found')
    }

    const components = this.extractComponents(entity)
    const cardComponent = components.find(c => c.component_type === 'Card')

    if (!cardComponent || !cardComponent.data.srs) {
      throw new Error('Card not approved or SRS state missing')
    }

    // Convert stored SRS state to FSRS Card type
    const currentCard: FSRSCard = {
      due: new Date(cardComponent.data.srs.due),
      stability: cardComponent.data.srs.stability,
      difficulty: cardComponent.data.srs.difficulty,
      elapsed_days: cardComponent.data.srs.elapsed_days,
      scheduled_days: cardComponent.data.srs.scheduled_days,
      learning_steps: cardComponent.data.srs.learning_steps,
      reps: cardComponent.data.srs.reps,
      lapses: cardComponent.data.srs.lapses,
      state: cardComponent.data.srs.state,
      last_review: cardComponent.data.srs.last_review
        ? new Date(cardComponent.data.srs.last_review)
        : undefined
    }

    // Process review with FSRS
    const { card: updatedCard, log } = this.fsrsScheduler.next(
      currentCard,
      new Date(),
      input.rating
    )

    // Update Card component with new SRS state
    await this.ecs.updateComponent(
      cardComponent.id,
      {
        ...cardComponent.data,
        srs: {
          due: updatedCard.due.toISOString(),
          stability: updatedCard.stability,
          difficulty: updatedCard.difficulty,
          elapsed_days: updatedCard.elapsed_days,
          scheduled_days: updatedCard.scheduled_days,
          learning_steps: updatedCard.learning_steps,
          reps: updatedCard.reps,
          lapses: updatedCard.lapses,
          state: updatedCard.state,
          last_review: log.review.toISOString(),
        }
      },
      this.userId
    )

    // Update Temporal.updatedAt
    const temporalComponent = components.find(c => c.component_type === 'Temporal')
    if (temporalComponent) {
      await this.ecs.updateComponent(
        temporalComponent.id,
        {
          ...temporalComponent.data,
          updatedAt: new Date().toISOString(),
        },
        this.userId
      )
    }

    return updatedCard
  }

  /**
   * Update flashcard content
   *
   * @param entityId - Entity ID
   * @param updates - Fields to update
   */
  async update(
    entityId: string,
    updates: UpdateFlashcardInput
  ): Promise<void> {
    const entity = await this.ecs.getEntity(entityId, this.userId)
    if (!entity) {
      throw new Error('Flashcard not found')
    }

    const components = this.extractComponents(entity)

    // Update Card component
    if (updates.question || updates.answer || updates.status || updates.deckId) {
      const cardComponent = components.find(c => c.component_type === 'Card')
      if (cardComponent) {
        await this.ecs.updateComponent(
          cardComponent.id,
          {
            ...cardComponent.data,
            question: updates.question ?? cardComponent.data.question,
            answer: updates.answer ?? cardComponent.data.answer,
            status: updates.status ?? cardComponent.data.status,
            deckId: updates.deckId ?? cardComponent.data.deckId,
          },
          this.userId
        )
      }
    }

    // Update Content component
    if (updates.tags !== undefined || updates.note !== undefined) {
      const contentComponent = components.find(c => c.component_type === 'Content')
      if (contentComponent) {
        await this.ecs.updateComponent(
          contentComponent.id,
          {
            ...contentComponent.data,
            tags: updates.tags ?? contentComponent.data.tags,
            note: updates.note ?? contentComponent.data.note,
          },
          this.userId
        )
      }
    }

    // Update Temporal.updatedAt
    const temporalComponent = components.find(c => c.component_type === 'Temporal')
    if (temporalComponent) {
      await this.ecs.updateComponent(
        temporalComponent.id,
        {
          ...temporalComponent.data,
          updatedAt: new Date().toISOString(),
        },
        this.userId
      )
    }
  }

  /**
   * Delete flashcard (hard delete from ECS)
   *
   * @param entityId - Entity ID to delete
   */
  async delete(entityId: string): Promise<void> {
    await this.ecs.deleteEntity(entityId, this.userId)
  }

  /**
   * Archive flashcard (move to Archive deck)
   *
   * @param entityId - Entity ID to archive
   */
  async archive(entityId: string): Promise<void> {
    const { getArchiveDeck } = await import('@/lib/decks/system-decks')
    const archiveDeck = await getArchiveDeck(this.userId)

    if (!archiveDeck) {
      throw new Error('Archive deck not found')
    }

    const entity = await this.ecs.getEntity(entityId, this.userId)
    if (!entity) {
      throw new Error('Flashcard not found')
    }

    const components = this.extractComponents(entity)
    const cardComp = components.find(c => c.component_type === 'Card')

    if (!cardComp) {
      throw new Error('Card component not found')
    }

    // Update Card component with Archive deck
    await this.ecs.updateComponent(
      cardComp.id,
      {
        ...cardComp.data,
        deckId: archiveDeck.id,
        deckAddedAt: new Date().toISOString(),
      },
      this.userId
    )

    // Update Temporal.updatedAt
    const temporalComponent = components.find(c => c.component_type === 'Temporal')
    if (temporalComponent) {
      await this.ecs.updateComponent(
        temporalComponent.id,
        {
          ...temporalComponent.data,
          updatedAt: new Date().toISOString(),
        },
        this.userId
      )
    }
  }

  /**
   * Get flashcards by deck
   *
   * @param deckId - Deck ID to filter by
   * @returns Array of flashcard entities
   */
  async getByDeck(deckId: string): Promise<FlashcardEntity[]> {
    const entities = await this.ecs.query(
      ['Card'],  // Filter for Card component (flashcards only)
      this.userId,
      { deck_id: deckId }  // Note: Need to add deck_id to Card component data for filtering
    )

    return entities.map(this.mapToFlashcard)
  }

  /**
   * Get due flashcards (approved cards with due date <= now)
   * NOTE: Use cache table for performance in production
   *
   * @param limit - Maximum number of cards to return
   * @returns Due flashcards sorted by due date
   */
  async getDue(limit: number = 50): Promise<FlashcardEntity[]> {
    // WARNING: This is slow - use flashcards_cache table for production
    const entities = await this.ecs.query(
      ['Card'],
      this.userId
    )

    const now = new Date()

    return entities
      .map(this.mapToFlashcard)
      .filter(card => {
        const cardComp = card.components.Card
        return (
          cardComp.status === 'active' &&
          cardComp.srs &&
          new Date(cardComp.srs.due) <= now
        )
      })
      .sort((a, b) => {
        const aDate = new Date(a.components.Card.srs!.due).getTime()
        const bDate = new Date(b.components.Card.srs!.due).getTime()
        return aDate - bDate  // Ascending
      })
      .slice(0, limit)
  }

  // ============================================
  // HELPER METHODS
  // ============================================

  /**
   * Maps raw ECS entity to typed FlashcardEntity
   */
  private mapToFlashcard = (entity: Entity): FlashcardEntity => {
    const components: Record<string, unknown> = {}

    if (entity.components) {
      for (const comp of entity.components) {
        components[comp.component_type] = comp.data
      }
    }

    return {
      id: entity.id,
      user_id: entity.user_id,
      created_at: entity.created_at,
      updated_at: entity.updated_at,
      components: components as FlashcardEntity['components'],
    }
  }

  /**
   * Extracts component array from entity
   */
  private extractComponents(entity: Entity): Component[] {
    return entity.components || []
  }
}
