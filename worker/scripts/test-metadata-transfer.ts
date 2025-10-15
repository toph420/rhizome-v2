#!/usr/bin/env npx tsx
/**
 * Test script for metadata transfer system.
 *
 * Validates overlap detection, metadata aggregation, and confidence scoring.
 * Tests with mock data to ensure all functions work correctly before integration.
 *
 * Usage:
 *   npx tsx scripts/test-metadata-transfer.ts
 */

import type { MatchResult } from '../lib/local/bulletproof-matcher.js'
import type { ChonkieChunk } from '../lib/chonkie/types.js'
import {
  hasOverlap,
  calculateOverlapPercentage,
  aggregateMetadata,
  calculateConfidence,
  transferMetadataToChonkieChunks
} from '../lib/chonkie/metadata-transfer.js'

// ============================================================================
// Mock Data
// ============================================================================

/**
 * Create mock Docling chunk (MatchResult from bulletproof matcher).
 */
function createMockDoclingChunk(
  index: number,
  start: number,
  end: number,
  heading: string[] = [],
  page_start: number | null = null
): MatchResult {
  return {
    chunk: {
      index,
      content: `Docling chunk ${index}`,
      meta: {
        heading_path: heading.length > 0 ? heading : null,
        page_start,
        page_end: page_start,
        section_marker: null,
        bboxes: null,
        heading_level: heading.length
      }
    },
    start_offset: start,
    end_offset: end,
    confidence: 'high',
    method: 'exact_match',
    similarity: 1.0
  }
}

/**
 * Create mock Chonkie chunk.
 */
function createMockChonkieChunk(
  start: number,
  end: number
): ChonkieChunk {
  return {
    text: `Chonkie chunk text`,
    start_index: start,
    end_index: end,
    token_count: 100,
    chunker_type: 'recursive'
  }
}

// ============================================================================
// Tests
// ============================================================================

function testHasOverlap() {
  console.log('\n=== Test: hasOverlap() ===')

  // Test 1: Clear overlap
  const docling1 = createMockDoclingChunk(0, 0, 100)
  const chonkie1 = createMockChonkieChunk(50, 150)
  console.log(`Test 1 (clear overlap): ${hasOverlap(docling1, chonkie1) ? '✓ PASS' : '✗ FAIL'}`)

  // Test 2: No overlap (before)
  const docling2 = createMockDoclingChunk(0, 0, 50)
  const chonkie2 = createMockChonkieChunk(100, 150)
  console.log(`Test 2 (no overlap - before): ${!hasOverlap(docling2, chonkie2) ? '✓ PASS' : '✗ FAIL'}`)

  // Test 3: No overlap (after)
  const docling3 = createMockDoclingChunk(0, 200, 250)
  const chonkie3 = createMockChonkieChunk(100, 150)
  console.log(`Test 3 (no overlap - after): ${!hasOverlap(docling3, chonkie3) ? '✓ PASS' : '✗ FAIL'}`)

  // Test 4: Exact match (complete overlap)
  const docling4 = createMockDoclingChunk(0, 100, 200)
  const chonkie4 = createMockChonkieChunk(100, 200)
  console.log(`Test 4 (exact match): ${hasOverlap(docling4, chonkie4) ? '✓ PASS' : '✗ FAIL'}`)

  // Test 5: Partial overlap (Chonkie extends past Docling)
  const docling5 = createMockDoclingChunk(0, 0, 100)
  const chonkie5 = createMockChonkieChunk(80, 150)
  console.log(`Test 5 (partial overlap): ${hasOverlap(docling5, chonkie5) ? '✓ PASS' : '✗ FAIL'}`)
}

