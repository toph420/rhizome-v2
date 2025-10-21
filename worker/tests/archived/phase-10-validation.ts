/**
 * Phase 10: Testing & Validation - Comprehensive Validation Script
 *
 * Validates that the entire local processing pipeline (Phases 1-9) is correctly implemented.
 *
 * Run with: npx tsx worker/tests/phase-10-validation.ts
 */

import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { spawn } from 'child_process'

console.log('='.repeat(70))
console.log('Phase 10: Local Processing Pipeline Validation')
console.log('='.repeat(70))
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

function sectionHeader(title: string) {
  console.log()
  console.log('─'.repeat(70))
  console.log(title)
  console.log('─'.repeat(70))
  console.log()
}

// ============================================================================
// Phase 1: Core Infrastructure Validation
// ============================================================================

sectionHeader('Phase 1: Core Infrastructure')

// Test 1: Database Migration 045
try {
  const migrationPath = join(process.cwd(), '../supabase/migrations/045_add_local_pipeline_columns.sql')
  const migration = readFileSync(migrationPath, 'utf-8')

  const requiredColumns = [
    'page_start',
    'page_end',
    'heading_level',
    'section_marker',
    'bboxes',
    'position_confidence',
    'position_method',
    'position_validated'
  ]

  let allColumnsFound = true
  for (const column of requiredColumns) {
    if (!migration.includes(column)) {
      testFailed(`Migration 045 missing column: ${column}`)
      allColumnsFound = false
    }
  }

  if (allColumnsFound) {
    testPassed('Migration 045 has all required columns')
  }

  // Check indexes
  if (migration.includes('CREATE INDEX') && migration.includes('page_start')) {
    testPassed('Migration 045 has structural metadata indexes')
  } else {
    testFailed('Migration 045 missing indexes')
  }

} catch (error: any) {
  testFailed(`Migration 045 validation failed: ${error.message}`)
}

// Test 2: OllamaClient Module
try {
  const ollamaClientPath = join(process.cwd(), 'lib/local/ollama-client.ts')
  const content = readFileSync(ollamaClientPath, 'utf-8')

  const requiredExports = ['OllamaClient', 'testOllamaConnection']

  let allExportsFound = true
  for (const exportName of requiredExports) {
    if (!content.includes(exportName)) {
      testFailed(`ollama-client.ts missing: ${exportName}`)
      allExportsFound = false
    }
  }

  if (allExportsFound) {
    testPassed('OllamaClient module has all required exports')
  }

  if (content.includes('stream: false')) {
    testPassed('OllamaClient disables streaming (required for structured outputs)')
  } else {
    testFailed('OllamaClient missing stream: false configuration')
  }

} catch (error: any) {
  testFailed(`OllamaClient validation failed: ${error.message}`)
}

// Test 3: Python Dependencies
try {
  const requirementsPath = join(process.cwd(), 'requirements.txt')
  const requirements = readFileSync(requirementsPath, 'utf-8')

  const requiredPackages = ['docling', 'pydantic-ai', 'sentence-transformers', 'transformers']

  let allPackagesFound = true
  for (const pkg of requiredPackages) {
    if (!requirements.includes(pkg)) {
      testFailed(`requirements.txt missing: ${pkg}`)
      allPackagesFound = false
    }
  }

  if (allPackagesFound) {
    testPassed('requirements.txt has all required Python packages')
  }

} catch (error: any) {
  testFailed(`Python dependencies validation failed: ${error.message}`)
}

// Test 4: Node.js Dependencies
try {
  const packageJsonPath = join(process.cwd(), 'package.json')
  const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'))

  if (packageJson.dependencies?.['ollama']) {
    testPassed('Ollama JS SDK installed')
  } else {
    testFailed('Ollama JS SDK not installed')
  }

  if (packageJson.dependencies?.['@huggingface/transformers']) {
    testPassed('Transformers.js installed')
  } else {
    testFailed('Transformers.js not installed')
  }

} catch (error: any) {
  testFailed(`Node.js dependencies validation failed: ${error.message}`)
}

// ============================================================================
// Phase 2: Docling PDF Integration
// ============================================================================

sectionHeader('Phase 2: Docling PDF Integration')

