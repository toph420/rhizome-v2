'use server'

import { z } from 'zod'
import { getCurrentUser } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

/**
 * Prompt template CRUD actions
 *
 * Pattern: Standard server actions with Zod validation
 * Follows src/app/actions/flashcards.ts patterns
 */

const CreatePromptSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  template: z.string().min(1),
  variables: z.array(z.string()),
})

const UpdatePromptSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  template: z.string().min(1).optional(),
  variables: z.array(z.string()).optional(),
})

/**
 * Get all prompt templates for current user
 */
export async function getPromptTemplates() {
  const user = await getCurrentUser()
  if (!user) throw new Error('Unauthorized')

  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('prompt_templates')
    .select('*')
    .eq('user_id', user.id)
    .order('is_default', { ascending: false })
    .order('usage_count', { ascending: false })

  if (error) throw error

  return data
}

/**
 * Get default prompt template
 */
export async function getDefaultPromptTemplate() {
  const user = await getCurrentUser()
  if (!user) throw new Error('Unauthorized')

  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('prompt_templates')
    .select('*')
    .eq('user_id', user.id)
    .eq('is_default', true)
    .single()

  if (error) throw error

  return data
}

/**
 * Create custom prompt template
 */
export async function createPromptTemplate(input: z.infer<typeof CreatePromptSchema>) {
  const user = await getCurrentUser()
  if (!user) throw new Error('Unauthorized')

  try {
    const validated = CreatePromptSchema.parse(input)
    const supabase = createAdminClient()

    const { data, error } = await supabase
      .from('prompt_templates')
      .insert({
        user_id: user.id,
        ...validated,
        is_system: false,
        is_default: false,
        updated_at: new Date().toISOString(),
      })
      .select()
      .single()

    if (error) throw error

    revalidatePath('/flashcards')
    return { success: true, prompt: data }

  } catch (error) {
    console.error('[Prompts] Create failed:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

/**
 * Update custom prompt template (system prompts cannot be updated)
 */
export async function updatePromptTemplate(
  promptId: string,
  updates: z.infer<typeof UpdatePromptSchema>
) {
  const user = await getCurrentUser()
  if (!user) throw new Error('Unauthorized')

  try {
    const validated = UpdatePromptSchema.parse(updates)
    const supabase = createAdminClient()

    const { data, error } = await supabase
      .from('prompt_templates')
      .update({
        ...validated,
        updated_at: new Date().toISOString(),
      })
      .eq('id', promptId)
      .eq('user_id', user.id)
      .eq('is_system', false)
      .select()
      .single()

    if (error) throw error

    revalidatePath('/flashcards')
    return { success: true, prompt: data }

  } catch (error) {
    console.error('[Prompts] Update failed:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

/**
 * Delete prompt template (custom only)
 */
export async function deletePromptTemplate(promptId: string) {
  const user = await getCurrentUser()
  if (!user) throw new Error('Unauthorized')

  try {
    const supabase = createAdminClient()

    const { error } = await supabase
      .from('prompt_templates')
      .delete()
      .eq('id', promptId)
      .eq('user_id', user.id)
      .eq('is_system', false)

    if (error) throw error

    revalidatePath('/flashcards')
    return { success: true }

  } catch (error) {
    console.error('[Prompts] Delete failed:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

/**
 * Set default prompt template
 */
export async function setDefaultPromptTemplate(promptId: string) {
  const user = await getCurrentUser()
  if (!user) throw new Error('Unauthorized')

  try {
    const supabase = createAdminClient()

    // Remove default flag from all user's prompts
    await supabase
      .from('prompt_templates')
      .update({ is_default: false })
      .eq('user_id', user.id)

    // Set new default
    const { data, error } = await supabase
      .from('prompt_templates')
      .update({ is_default: true })
      .eq('id', promptId)
      .eq('user_id', user.id)
      .select()
      .single()

    if (error) throw error

    revalidatePath('/flashcards')
    return { success: true, prompt: data }

  } catch (error) {
    console.error('[Prompts] Set default failed:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

/**
 * Track usage (called by worker after using prompt)
 */
export async function trackPromptUsage(promptId: string) {
  const user = await getCurrentUser()
  if (!user) throw new Error('Unauthorized')

  const supabase = createAdminClient()

  // Increment usage count and update last_used_at
  await supabase.rpc('increment_prompt_usage', { prompt_id: promptId })
}
