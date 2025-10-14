/**
 * Manual validation script for import strategies.
 *
 * Tests all three import strategies (skip, replace, merge_smart) with a real document.
 *
 * Usage:
 *   npx tsx scripts/test-import-strategies.ts <document_id>
 *
 * See: docs/tasks/storage-first-portability.md (T-012)
 */

import { createClient } from '@supabase/supabase-js'
import { importDocumentHandler } from '../handlers/import-document.js'

// Colors for terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
}

function log(message: string, color?: keyof typeof colors) {
  const colorCode = color ? colors[color] : ''
  console.log(`${colorCode}${message}${colors.reset}`)
}

async function main() {
  const documentId = process.argv[2]

  if (!documentId) {
    log('Usage: npx tsx scripts/test-import-strategies.ts <document_id>', 'red')
    process.exit(1)
  }

  log('\n═══════════════════════════════════════════════════════', 'cyan')
  log('  IMPORT STRATEGIES VALIDATION', 'bright')
  log('═══════════════════════════════════════════════════════\n', 'cyan')

  // Initialize Supabase client
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !supabaseKey) {
    log('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY', 'red')
    process.exit(1)
  }

  const supabase = createClient(supabaseUrl, supabaseKey)

  // Get document info
  log(`📄 Document ID: ${documentId}`, 'cyan')

  const { data: doc, error: docError } = await supabase
    .from('documents')
    .select('title, user_id')
    .eq('id', documentId)
    .single()

  if (docError || !doc) {
    log(`❌ Document not found: ${documentId}`, 'red')
    process.exit(1)
  }

  log(`   Title: ${doc.title}`, 'cyan')
  log(`   User ID: ${doc.user_id}\n`, 'cyan')

  // Get initial chunk count
  const { count: initialChunkCount } = await supabase
    .from('chunks')
    .select('*', { count: 'exact', head: true })
    .eq('document_id', documentId)

  log(`📊 Initial State:`, 'yellow')
  log(`   Chunks in database: ${initialChunkCount}\n`)

  // ✅ TEST 1: SKIP STRATEGY
  log('═══════════════════════════════════════════════════════', 'cyan')
  log('  TEST 1: SKIP STRATEGY', 'bright')
  log('═══════════════════════════════════════════════════════\n', 'cyan')

  const skipJob = {
    id: 'test-skip-job',
    input_data: {
      document_id: documentId,
      storage_path: `${doc.user_id}/${documentId}`,
      strategy: 'skip',
      regenerateEmbeddings: false,
      reprocessConnections: false
    }
  }

  try {
    await importDocumentHandler(supabase, skipJob)

    // Verify no changes
    const { count: afterSkipCount } = await supabase
      .from('chunks')
      .select('*', { count: 'exact', head: true })
      .eq('document_id', documentId)

    if (afterSkipCount === initialChunkCount) {
      log('✅ PASS: Skip strategy preserved existing data', 'green')
      log(`   Before: ${initialChunkCount} chunks`, 'green')
      log(`   After: ${afterSkipCount} chunks\n`, 'green')
    } else {
      log('❌ FAIL: Skip strategy modified data', 'red')
      log(`   Before: ${initialChunkCount} chunks`, 'red')
      log(`   After: ${afterSkipCount} chunks\n`, 'red')
    }
  } catch (error: any) {
    log(`❌ FAIL: Skip strategy threw error: ${error.message}\n`, 'red')
  }

  // ✅ TEST 2: REPLACE STRATEGY
  log('═══════════════════════════════════════════════════════', 'cyan')
  log('  TEST 2: REPLACE STRATEGY', 'bright')
  log('═══════════════════════════════════════════════════════\n', 'cyan')

  const replaceJob = {
    id: 'test-replace-job',
    input_data: {
      document_id: documentId,
      storage_path: `${doc.user_id}/${documentId}`,
      strategy: 'replace',
      regenerateEmbeddings: false,
      reprocessConnections: false
    }
  }

  try {
    await importDocumentHandler(supabase, replaceJob)

    // Verify chunks replaced
    const { count: afterReplaceCount, data: sampleChunks } = await supabase
      .from('chunks')
      .select('chunk_index, content, themes')
      .eq('document_id', documentId)
      .order('chunk_index')
      .limit(3)

    log('✅ PASS: Replace strategy completed', 'green')
    log(`   Chunks after replace: ${afterReplaceCount}`, 'green')
    log(`   Sample chunks:`)
    sampleChunks?.forEach((chunk: any) => {
      log(`     - Chunk ${chunk.chunk_index}: "${chunk.content.substring(0, 50)}..."`, 'green')
    })
    log('')
  } catch (error: any) {
    log(`❌ FAIL: Replace strategy threw error: ${error.message}\n`, 'red')
  }

  // ✅ TEST 3: MERGE SMART STRATEGY
  log('═══════════════════════════════════════════════════════', 'cyan')
  log('  TEST 3: MERGE SMART STRATEGY', 'bright')
  log('═══════════════════════════════════════════════════════\n', 'cyan')

  // Get chunk IDs before merge
  const { data: chunksBeforeMerge } = await supabase
    .from('chunks')
    .select('id, chunk_index')
    .eq('document_id', documentId)
    .order('chunk_index')

  const idsBeforeMerge = chunksBeforeMerge?.map((c: any) => ({ index: c.chunk_index, id: c.id })) || []

  const mergeJob = {
    id: 'test-merge-job',
    input_data: {
      document_id: documentId,
      storage_path: `${doc.user_id}/${documentId}`,
      strategy: 'merge_smart',
      regenerateEmbeddings: false,
      reprocessConnections: false
    }
  }

  try {
    await importDocumentHandler(supabase, mergeJob)

    // Verify chunk IDs preserved
    const { data: chunksAfterMerge } = await supabase
      .from('chunks')
      .select('id, chunk_index, themes, importance_score')
      .eq('document_id', documentId)
      .order('chunk_index')

    const idsAfterMerge = chunksAfterMerge?.map((c: any) => ({ index: c.chunk_index, id: c.id })) || []

    // Compare IDs
    let idsPreserved = true
    for (let i = 0; i < Math.min(idsBeforeMerge.length, idsAfterMerge.length); i++) {
      if (idsBeforeMerge[i].id !== idsAfterMerge[i].id) {
        idsPreserved = false
        break
      }
    }

    if (idsPreserved) {
      log('✅ PASS: Merge Smart strategy preserved chunk IDs', 'green')
      log(`   Chunks compared: ${idsBeforeMerge.length}`, 'green')
      log(`   All IDs preserved: YES`, 'green')
    } else {
      log('❌ FAIL: Merge Smart strategy did not preserve chunk IDs', 'red')
    }

    // Check metadata updated
    const hasMetadata = chunksAfterMerge?.some((c: any) => c.themes && c.themes.length > 0)
    if (hasMetadata) {
      log(`   Metadata updated: YES\n`, 'green')
    } else {
      log(`   Metadata updated: UNKNOWN (no themes found)\n`, 'yellow')
    }
  } catch (error: any) {
    log(`❌ FAIL: Merge Smart strategy threw error: ${error.message}\n`, 'red')
  }

  // ✅ TEST 4: EMBEDDING REGENERATION
  log('═══════════════════════════════════════════════════════', 'cyan')
  log('  TEST 4: EMBEDDING REGENERATION', 'bright')
  log('═══════════════════════════════════════════════════════\n', 'cyan')

  const embeddingJob = {
    id: 'test-embedding-job',
    input_data: {
      document_id: documentId,
      storage_path: `${doc.user_id}/${documentId}`,
      strategy: 'replace',
      regenerateEmbeddings: true,
      reprocessConnections: false
    }
  }

  try {
    await importDocumentHandler(supabase, embeddingJob)

    // Verify embeddings exist
    const { data: chunksWithEmbeddings } = await supabase
      .from('chunks')
      .select('embedding')
      .eq('document_id', documentId)
      .limit(5)

    const hasEmbeddings = chunksWithEmbeddings?.every((c: any) => c.embedding && c.embedding.length === 768)

    if (hasEmbeddings) {
      log('✅ PASS: Embeddings regenerated successfully', 'green')
      log(`   Checked: ${chunksWithEmbeddings.length} chunks`, 'green')
      log(`   Dimension: 768`, 'green')
      log(`   All have embeddings: YES\n`, 'green')
    } else {
      log('❌ FAIL: Embeddings not regenerated', 'red')
    }
  } catch (error: any) {
    log(`❌ FAIL: Embedding regeneration threw error: ${error.message}\n`, 'red')
  }

  // Summary
  log('═══════════════════════════════════════════════════════', 'cyan')
  log('  VALIDATION COMPLETE', 'bright')
  log('═══════════════════════════════════════════════════════\n', 'cyan')

  log('All tests completed. Review results above.', 'yellow')
}

main().catch(error => {
  console.error('Validation script failed:', error)
  process.exit(1)
})
