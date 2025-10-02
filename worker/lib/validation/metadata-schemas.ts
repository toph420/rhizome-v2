/**
 * Zod validation schemas for metadata types.
 * Provides runtime validation and type safety for metadata extraction.
 */

import { z } from 'zod'

// Emotion type enum
export const EmotionTypeSchema = z.enum([
  'joy', 'trust', 'fear', 'surprise',
  'sadness', 'disgust', 'anger', 'anticipation',
  'neutral', 'mixed'
])

// Domain type enum  
export const DomainTypeSchema = z.enum([
  'academic', 'technical', 'business', 'creative',
  'scientific', 'legal', 'medical', 'educational',
  'news', 'social', 'philosophical', 'general'
])

// Structural pattern schema
export const StructuralPatternSchema = z.object({
  type: z.enum(['heading', 'list', 'table', 'code', 'quote', 'section', 'definition']),
  count: z.number().int().min(0),
  avgNesting: z.number().min(0),
  metadata: z.record(z.any()).optional()
})

// Structural metadata schema
export const StructuralMetadataSchema = z.object({
  patterns: z.array(StructuralPatternSchema),
  hierarchyDepth: z.number().int().min(0),
  listTypes: z.array(z.enum(['bullet', 'numbered', 'nested', 'definition'])),
  hasTable: z.boolean(),
  hasCode: z.boolean(),
  templateType: z.string().optional(),
  confidence: z.number().min(0).max(1)
})

// Emotional metadata schema
export const EmotionalMetadataSchema = z.object({
  primaryEmotion: EmotionTypeSchema,
  polarity: z.number().min(-1).max(1),
  intensity: z.number().min(0).max(1),
  secondaryEmotions: z.array(z.object({
    emotion: EmotionTypeSchema,
    strength: z.number().min(0).max(1)
  })),
  transitions: z.number().int().min(0),
  confidence: z.number().min(0).max(1)
})

// Concept item schema
export const ConceptItemSchema = z.object({
  text: z.string().min(1),
  importance: z.number().min(0).max(1),
  frequency: z.number().int().min(1),
  category: z.string().optional()
})

// Concept relation schema
export const ConceptRelationSchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
  type: z.enum(['defines', 'uses', 'extends', 'contradicts', 'relates']),
  strength: z.number().min(0).max(1)
})

// Conceptual metadata schema
export const ConceptualMetadataSchema = z.object({
  concepts: z.array(ConceptItemSchema).max(10),
  entities: z.object({
    people: z.array(z.string()),
    organizations: z.array(z.string()),
    locations: z.array(z.string()),
    technologies: z.array(z.string()),
    other: z.array(z.string())
  }),
  relationships: z.array(ConceptRelationSchema),
  domains: z.array(z.string()),
  abstractionLevel: z.number().min(0).max(1),
  confidence: z.number().min(0).max(1)
})

// Method signature schema
export const MethodSignatureSchema = z.object({
  name: z.string().min(1),
  paramCount: z.number().int().min(0),
  returnType: z.string().optional(),
  visibility: z.enum(['public', 'private', 'protected']).optional(),
  isAsync: z.boolean(),
  line: z.number().int().positive().optional()
})

// Method metadata schema
export const MethodMetadataSchema = z.object({
  signatures: z.array(MethodSignatureSchema),
  languages: z.array(z.string()),
  namingConvention: z.enum(['camelCase', 'snake_case', 'kebab-case', 'PascalCase', 'mixed']),
  complexity: z.object({
    cyclomaticAvg: z.number().min(0),
    nestingMax: z.number().int().min(0),
    parametersAvg: z.number().min(0)
  }),
  patterns: z.array(z.string()),
  confidence: z.number().min(0).max(1)
})

// Narrative metadata schema
export const NarrativeMetadataSchema = z.object({
  sentenceRhythm: z.object({
    avgLength: z.number().min(0),
    variance: z.number().min(0),
    pattern: z.enum(['uniform', 'varied', 'escalating', 'diminishing'])
  }),
  paragraphStructure: z.object({
    avgSentences: z.number().min(0),
    avgWords: z.number().min(0),
    transitions: z.number().int().min(0)
  }),
  style: z.object({
    formality: z.number().min(0).max(1),
    technicality: z.number().min(0).max(1),
    verbosity: z.number().min(0).max(1)
  }),
  fingerprint: z.string(),
  transitions: z.number().int().min(0),
  confidence: z.number().min(0).max(1)
})

// Reference metadata schema
export const ReferenceMetadataSchema = z.object({
  internalRefs: z.number().int().min(0),
  externalRefs: z.array(z.string()),
  citationStyle: z.enum(['apa', 'mla', 'chicago', 'ieee', 'other']).optional(),
  urls: z.array(z.string().url()),
  crossRefs: z.array(z.object({
    targetId: z.string().uuid().optional(),
    text: z.string().min(1),
    type: z.enum(['explicit', 'implicit'])
  })),
  density: z.number().min(0),
  confidence: z.number().min(0).max(1)
})

