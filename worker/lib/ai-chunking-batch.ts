/**
 * AI-powered semantic chunking and metadata extraction for large documents.
 * V2: AI identifies chunk boundaries AND extracts metadata in one pass.
 *
 * Key changes:
 * - Simple windowed batches (100K chars, 2K overlap)
 * - AI identifies semantic chunk boundaries
 * - Returns chunks with absolute offsets for reader tracking
 * - Deduplicates overlapping chunks from batch boundaries
 */

import { createGeminiClient } from './ai-client'
import type { GoogleGenAI } from '@google/genai'
import { Type } from '@google/genai'
import type {
  AIChunkMetadata,
  MetadataExtractionBatch,
  MetadataExtractionResult,
  BatchMetadataConfig,
  MetadataExtractionProgress,
  ChunkWithOffsets
} from '../types/ai-metadata'
import { GEMINI_MODEL } from './model-config.js'

/**
 * Default configuration values for batch metadata extraction.
 */
const DEFAULT_CONFIG: Required<BatchMetadataConfig> = {
  maxBatchSize: 100000, // 100K chars per batch (gemini-2.5-flash-lite has 65K output tokens)
  modelName: GEMINI_MODEL,
  apiKey: process.env.GOOGLE_AI_API_KEY || '',
  maxRetries: 3,
  enableProgress: true
}

const OVERLAP_SIZE = 2000 // 2K character overlap to prevent chunk splitting

/**
 * Main function for semantic chunking and metadata extraction.
 * AI identifies chunk boundaries and extracts metadata in one pass.
 *
 * @param markdown - Full markdown content to process
 * @param config - Optional configuration overrides
 * @param onProgress - Optional progress callback
 * @returns Array of chunks with content, offsets, and metadata
 */
