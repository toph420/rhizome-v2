/**
 * Conceptual Density Engine
 * 
 * Analyzes concept concentration and overlap to find knowledge-rich connections.
 * Uses weighted importance scoring to identify high-density areas and hotspots.
 */

import { BaseEngine } from './base-engine';
import {
  CollisionDetectionInput,
  CollisionResult,
  EngineType,
  ChunkWithMetadata,
} from './types';

interface ConceptDensityMetrics {
  density: number;          // Concepts per 100 words
  uniqueConcepts: number;   // Total unique concepts
  avgImportance: number;    // Average importance score
  coverage: number;         // Percentage of text covered by concepts
}

interface ConceptOverlap {
  sharedConcepts: string[];
  overlapScore: number;     // Jaccard similarity
  weightedScore: number;    // Importance-weighted overlap
}

export class ConceptualDensityEngine extends BaseEngine {
  readonly type: EngineType = EngineType.CONCEPTUAL_DENSITY;
  
  // Configuration thresholds
  private readonly MIN_DENSITY = 2.0;        // Min concepts per 100 words
  private readonly MIN_OVERLAP = 0.15;       // Min Jaccard similarity
  private readonly HOTSPOT_THRESHOLD = 5.0;  // High density threshold
  
  /**
   * Detects conceptual density connections between chunks.
   */
  protected async detectImpl(
    input: CollisionDetectionInput
  ): Promise<CollisionResult[]> {
    const results: CollisionResult[] = [];
    const sourceMetrics = this.calculateDensityMetrics(input.sourceChunk);
    
    // Skip if source has low concept density
    if (sourceMetrics.density < this.MIN_DENSITY) {
      return results;
    }
    
    const sourceConcepts = this.extractConcepts(input.sourceChunk);
    const isSourceHotspot = sourceMetrics.density >= this.HOTSPOT_THRESHOLD;
    
    // Process each target chunk
    for (const targetChunk of input.targetChunks) {
      // Skip self-comparison
      if (targetChunk.id === input.sourceChunk.id) continue;
      
      const targetMetrics = this.calculateDensityMetrics(targetChunk);
      
      // Skip low-density targets unless source is a hotspot
      if (targetMetrics.density < this.MIN_DENSITY && !isSourceHotspot) {
        continue;
      }
      
      const targetConcepts = this.extractConcepts(targetChunk);
      const overlap = this.calculateOverlap(sourceConcepts, targetConcepts);
      
      // Check for meaningful overlap
      if (overlap.overlapScore >= this.MIN_OVERLAP) {
        const score = this.calculateConnectionScore(
          sourceMetrics,
          targetMetrics,
          overlap,
          isSourceHotspot
        );
        
        if (score > 0) {
          results.push({
            sourceChunkId: input.sourceChunk.id,
            targetChunkId: targetChunk.id,
            engineType: this.type,
            score,
            confidence: this.getConfidenceLevel(score, overlap.overlapScore),
            explanation: this.generateExplanation(
              sourceMetrics,
              targetMetrics,
              overlap,
              isSourceHotspot
            ),
            metadata: {
              sourceDensity: sourceMetrics.density,
              targetDensity: targetMetrics.density,
              overlapScore: overlap.overlapScore,
              sharedConcepts: overlap.sharedConcepts.slice(0, 5), // Top 5
              isHotspot: isSourceHotspot || targetMetrics.density >= this.HOTSPOT_THRESHOLD,
            },
          });
        }
      }
    }
    
    return results;
  }
  
  /**
   * Calculates concept density metrics for a chunk.
   */
  private calculateDensityMetrics(chunk: ChunkWithMetadata): ConceptDensityMetrics {
    const concepts = chunk.metadata?.key_concepts?.concepts || [];
    const wordCount = chunk.content.split(/\s+/).length;
    
    // Calculate density (concepts per 100 words)
    const density = (concepts.length / wordCount) * 100;
    
    // Calculate average importance
    const avgImportance = concepts.length > 0
      ? concepts.reduce((sum, c) => sum + c.importance, 0) / concepts.length
      : 0;
    
    // Estimate coverage (rough approximation)
    const conceptWords = concepts.reduce((sum, c) => 
      sum + c.term.split(/\s+/).length, 0
    );
    const coverage = Math.min((conceptWords / wordCount) * 100, 100);
    
    return {
      density,
      uniqueConcepts: concepts.length,
      avgImportance,
      coverage,
    };
  }
  
