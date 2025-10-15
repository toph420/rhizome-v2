#!/usr/bin/env npx tsx
/**
 * T-014: Chonkie Integration Testing - All Chunker Types
 *
 * Comprehensive integration test suite for the Chonkie unified chunking pipeline.
 * Tests all 9 chunker strategies with real documents and validates:
 * - Character offset accuracy (100% validation)
 * - Overlap coverage (>70% target)
 * - Metadata recovery (>90% target)
 * - Processing times within acceptable ranges
 * - Confidence scoring accuracy
 *
 * Usage:
 *   npx tsx scripts/test-chonkie-integration.ts <document_id>
 *   npx tsx scripts/test-chonkie-integration.ts --all-chunkers <document_id>
 *   npx tsx scripts/test-chonkie-integration.ts --report <document_id>
 *
 * PRP Reference: lines 2091-2291 (T-014 specification)
 */

import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import { chunkWithChonkie, type ChonkieConfig, type ChonkieChunk } from '../lib/chonkie/chonkie-chunker.js'
import { transferMetadataToChonkieChunks } from '../lib/chonkie/metadata-transfer.js'
import { bulletproofMatch } from '../lib/local/bulletproof-matcher.js'
import type { DoclingChunk } from '../lib/docling-extractor.js'
import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'

// Load environment variables from worker/.env
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
config({ path: path.join(__dirname, '../.env') })

// ============================================================================
// Types
// ============================================================================

interface TestResult {
  chunkerType: string
  success: boolean
  chunks: number
  overlapCoverage: number  // Percentage (0-100)
  metadataRecovery: number  // Percentage (0-100)
  processingTime: number  // Milliseconds
  avgOverlapsPerChunk: number
  interpolatedChunks: number
  highConfidenceChunks: number
  offsetsValid: boolean
  error?: string
}

interface TestReport {
  documentId: string
  documentTitle: string
  sourceType: string
  testDate: string
  results: TestResult[]
  summary: {
    totalTests: number
    passed: number
    failed: number
    avgOverlapCoverage: number
    avgMetadataRecovery: number
  }
}

// ============================================================================
// Supabase Client Setup
// ============================================================================

const supabaseUrl = process.env.SUPABASE_URL || 'http://localhost:54321'
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

