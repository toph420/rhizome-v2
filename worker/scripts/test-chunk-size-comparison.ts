/**
 * A/B Testing Script: 512 vs 768 Token Chunk Size Comparison
 *
 * Usage:
 *   npx tsx scripts/test-chunk-size-comparison.ts /path/to/test.pdf
 *
 * Purpose:
 *   Validate the 512 → 768 token increase by comparing:
 *   - Chunk count (expect ~30% reduction)
 *   - Average tokens (expect ~50% increase)
 *   - Processing time (expect <15% increase)
 *   - Semantic coherence (expect >5% improvement)
 *
 * Phase 6 Task T-019: A/B Testing for Docling Optimization v1
 */

import { extractPdfBuffer } from '../lib/docling-extractor.js'
import { cleanPageArtifacts } from '../lib/text-cleanup.js'
import { calculateChunkStatistics, compareChunkStatistics, logChunkStatistics } from '../lib/chunking/chunk-statistics.js'
import * as fs from 'fs'
import * as path from 'path'

interface ComparisonConfig {
  tokenSize: number
  label: string
}

interface ComparisonResult {
  config: ComparisonConfig
  chunkCount: number
  stats: ReturnType<typeof calculateChunkStatistics>
  processingTimeMs: number
}

/**
 * Extract and chunk a PDF with specified token size
 */
async function processPdfWithTokenSize(
  pdfPath: string,
  tokenSize: number,
  label: string
): Promise<ComparisonResult> {
  console.log(`\n[${'='.repeat(60)}]`)
  console.log(`[${label}: Processing with ${tokenSize} tokens]`)
  console.log(`[${'='.repeat(60)}]\n`)

  const startTime = Date.now()

  // Read PDF file
  const pdfBuffer = fs.readFileSync(pdfPath)
  console.log(`[${label}] PDF size: ${Math.round(pdfBuffer.length / 1024)}KB`)

  // Extract with Docling
  console.log(`[${label}] Extracting with Docling (${tokenSize} tokens)...`)
  const extractionResult = await extractPdfBuffer(pdfBuffer, {
    enableChunking: true,
    tokenizer: 'Xenova/all-mpnet-base-v2',
    chunkSize: tokenSize,
    timeout: 10 * 60 * 1000, // 10 minutes
    onProgress: async (percent, stage, message) => {
      if (percent % 20 === 0) {
        console.log(`[${label}] Progress: ${percent}% - ${message}`)
      }
    }
  })

  // Clean markdown
  let markdown = extractionResult.markdown
  markdown = cleanPageArtifacts(markdown, { skipHeadingGeneration: true })

  const processingTimeMs = Date.now() - startTime

  // Calculate statistics
  const chunks = extractionResult.chunks || []
  const stats = calculateChunkStatistics(chunks, tokenSize)

  console.log(`[${label}] Processing complete in ${(processingTimeMs / 1000).toFixed(1)}s`)
  console.log(`[${label}] Extracted ${chunks.length} chunks`)

  return {
    config: { tokenSize, label },
    chunkCount: chunks.length,
    stats,
    processingTimeMs
  }
}

/**
 * Print comparison report
 */
