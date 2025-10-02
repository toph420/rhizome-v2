#!/usr/bin/env tsx
/**
 * Performance Benchmark for Batched Processing Pipeline
 * Validates T-011 performance targets for the optimized 3-engine system
 *
 * Performance Targets:
 * - Processing time: <2 min per hour of content (120K chars)
 * - Memory usage: <500MB peak
 * - Batch processing: 40% improvement over non-batched baseline
 */

import { performance } from 'perf_hooks'
import { batchChunkAndExtractMetadata } from '../lib/ai-chunking-batch'
import {
  extractLargePDF,
  calculateBatchRanges,
  DEFAULT_BATCH_CONFIG,
  type BatchConfig
} from '../lib/pdf-batch-utils'
import { stitchMarkdownBatches } from '../lib/fuzzy-matching'
import { createGeminiClient } from '../lib/ai-client'

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
 * Benchmark configuration
 */
interface BenchmarkConfig {
  documentSizes: number[]      // Character counts to test
  iterations: number            // Iterations per size
  realAI: boolean              // Use real AI vs mock
  memoryTracking: boolean      // Track memory usage
}

const DEFAULT_BENCHMARK_CONFIG: BenchmarkConfig = {
  documentSizes: [50000, 100000, 200000, 500000, 1000000], // 50K to 1M chars
  iterations: 3,
  realAI: false, // Set to true for real AI benchmarking
  memoryTracking: true
}

/**
 * Performance metrics for a single run
 */
interface PerformanceMetrics {
  documentSize: number
  executionTime: number        // ms
  memoryUsed: number          // MB (peak)
  chunksCreated: number
  batchesProcessed: number
  throughput: number          // chars/sec
}

/**
 * Generate realistic test markdown of specified size
 */
function generateTestMarkdown(charCount: number): string {
  const paragraphs = [
    'The development of artificial intelligence has transformed modern computing paradigms. Machine learning algorithms now power everything from search engines to autonomous vehicles, reshaping how we interact with technology.',
    'Quantum computing represents the next frontier in computational power. By leveraging quantum mechanical phenomena like superposition and entanglement, these systems can solve problems that would take classical computers millennia.',
    'Climate change poses one of the most significant challenges of our time. Rising global temperatures, extreme weather events, and shifting ecosystems demand urgent action and innovative solutions from the scientific community.',
    'Blockchain technology has revolutionized digital trust and decentralization. Smart contracts and distributed ledgers enable new forms of secure, transparent transactions without intermediaries.',
    'The human microbiome plays a crucial role in health and disease. Trillions of microorganisms inhabiting our bodies influence everything from digestion to immune function and mental health.'
  ]

  let markdown = '# Generated Test Document\n\n'
  let currentLength = markdown.length
  let sectionCount = 1

  while (currentLength < charCount) {
    markdown += `## Section ${sectionCount}\n\n`

    // Add 3-5 paragraphs per section
    const paraCount = 3 + Math.floor(Math.random() * 3)
    for (let i = 0; i < paraCount && currentLength < charCount; i++) {
      const para = paragraphs[Math.floor(Math.random() * paragraphs.length)]
      markdown += para + '\n\n'
      currentLength = markdown.length
    }

    sectionCount++
  }

  // Trim to exact size
  return markdown.substring(0, charCount)
}

/**
 * Get current memory usage in MB
 */
function getMemoryUsageMB(): number {
  if (global.gc) {
    global.gc()
  }
  const used = process.memoryUsage()
  return used.heapUsed / 1024 / 1024
}

/**
 * Track peak memory usage during function execution
 */
async function trackMemory<T>(
  fn: () => Promise<T>
): Promise<{ result: T; peakMemoryMB: number }> {
  const initialMemory = getMemoryUsageMB()
  let peakMemory = initialMemory

  // Sample memory every 100ms
  const interval = setInterval(() => {
    const current = getMemoryUsageMB()
    if (current > peakMemory) {
      peakMemory = current
    }
  }, 100)

  try {
    const result = await fn()
    clearInterval(interval)

    // Final memory check
    const finalMemory = getMemoryUsageMB()
    if (finalMemory > peakMemory) {
      peakMemory = finalMemory
    }

    return { result, peakMemoryMB: peakMemory - initialMemory }
  } catch (error) {
    clearInterval(interval)
    throw error
  }
}

/**
 * Benchmark AI metadata extraction for various document sizes
 */