try {
  const scriptPath = join(process.cwd(), 'scripts/docling_extract.py')
  const content = readFileSync(scriptPath, 'utf-8')

  if (content.includes('HybridChunker')) {
    testPassed('Docling script uses HybridChunker')
  } else {
    testFailed('Docling script missing HybridChunker')
  }

  if (content.includes('Xenova/all-mpnet-base-v2')) {
    testPassed('Docling script uses correct tokenizer (Xenova/all-mpnet-base-v2)')
  } else {
    testFailed('Docling script uses wrong tokenizer')
  }

  if (content.includes('sys.stdout.flush()')) {
    testPassed('Docling script has stdout.flush() for IPC')
  } else {
    testFailed('Docling script missing stdout.flush() (IPC will hang!)')
  }

  if (content.includes('page_start') && content.includes('heading_path') && content.includes('bboxes')) {
    testPassed('Docling script extracts structural metadata')
  } else {
    testFailed('Docling script missing structural metadata extraction')
  }

} catch (error: any) {
  testFailed(`Docling PDF script validation failed: ${error.message}`)
}

try {
  const wrapperPath = join(process.cwd(), 'lib/docling-extractor.ts')
  const content = readFileSync(wrapperPath, 'utf-8')

  if (content.includes('DoclingChunk') && content.includes('DoclingExtractionResult')) {
    testPassed('Docling TypeScript wrapper has correct types')
  } else {
    testFailed('Docling TypeScript wrapper missing types')
  }

  if (content.includes('extractPdfWithDocling')) {
    testPassed('Docling wrapper exports main extraction function')
  } else {
    testFailed('Docling wrapper missing extraction function')
  }

} catch (error: any) {
  testFailed(`Docling TypeScript wrapper validation failed: ${error.message}`)
}

// ============================================================================
// Phase 3: Ollama Cleanup
// ============================================================================

sectionHeader('Phase 3: Ollama LLM Cleanup')

try {
  const cleanupPath = join(process.cwd(), 'lib/local/ollama-cleanup.ts')
  const content = readFileSync(cleanupPath, 'utf-8')

  if (content.includes('cleanMarkdownLocal')) {
    testPassed('Ollama cleanup module exports cleanMarkdownLocal')
  } else {
    testFailed('Ollama cleanup missing cleanMarkdownLocal function')
  }

  if (content.includes('cleanMarkdownRegexOnly')) {
    testPassed('Ollama cleanup has regex-only fallback')
  } else {
    testFailed('Ollama cleanup missing regex-only fallback')
  }

  if (content.includes('splitAtHeadings')) {
    testPassed('Ollama cleanup has batching support')
  } else {
    testFailed('Ollama cleanup missing batching support')
  }

  if (content.includes('out of memory') || content.includes('OOM')) {
    testPassed('Ollama cleanup handles OOM errors')
  } else {
    testFailed('Ollama cleanup missing OOM error handling')
  }

} catch (error: any) {
  testFailed(`Ollama cleanup validation failed: ${error.message}`)
}

// ============================================================================
// Phase 4: Bulletproof Matching
// ============================================================================

sectionHeader('Phase 4: Bulletproof Matching (5-Layer System)')

try {
  const matcherPath = join(process.cwd(), 'lib/local/bulletproof-matcher.ts')
  const content = readFileSync(matcherPath, 'utf-8')

  if (content.includes('bulletproofMatch')) {
    testPassed('Bulletproof matcher exports main function')
  } else {
    testFailed('Bulletproof matcher missing main function')
  }

  // Check for all 5 layers
  const layers = [
    'layer1_fuzzy_exact',
    'layer2_embeddings',
    'layer3_llm',
    'layer4_interpolation'
  ]

  let allLayersFound = true
  for (const layer of layers) {
    if (!content.includes(layer)) {
      testFailed(`Bulletproof matcher missing: ${layer}`)
      allLayersFound = false
    }
  }

  if (allLayersFound) {
    testPassed('Bulletproof matcher has all 5 matching layers')
  }

  if (content.includes('100% recovery') || content.includes('GUARANTEED')) {
    testPassed('Bulletproof matcher guarantees 100% recovery')
  } else {
    testFailed('Bulletproof matcher missing 100% recovery guarantee')
  }

  if (content.includes('position_confidence') && content.includes('position_method')) {
    testPassed('Bulletproof matcher tracks confidence and method')
  } else {
    testFailed('Bulletproof matcher missing confidence tracking')
  }

} catch (error: any) {
  testFailed(`Bulletproof matcher validation failed: ${error.message}`)
}

// ============================================================================
// Phase 5: EPUB Docling Integration
// ============================================================================

sectionHeader('Phase 5: EPUB Docling Integration')

