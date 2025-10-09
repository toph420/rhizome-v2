/**
 * PDF Batch Processing Utilities
 *
 * Utilities for processing large PDFs in batches with overlap handling.
 * Supports 500+ page documents through intelligent batching strategy.
 */

import { GoogleGenAI, type GenAIFile } from '@google/genai'
import { GeminiFileCache } from './gemini-cache.js'
import { stitchMarkdownBatches } from './fuzzy-matching.js'
import { GEMINI_MODEL, MAX_OUTPUT_TOKENS } from './model-config.js'
import { generateBatchedPdfExtractionPrompt } from './prompts/pdf-extraction.js'
import { cleanPageArtifacts } from './text-cleanup.js'

/**
 * Configuration for batched PDF extraction.
 */
export interface BatchConfig {
  /** Number of pages per batch (default: 100) */
  pagesPerBatch: number
  /** Number of overlapping pages between batches (default: 10) */
  overlapPages: number
  /** Gemini model to use */
  model: string
  /** Maximum output tokens per batch */
  maxOutputTokens: number
}

/**
 * Result from a single batch extraction.
 */
export interface ExtractionBatch {
  /** Batch number (1-indexed) */
  batchNumber: number
  /** Starting page (1-indexed) */
  startPage: number
  /** Ending page (inclusive, 1-indexed) */
  endPage: number
  /** Extracted markdown content */
  markdown: string
  /** Whether batch was successful */
  success: boolean
  /** Error if batch failed */
  error?: Error
  /** Extraction time in milliseconds */
  extractionTime: number
}

/**
 * Result from complete batched extraction.
 */
export interface BatchedExtractionResult {
  /** All extraction batches */
  batches: ExtractionBatch[]
  /** Stitched markdown from all batches */
  markdown: string
  /** Total number of pages processed */
  totalPages: number
  /** Total extraction time in milliseconds */
  totalTime: number
  /** Number of successful batches */
  successCount: number
  /** Number of failed batches */
  failedCount: number
}

/**
 * Default batch configuration for large PDFs.
 * Optimized for maximum reliability: 25 pages/batch with 3-page overlap.
 * Small batches = shorter API calls = lower timeout/network error risk.
 * Cost impact: ~$0.02 per 500-page book (negligible).
 */
export const DEFAULT_BATCH_CONFIG: BatchConfig = {
  pagesPerBatch: 25,
  overlapPages: 3,
  model: GEMINI_MODEL,
  maxOutputTokens: MAX_OUTPUT_TOKENS
}


/**
 * Count total pages in a PDF using Gemini Files API.
 *
 * @param ai - Google AI client
 * @param fileUri - URI of uploaded PDF file
 * @returns Total number of pages
 * @throws Error if page counting fails
 */
export async function countPdfPages(
  ai: GoogleGenAI,
  fileUri: string
): Promise<number> {
  try {
    // Use a simple prompt to get page count without extracting content
    const result = await ai.models.generateContent({
      model: DEFAULT_BATCH_CONFIG.model,
      contents: [{
        parts: [
          { fileData: { fileUri, mimeType: 'application/pdf' } },
          { text: 'How many pages are in this PDF document? Respond with just the number, nothing else.' }
        ]
      }],
      config: {
        maxOutputTokens: 10,
        temperature: 0
      }
    })

    const pageCountText = result.text?.trim() || '0'
    const pageCount = parseInt(pageCountText, 10)

    if (isNaN(pageCount) || pageCount <= 0) {
      throw new Error(`Invalid page count response: "${pageCountText}"`)
    }

    return pageCount
  } catch (error: any) {
    console.error('[PDFBatch] Failed to count pages:', error.message)
    throw new Error(`Failed to count PDF pages: ${error.message}`)
  }
}

/**
 * Calculate batch ranges for a PDF with given page count.
 *
 * @param totalPages - Total number of pages in PDF
 * @param config - Batch configuration
 * @returns Array of [startPage, endPage] tuples (1-indexed, inclusive)
 *
 * @example
 * calculateBatchRanges(250, { pagesPerBatch: 100, overlapPages: 10 })
 * // Returns: [[1, 100], [91, 190], [181, 250]]
 */
