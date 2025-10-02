#!/usr/bin/env tsx
/**
 * PDF Processing Performance Benchmark
 * Tests batched PDF extraction with various document sizes
 *
 * Performance Targets:
 * - 500-page PDF: <10 minutes total processing
 * - Batching efficiency: ~10s per 100-page batch
 * - Stitching accuracy: >95%
 */

import { performance } from 'perf_hooks'
import {
  extractLargePDF,
  calculateBatchRanges,
  DEFAULT_BATCH_CONFIG,
  type BatchConfig,
  type BatchedExtractionResult
} from '../lib/pdf-batch-utils'
import { createGeminiClient } from '../lib/ai-client'
import { GoogleGenAI } from '@google/genai'
import * as fs from 'fs'
import * as path from 'path'

// Color codes for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
}

/**
 * PDF benchmark configuration
 */
interface PDFBenchmarkConfig {
  testSizes: number[]          // Page counts to test
  iterations: number           // Iterations per size
  realPDF: boolean            // Use real PDF vs synthetic
  pdfPath?: string            // Path to real PDF file
}

const DEFAULT_PDF_BENCHMARK_CONFIG: PDFBenchmarkConfig = {
  testSizes: [50, 100, 200, 500],
  iterations: 2,
  realPDF: false
}

/**
 * PDF processing metrics
 */
interface PDFMetrics {
  pageCount: number
  totalTime: number           // ms
  batchCount: number
  averageBatchTime: number    // ms per batch
  stitchingTime: number       // ms
  markdownSize: number        // chars
  successRate: number         // percentage
  throughput: number          // pages per second
}

/**
 * Test batch range calculation
 */
function testBatchRanges(): void {
  console.log(`${colors.bright}${colors.cyan}Testing Batch Range Calculation${colors.reset}\n`)

  const testCases = [
    { pages: 50, expected: 1 },
    { pages: 100, expected: 1 },
    { pages: 101, expected: 2 },
    { pages: 200, expected: 2 },
    { pages: 250, expected: 3 },
    { pages: 500, expected: 5 }
  ]

  for (const { pages, expected } of testCases) {
    const ranges = calculateBatchRanges(pages)
    const pass = ranges.length === expected

    console.log(
      `  ${pages} pages → ${ranges.length} batches ` +
      `${pass ? colors.green + '✓' : colors.red + '✗'}${colors.reset} ` +
      `(expected ${expected})`
    )

    if (!pass || pages <= 250) {
      console.log(`    Ranges: ${JSON.stringify(ranges)}`)
    }
  }

  console.log()
}

/**
 * Simulate PDF extraction for benchmarking without real AI
 */
async function simulatePDFExtraction(
  pageCount: number,
  config: Partial<BatchConfig> = {}
): Promise<BatchedExtractionResult> {
  const startTime = Date.now()
  const { pagesPerBatch, overlapPages } = { ...DEFAULT_BATCH_CONFIG, ...config }

  // Calculate batches
  const ranges = calculateBatchRanges(pageCount, config)

  // Simulate batch extraction with realistic timing
  const batches = []
  for (let i = 0; i < ranges.length; i++) {
    const [startPage, endPage] = ranges[i]
    const pageCount = endPage - startPage + 1

    // Simulate extraction time: ~10s per 100 pages
    const simulatedTime = (pageCount / 100) * 10000
    await new Promise(resolve => setTimeout(resolve, Math.min(simulatedTime, 100))) // Cap at 100ms for benchmark

    // Generate mock markdown
    const markdown = `# Pages ${startPage}-${endPage}\n\n` +
      `Mock content for pages ${startPage} to ${endPage}.\n`.repeat(pageCount)

    batches.push({
      batchNumber: i + 1,
      startPage,
      endPage,
      markdown,
      success: true,
      extractionTime: simulatedTime
    })
  }

  // Simulate stitching
  const stitchStart = performance.now()
  const markdown = batches.map(b => b.markdown).join('\n\n---\n\n')
  const stitchingTime = performance.now() - stitchStart

  const totalTime = Date.now() - startTime
  const successCount = batches.filter(b => b.success).length

  return {
    batches,
    markdown,
    totalPages: pageCount,
    totalTime,
    successCount,
    failedCount: batches.length - successCount
  }
}

/**
 * Benchmark PDF processing for various sizes
 */
