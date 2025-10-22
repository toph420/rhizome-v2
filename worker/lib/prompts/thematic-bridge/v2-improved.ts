/**
 * Version: 2.0 (Improved)
 * Description: Intelligent truncation, strength calibration, concise explanations
 * Author: Developer feedback implementation
 * Date: 2025-01-21
 */

// Intelligent sentence-boundary truncation
function truncateToSentence(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text
  const truncated = text.substring(0, maxChars)
  const lastPeriod = truncated.lastIndexOf('.')
  const lastQuestion = truncated.lastIndexOf('?')
  const lastExclaim = truncated.lastIndexOf('!')
  const lastSentenceEnd = Math.max(lastPeriod, lastQuestion, lastExclaim)
  return lastSentenceEnd > maxChars * 0.7
    ? truncated.substring(0, lastSentenceEnd + 1)
    : truncated + '...'
}

export function buildPrompt(
  sourceChunk: any,
  candidates: any[],
  sourceDomain: string,
  minStrength: number
): string {
  return `Identify thematic bridges between ideas from different domains.

A thematic bridge exists when:
1. Chunks from DIFFERENT domains address the same underlying concept
2. The connection reveals a non-obvious pattern or insight
3. Reading one chunk would genuinely enrich understanding of the other

NOT a bridge:
- Same domain (skip these)
- Surface-level similarity everyone would notice
- Common concepts with no deeper resonance (e.g., "both mention time")

SOURCE (${sourceDomain}):
${sourceChunk.summary || 'No summary'}
${truncateToSentence(sourceChunk.content, 400)}

CANDIDATES:
${candidates.map((c, idx) => {
  const domain = c.domain_metadata?.primaryDomain || 'unknown'
  return `[${idx}] ${domain}
${c.summary || 'No summary'}
${truncateToSentence(c.content, 300)}`
}).join('\n\n')}

STRENGTH CALIBRATION:
- 0.9-1.0: Profound insight, unexpected domains, concept appears central to both
- 0.7-0.8: Clear resonance, concept important to both, enriches understanding
- 0.5-0.6: Interesting connection, concept somewhat peripheral
- <0.5: Skip entirely

ONLY include bridges where:
- strength ≥ ${minStrength}
- domains are actually different
- connection is non-obvious to a reader

EXPLANATION GUIDELINES:
- Reference summaries as titles: "In 'Frankfurt cases show moral responsibility...', the author..."
- State the bridge concept clearly: "Both explore X through Y lens"
- Keep under 150 chars - be precise, not exhaustive
- NO generic phrases: "This chunk discusses", "The source explores", "Interestingly"

BRIDGE TYPES:
- conceptual: Same abstract idea in different contexts (e.g., "emergence" in physics and sociology)
- causal: Similar causal mechanisms (e.g., "feedback loops" in biology and economics)
- metaphorical: One domain metaphorically illuminates the other
- argumentative: Similar logical structures or rhetorical moves
- temporal: Different domains showing similar patterns over time
- contextual: Historical/cultural contexts that illuminate each other

OUTPUT (JSON only, no markdown):
{
  "bridges": [
    {
      "targetIndex": 0,
      "bridgeType": "conceptual",
      "strength": 0.75,
      "explanation": "Both explore power through surveillance - panopticon design vs social media algorithms",
      "bridgeConcepts": ["surveillance", "distributed control"]
    }
  ]
}

Return empty array if no bridges meet criteria. No explanatory text.`
}
