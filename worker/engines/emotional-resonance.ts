/**
 * Emotional Resonance Engine
 * 
 * Detects emotional tone alignment and resonance between chunks.
 * Identifies harmonious connections, dissonance, and emotional patterns.
 */

import { BaseEngine } from './base-engine';
import {
  CollisionDetectionInput,
  CollisionResult,
  EngineType,
  ChunkWithMetadata,
} from './types';

interface EmotionalProfile {
  primaryEmotion: string;
  polarity: number;           // -1 (negative) to 1 (positive)
  complexity: number;          // 0 to 1 (simple to complex)
  emotions: Map<string, number>; // Emotion name -> strength
}

interface EmotionalResonance {
  resonanceType: 'harmony' | 'dissonance' | 'neutral';
  resonanceScore: number;      // 0 to 1
  sharedEmotions: string[];
  emotionalDistance: number;   // Vector distance
}

// Emotion categories for grouping related emotions
const EMOTION_CATEGORIES = {
  positive: ['joy', 'happiness', 'excitement', 'love', 'gratitude', 'hope', 'optimism'],
  negative: ['anger', 'sadness', 'fear', 'disgust', 'frustration', 'disappointment'],
  neutral: ['surprise', 'anticipation', 'curiosity', 'confusion'],
  complex: ['nostalgia', 'bittersweet', 'melancholy', 'ambivalence'],
};

// Complementary emotion pairs that create harmony
const COMPLEMENTARY_PAIRS = [
  ['joy', 'gratitude'],
  ['sadness', 'empathy'],
  ['fear', 'courage'],
  ['anger', 'determination'],
  ['love', 'compassion'],
];

export class EmotionalResonanceEngine extends BaseEngine {
  readonly type: EngineType = 'emotional_resonance';
  
  // Configuration thresholds
  private readonly MIN_RESONANCE = 0.3;      // Minimum resonance score
  private readonly HARMONY_THRESHOLD = 0.7;   // Strong harmony threshold
  private readonly DISSONANCE_THRESHOLD = 0.6; // Strong dissonance threshold
  
  /**
   * Detects emotional resonance between chunks.
   */
  protected async detectImpl(
    input: CollisionDetectionInput
  ): Promise<CollisionResult[]> {
    const results: CollisionResult[] = [];
    const sourceProfile = this.extractEmotionalProfile(input.sourceChunk);
    
    // Skip if source has no emotional data
    if (!sourceProfile) {
      return results;
    }
    
    // Process each target chunk
    for (const targetChunk of input.targetChunks) {
      // Skip self-comparison
      if (targetChunk.id === input.sourceChunk.id) continue;
      
      const targetProfile = this.extractEmotionalProfile(targetChunk);
      if (!targetProfile) continue;
      
      // Calculate emotional resonance
      const resonance = this.calculateResonance(sourceProfile, targetProfile);
      
      // Check for meaningful resonance (both harmony and dissonance are interesting)
      if (resonance.resonanceScore >= this.MIN_RESONANCE) {
        const score = this.calculateConnectionScore(resonance, sourceProfile, targetProfile);
        
        if (score > 0) {
          results.push({
            sourceChunkId: input.sourceChunk.id,
            targetChunkId: targetChunk.id,
            engineType: this.type,
            score,
            confidence: this.getConfidenceLevel(score, resonance),
            explanation: this.generateExplanation(
              sourceProfile,
              targetProfile,
              resonance
            ),
            metadata: {
              resonanceType: resonance.resonanceType,
              resonanceScore: resonance.resonanceScore,
              sharedEmotions: resonance.sharedEmotions,
              emotionalDistance: resonance.emotionalDistance,
              sourcePrimary: sourceProfile.primaryEmotion,
              targetPrimary: targetProfile.primaryEmotion,
            },
          });
        }
      }
    }
    
    return results;
  }
  
