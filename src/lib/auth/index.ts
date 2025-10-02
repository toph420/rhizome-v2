/**
 * Authentication wrapper for Rhizome V2.
 * Handles both development and production auth seamlessly.
 */

import { createClient } from '@/lib/supabase/client'
import { createAdminClient } from '@/lib/supabase/admin'

const IS_DEV = process.env.NEXT_PUBLIC_DEV_MODE === 'true'
const DEV_USER_ID = process.env.NEXT_PUBLIC_DEV_USER_ID || '00000000-0000-0000-0000-000000000000'

/**
 * Gets the current user in both dev and production environments.
 * @returns The current user object or null if not authenticated.
 */
export async function getCurrentUser() {
  if (IS_DEV) {
    return {
      id: DEV_USER_ID,
      email: 'dev@localhost'
    }
  }
  
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

/**
 * Gets the appropriate Supabase client based on environment.
 * @returns Admin client in dev (bypasses RLS), regular client in production.
 */
export function getSupabaseClient() {
  // In dev, use admin client to bypass RLS
  // In prod, use regular client with RLS
  if (IS_DEV && typeof window === 'undefined') {
    // Only use admin client on server side
    return createAdminClient()
  }
  return createClient()
}

/**
 * Requires a user to be authenticated.
 * @returns The current user.
 * @throws {Error} If no user is authenticated.
 */
export async function requireUser() {
  const user = await getCurrentUser()
  if (!user) {
    throw new Error('Unauthorized')
  }
  return user
}