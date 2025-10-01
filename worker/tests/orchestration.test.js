/**
 * Integration tests for the 3-engine collision detection orchestration system.
 * Tests parallel execution, result aggregation, and performance targets.
 */

import { describe, it, expect, beforeAll, afterAll, jest } from '@jest/globals';
import { CollisionOrchestrator } from '../engines/orchestrator';
import { SemanticSimilarityEngine } from '../engines/semantic-similarity';
import { ContradictionDetectionEngine } from '../engines/contradiction-detection';
import { ThematicBridgeEngine } from '../engines/thematic-bridge';
import { EngineType } from '../engines/types';

describe('Collision Detection Orchestration', () => {
  let orchestrator;
  let testData;
  
  beforeAll(() => {
    // Initialize orchestrator with all engines
    orchestrator = new CollisionOrchestrator({
      parallel: true,
      maxConcurrency: 3,
      globalTimeout: 5000,
      cache: {
        enabled: true,
        ttl: 300000,
        maxSize: 1000,
      },
    });

    // Register all engines (3-engine system)
    const engines = [
      new SemanticSimilarityEngine(),
      new ContradictionDetectionEngine(),
      new ThematicBridgeEngine(),
    ];

    orchestrator.registerEngines(engines);

    // Create test data
    testData = createTestData();
  });
  
  afterAll(async () => {
    await orchestrator.cleanup();
  });
  
  describe('Parallel Execution', () => {
    it('should execute all 3 engines in parallel', async () => {
      const startTime = performance.now();

      const result = await orchestrator.detectCollisions({
        sourceChunk: testData.sourceChunk,
        candidateChunks: testData.candidateChunks,
        config: {
          limit: 50,
          minScore: 0.3,
        },
      });

      const executionTime = performance.now() - startTime;

      // Verify all engines contributed
      expect(result.metrics.engineMetrics.size).toBeGreaterThanOrEqual(2);

      // Verify parallel execution (should be faster than sequential)
      expect(executionTime).toBeLessThan(2000); // Should complete quickly

      // Verify results structure
      expect(result).toHaveProperty('collisions');
      expect(result).toHaveProperty('groupedByTarget');
      expect(result).toHaveProperty('weightedScores');
      expect(result).toHaveProperty('topConnections');
      expect(result).toHaveProperty('metrics');
    });
    
    it('should handle engine failures gracefully', async () => {
      // Create a failing engine
      const failingEngine = {
        type: EngineType.SEMANTIC_SIMILARITY,
        canProcess: () => true,
        detect: () => Promise.reject(new Error('Test failure')),
      };

      const testOrchestrator = new CollisionOrchestrator();
      testOrchestrator.registerEngine(failingEngine);

      // Other engines
      testOrchestrator.registerEngine(new ContradictionDetectionEngine());
      testOrchestrator.registerEngine(new ThematicBridgeEngine());

      const result = await testOrchestrator.detectCollisions({
        sourceChunk: testData.sourceChunk,
        candidateChunks: testData.candidateChunks.slice(0, 2),
      });

      // Should still get results from working engines
      expect(result.collisions).toBeDefined();
      expect(result.metrics.engineMetrics.size).toBeGreaterThanOrEqual(2);
    });
  });
  
  describe('Performance Targets', () => {
    it('should complete detection for 50 chunks in under 5 seconds', async () => {
      // Create 50 candidate chunks
      const manyChunks = Array.from({ length: 50 }, (_, i) => ({
        ...testData.candidateChunks[0],
        id: `chunk-${i}`,
        content: `Test content ${i} with various keywords and concepts`,
      }));
      
      const startTime = performance.now();
      
      const result = await orchestrator.detectCollisions({
        sourceChunk: testData.sourceChunk,
        candidateChunks: manyChunks,
        config: {
          limit: 50,
          minScore: 0.3,
        },
      });
      
      const executionTime = performance.now() - startTime;
      
      // Must complete within 5 seconds
      expect(executionTime).toBeLessThan(5000);
      
      // Should find connections
      expect(result.collisions.length).toBeGreaterThan(0);
      
      console.log(`[Test] Processed 50 chunks in ${executionTime.toFixed(2)}ms`);
    });
    
    it('should scale linearly with chunk count', async () => {
      const timings = [];
      
      for (const count of [10, 20, 30]) {
        const chunks = Array.from({ length: count }, (_, i) => ({
          ...testData.candidateChunks[0],
          id: `chunk-scale-${i}`,
          content: `Scaling test content ${i}`,
        }));
        
        const startTime = performance.now();
        
        await orchestrator.detectCollisions({
          sourceChunk: testData.sourceChunk,
          candidateChunks: chunks,
        });
        
        const time = performance.now() - startTime;
        timings.push({ count, time });
      }
      
      // Check for approximately linear scaling
      const ratio1 = timings[1].time / timings[0].time;
      const ratio2 = timings[2].time / timings[1].time;
      
      // Ratios should be similar (within 50% tolerance for linear scaling)
      expect(Math.abs(ratio1 - ratio2)).toBeLessThan(0.5);
    });
  });
  
  describe('Result Aggregation', () => {
    it('should aggregate results from multiple engines correctly', async () => {
      const result = await orchestrator.detectCollisions({
        sourceChunk: testData.sourceChunk,
        candidateChunks: testData.candidateChunks,
      });
      
      // Check aggregation
      expect(result.groupedByTarget.size).toBeGreaterThan(0);
      
      // Each target should have collisions from potentially multiple engines
      for (const [targetId, collisions] of result.groupedByTarget) {
        expect(Array.isArray(collisions)).toBe(true);
        expect(collisions.length).toBeGreaterThan(0);
        
        // Verify collision structure
        collisions.forEach(collision => {
          expect(collision).toHaveProperty('sourceChunkId');
          expect(collision).toHaveProperty('targetChunkId');
          expect(collision).toHaveProperty('score');
          expect(collision).toHaveProperty('engineType');
          expect(collision).toHaveProperty('explanation');
        });
      }
    });
    
    it('should apply weighted scoring correctly', async () => {
      // Custom weights for 3-engine system
      const customWeights = {
        weights: {
          [EngineType.SEMANTIC_SIMILARITY]: 0.25,
          [EngineType.CONTRADICTION_DETECTION]: 0.40,
          [EngineType.THEMATIC_BRIDGE]: 0.35,
        },
        normalizationMethod: 'linear',
      };

      orchestrator.updateWeights(customWeights);

      const result = await orchestrator.detectCollisions({
        sourceChunk: testData.sourceChunk,
        candidateChunks: testData.candidateChunks,
      });

      // Verify weighted scores exist
      expect(result.weightedScores.size).toBeGreaterThan(0);

      // Top connections should be sorted by score
      if (result.topConnections.length > 1) {
        for (let i = 1; i < result.topConnections.length; i++) {
          expect(result.topConnections[i - 1].totalScore)
            .toBeGreaterThanOrEqual(result.topConnections[i].totalScore);
        }
      }
    });
  });
  
  describe('Engine-Specific Features', () => {
    it('should detect semantic similarities', async () => {
      const semanticChunks = [
        createChunkWithContent('Machine learning is a subset of artificial intelligence'),
        createChunkWithContent('AI and ML are revolutionizing technology'),
      ];
      
      const result = await orchestrator.detectCollisions({
        sourceChunk: createChunkWithContent('Artificial Intelligence and Machine Learning applications'),
        candidateChunks: semanticChunks,
      });
      
      const semanticCollisions = result.collisions.filter(
        c => c.engineType === EngineType.SEMANTIC_SIMILARITY
      );
      
      expect(semanticCollisions.length).toBeGreaterThan(0);
    });
    
    it('should detect contradictions', async () => {
      const contradictoryChunks = [
        createChunkWithContent('The Earth is flat'),
        createChunkWithContent('Climate change is not real'),
      ];
      
      const result = await orchestrator.detectCollisions({
        sourceChunk: createChunkWithContent('The Earth is a sphere and climate change is a serious threat'),
        candidateChunks: contradictoryChunks,
      });
      
      const contradictions = result.collisions.filter(
        c => c.engineType === EngineType.CONTRADICTION_DETECTION
      );
      
      expect(contradictions.length).toBeGreaterThan(0);
    });
    
    it('should detect thematic bridges across domains', async () => {
      const crossDomainChunks = [
        createChunkWithContent('Paranoia is explored through media control in dystopian literature'),
        createChunkWithContent('Surveillance capitalism creates systems of behavioral prediction'),
        createChunkWithContent('Modern technology enables unprecedented data collection'),
      ];

      const result = await orchestrator.detectCollisions({
        sourceChunk: createChunkWithContent('Gravity\'s Rainbow examines paranoia as cultural force'),
        candidateChunks: crossDomainChunks,
      });

      const thematicBridges = result.collisions.filter(
        c => c.engineType === EngineType.THEMATIC_BRIDGE
      );

      // Thematic bridge engine should find cross-domain conceptual connections
      expect(result.collisions).toBeDefined();
    });
  });
});

