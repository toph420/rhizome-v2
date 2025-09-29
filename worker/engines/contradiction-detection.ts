/**
 * Contradiction Detection Engine
 * 
 * Identifies conflicting information, logical inconsistencies, and contradictory claims.
 * Uses semantic analysis and logic checking to find contradictions with confidence scoring.
 */

import { BaseEngine } from './base-engine';
import {
  CollisionDetectionInput,
  CollisionResult,
  EngineType,
  ChunkWithMetadata,
} from './types';

interface Claim {
  text: string;           // Original claim text
  subject: string;        // What the claim is about
  predicate: string;      // What is being claimed
  object?: string;        // Object of the claim
  confidence: number;     // Extraction confidence
  negation: boolean;      // Whether claim is negated
}

interface Contradiction {
  type: 'direct' | 'partial' | 'logical' | 'temporal';
  strength: number;       // 0 to 1
  claim1: Claim;
  claim2: Claim;
  explanation: string;
}

// Common contradiction indicators
const NEGATION_WORDS = [
  'not', 'no', 'never', 'neither', 'none', 'nothing',
  'nowhere', 'hardly', 'scarcely', 'barely', 'don\'t',
  'doesn\'t', 'didn\'t', 'won\'t', 'wouldn\'t', 'can\'t',
  'cannot', 'couldn\'t', 'shouldn\'t', 'mustn\'t',
];

const OPPOSITION_WORDS = [
  'but', 'however', 'although', 'though', 'yet',
  'nevertheless', 'nonetheless', 'conversely',
  'on the contrary', 'in contrast', 'whereas',
  'while', 'despite', 'in spite of',
];

const CERTAINTY_WORDS = {
  high: ['always', 'definitely', 'certainly', 'absolutely', 'undoubtedly', 'clearly'],
  medium: ['usually', 'generally', 'typically', 'often', 'frequently', 'commonly'],
  low: ['sometimes', 'occasionally', 'possibly', 'perhaps', 'maybe', 'might'],
};

// Antonym pairs for contradiction detection
const ANTONYM_PAIRS = [
  ['increase', 'decrease'], ['rise', 'fall'], ['grow', 'shrink'],
  ['expand', 'contract'], ['positive', 'negative'], ['true', 'false'],
  ['accept', 'reject'], ['agree', 'disagree'], ['support', 'oppose'],
  ['success', 'failure'], ['benefit', 'harm'], ['advantage', 'disadvantage'],
  ['strong', 'weak'], ['high', 'low'], ['fast', 'slow'],
  ['good', 'bad'], ['right', 'wrong'], ['hot', 'cold'],
];

export class ContradictionDetectionEngine extends BaseEngine {
  readonly type: EngineType = EngineType.CONTRADICTION_DETECTION;
  
  // Configuration thresholds
  private readonly MIN_CONTRADICTION = 0.4;    // Minimum contradiction strength
  private readonly CLAIM_CONFIDENCE = 0.3;     // Minimum claim extraction confidence
  
  /**
   * Detects contradictions between chunks.
   */
  protected async detectImpl(
    input: CollisionDetectionInput
  ): Promise<CollisionResult[]> {
    const results: CollisionResult[] = [];
    const sourceClaims = this.extractClaims(input.sourceChunk);
    
    // Skip if no clear claims found
    if (sourceClaims.length === 0) {
      return results;
    }
    
    // Process each target chunk
    for (const targetChunk of input.targetChunks) {
      // Skip self-comparison
      if (targetChunk.id === input.sourceChunk.id) continue;
      
      const targetClaims = this.extractClaims(targetChunk);
      if (targetClaims.length === 0) continue;
      
      // Find contradictions between claims
      const contradictions = this.findContradictions(sourceClaims, targetClaims);
      
      // Process significant contradictions
      for (const contradiction of contradictions) {
        if (contradiction.strength >= this.MIN_CONTRADICTION) {
          const score = this.calculateConnectionScore(contradiction);
          
          if (score > 0) {
            results.push({
              sourceChunkId: input.sourceChunk.id,
              targetChunkId: targetChunk.id,
              engineType: this.type,
              score,
              confidence: this.getConfidenceLevel(score, contradiction),
              explanation: this.generateExplanation(contradiction),
              metadata: {
                contradictionType: contradiction.type,
                contradictionStrength: contradiction.strength,
                claim1: contradiction.claim1.text,
                claim2: contradiction.claim2.text,
                detailedExplanation: contradiction.explanation,
              },
            });
          }
        }
      }
    }
    
    return results;
  }
  
