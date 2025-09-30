/**
 * Weighted scoring system for collision detection results.
 * Handles score calculation, normalization, and ranking of connections.
 */

import {
  CollisionResult,
  EngineType,
  WeightConfig,
  AggregatedResults,
} from './types';

import { DEFAULT_WEIGHTS } from '../lib/weight-config';
import { preferenceManager } from '../lib/user-preferences';

/**
 * Score explanation for transparency.
 */
export interface ScoreExplanation {
  engineType: EngineType;
  rawScore: number;
  weight: number;
  contributionScore: number;
  contributionPercentage: number;
}

/**
 * Ranked connection with full scoring breakdown.
 */
export interface RankedConnection {
  targetChunkId: string;
  totalScore: number;
  normalizedScore: number;
  engines: EngineType[];
  scoreBreakdown: ScoreExplanation[];
  explanations: string[];
  rank: number;
}

/**
 * Main scoring system class.
 * Applies weighted scoring to collision detection results.
 */
export class ScoringSystem {
  private weights: WeightConfig;
  
  constructor(weights: WeightConfig) {
    this.weights = weights;
    this.validateWeights();
  }
  
  /**
   * Applies weighted scoring to aggregated results.
   * @param results - Aggregated results from all engines
   * @returns Results with weighted scores and rankings
   */
  applyWeightedScoring(results: AggregatedResults): AggregatedResults {
    const weightedScores = new Map<string, number>();
    const scoreExplanations = new Map<string, ScoreExplanation[]>();
    
    // Calculate weighted scores for each target chunk
    for (const [targetId, collisions] of results.groupedByTarget) {
      const { score, explanations } = this.calculateWeightedScore(collisions);
      weightedScores.set(targetId, score);
      scoreExplanations.set(targetId, explanations);
    }
    
    // Create ranked connections list
    const topConnections = this.createRankedConnections(
      weightedScores,
      scoreExplanations,
      results.groupedByTarget
    );
    
    return {
      ...results,
      weightedScores,
      topConnections,
    };
  }
  
  /**
   * Calculates weighted score for a set of collisions.
   * @param collisions - Array of collision results for a single target
   * @returns Combined score and explanations
   */
  calculateWeightedScore(
    collisions: CollisionResult[]
  ): { score: number; explanations: ScoreExplanation[] } {
    // Group collisions by engine type
    const byEngine = this.groupByEngine(collisions);
    
    // Prepare engine scores for preference manager
    const engineScores: Record<EngineType, number> = {} as Record<EngineType, number>;
    
    // Calculate individual engine scores
    for (const [engineType, engineCollisions] of byEngine) {
      const engineScore = this.aggregateEngineScores(
        engineCollisions,
        this.weights.combineMethod
      );
      engineScores[engineType] = engineScore;
    }
    
    // Use preference manager for weighted calculation
    const totalScore = preferenceManager.calculateWeightedScore(
      engineScores,
      this.weights
    );
    
    // Get detailed explanation from preference manager
    const scoreExplanation = preferenceManager.explainScore(
      engineScores,
      this.weights
    );
    
    // Calculate total actual contributions for percentage calculation
    const totalContributions = scoreExplanation.breakdown.reduce((sum, item) => sum + item.contribution, 0);
    
    return {
      score: totalScore,
      explanations: scoreExplanation.breakdown.map(item => ({
        engineType: item.engine,
        rawScore: item.rawScore,
        weight: item.weight,
        contributionScore: item.contribution,
        contributionPercentage: totalContributions > 0 ? (item.contribution / totalContributions) * 100 : 0,
      })),
    };
  }
  
  /**
   * Groups collisions by engine type.
   */
  private groupByEngine(
    collisions: CollisionResult[]
  ): Map<EngineType, CollisionResult[]> {
    const byEngine = new Map<EngineType, CollisionResult[]>();
    
    for (const collision of collisions) {
      const existing = byEngine.get(collision.engineType) || [];
      existing.push(collision);
      byEngine.set(collision.engineType, existing);
    }
    
    return byEngine;
  }
  
  /**
   * Aggregates multiple scores from the same engine.
   */
  private aggregateEngineScores(
    collisions: CollisionResult[],
    method: 'sum' | 'average' | 'max' | 'harmonic_mean'
  ): number {
    const scores = collisions.map(c => c.score);
    
    if (scores.length === 0) return 0;
    
    switch (method) {
      case 'sum':
        return Math.min(scores.reduce((a, b) => a + b, 0), 1);
        
      case 'average':
        return scores.reduce((a, b) => a + b, 0) / scores.length;
        
      case 'max':
        return Math.max(...scores);
        
      case 'harmonic_mean':
        const sum = scores.reduce((a, b) => a + (1 / b), 0);
        return sum > 0 ? scores.length / sum : 0;
        
      default:
        return Math.max(...scores);
    }
  }
  