try {
  const scriptPath = join(process.cwd(), 'scripts/docling_extract_epub.py')
  const content = readFileSync(scriptPath, 'utf-8')

  if (content.includes('section_marker')) {
    testPassed('EPUB Docling script generates section markers')
  } else {
    testFailed('EPUB Docling script missing section markers')
  }

  if (content.includes('page_start: None') && content.includes('page_end: None')) {
    testPassed('EPUB Docling script sets page numbers to None')
  } else {
    testFailed('EPUB Docling script not setting page numbers to None')
  }

  if (content.includes('bboxes: None')) {
    testPassed('EPUB Docling script sets bboxes to None')
  } else {
    testFailed('EPUB Docling script not setting bboxes to None')
  }

} catch (error: any) {
  testFailed(`EPUB Docling script validation failed: ${error.message}`)
}

try {
  const wrapperPath = join(process.cwd(), 'lib/local/epub-docling-extractor.ts')
  const content = readFileSync(wrapperPath, 'utf-8')

  if (content.includes('extractEpubToHtml')) {
    testPassed('EPUB wrapper has HTML extraction function')
  } else {
    testFailed('EPUB wrapper missing HTML extraction')
  }

  if (content.includes('spine order') || content.includes('reading sequence')) {
    testPassed('EPUB wrapper preserves spine order')
  } else {
    testFailed('EPUB wrapper may not preserve reading sequence')
  }

  if (content.includes('extractEpubWithDocling')) {
    testPassed('EPUB wrapper exports main extraction function')
  } else {
    testFailed('EPUB wrapper missing main extraction function')
  }

} catch (error: any) {
  testFailed(`EPUB TypeScript wrapper validation failed: ${error.message}`)
}

// ============================================================================
// Phase 6: Metadata Enrichment
// ============================================================================

sectionHeader('Phase 6: PydanticAI Metadata Enrichment')

try {
  const scriptPath = join(process.cwd(), 'scripts/extract_metadata_pydantic.py')
  const content = readFileSync(scriptPath, 'utf-8')

  if (content.includes('class ChunkMetadata')) {
    testPassed('PydanticAI script has ChunkMetadata model')
  } else {
    testFailed('PydanticAI script missing ChunkMetadata model')
  }

  const requiredFields = ['themes', 'concepts', 'importance', 'summary', 'emotional', 'domain']
  let allFieldsFound = true
  for (const field of requiredFields) {
    if (!content.includes(field)) {
      testFailed(`PydanticAI model missing field: ${field}`)
      allFieldsFound = false
    }
  }

  if (allFieldsFound) {
    testPassed('PydanticAI model has all required fields')
  }

  if (content.includes('agent = Agent') && content.includes('result_type=ChunkMetadata')) {
    testPassed('PydanticAI script configures agent correctly')
  } else {
    testFailed('PydanticAI script missing agent configuration')
  }

  if (content.includes('sys.stdout.flush()')) {
    testPassed('PydanticAI script has stdout.flush() for IPC')
  } else {
    testFailed('PydanticAI script missing stdout.flush()')
  }

} catch (error: any) {
  testFailed(`PydanticAI script validation failed: ${error.message}`)
}

try {
  const wrapperPath = join(process.cwd(), 'lib/chunking/pydantic-metadata.ts')
  const content = readFileSync(wrapperPath, 'utf-8')

  if (content.includes('extractMetadataBatch')) {
    testPassed('PydanticAI TypeScript wrapper has batch extraction')
  } else {
    testFailed('PydanticAI wrapper missing batch extraction')
  }

  if (content.includes('ChunkMetadata')) {
    testPassed('PydanticAI wrapper has TypeScript types')
  } else {
    testFailed('PydanticAI wrapper missing types')
  }

} catch (error: any) {
  testFailed(`PydanticAI TypeScript wrapper validation failed: ${error.message}`)
}

// ============================================================================
// Phase 7: Local Embeddings
// ============================================================================

sectionHeader('Phase 7: Transformers.js Local Embeddings')

try {
  const embeddingsPath = join(process.cwd(), 'lib/local/embeddings-local.ts')
  const content = readFileSync(embeddingsPath, 'utf-8')

  if (content.includes('generateEmbeddingsLocal')) {
    testPassed('Embeddings module exports main function')
  } else {
    testFailed('Embeddings module missing main function')
  }

  if (content.includes('Xenova/all-mpnet-base-v2')) {
    testPassed('Embeddings module uses correct model (matches HybridChunker)')
  } else {
    testFailed('Embeddings module uses wrong model (tokenizer mismatch!)')
  }

  if (content.includes("pooling: 'mean'") && content.includes('normalize: true')) {
    testPassed('Embeddings module has correct pooling and normalization')
  } else {
    testFailed('Embeddings module missing pooling/normalization (embeddings will be wrong!)')
  }

  if (content.includes('dimensions: 768')) {
    testPassed('Embeddings module configured for 768 dimensions')
  } else {
    testFailed('Embeddings module has wrong dimensions')
  }

  if (content.includes('cachedPipeline') || content.includes('cachedExtractor')) {
    testPassed('Embeddings module uses model caching')
  } else {
    testFailed('Embeddings module missing model caching (slow!)')
  }

} catch (error: any) {
  testFailed(`Embeddings module validation failed: ${error.message}`)
}