function printComparisonReport(baseline: ComparisonResult, optimized: ComparisonResult): void {
  console.log(`\n${'='.repeat(80)}`)
  console.log('A/B TESTING RESULTS: 512 vs 768 Token Comparison')
  console.log('='.repeat(80))

  // Chunk statistics comparison
  console.log('\n📊 CHUNK STATISTICS COMPARISON\n')
  compareChunkStatistics(baseline.stats, optimized.stats, baseline.config.label, optimized.config.label)

  // Processing time comparison
  console.log('⏱️  PROCESSING TIME COMPARISON\n')
  const baselineTimeS = baseline.processingTimeMs / 1000
  const optimizedTimeS = optimized.processingTimeMs / 1000
  const timeDiff = optimizedTimeS - baselineTimeS
  const timePercentDiff = ((timeDiff / baselineTimeS) * 100).toFixed(1)
  const timeEmoji = Math.abs(parseFloat(timePercentDiff)) < 15 ? '✅' : '⚠️'

  console.log(`Baseline (${baseline.config.tokenSize} tokens):  ${baselineTimeS.toFixed(1)}s`)
  console.log(`Optimized (${optimized.config.tokenSize} tokens): ${optimizedTimeS.toFixed(1)}s`)
  console.log(`Difference: ${timeEmoji} ${timeDiff > 0 ? '+' : ''}${timeDiff.toFixed(1)}s (${timeDiff > 0 ? '+' : ''}${timePercentDiff}%)`)

  // Recommendations
  console.log('\n' + '='.repeat(80))
  console.log('📋 RECOMMENDATIONS')
  console.log('='.repeat(80) + '\n')

  const chunkReduction = ((baseline.chunkCount - optimized.chunkCount) / baseline.chunkCount) * 100
  const tokenIncrease = ((optimized.stats.avgTokens - baseline.stats.avgTokens) / baseline.stats.avgTokens) * 100
  const coherenceIncrease = (optimized.stats.semanticCoherence - baseline.stats.semanticCoherence) * 100
  const timeIncrease = parseFloat(timePercentDiff)

  const recommendations: string[] = []

  // Chunk count
  if (chunkReduction >= 25) {
    recommendations.push(`✅ ${optimized.config.tokenSize} tokens reduces chunk count by ${chunkReduction.toFixed(1)}% (target: >25%)`)
  } else {
    recommendations.push(`⚠️  ${optimized.config.tokenSize} tokens reduces chunk count by only ${chunkReduction.toFixed(1)}% (target: >25%)`)
  }

  // Token increase
  if (tokenIncrease >= 40) {
    recommendations.push(`✅ ${optimized.config.tokenSize} tokens increases avg tokens by ${tokenIncrease.toFixed(1)}% (target: >40%)`)
  } else {
    recommendations.push(`⚠️  ${optimized.config.tokenSize} tokens increases avg tokens by only ${tokenIncrease.toFixed(1)}% (target: >40%)`)
  }

  // Semantic coherence
  if (coherenceIncrease >= 5) {
    recommendations.push(`✅ ${optimized.config.tokenSize} tokens improves semantic coherence by ${coherenceIncrease.toFixed(1)}pp (target: >5pp)`)
  } else if (coherenceIncrease >= 0) {
    recommendations.push(`⚡ ${optimized.config.tokenSize} tokens improves semantic coherence by ${coherenceIncrease.toFixed(1)}pp (acceptable)`)
  } else {
    recommendations.push(`⚠️  ${optimized.config.tokenSize} tokens decreases semantic coherence by ${Math.abs(coherenceIncrease).toFixed(1)}pp`)
  }

  // Processing time
  if (timeIncrease < 15) {
    recommendations.push(`✅ ${optimized.config.tokenSize} tokens increases processing time by only ${timeIncrease.toFixed(1)}% (target: <15%)`)
  } else {
    recommendations.push(`⚠️  ${optimized.config.tokenSize} tokens increases processing time by ${timeIncrease.toFixed(1)}% (target: <15%)`)
  }

  // Metadata coverage
  const metadataBaseline = (baseline.stats.withMetadata / baseline.stats.total) * 100
  const metadataOptimized = (optimized.stats.withMetadata / optimized.stats.total) * 100
  if (metadataOptimized >= 70) {
    recommendations.push(`✅ ${optimized.config.tokenSize} tokens has ${metadataOptimized.toFixed(1)}% metadata coverage (target: >70%)`)
  } else {
    recommendations.push(`⚠️  ${optimized.config.tokenSize} tokens has ${metadataOptimized.toFixed(1)}% metadata coverage (target: >70%)`)
  }

  recommendations.forEach(rec => console.log(rec))

  // Final recommendation
  console.log('\n' + '-'.repeat(80))
  const passCount = recommendations.filter(r => r.startsWith('✅')).length
  const totalChecks = recommendations.length

  if (passCount === totalChecks) {
    console.log('🎉 RECOMMENDATION: Use 768 tokens - all quality targets met!')
  } else if (passCount >= totalChecks * 0.75) {
    console.log('✅ RECOMMENDATION: Use 768 tokens - most quality targets met')
  } else if (passCount >= totalChecks * 0.5) {
    console.log('⚡ RECOMMENDATION: Consider using 768 tokens - mixed results')
  } else {
    console.log('⚠️  RECOMMENDATION: Stick with 512 tokens - quality targets not met')
  }
  console.log('-'.repeat(80) + '\n')
}

/**
 * Main execution
 */
async function main() {
  const args = process.argv.slice(2)

  if (args.length === 0) {
    console.error('Usage: npx tsx scripts/test-chunk-size-comparison.ts <pdf-path>')
    console.error('')
    console.error('Example:')
    console.error('  npx tsx scripts/test-chunk-size-comparison.ts /path/to/test.pdf')
    process.exit(1)
  }

  const pdfPath = args[0]

  // Validate PDF exists
  if (!fs.existsSync(pdfPath)) {
    console.error(`Error: PDF file not found: ${pdfPath}`)
    process.exit(1)
  }

  // Validate it's a PDF
  if (!pdfPath.toLowerCase().endsWith('.pdf')) {
    console.error(`Error: File must be a PDF: ${pdfPath}`)
    process.exit(1)
  }

  console.log('\n' + '='.repeat(80))
  console.log('A/B Testing: 512 vs 768 Token Chunk Size Comparison')
  console.log('='.repeat(80))
  console.log(`\nPDF: ${path.basename(pdfPath)}`)
  console.log(`Full path: ${pdfPath}\n`)

  try {
    // Process with 512 tokens (baseline)
    const baseline = await processPdfWithTokenSize(pdfPath, 512, 'Baseline (512 tokens)')

    // Process with 768 tokens (optimized)
    const optimized = await processPdfWithTokenSize(pdfPath, 768, 'Optimized (768 tokens)')

    // Print comparison report
    printComparisonReport(baseline, optimized)

    console.log('✅ A/B testing complete!')
  } catch (error: any) {
    console.error('\n❌ A/B testing failed:', error.message)
    console.error(error.stack)
    process.exit(1)
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error('Fatal error:', error)
    process.exit(1)
  })
}
