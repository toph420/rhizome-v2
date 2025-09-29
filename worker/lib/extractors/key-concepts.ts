/**
 * Key concepts extractor for thematic analysis.
 * Identifies important concepts, entities, and relationships.
 */

import type { 
  ConceptualMetadata, 
  ConceptItem,
  ConceptRelation
} from '../../types/metadata'

// Extend ConceptItem to include metadata for internal processing
interface ExtendedConceptItem extends ConceptItem {
  metadata?: Record<string, any>
}

/**
 * Extracts key concepts and entities from text content.
 * Uses TF-IDF-like scoring with AI enhancement for importance ranking.
 * 
 * @param content - The text content to analyze
 * @param aiAnalysis - Optional AI-enhanced concept analysis
 * @returns Conceptual metadata with ranked concepts and relationships
 */
export async function extractKeyConcepts(
  content: string,
  aiAnalysis?: AIConceptualAnalysis
): Promise<ConceptualMetadata> {
  const startTime = Date.now()
  
  // Extract concepts using multiple strategies in parallel
  const [
    concepts,
    entities,
    relationships,
    domainTerms
  ] = await Promise.all([
    extractConcepts(content, aiAnalysis),
    extractEntities(content),
    extractRelationships(content, aiAnalysis),
    extractDomainTerms(content)
  ])
  
  // Merge and rank all extracted items
  const rankedConcepts = rankConcepts(
    [...concepts, ...entities, ...domainTerms],
    content
  )
  
  // Limit to 5-10 most important concepts
  const topConcepts = rankedConcepts.slice(0, 10)
  
  // Calculate abstraction level
  const abstractionLevel = calculateAbstractionLevel(content, topConcepts)
  
  // Extract domain classifications
  const domains = extractDomains(domainTerms)
  
  // Format entities properly
  const formattedEntities = formatEntities(entities)
  
  // Calculate confidence based on extraction quality
  const confidence = calculateConceptConfidence(topConcepts, content)
  
  // Ensure performance target met (<400ms)
  const elapsed = Date.now() - startTime
  if (elapsed > 400) {
    console.warn(`Concept extraction took ${elapsed}ms (target: <400ms)`)
  }
  
  // Strip metadata from concepts before returning
  const cleanConcepts: ConceptItem[] = topConcepts.map(({ text, importance, frequency, category }) => ({
    text,
    importance,
    frequency,
    ...(category && { category })
  }))

  return {
    concepts: cleanConcepts,
    entities: formattedEntities,
    relationships,
    domains,
    abstractionLevel,
    confidence
  }
}

/**
 * Extracts concept candidates from content.
 */
async function extractConcepts(
  content: string,
  aiAnalysis?: AIConceptualAnalysis
): Promise<ConceptItem[]> {
  // Use AI concepts if available
  if (aiAnalysis?.concepts && aiAnalysis.concepts.length > 0) {
    return aiAnalysis.concepts
  }
  
  const concepts: ConceptItem[] = []
  const words = content.toLowerCase().split(/\s+/)
  const wordFreq = new Map<string, number>()
  
  // Common stop words to filter
  const stopWords = new Set([
    'the', 'is', 'at', 'which', 'on', 'a', 'an', 'as', 'are', 'was', 'were',
    'been', 'be', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
    'could', 'should', 'may', 'might', 'must', 'can', 'this', 'that', 'these',
    'those', 'i', 'you', 'he', 'she', 'it', 'we', 'they', 'what', 'when',
    'where', 'how', 'why', 'all', 'each', 'every', 'both', 'few', 'more',
    'most', 'other', 'some', 'such', 'only', 'own', 'same', 'so', 'than',
    'too', 'very', 'just', 'but', 'and', 'or', 'if', 'then', 'else', 'for',
    'from', 'up', 'down', 'in', 'out', 'over', 'under', 'again', 'further'
  ])
  
  // Count word frequencies
  for (const word of words) {
    const cleaned = word.replace(/[^a-z0-9-]/g, '')
    if (cleaned.length > 2 && !stopWords.has(cleaned)) {
      wordFreq.set(cleaned, (wordFreq.get(cleaned) || 0) + 1)
    }
  }
  
  // Extract noun phrases (simple pattern)
  const nounPhrases = content.matchAll(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g)
  for (const match of nounPhrases) {
    const phrase = match[1]
    if (phrase.split(' ').length <= 3) { // Max 3 words
      wordFreq.set(phrase.toLowerCase(), (wordFreq.get(phrase.toLowerCase()) || 0) + 2)
    }
  }
  
  // Convert to ConceptItem format
  for (const [term, freq] of wordFreq.entries()) {
    if (freq > 1) { // Appears at least twice
      concepts.push({
        text: term,
        importance: freq / words.length, // Basic TF score
        frequency: freq,
        category: 'concept'
      })
    }
  }
  
  return concepts
}

