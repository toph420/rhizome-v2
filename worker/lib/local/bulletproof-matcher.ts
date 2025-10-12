/**
 * Bulletproof Matching System - 5-Layer Chunk Recovery
 *
 * Remaps Docling chunks (from raw PDF extraction) to cleaned markdown
 * with 100% recovery guarantee. No chunks lost, all metadata preserved.
 *
 * Architecture:
 * - Layer 1 (Enhanced Fuzzy): 4 strategies - exact, normalized, multi-anchor, sliding window
 * - Layer 2 (Embeddings): Transformers.js cosine similarity >0.85
 * - Layer 3 (LLM): Ollama Qwen helps find matches
 * - Layer 4 (Interpolation): Uses anchors to calculate synthetic positions (NEVER FAILS)
 *
 * Success Rates (Expected):
 * - Layer 1: 85-90% of chunks
 * - Layer 2: 95-98% cumulative
 * - Layer 3: 99.9% cumulative
 * - Layer 4: 100% GUARANTEED
 *
 * Phase 4: Task 10-15
 */

import type { DoclingChunk } from '../docling-extractor.js'
import { pipeline } from '@huggingface/transformers'
import { OllamaClient } from './ollama-client.js'

// ============================================================================
// Types
// ============================================================================

/**
 * Match confidence levels.
 * Maps to database column: chunks.position_confidence
 */
export type MatchConfidence = 'exact' | 'high' | 'medium' | 'synthetic'

/**
 * Matching method used for each layer.
 * Maps to database column: chunks.position_method
 */
export type MatchMethod =
  | 'exact_match'           // Layer 1: Strategy 1
  | 'normalized_match'      // Layer 1: Strategy 2
  | 'multi_anchor_search'   // Layer 1: Strategy 3
  | 'sliding_window'        // Layer 1: Strategy 4
  | 'embeddings'            // Layer 2
  | 'llm_assisted'          // Layer 3
  | 'interpolation'         // Layer 4

/**
 * Result from matching a single chunk.
 * Contains both new offsets and preserved Docling metadata.
 */
export interface MatchResult {
  /** Original Docling chunk with structural metadata */
  chunk: DoclingChunk
  /** Start offset in cleaned markdown */
  start_offset: number
  /** End offset in cleaned markdown */
  end_offset: number
  /** Match confidence level */
  confidence: MatchConfidence
  /** Matching method used */
  method: MatchMethod
  /** Similarity score (0-1, only for fuzzy/embeddings) */
  similarity?: number
}

/**
 * Statistics from bulletproof matching process.
 */
export interface MatchStats {
  /** Total chunks processed */
  total: number
  /** Exact matches (100% confidence) */
  exact: number
  /** High confidence matches (>95% similarity) */
  high: number
  /** Medium confidence matches (>85% similarity) */
  medium: number
  /** Synthetic chunks (interpolated positions) */
  synthetic: number
  /** Processing time in milliseconds */
  processingTime: number
  /** Stats by layer */
  byLayer: {
    layer1: number  // Enhanced fuzzy
    layer2: number  // Embeddings
    layer3: number  // LLM
    layer4: number  // Interpolation
  }
}

/**
 * Orchestrator options for bulletproof matching.
 */
export interface BulletproofMatchOptions {
  /** Enable/disable specific layers (for testing) */
  enabledLayers?: {
    layer1?: boolean
    layer2?: boolean
    layer3?: boolean
    layer4?: boolean
  }
  /** Progress callback */
  onProgress?: (layerNum: number, matched: number, remaining: number) => void
}

// ============================================================================
// Layer 1: Enhanced Fuzzy Matching (4 Strategies)
// ============================================================================

/**
 * Layer 1: Enhanced fuzzy matching using 4 strategies.
 *
 * Strategy 1: Exact match (indexOf)
 * Strategy 2: Normalized match (whitespace/case insensitive)
 * Strategy 3: Multi-anchor search (find start/middle/end phrases)
 * Strategy 4: Sliding window with similarity (>80%)
 *
 * Expected success rate: 85-90% of chunks
 */
