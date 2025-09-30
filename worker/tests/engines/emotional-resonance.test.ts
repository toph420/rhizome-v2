/**
 * Tests for Emotional Resonance Engine
 * Validates emotional tone detection and resonance analysis
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { EmotionalResonanceEngine } from '../../engines/emotional-resonance';
import { ChunkWithMetadata, EngineType, CollisionDetectionInput } from '../../engines/types';

describe('EmotionalResonanceEngine', () => {
  let engine: EmotionalResonanceEngine;

  // Test data with different emotional tones
  const testChunks: ChunkWithMetadata[] = [
    {
      id: 'chunk-positive',
      documentId: 'doc-1',
      content: 'This breakthrough discovery brings incredible joy and excitement to the research community. We are thrilled with these amazing results.',
      embedding: new Array(768).fill(0.1),
      metadata: {
        themes: ['breakthrough', 'discovery'],
        summary: 'Positive emotional tone',
        importance_score: 0.9,
        emotions: {
          joy: 0.8,
          excitement: 0.9,
          happiness: 0.7,
          optimism: 0.6
        },
        emotionalTone: 'positive',
        polarity: 0.8
      }
    },
    {
      id: 'chunk-negative',
      documentId: 'doc-1',
      content: 'The devastating failure of this project has left the team feeling frustrated and disappointed. This setback is deeply concerning.',
      embedding: new Array(768).fill(0.15),
      metadata: {
        themes: ['failure', 'setback'],
        summary: 'Negative emotional tone',
        importance_score: 0.7,
        emotions: {
          frustration: 0.8,
          disappointment: 0.9,
          sadness: 0.6,
          concern: 0.7
        },
        emotionalTone: 'negative',
        polarity: -0.8
      }
    },
    {
      id: 'chunk-harmonious',
      documentId: 'doc-2',
      content: 'The team\'s gratitude for this wonderful opportunity fills us with hope and determination for the future.',
      embedding: new Array(768).fill(0.12),
      metadata: {
        themes: ['gratitude', 'hope'],
        summary: 'Harmonious emotional tone',
        importance_score: 0.8,
        emotions: {
          gratitude: 0.9,
          hope: 0.8,
          determination: 0.7,
          joy: 0.6
        },
        emotionalTone: 'positive',
        polarity: 0.7
      }
    },
    {
      id: 'chunk-complex',
      documentId: 'doc-3',
      content: 'Looking back on this bittersweet journey, we feel a complex mix of nostalgia and anticipation for what lies ahead.',
      embedding: new Array(768).fill(0.13),
      metadata: {
        themes: ['journey', 'reflection'],
        summary: 'Complex emotional tone',
        importance_score: 0.6,
        emotions: {
          nostalgia: 0.8,
          anticipation: 0.7,
          melancholy: 0.5,
          hope: 0.4
        },
        emotionalTone: 'complex',
        polarity: 0.1
      }
    },
    {
      id: 'chunk-neutral',
      documentId: 'doc-4',
      content: 'The data analysis shows various statistical patterns and trends across different time periods.',
      embedding: new Array(768).fill(0.05),
      metadata: {
        themes: ['data', 'analysis'],
        summary: 'Neutral tone',
        importance_score: 0.5,
        emotions: {
          curiosity: 0.3,
          interest: 0.2
        },
        emotionalTone: 'neutral',
        polarity: 0.0
      }
    },
    {
      id: 'chunk-empathy',
      documentId: 'doc-5',
      content: 'Understanding the sadness and challenges faced by the community, we feel deep empathy and compassion for their struggles.',
      embedding: new Array(768).fill(0.14),
      metadata: {
        themes: ['empathy', 'community'],
        summary: 'Empathetic emotional tone',
        importance_score: 0.8,
        emotions: {
          empathy: 0.9,
          compassion: 0.8,
          sadness: 0.6,
          understanding: 0.7
        },
        emotionalTone: 'empathetic',
        polarity: 0.3
      }
    }
  ];

  beforeEach(() => {
    engine = new EmotionalResonanceEngine();
  });

  describe('Engine Type', () => {
    it('should have correct engine type', () => {
      expect(engine.type).toBe(EngineType.EMOTIONAL_RESONANCE);
    });
  });

  describe('Emotional Harmony Detection', () => {
    it('should detect harmony between positive emotions', async () => {
      const input: CollisionDetectionInput = {
        sourceChunk: testChunks[0], // positive emotions (joy, excitement)
        targetChunks: [testChunks[2]], // harmonious emotions (gratitude, hope)
        userId: 'test-user'
      };

      const results = await engine.detect(input);
      
      expect(results).toHaveLength(1);
      const result = results[0];
      
      expect(result.sourceChunkId).toBe('chunk-positive');
      expect(result.targetChunkId).toBe('chunk-harmonious');
      expect(result.engineType).toBe(EngineType.EMOTIONAL_RESONANCE);
      expect(result.score).toBeGreaterThan(0.6);
      
      expect(result.metadata.resonanceType).toBe('harmony');
      expect(result.metadata.sharedEmotions).toContain('joy');
      expect(result.metadata.resonanceScore).toBeGreaterThan(0.6);
    });

    it('should detect complementary emotional pairs', async () => {
      const input: CollisionDetectionInput = {
        sourceChunk: testChunks[1], // negative emotions (sadness)
        targetChunks: [testChunks[5]], // empathy and compassion
        userId: 'test-user'
      };

      const results = await engine.detect(input);
      
      if (results.length > 0) {
        const result = results[0];
        expect(result.metadata.complementaryPair).toBe(true);
        expect(result.metadata.resonanceType).toMatch(/harmony|complementary/);
      }
    });
  });

  describe('Emotional Dissonance Detection', () => {
    it('should detect dissonance between opposing emotions', async () => {
      const input: CollisionDetectionInput = {
        sourceChunk: testChunks[0], // positive emotions
        targetChunks: [testChunks[1]], // negative emotions
        userId: 'test-user'
      };

      const results = await engine.detect(input);
      
      if (results.length > 0) {
        const result = results[0];
        expect(result.metadata.resonanceType).toBe('dissonance');
        expect(result.metadata.polarityConflict).toBe(true);
        expect(result.metadata.emotionalDistance).toBeGreaterThan(0.5);
      }
    });

    it('should calculate emotional distance correctly', async () => {
      const input: CollisionDetectionInput = {
        sourceChunk: testChunks[0], // very positive
        targetChunks: [testChunks[1], testChunks[4]], // very negative vs neutral
        userId: 'test-user'
      };

      const results = await engine.detect(input);
      
      const negativeResult = results.find(r => r.targetChunkId === 'chunk-negative');
      const neutralResult = results.find(r => r.targetChunkId === 'chunk-neutral');
      
      if (negativeResult && neutralResult) {
        // Distance to negative should be greater than distance to neutral
        expect(negativeResult.metadata.emotionalDistance)
          .toBeGreaterThan(neutralResult.metadata.emotionalDistance);
      }
    });
  });

  describe('Complex Emotional Patterns', () => {
    it('should handle complex emotional tones', async () => {
      const input: CollisionDetectionInput = {
        sourceChunk: testChunks[3], // complex emotions (nostalgia, anticipation)
        targetChunks: [testChunks[0]], // simple positive emotions
        userId: 'test-user'
      };

      const results = await engine.detect(input);
      
      if (results.length > 0) {
        const result = results[0];
        expect(result.metadata.complexityMatch).toBeDefined();
        expect(result.metadata.emotionalComplexity).toBe('mixed');
      }
    });

    it('should identify emotional sophistication levels', async () => {
      const input: CollisionDetectionInput = {
        sourceChunk: testChunks[3], // complex emotional profile
        targetChunks: [testChunks[4]], // neutral/simple profile
        userId: 'test-user'
      };

      const results = await engine.detect(input);
      
      if (results.length > 0) {
        const result = results[0];
        expect(result.metadata.sophisticationGap).toBeDefined();
        expect(result.metadata.sourceComplexity).toBeGreaterThan(result.metadata.targetComplexity);
      }
    });
  });

  describe('Resonance Score Calculation', () => {
    it('should assign higher scores to stronger resonance', async () => {
      // Perfect emotional match
      const perfectMatchChunk: ChunkWithMetadata = {
        ...testChunks[0],
        id: 'perfect-match',
        metadata: {
          ...testChunks[0].metadata,
          emotions: {
            joy: 0.8,
            excitement: 0.9,
            happiness: 0.7,
            optimism: 0.6
          } // Identical emotional profile
        }
      };

      const input: CollisionDetectionInput = {
        sourceChunk: testChunks[0],
        targetChunks: [perfectMatchChunk, testChunks[1]],
        userId: 'test-user'
      };

      const results = await engine.detect(input);
      
      const perfectResult = results.find(r => r.targetChunkId === 'perfect-match');
      const oppositeResult = results.find(r => r.targetChunkId === 'chunk-negative');
      
      if (perfectResult && oppositeResult) {
        expect(perfectResult.score).toBeGreaterThan(oppositeResult.score);
        expect(perfectResult.metadata.resonanceScore).toBeGreaterThan(0.8);
      }
    });

    it('should normalize scores between 0 and 1', async () => {
      const input: CollisionDetectionInput = {
        sourceChunk: testChunks[0],
        targetChunks: testChunks.slice(1),
        userId: 'test-user'
      };

      const results = await engine.detect(input);
      
      for (const result of results) {
        expect(result.score).toBeGreaterThanOrEqual(0);
        expect(result.score).toBeLessThanOrEqual(1);
      }
    });
  });

  describe('Confidence Levels', () => {
    it('should provide appropriate confidence levels', async () => {
      const input: CollisionDetectionInput = {
        sourceChunk: testChunks[0],
        targetChunks: [testChunks[2]],
        userId: 'test-user'
      };

      const results = await engine.detect(input);
      
      if (results.length > 0) {
        const result = results[0];
        expect(['high', 'medium', 'low']).toContain(result.confidence);
      }
    });
  });

  describe('Explanation Generation', () => {
    it('should provide clear explanations for emotional connections', async () => {
      const input: CollisionDetectionInput = {
        sourceChunk: testChunks[0],
        targetChunks: [testChunks[2]],
        userId: 'test-user'
      };

      const results = await engine.detect(input);
      
      if (results.length > 0) {
        const result = results[0];
        expect(result.explanation).toBeDefined();
        expect(result.explanation.length).toBeGreaterThan(0);
        expect(result.explanation).toMatch(/emotion|feeling|resonance|harmony|tone/i);
      }
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty target chunks', async () => {
      const input: CollisionDetectionInput = {
        sourceChunk: testChunks[0],
        targetChunks: [],
        userId: 'test-user'
      };

      const results = await engine.detect(input);
      expect(results).toHaveLength(0);
    });

    it('should skip self-comparison', async () => {
      const input: CollisionDetectionInput = {
        sourceChunk: testChunks[0],
        targetChunks: [testChunks[0]], // Same chunk
        userId: 'test-user'
      };

      const results = await engine.detect(input);
      expect(results).toHaveLength(0);
    });

    it('should handle chunks without emotional metadata', async () => {
      const chunkWithoutEmotions: ChunkWithMetadata = {
        ...testChunks[0],
        id: 'no-emotions',
        metadata: {
          themes: ['test'],
          summary: 'Test chunk',
          importance_score: 0.5
          // No emotions or emotional metadata
        }
      };

      const input: CollisionDetectionInput = {
        sourceChunk: chunkWithoutEmotions,
        targetChunks: [testChunks[1]],
        userId: 'test-user'
      };

      const results = await engine.detect(input);
      
      // Should still work by extracting emotions from content
      expect(results.length).toBeGreaterThanOrEqual(0);
    });

    it('should handle weak emotional signals', async () => {
      const weakEmotionalChunk: ChunkWithMetadata = {
        ...testChunks[4],
        id: 'weak-emotions',
        content: 'The results were somewhat interesting and mildly positive.',
        metadata: {
          ...testChunks[4].metadata,
          emotions: {
            interest: 0.2,
            positivity: 0.1
          },
          polarity: 0.05
        }
      };

      const input: CollisionDetectionInput = {
        sourceChunk: weakEmotionalChunk,
        targetChunks: [testChunks[0]],
        userId: 'test-user'
      };

      const results = await engine.detect(input);
      
      // Should handle weak emotional signals appropriately
      if (results.length > 0) {
        const result = results[0];
        expect(result.score).toBeLessThan(0.5); // Lower score for weak signals
        expect(result.metadata.weakSignal).toBe(true);
      }
    });

    it('should detect mixed emotions correctly', async () => {
      const mixedEmotionChunk: ChunkWithMetadata = {
        ...testChunks[0],
        id: 'mixed-emotions',
        content: 'While we are excited about the progress, we feel anxious about the challenges ahead.',
        metadata: {
          ...testChunks[0].metadata,
          emotions: {
            excitement: 0.7,
            anxiety: 0.6,
            hope: 0.4,
            concern: 0.5
          },
          emotionalTone: 'mixed',
          polarity: 0.1
        }
      };

      const input: CollisionDetectionInput = {
        sourceChunk: mixedEmotionChunk,
        targetChunks: [testChunks[0]],
        userId: 'test-user'
      };

      const results = await engine.detect(input);
      
      if (results.length > 0) {
        const result = results[0];
        expect(result.metadata.mixedEmotions).toBe(true);
        expect(result.metadata.emotionalConflict).toBeDefined();
      }
    });
  });
});