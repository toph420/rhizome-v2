/**
 * ECS instance factory.
 * Creates ECS instances with appropriate Supabase client.
 */

import { ECS } from './ecs'
import { getSupabaseClient } from '@/lib/auth'

/**
 * Creates an ECS instance with the current Supabase client.
 * @returns ECS instance.
 */
export function createECS() {
  const supabase = getSupabaseClient()
  return new ECS(supabase)
}

// Re-export types
export type { Entity, Component, ComponentData } from './ecs'