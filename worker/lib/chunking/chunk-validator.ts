/**
 * Validation layer for AI-generated chunks.
 *
 * Centralizes all validation logic:
 * - Size constraints (max 10K chars for embeddings)
 * - Required fields (content, offsets, metadata)
 * - Offset logic (start < end)
 * - Metadata completeness (themes, concepts, emotional)
 */

import type { ChunkWithOffsets, MetadataExtractionBatch } from '../../types/chunking'
import { ChunkValidationError } from './errors'

/**
 * Result from chunk validation with categorized chunks.
 */
export interface ValidationResult {
  /** Chunks that passed all validation checks */
  valid: ChunkWithOffsets[]
  /** Chunks exceeding size limit */
  oversized: Array<{ chunk: ChunkWithOffsets; size: number }>
  /** Chunks with validation errors */
  invalid: Array<{ chunk: any; chunkIndex: number; reason: string }>
}

/**
 * Configuration for chunk validation.
 */
export interface ValidationConfig {
  /** Maximum chunk size in characters (default: 10000) */
  maxChunkSize: number
  /** Minimum chunk size in characters (default: 1000) */
  minChunkSize: number
  /** Require all metadata fields (default: false) */
  strictMetadata: boolean
}

const DEFAULT_VALIDATION_CONFIG: ValidationConfig = {
  maxChunkSize: 10000,
  minChunkSize: 1000,
  strictMetadata: false
}

/**
 * Validates AI-generated chunks against size and completeness requirements.
 *
 * @param chunks - Raw chunks from AI response
 * @param batch - Original batch for context
 * @param config - Validation configuration
 * @returns Categorized validation results
 */
export function validateChunks(
  chunks: any[],
  batch: MetadataExtractionBatch,
  config: Partial<ValidationConfig> = {}
): ValidationResult {
  const finalConfig = { ...DEFAULT_VALIDATION_CONFIG, ...config }

  const result: ValidationResult = {
    valid: [],
    oversized: [],
    invalid: []
  }

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i]

    // Validate required fields
    if (!chunk.content || typeof chunk.content !== 'string') {
      result.invalid.push({
        chunk,
        chunkIndex: i,
        reason: 'Missing or invalid content'
      })
      continue
    }

    if (typeof chunk.start_offset !== 'number' || typeof chunk.end_offset !== 'number') {
      result.invalid.push({
        chunk,
        chunkIndex: i,
        reason: 'Missing or invalid offsets'
      })
      continue
    }

    // Convert relative offsets to absolute offsets
    const absoluteStart = batch.startOffset + chunk.start_offset
    const absoluteEnd = batch.startOffset + chunk.end_offset

    // Validate offset logic
    if (absoluteStart >= absoluteEnd) {
      result.invalid.push({
        chunk,
        chunkIndex: i,
        reason: `Invalid offsets (${absoluteStart} >= ${absoluteEnd})`
      })
      continue
    }

    // Check size constraints
    const chunkSize = chunk.content.length

    if (chunkSize > finalConfig.maxChunkSize) {
      result.oversized.push({
        chunk: {
          ...chunk,
          start_offset: absoluteStart,
          end_offset: absoluteEnd
        },
        size: chunkSize
      })
      continue
    }

    if (chunkSize < finalConfig.minChunkSize) {
      console.warn(
        `[Chunk Validator] Chunk ${i}: Below minimum size (${chunkSize} < ${finalConfig.minChunkSize})`
      )
      // Don't reject, just warn
    }

    // Validate and normalize metadata
    const validatedChunk = validateMetadata(chunk, i, finalConfig.strictMetadata)

    // Build final chunk with absolute offsets
    result.valid.push({
      content: chunk.content,
      start_offset: absoluteStart,
      end_offset: absoluteEnd,
      metadata: validatedChunk.metadata
    })
  }

  // Log validation summary
  console.log(`[Chunk Validator] Batch ${batch.batchId} validation:`)
  console.log(`  ✅ Valid: ${result.valid.length}`)
  console.log(`  ⚠️  Oversized: ${result.oversized.length}`)
  console.log(`  ❌ Invalid: ${result.invalid.length}`)

  return result
}

/**
 * Validates and normalizes chunk metadata.
 * Provides defaults for missing fields.
 */