  /**
   * Extracts claims from chunk content.
   */
  private extractClaims(chunk: ChunkWithMetadata): Claim[] {
    const claims: Claim[] = [];
    const content = chunk.content;
    
    // Split into sentences
    const sentences = this.splitIntoSentences(content);
    
    for (const sentence of sentences) {
      // Skip questions and very short sentences
      if (sentence.includes('?') || sentence.split(/\s+/).length < 4) {
        continue;
      }
      
      // Extract factual statements
      const claim = this.extractClaimFromSentence(sentence);
      if (claim && claim.confidence >= this.CLAIM_CONFIDENCE) {
        claims.push(claim);
      }
    }
    
    // Also extract claims from metadata if available (future feature)
    // Currently metadata doesn't have claims field, but this is extensible
    // if ((chunk.metadata as any)?.claims) {
    //   for (const metaClaim of (chunk.metadata as any).claims) {
    //     claims.push(this.parseMetadataClaim(metaClaim));
    //   }
    // }
    
    return claims;
  }
  
  /**
   * Splits content into sentences.
   */
  private splitIntoSentences(content: string): string[] {
    // Simple sentence splitting (could be improved with NLP library)
    return content
      .split(/[.!?]+/)
      .map(s => s.trim())
      .filter(s => s.length > 0);
  }
  
  /**
   * Extracts a claim from a sentence.
   */
  private extractClaimFromSentence(sentence: string): Claim | null {
    const words = sentence.toLowerCase().split(/\s+/);
    
    // Check for factual indicators
    const hasFactualIndicator = words.some(w => 
      ['is', 'are', 'was', 'were', 'has', 'have', 'will', 'would', 'should', 'must'].includes(w)
    );
    
    if (!hasFactualIndicator) {
      return null;
    }
    
    // Simple claim extraction (could be enhanced with NLP)
    const claim: Claim = {
      text: sentence,
      subject: this.extractSubject(sentence),
      predicate: this.extractPredicate(sentence),
      object: this.extractObject(sentence),
      confidence: this.calculateClaimConfidence(sentence),
      negation: this.containsNegation(sentence),
    };
    
    return claim;
  }
  
  /**
   * Extracts the subject of a claim (simplified).
   */
  private extractSubject(sentence: string): string {
    // Very simplified: take first noun phrase
    const words = sentence.split(/\s+/);
    const beforeVerb = [];
    
    for (const word of words) {
      if (['is', 'are', 'was', 'were', 'has', 'have'].includes(word.toLowerCase())) {
        break;
      }
      beforeVerb.push(word);
    }
    
    return beforeVerb.join(' ').trim() || sentence.substring(0, 20);
  }
  
  /**
   * Extracts the predicate of a claim.
   */
  private extractPredicate(sentence: string): string {
    // Simplified: extract verb phrase
    const verbMatch = sentence.match(/\b(is|are|was|were|has|have|will|would|should|must)\s+(.+)/i);
    return verbMatch ? verbMatch[0] : sentence;
  }
  
  /**
   * Extracts the object of a claim.
   */
  private extractObject(sentence: string): string | undefined {
    // Simplified: take text after main verb
    const verbMatch = sentence.match(/\b(?:is|are|was|were|has|have)\s+(.+)/i);
    return verbMatch ? verbMatch[1] : undefined;
  }
  
