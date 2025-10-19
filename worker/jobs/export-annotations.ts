/**
 * Annotation Export Cron Job
 *
 * Periodically exports all annotations to portable JSON format in Supabase Storage.
 * Runs hourly to ensure annotations are backed up separately from database.
 *
 * Export format is portable and can be used for:
 * - Backup and recovery
 * - Obsidian integration
 * - Readwise import
 * - External tool integration
 */

import cron from 'node-cron'
import { createClient, SupabaseClient } from '@supabase/supabase-js'

interface AnnotationData {
  text: string
  color?: string
  note?: string
  tags?: string[]
  range?: {
    chunkIds?: string[]
    startOffset?: number
    endOffset?: number
  }
  textContext?: {
    before?: string
    after?: string
    content?: string
  }
}

interface PositionData {
  startOffset: number
  endOffset: number
  method?: string
  confidence?: number
  chunkIds?: string[]
  textContext?: {
    before?: string
    after?: string
  }
  originalChunkIndex?: number
}

interface SourceData {
  document_id: string
  chunk_id?: string
  chunk_ids?: string[]
}

interface ComponentRecord {
  id: string
  entity_id: string
  component_type: string
  data: any
  created_at: string
  updated_at: string
  recovery_method?: string | null
  recovery_confidence?: number | null
  needs_review?: boolean | null
  original_chunk_index?: number | null
}

interface PortableAnnotation {
  // Annotation data
  text: string
  note?: string
  color?: string
  tags?: string[]

  // Position data
  position: {
    start: number
    end: number
    method?: string
    confidence?: number
    originalChunkIndex?: number
  }

  // Context
  textContext?: {
    before?: string
    after?: string
    content?: string
  }

  // Source references
  chunkIds?: string[]

  // Recovery metadata
  recovery?: {
    method: string
    confidence: number
    needsReview: boolean
  }

  // Timestamps
  created_at: string
  updated_at: string
}

/**
 * Transform 5-component ECS structure to portable format
 * Merges Position, Visual, Content, Temporal, and ChunkRef into single portable object
 */
function transformToPortableFormat5Component(
  positionComponent: ComponentRecord,
  visualData: any,
  contentData: any,
  temporalData: any,
  chunkRefData: any
): PortableAnnotation {
  const posData = positionComponent.data

  // Safely access position data with fallbacks
  const startOffset = posData?.startOffset ?? 0
  const endOffset = posData?.endOffset ?? 0

  return {
    // From Position component
    text: posData.originalText,

    // From Content component
    note: contentData.note,
    tags: contentData.tags,

    // From Visual component
    color: visualData.color,

    // Position fields
    position: {
      start: startOffset,
      end: endOffset,
      method: posData?.recoveryMethod,
      confidence: posData?.recoveryConfidence,
      originalChunkIndex: positionComponent.original_chunk_index
    },

    // Context from Position component
    textContext: posData?.textContext,

    // Source references from ChunkRef component
    chunkIds: chunkRefData.chunkIds,

    // Recovery metadata (from Position component)
    recovery: posData.recoveryMethod ? {
      method: posData.recoveryMethod,
      confidence: posData.recoveryConfidence || 0,
      needsReview: posData.needsReview || false
    } : undefined,

    // Timestamps from Temporal component
    created_at: temporalData.createdAt,
    updated_at: temporalData.updatedAt
  }
}

/**
 * Export annotations for a single document
 */
