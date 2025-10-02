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
      finalConfig.maxRetries,
      markdown
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
 * Now includes size validation with retry logic.
 */
async function extractBatchMetadata(
  geminiClient: GoogleGenAI,
  batch: MetadataExtractionBatch,
  modelName: string,
  maxRetries: number,
  fullMarkdown: string
): Promise<MetadataExtractionResult> {
  const startTime = Date.now()
  let lastError: Error | null = null
  const MAX_CHUNK_SIZE = 10000 // Hard limit for embeddings and reader performance

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const result = await callGeminiForMetadata(geminiClient, batch, modelName, fullMarkdown)

      // ✅ NEW: Validate chunk sizes BEFORE accepting
      const oversized = result.filter(c => c.content.length > MAX_CHUNK_SIZE)

      if (oversized.length > 0) {
        const maxSize = Math.max(...oversized.map(c => c.content.length))
        console.warn(
          `[AI Metadata] Attempt ${attempt}/${maxRetries}: ` +
          `${oversized.length} chunks exceed ${MAX_CHUNK_SIZE} chars (max: ${maxSize}). ` +
          `Retrying with stricter prompt...`
        )

        if (attempt < maxRetries) {
          // Retry with more aggressive size constraint
          const delay = Math.pow(2, attempt) * 1000
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
            fullMarkdown
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
 * Finds a natural boundary (paragraph, sentence, or fallback) to split content.
 * Avoids mid-sentence splits that corrupt chunk content.
 */
function splitAtNaturalBoundary(content: string): number {
  const half = Math.floor(content.length / 2)

  // Strategy 1: Find paragraph break (double newline)
  let split = content.indexOf('\n\n', half)
  if (split !== -1 && split < content.length * 0.75) {
    return split + 2 // Include the newlines in first batch
  }

  // Strategy 2: Find single newline
  split = content.indexOf('\n', half)
  if (split !== -1 && split < content.length * 0.75) {
    return split + 1
  }

  // Strategy 3: Find sentence boundary (period + space)
  split = content.indexOf('. ', half)
  if (split !== -1 && split < content.length * 0.75) {
    return split + 2 // Include period and space
  }

  // Strategy 4: Find any period
  split = content.indexOf('.', half)
  if (split !== -1 && split < content.length * 0.75) {
    return split + 1
  }

  // Fallback: Split at halfway point (better than nothing)
  return half
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
  fullMarkdown: string
): Promise<MetadataExtractionResult> {
  // Split at natural boundary to avoid mid-sentence corruption
  const splitPoint = splitAtNaturalBoundary(batch.content)

  const batch1 = {
    ...batch,
    batchId: `${batch.batchId}-a`,
    content: batch.content.slice(0, splitPoint),
    endOffset: batch.startOffset + splitPoint
  }
  const batch2 = {
    ...batch,
    batchId: `${batch.batchId}-b`,
    content: batch.content.slice(splitPoint),
    startOffset: batch.startOffset + splitPoint
  }

  console.log(
    `[AI Metadata] Split batch at natural boundary: ` +
    `${splitPoint} chars (${(splitPoint / batch.content.length * 100).toFixed(1)}% of batch)`
  )

  const [result1, result2] = await Promise.all([
    extractBatchMetadata(geminiClient, batch1, modelName, maxRetries, fullMarkdown),
    extractBatchMetadata(geminiClient, batch2, modelName, maxRetries, fullMarkdown)
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
  fullMarkdown: string
): Promise<ChunkWithOffsets[]> {
  const prompt = generateSemanticChunkingPrompt(batch)

  // LOG: What we're sending to AI
  //console.log('[DEBUG] Batch content preview:', batch.content.slice(0, 500))
  //console.log('[DEBUG] Batch length:', batch.content.length)

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

  return parseMetadataResponse(text, batch, fullMarkdown)
}

/**
 * Generates the semantic chunking prompt.
 * AI identifies boundaries AND extracts metadata.
 */
function generateSemanticChunkingPrompt(batch: MetadataExtractionBatch): string {
  return `Analyze the DOCUMENT TEXT below and identify semantic chunks.

🚨 CRITICAL REQUIREMENT - EXACT TEXT PRESERVATION 🚨
You MUST copy text EXACTLY as it appears. Preserve:
- Every space, tab, and whitespace character
- Every newline and line break (\n)
- Every special character, punctuation mark
- Every formatting character
Do NOT normalize, clean, trim, or modify the text in ANY way.

If the source has "  Two  spaces\n\nTwo newlines", return EXACTLY "  Two  spaces\n\nTwo newlines"
NOT "Two spaces\n\nTwo newlines" or any modified version.

🚨 ABSOLUTE HARD LIMIT - CHUNK SIZE 🚨
MAXIMUM chunk size: 10000 characters (approximately 1600 words)
MINIMUM chunk size: 200 words

DO NOT EVER return a chunk larger than 10000 characters.
This is NOT a suggestion. This is a TECHNICAL CONSTRAINT.
Your response will be REJECTED if you violate this limit.

If a semantic unit would exceed 10000 characters:
1. STOP immediately
2. Break it into 2-3 smaller chunks
3. Each chunk gets its own themes/concepts/emotional analysis
4. Ensure each sub-chunk is semantically coherent

Example of WRONG (will be rejected):
{
  "content": "...49,000 characters of text..." ❌ TOO LARGE
}

Example of CORRECT:
{
  "content": "...3,500 characters of text..." ✅ WITHIN LIMIT
}

A semantic chunk is a COMPLETE UNIT OF THOUGHT with these constraints:
- TARGET: 500-1200 words (2500-6000 characters)
- MINIMUM: 200 words (1000 characters)
- MAXIMUM: 10000 characters (ABSOLUTE HARD LIMIT)
- NEVER combine multiple distinct ideas into one chunk

Semantic chunking rules:
- May span multiple paragraphs if they form one coherent idea
- May split a long paragraph if it covers multiple distinct ideas
- Should feel like a natural "node" in a knowledge graph
- If semantic completeness would exceed 10000 chars, split into multiple chunks at natural boundaries

MARKDOWN STRUCTURE GUIDANCE:
- Code blocks: Keep with surrounding context (don't isolate)
- Lists: Keep intact unless they span very different topics
- Tables: Usually keep as single chunks unless very large
- Headings: Good natural boundaries, but not always required
- Prioritize semantic completeness WITHIN the 5000 character limit

For each chunk you identify, extract:

1. **content**: EXACT VERBATIM TEXT from DOCUMENT TEXT section below
   - Copy EXACTLY character-by-character with NO modifications
   - Preserve ALL whitespace, newlines, and special characters
   - Do NOT trim, normalize, or clean the text
   - This must match markdown.slice(start_offset, end_offset) EXACTLY
2. **start_offset**: Character position where chunk starts (relative to DOCUMENT TEXT below, starting at 0)
3. **end_offset**: Character position where chunk ends (relative to DOCUMENT TEXT below)
4. **themes**: 2-5 key themes/topics
   - Examples: ["mortality", "alienation"], ["power dynamics", "surveillance"], ["entropy", "paranoia"]
5. **concepts**: 3-5 specific concepts with importance scores
   - Format: [{"text": "concept name", "importance": 0.8}]
   - Examples: 
     - Fiction: [{"text": "stream of consciousness", "importance": 0.9}, {"text": "unreliable narrator", "importance": 0.7}]
     - Philosophy: [{"text": "phenomenology", "importance": 0.85}, {"text": "dasein", "importance": 0.9}]
   - Importance: 0.0-1.0 representing how central each concept is to the chunk
6. **importance**: 0.0-1.0 score for how significant this chunk is to the overall work
   - Higher scores for key arguments, turning points, major revelations
   - Lower scores for transitional passages, descriptive interludes
7. **summary**: Brief one-sentence summary (max 100 chars)
   - Example: "Protagonist realizes the futility of his search"
8. **domain**: Domain classification
   - Options: narrative, philosophical, academic, poetic, experimental, essayistic, etc.
9. **emotional**: Emotional metadata for detecting contradictions and tensions
   - **polarity**: -1.0 (despair, nihilism, darkness) to +1.0 (hope, affirmation, transcendence)
   - **primaryEmotion**: anxiety, melancholy, joy, dread, wonder, rage, apathy, ecstasy, etc.
   - **intensity**: 0.0-1.0 (how strongly the emotion pervades the passage)
   - Examples:
     - Absurdist fiction: {polarity: -0.3, primaryEmotion: "absurdist humor", intensity: 0.6}
     - Existential crisis: {polarity: -0.8, primaryEmotion: "dread", intensity: 0.9}
     - Mystical experience: {polarity: 0.7, primaryEmotion: "awe", intensity: 0.8}

CRITICAL REQUIREMENTS:
- Identify chunk boundaries based on semantic completeness, not paragraph breaks
- ENFORCE the 10000 character maximum limit - this is NOT optional
- Target 500-1200 words per chunk, NEVER exceed 10000 characters
- Return chunks in sequential order
- start_offset and end_offset must be accurate character positions
- content must be ONLY text from DOCUMENT TEXT section below - DO NOT include instructions or examples
- Emotional polarity is CRITICAL for detecting contradictions
- IMPORTANT: Properly escape all JSON strings (quotes, newlines, backslashes)
- IMPORTANT: Ensure all JSON is well-formed and complete
- IMPORTANT: If a semantic unit would exceed 10000 chars, split it into multiple chunks

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

    // NOTE: Size validation is now handled BEFORE accepting AI results (in extractBatchMetadata)
    // Auto-splitting removed - it creates metadata-less chunks that can't be used for connections

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
    // After parsing chunks
    // for (const chunk of parsed.chunks) {
    //   console.log('[DEBUG] AI returned chunk start:', chunk.content.slice(0, 100))
      
    //   // Try to find it
    //   const index = fullMarkdown.indexOf(chunk.content)
    //   if (index === -1) {
    //     console.error('[DEBUG] NOT FOUND IN MARKDOWN')
    //     console.error('[DEBUG] AI content:', chunk.content.slice(0, 200))
    //     console.error('[DEBUG] Markdown start:', fullMarkdown.slice(0, 200))
    //   }
    // }

    // Return single validated chunk (normal case)
    return [{
      content: chunk.content,
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

  // Validate and correct offsets before returning (using 3-strategy fuzzy matching)
  const corrected = correctContentAndOffsets(fullMarkdown, validated)
  return corrected
}

/**
 * 3-Strategy Fuzzy Matching (from repair-chunk-offsets.ts)
 * Finds where content appears in markdown with graceful degradation.
 */
interface FuzzyMatch {
  start: number
  end: number
  confidence: 'exact' | 'fuzzy' | 'approximate'
  similarity: number // 0-100 percentage
}

/**
 * Find where content appears in markdown using 3-strategy fuzzy matching.
 *
 * Strategy 1: Exact match (100% similarity)
 * Strategy 2: Normalized whitespace match (95% similarity)
 * Strategy 3: First 100/last 100 chars (85% similarity)
 */
function fuzzySearchMarkdown(
  markdown: string,
  targetContent: string,
  startFrom: number = 0
): FuzzyMatch | null {
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

  // Strategy 2: Fuzzy match with normalized whitespace
  const normalizedContent = targetContent.trim().replace(/\s+/g, ' ')
  const normalizedMarkdown = markdown.replace(/\s+/g, ' ')

  const fuzzyIndex = normalizedMarkdown.indexOf(normalizedContent, startFrom)
  if (fuzzyIndex !== -1) {
    // Map back to original markdown position
    const originalIndex = mapNormalizedToOriginal(markdown, normalizedMarkdown, fuzzyIndex)

    return {
      start: originalIndex,
      end: originalIndex + targetContent.length,
      confidence: 'fuzzy',
      similarity: 95
    }
  }

  // Strategy 3: First 100/last 100 chars (for heavily modified chunks)
  const contentStart = targetContent.slice(0, 100).trim()
  const contentEnd = targetContent.slice(-100).trim()

  const startIndex = markdown.indexOf(contentStart, startFrom)
  if (startIndex !== -1) {
    const endIndex = markdown.indexOf(contentEnd, startIndex)
    if (endIndex !== -1) {
      return {
        start: startIndex,
        end: endIndex + contentEnd.length,
        confidence: 'approximate',
        similarity: 85
      }
    }
  }

  return null // Failed to locate
}

/**
 * Maps normalized index back to original markdown position.
 * Accounts for collapsed whitespace during normalization.
 */
function mapNormalizedToOriginal(
  original: string,
  normalized: string,
  normalizedIndex: number
): number {
  let originalIndex = 0
  let normalizedCount = 0

  while (normalizedCount < normalizedIndex && originalIndex < original.length) {
    if (/\s/.test(original[originalIndex])) {
      originalIndex++
      if (/\s/.test(normalized[normalizedCount])) {
        normalizedCount++
      }
    } else {
      originalIndex++
      normalizedCount++
    }
  }

  return originalIndex
}

/**
 * Telemetry structure for monitoring offset accuracy over time.
 */
interface OffsetAccuracyTelemetry {
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
 * Log telemetry after processing each document.
 * Helps catch regressions in offset accuracy.
 */
function logOffsetTelemetry(
  chunks: ChunkWithOffsets[],
  stats: {
    exact: number
    fuzzy: number
    approximate: number
    failed: number
  },
  processingTime: number
): void {
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
}

/**
 * Corrects AI-provided content and offsets using fuzzy matching.
 *
 * AI often normalizes whitespace/newlines, so we:
 * 1. Fuzzy search to find where AI's content appears in markdown
 * 2. Extract EXACT content from markdown at that location
 * 3. Replace AI's content with exact markdown bytes
 * 4. Calculate precise offsets
 * 5. Preserve AI's semantic metadata (themes, concepts, emotional analysis)
 */
function correctContentAndOffsets(
  fullMarkdown: string,
  chunks: ChunkWithOffsets[]
): ChunkWithOffsets[] {
  const startTime = Date.now()
  let searchHint = 0

  // Telemetry counters (track all 3 strategies)
  const stats = {
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

    // Use 3-strategy fuzzy matching
    const fuzzyMatch = fuzzySearchMarkdown(
      fullMarkdown,
      chunk.content,
      searchHint
    )

    if (!fuzzyMatch) {
      stats.failed++
      console.error(`[AI Metadata] ❌ Chunk ${i}: Cannot locate content`)
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
      console.error(`[AI Metadata] ⚠️ Chunk ${i}: Content mismatch after correction`)
    }
  }

  // Log summary with all 3 match types
  const total = chunks.length
  const accuracy = ((stats.exact + stats.fuzzy + stats.approximate) / total * 100).toFixed(1)

  console.log(`[AI Metadata] Content correction complete:`)
  console.log(`  ✅ Exact matches: ${stats.exact}/${total} (${(stats.exact/total*100).toFixed(1)}%)`)
  console.log(`  🔍 Fuzzy matches: ${stats.fuzzy}/${total} (${(stats.fuzzy/total*100).toFixed(1)}%)`)
  console.log(`  📍 Approximate matches: ${stats.approximate}/${total}`)
  console.log(`  ❌ Failures: ${stats.failed}/${total}`)
  console.log(`  📊 Overall accuracy: ${accuracy}%`)
  console.log(`  ⚠️ Validation failures: ${validationFailures}/${total}`)

  if (validationFailures > 0) {
    console.error(
      `[AI Metadata] CRITICAL: ${validationFailures} chunks failed validation!`
    )
  }

  // Log telemetry
  logOffsetTelemetry(
    corrected,
    stats,
    Date.now() - startTime
  )

  return corrected
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
  results: MetadataExtractionResult[]
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
