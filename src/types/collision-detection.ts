/**
 * Type definitions for the collision detection system.
 * Shared between frontend and worker.
 */

export enum EngineType {
  SEMANTIC_SIMILARITY = 'semantic-similarity',
  STRUCTURAL_PATTERN = 'structural-pattern',
  TEMPORAL_PROXIMITY = 'temporal-proximity',
  CONCEPTUAL_DENSITY = 'conceptual-density',
  EMOTIONAL_RESONANCE = 'emotional-resonance',
  CITATION_NETWORK = 'citation-network',
  CONTRADICTION_DETECTION = 'contradiction-detection',
}

export interface WeightConfig {
  weights: {
    [key in EngineType]: number;
  };
  normalizationMethod: 'linear' | 'sigmoid' | 'softmax';
}

export const DEFAULT_WEIGHTS: WeightConfig = {
  weights: {
    [EngineType.SEMANTIC_SIMILARITY]: 0.25,
    [EngineType.STRUCTURAL_PATTERN]: 0.15,
    [EngineType.TEMPORAL_PROXIMITY]: 0.1,
    [EngineType.CONCEPTUAL_DENSITY]: 0.2,
    [EngineType.EMOTIONAL_RESONANCE]: 0.05,
    [EngineType.CITATION_NETWORK]: 0.15,
    [EngineType.CONTRADICTION_DETECTION]: 0.1,
  },
  normalizationMethod: 'linear',
};