/**
 * Version: 1.0 (Baseline)
 * Description: Current prompt for Gemini thematic bridge detection
 * Author: Original implementation
 * Date: 2025-01-15
 */

export function buildPrompt(
  sourceChunk: any,
  candidates: any[],
  sourceDomain: string,
  minStrength: number
): string {
  return `Analyze thematic bridges between these chunk pairs. Return JSON array with:
{
  "bridges": [
    {
      "targetIndex": 0,
      "bridgeType": "conceptual" | "causal" | "temporal" | "argumentative" | "metaphorical" | "contextual",
      "strength": 0.0-1.0,
      "explanation": "Brief explanation of the bridge",
      "bridgeConcepts": ["concept1", "concept2"]
    }
  ]
}

CRITICAL INSTRUCTION: In your explanation, reference chunks by their summary as if they are titles.
Instead of "This chunk discusses..." or "The source chunk explores...", use natural references like:
- "In 'Foucault's disciplinary power analysis', the author explores..."
- "The concept of surveillance in 'Panopticon as social control' connects to..."

SOURCE CHUNK (${sourceDomain}):
Title/Summary: ${sourceChunk.summary || 'Untitled chunk'}
Content preview: ${sourceChunk.content.substring(0, 200)}

CANDIDATES:
${candidates.map((c, idx) => `[${idx}] (${c.domain_metadata?.primaryDomain})
Title/Summary: ${c.summary || 'Untitled chunk'}
Content preview: ${c.content.substring(0, 200)}`).join('\n\n')}

Only include bridges with strength > ${minStrength}. Be selective.
Remember: Reference chunks by their summary/title in explanations.`
}
