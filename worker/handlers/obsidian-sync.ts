/**
 * Obsidian Integration Handlers
 * Handles bidirectional sync between Rhizome and Obsidian vaults
 */

import { promises as fs } from 'fs'
import * as path from 'path'
import { createClient } from '@supabase/supabase-js'
import { reprocessDocument } from './reprocess-document.js'
import type { RecoveryResults } from '../types/recovery.js'

/**
 * Get Supabase client (lazy initialization to avoid env loading issues)
 */
function getSupabaseClient() {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error(`Missing environment variables: SUPABASE_URL=${!!supabaseUrl}, SERVICE_KEY=${!!supabaseServiceKey}`)
  }

  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  })
}

// ============================================================================
// TYPES
// ============================================================================

export interface ObsidianSettings {
  vaultName: string
  vaultPath: string
  autoSync: boolean
  syncAnnotations: boolean
  exportPath: string  // Relative path in vault (e.g., "Rhizome/")
}

export interface ExportResult {
  success: boolean
  path: string
  uri: string
  error?: string
}

export interface SyncResult {
  success: boolean
  changed: boolean
  recovery?: RecoveryResults
  error?: string
}

// ============================================================================
// EXPORT TO OBSIDIAN
// ============================================================================

/**
 * Export document markdown to Obsidian vault
 * Also exports annotations.json if syncAnnotations is enabled
 */