function testCalculateOverlapPercentage() {
  console.log('\n=== Test: calculateOverlapPercentage() ===')

  // Test 1: 100% overlap (Docling completely covers Chonkie)
  const docling1 = createMockDoclingChunk(0, 0, 200)
  const chonkie1 = createMockChonkieChunk(50, 150)  // 100 chars
  const overlap1 = calculateOverlapPercentage(docling1, chonkie1)
  console.log(`Test 1 (100% overlap): ${overlap1 === 1.0 ? '✓ PASS' : `✗ FAIL (got ${overlap1})`}`)

  // Test 2: 50% overlap
  const docling2 = createMockDoclingChunk(0, 0, 50)
  const chonkie2 = createMockChonkieChunk(0, 100)  // 100 chars, 50 overlap
  const overlap2 = calculateOverlapPercentage(docling2, chonkie2)
  console.log(`Test 2 (50% overlap): ${overlap2 === 0.5 ? '✓ PASS' : `✗ FAIL (got ${overlap2})`}`)

  // Test 3: 0% overlap (no overlap)
  const docling3 = createMockDoclingChunk(0, 0, 50)
  const chonkie3 = createMockChonkieChunk(100, 200)
  const overlap3 = calculateOverlapPercentage(docling3, chonkie3)
  console.log(`Test 3 (0% overlap): ${overlap3 === 0 ? '✓ PASS' : `✗ FAIL (got ${overlap3})`}`)

  // Test 4: 70% overlap (high confidence threshold)
  const docling4 = createMockDoclingChunk(0, 0, 70)
  const chonkie4 = createMockChonkieChunk(0, 100)  // 100 chars, 70 overlap
  const overlap4 = calculateOverlapPercentage(docling4, chonkie4)
  console.log(`Test 4 (70% overlap): ${overlap4 === 0.7 ? '✓ PASS' : `✗ FAIL (got ${overlap4})`}`)
}

function testAggregateMetadata() {
  console.log('\n=== Test: aggregateMetadata() ===')

  // Test 1: Single chunk (simple case)
  const docling1 = createMockDoclingChunk(0, 0, 100, ['Chapter 1'], 1)
  const metadata1 = aggregateMetadata([docling1])
  console.log(`Test 1 (single chunk):`)
  console.log(`  Heading: ${metadata1.heading_path?.join(' > ')} ${metadata1.heading_path?.[0] === 'Chapter 1' ? '✓' : '✗'}`)
  console.log(`  Pages: ${metadata1.page_start}-${metadata1.page_end} ${metadata1.page_start === 1 ? '✓' : '✗'}`)

  // Test 2: Multiple chunks (aggregation)
  const docling2a = createMockDoclingChunk(0, 0, 100, ['Chapter 1'], 1)
  const docling2b = createMockDoclingChunk(1, 50, 150, ['Chapter 1', 'Section 1.1'], 2)
  const metadata2 = aggregateMetadata([docling2a, docling2b])
  console.log(`Test 2 (multiple chunks):`)
  console.log(`  Headings: ${metadata2.heading_path?.join(', ')} ${metadata2.heading_path?.length === 2 ? '✓' : '✗'}`)
  console.log(`  Page range: ${metadata2.page_start}-${metadata2.page_end} ${metadata2.page_start === 1 && metadata2.page_end === 2 ? '✓' : '✗'}`)

  // Test 3: Empty array
  const metadata3 = aggregateMetadata([])
  console.log(`Test 3 (empty array):`)
  console.log(`  All null: ${!metadata3.heading_path && !metadata3.page_start ? '✓ PASS' : '✗ FAIL'}`)
}

function testCalculateConfidence() {
  console.log('\n=== Test: calculateConfidence() ===')

  // Test 1: High confidence (3+ overlaps)
  const doclings1 = [
    createMockDoclingChunk(0, 0, 100),
    createMockDoclingChunk(1, 50, 150),
    createMockDoclingChunk(2, 100, 200)
  ]
  const confidence1 = calculateConfidence(doclings1, 0.5)
  console.log(`Test 1 (3+ overlaps): ${confidence1 === 'high' ? '✓ PASS' : `✗ FAIL (got ${confidence1})`}`)

  // Test 2: High confidence (strong overlap >70%)
  const doclings2 = [createMockDoclingChunk(0, 0, 100)]
  const confidence2 = calculateConfidence(doclings2, 0.75)
  console.log(`Test 2 (strong overlap 75%): ${confidence2 === 'high' ? '✓ PASS' : `✗ FAIL (got ${confidence2})`}`)

  // Test 3: Medium confidence (1-2 overlaps, decent coverage)
  const doclings3 = [createMockDoclingChunk(0, 0, 100)]
  const confidence3 = calculateConfidence(doclings3, 0.5)
  console.log(`Test 3 (medium - 1 overlap, 50%): ${confidence3 === 'medium' ? '✓ PASS' : `✗ FAIL (got ${confidence3})`}`)

  // Test 4: Low confidence (weak overlap)
  const doclings4 = [createMockDoclingChunk(0, 0, 100)]
  const confidence4 = calculateConfidence(doclings4, 0.2)
  console.log(`Test 4 (low - weak overlap 20%): ${confidence4 === 'low' ? '✓ PASS' : `✗ FAIL (got ${confidence4})`}`)

  // Test 5: Low confidence (no overlaps)
  const doclings5: MatchResult[] = []
  const confidence5 = calculateConfidence(doclings5, 0)
  console.log(`Test 5 (low - no overlaps): ${confidence5 === 'low' ? '✓ PASS' : `✗ FAIL (got ${confidence5})`}`)
}

