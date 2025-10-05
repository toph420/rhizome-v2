/**
 * Readwise Import Handler
 *
 * Imports highlights from Readwise export JSON format.
 * Uses fuzzy matching to locate highlights in processed documents.
 *
 * Import flow:
 * 1. Try exact text match first
 * 2. If exact fails, use chunk-bounded fuzzy matching
 * 3. High-confidence matches (>0.8) → needs review
 * 4. Low-confidence matches (<0.8) → failed import
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { findAnnotationMatch } from '../lib/fuzzy-matching.js'
import type { FuzzyMatchResult } from '../types/recovery.js'

// ============================================
// READWISE TYPES
// ============================================

export interface ReadwiseHighlight {
  text: string
  note?: string
  color?: 'yellow' | 'blue' | 'red' | 'green' | 'orange'
  location?: number // Page number or location index
  highlighted_at: string
  book_id?: string
  title?: string
  author?: string
}

export interface ImportResults {
  imported: number
  needsReview: ReviewItem[]
  failed: FailedItem[]
}

interface ReviewItem {
  highlight: ReadwiseHighlight
  suggestedMatch: FuzzyMatchResult
  confidence: number
}

interface FailedItem {
  highlight: ReadwiseHighlight
  reason: string
}

interface Chunk {
  id: string
  chunk_index: number
  start_offset: number
  end_offset: number
  content: string
}

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Map Readwise color to our color system
 */
function mapReadwiseColor(
  readwiseColor?: string
): 'yellow' | 'blue' | 'red' | 'green' | 'orange' {
  const colorMap: Record<string, 'yellow' | 'blue' | 'red' | 'green' | 'orange'> = {
    yellow: 'yellow',
    blue: 'blue',
    red: 'red',
    green: 'green',
    orange: 'orange'
  }

  return colorMap[readwiseColor || 'yellow'] || 'yellow'
}

/**
 * Estimate chunk index from location percentage
 */
function estimateChunkIndex(location: number | undefined, totalChunks: number): number {
  if (!location) return 0

  // Location is often a page number (1-500) or percentage (0-100)
  // Normalize to 0-1 range, then multiply by chunk count
  const normalized = location > 100 ? location / 1000 : location / 100
  const estimatedIndex = Math.floor(normalized * totalChunks)

  return Math.max(0, Math.min(estimatedIndex, totalChunks - 1))
}

/**
 * Create annotation entity via ECS
 * CRITICAL: Not a stub - implements full ECS creation
 */
async function createAnnotationFromMatch(
  supabase: SupabaseClient,
  documentId: string,
  highlight: ReadwiseHighlight,
  match: { startOffset: number; endOffset: number; text: string },
  chunks: Chunk[]
): Promise<string> {
  // Find which chunk contains this annotation
  const containingChunk = chunks.find(
    c => c.start_offset <= match.startOffset && c.end_offset >= match.endOffset
  )

  if (!containingChunk) {
    throw new Error('No chunk found for annotation position')
  }

  const chunkPosition = match.startOffset - containingChunk.start_offset

  // Create entity with all 5 components
  // NOTE: This uses raw Supabase, not the frontend AnnotationOperations class
  // because we're in the worker module (no access to frontend code)
  const { data: entity, error: entityError } = await supabase
    .from('entities')
    .insert({ user_id: 'dev-user-123' }) // Dev user for MVP
    .select()
    .single()

  if (entityError) {
    throw new Error(`Failed to create entity: ${entityError.message}`)
  }

  const now = new Date().toISOString()
  const color = mapReadwiseColor(highlight.color)

  // Create all 5 components
  const components = [
    {
      entity_id: entity.id,
      component_type: 'Position',
      data: {
        documentId,
        document_id: documentId,
        startOffset: match.startOffset,
        endOffset: match.endOffset,
        originalText: match.text,
        pageLabel: highlight.location?.toString()
      },
      document_id: documentId
    },
    {
      entity_id: entity.id,
      component_type: 'Visual',
      data: {
        type: 'highlight',
        color
      }
    },
    {
      entity_id: entity.id,
      component_type: 'Content',
      data: {
        note: highlight.note || '',
        tags: ['readwise-import']
      }
    },
    {
      entity_id: entity.id,
      component_type: 'Temporal',
      data: {
        createdAt: highlight.highlighted_at || now,
        updatedAt: now,
        lastViewedAt: now
      }
    },
    {
      entity_id: entity.id,
      component_type: 'ChunkRef',
      data: {
        chunkId: containingChunk.id,
        chunk_id: containingChunk.id,
        chunkPosition
      },
      chunk_id: containingChunk.id
    }
  ]

  const { error: componentError } = await supabase
    .from('components')
    .insert(components)

  if (componentError) {
    // Rollback - delete entity
    await supabase.from('entities').delete().eq('id', entity.id)
    throw new Error(`Failed to create components: ${componentError.message}`)
  }

  return entity.id
}

