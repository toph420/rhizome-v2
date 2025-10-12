/**
 * Local Embeddings Generation with Transformers.js
 *
 * Phase 7: Replace Gemini embeddings with local processing
 *
 * Uses @huggingface/transformers to generate embeddings locally with
 * the same model (Xenova/all-mpnet-base-v2) that HybridChunker uses
 * for tokenization. This ensures alignment between chunk sizes and
 * embedding dimensions.
 *
 * Cost: $0.00 (100% local processing)
 * Performance: ~20-30 seconds for 500-page book (~400 chunks)
 * Dimensions: 768 (same as Gemini embedding-001)
 *
 * CRITICAL: Must use pooling='mean' and normalize=true for correct embeddings
 */

import { pipeline } from '@huggingface/transformers'

/**
 * Configuration for local embeddings generation.
 */
export interface LocalEmbeddingConfig {
  model: string
  dimensions: number
  batchSize: number
  pooling: 'mean' | 'max' | 'cls'
  normalize: boolean
}

/**
 * Default configuration for local embeddings.
 *
 * CRITICAL: Model must match HybridChunker tokenizer from Phase 2
 * - Docling PDF: tokenizer='Xenova/all-mpnet-base-v2'
 * - Docling EPUB: tokenizer='Xenova/all-mpnet-base-v2'
 *
 * Pooling and normalization required for correct 768d vectors.
 */
export const DEFAULT_LOCAL_CONFIG: LocalEmbeddingConfig = {
  model: 'Xenova/all-mpnet-base-v2',
  dimensions: 768,
  batchSize: 50, // Conservative batch size for local processing
  pooling: 'mean', // REQUIRED - without this, dimensions will be wrong
  normalize: true  // REQUIRED - without this, similarity scores will be incorrect
}

/**
 * Cache for the feature extraction pipeline.
 * Singleton pattern: Load model once, reuse across all calls.
 *
 * Model loading takes ~10-15 seconds on first call.
 * Subsequent calls use cached pipeline instantly.
 */
let cachedExtractor: any = null

/**
 * Generate embeddings locally using Transformers.js.
 *
 * Pattern follows worker/lib/embeddings.ts but uses local model instead of Gemini.
 *
 * Phase 7: Complete local processing pipeline
 * - PDF/EPUB → Docling → Ollama cleanup → Bulletproof matching → Metadata → Embeddings
 * - All stages run locally, zero API costs
 *
 * @param chunks - Array of chunk content strings to embed
 * @param config - Optional configuration (uses DEFAULT_LOCAL_CONFIG if not provided)
 * @returns Promise resolving to array of embedding vectors (768 dimensions each)
 * @throws {Error} If model loading fails or returns invalid dimensions
 *
 * @example
 * const embeddings = await generateEmbeddingsLocal(['chunk 1', 'chunk 2'])
 * console.log(embeddings.length) // 2
 * console.log(embeddings[0].length) // 768
 */
