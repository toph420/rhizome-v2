import { generateText } from 'ai'
import { google } from '@ai-sdk/google'

/**
 * Generate a concise title for a spark using AI
 * Falls back to first 3 words if AI fails
 *
 * @param content - Spark content to generate title from
 * @returns Slugified title (lowercase, hyphenated, max 50 chars)
 */
export async function generateSparkTitle(content: string): Promise<string> {
  try {
    const { text } = await generateText({
      model: google('gemini-2.0-flash-exp'),
      prompt: `Generate a concise 3-5 word title for this thought (lowercase, no punctuation):

"${content.slice(0, 200)}"

Return ONLY the title, nothing else.`
    })

    return slugify(text.trim().toLowerCase())
  } catch (error) {
    console.warn('[Sparks] AI title generation failed, using fallback:', error)
    // Fallback: first 3 words
    const words = content.trim().split(/\s+/).slice(0, 3)
    return slugify(words.join(' '))
  }
}

/**
 * Convert text to URL-safe slug
 * - Lowercase
 * - Replace non-alphanumeric with hyphens
 * - Remove leading/trailing hyphens
 * - Max 50 characters
 */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50)  // Max 50 chars
}

/**
 * Generate Storage filename for a spark
 * Format: {date}-spark-{title}.json
 * Example: 2025-01-21-spark-privacy-concerns.json
 */
export function generateSparkFilename(title: string): string {
  const date = new Date().toISOString().split('T')[0]  // YYYY-MM-DD
  return `${date}-spark-${slugify(title)}.json`
}