function validateMetadata(
  chunk: any,
  index: number,
  strict: boolean
): ChunkWithOffsets {
  // Validate themes
  if (!chunk.themes || !Array.isArray(chunk.themes) || chunk.themes.length === 0) {
    if (strict) {
      throw new ChunkValidationError(index, 'Missing themes', chunk)
    }
    console.warn(`[Chunk Validator] Chunk ${index}: Missing themes, defaulting to ['general']`)
    chunk.themes = ['general']
  }

  // Validate concepts
  if (!chunk.concepts || !Array.isArray(chunk.concepts) || chunk.concepts.length === 0) {
    if (strict) {
      throw new ChunkValidationError(index, 'Missing concepts', chunk)
    }
    console.warn(`[Chunk Validator] Chunk ${index}: Missing concepts, defaulting to empty array`)
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
    if (strict) {
      throw new ChunkValidationError(index, 'Invalid importance score', chunk)
    }
    console.warn(`[Chunk Validator] Chunk ${index}: Invalid importance, defaulting to 0.5`)
    chunk.importance = 0.5
  }

  // Validate emotional metadata
  if (!chunk.emotional || typeof chunk.emotional !== 'object') {
    if (strict) {
      throw new ChunkValidationError(index, 'Missing emotional metadata', chunk)
    }
    console.warn(`[Chunk Validator] Chunk ${index}: Missing emotional metadata, using defaults`)
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

  return {
    content: chunk.content,
    start_offset: chunk.start_offset,
    end_offset: chunk.end_offset,
    metadata: {
      themes: chunk.themes,
      concepts: chunk.concepts,
      importance: chunk.importance,
      summary: chunk.summary || undefined,
      domain: chunk.domain || undefined,
      emotional: chunk.emotional
    }
  }
}

/**
 * Quick size check for early validation.
 * Used before expensive processing.
 */
export function validateChunkSizes(
  chunks: ChunkWithOffsets[],
  maxSize: number = 10000
): { allValid: boolean; oversized: ChunkWithOffsets[] } {
  const oversized = chunks.filter(c => c.content.length > maxSize)

  return {
    allValid: oversized.length === 0,
    oversized
  }
}

/**
 * Splits an oversized chunk into smaller chunks while preserving metadata.
 *
 * @param chunk - Oversized chunk to split
 * @param maxSize - Target size for split chunks (default: 8000 to stay well under 10K limit)
 * @returns Array of smaller chunks with preserved metadata
 */
export function splitOversizedChunk(
  chunk: ChunkWithOffsets,
  maxSize: number = 8000
): ChunkWithOffsets[] {
  const chunks: ChunkWithOffsets[] = []
  const content = chunk.content
  let position = 0

  while (position < content.length) {
    const end = Math.min(position + maxSize, content.length)
    const splitContent = content.substring(position, end).trim()

    // Calculate proportional offsets
    const offsetRange = chunk.end_offset - chunk.start_offset
    const proportionalStart = chunk.start_offset + Math.floor((position / content.length) * offsetRange)
    const proportionalEnd = chunk.start_offset + Math.floor((end / content.length) * offsetRange)

    chunks.push({
      content: splitContent,
      start_offset: proportionalStart,
      end_offset: proportionalEnd,
      metadata: {
        ...chunk.metadata,
        // Add note that this was split
        summary: chunk.metadata.summary
          ? `${chunk.metadata.summary} (split ${chunks.length + 1})`
          : `Split chunk ${chunks.length + 1}`
      }
    })

    position = end
  }

  console.log(`[Chunk Validator] Split oversized chunk (${content.length} chars) into ${chunks.length} chunks`)
  return chunks
}

/**
 * Creates fallback chunks when AI completely fails.
 * Splits batch into ~1500 char chunks locally with minimal metadata.
 *
 * @param batch - Failed batch to chunk locally
 * @returns Array of simple chunks with default metadata
 */
export function createFallbackChunksForBatch(
  batch: MetadataExtractionBatch
): ChunkWithOffsets[] {
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
      metadata: {
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
    })

    position = end
  }

  console.log(`[Chunk Validator] Created ${chunks.length} fallback chunks for failed batch`)
  return chunks
}
