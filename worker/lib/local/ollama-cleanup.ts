/**
 * Local Markdown Cleanup with Ollama (Qwen 32B)
 *
 * Replaces Gemini-based cleanup with local LLM processing.
 * Mirrors the batching strategy from markdown-cleanup-ai.ts but uses Ollama.
 *
 * Key Features:
 * - Batching for large documents (split at ## headings)
 * - Multi-pass cleanup (OCR artifacts, formatting, structure)
 * - OOM error handling with regex fallback
 * - Progress reporting for UI feedback
 *
 * Cost: $0.00 (100% local)
 * Speed: 2-3x slower than Gemini, but no API costs
 */

import { OllamaClient, OOMError } from './ollama-client.js'

interface CleanupOptions {
  onProgress?: (stage: string, percent: number) => void
  temperature?: number
  maxBatchSize?: number
}

/**
 * Clean markdown using local Qwen model via Ollama
 * Handles large documents via batching at ## headings
 *
 * Pattern from: worker/lib/markdown-cleanup-ai.ts:205-336
 *
 * @param markdown - Raw markdown text to clean
 * @param options - Cleanup configuration
 * @returns Cleaned markdown
 * @throws OOMError if Qwen runs out of memory (caller should catch and fallback)
 */
export async function cleanMarkdownLocal(
  markdown: string,
  options: CleanupOptions = {}
): Promise<string> {
  const {
    onProgress,
    temperature = 0.3,  // Low temperature for consistent cleanup (not creative task)
    maxBatchSize = 100000  // ~100k chars per batch
  } = options

  const ollama = new OllamaClient()

  // Small documents: Single pass
  if (markdown.length < maxBatchSize) {
    console.log('[ollama-cleanup] Small document (<100K), using single-pass cleanup')
    onProgress?.('cleanup_ai', 10)

    try {
      const cleaned = await cleanSection(ollama, markdown, temperature)
      onProgress?.('cleanup_ai', 100)
      return cleaned
    } catch (error) {
      if (error instanceof OOMError) {
        // Propagate OOM for processor to handle with fallback
        throw error
      }
      throw new Error(`Cleanup failed: ${error}`)
    }
  }

  // Large documents: Split at headings and batch
  console.log('[ollama-cleanup] Large document (>100K), splitting at ## headings')
  onProgress?.('cleanup_ai', 5)

  const sections = splitAtHeadings(markdown, maxBatchSize)
  console.log(`[ollama-cleanup] Split into ${sections.length} sections for batching`)

  const cleanedSections: string[] = []
  for (let i = 0; i < sections.length; i++) {
    console.log(
      `[ollama-cleanup] Cleaning section ${i + 1}/${sections.length} ` +
      `(${Math.round(sections[i].length / 1024)}KB)`
    )

    try {
      const cleaned = await cleanSection(ollama, sections[i], temperature)
      cleanedSections.push(cleaned)

      const progress = 5 + Math.floor((i + 1) / sections.length * 95)
      onProgress?.('cleanup_ai', progress)
    } catch (error) {
      if (error instanceof OOMError) {
        console.error(`[ollama-cleanup] OOM on section ${i + 1}/${sections.length}`)
        throw error  // Stop processing, trigger fallback in processor
      }
      throw error
    }
  }

  // Join sections directly - NO STITCHING
  // We split at headings, so joining with '' is deterministic
  const joined = cleanedSections.join('')

  console.log(
    `[ollama-cleanup] ✅ Cleanup complete: ` +
    `${sections.length} sections → ${Math.round(joined.length / 1024)}KB`
  )

  return joined
}

/**
 * Clean a single markdown section with Qwen
 *
 * Uses low temperature for consistent cleanup (not creative task).
 * CRITICAL: Must propagate OOMError for graceful degradation.
 *
 * @param ollama - OllamaClient instance
 * @param text - Section text to clean
 * @param temperature - Sampling temperature (default 0.3)
 * @returns Cleaned text
 * @throws OOMError if model runs out of memory
 */
