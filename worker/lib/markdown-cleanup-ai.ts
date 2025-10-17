/**
 * AI-Powered Markdown Cleanup
 *
 * Second-pass cleanup using Gemini to polish extracted markdown.
 * Focuses on removing artifacts and fixing formatting without changing content.
 *
 * Strategies:
 * - EPUBs: Per-chapter cleanup with deterministic joining (NO overlap, NO stitching)
 * - PDFs: Single-pass (<100K) or paragraph-aware chunking (>100K, ~40K chars/chunk)
 *
 * Cost: ~$0.02-0.06 per document (optimized character-based chunking)
 *   - Small PDFs (<100K chars): Single pass = 1 AI call (~$0.002)
 *   - Large PDFs (500K chars): ~12-15 chunks = 12-15 AI calls (~$0.03)
 *   - EPUBs: Per-chapter (varies by book structure)
 *
 * Speed: ~10-60 seconds depending on document size
 */

import type { GoogleGenAI } from '@google/genai'
import { generateMarkdownCleanupPrompt } from './prompts/markdown-cleanup.js'
import { GEMINI_MODEL, MAX_OUTPUT_TOKENS } from './model-config.js'

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

  /**
   * Checkpoint callback - called after each chapter is cleaned
   * Used for pause/resume support in EPUB processing
   */
  onCheckpoint?: (chapterIndex: number, completedChapters: string[]) => Promise<void>

  /**
   * Resume from specific chapter index (for interrupted processing)
   * @default 0
   */
  startFromChapter?: number

  /**
   * Pre-completed chapters (from previous checkpoint)
   */
  completedChapters?: string[]
}

/**
 * Clean markdown in a single AI call.
 * Internal helper used by cleanEpubChaptersWithAI() and cleanPdfMarkdown().
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
    console.warn('[markdown-cleanup-ai] Falling back to regex-cleaned markdown')

    // Return original markdown (already regex-cleaned) instead of throwing
    return markdown
  }
}

/**
 * Clean EPUB chapters with AI (per-chapter, no batching).
 *
 * Designed specifically for EPUBs which have natural chapter boundaries.
 * Each chapter is cleaned independently and then joined deterministically.
 *
 * Why per-chapter instead of batched:
 * - Chapters are natural semantic boundaries
 * - Each chapter < 65K output tokens (no batching needed)
 * - Deterministic joining with \n\n---\n\n (no stitching complexity)
 * - No content drift from overlap reconciliation
 *
 * @param ai - GoogleGenAI client instance
 * @param chapters - Array of chapter objects with title and markdown
 * @param config - Optional configuration
 * @returns Cleaned markdown with chapters joined by ---
 * @throws Error if AI cleanup fails
 *
 * @example
 * ```typescript
 * const cleaned = await cleanEpubChaptersWithAI(ai, chapters, {
 *   enableProgress: true,
 *   onProgress: (chapter, total) => console.log(`Chapter ${chapter}/${total}`)
 * })
 * ```
 */
