/**
 * Unified metadata extraction pipeline.
 * Orchestrates all extractors for comprehensive metadata generation.
 */

import type { 
  ChunkMetadata, 
  EmotionalMetadata, 
  ConceptualMetadata, 
  MethodMetadata, 
  NarrativeMetadata,
  ReferenceMetadata,
  DomainMetadata
} from '../types/metadata'

// Import all extractors
import { analyzeEmotionalTone } from './extractors/emotional-tone'
import { extractKeyConcepts } from './extractors/key-concepts'
import { detectMethodSignatures } from './extractors/method-signatures'
import { analyzeNarrativeRhythm } from './extractors/narrative-rhythm'
import { extractReferences } from './extractors/references'
import { analyzeDomain } from './extractors/domain'

// For future AI enhancement (when integrated with Gemini)
interface AIEnhancedAnalysis {
  structural?: any
  emotional?: any
  conceptual?: any
  method?: any
  narrative?: any
  references?: any
  domain?: any
}

/**
 * Extracts all metadata from a chunk using the 7-engine system.
 * Runs extractors in parallel for optimal performance.
 * 
 * @param content - The text content to analyze
 * @param options - Extraction options
 * @returns Complete chunk metadata or partial on failure
 */
export async function extractMetadata(
  content: string,
  options: {
    aiAnalysis?: AIEnhancedAnalysis
    skipMethods?: boolean // Skip method detection for non-code
    timeoutMs?: number // Overall timeout (default 2000ms)
  } = {}
): Promise<ChunkMetadata> {
  const startTime = Date.now()
  const timeoutMs = options.timeoutMs || 2000
  
  console.log(`Starting metadata extraction for ${content.length} chars`)
  
  try {
    // Run all extractors in parallel with timeout protection
    const extractionPromises = [
      withTimeout(
        analyzeEmotionalTone(content, options.aiAnalysis?.emotional),
        300,
        'emotional'
      ),
      withTimeout(
        extractKeyConcepts(content, options.aiAnalysis?.conceptual),
        400,
        'concepts'
      ),
      options.skipMethods 
        ? Promise.resolve(undefined)
        : withTimeout(
            detectMethodSignatures(content, options.aiAnalysis?.method),
            200,
            'methods'
          ),
      withTimeout(
        analyzeNarrativeRhythm(content, options.aiAnalysis?.narrative),
        300,
        'narrative'
      ),
      withTimeout(
        extractReferences(content, options.aiAnalysis?.references),
        200,
        'references'
      ),
      withTimeout(
        analyzeDomain(content, options.aiAnalysis?.domain),
        250,
        'domain'
      )
    ]
    
    // Wait for all extractors with Promise.allSettled for graceful degradation
    const results = await Promise.allSettled(extractionPromises)
    
    // Extract successful results
    const [
      emotionalResult,
      conceptsResult,
      methodsResult,
      narrativeResult,
      referencesResult,
      domainResult
    ] = results
    
    // Build metadata object with fallbacks for failures
    const metadata: ChunkMetadata = {
      emotional: emotionalResult.status === 'fulfilled'
        ? emotionalResult.value as EmotionalMetadata
        : createDefaultEmotional(),
      
      concepts: conceptsResult.status === 'fulfilled'
        ? conceptsResult.value as ConceptualMetadata
        : createDefaultConceptual(),
      
      methods: methodsResult.status === 'fulfilled'
        ? methodsResult.value as MethodMetadata
        : undefined,
      
      narrative: narrativeResult.status === 'fulfilled'
        ? narrativeResult.value as NarrativeMetadata
        : createDefaultNarrative(),
      
      references: referencesResult.status === 'fulfilled'
        ? referencesResult.value as ReferenceMetadata
        : createDefaultReferences(),
      
      domain: domainResult.status === 'fulfilled'
        ? domainResult.value as DomainMetadata
        : createDefaultDomain(),
      
      quality: calculateQualityMetrics(results, startTime)
    }
    
    // Log extraction performance
    const elapsed = Date.now() - startTime
    console.log(`Metadata extraction completed in ${elapsed}ms`)
    
    if (elapsed > timeoutMs) {
      console.warn(`Extraction exceeded timeout: ${elapsed}ms > ${timeoutMs}ms`)
    }
    
    return metadata
    
  } catch (error) {
    console.error('Critical failure in metadata extraction:', error)
    // Return minimal metadata on complete failure
    return createMinimalMetadata()
  }
}

/**
 * Wraps an extractor with timeout protection.
 */
async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  extractorName: string
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => 
      setTimeout(() => reject(new Error(`${extractorName} timeout after ${timeoutMs}ms`)), timeoutMs)
    )
  ])
}

/**
 * Creates default emotional metadata for fallback.
 */
function createDefaultEmotional() {
  return {
    primaryEmotion: 'neutral' as const,
    polarity: 0,
    intensity: 0,
    secondaryEmotions: [],
    transitions: 0,
    confidence: 0
  }
}