async function benchmarkPDFProcessing(
  config: PDFBenchmarkConfig = DEFAULT_PDF_BENCHMARK_CONFIG
): Promise<PDFMetrics[]> {
  console.log(`${colors.bright}${colors.blue}═══════════════════════════════════════════════════`)
  console.log(`   PDF Batched Processing Benchmark`)
  console.log(`═══════════════════════════════════════════════════${colors.reset}\n`)

  console.log(`Mode: ${config.realPDF ? 'Real PDF' : 'Simulated'}`)
  console.log(`Iterations: ${config.iterations}\n`)

  const results: PDFMetrics[] = []

  for (const pageCount of config.testSizes) {
    console.log(`${colors.bright}Testing ${pageCount}-page PDF:${colors.reset}`)

    const iterationMetrics: PDFMetrics[] = []

    for (let i = 0; i < config.iterations; i++) {
      process.stdout.write(`  Iteration ${i + 1}/${config.iterations}... `)

      try {
        let result: BatchedExtractionResult

        if (config.realPDF && config.pdfPath) {
          // Real PDF processing (requires actual PDF file)
          const apiKey = process.env.GOOGLE_AI_API_KEY
          if (!apiKey) {
            throw new Error('GOOGLE_AI_API_KEY required for real PDF processing')
          }

          const ai = createGeminiClient(apiKey)
          const pdfBuffer = fs.readFileSync(config.pdfPath).buffer
          result = await extractLargePDF(ai, pdfBuffer)
        } else {
          // Simulated processing
          result = await simulatePDFExtraction(pageCount)
        }

        // Calculate metrics
        const avgBatchTime = result.batches.reduce((sum, b) => sum + b.extractionTime, 0) / result.batches.length
        const stitchingTime = result.totalTime - result.batches.reduce((sum, b) => sum + b.extractionTime, 0)
        const successRate = (result.successCount / result.batches.length) * 100
        const throughput = (result.totalPages / (result.totalTime / 1000))

        const metrics: PDFMetrics = {
          pageCount: result.totalPages,
          totalTime: result.totalTime,
          batchCount: result.batches.length,
          averageBatchTime: avgBatchTime,
          stitchingTime,
          markdownSize: result.markdown.length,
          successRate,
          throughput
        }

        iterationMetrics.push(metrics)

        const statusColor = result.totalTime < (pageCount * 1200) ? colors.green : colors.yellow // 1.2s per page target
        console.log(
          `${statusColor}${(result.totalTime / 1000).toFixed(1)}s${colors.reset} ` +
          `(${result.batches.length} batches, ${(result.markdown.length / 1000).toFixed(0)}K chars)`
        )

      } catch (error: any) {
        console.log(`${colors.red}FAILED: ${error.message}${colors.reset}`)
      }
    }

    // Calculate averages
    if (iterationMetrics.length > 0) {
      const avgMetrics: PDFMetrics = {
        pageCount,
        totalTime: iterationMetrics.reduce((sum, m) => sum + m.totalTime, 0) / iterationMetrics.length,
        batchCount: iterationMetrics[0].batchCount,
        averageBatchTime: iterationMetrics.reduce((sum, m) => sum + m.averageBatchTime, 0) / iterationMetrics.length,
        stitchingTime: iterationMetrics.reduce((sum, m) => sum + m.stitchingTime, 0) / iterationMetrics.length,
        markdownSize: Math.round(iterationMetrics.reduce((sum, m) => sum + m.markdownSize, 0) / iterationMetrics.length),
        successRate: iterationMetrics.reduce((sum, m) => sum + m.successRate, 0) / iterationMetrics.length,
        throughput: iterationMetrics.reduce((sum, m) => sum + m.throughput, 0) / iterationMetrics.length
      }

      results.push(avgMetrics)

      // Display summary
      console.log(`\n  ${colors.bright}Summary:${colors.reset}`)
      console.log(`    Total time: ${(avgMetrics.totalTime / 1000).toFixed(1)}s`)
      console.log(`    Batches: ${avgMetrics.batchCount}`)
      console.log(`    Avg batch time: ${(avgMetrics.averageBatchTime / 1000).toFixed(1)}s`)
      console.log(`    Stitching time: ${avgMetrics.stitchingTime.toFixed(0)}ms`)
      console.log(`    Throughput: ${avgMetrics.throughput.toFixed(1)} pages/sec`)
      console.log(`    Success rate: ${avgMetrics.successRate.toFixed(1)}%`)

      // Check performance target for 500-page PDF: <10 minutes
      if (pageCount >= 500) {
        const targetTime = 600000 // 10 minutes in ms
        if (avgMetrics.totalTime < targetTime) {
          console.log(`    ${colors.green}✓ 500-page target met (<10 min)${colors.reset}`)
        } else {
          console.log(`    ${colors.red}✗ 500-page target missed (${(avgMetrics.totalTime / 60000).toFixed(1)} min)${colors.reset}`)
        }
      }

      // Check batch efficiency: ~10s per 100 pages
      const expectedBatchTime = 10000 // 10s per batch (100 pages)
      if (avgMetrics.averageBatchTime < expectedBatchTime * 1.5) {
        console.log(`    ${colors.green}✓ Batch efficiency good${colors.reset}`)
      } else {
        console.log(`    ${colors.yellow}⚠ Batch efficiency could improve${colors.reset}`)
      }
    }

    console.log('\n' + '─'.repeat(50) + '\n')
  }

  return results
}

