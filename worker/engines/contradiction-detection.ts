/**
 * Contradiction Detection Engine V2
 * Finds conceptual tensions using metadata (no AI calls)
 *
 * Strategy:
 * - Same concepts (Jaccard similarity > 0.5)
 * - Opposite polarity (cross-document only)
 * - Importance-weighted scoring
 */

import { createClient } from '@supabase/supabase-js';
import { ChunkConnection } from './semantic-similarity';

export interface ContradictionDetectionConfig {
  minConceptOverlap?: number;      // Default: 0.5 (50% shared concepts)
  polarityThreshold?: number;      // Default: 0.3 (sufficient opposition)
  maxResultsPerChunk?: number;     // Default: 20
  crossDocumentOnly?: boolean;     // Default: true
  sourceChunkIds?: string[];       // NEW: Filter to specific source chunks
  targetDocumentIds?: string[];    // Filter to specific target documents (for Add New mode)
}

/**
 * Process a document for contradiction detection
 *
 * @param documentId - Document to process
 * @param config - Configuration options
 * @returns Array of chunk connections ready to save
 */
export async function runContradictionDetection(
  documentId: string,
  config: ContradictionDetectionConfig = {}
): Promise<ChunkConnection[]> {
  const {
    minConceptOverlap = 0.5,
    polarityThreshold = 0.3,
    maxResultsPerChunk = 20,
    crossDocumentOnly = true,
    sourceChunkIds,  // NEW
    targetDocumentIds
  } = config;

  console.log(`[ContradictionDetection] Processing document ${documentId}`);
  if (sourceChunkIds && sourceChunkIds.length > 0) {
    console.log(`[ContradictionDetection] Filtering to ${sourceChunkIds.length} source chunks`);
  }
  if (targetDocumentIds && targetDocumentIds.length > 0) {
    console.log(`[ContradictionDetection] Filtering to ${targetDocumentIds.length} target document(s)`);
  }

  const supabase = createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Get chunks with conceptual and emotional metadata
  // During reprocessing: query by reprocessing_batch (chunks not yet marked is_current: true)
  // During normal processing: query by is_current: true
  let sourceQuery = supabase
    .from('chunks')
    .select('id, document_id, conceptual_metadata, emotional_metadata, importance_score, content, summary')
    .eq('document_id', documentId)
    .not('conceptual_metadata', 'is', null)
    .not('emotional_metadata', 'is', null);

  // NEW: Filter to specific source chunks if provided
  if (sourceChunkIds && sourceChunkIds.length > 0) {
    sourceQuery = sourceQuery.in('id', sourceChunkIds)
  }

  if (config.reprocessingBatch) {
    sourceQuery = sourceQuery.eq('reprocessing_batch', config.reprocessingBatch);
  } else {
    sourceQuery = sourceQuery.eq('is_current', true);
  }

  const { data: sourceChunks, error } = await sourceQuery;

  if (error || !sourceChunks?.length) {
    console.log('[ContradictionDetection] No chunks with required metadata');
    return [];
  }

  const connections: ChunkConnection[] = [];

  for (const chunk of sourceChunks) {
    // Extract concepts and polarity
    const concepts = chunk.conceptual_metadata?.concepts?.map((c: any) => c.text) || [];
    const polarity = chunk.emotional_metadata?.polarity || 0;

    if (concepts.length === 0 || Math.abs(polarity) < 0.1) {
      continue; // Skip neutral or conceptless chunks
    }

    // Find contradicting chunks
    // Strategy: Get all chunks with document titles, filter in-memory for prototype
    // TODO: Optimize with custom RPC function for production
    const { data: candidates } = await supabase
      .from('chunks')
      .select(`
        id,
        document_id,
        conceptual_metadata,
        emotional_metadata,
        importance_score,
        content,
        summary,
        documents!inner(title)
      `)
      .eq('is_current', true)  // ✅ Only search current chunks from other documents
      .not('conceptual_metadata', 'is', null)
      .not('emotional_metadata', 'is', null)
      .neq('id', chunk.id);

    if (!candidates) continue;

    // Filter by targetDocumentIds if specified
    let filteredCandidates = candidates;
    if (targetDocumentIds && targetDocumentIds.length > 0) {
      const targetSet = new Set(targetDocumentIds);
      filteredCandidates = candidates.filter(c => targetSet.has(c.document_id));
    }

    for (const candidate of filteredCandidates) {
      // Filter: Cross-document only
      if (crossDocumentOnly && candidate.document_id === chunk.document_id) {
        continue;
      }

      const candidateConcepts = candidate.conceptual_metadata?.concepts?.map((c: any) => c.text) || [];
      const candidatePolarity = candidate.emotional_metadata?.polarity || 0;

      // Check 1: Concept overlap (Jaccard similarity)
      const conceptOverlap = calculateJaccardSimilarity(concepts, candidateConcepts);
      if (conceptOverlap < minConceptOverlap) continue;

      // Check 2: Opposite polarity
      const polarityProduct = polarity * candidatePolarity;
      if (polarityProduct >= 0) continue; // Same direction, not contradictory

      const polarityDistance = Math.abs(polarity - candidatePolarity);
      if (polarityDistance < polarityThreshold) continue; // Not different enough

      // Calculate strength
      const conceptWeight = conceptOverlap * 0.4;
      const polarityWeight = (polarityDistance / 2) * 0.4; // Normalize to 0-1
      const importanceWeight = ((chunk.importance_score || 0) + (candidate.importance_score || 0)) / 2 * 0.2;
      const strength = Math.min(1.0, conceptWeight + polarityWeight + importanceWeight);

      // Extract shared concepts for explanation
      const sharedConcepts = concepts.filter((c: string) => candidateConcepts.includes(c));

      connections.push({
        source_chunk_id: chunk.id,
        target_chunk_id: candidate.id,
        connection_type: 'contradiction_detection',
        strength,
        auto_detected: true,
        discovered_at: new Date().toISOString(),
        metadata: {
          concept_overlap: conceptOverlap,
          polarity_distance: polarityDistance,
          source_polarity: polarity,
          target_polarity: candidatePolarity,
          shared_concepts: sharedConcepts,
          engine_version: 'v2',
          // NEW: UI metadata
          target_document_title: (candidate.documents as any)?.title || 'Unknown Document',
          target_snippet: candidate.content?.slice(0, 200) || candidate.summary?.slice(0, 200) || 'No preview available',
          explanation: `Discussing ${sharedConcepts.slice(0, 3).join(', ')} with opposing stances (polarity difference: ${polarityDistance.toFixed(2)})`
        }
      });
    }
  }

  // Sort by strength and limit per chunk
  const connectionsBySource = new Map<string, ChunkConnection[]>();
  for (const conn of connections) {
    if (!connectionsBySource.has(conn.source_chunk_id)) {
      connectionsBySource.set(conn.source_chunk_id, []);
    }
    connectionsBySource.get(conn.source_chunk_id)!.push(conn);
  }

  const limitedConnections: ChunkConnection[] = [];
  for (const [, conns] of Array.from(connectionsBySource)) {
    conns.sort((a, b) => b.strength - a.strength);
    limitedConnections.push(...conns.slice(0, maxResultsPerChunk));
  }

  console.log(`[ContradictionDetection] Found ${limitedConnections.length} contradictions`);
  return limitedConnections;
}

// Helper: Jaccard similarity for concept overlap
function calculateJaccardSimilarity(set1: string[], set2: string[]): number {
  if (set1.length === 0 || set2.length === 0) return 0;

  const s1 = new Set(set1.map(s => s.toLowerCase()));
  const s2 = new Set(set2.map(s => s.toLowerCase()));

  const intersection = new Set(Array.from(s1).filter(x => s2.has(x)));
  const union = new Set([...Array.from(s1), ...Array.from(s2)]);

  return intersection.size / union.size;
}
