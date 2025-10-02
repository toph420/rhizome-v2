/**
 * AI prompts for enhanced emotional tone analysis.
 * Provides clear instructions for sentiment and emotion detection.
 */

import type { EmotionType } from '../../../types/metadata'

/**
 * Generates a prompt for emotional tone analysis.
 * 
 * @param content - The text content to analyze
 * @returns Formatted prompt for emotional analysis
 */
export function generateEmotionalPrompt(content: string): string {
  return `Analyze the emotional tone and sentiment in the following text. Consider:

1. **Primary Emotion**: Identify the dominant emotion using Plutchik's wheel categories:
   - joy, trust, fear, surprise, sadness, disgust, anger, anticipation
   - Use 'neutral' for factual/objective content
   - Use 'mixed' when multiple strong emotions are equally present

2. **Sentiment Polarity**: Rate from -1.0 (very negative) to +1.0 (very positive)
   - Consider context and nuance, not just keyword counts
   - Account for sarcasm, irony, and negations

3. **Secondary Emotions**: List up to 3 other emotions present with their strength (0.0-1.0)

4. **Emotional Complexity**: Rate as 'simple', 'moderate', or 'complex' based on:
   - Number of different emotions present
   - Emotional transitions or contrasts
   - Subtlety and nuance of expression

Text to analyze:
"""
${content}
"""

Respond in JSON format:
{
  "primaryEmotion": "emotion_name",
  "polarity": -1.0 to 1.0,
  "secondaryEmotions": [
    {"emotion": "emotion_name", "strength": 0.0-1.0}
  ],
  "emotionalComplexity": "simple|moderate|complex",
  "confidence": 0.0-1.0,
  "reasoning": "brief explanation of your analysis"
}

Focus on the emotional content and tone, not the factual information. Be precise with polarity scores.`
}

/**
 * Generates a prompt for sentiment polarity analysis.
 * 
 * @param content - The text content to analyze
 * @returns Formatted prompt for polarity detection
 */
export function generatePolarityPrompt(content: string): string {
  return `Analyze the sentiment polarity of this text on a scale from -1.0 (very negative) to +1.0 (very positive).

Consider:
- Overall tone and mood
- Positive vs negative language
- Context and implied sentiment
- Negations that flip meaning ("not bad" = slightly positive)
- Sarcasm or irony if detectable

Text:
"""
${content}
"""

Return a single number between -1.0 and 1.0. Consider:
- -1.0 to -0.6: Very negative
- -0.6 to -0.2: Negative
- -0.2 to 0.2: Neutral/Mixed
- 0.2 to 0.6: Positive
- 0.6 to 1.0: Very positive`
}

/**
 * Generates a prompt for emotion intensity analysis.
 * 
 * @param content - The text content to analyze
 * @param emotion - The detected primary emotion
 * @returns Formatted prompt for intensity measurement
 */
export function generateIntensityPrompt(
  content: string,
  emotion: EmotionType
): string {
  return `Rate the intensity of the ${emotion} emotion in this text from 0.0 (barely present) to 1.0 (extremely intense).

Consider:
- Use of intensifiers (very, extremely, absolutely)
- Punctuation and capitalization for emphasis
- Repetition and redundancy
- Emotional language density
- Restraint vs expressiveness

Text:
"""
${content}
"""

Return a single number between 0.0 and 1.0 representing emotional intensity.`
}

/**
 * Example responses for testing and validation.
 */
export const EXAMPLE_RESPONSES = {
  emotional: {
    primaryEmotion: 'joy' as EmotionType,
    polarity: 0.75,
    secondaryEmotions: [
      { emotion: 'anticipation' as EmotionType, strength: 0.4 },
      { emotion: 'trust' as EmotionType, strength: 0.3 }
    ],
    emotionalComplexity: 'moderate' as const,
    confidence: 0.85,
    reasoning: 'Predominantly positive language with expressions of happiness and forward-looking statements'
  },
  
  polarity: 0.65,
  
  intensity: 0.7
}

/**
 * Validates AI response for emotional analysis.
 * 
 * @param response - The AI response to validate
 * @returns True if response is valid
 */
export function validateEmotionalResponse(response: any): boolean {
  if (!response || typeof response !== 'object') return false
  
  // Check primary emotion
  const validEmotions: EmotionType[] = [
    'joy', 'trust', 'fear', 'surprise', 'sadness', 
    'disgust', 'anger', 'anticipation', 'neutral', 'mixed'
  ]
  if (!validEmotions.includes(response.primaryEmotion)) return false
  
  // Check polarity
  if (typeof response.polarity !== 'number') return false
  if (response.polarity < -1 || response.polarity > 1) return false
  
  // Check secondary emotions if present
  if (response.secondaryEmotions) {
    if (!Array.isArray(response.secondaryEmotions)) return false
    
    for (const secondary of response.secondaryEmotions) {
      if (!validEmotions.includes(secondary.emotion)) return false
      if (typeof secondary.strength !== 'number') return false
      if (secondary.strength < 0 || secondary.strength > 1) return false
    }
  }
  
  // Check complexity if present
  if (response.emotionalComplexity) {
    if (!['simple', 'moderate', 'complex'].includes(response.emotionalComplexity)) {
      return false
    }
  }
  
  // Check confidence if present
  if (response.confidence !== undefined) {
    if (typeof response.confidence !== 'number') return false
    if (response.confidence < 0 || response.confidence > 1) return false
  }
  
  return true
}

/**
 * Parses AI response into structured format.
 * 
 * @param response - Raw AI response
 * @returns Parsed emotional analysis or undefined
 */
export function parseEmotionalResponse(response: string): any {
  try {
    // Try to extract JSON from response
    const jsonMatch = response.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return undefined
    
    const parsed = JSON.parse(jsonMatch[0])
    
    if (validateEmotionalResponse(parsed)) {
      return parsed
    }
    
    return undefined
  } catch (error) {
    console.error('Failed to parse emotional response:', error)
    return undefined
  }
}

/**
 * Maps emotion to color for visualization.
 * 
 * @param emotion - The emotion type
 * @returns Hex color code
 */
export function getEmotionColor(emotion: EmotionType): string {
  const colorMap: Record<EmotionType, string> = {
    joy: '#FFD700',        // Gold
    trust: '#87CEEB',      // Sky blue
    fear: '#8B008B',       // Dark magenta
    surprise: '#FF69B4',   // Hot pink
    sadness: '#4682B4',    // Steel blue
    disgust: '#556B2F',    // Dark olive green
    anger: '#DC143C',      // Crimson
    anticipation: '#FF8C00', // Dark orange
    neutral: '#808080',    // Gray
    mixed: '#9370DB'       // Medium purple
  }
  
  return colorMap[emotion] || '#808080'
}