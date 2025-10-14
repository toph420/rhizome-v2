/**
 * Conflict Resolution Helper Functions
 *
 * Provides utilities for detecting and resolving import conflicts.
 * Used by import-document handler and ConflictResolutionDialog.
 *
 * See: docs/tasks/storage-first-portability.md (T-012)
 */

import type { ConflictStrategy } from '../types/storage.js'

/**
 * Conflict detection result
 */
export interface ConflictDetectionResult {
  hasConflict: boolean
  existingChunkCount: number
  importChunkCount: number
  sampleExisting: any[]
  sampleImport: any[]
}

/**
 * Detect if import would create a conflict.
 *
 * @param supabase - Supabase client
 * @param documentId - Document ID to check
 * @param importChunks - Chunks to be imported
 * @returns Conflict detection result with sample chunks
 */
export async function detectConflict(
  supabase: any,
  documentId: string,
  importChunks: any[]
): Promise<ConflictDetectionResult> {
  // Query existing chunks in database
  const { count: existingChunkCount } = await supabase
    .from('chunks')
    .select('*', { count: 'exact', head: true })
    .eq('document_id', documentId)

  const hasConflict = (existingChunkCount || 0) > 0

  // Get sample chunks (first 3) for comparison
  let sampleExisting: any[] = []
  if (hasConflict) {
    const { data: existingChunks } = await supabase
      .from('chunks')
      .select('content, chunk_index, themes, importance_score, summary')
      .eq('document_id', documentId)
      .order('chunk_index')
      .limit(3)

    sampleExisting = existingChunks || []
  }

  const sampleImport = importChunks.slice(0, 3)

  return {
    hasConflict,
    existingChunkCount: existingChunkCount || 0,
    importChunkCount: importChunks.length,
    sampleExisting,
    sampleImport
  }
}

/**
 * Get strategy recommendation based on conflict characteristics.
 *
 * @param existingCount - Number of existing chunks
 * @param importCount - Number of chunks to import
 * @returns Recommended strategy
 */
export function getRecommendedStrategy(
  existingCount: number,
  importCount: number
): ConflictStrategy {
  // If no existing chunks, no conflict - use replace
  if (existingCount === 0) {
    return 'replace'
  }

  // If counts match, likely metadata update - recommend merge_smart
  if (existingCount === importCount) {
    return 'merge_smart'
  }

  // If counts differ significantly, recommend replace (with warning)
  return 'replace'
}

/**
 * Validate import strategy safety.
 *
 * @param strategy - Strategy to validate
 * @param hasAnnotations - Whether document has user annotations
 * @returns Validation result with warnings
 */
export function validateStrategy(
  strategy: ConflictStrategy,
  hasAnnotations: boolean
): { valid: boolean; warnings: string[] } {
  const warnings: string[] = []

  if (strategy === 'replace' && hasAnnotations) {
    warnings.push('⚠️ Replace strategy will reset all annotation positions')
    warnings.push('Annotations may need repositioning after import')
  }

  if (strategy === 'merge_smart') {
    warnings.push('ℹ️ Merge Smart preserves chunk IDs and annotations')
    warnings.push('Only metadata fields will be updated')
  }

  if (strategy === 'skip') {
    warnings.push('ℹ️ Skip will leave existing data unchanged')
    warnings.push('Import data will be ignored')
  }

  return {
    valid: true,
    warnings
  }
}

/**
 * Calculate import impact statistics.
 *
 * @param strategy - Import strategy
 * @param existingCount - Number of existing chunks
 * @param importCount - Number of chunks to import
 * @returns Impact statistics
 */
export function calculateImportImpact(
  strategy: ConflictStrategy,
  existingCount: number,
  importCount: number
): {
  chunksDeleted: number
  chunksInserted: number
  chunksUpdated: number
  netChange: number
} {
  if (strategy === 'skip') {
    return {
      chunksDeleted: 0,
      chunksInserted: 0,
      chunksUpdated: 0,
      netChange: 0
    }
  }

  if (strategy === 'replace') {
    return {
      chunksDeleted: existingCount,
      chunksInserted: importCount,
      chunksUpdated: 0,
      netChange: importCount - existingCount
    }
  }

  if (strategy === 'merge_smart') {
    return {
      chunksDeleted: 0,
      chunksInserted: 0,
      chunksUpdated: Math.min(existingCount, importCount),
      netChange: 0
    }
  }

  throw new Error(`Unknown strategy: ${strategy}`)
}