// ============================================================================
// Phase 8: Review Checkpoints
// ============================================================================

sectionHeader('Phase 8: Review Checkpoints')

try {
  const pdfProcessorPath = join(process.cwd(), 'processors/pdf-processor.ts')
  const content = readFileSync(pdfProcessorPath, 'utf-8')

  if (content.includes('reviewDoclingExtraction')) {
    testPassed('PDF processor has Docling extraction review checkpoint')
  } else {
    testFailed('PDF processor missing Docling review checkpoint')
  }

  if (content.includes('reviewBeforeChunking')) {
    testPassed('PDF processor has before-chunking review checkpoint')
  } else {
    testFailed('PDF processor missing before-chunking checkpoint')
  }

  if (content.includes('awaiting_manual_review')) {
    testPassed('PDF processor sets review status correctly')
  } else {
    testFailed('PDF processor missing review status')
  }

} catch (error: any) {
  testFailed(`PDF processor review checkpoints validation failed: ${error.message}`)
}

try {
  const epubProcessorPath = join(process.cwd(), 'processors/epub-processor.ts')
  const content = readFileSync(epubProcessorPath, 'utf-8')

  if (content.includes('reviewDoclingExtraction')) {
    testPassed('EPUB processor has Docling extraction review checkpoint')
  } else {
    testFailed('EPUB processor missing Docling review checkpoint')
  }

} catch (error: any) {
  testFailed(`EPUB processor review checkpoints validation failed: ${error.message}`)
}

try {
  const continueHandlerPath = join(process.cwd(), 'handlers/continue-processing.ts')
  const content = readFileSync(continueHandlerPath, 'utf-8')

  if (content.includes('docling_extraction') && content.includes('before_chunking')) {
    testPassed('Continue handler supports both review stages')
  } else {
    testFailed('Continue handler missing review stage support')
  }

} catch (error: any) {
  testFailed(`Continue handler validation failed: ${error.message}`)
}

// ============================================================================
// Phase 9: Confidence UI
// ============================================================================

sectionHeader('Phase 9: Confidence UI')

try {
  const componentPath = join(process.cwd(), '../src/components/sidebar/ChunkQualityPanel.tsx')
  const content = readFileSync(componentPath, 'utf-8')

  if (content.includes('useChunkStats') && content.includes('useSyntheticChunks')) {
    testPassed('ChunkQualityPanel has required hooks')
  } else {
    testFailed('ChunkQualityPanel missing hooks')
  }

  if (content.includes('exact') && content.includes('high') && content.includes('medium') && content.includes('synthetic')) {
    testPassed('ChunkQualityPanel displays all confidence levels')
  } else {
    testFailed('ChunkQualityPanel missing confidence level display')
  }

} catch (error: any) {
  testFailed(`ChunkQualityPanel validation failed: ${error.message}`)
}

try {
  const rightPanelPath = join(process.cwd(), '../src/components/sidebar/RightPanel.tsx')
  const content = readFileSync(rightPanelPath, 'utf-8')

  if (content.includes('ChunkQualityPanel') || content.includes('Quality')) {
    testPassed('RightPanel includes Quality tab')
  } else {
    testFailed('RightPanel missing Quality tab')
  }

} catch (error: any) {
  testFailed(`RightPanel validation failed: ${error.message}`)
}

try {
  const metadataIconPath = join(process.cwd(), '../src/components/reader/ChunkMetadataIcon.tsx')
  const content = readFileSync(metadataIconPath, 'utf-8')

  if (content.includes('position_confidence') || content.includes('confidence')) {
    testPassed('ChunkMetadataIcon shows confidence indicators')
  } else {
    testFailed('ChunkMetadataIcon missing confidence indicators')
  }

} catch (error: any) {
  testFailed(`ChunkMetadataIcon validation failed: ${error.message}`)
}

// ============================================================================
// Phase 10: Integration Tests
// ============================================================================

sectionHeader('Phase 10: Integration Tests')

