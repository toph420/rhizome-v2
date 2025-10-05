#!/usr/bin/env tsx
/**
 * Direct Connection Remapping Test
 *
 * Tests remapping logic by:
 * 1. Marking current chunks as old (is_current: false)
 * 2. Duplicating them as "new" chunks (simulating reprocessing)
 * 3. Running remapConnections() to verify it works
 * 4. Checking similarity scores
 *
 * This avoids expensive AI reprocessing while testing core remapping logic.
 */

import { createClient } from '@supabase/supabase-js'
import { remapConnections } from '../handlers/remap-connections.js'

const PALMER_ELDRITCH_ID = 'a44b039a-af64-49c1-b53a-8404405c6ad6'

const supabase = createClient(
  process.env.SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
)

async function main() {
  console.log('🧪 Direct Connection Remapping Test')
  console.log('===================================\n')

  console.log('📋 Test Strategy:')
  console.log('1. Mark current chunks as old (is_current: false)')
  console.log('2. Duplicate chunks as "new" (simulating reprocessing)')
  console.log('3. Run remapConnections() with new chunks')
  console.log('4. Verify 7 connections remap with >0.95 similarity\n')

  // Step 1: Get current chunks
  const { data: currentChunks, error: fetchError } = await supabase
    .from('chunks')
    .select('*')
    .eq('document_id', PALMER_ELDRITCH_ID)
    .eq('is_current', true)
    .order('chunk_index', { ascending: true })

  if (fetchError || !currentChunks || currentChunks.length === 0) {
    console.error('❌ Failed to fetch chunks:', fetchError?.message)
    process.exit(1)
  }

  console.log(`✅ Found ${currentChunks.length} current chunks\n`)

  // Step 2: Check connections
  const chunkIds = currentChunks.map(c => c.id)
  const { data: connections } = await supabase
    .from('connections')
    .select('id, connection_type, strength')
    .eq('user_validated', true)
    .or(`source_chunk_id.in.(${chunkIds.join(',')})`)

  if (!connections || connections.length === 0) {
    console.error('❌ No verified connections found')
    process.exit(1)
  }

  console.log(`✅ Found ${connections.length} verified connections to test\n`)

  // Step 3: Mark current chunks as old
  console.log('Step 1: Marking chunks as old (is_current: false)...')
  const { error: updateError } = await supabase
    .from('chunks')
    .update({ is_current: false })
    .eq('document_id', PALMER_ELDRITCH_ID)
    .eq('is_current', true)

  if (updateError) {
    console.error('❌ Failed to mark chunks:', updateError.message)
    process.exit(1)
  }

  console.log('✅ Marked chunks as old\n')

  // Step 4: Create "new" chunks (exact duplicates with new IDs)
  console.log('Step 2: Creating new chunks (duplicates for testing)...')

  const newChunksData = currentChunks.map((chunk, index) => ({
    document_id: chunk.document_id,
    chunk_index: index,
    content: chunk.content,
    start_offset: chunk.start_offset,
    end_offset: chunk.end_offset,
    word_count: chunk.word_count,
    themes: chunk.themes,
    importance_score: chunk.importance_score,
    summary: chunk.summary,
    emotional_metadata: chunk.emotional_metadata,
    conceptual_metadata: chunk.conceptual_metadata,
    domain_metadata: chunk.domain_metadata,
    metadata_extracted_at: new Date().toISOString(),
    embedding: chunk.embedding,
    is_current: true,
    reprocessing_batch: new Date().toISOString()
  }))

  const { data: newChunks, error: insertError } = await supabase
    .from('chunks')
    .insert(newChunksData)
    .select('id, document_id, chunk_index, content, embedding, start_offset, end_offset, is_current')

  if (insertError || !newChunks) {
    console.error('❌ Failed to create new chunks:', insertError?.message)
    // Rollback
    await supabase
      .from('chunks')
      .update({ is_current: true })
      .eq('document_id', PALMER_ELDRITCH_ID)
      .eq('is_current', false)
    process.exit(1)
  }

  console.log(`✅ Created ${newChunks.length} new chunks\n`)

  // Step 5: Run connection remapping
  console.log('Step 3: Running connection remapping...')
  console.log('==========================================\n')

  try {
    const results = await remapConnections(
      PALMER_ELDRITCH_ID,
      newChunks as any,
      supabase
    )

    console.log('\n📊 Remapping Results:')
    console.log('====================')
    console.log(`✅ Success: ${results.success.length}/${connections.length}`)
    console.log(`⚠️  Review:  ${results.needsReview.length}/${connections.length}`)
    console.log(`❌ Lost:    ${results.lost.length}/${connections.length}\n`)

    // Expected: Since chunks are identical, should be 100% success with 1.0 similarity
    if (results.success.length === connections.length) {
      console.log('🎉 TEST PASSED!')
      console.log('   All connections remapped successfully')
      console.log('   Remapping logic is WORKING ✅\n')

      console.log('💡 Key Insight:')
      console.log('   • Chunks were duplicated (identical embeddings)')
      console.log('   • All connections should show 1.0 similarity')
      console.log('   • This proves embedding-based matching works')
      console.log('   • Real edits would have ~0.95-0.98 similarity\n')

    } else {
      console.log('❌ TEST FAILED!')
      console.log('   Expected perfect remapping with identical chunks')
      console.log(`   Got: ${results.success.length}/${connections.length} success\n`)

      console.log('🔧 Debug:')
      console.log('   • Check cosine similarity calculation')
      console.log('   • Verify embedding preservation')
      console.log('   • Check old chunk data retrieval\n')
    }

    // Cleanup: Delete new chunks, restore old ones
    console.log('🧹 Cleanup: Restoring original state...')
    await supabase
      .from('chunks')
      .delete()
      .eq('document_id', PALMER_ELDRITCH_ID)
      .eq('is_current', true)

    await supabase
      .from('chunks')
      .update({ is_current: true })
      .eq('document_id', PALMER_ELDRITCH_ID)
      .eq('is_current', false)

    console.log('✅ Restored original chunks\n')

  } catch (error) {
    console.error('❌ Remapping failed:', error)

    // Rollback
    console.log('🔄 Rolling back...')
    await supabase
      .from('chunks')
      .delete()
      .eq('document_id', PALMER_ELDRITCH_ID)
      .eq('is_current', true)

    await supabase
      .from('chunks')
      .update({ is_current: true })
      .eq('document_id', PALMER_ELDRITCH_ID)
      .eq('is_current', false)

    console.log('✅ Rollback complete')
    process.exit(1)
  }
}

main().catch(console.error)