async function layer1_enhancedFuzzy(
  cleanedMarkdown: string,
  doclingChunks: DoclingChunk[]
): Promise<{ matched: MatchResult[]; unmatched: DoclingChunk[] }> {
  const matched: MatchResult[] = []
  const unmatched: DoclingChunk[] = []

  let searchHint = 0

  for (const chunk of doclingChunks) {
    const content = chunk.content

    // Strategy 1: Exact match
    const exactIndex = cleanedMarkdown.indexOf(content, searchHint)
    if (exactIndex !== -1) {
      matched.push({
        chunk,
        start_offset: exactIndex,
        end_offset: exactIndex + content.length,
        confidence: 'exact',
        method: 'exact_match',
        similarity: 1.0
      })
      searchHint = exactIndex + content.length
      continue
    }

    // Strategy 2: Normalized match (whitespace/case insensitive)
    const normalizedResult = tryNormalizedMatch(cleanedMarkdown, content, searchHint)
    if (normalizedResult) {
      matched.push({
        chunk,
        start_offset: normalizedResult.start,
        end_offset: normalizedResult.end,
        confidence: 'high',
        method: 'normalized_match',
        similarity: 0.95
      })
      searchHint = normalizedResult.end
      continue
    }

    // Strategy 3: Multi-anchor search (first/middle/end phrases)
    const anchorResult = tryMultiAnchorSearch(cleanedMarkdown, content, searchHint)
    if (anchorResult) {
      matched.push({
        chunk,
        start_offset: anchorResult.start,
        end_offset: anchorResult.end,
        confidence: 'high',
        method: 'multi_anchor_search',
        similarity: 0.85
      })
      searchHint = anchorResult.end
      continue
    }

    // Strategy 4: Sliding window with similarity (>80%)
    const slidingResult = trySlidingWindowMatch(cleanedMarkdown, content, searchHint)
    if (slidingResult && slidingResult.similarity >= 0.8) {
      matched.push({
        chunk,
        start_offset: slidingResult.start,
        end_offset: slidingResult.end,
        confidence: 'high',
        method: 'sliding_window',
        similarity: slidingResult.similarity
      })
      searchHint = slidingResult.end
      continue
    }

    // No match found in Layer 1
    unmatched.push(chunk)
  }

  console.log(`[Layer 1] Enhanced Fuzzy: ${matched.length}/${doclingChunks.length} matched (${(matched.length / doclingChunks.length * 100).toFixed(1)}%)`)

  return { matched, unmatched }
}

/**
 * Strategy 2: Normalized whitespace match.
 * Handles AI cleanup that collapses whitespace.
 */
function tryNormalizedMatch(
  markdown: string,
  content: string,
  startFrom: number
): { start: number; end: number } | null {
  // Normalize both strings (collapse whitespace, trim)
  const normalized = content.trim().replace(/\s+/g, ' ')

  // Create regex pattern that allows flexible whitespace
  const escaped = normalized.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const flexiblePattern = escaped.replace(/ /g, '\\s+')

  try {
    const regex = new RegExp(flexiblePattern)
    const searchRegion = markdown.slice(startFrom)
    const match = searchRegion.match(regex)

    if (match && match.index !== undefined) {
      const start = startFrom + match.index
      const end = start + match[0].length
      return { start, end }
    }
  } catch (e) {
    // Regex too complex, skip
  }

  return null
}

/**
 * Strategy 3: Multi-anchor search.
 * Find start phrase, middle phrase, and end phrase.
 */
function tryMultiAnchorSearch(
  markdown: string,
  content: string,
  startFrom: number
): { start: number; end: number } | null {
  // Extract anchors (first 100 chars, middle 100 chars, last 100 chars)
  const startAnchor = content.slice(0, 100).trim()
  const middleStart = Math.floor(content.length / 2) - 50
  const middleAnchor = content.slice(middleStart, middleStart + 100).trim()
  const endAnchor = content.slice(-100).trim()

  // Find start anchor
  const startIndex = markdown.indexOf(startAnchor, startFrom)
  if (startIndex === -1) return null

  // Search for end anchor within reasonable distance
  const searchLimit = Math.min(
    startIndex + content.length * 3,  // Allow 3x length variation
    markdown.length
  )
  const searchRegion = markdown.slice(startIndex, searchLimit)
  const endRelativeIndex = searchRegion.indexOf(endAnchor)

  if (endRelativeIndex === -1) return null

  const endIndex = startIndex + endRelativeIndex + endAnchor.length

  // Verify middle anchor is present (quality check)
  const contentRegion = markdown.slice(startIndex, endIndex)
  if (!contentRegion.includes(middleAnchor)) {
    // Middle anchor missing - match is unreliable
    return null
  }

  return { start: startIndex, end: endIndex }
}