export async function cleanEpubChaptersWithAI(
  ai: GoogleGenAI,
  chapters: Array<{ title: string; markdown: string }>,
  config: MarkdownCleanupConfig = {}
): Promise<string> {
  if (!chapters || chapters.length === 0) {
    throw new Error('Cannot clean empty chapters array')
  }

  const {
    enableProgress = false,
    modelName = GEMINI_MODEL,
    maxOutputTokens = MAX_OUTPUT_TOKENS,
    temperature = 0.1,
    onProgress,
    onCheckpoint,
    startFromChapter = 0,
    completedChapters: initialCompleted = []
  } = config

  if (enableProgress) {
    if (startFromChapter > 0) {
      console.log(`[markdown-cleanup-ai] Resuming from chapter ${startFromChapter + 1}/${chapters.length}`)
      console.log(`[markdown-cleanup-ai] ${initialCompleted.length} chapters already completed`)
    } else {
      console.log(`[markdown-cleanup-ai] Cleaning ${chapters.length} chapters individually`)
    }
  }

  const startTime = Date.now()
  const cleanedChapters: string[] = [...initialCompleted]

  // Clean each chapter independently (no batching, no overlap)
  // Start from startFromChapter index (for resumption)
  for (let i = startFromChapter; i < chapters.length; i++) {
    const chapter = chapters[i]

    if (onProgress) {
      await onProgress(i + 1, chapters.length)
    }

    // Skip AI cleanup for tiny/empty chapters (< 500 chars = front matter, cover, TOC)
    if (chapter.markdown.length < 500) {
      if (enableProgress) {
        console.log(
          `[markdown-cleanup-ai] Skipping chapter ${i + 1}/${chapters.length}: ` +
          `"${chapter.title}" (${chapter.markdown.length} chars - too small for AI cleanup)`
        )
      }
      // Keep the chapter content as-is (epub-cleaner already handled it)
      cleanedChapters.push(chapter.markdown)
      continue
    }

    if (enableProgress) {
      const chapterKB = Math.round(chapter.markdown.length / 1024)
      console.log(
        `[markdown-cleanup-ai] Cleaning chapter ${i + 1}/${chapters.length}: ` +
        `"${chapter.title}" (${chapterKB}KB)`
      )
    }

    // Prepend chapter title as heading (if not already present and not a filename)
    const startsWithHeading = /^#+\s/.test(chapter.markdown.trim())
    const isFilename = /^[A-Z0-9]+EPUB-\d+$|^chapter\d+$|^\d+$/i.test(chapter.title)

    const chapterText = (startsWithHeading || isFilename)
      ? chapter.markdown
      : `# ${chapter.title}\n\n${chapter.markdown}`

    try {
      const result = await ai.models.generateContent({
        model: modelName,
        contents: [{
          parts: [
            { text: generateMarkdownCleanupPrompt() },
            { text: `\n\nHere is the markdown to clean:\n\n${chapterText}` }
          ]
        }],
        config: {
          maxOutputTokens,
          temperature
        }
      })

      if (!result || !result.text) {
        throw new Error(`Chapter ${i + 1} returned empty response`)
      }

      let cleaned = result.text.trim()

      // Remove markdown code block wrappers if AI added them
      if (cleaned.startsWith('```markdown')) {
        cleaned = cleaned.replace(/^```markdown\s*\n?/, '').replace(/\n?```\s*$/, '')
      } else if (cleaned.startsWith('```')) {
        cleaned = cleaned.replace(/^```\s*\n?/, '').replace(/\n?```\s*$/, '')
      }

      cleanedChapters.push(cleaned)
    } catch (error: any) {
      console.error(
        `[markdown-cleanup-ai] ❌ Chapter ${i + 1} cleanup failed: ${error.message}`
      )
      console.warn(`[markdown-cleanup-ai] Using regex-cleaned version for chapter ${i + 1}`)

      // Use regex-cleaned chapter instead of throwing
      cleanedChapters.push(chapterText)
    }

    // Checkpoint after each chapter (for pause/resume support)
    if (onCheckpoint) {
      try {
        await onCheckpoint(i, [...cleanedChapters])
        if (enableProgress) {
          console.log(`[markdown-cleanup-ai] ✓ Checkpoint saved after chapter ${i + 1}/${chapters.length}`)
        }
      } catch (checkpointError: any) {
        console.warn(`[markdown-cleanup-ai] Checkpoint save failed (non-fatal): ${checkpointError.message}`)
        // Continue processing even if checkpoint fails
      }
    }
  }

  // Join with deterministic separator (no stitching logic needed)
  const joined = cleanedChapters.join('\n\n---\n\n')

  const elapsedMs = Date.now() - startTime
  const joinedKB = Math.round(joined.length / 1024)

  if (enableProgress) {
    console.log(
      `[markdown-cleanup-ai] ✅ Per-chapter cleanup complete in ${Math.round(elapsedMs / 1000)}s ` +
      `(${chapters.length} chapters, ${joinedKB}KB total)`
    )
  }

  return joined
}

/**
 * Clean PDF markdown with AI.
 *
 * Strategy:
 * - Small documents (<100K chars): Single-pass cleanup
 * - Large documents (>100K chars): Split by character count (~40K/chunk) at paragraph boundaries
 *
 * Why character-based chunking:
 * - Predictable chunk sizes = predictable cost (~12-15 chunks for 500-page book)
 * - Paragraph-aware splitting prevents mid-sentence breaks
 * - Cost optimization: $0.03 vs $0.59 for heading-based approach
 * - NO overlap, NO stitching - just clean and join with \n\n
 *
 * @param ai - GoogleGenAI client instance
 * @param markdown - PDF markdown to clean
 * @param config - Optional configuration with onProgress callback
 * @returns Cleaned markdown string
 * @throws Error if AI cleanup fails
 *
 * @example
 * ```typescript
 * const cleaned = await cleanPdfMarkdown(ai, pdfMarkdown, {
 *   onProgress: (chunk, total) => console.log(`Chunk ${chunk}/${total}`)
 * })
 * ```
 */
