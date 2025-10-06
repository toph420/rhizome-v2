/**
 * AI-Powered Markdown Cleanup
 *
 * Second-pass cleanup using Gemini to polish extracted markdown.
 * Focuses on removing artifacts and fixing formatting without changing content.
 *
 * Strategies:
 * - EPUBs: Per-chapter cleanup with deterministic joining (NO overlap, NO stitching)
 * - PDFs: Single-pass (<100K) or heading-split (>100K) with deterministic joining
 *
 * Cost: ~$0.02-0.60 per document depending on size and type (uses Gemini 2.5 Flash)
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
    throw new Error(`AI markdown cleanup failed: ${error.message}`)
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
    onProgress
  } = config

  if (enableProgress) {
    console.log(`[markdown-cleanup-ai] Cleaning ${chapters.length} chapters individually`)
  }

  const startTime = Date.now()
  const cleanedChapters: string[] = []

  // Clean each chapter independently (no batching, no overlap)
  for (let i = 0; i < chapters.length; i++) {
    const chapter = chapters[i]

    if (onProgress) {
      await onProgress(i + 1, chapters.length)
    }

    if (enableProgress) {
      const chapterKB = Math.round(chapter.markdown.length / 1024)
      console.log(
        `[markdown-cleanup-ai] Cleaning chapter ${i + 1}/${chapters.length}: ` +
        `"${chapter.title}" (${chapterKB}KB)`
      )
    }

    // Prepend chapter title as heading
    const chapterText = `# ${chapter.title}\n\n${chapter.markdown}`

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
      throw new Error(`AI cleanup failed on chapter ${i + 1} ("${chapter.title}"): ${error.message}`)
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
 * - Large documents (>100K chars): Split at ## headings, clean each section, join directly
 *
 * Why this works:
 * - ## headings are structural markers that AI won't modify
 * - Splitting BEFORE headings keeps sections intact
 * - NO overlap, NO stitching - just clean and join
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
 *   onProgress: (section, total) => console.log(`Section ${section}/${total}`)
 * })
 * ```
 */
export async function cleanPdfMarkdown(
  ai: GoogleGenAI,
  markdown: string,
  config: { onProgress?: (section: number, total: number) => void | Promise<void> } = {}
): Promise<string> {
  // Small documents: single-pass cleanup
  if (markdown.length < 100000) {
    console.log('[markdown-cleanup-ai] Small PDF (<100K chars), using single-pass cleanup')

    return await cleanMarkdownSinglePass(ai, markdown, {
      enableProgress: true,
      modelName: GEMINI_MODEL,
      maxOutputTokens: MAX_OUTPUT_TOKENS,
      temperature: 0.1
    })
  }

  // Large documents: split at ## headings
  console.log('[markdown-cleanup-ai] Large PDF (>100K chars), splitting at ## headings')

  const sections = markdown.split(/(?=\n##\s)/)  // Split BEFORE ## headings
  console.log(`[markdown-cleanup-ai] Split into ${sections.length} sections`)

  const cleanedSections: string[] = []

  for (let i = 0; i < sections.length; i++) {
    const section = sections[i]

    if (config.onProgress) {
      await config.onProgress(i + 1, sections.length)
    }

    console.log(
      `[markdown-cleanup-ai] Cleaning section ${i + 1}/${sections.length} ` +
      `(${Math.round(section.length / 1024)}KB)`
    )

    try {
      const result = await ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: [{
          parts: [
            { text: generateMarkdownCleanupPrompt() },
            { text: `\n\nHere is the markdown to clean:\n\n${section}` }
          ]
        }],
        config: {
          maxOutputTokens: MAX_OUTPUT_TOKENS,
          temperature: 0.1
        }
      })

      if (!result || !result.text) {
        throw new Error(`Section ${i + 1} returned empty response`)
      }

      let cleaned = result.text.trim()

      // Remove markdown code block wrappers if AI added them
      if (cleaned.startsWith('```markdown')) {
        cleaned = cleaned.replace(/^```markdown\s*\n?/, '').replace(/\n?```\s*$/, '')
      } else if (cleaned.startsWith('```')) {
        cleaned = cleaned.replace(/^```\s*\n?/, '').replace(/\n?```\s*$/, '')
      }

      cleanedSections.push(cleaned)
    } catch (error: any) {
      console.error(
        `[markdown-cleanup-ai] ❌ Section ${i + 1} cleanup failed: ${error.message}`
      )
      throw new Error(`AI cleanup failed on section ${i + 1}: ${error.message}`)
    }
  }

  // Join sections directly - NO STITCHING
  // We split at headings, so joining with '' is deterministic
  const joined = cleanedSections.join('')

  console.log(
    `[markdown-cleanup-ai] ✅ PDF cleanup complete: ` +
    `${sections.length} sections → ${Math.round(joined.length / 1024)}KB`
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