  /**
   * Calculates confidence in claim extraction.
   */
  private calculateClaimConfidence(sentence: string): number {
    let confidence = 0.5; // Base confidence
    
    // Boost for certainty words
    const words = sentence.toLowerCase().split(/\s+/);
    for (const word of words) {
      if (CERTAINTY_WORDS.high.includes(word)) confidence += 0.2;
      else if (CERTAINTY_WORDS.medium.includes(word)) confidence += 0.1;
      else if (CERTAINTY_WORDS.low.includes(word)) confidence -= 0.1;
    }
    
    // Boost for numerical data
    if (/\d+/.test(sentence)) confidence += 0.1;
    
    // Boost for citations
    if (/\(\d{4}\)|\[\d+\]/.test(sentence)) confidence += 0.1;
    
    return Math.min(Math.max(confidence, 0), 1);
  }
  
  /**
   * Checks if sentence contains negation.
   */
  private containsNegation(sentence: string): boolean {
    const words = sentence.toLowerCase().split(/\s+/);
    return words.some(word => NEGATION_WORDS.includes(word));
  }
  
  /**
   * Parses a claim from metadata.
   */
  private parseMetadataClaim(metaClaim: any): Claim {
    return {
      text: metaClaim.text || '',
      subject: metaClaim.subject || '',
      predicate: metaClaim.predicate || '',
      object: metaClaim.object,
      confidence: metaClaim.confidence || 0.5,
      negation: metaClaim.negation || false,
    };
  }
  
  /**
   * Finds contradictions between two sets of claims.
   */
  private findContradictions(
    sourceClaims: Claim[],
    targetClaims: Claim[]
  ): Contradiction[] {
    const contradictions: Contradiction[] = [];
    
    for (const sourceClaim of sourceClaims) {
      for (const targetClaim of targetClaims) {
        const contradiction = this.detectContradiction(sourceClaim, targetClaim);
        if (contradiction) {
          contradictions.push(contradiction);
        }
      }
    }
    
    // Sort by strength and return top contradictions
    return contradictions
      .sort((a, b) => b.strength - a.strength)
      .slice(0, 5); // Limit to top 5 contradictions
  }
  
  /**
   * Detects contradiction between two claims.
   */
  private detectContradiction(
    claim1: Claim,
    claim2: Claim
  ): Contradiction | null {
    // Check for same subject
    const sameSubject = this.areSimilarSubjects(claim1.subject, claim2.subject);
    if (!sameSubject) {
      return null;
    }
    
    // Check for direct negation
    if (claim1.negation !== claim2.negation && 
        this.areSimilarPredicates(claim1.predicate, claim2.predicate)) {
      return {
        type: 'direct',
        strength: 0.9,
        claim1,
        claim2,
        explanation: 'Direct negation: one claim negates the other',
      };
    }
    
    // Check for antonym contradiction
    const antonymContradiction = this.checkAntonymContradiction(claim1, claim2);
    if (antonymContradiction) {
      return antonymContradiction;
    }
    
    // Check for logical contradiction
    const logicalContradiction = this.checkLogicalContradiction(claim1, claim2);
    if (logicalContradiction) {
      return logicalContradiction;
    }
    
    // Check for temporal contradiction
    const temporalContradiction = this.checkTemporalContradiction(claim1, claim2);
    if (temporalContradiction) {
      return temporalContradiction;
    }
    
    return null;
  }
  
  /**
   * Checks if two subjects are similar.
   */
  private areSimilarSubjects(subject1: string, subject2: string): boolean {
    // Normalize and compare
    const normalized1 = subject1.toLowerCase().trim();
    const normalized2 = subject2.toLowerCase().trim();
    
    // Exact match
    if (normalized1 === normalized2) return true;
    
    // Partial match (one contains the other)
    if (normalized1.includes(normalized2) || normalized2.includes(normalized1)) {
      return true;
    }
    
    // Word overlap
    const words1 = new Set(normalized1.split(/\s+/));
    const words2 = new Set(normalized2.split(/\s+/));
    const intersection = new Set([...words1].filter(x => words2.has(x)));
    const overlap = intersection.size / Math.min(words1.size, words2.size);
    
    return overlap > 0.5;
  }
  
