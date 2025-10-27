/**
 * Readwise Auto-Import Handler
 *
 * Automatically searches Readwise library for a book matching document metadata,
 * then imports highlights using fuzzy matching.
 *
 * Flow:
 * 1. Fetch document metadata (title, author) from database
 * 2. Search Readwise Export API for matching book
 * 3. Download book with highlights
 * 4. Import highlights via importFromReadwiseExport
 *
 * Job input_data:
 * - documentId: Rhizome document ID
 *
 * Job output_data:
 * - success: boolean
 * - bookTitle?: string (matched book title)
 * - bookAuthor?: string (matched book author)
 * - bookId?: number (Readwise book ID)
 * - highlightCount?: number (total highlights found)
 * - imported?: number (exact matches imported)
 * - needsReview?: number (fuzzy matches pending review)
 * - failed?: number (no matches found)
 * - error?: string (error message if failed)
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { ReadwiseExportClient } from '../lib/readwise-export-api.js'
import { importFromReadwiseExport } from './readwise-import.js'
import { ReadwiseAutoImportOutputSchema } from '../types/job-schemas.js'

interface AutoImportResult {
  success: boolean
  bookTitle?: string
  bookAuthor?: string
  bookId?: number
  highlightCount?: number
  imported?: number
  needsReview?: number
  failed?: number
  error?: string
}

/**
 * Handler for readwise_auto_import job type
 */
export async function readwiseAutoImportHandler(
  supabase: SupabaseClient,
  job: any
): Promise<AutoImportResult> {
  const { documentId } = job.input_data

  console.log(`[Readwise Auto-Import] Starting for document: ${documentId}`)

  try {
    // 1. Fetch document metadata
    const { data: doc, error: docError } = await supabase
      .from('documents')
      .select('id, title, author, user_id')
      .eq('id', documentId)
      .single()

    if (docError || !doc) {
      throw new Error(`Document not found: ${docError?.message || 'unknown error'}`)
    }

    if (!doc.title || !doc.author) {
      return {
        success: false,
        error: 'Document metadata incomplete. Please set title and author first.'
      }
    }

    console.log(`[Readwise Auto-Import] Searching for: "${doc.title}" by ${doc.author}`)

    // 2. Check for Readwise token
    const readwiseToken = process.env.READWISE_ACCESS_TOKEN
    if (!readwiseToken) {
      return {
        success: false,
        error: 'READWISE_ACCESS_TOKEN not configured in environment'
      }
    }

    // 3. Search Readwise library
    const client = new ReadwiseExportClient(readwiseToken)
    const books = await client.searchBooks({
      title: doc.title,
      author: doc.author
    })

    if (books.length === 0) {
      console.log(`[Readwise Auto-Import] No matching book found`)
      return {
        success: false,
        error: `No matching book found in Readwise library for "${doc.title}"`,
      }
    }

    // Use first match (could add fuzzy scoring later for multiple matches)
    const matchedBook = books[0]
    console.log(`[Readwise Auto-Import] Found match: "${matchedBook.title}" by ${matchedBook.author} (ID: ${matchedBook.user_book_id})`)
    console.log(`[Readwise Auto-Import] Book has ${matchedBook.highlights.length} highlights`)

    if (matchedBook.highlights.length === 0) {
      return {
        success: false,
        error: `Book found but has no highlights: "${matchedBook.title}"`,
        bookTitle: matchedBook.title,
        bookAuthor: matchedBook.author,
        bookId: matchedBook.user_book_id,
        highlightCount: 0
      }
    }

    // 4. Import highlights using existing handler
    console.log(`[Readwise Auto-Import] Importing ${matchedBook.highlights.length} highlights...`)
    const importResults = await importFromReadwiseExport(documentId, matchedBook)

    console.log(`[Readwise Auto-Import] Import complete!`)
    console.log(`  Imported: ${importResults.imported}`)
    console.log(`  Needs Review: ${importResults.needsReview.length}`)
    console.log(`  Failed: ${importResults.failed.length}`)

    const outputData = {
      success: true,
      bookTitle: matchedBook.title,
      bookAuthor: matchedBook.author,
      bookId: matchedBook.user_book_id,
      highlightCount: matchedBook.highlights.length,
      imported: importResults.imported,
      needsReview: importResults.needsReview.length,
      failed: importResults.failed.length
    }

    // Validate output before returning (catches typos!)
    ReadwiseAutoImportOutputSchema.parse(outputData)
    return outputData

  } catch (error) {
    console.error('[Readwise Auto-Import] Error:', error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    const errorOutput = {
      success: false,
      error: message
    }

    // Validate error output before returning
    ReadwiseAutoImportOutputSchema.parse(errorOutput)
    return errorOutput
  }
}
