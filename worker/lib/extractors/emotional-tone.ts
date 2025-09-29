/**
 * Emotional tone analyzer for sentiment and mood detection.
 * Identifies primary emotions, polarity, and emotional complexity.
 */

import type { 
  EmotionalMetadata, 
  EmotionType 
} from '../../types/metadata'

/**
 * Analyzes emotional tone and sentiment in text content.
 * Uses linguistic patterns and AI enhancement for accurate detection.
 * 
 * @param content - The text content to analyze
 * @param aiAnalysis - Optional AI-enhanced sentiment analysis
 * @returns Emotional metadata with sentiment scores and confidence
 */
export async function analyzeEmotionalTone(
  content: string,
  aiAnalysis?: AIEmotionalAnalysis
): Promise<EmotionalMetadata> {
  const startTime = Date.now()
  
  // Run sentiment analysis components in parallel
  const [
    primaryEmotion,
    polarity,
    intensity,
    secondaryEmotions,
    transitions
  ] = await Promise.all([
    detectPrimaryEmotion(content, aiAnalysis),
    calculatePolarity(content, aiAnalysis),
    calculateIntensity(content),
    detectSecondaryEmotions(content, aiAnalysis),
    detectEmotionalTransitions(content)
  ])
  
  // Calculate confidence based on signal clarity
  const confidence = calculateEmotionalConfidence(
    content,
    polarity,
    intensity,
    secondaryEmotions
  )
  
  // Ensure performance target met (<300ms)
  const elapsed = Date.now() - startTime
  if (elapsed > 300) {
    console.warn(`Emotional analysis took ${elapsed}ms (target: <300ms)`)
  }
  
  return {
    primaryEmotion,
    polarity,
    intensity,
    secondaryEmotions,
    transitions,
    confidence
  }
}

/**
 * Detects the primary emotion in the content.
 */
async function detectPrimaryEmotion(
  content: string,
  aiAnalysis?: AIEmotionalAnalysis
): Promise<EmotionType> {
  // Use AI analysis if available and reliable
  if (aiAnalysis?.primaryEmotion && aiAnalysis.confidence && aiAnalysis.confidence > 0.7) {
    return aiAnalysis.primaryEmotion
  }
  
  // Emotion keyword patterns (Plutchik's wheel based)
  const emotionPatterns: Record<EmotionType, RegExp[]> = {
    joy: [
      /\b(happy|joy|delight|pleased|cheerful|elated|excited|wonderful|amazing|fantastic|great|excellent|love|lovely|beautiful)\b/gi,
      /\b(celebrate|success|achieve|win|victory|triumph)\b/gi,
      /[😊😃😄😁🎉🎊✨💖]/g
    ],
    trust: [
      /\b(trust|confident|reliable|depend|faith|believe|secure|assured|certain|guarantee|promise)\b/gi,
      /\b(professional|authentic|genuine|honest|transparent)\b/gi
    ],
    fear: [
      /\b(fear|afraid|scared|terrified|anxious|worry|nervous|panic|threat|danger|risk|concern)\b/gi,
      /\b(uncertain|unsure|doubt|hesitant)\b/gi,
      /[😰😨😱😟]/g
    ],
    surprise: [
      /\b(surprise|amazing|unexpected|sudden|astonish|shock|wow|unbelievable|incredible|remarkable)\b/gi,
      /[!]{2,}/g,
      /[😮😲🤯]/g
    ],
    sadness: [
      /\b(sad|unhappy|depressed|miserable|sorry|regret|disappoint|grief|mourn|tragic|terrible|awful)\b/gi,
      /\b(lost|loss|miss|lonely|empty)\b/gi,
      /[😢😭😔😞]/g
    ],
    disgust: [
      /\b(disgust|disgusting|revolting|repulsive|gross|nasty|awful|terrible|hate|despise|loathe)\b/gi,
      /\b(unacceptable|inappropriate|wrong)\b/gi,
      /[🤢🤮😤]/g
    ],
    anger: [
      /\b(angry|mad|furious|rage|irritated|annoyed|frustrated|upset|outrage|hostile|aggressive)\b/gi,
      /\b(unfair|injustice|wrong|stupid|ridiculous)\b/gi,
      /[😠😡🤬]/g
    ],
    anticipation: [
      /\b(anticipate|expect|hope|look forward|plan|prepare|ready|eager|excited about|waiting|upcoming|future)\b/gi,
      /\b(will|going to|soon|tomorrow|next)\b/gi
    ],
    neutral: [
      /\b(factual|objective|information|data|report|describe|explain|define|state|present)\b/gi,
      /\b(however|therefore|thus|hence|moreover|furthermore)\b/gi
    ],
    mixed: [] // Detected when multiple strong emotions present
  }
  
  // Count emotion signals
  const emotionScores: Record<EmotionType, number> = {
    joy: 0, trust: 0, fear: 0, surprise: 0,
    sadness: 0, disgust: 0, anger: 0, anticipation: 0,
    neutral: 0, mixed: 0
  }
  
  // Calculate scores for each emotion
  for (const [emotion, patterns] of Object.entries(emotionPatterns) as Array<[EmotionType, RegExp[]]>) {
    for (const pattern of patterns) {
      const matches = content.match(pattern) || []
      emotionScores[emotion] += matches.length
    }
  }
  
  // Normalize scores by content length
  const wordCount = content.split(/\s+/).length
  for (const emotion in emotionScores) {
    emotionScores[emotion as EmotionType] = emotionScores[emotion as EmotionType] / Math.max(wordCount / 100, 1)
  }
  
  // Find dominant emotion
  let maxScore = 0
  let primaryEmotion: EmotionType = 'neutral'
  let secondHighest = 0
  
  for (const [emotion, score] of Object.entries(emotionScores) as Array<[EmotionType, number]>) {
    if (score > maxScore) {
      secondHighest = maxScore
      maxScore = score
      primaryEmotion = emotion
    } else if (score > secondHighest) {
      secondHighest = score
    }
  }
  
  // Check for mixed emotions (multiple strong signals)
  if (maxScore > 0 && secondHighest > 0 && secondHighest / maxScore > 0.7) {
    return 'mixed'
  }
  
  // Default to neutral if no clear emotion
  if (maxScore < 0.5) {
    return 'neutral'
  }
  
  return primaryEmotion
}

