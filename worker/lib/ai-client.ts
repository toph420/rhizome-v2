/**
 * AI Client Factory
 * 
 * Simple factory for creating Gemini AI client instances.
 * Used by the validation framework and processors.
 * 
 * @module lib/ai-client
 */

import { GoogleGenAI } from '@google/genai'

/**
 * Creates a new Gemini AI client instance.
 * 
 * @param apiKey - The Gemini API key
 * @returns Configured GoogleGenAI instance
 */
export function createGeminiClient(apiKey: string): GoogleGenAI {
  if (!apiKey) {
    throw new Error('Gemini API key is required')
  }

  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      timeout: 300000 // 5 minutes timeout for AI operations
    }
  })
}

/**
 * Gets the default Gemini client using environment variable.
 * 
 * @returns Configured GoogleGenAI instance
 * @throws Error if GEMINI_API_KEY is not set
 */
export function getDefaultGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY
  
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY environment variable is not set')
  }

  return createGeminiClient(apiKey)
}

// Export the type for convenience
export type { GoogleGenAI } from '@google/genai'