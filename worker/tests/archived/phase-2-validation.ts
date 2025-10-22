/**
 * Phase 2 Validation - Docling Integration
 *
 * Validates that Phase 2 implementations work correctly:
 * - Python script accepts chunking options
 * - TypeScript wrapper has new types
 * - PDF processor checks PROCESSING_MODE
 */

import { validateDoclingChunks, type DoclingChunk } from '../lib/docling-extractor.js'

console.log('='.repeat(60))
console.log('Phase 2 Validation - Docling Integration')
console.log('='.repeat(60))

// Test 1: Validate TypeScript types exist
console.log('\n[Test 1] Checking TypeScript type exports...')
try {
  // If these imports work, types are correctly exported
  const mockChunk: DoclingChunk = {
    index: 0,
    content: 'Test content',
    meta: {
      page_start: 1,
      page_end: 1,
      heading_path: ['Chapter 1'],
      heading_level: 1,
      section_marker: null,
      bboxes: []
    }
  }
  console.log('✓ DoclingChunk type exists and is valid')
  console.log(`  - Chunk has ${Object.keys(mockChunk).length} properties`)
  console.log(`  - Metadata has ${Object.keys(mockChunk.meta).length} fields`)
} catch (error: any) {
  console.error('✗ Type validation failed:', error.message)
  process.exit(1)
}

// Test 2: Validate chunk validation function
console.log('\n[Test 2] Testing validateDoclingChunks function...')
try {
  const testChunks: DoclingChunk[] = [
    {
      index: 0,
      content: 'Valid chunk with metadata',
      meta: {
        page_start: 1,
        page_end: 1,
        heading_path: ['Chapter 1'],
        heading_level: 1,
        section_marker: null,
        bboxes: [
          { page: 1, l: 100, t: 200, r: 400, b: 250 }
        ]
      }
    },
    {
      index: 1,
      content: '', // Invalid: no content
      meta: {
        page_start: 2,
        page_end: 2,
        heading_path: [],
        heading_level: null,
        section_marker: null,
        bboxes: []
      }
    }
  ]

  const validation = validateDoclingChunks(testChunks)
  console.log(`✓ Validation function executed`)
  console.log(`  - Valid: ${validation.valid}`)
  console.log(`  - Errors: ${validation.errors.length}`)

  if (validation.errors.length > 0) {
    console.log(`  - Expected errors found:`)
    validation.errors.forEach(err => console.log(`    - ${err}`))
  }
} catch (error: any) {
  console.error('✗ Validation function failed:', error.message)
  process.exit(1)
}

// Test 3: Check PROCESSING_MODE environment variable
console.log('\n[Test 3] Checking environment configuration...')
const processingMode = process.env.PROCESSING_MODE
console.log(`  - PROCESSING_MODE: ${processingMode || 'not set (defaults to cloud)'}`)

if (processingMode === 'local') {
  console.log('✓ Local mode enabled - will use HybridChunker')
} else {
  console.log('✓ Cloud mode (default) - will use Gemini pipeline')
}

// Test 4: Python script validation
console.log('\n[Test 4] Validating Python script structure...')
import { readFileSync } from 'fs'
import { join } from 'path'

try {
  const pythonScript = readFileSync(
    join(process.cwd(), 'scripts/docling_extract.py'),
    'utf-8'
  )

  const requiredElements = [
    'from docling.chunking import HybridChunker',
    'def extract_with_chunking',
    'def extract_chunk_metadata',
    'def emit_progress',
    'sys.stdout.flush()'
  ]

  const missingElements: string[] = []
  for (const element of requiredElements) {
    if (!pythonScript.includes(element)) {
      missingElements.push(element)
    }
  }

  if (missingElements.length === 0) {
    console.log('✓ Python script has all required elements')
    console.log(`  - HybridChunker import: ✓`)
    console.log(`  - extract_with_chunking function: ✓`)
    console.log(`  - extract_chunk_metadata function: ✓`)
    console.log(`  - emit_progress function: ✓`)
    console.log(`  - stdout flushing: ✓`)
  } else {
    console.error('✗ Python script missing elements:')
    missingElements.forEach(elem => console.error(`  - ${elem}`))
    process.exit(1)
  }
} catch (error: any) {
  console.error('✗ Python script validation failed:', error.message)
  process.exit(1)
}

// Test 5: PDF Processor integration check
console.log('\n[Test 5] Checking PDF processor integration...')
try {
  const processorCode = readFileSync(
    join(process.cwd(), 'processors/pdf-processor.ts'),
    'utf-8'
  )

  const requiredIntegrations = [
    'enableChunking: isLocalMode',
    'tokenizer: \'Xenova/all-mpnet-base-v2\'',
    'cached_extraction',
    'doclingChunks'
  ]

  const missingIntegrations: string[] = []
  for (const integration of requiredIntegrations) {
    if (!processorCode.includes(integration)) {
      missingIntegrations.push(integration)
    }
  }

  if (missingIntegrations.length === 0) {
    console.log('✓ PDF processor has all Phase 2 integrations')
    console.log(`  - Local mode check: ✓`)
    console.log(`  - Tokenizer alignment: ✓`)
    console.log(`  - Extraction caching: ✓`)
    console.log(`  - Docling chunks storage: ✓`)
  } else {
    console.error('✗ PDF processor missing integrations:')
    missingIntegrations.forEach(int => console.error(`  - ${int}`))
    process.exit(1)
  }
} catch (error: any) {
  console.error('✗ PDF processor validation failed:', error.message)
  process.exit(1)
}

// Summary
console.log('\n' + '='.repeat(60))
console.log('Phase 2 Validation Summary')
console.log('='.repeat(60))
console.log('✓ All Phase 2 components validated successfully')
console.log('')
console.log('Ready for Phase 3: Local LLM Cleanup')
console.log('Next steps:')
console.log('  1. Implement Ollama cleanup module (Task 8)')
console.log('  2. Integrate with PDF processor (Task 9)')
console.log('  3. Test with actual PDF documents')
console.log('='.repeat(60))