/**
 * Calculates sentiment polarity from -1 (negative) to +1 (positive).
 */
async function calculatePolarity(
  content: string,
  aiAnalysis?: AIEmotionalAnalysis
): Promise<number> {
  // Use AI analysis if available
  if (aiAnalysis?.polarity !== undefined) {
    return Math.max(-1, Math.min(1, aiAnalysis.polarity))
  }
  
  // Positive and negative word lists
  const positiveWords = /\b(good|great|excellent|amazing|wonderful|fantastic|love|perfect|best|happy|beautiful|brilliant|success|positive|improve|benefit|advantage|enjoy|pleased|thankful|grateful)\b/gi
  const negativeWords = /\b(bad|terrible|awful|horrible|worst|hate|fail|wrong|problem|issue|difficult|hard|unfortunate|negative|poor|weak|sad|angry|frustrated|disappointed|concern|worry)\b/gi
  
  // Negation patterns
  const negationPattern = /\b(not|no|never|neither|nor|n't|cannot|couldn't|wouldn't|shouldn't)\s+(\w+)/gi
  
  // Count positive and negative signals
  const positiveMatches = (content.match(positiveWords) || []).length
  const negativeMatches = (content.match(negativeWords) || []).length
  
  // Check for negations that flip polarity
  const negations = content.matchAll(negationPattern)
  let negationFlips = 0
  
  for (const negation of negations) {
    const negatedWord = negation[2].toLowerCase()
    if (positiveWords.test(negatedWord)) {
      negationFlips-- // Negated positive becomes negative
    } else if (negativeWords.test(negatedWord)) {
      negationFlips++ // Negated negative becomes positive
    }
  }
  
  // Calculate raw polarity
  const totalSignals = positiveMatches + negativeMatches
  if (totalSignals === 0) return 0
  
  const adjustedPositive = positiveMatches + negationFlips
  const adjustedNegative = negativeMatches - negationFlips
  
  // Calculate polarity score (-1 to +1)
  const polarity = (adjustedPositive - adjustedNegative) / totalSignals
  
  return Math.max(-1, Math.min(1, polarity))
}

/**
 * Calculates emotional intensity from 0 (low) to 1 (high).
 */
async function calculateIntensity(content: string): Promise<number> {
  let intensity = 0.3 // Base intensity
  
  // Intensity indicators
  const intensifiers = {
    high: [
      /\b(very|extremely|incredibly|absolutely|totally|completely|utterly|really|so)\b/gi,
      /[A-Z]{3,}/g, // CAPS for emphasis
      /[!]{2,}/g, // Multiple exclamation marks
      /\b(always|never|everyone|no one|everything|nothing)\b/gi // Absolutes
    ],
    moderate: [
      /\b(quite|rather|fairly|pretty|somewhat|mostly|generally|usually)\b/gi,
      /[!]/g // Single exclamation
    ],
    low: [
      /\b(slightly|barely|hardly|scarcely|mildly|somewhat|perhaps|maybe)\b/gi,
      /\b(might|could|possibly|probably)\b/gi
    ]
  }
  
  // Count intensity signals
  let highCount = 0
  let moderateCount = 0
  let lowCount = 0
  
  for (const pattern of intensifiers.high) {
    highCount += (content.match(pattern) || []).length
  }
  for (const pattern of intensifiers.moderate) {
    moderateCount += (content.match(pattern) || []).length
  }
  for (const pattern of intensifiers.low) {
    lowCount += (content.match(pattern) || []).length
  }
  
  // Adjust intensity based on signals
  const wordCount = content.split(/\s+/).length
  const signalDensity = (highCount * 3 + moderateCount * 2 + lowCount) / Math.max(wordCount, 1)
  
  // Calculate intensity (0-1)
  intensity = Math.min(1, 0.3 + signalDensity * 10)
  
  // Check for emotional punctuation
  if (/[!?]{2,}/.test(content)) intensity += 0.1
  if (/[\u{1F600}-\u{1F64F}]/u.test(content)) intensity += 0.1 // Emojis indicate emotion
  
  return Math.max(0, Math.min(1, intensity))
}