/**
 * Creates default conceptual metadata for fallback.
 */
function createDefaultConceptual() {
  return {
    concepts: [],
    entities: {
      people: [],
      organizations: [],
      locations: [],
      technologies: [],
      other: []
    },
    relationships: [],
    domains: [],
    abstractionLevel: 0.5,
    confidence: 0
  }
}

/**
 * Creates default narrative metadata for fallback.
 */
function createDefaultNarrative() {
  return {
    sentenceRhythm: {
      avgLength: 0,
      variance: 0,
      pattern: 'uniform' as const
    },
    paragraphStructure: {
      avgSentences: 0,
      avgWords: 0,
      transitions: 0
    },
    style: {
      formality: 0.5,
      technicality: 0.5,
      verbosity: 0.5
    },
    fingerprint: '',
    transitions: 0,
    confidence: 0
  }
}

/**
 * Creates default reference metadata.
 */
function createDefaultReferences() {
  return {
    internalRefs: 0,
    externalRefs: [],
    citationStyle: undefined,
    urls: [],
    crossRefs: [],
    density: 0,
    confidence: 0
  }
}

/**
 * Creates default domain metadata.
 */
function createDefaultDomain() {
  return {
    primaryDomain: 'general' as const,
    secondaryDomains: [],
    technicalDepth: 0,
    jargonDensity: 0,
    domainTerms: [],
    academic: {
      hasAbstract: false,
      hasMethodology: false,
      hasConclusion: false,
      academicScore: 0
    },
    confidence: 0
  }
}

/**
 * Calculates quality metrics for the extraction.
 */
function calculateQualityMetrics(
  results: PromiseSettledResult<any>[],
  startTime: number
) {
  const successful = results.filter(r => r.status === 'fulfilled').length
  const failed = results.filter(r => r.status === 'rejected').length
  
  // Collect errors
  const errors: string[] = []
  results.forEach((result, index) => {
    if (result.status === 'rejected') {
      const extractorNames = ['emotional', 'concepts', 'methods', 'narrative', 'references', 'domain']
      errors.push(`${extractorNames[index]}: ${result.reason}`)
    }
  })
  
  return {
    completeness: successful / results.length,
    extractedFields: successful,
    totalFields: results.length,
    extractedAt: new Date().toISOString(),
    extractionTime: Date.now() - startTime,
    extractorVersions: {
      emotional: '1.0.0',
      concepts: '1.0.0',
      methods: '1.0.0',
      narrative: '1.0.0',
      references: '1.0.0',
      domain: '1.0.0'
    },
    errors: errors.slice(0, 3).map(err => {
      const [field, error] = err.split(': ')
      return { field, error: error || 'Unknown error' }
    })
  }
}

/**
 * Creates minimal metadata for complete failures.
 */
function createMinimalMetadata(): ChunkMetadata {
  return {
    emotional: createDefaultEmotional(),
    concepts: createDefaultConceptual(),
    methods: undefined,
    narrative: createDefaultNarrative(),
    references: createDefaultReferences(),
    domain: createDefaultDomain(),
    quality: {
      completeness: 0,
      extractedFields: 0,
      totalFields: 7,
      extractedAt: new Date().toISOString(),
      extractionTime: 0,
      extractorVersions: {},
      errors: [{ field: 'all', error: 'Complete extraction failure' }]
    }
  }
}

/**
 * Validates extracted metadata for quality assurance.
 */
export function validateMetadata(metadata: ChunkMetadata): {
  isValid: boolean
  issues: string[]
} {
  const issues: string[] = []
  
  // Check completeness
  if (metadata.quality.completeness < 0.6) {
    issues.push(`Low completeness: ${Math.round(metadata.quality.completeness * 100)}%`)
  }
  
  // Check confidence scores
  const confidences = [
    metadata.emotional.confidence,
    metadata.concepts.confidence,
    metadata.narrative.confidence
  ]
  
  const avgConfidence = confidences.reduce((a, b) => a + b, 0) / confidences.length
  if (avgConfidence < 0.4) {
    issues.push(`Low average confidence: ${Math.round(avgConfidence * 100)}%`)
  }
  
  // Check for empty extractions
  if (metadata.concepts.concepts.length === 0) {
    issues.push('No concepts extracted')
  }
  
  // Structural patterns check removed (not used in 3-engine system)
  
  return {
    isValid: issues.length === 0,
    issues
  }
}

/**
 * Exports metadata extraction statistics for monitoring.
 */
export function getExtractionStats(): {
  avgExtractionTime: number
  successRate: number
  commonFailures: string[]
} {
  // This would be populated by actual monitoring in production
  return {
    avgExtractionTime: 1500, // ms
    successRate: 0.92, // 92%
    commonFailures: [
      'emotional timeout after 300ms',
      'concepts timeout after 400ms'
    ]
  }
}