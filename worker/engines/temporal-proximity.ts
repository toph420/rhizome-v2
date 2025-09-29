/**
 * Temporal Proximity Engine
 * Detects time-related connections by analyzing timestamps and temporal patterns
 * 
 * Performance target: <200ms temporal analysis for 50 chunks
 * Precision: Support various time formats (ISO 8601, timestamps, relative dates)
 * Intelligence: Detect periodic patterns and event correlations
 */

import { BaseEngine } from './base-engine';
import {
  CollisionDetectionInput,
  CollisionResult,
  ChunkWithMetadata,
  EngineType,
} from './types';
import { 
  parseTimeReference, 
  calculateTemporalDistance, 
  detectPeriodicPattern,
  findTemporalClusters 
} from '../lib/time-analysis';

export interface TemporalProximityConfig {
  /** Maximum time window for proximity (in hours) */
  maxTimeWindow?: number;
  /** Minimum proximity score threshold (0-1) */
  threshold?: number;
  /** Enable periodic pattern detection */
  detectPatterns?: boolean;
  /** Time units for proximity calculation */
  timeUnit?: 'seconds' | 'minutes' | 'hours' | 'days' | 'weeks';
  /** Consider relative time references */
  parseRelativeTime?: boolean;
  /** Maximum results per chunk */
  maxResultsPerChunk?: number;
}

/**
 * Temporal Proximity Engine implementation
 * Analyzes temporal relationships between chunks based on timestamps and time patterns
 */
export class TemporalProximityEngine extends BaseEngine {
  readonly type: EngineType = EngineType.TEMPORAL_PROXIMITY;
  private config: TemporalProximityConfig;

