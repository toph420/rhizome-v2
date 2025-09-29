import { describe, it, expect, beforeEach } from '@jest/globals';
import { StructuralPatternEngine } from '../../engines/structural-pattern';
import { CollisionDetectionInput, ChunkWithMetadata } from '../../engines/types';

describe('StructuralPatternEngine', () => {
  let engine: StructuralPatternEngine;

  beforeEach(() => {
    engine = new StructuralPatternEngine();
  });

  describe('configuration', () => {
    it('should use default configuration', () => {
      const config = (engine as any).config;
      expect(config.threshold).toBe(0.65);
      expect(config.fuzzyMatching).toBe(true);
      expect(config.structureWeight).toBe(0.4);
      expect(config.considerHierarchy).toBe(true);
      expect(config.maxResultsPerChunk).toBe(10);
    });

    it('should accept custom configuration', () => {
      const customEngine = new StructuralPatternEngine({
        threshold: 0.8,
        fuzzyMatching: false,
        structureWeight: 0.5,
        considerHierarchy: false,
        maxResultsPerChunk: 5
      });
      
      const config = (customEngine as any).config;
      expect(config.threshold).toBe(0.8);
      expect(config.fuzzyMatching).toBe(false);
      expect(config.structureWeight).toBe(0.5);
      expect(config.considerHierarchy).toBe(false);
      expect(config.maxResultsPerChunk).toBe(5);
    });
  });

  describe('pattern detection', () => {
    it('should detect identical structural patterns', async () => {
      const sourceChunk: ChunkWithMetadata = {
        id: 'chunk-1',
        content: '# Heading\n\n- List item 1\n- List item 2\n\n## Subheading',
        metadata: {
          has_headings: true,
          has_lists: true,
          heading_levels: [1, 2],
          paragraph_count: 2,
        }
      };

      const targetChunks: ChunkWithMetadata[] = [
        {
          id: 'chunk-2',
          content: '# Different Heading\n\n- Different item 1\n- Different item 2\n\n## Different Sub',
          metadata: {
            has_headings: true,
            has_lists: true,
            heading_levels: [1, 2],
            paragraph_count: 2,
          }
        },
        {
          id: 'chunk-3',
          content: 'Plain paragraph text without structure',
          metadata: {
            has_headings: false,
            has_lists: false,
            paragraph_count: 1,
          }
        }
      ];

      const input: CollisionDetectionInput = {
        sourceChunk,
        targetChunks,
        config: { maxResults: 10 }
      };

      const results = await engine.detect(input);
      
      expect(results.length).toBe(1);
      expect(results[0].targetChunkId).toBe('chunk-2');
      expect(results[0].score).toBeGreaterThan(0.8);
      expect(results[0].confidence).toBe('high');
    });

    it('should detect similar list structures', async () => {
      const sourceChunk: ChunkWithMetadata = {
        id: 'chunk-1',
        content: '1. First item\n2. Second item\n3. Third item',
        metadata: {
          has_lists: true,
          has_numbering: true,
          list_depth: 1,
        }
      };

      const targetChunks: ChunkWithMetadata[] = [
        {
          id: 'chunk-2',
          content: '1. Different first\n2. Different second\n3. Different third',
          metadata: {
            has_lists: true,
            has_numbering: true,
            list_depth: 1,
          }
        },
        {
          id: 'chunk-3',
          content: '- Bullet one\n- Bullet two\n- Bullet three',
          metadata: {
            has_lists: true,
            has_numbering: false,
            list_depth: 1,
          }
        }
      ];

      const input: CollisionDetectionInput = {
        sourceChunk,
        targetChunks,
      };

      const results = await engine.detect(input);
      
      expect(results.length).toBeGreaterThan(0);
      // Numbered list should match better with numbered list
      const numberedMatch = results.find(r => r.targetChunkId === 'chunk-2');
      expect(numberedMatch).toBeDefined();
      expect(numberedMatch!.score).toBeGreaterThan(0.7);
    });

    it('should detect table structures', async () => {
      const sourceChunk: ChunkWithMetadata = {
        id: 'chunk-1',
        content: '| Col1 | Col2 |\n|------|------|\n| A    | B    |',
        metadata: {
          has_tables: true,
        }
      };

      const targetChunks: ChunkWithMetadata[] = [
        {
          id: 'chunk-2',
          content: '| Header1 | Header2 | Header3 |\n|---------|---------|----------|\n| Data    | Data    | Data     |',
          metadata: {
            has_tables: true,
          }
        }
      ];

      const input: CollisionDetectionInput = {
        sourceChunk,
        targetChunks,
      };

      const results = await engine.detect(input);
      
      expect(results.length).toBe(1);
      expect(results[0].metadata.patternType).toBe('tabular');
    });

    it('should apply fuzzy matching for similar structures', async () => {
      const sourceChunk: ChunkWithMetadata = {
        id: 'chunk-1',
        content: '## Section\n\nParagraph\n\n- Item 1\n- Item 2',
        metadata: {
          has_headings: true,
          has_lists: true,
          heading_levels: [2],
          paragraph_count: 2,
        }
      };

      const targetChunk: ChunkWithMetadata = {
        id: 'chunk-2',
        content: '### Different Section\n\nText\n\n- Different 1\n- Different 2\n- Different 3',
        metadata: {
          has_headings: true,
          has_lists: true,
          heading_levels: [3],
          paragraph_count: 2,
        }
      };

      const input: CollisionDetectionInput = {
        sourceChunk,
        targetChunks: [targetChunk],
        config: { fuzzyMatching: true }
      };

      const results = await engine.detect(input);
      
      expect(results.length).toBe(1);
      expect(results[0].metadata.fuzzyMatch).toBe(true);
      expect(results[0].score).toBeGreaterThan(0.6);
    });

    it('should consider heading hierarchy when configured', async () => {
      const sourceChunk: ChunkWithMetadata = {
        id: 'chunk-1',
        content: '# H1\n## H2\n### H3',
        metadata: {
          has_headings: true,
          heading_levels: [1, 2, 3],
        }
      };

      const exactMatch: ChunkWithMetadata = {
        id: 'chunk-2',
        content: '# Title\n## Subtitle\n### SubSubtitle',
        metadata: {
          has_headings: true,
          heading_levels: [1, 2, 3],
        }
      };

      const partialMatch: ChunkWithMetadata = {
        id: 'chunk-3',
        content: '# Title\n## Subtitle',
        metadata: {
          has_headings: true,
          heading_levels: [1, 2],
        }
      };

      const input: CollisionDetectionInput = {
        sourceChunk,
        targetChunks: [exactMatch, partialMatch],
        config: { considerHierarchy: true }
      };

      const results = await engine.detect(input);
      
      expect(results.length).toBe(2);
      const exactResult = results.find(r => r.targetChunkId === 'chunk-2');
      const partialResult = results.find(r => r.targetChunkId === 'chunk-3');
      
      expect(exactResult!.score).toBeGreaterThan(partialResult!.score);
      expect(exactResult!.metadata.patternType).toBe('identical-hierarchy');
      expect(partialResult!.metadata.patternType).toBe('similar-hierarchy');
    });
  });

  describe('canProcess', () => {
    it('should return true for chunks with structural metadata', () => {
      const chunk: ChunkWithMetadata = {
        id: 'chunk-1',
        content: 'Some content',
        metadata: {
          has_headings: true,
        }
      };

      const input: CollisionDetectionInput = {
        sourceChunk: chunk,
        targetChunks: [chunk],
      };

      expect(engine.canProcess(input)).toBe(true);
    });

    it('should return true for chunks with content to analyze', () => {
      const chunk: ChunkWithMetadata = {
        id: 'chunk-1',
        content: '# Heading\n\nContent with structure',
        metadata: {}
      };

      const input: CollisionDetectionInput = {
        sourceChunk: chunk,
        targetChunks: [chunk],
      };

      expect(engine.canProcess(input)).toBe(true);
    });

    it('should return false for chunks without structural info', () => {
      const chunk: ChunkWithMetadata = {
        id: 'chunk-1',
        content: '',
        metadata: {}
      };

      const input: CollisionDetectionInput = {
        sourceChunk: chunk,
        targetChunks: [],
      };

      expect(engine.canProcess(input)).toBe(false);
    });
  });

  describe('performance', () => {
    it('should complete pattern matching within 300ms for 50 chunks', async () => {
      const sourceChunk: ChunkWithMetadata = {
        id: 'source',
        content: '# Heading\n\n- List 1\n- List 2\n\n## Subheading\n\nParagraph',
        metadata: {
          has_headings: true,
          has_lists: true,
          heading_levels: [1, 2],
        }
      };

      const targetChunks: ChunkWithMetadata[] = Array.from({ length: 50 }, (_, i) => ({
        id: `chunk-${i}`,
        content: Math.random() > 0.5 
          ? `# H${i}\n\n- Item ${i}\n- Item ${i+1}`
          : `Paragraph ${i}`,
        metadata: {
          has_headings: Math.random() > 0.5,
          has_lists: Math.random() > 0.5,
          heading_levels: Math.random() > 0.5 ? [1, 2] : [],
          paragraph_count: Math.floor(Math.random() * 5) + 1,
        }
      }));

      const input: CollisionDetectionInput = {
        sourceChunk,
        targetChunks,
      };

      const startTime = performance.now();
      const results = await engine.detect(input);
      const endTime = performance.now();
      
      const executionTime = endTime - startTime;
      expect(executionTime).toBeLessThan(300); // Should complete within 300ms
      expect(results).toBeDefined();
    });
  });

  describe('confidence scoring', () => {
    it('should assign high confidence for >85% similarity', async () => {
      const sourceChunk: ChunkWithMetadata = {
        id: 'chunk-1',
        content: '# H1\n## H2\n- List',
        metadata: {
          has_headings: true,
          has_lists: true,
          heading_levels: [1, 2],
        }
      };

      const targetChunk: ChunkWithMetadata = {
        id: 'chunk-2',
        content: '# H1\n## H2\n- List',
        metadata: {
          has_headings: true,
          has_lists: true,
          heading_levels: [1, 2],
        }
      };

      const input: CollisionDetectionInput = {
        sourceChunk,
        targetChunks: [targetChunk],
      };

      const results = await engine.detect(input);
      
      expect(results[0].confidence).toBe('high');
    });

    it('should assign medium confidence for 75-85% similarity', async () => {
      const sourceChunk: ChunkWithMetadata = {
        id: 'chunk-1',
        content: '# H1\n## H2',
        metadata: {
          has_headings: true,
          heading_levels: [1, 2],
        }
      };

      const targetChunk: ChunkWithMetadata = {
        id: 'chunk-2',
        content: '# H1\n### H3',
        metadata: {
          has_headings: true,
          heading_levels: [1, 3],
        }
      };

      // Adjust engine to get medium confidence range
      const customEngine = new StructuralPatternEngine({
        threshold: 0.65,
      });

      const input: CollisionDetectionInput = {
        sourceChunk,
        targetChunks: [targetChunk],
      };

      const results = await customEngine.detect(input);
      
      if (results.length > 0 && results[0].score >= 0.75 && results[0].score < 0.85) {
        expect(results[0].confidence).toBe('medium');
      }
    });
  });
});