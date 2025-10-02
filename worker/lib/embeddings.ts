import { google } from '@ai-sdk/google'
import { embedMany } from 'ai'

/**
 * Configuration for embeddings generation.
 */
export interface EmbeddingConfig {
  model: string
  dimensions: number
  batchSize: number
  retryAttempts: number
  retryDelay: number
}

/**
 * Result from embedding generation including usage metadata.
 */
export interface EmbeddingResult {
  embeddings: number[][]
  tokensUsed?: number
}

/**
 * Default configuration for Gemini embeddings.
 *
 * Model: gemini-embedding-001 (768 dimensions default).
 * Batch size: 100 chunks (conservative, under 250 API limit).
 * Retry attempts: 3 retries with exponential backoff.
 *
 * Note: gemini-embedding-001 returns 768-dimensional vectors by default.
 * The model's natural dimensionality is used for optimal performance.
 */
export const DEFAULT_CONFIG: EmbeddingConfig = {
  model: 'gemini-embedding-001',
  dimensions: 768,
  batchSize: 100,
  retryAttempts: 3,
  retryDelay: 1000
}

/**
 * Generate embeddings for document chunks using Vercel AI SDK.
 *
 * Processes chunks in batches for efficiency while respecting rate limits.
 * Validates vector dimensions before returning results.
 * @param chunks - Array of chunk content strings.
 * @param config - Optional configuration (uses DEFAULT_CONFIG if not provided).
 * @returns Promise resolving to array of embedding vectors (768 dimensions each).
 * @throws {Error} If API call fails or returns invalid dimensions.
 * @example
 * const embeddings = await generateEmbeddings(['chunk 1', 'chunk 2'])
 * console.log(embeddings.length) // 2
 * console.log(embeddings[0].length) // 768
 */
export async function generateEmbeddings(
  chunks: string[],
  config: Partial<EmbeddingConfig> = {}
): Promise<number[][]> {
  const finalConfig = { ...DEFAULT_CONFIG, ...config }
  const allEmbeddings: number[][] = []
  
  // Validate inputs
  if (!chunks || chunks.length === 0) {
    throw new Error('No chunks provided for embedding generation')
  }
  
  // Check for API key (support both naming conventions)
  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GOOGLE_AI_API_KEY
  if (!apiKey) {
    throw new Error('GOOGLE_AI_API_KEY environment variable not configured')
  }
  
  // Set the API key for Vercel AI SDK
  process.env.GOOGLE_GENERATIVE_AI_API_KEY = apiKey
  
  // Process in batches (max 250 per Gemini API, we use 100 conservatively)
  const batchCount = Math.ceil(chunks.length / finalConfig.batchSize)
  
  for (let batchIndex = 0; batchIndex < batchCount; batchIndex++) {
    const startIdx = batchIndex * finalConfig.batchSize
    const endIdx = Math.min(startIdx + finalConfig.batchSize, chunks.length)
    const batch = chunks.slice(startIdx, endIdx)
    
    try {
      // Generate embeddings with Vercel AI SDK
      const { embeddings, usage } = await embedMany({
        model: google.textEmbedding(finalConfig.model),
        values: batch,
        maxRetries: finalConfig.retryAttempts,
        providerOptions: {
          google: {
            outputDimensionality: finalConfig.dimensions
          }
        }
      })
      
      // CRITICAL: Validate dimensions BEFORE accepting results
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
            `expected ${finalConfig.dimensions}, got ${embedding.length}`
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
      
      // Log progress for monitoring
      const processedCount = endIdx
      const progressPercent = Math.floor((processedCount / chunks.length) * 100)
      console.log(
        `Embedding batch ${batchIndex + 1}/${batchCount}: ` +
        `${batch.length} chunks, ${usage?.tokens || 'unknown'} tokens ` +
        `(${progressPercent}% complete)`
      )
      
      // Rate limiting: 1s delay between batches (free tier: 100 RPM)
      // Skip delay after last batch
      if (batchIndex < batchCount - 1) {
        await new Promise(resolve => setTimeout(resolve, finalConfig.retryDelay))
      }
      
    } catch (error) {
      const err = error instanceof Error ? error : new Error('Unknown error')
      throw new Error(
        `Embedding generation failed for batch ${batchIndex + 1}/${batchCount} ` +
        `(chunks ${startIdx}-${endIdx}): ${err.message}`
      )
    }
  }
  
  // Final validation: ensure we got embeddings for all chunks
  if (allEmbeddings.length !== chunks.length) {
    throw new Error(
      `Embedding count mismatch: expected ${chunks.length}, got ${allEmbeddings.length}`
    )
  }
  
  return allEmbeddings
}

/**
 * Generate single embedding for query or test purposes.
 *
 * Convenience wrapper around generateEmbeddings for single-chunk use cases.
 * @param content - Text content to embed.
 * @param config - Optional configuration.
 * @returns Promise resolving to single embedding vector.
 * @example
 * const embedding = await generateSingleEmbedding('test content')
 * console.log(embedding.length) // 768
 */
export async function generateSingleEmbedding(
  content: string,
  config: Partial<EmbeddingConfig> = {}
): Promise<number[]> {
  if (!content || content.trim().length === 0) {
    throw new Error('Empty content provided for embedding generation')
  }
  
  const embeddings = await generateEmbeddings([content], config)
  return embeddings[0]
}