export async function exportToObsidian(
  documentId: string,
  userId: string
): Promise<ExportResult> {
  try {
    console.log(`[Obsidian Export] Starting export for document ${documentId}`)

    const supabase = getSupabaseClient()

    // 1. Get document and Obsidian settings
    const { data: document, error: docError } = await supabase
      .from('documents')
      .select('title, markdown_path, obsidian_path')
      .eq('id', documentId)
      .single()

    if (docError || !document) {
      throw new Error(`Document not found: ${docError?.message}`)
    }

    const { data: settings, error: settingsError } = await supabase
      .from('user_settings')
      .select('obsidian_settings')
      .eq('user_id', userId)
      .single()

    if (settingsError || !settings?.obsidian_settings) {
      throw new Error('Obsidian settings not configured. Please configure vault path in settings.')
    }

    const obsidianSettings = settings.obsidian_settings as ObsidianSettings

    // 2. Download markdown from storage
    const { data: markdownBlob, error: downloadError } = await supabase.storage
      .from('documents')
      .download(document.markdown_path)

    if (downloadError || !markdownBlob) {
      throw new Error(`Failed to download markdown: ${downloadError?.message}`)
    }

    const markdown = await markdownBlob.text()

    // 3. Determine vault file path
    // Always use current exportPath settings (don't rely on stale obsidian_path)
    const vaultFilePath = path.join(
      obsidianSettings.vaultPath,
      obsidianSettings.exportPath || '',
      `${document.title}.md`
    )

    // Create directory if needed
    await fs.mkdir(path.dirname(vaultFilePath), { recursive: true })

    // 4. Write markdown to vault
    await fs.writeFile(vaultFilePath, markdown, 'utf-8')
    console.log(`[Obsidian Export] Markdown written to ${vaultFilePath}`)

    // 5. Export annotations if enabled
    if (obsidianSettings.syncAnnotations) {
      await exportAnnotations(documentId, vaultFilePath)
    }

    // 6. Calculate relative path for database and URI
    const relativePathToFile = path.relative(obsidianSettings.vaultPath, vaultFilePath)

    // Always update obsidian_path to reflect current location
    await supabase
      .from('documents')
      .update({ obsidian_path: relativePathToFile })
      .eq('id', documentId)

    // 7. Generate Obsidian URI
    const uri = getObsidianUri(
      obsidianSettings.vaultName,
      relativePathToFile
    )

    console.log(`[Obsidian Export] ✅ Export complete`)

    return {
      success: true,
      path: vaultFilePath,
      uri
    }

  } catch (error) {
    console.error('[Obsidian Export] ❌ Export failed:', error)
    return {
      success: false,
      path: '',
      uri: '',
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

// ============================================================================
// SYNC FROM OBSIDIAN
// ============================================================================

/**
 * Sync edited markdown from Obsidian vault back to Rhizome
 * Triggers reprocessing pipeline with annotation recovery
 */
export async function syncFromObsidian(
  documentId: string,
  userId: string,
  jobId?: string
): Promise<SyncResult> {
  try {
    console.log(`[Obsidian Sync] Starting sync for document ${documentId}`)

    const supabase = getSupabaseClient()

    // 1. Get document and Obsidian settings
    const { data: document, error: docError } = await supabase
      .from('documents')
      .select('markdown_path, obsidian_path')
      .eq('id', documentId)
      .single()

    if (docError || !document) {
      throw new Error(`Document not found: ${docError?.message}`)
    }

    if (!document.obsidian_path) {
      throw new Error('Document has not been exported to Obsidian yet')
    }

    const { data: settings, error: settingsError } = await supabase
      .from('user_settings')
      .select('obsidian_settings')
      .eq('user_id', userId)
      .single()

    if (settingsError || !settings?.obsidian_settings) {
      throw new Error('Obsidian settings not configured')
    }

    const obsidianSettings = settings.obsidian_settings as ObsidianSettings
    const vaultFilePath = path.join(obsidianSettings.vaultPath, document.obsidian_path)

    // 2. Read edited markdown from vault
    const editedMarkdown = await fs.readFile(vaultFilePath, 'utf-8')

    // 3. Get current storage version for comparison
    const { data: currentBlob, error: downloadError } = await supabase.storage
      .from('documents')
      .download(document.markdown_path)

    if (downloadError || !currentBlob) {
      throw new Error(`Failed to download current markdown: ${downloadError?.message}`)
    }

    const currentMarkdown = await currentBlob.text()

    // 4. Check if content actually changed
    if (editedMarkdown.trim() === currentMarkdown.trim()) {
      console.log(`[Obsidian Sync] No changes detected`)

      // Ensure document status is correct (in case of previous failed sync)
      await supabase
        .from('documents')
        .update({ processing_status: 'completed' })
        .eq('id', documentId)

      return {
        success: true,
        changed: false
      }
    }

    console.log(`[Obsidian Sync] Changes detected, starting reprocessing`)

    // 5. Upload edited markdown to storage
    const { error: uploadError } = await supabase.storage
      .from('documents')
      .update(document.markdown_path, new Blob([editedMarkdown], { type: 'text/markdown' }), {
        contentType: 'text/markdown',
        upsert: true
      })

    if (uploadError) {
      throw new Error(`Failed to upload edited markdown: ${uploadError.message}`)
    }

    // 6. Trigger reprocessing with annotation recovery
    const recovery = await reprocessDocument(documentId, supabase, jobId)

    console.log(`[Obsidian Sync] ✅ Sync complete`)
    console.log(`[Obsidian Sync] Recovery stats:`, {
      success: recovery.annotations.success.length,
      needsReview: recovery.annotations.needsReview.length,
      lost: recovery.annotations.lost.length
    })

    return {
      success: true,
      changed: true,
      recovery: recovery.annotations
    }

  } catch (error) {
    console.error('[Obsidian Sync] ❌ Sync failed:', error)
    return {
      success: false,
      changed: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

// ============================================================================
// OBSIDIAN URI GENERATION
// ============================================================================

/**
 * Generate Obsidian URI for protocol handling
 * Uses obsidian://advanced-uri for reliable vault + file opening
 */
export function getObsidianUri(vaultName: string, filepath: string): string {
  // Encode both vault name and filepath for URL safety
  const encodedVault = encodeURIComponent(vaultName)
  const encodedPath = encodeURIComponent(filepath)

  // Use obsidian://advanced-uri protocol (requires Advanced URI plugin)
  // Fallback to basic open protocol
  return `obsidian://advanced-uri?vault=${encodedVault}&filepath=${encodedPath}`
}

// ============================================================================
// HELPER: EXPORT ANNOTATIONS
// ============================================================================

/**
 * Export annotations alongside markdown
 * Creates a .annotations.json file for portable backup
 */
async function exportAnnotations(documentId: string, vaultFilePath: string): Promise<void> {
  try {
    const supabase = getSupabaseClient()

    // Fetch Position components (annotations)
    const { data: components, error } = await supabase
      .from('components')
      .select(`
        id,
        data,
        created_at,
        recovery_confidence,
        recovery_method,
        entities!inner(id)
      `)
      .eq('component_type', 'Position')
      .eq('data->documentId', documentId)

    if (error) {
      console.warn('[Obsidian Export] Failed to fetch annotations:', error.message)
      return
    }

    if (!components || components.length === 0) {
      console.log('[Obsidian Export] No annotations to export')
      return
    }

    // Transform to portable format (not raw DB structure)
    const portableAnnotations = components.map((c: any) => ({
      text: c.data.originalText,
      note: c.data.note,
      color: c.data.color,
      type: c.data.type,
      position: {
        start: c.data.startOffset,
        end: c.data.endOffset
      },
      pageLabel: c.data.pageLabel,
      created_at: c.created_at,
      recovery: c.recovery_method ? {
        method: c.recovery_method,
        confidence: c.recovery_confidence
      } : undefined
    }))

    // Write to .annotations.json alongside markdown
    const annotationsPath = vaultFilePath.replace(/\.md$/, '.annotations.json')
    await fs.writeFile(
      annotationsPath,
      JSON.stringify(portableAnnotations, null, 2),
      'utf-8'
    )

    console.log(`[Obsidian Export] Exported ${portableAnnotations.length} annotations to ${annotationsPath}`)

  } catch (error) {
    console.error('[Obsidian Export] Failed to export annotations:', error)
    // Don't fail the entire export if annotation export fails
  }
}
