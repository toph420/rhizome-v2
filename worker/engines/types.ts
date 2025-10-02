/**
 * Type definitions for the 7-engine collision detection system.
 * Provides interfaces for engine implementations and orchestration.
 */

import { z } from 'zod';

/**
 * Represents a chunk of data to be processed by engines.
 */
export interface ChunkData {
  /** Unique chunk identifier */
  id: string;
  /** Document this chunk belongs to */
  documentId: string;
  /** Chunk content text */
  content: string;
  /** Optional embedding vector (768 dimensions for Gemini) */
  embedding?: number[];
  /** Metadata associated with the chunk */
  metadata?: Record<string, any>;
}

/**
 * Engine performance metrics.
 */
export interface EngineMetrics {
  processedChunks: number;
  collisionsFound: number;
  processingTime: number;
  cacheHitRate: number;
  averageScore: number;
}

/**
 * Represents a connection/collision detected between chunks.
 */
export interface CollisionResult {
  /** Source chunk ID */
  sourceChunkId: string;
  /** Target chunk ID that has a connection */
  targetChunkId: string;
  /** Engine that detected this collision */
  engineType: EngineType;
  /** Strength of the connection (0-1) */
  score: number;
  /** Confidence level */
  confidence: 'high' | 'medium' | 'low';
  /** Human-readable explanation of the connection */
  explanation?: string;
  /** Additional metadata specific to the engine */
  metadata?: Record<string, unknown>;
}

/**
 * Types of collision detection engines.
 * Optimized 3-engine system for efficient connection discovery.
 */
export enum EngineType {
  SEMANTIC_SIMILARITY = 'semantic_similarity',
  CONTRADICTION_DETECTION = 'contradiction_detection',
  THEMATIC_BRIDGE = 'thematic_bridge'
}

/**
 * Configuration for engine execution.
 */
export interface EngineConfig {
  /** Maximum number of results to return */
  maxResults?: number;
  /** Minimum score threshold for results */
  minScore?: number;
  /** Timeout in milliseconds */
  timeout?: number;
  /** Enable caching of results */
  enableCache?: boolean;
  /** Custom parameters for specific engines */
  customParams?: Record<string, unknown>;
}

/**
 * Bridge analysis result from AI processing.
 * Used by ThematicBridge engine for AI-powered connection analysis.
 */
export interface BridgeAnalysis {
  /** Type of thematic bridge detected */
  bridgeType: 'conceptual' | 'causal' | 'temporal' | 'argumentative' | 'metaphorical' | 'contextual';
  /** Strength of the bridge connection (0-1) */
  strength: number;
  /** Human-readable explanation of the connection */
  explanation: string;
  /** Key concepts that form the bridge */
  bridgeConcepts?: string[];
  /** Supporting evidence or quotes */
  evidence?: string[];
  /** Confidence level of the AI analysis */
  confidence: 'high' | 'medium' | 'low';
}

/**
 * Input data for collision detection.
 */
export interface CollisionDetectionInput {
  /** The primary chunk to find connections for */
  sourceChunk: ChunkWithMetadata;
  /** Pool of chunks to search within */
  targetChunks: ChunkWithMetadata[];
  /** Engine-specific configuration */
  config?: EngineConfig;
}

/**
 * Chunk data with flat metadata structure for 3-engine system.
 * Matches database schema after migration 019.
 */
export interface ChunkWithMetadata {
  id: string;
  document_id: string;
  content: string;
  chunk_index: number;
  embedding?: number[];
  word_count?: number;
  start_offset?: number;
  end_offset?: number;
  created_at?: string;

  // Active metadata fields (used by engines)
  themes?: string[]; // SemanticSimilarity
  importance_score?: number; // ThematicBridge filtering (0-1)
  summary?: string; // Display/context

  // Flat JSONB metadata (3-engine system)
  emotional_metadata?: {
    polarity: number; // -1 to 1
    primaryEmotion: string;
    intensity: number;
  };