/**
 * Strategy 4: Sliding window with Levenshtein similarity.
 * Last resort for Layer 1 - computationally expensive.
 */
function trySlidingWindowMatch(
  markdown: string,
  content: string,
  startFrom: number
): { start: number; end: number; similarity: number } | null {
  const windowSize = content.length
  const maxDistance = windowSize * 2  // Search up to 2x length ahead
  const step = Math.floor(windowSize / 4)  // 25% overlap
  const MAX_ITERATIONS = 50  // Hard cap to prevent slowdown

  let bestMatch: { start: number; end: number; similarity: number } | null = null
  let bestSimilarity = 0.75  // Minimum 75% threshold for Layer 1

  let iterations = 0
  for (
    let i = startFrom;
    i < markdown.length - windowSize &&
    i < startFrom + maxDistance &&
    iterations < MAX_ITERATIONS;
    i += step
  ) {
    iterations++
    const window = markdown.slice(i, i + windowSize)
    const similarity = calculateStringSimilarity(content, window)

    if (similarity > bestSimilarity) {
      bestSimilarity = similarity
      bestMatch = { start: i, end: i + windowSize, similarity }

      // Early exit if we found a very good match
      if (similarity >= 0.9) break
    }
  }

  return bestMatch
}

/**
 * Calculate character-level similarity (Levenshtein-based).
 * Returns value between 0 and 1.
 */
function calculateStringSimilarity(str1: string, str2: string): number {
  const longer = str1.length > str2.length ? str1 : str2
  const shorter = str1.length > str2.length ? str2 : str1

  if (longer.length === 0) return 1.0

  const editDistance = levenshteinDistance(shorter, longer)
  return (longer.length - editDistance) / longer.length
}

/**
 * Calculate Levenshtein distance (edit distance).
 */
function levenshteinDistance(str1: string, str2: string): number {
  const matrix: number[][] = []

  for (let i = 0; i <= str2.length; i++) {
    matrix[i] = [i]
  }

  for (let j = 0; j <= str1.length; j++) {
    matrix[0][j] = j
  }

  for (let i = 1; i <= str2.length; i++) {
    for (let j = 1; j <= str1.length; j++) {
      if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1]
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        )
      }
    }
  }

  return matrix[str2.length][str1.length]
}

// ============================================================================
// Layer 2: Embeddings-Based Matching
// ============================================================================

let cachedEmbedder: any = null

/**
 * Layer 2: Embeddings-based matching using Transformers.js.
 *
 * Creates embeddings for unmatched chunks and sliding windows of cleaned markdown.
 * Finds best cosine similarity match (threshold >0.85).
 *
 * Expected success rate: 95-98% cumulative (with Layer 1)
 */
async function layer2_embeddings(
  cleanedMarkdown: string,
  unmatchedChunks: DoclingChunk[]
): Promise<{ matched: MatchResult[]; unmatched: DoclingChunk[] }> {
  if (unmatchedChunks.length === 0) {
    return { matched: [], unmatched: [] }
  }

  console.log(`[Layer 2] Embeddings: Processing ${unmatchedChunks.length} unmatched chunks`)

  // Initialize embedder (cached for performance)
  if (!cachedEmbedder) {
    console.log('[Layer 2] Loading embedding model: Xenova/all-mpnet-base-v2')
    cachedEmbedder = await pipeline(
      'feature-extraction',
      'Xenova/all-mpnet-base-v2'
    )
  }

  const matched: MatchResult[] = []
  const unmatched: DoclingChunk[] = []

  // Generate embeddings for all unmatched chunks
  const chunkTexts = unmatchedChunks.map(c => c.content)
  const chunkEmbeddings = await generateEmbeddings(chunkTexts)

  // Create sliding windows of markdown (same size as chunks)
  const windows: Array<{ start: number; end: number; text: string }> = []
  const avgChunkSize = Math.floor(
    unmatchedChunks.reduce((sum, c) => sum + c.content.length, 0) / unmatchedChunks.length
  )
  const step = Math.floor(avgChunkSize / 2)  // 50% overlap

  for (let i = 0; i < cleanedMarkdown.length - avgChunkSize; i += step) {
    windows.push({
      start: i,
      end: i + avgChunkSize,
      text: cleanedMarkdown.slice(i, i + avgChunkSize)
    })

    // Limit windows to prevent memory explosion (max 1000 windows)
    if (windows.length >= 1000) break
  }

  console.log(`[Layer 2] Created ${windows.length} sliding windows (avg size: ${avgChunkSize} chars)`)

  // Generate embeddings for windows
  const windowEmbeddings = await generateEmbeddings(windows.map(w => w.text))

  // Match each chunk to best window
  for (let i = 0; i < unmatchedChunks.length; i++) {
    const chunk = unmatchedChunks[i]
    const chunkEmb = chunkEmbeddings[i]

    let bestSimilarity = 0.85  // Threshold for Layer 2
    let bestWindow: typeof windows[0] | null = null

    for (let j = 0; j < windows.length; j++) {
      const windowEmb = windowEmbeddings[j]
      const similarity = cosineSimilarity(chunkEmb, windowEmb)

      if (similarity > bestSimilarity) {
        bestSimilarity = similarity
        bestWindow = windows[j]
      }
    }

    if (bestWindow) {
      matched.push({
        chunk,
        start_offset: bestWindow.start,
        end_offset: bestWindow.end,
        confidence: bestSimilarity >= 0.95 ? 'high' : 'medium',
        method: 'embeddings',
        similarity: bestSimilarity
      })
    } else {
      unmatched.push(chunk)
    }
  }

  console.log(`[Layer 2] Embeddings: ${matched.length}/${unmatchedChunks.length} matched`)

  return { matched, unmatched }
}

