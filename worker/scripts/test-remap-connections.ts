#!/usr/bin/env tsx
/**
 * Test Connection Remapping with Palmer Eldritch
 *
 * CRITICAL TEST - This validates that connections survive document edits
 *
 * Test Flow:
 * 1. Find Palmer Eldritch document
 * 2. Get collision detection results (or run if needed)
 * 3. Create 3 verified connections (semantic, contradiction, thematic_bridge)
 * 4. Edit markdown (add test paragraph to middle)
 * 5. Trigger reprocessing
 * 6. Query remapped connections
 * 7. Verify similarity scores >0.95
 */

import { createClient } from '@supabase/supabase-js'
import { remapConnections } from '../handlers/remap-connections.js'
import { processDocument as runCollisionDetection } from '../engines/orchestrator.js'

const PALMER_ELDRITCH_ID = 'a44b039a-af64-49c1-b53a-8404405c6ad6'
const TEST_PARAGRAPH = `\n\n[TEST PARAGRAPH ADDED FOR REMAPPING TEST]\nThis paragraph was inserted during connection remapping testing to verify that semantic connections can be recovered after document reprocessing. The system should use embedding similarity to remap connections from old chunks to new chunks.\n\n`

const supabase = createClient(
  process.env.SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
)

interface ChunkConnection {
  source_chunk_id: string
  target_chunk_id: string
  connection_type: 'semantic_similarity' | 'contradiction_detection' | 'thematic_bridge'
  strength: number
}

