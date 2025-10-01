/**
 * Thematic Bridge Engine
 * 
 * AI-powered engine that discovers conceptual bridges and thematic connections
 * between document chunks using Gemini AI for deep cross-domain analysis.
 * Optimized for cost efficiency and intelligent candidate filtering.
 */

import { BaseEngine } from './base-engine';
import { CollisionDetectionInput, CollisionResult, EngineType, ChunkWithMetadata, BridgeAnalysis } from './types';
import { createGeminiClient } from '../lib/ai-client';
import type { GoogleGenAI } from '@google/genai';

/**
 * Configuration for ThematicBridge engine.
 */
export interface ThematicBridgeConfig {
  /** Minimum importance score to consider chunks (0-1) */
  importanceThreshold?: number;
  /** Maximum candidates to send to AI for analysis */
  maxCandidates?: number;
  /** Minimum concept overlap for candidate filtering (0-1) */
  conceptOverlapRange?: { min: number; max: number };
  /** Minimum strength threshold for bridge results (0-1) */
  strengthThreshold?: number;
  /** Gemini API key */
  apiKey?: string;
  /** Model name to use */
  modelName?: string;
}

/**
 * Thematic Bridge Engine implementation.
 * Uses AI to discover sophisticated connections between ideas across domains.
 */
export class ThematicBridgeEngine extends BaseEngine {
  readonly type: EngineType = EngineType.THEMATIC_BRIDGE;
  
  private geminiClient: GoogleGenAI;
  private config: Required<ThematicBridgeConfig>;
  
  // Configuration constants
  private static readonly DEFAULT_IMPORTANCE_THRESHOLD = 0.6;
  private static readonly DEFAULT_MAX_CANDIDATES = 15;
  private static readonly DEFAULT_CONCEPT_OVERLAP_MIN = 0.2;
  private static readonly DEFAULT_CONCEPT_OVERLAP_MAX = 0.7;
  private static readonly DEFAULT_STRENGTH_THRESHOLD = 0.6;
  private static readonly DEFAULT_MODEL = 'gemini-2.0-flash-exp';
  
  constructor(config: ThematicBridgeConfig = {}) {
    super();
    
    // Initialize configuration with defaults
    this.config = {
      importanceThreshold: config.importanceThreshold ?? ThematicBridgeEngine.DEFAULT_IMPORTANCE_THRESHOLD,
      maxCandidates: config.maxCandidates ?? ThematicBridgeEngine.DEFAULT_MAX_CANDIDATES,
      conceptOverlapRange: config.conceptOverlapRange ?? {
        min: ThematicBridgeEngine.DEFAULT_CONCEPT_OVERLAP_MIN,
        max: ThematicBridgeEngine.DEFAULT_CONCEPT_OVERLAP_MAX
      },
      strengthThreshold: config.strengthThreshold ?? ThematicBridgeEngine.DEFAULT_STRENGTH_THRESHOLD,
      apiKey: config.apiKey ?? process.env.GOOGLE_AI_API_KEY ?? '',
      modelName: config.modelName ?? ThematicBridgeEngine.DEFAULT_MODEL
    };
    
    if (!this.config.apiKey) {
      throw new Error('Gemini API key is required for ThematicBridge engine');
    }
    
    // Initialize Gemini client
    this.geminiClient = createGeminiClient(this.config.apiKey);
  }
  
  /**
   * Implements the abstract detectImpl method from BaseEngine.
   * Performs intelligent candidate filtering followed by AI-powered bridge analysis.
   */
  protected async detectImpl(input: CollisionDetectionInput): Promise<CollisionResult[]> {
    const { sourceChunk, targetChunks } = input;
    
    // Check source chunk importance threshold
    const sourceImportance = sourceChunk.metadata?.importance ?? 0;
    if (sourceImportance < this.config.importanceThreshold) {
      return []; // Skip low-importance source chunks to control costs
    }
    
    // Filter and rank candidates
    const candidates = this.filterCandidates(sourceChunk, targetChunks);
    
    if (candidates.length === 0) {
      return [];
    }
    
    // Analyze bridges using AI
    const bridgeAnalyses = await this.batchAnalyzeBridges(sourceChunk, candidates);
    
    // Convert to collision results
    return this.convertToCollisionResults(sourceChunk.id, bridgeAnalyses);
  }
  
  /**
   * Checks if chunk has required metadata for thematic bridge analysis.
   */
  protected hasRequiredMetadata(chunk: ChunkWithMetadata): boolean {
    // Need content and ideally importance score and concepts
    return !!(
      chunk.content && 
      chunk.content.length > 50 &&
      (chunk.metadata?.importance !== undefined || chunk.metadata?.key_concepts?.concepts)
    );
  }
  
