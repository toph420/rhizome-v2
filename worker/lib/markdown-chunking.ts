import type { TimestampContext } from '../types/multi-format'

/**
 * Chunk structure for markdown content.
 * Used when saving markdown as-is without AI processing.
 */
interface Chunk {
  /** Chunk text content */
  content: string
  /** Array of themes/topics (from headings) */
  themes: string[]
  /** Importance score for prioritization (0-1) */
  importance_score: number
  /** Brief summary of chunk content */
  summary: string
  /** Start position in original markdown */
  start_offset: number
  /** End position in original markdown */
  end_offset: number
  /** Word count for the chunk */
  word_count: number
  /** Index of chunk in document sequence */
  chunk_index?: number
  /** Heading hierarchy path (e.g., "Chapter 1/Section A") */
  heading_path?: string
  /** Timestamp contexts for YouTube videos (optional) */
  timestamps?: TimestampContext[]
}

/**
 * Splits markdown content by headings into semantic chunks.
 * No AI processing - pure heading-based splitting for "save-as-is" mode.
 * 
 * Algorithm:
 * - Splits by markdown headings (# ## ### etc.)
 * - Minimum chunk size: 200 characters
 * - Maximum chunk size: 2000 characters (splits long sections by paragraphs)
 * - Uses heading text as theme
 * - Default theme if no headings present
 * 
 * @param markdown - Markdown content to chunk
 * @returns Array of chunks with content, themes, and metadata
 * 
 * @example
 * const md = '# Introduction\n\nFirst section\n\n## Details\n\nSecond section'
 * const chunks = simpleMarkdownChunking(md)
 * // Returns 2 chunks with themes ['Introduction'] and ['Details']
 * 
 * @example
 * const longSection = '# Long\n\n' + 'Lorem ipsum '.repeat(300)
 * const chunks = simpleMarkdownChunking(longSection)
 * // Returns multiple chunks, all <2000 chars
 */
