/**
 * Supabase Error Serialization Helpers
 *
 * Supabase/PostgreSQL errors don't serialize well with console.log,
 * resulting in empty {} objects. These helpers extract useful error information.
 */

interface SupabaseError {
  message?: string
  code?: string
  details?: string
  hint?: string
  status?: number
  statusText?: string
}

/**
 * Serialize a Supabase error for logging
 *
 * @example
 * ```ts
 * try {
 *   const { data, error } = await supabase.from('table').select()
 *   if (error) console.error('Query failed:', serializeSupabaseError(error))
 * } catch (err) {
 *   console.error('Unexpected error:', serializeSupabaseError(err))
 * }
 * ```
 */
export function serializeSupabaseError(error: unknown): Record<string, unknown> {
  if (!error) return { error: 'Unknown error (null/undefined)' }

  // If it's already a plain object or primitive, return as-is
  if (typeof error === 'string') return { message: error }
  if (typeof error === 'number') return { code: error }

  // Extract error properties
  const err = error as SupabaseError & Error

  return {
    message: err.message || 'No error message',
    code: err.code,
    details: err.details,
    hint: err.hint,
    status: err.status,
    statusText: err.statusText,
    name: err.name,
    // Include stack trace if available (useful for debugging)
    ...(err.stack && { stack: err.stack }),
  }
}

/**
 * Get a user-friendly error message from a Supabase error
 *
 * @example
 * ```ts
 * const { error } = await supabase.from('table').select()
 * if (error) {
 *   setErrorMessage(getErrorMessage(error))
 * }
 * ```
 */
export function getErrorMessage(error: unknown): string {
  if (!error) return 'Unknown error occurred'

  if (typeof error === 'string') return error

  const err = error as SupabaseError & Error

  // Priority: custom message > details > hint > generic
  if (err.message) return err.message
  if (err.details) return err.details
  if (err.hint) return err.hint

  return 'An unexpected error occurred'
}
