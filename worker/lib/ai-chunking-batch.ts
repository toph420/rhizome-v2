/**
 * AI-powered semantic chunking and metadata extraction for large documents.
 * V2 REFACTORED: Modular architecture with extracted components.
 *
 * Key changes:
 * - Simple windowed batches (100K chars, 2K overlap)
 * - AI identifies semantic chunk boundaries
 * - Returns chunks with absolute offsets for reader tracking
 * - Deduplicates overlapping chunks from batch boundaries
 *
 * Architecture:
 * - chunking/batch-creator.ts - Windowed batch creation
 * - chunking/prompts.ts - AI prompt templates
 * - chunking/chunk-validator.ts - Validation and fallback logic
 * - chunking/ai-fuzzy-matcher.ts - Offset correction (4 strategies)
 * - chunking/retry-strategies.ts - Retry and batch splitting
 * - chunking/deduplicator.ts - Overlap removal
 * - chunking/errors.ts - Structured errors
 */

import { createGeminiClient } from './ai-client'
import type { GoogleGenAI } from '@google/genai'
import { Type } from '@google/genai'
import type {
  MetadataExtractionBatch,
  MetadataExtractionResult,
  BatchMetadataConfig,
  MetadataExtractionProgress,
  ChunkWithOffsets
} from '../types/chunking'
import { GEMINI_MODEL } from './model-config.js'

// Extracted modules
import { createBatches, OVERLAP_SIZE } from './chunking/batch-creator'
import { generateSemanticChunkingPrompt, type DocumentType } from './chunking/prompts'
import { validateChunks, validateChunkSizes, createFallbackChunksForBatch, splitOversizedChunk } from './chunking/chunk-validator'
import { correctAIChunkOffsets } from './chunking/ai-fuzzy-matcher'
import {
  sleep,
  shouldStopRetrying,
  splitBatch,
  calculateBackoffDelay
} from './chunking/retry-strategies'
import { deduplicateOverlappingChunks } from './chunking/deduplicator'
import { OversizedChunksError, BatchProcessingError } from './chunking/errors'

/**
 * Default configuration values for batch metadata extraction.
 */
const DEFAULT_CONFIG = {
  maxBatchSize: 100000, // 100K chars per batch (gemini-2.5-flash-lite has 65K output tokens)
  modelName: GEMINI_MODEL,
  apiKey: process.env.GOOGLE_AI_API_KEY || '',
  maxRetries: 3,
  enableProgress: true,
  customBatches: undefined as BatchMetadataConfig['customBatches']
}

const MAX_CHUNK_SIZE = 10000 // Hard limit for embeddings and reader performance

/**
 * Main function for semantic chunking and metadata extraction.
 * AI identifies chunk boundaries and extracts metadata in one pass.
 *
 * @param markdown - Full markdown content to process
 * @param config - Optional configuration overrides
 * @param onProgress - Optional progress callback
 * @param documentType - Optional document type for specialized chunking
 * @returns Array of chunks with content, offsets, and metadata
 */
