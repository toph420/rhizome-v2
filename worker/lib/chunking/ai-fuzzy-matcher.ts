/**
 * AI-specific fuzzy matching for chunk offset correction.
 *
 * Handles AI normalization patterns:
 * - Whitespace collapse (AI converts \\n\\n\\n → \\n\\n)
 * - Content rewording (70-85% similarity)
 * - Character-level edits
 *
 * Uses 4-strategy matching:
 * 1. Exact match
 * 2. Normalized whitespace
 * 3. First/last 100 chars (boundary markers)
 * 4. Sliding window with Levenshtein distance
 */

import type { ChunkWithOffsets } from '../../types/chunking'
import { FuzzyMatchError } from './errors'

/**
 * Result from fuzzy matching with confidence level.
 */
export interface AIFuzzyMatch {
  start: number
  end: number
  confidence: 'exact' | 'fuzzy' | 'approximate'
  similarity: number // 0-100 percentage
}

/**
 * Statistics from offset correction process.
 */
export interface MatchStats {
  exact: number
  fuzzy: number
  approximate: number
  failed: number
}

/**
 * Telemetry data for monitoring offset accuracy.
 */
export interface OffsetAccuracyTelemetry {
  documentId?: string
  totalChunks: number
  exactMatches: number
  fuzzyMatches: number
  approximateMatches: number
  failed: number
  accuracy: number
  processingTime: number
}

/**
 * Corrects AI-provided chunk offsets using fuzzy matching.
 *
 * AI often normalizes whitespace/newlines, so we:
 * 1. Fuzzy search to find where AI's content appears in markdown
 * 2. Extract EXACT content from markdown at that location
 * 3. Replace AI's content with exact markdown bytes
 * 4. Calculate precise offsets
 * 5. Preserve AI's semantic metadata (themes, concepts, emotional analysis)
 *
 * @param fullMarkdown - Original markdown source
 * @param chunks - AI-generated chunks with approximate offsets
 * @returns Corrected chunks with accurate offsets and match statistics
 */
