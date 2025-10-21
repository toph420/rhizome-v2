#!/usr/bin/env tsx
/**
 * Test Script: Annotation Recovery
 *
 * Tests the 4-tier fuzzy matching system with real data
 * Run: npx tsx worker/test-annotation-recovery.ts <document_id>
 */

import { recoverAnnotations } from './handlers/recover-annotations.js'
import { createClient } from '@supabase/supabase-js'

const documentId = process.argv[2]

if (!documentId) {
  console.error('❌ Usage: npx tsx worker/test-annotation-recovery.ts <document_id>')
  process.exit(1)
}

async function testRecovery() {
  console.log('🧪 Testing Annotation Recovery')
  console.log('━'.repeat(50))

  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // 1. Fetch document markdown
  console.log('\n1️⃣ Fetching document markdown...')
  const { data: doc } = await supabase
    .from('documents')
    .select('id, title, markdown_path')
    .eq('id', documentId)
    .single()

  if (!doc?.markdown_path) {
    console.error('❌ Document not found or has no markdown_path')
    process.exit(1)
  }

  console.log(`   ✅ Document: "${doc.title}"`)

  // 2. Download markdown
  const { data: blob } = await supabase.storage
    .from('documents')
    .download(doc.markdown_path)

  if (!blob) {
    console.error('❌ Failed to download markdown')
    process.exit(1)
  }

  const markdown = await blob.text()
  console.log(`   ✅ Markdown: ${markdown.length} chars`)

  // 3. Fetch current chunks
  console.log('\n2️⃣ Fetching chunks...')
  const { data: chunks } = await supabase
    .from('chunks')
    .select('id, chunk_index, start_offset, end_offset, content')
    .eq('document_id', documentId)
    .eq('is_current', true)
    .order('chunk_index')

  if (!chunks || chunks.length === 0) {
    console.error('❌ No chunks found')
    process.exit(1)
  }

  console.log(`   ✅ Chunks: ${chunks.length}`)

  // 4. Check for existing annotations
  console.log('\n3️⃣ Checking annotations...')
  const { data: sourceComponents } = await supabase
    .from('components')
    .select('entity_id')
    .eq('component_type', 'source')
    .eq('data->>document_id', documentId)

  const entityIds = sourceComponents?.map(c => c.entity_id) || []

  if (entityIds.length === 0) {
    console.log('   ℹ️  No annotations to recover (create some first!)')
    process.exit(0)
  }

  const { data: annotations } = await supabase
    .from('components')
    .select('id, data, original_chunk_index')
    .eq('component_type', 'position')
    .in('entity_id', entityIds)

  console.log(`   ✅ Annotations: ${annotations?.length || 0}`)

  // 5. Test recovery
  console.log('\n4️⃣ Running recovery...')
  console.log('━'.repeat(50))

  const results = await recoverAnnotations(documentId, markdown, chunks)

  // 6. Report results
  console.log('\n📊 Recovery Results:')
  console.log('━'.repeat(50))
  console.log(`✅ Success:       ${results.success.length}`)
  console.log(`⚠️  Needs Review:  ${results.needsReview.length}`)
  console.log(`❌ Lost:          ${results.lost.length}`)

  const total = results.success.length + results.needsReview.length + results.lost.length
  const recovered = results.success.length + results.needsReview.length
  const rate = total > 0 ? (recovered / total * 100).toFixed(1) : '0.0'

  console.log(`\n📈 Recovery Rate: ${rate}% (${recovered}/${total})`)

  // 7. Show needs review items
  if (results.needsReview.length > 0) {
    console.log('\n⚠️  Items Needing Review:')
    console.log('━'.repeat(50))
    results.needsReview.forEach((item, i) => {
      console.log(`\n${i + 1}. Confidence: ${(item.suggestedMatch.confidence * 100).toFixed(1)}%`)
      console.log(`   Method: ${item.suggestedMatch.method}`)
      console.log(`   Original: "${item.annotation.text.slice(0, 50)}..."`)
      console.log(`   Suggested: "${item.suggestedMatch.text.slice(0, 50)}..."`)
    })
  }

  // 8. Show lost items
  if (results.lost.length > 0) {
    console.log('\n❌ Lost Annotations:')
    console.log('━'.repeat(50))
    results.lost.forEach((item, i) => {
      console.log(`${i + 1}. "${item.text.slice(0, 60)}..."`)
    })
  }

  console.log('\n✨ Test complete!')
}

testRecovery().catch(error => {
  console.error('\n💥 Test failed:', error)
  process.exit(1)
})
