/**
 * Weight configuration management for collision detection scoring.
 * Provides presets, validation, and user preference management.
 */

import { WeightConfig, EngineType } from '../engines/types';

/**
 * Preset weight configurations for common use cases.
 */
export enum WeightPreset {
  DEFAULT = 'default',
  SEMANTIC_FOCUS = 'semantic_focus',
  STRUCTURAL_FOCUS = 'structural_focus',
  RESEARCH_FOCUS = 'research_focus',
  CREATIVE_FOCUS = 'creative_focus',
  BALANCED = 'balanced',
  CUSTOM = 'custom',
}

/**
 * Preset configuration with metadata.
 */
export interface PresetConfig {
  name: string;
  description: string;
  weights: WeightConfig;
  recommendedFor: string[];
}

/**
 * User preference for weight configuration.
 */
export interface UserWeightPreference {
  userId: string;
  preset: WeightPreset;
  customWeights?: WeightConfig;
  lastModified: Date;
}

/**
 * Weight configuration manager class.
 * Handles presets, validation, and user preferences.
 */
export class WeightConfigManager {
  private static presets: Map<WeightPreset, PresetConfig> = new Map();
  private userPreferences: Map<string, UserWeightPreference> = new Map();
  
  constructor() {
    this.initializePresets();
  }
  
  /**
   * Initializes all preset configurations.
   */
  private initializePresets(): void {
    // Default balanced configuration
    WeightConfigManager.presets.set(WeightPreset.DEFAULT, {
      name: 'Default',
      description: 'Balanced configuration for general use',
      weights: {
        weights: {
          [EngineType.SEMANTIC_SIMILARITY]: 0.25,
          [EngineType.STRUCTURAL_PATTERN]: 0.15,
          [EngineType.TEMPORAL_PROXIMITY]: 0.10,
          [EngineType.CONCEPTUAL_DENSITY]: 0.20,
          [EngineType.EMOTIONAL_RESONANCE]: 0.10,
          [EngineType.CITATION_NETWORK]: 0.15,
          [EngineType.CONTRADICTION_DETECTION]: 0.05,
        },
        normalizationMethod: 'linear',
        combineMethod: 'sum',
      },
      recommendedFor: ['general reading', 'mixed content', 'exploration'],
    });
    
    // Semantic-focused configuration
    WeightConfigManager.presets.set(WeightPreset.SEMANTIC_FOCUS, {
      name: 'Semantic Focus',
      description: 'Prioritizes meaning and concept relationships',
      weights: {
        weights: {
          [EngineType.SEMANTIC_SIMILARITY]: 0.40,
          [EngineType.STRUCTURAL_PATTERN]: 0.10,
          [EngineType.TEMPORAL_PROXIMITY]: 0.05,
          [EngineType.CONCEPTUAL_DENSITY]: 0.30,
          [EngineType.EMOTIONAL_RESONANCE]: 0.05,
          [EngineType.CITATION_NETWORK]: 0.05,
          [EngineType.CONTRADICTION_DETECTION]: 0.05,
        },
        normalizationMethod: 'sigmoid',
        combineMethod: 'average',
      },
      recommendedFor: ['academic research', 'concept mapping', 'learning'],
    });
    
    // Structural-focused configuration
    WeightConfigManager.presets.set(WeightPreset.STRUCTURAL_FOCUS, {
      name: 'Structural Focus',
      description: 'Emphasizes document structure and patterns',
      weights: {
        weights: {
          [EngineType.SEMANTIC_SIMILARITY]: 0.15,
          [EngineType.STRUCTURAL_PATTERN]: 0.35,
          [EngineType.TEMPORAL_PROXIMITY]: 0.10,
          [EngineType.CONCEPTUAL_DENSITY]: 0.15,
          [EngineType.EMOTIONAL_RESONANCE]: 0.05,
          [EngineType.CITATION_NETWORK]: 0.10,
          [EngineType.CONTRADICTION_DETECTION]: 0.10,
        },
        normalizationMethod: 'linear',
        combineMethod: 'max',
      },
      recommendedFor: ['technical documentation', 'code analysis', 'structured texts'],
    });
    
    // Research-focused configuration
    WeightConfigManager.presets.set(WeightPreset.RESEARCH_FOCUS, {
      name: 'Research Focus',
      description: 'Optimized for academic and research materials',
      weights: {
        weights: {
          [EngineType.SEMANTIC_SIMILARITY]: 0.20,
          [EngineType.STRUCTURAL_PATTERN]: 0.10,
          [EngineType.TEMPORAL_PROXIMITY]: 0.05,
          [EngineType.CONCEPTUAL_DENSITY]: 0.25,
          [EngineType.EMOTIONAL_RESONANCE]: 0.05,
          [EngineType.CITATION_NETWORK]: 0.30,
          [EngineType.CONTRADICTION_DETECTION]: 0.05,
        },
        normalizationMethod: 'linear',
        combineMethod: 'sum',
      },
      recommendedFor: ['academic papers', 'research articles', 'citation analysis'],
    });
    
    // Creative-focused configuration
    WeightConfigManager.presets.set(WeightPreset.CREATIVE_FOCUS, {
      name: 'Creative Focus',
      description: 'Enhances creative and emotional connections',
      weights: {
        weights: {
          [EngineType.SEMANTIC_SIMILARITY]: 0.15,
          [EngineType.STRUCTURAL_PATTERN]: 0.10,
          [EngineType.TEMPORAL_PROXIMITY]: 0.15,
          [EngineType.CONCEPTUAL_DENSITY]: 0.15,
          [EngineType.EMOTIONAL_RESONANCE]: 0.35,
          [EngineType.CITATION_NETWORK]: 0.05,
          [EngineType.CONTRADICTION_DETECTION]: 0.05,
        },
        normalizationMethod: 'sigmoid',
        combineMethod: 'harmonic_mean',
      },
      recommendedFor: ['creative writing', 'narrative analysis', 'emotional content'],
    });
    
    // Perfectly balanced configuration
    WeightConfigManager.presets.set(WeightPreset.BALANCED, {
      name: 'Perfectly Balanced',
      description: 'Equal weight to all engines',
      weights: {
        weights: {
          [EngineType.SEMANTIC_SIMILARITY]: 1/7,
          [EngineType.STRUCTURAL_PATTERN]: 1/7,
          [EngineType.TEMPORAL_PROXIMITY]: 1/7,
          [EngineType.CONCEPTUAL_DENSITY]: 1/7,
          [EngineType.EMOTIONAL_RESONANCE]: 1/7,
          [EngineType.CITATION_NETWORK]: 1/7,
          [EngineType.CONTRADICTION_DETECTION]: 1/7,
        },
        normalizationMethod: 'linear',
        combineMethod: 'average',
      },
      recommendedFor: ['experimentation', 'comparison', 'testing'],
    });
  }
  