export function correctAIChunkOffsets(
  fullMarkdown: string,
  chunks: ChunkWithOffsets[]
): { chunks: ChunkWithOffsets[]; stats: MatchStats; telemetry: OffsetAccuracyTelemetry } {
  const startTime = Date.now()
  let searchHint = 0

  // Telemetry counters (track all 4 strategies)
  const stats: MatchStats = {
    exact: 0,
    fuzzy: 0,
    approximate: 0,
    failed: 0
  }

  const corrected = chunks.map((chunk, i) => {
    // Try exact match first
    const exactIndex = fullMarkdown.indexOf(chunk.content, searchHint)
    if (exactIndex !== -1) {
      stats.exact++
      searchHint = exactIndex + chunk.content.length
      return {
        ...chunk,
        start_offset: exactIndex,
        end_offset: exactIndex + chunk.content.length
      }
    }

    // Use 4-strategy fuzzy matching
    const fuzzyMatch = fuzzySearchMarkdown(
      fullMarkdown,
      chunk.content,
      searchHint
    )

    if (!fuzzyMatch) {
      stats.failed++
      console.error(`[AI Metadata] ❌ Chunk ${i}: Cannot locate content`)
      console.error(`[AI Metadata]    First 200 chars: ${chunk.content.slice(0, 200)}`)
      console.error(`[AI Metadata]    Last 100 chars: ${chunk.content.slice(-100)}`)
      return chunk
    }

    // Track match type for telemetry
    if (fuzzyMatch.confidence === 'fuzzy') stats.fuzzy++
    else if (fuzzyMatch.confidence === 'approximate') stats.approximate++

    const exactContent = fullMarkdown.slice(fuzzyMatch.start, fuzzyMatch.end)
    searchHint = fuzzyMatch.end

    console.log(
      `[AI Metadata] ✓ Chunk ${i}: ${fuzzyMatch.confidence.toUpperCase()} ` +
      `match (${fuzzyMatch.similarity}% similar) at ${fuzzyMatch.start}→${fuzzyMatch.end}`
    )

    return {
      ...chunk,
      content: exactContent,
      start_offset: fuzzyMatch.start,
      end_offset: fuzzyMatch.end
    }
  })

  // Validation step (ensure markdown.slice() === content)
  let validationFailures = 0
  for (let i = 0; i < corrected.length; i++) {
    const chunk = corrected[i]
    const extracted = fullMarkdown.slice(chunk.start_offset, chunk.end_offset)
    if (extracted !== chunk.content) {
      validationFailures++
      console.error(`[AI Metadata] ⚠️  Chunk ${i}: Content mismatch after correction`)
    }
  }

  // Log summary with all 4 match types
  const total = chunks.length
  const accuracy = ((stats.exact + stats.fuzzy + stats.approximate) / total * 100).toFixed(1)

  console.log(`[AI Metadata] Content correction complete:`)
  console.log(`  ✅ Exact matches: ${stats.exact}/${total} (${(stats.exact/total*100).toFixed(1)}%)`)
  console.log(`  🔍 Fuzzy matches: ${stats.fuzzy}/${total} (${(stats.fuzzy/total*100).toFixed(1)}%)`)
  console.log(`  📍 Approximate matches: ${stats.approximate}/${total}`)
  console.log(`  ❌ Failures: ${stats.failed}/${total}`)
  console.log(`  📊 Overall accuracy: ${accuracy}%`)
  console.log(`  ⚠️  Validation failures: ${validationFailures}/${total}`)

  if (validationFailures > 0) {
    console.error(
      `[AI Metadata] CRITICAL: ${validationFailures} chunks failed validation!`
    )
  }

  const processingTime = Date.now() - startTime

  // Build telemetry
  const telemetry: OffsetAccuracyTelemetry = {
    totalChunks: chunks.length,
    exactMatches: stats.exact,
    fuzzyMatches: stats.fuzzy,
    approximateMatches: stats.approximate,
    failed: stats.failed,
    accuracy: ((stats.exact + stats.fuzzy + stats.approximate) / chunks.length) * 100,
    processingTime
  }

  console.log('[AI Metadata] 📊 Offset Telemetry:', JSON.stringify(telemetry))

  return { chunks: corrected, stats, telemetry }
}

/**
 * Find where content appears in markdown using 4-strategy fuzzy matching.
 *
 * Strategy 1: Exact match (100% similarity)
 * Strategy 2: Normalized whitespace match (95% similarity)
 * Strategy 3: First 100/last 100 chars (85% similarity)
 * Strategy 4: Sliding window with Levenshtein (70-85% similarity)
 *
 * @param markdown - Full markdown source
 * @param targetContent - AI-generated chunk content
 * @param startFrom - Character position to start search
 * @returns Match with position and confidence, or null if not found
 */
