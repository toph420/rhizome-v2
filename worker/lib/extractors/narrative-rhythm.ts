/**
 * Narrative rhythm analyzer for writing style detection.
 * Identifies sentence patterns, paragraph structure, and style transitions.
 */

import type { NarrativeMetadata } from '../../types/metadata'

/**
 * Analyzes narrative rhythm and writing style.
 * Measures sentence variation, paragraph flow, and style consistency.
 * 
 * @param content - The text content to analyze  
 * @param aiAnalysis - Optional AI-enhanced rhythm analysis
 * @returns Narrative metadata with rhythm metrics and style fingerprint
 */
export async function analyzeNarrativeRhythm(
  content: string,
  aiAnalysis?: AINarrativeAnalysis
): Promise<NarrativeMetadata> {
  const startTime = Date.now()
  
  // Analyze narrative components in parallel
  const [
    sentenceMetrics,
    paragraphMetrics,
    rhythmPattern,
    styleTransitions,
    readabilityScore
  ] = await Promise.all([
    analyzeSentenceMetrics(content),
    analyzeParagraphMetrics(content),
    detectRhythmPattern(content),
    detectStyleTransitions(content),
    calculateReadability(content)
  ])
  
  // Create style fingerprint
  const styleFingerprint = createStyleFingerprint({
    sentenceMetrics,
    paragraphMetrics,
    rhythmPattern
  })
  
  // Calculate confidence
  const confidence = calculateRhythmConfidence(content, sentenceMetrics)
  
  // Ensure performance target met (<300ms)
  const elapsed = Date.now() - startTime
  if (elapsed > 300) {
    console.warn(`Rhythm analysis took ${elapsed}ms (target: <300ms)`)
  }
  
  return {
    sentenceRhythm: {
      avgLength: sentenceMetrics.avgLength,
      variance: sentenceMetrics.variation,
      pattern: rhythmPattern as 'uniform' | 'varied' | 'escalating' | 'diminishing'
    },
    paragraphStructure: {
      avgSentences: paragraphMetrics.avgLength, // avgLength is sentences per paragraph
      avgWords: Math.round(paragraphMetrics.avgLength * 15), // Estimate ~15 words per sentence
      transitions: paragraphMetrics.transitions
    },
    style: {
      formality: aiAnalysis?.formality ?? 0.5,
      technicality: aiAnalysis?.technicality ?? 0.5,
      verbosity: calculateVerbosity(sentenceMetrics)
    },
    fingerprint: styleFingerprint,
    transitions: styleTransitions,
    confidence
  }
}

/**
 * Analyzes sentence-level metrics.
 */
async function analyzeSentenceMetrics(content: string): Promise<{
  avgLength: number
  variation: number
  complexity: number
}> {
  // Split into sentences (basic splitting, could be improved)
  const sentences = content.match(/[^.!?]+[.!?]+/g) || []
  
  if (sentences.length === 0) {
    return { avgLength: 0, variation: 0, complexity: 0 }
  }
  
  // Calculate sentence lengths
  const lengths = sentences.map(s => s.trim().split(/\s+/).length)
  
  // Average length
  const avgLength = lengths.reduce((a, b) => a + b, 0) / lengths.length
  
  // Variation (standard deviation)
  const variance = lengths.reduce((sum, len) => 
    sum + Math.pow(len - avgLength, 2), 0
  ) / lengths.length
  const variation = Math.sqrt(variance)
  
  // Complexity (based on subordinate clauses, commas, semicolons)
  let complexityScore = 0
  for (const sentence of sentences) {
    complexityScore += (sentence.match(/,/g) || []).length * 0.3
    complexityScore += (sentence.match(/;/g) || []).length * 0.5
    complexityScore += (sentence.match(/\b(which|that|who|whom|whose|where|when)\b/gi) || []).length * 0.4
  }
  const complexity = Math.min(1, complexityScore / sentences.length)
  
  return {
    avgLength: Math.round(avgLength * 10) / 10,
    variation: Math.round(variation * 10) / 10,
    complexity: Math.round(complexity * 100) / 100
  }
}

/**
 * Analyzes paragraph-level metrics.
 */