// Domain metadata schema
export const DomainMetadataSchema = z.object({
  primaryDomain: DomainTypeSchema,
  secondaryDomains: z.array(DomainTypeSchema),
  technicalDepth: z.number().min(0).max(1),
  jargonDensity: z.number().min(0),
  domainTerms: z.array(z.string()),
  academic: z.object({
    hasAbstract: z.boolean(),
    hasMethodology: z.boolean(),
    hasConclusion: z.boolean(),
    academicScore: z.number().min(0).max(1)
  }),
  confidence: z.number().min(0).max(1)
})

// Quality metadata schema
export const QualityMetadataSchema = z.object({
  completeness: z.number().min(0).max(1),
  extractedFields: z.number().int().min(0),
  totalFields: z.number().int().positive(),
  extractedAt: z.string().datetime(),
  extractionTime: z.number().int().min(0),
  extractorVersions: z.record(z.string()),
  errors: z.array(z.object({
    field: z.string(),
    error: z.string()
  }))
})

// Complete chunk metadata schema
export const ChunkMetadataSchema = z.object({
  structural: StructuralMetadataSchema,
  emotional: EmotionalMetadataSchema,
  concepts: ConceptualMetadataSchema,
  methods: MethodMetadataSchema.optional(),
  narrative: NarrativeMetadataSchema,
  references: ReferenceMetadataSchema,
  domain: DomainMetadataSchema,
  quality: QualityMetadataSchema
})

// Partial metadata schema for graceful degradation
export const PartialChunkMetadataSchema = z.object({
  structural: StructuralMetadataSchema.optional(),
  emotional: EmotionalMetadataSchema.optional(),
  concepts: ConceptualMetadataSchema.optional(),
  methods: MethodMetadataSchema.optional(),
  narrative: NarrativeMetadataSchema.optional(),
  references: ReferenceMetadataSchema.optional(),
  domain: DomainMetadataSchema.optional(),
  quality: QualityMetadataSchema
})

/**
 * Validates complete metadata object.
 */
export function validateChunkMetadata(data: unknown): z.infer<typeof ChunkMetadataSchema> | null {
  try {
    return ChunkMetadataSchema.parse(data)
  } catch (error) {
    console.error('Metadata validation failed:', error)
    return null
  }
}

/**
 * Validates partial metadata object.
 */
export function validatePartialMetadata(data: unknown): z.infer<typeof PartialChunkMetadataSchema> | null {
  try {
    return PartialChunkMetadataSchema.parse(data)
  } catch (error) {
    console.error('Partial metadata validation failed:', error)
    return null
  }
}

/**
 * Safe parse with error details.
 */
export function safeParseMetadata(data: unknown): {
  success: boolean
  data?: z.infer<typeof ChunkMetadataSchema>
  errors?: z.ZodError
} {
  const result = ChunkMetadataSchema.safeParse(data)
  if (result.success) {
    return { success: true, data: result.data }
  } else {
    return { success: false, errors: result.error }
  }
}

/**
 * Extract validation errors as readable messages.
 */
export function getValidationErrors(error: z.ZodError): string[] {
  return error.errors.map(err => {
    const path = err.path.join('.')
    return `${path}: ${err.message}`
  })
}

/**
 * Validates individual metadata category.
 */
export const MetadataValidators = {
  structural: (data: unknown) => StructuralMetadataSchema.safeParse(data),
  emotional: (data: unknown) => EmotionalMetadataSchema.safeParse(data),
  concepts: (data: unknown) => ConceptualMetadataSchema.safeParse(data),
  methods: (data: unknown) => MethodMetadataSchema.safeParse(data),
  narrative: (data: unknown) => NarrativeMetadataSchema.safeParse(data),
  references: (data: unknown) => ReferenceMetadataSchema.safeParse(data),
  domain: (data: unknown) => DomainMetadataSchema.safeParse(data),
  quality: (data: unknown) => QualityMetadataSchema.safeParse(data)
}

/**
 * Type exports for use in other modules.
 */
export type StructuralMetadata = z.infer<typeof StructuralMetadataSchema>
export type EmotionalMetadata = z.infer<typeof EmotionalMetadataSchema>
export type ConceptualMetadata = z.infer<typeof ConceptualMetadataSchema>
export type MethodMetadata = z.infer<typeof MethodMetadataSchema>
export type NarrativeMetadata = z.infer<typeof NarrativeMetadataSchema>
export type ReferenceMetadata = z.infer<typeof ReferenceMetadataSchema>
export type DomainMetadata = z.infer<typeof DomainMetadataSchema>
export type QualityMetadata = z.infer<typeof QualityMetadataSchema>
export type ChunkMetadata = z.infer<typeof ChunkMetadataSchema>
export type PartialChunkMetadata = z.infer<typeof PartialChunkMetadataSchema>