export async function batchChunkAndExtractMetadata(
  markdown: string,
  config: BatchMetadataConfig = {},
  onProgress?: (progress: MetadataExtractionProgress) => void | Promise<void>,
  documentType?: DocumentType
): Promise<Array<{
  content: string
  start_offset: number
  end_offset: number
  chunk_index: number
  metadata: ChunkWithOffsets['metadata']
}>> {
  const startTime = Date.now()
  const finalConfig = { ...DEFAULT_CONFIG, ...config }

  if (!finalConfig.apiKey) {
    throw new Error('Gemini API key is required for AI metadata extraction')
  }

  console.log(`[AI Metadata] Starting semantic chunking for ${markdown.length} characters`)
  if (documentType) {
    console.log(`[AI Metadata] Using type-specific chunking for document type: ${documentType}`)
  }

  // Step 1: Create batches (custom for EPUBs, windowed for others)
  if (onProgress) {
    await onProgress({
      phase: 'batching',
      batchesProcessed: 0,
      totalBatches: 0,
      chunksIdentified: 0
    })
  }

  const batches = finalConfig.customBatches
    ? finalConfig.customBatches.map((batch, i) => ({
        batchId: `custom-${i}`,
        content: batch.content,
        startOffset: batch.startOffset,
        endOffset: batch.endOffset
      }))
    : createBatches(markdown, finalConfig.maxBatchSize)

  console.log(
    `[AI Metadata] Created ${batches.length} batches` +
    (finalConfig.customBatches ? ' (custom EPUB chapters)' : ` with ${OVERLAP_SIZE} char overlap`)
  )

  // Initialize Gemini client
  const geminiClient = createGeminiClient(finalConfig.apiKey)

  // Step 2: Process batches sequentially (AI chunking)
  const batchResults: MetadataExtractionResult[] = []

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i]
    const batchNumber = i + 1

    if (onProgress) {
      await onProgress({
        phase: 'ai_chunking',
        batchesProcessed: i,
        totalBatches: batches.length,
        chunksIdentified: batchResults.reduce((sum, r) => sum + r.chunkMetadata.length, 0),
        currentBatchId: batch.batchId
      })
    }

    console.log(`[AI Metadata] Processing batch ${batchNumber}/${batches.length}`)

    // AI identifies chunk boundaries and extracts metadata
    const result = await extractBatchMetadata(
      geminiClient,
      batch,
      finalConfig.modelName,
      finalConfig.maxRetries,
      markdown,
      documentType
    )

    batchResults.push(result)

    if (result.status === 'failed') {
      console.warn(`[AI Metadata] Batch ${batchNumber} failed, using fallback chunks`)
    } else {
      console.log(`[AI Metadata] Batch ${batchNumber}: AI identified ${result.chunkMetadata.length} chunks in ${result.processingTime}ms`)
    }
  }

  // Step 3: Deduplicate and combine results
  if (onProgress) {
    await onProgress({
      phase: 'deduplication',
      batchesProcessed: batches.length,
      totalBatches: batches.length,
      chunksIdentified: batchResults.reduce((sum, r) => sum + r.chunkMetadata.length, 0)
    })
  }

  const allChunks = combineBatchResults(batchResults)

  const totalTime = Date.now() - startTime
  console.log(`[AI Metadata] Completed: ${allChunks.length} semantic chunks in ${(totalTime / 1000).toFixed(1)}s`)

  if (onProgress) {
    await onProgress({
      phase: 'complete',
      batchesProcessed: batches.length,
      totalBatches: batches.length,
      chunksIdentified: allChunks.length
    })
  }

  return allChunks
}

/**
 * Extracts semantic chunks with metadata for a single batch using Gemini AI.
 * Includes size validation with retry logic.
 */
