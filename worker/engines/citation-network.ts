/**
 * Citation Network Engine
 * 
 * Analyzes citation patterns and reference networks to find scholarly connections.
 * Builds citation graphs, detects clusters, and identifies influential nodes.
 */

import { BaseEngine } from './base-engine';
import {
  CollisionDetectionInput,
  CollisionResult,
  EngineType,
  ChunkWithMetadata,
} from './types';

interface Citation {
  text: string;           // Full citation text
  authors?: string[];     // Extracted author names
  year?: number;          // Publication year
  title?: string;         // Work title
  type?: 'article' | 'book' | 'web' | 'other';
}

interface CitationNode {
  id: string;             // Chunk ID
  citations: Citation[];  // Outgoing citations
  citedBy: string[];     // Incoming citations (chunk IDs)
  centrality: number;    // PageRank-like score
  cluster?: number;      // Community/cluster ID
}

interface CitationOverlap {
  sharedCitations: Citation[];
  coCitations: string[];  // Works cited by both
  bibliographicCoupling: number; // Similarity based on references
}

// Common citation patterns
const CITATION_PATTERNS = [
  // Academic style: Author (Year)
  /([A-Z][a-z]+(?:\s+(?:and|&)\s+[A-Z][a-z]+)*)\s*\((\d{4})\)/g,
  // Academic style: (Author, Year)
  /\(([A-Z][a-z]+(?:,?\s+(?:and|&)\s+[A-Z][a-z]+)*),?\s+(\d{4})\)/g,
  // Numbered references: [1], [2,3], etc.
  /\[(\d+(?:,\s*\d+)*)\]/g,
  // Footnote style: ¹, ², ³
  /[¹²³⁴⁵⁶⁷⁸⁹⁰]+/g,
  // DOI patterns
  /doi:\s*(10\.\d{4,}\/[-._;()\/:A-Za-z0-9]+)/gi,
  // URL citations
  /https?:\/\/(?:www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b(?:[-a-zA-Z0-9()@:%_\+.~#?&\/=]*)/g,
];

export class CitationNetworkEngine extends BaseEngine {
  readonly type: EngineType = EngineType.CITATION_NETWORK;
  
  // Configuration thresholds
  private readonly MIN_CITATIONS = 1;          // Minimum citations to consider
  private readonly MIN_OVERLAP = 0.15;         // Minimum overlap ratio
  private readonly CENTRALITY_THRESHOLD = 0.3; // High centrality threshold
  
  // Cache for citation network
  private networkCache: Map<string, CitationNode> = new Map();
  
  /**
   * Detects citation-based connections between chunks.
   */
  protected async detectImpl(
    input: CollisionDetectionInput
  ): Promise<CollisionResult[]> {
    const results: CollisionResult[] = [];
    
    // Build citation network for all chunks
    this.buildCitationNetwork(
      [input.sourceChunk, ...input.targetChunks]
    );
    
    const sourceNode = this.networkCache.get(input.sourceChunk.id);
    if (!sourceNode || sourceNode.citations.length < this.MIN_CITATIONS) {
      return results;
    }
    
    // Process each target chunk
    for (const targetChunk of input.targetChunks) {
      // Skip self-comparison
      if (targetChunk.id === input.sourceChunk.id) continue;
      
      const targetNode = this.networkCache.get(targetChunk.id);
      if (!targetNode || targetNode.citations.length === 0) continue;
      
      // Calculate citation overlap and relationships
      const overlap = this.calculateCitationOverlap(sourceNode, targetNode);
      
      // Check for meaningful citation relationships
      if (this.hasSignificantRelationship(sourceNode, targetNode, overlap)) {
        const score = this.calculateConnectionScore(
          sourceNode,
          targetNode,
          overlap
        );
        
        if (score > 0) {
          results.push({
            sourceChunkId: input.sourceChunk.id,
            targetChunkId: targetChunk.id,
            engineType: this.type,
            score,
            confidence: this.getConfidenceLevel(score, overlap),
            explanation: this.generateExplanation(
              sourceNode,
              targetNode,
              overlap
            ),
            metadata: {
              sharedCitations: overlap.sharedCitations.length,
              coCitations: overlap.coCitations.length,
              bibliographicCoupling: overlap.bibliographicCoupling,
              sourceCentrality: sourceNode.centrality,
              targetCentrality: targetNode.centrality,
              sameCluster: sourceNode.cluster === targetNode.cluster,
            },
          });
        }
      }
    }
    
    return results;
  }
  
  /**
   * Builds citation network from chunks.
   */
  private buildCitationNetwork(chunks: ChunkWithMetadata[]): void {
    // Clear and rebuild network cache
    this.networkCache.clear();
    
    // First pass: extract citations from each chunk
    for (const chunk of chunks) {
      const citations = this.extractCitations(chunk);
      this.networkCache.set(chunk.id, {
        id: chunk.id,
        citations,
        citedBy: [],
        centrality: 0,
      });
    }
    
    // Second pass: build citation relationships
    this.buildCitationRelationships();
    
    // Third pass: calculate centrality scores
    this.calculateCentralityScores();
    
    // Fourth pass: detect clusters (simplified community detection)
    this.detectCitationClusters();
  }
  
  /**
   * Extracts citations from chunk content and metadata.
   */
  private extractCitations(chunk: ChunkWithMetadata): Citation[] {
    const citations: Citation[] = [];
    const content = chunk.content;
    
    // Check metadata first for pre-extracted citations
    if (chunk.metadata?.citations) {
      return chunk.metadata.citations as Citation[];
    }
    
    // Extract using patterns
    for (const pattern of CITATION_PATTERNS) {
      const matches = content.matchAll(pattern);
      for (const match of matches) {
        const citation = this.parseCitation(match[0]);
        if (citation) {
          citations.push(citation);
        }
      }
    }
    
    // Deduplicate citations
    return this.deduplicateCitations(citations);
  }
  
  /**
   * Parses a citation match into structured format.
   */
  private parseCitation(text: string): Citation | null {
    // Clean up the citation text
    text = text.trim();
    if (!text) return null;
    
    const citation: Citation = { text };
    
    // Try to extract year
    const yearMatch = text.match(/\b(19|20)\d{2}\b/);
    if (yearMatch) {
      citation.year = parseInt(yearMatch[0]);
    }
    
    // Try to extract authors (simplified)
    const authorMatch = text.match(/([A-Z][a-z]+(?:\s+(?:and|&)\s+[A-Z][a-z]+)*)/);
    if (authorMatch) {
      citation.authors = authorMatch[0].split(/\s+(?:and|&)\s+/);
    }
    
    // Determine type
    if (text.includes('doi:') || text.includes('10.')) {
      citation.type = 'article';
    } else if (text.includes('http')) {
      citation.type = 'web';
    } else {
      citation.type = 'other';
    }
    
    return citation;
  }
  
  /**
   * Deduplicates citations based on similarity.
   */
  private deduplicateCitations(citations: Citation[]): Citation[] {
    const unique: Citation[] = [];
    const seen = new Set<string>();
    
    for (const citation of citations) {
      // Create a simple key for deduplication
      const key = `${citation.authors?.join('|')}|${citation.year}|${citation.text.substring(0, 20)}`;
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(citation);
      }
    }
    
    return unique;
  }
  
  /**
   * Builds citation relationships between nodes.
   */
  private buildCitationRelationships(): void {
    const nodes = Array.from(this.networkCache.values());
    
    // For each pair of nodes, check if they cite each other
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const node1 = nodes[i];
        const node2 = nodes[j];
        
        // Check if node1 cites work that appears in node2
        // (Simplified: check for text similarity)
        for (const citation of node1.citations) {
          if (this.citationAppearsInNode(citation, node2)) {
            node2.citedBy.push(node1.id);
            break;
          }
        }
        
        // Check reverse relationship
        for (const citation of node2.citations) {
          if (this.citationAppearsInNode(citation, node1)) {
            node1.citedBy.push(node2.id);
            break;
          }
        }
      }
    }
  }
  
  /**
   * Checks if a citation appears in a node's content.
   */
  private citationAppearsInNode(citation: Citation, node: CitationNode): boolean {
    // Simplified check: look for author names and year
    if (citation.authors && citation.year) {
      for (const author of citation.authors) {
        for (const nodeCitation of node.citations) {
          if (nodeCitation.authors?.includes(author) && 
              nodeCitation.year === citation.year) {
            return true;
          }
        }
      }
    }
    return false;
  }
  
  /**
   * Calculates centrality scores using simplified PageRank.
   */
  private calculateCentralityScores(): void {
    const nodes = Array.from(this.networkCache.values());
    const damping = 0.85;
    const iterations = 10;
    
    // Initialize scores
    for (const node of nodes) {
      node.centrality = 1 / nodes.length;
    }
    
    // Iterative PageRank calculation
    for (let iter = 0; iter < iterations; iter++) {
      const newScores = new Map<string, number>();
      
      for (const node of nodes) {
        let score = (1 - damping) / nodes.length;
        
        // Add contributions from nodes that cite this one
        for (const citerId of node.citedBy) {
          const citer = this.networkCache.get(citerId);
          if (citer) {
            const outDegree = citer.citations.length || 1;
            score += damping * (citer.centrality / outDegree);
          }
        }
        
        newScores.set(node.id, score);
      }
      
      // Update scores
      for (const [id, score] of newScores) {
        const node = this.networkCache.get(id);
        if (node) {
          node.centrality = score;
        }
      }
    }
  }
  
  /**
   * Detects citation clusters using simple algorithm.
   */
  private detectCitationClusters(): void {
    const nodes = Array.from(this.networkCache.values());
    let clusterCount = 0;
    
    // Simple clustering: nodes that share many citations are in same cluster
    for (const node of nodes) {
      if (node.cluster === undefined) {
        node.cluster = clusterCount++;
        
        // Find similar nodes
        for (const other of nodes) {
          if (other.cluster === undefined) {
            const overlap = this.calculateCitationOverlap(node, other);
            if (overlap.bibliographicCoupling > 0.5) {
              other.cluster = node.cluster;
            }
          }
        }
      }
    }
  }
  
  /**
   * Calculates citation overlap between nodes.
   */
  private calculateCitationOverlap(
    source: CitationNode,
    target: CitationNode
  ): CitationOverlap {
    const sharedCitations: Citation[] = [];
    const coCitations: string[] = [];
    
    // Find shared citations (bibliographic coupling)
    for (const sourceCite of source.citations) {
      for (const targetCite of target.citations) {
        if (this.areSameCitation(sourceCite, targetCite)) {
          sharedCitations.push(sourceCite);
          coCitations.push(sourceCite.text);
        }
      }
    }
    
    // Calculate bibliographic coupling strength
    const totalCitations = source.citations.length + target.citations.length;
    const bibliographicCoupling = totalCitations > 0
      ? (sharedCitations.length * 2) / totalCitations
      : 0;
    
    return {
      sharedCitations,
      coCitations,
      bibliographicCoupling,
    };
  }
  
  /**
   * Checks if two citations refer to the same work.
   */
  private areSameCitation(cite1: Citation, cite2: Citation): boolean {
    // Check by year and authors
    if (cite1.year && cite2.year && cite1.year === cite2.year) {
      if (cite1.authors && cite2.authors) {
        // Check if any authors match
        for (const author1 of cite1.authors) {
          for (const author2 of cite2.authors) {
            if (author1.toLowerCase() === author2.toLowerCase()) {
              return true;
            }
          }
        }
      }
    }
    
    // Check by text similarity (for numbered references)
    if (cite1.text === cite2.text) {
      return true;
    }
    
    return false;
  }
  
  /**
   * Checks for significant citation relationship.
   */
  private hasSignificantRelationship(
    source: CitationNode,
    target: CitationNode,
    overlap: CitationOverlap
  ): boolean {
    // Direct citation relationship
    if (source.citedBy.includes(target.id) || target.citedBy.includes(source.id)) {
      return true;
    }
    
    // Bibliographic coupling
    if (overlap.bibliographicCoupling >= this.MIN_OVERLAP) {
      return true;
    }
    
    // Same cluster with high centrality
    if (source.cluster === target.cluster && 
        (source.centrality >= this.CENTRALITY_THRESHOLD || 
         target.centrality >= this.CENTRALITY_THRESHOLD)) {
      return true;
    }
    
    return false;
  }
  
  /**
   * Calculates connection score.
   */
  private calculateConnectionScore(
    source: CitationNode,
    target: CitationNode,
    overlap: CitationOverlap
  ): number {
    let score = 0;
    
    // Bibliographic coupling contribution
    score += overlap.bibliographicCoupling * 0.4;
    
    // Direct citation bonus
    if (source.citedBy.includes(target.id) || target.citedBy.includes(source.id)) {
      score += 0.3;
    }
    
    // Centrality contribution
    const avgCentrality = (source.centrality + target.centrality) / 2;
    score += avgCentrality * 0.2;
    
    // Cluster membership
    if (source.cluster === target.cluster) {
      score += 0.1;
    }
    
    return Math.min(score, 1);
  }
  
  /**
   * Determines confidence level.
   */
  private getConfidenceLevel(
    score: number,
    overlap: CitationOverlap
  ): 'high' | 'medium' | 'low' {
    if (score >= 0.7 && overlap.bibliographicCoupling >= 0.3) return 'high';
    if (score >= 0.4 || overlap.sharedCitations.length >= 2) return 'medium';
    return 'low';
  }
  
  /**
   * Generates explanation.
   */
  private generateExplanation(
    source: CitationNode,
    target: CitationNode,
    overlap: CitationOverlap
  ): string {
    const sharedCount = overlap.sharedCitations.length;
    
    if (source.citedBy.includes(target.id)) {
      return `Direct citation relationship: this chunk is cited by the target. ` +
             `Part of connected scholarly network.`;
    }
    
    if (target.citedBy.includes(source.id)) {
      return `Direct citation relationship: this chunk cites the target work. ` +
             `Building on related research.`;
    }
    
    if (sharedCount > 0) {
      return `Bibliographic coupling with ${sharedCount} shared citations. ` +
             `Both chunks reference similar scholarly works (${(overlap.bibliographicCoupling * 100).toFixed(0)}% overlap).`;
    }
    
    if (source.cluster === target.cluster) {
      return `Part of the same citation cluster. ` +
             `Related through citation network with centrality scores of ${source.centrality.toFixed(2)} and ${target.centrality.toFixed(2)}.`;
    }
    
    return `Indirect citation relationship detected through network analysis. ` +
           `Connection strength: ${(overlap.bibliographicCoupling * 100).toFixed(0)}%.`;
  }
  
  /**
   * Checks for required metadata.
   */
  protected hasRequiredMetadata(chunk: ChunkWithMetadata): boolean {
    // Citations can be extracted from content, so just check for content
    return !!(chunk.content && chunk.content.length > 0);
  }
  
  /**
   * Clean up resources.
   */
  async cleanup(): Promise<void> {
    await super.cleanup();
    this.networkCache.clear();
  }
}