/**
 * Extracts named entities from content.
 */
async function extractEntities(content: string): Promise<ConceptItem[]> {
  const entities: ConceptItem[] = []
  
  // Pattern for potential entities (capitalized words)
  const entityPattern = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g
  const matches = content.matchAll(entityPattern)
  const entityCounts = new Map<string, number>()
  
  for (const match of matches) {
    const entity = match[1]
    // Filter out common sentence starters
    if (entity.length > 2 && !/^(The|This|That|These|Those|It|He|She|They)$/.test(entity)) {
      entityCounts.set(entity, (entityCounts.get(entity) || 0) + 1)
    }
  }
  
  // Check for specific entity types
  const patterns = {
    person: /\b(Mr\.|Mrs\.|Ms\.|Dr\.|Prof\.)?\s*[A-Z][a-z]+\s+[A-Z][a-z]+/g,
    organization: /\b(Inc\.|Corp\.|LLC|Ltd\.|Company|Organization|Institute|University)\b/gi,
    location: /\b(Street|St\.|Avenue|Ave\.|Road|Rd\.|City|State|Country)\b/gi,
    date: /\b(\d{4}|\d{1,2}\/\d{1,2}\/\d{2,4}|January|February|March|April|May|June|July|August|September|October|November|December)\b/gi
  }
  
  for (const [type, pattern] of Object.entries(patterns)) {
    const typeMatches = content.match(pattern) || []
    if (typeMatches.length > 0) {
      entities.push({
        text: `${type}_entities`,
        importance: 0.3,
        frequency: typeMatches.length,
        category: 'entity'
      })
    }
  }
  
  // Convert entity counts to ConceptItems
  for (const [entity, count] of entityCounts.entries()) {
    if (count > 0) {
      entities.push({
        text: entity,
        importance: count / 10, // Scale importance
        frequency: count,
        category: 'entity'
      })
    }
  }
  
  return entities
}

/**
 * Extracts relationships between concepts.
 */
async function extractRelationships(
  content: string,
  aiAnalysis?: AIConceptualAnalysis
): Promise<ConceptRelation[]> {
  // Use AI relationships if available
  if (aiAnalysis?.relationships && aiAnalysis.relationships.length > 0) {
    return aiAnalysis.relationships
  }
  
  const relationships: ConceptRelation[] = []
  
  // Relationship patterns
  const patterns = [
    { regex: /(\w+)\s+(?:is|are|was|were)\s+(?:a|an|the)?\s*(\w+)/gi, type: 'is_a' },
    { regex: /(\w+)\s+(?:has|have|had)\s+(\w+)/gi, type: 'has' },
    { regex: /(\w+)\s+(?:causes?|leads? to|results? in)\s+(\w+)/gi, type: 'causes' },
    { regex: /(\w+)\s+(?:depends? on|requires?|needs?)\s+(\w+)/gi, type: 'depends_on' },
    { regex: /(\w+)\s+(?:includes?|contains?|consists? of)\s+(\w+)/gi, type: 'contains' },
    { regex: /(\w+)\s+(?:and|or|with)\s+(\w+)/gi, type: 'related_to' }
  ]
  
  // Extract relationships
  for (const { regex, type } of patterns) {
    const matches = content.matchAll(regex)
    for (const match of matches) {
      if (match[1] && match[2]) {
        relationships.push({
          from: match[1].toLowerCase(),
          to: match[2].toLowerCase(),
          type: mapRelationType(type) as ConceptRelation['type'],
          strength: 0.7
        })
      }
    }
  }
  
  // Deduplicate relationships
  const unique = new Map<string, ConceptRelation>()
  for (const rel of relationships) {
    const key = `${rel.from}-${rel.to}-${rel.type}`
    unique.set(key, rel)
  }
  
  return Array.from(unique.values()).slice(0, 10) // Limit to 10 relationships
}