/**
 * Generate embeddings using Transformers.js.
 * CRITICAL: Must use pooling='mean' and normalize=true.
 */
async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  if (!cachedEmbedder) {
    throw new Error('Embedder not initialized')
  }

  const result = await cachedEmbedder(texts, {
    pooling: 'mean',      // REQUIRED
    normalize: true       // REQUIRED
  })

  return result.tolist()
}

/**
 * Calculate cosine similarity between two embeddings.
 */
function cosineSimilarity(vec1: number[], vec2: number[]): number {
  let dotProduct = 0
  let norm1 = 0
  let norm2 = 0

  for (let i = 0; i < vec1.length; i++) {
    dotProduct += vec1[i] * vec2[i]
    norm1 += vec1[i] * vec1[i]
    norm2 += vec2[i] * vec2[i]
  }

  return dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2))
}

// ============================================================================
// Layer 3: LLM-Assisted Matching (Ollama Qwen)
// ============================================================================

/**
 * Layer 3: LLM-assisted matching using Ollama (Qwen 32B).
 *
 * Asks the LLM to find where chunk content appears in markdown.
 * LLM returns JSON with start/end positions.
 *
 * Expected success rate: 99.9% cumulative (with Layers 1-2)
 */
async function layer3_llmAssisted(
  cleanedMarkdown: string,
  unmatchedChunks: DoclingChunk[]
): Promise<{ matched: MatchResult[]; unmatched: DoclingChunk[] }> {
  if (unmatchedChunks.length === 0) {
    return { matched: [], unmatched: [] }
  }

  console.log(`[Layer 3] LLM: Processing ${unmatchedChunks.length} unmatched chunks`)

  const ollama = new OllamaClient()
  const matched: MatchResult[] = []
  const unmatched: DoclingChunk[] = []

  for (const chunk of unmatchedChunks) {
    try {
      // Create search window around expected position
      const searchWindow = createSearchWindow(cleanedMarkdown, chunk)

      // Ask LLM to find the chunk in the window
      const prompt = `You are helping match text chunks to their positions in a document.

Find where this CHUNK appears in the SEARCH WINDOW below:

CHUNK:
${chunk.content.slice(0, 500)}${chunk.content.length > 500 ? '...' : ''}

SEARCH WINDOW:
${searchWindow.text}

Return JSON with the character offsets where the chunk appears:
{
  "found": true/false,
  "start_offset": <relative position in window>,
  "end_offset": <relative position in window>,
  "confidence": "high"/"medium"/"low"
}

If the chunk is not in the window, return {"found": false}.`

      const response = await ollama.generateStructured(prompt) as {
        found: boolean
        start_offset?: number
        end_offset?: number
        confidence?: string
      }

      if (response.found && response.start_offset !== undefined && response.end_offset !== undefined) {
        // Convert relative offsets to absolute
        const absoluteStart = searchWindow.start + response.start_offset
        const absoluteEnd = searchWindow.start + response.end_offset

        matched.push({
          chunk,
          start_offset: absoluteStart,
          end_offset: absoluteEnd,
          confidence: 'medium',
          method: 'llm_assisted',
          similarity: response.confidence === 'high' ? 0.9 : 0.85
        })
      } else {
        unmatched.push(chunk)
      }
    } catch (error: any) {
      console.warn(`[Layer 3] LLM failed for chunk ${chunk.index}: ${error.message}`)
      unmatched.push(chunk)
    }
  }

  console.log(`[Layer 3] LLM: ${matched.length}/${unmatchedChunks.length} matched`)

  return { matched, unmatched }
}

