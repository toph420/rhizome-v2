/**
 * AI prompts for enhanced structural pattern detection.
 * Provides clear, specific instructions for structural analysis.
 */

/**
 * Generates a prompt for structural pattern analysis.
 * 
 * @param content - The text content to analyze
 * @returns Formatted prompt for AI analysis
 */
export function generateStructuralPrompt(content: string): string {
  return `Analyze the structural patterns in the following text chunk. Identify:

1. **Template Type**: Does this follow a known document template? (e.g., academic_paper, research_report, project_proposal, medical_note, documentation, technical_design)

2. **Structural Complexity**: Rate as 'simple', 'moderate', or 'complex' based on:
   - Hierarchy depth and organization
   - Variety of structural elements
   - Consistency of patterns

3. **Custom Patterns**: Identify any unique or domain-specific structural patterns not captured by standard detection.

Text to analyze:
"""
${content}
"""

Respond in JSON format:
{
  "templateType": "template_name or null",
  "structuralComplexity": "simple|moderate|complex",
  "customPatterns": [
    {
      "name": "pattern_name",
      "description": "what this pattern represents",
      "confidence": 0.0-1.0
    }
  ],
  "reasoning": "brief explanation of your analysis"
}

Focus on structural organization, not content meaning. Be concise and accurate.`
}

/**
 * Generates a prompt for template classification.
 * 
 * @param content - The text content to classify
 * @param patterns - Already detected patterns
 * @returns Formatted prompt for template detection
 */
export function generateTemplatePrompt(
  content: string,
  patterns: string[]
): string {
  return `Based on the structural patterns detected (${patterns.join(', ')}), classify if this text follows a standard document template.

Common templates include:
- **academic_paper**: Abstract, Introduction, Methods, Results, Discussion, Conclusion
- **research_report**: Executive Summary, Background, Methodology, Findings, Recommendations
- **project_proposal**: Objective, Scope, Deliverables, Timeline, Budget
- **technical_design**: Problem Statement, Solution Overview, Implementation Details, Testing
- **documentation**: Overview, Features, Installation, Usage, API Reference
- **meeting_notes**: Attendees, Agenda, Discussion Points, Action Items
- **tutorial**: Introduction, Prerequisites, Steps, Examples, Summary
- **case_study**: Background, Challenge, Solution, Results, Lessons Learned

Text excerpt:
"""
${content.substring(0, 500)}...
"""

If this matches a template, return the template name. If not, return null.
Consider partial matches and variations. Focus on structural organization rather than content.`
}

/**
 * Generates a prompt for hierarchy depth analysis.
 * 
 * @param content - The text content to analyze
 * @returns Formatted prompt for hierarchy analysis
 */
export function generateHierarchyPrompt(content: string): string {
  return `Analyze the hierarchical structure depth in this text. Consider:

1. Heading levels (H1-H6 or equivalent)
2. Nested list depths
3. Section and subsection organization
4. Indentation patterns

Text to analyze:
"""
${content}
"""

Return a single number representing the maximum hierarchy depth found (1-6).
Consider logical organization even if formatting is inconsistent.`
}

/**
 * Example responses for testing and validation.
 */
export const EXAMPLE_RESPONSES = {
  structural: {
    templateType: 'academic_paper',
    structuralComplexity: 'complex',
    customPatterns: [
      {
        name: 'citation_cluster',
        description: 'Multiple citations grouped together',
        confidence: 0.9
      },
      {
        name: 'theorem_proof',
        description: 'Mathematical theorem followed by proof',
        confidence: 0.85
      }
    ],
    reasoning: 'Clear academic structure with abstract, multiple sections, citations, and formal organization'
  },
  
  template: 'research_report',
  
  hierarchy: 4
}

/**
 * Validates AI response for structural analysis.
 * 
 * @param response - The AI response to validate
 * @returns True if response is valid
 */
export function validateStructuralResponse(response: any): boolean {
  if (!response || typeof response !== 'object') return false
  
  // Check required fields
  if (!('structuralComplexity' in response)) return false
  if (!['simple', 'moderate', 'complex'].includes(response.structuralComplexity)) return false
  
  // Validate custom patterns if present
  if (response.customPatterns) {
    if (!Array.isArray(response.customPatterns)) return false
    
    for (const pattern of response.customPatterns) {
      if (!pattern.name || !pattern.description) return false
      if (typeof pattern.confidence !== 'number') return false
      if (pattern.confidence < 0 || pattern.confidence > 1) return false
    }
  }
  
  return true
}

/**
 * Parses AI response into structured format.
 * 
 * @param response - Raw AI response
 * @returns Parsed structural analysis or undefined
 */
export function parseStructuralResponse(response: string): any {
  try {
    // Try to extract JSON from response
    const jsonMatch = response.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return undefined
    
    const parsed = JSON.parse(jsonMatch[0])
    
    if (validateStructuralResponse(parsed)) {
      return parsed
    }
    
    return undefined
  } catch (error) {
    console.error('Failed to parse structural response:', error)
    return undefined
  }
}