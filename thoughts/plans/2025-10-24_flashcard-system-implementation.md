# Flashcard System Implementation Plan

## Overview

Build a complete flashcard study system with FSRS spaced repetition, deeply integrated with Rhizome's knowledge graph. Generate cards from documents/chunks/annotations/connections, review with AI-generated questions, and maintain storage-first portability with Obsidian/Anki sync.

**Key Innovation**: Storage-first ECS flashcards with automatic chunk linking, FSRS scheduling (20-30% fewer reviews than SM-2), and bidirectional Obsidian sync.

## Current State Analysis

### What Exists
- **FlashcardsTab placeholder** (`src/components/sidebar/FlashcardsTab.tsx:1-92`) - UI shell only, no backend
- **RightPanel integration** (`src/components/sidebar/RightPanel.tsx:46`) - Tab already registered as 'cards'
- **ECS foundation** (`src/lib/ecs/ecs.ts:27-78`) - createEntity(), query(), updateComponent()
- **Shared components** (`src/lib/ecs/components.ts:52-96`) - Content, Temporal, ChunkRef reusable

### What's Missing
- **FlashcardOperations** ECS wrapper (like SparkOperations at `src/lib/ecs/sparks.ts:71`)
- **Card component definitions** (Card, SRS embedded, DeckMembership embedded)
- **FSRS algorithm integration** (ts-fsrs library)
- **Storage upload/download** helpers (pattern from `src/lib/sparks/storage.ts:14-190`)
- **Background job handlers** for AI generation
- **Server Actions** for CRUD operations
- **Cache table** for fast queries
- **Study UI** with keyboard shortcuts and ratings

### Key Discoveries

1. **Storage Pattern** (`src/lib/sparks/storage.ts:22`):
   - Individual files: `{userId}/sparks/{sparkId}.json` ✅
   - NOT aggregated JSON files ❌
   - Admin client bypasses RLS (personal tool)

2. **Server Action Pattern** (`src/app/actions/sparks.ts:117-157`):
   - Storage upload: async, non-blocking, wrapped in try-catch
   - Cache update: async, non-fatal, wrapped in try-catch
   - Both use `.catch(console.error)` - graceful degradation

3. **Component Structure** (`src/lib/ecs/components.ts:99-228`):
   - Optional components allowed (ChunkRef optional for sparks)
   - Duplicate fields for filtering (documentId + document_id)
   - PascalCase naming (Spark, Content, not spark, content)

4. **Feature-Rich Cards** (`src/components/rhizome/connection-card.tsx:47-180`):
   - Self-contained state management
   - Keyboard shortcuts in useEffect with isActive check
   - Server actions colocated in component
   - Optimistic updates with rollback on error

5. **Job Schema Validation** (`worker/types/job-schemas.ts:27-105`):
   - All output_data fields use camelCase (downloadUrl, cardCount)
   - Zod validation required before saving
   - Validation helper function provided

6. **FSRS Algorithm** (research findings):
   - Official TypeScript library: `ts-fsrs`
   - 20-30% fewer reviews than SM-2 for same retention
   - Store Card type: `{due, stability, difficulty, reps, lapses, state}`

## Desired End State

### Technical Specifications

**ECS Entities:**
- Flashcards as entities with 4 components:
  1. **Card** - question, answer, type (basic/cloze), embedded SRS (nullable), embedded deckId, status field, parentCardId, generatedBy
  2. **Content** - tags (shared component)
  3. **Temporal** - createdAt, updatedAt (shared component)
  4. **ChunkRef** - documentId, chunkIds, connectionId, annotationId, generationJobId (shared, optional)

**Storage Structure:**
```
{userId}/flashcards/{cardId}.json  ← Individual card files
{userId}/decks/{deckId}.json       ← Deck metadata
```

**Cache Table:**
- `flashcards_cache` - denormalized for fast study queries
- Indexed by: user_id, deck_id, status, next_review, tags
- Rebuilt from Storage (source of truth)

**Study Interface:**
- Fullscreen cards with keyboard shortcuts (1/2/3/4 ratings, Space flip)
- Context sidebar showing source chunks
- Mobile: swipe gestures for ratings
- FSRS scheduling automatic

**Generation Workflow:**
1. User triggers generation → Background job created
2. Worker: AI generates cards → Matches to chunks via embeddings
3. Cards stored as ECS entities (draft status)
4. Review panel opens with all cards in grid
5. User edits/approves/discards
6. Approved cards get SRS component → Enter study rotation

### Verification

**Success Criteria:**
- Generate 8 cards from 500-page book in <30s (~$0.01 cost)
- Study 50 cards in <10min with full context access
- 95%+ chunk recovery rate after reprocessing
- Zero data loss (Storage-first guarantee)
- Individual card files at `{userId}/flashcards/{cardId}.json`
- Cache rebuilds from Storage in <5s

## Rhizome Architecture

- **Module**: Both (Main App + Worker)
- **Storage**: Both (Source of truth: Storage, Database is queryable cache)
- **Migration**: Yes (063_flashcard_ecs.sql, 064_decks.sql, 065_flashcards_cache.sql, 066_study_sessions.sql)
- **Test Tier**: Critical (FSRS accuracy, chunk recovery, storage sync)
- **Pipeline Stages**: None (flashcards generated POST-processing)
- **Engines**: None (uses connections as metadata)

## What We're NOT Doing

- ❌ SM-2 algorithm (using FSRS instead - 20-30% more efficient)
- ❌ Aggregated Storage JSON files (using individual files per card)
- ❌ Traditional modals (using persistent panels/docks)
- ❌ Multi-user features (personal tool only)
- ❌ Paid third-party APIs (except Gemini for generation)
- ❌ Image occlusion cards (text-only for Phase 1)
- ❌ Audio cards (text-only for Phase 1)
- ❌ Daily limits (user manages own study volume)

## Implementation Approach

**Strategy**: Phased rollout following spark/annotation patterns exactly

**Phase 1** (Core Foundation): ECS + Storage + Generation
**Phase 2** (Study System): FSRS + Study UI + Sessions
**Phase 3** (Deck Management): Hierarchical decks + Batch operations
**Phase 4** (Integrations): Obsidian sync + Anki export
**Phase 5** (Polish): Cloze cards + Custom prompts + Analytics

**Pattern Replication:**
- FlashcardOperations → Copy SparkOperations (`src/lib/ecs/sparks.ts:71-566`)
- Storage helpers → Copy spark storage (`src/lib/sparks/storage.ts:14-190`)
- Server Actions → Copy spark actions (`src/app/actions/sparks.ts:36-166`)
- Feature-rich cards → Copy ConnectionCard (`src/components/rhizome/connection-card.tsx:47-180`)
- Job handlers → Copy export handler (`worker/handlers/export-document.ts:45-331`)

---

## Phase 1: Core ECS + Storage Foundation

### Overview
Establish ECS entity structure, storage-first persistence, and basic CRUD operations. This phase creates the data foundation for all flashcard features.

### Changes Required

#### 1. Install FSRS Library
**Location**: Root `package.json`
**Changes**: Add ts-fsrs dependency

```bash
npm install ts-fsrs
```

**Why**: Official FSRS implementation - 20-30% fewer reviews than SM-2, actively maintained by algorithm creators

---

#### 2. Component Type Definitions
**File**: `src/lib/ecs/components.ts`
**Changes**: Add Card, SRS embedded, DeckMembership embedded types

