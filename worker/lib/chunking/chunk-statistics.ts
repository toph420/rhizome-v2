/**
 * Chunk quality and size statistics.
 * Used to validate chunking improvements and detect regressions.
 *
 * Key Metrics:
 * - Token distribution (avg, min, max)
 * - Metadata coverage (heading_path presence)
 * - Semantic coherence (sentence boundary alignment)
 * - Size anomalies (oversized, undersized chunks)
 */

export interface ChunkStatistics {
  total: number
  avgTokens: number
  minTokens: number
  maxTokens: number
  oversized: number            // Chunks > max_tokens
  undersized: number           // Chunks < 100 tokens
  withMetadata: number         // Chunks with heading_path
  metadataEnhanced: number     // Chunks with enhanced embeddings (set externally)
  semanticCoherence: number    // % ending on sentence boundary
}

/**
 * Calculate comprehensive statistics for a set of chunks.
 *
 * @param chunks - Array of chunks with content and optional metadata
 * @param maxTokens - Maximum expected tokens per chunk (default: 768)
 * @returns ChunkStatistics object with all metrics
 *
 * @example
 * ```typescript
 * const stats = calculateChunkStatistics(finalChunks, 768)
 * logChunkStatistics(stats, 'PDF Chunks')
 * ```
 */
export function calculateChunkStatistics(
  chunks: Array<{
    content: string
    heading_path?: string[] | null
  }>,
  maxTokens: number = 768
): ChunkStatistics {
  const stats: ChunkStatistics = {
    total: chunks.length,
    avgTokens: 0,
    minTokens: Infinity,
    maxTokens: 0,
    oversized: 0,
    undersized: 0,
    withMetadata: 0,
    metadataEnhanced: 0,  // Must be set externally by caller
    semanticCoherence: 0
  }

  if (chunks.length === 0) {
    stats.minTokens = 0
    return stats
  }

  let totalTokens = 0
  let endsOnSentence = 0

  for (const chunk of chunks) {
    // Rough token count estimation: 1 token ≈ 4 characters
    // This matches the validation logic in metadata-context.ts
    const tokens = Math.ceil(chunk.content.length / 4)

    totalTokens += tokens
    stats.minTokens = Math.min(stats.minTokens, tokens)
    stats.maxTokens = Math.max(stats.maxTokens, tokens)

    // Flag oversized chunks (exceed max_tokens threshold)
    if (tokens > maxTokens) {
      stats.oversized++
    }

    // Flag undersized chunks (< 100 tokens may indicate chunking issues)
    if (tokens < 100) {
      stats.undersized++
    }

    // Track metadata coverage
    if (chunk.heading_path && chunk.heading_path.length > 0) {
      stats.withMetadata++
    }

    // Check semantic coherence (ends on sentence boundary)
    // Proper sentence endings: . ! ? followed by optional quotes/parens
    if (chunk.content.trim().match(/[.!?]['"]?\)?\s*$/)) {
      endsOnSentence++
    }
  }

  // Calculate averages
  stats.avgTokens = Math.round(totalTokens / chunks.length)
  stats.semanticCoherence = endsOnSentence / chunks.length

  return stats
}

/**
 * Log chunk statistics in a human-readable format.
 *
 * @param stats - ChunkStatistics object to log
 * @param label - Label for the log output (default: 'Chunks')
 *
 * @example
 * ```typescript
 * const stats = calculateChunkStatistics(chunks, 768)
 * logChunkStatistics(stats, 'PDF Chunks')
 * // Output:
 * // [PDF Chunks Statistics]
 * //   Total chunks: 382
 * //   Avg tokens: 720
 * //   Min tokens: 450
 * //   Max tokens: 850
 * //   Oversized: 2 (0.5%)
 * //   With metadata: 347 (90.8%)
 * //   Semantic coherence: 92.1%
 * ```
 */
export function logChunkStatistics(stats: ChunkStatistics, label: string = 'Chunks'): void {
  console.log(`\n[${label} Statistics]`)
  console.log(`  Total chunks: ${stats.total}`)
  console.log(`  Avg tokens: ${stats.avgTokens}`)
  console.log(`  Min tokens: ${stats.minTokens}`)
  console.log(`  Max tokens: ${stats.maxTokens}`)

  if (stats.oversized > 0) {
    console.log(`  ⚠️  Oversized: ${stats.oversized} (${((stats.oversized/stats.total)*100).toFixed(1)}%)`)
  } else {
    console.log(`  Oversized: ${stats.oversized} (0.0%)`)
  }

  if (stats.undersized > 0) {
    console.log(`  ⚠️  Undersized: ${stats.undersized} (${((stats.undersized/stats.total)*100).toFixed(1)}%)`)
  }

  console.log(`  With metadata: ${stats.withMetadata} (${((stats.withMetadata/stats.total)*100).toFixed(1)}%)`)

  if (stats.metadataEnhanced > 0) {
    console.log(`  Enhanced embeddings: ${stats.metadataEnhanced} (${((stats.metadataEnhanced/stats.total)*100).toFixed(1)}%)`)
  }

  console.log(`  Semantic coherence: ${(stats.semanticCoherence * 100).toFixed(1)}%\n`)
}

/**
 * Compare two ChunkStatistics objects and log the differences.
 * Useful for A/B testing and validation.
 *
 * @param baselineStats - Original/baseline statistics
 * @param newStats - New/optimized statistics
 * @param baselineLabel - Label for baseline (default: 'Baseline')
 * @param newLabel - Label for new stats (default: 'Optimized')
 *
 * @example
 * ```typescript
 * const baseline = calculateChunkStatistics(chunks512, 512)
 * const optimized = calculateChunkStatistics(chunks768, 768)
 * compareChunkStatistics(baseline, optimized, '512 tokens', '768 tokens')
 * ```
 */
export function compareChunkStatistics(
  baselineStats: ChunkStatistics,
  newStats: ChunkStatistics,
  baselineLabel: string = 'Baseline',
  newLabel: string = 'Optimized'
): void {
  console.log(`\n[Chunk Statistics Comparison]`)
  console.log(`                        | ${baselineLabel.padEnd(15)} | ${newLabel.padEnd(15)} | Difference`)
  console.log(`${''.padEnd(80, '-')}`)

  const formatDiff = (baseline: number, newVal: number, isPercent: boolean = false, lowerIsBetter: boolean = false): string => {
    const diff = newVal - baseline
    const percentDiff = baseline > 0 ? ((diff / baseline) * 100) : 0
    const sign = diff > 0 ? '+' : ''
    const emoji = (lowerIsBetter ? diff < 0 : diff > 0) ? '✅' : (diff === 0 ? '⚡' : '⚠️ ')

    if (isPercent) {
      return `${emoji} ${sign}${percentDiff.toFixed(1)}pp`
    } else {
      return `${emoji} ${sign}${percentDiff.toFixed(1)}%`
    }
  }

  console.log(`Total chunks            | ${baselineStats.total.toString().padEnd(15)} | ${newStats.total.toString().padEnd(15)} | ${formatDiff(baselineStats.total, newStats.total, false, true)}`)
  console.log(`Avg tokens              | ${baselineStats.avgTokens.toString().padEnd(15)} | ${newStats.avgTokens.toString().padEnd(15)} | ${formatDiff(baselineStats.avgTokens, newStats.avgTokens)}`)
  console.log(`Min tokens              | ${baselineStats.minTokens.toString().padEnd(15)} | ${newStats.minTokens.toString().padEnd(15)} | ${formatDiff(baselineStats.minTokens, newStats.minTokens)}`)
  console.log(`Max tokens              | ${baselineStats.maxTokens.toString().padEnd(15)} | ${newStats.maxTokens.toString().padEnd(15)} | ${formatDiff(baselineStats.maxTokens, newStats.maxTokens)}`)
  console.log(`Oversized (%)           | ${((baselineStats.oversized/baselineStats.total)*100).toFixed(1).padEnd(15)} | ${((newStats.oversized/newStats.total)*100).toFixed(1).padEnd(15)} | ${formatDiff(baselineStats.oversized/baselineStats.total, newStats.oversized/newStats.total, true, true)}`)
  console.log(`With metadata (%)       | ${((baselineStats.withMetadata/baselineStats.total)*100).toFixed(1).padEnd(15)} | ${((newStats.withMetadata/newStats.total)*100).toFixed(1).padEnd(15)} | ${formatDiff(baselineStats.withMetadata/baselineStats.total, newStats.withMetadata/newStats.total, true)}`)
  console.log(`Semantic coherence (%)  | ${(baselineStats.semanticCoherence*100).toFixed(1).padEnd(15)} | ${(newStats.semanticCoherence*100).toFixed(1).padEnd(15)} | ${formatDiff(baselineStats.semanticCoherence, newStats.semanticCoherence, true)}`)
  console.log('')
}