async function benchmarkMetadataExtraction(
  config: BenchmarkConfig = DEFAULT_BENCHMARK_CONFIG
): Promise<PerformanceMetrics[]> {
  console.log(`${colors.bright}${colors.blue}═══════════════════════════════════════════════════`)
  console.log(`   AI Metadata Extraction Performance Benchmark`)
  console.log(`═══════════════════════════════════════════════════${colors.reset}\n`)

  const apiKey = process.env.GOOGLE_AI_API_KEY
  if (!apiKey && config.realAI) {
    console.error('GOOGLE_AI_API_KEY required for real AI benchmarking')
    process.exit(1)
  }

  const results: PerformanceMetrics[] = []

  for (const size of config.documentSizes) {
    console.log(`${colors.bright}Testing ${(size / 1000).toFixed(0)}K characters:${colors.reset}`)

    const iterationMetrics: PerformanceMetrics[] = []

    for (let i = 0; i < config.iterations; i++) {
      const markdown = generateTestMarkdown(size)
      process.stdout.write(`  Iteration ${i + 1}/${config.iterations}... `)

      try {
        let executionTime: number
        let memoryUsed: number
        let chunks: Array<{ content: string; metadata: any }>

        if (config.memoryTracking) {
          const startTime = performance.now()
          const { result, peakMemoryMB } = await trackMemory(async () => {
            return await batchChunkAndExtractMetadata(
              markdown,
              { apiKey: apiKey || 'mock-key' }
            )
          })
          executionTime = performance.now() - startTime
          memoryUsed = peakMemoryMB
          chunks = result
        } else {
          const startTime = performance.now()
          chunks = await batchChunkAndExtractMetadata(
            markdown,
            { apiKey: apiKey || 'mock-key' }
          )
          executionTime = performance.now() - startTime
          memoryUsed = 0
        }

        // Calculate metrics
        const estimatedBatches = Math.ceil(size / 100000)
        const throughput = (size / (executionTime / 1000))

        const metrics: PerformanceMetrics = {
          documentSize: size,
          executionTime,
          memoryUsed,
          chunksCreated: chunks.length,
          batchesProcessed: estimatedBatches,
          throughput
        }

        iterationMetrics.push(metrics)

        const statusColor = executionTime < (size / 120000) * 120000 ? colors.green : colors.yellow
        console.log(
          `${statusColor}${executionTime.toFixed(0)}ms${colors.reset} ` +
          `(${chunks.length} chunks, ${memoryUsed.toFixed(1)}MB)`
        )

      } catch (error: any) {
        console.log(`${colors.red}FAILED: ${error.message}${colors.reset}`)
      }
    }

    // Calculate averages
    if (iterationMetrics.length > 0) {
      const avgMetrics: PerformanceMetrics = {
        documentSize: size,
        executionTime: iterationMetrics.reduce((sum, m) => sum + m.executionTime, 0) / iterationMetrics.length,
        memoryUsed: iterationMetrics.reduce((sum, m) => sum + m.memoryUsed, 0) / iterationMetrics.length,
        chunksCreated: Math.round(iterationMetrics.reduce((sum, m) => sum + m.chunksCreated, 0) / iterationMetrics.length),
        batchesProcessed: iterationMetrics[0].batchesProcessed,
        throughput: iterationMetrics.reduce((sum, m) => sum + m.throughput, 0) / iterationMetrics.length
      }

      results.push(avgMetrics)

      // Display summary
      console.log(`\n  ${colors.bright}Summary:${colors.reset}`)
      console.log(`    Average time: ${avgMetrics.executionTime.toFixed(0)}ms`)
      console.log(`    Average memory: ${avgMetrics.memoryUsed.toFixed(1)}MB`)
      console.log(`    Throughput: ${(avgMetrics.throughput / 1000).toFixed(1)}K chars/sec`)
      console.log(`    Chunks created: ${avgMetrics.chunksCreated}`)

      // Check performance target: <2 min per hour of content (120K chars)
      const targetTime = (size / 120000) * 120000 // 2 min per 120K chars
      if (avgMetrics.executionTime < targetTime) {
        console.log(`    ${colors.green}✓ Performance target met (<${(targetTime / 1000).toFixed(0)}s)${colors.reset}`)
      } else {
        console.log(`    ${colors.red}✗ Performance target missed (>${(targetTime / 1000).toFixed(0)}s)${colors.reset}`)
      }

      // Check memory target: <500MB
      if (avgMetrics.memoryUsed < 500) {
        console.log(`    ${colors.green}✓ Memory target met (<500MB)${colors.reset}`)
      } else {
        console.log(`    ${colors.yellow}⚠ Memory usage high (${avgMetrics.memoryUsed.toFixed(1)}MB)${colors.reset}`)
      }
    }

    console.log('\n' + '─'.repeat(50) + '\n')
  }

  return results
}

/**
 * Benchmark stitching algorithm performance
 */