// ============================================
// MAIN IMPORT LOGIC
// ============================================

/**
 * Import Readwise highlights for a document
 *
 * @param documentId - Target document ID
 * @param readwiseJson - Array of Readwise highlights
 * @returns Import statistics
 */
export async function importReadwiseHighlights(
  documentId: string,
  readwiseJson: ReadwiseHighlight[]
): Promise<ImportResults> {
  console.log(`[Readwise Import] Starting import for document ${documentId}`)
  console.log(`[Readwise Import] Processing ${readwiseJson.length} highlights`)

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const results: ImportResults = {
    imported: 0,
    needsReview: [],
    failed: []
  }

  try {
    // Fetch markdown and chunks for document
    const { data: document, error: docError } = await supabase
      .from('documents')
      .select('markdown_path')
      .eq('id', documentId)
      .single()

    if (docError || !document?.markdown_path) {
      throw new Error('Document not found or markdown not available')
    }

    // Download markdown from storage
    const { data: blob, error: storageError } = await supabase.storage
      .from('documents')
      .download(document.markdown_path)

    if (storageError) {
      throw new Error(`Failed to download markdown: ${storageError.message}`)
    }

    const markdown = await blob.text()

    // Fetch chunks
    const { data: chunks, error: chunksError } = await supabase
      .from('chunks')
      .select('id, chunk_index, start_offset, end_offset, content')
      .eq('document_id', documentId)
      .order('chunk_index', { ascending: true })

    if (chunksError || !chunks) {
      throw new Error('Failed to fetch chunks')
    }

    // Process each highlight
    for (const highlight of readwiseJson) {
      try {
        const text = highlight.text.trim()

        // Try exact match first
        const exactIndex = markdown.indexOf(text)

        if (exactIndex !== -1) {
          // Found exact match - create annotation immediately
          await createAnnotationFromMatch(
            supabase,
            documentId,
            highlight,
            {
              startOffset: exactIndex,
              endOffset: exactIndex + text.length,
              text
            },
            chunks
          )

          results.imported++
          console.log(`[Readwise Import] ✓ Exact match: "${text.slice(0, 50)}..."`)
          continue
        }

        // No exact match - try fuzzy matching with estimated chunk
        const estimatedChunkIndex = estimateChunkIndex(highlight.location, chunks.length)

        const fuzzyMatch = findAnnotationMatch(
          { text, originalChunkIndex: estimatedChunkIndex },
          markdown,
          chunks
        )

        if (fuzzyMatch && fuzzyMatch.confidence > 0.8) {
          // High confidence fuzzy match - add to review queue
          results.needsReview.push({
            highlight,
            suggestedMatch: fuzzyMatch,
            confidence: fuzzyMatch.confidence
          })

          console.log(
            `[Readwise Import] ? Fuzzy match (${(fuzzyMatch.confidence * 100).toFixed(0)}%): ` +
            `"${text.slice(0, 50)}..."`
          )
        } else {
          // Low confidence or no match - mark as failed
          results.failed.push({
            highlight,
            reason: fuzzyMatch
              ? `Low confidence (${(fuzzyMatch.confidence * 100).toFixed(0)}%)`
              : 'No match found'
          })

          console.log(`[Readwise Import] ✗ Failed: "${text.slice(0, 50)}..."`)
        }
      } catch (error) {
        results.failed.push({
          highlight,
          reason: error instanceof Error ? error.message : 'Unknown error'
        })

        console.error(`[Readwise Import] Error processing highlight:`, error)
      }
    }

    console.log('[Readwise Import] Complete!')
    console.log(`  Imported: ${results.imported}`)
    console.log(`  Needs Review: ${results.needsReview.length}`)
    console.log(`  Failed: ${results.failed.length}`)

    return results
  } catch (error) {
    console.error('[Readwise Import] Import failed:', error)
    throw error
  }
}

/**
 * Accept a fuzzy match from review queue and create annotation
 */
export async function acceptFuzzyMatch(
  documentId: string,
  reviewItem: ReviewItem
): Promise<string> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Fetch chunks
  const { data: chunks } = await supabase
    .from('chunks')
    .select('id, chunk_index, start_offset, end_offset, content')
    .eq('document_id', documentId)
    .order('chunk_index', { ascending: true })

  if (!chunks) {
    throw new Error('Failed to fetch chunks')
  }

  return await createAnnotationFromMatch(
    supabase,
    documentId,
    reviewItem.highlight,
    reviewItem.suggestedMatch,
    chunks
  )
}
