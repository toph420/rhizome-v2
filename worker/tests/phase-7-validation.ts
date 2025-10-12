/**
 * Phase 7: Local Embeddings Validation
 *
 * Validates that the local embeddings pipeline is correctly integrated.
 *
 * Run with: npx tsx worker/tests/phase-7-validation.ts
 */

import { readFileSync } from 'fs'
import { join } from 'path'

console.log('='.repeat(60))
console.log('Phase 7: Local Embeddings Validation')
console.log('='.repeat(60))
console.log()

let passedTests = 0
let totalTests = 0

function testPassed(message: string) {
  passedTests++
  totalTests++
  console.log(`✅ ${message}`)
}

function testFailed(message: string) {
  totalTests++
  console.log(`❌ ${message}`)
}

// Test 1: Validate embeddings-local.ts exists and has required exports
console.log('Test 1: Validate embeddings-local.ts structure')
try {
  const embeddingsLocalPath = join(process.cwd(), 'worker/lib/local/embeddings-local.ts')
  const content = readFileSync(embeddingsLocalPath, 'utf-8')

  const requiredExports = [
    'generateEmbeddingsLocal',
    'generateSingleEmbeddingLocal',
    'clearEmbeddingCache',
    'DEFAULT_LOCAL_CONFIG',
    'LocalEmbeddingConfig'
  ]

  let allExportsFound = true
  for (const exportName of requiredExports) {
    if (!content.includes(exportName)) {
      testFailed(`embeddings-local.ts missing export: ${exportName}`)
      allExportsFound = false
    }
  }

  if (allExportsFound) {
    testPassed('embeddings-local.ts has all required exports')
  }

  // Check for critical configuration
  if (content.includes("model: 'Xenova/all-mpnet-base-v2'")) {
    testPassed('embeddings-local.ts uses correct model (Xenova/all-mpnet-base-v2)')
  } else {
    testFailed('embeddings-local.ts uses wrong model (should be Xenova/all-mpnet-base-v2)')
  }

  if (content.includes("pooling: 'mean'") && content.includes('normalize: true')) {
    testPassed('embeddings-local.ts has correct pooling and normalization config')
  } else {
    testFailed('embeddings-local.ts missing pooling:mean or normalize:true')
  }

  if (content.includes('dimensions: 768')) {
    testPassed('embeddings-local.ts uses correct dimensions (768)')
  } else {
    testFailed('embeddings-local.ts has wrong dimensions (should be 768)')
  }

} catch (error: any) {
  testFailed(`embeddings-local.ts not found or unreadable: ${error.message}`)
}

console.log()

// Test 2: Validate PDF processor integration
console.log('Test 2: Validate PDF processor integration')
try {
  const pdfProcessorPath = join(process.cwd(), 'worker/processors/pdf-processor.ts')
  const content = readFileSync(pdfProcessorPath, 'utf-8')

  if (content.includes("import { generateEmbeddingsLocal } from '../lib/local/embeddings-local.js'")) {
    testPassed('PDF processor imports generateEmbeddingsLocal')
  } else {
    testFailed('PDF processor missing import for generateEmbeddingsLocal')
  }

  if (content.includes("import { generateEmbeddings } from '../lib/embeddings.js'")) {
    testPassed('PDF processor imports generateEmbeddings (fallback)')
  } else {
    testFailed('PDF processor missing import for generateEmbeddings fallback')
  }

  if (content.includes('// Stage 8: Local Embeddings (LOCAL MODE)')) {
    testPassed('PDF processor has Stage 8 embeddings section')
  } else {
    testFailed('PDF processor missing Stage 8 embeddings section')
  }

  if (content.includes('await generateEmbeddingsLocal(chunkContents)')) {
    testPassed('PDF processor calls generateEmbeddingsLocal')
  } else {
    testFailed('PDF processor does not call generateEmbeddingsLocal')
  }

  if (content.includes('await generateEmbeddings(chunkContents)')) {
    testPassed('PDF processor has Gemini fallback')
  } else {
    testFailed('PDF processor missing Gemini fallback')
  }

  if (content.includes("await this.updateProgress(92, 'embeddings', 'processing'")) {
    testPassed('PDF processor has embeddings progress tracking')
  } else {
    testFailed('PDF processor missing embeddings progress tracking')
  }

  // Check for Stage 9 finalization (updated from Stage 8)
  if (content.includes('// Stage 9: Finalize (95-100%)')) {
    testPassed('PDF processor finalization updated to Stage 9')
  } else {
    testFailed('PDF processor finalization not updated to Stage 9')
  }

} catch (error: any) {
  testFailed(`PDF processor validation failed: ${error.message}`)
}

