/**
 * Structural Pattern Engine
 * Detects similarly organized content by comparing document structure patterns
 * 
 * Performance target: <300ms pattern matching for 50 chunks
 * Accuracy: >80% pattern recognition
 * Flexibility: Support various document structures (lists, headings, tables, etc.)
 */

import { BaseEngine } from './base-engine';
import {
  CollisionDetectionInput,
  CollisionResult,
  ChunkWithMetadata,
  EngineType,
} from './types';
import { calculatePatternSimilarity, extractStructuralFingerprint } from '../lib/pattern-matching';

export interface StructuralPatternConfig {
  /** Minimum pattern similarity threshold (0-1) */
  threshold?: number;
  /** Enable fuzzy pattern matching */
  fuzzyMatching?: boolean;
  /** Weight for structure importance */
  structureWeight?: number;
  /** Consider heading hierarchy */
  considerHierarchy?: boolean;
  /** Maximum results per chunk */
  maxResultsPerChunk?: number;
}

/**
 * Structural Pattern Engine implementation
 * Analyzes and compares document structure patterns to find similarly organized content
 */
export class StructuralPatternEngine extends BaseEngine {
  readonly type: EngineType = 'structural_pattern';
  private config: StructuralPatternConfig;

  constructor(config: StructuralPatternConfig = {}) {
    super();
    this.config = {
      threshold: 0.65,
      fuzzyMatching: true,
      structureWeight: 0.4,
      considerHierarchy: true,
      maxResultsPerChunk: 10,
      ...config
    };
  }

  /**
   * Implements the abstract detectImpl method from BaseEngine
   */
  protected async detectImpl(input: CollisionDetectionInput): Promise<CollisionResult[]> {
    const { sourceChunk, targetChunks } = input;
    const results: CollisionResult[] = [];

    // Extract structural pattern from source chunk
    const sourcePattern = this.extractPattern(sourceChunk);
    if (!sourcePattern) {
      console.warn(`Could not extract pattern for chunk ${sourceChunk.id}`);
      return results;
    }

    // Process target chunks in parallel for efficiency
    const comparisons = await Promise.all(
      targetChunks.map(async (targetChunk) => {
        // Skip self-references
        if (targetChunk.id === sourceChunk.id) {
          return null;
        }

        const targetPattern = this.extractPattern(targetChunk);
        if (!targetPattern) {
          return null;
        }

        // Calculate pattern similarity
        const similarity = this.calculateSimilarity(sourcePattern, targetPattern);
        if (similarity < this.config.threshold!) {
          return null;
        }

        // Calculate confidence based on similarity ranges
        const confidence = this.getConfidenceLevel(similarity);

        return {
          sourceChunkId: sourceChunk.id,
          targetChunkId: targetChunk.id,
          engine: this.type,
          score: similarity,
          confidence,
          metadata: {
            patternType: this.identifyPatternType(sourcePattern, targetPattern),
            structuralMatch: this.getStructuralMatchDetails(sourcePattern, targetPattern),
            fuzzyMatch: this.config.fuzzyMatching && similarity < 0.85
          }
        } as CollisionResult;
      })
    );

    // Filter out nulls and return valid results
    return comparisons.filter((r): r is CollisionResult => r !== null);
  }

  /**
   * Checks if chunk has required structural metadata
   */
  protected hasRequiredMetadata(chunk: ChunkWithMetadata): boolean {
    // Check for structural indicators in metadata
    const metadata = chunk.metadata;
    return !!(
      metadata?.structure ||
      metadata?.has_lists ||
      metadata?.has_headings ||
      metadata?.has_tables ||
      metadata?.formatting_patterns ||
      metadata?.content // Fallback to content analysis
    );
  }

  /**
   * Extracts structural pattern from chunk
   */
  private extractPattern(chunk: ChunkWithMetadata): StructuralPattern | null {
    const metadata = chunk.metadata;
    
    // Try to use pre-computed structural metadata
    if (metadata?.structure) {
      return metadata.structure as StructuralPattern;
    }

    // Build pattern from available metadata
    const pattern: StructuralPattern = {
      hasList: metadata?.has_lists || false,
      hasHeadings: metadata?.has_headings || false,
      hasTable: metadata?.has_tables || false,
      headingLevels: metadata?.heading_levels || [],
      paragraphCount: metadata?.paragraph_count || 0,
      listDepth: metadata?.list_depth || 0,
      bulletStyle: metadata?.bullet_style || 'none',
      numbering: metadata?.has_numbering || false,
      codeBlocks: metadata?.has_code || false,
      quotes: metadata?.has_quotes || false,
    };

    // Fallback to content analysis if needed
    if (chunk.content && !this.hasStructuralInfo(pattern)) {
      return this.analyzeContentStructure(chunk.content);
    }

    return pattern;
  }

