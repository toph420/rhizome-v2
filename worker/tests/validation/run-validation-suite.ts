#!/usr/bin/env tsx

/**
 * Metadata Validation Suite Runner
 * 
 * Main entry point for running comprehensive validation of the metadata extraction system.
 * Tests all 6 processors with diverse content and generates a quality report.
 * 
 * Usage:
 *   npm run validate:metadata                    # Run with mock extraction
 *   npm run validate:metadata -- --real-ai       # Run with real Gemini API
 *   npm run validate:metadata -- --verbose       # Show detailed output
 *   npm run validate:metadata -- --save-corpus   # Save test corpus for reuse
 * 
 * @module validation/run-validation-suite
 */

import * as path from 'path'
import { fileURLToPath } from 'url'
import { MetadataQualityFramework } from './metadata-quality-framework'
import { TestCorpusBuilder } from './test-corpus-builder'
import type { ProcessedChunk } from '../../types/processor'
import type { GroundTruth } from './metadata-quality-framework'

// Get __dirname equivalent for ES modules
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Color output helpers
const colors = {
  green: (text: string) => `\x1b[32m${text}\x1b[0m`,
  red: (text: string) => `\x1b[31m${text}\x1b[0m`,
  yellow: (text: string) => `\x1b[33m${text}\x1b[0m`,
  cyan: (text: string) => `\x1b[36m${text}\x1b[0m`,
  bold: (text: string) => `\x1b[1m${text}\x1b[0m`,
  dim: (text: string) => `\x1b[2m${text}\x1b[0m`
}

// Parse command line arguments
const args = process.argv.slice(2)
const useRealAI = args.includes('--real-ai')
const verbose = args.includes('--verbose')
const saveCorpus = args.includes('--save-corpus')
const loadCorpus = args.includes('--load-corpus')

/**
 * Progress bar display.
 */
function showProgress(current: number, total: number, label: string): void {
  const percentage = Math.round((current / total) * 100)
  const barLength = 40
  const filled = Math.round((current / total) * barLength)
  const empty = barLength - filled
  
  const bar = '█'.repeat(filled) + '░'.repeat(empty)
  
  process.stdout.write(`\r${label}: [${bar}] ${percentage}% (${current}/${total})`)
  
  if (current === total) {
    process.stdout.write('\n')
  }
}

/**
 * Main validation runner.
 */
