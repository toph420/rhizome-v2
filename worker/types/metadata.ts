/**
 * Enhanced metadata types for 7-engine collision detection system.
 * Supports rich metadata extraction for sophisticated knowledge synthesis.
 */

/**
 * Complete metadata for enhanced chunk processing.
 * Contains all 7 metadata types for collision detection engines.
 */
export interface ChunkMetadata {
  /** Emotional tone and sentiment */
  emotional: EmotionalMetadata
  /** Key concepts and entities */
  concepts: ConceptualMetadata
  /** Method signatures (for code) */
  methods?: MethodMetadata
  /** Narrative rhythm and style */
  narrative: NarrativeMetadata
  /** Cross-reference patterns */
  references: ReferenceMetadata
  /** Domain-specific signals */
  domain: DomainMetadata
  /** Extraction quality metrics */
  quality: QualityMetadata
}

/**
 * Structural patterns metadata.
 * Identifies document organization and formatting patterns.
 */
export interface StructuralMetadata {
  /** Detected pattern types */
  patterns: StructuralPattern[]
  /** Hierarchy depth (for nested structures) */
  hierarchyDepth: number
  /** List structures found */
  listTypes: Array<'bullet' | 'numbered' | 'nested' | 'definition'>
  /** Table/grid detection */
  hasTable: boolean
  /** Code block detection */
  hasCode: boolean
  /** Template type if detected */
  templateType?: string
  /** Confidence score (0-1) */
  confidence: number
}

/**
 * Individual structural pattern.
 */
export interface StructuralPattern {
  /** Pattern type identifier */
  type: 'heading' | 'list' | 'table' | 'code' | 'quote' | 'section' | 'definition'
  /** Pattern count in chunk */
  count: number
  /** Average nesting level */
  avgNesting: number
  /** Pattern-specific metadata */
  metadata?: Record<string, any>
}

/**
 * Emotional tone metadata.
 * Captures sentiment and emotional content.
 */
export interface EmotionalMetadata {
  /** Primary emotion detected */
  primaryEmotion: EmotionType
  /** Sentiment polarity (-1 to +1) */
  polarity: number
  /** Emotional intensity (0-1) */
  intensity: number
  /** Secondary emotions present */
  secondaryEmotions: Array<{
    emotion: EmotionType
    strength: number
  }>
  /** Emotional transitions detected */
  transitions: number
  /** Confidence score (0-1) */
  confidence: number
}

/**
 * Emotion types based on Plutchik's wheel.
 */
export type EmotionType = 
  | 'joy' | 'trust' | 'fear' | 'surprise' 
  | 'sadness' | 'disgust' | 'anger' | 'anticipation'
  | 'neutral' | 'mixed'

/**
 * Key concepts metadata.
 * Extracted concepts, entities, and themes.
 */
export interface ConceptualMetadata {
  /** Top concepts by importance */
  concepts: ConceptItem[]
  /** Named entities */
  entities: {
    people: string[]
    organizations: string[]
    locations: string[]
    technologies: string[]
    other: string[]
  }
  /** Concept relationships */
  relationships: ConceptRelation[]
  /** Domain classification */
  domains: string[]
  /** Abstraction level (0=concrete, 1=abstract) */
  abstractionLevel: number
  /** Confidence score (0-1) */
  confidence: number
}

/**
 * Individual concept with importance.
 */
export interface ConceptItem {
  /** Concept text */
  text: string
  /** Importance score (0-1) */
  importance: number
  /** Frequency in chunk */
  frequency: number
  /** Concept category */
  category?: string
}

/**
 * Relationship between concepts.
 */
export interface ConceptRelation {
  /** Source concept */
  from: string
  /** Target concept */
  to: string
  /** Relationship type */
  type: 'defines' | 'uses' | 'extends' | 'contradicts' | 'relates'
  /** Relationship strength (0-1) */
  strength: number
}

/**
 * Method signatures metadata (for code chunks).
 * Detects function/method patterns in code.
 */
export interface MethodMetadata {
  /** Detected function signatures */
  signatures: MethodSignature[]
  /** Programming languages detected */
  languages: string[]
  /** Naming conventions */
  namingConvention: 'camelCase' | 'snake_case' | 'kebab-case' | 'PascalCase' | 'mixed'
  /** Complexity metrics */
  complexity: {
    cyclomaticAvg: number
    nestingMax: number
    parametersAvg: number
  }
  /** Code patterns detected */
  patterns: string[]
  /** Confidence score (0-1) */
  confidence: number
}

/**
 * Individual method signature.
 */
export interface MethodSignature {
  /** Function/method name */
  name: string
  /** Parameter count */
  paramCount: number
  /** Return type if detected */
  returnType?: string
  /** Visibility/scope */
  visibility?: 'public' | 'private' | 'protected'
  /** Is async/generator */
  isAsync: boolean
  /** Line number if available */
  line?: number
}

/**
 * Narrative rhythm metadata.
 * Analyzes writing style and flow.
 */
