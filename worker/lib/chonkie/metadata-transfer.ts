/**
 * Metadata Transfer System
 *
 * Bridges Docling chunks (structural metadata) with Chonkie chunks (actual chunks)
 * via overlap detection. Reuses bulletproof matcher coordinate mapping logic.
 *
 * Architecture:
 * - Docling chunks provide metadata anchors (heading_path, pages, bboxes)
 * - Chonkie chunks are the actual chunks used for search/connections/annotations
 * - Overlap detection transfers metadata from Docling → Chonkie
 * - Multiple overlaps = EXPECTED and BENEFICIAL (aggregate metadata)
 *
 * Expected overlap rate: 70-90% of Chonkie chunks have ≥1 Docling overlap
 * Low overlap (<70%) indicates matching issues, requires investigation
 *
 * Based on: docs/prps/chonkie-integration.md (lines 606-916)
 * Pattern: worker/lib/local/bulletproof-matcher.ts (lines 862-891)
 */

import type { MatchResult } from '../local/bulletproof-matcher.js'
import type { ChonkieChunk, ProcessedChunk, ChunkerType } from './types.js'

// ============================================================================
// Overlap Detection
// ============================================================================

/**
 * Detect if two chunks overlap.
 *
 * PATTERN: Reuses logic from bulletproof-matcher.ts (lines 867)
 *
 * Two chunks overlap if:
 * docling.start_offset < chonkie.end_index AND
 * docling.end_offset > chonkie.start_index
 *
 * Why overlaps occur:
 * - Docling chunks: Structural boundaries (heading breaks, page breaks)
 * - Chonkie chunks: Semantic boundaries (topic shifts, sentence groups)
 * - Different boundaries = overlaps when both cover same content
 *
 * Overlaps are EXPECTED and BENEFICIAL (primary mechanism for metadata transfer)
 */
export function hasOverlap(
  doclingChunk: MatchResult,
  chonkieChunk: ChonkieChunk
): boolean {
  return doclingChunk.start_offset < chonkieChunk.end_index &&
         doclingChunk.end_offset > chonkieChunk.start_index
}

/**
 * Calculate overlap percentage for confidence scoring.
 *
 * Returns percentage of Chonkie chunk covered by Docling chunk (0.0-1.0).
 *
 * Used to determine metadata transfer confidence:
 * - >70% overlap = high confidence (strong metadata transfer)
 * - 30-70% overlap = medium confidence (acceptable)
 * - <30% overlap = low confidence (weak metadata)
 */
export function calculateOverlapPercentage(
  doclingChunk: MatchResult,
  chonkieChunk: ChonkieChunk
): number {
  const overlapStart = Math.max(doclingChunk.start_offset, chonkieChunk.start_index)
  const overlapEnd = Math.min(doclingChunk.end_offset, chonkieChunk.end_index)
  const overlapSize = Math.max(0, overlapEnd - overlapStart)
  const chonkieSize = chonkieChunk.end_index - chonkieChunk.start_index

  return chonkieSize > 0 ? overlapSize / chonkieSize : 0
}

// ============================================================================
// Phase 2A: Validation & Error Handling
// ============================================================================

/**
 * Validate and sanitize Phase 2A metadata fields.
 *
 * Prevents invalid data from entering the database:
 * - Charspan format validation (array, length 2, valid range)
 * - Content layer enum validation (BODY, FURNITURE, etc.)
 * - Section level range validation (1-100)
 * - NULL-safe handling for backward compatibility
 */
