#!/usr/bin/env node
/**
 * Test Docling TypeScript wrapper with detailed logging
 *
 * Usage: npx tsx worker/scripts/test-docling-wrapper.ts <path-to-pdf>
 */

import { extractWithDocling } from '../lib/docling-extractor.js'

const pdfPath = process.argv[2]

if (!pdfPath) {
  console.error('Usage: npx tsx worker/scripts/test-docling-wrapper.ts <path-to-pdf>')
  process.exit(1)
}

console.log('========================================')
console.log('Testing Docling TypeScript Wrapper')
console.log('========================================')
console.log(`PDF: ${pdfPath}\n`)

// Test with chunking enabled (local mode)
console.log('--- Testing with HybridChunker enabled ---\n')

try {
  const result = await extractWithDocling(pdfPath, {
    enableChunking: true,
    chunkSize: 512,
    tokenizer: 'Xenova/all-mpnet-base-v2',
    maxPages: 5, // Limit to 5 pages for testing
    onProgress: (percent, stage, message) => {
      console.log(`[Progress] ${stage}: ${percent}% - ${message}`)
    }
  })

  console.log('\n✓ SUCCESS\n')
  console.log('Result structure:')
  console.log(`  - markdown length: ${result.markdown.length} chars`)
  console.log(`  - total_pages: ${result.structure.total_pages}`)
  console.log(`  - headings: ${result.structure.headings.length}`)
  console.log(`  - chunks: ${result.chunks?.length || 0}`)

  if (result.chunks && result.chunks.length > 0) {
    console.log('\nFirst chunk:')
    console.log(`  - index: ${result.chunks[0].index}`)
    console.log(`  - content length: ${result.chunks[0].content.length}`)
    console.log(`  - page_start: ${result.chunks[0].meta.page_start}`)
    console.log(`  - page_end: ${result.chunks[0].meta.page_end}`)
    console.log(`  - heading_path: ${JSON.stringify(result.chunks[0].meta.heading_path)}`)
    console.log(`  - bboxes: ${result.chunks[0].meta.bboxes?.length || 0}`)
  }

  console.log('\n✓ All tests passed')
} catch (error) {
  console.error('\n✗ ERROR\n')
  console.error(error)
  process.exit(1)
}