/**
 * Create a search window around the expected chunk position.
 * Uses page numbers and chunk index to estimate position.
 */
function createSearchWindow(
  markdown: string,
  chunk: DoclingChunk
): { start: number; end: number; text: string } {
  // Estimate position based on chunk index
  const estimatedPos = Math.floor((chunk.index / 400) * markdown.length)  // Assume ~400 chunks per doc

  // Create 10KB window around estimated position
  const windowSize = 10000
  const start = Math.max(0, estimatedPos - windowSize / 2)
  const end = Math.min(markdown.length, start + windowSize)

  return {
    start,
    end,
    text: markdown.slice(start, end)
  }
}

// ============================================================================
// Layer 4: Anchor Interpolation (100% Guarantee)
// ============================================================================

/**
 * Layer 4: Anchor interpolation (NEVER FAILS).
 *
 * Uses successfully matched chunks as anchors to calculate synthetic positions
 * for remaining unmatched chunks. Always returns a result.
 *
 * Success rate: 100% GUARANTEED
 */
function layer4_interpolation(
  cleanedMarkdown: string,
  unmatchedChunks: DoclingChunk[],
  matchedResults: MatchResult[]
): MatchResult[] {
  if (unmatchedChunks.length === 0) {
    return []
  }

  console.log(`[Layer 4] Interpolation: Processing ${unmatchedChunks.length} unmatched chunks`)

  // Sort matched results by chunk index to create anchor points
  const anchors = [...matchedResults].sort((a, b) => a.chunk.index - b.chunk.index)

  const synthetic: MatchResult[] = []

  for (const chunk of unmatchedChunks) {
    // Find nearest anchors (before and after this chunk)
    const beforeAnchor = findNearestAnchor(anchors, chunk.index, 'before')
    const afterAnchor = findNearestAnchor(anchors, chunk.index, 'after')

    let estimatedStart: number
    let estimatedEnd: number

    if (beforeAnchor && afterAnchor) {
      // Interpolate between two anchors
      const ratio = (chunk.index - beforeAnchor.chunk.index) / (afterAnchor.chunk.index - beforeAnchor.chunk.index)
      const rangeStart = beforeAnchor.end_offset
      const rangeEnd = afterAnchor.start_offset
      estimatedStart = Math.floor(rangeStart + (rangeEnd - rangeStart) * ratio)
      estimatedEnd = estimatedStart + chunk.content.length
    } else if (beforeAnchor) {
      // After last anchor - extrapolate forward
      const avgChunkSize = (beforeAnchor.end_offset - beforeAnchor.start_offset)
      const distance = chunk.index - beforeAnchor.chunk.index
      estimatedStart = beforeAnchor.end_offset + (avgChunkSize * distance)
      estimatedEnd = estimatedStart + chunk.content.length
    } else if (afterAnchor) {
      // Before first anchor - extrapolate backward
      const avgChunkSize = (afterAnchor.end_offset - afterAnchor.start_offset)
      const distance = afterAnchor.chunk.index - chunk.index
      estimatedStart = Math.max(0, afterAnchor.start_offset - (avgChunkSize * distance))
      estimatedEnd = estimatedStart + chunk.content.length
    } else {
      // No anchors at all (should never happen, but handle gracefully)
      const avgPos = Math.floor((chunk.index / 400) * cleanedMarkdown.length)
      estimatedStart = avgPos
      estimatedEnd = avgPos + chunk.content.length
    }

    // Clamp to valid range
    estimatedStart = Math.max(0, Math.min(estimatedStart, cleanedMarkdown.length))
    estimatedEnd = Math.max(estimatedStart, Math.min(estimatedEnd, cleanedMarkdown.length))

    synthetic.push({
      chunk,
      start_offset: estimatedStart,
      end_offset: estimatedEnd,
      confidence: 'synthetic',
      method: 'interpolation',
      similarity: 0  // Synthetic position, no similarity score
    })
  }

  console.log(`[Layer 4] Interpolation: ${synthetic.length} synthetic chunks created (100% recovery)`)

  return synthetic
}