  /**
   * Filters and ranks candidate chunks based on importance, cross-document preference,
   * and concept overlap to optimize AI analysis costs.
   */
  private filterCandidates(
    sourceChunk: ChunkWithMetadata, 
    targetChunks: ChunkWithMetadata[]
  ): ChunkWithMetadata[] {
    const candidates = targetChunks.filter(target => {
      // Skip self-references
      if (target.id === sourceChunk.id) {
        return false;
      }
      
      // Filter by importance threshold
      const importance = target.metadata?.importance ?? 0;
      if (importance < this.config.importanceThreshold) {
        return false;
      }
      
      // Check concept overlap if available
      const overlap = this.calculateChunkConceptOverlap(sourceChunk, target);
      if (overlap !== null) {
        const { min, max } = this.config.conceptOverlapRange;
        if (overlap < min || overlap > max) {
          return false; // Too similar or too different
        }
      }
      
      return true;
    });
    
    // Sort by importance score and cross-document preference
    candidates.sort((a, b) => {
      // Prioritize cross-document connections
      const aIsExternal = a.document_id !== sourceChunk.document_id;
      const bIsExternal = b.document_id !== sourceChunk.document_id;
      
      if (aIsExternal !== bIsExternal) {
        return aIsExternal ? -1 : 1;
      }
      
      // Then by importance score
      const aImportance = a.metadata?.importance ?? 0;
      const bImportance = b.metadata?.importance ?? 0;
      return bImportance - aImportance;
    });
    
    // Limit to max candidates to control AI costs
    return candidates.slice(0, this.config.maxCandidates);
  }
  
  /**
   * Calculates concept overlap between two chunks.
   * Returns null if concept data is not available.
   */
  private calculateChunkConceptOverlap(
    chunk1: ChunkWithMetadata, 
    chunk2: ChunkWithMetadata
  ): number | null {
    const concepts1 = chunk1.metadata?.key_concepts?.concepts;
    const concepts2 = chunk2.metadata?.key_concepts?.concepts;
    
    if (!concepts1?.length || !concepts2?.length) {
      return null;
    }
    
    // Use BaseEngine helper method for concept overlap calculation
    return super.calculateConceptOverlap(concepts1, concepts2);
  }
  
  /**
   * Batch analyzes bridges between source chunk and multiple candidates.
   * Processes all candidates in parallel for efficiency.
   */
  private async batchAnalyzeBridges(
    sourceChunk: ChunkWithMetadata,
    candidates: ChunkWithMetadata[]
  ): Promise<Array<{ targetId: string; analysis: BridgeAnalysis | null }>> {
    const promises = candidates.map(async (candidate) => ({
      targetId: candidate.id,
      analysis: await this.analyzeBridge(sourceChunk, candidate)
    }));
    
    const results = await Promise.allSettled(promises);
    
    return results.map((result, index) => ({
      targetId: candidates[index].id,
      analysis: result.status === 'fulfilled' ? result.value.analysis : null
    }));
  }
  
  /**
   * Analyzes a single bridge connection using Gemini AI with retry logic.
   * Returns null if analysis fails or doesn't meet thresholds.
   */
  private async analyzeBridge(
    sourceChunk: ChunkWithMetadata,
    targetChunk: ChunkWithMetadata
  ): Promise<BridgeAnalysis | null> {
    return this.withRetry(async () => {
      const prompt = this.generateBridgePrompt(sourceChunk, targetChunk);
      
      const model = this.geminiClient.getGenerativeModel({ 
        model: this.config.modelName 
      } as any);
      
      const result = await model.generateContent(prompt);
      const response = await result.response;
      const text = response.text();
      
      return this.parseBridgeResponse(text);
    }, sourceChunk.id, targetChunk.id);
  }
  