export function calculateBatchRanges(
  totalPages: number,
  config: Partial<BatchConfig> = {}
): Array<[number, number]> {
  const { pagesPerBatch, overlapPages } = { ...DEFAULT_BATCH_CONFIG, ...config }

  if (totalPages <= pagesPerBatch) {
    // Single batch - no need for batching
    return [[1, totalPages]]
  }

  const batches: Array<[number, number]> = []
  let currentPage = 1

  while (currentPage <= totalPages) {
    const startPage = currentPage
    const endPage = Math.min(currentPage + pagesPerBatch - 1, totalPages)

    batches.push([startPage, endPage])

    // Move to next batch with overlap
    // For next batch, start at (endPage - overlapPages + 1)
    currentPage = endPage - overlapPages + 1

    // If we're very close to the end, include remaining pages in current batch
    if (endPage === totalPages) {
      break
    }

    // Prevent infinite loop if overlap is too large
    if (currentPage <= startPage) {
      console.warn(
        `[PDFBatch] Overlap (${overlapPages}) >= batch size (${pagesPerBatch}), ` +
        `reducing overlap to ${Math.floor(pagesPerBatch / 2)}`
      )
      currentPage = startPage + Math.floor(pagesPerBatch / 2)
    }
  }

  return batches
}

/**
 * Helper to check if error is transient (should retry).
 * Uses same logic as worker/lib/errors.ts for consistency.
 */
function isTransientError(error: Error): boolean {
  const message = error.message.toLowerCase()
  return message.includes('fetch failed') ||
         message.includes('network') ||
         message.includes('timeout') ||
         message.includes('econnrefused') ||
         message.includes('econnreset') ||
         message.includes('500') ||
         message.includes('503') ||
         message.includes('unavailable') ||
         message.includes('429')
}

/**
 * Extract a single batch of pages from a PDF with retry logic.
 *
 * @param ai - Google AI client
 * @param fileUri - URI of uploaded PDF file
 * @param startPage - Starting page (1-indexed)
 * @param endPage - Ending page (inclusive, 1-indexed)
 * @param batchNumber - Batch number for logging
 * @param config - Batch configuration
 * @returns Extraction batch result
 */
export async function extractBatch(
  ai: GoogleGenAI,
  fileUri: string,
  startPage: number,
  endPage: number,
  batchNumber: number,
  config: Partial<BatchConfig> = {}
): Promise<ExtractionBatch> {
  const { model, maxOutputTokens } = { ...DEFAULT_BATCH_CONFIG, ...config }
  const maxRetries = 3
  const startTime = Date.now()

  // Retry loop with exponential backoff
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const attemptLog = attempt > 0 ? ` (attempt ${attempt + 1}/${maxRetries + 1})` : ''
      console.log(
        `[PDFBatch] Extracting batch ${batchNumber}: ` +
        `pages ${startPage}-${endPage}${attemptLog}`
      )

      const result = await ai.models.generateContent({
        model,
        contents: [{
          parts: [
            { fileData: { fileUri, mimeType: 'application/pdf' } },
            { text: generateBatchedPdfExtractionPrompt(startPage, endPage) }
          ]
        }],
        config: {
          maxOutputTokens,
          temperature: 0.1
        }
      })

      let markdown = result.text?.trim() || ''

      // Clean up markdown (remove code block wrappers if present)
      if (markdown.startsWith('```markdown')) {
        markdown = markdown.replace(/^```markdown\s*\n?/, '').replace(/\n?```\s*$/, '')
      } else if (markdown.startsWith('```')) {
        markdown = markdown.replace(/^```\s*\n?/, '').replace(/\n?```\s*$/, '')
      }

      if (!markdown || markdown.length < 20) {
        throw new Error(`Insufficient content extracted (${markdown.length} chars)`)
      }

      // Apply post-processing cleanup to remove page artifacts Gemini might have missed
      markdown = cleanPageArtifacts(markdown)

      const extractionTime = Date.now() - startTime

      console.log(
        `[PDFBatch] Batch ${batchNumber} complete: ` +
        `${markdown.length} chars in ${(extractionTime / 1000).toFixed(1)}s`
      )

      return {
        batchNumber,
        startPage,
        endPage,
        markdown,
        success: true,
        extractionTime
      }
    } catch (error: any) {
      // Check if we should retry
      if (isTransientError(error) && attempt < maxRetries) {
        const delay = Math.min(2000 * Math.pow(2, attempt), 16000) // 2s, 4s, 8s, max 16s
        console.warn(
          `[PDFBatch] Batch ${batchNumber} failed with transient error: ${error.message}`
        )
        console.log(
          `[PDFBatch] Retrying batch ${batchNumber} in ${delay}ms ` +
          `(attempt ${attempt + 2}/${maxRetries + 1})...`
        )
        await new Promise(resolve => setTimeout(resolve, delay))
        continue
      }

      // Permanent error or max retries reached
      const extractionTime = Date.now() - startTime
      console.error(
        `[PDFBatch] Batch ${batchNumber} failed after ${(extractionTime / 1000).toFixed(1)}s:`,
        error.message
      )

      return {
        batchNumber,
        startPage,
        endPage,
        markdown: '',
        success: false,
        error,
        extractionTime
      }
    }
  }

  // Should never reach here, but satisfy TypeScript
  const extractionTime = Date.now() - startTime
  return {
    batchNumber,
    startPage,
    endPage,
    markdown: '',
    success: false,
    error: new Error('Max retries exceeded'),
    extractionTime
  }
}