/**
 * Find nearest anchor chunk (before or after target index).
 */
function findNearestAnchor(
  anchors: MatchResult[],
  targetIndex: number,
  direction: 'before' | 'after'
): MatchResult | null {
  if (direction === 'before') {
    // Find latest anchor before target
    for (let i = anchors.length - 1; i >= 0; i--) {
      if (anchors[i].chunk.index < targetIndex) {
        return anchors[i]
      }
    }
  } else {
    // Find earliest anchor after target
    for (let i = 0; i < anchors.length; i++) {
      if (anchors[i].chunk.index > targetIndex) {
        return anchors[i]
      }
    }
  }
  return null
}

// ============================================================================
// Orchestrator: Run All 5 Layers
// ============================================================================

/**
 * Bulletproof matching orchestrator.
 *
 * Runs all 5 layers sequentially until 100% chunk recovery is achieved.
 * Layer 4 (interpolation) NEVER fails, guaranteeing 100% recovery.
 *
 * @param cleanedMarkdown - Markdown after Ollama cleanup
 * @param doclingChunks - Chunks from Docling HybridChunker with structural metadata
 * @param options - Orchestrator options (enable/disable layers, progress callback)
 * @returns Matched chunks with statistics and warnings
 */
export async function bulletproofMatch(
  cleanedMarkdown: string,
  doclingChunks: DoclingChunk[],
  options: BulletproofMatchOptions = {}
): Promise<{
  chunks: MatchResult[]
  stats: MatchStats
  warnings: string[]
}> {
  const startTime = Date.now()
  const warnings: string[] = []

  console.log(`[Bulletproof Matcher] Starting 5-layer matching for ${doclingChunks.length} chunks`)

  const allMatched: MatchResult[] = []
  let remaining = doclingChunks

  // Layer 1: Enhanced Fuzzy
  if (options.enabledLayers?.layer1 !== false) {
    const { matched, unmatched } = await layer1_enhancedFuzzy(cleanedMarkdown, remaining)
    allMatched.push(...matched)
    remaining = unmatched

    if (options.onProgress) {
      options.onProgress(1, matched.length, remaining.length)
    }

    if (remaining.length === 0) {
      console.log('[Bulletproof Matcher] ✅ 100% recovery achieved in Layer 1')
      return finalizeBulletproofMatch(allMatched, doclingChunks, startTime, warnings)
    }
  }

  // Layer 2: Embeddings
  if (options.enabledLayers?.layer2 !== false) {
    const { matched, unmatched } = await layer2_embeddings(cleanedMarkdown, remaining)
    allMatched.push(...matched)
    remaining = unmatched

    if (options.onProgress) {
      options.onProgress(2, matched.length, remaining.length)
    }

    if (remaining.length === 0) {
      console.log('[Bulletproof Matcher] ✅ 100% recovery achieved in Layer 2')
      return finalizeBulletproofMatch(allMatched, doclingChunks, startTime, warnings)
    }
  }

  // Layer 3: LLM-Assisted
  if (options.enabledLayers?.layer3 !== false) {
    const { matched, unmatched } = await layer3_llmAssisted(cleanedMarkdown, remaining)
    allMatched.push(...matched)
    remaining = unmatched

    if (options.onProgress) {
      options.onProgress(3, matched.length, remaining.length)
    }

    if (remaining.length === 0) {
      console.log('[Bulletproof Matcher] ✅ 100% recovery achieved in Layer 3')
      return finalizeBulletproofMatch(allMatched, doclingChunks, startTime, warnings)
    }
  }

  // Layer 4: Interpolation (ALWAYS runs if there are remaining chunks)
  if (options.enabledLayers?.layer4 !== false && remaining.length > 0) {
    const synthetic = layer4_interpolation(cleanedMarkdown, remaining, allMatched)
    allMatched.push(...synthetic)

    // Generate warnings for synthetic chunks
    for (const result of synthetic) {
      warnings.push(
        `Chunk ${result.chunk.index} (page ${result.chunk.meta.page_start || 'unknown'}): ` +
        `Position approximate, metadata preserved. Validation recommended.`
      )
    }

    if (options.onProgress) {
      options.onProgress(4, synthetic.length, 0)
    }

    console.log('[Bulletproof Matcher] ✅ 100% recovery GUARANTEED by Layer 4')
  }

  return finalizeBulletproofMatch(allMatched, doclingChunks, startTime, warnings)
}