async function analyzeParagraphMetrics(content: string): Promise<{
  avgLength: number
  structure: 'short' | 'medium' | 'long' | 'mixed'
  transitions: number
}> {
  // Split into paragraphs
  const paragraphs = content.split(/\n\n+/).filter(p => p.trim().length > 0)
  
  if (paragraphs.length === 0) {
    return { avgLength: 0, structure: 'short', transitions: 0 }
  }
  
  // Calculate paragraph lengths (in sentences)
  const lengths = paragraphs.map(p => {
    const sentences = p.match(/[^.!?]+[.!?]+/g) || []
    return sentences.length
  })
  
  // Average length
  const avgLength = lengths.reduce((a, b) => a + b, 0) / lengths.length
  
  // Determine structure type
  let structure: 'short' | 'medium' | 'long' | 'mixed'
  if (avgLength < 3) {
    structure = 'short'
  } else if (avgLength < 6) {
    structure = 'medium'
  } else if (avgLength >= 6) {
    structure = 'long'
  } else {
    structure = 'mixed'
  }
  
  // Check for mixed structure
  const hasShort = lengths.some(l => l <= 2)
  const hasLong = lengths.some(l => l >= 6)
  if (hasShort && hasLong) {
    structure = 'mixed'
  }
  
  // Count transition signals
  const transitionWords = /\b(however|therefore|furthermore|moreover|nevertheless|consequently|additionally|finally|meanwhile|subsequently)\b/gi
  const transitions = (content.match(transitionWords) || []).length
  
  return {
    avgLength: Math.round(avgLength * 10) / 10,
    structure,
    transitions
  }
}

/**
 * Detects rhythm pattern in the text.
 */
async function detectRhythmPattern(content: string): Promise<'uniform' | 'varied' | 'escalating' | 'diminishing'> {
  const sentences = content.match(/[^.!?]+[.!?]+/g) || []
  
  if (sentences.length < 3) {
    return 'uniform'
  }
  
  // Calculate sentence lengths
  const lengths = sentences.map(s => s.trim().split(/\s+/).length)
  
  // Analyze progression
  let increasing = 0
  let decreasing = 0
  
  for (let i = 1; i < lengths.length; i++) {
    if (lengths[i] > lengths[i - 1]) increasing++
    if (lengths[i] < lengths[i - 1]) decreasing++
  }
  
  const changeRatio = Math.abs(increasing - decreasing) / lengths.length
  
  // Determine pattern
  if (changeRatio < 0.2) {
    // Calculate variation
    const avgLength = lengths.reduce((a, b) => a + b, 0) / lengths.length
    const variance = lengths.reduce((sum, len) => 
      sum + Math.pow(len - avgLength, 2), 0
    ) / lengths.length
    const stdDev = Math.sqrt(variance)
    
    return stdDev > avgLength * 0.5 ? 'varied' : 'uniform'
  } else if (increasing > decreasing * 1.5) {
    return 'escalating'
  } else if (decreasing > increasing * 1.5) {
    return 'diminishing'
  } else {
    return 'varied'
  }
}

/**
 * Detects style transitions in content.
 */
async function detectStyleTransitions(content: string): Promise<number> {
  let transitions = 0
  
  // Transition markers
  const transitionMarkers = [
    /\b(however|but|yet|although|though|nevertheless|nonetheless)\b/gi,
    /\b(on the other hand|in contrast|conversely|alternatively)\b/gi,
    /\b(suddenly|unexpectedly|surprisingly|remarkably)\b/gi,
    /\b(first|second|third|finally|lastly|in conclusion)\b/gi
  ]
  
  for (const marker of transitionMarkers) {
    transitions += (content.match(marker) || []).length
  }
  
  // Check for tone shifts (formal to informal or vice versa)
  const formalWords = /\b(therefore|furthermore|consequently|accordingly|notwithstanding)\b/gi
  const informalWords = /\b(anyway|basically|actually|just|really|pretty|kind of|sort of)\b/gi
  
  const formalCount = (content.match(formalWords) || []).length
  const informalCount = (content.match(informalWords) || []).length
  
  // If both formal and informal present, likely has transitions
  if (formalCount > 2 && informalCount > 2) {
    transitions += 2
  }
  
  return transitions
}

