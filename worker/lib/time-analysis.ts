/**
 * Time analysis utilities for temporal proximity detection
 * Provides functions for time parsing, distance calculation, and pattern detection
 */

/**
 * Parses various time reference formats into Date objects
 * Supports ISO 8601, timestamps, relative dates, and natural language
 * 
 * @param timeRef - Time reference string to parse
 * @returns Parsed Date object or null if unparseable
 */
export function parseTimeReference(timeRef: string | number | Date): Date | null {
  // Handle Date objects
  if (timeRef instanceof Date) {
    return isNaN(timeRef.getTime()) ? null : timeRef;
  }

  // Handle numeric timestamps
  if (typeof timeRef === 'number') {
    const date = new Date(timeRef);
    return isNaN(date.getTime()) ? null : date;
  }

  // Handle string references
  if (typeof timeRef === 'string') {
    // Try ISO 8601 format
    const isoDate = parseISO8601(timeRef);
    if (isoDate) return isoDate;

    // Try common date formats
    const commonDate = parseCommonFormats(timeRef);
    if (commonDate) return commonDate;

    // Try relative time
    const relativeDate = parseRelativeTime(timeRef);
    if (relativeDate) return relativeDate;

    // Try natural language
    const naturalDate = parseNaturalLanguage(timeRef);
    if (naturalDate) return naturalDate;
  }

  return null;
}

/**
 * Calculates temporal distance between two time points
 * 
 * @param time1 - First time point
 * @param time2 - Second time point
 * @param unit - Unit for distance calculation
 * @returns Distance in specified units or null if invalid
 */
export function calculateTemporalDistance(
  time1: Date | string | number,
  time2: Date | string | number,
  unit: 'seconds' | 'minutes' | 'hours' | 'days' | 'weeks' = 'hours'
): number | null {
  const date1 = parseTimeReference(time1);
  const date2 = parseTimeReference(time2);

  if (!date1 || !date2) return null;

  const diffMs = Math.abs(date1.getTime() - date2.getTime());

  switch (unit) {
    case 'seconds':
      return diffMs / 1000;
    case 'minutes':
      return diffMs / (1000 * 60);
    case 'hours':
      return diffMs / (1000 * 60 * 60);
    case 'days':
      return diffMs / (1000 * 60 * 60 * 24);
    case 'weeks':
      return diffMs / (1000 * 60 * 60 * 24 * 7);
    default:
      return diffMs / (1000 * 60 * 60);
  }
}

/**
 * Detects periodic patterns in a time series
 * 
 * @param timestamps - Array of timestamps to analyze
 * @returns Detected pattern or null
 */
export function detectPeriodicPattern(timestamps: Array<Date | string | number>): PeriodicPattern | null {
  const dates = timestamps
    .map(t => parseTimeReference(t))
    .filter((d): d is Date => d !== null)
    .sort((a, b) => a.getTime() - b.getTime());

  if (dates.length < 3) return null;

  // Calculate intervals between consecutive timestamps
  const intervals: number[] = [];
  for (let i = 1; i < dates.length; i++) {
    intervals.push(dates[i].getTime() - dates[i - 1].getTime());
  }

  // Analyze intervals for patterns
  const pattern = analyzeIntervals(intervals);
  if (!pattern) return null;

  return {
    type: pattern.type,
    period: pattern.period,
    unit: pattern.unit,
    confidence: pattern.confidence,
    startTime: dates[0],
    endTime: dates[dates.length - 1],
    occurrences: dates.length
  };
}

/**
 * Finds temporal clusters in a set of timestamps
 * Groups nearby temporal events together
 * 
 * @param timestamps - Array of timestamps to cluster
 * @param maxGap - Maximum gap between cluster members (in hours)
 * @returns Array of temporal clusters
 */
