/**
 * Fuzzy matching module for positioning YouTube transcript chunks in source markdown
 * and stitching overlapping markdown batches from large document processing.
 * Uses 3-tier matching: exact → trigram fuzzy → approximate positioning.
 */

import { distance } from 'fastest-levenshtein'
import type { Annotation, AnnotationMatchResult } from '@/types/recovery'

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
export function generateTrigrams(text: string): Set<string> {
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
export function calculateTrigramSimilarity(set1: Set<string>, set2: Set<string>): number {
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

// ============================================================================
// BATCH STITCHING FUNCTIONS
// ============================================================================

/**
 * Result from overlap detection between two markdown batches.
 */
export interface OverlapResult {
  /** Character offset where overlap starts in batch1 */
  overlapStartInBatch1: number
  /** Character offset where overlap starts in batch2 */
  overlapStartInBatch2: number
  /** Length of overlapping content in characters */
  overlapLength: number
  /** Confidence score 0.0-1.0 (1.0 = exact, 0.75-0.99 = fuzzy) */
  confidence: number
  /** Method used to find overlap */
  method: 'exact' | 'fuzzy' | 'none'
  /** The actual overlapping text (for verification) */
  overlapText: string
}

/**
 * Configuration for batch stitching operations.
 */
export interface StitchConfig {
  /** Minimum overlap length to consider valid (default: 50 chars) */
  minOverlapLength: number
  /** Maximum overlap search window as percentage of batch (default: 0.3 = 30%) */
  maxOverlapPercent: number
  /** Minimum trigram similarity for fuzzy overlap (default: 0.80) */
  overlapThreshold: number
  /** Separator to use when no overlap found (default: "\n\n---\n\n") */
  noOverlapSeparator: string
}

/**
 * Default configuration for batch stitching.
 */
export const DEFAULT_STITCH_CONFIG: StitchConfig = {
  minOverlapLength: 20, // Reduced from 50 to handle shorter overlaps
  maxOverlapPercent: 0.8, // Large window to handle substantial overlaps (10 pages ~ 80% of 100-page batches)
  overlapThreshold: 0.80,
  noOverlapSeparator: '\n\n---\n\n'
}

/**
 * Normalizes text for accurate overlap matching.
 * Removes extra whitespace while preserving paragraph structure.
 *
 * @param text - Text to normalize
 * @returns Normalized text with consistent whitespace
 *
 * @example
 * normalizeForMatching('  Hello\n\n\nWorld  ') // 'Hello\n\nWorld'
 */
export function normalizeForMatching(text: string): string {
  return text
    .trim()
    // Normalize line breaks: multiple newlines → double newline (paragraph break)
    .replace(/\n{3,}/g, '\n\n')
    // Normalize spaces: multiple spaces → single space
    .replace(/[ \t]+/g, ' ')
    // Normalize mixed line endings
    .replace(/\r\n/g, '\n')
    // Remove trailing whitespace from each line
    .split('\n').map(line => line.trimEnd()).join('\n')
}

/**
 * Finds the best overlapping region between the end of batch1 and the start of batch2.
 * Uses 2-tier matching: exact → trigram fuzzy.
 *
 * **Tier 1: Exact Match**
 * - Searches for exact substring matches in overlap window
 * - Returns immediately on first match above minimum length
 *
 * **Tier 2: Fuzzy Match**
 * - Uses trigram similarity with sliding window
 * - Threshold: 0.80 minimum similarity (stricter than chunk matching)
 * - Searches within configurable overlap window (default: last/first 30% of batches)
 *
 * @param batch1 - First markdown batch
 * @param batch2 - Second markdown batch
 * @param config - Optional configuration (uses DEFAULT_STITCH_CONFIG if not provided)
 * @returns OverlapResult with position and confidence, or method='none' if no overlap found
 *
 * @example
 * const overlap = findBestOverlap(batch1, batch2)
 * if (overlap.method !== 'none') {
 *   console.log(`Found ${overlap.overlapLength} char overlap with ${overlap.confidence} confidence`)
 * }
 */
export function findBestOverlap(
  batch1: string,
  batch2: string,
  config: Partial<StitchConfig> = {}
): OverlapResult {
  const finalConfig = { ...DEFAULT_STITCH_CONFIG, ...config }

  // Normalize batches for matching
  const norm1 = normalizeForMatching(batch1)
  const norm2 = normalizeForMatching(batch2)

  // Calculate overlap search windows (last X% of batch1, first X% of batch2)
  const maxOverlapChars1 = Math.floor(norm1.length * finalConfig.maxOverlapPercent)
  const maxOverlapChars2 = Math.floor(norm2.length * finalConfig.maxOverlapPercent)

  // Extract search regions
  const batch1End = norm1.substring(norm1.length - maxOverlapChars1)
  const batch2Start = norm2.substring(0, maxOverlapChars2)

  // TIER 1: Try exact match - search for progressively smaller substrings
  // We need to find text that appears at the END of batch1 AND at the START of batch2
  const maxPossibleOverlap = Math.min(batch1End.length, batch2Start.length)

  for (let overlapLen = maxPossibleOverlap; overlapLen >= finalConfig.minOverlapLength; overlapLen -= 1) {
    // Extract candidate from END of batch1
    const candidateFromBatch1 = batch1End.substring(batch1End.length - overlapLen)

    // Extract same length from START of batch2
    const candidateFromBatch2 = batch2Start.substring(0, overlapLen)

    // Check if they match
    if (candidateFromBatch1 === candidateFromBatch2) {
      const overlapStartInBatch1 = norm1.length - overlapLen

      return {
        overlapStartInBatch1,
        overlapStartInBatch2: 0,
        overlapLength: overlapLen,
        confidence: 1.0,
        method: 'exact',
        overlapText: candidateFromBatch1
      }
    }
  }

  // TIER 2: Fuzzy match with trigrams
  const fuzzyOverlap = findFuzzyOverlap(
    batch1End,
    batch2Start,
    finalConfig.overlapThreshold,
    finalConfig.minOverlapLength
  )

  if (fuzzyOverlap) {
    // Adjust positions relative to full batches
    const overlapStartInBatch1 = norm1.length - maxOverlapChars1 + fuzzyOverlap.startInBatch1

    return {
      overlapStartInBatch1,
      overlapStartInBatch2: fuzzyOverlap.startInBatch2,
      overlapLength: fuzzyOverlap.length,
      confidence: fuzzyOverlap.confidence,
      method: 'fuzzy',
      overlapText: fuzzyOverlap.text
    }
  }

  // No overlap found
  return {
    overlapStartInBatch1: norm1.length,
    overlapStartInBatch2: 0,
    overlapLength: 0,
    confidence: 0.0,
    method: 'none',
    overlapText: ''
  }
}

/**
 * Finds fuzzy overlap using trigram similarity with sliding window.
 * Searches for best matching region between batch1 end and batch2 start.
 *
 * @param batch1End - End region of first batch
 * @param batch2Start - Start region of second batch
 * @param threshold - Minimum trigram similarity (default: 0.80)
 * @param minLength - Minimum overlap length to consider (default: 50)
 * @returns Overlap info if found, null otherwise
 */
function findFuzzyOverlap(
  batch1End: string,
  batch2Start: string,
  threshold: number,
  minLength: number
): { startInBatch1: number; startInBatch2: number; length: number; confidence: number; text: string } | null {
  let bestMatch: { startInBatch1: number; startInBatch2: number; length: number; confidence: number; text: string } | null = null
  let bestSimilarity = 0

  // Try different overlap lengths (from large to small)
  const maxOverlapLen = Math.min(batch1End.length, batch2Start.length)

  for (let overlapLen = maxOverlapLen; overlapLen >= minLength; overlapLen -= 20) {
    // Slide window through batch1End (from end backwards)
    for (let i = batch1End.length - overlapLen; i >= 0; i -= 10) {
      const candidate1 = batch1End.substring(i, i + overlapLen)
      const trigrams1 = generateTrigrams(candidate1)

      // Slide window through batch2Start (from start forward)
      for (let j = 0; j <= batch2Start.length - overlapLen; j += 10) {
        const candidate2 = batch2Start.substring(j, j + overlapLen)
        const trigrams2 = generateTrigrams(candidate2)

        const similarity = calculateTrigramSimilarity(trigrams1, trigrams2)

        if (similarity > bestSimilarity && similarity >= threshold) {
          bestSimilarity = similarity
          bestMatch = {
            startInBatch1: i,
            startInBatch2: j,
            length: overlapLen,
            confidence: similarity,
            text: candidate1
          }

          // Early exit on very high similarity
          if (similarity > 0.95) {
            return bestMatch
          }
        }
      }
    }

    // If we found a good match at this length, use it
    if (bestMatch && (bestMatch as any).confidence >= threshold) {
      return bestMatch
    }
  }

  return bestMatch
}

/**
 * Stitches an array of markdown batches into a single coherent document.
 * Uses fuzzy matching to find and remove overlapping content between consecutive batches.
 *
 * **Features**:
 * - Exact overlap detection for perfect stitching
 * - Fuzzy overlap detection for near-matches (80%+ similarity)
 * - Graceful degradation: uses separator when overlap not found
 * - Configurable overlap parameters
 * - Preserves all content (no data loss)
 *
 * **Performance**: O(n * m) where n = number of batches, m = overlap window size
 *
 * @param batches - Array of markdown batches to stitch together
 * @param config - Optional configuration (uses DEFAULT_STITCH_CONFIG if not provided)
 * @returns Single stitched markdown document
 *
 * @example
 * const batches = ['# Chapter 1\n\nSome text...', '...text overlap\n\n# Chapter 2...']
 * const stitched = stitchMarkdownBatches(batches)
 * // Returns: '# Chapter 1\n\nSome text...text overlap\n\n# Chapter 2...'
 * // (overlap removed, seamless transition)
 */
export function stitchMarkdownBatches(
  batches: string[],
  config: Partial<StitchConfig> = {}
): string {
  const finalConfig = { ...DEFAULT_STITCH_CONFIG, ...config }

  // Handle edge cases
  if (batches.length === 0) {
    return ''
  }

  if (batches.length === 1) {
    return batches[0]
  }

  // Start with first batch
  let result = normalizeForMatching(batches[0])

  // Process each subsequent batch
  for (let i = 1; i < batches.length; i++) {
    const nextBatch = normalizeForMatching(batches[i])

    // Find overlap between current result and next batch
    const overlap = findBestOverlap(result, nextBatch, finalConfig)

    if (overlap.method === 'none') {
      // No overlap found - use separator
      console.warn(
        `⚠️  Batch ${i}: No overlap found, using separator. ` +
        `Searched last ${Math.floor(result.length * finalConfig.maxOverlapPercent)} chars ` +
        `of batch ${i-1} and first ${Math.floor(nextBatch.length * finalConfig.maxOverlapPercent)} chars of batch ${i}`
      )
      result += finalConfig.noOverlapSeparator + nextBatch
    } else {
      // Overlap found - stitch by removing duplicate
      const beforeOverlap = result.substring(0, overlap.overlapStartInBatch1)
      const afterOverlap = nextBatch.substring(overlap.overlapStartInBatch2 + overlap.overlapLength)

      // Keep the overlap from batch1 (first occurrence)
      const overlapContent = result.substring(
        overlap.overlapStartInBatch1,
        overlap.overlapStartInBatch1 + overlap.overlapLength
      )

      result = beforeOverlap + overlapContent + afterOverlap

      console.log(
        `✅ Batch ${i}: ${overlap.method} overlap found ` +
        `(${overlap.overlapLength} chars, ${(overlap.confidence * 100).toFixed(1)}% confidence)`
      )
    }
  }

  return result
}

// ============================================================================
// ANNOTATION RECOVERY FUNCTIONS
// Levenshtein-based fuzzy matching for annotation recovery after document edits
// ============================================================================

/**
 * Find annotation in edited markdown using 4-tier strategy
 * Tier 1: Exact match (markdown.indexOf)
 * Tier 2: Context-guided Levenshtein (if context available)
 * Tier 3: Chunk-bounded Levenshtein (if chunk index known)
 * Tier 4: Trigram fallback (existing fuzzyMatchChunkToSource)
 *
 * @param annotation - Annotation to recover
 * @param markdown - New markdown content
 * @param chunks - New chunks for chunk-bounded search
 * @returns Fuzzy match result with confidence and position
 */
export function findAnnotationMatch(
  annotation: Annotation,
  markdown: string,
  chunks?: Array<{ chunk_index: number; start_offset: number; end_offset: number; content: string }>
): AnnotationMatchResult | null {
  // Validation
  if (!annotation.text || !markdown) {
    throw new Error('Invalid inputs: annotation.text and markdown are required')
  }

  // Tier 1: Exact match (fastest)
  const exactIndex = markdown.indexOf(annotation.text)
  if (exactIndex !== -1) {
    const contextBefore = markdown.slice(Math.max(0, exactIndex - 100), exactIndex)
    const contextAfter = markdown.slice(exactIndex + annotation.text.length, exactIndex + annotation.text.length + 100)

    return {
      text: annotation.text,
      startOffset: exactIndex,
      endOffset: exactIndex + annotation.text.length,
      confidence: 1.0,
      method: 'exact',
      contextBefore,
      contextAfter
    }
  }

  // Tier 2: Context-guided Levenshtein (if context available)
  if (annotation.textContext?.before || annotation.textContext?.after) {
    const contextMatch = findWithLevenshteinContext(
      annotation.text,
      markdown,
      annotation.textContext
    )
    if (contextMatch && contextMatch.confidence >= 0.75) {
      return contextMatch
    }
  }

  // Tier 3: Chunk-bounded Levenshtein (if chunk index known)
  if (annotation.originalChunkIndex !== undefined && chunks && chunks.length > 0) {
    const chunkMatch = findNearChunkLevenshtein(
      annotation.text,
      markdown,
      annotation.originalChunkIndex,
      chunks
    )
    if (chunkMatch && chunkMatch.confidence >= 0.75) {
      return chunkMatch
    }
  }

  // Tier 4: Trigram fallback (use existing fuzzyMatchChunkToSource)
  // Note: This is a last resort and may be slow for large documents
  // Use lower threshold (0.65) for annotation recovery to handle heavily edited text
  const trigramMatch = fuzzyMatchChunkToSource(annotation.text, markdown, 0, 1, {
    trigramThreshold: 0.65  // Lower than default 0.75 for annotation recovery
  })
  // Accept trigram matches ≥0.60 after penalty (real-world typos give ~64%)
  if (trigramMatch && trigramMatch.confidence >= 0.60) {
    return {
      text: markdown.slice(trigramMatch.startOffset, trigramMatch.endOffset),
      startOffset: trigramMatch.startOffset,
      endOffset: trigramMatch.endOffset,
      confidence: trigramMatch.confidence * 0.9, // Penalty for trigram fallback
      method: 'trigram',
      contextBefore: trigramMatch.contextBefore,
      contextAfter: trigramMatch.contextAfter
    }
  }

  // No match found
  return null
}

/**
 * Find annotation using context-guided Levenshtein matching
 * Uses before/after text context to locate approximate region, then finds best match
 *
 * @param needle - Text to find
 * @param markdown - Full markdown content
 * @param textContext - Before and after context
 * @returns Match result or null
 */
function findWithLevenshteinContext(
  needle: string,
  markdown: string,
  textContext: { before?: string; after?: string }
): AnnotationMatchResult | null {
  if (!textContext.before && !textContext.after) {
    return null
  }

  let searchRegion: { start: number; end: number } | null = null

  // Try to locate using contextBefore
  if (textContext.before) {
    const contextIndex = markdown.indexOf(textContext.before)
    if (contextIndex !== -1) {
      const searchStart = contextIndex + textContext.before.length
      const searchEnd = Math.min(
        searchStart + needle.length * 1.3, // Allow 30% length variation
        markdown.length
      )
      searchRegion = { start: searchStart, end: searchEnd }
    } else {
      // Try fuzzy context matching
      const fuzzyContextMatch = findFuzzyContext(textContext.before, markdown)
      if (fuzzyContextMatch) {
        const searchStart = fuzzyContextMatch.startOffset + textContext.before.length
        const searchEnd = Math.min(
          searchStart + needle.length * 1.3,
          markdown.length
        )
        searchRegion = { start: searchStart, end: searchEnd }
      }
    }
  }

  if (!searchRegion && textContext.after) {
    const afterIndex = markdown.indexOf(textContext.after)
    if (afterIndex !== -1) {
      const searchEnd = afterIndex
      const searchStart = Math.max(0, searchEnd - needle.length * 1.3)
      searchRegion = { start: searchStart, end: searchEnd }
    }
  }

  if (!searchRegion) {
    return null
  }

  // Find best match in bounded region
  const segment = markdown.slice(searchRegion.start, searchRegion.end)
  const segmentMatch = findLevenshteinInSegment(needle, segment)

  if (!segmentMatch) {
    return null
  }

  // Adjust offsets to full markdown
  const absoluteStart = searchRegion.start + segmentMatch.startOffset
  const absoluteEnd = searchRegion.start + segmentMatch.endOffset

  const contextBefore = markdown.slice(Math.max(0, absoluteStart - 100), absoluteStart)
  const contextAfter = markdown.slice(absoluteEnd, Math.min(absoluteEnd + 100, markdown.length))

  return {
    text: markdown.slice(absoluteStart, absoluteEnd),
    startOffset: absoluteStart,
    endOffset: absoluteEnd,
    confidence: segmentMatch.confidence * 0.95, // Small penalty for context-guided
    method: 'context',
    contextBefore,
    contextAfter
  }
}

/**
 * Find annotation near original chunk using chunk-bounded search
 * Searches ±2 chunks from originalChunkIndex for 50-75x performance boost
 *
 * @param needle - Text to find
 * @param markdown - Full markdown content
 * @param originalChunkIndex - Original chunk index
 * @param chunks - Array of chunks with offsets
 * @returns Match result or null
 */
function findNearChunkLevenshtein(
  needle: string,
  markdown: string,
  originalChunkIndex: number,
  chunks: Array<{ chunk_index: number; start_offset: number; end_offset: number }>
): AnnotationMatchResult | null {
  // Validate chunks array
  if (!chunks || chunks.length === 0) {
    return null
  }

  // Validate originalChunkIndex is reasonable (allow some range for deleted chunks)
  if (originalChunkIndex < 0 || originalChunkIndex >= chunks.length + 5) {
    return null  // Index way out of range
  }

  // Get ±2 chunks from original position
  const searchChunks = chunks.filter(
    c => c.chunk_index >= originalChunkIndex - 2 &&
         c.chunk_index <= originalChunkIndex + 2
  )

  if (searchChunks.length === 0) {
    return null
  }

  // Determine search bounds
  const searchStart = Math.min(...searchChunks.map(c => c.start_offset))
  const searchEnd = Math.max(...searchChunks.map(c => c.end_offset))

  // Extract bounded search space (~12,500 chars instead of 750K)
  const segment = markdown.slice(searchStart, searchEnd)
  const segmentMatch = findLevenshteinInSegment(needle, segment)

  if (!segmentMatch) {
    return null
  }

  // Adjust offsets to full markdown
  const absoluteStart = searchStart + segmentMatch.startOffset
  const absoluteEnd = searchStart + segmentMatch.endOffset

  const contextBefore = markdown.slice(Math.max(0, absoluteStart - 100), absoluteStart)
  const contextAfter = markdown.slice(absoluteEnd, Math.min(absoluteEnd + 100, markdown.length))

  return {
    text: markdown.slice(absoluteStart, absoluteEnd),
    startOffset: absoluteStart,
    endOffset: absoluteEnd,
    confidence: segmentMatch.confidence,
    method: 'chunk_bounded',
    contextBefore,
    contextAfter
  }
}

/**
 * Find best match in a segment using sliding window Levenshtein
 * Internal function used by context-guided and chunk-bounded strategies
 *
 * @param needle - Text to find
 * @param segment - Segment to search within
 * @returns Best match with relative offsets or null
 */
function findLevenshteinInSegment(
  needle: string,
  segment: string
): { text: string; startOffset: number; endOffset: number; confidence: number } | null {
  if (!needle || !segment) {
    return null
  }

  const needleLength = needle.length
  const windowSize = Math.floor(needleLength * 1.2) // Allow 20% length variation

  let bestMatch: { startOffset: number; endOffset: number; similarity: number } | null = null

  // Slide window through segment
  for (let i = 0; i <= segment.length - Math.floor(needleLength * 0.8); i++) {
    const end = Math.min(i + windowSize, segment.length)
    const window = segment.slice(i, end)

    const dist = distance(needle, window)
    const maxLength = Math.max(needle.length, window.length)
    const similarity = 1 - (dist / maxLength)

    // Early exit if very high similarity
    if (similarity > 0.95) {
      return {
        text: window,
        startOffset: i,
        endOffset: end,
        confidence: similarity
      }
    }

    // Track best match
    if (!bestMatch || similarity > bestMatch.similarity) {
      bestMatch = {
        startOffset: i,
        endOffset: end,
        similarity
      }
    }
  }

  // Return best match if confidence is acceptable
  if (bestMatch && bestMatch.similarity >= 0.75) {
    return {
      text: segment.slice(bestMatch.startOffset, bestMatch.endOffset),
      startOffset: bestMatch.startOffset,
      endOffset: bestMatch.endOffset,
      confidence: bestMatch.similarity
    }
  }

  return null
}

/**
 * Find fuzzy context using trigram similarity
 * Fallback when exact context matching fails
 *
 * @param context - Context string to find
 * @param markdown - Full markdown to search
 * @returns Match result or null
 */
function findFuzzyContext(
  context: string,
  markdown: string
): { startOffset: number; endOffset: number; confidence: number } | null {
  // Use existing trigram infrastructure
  const trigramMatch = fuzzyMatchChunkToSource(context, markdown, 0, 1)

  if (trigramMatch && trigramMatch.confidence >= 0.70) {
    return {
      startOffset: trigramMatch.startOffset,
      endOffset: trigramMatch.endOffset,
      confidence: trigramMatch.confidence
    }
  }

  return null
}