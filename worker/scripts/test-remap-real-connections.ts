#!/usr/bin/env tsx
/**
 * Test Connection Remapping with Real Verified Connections
 *
 * Uses the user's actual starred connections on Palmer Eldritch
 * to test that semantic connection remapping works correctly.
 *
 * Test Flow:
 * 1. Verify 7 existing connections (Palmer Eldritch ↔ Žižek)
 * 2. Edit Palmer Eldritch markdown (add test paragraph)
 * 3. Trigger reprocessing
 * 4. Verify all 7 connections remap with >0.95 similarity
 */

import { createClient } from '@supabase/supabase-js'

const PALMER_ELDRITCH_ID = 'a44b039a-af64-49c1-b53a-8404405c6ad6'
const TEST_PARAGRAPH = `\n\n## [TEST PARAGRAPH FOR CONNECTION REMAPPING]\n\nThis paragraph was inserted to test connection remapping after document reprocessing. The system should use embedding similarity to preserve the 7 verified thematic bridges between Palmer Eldritch and the Žižek document. Each connection explores themes of identity, corporate power, reality manipulation, and psychoanalytic concepts.\n\nKey test: After reprocessing, all 7 connections should remap to semantically similar chunks with >0.95 confidence.\n\n`

const supabase = createClient(
  process.env.SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
)

