/**
 * Semantic Similarity Engine V2
 * Simple function-based approach for document-level collision detection
 *
 * Key improvements:
 * - Processes entire documents against full corpus
 * - No pre-filtering of targets (uses pgvector efficiently)
 * - Returns chunk-to-chunk connections ready to persist
 * - No unnecessary abstraction layers
 */

import { createClient } from '@supabase/supabase-js';

// Connection type for database persistence
export interface ChunkConnection {
  source_chunk_id: string;
  target_chunk_id: string;
  connection_type: 'semantic_similarity' | 'contradiction_detection' | 'thematic_bridge';
  strength: number; // 0-1
  auto_detected: boolean;
  discovered_at: string;
  metadata?: {
    raw_similarity?: number;
    importance_score?: number;
    threshold_used?: number;
    engine_version?: string;
    [key: string]: any;
  };
}

export interface SemanticSimilarityConfig {
  threshold?: number; // Minimum similarity (default: 0.7)
  maxResultsPerChunk?: number; // Max matches per chunk (default: 50)
  importanceWeight?: number; // Weight for importance boost (default: 0.3)
  crossDocumentOnly?: boolean; // Only find cross-document connections (default: true)
  targetDocumentIds?: string[]; // Filter to specific target documents (for Add New mode)
}

/**
 * Process a document for semantic similarity connections
 *
 * @param documentId - Document to process
 * @param config - Configuration options
 * @returns Array of chunk connections ready to save
 */
export async function runSemanticSimilarity(
  documentId: string,
  config: SemanticSimilarityConfig = {}
): Promise<ChunkConnection[]> {
  const {
    threshold = 0.7,
    maxResultsPerChunk = 50,
    importanceWeight = 0.3,
    crossDocumentOnly = true,
    targetDocumentIds
  } = config;

  console.log(`[SemanticSimilarity] Processing document ${documentId}`);
  console.log(`[SemanticSimilarity] Config: threshold=${threshold}, maxResults=${maxResultsPerChunk}, crossDocOnly=${crossDocumentOnly}`);
  if (targetDocumentIds && targetDocumentIds.length > 0) {
    console.log(`[SemanticSimilarity] Filtering to ${targetDocumentIds.length} target document(s)`);
  }

  // Initialize Supabase client
  const supabase = createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Get all chunks from this document with embeddings
  const { data: sourceChunks, error: fetchError } = await supabase
    .from('chunks')
    .select('id, document_id, embedding, importance_score')
    .eq('document_id', documentId)
    .not('embedding', 'is', null);

  if (fetchError) {
    console.error('[SemanticSimilarity] Failed to fetch chunks:', fetchError);
    throw fetchError;
  }

  if (!sourceChunks || sourceChunks.length === 0) {
    console.log('[SemanticSimilarity] No chunks with embeddings found');
    return [];
  }

  console.log(`[SemanticSimilarity] Processing ${sourceChunks.length} chunks`);

  const connections: ChunkConnection[] = [];
  let totalMatches = 0;

  // Process each chunk: search entire corpus via pgvector
  for (const chunk of sourceChunks) {
    // Parse embedding if it's stored as string
    const embedding = typeof chunk.embedding === 'string'
      ? JSON.parse(chunk.embedding)
      : chunk.embedding;

    if (!Array.isArray(embedding) || embedding.length !== 768) {
      console.warn(`[SemanticSimilarity] Invalid embedding for chunk ${chunk.id}`);
      continue;
    }

    // Use pgvector's match_chunks function for efficient similarity search
    // Then enrich with document titles via JOIN
    const { data: matches, error: searchError } = await supabase.rpc('match_chunks', {
      query_embedding: embedding,
      match_threshold: threshold,
      match_count: maxResultsPerChunk,
      exclude_document_id: crossDocumentOnly ? documentId : null
    });

    if (searchError) {
      console.error(`[SemanticSimilarity] Search failed for chunk ${chunk.id}:`, searchError);
      continue;
    }

    if (!matches || matches.length === 0) {
      continue;
    }

    // Filter by targetDocumentIds if specified
    let filteredMatches = matches;
    if (targetDocumentIds && targetDocumentIds.length > 0) {
      const targetSet = new Set(targetDocumentIds);
      filteredMatches = matches.filter(m => targetSet.has(m.document_id));
    }

    if (filteredMatches.length === 0) {
      continue;
    }

    totalMatches += filteredMatches.length;

    // Enrich matches with document titles (batch fetch for efficiency)
    const matchIds = filteredMatches.map(m => m.document_id);
    const { data: docTitles } = await supabase
      .from('documents')
      .select('id, title')
      .in('id', matchIds);

    const titleMap = new Map((docTitles || []).map(d => [d.id, d.title]));

    // Convert matches to connections
    for (const match of filteredMatches) {
      // Skip self-references
      if (match.id === chunk.id) {
        continue;
      }

      // Calculate final score with importance boost
      const importanceBoost = (match.importance_score || 0) * importanceWeight;
      const finalScore = Math.min(1.0, match.similarity + importanceBoost);

      connections.push({
        source_chunk_id: chunk.id,
        target_chunk_id: match.id,
        connection_type: 'semantic_similarity',
        strength: finalScore,
        auto_detected: true,
        discovered_at: new Date().toISOString(),
        metadata: {
          raw_similarity: match.similarity,
          importance_score: match.importance_score || 0,
          threshold_used: threshold,
          engine_version: 'v2',
          target_document_id: match.document_id,
          // NEW: UI metadata
          target_document_title: titleMap.get(match.document_id) || 'Unknown Document',
          target_snippet: match.content?.slice(0, 200) || match.summary?.slice(0, 200) || 'No preview available',
          explanation: `Semantic similarity: ${(match.similarity * 100).toFixed(1)}%`
        }
      });
    }
  }

  // Calculate statistics
  const avgConnectionsPerChunk = sourceChunks.length > 0
    ? (connections.length / sourceChunks.length).toFixed(1)
    : '0.0';

  console.log(`[SemanticSimilarity] Found ${connections.length} connections (${totalMatches} total matches)`);
  console.log(`[SemanticSimilarity] Average ${avgConnectionsPerChunk} connections per chunk`);

  return connections;
}