/**
 * Calculates readability score (simplified Flesch-Kincaid).
 */
async function calculateReadability(content: string): Promise<number> {
  const sentences = content.match(/[^.!?]+[.!?]+/g) || []
  const words = content.split(/\s+/).filter(w => w.length > 0)
  
  if (sentences.length === 0 || words.length === 0) {
    return 0.5 // Neutral readability
  }
  
  // Count syllables (simplified: count vowel groups)
  let totalSyllables = 0
  for (const word of words) {
    const syllables = word.toLowerCase().match(/[aeiou]+/g) || []
    totalSyllables += Math.max(1, syllables.length)
  }
  
  // Flesch Reading Ease formula (simplified)
  const avgWordsPerSentence = words.length / sentences.length
  const avgSyllablesPerWord = totalSyllables / words.length
  
  // Modified formula to return 0-1 score
  let readability = 1 - ((avgWordsPerSentence * 0.02) + (avgSyllablesPerWord * 0.1))
  
  return Math.max(0, Math.min(1, readability))
}

/**
 * Creates a unique style fingerprint.
 */
function createStyleFingerprint(metrics: {
  sentenceMetrics: { avgLength: number; variation: number; complexity: number }
  paragraphMetrics: { avgLength: number; structure: string; transitions: number }
  rhythmPattern: string
}): string {
  // Create a hash-like fingerprint from style characteristics
  const components = [
    `SL${Math.round(metrics.sentenceMetrics.avgLength)}`,
    `SV${Math.round(metrics.sentenceMetrics.variation * 10)}`,
    `SC${Math.round(metrics.sentenceMetrics.complexity * 100)}`,
    `PL${Math.round(metrics.paragraphMetrics.avgLength)}`,
    `PS${metrics.paragraphMetrics.structure.substring(0, 2).toUpperCase()}`,
    `RP${metrics.rhythmPattern.substring(0, 2).toUpperCase()}`
  ]
  
  return components.join('-')
}

/**
 * Calculates confidence in rhythm analysis.
 */
function calculateRhythmConfidence(
  content: string,
  sentenceMetrics: { avgLength: number; variation: number; complexity: number }
): number {
  let confidence = 0.5 // Base confidence
  
  // Check content length
  const wordCount = content.split(/\s+/).length
  const sentenceCount = (content.match(/[^.!?]+[.!?]+/g) || []).length
  
  if (wordCount < 50) {
    confidence -= 0.2 // Too short for reliable rhythm
  } else if (wordCount > 200) {
    confidence += 0.15 // Good sample size
  }
  
  if (sentenceCount < 3) {
    confidence -= 0.2 // Too few sentences
  } else if (sentenceCount > 10) {
    confidence += 0.1 // Good sentence variety
  }
  
  // Clear patterns increase confidence
  if (sentenceMetrics.variation > 5) {
    confidence += 0.1 // Clear variation pattern
  }
  
  if (sentenceMetrics.complexity > 0.3) {
    confidence += 0.05 // Complex structure detected
  }
  
  return Math.max(0, Math.min(1, confidence))
}

/**
 * Calculates verbosity score based on sentence metrics.
 */
function calculateVerbosity(sentenceMetrics: { avgLength: number; variation: number; complexity: number }): number {
  // Normalize average sentence length (15-25 words is typical)
  const lengthScore = Math.min(1, Math.max(0, (sentenceMetrics.avgLength - 10) / 30))
  
  // Higher complexity often means more verbose
  const complexityScore = sentenceMetrics.complexity
  
  // Combine scores
  return (lengthScore * 0.7 + complexityScore * 0.3)
}

/**
 * Optional AI-enhanced narrative analysis.
 */
export interface AINarrativeAnalysis {
  writingStyle?: 'academic' | 'casual' | 'formal' | 'creative' | 'technical'
  voice?: 'active' | 'passive' | 'mixed'
  tense?: 'past' | 'present' | 'future' | 'mixed'
  perspective?: 'first' | 'second' | 'third' | 'mixed'
  formality?: number
  technicality?: number
}