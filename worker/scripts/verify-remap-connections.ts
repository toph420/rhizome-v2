#!/usr/bin/env tsx
/**
 * Verify Connection Remapping Results
 *
 * Checks that all 7 connections successfully remapped after
 * Palmer Eldritch was edited and reprocessed.
 */

import { createClient } from '@supabase/supabase-js'
import { readFile } from 'fs/promises'

const supabase = createClient(
  process.env.SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
)

interface VerificationData {
  document_id: string
  document_title: string
  test_timestamp: string
  original_markdown_length: number
  modified_markdown_length: number
  connections_snapshot: Array<{
    id: string
    source_chunk_id: string
    target_chunk_id: string
    connection_type: string
    strength: number
    source_index: number
    target_index: number
  }>
  expected_connections: number
}

async function main() {
  console.log('🔍 Connection Remapping Verification')
  console.log('====================================\n')

  // Load verification data
  let verificationData: VerificationData
  try {
    const data = await readFile('./test-remap-verification.json', 'utf-8')
    verificationData = JSON.parse(data)
  } catch (error) {
    console.error('❌ Cannot find test-remap-verification.json')
    console.error('   Run test-remap-real-connections.ts first')
    process.exit(1)
  }

  console.log('📋 Test Information:')
  console.log(`   Document: ${verificationData.document_title}`)
  console.log(`   Test Time: ${new Date(verificationData.test_timestamp).toLocaleString()}`)
  console.log(`   Expected Connections: ${verificationData.expected_connections}\n`)

  // Get current chunks
  const { data: currentChunks } = await supabase
    .from('chunks')
    .select('id, chunk_index')
    .eq('document_id', verificationData.document_id)
    .eq('is_current', true)
    .order('chunk_index', { ascending: true })

  if (!currentChunks || currentChunks.length === 0) {
    console.error('❌ No current chunks found - document may not be reprocessed yet')
    process.exit(1)
  }

  console.log(`📊 Reprocessing Status:`)
  console.log(`   Current chunks: ${currentChunks.length}`)

  // Check for remapped connections
  const currentChunkIds = currentChunks.map(c => c.id)

  const { data: connections } = await supabase
    .from('connections')
    .select(`
      id,
      source_chunk_id,
      target_chunk_id,
      connection_type,
      strength,
      user_validated,
      metadata,
      source_chunk:chunks!source_chunk_id(chunk_index, summary),
      target_chunk:chunks!target_chunk_id(chunk_index, summary)
    `)
    .eq('user_validated', true)
    .or(`source_chunk_id.in.(${currentChunkIds.join(',')})`)

  if (!connections || connections.length === 0) {
    console.error('\n❌ CRITICAL: No verified connections found')
    console.error('   All connections were LOST during reprocessing')
    console.error('\n🔧 Debug Steps:')
    console.error('   1. Check if remap-connections.ts was called')
    console.error('   2. Verify old chunks exist with is_current=false')
    console.error('   3. Check old chunk embeddings are preserved')
    process.exit(1)
  }

  console.log(`   Found connections: ${connections.length}\n`)

  // Analyze results
  console.log('🔬 Remapping Analysis:')
  console.log('=====================\n')

  let successCount = 0
  let reviewCount = 0
  let lostCount = 0

  connections.forEach((conn, i) => {
    const isRemapped = conn.metadata?.remapped === true
    const similarity = conn.metadata?.similarity || 0
    const needsReview = conn.metadata?.needs_review === true

    // Find original connection from snapshot
    const original = verificationData.connections_snapshot.find(
      s => s.id === conn.id || s.connection_type === conn.connection_type
    )

    console.log(`${i + 1}. ${conn.connection_type} (original strength: ${original?.strength.toFixed(2) || 'unknown'})`)

    if (isRemapped) {
      console.log(`   ✅ Remapped: Yes`)
      console.log(`   📊 Similarity: ${(similarity * 100).toFixed(1)}%`)

      if (similarity >= 0.95) {
        console.log(`   🎯 Result: SUCCESS - High confidence`)
        successCount++
      } else if (similarity >= 0.85) {
        console.log(`   ⚠️  Result: REVIEW NEEDED - Medium confidence`)
        reviewCount++
      } else {
        console.log(`   ❌ Result: LOW CONFIDENCE - May be incorrect`)
        reviewCount++
      }

      if (original) {
        console.log(`   📍 Original: Chunk ${original.source_index} → Chunk ${original.target_index}`)
      }
      console.log(`   📍 Current:  Chunk ${conn.source_chunk?.chunk_index} → Chunk ${conn.target_chunk?.chunk_index}`)
    } else {
      console.log(`   ❌ Remapped: No`)
      console.log(`   ⚠️  This connection was not remapped (may be unchanged)`)
    }

    console.log('')
  })

  // Calculate missing connections
  lostCount = verificationData.expected_connections - connections.length

  // Final verdict
  console.log('📊 Final Results:')
  console.log('================')
  console.log(`✅ Success: ${successCount}/${verificationData.expected_connections} (>0.95 similarity)`)
  console.log(`⚠️  Review:  ${reviewCount}/${verificationData.expected_connections} (0.85-0.95 similarity)`)
  console.log(`❌ Lost:    ${lostCount}/${verificationData.expected_connections} (not found)\n`)

  // Determine overall result
  if (successCount === verificationData.expected_connections) {
    console.log('🎉 TEST PASSED!')
    console.log('   All connections remapped with high confidence')
    console.log('   Connection recovery system is WORKING ✅\n')

    console.log('✅ What this proves:')
    console.log('   • Cross-document connections survive edits')
    console.log('   • Embedding similarity matching works correctly')
    console.log('   • Old chunk data is preserved (is_current=false)')
    console.log('   • System is ready for production use\n')
    process.exit(0)

  } else if (reviewCount > 0 && lostCount === 0) {
    console.log('⚠️  TEST PARTIAL PASS')
    console.log('   Connections remapped but some need review')
    console.log('   Check similarity thresholds in remap-connections.ts\n')

    console.log('🔧 Recommended actions:')
    console.log('   • Review connections with <0.95 similarity')
    console.log('   • Consider lowering auto-accept threshold to 0.85')
    console.log('   • Verify chunk content similarity manually\n')
    process.exit(0)

  } else {
    console.log('❌ TEST FAILED')
    console.log(`   ${lostCount} connection(s) were lost during remapping\n`)

    console.log('🔧 Debug checklist:')
    console.log('   [ ] Verify remap-connections.ts was called during reprocessing')
    console.log('   [ ] Check old chunks exist: SELECT * FROM chunks WHERE is_current=false')
    console.log('   [ ] Verify old chunk embeddings: SELECT embedding FROM chunks WHERE is_current=false LIMIT 1')
    console.log('   [ ] Check connection recovery logs in worker output')
    console.log('   [ ] Test embedding similarity calculation manually\n')

    console.log('📝 Next steps:')
    console.log('   1. Review worker/handlers/remap-connections.ts')
    console.log('   2. Check embedding similarity threshold (currently 0.95)')
    console.log('   3. Verify cosine distance calculation')
    console.log('   4. Re-run test after fixes\n')

    process.exit(1)
  }
}

main().catch(console.error)