async function main() {
  console.log('🔬 Connection Remapping Test')
  console.log('=============================\n')

  // Step 1: Verify document exists and is processed
  console.log('Step 1: Verifying Palmer Eldritch document...')
  const { data: doc, error: docError } = await supabase
    .from('documents')
    .select('id, title, storage_path')
    .eq('id', PALMER_ELDRITCH_ID)
    .single()

  if (docError || !doc) {
    console.error('❌ Document not found:', docError?.message)
    process.exit(1)
  }

  console.log(`✓ Found: ${doc.title}`)
  console.log(`  ID: ${doc.id}`)
  console.log(`  Storage: ${doc.storage_path}\n`)

  // Step 2: Get chunks
  console.log('Step 2: Fetching chunks...')
  const { data: chunks, error: chunksError } = await supabase
    .from('chunks')
    .select('id, chunk_index, content, summary')
    .eq('document_id', doc.id)
    .eq('is_current', true)
    .order('chunk_index', { ascending: true })

  if (chunksError || !chunks || chunks.length === 0) {
    console.error('❌ No chunks found:', chunksError?.message)
    process.exit(1)
  }

  console.log(`✓ Found ${chunks.length} chunks\n`)

  // Step 3: Check for existing connections
  console.log('Step 3: Checking collision detection results...')
  const { data: existingConnections, error: connError } = await supabase
    .from('chunk_connections')
    .select('id, source_chunk_id, target_chunk_id, engine_type, score')
    .or(`source_chunk_id.in.(${chunks.map(c => c.id).join(',')}),target_chunk_id.in.(${chunks.map(c => c.id).join(',')})`)
    .limit(10)

  if (connError) {
    console.error('❌ Error checking connections:', connError.message)
  }

  if (!existingConnections || existingConnections.length === 0) {
    console.log('⚠️  No connections found. Running collision detection...')

    try {
      const result = await runCollisionDetection(doc.id, {
        enabledEngines: ['semantic_similarity', 'contradiction_detection', 'thematic_bridge']
      })

      console.log(`✓ Collision detection complete:`)
      console.log(`  Total connections: ${result.totalConnections}`)
      console.log(`  By engine:`, result.byEngine)
      console.log('')
    } catch (error) {
      console.error('❌ Collision detection failed:', error)
      console.log('   Continuing with manual connection creation...\n')
    }

    // Re-fetch connections
    const { data: newConnections } = await supabase
      .from('chunk_connections')
      .select('id, source_chunk_id, target_chunk_id, engine_type, score')
      .or(`source_chunk_id.in.(${chunks.map(c => c.id).join(',')}),target_chunk_id.in.(${chunks.map(c => c.id).join(',')})`)
      .order('score', { ascending: false })
      .limit(10)

    if (newConnections && newConnections.length > 0) {
      console.log(`✓ Found ${newConnections.length} connections after detection\n`)
    }
  } else {
    console.log(`✓ Found ${existingConnections.length} existing connections\n`)
  }

  // Step 4: Select 3 diverse connections for testing
  console.log('Step 4: Creating test connections...')

  const testConnections: ChunkConnection[] = []

  // Pick connections from different parts of the book
  const earlyChunk = chunks[Math.floor(chunks.length * 0.2)]
  const midChunk = chunks[Math.floor(chunks.length * 0.5)]
  const lateChunk = chunks[Math.floor(chunks.length * 0.8)]

  const earlyTarget = chunks[Math.floor(chunks.length * 0.3)]
  const midTarget = chunks[Math.floor(chunks.length * 0.6)]
  const lateTarget = chunks[Math.floor(chunks.length * 0.9)]

  testConnections.push(
    {
      source_chunk_id: earlyChunk.id,
      target_chunk_id: earlyTarget.id,
      connection_type: 'semantic_similarity',
      strength: 0.92
    },
    {
      source_chunk_id: midChunk.id,
      target_chunk_id: midTarget.id,
      connection_type: 'contradiction_detection',
      strength: 0.88
    },
    {
      source_chunk_id: lateChunk.id,
      target_chunk_id: lateTarget.id,
      connection_type: 'thematic_bridge',
      strength: 0.85
    }
  )

  // Create verified connections
  for (const conn of testConnections) {
    const { error } = await supabase.from('connections').insert({
      source_chunk_id: conn.source_chunk_id,
      target_chunk_id: conn.target_chunk_id,
      connection_type: conn.connection_type,
      strength: conn.strength,
      user_validated: true,
      metadata: { test: true, created_at: new Date().toISOString() }
    })

    if (error) {
      console.error(`❌ Failed to create connection:`, error.message)
    } else {
      const sourceChunk = chunks.find(c => c.id === conn.source_chunk_id)
      const targetChunk = chunks.find(c => c.id === conn.target_chunk_id)
      console.log(`✓ Created ${conn.connection_type}:`)
      console.log(`  Source: Chunk ${sourceChunk?.chunk_index} - "${sourceChunk?.summary?.slice(0, 60)}..."`)
      console.log(`  Target: Chunk ${targetChunk?.chunk_index} - "${targetChunk?.summary?.slice(0, 60)}..."`)
    }
  }
  console.log('')

  // Step 5: Edit markdown
  console.log('Step 5: Editing markdown (adding test paragraph)...')

  // Download current markdown
  const { data: blob, error: downloadError } = await supabase.storage
    .from('documents')
    .download(`${doc.storage_path}/content.md`)

  if (downloadError || !blob) {
    console.error('❌ Failed to download markdown:', downloadError?.message)
    process.exit(1)
  }

  let markdown = await blob.text()

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
    console.error('❌ Failed to upload edited markdown:', uploadError.message)
    process.exit(1)
  }

  console.log(`✓ Inserted test paragraph at position ${midpoint}`)
  console.log(`  Original length: ${markdown.length} chars`)
  console.log(`  New length: ${editedMarkdown.length} chars`)
  console.log(`  Added: ${editedMarkdown.length - markdown.length} chars\n`)

  // Step 6: Trigger reprocessing
  console.log('Step 6: Triggering reprocessing...')
  console.log('⚠️  TODO: Implement document reprocessing trigger')
  console.log('   For now, manually run: npx tsx worker/handlers/process-document.ts ' + doc.id)
  console.log('\n⏳ Waiting for reprocessing...')
  console.log('   (In production, this would poll job status)\n')

  // Step 7: Verify remapping (after manual reprocessing)
  console.log('Step 7: Verifying connection remapping...')
  console.log('ℹ️  After reprocessing, run this script again with --verify flag\n')

  // Check for remapped connections
  const { data: remappedConnections } = await supabase
    .from('connections')
    .select('*, metadata')
    .eq('user_validated', true)
    .eq('metadata->>test', 'true')

  if (remappedConnections && remappedConnections.length > 0) {
    console.log(`\n✓ Found ${remappedConnections.length} test connections:`)
    remappedConnections.forEach((conn, i) => {
      const isRemapped = conn.metadata?.remapped === true
      const similarity = conn.metadata?.similarity || 0
      const needsReview = conn.metadata?.needs_review === true

      console.log(`\n${i + 1}. ${conn.connection_type}:`)
      console.log(`   Remapped: ${isRemapped ? '✅' : '❌'}`)
      console.log(`   Similarity: ${(similarity * 100).toFixed(1)}%`)
      console.log(`   Needs Review: ${needsReview ? '⚠️  Yes' : '✅ No'}`)

      if (isRemapped && similarity > 0.95) {
        console.log(`   ✅ PASS - High confidence remapping`)
      } else if (isRemapped && similarity > 0.85) {
        console.log(`   ⚠️  REVIEW - Medium confidence remapping`)
      } else {
        console.log(`   ❌ FAIL - Lost or low confidence`)
      }
    })
  } else {
    console.log('⏳ No remapped connections yet. Reprocess the document first.')
  }

  console.log('\n\n📋 Summary')
  console.log('==========')
  console.log('✓ Created 3 test connections')
  console.log('✓ Edited markdown (added test paragraph)')
  console.log('⏳ Waiting for reprocessing')
  console.log('\n📝 Next Steps:')
  console.log('1. Run: npx tsx worker/handlers/process-document.ts ' + doc.id)
  console.log('2. Run: npx tsx worker/scripts/test-remap-connections.ts --verify')
  console.log('3. Verify all 3 connections remapped with >0.95 similarity\n')
}

main().catch(console.error)
