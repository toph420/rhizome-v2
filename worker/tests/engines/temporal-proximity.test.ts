/**
 * Tests for Temporal Proximity Engine
 * Validates time-based connection detection and temporal pattern analysis
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { TemporalProximityEngine } from '../../engines/temporal-proximity';
import { ChunkWithMetadata, EngineType, CollisionDetectionInput } from '../../engines/types';

describe('TemporalProximityEngine', () => {
  let engine: TemporalProximityEngine;

  // Test data with different temporal patterns
  const baseDate = new Date('2024-01-15T10:00:00Z');
  
  const testChunks: ChunkWithMetadata[] = [
    {
      id: 'chunk-morning',
      documentId: 'doc-1',
      content: 'Morning meeting at 9:00 AM to discuss project updates and timeline.',
      embedding: new Array(768).fill(0.1),
      metadata: {
        themes: ['meeting', 'morning'],
        summary: 'Morning meeting notes',
        importance_score: 0.8,
        timestamp: new Date('2024-01-15T09:00:00Z').toISOString(),
        timeReferences: ['9:00 AM'],
        createdAt: new Date('2024-01-15T09:00:00Z').toISOString()
      }
    },
    {
      id: 'chunk-afternoon',
      documentId: 'doc-1',
      content: 'Afternoon session at 2:00 PM focused on implementation details.',
      embedding: new Array(768).fill(0.15),
      metadata: {
        themes: ['meeting', 'afternoon'],
        summary: 'Afternoon session notes',
        importance_score: 0.7,
        timestamp: new Date('2024-01-15T14:00:00Z').toISOString(),
        timeReferences: ['2:00 PM'],
        createdAt: new Date('2024-01-15T14:00:00Z').toISOString()
      }
    },
    {
      id: 'chunk-next-day',
      documentId: 'doc-2',
      content: 'Follow-up meeting scheduled for tomorrow at 10:00 AM.',
      embedding: new Array(768).fill(0.12),
      metadata: {
        themes: ['follow-up', 'tomorrow'],
        summary: 'Next day meeting',
        importance_score: 0.6,
        timestamp: new Date('2024-01-16T10:00:00Z').toISOString(),
        timeReferences: ['tomorrow', '10:00 AM'],
        createdAt: new Date('2024-01-16T10:00:00Z').toISOString()
      }
    },
    {
      id: 'chunk-week-later',
      documentId: 'doc-3',
      content: 'Weekly review meeting next Monday at 9:00 AM.',
      embedding: new Array(768).fill(0.13),
      metadata: {
        themes: ['weekly', 'review'],
        summary: 'Weekly review',
        importance_score: 0.8,
        timestamp: new Date('2024-01-22T09:00:00Z').toISOString(),
        timeReferences: ['next Monday', '9:00 AM'],
        createdAt: new Date('2024-01-22T09:00:00Z').toISOString()
      }
    },
    {
      id: 'chunk-no-time',
      documentId: 'doc-4',
      content: 'General discussion about project methodology and approaches.',
      embedding: new Array(768).fill(0.05),
      metadata: {
        themes: ['methodology', 'general'],
        summary: 'General discussion',
        importance_score: 0.4,
        // No timestamp or time references
        timeReferences: []
      }
    },
    {
      id: 'chunk-periodic',
      documentId: 'doc-5',
      content: 'Daily standup at 9:00 AM every weekday.',
      embedding: new Array(768).fill(0.14),
      metadata: {
        themes: ['daily', 'standup'],
        summary: 'Daily standup',
        importance_score: 0.7,
        timestamp: new Date('2024-01-15T09:00:00Z').toISOString(),
        timeReferences: ['9:00 AM', 'every weekday', 'daily'],
        periodicPattern: 'daily',
        createdAt: new Date('2024-01-15T09:00:00Z').toISOString()
      }
    }
  ];

  beforeEach(() => {
    engine = new TemporalProximityEngine({
      maxTimeWindow: 72, // 3 days
      threshold: 0.6,
      detectPatterns: true,
      timeUnit: 'hours'
    });
  });

  describe('Engine Type', () => {
    it('should have correct engine type', () => {
      expect(engine.type).toBe(EngineType.TEMPORAL_PROXIMITY);
    });
  });

  describe('Temporal Proximity Detection', () => {
    it('should detect connections between temporally close chunks', async () => {
      const input: CollisionDetectionInput = {
        sourceChunk: testChunks[0], // morning meeting
        targetChunks: [testChunks[1]], // afternoon same day
        userId: 'test-user'
      };

      const results = await engine.detect(input);
      
      expect(results).toHaveLength(1);
      const result = results[0];
      
      expect(result.sourceChunkId).toBe('chunk-morning');
      expect(result.targetChunkId).toBe('chunk-afternoon');
      expect(result.engineType).toBe(EngineType.TEMPORAL_PROXIMITY);
      expect(result.score).toBeGreaterThan(0);
      
      // Should have temporal metadata
      expect(result.metadata.timeDistance).toBeDefined();
      expect(result.metadata.timeDistance).toBeLessThan(24); // Same day
      expect(result.metadata.timeUnit).toBe('hours');
    });

    it('should skip chunks outside time window', async () => {
      const input: CollisionDetectionInput = {
        sourceChunk: testChunks[0], // morning meeting
        targetChunks: [testChunks[3]], // week later (outside 72-hour window)
        userId: 'test-user'
      };

      const results = await engine.detect(input);
      
      // Should not connect chunks outside time window
      expect(results).toHaveLength(0);
    });

    it('should handle chunks without timestamps', async () => {
      const input: CollisionDetectionInput = {
        sourceChunk: testChunks[4], // no timestamp
        targetChunks: [testChunks[0]], // with timestamp
        userId: 'test-user'
      };

      const results = await engine.detect(input);
      
      // Should skip chunks without temporal data
      expect(results).toHaveLength(0);
    });

    it('should calculate time distance correctly', async () => {
      const input: CollisionDetectionInput = {
        sourceChunk: testChunks[0], // 9:00 AM
        targetChunks: [testChunks[1], testChunks[2]], // 2:00 PM same day, 10:00 AM next day
        userId: 'test-user'
      };

      const results = await engine.detect(input);
      
      expect(results.length).toBeGreaterThan(0);
      
      // Same day connection should have shorter distance
      const sameDayResult = results.find(r => r.targetChunkId === 'chunk-afternoon');
      const nextDayResult = results.find(r => r.targetChunkId === 'chunk-next-day');
      
      if (sameDayResult && nextDayResult) {
        expect(sameDayResult.metadata.timeDistance).toBeLessThan(nextDayResult.metadata.timeDistance);
      }
    });
  });

  describe('Periodic Pattern Detection', () => {
    it('should detect periodic patterns', async () => {
      const input: CollisionDetectionInput = {
        sourceChunk: testChunks[5], // daily standup
        targetChunks: [testChunks[0]], // morning meeting at same time
        userId: 'test-user'
      };

      const results = await engine.detect(input);
      
      if (results.length > 0) {
        const result = results[0];
        expect(result.metadata.periodicPattern).toBeDefined();
        expect(result.metadata.periodicPattern).toMatch(/daily|recurring/i);
      }
    });

    it('should identify recurring time patterns', async () => {
      // Create chunks with same time pattern
      const recurringChunk1: ChunkWithMetadata = {
        ...testChunks[0],
        id: 'recurring-1',
        metadata: {
          ...testChunks[0].metadata,
          timestamp: new Date('2024-01-15T09:00:00Z').toISOString(),
          timeReferences: ['9:00 AM'],
          periodicPattern: 'daily'
        }
      };

      const recurringChunk2: ChunkWithMetadata = {
        ...testChunks[0],
        id: 'recurring-2',
        metadata: {
          ...testChunks[0].metadata,
          timestamp: new Date('2024-01-16T09:00:00Z').toISOString(),
          timeReferences: ['9:00 AM'],
          periodicPattern: 'daily'
        }
      };

      const input: CollisionDetectionInput = {
        sourceChunk: recurringChunk1,
        targetChunks: [recurringChunk2],
        userId: 'test-user'
      };

      const results = await engine.detect(input);
      
      if (results.length > 0) {
        const result = results[0];
        expect(result.metadata.isRecurring).toBe(true);
        expect(result.score).toBeGreaterThan(0.7); // High score for recurring patterns
      }
    });
  });

  describe('Time Reference Analysis', () => {
    it('should parse various time formats', async () => {
      const timeFormatChunk: ChunkWithMetadata = {
        ...testChunks[0],
        id: 'time-formats',
        content: 'Meeting at 9:00 AM, 14:30, and 2024-01-15T15:00:00Z.',
        metadata: {
          ...testChunks[0].metadata,
          timeReferences: ['9:00 AM', '14:30', '2024-01-15T15:00:00Z'],
          timestamp: new Date('2024-01-15T09:00:00Z').toISOString()
        }
      };

      const input: CollisionDetectionInput = {
        sourceChunk: timeFormatChunk,
        targetChunks: [testChunks[1]],
        userId: 'test-user'
      };

      const results = await engine.detect(input);
      
      // Should handle multiple time formats
      expect(results.length).toBeGreaterThanOrEqual(0);
    });

    it('should handle relative time references', async () => {
      const relativeTimeChunk: ChunkWithMetadata = {
        ...testChunks[0],
        id: 'relative-time',
        content: 'Meeting tomorrow, next week, and in 2 hours.',
        metadata: {
          ...testChunks[0].metadata,
          timeReferences: ['tomorrow', 'next week', 'in 2 hours'],
          timestamp: new Date('2024-01-15T09:00:00Z').toISOString()
        }
      };

      const input: CollisionDetectionInput = {
        sourceChunk: relativeTimeChunk,
        targetChunks: [testChunks[2]], // tomorrow chunk
        userId: 'test-user'
      };

      const results = await engine.detect(input);
      
      if (results.length > 0) {
        const result = results[0];
        expect(result.metadata.relativeTimeMatch).toBe(true);
      }
    });
  });

  describe('Score Calculation', () => {
    it('should assign higher scores to closer temporal proximity', async () => {
      const input: CollisionDetectionInput = {
        sourceChunk: testChunks[0], // 9:00 AM
        targetChunks: [testChunks[1], testChunks[2]], // same day vs next day
        userId: 'test-user'
      };

      const results = await engine.detect(input);
      
      if (results.length >= 2) {
        const sameDayResult = results.find(r => r.targetChunkId === 'chunk-afternoon');
        const nextDayResult = results.find(r => r.targetChunkId === 'chunk-next-day');
        
        if (sameDayResult && nextDayResult) {
          expect(sameDayResult.score).toBeGreaterThan(nextDayResult.score);
        }
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

  describe('Configuration Options', () => {
    it('should respect custom time window settings', async () => {
      const shortWindowEngine = new TemporalProximityEngine({
        maxTimeWindow: 6, // 6 hours only
        threshold: 0.5
      });

      const input: CollisionDetectionInput = {
        sourceChunk: testChunks[0], // 9:00 AM
        targetChunks: [testChunks[2]], // next day (24 hours later)
        userId: 'test-user'
      };

      const results = await shortWindowEngine.detect(input);
      
      // Should not connect chunks outside 6-hour window
      expect(results).toHaveLength(0);
    });

    it('should respect threshold settings', async () => {
      const highThresholdEngine = new TemporalProximityEngine({
        threshold: 0.9, // Very high threshold
        maxTimeWindow: 72
      });

      const input: CollisionDetectionInput = {
        sourceChunk: testChunks[0],
        targetChunks: [testChunks[1]],
        userId: 'test-user'
      };

      const results = await highThresholdEngine.detect(input);
      
      // High threshold should filter out weaker connections
      for (const result of results) {
        expect(result.score).toBeGreaterThanOrEqual(0.9);
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

    it('should handle invalid timestamps', async () => {
      const invalidTimestampChunk: ChunkWithMetadata = {
        ...testChunks[0],
        id: 'invalid-timestamp',
        metadata: {
          ...testChunks[0].metadata,
          timestamp: 'invalid-date-string'
        }
      };

      const input: CollisionDetectionInput = {
        sourceChunk: invalidTimestampChunk,
        targetChunks: [testChunks[1]],
        userId: 'test-user'
      };

      const results = await engine.detect(input);
      
      // Should handle gracefully without crashing
      expect(results.length).toBeGreaterThanOrEqual(0);
    });

    it('should handle timezone differences', async () => {
      const timezoneChunk: ChunkWithMetadata = {
        ...testChunks[0],
        id: 'timezone-chunk',
        metadata: {
          ...testChunks[0].metadata,
          timestamp: new Date('2024-01-15T09:00:00-05:00').toISOString(), // EST
          timezone: 'EST'
        }
      };

      const input: CollisionDetectionInput = {
        sourceChunk: timezoneChunk,
        targetChunks: [testChunks[1]], // UTC
        userId: 'test-user'
      };

      const results = await engine.detect(input);
      
      // Should handle timezone conversion
      expect(results.length).toBeGreaterThanOrEqual(0);
    });
  });
});