async function cleanSection(
  ollama: OllamaClient,
  text: string,
  temperature: number
): Promise<string> {
  const prompt = `You are a markdown cleanup assistant. Your ONLY job is to fix formatting errors from PDF extraction.

CRITICAL RULES - READ CAREFULLY:
1. PRESERVE EVERY WORD - Do NOT summarize, condense, or shorten ANY text
2. PRESERVE EVERY SENTENCE - Keep all paragraphs exactly as they are
3. ONLY fix these specific issues:
   - Remove OCR artifacts (misplaced characters like "ﬁ" → "fi")
   - Fix broken words across lines
   - Fix inconsistent spacing (but keep paragraph breaks)
4. PRESERVE ALL headings, lists, and structure EXACTLY as written
5. Output ONLY the cleaned markdown with NO explanations or comments

WRONG: Summarizing "This is a long paragraph about X, Y, and Z" → "Discussion of X, Y, Z"
RIGHT: Keeping "This is a long paragraph about X, Y, and Z" exactly as is (just fix OCR)

If you summarize or omit ANY content, this is a FAILURE.

Markdown to clean:

${text}

Cleaned markdown (with ALL original content preserved):`

  try {
    const response = await ollama.chat(prompt, {
      temperature,
      timeout: 300000  // 5 minutes per section
    })

    let cleaned = response.trim()

    // Remove markdown code block wrappers if AI added them
    // Pattern from: worker/lib/markdown-cleanup-ai.ts:311-315
    if (cleaned.startsWith('```markdown')) {
      cleaned = cleaned.replace(/^```markdown\s*\n?/, '').replace(/\n?```\s*$/, '')
    } else if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```\s*\n?/, '').replace(/\n?```\s*$/, '')
    }

    return cleaned
  } catch (error: any) {
    // Check for OOM specifically
    if (error.message?.includes('out of memory') || error instanceof OOMError) {
      throw new OOMError('Qwen model out of memory during cleanup')
    }
    throw error
  }
}

/**
 * Split markdown at ## headings for batching
 * Ensures batches don't break mid-section
 *
 * Pattern from: worker/lib/markdown-cleanup-ai.ts:225-273
 * - Split BEFORE ## headings
 * - Filter spurious headings (single letters, Roman numerals)
 * - Merge small sections to avoid excessive API calls
 *
 * @param markdown - Full markdown text
 * @param maxSize - Maximum size per section in characters
 * @returns Array of markdown sections
 */
function splitAtHeadings(markdown: string, maxSize: number): string[] {
  // Split BEFORE ## headings (keeps heading with its content)
  const allSections = markdown.split(/(?=\n##\s)/)
  console.log(`[ollama-cleanup] Raw split: ${allSections.length} sections`)

  // Filter out spurious headings (single letters, Roman numerals, etc.)
  const sections: string[] = []
  let currentMerged = ''

  for (let i = 0; i < allSections.length; i++) {
    const section = allSections[i]

    // Extract heading text if present
    const headingMatch = section.match(/^##\s+(.+?)$/m)

    if (!headingMatch) {
      // No heading, merge with current
      currentMerged += section
      continue
    }

    const headingText = headingMatch[1].trim()

    // Check if this is a false positive heading
    const singleLetterOrRoman = /^[IVXLCDM]$|^\d+$/i.test(headingText)
    const tooShort = headingText.length < 3
    const commonIndexTerms = /^(I|II|III|IV|V|VI|VII|VIII|IX|X|A|B|C|D|E|INDEX|NOTES|PAGE|PART|SECTION|CHAPTER)$/i.test(headingText)

    if (singleLetterOrRoman || (tooShort && !headingText.match(/\s/)) || commonIndexTerms) {
      // False positive - merge with current section
      console.log(`[ollama-cleanup] Filtering spurious heading: "${headingText}"`)
      currentMerged += section
      continue
    }

    // Check if current merged section exceeds maxSize
    if (currentMerged.length > maxSize * 0.8) {
      // Save current merged section
      sections.push(currentMerged)
      currentMerged = section
    } else {
      // Continue merging
      currentMerged += section
    }
  }

  // Don't forget last merged section
  if (currentMerged) {
    sections.push(currentMerged)
  }

  console.log(
    `[ollama-cleanup] After filtering: ${sections.length} sections ` +
    `(removed ${allSections.length - sections.length} spurious headings)`
  )

  return sections
}

/**
 * Fallback: Regex-only cleanup (no AI)
 * Used when Qwen OOM occurs or AI cleanup disabled
 *
 * Pattern from: worker/lib/text-cleanup.ts (cleanPageArtifacts)
 *
 * @param markdown - Raw markdown
 * @returns Cleaned markdown (basic regex fixes only)
 */
export function cleanMarkdownRegexOnly(markdown: string): string {
  let cleaned = markdown

  // Remove common OCR artifacts
  cleaned = cleaned.replace(/[""]/g, '"')  // Smart quotes
  cleaned = cleaned.replace(/['']/g, "'")  // Smart apostrophes
  cleaned = cleaned.replace(/–/g, '-')      // En dash
  cleaned = cleaned.replace(/—/g, '--')     // Em dash
  cleaned = cleaned.replace(/…/g, '...')    // Ellipsis

  // Fix spacing issues
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n')        // Max 2 newlines
  cleaned = cleaned.replace(/ {2,}/g, ' ')            // Max 1 space
  cleaned = cleaned.replace(/^[ \t]+|[ \t]+$/gm, '')  // Trim spaces/tabs from lines (NOT newlines!)

  return cleaned
}
