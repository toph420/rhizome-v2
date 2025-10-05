#!/usr/bin/env tsx
/**
 * Search for a book in Readwise library
 */

import { ReadwiseExportClient } from '../lib/readwise-export-api.js'

const query = process.argv[2] || 'Palmer Eldritch'

const client = new ReadwiseExportClient(
  process.env.READWISE_ACCESS_TOKEN || ''
)

console.log(`🔍 Searching Readwise for: "${query}"\n`)

const books = await client.searchBooks({ title: query })

if (books.length === 0) {
  console.log('❌ No books found')
  process.exit(0)
}

console.log(`✅ Found ${books.length} matching book(s):\n`)

books.forEach((book, i) => {
  console.log(`${i + 1}. "${book.title}" by ${book.author}`)
  console.log(`   Category: ${book.category}`)
  console.log(`   Highlights: ${book.highlights.length}`)
  console.log(`   Book ID: ${book.user_book_id}`)
  console.log(`   Source: ${book.source}`)
  console.log('')
})