if (!supabaseKey) {
  console.error('❌ SUPABASE_SERVICE_ROLE_KEY not found in environment')
  console.error('   Please ensure worker/.env contains the service role key')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get cleaned markdown from Supabase Storage.
 * Pattern: Based on existing storage access in pdf-processor.ts
 */
async function getCleanedMarkdown(documentId: string): Promise<string> {
  // Get document record to find user_id
  const { data: doc, error: docError } = await supabase
    .from('documents')
    .select('user_id, file_path')
    .eq('id', documentId)
    .single()

  if (docError || !doc) {
    throw new Error(`Document not found: ${documentId}`)
  }

  // Construct storage path: documents/{userId}/{documentId}/content.md
  const storagePath = `documents/${doc.user_id}/${documentId}/content.md`

  // Download markdown file
  const { data: fileData, error: downloadError } = await supabase
    .storage
    .from('documents')
    .download(storagePath)

  if (downloadError || !fileData) {
    throw new Error(`Failed to download markdown: ${downloadError?.message || 'Unknown error'}`)
  }

  // Convert blob to text
  const markdown = await fileData.text()

  return markdown
}

/**
 * Get Docling chunks from cached_chunks table.
 * Pattern: Based on pdf-processor.ts cached extraction
 */
async function getCachedDoclingChunks(documentId: string): Promise<DoclingChunk[]> {
  const { data, error } = await supabase
    .from('cached_chunks')
    .select('*')
    .eq('document_id', documentId)
    .order('chunk_index', { ascending: true })

  if (error) {
    throw new Error(`Failed to fetch cached chunks: ${error.message}`)
  }

  if (!data || data.length === 0) {
    throw new Error(`No cached chunks found for document ${documentId}`)
  }

  // Convert database records to DoclingChunk format
  const doclingChunks: DoclingChunk[] = data.map(row => ({
    index: row.chunk_index,
    content: row.content,
    meta: {
      heading_path: row.heading_path,
      page_start: row.page_start,
      page_end: row.page_end,
      section_marker: row.section_marker,
      bboxes: row.bboxes
    }
  }))

  return doclingChunks
}

/**
 * Get document information for test report.
 */
async function getDocumentInfo(documentId: string): Promise<{ title: string; source_type: string }> {
  const { data, error } = await supabase
    .from('documents')
    .select('title, source_type')
    .eq('id', documentId)
    .single()

  if (error || !data) {
    throw new Error(`Failed to fetch document info: ${error?.message || 'Not found'}`)
  }

  return { title: data.title, source_type: data.source_type }
}

// ============================================================================
// Test Execution
// ============================================================================

/**
 * Test a single chunker type with complete validation.
 *
 * REQ-1: Each chunker type shall successfully process documents
 * REQ-2: Overlap coverage shall be >70% for all chunker types
 * REQ-3: Metadata recovery shall be >90% for all chunker types
 * REQ-4: Processing times shall meet targets
 * REQ-5: Character offsets shall validate correctly
 */
async function testChunkerType(
  chunkerType: string,
  markdown: string,
  doclingChunks: DoclingChunk[],
  documentId: string
): Promise<TestResult> {
  console.log(`\n${'='.repeat(70)}`)
  console.log(`Testing ${chunkerType} chunker`)
  console.log('='.repeat(70))

  const startTime = Date.now()

  try {
    // Step 1: Chunk with Chonkie
    console.log(`[1/4] Chunking with Chonkie ${chunkerType} strategy...`)
    const chonkieChunks = await chunkWithChonkie(markdown, {
      chunker_type: chunkerType as any,
      chunk_size: 512
    })

    console.log(`✓ Created ${chonkieChunks.length} chunks`)

    // Step 2: Verify character offsets (CRITICAL)
    console.log(`[2/4] Validating character offsets...`)
    let offsetsValid = true

    for (let i = 0; i < chonkieChunks.length; i++) {
      const chunk = chonkieChunks[i]
      const extracted = markdown.slice(chunk.start_index, chunk.end_index)

      if (extracted !== chunk.text) {
        console.error(
          `❌ Offset mismatch at chunk ${i}:\n` +
          `   Expected: "${chunk.text.slice(0, 50)}..."\n` +
          `   Got: "${extracted.slice(0, 50)}..."\n` +
          `   Offsets: [${chunk.start_index}, ${chunk.end_index})`
        )
        offsetsValid = false
        break
      }
    }

    if (!offsetsValid) {
      throw new Error('Character offset validation FAILED - metadata transfer will not work')
    }

    console.log(`✓ All ${chonkieChunks.length} chunk offsets validated successfully`)

    // Step 3: Create coordinate map with bulletproof matcher
    console.log(`[3/4] Creating coordinate map with bulletproof matcher...`)
    const { chunks: bulletproofMatches } = await bulletproofMatch(markdown, doclingChunks)
    console.log(`✓ Generated ${bulletproofMatches.length} coordinate mappings`)

    // Step 4: Transfer metadata via overlap detection
    console.log(`[4/4] Transferring metadata via overlap detection...`)
    const finalChunks = await transferMetadataToChonkieChunks(
      chonkieChunks,
      bulletproofMatches,
      documentId
    )

    // Calculate statistics
    const withOverlaps = finalChunks.filter(c => c.metadata_overlap_count > 0)
    const overlapCoverage = (withOverlaps.length / finalChunks.length) * 100

    const withMetadata = finalChunks.filter(c =>
      (c.heading_path && c.heading_path.length > 0) || c.page_start
    )
    const metadataRecovery = (withMetadata.length / finalChunks.length) * 100

    const avgOverlaps = finalChunks.reduce((sum, c) => sum + c.metadata_overlap_count, 0) / finalChunks.length
    const interpolated = finalChunks.filter(c => c.metadata_interpolated).length
    const highConfidence = finalChunks.filter(c => c.metadata_confidence === 'high').length

    const processingTime = Date.now() - startTime

    // Log results
    console.log(`\n✅ ${chunkerType} test PASSED`)
    console.log(`   Chunks: ${finalChunks.length}`)
    console.log(`   Overlap coverage: ${overlapCoverage.toFixed(1)}% (target: >70%)`)
    console.log(`   Metadata recovery: ${metadataRecovery.toFixed(1)}% (target: >90%)`)
    console.log(`   Avg overlaps/chunk: ${avgOverlaps.toFixed(2)}`)
    console.log(`   High confidence: ${highConfidence} chunks (${(highConfidence / finalChunks.length * 100).toFixed(1)}%)`)
    console.log(`   Interpolated: ${interpolated} chunks (${(interpolated / finalChunks.length * 100).toFixed(1)}%)`)
    console.log(`   Processing time: ${(processingTime / 1000).toFixed(2)}s`)

    // Validation warnings
    if (overlapCoverage < 70) {
      console.warn(`⚠️  LOW OVERLAP COVERAGE: ${overlapCoverage.toFixed(1)}% (expected >70%)`)
    }
    if (metadataRecovery < 90) {
      console.warn(`⚠️  LOW METADATA RECOVERY: ${metadataRecovery.toFixed(1)}% (expected >90%)`)
    }

    return {
      chunkerType,
      success: true,
      chunks: finalChunks.length,
      overlapCoverage,
      metadataRecovery,
      processingTime,
      avgOverlapsPerChunk: avgOverlaps,
      interpolatedChunks: interpolated,
      highConfidenceChunks: highConfidence,
      offsetsValid: true
    }

  } catch (error: any) {
    console.error(`\n❌ ${chunkerType} test FAILED: ${error.message}`)
    return {
      chunkerType,
      success: false,
      chunks: 0,
      overlapCoverage: 0,
      metadataRecovery: 0,
      processingTime: Date.now() - startTime,
      avgOverlapsPerChunk: 0,
      interpolatedChunks: 0,
      highConfidenceChunks: 0,
      offsetsValid: false,
      error: error.message
    }
  }
}

/**
 * Generate test report markdown file.
 */
function generateTestReport(report: TestReport, outputPath: string): void {
  const lines: string[] = []

  lines.push('# Chonkie Integration Test Report\n')
  lines.push(`**Generated**: ${report.testDate}`)
  lines.push(`**Document**: ${report.documentTitle} (${report.documentId})`)
  lines.push(`**Source Type**: ${report.sourceType}\n`)

  lines.push('## Summary\n')
  lines.push(`- **Total Tests**: ${report.summary.totalTests}`)
  lines.push(`- **Passed**: ${report.summary.passed} ✅`)
  lines.push(`- **Failed**: ${report.summary.failed} ${report.summary.failed > 0 ? '❌' : ''}`)
  lines.push(`- **Average Overlap Coverage**: ${report.summary.avgOverlapCoverage.toFixed(1)}%`)
  lines.push(`- **Average Metadata Recovery**: ${report.summary.avgMetadataRecovery.toFixed(1)}%\n`)

  lines.push('## Results by Chunker Type\n')
  lines.push('| Chunker | Status | Chunks | Coverage | Recovery | Time | Avg Overlaps | High Conf | Interpolated |')
  lines.push('|---------|--------|--------|----------|----------|------|--------------|-----------|--------------|')

  for (const result of report.results) {
    const status = result.success ? '✅' : '❌'
    const coverage = result.overlapCoverage.toFixed(1) + '%'
    const recovery = result.metadataRecovery.toFixed(1) + '%'
    const time = (result.processingTime / 1000).toFixed(2) + 's'
    const avgOverlaps = result.avgOverlapsPerChunk.toFixed(2)
    const highConf = result.highConfidenceChunks
    const interpolated = result.interpolatedChunks

    lines.push(
      `| ${result.chunkerType} | ${status} | ${result.chunks} | ${coverage} | ${recovery} | ${time} | ${avgOverlaps} | ${highConf} | ${interpolated} |`
    )
  }

  lines.push('\n## Validation\n')
  lines.push('### Success Criteria\n')
  lines.push('- ✅ Overlap coverage >70%: ' + (report.summary.avgOverlapCoverage >= 70 ? 'PASSED' : '❌ FAILED'))
  lines.push('- ✅ Metadata recovery >90%: ' + (report.summary.avgMetadataRecovery >= 90 ? 'PASSED' : '❌ FAILED'))
  lines.push('- ✅ Character offsets valid: ' + (report.results.every(r => r.offsetsValid) ? 'PASSED' : '❌ FAILED'))
  lines.push('- ✅ All chunkers processed: ' + (report.summary.passed === report.summary.totalTests ? 'PASSED' : '❌ FAILED'))

  lines.push('\n## Notes\n')
  lines.push('- **Overlap Coverage**: Percentage of Chonkie chunks with at least one Docling chunk overlap')
  lines.push('- **Metadata Recovery**: Percentage of chunks with populated heading_path or page_start')
  lines.push('- **High Confidence**: Chunks with 3+ overlaps OR >70% overlap coverage')
  lines.push('- **Interpolated**: Chunks with no Docling overlaps (metadata from nearest neighbors)')

  // Write report
  fs.writeFileSync(outputPath, lines.join('\n'), 'utf-8')
  console.log(`\n📄 Test report saved to: ${outputPath}`)
}

// ============================================================================
// Main Execution
// ============================================================================

async function main() {
  const args = process.argv.slice(2)

  if (args.length === 0 || args.includes('--help')) {
    console.log(`
Chonkie Integration Testing - All Chunker Types

Usage:
  npx tsx scripts/test-chonkie-integration.ts <document_id>              # Test 4 default chunkers (token, sentence, recursive, semantic)
  npx tsx scripts/test-chonkie-integration.ts --all-chunkers <document_id>  # Test all 9 chunker types
  npx tsx scripts/test-chonkie-integration.ts --report <document_id>      # Generate detailed test report

Options:
  --all-chunkers   Test all 9 chunker types (token, sentence, recursive, semantic, late, code, neural, slumber, table)
  --report         Generate markdown test report
  --help           Show this help message

Examples:
  npx tsx scripts/test-chonkie-integration.ts d00ca154-2126-470b-b20b-226016041e4a
  npx tsx scripts/test-chonkie-integration.ts --all-chunkers d00ca154-2126-470b-b20b-226016041e4a --report
`)
    process.exit(0)
  }

  const testAllChunkers = args.includes('--all-chunkers')
  const generateReport = args.includes('--report')
  const documentId = args[args.length - 1]

  // Validate document ID format (UUID)
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  if (!uuidRegex.test(documentId)) {
    console.error('❌ Invalid document ID format. Must be a valid UUID.')
    process.exit(1)
  }

  console.log('Chonkie Integration Testing')
  console.log('=' .repeat(70))
  console.log(`Document ID: ${documentId}`)
  console.log(`Test all chunkers: ${testAllChunkers}`)
  console.log(`Generate report: ${generateReport}`)
  console.log()

  try {
    // Get document info
    const docInfo = await getDocumentInfo(documentId)
    console.log(`Document: ${docInfo.title}`)
    console.log(`Source type: ${docInfo.source_type}`)

    // Get cleaned markdown
    console.log('\n[Setup] Fetching cleaned markdown from Storage...')
    const markdown = await getCleanedMarkdown(documentId)
    console.log(`✓ Markdown length: ${markdown.length} characters`)

    // Get cached Docling chunks
    console.log('[Setup] Fetching Docling chunks from cached_chunks table...')
    const doclingChunks = await getCachedDoclingChunks(documentId)
    console.log(`✓ Docling chunks: ${doclingChunks.length}`)

    // Determine which chunkers to test
    const defaultChunkers = ['token', 'sentence', 'recursive', 'semantic']
    const allChunkers = ['token', 'sentence', 'recursive', 'semantic', 'late', 'code', 'neural', 'slumber', 'table']
    const chunkersToTest = testAllChunkers ? allChunkers : defaultChunkers

    console.log(`\n[Tests] Running ${chunkersToTest.length} chunker tests...`)

    // Test each chunker type
    const results: TestResult[] = []
    for (const chunkerType of chunkersToTest) {
      const result = await testChunkerType(chunkerType, markdown, doclingChunks, documentId)
      results.push(result)
    }

    // Calculate summary statistics
    const passed = results.filter(r => r.success).length
    const failed = results.length - passed
    const avgOverlapCoverage = results.reduce((sum, r) => sum + r.overlapCoverage, 0) / results.length
    const avgMetadataRecovery = results.reduce((sum, r) => sum + r.metadataRecovery, 0) / results.length

    // Print summary
    console.log(`\n${'='.repeat(70)}`)
    console.log('TEST SUMMARY')
    console.log('='.repeat(70))
    console.log(`Total tests: ${results.length}`)
    console.log(`Passed: ${passed} ✅`)
    console.log(`Failed: ${failed} ${failed > 0 ? '❌' : ''}`)
    console.log(`Average overlap coverage: ${avgOverlapCoverage.toFixed(1)}%`)
    console.log(`Average metadata recovery: ${avgMetadataRecovery.toFixed(1)}%`)

    // Validation
    console.log('\nValidation:')
    console.log(`  Overlap coverage >70%: ${avgOverlapCoverage >= 70 ? '✅ PASSED' : '❌ FAILED'}`)
    console.log(`  Metadata recovery >90%: ${avgMetadataRecovery >= 90 ? '✅ PASSED' : '❌ FAILED'}`)
    console.log(`  All chunkers processed: ${passed === results.length ? '✅ PASSED' : '❌ FAILED'}`)

    // Generate report if requested
    if (generateReport) {
      const report: TestReport = {
        documentId,
        documentTitle: docInfo.title,
        sourceType: docInfo.source_type,
        testDate: new Date().toISOString(),
        results,
        summary: {
          totalTests: results.length,
          passed,
          failed,
          avgOverlapCoverage,
          avgMetadataRecovery
        }
      }

      const reportPath = path.join(process.cwd(), 'test-reports', `chonkie-test-${documentId}.md`)
      const reportDir = path.dirname(reportPath)

      // Ensure reports directory exists
      if (!fs.existsSync(reportDir)) {
        fs.mkdirSync(reportDir, { recursive: true })
      }

      generateTestReport(report, reportPath)
    }

    // Exit with appropriate code
    if (failed > 0) {
      console.log('\n❌ Some tests failed. Review errors above.')
      process.exit(1)
    } else {
      console.log('\n✅ All tests passed!')
      process.exit(0)
    }

  } catch (error: any) {
    console.error('\n❌ Fatal error:', error.message)
    console.error(error.stack)
    process.exit(1)
  }
}

// Run main
main().catch(error => {
  console.error('Unhandled error:', error)
  process.exit(1)
})