/**
 * Extracts domain-specific terms.
 */
async function extractDomainTerms(content: string): Promise<ExtendedConceptItem[]> {
  const domainTerms: ExtendedConceptItem[] = []
  
  // Technical/domain indicators
  const domainPatterns = [
    // Scientific terms
    /\b\w+(?:ology|osis|itis|ation|ization)\b/gi,
    // Technical compounds
    /\b\w+[-]\w+\b/g,
    // Acronyms
    /\b[A-Z]{2,}\b/g,
    // Numbers with units
    /\b\d+\s*(?:ms|MB|GB|km|kg|Hz|%)\b/gi,
    // Code-like terms
    /\b[a-z]+(?:[A-Z][a-z]+)+\b/g, // camelCase
    /\b[a-z]+_[a-z]+\b/g, // snake_case
  ]
  
  const termCounts = new Map<string, number>()
  
  for (const pattern of domainPatterns) {
    const matches = content.match(pattern) || []
    for (const match of matches) {
      const term = match.toLowerCase()
      termCounts.set(term, (termCounts.get(term) || 0) + 1)
    }
  }
  
  // Convert to ConceptItems
  for (const [term, count] of termCounts.entries()) {
    if (count > 0 && term.length > 2) {
      domainTerms.push({
        text: term,
        importance: Math.min(1, count / 5),
        frequency: count,
        category: 'domain',
        metadata: { isDomainSpecific: true }
      })
    }
  }
  
  return domainTerms
}

/**
 * Ranks concepts by importance.
 */