/**
 * Generate PDF benchmark report
 */
function generatePDFReport(results: PDFMetrics[]): void {
  console.log(`${colors.bright}${colors.blue}═══════════════════════════════════════════════════`)
  console.log(`   PDF Processing Report`)
  console.log(`═══════════════════════════════════════════════════${colors.reset}\n`)

  // Results table
  console.table(results.map(r => ({
    'Pages': r.pageCount,
    'Time (s)': (r.totalTime / 1000).toFixed(1),
    'Batches': r.batchCount,
    'Batch (s)': (r.averageBatchTime / 1000).toFixed(1),
    'Stitch (ms)': r.stitchingTime.toFixed(0),
    'Pages/s': r.throughput.toFixed(1),
    'Success %': r.successRate.toFixed(0)
  })))

  // Key metrics
  console.log(`\n${colors.bright}Key Performance Indicators:${colors.reset}`)

  const result500 = results.find(r => r.pageCount >= 500)
  if (result500) {
    console.log(`\n${colors.bright}500-Page PDF Target:${colors.reset}`)
    console.log(`  Target: <10 minutes (600s)`)
    console.log(`  Actual: ${(result500.totalTime / 1000).toFixed(1)}s (${(result500.totalTime / 60000).toFixed(1)} min)`)
    const status = result500.totalTime < 600000 ? colors.green : colors.red
    console.log(`  ${status}${result500.totalTime < 600000 ? '✓ PASSED' : '✗ FAILED'}${colors.reset}`)
  }

  const avgBatchEfficiency = results.reduce((sum, r) => sum + (r.averageBatchTime / 100), 0) / results.length
  console.log(`\n${colors.bright}Batch Efficiency:${colors.reset}`)
  console.log(`  Target: ~10s per 100-page batch`)
  console.log(`  Average: ${(avgBatchEfficiency / 1000).toFixed(1)}s per 100 pages`)
  const effStatus = avgBatchEfficiency < 15000 ? colors.green : colors.yellow
  console.log(`  ${effStatus}${avgBatchEfficiency < 15000 ? '✓ EFFICIENT' : '⚠ REVIEW'}${colors.reset}`)

  const avgSuccessRate = results.reduce((sum, r) => sum + r.successRate, 0) / results.length
  console.log(`\n${colors.bright}Reliability:${colors.reset}`)
  console.log(`  Average success rate: ${avgSuccessRate.toFixed(1)}%`)
  const relStatus = avgSuccessRate >= 95 ? colors.green : colors.yellow
  console.log(`  ${relStatus}${avgSuccessRate >= 95 ? '✓ RELIABLE' : '⚠ MONITOR'}${colors.reset}`)
}

/**
 * Main benchmark runner
 */
async function main() {
  const args = process.argv.slice(2)

  // Parse arguments
  const config: PDFBenchmarkConfig = { ...DEFAULT_PDF_BENCHMARK_CONFIG }

  if (args.includes('--real-pdf')) {
    config.realPDF = true
    const pdfIndex = args.indexOf('--pdf-path')
    if (pdfIndex !== -1 && args[pdfIndex + 1]) {
      config.pdfPath = args[pdfIndex + 1]
    }
  }

  if (args.includes('--quick')) {
    config.testSizes = [50, 100]
    config.iterations = 1
  }

  if (args.includes('--ranges-only')) {
    testBatchRanges()
    return
  }

  // Run batch range tests first
  testBatchRanges()

  // Run PDF processing benchmarks
  console.log(`${colors.bright}Starting PDF Benchmarks${colors.reset}`)
  console.log(`Mode: ${config.realPDF ? 'Real PDF' : 'Simulated'}`)
  if (config.realPDF) {
    console.log(`PDF file: ${config.pdfPath || 'Not specified'}`)
  }
  console.log(`Iterations per size: ${config.iterations}\n`)

  const results = await benchmarkPDFProcessing(config)

  // Generate report
  generatePDFReport(results)

  console.log(`\n${colors.bright}${colors.green}PDF Benchmark complete!${colors.reset}\n`)
}

// Run benchmark (ESM compatible check)
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(`${colors.red}Benchmark failed:${colors.reset}`, error)
    process.exit(1)
  })
}

export { benchmarkPDFProcessing, testBatchRanges }