  /**
   * Checks if two predicates are similar.
   */
  private areSimilarPredicates(predicate1: string, predicate2: string): boolean {
    const normalized1 = predicate1.toLowerCase().trim();
    const normalized2 = predicate2.toLowerCase().trim();
    
    // Remove negation words for comparison
    const clean1 = this.removeNegationWords(normalized1);
    const clean2 = this.removeNegationWords(normalized2);
    
    return clean1 === clean2 || 
           clean1.includes(clean2) || 
           clean2.includes(clean1);
  }
  
  /**
   * Removes negation words from text.
   */
  private removeNegationWords(text: string): string {
    let result = text;
    for (const word of NEGATION_WORDS) {
      result = result.replace(new RegExp(`\\b${word}\\b`, 'g'), '');
    }
    return result.trim();
  }
  
  /**
   * Checks for antonym-based contradiction.
   */
  private checkAntonymContradiction(
    claim1: Claim,
    claim2: Claim
  ): Contradiction | null {
    const words1 = claim1.predicate.toLowerCase().split(/\s+/);
    const words2 = claim2.predicate.toLowerCase().split(/\s+/);
    
    for (const [ant1, ant2] of ANTONYM_PAIRS) {
      const has1in1 = words1.includes(ant1);
      const has2in1 = words1.includes(ant2);
      const has1in2 = words2.includes(ant1);
      const has2in2 = words2.includes(ant2);
      
      if ((has1in1 && has2in2) || (has2in1 && has1in2)) {
        return {
          type: 'direct',
          strength: 0.8,
          claim1,
          claim2,
          explanation: `Antonym contradiction: "${ant1}" vs "${ant2}"`,
        };
      }
    }
    
    return null;
  }
  
  /**
   * Checks for logical contradiction.
   */
  private checkLogicalContradiction(
    claim1: Claim,
    claim2: Claim
  ): Contradiction | null {
    // Check for mutually exclusive claims
    const exclusive1 = claim1.predicate.includes('only') || claim1.predicate.includes('exclusively');
    const exclusive2 = claim2.predicate.includes('only') || claim2.predicate.includes('exclusively');
    
    if (exclusive1 || exclusive2) {
      if (claim1.object !== claim2.object && claim1.object && claim2.object) {
        return {
          type: 'logical',
          strength: 0.7,
          claim1,
          claim2,
          explanation: 'Mutually exclusive claims',
        };
      }
    }
    
    // Check for all/none contradiction
    const hasAll1 = claim1.predicate.includes('all') || claim1.predicate.includes('every');
    const hasNone1 = claim1.predicate.includes('none') || claim1.predicate.includes('no ');
    const hasAll2 = claim2.predicate.includes('all') || claim2.predicate.includes('every');
    const hasNone2 = claim2.predicate.includes('none') || claim2.predicate.includes('no ');
    
    if ((hasAll1 && hasNone2) || (hasNone1 && hasAll2)) {
      return {
        type: 'logical',
        strength: 0.85,
        claim1,
        claim2,
        explanation: 'All/none logical contradiction',
      };
    }
    
    return null;
  }
  
  /**
   * Checks for temporal contradiction.
   */
  private checkTemporalContradiction(
    claim1: Claim,
    claim2: Claim
  ): Contradiction | null {
    // Extract temporal markers
    const temporal1 = this.extractTemporalMarkers(claim1.text);
    const temporal2 = this.extractTemporalMarkers(claim2.text);
    
    if (temporal1.length > 0 && temporal2.length > 0) {
      // Check for conflicting time claims
      if (temporal1.includes('always') && temporal2.includes('never')) {
        return {
          type: 'temporal',
          strength: 0.75,
          claim1,
          claim2,
          explanation: 'Temporal contradiction: always vs never',
        };
      }
      
      // Check for conflicting time periods
      const hasConflict = this.hasTemporalConflict(temporal1, temporal2);
      if (hasConflict) {
        return {
          type: 'temporal',
          strength: 0.6,
          claim1,
          claim2,
          explanation: 'Conflicting temporal claims',
        };
      }
    }
    
    return null;
  }
  