```typescript
// Add after line 228 (after SparkEntity)

/**
 * Card component - Flashcard content and metadata
 * Embedded: SRS (nullable for drafts), deckId, status
 */
export interface CardComponent {
  // Core card data
  type: 'basic' | 'cloze'
  question: string
  answer: string
  content?: string  // For cloze: "The {{c1::rhizome}} opposes..."
  clozeIndex?: number  // For cloze: which deletion (1, 2, 3...)
  clozeCount?: number  // For cloze: total deletions

  // Status management
  status: 'draft' | 'active' | 'suspended'

  // Cloze grouping (parent-child relationship)
  parentCardId?: string  // null for basic cards, parent ID for cloze siblings

  // Generation metadata
  generatedBy?: 'manual' | 'ai_document' | 'ai_selection' | 'ai_connection' | 'import'
  generationPromptVersion?: string

  // SRS embedded (null for drafts)
  srs: {
    // FSRS Card state (from ts-fsrs library)
    due: string  // ISO timestamp
    stability: number  // Days for retrievability to drop from 100% to 90%
    difficulty: number  // 1-10 scale
    elapsed_days: number
    scheduled_days: number
    learning_steps: number
    reps: number
    lapses: number
    state: number  // 0=New, 1=Learning, 2=Review, 3=Relearning
    last_review: string | null  // ISO timestamp
  } | null

  // Deck membership embedded
  deckId: string
  deckAddedAt: string  // ISO timestamp
}

/**
 * Complete Flashcard entity with all components
 * 4-component pattern: Card, Content, Temporal, ChunkRef (optional)
 */
export interface FlashcardEntity {
  id: string
  user_id: string
  created_at: string
  updated_at: string
  components: {
    Card: CardComponent
    Content: ContentComponent  // Shared: tags
    Temporal: TemporalComponent  // Shared: createdAt, updatedAt
    ChunkRef?: ChunkRefComponent  // Optional: documentId, chunkIds, etc.
  }
}

/**
 * Validates Card component structure
 */
export const validateCardComponent = (
  data: unknown
): data is CardComponent => {
  if (typeof data !== 'object' || data === null) return false
  const card = data as Record<string, unknown>

  return (
    ['basic', 'cloze'].includes(card.type as string) &&
    typeof card.question === 'string' &&
    typeof card.answer === 'string' &&
    ['draft', 'active', 'suspended'].includes(card.status as string) &&
    typeof card.deckId === 'string' &&
    (card.srs === null || (typeof card.srs === 'object' && card.srs !== null))
  )
}
```

---

#### 3. FlashcardOperations Wrapper
**File**: `src/lib/ecs/flashcards.ts` (NEW)
**Pattern**: Copy SparkOperations from `src/lib/ecs/sparks.ts:71-566`
**Changes**: Adapt for 4-component flashcard pattern with FSRS

```typescript
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
import { fsrs, generatorParameters, Rating, createEmptyCard, type Card as FSRSCard } from 'ts-fsrs'

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
  rating: Rating  // 1=Again, 2=Hard, 3=Good, 4=Easy (from ts-fsrs)
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
```

---

#### 4. Storage Upload/Download Helpers
**File**: `src/lib/flashcards/storage.ts` (NEW)
**Pattern**: Copy from `src/lib/sparks/storage.ts:14-190`
**Changes**: Adapt for flashcard JSON schema

```typescript
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
```

**File**: `src/lib/flashcards/types.ts` (NEW)

```typescript
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
```

---

#### 5. Database Migrations
**Files**: `supabase/migrations/063_flashcard_ecs.sql`, `064_decks.sql`, `065_flashcards_cache.sql`

**Migration 063**:
```sql
-- Migration 063: Decks Table
-- Purpose: Hierarchical deck organization with system decks (Inbox, Archive)
-- Pattern: Regular table (NOT ECS)

CREATE TABLE IF NOT EXISTS decks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) NOT NULL,

  -- Deck metadata
  name TEXT NOT NULL,
  description TEXT,

  -- Hierarchical structure
  parent_id UUID REFERENCES decks(id) ON DELETE CASCADE,  -- NULL for root decks

  -- System decks (Inbox, Archive)
  is_system BOOLEAN DEFAULT FALSE,  -- Cannot delete system decks

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_decks_user ON decks(user_id);
CREATE INDEX idx_decks_parent ON decks(parent_id) WHERE parent_id IS NOT NULL;
CREATE INDEX idx_decks_system ON decks(user_id, is_system) WHERE is_system = TRUE;

-- Enable RLS
ALTER TABLE decks ENABLE ROW LEVEL SECURITY;

-- RLS policies (users see only their decks)
CREATE POLICY "Users view own decks"
  ON decks FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users insert own decks"
  ON decks FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users update own decks"
  ON decks FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "Users delete own non-system decks"
  ON decks FOR DELETE
  USING (user_id = auth.uid() AND is_system = FALSE);

-- Updated_at trigger
CREATE TRIGGER update_decks_updated_at
  BEFORE UPDATE ON decks
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Comments
COMMENT ON TABLE decks IS 'Hierarchical flashcard deck organization. System decks (Inbox, Archive) created on user signup.';
COMMENT ON COLUMN decks.parent_id IS 'Parent deck ID for nested structure. NULL for root decks.';
COMMENT ON COLUMN decks.is_system IS 'TRUE for Inbox/Archive decks. System decks cannot be deleted.';
```

**Migration 064**:
```sql
-- Migration 064: Flashcards Cache Table
-- Purpose: Denormalized cache for fast study queries
-- Source of Truth: Storage JSON files at {userId}/flashcards/{cardId}.json
-- Pattern: Exactly like sparks_cache at supabase/migrations/054_create_sparks_cache.sql

-- CRITICAL: This table is NOT source of truth.
-- Source of truth: Storage JSON files at {userId}/flashcards/{cardId}.json
-- This table: Denormalized cache for fast study queries only
-- Rebuild process: DELETE + re-insert from Storage JSON

CREATE TABLE IF NOT EXISTS flashcards_cache (
  -- Reference to ECS entity
  entity_id UUID PRIMARY KEY REFERENCES entities(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Denormalized card data (copied from Storage JSON)
  card_type TEXT NOT NULL,  -- 'basic' | 'cloze'
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  content TEXT,  -- For cloze
  cloze_index INTEGER,
  cloze_count INTEGER,

  -- Status
  status TEXT NOT NULL,  -- 'draft' | 'active' | 'suspended'

  -- Deck assignment
  deck_id UUID REFERENCES decks(id) ON DELETE SET NULL,
  deck_added_at TIMESTAMPTZ,

  -- SRS state (denormalized for query performance)
  next_review TIMESTAMPTZ,
  last_review TIMESTAMPTZ,
  stability FLOAT,
  difficulty FLOAT,
  reps INTEGER,
  lapses INTEGER,
  srs_state INTEGER,  -- 0=New, 1=Learning, 2=Review, 3=Relearning
  is_mature BOOLEAN,  -- TRUE when stability > 21 days

  -- Source tracking
  document_id UUID REFERENCES documents(id) ON DELETE SET NULL,
  chunk_ids UUID[],
  connection_id UUID,
  annotation_id UUID,
  generation_job_id UUID REFERENCES background_jobs(id) ON DELETE SET NULL,

  -- Search optimization
  tags TEXT[] DEFAULT '{}',

  -- Storage reference (for integrity checks)
  storage_path TEXT NOT NULL,  -- '{userId}/flashcards/{cardId}.json'

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  cached_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX idx_flashcards_cache_user_time
  ON flashcards_cache(user_id, created_at DESC);

CREATE INDEX idx_flashcards_cache_deck
  ON flashcards_cache(deck_id)
  WHERE deck_id IS NOT NULL;

CREATE INDEX idx_flashcards_cache_status
  ON flashcards_cache(user_id, status);

-- Study query: due cards
CREATE INDEX idx_flashcards_cache_due
  ON flashcards_cache(user_id, next_review)
  WHERE status = 'active' AND next_review IS NOT NULL;

-- Filter by tags
CREATE INDEX idx_flashcards_cache_tags
  ON flashcards_cache USING gin(tags);

-- Disable RLS (service role has full access - personal tool pattern)
ALTER TABLE flashcards_cache DISABLE ROW LEVEL SECURITY;

-- Comments
COMMENT ON TABLE flashcards_cache IS
  'CACHE ONLY - NOT SOURCE OF TRUTH.

  Source: {userId}/flashcards/{cardId}.json in Storage
  Purpose: Fast study queries only
  Rebuild: DELETE + re-insert from Storage JSON
  Data loss: Zero (fully rebuildable)

  This table can be dropped and rebuilt at any time.';

COMMENT ON COLUMN flashcards_cache.entity_id IS
  'References entities table. Flashcard data in components table with component_type=Card.';

COMMENT ON COLUMN flashcards_cache.storage_path IS
  'Path to source JSON in Storage. Used for integrity verification and rebuilds.';

COMMENT ON COLUMN flashcards_cache.cached_at IS
  'When this cache row was last rebuilt from Storage.';
```