/**
 * Extract large PDF in batches with progress tracking.
 *
 * @param ai - Google AI client
 * @param fileBuffer - PDF file as ArrayBuffer
 * @param onProgress - Progress callback (batchNumber, totalBatches, markdown?)
 * @param config - Batch configuration
 * @returns Batched extraction result with stitched markdown
 *
 * @example
 * const result = await extractLargePDF(
 *   ai,
 *   pdfBuffer,
 *   (batch, total) => console.log(`Batch ${batch}/${total}`),
 *   { pagesPerBatch: 100, overlapPages: 10 }
 * )
 */
export async function extractLargePDF(
  ai: GoogleGenAI,
  fileBuffer: ArrayBuffer,
  onProgress?: (batchNumber: number, totalBatches: number, markdown?: string) => void | Promise<void>,
  config: Partial<BatchConfig> = {}
): Promise<BatchedExtractionResult> {
  const startTime = Date.now()
  const cache = GeminiFileCache.getInstance()

  // Step 1: Upload PDF to Gemini (with caching)
  console.log('[PDFBatch] Uploading PDF to Gemini...')
  const fileUri = await cache.getOrUpload(
    fileBuffer,
    async (buffer) => {
      const pdfBlob = new Blob([buffer], { type: 'application/pdf' })
      return await ai.files.upload({
        file: pdfBlob,
        config: { mimeType: 'application/pdf' }
      })
    }
  )

  // Step 2: Count pages
  console.log('[PDFBatch] Counting pages...')
  const totalPages = await countPdfPages(ai, fileUri)
  console.log(`[PDFBatch] PDF has ${totalPages} pages`)

  // Step 3: Calculate batch ranges
  const ranges = calculateBatchRanges(totalPages, config)
  const totalBatches = ranges.length

  console.log(
    `[PDFBatch] Processing ${totalPages} pages in ${totalBatches} batches ` +
    `(${config.pagesPerBatch || DEFAULT_BATCH_CONFIG.pagesPerBatch} pages/batch, ` +
    `${config.overlapPages || DEFAULT_BATCH_CONFIG.overlapPages} page overlap)`
  )

  // Step 4: Extract each batch
  const batches: ExtractionBatch[] = []

  for (let i = 0; i < ranges.length; i++) {
    const [startPage, endPage] = ranges[i]
    const batchNumber = i + 1

    const batch = await extractBatch(
      ai,
      fileUri,
      startPage,
      endPage,
      batchNumber,
      config
    )

    batches.push(batch)

    // Report progress
    if (onProgress) {
      await onProgress(batchNumber, totalBatches, batch.markdown)
    }

    // Continue processing even if a batch fails
    // We'll handle partial results in the stitching phase
  }

  // Step 5: Stitch batches together using fuzzy matching
  const successfulBatches = batches.filter(b => b.success)
  const markdownArray = successfulBatches.map(b => b.markdown)

  console.log(`[PDFBatch] Stitching ${markdownArray.length} batches with overlap detection...`)
  const markdown = stitchMarkdownBatches(markdownArray)

  const totalTime = Date.now() - startTime
  const successCount = batches.filter(b => b.success).length
  const failedCount = batches.filter(b => !b.success).length

  console.log(
    `[PDFBatch] Extraction complete: ` +
    `${successCount}/${totalBatches} batches successful in ${(totalTime / 1000).toFixed(1)}s`
  )

  if (failedCount > 0) {
    console.warn(
      `[PDFBatch] ${failedCount} batches failed. ` +
      `Result may have gaps in content.`
    )
  }

  return {
    batches,
    markdown,
    totalPages,
    totalTime,
    successCount,
    failedCount
  }
}
