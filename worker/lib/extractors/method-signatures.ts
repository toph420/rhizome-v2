/**
 * Method signatures detector for code analysis.
 * Identifies function/method patterns in code chunks.
 */

import type { MethodMetadata, MethodSignature } from '../../types/metadata'

/**
 * Detects method signatures in code content.
 * Supports JavaScript, TypeScript, Python, and Java.
 * 
 * @param content - The code content to analyze
 * @param aiAnalysis - Optional AI-enhanced signature analysis
 * @returns Method metadata with signatures and patterns
 */
export async function detectMethodSignatures(
  content: string,
  aiAnalysis?: AIMethodAnalysis
): Promise<MethodMetadata | undefined> {
  // Skip if content doesn't look like code
  if (!isLikelyCode(content)) {
    return undefined
  }
  
  const startTime = Date.now()
  
  // Detect programming language
  const languages = detectLanguages(content)
  if (languages.length === 0) {
    return undefined // No code detected
  }
  
  // Extract signatures in parallel for each detected language
  const signaturePromises = languages.map(lang => 
    extractSignaturesForLanguage(content, lang)
  )
  const allSignatures = await Promise.all(signaturePromises)
  const signatures = allSignatures.flat()
  
  // Detect naming conventions
  const conventions = detectNamingConventions(signatures)
  
  // Calculate complexity metrics
  const complexityMetrics = calculateComplexityMetrics(signatures)
  
  // Calculate confidence
  const confidence = calculateMethodConfidence(signatures, content)
  
  // Ensure performance target met (<200ms)
  const elapsed = Date.now() - startTime
  if (elapsed > 200) {
    console.warn(`Method detection took ${elapsed}ms (target: <200ms)`)
  }
  
  return {
    signatures,
    languages,
    namingConvention: conventions,
    complexity: complexityMetrics,
    patterns: [],
    confidence
  }
}

/**
 * Checks if content is likely to be code.
 */
function isLikelyCode(content: string): boolean {
  // Code indicators
  const codeIndicators = [
    /function\s+\w+/,
    /def\s+\w+/,
    /class\s+\w+/,
    /public\s+\w+/,
    /private\s+\w+/,
    /const\s+\w+\s*=/,
    /let\s+\w+\s*=/,
    /var\s+\w+\s*=/,
    /=>\s*{/,
    /\(\)\s*{/,
    /import\s+/,
    /export\s+/,
    /return\s+/
  ]
  
  return codeIndicators.some(pattern => pattern.test(content))
}

/**
 * Detects programming languages in content.
 */
function detectLanguages(content: string): string[] {
  const languages: string[] = []
  
  const languagePatterns: Record<string, RegExp[]> = {
    javascript: [
      /function\s+\w+\s*\([^)]*\)\s*{/,
      /const\s+\w+\s*=\s*(?:async\s*)?\([^)]*\)\s*=>/,
      /\.then\s*\(/,
      /console\.\w+/
    ],
    typescript: [
      /:\s*(?:string|number|boolean|void|any)/,
      /interface\s+\w+/,
      /type\s+\w+\s*=/,
      /export\s+(?:class|interface|type)/
    ],
    python: [
      /def\s+\w+\s*\([^)]*\)\s*:/,
      /class\s+\w+(?:\([^)]*\))?\s*:/,
      /import\s+\w+/,
      /from\s+\w+\s+import/,
      /__init__/
    ],
    java: [
      /public\s+(?:class|interface)\s+\w+/,
      /private\s+\w+\s+\w+\s*(?:\([^)]*\))?/,
      /public\s+static\s+void\s+main/,
      /extends\s+\w+/,
      /implements\s+\w+/
    ]
  }
  
  for (const [lang, patterns] of Object.entries(languagePatterns)) {
    const matchCount = patterns.filter(p => p.test(content)).length
    if (matchCount >= 2 || (matchCount === 1 && content.length < 200)) {
      languages.push(lang)
    }
  }
  
  // If TypeScript detected, also include JavaScript
  if (languages.includes('typescript') && !languages.includes('javascript')) {
    languages.push('javascript')
  }
  
  return languages
}

