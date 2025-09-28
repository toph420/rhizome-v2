/**
 * Fuzzy matching module for positioning YouTube transcript chunks in source markdown.
 * Uses 3-tier matching: exact → trigram fuzzy → approximate positioning.
 */

/**
 * Result from fuzzy matching with confidence and position metadata.
 */
export interface FuzzyMatchResult {
  /** Character offset where chunk starts in source */
  startOffset: number
  /** Character offset where chunk ends in source */
  endOffset: number
  /** Confidence score 0.3-1.0 (1.0 = exact, 0.75-0.99 = fuzzy, 0.3 = approximate) */
  confidence: number
  /** Matching method used: exact, fuzzy, or approximate */
  method: 'exact' | 'fuzzy' | 'approximate'
  /** Context before match (~5 words) */
  contextBefore: string
  /** Context after match (~5 words) */
  contextAfter: string
}

/**
 * Performance metrics for fuzzy matching operations.
 */
export interface FuzzyMatchPerformance {
  /** Total chunks processed */
  totalChunks: number
  /** Exact matches found */
  exactMatches: number
  /** Fuzzy matches found */
  fuzzyMatches: number
  /** Approximate matches used */
  approximateMatches: number
  /** Total processing time in milliseconds */
  totalTimeMs: number
  /** Average time per chunk in milliseconds */
  avgTimePerChunk: number
}

/**
 * Configuration for fuzzy matching algorithm.
 */
export interface FuzzyMatchConfig {
  /** Minimum trigram similarity for fuzzy match (default: 0.75) */
  trigramThreshold: number
  /** Minimum confidence to store (default: 0.3) */
  minConfidence: number
  /** Stride as percentage of chunk length for sliding window (default: 0.1 = 10%) */
  stridePercent: number
  /** Character window size for context extraction (default: 100 chars ≈ 5 words) */
  contextWindowSize: number
}

/**
 * Default configuration for fuzzy matching.
 */
export const DEFAULT_CONFIG: FuzzyMatchConfig = {
  trigramThreshold: 0.75,
  minConfidence: 0.3,
  stridePercent: 0.1,
  contextWindowSize: 100
}

/**
 * Matches chunk content to source markdown using 3-tier fuzzy matching algorithm.
 * 
 * **Tier 1: Exact Match** (confidence 1.0)
 * - Searches for exact substring match
 * - Returns immediately on first match
 * 
 * **Tier 2: Fuzzy Match** (confidence 0.75-0.99)
 * - Generates trigrams (3-character sliding windows)
 * - Uses Jaccard similarity with sliding window search
 * - Stride: 10% of chunk length for performance
 * - Threshold: 0.75 minimum similarity
 * 
 * **Tier 3: Approximate** (confidence 0.3)
 * - Proportional positioning based on chunk index
 * - Always provides result (never null)
 * 
 * @param chunkContent - Text content of chunk to match
 * @param sourceMarkdown - Original markdown source (with timestamps for YouTube)
 * @param chunkIndex - Index of chunk in document (0-based)
 * @param totalChunks - Total number of chunks
 * @param config - Optional configuration (uses DEFAULT_CONFIG if not provided)
 * @returns FuzzyMatchResult with position, confidence, and context
 * 
 * @example
 * const result = fuzzyMatchChunkToSource(
 *   'This is the chunk text',
 *   'Full source markdown with timestamps',
 *   5,
 *   50
 * )
 * console.log(result.confidence) // 0.87 (fuzzy match)
 * console.log(result.method) // 'fuzzy'
 */
export function fuzzyMatchChunkToSource(
  chunkContent: string,
  sourceMarkdown: string,
  chunkIndex: number,
  totalChunks: number,
  config: Partial<FuzzyMatchConfig> = {}
): FuzzyMatchResult {
  const finalConfig = { ...DEFAULT_CONFIG, ...config }
  
  // Normalize content for matching (remove extra whitespace)
  const normalizedChunk = chunkContent.trim().replace(/\s+/g, ' ')
  const normalizedSource = sourceMarkdown.trim().replace(/\s+/g, ' ')
  
  // Tier 1: Exact match
  const exactIndex = normalizedSource.indexOf(normalizedChunk)
  if (exactIndex !== -1) {
    return {
      startOffset: exactIndex,
      endOffset: exactIndex + normalizedChunk.length,
      confidence: 1.0,
      method: 'exact',
      contextBefore: extractContextBefore(normalizedSource, exactIndex, finalConfig.contextWindowSize),
      contextAfter: extractContextAfter(normalizedSource, exactIndex + normalizedChunk.length, finalConfig.contextWindowSize)
    }
  }
  
  // Tier 2: Fuzzy match with trigrams
  const fuzzyResult = trigramFuzzyMatch(
    normalizedChunk,
    normalizedSource,
    finalConfig.trigramThreshold,
    finalConfig.stridePercent,
    finalConfig.contextWindowSize
  )
  
  if (fuzzyResult) {
    return fuzzyResult
  }
  
  // Tier 3: Approximate positioning (fallback)
  return approximatePosition(
    chunkIndex,
    totalChunks,
    normalizedChunk,
    normalizedSource,
    finalConfig.contextWindowSize
  )
}