  constructor(config: TemporalProximityConfig = {}) {
    super();
    this.config = {
      maxTimeWindow: 72, // 3 days default
      threshold: 0.6,
      detectPatterns: true,
      timeUnit: 'hours',
      parseRelativeTime: true,
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

    // Extract temporal reference from source chunk
    const sourceTime = this.extractTemporalReference(sourceChunk);
    if (!sourceTime) {
      console.warn(`No temporal reference found for chunk ${sourceChunk.id}`);
      return results;
    }

    // Find temporal clusters if pattern detection is enabled
    const clusters = this.config.detectPatterns 
      ? await this.findTemporalClusters(targetChunks)
      : null;

    // Process target chunks for temporal proximity
    const comparisons = await Promise.all(
      targetChunks.map(async (targetChunk) => {
        // Skip self-references
        if (targetChunk.id === sourceChunk.id) {
          return null;
        }

        const targetTime = this.extractTemporalReference(targetChunk);
        if (!targetTime) {
          return null;
        }

        // Calculate temporal distance
        const distance = this.calculateDistance(sourceTime, targetTime);
        if (distance === null || distance > this.config.maxTimeWindow!) {
          return null;
        }

        // Calculate proximity score
        const proximityScore = this.calculateProximityScore(distance, this.config.maxTimeWindow!);
        
        // Check for periodic patterns
        const patternScore = clusters 
          ? this.checkPatternAlignment(sourceTime, targetTime, clusters)
          : 0;

        // Combine scores
        const finalScore = this.config.detectPatterns
          ? (proximityScore * 0.7 + patternScore * 0.3)
          : proximityScore;

        if (finalScore < this.config.threshold!) {
          return null;
        }

        // Determine relationship type
        const relationship = this.determineTemporalRelationship(sourceTime, targetTime, distance);
        const confidence = this.getConfidenceLevel(finalScore, distance);

        return {
          sourceChunkId: sourceChunk.id,
          targetChunkId: targetChunk.id,
          engine: this.type,
          score: finalScore,
          confidence,
          metadata: {
            temporalDistance: distance,
            timeUnit: this.config.timeUnit,
            relationship,
            sourceTimestamp: sourceTime.toISOString(),
            targetTimestamp: targetTime.toISOString(),
            patternDetected: patternScore > 0,
            clusterId: clusters?.find(c => 
              c.members.includes(sourceChunk.id) && c.members.includes(targetChunk.id)
            )?.id
          }
        } as CollisionResult;
      })
    );

    // Filter out nulls and return valid results
    return comparisons.filter((r): r is CollisionResult => r !== null);
  }

  /**
   * Checks if chunk has required temporal metadata
   */
  protected hasRequiredMetadata(chunk: ChunkWithMetadata): boolean {
    const metadata = chunk.metadata;
    return !!(
      metadata?.timestamp ||
      metadata?.date ||
      metadata?.created_at ||
      metadata?.time_reference ||
      metadata?.temporal_markers ||
      (chunk.content && this.containsTemporalMarkers(chunk.content))
    );
  }

  /**
   * Extracts temporal reference from chunk
   */
  private extractTemporalReference(chunk: ChunkWithMetadata): Date | null {
    const metadata = chunk.metadata;
    
    // Try explicit timestamp fields
    const timestampFields = ['timestamp', 'date', 'created_at', 'published_at', 'updated_at'];
    for (const field of timestampFields) {
      if (metadata?.[field]) {
        try {
          const date = new Date(metadata[field]);
          if (!isNaN(date.getTime())) {
            return date;
          }
        } catch {
          // Continue to next field
        }
      }
    }

    // Try time reference field
    if (metadata?.time_reference) {
      return this.parseTimeReference(metadata.time_reference);
    }

    // Try extracting from content
    if (chunk.content && this.config.parseRelativeTime) {
      return this.extractTimeFromContent(chunk.content);
    }

    return null;
  }

  /**
   * Parses time reference string
   */
  private parseTimeReference(reference: string): Date | null {
    // Handle relative time references
    const relativePatterns = [
      { pattern: /(\d+)\s*(second|minute|hour|day|week|month|year)s?\s*ago/i, type: 'ago' },
      { pattern: /in\s*(\d+)\s*(second|minute|hour|day|week|month|year)s?/i, type: 'future' },
      { pattern: /yesterday/i, type: 'yesterday' },
      { pattern: /today/i, type: 'today' },
      { pattern: /tomorrow/i, type: 'tomorrow' },
      { pattern: /last\s*(week|month|year)/i, type: 'last' },
      { pattern: /next\s*(week|month|year)/i, type: 'next' }
    ];

    for (const { pattern, type } of relativePatterns) {
      const match = reference.match(pattern);
      if (match) {
        return this.resolveRelativeTime(match, type);
      }
    }

    // Try parsing as absolute date
    try {
      const date = new Date(reference);
      if (!isNaN(date.getTime())) {
        return date;
      }
    } catch {
      // Not a valid date
    }

    return null;
  }

  /**
   * Resolves relative time to absolute date
   */
  private resolveRelativeTime(match: RegExpMatchArray, type: string): Date {
    const now = new Date();
    
    switch (type) {
      case 'ago': {
        const amount = parseInt(match[1]);
        const unit = match[2].toLowerCase();
        return this.subtractTime(now, amount, unit);
      }
      case 'future': {
        const amount = parseInt(match[1]);
        const unit = match[2].toLowerCase();
        return this.addTime(now, amount, unit);
      }
      case 'yesterday':
        return new Date(now.getTime() - 24 * 60 * 60 * 1000);
      case 'today':
        return now;
      case 'tomorrow':
        return new Date(now.getTime() + 24 * 60 * 60 * 1000);
      case 'last': {
        const unit = match[1].toLowerCase();
        return this.subtractTime(now, 1, unit);
      }
      case 'next': {
        const unit = match[1].toLowerCase();
        return this.addTime(now, 1, unit);
      }
      default:
        return now;
    }
  }

  /**
   * Adds time to a date
   */
  private addTime(date: Date, amount: number, unit: string): Date {
    const result = new Date(date);
    switch (unit) {
      case 'second':
        result.setSeconds(result.getSeconds() + amount);
        break;
      case 'minute':
        result.setMinutes(result.getMinutes() + amount);
        break;
      case 'hour':
        result.setHours(result.getHours() + amount);
        break;
      case 'day':
        result.setDate(result.getDate() + amount);
        break;
      case 'week':
        result.setDate(result.getDate() + amount * 7);
        break;
      case 'month':
        result.setMonth(result.getMonth() + amount);
        break;
      case 'year':
        result.setFullYear(result.getFullYear() + amount);
        break;
    }
    return result;
  }

  /**
   * Subtracts time from a date
   */
  private subtractTime(date: Date, amount: number, unit: string): Date {
    return this.addTime(date, -amount, unit);
  }

  /**
   * Extracts time from content
   */
  private extractTimeFromContent(content: string): Date | null {
    // ISO 8601 date pattern
    const isoPattern = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;
    const isoMatch = content.match(isoPattern);
    if (isoMatch) {
      try {
        const date = new Date(isoMatch[0]);
        if (!isNaN(date.getTime())) {
          return date;
        }
      } catch {
        // Continue
      }
    }

    // Common date formats
    const datePatterns = [
      /\d{1,2}\/\d{1,2}\/\d{2,4}/,  // MM/DD/YYYY or M/D/YY
      /\d{4}-\d{2}-\d{2}/,           // YYYY-MM-DD
      /\d{1,2}\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{2,4}/i,
    ];

    for (const pattern of datePatterns) {
      const match = content.match(pattern);
      if (match) {
        try {
          const date = new Date(match[0]);
          if (!isNaN(date.getTime())) {
            return date;
          }
        } catch {
          // Continue
        }
      }
    }

    return null;
  }

  /**
   * Checks if content contains temporal markers
   */
  private containsTemporalMarkers(content: string): boolean {
    const temporalKeywords = [
      /\b(yesterday|today|tomorrow|now|then|before|after|during|while)\b/i,
      /\b(morning|afternoon|evening|night|midnight|noon)\b/i,
      /\b(january|february|march|april|may|june|july|august|september|october|november|december)\b/i,
      /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i,
      /\b\d{1,2}:\d{2}\b/,  // Time format
      /\b\d{4}\b/,          // Year
    ];

    return temporalKeywords.some(pattern => pattern.test(content));
  }

  /**
   * Calculates temporal distance between two dates
   */
  private calculateDistance(date1: Date, date2: Date): number | null {
    if (!date1 || !date2) return null;

    const diff = Math.abs(date1.getTime() - date2.getTime());
    
    switch (this.config.timeUnit) {
      case 'seconds':
        return diff / 1000;
      case 'minutes':
        return diff / (1000 * 60);
      case 'hours':
        return diff / (1000 * 60 * 60);
      case 'days':
        return diff / (1000 * 60 * 60 * 24);
      case 'weeks':
        return diff / (1000 * 60 * 60 * 24 * 7);
      default:
        return diff / (1000 * 60 * 60); // Default to hours
    }
  }

  /**
   * Calculates proximity score based on temporal distance
   */
  private calculateProximityScore(distance: number, maxWindow: number): number {
    if (distance <= 0) return 1.0;
    if (distance >= maxWindow) return 0;
    
    // Exponential decay function for proximity
    const decay = Math.exp(-2 * (distance / maxWindow));
    return Math.max(0, Math.min(1, decay));
  }

  /**
   * Finds temporal clusters in chunks
   */
  private async findTemporalClusters(chunks: ChunkWithMetadata[]): Promise<TemporalCluster[]> {
    const clusters: TemporalCluster[] = [];
    const timePoints: Array<{ chunkId: string; time: Date }> = [];

    // Extract time points
    for (const chunk of chunks) {
      const time = this.extractTemporalReference(chunk);
      if (time) {
        timePoints.push({ chunkId: chunk.id, time });
      }
    }

    // Sort by time
    timePoints.sort((a, b) => a.time.getTime() - b.time.getTime());

    // Find clusters using sliding window
    let clusterStart = 0;
    while (clusterStart < timePoints.length) {
      const cluster: TemporalCluster = {
        id: `cluster-${clusters.length}`,
        members: [timePoints[clusterStart].chunkId],
        startTime: timePoints[clusterStart].time,
        endTime: timePoints[clusterStart].time,
        pattern: null
      };

      let clusterEnd = clusterStart;
      
      // Extend cluster while points are within time window
      while (clusterEnd < timePoints.length - 1) {
        const distance = this.calculateDistance(
          cluster.startTime,
          timePoints[clusterEnd + 1].time
        );
        
        if (distance !== null && distance <= this.config.maxTimeWindow!) {
          cluster.members.push(timePoints[clusterEnd + 1].chunkId);
          cluster.endTime = timePoints[clusterEnd + 1].time;
          clusterEnd++;
        } else {
          break;
        }
      }

      // Only add clusters with multiple members
      if (cluster.members.length > 1) {
        // Detect pattern within cluster
        cluster.pattern = this.detectClusterPattern(
          timePoints.slice(clusterStart, clusterEnd + 1)
        );
        clusters.push(cluster);
      }

      clusterStart = clusterEnd + 1;
    }

    return clusters;
  }

  /**
   * Detects patterns within a temporal cluster
   */
  private detectClusterPattern(points: Array<{ chunkId: string; time: Date }>): string | null {
    if (points.length < 3) return null;

    const intervals: number[] = [];
    for (let i = 1; i < points.length; i++) {
      const interval = points[i].time.getTime() - points[i - 1].time.getTime();
      intervals.push(interval);
    }

    // Check for regular intervals (periodic pattern)
    const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    const variance = intervals.reduce((sum, i) => sum + Math.pow(i - avgInterval, 2), 0) / intervals.length;
    const stdDev = Math.sqrt(variance);
    
    // If standard deviation is less than 20% of average, consider it periodic
    if (stdDev / avgInterval < 0.2) {
      const periodHours = avgInterval / (1000 * 60 * 60);
      if (periodHours < 1) {
        return `periodic-${Math.round(periodHours * 60)}min`;
      } else if (periodHours < 24) {
        return `periodic-${Math.round(periodHours)}h`;
      } else {
        return `periodic-${Math.round(periodHours / 24)}d`;
      }
    }

    // Check for burst pattern (many events in short time)
    if (intervals.every(i => i < 60 * 60 * 1000)) {
      return 'burst';
    }

    return null;
  }

  /**
   * Checks if times align with detected patterns
   */
  private checkPatternAlignment(
    time1: Date,
    time2: Date,
    clusters: TemporalCluster[]
  ): number {
    for (const cluster of clusters) {
      if (cluster.pattern && cluster.pattern.startsWith('periodic-')) {
        // Extract period from pattern
        const periodMatch = cluster.pattern.match(/periodic-(\d+)(min|h|d)/);
        if (!periodMatch) continue;

        const amount = parseInt(periodMatch[1]);
        const unit = periodMatch[2];
        
        let periodMs = amount;
        switch (unit) {
          case 'min':
            periodMs *= 60 * 1000;
            break;
          case 'h':
            periodMs *= 60 * 60 * 1000;
            break;
          case 'd':
            periodMs *= 24 * 60 * 60 * 1000;
            break;
        }

        // Check if time difference is multiple of period
        const diff = Math.abs(time1.getTime() - time2.getTime());
        const periods = diff / periodMs;
        const remainder = periods % 1;
        
        // If close to a whole number of periods, high alignment
        if (remainder < 0.1 || remainder > 0.9) {
          return 0.8;
        }
      }
    }

    return 0;
  }

  /**
   * Determines the temporal relationship type
   */
  private determineTemporalRelationship(
    time1: Date,
    time2: Date,
    distance: number
  ): string {
    const diff = time1.getTime() - time2.getTime();
    
    if (Math.abs(diff) < 60 * 1000) {
      return 'simultaneous';
    } else if (diff > 0) {
      if (distance < 1) {
        return 'immediately-after';
      } else if (distance < 24) {
        return 'shortly-after';
      } else {
        return 'after';
      }
    } else {
      if (distance < 1) {
        return 'immediately-before';
      } else if (distance < 24) {
        return 'shortly-before';
      } else {
        return 'before';
      }
    }
  }

  /**
   * Gets confidence level based on proximity and distance
   */
  private getConfidenceLevel(score: number, distance: number): 'high' | 'medium' | 'low' {
    if (score >= 0.8 && distance < 1) return 'high';
    if (score >= 0.7 && distance < 24) return 'medium';
    return 'low';
  }
}

/**
 * Interface for temporal clusters
 */
interface TemporalCluster {
  id: string;
  members: string[];
  startTime: Date;
  endTime: Date;
  pattern: string | null;
}