/**
 * Finalize bulletproof match results with statistics.
 */
function finalizeBulletproofMatch(
  allMatched: MatchResult[],
  originalChunks: DoclingChunk[],
  startTime: number,
  warnings: string[]
): {
  chunks: MatchResult[]
  stats: MatchStats
  warnings: string[]
} {
  // Sort by chunk index to maintain document order
  allMatched.sort((a, b) => a.chunk.index - b.chunk.index)

  // Validation: Enforce sequential ordering (no overlaps/backwards jumps)
  // CRITICAL: Prevents overlapping offsets that break binary search in block parser
  for (let i = 1; i < allMatched.length; i++) {
    const prev = allMatched[i - 1]
    const curr = allMatched[i]

    if (curr.start_offset < prev.end_offset) {
      console.warn(
        `[Bulletproof Matcher] ⚠️  Chunk ${curr.chunk.index} overlaps with ${prev.chunk.index} ` +
        `(start ${curr.start_offset} < prev end ${prev.end_offset}), enforcing sequential order`
      )

      const originalStart = curr.start_offset
      const originalEnd = curr.end_offset

      // Force sequential: current chunk starts where previous ended
      curr.start_offset = prev.end_offset
      curr.end_offset = Math.max(
        curr.start_offset + curr.chunk.content.length,
        prev.end_offset + 1  // Minimum 1 char gap
      )

      // Downgrade confidence if we had to fix it
      if (curr.confidence === 'exact') {
        curr.confidence = 'high'
        curr.method = 'normalized_match'  // Adjusted from exact
      } else if (curr.confidence === 'high') {
        curr.confidence = 'medium'
      }

      warnings.push(
        `Chunk ${curr.chunk.index} (page ${curr.chunk.meta.page_start || 'unknown'}): ` +
        `Position overlap corrected. Original: [${originalStart}-${originalEnd}], ` +
        `Adjusted: [${curr.start_offset}-${curr.end_offset}]. Validation recommended.`
      )
    }
  }

  // Calculate statistics
  const stats: MatchStats = {
    total: originalChunks.length,
    exact: allMatched.filter(r => r.confidence === 'exact').length,
    high: allMatched.filter(r => r.confidence === 'high').length,
    medium: allMatched.filter(r => r.confidence === 'medium').length,
    synthetic: allMatched.filter(r => r.confidence === 'synthetic').length,
    processingTime: Date.now() - startTime,
    byLayer: {
      layer1: allMatched.filter(r =>
        ['exact_match', 'normalized_match', 'multi_anchor_search', 'sliding_window'].includes(r.method)
      ).length,
      layer2: allMatched.filter(r => r.method === 'embeddings').length,
      layer3: allMatched.filter(r => r.method === 'llm_assisted').length,
      layer4: allMatched.filter(r => r.method === 'interpolation').length
    }
  }

  // Validation check
  if (allMatched.length !== originalChunks.length) {
    console.error(
      `[Bulletproof Matcher] ❌ CRITICAL: Expected ${originalChunks.length} chunks, got ${allMatched.length}`
    )
    throw new Error('Bulletproof matching failed: Chunk count mismatch')
  }

  console.log(`[Bulletproof Matcher] ✅ Complete: ${stats.total} chunks matched in ${stats.processingTime}ms`)
  console.log(`  Exact: ${stats.exact} (${(stats.exact / stats.total * 100).toFixed(1)}%)`)
  console.log(`  High: ${stats.high} (${(stats.high / stats.total * 100).toFixed(1)}%)`)
  console.log(`  Medium: ${stats.medium} (${(stats.medium / stats.total * 100).toFixed(1)}%)`)
  console.log(`  Synthetic: ${stats.synthetic} (${(stats.synthetic / stats.total * 100).toFixed(1)}%)`)
  console.log(`  By Layer: L1=${stats.byLayer.layer1}, L2=${stats.byLayer.layer2}, L3=${stats.byLayer.layer3}, L4=${stats.byLayer.layer4}`)

  return { chunks: allMatched, stats, warnings }
}
