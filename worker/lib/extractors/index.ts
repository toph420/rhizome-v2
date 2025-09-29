/**
 * Central exports for all metadata extractors.
 * Part of the 7-engine collision detection system.
 */

// Structural patterns extractor
export { 
  extractStructuralPatterns,
  type AIStructuralAnalysis 
} from './structural-patterns'

// Emotional tone analyzer
export { 
  analyzeEmotionalTone,
  type AIEmotionalAnalysis 
} from './emotional-tone'

// Key concepts extractor
export { 
  extractKeyConcepts,
  type AIConceptualAnalysis 
} from './key-concepts'

// Method signatures detector
export { 
  detectMethodSignatures,
  type AIMethodAnalysis 
} from './method-signatures'

// Narrative rhythm analyzer
export { 
  analyzeNarrativeRhythm,
  type AINarrativeAnalysis 
} from './narrative-rhythm'

// Reference extractor
export {
  extractReferences,
  type AIReferenceAnalysis
} from './references'

// Domain analyzer
export {
  analyzeDomain,
  type AIDomainAnalysis
} from './domain'

// AI prompt generators (for future Gemini integration)
export { 
  generateStructuralPrompt,
  generateTemplatePrompt,
  generateHierarchyPrompt,
  EXAMPLE_RESPONSES as STRUCTURAL_EXAMPLE_RESPONSES,
  validateStructuralResponse
} from './prompts/structural'
export {
  generateEmotionalPrompt,
  EXAMPLE_RESPONSES as EMOTIONAL_EXAMPLE_RESPONSES,
  validateEmotionalResponse
} from './prompts/emotional'

// Re-export types for convenience
export type { 
  ChunkMetadata,
  StructuralMetadata,
  EmotionalMetadata,
  ConceptualMetadata,
  MethodMetadata,
  NarrativeMetadata,
  ReferenceMetadata,
  DomainMetadata,
  QualityMetadata
} from '../../types/metadata'