export interface NarrativeMetadata {
  /** Sentence length variation */
  sentenceRhythm: {
    avgLength: number
    variance: number
    pattern: 'uniform' | 'varied' | 'escalating' | 'diminishing'
  }
  /** Paragraph structure */
  paragraphStructure: {
    avgSentences: number
    avgWords: number
    transitions: number
  }
  /** Writing style indicators */
  style: {
    formality: number  // 0=informal, 1=formal
    technicality: number  // 0=general, 1=technical
    verbosity: number  // 0=concise, 1=verbose
  }
  /** Rhythm fingerprint (unique signature) */
  fingerprint: string
  /** Style transitions detected */
  transitions: number
  /** Confidence score (0-1) */
  confidence: number
}

/**
 * Cross-reference metadata.
 * Tracks references and citations.
 */
export interface ReferenceMetadata {
  /** Internal references (to same doc) */
  internalRefs: number
  /** External references detected */
  externalRefs: string[]
  /** Citation style if detected */
  citationStyle?: 'apa' | 'mla' | 'chicago' | 'ieee' | 'other'
  /** URLs found */
  urls: string[]
  /** Cross-references to other chunks */
  crossRefs: Array<{
    targetId?: string
    text: string
    type: 'explicit' | 'implicit'
  }>
  /** Reference density (refs per 100 words) */
  density: number
  /** Confidence score (0-1) */
  confidence: number
}

/**
 * Domain-specific metadata.
 * Captures domain-specific signals and patterns.
 */
export interface DomainMetadata {
  /** Primary domain classification */
  primaryDomain: DomainType
  /** Secondary domains present */
  secondaryDomains: DomainType[]
  /** Technical depth (0=surface, 1=expert) */
  technicalDepth: number
  /** Jargon density (domain terms per 100 words) */
  jargonDensity: number
  /** Domain-specific terms found */
  domainTerms: string[]
  /** Academic indicators */
  academic: {
    hasAbstract: boolean
    hasMethodology: boolean
    hasConclusion: boolean
    academicScore: number  // 0-1
  }
  /** Confidence score (0-1) */
  confidence: number
}

/**
 * Domain classifications.
 */
export type DomainType = 
  | 'academic' | 'technical' | 'business' | 'creative'
  | 'scientific' | 'legal' | 'medical' | 'educational'
  | 'news' | 'social' | 'philosophical' | 'general'

/**
 * Metadata extraction quality metrics.
 */
export interface QualityMetadata {
  /** Overall completeness (0-1) */
  completeness: number
  /** Fields successfully extracted */
  extractedFields: number
  /** Total possible fields */
  totalFields: number
  /** Extraction timestamp */
  extractedAt: string
  /** Extraction duration (ms) */
  extractionTime: number
  /** Extractor versions used */
  extractorVersions: Record<string, string>
  /** Any extraction errors */
  errors: Array<{
    field: string
    error: string
  }>
}

/**
 * Partial metadata for graceful degradation.
 * Used when some extractors fail.
 */
export type PartialChunkMetadata = Partial<ChunkMetadata> & {
  quality: QualityMetadata
}

/**
 * Default metadata values for initialization.
 */
export const DEFAULT_METADATA: ChunkMetadata = {
  emotional: {
    primaryEmotion: 'neutral',
    polarity: 0,
    intensity: 0,
    secondaryEmotions: [],
    transitions: 0,
    confidence: 0
  },
  concepts: {
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
  },
  narrative: {
    sentenceRhythm: {
      avgLength: 0,
      variance: 0,
      pattern: 'uniform'
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
  },
  references: {
    internalRefs: 0,
    externalRefs: [],
    urls: [],
    crossRefs: [],
    density: 0,
    confidence: 0
  },
  domain: {
    primaryDomain: 'general',
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
  },
  quality: {
    completeness: 0,
    extractedFields: 0,
    totalFields: 7,
    extractedAt: new Date().toISOString(),
    extractionTime: 0,
    extractorVersions: {},
    errors: []
  }
}

/**
 * Validation function for metadata completeness.
 */
export function validateMetadata(metadata: Partial<ChunkMetadata>): QualityMetadata {
  const fields = ['emotional', 'concepts', 'narrative', 'references', 'domain']
  let extractedFields = 0
  const errors: Array<{ field: string; error: string }> = []
  
  for (const field of fields) {
    if (metadata[field as keyof ChunkMetadata]) {
      extractedFields++
    } else {
      errors.push({ field, error: 'Field not extracted' })
    }
  }
  
  // Check for optional methods field (only for code chunks)
  if (metadata.methods) {
    extractedFields++
  }
  
  const totalFields = 6
  const completeness = extractedFields / totalFields
  
  return {
    completeness,
    extractedFields,
    totalFields,
    extractedAt: new Date().toISOString(),
    extractionTime: 0,
    extractorVersions: {},
    errors
  }
}

/**
 * Type guard for complete metadata.
 */
export function isCompleteMetadata(
  metadata: Partial<ChunkMetadata> | undefined
): metadata is ChunkMetadata {
  if (!metadata) return false
  
  const requiredFields: (keyof ChunkMetadata)[] = [
    'emotional', 'concepts', 
    'narrative', 'references', 'domain', 'quality'
  ]
  
  return requiredFields.every(field => field in metadata)
}

/**
 * Merge partial metadata with defaults.
 */
export function mergeWithDefaults(
  partial: Partial<ChunkMetadata>
): ChunkMetadata {
  return {
    ...DEFAULT_METADATA,
    ...partial,
    quality: {
      ...DEFAULT_METADATA.quality,
      ...validateMetadata(partial)
    }
  }
}