function validatePhase2AMetadata(meta: {
  charspan: [number, number] | null
  content_layer: string | null
  content_label: string | null
  section_level: number | null
  list_enumerated: boolean | null
  list_marker: string | null
  code_language: string | null
  hyperlink: string | null
}): void {
  // Validate charspan format
  if (meta.charspan !== null) {
    if (!Array.isArray(meta.charspan) || meta.charspan.length !== 2) {
      console.warn('[MetadataTransfer] Invalid charspan format:', meta.charspan)
      meta.charspan = null
    } else if (meta.charspan[0] < 0 || meta.charspan[0] >= meta.charspan[1]) {
      console.warn('[MetadataTransfer] Invalid charspan range:', meta.charspan)
      meta.charspan = null
    }
  }

  // Validate content_layer enum
  const validLayers = ['BODY', 'FURNITURE', 'BACKGROUND', 'INVISIBLE', 'NOTES']
  if (meta.content_layer !== null && !validLayers.includes(meta.content_layer)) {
    console.warn('[MetadataTransfer] Invalid content_layer:', meta.content_layer)
    meta.content_layer = null
  }

  // Validate section_level range (1-100)
  if (meta.section_level !== null) {
    if (meta.section_level < 1 || meta.section_level > 100) {
      console.warn('[MetadataTransfer] Invalid section_level:', meta.section_level)
      meta.section_level = null
    }
  }

  // No validation needed for other fields:
  // - content_label: Any string value is valid (Docling schema is open)
  // - list_enumerated: boolean or null
  // - list_marker, code_language, hyperlink: Any string is valid
}

// ============================================================================
// Metadata Aggregation
// ============================================================================

/**
 * Aggregate metadata from multiple overlapping Docling chunks.
 *
 * Strategy:
 * - heading_path: Union of all paths (unique headings)
 * - page_start: Earliest page number
 * - page_end: Latest page number
 * - bboxes: Concatenate all bounding boxes
 * - section_marker: First non-null (EPUBs only)
 * - Phase 2A fields: Validated and aggregated (charspan, content_layer, etc.)
 *
 * Multiple overlaps are GOOD - they provide richer metadata coverage.
 * A Chonkie chunk spanning multiple Docling chunks gets metadata from all of them.
 */
