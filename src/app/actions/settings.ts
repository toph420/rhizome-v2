'use server'

import { getCurrentUser, getServerSupabaseClient } from '@/lib/auth'
import { validateVaultStructure } from '@/lib/vault-structure'

const IS_DEV = process.env.NEXT_PUBLIC_DEV_MODE === 'true'

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
    const supabase = await getServerSupabaseClient()
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
      // In dev mode, if settings don't exist yet, return empty settings (not an error)
      if (error.code === 'PGRST116') {
        return {
          success: true,
          settings: undefined
        }
      }
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
    const supabase = await getServerSupabaseClient()
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
 * Validate vault path configuration.
 *
 * In development mode: Validates that directories exist on filesystem
 * In production mode: Only validates that paths are provided (can't access local filesystem from Vercel)
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

    // In production (Vercel), can't access local filesystem
    // Just validate paths are provided
    if (!IS_DEV) {
      console.log(`[validateVault] Production mode - filesystem check deferred to worker`)
      return {
        success: true,
        valid: true,
        missing: []
      }
    }

    // In development mode, validate filesystem
    console.log(`[validateVault] Dev mode - validating filesystem`)
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
 * Configure vault path.
 * Saves vault configuration - directory structure is created by worker when needed.
 *
 * NOTE: This runs on Vercel servers, so it cannot access your local filesystem.
 * The vault directories will be created by the local worker when exporting files.
 *
 * @param vaultPath - Absolute path to vault root (e.g., "/Users/topher/Tophs Vault")
 * @param vaultName - Vault name (for Obsidian URIs)
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

    // Don't create directories here - this runs on Vercel (cloud)
    // The worker (running locally) will create vault structure when exporting
    console.log(`[createVault] Vault path configured: ${vaultPath}`)
    console.log(`[createVault] Directory structure will be created by worker on first export`)

    return { success: true }
  } catch (error) {
    console.error('[createVault] Unexpected error:', error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    return { success: false, error: message }
  }
}