/**
 * Performs trigram-based fuzzy matching with sliding window search.
 * 
 * **Performance Optimizations**:
 * - Early exit on near-perfect match (>0.95)
 * - Pre-computed chunk trigrams (no regeneration)
 * - Stride optimization: 10% for <100 windows, 20% for >=100 windows
 * 
 * @param chunk - Normalized chunk content
 * @param source - Normalized source markdown
 * @param threshold - Minimum Jaccard similarity (default: 0.75)
 * @param stridePercent - Stride as percentage of chunk length
 * @param contextSize - Context window size in characters
 * @returns FuzzyMatchResult if similarity >= threshold, null otherwise
 */
function trigramFuzzyMatch(
  chunk: string,
  source: string,
  threshold: number,
  stridePercent: number,
  contextSize: number
): FuzzyMatchResult | null {
  const chunkLength = chunk.length
  
  // OPTIMIZATION 1: Early exit if chunk is too long for source
  if (chunkLength > source.length) {
    return null
  }
  
  // OPTIMIZATION 2: Pre-compute chunk trigrams once (avoid regeneration in loop)
  const chunkTrigrams = generateTrigrams(chunk)
  
  // OPTIMIZATION 3: Dynamic stride based on number of windows
  const maxWindows = source.length - chunkLength + 1
  const adjustedStridePercent = maxWindows > 100 ? stridePercent * 2 : stridePercent
  const stride = Math.max(1, Math.floor(chunkLength * adjustedStridePercent))
  
  let bestMatch: FuzzyMatchResult | null = null
  let bestSimilarity = 0
  
  // Sliding window search
  for (let i = 0; i <= source.length - chunkLength; i += stride) {
    const window = source.substring(i, i + chunkLength)
    const windowTrigrams = generateTrigrams(window)
    const similarity = calculateTrigramSimilarity(chunkTrigrams, windowTrigrams)
    
    if (similarity > bestSimilarity && similarity >= threshold) {
      bestSimilarity = similarity
      bestMatch = {
        startOffset: i,
        endOffset: i + chunkLength,
        confidence: similarity,
        method: 'fuzzy',
        contextBefore: extractContextBefore(source, i, contextSize),
        contextAfter: extractContextAfter(source, i + chunkLength, contextSize)
      }
      
      // OPTIMIZATION 4: Early exit if we find near-perfect match
      if (similarity > 0.95) {
        break
      }
    }
  }
  
  return bestMatch
}

/**
 * Generates trigrams (3-character sliding windows) from text.
 * 
 * @param text - Input text
 * @returns Set of trigrams
 * 
 * @example
 * generateTrigrams('hello') // Set(['hel', 'ell', 'llo'])
 */
function generateTrigrams(text: string): Set<string> {
  const trigrams = new Set<string>()
  
  for (let i = 0; i <= text.length - 3; i++) {
    trigrams.add(text.substring(i, i + 3))
  }
  
  return trigrams
}

/**
 * Calculates Jaccard similarity between two trigram sets.
 * Jaccard = |intersection| / |union|
 * 
 * @param set1 - First trigram set
 * @param set2 - Second trigram set
 * @returns Similarity score 0.0-1.0
 * 
 * @example
 * calculateTrigramSimilarity(
 *   new Set(['abc', 'bcd']),
 *   new Set(['abc', 'cde'])
 * ) // 0.33 (1 intersection / 3 union)
 */
function calculateTrigramSimilarity(set1: Set<string>, set2: Set<string>): number {
  if (set1.size === 0 && set2.size === 0) {
    return 1.0
  }
  
  if (set1.size === 0 || set2.size === 0) {
    return 0.0
  }
  
  // Calculate intersection
  const intersectionArray: string[] = []
  set1.forEach(item => {
    if (set2.has(item)) {
      intersectionArray.push(item)
    }
  })
  
  // Calculate union
  const unionSet = new Set<string>()
  set1.forEach(item => unionSet.add(item))
  set2.forEach(item => unionSet.add(item))
  
  return intersectionArray.length / unionSet.size
}