async function main() {
  console.log('🔬 Connection Remapping Test (Real Data)')
  console.log('=========================================\n')

  // Step 1: Verify document and connections
  console.log('Step 1: Verifying Palmer Eldritch and connections...')

  const { data: doc } = await supabase
    .from('documents')
    .select('id, title, storage_path')
    .eq('id', PALMER_ELDRITCH_ID)
    .single()

  if (!doc) {
    console.error('❌ Document not found')
    process.exit(1)
  }

  console.log(`✓ Document: ${doc.title}`)

  // Get chunks
  const { data: chunks } = await supabase
    .from('chunks')
    .select('id, chunk_index')
    .eq('document_id', doc.id)
    .eq('is_current', true)
    .order('chunk_index', { ascending: true })

  if (!chunks || chunks.length === 0) {
    console.error('❌ No chunks found')
    process.exit(1)
  }

  console.log(`✓ Chunks: ${chunks.length}`)

  // Get verified connections
  const chunkIds = chunks.map(c => c.id)
  const { data: connections } = await supabase
    .from('connections')
    .select(`
      id,
      source_chunk_id,
      target_chunk_id,
      connection_type,
      strength,
      metadata,
      source_chunk:chunks!source_chunk_id(chunk_index, summary),
      target_chunk:chunks!target_chunk_id(chunk_index, summary)
    `)
    .eq('user_validated', true)
    .or(`source_chunk_id.in.(${chunkIds.join(',')})`)

  if (!connections || connections.length === 0) {
    console.error('❌ No verified connections found')
    console.error('   Expected 7 connections from previous check')
    process.exit(1)
  }

  console.log(`✓ Verified connections: ${connections.length}\n`)

  // Display connections
  console.log('📊 Current Connections:')
  connections.forEach((conn, i) => {
    console.log(`${i + 1}. ${conn.connection_type} (${conn.strength.toFixed(2)})`)
    console.log(`   Chunk ${conn.source_chunk?.chunk_index} → Chunk ${conn.target_chunk?.chunk_index}`)
    console.log(`   "${conn.source_chunk?.summary?.slice(0, 50)}..."`)
  })
  console.log('')

  // Step 2: Snapshot current state
  console.log('Step 2: Creating connection snapshot...')
  const connectionSnapshot = connections.map(c => ({
    id: c.id,
    source_chunk_id: c.source_chunk_id,
    target_chunk_id: c.target_chunk_id,
    connection_type: c.connection_type,
    strength: c.strength,
    source_index: c.source_chunk?.chunk_index,
    target_index: c.target_chunk?.chunk_index
  }))

  console.log(`✓ Saved snapshot of ${connectionSnapshot.length} connections\n`)

  // Step 3: Edit markdown
  console.log('Step 3: Editing Palmer Eldritch markdown...')

  const { data: blob, error: downloadError } = await supabase.storage
    .from('documents')
    .download(`${doc.storage_path}/content.md`)

  if (downloadError || !blob) {
    console.error('❌ Failed to download markdown:', downloadError?.message)
    process.exit(1)
  }

  let markdown = await blob.text()
  const originalLength = markdown.length

  // Insert test paragraph at 50% point
  const midpoint = Math.floor(markdown.length / 2)
  const editedMarkdown = markdown.slice(0, midpoint) + TEST_PARAGRAPH + markdown.slice(midpoint)

  // Upload edited markdown
  const { error: uploadError } = await supabase.storage
    .from('documents')
    .update(`${doc.storage_path}/content.md`, editedMarkdown, {
      contentType: 'text/markdown',
      upsert: true
    })

  if (uploadError) {
    console.error('❌ Failed to upload:', uploadError.message)
    process.exit(1)
  }

  console.log(`✓ Inserted test paragraph at position ${midpoint}`)
  console.log(`  Original: ${originalLength.toLocaleString()} chars`)
  console.log(`  Modified: ${editedMarkdown.length.toLocaleString()} chars`)
  console.log(`  Added: ${(editedMarkdown.length - originalLength).toLocaleString()} chars\n`)

  // Step 4: Instructions for reprocessing
  console.log('Step 4: Reprocessing Instructions')
  console.log('==================================\n')

  console.log('⚠️  CRITICAL: You must now reprocess Palmer Eldritch')
  console.log('\n📋 Manual Steps:')
  console.log('1. Open your app and navigate to Palmer Eldritch')
  console.log('2. Trigger document reprocessing (or run worker manually)')
  console.log('3. Wait for processing to complete (~5-15 min)')
  console.log('4. Run verification script below\n')

  console.log('🔧 Alternative: Manual Worker Command:')
  console.log(`   cd worker && npx tsx handlers/process-document.ts ${doc.id}\n`)

  // Step 5: Save verification data
  console.log('Step 5: Saving verification data...')

  const verificationData = {
    document_id: doc.id,
    document_title: doc.title,
    test_timestamp: new Date().toISOString(),
    original_markdown_length: originalLength,
    modified_markdown_length: editedMarkdown.length,
    connections_snapshot: connectionSnapshot,
    expected_connections: connectionSnapshot.length,
    test_paragraph_position: midpoint
  }

  // Save to a JSON file for verification
  const fs = await import('fs/promises')
  const verificationPath = './test-remap-verification.json'
  await fs.writeFile(verificationPath, JSON.stringify(verificationData, null, 2))

  console.log(`✓ Saved verification data to: ${verificationPath}\n`)

  // Step 6: Next steps
  console.log('📝 Next Steps:')
  console.log('=============')
  console.log('1. ✅ Markdown edited (test paragraph added)')
  console.log('2. ⏳ WAITING: Reprocess Palmer Eldritch')
  console.log('3. ⏳ WAITING: Run verification script\n')

  console.log('🔍 After Reprocessing, Run:')
  console.log('   npx tsx worker/scripts/verify-remap-connections.ts\n')

  console.log('✅ Expected Results:')
  console.log(`   • ${connectionSnapshot.length} connections remapped`)
  console.log('   • All similarity scores >0.95')
  console.log('   • No connections lost')
  console.log('   • No "needs review" flags\n')

  console.log('❌ If Test Fails:')
  console.log('   • Check remap-connections.ts embedding similarity logic')
  console.log('   • Verify old chunk embeddings are preserved (is_current=false)')
  console.log('   • Debug cosine distance calculation\n')

  console.log('🎯 This test proves annotation recovery works for cross-document connections!')
}

main().catch(console.error)