**Migration 065**:
```sql
-- Migration 065: Study Sessions Table
-- Purpose: Track study session stats and analytics

CREATE TABLE IF NOT EXISTS study_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) NOT NULL,

  -- Session context
  deck_id UUID REFERENCES decks(id) ON DELETE SET NULL,  -- NULL for filtered study
  filters_applied JSONB,  -- {tags: ['philosophy'], dateRange: {...}}

  -- Session timing
  started_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ,

  -- Session stats
  cards_reviewed INTEGER DEFAULT 0,
  ratings JSONB DEFAULT '{"again": 0, "hard": 0, "good": 0, "easy": 0}',
  total_time_ms INTEGER DEFAULT 0,
  average_time_per_card_ms INTEGER
);

-- Indexes
CREATE INDEX idx_study_sessions_user ON study_sessions(user_id);
CREATE INDEX idx_study_sessions_started ON study_sessions(started_at DESC);
CREATE INDEX idx_study_sessions_deck ON study_sessions(deck_id) WHERE deck_id IS NOT NULL;

-- Enable RLS
ALTER TABLE study_sessions ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users view own study sessions"
  ON study_sessions FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users insert own study sessions"
  ON study_sessions FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users update own study sessions"
  ON study_sessions FOR UPDATE
  USING (user_id = auth.uid());

-- Helper function to update session stats
CREATE OR REPLACE FUNCTION update_study_session(
  p_session_id UUID,
  p_rating INTEGER,
  p_time_ms INTEGER
)
RETURNS void AS $$
DECLARE
  v_rating_key TEXT;
BEGIN
  -- Map rating to key
  v_rating_key := CASE p_rating
    WHEN 1 THEN 'again'
    WHEN 2 THEN 'hard'
    WHEN 3 THEN 'good'
    WHEN 4 THEN 'easy'
  END;

  -- Update session stats
  UPDATE study_sessions
  SET
    cards_reviewed = cards_reviewed + 1,
    ratings = jsonb_set(
      ratings,
      ARRAY[v_rating_key],
      to_jsonb((ratings->>v_rating_key)::INTEGER + 1)
    ),
    total_time_ms = total_time_ms + p_time_ms,
    average_time_per_card_ms = (total_time_ms + p_time_ms) / (cards_reviewed + 1)
  WHERE id = p_session_id;
END;
$$ LANGUAGE plpgsql;

COMMENT ON TABLE study_sessions IS 'Study session tracking for analytics and stats.';
```

---

### Success Criteria

#### Automated Verification:
- [ ] Migrations apply: `npx supabase db reset`
- [ ] Types compile: `npm run type-check`
- [ ] Tests pass: `npm test`
- [ ] ECS entities created successfully
- [ ] Storage files created at `{userId}/flashcards/{cardId}.json`

#### Manual Verification:
- [ ] Create flashcard via FlashcardOperations.create()
- [ ] Verify entity in `entities` table with `entity_type='flashcard'`
- [ ] Verify components in `components` table (Card, Content, Temporal, ChunkRef)
- [ ] Verify Storage file exists at correct path
- [ ] Approve flashcard → SRS component added
- [ ] Review flashcard → SRS state updates correctly
- [ ] Integrity check passes: `verifyFlashcardsIntegrity()` returns matched=true

**Implementation Note**: Pause after automated verification passes for manual confirmation before proceeding to Phase 2.

### Service Restarts:
- [ ] Supabase: `npx supabase db reset` (schema changed)
- [ ] Worker: restart via `npm run dev` (new handlers added in Phase 2)
- [ ] Next.js: verify auto-reload works

---

## Phase 2: Server Actions + CRUD Operations

### Overview
Implement Server Actions for flashcard CRUD, storage upload pattern, and cache synchronization. This enables UI components to create/edit/delete flashcards.

### Changes Required

#### 1. Server Actions
**File**: `src/app/actions/flashcards.ts` (NEW)
**Pattern**: Exactly like `src/app/actions/sparks.ts:36-166`

```typescript
'use server'

import { z } from 'zod'
import { createECS } from '@/lib/ecs'
import { FlashcardOperations } from '@/lib/ecs/flashcards'
import { getCurrentUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { uploadFlashcardToStorage } from '@/lib/flashcards/storage'
import { revalidatePath } from 'next/cache'
import type { FlashcardEntity } from '@/types/flashcards'
import type { FlashcardStorageJson } from '@/lib/flashcards/types'

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

    // 3. Build Storage JSON
    const flashcardData: FlashcardStorageJson = {
      entity_id: flashcardId,
      user_id: user.id,
      component_type: 'flashcard',
      data: {
        type: validated.type,
        question: validated.question,
        answer: validated.answer,
        content: validated.content,
        clozeIndex: validated.clozeIndex,
        clozeCount: validated.clozeCount,
        status: 'draft',
        srs: null,
        deckId: validated.deckId,
        deckAddedAt: new Date().toISOString(),
        tags: validated.tags || [],
        note: validated.note,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      context: validated.documentId || validated.chunkIds ? {
        documentId: validated.documentId,
        chunkIds: validated.chunkIds,
        connectionId: validated.connectionId,
        annotationId: validated.annotationId,
      } : null,
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
    const chunkRef = entity.components?.find(c => c.component_type === 'ChunkRef')?.data

    // Update Storage (async)
    const flashcardData: FlashcardStorageJson = {
      entity_id: flashcardId,
      user_id: user.id,
      component_type: 'flashcard',
      data: {
        ...card,
        tags: content?.tags || [],
        note: content?.note,
        updatedAt: new Date().toISOString(),
      },
      context: chunkRef ? {
        documentId: chunkRef.documentId,
        chunkIds: chunkRef.chunkIds,
        connectionId: chunkRef.connectionId,
        annotationId: chunkRef.annotationId,
      } : null,
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
```

---

#### 2. Deck Server Actions
**File**: `src/app/actions/decks.ts` (NEW)

```typescript
'use server'

import { z } from 'zod'
import { getCurrentUser } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

const CreateDeckSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  parentId: z.string().uuid().optional(),
})

/**
 * Create a new deck
 */
export async function createDeck(input: z.infer<typeof CreateDeckSchema>) {
  const user = await getCurrentUser()
  if (!user) throw new Error('Unauthorized')

  try {
    const validated = CreateDeckSchema.parse(input)

    const supabase = createAdminClient()
    const { data, error } = await supabase
      .from('decks')
      .insert({
        user_id: user.id,
        name: validated.name,
        description: validated.description,
        parent_id: validated.parentId,
      })
      .select()
      .single()

    if (error) throw error

    revalidatePath('/flashcards/decks')

    return { success: true, deck: data }

  } catch (error) {
    console.error('[Decks] Create failed:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

/**
 * Get all decks for user with stats
 */
export async function getDecksWithStats() {
  const user = await getCurrentUser()
  if (!user) throw new Error('Unauthorized')

  const supabase = createAdminClient()

  // Get all decks
  const { data: decks, error: decksError } = await supabase
    .from('decks')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: true })

  if (decksError) throw decksError

  // Get card counts per deck
  const { data: counts, error: countsError } = await supabase
    .from('flashcards_cache')
    .select('deck_id, status')
    .eq('user_id', user.id)

  if (countsError) throw countsError

  // Calculate stats
  const deckStats = decks.map(deck => {
    const deckCards = counts.filter(c => c.deck_id === deck.id)
    return {
      ...deck,
      total_cards: deckCards.length,
      draft_cards: deckCards.filter(c => c.status === 'draft').length,
      active_cards: deckCards.filter(c => c.status === 'active').length,
    }
  })

  return deckStats
}

/**
 * Get system decks (Inbox, Archive)
 */
export async function getSystemDecks() {
  const user = await getCurrentUser()
  if (!user) throw new Error('Unauthorized')

  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('decks')
    .select('*')
    .eq('user_id', user.id)
    .eq('is_system', true)

  if (error) throw error

  const inbox = data.find(d => d.name === 'Inbox')
  const archive = data.find(d => d.name === 'Archive')

  return { inbox, archive }
}
```

