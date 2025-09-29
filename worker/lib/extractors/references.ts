/**
 * Cross-reference and citation extractor.
 * Detects references, citations, URLs, and cross-references in content.
 */

import type { ReferenceMetadata } from '../../types/metadata'

/**
 * Extracts references and citations from content.
 * Identifies internal/external references, citation styles, and URLs.
 * 
 * @param content - The text content to analyze
 * @param aiAnalysis - Optional AI-enhanced reference detection
 * @returns Reference metadata with citations and cross-references
 */
export async function extractReferences(
  content: string,
  aiAnalysis?: AIReferenceAnalysis
): Promise<ReferenceMetadata> {
  const startTime = Date.now()
  
  // Extract references in parallel
  const [
    internalRefs,
    externalRefs,
    urls,
    citationStyle,
    crossRefs
  ] = await Promise.all([
    detectInternalReferences(content),
    detectExternalReferences(content),
    extractURLs(content),
    detectCitationStyle(content),
    findCrossReferences(content)
  ])
  
  // Calculate reference density
  const wordCount = content.split(/\s+/).length
  const totalRefs = internalRefs + externalRefs.length + urls.length
  const density = (totalRefs / wordCount) * 100 // refs per 100 words
  
  // Calculate confidence
  const confidence = calculateReferenceConfidence(content, totalRefs)
  
  // Ensure performance target met (<200ms)
  const elapsed = Date.now() - startTime
  if (elapsed > 200) {
    console.warn(`Reference extraction took ${elapsed}ms (target: <200ms)`)
  }
  
  return {
    internalRefs,
    externalRefs,
    citationStyle,
    urls,
    crossRefs,
    density,
    confidence
  }
}

/**
 * Detects internal references (same document).
 */
async function detectInternalReferences(content: string): Promise<number> {
  let count = 0
  
  // Common internal reference patterns
  const patterns = [
    /\b(?:see|refer to|as mentioned in|as discussed in)\s+(?:section|chapter|page|figure|table)\s+\d+/gi,
    /\b(?:above|below|earlier|later|previously|subsequently)\s+(?:section|chapter|discussion)/gi,
    /\((?:see|cf\.?)\s+(?:section|chapter|page)\s+[\d.]+\)/gi,
    /\bFigure\s+\d+/g,
    /\bTable\s+\d+/g,
    /\bEquation\s+\d+/g,
    /\bAppendix\s+[A-Z\d]+/g
  ]
  
  for (const pattern of patterns) {
    const matches = content.match(pattern)
    if (matches) {
      count += matches.length
    }
  }
  
  return count
}

/**
 * Detects external references and citations.
 */
async function detectExternalReferences(content: string): Promise<string[]> {
  const references: Set<string> = new Set()
  
  // Academic citation patterns
  const citationPatterns = [
    // Author (Year) format
    /\b[A-Z][a-z]+(?:\s+(?:and|&)\s+[A-Z][a-z]+)*\s+\(\d{4}\)/g,
    // [Number] format
    /\[\d+(?:,\s*\d+)*\]/g,
    // (Author, Year) format
    /\([A-Z][a-z]+(?:\s+(?:et al\.?|and|&)\s+[A-Z][a-z]+)*,?\s+\d{4}\)/g,
    // Footnote style
    /\[\^\d+\]/g,
    // DOI patterns
    /doi:\s*10\.\d{4,}\/[-._;()\/:a-zA-Z0-9]+/gi
  ]
  
  for (const pattern of citationPatterns) {
    const matches = content.match(pattern)
    if (matches) {
      matches.forEach(ref => references.add(ref.trim()))
    }
  }
  
  return Array.from(references)
}

/**
 * Extracts URLs from content.
 */
