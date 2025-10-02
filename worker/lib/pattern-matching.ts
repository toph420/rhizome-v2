/**
 * Pattern matching utilities for structural analysis
 * Provides algorithms for comparing document structures and patterns
 */

/**
 * Calculates similarity between two structural patterns
 * Uses a combination of exact matching and fuzzy comparison
 * 
 * @param pattern1 - First structural pattern
 * @param pattern2 - Second structural pattern
 * @returns Similarity score between 0 and 1
 */
export function calculatePatternSimilarity(
  pattern1: StructuralFingerprint,
  pattern2: StructuralFingerprint
): number {
  // Compare fingerprint hashes for quick similarity check
  if (pattern1.hash === pattern2.hash) {
    return 1.0;
  }

  let totalScore = 0;
  let totalWeight = 0;

  // Compare element counts with tolerance
  const elementScore = compareElementCounts(pattern1.elements, pattern2.elements);
  totalScore += elementScore * 0.3;
  totalWeight += 0.3;

  // Compare nesting depth
  if (pattern1.maxNestingDepth !== undefined && pattern2.maxNestingDepth !== undefined) {
    const depthDiff = Math.abs(pattern1.maxNestingDepth - pattern2.maxNestingDepth);
    const depthScore = Math.max(0, 1 - depthDiff / 10);
    totalScore += depthScore * 0.2;
    totalWeight += 0.2;
  }

  // Compare structural complexity
  const complexityScore = compareComplexity(pattern1.complexity, pattern2.complexity);
  totalScore += complexityScore * 0.25;
  totalWeight += 0.25;

  // Compare pattern sequences if available
  if (pattern1.sequence && pattern2.sequence) {
    const sequenceScore = compareSequences(pattern1.sequence, pattern2.sequence);
    totalScore += sequenceScore * 0.25;
    totalWeight += 0.25;
  }

  return totalWeight > 0 ? totalScore / totalWeight : 0;
}

/**
 * Extracts a structural fingerprint from document content
 * Creates a hashable representation of the document structure
 * 
 * @param content - Document content to analyze
 * @returns Structural fingerprint
 */
export function extractStructuralFingerprint(content: string): StructuralFingerprint {
  const elements = countStructuralElements(content);
  const maxNestingDepth = calculateMaxNestingDepth(content);
  const complexity = calculateStructuralComplexity(elements, maxNestingDepth);
  const sequence = extractStructuralSequence(content);
  
  // Generate hash from structural features
  const hash = generateStructuralHash({
    elements,
    maxNestingDepth,
    complexity,
    sequence
  });

  return {
    hash,
    elements,
    maxNestingDepth,
    complexity,
    sequence
  };
}

/**
 * Counts structural elements in content
 */