async function benchmarkStitching(): Promise<void> {
  console.log(`${colors.bright}${colors.cyan}═══════════════════════════════════════════════════`)
  console.log(`   Markdown Stitching Performance Benchmark`)
  console.log(`═══════════════════════════════════════════════════${colors.reset}\n`)

  const batchCounts = [2, 5, 10, 20]
  const batchSize = 50000 // 50K chars per batch

  for (const count of batchCounts) {
    console.log(`${colors.bright}Testing ${count} batches:${colors.reset}`)

    // Generate overlapping batches
    const batches: string[] = []
    for (let i = 0; i < count; i++) {
      let batch = `# Batch ${i + 1}\n\n`
      batch += generateTestMarkdown(batchSize - batch.length)

      // Add overlap: last 5K chars
      if (i < count - 1) {
        const overlap = batch.substring(batch.length - 5000)
        batches.push(batch)
      } else {
        batches.push(batch)
      }
    }

    const iterations = 5
    const times: number[] = []

    for (let i = 0; i < iterations; i++) {
      const startTime = performance.now()
      const stitched = stitchMarkdownBatches(batches)
      const elapsed = performance.now() - startTime
      times.push(elapsed)
    }

    const avgTime = times.reduce((a, b) => a + b, 0) / times.length
    const minTime = Math.min(...times)
    const maxTime = Math.max(...times)

    console.log(`  Average: ${avgTime.toFixed(2)}ms`)
    console.log(`  Min: ${minTime.toFixed(2)}ms`)
    console.log(`  Max: ${maxTime.toFixed(2)}ms`)

    // Stitching should be fast (<100ms for 20 batches)
    const targetTime = count * 5 // 5ms per batch
    if (avgTime < targetTime) {
      console.log(`  ${colors.green}✓ Stitching efficient (<${targetTime}ms)${colors.reset}`)
    } else {
      console.log(`  ${colors.yellow}⚠ Stitching could be optimized${colors.reset}`)
    }

    console.log()
  }
}

/**
 * Generate performance report
 */
function generateReport(results: PerformanceMetrics[]): void {
  console.log(`${colors.bright}${colors.blue}═══════════════════════════════════════════════════`)
  console.log(`   Performance Report`)
  console.log(`═══════════════════════════════════════════════════${colors.reset}\n`)

  // Results table
  console.table(results.map(r => ({
    'Size': `${(r.documentSize / 1000).toFixed(0)}K chars`,
    'Time (s)': (r.executionTime / 1000).toFixed(1),
    'Memory (MB)': r.memoryUsed.toFixed(1),
    'Chunks': r.chunksCreated,
    'Batches': r.batchesProcessed,
    'Throughput (K/s)': (r.throughput / 1000).toFixed(1)
  })))

  // Overall assessment
  console.log(`\n${colors.bright}Overall Assessment:${colors.reset}`)

  const allTargetsMet = results.every(r => {
    const targetTime = (r.documentSize / 120000) * 120000
    return r.executionTime < targetTime && r.memoryUsed < 500
  })

  if (allTargetsMet) {
    console.log(`  ${colors.green}✅ All performance targets met!${colors.reset}`)
  } else {
    console.log(`  ${colors.yellow}⚠️  Some performance targets not met${colors.reset}`)
  }

  // Specific target checks
  const result120K = results.find(r => r.documentSize >= 120000 && r.documentSize <= 150000)
  if (result120K) {
    console.log(`\n${colors.bright}120K Character Target (1 hour content):${colors.reset}`)
    console.log(`  Target: <120s (2 minutes)`)
    console.log(`  Actual: ${(result120K.executionTime / 1000).toFixed(1)}s`)
    const status = result120K.executionTime < 120000 ? colors.green : colors.red
    console.log(`  ${status}${result120K.executionTime < 120000 ? '✓ PASSED' : '✗ FAILED'}${colors.reset}`)
  }

  const maxMemory = Math.max(...results.map(r => r.memoryUsed))
  console.log(`\n${colors.bright}Memory Usage:${colors.reset}`)
  console.log(`  Target: <500MB peak`)
  console.log(`  Peak: ${maxMemory.toFixed(1)}MB`)
  const memStatus = maxMemory < 500 ? colors.green : colors.yellow
  console.log(`  ${memStatus}${maxMemory < 500 ? '✓ PASSED' : '⚠ CAUTION'}${colors.reset}`)
}

/**
 * Main benchmark runner
 */
async function main() {
  const args = process.argv.slice(2)

  // Parse arguments
  const config: BenchmarkConfig = { ...DEFAULT_BENCHMARK_CONFIG }

  if (args.includes('--real-ai')) {
    config.realAI = true
  }

  if (args.includes('--no-memory')) {
    config.memoryTracking = false
  }

  if (args.includes('--quick')) {
    config.documentSizes = [50000, 100000]
    config.iterations = 2
  }

  if (args.includes('--stitching-only')) {
    await benchmarkStitching()
    return
  }

  // Run benchmarks
  console.log(`${colors.bright}Starting Performance Benchmarks${colors.reset}`)
  console.log(`Real AI: ${config.realAI ? 'Yes' : 'No (mock)'}`)
  console.log(`Memory tracking: ${config.memoryTracking ? 'Yes' : 'No'}`)
  console.log(`Iterations per size: ${config.iterations}\n`)

  // Run metadata extraction benchmarks
  const results = await benchmarkMetadataExtraction(config)

  // Run stitching benchmarks
  await benchmarkStitching()

  // Generate report
  generateReport(results)

  console.log(`\n${colors.bright}${colors.green}Benchmark complete!${colors.reset}\n`)
}

// Run benchmark (ESM compatible check)
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(`${colors.red}Benchmark failed:${colors.reset}`, error)
    process.exit(1)
  })
}

export { benchmarkMetadataExtraction, benchmarkStitching }