export function aggregateMetadata(
  overlappingChunks: MatchResult[]
): {
  heading_path: string[] | null
  page_start: number | null
  page_end: number | null
  section_marker: string | null
  bboxes: any[] | null
  // Phase 2A enhancements
  charspan: [number, number] | null
  content_layer: string | null
  content_label: string | null
  section_level: number | null
  list_enumerated: boolean | null
  list_marker: string | null
  code_language: string | null
  hyperlink: string | null
} {
  if (overlappingChunks.length === 0) {
    return {
      heading_path: null,
      page_start: null,
      page_end: null,
      section_marker: null,
      bboxes: null,
      charspan: null,
      content_layer: null,
      content_label: null,
      section_level: null,
      list_enumerated: null,
      list_marker: null,
      code_language: null,
      hyperlink: null,
    }
  }

  // Union of all heading paths (unique headings only)
  const allHeadings = overlappingChunks
    .map(c => c.chunk.meta.heading_path)
    .filter(h => h && h.length > 0)
    .flat()

  const uniqueHeadings = [...new Set(allHeadings)]

  // Earliest to latest page (for PDFs)
  const pages = overlappingChunks
    .map(c => ({ start: c.chunk.meta.page_start, end: c.chunk.meta.page_end }))
    .filter(p => p.start !== null && p.start !== undefined)

  // All bounding boxes (for PDF citation support)
  const allBboxes = overlappingChunks
    .map(c => c.chunk.meta.bboxes)
    .filter(b => b !== null && b !== undefined)
    .flat()

  // Section markers (EPUBs only, take first non-null)
  const sectionMarkers = overlappingChunks
    .map(c => c.chunk.meta.section_marker)
    .filter(s => s !== null && s !== undefined)

  // Phase 2A: Aggregate charspan (earliest start, latest end)
  const charspans = overlappingChunks
    .map(c => c.chunk.meta.charspan)
    .filter(cs => cs !== null && cs !== undefined) as [number, number][]

  const aggregatedCharspan = charspans.length > 0 ? [
    Math.min(...charspans.map(cs => cs[0])),
    Math.max(...charspans.map(cs => cs[1]))
  ] as [number, number] : null

  console.log(`[Phase2A Transfer] Charspans: found=${charspans.length}, result=${JSON.stringify(aggregatedCharspan)}`)

  // Phase 2A: Aggregate content_layer (prefer BODY over FURNITURE)
  const layers = overlappingChunks
    .map(c => c.chunk.meta.content_layer)
    .filter(l => l !== null && l !== undefined)
  const content_layer = layers.includes('BODY') ? 'BODY' : (layers[0] || null)

  console.log(`[Phase2A Transfer] Layers: found=${layers.length}, values=${JSON.stringify(layers)}, result=${content_layer}`)

  // Phase 2A: Aggregate content_label (prefer semantic types)
  const labels = overlappingChunks
    .map(c => c.chunk.meta.content_label)
    .filter(l => l !== null && l !== undefined)
  const labelPriority = ['PARAGRAPH', 'CODE', 'FORMULA', 'LIST_ITEM']
  const content_label = labels.find(l => labelPriority.includes(l)) || labels[0] || null

  console.log(`[Phase2A Transfer] Labels: found=${labels.length}, values=${JSON.stringify(labels)}, result=${content_label}`)

  // Phase 2A: Take first non-null for chunk-specific fields
  const section_level = overlappingChunks
    .map(c => c.chunk.meta.section_level)
    .find(sl => sl !== null && sl !== undefined) || null

  const list_enumerated = overlappingChunks
    .map(c => c.chunk.meta.list_enumerated)
    .find(le => le !== null && le !== undefined) || null

  const list_marker = overlappingChunks
    .map(c => c.chunk.meta.list_marker)
    .find(lm => lm !== null && lm !== undefined) || null

  const code_language = overlappingChunks
    .map(c => c.chunk.meta.code_language)
    .find(cl => cl !== null && cl !== undefined) || null

  const hyperlink = overlappingChunks
    .map(c => c.chunk.meta.hyperlink)
    .find(hl => hl !== null && hl !== undefined) || null

  // Phase 2A: Validate metadata before returning
  const phase2AMetadata = {
    charspan: aggregatedCharspan,
    content_layer,
    content_label,
    section_level,
    list_enumerated,
    list_marker,
    code_language,
    hyperlink,
  }

  validatePhase2AMetadata(phase2AMetadata)

  return {
    heading_path: uniqueHeadings.length > 0 ? uniqueHeadings : null,
    page_start: pages.length > 0 ? Math.min(...pages.map(p => p.start!)) : null,
    page_end: pages.length > 0 ? Math.max(...pages.map(p => p.end!)) : null,
    section_marker: sectionMarkers.length > 0 ? sectionMarkers[0] : null,
    bboxes: allBboxes.length > 0 ? allBboxes : null,
    ...phase2AMetadata, // Spread validated Phase 2A fields
  }
}

// ============================================================================
// Confidence Scoring
// ============================================================================

/**
 * Calculate confidence in metadata transfer based on overlap quality.
 *
 * Thresholds (from PRP lines 1644-1659):
 * - **High** (>0.9): 3+ overlaps OR one strong overlap (>70%)
 * - **Medium** (0.7-0.9): 1-2 overlaps with decent coverage (>30%)
 * - **Low** (<0.7): Weak overlaps or none (interpolated)
 *
 * High confidence chunks don't need user review.
 * Low confidence chunks should be surfaced in ChunkQualityPanel.
 */
export function calculateConfidence(
  overlappingChunks: MatchResult[],
  maxOverlapPercentage: number
): 'high' | 'medium' | 'low' {
  if (overlappingChunks.length === 0) {
    return 'low'  // No overlaps, will need interpolation
  }

  // High confidence: 3+ overlaps OR one very strong overlap
  if (overlappingChunks.length >= 3 || maxOverlapPercentage >= 0.7) {
    return 'high'
  }

  // Medium confidence: 1-2 overlaps with decent coverage
  if (maxOverlapPercentage >= 0.3) {
    return 'medium'
  }

  // Low confidence: weak overlaps
  return 'low'
}