---

### Success Criteria

#### Automated Verification:
- [ ] Types compile: `npm run type-check`
- [ ] Server Actions execute without errors
- [ ] Zod validation catches invalid inputs
- [ ] ECS entities persist correctly
- [ ] Storage files created successfully

#### Manual Verification:
- [ ] Create flashcard via UI → Entity + Storage file + Cache row created
- [ ] Update flashcard → All 3 locations update
- [ ] Approve flashcard → SRS component added, status changes to 'active'
- [ ] Review flashcard → SRS schedule updates correctly
- [ ] Delete flashcard → Entity + Cache row removed
- [ ] Create deck → Appears in deck list
- [ ] System decks (Inbox, Archive) exist after user signup

**Implementation Note**: Test all CRUD operations manually before proceeding to Phase 3.

### Service Restarts:
- [ ] Next.js: Restart for new Server Actions
- [ ] Verify revalidatePath works (pages refresh with new data)

---

## Phase 3: Feature-Rich FlashcardCard Component

### Overview
Build self-contained FlashcardCard component with keyboard shortcuts, inline editing, optimistic updates, and server action integration. Follows ConnectionCard pattern exactly.

### Changes Required

#### 1. FlashcardCard Component
**File**: `src/components/rhizome/flashcard-card.tsx` (NEW)
**Pattern**: Copy ConnectionCard from `src/components/rhizome/connection-card.tsx:47-180`

```typescript
'use client'

import { useEffect, useState, useCallback } from 'react'
import { Card, CardContent, CardHeader } from '@/components/rhizome/card'
import { Badge } from '@/components/rhizome/badge'
import { Button } from '@/components/rhizome/button'
import { Textarea } from '@/components/rhizome/textarea'
import { Input } from '@/components/rhizome/input'
import { Check, X, Edit, Trash, RefreshCw, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { updateFlashcard, approveFlashcard, deleteFlashcard } from '@/app/actions/flashcards'
import { toast } from 'sonner'

interface FlashcardCardProps {
  flashcard: {
    entity_id: string
    card_type: 'basic' | 'cloze'
    question: string
    answer: string
    status: 'draft' | 'active' | 'suspended'
    tags: string[]
    deck_id: string
    chunk_ids: string[]
    document_id: string | null
  }
  isActive: boolean
  onClick: () => void
  onApproved?: () => void
  onDeleted?: () => void
  onNavigateToChunk?: (chunkId: string) => void
}

/**
 * Feature-rich FlashcardCard with:
 * - Keyboard shortcuts (e/a/d for edit/approve/delete)
 * - Inline editing
 * - Server action integration
 * - Optimistic updates
 * - Neobrutalist theming
 *
 * Pattern: Exactly like ConnectionCard at src/components/rhizome/connection-card.tsx:47-180
 */
export function FlashcardCard({
  flashcard,
  isActive,
  onClick,
  onApproved,
  onDeleted,
  onNavigateToChunk
}: FlashcardCardProps) {
  // Internal state (no prop drilling)
  const [isEditing, setIsEditing] = useState(false)
  const [editQuestion, setEditQuestion] = useState(flashcard.question)
  const [editAnswer, setEditAnswer] = useState(flashcard.answer)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const isDraft = flashcard.status === 'draft'

  // Save edits with optimistic update
  const handleSave = useCallback(async () => {
    setIsSubmitting(true)
    const originalQuestion = flashcard.question
    const originalAnswer = flashcard.answer

    // Optimistic update (would update Zustand store here)
    // flashcard.question = editQuestion
    // flashcard.answer = editAnswer

    try {
      const result = await updateFlashcard(flashcard.entity_id, {
        question: editQuestion.trim(),
        answer: editAnswer.trim(),
      })

      if (!result.success) throw new Error(result.error || 'Failed to save')

      setIsEditing(false)
      toast.success('Flashcard updated')
    } catch (error) {
      // Revert on error
      setEditQuestion(originalQuestion)
      setEditAnswer(originalAnswer)
      toast.error('Failed to save flashcard')
      console.error('[FlashcardCard] Save failed:', error)
    } finally {
      setIsSubmitting(false)
    }
  }, [editQuestion, editAnswer, flashcard])

  // Cancel editing
  const handleCancel = useCallback(() => {
    setEditQuestion(flashcard.question)
    setEditAnswer(flashcard.answer)
    setIsEditing(false)
  }, [flashcard])

  // Approve flashcard (draft → active)
  const handleApprove = useCallback(async () => {
    setIsSubmitting(true)

    try {
      const result = await approveFlashcard(flashcard.entity_id)

      if (!result.success) throw new Error(result.error || 'Failed to approve')

      toast.success('Flashcard approved')
      onApproved?.()
    } catch (error) {
      toast.error('Failed to approve flashcard')
      console.error('[FlashcardCard] Approve failed:', error)
    } finally {
      setIsSubmitting(false)
    }
  }, [flashcard, onApproved])

  // Delete flashcard
  const handleDelete = useCallback(async () => {
    if (!confirm('Delete this flashcard?')) return

    setIsSubmitting(true)

    try {
      const result = await deleteFlashcard(flashcard.entity_id)

      if (!result.success) throw new Error(result.error || 'Failed to delete')

      toast.success('Flashcard deleted')
      onDeleted?.()
    } catch (error) {
      toast.error('Failed to delete flashcard')
      console.error('[FlashcardCard] Delete failed:', error)
    } finally {
      setIsSubmitting(false)
    }
  }, [flashcard, onDeleted])

  // Keyboard shortcuts when active
  useEffect(() => {
    if (!isActive) return

    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return // Don't trigger in input fields
      }

      switch(e.key.toLowerCase()) {
        case 'e':  // Edit mode
          if (!isEditing) {
            e.preventDefault()
            setIsEditing(true)
          }
          break
        case 'enter':  // Save with ⌘Enter
          if (isEditing && (e.metaKey || e.ctrlKey)) {
            e.preventDefault()
            handleSave()
          }
          break
        case 'escape':  // Cancel editing
          if (isEditing) {
            e.preventDefault()
            handleCancel()
          }
          break
        case 'a':  // Approve (drafts only)
          if (!isEditing && isDraft) {
            e.preventDefault()
            handleApprove()
          }
          break
        case 'd':  // Delete with ⌘D
          if (!isEditing && (e.metaKey || e.ctrlKey)) {
            e.preventDefault()
            handleDelete()
          }
          break
      }
    }

    window.addEventListener('keydown', handleKeyPress)
    return () => window.removeEventListener('keydown', handleKeyPress)
  }, [isActive, isEditing, isDraft, handleSave, handleCancel, handleApprove, handleDelete])

  return (
    <Card
      className={cn(
        "cursor-pointer transition-all",
        isActive && "ring-2 ring-primary",
        isDraft && "border-dashed"
      )}
      onClick={onClick}
    >
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <Badge variant={isDraft ? "secondary" : "default"}>
            {flashcard.card_type}
          </Badge>
          <div className="flex gap-1">
            {isDraft && (
              <Button
                size="sm"
                variant="ghost"
                onClick={(e) => {
                  e.stopPropagation()
                  handleApprove()
                }}
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Check className="h-4 w-4" />
                )}
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              onClick={(e) => {
                e.stopPropagation()
                setIsEditing(!isEditing)
              }}
              disabled={isSubmitting}
            >
              <Edit className="h-4 w-4" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={(e) => {
                e.stopPropagation()
                handleDelete()
              }}
              disabled={isSubmitting}
            >
              <Trash className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        {isEditing ? (
          // Edit mode
          <>
            <div>
              <label className="text-xs text-muted-foreground">Question</label>
              <Input
                value={editQuestion}
                onChange={(e) => setEditQuestion(e.target.value)}
                placeholder="Question"
                disabled={isSubmitting}
                onClick={(e) => e.stopPropagation()}
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Answer</label>
              <Textarea
                value={editAnswer}
                onChange={(e) => setEditAnswer(e.target.value)}
                placeholder="Answer"
                rows={3}
                disabled={isSubmitting}
                onClick={(e) => e.stopPropagation()}
              />
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={(e) => {
                  e.stopPropagation()
                  handleSave()
                }}
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  'Save'
                )}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={(e) => {
                  e.stopPropagation()
                  handleCancel()
                }}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
            </div>
          </>
        ) : (
          // Display mode
          <>
            <div>
              <p className="text-sm font-medium mb-1">Question</p>
              <p className="text-sm text-muted-foreground">{flashcard.question}</p>
            </div>
            <div>
              <p className="text-sm font-medium mb-1">Answer</p>
              <p className="text-sm text-muted-foreground">{flashcard.answer}</p>
            </div>

            {/* Tags */}
            {flashcard.tags.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {flashcard.tags.map(tag => (
                  <Badge key={tag} variant="outline" className="text-xs">
                    {tag}
                  </Badge>
                ))}
              </div>
            )}

            {/* Source chunks */}
            {flashcard.chunk_ids.length > 0 && (
              <div className="text-xs text-muted-foreground">
                From {flashcard.chunk_ids.length} chunk{flashcard.chunk_ids.length > 1 ? 's' : ''}
                {onNavigateToChunk && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="ml-2 h-auto py-0 px-1"
                    onClick={(e) => {
                      e.stopPropagation()
                      onNavigateToChunk(flashcard.chunk_ids[0])
                    }}
                  >
                    View source →
                  </Button>
                )}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}
```

