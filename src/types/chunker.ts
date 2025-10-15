/**
 * Chonkie chunker strategy types for Rhizome V2.
 *
 * Mirrors worker/lib/chonkie/types.ts ChonkieStrategy enum.
 * Used for UI selection and passing to worker via input_data.
 */

export type ChunkerType =
  | 'hybrid'     // Old HybridChunker (deprecated, for backward compatibility)
  | 'token'      // Chonkie TokenChunker - Fixed-size chunks
  | 'sentence'   // Chonkie SentenceChunker - Sentence boundaries
  | 'recursive'  // Chonkie RecursiveChunker - Hierarchical splitting (DEFAULT)
  | 'semantic'   // Chonkie SemanticChunker - Topic-based boundaries
  | 'late'       // Chonkie LateChunker - Contextual embeddings
  | 'code'       // Chonkie CodeChunker - AST-aware code splitting
  | 'neural'     // Chonkie NeuralChunker - BERT-based semantic shifts
  | 'slumber'    // Chonkie SlumberChunker - Agentic LLM-powered
  | 'table'      // Chonkie TableChunker - Markdown table splitting

/**
 * User-friendly descriptions for each chunker strategy.
 * Used in tooltips and help text.
 */
export const chunkerDescriptions: Record<ChunkerType, string> = {
  hybrid: 'Structural (Deprecated) - Legacy HybridChunker from Docling.',
  token: 'Fixed-size chunks. Fastest, most predictable. Use for compatibility or testing.',
  sentence: 'Sentence-based boundaries. Simple and fast. Best for clean, well-formatted text.',
  recursive: 'Hierarchical splitting (paragraph → sentence → token). Recommended default for most documents.',
  semantic: 'Topic-based boundaries using embeddings. Best for narratives, essays, thematic content. Slower but higher quality.',
  late: 'Contextual embeddings for high retrieval quality. Best for critical RAG applications. Very slow.',
  code: 'AST-aware code splitting. Use only for source code files.',
  neural: 'BERT-based semantic shift detection. Best for complex academic papers. Very slow but highest quality.',
  slumber: 'Agentic LLM-powered chunking. Highest quality, use for critical documents only. Extremely slow.',
  table: 'Markdown table splitting by row. Use for table-heavy documents.'
}

/**
 * Estimated processing time for 500-page document.
 * Used in UI to set user expectations.
 */
export const chunkerTimeEstimates: Record<ChunkerType, string> = {
  hybrid: '15-25 min',  // Old HybridChunker timing
  token: '2-3 min',
  sentence: '3-4 min',
  recursive: '3-5 min',
  semantic: '8-15 min',
  late: '10-20 min',
  code: '5-10 min',
  neural: '15-25 min',
  slumber: '30-60 min',
  table: '3-5 min'
}

/**
 * Display labels for chunker strategies.
 * Used in dropdown options and document metadata.
 */
export const chunkerLabels: Record<ChunkerType, string> = {
  hybrid: 'Structural (Deprecated)',
  token: 'Token',
  sentence: 'Sentence',
  recursive: 'Recursive',
  semantic: 'Semantic',
  late: 'Late',
  code: 'Code',
  neural: 'Neural',
  slumber: 'Slumber',
  table: 'Table'
}

/**
 * Color styles for chunker strategy badges.
 * Used in document metadata display.
 */
export const chunkerColors: Record<ChunkerType, string> = {
  hybrid: 'bg-gray-100 text-gray-700 border-gray-300',
  token: 'bg-gray-100 text-gray-700 border-gray-300',
  sentence: 'bg-gray-100 text-gray-700 border-gray-300',
  recursive: 'bg-green-100 text-green-700 border-green-300',
  semantic: 'bg-blue-100 text-blue-700 border-blue-300',
  late: 'bg-purple-100 text-purple-700 border-purple-300',
  code: 'bg-orange-100 text-orange-700 border-orange-300',
  neural: 'bg-purple-100 text-purple-700 border-purple-300',
  slumber: 'bg-yellow-100 text-yellow-700 border-yellow-300',
  table: 'bg-gray-100 text-gray-700 border-gray-300'
}