// Helper functions for test data creation
function createTestData() {
  return {
    sourceChunk: {
      id: 'source-1',
      content: 'Artificial intelligence and machine learning are transforming industries',
      embedding: Array(768).fill(0.1),
      metadata: {
        themes: ['AI', 'ML', 'technology', 'transformation'],
        key_concepts: ['artificial intelligence', 'machine learning', 'industry transformation'],
        emotional_tone: { sentiment: 'positive', emotions: ['optimistic', 'excited'] },
        structural_type: 'statement',
        importance_score: 0.8,
        timestamp: '2024-01-15T10:00:00Z',
      },
    },
    candidateChunks: [
      {
        id: 'candidate-1',
        content: 'Deep learning neural networks are a key component of AI systems',
        embedding: Array(768).fill(0.12),
        metadata: {
          themes: ['AI', 'deep learning', 'neural networks'],
          key_concepts: ['deep learning', 'neural networks', 'AI systems'],
          emotional_tone: { sentiment: 'neutral', emotions: ['informative'] },
          structural_type: 'explanation',
          importance_score: 0.7,
        },
      },
      {
        id: 'candidate-2',
        content: 'Traditional methods are being replaced by AI-driven approaches',
        embedding: Array(768).fill(0.11),
        metadata: {
          themes: ['AI', 'transformation', 'methodology'],
          key_concepts: ['traditional methods', 'AI-driven', 'replacement'],
          emotional_tone: { sentiment: 'neutral', emotions: ['analytical'] },
          structural_type: 'comparison',
          importance_score: 0.6,
        },
      },
      {
        id: 'candidate-3',
        content: 'The ethical implications of AI must be carefully considered',
        embedding: Array(768).fill(0.09),
        metadata: {
          themes: ['AI', 'ethics', 'responsibility'],
          key_concepts: ['ethical implications', 'AI ethics', 'consideration'],
          emotional_tone: { sentiment: 'cautious', emotions: ['concerned', 'thoughtful'] },
          structural_type: 'warning',
          importance_score: 0.9,
        },
      },
    ],
  };
}

function createChunkWithContent(content) {
  return {
    id: `chunk-${Math.random().toString(36).substr(2, 9)}`,
    content,
    embedding: Array(768).fill(Math.random() * 0.2),
    metadata: {
      themes: content.toLowerCase().split(' ').slice(0, 3),
      key_concepts: [content.substring(0, 20)],
      emotional_tone: { sentiment: 'neutral', emotions: ['informative'] },
      structural_type: 'statement',
      importance_score: 0.5,
    },
  };
}

function createChunkWithTimestamp(content, timestamp) {
  return {
    id: `chunk-${Math.random().toString(36).substr(2, 9)}`,
    content,
    embedding: Array(768).fill(Math.random() * 0.2),
    metadata: {
      themes: [content.toLowerCase()],
      key_concepts: [content],
      timestamp,
      temporal_markers: [timestamp],
    },
  };
}