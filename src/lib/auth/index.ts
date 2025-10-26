/**
 * Authentication wrapper for Rhizome V2.
 * Handles both development and production auth seamlessly.
 */

import { createClient as createBrowserClient } from '@/lib/supabase/client'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

const IS_DEV = process.env.NEXT_PUBLIC_DEV_MODE === 'true'
const DEV_USER_ID = process.env.NEXT_PUBLIC_DEV_USER_ID || '00000000-0000-0000-0000-000000000000'

/**
 * Gets the current user in both dev and production environments.
 * SERVER-SIDE ONLY: Use in Server Actions and Server Components.
 * @returns The current user object or null if not authenticated.
 */
export async function getCurrentUser() {
  if (IS_DEV) {
    return {
      id: DEV_USER_ID,
      email: 'dev@localhost'
    }
  }

  // Use server-side client (works in Server Actions and Server Components)
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

/**
 * Gets Supabase client for CLIENT-SIDE use only.
 * Use in React components and hooks.
 * For Server Actions, import getServerSupabaseClient instead.
 * @returns Browser client or admin client in dev mode.
 */
export function getSupabaseClient() {
  // In dev, use admin client to bypass RLS (server-side only)
  if (IS_DEV && typeof window === 'undefined') {
    return createAdminClient()
  }
  // In production or client-side, use browser client
  return createBrowserClient()
}

/**
 * Gets Supabase client for SERVER-SIDE use.
 * Use in Server Actions and Server Components.
 * @returns Server client (reads auth cookies) or admin client in dev mode.
 */
export async function getServerSupabaseClient() {
  // In dev, use admin client to bypass RLS
  if (IS_DEV) {
    return createAdminClient()
  }
  // In production, use server client (reads cookies from request)
  return await createServerClient()
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