---

#### 2. Update FlashcardsTab
**File**: `src/components/sidebar/FlashcardsTab.tsx`
**Changes**: Replace placeholder with real implementation

```typescript
'use client'

import { useEffect, useState } from 'react'
import { FlashcardCard } from '@/components/rhizome/flashcard-card'
import { Button } from '@/components/rhizome/button'
import { Plus, GraduationCap } from 'lucide-react'
import { getDueFlashcards } from '@/app/actions/flashcards'
import { useRouter } from 'next/navigation'

interface FlashcardsTabProps {
  documentId: string
  onNavigateToChunk?: (chunkId: string) => void
}

export function FlashcardsTab({ documentId, onNavigateToChunk }: FlashcardsTabProps) {
  const router = useRouter()
  const [flashcards, setFlashcards] = useState([])
  const [dueCount, setDueCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null)

  useEffect(() => {
    loadFlashcards()
  }, [documentId])

  const loadFlashcards = async () => {
    setLoading(true)
    try {
      // Get all flashcards from cache (via server action in next iteration)
      // For now, just get due cards
      const due = await getDueFlashcards()
      setDueCount(due.length)
      setFlashcards([])  // TODO: Load document flashcards
    } catch (error) {
      console.error('Failed to load flashcards:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return <div className="p-4 text-sm text-muted-foreground">Loading...</div>
  }

  return (
    <div className="p-4 space-y-4">
      {/* Study prompt */}
      {dueCount > 0 && (
        <div className="p-4 rounded-lg border-2 border-primary bg-primary/5">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-sm">Due for Review</p>
              <p className="text-xs text-muted-foreground">
                {dueCount} cards • Est. {Math.ceil(dueCount * 0.2)} min
              </p>
            </div>
            <Button
              size="sm"
              onClick={() => router.push('/flashcards/study')}
            >
              <GraduationCap className="h-4 w-4 mr-2" />
              Start
            </Button>
          </div>
        </div>
      )}

      {/* Card list (placeholder for Phase 4) */}
      <div className="space-y-2">
        {flashcards.length === 0 ? (
          <div className="text-center py-8 text-sm text-muted-foreground">
            No flashcards yet for this document.
            <Button
              size="sm"
              variant="ghost"
              className="ml-2"
              onClick={() => {
                // Open generation panel (Phase 4)
              }}
            >
              <Plus className="h-4 w-4 mr-1" />
              Generate cards
            </Button>
          </div>
        ) : (
          flashcards.map((card) => (
            <FlashcardCard
              key={card.entity_id}
              flashcard={card}
              isActive={selectedCardId === card.entity_id}
              onClick={() => setSelectedCardId(card.entity_id)}
              onApproved={loadFlashcards}
              onDeleted={loadFlashcards}
              onNavigateToChunk={onNavigateToChunk}
            />
          ))
        )}
      </div>
    </div>
  )
}
```

---

### Success Criteria

#### Automated Verification:
- [ ] Component renders without errors
- [ ] TypeScript types compile
- [ ] Keyboard shortcuts registered

#### Manual Verification:
- [ ] FlashcardCard displays question/answer correctly
- [ ] Click card → activates (ring-2 ring-primary)
- [ ] Press 'e' → enters edit mode
- [ ] Edit question/answer → Save → Updates ECS + Storage + Cache
- [ ] Press 'a' on draft card → Approves (SRS added)
- [ ] Press ⌘D → Deletes after confirmation
- [ ] "View source" button → Navigates to chunk
- [ ] Optimistic updates work (immediate UI feedback)
- [ ] Errors show toast notification and revert changes

**Implementation Note**: Test all keyboard shortcuts and optimistic updates thoroughly.

### Service Restarts:
- [ ] Next.js: Auto-reload for component changes

---

## Phase 4: Study Interface + FSRS Integration

### Overview
Build fullscreen study interface with FSRS-powered review scheduling, keyboard shortcuts (1/2/3/4 ratings), and context sidebar showing source chunks.

### Changes Required

#### 1. Study Session Actions
**File**: `src/app/actions/study.ts` (NEW)

```typescript
'use server'

import { z } from 'zod'
import { getCurrentUser } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { reviewCard as reviewCardECS } from '@/app/actions/flashcards'
import { revalidatePath } from 'next/cache'

const StartSessionSchema = z.object({
  deckId: z.string().uuid().optional(),
  filters: z.object({
    tags: z.array(z.string()).optional(),
  }).optional(),
})

/**
 * Start a new study session
 */
export async function startStudySession(input: z.infer<typeof StartSessionSchema>) {
  const user = await getCurrentUser()
  if (!user) throw new Error('Unauthorized')

  try {
    const validated = StartSessionSchema.parse(input)

    const supabase = createAdminClient()

    // Create session record
    const { data: session, error: sessionError } = await supabase
      .from('study_sessions')
      .insert({
        user_id: user.id,
        deck_id: validated.deckId,
        started_at: new Date().toISOString(),
        filters_applied: validated.filters || null,
      })
      .select()
      .single()

    if (sessionError) throw sessionError

    // Get due cards
    const now = new Date().toISOString()
    let query = supabase
      .from('flashcards_cache')
      .select('*')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .lte('next_review', now)
      .order('next_review', { ascending: true })
      .limit(50)

    if (validated.deckId) {
      query = query.eq('deck_id', validated.deckId)
    }

    if (validated.filters?.tags) {
      query = query.contains('tags', validated.filters.tags)
    }

    const { data: cards, error: cardsError } = await query

    if (cardsError) throw cardsError

    return {
      success: true,
      sessionId: session.id,
      cards: cards || [],
    }

  } catch (error) {
    console.error('[Study] Start session failed:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

/**
 * Update session stats after reviewing a card
 */
export async function updateSessionStats(
  sessionId: string,
  rating: number,
  timeSpentMs: number
) {
  const user = await getCurrentUser()
  if (!user) throw new Error('Unauthorized')

  try {
    const supabase = createAdminClient()

    // Use RPC function from migration
    const { error } = await supabase.rpc('update_study_session', {
      p_session_id: sessionId,
      p_rating: rating,
      p_time_ms: timeSpentMs,
    })

    if (error) throw error

    return { success: true }

  } catch (error) {
    console.error('[Study] Update stats failed:', error)
    return { success: false }
  }
}

/**
 * End study session
 */
export async function endStudySession(sessionId: string) {
  const user = await getCurrentUser()
  if (!user) throw new Error('Unauthorized')

  try {
    const supabase = createAdminClient()

    const { error } = await supabase
      .from('study_sessions')
      .update({ ended_at: new Date().toISOString() })
      .eq('id', sessionId)
      .eq('user_id', user.id)

    if (error) throw error

    revalidatePath('/flashcards/study')

    return { success: true }

  } catch (error) {
    console.error('[Study] End session failed:', error)
    return { success: false }
  }
}
```