  /**
   * Extracts temporal markers from text.
   */
  private extractTemporalMarkers(text: string): string[] {
    const markers: string[] = [];
    const temporalWords = [
      'always', 'never', 'sometimes', 'often', 'rarely',
      'before', 'after', 'during', 'while', 'when',
      'past', 'present', 'future', 'now', 'then',
      'yesterday', 'today', 'tomorrow',
    ];
    
    const words = text.toLowerCase().split(/\s+/);
    for (const word of words) {
      if (temporalWords.includes(word)) {
        markers.push(word);
      }
    }
    
    return markers;
  }
  
  /**
   * Checks for temporal conflict.
   */
  private hasTemporalConflict(markers1: string[], markers2: string[]): boolean {
    const conflicts = [
      ['before', 'after'],
      ['past', 'future'],
      ['yesterday', 'tomorrow'],
      ['always', 'sometimes'],
      ['often', 'rarely'],
    ];
    
    for (const [t1, t2] of conflicts) {
      if ((markers1.includes(t1) && markers2.includes(t2)) ||
          (markers1.includes(t2) && markers2.includes(t1))) {
        return true;
      }
    }
    
    return false;
  }
  
  /**
   * Calculates connection score for a contradiction.
   */
  private calculateConnectionScore(contradiction: Contradiction): number {
    let score = contradiction.strength;
    
    // Type-specific adjustments
    switch (contradiction.type) {
      case 'direct':
        score *= 1.2; // Direct contradictions are most valuable
        break;
      case 'logical':
        score *= 1.1; // Logical contradictions are important
        break;
      case 'partial':
        score *= 0.9; // Partial contradictions are less certain
        break;
      case 'temporal':
        score *= 0.95; // Temporal contradictions are contextual
        break;
    }
    
    // Confidence adjustment
    const avgConfidence = (contradiction.claim1.confidence + contradiction.claim2.confidence) / 2;
    score *= (0.5 + avgConfidence * 0.5); // Scale by confidence
    
    return Math.min(score, 1);
  }
  
  /**
   * Determines confidence level.
   */
  private getConfidenceLevel(
    score: number,
    contradiction: Contradiction
  ): 'high' | 'medium' | 'low' {
    const claimConfidence = (contradiction.claim1.confidence + contradiction.claim2.confidence) / 2;
    
    if (score >= 0.7 && claimConfidence >= 0.7 && contradiction.strength >= 0.7) {
      return 'high';
    }
    if (score >= 0.4 || contradiction.strength >= 0.5) {
      return 'medium';
    }
    return 'low';
  }
  
  /**
   * Generates explanation for the contradiction.
   */
  private generateExplanation(contradiction: Contradiction): string {
    const { type, claim1, claim2, explanation } = contradiction;
    
    switch (type) {
      case 'direct':
        return `Direct contradiction detected: "${claim1.text.substring(0, 50)}..." ` +
               `conflicts with "${claim2.text.substring(0, 50)}...". ${explanation}`;
      
      case 'logical':
        return `Logical inconsistency found: The claims are mutually exclusive. ` +
               `${explanation}. Cannot both be true simultaneously.`;
      
      case 'partial':
        return `Partial contradiction identified: Claims have conflicting elements. ` +
               `${explanation}. Requires clarification or context.`;
      
      case 'temporal':
        return `Temporal conflict detected: Time-based claims contradict. ` +
               `${explanation}. Check temporal consistency.`;
      
      default:
        return `Contradiction found: ${explanation}. ` +
               `Strength: ${(contradiction.strength * 100).toFixed(0)}%.`;
    }
  }
  
  /**
   * Checks for required metadata.
   */
  protected hasRequiredMetadata(chunk: ChunkWithMetadata): boolean {
    // Can work with just content
    return !!(chunk.content && chunk.content.length > 50);
  }
}