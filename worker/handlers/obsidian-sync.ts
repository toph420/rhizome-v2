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
  exportSparks?: boolean  // NEW - Export sparks to .sparks.md (default: true)
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
      .select('title, markdown_path, obsidian_path, storage_path')
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

    // Validate required fields are populated
    if (!obsidianSettings.vaultPath || !obsidianSettings.vaultName) {
      throw new Error(
        'Obsidian vault not configured. Please set vaultPath and vaultName in user settings.\n' +
        'Example: UPDATE user_settings SET obsidian_settings = jsonb_set(obsidian_settings, \'{vaultPath}\', \'"/path/to/vault"\')'
      )
    }

    // 2. Download markdown from storage
    // Construct path: use markdown_path if available, otherwise fallback to storage_path/content.md
    const markdownStoragePath = document.markdown_path || `${document.storage_path}/content.md`

    if (!markdownStoragePath) {
      throw new Error('Cannot determine markdown storage path: both markdown_path and storage_path are null')
    }

    console.log(`[Obsidian Export] Downloading markdown from: ${markdownStoragePath}`)

    const { data: markdownBlob, error: downloadError } = await supabase.storage
      .from('documents')
      .download(markdownStoragePath)

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

    // 5a. Export sparks (NEW)
    // Default to true unless explicitly disabled (backward compatible)
    const exportSparksEnabled = (obsidianSettings as any).exportSparks !== false
    if (exportSparksEnabled) {
      await exportSparks(documentId, vaultFilePath)
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
      .select('markdown_path, obsidian_path, processing_status, storage_path')
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

    // Validate required fields are populated
    if (!obsidianSettings.vaultPath || !obsidianSettings.vaultName) {
      throw new Error(
        'Obsidian vault not configured. Please set vaultPath and vaultName in user settings.'
      )
    }

    const vaultFilePath = path.join(obsidianSettings.vaultPath, document.obsidian_path)

    // 2. Read edited markdown from vault
    const editedMarkdown = await fs.readFile(vaultFilePath, 'utf-8')

    // 3. Get current storage version for comparison
    // Construct path: use markdown_path if available, otherwise fallback to storage_path/content.md
    const markdownStoragePath = document.markdown_path || `${document.storage_path}/content.md`

    if (!markdownStoragePath) {
      throw new Error('Cannot determine markdown storage path: both markdown_path and storage_path are null')
    }

    console.log(`[Obsidian Sync] Downloading current markdown from: ${markdownStoragePath}`)

    const { data: currentBlob, error: downloadError } = await supabase.storage
      .from('documents')
      .download(markdownStoragePath)

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

    console.log(`[Obsidian Sync] Changes detected`)

    // 5. Upload edited markdown to storage
    console.log(`[Obsidian Sync] Uploading edited markdown to: ${markdownStoragePath}`)

    const { error: uploadError } = await supabase.storage
      .from('documents')
      .update(markdownStoragePath, new Blob([editedMarkdown], { type: 'text/markdown' }), {
        contentType: 'text/markdown',
        upsert: true
      })

    if (uploadError) {
      throw new Error(`Failed to upload edited markdown: ${uploadError.message}`)
    }

    // NEW: Check if document is in pre-chunking review state
    if (document.processing_status === 'awaiting_manual_review') {
      console.log('[Obsidian Sync] Pre-chunking review mode - simple sync (no annotation recovery needed)')

      return {
        success: true,
        changed: true
        // recovery is undefined - no recovery needed since annotations don't exist yet!
      }
    }

    // 6. Full reprocessing with annotation recovery (post-chunking edits)
    console.log('[Obsidian Sync] Post-chunking edit detected - triggering full reprocessing')
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
 * Creates an annotations.json file for portable backup
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
      .eq('data->>documentId', documentId)

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

    // Write to annotations.json alongside markdown
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

/**
 * Export sparks to Obsidian vault
 * Creates: document-name.sparks.md with YAML frontmatter + markdown
 *
 * Pattern: Similar to annotation export
 */
async function exportSparks(documentId: string, vaultFilePath: string): Promise<void> {
  try {
    const supabase = getSupabaseClient()

    // Get all spark entity IDs for this document
    const { data: chunkRefComponents } = await supabase
      .from('components')
      .select('entity_id, data')
      .eq('component_type', 'ChunkRef')
      .eq('data->>documentId', documentId)

    if (!chunkRefComponents || chunkRefComponents.length === 0) {
      console.log(`[Obsidian] No sparks to export for ${documentId}`)
      return // No .sparks.md file needed
    }

    const entityIds = chunkRefComponents.map(c => c.entity_id)

    // Get all components for these entities
    const { data: allComponents } = await supabase
      .from('components')
      .select('entity_id, component_type, data, created_at, updated_at')
      .in('entity_id', entityIds)

    if (!allComponents) {
      console.log(`[Obsidian] No components found for sparks`)
      return
    }

    // Group components by entity_id
    const entityMap = new Map<string, any[]>()
    for (const comp of allComponents) {
      if (!entityMap.has(comp.entity_id)) {
        entityMap.set(comp.entity_id, [])
      }
      entityMap.get(comp.entity_id)!.push(comp)
    }

    // Filter to only complete spark entities (have Spark component)
    const sparkEntities = Array.from(entityMap.entries())
      .filter(([_, comps]) => comps.some(c => c.component_type === 'Spark'))
      .map(([entityId, comps]) => {
        const spark = comps.find(c => c.component_type === 'Spark')
        const content = comps.find(c => c.component_type === 'Content')
        const temporal = comps.find(c => c.component_type === 'Temporal')
        const chunkRef = comps.find(c => c.component_type === 'ChunkRef')

        return {
          id: entityId,
          content: content?.data.note || '',
          tags: content?.data.tags || [],
          selections: spark?.data.selections || [],
          connections: spark?.data.connections || [],
          chunkId: chunkRef?.data.chunkId,
          documentId: chunkRef?.data.documentId,
          createdAt: temporal?.data.createdAt,
          updatedAt: temporal?.data.updatedAt,
          orphaned: spark?.data.orphaned || false,
          needsReview: spark?.data.needsReview || false
        }
      })
      .sort((a, b) => {
        const aTime = new Date(a.createdAt).getTime()
        const bTime = new Date(b.createdAt).getTime()
        return aTime - bTime // Ascending (oldest first)
      })

    if (sparkEntities.length === 0) {
      console.log(`[Obsidian] No complete spark entities to export`)
      return
    }

    // Build markdown content with YAML frontmatter for each spark
    const sparksMarkdown = sparkEntities.map(spark => {
      const frontmatter = {
        id: spark.id,
        created: spark.createdAt,
        updated: spark.updatedAt,
        tags: spark.tags,
        chunk: spark.chunkId,
        document: spark.documentId,
        selections: spark.selections.length,
        connections: spark.connections.length,
        orphaned: spark.orphaned || undefined,
        needsReview: spark.needsReview || undefined
      }

      let markdown = '---\n'
      for (const [key, value] of Object.entries(frontmatter)) {
        if (value !== undefined) {
          if (Array.isArray(value)) {
            markdown += `${key}: [${value.map(v => typeof v === 'string' ? `"${v}"` : v).join(', ')}]\n`
          } else {
            markdown += `${key}: ${typeof value === 'string' ? `"${value}"` : value}\n`
          }
        }
      }
      markdown += '---\n\n'

      // Add selections if any
      if (spark.selections.length > 0) {
        markdown += '## Selections\n\n'
        for (const sel of spark.selections) {
          markdown += `> "${sel.text}"\n`
          markdown += `> — Chunk: ${sel.chunkId}\n\n`
        }
      }

      // Add spark content
      markdown += '## Thought\n\n'
      markdown += spark.content + '\n\n'

      // Add connections summary
      if (spark.connections.length > 0) {
        markdown += '## Connections\n\n'
        markdown += `- ${spark.connections.length} connections to related chunks\n`

        const byType = spark.connections.reduce((acc: Record<string, number>, conn: any) => {
          acc[conn.type] = (acc[conn.type] || 0) + 1
          return acc
        }, {} as Record<string, number>)

        for (const [type, count] of Object.entries(byType)) {
          markdown += `  - ${count} ${type}\n`
        }
      }

      return markdown
    }).join('\n---\n\n')

    // Write to .sparks.md file
    const sparksPath = vaultFilePath.replace(/\.md$/, '.sparks.md')

    await fs.writeFile(sparksPath, sparksMarkdown, 'utf-8')
    console.log(`[Obsidian] ✓ Exported ${sparkEntities.length} sparks to ${sparksPath}`)

  } catch (error) {
    console.error(`[Obsidian] Failed to write sparks file:`, error)
    // Don't fail the entire export if spark export fails
  }
}
