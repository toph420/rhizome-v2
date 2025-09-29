/**
 * Full system integration tests for the 7-engine collision detection system.
 * Tests end-to-end workflow, all engines working together, and result aggregation.
 */

import { describe, it, expect, beforeAll, afterAll, jest } from '@jest/globals';
import { CollisionOrchestrator } from '../../engines/orchestrator';
import { SemanticSimilarityEngine } from '../../engines/semantic-similarity';
import { StructuralPatternEngine } from '../../engines/structural-pattern';
import { TemporalProximityEngine } from '../../engines/temporal-proximity';
import { ConceptualDensityEngine } from '../../engines/conceptual-density';
import { EmotionalResonanceEngine } from '../../engines/emotional-resonance';
import { CitationNetworkEngine } from '../../engines/citation-network';
import { ContradictionDetectionEngine } from '../../engines/contradiction-detection';
import { EngineType } from '../../engines/types';
import * as fs from 'fs/promises';
import * as path from 'path';

describe('Full System Integration Tests', () => {
  let orchestrator: CollisionOrchestrator;
  let smallDataset: any;
  let mediumDataset: any;
  
  beforeAll(async () => {
    // Load test datasets
    const fixturesPath = path.join(__dirname, '../fixtures/collision-test-data');
    smallDataset = JSON.parse(
      await fs.readFile(path.join(fixturesPath, 'small-dataset.json'), 'utf-8')
    );
    mediumDataset = JSON.parse(
      await fs.readFile(path.join(fixturesPath, 'medium-dataset.json'), 'utf-8')
    );
    
    // Initialize orchestrator with production-like configuration
    orchestrator = new CollisionOrchestrator({
      parallel: true,
      maxConcurrency: 7,
      globalTimeout: 5000,
      cache: {
        enabled: true,
        ttl: 300000,
        maxSize: 1000,
      },
      monitoring: {
        enabled: true,
        logLevel: 'info',
        metricsCollection: true,
      },
    });
    
    // Register all production engines
    const engines = [
      new SemanticSimilarityEngine({ threshold: 0.3 }),
      new StructuralPatternEngine({ minPatternLength: 2 }),
      new TemporalProximityEngine({ windowSize: 86400000 }), // 24 hours
      new ConceptualDensityEngine({ minOverlap: 2 }),
      new EmotionalResonanceEngine({ minResonance: 0.4 }),
      new CitationNetworkEngine({ maxDepth: 3 }),
      new ContradictionDetectionEngine({ sensitivity: 0.6 }),
    ];
    
    orchestrator.registerEngines(engines);
    
    // Generate embeddings for test data (simulate real embeddings)
    generateTestEmbeddings(smallDataset);
    generateTestEmbeddings(mediumDataset);
  });
  
  afterAll(async () => {
    await orchestrator.cleanup();
  });
  
  describe('End-to-End Workflow', () => {
    it('should process small dataset through complete pipeline', async () => {
      const result = await orchestrator.detectCollisions({
        sourceChunk: smallDataset.sourceChunk,
        candidateChunks: smallDataset.candidateChunks,
        config: {
          limit: 10,
          minScore: 0.3,
        },
      });
      
      // Verify complete result structure
      expect(result).toMatchObject({
        collisions: expect.any(Array),
        groupedByTarget: expect.any(Map),
        weightedScores: expect.any(Map),
        topConnections: expect.any(Array),
        metrics: {
          totalProcessingTime: expect.any(Number),
          chunkCount: smallDataset.candidateChunks.length,
          collisionCount: expect.any(Number),
          engineMetrics: expect.any(Map),
          cacheHits: expect.any(Number),
          cacheMisses: expect.any(Number),
        },
      });
      
      // Verify expected connections are found
      for (const expected of smallDataset.expectedConnections) {
        const found = result.collisions.some(
          c => c.sourceChunkId === expected.sourceId && 
               c.targetChunkId === expected.targetId &&
               c.score >= expected.minExpectedScore
        );
        expect(found).toBe(true);
      }
    });
    
    it('should handle medium dataset with proper aggregation', async () => {
      const result = await orchestrator.detectCollisions({
        sourceChunk: mediumDataset.sourceChunk,
        candidateChunks: mediumDataset.candidateChunks,
        config: {
          limit: 50,
          minScore: 0.3,
          engines: {
            enabledTypes: [
              EngineType.SEMANTIC_SIMILARITY,
              EngineType.STRUCTURAL_PATTERN,
              EngineType.CONCEPTUAL_DENSITY,
              EngineType.EMOTIONAL_RESONANCE,
              EngineType.CONTRADICTION_DETECTION,
            ],
          },
        },
      });
      
      // Verify proper aggregation
      expect(result.groupedByTarget.size).toBeGreaterThan(0);
      expect(result.groupedByTarget.size).toBeLessThanOrEqual(mediumDataset.candidateChunks.length);
      
      // Check weighted scoring
      expect(result.weightedScores.size).toBeGreaterThan(0);
      
      // Verify top connections are properly sorted
      for (let i = 1; i < result.topConnections.length; i++) {
        expect(result.topConnections[i - 1].totalScore)
          .toBeGreaterThanOrEqual(result.topConnections[i].totalScore);
      }
      
      // Check for contradiction detection
      const contradictions = result.collisions.filter(
        c => c.engineType === EngineType.CONTRADICTION_DETECTION
      );
      expect(contradictions.length).toBeGreaterThan(0);
    });
  });
  
  describe('Engine Coordination', () => {
    it('should coordinate all 7 engines successfully', async () => {
      const result = await orchestrator.detectCollisions({
        sourceChunk: smallDataset.sourceChunk,
        candidateChunks: smallDataset.candidateChunks,
      });
      
      // Verify all engines participated
      const engineTypes = new Set(result.collisions.map(c => c.engineType));
      expect(engineTypes.size).toBeGreaterThanOrEqual(5); // At least 5 engines should find connections
      
      // Check engine metrics
      expect(result.metrics.engineMetrics.size).toBeGreaterThanOrEqual(5);
      
      for (const [engineType, metrics] of result.metrics.engineMetrics) {
        expect(metrics).toMatchObject({
          processingTime: expect.any(Number),
          collisionsFound: expect.any(Number),
          errors: expect.any(Number),
        });
      }
    });
    
    it('should handle selective engine enabling', async () => {
      const selectedEngines = [
        EngineType.SEMANTIC_SIMILARITY,
        EngineType.STRUCTURAL_PATTERN,
      ];
      
      const result = await orchestrator.detectCollisions({
        sourceChunk: smallDataset.sourceChunk,
        candidateChunks: smallDataset.candidateChunks,
        config: {
          engines: {
            enabledTypes: selectedEngines,
          },
        },
      });
      
      // Only selected engines should be in results
      const usedEngines = new Set(result.collisions.map(c => c.engineType));
      usedEngines.forEach(engine => {
        expect(selectedEngines).toContain(engine);
      });
    });
  });
  
  describe('Result Quality', () => {
    it('should produce meaningful collision explanations', async () => {
      const result = await orchestrator.detectCollisions({
        sourceChunk: smallDataset.sourceChunk,
        candidateChunks: smallDataset.candidateChunks.slice(0, 3),
      });
      
      result.collisions.forEach(collision => {
        expect(collision.explanation).toBeTruthy();
        expect(collision.explanation.length).toBeGreaterThan(10);
        expect(collision.metadata).toBeDefined();
      });
    });
    
    it('should respect score thresholds', async () => {
      const minScore = 0.5;
      
      const result = await orchestrator.detectCollisions({
        sourceChunk: smallDataset.sourceChunk,
        candidateChunks: smallDataset.candidateChunks,
        config: {
          minScore,
        },
      });
      
      result.collisions.forEach(collision => {
        expect(collision.score).toBeGreaterThanOrEqual(minScore);
      });
    });
    
    it('should limit results as configured', async () => {
      const limit = 5;
      
      const result = await orchestrator.detectCollisions({
        sourceChunk: mediumDataset.sourceChunk,
        candidateChunks: mediumDataset.candidateChunks,
        config: {
          limit,
          minScore: 0.1, // Low threshold to ensure we have enough results
        },
      });
      
      expect(result.topConnections.length).toBeLessThanOrEqual(limit);
    });
  });
  
  describe('Data Validation', () => {
    it('should validate input chunk structure', async () => {
      const invalidChunk = {
        id: 'invalid',
        // Missing required fields
      };
      
      await expect(
        orchestrator.detectCollisions({
          sourceChunk: invalidChunk as any,
          candidateChunks: [invalidChunk as any],
        })
      ).rejects.toThrow();
    });
    
    it('should handle empty candidate chunks gracefully', async () => {
      const result = await orchestrator.detectCollisions({
        sourceChunk: smallDataset.sourceChunk,
        candidateChunks: [],
      });
      
      expect(result.collisions).toEqual([]);
      expect(result.topConnections).toEqual([]);
      expect(result.metrics.chunkCount).toBe(0);
    });
    
    it('should handle missing metadata fields gracefully', async () => {
      const chunkWithPartialMetadata = {
        ...smallDataset.sourceChunk,
        metadata: {
          themes: ['test'],
          // Missing other fields
        },
      };
      
      const result = await orchestrator.detectCollisions({
        sourceChunk: chunkWithPartialMetadata,
        candidateChunks: [chunkWithPartialMetadata],
      });
      
      // Should still process without crashing
      expect(result).toBeDefined();
      expect(result.metrics.engineMetrics.size).toBeGreaterThan(0);
    });
  });
  
  describe('Monitoring and Metrics', () => {
    it('should collect comprehensive metrics', async () => {
      const result = await orchestrator.detectCollisions({
        sourceChunk: mediumDataset.sourceChunk,
        candidateChunks: mediumDataset.candidateChunks.slice(0, 10),
      });
      
      const { metrics } = result;
      
      // Timing metrics
      expect(metrics.totalProcessingTime).toBeGreaterThan(0);
      expect(metrics.totalProcessingTime).toBeLessThan(5000);
      
      // Count metrics
      expect(metrics.chunkCount).toBe(10);
      expect(metrics.collisionCount).toBeGreaterThanOrEqual(0);
      
      // Cache metrics
      expect(metrics.cacheHits).toBeGreaterThanOrEqual(0);
      expect(metrics.cacheMisses).toBeGreaterThanOrEqual(0);
      
      // Engine-specific metrics
      metrics.engineMetrics.forEach((engineMetrics, engineType) => {
        expect(engineMetrics.processingTime).toBeGreaterThanOrEqual(0);
        expect(engineMetrics.collisionsFound).toBeGreaterThanOrEqual(0);
        expect(engineMetrics.errors).toBeGreaterThanOrEqual(0);
        
        // Processing time should be reasonable
        expect(engineMetrics.processingTime).toBeLessThan(2000);
      });
    });
    
    it('should track cache effectiveness', async () => {
      // First run - cache misses
      const result1 = await orchestrator.detectCollisions({
        sourceChunk: smallDataset.sourceChunk,
        candidateChunks: smallDataset.candidateChunks.slice(0, 2),
      });
      
      // Second run - should have cache hits
      const result2 = await orchestrator.detectCollisions({
        sourceChunk: smallDataset.sourceChunk,
        candidateChunks: smallDataset.candidateChunks.slice(0, 2),
      });
      
      // Cache should be working
      expect(result2.metrics.cacheHits).toBeGreaterThan(0);
      expect(result2.metrics.totalProcessingTime).toBeLessThan(result1.metrics.totalProcessingTime);
    });
  });
});

/**
 * Helper function to generate mock embeddings for test data
 */
function generateTestEmbeddings(dataset: any) {
  // Generate pseudo-random embeddings that maintain some semantic relationship
  const generateEmbedding = (content: string) => {
    const seed = content.length % 10;
    return Array.from({ length: 768 }, (_, i) => 
      Math.sin(seed + i * 0.1) * 0.5 + Math.random() * 0.1
    );
  };
  
  if (dataset.sourceChunk) {
    dataset.sourceChunk.embedding = generateEmbedding(dataset.sourceChunk.content);
  }
  
  if (dataset.candidateChunks) {
    dataset.candidateChunks.forEach((chunk: any) => {
      chunk.embedding = generateEmbedding(chunk.content);
    });
  }
}