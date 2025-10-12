/**
 * Test Local Embeddings Generation
 *
 * Tests that Transformers.js can generate 768-dimensional embeddings.
 *
 * Run with: npx tsx worker/tests/test-local-embeddings.ts
 */

import { generateSingleEmbeddingLocal, clearEmbeddingCache } from '../lib/local/embeddings-local.js'

console.log('='.repeat(60))
console.log('Testing Local Embedding Generation (Transformers.js)')
console.log('='.repeat(60))
console.log()

console.log('⚠️  Note: Model download (~420MB) will occur on first run')
console.log('⚠️  This may take 1-2 minutes depending on your connection')
console.log()

const testContent = 'Machine learning is transforming the field of artificial intelligence by enabling computers to learn patterns from data.'

async function runTest() {
  try {
    console.log('Generating embedding for test content...')
    console.log()

    const startTime = Date.now()
    const embedding = await generateSingleEmbeddingLocal(testContent)
    const duration = Date.now() - startTime

    console.log('✅ Embedding generated successfully!')
    console.log(`⏱️  Time: ${(duration / 1000).toFixed(1)}s`)
    console.log()

    // Validate dimensions
    console.log('Validation Results:')
    console.log(`- Dimensions: ${embedding.length} (expected: 768)`)
    console.log(`- All values are numbers: ${embedding.every(v => typeof v === 'number')}`)
    console.log(`- No NaN values: ${embedding.every(v => Number.isFinite(v))}`)
    console.log(`- First 5 values: [${embedding.slice(0, 5).map(v => v.toFixed(4)).join(', ')}]`)
    console.log()

    if (embedding.length !== 768) {
      throw new Error(`Wrong dimensions: ${embedding.length} (expected 768)`)
    }

    if (!embedding.every(v => typeof v === 'number' && Number.isFinite(v))) {
      throw new Error('Invalid embedding values (contains non-numeric or NaN)')
    }

    console.log('✅ Phase 7 Local Embeddings Test PASSED')
    console.log()
    console.log('Next steps:')
    console.log('1. Set PROCESSING_MODE=local in your environment')
    console.log('2. Process a document and verify embeddings are stored in database')
    console.log('3. Check that embeddings have 768 dimensions in chunks table')
    console.log()

    // Clean up cache for memory
    clearEmbeddingCache()

    process.exit(0)

  } catch (error: any) {
    console.error()
    console.error('❌ Test FAILED')
    console.error(`Error: ${error.message}`)
    console.error()
    console.error('Troubleshooting:')
    console.error('1. Check internet connection (model must download on first run)')
    console.error('2. Ensure @huggingface/transformers is installed: npm list @huggingface/transformers')
    console.error('3. Check available disk space (~500MB needed for model)')
    console.error()

    process.exit(1)
  }
}

runTest()