function fuzzySearchMarkdown(
  markdown: string,
  targetContent: string,
  startFrom: number = 0
): AIFuzzyMatch | null {
  // Strategy 1: Try exact match first
  const exactIndex = markdown.indexOf(targetContent, startFrom)
  if (exactIndex !== -1) {
    return {
      start: exactIndex,
      end: exactIndex + targetContent.length,
      confidence: 'exact',
      similarity: 100
    }
  }

  // Strategy 2: Heading-agnostic match (normalize heading levels)
  // AI often changes # → ## or vice versa, but content is the same
  const headingNormalized = targetContent
    .replace(/^#{1,6}\s+/gm, '').trim()  // Remove leading heading markers
    .replace(/\s+/g, ' ')  // Normalize whitespace

  if (headingNormalized.length > 50) {  // Only for substantial content
    // Escape regex special characters, then allow flexible whitespace and heading levels
    const escapedContent = headingNormalized.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const flexiblePattern = escapedContent.replace(/ /g, '\\s+')

    try {
      const regex = new RegExp(flexiblePattern)
      const searchRegion = markdown.slice(startFrom)
      const match = searchRegion.match(regex)

      if (match && match.index !== undefined) {
        const originalIndex = startFrom + match.index
        // Find the actual start (may include heading markers before matched content)
        const beforeMatch = markdown.slice(Math.max(0, originalIndex - 20), originalIndex)
        const headingMatch = beforeMatch.match(/#{1,6}\s+$/)
        const actualStart = headingMatch ? originalIndex - headingMatch[0].length : originalIndex

        return {
          start: actualStart,
          end: originalIndex + match[0].length,
          confidence: 'fuzzy',
          similarity: 95
        }
      }
    } catch (e) {
      // Regex pattern too complex - skip this strategy
      // Fall through to Strategy 3
    }
  }

  // Strategy 2b: Fuzzy match with normalized whitespace (MEMORY OPTIMIZED)
  // Don't create full markdown copy - use regex search instead
  const normalizedContent = targetContent.trim().replace(/\s+/g, ' ')

  // Escape regex special characters, then allow flexible whitespace
  const escapedContent = normalizedContent.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const flexiblePattern = escapedContent.replace(/ /g, '\\s+')

  try {
    const regex = new RegExp(flexiblePattern)
    const searchRegion = markdown.slice(startFrom)
    const match = searchRegion.match(regex)

    if (match && match.index !== undefined) {
      const originalIndex = startFrom + match.index
      return {
        start: originalIndex,
        end: originalIndex + match[0].length,  // Use actual matched length
        confidence: 'fuzzy',
        similarity: 95
      }
    }
  } catch (e) {
    // Regex pattern too complex - skip this strategy
    // Fall through to Strategy 3
  }

  // Strategy 3: First 100/last 100 chars (for heavily modified chunks)
  const contentStart = targetContent.slice(0, 100).trim()
  const contentEnd = targetContent.slice(-100).trim()

  const startIndex = markdown.indexOf(contentStart, startFrom)
  if (startIndex !== -1) {
    // Search for end marker AFTER the start, with reasonable distance limit
    // Assume chunk is at most 5x the target length (handles AI rewording)
    const searchLimit = Math.min(
      startIndex + targetContent.length * 5,
      markdown.length
    )

    // Search from startIndex forward, not from beginning
    const searchRegion = markdown.slice(startIndex, searchLimit)
    const endRelativeIndex = searchRegion.indexOf(contentEnd)

    if (endRelativeIndex !== -1) {
      const endIndex = startIndex + endRelativeIndex
      return {
        start: startIndex,
        end: endIndex + contentEnd.length,
        confidence: 'approximate',
        similarity: 85
      }
    }
  }

  // Strategy 4: Sliding window with character-level similarity (last resort, MEMORY OPTIMIZED)
  // When content is heavily rewritten, find the best matching region
  const windowSize = targetContent.length
  const maxDistance = targetContent.length * 2 // Allow up to 2x length variation
  const MAX_ITERATIONS = 100 // Hard cap to prevent memory explosion
  const step = Math.max(Math.floor(windowSize / 2), 1000) // Bigger steps = fewer allocations (was windowSize/4)

  let bestMatch: AIFuzzyMatch | null = null
  let bestSimilarity = 0.7 // Minimum 70% similarity threshold
  let iterations = 0

  // Start from hint and search forward with sliding window
  for (
    let i = startFrom;
    i < markdown.length - windowSize &&
    i < startFrom + maxDistance &&
    iterations < MAX_ITERATIONS; // Safety cap
    i += step
  ) {
    iterations++
    const window = markdown.slice(i, i + windowSize)
    const similarity = calculateStringSimilarity(targetContent, window)

    if (similarity > bestSimilarity) {
      bestSimilarity = similarity
      bestMatch = {
        start: i,
        end: i + windowSize,
        confidence: 'approximate',
        similarity: Math.round(similarity * 100)
      }

      // Early exit if we found a good match (don't keep searching for "perfect")
      if (similarity >= 0.85) {
        break
      }
    }
  }

  if (bestMatch) {
    return bestMatch
  }

  return null // Failed to locate
}

/**
 * Calculate character-level similarity between two strings (Levenshtein-based).
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
 * Calculate Levenshtein distance (edit distance) between two strings.
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

// mapNormalizedToOriginal function removed - no longer needed with regex-based fuzzy matching
