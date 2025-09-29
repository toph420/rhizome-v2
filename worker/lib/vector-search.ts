/**
 * Vector search utilities for pgvector queries
 * Provides efficient similarity search using Supabase and pgvector
 */

import { createClient } from '@supabase/supabase-js';

// Types for vector search
export interface VectorSearchOptions {
  /** Minimum similarity threshold (0-1) */
  threshold?: number;
  /** Maximum number of results to return */
  limit?: number;
  /** Document ID to exclude from results */
  excludeDocumentId?: string;
  /** Filter by specific document IDs */
  documentIds?: string[];
}

export interface ChunkMatch {
  id: string;
  content: string;
  similarity: number;
  document_id: string;
  themes: any;
  summary: string;
  chunk_index?: number;
  importance_score?: number;
}

/**
 * Vector search client for pgvector operations
 */
export class VectorSearchClient {
  private supabase: ReturnType<typeof createClient>;

  constructor() {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
    
    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Supabase configuration missing');
    }

    this.supabase = createClient(supabaseUrl, supabaseKey);
  }

  /**
   * Search for similar chunks using pgvector
   * Uses the match_chunks RPC function for efficient similarity search
   */
  async searchSimilarChunks(
    embedding: number[],
    options: VectorSearchOptions = {}
  ): Promise<ChunkMatch[]> {
    const {
      threshold = 0.7,
      limit = 10,
      excludeDocumentId = null,
      documentIds = []
    } = options;

    try {
      // Use the match_chunks RPC function
      const { data, error } = await this.supabase
        .rpc('match_chunks', {
          query_embedding: embedding,
          match_threshold: threshold,
          match_count: limit,
          exclude_document_id: excludeDocumentId
        });

      if (error) {
        console.error('Vector search error:', error);
        throw error;
      }

      let results = (data || []) as ChunkMatch[];

      // Apply additional document ID filtering if needed
      if (documentIds.length > 0) {
        results = results.filter(chunk => 
          documentIds.includes(chunk.document_id)
        );
      }

      return results;
    } catch (error) {
      console.error('Failed to perform vector search:', error);
      throw error;
    }
  }

  /**
   * Get chunks by IDs for batch operations
   */
  async getChunksByIds(chunkIds: string[]): Promise<ChunkMatch[]> {
    if (chunkIds.length === 0) return [];

    try {
      const { data, error } = await this.supabase
        .from('chunks')
        .select('*')
        .in('id', chunkIds);

      if (error) {
        console.error('Failed to fetch chunks:', error);
        throw error;
      }

      return (data || []).map(chunk => ({
        id: chunk.id,
        content: chunk.content,
        similarity: 1.0, // Direct fetch, not similarity search
        document_id: chunk.document_id,
        themes: chunk.themes,
        summary: chunk.summary,
        chunk_index: chunk.chunk_index,
        importance_score: chunk.importance_score
      }));
    } catch (error) {
      console.error('Failed to get chunks by IDs:', error);
      throw error;
    }
  }

  /**
   * Get embedding for a specific chunk
   */
  async getChunkEmbedding(chunkId: string): Promise<number[] | null> {
    try {
      const { data, error } = await this.supabase
        .from('chunks')
        .select('embedding')
        .eq('id', chunkId)
        .single();

      if (error) {
        console.error('Failed to get chunk embedding:', error);
        return null;
      }

      // Parse the embedding from pgvector format
      if (data?.embedding) {
        // pgvector returns embeddings as a string like "[0.1,0.2,...]"
        if (typeof data.embedding === 'string') {
          return JSON.parse(data.embedding);
        }
        return data.embedding;
      }

      return null;
    } catch (error) {
      console.error('Failed to get chunk embedding:', error);
      return null;
    }
  }

  /**
   * Calculate cosine similarity between two vectors
   * Used for client-side similarity calculations
   */
  calculateCosineSimilarity(vec1: number[], vec2: number[]): number {
    if (vec1.length !== vec2.length) {
      throw new Error('Vectors must have the same length');
    }

    let dotProduct = 0;
    let norm1 = 0;
    let norm2 = 0;

    for (let i = 0; i < vec1.length; i++) {
      dotProduct += vec1[i] * vec2[i];
      norm1 += vec1[i] * vec1[i];
      norm2 += vec2[i] * vec2[i];
    }

    norm1 = Math.sqrt(norm1);
    norm2 = Math.sqrt(norm2);

    if (norm1 === 0 || norm2 === 0) {
      return 0;
    }

    return dotProduct / (norm1 * norm2);
  }

  /**
   * Batch similarity search for multiple embeddings
   * Useful for finding connections between multiple chunks
   */
  async batchSimilaritySearch(
    embeddings: number[][],
    options: VectorSearchOptions = {}
  ): Promise<Map<number, ChunkMatch[]>> {
    const results = new Map<number, ChunkMatch[]>();
    
    // Process in parallel with concurrency limit
    const concurrencyLimit = 5;
    const batches = [];
    
    for (let i = 0; i < embeddings.length; i += concurrencyLimit) {
      const batch = embeddings.slice(i, i + concurrencyLimit);
      const batchPromises = batch.map((embedding, index) => 
        this.searchSimilarChunks(embedding, options)
          .then(matches => ({ index: i + index, matches }))
      );
      batches.push(...await Promise.all(batchPromises));
    }
    
    for (const { index, matches } of batches) {
      results.set(index, matches);
    }
    
    return results;
  }
}

// Export a singleton instance for convenience
export const vectorSearch = new VectorSearchClient();