/**
 * Detects secondary emotions present in the content.
 */
async function detectSecondaryEmotions(
  content: string,
  aiAnalysis?: AIEmotionalAnalysis
): Promise<Array<{ emotion: EmotionType; strength: number }>> {
  // Use AI analysis if available
  if (aiAnalysis?.secondaryEmotions && aiAnalysis.secondaryEmotions.length > 0) {
    return aiAnalysis.secondaryEmotions
  }
  
  // Reuse emotion detection logic but return multiple results
  const emotionPatterns: Record<EmotionType, RegExp[]> = {
    joy: [/\b(happy|joy|pleased|cheerful|excited|love)\b/gi],
    trust: [/\b(trust|confident|reliable|believe|secure)\b/gi],
    fear: [/\b(fear|afraid|scared|anxious|worry|nervous)\b/gi],
    surprise: [/\b(surprise|amazing|unexpected|astonish|shock)\b/gi],
    sadness: [/\b(sad|unhappy|depressed|sorry|regret|disappoint)\b/gi],
    disgust: [/\b(disgust|revolting|gross|hate|despise)\b/gi],
    anger: [/\b(angry|mad|furious|irritated|frustrated|upset)\b/gi],
    anticipation: [/\b(anticipate|expect|hope|plan|eager|waiting)\b/gi],
    neutral: [],
    mixed: []
  }
  
  const emotionScores: Array<{ emotion: EmotionType; strength: number }> = []
  const wordCount = content.split(/\s+/).length
  
  for (const [emotion, patterns] of Object.entries(emotionPatterns) as Array<[EmotionType, RegExp[]]>) {
    if (emotion === 'neutral' || emotion === 'mixed') continue
    
    let score = 0
    for (const pattern of patterns) {
      score += (content.match(pattern) || []).length
    }
    
    if (score > 0) {
      emotionScores.push({
        emotion,
        strength: Math.min(1, score / (wordCount / 50))
      })
    }
  }
  
  // Sort by strength and return top secondary emotions
  return emotionScores
    .sort((a, b) => b.strength - a.strength)
    .slice(1, 4) // Skip primary (index 0), take next 3
    .filter(e => e.strength > 0.1) // Filter weak signals
}

/**
 * Detects emotional transitions in the content.
 */
async function detectEmotionalTransitions(content: string): Promise<number> {
  // Split content into sentences
  const sentences = content.match(/[^.!?]+[.!?]+/g) || []
  if (sentences.length < 2) return 0
  
  // Transition markers
  const transitionWords = /\b(but|however|although|though|yet|still|nevertheless|nonetheless|conversely|unfortunately|fortunately|suddenly|surprisingly)\b/gi
  
  // Count explicit transitions
  const explicitTransitions = (content.match(transitionWords) || []).length
  
  // Detect polarity shifts between sentences
  let polarityShifts = 0
  let previousPolarity = 0
  
  for (const sentence of sentences) {
    const polarity = await calculatePolarity(sentence)
    if (previousPolarity !== 0 && Math.sign(polarity) !== Math.sign(previousPolarity)) {
      polarityShifts++
    }
    previousPolarity = polarity
  }
  
  return explicitTransitions + polarityShifts
}

/**
 * Calculates confidence in emotional analysis.
 */
function calculateEmotionalConfidence(
  content: string,
  polarity: number,
  intensity: number,
  secondaryEmotions: Array<{ emotion: EmotionType; strength: number }>
): number {
  let confidence = 0.5 // Base confidence
  
  // Short content has less reliable emotion
  const wordCount = content.split(/\s+/).length
  if (wordCount < 20) {
    confidence -= 0.2
  } else if (wordCount > 50) {
    confidence += 0.1
  }
  
  // Clear polarity increases confidence
  if (Math.abs(polarity) > 0.5) {
    confidence += 0.15
  }
  
  // High intensity with clear polarity is more confident
  if (intensity > 0.6 && Math.abs(polarity) > 0.3) {
    confidence += 0.1
  }
  
  // Multiple emotions decrease confidence (mixed signals)
  if (secondaryEmotions.length > 2) {
    confidence -= 0.1
  }
  
  // Very neutral content has lower confidence in emotion detection
  if (Math.abs(polarity) < 0.1 && intensity < 0.3) {
    confidence -= 0.1
  }
  
  return Math.max(0, Math.min(1, confidence))
}

/**
 * Optional AI-enhanced emotional analysis results.
 */
export interface AIEmotionalAnalysis {
  primaryEmotion?: EmotionType
  polarity?: number
  secondaryEmotions?: Array<{
    emotion: EmotionType
    strength: number
  }>
  emotionalComplexity?: 'simple' | 'moderate' | 'complex'
  confidence?: number
}