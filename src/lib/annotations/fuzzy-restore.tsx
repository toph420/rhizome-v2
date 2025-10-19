/**
 * Fuzzy restore wrapper for annotation position recovery.
 * Bridges worker-side fuzzy matching algorithm with frontend annotation rendering.
 */

import type { ReactNode } from 'react'
import type { AnnotationEntity, PositionComponent } from '@/types/annotations'
import { Badge } from '@/components/ui/badge'

// Import fuzzy matching algorithm from worker
import { fuzzyMatchChunkToSource } from '../../../worker/lib/fuzzy-matching'

/**
 * Restores annotation position in re-processed document using fuzzy matching.
 * Implements 2-tier strategy:
 * 1. Exact match (O(n), <10ms) - indexOf() for unchanged text
 * 2. Fuzzy match (O(n*m), <50ms) - Trigram algorithm for shifted text.
 * @param annotation - Stored annotation with original position and text context.
 * @param sourceMarkdown - Current markdown content to restore position in.
 * @returns Position data with confidence score (0.3-1.0) and method used.
 * @example
 * const position = await restoreAnnotationPosition(annotation, markdown)
 * if (position.confidence >= 0.7) {
 *   // High confidence - safe to render
 * } else {
 *   // Show warning badge
 * }
 */
export async function restoreAnnotationPosition(
  annotation: AnnotationEntity,
  sourceMarkdown: string
): Promise<PositionComponent> {
  const positionData = annotation.components.Position
  const chunkRefData = annotation.components.ChunkRef

  if (!positionData || !chunkRefData) {
    throw new Error('Invalid annotation: missing required components')
  }

  const { originalText, textContext } = positionData

  // Tier 1: Exact match (fast path - <10ms)
  const exactIndex = sourceMarkdown.indexOf(originalText)
  if (exactIndex !== -1) {
    return {
      ...positionData,
      startOffset: exactIndex,
      endOffset: exactIndex + originalText.length,
      recoveryConfidence: 1.0,
      recoveryMethod: 'exact',
      textContext: textContext || { before: '', after: '' },
      needsReview: false,
    }
  }

  // Tier 2: Fuzzy matching (high accuracy - <50ms)
  const result = fuzzyMatchChunkToSource(
    originalText,
    sourceMarkdown,
    0, // chunkIndex not needed for single annotation
    1, // totalChunks not needed
    { trigramThreshold: 0.75 }
  )

  return {
    ...positionData,
    startOffset: result.startOffset,
    endOffset: result.endOffset,
    recoveryConfidence: result.confidence,
    recoveryMethod: result.method === 'fuzzy' || result.method === 'approximate' ? 'context' : 'exact',
    textContext: {
      before: result.contextBefore,
      after: result.contextAfter
    },
    needsReview: result.confidence >= 0.70 && result.confidence < 0.85,
  }
}

/**
 * Generates confidence badge component based on position accuracy.
 * Confidence tiers:
 * - ≥0.7: No badge (high confidence, safe to use)
 * - 0.5-0.7: Warning badge (position approximate)
 * - <0.5: Error badge (position may have shifted significantly).
 * @param confidence - Confidence score from fuzzy matching (0.3-1.0).
 * @returns React Badge component or null for high confidence.
 * @example
 * // Usage in React component:
 * // showConfidenceBadge(annotation.components.position.confidence)
 */
export function showConfidenceBadge(confidence: number): ReactNode {
  if (confidence >= 0.7) return null // High confidence - no warning needed
  
  if (confidence >= 0.5) {
    return (
      <Badge variant="outline" className="ml-2">
        Position approximate
      </Badge>
    )
  }
  
  return (
    <Badge variant="destructive" className="ml-2">
      Position may have shifted - click to verify
    </Badge>
  )
}

/**
 * Calculates confidence tier for analytics and filtering.
 * @param confidence - Confidence score (0.3-1.0).
 * @returns Tier classification: 'high' | 'medium' | 'low'.
 */
export function calculateConfidenceLevel(
  confidence: number
): 'high' | 'medium' | 'low' {
  if (confidence >= 0.7) return 'high'
  if (confidence >= 0.5) return 'medium'
  return 'low'
}