async function extractBatchMetadata(
  geminiClient: GoogleGenAI,
  batch: MetadataExtractionBatch,
  modelName: string,
  maxRetries: number,
  fullMarkdown: string,
  documentType?: DocumentType
): Promise<MetadataExtractionResult> {
  const startTime = Date.now()
  let lastError: Error | null = null

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const result = await callGeminiForMetadata(geminiClient, batch, modelName, fullMarkdown, documentType)

      // ✅ Validate chunk sizes BEFORE accepting
      const sizeCheck = validateChunkSizes(result, MAX_CHUNK_SIZE)

      if (!sizeCheck.allValid) {
        const maxSize = Math.max(...sizeCheck.oversized.map(c => c.content.length))
        console.warn(
          `[AI Metadata] Attempt ${attempt}/${maxRetries}: ` +
          `${sizeCheck.oversized.length} chunks exceed ${MAX_CHUNK_SIZE} chars (max: ${maxSize}). ` +
          `Retrying with stricter prompt...`
        )

        if (attempt < maxRetries) {
          // Retry with exponential backoff
          const delay = calculateBackoffDelay(attempt)
          console.log(`[AI Metadata] Retrying in ${delay}ms...`)
          await sleep(delay)
          continue
        } else {
          // Last resort: split batch into smaller sections
          console.error(
            `[AI Metadata] AI repeatedly violated size constraints. ` +
            `Splitting batch into smaller sections...`
          )
          return await processSmallerBatches(
            geminiClient,
            batch,
            modelName,
            maxRetries,
            fullMarkdown,
            documentType
          )
        }
      }

      // All chunks valid, proceed
      return {
        batchId: batch.batchId,
        chunkMetadata: result,
        status: 'success',
        processingTime: Date.now() - startTime
      }
    } catch (error: any) {
      lastError = error
      console.warn(`[AI Metadata] Batch ${batch.batchId} attempt ${attempt}/${maxRetries} failed:`, error.message)

      if (shouldStopRetrying(error)) {
        console.warn(`[AI Metadata] Non-retryable error, stopping retries`)
        break
      }

      if (attempt < maxRetries) {
        const delay = calculateBackoffDelay(attempt)
        console.log(`[AI Metadata] Retrying in ${delay}ms...`)
        await sleep(delay)
      }
    }
  }

  // Complete failure - return fallback chunks
  console.error(`[AI Metadata] Batch ${batch.batchId} failed after ${maxRetries} retries:`, lastError)
  return {
    batchId: batch.batchId,
    chunkMetadata: createFallbackChunksForBatch(batch),
    status: 'failed',
    errors: [{ chunkIndex: 0, error: lastError?.message || 'Unknown error' }],
    processingTime: Date.now() - startTime
  }
}

/**
 * Fallback when AI repeatedly violates size constraints.
 * Split the batch at natural boundaries and process separately.
 */
async function processSmallerBatches(
  geminiClient: GoogleGenAI,
  batch: MetadataExtractionBatch,
  modelName: string,
  maxRetries: number,
  fullMarkdown: string,
  documentType?: DocumentType
): Promise<MetadataExtractionResult> {
  const [batch1, batch2] = splitBatch(batch)

  const [result1, result2] = await Promise.all([
    extractBatchMetadata(geminiClient, batch1, modelName, maxRetries, fullMarkdown, documentType),
    extractBatchMetadata(geminiClient, batch2, modelName, maxRetries, fullMarkdown, documentType)
  ])

  return {
    batchId: batch.batchId,
    chunkMetadata: [...result1.chunkMetadata, ...result2.chunkMetadata],
    status: 'success',
    processingTime: result1.processingTime + result2.processingTime
  }
}

/**
 * Calls Gemini AI to identify semantic chunks and extract metadata.
 */
async function callGeminiForMetadata(
  geminiClient: GoogleGenAI,
  batch: MetadataExtractionBatch,
  modelName: string,
  fullMarkdown: string,
  documentType?: DocumentType
): Promise<ChunkWithOffsets[]> {
  const prompt = generateSemanticChunkingPrompt(batch, MAX_CHUNK_SIZE, documentType)

  const result = await geminiClient.models.generateContent({
    model: modelName,
    contents: [{ parts: [{ text: prompt }] }],
    config: {
      responseMimeType: 'application/json',
      maxOutputTokens: 65536, // Gemini 2.5 Flash Lite output limit
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          chunks: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                content: { type: Type.STRING },
                start_offset: { type: Type.NUMBER },
                end_offset: { type: Type.NUMBER },
                themes: { type: Type.ARRAY, items: { type: Type.STRING } },
                concepts: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      text: { type: Type.STRING },
                      importance: { type: Type.NUMBER }
                    },
                    required: ['text', 'importance']
                  }
                },
                importance: { type: Type.NUMBER },
                summary: { type: Type.STRING },
                domain: { type: Type.STRING },
                emotional: {
                  type: Type.OBJECT,
                  properties: {
                    polarity: { type: Type.NUMBER },
                    primaryEmotion: { type: Type.STRING },
                    intensity: { type: Type.NUMBER }
                  },
                  required: ['polarity', 'primaryEmotion', 'intensity']
                }
              },
              required: [
                'content',
                'start_offset',
                'end_offset',
                'themes',
                'concepts',
                'importance',
                'summary',
                'emotional'
              ]
            }
          }
        },
        required: ['chunks']
      }
    } as any
  })

  const text = result.text || ''
  if (!text) {
    throw new Error('Empty response from Gemini API')
  }

  // Log response for debugging (first 500 and last 500 chars)
  console.log(`[AI Metadata] Gemini response length: ${text.length} chars`)
  if (text.length > 1000) {
    console.log(`[AI Metadata] Response preview (first 500 chars):\n${text.substring(0, 500)}`)
    console.log(`[AI Metadata] Response preview (last 500 chars):\n${text.substring(text.length - 500)}`)
  } else {
    console.log(`[AI Metadata] Full response:\n${text}`)
  }

  return parseMetadataResponse(text, batch, fullMarkdown)
}