async function main() {
  console.log(colors.bold('\n🔬 Metadata Extraction Quality Validation Suite\n'))
  console.log('=' .repeat(60))
  
  // Configuration
  console.log('\n' + colors.cyan('Configuration:'))
  console.log(`  - AI Mode: ${useRealAI ? colors.green('Real Gemini API') : colors.yellow('Mock Extraction')}`)
  console.log(`  - Verbose: ${verbose ? 'Yes' : 'No'}`)
  console.log(`  - Corpus: ${loadCorpus ? 'Load from disk' : 'Generate new'}`)
  
  if (useRealAI && !process.env.GEMINI_API_KEY) {
    console.error(colors.red('\n❌ Error: GEMINI_API_KEY environment variable not set'))
    console.log('Please set your Gemini API key to use real AI validation:')
    console.log('  export GEMINI_API_KEY="your-api-key"')
    process.exit(1)
  }
  
  // Initialize framework
  const framework = new MetadataQualityFramework({
    useRealAI,
    geminiApiKey: process.env.GEMINI_API_KEY,
    targetCompleteness: 90,
    targetPrecision: 85,
    targetRecall: 85,
    targetF1Score: 85,
    maxExtractionTime: 400,
    verbose
  })
  
  // Build or load test corpus
  console.log('\n' + colors.cyan('Building Test Corpus:'))
  const corpusBuilder = new TestCorpusBuilder()
  
  if (loadCorpus) {
    const corpusPath = path.join(__dirname, 'corpus')
    await corpusBuilder.loadCorpus(corpusPath)
  } else {
    corpusBuilder.buildStandardCorpus()
    
    if (saveCorpus) {
      const corpusPath = path.join(__dirname, 'corpus')
      await corpusBuilder.saveCorpus(corpusPath)
    }
  }
  
  const documents = corpusBuilder.getDocuments()
  const allChunks = corpusBuilder.getAllChunks()
  const allGroundTruth = corpusBuilder.getAllGroundTruth()
  
  console.log(`  - Documents: ${documents.length}`)
  console.log(`  - Chunks: ${allChunks.length}`)
  console.log(`  - Categories: ${[...new Set(documents.map(d => d.category))].join(', ')}`)
  console.log(`  - Formats: ${[...new Set(documents.map(d => d.format))].join(', ')}`)
  
  // Run validation
  console.log('\n' + colors.cyan('Running Validation:'))
  console.log('=' .repeat(60))
  
  const startTime = Date.now()
  let processedCount = 0
  
  // Process each document
  for (const doc of documents) {
    if (verbose) {
      console.log(`\n${colors.bold(doc.name)} (${doc.category}/${doc.format})`)
    }
    
    // Process each chunk in the document
    for (let i = 0; i < doc.chunks.length; i++) {
      const chunk = doc.chunks[i]
      const groundTruth = doc.groundTruth[i]
      
      if (!groundTruth) {
        console.error(colors.red(`Missing ground truth for chunk ${i} in ${doc.name}`))
        continue
      }
      
      // Validate chunk
      await framework.validateChunk(chunk, groundTruth)
      
      processedCount++
      
      if (!verbose) {
        showProgress(processedCount, allChunks.length, 'Processing')
      }
    }
  }
  
  const totalTime = Date.now() - startTime
  
  // Get aggregate metrics
  console.log('\n' + colors.cyan('Calculating Metrics:'))
  const metrics = framework.getAggregateMetrics()
  
  // Display summary
  console.log('\n' + '=' .repeat(60))
  console.log(colors.bold('\n📊 Validation Summary\n'))
  
  // Quality metrics table
  console.log(colors.cyan('Quality Metrics:'))
  console.log('┌─────────────────┬──────────┬──────────┬─────────┐')
  console.log('│ Metric          │ Average  │ Target   │ Status  │')
  console.log('├─────────────────┼──────────┼──────────┼─────────┤')
  
  const formatMetricRow = (name: string, value: number, target: number) => {
    const status = value >= target ? colors.green('✅ Pass') : colors.red('❌ Fail')
    return `│ ${name.padEnd(15)} │ ${value.toFixed(1).padStart(7)}% │ ${target.toFixed(0).padStart(7)}% │ ${status} │`
  }
  
  console.log(formatMetricRow('Completeness', metrics.averageCompleteness, 90))
  console.log(formatMetricRow('Precision', metrics.averagePrecision, 85))
  console.log(formatMetricRow('Recall', metrics.averageRecall, 85))
  console.log(formatMetricRow('F1 Score', metrics.averageF1Score, 85))
  console.log('└─────────────────┴──────────┴──────────┴─────────┘')
  
  // Performance metrics table
  console.log('\n' + colors.cyan('Performance Metrics:'))
  console.log('┌─────────────────┬──────────┬──────────┬─────────┐')
  console.log('│ Metric          │ Value    │ Target   │ Status  │')
  console.log('├─────────────────┼──────────┼──────────┼─────────┤')
  
  const perfStatus = metrics.averageExtractionTime <= 400 ? colors.green('✅ Pass') : colors.red('❌ Fail')
  console.log(`│ Avg Time        │ ${metrics.averageExtractionTime.toFixed(0).padStart(6)}ms │  <400ms  │ ${perfStatus} │`)
  console.log(`│ P90 Time        │ ${metrics.p90ExtractionTime.toString().padStart(6)}ms │     -    │    -    │`)
  console.log(`│ P95 Time        │ ${metrics.p95ExtractionTime.toString().padStart(6)}ms │     -    │    -    │`)
  console.log(`│ P99 Time        │ ${metrics.p99ExtractionTime.toString().padStart(6)}ms │     -    │    -    │`)
  console.log('└─────────────────┴──────────┴──────────┴─────────┘')
  
  // Overall results
  console.log('\n' + colors.cyan('Overall Results:'))
  console.log(`  - Total Chunks: ${metrics.totalChunks}`)
  console.log(`  - Passed: ${colors.green(metrics.passedChunks.toString())} (${metrics.passRate.toFixed(1)}%)`)
  console.log(`  - Failed: ${colors.red(metrics.failedChunks.toString())} (${(100 - metrics.passRate).toFixed(1)}%)`)
  console.log(`  - Total Time: ${(totalTime / 1000).toFixed(1)}s`)
  console.log(`  - Time per Chunk: ${(totalTime / metrics.totalChunks).toFixed(0)}ms`)
  
  // Identify problem areas
  if (metrics.failedChunks > 0) {
    console.log('\n' + colors.yellow('⚠️  Problem Areas:'))
    
    const failedMetrics = framework.getMetrics().filter(m => !m.passed)
    const commonMissing = new Map<string, number>()
    
    for (const metric of failedMetrics) {
      for (const field of metric.missingFields) {
        commonMissing.set(field, (commonMissing.get(field) || 0) + 1)
      }
    }
    
    const topMissing = Array.from(commonMissing.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
    
    if (topMissing.length > 0) {
      console.log('\n  Most commonly missing fields:')
      for (const [field, count] of topMissing) {
        const percentage = (count / metrics.failedChunks) * 100
        console.log(`    - ${field}: ${count} times (${percentage.toFixed(0)}% of failures)`)
      }
    }
  }
  
  // Generate and save report
  console.log('\n' + colors.cyan('Generating Report:'))
  const reportPath = path.join(__dirname, 'reports', `validation-report-${Date.now()}.md`)
  await framework.saveReport(reportPath)
  
  // Final verdict
  console.log('\n' + '=' .repeat(60))
  
  const allTargetsMet = 
    metrics.averageCompleteness >= 90 &&
    metrics.averagePrecision >= 85 &&
    metrics.averageRecall >= 85 &&
    metrics.averageF1Score >= 85 &&
    metrics.averageExtractionTime <= 400
  
  if (allTargetsMet) {
    console.log(colors.green(colors.bold('\n✅ VALIDATION PASSED!')))
    console.log(colors.green('The metadata extraction system meets all quality targets.'))
    console.log(colors.green('Ready for production use! 🎉'))
  } else {
    console.log(colors.red(colors.bold('\n❌ VALIDATION FAILED')))
    console.log(colors.red('The metadata extraction system does not meet all targets.'))
    console.log(colors.yellow('\nRecommendations:'))
    
    if (metrics.averageCompleteness < 90) {
      console.log('  - Improve metadata extraction prompts for better completeness')
    }
    if (metrics.averagePrecision < 85 || metrics.averageRecall < 85) {
      console.log('  - Fine-tune extraction logic for specific content types')
    }
    if (metrics.averageF1Score < 85) {
      console.log('  - Balance precision and recall in extraction algorithms')
    }
    if (metrics.averageExtractionTime > 400) {
      console.log('  - Optimize extraction performance (consider parallelization)')
    }
    
    if (!useRealAI) {
      console.log('\n' + colors.yellow('💡 Tip: Run with --real-ai flag to test with actual Gemini API'))
    }
  }
  
  // Exit with appropriate code
  process.exit(allTargetsMet ? 0 : 1)
}

// Error handling
process.on('unhandledRejection', (error) => {
  console.error(colors.red('\n❌ Unhandled error:'), error)
  process.exit(1)
})

// Run validation
main().catch(error => {
  console.error(colors.red('\n❌ Validation failed:'), error)
  process.exit(1)
})