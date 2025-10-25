import { createAdminClient } from '@/lib/supabase/admin'

/**
 * System deck helpers
 *
 * Provides access to Inbox and Archive system decks
 * System decks are automatically created for each user
 *
 * Pattern: Simple helper functions for common deck operations
 */

export const SYSTEM_DECKS = {
  INBOX: 'Inbox',
  ARCHIVE: 'Archive',
} as const

/**
 * Get system deck by name
 */
export async function getSystemDeck(
  userId: string,
  deckName: typeof SYSTEM_DECKS[keyof typeof SYSTEM_DECKS]
) {
  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('decks')
    .select('*')
    .eq('user_id', userId)
    .eq('name', deckName)
    .eq('is_system', true)
    .single()

  if (error) {
    // If system deck doesn't exist, create it
    if (error.code === 'PGRST116') {
      const { data: newDeck } = await supabase
        .from('decks')
        .insert({
          user_id: userId,
          name: deckName,
          description: `System ${deckName} deck`,
          is_system: true,
        })
        .select()
        .single()

      return newDeck
    }
    throw error
  }

  return data
}

/**
 * Get Inbox deck
 * This is where newly generated cards go by default
 */
export async function getInboxDeck(userId: string) {
  return getSystemDeck(userId, SYSTEM_DECKS.INBOX)
}

/**
 * Get Archive deck
 * This is where cards are moved when archived
 */
export async function getArchiveDeck(userId: string) {
  return getSystemDeck(userId, SYSTEM_DECKS.ARCHIVE)
}

/**
 * Check if a deck is a system deck
 */
export function isSystemDeck(deckName: string): boolean {
  return Object.values(SYSTEM_DECKS).includes(deckName as any)
}
