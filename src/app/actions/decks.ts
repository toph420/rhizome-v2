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
