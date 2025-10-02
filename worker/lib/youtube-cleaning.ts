import { GoogleGenAI } from '@google/genai'
import { GEMINI_MODEL, MAX_OUTPUT_TOKENS } from './model-config.js'

/**
 * Result from YouTube transcript cleaning operation.
 */
export interface CleaningResult {
  cleaned: string
  success: boolean
  error?: string
}

/**
 * Prompt for cleaning YouTube transcripts with AI.
 * Removes timestamps and fixes formatting issues from YouTube transcript API.
 */
const YOUTUBE_CLEANING_PROMPT = `Clean this YouTube transcript by removing timestamps and fixing formatting issues.

CRITICAL TASKS:
1. DELETE all timestamp patterns like [[00:01](https://youtube.com/watch?v=...)] or [[MM:SS](url)]
2. DECODE HTML entities (&amp;gt; becomes >, &amp;lt; becomes <, &amp;amp; becomes &, etc.)
3. FIX line breaks: Combine fragments into natural sentences and paragraphs
4. DO NOT remove filler words (um, uh, like, you know) - keep the natural speech style
5. DO NOT fix grammar or spelling errors - keep words as spoken
6. DO NOT summarize or rewrite - preserve exact wording and meaning
7. DO NOT add section headings

Example transformation:
BEFORE: "&amp;gt;&amp;gt; So, all radical movements\n\nare built on quote unquote\n\nthe blood of martyrs"
AFTER: ">> So, all radical movements are built on quote unquote the blood of martyrs"

The output may be 30-90% of original length depending on timestamp density.

Return ONLY the cleaned transcript. No preamble, no explanation.`

/**
 * Cleans YouTube transcript using Gemini AI with graceful degradation.
 * Removes timestamp links, decodes HTML entities, and fixes line break formatting.
 * Preserves natural speech style (filler words, grammar as-spoken).
 * Always returns usable content - falls back to original on any failure.
 * 
 * @param ai - GoogleGenAI client instance
 * @param rawMarkdown - Raw transcript markdown with timestamps, HTML entities, broken line breaks
 * @returns CleaningResult with cleaned content or original on failure
 * @throws Never throws - all errors handled gracefully with fallback
 * 
 * @example
 * const result = await cleanYoutubeTranscript(ai, rawMarkdown)
 * if (result.success) {
 *   console.log('Cleaned successfully')
 * } else {
 *   console.warn('Using original:', result.error)
 * }
 */
export async function cleanYoutubeTranscript(
  ai: GoogleGenAI,
  rawMarkdown: string
): Promise<CleaningResult> {
  try {
    // Validate input
    if (!rawMarkdown || rawMarkdown.trim().length === 0) {
      return {
        cleaned: rawMarkdown,
        success: false,
        error: 'Empty transcript provided'
      }
    }

    const originalLength = rawMarkdown.length
    console.log(`🧹 Starting AI cleaning for ${originalLength} character transcript...`)

    // Call Gemini API for cleaning with timeout protection
    const cleaningPromise = ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: [{
        parts: [{
          text: `${YOUTUBE_CLEANING_PROMPT}\n\nTranscript:\n${rawMarkdown}`
        }]
      }],
      config: {
        temperature: 0.3,
        maxOutputTokens: MAX_OUTPUT_TOKENS
      }
    })

    // Add 60-second timeout to prevent hanging
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('AI cleaning timeout after 60 seconds')), 60000)
    })

    const result = await Promise.race([cleaningPromise, timeoutPromise])
    console.log(`✅ AI cleaning completed successfully`)

    const cleanedText = result.text
    
    // Check for empty response
    if (!cleanedText || cleanedText.trim().length === 0) {
      console.warn('AI returned empty response, using original transcript')
      return {
        cleaned: rawMarkdown,
        success: false,
        error: 'AI returned empty response'
      }
    }
    
    // Length sanity check with dynamic threshold based on timestamp density
    // Calculate expected minimum length by estimating timestamp overhead
    const timestampPattern = /\[\[\d{1,2}:\d{2}\]\([^)]+\)\]/g
    const timestampMatches = rawMarkdown.match(timestampPattern) || []
    
    // Calculate average timestamp length from actual matches (more accurate than fixed estimate)
    const avgTimestampLength = timestampMatches.length > 0
      ? timestampMatches.reduce((sum, ts) => sum + ts.length, 0) / timestampMatches.length
      : 60 // fallback estimate
    
    const estimatedTimestampChars = timestampMatches.length * avgTimestampLength
    const estimatedContentChars = Math.max(0, originalLength - estimatedTimestampChars) // prevent negative
    
    // Minimum valid length: at least 60% of estimated content (allows some AI condensing)
    // When timestamps are detected, use estimate-based validation (more accurate)
    // When no timestamps, use conservative ratio-based validation
    // For very short transcripts (<100 chars), be more lenient
    // Maximum valid length: no more than original (can't add content)
    const baselineMinRatio = originalLength < 100 ? 0.10 : 0.15
    const minExpectedLength = timestampMatches.length > 3
      ? Math.max(estimatedContentChars * 0.6, originalLength * 0.10) // Trust estimate when many timestamps
      : originalLength * baselineMinRatio // Conservative when few/no timestamps
    
    const cleanedLength = cleanedText.length
    const lengthRatio = cleanedLength / originalLength
    
    if (cleanedLength < minExpectedLength || cleanedLength > originalLength) {
      console.warn(
        `Suspicious length change detected (${lengthRatio.toFixed(2)}x). ` +
        `Original: ${originalLength} chars, Cleaned: ${cleanedLength} chars, ` +
        `Timestamps found: ${timestampMatches.length}, Min expected: ${Math.round(minExpectedLength)} chars`
      )
      return {
        cleaned: rawMarkdown,
        success: false,
        error: `Suspicious length change: ${lengthRatio.toFixed(2)}x original`
      }
    }
    
    // Success - return cleaned content
    console.log(
      `YouTube transcript cleaned successfully. ` +
      `Original: ${originalLength} chars, Cleaned: ${cleanedLength} chars (${lengthRatio.toFixed(2)}x)`
    )
    
    return {
      cleaned: cleanedText,
      success: true
    }
    
  } catch (error) {
    // Graceful degradation: Always return original on error
    const err = error instanceof Error ? error : new Error('Unknown error')
    const isTimeout = err.message.includes('timeout')

    console.error(
      `❌ YouTube cleaning ${isTimeout ? 'TIMEOUT' : 'ERROR'}: ${err.message}`,
      isTimeout ? '(Gemini API took >60s to respond)' : ''
    )
    console.warn('⚠️  Falling back to original transcript without cleaning')

    return {
      cleaned: rawMarkdown,
      success: false,
      error: err.message
    }
  }
}