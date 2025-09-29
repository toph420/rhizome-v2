/**
 * Structural patterns extractor for document organization analysis.
 * Identifies headings, lists, sections, tables, and template patterns.
 */

import type { 
  StructuralMetadata, 
  StructuralPattern 
} from '../../types/metadata'

/**
 * Extracts structural patterns from a text chunk.
 * Uses pattern matching and AI enhancement for accurate detection.
 * 
 * @param content - The text content to analyze
 * @param aiAnalysis - Optional AI-enhanced analysis results
 * @returns Structural metadata with patterns and confidence scores
 */
export async function extractStructuralPatterns(
  content: string,
  aiAnalysis?: AIStructuralAnalysis
): Promise<StructuralMetadata> {
  const startTime = Date.now()
  
  // Run pattern detection in parallel
  const [
    patterns,
    hierarchyDepth,
    listTypes,
    hasTable,
    hasCode,
    templateType
  ] = await Promise.all([
    detectPatterns(content),
    detectHierarchyDepth(content),
    detectListTypes(content),
    detectTables(content),
    detectCodeBlocks(content),
    detectTemplateType(content, aiAnalysis)
  ])
  
  // Calculate confidence based on pattern clarity
  const confidence = calculateConfidence(patterns, content)
  
  // Ensure performance target met (<500ms)
  const elapsed = Date.now() - startTime
  if (elapsed > 500) {
    console.warn(`Structural extraction took ${elapsed}ms (target: <500ms)`)
  }
  
  return {
    patterns,
    hierarchyDepth,
    listTypes,
    hasTable,
    hasCode,
    templateType,
    confidence
  }
}

/**
 * Detects all structural patterns in the content.
 */
