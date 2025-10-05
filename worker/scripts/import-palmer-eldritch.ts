#!/usr/bin/env tsx
/**
 * Import Readwise highlights for Palmer Eldritch
 */

import { createClient } from '@supabase/supabase-js'
import { ReadwiseExportClient } from '../lib/readwise-export-api.js'
import { importFromReadwiseExport } from '../handlers/readwise-import.js'

const PALMER_ELDRITCH_ID = 'a44b039a-af64-49c1-b53a-8404405c6ad6'

const supabase = createClient(
  process.env.SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
)

const client = new ReadwiseExportClient(
  process.env.READWISE_ACCESS_TOKEN || ''
)

console.log('📚 Importing Readwise highlights for Palmer Eldritch\n')

// Find the book
console.log('Step 1: Finding book in Readwise...')
const books = await client.searchBooks({ title: 'Palmer Eldritch' })

if (books.length === 0) {
  console.error('❌ Book not found in Readwise')
  process.exit(1)
}

const book = books[0]
console.log(`✓ Found: "${book.title}" by ${book.author}`)
console.log(`  Highlights: ${book.highlights.length}\n`)

// Import highlights
console.log('Step 2: Importing highlights with improved accuracy...')
console.log('  • Image filtering enabled ✓')
console.log('  • Document-specific location estimation ✓\n')

const results = await importFromReadwiseExport(
  PALMER_ELDRITCH_ID,
  book
)

// Display results
console.log('\n📊 Import Results:')
console.log('==================')
console.log(`✅ Imported: ${results.imported}`)
console.log(`⚠️  Needs Review: ${results.needsReview.length}`)
console.log(`❌ Failed: ${results.failed.length}`)

const totalProcessed = results.imported + results.needsReview.length + results.failed.length
const successRate = totalProcessed > 0
  ? ((results.imported + results.needsReview.length) / totalProcessed * 100).toFixed(1)
  : 0

console.log(`\n📈 Success Rate: ${successRate}%`)
console.log(`   (Target: 85%+ with improvements)\n`)

if (results.failed.length > 0) {
  console.log('❌ Failed Highlights Sample:')
  results.failed.slice(0, 5).forEach((item, i) => {
    console.log(`${i + 1}. "${item.highlight.text?.slice(0, 50)}..."`)
    console.log(`   Reason: ${item.reason}\n`)
  })
}

if (results.needsReview.length > 0) {
  console.log('⚠️  Needs Review Sample:')
  results.needsReview.slice(0, 3).forEach((item, i) => {
    console.log(`${i + 1}. "${item.highlight.text?.slice(0, 50)}..."`)
    console.log(`   Confidence: ${(item.confidence * 100).toFixed(0)}%\n`)
  })
}

console.log('✅ Import complete! Check frontend to see highlights.')