/**
 * Save chunk connections to database
 * Uses upsert to handle re-processing without duplicates
 *
 * @param connections - Connections to save
 */
export async function saveChunkConnections(connections: ChunkConnection[]): Promise<void> {
  if (connections.length === 0) {
    console.log('[SemanticSimilarity] No connections to save');
    return;
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  console.log(`[SemanticSimilarity] Saving ${connections.length} connections to database`);

  // Batch upsert with error handling
  const batchSize = 100;
  let savedCount = 0;

  for (let i = 0; i < connections.length; i += batchSize) {
    const batch = connections.slice(i, i + batchSize);

    const { error } = await supabase
      .from('connections')
      .upsert(batch, {
        onConflict: 'source_chunk_id,target_chunk_id,connection_type',
        ignoreDuplicates: false  // Update strength if connection already exists
      });

    if (error) {
      console.error(`[SemanticSimilarity] Failed to save batch ${i}-${i + batch.length}:`, error);
      // Continue with next batch rather than failing completely
    } else {
      savedCount += batch.length;
    }
  }

  console.log(`[SemanticSimilarity] Successfully saved ${savedCount}/${connections.length} connections to database`);
}

/**
 * Validate database connection and pgvector setup
 */
export async function validateSemanticSimilarityEngine(): Promise<boolean> {
  try {
    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_KEY!
    );

    // Check if we can query chunks
    const { error } = await supabase
      .from('chunks')
      .select('id')
      .limit(1);

    if (error) {
      console.error('[SemanticSimilarity] Validation failed:', error);
      return false;
    }

    console.log('[SemanticSimilarity] Validation successful');
    return true;
  } catch (error) {
    console.error('[SemanticSimilarity] Validation error:', error);
    return false;
  }
}
