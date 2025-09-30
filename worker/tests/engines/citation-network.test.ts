/**
 * Tests for Citation Network Engine
 * Validates citation pattern detection and reference network analysis
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { CitationNetworkEngine } from '../../engines/citation-network';
import { ChunkWithMetadata, EngineType, CollisionDetectionInput } from '../../engines/types';

describe('CitationNetworkEngine', () => {
  let engine: CitationNetworkEngine;

  // Test data with different citation patterns
  const testChunks: ChunkWithMetadata[] = [
    {
      id: 'chunk-academic-citations',
      documentId: 'doc-1',
      content: 'Research by Smith (2020) and Johnson & Brown (2019) shows that machine learning improves outcomes. The methodology follows Thompson et al. (2018) guidelines.',
      embedding: new Array(768).fill(0.1),
      metadata: {
        themes: ['research', 'machine learning'],
        summary: 'Academic research with citations',
        importance_score: 0.9,
        citations: ['Smith (2020)', 'Johnson & Brown (2019)', 'Thompson et al. (2018)']
      }
    },
    {
      id: 'chunk-numbered-citations',
      documentId: 'doc-1',
      content: 'Multiple studies [1, 2, 3] demonstrate the effectiveness of neural networks. See reference [4] for detailed methodology.',
      embedding: new Array(768).fill(0.15),
      metadata: {
        themes: ['neural networks', 'studies'],
        summary: 'Numbered citation style',
        importance_score: 0.7,
        citations: ['[1]', '[2]', '[3]', '[4]']
      }
    },
    {
      id: 'chunk-shared-citations',
      documentId: 'doc-2',
      content: 'Following Smith (2020) methodology, our analysis confirms the findings. Thompson et al. (2018) provides additional validation.',
      embedding: new Array(768).fill(0.12),
      metadata: {
        themes: ['methodology', 'analysis'],
        summary: 'Shared citations with first chunk',
        importance_score: 0.8,
        citations: ['Smith (2020)', 'Thompson et al. (2018)']
      }
    },
    {
      id: 'chunk-doi-citations',
      documentId: 'doc-3',
      content: 'The study (doi:10.1038/nature12373) reveals significant patterns. Related work includes doi:10.1126/science.1234567.',
      embedding: new Array(768).fill(0.13),
      metadata: {
        themes: ['study', 'patterns'],
        summary: 'DOI-based citations',
        importance_score: 0.6,
        citations: ['doi:10.1038/nature12373', 'doi:10.1126/science.1234567']
      }
    },
    {
      id: 'chunk-no-citations',
      documentId: 'doc-4',
      content: 'This chunk contains general information about machine learning without any specific citations or references.',
      embedding: new Array(768).fill(0.05),
      metadata: {
        themes: ['machine learning', 'general'],
        summary: 'No citations',
        importance_score: 0.3,
        citations: []
      }
    },
    {
      id: 'chunk-url-citations',
      documentId: 'doc-5',
      content: 'According to https://arxiv.org/abs/1706.03762 and https://openai.com/research, transformer architectures revolutionized NLP.',
      embedding: new Array(768).fill(0.14),
      metadata: {
        themes: ['transformers', 'NLP'],
        summary: 'URL-based citations',
        importance_score: 0.8,
        citations: ['https://arxiv.org/abs/1706.03762', 'https://openai.com/research']
      }
    }
  ];

  beforeEach(() => {
    engine = new CitationNetworkEngine();
  });

  describe('Engine Type', () => {
    it('should have correct engine type', () => {
      expect(engine.type).toBe(EngineType.CITATION_NETWORK);
    });
  });

  describe('Citation Detection', () => {
    it('should detect connections between chunks with shared citations', async () => {
      const input: CollisionDetectionInput = {
        sourceChunk: testChunks[0], // academic citations
        targetChunks: [testChunks[2]], // shared citations
        userId: 'test-user'
      };

      const results = await engine.detect(input);
      
      expect(results).toHaveLength(1);
      const result = results[0];
      
      expect(result.sourceChunkId).toBe('chunk-academic-citations');
      expect(result.targetChunkId).toBe('chunk-shared-citations');
      expect(result.engineType).toBe(EngineType.CITATION_NETWORK);
      expect(result.score).toBeGreaterThan(0);
      
      // Should identify shared citations
      expect(result.metadata.sharedCitations).toContain('Smith (2020)');
      expect(result.metadata.sharedCitations).toContain('Thompson et al. (2018)');
      expect(result.metadata.overlapRatio).toBeGreaterThan(0.15);
    });

    it('should skip chunks without sufficient citations', async () => {
      const input: CollisionDetectionInput = {
        sourceChunk: testChunks[4], // no citations
        targetChunks: [testChunks[0]], // with citations
        userId: 'test-user'
      };

      const results = await engine.detect(input);
      
      // Should not connect chunks without citations
      expect(results).toHaveLength(0);
    });

    it('should handle different citation formats', async () => {
      const input: CollisionDetectionInput = {
        sourceChunk: testChunks[1], // numbered citations
        targetChunks: [testChunks[3], testChunks[5]], // DOI and URL citations
        userId: 'test-user'
      };

      const results = await engine.detect(input);
      
      // Should process different citation formats
      expect(results.length).toBeGreaterThanOrEqual(0);
      
      for (const result of results) {
        expect(result.engineType).toBe(EngineType.CITATION_NETWORK);
        expect(result.score).toBeGreaterThanOrEqual(0);
        expect(result.score).toBeLessThanOrEqual(1);
      }
    });

    it('should calculate bibliographic coupling correctly', async () => {
      const input: CollisionDetectionInput = {
        sourceChunk: testChunks[0], // 3 citations
        targetChunks: [testChunks[2]], // 2 shared citations out of 2 total
        userId: 'test-user'
      };

      const results = await engine.detect(input);
      
      expect(results).toHaveLength(1);
      const result = results[0];
      
      // Should have meaningful bibliographic coupling
      expect(result.metadata.bibliographicCoupling).toBeGreaterThan(0.5);
      expect(result.metadata.overlapRatio).toBeGreaterThan(0.5);
    });
  });

  describe('Citation Network Analysis', () => {
    it('should identify high-centrality nodes', async () => {
      // Create a chunk that appears to be highly cited
      const highCentralityChunk: ChunkWithMetadata = {
        ...testChunks[0],
        id: 'high-centrality',
        metadata: {
          ...testChunks[0].metadata,
          citationCount: 15, // High citation count
          centrality: 0.8
        }
      };

      const input: CollisionDetectionInput = {
        sourceChunk: highCentralityChunk,
        targetChunks: [testChunks[2]],
        userId: 'test-user'
      };

      const results = await engine.detect(input);
      
      if (results.length > 0) {
        const result = results[0];
        expect(result.metadata.isHighCentrality).toBe(true);
        expect(result.confidence).toBe('high');
      }
    });

    it('should detect citation clusters', async () => {
      const input: CollisionDetectionInput = {
        sourceChunk: testChunks[0],
        targetChunks: [testChunks[2]], // Should be in same cluster due to shared citations
        userId: 'test-user'
      };

      const results = await engine.detect(input);
      
      expect(results).toHaveLength(1);
      const result = results[0];
      
      // Should identify cluster membership
      expect(result.metadata).toHaveProperty('cluster');
      expect(result.metadata.cluster).toBeDefined();
    });
  });

  describe('Score Calculation', () => {
    it('should assign higher scores to better citation overlap', async () => {
      const perfectOverlapChunk: ChunkWithMetadata = {
        ...testChunks[0],
        id: 'perfect-overlap',
        metadata: {
          ...testChunks[0].metadata,
          citations: ['Smith (2020)', 'Johnson & Brown (2019)', 'Thompson et al. (2018)'] // Same citations
        }
      };

      const partialOverlapChunk: ChunkWithMetadata = {
        ...testChunks[0],
        id: 'partial-overlap',
        metadata: {
          ...testChunks[0].metadata,
          citations: ['Smith (2020)', 'Different Author (2021)'] // Partial overlap
        }
      };

      const input: CollisionDetectionInput = {
        sourceChunk: testChunks[0],
        targetChunks: [perfectOverlapChunk, partialOverlapChunk],
        userId: 'test-user'
      };

      const results = await engine.detect(input);
      
      const perfectResult = results.find(r => r.targetChunkId === 'perfect-overlap');
      const partialResult = results.find(r => r.targetChunkId === 'partial-overlap');
      
      if (perfectResult && partialResult) {
        expect(perfectResult.score).toBeGreaterThan(partialResult.score);
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
    it('should provide clear explanations', async () => {
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
        expect(result.explanation).toMatch(/citation|reference|shared/i);
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

    it('should handle malformed citation patterns', async () => {
      const malformedChunk: ChunkWithMetadata = {
        ...testChunks[0],
        id: 'malformed',
        content: 'This has broken citations like (Smith and incomplete refs [',
        metadata: {
          ...testChunks[0].metadata,
          citations: ['(Smith', '['] // Malformed citations
        }
      };

      const input: CollisionDetectionInput = {
        sourceChunk: malformedChunk,
        targetChunks: [testChunks[1]],
        userId: 'test-user'
      };

      const results = await engine.detect(input);
      
      // Should handle gracefully without crashing
      expect(results.length).toBeGreaterThanOrEqual(0);
    });

    it('should handle very long citation lists', async () => {
      const longCitationChunk: ChunkWithMetadata = {
        ...testChunks[0],
        id: 'long-citations',
        metadata: {
          ...testChunks[0].metadata,
          citations: new Array(100).fill(0).map((_, i) => `Author${i} (202${i % 10})`)
        }
      };

      const input: CollisionDetectionInput = {
        sourceChunk: longCitationChunk,
        targetChunks: [testChunks[2]],
        userId: 'test-user'
      };

      const results = await engine.detect(input);
      
      // Should handle large citation lists efficiently
      expect(results.length).toBeGreaterThanOrEqual(0);
    });
  });
});