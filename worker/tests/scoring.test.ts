/**
 * Unit tests for the weighted scoring system.
 * Tests score calculation, normalization, ranking, and weight configuration.
 */

import { ScoringSystem, createScoringSystem } from '../engines/scoring';
import { 
  WeightConfigManager, 
  WeightPreset, 
  DEFAULT_WEIGHTS,
  weightConfigManager 
} from '../lib/weight-config';
import type { EngineType } from '../engines/types';

describe('ScoringSystem', () => {
  let scoringSystem: ScoringSystem;
  
  beforeEach(() => {
    // Create scoring system with default weights
    scoringSystem = createScoringSystem();
  });
  
  describe('Weight Application', () => {
    it('should apply weights correctly to engine scores', () => {
      const collisions = [
        {
          sourceChunkId: 'chunk1',
          targetChunkId: 'target1',
          engineType: "semantic_similarity",
          score: 0.8,
          confidence: 0.9,
          explanation: 'High semantic similarity',
        },
        {
          sourceChunkId: 'chunk1',
          targetChunkId: 'target1',
          engineType: "conceptual_density",
          score: 0.6,
          confidence: 0.8,
          explanation: 'Moderate concept overlap',
        },
      ];
      
      const { score, explanations } = scoringSystem.calculateWeightedScore(collisions);
      
      // Expected: (0.8 * 0.25) + (0.6 * 0.20) = 0.20 + 0.12 = 0.32
      // With linear normalization by total weight (0.45): 0.32 / 0.45 = 0.711
      expect(score).toBeCloseTo(0.711, 2);
      expect(explanations).toHaveLength(2);
      expect(explanations[0].engineType).toBe("semantic_similarity");
      expect(explanations[0].contributionScore).toBeCloseTo(0.20, 2);
    });
    
    it('should handle single engine results', () => {
      const collisions = [
        {
          sourceChunkId: 'chunk1',
          targetChunkId: 'target1',
          engineType: "citation_network",
          score: 0.9,
          confidence: 0.95,
          explanation: 'Strong citation network',
        },
      ];
      
      const { score, explanations } = scoringSystem.calculateWeightedScore(collisions);
      
      // Single engine: 0.9 * 0.15 = 0.135, normalized by weight 0.15: 0.135/0.15 = 0.9
      expect(score).toBeCloseTo(0.9, 2);
      expect(explanations).toHaveLength(1);
      expect(explanations[0].contributionPercentage).toBe(100);
    });
    
    it('should handle zero weights correctly', () => {
      const customWeights = {
        weights: {
          ...DEFAULT_WEIGHTS.weights,
          ["emotional_resonance"]: 0,
          ["contradiction_detection"]: 0,
        },
        normalizationMethod: 'linear',
        combineMethod: 'sum',
      };
      
      const customScoring = new ScoringSystem(customWeights);
      
      const collisions = [
        {
          sourceChunkId: 'chunk1',
          targetChunkId: 'target1',
          engineType: "emotional_resonance",
          score: 1.0,
          confidence: 1.0,
          explanation: 'Perfect emotional match (ignored)',
        },
        {
          sourceChunkId: 'chunk1',
          targetChunkId: 'target1',
          engineType: "semantic_similarity",
          score: 0.5,
          confidence: 0.8,
          explanation: 'Moderate semantic match',
        },
      ];
      
      const { score, explanations } = customScoring.calculateWeightedScore(collisions);
      
      // Only semantic similarity counted: 0.5 * 0.25 = 0.125, normalized by 0.25 = 0.5
      expect(score).toBeCloseTo(0.5, 2);
      // Only one explanation should have non-zero contribution
      const contributingExplanations = explanations.filter(e => e.contributionScore > 0);
      expect(contributingExplanations).toHaveLength(1);
      expect(contributingExplanations[0].engineType).toBe("semantic_similarity");
    });
  });
  
  describe('Normalization', () => {
    it('should apply linear normalization correctly', () => {
      const results = {
        collisions: [],
        groupedByTarget: new Map([
          ['target1', [
            {
              engineType: "semantic_similarity",
              score: 0.8,
              confidence: 0.9,
              targetChunkId: 'target1',
              sourceChunkId: 'chunk1',
              explanation: 'test',
            },
          ]],
        ]),
        weightedScores: new Map(),
        topConnections: [],
        metrics: {
          totalExecutionTime: 100,
          engineMetrics: new Map(),
        },
      };
      
      const scored = scoringSystem.applyWeightedScoring(results);
      
      expect(scored.weightedScores.size).toBe(1);
      expect(scored.weightedScores.get('target1')).toBeCloseTo(0.8, 2);
    });
    
    it('should apply sigmoid normalization correctly', () => {
      const customWeights = {
        ...DEFAULT_WEIGHTS,
        normalizationMethod: 'sigmoid',
      };
      
      const customScoring = new ScoringSystem(customWeights);
      
      const collisions = [
        {
          sourceChunkId: 'chunk1',
          targetChunkId: 'target1',
          engineType: "semantic_similarity",
          score: 0.5,
          confidence: 0.8,
          explanation: 'Moderate match',
        },
      ];
      
      const { score } = customScoring.calculateWeightedScore(collisions);
      
      // Sigmoid normalization should produce different result
      expect(score).toBeGreaterThan(0);
      expect(score).toBeLessThan(1);
      // Sigmoid(0.125 with adjustment) should be around 0.5
      expect(score).toBeCloseTo(0.5, 1);
    });
  });
  
  describe('Ranking', () => {
    it('should rank results by score correctly', () => {
      const results = {
        collisions: [],
        groupedByTarget: new Map([
          ['target1', [
            {
              engineType: "semantic_similarity",
              score: 0.8,
              confidence: 0.9,
              targetChunkId: 'target1',
              sourceChunkId: 'chunk1',
              explanation: 'High match',
            },
          ]],
          ['target2', [
            {
              engineType: "semantic_similarity",
              score: 0.3,
              confidence: 0.7,
              targetChunkId: 'target2',
              sourceChunkId: 'chunk1',
              explanation: 'Low match',
            },
          ]],
          ['target3', [
            {
              engineType: "semantic_similarity",
              score: 0.6,
              confidence: 0.8,
              targetChunkId: 'target3',
              sourceChunkId: 'chunk1',
              explanation: 'Medium match',
            },
          ]],
        ]),
        weightedScores: new Map(),
        topConnections: [],
        metrics: {
          totalExecutionTime: 100,
          engineMetrics: new Map(),
        },
      };
      
      const scored = scoringSystem.applyWeightedScoring(results);
      
      expect(scored.topConnections).toHaveLength(3);
      expect(scored.topConnections[0].targetChunkId).toBe('target1');
      expect(scored.topConnections[0].rank).toBe(1);
      expect(scored.topConnections[1].targetChunkId).toBe('target3');
      expect(scored.topConnections[1].rank).toBe(2);
      expect(scored.topConnections[2].targetChunkId).toBe('target2');
      expect(scored.topConnections[2].rank).toBe(3);
    });
    
    it('should include all engines in connection metadata', () => {
      const results = {
        collisions: [],
        groupedByTarget: new Map([
          ['target1', [
            {
              engineType: "semantic_similarity",
              score: 0.8,
              confidence: 0.9,
              targetChunkId: 'target1',
              sourceChunkId: 'chunk1',
              explanation: 'Semantic match',
            },
            {
              engineType: "structural_pattern",
              score: 0.6,
              confidence: 0.8,
              targetChunkId: 'target1',
              sourceChunkId: 'chunk1',
              explanation: 'Structural match',
            },
            {
              engineType: "temporal_proximity",
              score: 0.7,
              confidence: 0.85,
              targetChunkId: 'target1',
              sourceChunkId: 'chunk1',
              explanation: 'Temporal match',
            },
          ]],
        ]),
        weightedScores: new Map(),
        topConnections: [],
        metrics: {
          totalExecutionTime: 100,
          engineMetrics: new Map(),
        },
      };
      
      const scored = scoringSystem.applyWeightedScoring(results);
      
      expect(scored.topConnections).toHaveLength(1);
      const connection = scored.topConnections[0];
      expect(connection.engines).toContain("semantic_similarity");
      expect(connection.engines).toContain("structural_pattern");
      expect(connection.engines).toContain("temporal_proximity");
      expect(connection.engines).toHaveLength(3);
      expect(connection.explanations).toHaveLength(3);
    });
  });
  
  describe('Score Combination Methods', () => {
    it('should use sum method correctly', () => {
      const weights = {
        ...DEFAULT_WEIGHTS,
        combineMethod: 'sum',
      };
      
      const customScoring = new ScoringSystem(weights);
      
      // Multiple results from same engine
      const collisions = [
        {
          engineType: "semantic_similarity",
          score: 0.4,
          confidence: 0.8,
          targetChunkId: 'target1',
          sourceChunkId: 'chunk1',
          explanation: 'Match 1',
        },
        {
          engineType: "semantic_similarity",
          score: 0.3,
          confidence: 0.7,
          targetChunkId: 'target1',
          sourceChunkId: 'chunk1',
          explanation: 'Match 2',
        },
      ];
      
      const { score } = customScoring.calculateWeightedScore(collisions);
      
      // Sum capped at 1: min(0.4 + 0.3, 1) = 0.7, weighted by 0.25 = 0.175, normalized = 0.7
      expect(score).toBeCloseTo(0.7, 2);
    });
    
    it('should use average method correctly', () => {
      const weights = {
        ...DEFAULT_WEIGHTS,
        combineMethod: 'average',
      };
      
      const customScoring = new ScoringSystem(weights);
      
      const collisions = [
        {
          engineType: "semantic_similarity",
          score: 0.8,
          confidence: 0.9,
          targetChunkId: 'target1',
          sourceChunkId: 'chunk1',
          explanation: 'Match 1',
        },
        {
          engineType: "semantic_similarity",
          score: 0.4,
          confidence: 0.7,
          targetChunkId: 'target1',
          sourceChunkId: 'chunk1',
          explanation: 'Match 2',
        },
      ];
      
      const { score } = customScoring.calculateWeightedScore(collisions);
      
      // Average: (0.8 + 0.4) / 2 = 0.6, weighted by 0.25 = 0.15, normalized = 0.6
      expect(score).toBeCloseTo(0.6, 2);
    });
    
    it('should use max method correctly', () => {
      const weights = {
        ...DEFAULT_WEIGHTS,
        combineMethod: 'max',
      };
      
      const customScoring = new ScoringSystem(weights);
      
      const collisions = [
        {
          engineType: "semantic_similarity",
          score: 0.4,
          confidence: 0.7,
          targetChunkId: 'target1',
          sourceChunkId: 'chunk1',
          explanation: 'Match 1',
        },
        {
          engineType: "semantic_similarity",
          score: 0.9,
          confidence: 0.95,
          targetChunkId: 'target1',
          sourceChunkId: 'chunk1',
          explanation: 'Match 2',
        },
        {
          engineType: "semantic_similarity",
          score: 0.6,
          confidence: 0.8,
          targetChunkId: 'target1',
          sourceChunkId: 'chunk1',
          explanation: 'Match 3',
        },
      ];
      
      const { score } = customScoring.calculateWeightedScore(collisions);
      
      // Max: 0.9, weighted by 0.25 = 0.225, normalized = 0.9
      expect(score).toBeCloseTo(0.9, 2);
    });
  });
  
  describe('Configuration Updates', () => {
    it('should update weights correctly', () => {
      const newWeights = {
        weights: {
          ...DEFAULT_WEIGHTS.weights,
          ["semantic_similarity"]: 0.5,
        },
        normalizationMethod: 'linear',
        combineMethod: 'sum',
      };
      
      scoringSystem.updateWeights(newWeights);
      
      const collisions = [
        {
          engineType: "semantic_similarity",
          score: 0.8,
          confidence: 0.9,
          targetChunkId: 'target1',
          sourceChunkId: 'chunk1',
          explanation: 'High match',
        },
      ];
      
      const { score } = scoringSystem.calculateWeightedScore(collisions);
      
      // With new weight: 0.8 * 0.5 = 0.4, normalized by 0.5 = 0.8
      expect(score).toBeCloseTo(0.8, 2);
    });
    
    it('should validate weights on update', () => {
      const invalidWeights = {
        weights: {
          ["semantic_similarity"]: 1.5, // Invalid: > 1
        },
        normalizationMethod: 'linear',
        combineMethod: 'sum',
      };
      
      expect(() => {
        scoringSystem.updateWeights(invalidWeights);
      }).toThrow('Invalid weight');
    });
    
    it('should reject all-zero weights', () => {
      const zeroWeights = {
        weights: {
          ["semantic_similarity"]: 0,
          ["structural_pattern"]: 0,
          ["temporal_proximity"]: 0,
          ["conceptual_density"]: 0,
          ["emotional_resonance"]: 0,
          ["citation_network"]: 0,
          ["contradiction_detection"]: 0,
        },
        normalizationMethod: 'linear',
        combineMethod: 'sum',
      };
      
      expect(() => {
        new ScoringSystem(zeroWeights);
      }).toThrow('At least one engine weight must be non-zero');
    });
  });
});

