import { WeightConfig, EngineType } from '../engines/types';

/**
 * User preference manager for collision detection engine weights.
 * Handles weight normalization, validation, and preset management.
 */
export class UserPreferenceManager {
  private static instance: UserPreferenceManager;
  private cache: Map<string, { config: WeightConfig; timestamp: number }> = new Map();
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  // Predefined preset configurations for 3-engine system
  public static readonly PRESETS = {
    balanced: {
      name: 'Balanced',
      description: 'Equal weight to all 3 engines',
      weights: {
        [EngineType.SEMANTIC_SIMILARITY]: 1/3,
        [EngineType.CONTRADICTION_DETECTION]: 1/3,
        [EngineType.THEMATIC_BRIDGE]: 1/3,
      },
      normalizationMethod: 'linear' as const,
      combineMethod: 'average' as const,
    },
    academic: {
      name: 'Academic',
      description: 'Focus on contradictions and semantic similarity for research',
      weights: {
        [EngineType.SEMANTIC_SIMILARITY]: 0.35,
        [EngineType.CONTRADICTION_DETECTION]: 0.45,
        [EngineType.THEMATIC_BRIDGE]: 0.20,
      },
      normalizationMethod: 'linear' as const,
      combineMethod: 'sum' as const,
    },
    narrative: {
      name: 'Narrative',
      description: 'Emphasis on thematic and creative connections',
      weights: {
        [EngineType.SEMANTIC_SIMILARITY]: 0.25,
        [EngineType.CONTRADICTION_DETECTION]: 0.15,
        [EngineType.THEMATIC_BRIDGE]: 0.60,
      },
      normalizationMethod: 'sigmoid' as const,
      combineMethod: 'harmonic_mean' as const,
    },
    analytical: {
      name: 'Analytical',
      description: 'Focus on contradictions and deep analysis',
      weights: {
        [EngineType.SEMANTIC_SIMILARITY]: 0.25,
        [EngineType.CONTRADICTION_DETECTION]: 0.40,
        [EngineType.THEMATIC_BRIDGE]: 0.35,
      },
      normalizationMethod: 'linear' as const,
      combineMethod: 'sum' as const,
    },
  };

  private constructor() {}

  /**
   * Get singleton instance of the preference manager.
   */
  public static getInstance(): UserPreferenceManager {
    if (!UserPreferenceManager.instance) {
      UserPreferenceManager.instance = new UserPreferenceManager();
    }
    return UserPreferenceManager.instance;
  }

  /**
   * Validates that weights sum to approximately 1.0.
   * @param weights - Engine weight configuration
   * @returns Whether weights are valid
   */
  public validateWeights(weights: Record<EngineType, number>): boolean {
    const sum = Object.values(weights).reduce((acc, weight) => acc + weight, 0);
    return Math.abs(sum - 1.0) <= 0.01;
  }

  /**
   * Normalizes weights to ensure they sum to 1.0.
   * @param weights - Engine weight configuration
   * @returns Normalized weights
   */
  public normalizeWeights(weights: Record<EngineType, number>): Record<EngineType, number> {
    const sum = Object.values(weights).reduce((acc, weight) => acc + weight, 0);
    
    if (sum === 0) {
      // If all weights are 0, distribute equally
      const equalWeight = 1.0 / Object.keys(weights).length;
      return Object.keys(weights).reduce((acc, key) => {
        acc[key as EngineType] = equalWeight;
        return acc;
      }, {} as Record<EngineType, number>);
    }
    
    // Normalize to sum to 1.0
    const normalized = {} as Record<EngineType, number>;
    Object.entries(weights).forEach(([engine, weight]) => {
      normalized[engine as EngineType] = weight / sum;
    });
    
    return normalized;
  }

  /**
   * Applies a normalization method to a score.
   * @param score - Raw score (0-1)
   * @param method - Normalization method
   * @returns Normalized score
   */
  public applyNormalization(
    score: number,
    method: 'linear' | 'sigmoid' | 'softmax'
  ): number {
    switch (method) {
      case 'linear':
        return score;
      
      case 'sigmoid':
        // Sigmoid normalization with adjustable steepness
        const k = 10; // Steepness factor
        return 1 / (1 + Math.exp(-k * (score - 0.5)));
      
      case 'softmax':
        // For single score, apply exponential scaling
        return Math.exp(score) / (Math.exp(score) + Math.exp(1 - score));
      
      default:
        return score;
    }
  }

  /**
   * Applies softmax normalization to a set of scores.
   * @param scores - Array of scores to normalize
   * @returns Normalized scores
   */
  public applySoftmaxToScores(scores: number[]): number[] {
    const expScores = scores.map(score => Math.exp(score));
    const sumExp = expScores.reduce((acc, exp) => acc + exp, 0);
    
    if (sumExp === 0) {
      // Avoid division by zero
      return scores.map(() => 1.0 / scores.length);
    }
    
    return expScores.map(exp => exp / sumExp);
  }

