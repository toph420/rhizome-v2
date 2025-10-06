#!/usr/bin/env tsx
/**
 * Readwise Import CLI
 *
 * Imports highlights from Readwise for a given document ID
 * Usage: npx tsx worker/scripts/import-readwise.ts <documentId>
 *
 * Outputs JSON to stdout for API consumption:
 * { "success": true, "imported": 96, "needsReview": 3, "failed": 14 }
 */

import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'
import { ReadwiseExportClient } from '../lib/readwise-export-api.js'
import { importFromReadwiseExport } from '../handlers/readwise-import.js'

async function main() {
  const documentId = process.argv[2]

  if (!documentId) {
    console.log(JSON.stringify({
      success: false,
      error: 'Missing documentId argument'
    }))
    process.exit(1)
  }

  // Validate environment
  const readwiseToken = process.env.READWISE_ACCESS_TOKEN
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!readwiseToken) {
    console.log(JSON.stringify({
      success: false,
      error: 'READWISE_ACCESS_TOKEN not found in environment'
    }))
    process.exit(1)
  }

  if (!supabaseUrl || !supabaseKey) {
    console.log(JSON.stringify({
      success: false,
      error: 'Supabase credentials not found'
    }))
    process.exit(1)
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseKey)

    // Get document metadata
    const { data: doc, error: docError } = await supabase
      .from('documents')
      .select('id, title, author')
      .eq('id', documentId)
      .single()

    if (docError || !doc) {
      console.log(JSON.stringify({
        success: false,
        error: 'Document not found'
      }))
      process.exit(1)
    }

    // Search Readwise for matching book
    const client = new ReadwiseExportClient(readwiseToken)

    // Try author search first (more reliable)
    let books = doc.author
      ? await client.searchBooks({ author: doc.author })
      : []

    // Fallback to title search if no author or no results
    if (books.length === 0) {
      books = await client.searchBooks({ title: doc.title })
    }

    if (books.length === 0) {
      console.log(JSON.stringify({
        success: false,
        error: `Book not found in Readwise: "${doc.title}" by ${doc.author || 'Unknown'}`
      }))
      process.exit(1)
    }

    // Find best match (exact title match preferred, otherwise first result)
    const targetBook = books.find(b =>
      b.title.toLowerCase() === doc.title.toLowerCase()
    ) || books[0]

    // Import highlights
    const results = await importFromReadwiseExport(documentId, targetBook)

    // Output JSON results to stdout
    console.log(JSON.stringify({
      success: true,
      imported: results.imported,
      needsReview: results.needsReview.length,
      failed: results.failed.length,
      bookTitle: targetBook.title,
      bookAuthor: targetBook.author
    }))

  } catch (error) {
    console.log(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }))
    process.exit(1)
  }
}

main()