export async function batchChunkAndExtractMetadata(
  markdown: string,
  config: BatchMetadataConfig = {},
  onProgress?: (progress: MetadataExtractionProgress) => void | Promise<void>
): Promise<Array<{
  content: string
  start_offset: number
  end_offset: number
  chunk_index: number
  metadata: AIChunkMetadata
}>> {
  const startTime = Date.now()
  const finalConfig = { ...DEFAULT_CONFIG, ...config }

  if (!finalConfig.apiKey) {
    throw new Error('Gemini API key is required for AI metadata extraction')
  }

  console.log(`[AI Metadata] Starting semantic chunking for ${markdown.length} characters`)

  // Step 1: Create simple windowed batches
  if (onProgress) {
    await onProgress({
      phase: 'batching',
      batchesProcessed: 0,
      totalBatches: 0,
      chunksIdentified: 0
    })
  }

  const batches = createBatches(markdown, finalConfig.maxBatchSize)
  console.log(`[AI Metadata] Created ${batches.length} batches with ${OVERLAP_SIZE} char overlap`)

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
      finalConfig.maxRetries
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

  const allChunks = combineBatchResults(batchResults, markdown)

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
 * Creates simple windowed batches with overlap.
 * No paragraph splitting - just sliding windows of text.
 */
function createBatches(markdown: string, maxBatchSize: number): MetadataExtractionBatch[] {
  const batches: MetadataExtractionBatch[] = []

  let position = 0
  let batchIndex = 0

  while (position < markdown.length) {
    const endPosition = Math.min(position + maxBatchSize, markdown.length)
    const content = markdown.substring(position, endPosition)

    batches.push({
      batchId: `batch-${batchIndex}`,
      content: content,
      startOffset: position,
      endOffset: endPosition
    })

    // Move to next batch with overlap (unless we're at the end)
    if (endPosition < markdown.length) {
      position = endPosition - OVERLAP_SIZE
    } else {
      break
    }

    batchIndex++
  }

  return batches
}

/**
 * Extracts semantic chunks with metadata for a single batch using Gemini AI.
 */
async function extractBatchMetadata(
  geminiClient: GoogleGenAI,
  batch: MetadataExtractionBatch,
  modelName: string,
  maxRetries: number
): Promise<MetadataExtractionResult> {
  const startTime = Date.now()
  let lastError: Error | null = null

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const result = await callGeminiForMetadata(geminiClient, batch, modelName)

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
        const delay = Math.pow(2, attempt) * 1000
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
 * Calls Gemini AI to identify semantic chunks and extract metadata.
 */
async function callGeminiForMetadata(
  geminiClient: GoogleGenAI,
  batch: MetadataExtractionBatch,
  modelName: string
): Promise<ChunkWithOffsets[]> {
  const prompt = generateSemanticChunkingPrompt(batch)

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

  return parseMetadataResponse(text, batch)
}

/**
 * Generates the semantic chunking prompt.
 * AI identifies boundaries AND extracts metadata.
 */
function generateSemanticChunkingPrompt(batch: MetadataExtractionBatch): string {
  return `Analyze the DOCUMENT TEXT below and identify semantic chunks.

A semantic chunk is a COMPLETE UNIT OF THOUGHT with these HARD CONSTRAINTS:
- MINIMUM: 200 words
- TARGET: 300-500 words
- MAXIMUM: 3000 characters (~600 words)
- NEVER create chunks larger than 3000 characters (this is a technical constraint)

Semantic chunking rules:
- May span multiple paragraphs if they form one coherent idea
- May split a long paragraph if it covers multiple distinct ideas
- Should feel like a natural "node" in a knowledge graph
- If semantic completeness would exceed 3000 chars, split into multiple chunks at natural boundaries

MARKDOWN STRUCTURE GUIDANCE:
- Code blocks: Keep with surrounding context (don't isolate)
- Lists: Keep intact unless they span very different topics
- Tables: Usually keep as single chunks unless very large
- Headings: Good natural boundaries, but not always required
- Prioritize semantic completeness WITHIN the 3000 character limit

For each chunk you identify, extract:

1. **content**: The exact text from the DOCUMENT TEXT section below (verbatim, character-for-character copy)
2. **start_offset**: Character position where chunk starts (relative to DOCUMENT TEXT below, starting at 0)
3. **end_offset**: Character position where chunk ends (relative to DOCUMENT TEXT below)
4. **themes**: 2-5 key themes/topics (e.g., ["authentication", "security"])
5. **concepts**: 3-5 specific concepts with importance scores (keep concise)
   - Format: [{"text": "JWT tokens", "importance": 0.8}]
   - Importance: 0.0-1.0 representing how central each concept is
6. **importance**: 0.0-1.0 score for significance
7. **summary**: Brief one-sentence summary (max 100 chars)
8. **domain**: Domain classification (technical, narrative, academic, business, etc.)
9. **emotional**: Emotional metadata for contradiction detection
   - **polarity**: -1.0 (very negative) to +1.0 (very positive)
   - **primaryEmotion**: joy, fear, anger, sadness, surprise, neutral, etc.
   - **intensity**: 0.0-1.0 (how strongly the emotion is expressed)

CRITICAL REQUIREMENTS:
- Identify chunk boundaries based on semantic completeness, not paragraph breaks
- ENFORCE the 3000 character maximum limit - this is NOT optional
- Target 300-500 words per chunk, NEVER exceed 3000 characters
- Return chunks in sequential order
- start_offset and end_offset must be accurate character positions
- content must be ONLY text from DOCUMENT TEXT section below - DO NOT include instructions or examples
- Emotional polarity is CRITICAL for detecting contradictions
- IMPORTANT: Properly escape all JSON strings (quotes, newlines, backslashes)
- IMPORTANT: Ensure all JSON is well-formed and complete
- IMPORTANT: If a semantic unit would exceed 3000 chars, split it into multiple chunks

Return JSON in this exact format:
{
  "chunks": [
    {
      "content": "Exact text copied from DOCUMENT TEXT...",
      "start_offset": 0,
      "end_offset": 1847,
      "themes": ["theme1", "theme2"],
      "concepts": [
        {"text": "specific concept", "importance": 0.9},
        {"text": "another concept", "importance": 0.7}
      ],
      "importance": 0.8,
      "summary": "Brief summary of chunk",
      "domain": "technical",
      "emotional": {
        "polarity": 0.3,
        "primaryEmotion": "neutral",
        "intensity": 0.4
      }
    }
  ]
}

═══════════════════════════════════════════════════════════════════════════
DOCUMENT TEXT (this text starts at character ${batch.startOffset} in the full document):
═══════════════════════════════════════════════════════════════════════════

${batch.content}

═══════════════════════════════════════════════════════════════════════════

Extract semantic chunks from the DOCUMENT TEXT above. Return ONLY valid JSON.`
}

/**
 * Parses and validates AI response with offset conversion.
 */
function parseMetadataResponse(
  responseText: string,
  batch: MetadataExtractionBatch
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

  // Validate and convert to absolute offsets
  const MAX_CHUNK_SIZE = 30000 // 30KB conservative limit (36KB API limit - 6KB safety buffer)
  const IDEAL_SPLIT_SIZE = 2500 // Target size for split chunks

  const validated = parsed.chunks.flatMap((chunk: any, index: number): ChunkWithOffsets[] => {
    // Validate required fields
    if (!chunk.content || typeof chunk.content !== 'string') {
      throw new Error(`Chunk ${index}: Missing or invalid content`)
    }

    if (typeof chunk.start_offset !== 'number' || typeof chunk.end_offset !== 'number') {
      throw new Error(`Chunk ${index}: Missing or invalid offsets`)
    }

    // Convert relative offsets to absolute offsets
    const absoluteStart = batch.startOffset + chunk.start_offset
    const absoluteEnd = batch.startOffset + chunk.end_offset

    // Validate offset logic
    if (absoluteStart >= absoluteEnd) {
      console.warn(`[AI Metadata] Chunk ${index}: Invalid offsets (${absoluteStart} >= ${absoluteEnd})`)
    }

    // CRITICAL: Validate chunk size for embedding API limits and auto-split if needed
    if (chunk.content.length > MAX_CHUNK_SIZE) {
      console.warn(
        `[AI Metadata] ⚠️ Chunk ${index} violates size constraint: ${chunk.content.length} chars > ${MAX_CHUNK_SIZE} chars. ` +
        `Auto-splitting into smaller chunks...`
      )

      // Split the oversized chunk into manageable pieces
      const subChunks: ChunkWithOffsets[] = []
      let position = 0

      while (position < chunk.content.length) {
        const end = Math.min(position + IDEAL_SPLIT_SIZE, chunk.content.length)
        const subContent = chunk.content.substring(position, end)

        subChunks.push({
          content: subContent.trim(),
          start_offset: absoluteStart + position,
          end_offset: absoluteStart + end,
          metadata: {
            themes: chunk.themes || ['general'],
            concepts: chunk.concepts || [],
            importance: chunk.importance || 0.5,
            summary: chunk.summary ? `${chunk.summary} (part ${subChunks.length + 1})` : undefined,
            domain: chunk.domain || undefined,
            emotional: chunk.emotional || { polarity: 0, primaryEmotion: 'neutral', intensity: 0 }
          }
        })

        position = end
      }

      console.log(`[AI Metadata] Split oversized chunk into ${subChunks.length} sub-chunks`)
      return subChunks
    }

    // Validate themes
    if (!chunk.themes || !Array.isArray(chunk.themes) || chunk.themes.length === 0) {
      console.warn(`[AI Metadata] Chunk ${index}: Missing themes, defaulting to ['general']`)
      chunk.themes = ['general']
    }

    // Validate concepts
    if (!chunk.concepts || !Array.isArray(chunk.concepts) || chunk.concepts.length === 0) {
      console.warn(`[AI Metadata] Chunk ${index}: Missing concepts, defaulting to empty array`)
      chunk.concepts = []
    } else {
      chunk.concepts = chunk.concepts.map((c: any) => ({
        text: c.text || 'unknown',
        importance: typeof c.importance === 'number'
          ? Math.max(0, Math.min(1, c.importance))
          : 0.5
      }))
    }

    // Validate importance
    if (typeof chunk.importance !== 'number' || chunk.importance < 0 || chunk.importance > 1) {
      console.warn(`[AI Metadata] Chunk ${index}: Invalid importance, defaulting to 0.5`)
      chunk.importance = 0.5
    }

    // Validate emotional metadata
    if (!chunk.emotional || typeof chunk.emotional !== 'object') {
      console.warn(`[AI Metadata] Chunk ${index}: Missing emotional metadata, using defaults`)
      chunk.emotional = { polarity: 0, primaryEmotion: 'neutral', intensity: 0 }
    } else {
      chunk.emotional = {
        polarity: typeof chunk.emotional.polarity === 'number'
          ? Math.max(-1, Math.min(1, chunk.emotional.polarity))
          : 0,
        primaryEmotion: chunk.emotional.primaryEmotion || 'neutral',
        intensity: typeof chunk.emotional.intensity === 'number'
          ? Math.max(0, Math.min(1, chunk.emotional.intensity))
          : 0
      }
    }

    // Return single validated chunk (normal case)
    return [{
      content: chunk.content.trim(),
      start_offset: absoluteStart,
      end_offset: absoluteEnd,
      metadata: {
        themes: chunk.themes,
        concepts: chunk.concepts,
        importance: chunk.importance,
        summary: chunk.summary || undefined,
        domain: chunk.domain || undefined,
        emotional: chunk.emotional
      }
    }]
  })

  return validated
}

/**
 * Deduplicates overlapping chunks from batch boundaries.
 */
function deduplicateOverlappingChunks(
  allChunks: ChunkWithOffsets[]
): Array<ChunkWithOffsets & { chunk_index: number }> {
  if (allChunks.length === 0) return []

  // Sort by start_offset to process in document order
  const sorted = [...allChunks].sort((a, b) => a.start_offset - b.start_offset)

  const deduplicated: Array<ChunkWithOffsets & { chunk_index: number }> = []
  let lastEnd = -1
  let chunkIndex = 0

  for (const chunk of sorted) {
    // Skip if completely contained within the last chunk
    if (chunk.start_offset < lastEnd && chunk.end_offset <= lastEnd) {
      console.log(`[AI Metadata] Skipping duplicate chunk at offset ${chunk.start_offset}`)
      continue
    }

    // Check for significant overlap (>50% of chunk)
    const overlapStart = Math.max(chunk.start_offset, lastEnd)
    const overlapEnd = Math.min(chunk.end_offset, lastEnd)
    const overlapSize = Math.max(0, overlapEnd - overlapStart)
    const chunkSize = chunk.end_offset - chunk.start_offset
    const overlapRatio = overlapSize / chunkSize

    if (overlapRatio > 0.5 && deduplicated.length > 0) {
      const prevChunk = deduplicated[deduplicated.length - 1]

      // Keep the chunk with higher importance
      if (chunk.metadata.importance > prevChunk.metadata.importance) {
        console.log(`[AI Metadata] Replacing overlapping chunk (importance ${prevChunk.metadata.importance} → ${chunk.metadata.importance})`)
        deduplicated[deduplicated.length - 1] = {
          ...chunk,
          chunk_index: chunkIndex - 1
        }
      } else {
        console.log(`[AI Metadata] Keeping previous chunk (higher importance)`)
      }
      continue
    }

    // Add this chunk
    deduplicated.push({
      ...chunk,
      chunk_index: chunkIndex
    })

    lastEnd = chunk.end_offset
    chunkIndex++
  }

  console.log(`[AI Metadata] Deduplicated ${allChunks.length} chunks → ${deduplicated.length} unique chunks`)
  return deduplicated
}

/**
 * Combines batch results into final chunk array.
 */
function combineBatchResults(
  results: MetadataExtractionResult[],
  originalMarkdown: string
): Array<{
  content: string
  start_offset: number
  end_offset: number
  chunk_index: number
  metadata: AIChunkMetadata
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

/**
 * Creates fallback chunks when AI completely fails.
 * Splits batch into ~1500 char chunks locally.
 */
function createFallbackChunksForBatch(batch: MetadataExtractionBatch): ChunkWithOffsets[] {
  const chunks: ChunkWithOffsets[] = []
  const FALLBACK_CHUNK_SIZE = 1500
  let position = 0

  while (position < batch.content.length) {
    const end = Math.min(position + FALLBACK_CHUNK_SIZE, batch.content.length)
    const content = batch.content.substring(position, end)

    chunks.push({
      content: content.trim(),
      start_offset: batch.startOffset + position,
      end_offset: batch.startOffset + end,
      metadata: createFallbackMetadata()
    })

    position = end
  }

  console.log(`[AI Metadata] Created ${chunks.length} fallback chunks for failed batch`)
  return chunks
}

/**
 * Creates minimal fallback metadata.
 */
function createFallbackMetadata(): AIChunkMetadata {
  return {
    themes: ['general'],
    concepts: [],
    importance: 0.5,
    summary: 'Content analysis unavailable',
    domain: 'general',
    emotional: {
      polarity: 0,
      primaryEmotion: 'neutral',
      intensity: 0
    }
  }
}

/**
 * Determines if an error should stop retries.
 */
function shouldStopRetrying(error: Error): boolean {
  const message = error.message.toLowerCase()

  if (message.includes('auth') || message.includes('api key') || message.includes('forbidden')) {
    return true
  }

  if (message.includes('invalid') && message.includes('request')) {
    return true
  }

  return false
}

/**
 * Sleep utility for retry delays.
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