  /**
   * Calculates similarity between two structural patterns
   */
  private calculateSimilarity(pattern1: StructuralPattern, pattern2: StructuralPattern): number {
    let score = 0;
    let weights = 0;

    // Compare boolean features
    const booleanFeatures: (keyof StructuralPattern)[] = [
      'hasList', 'hasHeadings', 'hasTable', 'numbering', 'codeBlocks', 'quotes'
    ];
    
    for (const feature of booleanFeatures) {
      const weight = this.getFeatureWeight(feature);
      weights += weight;
      if (pattern1[feature] === pattern2[feature]) {
        score += weight;
      }
    }

    // Compare heading hierarchy if configured
    if (this.config.considerHierarchy && pattern1.headingLevels && pattern2.headingLevels) {
      const hierarchyScore = this.compareHierarchy(pattern1.headingLevels, pattern2.headingLevels);
      const weight = 0.3;
      score += hierarchyScore * weight;
      weights += weight;
    }

    // Compare numerical features with tolerance
    if (pattern1.paragraphCount && pattern2.paragraphCount) {
      const paragraphSimilarity = 1 - Math.abs(pattern1.paragraphCount - pattern2.paragraphCount) / 
        Math.max(pattern1.paragraphCount, pattern2.paragraphCount);
      const weight = 0.2;
      score += paragraphSimilarity * weight;
      weights += weight;
    }

    // Apply fuzzy matching if enabled
    if (this.config.fuzzyMatching) {
      score = this.applyFuzzyMatching(score, pattern1, pattern2);
    }

    return weights > 0 ? score / weights : 0;
  }

  /**
   * Compares heading hierarchies
   */
  private compareHierarchy(levels1: number[], levels2: number[]): number {
    if (levels1.length === 0 || levels2.length === 0) {
      return levels1.length === levels2.length ? 1 : 0;
    }

    // Compare level sequences using edit distance
    const maxLen = Math.max(levels1.length, levels2.length);
    const minLen = Math.min(levels1.length, levels2.length);
    
    let matches = 0;
    for (let i = 0; i < minLen; i++) {
      if (levels1[i] === levels2[i]) {
        matches++;
      }
    }

    return matches / maxLen;
  }

  /**
   * Applies fuzzy matching logic for approximate patterns
   */
  private applyFuzzyMatching(baseScore: number, pattern1: StructuralPattern, pattern2: StructuralPattern): number {
    // Boost score for similar but not identical patterns
    const structuralSimilarity = this.countSimilarFeatures(pattern1, pattern2);
    
    if (structuralSimilarity >= 0.6) {
      // Apply fuzzy boost
      return Math.min(1.0, baseScore * 1.1);
    }
    
    return baseScore;
  }

  /**
   * Counts similar structural features
   */
  private countSimilarFeatures(pattern1: StructuralPattern, pattern2: StructuralPattern): number {
    let similar = 0;
    let total = 0;

    for (const key in pattern1) {
      if (pattern1.hasOwnProperty(key) && pattern2.hasOwnProperty(key)) {
        total++;
        if (this.areFeaturesSimila(pattern1[key as keyof StructuralPattern], 
                                    pattern2[key as keyof StructuralPattern])) {
          similar++;
        }
      }
    }

    return total > 0 ? similar / total : 0;
  }

  /**
   * Checks if two features are similar (not necessarily identical)
   */
  private areFeaturesSimila(feature1: any, feature2: any): boolean {
    // For booleans, they must match
    if (typeof feature1 === 'boolean') {
      return feature1 === feature2;
    }

    // For numbers, allow some tolerance
    if (typeof feature1 === 'number' && typeof feature2 === 'number') {
      const diff = Math.abs(feature1 - feature2);
      const avg = (feature1 + feature2) / 2;
      return diff / avg < 0.3; // Within 30% difference
    }

    // For arrays, check overlap
    if (Array.isArray(feature1) && Array.isArray(feature2)) {
      const set1 = new Set(feature1);
      const set2 = new Set(feature2);
      const intersection = new Set([...set1].filter(x => set2.has(x)));
      return intersection.size > 0;
    }

    return feature1 === feature2;
  }

  /**
   * Analyzes raw content to extract structure
   */
  private analyzeContentStructure(content: string): StructuralPattern {
    const pattern: StructuralPattern = {
      hasList: /^[\s]*[-*+•]\s/m.test(content) || /^\d+\.\s/m.test(content),
      hasHeadings: /^#{1,6}\s/m.test(content),
      hasTable: /\|.*\|/m.test(content),
      headingLevels: this.extractHeadingLevels(content),
      paragraphCount: content.split(/\n\n+/).length,
      listDepth: this.calculateListDepth(content),
      bulletStyle: this.detectBulletStyle(content),
      numbering: /^\d+\.\s/m.test(content),
      codeBlocks: /```[\s\S]*```/.test(content) || /^    /m.test(content),
      quotes: /^>\s/m.test(content),
    };

    return pattern;
  }

