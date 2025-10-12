#!/usr/bin/env node
/**
 * Test Docling TypeScript wrapper WITHOUT max_pages limit
 */

import { extractWithDocling } from '../lib/docling-extractor.js'

const pdfPath = process.argv[2]

if (!pdfPath) {
  console.error('Usage: npx tsx worker/scripts/test-docling-wrapper-full.ts <path-to-pdf>')
  process.exit(1)
}

console.log('========================================')
console.log('Testing Docling TypeScript Wrapper (Full PDF)')
console.log('========================================')
console.log(`PDF: ${pdfPath}\n`)

console.log('--- Testing with HybridChunker (NO max_pages limit) ---\n')

try {
  const result = await extractWithDocling(pdfPath, {
    enableChunking: true,
    chunkSize: 512,
    tokenizer: 'Xenova/all-mpnet-base-v2',
    // NO max_pages limit
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
    console.log('\nFirst 3 chunks:')
    for (let i = 0; i < Math.min(3, result.chunks.length); i++) {
      const chunk = result.chunks[i]
      console.log(`\nChunk ${i}:`)
      console.log(`  - index: ${chunk.index}`)
      console.log(`  - content length: ${chunk.content.length}`)
      console.log(`  - content preview: ${chunk.content.substring(0, 80)}...`)
      console.log(`  - page_start: ${chunk.meta.page_start}`)
      console.log(`  - page_end: ${chunk.meta.page_end}`)
      console.log(`  - heading_path: ${JSON.stringify(chunk.meta.heading_path)}`)
      console.log(`  - bboxes: ${chunk.meta.bboxes?.length || 0}`)
    }
  }

  console.log('\n✓ All tests passed')
} catch (error) {
  console.error('\n✗ ERROR\n')
  console.error(error)
  process.exit(1)
}
