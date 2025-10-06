/**
 * AI-Powered Markdown Cleanup
 *
 * Second-pass cleanup using Gemini to polish extracted markdown.
 * Focuses on removing artifacts and fixing formatting without changing content.
 *
 * Handles large documents through batching:
 * - Documents < 50K chars: Single-pass cleanup
 * - Documents >= 50K chars: Batched cleanup with heading boundaries
 *
 * Cost: ~$0.02-0.10 per document depending on size (uses Gemini 2.5 Flash)
 * Speed: ~10-60 seconds depending on document size
 */

import type { GoogleGenAI } from '@google/genai'
import { generateMarkdownCleanupPrompt } from './prompts/markdown-cleanup.js'
import { GEMINI_MODEL, MAX_OUTPUT_TOKENS } from './model-config.js'

/**
 * Threshold for batched processing (characters)
 * 50K chars ≈ 12.5K tokens, well under the 65K output limit
 */
const BATCH_SIZE_CHARS = 50000

/**
 * Overlap between batches to preserve context at boundaries
 */
const BATCH_OVERLAP_CHARS = 1000

/**
 * Configuration for markdown cleanup
 */
export interface MarkdownCleanupConfig {
  /**
   * Enable progress logging
   * @default false
   */
  enableProgress?: boolean

  /**
   * Custom model to use (defaults to GEMINI_MODEL from config)
   */
  modelName?: string

  /**
   * Maximum output tokens (defaults to MAX_OUTPUT_TOKENS from config)
   */
  maxOutputTokens?: number

  /**
   * Temperature for generation (lower = more consistent)
   * @default 0.1
   */
  temperature?: number

  /**
   * Progress callback for batched processing
   */
  onProgress?: (batchNumber: number, totalBatches: number) => void | Promise<void>
}

/**
 * Clean extracted markdown using AI.
 *
 * This function sends the extracted markdown to Gemini for a second pass
 * of cleanup, focusing purely on formatting polish without changing content.
 *
 * Automatically handles batching for large documents (>50K chars):
 * - Small documents: Single AI call
 * - Large documents: Batched with overlap and stitching
 *
 * Use this AFTER initial extraction but BEFORE chunking to ensure the
 * cleanest possible markdown for downstream processing.
 *
 * @param ai - GoogleGenAI client instance
 * @param markdown - Extracted markdown to clean
 * @param config - Optional configuration
 * @returns Cleaned markdown string
 * @throws Error if AI cleanup fails
 *
 * @example
 * ```typescript
 * const cleanedMarkdown = await cleanMarkdownWithAI(
 *   ai,
 *   extractedMarkdown,
 *   {
 *     enableProgress: true,
 *     onProgress: (batch, total) => console.log(`Batch ${batch}/${total}`)
 *   }
 * )
 * ```
 */
export async function cleanMarkdownWithAI(
  ai: GoogleGenAI,
  markdown: string,
  config: MarkdownCleanupConfig = {}
): Promise<string> {
  if (!markdown || markdown.trim().length === 0) {
    throw new Error('Cannot clean empty markdown')
  }

  const markdownChars = markdown.length

  // Decide between single-pass and batched processing
  if (markdownChars <= BATCH_SIZE_CHARS) {
    // Small document: single-pass cleanup
    return await cleanMarkdownSinglePass(ai, markdown, config)
  } else {
    // Large document: batched cleanup with stitching
    return await cleanMarkdownBatched(ai, markdown, config)
  }
}

/**
 * Clean markdown in a single AI call (for documents < 50K chars).
 */
async function cleanMarkdownSinglePass(
  ai: GoogleGenAI,
  markdown: string,
  config: MarkdownCleanupConfig
): Promise<string> {
  const {
    enableProgress = false,
    modelName = GEMINI_MODEL,
    maxOutputTokens = MAX_OUTPUT_TOKENS,
    temperature = 0.1
  } = config

  const markdownKB = Math.round(markdown.length / 1024)

  if (enableProgress) {
    console.log(`[markdown-cleanup-ai] Cleaning ${markdownKB}KB markdown (single-pass)`)
  }

  const startTime = Date.now()

  try {
    const result = await ai.models.generateContent({
      model: modelName,
      contents: [{
        parts: [
          { text: generateMarkdownCleanupPrompt() },
          { text: `\n\nHere is the markdown to clean:\n\n${markdown}` }
        ]
      }],
      config: {
        maxOutputTokens,
        temperature
      }
    })

    if (!result || !result.text) {
      throw new Error('AI returned empty response during markdown cleanup')
    }

    let cleaned = result.text.trim()

    // Remove any markdown code block wrappers if AI added them
    if (cleaned.startsWith('```markdown')) {
      cleaned = cleaned.replace(/^```markdown\s*\n?/, '').replace(/\n?```\s*$/, '')
    } else if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```\s*\n?/, '').replace(/\n?```\s*$/, '')
    }

    const elapsedMs = Date.now() - startTime
    const cleanedKB = Math.round(cleaned.length / 1024)

    if (enableProgress) {
      console.log(
        `[markdown-cleanup-ai] ✅ Single-pass complete in ${Math.round(elapsedMs / 1000)}s ` +
        `(${markdownKB}KB → ${cleanedKB}KB)`
      )
    }

    return cleaned
  } catch (error: any) {
    const elapsedMs = Date.now() - startTime
    console.error(
      `[markdown-cleanup-ai] ❌ Single-pass cleanup failed after ${Math.round(elapsedMs / 1000)}s:`,
      error.message
    )
    throw new Error(`AI markdown cleanup failed: ${error.message}`)
  }
}