  /**
   * Retry wrapper with exponential backoff for API calls.
   * Handles rate limits, timeouts, and API errors gracefully.
   */
  private async withRetry<T>(
    operation: () => Promise<T>,
    sourceId?: string,
    targetId?: string,
    maxRetries: number = 3
  ): Promise<T | null> {
    let lastError: Error | null = null;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;
        
        // Log the attempt
        const context = sourceId && targetId ? `${sourceId} -> ${targetId}` : 'unknown';
        console.warn(`ThematicBridge attempt ${attempt}/${maxRetries} failed for ${context}:`, error);
        
        // Don't retry on the last attempt
        if (attempt === maxRetries) {
          break;
        }
        
        // Determine if we should retry based on error type
        const shouldRetry = this.shouldRetryError(error as Error);
        if (!shouldRetry) {
          console.warn(`Non-retryable error, stopping retry attempts:`, error);
          break;
        }
        
        // Calculate exponential backoff delay
        const baseDelay = 1000; // 1 second
        const delay = baseDelay * Math.pow(2, attempt - 1); // 1s, 2s, 4s
        
        console.log(`Retrying in ${delay}ms...`);
        await this.sleep(delay);
      }
    }
    
    // All retries exhausted, log final error and return null for graceful degradation
    console.error(`ThematicBridge analysis failed after ${maxRetries} attempts:`, lastError);
    return null;
  }
  
  /**
   * Determines if an error is worth retrying.
   */
  private shouldRetryError(error: Error): boolean {
    const message = error.message.toLowerCase();
    
    // Retry on rate limits
    if (message.includes('rate limit') || message.includes('quota exceeded')) {
      return true;
    }
    
    // Retry on network timeouts
    if (message.includes('timeout') || message.includes('network')) {
      return true;
    }
    
    // Retry on temporary server errors
    if (message.includes('internal error') || message.includes('service unavailable')) {
      return true;
    }
    
    // Don't retry on authentication errors or invalid requests
    if (message.includes('auth') || message.includes('invalid') || message.includes('forbidden')) {
      return false;
    }
    
    // Default to retry for unknown errors
    return true;
  }
  
  /**
   * Simple sleep utility for retry delays.
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  /**
   * Generates a structured prompt for bridge analysis.
   */
  private generateBridgePrompt(
    sourceChunk: ChunkWithMetadata,
    targetChunk: ChunkWithMetadata
  ): string {
    return `Analyze the thematic connection between these two text passages. Focus on identifying sophisticated bridges between ideas, concepts, or themes that might not be immediately obvious.

SOURCE PASSAGE:
${sourceChunk.content}

TARGET PASSAGE:
${targetChunk.content}

Look for these types of thematic bridges:
- Conceptual: Similar ideas expressed differently
- Causal: One passage explains causes/effects related to the other
- Temporal: Different time periods of the same phenomenon
- Argumentative: Supporting or contrasting viewpoints
- Metaphorical: Similar underlying patterns or structures
- Contextual: Different contexts of the same core concept

If you find a meaningful connection, respond with JSON in this exact format:
{
  "bridgeType": "conceptual|causal|temporal|argumentative|metaphorical|contextual",
  "strength": 0.0-1.0,
  "explanation": "Brief explanation of the connection",
  "bridgeConcepts": ["key", "concepts", "that", "bridge"],
  "evidence": ["supporting quotes"],
  "confidence": "high|medium|low"
}

If no meaningful connection exists, respond with: { "strength": 0 }

Only identify connections with strength ≥ ${this.config.strengthThreshold}. Be selective and focus on quality over quantity.`;
  }
  
  /**
   * Parses and validates the AI response for bridge analysis.
   */
  private parseBridgeResponse(responseText: string): BridgeAnalysis | null {
    try {
      const parsed = JSON.parse(responseText.trim());
      
      // Check for no-connection response
      if (parsed.strength === 0 || !parsed.bridgeType) {
        return null;
      }
      
      // Validate required fields
      if (!parsed.strength || !parsed.explanation || !parsed.confidence) {
        console.warn('Invalid bridge response: missing required fields');
        return null;
      }
      
      // Check strength threshold
      if (parsed.strength < this.config.strengthThreshold) {
        return null;
      }
      
      // Return validated analysis
      return {
        bridgeType: parsed.bridgeType || 'conceptual',
        strength: Math.max(0, Math.min(1, parsed.strength)),
        explanation: parsed.explanation,
        bridgeConcepts: parsed.bridgeConcepts || [],
        evidence: parsed.evidence || [],
        confidence: ['high', 'medium', 'low'].includes(parsed.confidence) 
          ? parsed.confidence 
          : 'medium'
      };
      
    } catch (error) {
      console.warn('Failed to parse bridge analysis response:', error);
      return null;
    }
  }
  
  /**
   * Converts bridge analyses to collision results.
   */
  private convertToCollisionResults(
    sourceChunkId: string,
    analyses: Array<{ targetId: string; analysis: BridgeAnalysis | null }>
  ): CollisionResult[] {
    return analyses
      .filter(({ analysis }) => analysis !== null)
      .map(({ targetId, analysis }) => ({
        sourceChunkId,
        targetChunkId: targetId,
        engineType: this.type,
        score: analysis!.strength,
        confidence: analysis!.confidence,
        explanation: `${analysis!.bridgeType} bridge: ${analysis!.explanation}`,
        metadata: {
          bridgeType: analysis!.bridgeType,
          bridgeConcepts: analysis!.bridgeConcepts,
          evidence: analysis!.evidence,
          strengthThreshold: this.config.strengthThreshold,
          aiModel: this.config.modelName
        }
      }));
  }
}