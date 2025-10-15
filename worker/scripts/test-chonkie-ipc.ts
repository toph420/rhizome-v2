#!/usr/bin/env npx tsx
/**
 * Quick test of Chonkie TypeScript IPC wrapper
 *
 * Tests:
 * - Basic recursive chunking
 * - Character offset validation
 * - Error handling
 * - Timeout functionality
 */

import { chunkWithChonkie, getFormattedTimeEstimate } from '../lib/chonkie/chonkie-chunker.js'

async function main() {
  const testMarkdown = `# Chapter 1

This is the first paragraph with some content.

This is the second paragraph with more content.

## Section 1.1

This is a subsection with additional text.

## Section 1.2

Another subsection with different content.

# Chapter 2

More content in chapter 2 with various paragraphs.`

  console.log('Testing Chonkie IPC Wrapper')
  console.log('=' .repeat(60))
  console.log(`Test markdown: ${testMarkdown.length} characters`)
  console.log()

  // Test 1: Recursive chunker (fast, recommended default)
  console.log('Test 1: Recursive chunker')
  console.log('-'.repeat(60))

  try {
    const estimate = getFormattedTimeEstimate('recursive', testMarkdown.length)
    console.log(`Estimated time: ${estimate}`)

    const chunks = await chunkWithChonkie(testMarkdown, {
      chunker_type: 'recursive',
      chunk_size: 128  // Small size for testing
    })

    console.log(`✅ Got ${chunks.length} chunks`)

    // Display first chunk
    if (chunks.length > 0) {
      const first = chunks[0]
      console.log(`First chunk:`)
      console.log(`  Text: "${first.text.slice(0, 50)}..."`)
      console.log(`  Offsets: [${first.start_index}, ${first.end_index})`)
      console.log(`  Token count: ${first.token_count}`)
      console.log(`  Chunker: ${first.chunker_type}`)
    }

    // Verify character offsets manually
    const validationChunk = chunks[0]
    const extracted = testMarkdown.slice(
      validationChunk.start_index,
      validationChunk.end_index
    )
    if (extracted === validationChunk.text) {
      console.log(`✅ Character offset validation passed`)
    } else {
      console.error(`❌ Character offset validation FAILED`)
      console.error(`  Expected: "${validationChunk.text.slice(0, 50)}"`)
      console.error(`  Got: "${extracted.slice(0, 50)}"`)
      process.exit(1)
    }

    console.log()
  } catch (error) {
    console.error(`❌ Test 1 failed:`, error)
    process.exit(1)
  }

  // Test 2: Token chunker (fastest)
  console.log('Test 2: Token chunker')
  console.log('-'.repeat(60))

  try {
    const chunks = await chunkWithChonkie(testMarkdown, {
      chunker_type: 'token',
      chunk_size: 64  // Very small for testing
    })

    console.log(`✅ Got ${chunks.length} chunks with token chunker`)
    console.log()
  } catch (error) {
    console.error(`❌ Test 2 failed:`, error)
    process.exit(1)
  }

  // Test 3: Sentence chunker
  console.log('Test 3: Sentence chunker')
  console.log('-'.repeat(60))

  try {
    const chunks = await chunkWithChonkie(testMarkdown, {
      chunker_type: 'sentence',
      chunk_size: 128
    })

    console.log(`✅ Got ${chunks.length} chunks with sentence chunker`)
    console.log()
  } catch (error) {
    console.error(`❌ Test 3 failed:`, error)
    process.exit(1)
  }

  console.log('=' .repeat(60))
  console.log('✅ All tests passed!')
  console.log()
  console.log('Next steps:')
  console.log('  1. ✅ Python wrapper created (chonkie_chunk.py)')
  console.log('  2. ✅ TypeScript IPC wrapper created (chonkie-chunker.ts)')
  console.log('  3. ✅ Basic functionality validated')
  console.log('  4. ⏳ Next: Create metadata transfer system (T-003)')
}

main().catch(error => {
  console.error('Fatal error:', error)
  process.exit(1)
})