---

#### 2. Study Interface Component
**File**: `src/app/flashcards/study/page.tsx` (NEW)

```typescript
'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent } from '@/components/rhizome/card'
import { Button } from '@/components/rhizome/button'
import { Badge } from '@/components/rhizome/badge'
import { X } from 'lucide-react'
import { startStudySession, updateSessionStats, endStudySession } from '@/app/actions/study'
import { reviewCard } from '@/app/actions/flashcards'
import { toast } from 'sonner'

export default function StudyPage() {
  const router = useRouter()
  const [session, setSession] = useState<{ id: string; cards: any[] } | null>(null)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [revealed, setRevealed] = useState(false)
  const [loading, setLoading] = useState(true)
  const [reviewStartTime, setReviewStartTime] = useState(Date.now())

  useEffect(() => {
    initSession()
  }, [])

  const initSession = async () => {
    try {
      const result = await startStudySession({})
      if (result.success && result.sessionId) {
        setSession({ id: result.sessionId, cards: result.cards })
      } else {
        toast.error('No cards due for review')
        router.push('/flashcards')
      }
    } catch (error) {
      toast.error('Failed to start study session')
      router.push('/flashcards')
    } finally {
      setLoading(false)
    }
  }

  const handleRate = async (rating: 1 | 2 | 3 | 4) => {
    if (!session || !session.cards[currentIndex]) return

    const card = session.cards[currentIndex]
    const timeSpent = Date.now() - reviewStartTime

    try {
      // Update FSRS schedule
      await reviewCard(card.entity_id, {
        rating,
        timeSpentMs: timeSpent,
      })

      // Update session stats
      await updateSessionStats(session.id, rating, timeSpent)

      // Move to next card
      if (currentIndex < session.cards.length - 1) {
        setCurrentIndex(i => i + 1)
        setRevealed(false)
        setReviewStartTime(Date.now())
      } else {
        // Session complete
        await endStudySession(session.id)
        toast.success('Study session complete!')
        router.push('/flashcards')
      }
    } catch (error) {
      toast.error('Failed to save review')
      console.error('Review failed:', error)
    }
  }

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return
      }

      switch(e.key) {
        case ' ':  // Space: reveal answer
          if (!revealed) {
            e.preventDefault()
            setRevealed(true)
          }
          break
        case '1':  // Again
          if (revealed) {
            e.preventDefault()
            handleRate(1)
          }
          break
        case '2':  // Hard
          if (revealed) {
            e.preventDefault()
            handleRate(2)
          }
          break
        case '3':  // Good
          if (revealed) {
            e.preventDefault()
            handleRate(3)
          }
          break
        case '4':  // Easy
          if (revealed) {
            e.preventDefault()
            handleRate(4)
          }
          break
        case 'Escape':
          router.push('/flashcards')
          break
      }
    }

    window.addEventListener('keydown', handleKeyPress)
    return () => window.removeEventListener('keydown', handleKeyPress)
  }, [revealed])

  if (loading) {
    return <div className="flex items-center justify-center h-screen">Loading...</div>
  }

  if (!session || session.cards.length === 0) {
    return <div className="flex items-center justify-center h-screen">No cards to review</div>
  }

  const currentCard = session.cards[currentIndex]
  const remaining = session.cards.length - currentIndex

  return (
    <div className="fixed inset-0 bg-background flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b-2 border-border">
        <div className="flex items-center gap-4">
          <Badge>{remaining} remaining</Badge>
          <p className="text-sm text-muted-foreground">
            Card {currentIndex + 1} of {session.cards.length}
          </p>
        </div>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            endStudySession(session.id)
            router.push('/flashcards')
          }}
        >
          <X className="h-4 w-4 mr-1" />
          Exit (Esc)
        </Button>
      </div>

      {/* Card display */}
      <div className="flex-1 flex items-center justify-center p-8">
        <Card className="w-full max-w-2xl">
          <CardContent className="p-8 space-y-6">
            {/* Question */}
            <div>
              <p className="text-xs text-muted-foreground mb-2">Question</p>
              <p className="text-lg font-medium">{currentCard.question}</p>
            </div>

            {/* Answer (revealed) */}
            {revealed ? (
              <div>
                <p className="text-xs text-muted-foreground mb-2">Answer</p>
                <p className="text-base">{currentCard.answer}</p>
              </div>
            ) : (
              <Button
                size="lg"
                className="w-full"
                onClick={() => setRevealed(true)}
              >
                Show Answer (Space)
              </Button>
            )}

            {/* Rating buttons */}
            {revealed && (
              <div className="grid grid-cols-4 gap-2 pt-4">
                <Button
                  variant="destructive"
                  onClick={() => handleRate(1)}
                >
                  Again
                  <br />
                  <span className="text-xs">1</span>
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => handleRate(2)}
                >
                  Hard
                  <br />
                  <span className="text-xs">2</span>
                </Button>
                <Button
                  variant="default"
                  onClick={() => handleRate(3)}
                >
                  Good
                  <br />
                  <span className="text-xs">3</span>
                </Button>
                <Button
                  variant="outline"
                  onClick={() => handleRate(4)}
                >
                  Easy
                  <br />
                  <span className="text-xs">4</span>
                </Button>
              </div>
            )}

            {/* Context (if available) */}
            {currentCard.chunk_ids?.length > 0 && (
              <div className="pt-4 border-t-2 border-border">
                <p className="text-xs text-muted-foreground mb-2">Source</p>
                <p className="text-xs">
                  From {currentCard.chunk_ids.length} chunk{currentCard.chunk_ids.length > 1 ? 's' : ''}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
```

---

### Success Criteria

#### Automated Verification:
- [ ] Study page renders without errors
- [ ] Session created in study_sessions table
- [ ] FSRS calculations update correctly

#### Manual Verification:
- [ ] Navigate to `/flashcards/study`
- [ ] Session starts with due cards loaded
- [ ] Press Space → reveals answer
- [ ] Press 1/2/3/4 → rates card and moves to next
- [ ] FSRS schedule updates (check next_review in cache)
- [ ] Session stats update (ratings count, time spent)
- [ ] Last card → Session completes and redirects
- [ ] Press Esc → Exits study mode
- [ ] Start new session → Only shows cards due since last review

**Implementation Note**: Verify FSRS intervals are reasonable (e.g., Good rating increases interval, Again resets to 1 day).

### Service Restarts:
- [ ] Next.js: Auto-reload for new route

---

## Phase 5: Background Job + AI Generation

### Overview
Implement background job handler for AI-powered flashcard generation from documents/chunks, with chunk matching via embeddings and draft card creation.

### Changes Required

#### 1. Job Schema
**File**: `worker/types/job-schemas.ts`
**Changes**: Add GenerateFlashcardsOutputSchema

```typescript
// Add after line 105

/**
 * Generate Flashcards Job Output Schema
 *
 * Used in: worker/handlers/generate-flashcards.ts
 * Stored in: background_jobs.output_data (JSONB)
 * Consumed by: Review panel UI
 */
export const GenerateFlashcardsOutputSchema = z.object({
  success: z.boolean(),
  flashcardsGenerated: z.number(),
  flashcardIds: z.array(z.string().uuid()),
  processingTimeMs: z.number(),
  aiCost: z.number().optional(),  // Estimated cost in USD
  averageConfidence: z.number().optional(),  // 0-1 range
  error: z.string().optional(),
})

export type GenerateFlashcardsOutput = z.infer<typeof GenerateFlashcardsOutputSchema>

// Update validateJobOutput function
export function validateJobOutput(
  jobType: 'export_documents' | 'import_document' | 'reprocess_connections' | 'generate_flashcards',
  data: unknown
): JobOutput {
  switch (jobType) {
    // ... existing cases
    case 'generate_flashcards':
      return GenerateFlashcardsOutputSchema.parse(data)
    default:
      throw new Error(`Unknown job type: ${jobType}`)
  }
}
```

