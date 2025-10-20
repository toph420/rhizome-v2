'use server'

import { getCurrentUser, getSupabaseClient } from '@/lib/auth'
import { validateVaultStructure, createVaultStructure } from '../../../worker/lib/vault-structure'

// ============================================================================
// OBSIDIAN SETTINGS
// ============================================================================

/**
 * Obsidian settings stored in user_settings.obsidian_settings JSONB
 */
export interface ObsidianSettings {
  vaultPath: string
  vaultName: string
  rhizomePath: string
  syncAnnotations: boolean
  exportSparks: boolean
  exportConnections: boolean
}

/**
 * Result of settings operations
 */
export interface SettingsResult {
  success: boolean
  settings?: ObsidianSettings
  error?: string
}

/**
 * Vault validation result
 */
export interface VaultValidationResult {
  success: boolean
  valid?: boolean
  missing?: string[]
  error?: string
}

/**
 * Get current Obsidian settings for the authenticated user.
 *
 * @returns Current Obsidian settings or null if not configured
 */
export async function getObsidianSettings(): Promise<SettingsResult> {
  try {
    const supabase = getSupabaseClient()
    const user = await getCurrentUser()

    if (!user) {
      return { success: false, error: 'Not authenticated' }
    }

    const { data, error } = await supabase
      .from('user_settings')
      .select('obsidian_settings')
      .eq('user_id', user.id)
      .single()

    if (error) {
      console.error('[getObsidianSettings] Error:', error)
      return { success: false, error: error.message }
    }

    return {
      success: true,
      settings: data?.obsidian_settings || null
    }
  } catch (error) {
    console.error('[getObsidianSettings] Unexpected error:', error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    return { success: false, error: message }
  }
}

/**
 * Save Obsidian settings for the authenticated user.
 * Creates or updates user_settings row.
 *
 * @param settings - Obsidian settings to save
 * @returns Success result
 */
export async function saveObsidianSettings(
  settings: ObsidianSettings
): Promise<SettingsResult> {
  try {
    const supabase = getSupabaseClient()
    const user = await getCurrentUser()

    if (!user) {
      return { success: false, error: 'Not authenticated' }
    }

    // Validate settings
    if (!settings.vaultPath || !settings.vaultName) {
      return { success: false, error: 'Vault path and name are required' }
    }

    // Upsert user_settings with obsidian_settings JSONB
    const { error } = await supabase
      .from('user_settings')
      .upsert({
        user_id: user.id,
        obsidian_settings: settings
      }, {
        onConflict: 'user_id'
      })

    if (error) {
      console.error('[saveObsidianSettings] Error:', error)
      return { success: false, error: error.message }
    }

    return {
      success: true,
      settings
    }
  } catch (error) {
    console.error('[saveObsidianSettings] Unexpected error:', error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    return { success: false, error: message }
  }
}

/**
 * Validate that the vault structure exists and is complete.
 * Checks for required directories (Documents/, Connections/, Sparks/, Index/).
 *
 * @param vaultPath - Absolute path to vault root
 * @param rhizomePath - Relative path within vault (default: "Rhizome/")
 * @returns Validation result with list of missing directories
 */
export async function validateVault(
  vaultPath: string,
  rhizomePath: string = 'Rhizome/'
): Promise<VaultValidationResult> {
  try {
    const user = await getCurrentUser()

    if (!user) {
      return { success: false, error: 'Not authenticated' }
    }

    if (!vaultPath || !rhizomePath) {
      return { success: false, error: 'vaultPath and rhizomePath are required' }
    }

    const result = await validateVaultStructure({
      vaultPath,
      vaultName: '', // Not needed for validation
      rhizomePath
    })

    return {
      success: true,
      valid: result.valid,
      missing: result.missing
    }
  } catch (error) {
    console.error('[validateVault] Unexpected error:', error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    return {
      success: false,
      valid: false,
      missing: [],
      error: message
    }
  }
}

/**
 * Create vault directory structure.
 * Creates all required directories: Documents/, Connections/, Sparks/, Index/, and README.
 * Idempotent - safe to call multiple times.
 *
 * @param vaultPath - Absolute path to vault root
 * @param vaultName - Vault name (for README)
 * @param rhizomePath - Relative path within vault (default: "Rhizome/")
 * @returns Success result
 */
export async function createVault(
  vaultPath: string,
  vaultName: string,
  rhizomePath: string = 'Rhizome/'
): Promise<SettingsResult> {
  try {
    const user = await getCurrentUser()

    if (!user) {
      return { success: false, error: 'Not authenticated' }
    }

    if (!vaultPath || !vaultName || !rhizomePath) {
      return { success: false, error: 'vaultPath, vaultName, and rhizomePath are required' }
    }

    await createVaultStructure({
      vaultPath,
      vaultName,
      rhizomePath
    })

    return { success: true }
  } catch (error) {
    console.error('[createVault] Unexpected error:', error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    return { success: false, error: message }
  }
}
