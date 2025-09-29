/**
 * AI-powered markdown chunking using Google Gemini.
 * Provides semantic chunking with metadata extraction for markdown content.
 */

import { GoogleGenAI } from '@google/genai'
import { Type } from '@google/genai'

/**
 * Chunk data structure with AI-extracted metadata.
 */
export interface ChunkData {
  /** Actual chunk text content */
  content: string
  /** Array of 2-3 specific topics covered in the chunk */
  themes: string[]
  /** Importance score 0.0-1.0 representing centrality to document */
  importance_score: number
  /** One sentence summary of what this chunk covers */
  summary: string
  /** Optional position data for source tracking */
  start_offset?: number
  end_offset?: number
  position_context?: {
    confidence: number
    method: string
    context_before?: string
    context_after?: string
  }
}

/**
 * Rechunks markdown content using AI for semantic understanding.
 * Creates intelligent chunks with complete thoughts and metadata.
 * 
 * Features:
 * - Semantic chunking (200-2000 chars per chunk)
 * - Theme extraction for each chunk
 * - Importance scoring for prioritization
 * - Auto-generated summaries
 * - Validation and fallback for incomplete metadata
 * 
 * @param ai - Google Generative AI client instance
 * @param markdown - Markdown content to chunk
 * @param model - Gemini model to use (default: 'gemini-2.0-flash-exp')
 * @returns Promise of array of chunks with metadata
 * @throws Error if AI response is invalid or empty
 * 
 * @example
 * const chunks = await rechunkMarkdown(ai, markdownContent)
 * // Returns chunks with themes, importance scores, and summaries
 */
export async function rechunkMarkdown(
  ai: GoogleGenAI, 
  markdown: string, 
  model: string = 'gemini-2.0-flash-exp'
): Promise<ChunkData[]> {
  const result = await ai.models.generateContent({
    model,
    contents: [{
      parts: [
        { text: `Break this markdown document into semantic chunks (complete thoughts, 200-2000 characters).

CRITICAL: Every chunk MUST have:
- content: The actual chunk text (STRING, required)
- themes: Array of 2-3 specific topics covered (e.g., ["authentication", "security"]) (ARRAY of STRINGS, required)
- importance_score: Float 0.0-1.0 representing how central this content is to the document (NUMBER, required)
- summary: One sentence describing what this chunk covers (STRING, required)

Return JSON with this exact structure: {chunks: [{content, themes, importance_score, summary}]}

${markdown}` }
      ]
    }],
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          chunks: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                content: { type: Type.STRING },
                themes: { type: Type.ARRAY, items: { type: Type.STRING }},
                importance_score: { type: Type.NUMBER },
                summary: { type: Type.STRING }
              },
              required: ['content', 'themes', 'importance_score', 'summary']
            }
          }
        },
        required: ['chunks']
      }
    }
  })

  if (!result.text) {
    throw new Error('AI returned empty response during chunking')
  }
  
  try {
    const response = JSON.parse(result.text);
    if (!response.chunks || !Array.isArray(response.chunks)) {
      throw new Error('Invalid chunking response structure')
    }
    
    // Validation loop: Ensure all chunks have complete metadata
    const validatedChunks = response.chunks.map((chunk: any, index: number) => {
      let hasWarnings = false
      
      // Validate and default themes
      if (!chunk.themes || !Array.isArray(chunk.themes) || chunk.themes.length === 0) {
        console.warn(`⚠️  Chunk ${index}: Missing or empty themes, defaulting to ['general']`)
        chunk.themes = ['general']
        hasWarnings = true
      }
      
      // Validate and default importance_score
      if (typeof chunk.importance_score !== 'number' || chunk.importance_score < 0 || chunk.importance_score > 1) {
        console.warn(`⚠️  Chunk ${index}: Invalid importance_score (${chunk.importance_score}), defaulting to 0.5`)
        chunk.importance_score = 0.5
        hasWarnings = true
      }
      
      // Validate and default summary
      if (!chunk.summary || typeof chunk.summary !== 'string' || chunk.summary.trim() === '') {
        const fallbackSummary = chunk.content.slice(0, 100) + '...'
        console.warn(`⚠️  Chunk ${index}: Missing summary, using content preview: "${fallbackSummary}"`)
        chunk.summary = fallbackSummary
        hasWarnings = true
      }
      
      // Ensure content exists (critical field)
      if (!chunk.content || typeof chunk.content !== 'string') {
        throw new Error(`Chunk ${index}: Missing or invalid content field`)
      }
      
      return chunk as ChunkData
    })
    
    console.log(`✅ Validated ${validatedChunks.length} chunks from AI response`)
    return validatedChunks
    
  } catch (error: any) {
    console.error('Failed to parse AI chunking response:', error)
    throw new Error(`AI chunking failed: ${error.message}`)
  }
}

/**
 * Cleans and improves markdown formatting using AI.
 * Fixes issues with headings, lists, emphasis while preserving all content.
 * 
 * @param ai - Google Generative AI client instance
 * @param rawMarkdown - Raw markdown to clean
 * @param model - Gemini model to use (default: 'gemini-2.0-flash-exp')
 * @returns Promise of cleaned markdown string
 * @throws Error if AI cleaning fails
 * 
 * @example
 * const cleaned = await cleanMarkdownWithAI(ai, messyMarkdown)
 * // Returns properly formatted markdown with improved structure
 */
export async function cleanMarkdownWithAI(
  ai: GoogleGenAI,
  rawMarkdown: string,
  model: string = 'gemini-2.0-flash-exp'
): Promise<string> {
  const cleanResult = await ai.models.generateContent({
    model,
    contents: [{
      parts: [{
        text: `Clean and improve this markdown formatting. Fix any issues with headings, lists, emphasis, etc. Preserve all content but enhance readability.

${rawMarkdown}`
      }]
    }]
  })
  
  const cleanedMarkdown = cleanResult.text || ''
  
  if (!cleanedMarkdown) {
    throw new Error('AI returned empty response during markdown cleaning')
  }
  
  return cleanedMarkdown
}

/**
 * Converts plain text to structured markdown using AI.
 * Adds headings, lists, emphasis, and proper formatting.
 * 
 * @param ai - Google Generative AI client instance  
 * @param textContent - Plain text to convert
 * @param model - Gemini model to use (default: 'gemini-2.0-flash-exp')
 * @returns Promise of markdown-formatted string
 * @throws Error if AI conversion fails
 * 
 * @example
 * const markdown = await textToMarkdownWithAI(ai, plainText)
 * // Returns structured markdown with headings and formatting
 */
export async function textToMarkdownWithAI(
  ai: GoogleGenAI,
  textContent: string,
  model: string = 'gemini-2.0-flash-exp'
): Promise<string> {
  const result = await ai.models.generateContent({
    model,
    contents: [{
      parts: [{
        text: `Convert this plain text to well-formatted markdown. Add appropriate headings, lists, emphasis, and structure.

${textContent}`
      }]
    }]
  })
  
  const markdown = result.text || ''
  
  if (!markdown) {
    throw new Error('AI returned empty response during text to markdown conversion')
  }
  
  return markdown
}