/**
 * Split markdown into chunks by character count with paragraph awareness.
 * Ensures chunks don't exceed target size and don't split in the middle of paragraphs.
 *
 * @param markdown - Full markdown text
 * @param targetCharsPerChunk - Target characters per chunk (default 40000 = ~10K tokens)
 * @returns Array of markdown chunks
 */
function splitMarkdownByParagraphs(
  markdown: string,
  targetCharsPerChunk: number = 40000
): string[] {
  const chunks: string[] = []
  const paragraphs = markdown.split(/\n\n+/)  // Split on blank lines (paragraph boundaries)

  let currentChunk = ''

  for (let i = 0; i < paragraphs.length; i++) {
    const paragraph = paragraphs[i]
    const potentialLength = currentChunk.length + paragraph.length + 2  // +2 for \n\n

    // If adding this paragraph would exceed target, save current chunk and start new one
    if (currentChunk && potentialLength > targetCharsPerChunk) {
      chunks.push(currentChunk.trim())
      currentChunk = paragraph
    } else {
      // Add paragraph to current chunk
      if (currentChunk) {
        currentChunk += '\n\n' + paragraph
      } else {
        currentChunk = paragraph
      }
    }
  }

  // Don't forget last chunk
  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim())
  }

  return chunks
}

export async function cleanPdfMarkdown(
  ai: GoogleGenAI,
  markdown: string,
  config: { onProgress?: (section: number, total: number) => void | Promise<void> } = {}
): Promise<string> {
  // Small documents: single-pass cleanup
  if (markdown.length < 100000) {
    console.log('[markdown-cleanup-ai] Small PDF (<100K chars), using single-pass cleanup')

    // Call progress callback for single-pass mode (section 1 of 1)
    if (config.onProgress) {
      await config.onProgress(1, 1)
    }

    return await cleanMarkdownSinglePass(ai, markdown, {
      enableProgress: true,
      modelName: GEMINI_MODEL,
      maxOutputTokens: MAX_OUTPUT_TOKENS,
      temperature: 0.1
    })
  }

  // Large documents: split by character count with paragraph awareness
  console.log('[markdown-cleanup-ai] Large PDF (>100K chars), splitting by paragraphs')

  const TARGET_CHARS = 40000  // ~10K tokens input, well within Gemini's 65K output limit
  const chunks = splitMarkdownByParagraphs(markdown, TARGET_CHARS)

  console.log(
    `[markdown-cleanup-ai] Split into ${chunks.length} chunks ` +
    `(target: ${TARGET_CHARS} chars/chunk, avg: ${Math.round(markdown.length / chunks.length)} chars/chunk)`
  )

  const cleanedChunks: string[] = []

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i]

    if (config.onProgress) {
      await config.onProgress(i + 1, chunks.length)
    }

    console.log(
      `[markdown-cleanup-ai] Cleaning chunk ${i + 1}/${chunks.length} ` +
      `(${Math.round(chunk.length / 1024)}KB)`
    )

    try {
      const result = await ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: [{
          parts: [
            { text: generateMarkdownCleanupPrompt() },
            { text: `\n\nHere is the markdown to clean:\n\n${chunk}` }
          ]
        }],
        config: {
          maxOutputTokens: MAX_OUTPUT_TOKENS,
          temperature: 0.1
        }
      })

      if (!result || !result.text) {
        throw new Error(`Chunk ${i + 1} returned empty response`)
      }

      let cleaned = result.text.trim()

      // Remove markdown code block wrappers if AI added them
      if (cleaned.startsWith('```markdown')) {
        cleaned = cleaned.replace(/^```markdown\s*\n?/, '').replace(/\n?```\s*$/, '')
      } else if (cleaned.startsWith('```')) {
        cleaned = cleaned.replace(/^```\s*\n?/, '').replace(/\n?```\s*$/, '')
      }

      cleanedChunks.push(cleaned)
    } catch (error: any) {
      console.error(
        `[markdown-cleanup-ai] ❌ Chunk ${i + 1} cleanup failed: ${error.message}`
      )
      console.warn(`[markdown-cleanup-ai] Using regex-cleaned version for chunk ${i + 1}`)

      // Use regex-cleaned chunk instead of throwing
      cleanedChunks.push(chunk)
    }
  }

  // Join chunks with paragraph separator for smooth transitions
  const joined = cleanedChunks.join('\n\n')

  console.log(
    `[markdown-cleanup-ai] ✅ PDF cleanup complete: ` +
    `${chunks.length} chunks → ${Math.round(joined.length / 1024)}KB`
  )

  return joined
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
 *   cleaned = await cleanPdfMarkdown(ai, extracted)
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