async function extractURLs(content: string): Promise<string[]> {
  const urls: Set<string> = new Set()
  
  // URL pattern
  const urlPattern = /https?:\/\/(?:www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b(?:[-a-zA-Z0-9()@:%_\+.~#?&\/=]*)/gi
  
  const matches = content.match(urlPattern)
  if (matches) {
    matches.forEach(url => urls.add(url))
  }
  
  // Also detect markdown links
  const markdownLinks = /\[([^\]]+)\]\(([^)]+)\)/g
  let match
  while ((match = markdownLinks.exec(content)) !== null) {
    if (match[2].startsWith('http')) {
      urls.add(match[2])
    }
  }
  
  return Array.from(urls)
}

/**
 * Detects citation style used in the content.
 */
async function detectCitationStyle(
  content: string
): Promise<'apa' | 'mla' | 'chicago' | 'ieee' | 'other' | undefined> {
  // Count different citation patterns
  const patterns = {
    apa: /\([A-Z][a-z]+(?:\s+(?:et al\.?|&)\s+[A-Z][a-z]+)*,?\s+\d{4}\)/g,
    mla: /\([A-Z][a-z]+\s+\d+(?:-\d+)?\)/g,
    chicago: /\[\d+\]/g,
    ieee: /\[\d+(?:,\s*\d+)*\]/g
  }
  
  const counts: Record<string, number> = {}
  
  for (const [style, pattern] of Object.entries(patterns)) {
    const matches = content.match(pattern)
    counts[style] = matches ? matches.length : 0
  }
  
  // Find dominant style
  let maxCount = 0
  let dominantStyle: string | undefined
  
  for (const [style, count] of Object.entries(counts)) {
    if (count > maxCount) {
      maxCount = count
      dominantStyle = style
    }
  }
  
  if (maxCount < 2) {
    return undefined // Not enough citations to determine
  }
  
  return dominantStyle as 'apa' | 'mla' | 'chicago' | 'ieee' | 'other'
}

/**
 * Finds cross-references to other chunks or documents.
 */
async function findCrossReferences(content: string): Promise<Array<{
  targetId?: string
  text: string
  type: 'explicit' | 'implicit'
}>> {
  const crossRefs: Array<{
    targetId?: string
    text: string
    type: 'explicit' | 'implicit'
  }> = []
  
  // Explicit cross-references
  const explicitPatterns = [
    /\bsee also:?\s+([^.;\n]+)/gi,
    /\bcompare with:?\s+([^.;\n]+)/gi,
    /\bcontrast with:?\s+([^.;\n]+)/gi,
    /\brelated to:?\s+([^.;\n]+)/gi
  ]
  
  for (const pattern of explicitPatterns) {
    let match
    while ((match = pattern.exec(content)) !== null) {
      crossRefs.push({
        text: match[1].trim(),
        type: 'explicit'
      })
    }
  }
  
  // Implicit cross-references (concepts that might link to other content)
  const implicitPatterns = [
    /\b(?:this relates to|this connects to|similar to|like)\s+([^.;\n]+)/gi,
    /\b(?:as in|as with|following)\s+([^.;\n]+)/gi
  ]
  
  for (const pattern of implicitPatterns) {
    let match
    while ((match = pattern.exec(content)) !== null) {
      crossRefs.push({
        text: match[1].trim(),
        type: 'implicit'
      })
    }
  }
  
  return crossRefs
}

/**
 * Calculates confidence score for reference extraction.
 */
function calculateReferenceConfidence(content: string, totalRefs: number): number {
  let confidence = 0.5 // Base confidence
  
  const wordCount = content.split(/\s+/).length
  
  // Check content length
  if (wordCount < 100) {
    confidence -= 0.2 // Too short for reliable reference detection
  } else if (wordCount > 500) {
    confidence += 0.15 // Good sample size
  }
  
  // Check reference density
  const density = (totalRefs / wordCount) * 100
  if (density > 0.5 && density < 10) {
    confidence += 0.2 // Reasonable reference density
  } else if (density > 10) {
    confidence -= 0.1 // Possibly over-detecting
  }
  
  // Multiple reference types increase confidence
  if (totalRefs > 0) {
    confidence += 0.15
  }
  
  return Math.max(0, Math.min(1, confidence))
}

/**
 * Optional AI-enhanced reference analysis.
 */
export interface AIReferenceAnalysis {
  citationQuality?: 'poor' | 'moderate' | 'good' | 'excellent'
  referenceCompleteness?: number // 0-1
  citationConsistency?: boolean
  missingReferences?: string[]
}