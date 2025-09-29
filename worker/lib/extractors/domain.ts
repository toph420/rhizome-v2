/**
 * Domain classification and technical depth analyzer.
 * Identifies domain-specific patterns, jargon, and academic indicators.
 */

import type { DomainMetadata, DomainType } from '../../types/metadata'

/**
 * Analyzes domain-specific metadata.
 * Classifies content domain, technical depth, and academic indicators.
 * 
 * @param content - The text content to analyze
 * @param aiAnalysis - Optional AI-enhanced domain analysis
 * @returns Domain metadata with classification and technical indicators
 */
export async function analyzeDomain(
  content: string,
  aiAnalysis?: AIDomainAnalysis
): Promise<DomainMetadata> {
  const startTime = Date.now()
  
  // Analyze domain components in parallel
  const [
    primaryDomain,
    secondaryDomains,
    technicalDepth,
    domainTerms,
    academicIndicators,
    jargonAnalysis
  ] = await Promise.all([
    detectPrimaryDomain(content, aiAnalysis),
    detectSecondaryDomains(content),
    calculateTechnicalDepth(content),
    extractDomainTerms(content),
    detectAcademicIndicators(content),
    analyzeJargon(content)
  ])
  
  // Calculate jargon density
  const wordCount = content.split(/\s+/).length
  const jargonDensity = (domainTerms.length / wordCount) * 100
  
  // Calculate confidence
  const confidence = calculateDomainConfidence(content, domainTerms.length)
  
  // Ensure performance target met (<250ms)
  const elapsed = Date.now() - startTime
  if (elapsed > 250) {
    console.warn(`Domain analysis took ${elapsed}ms (target: <250ms)`)
  }
  
  return {
    primaryDomain,
    secondaryDomains,
    technicalDepth,
    jargonDensity,
    domainTerms: domainTerms.slice(0, 20), // Limit to top 20 terms
    academic: academicIndicators,
    confidence
  }
}

/**
 * Detects the primary domain of the content.
 */
async function detectPrimaryDomain(
  content: string,
  aiAnalysis?: AIDomainAnalysis
): Promise<DomainType> {
  // If AI analysis provided a domain, use it
  if (aiAnalysis?.primaryDomain) {
    return aiAnalysis.primaryDomain
  }
  
  // Domain keyword mappings
  const domainKeywords: Record<DomainType, string[]> = {
    academic: ['research', 'study', 'hypothesis', 'methodology', 'literature review', 'abstract', 'conclusion', 'findings', 'analysis', 'theory'],
    technical: ['algorithm', 'implementation', 'architecture', 'system', 'framework', 'API', 'database', 'server', 'code', 'function', 'debug'],
    business: ['revenue', 'profit', 'strategy', 'market', 'customer', 'stakeholder', 'ROI', 'KPI', 'quarterly', 'growth', 'competitive'],
    creative: ['story', 'narrative', 'character', 'plot', 'theme', 'artistic', 'design', 'aesthetic', 'creative', 'imagination'],
    scientific: ['experiment', 'data', 'observation', 'measurement', 'variable', 'control', 'sample', 'statistical', 'correlation', 'evidence'],
    legal: ['law', 'regulation', 'statute', 'court', 'legal', 'contract', 'liability', 'jurisdiction', 'precedent', 'compliance'],
    medical: ['patient', 'diagnosis', 'treatment', 'symptom', 'clinical', 'medical', 'therapy', 'disease', 'medication', 'healthcare'],
    educational: ['learning', 'teaching', 'curriculum', 'student', 'education', 'pedagogy', 'assessment', 'classroom', 'instruction', 'academic'],
    news: ['report', 'breaking', 'source', 'journalist', 'news', 'update', 'announcement', 'press', 'media', 'coverage'],
    social: ['community', 'social', 'relationship', 'interaction', 'communication', 'network', 'group', 'society', 'culture', 'behavior'],
    philosophical: ['philosophy', 'ethics', 'morality', 'existence', 'consciousness', 'metaphysics', 'epistemology', 'logic', 'reasoning', 'truth'],
    general: []
  }
  
  const contentLower = content.toLowerCase()
  const domainScores: Record<string, number> = {}
  
  // Score each domain based on keyword presence
  for (const [domain, keywords] of Object.entries(domainKeywords)) {
    if (domain === 'general') continue
    
    let score = 0
    for (const keyword of keywords) {
      const regex = new RegExp(`\\b${keyword}\\b`, 'gi')
      const matches = contentLower.match(regex)
      if (matches) {
        score += matches.length
      }
    }
    domainScores[domain] = score
  }
  
  // Find domain with highest score
  let maxScore = 0
  let primaryDomain: DomainType = 'general'
  
  for (const [domain, score] of Object.entries(domainScores)) {
    if (score > maxScore) {
      maxScore = score
      primaryDomain = domain as DomainType
    }
  }
  
  // If no strong domain signal, return general
  if (maxScore < 3) {
    return 'general'
  }
  
  return primaryDomain
}