/**
 * Extracts method signatures for a specific language.
 */
async function extractSignaturesForLanguage(
  content: string,
  language: string
): Promise<MethodSignature[]> {
  const signatures: MethodSignature[] = []
  
  const patterns: Record<string, RegExp> = {
    // JavaScript/TypeScript functions
    javascript: /(?:async\s+)?function\s+(\w+)\s*\(([^)]*)\)(?:\s*:\s*([^{]+))?\s*{/g,
    // Arrow functions
    arrow: /(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s*)?\(([^)]*)\)\s*(?::\s*([^=]+))?\s*=>/g,
    // Class methods
    method: /(?:async\s+)?(\w+)\s*\(([^)]*)\)(?:\s*:\s*([^{]+))?\s*{/g,
    // Python functions
    python: /def\s+(\w+)\s*\(([^)]*)\)(?:\s*->\s*([^:]+))?\s*:/g,
    // Java methods
    java: /(?:public|private|protected)?\s*(?:static\s+)?(\w+)\s+(\w+)\s*\(([^)]*)\)/g
  }
  
  // Select appropriate patterns based on language
  let selectedPatterns: RegExp[] = []
  if (language === 'javascript' || language === 'typescript') {
    selectedPatterns = [patterns.javascript, patterns.arrow, patterns.method]
  } else if (language === 'python') {
    selectedPatterns = [patterns.python]
  } else if (language === 'java') {
    selectedPatterns = [patterns.java]
  }
  
  // Extract signatures
  for (const pattern of selectedPatterns) {
    const matches = content.matchAll(pattern)
    for (const match of matches) {
      const name = match[1]
      const params = match[2] || match[3] || ''
      const returnType = match[3] || match[4] || undefined
      
      // Parse parameters
      const parameters = parseParameters(params, language)
      
      // Calculate complexity
      const complexity = calculateMethodComplexity(content, name)
      
      signatures.push({
        name,
        paramCount: parameters.length,
        returnType,
        visibility: detectVisibility(content, name),
        isAsync: /async/.test(match[0])
      })
    }
  }
  
  return signatures
}

/**
 * Parses parameter string into structured format.
 */
function parseParameters(params: string, language: string): string[] {
  if (!params.trim()) return []
  
  // Split by comma, handling nested parentheses
  const parameters: string[] = []
  let current = ''
  let depth = 0
  
  for (const char of params) {
    if (char === '(' || char === '[' || char === '{') depth++
    if (char === ')' || char === ']' || char === '}') depth--
    
    if (char === ',' && depth === 0) {
      parameters.push(current.trim())
      current = ''
    } else {
      current += char
    }
  }
  
  if (current.trim()) {
    parameters.push(current.trim())
  }
  
  return parameters
}

/**
 * Detects method visibility.
 */
function detectVisibility(content: string, methodName: string): 'public' | 'private' | 'protected' {
  const lines = content.split('\n')
  for (const line of lines) {
    if (line.includes(methodName)) {
      if (/\bpublic\b/.test(line)) return 'public'
      if (/\bprivate\b/.test(line)) return 'private'
      if (/\bprotected\b/.test(line)) return 'protected'
    }
  }
  return 'public' // Default to public
}

/**
 * Calculates method complexity (simplified cyclomatic complexity).
 */
function calculateMethodComplexity(content: string, methodName: string): number {
  // Find method body (simplified)
  const methodStart = content.indexOf(methodName)
  if (methodStart === -1) return 1
  
  // Extract approximate method body
  const methodContent = content.substring(methodStart, methodStart + 500)
  
  // Count complexity indicators
  let complexity = 1 // Base complexity
  
  // Decision points
  complexity += (methodContent.match(/\bif\b/g) || []).length
  complexity += (methodContent.match(/\belse\b/g) || []).length
  complexity += (methodContent.match(/\bfor\b/g) || []).length
  complexity += (methodContent.match(/\bwhile\b/g) || []).length
  complexity += (methodContent.match(/\bcase\b/g) || []).length
  complexity += (methodContent.match(/\bcatch\b/g) || []).length
  complexity += (methodContent.match(/\?/g) || []).length // Ternary operators
  
  return complexity
}

