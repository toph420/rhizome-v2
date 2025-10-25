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

  // Ensure system decks exist first
  await ensureSystemDecks()

  const supabase = createAdminClient()

  // Get all decks with parent deck name (if exists)
  const { data: decks, error: decksError } = await supabase
    .from('decks')
    .select(`
      *,
      parent:parent_id (
        id,
        name
      )
    `)
    .eq('user_id', user.id)
    .order('created_at', { ascending: true })

  if (decksError) throw decksError

  // Get card counts per deck
  const { data: counts, error: countsError } = await supabase
    .from('flashcards_cache')
    .select('deck_id, status')
    .eq('user_id', user.id)

  if (countsError) throw countsError

  // Get due card counts (where next_review <= NOW)
  const { data: dueCounts, error: dueError } = await supabase
    .from('flashcards_cache')
    .select('deck_id')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .lte('next_review', new Date().toISOString())

  if (dueError) throw dueError

  // Calculate stats and flatten parent object
  const deckStats = decks.map(deck => {
    const deckCards = counts.filter(c => c.deck_id === deck.id)
    const deckDue = dueCounts?.filter(c => c.deck_id === deck.id).length || 0

    return {
      ...deck,
      parent_name: deck.parent ? deck.parent.name : null,
      total_cards: deckCards.length,
      draft_cards: deckCards.filter(c => c.status === 'draft').length,
      active_cards: deckCards.filter(c => c.status === 'active').length,
      due_cards: deckDue,
    }
  })

  return deckStats
}

/**
 * Ensure system decks exist (Inbox, Archive)
 * Creates them if they don't exist
 */
export async function ensureSystemDecks() {
  const user = await getCurrentUser()
  if (!user) throw new Error('Unauthorized')

  const supabase = createAdminClient()

  // Check existing system decks
  const { data: existing } = await supabase
    .from('decks')
    .select('*')
    .eq('user_id', user.id)
    .eq('is_system', true)

  const hasInbox = existing?.some(d => d.name === 'Inbox')
  const hasArchive = existing?.some(d => d.name === 'Archive')

  // Create missing system decks
  const toCreate = []
  if (!hasInbox) {
    toCreate.push({
      user_id: user.id,
      name: 'Inbox',
      description: 'Default deck for new flashcards',
      is_system: true,
    })
  }
  if (!hasArchive) {
    toCreate.push({
      user_id: user.id,
      name: 'Archive',
      description: 'Archived flashcards',
      is_system: true,
    })
  }

  if (toCreate.length > 0) {
    await supabase.from('decks').insert(toCreate)
  }

  // Return all system decks
  const { data } = await supabase
    .from('decks')
    .select('*')
    .eq('user_id', user.id)
    .eq('is_system', true)

  const inbox = data?.find(d => d.name === 'Inbox')
  const archive = data?.find(d => d.name === 'Archive')

  return { inbox, archive }
}

/**
 * Get system decks (Inbox, Archive)
 */
export async function getSystemDecks() {
  return ensureSystemDecks()
}

/**
 * Update deck
 */
export async function updateDeck(
  deckId: string,
  updates: { name?: string; description?: string; parentId?: string }
) {
  const user = await getCurrentUser()
  if (!user) throw new Error('Unauthorized')

  try {
    const supabase = createAdminClient()
    const { data, error } = await supabase
      .from('decks')
      .update({
        name: updates.name,
        description: updates.description,
        parent_id: updates.parentId,
      })
      .eq('id', deckId)
      .eq('user_id', user.id)
      .select()
      .single()

    if (error) throw error

    revalidatePath('/flashcards/decks')

    return { success: true, deck: data }

  } catch (error) {
    console.error('[Decks] Update failed:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

/**
 * Delete deck (only non-system decks)
 */
export async function deleteDeck(deckId: string) {
  const user = await getCurrentUser()
  if (!user) throw new Error('Unauthorized')

  try {
    const supabase = createAdminClient()

    // Verify deck is not system deck
    const { data: deck } = await supabase
      .from('decks')
      .select('is_system')
      .eq('id', deckId)
      .eq('user_id', user.id)
      .single()

    if (deck?.is_system) {
      throw new Error('Cannot delete system deck')
    }

    const { error } = await supabase
      .from('decks')
      .delete()
      .eq('id', deckId)
      .eq('user_id', user.id)

    if (error) throw error

    revalidatePath('/flashcards/decks')

    return { success: true }

  } catch (error) {
    console.error('[Decks] Delete failed:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

/**
 * Move cards between decks (batch operation)
 */
export async function moveCardsToDeck(
  cardIds: string[],
  targetDeckId: string
) {
  const user = await getCurrentUser()
  if (!user) throw new Error('Unauthorized')

  try {
    const supabase = createAdminClient()
    const { createECS } = await import('@/lib/ecs')
    const ecs = createECS()

    // Update Card component for each flashcard
    for (const cardId of cardIds) {
      // Get existing Card component
      const { data: cardComponent } = await supabase
        .from('components')
        .select('*')
        .eq('entity_id', cardId)
        .eq('component_type', 'Card')
        .single()

      if (!cardComponent) continue

      // Update deck_id in component data
      const updatedData = {
        ...cardComponent.component_data,
        deckId: targetDeckId,
        deckAddedAt: new Date().toISOString(),
      }

      await supabase
        .from('components')
        .update({ component_data: updatedData })
        .eq('id', cardComponent.id)
    }

    // Rebuild cache to reflect deck changes
    await supabase.rpc('rebuild_flashcards_cache', {
      p_user_id: user.id,
    })

    revalidatePath('/study')
    revalidatePath('/flashcards')

    return { success: true, movedCount: cardIds.length }

  } catch (error) {
    console.error('[Decks] Move cards failed:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

/**
 * Get deck with detailed stats (retention rate, avg rating, last studied)
 */
export async function getDeckWithDetailedStats(deckId: string) {
  const user = await getCurrentUser()
  if (!user) throw new Error('Unauthorized')

  try {
    const supabase = createAdminClient()

    // Get deck
    const { data: deck, error: deckError } = await supabase
      .from('decks')
      .select('*')
      .eq('id', deckId)
      .eq('user_id', user.id)
      .single()

    if (deckError) throw deckError

    // Get cards for this deck
    const { data: cards } = await supabase
      .from('flashcards_cache')
      .select('*')
      .eq('user_id', user.id)
      .eq('deck_id', deckId)

    const now = new Date().toISOString()

    const stats = {
      totalCards: cards?.length || 0,
      draftCards: cards?.filter(c => c.status === 'draft').length || 0,
      activeCards: cards?.filter(c => c.status === 'active').length || 0,
      dueCards: cards?.filter(c => c.status === 'active' && c.next_review && c.next_review <= now).length || 0,
      avgDifficulty: cards?.length ? cards.reduce((sum, c) => sum + (c.difficulty || 0), 0) / cards.length : 0,
      // Note: Retention rate requires study_sessions join - calculate from last 30 days of reviews
      retentionRate: 0,  // TODO: Calculate from sessions
      lastStudied: null as Date | null,  // TODO: Get from most recent session
    }

    return {
      success: true,
      deck,
      stats,
    }

  } catch (error) {
    console.error('[Decks] Get detailed stats failed:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}