export function findTemporalClusters(
  timestamps: Array<{ id: string; time: Date | string | number }>,
  maxGap: number = 24
): TemporalCluster[] {
  const sortedPoints = timestamps
    .map(t => ({
      id: t.id,
      time: parseTimeReference(t.time)
    }))
    .filter((p): p is { id: string; time: Date } => p.time !== null)
    .sort((a, b) => a.time.getTime() - b.time.getTime());

  if (sortedPoints.length === 0) return [];

  const clusters: TemporalCluster[] = [];
  let currentCluster: TemporalCluster = {
    members: [sortedPoints[0].id],
    startTime: sortedPoints[0].time,
    endTime: sortedPoints[0].time,
    centroid: sortedPoints[0].time,
    density: 0
  };

  for (let i = 1; i < sortedPoints.length; i++) {
    const gap = calculateTemporalDistance(
      currentCluster.endTime,
      sortedPoints[i].time,
      'hours'
    );

    if (gap !== null && gap <= maxGap) {
      // Add to current cluster
      currentCluster.members.push(sortedPoints[i].id);
      currentCluster.endTime = sortedPoints[i].time;
    } else {
      // Finalize current cluster and start new one
      currentCluster.centroid = calculateCentroid(currentCluster);
      currentCluster.density = calculateDensity(currentCluster);
      clusters.push(currentCluster);

      currentCluster = {
        members: [sortedPoints[i].id],
        startTime: sortedPoints[i].time,
        endTime: sortedPoints[i].time,
        centroid: sortedPoints[i].time,
        density: 0
      };
    }
  }

  // Add final cluster
  currentCluster.centroid = calculateCentroid(currentCluster);
  currentCluster.density = calculateDensity(currentCluster);
  clusters.push(currentCluster);

  return clusters;
}

/**
 * Parses ISO 8601 date format
 */
function parseISO8601(str: string): Date | null {
  const isoRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?(Z|[+-]\d{2}:\d{2})?$/;
  if (isoRegex.test(str)) {
    const date = new Date(str);
    return isNaN(date.getTime()) ? null : date;
  }
  return null;
}

/**
 * Parses common date formats
 */
function parseCommonFormats(str: string): Date | null {
  const formats = [
    // MM/DD/YYYY or M/D/YYYY
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/,
    // YYYY-MM-DD
    /^(\d{4})-(\d{2})-(\d{2})$/,
    // DD-MMM-YYYY
    /^(\d{1,2})-(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)-(\d{4})$/i,
    // MMM DD, YYYY
    /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2}),\s+(\d{4})$/i,
  ];

  for (const format of formats) {
    const match = str.match(format);
    if (match) {
      try {
        const date = new Date(str);
        if (!isNaN(date.getTime())) {
          return date;
        }
      } catch {
        // Continue to next format
      }
    }
  }

  return null;
}

/**
 * Parses relative time expressions
 */
function parseRelativeTime(str: string): Date | null {
  const now = new Date();
  const lowered = str.toLowerCase().trim();

  // Handle "X units ago" pattern
  const agoMatch = lowered.match(/^(\d+)\s*(second|minute|hour|day|week|month|year)s?\s*ago$/);
  if (agoMatch) {
    const amount = parseInt(agoMatch[1]);
    const unit = agoMatch[2];
    return subtractTime(now, amount, unit);
  }

  // Handle "in X units" pattern
  const futureMatch = lowered.match(/^in\s*(\d+)\s*(second|minute|hour|day|week|month|year)s?$/);
  if (futureMatch) {
    const amount = parseInt(futureMatch[1]);
    const unit = futureMatch[2];
    return addTime(now, amount, unit);
  }

  // Handle special keywords
  switch (lowered) {
    case 'now':
    case 'today':
      return now;
    case 'yesterday':
      return subtractTime(now, 1, 'day');
    case 'tomorrow':
      return addTime(now, 1, 'day');
    case 'last week':
      return subtractTime(now, 1, 'week');
    case 'next week':
      return addTime(now, 1, 'week');
    case 'last month':
      return subtractTime(now, 1, 'month');
    case 'next month':
      return addTime(now, 1, 'month');
    case 'last year':
      return subtractTime(now, 1, 'year');
    case 'next year':
      return addTime(now, 1, 'year');
  }

  return null;
}

/**
 * Parses natural language time expressions
 */