  /**
   * Gets a preset configuration.
   */
  getPreset(preset: WeightPreset): PresetConfig | undefined {
    return WeightConfigManager.presets.get(preset);
  }
  
  /**
   * Gets all available presets.
   */
  getAllPresets(): PresetConfig[] {
    return Array.from(WeightConfigManager.presets.values());
  }
  
  /**
   * Gets weight configuration for a preset.
   */
  getPresetWeights(preset: WeightPreset): WeightConfig {
    const config = this.getPreset(preset);
    if (!config) {
      throw new Error(`Unknown preset: ${preset}`);
    }
    return config.weights;
  }
  
  /**
   * Validates a weight configuration.
   */
  validateWeights(weights: WeightConfig): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    // Check weight values
    for (const [engine, weight] of Object.entries(weights.weights)) {
      if (weight < 0 || weight > 1) {
        errors.push(`Invalid weight for ${engine}: ${weight} (must be 0-1)`);
      }
    }
    
    // Check at least one non-zero weight
    const totalWeight = Object.values(weights.weights).reduce((a, b) => a + b, 0);
    if (totalWeight === 0) {
      errors.push('At least one engine weight must be non-zero');
    }
    
    // Validate normalization method
    const validNormalization = ['linear', 'sigmoid', 'softmax'];
    if (!validNormalization.includes(weights.normalizationMethod)) {
      errors.push(`Invalid normalization method: ${weights.normalizationMethod}`);
    }
    
    // Validate combine method
    const validCombine = ['sum', 'average', 'max', 'harmonic_mean'];
    if (!validCombine.includes(weights.combineMethod)) {
      errors.push(`Invalid combine method: ${weights.combineMethod}`);
    }
    
    return {
      valid: errors.length === 0,
      errors,
    };
  }
  
  /**
   * Saves user weight preference.
   */
  saveUserPreference(
    userId: string,
    preset: WeightPreset,
    customWeights?: WeightConfig
  ): void {
    if (preset === WeightPreset.CUSTOM && !customWeights) {
      throw new Error('Custom weights must be provided for CUSTOM preset');
    }
    
    if (customWeights) {
      const validation = this.validateWeights(customWeights);
      if (!validation.valid) {
        throw new Error(`Invalid weights: ${validation.errors.join(', ')}`);
      }
    }
    
    this.userPreferences.set(userId, {
      userId,
      preset,
      customWeights,
      lastModified: new Date(),
    });
  }
  
  /**
   * Gets user weight preference.
   */
  getUserPreference(userId: string): UserWeightPreference | undefined {
    return this.userPreferences.get(userId);
  }
  
  /**
   * Gets effective weights for a user.
   */
  getUserWeights(userId: string): WeightConfig {
    const preference = this.getUserPreference(userId);
    
    if (!preference) {
      return this.getPresetWeights(WeightPreset.DEFAULT);
    }
    
    if (preference.preset === WeightPreset.CUSTOM && preference.customWeights) {
      return preference.customWeights;
    }
    
    return this.getPresetWeights(preference.preset);
  }
  
  /**
   * Exports user preferences for persistence.
   */
  exportUserPreferences(): UserWeightPreference[] {
    return Array.from(this.userPreferences.values());
  }
  
  /**
   * Imports user preferences from storage.
   */
  importUserPreferences(preferences: UserWeightPreference[]): void {
    for (const pref of preferences) {
      this.userPreferences.set(pref.userId, pref);
    }
  }
  
  /**
   * Suggests a preset based on document type or content.
   */
  suggestPreset(documentType: string): WeightPreset {
    const typeMap: Record<string, WeightPreset> = {
      'academic': WeightPreset.RESEARCH_FOCUS,
      'research': WeightPreset.RESEARCH_FOCUS,
      'technical': WeightPreset.STRUCTURAL_FOCUS,
      'code': WeightPreset.STRUCTURAL_FOCUS,
      'creative': WeightPreset.CREATIVE_FOCUS,
      'narrative': WeightPreset.CREATIVE_FOCUS,
      'general': WeightPreset.DEFAULT,
    };
    
    return typeMap[documentType.toLowerCase()] || WeightPreset.DEFAULT;
  }
}

// Export singleton instance
export const weightConfigManager = new WeightConfigManager();

// Export default weights for backward compatibility
export const DEFAULT_WEIGHTS = weightConfigManager.getPresetWeights(WeightPreset.DEFAULT);