/**
 * Detects secondary domains present in the content.
 */
async function detectSecondaryDomains(content: string): Promise<DomainType[]> {
  const domains: DomainType[] = []
  
  // Similar to primary domain detection but with lower threshold
  const domainKeywords: Record<DomainType, string[]> = {
    academic: ['research', 'hypothesis', 'methodology'],
    technical: ['algorithm', 'code', 'system'],
    business: ['revenue', 'strategy', 'market'],
    creative: ['story', 'design', 'artistic'],
    scientific: ['experiment', 'data', 'evidence'],
    legal: ['law', 'legal', 'regulation'],
    medical: ['patient', 'treatment', 'clinical'],
    educational: ['learning', 'teaching', 'student'],
    news: ['report', 'breaking', 'news'],
    social: ['community', 'social', 'relationship'],
    philosophical: ['philosophy', 'ethics', 'consciousness'],
    general: []
  }
  
  const contentLower = content.toLowerCase()
  
  for (const [domain, keywords] of Object.entries(domainKeywords)) {
    if (domain === 'general') continue
    
    let found = 0
    for (const keyword of keywords) {
      if (contentLower.includes(keyword)) {
        found++
        if (found >= 2) {
          domains.push(domain as DomainType)
          break
        }
      }
    }
  }
  
  return domains.slice(0, 3) // Limit to top 3 secondary domains
}

/**
 * Calculates technical depth of the content.
 */
async function calculateTechnicalDepth(content: string): Promise<number> {
  let depth = 0
  
  // Indicators of technical depth
  const depthIndicators = {
    // Surface level (0-0.3)
    surface: [
      /\b(?:basic|simple|easy|introduction|overview|summary)\b/gi,
      /\b(?:what is|how to|getting started|beginner)\b/gi
    ],
    // Intermediate (0.3-0.7)
    intermediate: [
      /\b(?:advanced|complex|detailed|in-depth|comprehensive)\b/gi,
      /\b(?:implementation|architecture|optimization|performance)\b/gi
    ],
    // Expert (0.7-1.0)
    expert: [
      /\b(?:theorem|proof|lemma|corollary)\b/gi,
      /\b(?:complexity analysis|formal verification|mathematical proof)\b/gi,
      /\b[A-Z]+(?:\([n,k,m,log]\))/g, // Big O notation
      /∀|∃|∈|∉|⊆|⊂|∪|∩|≡|≈/g // Mathematical symbols
    ]
  }
  
  // Count indicators
  let surfaceCount = 0
  let intermediateCount = 0
  let expertCount = 0
  
  for (const pattern of depthIndicators.surface) {
    const matches = content.match(pattern)
    if (matches) surfaceCount += matches.length
  }
  
  for (const pattern of depthIndicators.intermediate) {
    const matches = content.match(pattern)
    if (matches) intermediateCount += matches.length
  }
  
  for (const pattern of depthIndicators.expert) {
    const matches = content.match(pattern)
    if (matches) expertCount += matches.length
  }
  
  // Calculate weighted depth
  if (expertCount > 2) {
    depth = 0.7 + (Math.min(expertCount, 10) / 10) * 0.3
  } else if (intermediateCount > 3) {
    depth = 0.3 + (Math.min(intermediateCount, 10) / 10) * 0.4
  } else if (surfaceCount > 2) {
    depth = Math.min(surfaceCount, 10) / 10 * 0.3
  } else {
    depth = 0.5 // Default to middle
  }
  
  return Math.max(0, Math.min(1, depth))
}

/**
 * Extracts domain-specific terms and jargon.
 */
async function extractDomainTerms(content: string): Promise<string[]> {
  const terms: Map<string, number> = new Map()
  
  // Pattern for potential domain terms (capitalized phrases, technical terms)
  const patterns = [
    // Acronyms
    /\b[A-Z]{2,}\b/g,
    // CamelCase terms
    /\b[A-Z][a-z]+[A-Z][a-zA-Z]*\b/g,
    // Technical terms with special characters
    /\b\w+[-_]\w+\b/g,
    // Terms with version numbers
    /\b\w+\s+v?\d+(?:\.\d+)*\b/gi
  ]
  
  for (const pattern of patterns) {
    const matches = content.match(pattern)
    if (matches) {
      for (const match of matches) {
        const term = match.trim()
        // Filter out common words
        if (term.length > 2 && !isCommonWord(term)) {
          terms.set(term, (terms.get(term) || 0) + 1)
        }
      }
    }
  }
  
  // Sort by frequency and return top terms
  return Array.from(terms.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([term]) => term)
    .slice(0, 50) // Limit to top 50
}