/**
 * Clean markdown in batches (for documents > 50K chars).
 * Splits at heading boundaries when possible to avoid breaking sections.
 */
async function cleanMarkdownBatched(
  ai: GoogleGenAI,
  markdown: string,
  config: MarkdownCleanupConfig
): Promise<string> {
  const {
    enableProgress = false,
    modelName = GEMINI_MODEL,
    maxOutputTokens = MAX_OUTPUT_TOKENS,
    temperature = 0.1,
    onProgress
  } = config

  const markdownKB = Math.round(markdown.length / 1024)
  const estimatedBatches = Math.ceil(markdown.length / BATCH_SIZE_CHARS)

  if (enableProgress) {
    console.log(
      `[markdown-cleanup-ai] Cleaning ${markdownKB}KB markdown in ~${estimatedBatches} batches`
    )
  }

  const startTime = Date.now()

  try {
    // Split markdown into batches at heading boundaries
    const batches = splitMarkdownIntoBatches(markdown, BATCH_SIZE_CHARS, BATCH_OVERLAP_CHARS)

    if (enableProgress) {
      console.log(`[markdown-cleanup-ai] Split into ${batches.length} batches`)
    }

    // Clean each batch
    const cleanedBatches: string[] = []

    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i]

      if (onProgress) {
        await onProgress(i + 1, batches.length)
      }

      if (enableProgress) {
        console.log(
          `[markdown-cleanup-ai] Cleaning batch ${i + 1}/${batches.length} ` +
          `(${Math.round(batch.length / 1024)}KB)`
        )
      }

      const result = await ai.models.generateContent({
        model: modelName,
        contents: [{
          parts: [
            { text: generateMarkdownCleanupPrompt() },
            { text: `\n\nHere is the markdown to clean:\n\n${batch}` }
          ]
        }],
        config: {
          maxOutputTokens,
          temperature
        }
      })

      if (!result || !result.text) {
        throw new Error(`Batch ${i + 1} returned empty response`)
      }

      let cleaned = result.text.trim()

      // Remove markdown code block wrappers
      if (cleaned.startsWith('```markdown')) {
        cleaned = cleaned.replace(/^```markdown\s*\n?/, '').replace(/\n?```\s*$/, '')
      } else if (cleaned.startsWith('```')) {
        cleaned = cleaned.replace(/^```\s*\n?/, '').replace(/\n?```\s*$/, '')
      }

      cleanedBatches.push(cleaned)
    }

    // Stitch batches together, removing overlap
    const stitched = stitchCleanedBatches(cleanedBatches, BATCH_OVERLAP_CHARS)

    const elapsedMs = Date.now() - startTime
    const stitchedKB = Math.round(stitched.length / 1024)

    // Warn if stitching introduced significant length drift
    const lengthDiff = Math.abs(stitched.length - markdown.length)
    const driftPercent = (lengthDiff / markdown.length) * 100
    if (driftPercent > 5) {
      console.warn(
        `[markdown-cleanup-ai] ⚠️  Stitching introduced ${driftPercent.toFixed(1)}% length drift ` +
        `(${lengthDiff} chars). Chunk offsets may be approximate.`
      )
    }

    if (enableProgress) {
      console.log(
        `[markdown-cleanup-ai] ✅ Batched cleanup complete in ${Math.round(elapsedMs / 1000)}s ` +
        `(${batches.length} batches, ${markdownKB}KB → ${stitchedKB}KB)`
      )
    }

    return stitched
  } catch (error: any) {
    const elapsedMs = Date.now() - startTime
    console.error(
      `[markdown-cleanup-ai] ❌ Batched cleanup failed after ${Math.round(elapsedMs / 1000)}s:`,
      error.message
    )
    throw new Error(`AI markdown cleanup (batched) failed: ${error.message}`)
  }
}

/**
 * Split markdown into batches at heading boundaries when possible.
 * Adds overlap between batches to preserve context.
 *
 * @param markdown - Full markdown to split
 * @param batchSize - Target batch size in characters
 * @param overlap - Overlap size in characters
 * @returns Array of markdown batch strings
 */