/**
 * Detects naming conventions used.
 */
function detectNamingConventions(signatures: MethodSignature[]): MethodMetadata['namingConvention'] {
  const conventionCounts = new Map<string, number>()
  
  for (const sig of signatures) {
    const name = sig.name
    
    // camelCase
    if (/^[a-z][a-zA-Z0-9]*$/.test(name)) {
      conventionCounts.set('camelCase', (conventionCounts.get('camelCase') || 0) + 1)
    }
    // PascalCase
    else if (/^[A-Z][a-zA-Z0-9]*$/.test(name)) {
      conventionCounts.set('PascalCase', (conventionCounts.get('PascalCase') || 0) + 1)
    }
    // snake_case
    else if (/^[a-z]+(_[a-z]+)*$/.test(name)) {
      conventionCounts.set('snake_case', (conventionCounts.get('snake_case') || 0) + 1)
    }
    // kebab-case
    else if (/^[a-z]+(-[a-z]+)*$/.test(name)) {
      conventionCounts.set('kebab-case', (conventionCounts.get('kebab-case') || 0) + 1)
    }
  }
  
  // If no conventions detected or mixed, return 'mixed'
  if (conventionCounts.size === 0) {
    return 'mixed'
  }
  
  if (conventionCounts.size > 1) {
    return 'mixed'
  }
  
  // Return the dominant convention
  const dominant = Array.from(conventionCounts.entries()).sort((a, b) => b[1] - a[1])[0]
  return dominant?.[0] as MethodMetadata['namingConvention'] || 'mixed'
}

/**
 * Calculates complexity metrics for all signatures.
 */
function calculateComplexityMetrics(signatures: MethodSignature[]): MethodMetadata['complexity'] {
  if (signatures.length === 0) {
    return { cyclomaticAvg: 0, nestingMax: 0, parametersAvg: 0 }
  }
  
  // For now, use paramCount as a proxy for complexity
  // In a real implementation, we'd calculate cyclomatic complexity
  const complexities = signatures.map(s => s.paramCount + 1)
  
  return {
    cyclomaticAvg: complexities.reduce((a, b) => a + b, 0) / complexities.length,
    nestingMax: Math.max(...complexities),
    parametersAvg: signatures.reduce((sum, s) => sum + s.paramCount, 0) / signatures.length
  }
}

/**
 * Calculates confidence in method detection.
 */
function calculateMethodConfidence(
  signatures: MethodSignature[],
  _content: string
): number {
  let confidence = 0.5 // Base confidence
  
  // No signatures found
  if (signatures.length === 0) {
    return 0.2
  }
  
  // Adjust based on signature count
  if (signatures.length > 2) confidence += 0.2
  if (signatures.length > 5) confidence += 0.1
  
  // Check for consistent patterns
  const hasConsistentNaming = signatures.every(s => 
    /^[a-z][a-zA-Z0-9]*$/.test(s.name) || // camelCase
    /^[A-Z][a-zA-Z0-9]*$/.test(s.name)    // PascalCase
  )
  if (hasConsistentNaming) confidence += 0.1
  
  // Check for parameter types (indicates TypeScript/Java)
  const hasTypes = signatures.some(s => s.returnType !== undefined)
  if (hasTypes) confidence += 0.1
  
  return Math.min(1, confidence)
}

/**
 * Optional AI-enhanced method analysis.
 */
export interface AIMethodAnalysis {
  signatures?: MethodSignature[]
  designPatterns?: string[]
  codeQuality?: 'high' | 'medium' | 'low'
}