describe('WeightConfigManager', () => {
  let manager: WeightConfigManager;
  
  beforeEach(() => {
    manager = new WeightConfigManager();
  });
  
  describe('Presets', () => {
    it('should have all defined presets', () => {
      const presets = manager.getAllPresets();
      expect(presets).toHaveLength(6);
      
      const presetNames = presets.map(p => p.name);
      expect(presetNames).toContain('Default');
      expect(presetNames).toContain('Semantic Focus');
      expect(presetNames).toContain('Structural Focus');
      expect(presetNames).toContain('Research Focus');
      expect(presetNames).toContain('Creative Focus');
      expect(presetNames).toContain('Perfectly Balanced');
    });
    
    it('should get preset weights correctly', () => {
      const weights = manager.getPresetWeights(WeightPreset.SEMANTIC_FOCUS);
      
      expect(weights.weights["semantic_similarity"]).toBe(0.40);
      expect(weights.weights["conceptual_density"]).toBe(0.30);
      expect(weights.normalizationMethod).toBe('sigmoid');
      expect(weights.combineMethod).toBe('average');
    });
    
    it('should suggest appropriate presets', () => {
      expect(manager.suggestPreset('academic')).toBe(WeightPreset.RESEARCH_FOCUS);
      expect(manager.suggestPreset('technical')).toBe(WeightPreset.STRUCTURAL_FOCUS);
      expect(manager.suggestPreset('creative')).toBe(WeightPreset.CREATIVE_FOCUS);
      expect(manager.suggestPreset('unknown')).toBe(WeightPreset.DEFAULT);
    });
  });
  
  describe('User Preferences', () => {
    it('should save and retrieve user preferences', () => {
      const userId = 'user123';
      
      manager.saveUserPreference(userId, WeightPreset.RESEARCH_FOCUS);
      
      const pref = manager.getUserPreference(userId);
      expect(pref).toBeDefined();
      expect(pref.userId).toBe(userId);
      expect(pref.preset).toBe(WeightPreset.RESEARCH_FOCUS);
      expect(pref.lastModified).toBeInstanceOf(Date);
    });
    
    it('should handle custom weights', () => {
      const userId = 'user456';
      const customWeights = {
        weights: {
          ["semantic_similarity"]: 0.6,
          ["structural_pattern"]: 0.1,
          ["temporal_proximity"]: 0.05,
          ["conceptual_density"]: 0.15,
          ["emotional_resonance"]: 0.05,
          ["citation_network"]: 0.03,
          ["contradiction_detection"]: 0.02,
        },
        normalizationMethod: 'sigmoid',
        combineMethod: 'max',
      };
      
      manager.saveUserPreference(userId, WeightPreset.CUSTOM, customWeights);
      
      const weights = manager.getUserWeights(userId);
      expect(weights.weights["semantic_similarity"]).toBe(0.6);
      expect(weights.combineMethod).toBe('max');
    });
    
    it('should validate custom weights', () => {
      const userId = 'user789';
      const invalidWeights = {
        weights: {
          ["semantic_similarity"]: 1.5, // Invalid
        },
        normalizationMethod: 'linear',
        combineMethod: 'sum',
      };
      
      expect(() => {
        manager.saveUserPreference(userId, WeightPreset.CUSTOM, invalidWeights);
      }).toThrow('Invalid weights');
    });
  });
  
  describe('Import/Export', () => {
    it('should export and import preferences', () => {
      const user1 = 'user1';
      const user2 = 'user2';
      
      manager.saveUserPreference(user1, WeightPreset.SEMANTIC_FOCUS);
      manager.saveUserPreference(user2, WeightPreset.CREATIVE_FOCUS);
      
      const exported = manager.exportUserPreferences();
      expect(exported).toHaveLength(2);
      
      // Create new manager and import
      const newManager = new WeightConfigManager();
      newManager.importUserPreferences(exported);
      
      expect(newManager.getUserPreference(user1).preset).toBe(WeightPreset.SEMANTIC_FOCUS);
      expect(newManager.getUserPreference(user2).preset).toBe(WeightPreset.CREATIVE_FOCUS);
    });
  });
});