/**
 * Detects academic indicators in the content.
 */
async function detectAcademicIndicators(content: string): Promise<{
  hasAbstract: boolean
  hasMethodology: boolean
  hasConclusion: boolean
  academicScore: number
}> {
  const contentLower = content.toLowerCase()
  
  // Check for academic sections
  const hasAbstract = /\babstract\b/.test(contentLower) || 
                     /\bsummary\b/.test(contentLower) && /\bintroduction\b/.test(contentLower)
  
  const hasMethodology = /\bmethodology\b/.test(contentLower) ||
                        /\bmethods?\b/.test(contentLower) ||
                        /\bprocedure\b/.test(contentLower)
  
  const hasConclusion = /\bconclusion\b/.test(contentLower) ||
                       /\bdiscussion\b/.test(contentLower) ||
                       /\bfindings\b/.test(contentLower)
  
  // Calculate academic score based on various indicators
  let academicScore = 0
  
  // Section headers
  if (hasAbstract) academicScore += 0.2
  if (hasMethodology) academicScore += 0.2
  if (hasConclusion) academicScore += 0.2
  
  // Citations
  if (/\[\d+\]/.test(content) || /\([A-Z][a-z]+,?\s+\d{4}\)/.test(content)) {
    academicScore += 0.2
  }
  
  // Academic language
  const academicTerms = [
    'hypothesis', 'analysis', 'significant', 'correlation',
    'furthermore', 'moreover', 'therefore', 'consequently'
  ]
  
  let academicTermCount = 0
  for (const term of academicTerms) {
    if (contentLower.includes(term)) {
      academicTermCount++
    }
  }
  
  academicScore += Math.min(0.2, academicTermCount * 0.05)
  
  return {
    hasAbstract,
    hasMethodology,
    hasConclusion,
    academicScore: Math.min(1, academicScore)
  }
}

/**
 * Analyzes jargon and technical language usage.
 */
async function analyzeJargon(content: string): Promise<{
  count: number
  complexity: number
}> {
  let jargonCount = 0
  let complexity = 0
  
  // Complex word pattern (words > 12 characters often technical)
  const longWords = content.match(/\b\w{12,}\b/g) || []
  jargonCount += longWords.length
  
  // Hyphenated technical terms
  const hyphenatedTerms = content.match(/\b\w+-\w+(?:-\w+)*\b/g) || []
  jargonCount += hyphenatedTerms.length
  
  // Calculate complexity based on jargon density and word length
  const words = content.split(/\s+/)
  const avgWordLength = words.reduce((sum, word) => sum + word.length, 0) / words.length
  
  complexity = Math.min(1, (avgWordLength - 4) / 8) // Normalize based on average word length
  
  return { count: jargonCount, complexity }
}

/**
 * Calculates confidence score for domain analysis.
 */
function calculateDomainConfidence(content: string, domainTermCount: number): number {
  let confidence = 0.5 // Base confidence
  
  const wordCount = content.split(/\s+/).length
  
  // Content length affects confidence
  if (wordCount < 100) {
    confidence -= 0.2
  } else if (wordCount > 500) {
    confidence += 0.15
  }
  
  // Domain terms increase confidence
  if (domainTermCount > 5) {
    confidence += 0.2
  } else if (domainTermCount > 2) {
    confidence += 0.1
  }
  
  // Multiple signals increase confidence
  if (domainTermCount > 0 && wordCount > 200) {
    confidence += 0.15
  }
  
  return Math.max(0, Math.min(1, confidence))
}

/**
 * Checks if a word is common (to filter out from domain terms).
 */
function isCommonWord(word: string): boolean {
  const commonWords = new Set([
    'the', 'be', 'to', 'of', 'and', 'a', 'in', 'that', 'have',
    'it', 'for', 'not', 'on', 'with', 'he', 'as', 'you', 'do',
    'at', 'this', 'but', 'his', 'by', 'from', 'they', 'we', 'say',
    'her', 'she', 'or', 'an', 'will', 'my', 'one', 'all', 'would',
    'there', 'their', 'what', 'so', 'up', 'out', 'if', 'about'
  ])
  
  return commonWords.has(word.toLowerCase())
}

/**
 * Optional AI-enhanced domain analysis.
 */
export interface AIDomainAnalysis {
  primaryDomain?: DomainType
  subdomains?: string[]
  expertise?: 'novice' | 'intermediate' | 'expert'
  targetAudience?: string
  writingPurpose?: 'inform' | 'persuade' | 'instruct' | 'entertain'
}