import { createClient } from '@supabase/supabase-js'

/**
 * Creates a Supabase client with service role privileges.
 * Use this for admin operations that bypass RLS.
 * NEVER expose this to the client side.
 * @returns Supabase client with admin privileges.
 */
export function createAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseServiceRole = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !supabaseServiceRole) {
    throw new Error('Missing Supabase environment variables')
  }

  return createClient(supabaseUrl, supabaseServiceRole, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  })
}