function splitMarkdownIntoBatches(
  markdown: string,
  batchSize: number,
  overlap: number
): string[] {
  const batches: string[] = []
  let currentPos = 0

  while (currentPos < markdown.length) {
    const endPos = Math.min(currentPos + batchSize, markdown.length)

    // Try to find a heading boundary near the end position
    const searchStart = Math.max(currentPos, endPos - 500) // Look back up to 500 chars
    const searchEnd = Math.min(endPos + 500, markdown.length) // Look ahead up to 500 chars
    const searchRegion = markdown.substring(searchStart, searchEnd)

    // Find heading markers (##, ###, etc.) near the boundary
    const headingMatch = searchRegion.match(/\n(#{1,6}\s+.+)\n/g)

    let actualEndPos = endPos

    if (headingMatch && headingMatch.length > 0) {
      // Find the closest heading to our target end position
      const lastHeading = headingMatch[headingMatch.length - 1]
      const headingPos = searchRegion.lastIndexOf(lastHeading)

      if (headingPos !== -1) {
        actualEndPos = searchStart + headingPos

        // Don't create a batch that's too small
        if (actualEndPos - currentPos < batchSize * 0.5) {
          actualEndPos = endPos
        }
      }
    }

    // Extract batch with overlap for context
    const batchEnd = Math.min(actualEndPos + overlap, markdown.length)
    const batch = markdown.substring(currentPos, batchEnd)
    batches.push(batch)

    // Move to next batch position (accounting for overlap)
    currentPos = actualEndPos

    // Break if we've reached the end
    if (currentPos >= markdown.length) {
      break
    }
  }

  return batches
}

/**
 * Stitch cleaned batches together, removing overlap regions.
 * Uses fuzzy matching to find and remove duplicate content at boundaries.
 *
 * @param batches - Array of cleaned batch strings
 * @param overlapSize - Expected overlap size in characters
 * @returns Stitched markdown string
 */
function stitchCleanedBatches(batches: string[], overlapSize: number): string {
  if (batches.length === 0) {
    return ''
  }

  if (batches.length === 1) {
    return batches[0]
  }

  let stitched = batches[0]

  for (let i = 1; i < batches.length; i++) {
    const prevBatch = batches[i - 1]
    const currentBatch = batches[i]

    // Get the overlap region from the end of previous batch
    const prevOverlap = prevBatch.substring(Math.max(0, prevBatch.length - overlapSize * 2))

    // Find where the current batch starts relative to the overlap
    // Look for the first significant paragraph or heading
    const currentStart = currentBatch.substring(0, overlapSize * 2)

    // Find common text between end of prev and start of current
    let bestMatchPos = 0
    let bestMatchLen = 0

    // Try to find a paragraph or heading boundary
    const paragraphMatches = currentStart.match(/\n\n(.{20,})/g)

    if (paragraphMatches && paragraphMatches.length > 0) {
      const firstPara = paragraphMatches[0].trim()
      const matchPos = prevOverlap.indexOf(firstPara)

      if (matchPos !== -1) {
        // Found the paragraph in the overlap - skip to after it in current batch
        const skipTo = currentStart.indexOf(firstPara) + firstPara.length
        stitched += currentBatch.substring(skipTo)
        continue
      }
    }

    // Fallback: just skip the overlap amount
    const skipAmount = Math.min(overlapSize, currentBatch.length)
    stitched += currentBatch.substring(skipAmount)
  }

  return stitched
}

/**
 * Check if markdown cleanup would be beneficial.
 *
 * Returns true if the markdown likely contains artifacts that would benefit
 * from AI cleanup based on heuristic analysis.
 *
 * @param markdown - Markdown to analyze
 * @returns Whether cleanup is recommended
 *
 * @example
 * ```typescript
 * if (shouldCleanMarkdown(extracted)) {
 *   cleaned = await cleanMarkdownWithAI(ai, extracted)
 * }
 * ```
 */
export function shouldCleanMarkdown(markdown: string): boolean {
  // Check for common artifacts that indicate cleanup would help

  // 1. Excessive line breaks (more than 3 consecutive blank lines)
  if (/\n{4,}/.test(markdown)) {
    return true
  }

  // 2. Standalone numbers that might be page numbers
  if (/\n\n\d{1,4}\n\n/.test(markdown)) {
    return true
  }

  // 3. PDF metadata or CSS artifacts
  if (/@page\s*\{|margin.*:\s*\d+pt|\.pt\s*;/.test(markdown)) {
    return true
  }

  // 4. Garbled all-caps text (likely OCR errors or running headers)
  if (/\*\*[A-Z]{20,}\*\*|^[A-Z]{20,}$/m.test(markdown)) {
    return true
  }

  // 5. Many short lines (might be improper line wrapping)
  const lines = markdown.split('\n')
  const shortLines = lines.filter(l => l.length > 0 && l.length < 40).length
  const shortLineRatio = shortLines / lines.length

  if (shortLineRatio > 0.3) {
    return true
  }

  // If none of these patterns match, cleanup probably not needed
  return false
}