async function detectPatterns(content: string): Promise<StructuralPattern[]> {
  const patterns: StructuralPattern[] = []
  
  // Heading detection (Markdown and common patterns)
  const headingMatches = content.match(/^#{1,6}\s+.+$/gm) || []
  const altHeadingMatches = content.match(/^[A-Z][A-Z\s]+:$/gm) || []
  
  if (headingMatches.length > 0 || altHeadingMatches.length > 0) {
    const headingLevels = headingMatches.map(h => h.match(/^#+/)?.[0].length || 1)
    patterns.push({
      type: 'heading',
      count: headingMatches.length + altHeadingMatches.length,
      avgNesting: headingLevels.length > 0 
        ? headingLevels.reduce((a, b) => a + b, 0) / headingLevels.length 
        : 1,
      metadata: {
        markdownHeadings: headingMatches.length,
        capsHeadings: altHeadingMatches.length
      }
    })
  }
  
  // List detection
  const bulletLists = (content.match(/^[\s]*[-*+]\s+.+$/gm) || []).length
  const numberedLists = (content.match(/^[\s]*\d+[\.)]\s+.+$/gm) || []).length
  const letterLists = (content.match(/^[\s]*[a-zA-Z][\.)]\s+.+$/gm) || []).length
  
  if (bulletLists + numberedLists + letterLists > 0) {
    patterns.push({
      type: 'list',
      count: bulletLists + numberedLists + letterLists,
      avgNesting: calculateListNesting(content),
      metadata: {
        bulletCount: bulletLists,
        numberedCount: numberedLists,
        letterCount: letterLists
      }
    })
  }
  
  // Table detection (Markdown tables and ASCII tables)
  const markdownTables = (content.match(/\|.+\|[\r\n]+\|[-:\s|]+\|/g) || []).length
  const asciiTables = (content.match(/\+[-+]+\+/g) || []).length / 2 // Divide by 2 for top/bottom
  
  if (markdownTables + asciiTables > 0) {
    patterns.push({
      type: 'table',
      count: markdownTables + Math.floor(asciiTables),
      avgNesting: 0,
      metadata: {
        markdownTables,
        asciiTables: Math.floor(asciiTables)
      }
    })
  }
  
  // Code block detection
  const fencedCode = (content.match(/```[\s\S]*?```/g) || []).length
  const indentedCode = detectIndentedCodeBlocks(content)
  
  if (fencedCode + indentedCode > 0) {
    patterns.push({
      type: 'code',
      count: fencedCode + indentedCode,
      avgNesting: 0,
      metadata: {
        fenced: fencedCode,
        indented: indentedCode
      }
    })
  }
  
  // Quote detection
  const blockQuotes = (content.match(/^>\s+.+$/gm) || []).length
  const quoteBlocks = (content.match(/"[^"]{50,}"/g) || []).length
  
  if (blockQuotes + quoteBlocks > 0) {
    patterns.push({
      type: 'quote',
      count: blockQuotes + quoteBlocks,
      avgNesting: calculateQuoteNesting(content),
      metadata: {
        blockQuotes,
        inlineQuotes: quoteBlocks
      }
    })
  }
  
  // Section detection (horizontal rules, clear breaks)
  const hrRules = (content.match(/^[-*_]{3,}$/gm) || []).length
  const sectionBreaks = (content.match(/\n\n\n+/g) || []).length
  
  if (hrRules + sectionBreaks > 0) {
    patterns.push({
      type: 'section',
      count: hrRules + sectionBreaks,
      avgNesting: 0,
      metadata: {
        explicitBreaks: hrRules,
        whitespaceBreaks: sectionBreaks
      }
    })
  }
  
  // Definition list detection
  const definitions = (content.match(/^.+:\s*\n\s+.+$/gm) || []).length
  
  if (definitions > 0) {
    patterns.push({
      type: 'definition',
      count: definitions,
      avgNesting: 0,
      metadata: {}
    })
  }
  
  return patterns
}

/**
 * Detects the maximum hierarchy depth in the content.
 */
async function detectHierarchyDepth(content: string): Promise<number> {
  // Check markdown heading levels
  const headingLevels = new Set<number>()
  const headingMatches = content.matchAll(/^(#{1,6})\s+/gm)
  
  for (const match of headingMatches) {
    headingLevels.add(match[1].length)
  }
  
  // Check list nesting depth
  const listDepth = calculateListNesting(content)
  
  // Check quote nesting depth
  const quoteDepth = calculateQuoteNesting(content)
  
  // Return the maximum depth found
  return Math.max(
    headingLevels.size,
    listDepth,
    quoteDepth,
    1 // Minimum depth is 1
  )
}

/**
 * Detects types of lists present in the content.
 */
async function detectListTypes(content: string): Promise<Array<'bullet' | 'numbered' | 'nested' | 'definition'>> {
  const types = new Set<'bullet' | 'numbered' | 'nested' | 'definition'>()
  
  // Bullet lists
  if (/^[\s]*[-*+]\s+/m.test(content)) {
    types.add('bullet')
  }
  
  // Numbered lists
  if (/^[\s]*\d+[\.)]\s+/m.test(content)) {
    types.add('numbered')
  }
  
  // Nested lists (check for indentation)
  if (/^[\s]{2,}[-*+\d]+[\.)]*\s+/m.test(content)) {
    types.add('nested')
  }
  
  // Definition lists
  if (/^.+:\s*\n\s+.+$/m.test(content)) {
    types.add('definition')
  }
  
  return Array.from(types)
}

/**
 * Detects presence of tables in the content.
 */
async function detectTables(content: string): Promise<boolean> {
  // Markdown tables
  if (/\|.+\|[\r\n]+\|[-:\s|]+\|/.test(content)) {
    return true
  }
  
  // ASCII tables
  if (/\+[-+]+\+/.test(content)) {
    return true
  }
  
  // Tab-separated values (3+ columns)
  const lines = content.split('\n')
  for (const line of lines) {
    if (line.split('\t').length >= 3) {
      return true
    }
  }
  
  return false
}

/**
 * Detects presence of code blocks in the content.
 */
async function detectCodeBlocks(content: string): Promise<boolean> {
  // Fenced code blocks
  if (/```[\s\S]*?```/.test(content)) {
    return true
  }
  
  // Indented code blocks (4+ spaces at start of multiple lines)
  if (detectIndentedCodeBlocks(content) > 0) {
    return true
  }
  
  // Inline code (multiple backtick segments)
  const inlineCode = (content.match(/`[^`]+`/g) || []).length
  if (inlineCode >= 3) {
    return true
  }
  
  return false
}

/**
 * Detects template type if content follows a known pattern.
 */
async function detectTemplateType(
  content: string, 
  aiAnalysis?: AIStructuralAnalysis
): Promise<string | undefined> {
  // Use AI analysis if available
  if (aiAnalysis?.templateType) {
    return aiAnalysis.templateType
  }
  
  // Common document templates
  const templates = [
    { pattern: /abstract[\s\S]*introduction[\s\S]*method/i, type: 'academic_paper' },
    { pattern: /summary[\s\S]*background[\s\S]*findings/i, type: 'research_report' },
    { pattern: /objective[\s\S]*scope[\s\S]*deliverables/i, type: 'project_proposal' },
    { pattern: /symptoms[\s\S]*diagnosis[\s\S]*treatment/i, type: 'medical_note' },
    { pattern: /given[\s\S]*when[\s\S]*then/i, type: 'test_scenario' },
    { pattern: /problem[\s\S]*solution[\s\S]*implementation/i, type: 'technical_design' },
    { pattern: /overview[\s\S]*features[\s\S]*installation/i, type: 'documentation' },
    { pattern: /ingredients[\s\S]*instructions[\s\S]*notes/i, type: 'recipe' }
  ]
  
  for (const { pattern, type } of templates) {
    if (pattern.test(content)) {
      return type
    }
  }
  
  return undefined
}

/**
 * Helper function to detect indented code blocks.
 */
function detectIndentedCodeBlocks(content: string): number {
  const lines = content.split('\n')
  let codeBlockCount = 0
  let inCodeBlock = false
  
  for (const line of lines) {
    const isIndented = /^[\s]{4,}/.test(line) && line.trim().length > 0
    
    if (isIndented && !inCodeBlock) {
      inCodeBlock = true
      codeBlockCount++
    } else if (!isIndented && inCodeBlock) {
      inCodeBlock = false
    }
  }
  
  return codeBlockCount
}

/**
 * Calculates the average nesting level of lists.
 */
function calculateListNesting(content: string): number {
  const listLines = content.match(/^[\s]*[-*+\d]+[\.)]*\s+.+$/gm) || []
  if (listLines.length === 0) return 0
  
  const nestingLevels = listLines.map(line => {
    const leadingSpaces = line.match(/^[\s]*/)?.[0].length || 0
    return Math.floor(leadingSpaces / 2) + 1
  })
  
  return nestingLevels.reduce((a, b) => a + b, 0) / nestingLevels.length
}

/**
 * Calculates the nesting level of quotes.
 */
function calculateQuoteNesting(content: string): number {
  const quoteLines = content.match(/^>+\s+.+$/gm) || []
  if (quoteLines.length === 0) return 0
  
  const nestingLevels = quoteLines.map(line => {
    return (line.match(/^>+/)?.[0].length || 1)
  })
  
  return Math.max(...nestingLevels, 0)
}

/**
 * Calculates confidence score based on pattern clarity.
 */
function calculateConfidence(patterns: StructuralPattern[], content: string): number {
  if (patterns.length === 0) return 0.3 // Low confidence for no patterns
  
  let confidence = 0.5 // Base confidence
  
  // Increase confidence for clear patterns
  if (patterns.some(p => p.type === 'heading' && p.count > 2)) confidence += 0.15
  if (patterns.some(p => p.type === 'list' && p.count > 3)) confidence += 0.1
  if (patterns.some(p => p.type === 'table')) confidence += 0.1
  if (patterns.some(p => p.type === 'code')) confidence += 0.1
  
  // Decrease confidence for very short content
  if (content.length < 200) confidence -= 0.2
  
  // Increase confidence for well-structured content
  const lineCount = content.split('\n').length
  const avgLineLength = content.length / lineCount
  if (avgLineLength > 20 && avgLineLength < 100) confidence += 0.05
  
  // Cap confidence between 0 and 1
  return Math.max(0, Math.min(1, confidence))
}

/**
 * Optional AI-enhanced analysis results.
 */
export interface AIStructuralAnalysis {
  templateType?: string
  customPatterns?: Array<{
    name: string
    description: string
    confidence: number
  }>
  structuralComplexity?: 'simple' | 'moderate' | 'complex'
}