  /**
   * Extracts heading levels from content
   */
  private extractHeadingLevels(content: string): number[] {
    const headingRegex = /^(#{1,6})\s/gm;
    const levels: number[] = [];
    let match;
    
    while ((match = headingRegex.exec(content)) !== null) {
      levels.push(match[1].length);
    }
    
    return levels;
  }

  /**
   * Calculates maximum list nesting depth
   */
  private calculateListDepth(content: string): number {
    const lines = content.split('\n');
    let maxDepth = 0;
    
    for (const line of lines) {
      const match = line.match(/^(\s*)[-*+•\d]/);
      if (match) {
        const depth = Math.floor(match[1].length / 2) + 1;
        maxDepth = Math.max(maxDepth, depth);
      }
    }
    
    return maxDepth;
  }

  /**
   * Detects the predominant bullet style
   */
  private detectBulletStyle(content: string): string {
    if (/^\s*-\s/m.test(content)) return 'dash';
    if (/^\s*\*\s/m.test(content)) return 'asterisk';
    if (/^\s*\+\s/m.test(content)) return 'plus';
    if (/^\s*•\s/m.test(content)) return 'bullet';
    if (/^\d+\.\s/m.test(content)) return 'numbered';
    return 'none';
  }

  /**
   * Checks if pattern has structural information
   */
  private hasStructuralInfo(pattern: StructuralPattern): boolean {
    return pattern.hasList || pattern.hasHeadings || pattern.hasTable || 
           pattern.codeBlocks || pattern.quotes || pattern.paragraphCount > 0;
  }

  /**
   * Identifies the type of pattern match
   */
  private identifyPatternType(pattern1: StructuralPattern, pattern2: StructuralPattern): string {
    if (pattern1.hasList && pattern2.hasList) {
      if (pattern1.numbering && pattern2.numbering) return 'numbered-list';
      return 'bulleted-list';
    }
    
    if (pattern1.hasHeadings && pattern2.hasHeadings) {
      if (pattern1.headingLevels?.length === pattern2.headingLevels?.length) {
        return 'identical-hierarchy';
      }
      return 'similar-hierarchy';
    }
    
    if (pattern1.hasTable && pattern2.hasTable) return 'tabular';
    if (pattern1.codeBlocks && pattern2.codeBlocks) return 'code-structure';
    if (pattern1.quotes && pattern2.quotes) return 'quotation-based';
    
    return 'mixed-structure';
  }

  /**
   * Gets detailed structural match information
   */
  private getStructuralMatchDetails(pattern1: StructuralPattern, pattern2: StructuralPattern): any {
    return {
      matchingFeatures: this.getMatchingFeatures(pattern1, pattern2),
      differingFeatures: this.getDifferingFeatures(pattern1, pattern2),
      hierarchySimilarity: this.config.considerHierarchy 
        ? this.compareHierarchy(pattern1.headingLevels || [], pattern2.headingLevels || [])
        : null
    };
  }

  /**
   * Gets list of matching features
   */
  private getMatchingFeatures(pattern1: StructuralPattern, pattern2: StructuralPattern): string[] {
    const matching: string[] = [];
    
    for (const key in pattern1) {
      if (pattern1[key as keyof StructuralPattern] === pattern2[key as keyof StructuralPattern]) {
        matching.push(key);
      }
    }
    
    return matching;
  }

  /**
   * Gets list of differing features
   */
  private getDifferingFeatures(pattern1: StructuralPattern, pattern2: StructuralPattern): string[] {
    const differing: string[] = [];
    
    for (const key in pattern1) {
      if (pattern1[key as keyof StructuralPattern] !== pattern2[key as keyof StructuralPattern]) {
        differing.push(key);
      }
    }
    
    return differing;
  }

  /**
   * Gets confidence level based on similarity score
   */
  private getConfidenceLevel(similarity: number): 'high' | 'medium' | 'low' {
    if (similarity >= 0.85) return 'high';
    if (similarity >= 0.75) return 'medium';
    return 'low';
  }

  /**
   * Gets weight for a structural feature
   */
  private getFeatureWeight(feature: keyof StructuralPattern): number {
    const weights: Partial<Record<keyof StructuralPattern, number>> = {
      hasHeadings: 0.25,
      hasList: 0.20,
      hasTable: 0.15,
      codeBlocks: 0.15,
      numbering: 0.10,
      quotes: 0.10,
      paragraphCount: 0.05
    };
    
    return weights[feature] || 0.1;
  }
}

/**
 * Interface for structural patterns
 */
interface StructuralPattern {
  hasList: boolean;
  hasHeadings: boolean;
  hasTable: boolean;
  headingLevels?: number[];
  paragraphCount: number;
  listDepth: number;
  bulletStyle: string;
  numbering: boolean;
  codeBlocks: boolean;
  quotes: boolean;
  [key: string]: any; // Allow additional pattern features
}