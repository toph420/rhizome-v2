/**
 * Enhanced Contradiction Detection Engine
 * Uses existing metadata (concepts + emotional polarity) to find conceptual tensions.
 * No AI calls - leverages metadata already extracted by regex engines.
 * 
 * Detects:
 * 1. Shared topic contradictions (same concepts, opposite polarity)
 * 2. Direct negations (syntax-based, original behavior)
 * 3. Framework tensions (overlapping concepts with different emotional stances)
 */

import { BaseEngine } from './base-engine';
import {
  CollisionDetectionInput,
  CollisionResult,
  EngineType,
  ChunkWithMetadata,
} from './types';

export class ContradictionDetectionEngine extends BaseEngine {
  readonly type: EngineType = EngineType.CONTRADICTION_DETECTION;
  
  private readonly MIN_CONCEPT_OVERLAP = 0.3;  // 30% concept overlap to consider "same topic"
  private readonly MIN_POLARITY_DIFFERENCE = 0.6;  // Significant emotional difference
  private readonly MIN_CONTRADICTION_SCORE = 0.4;

  protected async detectImpl(
    input: CollisionDetectionInput
  ): Promise<CollisionResult[]> {
    const results: CollisionResult[] = [];
    
    for (const targetChunk of input.targetChunks) {
      if (targetChunk.id === input.sourceChunk.id) continue;
      
      // Strategy 1: Metadata-based conceptual tension (NEW)
      const conceptualTension = this.detectConceptualTension(
        input.sourceChunk,
        targetChunk
      );
      
      if (conceptualTension) {
        results.push(conceptualTension);
        continue; // Don't double-count with syntax detection
      }
      
      // Strategy 2: Syntax-based contradiction (ORIGINAL)
      const syntaxContradiction = this.detectSyntaxContradiction(
        input.sourceChunk,
        targetChunk
      );
      
      if (syntaxContradiction) {
        results.push(syntaxContradiction);
      }
    }
    
    return results;
  }
  
  /**
   * NEW: Detects conceptual tension using metadata.
   * Finds chunks discussing similar concepts with opposing emotional stances.
   */
  private detectConceptualTension(
    sourceChunk: ChunkWithMetadata,
    targetChunk: ChunkWithMetadata
  ): CollisionResult | null {
    const sourceConcepts = sourceChunk.metadata?.key_concepts?.concepts;
    const targetConcepts = targetChunk.metadata?.key_concepts?.concepts;
    const sourceEmotion = sourceChunk.metadata?.emotional_tone;
    const targetEmotion = targetChunk.metadata?.emotional_tone;
    
    // Need both concepts and emotional data
    if (!sourceConcepts || !targetConcepts || !sourceEmotion || !targetEmotion) {
      return null;
    }
    
    // Check for concept overlap (same topic?)
    const { overlap, sharedConcepts } = this.calculateConceptOverlapDetailed(
      sourceConcepts,
      targetConcepts
    );
    
    if (overlap < this.MIN_CONCEPT_OVERLAP) {
      return null; // Not discussing the same thing
    }
    
    // Check for opposing emotional stances
    const polarityDiff = Math.abs(
      (sourceEmotion.polarity || 0) - (targetEmotion.polarity || 0)
    );
    
    if (polarityDiff < this.MIN_POLARITY_DIFFERENCE) {
      return null; // Similar emotional stance, not a contradiction
    }
    
    // We have a conceptual tension: same topic, opposite stances
    const score = this.calculateTensionScore(overlap, polarityDiff, sharedConcepts.length);
    
    if (score < this.MIN_CONTRADICTION_SCORE) {
      return null;
    }
    
    return {
      sourceChunkId: sourceChunk.id,
      targetChunkId: targetChunk.id,
      engineType: this.type,
      score,
      confidence: score > 0.7 ? 'high' : 'medium',
      explanation: this.generateTensionExplanation(
        sharedConcepts,
        sourceEmotion,
        targetEmotion
      ),
      metadata: {
        contradictionType: 'conceptual_tension',
        sharedConcepts,
        conceptOverlap: overlap,
        polarityDifference: polarityDiff,
        sourcePolarity: sourceEmotion.polarity,
        targetPolarity: targetEmotion.polarity,
        sourceEmotion: sourceEmotion.primary_emotion,
        targetEmotion: targetEmotion.primary_emotion,
      },
    };
  }
  
  /**
   * ORIGINAL: Syntax-based contradiction detection (your existing regex logic).
   * Kept as fallback for when metadata is insufficient.
   */
  private detectSyntaxContradiction(
    sourceChunk: ChunkWithMetadata,
    targetChunk: ChunkWithMetadata
  ): CollisionResult | null {
    // Your original claim extraction logic
    const sourceClaims = this.extractSimpleClaims(sourceChunk.content);
    const targetClaims = this.extractSimpleClaims(targetChunk.content);
    
    if (sourceClaims.length === 0 || targetClaims.length === 0) {
      return null;
    }
    
    // Check for direct negations
    for (const sourceClaim of sourceClaims) {
      for (const targetClaim of targetClaims) {
        if (this.isDirectNegation(sourceClaim, targetClaim)) {
          return {
            sourceChunkId: sourceChunk.id,
            targetChunkId: targetChunk.id,
            engineType: this.type,
            score: 0.7,
            confidence: 'medium',
            explanation: `Direct contradiction: "${sourceClaim.substring(0, 50)}..." vs "${targetClaim.substring(0, 50)}..."`,
            metadata: {
              contradictionType: 'direct_negation',
              sourceClaim: sourceClaim.substring(0, 100),
              targetClaim: targetClaim.substring(0, 100),
            },
          };
        }
      }
    }
    
    return null;
  }
  