async function exportDocumentAnnotations(
  supabase: SupabaseClient,
  documentId: string,
  markdownPath: string
): Promise<number> {
  // Fetch annotations using entity_id join pattern (same as recover-annotations.ts)
  // First get entity_ids from ChunkRef components
  const { data: sourceEntities } = await supabase
    .from('components')
    .select('entity_id')
    .eq('component_type', 'ChunkRef')
    .eq('data->>document_id', documentId)

  const entityIds = sourceEntities?.map(c => c.entity_id) || []

  if (entityIds.length === 0) {
    return 0
  }

  // Fetch all five component types in parallel
  const [positionResult, visualResult, contentResult, temporalResult, chunkRefResult] = await Promise.all([
    supabase
      .from('components')
      .select('*')
      .eq('component_type', 'Position')
      .in('entity_id', entityIds)
      .order('created_at', { ascending: true }),

    supabase
      .from('components')
      .select('entity_id, data')
      .eq('component_type', 'Visual')
      .in('entity_id', entityIds),

    supabase
      .from('components')
      .select('entity_id, data')
      .eq('component_type', 'Content')
      .in('entity_id', entityIds),

    supabase
      .from('components')
      .select('entity_id, data')
      .eq('component_type', 'Temporal')
      .in('entity_id', entityIds),

    supabase
      .from('components')
      .select('entity_id, data')
      .eq('component_type', 'ChunkRef')
      .in('entity_id', entityIds)
  ])

  if (positionResult.error) {
    console.error(`Failed to fetch Position components: ${positionResult.error.message}`)
    return 0
  }

  if (visualResult.error) {
    console.error(`Failed to fetch Visual components: ${visualResult.error.message}`)
    return 0
  }

  if (contentResult.error) {
    console.error(`Failed to fetch Content components: ${contentResult.error.message}`)
    return 0
  }

  if (temporalResult.error) {
    console.error(`Failed to fetch Temporal components: ${temporalResult.error.message}`)
    return 0
  }

  if (chunkRefResult.error) {
    console.error(`Failed to fetch ChunkRef components: ${chunkRefResult.error.message}`)
    return 0
  }

  const positionComponents = positionResult.data || []
  const visualComponents = visualResult.data || []
  const contentComponents = contentResult.data || []
  const temporalComponents = temporalResult.data || []
  const chunkRefComponents = chunkRefResult.data || []

  if (positionComponents.length === 0) {
    return 0
  }

  // Create lookup maps
  const visualMap = new Map(
    visualComponents.map(c => [c.entity_id, c.data])
  )

  const contentMap = new Map(
    contentComponents.map(c => [c.entity_id, c.data])
  )

  const temporalMap = new Map(
    temporalComponents.map(c => [c.entity_id, c.data])
  )

  const chunkRefMap = new Map(
    chunkRefComponents.map(c => [c.entity_id, c.data])
  )

  // Transform to portable format by merging all five components
  const portableAnnotations = positionComponents
    .map(positionComponent => {
      const visualData = visualMap.get(positionComponent.entity_id)
      const contentData = contentMap.get(positionComponent.entity_id)
      const temporalData = temporalMap.get(positionComponent.entity_id)
      const chunkRefData = chunkRefMap.get(positionComponent.entity_id)

      // Skip if missing required components
      if (!visualData || !contentData || !temporalData || !chunkRefData) {
        console.warn(`Missing components for entity ${positionComponent.entity_id}`)
        return null
      }

      return transformToPortableFormat5Component(
        positionComponent,
        visualData,
        contentData,
        temporalData,
        chunkRefData
      )
    })
    .filter((ann): ann is PortableAnnotation => ann !== null)

  // Generate annotations file path (robust - handles any .md filename)
  // If markdown is at documents/doc-123/content.md or documents/doc-123/my-book.md
  // Then annotations go to documents/doc-123/annotations.json
  const annotationsPath = markdownPath.replace(/\/[^/]+\.md$/, '/annotations.json')

  // Upload to storage
  const { error: uploadError } = await supabase.storage
    .from('documents')
    .upload(annotationsPath, JSON.stringify(portableAnnotations, null, 2), {
      contentType: 'application/json',
      upsert: true // Overwrite existing file
    })

  if (uploadError) {
    console.error(`Failed to upload annotations for document ${documentId}:`, uploadError)
    return 0
  }

  return portableAnnotations.length
}

/**
 * Main export logic - runs on cron schedule
 */
export async function runAnnotationExport(): Promise<void> {
  const startTime = Date.now()
  console.log('[Annotation Export] Starting export job...')

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  try {
    // Fetch all documents with markdown paths
    const { data: documents, error: docsError } = await supabase
      .from('documents')
      .select('id, title, markdown_path')
      .not('markdown_path', 'is', null)

    if (docsError) {
      console.error('[Annotation Export] Failed to fetch documents:', docsError)
      return
    }

    if (!documents || documents.length === 0) {
      console.log('[Annotation Export] No documents to process')
      return
    }

    let totalExported = 0
    let documentsProcessed = 0

    // Export annotations for each document
    for (const doc of documents) {
      const count = await exportDocumentAnnotations(
        supabase,
        doc.id,
        doc.markdown_path
      )

      if (count > 0) {
        totalExported += count
        documentsProcessed++
        console.log(`[Annotation Export] Exported ${count} annotations for "${doc.title}"`)
      }
    }

    const duration = Date.now() - startTime
    console.log(
      `[Annotation Export] Complete! Exported ${totalExported} annotations ` +
      `across ${documentsProcessed} documents in ${duration}ms`
    )
  } catch (error) {
    console.error('[Annotation Export] Export failed:', error)
  }
}

/**
 * Start the annotation export cron job
 * Runs every hour at minute 0
 */
export function startAnnotationExportCron(): void {
  console.log('[Annotation Export] Starting cron job (runs hourly)')

  // Run immediately on startup for testing
  runAnnotationExport().catch(error => {
    console.error('[Annotation Export] Initial export failed:', error)
  })

  // Schedule hourly exports
  cron.schedule('0 * * * *', () => {
    console.log('[Annotation Export] Triggered by cron schedule')
    runAnnotationExport().catch(error => {
      console.error('[Annotation Export] Scheduled export failed:', error)
    })
  })
}