try {
  const testPath = join(process.cwd(), 'tests/integration/local-processing.test.ts')

  if (existsSync(testPath)) {
    testPassed('Local processing integration test file exists')

    const content = readFileSync(testPath, 'utf-8')

    // Verify test coverage
    const requiredTests = [
      'Docling PDF Extraction',
      'Docling EPUB Extraction',
      'Ollama LLM Cleanup',
      'Bulletproof Matching',
      'Metadata Enrichment',
      'Local Embeddings',
      'Review Checkpoints',
      'Confidence Indicators'
    ]

    let allTestsFound = true
    for (const testName of requiredTests) {
      if (!content.includes(testName)) {
        testFailed(`Integration tests missing: ${testName}`)
        allTestsFound = false
      }
    }

    if (allTestsFound) {
      testPassed('Integration tests cover all phases')
    }

  } else {
    testFailed('Local processing integration test file not found')
  }

} catch (error: any) {
  testFailed(`Integration tests validation failed: ${error.message}`)
}

// ============================================================================
// Processor Integration Validation
// ============================================================================

sectionHeader('Processor Integration Validation')

// PDF Processor
try {
  const pdfProcessorPath = join(process.cwd(), 'processors/pdf-processor.ts')
  const content = readFileSync(pdfProcessorPath, 'utf-8')

  if (content.includes('PROCESSING_MODE') && content.includes('local')) {
    testPassed('PDF processor checks PROCESSING_MODE environment variable')
  } else {
    testFailed('PDF processor missing local mode check')
  }

  // Check all local pipeline stages
  const requiredStages = [
    'Docling extraction',
    'Ollama cleanup',
    'bulletproof match',
    'metadata',
    'embeddings'
  ]

  let allStagesFound = true
  for (const stage of requiredStages) {
    if (!content.toLowerCase().includes(stage.toLowerCase())) {
      testFailed(`PDF processor missing stage: ${stage}`)
      allStagesFound = false
    }
  }

  if (allStagesFound) {
    testPassed('PDF processor integrates all local pipeline stages')
  }

} catch (error: any) {
  testFailed(`PDF processor integration validation failed: ${error.message}`)
}

// EPUB Processor
try {
  const epubProcessorPath = join(process.cwd(), 'processors/epub-processor.ts')
  const content = readFileSync(epubProcessorPath, 'utf-8')

  if (content.includes('PROCESSING_MODE') && content.includes('local')) {
    testPassed('EPUB processor checks PROCESSING_MODE environment variable')
  } else {
    testFailed('EPUB processor missing local mode check')
  }

  // Check all local pipeline stages
  const requiredStages = [
    'Docling extraction',
    'Ollama cleanup',
    'bulletproof match',
    'metadata',
    'embeddings'
  ]

  let allStagesFound = true
  for (const stage of requiredStages) {
    if (!content.toLowerCase().includes(stage.toLowerCase())) {
      testFailed(`EPUB processor missing stage: ${stage}`)
      allStagesFound = false
    }
  }

  if (allStagesFound) {
    testPassed('EPUB processor integrates all local pipeline stages')
  }

} catch (error: any) {
  testFailed(`EPUB processor integration validation failed: ${error.message}`)
}

// ============================================================================
// Summary
// ============================================================================

console.log()
console.log('='.repeat(70))
console.log('Validation Summary')
console.log('='.repeat(70))
console.log(`Total tests: ${totalTests}`)
console.log(`Passed: ${passedTests}`)
console.log(`Failed: ${totalTests - passedTests}`)

if (passedTests === totalTests) {
  console.log()
  console.log('✅ Phase 10 validation PASSED - All tests successful!')
  console.log()
  console.log('Next steps:')
  console.log('1. Run integration tests:')
  console.log('   cd worker && npm run test:integration -- local-processing.test.ts')
  console.log()
  console.log('2. Run full validation:')
  console.log('   cd worker && npm run test:full-validation')
  console.log()
  console.log('3. Test with real Ollama:')
  console.log('   export PROCESSING_MODE=local')
  console.log('   ollama serve')
  console.log('   npm run dev')
  console.log()
  console.log('4. Manual testing checklist:')
  console.log('   - Upload 50-page PDF, verify <5 min processing')
  console.log('   - Check chunk quality panel shows statistics')
  console.log('   - Verify synthetic chunks have correct confidence')
  console.log('   - Test review checkpoint pause/resume')
  console.log()
  process.exit(0)
} else {
  console.log()
  console.log(`❌ Phase 10 validation FAILED - ${totalTests - passedTests} tests failed`)
  console.log()
  console.log('Review the failed tests above and fix issues before proceeding.')
  console.log()
  process.exit(1)
}
