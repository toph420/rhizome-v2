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

interface AnnotationComponent {
  id: string
  entity_id: string
  component_type: string
  data: {
    documentId?: string
    document_id?: string
    startOffset?: number
    endOffset?: number
    originalText?: string
    note?: string
    color?: string
    type?: string
    pageLabel?: string
    textContext?: {
      before: string
      after: string
    }
  }
  chunk_id?: string | null
  chunk_ids?: string[] | null
  created_at: string
  updated_at: string
  recovery_method?: string | null
  recovery_confidence?: number | null
}

interface PortableAnnotation {
  text: string
  note?: string
  color?: string
  type?: string
  position: {
    start: number
    end: number
  }
  pageLabel?: string
  created_at: string
  recovery?: {
    method: string
    confidence: number
  }
}

/**
 * Transform annotation component to portable format
 */
function transformToPortableFormat(annotation: AnnotationComponent): PortableAnnotation {
  const data = annotation.data

  return {
    text: data.originalText || '',
    note: data.note,
    color: data.color,
    type: data.type,
    position: {
      start: data.startOffset || 0,
      end: data.endOffset || 0
    },
    pageLabel: data.pageLabel,
    created_at: annotation.created_at,
    recovery: annotation.recovery_method ? {
      method: annotation.recovery_method,
      confidence: annotation.recovery_confidence || 0
    } : undefined
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
  // First get entity_ids from source components
  const { data: sourceComponents } = await supabase
    .from('components')
    .select('entity_id')
    .eq('component_type', 'source')
    .eq('data->>document_id', documentId)

  const entityIds = sourceComponents?.map(c => c.entity_id) || []

  if (entityIds.length === 0) {
    return 0
  }

  // Then fetch position components by entity_id
  const { data: annotations, error: fetchError } = await supabase
    .from('components')
    .select('*')
    .eq('component_type', 'position')
    .in('entity_id', entityIds)
    .order('created_at', { ascending: true })

  if (fetchError) {
    console.error(`Failed to fetch annotations for document ${documentId}:`, fetchError)
    return 0
  }

  if (!annotations || annotations.length === 0) {
    return 0
  }

  // Transform to portable format
  const portableAnnotations = annotations.map(transformToPortableFormat)

  // Generate annotations file path (robust - handles any .md filename)
  // If markdown is at documents/doc-123/content.md or documents/doc-123/my-book.md
  // Then annotations go to documents/doc-123/.annotations.json
  const annotationsPath = markdownPath.replace(/\/[^/]+\.md$/, '/.annotations.json')

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

  return annotations.length
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
