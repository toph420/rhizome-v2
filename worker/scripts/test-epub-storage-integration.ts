/**
 * Test script to validate EPUB processor storage integration
 *
 * This script validates that all saveStageResult checkpoints are properly integrated
 * into the EPUB processor and that files are saved to Storage correctly.
 *
 * Usage: npx tsx scripts/test-epub-storage-integration.ts <document_id> <user_id>
 */

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL || 'http://localhost:54321'
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

if (!SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Error: SUPABASE_SERVICE_ROLE_KEY environment variable is required')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

/**
 * Validate storage integration by checking for expected files
 */
async function validateStorageIntegration(documentId: string, storagePath: string): Promise<void> {
  console.log('\n=== Validating Storage Integration ===')
  console.log(`Document ID: ${documentId}`)
  console.log(`Storage Path: ${storagePath}`)

  // Expected files based on T-005 requirements
  const expectedFiles = {
    // Intermediate stage files
    'stage-extraction.json': 'Extraction checkpoint (LOCAL mode)',
    'stage-cleanup.json': 'Cleanup checkpoint (LOCAL mode)',
    'stage-chunking.json': 'Chunking checkpoint',

    // Final files (all modes)
    'chunks.json': 'Final chunks with embeddings',
    'markdown.json': 'Final markdown',
    'manifest.json': 'Processing manifest',
    'metadata.json': 'Metadata (LOCAL mode)',

    // LOCAL mode only
    'cached_chunks.json': 'Docling extraction cache (LOCAL mode)'
  }

  console.log('\nChecking for expected files...')

  let foundCount = 0
  let missingCount = 0

  for (const [filename, description] of Object.entries(expectedFiles)) {
    const { data, error } = await supabase.storage
      .from('documents')
      .list(storagePath, {
        search: filename
      })

    if (error) {
      console.error(`❌ Error checking ${filename}: ${error.message}`)
      continue
    }

    const found = data && data.length > 0

    if (found) {
      const file = data[0]
      console.log(`✅ ${filename} - ${description} (${file.metadata?.size || '?'} bytes)`)
      foundCount++
    } else {
      // Some files are optional (stage files, cached_chunks in cloud mode)
      if (filename.startsWith('stage-') || filename === 'cached_chunks.json' || filename === 'metadata.json') {
        console.log(`ℹ️  ${filename} - ${description} (optional, not found)`)
      } else {
        console.log(`⚠️  ${filename} - ${description} (expected, not found)`)
        missingCount++
      }
    }
  }

  console.log(`\n📊 Summary:`)
  console.log(`  Found: ${foundCount} files`)
  console.log(`  Missing critical files: ${missingCount}`)

  if (missingCount === 0) {
    console.log('\n✅ Storage integration validation PASSED')
  } else {
    console.log('\n⚠️  Storage integration validation has warnings')
  }
}

/**
 * Main function
 */
async function main() {
  console.log('EPUB Processor Storage Integration Test')
  console.log('======================================\n')

  // Example document ID and storage path
  // In real testing, you would process an EPUB and get these from the result
  const documentId = process.argv[2] || 'test-document-id'
  const userId = process.argv[3] || 'dev-user-123'
  const storagePath = `documents/${userId}/${documentId}`

  console.log('Instructions:')
  console.log('1. Process an EPUB document (either LOCAL or CLOUD mode)')
  console.log('2. Run this script with the document ID:')
  console.log(`   npx tsx scripts/test-epub-storage-integration.ts <document_id> <user_id>`)
  console.log('')

  await validateStorageIntegration(documentId, storagePath)
}

main().catch(console.error)