  /**
   * Extracts emotional profile from chunk metadata.
   */
  private extractEmotionalProfile(chunk: ChunkWithMetadata): EmotionalProfile | null {
    const tone = chunk.metadata?.emotional_tone;
    if (!tone || !tone.primary_emotion) {
      return null;
    }
    
    const emotions = new Map<string, number>();
    
    // Add primary emotion with full strength
    emotions.set(tone.primary_emotion.toLowerCase(), 1.0);
    
    // Add other emotions if available
    if (tone.emotions) {
      for (const emotion of tone.emotions) {
        emotions.set(emotion.name.toLowerCase(), emotion.strength);
      }
    }
    
    return {
      primaryEmotion: tone.primary_emotion.toLowerCase(),
      polarity: tone.polarity || 0,
      complexity: tone.complexity || 0.5,
      emotions,
    };
  }
  
  /**
   * Calculates emotional resonance between two profiles.
   */
  private calculateResonance(
    source: EmotionalProfile,
    target: EmotionalProfile
  ): EmotionalResonance {
    // Find shared emotions
    const sharedEmotions: string[] = [];
    const sourceEmotions = Array.from(source.emotions.keys());
    const targetEmotions = Array.from(target.emotions.keys());
    
    for (const emotion of sourceEmotions) {
      if (target.emotions.has(emotion)) {
        sharedEmotions.push(emotion);
      }
    }
    
    // Calculate emotional distance (vector distance in emotion space)
    const distance = this.calculateEmotionalDistance(source, target);
    
    // Determine resonance type
    const resonanceType = this.determineResonanceType(source, target, sharedEmotions);
    
    // Calculate resonance score
    const resonanceScore = this.calculateResonanceScore(
      source,
      target,
      sharedEmotions,
      distance,
      resonanceType
    );
    
    return {
      resonanceType,
      resonanceScore,
      sharedEmotions,
      emotionalDistance: distance,
    };
  }
  
  /**
   * Calculates emotional distance between profiles.
   */
  private calculateEmotionalDistance(
    source: EmotionalProfile,
    target: EmotionalProfile
  ): number {
    // Combine all emotions from both profiles
    const allEmotions = new Set([
      ...source.emotions.keys(),
      ...target.emotions.keys(),
    ]);
    
    let sumSquares = 0;
    
    for (const emotion of allEmotions) {
      const sourceStrength = source.emotions.get(emotion) || 0;
      const targetStrength = target.emotions.get(emotion) || 0;
      sumSquares += Math.pow(sourceStrength - targetStrength, 2);
    }
    
    // Add polarity difference
    sumSquares += Math.pow(source.polarity - target.polarity, 2);
    
    // Euclidean distance, normalized
    return Math.sqrt(sumSquares) / Math.sqrt(allEmotions.size + 1);
  }
  
  /**
   * Determines the type of emotional resonance.
   */
  private determineResonanceType(
    source: EmotionalProfile,
    target: EmotionalProfile,
    sharedEmotions: string[]
  ): 'harmony' | 'dissonance' | 'neutral' {
    // Check for harmony: similar polarity and emotions
    if (Math.abs(source.polarity - target.polarity) < 0.3) {
      if (sharedEmotions.length > 0 || this.areComplementary(source, target)) {
        return 'harmony';
      }
    }
    
    // Check for dissonance: opposite polarity
    if (Math.abs(source.polarity - target.polarity) > 1.2) {
      return 'dissonance';
    }
    
    // Check for interesting contrast
    if (source.primaryEmotion !== target.primaryEmotion && 
        Math.abs(source.polarity - target.polarity) > 0.6) {
      return 'dissonance';
    }
    
    return 'neutral';
  }
  
  /**
   * Checks if emotions are complementary.
   */
  private areComplementary(
    source: EmotionalProfile,
    target: EmotionalProfile
  ): boolean {
    const sourcePrimary = source.primaryEmotion;
    const targetPrimary = target.primaryEmotion;
    
    for (const [emotion1, emotion2] of COMPLEMENTARY_PAIRS) {
      if ((sourcePrimary === emotion1 && targetPrimary === emotion2) ||
          (sourcePrimary === emotion2 && targetPrimary === emotion1)) {
        return true;
      }
    }
    
    return false;
  }
  