async function testTransferMetadataToChonkieChunks() {
  console.log('\n=== Test: transferMetadataToChonkieChunks() ===')

  // Create mock data: 3 Docling chunks, 2 Chonkie chunks
  const doclingChunks: MatchResult[] = [
    createMockDoclingChunk(0, 0, 100, ['Chapter 1'], 1),
    createMockDoclingChunk(1, 100, 200, ['Chapter 1', 'Section 1.1'], 2),
    createMockDoclingChunk(2, 200, 300, ['Chapter 2'], 3)
  ]

  const chonkieChunks: ChonkieChunk[] = [
    createMockChonkieChunk(50, 150),   // Overlaps chunks 0 and 1
    createMockChonkieChunk(250, 350)   // Overlaps chunk 2 and extends past
  ]

  const results = await transferMetadataToChonkieChunks(
    chonkieChunks,
    doclingChunks,
    'test-doc-id'
  )

  console.log(`\nResults: ${results.length} processed chunks`)

  // Validate Chunk 0
  const chunk0 = results[0]
  console.log(`\nChunk 0 (overlaps Docling 0 and 1):`)
  console.log(`  Overlap count: ${chunk0.metadata_overlap_count} ${chunk0.metadata_overlap_count === 2 ? '✓' : '✗'}`)
  console.log(`  Confidence: ${chunk0.metadata_confidence} ${chunk0.metadata_confidence === 'high' ? '✓' : '✗'}`)
  console.log(`  Headings: ${chunk0.heading_path?.join(', ')} ${chunk0.heading_path?.length === 2 ? '✓' : '✗'}`)
  console.log(`  Pages: ${chunk0.page_start}-${chunk0.page_end} ${chunk0.page_start === 1 && chunk0.page_end === 2 ? '✓' : '✗'}`)
  console.log(`  Interpolated: ${chunk0.metadata_interpolated} ${!chunk0.metadata_interpolated ? '✓' : '✗'}`)

  // Validate Chunk 1
  const chunk1 = results[1]
  console.log(`\nChunk 1 (overlaps Docling 2):`)
  console.log(`  Overlap count: ${chunk1.metadata_overlap_count} ${chunk1.metadata_overlap_count === 1 ? '✓' : '✗'}`)
  console.log(`  Confidence: ${chunk1.metadata_confidence}`)
  console.log(`  Headings: ${chunk1.heading_path?.join(', ')} ${chunk1.heading_path?.[0] === 'Chapter 2' ? '✓' : '✗'}`)
  console.log(`  Pages: ${chunk1.page_start} ${chunk1.page_start === 3 ? '✓' : '✗'}`)
  console.log(`  Interpolated: ${chunk1.metadata_interpolated} ${!chunk1.metadata_interpolated ? '✓' : '✗'}`)

  // Calculate overlap coverage
  const withOverlaps = results.filter(c => c.metadata_overlap_count > 0)
  const coverage = (withOverlaps.length / results.length) * 100
  console.log(`\nOverlap Coverage: ${coverage.toFixed(1)}% ${coverage >= 70 ? '✓ PASS' : '✗ FAIL'}`)
}

// ============================================================================
// Run All Tests
// ============================================================================

async function runAllTests() {
  console.log('╔════════════════════════════════════════════════════════════╗')
  console.log('║   Metadata Transfer System - Validation Tests             ║')
  console.log('╚════════════════════════════════════════════════════════════╝')

  testHasOverlap()
  testCalculateOverlapPercentage()
  testAggregateMetadata()
  testCalculateConfidence()
  await testTransferMetadataToChonkieChunks()

  console.log('\n╔════════════════════════════════════════════════════════════╗')
  console.log('║   All Tests Complete                                       ║')
  console.log('╚════════════════════════════════════════════════════════════╝')
}

runAllTests().catch(error => {
  console.error('Test failed:', error)
  process.exit(1)
})