---

#### 2. Job Handler
**File**: `worker/handlers/generate-flashcards.ts` (NEW)
**Pattern**: Copy export handler from `worker/handlers/export-document.ts:45-331`

```typescript
import { HandlerJobManager } from '../lib/managers/handler-job-manager'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { GenerateFlashcardsOutputSchema } from '../types/job-schemas'
import type { SupabaseClient } from '@supabase/supabase-js'

interface GenerateFlashcardsInput {
  sourceType: 'document' | 'chunks' | 'selection'
  sourceIds: string[]  // document IDs or chunk IDs
  cardCount: number
  userId: string
  deckId: string  // Where to add generated cards
}

/**
 * Generate flashcards from document/chunks using Gemini AI
 *
 * Pattern: HandlerJobManager progress tracking like export-document.ts:45-331
 */
export async function generateFlashcardsHandler(
  supabase: SupabaseClient,
  job: { id: string; input_data: GenerateFlashcardsInput }
): Promise<void> {
  const { sourceType, sourceIds, cardCount, userId, deckId } = job.input_data

  console.log(`[GenerateFlashcards] Starting for ${sourceIds.length} ${sourceType}(s)`)

  const jobManager = new HandlerJobManager(supabase, job.id)
  const startTime = Date.now()

  try {
    // ✅ STEP 1: LOAD SOURCE CONTENT (10%)
    await jobManager.updateProgress(10, 'loading', 'Loading source content')

    let sourceContent = ''
    let chunkContext: any[] = []

    if (sourceType === 'document') {
      // Load full document markdown
      const { data: docs } = await supabase
        .from('documents')
        .select('id, title, markdown_available')
        .in('id', sourceIds)

      for (const doc of docs || []) {
        if (doc.markdown_available) {
          // Download markdown from Storage
          const { data: signedUrl } = await supabase.storage
            .from('documents')
            .createSignedUrl(`${userId}/documents/${doc.id}/markdown.md`, 3600)

          if (signedUrl?.signedUrl) {
            const response = await fetch(signedUrl.signedUrl)
            const markdown = await response.text()
            sourceContent += `\n\n# ${doc.title}\n\n${markdown}`
          }
        }

        // Also load chunks for matching later
        const { data: chunks } = await supabase
          .from('chunks')
          .select('id, content, chunk_index, embedding')
          .eq('document_id', doc.id)
          .eq('is_current', true)
          .order('chunk_index')

        chunkContext.push(...(chunks || []))
      }
    } else if (sourceType === 'chunks') {
      // Load specific chunks
      const { data: chunks } = await supabase
        .from('chunks')
        .select('id, content, chunk_index, document_id, embedding')
        .in('id', sourceIds)
        .order('chunk_index')

      chunkContext = chunks || []
      sourceContent = chunks?.map(c => c.content).join('\n\n') || ''
    }

    console.log(`✓ Loaded ${sourceContent.length} chars from ${chunkContext.length} chunks`)

    // ✅ STEP 2: CALL GEMINI AI (10-80%)
    await jobManager.updateProgress(20, 'generating', 'Generating flashcards with AI')

    const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY!)
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' })

    const prompt = `Generate ${cardCount} high-quality flashcards from this content.

Content:
${sourceContent.slice(0, 50000)}  // Limit to avoid token overflow

Requirements:
- Focus on key concepts, important details, and connections
- Questions should be clear and specific
- Answers should be concise but complete
- Each card should test understanding, not just recall

Output format (JSON array):
[
  {
    "question": "What is...",
    "answer": "...",
    "confidence": 0.85,
    "keywords": ["concept1", "concept2"]
  }
]

Generate exactly ${cardCount} flashcards in JSON format.`

    const result = await model.generateContent(prompt)
    const text = result.response.text()

    // Parse JSON (extract from code block if needed)
    let generatedCards = []
    try {
      const jsonMatch = text.match(/\[[\s\S]*\]/)
      if (jsonMatch) {
        generatedCards = JSON.parse(jsonMatch[0])
      } else {
        generatedCards = JSON.parse(text)
      }
    } catch (error) {
      throw new Error(`Failed to parse AI response: ${error}`)
    }

    console.log(`✓ Generated ${generatedCards.length} flashcards`)

    // ✅ STEP 3: MATCH CARDS TO CHUNKS (80-90%)
    await jobManager.updateProgress(80, 'matching', 'Matching cards to source chunks')

    const flashcardIds: string[] = []

    for (let i = 0; i < generatedCards.length; i++) {
      const card = generatedCards[i]

      // Find best matching chunk via keyword overlap (simple heuristic)
      // TODO: Use embedding similarity for better matching
      let bestChunkId = chunkContext[0]?.id || null
      let bestChunkIds: string[] = []

      if (card.keywords && chunkContext.length > 0) {
        // Find chunks that contain any of the keywords
        const matchingChunks = chunkContext.filter(chunk =>
          card.keywords.some((kw: string) =>
            chunk.content.toLowerCase().includes(kw.toLowerCase())
          )
        )

        if (matchingChunks.length > 0) {
          bestChunkId = matchingChunks[0].id
          bestChunkIds = matchingChunks.slice(0, 3).map((c: any) => c.id)  // Top 3 matches
        }
      }

      // Create ECS entity (draft status)
      const { data: entity } = await supabase
        .from('entities')
        .insert({
          user_id: userId,
          entity_type: 'flashcard',
        })
        .select()
        .single()

      if (!entity) continue

      // Add components
      await supabase.from('components').insert([
        {
          entity_id: entity.id,
          user_id: userId,
          component_type: 'Card',
          data: {
            type: 'basic',
            question: card.question,
            answer: card.answer,
            status: 'draft',
            srs: null,
            deckId: deckId,
            deckAddedAt: new Date().toISOString(),
            generatedBy: `ai_${sourceType}`,
            generationPromptVersion: 'v1-default',
          }
        },
        {
          entity_id: entity.id,
          user_id: userId,
          component_type: 'Content',
          data: {
            tags: card.keywords || [],
            note: null,
          }
        },
        {
          entity_id: entity.id,
          user_id: userId,
          component_type: 'Temporal',
          data: {
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          }
        },
        {
          entity_id: entity.id,
          user_id: userId,
          component_type: 'ChunkRef',
          data: {
            documentId: chunkContext[0]?.document_id || null,
            document_id: chunkContext[0]?.document_id || null,
            chunkId: bestChunkId,
            chunk_id: bestChunkId,
            chunkIds: bestChunkIds,
            chunkPosition: 0,
            generationJobId: job.id,
          }
        },
      ])

      flashcardIds.push(entity.id)

      // Update progress
      if ((i + 1) % 5 === 0) {
        const percent = 80 + Math.floor((i + 1) / generatedCards.length * 10)
        await jobManager.updateProgress(
          percent,
          'matching',
          `Matched ${i + 1} of ${generatedCards.length} cards`
        )
      }
    }

    // ✅ STEP 4: COMPLETE (100%)
    const processingTime = Date.now() - startTime

    const outputData = {
      success: true,
      flashcardsGenerated: flashcardIds.length,
      flashcardIds,
      processingTimeMs: processingTime,
      aiCost: 0.01,  // Estimated
      averageConfidence: generatedCards.reduce((sum: number, c: any) => sum + (c.confidence || 0), 0) / generatedCards.length,
    }

    // Validate before saving
    GenerateFlashcardsOutputSchema.parse(outputData)

    await jobManager.markComplete(
      outputData,
      `Generated ${flashcardIds.length} flashcards in ${Math.round(processingTime / 1000)}s`
    )

    console.log(`[GenerateFlashcards] ✓ Complete: ${flashcardIds.length} cards`)

  } catch (error: any) {
    console.error('[GenerateFlashcards] Failed:', error)
    await jobManager.markFailed(error)
    throw error
  }
}
```

---

#### 3. Register Handler
**File**: `worker/index.ts`
**Changes**: Add generateFlashcardsHandler to handler registry

```typescript
// Add import
import { generateFlashcardsHandler } from './handlers/generate-flashcards'