function parseNaturalLanguage(str: string): Date | null {
  const lowered = str.toLowerCase().trim();
  const now = new Date();

  // Day of week
  const daysOfWeek = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const dayIndex = daysOfWeek.indexOf(lowered);
  if (dayIndex !== -1) {
    const currentDay = now.getDay();
    const daysUntil = (dayIndex - currentDay + 7) % 7 || 7;
    return addTime(now, daysUntil, 'day');
  }

  // Month names
  const months = ['january', 'february', 'march', 'april', 'may', 'june', 
                  'july', 'august', 'september', 'october', 'november', 'december'];
  const monthIndex = months.indexOf(lowered);
  if (monthIndex !== -1) {
    const result = new Date(now.getFullYear(), monthIndex, 1);
    if (result < now) {
      result.setFullYear(result.getFullYear() + 1);
    }
    return result;
  }

  // Time of day
  const timeMatch = lowered.match(/^(\d{1,2}):(\d{2})\s*(am|pm)?$/);
  if (timeMatch) {
    let hours = parseInt(timeMatch[1]);
    const minutes = parseInt(timeMatch[2]);
    const meridiem = timeMatch[3];

    if (meridiem) {
      if (meridiem === 'pm' && hours < 12) hours += 12;
      if (meridiem === 'am' && hours === 12) hours = 0;
    }

    const result = new Date(now);
    result.setHours(hours, minutes, 0, 0);
    if (result < now) {
      result.setDate(result.getDate() + 1);
    }
    return result;
  }

  return null;
}

/**
 * Adds time to a date
 */
function addTime(date: Date, amount: number, unit: string): Date {
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
function subtractTime(date: Date, amount: number, unit: string): Date {
  return addTime(date, -amount, unit);
}

/**
 * Analyzes intervals for periodic patterns
 */
function analyzeIntervals(intervals: number[]): any {
  if (intervals.length < 2) return null;

  // Calculate statistics
  const mean = intervals.reduce((a, b) => a + b, 0) / intervals.length;
  const variance = intervals.reduce((sum, i) => sum + Math.pow(i - mean, 2), 0) / intervals.length;
  const stdDev = Math.sqrt(variance);
  const cv = stdDev / mean; // Coefficient of variation

  // If CV is low, we have a periodic pattern
  if (cv < 0.3) {
    // Determine the unit
    let unit: string;
    let period: number;

    if (mean < 1000 * 60) {
      unit = 'seconds';
      period = Math.round(mean / 1000);
    } else if (mean < 1000 * 60 * 60) {
      unit = 'minutes';
      period = Math.round(mean / (1000 * 60));
    } else if (mean < 1000 * 60 * 60 * 24) {
      unit = 'hours';
      period = Math.round(mean / (1000 * 60 * 60));
    } else if (mean < 1000 * 60 * 60 * 24 * 7) {
      unit = 'days';
      period = Math.round(mean / (1000 * 60 * 60 * 24));
    } else {
      unit = 'weeks';
      period = Math.round(mean / (1000 * 60 * 60 * 24 * 7));
    }

    return {
      type: 'periodic',
      period,
      unit,
      confidence: 1 - cv
    };
  }

  // Check for burst pattern
  const maxInterval = Math.max(...intervals);
  const minInterval = Math.min(...intervals);
  
  if (maxInterval / minInterval > 10 && minInterval < 1000 * 60 * 60) {
    return {
      type: 'burst',
      period: null,
      unit: null,
      confidence: 0.7
    };
  }

  return null;
}

/**
 * Calculates the temporal centroid of a cluster
 */
function calculateCentroid(cluster: TemporalCluster): Date {
  const totalMs = (cluster.startTime.getTime() + cluster.endTime.getTime()) / 2;
  return new Date(totalMs);
}

/**
 * Calculates the temporal density of a cluster
 */
function calculateDensity(cluster: TemporalCluster): number {
  if (cluster.members.length <= 1) return 0;
  
  const duration = cluster.endTime.getTime() - cluster.startTime.getTime();
  if (duration === 0) return 1;
  
  // Events per hour
  const hoursSpan = duration / (1000 * 60 * 60);
  return cluster.members.length / Math.max(1, hoursSpan);
}

/**
 * Interface for periodic patterns
 */
export interface PeriodicPattern {
  type: 'periodic' | 'burst' | 'irregular';
  period: number | null;
  unit: string | null;
  confidence: number;
  startTime: Date;
  endTime: Date;
  occurrences: number;
}

/**
 * Interface for temporal clusters
 */
export interface TemporalCluster {
  members: string[];
  startTime: Date;
  endTime: Date;
  centroid: Date;
  density: number;
}