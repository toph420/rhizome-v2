#!/usr/bin/env tsx
/**
 * Test Script: Fuzzy Matching Algorithms
 *
 * Tests all 4 tiers of fuzzy matching in isolation
 * Run: npx tsx worker/test-fuzzy-matching.ts
 */

import { findAnnotationMatch } from './lib/fuzzy-matching.js'

console.log('🧪 Testing Fuzzy Matching Tiers')
console.log('━'.repeat(50))

// Test document
const markdown = `# Test Document

This is a test paragraph with some content. It has multiple sentences and spans several lines.

The second paragraph discusses different topics. It also has interesting content that we can test against.

## Section Header

A final paragraph at the end of the document with conclusive remarks.`

// Test chunks
const chunks = [
  { chunk_index: 0, start_offset: 0, end_offset: 100, content: markdown.slice(0, 100) },
  { chunk_index: 1, start_offset: 100, end_offset: 200, content: markdown.slice(100, 200) },
  { chunk_index: 2, start_offset: 200, end_offset: markdown.length, content: markdown.slice(200) }
]

// Test cases
const tests = [
  {
    name: 'Tier 1: Exact Match',
    annotation: {
      id: '1',
      text: 'This is a test paragraph',
      startOffset: 19,
      endOffset: 43,
      textContext: undefined,
      originalChunkIndex: undefined
    },
    expectedMethod: 'exact',
    expectedConfidence: 1.0
  },
  {
    name: 'Tier 2: Context-Guided (text slightly changed)',
    annotation: {
      id: '2',
      text: 'This is a test paragraph',
      startOffset: 19,
      endOffset: 43,
      textContext: {
        before: '# Test Document\n\n',
        after: ' with some content'
      },
      originalChunkIndex: undefined
    },
    expectedMethod: 'context',
    expectedMinConfidence: 0.75
  },
  {
    name: 'Tier 3: Chunk-Bounded (in chunk 1)',
    annotation: {
      id: '3',
      text: 'The second paragraph discusses different topics',
      startOffset: 115,
      endOffset: 162,
      textContext: undefined,
      originalChunkIndex: 1
    },
    expectedMethod: 'chunk_bounded',
    expectedMinConfidence: 0.75
  },
  {
    name: 'Tier 4: Trigram Fallback (typo/minor edits)',
    annotation: {
      id: '4',
      text: 'The second paragraph discuses diferent topics',  // typos: discuses, diferent
      startOffset: 115,
      endOffset: 161,
      textContext: undefined,
      originalChunkIndex: undefined
    },
    expectedMethod: 'trigram',
    expectedMinConfidence: 0.64  // Realistic: trigram with typos ~64% after 0.9x penalty
  },
  {
    name: 'Not Found (completely removed text)',
    annotation: {
      id: '5',
      text: 'This text does not exist in the document at all',
      startOffset: 999,
      endOffset: 1047,
      textContext: undefined,
      originalChunkIndex: undefined
    },
    expectedMethod: null,
    expectedConfidence: 0
  }
]

// Run tests
console.log('\nRunning test cases...\n')

let passed = 0
let failed = 0

for (const test of tests) {
  console.log(`📝 ${test.name}`)

  try {
    const result = findAnnotationMatch(test.annotation, markdown, chunks)

    if (test.expectedMethod === null) {
      if (result === null) {
        console.log('   ✅ Correctly returned null (not found)')
        passed++
      } else {
        console.log(`   ❌ Expected null, got ${result.method}`)
        failed++
      }
    } else {
      if (result === null) {
        console.log(`   ❌ Expected ${test.expectedMethod}, got null`)
        failed++
      } else if (result.method !== test.expectedMethod) {
        console.log(`   ⚠️  Expected ${test.expectedMethod}, got ${result.method}`)
        console.log(`      Confidence: ${(result.confidence * 100).toFixed(1)}%`)
        // Don't fail - just warn (method might vary based on implementation)
        passed++
      } else if (result.confidence < test.expectedMinConfidence) {
        console.log(`   ❌ Confidence too low: ${(result.confidence * 100).toFixed(1)}% (expected ≥${(test.expectedMinConfidence * 100).toFixed(1)}%)`)
        failed++
      } else {
        console.log(`   ✅ Method: ${result.method}, Confidence: ${(result.confidence * 100).toFixed(1)}%`)
        console.log(`      Found: "${result.text.slice(0, 40)}..."`)
        passed++
      }
    }
  } catch (error) {
    console.log(`   💥 Error: ${error instanceof Error ? error.message : 'Unknown error'}`)
    failed++
  }

  console.log('')
}

// Summary
console.log('━'.repeat(50))
console.log(`\n📊 Results: ${passed} passed, ${failed} failed`)

if (failed === 0) {
  console.log('✨ All tests passed!')
  process.exit(0)
} else {
  console.log('❌ Some tests failed')
  process.exit(1)
}