  /**
   * Extracts concepts with their importance scores.
   */
  private extractConcepts(
    chunk: ChunkWithMetadata
  ): Map<string, number> {
    const conceptMap = new Map<string, number>();
    const concepts = chunk.metadata?.key_concepts?.concepts || [];
    
    for (const concept of concepts) {
      const normalizedTerm = concept.term.toLowerCase().trim();
      conceptMap.set(normalizedTerm, concept.importance);
    }
    
    return conceptMap;
  }
  
  /**
   * Calculates concept overlap between two chunks.
   */
  private calculateOverlap(
    sourceConcepts: Map<string, number>,
    targetConcepts: Map<string, number>
  ): ConceptOverlap {
    const sharedConcepts: string[] = [];
    let weightedOverlap = 0;
    
    // Find shared concepts and calculate weighted overlap
    for (const [term, sourceImportance] of sourceConcepts) {
      if (targetConcepts.has(term)) {
        sharedConcepts.push(term);
        const targetImportance = targetConcepts.get(term)!;
        // Use geometric mean for balanced weighting
        weightedOverlap += Math.sqrt(sourceImportance * targetImportance);
      }
    }
    
    // Calculate Jaccard similarity
    const union = new Set([...sourceConcepts.keys(), ...targetConcepts.keys()]);
    const overlapScore = sharedConcepts.length / union.size;
    
    // Normalize weighted score
    const maxPossibleWeight = Math.min(sourceConcepts.size, targetConcepts.size);
    const weightedScore = maxPossibleWeight > 0 
      ? weightedOverlap / maxPossibleWeight 
      : 0;
    
    return {
      sharedConcepts,
      overlapScore,
      weightedScore,
    };
  }
  
  /**
   * Calculates the final connection score.
   */
  private calculateConnectionScore(
    sourceMetrics: ConceptDensityMetrics,
    targetMetrics: ConceptDensityMetrics,
    overlap: ConceptOverlap,
    isHotspot: boolean
  ): number {
    // Base score from overlap
    let score = overlap.weightedScore * 0.4 + overlap.overlapScore * 0.3;
    
    // Density contribution
    const avgDensity = (sourceMetrics.density + targetMetrics.density) / 2;
    const densityFactor = Math.min(avgDensity / 10, 1); // Cap at 10 concepts/100 words
    score += densityFactor * 0.2;
    
    // Importance contribution
    const avgImportance = (sourceMetrics.avgImportance + targetMetrics.avgImportance) / 2;
    score += avgImportance * 0.1;
    
    // Hotspot bonus
    if (isHotspot) {
      score *= 1.2; // 20% boost for hotspots
    }
    
    return Math.min(score, 1); // Cap at 1.0
  }
  
  /**
   * Determines confidence level based on score and overlap.
   */
  private getConfidenceLevel(
    score: number,
    overlapScore: number
  ): 'high' | 'medium' | 'low' {
    if (score >= 0.7 && overlapScore >= 0.3) return 'high';
    if (score >= 0.4 || overlapScore >= 0.2) return 'medium';
    return 'low';
  }
  
  /**
   * Generates human-readable explanation of the connection.
   */
  private generateExplanation(
    sourceMetrics: ConceptDensityMetrics,
    targetMetrics: ConceptDensityMetrics,
    overlap: ConceptOverlap,
    isHotspot: boolean
  ): string {
    const sharedCount = overlap.sharedConcepts.length;
    const topConcepts = overlap.sharedConcepts.slice(0, 3).join(', ');
    
    if (isHotspot) {
      return `Knowledge hotspot with ${sharedCount} shared concepts including ${topConcepts}. ` +
             `High conceptual density (${sourceMetrics.density.toFixed(1)} concepts/100 words).`;
    }
    
    if (overlap.overlapScore >= 0.3) {
      return `Strong conceptual overlap (${(overlap.overlapScore * 100).toFixed(0)}%) ` +
             `with ${sharedCount} shared concepts: ${topConcepts}.`;
    }
    
    return `Moderate concept overlap with ${sharedCount} shared concepts including ${topConcepts}. ` +
           `Combined density: ${((sourceMetrics.density + targetMetrics.density) / 2).toFixed(1)} concepts/100 words.`;
  }
  
  /**
   * Checks if chunk has required metadata for this engine.
   */
  protected hasRequiredMetadata(chunk: ChunkWithMetadata): boolean {
    return !!(
      chunk.metadata?.key_concepts?.concepts &&
      chunk.metadata.key_concepts.concepts.length > 0
    );
  }
}