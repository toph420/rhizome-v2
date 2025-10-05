#!/usr/bin/env tsx
/**
 * Test Readwise Reader Import
 *
 * Tests importing highlights from Readwise Reader API
 * Specifically configured for JR by William Gaddis
 */

import { ReadwiseReaderClient } from '../lib/readwise-reader-api.js'
import { importFromReadwiseReader } from '../handlers/readwise-import.js'
import { createClient } from '@supabase/supabase-js'

async function testJRImport() {
  console.log('=== Readwise Reader Import Test ===\n')

  // Step 1: Check environment
  const readwiseToken = process.env.READWISE_ACCESS_TOKEN
  if (!readwiseToken) {
    throw new Error('READWISE_ACCESS_TOKEN not found in environment')
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Supabase credentials not found in environment')
  }

  console.log('✓ Environment configured')
  console.log(`  Supabase: ${supabaseUrl}`)
  console.log(`  Readwise token: ${readwiseToken.slice(0, 10)}...`)
  console.log()

  // Step 2: Find JR in Readwise Reader
  console.log('Step 1: Finding JR in Readwise Reader...')
  const reader = new ReadwiseReaderClient(readwiseToken)

  const jrReader = await reader.findDocumentByTitle('JR')

  if (!jrReader) {
    console.error('✗ JR not found in Readwise Reader library')
    console.log('\nSearching for similar titles:')
    const allDocs = await reader.listDocuments()
    const gaddis = allDocs.filter(d =>
      d.title.toLowerCase().includes('gaddis') ||
      d.author.toLowerCase().includes('gaddis')
    )
    if (gaddis.length > 0) {
      console.log('Found Gaddis books:')
      gaddis.forEach(d => {
        console.log(`  - ${d.title} by ${d.author} (ID: ${d.id})`)
      })
    } else {
      console.log('No Gaddis books found. Available books:')
      allDocs.slice(0, 10).forEach(d => {
        console.log(`  - ${d.title} by ${d.author}`)
      })
    }
    throw new Error('JR not found in Readwise Reader')
  }

  console.log('✓ Found in Readwise Reader:')
  console.log(`  ID: ${jrReader.id}`)
  console.log(`  Title: ${jrReader.title}`)
  console.log(`  Author: ${jrReader.author}`)
  console.log(`  Category: ${jrReader.category}`)
  console.log()

  // Step 3: Find JR in Rhizome
  console.log('Step 2: Finding JR in Rhizome...')
  const supabase = createClient(supabaseUrl, supabaseKey)

  const { data: jrRhizome, error } = await supabase
    .from('documents')
    .select('id, title, processing_status, embeddings_available')
    .or('title.ilike.%J R%,title.ilike.%JR%,title.ilike.%Gaddis%')
    .limit(1)
    .single()

  if (error || !jrRhizome) {
    console.error('✗ JR not found in Rhizome')
    console.log('\nSearching for all documents:')
    const { data: allDocs } = await supabase
      .from('documents')
      .select('id, title, processing_status')
      .limit(10)

    if (allDocs && allDocs.length > 0) {
      console.log('Available documents:')
      allDocs.forEach(d => {
        console.log(`  - ${d.title} (${d.processing_status})`)
      })
    }
    throw new Error('JR not found in Rhizome. Please upload the book first.')
  }

  if (jrRhizome.processing_status !== 'completed') {
    throw new Error(`JR is not fully processed. Status: ${jrRhizome.processing_status}`)
  }

  console.log('✓ Found in Rhizome:')
  console.log(`  ID: ${jrRhizome.id}`)
  console.log(`  Title: ${jrRhizome.title}`)
  console.log(`  Status: ${jrRhizome.processing_status}`)
  console.log(`  Embeddings: ${jrRhizome.embeddings_available ? 'Yes' : 'No'}`)
  console.log()

  // Step 4: Import highlights
  console.log('Step 3: Importing highlights...\n')

  const results = await importFromReadwiseReader(
    jrRhizome.id,
    jrReader.id,
    readwiseToken
  )

  // Step 5: Report results
  console.log('\n=== Import Complete ===\n')

  const total = results.imported + results.needsReview.length + results.failed.length
  console.log(`Total highlights: ${total}`)
  console.log(`✓ Successfully imported: ${results.imported}`)
  console.log(`? Needs review: ${results.needsReview.length}`)
  console.log(`✗ Failed: ${results.failed.length}`)

  if (total > 0) {
    const successRate = (results.imported / total * 100).toFixed(1)
    const accuracyRate = ((results.imported + results.needsReview.length) / total * 100).toFixed(1)
    console.log(`\nSuccess Rate (exact matches): ${successRate}%`)
    console.log(`Accuracy Rate (exact + fuzzy): ${accuracyRate}%`)
  }

  if (results.needsReview.length > 0) {
    console.log('\n--- Needs Review (first 3) ---')
    results.needsReview.slice(0, 3).forEach((item, i) => {
      console.log(`\n${i + 1}. "${item.highlight.text.slice(0, 60)}..."`)
      console.log(`   Confidence: ${(item.confidence * 100).toFixed(0)}%`)
      console.log(`   Location: ${item.highlight.location || 'unknown'}`)
    })
  }

  if (results.failed.length > 0) {
    console.log('\n--- Failed Imports (first 3) ---')
    results.failed.slice(0, 3).forEach((item, i) => {
      console.log(`\n${i + 1}. "${item.highlight.text.slice(0, 60)}..."`)
      console.log(`   Reason: ${item.reason}`)
      console.log(`   Location: ${item.highlight.location || 'unknown'}`)
    })
  }

  // Step 6: Next steps based on results
  console.log('\n=== Next Steps ===\n')

  const successRate = total > 0 ? (results.imported / total * 100) : 0

  if (successRate >= 70) {
    console.log('✓ Success rate is good (≥70%)!')
    console.log('  → Import rest of your library')
    console.log('  → Build review UI for fuzzy matches')
    console.log('  → Test connection remapping')
  } else if (successRate >= 40) {
    console.log('⚠ Success rate is moderate (40-70%)')
    console.log('  → Investigate OCR drift (compare failed highlights to markdown)')
    console.log('  → Adjust fuzzy matching threshold (try 0.7 instead of 0.8)')
    console.log('  → Check if Readwise used different PDF than you uploaded')
  } else {
    console.log('✗ Success rate is low (<40%)')
    console.log('  → Different source files between Readwise and Rhizome')
    console.log('  → Need to re-upload matching PDFs')
    console.log('  → Or adjust normalization (whitespace, quotes, unicode)')
  }

  console.log()
}

// Run test
testJRImport().catch(error => {
  console.error('\n❌ Test failed:', error.message)
  process.exit(1)
})
