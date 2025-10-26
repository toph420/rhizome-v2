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
import { findAnnotationMatch } from '../../src/lib/fuzzy-matching.js'
import type { FuzzyMatchResult } from '../types/recovery.js'
import { ReadwiseExportClient, type ReadwiseBook, type ReadwiseHighlight as ExportHighlight } from '../lib/readwise-export-api.js'

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
 * Save fuzzy match to import_pending table for manual review
 */
async function savePendingImport(
  supabase: SupabaseClient,
  documentId: string,
  userId: string,
  source: 'readwise_reader' | 'readwise_export',
  highlight: ReadwiseHighlight,
  suggestedMatch: FuzzyMatchResult
): Promise<void> {
  const { error } = await supabase
    .from('import_pending')
    .insert({
      user_id: userId,
      document_id: documentId,
      source,
      highlight_data: {
        text: highlight.text,
        note: highlight.note,
        color: highlight.color,
        location: highlight.location,
        highlighted_at: highlight.highlighted_at,
        book_id: highlight.book_id,
        title: highlight.title,
        author: highlight.author
      },
      suggested_match: {
        text: suggestedMatch.text,
        startOffset: suggestedMatch.startOffset,
        endOffset: suggestedMatch.endOffset,
        confidence: suggestedMatch.confidence,
        method: suggestedMatch.method
      },
      confidence: suggestedMatch.confidence,
      status: 'pending'
    })

  if (error) {
    console.error('[savePendingImport] Failed:', error)
    throw error
  }
}

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
  // Find which chunk contains this annotation (may be null for gap regions)
  const containingChunk = chunks.find(
    c => c.start_offset <= match.startOffset && c.end_offset >= match.endOffset
  )

  // Log warning for gap regions but continue (annotations work without chunks now)
  if (!containingChunk) {
    console.warn(
      `[Readwise Import] No chunk coverage for position ${match.startOffset}-${match.endOffset}. ` +
      `Creating annotation in gap region.`
    )
  }

  // Get document owner - CRITICAL for frontend display
  const { data: doc, error: docError } = await supabase
    .from('documents')
    .select('user_id')
    .eq('id', documentId)
    .single()

  if (docError || !doc?.user_id) {
    throw new Error(`Document owner not found: ${docError?.message || 'missing user_id'}`)
  }

  // Create entity with actual document owner (not hardcoded dev user)
  // NOTE: This uses raw Supabase, not the frontend AnnotationOperations class
  // because we're in the worker module (no access to frontend code)
  const { data: entity, error: entityError } = await supabase
    .from('entities')
    .insert({ user_id: doc.user_id }) // Use actual document owner
    .select()
    .single()

  if (entityError) {
    throw new Error(`Failed to create entity: ${entityError.message}`)
  }

  const color = mapReadwiseColor(highlight.color)

  // Create 3 components matching frontend expectations
  // Frontend expects: annotation, position, source (lowercase)
  // Handle gap regions where containingChunk is null
  const chunkIds = containingChunk ? [containingChunk.id] : []
  const chunkId = containingChunk?.id || null
  const chunkIndex = containingChunk?.chunk_index ?? -1

  const components = [
    {
      entity_id: entity.id,
      component_type: 'annotation',
      data: {
        text: match.text,
        note: highlight.note,
        tags: ['readwise-import'],
        color,
        range: {
          startOffset: match.startOffset,
          endOffset: match.endOffset,
          chunkIds
        },
        textContext: {
          before: '',  // TODO: Extract context if needed
          content: match.text,
          after: ''
        }
      }
    },
    {
      entity_id: entity.id,
      component_type: 'position',
      data: {
        chunkIds,
        startOffset: match.startOffset,
        endOffset: match.endOffset,
        confidence: 1.0,
        method: 'exact',
        textContext: {
          before: '',
          after: ''
        },
        originalChunkIndex: chunkIndex >= 0 ? chunkIndex : undefined
      },
      document_id: documentId
    },
    {
      entity_id: entity.id,
      component_type: 'source',
      data: {
        chunk_id: chunkId,
        chunk_ids: chunkIds,
        document_id: documentId
      },
      chunk_id: chunkId,
      document_id: documentId
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
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!,
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
          {
            id: `readwise-temp-${highlight.highlighted_at || Date.now()}`,
            text,
            startOffset: 0,  // Placeholder - fuzzy match will find correct position
            endOffset: text.length,
            originalChunkIndex: estimatedChunkIndex
          },
          markdown,
          chunks
        )

        if (fuzzyMatch && fuzzyMatch.confidence > 0.7) {
          // Medium-high confidence fuzzy match - add to review queue
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
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!,
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

// ============================================
// READWISE READER API INTEGRATION
// ============================================

/**
 * Import highlights from Readwise Reader API for a specific document
 *
 * @param rhizomeDocumentId - Target document ID in Rhizome
 * @param readwiseDocumentId - Source document ID in Readwise Reader
 * @param readwiseToken - Readwise API token
 * @returns Import statistics
 */
export async function importFromReadwiseReader(
  rhizomeDocumentId: string,
  readwiseDocumentId: string,
  readwiseToken: string
): Promise<ImportResults> {
  console.log(`[Readwise Reader Import] Fetching highlights for Reader doc ${readwiseDocumentId}`)

  const reader = new ReadwiseReaderClient(readwiseToken)
  const supabase = createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const results: ImportResults = {
    imported: 0,
    needsReview: [],
    failed: []
  }

  try {
    // Fetch document with highlights from Reader API
    const readerDoc = await reader.getDocument(readwiseDocumentId)

    if (!readerDoc.highlights || readerDoc.highlights.length === 0) {
      console.log('[Readwise Reader Import] No highlights found')
      return results
    }

    console.log(`[Readwise Reader Import] Processing ${readerDoc.highlights.length} highlights`)

    // Fetch Rhizome document markdown and chunks
    const { data: document, error: docError } = await supabase
      .from('documents')
      .select('storage_path, metadata')
      .eq('id', rhizomeDocumentId)
      .single()

    if (docError || !document?.storage_path) {
      throw new Error('Rhizome document not found or markdown not available')
    }

    // Get document metadata for better location estimation
    const totalPages = document?.metadata?.total_pages || null

    const markdownPath = `${document.storage_path}/content.md`
    const { data: blob, error: storageError } = await supabase.storage
      .from('documents')
      .download(markdownPath)

    if (storageError) {
      throw new Error(`Failed to download markdown: ${storageError.message}`)
    }

    const markdown = await blob.text()

    // Fetch chunks
    const { data: chunks, error: chunksError } = await supabase
      .from('chunks')
      .select('id, chunk_index, start_offset, end_offset, content')
      .eq('document_id', rhizomeDocumentId)
      .order('chunk_index', { ascending: true })

    if (chunksError || !chunks) {
      throw new Error('Failed to fetch chunks')
    }

    // Process each highlight
    for (const highlight of readerDoc.highlights) {
      try {
        const text = highlight.text.trim()

        // Try exact match first
        const exactIndex = markdown.indexOf(text)

        if (exactIndex !== -1) {
          // Convert Reader highlight to our ReadwiseHighlight format
          const readwiseHighlight: ReadwiseHighlight = {
            text: highlight.text,
            note: highlight.note,
            color: highlight.color,
            location: highlight.location?.value,
            highlighted_at: highlight.highlighted_at
          }

          await createAnnotationFromMatch(
            supabase,
            rhizomeDocumentId,
            readwiseHighlight,
            {
              startOffset: exactIndex,
              endOffset: exactIndex + text.length,
              text
            },
            chunks
          )

          results.imported++
          console.log(`[Readwise Reader Import] ✓ Exact match: "${text.slice(0, 50)}..."`)
          continue
        }

        // No exact match - try fuzzy matching with improved location estimation
        let estimatedChunkIndex: number
        if (highlight.location?.type === 'page') {
          // Use actual page count for better estimation
          estimatedChunkIndex = estimateChunkFromLocation(
            highlight.location.value,
            'page',
            chunks.length,
            totalPages
          )
        } else {
          // Fallback: estimate from highlight position in list
          estimatedChunkIndex = Math.floor(
            (readerDoc.highlights.indexOf(highlight) / readerDoc.highlights.length) * chunks.length
          )
        }

        const fuzzyMatch = findAnnotationMatch(
          {
            id: highlight.id,
            text,
            startOffset: 0,
            endOffset: text.length,
            originalChunkIndex: estimatedChunkIndex
          },
          markdown,
          chunks
        )

        if (fuzzyMatch && fuzzyMatch.confidence > 0.7) {
          // Convert Reader highlight to our ReadwiseHighlight format
          const readwiseHighlight: ReadwiseHighlight = {
            text: highlight.text,
            note: highlight.note,
            color: highlight.color,
            location: highlight.location?.value,
            highlighted_at: highlight.highlighted_at
          }

          results.needsReview.push({
            highlight: readwiseHighlight,
            suggestedMatch: fuzzyMatch,
            confidence: fuzzyMatch.confidence
          })

          console.log(
            `[Readwise Reader Import] ? Fuzzy match (${(fuzzyMatch.confidence * 100).toFixed(0)}%): "${text.slice(0, 50)}..."`
          )
        } else {
          const readwiseHighlight: ReadwiseHighlight = {
            text: highlight.text,
            note: highlight.note,
            color: highlight.color,
            location: highlight.location?.value,
            highlighted_at: highlight.highlighted_at
          }

          results.failed.push({
            highlight: readwiseHighlight,
            reason: fuzzyMatch
              ? `Low confidence (${(fuzzyMatch.confidence * 100).toFixed(0)}%)`
              : 'No match found'
          })

          console.log(`[Readwise Reader Import] ✗ Failed: "${text.slice(0, 50)}..."`)
        }
      } catch (error) {
        const readwiseHighlight: ReadwiseHighlight = {
          text: highlight.text,
          note: highlight.note,
          color: highlight.color,
          location: highlight.location?.value,
          highlighted_at: highlight.highlighted_at
        }

        results.failed.push({
          highlight: readwiseHighlight,
          reason: error instanceof Error ? error.message : 'Unknown error'
        })

        console.error(`[Readwise Reader Import] Error processing highlight:`, error)
      }
    }

    console.log('[Readwise Reader Import] Complete!')
    console.log(`  Imported: ${results.imported}`)
    console.log(`  Needs Review: ${results.needsReview.length}`)
    console.log(`  Failed: ${results.failed.length}`)

    const total = results.imported + results.needsReview.length + results.failed.length
    if (total > 0) {
      const successRate = (results.imported / total * 100).toFixed(1)
      console.log(`  Success Rate: ${successRate}%`)
    }

    return results
  } catch (error) {
    console.error('[Readwise Reader Import] Import failed:', error)
    throw error
  }
}

// ============================================
// READWISE EXPORT API INTEGRATION
// ============================================

/**
 * Import highlights from Readwise Export API
 *
 * Simpler approach: book object from export API already contains all highlights
 *
 * @param rhizomeDocumentId - Target document ID in Rhizome
 * @param readwiseBook - Book object from Readwise export API
 * @returns Import statistics
 */
export async function importFromReadwiseExport(
  rhizomeDocumentId: string,
  readwiseBook: ReadwiseBook
): Promise<ImportResults> {
  console.log(`[Readwise Export Import] Importing "${readwiseBook.title}" by ${readwiseBook.author}`)
  console.log(`[Readwise Export Import] Processing ${readwiseBook.highlights.length} highlights`)

  const supabase = createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const results: ImportResults = {
    imported: 0,
    needsReview: [],
    failed: []
  }

  try {
    // Fetch Rhizome document markdown, metadata, and owner
    const { data: document, error: docError } = await supabase
      .from('documents')
      .select('storage_path, metadata, user_id')
      .eq('id', rhizomeDocumentId)
      .single()

    if (docError || !document?.storage_path) {
      throw new Error('Rhizome document not found or markdown not available')
    }

    const userId = document.user_id
    if (!userId) {
      throw new Error('Document owner not found')
    }

    const totalPages = document?.metadata?.total_pages || null

    const markdownPath = `${document.storage_path}/content.md`
    const { data: blob, error: storageError } = await supabase.storage
      .from('documents')
      .download(markdownPath)

    if (storageError) {
      throw new Error(`Failed to download markdown: ${storageError.message}`)
    }

    const markdown = await blob.text()

    // Fetch chunks
    const { data: chunks, error: chunksError } = await supabase
      .from('chunks')
      .select('id, chunk_index, start_offset, end_offset, content')
      .eq('document_id', rhizomeDocumentId)
      .order('chunk_index', { ascending: true })

    if (chunksError || !chunks) {
      throw new Error('Failed to fetch chunks')
    }

    // Filter out image highlights (can't match markdown text)
    const textHighlights = readwiseBook.highlights.filter(h => {
      // Skip image URLs
      if (h.text.startsWith('![](') || h.text.includes('readwise-assets')) {
        console.log(`[Readwise Export Import] ⊘ Skipping image: "${h.text.slice(0, 50)}..."`)
        return false
      }
      // Skip very short highlights (likely artifacts)
      if (h.text.trim().length < 10) {
        console.log(`[Readwise Export Import] ⊘ Skipping short text: "${h.text}"`)
        return false
      }
      return true
    })

    console.log(`[Readwise Export Import] Filtered ${readwiseBook.highlights.length - textHighlights.length} non-text highlights`)
    console.log(`[Readwise Export Import] Processing ${textHighlights.length} text highlights\n`)

    // Process each highlight
    for (const highlight of textHighlights) {
      try {
        const text = highlight.text.trim()

        // Try exact match first
        const exactIndex = markdown.indexOf(text)

        if (exactIndex !== -1) {
          // Convert export highlight to our ReadwiseHighlight format
          const readwiseHighlight: ReadwiseHighlight = {
            text: highlight.text,
            note: highlight.note || undefined,
            color: mapExportColor(highlight.color),
            location: highlight.location,
            highlighted_at: highlight.highlighted_at,
            book_id: readwiseBook.user_book_id.toString(),
            title: readwiseBook.title,
            author: readwiseBook.author
          }

          await createAnnotationFromMatch(
            supabase,
            rhizomeDocumentId,
            readwiseHighlight,
            {
              startOffset: exactIndex,
              endOffset: exactIndex + text.length,
              text
            },
            chunks
          )

          results.imported++
          console.log(`[Readwise Export Import] ✓ Exact match: "${text.slice(0, 50)}..."`)
          continue
        }

        // No exact match - try fuzzy matching
        const estimatedChunkIndex = estimateChunkFromLocation(
          highlight.location,
          highlight.location_type,
          chunks.length,
          totalPages
        )

        const fuzzyMatch = findAnnotationMatch(
          {
            id: highlight.id.toString(),
            text,
            startOffset: 0,
            endOffset: text.length,
            originalChunkIndex: estimatedChunkIndex
          },
          markdown,
          chunks
        )

        if (fuzzyMatch && fuzzyMatch.confidence > 0.7) {
          const readwiseHighlight: ReadwiseHighlight = {
            text: highlight.text,
            note: highlight.note || undefined,
            color: mapExportColor(highlight.color),
            location: highlight.location,
            highlighted_at: highlight.highlighted_at,
            book_id: readwiseBook.user_book_id.toString(),
            title: readwiseBook.title,
            author: readwiseBook.author
          }

          // Save to import_pending table for manual review
          await savePendingImport(
            supabase,
            rhizomeDocumentId,
            userId,
            'readwise_export',
            readwiseHighlight,
            fuzzyMatch
          )

          results.needsReview.push({
            highlight: readwiseHighlight,
            suggestedMatch: fuzzyMatch,
            confidence: fuzzyMatch.confidence
          })

          console.log(
            `[Readwise Export Import] ? Fuzzy match (${(fuzzyMatch.confidence * 100).toFixed(0)}%): "${text.slice(0, 50)}..."`
          )
        } else {
          const readwiseHighlight: ReadwiseHighlight = {
            text: highlight.text,
            note: highlight.note || undefined,
            color: mapExportColor(highlight.color),
            location: highlight.location,
            highlighted_at: highlight.highlighted_at,
            book_id: readwiseBook.user_book_id.toString(),
            title: readwiseBook.title,
            author: readwiseBook.author
          }

          results.failed.push({
            highlight: readwiseHighlight,
            reason: fuzzyMatch
              ? `Low confidence (${(fuzzyMatch.confidence * 100).toFixed(0)}%)`
              : 'No match found'
          })

          console.log(`[Readwise Export Import] ✗ Failed: "${text.slice(0, 50)}..."`)
        }
      } catch (error) {
        const readwiseHighlight: ReadwiseHighlight = {
          text: highlight.text,
          note: highlight.note || undefined,
          color: mapExportColor(highlight.color),
          location: highlight.location,
          highlighted_at: highlight.highlighted_at,
          book_id: readwiseBook.user_book_id.toString(),
          title: readwiseBook.title,
          author: readwiseBook.author
        }

        results.failed.push({
          highlight: readwiseHighlight,
          reason: error instanceof Error ? error.message : 'Unknown error'
        })

        console.error(`[Readwise Export Import] Error processing highlight:`, error)
      }
    }

    console.log('[Readwise Export Import] Complete!')
    console.log(`  Imported: ${results.imported}`)
    console.log(`  Needs Review: ${results.needsReview.length}`)
    console.log(`  Failed: ${results.failed.length}`)

    const total = results.imported + results.needsReview.length + results.failed.length
    if (total > 0) {
      const successRate = (results.imported / total * 100).toFixed(1)
      console.log(`  Success Rate: ${successRate}%`)
    }

    return results
  } catch (error) {
    console.error('[Readwise Export Import] Import failed:', error)
    throw error
  }
}

/**
 * Map export API color to our color system
 */
function mapExportColor(
  color: string | null
): 'yellow' | 'blue' | 'red' | 'green' | 'orange' {
  if (!color) return 'yellow'

  const colorMap: Record<string, 'yellow' | 'blue' | 'red' | 'green' | 'orange'> = {
    yellow: 'yellow',
    blue: 'blue',
    red: 'red',
    orange: 'orange',
    purple: 'blue',  // Map purple to blue
    green: 'green'
  }

  return colorMap[color] || 'yellow'
}

/**
 * Estimate chunk index from location data
 * Uses document metadata (total_pages) when available for accurate estimation
 */
function estimateChunkFromLocation(
  location: number,
  locationType: 'page' | 'location' | 'time' | 'order',
  totalChunks: number,
  totalPages: number | null = null
): number {
  switch (locationType) {
    case 'page':
      // Use actual document page count if available
      if (totalPages && totalPages > 0) {
        const chunksPerPage = totalChunks / totalPages
        const estimatedChunk = Math.floor(location * chunksPerPage)
        console.log(`[Location Estimate] Page ${location}/${totalPages} → Chunk ${estimatedChunk}/${totalChunks} (${chunksPerPage.toFixed(2)} chunks/page)`)
        return Math.min(estimatedChunk, totalChunks - 1)
      }
      // Fallback: Assume ~0.75 chunks per page (500 pages → 375 chunks)
      return Math.min(Math.floor(location * 0.75), totalChunks - 1)

    case 'order':
      // Order is 0-based index - use directly as chunk estimate
      return Math.min(location, totalChunks - 1)

    case 'location':
      // Kindle location - normalize to chunk range
      // Typical book: 5000 locations → 375 chunks ≈ 0.075 chunks per location
      const estimatedFromLocation = Math.floor(location * 0.075)
      return Math.min(estimatedFromLocation, totalChunks - 1)

    default:
      // Fallback: use order as percentage
      return Math.floor((location / 100) * totalChunks)
  }
}
