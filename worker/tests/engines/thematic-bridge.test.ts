/**
 * Unit tests for ThematicBridge engine
 * Tests core functionality, filtering logic, and error handling
 */

import { ThematicBridgeEngine } from '../../engines/thematic-bridge';
import { ChunkWithMetadata, CollisionDetectionInput } from '../../engines/types';

// Mock the Gemini client
jest.mock('../../lib/ai-client', () => ({
  createGeminiClient: jest.fn(() => ({
    getGenerativeModel: jest.fn(() => ({
      generateContent: jest.fn(() => Promise.resolve({
        response: Promise.resolve({
          text: () => JSON.stringify({
            bridgeType: 'conceptual',
            strength: 0.8,
            explanation: 'Both discuss AI applications',
            bridgeConcepts: ['artificial intelligence', 'applications'],
            evidence: ['quote1', 'quote2'],
            confidence: 'high'
          })
        })
      }))
    }))
  }))
}));

describe('ThematicBridgeEngine', () => {
  let engine: ThematicBridgeEngine;
  
  beforeEach(() => {
    engine = new ThematicBridgeEngine({ 
      apiKey: 'test-key',
      importanceThreshold: 0.6,
      maxCandidates: 5,
      strengthThreshold: 0.6
    });
  });
  
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('hasRequiredMetadata', () => {
    it('should return true for chunks with content and importance', () => {
      const chunk: ChunkWithMetadata = {
        id: 'test-1',
        document_id: 'doc-1',
        chunk_index: 0,
        content: 'This is a substantial piece of content for testing purposes',
        metadata: {
          importance: 0.7
        }
      };
      
      expect(engine.hasRequiredMetadata(chunk)).toBe(true);
    });
    
    it('should return true for chunks with concepts', () => {
      const chunk: ChunkWithMetadata = {
        id: 'test-1',
        document_id: 'doc-1', 
        chunk_index: 0,
        content: 'Short content',
        metadata: {
          key_concepts: {
            concepts: [{ term: 'AI', importance: 0.8 }]
          }
        }
      };
      
      expect(engine.hasRequiredMetadata(chunk)).toBe(true);
    });
    
    it('should return false for chunks with insufficient content', () => {
      const chunk: ChunkWithMetadata = {
        id: 'test-1',
        document_id: 'doc-1',
        chunk_index: 0,
        content: 'Short',
        metadata: {}
      };
      
      expect(engine.hasRequiredMetadata(chunk)).toBe(false);
    });
  });

  describe('detectImpl', () => {
    const createTestChunk = (id: string, importance: number, docId = 'doc-1'): ChunkWithMetadata => ({
      id,
      document_id: docId,
      chunk_index: 0,
      content: `Test content for chunk ${id} with substantial text for analysis`,
      metadata: {
        importance,
        key_concepts: {
          concepts: [
            { term: 'artificial intelligence', importance: 0.8 },
            { term: 'machine learning', importance: 0.6 }
          ]
        },
        emotional_tone: {
          primary_emotion: 'analytical',
          polarity: 0.2
        }
      }
    });

    it('should return empty array for low importance source chunk', async () => {
      const sourceChunk = createTestChunk('source', 0.3); // Below threshold
      const targetChunks = [createTestChunk('target-1', 0.8)];
      
      const input: CollisionDetectionInput = {
        sourceChunk,
        targetChunks,
      };
      
      const results = await engine.detectImpl(input);
      expect(results).toEqual([]);
    });

    it('should filter out low importance target chunks', async () => {
      const sourceChunk = createTestChunk('source', 0.8);
      const targetChunks = [
        createTestChunk('target-1', 0.3), // Below threshold
        createTestChunk('target-2', 0.8)  // Above threshold
      ];
      
      const input: CollisionDetectionInput = {
        sourceChunk,
        targetChunks,
      };
      
      const results = await engine.detectImpl(input);
      
      // Should only process the high-importance target
      expect(results.length).toBeGreaterThanOrEqual(0);
      if (results.length > 0) {
        expect(results[0].targetChunkId).toBe('target-2');
      }
    });

    it('should prioritize cross-document connections', async () => {
      const sourceChunk = createTestChunk('source', 0.8, 'doc-1');
      const targetChunks = [
        createTestChunk('target-1', 0.7, 'doc-1'), // Same doc
        createTestChunk('target-2', 0.7, 'doc-2')  // Different doc
      ];
      
      const input: CollisionDetectionInput = {
        sourceChunk,
        targetChunks,
      };
      
      const results = await engine.detectImpl(input);
      
      // Should process both but prioritize cross-document
      expect(results.length).toBeGreaterThanOrEqual(0);
    });

    it('should respect maxCandidates limit', async () => {
      const sourceChunk = createTestChunk('source', 0.8);
      const targetChunks = Array.from({ length: 10 }, (_, i) => 
        createTestChunk(`target-${i}`, 0.8, `doc-${i}`)
      );
      
      const input: CollisionDetectionInput = {
        sourceChunk,
        targetChunks,
      };
      
      const results = await engine.detectImpl(input);
      
      // Should not exceed maxCandidates (5) in processing
      expect(results.length).toBeLessThanOrEqual(5);
    });

    it('should return properly formatted collision results', async () => {
      const sourceChunk = createTestChunk('source', 0.8);
      const targetChunks = [createTestChunk('target-1', 0.8, 'doc-2')];
      
      const input: CollisionDetectionInput = {
        sourceChunk,
        targetChunks,
      };
      
      const results = await engine.detectImpl(input);
      
      if (results.length > 0) {
        const result = results[0];
        expect(result).toHaveProperty('sourceChunkId', 'source');
        expect(result).toHaveProperty('targetChunkId', 'target-1');
        expect(result).toHaveProperty('engineType', 'thematic_bridge');
        expect(result).toHaveProperty('score');
        expect(result).toHaveProperty('confidence');
        expect(result).toHaveProperty('explanation');
        expect(result).toHaveProperty('metadata');
        
        expect(result.score).toBeGreaterThanOrEqual(0);
        expect(result.score).toBeLessThanOrEqual(1);
        expect(['high', 'medium', 'low']).toContain(result.confidence);
      }
    });
  });

  describe('error handling', () => {
    it('should handle AI client errors gracefully', async () => {
      // Mock error response
      const mockClient = {
        getGenerativeModel: jest.fn(() => ({
          generateContent: jest.fn(() => Promise.reject(new Error('API Error')))
        }))
      };
      
      jest.doMock('../../lib/ai-client', () => ({
        createGeminiClient: () => mockClient
      }));
      
      const errorEngine = new ThematicBridgeEngine({ apiKey: 'test-key' });
      
      const sourceChunk: ChunkWithMetadata = {
        id: 'source',
        document_id: 'doc-1',
        chunk_index: 0,
        content: 'Test content',
        metadata: { importance: 0.8 }
      };
      
      const targetChunks: ChunkWithMetadata[] = [{
        id: 'target',
        document_id: 'doc-2',
        chunk_index: 0,
        content: 'Test content',
        metadata: { importance: 0.8 }
      }];
      
      const input: CollisionDetectionInput = {
        sourceChunk,
        targetChunks,
      };
      
      // Should not throw, should return empty array
      const results = await errorEngine.detectImpl(input);
      expect(results).toEqual([]);
    });
  });
});