  /**
   * Normalizes the final score based on the method.
   */
  private normalizeScore(
    score: number,
    totalWeight: number,
    method: 'linear' | 'sigmoid' | 'softmax'
  ): number {
    switch (method) {
      case 'linear':
        // Normalize by total weight to keep score in [0,1] range
        return totalWeight > 0 ? Math.min(score / totalWeight, 1) : 0;
        
      case 'sigmoid':
        // Sigmoid normalization for smooth [0,1] mapping
        return 1 / (1 + Math.exp(-4 * (score - 0.5)));
        
      case 'softmax':
        // For softmax, we would need all scores, so we use sigmoid as approximation
        return 1 / (1 + Math.exp(-score));
        
      default:
        return Math.min(score, 1);
    }
  }
  
  /**
   * Creates ranked connections from scores.
   */
  private createRankedConnections(
    weightedScores: Map<string, number>,
    scoreExplanations: Map<string, ScoreExplanation[]>,
    groupedByTarget: Map<string, CollisionResult[]>
  ): any[] {
    const connections: RankedConnection[] = [];
    
    for (const [targetId, score] of weightedScores) {
      const collisions = groupedByTarget.get(targetId) || [];
      const explanations = scoreExplanations.get(targetId) || [];
      
      connections.push({
        targetChunkId: targetId,
        totalScore: score,
        normalizedScore: score,
        engines: [...new Set(collisions.map(c => c.engineType))],
        scoreBreakdown: explanations,
        explanations: collisions.map(c => c.explanation).filter((e): e is string => e !== undefined),
        rank: 0, // Will be set after sorting
      });
    }
    
    // Sort by score descending
    connections.sort((a, b) => b.totalScore - a.totalScore);
    
    // Assign ranks
    connections.forEach((conn, index) => {
      conn.rank = index + 1;
    });
    
    return connections;
  }
  
  /**
   * Updates the weight configuration.
   */
  updateWeights(weights: WeightConfig): void {
    this.weights = weights;
    this.validateWeights();
  }
  
  /**
   * Gets current weight configuration.
   */
  getWeights(): WeightConfig {
    return { ...this.weights };
  }
  
  /**
   * Validates weight configuration.
   */
  private validateWeights(): void {
    const weights = Object.values(this.weights.weights);
    
    // Check all weights are in [0,1] range
    for (const weight of weights) {
      if (weight < 0 || weight > 1) {
        throw new Error(`Invalid weight: ${weight}. Weights must be in [0,1] range.`);
      }
    }
    
    // Check at least one weight is non-zero
    const totalWeight = weights.reduce((a, b) => a + b, 0);
    if (totalWeight === 0) {
      throw new Error('At least one engine weight must be non-zero.');
    }
  }
  
  /**
   * Creates a score explanation string for display.
   */
  explainScore(explanations: ScoreExplanation[]): string {
    if (explanations.length === 0) {
      return 'No engines contributed to this score';
    }
    
    const parts = explanations
      .filter(exp => exp.contributionScore > 0)
      .sort((a, b) => b.contributionScore - a.contributionScore)
      .map(exp => {
        return `${exp.engineType}: ${(exp.rawScore * 100).toFixed(1)}% ` +
               `(weight: ${exp.weight}, contribution: ${exp.contributionPercentage.toFixed(1)}%)`;
      });
    
    return parts.join(' | ');
  }
}

/**
 * Factory function to create a scoring system with default weights.
 */
export function createScoringSystem(weights?: WeightConfig): ScoringSystem {
  return new ScoringSystem(weights || getDefaultWeights());
}

/**
 * Creates a scoring system with user preferences.
 * Fetches preferences from cache or database.
 * @param userId - User ID to load preferences for
 * @param fallbackWeights - Fallback weights if user has no preferences
 * @returns Scoring system with user's configured weights
 */
export async function createUserScoringSystem(
  userId: string,
  fallbackWeights?: WeightConfig
): Promise<ScoringSystem> {
  // Try to get cached preferences first
  let userConfig = preferenceManager.getCachedPreferences(userId);
  
  if (!userConfig) {
    // If not cached, load from database (would need to be implemented)
    // For now, use fallback or defaults
    userConfig = fallbackWeights || getDefaultWeights();
    
    // Cache for future use
    preferenceManager.cachePreferences(userId, userConfig);
  }
  
  // Validate and sanitize the configuration
  const validatedConfig = preferenceManager.validateAndSanitizeConfig(userConfig);
  
  return new ScoringSystem(validatedConfig);
}

/**
 * Gets the default weight configuration.
 * Imported from weight-config module.
 */
function getDefaultWeights(): WeightConfig {
  return DEFAULT_WEIGHTS;
}

/**
 * Export the preference manager for external use.
 */
export { preferenceManager } from '../lib/user-preferences';