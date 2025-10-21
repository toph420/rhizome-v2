#!/usr/bin/env tsx
/**
 * Test Script: Full Reprocessing Pipeline
 *
 * Tests document reprocessing end-to-end
 * Run: npx tsx worker/test-reprocess-pipeline.ts <document_id>
 */

import { reprocessDocument } from './handlers/reprocess-document.js'
import { createClient } from '@supabase/supabase-js'

const documentId = process.argv[2]

if (!documentId) {
  console.error('❌ Usage: npx tsx worker/test-reprocess-pipeline.ts <document_id>')
  console.error('\n💡 First, manually edit the markdown in Supabase Storage')
  console.error('   Then run this script to test reprocessing')
  process.exit(1)
}

async function testReprocessing() {
  console.log('🧪 Testing Reprocessing Pipeline')
  console.log('━'.repeat(50))

  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // 1. Check document status
  console.log('\n1️⃣ Checking document...')
  const { data: doc } = await supabase
    .from('documents')
    .select('id, title, processing_status, markdown_path')
    .eq('id', documentId)
    .single()

  if (!doc) {
    console.error('❌ Document not found')
    process.exit(1)
  }

  console.log(`   ✅ Document: "${doc.title}"`)
  console.log(`   📊 Status: ${doc.processing_status}`)

  if (doc.processing_status === 'reprocessing') {
    console.error('❌ Document is already being reprocessed')
    process.exit(1)
  }

  // 2. Count existing annotations
  console.log('\n2️⃣ Checking existing annotations...')
  const { data: sourceComponents } = await supabase
    .from('components')
    .select('entity_id')
    .eq('component_type', 'source')
    .eq('data->>document_id', documentId)

  const entityIds = sourceComponents?.map(c => c.entity_id) || []

  const { data: beforeAnnotations } = await supabase
    .from('components')
    .select('id, recovery_method')
    .eq('component_type', 'position')
    .in('entity_id', entityIds)

  console.log(`   📝 Annotations before: ${beforeAnnotations?.length || 0}`)

  if (!beforeAnnotations || beforeAnnotations.length === 0) {
    console.log('   ⚠️  No annotations exist - create some first!')
    process.exit(0)
  }

  // 3. Count existing chunks
  const { data: beforeChunks } = await supabase
    .from('chunks')
    .select('id, is_current')
    .eq('document_id', documentId)
    .eq('is_current', true)

  console.log(`   📦 Chunks before: ${beforeChunks?.length || 0}`)

  // 4. Run reprocessing
  console.log('\n3️⃣ Running reprocessing...')
  console.log('━'.repeat(50))
  console.log('')

  const startTime = Date.now()

  try {
    const results = await reprocessDocument(documentId)

    const duration = Date.now() - startTime

    // 5. Report results
    console.log('\n━'.repeat(50))
    console.log('📊 Reprocessing Results:')
    console.log('━'.repeat(50))

    console.log(`\n⏱️  Duration: ${(duration / 1000).toFixed(1)}s`)

    console.log('\n📝 Annotations:')
    console.log(`   ✅ Success:       ${results.annotations.success.length}`)
    console.log(`   ⚠️  Needs Review:  ${results.annotations.needsReview.length}`)
    console.log(`   ❌ Lost:          ${results.annotations.lost.length}`)

    const total = results.annotations.success.length +
                  results.annotations.needsReview.length +
                  results.annotations.lost.length
    const recovered = results.annotations.success.length + results.annotations.needsReview.length
    const rate = total > 0 ? (recovered / total * 100).toFixed(1) : '0.0'

    console.log(`   📈 Recovery Rate: ${rate}%`)

    console.log('\n🔗 Connections:')
    console.log(`   ✅ Remapped:      ${results.connections.success.length}`)
    console.log(`   ⚠️  Needs Review:  ${results.connections.needsReview.length}`)
    console.log(`   ❌ Lost:          ${results.connections.lost.length}`)

    // 6. Verify chunk cleanup
    console.log('\n4️⃣ Verifying cleanup...')

    const { data: afterChunks } = await supabase
      .from('chunks')
      .select('id, is_current, reprocessing_batch')
      .eq('document_id', documentId)

    const currentChunks = afterChunks?.filter(c => c.is_current) || []
    const oldChunks = afterChunks?.filter(c => !c.is_current) || []

    console.log(`   📦 Current chunks: ${currentChunks.length}`)
    console.log(`   🗑️  Old chunks: ${oldChunks.length}`)

    if (oldChunks.length > 0) {
      console.log('   ⚠️  WARNING: Old chunks not cleaned up!')
      oldChunks.forEach(c => {
        console.log(`      - ${c.id} (batch: ${c.reprocessing_batch})`)
      })
    } else {
      console.log('   ✅ Cleanup successful')
    }

    // 7. Check document status
    const { data: finalDoc } = await supabase
      .from('documents')
      .select('processing_status')
      .eq('id', documentId)
      .single()

    console.log(`\n📊 Final status: ${finalDoc?.processing_status}`)

    if (finalDoc?.processing_status !== 'completed') {
      console.log('   ⚠️  WARNING: Status should be "completed"')
    } else {
      console.log('   ✅ Status correct')
    }

    console.log('\n✨ Test complete!')

    // Performance check
    if (duration > 2000) {
      console.log(`\n⚠️  Performance: ${(duration / 1000).toFixed(1)}s (target: <2s for small docs)`)
    }

    // Recovery rate check
    if (parseFloat(rate) < 90) {
      console.log(`\n⚠️  Recovery rate: ${rate}% (target: >90%)`)
    }

  } catch (error) {
    console.error('\n💥 Reprocessing failed:', error)

    // Check rollback
    console.log('\n5️⃣ Checking rollback...')

    const { data: chunks } = await supabase
      .from('chunks')
      .select('id, is_current')
      .eq('document_id', documentId)

    const currentChunks = chunks?.filter(c => c.is_current) || []

    if (currentChunks.length === beforeChunks?.length) {
      console.log('   ✅ Rollback successful - original chunks restored')
    } else {
      console.log(`   ❌ Rollback failed - chunk count mismatch (before: ${beforeChunks?.length}, after: ${currentChunks.length})`)
    }

    process.exit(1)
  }
}

testReprocessing().catch(error => {
  console.error('\n💥 Test script error:', error)
  process.exit(1)
})
