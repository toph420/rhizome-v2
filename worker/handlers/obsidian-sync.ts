/**
 * Obsidian Integration Handlers
 * Handles bidirectional sync between Rhizome and Obsidian vaults
 */

import { promises as fs } from 'fs'
import * as path from 'path'
import { createHash } from 'crypto'
import { createClient } from '@supabase/supabase-js'
import { reprocessDocument } from './reprocess-document.js'
import type { RecoveryResults } from '../types/recovery.js'
import { createVaultStructure, getDocumentVaultPath, type VaultConfig } from '../../src/lib/vault-structure.js'
import { generateConnectionsMarkdown } from '../lib/connection-graph.js'
import { generateHighlightsMarkdown } from '../lib/highlights-generator.js'
import { generateSparksMarkdown } from '../lib/sparks-generator.js'
import { exportAnnotationsToJson } from '../lib/vault-export-annotations.js'
// NOTE: Sparks are now exported globally, not per-document
// See: exportSparksToVault() in vault-export-sparks.ts
import { exportConnectionsToJson } from '../lib/vault-export-connections.js'

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
  rhizomePath: string  // Relative path in vault (e.g., "Rhizome/")
  autoSync: boolean
  syncAnnotations: boolean
  exportSparks?: boolean  // Export sparks to .sparks.md (default: true)
  exportConnections?: boolean  // Export connection graphs (default: true)
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
 * Export document to Obsidian vault with full structure
 * Enhanced version with Documents/{title}/ folders, .rhizome/ metadata, and connection graphs
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
      .select('title, markdown_path, storage_path')
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

    // Validate required fields
    if (!obsidianSettings.vaultPath || !obsidianSettings.vaultName) {
      throw new Error('Obsidian vault not configured. Please set vaultPath and vaultName in settings.')
    }

    const vaultConfig: VaultConfig = {
      vaultPath: obsidianSettings.vaultPath,
      vaultName: obsidianSettings.vaultName,
      rhizomePath: obsidianSettings.rhizomePath || 'Rhizome/'
    }

    // 2. Ensure vault structure exists
    await createVaultStructure(vaultConfig)

    // 3. Create document folder
    const docFolderPath = getDocumentVaultPath(vaultConfig, document.title)
    await fs.mkdir(docFolderPath, { recursive: true })
    await fs.mkdir(path.join(docFolderPath, '.rhizome'), { recursive: true })

    // 4. Download markdown from storage
    const markdownStoragePath = document.markdown_path || `${document.storage_path}/content.md`

    if (!markdownStoragePath) {
      throw new Error('Cannot determine markdown storage path')
    }

    console.log(`[Obsidian Export] Downloading markdown from: ${markdownStoragePath}`)

    const { data: markdownBlob, error: downloadError } = await supabase.storage
      .from('documents')
      .download(markdownStoragePath)

    if (downloadError || !markdownBlob) {
      throw new Error(`Failed to download markdown: ${downloadError?.message}`)
    }

    const markdown = await markdownBlob.text()

    // 5. Write {title}.md (main content with unique filename)
    const contentPath = path.join(docFolderPath, `${document.title}.md`)
    await fs.writeFile(contentPath, markdown, 'utf-8')
    console.log(`[Obsidian Export] ${document.title}.md written`)

    // 6. Generate and write {title} - Highlights.md
    if (obsidianSettings.syncAnnotations !== false) {
      const highlightsMarkdown = await generateHighlightsMarkdown(
        documentId,
        document.title,
        supabase
      )
      const highlightsPath = path.join(docFolderPath, `${document.title} - Highlights.md`)
      await fs.writeFile(highlightsPath, highlightsMarkdown, 'utf-8')
      console.log(`[Obsidian Export] ${document.title} - Highlights.md written`)
    }

    // 7. Generate and write {title} - Connections.md
    if (obsidianSettings.exportConnections !== false) {
      const connectionsMarkdown = await generateConnectionsMarkdown(
        documentId,
        document.title,
        supabase
      )
      const connectionsPath = path.join(docFolderPath, `${document.title} - Connections.md`)
      await fs.writeFile(connectionsPath, connectionsMarkdown, 'utf-8')
      console.log(`[Obsidian Export] ${document.title} - Connections.md written`)
    }

    // 8. Generate and write {title} - Sparks.md
    if (obsidianSettings.exportSparks !== false) {
      const sparksMarkdown = await generateSparksMarkdown(
        documentId,
        document.title,
        supabase
      )
      const sparksPath = path.join(docFolderPath, `${document.title} - Sparks.md`)
      await fs.writeFile(sparksPath, sparksMarkdown, 'utf-8')
      console.log(`[Obsidian Export] ${document.title} - Sparks.md written`)
    }

    // 9. Copy JSON files from Storage to .rhizome/ and enhance metadata.json
    const jsonFiles = ['chunks.json', 'metadata.json', 'manifest.json']

    for (const filename of jsonFiles) {
      try {
        const storagePath = `${document.storage_path}/${filename}`
        const { data: jsonBlob } = await supabase.storage
          .from('documents')
          .download(storagePath)

        if (jsonBlob) {
          let jsonText = await jsonBlob.text()

          // ENHANCEMENT: Add document fields to metadata.json for vault import
          if (filename === 'metadata.json') {
            try {
              const metadataObj = JSON.parse(jsonText)

              // Fetch full document record to get all fields
              const { data: fullDoc } = await supabase
                .from('documents')
                .select('title, source_type, status, processing_status, created_at, updated_at')
                .eq('id', documentId)
                .single()

              // Enhance metadata with document fields (preserve existing metadata)
              const enhancedMetadata = {
                ...metadataObj,
                // Add document-level fields for vault import
                title: fullDoc?.title || document.title,
                source_type: fullDoc?.source_type || 'paste',
                status: fullDoc?.status || 'completed',
                processing_status: fullDoc?.processing_status || 'completed',
                document_created_at: fullDoc?.created_at,
                document_updated_at: fullDoc?.updated_at,
                // Mark as enhanced for debugging
                _vault_export_enhanced: true,
                _vault_export_timestamp: new Date().toISOString()
              }

              jsonText = JSON.stringify(enhancedMetadata, null, 2)
              console.log(`[Obsidian Export] Enhanced metadata.json with document fields (source_type: ${enhancedMetadata.source_type})`)
            } catch (parseError) {
              console.warn(`[Obsidian Export] Failed to enhance metadata.json:`, parseError)
              // Continue with original jsonText if enhancement fails
            }
          }

          const rhizomePath = path.join(docFolderPath, '.rhizome', filename)
          await fs.writeFile(rhizomePath, jsonText, 'utf-8')
          console.log(`[Obsidian Export] .rhizome/${filename} written`)
        }
      } catch (error) {
        console.warn(`[Obsidian Export] Failed to copy ${filename}:`, error instanceof Error ? error.message : 'Unknown error')
      }
    }

    // 10. Export annotations.json (machine-readable ECS entities)
    if (obsidianSettings.syncAnnotations !== false) {
      const annotationsJson = await exportAnnotationsToJson(documentId, supabase)
      const annotationsJsonPath = path.join(docFolderPath, '.rhizome', 'annotations.json')
      await fs.writeFile(annotationsJsonPath, annotationsJson, 'utf-8')
      console.log(`[Obsidian Export] .rhizome/annotations.json written`)
    }

    // NOTE: Sparks are now exported globally to Rhizome/Sparks/
    // Per-document spark export removed - sparks are user-level entities

    // 12. Export connections.json (machine-readable connection rows)
    if (obsidianSettings.exportConnections !== false) {
      const connectionsJson = await exportConnectionsToJson(documentId, supabase)
      const connectionsJsonPath = path.join(docFolderPath, '.rhizome', 'connections.json')
      await fs.writeFile(connectionsJsonPath, connectionsJson, 'utf-8')
      console.log(`[Obsidian Export] .rhizome/connections.json written`)
    }

    // 13. Create source-ref.json (reference to original file)
    const sourceRef = {
      storagePath: document.storage_path,
      note: 'Original file is in Supabase Storage, not in vault'
    }

    const sourceRefPath = path.join(docFolderPath, '.rhizome', 'source-ref.json')
    await fs.writeFile(sourceRefPath, JSON.stringify(sourceRef, null, 2), 'utf-8')
    console.log(`[Obsidian Export] source-ref.json written`)

    // 14. Calculate and store hash
    const vaultHash = createHash('sha256')
      .update(markdown)
      .digest('hex')
      .substring(0, 16)

    const storageHash = vaultHash // Same at export time

    // Upsert sync state
    await supabase
      .from('obsidian_sync_state')
      .upsert({
        document_id: documentId,
        user_id: userId,
        vault_path: path.relative(vaultConfig.vaultPath, contentPath),
        vault_hash: vaultHash,
        storage_hash: storageHash,
        vault_modified_at: new Date().toISOString(),
        storage_modified_at: new Date().toISOString(),
        last_sync_at: new Date().toISOString(),
        last_sync_direction: 'storage_to_vault',
        conflict_state: 'none'
      }, {
        onConflict: 'document_id'
      })

    // 11. Update document.obsidian_path (for backward compatibility)
    const relativePathToFile = path.relative(vaultConfig.vaultPath, contentPath)
    await supabase
      .from('documents')
      .update({ obsidian_path: relativePathToFile })
      .eq('id', documentId)

    // 12. Generate Obsidian URI
    const uri = getObsidianUri(vaultConfig.vaultName, relativePathToFile)

    console.log(`[Obsidian Export] ✅ Export complete`)

    return {
      success: true,
      path: contentPath,
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