function rankConcepts(concepts: ExtendedConceptItem[], content: string): ExtendedConceptItem[] {
  const docLength = content.split(/\s+/).length
  
  // Calculate TF-IDF-like scores
  for (const concept of concepts) {
    // Term frequency (TF)
    const tf = concept.frequency / docLength
    
    // Boost for different concept types
    let typeBoost = 1
    if (concept.category === 'entity') typeBoost = 1.2
    if (concept.category === 'domain') typeBoost = 1.3
    
    // Position boost (concepts appearing early are often more important)
    const firstOccurrence = content.toLowerCase().indexOf(concept.text.toLowerCase())
    const positionBoost = firstOccurrence >= 0 ? 1 - (firstOccurrence / content.length) * 0.3 : 0
    
    // Calculate final importance
    concept.importance = Math.min(1, tf * typeBoost * (1 + positionBoost) * 10)
  }
  
  // Sort by importance and deduplicate
  const seen = new Set<string>()
  return concepts
    .sort((a, b) => b.importance - a.importance)
    .filter(c => {
      const key = c.text.toLowerCase()
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
}

/**
 * Calculates confidence in concept extraction.
 */
function calculateConceptConfidence(
  concepts: ConceptItem[],
  content: string
): number {
  let confidence = 0.5 // Base confidence
  
  const wordCount = content.split(/\s+/).length
  
  // Adjust based on content length
  if (wordCount < 50) {
    confidence -= 0.2 // Short content has less reliable concepts
  } else if (wordCount > 200) {
    confidence += 0.1 // Longer content provides better context
  }
  
  // Adjust based on concept quality
  if (concepts.length >= 5) {
    confidence += 0.15 // Good concept coverage
  }
  
  // Check for high-importance concepts
  const highImportance = concepts.filter(c => c.importance > 0.5).length
  if (highImportance > 2) {
    confidence += 0.1 // Clear important concepts
  }
  
  // Check for diversity
  const categories = new Set(concepts.map(c => c.category).filter(Boolean))
  if (categories.size > 1) {
    confidence += 0.05 // Multiple concept categories
  }
  
  return Math.max(0, Math.min(1, confidence))
}

/**
 * Maps generic relationship types to ConceptRelation types.
 */
function mapRelationType(type: string): ConceptRelation['type'] {
  const mapping: Record<string, ConceptRelation['type']> = {
    'is_a': 'extends',
    'has': 'uses',
    'causes': 'relates',
    'depends_on': 'uses',
    'contains': 'uses',
    'related_to': 'relates',
    'contradicts': 'contradicts',
    'defines': 'defines'
  }
  return mapping[type] || 'relates'
}

/**
 * Calculates abstraction level from content and concepts.
 */
function calculateAbstractionLevel(content: string, concepts: ExtendedConceptItem[]): number {
  let abstractScore = 0.5 // Default middle level
  
  // Check for concrete indicators
  const concretePatterns = /\b(specific|example|instance|case|data|number|fact|detail)\b/gi
  const concreteMatches = (content.match(concretePatterns) || []).length
  
  // Check for abstract indicators
  const abstractPatterns = /\b(concept|theory|principle|abstract|general|framework|model|pattern)\b/gi
  const abstractMatches = (content.match(abstractPatterns) || []).length
  
  // Calculate ratio
  const total = concreteMatches + abstractMatches
  if (total > 0) {
    abstractScore = abstractMatches / total
  }
  
  // Adjust based on concept types
  const domainConcepts = concepts.filter(c => c.category === 'domain').length
  const entityConcepts = concepts.filter(c => c.category === 'entity').length
  
  if (entityConcepts > domainConcepts) {
    abstractScore -= 0.1 // More concrete
  } else if (domainConcepts > entityConcepts) {
    abstractScore += 0.1 // More abstract
  }
  
  return Math.max(0, Math.min(1, abstractScore))
}

/**
 * Extracts domain classifications from domain terms.
 */
function extractDomains(domainTerms: ExtendedConceptItem[]): string[] {
  const domains = new Set<string>()
  
  // Domain mapping based on term patterns
  const domainMap: Record<string, string[]> = {
    'technology': ['api', 'software', 'code', 'programming', 'algorithm', 'database'],
    'science': ['hypothesis', 'experiment', 'analysis', 'research', 'theory'],
    'business': ['revenue', 'profit', 'market', 'customer', 'strategy'],
    'medical': ['patient', 'treatment', 'diagnosis', 'symptom', 'therapy'],
    'academic': ['thesis', 'paper', 'study', 'methodology', 'conclusion']
  }
  
  // Check domain terms against patterns
  for (const term of domainTerms) {
    const lowerTerm = term.text.toLowerCase()
    for (const [domain, keywords] of Object.entries(domainMap)) {
      if (keywords.some(keyword => lowerTerm.includes(keyword))) {
        domains.add(domain)
      }
    }
  }
  
  // Return as array, limit to top 3 domains
  return Array.from(domains).slice(0, 3)
}

/**
 * Formats entities into the required structure.
 */
function formatEntities(entities: ExtendedConceptItem[]): ConceptualMetadata['entities'] {
  const formatted = {
    people: [] as string[],
    organizations: [] as string[],
    locations: [] as string[],
    technologies: [] as string[],
    other: [] as string[]
  }
  
  for (const entity of entities) {
    if (entity.metadata?.entityType === 'person') {
      formatted.people.push(entity.text)
    } else if (entity.metadata?.entityType === 'organization') {
      formatted.organizations.push(entity.text)
    } else if (entity.metadata?.entityType === 'location') {
      formatted.locations.push(entity.text)
    } else if (entity.text.match(/^[A-Z]{2,}$/) || entity.text.includes('-')) {
      formatted.technologies.push(entity.text)
    } else {
      formatted.other.push(entity.text)
    }
  }
  
  return formatted
}

/**
 * Optional AI-enhanced conceptual analysis.
 */
export interface AIConceptualAnalysis {
  concepts?: ConceptItem[]
  relationships?: ConceptRelation[]
  domain?: string
  keyThemes?: string[]
}