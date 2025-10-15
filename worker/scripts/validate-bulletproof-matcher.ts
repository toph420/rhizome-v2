/**
 * Bulletproof Matcher Validation Script
 *
 * Validates that bulletproof matcher fix (removal of sequential ordering/proportional scaling)
 * ensures content-offset synchronization. Critical for Chonkie metadata transfer Phase 0.
 *
 * Tests:
 * 1. Content-offset sync: cleanedMarkdown.slice(start_offset, end_offset) === chunk.content
 * 2. Binary search accuracy: Position mapping returns correct chunks
 * 3. Overlap detection: 70-90% of chunks should have overlaps (expected, not failure!)
 *
 * Usage:
 *   npx tsx worker/scripts/validate-bulletproof-matcher.ts <document_id>
 */

import { createClient } from '@supabase/supabase-js'
import * as fs from 'fs/promises'
import * as path from 'path'

// ============================================================================
// Configuration
// ============================================================================

const SUPABASE_URL = process.env.SUPABASE_URL || 'http://localhost:54321'
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

if (!SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Error: SUPABASE_SERVICE_ROLE_KEY environment variable required')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

// ============================================================================
// Types
// ============================================================================

interface Chunk {
  id: string
  chunk_index: number
  content: string
  start_offset: number
  end_offset: number
  position_confidence: string
  position_method: string
  overlap_corrected: boolean
  validation_warning: string | null
  heading_path: string[] | null
  page_start: number | null
  page_end: number | null
}

interface Document {
  id: string
  title: string
  source_type: string
  page_count: number | null
  storage_path: string
}

interface ValidationResult {
  documentId: string
  documentTitle: string
  totalChunks: number
  contentSyncPassed: number
  contentSyncFailed: number
  binarySearchPassed: number
  binarySearchFailed: number
  overlapCount: number
  overlapRate: number
  desyncChunks: Array<{
    index: number
    expected: string
    actual: string
    startOffset: number
    endOffset: number
  }>
  errors: string[]
}

// ============================================================================
// Validation Functions
// ============================================================================

/**
 * Test 1: Content-offset synchronization
 * Verify: cleanedMarkdown.slice(start_offset, end_offset) === chunk.content
 */
async function validateContentOffsetSync(
  cleanedMarkdown: string,
  chunks: Chunk[]
): Promise<{
  passed: number
  failed: number
  desyncChunks: ValidationResult['desyncChunks']
}> {
  let passed = 0
  let failed = 0
  const desyncChunks: ValidationResult['desyncChunks'] = []

  for (const chunk of chunks) {
    if (chunk.start_offset === null || chunk.end_offset === null) {
      console.warn(`  ⚠️  Chunk ${chunk.chunk_index}: Missing offsets (start=${chunk.start_offset}, end=${chunk.end_offset})`)
      failed++
      continue
    }

    // Extract content using stored offsets
    const extractedContent = cleanedMarkdown.slice(chunk.start_offset, chunk.end_offset)

    // Compare with stored content
    if (extractedContent === chunk.content) {
      passed++
    } else {
      failed++
      desyncChunks.push({
        index: chunk.chunk_index,
        expected: chunk.content.slice(0, 100) + (chunk.content.length > 100 ? '...' : ''),
        actual: extractedContent.slice(0, 100) + (extractedContent.length > 100 ? '...' : ''),
        startOffset: chunk.start_offset,
        endOffset: chunk.end_offset
      })

      console.warn(
        `  ❌ Chunk ${chunk.chunk_index}: Content mismatch\n` +
        `     Expected: "${chunk.content.slice(0, 50)}..."\n` +
        `     Actual:   "${extractedContent.slice(0, 50)}..."\n` +
        `     Offsets:  [${chunk.start_offset}, ${chunk.end_offset}]`
      )
    }
  }

  return { passed, failed, desyncChunks }
}

/**
 * Test 2: Binary search accuracy
 * Test position-to-chunk mapping with 100 random positions
 */
function validateBinarySearch(
  cleanedMarkdown: string,
  chunks: Chunk[]
): { passed: number; failed: number } {
  let passed = 0
  let failed = 0

  // Generate 100 random positions
  const testCount = Math.min(100, chunks.length * 5)
  const positions: number[] = []

  for (let i = 0; i < testCount; i++) {
    const randomPos = Math.floor(Math.random() * cleanedMarkdown.length)
    positions.push(randomPos)
  }

  for (const position of positions) {
    // Find chunk using binary search
    const chunkIndex = binarySearchChunk(chunks, position)

    if (chunkIndex !== -1) {
      const chunk = chunks[chunkIndex]

      // Verify position is within chunk range
      if (position >= chunk.start_offset && position < chunk.end_offset) {
        passed++
      } else {
        failed++
        console.warn(
          `  ❌ Binary search failed for position ${position}\n` +
          `     Found chunk ${chunk.chunk_index} [${chunk.start_offset}, ${chunk.end_offset}]\n` +
          `     Position not in range`
        )
      }
    } else {
      // Position not found in any chunk (gap or out of bounds)
      // This is OK if position is in a gap between chunks
      const isInGap = chunks.some((c, i) => {
        const nextChunk = chunks[i + 1]
        return nextChunk && position >= c.end_offset && position < nextChunk.start_offset
      })

      if (isInGap || position >= cleanedMarkdown.length) {
        passed++  // Expected gap
      } else {
        failed++
        console.warn(`  ⚠️  Position ${position} not found in any chunk (unexpected)`)
      }
    }
  }

  return { passed, failed }
}

/**
 * Binary search to find chunk containing position
 * Returns chunk index or -1 if not found
 */
function binarySearchChunk(chunks: Chunk[], position: number): number {
  let left = 0
  let right = chunks.length - 1

  while (left <= right) {
    const mid = Math.floor((left + right) / 2)
    const chunk = chunks[mid]

    if (position >= chunk.start_offset && position < chunk.end_offset) {
      return mid
    } else if (position < chunk.start_offset) {
      right = mid - 1
    } else {
      left = mid + 1
    }
  }

  return -1
}

/**
 * Test 3: Overlap detection
 * Measure overlap rate (expected: 70-90% of chunks)
 */
function validateOverlapRate(chunks: Chunk[]): { overlapCount: number; overlapRate: number } {
  let overlapCount = 0

  for (let i = 1; i < chunks.length; i++) {
    const prev = chunks[i - 1]
    const curr = chunks[i]

    // Check if current chunk overlaps with previous
    if (curr.start_offset < prev.end_offset) {
      overlapCount++
    }
  }

  const overlapRate = chunks.length > 0 ? overlapCount / chunks.length : 0

  return { overlapCount, overlapRate }
}

// ============================================================================
// Main Validation
// ============================================================================

async function validateDocument(documentId: string): Promise<ValidationResult> {
  console.log(`\n🔍 Validating document: ${documentId}\n`)

  // Fetch document metadata
  const { data: document, error: docError } = await supabase
    .from('documents')
    .select('id, title, source_type, page_count, storage_path')
    .eq('id', documentId)
    .single()

  if (docError || !document) {
    throw new Error(`Failed to fetch document: ${docError?.message || 'Not found'}`)
  }

  console.log(`📄 Document: ${document.title}`)
  console.log(`   Type: ${document.source_type}, Pages: ${document.page_count || 'unknown'}`)

  // Fetch chunks
  const { data: chunks, error: chunksError } = await supabase
    .from('chunks')
    .select(`
      id,
      chunk_index,
      content,
      start_offset,
      end_offset,
      position_confidence,
      position_method,
      overlap_corrected,
      validation_warning,
      heading_path,
      page_start,
      page_end
    `)
    .eq('document_id', documentId)
    .eq('is_current', true)
    .order('chunk_index', { ascending: true })

  if (chunksError || !chunks) {
    throw new Error(`Failed to fetch chunks: ${chunksError?.message || 'No chunks found'}`)
  }

  console.log(`   Chunks: ${chunks.length}`)

  if (chunks.length === 0) {
    throw new Error('No chunks found for document')
  }

  // Load cleaned markdown from storage
  const markdownPath = `${document.storage_path}/content.md`
  console.log(`   Loading markdown from: ${markdownPath}`)

  const { data: markdownBlob, error: storageError } = await supabase
    .storage
    .from('documents')
    .download(markdownPath)

  if (storageError || !markdownBlob) {
    throw new Error(`Failed to load markdown: ${storageError?.message || 'Not found'}`)
  }

  const cleanedMarkdown = await markdownBlob.text()
  console.log(`   Markdown size: ${cleanedMarkdown.length} chars\n`)

  // Run validation tests
  const errors: string[] = []

  // Test 1: Content-offset synchronization
  console.log('🧪 Test 1: Content-Offset Synchronization')
  const syncResult = await validateContentOffsetSync(cleanedMarkdown, chunks)
  console.log(`   ✓ Passed: ${syncResult.passed}/${chunks.length} chunks (${(syncResult.passed / chunks.length * 100).toFixed(1)}%)`)

  if (syncResult.failed > 0) {
    console.log(`   ❌ Failed: ${syncResult.failed} chunks`)
    errors.push(`Content-offset sync failed for ${syncResult.failed} chunks`)
  }

  // Test 2: Binary search accuracy
  console.log('\n🧪 Test 2: Binary Search Accuracy')
  const binaryResult = validateBinarySearch(cleanedMarkdown, chunks)
  const binaryTotal = binaryResult.passed + binaryResult.failed
  console.log(`   ✓ Passed: ${binaryResult.passed}/${binaryTotal} positions (${(binaryResult.passed / binaryTotal * 100).toFixed(1)}%)`)

  if (binaryResult.failed > 0) {
    console.log(`   ❌ Failed: ${binaryResult.failed} positions`)
    errors.push(`Binary search failed for ${binaryResult.failed} positions`)
  }

  // Test 3: Overlap detection
  console.log('\n🧪 Test 3: Overlap Detection (Expected: 70-90%)')
  const overlapResult = validateOverlapRate(chunks)
  console.log(`   Overlaps: ${overlapResult.overlapCount}/${chunks.length} chunks (${(overlapResult.overlapRate * 100).toFixed(1)}%)`)

  if (overlapResult.overlapRate < 0.7) {
    console.log(`   ⚠️  WARNING: Overlap rate <70% indicates potential matching issues`)
    errors.push(`Low overlap rate: ${(overlapResult.overlapRate * 100).toFixed(1)}% (expected 70-90%)`)
  } else if (overlapResult.overlapRate > 0.95) {
    console.log(`   ⚠️  WARNING: Very high overlap rate >95% may indicate excessive corrections`)
    errors.push(`Very high overlap rate: ${(overlapResult.overlapRate * 100).toFixed(1)}%`)
  } else {
    console.log(`   ✅ Overlap rate is within expected range (70-90%)`)
  }

  return {
    documentId,
    documentTitle: document.title,
    totalChunks: chunks.length,
    contentSyncPassed: syncResult.passed,
    contentSyncFailed: syncResult.failed,
    binarySearchPassed: binaryResult.passed,
    binarySearchFailed: binaryResult.failed,
    overlapCount: overlapResult.overlapCount,
    overlapRate: overlapResult.overlapRate,
    desyncChunks: syncResult.desyncChunks,
    errors
  }
}

/**
 * Main entry point
 */
async function main() {
  const documentId = process.argv[2]

  if (!documentId) {
    console.error('Usage: npx tsx worker/scripts/validate-bulletproof-matcher.ts <document_id>')
    process.exit(1)
  }

  try {
    const result = await validateDocument(documentId)

    // Print summary
    console.log('\n' + '='.repeat(70))
    console.log('📊 Validation Summary')
    console.log('='.repeat(70))
    console.log(`Document: ${result.documentTitle}`)
    console.log(`Total Chunks: ${result.totalChunks}`)
    console.log('')
    console.log(`Content-Offset Sync:`)
    console.log(`  ✓ Passed: ${result.contentSyncPassed}/${result.totalChunks} (${(result.contentSyncPassed / result.totalChunks * 100).toFixed(1)}%)`)
    console.log(`  ❌ Failed: ${result.contentSyncFailed}`)
    console.log('')
    console.log(`Binary Search:`)
    console.log(`  ✓ Passed: ${result.binarySearchPassed}`)
    console.log(`  ❌ Failed: ${result.binarySearchFailed}`)
    console.log('')
    console.log(`Overlap Detection:`)
    console.log(`  Overlaps: ${result.overlapCount}/${result.totalChunks} (${(result.overlapRate * 100).toFixed(1)}%)`)
    console.log(`  Status: ${result.overlapRate >= 0.7 && result.overlapRate <= 0.95 ? '✅ GOOD' : '⚠️  WARNING'}`)
    console.log('')

    if (result.errors.length > 0) {
      console.log('❌ Errors:')
      result.errors.forEach(err => console.log(`  - ${err}`))
      console.log('')
    }

    // Overall status
    const allTestsPassed = result.contentSyncFailed === 0 &&
                          result.binarySearchFailed === 0 &&
                          result.overlapRate >= 0.7 &&
                          result.overlapRate <= 0.95

    if (allTestsPassed) {
      console.log('✅ ALL VALIDATION TESTS PASSED')
      console.log('   Content-offset synchronization: ✓')
      console.log('   Binary search accuracy: ✓')
      console.log('   Overlap rate (70-90%): ✓')
    } else {
      console.log('❌ VALIDATION FAILED')
      console.log('   Review errors above and check bulletproof matcher implementation')
    }

    console.log('='.repeat(70) + '\n')

    process.exit(allTestsPassed ? 0 : 1)
  } catch (error: any) {
    console.error(`\n❌ Validation error: ${error.message}`)
    process.exit(1)
  }
}

main()