/**
 * Provides approximate position based on proportional chunk index.
 * Used as fallback when fuzzy matching fails.
 * 
 * @param chunkIndex - Index of chunk (0-based)
 * @param totalChunks - Total number of chunks
 * @param chunk - Chunk content
 * @param source - Source markdown
 * @param contextSize - Context window size
 * @returns FuzzyMatchResult with confidence 0.3
 */
function approximatePosition(
  chunkIndex: number,
  totalChunks: number,
  chunk: string,
  source: string,
  contextSize: number
): FuzzyMatchResult {
  // Proportional positioning
  const proportion = totalChunks > 1 ? chunkIndex / (totalChunks - 1) : 0
  const estimatedStart = Math.floor(proportion * (source.length - chunk.length))
  const clampedStart = Math.max(0, Math.min(estimatedStart, source.length - chunk.length))
  
  return {
    startOffset: clampedStart,
    endOffset: clampedStart + chunk.length,
    confidence: 0.3,
    method: 'approximate',
    contextBefore: extractContextBefore(source, clampedStart, contextSize),
    contextAfter: extractContextAfter(source, clampedStart + chunk.length, contextSize)
  }
}

/**
 * Extracts context before a position (~5 words, max contextSize chars).
 * 
 * @param text - Source text
 * @param position - Character position
 * @param maxChars - Maximum characters to extract
 * @returns Context string before position
 * 
 * @example
 * extractContextBefore('The quick brown fox', 10, 100) // 'The quick '
 */
function extractContextBefore(text: string, position: number, maxChars: number): string {
  const start = Math.max(0, position - maxChars)
  const context = text.substring(start, position)
  
  // Trim to word boundary for readability
  const words = context.trim().split(/\s+/)
  const lastWords = words.slice(-5).join(' ')
  
  return lastWords || context.trim()
}

/**
 * Extracts context after a position (~5 words, max contextSize chars).
 * 
 * @param text - Source text
 * @param position - Character position
 * @param maxChars - Maximum characters to extract
 * @returns Context string after position
 * 
 * @example
 * extractContextAfter('The quick brown fox', 10, 100) // 'brown fox'
 */
function extractContextAfter(text: string, position: number, maxChars: number): string {
  const end = Math.min(text.length, position + maxChars)
  const context = text.substring(position, end)
  
  // Trim to word boundary for readability
  const words = context.trim().split(/\s+/)
  const firstWords = words.slice(0, 5).join(' ')
  
  return firstWords || context.trim()
}

/**
 * Processes multiple chunks with fuzzy matching and returns performance metrics.
 * Useful for monitoring and optimization of large document processing.
 * 
 * @param chunks - Array of chunk content strings
 * @param sourceMarkdown - Original markdown source
 * @param config - Optional configuration
 * @returns Tuple of [results, performance metrics]
 * 
 * @example
 * const [results, perf] = fuzzyMatchBatch(chunks, source)
 * console.log(`Processed ${perf.totalChunks} chunks in ${perf.totalTimeMs}ms`)
 * console.log(`Exact: ${perf.exactMatches}, Fuzzy: ${perf.fuzzyMatches}`)
 */
export function fuzzyMatchBatch(
  chunks: string[],
  sourceMarkdown: string,
  config: Partial<FuzzyMatchConfig> = {}
): [FuzzyMatchResult[], FuzzyMatchPerformance] {
  const startTime = Date.now()
  const results: FuzzyMatchResult[] = []
  let exactCount = 0
  let fuzzyCount = 0
  let approximateCount = 0
  
  for (let i = 0; i < chunks.length; i++) {
    const result = fuzzyMatchChunkToSource(
      chunks[i],
      sourceMarkdown,
      i,
      chunks.length,
      config
    )
    
    results.push(result)
    
    // Count by method
    if (result.method === 'exact') exactCount++
    else if (result.method === 'fuzzy') fuzzyCount++
    else approximateCount++
  }
  
  const totalTime = Date.now() - startTime
  
  const performance: FuzzyMatchPerformance = {
    totalChunks: chunks.length,
    exactMatches: exactCount,
    fuzzyMatches: fuzzyCount,
    approximateMatches: approximateCount,
    totalTimeMs: totalTime,
    avgTimePerChunk: chunks.length > 0 ? totalTime / chunks.length : 0
  }
  
  return [results, performance]
}