function countStructuralElements(content: string): ElementCounts {
  return {
    headings: (content.match(/^#{1,6}\s/gm) || []).length,
    lists: (content.match(/^[\s]*[-*+•]\s/gm) || []).length,
    numberedLists: (content.match(/^\d+\.\s/gm) || []).length,
    tables: (content.match(/\|.*\|.*\|/gm) || []).length,
    codeBlocks: (content.match(/```[\s\S]*?```/g) || []).length,
    blockQuotes: (content.match(/^>\s/gm) || []).length,
    paragraphs: content.split(/\n\n+/).filter(p => p.trim().length > 0).length,
    links: (content.match(/\[.*?\]\(.*?\)/g) || []).length,
    images: (content.match(/!\[.*?\]\(.*?\)/g) || []).length,
    boldText: (content.match(/\*\*.*?\*\*/g) || []).length,
    italicText: (content.match(/\*[^*]+?\*/g) || []).length,
  };
}

/**
 * Calculates maximum nesting depth in the content
 */
function calculateMaxNestingDepth(content: string): number {
  const lines = content.split('\n');
  let maxDepth = 0;

  for (const line of lines) {
    // Check list indentation
    const listMatch = line.match(/^(\s*)[-*+•\d]/);
    if (listMatch) {
      const depth = Math.floor(listMatch[1].length / 2);
      maxDepth = Math.max(maxDepth, depth);
    }

    // Check blockquote nesting
    const quoteMatch = line.match(/^(>+)\s/);
    if (quoteMatch) {
      maxDepth = Math.max(maxDepth, quoteMatch[1].length);
    }
  }

  return maxDepth;
}

/**
 * Calculates structural complexity score
 */
function calculateStructuralComplexity(
  elements: ElementCounts,
  nestingDepth: number
): number {
  // Calculate diversity of elements
  const elementTypes = Object.keys(elements).filter(
    key => elements[key as keyof ElementCounts] > 0
  ).length;

  // Calculate total element count
  const totalElements = Object.values(elements).reduce((sum, count) => sum + count, 0);

  // Complexity formula considering diversity, quantity, and nesting
  const diversity = elementTypes / Object.keys(elements).length;
  const density = Math.min(1, totalElements / 100);
  const depthFactor = Math.min(1, nestingDepth / 5);

  return (diversity * 0.4 + density * 0.4 + depthFactor * 0.2);
}

/**
 * Extracts sequence of structural elements
 */
function extractStructuralSequence(content: string): string[] {
  const sequence: string[] = [];
  const lines = content.split('\n');

  for (const line of lines) {
    if (line.match(/^#{1,6}\s/)) {
      const level = line.match(/^(#{1,6})/)?.[1].length || 1;
      sequence.push(`H${level}`);
    } else if (line.match(/^[\s]*[-*+•]\s/)) {
      sequence.push('UL');
    } else if (line.match(/^\d+\.\s/)) {
      sequence.push('OL');
    } else if (line.match(/^\|.*\|/)) {
      sequence.push('TABLE');
    } else if (line.match(/^```/)) {
      sequence.push('CODE');
    } else if (line.match(/^>\s/)) {
      sequence.push('QUOTE');
    } else if (line.trim().length > 0 && !sequence.length || 
               sequence[sequence.length - 1] !== 'P') {
      sequence.push('P');
    }
  }

  return sequence;
}

/**
 * Compares two element count objects
 */
function compareElementCounts(counts1: ElementCounts, counts2: ElementCounts): number {
  let similarity = 0;
  let totalElements = 0;

  for (const key in counts1) {
    const c1 = counts1[key as keyof ElementCounts];
    const c2 = counts2[key as keyof ElementCounts];
    const max = Math.max(c1, c2);
    
    if (max > 0) {
      const elementSimilarity = 1 - Math.abs(c1 - c2) / max;
      similarity += elementSimilarity;
      totalElements++;
    }
  }

  return totalElements > 0 ? similarity / totalElements : 0;
}

/**
 * Compares structural complexity scores
 */
function compareComplexity(complexity1: number, complexity2: number): number {
  const diff = Math.abs(complexity1 - complexity2);
  return Math.max(0, 1 - diff);
}

/**
 * Compares two structural sequences using edit distance
 */
function compareSequences(seq1: string[], seq2: string[]): number {
  if (seq1.length === 0 || seq2.length === 0) {
    return seq1.length === seq2.length ? 1 : 0;
  }

  // Use Levenshtein distance for sequence comparison
  const distance = calculateEditDistance(seq1, seq2);
  const maxLength = Math.max(seq1.length, seq2.length);
  
  return 1 - (distance / maxLength);
}

/**
 * Calculates edit distance between two sequences
 */
function calculateEditDistance(seq1: string[], seq2: string[]): number {
  const m = seq1.length;
  const n = seq2.length;
  const dp: number[][] = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) {
    dp[i][0] = i;
  }
  for (let j = 0; j <= n; j++) {
    dp[0][j] = j;
  }

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (seq1[i - 1] === seq2[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = 1 + Math.min(
          dp[i - 1][j],     // deletion
          dp[i][j - 1],     // insertion
          dp[i - 1][j - 1]  // substitution
        );
      }
    }
  }

  return dp[m][n];
}

/**
 * Generates a hash from structural features
 */
function generateStructuralHash(features: any): string {
  const str = JSON.stringify(features, Object.keys(features).sort());
  
  // Simple hash function for demonstration
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  
  return Math.abs(hash).toString(36);
}

/**
 * Interface for element counts
 */
export interface ElementCounts {
  headings: number;
  lists: number;
  numberedLists: number;
  tables: number;
  codeBlocks: number;
  blockQuotes: number;
  paragraphs: number;
  links: number;
  images: number;
  boldText: number;
  italicText: number;
}

/**
 * Interface for structural fingerprint
 */
export interface StructuralFingerprint {
  hash: string;
  elements: ElementCounts;
  maxNestingDepth: number;
  complexity: number;
  sequence: string[];
}