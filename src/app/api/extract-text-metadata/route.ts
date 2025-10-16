import { NextRequest } from 'next/server'
import { generateObject } from 'ai'
import { google } from '@ai-sdk/google'
import { z } from 'zod'
import type { DetectedMetadata, DocumentType } from '@/types/metadata'

export const runtime = 'nodejs'
export const maxDuration = 30

/**
 * Zod schema for AI-powered metadata extraction.
 * Ensures structured output from Gemini.
 */
const metadataSchema = z.object({
  title: z.string(),
  author: z.string(),
  type: z.enum(['article', 'essay', 'nonfiction_book', 'technical_manual']),
  year: z.string().optional(),
  description: z.string().optional()
})

/**
 * Extract metadata from text/markdown files.
 * Strategy 1: Parse YAML frontmatter (instant, free)
 * Strategy 2: AI extraction with Vercel AI SDK (2s, $0.001)
 */
export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File

    if (!file) {
      return Response.json({ error: 'No file provided' }, { status: 400 })
    }

    const content = await file.text()

    // Strategy 1: Try frontmatter first (free and instant)
    const frontmatter = extractFrontmatter(content)
    if (frontmatter?.title && frontmatter?.author) {
      console.log('[extract-text-metadata] Using frontmatter (free path)')

      const result: DetectedMetadata = {
        title: frontmatter.title,
        author: frontmatter.author,
        type: (frontmatter.type as DocumentType) || 'article',
        year: frontmatter.year || frontmatter.date?.slice(0, 4),
        publisher: frontmatter.publisher,
        description: frontmatter.description,
        language: frontmatter.language || 'en'
      }

      return Response.json(result)
    }

    // Strategy 2: Fallback to AI extraction
    console.log('[extract-text-metadata] No frontmatter found, using AI extraction')

    // Check for API key
    const apiKey = process.env.GOOGLE_AI_API_KEY
    if (!apiKey) {
      console.error('[extract-text-metadata] GOOGLE_AI_API_KEY not found in environment')
      throw new Error('Google AI API key not configured')
    }

    const modelName = process.env.GEMINI_MODEL || 'gemini-2.0-flash-exp'
    console.log('[extract-text-metadata] Using model:', modelName)

    const { object } = await generateObject({
      model: google(modelName, { apiKey }),
      schema: metadataSchema,
      prompt: `Extract metadata from this document.

Rules:
- Title: Use main heading or infer from content
- Author: Look for author name or use "Unknown"
- Type: Classify as article, essay, nonfiction_book, or technical_manual
- Year: Publication year if mentioned (4 digits only, as string)
- Description: 1-2 sentence summary

Document (first 5000 chars):
${content.slice(0, 5000)}`
    })

    console.log('[extract-text-metadata] AI extraction complete:', object.title)

    const result: DetectedMetadata = {
      ...object,
      language: 'en'
    }

    return Response.json(result)
  } catch (error) {
    console.error('[extract-text-metadata] Error:', error)

    // Provide more detailed error message
    const errorMessage = error instanceof Error ? error.message : 'Failed to extract metadata'
    console.error('[extract-text-metadata] Detailed error:', errorMessage)

    return Response.json(
      { error: errorMessage },
      { status: 500 }
    )
  }
}

/**
 * Extract YAML frontmatter from markdown content.
 * Supports standard Jekyll/Hugo frontmatter format:
 * ---
 * key: value
 * ---
 *
 * @returns Parsed frontmatter object or null if not found/invalid
 */
function extractFrontmatter(content: string): Record<string, any> | null {
  // Match YAML frontmatter (--- ... ---)
  const match = content.match(/^---\n([\s\S]*?)\n---/)
  if (!match) return null

  try {
    const yaml = match[1]
    const lines = yaml.split('\n')
    const data: Record<string, any> = {}

    for (const line of lines) {
      const colonIndex = line.indexOf(':')
      if (colonIndex === -1) continue

      const key = line.slice(0, colonIndex).trim()
      const value = line.slice(colonIndex + 1).trim().replace(/^['"]|['"]$/g, '')

      if (key && value) {
        data[key] = value
      }
    }

    // Validate minimum required fields
    return (data.title && data.author) ? data : null
  } catch (error) {
    console.warn('[extract-text-metadata] Frontmatter parsing failed:', error)
    return null
  }
}