  /**
   * Calculates weighted score from engine results.
   * @param engineScores - Scores from each engine
   * @param config - Weight configuration
   * @returns Combined weighted score
   */
  public calculateWeightedScore(
    engineScores: Record<EngineType, number>,
    config: WeightConfig
  ): number {
    let weightedSum = 0;
    let totalWeight = 0;
    
    Object.entries(engineScores).forEach(([engine, score]) => {
      const weight = config.weights[engine as EngineType] || 0;
      const normalizedScore = this.applyNormalization(score, config.normalizationMethod);
      weightedSum += normalizedScore * weight;
      totalWeight += weight;
    });
    
    // Avoid division by zero
    if (totalWeight === 0) {
      return 0;
    }
    
    return weightedSum / totalWeight;
  }

  /**
   * Gets a preset configuration by name.
   * @param presetName - Name of the preset
   * @returns Preset configuration or null
   */
  public getPreset(presetName: keyof typeof UserPreferenceManager.PRESETS): WeightConfig | null {
    const preset = UserPreferenceManager.PRESETS[presetName];
    if (!preset) {
      return null;
    }

    return {
      weights: preset.weights,
      normalizationMethod: preset.normalizationMethod,
      combineMethod: preset.combineMethod,
    };
  }

  /**
   * Caches user preferences for fast retrieval.
   * @param userId - User ID
   * @param config - Weight configuration
   */
  public cachePreferences(userId: string, config: WeightConfig): void {
    this.cache.set(userId, {
      config,
      timestamp: Date.now(),
    });
  }

  /**
   * Gets cached preferences if available and not expired.
   * @param userId - User ID
   * @returns Cached configuration or null
   */
  public getCachedPreferences(userId: string): WeightConfig | null {
    const cached = this.cache.get(userId);
    
    if (!cached) {
      return null;
    }
    
    // Check if cache is expired
    if (Date.now() - cached.timestamp > this.CACHE_TTL) {
      this.cache.delete(userId);
      return null;
    }
    
    return cached.config;
  }

  /**
   * Clears the preference cache.
   */
  public clearCache(): void {
    this.cache.clear();
  }

  /**
   * Clears cache for a specific user.
   * @param userId - User ID
   */
  public clearUserCache(userId: string): void {
    this.cache.delete(userId);
  }

  /**
   * Validates and sanitizes a weight configuration.
   * @param config - Weight configuration to validate
   * @returns Validated and normalized configuration
   */
  public validateAndSanitizeConfig(config: WeightConfig): WeightConfig {
    // Ensure all engines have a weight
    const completeWeights = {} as Record<EngineType, number>;
    
    Object.values(EngineType).forEach(engine => {
      const weight = config.weights[engine];
      // Clamp between 0 and 1
      completeWeights[engine] = Math.max(0, Math.min(1, weight || 0));
    });
    
    // Normalize weights
    const normalizedWeights = this.normalizeWeights(completeWeights);
    
    // Validate normalization method
    const validMethods = ['linear', 'sigmoid', 'softmax'];
    const normalizationMethod = validMethods.includes(config.normalizationMethod)
      ? config.normalizationMethod
      : 'linear' as const;
    
    return {
      weights: normalizedWeights,
      normalizationMethod,
      combineMethod: config.combineMethod || 'sum',
    };
  }

  /**
   * Generates a score explanation showing contribution from each engine.
   * @param engineScores - Individual engine scores
   * @param config - Weight configuration
   * @returns Detailed breakdown of score calculation
   */
  public explainScore(
    engineScores: Record<EngineType, number>,
    config: WeightConfig
  ): {
    totalScore: number;
    breakdown: Array<{
      engine: EngineType;
      rawScore: number;
      normalizedScore: number;
      weight: number;
      contribution: number;
    }>;
  } {
    const breakdown: Array<{
      engine: EngineType;
      rawScore: number;
      normalizedScore: number;
      weight: number;
      contribution: number;
    }> = [];
    
    let totalContribution = 0;
    
    Object.entries(engineScores).forEach(([engine, rawScore]) => {
      const weight = config.weights[engine as EngineType] || 0;
      const normalizedScore = this.applyNormalization(rawScore, config.normalizationMethod);
      const contribution = normalizedScore * weight;
      
      breakdown.push({
        engine: engine as EngineType,
        rawScore,
        normalizedScore,
        weight,
        contribution,
      });
      
      totalContribution += contribution;
    });
    
    // Sort by contribution (highest first)
    breakdown.sort((a, b) => b.contribution - a.contribution);
    
    return {
      totalScore: totalContribution,
      breakdown,
    };
  }
}

// Export singleton instance
export const preferenceManager = UserPreferenceManager.getInstance();