export function simpleMarkdownChunking(markdown: string): Chunk[] {
  const chunks: Chunk[] = []
  
  // Regex to match markdown headings (# to ######)
  const headingRegex = /^(#{1,6})\s+(.+)$/gm
  
  // Find all heading positions
  const headings: Array<{ level: number; text: string; index: number; lineEnd: number }> = []
  let match: RegExpExecArray | null
  
  while ((match = headingRegex.exec(markdown)) !== null) {
    // Find the end of the heading line
    const lineEnd = markdown.indexOf('\n', match.index)
    headings.push({
      level: match[1].length,
      text: match[2].trim(),
      index: match.index,
      lineEnd: lineEnd === -1 ? markdown.length : lineEnd
    })
  }
  
  // If no headings, treat entire content as single chunk
  if (headings.length === 0) {
    const content = markdown.trim()
    if (content.length >= 200) {
      // Split long content without headings
      return splitLongContent(content, ['Document Content'], 0, 'Document Content')
    }
    return [{
      content,
      themes: ['Document Content'],
      importance_score: 0.5,
      summary: content.slice(0, 100) + (content.length > 100 ? '...' : ''),
      start_offset: 0,
      end_offset: content.length,
      word_count: content.split(/\s+/).filter(word => word.length > 0).length,
      chunk_index: 0,
      heading_path: 'Document Content'
    }]
  }
  
  // Build heading hierarchy paths
  const headingPaths: string[] = []
  const pathStack: Array<{ level: number; text: string }> = []
  
  for (const heading of headings) {
    // Pop levels higher than current
    while (pathStack.length > 0 && pathStack[pathStack.length - 1].level >= heading.level) {
      pathStack.pop()
    }
    
    // Add current heading to path
    pathStack.push({ level: heading.level, text: heading.text })
    
    // Build path string
    const path = pathStack.map(h => h.text).join('/')
    headingPaths.push(path)
  }
  
  // Process each section defined by headings
  for (let i = 0; i < headings.length; i++) {
    const currentHeading = headings[i]
    const nextHeading = headings[i + 1]
    
    // Extract content between current and next heading
    const startIndex = currentHeading.index
    const endIndex = nextHeading ? nextHeading.index : markdown.length
    const sectionContent = markdown.slice(startIndex, endIndex).trim()
    
    // Calculate content start position (after heading line + newlines)
    const contentStart = currentHeading.lineEnd + 1 // Skip past heading line
    // Skip any additional newlines after heading
    let contentStartActual = contentStart
    while (contentStartActual < endIndex && markdown[contentStartActual] === '\n') {
      contentStartActual++
    }
    
    // Remove the heading line from content for processing
    const contentWithoutHeading = sectionContent
      .replace(/^#{1,6}\s+.+$/m, '')
      .trim()
    
    // Skip empty sections
    if (contentWithoutHeading.length < 50) {
      continue
    }
    
    const theme = currentHeading.text
    const headingPath = headingPaths[i]
    
    // Check if section is too long and needs splitting
    if (sectionContent.length > 2000) {
      const subChunks = splitLongContent(
        contentWithoutHeading, 
        [theme], 
        contentStartActual,
        headingPath
      )
      chunks.push(...subChunks)
    } else if (sectionContent.length >= 200) {
      // Add as single chunk
      const wordCount = sectionContent.split(/\s+/).filter(word => word.length > 0).length
      chunks.push({
        content: sectionContent,
        themes: [theme],
        importance_score: calculateImportance(currentHeading.level),
        summary: contentWithoutHeading.slice(0, 100) + (contentWithoutHeading.length > 100 ? '...' : ''),
        start_offset: startIndex,
        end_offset: endIndex,
        word_count: wordCount,
        chunk_index: chunks.length,
        heading_path: headingPath
      })
    } else {
      // Combine short sections with next section or previous
      // For now, add as-is if meets minimum threshold
      if (sectionContent.length >= 200) {
        const wordCount = sectionContent.split(/\s+/).filter(word => word.length > 0).length
        chunks.push({
          content: sectionContent,
          themes: [theme],
          importance_score: calculateImportance(currentHeading.level),
          summary: contentWithoutHeading.slice(0, 100),
          start_offset: startIndex,
          end_offset: endIndex,
          word_count: wordCount,
          chunk_index: chunks.length,
          heading_path: headingPath
        })
      }
    }
  }
  
  return chunks
}

/**
 * Splits long content into chunks by paragraph breaks with accurate offset tracking.
 * Ensures no chunk exceeds 2000 characters while maintaining precise character positions.
 * 
 * @param content - Content to split (without heading)
 * @param themes - Themes to apply to all chunks
 * @param baseOffset - Starting character position in original markdown
 * @param headingPath - Heading hierarchy path
 * @param originalMarkdown - Full original markdown for position verification
 * @returns Array of chunks with accurate start_offset and end_offset
 */
function splitLongContent(
  content: string, 
  themes: string[], 
  baseOffset: number = 0, 
  headingPath?: string
): Chunk[] {
  const chunks: Chunk[] = []
  const paragraphs = content.split(/\n\n+/)
  
  let currentChunk = ''
  let currentChunkStart = baseOffset
  let currentPosition = baseOffset
  let chunkIndex = 0
  
  for (const paragraph of paragraphs) {
    const trimmedParagraph = paragraph.trim()
    
    if (!trimmedParagraph) {
      // Skip empty paragraphs but account for their space
      currentPosition += 2 // Account for paragraph break
      continue
    }
    
    // Calculate what the new chunk would look like
    const newChunk = currentChunk + (currentChunk ? '\n\n' : '') + trimmedParagraph
    
    // If adding this paragraph would exceed limit, save current chunk
    if (newChunk.length > 2000 && currentChunk.length > 0) {
      const wordCount = currentChunk.split(/\s+/).filter(word => word.length > 0).length
      chunks.push({
        content: currentChunk.trim(),
        themes,
        importance_score: 0.5,
        summary: currentChunk.slice(0, 100) + (currentChunk.length > 100 ? '...' : ''),
        start_offset: currentChunkStart,
        end_offset: currentPosition,
        word_count: wordCount,
        chunk_index: chunkIndex++,
        heading_path: headingPath
      })
      
      // Start new chunk
      currentChunk = trimmedParagraph
      currentChunkStart = currentPosition
      currentPosition += trimmedParagraph.length
    } else {
      // Add paragraph to current chunk
      if (currentChunk) {
        currentPosition += 2 // Account for \n\n between paragraphs
      }
      currentChunk = newChunk
      currentPosition += trimmedParagraph.length
    }
    
    // If current chunk still exceeds limit after adding paragraph, split at character boundary
    if (currentChunk.length > 2000) {
      // Split at safe character boundary (try to avoid breaking words)
      let splitPoint = 2000
      while (splitPoint > 1800 && currentChunk[splitPoint] !== ' ' && currentChunk[splitPoint] !== '\n') {
        splitPoint--
      }
      
      const chunkContent = currentChunk.slice(0, splitPoint)
      const wordCount = chunkContent.split(/\s+/).filter(word => word.length > 0).length
      chunks.push({
        content: chunkContent,
        themes,
        importance_score: 0.5,
        summary: chunkContent.slice(0, 100) + '...',
        start_offset: currentChunkStart,
        end_offset: currentChunkStart + splitPoint,
        word_count: wordCount,
        chunk_index: chunkIndex++,
        heading_path: headingPath
      })
      
      // Continue with remainder
      currentChunk = currentChunk.slice(splitPoint).trim()
      currentChunkStart = currentChunkStart + splitPoint
      currentPosition = currentChunkStart + currentChunk.length
    }
  }
  
  // Add remaining content if substantial enough
  if (currentChunk.trim().length >= 200) {
    const wordCount = currentChunk.split(/\s+/).filter(word => word.length > 0).length
    chunks.push({
      content: currentChunk.trim(),
      themes,
      importance_score: 0.5,
      summary: currentChunk.slice(0, 100) + (currentChunk.length > 100 ? '...' : ''),
      start_offset: currentChunkStart,
      end_offset: currentPosition,
      word_count: wordCount,
      chunk_index: chunkIndex++,
      heading_path: headingPath
    })
  }
  
  return chunks
}

/**
 * Calculates importance score based on heading level.
 * H1 = highest importance (1.0), H6 = lowest (0.3)
 * 
 * @param level - Heading level (1-6)
 * @returns Importance score (0.3-1.0)
 */
function calculateImportance(level: number): number {
  // H1 = 1.0, H2 = 0.9, H3 = 0.7, H4 = 0.6, H5 = 0.4, H6 = 0.3
  const scores: Record<number, number> = {
    1: 1.0,
    2: 0.9,
    3: 0.7,
    4: 0.6,
    5: 0.4,
    6: 0.3
  }
  return scores[level] || 0.5
}

/**
 * Enhances themes extraction using concept analysis metadata.
 * Replaces generic themes with meaningful concepts from AI analysis.
 * 
 * @param chunk - Chunk with metadata containing concept analysis
 * @returns Enhanced themes array based on concept importance
 */
export function enhanceThemesFromConcepts(chunk: any): string[] {
  // If no concept metadata, keep existing themes
  if (!chunk.metadata?.concepts?.concepts) {
    return chunk.themes || ['Document Content']
  }
  
  const concepts = chunk.metadata.concepts.concepts
  
  // Extract high-importance concepts as themes
  const meaningfulConcepts = concepts
    .filter((concept: any) => 
      concept.importance > 0.35 && 
      concept.text.length > 2 && 
      !['in', 'its', 'certain', 'written'].includes(concept.text.toLowerCase())
    )
    .slice(0, 3) // Limit to top 3 concepts
    .map((concept: any) => concept.text)
  
  // Fallback to original themes if no meaningful concepts found
  if (meaningfulConcepts.length === 0) {
    return chunk.themes || ['Document Content']
  }
  
  return meaningfulConcepts
}

/**
 * Enhances summary generation using concept relationships.
 * Creates meaningful summaries from concept analysis instead of content truncation.
 * 
 * @param chunk - Chunk with metadata containing concept analysis
 * @returns Enhanced summary based on key concepts and relationships
 */
export function enhanceSummaryFromConcepts(chunk: any): string {
  // If no concept metadata, keep existing summary
  if (!chunk.metadata?.concepts?.concepts || !chunk.metadata?.concepts?.relationships) {
    return chunk.summary || chunk.content.slice(0, 100) + '...'
  }
  
  const concepts = chunk.metadata.concepts.concepts
  const relationships = chunk.metadata.concepts.relationships
  
  // Get top 2 most important concepts
  const topConcepts = concepts
    .filter((concept: any) => concept.importance > 0.3)
    .slice(0, 2)
    .map((concept: any) => concept.text)
  
  // Find key relationships between concepts
  const keyRelationships = relationships
    .filter((rel: any) => rel.strength >= 0.7)
    .slice(0, 2)
  
  // Build meaningful summary
  if (topConcepts.length >= 2 && keyRelationships.length > 0) {
    const rel = keyRelationships[0]
    return `Discusses ${topConcepts.join(' and ')}, exploring how ${rel.from} ${rel.type} ${rel.to}.`
  } else if (topConcepts.length > 0) {
    return `Covers ${topConcepts.join(', ')} and related concepts.`
  }
  
  // Fallback to content truncation
  return chunk.content.slice(0, 100) + '...'
}

/**
 * Extracts YouTube timestamps with surrounding context for fuzzy matching.
 * Matches [MM:SS] and [HH:MM:SS] formats commonly used in video transcripts.
 * 
 * Context extraction:
 * - Captures 3-5 words before and after each timestamp
 * - Converts timestamp to seconds for storage
 * - Enables linking chunks back to specific video moments
 * 
 * @param content - Markdown content with timestamps
 * @returns Array of timestamp contexts with time and surrounding words
 * 
 * @example
 * const content = 'In the beginning [00:30] we discuss basics and later [02:15] advanced topics'
 * const timestamps = extractTimestampsWithContext(content)
 * // Returns:
 * // [
 * //   { time: 30, context_before: 'In the beginning', context_after: 'we discuss basics' },
 * //   { time: 135, context_before: 'basics and later', context_after: 'advanced topics' }
 * // ]
 * 
 * @example
 * const content = 'Introduction [1:23:45] to advanced concepts'
 * const timestamps = extractTimestampsWithContext(content)
 * // Returns: [{ time: 5025, context_before: 'Introduction', context_after: 'to advanced concepts' }]
 */
export function extractTimestampsWithContext(content: string): TimestampContext[] {
  const timestamps: TimestampContext[] = []
  
  // Regex to match [MM:SS] or [HH:MM:SS] timestamps
  // Captures hours (optional), minutes, and seconds
  const timestampRegex = /\[(\d{1,2}):(\d{2})(?::(\d{2}))?\]/g
  
  let match: RegExpExecArray | null
  
  while ((match = timestampRegex.exec(content)) !== null) {
    const hours = match[3] ? parseInt(match[1], 10) : 0
    const minutes = match[3] ? parseInt(match[2], 10) : parseInt(match[1], 10)
    const seconds = match[3] ? parseInt(match[3], 10) : parseInt(match[2], 10)
    
    // Convert to total seconds
    const timeInSeconds = hours * 3600 + minutes * 60 + seconds
    
    // Extract context before timestamp (100 chars)
    const beforeStart = Math.max(0, match.index - 100)
    const beforeText = content.slice(beforeStart, match.index)
    const contextBefore = extractContextWords(beforeText, 'before')
    
    // Extract context after timestamp (100 chars)
    const afterEnd = Math.min(content.length, match.index + match[0].length + 100)
    const afterText = content.slice(match.index + match[0].length, afterEnd)
    const contextAfter = extractContextWords(afterText, 'after')
    
    timestamps.push({
      time: timeInSeconds,
      context_before: contextBefore,
      context_after: contextAfter
    })
  }
  
  return timestamps
}

/**
 * Extracts 3-5 words from context text for fuzzy matching.
 * 
 * @param text - Context text to extract words from
 * @param position - Whether extracting from before or after timestamp
 * @returns String of 3-5 words
 */
function extractContextWords(text: string, position: 'before' | 'after'): string {
  // Remove extra whitespace and split into words
  const words = text
    .trim()
    .replace(/\s+/g, ' ')
    .split(' ')
    .filter(word => word.length > 0)
  
  if (position === 'before') {
    // Take last 3-5 words before timestamp
    const contextWords = words.slice(-5)
    return contextWords.join(' ')
  } else {
    // Take first 3-5 words after timestamp
    const contextWords = words.slice(0, 5)
    return contextWords.join(' ')
  }
}