  conceptual_metadata?: {
    concepts: Array<{ text: string; importance: number }>;
  };

  domain_metadata?: {
    primaryDomain: string;
    confidence: number;
  };

  // Tracking
  metadata_extracted_at?: string;
}

/**
 * Result from an individual engine.
 */
export interface EngineResult {
  engineType: EngineType;
  collisions: CollisionResult[];
  executionTime: number;
  error?: Error;
}

/**
 * Aggregated results from all engines.
 */
export interface AggregatedResults {
  /** All detected collisions */
  collisions: CollisionResult[];
  /** Collisions grouped by target chunk */
  groupedByTarget: Map<string, CollisionResult[]>;
  /** Weighted scores per target chunk */
  weightedScores: Map<string, number>;
  /** Top connections sorted by weighted score */
  topConnections: Array<{
    targetChunkId: string;
    totalScore: number;
    engines: EngineType[];
    explanations: string[];
  }>;
  /** Performance metrics */
  metrics: {
    totalExecutionTime: number;
    engineMetrics: Map<EngineType, { time: number; resultCount: number }>;
  };
}

/**
 * Weight configuration for scoring system.
 */
export interface WeightConfig {
  weights: Partial<Record<EngineType, number>>;
  normalizationMethod: 'linear' | 'sigmoid' | 'softmax';
  combineMethod: 'sum' | 'average' | 'max' | 'harmonic_mean';
}

/**
 * Base interface for all collision detection engines.
 */
export interface CollisionEngine {
  /** Engine type identifier */
  readonly type: EngineType;
  
  /**
   * Detects collisions between source chunk and target chunks.
   * @param input - Detection input with chunks and config
   * @returns Promise resolving to collision results
   */
  detect(input: CollisionDetectionInput): Promise<CollisionResult[]>;
  
  /**
   * Validates if the engine can process the given input.
   * @param input - Detection input to validate
   * @returns True if engine can process, false otherwise
   */
  canProcess(input: CollisionDetectionInput): boolean;
  
  /**
   * Gets engine-specific configuration schema.
   * @returns Zod schema for configuration validation
   */
  getConfigSchema(): z.ZodSchema;
  
  /**
   * Cleans up resources used by the engine.
   */
  cleanup?(): Promise<void>;
}

/**
 * Orchestrator configuration.
 */
export interface OrchestratorConfig {
  /** Enable parallel execution */
  parallel: boolean;
  /** Maximum concurrent engines */
  maxConcurrency?: number;
  /** Global timeout for all engines */
  globalTimeout?: number;
  /** Weight configuration for scoring */
  weights?: WeightConfig;
  /** Engines to enable/disable */
  enabledEngines?: EngineType[];
  /** Cache configuration */
  cache?: {
    enabled: boolean;
    ttl?: number;
    maxSize?: number;
  };
}

// Validation schemas
export const CollisionResultSchema = z.object({
  sourceChunkId: z.string(),
  targetChunkId: z.string(),
  engineType: z.nativeEnum(EngineType),
  score: z.number().min(0).max(1),
  confidence: z.enum(['high', 'medium', 'low']),
  explanation: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const WeightConfigSchema = z.object({
  weights: z.record(z.nativeEnum(EngineType), z.number().min(0).max(1)),
  normalizationMethod: z.enum(['linear', 'sigmoid', 'softmax']),
  combineMethod: z.enum(['sum', 'average', 'max', 'harmonic_mean']),
});

// Default weight configuration for 3-engine system
export const DEFAULT_WEIGHTS: WeightConfig = {
  weights: {
    [EngineType.SEMANTIC_SIMILARITY]: 0.25,
    [EngineType.CONTRADICTION_DETECTION]: 0.40,
    [EngineType.THEMATIC_BRIDGE]: 0.35,
  },
  normalizationMethod: 'linear',
  combineMethod: 'sum',
};