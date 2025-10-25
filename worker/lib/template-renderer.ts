/**
 * Render prompt template with variable substitution
 *
 * Pattern: Simple mustache-style {{variable}} replacement
 * Supports all variables defined in template.variables array
 */

/**
 * Render template with variable substitution
 * @param template - Template string with {{variable}} placeholders
 * @param variables - Object with variable values
 * @returns Rendered template with variables substituted
 *
 * @example
 * ```typescript
 * const template = "Generate {{count}} cards from {{content}}"
 * const rendered = renderTemplate(template, {
 *   count: "5",
 *   content: "This is the content..."
 * })
 * // Returns: "Generate 5 cards from This is the content..."
 * ```
 */
export function renderTemplate(
  template: string,
  variables: Record<string, string>
): string {
  let rendered = template

  // Replace each {{variable}} with its value
  for (const [key, value] of Object.entries(variables)) {
    const pattern = new RegExp(`\\{\\{${key}\\}\\}`, 'g')
    rendered = rendered.replace(pattern, value)
  }

  return rendered
}

/**
 * Validate that template contains all required variables
 */
export function validateTemplateVariables(
  template: string,
  requiredVariables: string[]
): { valid: boolean; missing: string[] } {
  const missing: string[] = []

  for (const variable of requiredVariables) {
    const pattern = new RegExp(`\\{\\{${variable}\\}\\}`)
    if (!pattern.test(template)) {
      missing.push(variable)
    }
  }

  return {
    valid: missing.length === 0,
    missing
  }
}

/**
 * Extract all variable placeholders from template
 * @param template - Template string
 * @returns Array of variable names found in template
 */
export function extractTemplateVariables(template: string): string[] {
  const pattern = /\{\{(\w+)\}\}/g
  const variables = new Set<string>()

  let match
  while ((match = pattern.exec(template)) !== null) {
    variables.add(match[1])
  }

  return Array.from(variables)
}