console.log()

// Test 3: Validate EPUB processor integration
console.log('Test 3: Validate EPUB processor integration')
try {
  const epubProcessorPath = join(process.cwd(), 'worker/processors/epub-processor.ts')
  const content = readFileSync(epubProcessorPath, 'utf-8')

  if (content.includes("import { generateEmbeddingsLocal } from '../lib/local/embeddings-local.js'")) {
    testPassed('EPUB processor imports generateEmbeddingsLocal')
  } else {
    testFailed('EPUB processor missing import for generateEmbeddingsLocal')
  }

  if (content.includes("import { generateEmbeddings } from '../lib/embeddings.js'")) {
    testPassed('EPUB processor imports generateEmbeddings (fallback)')
  } else {
    testFailed('EPUB processor missing import for generateEmbeddings fallback')
  }

  if (content.includes('// Stage 8: Local Embeddings (LOCAL MODE)')) {
    testPassed('EPUB processor has Stage 8 embeddings section')
  } else {
    testFailed('EPUB processor missing Stage 8 embeddings section')
  }

  if (content.includes('await generateEmbeddingsLocal(chunkContents)')) {
    testPassed('EPUB processor calls generateEmbeddingsLocal')
  } else {
    testFailed('EPUB processor does not call generateEmbeddingsLocal')
  }

  if (content.includes('await generateEmbeddings(chunkContents)')) {
    testPassed('EPUB processor has Gemini fallback')
  } else {
    testFailed('EPUB processor missing Gemini fallback')
  }

  if (content.includes("await this.updateProgress(92, 'embeddings', 'processing'")) {
    testPassed('EPUB processor has embeddings progress tracking')
  } else {
    testFailed('EPUB processor missing embeddings progress tracking')
  }

  // Check for Stage 9 finalization (updated from Stage 8)
  if (content.includes('// Stage 9: Finalize (95-100%)')) {
    testPassed('EPUB processor finalization updated to Stage 9')
  } else {
    testFailed('EPUB processor finalization not updated to Stage 9')
  }

} catch (error: any) {
  testFailed(`EPUB processor validation failed: ${error.message}`)
}

console.log()

// Test 4: Validate Transformers.js is installed
console.log('Test 4: Validate Transformers.js dependency')
try {
  const packageJsonPath = join(process.cwd(), 'worker/package.json')
  const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'))

  if (packageJson.dependencies && packageJson.dependencies['@huggingface/transformers']) {
    testPassed(`Transformers.js installed (version ${packageJson.dependencies['@huggingface/transformers']})`)
  } else {
    testFailed('Transformers.js not installed in worker/package.json')
  }

} catch (error: any) {
  testFailed(`Package.json validation failed: ${error.message}`)
}

console.log()

// Summary
console.log('='.repeat(60))
console.log('Validation Summary')
console.log('='.repeat(60))
console.log(`Total tests: ${totalTests}`)
console.log(`Passed: ${passedTests}`)
console.log(`Failed: ${totalTests - passedTests}`)

if (passedTests === totalTests) {
  console.log()
  console.log('✅ Phase 7 validation PASSED - All tests successful!')
  console.log()
  console.log('Next steps:')
  console.log('1. Test local embeddings generation:')
  console.log('   cd worker && npx tsx -e "import { generateSingleEmbeddingLocal } from \'./lib/local/embeddings-local.js\'; const e = await generateSingleEmbeddingLocal(\'test\'); console.log(e.length)"')
  console.log()
  console.log('2. Process a document in local mode:')
  console.log('   export PROCESSING_MODE=local')
  console.log('   npm run dev')
  console.log()
  console.log('3. Verify embeddings are 768-dimensional in database')
  process.exit(0)
} else {
  console.log()
  console.log(`❌ Phase 7 validation FAILED - ${totalTests - passedTests} tests failed`)
  console.log()
  console.log('Review the failed tests above and fix issues before proceeding.')
  process.exit(1)
}