// ============================================================================
// Interpolation
// ============================================================================

/**
 * Interpolate metadata from nearest neighbors when no overlaps exist.
 *
 * Rare case (usually <10% of chunks). Uses metadata from nearest Docling chunk
 * before or after the Chonkie chunk position.
 *
 * Strategy:
 * 1. Find nearest Docling chunk before Chonkie chunk (by end_offset)
 * 2. If none, find nearest after (by start_offset)
 * 3. Copy metadata from nearest neighbor
 * 4. Mark as interpolated for user validation
 */
function interpolateMetadata(
  chonkieChunk: ChonkieChunk,
  allMatches: MatchResult[]
): {
  heading_path: string[] | null
  page_start: number | null
  page_end: number | null
  section_marker: string | null
  bboxes: any[] | null
  // Phase 2A enhancements
  charspan: [number, number] | null
  content_layer: string | null
  content_label: string | null
  section_level: number | null
  list_enumerated: boolean | null
  list_marker: string | null
  code_language: string | null
  hyperlink: string | null
  interpolated: true
} {
  // Find nearest Docling chunks before and after
  const before = allMatches
    .filter(m => m.end_offset <= chonkieChunk.start_index)
    .sort((a, b) => b.end_offset - a.end_offset)[0]

  const after = allMatches
    .filter(m => m.start_offset >= chonkieChunk.end_index)
    .sort((a, b) => a.start_offset - b.start_offset)[0]

  // Use before metadata if available, else after
  const source = before || after
  if (!source) {
    return {
      heading_path: null,
      page_start: null,
      page_end: null,
      section_marker: null,
      bboxes: null,
      charspan: null,
      content_layer: null,
      content_label: null,
      section_level: null,
      list_enumerated: null,
      list_marker: null,
      code_language: null,
      hyperlink: null,
      interpolated: true
    }
  }

  return {
    heading_path: source.chunk.meta.heading_path,
    page_start: source.chunk.meta.page_start,
    page_end: source.chunk.meta.page_end,
    section_marker: source.chunk.meta.section_marker,
    bboxes: source.chunk.meta.bboxes,
    charspan: source.chunk.meta.charspan,
    content_layer: source.chunk.meta.content_layer,
    content_label: source.chunk.meta.content_label,
    section_level: source.chunk.meta.section_level,
    list_enumerated: source.chunk.meta.list_enumerated,
    list_marker: source.chunk.meta.list_marker,
    code_language: source.chunk.meta.code_language,
    hyperlink: source.chunk.meta.hyperlink,
    interpolated: true
  }
}

// ============================================================================
// Main Transfer Function
// ============================================================================

/**
 * Transfer metadata from Docling chunks to Chonkie chunks via overlap detection.
 *
 * For each Chonkie chunk:
 * 1. Find all overlapping Docling chunks (via character offsets)
 * 2. Aggregate their metadata (headings, pages, bboxes)
 * 3. Calculate confidence based on overlap count/percentage
 * 4. Interpolate from neighbors if no overlaps found (<10% expected)
 *
 * Expected: 70-90% of Chonkie chunks have at least one Docling overlap.
 *
 * VALIDATION: If overlap coverage <70%, log warning (indicates matching issues)
 *
 * @param chonkieChunks - Chunks from Chonkie (actual chunks)
 * @param bulletproofMatches - Docling chunks mapped to cleaned markdown (coordinate map)
 * @param documentId - Document ID for database insertion
 * @returns ProcessedChunk[] ready for database insertion
 */