export async function generateEmbeddingsLocal(
  chunks: string[],
  config: Partial<LocalEmbeddingConfig> = {}
): Promise<number[][]> {
  const finalConfig = { ...DEFAULT_LOCAL_CONFIG, ...config }

  // Validate inputs
  if (!chunks || chunks.length === 0) {
    throw new Error('No chunks provided for local embedding generation')
  }

  console.log(`[LocalEmbeddings] Generating embeddings for ${chunks.length} chunks`)
  console.log(`[LocalEmbeddings] Model: ${finalConfig.model}`)
  console.log(`[LocalEmbeddings] Batch size: ${finalConfig.batchSize}`)

  // Load model pipeline (cached after first call)
  if (!cachedExtractor) {
    console.log('[LocalEmbeddings] Loading Transformers.js model (first time: ~10-15s)...')
    const startTime = Date.now()

    try {
      cachedExtractor = await pipeline(
        'feature-extraction',
        finalConfig.model
      )

      const loadTime = Date.now() - startTime
      console.log(`[LocalEmbeddings] Model loaded in ${(loadTime / 1000).toFixed(1)}s`)
    } catch (error: any) {
      throw new Error(
        `Failed to load Transformers.js model '${finalConfig.model}': ${error.message}`
      )
    }
  } else {
    console.log('[LocalEmbeddings] Using cached Transformers.js model')
  }

  // Process in batches for memory efficiency
  const allEmbeddings: number[][] = []
  const batchCount = Math.ceil(chunks.length / finalConfig.batchSize)

  for (let batchIndex = 0; batchIndex < batchCount; batchIndex++) {
    const startIdx = batchIndex * finalConfig.batchSize
    const endIdx = Math.min(startIdx + finalConfig.batchSize, chunks.length)
    const batch = chunks.slice(startIdx, endIdx)

    try {
      console.log(
        `[LocalEmbeddings] Processing batch ${batchIndex + 1}/${batchCount} ` +
        `(${batch.length} chunks)`
      )

      // CRITICAL: Must pass pooling and normalize options
      // Without these, embeddings will have wrong dimensions or incorrect similarity scores
      const output = await cachedExtractor(batch, {
        pooling: finalConfig.pooling,
        normalize: finalConfig.normalize
      })

      // Convert tensor to JavaScript array
      // Output shape: [batch_size, 768] for single sentences
      const embeddings = output.tolist()

      // Validate dimensions BEFORE accepting results
      // This catches configuration errors early
      for (let i = 0; i < embeddings.length; i++) {
        const embedding = embeddings[i]

        if (!Array.isArray(embedding)) {
          throw new Error(
            `Invalid embedding at batch ${batchIndex}, index ${i}: not an array`
          )
        }

        if (embedding.length !== finalConfig.dimensions) {
          throw new Error(
            `Invalid embedding dimension at batch ${batchIndex}, index ${i}: ` +
            `expected ${finalConfig.dimensions}, got ${embedding.length}. ` +
            `Check pooling='${finalConfig.pooling}' and normalize=${finalConfig.normalize} options.`
          )
        }

        // Validate all values are numbers
        if (!embedding.every(val => typeof val === 'number' && !isNaN(val))) {
          throw new Error(
            `Invalid embedding values at batch ${batchIndex}, index ${i}: ` +
            `contains non-numeric or NaN values`
          )
        }
      }

      allEmbeddings.push(...embeddings)

      // Progress logging
      const processedCount = endIdx
      const progressPercent = Math.floor((processedCount / chunks.length) * 100)
      console.log(
        `[LocalEmbeddings] Batch ${batchIndex + 1}/${batchCount} complete ` +
        `(${progressPercent}% done, ${allEmbeddings.length}/${chunks.length} total)`
      )

    } catch (error: any) {
      throw new Error(
        `Local embedding generation failed for batch ${batchIndex + 1}/${batchCount} ` +
        `(chunks ${startIdx}-${endIdx}): ${error.message}`
      )
    }
  }

  // Final validation: ensure we got embeddings for all chunks
  if (allEmbeddings.length !== chunks.length) {
    throw new Error(
      `Embedding count mismatch: expected ${chunks.length}, got ${allEmbeddings.length}`
    )
  }

  console.log(`[LocalEmbeddings] Successfully generated ${allEmbeddings.length} embeddings (768d)`)

  return allEmbeddings
}

/**
 * Generate single embedding locally for query or test purposes.
 *
 * Convenience wrapper around generateEmbeddingsLocal for single-chunk use cases.
 * Model is cached after first call for instant subsequent generations.
 *
 * @param content - Text content to embed
 * @param config - Optional configuration
 * @returns Promise resolving to single embedding vector (768 dimensions)
 *
 * @example
 * const embedding = await generateSingleEmbeddingLocal('test content')
 * console.log(embedding.length) // 768
 */
export async function generateSingleEmbeddingLocal(
  content: string,
  config: Partial<LocalEmbeddingConfig> = {}
): Promise<number[]> {
  if (!content || content.trim().length === 0) {
    throw new Error('Empty content provided for local embedding generation')
  }

  const embeddings = await generateEmbeddingsLocal([content], config)
  return embeddings[0]
}

/**
 * Clear the cached Transformers.js model pipeline.
 *
 * Useful for tests or if you need to free memory.
 * Next call to generateEmbeddingsLocal will reload the model.
 */
export function clearEmbeddingCache(): void {
  if (cachedExtractor) {
    console.log('[LocalEmbeddings] Clearing cached model pipeline')
    cachedExtractor = null
  }
}