  /**
   * Calculates detailed concept overlap with shared concept list.
   */
  private calculateConceptOverlapDetailed(
    concepts1: Array<{ term: string; importance: number }>,
    concepts2: Array<{ term: string; importance: number }>
  ): { overlap: number; sharedConcepts: string[] } {
    if (!concepts1?.length || !concepts2?.length) {
      return { overlap: 0, sharedConcepts: [] };
    }
    
    const normalize = (text: string) => text.toLowerCase().trim();
    
    const set1 = new Map(concepts1.map(c => [normalize(c.term), c.importance]));
    const set2 = new Map(concepts2.map(c => [normalize(c.term), c.importance]));
    
    const sharedConcepts: string[] = [];
    let weightedOverlap = 0;
    
    for (const [concept, importance1] of set1.entries()) {
      if (set2.has(concept)) {
        sharedConcepts.push(concept);
        const importance2 = set2.get(concept)!;
        weightedOverlap += (importance1 + importance2) / 2;
      }
    }
    
    const totalImportance = 
      Array.from(set1.values()).reduce((a, b) => a + b, 0) +
      Array.from(set2.values()).reduce((a, b) => a + b, 0);
    
    const overlap = totalImportance > 0 ? weightedOverlap / (totalImportance / 2) : 0;
    
    return { overlap, sharedConcepts };
  }
  
  /**
   * Calculates tension score based on concept overlap and polarity difference.
   */
  private calculateTensionScore(
    conceptOverlap: number,
    polarityDiff: number,
    sharedConceptCount: number
  ): number {
    // Base score from overlap and polarity difference
    let score = (conceptOverlap * 0.4) + (polarityDiff / 2 * 0.6);
    
    // Boost for multiple shared concepts (indicates substantial disagreement)
    if (sharedConceptCount >= 3) {
      score *= 1.2;
    } else if (sharedConceptCount >= 2) {
      score *= 1.1;
    }
    
    return Math.min(score, 1.0);
  }
  
  /**
   * Generates human-readable explanation of conceptual tension.
   */
  private generateTensionExplanation(
    sharedConcepts: string[],
    sourceEmotion: any,
    targetEmotion: any
  ): string {
    const conceptList = sharedConcepts.slice(0, 3).join(', ');
    const sourceTone = sourceEmotion.polarity > 0 ? 'positive' : 'negative';
    const targetTone = targetEmotion.polarity > 0 ? 'positive' : 'negative';
    
    return `Conceptual tension: Both discuss ${conceptList}, but with opposing viewpoints (${sourceTone} vs ${targetTone} stance)`;
  }
  
  /**
   * Simple claim extraction for syntax-based detection.
   */
  private extractSimpleClaims(content: string): string[] {
    // Extract sentences that look like factual claims
    const sentences = content.split(/[.!?]+/).map(s => s.trim()).filter(s => s.length > 20);
    
    return sentences.filter(s => {
      const lower = s.toLowerCase();
      return (
        (lower.includes(' is ') || lower.includes(' are ') || 
         lower.includes(' has ') || lower.includes(' have ')) &&
        !lower.includes('?')
      );
    });
  }
  
  /**
   * Checks if two claims are direct negations.
   */
  private isDirectNegation(claim1: string, claim2: string): boolean {
    const normalize = (s: string) => s.toLowerCase().replace(/[^\w\s]/g, ' ').trim();
    const n1 = normalize(claim1);
    const n2 = normalize(claim2);
    
    // Check for negation words
    const hasNot1 = /\b(not|no|never|neither)\b/.test(n1);
    const hasNot2 = /\b(not|no|never|neither)\b/.test(n2);
    
    if (hasNot1 === hasNot2) return false; // Both positive or both negative
    
    // Remove negation words and check similarity
    const clean1 = n1.replace(/\b(not|no|never|neither)\b/g, '').trim();
    const clean2 = n2.replace(/\b(not|no|never|neither)\b/g, '').trim();
    
    // Simple similarity check (can be improved)
    const words1 = new Set(clean1.split(/\s+/));
    const words2 = new Set(clean2.split(/\s+/));
    const intersection = new Set([...words1].filter(x => words2.has(x)));
    const similarity = intersection.size / Math.min(words1.size, words2.size);
    
    return similarity > 0.6;
  }
  
  protected hasRequiredMetadata(chunk: ChunkWithMetadata): boolean {
    // Can work with either full metadata OR just content
    return !!(
      chunk.content && chunk.content.length > 50 ||
      (chunk.metadata?.key_concepts && chunk.metadata?.emotional_tone)
    );
  }
}