export async function transferMetadataToChonkieChunks(
  chonkieChunks: ChonkieChunk[],
  bulletproofMatches: MatchResult[],
  documentId: string
): Promise<ProcessedChunk[]> {
  console.log(
    `[Metadata Transfer] Processing ${chonkieChunks.length} Chonkie chunks ` +
    `with ${bulletproofMatches.length} Docling anchors`
  )

  const results: ProcessedChunk[] = []
  let noOverlapCount = 0
  const overlapCounts: number[] = []

  for (let idx = 0; idx < chonkieChunks.length; idx++) {
    const chonkieChunk = chonkieChunks[idx]

    // Find overlapping Docling chunks
    const overlapping = bulletproofMatches.filter(docling =>
      hasOverlap(docling, chonkieChunk)
    )

    if (overlapping.length === 0) {
      noOverlapCount++
      console.warn(
        `[Metadata Transfer] Chonkie chunk ${idx} has no Docling overlaps, ` +
        `will interpolate metadata from neighbors`
      )
    }

    overlapCounts.push(overlapping.length)

    // Calculate max overlap percentage for confidence scoring
    const overlapPercentages = overlapping.map(docling =>
      calculateOverlapPercentage(docling, chonkieChunk)
    )
    const maxOverlapPercentage = overlapPercentages.length > 0
      ? Math.max(...overlapPercentages)
      : 0

    // Aggregate metadata from all overlapping chunks
    const metadata = overlapping.length > 0
      ? aggregateMetadata(overlapping)
      : interpolateMetadata(chonkieChunk, bulletproofMatches)

    // Calculate confidence
    const confidence = calculateConfidence(overlapping, maxOverlapPercentage)

    // Calculate word count
    const wordCount = chonkieChunk.text.split(/\s+/).filter(w => w.length > 0).length

    results.push({
      document_id: documentId,
      content: chonkieChunk.text,
      chunk_index: idx,
      start_offset: chonkieChunk.start_index,
      end_offset: chonkieChunk.end_index,
      word_count: wordCount,
      token_count: chonkieChunk.token_count,

      // Transferred Docling metadata
      heading_path: metadata.heading_path,
      page_start: metadata.page_start,
      page_end: metadata.page_end,
      section_marker: metadata.section_marker,
      bboxes: metadata.bboxes,

      // Phase 2A: Enhanced Docling metadata
      charspan: metadata.charspan,
      content_layer: metadata.content_layer,
      content_label: metadata.content_label,
      section_level: metadata.section_level,
      list_enumerated: metadata.list_enumerated,
      list_marker: metadata.list_marker,
      code_language: metadata.code_language,
      hyperlink: metadata.hyperlink,

      // Chonkie metadata
      chunker_type: chonkieChunk.chunker_type as ChunkerType,
      metadata_overlap_count: overlapping.length,
      metadata_confidence: confidence,
      metadata_interpolated: 'interpolated' in metadata ? metadata.interpolated : false,

      // Metadata enrichment (filled in Stage 8)
      themes: [],
      importance_score: 0.5,
      summary: null,
      emotional_metadata: { polarity: 0, primaryEmotion: 'neutral', intensity: 0 },
      conceptual_metadata: { concepts: [] },
      domain_metadata: null
    } as ProcessedChunk)
  }

  // Calculate and log statistics
  const overlapCoverage = ((chonkieChunks.length - noOverlapCount) / chonkieChunks.length) * 100
  const avgOverlaps = overlapCounts.reduce((a, b) => a + b, 0) / overlapCounts.length

  console.log(
    `[Metadata Transfer] Complete:\n` +
    `  Overlap coverage: ${overlapCoverage.toFixed(1)}% (${chonkieChunks.length - noOverlapCount}/${chonkieChunks.length} chunks)\n` +
    `  Average overlaps per chunk: ${avgOverlaps.toFixed(2)}\n` +
    `  Interpolated chunks: ${noOverlapCount} (${(noOverlapCount / chonkieChunks.length * 100).toFixed(1)}%)`
  )

  if (overlapCoverage < 70) {
    console.warn(
      `[Metadata Transfer] ⚠️  LOW OVERLAP COVERAGE: ${overlapCoverage.toFixed(1)}%\n` +
      `  Expected: >70% for successful metadata transfer\n` +
      `  This may indicate bulletproof matcher issues or unusual document structure.\n` +
      `  Review ChunkQualityPanel for validation warnings.`
    )
  }

  return results
}
