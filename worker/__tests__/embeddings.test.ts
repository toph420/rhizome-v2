import { describe, test, expect, beforeAll } from '@jest/globals'
import { generateEmbeddings, generateSingleEmbedding, DEFAULT_CONFIG } from '../lib/embeddings.js'
import { cosineSimilarity, generateNativeEmbedding, validateEmbedding } from './utils/vector-utils.js'
import * as dotenv from 'dotenv'
import { resolve } from 'path'

// Load environment variables from parent .env.local
dotenv.config({ path: resolve(__dirname, '../../.env.local') })

// Skip tests if API key not configured
const shouldRunTests = !!process.env.GOOGLE_AI_API_KEY
const describeIf = shouldRunTests ? describe : describe.skip

describeIf('Embeddings Module', () => {
  test('generates valid embeddings with correct dimensions', async () => {
    const chunks = ['Test content 1', 'Test content 2', 'Test content 3']
    const embeddings = await generateEmbeddings(chunks)
    
    // Verify correct count
    expect(embeddings).toHaveLength(3)
    
    // Verify each embedding
    for (let i = 0; i < embeddings.length; i++) {
      const embedding = embeddings[i]
      expect(embedding).toHaveLength(768)
      expect(validateEmbedding(embedding)).toBe(true)
      
      // Verify all values are numbers
      for (const value of embedding) {
        expect(typeof value).toBe('number')
        expect(isNaN(value)).toBe(false)
        expect(isFinite(value)).toBe(true)
      }
    }
  }, 30000) // 30s timeout for API call
  
  test('generates consistent embeddings for same content', async () => {
    const content = 'Consistency test content for embeddings'
    
    const embedding1 = await generateSingleEmbedding(content)
    const embedding2 = await generateSingleEmbedding(content)
    
    // Verify nearly identical (allowing for floating point precision)
    const similarity = cosineSimilarity(embedding1, embedding2)
    expect(similarity).toBeGreaterThan(0.9999)
  }, 30000)
  
  test('handles batch processing correctly', async () => {
    // Generate 150 test chunks (1.5 batches at default batch size of 100)
    const chunks = Array.from({ length: 150 }, (_, i) => `Test chunk number ${i} with some content`)
    
    const embeddings = await generateEmbeddings(chunks)
    
    // Verify all embeddings generated
    expect(embeddings).toHaveLength(150)
    
    // Verify all have correct dimensions
    expect(embeddings.every(e => e.length === 768)).toBe(true)
    
    // Verify no duplicates (each chunk should have unique embedding)
    const firstEmbedding = embeddings[0]
    const lastEmbedding = embeddings[149]
    const similarity = cosineSimilarity(firstEmbedding, lastEmbedding)
    expect(similarity).toBeLessThan(0.99) // Should be different content
  }, 60000) // 60s timeout for large batch
  
  test('validates vector equivalence with native SDK', async () => {
    const testContent = 'Vector equivalence test: comparing Vercel AI SDK with native Gemini SDK'
    
    // Generate with both SDKs
    const vercelEmbedding = await generateSingleEmbedding(testContent)
    const nativeEmbedding = await generateNativeEmbedding(testContent)
    
    // Verify both have correct dimensions
    expect(vercelEmbedding).toHaveLength(768)
    expect(nativeEmbedding).toHaveLength(768)
    
    // CRITICAL: High similarity (>0.999) required for migration confidence
    const similarity = cosineSimilarity(vercelEmbedding, nativeEmbedding)
    expect(similarity).toBeGreaterThan(0.999)
    
    console.log(`Vector equivalence: ${(similarity * 100).toFixed(4)}% similarity`)
  }, 30000)
  
  test('handles empty input gracefully', async () => {
    await expect(generateEmbeddings([])).rejects.toThrow('No chunks provided')
  })
  
  test('handles invalid content gracefully', async () => {
    await expect(generateSingleEmbedding('')).rejects.toThrow('Empty content')
  })
  
  test('validates embedding dimensions', async () => {
    // This test validates that our dimension checking works
    const embedding = await generateSingleEmbedding('test')
    expect(() => validateEmbedding(embedding, 1024)).toThrow('Invalid dimensions')
  }, 30000)
})

describe('Embeddings Module (no API required)', () => {
  test('DEFAULT_CONFIG has correct structure', () => {
    expect(DEFAULT_CONFIG.model).toBe('gemini-embedding-001')
    expect(DEFAULT_CONFIG.dimensions).toBe(768)
    expect(DEFAULT_CONFIG.batchSize).toBe(100)
    expect(DEFAULT_CONFIG.retryAttempts).toBe(3)
    expect(DEFAULT_CONFIG.retryDelay).toBe(1000)
  })
})