// Add to handler map (around line 50)
const JOB_HANDLERS: Record<string, JobHandler> = {
  // ... existing handlers
  generate_flashcards: generateFlashcardsHandler,
}
```

---

#### 4. Trigger Server Action
**File**: `src/app/actions/flashcards.ts`
**Changes**: Add generateFlashcards action

```typescript
// Add to existing file

/**
 * Trigger background job to generate flashcards
 */
export async function generateFlashcards(input: {
  sourceType: 'document' | 'chunks' | 'selection'
  sourceIds: string[]
  cardCount: number
  deckId: string
}) {
  const user = await getCurrentUser()
  if (!user) throw new Error('Unauthorized')

  try {
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
          sourceType: input.sourceType,
          sourceIds: input.sourceIds,
          cardCount: input.cardCount,
          userId: user.id,
          deckId: input.deckId,
        },
      })
      .select()
      .single()

    if (error) throw error

    console.log(`[GenerateFlashcards] Created job: ${job.id}`)

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
 * Poll job status (for UI)
 */
export async function getGenerationJobStatus(jobId: string) {
  const user = await getCurrentUser()
  if (!user) throw new Error('Unauthorized')

  const supabase = createAdminClient()

  const { data: job, error } = await supabase
    .from('background_jobs')
    .select('*')
    .eq('id', jobId)
    .eq('user_id', user.id)
    .single()

  if (error) throw error

  return {
    status: job.status,
    progress: job.progress,
    output_data: job.output_data,
  }
}
```

---

### Success Criteria

#### Automated Verification:
- [ ] Job handler compiles without errors
- [ ] Zod schema validation passes
- [ ] Worker picks up job from queue

#### Manual Verification:
- [ ] Trigger generation from UI → Job created
- [ ] Worker processes job → Generates flashcards
- [ ] Cards created as ECS entities (draft status)
- [ ] Cards linked to source chunks (ChunkRef component)
- [ ] Job completes → output_data contains flashcardIds
- [ ] Review panel opens with generated cards
- [ ] Generated cards have reasonable quality
- [ ] Chunk matching is >90% accurate
- [ ] Cost estimate is ~$0.01 per 5 cards

**Implementation Note**: Test with multiple source types (document, chunks, selection) and verify chunk matching quality.

### Service Restarts:
- [ ] Worker: Restart to load new handler
- [ ] Verify background_jobs table updates correctly

---

## Testing Strategy

### Unit Tests

**Critical modules:**
- `src/lib/ecs/flashcards.ts` - FlashcardOperations (create, approve, review, update, delete)
- `src/lib/flashcards/storage.ts` - Storage upload/download/verify
- FSRS integration - Verify ts-fsrs calculations are correct

**Example test:**
```typescript
// src/lib/ecs/__tests__/flashcards.test.ts
import { FlashcardOperations } from '../flashcards'
import { createEmptyCard, Rating } from 'ts-fsrs'

describe('FlashcardOperations', () => {
  it('should create draft flashcard with no SRS component', async () => {
    const ops = new FlashcardOperations(mockECS, 'user-123')
    const id = await ops.create({
      type: 'basic',
      question: 'Test Q',
      answer: 'Test A',
      deckId: 'inbox',
    })

    const entity = await mockECS.getEntity(id, 'user-123')
    const card = entity.components.find(c => c.component_type === 'Card')

    expect(card.data.status).toBe('draft')
    expect(card.data.srs).toBeNull()
  })

  it('should add SRS component on approve', async () => {
    const ops = new FlashcardOperations(mockECS, 'user-123')
    const id = await ops.create({ /* ... */ })

    await ops.approve(id)

    const entity = await mockECS.getEntity(id, 'user-123')
    const card = entity.components.find(c => c.component_type === 'Card')

    expect(card.data.status).toBe('active')
    expect(card.data.srs).not.toBeNull()
    expect(card.data.srs.due).toBeDefined()
  })

  it('should update FSRS schedule on Good rating', async () => {
    const ops = new FlashcardOperations(mockECS, 'user-123')
    const id = await ops.create({ /* ... */ })
    await ops.approve(id)

    const before = await mockECS.getEntity(id, 'user-123')
    const beforeSRS = before.components.find(c => c.component_type === 'Card').data.srs

    await ops.review(id, { rating: Rating.Good, timeSpentMs: 5000 })

    const after = await mockECS.getEntity(id, 'user-123')
    const afterSRS = after.components.find(c => c.component_type === 'Card').data.srs

    expect(afterSRS.scheduled_days).toBeGreaterThan(beforeSRS.scheduled_days)
    expect(afterSRS.reps).toBe(beforeSRS.reps + 1)
  })
})
```

---

### Integration Tests

**Critical flows:**
1. Generate cards → Review → Approve → Study
2. Edit card → Preserves SRS schedule
3. Storage integrity → Verify files match ECS
4. Cache rebuild → Matches Storage

---

### Manual Testing Checklist

**Phase 1:**
- [ ] Create flashcard via FlashcardOperations.create()
- [ ] Verify Storage file at `{userId}/flashcards/{cardId}.json`
- [ ] Verify cache row in flashcards_cache
- [ ] Approve flashcard → SRS added
- [ ] Integrity check passes

**Phase 2:**
- [ ] Create flashcard via Server Action
- [ ] Update flashcard → All locations sync
- [ ] Delete flashcard → Cascade works
- [ ] Create deck → Appears in list

**Phase 3:**
- [ ] FlashcardCard displays correctly
- [ ] Keyboard shortcuts work (e/a/d)
- [ ] Inline editing saves correctly
- [ ] Optimistic updates revert on error

**Phase 4:**
- [ ] Start study session
- [ ] Review cards with 1/2/3/4 ratings
- [ ] FSRS intervals update correctly
- [ ] Session stats recorded
- [ ] Mobile gestures work (future)

**Phase 5:**
- [ ] Generate from document
- [ ] Generated cards have chunk links
- [ ] Review panel opens with cards
- [ ] Approve all → Enter study rotation

---

## Performance Considerations

**Caching Strategy:**
- Use flashcards_cache for ALL study queries (not ECS)
- Cache indexed by: user_id, deck_id, status, next_review, tags
- Rebuild cache from Storage when out of sync

**Study Query Optimization:**
```sql
-- Optimized query for due cards (uses index)
SELECT * FROM flashcards_cache
WHERE user_id = ?
  AND status = 'active'
  AND next_review <= NOW()
ORDER BY next_review ASC
LIMIT 50;

-- Uses index: idx_flashcards_cache_due
```

**FSRS Performance:**
- ts-fsrs library is highly optimized
- Review calculation: <1ms per card
- No performance concerns for 1000s of cards

---

## Migration Notes

**Data Migration:**
- If user has existing cards in different format, create migration script
- Export existing cards → Transform to ECS format → Import

**From SM-2 to FSRS:**
- No direct conversion of ease factors
- Start fresh with FSRS for new cards
- Keep old cards on SM-2 (or reset with FSRS defaults)

---

## References

- **Architecture**: `docs/ARCHITECTURE.md`
- **ECS Guide**: `docs/ECS_IMPLEMENTATION.md`
- **Sparks System**: `docs/SPARK_SYSTEM.md` (pattern reference)
- **Storage Guide**: `docs/STORAGE_FIRST_PORTABILITY_GUIDE.md`
- **FSRS Documentation**: https://github.com/open-spaced-repetition/fsrs4anki
- **ts-fsrs Library**: https://github.com/open-spaced-repetition/ts-fsrs
- **Similar implementation**: `src/lib/ecs/sparks.ts:71-566`

---

**Total Plan Length:** ~6800 lines
**Estimated Implementation Time:** 12-15 days (5 phases)
**Ready to start Phase 1**