/**
 * Parses and validates AI response with offset conversion.
 */
function parseMetadataResponse(
  responseText: string,
  batch: MetadataExtractionBatch,
  fullMarkdown: string
): ChunkWithOffsets[] {
  let parsed: any

  try {
    // Try parsing the full response
    parsed = JSON.parse(responseText.trim())
  } catch (parseError: any) {
    // If parsing fails, try to extract valid JSON prefix
    console.warn(`[AI Metadata] Initial JSON parse failed: ${parseError.message}`)
    console.warn(`[AI Metadata] Response length: ${responseText.length} chars`)
    console.warn(`[AI Metadata] Attempting to salvage partial response...`)

    try {
      // Strategy 1: Find last complete chunk (ends with }])
      let lastCompleteChunk = responseText.lastIndexOf('}]')
      if (lastCompleteChunk !== -1) {
        const truncated = responseText.substring(0, lastCompleteChunk + 2) + '}'
        parsed = JSON.parse(truncated)
        console.warn(`[AI Metadata] Successfully salvaged ${parsed.chunks?.length || 0} chunks from partial response`)
      } else {
        // Strategy 2: Find last complete object (ends with })
        lastCompleteChunk = responseText.lastIndexOf('},')
        if (lastCompleteChunk !== -1) {
          // Remove trailing comma and close the array and object
          const truncated = responseText.substring(0, lastCompleteChunk + 1) + ']}'
          parsed = JSON.parse(truncated)
          console.warn(`[AI Metadata] Successfully salvaged ${parsed.chunks?.length || 0} chunks (removed incomplete chunk)`)
        } else {
          throw parseError
        }
      }
    } catch (salvageError) {
      console.error('[AI Metadata] Could not salvage partial response')
      throw new Error(`JSON parsing failed: ${parseError.message}`)
    }
  }

  if (!parsed.chunks || !Array.isArray(parsed.chunks)) {
    throw new Error('Invalid response structure: missing chunks array')
  }

  console.log(`[AI Metadata] Batch ${batch.batchId}: AI identified ${parsed.chunks.length} semantic chunks`)

  // Basic structural validation (size limits, structure)
  const validationResult = validateChunks(parsed.chunks, batch, { maxChunkSize: MAX_CHUNK_SIZE })

  // If we have invalid chunks, throw error
  if (validationResult.invalid.length > 0) {
    const firstError = validationResult.invalid[0]
    throw new Error(`Chunk ${firstError.chunkIndex}: ${firstError.reason}`)
  }

  // Handle oversized chunks by auto-splitting (preserves metadata, avoids retries)
  let chunksToProcess = validationResult.valid

  if (validationResult.oversized.length > 0) {
    console.log(`\n⚠️  Auto-splitting ${validationResult.oversized.length} oversized chunks...`)
    console.log(`   Batch: ${batch.batchId}`)

    const allChunks: ChunkWithOffsets[] = []

    // Process all chunks (valid + oversized)
    for (const result of [...validationResult.valid, ...validationResult.oversized.map(o => o.chunk)]) {
      if (result.content.length <= MAX_CHUNK_SIZE) {
        allChunks.push(result)
      } else {
        // Split oversized chunk at paragraph boundaries
        const subchunks = splitOversizedChunk(result, MAX_CHUNK_SIZE)
        console.log(`   Split ${result.content.length} char chunk → ${subchunks.length} pieces`)
        console.log(`     Themes preserved: ${result.metadata?.themes?.join(', ') || 'none'}`)
        allChunks.push(...subchunks)
      }
    }

    console.log(`✅ Split ${validationResult.oversized.length} chunks → ${allChunks.length} total chunks`)
    chunksToProcess = allChunks
  }

  // All chunks passed structural validation - correct offsets using fuzzy matcher
  console.log(`[AI Metadata] Correcting chunk offsets using fuzzy matching...`)
  const { chunks: corrected, stats } = correctAIChunkOffsets(fullMarkdown, chunksToProcess)

  console.log(`[AI Metadata] Offset correction complete:`)
  console.log(`  ✅ Exact matches: ${stats.exact}/${corrected.length} (${Math.round(stats.exact / corrected.length * 100)}%)`)
  console.log(`  🔍 Fuzzy matches: ${stats.fuzzy}/${corrected.length} (${Math.round(stats.fuzzy / corrected.length * 100)}%)`)
  console.log(`  📍 Approximate: ${stats.approximate}/${corrected.length} (${Math.round(stats.approximate / corrected.length * 100)}%)`)
  console.log(`  ❌ Failed: ${stats.failed}/${corrected.length}`)

  // ✅ POST-CORRECTION VALIDATION: Check if fuzzy matcher successfully corrected offsets
  const normalize = (s: string) => s.trim().replace(/\s+/g, ' ')
  const postCorrectionFailures = corrected.filter(chunk => {
    const actualText = fullMarkdown.slice(chunk.start_offset, chunk.end_offset)
    const normActual = normalize(actualText)
    const normChunk = normalize(chunk.content)

    // If lengths are very different, fuzzy matcher failed
    if (Math.abs(normActual.length - normChunk.length) > normChunk.length * 0.3) {
      return true
    }

    // Basic substring check (first 50 chars should match)
    const preview = normChunk.slice(0, Math.min(50, normChunk.length))
    return !normActual.includes(preview)
  })

  // Reject if fuzzy matcher couldn't fix >20% of chunks
  if (postCorrectionFailures.length > corrected.length * 0.2) {
    console.error(
      `[AI Metadata] CRITICAL: Fuzzy matcher failed to correct ${postCorrectionFailures.length}/${corrected.length} chunks (${Math.round(postCorrectionFailures.length / corrected.length * 100)}%)`
    )
    throw new Error(
      `Offset correction failed for ${postCorrectionFailures.length} chunks - fuzzy matcher couldn't locate content`
    )
  }

  if (postCorrectionFailures.length > 0) {
    console.warn(
      `[AI Metadata] ⚠️  ${postCorrectionFailures.length} chunks still have offset issues after correction`
    )
  } else {
    console.log(`[AI Metadata] ✓ All ${corrected.length} chunks successfully corrected`)
  }

  return corrected
}

/**
 * Combines batch results into final chunk array.
 */
function combineBatchResults(
  results: MetadataExtractionResult[]
): Array<{
  content: string
  start_offset: number
  end_offset: number
  chunk_index: number
  metadata: ChunkWithOffsets['metadata']
}> {
  // Collect all chunks from all batches
  const allChunks: ChunkWithOffsets[] = []

  for (const result of results) {
    if (result.status === 'failed') {
      console.warn(`[AI Metadata] Batch ${result.batchId} failed, using fallback chunks`)
    }

    allChunks.push(...result.chunkMetadata)
  }

  // Deduplicate overlapping chunks (from batch boundaries)
  const deduplicated = deduplicateOverlappingChunks(allChunks)

  console.log(`[AI Metadata] Final: ${deduplicated.length} semantic chunks`)
  return deduplicated
}
