/**
 * Calculate cosine similarity between two vectors.
 * 
 * Cosine similarity measures the cosine of the angle between two vectors,
 * producing a value between -1 (opposite) and 1 (identical).
 * 
 * @param a - First vector
 * @param b - Second vector
 * @returns Cosine similarity score (0-1 range for embeddings)
 * @throws {Error} If vectors have different lengths
 * 
 * @example
 * const similarity = cosineSimilarity([1, 0, 0], [1, 0, 0])
 * console.log(similarity) // 1.0 (identical)
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error(`Vector dimension mismatch: ${a.length} vs ${b.length}`)
  }
  
  let dotProduct = 0
  let normA = 0
  let normB = 0
  
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  
  const denominator = Math.sqrt(normA) * Math.sqrt(normB)
  if (denominator === 0) {
    return 0
  }
  
  return dotProduct / denominator
}

/**
 * Generate test embedding using native Gemini SDK.
 * 
 * Used for vector equivalence testing to compare Vercel AI SDK results
 * against the native SDK baseline.
 * 
 * @param content - Text content to embed
 * @returns Promise resolving to embedding vector from native SDK
 */
export async function generateNativeEmbedding(content: string): Promise<number[]> {
  const { GoogleGenAI } = await import('@google/genai')
  
  if (!process.env.GOOGLE_AI_API_KEY) {
    throw new Error('GOOGLE_AI_API_KEY not configured')
  }
  
  const ai = new GoogleGenAI({ 
    apiKey: process.env.GOOGLE_AI_API_KEY 
  })
  
  const result = await ai.models.embedContent({
    model: 'gemini-embedding-001',
    contents: content,
    config: { outputDimensionality: 768 }
  })
  
  const embedding = result.embeddings?.[0]?.values
  if (!embedding || !Array.isArray(embedding)) {
    throw new Error('Invalid native embedding response')
  }
  
  return embedding
}

/**
 * Validate that an embedding has correct dimensions and valid values.
 * 
 * @param embedding - Vector to validate
 * @param expectedDimensions - Expected vector length (default: 768)
 * @returns True if valid, throws Error if invalid
 */
export function validateEmbedding(
  embedding: number[], 
  expectedDimensions = 768
): boolean {
  if (!Array.isArray(embedding)) {
    throw new Error('Embedding must be an array')
  }
  
  if (embedding.length !== expectedDimensions) {
    throw new Error(
      `Invalid dimensions: expected ${expectedDimensions}, got ${embedding.length}`
    )
  }
  
  if (!embedding.every(val => typeof val === 'number' && !isNaN(val))) {
    throw new Error('Embedding contains invalid values')
  }
  
  return true
}