  /**
   * Calculates the resonance score.
   */
  private calculateResonanceScore(
    source: EmotionalProfile,
    target: EmotionalProfile,
    sharedEmotions: string[],
    distance: number,
    resonanceType: 'harmony' | 'dissonance' | 'neutral'
  ): number {
    let score = 0;
    
    // Base score from shared emotions
    const sharedRatio = sharedEmotions.length / 
      Math.max(source.emotions.size, target.emotions.size);
    score += sharedRatio * 0.3;
    
    // Distance contribution (inverse - closer is better for harmony)
    if (resonanceType === 'harmony') {
      score += (1 - distance) * 0.3;
    } else if (resonanceType === 'dissonance') {
      // For dissonance, moderate distance is interesting
      score += (distance > 0.5 ? 0.3 : distance * 0.6);
    }
    
    // Polarity alignment for harmony
    if (resonanceType === 'harmony') {
      const polarityAlignment = 1 - Math.abs(source.polarity - target.polarity) / 2;
      score += polarityAlignment * 0.2;
    }
    
    // Complexity bonus (complex emotions are more interesting)
    const avgComplexity = (source.complexity + target.complexity) / 2;
    score += avgComplexity * 0.2;
    
    // Type-specific boost
    if (resonanceType === 'harmony' && this.areComplementary(source, target)) {
      score *= 1.2; // 20% boost for complementary pairs
    } else if (resonanceType === 'dissonance' && Math.abs(source.polarity - target.polarity) > 1.5) {
      score *= 1.15; // 15% boost for strong contrasts
    }
    
    return Math.min(score, 1);
  }
  
  /**
   * Calculates the final connection score.
   */
  private calculateConnectionScore(
    resonance: EmotionalResonance,
    source: EmotionalProfile,
    target: EmotionalProfile
  ): number {
    let score = resonance.resonanceScore;
    
    // Apply type-specific adjustments
    if (resonance.resonanceType === 'harmony') {
      // Harmony connections are valuable
      score *= 1.1;
    } else if (resonance.resonanceType === 'dissonance') {
      // Dissonance is interesting but slightly less valuable
      score *= 0.95;
    } else {
      // Neutral connections need to be strong
      score *= 0.8;
    }
    
    return Math.min(score, 1);
  }
  
  /**
   * Determines confidence level.
   */
  private getConfidenceLevel(
    score: number,
    resonance: EmotionalResonance
  ): 'high' | 'medium' | 'low' {
    if (score >= 0.7 && resonance.resonanceScore >= 0.6) return 'high';
    if (score >= 0.4 || resonance.resonanceScore >= 0.4) return 'medium';
    return 'low';
  }
  
  /**
   * Generates human-readable explanation.
   */
  private generateExplanation(
    source: EmotionalProfile,
    target: EmotionalProfile,
    resonance: EmotionalResonance
  ): string {
    const sharedCount = resonance.sharedEmotions.length;
    const sharedList = resonance.sharedEmotions.slice(0, 3).join(', ');
    
    if (resonance.resonanceType === 'harmony') {
      if (this.areComplementary(source, target)) {
        return `Complementary emotional harmony between ${source.primaryEmotion} and ${target.primaryEmotion}. ` +
               `Creates balanced emotional resonance.`;
      }
      return `Emotional harmony detected with ${sharedCount > 0 ? `${sharedCount} shared emotions: ${sharedList}` : 'aligned emotional tone'}. ` +
             `Both chunks exhibit ${source.polarity > 0 ? 'positive' : source.polarity < 0 ? 'negative' : 'neutral'} polarity.`;
    }
    
    if (resonance.resonanceType === 'dissonance') {
      return `Emotional contrast between ${source.primaryEmotion} (polarity: ${source.polarity.toFixed(1)}) ` +
             `and ${target.primaryEmotion} (polarity: ${target.polarity.toFixed(1)}). ` +
             `This tension creates meaningful juxtaposition.`;
    }
    
    return `Subtle emotional connection through ${sharedCount > 0 ? `shared ${sharedList}` : 'related emotional themes'}. ` +
           `Moderate resonance at ${(resonance.resonanceScore * 100).toFixed(0)}% strength.`;
  }
  
  /**
   * Checks if chunk has required metadata.
   */
  protected hasRequiredMetadata(chunk: ChunkWithMetadata): boolean {
    return !!(
      chunk.metadata?.emotional_tone?.primary_emotion ||
      (chunk.metadata?.emotional_tone?.emotions && 
       chunk.metadata.emotional_tone.emotions.length > 0)
    );
  }
}